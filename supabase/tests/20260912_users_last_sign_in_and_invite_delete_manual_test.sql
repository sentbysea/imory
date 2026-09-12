-- =========================================================
-- MANUAL TEST — USERS 최종 접속일 + 초대 링크 삭제 조건 완화
--
-- 이 파일은 migration이 아니다. Supabase SQL Editor에서 사람이 섹션
-- 단위로 하나씩 실행한다. 값을 바꾸는 섹션은 전부 BEGIN ... ROLLBACK으로
-- 감싸 실제 운영 데이터를 건드리지 않는다.
--
-- 검증 대상:
--   [[20260912110000_add_last_sign_in_to_admin_list_recent_signups.sql]]
--   [[20260912120000_allow_deleting_finished_invite_links.sql]]
--
-- role 흉내 기법은 [[20260903_admin_operator_rpcs_manual_test.sql]]과
-- 동일하다(request.jwt.claims GUC + SET LOCAL ROLE).
-- =========================================================


-- =========================================================
-- 0) 사전 준비 — 아래에서 쓸 실제 uuid 2개를 미리 확인한다
-- =========================================================

-- 0-1) OPERATOR_UUID: admin_users에 등록된 실제 운영자 user_id.
select user_id from public.admin_users;

-- 0-2) MEMBER_UUID: invite_link_uses.user_id FK(auth.users)를 만족시킬
-- 실제 회원 uuid 하나(감사 로그 보존 테스트에서만 사용, 전부 ROLLBACK).
select user_id, nickname from public.profiles order by created_at desc limit 1;


-- =========================================================
-- A) GRANT 확인 — DROP/재생성 후 권한이 제대로 다시 걸렸는지
--
-- 기대: 둘 다 anon false / authenticated true.
-- (이 인스턴스는 public 스키마에 ALTER DEFAULT PRIVILEGES가 걸려 있어
--  새 함수에 anon EXECUTE가 자동으로 붙는다 —
--  [[20260903190000_harden_operator_rpc_grants.sql]]. 그래서 함수를
--  DROP하고 다시 만든 이번 변경에서 이 확인이 특히 중요하다.)
-- =========================================================

select
  has_function_privilege('anon', 'public.admin_list_recent_signups(integer, integer)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_list_recent_signups(integer, integer)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.admin_delete_invite_link(uuid)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_delete_invite_link(uuid)', 'execute') as authenticated_can_exec;

-- 오버로드가 남아 있지 않은지(옛 5컬럼 버전이 같이 살아있지 않은지) 확인.
-- 기대: admin_list_recent_signups row 1개.
select
  p.oid::regprocedure as signature,
  pg_catalog.pg_get_function_result(p.oid) as returns
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'admin_list_recent_signups';


-- =========================================================
-- B) invite_link_uses FK가 실제로 제거됐는지
--
-- 기대: 0 row(invite_link_id에 대한 foreign key 없음).
-- user_id에 대한 FK(auth.users)는 그대로 남아 있어야 하므로 아래
-- 두 번째 쿼리는 1 row.
-- =========================================================

select conname, pg_catalog.pg_get_constraintdef(oid) as def
from pg_catalog.pg_constraint
where conrelid = 'public.invite_link_uses'::regclass
  and contype = 'f';
-- 기대: user_id → auth.users(id) 하나만 남음.

-- unique(invite_link_id, user_id) 제약과 인덱스는 그대로여야 한다.
select conname, pg_catalog.pg_get_constraintdef(oid) as def
from pg_catalog.pg_constraint
where conrelid = 'public.invite_link_uses'::regclass
  and contype = 'u';


-- =========================================================
-- C) admin_list_recent_signups — last_sign_in_at 반환 확인
--
-- 기대: 6개 컬럼(user_id/nickname/slug/home_mode/created_at/
-- last_sign_in_at)이 나오고, last_sign_in_at이 auth.users의 값과
-- 정확히 일치한다. 로그인 기록이 없는 계정은 null(운영 화면에서 "—").
--
-- OPERATOR_UUID를 실제 값으로 바꿔 실행할 것.
-- =========================================================

begin;

  set local role authenticated;
  set local request.jwt.claims = '{"sub": "OPERATOR_UUID"}';

  select * from public.admin_list_recent_signups(5, 0);

rollback;

-- 교차 검증(운영자 흉내 없이 superuser로 직접 읽어 비교).
select p.nickname, p.created_at, u.last_sign_in_at
from public.profiles p
left join auth.users u on u.id = p.user_id
order by p.created_at desc
limit 5;


-- =========================================================
-- D) admin_delete_invite_link — 삭제 허용/거절 조건
--
-- 시나리오 5개를 한 트랜잭션에서 만들고 전부 ROLLBACK한다.
-- OPERATOR_UUID / MEMBER_UUID를 실제 값으로 바꿔 실행할 것.
--
-- 기대:
--   D-1 미사용(uses_count = 0, 활성)          → 삭제 성공
--   D-2 전부 소진(uses_count = max_uses)       → 삭제 성공 (이번 변경)
--   D-3 비활성화(is_active = false, 일부 사용) → 삭제 성공 (이번 변경)
--   D-4 만료(expires_at 과거, 일부 사용)        → 삭제 성공 (이번 변경)
--   D-5 활성 + 만료 전 + 일부 사용             → 예외로 거절
--   D-6 D-3 링크의 invite_link_uses 감사 로그가 삭제 후에도 남아 있음
-- =========================================================

begin;

  -- 테스트용 링크 4개를 직접 insert한다(admin_create_invite_link를
  -- 쓰지 않는 이유: uses_count/is_active/expires_at을 원하는 상태로
  -- 직접 만들어야 하므로).
  insert into public.invite_links (id, token_hash, max_uses, uses_count, is_active, note, expires_at)
  values
    ('11111111-1111-1111-1111-111111111111', 'test-hash-unused',    5, 0, true,  'TEST 미사용',   now() + interval '7 days'),
    ('22222222-2222-2222-2222-222222222222', 'test-hash-exhausted', 3, 3, true,  'TEST 소진',     now() + interval '7 days'),
    ('33333333-3333-3333-3333-333333333333', 'test-hash-inactive',  5, 2, false, 'TEST 비활성',   now() + interval '7 days'),
    ('44444444-4444-4444-4444-444444444444', 'test-hash-expired',   5, 1, true,  'TEST 만료',     now() - interval '1 day'),
    ('55555555-5555-5555-5555-555555555555', 'test-hash-live',      5, 2, true,  'TEST 사용중',   now() + interval '7 days');

  -- D-3 링크에 감사 로그 1건(FK가 없어졌어도 insert는 그대로 동작).
  insert into public.invite_link_uses (invite_link_id, user_id)
  values ('33333333-3333-3333-3333-333333333333', 'MEMBER_UUID');

  set local role authenticated;
  set local request.jwt.claims = '{"sub": "OPERATOR_UUID"}';

  select public.admin_delete_invite_link('11111111-1111-1111-1111-111111111111'); -- D-1 성공 기대
  select public.admin_delete_invite_link('22222222-2222-2222-2222-222222222222'); -- D-2 성공 기대
  select public.admin_delete_invite_link('33333333-3333-3333-3333-333333333333'); -- D-3 성공 기대
  select public.admin_delete_invite_link('44444444-4444-4444-4444-444444444444'); -- D-4 성공 기대

  -- D-6) 링크를 지웠는데도 감사 로그는 남아 있어야 한다. 기대: 1 row.
  reset role;
  select * from public.invite_link_uses
  where invite_link_id = '33333333-3333-3333-3333-333333333333';

  -- 남은 건 D-5 링크 하나뿐이어야 한다. 기대: 'TEST 사용중' 1 row.
  select id, note, uses_count, max_uses, is_active
  from public.invite_links
  where note like 'TEST %';

rollback;

-- D-5) 활성 + 만료 전 + 일부 사용 → 거절되는지 따로 확인.
-- 기대: 'cannot delete an active invite link that is still usable' 예외.
begin;

  insert into public.invite_links (id, token_hash, max_uses, uses_count, is_active, note)
  values ('55555555-5555-5555-5555-555555555555', 'test-hash-live', 5, 2, true, 'TEST 사용중');

  set local role authenticated;
  set local request.jwt.claims = '{"sub": "OPERATOR_UUID"}';

  select public.admin_delete_invite_link('55555555-5555-5555-5555-555555555555'); -- 예외 기대

rollback;

-- D-7) 비운영자는 여전히 42501로 거절되는지.
-- 기대: 'not authorized' 예외(링크 존재 여부와 무관하게 먼저 거절).
begin;

  set local role authenticated;
  set local request.jwt.claims = '{"sub": "MEMBER_UUID"}';

  select public.admin_delete_invite_link('55555555-5555-5555-5555-555555555555'); -- 예외 기대

rollback;
