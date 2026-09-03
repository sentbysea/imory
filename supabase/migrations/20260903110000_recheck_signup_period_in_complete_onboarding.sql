-- =========================================================
-- SIGNUP PERIOD GUARD — 2차 방어 (complete_onboarding 재검사)
--
-- [[20260903100000_add_signup_period_guard_hook.sql]]에서 만든
-- public.is_signup_open()을 이번엔 complete_onboarding() RPC 안에서
-- 그대로 재사용해 최종 재검사한다(3중 방어 중 C단계).
--
-- 배경: Before User Created Hook(1차 방어)은 auth.users row 생성
-- 시점만 막는다. 그런데 다음과 같은 경로로는 auth.users가 이미
-- 존재하는 상태에서 onboarding 화면까지 도달할 수 있다.
--   - Hook 배포 전/우회 등으로 hook이 실제로 걸리지 않은 경우
--   - onboarding URL 직접 접근(예: 가입 링크를 북마크/공유)
--   - onboarding 탭을 오래 열어둔 채 방치
--   - signup이 열려 있을 때 onboarding에 진입했다가, 실제 제출
--     버튼을 누르는 순간에는 signup이 이미 닫힌 경우
-- 이런 경우들은 모두 "auth.users는 있지만 아직 profiles가 없는"
-- 상태로 complete_onboarding()에 도달하므로, 이 함수 내부에서
-- signup 기간을 다시 검사하지 않으면 Hook을 우회해 profile/
-- home_customize가 생성될 수 있다.
--
-- 재검사 위치: 함수 맨 앞, auth.uid() null 체크 다음 — 나머지
-- 검사(profile 중복/nickname/slug validation)나 insert들은 전혀
-- 건드리지 않고 그 앞에 한 줄만 추가한다. is_signup_open()이
-- false를 반환하면 'signup closed'로 즉시 예외를 던지므로, 이후의
-- profiles/home_customize insert 두 문장은 실행조차 되지 않는다.
-- 원래도 이 함수는 별도 BEGIN/COMMIT 없이 단일 함수 호출 자체가
-- 하나의 트랜잭션으로 실행되므로(Postgres 함수 기본 동작), 예외가
-- 발생하면 그 호출에서 이미 실행됐을 수 있는 부분 변경도 전부
-- 롤백된다 — profile만 생성되고 home_customize는 없는 반쪽 상태는
-- 나오지 않는다(기존 트랜잭션 특성 그대로 유지, 새로 추가한 것 없음).
--
-- is_signup_open() 재사용: 브라우저/클라이언트 시각을 전혀 쓰지
-- 않고 Postgres 서버 시각(now())만 쓰는 판정 함수를 그대로 다시
-- 호출한다 — Hook과 동일한 기준으로 판정되므로 "Hook 기준으로는
-- 열려 있었는데 RPC 기준으로는 다르게 판단"되는 불일치가 없다.
--
-- 에러 문자열: Hook과 동일하게 'signup closed'로 고정한다(신규
-- 안내 문구를 노출하지 않고 짧고 안정적인 식별자만 던짐).
-- onboarding/onboarding.js의 mapOnboardingError()가 이 문자열을
-- "현재 회원가입 기간이 아닙니다."로 매핑한다(별도 커밋에서 함께
-- 반영, 이 migration에는 SQL만 포함).
--
-- 권한/구조: 이 함수는 여전히 SECURITY DEFINER + SET search_path
-- (owner 권한으로 실행)이므로, PUBLIC EXECUTE가 전부 revoke된
-- is_signup_open()도 별도 grant 없이 그대로 호출 가능하다(Hook과
-- 동일한 owner-권한 상속 구조, [[20260903100000_add_signup_period_guard_hook.sql]]
-- 주석 참고). SECURITY DEFINER 여부/search_path/auth.uid() 사용/
-- profile 중복 검사/reserved slug 검사/nickname·slug validation/
-- profiles insert/home_customize insert 구조는 전부 기존 그대로
-- 유지하고, signup 기간 재검사 한 줄만 추가한다.
--
-- 영향 범위: 기존 사용자 로그인, 공개 홈(/:slug), auth-callback.js는
-- 이 함수를 호출하지 않으므로 전혀 영향받지 않는다. 이 변경은
-- complete_onboarding() 호출 경로(onboarding 제출)에만 적용된다.
-- =========================================================

CREATE OR REPLACE FUNCTION public.complete_onboarding(p_nickname text, p_slug text, p_bio text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(trim(p_slug));
  v_nickname text := trim(p_nickname);

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

  -- 2차 방어(C단계): Hook 우회/직접 접근/오래 열어둔 탭/제출 직전
  -- 마감 등 모든 경로에 대해 서버 시각 기준으로 최종 재검사.
  if not public.is_signup_open() then
    raise exception 'signup closed';
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
