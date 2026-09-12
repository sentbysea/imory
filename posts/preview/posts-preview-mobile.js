/* =========================================================
   POSTS - PREVIEW MOBILE SHEET

   posts-preview.js에서 분리됨(파일이 너무 커져서 나눔).
   모바일 프리뷰 시트 열기/닫기, 핀치 줌/드래그 이동,
   시트 높이 드래그 리사이즈만 여기 있음.
========================================================== */

/* =========================================================
   MOBILE PREVIEW
========================================================== */

function isMobilePostEditor() {

  return window.matchMedia(
    "(max-width: 600px)"
  ).matches;

}


/*
  ★ 여기서 세션 오버라이드를 초기화하지 않는다.

  예전에는 열 때마다 resetPreviewVisibilityOverrides()를 불러서,
  프리뷰를 접었다 펴기만 해도 비율·정렬·제목/출처·출력 너비가
  프리셋 값으로 되돌아갔다. 초기화는 글 하나를 여는 시점
  (prepareEditorUI — posts/view/posts-view-transition.js)에서
  한 번만 한다. 그래야 같은 글을 쓰는 동안에는 고른 값이 남고,
  다른 글로 가면 새로 시작된다.
*/


/* =========================================================
   여닫기 — 데스크톱·모바일 공통

   ★ 예전에는 모바일만 접을 수 있었다.

     데스크톱에서는 섹션이 늘 펼쳐져 있고, 여닫기 버튼 자체가
     CSS로 숨겨져 있었다(모바일 전용 부유 알약). 지금은 같은
     고스트 버튼 하나로 두 화면이 같은 동작을 한다 —
     "펼침"의 유일한 표시는 섹션의 **is-open 클래스**이고,
     보이기/숨기기는 CSS가 그 클래스로만 정한다.

   ★ 기본값은 화면 크기에 따라 다르다.

     데스크톱  펼침   (예전과 같다 — 들어오면 바로 보인다)
     모바일    접힘   (예전과 같다 — 좁은 화면에서 에디터를
                      가리지 않는다)

     그 기본값은 syncEditorPreviewMode()가 정한다. 사용자가
     한 번이라도 직접 여닫으면 그 선택이 우선이고, 화면 폭이
     바뀌어도 뒤집지 않는다(previewOpenChosenByUser).

   ★ 접어도 export/copy는 그대로 된다.

     닫힌 섹션은 display:none이라 레이아웃 크기가 0이고, 그
     상태로 페이지를 나누면 전부 한 장에 들어가 버린다. 그래서
     캡처 직전에 화면 밖에서만 잠깐 레이아웃을 갖게 하는 기존
     경로(forceOpenSectionIfNeeded —
     posts/export/posts-preview-export-section.js)를 그대로
     쓴다. 그 경로가 이제 데스크톱에서도 돈다.
========================================================== */

/*
  null = "아직 사용자가 직접 여닫은 적 없다 = 화면 크기의
  기본값을 따르는 중". 글을 새로 열 때 다시 null이 된다
  (prepareEditorUI).
*/

let previewOpenChosenByUser = null;


function editorPreviewIsOpen() {

  return Boolean(
    postEditorPreviewSection
      ?.classList
      .contains(
        "is-open"
      )
  );

}


/*
  라벨 · 화살표 · aria-expanded를 실제 상태에서 한 자리에서 정한다.
*/

function syncEditorPreviewToggleButton() {

  const isOpen =
    editorPreviewIsOpen();


  postEditorPreviewToggle
    ?.setAttribute(
      "aria-expanded",
      String(
        isOpen
      )
    );


  if (
    postEditorPreviewToggleLabel
  ) {

    /*
      "미리보기"가 아니라 "발췌"다 — 이 패널이 하는 일이
      본문 미리보기가 아니라 export/copy로 내보낼 **발췌
      이미지**를 만드는 것이기 때문(gallery 글에서 이 UI를
      통째로 숨기는 자리도 syncEditorExcerptControls라는
      이름을 쓴다).
    */

    postEditorPreviewToggleLabel.textContent =
      isOpen
        ? "발췌 접기"
        : "발췌";

  }


  if (
    postEditorPreviewToggleIcon
  ) {

    postEditorPreviewToggleIcon.textContent =
      isOpen
        ? "▴"
        : "▾";

  }


  /*
    export/copy는 발췌가 펼쳐져 있을 때만 보인다. 여닫는 길이
    여럿이라(버튼 클릭 · Escape · 화면 크기 기본값 · HTML/gallery
    전환) 실제 상태를 한 자리에서 반영하는 여기서 같이 맞춘다.
  */

  if (
    typeof syncEditorExcerptActionButtons === "function"
  ) {

    syncEditorExcerptActionButtons();

  }

}


function openEditorPreview(
  options = {}
) {

  if (!postEditorPreviewSection) {

    updateEditorPreview();

    return;

  }


  if (
    options.byUser !==
    false
  ) {

    previewOpenChosenByUser =
      true;

  }


  /*
    모바일 키보드 먼저 닫기
  */

  if (
    isMobilePostEditor() &&
    (
      document.activeElement ===
      postEditorContent ||
      document.activeElement ===
      postEditorTitle
    )
  ) {

    document.activeElement.blur();

  }


  /*
    모바일에서는 열 때마다 기본 높이와 확대/이동 상태를 초기화한다.
    (데스크톱은 시트 높이 드래그도 핀치도 없다.)
  */

  if (
    isMobilePostEditor()
  ) {

    postEditorPreviewSheet
      ?.style
      .removeProperty(
        "height"
      );


    resetMobilePreviewZoomPan();

  }


  /*
    ★ 페이지네이션(줄바꿈/분할) 계산은
    실제 레이아웃 높이가 있어야 정확하다.

    섹션이 아직 display:none인 상태에서
    updateEditorPreview()를 먼저 부르면
    모든 페이지의 scrollHeight/clientHeight가 0으로
    측정되어(previewPageIsOverflowing이 항상 false)
    title/source가 켜져 있어도 여백을 무시한 채
    본문 전체가 한 페이지에 잘못 채워진다.

    그래서 is-open을 먼저 붙여 실제 크기를 갖게 한 뒤에
    updateEditorPreview()를 호출해야 한다.
  */

  postEditorPreviewSection
    .classList
    .add(
      "is-open"
    );


  postEditorPreviewSection
    .setAttribute(
      "aria-hidden",
      "false"
    );


  syncEditorPreviewToggleButton();


  updateEditorPreview();

}


function closeEditorPreview(
  options = {}
) {

  if (!postEditorPreviewSection) {
    return;
  }


  if (
    options.byUser ===
    true
  ) {

    previewOpenChosenByUser =
      false;

  }


  postEditorPreviewSection
    .classList
    .remove(
      "is-open"
    );


  postEditorPreviewSection
    .setAttribute(
      "aria-hidden",
      "true"
    );


  syncEditorPreviewToggleButton();

}


function toggleEditorPreview() {

  if (
    editorPreviewIsOpen()
  ) {

    closeEditorPreview(
      {
        byUser: true
      }
    );

  }


  else {

    openEditorPreview(
      {
        byUser: true
      }
    );

  }

}


/*
  글을 새로 열 때(prepareEditorUI) 불린다 — 이전 글에서 접어
  뒀던 선택이 새 글로 새어 들어가지 않게 한다.
*/

function resetEditorPreviewOpenChoice() {

  previewOpenChosenByUser =
    null;

}


/*
  화면 크기가 바뀌었을 때(그리고 처음 들어올 때) 기본값을 맞춘다.
  사용자가 이미 직접 고른 적이 있으면 그 선택을 그대로 둔다.
*/

function syncEditorPreviewMode() {

  if (!postEditorPreviewSection) {
    return;
  }


  const shouldBeOpen =
    previewOpenChosenByUser === null
      ? !isMobilePostEditor()
      : previewOpenChosenByUser;


  if (
    shouldBeOpen ===
    editorPreviewIsOpen()
  ) {

    syncEditorPreviewToggleButton();


    return;

  }


  if (shouldBeOpen) {

    openEditorPreview(
      {
        byUser: false
      }
    );

  }


  else {

    closeEditorPreview();

  }

}


/* =========================================================
   MOBILE PREVIEW PINCH ZOOM / DRAG PAN

   postEditorPreviewStage 위에서
   손가락 1개 = 이동, 2개 = 확대/축소(+이동).
========================================================== */

const mobilePreviewStagePointers =
  new Map();

let mobilePreviewPanStart =
  null;

let mobilePreviewPinchStart =
  null;


function distanceBetweenPoints(
  a,
  b
) {

  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );

}


function midpointBetweenPoints(
  a,
  b
) {

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };

}


function handlePreviewStagePointerDown(
  event
) {

  if (
    !isMobilePostEditor() ||
    !postEditorPreviewSection
      ?.classList
      .contains(
        "is-open"
      )
  ) {
    return;
  }


  postEditorPreviewStage
    ?.setPointerCapture(
      event.pointerId
    );


  mobilePreviewStagePointers.set(
    event.pointerId,
    {
      x: event.clientX,
      y: event.clientY
    }
  );


  if (
    mobilePreviewStagePointers.size ===
    1
  ) {

    mobilePreviewPanStart =
      {
        x: event.clientX,
        y: event.clientY,
        panX: mobilePreviewPanX,
        panY: mobilePreviewPanY
      };


    mobilePreviewPinchStart =
      null;

  }


  else if (
    mobilePreviewStagePointers.size ===
    2
  ) {

    const points =
      Array.from(
        mobilePreviewStagePointers.values()
      );


    mobilePreviewPinchStart =
      {
        distance:
          distanceBetweenPoints(
            points[0],
            points[1]
          ),
        zoom: mobilePreviewZoom,
        mid:
          midpointBetweenPoints(
            points[0],
            points[1]
          ),
        panX: mobilePreviewPanX,
        panY: mobilePreviewPanY
      };


    mobilePreviewPanStart =
      null;

  }

}


function handlePreviewStagePointerMove(
  event
) {

  if (
    !mobilePreviewStagePointers.has(
      event.pointerId
    )
  ) {
    return;
  }


  mobilePreviewStagePointers.set(
    event.pointerId,
    {
      x: event.clientX,
      y: event.clientY
    }
  );


  if (
    mobilePreviewStagePointers.size ===
      2 &&
    mobilePreviewPinchStart
  ) {

    const points =
      Array.from(
        mobilePreviewStagePointers.values()
      );


    const distance =
      distanceBetweenPoints(
        points[0],
        points[1]
      );


    const mid =
      midpointBetweenPoints(
        points[0],
        points[1]
      );


    const ratio =
      distance /
      (
        mobilePreviewPinchStart.distance ||
        1
      );


    mobilePreviewZoom =
      Math.min(
        MOBILE_PREVIEW_MAX_ZOOM,
        Math.max(
          MOBILE_PREVIEW_MIN_ZOOM,
          mobilePreviewPinchStart.zoom *
          ratio
        )
      );


    mobilePreviewPanX =
      mobilePreviewPinchStart.panX +
      (
        mid.x -
        mobilePreviewPinchStart.mid.x
      );


    mobilePreviewPanY =
      mobilePreviewPinchStart.panY +
      (
        mid.y -
        mobilePreviewPinchStart.mid.y
      );


    applyMobilePreviewTransform();


    return;

  }


  if (
    mobilePreviewStagePointers.size ===
      1 &&
    mobilePreviewPanStart
  ) {

    const current =
      mobilePreviewStagePointers
        .values()
        .next()
        .value;


    mobilePreviewPanX =
      mobilePreviewPanStart.panX +
      (
        current.x -
        mobilePreviewPanStart.x
      );


    mobilePreviewPanY =
      mobilePreviewPanStart.panY +
      (
        current.y -
        mobilePreviewPanStart.y
      );


    applyMobilePreviewTransform();

  }

}


function handlePreviewStagePointerUp(
  event
) {

  mobilePreviewStagePointers.delete(
    event.pointerId
  );


  if (
    mobilePreviewStagePointers.size ===
    1
  ) {

    const remaining =
      mobilePreviewStagePointers
        .values()
        .next()
        .value;


    mobilePreviewPanStart =
      {
        x: remaining.x,
        y: remaining.y,
        panX: mobilePreviewPanX,
        panY: mobilePreviewPanY
      };


    mobilePreviewPinchStart =
      null;

  }


  else if (
    mobilePreviewStagePointers.size ===
    0
  ) {

    mobilePreviewPanStart =
      null;


    mobilePreviewPinchStart =
      null;

  }

}



/* =========================================================
   MOBILE PREVIEW SHEET RESIZE (드래그 핸들)

   30vh ~ 90vh 사이에서 시트 높이를 직접 드래그로 조절.
========================================================== */

const MOBILE_PREVIEW_MIN_HEIGHT_RATIO =
  0.3;

const MOBILE_PREVIEW_MAX_HEIGHT_RATIO =
  0.9;

let mobilePreviewResizeStart =
  null;


function handlePreviewDragPointerDown(
  event
) {

  if (
    !isMobilePostEditor() ||
    !postEditorPreviewSheet
  ) {
    return;
  }


  postEditorPreviewDragHandle
    ?.setPointerCapture(
      event.pointerId
    );


  postEditorPreviewSheet
    .classList
    .add(
      "is-resizing"
    );


  mobilePreviewResizeStart =
    {
      y: event.clientY,
      height:
        postEditorPreviewSheet
          .getBoundingClientRect()
          .height
    };

}


function handlePreviewDragPointerMove(
  event
) {

  if (
    !mobilePreviewResizeStart ||
    !postEditorPreviewSheet
  ) {
    return;
  }


  const viewportHeight =
    window.innerHeight;


  const minHeight =
    viewportHeight *
    MOBILE_PREVIEW_MIN_HEIGHT_RATIO;


  const maxHeight =
    viewportHeight *
    MOBILE_PREVIEW_MAX_HEIGHT_RATIO;


  /*
    핸들을 위로 끌면(화면 y가 작아지면) 커지도록.
  */

  const delta =
    mobilePreviewResizeStart.y -
    event.clientY;


  const nextHeight =
    Math.min(
      maxHeight,
      Math.max(
        minHeight,
        mobilePreviewResizeStart.height +
        delta
      )
    );


  postEditorPreviewSheet.style.height =
    `${nextHeight}px`;

}


function handlePreviewDragPointerUp() {

  if (
    !mobilePreviewResizeStart
  ) {
    return;
  }


  mobilePreviewResizeStart =
    null;


  postEditorPreviewSheet
    ?.classList
    .remove(
      "is-resizing"
    );


  /*
    시트 높이가 바뀌면 stage(뷰포트) 크기도 바뀌므로
    "맞춤 배율" 기준(mobilePreviewFitScale)도 다시 계산해야
    캔버스가 새 크기에 맞게 전체가 다시 보임.
    사용자가 확대해둔 상태였더라도, 창 크기를 바꾼 건
    "다시 전체를 보고 싶다"는 의도로 보고 줌/이동을 초기화.
  */

  resetMobilePreviewZoomPan();


  applyEditorPreviewScale();

}
