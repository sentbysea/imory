-- =========================================================
-- MANUAL TEST — admin_* operator RPC 4종
--
-- 이 파일은 migration이 아니다. supabase/migrations/에 두지 않은
-- 이유도 이것 하나다 — `supabase db push` 등 자동 배포 대상에 포함되면
-- 안 되고, Supabase SQL Editor에서 사람이 직접, 섹션 단위로 하나씩
-- 실행해야 한다.
--
-- 검증 대상 (20260903140000_add_admin_operator_data_rpcs.sql):
--   - public.admin_get_member_count()
--   - public.admin_list_recent_signups(p_limit, p_offset)
--   - public.admin_get_signup_config()
--   - public.admin_set_signup_config(p_signup_open, p_opens_at, p_closes_at)
--
-- 원리: SQL Editor는 기본적으로 postgres(superuser) 연결이라
-- auth.uid()가 항상 NULL이다(request.jwt.claims가 비어 있음). 실제
-- PostgREST 요청이 하는 일을 그대로 흉내내서 —
--   1) request.jwt.claims GUC에 {"sub": "<uuid>"} 형태로 세팅하고
--   2) SET LOCAL ROLE로 authenticated/anon 역할을 흉내내면
-- auth.uid()가 그 uuid를 반환하게 되어, 브라우저 없이도 "그 user_id로
-- 로그인한 것처럼" 이 함수들을 호출해볼 수 있다. superuser는 임의
-- role로 SET ROLE 가능(멤버십 불필요).
--
-- 안전장치: 값을 바꾸는 4번 함수 테스트는 전부 BEGIN ... ROLLBACK으로
-- 감싼다 — 실제 운영 중인 app_config를 건드리지 않고 결과만 확인하고
-- 되돌린다. 정말로 값을 바꾸고 싶을 때만 맨 아래 "실제로 적용하고
-- 싶다면" 섹션을 별도로 실행한다.
-- =========================================================


-- =========================================================
-- 0) 사전 준비 — 테스트에 쓸 user_id 확인
--
-- OPERATOR_UUID: admin_users에 실제로 등록된 운영자 user_id 중 하나를
-- 골라 아래 각 섹션의 <OPERATOR_UUID>를 이 값으로 바꿔서 실행한다.
-- =========================================================

select user_id from public.admin_users;

-- NON_OPERATOR_UUID는 admin_users에 없는 임의의 uuid면 충분하다(이
-- RPC들은 auth.users를 조회하지 않고 admin_users 멤버십만 확인하므로
-- 실제 가입자가 아니어도 됨). 아래에서는 gen_random_uuid()로 매번
-- 새로 만들어 쓴다.


-- =========================================================
-- A) 권한(GRANT) 자체 확인 — role 흉내 없이 카탈로그로 확인
--
-- 기대: anon/public은 false, authenticated는 true.
-- =========================================================

select
  has_function_privilege('anon', 'public.admin_get_member_count()', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_get_member_count()', 'execute') as authenticated_can_exec,
  has_function_privilege('public', 'public.admin_get_member_count()', 'execute') as public_can_exec;

select
  has_function_privilege('anon', 'public.admin_list_recent_signups(integer, integer)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_list_recent_signups(integer, integer)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.admin_get_signup_config()', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_get_signup_config()', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.admin_set_signup_config(boolean, timestamptz, timestamptz)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_set_signup_config(boolean, timestamptz, timestamptz)', 'execute') as authenticated_can_exec;


-- =========================================================
-- B) anon 역할로 직접 호출 — GRANT 단계에서부터 거절되는지 확인
--
-- 기대: 함수 본문(private.is_operator() 체크)까지 가지도 못하고
-- "permission denied for function ..." 에러.
-- =========================================================

begin;
set local role anon;
select public.admin_get_member_count();
rollback;


-- =========================================================
-- C) authenticated이지만 운영자 아님 — 함수 본문의 재검증 확인
--
-- 기대: 4개 함수 전부 "not authorized" 예외(SQLSTATE 42501).
-- get_operator_status()의 결과와 무관하게, 이 RPC들은 독립적으로
-- private.is_operator()를 다시 확인해야 한다.
-- =========================================================

begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', gen_random_uuid()::text)::text,
  true
);
set local role authenticated;

select public.admin_get_member_count();          -- 예외 기대
select * from public.admin_list_recent_signups(); -- 예외 기대
select * from public.admin_get_signup_config();   -- 예외 기대
select public.admin_set_signup_config(true, null, null); -- 예외 기대
rollback;


-- =========================================================
-- D) authenticated + 실제 운영자 — 정상 동작 확인
--
-- <OPERATOR_UUID>를 0번에서 확인한 실제 admin_users.user_id로 바꿔서
-- 실행. 조회만 하고 값을 바꾸지 않으므로 ROLLBACK 여부는 상관없지만
-- 습관적으로 통일한다.
-- =========================================================

begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<OPERATOR_UUID>')::text,
  true
);
set local role authenticated;

select public.admin_get_member_count();                       -- 정상 값(bigint) 기대
select * from public.admin_list_recent_signups(5, 0);          -- 최신 5명, created_at desc
select * from public.admin_get_signup_config();                -- signup_open/opens_at/closes_at 조회
rollback;


-- =========================================================
-- E) admin_list_recent_signups — 입력 검증
--
-- 운영자 컨텍스트에서 실행해야 "not authorized"가 아니라 실제
-- 입력 검증 예외가 나오는지 확인할 수 있다.
-- =========================================================

begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<OPERATOR_UUID>')::text,
  true
);
set local role authenticated;

select * from public.admin_list_recent_signups(0, 0);    -- 예외 기대 (p_limit < 1)
select * from public.admin_list_recent_signups(101, 0);   -- 예외 기대 (p_limit > 100)
select * from public.admin_list_recent_signups(20, -1);    -- 예외 기대 (p_offset < 0)
select * from public.admin_list_recent_signups(null, 0);   -- 예외 기대 (p_limit null)
rollback;


-- =========================================================
-- F) admin_set_signup_config — 입력 검증 + 정상 변경(전부 ROLLBACK)
-- =========================================================

begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<OPERATOR_UUID>')::text,
  true
);
set local role authenticated;

-- F-1) 검증 실패 케이스
select public.admin_set_signup_config(null, null, null);
  -- 예외 기대 (p_signup_open null)

select public.admin_set_signup_config(
  true,
  '2026-12-31T00:00:00Z'::timestamptz,
  '2026-01-01T00:00:00Z'::timestamptz
);
  -- 예외 기대 (opens_at >= closes_at)

-- F-2) 정상 변경 → 바로 조회해서 반영 확인 → ROLLBACK으로 되돌림
select public.admin_set_signup_config(
  false,
  '2026-09-10T00:00:00Z'::timestamptz,
  '2026-09-20T00:00:00Z'::timestamptz
);

select * from public.admin_get_signup_config();
  -- signup_open=false, opens_at=2026-09-10, closes_at=2026-09-20 로 보여야 함

rollback; -- 위 UPDATE를 실제로는 반영하지 않음


-- =========================================================
-- 실제로 가입 설정을 바꾸고 싶다면 (이번 테스트 범위 아님)
--
-- 위 F 섹션과 동일하지만 맨 끝을 COMMIT으로 바꿔서 별도로 실행한다.
-- imory-ops UI가 아직 연결되지 않은 지금 단계에서는, 값을 바꾸기 전에
-- admin_get_signup_config()로 현재 값을 먼저 기록해두는 것을 권장.
-- =========================================================
