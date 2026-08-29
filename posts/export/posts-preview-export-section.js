/* =========================================================
   POSTS - PREVIEW EXPORT: SECTION FORCE-OPEN / PAGE ENSURE

   posts-preview-export.js에서 분리됨(파일이 너무 커져서
   나눔). exportEditorPreviewAsImages() 안의 지역 클로저였던
   sectionForExport 등을 이 파일 스코프의 변수로 옮기고,
   beginExportSectionState()로 매번 초기화하는 방식으로
   바꿨다 — export는 버튼이 disabled된 상태로 한 번에 하나만
   실행되므로(재진입 없음) 동작은 기존과 동일하다.

   exportEditorPreviewAsImages() 등은
   posts-preview-export.js에 있음(같은 페이지에서 함께
   로드되어야 함).
========================================================== */

let exportSectionForExport =
  null;

let exportWasSectionOpenBeforeExport =
  false;

let exportSectionForcedForExport =
  false;


function beginExportSectionState() {

  exportSectionForExport =
    postEditorPreviewSection;

  exportWasSectionOpenBeforeExport =
    exportSectionForExport
      ?.classList
      .contains(
        "is-open"
      ) ||
    false;

  exportSectionForcedForExport =
    false;

}


/*
  ★ export 버튼은 프리뷰 패널 밖(에디터 하단)에 있어서,
  모바일에서는 프리뷰 시트를 한 번도 열지 않고도
  바로 export를 누를 수 있다.

  그런데 모바일 프리뷰 섹션은 열려있지 않으면
  display:none이라 실제 레이아웃 크기가 0이 되고,
  그 상태에서 updateEditorPreview()(페이지 분할 계산)가
  돌면 previewPageIsOverflowing이 항상 false로 나와
  본문 전체가 한 페이지에 잘못 채워진다.

  → export 직전에 (닫혀 있었다면) 화면 밖에서만
  잠깐 레이아웃을 갖게 만들어 정확히 분할되게 하고,
  끝나면 원래 상태로 되돌린다.
*/

function forceOpenSectionIfNeeded() {

  if (
    !exportSectionForExport ||
    exportWasSectionOpenBeforeExport ||
    !isMobilePostEditor()
  ) {
    return;
  }

  /*
    "is-open"은 모바일 미디어쿼리에서만 display:none을
    풀어주는 클래스라서, 이 강제 오픈은 모바일에서만
    의미/부작용이 있다.

    데스크톱은 애초에 이 섹션이 항상 레이아웃을 갖고
    있으므로(=이 문제가 없으므로) 건드리지 않는다 —
    건드리면 오히려 현재 열려 있는 실제 프리뷰 패널이
    export 도중 화면 밖으로 잠깐 밀려나 보이게 된다.
  */

  exportSectionForExport
    .classList
    .add(
      "is-open"
    );


  /*
    단순히 화면 밖(left:-100000px)으로 보내면
    position:fixed + width:auto인 상태라
    shrink-to-fit 계산 때문에 안쪽 sheet의
    width:100%가 기준으로 삼을 너비가 불확실해진다.

    대신 실제 뷰포트 크기(100%)는 그대로 갖되
    visibility만 숨겨서, 실제로 열었을 때와
    동일한 레이아웃 폭/높이로 측정되게 한다.
  */

  exportSectionForExport.style.position =
    "fixed";

  exportSectionForExport.style.left =
    "0";

  exportSectionForExport.style.top =
    "0";

  exportSectionForExport.style.width =
    "100%";

  exportSectionForExport.style.height =
    "100%";

  exportSectionForExport.style.visibility =
    "hidden";

  exportSectionForExport.style.pointerEvents =
    "none";


  exportSectionForcedForExport =
    true;

}


function restoreForcedExportSection() {

  if (
    !exportSectionForcedForExport
  ) {
    return;
  }


  exportSectionForExport
    .classList
    .remove(
      "is-open"
    );

  exportSectionForExport.style.removeProperty(
    "position"
  );

  exportSectionForExport.style.removeProperty(
    "left"
  );

  exportSectionForExport.style.removeProperty(
    "top"
  );

  exportSectionForExport.style.removeProperty(
    "width"
  );

  exportSectionForExport.style.removeProperty(
    "height"
  );

  exportSectionForExport.style.removeProperty(
    "visibility"
  );

  exportSectionForExport.style.removeProperty(
    "pointer-events"
  );

}


/*
  ★ 이미 프리뷰가 열려서 페이지가 그려져 있으면 그걸 그대로
  쓴다. 여기서 매번 updateEditorPreview()로 다시 그리면
  "지금 보고 있던 그 화면"이 아니라 방금 새로 만든 DOM을
  캡처하게 되고, 그 재생성 도중(레이아웃/폰트가 아직 안정
  되기 전) 캡처가 겹쳐서 텍스트가 깨져 보이는 원인이 됐다.

  페이지가 아예 없을 때(모바일에서 프리뷰를 한 번도 안 열고
  export부터 누른 경우)만 새로 그린다.
*/

async function ensurePreviewPagesRendered() {

  let previewPages =
    Array.from(
      document.querySelectorAll(
        ".post-editor-preview-page"
      )
    );


  if (
    previewPages.length > 0
  ) {

    return previewPages;

  }


  updateEditorPreview();


  await waitForExport(
    80
  );


  return Array.from(
    document.querySelectorAll(
      ".post-editor-preview-page"
    )
  );

}
