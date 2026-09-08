-- =========================================================
-- FOLDER-1 — 수동 확인 스크립트
--
-- 대상 migration:
--   supabase/migrations/20260908100000_create_post_folders.sql
--   supabase/migrations/20260908110000_add_posts_folder_id_sort_order.sql
--   supabase/migrations/20260908120000_add_post_folder_rpcs.sql
--
-- ★ 이 파일은 "적용 후 눈으로 확인하는 절차"다. 1~4절은 조회만 한다.
--   5절부터는 실제로 폴더를 만들고 지우므로, 확인이 끝나면 8절의
--   정리 블록을 실행한다.
--
-- 기존 supabase/tests/*.sql과 같은 형식: Supabase SQL Editor에
-- 한 절씩 붙여넣어 결과를 확인한다. <UUID>/<CATEGORY_ID> 자리는
-- 실제 값으로 바꿔서 실행한다.
--
-- 참고: 같은 검사를 WASM PostgreSQL(PGlite) 위에서 자동으로 돌린
-- 결과가 이미 있다(54개 항목 통과). 이 파일은 **실제 Supabase
-- 인스턴스에서** 같은 결과가 나오는지를 확인하기 위한 것이다 —
-- 프로덕션에는 저장소에 없는 기존 RLS 정책과 트리거가 있으므로
-- 반드시 실기 확인이 필요하다.
-- =========================================================


-- =========================================================
-- 1) 구조가 생겼는가
-- =========================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'post_folders';
-- 기대: 한 행

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'post_folders'
order by ordinal_position;
-- 기대: id(bigint) / user_id(uuid) / category_id(bigint) /
--       parent_id(bigint, nullable) / name(text) / depth(smallint) /
--       sort_order(integer) / created_at / updated_at

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'posts'
  and column_name in ('folder_id', 'sort_order')
order by column_name;
-- 기대: folder_id(bigint, YES) / sort_order(integer, NO)


-- =========================================================
-- 2) 기존 글 backfill — 표시 순서가 그대로인가 (가장 중요)
--
-- 왼쪽(현재 화면 순서 = created_at DESC)과 오른쪽(새 정렬 =
-- sort_order ASC)의 제목이 카테고리마다 **완전히 같은 순서**여야
-- 한다. 다르면 사용자가 보는 목록 순서가 바뀐 것이다.
-- =========================================================

with by_created as (
  select
    category_id,
    row_number() over (partition by category_id order by created_at desc, id desc) as rn,
    id, title
  from public.posts
),
by_sort as (
  select
    category_id,
    row_number() over (partition by category_id order by sort_order asc, id desc) as rn,
    id, title
  from public.posts
)
select
  c.category_id,
  c.rn,
  c.title as created_at_desc,
  s.title as sort_order_asc,
  (c.id = s.id) as same
from by_created c
join by_sort s
  on s.category_id = c.category_id
 and s.rn = c.rn
order by c.category_id, c.rn;
-- 기대: same 컬럼이 전부 true

select count(*) as null_sort_order
from public.posts
where sort_order is null;
-- 기대: 0

select count(*) as posts_in_folder
from public.posts
where folder_id is not null;
-- 기대: 0 (migration 직후에는 모든 글이 root)


-- =========================================================
-- 3) 권한 — 새 컬럼이 SELECT에만 들어갔는가
--
-- ★ folder_id/sort_order가 UPDATE/INSERT 목록에 들어가 있으면 안
--   된다. 들어가 있으면 클라이언트가 RPC를 우회해 폴더 구조를
--   직접 조작할 수 있다는 뜻이다.
-- ★ secret_password_hash가 SELECT에 다시 나타나면 즉시 중단하고
--   원인을 찾아야 한다(기존 보안 계약 위반).
-- =========================================================

select column_name, privilege_type, grantee
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'posts'
  and grantee in ('anon', 'authenticated')
  and column_name in ('folder_id', 'sort_order', 'secret_password_hash')
order by column_name, grantee, privilege_type;
-- 기대: folder_id / sort_order  -> SELECT 만 (anon, authenticated)
--       secret_password_hash    -> SELECT 없음
--                                  (authenticated의 UPDATE만 존재)

select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'post_folders'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
-- 기대: INSERT / UPDATE / DELETE 가 하나도 없어야 한다
--       (SELECT는 컬럼 단위라 여기 안 나오는 것이 정상)

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'create_post_folder', 'rename_post_folder', 'delete_post_folder',
    'move_tree_node', 'post_container_rebalance', 'post_node_sort_order'
  )
order by routine_name, grantee;
-- 기대: anon / PUBLIC 은 한 줄도 없어야 한다
--       create/rename/delete/move -> authenticated + service_role
--       rebalance / node_sort_order -> service_role (내부 전용)


-- =========================================================
-- 4) RLS
-- =========================================================

select relrowsecurity
from pg_class
where oid = 'public.post_folders'::regclass;
-- 기대: true

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'post_folders'
order by policyname;
-- 기대: post_folders_public_read(SELECT, qual=true)
--       post_folders_owner_write(ALL, auth.uid() = user_id)


-- =========================================================
-- 5) 폴더 생성과 3단계 제한
--
-- ★ 여기부터는 실제로 데이터를 만든다. <CATEGORY_ID>는 본인
--   소유의 type='post' 카테고리 id로 바꾼다. Supabase SQL Editor는
--   service_role로 실행되므로 auth.uid()가 null이다 — RPC가
--   "authentication required"로 거절하는 것이 정상이다.
--   따라서 이 절은 **브라우저에서 로그인한 상태로** 확인하거나,
--   아래처럼 세션 사용자를 흉내내서 실행한다.
-- =========================================================

-- 세션 사용자 흉내 (SQL Editor에서 RPC를 직접 호출하기 위함).
-- <UUID>는 본인 auth.users.id.
select set_config('request.jwt.claims',
                  json_build_object('sub', '<UUID>')::text,
                  true);

select public.create_post_folder(<CATEGORY_ID>, null, '테스트-1단계') as depth1_id;
-- 위에서 나온 id를 아래 <D1>에 넣는다
select public.create_post_folder(<CATEGORY_ID>, <D1>, '테스트-2단계') as depth2_id;
select public.create_post_folder(<CATEGORY_ID>, <D2>, '테스트-3단계') as depth3_id;

select id, name, parent_id, depth, sort_order
from public.post_folders
where category_id = <CATEGORY_ID>
order by depth, sort_order;
-- 기대: depth가 1 / 2 / 3

select public.create_post_folder(<CATEGORY_ID>, <D3>, '테스트-4단계');
-- 기대: 에러 "maximum folder depth (3) reached"


-- =========================================================
-- 6) cycle / depth 이동 제한
-- =========================================================

select public.move_tree_node('folder', <D1>, <D1>);
-- 기대: 에러 "cannot move folder ... into itself"

select public.move_tree_node('folder', <D1>, <D2>);
-- 기대: 에러 "cannot move folder ... into its own descendant"

select public.move_tree_node('folder', <D1>, <D3>);
-- 기대: 에러 "cannot move folder ... into its own descendant"

-- 다른 root 폴더를 하나 더 만들어 "서브트리를 옮기면 4단계" 확인
select public.create_post_folder(<CATEGORY_ID>, null, '테스트-다른root') as other_root;

select public.move_tree_node('folder', <D1>, <OTHER_ROOT>);
-- 기대: 에러 "would exceed maximum depth 3"
--       (D1 아래에 2단계가 더 있으므로)


-- =========================================================
-- 7) 글 이동 / 폴더 삭제 시 자리 물려받기
-- =========================================================

-- 글 하나를 폴더 안으로
select public.move_tree_node('post', <POST_ID>, <D1>);

select id, title, folder_id, sort_order
from public.posts
where id = <POST_ID>;
-- 기대: folder_id = <D1>

-- 삭제 전 root 컨테이너 순서 기록
select 'folder' as kind, id, name, sort_order
from public.post_folders
where category_id = <CATEGORY_ID> and parent_id is null
union all
select 'post', id, title, sort_order
from public.posts
where category_id = <CATEGORY_ID> and folder_id is null
order by sort_order;

-- 1단계 폴더 삭제 — 안의 글/하위폴더는 살아남아 **그 자리**로 올라온다
select public.delete_post_folder(<D1>);

select 'folder' as kind, id, name, sort_order
from public.post_folders
where category_id = <CATEGORY_ID> and parent_id is null
union all
select 'post', id, title, sort_order
from public.posts
where category_id = <CATEGORY_ID> and folder_id is null
order by sort_order;
-- 기대: <D1>이 있던 자리에 <D1>의 직속 자식(글 + 2단계 폴더)이
--       순서를 유지한 채 들어와 있고, 그 뒤 형제들의 상대 순서는 그대로.
--       삭제된 폴더의 글이 사라지지 않았는지 반드시 확인.

select id, name, parent_id, depth
from public.post_folders
where category_id = <CATEGORY_ID>
order by depth, sort_order;
-- 기대: 승격된 폴더의 depth가 한 단계씩 줄어 있음(자손까지 연쇄)


-- =========================================================
-- 8) 정리 — 위에서 만든 테스트 폴더 되돌리기
--
-- 폴더만 지운다. 글은 delete_post_folder()가 root로 돌려놓으므로
-- 하나도 지워지지 않는다.
-- =========================================================

-- 깊은 것부터 지워야 자식이 남지 않는다(가장 깊은 폴더부터 반복 실행)
select id, name, depth
from public.post_folders
where category_id = <CATEGORY_ID>
  and name like '테스트-%'
order by depth desc;

-- 위 목록의 id를 depth 큰 순서대로 하나씩
select public.delete_post_folder(<ID>);

select count(*) as remaining_test_folders
from public.post_folders
where category_id = <CATEGORY_ID>
  and name like '테스트-%';
-- 기대: 0

-- 테스트로 폴더에 넣었던 글이 root로 돌아왔는지
select id, title, folder_id
from public.posts
where id = <POST_ID>;
-- 기대: folder_id = null
