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
   발췌 컨트롤 (PREVIEW / export / copy)

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
========================================================== */

function syncEditorExcerptControls() {

  const isHtml =
    editorContentMode === "html";


  const hideExcerpt =
    isHtml ||
    (
      typeof isGalleryEditor === "function" &&
      isGalleryEditor()
    );


  if (
    postEditorPreviewToggle
  ) {

    postEditorPreviewToggle.hidden =
      hideExcerpt;

  }


  if (
    postEditorExportButton
  ) {

    postEditorExportButton.hidden =
      hideExcerpt;

  }


  if (
    postEditorCopyButton
  ) {

    postEditorCopyButton.hidden =
      hideExcerpt;

  }


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
