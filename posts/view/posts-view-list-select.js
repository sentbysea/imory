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

function togglePostListEditMode() {

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


  renderPostListItems();

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
