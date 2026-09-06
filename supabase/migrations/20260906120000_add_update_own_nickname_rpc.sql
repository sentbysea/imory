-- =========================================================
-- update_own_nickname(p_nickname) — 본인 닉네임 수정
--
-- admin settings > profile 탭에서 온보딩 때 정한 닉네임을 나중에
-- 바꿀 수 있게 한다. public.profiles는 의도적으로 UPDATE 정책이
-- 없고([[20260830140000_rls_profiles_app_config_home_customize.sql]]
-- 의 "쓰기는 SECURITY DEFINER RPC로만" 원칙) 지금까지 쓰기 경로는
-- complete_onboarding() 하나뿐이었다 — 이 RPC가 두 번째 쓰기 경로다.
--
-- 대상은 항상 auth.uid() 본인 행뿐이며, p_user_id 같은 파라미터를
-- 받지 않는다(다른 사용자 닉네임을 바꿀 방법 자체가 없음).
--
-- 검증 규칙은 complete_onboarding()의 닉네임 검증과 동일하게 맞춘다
-- (1~30자, [[20260906100000_allow_short_slug.sql]]).
--
-- 보안 원칙은 기존 RPC들과 동일: SECURITY DEFINER + SET search_path,
-- PUBLIC/anon EXECUTE 명시적 revoke, authenticated에만 grant.
-- =========================================================

create or replace function public.update_own_nickname(p_nickname text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := trim(p_nickname);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if v_nickname is null
     or char_length(v_nickname) < 1
     or char_length(v_nickname) > 30 then
    raise exception 'invalid nickname';
  end if;

  update public.profiles
    set nickname = v_nickname,
        updated_at = now()
    where user_id = v_uid;

  if not found then
    raise exception 'profile not found';
  end if;
end;
$$;

comment on function public.update_own_nickname(text) is
  '로그인한 본인의 profiles.nickname을 수정한다. 대상은 항상 auth.uid()이며 다른 사용자는 수정할 수 없다. 검증 규칙은 complete_onboarding()과 동일(1~30자).';

revoke execute on function public.update_own_nickname(text) from public;
revoke execute on function public.update_own_nickname(text) from anon;
grant execute on function public.update_own_nickname(text) to authenticated;
