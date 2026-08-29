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


function openEditorPreview() {

  resetPreviewVisibilityOverrides();


  if (!postEditorPreviewSection) {

    updateEditorPreview();

    return;

  }


  if (
    !isMobilePostEditor()
  ) {

    postEditorPreviewSection
      .setAttribute(
        "aria-hidden",
        "false"
      );


    updateEditorPreview();

    return;

  }


  /*
    모바일 키보드 먼저 닫기
  */

  if (
    document.activeElement ===
    postEditorContent ||
    document.activeElement ===
    postEditorTitle
  ) {

    document.activeElement.blur();

  }


  /*
    매번 열 때마다 기본 높이(70dvh)와
    확대/이동 상태를 초기화.
  */

  postEditorPreviewSheet
    ?.style
    .removeProperty(
      "height"
    );


  resetMobilePreviewZoomPan();


  /*
    ★ 페이지네이션(줄바꿈/분할) 계산은
    실제 레이아웃 높이가 있어야 정확하다.

    section이 아직 display:none인 상태에서
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


  postEditorPreviewToggle
    ?.setAttribute(
      "aria-expanded",
      "true"
    );


  if (
    postEditorPreviewToggleIcon
  ) {

    postEditorPreviewToggleIcon.textContent =
      "↓";

  }


  updateEditorPreview();

}


function closeEditorPreview() {

  if (!postEditorPreviewSection) {
    return;
  }


  postEditorPreviewSection
    .classList
    .remove(
      "is-open"
    );


  if (
    isMobilePostEditor()
  ) {

    postEditorPreviewSection
      .setAttribute(
        "aria-hidden",
        "true"
      );

  }


  else {

    postEditorPreviewSection
      .setAttribute(
        "aria-hidden",
        "false"
      );

  }


  postEditorPreviewToggle
    ?.setAttribute(
      "aria-expanded",
      "false"
    );


  if (
    postEditorPreviewToggleIcon
  ) {

    postEditorPreviewToggleIcon.textContent =
      "↑";

  }

}


function syncEditorPreviewMode() {

  if (!postEditorPreviewSection) {
    return;
  }


  if (
    isMobilePostEditor()
  ) {

    if (
      !postEditorPreviewSection
        .classList
        .contains(
          "is-open"
        )
    ) {

      postEditorPreviewSection
        .setAttribute(
          "aria-hidden",
          "true"
        );

    }

  }


  else {

    postEditorPreviewSection
      .classList
      .remove(
        "is-open"
      );


    postEditorPreviewSection
      .setAttribute(
        "aria-hidden",
        "false"
      );


    postEditorPreviewToggle
      ?.setAttribute(
        "aria-expanded",
        "false"
      );


    if (
      postEditorPreviewToggleIcon
    ) {

      postEditorPreviewToggleIcon.textContent =
        "↑";

    }

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
