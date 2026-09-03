-- =========================================================
-- 운영자 RPC 전체 — GRANT 최소권한 강화 (anon EXECUTE 회수)
--
-- 배경: INVITES 관련 admin_* RPC 3종을 수동 테스트하던 중
-- (20260903_invites_manual_test.sql A 섹션) anon 역할에도
-- has_function_privilege(...)='execute'가 true로 나오는 것을
-- 발견했다. 이어서 기존에 배포되어 있던 admin_* RPC 4종
-- (admin_get_member_count / admin_list_recent_signups /
-- admin_get_signup_config / admin_set_signup_config,
-- [[20260903140000_add_admin_operator_data_rpcs.sql]])까지 전수
-- 조사한 결과, public.admin_* 운영자 RPC 7개 전부가 동일하게
-- anon EXECUTE = true였다.
--
-- 원인: 이 프로젝트 public 스키마에 스키마 레벨 기본 권한(ALTER
-- DEFAULT PRIVILEGES ... IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
-- TO anon, authenticated, ...)이 걸려 있다. 새 함수가 CREATE될 때마다
-- Postgres 기본 동작(PUBLIC에 자동 EXECUTE 부여)과는 별개로 anon/
-- authenticated 앞으로 직접 EXECUTE grant가 하나 더 자동으로 붙는다.
-- 각 admin_* migration이 명시했던 "revoke ... from public; grant ...
-- to authenticated"는 PUBLIC 의사-role 몫만 지울 뿐, anon 앞으로
-- 별도로 찍힌 이 직접 grant는 건드리지 못했다 — authenticated에만
-- grant했을 뿐인데도 anon 몫이 그대로 남아 있었던 이유다.
--
-- 이 전역 기본 권한 설정 자체(ALTER DEFAULT PRIVILEGES)는 이번
-- migration 범위에서 건드리지 않는다 — 앞으로 만드는 모든 객체에
-- 영향을 미치는 광범위한 변경이라 별도 검토 없이 여기서 함께 처리
-- 하지 않는다. 대신 민감한 함수마다 "PUBLIC/anon 모두 명시적으로
-- revoke"하는 3줄 패턴을 항상 따르기로 하고 CLAUDE.md 4항에 프로젝트
-- 규칙으로 기록한다.
--
-- 함수 본문(private.is_operator() 재검증 / auth.uid() null 체크)이
-- 이미 실제 데이터 접근은 막고 있었으므로 지금까지 익스플로잇 가능한
-- 상태는 아니었다 — 다만 "함수-level GRANT도 최소 권한이어야 한다"는
-- 원칙(CLAUDE.md 4항)을 어겼으므로 명시적으로 바로잡는다. 함수 본문/
-- 시그니처는 전혀 바꾸지 않고 GRANT만 조정한다.
--
-- complete_onboarding()은 [[20260903170000_consume_invite_in_complete_onboarding.sql]]
-- 에서 의도적으로 anon도 grant 대상이었다(세션이 없으면 auth.uid()가
-- NULL이라 맨 앞에서 'not authenticated'로 즉시 거절되므로 무해하다는
-- 논리). 이번에 정책을 authenticated 전용으로 좁힌다 — 정상 호출
-- 경로는 항상 로그인 후(authenticated 세션)에만 이 함수를 부르므로
-- 동작에는 영향이 없고, 함수-level GRANT를 실제 호출 패턴과 일치
-- 시켜 방어를 한 겹 더한다.
--
-- get_invite_status(text)/get_signup_availability(text)는 원래부터
-- anon 허용이 의도된 설계(로그인 전 UX 사전확인)이므로 손대지 않는다.
-- =========================================================

-- INVITES admin_* RPC 3종 — 20260903180000_add_invite_admin_rpcs.sql
revoke execute on function public.admin_create_invite_link(smallint, text) from public;
revoke execute on function public.admin_create_invite_link(smallint, text) from anon;
grant execute on function public.admin_create_invite_link(smallint, text) to authenticated;

revoke execute on function public.admin_list_invite_links(integer, integer) from public;
revoke execute on function public.admin_list_invite_links(integer, integer) from anon;
grant execute on function public.admin_list_invite_links(integer, integer) to authenticated;

revoke execute on function public.admin_deactivate_invite_link(uuid) from public;
revoke execute on function public.admin_deactivate_invite_link(uuid) from anon;
grant execute on function public.admin_deactivate_invite_link(uuid) to authenticated;

-- 기존(INVITES 이전) admin_* RPC 4종 — 20260903140000_add_admin_operator_data_rpcs.sql
revoke execute on function public.admin_get_member_count() from public;
revoke execute on function public.admin_get_member_count() from anon;
grant execute on function public.admin_get_member_count() to authenticated;

revoke execute on function public.admin_list_recent_signups(integer, integer) from public;
revoke execute on function public.admin_list_recent_signups(integer, integer) from anon;
grant execute on function public.admin_list_recent_signups(integer, integer) to authenticated;

revoke execute on function public.admin_get_signup_config() from public;
revoke execute on function public.admin_get_signup_config() from anon;
grant execute on function public.admin_get_signup_config() to authenticated;

revoke execute on function public.admin_set_signup_config(boolean, timestamptz, timestamptz) from public;
revoke execute on function public.admin_set_signup_config(boolean, timestamptz, timestamptz) from anon;
grant execute on function public.admin_set_signup_config(boolean, timestamptz, timestamptz) to authenticated;

-- complete_onboarding() — anon 허용을 authenticated 전용으로 좁힌다.
-- public/authenticated grant는 이미 20260903170000에서 올바르게
-- 설정되어 있으므로 anon revoke만 추가한다.
revoke execute on function public.complete_onboarding(text, text, text, text) from anon;

-- get_invite_status(text) / get_signup_availability(text)는 변경 없음
-- (anon/authenticated 둘 다 의도된 설계 그대로 유지).
