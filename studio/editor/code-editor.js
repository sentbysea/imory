/* =========================================================
   SKIN STUDIO - CODE EDITOR (PHASE 1B Slice 4)

   AI_SKIN_PHASE1B_DESIGN.md 3~7/12/22절. HTML/CSS textarea 2개 +
   Cancel/Apply만 있는 단순 modal — 이 파일의 책임은 modal
   DOM/textarea/Apply-Cancel UI뿐이다. currentWorkingSkin 자체를
   들고 있거나 Preview/Save와 직접 통신하지 않는다(그건
   studio/studio-preview.js 몫, 22절 파일 책임 분리) — 대신 열 때마다
   호출자가 넘겨준 { html, css, onApply }를 그대로 쓴다.

   IMPORT-CSS-IMAGE-1 — sanitize/validate 를 이 파일이 하지 않는다.
   예전에는 여기서 sanitizeSkinHTML()과 validateAndScopeSkinCss()를
   직접 불렀는데, 그래서 Code 적용과 Import 의 규칙이 따로 놀 수
   있었다. 지금은 원문 그대로 onApply(rawHtml, rawCss, meta)에 넘기고,
   호출자(studio/studio-preview.js applyCodeEditorChanges)가 Import ·
   AI 와 같은 파이프라인(skin/skin-package-import.js
   runSkinPackageContentPipeline)을 돌린 결과를 돌려준다. 이 파일은
   그 결과로 모달을 닫거나, 실패 이유(줄·열·수정 방법)를 보인다.

   DB RPC 호출은 이 파일 어디에도 없다(5절 "Apply에서는 DB RPC
   호출 금지").

   classic script — window.openSkinCodeEditor로 노출된다. 의존
   없음(window.formatSkinCssIssue 는 있으면 쓴다 —
   skin/skin-css-validate.js).
========================================================== */

let codeEditorOverlay = null;
let codeEditorHtmlTextarea = null;
let codeEditorCssTextarea = null;

/* SANDBOX-5A — 작성 JS 한 칸(선택) */
let codeEditorJsTextarea = null;
let codeEditorJsNote = null;
let codeEditorMessage = null;
let codeEditorApplyButton = null;
let codeEditorCancelButton = null;
let codeEditorCloseButton = null;

let codeEditorCurrentOnApply = null;
let codeEditorIsOpen = false;


/* =========================================================
   modal DOM — 최초 호출 시 한 번만 만들고 이후에는 재사용한다
   (텍스트만 매번 갈아끼움).
========================================================== */

function buildCodeEditorDom() {

  const overlay =
    document.createElement("div");

  overlay.className =
    "code-editor-overlay";

  overlay.hidden =
    true;


  const modal =
    document.createElement("div");

  modal.className =
    "code-editor-modal";

  overlay.appendChild(
    modal
  );


  const header =
    document.createElement("div");

  header.className =
    "code-editor-header";

  modal.appendChild(
    header
  );


  const title =
    document.createElement("h2");

  title.className =
    "code-editor-title";

  title.textContent =
    "EDIT SKIN";

  header.appendChild(
    title
  );


  const closeButton =
    document.createElement("button");

  closeButton.type =
    "button";

  closeButton.className =
    "code-editor-close";

  closeButton.setAttribute(
    "aria-label",
    "닫기"
  );

  closeButton.textContent =
    "✕";

  header.appendChild(
    closeButton
  );


  const body =
    document.createElement("div");

  body.className =
    "code-editor-body";

  modal.appendChild(
    body
  );


  const htmlField =
    buildCodeEditorField(
      "HTML"
    );

  body.appendChild(
    htmlField.field
  );


  const cssField =
    buildCodeEditorField(
      "CSS"
    );

  body.appendChild(
    cssField.field
  );


  /* =====================================================
     SANDBOX-5A — JS 한 칸

     ★ HTML/CSS 칸은 한 글자도 바뀌지 않았다. 세 번째 칸이 뒤에
     붙을 뿐이고, 기존 flex 배치가 그대로 셋을 나눠 갖는다.

     ★ 이 칸의 내용은 sanitize 하지 않는다. HTML 은 태그를 지워
     안전하게 만들 수 있지만 JS 는 그런 종류가 아니다 — 안전은
     **어디서 실행되는가**가 지킨다(별도 origin 프레임,
     connect-src 'none', 부모 DOM 접근 불가). 검사는 길이 하나뿐이다.

     ★ sandbox 스킨이 아니면 안내 문구가 나온다. 저장은 되지만
     화면에서는 아무 일도 일어나지 않기 때문이다(openSkinCodeEditor
     의 jsEnabled).
  ====================================================== */

  const jsField =
    buildCodeEditorField(
      "JS"
    );

  /* 아래 줄 가로 전체를 쓴다 (studio/editor/code-editor.css) */

  jsField.field.classList.add("code-editor-field--js");

  const jsNote =
    document.createElement("p");

  jsNote.className =
    "code-editor-field-note";

  jsNote.hidden =
    true;

  /*
    label 다음, textarea 앞에 끼운다 — 칸을 열었을 때 가장 먼저
    읽히는 자리다.
  */

  jsField.field.insertBefore(
    jsNote,
    jsField.textarea
  );

  body.appendChild(
    jsField.field
  );


  const footer =
    document.createElement("div");

  footer.className =
    "code-editor-footer";

  modal.appendChild(
    footer
  );


  const message =
    document.createElement("p");

  message.className =
    "code-editor-message";

  footer.appendChild(
    message
  );


  const actions =
    document.createElement("div");

  actions.className =
    "code-editor-actions";

  footer.appendChild(
    actions
  );


  const cancelButton =
    document.createElement("button");

  cancelButton.type =
    "button";

  cancelButton.className =
    "code-editor-button";

  cancelButton.textContent =
    "Cancel";

  actions.appendChild(
    cancelButton
  );


  const applyButton =
    document.createElement("button");

  applyButton.type =
    "button";

  applyButton.className =
    "code-editor-button code-editor-button--primary";

  applyButton.textContent =
    "Apply";

  actions.appendChild(
    applyButton
  );


  document.body.appendChild(
    overlay
  );


  codeEditorOverlay =
    overlay;

  codeEditorHtmlTextarea =
    htmlField.textarea;

  codeEditorCssTextarea =
    cssField.textarea;

  codeEditorJsTextarea =
    jsField.textarea;

  codeEditorJsNote =
    jsNote;

  codeEditorMessage =
    message;

  codeEditorApplyButton =
    applyButton;

  codeEditorCancelButton =
    cancelButton;

  codeEditorCloseButton =
    closeButton;


  /*
    modal 밖(overlay 배경) 클릭으로는 닫지 않는다 — 저장하지 않은
    textarea 입력이 실수로 날아가는 사고를 피하는 쪽을 택했다
    (16절 "unsaved textarea 입력이 있으면 accidental outside-click
    close는 피하는 쪽 권장"). Cancel/닫기(✕)/ESC만 닫는 경로다.
  */

  cancelButton.addEventListener(
    "click",
    closeCodeEditor
  );

  closeButton.addEventListener(
    "click",
    closeCodeEditor
  );

  applyButton.addEventListener(
    "click",
    handleCodeEditorApply
  );

}


function buildCodeEditorField(labelText) {

  const field =
    document.createElement("div");

  field.className =
    "code-editor-field";


  const label =
    document.createElement("p");

  label.className =
    "code-editor-field-label";

  label.textContent =
    labelText;

  field.appendChild(
    label
  );


  const textarea =
    document.createElement("textarea");

  textarea.className =
    "code-editor-textarea";

  textarea.spellcheck =
    false;

  field.appendChild(
    textarea
  );


  return {
    field,
    textarea
  };

}


/* =========================================================
   ESC로 닫기 — modal이 열려 있을 때만 반응한다(document 레벨
   listener 하나를 항상 붙여두고 codeEditorIsOpen으로 게이트).
========================================================== */

document.addEventListener(
  "keydown",
  (event) => {

    if (!codeEditorIsOpen) {
      return;
    }

    if (event.key === "Escape") {
      closeCodeEditor();
    }

  }
);


/* =========================================================
   setCodeEditorMessage — 에러/안내 문구 표시. isError=false는
   중립 안내(예: sanitize 안내), true는 검증 실패 등 에러.
========================================================== */

function setCodeEditorMessage(text, isError) {

  codeEditorMessage.textContent =
    text || "";

  codeEditorMessage.classList.toggle(
    "code-editor-message--error",
    !!isError
  );

}


/* =========================================================
   openSkinCodeEditor({ html, css, onApply })

   호출할 때마다 textarea 초기값을 새로 채운다 — studio-preview.js가
   매번 현재 currentWorkingSkin.html/css를 넘겨주므로, Apply를 여러
   번 반복한 뒤에도 다시 열면 항상 가장 최근 working draft가 보인다
   (4절).

   onApply(sanitizedHtml, rawCss, meta): meta.htmlWasModified가
   true면 sanitize 과정에서 원본과 다른 결과가 나왔다는 뜻 —
   studio-preview.js가 이 값을 보고 사용자에게 안내 토스트를
   띄울지 결정한다(6절, 복잡한 diff UI는 만들지 않음).
========================================================== */

function openSkinCodeEditor({ html, css, js, jsEnabled, onApply }) {

  if (!codeEditorOverlay) {
    buildCodeEditorDom();
  }

  codeEditorCurrentOnApply =
    onApply;

  codeEditorHtmlTextarea.value =
    html || "";

  codeEditorCssTextarea.value =
    css || "";

  /*
    SANDBOX-5A — 작성 JS. 호출자가 js 를 아예 주지 않으면 빈 칸이고,
    Apply 는 그 빈 문자열을 그대로 돌려준다(빈 문자열도 값이다 —
    "JS 를 다 지웠다"가 저장돼야 한다).
  */

  codeEditorJsTextarea.value =
    typeof js === "string" ? js : "";

  codeEditorJsNote.textContent =
    jsEnabled === false
      ? "이 JS는 sandbox 모드(renderMode: \"sandbox\")에서만 실행됩니다. 지금 스킨에서는 저장만 되고 화면에는 적용되지 않습니다."
      : "";

  codeEditorJsNote.hidden =
    jsEnabled !== false;

  setCodeEditorMessage(
    "",
    false
  );

  codeEditorApplyButton.disabled =
    false;

  codeEditorOverlay.hidden =
    false;

  codeEditorIsOpen =
    true;

  codeEditorHtmlTextarea.focus();

}


function closeCodeEditor() {

  if (!codeEditorOverlay) {
    return;
  }

  codeEditorOverlay.hidden =
    true;

  codeEditorIsOpen =
    false;

  codeEditorCurrentOnApply =
    null;

}


/* =========================================================
   Apply — HTML sanitize + CSS validate 후에만 호출자 콜백을
   부른다. 어느 한쪽이라도 실패하면 currentWorkingSkin/Preview는
   전혀 건드리지 않고(호출자 콜백 자체를 부르지 않음) modal도
   유지한다(7절 "CSS validation 실패 → Apply 중단, modal 유지").
   DB RPC 호출은 이 함수 어디에도 없다(5절).
========================================================== */

async function handleCodeEditorApply() {

  if (!codeEditorCurrentOnApply) {
    return;
  }

  codeEditorApplyButton.disabled =
    true;

  setCodeEditorMessage(
    "확인하는 중...",
    false
  );

  const rawHtml =
    codeEditorHtmlTextarea.value;

  const rawCss =
    codeEditorCssTextarea.value;

  const rawJs =
    codeEditorJsTextarea.value;


  /*
    SANDBOX-5A — JS 는 길이만 본다(위 "sanitize 하지 않는다" 주석).
    상한은 skin/skin-template.js 의 SKIN_PACKAGE_MAX_JS_CHARS 와
    같은 값이다 — 여기서 통과시킨 것이 Import/Export/프레임 전송을
    전부 통과해야 한다.
  */

  if (
    typeof isValidSkinAuthorJs === "function" &&
    !isValidSkinAuthorJs(rawJs)
  ) {

    setCodeEditorMessage(
      "JS가 너무 깁니다: " +
        (
          typeof SKIN_PACKAGE_MAX_JS_CHARS === "number"
            ? SKIN_PACKAGE_MAX_JS_CHARS.toLocaleString()
            : "131,072"
        ) +
        "자까지 넣을 수 있습니다.",
      true
    );

    codeEditorApplyButton.disabled =
      false;

    return;

  }

  /*
    IMPORT-CSS-IMAGE-1 — HTML sanitize · 이미지 슬롯 정리 · CSS 판정은
    이 파일이 하지 않는다. 호출자(studio-preview.js
    applyCodeEditorChanges)가 Import · AI 와 **같은** 파이프라인
    (skin/skin-package-import.js runSkinPackageContentPipeline)에
    원문을 넣고, 그 결과를 돌려준다:

      { ok:false, message, cssReport? }  -> 모달을 열어 둔 채 이유를 보인다
      { ok:true, cssReport?, notices? }  -> 닫는다(제외한 선언은 호출자가
                                            toast 로 알린다)

    예외(POST region 누락 등)는 예전처럼 message 를 그대로 보인다.
  */

  let outcome;

  try {

    outcome =
      await codeEditorCurrentOnApply(
        rawHtml,
        rawCss,
        { js: rawJs }
      );

  } catch (err) {

    console.error(
      "[code-editor] onApply failed",
      err
    );

    /*
      PHASE 1C-J: onApply(studio-preview.js)가 POST post-body region
      누락처럼 구체적인 validation 실패를 던지면 err.message를 그대로
      보여준다 — 이 파일은 그 메시지의 "의미"는 모르고 문자열만 relay
      한다. message가 없는 예외만 기존 범용 문구로 대체한다.
    */
    setCodeEditorMessage(
      (err && err.message) ||
        "적용하지 못했습니다. 다시 시도해주세요.",
      true
    );

    codeEditorApplyButton.disabled =
      false;

    return;

  }

  if (outcome && outcome.ok === false) {

    setCodeEditorMessage(
      buildCodeEditorFailureText(outcome),
      true
    );

    codeEditorApplyButton.disabled =
      false;

    return;

  }

  closeCodeEditor();

}


/*
  CSS 실패는 첫 오류 한 줄 + 수정 예 + 나머지 개수. 모달의 메시지
  줄은 한 칸이라 줄바꿈으로 나눈다(white-space: pre-line).
*/
function buildCodeEditorFailureText(outcome) {

  const report =
    outcome && outcome.cssReport;

  if (!report || !report.errors || !report.errors.length) {
    return (outcome && outcome.message) || "적용하지 못했습니다.";
  }

  const lines = [
    "CSS에 문제가 있어 적용할 수 없습니다.",
    typeof window.formatSkinCssIssue === "function"
      ? window.formatSkinCssIssue(report.errors[0])
      : report.summary
  ];

  if (report.errors[0].hint) {
    lines.push("수정 방법: " + report.errors[0].hint);
  }

  if (report.errors.length > 1) {
    lines.push(`그 밖에 오류 ${report.errors.length - 1}개가 더 있습니다.`);
  }

  return lines.join("\n");

}


if (typeof window !== "undefined") {

  window.openSkinCodeEditor =
    openSkinCodeEditor;

}
