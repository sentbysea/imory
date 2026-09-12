/* =========================================================
   POSTS - EDITOR CONTENT MODE (OOC / HTML)

   posts.js에서 분리됨.
   editorContentMode 상태와 postEditorOOC* /
   postEditorRichtextMode / postEditorHtmlContent 등
   DOM 요소는 posts.js에 있음(같은 페이지에서 함께 로드).
========================================================== */

/* =========================================================
   OOC (독자에게 안 보이는 메모)
========================================================== */

function toggleEditorOOC() {

  if (
    !postEditorOOCToggle ||
    !postEditorOOC
  ) {
    return;
  }


  const expanded =
    postEditorOOCToggle.getAttribute(
      "aria-expanded"
    ) ===
    "true";


  postEditorOOCToggle.setAttribute(
    "aria-expanded",
    String(
      !expanded
    )
  );


  postEditorOOC.hidden =
    expanded;

}


function resetEditorOOC() {

  if (
    postEditorOOC
  ) {

    postEditorOOC.value =
      "";


    postEditorOOC.hidden =
      true;

  }


  postEditorOOCToggle
    ?.setAttribute(
      "aria-expanded",
      "false"
    );

}



/* =========================================================
   RICHTEXT / HTML 모드 전환
========================================================== */

function setEditorContentMode(
  mode
) {

  editorContentMode =
    mode === "html"
      ? "html"
      : "richtext";


  const isHtml =
    editorContentMode ===
    "html";


  postEditorHtmlModeToggle
    ?.setAttribute(
      "aria-pressed",
      String(
        isHtml
      )
    );


  if (
    postEditorRichtextMode
  ) {

    postEditorRichtextMode.hidden =
      isHtml;

  }


  if (
    postEditorHtmlContent
  ) {

    postEditorHtmlContent.hidden =
      !isHtml;

  }


  syncEditorExcerptControls();

}



/* =========================================================
   발췌 컨트롤 (발췌 여닫기 / export / copy)

   본문 편집 UI는 post와 gallery가 **같다**. 다른 것은 이
   세 버튼뿐이다(요구사항 3절).

     HTML 모드  — 글 자체를 HTML 뷰어처럼 보여주는 용도라
                  발췌 이미지가 의미가 없다
     gallery    — 사진이 본문인 글이라 글자 발췌 카드를 만들
                  일이 없다

   둘 중 하나라도 해당하면 숨긴다. cancel/save/delete는
   어느 쪽에서도 그대로다.

   여기서 말하는 copy는 **발췌 이미지 복사** 버튼이다 —
   본문 글자를 선택해 복사하는 브라우저 기본 동작과는
   아무 관계가 없다.

   ★ export/copy는 발췌 패널이 **펼쳐져 있을 때만** 보인다.

   무엇이 저장될지 눈으로 보지 못한 채 누르는 버튼이 되지
   않도록, 접혀 있으면 cancel/save만 남긴다. 판정은 실제
   상태 하나(섹션의 is-open)에서 나오므로, 여닫는 모든 길이
   자동으로 이 표시를 따라온다
   (syncEditorPreviewToggleButton —
   posts/preview/posts-preview-mobile.js).
========================================================== */

/*
  ★ HTML 모드도 미리보기와 저장을 쓴다 (요구사항 10)

  예전에는 HTML 모드에서 이 UI를 통째로 숨겼다 — 글자 발췌 카드가
  의미 없는 글이라서다. 지금은 같은 진입점(발췌 여닫기 · export)
  으로 **렌더링된 디자인을 그대로 PNG로** 저장한다. 별도 사이트로
  보내지 않는다.

  그래서 숨기는 대상은 gallery 하나만 남는다.
*/

function editorExcerptUiHidden() {

  return (
    typeof isGalleryEditor === "function" &&
    isGalleryEditor()
  );

}


/*
  HTML 모드인가 — 같은 패널 안에서 "무엇을 보여주고 무엇을
  찍을지"가 갈리는 자리다.

    일반   Quote Preset 발췌 페이지들
    HTML   디자인 한 장(posts/export/posts-html-image.js)
*/

function editorHtmlImageMode() {

  return (
    editorContentMode === "html" &&
    !(
      typeof isGalleryEditor === "function" &&
      isGalleryEditor()
    )
  );

}


/*
  export/copy만 다시 맞춘다 — 발췌를 여닫을 때마다 불린다.
*/

function syncEditorExcerptActionButtons() {

  const hidden =
    editorExcerptUiHidden() ||
    (
      typeof editorPreviewIsOpen === "function" &&
      !editorPreviewIsOpen()
    );


  if (
    postEditorExportButton
  ) {

    postEditorExportButton.hidden =
      hidden;

  }


  if (
    postEditorCopyButton
  ) {

    /*
      ★ HTML 모드에는 copy가 없다.

      copy는 발췌 **이미지**를 클립보드에 넣는 버튼이다. HTML
      디자인은 한 장의 높이에 상한이 없어서(긴 디자인은 수천 px)
      클립보드 이미지로 넣기에 적합하지 않고, 이번 라운드에서
      확정한 범위는 "PNG로 저장"까지다. 저장은 export가 한다.
    */

    postEditorCopyButton.hidden =
      hidden ||
      editorHtmlImageMode();

  }

}


function syncEditorExcerptControls() {

  const hideExcerpt =
    editorExcerptUiHidden();


  if (
    postEditorPreviewToggle
  ) {

    postEditorPreviewToggle.hidden =
      hideExcerpt;

  }


  /*
    ★ 같은 패널이 두 가지를 보여준다 (요구사항 10)

    클래스 하나로 갈라서, 발췌 설정·페이지 대지·페이지 이동은
    감추고 디자인 상자만 남긴다(posts/posts-preview-export.css).
    "HTML 디자인만 저장"이 마크업 수준에서 지켜지는 자리다.
  */

  const htmlMode =
    editorHtmlImageMode();


  postEditorPreviewSheet
    ?.classList
    .toggle(
      "is-html-image-mode",
      htmlMode
    );


  if (
    postEditorHtmlPreview
  ) {

    postEditorHtmlPreview.hidden =
      !htmlMode;

  }


  if (
    htmlMode &&
    typeof renderEditorHtmlPreview === "function"
  ) {

    renderEditorHtmlPreview();

  }


  syncEditorExcerptActionButtons();


  if (
    typeof closeEditorPreview !== "function"
  ) {

    return;

  }


  if (hideExcerpt) {

    closeEditorPreview();

  }


  else {

    /*
      발췌 UI가 다시 보이면 프리뷰도 원래 상태로 —
      사용자가 고른 값이 있으면 그것, 없으면 화면 크기의 기본값.
    */

    syncEditorPreviewMode();

  }

}


function toggleEditorContentMode() {

  setEditorContentMode(
    editorContentMode ===
    "html"
      ? "richtext"
      : "html"
  );

}



/* =========================================================
   VISIBILITY (공개 / 비밀글 / 비공개)

   editorPostVisibility 상태는 posts.js에 있음.
   저장(save) 시점에 posts.js가 이 값을 읽어서
   posts.visibility에 반영하고, "secret"이고 비밀번호
   입력칸이 비어있지 않으면 set_post_secret_password RPC를
   호출한다.
========================================================== */

function setEditorVisibility(
  mode
) {

  editorPostVisibility =
    mode === "secret" ||
    mode === "private"
      ? mode
      : "public";


  postEditorSecretToggle
    ?.setAttribute(
      "aria-pressed",
      String(
        editorPostVisibility ===
        "secret"
      )
    );


  postEditorPrivateToggle
    ?.setAttribute(
      "aria-pressed",
      String(
        editorPostVisibility ===
        "private"
      )
    );


  if (
    postEditorSecretPassword
  ) {

    postEditorSecretPassword.hidden =
      editorPostVisibility !==
      "secret";

  }

}


function toggleEditorSecret() {

  setEditorVisibility(
    editorPostVisibility ===
    "secret"
      ? "public"
      : "secret"
  );

}


function toggleEditorPrivate() {

  setEditorVisibility(
    editorPostVisibility ===
    "private"
      ? "public"
      : "private"
  );

}


function resetEditorVisibility() {

  setEditorVisibility(
    "public"
  );


  editorPostHadSecretPassword =
    false;


  if (
    postEditorSecretPassword
  ) {

    postEditorSecretPassword.value =
      "";

  }

}
