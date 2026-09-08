/* =========================================================
   SKIN STUDIO - IMPORT EDITOR (PHASE 1 Final Gap — Whole
   SkinPackage Import)

   route-aware Code Editor(studio/editor/code-editor.js)와 완전히
   구분된 별도 modal이다 — Code Editor는 "지금 Preview가 보고 있는
   페이지 하나"의 HTML/CSS만 계속 그 역할대로 편집하고, 이 파일은
   HOME/CATEGORY/POST/css/imageSlots/regions/metadata를 가진
   SkinPackage JSON 문자열 "하나 전체"를 가져오는 별개의 명시적
   동작이다(요구사항 2/3/4절 — Code Editor에 페이지 탭을 추가하지
   않는다).

   v1은 가장 작은 UI만 만든다: JSON textarea 1개 + Cancel/
   VALIDATE/APPLY TO DRAFT 세 버튼. VALIDATE를 먼저 눌러 통과해야만
   APPLY TO DRAFT가 활성화된다 — 검증 없이 곧장 적용하는 경로는
   없다(요구사항 5/7절). textarea 내용을 다시 고치면 그 순간
   마지막 VALIDATE 결과를 버리고 APPLY TO DRAFT를 다시 비활성화한다
   — "검증한 텍스트"와 "지금 적용하려는 텍스트"가 어긋난 채로
   Apply되는 사고를 막기 위함이다.

   실제 검증 로직(JSON parse/구조 검사/sanitize/CSS validate/POST
   region 검사)은 전혀 갖지 않는다 — skin/skin-package-import.js의
   validateSkinPackageImport()를 그대로 호출만 한다(code-editor.js가
   sanitizeSkinHTML/validateAndScopeSkinCss를 직접 호출하는 것과
   달리, 이 파일은 그 호출들을 한 번 더 감싼 skin-package-import.js
   뒤에 있다 — Import 전용 구조 검사가 code-editor.js보다 훨씬
   많아서 이 modal 파일 안에 두면 "modal DOM 담당"이라는 책임이
   흐려지기 때문).

   Apply 성공 판정(=VALIDATE 통과) 후에만 호출자의
   onApply(skinPackage)를 호출한다 — DB RPC 호출은 이 파일 어디에도
   없다(code-editor.js와 동일 원칙, "Apply에서는 DB RPC 호출 금지").

   파일 UX(Skin Studio 파일 UX) — 붙여넣기 외에 두 입구를 더 둔다:
   "JSON 파일 선택" 버튼(<input type=file accept=.json>)과 modal
   위로의 `.json` 파일 drag & drop. 두 입구 모두 **파일 내용을
   textarea에 넣는 것까지만** 하고, 그 다음은 붙여넣기와 완전히
   같은 경로(VALIDATE → APPLY TO DRAFT)를 탄다 — 파일에서 왔다고
   검증을 건너뛰는 길은 없다. 편의상 파일을 읽은 직후 VALIDATE를
   자동으로 한 번 눌러 준다(검증은 읽기 전용이라 안전하다).
   overlay 전체에서 dragover/drop 기본 동작을 막아, modal 밖에
   잘못 놓아도 브라우저가 그 파일로 이동해 Studio 작업을 잃는
   사고를 막는다.

   classic script — window.openSkinImportEditor로 노출된다. 의존
   (classic script, 이 파일보다 먼저 로드되어야 함):
   validateSkinPackageImport(skin/skin-package-import.js).
   studio/index.html 로드 순서 참고.
========================================================== */

/* 파일 입구 상한 — SkinPackage JSON은 수백 KB면 넉넉하다. 이보다
   큰 파일은 십중팔구 잘못 고른 파일이고, textarea에 통째로 넣으면
   브라우저가 멈춘다. */
const IMPORT_EDITOR_FILE_MAX_BYTES = 5 * 1024 * 1024;

let importEditorOverlay = null;
let importEditorTextarea = null;
let importEditorMessage = null;
let importEditorValidateButton = null;
let importEditorApplyButton = null;
let importEditorCancelButton = null;
let importEditorCloseButton = null;
let importEditorFileInput = null;
let importEditorFilePickButton = null;
let importEditorModal = null;

/* dragenter/dragleave는 modal 안의 자식 요소를 지날 때마다 쌍으로
   발생한다 — 깊이를 세어야 "정말 modal 밖으로 나갔는가"를 안다. */
let importEditorDragDepth = 0;

let importEditorCurrentOnApply = null;
let importEditorIsOpen = false;

/*
  VALIDATE가 성공했을 때만 채워지는, "지금 Apply를 누르면 실제로
  적용될" 이미 sanitize/validate까지 끝난 SkinPackage. textarea에
  input 이벤트가 한 번이라도 발생하면 즉시 null로 되돌려 APPLY TO
  DRAFT를 다시 비활성화한다(파일 상단 주석 참고).
*/
let importEditorValidatedSkinPackage = null;


function buildImportEditorDom() {

  const overlay =
    document.createElement("div");

  overlay.className =
    "import-editor-overlay";

  overlay.hidden =
    true;


  const modal =
    document.createElement("div");

  modal.className =
    "import-editor-modal";

  overlay.appendChild(modal);


  const header =
    document.createElement("div");

  header.className =
    "import-editor-header";

  modal.appendChild(header);


  const title =
    document.createElement("h2");

  title.className =
    "import-editor-title";

  title.textContent =
    "IMPORT SKIN";

  header.appendChild(title);


  const closeButton =
    document.createElement("button");

  closeButton.type =
    "button";

  closeButton.className =
    "import-editor-close";

  closeButton.setAttribute("aria-label", "닫기");

  closeButton.textContent =
    "✕";

  header.appendChild(closeButton);


  const body =
    document.createElement("div");

  body.className =
    "import-editor-body";

  modal.appendChild(body);


  const fieldLabel =
    document.createElement("p");

  fieldLabel.className =
    "import-editor-field-label";

  fieldLabel.textContent =
    "SkinPackage JSON";

  body.appendChild(fieldLabel);


  const fileRow =
    document.createElement("div");

  fileRow.className =
    "import-editor-file-row";

  body.appendChild(fileRow);


  const filePickButton =
    document.createElement("button");

  filePickButton.type =
    "button";

  filePickButton.className =
    "import-editor-file-pick";

  filePickButton.textContent =
    "JSON 파일 선택";

  fileRow.appendChild(filePickButton);


  const fileHint =
    document.createElement("span");

  fileHint.className =
    "import-editor-file-hint";

  fileHint.textContent =
    "또는 .json 파일을 이 창에 끌어다 놓기 · 아래에 직접 붙여넣기";

  fileRow.appendChild(fileHint);


  const fileInput =
    document.createElement("input");

  fileInput.type =
    "file";

  fileInput.accept =
    ".json,application/json";

  fileInput.hidden =
    true;

  fileInput.className =
    "import-editor-file-input";

  fileRow.appendChild(fileInput);


  const textarea =
    document.createElement("textarea");

  textarea.className =
    "import-editor-textarea";

  textarea.spellcheck =
    false;

  /* banner는 선택 필드다(skin/skin-package-import.js) — 안내에도
     그렇게 표시한다. */
  textarea.placeholder =
    '{ "schemaVersion": 1, "templates": { "home": {...}, "category": {...}, "post": {...}, "banner": {...} (선택) }, "css": "..." }';

  body.appendChild(textarea);


  const footer =
    document.createElement("div");

  footer.className =
    "import-editor-footer";

  modal.appendChild(footer);


  const message =
    document.createElement("p");

  message.className =
    "import-editor-message";

  footer.appendChild(message);


  const actions =
    document.createElement("div");

  actions.className =
    "import-editor-actions";

  footer.appendChild(actions);


  const cancelButton =
    document.createElement("button");

  cancelButton.type =
    "button";

  cancelButton.className =
    "import-editor-button";

  cancelButton.textContent =
    "Cancel";

  actions.appendChild(cancelButton);


  const validateButton =
    document.createElement("button");

  validateButton.type =
    "button";

  validateButton.className =
    "import-editor-button";

  validateButton.textContent =
    "Validate";

  actions.appendChild(validateButton);


  const applyButton =
    document.createElement("button");

  applyButton.type =
    "button";

  applyButton.className =
    "import-editor-button import-editor-button--primary";

  applyButton.textContent =
    "Apply to Draft";

  applyButton.disabled =
    true;

  actions.appendChild(applyButton);


  document.body.appendChild(overlay);


  importEditorOverlay = overlay;
  importEditorTextarea = textarea;
  importEditorMessage = message;
  importEditorValidateButton = validateButton;
  importEditorApplyButton = applyButton;
  importEditorCancelButton = cancelButton;
  importEditorCloseButton = closeButton;
  importEditorFileInput = fileInput;
  importEditorFilePickButton = filePickButton;
  importEditorModal = modal;


  /*
    code-editor.js와 동일한 이유로 배경 클릭으로는 닫지 않는다 —
    붙여넣은 JSON이 실수로 날아가는 사고를 피한다. Cancel/닫기(✕)/
    ESC만 닫는 경로다.
  */

  cancelButton.addEventListener("click", closeImportEditor);
  closeButton.addEventListener("click", closeImportEditor);
  validateButton.addEventListener("click", handleImportEditorValidate);
  applyButton.addEventListener("click", handleImportEditorApply);

  textarea.addEventListener("input", () => {

    /*
      마지막으로 VALIDATE에 통과했던 텍스트와 지금 textarea 내용이
      더 이상 같다는 보장이 없다 — 항상 다시 VALIDATE를 눌러야만
      Apply가 가능하도록 되돌린다.
    */

    importEditorValidatedSkinPackage =
      null;

    importEditorApplyButton.disabled =
      true;

    setImportEditorMessage("", false);

  });


  /* ---- 파일 선택 ---- */

  filePickButton.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (event) => {

    const file =
      event.target.files && event.target.files[0];

    /* 같은 파일을 다시 골라도 change가 뜨도록 즉시 비운다 */
    event.target.value = "";

    loadImportEditorFile(file);

  });


  /* ---- drag & drop ----

     modal이 dropzone이다. overlay(뷰포트 전체)에서는 기본 동작만
     막는다 — modal 밖에 놓으면 아무 일도 일어나지 않되, 브라우저가
     그 파일을 열어 Studio를 떠나는 일도 없다. */

  /* 파일이 있을 때만 — 텍스트 drag(다른 창의 글자를 textarea에
     끌어다 놓기)는 브라우저 기본 동작에 그대로 맡긴다. */

  overlay.addEventListener("dragover", (event) => {
    if (dragHasFiles(event.dataTransfer)) {
      event.preventDefault();
    }
  });

  overlay.addEventListener("drop", (event) => {
    if (dragHasFiles(event.dataTransfer)) {
      event.preventDefault();
    }
  });

  modal.addEventListener("dragenter", (event) => {

    if (!dragHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();

    importEditorDragDepth += 1;

    modal.classList.add("import-editor-modal--dragover");

  });

  modal.addEventListener("dragover", (event) => {

    if (!dragHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();

    try {
      event.dataTransfer.dropEffect = "copy";
    } catch (err) {
      /* 일부 브라우저는 읽기 전용 — 무시 */
    }

  });

  modal.addEventListener("dragleave", () => {

    importEditorDragDepth =
      Math.max(0, importEditorDragDepth - 1);

    if (importEditorDragDepth === 0) {
      modal.classList.remove("import-editor-modal--dragover");
    }

  });

  modal.addEventListener("drop", (event) => {

    /* 텍스트 drop(다른 창의 글자 끌어오기)은 textarea 기본 동작에
       맡긴다 — 파일이 있을 때만 가로챈다. */
    if (!dragHasFiles(event.dataTransfer)) {
      resetImportEditorDragState();
      return;
    }

    event.preventDefault();

    resetImportEditorDragState();

    const file =
      event.dataTransfer.files && event.dataTransfer.files[0];

    loadImportEditorFile(file);

  });

}


function dragHasFiles(dataTransfer) {

  if (!dataTransfer) {
    return false;
  }

  const types =
    dataTransfer.types
      ? Array.prototype.slice.call(dataTransfer.types)
      : [];

  return types.indexOf("Files") !== -1;

}


function resetImportEditorDragState() {

  importEditorDragDepth = 0;

  if (importEditorModal) {
    importEditorModal.classList.remove("import-editor-modal--dragover");
  }

}


function isImportEditorJsonFile(file) {

  const name =
    String(file.name || "").toLowerCase();

  if (name.endsWith(".json")) {
    return true;
  }

  const type =
    String(file.type || "").toLowerCase();

  return (
    type === "application/json" ||
    type === "text/json"
  );

}


/*
  파일 선택과 drag & drop이 공유하는 단 하나의 입구. 파일 내용을
  textarea에 넣고(붙여넣기와 같은 상태로 만든 뒤) VALIDATE를 자동
  실행한다. 실패는 message로만 알리고 textarea/검증 상태는 건드리지
  않는다 — "파일을 잘못 놓았더니 붙여넣은 JSON이 날아갔다"가 없게.
*/
async function loadImportEditorFile(file) {

  if (!file) {
    return;
  }

  if (!importEditorIsOpen) {
    return;
  }

  if (!isImportEditorJsonFile(file)) {
    setImportEditorMessage(
      `.json 파일만 가져올 수 있습니다: ${file.name || "(이름 없음)"}`,
      true
    );
    return;
  }

  if (file.size > IMPORT_EDITOR_FILE_MAX_BYTES) {
    setImportEditorMessage(
      `파일이 너무 큽니다 (최대 ${Math.floor(IMPORT_EDITOR_FILE_MAX_BYTES / 1024 / 1024)}MB).`,
      true
    );
    return;
  }

  importEditorFilePickButton.disabled =
    true;

  setImportEditorMessage(`${file.name} 파일을 읽는 중...`, false);

  let text;

  try {

    text =
      await readImportEditorFileText(file);

  } catch (err) {

    console.error("[import-editor] file read failed", err);

    importEditorFilePickButton.disabled =
      false;

    setImportEditorMessage(
      `${file.name} 파일을 읽지 못했습니다.`,
      true
    );

    return;

  }

  importEditorFilePickButton.disabled =
    false;

  /* 파일을 읽는 동안 사용자가 창을 닫았을 수 있다 */
  if (!importEditorIsOpen) {
    return;
  }

  importEditorTextarea.value =
    text;

  /* 붙여넣기와 같은 상태로 — 이전 VALIDATE 결과를 버린다 */
  importEditorValidatedSkinPackage =
    null;

  importEditorApplyButton.disabled =
    true;

  await handleImportEditorValidate();

}


function readImportEditorFileText(file) {

  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {

    const reader =
      new FileReader();

    reader.onload =
      () => resolve(String(reader.result || ""));

    reader.onerror =
      () => reject(reader.error || new Error("file read failed"));

    reader.readAsText(file);

  });

}


document.addEventListener("keydown", (event) => {

  if (!importEditorIsOpen) {
    return;
  }

  if (event.key === "Escape") {
    closeImportEditor();
  }

});


function setImportEditorMessage(text, isError) {

  importEditorMessage.textContent =
    text || "";

  importEditorMessage.classList.toggle(
    "import-editor-message--error",
    !!isError
  );

}


function openSkinImportEditor({ onApply }) {

  if (!importEditorOverlay) {
    buildImportEditorDom();
  }

  importEditorCurrentOnApply =
    onApply;

  importEditorTextarea.value =
    "";

  importEditorValidatedSkinPackage =
    null;

  setImportEditorMessage("", false);

  importEditorValidateButton.disabled =
    false;

  importEditorApplyButton.disabled =
    true;

  importEditorFilePickButton.disabled =
    false;

  resetImportEditorDragState();

  importEditorOverlay.hidden =
    false;

  importEditorIsOpen =
    true;

  importEditorTextarea.focus();

}


function closeImportEditor() {

  if (!importEditorOverlay) {
    return;
  }

  importEditorOverlay.hidden =
    true;

  importEditorIsOpen =
    false;

  importEditorCurrentOnApply =
    null;

  importEditorValidatedSkinPackage =
    null;

  resetImportEditorDragState();

}


async function handleImportEditorValidate() {

  importEditorValidateButton.disabled =
    true;

  importEditorApplyButton.disabled =
    true;

  importEditorValidatedSkinPackage =
    null;

  setImportEditorMessage("확인하는 중...", false);

  const result =
    await window.validateSkinPackageImport(
      importEditorTextarea.value
    );

  importEditorValidateButton.disabled =
    false;

  if (!result.ok) {

    setImportEditorMessage(result.message, true);

    return;

  }

  importEditorValidatedSkinPackage =
    result.skinPackage;

  importEditorApplyButton.disabled =
    false;

  setImportEditorMessage(
    "검증 성공 — HOME/CATEGORY/POST 템플릿과 CSS를 확인했습니다. Apply to Draft를 누르면 현재 draft에 반영됩니다.",
    false
  );

}


function handleImportEditorApply() {

  if (!importEditorCurrentOnApply || !importEditorValidatedSkinPackage) {
    return;
  }

  importEditorApplyButton.disabled =
    true;

  try {

    importEditorCurrentOnApply(
      importEditorValidatedSkinPackage
    );

  } catch (err) {

    console.error(
      "[import-editor] onApply failed",
      err
    );

    setImportEditorMessage(
      (err && err.message) || "적용하지 못했습니다. 다시 시도해주세요.",
      true
    );

    importEditorApplyButton.disabled =
      false;

    return;

  }

  closeImportEditor();

}


if (typeof window !== "undefined") {

  window.openSkinImportEditor =
    openSkinImportEditor;

}
