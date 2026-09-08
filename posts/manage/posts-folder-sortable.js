/* =========================================================
   POSTS MANAGE - 폴더 트리 drag & drop (FOLDER-1)

   직접 drag 엔진을 만들지 않고 SortableJS를 쓴다(사용자 결정 F-1).
   구조는 "tree renderer + 컨테이너마다 Sortable 인스턴스 하나"다 —
   컨테이너(.folder-tree-container)가 곧 하나의 정렬 공간이고,
   같은 group을 공유하므로 컨테이너 사이 이동이 그대로 폴더 간
   이동이 된다.

   의존: SortableJS(전역 Sortable, index.html에서 jsDelivr 고정
   버전으로 로드), posts/manage/posts-folder-data.js,
   posts/manage/posts-folder-tree.js.

   ── 왜 handle만 잡게 하는가 ──────────────────────────────
   행 전체를 drag 대상으로 두면 모바일에서 목록을 스크롤하려는
   손짓이 전부 drag로 잡힌다. 작은 ≡ 핸들로 제한하고, 거기에
   delay/threshold를 얹어 스크롤과 확실히 갈라놓는다.

   ── 저장 실패 정책 ───────────────────────────────────────
   1) 이동 직전 상태 스냅샷  2) 화면/로컬 상태에 먼저 반영
   3) RPC  4) 성공하면 서버가 돌려준 컨테이너 순서로 확정
   5) 실패하면 스냅샷으로 되돌리고 다시 그린 뒤 DB에서 재조회
   6) 짧은 오류 문구 표시
   UI와 DB가 어긋난 채로 남는 경로를 만들지 않는다.
========================================================== */


const POST_FOLDER_SORTABLE_GROUP =
  "imory-post-folder-tree";


/* =========================================================
   SortableJS 지연 로드

   ★ 이 URL에는 ?v=${APP_BUILD_VERSION}를 붙이지 않는다(사용자
     결정 F-1). 버전 쿼리는 "우리 저장소 파일이 바뀌었다"를
     알리는 장치이고, 외부 CDN 자산은 URL의 고정 버전(@1.15.6)이
     이미 그 역할을 한다 — 우리 배포 버전이 오를 때마다 남의
     CDN 캐시를 무효화할 이유가 없다(CLAUDE.md §4).

   ★ 방문자에게는 이 파일이 필요 없다. 폴더 정리는 소유자가
     관리 화면을 열었을 때만 하는 일이므로, 공개 페이지 로드에
     45KB를 얹지 않고 관리 트리를 처음 그릴 때 한 번만 받는다.
========================================================== */

const POST_FOLDER_SORTABLE_SRC =
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js";


let postFolderSortableLoadPromise =
  null;


let postFolderSortableLoadFailed =
  false;


function ensurePostFolderSortableLoaded() {

  if (
    typeof window.Sortable !==
    "undefined"
  ) {

    return Promise.resolve(true);

  }


  if (postFolderSortableLoadFailed) {

    return Promise.resolve(false);

  }


  if (postFolderSortableLoadPromise) {

    return postFolderSortableLoadPromise;

  }


  postFolderSortableLoadPromise =
    new Promise(
      resolve => {

        const script =
          document.createElement(
            "script"
          );


        script.src =
          POST_FOLDER_SORTABLE_SRC;


        script.async =
          true;


        script.addEventListener(
          "load",
          () => {

            resolve(
              typeof window.Sortable !==
              "undefined"
            );

          }
        );


        script.addEventListener(
          "error",
          () => {

            postFolderSortableLoadFailed =
              true;


            resolve(false);

          }
        );


        document.head.appendChild(
          script
        );

      }
    );


  return postFolderSortableLoadPromise;

}


/* 이 화면에 붙어 있는 Sortable 인스턴스들 — 재렌더 때 정리한다 */
let postFolderSortableInstances =
  [];


/* 저장이 진행 중인 동안 새 drag를 받지 않기 위한 플래그 */
let postFolderMoveInFlight =
  false;


function destroyPostFolderSortables() {

  postFolderSortableInstances.forEach(
    instance => {

      try {

        instance.destroy();

      } catch (err) {

        /* 이미 DOM에서 사라진 인스턴스 — 무시해도 안전하다 */

      }

    }
  );


  postFolderSortableInstances =
    [];

}


/* =========================================================
   배선

   renderPostFolderTree()가 트리를 새로 그릴 때마다 호출한다.
   이전 인스턴스는 전부 정리하고 새 DOM에 다시 붙인다.
========================================================== */

function attachPostFolderSortables(
  treeEl
) {

  destroyPostFolderSortables();


  if (
    typeof window.Sortable ===
    "undefined"
  ) {

    /*
      아직 SortableJS가 없다 — 받아 온 뒤 이 트리가 아직 화면에
      남아 있으면 그때 배선한다. 받는 동안에도 트리는 정상적으로
      보이고 폴더 CRUD와 선택삭제는 그대로 쓸 수 있다.

      끝내 못 받으면(오프라인 등) 순서 변경만 조용히 빠진다 —
      관리 화면이 통째로 열리지 않는 것보다 낫다.
    */

    ensurePostFolderSortableLoaded().then(
      loaded => {

        if (
          !loaded ||
          !treeEl.isConnected
        ) {

          if (!loaded) {

            console.warn(
              "[posts-folder-sortable] SortableJS를 불러오지 못해 drag 정렬을 건너뜁니다."
            );

          }


          return;

        }


        attachPostFolderSortables(
          treeEl
        );

      }
    );


    return;

  }


  const containers =
    treeEl.querySelectorAll(
      ".folder-tree-container"
    );


  containers.forEach(
    container => {

      postFolderSortableInstances.push(
        window.Sortable.create(
          container,
          {
            group: {
              name: POST_FOLDER_SORTABLE_GROUP,
              pull: true,
              put: true
            },

            /* 행 전체가 아니라 ≡ 핸들만 */
            handle: ".tree-drag-handle",

            draggable: ".folder-node",

            animation: 150,

            /*
              모바일: 손가락을 잠깐 누르고 있어야 drag가 시작된다.
              마우스에는 지연을 주지 않는다(delayOnTouchOnly).
            */
            delay: 180,
            delayOnTouchOnly: true,

            /*
              누른 채 이 픽셀 이상 움직이면 drag가 아니라 스크롤로
              본다 — 세로 스크롤과 drag가 겹치는 구간을 줄인다.
            */
            touchStartThreshold: 6,

            fallbackTolerance: 4,

            /*
              중첩 리스트에서 권장되는 조합. fallbackOnBody가 없으면
              끌고 있는 행이 부모 컨테이너에 잘려 보이고, swapThreshold를
              낮추면 안쪽 폴더로 들어가는 판정이 너무 예민해진다.
            */
            fallbackOnBody: true,
            swapThreshold: 0.65,
            invertSwap: true,

            /* 빈 폴더 안으로도 떨어뜨릴 수 있게 여유를 준다 */
            emptyInsertThreshold: 16,

            onMove: canDropPostFolderNode,

            onEnd: handlePostFolderDragEnd
          }
        )
      );

    }
  );

}


/* =========================================================
   놓을 수 있는 자리인가 (drag 중 판정)

   서버도 같은 규칙을 강제하지만(트리거 + RPC), 놓을 수 없는
   자리를 놓을 수 있는 것처럼 보여주고 나서 거절하는 것보다
   애초에 막는 편이 낫다.

   false를 돌려주면 SortableJS가 그 자리에 놓지 못하게 한다.
========================================================== */

function canDropPostFolderNode(
  evt
) {

  const dragged =
    evt.dragged;


  const target =
    evt.to;


  if (
    !dragged ||
    !target
  ) {

    return true;

  }


  if (
    dragged.dataset.nodeKind !==
    "folder"
  ) {

    /* 글은 어느 깊이의 폴더에도 들어갈 수 있다 */

    return true;

  }


  /*
    자기 자신 안 / 자기 자손 안으로는 못 들어간다.
    끌고 있는 요소가 목적지 컨테이너를 포함하고 있으면 그게 곧
    "내 안으로 넣으려 한다"는 뜻이다.
  */

  if (
    dragged === target ||
    dragged.contains(target)
  ) {

    return false;

  }


  /*
    3단계 제한: 이 컨테이너에 놓이면 depth는 containerDepth + 1이
    되고, 끌고 있는 폴더 아래에 subtreeHeight 단계가 더 따라온다.
  */

  const containerDepth =
    Number(
      target.dataset.containerDepth ||
      0
    );


  const subtreeHeight =
    Number(
      dragged.dataset.subtreeHeight ||
      0
    );


  if (
    (containerDepth + 1) + subtreeHeight >
    3
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   drop 확정 → 저장
========================================================== */

async function handlePostFolderDragEnd(
  evt
) {

  const item =
    evt.item;


  if (!item) {

    return;

  }


  /* 제자리에 그대로 놓았으면 아무 일도 하지 않는다 */

  if (
    evt.from === evt.to &&
    evt.oldIndex === evt.newIndex
  ) {

    return;

  }


  if (postFolderMoveInFlight) {

    /*
      앞선 저장이 아직 끝나지 않았다 — 화면만 움직이고 DB는
      안 바뀌는 상태를 만들지 않도록, 지금 화면을 서버 상태로
      다시 맞춘다.
    */

    renderPostFolderTree();


    return;

  }


  const nodeKind =
    item.dataset.nodeKind;


  const nodeId =
    item.dataset.nodeId;


  const targetContainer =
    evt.to;


  const targetFolderId =
    targetContainer.dataset.folderId ||
    null;


  const prev =
    item.previousElementSibling;


  const next =
    item.nextElementSibling;


  const snapshot =
    snapshotPostFolderState();


  postFolderMoveInFlight =
    true;


  /* 2) 로컬 상태를 화면과 같게 먼저 맞춘다 */

  applyPostFolderLocalMove(
    nodeKind,
    nodeId,
    targetFolderId
  );


  applyPostFolderDomOrder(
    targetContainer
  );


  const {
    data,
    error
  } =
    await rpcMoveTreeNode({
      nodeKind,
      nodeId,
      targetFolderId,

      prevKind:
        prev
          ? prev.dataset.nodeKind
          : null,

      prevId:
        prev
          ? prev.dataset.nodeId
          : null,

      nextKind:
        next
          ? next.dataset.nodeKind
          : null,

      nextId:
        next
          ? next.dataset.nodeId
          : null
    });


  postFolderMoveInFlight =
    false;


  if (error) {

    console.error(
      "[posts-folder-sortable] move_tree_node 실패",
      error
    );


    /* 5) 되돌리고 6) 재조회 */

    restorePostFolderState(
      snapshot
    );


    renderPostFolderTree();


    setPostFolderTreeMessage(
      describePostFolderError(
        error,
        "순서를 저장하지 못했습니다. 화면을 되돌렸습니다."
      )
    );


    await reloadPostFolderManageData();


    return;

  }


  /* 4) 서버가 확정한 컨테이너 순서로 로컬 상태를 맞춘다 */

  applyPostFolderContainerOrder(
    data
  );


  invalidateCategoryPageCache(
    currentPostCategoryId
  );


  setPostFolderTreeMessage(
    ""
  );


  /*
    글 이동은 다시 그리지 않는다 — DOM은 이미 사용자가 놓은
    그대로이고, 다시 그리면 펼침 상태와 스크롤이 튄다. 로컬
    상태(위 두 줄)만 서버와 맞춰 두면 다음 렌더에서도 같은
    화면이 나온다.

    폴더 이동은 다시 그린다. 폴더가 옮겨지면 그 폴더와 자손들의
    depth가 바뀌는데, 화면에는 각 컨테이너의 data-container-depth와
    각 폴더의 data-subtree-height가 그대로 남아 있다. 그 값으로
    다음 drop 판정(canDropPostFolderNode)을 하므로, 낡은 채로 두면
    4단계가 되는 자리를 "놓을 수 있다"고 잘못 보여주게 된다
    (서버는 여전히 거절하지만, 거절당할 자리를 보여주지 않는 게
    이 판정의 목적이다). 펼침 상태는 postFolderCollapsedIds에
    남아 있어 다시 그려도 유지된다.
  */

  if (nodeKind === "folder") {

    renderPostFolderTree();

  }

}


/* =========================================================
   로컬 상태 반영 헬퍼
========================================================== */

function applyPostFolderLocalMove(
  nodeKind,
  nodeId,
  targetFolderId
) {

  const nextParent =
    targetFolderId === null ||
    targetFolderId === ""
      ? null
      : Number(targetFolderId);


  if (nodeKind === "folder") {

    const row =
      postFolderRows.find(
        candidate =>
          String(candidate.id) ===
          String(nodeId)
      );


    if (row) {

      row.parent_id =
        nextParent;

    }


    return;

  }


  const post =
    (currentCategoryPosts || []).find(
      candidate =>
        String(candidate.id) ===
        String(nodeId)
    );


  if (post) {

    post.folder_id =
      nextParent;

  }

}


/*
  화면에 보이는 컨테이너 순서를 그대로 로컬 sort_order에 임시로
  적어 둔다. 서버 응답이 오면 그 값으로 다시 덮어쓰므로 여기서는
  "순서만 맞으면" 충분하다.
*/

function applyPostFolderDomOrder(
  containerEl
) {

  const nodes =
    Array.from(
      containerEl.children
    ).filter(
      child =>
        child.classList &&
        child.classList.contains(
          "folder-node"
        )
    );


  applyPostFolderContainerOrder(
    nodes.map(
      node => ({
        kind: node.dataset.nodeKind,
        id: node.dataset.nodeId
      })
    )
  );

}
