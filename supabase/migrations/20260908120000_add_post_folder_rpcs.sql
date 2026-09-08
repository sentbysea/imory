-- =========================================================
-- FOLDER-1 (3/3) — 폴더 CRUD / 이동 RPC
--
-- 왜 RLS + 컬럼 GRANT만으로 클라이언트가 직접 쓰게 하지 않는가:
--
--   폴더 기능의 불변식은 전부 "여러 행에 걸친 세트 동작"이다.
--     · 폴더 삭제 = 자식 승격 + 자리 물려주기 + 행 삭제
--     · 이동 = 컨테이너 이동 + 이웃 사이 자리 계산 + (필요시) rebalance
--     · depth 3 제한 / cycle 금지 = 조상 체인 전체를 봐야 하는 검사
--   RLS는 "누가 어떤 행에 접근 가능한가"만 강제하고 원자성도,
--   구조 불변식도 보장하지 않는다. 중간 실패가 트리를 망가뜨리지
--   않도록 이 동작들을 DB 함수 하나의 트랜잭션 안에 가둔다
--   ([[20260905100000_add_skin_draft_write_rpcs.sql]]와 동일한 판단).
--
-- 공통 보안 원칙(저장소 관례 그대로):
--   · SECURITY DEFINER + SET search_path = ''(모든 참조를 스키마 한정)
--   · SECURITY DEFINER는 RLS를 우회하므로 함수 본문에서 auth.uid()로
--     소유권을 반드시 다시 확인한다
--   · PUBLIC/anon EXECUTE는 명시적으로 revoke, authenticated에만 grant
--     (전부 소유자 전용 동작 — 방문자가 부를 이유가 없다)
--
-- 정렬 계약: sort_order는 "같은 컨테이너 안의 순서"이고 폴더와 글이
-- 정렬 공간을 공유한다. 컨테이너 키는 폴더 기준
-- (user_id, category_id, parent_id), 글 기준 (user_id, category_id, folder_id).
-- gap 100으로 두고, 이웃 사이에 자리가 없을 때만 **그 컨테이너 하나만**
-- 다시 매긴다 — 카테고리 전체 행을 매번 다시 쓰지 않는다.
-- =========================================================


-- =========================================================
-- 0) 내부 헬퍼 — 컨테이너 하나를 gap 간격으로 다시 매긴다
--
-- 폴더와 글이 한 정렬 공간을 공유하므로 두 테이블을 함께 세워
-- 순위를 매긴 뒤 각각 갱신해야 한다. 임시 테이블에 순위를 먼저
-- 굳히는 이유: 첫 UPDATE가 sort_order를 바꾸고 나면 두 번째
-- 문장이 다시 계산한 순위는 이미 오염돼 있다.
--
-- authenticated에게 EXECUTE를 주지 않는다(내부 전용). 아래 RPC들이
-- SECURITY DEFINER 안에서 부르므로 소유자 권한으로 실행된다.
-- =========================================================

create or replace function public.post_container_rebalance(
  p_user_id     uuid,
  p_category_id bigint,
  p_folder_id   bigint,
  p_gap         integer default 100
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_gap integer := greatest(coalesce(p_gap, 100), 1);
begin

  drop table if exists pg_temp.imory_container_order;

  create temp table imory_container_order on commit drop as
  with container as (

    select
      'folder'::text as kind,
      f.id           as id,
      f.sort_order   as sort_order
    from public.post_folders f
    where f.user_id = p_user_id
      and f.category_id = p_category_id
      and f.parent_id is not distinct from p_folder_id

    union all

    select
      'post'::text,
      p.id,
      p.sort_order
    from public.posts p
    where p.user_id = p_user_id
      and p.category_id is not distinct from p_category_id
      and p.folder_id is not distinct from p_folder_id

  )
  select
    container.kind,
    container.id,
    (
      row_number() over (
        order by container.sort_order, container.kind, container.id
      ) * v_gap
    )::integer as new_order
  from container;


  update public.post_folders f
     set sort_order = c.new_order
    from pg_temp.imory_container_order c
   where c.kind = 'folder'
     and c.id = f.id
     and f.sort_order is distinct from c.new_order;


  update public.posts p
     set sort_order = c.new_order
    from pg_temp.imory_container_order c
   where c.kind = 'post'
     and c.id = p.id
     and p.sort_order is distinct from c.new_order;


  drop table pg_temp.imory_container_order;

end;
$fn$;


revoke execute on function
  public.post_container_rebalance(uuid, bigint, bigint, integer)
from public;


-- =========================================================
-- 1) create_post_folder(category_id, parent_id, name) -> folder id
--
-- 새 폴더는 컨테이너의 **맨 끝**에 붙는다. 글(신규 작성 시 맨 위,
-- 2/3 migration)과 방향이 다른데, 폴더는 사용자가 관리 화면에서
-- 직접 만들면서 결과를 바로 보기 때문이다 — 목록 맨 위로 끼어들어
-- 기존 순서를 밀어내는 쪽이 오히려 놀랍다.
-- =========================================================

create or replace function public.create_post_folder(
  p_category_id bigint,
  p_parent_id   bigint default null,
  p_name        text default '새 폴더'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user          uuid := auth.uid();
  v_category      public.categories%rowtype;
  v_parent        public.post_folders%rowtype;
  v_max_folders   integer;
  v_max_posts     integer;
  v_new_id        bigint;
begin

  if v_user is null then
    raise exception 'create_post_folder: authentication required'
      using errcode = '42501';
  end if;


  select * into v_category
    from public.categories
   where id = p_category_id;

  if not found then
    raise exception 'create_post_folder: category % not found', p_category_id
      using errcode = '23503';
  end if;

  if v_category.user_id <> v_user then
    raise exception 'create_post_folder: category % belongs to another user', p_category_id
      using errcode = '42501';
  end if;

  /*
    배너 카테고리에는 글이 없으므로 폴더도 없다
    (posts-view-list.js가 banner 분기에서 posts 조회 자체를 건너뛴다).
  */
  if coalesce(v_category.type, 'post') <> 'post' then
    raise exception 'create_post_folder: category % is not a post category', p_category_id
      using errcode = '23514';
  end if;


  if p_parent_id is not null then

    select * into v_parent
      from public.post_folders
     where id = p_parent_id;

    if not found then
      raise exception 'create_post_folder: parent folder % not found', p_parent_id
        using errcode = '23503';
    end if;

    if v_parent.user_id <> v_user then
      raise exception 'create_post_folder: parent folder % belongs to another user', p_parent_id
        using errcode = '42501';
    end if;

    if v_parent.category_id <> p_category_id then
      raise exception 'create_post_folder: parent folder % belongs to another category', p_parent_id
        using errcode = '23514';
    end if;

    /*
      트리거의 depth CHECK가 최종 방어선이지만, 여기서 먼저 막아야
      사용자에게 "3단계까지만 만들 수 있다"는 뜻이 전달된다.
    */
    if v_parent.depth >= 3 then
      raise exception 'create_post_folder: maximum folder depth (3) reached under folder %', p_parent_id
        using errcode = '23514';
    end if;

  end if;


  select max(f.sort_order) into v_max_folders
    from public.post_folders f
   where f.user_id = v_user
     and f.category_id = p_category_id
     and f.parent_id is not distinct from p_parent_id;

  select max(p.sort_order) into v_max_posts
    from public.posts p
   where p.user_id = v_user
     and p.category_id is not distinct from p_category_id
     and p.folder_id is not distinct from p_parent_id;


  insert into public.post_folders (
    user_id,
    category_id,
    parent_id,
    name,
    sort_order
  )
  values (
    v_user,
    p_category_id,
    p_parent_id,
    p_name,
    greatest(coalesce(v_max_folders, 0), coalesce(v_max_posts, 0)) + 100
  )
  returning id into v_new_id;


  return v_new_id;

end;
$fn$;


-- =========================================================
-- 2) rename_post_folder(folder_id, name)
-- =========================================================

create or replace function public.rename_post_folder(
  p_folder_id bigint,
  p_name      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_folder public.post_folders%rowtype;
begin

  if v_user is null then
    raise exception 'rename_post_folder: authentication required'
      using errcode = '42501';
  end if;


  select * into v_folder
    from public.post_folders
   where id = p_folder_id;

  if not found then
    raise exception 'rename_post_folder: folder % not found', p_folder_id
      using errcode = '23503';
  end if;

  if v_folder.user_id <> v_user then
    raise exception 'rename_post_folder: folder % belongs to another user', p_folder_id
      using errcode = '42501';
  end if;


  update public.post_folders
     set name = p_name
   where id = p_folder_id;

end;
$fn$;


-- =========================================================
-- 3) delete_post_folder(folder_id)
--
-- 폴더만 사라지고 안에 있던 것은 하나도 사라지지 않는다.
-- 직속 자식(폴더 + 글)은 **삭제된 폴더가 있던 자리**를 그대로
-- 물려받는다 — 부모 컨테이너의 맨 끝으로 밀려나지 않는다.
--
--   A                       A
--   Sentinel        =>      Post 1
--     Post 1                Folder B
--     Folder B              C
--   C
--
-- 자리 물려주기 방법: 부모 컨테이너를 (자식 수 + 1) * 1000 간격으로
-- 한 번 다시 매긴 뒤, 삭제 대상이 있던 값 V와 다음 형제 사이의
-- 빈 구간에 자식들을 V + 1000, V + 2000 ... 으로 끼워 넣는다.
-- 간격을 자식 수에 맞춰 잡았으므로 자리가 모자랄 수 없다. 마지막에
-- 100 간격으로 한 번 더 정리한다.
--
-- 전부 한 함수 = 한 트랜잭션이라, 중간에 실패하면 폴더도 그대로
-- 남고 자식도 그대로 남는다("승격은 됐는데 삭제가 안 된" 중간
-- 상태가 생기지 않는다).
-- =========================================================

create or replace function public.delete_post_folder(
  p_folder_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user        uuid := auth.uid();
  v_folder      public.post_folders%rowtype;
  v_child_count integer;
  v_slot        integer;
begin

  if v_user is null then
    raise exception 'delete_post_folder: authentication required'
      using errcode = '42501';
  end if;


  select * into v_folder
    from public.post_folders
   where id = p_folder_id;

  if not found then
    raise exception 'delete_post_folder: folder % not found', p_folder_id
      using errcode = '23503';
  end if;

  if v_folder.user_id <> v_user then
    raise exception 'delete_post_folder: folder % belongs to another user', p_folder_id
      using errcode = '42501';
  end if;


  select
    (select count(*) from public.post_folders f where f.parent_id = p_folder_id)
    +
    (select count(*) from public.posts p where p.folder_id = p_folder_id)
  into v_child_count;


  /*
    부모 컨테이너에 자식들이 들어갈 빈 구간을 확보한다.
    간격 = (자식 수 + 1) * 1000 이면 V와 다음 형제 사이에
    자식 수만큼의 1000 단위 자리가 반드시 남는다.
  */

  perform public.post_container_rebalance(
    v_user,
    v_folder.category_id,
    v_folder.parent_id,
    1000 * (v_child_count + 1)
  );


  select f.sort_order into v_slot
    from public.post_folders f
   where f.id = p_folder_id;


  drop table if exists pg_temp.imory_promote_order;

  create temp table imory_promote_order on commit drop as
  with children as (

    select
      'folder'::text as kind,
      f.id           as id,
      f.sort_order   as sort_order
    from public.post_folders f
    where f.parent_id = p_folder_id

    union all

    select
      'post'::text,
      p.id,
      p.sort_order
    from public.posts p
    where p.folder_id = p_folder_id

  )
  select
    children.kind,
    children.id,
    (
      v_slot
      + row_number() over (
          order by children.sort_order, children.kind, children.id
        ) * 1000
    )::integer as new_order
  from children;


  /*
    폴더 자식은 한 단계 위로 올라가므로 depth가 줄어든다 —
    BEFORE 트리거가 depth를 다시 계산하고, AFTER 트리거가 그
    자손들의 depth까지 연쇄로 맞춘다. 깊어지는 방향이 아니라서
    3단계 제한에 걸릴 수 없다.
  */

  update public.post_folders f
     set parent_id  = v_folder.parent_id,
         sort_order = c.new_order
    from pg_temp.imory_promote_order c
   where c.kind = 'folder'
     and c.id = f.id;


  update public.posts p
     set folder_id  = v_folder.parent_id,
         sort_order = c.new_order
    from pg_temp.imory_promote_order c
   where c.kind = 'post'
     and c.id = p.id;


  drop table pg_temp.imory_promote_order;


  /*
    이제 자식이 하나도 남지 않았으므로 parent_id의 on delete
    restrict에 걸리지 않는다. 아직 남아 있다면(동시 수정 등)
    여기서 예외가 나고 트랜잭션 전체가 롤백된다 — 조용히 자식을
    잃는 경로가 없다.
  */

  delete from public.post_folders
   where id = p_folder_id;


  perform public.post_container_rebalance(
    v_user,
    v_folder.category_id,
    v_folder.parent_id,
    100
  );

end;
$fn$;


-- =========================================================
-- 4) move_tree_node(...) -> 이동 후 그 컨테이너의 최종 순서(jsonb)
--
-- 폴더 이동과 글 이동을 하나의 함수로 처리한다. 두 종류가 같은
-- 정렬 공간을 공유하므로 "글을 폴더와 폴더 사이에 놓는" 이동에서
-- 이웃이 어느 종류인지 미리 알 수 없기 때문이다.
--
-- 자리 계산을 클라이언트가 아니라 **서버가** 한다: 클라이언트는
-- "무엇을, 어디로, 누구와 누구 사이에"만 보내고 sort_order 숫자는
-- 보내지 않는다. 그래서 두 기기에서 동시에 끌어도 서로의 숫자를
-- 덮어쓰지 않는다.
--
-- 반환값은 이동 후 대상 컨테이너의 최종 순서다 — 프론트가 낙관적
-- 으로 그린 화면을 서버 확정값으로 다시 맞출 수 있게 한다.
--
-- p_prev_* 가 null이면 컨테이너의 맨 앞, p_next_* 가 null이면 맨 뒤.
-- =========================================================

create or replace function public.move_tree_node(
  p_node_type        text,
  p_node_id          bigint,
  p_target_folder_id bigint default null,
  p_prev_type        text default null,
  p_prev_id          bigint default null,
  p_next_type        text default null,
  p_next_id          bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user        uuid := auth.uid();
  v_category_id bigint;
  v_target      public.post_folders%rowtype;
  v_node_depth  smallint;
  v_subtree_max smallint;
  v_is_cycle    boolean;
  v_prev_order  integer;
  v_next_order  integer;
  v_new_order   integer;
  v_result      jsonb;
begin

  if v_user is null then
    raise exception 'move_tree_node: authentication required'
      using errcode = '42501';
  end if;

  if p_node_type not in ('folder', 'post') then
    raise exception 'move_tree_node: unknown node type %', p_node_type
      using errcode = '22023';
  end if;


  /* ---- 이동 대상 확인 + 소유권 ---- */

  if p_node_type = 'folder' then

    select f.category_id, f.depth
      into v_category_id, v_node_depth
      from public.post_folders f
     where f.id = p_node_id
       and f.user_id = v_user;

  else

    select p.category_id
      into v_category_id
      from public.posts p
     where p.id = p_node_id
       and p.user_id = v_user;

  end if;

  if v_category_id is null then
    raise exception 'move_tree_node: % % not found for this user', p_node_type, p_node_id
      using errcode = '42501';
  end if;


  /* ---- 대상 컨테이너 확인 ---- */

  if p_target_folder_id is not null then

    select * into v_target
      from public.post_folders
     where id = p_target_folder_id;

    if not found then
      raise exception 'move_tree_node: target folder % not found', p_target_folder_id
        using errcode = '23503';
    end if;

    if v_target.user_id <> v_user then
      raise exception 'move_tree_node: target folder % belongs to another user', p_target_folder_id
        using errcode = '42501';
    end if;

    if v_target.category_id <> v_category_id then
      raise exception 'move_tree_node: target folder % belongs to another category', p_target_folder_id
        using errcode = '23514';
    end if;

  end if;


  /* ---- 폴더 이동에만 필요한 추가 검사 ----

     트리거가 최종적으로 전부 막지만(depth CHECK + cycle 검사),
     여기서 먼저 걸러야 사용자에게 이유를 설명할 수 있다.
  */

  if p_node_type = 'folder' and p_target_folder_id is not null then

    if p_target_folder_id = p_node_id then
      raise exception 'move_tree_node: cannot move folder % into itself', p_node_id
        using errcode = '23514';
    end if;

    v_is_cycle := exists (

      with recursive descendants as (

        select f.id
          from public.post_folders f
         where f.id = p_node_id

        union all

        select f.id
          from public.post_folders f
          join descendants d on f.parent_id = d.id

      )
      select 1 from descendants where descendants.id = p_target_folder_id

    );

    if v_is_cycle then
      raise exception 'move_tree_node: cannot move folder % into its own descendant', p_node_id
        using errcode = '23514';
    end if;


    /*
      서브트리를 통째로 옮기면 그 안의 가장 깊은 폴더가 새 위치
      에서도 3단계를 넘지 않아야 한다.
    */

    v_subtree_max := (

      with recursive subtree as (

        select f.id, f.depth
          from public.post_folders f
         where f.id = p_node_id

        union all

        select f.id, f.depth
          from public.post_folders f
          join subtree s on f.parent_id = s.id

      )
      select max(subtree.depth) from subtree

    );

    if (v_target.depth + 1) + (v_subtree_max - v_node_depth) > 3 then
      raise exception 'move_tree_node: moving folder % here would exceed maximum depth 3', p_node_id
        using errcode = '23514';
    end if;

  end if;


  /* ---- 이웃의 자리 읽기 ---- */

  if p_prev_id is not null then
    v_prev_order := public.post_node_sort_order(p_prev_type, p_prev_id);
  end if;

  if p_next_id is not null then
    v_next_order := public.post_node_sort_order(p_next_type, p_next_id);
  end if;


  /* ---- 새 자리 계산 ----

     이웃 사이가 1칸 이하로 좁아졌을 때만 그 컨테이너 하나를
     100 간격으로 다시 매기고 이웃 값을 다시 읽는다.
  */

  if v_prev_order is not null
     and v_next_order is not null
     and (v_next_order - v_prev_order) < 2 then

    perform public.post_container_rebalance(
      v_user, v_category_id, p_target_folder_id, 100
    );

    v_prev_order := public.post_node_sort_order(p_prev_type, p_prev_id);
    v_next_order := public.post_node_sort_order(p_next_type, p_next_id);

  end if;


  v_new_order :=
    case
      when v_prev_order is null and v_next_order is null then 100
      when v_prev_order is null then v_next_order - 100
      when v_next_order is null then v_prev_order + 100
      else (v_prev_order + v_next_order) / 2
    end;


  /* ---- 실제 이동 ---- */

  if p_node_type = 'folder' then

    update public.post_folders
       set parent_id  = p_target_folder_id,
           sort_order = v_new_order
     where id = p_node_id;

  else

    update public.posts
       set folder_id  = p_target_folder_id,
           sort_order = v_new_order
     where id = p_node_id;

  end if;


  /* ---- 이동 후 컨테이너의 최종 순서 ---- */

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind', container_rows.kind,
        'id',   container_rows.id::text
      )
      order by container_rows.sort_order, container_rows.kind, container_rows.id
    ),
    '[]'::jsonb
  )
  into v_result
  from (

    select 'folder'::text as kind, f.id, f.sort_order
      from public.post_folders f
     where f.user_id = v_user
       and f.category_id = v_category_id
       and f.parent_id is not distinct from p_target_folder_id

    union all

    select 'post'::text, p.id, p.sort_order
      from public.posts p
     where p.user_id = v_user
       and p.category_id is not distinct from v_category_id
       and p.folder_id is not distinct from p_target_folder_id

  ) container_rows;


  return v_result;

end;
$fn$;


-- =========================================================
-- 내부 헬퍼 — (종류, id)의 현재 sort_order
--
-- move_tree_node()가 이웃 자리를 읽을 때만 쓴다. 소유권 검사는
-- 호출자가 이미 했고, 이 함수는 값만 돌려준다.
-- =========================================================

create or replace function public.post_node_sort_order(
  p_node_type text,
  p_node_id   bigint
)
returns integer
language sql
security definer
set search_path = ''
stable
as $fn$
  select case
    when p_node_type = 'folder' then
      (select f.sort_order from public.post_folders f where f.id = p_node_id)
    when p_node_type = 'post' then
      (select p.sort_order from public.posts p where p.id = p_node_id)
    else null
  end;
$fn$;


revoke execute on function
  public.post_node_sort_order(text, bigint)
from public;


-- =========================================================
-- 5) EXECUTE 권한
--
-- 전부 소유자 전용 동작이므로 anon에게는 주지 않는다
-- (get_published_skin()처럼 "의도적으로 공개"인 함수가 아니다).
-- =========================================================

revoke execute on function
  public.create_post_folder(bigint, bigint, text),
  public.rename_post_folder(bigint, text),
  public.delete_post_folder(bigint),
  public.move_tree_node(text, bigint, bigint, text, bigint, text, bigint)
from public;


grant execute on function
  public.create_post_folder(bigint, bigint, text),
  public.rename_post_folder(bigint, text),
  public.delete_post_folder(bigint),
  public.move_tree_node(text, bigint, bigint, text, bigint, text, bigint)
to authenticated;


grant execute on function
  public.create_post_folder(bigint, bigint, text),
  public.rename_post_folder(bigint, text),
  public.delete_post_folder(bigint),
  public.move_tree_node(text, bigint, bigint, text, bigint, text, bigint),
  public.post_container_rebalance(uuid, bigint, bigint, integer),
  public.post_node_sort_order(text, bigint)
to service_role;
