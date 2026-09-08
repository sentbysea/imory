/* =========================================================
   POSTS MANAGE - 폴더 트리 렌더 (FOLDER-1)

   ?manage=1(또는 Skin 위의 edit 토글)로 열리는 카테고리 관리
   화면의 본문을 그린다.

   FOLDER-1 후속(관리 UI 정리): 기본 상태는 "정리"다 — drag handle
   ≡만 보이고 체크박스도 하단 선택삭제 바도 없다. 상단 툴바의
   − delete를 눌러 삭제 모드로 들어갔을 때만 각 글 행의 ≡ 바로
   옆에 체크박스가 붙고, 하나 이상 고르면 기존 하단 선택삭제 바가
   나타난다. 삭제 자체는 기존 deleteSelectedPosts()를 그대로 쓴다
   (새 삭제 경로를 만들지 않는다). 예전 F-2(정리 모드와 삭제 모드를
   나누지 않는다)는 이 라운드에서 철회됐다.

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


/*
  삭제 모드(체크박스 + 하단 선택삭제 바)가 켜져 있는가.

  관리 세션 안에서만 사는 화면 상태다 — 관리 화면을 새로 열
  때마다 꺼진 채로 시작한다(resetPostFolderDeleteMode를 부르는
  posts-view-list.js / posts-view-list-select.js).
*/
let postFolderDeleteModeOn =
  false;


function isPostFolderDeleteModeOn() {

  return postFolderDeleteModeOn;

}


/*
  지금 화면에 폴더 트리가 그려져 있는가. 하단 선택삭제 바의 표시
  규칙이 트리(삭제 모드에서 고른 게 있을 때만)와 기존 평면 관리
  목록(관리 모드면 항상)에서 다르므로 그 판정에 쓴다
  (posts/view/posts-view-list-select.js).
*/

function isPostFolderTreeActive() {

  return Boolean(
    postList &&
    postList.querySelector(
      ".folder-tree"
    )
  );

}


/*
  관리 화면 진입 시 호출 — 모드와 선택을 함께 비운다. 트리를
  다시 그리지는 않는다(부르는 쪽이 곧 그린다).
*/

function resetPostFolderDeleteMode() {

  postFolderDeleteModeOn =
    false;


  selectedPostIdsForDelete =
    new Set();

}


/*
  삭제 모드 전환. 모드를 빠져나가면 선택을 비우고(체크가 남아
  있다가 다음에 되살아나지 않게) 트리를 다시 그려 체크박스를
  붙이거나 걷어낸다. 하단 바는 updatePostListSelectBar()가 정한다.
*/

function setPostFolderDeleteMode(
  on
) {

  const next =
    Boolean(on);


  if (
    next === postFolderDeleteModeOn
  ) {

    return;

  }


  postFolderDeleteModeOn =
    next;


  if (!postFolderDeleteModeOn) {

    selectedPostIdsForDelete =
      new Set();

  }


  renderPostFolderTree();

}


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


  /*
    하단 선택삭제 바의 표시 규칙은 트리가 실제로 그려진 뒤에야
    적용할 수 있다(isPostFolderTreeActive) — 여기서 한 번 맞춘다.
  */

  if (
    typeof updatePostListSelectBar ===
    "function"
  ) {

    updatePostListSelectBar();

  }


  return true;

}


/* =========================================================
   툴바 — 이 화면의 유일한 관리 action

     + folder   폴더 만들기
     + post     글 쓰기(기존 진입점 openNewPostEditor 그대로)
     − delete   삭제 모드 켜기 / 끄기(cancel)
     done       관리 화면 나가기

   legacy 헤더의 떠 있는 edit / ＋ 는 이 화면에서 감춘다
   (posts/view/posts-view-transition.js의 updatePostAddButton) —
   같은 일을 하는 진입점이 화면에 둘 있으면 어느 쪽이 "지금"의
   관리 도구인지 알 수 없다. done이 그 자리를 대신하는 유일한
   나가기 경로이므로 툴바에서 빼지 않는다.
========================================================== */

function createPostFolderToolbar() {

  const toolbar =
    document.createElement(
      "div"
    );


  toolbar.className =
    "folder-tree-toolbar";


  if (postFolderDeleteModeOn) {

    toolbar.classList.add(
      "folder-tree-toolbar--delete"
    );

  }


  const addFolderButton =
    createPostFolderToolbarButton(
      "+ folder",
      "폴더 추가",
      () => {

        createPostFolderFromPrompt(
          null
        );

      }
    );


  /*
    기존 e2e(posts/posts-folder-manage-e2e-test.mjs)와 이 화면을
    가리키는 다른 코드가 쓰는 이름이라 그대로 둔다.
  */

  addFolderButton.classList.add(
    "folder-tree-add-button"
  );


  const addPostButton =
    createPostFolderToolbarButton(
      "+ post",
      "글 쓰기",
      () => {

        /*
          플랫폼의 ＋ 와 같은 진입점을 그대로 부른다 — 관리 화면
          전용 작성 경로를 새로 만들지 않는다
          (posts/view/posts-view-editor-load.js).
        */

        openNewPostEditor(
          currentPostCategoryId
        );

      }
    );


  addPostButton.classList.add(
    "folder-tree-write-button"
  );


  const deleteModeButton =
    createPostFolderToolbarButton(
      postFolderDeleteModeOn
        ? "cancel"
        : "− delete",
      postFolderDeleteModeOn
        ? "삭제 모드 끄기"
        : "글 선택 삭제",
      () => {

        setPostFolderDeleteMode(
          !postFolderDeleteModeOn
        );

      }
    );


  deleteModeButton.classList.add(
    "folder-tree-delete-button"
  );


  deleteModeButton.setAttribute(
    "aria-pressed",
    String(postFolderDeleteModeOn)
  );


  const doneButton =
    createPostFolderToolbarButton(
      "done",
      "관리 마치기",
      () => {

        exitPostFolderManageScreen();

      }
    );


  doneButton.classList.add(
    "folder-tree-done-button"
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
    addFolderButton,
    addPostButton,
    deleteModeButton,
    doneButton,
    message
  );


  return toolbar;

}


function createPostFolderToolbarButton(
  label,
  ariaLabel,
  onClick
) {

  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";


  button.className =
    "folder-tree-tool-button";


  button.textContent =
    label;


  button.setAttribute(
    "aria-label",
    ariaLabel
  );


  button.title =
    ariaLabel;


  button.addEventListener(
    "click",
    onClick
  );


  return button;

}


/* =========================================================
   관리 화면 나가기

   ?manage=1을 뗀 같은 카테고리를 다시 연다 — 스킨이 있으면
   스킨으로, 없으면 기존 읽기 목록으로 돌아온다. 별도 복귀
   경로를 만들지 않고 openCategoryPage()를 그대로 다시 태운다
   (restoreCategorySkinList와 같은 이유).
========================================================== */

async function exitPostFolderManageScreen() {

  resetPostFolderDeleteMode();


  postListEditModeOn =
    false;


  if (postListSelectBar) {

    postListSelectBar.hidden =
      true;

  }


  if (
    typeof setCategoryManageScreenActive ===
    "function"
  ) {

    setCategoryManageScreenActive(
      false
    );

  }


  if (
    currentPostCategoryId === null ||
    currentPostCategoryId === undefined
  ) {

    return;

  }


  await openCategoryPage(
    currentPostCategoryId
  );

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


  /*
    자식이 하나도 없으면 접을 것이 없다 — 눌러도 아무 일이
    없는 버튼 대신 비활성으로 둔다(자리는 유지해서 폴더 행의
    이름 위치가 형제들과 어긋나지 않게 한다). 빈 폴더의
    컨테이너는 drop 대상으로 계속 열려 있어야 하므로 접히면
    안 되기도 하다.
  */

  const hasChildren =
    (node.children || []).length > 0;


  if (!hasChildren) {

    toggle.disabled =
      true;


    toggle.classList.add(
      "folder-toggle--empty"
    );

  }


  /*
    접기는 화면에서만 접는 동작이다 — sort_order도 parent_id도
    건드리지 않고, 서버로 나가는 요청도 없다. 트리를 통째로 다시
    그리지 않고 이 폴더의 자식 컨테이너만 여닫는다: 다시 그리면
    Sortable 인스턴스와 스크롤 위치가 통째로 날아간다.
  */

  toggle.addEventListener(
    "click",
    event => {

      event.stopPropagation();


      const nowCollapsed =
        !postFolderCollapsedIds.has(
          node.id
        );


      if (nowCollapsed) {

        postFolderCollapsedIds.add(
          node.id
        );

      }

      else {

        postFolderCollapsedIds.delete(
          node.id
        );

      }


      wrapper.classList.toggle(
        "folder-node--collapsed",
        nowCollapsed
      );


      childContainer.hidden =
        nowCollapsed;


      toggle.textContent =
        nowCollapsed
          ? "▸"
          : "▾";


      toggle.setAttribute(
        "aria-expanded",
        String(!nowCollapsed)
      );

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
   위함이다.

   기본 상태에는 drag handle ≡ 하나만 앞에 붙는다. 체크박스는
   삭제 모드에서만 만들어지고, 그때도 ≡ 바로 옆(관리 action
   영역)에 붙어 제목과 떨어진 독립 컬럼처럼 보이지 않게 한다
   (posts/manage/posts-folder-tree.css).
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


  /*
    체크박스는 삭제 모드에서만 존재한다 — 기본 관리 화면에는
    ≡ 와 제목뿐이다.
  */

  const checkbox =
    postFolderDeleteModeOn
      ? document.createElement(
          "input"
        )
      : null;


  if (checkbox) {

    checkbox.type =
      "checkbox";


    checkbox.className =
      "post-list-item-checkbox";


    checkbox.checked =
      selectedPostIdsForDelete.has(
        post.id
      );


    checkbox.setAttribute(
      "aria-label",
      `${post.title || "제목 없음"} 선택`
    );

  }


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


      const selected =
        selectedPostIdsForDelete.has(
          post.id
        );


      if (checkbox) {

        checkbox.checked =
          selected;

      }


      row.classList.toggle(
        "post-list-item--selected",
        selected
      );


      updatePostListSelectBar();

    };


  if (checkbox) {

    checkbox.addEventListener(
      "click",
      event => {

        event.stopPropagation();


        syncSelection();

      }
    );

  }


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


  if (checkbox) {

    row.classList.add(
      "folder-post-row--selectable"
    );


    row.append(
      handle,
      checkbox,
      title,
      date
    );

  }

  else {

    row.append(
      handle,
      title,
      date
    );

  }


  row.classList.toggle(
    "post-list-item--selected",
    Boolean(checkbox && checkbox.checked)
  );


  /*
    행 아무 데나 눌러도 선택이 토글된다 — 다만 삭제 모드에서만
    이다. 기본 상태의 행은 정렬 대상일 뿐이라 눌러도 아무 일도
    일어나지 않는다. handle과 checkbox는 각자 처리하므로 여기서
    걸러낸다.
  */

  row.addEventListener(
    "click",
    event => {

      if (!postFolderDeleteModeOn) {

        return;

      }


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
