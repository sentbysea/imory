-- =========================================================
-- INVITES — 2단계: 신규 계정 생성 게이트 (Hook + get_signup_availability)
--
-- [[20260903150000_create_invite_links.sql]]에서 만든 invite_links를
-- 이용해, "가입 기간은 닫혀 있지만 활성 초대 링크가 있는" 상태에서도
-- Before User Created Hook이 auth.users 생성을 막지 않게 한다.
--
-- 중요한 구조적 한계(설계 논의에서 이미 확정): Supabase Before User
-- Created Hook은 event(jsonb)로 provider가 준 user 정보만 받고,
-- OAuth 로그인 경로에서 클라이언트가 "이 요청은 어떤 초대 토큰을
-- 들고 왔는지"를 Hook에 실어 보낼 방법이 없다(email/OTP 가입의
-- signUp({ options: { data } })에 해당하는 필드가 signInWithOAuth에는
-- 없음). 그래서 Hook은 "토큰 자체"가 아니라 "지금 시스템에 사용
-- 가능한 초대 링크가 하나라도 있는가"만 판단한다(1차, 성긴 방어).
-- 실제로 그 사용자가 유효한 토큰을 들고 왔는지는 뒤이은
-- complete_onboarding()(2차, 원자적 검증+소비, 후속 migration)이
-- 최종 판정한다 — is_signup_open()/complete_onboarding()의 기존
-- 3중 방어 패턴과 동일한 구조를 그대로 재사용.
--
-- 알려진 트레이드오프(반드시 인지할 것): 활성 초대 링크가 하나라도
-- 존재하는 동안에는, 그 토큰을 전혀 갖고 있지 않은 제3자가 Google
-- 로그인을 시도해도 auth.users row 생성 자체는 Hook을 통과한다(뒤의
-- complete_onboarding()에서 결국 거절되어 profile은 생기지 않지만,
-- "고아" auth.users row가 남을 수 있음). 이건 가입 기간이 열려있을
-- 때 온보딩을 중도 포기하는 경우와 같은 종류의 노이즈이고, 활성
-- 초대가 하나도 없는 보통 상태(닫힌 기간의 기본값)에서는 기존과
-- 동일하게 완전 차단이 유지된다.
-- =========================================================


-- =========================================================
-- 1) private.has_active_invite_capacity() — "지금 쓸 수 있는 초대가
--    하나라도 있는가"만 보는 내부 전용 함수
--
-- 어떤 토큰인지는 전혀 보지 않는다(볼 수 없다) — 활성(is_active) +
-- 소진 안 됨(uses_count < max_uses) + 만료 안 됨(expires_at > now())
-- 조건을 만족하는 row가 하나라도 있는지만 확인.
--
-- private 스키마 소속 — anon/authenticated는 애초에 이름으로
-- 참조할 수조차 없다([[20260903130000_add_admin_users_operator_foundation.sql]]
-- 의 private.is_operator()와 동일한 격리 방식). SECURITY DEFINER +
-- search_path = ''로 invite_links의 RLS를 owner 권한으로 우회해
-- 읽는다. fail-closed: 예외 시 false(가입 불가 쪽).
-- =========================================================

create or replace function private.has_active_invite_capacity()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.invite_links
    where is_active
      and uses_count < max_uses
      and expires_at > now()
  );
exception
  when others then
    return false;
end;
$$;

comment on function private.has_active_invite_capacity() is
  '활성(is_active) + 미소진(uses_count < max_uses) + 미만료(expires_at > now()) 초대 링크가 하나라도 있는지만 확인한다. 어떤 토큰인지는 모른다/볼 수 없다 — hook_check_signup_period()의 성긴 1차 판정용. 실제 토큰 검증/소비는 complete_onboarding()에서 별도로 수행한다. fail-closed: 오류 시 false.';

revoke execute on function private.has_active_invite_capacity() from public;


-- =========================================================
-- 2) public.hook_check_signup_period(event) — 판정 조건 확장
--
-- 기존: is_signup_open()만 보고 거절.
-- 변경: is_signup_open() OR has_active_invite_capacity() 면 통과.
--
-- 시그니처(event jsonb)는 그대로이므로 CREATE OR REPLACE로 충분하고
-- 기존 GRANT(supabase_auth_admin만 EXECUTE)도 유지된다. fail-closed/
-- 에러 메시지("signup closed", http_code 403)는 기존과 동일하게
-- 유지 — auth-callback.js의 whitelist 매핑을 바꿀 필요가 없다.
-- =========================================================

create or replace function public.hook_check_signup_period(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_signup_open() or private.has_active_invite_capacity() then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'signup closed',
      'http_code', 403
    )
  );
exception
  when others then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'signup closed',
        'http_code', 403
      )
    );
end;
$$;

comment on function public.hook_check_signup_period(jsonb) is
  'Supabase Before User Created Auth Hook. is_signup_open()이 false여도 has_active_invite_capacity()가 true면(시스템에 활성 초대 링크가 하나라도 있으면) 통과시킨다 — 실제 토큰이 유효한지는 이 단계에서 알 수 없고(OAuth 경로는 Hook에 커스텀 데이터를 실어 보낼 수 없음), complete_onboarding()이 최종 재검증+소비한다. 둘 다 false면 기존과 동일하게 거절({"error":{"message":"signup closed","http_code":403}}). 기존 사용자 재로그인에는 호출되지 않음. 내부 오류도 거절로 처리(fail closed).';


-- =========================================================
-- 3) public.get_signup_availability() → get_signup_availability(p_invite_token)
--
-- auth-callback.js가 "profile 없는 신규 세션을 onboarding으로 보낼지"
-- 판단할 때 쓰는 클라이언트용 wrapper. 초대 토큰을 선택적으로 받아
-- 같은 기준(활성/미소진/미만료 + 해당 토큰 일치)으로 판정한다 — 이건
-- 아직 "소비"가 아니라 순수 읽기 전용 사전 확인이다(실제 소비는
-- complete_onboarding()에서만 일어남).
--
-- 인자 개수가 바뀌므로(0개 → 1개, default null) CREATE OR REPLACE로는
-- 기존 0-인자 함수를 대체하지 못하고 별도 오버로드로 남는다 — 그러면
-- PostgREST가 인자 없이 호출하는 기존 프론트 코드를 계속 옛 0-인자
-- 버전으로 라우팅해 새 로직이 전혀 타지 않는다. 그래서 기존 0-인자
-- 함수를 명시적으로 DROP한 뒤 새로 만든다. (imory 프론트의
-- auth-callback.js가 새 시그니처로 호출하도록 바꾸는 작업은 이번
-- migration 범위 밖 — DB만 먼저 배포)
-- =========================================================

drop function if exists public.get_signup_availability();

create or replace function public.get_signup_availability(p_invite_token text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if public.is_signup_open() then
    return true;
  end if;

  if p_invite_token is null or char_length(p_invite_token) = 0 then
    return false;
  end if;

  v_hash := encode(sha256(p_invite_token::bytea), 'hex');

  return exists (
    select 1
    from public.invite_links
    where token_hash = v_hash
      and is_active
      and uses_count < max_uses
      and expires_at > now()
  );
exception
  when others then
    return false;
end;
$$;

comment on function public.get_signup_availability(text) is
  '가입 가능 여부를 노출하는 클라이언트용 wrapper. is_signup_open()이 true면 p_invite_token은 완전히 무시하고 true. false면 p_invite_token이 활성/미소진/미만료 상태로 존재할 때만 true(순수 읽기 전용 사전 확인 — 소비하지 않음, 실제 소비는 complete_onboarding()). signup_opens_at/signup_closes_at, invite_links의 note/created_by 등 원문 설정값은 노출하지 않는다. 오류 시 false(fail closed). auth-callback.js 신규 사용자 분기에서 사용.';

revoke execute on function public.get_signup_availability(text) from public;
grant execute on function public.get_signup_availability(text) to anon, authenticated;
