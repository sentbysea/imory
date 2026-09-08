-- =========================================================
-- FOLDER-1 (2/3) — posts.folder_id / posts.sort_order
--
-- posts 테이블에 컬럼 두 개만 **추가**한다. 기존 컬럼/제약/RLS
-- 정책은 하나도 건드리지 않는다([[20260908100000_create_post_folders.sql]]
-- 상단의 additive 원칙과 동일).
--
-- 이 파일이 반드시 지켜야 하는 것 두 가지:
--
--   (1) 기존 글의 표시 순서가 migration 전후로 **완전히 동일**해야
--       한다. 현재 CATEGORY 목록은 created_at DESC이므로
--       (posts/view/posts-view-list.js, skin/skin-context.js), 그
--       순서를 그대로 100, 200, 300 ... 으로 굳혀서 sort_order
--       ASC가 오늘과 같은 화면을 만들게 한다. created_at 동률은
--       id DESC로 tie-break해서 backfill이 결정적이게 만든다 —
--       tie-break가 없으면 실행할 때마다 순서가 달라질 수 있다.
--
--   (2) 컬럼 단위 GRANT를 반드시 갱신해야 한다. posts는
--       [[20260902110000_lock_down_posts_secret_password_hash.sql]]로
--       테이블 단위 권한이 회수된 상태라, 새 컬럼을 GRANT에 넣지
--       않으면 목록 조회가 통째로 400/401로 죽는다.
--       ★ SELECT에만 추가하고 INSERT/UPDATE에는 추가하지 않는다 —
--         폴더 이동/순서 변경은 move_tree_node() RPC(3/3)에서만
--         일어나야 하고, 클라이언트가 folder_id를 직접 쓰게 되면
--         depth/cycle/소유권 검증을 통째로 우회할 수 있다.
--       ★ secret_password_hash는 이 파일에서도 절대 SELECT GRANT에
--         등장하지 않는다.
-- =========================================================


-- =========================================================
-- 1) 컬럼 추가
-- =========================================================

alter table public.posts
  add column if not exists folder_id bigint null
    references public.post_folders (id) on delete restrict;

alter table public.posts
  add column if not exists sort_order integer;


comment on column public.posts.folder_id is
  'FOLDER-1: null이면 카테고리 root의 글. 폴더의 category_id와 반드시 일치한다(트리거 강제).';

comment on column public.posts.sort_order is
  'FOLDER-1: 같은 컨테이너(user_id, category_id, folder_id) 안의 순서. post_folders.sort_order와 정렬 공간을 공유한다.';


-- =========================================================
-- 2) 기존 글 backfill — 표시 순서 보존
--
-- 카테고리별로 현재 화면 순서(created_at DESC, id DESC)를 그대로
-- 100 단위 gap으로 굳힌다. 이미 값이 있는 행은 건드리지 않는다
-- (migration 재실행 안전).
-- =========================================================

with ranked as (

  select
    p.id,
    row_number() over (
      partition by p.category_id
      order by p.created_at desc, p.id desc
    ) * 100 as new_sort_order
  from public.posts p
  where p.sort_order is null

)
update public.posts p
   set sort_order = ranked.new_sort_order
  from ranked
 where ranked.id = p.id;


alter table public.posts
  alter column sort_order set not null;


-- =========================================================
-- 3) 인덱스
-- =========================================================

create index if not exists posts_container_idx
  on public.posts (category_id, folder_id, sort_order);

create index if not exists posts_folder_idx
  on public.posts (folder_id)
  where folder_id is not null;


-- =========================================================
-- 4) 트리거
--
-- 세 가지 일을 한다.
--
--   (a) folder_id 무결성: 다른 사용자의 폴더, 다른 카테고리의
--       폴더를 가리킬 수 없다. move_tree_node()는 SECURITY DEFINER라
--       RLS를 우회하므로 이 트리거가 실제 방어선이다.
--
--   (b) 신규 글의 sort_order 자동 부여: 사용자 결정(D-1)에 따라
--       새 글은 **root 컨테이너의 맨 위**에 온다 —
--       min(sort_order) - 100. 그래야 오늘의 체감(created_at DESC라
--       새 글이 맨 위)이 그대로 유지된다.
--       ★ 이 트리거 덕분에 posts/editor/posts-save.js는 sort_order를
--         전혀 몰라도 된다. INSERT GRANT에도 sort_order가 없으므로
--         클라이언트는 값을 보낼 수조차 없고, NOT NULL 검사는 BEFORE
--         트리거가 끝난 뒤에 일어나므로 여기서 채우면 충분하다.
--
--   (c) 카테고리 이동 시 folder_id 리셋: 글 수정 폼에서 카테고리를
--       바꾸면(posts-save.js EDIT) 그 글이 들어 있던 폴더는 이제
--       다른 카테고리의 폴더가 된다. 그대로 두면 (a)에 걸려 저장이
--       실패하므로, folder_id를 null로 되돌리고 새 카테고리 root의
--       맨 위로 보낸다. 이 처리가 없으면 "폴더에 든 글은 카테고리를
--       바꿀 수 없다"는 회귀가 생긴다.
-- =========================================================

create or replace function public.posts_sync_folder_and_sort_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_folder      public.post_folders%rowtype;
  v_min_posts   integer;
  v_min_folders integer;
begin

  /* ---- (c) 카테고리가 바뀌면 폴더 배치를 놓아준다 ---- */

  if tg_op = 'UPDATE'
     and new.category_id is distinct from old.category_id
     and new.folder_id is not distinct from old.folder_id
     and new.folder_id is not null then

    new.folder_id := null;

    new.sort_order := null;

  end if;


  /* ---- (a) folder_id 무결성 ---- */

  if new.folder_id is not null then

    select * into v_folder
      from public.post_folders
     where id = new.folder_id;


    if not found then

      raise exception 'posts: folder % not found', new.folder_id
        using errcode = '23503';

    end if;


    if v_folder.user_id <> new.user_id then

      raise exception 'posts: folder % belongs to another user', new.folder_id
        using errcode = '42501';

    end if;


    if v_folder.category_id is distinct from new.category_id then

      raise exception 'posts: folder % belongs to another category', new.folder_id
        using errcode = '23514';

    end if;

  end if;


  /* ---- (b) sort_order 자동 부여: root 컨테이너의 맨 위 ----

     root 컨테이너에는 폴더와 글이 섞여 있으므로 두 테이블의
     최솟값을 함께 본다. 컨테이너가 비어 있으면 100에서 시작한다
     (그러면 첫 글은 0이 된다 — 음수도 허용되는 정상 값이다).
  */

  if new.sort_order is null then

    select min(p.sort_order) into v_min_posts
      from public.posts p
     where p.user_id = new.user_id
       and p.category_id is not distinct from new.category_id
       and p.folder_id is not distinct from new.folder_id;

    select min(f.sort_order) into v_min_folders
      from public.post_folders f
     where f.user_id = new.user_id
       and f.category_id is not distinct from new.category_id
       and f.parent_id is not distinct from new.folder_id;

    new.sort_order :=
      least(
        coalesce(v_min_posts, 100),
        coalesce(v_min_folders, 100)
      ) - 100;

  end if;


  return new;

end;
$fn$;


drop trigger if exists posts_sync_folder_and_sort_order_trg on public.posts;

create trigger posts_sync_folder_and_sort_order_trg
  before insert or update on public.posts
  for each row
  execute function public.posts_sync_folder_and_sort_order();


-- =========================================================
-- 5) GRANT — SELECT에만 추가
--
-- 기존 GRANT는 그대로 두고 새 컬럼 두 개만 얹는다. INSERT/UPDATE
-- 목록은 의도적으로 건드리지 않는다(위 상단 주석 참고).
-- =========================================================

grant select (
  folder_id,
  sort_order
) on public.posts to anon, authenticated;
