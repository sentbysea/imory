/* =========================================================
   POSTS - PREVIEW: CSS VARS / VISIBILITY / RATIO CONTROLS

   posts-preview-settings.js 분할본 중 마지막. DOM 참조/
   상태는 posts/editor/posts-refs.js에 있음(반드시 먼저
   로드돼야 함).

   내용: 프리셋 값을 CSS 변수(padding 등)로 페이지에 적용,
   제목/출처 표시 토글 초기화 및 버튼 상태 동기화, 비율
   버튼 활성 상태 동기화.
========================================================== */


/* =========================================================
   PREVIEW CSS VARIABLES
========================================================== */

function applyPostPreviewPresetVariables(
  settings = {}
) {

  if (
    !postEditorPreviewPages
  ) {
    return;
  }


  const ratio =
    getPostPreviewRatio(
      settings
    );


  postEditorPreviewPages
    .style
    .setProperty(
      "--post-preview-aspect",
      ratio.auto
        ? "auto"
        : `${ratio.width} / ${ratio.height}`
    );


  const basePadding =
    Math.max(
      0,
      Number(
        settings.padding
      ) || 0
    );


  const verticalPadding =
    Math.max(
      0,
      Number(
        settings.verticalPadding
      ) || 0
    );


  const horizontalPadding =
    Math.max(
      0,
      Number(
        settings.horizontalPadding
      ) || 0
    );


  postEditorPreviewPages
    .style
    .setProperty(
      "--post-preview-padding-y",
      `${
        basePadding +
        verticalPadding
      }px`
    );


  postEditorPreviewPages
    .style
    .setProperty(
      "--post-preview-padding-x",
      `${
        basePadding +
        horizontalPadding
      }px`
    );


  postEditorPreviewPages
    .style
    .setProperty(
      "--post-preview-title-gap",
      `${
        Number(
          settings.titleSpacing
        ) || 0
      }px`
    );

}



/* =========================================================
   PREVIEW TITLE / SOURCE VISIBILITY (세션 한정 토글)

   프리뷰 헤더의 title/source 버튼으로 잠깐 껐다 켜볼 수 있는
   상태. QUOTE 프리셋의 titleEnabled/sourceEnabled 값은
   건드리지 않고, 프리뷰가 열릴 때마다 그 값에서 다시 시작함.

   title.hidden = true (= [hidden] → display:none)이면
   레이아웃에서 완전히 빠지므로, 마진/자리는 남지 않고
   본문이 그 자리에서 바로 시작됨.
========================================================== */

let previewTitleVisible = true;
let previewSourceVisible = true;


/*
  ★ NEW
  세션 한정 오버라이드. null이면 QUOTE 프리셋의 verticalAlign/
  bodyAlign을 그대로 따르고, 이 글을 쓰는 동안 버튼을 한 번이라도
  누르면 그 값으로 잠깐 덮어쓴다(프리셋 자체는 안 바뀜).
  verticalAlign은 이 토글에서 top/center 둘만 고른다
  (자연스럽게-위에서부터/가운데).
*/

let previewVerticalAlign = null;
let previewBodyAlign = null;


/*
  ★ NEW
  source 위치 세션 오버라이드. null이면 QUOTE 프리셋의
  sourceBottomOffset/sourceSpacing을 그대로 따른다. 둘 중
  어느 쪽이 실제로 쓰이는지는 ratio에 달려 있다 — AUTO가
  아니면 source가 캔버스 맨 아래 고정(스페이서 방식)이라
  bottomOffset이 의미 있고, AUTO면 source가 본문 바로 뒤로
  흘러가는 flow 요소라 spacing(=간격)이 의미 있다
  (posts-preview.js의 createPreviewSource/
  createEditorPreviewPage 참고). syncPreviewSourceOffsetControls가
  ratio에 따라 둘 중 맞는 입력칸만 보여준다.
*/

let previewSourceBottomOffset = null;
let previewSourceSpacing = null;


function resetPreviewVisibilityOverrides() {

  const settings =
    postStyleSettings ||
    {};


  previewTitleVisible =
    settings.titleEnabled !==
    false;


  previewSourceVisible =
    settings.sourceEnabled !==
    false;


  previewVerticalAlign =
    null;


  previewBodyAlign =
    null;


  previewSourceBottomOffset =
    null;


  previewSourceSpacing =
    null;


  /*
    ★ 출력 조건(비율 · 사용자 지정 비율 · 출력 너비)도 여기서
    전부 null로 되돌린다 — null은 "프리셋 값을 그대로 따르는
    중"이라는 뜻이므로, 이 글의 프리셋 값이 그대로 초기값이
    된다(따로 복사해 둘 필요가 없다).

    이 함수는 **글 하나를 열 때 한 번만** 불린다
    (posts/view/posts-view-transition.js의 prepareEditorUI).
    예전에는 openEditorPreview()가 매번 불러서, 프리뷰를
    접었다 펴기만 해도 고른 옵션이 사라졌다.
  */

  previewRatioMode =
    null;


  previewCustomRatioWidth =
    null;


  previewCustomRatioHeight =
    null;


  previewExportWidth =
    null;


  syncPreviewVisibilityToggleButtons();


  syncPreviewRatioControls();


  syncPreviewSourceOffsetControls();

}


function syncPreviewVisibilityToggleButtons() {

  postEditorPreviewTitleToggle
    ?.setAttribute(
      "aria-pressed",
      String(
        previewTitleVisible
      )
    );


  postEditorPreviewSourceToggle
    ?.setAttribute(
      "aria-pressed",
      String(
        previewSourceVisible
      )
    );


  /*
    ★ NEW
    null(오버라이드 없음)이면 select도 빈 값("preset")으로 —
    "지금은 프리셋 값을 그대로 따르는 중"이라는 뜻.
  */

  if (
    postEditorPreviewAlignSelect
  ) {

    postEditorPreviewAlignSelect.value =
      previewVerticalAlign ||
      "";

  }


  if (
    postEditorPreviewBodyAlignSelect
  ) {

    postEditorPreviewBodyAlignSelect.value =
      previewBodyAlign ||
      "";

  }

}



/* =========================================================
   PREVIEW RATIO CONTROLS
========================================================== */

/*
  uniform / auto / custom 세 버튼은 항상 보인다(펼치는 단계
  없음). 눌린 표시는 "지금 실제로 쓰이는 값"이다 — 아직 아무
  것도 안 골랐으면 프리셋에서 온 값이 눌려 있다.
*/

function syncPreviewRatioControls() {

  const settings =
    postStyleSettings ||
    {};


  const mode =
    getEffectivePreviewRatioMode(
      settings
    );


  postEditorPreviewRatioButtons
    ?.forEach(
      button => {

        button.setAttribute(
          "aria-pressed",
          String(
            button.dataset.ratio ===
            mode
          )
        );

      }
    );


  const isCustom =
    mode === "custom";


  if (
    postEditorPreviewRatioCustomInputs
  ) {

    postEditorPreviewRatioCustomInputs.hidden =
      !isCustom;

  }


  /*
    ★ 세로 정렬도 custom에서만 보인다.

    auto·uniform은 페이지 높이가 콘텐츠에서 나오므로 공용
    레이아웃이 세로 정렬을 항상 center로 못박는다
    (posts/preview/posts-page-layout.js의 flexibleHeight 분기) —
    그 상태에서 top/center를 고를 수 있게 두면 눌러도 아무 일도
    일어나지 않는 컨트롤이 된다. 값 자체(previewVerticalAlign)는
    지우지 않는다: custom으로 돌아오면 고른 값이 그대로 다시
    쓰인다.
  */

  if (
    postEditorPreviewAlignRow
  ) {

    postEditorPreviewAlignRow.hidden =
      !isCustom;

  }


  const parts =
    getEffectivePreviewRatioParts(
      settings
    );


  /*
    ★ 입력 중인 칸은 건드리지 않는다 — 사용자가 "12"를 치는
    도중에 되채우면 커서가 튄다.
  */

  if (
    postEditorPreviewRatioCustomWidth &&
    document.activeElement !==
      postEditorPreviewRatioCustomWidth
  ) {

    postEditorPreviewRatioCustomWidth.value =
      parts.width;

  }


  if (
    postEditorPreviewRatioCustomHeight &&
    document.activeElement !==
      postEditorPreviewRatioCustomHeight
  ) {

    postEditorPreviewRatioCustomHeight.value =
      parts.height;

  }


  if (
    postEditorPreviewExportWidth &&
    document.activeElement !==
      postEditorPreviewExportWidth
  ) {

    postEditorPreviewExportWidth.value =
      getPostPreviewExportWidth(
        settings
      );

  }


  syncPreviewExportSizeLabel();

}



/* =========================================================
   출력 크기 표시 (Quote Preset의 같은 표시와 같은 계산)

   레이아웃은 언제나 520px 폭이고 출력 너비는 그 위에 곱해지는
   배율일 뿐이다 — 이 숫자가 바뀌어도 줄바꿈과 페이지 수는
   바뀌지 않는다. 지금 보이는 페이지의 실제 레이아웃 높이를
   재므로 auto·uniform에서도 맞는 값이 나온다.
========================================================== */

function syncPreviewExportSizeLabel() {

  if (
    !postEditorPreviewExportSize
  ) {

    return;

  }


  const settings =
    postStyleSettings ||
    {};


  const exportWidth =
    getPostPreviewExportWidth(
      settings
    );


  const ratio =
    getPostPreviewRatio(
      settings
    );


  const visiblePage =
    editorPreviewPages?.[
      editorPreviewPageIndex
    ] ||
    editorPreviewPages?.[0];


  const layoutHeight =
    ratio.auto
      ? (
          visiblePage?.offsetHeight ||
          0
        )
      : POST_PAGE_LAYOUT_WIDTH *
        (
          ratio.height /
          ratio.width
        );


  postEditorPreviewExportSize.textContent =
    layoutHeight > 0
      ? `${exportWidth} × ${
          resolveExportPixelHeight(
            exportWidth,
            layoutHeight
          )
        }`
      : `${exportWidth}`;

}



/* =========================================================
   PREVIEW SOURCE POSITION (BOTTOM MARGIN / GAP)

   어느 입력칸을 보여줄지는 ratio에 달려 있다 —
   previewSourceBottomOffset/previewSourceSpacing 자체의
   설명은 위 선언부 주석 참고.
========================================================== */

function syncPreviewSourceOffsetControls() {

  const settings =
    postStyleSettings ||
    {};


  const ratio =
    getPostPreviewRatio(
      settings
    );


  /*
    ★ uniform은 페이지에 정해진 아래쪽 경계가 생긴다(모든
    페이지가 같은 높이). 그래서 출처가 캔버스 맨 아래에
    고정되는 쪽 — 고정 비율과 같은 "margin"이 의미 있는 값이다.
    순수 auto만 출처가 본문 바로 뒤로 흘러간다.
  */

  const sourceFlowsAfterBody =
    Boolean(
      ratio.auto &&
      !ratio.uniform
    );


  if (
    postEditorPreviewSourceBottomOffsetRow
  ) {

    postEditorPreviewSourceBottomOffsetRow.hidden =
      sourceFlowsAfterBody;

  }


  if (
    postEditorPreviewSourceSpacingRow
  ) {

    postEditorPreviewSourceSpacingRow.hidden =
      !sourceFlowsAfterBody;

  }


  if (
    postEditorPreviewSourceBottomOffset
  ) {

    postEditorPreviewSourceBottomOffset.value =
      previewSourceBottomOffset ??
      (
        Number(
          settings.sourceBottomOffset
        ) ||
        0
      );

  }


  if (
    postEditorPreviewSourceSpacing
  ) {

    postEditorPreviewSourceSpacing.value =
      previewSourceSpacing ??
      (
        Number(
          settings.sourceSpacing
        ) ||
        0
      );

  }

}
