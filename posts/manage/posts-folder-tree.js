/* =========================================================
   POSTS MANAGE - 폴더 트리 렌더 (FOLDER-1)

   ?manage=1(또는 Skin 위의 edit 토글)로 열리는 카테고리 관리
   화면의 본문을 그린다. 기존 관리 화면의 두 기능 — 글 체크박스와
   하단 선택삭제 바 — 은 그대로 살아 있고, 그 위에 폴더 계층과
   drag handle이 얹힌다(사용자 결정 F-2: 정리 모드/삭제 모드를
   따로 만들지 않는다).

   의존(classic script, 이 파일보다 먼저 로드돼야 함):
   posts/manage/posts-folder-data.js, posts/editor/posts-refs.js,
   posts/posts-format.js(applyPostVisibilityTitle/formatPostListDate),
   posts/view/posts-view-list-select.js(togglePostSelection /
   updatePostListSelectBar)는 이 파일보다 **뒤에** 로드돼도 되지만
   (호출 시점에만 필요), posts-view-list.js의 renderPostListItems()가
   이 파일의 renderPostFolderTree()를 부르므로 로드 목록에서는
   posts-view-list.js보다 앞에 둔다.

   이 파일은 DOM만 만든다 — drag 배선은 posts-folder-sortable.js,
   조회/RPC는 posts-folder-data.js.
========================================================== */


/*
  트리 렌더 직후 사용자에게 짧게 보여주는 메시지(저장 실패 등).
  다음 렌더까지만 살아 있다.
*/
let postFolderTreeMessage =
  "";


function setPostFolderTreeMessage(
  text
) {

  postFolderTreeMessage =
    text ||
    "";


  const el =
    postList
      ? postList.querySelector(
          ".folder-tree-message"
        )
      : null;


  if (el) {

    el.textContent =
      postFolderTreeMessage;


    el.hidden =
      !postFolderTreeMessage;

  }

}


/* =========================================================
   렌더 진입점

   posts-view-list.js의 renderPostListItems()가 관리 모드에서
   이 함수를 부른다. 폴더 행이 아직 이 카테고리 것으로 준비되지
   않았으면 false를 돌려주고, 호출자는 기존 평면 목록을 그대로
   그린다 — 폴더 조회가 실패해도 관리 화면 자체는 열린다.
========================================================== */

function renderPostFolderTree() {

  if (!postList) {

    return false;

  }


  if (
    postFolderRowsCategoryId === null ||
    Number(postFolderRowsCategoryId) !==
      Number(currentPostCategoryId)
  ) {

    return false;

  }


  const rootChildren =
    buildPostFolderTree(
      postFolderRows,
      currentCategoryPosts
    );


  /*
    DOM을 비우기 전에 Sortable 인스턴스를 먼저 정리한다 — 떨어져
    나간 엘리먼트를 붙들고 있는 인스턴스가 남지 않게 한다.
  */

  if (
    typeof destroyPostFolderSortables ===
    "function"
  ) {

    destroyPostFolderSortables();

  }


  postList.innerHTML =
    "";


  const tree =
    document.createElement(
      "div"
    );


  tree.className =
    "folder-tree";


  tree.append(
    createPostFolderToolbar(),
    createPostFolderContainer(
      null,
      0,
      rootChildren
    )
  );


  postList.appendChild(
    tree
  );


  setPostFolderTreeMessage(
    postFolderTreeMessage
  );


  /*
    drag 배선은 렌더가 끝난 뒤에 붙인다. SortableJS를 아직 못
    불러왔다면 이 함수가 없을 수 있는데, 그때도 트리 자체는
    정상적으로 보이고 폴더 CRUD와 선택삭제는 그대로 쓸 수 있다.
  */

  if (
    typeof attachPostFolderSortables ===
    "function"
  ) {

    attachPostFolderSortables(
      tree
    );

  }


  return true;

}


/* =========================================================
   툴바 — root 폴더 만들기 + 메시지 자리
========================================================== */

function createPostFolderToolbar() {

  const toolbar =
    document.createElement(
      "div"
    );


  toolbar.className =
    "folder-tree-toolbar";


  const addButton =
    document.createElement(
      "button"
    );


  addButton.type =
    "button";


  addButton.className =
    "folder-tree-add-button";


  addButton.textContent =
    "+ folder";


  addButton.addEventListener(
    "click",
    () => {

      createPostFolderFromPrompt(
        null
      );

    }
  );


  const message =
    document.createElement(
      "p"
    );


  message.className =
    "folder-tree-message";


  message.setAttribute(
    "role",
    "status"
  );


  message.hidden =
    true;


  toolbar.append(
    addButton,
    message
  );


  return toolbar;

}


/* =========================================================
   컨테이너 — 하나의 정렬 공간(root 또는 폴더 안)

   data-folder-id: 이 컨테이너가 속한 폴더 id(root면 빈 문자열)
   data-container-depth: 이 컨테이너에 놓인 항목의 depth
     (root = 0이므로 여기 놓이는 폴더는 depth 1)

   drag 배선(posts-folder-sortable.js)이 이 두 값으로 "여기에
   떨어뜨려도 되는가"를 판단한다.
========================================================== */

function createPostFolderContainer(
  folderId,
  containerDepth,
  children
) {

  const container =
    document.createElement(
      "div"
    );


  container.className =
    "folder-tree-container";


  container.dataset.folderId =
    folderId === null ||
    folderId === undefined
      ? ""
      : String(folderId);


  container.dataset.containerDepth =
    String(containerDepth);


  (children || []).forEach(
    node => {

      container.appendChild(
        node.kind === "folder"
          ? createPostFolderNode(node)
          : createPostFolderPostNode(node)
      );

    }
  );


  return container;

}


/* =========================================================
   폴더 행
========================================================== */

function createPostFolderNode(
  node
) {

  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "folder-node folder-node--folder";


  wrapper.dataset.nodeKind =
    "folder";


  wrapper.dataset.nodeId =
    node.id;


  /*
    이 폴더를 통째로 옮겼을 때 아래로 몇 단계가 더 따라오는지.
    drag 중에 "여기 놓으면 4단계가 된다"를 즉시 막는 데 쓴다
    (서버도 같은 검사를 하지만, 놓을 수 없는 자리를 애초에
    보여주지 않는 편이 낫다).
  */

  wrapper.dataset.subtreeHeight =
    String(
      node.subtreeHeight ||
      0
    );


  const collapsed =
    postFolderCollapsedIds.has(
      node.id
    );


  if (collapsed) {

    wrapper.classList.add(
      "folder-node--collapsed"
    );

  }


  const row =
    document.createElement(
      "div"
    );


  row.className =
    "folder-row";


  const handle =
    document.createElement(
      "span"
    );


  handle.className =
    "tree-drag-handle";


  handle.textContent =
    "≡";


  handle.setAttribute(
    "aria-hidden",
    "true"
  );


  const toggle =
    document.createElement(
      "button"
    );


  toggle.type =
    "button";


  toggle.className =
    "folder-toggle";


  toggle.textContent =
    collapsed
      ? "▸"
      : "▾";


  toggle.setAttribute(
    "aria-expanded",
    String(!collapsed)
  );


  toggle.setAttribute(
    "aria-label",
    `${node.row.name} 펼치기/접기`
  );


  toggle.addEventListener(
    "click",
    () => {

      if (
        postFolderCollapsedIds.has(
          node.id
        )
      ) {

        postFolderCollapsedIds.delete(
          node.id
        );

      }

      else {

        postFolderCollapsedIds.add(
          node.id
        );

      }


      renderPostFolderTree();

    }
  );


  const name =
    document.createElement(
      "span"
    );


  name.className =
    "folder-name";


  name.textContent =
    node.row.name;


  const actions =
    document.createElement(
      "span"
    );


  actions.className =
    "folder-row-actions";


  /*
    3단계 폴더 안에는 폴더를 더 만들 수 없다 — 버튼 자체를
    비활성화해서 눌러 보고 나서야 거절당하는 일이 없게 한다.
    (DB도 같은 규칙을 강제한다.)
  */

  const canAddChild =
    node.depth < 3;


  actions.append(
    createPostFolderActionButton(
      "＋",
      "하위 폴더 추가",
      () => createPostFolderFromPrompt(node.id),
      !canAddChild
    ),
    createPostFolderActionButton(
      "rename",
      "폴더 이름 수정",
      () => renamePostFolderFromPrompt(node)
    ),
    createPostFolderActionButton(
      "delete",
      "폴더 삭제",
      () => deletePostFolderWithConfirm(node)
    )
  );


  row.append(
    handle,
    toggle,
    name,
    actions
  );


  const childContainer =
    createPostFolderContainer(
      node.id,
      node.depth,
      node.children
    );


  childContainer.hidden =
    collapsed;


  wrapper.append(
    row,
    childContainer
  );


  return wrapper;

}


function createPostFolderActionButton(
  label,
  ariaLabel,
  onClick,
  disabled
) {

  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";


  button.className =
    "folder-action-button";


  button.textContent =
    label;


  button.setAttribute(
    "aria-label",
    ariaLabel
  );


  button.title =
    ariaLabel;


  if (disabled) {

    button.disabled =
      true;

  }


  button.addEventListener(
    "click",
    event => {

      event.stopPropagation();


      onClick();

    }
  );


  return button;

}


/* =========================================================
   글 행

   기존 관리 화면의 항목과 같은 클래스(post-list-item /
   post-list-item-checkbox / post-list-title / post-list-date)를
   그대로 쓴다 — 기존 CSS와 선택삭제 동작을 그대로 물려받기
   위함이다. 달라진 것은 앞에 붙는 drag handle 하나뿐이다.
========================================================== */

function createPostFolderPostNode(
  node
) {

  const post =
    node.row;


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "folder-node folder-node--post";


  wrapper.dataset.nodeKind =
    "post";


  wrapper.dataset.nodeId =
    node.id;


  const row =
    document.createElement(
      "div"
    );


  row.className =
    "post-list-item folder-post-row";


  row.dataset.postId =
    post.id;


  const handle =
    document.createElement(
      "span"
    );


  handle.className =
    "tree-drag-handle";


  handle.textContent =
    "≡";


  handle.setAttribute(
    "aria-hidden",
    "true"
  );


  const checkbox =
    document.createElement(
      "input"
    );


  checkbox.type =
    "checkbox";


  checkbox.className =
    "post-list-item-checkbox";


  checkbox.checked =
    selectedPostIdsForDelete.has(
      post.id
    );


  /*
    체크 상태만 바뀌는 경우에는 트리를 다시 그리지 않는다 —
    다시 그리면 펼침 상태와 Sortable 인스턴스가 통째로 날아가고,
    스크롤 위치도 튄다. 기존 평면 목록은 매번 다시 그렸지만
    여기서는 그럴 이유가 없다.
  */

  const syncSelection =
    () => {

      if (
        selectedPostIdsForDelete.has(
          post.id
        )
      ) {

        selectedPostIdsForDelete.delete(
          post.id
        );

      }

      else {

        selectedPostIdsForDelete.add(
          post.id
        );

      }


      checkbox.checked =
        selectedPostIdsForDelete.has(
          post.id
        );


      row.classList.toggle(
        "post-list-item--selected",
        checkbox.checked
      );


      updatePostListSelectBar();

    };


  checkbox.addEventListener(
    "click",
    event => {

      event.stopPropagation();


      syncSelection();

    }
  );


  const title =
    document.createElement(
      "span"
    );


  title.className =
    "post-list-title";


  applyPostVisibilityTitle(
    title,
    post.visibility,
    post.title
  );


  const date =
    document.createElement(
      "span"
    );


  date.className =
    "post-list-date";


  date.textContent =
    formatPostListDate(
      post.created_at
    );


  row.append(
    handle,
    checkbox,
    title,
    date
  );


  row.classList.toggle(
    "post-list-item--selected",
    checkbox.checked
  );


  /*
    행 아무 데나 눌러도 선택이 토글된다(기존 관리 화면과 동일).
    handle과 checkbox는 각자 처리하므로 여기서 걸러낸다.
  */

  row.addEventListener(
    "click",
    event => {

      if (
        event.target === checkbox ||
        event.target === handle
      ) {

        return;

      }


      syncSelection();

    }
  );


  wrapper.appendChild(
    row
  );


  return wrapper;

}


/* =========================================================
   폴더 CRUD

   전부 RPC 한 번 + 재조회 + 재렌더다. 낙관적 업데이트를 쓰지
   않는다 — drag와 달리 사용자가 결과를 기다리는 동작이고,
   중간 상태를 만들 이유가 없다.
========================================================== */

async function createPostFolderFromPrompt(
  parentId
) {

  const name =
    (
      window.prompt(
        parentId
          ? "새 하위 폴더 이름"
          : "새 폴더 이름",
        "새 폴더"
      ) ||
      ""
    ).trim();


  if (!name) {

    return;

  }


  const {
    error
  } =
    await rpcCreatePostFolder(
      currentPostCategoryId,
      parentId,
      name
    );


  if (error) {

    console.error(
      "[posts-folder-tree] create_post_folder 실패",
      error
    );


    setPostFolderTreeMessage(
      describePostFolderError(
        error,
        "폴더를 만들지 못했습니다."
      )
    );


    return;

  }


  /*
    새로 만든 폴더는 펼친 상태로 둔다 — 만들자마자 접혀 있으면
    어디에 생겼는지 보이지 않는다(접힘 목록에 넣지 않으면 기본이
    펼침이므로 따로 할 일은 없다).
  */

  await reloadPostFolderManageData();

}


async function renamePostFolderFromPrompt(
  node
) {

  const name =
    (
      window.prompt(
        "폴더 이름",
        node.row.name
      ) ||
      ""
    ).trim();


  if (
    !name ||
    name === node.row.name
  ) {

    return;

  }


  const {
    error
  } =
    await rpcRenamePostFolder(
      node.id,
      name
    );


  if (error) {

    console.error(
      "[posts-folder-tree] rename_post_folder 실패",
      error
    );


    setPostFolderTreeMessage(
      describePostFolderError(
        error,
        "이름을 바꾸지 못했습니다."
      )
    );


    return;

  }


  await reloadPostFolderManageData();

}


async function deletePostFolderWithConfirm(
  node
) {

  const childCount =
    (node.children || []).length;


  const question =
    childCount > 0
      ? `"${node.row.name}" 폴더를 삭제할까요?\n안에 있는 ${childCount}개 항목은 삭제되지 않고 이 폴더가 있던 자리로 올라옵니다.`
      : `"${node.row.name}" 폴더를 삭제할까요?`;


  if (
    !window.confirm(
      question
    )
  ) {

    return;

  }


  const {
    error
  } =
    await rpcDeletePostFolder(
      node.id
    );


  if (error) {

    console.error(
      "[posts-folder-tree] delete_post_folder 실패",
      error
    );


    setPostFolderTreeMessage(
      describePostFolderError(
        error,
        "폴더를 삭제하지 못했습니다."
      )
    );


    return;

  }


  postFolderCollapsedIds.delete(
    node.id
  );


  await reloadPostFolderManageData();

}


/* =========================================================
   재조회 + 재렌더

   폴더 삭제는 글의 folder_id도 바꾸므로(승격) 폴더만 다시
   읽으면 안 된다 — 글 목록도 함께 다시 읽고, 카테고리 캐시도
   지워서 이 화면을 벗어났다가 돌아왔을 때 낡은 배치가 되살아
   나지 않게 한다.
========================================================== */

async function reloadPostFolderManageData() {

  const categoryId =
    currentPostCategoryId;


  if (
    categoryId === null ||
    categoryId === undefined
  ) {

    return;

  }


  await Promise.all([
    loadPostFolderRows(
      categoryId
    ),
    reloadCategoryPostsForManage(
      categoryId
    )
  ]);


  invalidateCategoryPageCache(
    categoryId
  );


  /*
    renderPostFolderTree()를 직접 부르지 않고 목록 렌더 진입점을
    거친다 — 그 사이 사용자가 관리 모드를 껐다면 트리가 아니라
    평면 목록이 나와야 한다.
  */

  renderPostListItems();

}


/* =========================================================
   오류 메시지

   DB가 돌려준 문구를 그대로 노출하지 않는다(영문 + 내부 id가
   섞여 있다). 우리가 아는 상황만 한국어로 바꾸고, 나머지는
   호출자가 준 기본 문구를 쓴다.
========================================================== */

function describePostFolderError(
  error,
  fallback
) {

  const raw =
    String(
      (error && (error.message || error.details)) ||
      ""
    );


  if (
    raw.includes(
      "maximum folder depth"
    ) ||
    raw.includes(
      "exceed maximum depth"
    )
  ) {

    return "폴더는 3단계까지만 만들 수 있습니다.";

  }


  if (
    raw.includes(
      "into itself"
    ) ||
    raw.includes(
      "own descendant"
    ) ||
    raw.includes(
      "cycle"
    )
  ) {

    return "폴더를 자기 자신이나 그 안의 폴더로 옮길 수 없습니다.";

  }


  if (
    raw.includes(
      "another user"
    ) ||
    raw.includes(
      "authentication required"
    )
  ) {

    return "권한이 없습니다. 다시 로그인해 주세요.";

  }


  return fallback;

}
