-- =========================================================
-- AI SKIN — 3단계: get_published_skin(p_user_id) — 공개 읽기 RPC
--
-- 참고: AI_SKIN_PHASE1A_DESIGN.md 2-7절(공개 접근 — RPC 기반 Public
-- Read Contract).
--
-- 이 함수가 공개 방문자에게 열린 유일한 Skin 읽기 통로다. skins/
-- skin_versions/skin_image_slot_values 세 테이블은 전부 anon에게
-- 아무 권한도 없다([[20260904110000_rls_skins_skin_versions.sql]])
-- — 공개 HOME은 반드시 이 RPC를 통해서만 Skin 데이터를 얻는다.
--
-- 동작: is_active=true인 skins row를 찾고, 그 row의
-- current_published_version_id가 가리키는 skin_versions.content만
-- 반환한다. current_draft_version_id는 이 함수 본문 어디에서도
-- 참조하지 않는다 — draft를 들여다볼 방법 자체가 이 함수 안에
-- 없으므로 구조적으로 draft가 새어나갈 수 없다. 비활성 skin/발행
-- 이력 없음/대상 없음은 전부 NULL을 반환한다(fail closed, 에러가
-- 아니라 "표시할 게 없다"는 정상 상태로 취급 — AI_SKIN_PHASE1A_
-- DESIGN.md 10절 fallback과 연결).
--
-- 권한 하드닝: 이 프로젝트는 스키마 레벨 기본 권한(ALTER DEFAULT
-- PRIVILEGES) 때문에 새 함수가 anon에 암묵적 EXECUTE를 받는 함정을
-- 이미 한 번 겪었다([[20260903190000_harden_operator_rpc_grants.sql]])
-- — 이 함수는 anon 접근이 의도된 설계([[20260903180000_add_invite_admin_rpcs.sql]]
-- 의 get_invite_status(text)와 동일한 성격)이므로 anon에서 별도로
-- revoke할 필요는 없지만, public에서는 명시적으로 revoke한 뒤
-- anon/authenticated에 명시 grant하는 패턴을 그대로 따른다.
-- =========================================================

create or replace function public.get_published_skin(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_skin public.skins%rowtype;
  v_version public.skin_versions%rowtype;
  v_image_slots jsonb;
begin
  if p_user_id is null then
    return null;
  end if;

  select *
    into v_skin
    from public.skins
    where user_id = p_user_id
      and is_active
    limit 1;

  if not found then
    return null;
  end if;

  if v_skin.current_published_version_id is null then
    return null;
  end if;

  select *
    into v_version
    from public.skin_versions
    where id = v_skin.current_published_version_id;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_object_agg(slot_name, image_url), '{}'::jsonb)
    into v_image_slots
    from public.skin_image_slot_values
    where skin_id = v_skin.id;

  return jsonb_build_object(
    'skin', v_version.content,
    'schemaVersion', v_version.schema_version,
    'imageSlotValues', v_image_slots
  );
end;
$$;

comment on function public.get_published_skin(uuid) is
  '공개 방문자가 특정 사용자(p_user_id)의 발행된(published) Skin을 읽기 위한 유일한 통로. is_active=true인 skins row + current_published_version_id가 가리키는 skin_versions.content만 반환하며, draft(current_draft_version_id)나 비활성 skin은 이 함수 어디에서도 참조하지 않는다. 대상이 없거나 아직 발행 이력이 없으면 NULL을 반환한다(AI_SKIN_PHASE1A_DESIGN.md 2-7절 공개 읽기 계약).';

revoke execute on function public.get_published_skin(uuid) from public;
grant execute on function public.get_published_skin(uuid) to anon, authenticated;
