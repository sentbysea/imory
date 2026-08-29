/* =========================================================
   POSTS - VIEW / TRANSITION / EDITOR PREP

   posts.js에서 분리됨(posts-view.js). posts-view.js 자체도
   너무 커져서(2200줄+) 다시 posts/view/ 폴더 안에서 기능별로
   쪼갠 것 중 첫 번째 파일.

   post*(DOM 요소), current*(상태), postCurtainAnimation 등은
   posts/editor/posts-refs.js에 있음 — 그 파일이 이 폴더의
   모든 파일보다 먼저 로드돼야 함(index.html 순서 참고).

   내용: post-area 열기/닫기 애니메이션, 에디터 화면
   준비/숨기기, "새 글" 버튼 상태.
========================================================== */

/* =========================================================
   POST TRANSITION
========================================================== */

async function showPostArea() {

  if (!postArea) {
    return;
  }


  if (
    !postArea.hidden &&
    currentPostView !== "home"
  ) {

    document.body.classList.add(
      "post-mode"
    );

    return;

  }


  if (postCurtainAnimation) {

    postCurtainAnimation.cancel();

    postCurtainAnimation =
      null;

  }


  postArea.classList.remove(
    "is-opening",
    "is-closing",
    "is-visible"
  );


  postArea.style.transition =
    "none";

  postArea.style.opacity =
    "0";

  postArea.style.background =
    "rgba(255, 255, 255, 0.30)";

  postArea.style.backdropFilter =
    "blur(0px)";

  postArea.style.webkitBackdropFilter =
    "blur(0px)";

  postArea.style.pointerEvents =
    "none";


  postArea.hidden =
    false;


  document.body.classList.add(
    "post-mode"
  );


  await new Promise(
    resolve => {

      requestAnimationFrame(
        () => {

          requestAnimationFrame(
            resolve
          );

        }
      );

    }
  );


  postCurtainAnimation =
    postArea.animate(
      [
        {
          opacity: 0,
          background:
            "rgba(255, 255, 255, 0.30)",
          backdropFilter:
            "blur(0px)"
        },

        {
          opacity: 0.48,
          background:
            "rgba(255, 255, 255, 0.68)",
          backdropFilter:
            "blur(1.5px)",
          offset: 0.42
        },

        {
          opacity: 1,
          background:
            "rgba(255, 255, 255, 0.98)",
          backdropFilter:
            "blur(5px)"
        }
      ],
      {
        duration: 380,
        easing: "ease",
        fill: "forwards"
      }
    );


  try {

    await postCurtainAnimation.finished;

  } catch {

    return;

  }


  postArea.style.opacity =
    "1";

  postArea.style.background =
    "rgba(255, 255, 255, 0.98)";

  postArea.style.backdropFilter =
    "blur(5px)";

  postArea.style.webkitBackdropFilter =
    "blur(5px)";

  postArea.style.pointerEvents =
    "auto";


  postCurtainAnimation.cancel();

  postCurtainAnimation =
    null;

}



/* =========================================================
   POST TRANSITION OUT
========================================================== */

async function hidePostAreaCurtain() {

  if (
    !postArea ||
    postArea.hidden
  ) {
    return;
  }


  if (postCurtainAnimation) {

    postCurtainAnimation.cancel();

    postCurtainAnimation =
      null;

  }


  postArea.style.transition =
    "none";

  postArea.style.pointerEvents =
    "none";


  postCurtainAnimation =
    postArea.animate(
      [
        {
          opacity: 1,
          background:
            "rgba(255, 255, 255, 0.98)",
          backdropFilter:
            "blur(5px)"
        },

        {
          opacity: 0.48,
          background:
            "rgba(255, 255, 255, 0.68)",
          backdropFilter:
            "blur(1.5px)",
          offset: 0.58
        },

        {
          opacity: 0,
          background:
            "rgba(255, 255, 255, 0.30)",
          backdropFilter:
            "blur(0px)"
        }
      ],
      {
        duration: 380,
        easing: "ease",
        fill: "forwards"
      }
    );


  try {

    await postCurtainAnimation.finished;

  } catch {

    return;

  }


  postCurtainAnimation.cancel();

  postCurtainAnimation =
    null;


  postArea.hidden =
    true;


  postArea.style.opacity =
    "";

  postArea.style.background =
    "";

  postArea.style.backdropFilter =
    "";

  postArea.style.webkitBackdropFilter =
    "";

  postArea.style.pointerEvents =
    "";


  document.body.classList.remove(
    "post-mode"
  );

}


/* =========================================================
   PREPARE EDITOR
========================================================== */

async function prepareEditorUI() {

  /*
    ★ 방어적 재동기화: editorContentMode 값 자체는 맞아도
    hidden 처리가 어떤 이유로든 어긋나 있을 수 있으니,
    에디터를 열 때마다 항상 한 번 더 강제로 맞춘다.
  */

  setEditorContentMode(
    editorContentMode
  );


  /*
    Vibe는 에디터 열 때마다 다시 읽음.

    QUOTE에서 색을 바꾼 뒤
    새로고침 없이 들어와도 최신값 사용.
  */

  await loadPostStylePreset();


  if (
    postEditorCustomColor
  ) {

    postEditorCustomColor.value =
      getPresetHighlightColor();

  }


  updatePresetHighlightSwatch();

  updateCustomHighlightSwatch();

  updateEditorToolbarState();

  updateEditorPreview();

  closeEditorPreview();

  syncEditorPreviewMode();

}



/* =========================================================
   EDITOR HIDE
========================================================== */

function hidePostEditor() {

  document.body.classList.remove(
    "post-editor-mode"
  );


  closeEditorPreview();


  if (
    postEditor
  ) {

    postEditor.hidden =
      true;

  }


  currentEditorMode =
    null;


  editorSourcePostId =
    null;


  savedEditorRange =
    null;


  if (
    postEditorMessage
  ) {

    postEditorMessage.textContent =
      "";

  }

}



/* =========================================================
   ADD BUTTON
========================================================== */

async function updatePostAddButton() {

  if (postAddButton) {

    postAddButton.hidden =
      true;

  }


  if (
    postListEditToggleButton
  ) {

    postListEditToggleButton.hidden =
      true;

  }


  const user =
    await getSignedInUser();


  const isOwnerViewingCategory =
    Boolean(
      user
    ) &&
    currentPostView ===
      "category";


  if (
    !isOwnerViewingCategory
  ) {
    return;
  }


  if (postAddButton) {

    postAddButton.hidden =
      false;

  }


  /*
    글 목록 편집(선택 삭제)은 배너 카테고리엔 의미가
    없음 — 배너는 자기 전용 edit 버튼(bannerEditToggleButton)
    이 따로 있음.
  */

  if (
    postListEditToggleButton &&
    currentPostCategoryType !==
      "banner"
  ) {

    postListEditToggleButton.hidden =
      false;

  }

}



/* =========================================================
   CLOSE → HOME
========================================================== */

async function closePostArea(
  options = {}
) {

  const {
    updateUrl = true,
    animate = true
  } = options;


  if (updateUrl) {

    history.pushState(
      {
        page: "home"
      },
      "",
      buildPostRoute("/")
    );

  }


  if (animate) {

    await hidePostAreaCurtain();

  }


  else {

    if (postArea) {

      postArea.hidden =
        true;

    }


    document.body.classList.remove(
      "post-mode"
    );

  }


  currentPostView =
    "home";


  currentPostId =
    null;


  currentPostCategoryId =
    null;


  currentPostOwnerId =
    null;


  hidePostEditor();


  if (postList) {

    postList.innerHTML =
      "";

    postList.hidden =
      false;

  }


  if (postDetail) {

    postDetail.hidden =
      true;

  }


  if (postAddButton) {

    postAddButton.hidden =
      true;

  }


  if (postDetailActions) {

    postDetailActions.hidden =
      true;

  }


  if (postRelated) {

    postRelated.hidden =
      true;

  }


  if (postPageTitle) {

    postPageTitle.textContent =
      "";

  }

}



