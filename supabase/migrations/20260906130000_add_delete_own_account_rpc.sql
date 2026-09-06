-- =========================================================
-- delete_own_account() — 본인 회원 탈퇴(자가 삭제)
--
-- admin settings > data 탭의 "회원 탈퇴" 버튼이 호출한다.
-- admin_delete_user(p_user_id)([[20260905110000_add_admin_delete_user_rpc.sql]])
-- 와 완전히 같은 구조이되, 대상이 항상 auth.uid() 본인으로 고정되어
-- 있어 p_user_id 파라미터 자체가 없다 — 다른 사용자를 탈퇴시킬 방법이
-- 없다.
--
-- auth.users row를 직접 삭제한다 — 프론트가 별도 백엔드 서버 없이
-- Supabase에 직접 붙는 구조라 client에서 Supabase Auth Admin API
-- (auth.admin.deleteUser, service_role 필요)를 호출할 수 없고
-- ([[CLAUDE.md]] 3항: service_role key를 브라우저에 절대 넣지 않음),
-- SECURITY DEFINER 함수로 서버 쪽에서 처리하는 것이 이 프로젝트에서
-- 유일하게 안전한 경로다.
--
-- auth.users를 삭제하면 admin_delete_user와 동일하게 아래가 함께
-- 정리된다: public.profiles / public.home_customize / public.skins,
-- skin_versions / public.admin_users / public.invite_link_uses /
-- auth 스키마 내부(sessions/refresh_tokens/identities 등, Supabase
-- 자체 on delete cascade).
--
-- 안전장치: 호출자가 admin_users에 등록된 운영자면 거절한다
-- (admin_delete_user의 운영자 보호와 동일한 이유 — 운영자 계정
-- 변경/삭제는 항상 Supabase SQL Editor에서 수동으로만 하기로 되어
-- 있고, 이 셀프서비스 버튼으로 운영자 계정이 실수로/악의적으로
-- 사라지는 경로를 만들지 않기 위함).
-- =========================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1 from public.admin_users where user_id = v_uid
  ) then
    raise exception 'operator accounts cannot self-delete via this action';
  end if;

  delete from auth.users where id = v_uid;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

comment on function public.delete_own_account() is
  '로그인한 본인 계정을 즉시 탈퇴(삭제)시킨다. auth.users row를 직접 삭제하며 profiles/home_customize/skins/skin_versions/invite_link_uses 등 연관 데이터가 기존 on delete cascade로 함께 삭제된다. 호출자가 admin_users에 등록된 운영자면 거절한다. 대상은 항상 auth.uid() 본인뿐이다.';

revoke execute on function public.delete_own_account() from public;
revoke execute on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
