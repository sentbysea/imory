-- =========================================================
-- OPERATOR DASHBOARD — 2단계: 실제 운영 데이터 RPC 4종
--
-- [[20260903130000_add_admin_users_operator_foundation.sql]]에서 만든
-- admin_users / private.is_operator() / public.get_operator_status()
-- 위에, imory-ops 대시보드가 실제로 쓸 최초의 데이터 RPC 4개를 추가한다:
--
--   1) public.admin_get_member_count()          — 전체 가입 회원 수
--   2) public.admin_list_recent_signups(...)     — 최근 가입자 목록
--   3) public.admin_get_signup_config()          — 가입 설정 조회
--   4) public.admin_set_signup_config(...)       — 가입 설정 변경
--
-- imory-ops 프론트엔드에는 아직 연결하지 않는다(이번 범위는 DB만).
--
-- 공통 보안 원칙(기존 컨벤션 그대로, 참고:
-- [[20260903130000_add_admin_users_operator_foundation.sql]],
-- [[20260903100000_add_signup_period_guard_hook.sql]]):
--   - SECURITY DEFINER + SET search_path = ''(본문 전체 schema-qualified)
--   - PUBLIC EXECUTE 기본 revoke 후, authenticated에만 필요한 grant
--     (anon에는 열지 않음 — get_operator_status()처럼 "로그인 전에도
--     boolean 하나 보여주기" 용도가 아니라 실제 회원 데이터/설정을
--     다루는 RPC이므로 애초에 미인증 요청을 받을 이유가 없다)
--   - 함수 내부에서 매번 private.is_operator()로 재검증한다.
--     get_operator_status()는 "화면을 그릴지" 판단용 UX 게이트일
--     뿐이고, 실제 데이터를 다루는 이 4개 RPC는 그 결과를 전혀
--     신뢰하지 않는다(프론트 게이트 우회 대비) — 각자 이 migration
--     안에서 독립적으로 private.is_operator()를 호출해 다시 검사한다.
--   - service_role 미사용, 운영자 user_id 하드코딩 없음 — 판별은
--     항상 admin_users 테이블 + private.is_operator()를 통해서만.
--   - 비운영자가 호출하면 데이터를 전혀 반환하지 않고 예외로 거절한다
--     (빈 결과/false처럼 "정상 응답처럼 보이는 형태"로 새지 않도록).
--     SQLSTATE는 Postgres/PostgREST가 이미 권한 문제에 쓰는
--     42501(insufficient_privilege)로 통일해, 클라이언트가 필요하면
--     이 코드로 "권한 없음"과 다른 종류의 오류를 구분할 수 있게 한다.
--   - 기존 public.profiles / public.app_config의 RLS, column-level
--     GRANT, 그리고 /admin/(사용자 자신의 사이트 관리) 관련 어떤 것도
--     건드리지 않는다 — 전부 SECURITY DEFINER owner 권한으로 그
--     테이블들의 RLS를 우회해 직접 읽고 쓴다(is_signup_open()과 동일한
--     이유).
-- =========================================================


-- =========================================================
-- 1) public.admin_get_member_count() — 전체 가입 회원 수
--
-- "가입 회원"의 기준은 public.profiles에 row가 있는 사용자다 —
-- profiles row는 complete_onboarding() RPC가 성공했을 때만 생기므로
-- (auth.users만 있고 온보딩을 마치지 않은 경우는 세지 않음),
-- "실제로 서비스에 가입을 완료한 사람 수"와 일치한다.
--
-- STABLE: 같은 statement 내 부작용 없이 값만 읽음.
-- =========================================================

create or replace function public.admin_get_member_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return (
    select count(*)
    from public.profiles
  );
end;
$$;

comment on function public.admin_get_member_count() is
  '전체 가입 회원 수(public.profiles row 수) 반환. private.is_operator()로 매번 재검증하며 비운영자는 예외(42501)로 거절한다. imory-ops 대시보드 전용.';

revoke execute on function public.admin_get_member_count() from public;
grant execute on function public.admin_get_member_count() to authenticated;


-- =========================================================
-- 2) public.admin_list_recent_signups(p_limit, p_offset) — 최근 가입자 목록
--
-- 기본 정렬: created_at 내림차순(최신 가입순).
-- 반환 필드는 요청된 5개만: user_id, nickname, slug, home_mode,
-- created_at — bio/terms_agreed_at 등 그 외 profiles 컬럼은 노출하지
-- 않는다(운영 목적에 필요한 최소 필드만).
--
-- p_limit/p_offset 검증:
--   - p_limit: 1~100 (한 번에 100명 초과 조회 금지 — 대량 조회로
--     인한 부하/오남용 방지. 페이지네이션은 p_offset으로).
--   - p_offset: 0 이상.
-- 범위를 벗어나면 조용히 clamp하지 않고 예외로 거절한다 — 잘못된
-- 호출을 호출부가 바로 알아차리게 하기 위함(clamp는 실수를 숨긴다).
-- =========================================================

create or replace function public.admin_list_recent_signups(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  nickname text,
  slug text,
  home_mode text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid p_limit: must be between 1 and 100';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'invalid p_offset: must be >= 0';
  end if;

  return query
    select
      p.user_id,
      p.nickname,
      p.slug,
      p.home_mode,
      p.created_at
    from public.profiles p
    order by p.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;

comment on function public.admin_list_recent_signups(integer, integer) is
  '최근 가입자 목록(created_at 내림차순). user_id/nickname/slug/home_mode/created_at만 반환. p_limit(1~100)/p_offset(>=0) 범위를 벗어나면 예외. private.is_operator()로 매번 재검증하며 비운영자는 예외(42501)로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_list_recent_signups(integer, integer) from public;
grant execute on function public.admin_list_recent_signups(integer, integer) to authenticated;


-- =========================================================
-- 3) public.admin_get_signup_config() — 가입 설정 조회
--
-- app_config(id=1)의 signup_open/signup_opens_at/signup_closes_at을
-- 그대로 반환한다. signup_opens_at/signup_closes_at은 일반 사용자에게
-- column-level GRANT가 열려 있지 않은 컬럼이라([[20260830140000_rls_profiles_app_config_home_customize.sql]]
-- 참고 — anon/authenticated에는 (id, signup_open)만 grant됨), 운영자만
-- 이 RPC를 통해 확인할 수 있다.
-- =========================================================

create or replace function public.admin_get_signup_config()
returns table (
  signup_open boolean,
  signup_opens_at timestamptz,
  signup_closes_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select
      c.signup_open,
      c.signup_opens_at,
      c.signup_closes_at
    from public.app_config c
    where c.id = 1;
end;
$$;

comment on function public.admin_get_signup_config() is
  'app_config(id=1)의 signup_open/signup_opens_at/signup_closes_at 조회. signup_opens_at/signup_closes_at은 일반 사용자에게 컬럼 GRANT가 없어 이 RPC로만 확인 가능. private.is_operator()로 매번 재검증하며 비운영자는 예외(42501)로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_get_signup_config() from public;
grant execute on function public.admin_get_signup_config() to authenticated;


-- =========================================================
-- 4) public.admin_set_signup_config(p_signup_open, p_opens_at, p_closes_at)
--    — 가입 설정 변경
--
-- app_config(id=1)의 signup_open/signup_opens_at/signup_closes_at을
-- 통째로 교체하고 updated_at = now()를 갱신한다(부분 업데이트가
-- 아니라 3개 값을 항상 같이 지정 — 호출부가 현재 값을
-- admin_get_signup_config()로 먼저 읽고 원하는 값만 바꿔 3개를 모두
-- 다시 넘기는 것을 전제로 한다).
--
-- 검증:
--   - p_signup_open이 null이면 거절(컬럼이 not null이라 결국 제약
--     위반으로도 막히지만, 원인을 명확한 메시지로 먼저 알려준다).
--   - p_opens_at과 p_closes_at이 둘 다 있으면 p_opens_at < p_closes_at
--     이어야 함(요구사항 그대로). 둘 중 하나만 있거나 둘 다 null이면
--     이 검증은 건너뜀(무제한 경계는 is_signup_open()의 기존 규칙과
--     동일하게 허용).
--
-- fail-open 방지: 위 검증이나 private.is_operator() 검사에서
-- raise exception이 발생하면 PL/pgSQL이 이 함수가 지금까지 만든 모든
-- 변경(여기서는 아직 UPDATE 전이므로 해당 없음)을 포함해 이 함수
-- 호출 전체를 그대로 실패시킨다 — UPDATE 문 자체가 조건 검증을 모두
-- 통과한 뒤 마지막에 딱 한 번만 실행되므로, "일부만 반영되고 나머지는
-- 반영 안 되는" 중간 상태가 나올 수 없다. app_config row가 없는(운영
-- 실수로 삭제된) 극단적 경우에도 UPDATE가 0 row를 바꾸고 끝나며(→
-- FOUND=false), 이걸 성공으로 착각하지 않도록 명시적으로 예외를 던진다.
-- =========================================================

create or replace function public.admin_set_signup_config(
  p_signup_open boolean,
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_signup_open is null then
    raise exception 'invalid p_signup_open: must not be null';
  end if;

  if p_opens_at is not null
     and p_closes_at is not null
     and p_opens_at >= p_closes_at then
    raise exception 'invalid signup period: p_opens_at must be before p_closes_at';
  end if;

  update public.app_config
    set
      signup_open = p_signup_open,
      signup_opens_at = p_opens_at,
      signup_closes_at = p_closes_at,
      updated_at = now()
    where id = 1;

  if not found then
    raise exception 'app_config row (id = 1) not found';
  end if;
end;
$$;

comment on function public.admin_set_signup_config(boolean, timestamptz, timestamptz) is
  'app_config(id=1)의 signup_open/signup_opens_at/signup_closes_at을 교체하고 updated_at을 갱신한다. p_signup_open은 not null, p_opens_at/p_closes_at이 둘 다 있으면 opens_at < closes_at이어야 한다. private.is_operator()로 매번 재검증하며 비운영자는 예외(42501)로 거절, 검증 실패 시 아무 것도 반영되지 않는다(fail closed). imory-ops 대시보드 전용.';

revoke execute on function public.admin_set_signup_config(boolean, timestamptz, timestamptz) from public;
grant execute on function public.admin_set_signup_config(boolean, timestamptz, timestamptz) to authenticated;
