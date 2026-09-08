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
   POST AREA 즉시 표시/숨김 (published Skin 전용)

   showPostArea()의 흰색 커튼(380ms opacity/background/blur
   페이드인)은 legacy #postDetail/#postList가 "빈 화면에서
   loading… 을 거쳐 채워지는" 전제로 만들어진 연출이다. published
   Skin 화면은 그 전제가 다르다 — 호출자(posts-view-list.js/
   posts-view-detail.js)가 이전 화면을 그대로 둔 채 떨어진
   스크래치 엘리먼트에 완성된 화면을 먼저 그려두고, 준비가 끝난
   뒤에야 #postArea를 드러낸다. 그 순간에 커튼을 한 번 더 페이드인
   시키면 "다 그려진 화면 위에 흰 배경이 서서히 덮였다가 걷히는"
   군더더기 전환이 되므로(실사용자 리포트), Skin 경로에서는 이
   두 함수로 애니메이션 없이 그대로 교체한다.

   legacy/banner 경로는 기존 showPostArea()/hidePostAreaCurtain()을
   그대로 쓴다 — 이 두 함수는 그쪽에서 호출되지 않는다.

   진행 중인 postCurtainAnimation이 있으면 반드시 먼저 취소한다.
   fill:"forwards"라 취소하지 않으면 이전(추월된) 전환의 애니메이션
   결과가 최신 화면 위에 계속 남아 opacity/배경을 덮어쓴다.
   showPostArea()가 await하던 finished Promise는 cancel() 시
   reject되고, 그쪽 코드는 이미 그 경우 즉시 return하도록 되어
   있어(catch { return }) 늦게 도착한 콜백이 최신 화면을 건드리지
   않는다.
========================================================== */

function showPostAreaInstant() {

  if (!postArea) {
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


  /*
    showPostArea()가 남겨 둘 수 있는 인라인 잔재를 전부 비워
    .post-area CSS 기본값으로 되돌린다 — opacity만 1로 명시하면
    이전 전환이 중간에 취소된 경우의 어중간한 값이 남지 않는다.
  */

  postArea.style.transition =
    "none";

  postArea.style.opacity =
    "1";

  postArea.style.background =
    "";

  postArea.style.backdropFilter =
    "";

  postArea.style.webkitBackdropFilter =
    "";

  postArea.style.pointerEvents =
    "auto";


  postArea.hidden =
    false;


  document.body.classList.add(
    "post-mode"
  );

}


function hidePostAreaInstant() {

  if (!postArea) {
    return;
  }


  if (postCurtainAnimation) {

    postCurtainAnimation.cancel();

    postCurtainAnimation =
      null;

  }


  postArea.hidden =
    true;


  postArea.style.transition =
    "";

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


/*
  "이번 화면을 실제로 드러내는" 단 하나의 지점. 호출자는 화면이
  완성된 뒤 이 함수를 부르고, Skin이면 커튼 없이(instant), legacy면
  기존 커튼으로 연다. #postArea가 이미 열려 있으면(CATEGORY→POST처럼
  같은 컨테이너 안에서 이동) showPostArea()가 자체 guard로 즉시
  return하므로 중복 애니메이션이 생기지 않는다.
*/

async function revealPostArea(
  useSkinTransition
) {

  if (!postArea) {
    return;
  }


  if (useSkinTransition) {

    showPostAreaInstant();


    return;

  }


  await showPostArea();

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
   플랫폼 화면(작성 폼 / 카테고리 선택 / 관리 패널) 진입

   Skin이 CATEGORY/POST/BANNER를 그리는 동안 #postContainer /
   #postArea에는 mount contract 클래스가 붙어 있다(posts-base.css) —
   .post-container--skin-active는 legacy 헤더를 숨기고 max-width를
   풀며, .post-area--skin-active는 .post-area의 padding을 0으로
   만들고, --owner-tools는 헤더를 화면 오른쪽 아래 떠 있는 알약으로
   바꾼다. 전부 "Skin이 자기 CSS로 프레임을 정한다"는 전제의 규칙이라,
   그 자리에 플랫폼 자신의 화면(에디터/안내 패널/관리 패널)을 열 때는
   반드시 걷어내야 한다.

   걷어내지 않으면 실제로 이렇게 깨진다:
   - 에디터가 프레임 폭/여백 없이 화면 가장자리에 붙는다.
   - 떠 있는 알약 안의 버튼은 전부 hidden인데 알약 껍데기(테두리+
     배경)만 남아 빈 캡슐이 떠 있다.

   그리고 커튼(showPostArea의 380ms 흰색 페이드)은 쓰지 않는다 —
   이 화면들은 전부 "이미 보고 있던 화면 위에서 명시적으로 연" 것이라
   빈 화면을 채우는 연출이 필요 없다. #postArea가 아직 닫혀 있었으면
   (HOME에서 곧장 WRITE) 애니메이션 없이 그 자리에서 연다.

   Skin 화면으로 돌아가는 복원은 각 화면의 기존 경로가 그대로
   한다(openCategoryPage/openPostPage가 렌더 결과에 따라 이 클래스를
   다시 붙인다) — 여기서 되돌리는 코드를 따로 두지 않는다.
========================================================== */

function enterPlatformScreen() {

  showPostAreaInstant();


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


  if (postSkinContainer) {

    postSkinContainer.hidden =
      true;

  }


  /*
    비밀글 입력 폼이 Skin 본문 영역 안으로 옮겨져 있을 수 있다 —
    Skin 컨테이너를 비우기 전에 항상 legacy #postDetail로 되돌린다
    (posts-view-detail.js의 helper 주석 참고). 그 파일을 로드하지
    않는 축소 구성(테스트 harness)에서도 안전하도록 존재 확인 후
    호출한다.
  */

  if (
    typeof restorePostSecretGateToLegacyDetail ===
    "function"
  ) {

    restorePostSecretGateToLegacyDetail();

  }


  if (postSkinContainer) {

    postSkinContainer.innerHTML =
      "";

  }

}


/*
  플랫폼 화면이 쓰는 "이 화면 말고 다른 건 전부 접는다" 정리.
  에디터/안내 패널이 열리기 직전에 한 번 부른다 — 각 화면이
  자기 것만 다시 펴면 된다.
*/

function hideOtherPostScreens() {

  if (postList) {

    postList.hidden =
      true;

  }


  if (postDetail) {

    postDetail.hidden =
      true;

  }


  if (bannerGrid) {

    bannerGrid.hidden =
      true;

  }


  if (bannerEditor) {

    bannerEditor.hidden =
      true;

  }


  if (postListSelectBar) {

    postListSelectBar.hidden =
      true;

  }


  if (postComposeNotice) {

    postComposeNotice.hidden =
      true;

  }


  for (
    const button
    of
    [
      postAddButton,
      bannerEditToggleButton,
      postListEditToggleButton,
      postManageToggleButton
    ]
  ) {

    if (button) {

      button.hidden =
        true;

    }

  }

}



/* =========================================================
   플랫폼 화면의 복귀 지점

   "취소/닫기를 누르면 들어오기 직전에 보고 있던 스킨 화면과 그
   스크롤 위치로 돌아온다"를 위한 최소 기록(요청서 2절). 진입
   직전의 주소/화면 종류/스크롤만 담아두고, 복귀는 기존 렌더
   경로(openPostPage/openCategoryPage/closePostArea)를 그대로 다시
   태운다 — 복원 전용 렌더 경로를 새로 만들지 않는다.

   주소는 pushState가 아니라 replaceState로 되돌린다. 진입할 때
   ?write=1 / ?edit=1을 pushState로 쌓았으므로, 나갈 때 그 항목을
   복귀 지점으로 덮어써야 "닫았는데 주소에 ?write=1이 남아 새로고침
   하면 다시 작성 화면"이 되는 불일치가 생기지 않는다.

   기록이 없을 수도 있다 — 주소를 직접 치거나 북마크로 ?edit=1에
   바로 들어온 경우다. 그때는 호출자가 준 fallback(그 글/그
   카테고리)으로 돌아간다.

   #postArea는 window가 아니라 자기 안에서 스크롤되므로
   (posts-base.css의 overflow-y:auto) 두 값을 모두 기억한다 —
   HOME에서 들어왔으면 window, 이미 열린 화면에서 들어왔으면
   #postArea 쪽이 실제 위치다.
========================================================== */

let platformScreenReturn =
  null;


function rememberPlatformScreenReturn() {

  /*
    플랫폼 화면끼리 이어질 때는 최초 진입 지점을 그대로
    유지한다 — 중간 화면(빈 작성 폼, 안내 패널)으로 되돌아가면
    안 되기 때문이다. 기록이 없는 채로 이어졌다면(주소를 직접
    쳐서 플랫폼 화면부터 시작한 경우) 그냥 없는 상태로 두고,
    호출자가 준 fallback으로 돌아간다.
  */

  if (
    platformScreenReturn ||
    currentPostView === "editor" ||
    currentPostView === "compose"
  ) {

    return;

  }


  platformScreenReturn = {

    path:
      window.location.pathname +
      window.location.search,

    view:
      currentPostView,

    postId:
      currentPostId,

    categoryId:
      currentPostCategoryId,

    scrollTop:
      postArea
        ? postArea.scrollTop
        : 0,

    scrollY:
      window.scrollY

  };

}


function forgetPlatformScreenReturn() {

  platformScreenReturn =
    null;

}


async function returnToPlatformScreenOrigin(
  fallback = null
) {

  const origin =
    platformScreenReturn ||
    fallback;


  platformScreenReturn =
    null;


  const view =
    origin?.view ||
    "home";


  const path =
    origin?.path ||
    null;


  if (
    view === "post" &&
    origin.postId
  ) {

    history.replaceState(
      {
        page: "post",

        postId:
          Number(
            origin.postId
          )
      },
      "",
      path ||
        buildPostRoute(
          `/post/${origin.postId}`
        )
    );


    await openPostPage(
      origin.postId,
      {
        updateUrl:
          false
      }
    );


    restorePlatformScreenScroll(
      origin
    );


    return;

  }


  if (
    view === "category" &&
    origin.categoryId
  ) {

    history.replaceState(
      {
        page: "category",

        categoryId:
          Number(
            origin.categoryId
          )
      },
      "",
      path ||
        buildPostRoute(
          `/category/${origin.categoryId}`
        )
    );


    await openCategoryPage(
      origin.categoryId,
      {
        updateUrl:
          false
      }
    );


    restorePlatformScreenScroll(
      origin
    );


    return;

  }


  history.replaceState(
    {
      page: "home"
    },
    "",
    path ||
      buildPostRoute(
        "/"
      )
  );


  await closePostArea({
    updateUrl:
      false,

    animate:
      false
  });


  restorePlatformScreenScroll(
    origin
  );

}


/*
  화면이 방금 다시 그려진 직후에는 아직 레이아웃이 잡히기 전일 수
  있어서 그 프레임에 scrollTop을 넣어도 0으로 눌린다 — 다음
  프레임에서 한 번 더 맞춘다("가능한 스크롤 위치"라 실패해도
  화면은 정상이다).
*/

function restorePlatformScreenScroll(
  origin
) {

  if (!origin) {

    return;

  }


  const apply =
    () => {

      if (
        postArea &&
        !postArea.hidden &&
        origin.scrollTop
      ) {

        postArea.scrollTop =
          origin.scrollTop;

      }


      if (
        (
          !postArea ||
          postArea.hidden
        ) &&
        origin.scrollY
      ) {

        window.scrollTo(
          0,
          origin.scrollY
        );

      }

    };


  apply();


  requestAnimationFrame(
    apply
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


  /*
    글 카테고리 없음 안내 패널도 같은 "작성 화면" 묶음이다 —
    이 함수는 openCategoryPage/openPostPage/closePostArea가 각자
    화면을 열기 직전에 부르는 공통 정리 지점이라, 여기서 함께
    접어야 안내 패널이 다음 화면 위에 남지 않는다
    (posts/view/posts-view-compose.js).
  */

  if (postComposeNotice) {

    postComposeNotice.hidden =
      true;

  }


  if (
    postEditor
  ) {

    postEditor.hidden =
      true;

  }


  if (postEditorDeleteButton) {

    postEditorDeleteButton.hidden =
      true;

  }


  currentEditorMode =
    null;


  editorSourcePostId =
    null;


  savedEditorRange =
    null;


  /*
    에디터를 닫는 순간 "저장하지 않은 입력"도 더 이상 없다 —
    기준점을 비워 두지 않으면 다음 화면에서 뒤로가기/탭 닫기
    가드가 남은 값으로 잘못 발동한다
    (posts/view/posts-view-editor-load.js).
  */

  if (
    typeof clearPostEditorSnapshot ===
    "function"
  ) {

    clearPostEditorSnapshot();

  }


  if (
    postEditorMessage
  ) {

    postEditorMessage.textContent =
      "";

  }

}



/* =========================================================
   스킨이 직접 그린 소유자 진입점 (PHASE 1H)

   스킨 레이아웃 안에 EDIT(?manage=1)이나 WRITE(?write=1)가 이미
   있으면 같은 동작을 표시 공간 오른쪽 위의 플랫폼 도구로 한 번 더
   보여줄 이유가 없다. 어떤 스킨이 그렸는지는 보지 않고 "그 주소를
   가리키는 링크가 렌더된 DOM에 있는가"만 본다
   (resolveSkinOwnerEntries, skin/skin-owner-entry.js).

   이 값을 여기(공용 화면 상태)에 두는 이유: updatePostAddButton()은
   화면 진입 시 await 없이 시작되고 openCategoryPage()의 스킨 확정
   지점보다 늦게 끝날 수 있다. 양쪽이 같은 값을 보게 해 두면 어느
   쪽이 나중에 끝나도 결과가 같다.

   post형 CATEGORY 화면에서만 채워진다. banner 카테고리의 + / edit은
   URL 요청(?manage=1 등)으로 표현되는 동작이 아니라 화면 안의
   토글이라, 스킨이 대신 그릴 수 있는 진입점이 애초에 없다 —
   그쪽은 플랫폼 도구를 그대로 둔다.
========================================================== */

let skinOwnerEntriesForScreen = {
  manage: false,
  write: false,
  edit: false
};


function setSkinOwnerEntriesForScreen(
  entries
) {

  skinOwnerEntriesForScreen = {
    manage: Boolean(entries && entries.manage),
    write: Boolean(entries && entries.write),
    edit: Boolean(entries && entries.edit)
  };

}


function getSkinOwnerEntriesForScreen() {

  return skinOwnerEntriesForScreen;

}


/* =========================================================
   카테고리 관리 화면(?manage=1 / Skin 위의 edit 토글)이 열려
   있는가.

   FOLDER-1 후속: 관리 화면은 이미 "관리하러 들어온" 시스템 UI라
   자기 상단에 + folder / + post / − delete / done 을 갖는다.
   그 위에 legacy 헤더의 edit / ＋ 까지 함께 떠 있으면 같은 일을
   하는 진입점이 둘이 된다 — 관리 화면에서는 그 둘을 감춘다
   (updatePostAddButton 아래 참고).

   openCategoryPage()가 화면을 열 때마다 이 값을 다시 정하므로
   (이전 화면의 판정이 남지 않는다), 관리 화면을 벗어나는 어느
   경로로 나가도 상태가 남지 않는다.
========================================================== */

let categoryManageScreenActive =
  false;


function setCategoryManageScreenActive(
  active
) {

  categoryManageScreenActive =
    Boolean(active);

}


function isCategoryManageScreenActive() {

  return categoryManageScreenActive;

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


  /*
    PHASE 1E: "로그인했으면 주인"이 아니라 실제 이 사이트의
    소유자인지로 판단한다(isSiteOwnerSignedIn,
    posts/editor/posts-state.js). 예전에는 다른 계정으로 로그인한
    방문자에게도 + 버튼이 보였고, 눌러도 RLS에 막혀 실패할 뿐이라
    보여줄 이유가 없었다. 실제 작성 권한은 여전히 저장 시점의
    user_id 필터와 RLS가 강제한다 — 이 판정은 표시만 정한다.
  */

  const isOwnerViewingCategory =
    currentPostView === "category" &&
    await isSiteOwnerSignedIn();


  if (
    !isOwnerViewingCategory
  ) {
    return;
  }


  /*
    FOLDER-1 후속: 관리 화면에서는 두 버튼 모두 접은 채로 둔다.
    관리 action은 트리 자신의 툴바가 전부 갖고 있다
    (posts/manage/posts-folder-tree.js의 createPostFolderToolbar).
  */

  if (categoryManageScreenActive) {

    return;

  }


  /*
    PHASE 1H: 스킨이 자기 자리에 WRITE를 그렸으면 플랫폼의 + 는
    접는다 — 작성은 그 WRITE로 계속 된다.
  */

  if (postAddButton) {

    postAddButton.hidden =
      skinOwnerEntriesForScreen.write;

  }


  /*
    글 목록 편집(선택 삭제)은 배너 카테고리엔 의미가
    없음 — 배너는 자기 전용 edit 버튼(bannerEditToggleButton)
    이 따로 있음.

    PHASE 1H: 스킨이 EDIT(?manage=1)을 그렸으면 같은 이유로 접는다.
  */

  if (
    postListEditToggleButton &&
    currentPostCategoryType !==
      "banner"
  ) {

    postListEditToggleButton.hidden =
      skinOwnerEntriesForScreen.manage;

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

    /*
      showPostAreaInstant()가 남긴 인라인 잔재(opacity/transition/
      pointer-events)까지 함께 되돌린다 — 그대로 두면 다음에
      legacy 커튼으로 열 때 시작 상태가 어긋난다.
    */

    hidePostAreaInstant();

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


  /*
    HOME으로 돌아왔으니 published Skin이 그려 뒀던 CATEGORY/POST
    화면과 그때 붙은 레이아웃 계약 클래스도 함께 정리한다 — 다음
    진입에서 openCategoryPage/openPostPage가 다시 정확히 붙이므로
    남겨 둘 이유가 없고, 남아 있으면 그 사이 legacy 화면이 열릴 때
    Skin용 규칙(padding:0 등)을 잘못 물려받는다.

    비우기 전에 postSecretGate를 legacy #postDetail로 되돌린다
    (posts-view-detail.js의 helper 주석 참고).
  */

  restorePostSecretGateToLegacyDetail();


  if (postSkinContainer) {

    postSkinContainer.hidden =
      true;

    postSkinContainer.innerHTML =
      "";

  }


  if (postContainer) {

    postContainer.classList.remove(
      "post-container--skin-active"
    );

  }


  postArea?.classList.remove(
    "post-area--skin-active"
  );


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



