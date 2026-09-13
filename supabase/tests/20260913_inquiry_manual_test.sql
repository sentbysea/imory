-- =========================================================
-- MANUAL TEST — INQUIRY (사용자 문의)
--
-- 이 파일은 migration이 아니다. Supabase SQL Editor에서 사람이 섹션
-- 단위로 하나씩 실행한다. 값을 바꾸는 섹션은 전부 BEGIN ... ROLLBACK으로
-- 감싸 실제 운영 데이터를 건드리지 않는다.
--
-- 검증 대상:
--   [[20260913190000_create_inquiries.sql]]
--     public.inquiries
--     inquiry-images 버킷 + storage 정책 2개
--     public.inquiry_image_is_readable(text)
--     public.submit_inquiry(text, text[])
--     public.admin_list_inquiries(integer, integer)
--
-- role 흉내 기법은 [[20260903_admin_operator_rpcs_manual_test.sql]]과
-- 동일하다(request.jwt.claims GUC + SET LOCAL ROLE).
-- =========================================================


-- =========================================================
-- 0) 사전 준비 — 아래에서 쓸 실제 uuid 2개
-- =========================================================

-- 0-1) OPERATOR_UUID: admin_users에 등록된 실제 운영자 user_id.
select user_id from public.admin_users;

-- 0-2) MEMBER_UUID: 운영자가 아닌 일반 회원 uuid 하나.
select p.user_id, p.nickname
from public.profiles p
where not exists (
  select 1 from public.admin_users a where a.user_id = p.user_id
)
order by p.created_at desc
limit 1;


-- =========================================================
-- A) GRANT 확인
--
-- 이 인스턴스는 public 스키마에 ALTER DEFAULT PRIVILEGES가 걸려 있어
-- 새 함수에 anon EXECUTE가 자동으로 붙는다
-- ([[20260903190000_harden_operator_rpc_grants.sql]]). migration이
-- anon revoke까지 명시했으므로 아래는 전부 anon false여야 한다.
--
-- 기대: 세 함수 모두 anon false / authenticated true.
-- =========================================================

select
  has_function_privilege('anon', 'public.submit_inquiry(text, text[])', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.submit_inquiry(text, text[])', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.admin_list_inquiries(integer, integer)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_list_inquiries(integer, integer)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.inquiry_image_is_readable(text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.inquiry_image_is_readable(text)', 'execute') as authenticated_can_exec;


-- 테이블 권한 — 기대: 0 row(anon/authenticated 어느 권한도 없어야 한다).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'inquiries'
  and grantee in ('anon', 'authenticated');

-- RLS 정책 — 기대: 0 row(정책을 만들지 않는 default deny).
select policyname from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'inquiries';

-- 버킷 — 기대: public=false, 10MB, image/* 4종.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'inquiry-images';

-- storage 정책 — 기대: inquiry_images_owner_write / inquiry_images_gated_read 2개.
select policyname, cmd
from pg_catalog.pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'inquiry_images%';


-- =========================================================
-- B) submit_inquiry — 정상 저장 (사진 없이)
--
-- MEMBER_UUID를 실제 값으로 바꿔 실행할 것. 전부 ROLLBACK.
-- 기대: uuid 1개 반환 → 그 행이 body/user_id와 함께 조회됨.
-- =========================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';

select public.submit_inquiry('테스트 문의입니다. 저장 후 롤백합니다.', '{}');

reset role;

select id, user_id, body, image_paths, created_at
from public.inquiries
order by created_at desc
limit 3;

rollback;


-- =========================================================
-- C) submit_inquiry — 거절되어야 하는 경우들
--
-- 각각 따로 실행한다(먼저 나온 예외에서 트랜잭션이 끊긴다).
-- =========================================================

-- C-1) 로그인하지 않음 → 42501
begin;
set local role anon;
select public.submit_inquiry('anon이 보낸 문의', '{}');
rollback;
-- 기대: permission denied for function submit_inquiry
--       (anon EXECUTE 자체가 없으므로 함수 본문에 들어가지도 못한다)

-- C-2) 빈 본문 → invalid p_body
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';
select public.submit_inquiry('   ', '{}');
rollback;

-- C-3) 남의 폴더 경로를 첨부 → 42501 invalid inquiry image
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';
select public.submit_inquiry('남의 파일 붙이기', array['OPERATOR_UUID/whatever.png']);
rollback;

-- C-4) 실재하지 않는 자기 경로 → 42501 invalid inquiry image
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';
select public.submit_inquiry('없는 파일 붙이기', array['MEMBER_UUID/does-not-exist.png']);
rollback;

-- C-5) 6장 첨부 → invalid p_image_paths
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';
select public.submit_inquiry(
  '여섯 장',
  array['a','b','c','d','e','f']
);
rollback;


-- =========================================================
-- D) admin_list_inquiries — 운영자만
-- =========================================================

-- D-1) 비운영자 → 42501 not authorized
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';
select * from public.admin_list_inquiries(50, 0);
rollback;

-- D-2) 운영자 → 목록이 나온다(닉네임/슬러그가 채워져 있어야 한다).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "OPERATOR_UUID"}';
select id, nickname, slug, left(body, 40) as body_head, image_paths, created_at
from public.admin_list_inquiries(50, 0);
rollback;

-- D-3) 범위 밖 인자 → 예외(clamp하지 않는다)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "OPERATOR_UUID"}';
select * from public.admin_list_inquiries(0, 0);
rollback;


-- =========================================================
-- E) inquiry_image_is_readable — 파일 단위 판정
--
-- 기대:
--   본인 폴더        true
--   남의 폴더(회원)  false
--   남의 폴더(운영자) true
--   로그인 안 함      false
-- =========================================================

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';
select
  public.inquiry_image_is_readable('MEMBER_UUID/x.png')   as own_file,
  public.inquiry_image_is_readable('OPERATOR_UUID/x.png') as other_file;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "OPERATOR_UUID"}';
select
  public.inquiry_image_is_readable('MEMBER_UUID/x.png') as operator_reads_other;
rollback;

begin;
set local role anon;
select public.inquiry_image_is_readable('MEMBER_UUID/x.png') as anon_reads;
rollback;
-- 기대: anon은 EXECUTE 자체가 없어 permission denied.


-- =========================================================
-- F) 화면까지 한 번 (실제 값이 남는다 — 확인 후 직접 지울 것)
--
--   1. imory /admin/ → INQUIRY 에서 사진 1~2장 + 내용으로 send
--   2. imory-ops → Inquiry 탭에서 닉네임/내용/사진이 보이는지 확인
--   3. 남기고 싶지 않으면 아래로 지운다(사진 파일은 Storage 화면에서
--      inquiry-images/<user_id>/ 아래를 함께 삭제).
-- =========================================================

-- select id, user_id, body, image_paths, created_at
-- from public.inquiries order by created_at desc limit 5;

-- delete from public.inquiries where id = '<확인한 id>';
