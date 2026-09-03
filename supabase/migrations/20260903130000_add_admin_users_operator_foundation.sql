-- =========================================================
-- OPERATOR DASHBOARD — 1단계: 운영자 판별 기반 구조
--
-- imory-ops(별도 private repo, ops.imory.me 예정) 운영자 전용 대시보드를
-- 위한 최소 기반. 이번 migration은 "운영자인지 아닌지"를 서버(DB)에서만
-- 판별할 수 있게 하는 3개 객체만 만든다:
--   1) public.admin_users      — 운영자 명단 테이블
--   2) private.is_operator()   — 내부 전용 판별 함수 (외부 노출 없음)
--   3) public.get_operator_status() — 클라이언트용 boolean wrapper RPC
--
-- 회원 수/최근 가입자/가입기간 조회·변경 같은 실제 admin_* RPC는
-- 이 기반 위에 이어지는 후속 migration에서 추가한다(이번 범위 아님).
--
-- 설계 원칙(기존 컨벤션 그대로 적용, 참고:
-- [[20260903100000_add_signup_period_guard_hook.sql]],
-- [[20260903120000_add_signup_availability_wrapper_rpc.sql]],
-- [[20260902110000_lock_down_posts_secret_password_hash.sql]]):
--   - SECURITY DEFINER + SET search_path = '' (본문 전체 schema-qualified)
--   - 기본 권한을 먼저 명시적으로 revoke한 뒤 필요한 대상에만 grant
--   - fail-closed: 예기치 못한 예외는 전부 "운영자 아님"으로 처리
--
-- profiles.role 같은 컬럼 방식 대신 별도 admin_users 테이블을 쓰는 이유:
--   - profiles는 이미 anon/authenticated에 select(user_id, slug, nickname,
--     bio, home_mode)가 열려 있는 "공개 프로필" 테이블이다([[20260830140000_rls_profiles_app_config_home_customize.sql]]).
--     여기에 role 컬럼을 추가하면 컬럼 단위 grant를 항상 정확히
--     유지해야 하는 부담이 생기고, 실수로 select 목록에 role이 섞여
--     들어가면 "누가 운영자인지"가 그대로 공개된다.
--   - admin_users를 완전히 별도 테이블로 분리하면, 그 테이블 자체를
--     anon/authenticated에게서 통째로 차단하는 것만으로 충분해서
--     실수할 여지가 훨씬 적다(아래 참고).
--   - 운영자 추가/제거가 "이 테이블에 row를 넣고 빼는" 단순한 작업이 되어
--     감사(audit)하기 쉽다(row 하나 = 운영자 한 명, created_at으로 언제
--     등록됐는지 추적 가능).
-- =========================================================


-- =========================================================
-- 1) public.admin_users — 운영자 명단
--
-- user_id만 저장한다. 이메일 등 PII는 auth.users에 이미 있으므로
-- 중복 저장하지 않는다(중복 저장은 그 자체로 별도의 유출 지점이 된다).
--
-- RLS는 켜두되 SELECT/INSERT/UPDATE/DELETE 정책을 하나도 만들지 않는다.
-- Postgres RLS는 "정책이 없으면 owner를 제외한 모든 role은 기본적으로
-- 접근 불가"이므로, 정책 자체를 만들지 않는 것이 가장 안전한 기본값이다
-- (정책을 잘못 쓰는 것보다, 정책이 아예 없는 쪽이 사고 가능성이 낮다).
--
-- 그리고 [[20260902110000_lock_down_posts_secret_password_hash.sql]]에서
-- 이미 확인된 대로, Supabase 프로젝트는 새 테이블에 대해 기본적으로
-- anon/authenticated에 테이블 단위 권한이 걸려 있을 수 있다(RLS와는
-- 별개로 컬럼/테이블 GRANT 자체가 열려 있으면 우회된다). 그래서 RLS와
-- 무관하게 테이블 권한 자체도 명시적으로 전부 회수한다.
--
-- 결과적으로 이 테이블은 postgres(owner)와, owner 권한으로 실행되는
-- SECURITY DEFINER 함수(private.is_operator())를 통해서만 읽을 수 있다.
-- =========================================================

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- 의도적으로 정책 없음 — RLS 기본 차단(default deny)만으로 anon/authenticated 전면 차단.

revoke all on public.admin_users from anon, authenticated, public;

comment on table public.admin_users is
  '운영자(서비스 관리자) 명단. user_id만 저장(이메일 등 PII는 auth.users에 이미 있으므로 중복 저장하지 않음). RLS 정책이 없어 anon/authenticated는 SELECT/INSERT/UPDATE/DELETE 전부 불가하고, 테이블 단위 권한도 전부 회수되어 있다. private.is_operator()(SECURITY DEFINER, owner 권한으로 RLS 우회)를 통해서만 간접적으로 조회된다. 이 테이블에 운영자 user_id를 추가/삭제하는 INSERT/DELETE는 반드시 Supabase SQL Editor에서 수동 실행하며, 실제 user_id 값은 이 저장소(git, public repo)에 절대 커밋하지 않는다.';


-- =========================================================
-- 2) private schema — 클라이언트에 노출되지 않는 내부 전용 스키마
--
-- public.is_signup_open()처럼 "PUBLIC/anon/authenticated의 EXECUTE만
-- revoke"하는 방식도 가능하지만, 운영자 판별 함수는 한 단계 더
-- 보수적으로 간다: 아예 public이 아닌 별도 schema에 둬서, EXECUTE grant
-- 실수뿐 아니라 "이 스키마가 있다는 것 자체"도 anon/authenticated의
-- 조회 범위 밖에 두기 위함이다(schema 자체에 USAGE가 없으면 스키마
-- 안의 객체를 이름으로 참조하는 것 자체가 막힌다).
--
-- Postgres에서 새로 만든 스키마는 기본적으로 owner 외에는 USAGE가 없지만,
-- 이 프로젝트 컨벤션(암묵적 기본값에 의존하지 않고 항상 명시적으로
-- revoke)을 그대로 따라 방어적으로 한 번 더 명시한다.
-- =========================================================

create schema if not exists private;
revoke all on schema private from public;

comment on schema private is
  '클라이언트(anon/authenticated/PUBLIC)에서 절대 접근할 수 없는 내부 전용 스키마. 운영자 판별 등 노출되면 안 되는 로직만 둔다. 이 스키마의 함수는 항상 같은 owner의 다른 SECURITY DEFINER 함수를 통해서만 간접 호출된다.';


-- =========================================================
-- 3) private.is_operator() — 운영자 판별 내부 함수
--
-- 현재 세션(auth.uid())이 admin_users에 등록되어 있는지만 확인한다.
-- STABLE: 같은 statement 내 부작용 없이 값만 읽음.
-- SECURITY DEFINER + search_path = '': admin_users가 RLS로 완전
-- 차단되어 있으므로, owner 권한으로 실행되어야 RLS를 우회해 조회할 수
-- 있다(is_signup_open()과 동일한 이유). 본문의 모든 스키마 객체
-- (public.admin_users, auth.uid())가 이미 schema-qualified.
--
-- 외부 EXECUTE grant를 전혀 하지 않는다 — private 스키마 자체에
-- anon/authenticated USAGE가 없으므로 클라이언트는애초에 이 함수를
-- 이름으로 참조할 수조차 없고, 여기에 추가로 EXECUTE도 명시적으로
-- revoke해 이중으로 막는다. 오직 같은 owner가 만든 다른 SECURITY
-- DEFINER 함수(get_operator_status(), 이후의 admin_* RPC)만 owner
-- 권한 상속으로 내부 호출 가능하다.
--
-- fail-closed: admin_users 조회 중 예기치 못한 오류가 나도 "운영자
-- 아님"으로만 응답한다. 절대 예외를 그대로 전파하지 않는다.
-- =========================================================

create or replace function private.is_operator()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
exception
  when others then
    return false;
end;
$$;

comment on function private.is_operator() is
  '현재 세션(auth.uid())이 admin_users에 등록된 운영자인지 판별하는 내부 전용 함수. private 스키마 소속이라 anon/authenticated/PUBLIC은 USAGE 자체가 없어 참조 불가하고 EXECUTE도 부여하지 않는다. 같은 owner의 다른 SECURITY DEFINER 함수(get_operator_status(), admin_* RPC)에서만 내부 호출된다. fail-closed: 오류 시 false.';

revoke execute on function private.is_operator() from public;


-- =========================================================
-- 4) public.get_operator_status() — 클라이언트용 최소 노출 wrapper RPC
--
-- private.is_operator()의 boolean 결과만 그대로 반환한다.
-- get_signup_availability()와 동일한 wrapper 패턴
-- ([[20260903120000_add_signup_availability_wrapper_rpc.sql]] 참고):
-- 내부 판별 로직/테이블 구조는 전혀 노출하지 않고 결과 하나만 넘긴다.
--
-- imory-ops 대시보드의 로그인 게이트에서만 사용— 이 함수가 true를
-- 반환해야 대시보드 UI를 그린다. 단, 이건 어디까지나 화면 표시 여부를
-- 위한 UX 판단일 뿐이고, 실제 데이터를 다루는 모든 admin_* RPC는
-- 이 wrapper의 결과를 신뢰하지 않고 각자 내부에서 다시
-- private.is_operator()를 호출해 재검증한다(프론트 게이트 우회 대비).
--
-- anon/authenticated 양쪽에 EXECUTE를 연다 — 로그인 전(anon) 상태에서
-- 대시보드가 "로그인 필요" 화면을 그릴 때도 동일하게 호출할 수 있게
-- 하기 위함이며, 세션이 없으면 auth.uid()가 null이라 결과는 항상
-- false이므로 anon 허용이 추가 위험을 만들지 않는다.
--
-- fail-closed: is_operator() 자체가 이미 fail-closed지만, 이 함수
-- 레벨에서도 동일한 방어 원칙을 유지하기 위해 exception 블록으로
-- 한 번 더 감싼다.
-- =========================================================

create or replace function public.get_operator_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.is_operator();
exception
  when others then
    return false;
end;
$$;

comment on function public.get_operator_status() is
  'private.is_operator()의 boolean 판정 결과만 노출하는 클라이언트용 wrapper RPC. 운영자 여부 외에는 admin_users의 존재나 구조 등 어떤 정보도 노출하지 않는다. 오류 시 false(fail closed). imory-ops 대시보드 로그인 게이트 전용 — 실제 admin_* 데이터 RPC는 이 결과와 무관하게 각자 내부에서 다시 재검증한다.';

revoke execute on function public.get_operator_status() from public;
grant execute on function public.get_operator_status() to anon, authenticated;
