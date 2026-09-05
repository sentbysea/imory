-- =========================================================
-- AI SKIN — 2단계: skins / skin_versions / skin_image_slot_values RLS + GRANT
--
-- 참고: AI_SKIN_PHASE1A_DESIGN.md 2-6절.
--
-- 설계 원칙(기존 invite_links/admin_users 컨벤션을 따름, 참고:
-- [[20260903150000_create_invite_links.sql]]):
--   - 세 테이블 전부 RLS 켜짐 + 소유자 전용 정책만 둔다. 공개(anon)
--     SELECT 정책은 하나도 만들지 않는다 — home_customize처럼
--     using(true)로 전체 공개하면 draft(미공개 초안)까지 새 나가기
--     때문이다. 공개 방문자는 이 세 테이블을 절대 직접 조회하지
--     않고, 다음 migration의 get_published_skin() RPC로만 접근한다
--     (AI_SKIN_PHASE1A_DESIGN.md 2-7절).
--   - skin_versions는 GRANT 단계에서 UPDATE/DELETE 자체를 부여하지
--     않는다 — "append-only, 수정 대신 새 row + 포인터 이동"이라는
--     설계 원칙을 정책(policy) 실수로부터도 보호되도록 권한(grant)
--     레벨에서 구조적으로 강제한다.
-- =========================================================


-- =========================================================
-- 1) public.skins — 소유자 전체 CRUD
-- =========================================================

alter table public.skins enable row level security;

create policy "skins_owner_all"
on public.skins
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.skins from anon, authenticated, public;
grant select, insert, update, delete
  on public.skins
  to authenticated;

-- anon: 아무 권한도 없음(의도적) — 공개 읽기는 get_published_skin() RPC로만.


-- =========================================================
-- 2) public.skin_versions — 소유자 SELECT/INSERT만(append-only 강제)
-- =========================================================

alter table public.skin_versions enable row level security;

create policy "skin_versions_owner_all"
on public.skin_versions
for all
to authenticated
using (
  exists (
    select 1
    from public.skins s
    where s.id = skin_versions.skin_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.skins s
    where s.id = skin_versions.skin_id
      and s.user_id = auth.uid()
  )
);

revoke all on public.skin_versions from anon, authenticated, public;
grant select, insert
  on public.skin_versions
  to authenticated;

-- update/delete는 authenticated에게도 의도적으로 grant하지 않는다
-- (append-only, AI_SKIN_PHASE1A_DESIGN.md 2-2/2-6절) — 정책은
-- for all이지만 GRANT가 없어 UPDATE/DELETE 자체가 permission
-- denied로 거절된다.


-- =========================================================
-- 3) public.skin_image_slot_values — 소유자 전체 CRUD
-- =========================================================

alter table public.skin_image_slot_values enable row level security;

create policy "skin_image_slot_values_owner_all"
on public.skin_image_slot_values
for all
to authenticated
using (
  exists (
    select 1
    from public.skins s
    where s.id = skin_image_slot_values.skin_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.skins s
    where s.id = skin_image_slot_values.skin_id
      and s.user_id = auth.uid()
  )
);

revoke all on public.skin_image_slot_values from anon, authenticated, public;
grant select, insert, update, delete
  on public.skin_image_slot_values
  to authenticated;

-- anon: 아무 권한도 없음(의도적) — 공개 읽기는 get_published_skin() RPC로만.
