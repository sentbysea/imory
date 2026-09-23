-- =========================================================
-- STUDIO-LAYERS-MEDIA-1 — 이미지 참조 감사 (READ ONLY)
--
-- 왜 필요한가
-- -----------
-- delete_skin_image_everywhere() 는 **슬롯 연결**만 떼고 파일을 지운다.
-- 스킨 코드(CSS/HTML)가 주소를 직접 박아 둔 자리는 어떤 표에도 참조가
-- 없어서 그 판단에 들어가지 않았다 — 그래서 이미 지운 파일을 아직
-- 가리키는 스킨이 남아 있을 수 있다.
--
-- 이 파일은 그것을 **찾기만** 한다.
--
--   ★ SELECT 밖에 없다. DB · Storage · CSS 를 한 글자도 바꾸지 않는다.
--     복구도 하지 않는다(무엇이 깨졌는지 먼저 사람이 보고 정한다).
--
-- 어디서 실행하나
-- ---------------
-- Supabase SQL Editor(= migration 을 붙여넣는 그 자리). 거기서는
-- storage.objects 를 읽을 수 있어서 "그 파일이 실제로 있는가"까지
-- 한 번에 본다. 애플리케이션 키(anon)로는 skin_versions · skin_images
-- 를 읽을 수 없으므로(RLS · GRANT 없음) 이 감사는 여기서만 된다.
--
-- 무엇을 보나 — 네 갈래
-- ---------------------
--   1) 스킨 코드 안의 직접 참조(모든 버전: published · draft · history)
--      와 그 파일의 존재 여부
--   2) 라이브러리 row 는 있는데 Storage 파일이 없는 이미지
--   3) 슬롯 연결이 가리키는 이미지 중 파일이 없는 것
--   4) 옛 모델(skin_image_slot_values)의 URL 중 파일이 없는 것
--
-- 읽는 법
-- -------
-- 1) 의 `object_exists` 가 false 인 줄이 **지금 깨진 자리**다. 같은 줄의
--    `version_role` 로 그 깨짐이 공개 화면인지(published) 지금 편집
--    화면인지(draft) 지난 이력인지(history) 가른다.
-- =========================================================


-- =========================================================
-- 1) 스킨 코드(CSS/HTML/JS)가 직접 가리키는 skin-images 경로
--
-- content 의 칸을 하나씩 펴서 본다 — 어느 칸에서 나왔는지가 곧
-- "어느 페이지가 영향을 받는가"다. 정규식은 주소 형태(public ·
-- render · signed)를 가리지 않고 `skin-images/` 뒤의 object key 만
-- 뽑는다.
-- =========================================================

with refs as (
  select
    k.id                                   as skin_id,
    k.user_id                              as owner_id,
    v.id                                   as version_id,
    case
      when v.id = k.current_published_version_id then 'published'
      when v.id = k.current_draft_version_id     then 'draft'
      else 'history'
    end                                    as version_role,
    v.created_at                           as version_created_at,
    loc.key                                as location,
    m[1]                                   as object_path
  from public.skins k
  join public.skin_versions v
    on v.skin_id = k.id
  cross join lateral (
    values
      ('css',                     v.content ->> 'css'),
      ('js',                      v.content ->> 'js'),
      ('html (legacy)',           v.content ->> 'html'),
      ('templates.home.html',     v.content #>> '{templates,home,html}'),
      ('templates.home.css',      v.content #>> '{templates,home,css}'),
      ('templates.category.html', v.content #>> '{templates,category,html}'),
      ('templates.category.css',  v.content #>> '{templates,category,css}'),
      ('templates.post.html',     v.content #>> '{templates,post,html}'),
      ('templates.post.css',      v.content #>> '{templates,post,css}'),
      ('templates.banner.html',   v.content #>> '{templates,banner,html}'),
      ('templates.banner.css',    v.content #>> '{templates,banner,css}'),
      ('templates.dock.html',     v.content #>> '{templates,dock,html}'),
      ('regions',                 v.content ->> 'regions'),
      ('metadata',                v.content ->> 'metadata')
  ) as loc(key, text)
  cross join lateral
    regexp_matches(coalesce(loc.text, ''), 'skin-images/([^"''\)\s\\?]+)', 'g') as m
)
select
  r.skin_id,
  r.owner_id,
  r.version_id,
  r.version_role,
  r.version_created_at,
  r.location,
  case
    when r.location in ('css', 'js', 'regions', 'metadata') then '전 페이지'
    when r.location like 'templates.home.%'     then 'HOME'
    when r.location like 'templates.category.%' then 'CATEGORY'
    when r.location like 'templates.post.%'     then 'POST'
    when r.location like 'templates.banner.%'   then 'BANNER'
    when r.location like 'templates.dock.%'     then '화면 아래 Dock(전 페이지)'
    else r.location
  end                                           as affected_page,
  r.object_path,
  'https://vtwcuvouyipohfonfukj.supabase.co/storage/v1/object/public/skin-images/'
    || r.object_path                            as public_url,
  (o.name is not null)                          as object_exists,
  (i.id is not null)                            as library_row_exists,
  i.id                                          as image_id,
  i.original_name
from refs r
left join storage.objects o
  on o.bucket_id = 'skin-images'
 and o.name = r.object_path
left join public.skin_images i
  on i.storage_path = r.object_path
order by
  (o.name is not null),              -- 없는 것(false)이 맨 위
  case r.version_role
    when 'published' then 0
    when 'draft'     then 1
    else 2
  end,
  r.version_created_at desc,
  r.location;


-- =========================================================
-- 2) 라이브러리 row 는 있는데 Storage 파일이 없는 이미지
--
-- (삭제가 반쪽으로 끝났거나, 파일만 따로 지워진 경우)
-- =========================================================

select
  i.id             as image_id,
  i.user_id        as owner_id,
  i.original_name,
  i.storage_path,
  i.created_at,
  (select count(*) from public.skin_version_image_slots s where s.image_id = i.id)
                   as slot_reference_count
from public.skin_images i
left join storage.objects o
  on o.bucket_id = 'skin-images'
 and o.name = i.storage_path
where o.name is null
order by i.created_at desc;


-- =========================================================
-- 3) 슬롯 연결이 가리키는 이미지 중 파일이 없는 것
--
-- 화면에서는 "슬롯에 사진이 있다"로 보이는데 실제로는 404 가 되는 자리다.
-- =========================================================

select
  k.id                      as skin_id,
  k.user_id                 as owner_id,
  s.version_id,
  case
    when s.version_id = k.current_published_version_id then 'published'
    when s.version_id = k.current_draft_version_id     then 'draft'
    else 'history'
  end                       as version_role,
  s.slot_name,
  i.id                      as image_id,
  i.storage_path
from public.skin_version_image_slots s
join public.skin_versions v on v.id = s.version_id
join public.skins k         on k.id = v.skin_id
join public.skin_images i   on i.id = s.image_id
left join storage.objects o
  on o.bucket_id = 'skin-images'
 and o.name = i.storage_path
where o.name is null
order by 4, s.slot_name;


-- =========================================================
-- 4) 옛 모델(skin_image_slot_values)의 URL 중 파일이 없는 것
--
-- 애플리케이션은 이 표에 쓰지 않지만, get_published_skin 이 도입 이전
-- 버전에서 아직 폴백으로 읽는다.
-- =========================================================

select
  sv.skin_id,
  k.user_id      as owner_id,
  sv.slot_name,
  sv.image_url,
  substring(sv.image_url from 'skin-images/(.*)$') as object_path
from public.skin_image_slot_values sv
join public.skins k on k.id = sv.skin_id
left join storage.objects o
  on o.bucket_id = 'skin-images'
 and o.name = substring(sv.image_url from 'skin-images/(.*)$')
where sv.image_url like '%skin-images/%'
  and o.name is null
order by sv.skin_id, sv.slot_name;
