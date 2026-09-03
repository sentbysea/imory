-- =========================================================
-- INVITES — 1단계: 테이블 (invite_links / invite_link_uses)
--
-- 가입 기간(app_config.signup_open 등)이 닫혀 있어도, 운영자가 발급한
-- 초대 링크를 가진 사용자는 예외적으로 가입할 수 있게 하기 위한 기반
-- 테이블. 이번 migration은 테이블 + RLS + 권한만 만든다. Hook/
-- complete_onboarding()/admin RPC는 이어지는 후속 migration에서 추가.
--
-- 설계 원칙(기존 컨벤션 그대로, 참고:
-- [[20260903130000_add_admin_users_operator_foundation.sql]]):
--   - RLS는 켜두되 정책을 하나도 만들지 않는다(default deny) — owner
--     권한으로 실행되는 SECURITY DEFINER 함수를 통해서만 접근 가능.
--   - 테이블 단위 권한도 RLS와 무관하게 명시적으로 전부 회수한다
--     (Supabase 신규 테이블 기본 GRANT가 열려 있을 수 있으므로,
--     [[20260902110000_lock_down_posts_secret_password_hash.sql]]에서
--     확인된 것과 동일한 이유).
--
-- 토큰 저장 방식: 원문(token)은 저장하지 않고 sha256 해시만 저장한다
-- (token_hash). 초대 토큰은 "가입 기간 우회"라는 민감한 권한을 쥔
-- bearer 토큰이라, DB가 유출되더라도 저장된 값만으로는 재사용할 수
-- 없게 하기 위함이다. 원문은 생성 시 admin_create_invite_link()
-- RPC(후속 migration)의 반환값으로 딱 한 번만 운영자에게 노출된다.
--
-- 토큰 생성/해시에 pgcrypto 확장을 쓰지 않는다: gen_random_uuid()와
-- sha256(bytea)는 둘 다 PostgreSQL 14+ 코어(pg_catalog)에 내장되어
-- 있어 별도 확장 설치 여부에 의존하지 않는다(Supabase 프로젝트마다
-- 어떤 확장이 어느 schema에 설치돼 있는지 다를 수 있어, 코어 내장
-- 함수만 쓰는 쪽이 이식성이 높고 이 프로젝트의 search_path = ''
-- 컨벤션과도 잘 맞는다 — pg_catalog 소속 함수는 search_path가 비어
-- 있어도 항상 암묵적으로 먼저 검색된다).
-- =========================================================


-- =========================================================
-- 0) 사전 확인 — sha256(bytea)가 이 Postgres 버전에 실제로 있는지
--
-- PostgreSQL 14 미만이면 sha256()이 코어에 없어 이후 migration들이
-- 배포 시점이 아니라 함수 호출 시점에야 실패한다. 여기서 먼저
-- 명확한 에러로 fail-fast한다.
-- =========================================================

do $$
begin
  if to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception
      'pg_catalog.sha256(bytea) not available — PostgreSQL 14+ required for invite token hashing';
  end if;
end $$;


-- =========================================================
-- 1) public.invite_links — 초대 링크 1개 = row 1개
--
-- max_uses: 1/3/5/10만 허용(무제한 링크 없음, 정책 그대로 DB
-- check로도 강제).
-- uses_count: 실제 소비 횟수. uses_count <= max_uses는 애플리케이션
-- 로직(complete_onboarding()의 원자적 UPDATE, 후속 migration)이
-- 이미 보장하지만, 다른 경로로의 실수 있는 UPDATE도 막도록 테이블
-- check로 한 번 더 방어한다(defense in depth).
-- expires_at: 생성 시점 + 7일로 고정(정책 "생성 후 7일 고정"). 이후
-- 값을 다시 늘려주는 RPC는 만들지 않는다 — 필요하면 새 링크를 새로
-- 발급한다.
-- created_by: 생성한 운영자의 auth.users.id. 그 운영자 계정이 나중에
-- 삭제되더라도 이미 발급된 초대 링크 자체는 무효화되면 안 되므로
-- on delete set null(운영자 삭제가 이 테이블 때문에 막히지 않게).
-- note: 운영자가 "누구에게 준 링크인지" 적어두는 선택 메모, 200자
-- 제한(길이 검증은 admin_create_invite_link()에서, 여기 check는
-- 그 검증을 우회하는 다른 경로에 대한 보조 방어).
-- =========================================================

create table public.invite_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  max_uses smallint not null default 5
    check (max_uses in (1, 3, 5, 10)),
  uses_count integer not null default 0
    check (uses_count >= 0 and uses_count <= max_uses),
  is_active boolean not null default true,
  note text
    check (note is null or char_length(note) <= 200),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.invite_links enable row level security;
-- 의도적으로 정책 없음 — RLS 기본 차단만으로 anon/authenticated 전면 차단.

revoke all on public.invite_links from anon, authenticated, public;

comment on table public.invite_links is
  '가입 기간이 닫혀 있어도 예외적으로 가입을 허용하는 초대 링크. token 원문은 저장하지 않고 sha256 해시(token_hash)만 저장한다. RLS 정책이 없어 anon/authenticated는 전부 접근 불가하고, admin_create_invite_link()/admin_list_invite_links()/admin_deactivate_invite_link()/get_invite_status()/complete_onboarding()(모두 SECURITY DEFINER, 후속 migration) 를 통해서만 간접 접근된다. max_uses는 1/3/5/10만 허용, expires_at은 생성 시 now()+7일로 고정.';


-- =========================================================
-- 2) public.invite_link_uses — 초대 링크 사용 감사 로그
--
-- "이 링크로 실제로 누가 가입했는지" 감사 추적용. uses_count 증가와
-- 이 테이블 insert는 항상 complete_onboarding() 같은 트랜잭션
-- 안에서 함께 일어난다(후속 migration) — 온보딩이 최종 실패하면
-- 둘 다 롤백된다.
--
-- unique(invite_link_id, user_id): 같은 사용자가 같은 링크를 두 번
-- "성공적으로" 소비하는 경우는 정상 흐름에서는 있을 수 없다
-- (complete_onboarding()의 "profile already exists" 체크가 같은
-- 사용자의 두 번째 온보딩 자체를 막음) — 그래도 실수로 중복 insert가
-- 발생하는 경로를 막는 보조 방어로 unique 제약을 둔다.
-- =========================================================

create table public.invite_link_uses (
  id bigint generated always as identity primary key,
  invite_link_id uuid not null references public.invite_links(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  used_at timestamptz not null default now(),
  unique (invite_link_id, user_id)
);

create index invite_link_uses_invite_link_id_idx
  on public.invite_link_uses (invite_link_id);

create index invite_link_uses_user_id_idx
  on public.invite_link_uses (user_id);

alter table public.invite_link_uses enable row level security;
-- 의도적으로 정책 없음 — invite_links와 동일한 이유.

revoke all on public.invite_link_uses from anon, authenticated, public;

comment on table public.invite_link_uses is
  '초대 링크 사용 감사 로그. 어떤 초대 링크(invite_link_id)로 어떤 사용자(user_id)가 언제(used_at) 가입을 완료했는지 기록. complete_onboarding()이 invite_links.uses_count 증가와 같은 트랜잭션에서 insert한다. RLS 정책 없음(anon/authenticated 전면 차단), SECURITY DEFINER 함수를 통해서만 간접 접근.';
