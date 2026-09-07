-- =========================================================
-- SKIN IMAGE LIBRARY v0.1 — 수동 확인 스크립트
--
-- 대상 migration:
--   supabase/migrations/20260907100000_create_skin_image_library.sql
--
-- ★ 이 파일은 "적용 후 눈으로 확인하는 절차"다. 자동으로 무언가를
--   지우거나 정리하지 않는다. 아래 6절(고아 파일)도 조회만 한다.
--
-- 기존 supabase/tests/20260904_skins_manual_test.sql과 같은 형식:
--   Supabase SQL Editor에 한 절씩 붙여넣어 결과를 확인한다.
--   <UUID> 자리는 실제 값으로 바꿔서 실행한다.
-- =========================================================


-- =========================================================
-- 1) 테이블/버킷이 생겼는가
-- =========================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('skin_images', 'skin_version_image_slots')
order by table_name;
-- 기대: 두 행

-- 버전별 모델 구분 컬럼
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'skin_versions'
  and column_name = 'uses_image_library';
-- 기대: boolean / default false / NOT NULL
--       (기존 버전은 전부 false = 도입 이전 버전으로 취급)

select id, name, public
from storage.buckets
where id = 'skin-images';
-- 기대: skin-images / public = true

-- storage 정책 — UPDATE 정책이 없어야 한다(같은 경로 덮어쓰기 불가).
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'skin_images%'
order by policyname;
-- 기대: skin_images_owner_delete (DELETE)
--       skin_images_owner_insert (INSERT)
--       skin_images_public_read  (SELECT)
--       → UPDATE 정책은 없어야 한다.


-- =========================================================
-- 2) RLS가 켜져 있는가
-- =========================================================

select relname, relrowsecurity
from pg_class
where relname in ('skin_images', 'skin_version_image_slots');
-- 기대: 둘 다 relrowsecurity = true


-- =========================================================
-- 3) GRANT — anon에게 아무 권한도 없어야 한다
--
-- "공개 URL 열람"과 "비공개 이미지 관리 목록/수정"의 분리를 여기서
-- 확인한다. anon은 storage object를 URL로 볼 수는 있지만(버킷
-- public=true) 누가 어떤 이미지를 갖고 있는지 목록은 절대 못 본다.
-- =========================================================

select
  has_table_privilege('anon', 'public.skin_images', 'select')          as anon_images_select,
  has_table_privilege('anon', 'public.skin_version_image_slots', 'select') as anon_slots_select,
  has_table_privilege('authenticated', 'public.skin_images', 'select') as auth_images_select,
  has_table_privilege('authenticated', 'public.skin_images', 'insert') as auth_images_insert,
  has_table_privilege('authenticated', 'public.skin_images', 'update') as auth_images_update,
  has_table_privilege('authenticated', 'public.skin_images', 'delete') as auth_images_delete,
  has_table_privilege('authenticated', 'public.skin_version_image_slots', 'select') as auth_slots_select,
  has_table_privilege('authenticated', 'public.skin_version_image_slots', 'insert') as auth_slots_insert,
  has_table_privilege('authenticated', 'public.skin_version_image_slots', 'delete') as auth_slots_delete;

-- 기대:
--   anon_*                : 전부 false
--   auth_images_select    : true
--   auth_images_insert    : true
--   auth_images_update    : false   (이미지는 등록 후 수정 대상 아님)
--   auth_images_delete    : true
--   auth_slots_select     : true
--   auth_slots_insert     : false   (연결은 RPC로만 생긴다)
--   auth_slots_delete     : false


-- =========================================================
-- 4) RPC EXECUTE 권한
-- =========================================================

select
  p.proname,
  has_function_privilege('anon', p.oid, 'execute')          as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as auth_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_skin_image',
    'delete_skin_image',
    'save_skin_draft_version_with_image_slots',
    'save_skin_draft_version',
    'get_published_skin',
    'restore_skin_version'
  )
order by p.proname;

-- 기대:
--   get_published_skin                        : anon true,  auth true
--   나머지 전부                                : anon false, auth true


-- =========================================================
-- 5) 핵심 불변식 확인 (실제 계정으로 Studio에서 한 번 해본 뒤)
--
--   Studio에서: IMAGES → 업로드 → 슬롯 연결 → Save (아직 Publish 안 함)
-- =========================================================

-- 5-1) draft 버전에는 연결이 생겼는가
select s.slot_name, i.original_name, i.public_url
from public.skins k
join public.skin_version_image_slots s
  on s.version_id = k.current_draft_version_id
join public.skin_images i on i.id = s.image_id
where k.user_id = '<USER_ID>';
-- 기대: 방금 연결한 슬롯이 보인다

-- 5-2) published 버전에는 아직 연결이 없는가 (= 공개본이 안 바뀜)
select count(*) as published_slot_count
from public.skins k
join public.skin_version_image_slots s
  on s.version_id = k.current_published_version_id
where k.user_id = '<USER_ID>';
-- 기대: Save만 했다면 0 (또는 이전에 발행했던 값 그대로)

-- 5-3) 공개 RPC가 실제로 무엇을 내보내는가
select public.get_published_skin('<USER_ID>') -> 'imageSlotValues' as published_images;
-- 기대: Save 직후에는 이전 발행 상태 그대로. Publish 후 다시 실행하면 바뀐다.

--   여기서 Studio의 Publish를 누른 뒤 5-2/5-3을 다시 실행한다.
--   기대: published_slot_count가 draft와 같아지고, published_images에
--         방금 연결한 URL이 나타난다.


-- =========================================================
-- 6) 삭제 정책 확인
-- =========================================================

-- 6-1) 어떤 버전이든 참조 중인 이미지는 삭제되지 않아야 한다
--      (Studio에서 삭제를 눌렀을 때 나오는 에러 메시지와 같은 이유)
select i.id, i.original_name, count(s.version_id) as referenced_by_versions
from public.skin_images i
left join public.skin_version_image_slots s on s.image_id = i.id
where i.user_id = '<USER_ID>'
group by i.id, i.original_name
order by referenced_by_versions desc;

-- 6-2) 고아 파일 후보 조회 — ★ 삭제하지 않는다
--      Storage에는 있는데 skin_images에는 없는 object.
--      7일 유예: 방금 업로드했지만 아직 등록 전인 파일을 건드리지
--      않기 위해서다(SKIN_IMAGE_LIBRARY_PLAN.md 7절).
select
  o.name,
  o.created_at,
  o.metadata ->> 'size' as size
from storage.objects o
where o.bucket_id = 'skin-images'
  and not exists (
    select 1 from public.skin_images i
    where i.storage_path = o.name
  )
  and o.created_at < now() - interval '7 days'
order by o.created_at;

-- 6-3) 참조 중인 파일을 Storage API로 직접 지울 수 없는지
--      (앱 UI가 아니라 클라이언트에서 storage.remove()를 직접 호출한
--       상황을 가정한 확인 — skin_images row가 남아 있는 한 거부된다)
--
--      SQL로는 정책을 직접 재현하기 어렵다. 실제 확인은 브라우저
--      콘솔에서 로그인 상태로 아래를 실행해 error가 나오는지 본다:
--
--        await supabaseClient.storage.from('skin-images')
--          .remove(['<USER_ID>/<uuid>.png'])          -- 참조 중인 파일
--        // 기대: 삭제되지 않음(파일이 그대로 남아 있어야 한다)
--
--        await supabaseClient.storage.from('skin-images')
--          .upload('<USER_ID>/<uuid>.png', file, { upsert: true })
--        // 기대: 거부(UPDATE 정책 없음)



-- =========================================================
-- 7) 하위 호환 확인
-- =========================================================

-- 7-1) 기존 skin_image_slot_values는 그대로 남아 있어야 한다
select count(*) as legacy_rows from public.skin_image_slot_values;

-- 7-2) Image Library를 한 번도 쓴 적 없는 스킨만 기존 값으로
--      폴백해야 한다. legacy_rows > 0인 사용자로 확인한다.
select public.get_published_skin('<LEGACY_USER_ID>') -> 'imageSlotValues';

-- 7-3) ★ 폴백 조건 확인 — "지금 0건이면"이 아니라 "한 번도 쓴 적
--      없으면"이어야 한다. 새 모델로 슬롯을 연결해 발행한 뒤,
--      슬롯을 전부 비우고 다시 발행한다.
--      기대: 옛 skin_image_slot_values 값이 되살아나지 않고 {}가
--            나온다. (이 조건이 잘못되면 "사용자는 지웠는데
--            옛 이미지가 부활"한다)
select
  (select count(*)
     from public.skin_version_image_slots s
     join public.skin_versions v on v.id = s.version_id
    where v.skin_id = k.id)                       as ever_used_new_model,
  public.get_published_skin(k.user_id) -> 'imageSlotValues' as published_images
from public.skins k
where k.user_id = '<USER_ID>'
  and k.is_active;
-- 기대: ever_used_new_model > 0 이면 published_images는 {}



-- =========================================================
-- 8) ★ 버전 분리 — draft 저장이 공개본을 바꾸지 않는가
--
-- 폴백을 skin 단위로 판정하면 여기서 깨진다. 아래 순서대로 확인한다.
-- =========================================================

-- 8-1) 시작 상태: legacy 이미지를 가진 공개 버전 A
--      (uses_image_library = false 인 버전이 published여야 한다)
select
  k.current_published_version_id,
  v.uses_image_library                                      as published_uses_library,
  public.get_published_skin(k.user_id) -> 'imageSlotValues'  as published_images
from public.skins k
join public.skin_versions v on v.id = k.current_published_version_id
where k.user_id = '<USER_ID>'
  and k.is_active;
-- 기대: published_uses_library = false, published_images에 legacy 값

-- 8-2) Studio에서 IMAGES로 이미지를 연결하고 **Save만** 한다
--      (Publish 하지 않는다). 그 뒤 8-1을 그대로 다시 실행한다.
--
-- 기대: current_published_version_id도, published_images도 8-1과
--       **완전히 동일**해야 한다. 달라졌다면 판정이 버전 단위가
--       아니라는 뜻이다.

-- 8-3) draft 쪽은 새 모델로 바뀌었는지 확인
select
  k.current_draft_version_id,
  v.uses_image_library as draft_uses_library,
  (select count(*) from public.skin_version_image_slots s
    where s.version_id = k.current_draft_version_id) as draft_slot_count
from public.skins k
join public.skin_versions v on v.id = k.current_draft_version_id
where k.user_id = '<USER_ID>'
  and k.is_active;
-- 기대: draft_uses_library = true, draft_slot_count >= 1

-- 8-4) 이제 Publish한 뒤 8-1을 다시 실행한다
-- 기대: published_uses_library = true, published_images가 새 URL로 교체

-- 8-5) 전부 비우고 Save → Publish 후 8-1 재실행
-- 기대: published_uses_library = true, published_images = {}
--       (legacy가 되살아나면 안 된다)

-- 8-6) Restore가 연결과 플래그를 함께 보존하는가
--      Studio/RPC로 과거 버전을 restore한 뒤:
select
  v.id,
  v.uses_image_library,
  (select count(*) from public.skin_version_image_slots s
    where s.version_id = v.id) as slot_count
from public.skins k
join public.skin_versions v on v.id = k.current_draft_version_id
where k.user_id = '<USER_ID>'
  and k.is_active;
-- 기대: 원본 버전의 uses_image_library와 연결 개수가 그대로 복제된다

-- =========================================================
-- 9) 롤백 (필요할 때만, 수동)
--
-- 새 테이블/버킷만 되돌린다. 교체된 두 함수
-- (get_published_skin / restore_skin_version)는 이 스크립트로
-- 되돌아가지 않으므로, 롤백이 필요하면
-- 20260904120000_add_get_published_skin_rpc.sql과
-- 20260905100000_add_skin_draft_write_rpcs.sql의 해당 정의를 다시
-- 실행해야 한다.
-- =========================================================

-- drop function if exists public.save_skin_draft_version_with_image_slots(uuid, jsonb, smallint, text, jsonb);
-- drop function if exists public.delete_skin_image(uuid);
-- drop function if exists public.create_skin_image(text, text, text, text, integer);
-- drop table if exists public.skin_version_image_slots;
-- drop table if exists public.skin_images;
-- alter table public.skin_versions drop column if exists uses_image_library;
-- delete from storage.buckets where id = 'skin-images';   -- object가 남아 있으면 실패한다
