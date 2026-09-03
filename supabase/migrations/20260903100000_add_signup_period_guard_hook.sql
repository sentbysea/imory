-- =========================================================
-- SIGNUP PERIOD GUARD — 1차 방어 (Before User Created Hook)
--
-- 다음 순서로 이어지는 3중 방어 중 A(공통 판정 함수) + B(Hook)만
-- 이번 migration에 포함한다. complete_onboarding() 재검사(C)와
-- auth-callback.js 보조 검사(D)는 별도 작업.
--
-- 배경: app_config.signup_open/signup_opens_at/signup_closes_at은
-- 20260830132600_*.sql에 이미 존재하지만 지금까지 signup_open만
-- auth-callback.js에서 읽혔고(온보딩 화면 진입만 제한), 신규
-- auth.users 생성 자체를 막는 서버 측 장치는 없었다. 이 migration은
-- 그 ①단계(auth.users 생성)를 Supabase Before User Created Hook으로
-- 막는다.
-- =========================================================


-- =========================================================
-- A. public.is_signup_open() — 가입 가능 여부 단일 판정 함수
--
-- 규칙(요구사항 그대로):
--   signup_open = true
--   and (signup_opens_at is null or signup_opens_at <= now())
--   and (signup_closes_at is null or now() < signup_closes_at)
--
-- - 시작 포함(<=), 종료 미포함(<).
-- - opens_at/closes_at이 null이면 해당 경계 제한 없음(무제한).
-- - now()는 Postgres 서버 시각(UTC) — 클라이언트/브라우저 시각 미사용.
-- - app_config는 id=1 singleton. row가 없거나(운영 실수로 삭제 등)
--   조회 중 예기치 못한 오류가 나면 "가입 가능"으로 fail-open 되면
--   안 되므로 명시적으로 false를 반환한다(exception 블록 포함).
-- - SECURITY DEFINER: app_config는 RLS가 걸려 있고 anon/authenticated
--   컬럼 GRANT도 (id, signup_open)만 열려 있어(signup_opens_at/
--   signup_closes_at 컬럼 GRANT 없음), invoker 권한으로는 이 함수가
--   기간 컬럼을 읽지 못하는 경우가 생긴다. 이 함수의 owner(=이
--   migration을 실행하는 role, 곧 app_config의 owner)로 실행되도록
--   SECURITY DEFINER + SET search_path로 고정해 RLS/컬럼GRANT와
--   무관하게 항상 안전하게 판정할 수 있게 한다. 이후 Hook과
--   complete_onboarding() 양쪽에서 그대로 재사용한다.
-- - STABLE: 같은 트랜잭션/statement 내에서 부작용 없이 값만
--   읽으므로 STABLE로 선언(불필요한 재평가 방지).
-- - search_path = ''(빈 문자열): SECURITY DEFINER 함수에서 이름 해석이
--   호출자의 search_path에 영향받지 않도록 Supabase 공식 권장 방식대로
--   완전히 비운다. 그래서 본문의 모든 스키마 객체는 public.app_config
--   처럼 전부 schema-qualified 상태여야 한다(아래 본문 확인 완료).
--   now()/coalesce()/jsonb_build_object() 등 내장 함수와 boolean/
--   timestamptz 같은 내장 타입은 pg_catalog 소속이라 search_path가
--   비어 있어도 항상 암묵적으로 먼저 검색되므로 별도 qualify 불필요.
-- - EXECUTE 권한: 아래에서 PUBLIC/anon/authenticated 전부 명시적으로
--   revoke한다 — 지금 단계에서는 Hook 내부 호출(같은 owner라 owner
--   권한으로 통과) 외에 클라이언트가 직접 부를 이유가 없다. callback/
--   랜딩에서 필요해지면 그때 별도의 최소 노출 RPC를 설계한다.
-- =========================================================

create or replace function public.is_signup_open()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_signup_open boolean;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
begin
  select signup_open, signup_opens_at, signup_closes_at
    into v_signup_open, v_opens_at, v_closes_at
    from public.app_config
    where id = 1;

  if not found then
    -- app_config singleton row가 없음 — fail closed
    return false;
  end if;

  return coalesce(v_signup_open, false)
    and (v_opens_at is null or v_opens_at <= now())
    and (v_closes_at is null or now() < v_closes_at);
exception
  when others then
    -- 예기치 못한 오류도 fail closed(가입 허용 쪽으로 새지 않도록)
    return false;
end;
$$;

comment on function public.is_signup_open() is
  '가입 가능 여부 단일 판정 함수. app_config(id=1)의 signup_open/signup_opens_at/signup_closes_at을 서버 시각(now()) 기준으로 검사한다. 시작 포함·종료 미포함. row 없음/오류 시 false(fail closed). Before User Created Hook과 complete_onboarding()에서 재사용.';

-- 지금 단계에서는 이 함수를 직접 호출할 클라이언트/역할이 없다
-- (Hook은 아래 hook_check_signup_period가 SECURITY DEFINER owner
-- 권한으로 내부 호출하므로 별도 EXECUTE grant가 필요 없음 — owner는
-- 자신이 만든 함수에 대해 REVOKE ALL FROM PUBLIC 이후에도 암묵적
-- EXECUTE 권한을 그대로 유지한다). 그래서 기본 PUBLIC EXECUTE를
-- 명시적으로 제거해 최소 권한을 유지한다.
revoke execute on function public.is_signup_open() from public;
revoke execute on function public.is_signup_open() from anon, authenticated;


-- =========================================================
-- B. public.hook_check_signup_period(event jsonb) — Before User Created Hook
--
-- Supabase Auth Hooks 공식 규약:
--   - 입력: event jsonb (metadata/user 포함, 이 함수는 사용하지 않음 —
--     provider 무관하게 가입 기간만 검사)
--   - 허용: '{}'::jsonb 반환
--   - 거절: {"error": {"message": ..., "http_code": ...}} 형태 반환
--
-- 신규 auth.users row가 실제로 insert되기 직전에만 호출되고
-- (Supabase 공식 문서 기준), 이미 auth.users row가 있는 기존
-- 사용자의 재로그인에는 호출되지 않는다 — 즉 기존 회원 로그인은
-- 이 Hook의 영향을 받지 않는다.
--
-- message는 "signup closed"로 짧고 고정된 식별 문자열을 쓴다.
-- 사용자에게 보여줄 한글 안내 문구는 이후 auth-callback.js(2차
-- 방어, D단계)에서 이 문자열을 화이트리스트 매핑해서 표시한다 —
-- 이 함수가 내부 SQL 오류 메시지를 그대로 노출하지 않도록,
-- 예외 발생 시에도 동일한 짧은 문자열로만 거절한다.
--
-- fail-closed: is_signup_open() 자체가 이미 내부적으로 fail-closed지만,
-- 이 함수 레벨에서도 예상치 못한 예외가 발생하면(예: is_signup_open이
-- 존재하지 않거나 배포가 꼬인 경우) unhandled exception이 Supabase
-- Auth 쪽에서 어떻게 처리되는지 문서상 명확히 보장되지 않으므로,
-- 이 함수 자체가 모든 예외를 잡아 명시적으로 거절 응답을 반환한다
-- (fail-open으로 새어나갈 여지를 원천 차단).
--
-- SECURITY DEFINER: Hook은 supabase_auth_admin 롤로 호출된다. 이
-- 롤은 is_signup_open()/app_config에 대한 별도 권한이 없으므로,
-- 이 함수도 owner(migration 실행 role) 권한으로 실행되도록
-- SECURITY DEFINER + SET search_path로 고정한다.
--
-- search_path = ''(빈 문자열): is_signup_open()과 동일한 이유(Supabase
-- 공식 권장) — 본문에서 참조하는 유일한 스키마 객체 public.is_signup_open()
-- 은 이미 schema-qualified. jsonb_build_object()는 pg_catalog 소속이라
-- search_path가 비어 있어도 항상 해석됨.
--
-- owner/EXECUTE 관계 확인: 이 함수는 SECURITY DEFINER이므로 실행 중
-- current_user가 이 함수의 owner(=마이그레이션을 실행한 role, 이
-- 파일의 is_signup_open()과 owner가 동일)로 전환된다. 내부에서
-- public.is_signup_open()을 호출할 때 EXECUTE 권한 검사도 이 시점의
-- current_user(=owner)를 기준으로 이뤄지므로, is_signup_open()에서
-- PUBLIC/anon/authenticated EXECUTE를 전부 revoke해도 owner는 자신이
-- 만든 함수에 대한 암묵적 EXECUTE 권한을 그대로 가지고 있어 내부 호출은
-- 정상 동작한다(별도 grant 불필요). 동일한 이유로, 이후 C단계에서
-- complete_onboarding()이 같은 owner로 SECURITY DEFINER 유지된다면
-- 거기서도 별도 grant 없이 is_signup_open()을 호출할 수 있다 — 단,
-- 이 전제(같은 owner)가 깨지지 않도록 이 migration과 이후 마이그레이션을
-- 같은 DB role(Supabase SQL Editor 기본 접속 role)로 실행해야 한다.
--
-- 권한: supabase_auth_admin만 EXECUTE 가능. anon/authenticated/
-- public에서는 명시적으로 제거 — 클라이언트가 이 함수를 직접
-- 호출할 이유가 없고, 호출 가능하게 두면 event 인자를 임의로
-- 조작해 판정 로직을 관찰/악용할 여지를 열어주므로 차단한다.
-- 이 함수는 service role 키나 다른 client secret을 전혀 사용하지
-- 않는다(순수 SQL 판정) — Hook 호출 자체가 Supabase Auth 서버가
-- DB 커넥션으로 직접 실행하는 것이라 별도 인증 수단이 필요 없다.
-- =========================================================

create or replace function public.hook_check_signup_period(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_signup_open() then
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
  'Supabase Before User Created Auth Hook. is_signup_open()이 false면 신규 auth.users 생성을 거절한다({"error":{"message":"signup closed","http_code":403}}). 기존 사용자 재로그인에는 호출되지 않음(Supabase Auth가 신규 생성 시에만 호출). 내부 오류도 동일하게 거절로 처리(fail closed).';

grant execute on function public.hook_check_signup_period(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_check_signup_period(jsonb) from authenticated, anon, public;
