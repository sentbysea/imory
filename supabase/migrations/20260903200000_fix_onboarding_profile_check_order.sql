-- =========================================================
-- INVITES — M1 수정: complete_onboarding() profile 존재 체크 순서
--
-- 문제([[20260903170000_consume_invite_in_complete_onboarding.sql]]):
-- 'profile already exists' 체크가 invite 토큰 원자적 검증+소비 블록
-- *뒤에* 있었다. 그래서 이미 온보딩을 완료한 사용자가 (실수든 재시도든)
-- complete_onboarding()을 다시 호출하면:
--   - 같은 초대 링크로 다시 호출 → invite_link_uses의
--     unique(invite_link_id, user_id) 위반(23505)이 'profile already
--     exists'보다 먼저 발생 — 사용자/클라이언트에 잘못된 에러가 노출됨.
--   - 다른 초대 링크로 호출 → uses_count가 실제로 증가하고
--     invite_link_uses에 새 row가 남은 뒤에야 'profile already exists'로
--     막힘 — 최종적으로 온보딩은 실패했는데 초대 사용 횟수만 소비되는
--     불변식 위반("성공적으로 완료된 온보딩만 사용 횟수를 소비"가 깨짐).
--
-- 수정: profile 존재 체크를 인증 체크(not authenticated) 바로 다음,
-- is_signup_open()/invite 소비 블록보다 앞으로 옮긴다. 함수 전체가
-- 하나의 트랜잭션이므로 이 체크에서 예외가 나면 뒤의 invite UPDATE/
-- INSERT 자체가 실행되지 않아 uses_count/invite_link_uses에 어떤
-- 흔적도 남지 않는다.
--
-- 시그니처(text, text, text, text)는 그대로이므로 DROP 없이 CREATE OR
-- REPLACE로 충분하다 — 기존 GRANT(anon, authenticated에 EXECUTE)도
-- 그대로 유지된다.
-- =========================================================

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

  -- M1 수정: invite 소비 블록보다 먼저 체크한다 — 이미 온보딩을 마친
  -- 사용자의 재호출은 여기서 즉시 막혀야 하고, 그 뒤의 invite UPDATE/
  -- INSERT가 아예 실행되지 않아야 한다(uses_count/invite_link_uses에
  -- 어떤 변경도 남지 않음).
  if exists (
    select 1
    from public.profiles
    where user_id = v_uid
  ) then
    raise exception 'profile already exists';
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
  '온보딩 완료: 닉네임/슬러그 설정 + profile/home_customize 생성. profile 존재 체크가 invite 소비 블록보다 먼저 실행되므로(M1 수정), 이미 온보딩을 완료한 사용자의 재호출은 invite uses_count/invite_link_uses에 어떤 변경도 남기지 않고 즉시 ''profile already exists''로 거절된다. is_signup_open()이 true면 정상 흐름(p_invite_token 무시, 소비 없음). false면 p_invite_token이 활성/미소진/미만료 invite_links row와 원자적으로 일치해야만 진행(UPDATE...WHERE uses_count<max_uses가 동시성 가드) — 성공 시 uses_count 증가 + invite_link_uses에 감사 로그 insert, 실패 시 전체 롤백. 그 외 검증/구조는 기존과 동일.';
