-- =========================================================
-- SKIN IMAGE LIBRARY — 실행 상태 점검 (READ ONLY)
--
-- 20260907100000_create_skin_image_library.sql 이
--   ERROR: 42P01 relation "public.skin_images" does not exist
-- 로 중단된 뒤, 그 실행이 남긴 객체가 있는지 확인한다.
--
-- 이 파일은 카탈로그만 조회한다 — CREATE/ALTER/DROP/INSERT 없음.
-- 조회 A를 먼저 실행하고, 그 결과에서 테이블이 '있음'일 때만
-- 조회 B를 실행한다(테이블이 없으면 조회 B는 파싱 단계에서 실패).
-- =========================================================


-- ── 조회 A: 객체별 존재 여부 ──────────────────────────────
select
  step,
  object,
  case when found > 0 then '있음' else '없음' end as status
from (values
  ('01 bucket', 'storage.buckets: skin-images',
     (select count(*) from storage.buckets where id = 'skin-images')),

  ('02 table', 'public.skin_images',
     (select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'skin_images' and c.relkind = 'r')),

  ('03 table', 'public.skin_version_image_slots',
     (select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'skin_version_image_slots' and c.relkind = 'r')),

  ('04 index', 'skin_images_user_id_created_at_idx',
     (select count(*) from pg_indexes
       where schemaname = 'public' and indexname = 'skin_images_user_id_created_at_idx')),

  ('05 index', 'skin_version_image_slots_image_id_idx',
     (select count(*) from pg_indexes
       where schemaname = 'public' and indexname = 'skin_version_image_slots_image_id_idx')),

  ('06 column', 'public.skin_versions.uses_image_library',
     (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'skin_versions'
         and column_name = 'uses_image_library')),

  ('07 rls', 'public.skin_images RLS 활성화',
     (select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'skin_images' and c.relrowsecurity)),

  ('08 rls', 'public.skin_version_image_slots RLS 활성화',
     (select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'skin_version_image_slots' and c.relrowsecurity)),

  ('09 policy', 'public.skin_images / skin_images_owner_all',
     (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'skin_images'
         and policyname = 'skin_images_owner_all')),

  ('10 policy', 'public.skin_version_image_slots / skin_version_image_slots_owner_all',
     (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'skin_version_image_slots'
         and policyname = 'skin_version_image_slots_owner_all')),

  ('11 policy', 'storage.objects / skin_images_owner_insert',
     (select count(*) from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'skin_images_owner_insert')),

  ('12 policy', 'storage.objects / skin_images_owner_delete',
     (select count(*) from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'skin_images_owner_delete')),

  ('13 policy', 'storage.objects / skin_images_public_read',
     (select count(*) from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'skin_images_public_read')),

  ('14 function', 'public.create_skin_image',
     (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_skin_image')),

  ('15 function', 'public.delete_skin_image',
     (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_skin_image')),

  ('16 function', 'public.save_skin_draft_version_with_image_slots',
     (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'save_skin_draft_version_with_image_slots')),

  -- 아래 둘은 "존재 여부"가 아니라 "새 본문으로 교체됐는가"를 본다.
  -- 있음 = 이미 새 본문. 이때 06(컬럼)이 없음이면 지금 공개 스킨 읽기가
  -- 깨진 상태이므로 재실행이 시급하다.
  ('17 function', 'public.get_published_skin — 새 본문(skin_version_image_slots 참조)',
     (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_published_skin'
         and p.prosrc like '%skin_version_image_slots%')),

  ('18 function', 'public.restore_skin_version — 새 본문(skin_version_image_slots 참조)',
     (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'restore_skin_version'
         and p.prosrc like '%skin_version_image_slots%'))
) as t(step, object, found)
order by step;


-- ── 조회 B: 남아 있는 데이터 (조회 A의 02/03/06이 '있음'일 때만) ──
-- 재실행 SQL은 어떤 데이터도 지우지 않는다. 이 조회는 재실행 전후를
-- 비교할 기준값을 남기기 위한 것이다.
--
-- select 'public.skin_images' as tbl, count(*) as row_count from public.skin_images
-- union all
-- select 'public.skin_version_image_slots', count(*) from public.skin_version_image_slots
-- union all
-- select 'skin_versions (uses_image_library = true)', count(*)
--   from public.skin_versions where uses_image_library;
