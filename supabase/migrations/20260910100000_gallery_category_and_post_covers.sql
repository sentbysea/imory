-- =========================================================
-- GALLERY-1 — 카테고리 표시 방식(목록/갤러리) + 글 대표 이미지
--
-- 기준 문서: IMORY_GALLERY1_DESIGN.md
--
-- 이 migration이 하는 일
-- ----------------------
--   1) categories에 표시 설정 컬럼 5개 **추가**
--        list_style / page_size / secret_cover_mode
--        secret_cover_url / secret_cover_path
--   2) storage 버킷 'post-covers'
--   3) public.post_covers — 글 하나당 대표 이미지 하나
--   4) post_covers RLS + GRANT (이 파일의 핵심 방어선)
--   5) storage 정책 (3번 테이블을 참조하므로 그 뒤)
--   6) upsert_own_post_cover / delete_own_post_cover RPC
--
-- 기존 테이블의 구조/제약/RLS는 하나도 건드리지 않는다. posts와
-- categories의 CREATE TABLE은 저장소 migration에 없고 Supabase
-- Dashboard에서 만들어진 것이므로([[20260908100000_create_post_folders.sql]]
-- 상단), 추측해서 다시 쓰지 않고 **추가만** 한다.
--
--
-- ★ 왜 posts에 컬럼을 더하지 않고 새 테이블인가
-- ---------------------------------------------
-- 요구사항: "비밀글의 실제 대표 이미지를 방문자에게 보내고 CSS로
-- 가리는 방식은 금지. 방문자에게는 대체 이미지만 제공."
--
-- posts.cover_image_url 컬럼이면 이 요구를 DB에서 강제할 방법이
-- 없다. 비밀글은 **행 자체가 방문자에게 보여야 하고**(제목이 목록에
-- 나온다) RLS는 행 단위, GRANT는 컬럼 단위라 "이 행에서는 이 컬럼만
-- 가려라"를 표현할 수 없다. 클라이언트가 select 목록에서 빼는 것은
-- 관례일 뿐이고, 방문자가 PostgREST를 직접 호출하면
--   /rest/v1/posts?select=id,cover_image_url&visibility=eq.secret
-- 한 줄로 전부 새어나간다.
--
-- 그래서 대표 이미지를 **행 단위로 분리**한다. post_covers는 글마다
-- 한 행이고, 그 행의 SELECT 정책이 "이 글이 public인가 / 내가 주인인가"를
-- 직접 판정한다. post_contents가 본문을 분리해 낸 것과 완전히 같은
-- 이유·같은 모양이다(요구사항 "대표 이미지 정보는 본문과 분리해서
-- 조회 가능하게").
--
--
-- ★ Storage는 public 버킷이다 — 그 의미
-- -------------------------------------
-- 'post-covers'는 user-avatars/skin-images와 같은 public read 버킷이다.
-- 비공개 버킷으로 만들면 방문자의 <img>가 헤더를 실을 수 없어 공개
-- 글의 썸네일조차 뜨지 않는다(서명 URL은 만료가 있어 published 화면에
-- 못 쓴다). 대신 이 migration이 보장하는 것은:
--
--   * 경로가 {user_id}/{uuid}.{ext}로 매번 새로 생성되어 추측 불가능하다.
--   * 비밀글/비공개 글의 URL은 **어떤 조회 경로로도 방문자에게
--     전달되지 않는다** — post_covers의 SELECT 정책이 막는다.
--
-- 즉 "URL을 이미 아는 사람"만 파일에 닿을 수 있고, 방문자는 그 URL을
-- 얻을 방법이 없다. 진짜 파일 단위 접근 통제가 필요해지면 비공개
-- 버킷 + Edge Function 프록시로 옮겨야 한다 — 그 차이는 기준 문서
-- §7(남은 차이)에 적혀 있다.
--
--
-- 실행 순서/재실행
-- ----------------
-- 전체가 하나의 트랜잭션이다. 모든 DDL에 if not exists /
-- drop policy if exists / create or replace 가드가 있어 그대로 다시
-- 실행해도 안전하고, drop 하는 문장은 하나도 없다.
--
-- ※ Supabase SQL Editor에 붙여넣어 적용한다. 훗날 supabase CLI로
--   적용하게 되면 CLI가 이미 트랜잭션을 열므로 begin/commit 두 줄은
--   제거해야 한다([[20260907100000_create_skin_image_library.sql]]와 동일).
-- =========================================================

begin;


-- =========================================================
-- 1) categories — 표시 설정 컬럼
--
-- 전부 not null + default라 기존 행은 자동으로 "지금과 같은 화면"이
-- 된다: list_style='list'이면 GALLERY-1 이전과 조회·정렬·계약이
-- 한 글자도 다르지 않다(요구사항 "기존 카테고리는 기본적으로 지금
-- 목록 표시를 유지").
--
-- GRANT를 따로 손대지 않는다: categories는 테이블 단위 GRANT라
-- (2026-09-10 프로덕션 anon key 실측 — select=* 가 전체 컬럼을
-- 돌려준다) 새 컬럼이 자동으로 포함된다. posts처럼 컬럼 단위로
-- 잠긴 테이블이 아니다.
-- =========================================================

alter table public.categories
  add column if not exists list_style text not null default 'list';

alter table public.categories
  add column if not exists page_size smallint not null default 12;

alter table public.categories
  add column if not exists secret_cover_mode text not null default 'lock';

alter table public.categories
  add column if not exists secret_cover_url text;

alter table public.categories
  add column if not exists secret_cover_path text;


do $$
begin

  if not exists (
    select 1 from pg_constraint
     where conname = 'categories_list_style_check'
  ) then
    alter table public.categories
      add constraint categories_list_style_check
      check (list_style in ('list', 'gallery'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'categories_page_size_check'
  ) then
    alter table public.categories
      add constraint categories_page_size_check
      check (page_size in (6, 12, 18, 24));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'categories_secret_cover_mode_check'
  ) then
    alter table public.categories
      add constraint categories_secret_cover_mode_check
      check (secret_cover_mode in ('lock', 'image'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'categories_secret_cover_url_check'
  ) then
    alter table public.categories
      add constraint categories_secret_cover_url_check
      check (secret_cover_url is null or secret_cover_url ~ '^https://');
  end if;

end
$$;


comment on column public.categories.list_style is
  'GALLERY-1: 이 카테고리 글 목록의 표시 방식. list(기본, 기존 동작) | gallery. 실제로 갤러리로 그려질지는 렌더 중인 스킨이 category.gallery 계약을 쓰는지에도 달려 있다 — 쓰지 않는 스킨에서는 list와 완전히 동일하게 동작한다(IMORY_GALLERY1_DESIGN.md §4).';

comment on column public.categories.page_size is
  'GALLERY-1: 갤러리 한 페이지에 담는 글 수(6/12/18/24). list_style=list에서는 사용되지 않는다 — 목록은 지금까지처럼 페이지를 나누지 않는다.';

comment on column public.categories.secret_cover_mode is
  'GALLERY-1: 이 카테고리 비밀글의 갤러리 카드 미리보기. lock(기본, 이미지 없는 잠금 카드) | image(secret_cover_url을 공통으로 사용). image인데 secret_cover_url이 비어 있으면 lock으로 되돌아간다.';

comment on column public.categories.secret_cover_url is
  'GALLERY-1: secret_cover_mode=image일 때 이 카테고리의 모든 비밀글 카드에 공통으로 쓰는 대체 이미지. 비밀글의 실제 대표 이미지는 절대 방문자에게 가지 않는다(post_covers RLS) — 이 값은 대체 이미지이므로 공개되어도 안전하다.';

comment on column public.categories.secret_cover_path is
  'GALLERY-1: secret_cover_url이 가리키는 post-covers 버킷 안의 object key. 교체/제거 시 이전 파일을 지우기 위해서만 쓴다.';


-- =========================================================
-- 2) STORAGE BUCKET — post-covers
--
-- 경로 규칙: {user_id}/{uuid}.{ext} (매 업로드마다 새 경로,
-- 덮어쓰기 없음). skin-images와 같은 이유다 — 고정 경로에
-- 덮어쓰면 "저장이 실패했는데 사진은 이미 바뀐" 상태를 되돌릴 수
-- 없다([[20260907100000_create_skin_image_library.sql]] 1절,
-- admin/settings/admin-settings-avatar.js 상단 주석).
--
-- 카테고리 비밀글 대체 이미지도 같은 버킷을 쓴다(같은 소유자,
-- 같은 수명 규칙). 스킨 장식용 Images 슬롯(skin-images 버킷)과는
-- 버킷 자체가 다르다 — 소유·수명이 다르기 때문이다(요구사항 2절
-- 마지막 항목, 기준 문서 §3-4).
-- =========================================================

insert into storage.buckets (id, name, public)
values ('post-covers', 'post-covers', true)
on conflict (id) do nothing;


-- =========================================================
-- 3) public.post_covers
--
-- post_id가 PK이자 FK다 — 글 하나당 대표 이미지는 최대 하나
-- (요구사항 "첫 버전은 사용자가 직접 지정하는 방식", 여러 장
--  갤러리가 아니다). 글이 지워지면 함께 지워진다(cascade) —
-- 남은 Storage object는 고아가 되지만 어떤 화면에도 나타나지
-- 않는다(skin_images와 같은 정책, 자동 정리 작업은 만들지 않는다).
-- =========================================================

create table if not exists public.post_covers (

  post_id bigint primary key
    references public.posts (id) on delete cascade,

  user_id uuid not null
    references auth.users (id) on delete cascade,

  storage_path text not null unique
    check (char_length(storage_path) between 1 and 400),

  public_url text not null
    check (public_url ~ '^https://'),

  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),

  byte_size integer not null
    check (byte_size > 0 and byte_size <= 5242880),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);


comment on table public.post_covers is
  'GALLERY-1: 글의 대표 이미지(썸네일). posts가 아니라 별도 테이블인 이유는 "비밀글의 실제 이미지 주소가 방문자에게 가면 안 된다"를 RLS(행 단위)로 강제하기 위해서다 — posts의 컬럼이면 행은 보이는데 컬럼만 가리는 것을 DB가 표현할 수 없다. post_contents가 본문을 분리한 것과 같은 구조.';


create index if not exists post_covers_user_id_idx
  on public.post_covers (user_id);


-- =========================================================
-- 4) RLS + GRANT — 이 파일의 핵심
--
-- SELECT 정책이 이 기능의 유일한 보안 경계다:
--   * 내 글의 대표 이미지는 공개 범위와 무관하게 내가 다 본다.
--   * 남의 글은 그 글이 **public일 때만** 본다.
--     → secret(비밀글) / private(비공개) 글의 public_url은
--       어떤 select로도, 어떤 embed로도 방문자에게 가지 않는다.
--
-- posts 자신의 RLS도 그대로 겹쳐 적용된다 — private 글은 애초에
-- 방문자에게 행이 오지 않으므로 아래 exists 는 비밀글 차단이
-- 실질적인 역할이다.
--
-- 쓰기(INSERT/UPDATE/DELETE)는 GRANT하지 않는다. 6번의 두 RPC만이
-- 이 테이블에 쓴다 — 그래야 "다른 사람 글에 이미지를 붙인다"
-- 같은 경로가 구조적으로 존재하지 않는다(post_folders가 쓰기를
-- RPC 전용으로 둔 것과 같은 원칙).
-- =========================================================

alter table public.post_covers enable row level security;


drop policy if exists post_covers_public_read on public.post_covers;

create policy post_covers_public_read
on public.post_covers
for select
to anon, authenticated
using (
  exists (
    select 1
      from public.posts p
     where p.id = public.post_covers.post_id
       and (
         p.visibility = 'public'
         or p.user_id = auth.uid()
       )
  )
);


revoke all on public.post_covers from anon, authenticated;

grant select (
  post_id,
  public_url,
  mime_type,
  byte_size,
  updated_at
) on public.post_covers to anon, authenticated;


-- storage_path와 user_id는 의도적으로 SELECT GRANT에서 뺐다.
-- 화면이 필요로 하는 것은 public_url 하나이고, storage_path는
-- 정리(이전 파일 삭제) 용도로 아래 RPC가 돌려줄 때만 쓰인다.


-- =========================================================
-- 5) storage 정책 — post-covers
--
-- own-folder 쓰기 + 전체 읽기. user-avatars와 동일한 구조이며
-- (storage.foldername(name))[1] = auth.uid()::text 는 한 단계 더
-- 깊은 경로에도 그대로 적용된다.
-- =========================================================

drop policy if exists post_covers_owner_write on storage.objects;

create policy post_covers_owner_write
on storage.objects
for all
to authenticated
using (
  bucket_id = 'post-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'post-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);


drop policy if exists post_covers_public_object_read on storage.objects;

create policy post_covers_public_object_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'post-covers');


-- =========================================================
-- 6) RPC — 쓰기 경로
--
-- upsert_own_post_cover(post_id, storage_path, public_url,
--                       mime_type, byte_size) -> text
--   그 글의 대표 이미지를 이 값으로 만든다. 반환값은 **이 호출로
--   밀려난 이전 storage_path**(없으면 null)다 — 호출자는 저장이
--   전부 성공한 뒤에야 그 파일을 지운다. 순서를 반대로 하면
--   "저장은 실패했는데 예전 사진은 이미 사라진" 상태가 된다
--   (요구사항 2절 "실패했다고 기존 사진을 먼저 덮거나 삭제하지 말 것").
--
-- delete_own_post_cover(post_id) -> text
--   행을 지우고 지워진 storage_path를 돌려준다(없으면 null).
--
-- 둘 다 SECURITY DEFINER + auth.uid() 소유권 확인. RLS를 우회하는
-- 함수이므로 소유권 검사가 곧 방어선이다
-- ([[20260909100000_lock_down_post_contents_ooc.sql]]와 같은 구조).
-- =========================================================

create or replace function public.upsert_own_post_cover(
  p_post_id      bigint,
  p_storage_path text,
  p_public_url   text,
  p_mime_type    text,
  p_byte_size    integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner    uuid;
  v_previous text;
begin

  if auth.uid() is null then
    raise exception 'upsert_own_post_cover: authentication required'
      using errcode = '42501';
  end if;


  select p.user_id into v_owner
    from public.posts p
   where p.id = p_post_id;

  if v_owner is null then
    raise exception 'upsert_own_post_cover: post % not found', p_post_id
      using errcode = '23503';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'upsert_own_post_cover: not the owner of post %', p_post_id
      using errcode = '42501';
  end if;


  select c.storage_path into v_previous
    from public.post_covers c
   where c.post_id = p_post_id;


  insert into public.post_covers (
    post_id, user_id, storage_path, public_url, mime_type, byte_size
  )
  values (
    p_post_id, auth.uid(), p_storage_path, p_public_url, p_mime_type, p_byte_size
  )
  on conflict (post_id) do update
     set storage_path = excluded.storage_path,
         public_url   = excluded.public_url,
         mime_type    = excluded.mime_type,
         byte_size    = excluded.byte_size,
         updated_at   = now();


  /* 같은 파일을 다시 지정한 경우엔 지울 것이 없다 */
  if v_previous is not distinct from p_storage_path then
    return null;
  end if;

  return v_previous;

end;
$fn$;


create or replace function public.delete_own_post_cover(
  p_post_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner   uuid;
  v_deleted text;
begin

  if auth.uid() is null then
    raise exception 'delete_own_post_cover: authentication required'
      using errcode = '42501';
  end if;


  select p.user_id into v_owner
    from public.posts p
   where p.id = p_post_id;

  if v_owner is not null and v_owner <> auth.uid() then
    raise exception 'delete_own_post_cover: not the owner of post %', p_post_id
      using errcode = '42501';
  end if;


  delete from public.post_covers c
   where c.post_id = p_post_id
     and c.user_id = auth.uid()
  returning c.storage_path into v_deleted;


  return v_deleted;

end;
$fn$;


revoke all on function public.upsert_own_post_cover(bigint, text, text, text, integer) from public, anon;
revoke all on function public.delete_own_post_cover(bigint) from public, anon;

grant execute on function public.upsert_own_post_cover(bigint, text, text, text, integer) to authenticated;
grant execute on function public.delete_own_post_cover(bigint) to authenticated;


commit;
