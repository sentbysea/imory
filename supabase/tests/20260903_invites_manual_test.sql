-- =========================================================
-- MANUAL TEST — INVITES (초대 링크) DB 계층
--
-- 이 파일은 migration이 아니다. 자동 배포 대상이 아니고, Supabase SQL
-- Editor에서 사람이 섹션 단위로 하나씩 실행한다. 값을 바꾸는 섹션은
-- 전부 BEGIN ... ROLLBACK으로 감싸 실제 운영 데이터를 건드리지 않는다.
--
-- 검증 대상:
--   [[20260903150000_create_invite_links.sql]]              — 테이블
--   [[20260903160000_gate_new_account_on_invite_capacity.sql]] — Hook/가용성
--   [[20260903170000_consume_invite_in_complete_onboarding.sql]] — 소비
--   [[20260903180000_add_invite_admin_rpcs.sql]]             — 운영자 RPC
--
-- 원리(role 흉내): SQL Editor는 postgres(superuser) 연결이라
-- auth.uid()가 기본 NULL이다. request.jwt.claims GUC에 {"sub": uuid}를
-- 세팅하고 SET LOCAL ROLE로 authenticated/anon을 흉내내면 실제
-- PostgREST 요청처럼 이 함수들을 호출해볼 수 있다
-- ([[20260903_admin_operator_rpcs_manual_test.sql]]와 동일 기법).
--
-- 중요한 제약: profiles.user_id와 invite_link_uses.user_id는 둘 다
-- auth.users(id)를 참조하는 FK다. 초대 토큰이 "실제로 매칭되어
-- 소비되는" 경로(아래 K 섹션)는 invite_link_uses에 INSERT가 실제로
-- 실행되므로 gen_random_uuid()로 만든 가짜 uuid로는 FK 위반이
-- 난다 — 이 경로만 진짜 auth.users row(운영 계정이 아닌 테스트용
-- 더미 계정)가 필요하다. 그 앞 단계에서 이미 거절되는 나머지 모든
-- 케이스(권한 거절/신호 초대 검증 실패/가입기간 열림)는 가짜 uuid로
-- 충분하다 — 아래 각 섹션에 명시.
-- =========================================================


-- =========================================================
-- 0) 사전 준비
-- =========================================================

-- 0-1) OPERATOR_UUID: admin_users에 등록된 실제 운영자 user_id.
select user_id from public.admin_users;

-- 0-2) 지금 가입 기간이 열려있는지/닫혀있는지 먼저 확인해 둔다 —
-- 아래 여러 섹션이 "닫힌 상태"를 전제로 하므로, 열려 있다면 각
-- 섹션 안에서 임시로 app_config를 닫았다가(트랜잭션 내) 다시 여는
-- 방식으로 진행한다(운영 값은 실제로 바꾸지 않음 — 전부 ROLLBACK).
select * from public.app_config where id = 1;


-- =========================================================
-- A) 권한(GRANT) 확인 — role 흉내 없이 카탈로그로 확인
--
-- 기대: admin_* 3개는 authenticated만 true(anon/public false).
-- get_invite_status는 anon/authenticated 둘 다 true.
-- =========================================================

select
  has_function_privilege('anon', 'public.admin_create_invite_link(smallint, text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_create_invite_link(smallint, text)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.admin_list_invite_links(integer, integer)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_list_invite_links(integer, integer)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.admin_deactivate_invite_link(uuid)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.admin_deactivate_invite_link(uuid)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.get_invite_status(text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.get_invite_status(text)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.get_signup_availability(text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.get_signup_availability(text)', 'execute') as authenticated_can_exec;

select
  has_function_privilege('anon', 'public.complete_onboarding(text, text, text, text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.complete_onboarding(text, text, text, text)', 'execute') as authenticated_can_exec;

-- invite_links/invite_link_uses 테이블 자체는 anon/authenticated 둘 다
-- 완전 차단이어야 한다(기대: 전부 false).
select
  has_table_privilege('anon', 'public.invite_links', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.invite_links', 'select') as authenticated_select,
  has_table_privilege('anon', 'public.invite_link_uses', 'select') as anon_select_uses,
  has_table_privilege('authenticated', 'public.invite_link_uses', 'select') as authenticated_select_uses;


-- =========================================================
-- B) anon 역할로 admin_* 직접 호출 — GRANT 단계 거절 확인
--
-- 기대: 함수 본문까지 가지 못하고 "permission denied for function ..."
-- =========================================================

begin;
set local role anon;
select public.admin_create_invite_link(5, 'test');
rollback;

begin;
set local role anon;
select * from public.admin_list_invite_links();
rollback;

begin;
set local role anon;
select public.admin_deactivate_invite_link(gen_random_uuid());
rollback;


-- =========================================================
-- C) authenticated이지만 운영자 아님 — 함수 본문 재검증 확인
--
-- 기대: 3개 함수 전부 "not authorized"(SQLSTATE 42501).
-- 가짜 uuid로 충분하다(admin_users 멤버십만 확인, auth.users 참조 없음).
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
set local role authenticated;

select public.admin_create_invite_link(5, 'test');        -- 예외 기대
select * from public.admin_list_invite_links();            -- 예외 기대
select public.admin_deactivate_invite_link(gen_random_uuid()); -- 예외 기대
rollback;


-- =========================================================
-- D) authenticated + 실제 운영자 — 정상 동작(생성 → 목록 → 비활성화)
--
-- <OPERATOR_UUID>를 0-1에서 확인한 값으로 바꿔서 실행. 한 트랜잭션
-- 안에서 생성 → 목록에 보이는지 → 비활성화 → 목록에서 상태 바뀌는지
-- 를 이어서 확인하고 마지막에 ROLLBACK으로 되돌린다.
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OPERATOR_UUID>')::text, true);
set local role authenticated;

-- D-1) 입력 검증
select public.admin_create_invite_link(2, null);   -- 예외 기대(p_max_uses는 1/3/5/10만)
select public.admin_create_invite_link(5, repeat('a', 201)); -- 예외 기대(note 200자 초과)

-- D-2) 정상 생성 — token은 여기서만 보인다. 아래에 복사해 두고 이후
-- 섹션(특히 K)에서 <TEST_TOKEN>으로 사용한다.
select * from public.admin_create_invite_link(5, '보안 테스트용');
  -- 반환된 id를 아래 <INVITE_ID>로, token을 <TEST_TOKEN>으로 사용

-- D-3) 목록에 보이는지 — token/token_hash 컬럼 자체가 없는지 확인
select * from public.admin_list_invite_links(50, 0);

-- D-4) 비활성화 → 없는 id
select public.admin_deactivate_invite_link(gen_random_uuid()); -- 예외 기대(찾을 수 없음)

-- D-5) 비활성화 → 방금 만든 id(<INVITE_ID>로 교체)
select public.admin_deactivate_invite_link('<INVITE_ID>');
select * from public.admin_list_invite_links(50, 0);
  -- 방금 만든 row의 is_active가 false로 보여야 함

rollback;


-- =========================================================
-- E) admin_list_invite_links — 입력 검증
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OPERATOR_UUID>')::text, true);
set local role authenticated;

select * from public.admin_list_invite_links(0, 0);    -- 예외 기대(p_limit < 1)
select * from public.admin_list_invite_links(101, 0);  -- 예외 기대(p_limit > 100)
select * from public.admin_list_invite_links(20, -1);  -- 예외 기대(p_offset < 0)
rollback;


-- =========================================================
-- F) get_invite_status — 상태별 확인
--
-- 실제 token 생성 로직(admin_create_invite_link)과 동일한 해시 방식
-- (encode(sha256(token::bytea),'hex'))으로 직접 row를 만들어 각
-- 상태를 재현한다. 전부 anon 역할로 호출(로그인 전 UX 상황 재현).
-- =========================================================

begin;

-- F-1) valid
insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-valid'::bytea), 'hex'), 5, 0, true, now() + interval '1 day');

-- F-2) expired
insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-expired'::bytea), 'hex'), 5, 0, true, now() - interval '1 hour');

-- F-3) exhausted
insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-exhausted'::bytea), 'hex'), 1, 1, true, now() + interval '1 day');

-- F-4) inactive
insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-inactive'::bytea), 'hex'), 5, 0, false, now() + interval '1 day');

set local role anon;

select public.get_invite_status('test-token-valid');       -- 'valid' 기대
select public.get_invite_status('test-token-expired');     -- 'expired' 기대
select public.get_invite_status('test-token-exhausted');   -- 'exhausted' 기대
select public.get_invite_status('test-token-inactive');    -- 'inactive' 기대
select public.get_invite_status('test-token-nonexistent'); -- 'invalid' 기대
select public.get_invite_status(null);                     -- 'invalid' 기대
select public.get_invite_status('');                        -- 'invalid' 기대

rollback;


-- =========================================================
-- G) has_active_invite_capacity() / hook_check_signup_period() — Hook 동작
--
-- private 함수라 SQL Editor(postgres/superuser)에서는 owner 권한으로
-- 직접 호출 가능(테스트 목적). 실제 anon/authenticated는 애초에 이
-- 함수를 이름으로 참조조차 못한다(private 스키마 USAGE 없음) — 이건
-- A 섹션의 GRANT 확인과 별개로, 스키마 USAGE 자체를 확인하려면:
-- =========================================================

select
  has_schema_privilege('anon', 'private', 'usage') as anon_usage,
  has_schema_privilege('authenticated', 'private', 'usage') as authenticated_usage;
  -- 기대: 둘 다 false

begin;
-- 활성 초대가 하나도 없는 상태를 재현 — 있는 row는 전부 무효화
update public.invite_links set is_active = false;

select private.has_active_invite_capacity();  -- false 기대
select public.hook_check_signup_period('{}'::jsonb);
  -- app_config가 열려있으면 '{}', 닫혀있으면 {"error":{"message":"signup closed",...}}

insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-capacity'::bytea), 'hex'), 5, 0, true, now() + interval '1 day');

select private.has_active_invite_capacity();  -- true 기대
select public.hook_check_signup_period('{}'::jsonb);
  -- 활성 초대가 생겼으므로 이제 항상 '{}' (가입기간과 무관하게 통과)

rollback;


-- =========================================================
-- H) get_signup_availability(p_invite_token) — 클라이언트 사전확인
--
-- app_config를 실제로 바꾸지 않고, 트랜잭션 안에서 임시로 닫아
-- "닫힌 기간" 케이스를 재현한다(끝나면 ROLLBACK으로 원복).
-- =========================================================

begin;

-- H-1) 가입 열림: 토큰 유무/유효성과 무관하게 항상 true
update public.app_config set signup_open = true, signup_opens_at = null, signup_closes_at = null where id = 1;
select public.get_signup_availability(null);                    -- true 기대
select public.get_signup_availability('아무 토큰이나 상관없음'); -- true 기대(무시됨)

-- H-2) 가입 닫힘 + 초대 없음/토큰 없음
update public.app_config set signup_open = false where id = 1;
select public.get_signup_availability(null);          -- false 기대
select public.get_signup_availability('');             -- false 기대

-- H-3) 가입 닫힘 + 유효한 초대 존재, 그런데 엉뚱한 토큰
insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-h3-real'::bytea), 'hex'), 5, 0, true, now() + interval '1 day');

select public.get_signup_availability('wrong-token');   -- false 기대(활성 초대가 있어도 이 토큰은 아님)

-- H-4) 가입 닫힘 + 정확히 일치하는 유효 토큰
select public.get_signup_availability('test-token-h3-real'); -- true 기대

-- H-5) 가입 닫힘 + 소진/만료/비활성 토큰
insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-h5-exhausted'::bytea), 'hex'), 1, 1, true, now() + interval '1 day');
select public.get_signup_availability('test-token-h5-exhausted'); -- false 기대

rollback;


-- =========================================================
-- I) complete_onboarding() — 가짜 uuid로 안전하게 테스트 가능한 실패 케이스
--
-- 아래 케이스들은 profiles/invite_link_uses INSERT에 도달하기 전에
-- 이미 예외로 끝나므로, auth.users에 실제로 존재하지 않는 uuid를
-- sub로 써도 FK 위반 없이 정확히 이 로직만 검증된다.
-- =========================================================

begin;

-- I-1) 인증 안 됨
select public.complete_onboarding('닉네임', 'test-slug-i1', null, null);
  -- 예외 기대: not authenticated (role을 authenticated로 바꾸지 않은 채 호출)

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
set local role authenticated;

-- I-2) 가입 닫힘 + 토큰 없음
update public.app_config set signup_open = false where id = 1;
select public.complete_onboarding('닉네임', 'test-slug-i2', null, null);
  -- 예외 기대: signup closed

-- I-3) 가입 닫힘 + 존재하지 않는/틀린 토큰
select public.complete_onboarding('닉네임', 'test-slug-i3', null, 'no-such-token');
  -- 예외 기대: invalid invite

-- I-4) 가입 닫힘 + 소진된 토큰(위 H-5와 동일 패턴으로 새로 생성)
insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-i4-exhausted'::bytea), 'hex'), 1, 1, true, now() + interval '1 day');
select public.complete_onboarding('닉네임', 'test-slug-i4', null, 'test-token-i4-exhausted');
  -- 예외 기대: invalid invite

-- I-4 확인: uses_count가 여전히 1인지(증가하지 않았는지)
select uses_count, max_uses from public.invite_links
  where token_hash = encode(sha256('test-token-i4-exhausted'::bytea), 'hex');
  -- uses_count = 1 (max_uses와 동일, 증가 없음) 기대

rollback;


-- =========================================================
-- J) 원자적 소비 로직 단독 검증 — 동시성 가드
--
-- complete_onboarding() 전체를 거치지 않고, 그 안에서 실제로 실행되는
-- UPDATE 문과 완전히 동일한 패턴만 떼어내 검증한다(auth.users FK
-- 필요 없음). max_uses=1인 링크에 대해 같은 UPDATE를 두 번 실행해
-- 두 번째가 반드시 0 row인지 확인 — 이게 "동시에 두 요청이 마지막
-- 1자리를 두고 경쟁"하는 상황에서 실제 RPC가 안전한 이유의 핵심이다
-- (row-level lock을 잡는 동일한 문장이므로, 진짜 동시 요청에서도
-- 이 순서 중 하나만 성공하고 나머지는 여기서 재현한 것과 동일하게
-- 0 row를 받는다). 진짜 동시(병렬) 요청 자체를 재현하려면 SQL
-- Editor 한 세션으로는 안 되고 별도의 두 연결(예: 두 개의 curl로
-- 동시에 complete_onboarding RPC 호출)이 필요하다 — DB 배포 후,
-- 프론트 연결 전 단계에서는 아래 순차 재현으로 로직 정확성만 먼저
-- 확인한다.
-- =========================================================

begin;

insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-race'::bytea), 'hex'), 1, 0, true, now() + interval '1 day');

-- 첫 번째 "요청"
update public.invite_links
  set uses_count = uses_count + 1
  where token_hash = encode(sha256('test-token-race'::bytea), 'hex')
    and is_active
    and uses_count < max_uses
    and expires_at > now()
  returning id, uses_count;
  -- 1 row 기대, uses_count = 1

-- 두 번째 "요청"(같은 토큰, 같은 조건) — 이미 소진됨
update public.invite_links
  set uses_count = uses_count + 1
  where token_hash = encode(sha256('test-token-race'::bytea), 'hex')
    and is_active
    and uses_count < max_uses
    and expires_at > now()
  returning id, uses_count;
  -- 0 row 기대(아무 것도 반환되지 않음) — max_uses=1 링크가 2번 소비되지 않음

rollback;


-- =========================================================
-- K) complete_onboarding() — 초대 소비 happy path (E2E, 실제 계정 필요)
--
-- 이 섹션만 auth.users(id)에 실제로 존재하는 uuid가 필요하다
-- (invite_link_uses.user_id FK, 그리고 성공 시 profiles.user_id FK).
--
-- 준비:
--   1) Supabase 대시보드 → Authentication → Users → Add user로
--      테스트 전용 더미 계정을 하나 만든다(예: invite-test@example.com,
--      비밀번호는 대시보드가 요구하는 형식으로 아무 값). 생성된
--      user id를 복사해 <TEST_USER_UUID>로 아래에서 사용한다.
--   2) 이 계정은 profiles row가 없는 상태여야 한다(방금 만든
--      계정이면 당연히 없음).
--
-- 실행(ROLLBACK으로 감싸므로 실제로 profiles/invite_links는 바뀌지
-- 않는다 — 로직만 확인):
-- =========================================================

begin;

update public.app_config set signup_open = false where id = 1;

insert into public.invite_links (token_hash, max_uses, uses_count, is_active, expires_at)
values (encode(sha256('test-token-k-happy'::bytea), 'hex'), 5, 0, true, now() + interval '1 day');

select set_config('request.jwt.claims', json_build_object('sub', '<TEST_USER_UUID>')::text, true);
set local role authenticated;

select public.complete_onboarding('초대테스트', 'invite-e2e-test-slug', null, 'test-token-k-happy');
  -- 예외 없이 정상 종료 기대

-- 확인 1: uses_count가 0 → 1로 증가했는지
select uses_count, max_uses from public.invite_links
  where token_hash = encode(sha256('test-token-k-happy'::bytea), 'hex');

-- 확인 2: invite_link_uses에 감사 로그가 남았는지
select * from public.invite_link_uses iu
  join public.invite_links il on il.id = iu.invite_link_id
  where il.token_hash = encode(sha256('test-token-k-happy'::bytea), 'hex');

-- 확인 3: profile이 실제로 생겼는지
select user_id, nickname, slug from public.profiles where user_id = '<TEST_USER_UUID>';

rollback; -- 전부 원복. 실제로 반영해서 끝까지 확인하고 싶다면 이 섹션만
          -- 별도로 COMMIT으로 바꿔 실행한 뒤, 아래 K-정리 섹션으로 치운다.


-- =========================================================
-- K-정리) 테스트 더미 계정 삭제
--
-- K 섹션을 COMMIT으로 실제 실행했다면, 테스트가 끝난 뒤 반드시
-- Supabase 대시보드에서 <TEST_USER_UUID> 계정을 삭제한다(auth.users
-- 삭제 시 on delete cascade로 profiles/home_customize/
-- invite_link_uses row도 함께 정리됨 — invite_links 자체는 남지만
-- 테스트용 링크이므로 admin_deactivate_invite_link()로 비활성화하거나
-- 그대로 둬도 uses_count 표시 외에는 무해함).
-- =========================================================


-- =========================================================
-- L) 기존 가입 흐름 회귀 — 가입 열린 상태에서 초대 관련 코드가 전혀
--    끼어들지 않는지 최종 확인
-- =========================================================

begin;

update public.app_config set signup_open = true, signup_opens_at = null, signup_closes_at = null where id = 1;

-- Hook: 가입 열림이면 초대 유무와 무관하게 항상 통과
update public.invite_links set is_active = false; -- 활성 초대 0개로 만들어도
select public.hook_check_signup_period('{}'::jsonb); -- '{}' 기대(초대 없이도 통과)

-- get_signup_availability: 토큰 없이도 true
select public.get_signup_availability(null); -- true 기대

rollback;
