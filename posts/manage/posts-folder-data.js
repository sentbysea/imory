/* =========================================================
   POSTS MANAGE - 폴더 트리 데이터 계층 (FOLDER-1)

   책임: post_folders 조회, 트리 구성, 폴더 RPC 호출, 낙관적
   업데이트를 되돌리기 위한 스냅샷. DOM은 전혀 만지지 않는다
   (렌더는 posts-folder-tree.js, drag는 posts-folder-sortable.js).

   의존(classic script, 이 파일보다 먼저 로드돼야 함):
   supabaseClient(core/lib/supabase-client.js),
   currentCategoryPosts/currentPostCategoryId(posts/editor/posts-refs.js).

   ── 정렬 계약 ──────────────────────────────────────────
   sort_order는 "같은 컨테이너 안의 순서"이고 폴더와 글이 정렬
   공간을 공유한다. 컨테이너 안에서의 비교 순서는 DB의
   post_container_rebalance()/move_tree_node()가 쓰는 것과 **정확히
   같아야 한다**: sort_order → kind('folder' < 'post') → id.
   여기서 어긋나면 저장은 성공했는데 화면 순서가 다르게 보인다.

   ── 이 계층이 sort_order를 쓰는 범위 ────────────────────
   sort_order 정렬은 (1) 이 관리 화면과 (2) Skin의 category.tree
   에서만 쓴다. 기존 legacy 읽기 목록 / 관련글 / HOME 최신글 /
   기존 Skin의 category.posts는 지금까지처럼 created_at DESC를
   그대로 쓴다 — 폴더를 만들었다는 이유만으로 폴더를 모르는 화면의
   순서가 바뀌면 안 되기 때문이다(사용자 결정, 설계 수정 2).
========================================================== */


/* 현재 관리 화면이 들고 있는 post_folders 행들 */
let postFolderRows =
  [];


/* 위 rows가 어느 카테고리의 것인지 */
let postFolderRowsCategoryId =
  null;


/* 접어 둔 폴더 id(문자열) — 렌더를 다시 해도 유지된다 */
const postFolderCollapsedIds =
  new Set();


/* =========================================================
   조회
========================================================== */

async function loadPostFolderRows(
  categoryId
) {

  const numericCategoryId =
    Number(
      categoryId
    );


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "post_folders"
      )
      .select(
        "id, category_id, parent_id, name, depth, sort_order"
      )
      .eq(
        "category_id",
        numericCategoryId
      )
      .order(
        "sort_order",
        {
          ascending: true
        }
      );


  if (error) {

    console.error(
      "[posts-folder-data] post_folders 조회 실패",
      error
    );


    return {
      rows: null,
      error
    };

  }


  postFolderRows =
    data ||
    [];


  postFolderRowsCategoryId =
    numericCategoryId;


  return {
    rows: postFolderRows,
    error: null
  };

}


/*
  관리 화면에서 글 목록을 다시 읽는다.

  폴더 삭제는 안에 있던 글의 folder_id를 바꾸므로(승격) 폴더만
  다시 읽으면 화면과 DB가 어긋난다. 조회 규칙은
  posts-view-list.js의 fetchCategoryPageData()와 같아야 한다 —
  같은 컬럼, 같은 owner 스코프, 같은 정렬(created_at DESC).
  ★ 정렬을 sort_order로 바꾸지 않는다: currentCategoryPosts는
    이 관리 화면 말고도 legacy 읽기 목록이 쓰는 배열이고, 그쪽은
    지금까지의 최신순을 그대로 유지해야 한다(설계 수정 2).
    관리 트리는 buildPostFolderTree()가 sort_order로 다시 세운다.
*/

async function reloadCategoryPostsForManage(
  categoryId
) {

  const owner =
    await getSiteOwner();


  let query =
    supabaseClient
      .from(
        "posts"
      )
      .select(
        "id, title, created_at, visibility, folder_id, sort_order"
      )
      .eq(
        "category_id",
        Number(categoryId)
      );


  if (owner.scoped) {

    query =
      query.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data,
    error
  } =
    await query.order(
      "created_at",
      {
        ascending: false
      }
    );


  if (error) {

    console.error(
      "[posts-folder-data] 관리 화면 글 목록 재조회 실패",
      error
    );


    return {
      posts: null,
      error
    };

  }


  currentCategoryPosts =
    data ||
    [];


  return {
    posts: currentCategoryPosts,
    error: null
  };

}


/* =========================================================
   트리 구성

   folders(post_folders 행) + posts(currentCategoryPosts 항목)를
   받아 root 컨테이너의 자식 배열을 돌려준다.

   node = {
     kind: "folder" | "post",
     id: string,
     row: 원본 행,
     depth: number,          // 폴더는 1~3, 글은 담긴 컨테이너 깊이 + 1
     children: node[],       // 폴더만
     subtreeHeight: number   // 폴더만: 자기 아래로 몇 단계 더 있는가(잎=0)
   }

   고아 폴더(부모가 목록에 없는 경우)는 root로 끌어올린다 —
   조회 시점 차이나 동시 편집으로 부모가 사라져도 그 안의 것들이
   화면에서 통째로 사라지지 않게 한다.
========================================================== */

function buildPostFolderTree(
  folders,
  posts
) {

  const folderNodes =
    new Map();


  (folders || []).forEach(
    row => {

      folderNodes.set(
        String(
          row.id
        ),
        {
          kind: "folder",
          id: String(
            row.id
          ),
          row,
          depth: 1,
          children: [],
          subtreeHeight: 0
        }
      );

    }
  );


  const rootChildren =
    [];


  /* 폴더를 부모에 붙인다 */

  folderNodes.forEach(
    node => {

      const parentId =
        node.row.parent_id === null ||
        node.row.parent_id === undefined
          ? null
          : String(
              node.row.parent_id
            );


      const parent =
        parentId
          ? folderNodes.get(
              parentId
            )
          : null;


      if (parent) {

        parent.children.push(
          node
        );

      }

      else {

        rootChildren.push(
          node
        );

      }

    }
  );


  /* 글을 컨테이너에 붙인다 */

  (posts || []).forEach(
    post => {

      const folderId =
        post.folder_id === null ||
        post.folder_id === undefined
          ? null
          : String(
              post.folder_id
            );


      const node = {
        kind: "post",
        id: String(
          post.id
        ),
        row: post,
        depth: 1,
        children: null,
        subtreeHeight: 0
      };


      const parent =
        folderId
          ? folderNodes.get(
              folderId
            )
          : null;


      if (parent) {

        parent.children.push(
          node
        );

      }

      else {

        rootChildren.push(
          node
        );

      }

    }
  );


  sortPostFolderChildren(
    rootChildren
  );


  folderNodes.forEach(
    node => {

      sortPostFolderChildren(
        node.children
      );

    }
  );


  /* depth와 subtreeHeight를 한 번에 확정한다 */

  assignPostFolderDepths(
    rootChildren,
    1
  );


  return rootChildren;

}


/*
  DB의 order by sort_order, kind, id 와 정확히 같은 비교.
  kind는 'folder' < 'post'(사전순)이고, id는 숫자로 비교한다
  (PostgreSQL에서 bigint 컬럼이므로 문자열 비교가 아니다).
*/

function sortPostFolderChildren(
  children
) {

  if (!Array.isArray(children)) {

    return;

  }


  children.sort(
    (a, b) => {

      const aOrder =
        Number(
          a.row.sort_order ??
          0
        );


      const bOrder =
        Number(
          b.row.sort_order ??
          0
        );


      if (aOrder !== bOrder) {

        return aOrder - bOrder;

      }


      if (a.kind !== b.kind) {

        return a.kind < b.kind
          ? -1
          : 1;

      }


      return Number(a.id) - Number(b.id);

    }
  );

}


function assignPostFolderDepths(
  children,
  depth
) {

  let maxChildFolderHeight =
    0;


  (children || []).forEach(
    node => {

      node.depth =
        depth;


      if (node.kind !== "folder") {

        return;

      }


      const height =
        assignPostFolderDepths(
          node.children,
          depth + 1
        );


      node.subtreeHeight =
        height;


      maxChildFolderHeight =
        Math.max(
          maxChildFolderHeight,
          height + 1
        );

    }
  );


  return maxChildFolderHeight;

}


/* =========================================================
   스냅샷 / 롤백

   drag 저장이 실패했을 때 화면을 되돌리기 위한 최소한의 상태
   복사본. 폴더 행과 글 행에서 **트리 구조에 영향을 주는 값만**
   복사한다(제목/날짜 등은 이 화면에서 바뀌지 않는다).
========================================================== */

function snapshotPostFolderState() {

  return {

    folders:
      postFolderRows.map(
        row => ({
          id: row.id,
          parent_id: row.parent_id,
          depth: row.depth,
          sort_order: row.sort_order
        })
      ),

    posts:
      (currentCategoryPosts || []).map(
        row => ({
          id: row.id,
          folder_id: row.folder_id,
          sort_order: row.sort_order
        })
      )

  };

}


function restorePostFolderState(
  snapshot
) {

  if (!snapshot) {

    return;

  }


  const folderById =
    new Map(
      postFolderRows.map(
        row => [
          String(row.id),
          row
        ]
      )
    );


  snapshot.folders.forEach(
    saved => {

      const row =
        folderById.get(
          String(saved.id)
        );


      if (!row) {

        return;

      }


      row.parent_id =
        saved.parent_id;


      row.depth =
        saved.depth;


      row.sort_order =
        saved.sort_order;

    }
  );


  const postById =
    new Map(
      (currentCategoryPosts || []).map(
        row => [
          String(row.id),
          row
        ]
      )
    );


  snapshot.posts.forEach(
    saved => {

      const row =
        postById.get(
          String(saved.id)
        );


      if (!row) {

        return;

      }


      row.folder_id =
        saved.folder_id;


      row.sort_order =
        saved.sort_order;

    }
  );

}


/*
  move_tree_node()가 돌려준 "이동 후 그 컨테이너의 최종 순서"를
  로컬 상태에 반영한다. 서버가 rebalance를 했을 수도 있으므로
  숫자 자체를 그대로 믿지 않고 순서만 가져와 100 간격으로 다시
  매긴다 — 이 값은 화면 정렬에만 쓰이고, 다음 이동에서 실제
  숫자는 다시 서버가 계산한다.
*/

function applyPostFolderContainerOrder(
  containerOrder
) {

  if (!Array.isArray(containerOrder)) {

    return;

  }


  const folderById =
    new Map(
      postFolderRows.map(
        row => [
          String(row.id),
          row
        ]
      )
    );


  const postById =
    new Map(
      (currentCategoryPosts || []).map(
        row => [
          String(row.id),
          row
        ]
      )
    );


  containerOrder.forEach(
    (entry, index) => {

      const nextOrder =
        (index + 1) * 100;


      if (entry.kind === "folder") {

        const row =
          folderById.get(
            String(entry.id)
          );


        if (row) {

          row.sort_order =
            nextOrder;

        }


        return;

      }


      const row =
        postById.get(
          String(entry.id)
        );


      if (row) {

        row.sort_order =
          nextOrder;

      }

    }
  );

}


/* =========================================================
   RPC 래퍼

   전부 { data, error } 형태로 돌려준다 — 호출자가 error만 보고
   롤백 여부를 정할 수 있게 한다. 이 파일은 사용자에게 메시지를
   직접 보여주지 않는다(그건 렌더 계층의 몫).
========================================================== */

async function rpcCreatePostFolder(
  categoryId,
  parentId,
  name
) {

  return supabaseClient.rpc(
    "create_post_folder",
    {
      p_category_id:
        Number(categoryId),

      p_parent_id:
        parentId === null ||
        parentId === undefined
          ? null
          : Number(parentId),

      p_name:
        name
    }
  );

}


async function rpcRenamePostFolder(
  folderId,
  name
) {

  return supabaseClient.rpc(
    "rename_post_folder",
    {
      p_folder_id:
        Number(folderId),

      p_name:
        name
    }
  );

}


async function rpcDeletePostFolder(
  folderId
) {

  return supabaseClient.rpc(
    "delete_post_folder",
    {
      p_folder_id:
        Number(folderId)
    }
  );

}


/*
  이동. sort_order 숫자는 보내지 않는다 — "무엇을, 어디로,
  누구와 누구 사이에"만 보내고 자리 계산은 서버가 한다(동시
  편집에서 서로의 숫자를 덮어쓰지 않게).
*/

async function rpcMoveTreeNode({
  nodeKind,
  nodeId,
  targetFolderId,
  prevKind,
  prevId,
  nextKind,
  nextId
}) {

  return supabaseClient.rpc(
    "move_tree_node",
    {
      p_node_type:
        nodeKind,

      p_node_id:
        Number(nodeId),

      p_target_folder_id:
        targetFolderId === null ||
        targetFolderId === undefined
          ? null
          : Number(targetFolderId),

      p_prev_type:
        prevKind ||
        null,

      p_prev_id:
        prevId === null ||
        prevId === undefined
          ? null
          : Number(prevId),

      p_next_type:
        nextKind ||
        null,

      p_next_id:
        nextId === null ||
        nextId === undefined
          ? null
          : Number(nextId)
    }
  );

}
