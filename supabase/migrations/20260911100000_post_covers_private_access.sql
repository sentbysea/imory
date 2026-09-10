-- =========================================================
-- GALLERY-1 후속 (2차) — 대표 이미지를 비공개 저장소로 옮기고
--                        요청마다 권한을 확인한다
--
-- 기준 문서: IMORY_GALLERY1_DESIGN.md §3-5
-- 선행: [[20260910100000_gallery_category_and_post_covers.sql]]
--
-- ★ 이 파일이 철회하는 것
--
-- 앞선 20260910110000_post_cover_path_rotation.sql("경로 회전")은
-- **철회한다**. 그 파일은 저장소에서 지웠고, 이미 적용했다면 이
-- migration이 rotate_own_post_cover()를 지운다. 회전은
-- "public 버킷은 어차피 아무나 받을 수 있으니 전환 시점에 주소를
-- 갈아치우자"는 우회였고, 다음 두 가지를 보장하지 못했다:
--
--   1) 회전(복사→등록→삭제)의 마지막 단계가 실패하면 예전 주소가
--      그대로 살아 있다. 즉 **정리 실패 = 접근 허용**이었다.
--   2) 회전을 부르는 곳이 글 저장 경로 하나뿐이라, 그 경로를 거치지
--      않고 공개 범위가 바뀌면 아무 일도 일어나지 않는다.
--
-- ★ 대신 하는 것 — 파일 자체에 권한을 건다
--
--   * 버킷 'post-covers'를 **비공개**로 바꾼다. 이제 이 버킷의
--     /object/public/ 주소는 존재하지 않는다(404). RLS를 통째로
--     우회하던 경로 자체가 사라진다.
--   * 그 버킷의 객체 SELECT 정책이 **요청 시점의 글 공개 상태와
--     요청자**를 직접 본다(post_cover_object_is_readable).
--   * 화면은 파일 주소를 아예 받지 않는다. post_covers.public_url
--     컬럼을 지우고, 대신 글 id로 우리 도메인의 프록시를 부른다
--     (/api/post-cover?post=<id> — functions/api/post-cover.js).
--     그 프록시는 anon 키만 들고 있고, 아래 두 함수와 위 정책이
--     허락한 바이트만 흘려보낸다.
--
-- 그래서 공개 범위가 바뀌면 **파일을 하나도 건드리지 않아도** 그
-- 순간부터 접근이 끊긴다. 정리 실패는 이제 "고아 파일이 남는다"는
-- 저장공간 문제일 뿐 접근 경계와 무관하다.
--
-- 이미 내려받은 사본(브라우저 캐시, 저장된 파일)의 회수는 여전히
-- 범위 밖이다 — 어떤 방식으로도 불가능하다.
--
-- ★ 카테고리 비밀글 지정 이미지도 같은 버킷에 있다
--
-- categories.secret_cover_path가 가리키는 파일은 **의도적으로 모두에게
-- 보이는 대체 이미지**다(실제 대표 이미지가 아니다). 버킷이 비공개가
-- 됐으므로 이 파일도 같은 프록시로 나간다
-- (/api/post-cover?category=<id>). 그래서 https 주소를 담고 있던
-- categories.secret_cover_url 컬럼도 함께 지운다 — 이제 저장소 어디에도
-- 이 버킷의 공개 주소가 남지 않는다.
--
-- 아바타(user-avatars)·배너·스킨 이미지(skin-images) 버킷은 이
-- migration이 건드리지 않는다.
--
-- 전체가 하나의 트랜잭션이고 그대로 재실행해도 안전하다.
-- =========================================================

begin;


-- =========================================================
-- 1) 버킷을 비공개로
--
-- public=false면 /storage/v1/object/public/post-covers/... 는
-- 인증과 무관하게 404가 되고, /storage/v1/object/post-covers/... 는
-- storage.objects의 RLS를 그대로 탄다.
-- =========================================================

update storage.buckets
   set public = false
 where id = 'post-covers';


-- =========================================================
-- 2) 철회 — 경로 회전
-- =========================================================

drop function if exists public.rotate_own_post_cover(bigint, text, text);


-- =========================================================
-- 3) 공개 주소 컬럼 제거
--
-- public_url은 "이 파일의 아무나 받을 수 있는 주소"였다. 그런 주소가
-- 더 이상 존재하지 않으므로 컬럼도 지운다 — 남겨두면 언젠가 다시
-- 화면으로 새어나간다. 화면이 필요로 하는 것은 "이 글에 대표 이미지가
-- 있는가" 하나이고, 그건 행의 존재로 알 수 있다.
--
-- upsert RPC는 인자가 하나 줄어드므로 (같은 이름의 옛 시그니처가
-- 남지 않도록) 먼저 지우고 다시 만든다.
-- =========================================================

drop function if exists public.upsert_own_post_cover(bigint, text, text, text, integer);

alter table public.post_covers
  drop column if exists public_url;


alter table public.categories
  drop constraint if exists categories_secret_cover_url_check;

alter table public.categories
  drop column if exists secret_cover_url;


-- SELECT GRANT은 컬럼이 사라지면서 함께 정리된다. 남은 컬럼만 다시
-- 명시한다(storage_path와 user_id는 여전히 제외 — 화면은 경로를
-- 알 필요가 없고, 정리용 경로는 get_own_post_cover_paths()가 준다).

grant select (
  post_id,
  mime_type,
  byte_size,
  updated_at
) on public.post_covers to anon, authenticated;


comment on table public.post_covers is
  'GALLERY-1: 글의 대표 이미지(썸네일). posts가 아니라 별도 테이블인 이유는 "비밀글의 대표 이미지가 방문자에게 가면 안 된다"를 RLS(행 단위)로 강제하기 위해서다 — posts의 컬럼이면 행은 보이는데 컬럼만 가리는 것을 DB가 표현할 수 없다. post_contents가 본문을 분리한 것과 같은 구조. ★ 파일 자체는 비공개 버킷에 있고 공개 주소가 없다: 바이트는 /api/post-cover 프록시로만 나가며, 그 프록시가 부르는 get_post_cover_object()와 storage.objects 정책이 요청 시점의 글 공개 상태와 요청자를 매번 확인한다(IMORY_GALLERY1_DESIGN.md §3-5).';


-- =========================================================
-- 4) 읽기 판정 — 한 곳에서만 정의한다
--
-- storage.objects의 정책과 아래 조회 함수가 **같은 술어**를 쓴다.
-- 정책 본문에서 post_covers를 직접 읽을 수 없어(anon에게는
-- storage_path 컬럼 권한이 없다) SECURITY DEFINER 함수로 감싼다.
--
-- 참이 되는 경우는 둘뿐이다:
--   * 그 파일이 어떤 글의 대표 이미지이고, 그 글이 지금 public이거나
--     내 글이다.
--   * 그 파일이 어떤 카테고리의 비밀글 지정 이미지다(대체 이미지라
--     처음부터 모두에게 보이는 값이다).
--
-- 글이 지워졌거나(행 cascade) 대표 이미지에서 밀려난 파일은 어느
-- 쪽에도 걸리지 않는다 — 파일이 남아 있어도 접근은 끊긴다.
-- =========================================================

create or replace function public.post_cover_object_is_readable(
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    exists (
      select 1
        from public.post_covers c
        join public.posts p
          on p.id = c.post_id
       where c.storage_path = p_name
         and (
           p.visibility = 'public'
           or p.user_id = auth.uid()
         )
    )
    or exists (
      select 1
        from public.categories cat
       where cat.secret_cover_path = p_name
    )
$fn$;


comment on function public.post_cover_object_is_readable(text) is
  'GALLERY-1 후속: post-covers 버킷의 객체 하나를 지금 이 요청자가 받아도 되는가. storage.objects의 SELECT 정책이 부른다. anon에게 post_covers.storage_path 컬럼 권한이 없어 정책 본문에서 직접 조회할 수 없으므로 SECURITY DEFINER로 감쌌다.';


revoke all on function public.post_cover_object_is_readable(text) from public;

grant execute on function public.post_cover_object_is_readable(text) to anon, authenticated;


-- =========================================================
-- 5) storage 정책 교체
--
-- 기존 post_covers_public_object_read("이 버킷이면 무조건 읽기")를
-- 지우고 위 판정을 건다. 소유자 쓰기 정책(post_covers_owner_write)은
-- 그대로 둔다 — for all이라 소유자는 자기 폴더의 파일을 계속
-- 읽고/올리고/지울 수 있다(업로드 정리에 필요하다).
-- =========================================================

drop policy if exists post_covers_public_object_read on storage.objects;

drop policy if exists post_covers_gated_object_read on storage.objects;

create policy post_covers_gated_object_read
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'post-covers'
  and public.post_cover_object_is_readable(name)
);


-- =========================================================
-- 6) 프록시가 부르는 조회 함수 두 개
--
-- 프록시(functions/api/post-cover.js)는 **anon 키 + (있다면) 요청자
-- 본인의 토큰**만 들고 Supabase에 그대로 전달한다. Service Role 키를
-- 쓰지 않는다 — 그래서 프록시에 결함이 있어도 anon이 볼 수 없는
-- 바이트는 나갈 수 없다. 판정은 전부 여기(DB)에서 한다.
--
-- 반환은 0행 또는 1행이다. 0행이면 프록시가 404를 준다 —
-- "권한 없음"과 "없는 글"을 구분해 알려주지 않는다(비밀글의 존재
-- 자체를 응답으로 알려주지 않기 위해서다).
-- =========================================================

create or replace function public.get_post_cover_object(
  p_post_id bigint
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
  select c.storage_path, c.mime_type
    from public.post_covers c
    join public.posts p
      on p.id = c.post_id
   where c.post_id = p_post_id
     and (
       p.visibility = 'public'
       or p.user_id = auth.uid()
     )
$fn$;


comment on function public.get_post_cover_object(bigint) is
  'GALLERY-1 후속: /api/post-cover?post=<id> 프록시가 부른다. 지금 이 요청자가 이 글의 대표 이미지를 받아도 되는지 판정하고, 되면 버킷 안 경로와 mime을 준다. 판정은 요청 시점의 posts.visibility로 하므로 공개 범위를 바꾸는 순간 파일을 건드리지 않아도 접근이 끊긴다.';


revoke all on function public.get_post_cover_object(bigint) from public;

grant execute on function public.get_post_cover_object(bigint) to anon, authenticated;


create or replace function public.get_category_cover_object(
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
  select cat.secret_cover_path, null::text
    from public.categories cat
   where cat.id = p_category_id
     and cat.secret_cover_path is not null
$fn$;


comment on function public.get_category_cover_object(bigint) is
  'GALLERY-1 후속: /api/post-cover?category=<id> 프록시가 부른다. 카테고리의 비밀글 지정 이미지는 대체 이미지라 모두에게 보인다 — 판정 없이 경로만 준다. mime은 저장하지 않으므로 null이고 프록시가 확장자로 정한다.';


revoke all on function public.get_category_cover_object(bigint) from public;

grant execute on function public.get_category_cover_object(bigint) to anon, authenticated;


-- =========================================================
-- 7) 소유자용 경로 조회 (철회된 migration에 있던 것을 여기로 옮김)
--
-- 회전은 사라졌지만 **글 삭제 시 파일 정리**는 남는다. 글이 지워지면
-- post_covers 행은 cascade로 사라지고 접근도 그 순간 끊기지만
-- (4번의 판정에 걸리지 않는다), Storage 객체는 남아 용량을 차지한다.
-- 삭제 화면들은 지우기 전에 이 함수로 경로를 받아 두고 삭제가 성공한
-- 뒤에 파일을 지운다. 이제 이 정리가 실패해도 보안 문제가 아니다.
-- =========================================================

create or replace function public.get_own_post_cover_paths(
  p_post_ids bigint[]
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.storage_path
    from public.post_covers c
   where c.user_id = auth.uid()
     and c.post_id = any (p_post_ids)
$fn$;


comment on function public.get_own_post_cover_paths(bigint[]) is
  'GALLERY-1 후속: 내 글들의 대표 이미지 storage_path. 글 삭제 시 Storage 객체 정리에만 쓴다(접근 차단은 이미 DB 판정이 하고 있으므로 이 정리는 용량 문제일 뿐이다). 남의 글 id는 오류가 아니라 결과에서 빠진다 — 여러 글을 한 번에 지울 때 하나 때문에 전체가 실패하면 곤란하다.';


revoke all on function public.get_own_post_cover_paths(bigint[]) from public, anon;

grant execute on function public.get_own_post_cover_paths(bigint[]) to authenticated;


-- =========================================================
-- 8) 쓰기 RPC — public_url 없는 시그니처로 다시
--
-- 본문은 3)에서 지운 컬럼만 빠졌고 나머지는 선행 migration 그대로다.
-- 반환값 계약(밀려난 이전 storage_path)도 같다 — 호출자는 저장이
-- 전부 성공한 뒤에야 그 파일을 지운다.
-- =========================================================

create or replace function public.upsert_own_post_cover(
  p_post_id      bigint,
  p_storage_path text,
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
    post_id, user_id, storage_path, mime_type, byte_size
  )
  values (
    p_post_id, auth.uid(), p_storage_path, p_mime_type, p_byte_size
  )
  on conflict (post_id) do update
     set storage_path = excluded.storage_path,
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


revoke all on function public.upsert_own_post_cover(bigint, text, text, integer) from public, anon;

grant execute on function public.upsert_own_post_cover(bigint, text, text, integer) to authenticated;


commit;
