-- =========================================================
-- INVITES — 다 쓴 링크 / 비활성화된 링크도 삭제할 수 있게
--
-- [[20260904100000_add_admin_delete_invite_link_rpc.sql]]의
-- admin_delete_invite_link()는 uses_count = 0인 링크만 삭제를
-- 허용했다. 이유는 하나뿐이었다: invite_link_uses.invite_link_id가
-- on delete cascade라, 사용 이력이 있는 링크를 지우면 "누가 어떤
-- 링크로 가입했는지" 감사 로그까지 함께 사라지기 때문
-- ([[20260903150000_create_invite_links.sql]]).
--
-- 운영상 실제로 지우고 싶은 건 오히려 "이제 못 쓰는 링크"들이다 —
-- 5/5 다 소진된 링크, 비활성화한 링크가 목록에 계속 쌓인다. 그래서
-- 삭제 조건을 넓히되, 감사 로그는 그대로 남기는 쪽으로 바꾼다.
--
-- 1) invite_link_uses의 cascade를 끊어 감사 로그를 보존한다.
--    invite_link_id는 not null uuid 컬럼으로 그대로 두고 FK 제약만
--    제거한다 — "어떤 링크로 가입했는지"를 링크 row가 사라진 뒤에도
--    id 값으로 계속 추적할 수 있어야 하므로, on delete set null이
--    아니라 soft reference(FK 없는 uuid)로 만든다. 무결성 측면의
--    손해는 크지 않다: 이 테이블에 insert하는 경로는
--    complete_onboarding() 하나뿐이고, 그 insert는 바로 앞에서
--    같은 트랜잭션으로 UPDATE ... RETURNING id 한 실제 링크 id만
--    사용한다([[20260903170000_consume_invite_in_complete_onboarding.sql]]).
--    unique(invite_link_id, user_id)와 두 인덱스는 그대로 유지된다.
--
-- 2) 삭제 허용 조건을 "더 이상 신규 가입에 쓸 수 없는 링크"로 넓힌다:
--      - uses_count = 0        (기존 조건 — 한 번도 안 쓴 링크)
--      - is_active = false     (비활성화한 링크)
--      - uses_count >= max_uses(전부 소진된 링크)
--      - expires_at <= now()   (만료된 링크)
--    남는 거절 대상은 "아직 활성 + 만료 전 + 일부만 사용된" 링크
--    하나뿐이다. 이건 지금도 누군가 손에 쥐고 돌려쓰고 있을 수 있는
--    링크라, 실수로 한 번에 날리는 대신 비활성화를 먼저 거치게 한다
--    (비활성화하면 그 즉시 이 함수로 삭제 가능 — 2단계면 충분하고,
--    되돌릴 수 없는 작업을 한 클릭 뒤에 두지 않는다).
--
-- 공통 보안 원칙은 기존 admin_* RPC와 동일:
--   - SECURITY DEFINER + SET search_path = ''
--   - PUBLIC/anon EXECUTE 명시적 revoke, authenticated에만 grant
--   - 함수 내부에서 매번 private.is_operator()로 재검증
-- =========================================================


-- =========================================================
-- 1) invite_link_uses.invite_link_id — FK(cascade) 제거
--
-- 제약 이름을 문자열로 가정하지 않고 컬럼(attnum)으로 찾아 지운다 —
-- 이름을 잘못 짚어 drop이 조용히 빗나가면 cascade가 남은 채로 아래
-- 삭제 조건만 넓어져 감사 로그가 소리 없이 날아가기 때문이다.
-- 컬럼 기준으로 찾으므로 "하나도 없음"은 곧 "이미 떼어냈음"이고, 그
-- 경우는 notice만 남기고 넘어간다(SQL Editor에서 이 파일을 두 번
-- 실행해도 결과가 같다). 반대로 컬럼 자체가 없으면 INTO STRICT가
-- 예외로 멈춘다.
-- =========================================================

do $$
declare
  v_attnum smallint;
  v_conname text;
  v_dropped integer := 0;
begin
  select a.attnum
    into strict v_attnum
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.invite_link_uses'::regclass
     and a.attname = 'invite_link_id'
     and not a.attisdropped;

  -- attnum = any(conkey): 단일 컬럼 FK든 복합 FK든 invite_link_id를
  -- 포함하는 FK는 전부 걸린다(하나라도 남으면 링크 삭제가 막히거나
  -- cascade가 계속 살아 있게 되므로).
  for v_conname in
    select c.conname
      from pg_catalog.pg_constraint c
     where c.conrelid = 'public.invite_link_uses'::regclass
       and c.contype = 'f'
       and v_attnum = any (c.conkey)
  loop
    execute format(
      'alter table public.invite_link_uses drop constraint %I',
      v_conname
    );

    v_dropped := v_dropped + 1;
  end loop;

  if v_dropped = 0 then
    raise notice
      'no foreign key on public.invite_link_uses(invite_link_id) — already detached, nothing to drop';
  end if;
end $$;


comment on column public.invite_link_uses.invite_link_id is
  '사용된 초대 링크의 id. public.invite_links(id)를 가리키지만 FK 제약은 없다(soft reference) — 운영자가 다 쓴/비활성화된 링크를 삭제해도 이 감사 로그는 남아야 하므로, on delete cascade를 의도적으로 제거했다([[20260912120000_allow_deleting_finished_invite_links.sql]]). 따라서 이미 삭제된 링크의 id가 남아 있을 수 있다.';

comment on table public.invite_link_uses is
  '초대 링크 사용 감사 로그. 어떤 초대 링크(invite_link_id)로 어떤 사용자(user_id)가 언제(used_at) 가입을 완료했는지 기록. complete_onboarding()이 invite_links.uses_count 증가와 같은 트랜잭션에서 insert한다. invite_link_id에는 FK가 없어(soft reference) 링크 row가 삭제돼도 로그는 보존된다. RLS 정책 없음(anon/authenticated 전면 차단), SECURITY DEFINER 함수를 통해서만 간접 접근.';


-- =========================================================
-- 2) public.admin_delete_invite_link(p_id) — 삭제 조건 완화
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

  -- 아직 살아 있는(활성 + 만료 전) 링크를 일부만 쓴 상태로 지우는
  -- 것만 거절한다. 비활성화를 먼저 거치면 곧바로 삭제할 수 있다.
  if v_row.is_active
     and v_row.uses_count > 0
     and v_row.uses_count < v_row.max_uses
     and v_row.expires_at > now() then
    raise exception
      'cannot delete an active invite link that is still usable — deactivate it first';
  end if;

  delete from public.invite_links where id = p_id;
end;
$$;

comment on function public.admin_delete_invite_link(uuid) is
  '더 이상 신규 가입에 쓸 수 없는 초대 링크를 완전히 삭제한다 — 미사용(uses_count = 0) / 비활성화(is_active = false) / 전부 소진(uses_count >= max_uses) / 만료(expires_at <= now()) 중 하나에 해당해야 한다. 아직 활성 + 만료 전인데 일부만 사용된 링크는 거절하며, 먼저 admin_deactivate_invite_link()로 비활성화해야 한다. invite_link_uses 감사 로그는 FK 제거(soft reference) 덕분에 링크 삭제 후에도 보존된다. 대상이 없으면 예외. private.is_operator()로 재검증하며 비운영자는 42501로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_delete_invite_link(uuid) from public;
revoke execute on function public.admin_delete_invite_link(uuid) from anon;
grant execute on function public.admin_delete_invite_link(uuid) to authenticated;
