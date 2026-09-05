/* =========================================================
   SKIN STUDIO - CODE EDITOR (PHASE 1B Slice 4)

   AI_SKIN_PHASE1B_DESIGN.md 3~7/12/22절. HTML/CSS textarea 2개 +
   Cancel/Apply만 있는 단순 modal — 이 파일의 책임은 modal
   DOM/textarea/Apply-Cancel UI뿐이다. currentWorkingSkin 자체를
   들고 있거나 Preview/Save와 직접 통신하지 않는다(그건
   studio/studio-preview.js 몫, 22절 파일 책임 분리) — 대신 열 때마다
   호출자가 넘겨준 { html, css, onApply }를 그대로 쓴다.

   sanitize/validate는 기존 skin/skin-sanitize.js의
   sanitizeSkinHTML(), skin/skin-css-validate.js의
   validateAndScopeSkinCss()를 그대로 재사용한다 — 새 sanitizer/
   CSS parser는 만들지 않는다(6/7절). CSS validate에 넘기는
   namespace("studio-code-editor-check")는 이 검증 호출 전용
   scope 계산에만 쓰이고, 실제 저장/Preview에 쓰는 CSS는 항상
   원본 raw 문자열이다(namespace가 있는 scoped 결과는 버림 —
   skin/skin-initializer.js와 동일한 패턴).

   Apply 성공 판정 후에만 호출자의 onApply(sanitizedHtml, rawCss,
   meta)를 호출한다 — DB RPC 호출은 이 파일 어디에도 없다(5절
   "Apply에서는 DB RPC 호출 금지").

   classic script — window.openSkinCodeEditor로 노출된다. 의존
   (classic script, 이 파일보다 먼저 로드되어야 함):
   sanitizeSkinHTML(skin/skin-sanitize.js), window.skinInitializerReady
   핸드셰이크(skin/skin-initializer.js — 그 모듈이 정적 import하는
   skin/skin-css-validate.js가 window.validateAndScopeSkinCss를
   노출하므로, 이 Promise가 풀렸다는 것은 곧 그 함수도 준비됐다는
   뜻이다. studio/index.html 로드 순서 참고).
========================================================== */

const CODE_EDITOR_CSS_CHECK_NAMESPACE = "studio-code-editor-check";

let codeEditorOverlay = null;
let codeEditorHtmlTextarea = null;
let codeEditorCssTextarea = null;
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

function openSkinCodeEditor({ html, css, onApply }) {

  if (!codeEditorOverlay) {
    buildCodeEditorDom();
  }

  codeEditorCurrentOnApply =
    onApply;

  codeEditorHtmlTextarea.value =
    html || "";

  codeEditorCssTextarea.value =
    css || "";

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

  /*
    validateAndScopeSkinCss는 skin/skin-css-validate.js(ES 모듈)가
    노출하는 window 전역이다 — skinInitializerReady가 풀렸다는 건
    그 모듈이 이미 로드를 끝냈다는 뜻이므로(파일 상단 주석 참고)
    이 await로 안전하게 대기한다.
  */

  await window.skinInitializerReady;

  const rawHtml =
    codeEditorHtmlTextarea.value;

  const rawCss =
    codeEditorCssTextarea.value;

  const sanitizedHtml =
    window.sanitizeSkinHTML(
      rawHtml
    );

  const cssResult =
    window.validateAndScopeSkinCss(
      rawCss,
      { namespace: CODE_EDITOR_CSS_CHECK_NAMESPACE }
    );

  if (!cssResult.ok) {

    setCodeEditorMessage(
      "CSS에 문제가 있어 적용할 수 없습니다: " +
        cssResult.warnings.join(", "),
      true
    );

    codeEditorApplyButton.disabled =
      false;

    return;

  }

  const htmlWasModified =
    sanitizedHtml !== rawHtml;

  try {

    codeEditorCurrentOnApply(
      sanitizedHtml,
      rawCss,
      { htmlWasModified }
    );

  } catch (err) {

    console.error(
      "[code-editor] onApply failed",
      err
    );

    setCodeEditorMessage(
      "적용하지 못했습니다. 다시 시도해주세요.",
      true
    );

    codeEditorApplyButton.disabled =
      false;

    return;

  }

  closeCodeEditor();

}


if (typeof window !== "undefined") {

  window.openSkinCodeEditor =
    openSkinCodeEditor;

}
