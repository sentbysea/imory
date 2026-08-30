-- Phase 0-3: profiles / app_config / home_customize RLS + column-level 권한
-- 다중 사용자 전환(auth/onboarding/public-home) 계획 Phase 0-3
-- 참고: C:\Users\user\.claude\plans\inherited-brewing-raccoon.md
--
-- 설계 원칙: RLS(행 단위)로 "어떤 행을 볼 수 있는가"를 결정하고,
-- column-level GRANT(컬럼 단위)로 "그 행에서 어떤 컬럼을 볼 수 있는가"를
-- 별도로 제한한다. RLS는 컬럼을 가리지 못하므로 두 메커니즘을 함께 쓴다.

-- profiles
alter table public.profiles enable row level security;

create policy "profiles_select_public"
on public.profiles
for select
to anon, authenticated
using (true);

revoke all on public.profiles from anon, authenticated;
grant select (user_id, slug, nickname, bio, home_mode)
  on public.profiles
  to anon, authenticated;

-- INSERT/UPDATE/DELETE 정책 의도적으로 없음 (RLS 기본 차단)
-- 쓰기는 Phase 3의 complete_onboarding() RPC(security definer)로만 수행

-- app_config
alter table public.app_config enable row level security;

create policy "app_config_select_public"
on public.app_config
for select
to anon, authenticated
using (true);

revoke all on public.app_config from anon, authenticated;
grant select (id, signup_open)
  on public.app_config
  to anon, authenticated;

-- UPDATE 정책 없음 — 지금은 Supabase 대시보드에서만 수동 변경

-- home_customize
alter table public.home_customize enable row level security;

create policy "home_customize_select_public"
on public.home_customize
for select
to anon, authenticated
using (true);

create policy "home_customize_owner_write"
on public.home_customize
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke select on public.home_customize from anon, authenticated;
grant select (user_id, layout_json)
  on public.home_customize
  to anon, authenticated;
