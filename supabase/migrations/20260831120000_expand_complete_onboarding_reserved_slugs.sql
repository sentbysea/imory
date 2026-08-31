-- =========================================================
-- EXPAND complete_onboarding() RESERVED SLUGS
--
-- 공개 홈 주소가 /:slug 경로형으로 바뀌면서 겹치면 안 되는
-- 경로가 늘어나 예약어를 보강한다(core/lib/reserved-slugs.js와
-- 반드시 동일하게 유지 — 단일 소스가 구조적으로 불가능한 이유는
-- 이 저장소에 빌드 스텝이 없어서 JS 배열을 SQL로 자동 반영할
-- 수 없기 때문. 수동 동기화 규칙).
--
-- v_reserved 배열만 바뀌고 나머지 검증/삽입 로직은 기존 그대로.
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
