-- =========================================================
-- MANUAL TEST — AI SKIN 저장 계층 (skins / skin_versions /
-- skin_image_slot_values / get_published_skin)
--
-- 이 파일은 migration이 아니다. Supabase SQL Editor에서 사람이
-- 섹션 단위로 하나씩 실행한다. 값을 바꾸는 섹션은 전부
-- BEGIN ... ROLLBACK으로 감싸 실제 운영 데이터를 건드리지 않는다
-- (C 섹션 참고 — COMMIT하지 않는 한 아무 것도 영구 반영되지 않음).
--
-- 검증 대상:
--   [[20260904100000_create_skins_skin_versions.sql]]  — 테이블
--   [[20260904110000_rls_skins_skin_versions.sql]]     — RLS/GRANT
--   [[20260904120000_add_get_published_skin_rpc.sql]]  — 공개 read RPC
--
-- 원리(role 흉내): 20260903_invites_manual_test.sql과 동일 기법 —
-- request.jwt.claims GUC에 {"sub": uuid}를 세팅하고 SET LOCAL ROLE로
-- authenticated/anon을 흉내낸다(SQL Editor는 postgres 슈퍼유저
-- 연결이라 auth.uid()가 기본 NULL이기 때문).
--
-- <OWNER_UUID>는 실제 profiles.user_id 하나를 써야 한다(skins.user_id가
-- profiles(user_id)를 참조하는 FK라서) — 0-1에서 조회한 값으로 아래
-- 전체를 치환해서 실행한다. E 섹션의 "다른 사용자"는 임의의
-- gen_random_uuid()로 충분하다(그 사용자 명의로 뭔가를 INSERT하지
-- 않고 남의 row를 읽기/쓰기 시도만 하기 때문에 실존 profiles row가
-- 필요 없다).
-- =========================================================


-- =========================================================
-- 0) 사전 준비
-- =========================================================

-- 0-1) OWNER_UUID로 쓸 실제 profiles.user_id 하나 확인
select user_id, slug from public.profiles limit 1;


-- =========================================================
-- A) GRANT 확인 — role 흉내 없이 카탈로그로 확인
--
-- 기대:
--   skins/skin_image_slot_values: anon 전부 false, authenticated는
--     select/insert/update/delete 전부 true(RLS가 행을 걸러낼 뿐,
--     테이블 권한 자체는 authenticated에 열려 있어야 함).
--   skin_versions: anon 전부 false, authenticated는 select/insert만
--     true이고 update/delete는 false여야 한다(append-only 설계를
--     GRANT 레벨에서도 강제).
--   get_published_skin: anon/authenticated 둘 다 execute true.
-- =========================================================

select
  has_table_privilege('anon', 'public.skins', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.skins', 'select') as auth_select,
  has_table_privilege('authenticated', 'public.skins', 'insert') as auth_insert,
  has_table_privilege('authenticated', 'public.skins', 'update') as auth_update,
  has_table_privilege('authenticated', 'public.skins', 'delete') as auth_delete;

select
  has_table_privilege('anon', 'public.skin_versions', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.skin_versions', 'select') as auth_select,
  has_table_privilege('authenticated', 'public.skin_versions', 'insert') as auth_insert,
  has_table_privilege('authenticated', 'public.skin_versions', 'update') as auth_update,
  has_table_privilege('authenticated', 'public.skin_versions', 'delete') as auth_delete;

select
  has_table_privilege('anon', 'public.skin_image_slot_values', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.skin_image_slot_values', 'select') as auth_select,
  has_table_privilege('authenticated', 'public.skin_image_slot_values', 'insert') as auth_insert,
  has_table_privilege('authenticated', 'public.skin_image_slot_values', 'update') as auth_update,
  has_table_privilege('authenticated', 'public.skin_image_slot_values', 'delete') as auth_delete;

select
  has_function_privilege('anon', 'public.get_published_skin(uuid)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.get_published_skin(uuid)', 'execute') as authenticated_can_exec;


-- =========================================================
-- B) anon 역할로 테이블 직접 접근 — 전부 거절되어야 함
-- =========================================================

begin;
set local role anon;
select * from public.skins limit 1;
rollback;

begin;
set local role anon;
select * from public.skin_versions limit 1;
rollback;

begin;
set local role anon;
select * from public.skin_image_slot_values limit 1;
rollback;


-- =========================================================
-- C) 소유자 CRUD 정상 흐름 — skins 생성 → 초안 버전 → 발행 →
--    이미지 슬롯 값 설정
--
-- <OWNER_UUID>를 0-1에서 확인한 실제 profiles.user_id로 치환.
-- 각 INSERT의 반환값을 다음 단계의 <SKIN_ID>/<VERSION_ID>로 손으로
-- 옮겨 넣는다(SQL Editor는 세션 변수를 못 쓰므로 수동 치환).
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;

-- C-1) skins row 생성 (아직 버전 없음 — 포인터 둘 다 NULL)
insert into public.skins (user_id, title)
values ('<OWNER_UUID>', 'PHASE1A 테스트 Skin')
returning id;
  -- 반환된 id를 아래 <SKIN_ID>로 사용

-- C-2) 첫 draft 버전 생성
insert into public.skin_versions (skin_id, schema_version, content, label)
values (
  '<SKIN_ID>',
  1,
  '{"schemaVersion":1,"html":"<article></article>","css":"","imageSlots":[],"regions":[],"metadata":{}}'::jsonb,
  '테스트 초안 1'
)
returning id;
  -- 반환된 id를 아래 <VERSION_ID>로 사용

-- C-3) skins.current_draft_version_id를 방금 만든 버전으로 이동
update public.skins
  set current_draft_version_id = '<VERSION_ID>'
  where id = '<SKIN_ID>';

select id, current_draft_version_id, current_published_version_id
  from public.skins where id = '<SKIN_ID>';
  -- current_draft_version_id = <VERSION_ID>, current_published_version_id = NULL 기대

-- C-4) 발행(Publish) — draft를 published로도 가리키게 함
update public.skins
  set current_published_version_id = current_draft_version_id
  where id = '<SKIN_ID>';

select id, current_draft_version_id, current_published_version_id
  from public.skins where id = '<SKIN_ID>';
  -- 둘 다 <VERSION_ID> 기대(같은 row를 동시에 가리킴)

-- C-5) 이미지 슬롯 값 설정
insert into public.skin_image_slot_values (skin_id, slot_name, image_url)
values ('<SKIN_ID>', 'profile', 'https://example.com/test-profile.png');

select * from public.skin_image_slot_values where skin_id = '<SKIN_ID>';

-- C-6) https 아닌 URL은 CHECK 제약으로 거절되는지
insert into public.skin_image_slot_values (skin_id, slot_name, image_url)
values ('<SKIN_ID>', 'header', 'http://example.com/insecure.png');
  -- 예외 기대: check constraint 위반

rollback; -- 전부 원복. D/E/F에서 실제로 남겨두고 이어서 보고 싶다면 이
          -- 섹션만 COMMIT으로 바꿔 실행(끝나면 G 정리 섹션으로 지운다).


-- =========================================================
-- D) skin_versions append-only 강제 확인 — UPDATE/DELETE 거절
--
-- A 섹션에서 GRANT 자체가 없는 것을 카탈로그로 확인했지만, 실제
-- 호출로도 재확인한다.
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;

insert into public.skins (user_id, title) values ('<OWNER_UUID>', 'append-only 테스트') returning id;
  -- <SKIN_ID_D>로 사용
insert into public.skin_versions (skin_id, content) values ('<SKIN_ID_D>', '{}'::jsonb) returning id;
  -- <VERSION_ID_D>로 사용

update public.skin_versions set label = '수정 시도' where id = '<VERSION_ID_D>';
  -- 예외 기대: permission denied for table skin_versions

delete from public.skin_versions where id = '<VERSION_ID_D>';
  -- 예외 기대: permission denied for table skin_versions

rollback;


-- =========================================================
-- E) RLS — 다른 로그인 사용자는 남의 skin을 보거나 못 건드림
--
-- C 섹션을 COMMIT으로 실행해 <SKIN_ID>가 실제로 남아있어야 의미
-- 있는 테스트다(그렇지 않으면 애초에 대상이 없어 결과가 항상
-- 0 row로 나와 RLS 덕분인지 데이터가 없어서인지 구분이 안 됨).
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
set local role authenticated;

select * from public.skins where id = '<SKIN_ID>';
  -- 0 row 기대(RLS가 소유자 아닌 사용자에게는 안 보이게 함)

update public.skins set title = '탈취 시도' where id = '<SKIN_ID>';
  -- 0건 영향 기대(권한 에러가 아니라 RLS로 대상이 안 보여 UPDATE 자체가 0건)

select * from public.skin_versions where skin_id = '<SKIN_ID>';
  -- 0 row 기대

select * from public.skin_image_slot_values where skin_id = '<SKIN_ID>';
  -- 0 row 기대

rollback;


-- =========================================================
-- F) get_published_skin() — 상태별 확인
--
-- C를 COMMIT해서 <SKIN_ID>(발행됨)가 실제로 남아있어야 F-1이
-- 의미 있다. F-2/F-4에서 상태를 바꾸는 UPDATE는 anon에게 애초에
-- UPDATE grant가 없으므로(A/B 섹션) authenticated(소유자) 롤로
-- 전환해서 실행하고, 조회만 다시 anon으로 전환해서 확인한다 — 한
-- 트랜잭션 안에서 set local role을 여러 번 바꿔도 된다. 전부
-- ROLLBACK으로 원복한다.
-- =========================================================

begin;

-- F-1) 정상 발행된 Skin — content/imageSlotValues가 채워져 반환되어야 함
set local role anon;
select public.get_published_skin('<OWNER_UUID>');
reset role;

-- F-2) draft만 있고 아직 발행 안 한 상태를 흉내
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;
update public.skins set current_published_version_id = null where id = '<SKIN_ID>';
reset role;

set local role anon;
select public.get_published_skin('<OWNER_UUID>');
  -- NULL 기대
reset role;

-- F-3) 존재하지 않는 사용자
set local role anon;
select public.get_published_skin(gen_random_uuid());
  -- NULL 기대
reset role;

-- F-4) is_active = false인 상태(published 포인터는 되돌려 놓고 비활성만 테스트)
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;
update public.skins set current_published_version_id = '<VERSION_ID>', is_active = false where id = '<SKIN_ID>';
reset role;

set local role anon;
select public.get_published_skin('<OWNER_UUID>');
  -- NULL 기대(비활성 skin은 draft/published 여부와 무관하게 반환되지 않음)
reset role;

rollback;


-- =========================================================
-- G) 정리 — C/D를 COMMIT으로 실행해 실제 데이터를 남겼다면 테스트 후 삭제
-- =========================================================

-- delete from public.skins where title in ('PHASE1A 테스트 Skin', 'append-only 테스트');
--   (on delete cascade로 skin_versions/skin_image_slot_values도 함께 삭제됨)
