/* =========================================================
   POSTS - PREVIEW SETTINGS / SCALE / RATIO

   posts-preview.js에서 분리됨(파일이 너무 커져서 나눔).
   여기는 프리뷰의 "설정/상태"만 다룬다:
   모바일 확대축소(scale/zoom/pan), 비율(ratio) override,
   CSS 변수(padding 등), title/source 표시 토글.

   실제 페이지 나누기(pagination) 알고리즘은 posts-preview.js,
   내보내기는 posts-preview-export.js,
   모바일 시트 열기/닫기/제스처는 posts-preview-mobile.js에 있음.

   editorPreviewPages, editorPreviewPageIndex 등 상태와
   postEditorPreview* DOM 요소는 posts/editor/posts-refs.js에
   있음(같은 페이지에서 함께 로드되어야 함).

   이 파일도 다시 커져서, CSS 변수 적용/제목·출처 표시
   토글/비율 컨트롤 동기화는 posts-preview-css-vars.js로
   옮겼음 — 그 파일은 이 파일보다 나중에 로드되어야 함
   (index.html 순서 참고).
========================================================== */

/* =========================================================
   MOBILE PREVIEW SCALE
   PC 캔버스를 모바일에서 통째로 축소

   모바일에서는 여기서 계산하는 scale이
   "핀치 줌의 기준(1배)"이 되고,
   실제 화면에 그리는 배율은
   mobilePreviewFitScale * mobilePreviewZoom.
========================================================== */

let mobilePreviewFitScale = 1;
let mobilePreviewZoom = 1;
let mobilePreviewPanX = 0;
let mobilePreviewPanY = 0;

const MOBILE_PREVIEW_MIN_ZOOM = 0.5;
const MOBILE_PREVIEW_MAX_ZOOM = 3;


/*
  ★ 데스크톱은 모바일처럼 핀치 제스처가 없어서, 우측 상단의
  +/- 버튼으로만 fitScale 위에 곱해지는 배율을 조절한다
  (posts-toolbar-toggles.js에서 버튼 클릭에 연결).
*/

let desktopPreviewZoom = 1;

const DESKTOP_PREVIEW_MIN_ZOOM = 0.5;
const DESKTOP_PREVIEW_MAX_ZOOM = 2.5;
const DESKTOP_PREVIEW_ZOOM_STEP = 0.1;


function setDesktopPreviewZoom(
  nextZoom
) {

  desktopPreviewZoom =
    Math.min(
      DESKTOP_PREVIEW_MAX_ZOOM,
      Math.max(
        DESKTOP_PREVIEW_MIN_ZOOM,
        nextZoom
      )
    );


  applyEditorPreviewScale();

}


function zoomEditorPreviewIn() {

  setDesktopPreviewZoom(
    desktopPreviewZoom +
    DESKTOP_PREVIEW_ZOOM_STEP
  );

}


function zoomEditorPreviewOut() {

  setDesktopPreviewZoom(
    desktopPreviewZoom -
    DESKTOP_PREVIEW_ZOOM_STEP
  );

}


function syncEditorPreviewZoomControls() {

  if (
    postEditorPreviewZoomLevel
  ) {

    postEditorPreviewZoomLevel.textContent =
      `${
        Math.round(
          desktopPreviewZoom *
          100
        )
      }%`;

  }


  postEditorPreviewZoomOut
    ?.toggleAttribute(
      "disabled",
      desktopPreviewZoom <=
        DESKTOP_PREVIEW_MIN_ZOOM
    );


  postEditorPreviewZoomIn
    ?.toggleAttribute(
      "disabled",
      desktopPreviewZoom >=
        DESKTOP_PREVIEW_MAX_ZOOM
    );

}


function applyEditorPreviewScale() {

  if (
    !postEditorPreviewPages ||
    editorPreviewPages.length === 0
  ) {
    return;
  }


  const stage =
    postEditorPreviewStage;


  if (!stage) {
    return;
  }


  const page =
    editorPreviewPages[0];


  /*
    먼저 원본 크기로 복원
  */

  postEditorPreviewPages.style.transform =
    "none";


  postEditorPreviewPages.style.transformOrigin =
    "center center";


  postEditorPreviewPages.style.width =
    "520px";


  const naturalWidth =
    520;


  const availableWidth =
    stage.clientWidth;


  const fitScale =
    Math.min(
      1,
      availableWidth /
      naturalWidth
    );


  const visiblePage =
    editorPreviewPages[
      editorPreviewPageIndex
    ] ||
    page;


  const naturalHeight =
    visiblePage.offsetHeight;


  /*
    데스크톱: 기존과 완전히 동일
    (핀치 줌/이동 기능 없음, stage 높이도 내용에 맞춤).
  */

  if (
    !isMobilePostEditor()
  ) {

    /*
      ★ stage 높이를 콘텐츠에 맞춰 JS가 늘려주던 예전 방식은
      세로로 긴 비율/AUTO에서 stage가 뷰포트보다 커져 캔버스
      아랫부분이 화면 밖으로 밀려 잘려 보이는 문제가 있었다
      (admin-quote-preview-update.js에서 이미 같은 이유로
      고친 적 있음 — calculateQuotePreviewFitScale 참고).
      여기서도 동일하게, stage 크기는 CSS(posts.css의
      clamp/dvh)가 고정으로 정하고, JS는 그 상자의 width/height를
      모두 고려해 캔버스 전체가 안에 들어오도록 scale만 한다
      (object-fit: contain과 같은 개념) — stage 자체는 절대
      건드리지 않는다.
    */

    const availableHeight =
      stage.clientHeight;


    const heightFitScale =
      availableHeight > 0
        ? availableHeight / naturalHeight
        : fitScale;


    const desktopFitScale =
      Math.min(
        fitScale,
        heightFitScale
      );


    mobilePreviewFitScale =
      desktopFitScale;


    const appliedScale =
      desktopFitScale *
      desktopPreviewZoom;


    postEditorPreviewPages.style.transformOrigin =
      "center center";


    postEditorPreviewPages.style.transform =
      `scale(${appliedScale})`;


    syncEditorPreviewZoomControls();


    return;

  }


  /*
    모바일: stage 높이는 CSS(flex)가 결정함
    (헤더/비율 버튼 줄/페이지네이션이 늘어나면 줄어듦).

    가로 기준으로만 맞추면 세로가 긴 비율(1:1, 4:3 등)에서
    캔버스 아래쪽이 stage 밖으로 넘쳐 페이지네이션에
    가려 보이는 문제가 있었음.
    → 가로/세로 둘 다에 맞춰(=object-fit: contain과 동일한
    개념) 처음부터 전체가 다 보이게 하고,
    사용자가 더 크게 보고 싶으면 핀치로 확대.
  */

  const availableHeight =
    stage.clientHeight;


  const heightFitScale =
    availableHeight > 0
      ? availableHeight / naturalHeight
      : fitScale;


  mobilePreviewFitScale =
    Math.min(
      fitScale,
      heightFitScale
    );


  applyMobilePreviewTransform();

}


/* =========================================================
   MOBILE PREVIEW ZOOM / PAN
========================================================== */

function resetMobilePreviewZoomPan() {

  mobilePreviewZoom =
    1;


  mobilePreviewPanX =
    0;


  mobilePreviewPanY =
    0;


  if (
    isMobilePostEditor()
  ) {

    applyMobilePreviewTransform();

  }

}


function clampMobilePreviewPan() {

  const stage =
    postEditorPreviewStage;


  if (
    !stage ||
    !postEditorPreviewPages
  ) {
    return;
  }


  const scale =
    mobilePreviewFitScale *
    mobilePreviewZoom;


  const contentWidth =
    520 *
    scale;


  const visiblePage =
    editorPreviewPages[
      editorPreviewPageIndex
    ];


  const naturalHeight =
    visiblePage
      ? visiblePage.offsetHeight
      : 0;


  const contentHeight =
    naturalHeight *
    scale;


  const maxPanX =
    Math.max(
      0,
      (
        contentWidth -
        stage.clientWidth
      ) /
      2
    );


  const maxPanY =
    Math.max(
      0,
      (
        contentHeight -
        stage.clientHeight
      ) /
      2
    );


  mobilePreviewPanX =
    Math.min(
      maxPanX,
      Math.max(
        -maxPanX,
        mobilePreviewPanX
      )
    );


  mobilePreviewPanY =
    Math.min(
      maxPanY,
      Math.max(
        -maxPanY,
        mobilePreviewPanY
      )
    );

}


function applyMobilePreviewTransform() {

  if (
    !postEditorPreviewPages
  ) {
    return;
  }


  clampMobilePreviewPan();


  const scale =
    mobilePreviewFitScale *
    mobilePreviewZoom;


  postEditorPreviewPages.style.transformOrigin =
    "center center";


  postEditorPreviewPages.style.transform =
    `translate(${mobilePreviewPanX}px, ${mobilePreviewPanY}px) scale(${scale})`;

}


/* =========================================================
   EDITOR PREVIEW
   QUOTE PRESET → PAGED CANVAS
========================================================== */


/* =========================================================
   PREVIEW 출력 조건 (세션 한정)

   ★ 어디에 무엇이 있는가

     QUOTE 프리셋(관리 화면)  배경 · 여백 · 글꼴 · 문단 간격 ·
                              제목/출처 서식 = **본문 서식**
     Preview(글쓰기 화면)     uniform / auto / custom · 출력
                              너비 = **출력 조건**

   프리셋에 저장돼 있는 canvas 값(ratio / ratioWidth /
   ratioHeight / exportWidth)은 이제 이 화면의 **초기값**으로만
   읽는다(호환). 사용자가 Preview에서 고른 값이 있으면 그것이
   우선이다.

   ★ null의 뜻은 "아직 안 골랐다 = 프리셋 값을 따르는 중"이다.
   그래서 같은 글을 편집하는 동안 프리셋을 바꾸면 아직 손대지
   않은 항목만 새 프리셋 값을 따라가고, 사용자가 고른 값은
   그대로 남는다. 글을 새로 열 때(prepareEditorUI) 전부 null로
   되돌리므로 이전 글의 임시 설정이 새어 들어가지 않는다.

     uniform   auto와 똑같이 나눈 뒤 모든 페이지를 같은 높이로
     auto      수동 PAGE break로만 나누고 페이지마다 자기 높이
     custom    사용자 지정 비율의 고정 크기 캔버스
========================================================== */

let previewRatioMode =
  null;

let previewCustomRatioWidth =
  null;

let previewCustomRatioHeight =
  null;

/*
  출력(내보내기) 너비. 레이아웃 너비(POST_PAGE_LAYOUT_WIDTH =
  520px)와는 다른 축이다 — 이 값을 바꿔도 줄바꿈과 페이지 수는
  절대 바뀌지 않고, 저장되는 PNG의 해상도만 바뀐다.
*/

let previewExportWidth =
  null;



/* =========================================================
   프리셋에 저장된 canvas 값 → Preview 옵션 (호환)

   옛 프리셋의 고정 비율("4:5" · "9:16" · "custom" + ratioWidth/
   Height)은 **손실 없이 custom의 비율 값으로** 대응된다.
   "auto"만 auto로 온다. uniform은 프리셋에 없는 새 값이라
   사용자가 Preview에서 고를 때만 생긴다.
========================================================== */

function parsePostRatioParts(
  value
) {

  const match =
    String(
      value ||
      ""
    )
      .match(
        /^([\d.]+):([\d.]+)$/
      );


  if (!match) {

    return null;

  }


  return {

    width:
      Math.max(
        1,
        Number(
          match[1]
        ) || 1
      ),

    height:
      Math.max(
        1,
        Number(
          match[2]
        ) || 1
      )

  };

}


function getPresetPreviewRatioMode(
  settings = {}
) {

  return settings.ratio === "auto"
    ? "auto"
    : "custom";

}


function getPresetPreviewRatioParts(
  settings = {}
) {

  if (
    settings.ratio ===
    "custom"
  ) {

    return {

      width:
        Math.max(
          1,
          Number(
            settings.ratioWidth
          ) || 1
        ),

      height:
        Math.max(
          1,
          Number(
            settings.ratioHeight
          ) || 1
        )

    };

  }


  return (
    parsePostRatioParts(
      settings.ratio
    ) ||
    {
      width: 1,
      height: 1
    }
  );

}


/*
  지금 실제로 쓰이는 값 — 세션에서 고른 값이 있으면 그것,
  없으면 프리셋 값. 화면 동기화(syncPreviewRatioControls)와
  계산(getPostPreviewRatio)이 같은 함수를 쓴다.
*/

function getEffectivePreviewRatioMode(
  settings = {}
) {

  return (
    previewRatioMode ||
    getPresetPreviewRatioMode(
      settings
    )
  );

}


function getEffectivePreviewRatioParts(
  settings = {}
) {

  const preset =
    getPresetPreviewRatioParts(
      settings
    );


  return {

    width:
      Math.max(
        1,
        Number(
          previewCustomRatioWidth ??
          preset.width
        ) || 1
      ),

    height:
      Math.max(
        1,
        Number(
          previewCustomRatioHeight ??
          preset.height
        ) || 1
      )

  };

}


/*
  출력 너비도 같은 규칙 — 고른 값이 있으면 그것, 없으면
  프리셋의 exportWidth.
*/

function getPostPreviewExportWidth(
  settings = {}
) {

  return Math.max(
    1,
    Math.round(
      postStyleNumber(
        previewExportWidth,
        postStyleNumber(
          settings.exportWidth,
          POST_STYLE_DEFAULTS.exportWidth
        )
      )
    )
  );

}



/* =========================================================
   PREVIEW RATIO
========================================================== */

function getPostPreviewRatio(
  settings = {}
) {

  const mode =
    getEffectivePreviewRatioMode(
      settings
    );


  /*
    ★ AUTO / UNIFORM: 고정 비율이 아니라 콘텐츠 높이를 쓰라는
    신호. width/height는 옛 호출부를 위한 안전한 기본값일
    뿐이고, 실제로는 auto/uniform 플래그를 보고 분기해야 한다
    (posts-page-layout.js의 createPostPageCanvas,
    posts-preview-export-capture.js의 resolveExportPageHeight,
    posts-preview-css-vars.js의 --post-preview-aspect 참고).

    uniform은 나누는 동안에는 auto와 똑같이 굴고(auto: true),
    다 나눈 뒤에만 모든 페이지의 높이를 통일한다 — 그래서 두
    플래그를 같이 켠다. 순서 판정이 필요한 자리는 uniform을
    먼저 본다.
  */

  if (
    mode === "uniform"
  ) {

    return {
      width: 1,
      height: 1,
      auto: true,
      uniform: true
    };

  }


  if (
    mode === "auto"
  ) {

    return {
      width: 1,
      height: 1,
      auto: true
    };

  }


  return getEffectivePreviewRatioParts(
    settings
  );

}



