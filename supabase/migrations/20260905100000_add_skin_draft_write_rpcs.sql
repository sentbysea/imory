-- =========================================================
-- AI SKIN — PHASE 1B Slice 0: Draft Write RPC 4종
--
-- 참고: AI_SKIN_PHASE1B_DESIGN.md 6/7절, AI_SKIN_PHASE1A_DESIGN.md
-- 2-2/2-3절(append-only + 포인터 이동 흐름의 원 설계).
--
-- 이 migration은 skins/skin_versions/skin_image_slot_values의
-- 테이블 구조나 RLS 정책을 전혀 바꾸지 않는다([[20260904100000_create_skins_skin_versions.sql]],
-- [[20260904110000_rls_skins_skin_versions.sql]] 그대로) — 이번에
-- 추가하는 건 "새 skin_versions row 생성 + skins 포인터 이동"이라는
-- 세트 동작을 원자적으로 묶는 RPC 4개뿐이다.
--
-- 왜 RLS(소유자 CRUD)만으로 클라이언트에서 나눠 부르지 않는가:
-- RLS는 "누가 접근 가능한가"만 강제하고 "여러 쓰기를 하나의
-- 트랜잭션으로 묶는 것"은 보장하지 않는다. append-only + 포인터
-- 이동이라는 핵심 불변식(AI_SKIN_PHASE1A_DESIGN.md 2-2절)이 클라이언트
-- JS가 매번 순서를 맞춰 호출해주길 기대하는 관례가 아니라 DB 함수
-- 하나의 트랜잭션 안에서 구조적으로 강제되도록 하기 위함이다
-- (AI_SKIN_AUDIT.md가 지적한 "권한을 GRANT 레벨에서 구조적으로
-- 강제하지 않고 관례에만 의존하다 사고가 난 이력"을 반복하지 않기
-- 위한 조치, [[20260903190000_harden_operator_rpc_grants.sql]]과
-- 동일한 경계심).
--
-- 공통 보안 원칙(admin_* RPC 관례를 소유자-전용 RPC에 맞게 적용,
-- [[20260904100000_add_admin_delete_invite_link_rpc.sql]] 패턴 계승):
--   - SECURITY DEFINER + SET search_path = ''(모든 참조를 스키마
--     한정으로 작성)
--   - SECURITY DEFINER는 RLS를 우회해서 실행되므로, RLS가 이미
--     강제하는 소유권 확인을 함수 본문 안에서 반드시 다시 한다
--     (get_published_skin()처럼 "의도적으로 공개"인 함수가 아니라
--     전부 소유자 전용 동작이므로 이 체크가 없으면 SECURITY DEFINER
--     자체가 RLS를 뚫는 구멍이 된다).
--   - PUBLIC/anon EXECUTE 명시적 revoke, authenticated에만 grant
--     (이 4개 함수는 전부 로그인한 소유자 전용 동작 — get_published_skin()과
--     달리 anon에게 열어줄 이유가 전혀 없다).
--
-- 콘텐츠(html/css) 재검증 없음: sanitize/validate는 여전히
-- 클라이언트(Studio JS, skin/skin-sanitize.js + skin/skin-css-validate.js)의
-- 책임이고, 이 RPC들의 책임은 오직 "원자성 + 소유권"이다. 최종
-- 안전망은 skin/skin-render.js의 Slice 3.5 재검증(호출마다 항상
-- 재검증)이며, 이 계층 구조는 AI_SKIN_PHASE1B_DESIGN.md 0/7절에서
-- 이미 확정했다.
-- =========================================================


-- =========================================================
-- 1) create_skin_with_initial_version(p_content, p_schema_version, p_title)
--
-- 사용자당 active Skin 최초 생성 — Questionnaire 직후 1회만 호출됨을
-- 전제한다(AI_SKIN_PHASE1B_DESIGN.md 11절 "1인 1스킨처럼 노출").
-- skins <-> skin_versions 순환 FK 때문에 3단계 고정 순서
-- (skins insert(포인터 NULL) -> skin_versions insert -> skins
-- update)를 지킨다(AI_SKIN_PHASE1A_DESIGN.md 2-3절).
--
-- 이미 active skin이 있으면 거절한다 — skins_active_per_user_idx
-- (partial unique index)가 최종적으로 막아주지만, 사용자에게 친절한
-- 에러 메시지를 위해 함수가 먼저 확인한다.
-- =========================================================

create or replace function public.create_skin_with_initial_version(
  p_content jsonb,
  p_schema_version smallint,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_skin_id uuid;
  v_version_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_content is null then
    raise exception 'p_content must not be null';
  end if;

  if p_schema_version is null then
    raise exception 'p_schema_version must not be null';
  end if;

  if exists (
    select 1
    from public.skins
    where user_id = v_user_id
      and is_active
  ) then
    raise exception 'an active skin already exists for this user';
  end if;

  insert into public.skins (user_id, title)
  values (v_user_id, coalesce(nullif(trim(p_title), ''), 'My Skin'))
  returning id into v_skin_id;

  insert into public.skin_versions (skin_id, schema_version, content, label, created_by)
  values (v_skin_id, p_schema_version, p_content, 'Initial version', v_user_id)
  returning id into v_version_id;

  update public.skins
    set current_draft_version_id = v_version_id
    where id = v_skin_id;

  return v_skin_id;
end;
$$;

comment on function public.create_skin_with_initial_version(jsonb, smallint, text) is
  '호출자(auth.uid()) 소유의 최초 Skin을 생성한다 — skins row(포인터 NULL) -> skin_versions row -> skins.current_draft_version_id 이동을 하나의 트랜잭션으로 묶는다(AI_SKIN_PHASE1A_DESIGN.md 2-3절 3단계 순서). 이미 활성 Skin이 있으면 거절(skins_active_per_user_idx의 friendly 사전 확인). 반환값은 새로 생성된 skins.id. AI_SKIN_PHASE1B_DESIGN.md Slice 0/2(Questionnaire 직후 최초 생성)에서 사용.';

revoke execute on function public.create_skin_with_initial_version(jsonb, smallint, text) from public;
revoke execute on function public.create_skin_with_initial_version(jsonb, smallint, text) from anon;
grant execute on function public.create_skin_with_initial_version(jsonb, smallint, text) to authenticated;


-- =========================================================
-- 2) save_skin_draft_version(p_skin_id, p_content, p_schema_version, p_label)
--
-- 기존 skin의 draft를 갱신 — 새 skin_versions row를 추가하고
-- current_draft_version_id만 옮긴다(이전 draft row는 그대로 이력에
-- 남음, AI_SKIN_PHASE1A_DESIGN.md 2-2절 "Draft 저장"). 발행 직후 첫
-- 편집이든 아니든 이 함수 하나로 동일하게 처리된다 — draft==published
-- 여부를 이 함수가 특별취급하지 않아도, "새 row + 포인터만 이동"
-- 동작 자체가 두 상황 모두에서 그대로 올바르다(발행된 row는 손대지
-- 않고 새 row만 생기므로 published 포인터는 자동으로 그대로 유지됨).
-- =========================================================

create or replace function public.save_skin_draft_version(
  p_skin_id uuid,
  p_content jsonb,
  p_schema_version smallint,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_version_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_skin_id is null then
    raise exception 'p_skin_id must not be null';
  end if;

  if p_content is null then
    raise exception 'p_content must not be null';
  end if;

  if p_schema_version is null then
    raise exception 'p_schema_version must not be null';
  end if;

  if not exists (
    select 1
    from public.skins
    where id = p_skin_id
      and user_id = v_user_id
  ) then
    raise exception 'skin not found or not owned by caller';
  end if;

  insert into public.skin_versions (skin_id, schema_version, content, label, created_by)
  values (p_skin_id, p_schema_version, p_content, p_label, v_user_id)
  returning id into v_version_id;

  update public.skins
    set current_draft_version_id = v_version_id
    where id = p_skin_id;

  return v_version_id;
end;
$$;

comment on function public.save_skin_draft_version(uuid, jsonb, smallint, text) is
  '호출자(auth.uid()) 소유의 skin(p_skin_id)에 새 draft 버전을 추가한다 — skin_versions row 추가 + skins.current_draft_version_id 이동을 원자적으로 처리(AI_SKIN_PHASE1A_DESIGN.md 2-2절). 소유자가 아니면 거절. 이전 draft row는 이력에 그대로 남으며(append-only) 별도 삭제/정리 없음. 반환값은 새로 생성된 skin_versions.id. AI_SKIN_PHASE1B_DESIGN.md Slice 4(Code Editor Save)에서 사용.';

revoke execute on function public.save_skin_draft_version(uuid, jsonb, smallint, text) from public;
revoke execute on function public.save_skin_draft_version(uuid, jsonb, smallint, text) from anon;
grant execute on function public.save_skin_draft_version(uuid, jsonb, smallint, text) to authenticated;


-- =========================================================
-- 3) publish_skin(p_skin_id)
--
-- current_published_version_id = current_draft_version_id로만
-- 이동한다 — 새 row를 만들지 않는다(AI_SKIN_PHASE1A_DESIGN.md 2-2절
-- "Publish"). 이 시점부터 같은 skin_versions row가 draft이자
-- published가 된다. 발행 직후 첫 편집은 이 함수가 아니라
-- save_skin_draft_version()이 그대로 처리한다(위 2번 주석 참고).
--
-- AI_SKIN_PHASE1B_DESIGN.md 7/14절: 이 RPC는 Slice 0에서 준비만
-- 해두고, Phase 1B 사용자 UI에는 노출하지 않는다(완료 조건은 Save
-- Draft까지). 테스트/검증 목적으로는 이 시점부터 호출 가능.
-- =========================================================

create or replace function public.publish_skin(
  p_skin_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_draft_version_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_skin_id is null then
    raise exception 'p_skin_id must not be null';
  end if;

  select current_draft_version_id
    into v_draft_version_id
    from public.skins
    where id = p_skin_id
      and user_id = v_user_id;

  if not found then
    raise exception 'skin not found or not owned by caller';
  end if;

  if v_draft_version_id is null then
    raise exception 'cannot publish: this skin has no draft version yet';
  end if;

  update public.skins
    set current_published_version_id = v_draft_version_id
    where id = p_skin_id;
end;
$$;

comment on function public.publish_skin(uuid) is
  '호출자(auth.uid()) 소유의 skin(p_skin_id)에 대해 current_published_version_id를 현재 current_draft_version_id로 이동한다(새 row 생성 없음, AI_SKIN_PHASE1A_DESIGN.md 2-2절 "Publish"). 소유자가 아니거나 draft가 아직 없으면 거절. AI_SKIN_PHASE1B_DESIGN.md 7/14절에 따라 Phase 1B 사용자 UI에는 노출하지 않고 RPC만 준비해 둔다(개발/테스트 검증용으로 이 시점부터 호출 가능).';

revoke execute on function public.publish_skin(uuid) from public;
revoke execute on function public.publish_skin(uuid) from anon;
grant execute on function public.publish_skin(uuid) to authenticated;


-- =========================================================
-- 4) restore_skin_version(p_skin_id, p_source_version_id, p_label)
--
-- 과거 skin_versions row의 content를 복제한 새 row를 만들고
-- current_draft_version_id를 그 새 row로 옮긴다 — 과거 row로
-- 포인터를 직접 되돌리지 않는다(AI_SKIN_PHASE1A_DESIGN.md 2-2절
-- "Restore", 히스토리가 항상 시간순 단조 증가하도록 유지하기 위함,
-- git revert와 동일한 사고방식 / git reset처럼 하지 않음).
--
-- p_source_version_id가 반드시 p_skin_id 소속인지 확인한다 — 다른
-- skin(설령 같은 사용자 소유라도)의 버전을 잘못 지정해서 복원하는
-- 사고를 막는다.
--
-- AI_SKIN_PHASE1B_DESIGN.md 14절: UI(Version History/Restore
-- 화면)는 Phase 1B 이후 후속 Slice 몫이지만, RPC 자체는 Slice 0에서
-- 함께 준비해 후속 Slice가 순수 UI 작업만 남도록 한다.
-- =========================================================

create or replace function public.restore_skin_version(
  p_skin_id uuid,
  p_source_version_id uuid,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_source public.skin_versions%rowtype;
  v_new_version_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_skin_id is null then
    raise exception 'p_skin_id must not be null';
  end if;

  if p_source_version_id is null then
    raise exception 'p_source_version_id must not be null';
  end if;

  if not exists (
    select 1
    from public.skins
    where id = p_skin_id
      and user_id = v_user_id
  ) then
    raise exception 'skin not found or not owned by caller';
  end if;

  select *
    into v_source
    from public.skin_versions
    where id = p_source_version_id
      and skin_id = p_skin_id;

  if not found then
    raise exception 'source version not found for this skin';
  end if;

  insert into public.skin_versions (skin_id, schema_version, content, label, created_by)
  values (
    p_skin_id,
    v_source.schema_version,
    v_source.content,
    coalesce(nullif(trim(p_label), ''), 'Restored version'),
    v_user_id
  )
  returning id into v_new_version_id;

  update public.skins
    set current_draft_version_id = v_new_version_id
    where id = p_skin_id;

  return v_new_version_id;
end;
$$;

comment on function public.restore_skin_version(uuid, uuid, text) is
  '호출자(auth.uid()) 소유의 skin(p_skin_id)에 대해, 같은 skin 소속의 과거 버전(p_source_version_id)의 content를 복제한 새 skin_versions row를 만들고 current_draft_version_id를 그 새 row로 옮긴다(과거 row로 포인터를 직접 되돌리지 않음, AI_SKIN_PHASE1A_DESIGN.md 2-2절 "Restore"). p_source_version_id가 p_skin_id 소속이 아니면 거절. 반환값은 새로 생성된 skin_versions.id. AI_SKIN_PHASE1B_DESIGN.md 14절에 따라 RPC는 Slice 0에서 준비하되 UI는 후속 Slice에서 구현.';

revoke execute on function public.restore_skin_version(uuid, uuid, text) from public;
revoke execute on function public.restore_skin_version(uuid, uuid, text) from anon;
grant execute on function public.restore_skin_version(uuid, uuid, text) to authenticated;
