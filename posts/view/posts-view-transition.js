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
   PUBLISHED SKIN 전환 대기 표시

   CATEGORY/POST가 published Skin 후보(getSiteOwner()가
   scoped && ownerId — 실제로 Skin이 렌더될지, 지금 보는 사람이
   owner 본인인지는 아직 모른다, 그 최종 판정은 각자
   tryRenderPublishedSkinCategory/tryRenderPublishedSkinPost가
   한다)일 때, posts-view-list.js/posts-view-detail.js는 legacy
   "..."/"loading..." 화면과 post-header를 즉시 그리는 대신
   이 대기 표시를 쓴다 — 이전 화면을 그대로 둔 채 기다리다가,
   응답이 오래 걸릴 때만 잠깐 나타나는 작은 스피너 하나로
   대체한다(posts-base.css .post-pending-indicator,
   pointer-events:none이라 그 아래 화면을 조작해 중복 이동을
   유발하지 않는다).

   isStillCurrent()는 타이머가 실제로 발동하는 시점에 이 전환이
   여전히 최신 요청인지(더 빠른 다른 클릭/뒤로가기로 이미
   추월되지 않았는지 — categoryPageRequestSeq/currentPostId 등
   호출자가 가진 판정 기준을 그대로 넘겨받는다) 다시 확인하는
   콜백이다 — 추월됐으면 스피너를 띄우지 않는다(어차피 곧
   clearPendingIndicator가 정리하지만, 추월된 요청이 뒤늦게
   화면에 아무것도 안 보여야 할 때 잠깐이라도 스피너가 끼어드는
   것 자체를 막는다).
========================================================== */

const PENDING_INDICATOR_DELAY_MS =
  300;


function schedulePendingIndicator(
  isStillCurrent
) {

  return setTimeout(
    () => {

      if (
        postPendingIndicator &&
        isStillCurrent()
      ) {

        postPendingIndicator.hidden =
          false;

      }

    },
    PENDING_INDICATOR_DELAY_MS
  );

}


function clearPendingIndicator(
  timerId
) {

  clearTimeout(
    timerId
  );


  if (postPendingIndicator) {

    postPendingIndicator.hidden =
      true;

  }

}


/*
  postPendingIndicator는 CATEGORY/POST 전체가 공유하는 단일
  엘리먼트다 — 추월당해 더 이상 최신이 아닌 요청이 여기서
  clearPendingIndicator()를 그대로 불러버리면, 그 사이 새로
  시작된 요청이 이미 띄워 둔 스피너를 잘못 꺼버릴 수 있다.
  isStillCurrent() 검사 안에서 걸린 자기 자신의 타이머는(위
  schedulePendingIndicator) 발동 시점에 스스로 막히므로, 추월된
  요청은 그저 자신의 타이머만 취소하면 충분하다 — 공유 엘리먼트는
  건드리지 않는다.
*/

function cancelPendingIndicator(
  timerId
) {

  clearTimeout(
    timerId
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



