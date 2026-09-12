-- =========================================================
-- USERS — admin_list_recent_signups()에 last_sign_in_at 추가
--
-- imory-ops USERS 탭에서 "가입일" 옆에 "최종 접속일"을 함께 보여주기
-- 위해, 기존 반환 필드에 auth.users.last_sign_in_at 하나만 더한다.
--
-- 값의 의미(정확히 알고 쓰기 위해 여기 적어둔다):
--   GoTrue는 실제 "로그인"이 일어날 때만 auth.users.last_sign_in_at을
--   갱신한다 — 브라우저에 세션이 남아 있어 refresh token으로만 계속
--   접속하는 사용자는 이 값이 오래된 채로 남는다. 즉 이 컬럼은
--   "마지막으로 실제 로그인한 시각"이지 "마지막으로 페이지를 연
--   시각"이 아니다. 후자가 필요해지면 profiles에 별도 last_seen_at을
--   두고 클라이언트가 갱신하는 구조가 따로 필요하다(이번 범위 밖).
--   한 번도 로그인 기록이 없으면 null(운영 화면에서 "—"로 표시).
--
-- auth.users 접근: 이 함수는 SECURITY DEFINER라 owner 권한으로
-- auth schema를 직접 읽는다(admin_delete_user()가 auth.users를 직접
-- DELETE하는 것과 동일한 방식, [[20260905110000_add_admin_delete_user_rpc.sql]]).
-- 노출 필드는 last_sign_in_at 하나뿐 — email/raw_user_meta_data 등
-- 다른 auth.users 컬럼은 반환하지 않는다(운영 목적에 필요한 최소
-- 필드만, 기존 원칙 그대로).
--
-- RETURNS TABLE의 컬럼이 늘어나므로 CREATE OR REPLACE로는 바꿀 수
-- 없다 — 기존 함수를 DROP하고 다시 만든다. 인자 시그니처는
-- (integer, integer)로 동일해서 옛 오버로드가 남는 문제는 없다.
-- DROP은 기존 함수에 걸려 있던 GRANT도 함께 지우므로, 재생성 후
-- revoke/grant 3줄을 반드시 다시 명시한다
-- ([[20260903190000_harden_operator_rpc_grants.sql]] — 이 인스턴스의
-- public 스키마에는 ALTER DEFAULT PRIVILEGES가 걸려 있어 새 함수에
-- anon/authenticated EXECUTE가 자동으로 붙는다. revoke ... from
-- public만으로는 그 직접 grant가 지워지지 않는다).
-- =========================================================

drop function if exists public.admin_list_recent_signups(integer, integer);

create function public.admin_list_recent_signups(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  nickname text,
  slug text,
  home_mode text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid p_limit: must be between 1 and 100';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'invalid p_offset: must be >= 0';
  end if;

  return query
    select
      p.user_id,
      p.nickname,
      p.slug,
      p.home_mode,
      p.created_at,
      u.last_sign_in_at
    from public.profiles p
    -- left join: auth.users row가 사라진 유령 profile이 있더라도
    -- 목록에서 통째로 빠지지 않고 최종 접속일만 null로 보이게 한다
    -- (운영 화면에서 "안 보이는 것"보다 "비어 있는 것"이 안전하다).
    left join auth.users u on u.id = p.user_id
    order by p.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;

comment on function public.admin_list_recent_signups(integer, integer) is
  '최근 가입자 목록(created_at 내림차순). user_id/nickname/slug/home_mode/created_at/last_sign_in_at만 반환한다. last_sign_in_at은 auth.users의 값으로, 실제 로그인 시점에만 갱신된다(세션 유지/토큰 갱신만으로는 바뀌지 않음). p_limit(1~100)/p_offset(>=0) 범위를 벗어나면 예외. private.is_operator()로 매번 재검증하며 비운영자는 예외(42501)로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_list_recent_signups(integer, integer) from public;
revoke execute on function public.admin_list_recent_signups(integer, integer) from anon;
grant execute on function public.admin_list_recent_signups(integer, integer) to authenticated;
