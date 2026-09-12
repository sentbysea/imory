-- =========================================================
-- POST BODY IMAGES — 사진을 본문에서 떼어낸다
--
-- 기준 문서: IMORY_POST_BODY_IMAGE_DESIGN.md
-- 앞 migration: 20260911120000_gallery_content.sql
--
-- ★ 이 migration이 고치는 것 하나
--
-- save_own_gallery_images()가 사진 행을 저장하면서 **본문 전체를
-- 자동 생성해 post_contents에 덮어썼다**:
--
--     insert into public.post_contents(post_id, content)
--       select p_post_id, string_agg('<p><img ...></p>', ...)
--       ... on conflict (post_id) do update set content = excluded.content;
--
-- 갤러리 글이 사진만 담던 동안에는 그 자동 본문이 곧 본문이었다.
-- 이제 post와 gallery가 **같은 본문 에디터**를 쓰고 사용자가 사진
-- 사이에 글을 쓰므로, 이 한 줄이 저장할 때마다 그 글을 지운다.
-- 본문은 이제 클라이언트가 upsert_own_post_content로 저장한다
-- (posts/editor/posts-save.js).
--
-- ★ 바꾸지 않는 것
--
-- 테이블(post_gallery_images), RLS/GRANT, 대표 사진 unique 인덱스,
-- 소유권 검사, storage_path 검증, 고아 경로 반환, 나머지 RPC 전부
-- 그대로다. 이름도 그대로 둔다 — 이 함수는 이제 gallery 전용이
-- 아니라 "글 본문 사진"을 다루지만, 이름을 바꾸면 배포 중간 상태에서
-- 옛 클라이언트가 없는 함수를 부른다.
--
-- ★ 기존 데이터
--
-- 이미 저장된 갤러리 글의 본문(content_type='html'에 담긴 자동 생성
-- HTML)은 손대지 않는다. 사진 행도 파일도 그대로다. 그 글을 다시
-- 열면 에디터가 그 모양을 알아보고 공통 리치텍스트 편집으로 연다
-- (posts/view/posts-view-editor-load.js의
--  isLegacyGeneratedGalleryBody) — 데이터를 고치는 대신 **여는
-- 방식**만 바꾸므로, 되돌릴 일이 생겨도 원본이 남아 있다.
--
-- post_covers도 그대로다. COVER 업로드 UI는 사라졌지만 행과 파일은
-- 남고, 본문에 사진이 없는 글의 썸네일로 계속 쓰인다.
-- =========================================================
begin;

-- 사진 행만 교체한다. 본문은 호출자가 같은 저장 순서 안에서
-- upsert_own_post_content로 따로 저장한다 — 사진이 먼저이므로,
-- 뒤이어 저장되는 본문이 가리키는 사진은 전부 실재한다.
create or replace function public.save_own_gallery_images(p_post_id bigint, p_images jsonb)
returns setof text language plpgsql security definer set search_path = '' as $fn$
declare old_paths text[]; image record;
begin
  perform 1 from public.posts p where p.id = p_post_id and p.user_id = auth.uid() for update;
  if not found then raise exception 'Post ownership required' using errcode = '42501'; end if;
  if jsonb_typeof(p_images) <> 'array' or p_images is null then
    raise exception 'Expected image array';
  end if;
  for image in select * from jsonb_to_recordset(p_images)
    as x(id uuid, storage_path text, mime_type text, byte_size integer, position integer, is_primary boolean)
  loop
    if split_part(image.storage_path, '/', 1) is distinct from auth.uid()::text
      or not exists (select 1 from storage.objects o where o.bucket_id = 'post-covers' and o.name = image.storage_path)
      or exists (select 1 from public.post_gallery_images g where g.id = image.id and g.post_id <> p_post_id)
    then raise exception 'Invalid gallery object' using errcode = '42501'; end if;
  end loop;
  select array_agg(storage_path) into old_paths from public.post_gallery_images where post_id = p_post_id;
  delete from public.post_gallery_images where post_id = p_post_id;
  insert into public.post_gallery_images(id, post_id, storage_path, mime_type, byte_size, position, is_primary)
    select x.id, p_post_id, x.storage_path, x.mime_type, x.byte_size, x.position, coalesce(x.is_primary, false)
    from jsonb_to_recordset(p_images)
      as x(id uuid, storage_path text, mime_type text, byte_size integer, position integer, is_primary boolean);
  -- 돌려주는 것은 "이 글에서 밀려났고, 다른 글의 사진 행도 어떤
  -- post_covers 행도 더 이상 참조하지 않는" 경로뿐이다. 그래서
  -- 호출자가 이것만 지워도 아직 저장된 다른 글이나 예전 COVER가
  -- 깨지지 않는다.
  return query select path from unnest(old_paths) path
    where not exists (select 1 from public.post_gallery_images g where g.storage_path = path)
      and not exists (select 1 from public.post_covers c where c.storage_path = path);
end;
$fn$;
revoke all on function public.save_own_gallery_images(bigint,jsonb) from public, anon;
grant execute on function public.save_own_gallery_images(bigint,jsonb) to authenticated;

comment on table public.post_gallery_images is
  'Photos placed in a post body (post and gallery categories alike). position follows body order; at most one row per post may be is_primary. The body HTML itself lives in post_contents.';

notify pgrst, 'reload schema';
commit;
