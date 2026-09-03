-- =========================================================
-- INVITES — 4단계: 운영자 관리 RPC 3종 + 클라이언트 사전확인 RPC 1종
--
-- imory-ops INVITES 탭이 쓸 운영자 전용 RPC 3개와, 초대 링크로 진입한
-- 방문자에게 "이 링크가 아직 유효한지" 빠르게 보여주기 위한 클라이언트
-- 사전확인 RPC 1개를 추가한다. imory-ops 프론트/onboarding.js 연결은
-- 이번 migration 범위 밖(DB만).
--
-- 공통 보안 원칙(기존 admin_* RPC 컨벤션 그대로, 참고:
-- [[20260903140000_add_admin_operator_data_rpcs.sql]]):
--   - SECURITY DEFINER + SET search_path = ''
--   - PUBLIC EXECUTE 기본 revoke 후 authenticated에만 grant(anon 제외)
--   - 함수 내부에서 매번 private.is_operator()로 재검증
--   - 비운영자는 42501(insufficient_privilege)로 거절(빈 값/false로
--     새지 않음)
-- =========================================================


-- =========================================================
-- 1) public.admin_create_invite_link(p_max_uses, p_note)
--    — 초대 링크 발급, 원문 토큰을 딱 이 응답에서만 반환
--
-- 토큰: gen_random_uuid() 2개를 하이픈 제거 후 이어붙인 64자 hex
-- 문자열(약 244비트 무작위성, PostgreSQL 코어 내장 함수만 사용 —
-- [[20260903150000_create_invite_links.sql]] 상단 설계 노트 참고).
-- 저장은 sha256 해시만 — 이 함수가 반환한 뒤에는 어떤 관리 화면도
-- 원문을 다시 보여줄 수 없다(재발급만 가능). imory-ops UI는 이
-- 응답을 받는 즉시 "다시 표시되지 않는다"는 경고와 함께 복사 UI를
-- 보여줘야 한다(UI는 이번 범위 밖).
--
-- p_max_uses: 1/3/5/10만 허용(무제한 링크 없음, 정책 그대로). 테이블
-- check 제약과 동일 조건이지만, 잘못된 값을 애매한 제약조건 위반
-- 에러가 아니라 명확한 메시지로 먼저 걸러낸다.
-- p_note: 선택, 200자 제한. 빈 문자열은 NULL로 정규화.
-- =========================================================

create or replace function public.admin_create_invite_link(
  p_max_uses smallint default 5,
  p_note text default null
)
returns table (
  id uuid,
  token text,
  max_uses smallint,
  note text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(trim(p_note), '');
  v_token text;
  v_token_hash text;
  v_row public.invite_links%rowtype;
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_max_uses is null or p_max_uses not in (1, 3, 5, 10) then
    raise exception 'invalid p_max_uses: must be one of 1, 3, 5, 10';
  end if;

  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'invalid p_note: must be 200 characters or fewer';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '')
             || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := encode(sha256(v_token::bytea), 'hex');

  insert into public.invite_links (token_hash, created_by, max_uses, note)
  values (v_token_hash, v_uid, p_max_uses, v_note)
  returning * into v_row;

  return query
    select v_row.id, v_token, v_row.max_uses, v_row.note, v_row.expires_at, v_row.created_at;
end;
$$;

comment on function public.admin_create_invite_link(smallint, text) is
  '초대 링크를 발급하고, 그 자리에서만 원문 토큰을 반환한다(이후 어떤 RPC도 원문을 다시 보여주지 않음 — token_hash만 저장). p_max_uses는 1/3/5/10만 허용, expires_at은 서버에서 now()+7일로 고정. private.is_operator()로 재검증하며 비운영자는 42501로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_create_invite_link(smallint, text) from public;
grant execute on function public.admin_create_invite_link(smallint, text) to authenticated;


-- =========================================================
-- 2) public.admin_list_invite_links(p_limit, p_offset) — 목록 조회
--
-- token/token_hash는 절대 반환하지 않는다 — 발급 직후 admin_create_
-- invite_link() 응답으로만 원문을 볼 수 있고, 그 이후로는 운영자
-- 본인도 다시 볼 수 없다(정책: "토큰 원문을 불필요하게 노출하지
-- 않는다"를 관리 화면에도 그대로 적용). 사용 현황은 uses_count/
-- max_uses로 "2 / 5" 형태로 표시 가능.
-- =========================================================

create or replace function public.admin_list_invite_links(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  max_uses smallint,
  uses_count integer,
  is_active boolean,
  note text,
  expires_at timestamptz,
  created_at timestamptz,
  created_by uuid
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
      l.id,
      l.max_uses,
      l.uses_count,
      l.is_active,
      l.note,
      l.expires_at,
      l.created_at,
      l.created_by
    from public.invite_links l
    order by l.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;

comment on function public.admin_list_invite_links(integer, integer) is
  '초대 링크 목록(created_at 내림차순). token/token_hash는 절대 반환하지 않는다. p_limit(1~100)/p_offset(>=0) 범위를 벗어나면 예외. private.is_operator()로 재검증하며 비운영자는 42501로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_list_invite_links(integer, integer) from public;
grant execute on function public.admin_list_invite_links(integer, integer) to authenticated;


-- =========================================================
-- 3) public.admin_deactivate_invite_link(p_id) — 비활성화
--
-- is_active = false로만 바꾼다(row 삭제 안 함 — invite_link_uses
-- 감사 로그와 uses_count 이력을 보존하기 위해). 비활성화 즉시 이후
-- 모든 검증(get_invite_status/get_signup_availability/
-- complete_onboarding)이 is_active를 다시 읽으므로 신규 가입에
-- 즉시 사용할 수 없게 된다(정책: "비활성화하면 즉시 신규 가입에
-- 사용할 수 없어야 한다").
-- =========================================================

create or replace function public.admin_deactivate_invite_link(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'invalid p_id: must not be null';
  end if;

  update public.invite_links
    set is_active = false
    where id = p_id;

  if not found then
    raise exception 'invite link not found';
  end if;
end;
$$;

comment on function public.admin_deactivate_invite_link(uuid) is
  '초대 링크를 비활성화한다(is_active = false, row는 유지해 감사 로그를 보존). 대상이 없으면 예외. private.is_operator()로 재검증하며 비운영자는 42501로 거절. imory-ops 대시보드 전용.';

revoke execute on function public.admin_deactivate_invite_link(uuid) from public;
grant execute on function public.admin_deactivate_invite_link(uuid) to authenticated;


-- =========================================================
-- 4) public.get_invite_status(p_token) — 클라이언트 사전확인
--
-- 초대 링크로 막 들어온 방문자에게 "이 링크가 아직 쓸 수 있는지"를
-- Google 로그인을 시작하기 전에 미리 보여주기 위한 UX용 RPC. 최종
-- 권한 판정으로 쓰지 않는다 — 실제 계정 생성 가능 여부는 Before User
-- Created Hook + has_active_invite_capacity()가, 실제 소비는
-- complete_onboarding()이 각자 독립적으로 다시 검증한다. 이 함수의
-- 결과는 어떤 방식으로도 서버 측 강제력을 갖지 않는다(순수 안내용).
--
-- 반환은 5가지 상태 중 하나뿐이다: valid / expired / exhausted /
-- inactive / invalid. note/created_by/token_hash/사용 로그 등은
-- 절대 노출하지 않는다 — 토큰 원문을 아는 사람에게조차 "그 외
-- 정보"는 새어나가면 안 된다는 원칙(정책: 링크가 무엇을 위한
-- 건지·누가 만들었는지는 링크를 쥔 사람에게도 노출 대상이 아님).
--
-- anon도 허용 — 이 RPC는 로그인 전(Google 로그인 버튼을 누르기도
-- 전)에 호출되어야 하므로 authenticated로 제한할 수 없다. 토큰은
-- 64자 hex 무작위값이라 무차별 대입으로 유효한 값을 맞출 확률은
-- 무시할 수 있는 수준이다.
-- =========================================================

create or replace function public.get_invite_status(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_row public.invite_links%rowtype;
begin
  if p_token is null or char_length(p_token) = 0 then
    return 'invalid';
  end if;

  v_hash := encode(sha256(p_token::bytea), 'hex');

  select *
    into v_row
    from public.invite_links
    where token_hash = v_hash;

  if not found then
    return 'invalid';
  end if;

  if not v_row.is_active then
    return 'inactive';
  end if;

  if v_row.expires_at <= now() then
    return 'expired';
  end if;

  if v_row.uses_count >= v_row.max_uses then
    return 'exhausted';
  end if;

  return 'valid';
exception
  when others then
    return 'invalid';
end;
$$;

comment on function public.get_invite_status(text) is
  '초대 토큰의 상태를 valid/expired/exhausted/inactive/invalid 중 하나로만 반환하는 클라이언트 사전확인용 RPC(UX 안내 전용, 서버 측 강제력 없음). note/created_by/token_hash 등은 노출하지 않는다. 실제 계정 생성 가능 여부는 Hook + has_active_invite_capacity()가, 실제 소비는 complete_onboarding()이 각각 독립적으로 재검증한다. 오류 시 invalid(fail closed).';

revoke execute on function public.get_invite_status(text) from public;
grant execute on function public.get_invite_status(text) to anon, authenticated;
