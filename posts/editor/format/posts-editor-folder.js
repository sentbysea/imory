/* =========================================================
   POSTS EDITOR - 폴더 선택 (FOLDER-3)

   글쓰기/수정 폼에서 "이 글을 이 카테고리의 어느 폴더에 둘지"를
   고르는 칸 하나(#postEditorFolder)를 담당한다.

   ── 왜 생겼나 ──────────────────────────────────────────
   FOLDER-1은 새 글을 항상 카테고리 root에 만들고, 폴더 배치는
   ?manage=1 관리 트리에서 끌어다 놓는 것만 허용했다(FOLDER-1 §1-5).
   실제로 쓰다 보면 "폴더 안에서 글을 쓰기 시작했는데 저장하면 밖에
   나와 있고, 다시 관리 화면에 들어가 끌어다 놓아야" 했다. 이 파일이
   그 두 번째 단계를 없앤다 — 폴더는 CATEGORY 드롭다운 바로 아래에서
   고른다.

   ── 표시 규칙 ──────────────────────────────────────────
   계층은 들여쓰기 기호로 나타낸다(<select>는 중첩을 표현할 방법이
   없고, optgroup은 고를 수 없는 머리글이라 폴더 자체를 고를 수 없게
   된다):

     폴더 없음
     test
     ㄴ2단
     ㄴㄴ3단
     2002

   폴더가 하나도 없는 카테고리에서는 칸 자체를 숨긴다 — 고를 것이
   없는 드롭다운을 남기지 않는다.

   ── 저장 경로 ──────────────────────────────────────────
   posts.folder_id에는 INSERT/UPDATE GRANT가 없다
   (supabase/migrations/20260908110000_add_posts_folder_id_sort_order.sql) —
   클라이언트가 직접 쓰면 depth/cycle/소유권 검증을 우회할 수 있기
   때문이다. 그래서 저장은 항상 move_tree_node() RPC로만 한다
   (관리 트리의 drag가 쓰는 것과 **같은 함수**다). 새 글도 마찬가지로
   "root에 만든 뒤 옮긴다" — 그 순서라야 RPC가 실재하는 글 id를 받는다.

   의존(classic script, 이 파일보다 먼저 로드돼야 함):
   supabaseClient(core/lib/supabase-client.js),
   posts/editor/posts-refs.js(postEditorFolder / postEditorCategory).
========================================================== */


/* 지금 드롭다운에 채워진 폴더가 어느 카테고리의 것인지 */
let postEditorFolderCategoryId =
  null;


/* 수정 폼을 열었을 때 그 글이 원래 들어 있던 폴더(변경 판정용) */
let postEditorFolderSourceId =
  null;


/* =========================================================
   조회

   관리 트리(posts/manage/posts-folder-data.js)의 postFolderRows를
   쓰지 않는다 — 그 배열은 ?manage=1 화면이 들고 있는 상태라,
   에디터가 같은 배열을 덮어쓰면 관리 화면으로 돌아갔을 때 다른
   카테고리의 트리가 남는다. 조회 규칙(컬럼/정렬)은 같다.
========================================================== */

async function fetchPostEditorFolderRows(
  categoryId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "post_folders"
      )
      .select(
        "id, parent_id, name, depth, sort_order"
      )
      .eq(
        "category_id",
        Number(categoryId)
      )
      .order(
        "sort_order",
        {
          ascending: true
        }
      );


  if (error) {

    console.error(
      "[posts-editor-folder] post_folders 조회 실패",
      error
    );


    return [];

  }


  return (
    data ||
    []
  );

}


/*
  parent → children 순서(DFS)로 펼친다. 조회는 sort_order 오름차순
  하나뿐이라 형제 순서는 그대로 쓰고, 계층만 여기서 세운다 —
  관리 트리와 같은 순서(sort_order → id)를 쓴다.
*/

function flattenPostEditorFolderRows(
  rows
) {

  const childrenByParent =
    new Map();


  for (const row of rows) {

    const key =
      row.parent_id === null ||
      row.parent_id === undefined
        ? "root"
        : String(row.parent_id);


    if (!childrenByParent.has(key)) {

      childrenByParent.set(
        key,
        []
      );

    }


    childrenByParent.get(
      key
    ).push(
      row
    );

  }


  const ordered =
    [];


  const walk =
    (key) => {

      const children =
        childrenByParent.get(
          key
        ) ||
        [];


      children
        .slice()
        .sort(
          (a, b) =>
            (a.sort_order - b.sort_order) ||
            (Number(a.id) - Number(b.id))
        )
        .forEach(
          (row) => {

            ordered.push(
              row
            );


            walk(
              String(row.id)
            );

          }
        );

    };


  walk(
    "root"
  );


  return ordered;

}


/* =========================================================
   드롭다운 채우기

   categoryId: 지금 CATEGORY 드롭다운이 가리키는 카테고리.
   selectedFolderId: 미리 골라 둘 폴더(없으면 "폴더 없음").

   고르려던 폴더가 그사이 사라졌으면(다른 탭에서 삭제) 조용히
   "폴더 없음"으로 떨어진다 — 저장이 실패하는 것보다 낫다.
========================================================== */

async function loadPostEditorFolders(
  categoryId,
  selectedFolderId = null
) {

  if (
    !postEditorFolder ||
    !postEditorFolderField
  ) {

    return;

  }


  postEditorFolderCategoryId =
    categoryId === null ||
    categoryId === undefined
      ? null
      : Number(categoryId);


  postEditorFolder.innerHTML =
    "";


  if (
    postEditorFolderCategoryId ===
    null
  ) {

    postEditorFolderField.hidden =
      true;


    return;

  }


  const rows =
    flattenPostEditorFolderRows(
      await fetchPostEditorFolderRows(
        postEditorFolderCategoryId
      )
    );


  /*
    응답이 늦게 도착하는 사이 사용자가 카테고리를 또 바꿨을 수
    있다 — 그때는 이 결과를 버린다(나중 호출이 자기 결과를 채운다).
  */

  if (
    postEditorFolderCategoryId !==
    Number(categoryId)
  ) {

    return;

  }


  postEditorFolderField.hidden =
    rows.length === 0;


  const rootOption =
    document.createElement(
      "option"
    );


  rootOption.value =
    "";


  rootOption.textContent =
    "폴더 없음";


  postEditorFolder.appendChild(
    rootOption
  );


  rows.forEach(
    (row) => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        String(row.id);


      /*
        depth는 DB가 강제하는 1~3이다
        (20260908100000_create_post_folders.sql). 혹시 값이 비어
        있어도 최소 1단으로 본다.
      */

      const depth =
        Math.max(
          1,
          Number(row.depth) ||
          1
        );


      option.textContent =
        "ㄴ".repeat(
          depth - 1
        ) +
        (
          row.name ||
          ""
        );


      postEditorFolder.appendChild(
        option
      );

    }
  );


  const wanted =
    selectedFolderId === null ||
    selectedFolderId === undefined
      ? ""
      : String(selectedFolderId);


  postEditorFolder.value =
    wanted;


  if (
    postEditorFolder.value !==
    wanted
  ) {

    postEditorFolder.value =
      "";

  }

}


/*
  지금 폼이 고른 폴더 id(없으면 null). 칸이 숨어 있어도(폴더가 없는
  카테고리) 항상 null을 돌려준다.
*/

function getPostEditorFolderId() {

  if (
    !postEditorFolder ||
    !postEditorFolderField ||
    postEditorFolderField.hidden
  ) {

    return null;

  }


  const value =
    postEditorFolder.value;


  return (
    value
      ? Number(value)
      : null
  );

}


/*
  수정 폼을 열 때 그 글이 원래 있던 폴더를 기억해 둔다 — 저장할 때
  "바뀌었을 때만" RPC를 부르기 위한 값이다. 새 글은 null.
*/

function setPostEditorFolderSource(
  folderId
) {

  postEditorFolderSourceId =
    folderId === null ||
    folderId === undefined
      ? null
      : Number(folderId);

}


function getPostEditorFolderSource() {

  return postEditorFolderSourceId;

}


/* =========================================================
   저장 — 고른 폴더로 옮기기

   postId: 방금 만들었거나 수정한 글.
   targetFolderId: 고른 폴더(null이면 카테고리 root).

   옮길 필요가 없으면(이미 그 컨테이너) 아무 요청도 보내지 않고
   null을 돌려준다. 실패하면 error를 그대로 돌려준다 — 글 자체는
   이미 저장된 상태이므로 부르는 쪽이 "글은 저장됐지만 폴더 이동은
   실패했다"를 구분해서 알릴 수 있다.

   자리: 컨테이너의 **맨 위**다. 새 글이 root 맨 위에 오는 규칙
   (FOLDER-1 사용자 결정 D-1, posts 트리거)과 같게 맞춘다 —
   move_tree_node()는 이웃을 주지 않으면 sort_order 100에 놓으므로,
   그 컨테이너의 첫 노드를 next 이웃으로 넘겨 그 앞에 끼운다.
========================================================== */

async function movePostToEditorFolder(
  postId,
  categoryId,
  targetFolderId,
  currentFolderId
) {

  const target =
    targetFolderId === null ||
    targetFolderId === undefined
      ? null
      : Number(targetFolderId);


  const current =
    currentFolderId === null ||
    currentFolderId === undefined
      ? null
      : Number(currentFolderId);


  if (target === current) {

    return null;

  }


  const next =
    await findPostEditorContainerTop(
      categoryId,
      target,
      postId
    );


  const {
    error
  } =
    await supabaseClient.rpc(
      "move_tree_node",
      {
        p_node_type:
          "post",

        p_node_id:
          Number(postId),

        p_target_folder_id:
          target,

        p_prev_type:
          null,

        p_prev_id:
          null,

        p_next_type:
          next
            ? next.kind
            : null,

        p_next_id:
          next
            ? Number(next.id)
            : null
      }
    );


  if (error) {

    console.error(
      "[posts-editor-folder] move_tree_node 실패",
      error
    );

  }


  return (
    error ||
    null
  );

}


/*
  대상 컨테이너의 첫 노드(폴더/글 통틀어 sort_order가 가장 작은
  것)를 찾는다. 옮기는 글 자신은 제외한다 — 같은 컨테이너 안에서
  자기 자신을 이웃으로 넘기면 자리 계산이 무의미해진다.

  컨테이너가 비어 있으면 null을 돌려주고, 그때는 move_tree_node()가
  기본 자리(100)에 놓는다.
*/

async function findPostEditorContainerTop(
  categoryId,
  folderId,
  excludePostId
) {

  const numericCategoryId =
    Number(categoryId);


  let postQuery =
    supabaseClient
      .from(
        "posts"
      )
      .select(
        "id, sort_order"
      )
      .eq(
        "category_id",
        numericCategoryId
      );


  postQuery =
    folderId === null
      ? postQuery.is(
          "folder_id",
          null
        )
      : postQuery.eq(
          "folder_id",
          folderId
        );


  if (
    excludePostId !== null &&
    excludePostId !== undefined
  ) {

    postQuery =
      postQuery.neq(
        "id",
        Number(excludePostId)
      );

  }


  let folderQuery =
    supabaseClient
      .from(
        "post_folders"
      )
      .select(
        "id, sort_order"
      )
      .eq(
        "category_id",
        numericCategoryId
      );


  folderQuery =
    folderId === null
      ? folderQuery.is(
          "parent_id",
          null
        )
      : folderQuery.eq(
          "parent_id",
          folderId
        );


  const [
    postResult,
    folderResult
  ] =
    await Promise.all([

      postQuery
        .order(
          "sort_order",
          {
            ascending: true
          }
        )
        .limit(
          1
        ),

      folderQuery
        .order(
          "sort_order",
          {
            ascending: true
          }
        )
        .limit(
          1
        )

    ]);


  const candidates =
    [];


  if (postResult.data?.[0]) {

    candidates.push({
      kind: "post",
      id: postResult.data[0].id,
      sortOrder: postResult.data[0].sort_order
    });

  }


  if (folderResult.data?.[0]) {

    candidates.push({
      kind: "folder",
      id: folderResult.data[0].id,
      sortOrder: folderResult.data[0].sort_order
    });

  }


  if (!candidates.length) {

    return null;

  }


  /*
    동률이면 관리 트리/서버와 같은 tie-break를 쓴다:
    sort_order → kind('folder' < 'post') → id.
  */

  candidates.sort(
    (a, b) =>
      (a.sortOrder - b.sortOrder) ||
      a.kind.localeCompare(b.kind) ||
      (Number(a.id) - Number(b.id))
  );


  return candidates[0];

}


/* =========================================================
   카테고리를 바꾸면 폴더 목록도 바뀐다

   고르고 있던 폴더는 다른 카테고리의 것이 되므로 유지하지 않는다 —
   DB 트리거도 같은 판단을 한다(카테고리를 옮기면 folder_id를 null로
   되돌린다, 20260908110000 migration 4절 (c)).
========================================================== */

postEditorCategory
  ?.addEventListener(
    "change",
    () => {

      loadPostEditorFolders(
        postEditorCategory.value
          ? Number(postEditorCategory.value)
          : null,
        null
      );

    }
  );
