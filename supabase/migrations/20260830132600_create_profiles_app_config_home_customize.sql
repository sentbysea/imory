-- Phase 0-2: profiles / app_config / home_customize 신규 테이블 생성
-- 다중 사용자 전환(auth/onboarding/public-home) 계획 Phase 0-2
-- 참고: C:\Users\user\.claude\plans\inherited-brewing-raccoon.md

-- profiles
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  slug text not null unique,
  bio text,
  home_mode text not null default 'customize'
    check (home_mode in ('customize', 'legacy_sua')),
  onboarding_completed boolean not null default false,
  terms_agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint profiles_slug_length check (char_length(slug) between 3 and 30)
);

-- app_config (싱글턴 1-row)
create table public.app_config (
  id smallint primary key default 1,
  signup_open boolean not null default true,
  signup_opens_at timestamptz,
  signup_closes_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint app_config_singleton check (id = 1)
);
insert into public.app_config (id) values (1);

-- home_customize (1 user = 1 row)
create table public.home_customize (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  layout_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at 공용 트리거 함수 (Phase 0-1 dump로 기존에 없음을 확인 후 신규 생성)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_app_config_updated_at
before update on public.app_config
for each row execute function public.set_updated_at();

create trigger trg_home_customize_updated_at
before update on public.home_customize
for each row execute function public.set_updated_at();
