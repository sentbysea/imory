-- =========================================================
-- INVITES — admin_delete_invite_link(p_id) — 미사용 링크 하드 삭제
--
-- admin_deactivate_invite_link()([[20260903180000_add_invite_admin_rpcs.sql]])는
-- row를 남기고 is_active만 false로 바꾼다(감사 로그 보존 목적).
-- 이 함수는 그와 달리 invite_links row 자체를 지운다 — 단,
-- uses_count = 0(한 번도 사용된 적 없는 링크)인 경우에만 허용한다.
--
-- 이유: invite_links.id를 참조하는 invite_link_uses가
-- on delete cascade([[20260903150000_create_invite_links.sql]])라,
-- 이미 사용 이력이 있는 링크를 하드 삭제하면 "어떤 사용자가 어떤
-- 링크로 가입했는지" 감사 로그까지 함께 사라진다. uses_count = 0인
-- 링크는 애초에 invite_link_uses에 매칭되는 행이 없으므로 이 제약이
-- 감사 로그 보존에 아무 영향을 주지 않는다. 이미 사용된 링크를
-- 정리하고 싶으면 기존처럼 비활성화만 가능하다(그대로 유지).
--
-- 공통 보안 원칙은 기존 admin_* RPC와 동일
-- ([[20260903190000_harden_operator_rpc_grants.sql]] 패턴 그대로):
--   - SECURITY DEFINER + SET search_path = ''
--   - PUBLIC/anon EXECUTE 명시적 revoke, authenticated에만 grant
--   - 함수 내부에서 매번 private.is_operator()로 재검증
-- =========================================================

create or replace function public.admin_delete_invite_link(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.invite_links%rowtype;
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'invalid p_id: must not be null';
  end if;

  select * into v_row
    from public.invite_links
    where id = p_id;

  if not found then
    raise exception 'invite link not found';
  end if;

  if v_row.uses_count > 0 then
    raise exception 'cannot delete an invite link that has already been used';
  end if;

  delete from public.invite_links where id = p_id;
end;
$$;

comment on function public.admin_delete_invite_link(uuid) is
  '한 번도 사용되지 않은(uses_count = 0) 초대 링크를 완전히 삭제한다. 이미 사용된 링크는 삭제를 거절하고 대신 admin_deactivate_invite_link()로 비활성화해야 한다(invite_link_uses 감사 로그가 on delete cascade로 함께 삭제되는 것을 막기 위함). 대상이 없으면 예외. private.is_operator()로 재검증하며 비운영자는 42501로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_delete_invite_link(uuid) from public;
revoke execute on function public.admin_delete_invite_link(uuid) from anon;
grant execute on function public.admin_delete_invite_link(uuid) to authenticated;
