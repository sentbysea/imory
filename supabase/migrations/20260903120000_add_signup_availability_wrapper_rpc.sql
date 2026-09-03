-- =========================================================
-- SIGNUP PERIOD GUARD — D단계 (auth-callback.js 공용 판정 사용)
--
-- [[20260903100000_add_signup_period_guard_hook.sql]]에서 만든
-- public.is_signup_open()을 auth-callback.js의 신규 사용자 분기에서도
-- 재사용하기 위한 최소 노출 wrapper RPC.
--
-- 배경: auth-callback.js는 지금까지 app_config.signup_open 컬럼만
-- 직접 SELECT해서(기간 조건 미반영) 신규 사용자를 /onboarding/으로
-- 보낼지 판단했다. Hook(1차)/complete_onboarding()(2차)는 이미
-- is_signup_open()의 signup_open + signup_opens_at + signup_closes_at
-- 전체 조건으로 판정하는데, callback만 signup_open 단독 조건을 쓰면
-- 세 지점의 기준이 어긋난다(예: signup_open=true인데 opens_at이
-- 아직 미래이거나 closes_at을 이미 지난 경우, callback은 열려있다고
-- 오판해 onboarding으로 보내버림 — 실제로는 Hook 통과 자체가 안 되므로
-- 신규 가입은 막히지만, 이미 세션이 있는 예외적 상태에서 UX가 어긋날
-- 수 있음).
--
-- is_signup_open()은 PUBLIC/anon/authenticated EXECUTE가 이미 revoke된
-- 상태([[20260903100000_add_signup_period_guard_hook.sql]] 참고)이고,
-- signup_opens_at/signup_closes_at 원문 컬럼도 anon/authenticated에
-- GRANT되어 있지 않다([[20260830140000_rls_profiles_app_config_home_customize.sql]]
-- 참고) — 그대로 열면 가입 기간 설정값(날짜)이 클라이언트에 노출된다.
-- 그래서 boolean 판정 결과 하나만 반환하는 별도 wrapper 함수를 만들고
-- 이 함수만 anon/authenticated에 EXECUTE를 연다.
--
-- SECURITY DEFINER + search_path = '': is_signup_open()과 동일한 이유
-- (Supabase 공식 권장, [[20260903100000_add_signup_period_guard_hook.sql]]
-- 참고) — owner 권한으로 실행되어야 PUBLIC EXECUTE가 revoke된
-- is_signup_open()을 별도 grant 없이 호출할 수 있다(owner는 자신이
-- 만든 함수에 대한 암묵적 EXECUTE 권한을 유지). 본문의 유일한 스키마
-- 객체 참조인 public.is_signup_open()도 이미 schema-qualified.
--
-- STABLE: is_signup_open()과 동일하게 같은 statement 내 부작용 없이
-- 값만 읽으므로 STABLE.
--
-- fail-closed: is_signup_open() 자체가 이미 모든 예외를 잡아 false를
-- 반환하므로 정상적으로는 이 함수에서 예외가 새어나올 일이 없지만,
-- Hook(hook_check_signup_period)과 동일한 방어 원칙을 유지하기 위해
-- 이 함수 레벨에서도 exception 블록으로 한 번 더 감싸 어떤 경우에도
-- false(가입 불가 쪽)로만 응답하도록 한다 — 절대 예외를 그대로
-- 클라이언트에 전파해 fail-open처럼 보이는 애매한 상태를 만들지 않는다.
--
-- 노출 범위: 이 함수는 boolean 결과 하나만 반환한다. app_config의
-- signup_open/signup_opens_at/signup_closes_at 원문 값이나 존재 여부,
-- app_config 테이블 구조에 대한 어떤 정보도 노출하지 않는다.
-- =========================================================

create or replace function public.get_signup_availability()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.is_signup_open();
exception
  when others then
    -- fail closed: 원인 불문 예외 시 가입 불가로 응답
    return false;
end;
$$;

comment on function public.get_signup_availability() is
  'public.is_signup_open()의 boolean 판정 결과만 노출하는 클라이언트용 wrapper RPC. signup_opens_at/signup_closes_at 등 원문 설정값은 노출하지 않는다. 오류 시 false(fail closed). auth-callback.js 신규 사용자 분기에서 사용.';

revoke execute on function public.get_signup_availability() from public;
grant execute on function public.get_signup_availability() to anon, authenticated;
