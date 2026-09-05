-- =========================================================
-- 슬러그 최소 길이 완화: 3~30자 -> 1~20자
--
-- 요청: 1자 슬러그도 허용(예: imory.me/a). 기존 3자 하한이 과했다는
-- 피드백. 상한도 30 -> 20으로 낮춘다(공개 URL이 과도하게 길어지지
-- 않도록 — 닉네임(30자 상한)과는 별개 값).
--
-- 변경 대상:
--   1. public.profiles의 profiles_slug_length CHECK 제약
--      ([[20260830132600_create_profiles_app_config_home_customize.sql]]).
--   2. public.complete_onboarding()의 슬러그 길이 검증
--      ([[20260903200000_fix_onboarding_profile_check_order.sql]]이
--      최신 버전 — 시그니처 동일하므로 CREATE OR REPLACE로 충분,
--      이 마이그레이션이 바꾸는 부분은 슬러그 길이 검증 두 줄뿐이고
--      나머지 로직은 그대로 옮겨온다).
--
-- 형식 정규식(^[a-z0-9]+(-[a-z0-9]+)*$)과 예약어 체크는 그대로이며,
-- 둘 다 원래부터 1자 슬러그를 허용하는 형태였다(onboarding/onboarding.js
-- SLUG_FORMAT과 동일 — 클라이언트도 이 마이그레이션과 함께 1~20자로
-- 맞춘다).
--
-- 상한을 30 -> 20으로 낮추므로, 이미 21~30자 슬러그로 가입한 기존
-- 회원이 있다면 일반 CHECK 제약 추가는 그 자리에서 기존 데이터
-- 검증에 실패해 마이그레이션 자체가 실패한다(슬러그는 온보딩 이후
-- 수정 불가능하므로 기존 회원에게 되돌려 맞추게 할 방법이 없음).
-- NOT VALID로 추가해 기존 row는 그대로 두고, 이후 INSERT/UPDATE에만
-- 적용한다.
-- =========================================================

alter table public.profiles
  drop constraint profiles_slug_length;

alter table public.profiles
  add constraint profiles_slug_length check (char_length(slug) between 1 and 20) not valid;


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

  -- 슬러그 하한/상한 완화: 3~30 -> 1~20 (이 마이그레이션의 변경 지점)
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(v_slug) < 1
     or char_length(v_slug) > 20 then
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
  '온보딩 완료: 닉네임/슬러그 설정 + profile/home_customize 생성. profile 존재 체크가 invite 소비 블록보다 먼저 실행되므로, 이미 온보딩을 완료한 사용자의 재호출은 invite uses_count/invite_link_uses에 어떤 변경도 남기지 않고 즉시 ''profile already exists''로 거절된다. is_signup_open()이 true면 정상 흐름(p_invite_token 무시, 소비 없음). false면 p_invite_token이 활성/미소진/미만료 invite_links row와 원자적으로 일치해야만 진행(UPDATE...WHERE uses_count<max_uses가 동시성 가드) — 성공 시 uses_count 증가 + invite_link_uses에 감사 로그 insert, 실패 시 전체 롤백. 슬러그 길이 하한/상한은 1~20자([[20260906100000_allow_short_slug.sql]]). 그 외 검증/구조는 기존과 동일.';
