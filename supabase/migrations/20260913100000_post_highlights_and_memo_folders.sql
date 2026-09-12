-- =========================================================
-- HIGHLIGHT-1 — 글 뷰어 하이라이트 / 메모 카드 / 메모 폴더 설정
--
-- 기준 문서: IMORY_HIGHLIGHT1_DESIGN.md
--
-- 이 migration이 하는 일
-- ----------------------
--   1) public.post_highlights          — 하이라이트 1개 = 메모 카드 1개
--   2) post_highlights RLS + GRANT     — 이 파일의 핵심 방어선
--   3) 쓰기 RPC 4개(소유자 전용)        — 겹침 판정을 DB 안에 가둔다
--   4) get_secret_post_highlights      — 비밀글 발췌문의 유일한 배달 경로
--   5) public.memo_folder_settings     — 메모 화면의 폴더(=원본 카테고리)
--                                        표시 순서 / 커버 / 비율 / 구도
--   6) memo_folder_settings RLS + GRANT + 쓰기 RPC
--   7) get_memo_folder_cover_object    — /api/post-cover?memo=<id> 프록시용
--
-- 기존 테이블(posts / categories / post_contents / post_covers)의
-- 구조·제약·RLS·GRANT는 **한 글자도 건드리지 않는다**. 전부 추가뿐이다.
--
--
-- ★ 왜 posts나 post_contents의 컬럼이 아니라 새 테이블인가
-- --------------------------------------------------------
-- 요구사항: "공개 원문의 하이라이트·메모는 방문자도 읽을 수 있고,
-- 보호된 원문의 발췌문·메모는 원문 열람 조건을 충족해야 읽을 수 있다.
-- 화면에서 숨기는 것에 그치지 않고 API/RPC/RLS 등 실제 접근 경로에서
-- 제한한다."
--
-- 발췌문(excerpt)은 **원문의 일부를 그대로 복제한 값**이다. 비밀글의
-- 발췌문이 새면 본문이 조각조각 새는 것과 같다. RLS는 행 단위라
-- "이 글의 하이라이트 행 전체"를 공개 범위로 판정할 수 있고, 그것이
-- 정확히 필요한 모양이다 — post_covers가 대표 이미지를 분리해 낸 것과
-- 완전히 같은 이유·같은 구조다
-- ([[20260910100000_gallery_category_and_post_covers.sql]]).
--
--
-- ★ 위치 저장 방식 — 왜 offset "과" 텍스트를 함께 두는가
-- ------------------------------------------------------
-- 요구사항 9: "스킨의 CSS 선택자나 화면 좌표만으로 발췌 위치를 저장하지
-- 않는다. 같은 문장이 여러 번 있어도 임의의 첫 번째 문장에 연결하지
-- 않는다. 원문 수정 후 위치를 확실히 찾지 못하면 잘못된 문장에 표시하지
-- 않는다."
--
-- 그래서 네 값을 함께 저장한다.
--   excerpt     발췌 당시의 글자 그대로
--   prefix      바로 앞 문맥(최대 120자)
--   suffix      바로 뒤 문맥(최대 120자)
--   text_start  본문 **평문**에서의 시작 위치(문자 수)
--
-- 클라이언트(posts/view/posts-view-highlight-anchor.js)는 재방문 때
-- 이 네 값으로 후보를 찾는다: excerpt가 같고 prefix/suffix가 같은
-- 후보가 **정확히 하나**일 때만 연결하고, 0개거나 2개 이상이면
-- "원문이 변경되어 위치를 찾을 수 없음" 상태로 남긴다(카드와 메모는
-- 그대로 보존된다). text_start는 후보가 여럿일 때 가장 가까운 것을
-- 고르는 기준이 아니라 **겹침 판정**(아래 3번)의 좌표다.
--
-- DOM 선택자나 px 좌표는 저장하지 않는다 — 스킨을 바꾸거나 글자 크기를
-- 바꾸면 즉시 무의미해지는 값이다.
--
--
-- ★ 겹침 판정을 왜 DB에서 하는가
-- ------------------------------
-- 요구사항 8: "정확히 같은 범위를 다시 선택하면 기존 항목의 색만 변경하고
-- 중복 카드를 만들지 않는다. 일부만 겹치는 선택은 첫 버전에서 저장을
-- 막는다. 빠르게 반복 클릭하거나 재시도해도 중복 저장이 발생하지 않는다."
--
-- 클라이언트에서만 판정하면 두 번 빠르게 누른 두 요청이 서로를 못 보고
-- 둘 다 통과한다. 판정과 삽입이 한 트랜잭션 안에 있어야 한다.
--
--
-- 공통 보안 원칙(저장소 관례 그대로):
--   · 쓰기는 테이블에 GRANT하지 않고 RPC로만 — "남의 글에 하이라이트를
--     붙이는" 경로가 구조적으로 존재하지 않는다(post_covers와 동일).
--   · SECURITY DEFINER + SET search_path = '' (모든 참조를 스키마 한정)
--   · SECURITY DEFINER는 RLS를 우회하므로 본문에서 auth.uid()로 소유권을
--     반드시 다시 확인한다.
--   · PUBLIC EXECUTE는 명시적 revoke.
--
-- 실행 순서/재실행
-- ----------------
-- 전체가 하나의 트랜잭션이고, 모든 DDL에 if not exists /
-- drop policy if exists / create or replace 가드가 있어 그대로 다시
-- 실행해도 안전하다. drop table / drop column 은 하나도 없다.
--
-- ※ Supabase SQL Editor에 붙여넣어 적용한다. supabase CLI로 적용하게
--   되면 CLI가 이미 트랜잭션을 열므로 begin/commit 두 줄은 제거한다.
-- =========================================================

begin;


-- =========================================================
-- 1) public.post_highlights
--
-- 하이라이트 한 행이 곧 메모 카드 한 장이다(요구사항 4: "메모가
-- 없어도 하이라이트만으로 카드 생성"). note가 null이면 "메모 없는
-- 카드"이고, 메모 삭제는 note를 null로 만드는 것이지 행을 지우는 게
-- 아니다(요구사항 6).
--
-- user_id는 post.user_id와 같은 값이다(블로그 주인장). 중복이지만
-- 두는 이유는 두 가지다: (a) 메모 카테고리가 "이 블로그의 카드 전부"를
-- 한 번에 세는데 매번 posts를 조인하지 않아도 된다, (b) 쓰기 RPC가
-- 소유권을 확인한 값을 그대로 박아 두므로 나중에 posts의 주인이
-- 바뀌는 경로가 생겨도 이 행이 조용히 남의 것이 되지 않는다.
--
-- ★ 카드별 비밀번호(추후)를 위해 지금 비워 두는 자리
--   요구사항 11: "이번 단계에서 임시 평문 비밀번호 컬럼이나 작동하지
--   않는 비밀번호 설정 UI를 만들지 않는다." 그래서 컬럼을 만들지
--   **않는다**. 나중에 추가할 때 이 테이블에
--     lock_password_hash text  (+ 해제 RPC)
--   한 컬럼과 RPC 하나만 더하면 되고, 아래 SELECT 정책은 그대로 두고
--   "잠긴 카드는 excerpt/note를 빈 값으로 바꾼 뷰"를 새로 얹는 모양이
--   된다 — 원문 비밀번호(posts.secret_password_hash)와는 끝까지 별개의
--   값이다(요구사항 11 "카드 잠금을 풀었다고 보호된 원문에 접근할 수
--   있으면 안 된다").
-- =========================================================

create table if not exists public.post_highlights (

  id uuid primary key default gen_random_uuid(),

  post_id bigint not null
    references public.posts (id) on delete cascade,

  user_id uuid not null
    references auth.users (id) on delete cascade,

  /* 본문 강조 서식과 같은 표기(#rrggbb). 저장 시 소문자로 정규화된다. */
  color text not null
    check (color ~ '^#[0-9a-f]{6}$'),

  excerpt text not null
    check (char_length(excerpt) between 1 and 4000),

  prefix text not null default ''
    check (char_length(prefix) <= 120),

  suffix text not null default ''
    check (char_length(suffix) <= 120),

  text_start integer not null
    check (text_start >= 0),

  /*
    메모. 참고 이미지의 500자 제한은 도입하지 않는다(요구사항 6) —
    사람이 손으로 쓰는 메모의 상한으로 5000자를 둔다. 저장되는 것은
    **글자**이고 화면은 textContent로 넣는다(요구사항 11 "메모 입력은
    실행 가능한 HTML로 취급하지 않는다").
  */
  note text
    check (note is null or char_length(note) <= 5000),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);


comment on table public.post_highlights is
  'HIGHLIGHT-1: 글 뷰어에서 주인장이 만든 하이라이트. 한 행이 메모 카드 한 장이다(note가 null이면 메모 없는 카드). 발췌문은 원문의 복제본이라 posts의 컬럼이 아니라 별도 테이블로 두고 SELECT 정책이 원문의 공개 범위를 그대로 따른다 — post_covers가 대표 이미지를 분리한 것과 같은 구조. 위치는 DOM 선택자/좌표가 아니라 excerpt+prefix+suffix+text_start(본문 평문 기준)로 저장한다.';

comment on column public.post_highlights.text_start is
  'HIGHLIGHT-1: 발췌 당시 본문 **평문**에서의 시작 위치(문자 수). 재방문 시 위치를 찾는 기준이 아니라(그건 excerpt+prefix+suffix가 한다) 같은 글 안의 겹침 판정 좌표다. 원문이 수정되면 이 값은 낡을 수 있고, 그래서 단독으로는 아무것도 결정하지 않는다.';

comment on column public.post_highlights.note is
  'HIGHLIGHT-1: 메모 본문(글자, 마크업 아님). null = 메모 없는 카드. "메모 삭제"는 이 값을 null로 만드는 것이고 "하이라이트 삭제"가 행을 지운다.';


create index if not exists post_highlights_post_id_idx
  on public.post_highlights (post_id);

create index if not exists post_highlights_user_created_idx
  on public.post_highlights (user_id, created_at desc);


/*
  정확히 같은 범위를 두 번 넣을 수 없다. 아래 save RPC가 먼저
  "같은 범위면 색만 바꾼다"로 처리하므로 이 제약에 걸리는 것은
  두 요청이 동시에 들어온 경우뿐이고, 그때 뒤늦은 쪽이 깨지는 것이
  옳다(요구사항 8 "빠르게 반복 클릭해도 중복 저장이 발생하지 않는다").
*/
create unique index if not exists post_highlights_exact_range_idx
  on public.post_highlights (post_id, text_start, md5(excerpt));


-- =========================================================
-- 2) RLS + GRANT — 이 파일의 핵심
--
-- SELECT 정책이 이 기능의 유일한 읽기 경계다:
--   * 내 글의 하이라이트는 공개 범위와 무관하게 내가 다 본다.
--   * 남의 글은 그 글이 **public일 때만** 본다.
--     → secret(비밀글) / private(비공개) 글의 발췌문·메모는 어떤
--       select로도, 어떤 embed로도, 어떤 count로도 방문자에게 가지
--       않는다(요구사항 11 "목록 응답, 개수, 검색, 미리보기 등에서도
--       보호된 내용이 새지 않게 한다").
--
-- posts 자신의 RLS도 그대로 겹쳐 적용되므로 private 글은 애초에 행이
-- 오지 않는다 — 아래 exists 는 secret 차단이 실질적인 역할이다.
-- 원문이 삭제되면 cascade로 함께 사라진다(요구사항 9 마지막 항목).
--
-- 쓰기(INSERT/UPDATE/DELETE)는 GRANT하지 않는다. 3번의 RPC만이 쓴다.
-- =========================================================

alter table public.post_highlights enable row level security;


drop policy if exists post_highlights_scoped_read on public.post_highlights;

create policy post_highlights_scoped_read
on public.post_highlights
for select
to anon, authenticated
using (
  exists (
    select 1
      from public.posts p
     where p.id = public.post_highlights.post_id
       and (
         p.visibility = 'public'
         or p.user_id = auth.uid()
       )
  )
);


revoke all on public.post_highlights from anon, authenticated;

grant select (
  id,
  post_id,
  user_id,
  color,
  excerpt,
  prefix,
  suffix,
  text_start,
  note,
  created_at,
  updated_at
) on public.post_highlights to anon, authenticated;


-- =========================================================
-- 3) 쓰기 RPC — 전부 소유자 전용
--
-- save_own_post_highlight()는 요구사항 8의 네 가지 판정을 한
-- 트랜잭션 안에서 전부 한다:
--
--   같은 범위        → 기존 행의 색만 바꾼다(메모 유지, 카드 그대로)
--   부분 겹침/포함   → 거절(errcode 23505, message 'highlight_overlap')
--   경계만 맞닿음    → 겹침이 아니다. [a,b)와 [b,c)는 통과한다.
--   떨어진 범위      → 새 행
--
-- 범위는 [text_start, text_start + char_length(excerpt)) 반열린 구간이다.
-- 그래서 "경계만 맞닿은" 경우가 자동으로 통과한다 — 별도 예외 처리가
-- 필요 없다.
-- =========================================================

create or replace function public.save_own_post_highlight(
  p_post_id    bigint,
  p_color      text,
  p_excerpt    text,
  p_prefix     text,
  p_suffix     text,
  p_text_start integer,
  p_note       text default null
)
returns table (
  id     uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner   uuid;
  v_color   text;
  v_end     integer;
  v_existing public.post_highlights%rowtype;
  v_id      uuid;
begin

  if auth.uid() is null then
    raise exception 'save_own_post_highlight: authentication required'
      using errcode = '42501';
  end if;


  select p.user_id into v_owner
    from public.posts p
   where p.id = p_post_id;

  if v_owner is null then
    raise exception 'save_own_post_highlight: post % not found', p_post_id
      using errcode = '23503';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'save_own_post_highlight: not the owner of post %', p_post_id
      using errcode = '42501';
  end if;


  v_color := lower(btrim(coalesce(p_color, '')));

  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'save_own_post_highlight: invalid color %', p_color
      using errcode = '22023';
  end if;


  if p_excerpt is null or char_length(p_excerpt) = 0 then
    raise exception 'save_own_post_highlight: empty excerpt'
      using errcode = '22023';
  end if;

  if p_text_start is null or p_text_start < 0 then
    raise exception 'save_own_post_highlight: invalid text_start'
      using errcode = '22023';
  end if;


  v_end := p_text_start + char_length(p_excerpt);


  /* (a) 정확히 같은 범위 — 색만 바꾼다. 메모는 건드리지 않는다. */

  select * into v_existing
    from public.post_highlights h
   where h.post_id = p_post_id
     and h.text_start = p_text_start
     and h.excerpt = p_excerpt
   limit 1;

  if found then

    update public.post_highlights h
       set color = v_color,
           prefix = coalesce(p_prefix, h.prefix),
           suffix = coalesce(p_suffix, h.suffix),
           updated_at = now()
     where h.id = v_existing.id;

    return query select v_existing.id, 'recolored'::text;

    return;

  end if;


  /* (b) 부분 겹침 / 포함 — 첫 버전에서는 저장을 막는다. */

  if exists (
    select 1
      from public.post_highlights h
     where h.post_id = p_post_id
       and h.text_start < v_end
       and (h.text_start + char_length(h.excerpt)) > p_text_start
  ) then
    raise exception 'highlight_overlap'
      using errcode = '23505';
  end if;


  /* (c) 새 항목 */

  insert into public.post_highlights (
    post_id, user_id, color, excerpt, prefix, suffix, text_start, note
  )
  values (
    p_post_id,
    auth.uid(),
    v_color,
    p_excerpt,
    coalesce(p_prefix, ''),
    coalesce(p_suffix, ''),
    p_text_start,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning public.post_highlights.id into v_id;


  return query select v_id, 'created'::text;

end;
$fn$;


comment on function public.save_own_post_highlight(bigint, text, text, text, text, integer, text) is
  'HIGHLIGHT-1: 하이라이트를 만들거나(새 범위) 색만 바꾼다(정확히 같은 범위 — 메모와 카드는 그대로). 부분 겹침/포함은 23505 + message ''highlight_overlap''으로 거절한다(요구사항 8, 첫 버전). 경계만 맞닿은 범위는 반열린 구간이라 자동으로 통과한다. 판정과 삽입이 한 트랜잭션 안에 있어 빠른 반복 호출에도 중복이 생기지 않는다. 글 주인만 호출할 수 있다.';


create or replace function public.update_own_post_highlight_color(
  p_id    uuid,
  p_color text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_color text;
begin

  v_color := lower(btrim(coalesce(p_color, '')));

  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'update_own_post_highlight_color: invalid color %', p_color
      using errcode = '22023';
  end if;

  update public.post_highlights h
     set color = v_color,
         updated_at = now()
   where h.id = p_id
     and h.user_id = auth.uid();

  if not found then
    raise exception 'update_own_post_highlight_color: highlight not found'
      using errcode = '42501';
  end if;

end;
$fn$;


/*
  메모만 지운다 — 하이라이트와 카드는 남는다(요구사항 6).
  빈 문자열/공백만 있는 입력은 null과 같게 취급한다.
*/

create or replace function public.update_own_post_highlight_note(
  p_id   uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin

  if p_note is not null and char_length(p_note) > 5000 then
    raise exception 'update_own_post_highlight_note: note too long'
      using errcode = '22023';
  end if;

  update public.post_highlights h
     set note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_at = now()
   where h.id = p_id
     and h.user_id = auth.uid();

  if not found then
    raise exception 'update_own_post_highlight_note: highlight not found'
      using errcode = '42501';
  end if;

end;
$fn$;


create or replace function public.delete_own_post_highlight(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin

  delete from public.post_highlights h
   where h.id = p_id
     and h.user_id = auth.uid();

  if not found then
    raise exception 'delete_own_post_highlight: highlight not found'
      using errcode = '42501';
  end if;

end;
$fn$;


comment on function public.delete_own_post_highlight(uuid) is
  'HIGHLIGHT-1: 하이라이트 행을 지운다 — 연결된 메모 카드도 같은 행이므로 함께 사라진다(요구사항 6 "하이라이트 삭제"). 메모만 지우는 것은 update_own_post_highlight_note(id, null)이다.';


revoke execute on function
  public.save_own_post_highlight(bigint, text, text, text, text, integer, text),
  public.update_own_post_highlight_color(uuid, text),
  public.update_own_post_highlight_note(uuid, text),
  public.delete_own_post_highlight(uuid)
from public, anon;

grant execute on function
  public.save_own_post_highlight(bigint, text, text, text, text, integer, text),
  public.update_own_post_highlight_color(uuid, text),
  public.update_own_post_highlight_note(uuid, text),
  public.delete_own_post_highlight(uuid)
to authenticated;


-- =========================================================
-- 4) 비밀글의 하이라이트 — 원문과 같은 문을 쓴다
--
-- 요구사항 11: "보호된 원문의 발췌문·메모는 기존 원문 열람 조건을
-- 충족해야 읽을 수 있다."
--
-- 비밀글의 열람 조건은 이미 하나뿐이다 —
-- public.get_secret_post_content(post_id, password)가 행을 돌려주는가.
-- 그 함수의 비밀번호 대조 방식(bcrypt 해시 비교)을 여기서 **다시 쓰지
-- 않는다**. 그대로 호출해서 통과 여부만 본다. 그래야 나중에 그쪽
-- 정책이 바뀌어도(잠금 횟수 제한 등) 이 경로가 따로 뒤처지지 않는다.
--
-- 정상 호출에서 본문 자체는 쓰지 않고 버린다 — 이 함수가 돌려주는 것은
-- 하이라이트 행뿐이다.
-- =========================================================

create or replace function public.get_secret_post_highlights(
  p_post_id  bigint,
  p_password text
)
returns table (
  id         uuid,
  post_id    bigint,
  color      text,
  excerpt    text,
  prefix     text,
  suffix     text,
  text_start integer,
  note       text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_ok boolean := false;
begin

  perform 1
    from public.get_secret_post_content(p_post_id, p_password) g
   limit 1;

  v_ok := found;

  if not v_ok then
    return;
  end if;

  return query
    select h.id,
           h.post_id,
           h.color,
           h.excerpt,
           h.prefix,
           h.suffix,
           h.text_start,
           h.note,
           h.created_at,
           h.updated_at
      from public.post_highlights h
     where h.post_id = p_post_id
     order by h.text_start;

end;
$fn$;


comment on function public.get_secret_post_highlights(bigint, text) is
  'HIGHLIGHT-1: 비밀글의 하이라이트/메모를 돌려주는 유일한 경로. 비밀번호 대조를 직접 하지 않고 public.get_secret_post_content()를 그대로 호출해 통과 여부만 본다 — 원문과 같은 문을 쓴다는 뜻이다. 틀리면 빈 결과(오류가 아니다).';


revoke execute on function public.get_secret_post_highlights(bigint, text) from public;

grant execute on function public.get_secret_post_highlights(bigint, text)
to anon, authenticated;


-- =========================================================
-- 5) public.memo_folder_settings
--
-- 요구사항 7: "메모 화면에서의 폴더 표시 순서 / 폴더별 커버 이미지 /
-- 커버 이미지 비율 / 커버가 잘리는 위치. 메모 폴더의 커버·순서를
-- 바꿔도 원본 글 카테고리의 설정이 의도치 않게 바뀌지 않도록 별도로
-- 관리한다."
--
-- 그래서 categories에 컬럼을 더하지 않고 **옆 테이블**로 둔다. 행이
-- 없는 카테고리는 기본값(원본 순서, 커버 없음, 원본 비율, 가운데)으로
-- 그려지므로 이 기능을 쓰지 않으면 아무 데이터도 생기지 않는다.
--
-- 여기서 말하는 "폴더"는 원본 글의 카테고리다 — 별도의 중첩 폴더
-- 시스템(post_folders)과는 무관하다(요구사항 7).
--
-- 커버 파일은 글 대표 이미지와 같은 비공개 버킷('post-covers')을
-- 쓴다. 같은 소유자·같은 수명 규칙이고, 배달도 같은 프록시
-- (/api/post-cover?memo=<카테고리 id>)를 쓴다.
-- =========================================================

create table if not exists public.memo_folder_settings (

  category_id bigint primary key
    references public.categories (id) on delete cascade,

  user_id uuid not null
    references auth.users (id) on delete cascade,

  sort_order integer not null default 0,

  /* post-covers 버킷 안의 object key. 공개 주소가 아니다. */
  cover_path text
    check (cover_path is null or char_length(cover_path) between 1 and 400),

  /*
    "커버가 있는가"만 공개한다. cover_path 자체는 비공개 버킷의 경로라
    SELECT GRANT에서 빠져 있는데, 화면은 <img>를 그릴지 말지를 알아야
    한다 — 그 판단에 필요한 것은 존재 여부 한 비트뿐이다.
  */
  has_cover boolean
    generated always as (cover_path is not null) stored,

  cover_ratio text not null default 'original'
    check (cover_ratio in ('1:1', '3:4', '4:3', 'original')),

  /* 커버가 잘리는 위치(object-position, %). 0~100. */
  cover_focus_x smallint not null default 50
    check (cover_focus_x between 0 and 100),

  cover_focus_y smallint not null default 50
    check (cover_focus_y between 0 and 100),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);


comment on table public.memo_folder_settings is
  'HIGHLIGHT-1: 메모 화면의 폴더별 표시 설정. 여기서 폴더 = 원본 글의 카테고리다. categories에 컬럼을 더하지 않고 옆 테이블로 둔 이유는 요구사항 7("메모 폴더의 커버·순서를 바꿔도 원본 글 카테고리의 설정이 의도치 않게 바뀌지 않도록 별도로 관리") 때문이다. 행이 없으면 기본값으로 그려진다.';

comment on column public.memo_folder_settings.cover_path is
  'HIGHLIGHT-1: post-covers(비공개) 버킷 안의 object key. 공개 주소가 아니며 SELECT GRANT에서 제외되어 있다 — 화면은 /api/post-cover?memo=<카테고리 id>로만 받는다.';


create index if not exists memo_folder_settings_user_idx
  on public.memo_folder_settings (user_id, sort_order);


-- =========================================================
-- 6) memo_folder_settings RLS + GRANT + 쓰기 RPC
--
-- 읽기는 전부 공개다 — 담고 있는 것이 "이 카테고리를 메모 화면에서
-- 몇 번째로, 어떤 비율로 그릴까"뿐이고, 카테고리 자체가 이미 공개
-- 정보다. 단 cover_path는 SELECT GRANT에서 뺀다(비공개 버킷 경로).
--
-- 쓰기는 RPC 전용.
-- =========================================================

alter table public.memo_folder_settings enable row level security;


drop policy if exists memo_folder_settings_public_read on public.memo_folder_settings;

create policy memo_folder_settings_public_read
on public.memo_folder_settings
for select
to anon, authenticated
using (true);


revoke all on public.memo_folder_settings from anon, authenticated;

grant select (
  category_id,
  user_id,
  sort_order,
  has_cover,
  cover_ratio,
  cover_focus_x,
  cover_focus_y,
  updated_at
) on public.memo_folder_settings to anon, authenticated;


/*
  설정 저장. 반환값은 **이 호출로 밀려난 이전 cover_path**(없으면 null)다 —
  호출자는 저장이 전부 성공한 뒤에야 그 파일을 지운다(post_covers와
  같은 계약: "실패했다고 기존 사진을 먼저 덮거나 삭제하지 말 것").

  p_cover_path에 null을 주면 "커버 없음"이고, 빈 문자열은 "바꾸지 않음"이
  아니다 — 애매함을 없애려고 p_keep_cover 플래그를 따로 둔다.
*/

create or replace function public.upsert_own_memo_folder_settings(
  p_category_id   bigint,
  p_sort_order    integer,
  p_cover_ratio   text,
  p_cover_focus_x smallint,
  p_cover_focus_y smallint,
  p_cover_path    text default null,
  p_keep_cover    boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner    uuid;
  v_previous text;
  v_ratio    text;
begin

  if auth.uid() is null then
    raise exception 'upsert_own_memo_folder_settings: authentication required'
      using errcode = '42501';
  end if;


  select c.user_id into v_owner
    from public.categories c
   where c.id = p_category_id;

  if v_owner is null then
    raise exception 'upsert_own_memo_folder_settings: category % not found', p_category_id
      using errcode = '23503';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'upsert_own_memo_folder_settings: not the owner of category %', p_category_id
      using errcode = '42501';
  end if;


  v_ratio := coalesce(nullif(btrim(coalesce(p_cover_ratio, '')), ''), 'original');

  if v_ratio not in ('1:1', '3:4', '4:3', 'original') then
    raise exception 'upsert_own_memo_folder_settings: invalid ratio %', p_cover_ratio
      using errcode = '22023';
  end if;


  select s.cover_path into v_previous
    from public.memo_folder_settings s
   where s.category_id = p_category_id;


  insert into public.memo_folder_settings (
    category_id, user_id, sort_order,
    cover_path, cover_ratio, cover_focus_x, cover_focus_y
  )
  values (
    p_category_id,
    auth.uid(),
    coalesce(p_sort_order, 0),
    case when p_keep_cover then null else p_cover_path end,
    v_ratio,
    coalesce(p_cover_focus_x, 50),
    coalesce(p_cover_focus_y, 50)
  )
  on conflict (category_id) do update
     set sort_order    = excluded.sort_order,
         cover_path    = case when p_keep_cover
                              then public.memo_folder_settings.cover_path
                              else excluded.cover_path end,
         cover_ratio   = excluded.cover_ratio,
         cover_focus_x = excluded.cover_focus_x,
         cover_focus_y = excluded.cover_focus_y,
         updated_at    = now();


  if p_keep_cover then
    return null;
  end if;

  if v_previous is not distinct from p_cover_path then
    return null;
  end if;

  return v_previous;

end;
$fn$;


comment on function public.upsert_own_memo_folder_settings(bigint, integer, text, smallint, smallint, text, boolean) is
  'HIGHLIGHT-1: 메모 화면의 폴더(원본 카테고리) 표시 설정을 저장한다. 반환값은 이 호출로 밀려난 이전 cover_path(없으면 null) — 호출자는 저장이 성공한 뒤에만 그 파일을 지운다. p_keep_cover=true면 커버는 손대지 않고 순서/비율/구도만 바꾼다. 카테고리 주인만 호출할 수 있으며, 원본 카테고리 행(categories)은 전혀 건드리지 않는다.';


revoke execute on function
  public.upsert_own_memo_folder_settings(bigint, integer, text, smallint, smallint, text, boolean)
from public, anon;

grant execute on function
  public.upsert_own_memo_folder_settings(bigint, integer, text, smallint, smallint, text, boolean)
to authenticated;


/*
  내 메모 폴더 커버 경로들 — 삭제/교체 시 Storage 정리에만 쓴다
  (get_own_post_cover_paths와 같은 역할).
*/

create or replace function public.get_own_memo_folder_cover_paths(
  p_category_ids bigint[]
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.cover_path
    from public.memo_folder_settings s
   where s.user_id = auth.uid()
     and s.category_id = any (p_category_ids)
     and s.cover_path is not null
$fn$;


revoke execute on function public.get_own_memo_folder_cover_paths(bigint[]) from public, anon;

grant execute on function public.get_own_memo_folder_cover_paths(bigint[]) to authenticated;


-- =========================================================
-- 7) get_memo_folder_cover_object — /api/post-cover?memo=<id>
--
-- 메모 폴더 커버는 카테고리의 장식이라 카테고리와 같은 공개 범위를
-- 갖는다(카테고리 자체가 공개 정보다). 그래서 판정 없이 경로만
-- 준다 — get_category_cover_object와 같은 계약이고 같은 프록시가
-- 흘려보낸다.
-- =========================================================

create or replace function public.get_memo_folder_cover_object(
  p_category_id bigint
)
returns table (
  storage_path text,
  mime_type    text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.cover_path, null::text
    from public.memo_folder_settings s
   where s.category_id = p_category_id
     and s.cover_path is not null
$fn$;


comment on function public.get_memo_folder_cover_object(bigint) is
  'HIGHLIGHT-1: /api/post-cover?memo=<카테고리 id> 프록시가 부른다. 메모 폴더 커버는 카테고리 장식이라 카테고리와 같은 공개 범위다 — 판정 없이 경로만 준다. mime은 저장하지 않으므로 null이고 프록시가 확장자로 정한다(get_category_cover_object와 동일).';


revoke all on function public.get_memo_folder_cover_object(bigint) from public;

grant execute on function public.get_memo_folder_cover_object(bigint) to anon, authenticated;


commit;
