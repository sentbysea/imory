-- =========================================================
-- USERS — admin_list_recent_signups()에 last_active_at 추가
--
-- [[20260912110000_add_last_sign_in_to_admin_list_recent_signups.sql]]에서
-- 넣은 last_sign_in_at은 "마지막으로 실제 로그인한 시각"이라, 세션이
-- 살아 있는 채로 계속 쓰는 사용자는 값이 오래된 채로 멈춘다. 운영
-- 화면에서 알고 싶은 건 "이 사람이 마지막으로 imory에서 뭔가를 한
-- 시각"이므로, 흩어져 있는 활동 흔적을 하나로 합친 last_active_at을
-- 함께 반환한다.
--
-- 합치는 값(전부 이미 존재하는 컬럼 — imory 본체 코드는 한 줄도
-- 바꾸지 않는다. 과거 데이터에도 그대로 소급 적용된다):
--
--   auth.users.last_sign_in_at      로그인
--   public.profiles.updated_at      닉네임 등 프로필 변경(트리거)
--   public.home_customize.updated_at  홈 꾸미기 저장(트리거)
--   max(public.posts.updated_at)    글 작성/수정
--   max(public.skins.updated_at)    스킨 수정(트리거)
--   max(public.skin_versions.created_at)  스킨 버전 저장
--
-- greatest()는 NULL 인자를 무시하고 남은 값 중 최대를 돌려주므로,
-- 아직 글도 스킨도 없는 사용자도 문제없이 계산된다. profiles.updated_at은
-- 가입 시점에 now()로 채워지므로 last_active_at은 최소한 가입 시각이고
-- 절대 NULL이 되지 않는다(= 화면에 "—"가 뜨지 않는다).
--
-- 알고 쓸 것 두 가지:
--   1) "읽기만 한 방문"은 잡히지 않는다. 위 값은 전부 로그인 또는
--      쓰기의 흔적이라, 이미 로그인된 세션으로 들어와 글만 읽고 나가면
--      last_active_at은 움직이지 않는다. 순수 방문까지 세려면
--      profiles에 last_seen_at을 두고 imory 본체가 주기적으로 갱신하는
--      구조가 따로 필요하다(본체 수정이 필요해 이번 범위 밖).
--   2) posts.updated_at은 트리거가 아니라 클라이언트가 직접 쓰는 값이다
--      ([[20260902110000_lock_down_posts_secret_password_hash.sql]]의
--      INSERT/UPDATE 컬럼 GRANT에 포함). 즉 사용자가 마음만 먹으면
--      미래 시각을 넣을 수 있다 — 운영 화면의 참고용 표시일 뿐이므로
--      여기서 clamp하지 않고 값 그대로 보여준다(이상한 값이 보이면
--      그 자체가 신호다). 권한 판정에는 쓰지 않는다.
--
-- 성능: 활동 소스는 페이지에 실제로 실린 user_id들로 먼저 좁힌 뒤
-- 테이블당 한 번씩만 group by로 훑는다(사용자 1명당 서브쿼리 1개씩
-- 도는 구조를 피한다). p_limit 상한이 100이라 어느 경우에도 스캔
-- 횟수는 소스 테이블 수만큼으로 고정된다.
--
-- RETURNS TABLE 컬럼이 늘어나므로 CREATE OR REPLACE로는 바꿀 수 없다 —
-- DROP 후 재생성하고, DROP이 지워버린 GRANT를 revoke/grant 3줄로 다시
-- 명시한다([[20260903190000_harden_operator_rpc_grants.sql]] — 이
-- 인스턴스는 public 스키마에 ALTER DEFAULT PRIVILEGES가 걸려 있어
-- 새 함수에 anon EXECUTE가 자동으로 붙는다).
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
  last_sign_in_at timestamptz,
  last_active_at timestamptz
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
    with page as (
      select
        p.user_id,
        p.nickname,
        p.slug,
        p.home_mode,
        p.created_at,
        p.updated_at
      from public.profiles p
      order by p.created_at desc
      limit p_limit
      offset p_offset
    ),

    post_activity as (
      select t.user_id, max(t.updated_at) as last_at
      from public.posts t
      where t.user_id in (select g.user_id from page g)
      group by t.user_id
    ),

    skin_activity as (
      select t.user_id, max(t.updated_at) as last_at
      from public.skins t
      where t.user_id in (select g.user_id from page g)
      group by t.user_id
    ),

    skin_version_activity as (
      select t.created_by as user_id, max(t.created_at) as last_at
      from public.skin_versions t
      where t.created_by in (select g.user_id from page g)
      group by t.created_by
    )

    select
      g.user_id,
      g.nickname,
      g.slug,
      g.home_mode,
      g.created_at,
      u.last_sign_in_at,
      greatest(
        u.last_sign_in_at,
        g.updated_at,
        hc.updated_at,
        pa.last_at,
        sa.last_at,
        sva.last_at
      ) as last_active_at
    from page g
    -- left join: auth.users row가 사라진 유령 profile이 있더라도
    -- 목록에서 통째로 빠지지 않고 값만 비게 한다(운영 화면에서
    -- "안 보이는 것"보다 "비어 있는 것"이 안전하다).
    left join auth.users u on u.id = g.user_id
    left join public.home_customize hc on hc.user_id = g.user_id
    left join post_activity pa on pa.user_id = g.user_id
    left join skin_activity sa on sa.user_id = g.user_id
    left join skin_version_activity sva on sva.user_id = g.user_id
    order by g.created_at desc;
end;
$$;

comment on function public.admin_list_recent_signups(integer, integer) is
  '최근 가입자 목록(created_at 내림차순). user_id/nickname/slug/home_mode/created_at/last_sign_in_at/last_active_at을 반환한다. last_sign_in_at은 실제 로그인 시점에만 갱신되는 auth.users 값이고, last_active_at은 로그인 + 프로필/홈/글/스킨 변경 시각 중 최대값이다(읽기만 한 방문은 포함되지 않음, posts.updated_at은 클라이언트가 쓰는 값이라 참고용). p_limit(1~100)/p_offset(>=0) 범위를 벗어나면 예외. private.is_operator()로 매번 재검증하며 비운영자는 예외(42501)로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_list_recent_signups(integer, integer) from public;
revoke execute on function public.admin_list_recent_signups(integer, integer) from anon;
grant execute on function public.admin_list_recent_signups(integer, integer) to authenticated;
