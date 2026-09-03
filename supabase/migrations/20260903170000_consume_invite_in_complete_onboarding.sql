-- =========================================================
-- INVITES — 3단계: complete_onboarding()에서 초대 토큰 원자적 검증+소비
--
-- [[20260903160000_gate_new_account_on_invite_capacity.sql]]에서 Hook이
-- "활성 초대가 있으면" auth.users 생성까지는 통과시키지만, "이 사용자가
-- 실제로 유효한 토큰을 들고 왔는지"는 전혀 검증하지 않았다(Hook은
-- 원리상 검증할 수 없음). 그 최종 검증과 실제 사용 횟수 소비를 여기
-- complete_onboarding()에서 수행한다 — 정책 그대로 "정상 가입이
-- 완료된 시점에만 사용 횟수를 소비".
--
-- 정책:
--   - is_signup_open() = true (정상 가입 기간): p_invite_token은 완전히
--     무시한다. 소비하지 않는다. 초대는 "닫힌 기간의 예외 수단"일
--     뿐이므로, 열린 기간에는 아예 관여하지 않는다.
--   - is_signup_open() = false: p_invite_token이 반드시 있어야 하고,
--     invite_links에서 활성/미소진/미만료 상태로 원자적으로 1회
--     소비한다. 실패하면 'signup closed' 또는 'invalid invite'로 거절.
--
-- 원자성/동시성(요구사항 그대로): 아래 UPDATE ... WHERE uses_count <
-- max_uses ... RETURNING이 핵심이다. 이 한 문장이 실행되는 동안
-- Postgres가 해당 row에 자동으로 잠금을 걸므로, 마지막 1자리를 두고
-- 동시에 두 요청이 들어와도 반드시 하나가 먼저 커밋되고 나머지
-- 하나는 이미 갱신된 uses_count를 보고 조건 불일치로 0 row를
-- 얻는다 — 별도 SELECT ... FOR UPDATE나 advisory lock 없이 이
-- UPDATE 문 자체가 원자적 소비를 보장한다. max_uses가 5인 링크가
-- 6번 소비되는 상황은 발생할 수 없다.
--
-- 트랜잭션/롤백: 이 함수는 기존과 동일하게 별도 BEGIN/COMMIT 없이
-- 단일 함수 호출 자체가 하나의 트랜잭션이다([[20260903110000_recheck_signup_period_in_complete_onboarding.sql]]
-- 참고). 그래서 invite_links UPDATE와 invite_link_uses INSERT를 함수
-- 맨 앞(닉네임/슬러그 검증보다 먼저)에서 실행해도, 뒤에서 어떤
-- 이유로든(slug 중복, 형식 오류, profile 이미 존재 등) 예외가 나면
-- uses_count 증가와 로그 insert까지 전부 롤백된다 — "성공적으로
-- 완료된 온보딩만 사용 횟수를 소비" 불변식이 자동으로 지켜진다.
--
-- 시그니처가 3개 인자 → 4개 인자(p_invite_token 추가, default null)로
-- 바뀌므로, get_signup_availability()와 동일한 이유로 CREATE OR
-- REPLACE 대신 기존 3-인자 함수를 명시적으로 DROP한 뒤 새로
-- 만든다 — 안 그러면 onboarding.js가 기존처럼 3개 인자로 호출할 때
-- PostgREST가 옛 3-인자 오버로드를 계속 골라 쓰게 된다.
--
-- search_path: 이 함수는 애초부터(2026-08-31 이후) 다른 SECURITY
-- DEFINER 함수들과 달리 SET search_path TO 'public'(빈 문자열이
-- 아님)으로 정의되어 있었다 — 기존 관례를 그대로 유지하고 굳이
-- 바꾸지 않는다(동작 변경 최소화). pg_catalog 소속 함수(sha256 등)는
-- search_path 값과 무관하게 항상 먼저 검색되므로 영향 없음. 새로
-- 추가한 참조(invite_links/invite_link_uses)도 defensive하게
-- public. 접두사를 그대로 붙인다.
-- =========================================================

drop function if exists public.complete_onboarding(text, text, text);

create or replace function public.complete_onboarding(
  p_nickname text,
  p_slug text,
  p_bio text default null,
  p_invite_token text default null
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(trim(p_slug));
  v_nickname text := trim(p_nickname);
  v_invite_id uuid;
  v_invite_hash text;

  -- 이 배열을 바꿀 때는 core/lib/reserved-slugs.js도 반드시 같이 바꿀 것
  v_reserved text[] := array[
    'admin',
    'auth',
    'onboarding',
    'home',
    'posts',
    'customize',
    'themes',
    'core',
    'images',
    'models',
    'api',
    'www',
    'post',
    'category',
    'categories',
    'settings',
    'login',
    'logout',
    'signup',
    'signin',
    'account',
    'profile',
    'profiles',
    'assets',
    'static',
    'help',
    'support',
    'terms',
    'privacy',
    'about',
    'search',
    'dashboard',
    'editor',
    'write'
  ];

begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- 2차 방어(기존): 가입 기간 서버 시각 기준 재검사.
  if public.is_signup_open() then

    -- 정상 가입 기간: 초대 토큰은 완전히 무시한다(소비하지 않음).
    null;

  else

    -- 가입 기간이 닫혀 있을 때만 초대 토큰으로 예외를 허용한다.
    if p_invite_token is null or char_length(p_invite_token) = 0 then
      raise exception 'signup closed';
    end if;

    v_invite_hash := encode(sha256(p_invite_token::bytea), 'hex');

    -- 원자적 검증 + 소비. WHERE 절의 세 조건(활성/미소진/미만료)을
    -- 전부 만족하는 row가 없으면 0 row가 갱신되고 v_invite_id는
    -- NULL로 남는다 — 그 경우를 아래에서 명시적으로 거절한다.
    update public.invite_links
      set uses_count = uses_count + 1
      where token_hash = v_invite_hash
        and is_active
        and uses_count < max_uses
        and expires_at > now()
      returning id into v_invite_id;

    if v_invite_id is null then
      raise exception 'invalid invite';
    end if;

    insert into public.invite_link_uses (invite_link_id, user_id)
    values (v_invite_id, v_uid);

  end if;

  if exists (
    select 1
    from public.profiles
    where user_id = v_uid
  ) then
    raise exception 'profile already exists';
  end if;

  if v_nickname is null
     or char_length(v_nickname) < 1
     or char_length(v_nickname) > 30 then
    raise exception 'invalid nickname';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(v_slug) < 3
     or char_length(v_slug) > 30 then
    raise exception 'invalid slug format';
  end if;

  if v_slug = any(v_reserved) then
    raise exception 'reserved slug';
  end if;

  insert into public.profiles (
    user_id,
    nickname,
    slug,
    bio,
    home_mode,
    onboarding_completed,
    terms_agreed_at
  )
  values (
    v_uid,
    v_nickname,
    v_slug,
    nullif(trim(p_bio), ''),
    'customize',
    true,
    now()
  );

  insert into public.home_customize (
    user_id,
    layout_json
  )
  values (
    v_uid,
    $json$
{
  "version": 3,
  "theme": {
    "background": "#ffffff",
    "textColor": "#1a1a1a",
    "point": "#5c7cfa",
    "font": "system",
    "backgroundImage": {
      "src": "",
      "opacity": 100,
      "fit": "cover"
    },
    "backgroundPattern": {
      "type": "none",
      "color": "",
      "opacity": 100,
      "size": 24
    }
  },
  "contentArea": {
    "paddingY": 24,
    "paddingX": 16,
    "maxWidth": 600,
    "align": "center",
    "fitViewport": false,
    "verticalAlign": "start"
  },
  "blocks": [
    {
      "id": "8f14e45f-ceea-467e-add1-0000000000c1",
      "type": "container",
      "props": {
        "direction": "column",
        "align": "stretch",
        "gap": 16,
        "padding": 0,
        "maxWidth": "",
        "background": "",
        "borderWidth": 0,
        "borderColor": "",
        "borderStyle": "solid",
        "borderRadius": 0,
        "backgroundOpacity": 100
      },
      "children": [
        {
          "id": "8f14e45f-ceea-467e-add1-0000000000c2",
          "type": "image",
          "props": {
            "src": "",
            "alt": "cover image",
            "width": "",
            "height": "",
            "maxWidth": "",
            "align": "center",
            "objectFit": "cover",
            "action": {
              "type": "none",
              "href": "",
              "targetPageId": "profile"
            }
          }
        },
        {
          "id": "8f14e45f-ceea-467e-add1-0000000000c3",
          "type": "text",
          "props": {
            "content": "이름을 입력하세요",
            "fontSize": 22,
            "color": "",
            "fontWeight": 400,
            "align": "center",
            "letterSpacing": 0,
            "lineHeight": 1.5,
            "action": {
              "type": "none",
              "href": "",
              "targetPageId": "profile"
            }
          }
        },
        {
          "id": "8f14e45f-ceea-467e-add1-0000000000c4",
          "type": "text",
          "props": {
            "content": "한 줄 소개를 입력하세요",
            "fontSize": 14,
            "color": "",
            "fontWeight": 400,
            "align": "center",
            "letterSpacing": 0,
            "lineHeight": 1.5,
            "action": {
              "type": "none",
              "href": "",
              "targetPageId": "profile"
            }
          }
        },
        {
          "id": "8f14e45f-ceea-467e-add1-0000000000c5",
          "type": "button",
          "props": {
            "variant": "action",
            "label": "more",
            "action": {
              "type": "internal",
              "href": "",
              "targetPageId": "profile"
            }
          }
        }
      ]
    },
    {
      "id": "8f14e45f-ceea-467e-add1-0000000000c6",
      "type": "divider",
      "props": {
        "style": "solid",
        "thickness": 1,
        "color": "",
        "widthPercent": 100
      }
    },
    {
      "id": "8f14e45f-ceea-467e-add1-0000000000c7",
      "type": "spacer",
      "props": {
        "height": 24
      }
    }
  ]
}
$json$::jsonb
  );

end;
$function$
;

comment on function public.complete_onboarding(text, text, text, text) is
  '온보딩 완료: 닉네임/슬러그 설정 + profile/home_customize 생성. is_signup_open()이 true면 정상 흐름(p_invite_token 무시, 소비 없음). false면 p_invite_token이 활성/미소진/미만료 invite_links row와 원자적으로 일치해야만 진행(UPDATE...WHERE uses_count<max_uses가 동시성 가드) — 성공 시 uses_count 증가 + invite_link_uses에 감사 로그 insert, 실패 시 전체 롤백. 그 외 검증/구조는 기존과 동일.';

-- DROP FUNCTION은 이전 함수 object에 걸려 있던 권한도 함께 지운다.
-- 기존 3-인자 complete_onboarding()은 지금까지 이 migration 계열
-- 파일 어디에서도 명시적 REVOKE/GRANT를 받은 적이 없어(Postgres
-- 기본값인 PUBLIC EXECUTE에 의존, onboarding.js가 authenticated로
-- 문제없이 호출해 왔음) drop 전 실제 권한 상태를 여기서 확정적으로
-- 알 수 없다. 이 프로젝트의 "암묵적 기본값에 의존하지 않고 항상
-- 명시적으로"라는 관례([[20260903130000_add_admin_users_operator_foundation.sql]]
-- private 스키마 주석 참고)를 따라, drop+recreate 이후 상태를
-- 추측에 맡기지 않고 명시적으로 확정한다. anon도 포함하는 이유는
-- 기존과 동일 — 세션이 없으면 auth.uid()가 NULL이라 맨 앞의
-- 'not authenticated' 예외로 즉시 거절되므로 anon 허용이 추가
-- 위험을 만들지 않는다.
revoke execute on function public.complete_onboarding(text, text, text, text) from public;
grant execute on function public.complete_onboarding(text, text, text, text) to anon, authenticated;
