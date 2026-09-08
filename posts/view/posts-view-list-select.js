/* =========================================================
   POSTS VIEW - LIST 편집 모드(선택 삭제)

   posts-view-list.js 계열 분할본. DOM 참조/상태
   (postListEditToggleButton, postListSelectBar,
   selectedPostIdsForDelete, currentCategoryPosts 등)는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야
   함). createPostListItem/renderPostListItems은
   posts-view-list.js에 있음(이 파일보다 먼저 로드돼야 함).

   글 카테고리에서 "edit"을 누르면 글 목록이 링크(<a>) 대신
   체크박스 달린 항목으로 바뀌고, 여러 개 선택해서 한 번에
   삭제할 수 있다. 순서 변경은 아직 없음(따로 논의 후 추가
   예정).
========================================================== */


/* =========================================================
   EDIT 모드 토글
========================================================== */

async function togglePostListEditMode() {

  postListEditModeOn =
    !postListEditModeOn;


  selectedPostIdsForDelete =
    new Set();


  postListEditToggleButton
    ?.setAttribute(
      "aria-pressed",
      String(
        postListEditModeOn
      )
    );


  if (
    postListSelectBar
  ) {

    postListSelectBar.hidden =
      !postListEditModeOn;

  }


  updatePostListSelectBar();


  /*
    FOLDER-1: 관리 화면을 켜는 순간 폴더 행을 읽어 둔다 — 트리
    렌더는 동기 함수라 여기서 기다려야 첫 화면부터 폴더가 함께
    보인다. 끌 때는 읽을 필요가 없다(스킨 목록으로 돌아간다).
    조회에 실패하면 rows가 준비되지 않은 채로 남고, 기존 평면
    관리 목록이 그대로 그려진다.
  */

  if (
    postListEditModeOn &&
    typeof loadPostFolderRows === "function" &&
    currentPostCategoryId !== null &&
    currentPostCategoryId !== undefined
  ) {

    await loadPostFolderRows(
      currentPostCategoryId
    );

  }


  if (!categorySkinActive) {

    renderPostListItems();


    return;

  }


  /*
    PHASE 1E — Skin 목록 위에서의 관리 (배너와 같은 패턴)

    켤 때: Skin 목록을 접고 그 자리에 기존 관리 목록(선택 삭제)을
    연다. 목록을 "legacy로 되돌려 두는" 게 아니라 사용자가 명시적으로
    열고 닫는 관리 화면이다 — 추가/편집모드/선택바 기능은 하나도
    바뀌지 않고 그대로 쓰인다.

    끌 때: 곧바로 그 카테고리의 Skin으로 돌아간다(방금 삭제한 결과가
    반영된 채로).
  */

  if (postListEditModeOn) {

    enterCategoryManageScreen();


    return;

  }


  await restoreCategorySkinList();

}


/*
  Skin 목록 -> legacy 관리 목록. Skin이 쓰던 mount contract
  클래스(posts/posts-base.css)를 걷어내야 관리 목록이 기존 여백/
  헤더 안에서 정상적으로 보인다.
*/

function enterCategoryManageScreen() {

  if (postContainer) {

    postContainer.classList.remove(
      "post-container--skin-active"
    );


    postContainer.classList.remove(
      "post-container--owner-tools"
    );

  }


  if (postArea) {

    postArea.classList.remove(
      "post-area--skin-active"
    );

  }


  renderPostListItems();

}


/*
  Skin 목록을 다시 그린다. 별도 렌더 경로를 새로 만들지 않고
  openCategoryPage()를 그대로 다시 태운다(배너의
  restoreBannerSkinList와 같은 이유) — URL은 이미 이 카테고리를
  가리키므로 history를 건드리지 않는다.
*/

async function restoreCategorySkinList() {

  if (
    !categorySkinActive ||
    currentPostCategoryId === null ||
    currentPostCategoryId === undefined
  ) {

    return false;

  }


  await openCategoryPage(
    currentPostCategoryId,
    {
      updateUrl:
        false
    }
  );


  return true;

}



/* =========================================================
   선택 가능한 아이템 (편집 모드)
========================================================== */

function createSelectablePostListItem(
  post
) {

  const item =
    document.createElement(
      "div"
    );


  item.className =
    "post-list-item";


  item.dataset.postId =
    post.id;


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


  checkbox.addEventListener(
    "click",
    event => {

      event.stopPropagation();


      togglePostSelection(
        post.id
      );

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


  item.append(
    checkbox,
    title,
    date
  );


  item.addEventListener(
    "click",
    () => {

      togglePostSelection(
        post.id
      );

    }
  );


  return item;

}


function togglePostSelection(
  postId
) {

  if (
    selectedPostIdsForDelete.has(
      postId
    )
  ) {

    selectedPostIdsForDelete.delete(
      postId
    );

  }

  else {

    selectedPostIdsForDelete.add(
      postId
    );

  }


  updatePostListSelectBar();


  renderPostListItems();

}



/* =========================================================
   선택 삭제 바 업데이트
========================================================== */

function updatePostListSelectBar() {

  if (
    postListSelectCount
  ) {

    postListSelectCount.textContent =
      `${selectedPostIdsForDelete.size}개 선택됨`;

  }


  if (
    postListSelectDeleteButton
  ) {

    postListSelectDeleteButton.disabled =
      selectedPostIdsForDelete.size === 0;

  }

}



/* =========================================================
   선택 삭제 실행
========================================================== */

async function deleteSelectedPosts() {

  if (
    selectedPostIdsForDelete.size === 0
  ) {
    return;
  }


  const count =
    selectedPostIdsForDelete.size;


  if (
    !confirm(
      `선택한 글 ${count}개를 삭제할까요? 되돌릴 수 없습니다.`
    )
  ) {
    return;
  }


  const user =
    await getSignedInUser();


  if (!user) {
    return;
  }


  if (
    postListSelectDeleteButton
  ) {

    postListSelectDeleteButton.disabled =
      true;

  }


  const {
    error
  } =
    await supabaseClient
      .from(
        "posts"
      )
      .delete()
      .in(
        "id",
        Array.from(
          selectedPostIdsForDelete
        )
      )
      .eq(
        "user_id",
        user.id
      );


  if (error) {

    console.error(
      error
    );


    if (
      postListSelectDeleteButton
    ) {

      postListSelectDeleteButton.disabled =
        false;

    }


    return;

  }


  currentCategoryPosts =
    currentCategoryPosts.filter(
      post =>
        !selectedPostIdsForDelete.has(
          post.id
        )
    );


  invalidateCategoryPageCache(
    currentPostCategoryId
  );


  selectedPostIdsForDelete =
    new Set();


  updatePostListSelectBar();


  renderPostListItems();

}
