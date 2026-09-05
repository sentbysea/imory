-- =========================================================
-- AI SKIN — 1단계: skins / skin_versions / skin_image_slot_values 테이블
--
-- 참고: AI_SKIN_PHASE1A_DESIGN.md 2절(Skin 데이터 모델). 기존 Carrd형
-- home_customize와 완전히 독립된 새 저장 구조다 — home_customize/
-- profiles.home_mode는 이 migration에서 전혀 건드리지 않는다
-- (AI_SKIN_AUDIT.md 13절 원칙).
--
-- 설계 원칙(AI_SKIN_PHASE1A_DESIGN.md 2-1~2-4절):
--   - skins: 사용자당 여러 개 보유 가능. is_active=true인 row가
--     사용자당 최대 1개가 되도록 partial unique index로 강제한다
--     (unique(user_id)로 skins 자체를 1개로 제한하지 않는다).
--   - skin_versions: draft/published 여부를 나타내는 status 컬럼을
--     두지 않는다 — skins.current_draft_version_id /
--     current_published_version_id가 어떤 row를 가리키는지가
--     유일한 근거(source of truth)다. row는 append-only로 취급하며
--     수정하지 않는다(변경은 항상 새 row 생성 + 포인터 이동) — 이
--     원칙은 다음 migration(RLS)에서 GRANT 레벨로도 강제한다.
--   - skin_image_slot_values: 이미지 슬롯의 "실제 선택값"(개인
--     데이터)을 skin_versions.content(공유 가능한 구조)와 물리적으로
--     분리 저장한다 — Skin 복제/공유 시 개인 이미지가 따라가지
--     않게 하기 위함(플랜 25~27조).
--
-- skins <-> skin_versions는 서로를 참조하는 순환 FK라, skins를
-- 버전 FK 없이 먼저 만들고 skin_versions 생성 후 ALTER TABLE로
-- 나중에 FK를 붙인다(아래 순서 그대로).
-- =========================================================


-- =========================================================
-- 1) public.skins
-- =========================================================

create table public.skins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null default 'My Skin'
    check (char_length(title) between 1 and 100),
  source_skin_id uuid references public.skins(id) on delete set null,
  is_active boolean not null default true,
  current_draft_version_id uuid,
  current_published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.skins is
  '사용자가 보유한 AI Skin 인스턴스. 사용자당 여러 row를 가질 수 있으며, is_active=true인 row는 사용자당 최대 1개(아래 skins_active_per_user_idx). current_draft_version_id/current_published_version_id는 각각 skin_versions.id를 가리키는 포인터로, 어떤 버전이 초안/발행본인지의 유일한 근거다(skin_versions에는 별도 status 컬럼이 없음). source_skin_id는 향후 Skin Gallery 복제 계보용(v0.1은 항상 NULL).';


-- =========================================================
-- 2) public.skin_versions
--
-- content: Skin Package 전체(AI_SKIN_PHASE1A_DESIGN.md 3절 —
-- schemaVersion/html/css/imageSlots/regions/metadata)를 담은 jsonb.
-- html/css는 저장 시점에 이미 새니타이즈/검증/스코프가 끝난
-- 최종본만 들어간다(렌더 시점 재검증 없음, 같은 문서 5절 참고).
-- =========================================================

create table public.skin_versions (
  id uuid primary key default gen_random_uuid(),
  skin_id uuid not null references public.skins(id) on delete cascade,
  schema_version smallint not null default 1
    check (schema_version >= 1),
  content jsonb not null,
  label text
    check (label is null or char_length(label) <= 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.skin_versions is
  'Skin 콘텐츠(Skin Package)의 이력. status 컬럼 없음 — skins.current_draft_version_id/current_published_version_id가 이 테이블의 어떤 row를 가리키는지로만 draft/published 여부가 결정된다. row는 append-only로 취급(수정 대신 새 row 생성 + 포인터 이동, AI_SKIN_PHASE1A_DESIGN.md 2-2절 — 다음 RLS migration이 UPDATE/DELETE GRANT 자체를 부여하지 않아 이를 구조적으로 강제한다). content는 이미 새니타이즈/검증/스코프가 끝난 최종 Skin Package(html/css/imageSlots/regions/metadata) jsonb.';

create index skin_versions_skin_id_idx
  on public.skin_versions (skin_id);

create index skin_versions_skin_id_created_at_idx
  on public.skin_versions (skin_id, created_at desc);


-- =========================================================
-- 3) skins <-> skin_versions 순환 FK 마무리
--
-- on delete restrict: skin_versions row를 삭제하는 기능 자체를
-- v0.1 애플리케이션에 만들지 않는다(AI_SKIN_PHASE1A_DESIGN.md
-- 2-3절) — 포인터가 가리키는 row가 실수로 삭제되어 댕글링되는
-- 상황 자체를 DB가 막는다.
-- =========================================================

alter table public.skins
  add constraint skins_current_draft_version_id_fkey
    foreign key (current_draft_version_id)
    references public.skin_versions(id)
    on delete restrict;

alter table public.skins
  add constraint skins_current_published_version_id_fkey
    foreign key (current_published_version_id)
    references public.skin_versions(id)
    on delete restrict;


-- =========================================================
-- 4) 인덱스 — skins
--
-- skins_active_per_user_idx: is_active=true인 row가 사용자당
-- 최대 1개라는 불변식을 partial unique index로 강제한다(2-1절
-- "unique(user_id)로 skins 자체를 1개로 제한하지 않는다" 결정).
-- =========================================================

create unique index skins_active_per_user_idx
  on public.skins (user_id)
  where is_active;

create index skins_user_id_idx
  on public.skins (user_id);


-- =========================================================
-- 5) public.skin_image_slot_values
--
-- skin_id(skin_versions.id 아님)에 연결 — 슬롯에 어떤 이미지를
-- 골랐는지는 draft가 바뀌거나 발행해도(슬롯 이름이 안 바뀌는 한)
-- 유지되어야 하므로(AI_SKIN_PHASE1A_DESIGN.md 2-4절). image_url은
-- 향후 Image Library(Phase 3, 이번 범위 아님) 도입 전까지 기존
-- favicon/banner/cursor와 동일하게 URL 문자열을 직접 저장한다.
-- https-only 제약은 skin/skin-sanitize.js의 URL 검증 정책(설계
-- 문서 6-5절)을 DB 레벨에서도 한 번 더 방어한다(defense in depth,
-- invite_links 등 기존 migration의 관례와 동일).
-- =========================================================

create table public.skin_image_slot_values (
  skin_id uuid not null references public.skins(id) on delete cascade,
  slot_name text not null
    check (slot_name ~ '^[a-z][a-z0-9_]*$' and char_length(slot_name) <= 50),
  image_url text not null
    check (image_url ~ '^https://'),
  updated_at timestamptz not null default now(),
  primary key (skin_id, slot_name)
);

comment on table public.skin_image_slot_values is
  '사용자가 실제로 선택한 이미지 슬롯 값(개인 데이터). skin_versions.content.imageSlots(슬롯 구조 정의, 공유 가능)와 물리적으로 분리되어 있어 Skin 복제/공유 시 개인 이미지가 따라가지 않는다(AI_SKIN_PHASE1A_DESIGN.md 2-4절, 플랜 25~27조). image_url은 https만 허용.';


-- =========================================================
-- 6) updated_at 트리거 — 기존 public.set_updated_at() 재사용
--    (20260830132600_create_profiles_app_config_home_customize.sql
--    에서 이미 생성됨)
-- =========================================================

create trigger trg_skins_updated_at
before update on public.skins
for each row execute function public.set_updated_at();

create trigger trg_skin_image_slot_values_updated_at
before update on public.skin_image_slot_values
for each row execute function public.set_updated_at();

-- skin_versions는 append-only로 취급 — updated_at 트리거 없음(설계상
-- update하지 않으므로 필요 없음, 2-2절).
