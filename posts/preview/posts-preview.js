/* =========================================================
   POSTS - PREVIEW (에디터 PREVIEW ↔ 공용 페이지 레이아웃 연결)

   posts.js에서 분리됨. 설정/스케일은 posts-preview-settings.js,
   내보내기는 posts-preview-export.js, 모바일 시트/제스처는
   posts-preview-mobile.js에 있다.

   ★ 페이지 한 장을 만드는 일과 페이지 나누기 자체는
   posts/preview/posts-page-layout.js(공용)로 옮겼다 — Quote
   Preset 미리보기(admin)가 같은 코드를 쓰기 위해서다. 이
   파일에 남은 것은 "에디터의 전역 상태(프리셋 + 세션
   오버라이드 + 제목 입력칸)를 읽어서 출력 조건(view)을
   만들어 넘기는" 얇은 연결부와, 프리뷰 페이지 이동이다.

   editorPreviewPages, editorPreviewPageIndex 등 상태와
   postEditorPreview* DOM 요소는 posts/editor/posts-refs.js에
   있음(같은 페이지에서 함께 로드되어야 함).
========================================================== */


/* =========================================================
   에디터 PREVIEW의 출력 조건

   세션 오버라이드(posts-preview-css-vars.js)가 있으면 그 값이
   프리셋보다 우선한다. 여기서 한 번만 모아서 공용 레이아웃에
   넘기므로, 공용 쪽은 전역 상태를 전혀 모른다.
========================================================== */

function resolveEditorPreviewView(
  settings = {},
  options = {}
) {

  const resolved =
    normalizePostStyleSettings(
      settings
    );


  return {

    ratio:
      getPostPreviewRatio(
        resolved
      ),

    showTitle:
      options.showTitle !==
      false,

    titleVisible:
      previewTitleVisible,

    titleText:
      postEditorTitle
        ?.value
        .trim()
      ||
      "untitled",

    sourceVisible:
      previewSourceVisible,

    sourceText:
      resolved.sourceText,

    verticalAlign:
      previewVerticalAlign ||
      resolved.verticalAlign,

    bodyAlign:
      previewBodyAlign ||
      resolved.bodyAlign,

    sourceSpacing:
      previewSourceSpacing ??
      resolved.sourceSpacing,

    sourceBottomOffset:
      previewSourceBottomOffset ??
      resolved.sourceBottomOffset,


    /*
      출처 강조선 — 이번 발췌만 끄거나 색을 바꾼 값
      (posts/preview/posts-preview-background.js).
    */

    sourceRuleEnabled:
      previewSourceRuleEnabled ??
      resolved.sourceRuleEnabled,

    sourceRuleColor:
      previewSourceRuleColor ||
      resolved.sourceRuleColor,


    /*
      배경 사진 — 프리셋을 고치지 않고 이번 발췌만 바꿔 낀 값.
      null이면 프리셋 값을 그대로 쓴다.
    */

    background:
      typeof resolvePreviewBackgroundView === "function"
        ? resolvePreviewBackgroundView()
        : null

  };

}


/* =========================================================
   CREATE PREVIEW PAGE

   공용 createPostPageCanvas의 얇은 래퍼. 기존 호출부
   (posts-preview-paginate.js 등)가 그대로 쓸 수 있게
   이름과 반환 계약을 유지한다.
========================================================== */

function createEditorPreviewPage(
  settings = {},
  options = {}
) {

  return createPostPageCanvas(
    settings,
    resolveEditorPreviewView(
      settings,
      options
    )
  );

}



/* =========================================================
   PAGE OVERFLOW / MANUAL BREAK

   공용 구현(posts-page-layout.js)에 위임. 예전 이름을 쓰는
   호출부가 남아 있어 얇은 별칭으로 둔다.
========================================================== */

function previewPageIsOverflowing(
  page
) {

  return postPageIsOverflowing(
    page
  );

}


function previewCurrentPageIsOverflowing(
  current
) {

  return postPageCurrentIsOverflowing(
    current
  );

}


function isEditorPageBreakNode(
  node
) {

  return isPostPageBreakNode(
    node
  );

}



/* =========================================================
   PREVIEW PAGE NAVIGATION
========================================================== */

function showEditorPreviewPage(
  index,
  options = {}
) {

  const resetZoom =
    options.resetZoom !== false;

  if (
    editorPreviewPages.length === 0
  ) {
    return;
  }


  editorPreviewPageIndex =
    Math.max(
      0,
      Math.min(
        index,
        editorPreviewPages.length - 1
      )
    );


  editorPreviewPages.forEach(
    (
      page,
      pageIndex
    ) => {

      page.hidden =
        pageIndex !==
        editorPreviewPageIndex;

    }
  );


  if (
    postEditorPreviewPageIndicator
  ) {

    postEditorPreviewPageIndicator.textContent =
      `${
        editorPreviewPageIndex + 1
      } / ${
        editorPreviewPages.length
      }`;

  }


  if (
    postEditorPreviewPrev
  ) {

    postEditorPreviewPrev.disabled =
      editorPreviewPageIndex === 0;

  }


  if (
    postEditorPreviewNext
  ) {

    postEditorPreviewNext.disabled =
      editorPreviewPageIndex ===
      editorPreviewPages.length - 1;

  }


  if (
    postEditorPreviewPagination
  ) {

    postEditorPreviewPagination.hidden =
      editorPreviewPages.length <= 1;

  }


  /*
    실제로 다른 페이지로 이동한 경우에는 이전 페이지에서
    확대/이동했던 상태가 그대로 남아있으면 어색하므로 초기화.

    반면 title/source/ratio 토글처럼 "같은 페이지 내용을
    다시 그리는" 경우(options.resetZoom === false)에는
    사용자가 맞춰둔 확대/이동 상태를 그대로 유지해야 한다.
  */

  if (resetZoom) {

    resetMobilePreviewZoomPan();

  }


  /*
    출력 크기 표시는 지금 보이는 페이지의 실제 높이에 달려
    있다(auto·uniform) — 페이지가 바뀔 때마다 다시 계산한다.
  */

  syncPreviewExportSizeLabel();


  requestAnimationFrame(
    applyEditorPreviewScale
  );

}
