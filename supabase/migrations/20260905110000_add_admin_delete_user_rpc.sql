-- =========================================================
-- USERS — admin_delete_user(p_user_id) — 운영자에 의한 강제 회원 탈퇴
--
-- imory-ops USERS 탭에서 운영자가 특정 회원을 강제 탈퇴시킬 때 쓴다.
-- auth.users row를 직접 삭제한다 — 프론트가 별도 백엔드 서버 없이
-- Supabase에 직접 붙는 구조라 client에서 Supabase Auth Admin API
-- (auth.admin.deleteUser, service_role 필요)를 호출할 수 없고
-- ([[CLAUDE.md]] 3항: service_role key를 브라우저에 절대 넣지 않음),
-- SECURITY DEFINER 함수로 서버 쪽에서 처리하는 것이 이 프로젝트에서
-- 유일하게 안전한 경로다.
--
-- auth.users를 삭제하면 기존 FK 설계에 따라 아래가 함께 정리된다:
--   - public.profiles              (on delete cascade)
--   - public.home_customize        (profiles 경유 on delete cascade)
--   - public.skins / skin_versions (profiles 경유 on delete cascade,
--                                    [[20260904100000_create_skins_skin_versions.sql]])
--   - public.admin_users           (on delete cascade — 단, 아래에서
--                                    운영자 계정은 애초에 삭제를 거절한다)
--   - public.invite_link_uses      (on delete cascade,
--                                    [[20260903150000_create_invite_links.sql]])
--     이 사용자가 어떤 초대 링크로 가입했는지 기록도 함께 사라진다.
--     이건 "가입 사실 자체를 지워달라"는 탈퇴 요청의 자연스러운
--     결과로 보고 의도적으로 허용한다 — admin_delete_invite_link()가
--     보존하려는 감사 로그는 "링크가 얼마나 쓰였는지"이지, 특정
--     개인의 가입 흔적이 아니다.
--   - auth 스키마 내부(sessions/refresh_tokens/identities 등)는
--     Supabase 자체 migration이 이미 auth.users에 on delete cascade로
--     걸어뒀으므로 함께 정리된다 — 세션도 즉시 무효화된다.
--
-- 안전장치: p_user_id가 admin_users에 등록된 운영자면 거절한다.
-- 운영자 명단 변경은 CLAUDE.md 규칙상 항상 Supabase SQL Editor에서
-- 수동으로만 하기로 되어 있고([[20260903130000_add_admin_users_operator_foundation.sql]]),
-- 이 대시보드 기능으로 운영자 계정이 실수로 삭제되는 경로를 만들지
-- 않기 위함이다.
--
-- 공통 보안 원칙은 기존 admin_* RPC와 동일
-- ([[20260903190000_harden_operator_rpc_grants.sql]] 패턴 그대로):
--   - SECURITY DEFINER + SET search_path = ''
--   - PUBLIC/anon EXECUTE 명시적 revoke, authenticated에만 grant
--   - 함수 내부에서 매번 private.is_operator()로 재검증
--   - fail-closed: 대상이 없거나 운영자면 아무 것도 지우지 않고 예외
-- =========================================================

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'invalid p_user_id: must not be null';
  end if;

  if exists (
    select 1 from public.admin_users where user_id = p_user_id
  ) then
    raise exception 'cannot delete an operator account via this RPC';
  end if;

  delete from auth.users where id = p_user_id;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

comment on function public.admin_delete_user(uuid) is
  '운영자가 회원을 강제 탈퇴시킨다. auth.users row를 직접 삭제하며 profiles/home_customize/skins/skin_versions/invite_link_uses 등 연관 데이터가 기존 on delete cascade로 함께 삭제된다. p_user_id가 admin_users에 등록된 운영자면 거절한다(운영자 명단 변경은 SQL Editor에서만 수동으로). 대상이 없으면 예외. private.is_operator()로 재검증하며 비운영자는 42501로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_delete_user(uuid) from public;
revoke execute on function public.admin_delete_user(uuid) from anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
