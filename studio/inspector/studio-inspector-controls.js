/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 직접 수정 폼

   고른 요소에 **무엇을 보여줄까**를 정하고 그린다.

     buildStudioInspectorControls()   capabilities -> 컨트롤 목록
     studioInspectorNoteFor()         "왜 이건 못 고치나" 한 줄
     renderStudioInspectorControl()   컨트롤 한 개 그리기
     renderStudioInspectorPopover()   팝오버 전체 다시 그리기
     handleStudioInspectorAiRequest() "✦ AI 수정" 버튼

   ★ "모든 요소에 같은 설정 목록을 보여주지 않는다"(요구사항 7절)는
     buildStudioInspectorControls() 한 곳에서만 결정된다.

   ★ 텍스트 블록과 이미지 너비 블록은 여기서 그리지 않는다 —
     renderStudioInspectorControl()이 studio-inspector-text.js /
     studio-inspector-image-size.js로 넘긴다. 그 둘만 "임시 상태"를
     갖기 때문이다(나머지 컨트롤은 change 한 번 = 확정 한 번).

   ★ "✦ AI 수정"은 OpenAI를 부르지 않는다 — 선택을 유지한 채 AI
     Assistant를 열 뿐이다(아래 머리말).

   ★ 파일 나누기 (Inspector 파일 분리 라운드)
     Element Inspector는 한 파일(studio-inspector.js)에 다 있었다.
     동작은 그대로 두고 책임만 나눴다 — 전부 classic script이고,
     top-level let은 여러 script가 공유하는 **하나의** 전역 lexical
     환경에 들어가므로(studio-preview.js의 currentWorkingSkin을
     이 파일들이 그대로 읽는 것과 같은 방식) window에 상태를 따로
     노출하지 않는다.

       studio-inspector-state.js       공유 상태 · 선택 해석 · 임시 채널
       studio-inspector-overlay.js     overlay DOM · 좌표 변환 · 테두리/핸들/팝오버 위치
       studio-inspector-edit.js        확정 경로(patch/스타일/링크/Undo)
       studio-inspector-text.js        텍스트 임시 편집 · 적용 · 취소
       studio-inspector-image-size.js  이미지 너비 컨트롤 · 모서리 드래그
       studio-inspector-controls.js    직접 수정 폼 UI · 팝오버 그리기
       studio-inspector.js             진입 · lifecycle · 선택 상태 전이 · 전역 창구

     로드 순서는 위 순서 그대로다(studio/index.html ·
     studio/studio-lifecycle-scenario.html). state가 맨 앞인 이유는
     const/let이 TDZ를 갖기 때문이다 — 뒤 파일들이 **로드 시점에**
     그 값을 읽는다(overlay의 ResizeObserver, 이 파일의 토글 버튼
     리스너). 함수 선언은 전역 객체 속성이라 호출 시점에만 있으면
     되므로 순서에 걸리지 않는다.

   의존(이 파일보다 먼저 로드되어야 함):
   studio/inspector/studio-inspector-state.js,
   studio/inspector/studio-inspector-overlay.js
   (paintStudioInspectorHandles / placeStudioInspectorPopover).
   호출 시점 의존: studio-inspector-text.js,
   studio-inspector-image-size.js, studio-inspector-edit.js,
   studio/images/images-panel.js(openSkinImagesPanel),
   studio/ai/*(setStudioAiPanelOpen / renderStudioAiSelectionChip).
========================================================== */


/* =========================================================
   요소별 컨트롤 목록 — capabilities를 그대로 따른다

   "모든 요소에 같은 설정 목록을 보여주지 않는다"(요구사항 7절)는
   여기 한 곳에서만 결정된다. 컨트롤이 하나도 없으면 폼 자체를
   그리지 않고 이유만 보여준다.
========================================================== */

function buildStudioInspectorControls(info) {

  const can =
    info.capabilities;

  const controls = [];

  /* 텍스트 내용은 언제나 맨 위다 — 사용자가 가장 자주 하는 일이
     스타일 옵션 밑에 묻히지 않게. 고칠 수 없는 경우에도 자리는
     그대로 두고 "왜 없는지"를 그 자리에서 말해 준다(빈칸으로 두면
     고장으로 읽힌다). */
  if (can.text) {
    controls.push({ control: "text", type: "textBlock", label: "텍스트 내용" });
  } else if (
    info.bindPath &&
    (info.kind === "text" || info.kind === "link") &&
    !info.isProtectedRegion
  ) {
    controls.push({ control: "textBinding", type: "bindNote", label: "텍스트 내용" });
  }

  if (can.href) {
    controls.push({ control: "href", type: "text", label: "링크 주소" });
  }

  if (can.imageSource || can.imageClear) {
    controls.push({ control: "imageSource", type: "image", label: "이미지" });
  }

  if (can.size) {
    controls.push({ control: "size", type: "imageSize", label: "너비", unit: "px" });
  }

  if (can.crop) {
    controls.push({ control: "crop", type: "crop", label: "자르기" });
  }

  if (can.shape && info.kind === "image") {
    controls.push({
      control: "shape",
      type: "choice",
      label: "모양",
      options: [["square", "사각형"], ["soft", "약간 둥글게"], ["circle", "원형"]]
    });
  }

  if (can.imageAlign) {
    controls.push({
      control: "imageAlign",
      type: "choice",
      label: "정렬",
      options: [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]]
    });
  }

  if (can.typography) {
    controls.push(
      { control: "fontSize", type: "number", label: "글자 크기", unit: "px" },
      {
        control: "fontWeight",
        type: "choice",
        label: "굵기",
        options: [["400", "보통"], ["500", "중간"], ["700", "굵게"]]
      }
    );
  }

  if (can.color) {
    controls.push({ control: "color", type: "color", label: "글자색" });
  }

  if (can.background) {
    controls.push({ control: "background", type: "color", label: "배경색" });
  }

  if (can.border) {
    controls.push({ control: "border", type: "border", label: "테두리" });
  }

  if (can.shape && info.kind !== "image") {
    controls.push({ control: "radius", type: "number", label: "모서리 둥글기", unit: "px" });
  }

  if (can.padding) {
    controls.push({ control: "padding", type: "number", label: "안쪽 여백", unit: "px" });
  }

  if (can.align) {
    controls.push({
      control: "align",
      type: "choice",
      label: "정렬",
      options: [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]]
    });
  }

  return controls;

}


/* =========================================================
   "왜 이건 못 고치나"를 말해 주는 안내문

   보호/바인딩 때문에 옵션이 빠진 자리를 빈칸으로 두지 않는다 —
   사용자는 그걸 고장으로 읽는다.
========================================================== */

/* =========================================================
   데이터 연결 텍스트 — "왜 입력칸이 없는가"를 한 줄로

   bind가 걸린 텍스트는 렌더 때마다 그 값으로 덮어써지므로 스킨
   문구로 고칠 수 없다. 그 사실만 말하면 사용자는 "고장인가?"로
   읽는다 — **어디서 고치는 값인지**까지 말한다.
========================================================== */

const STUDIO_INSPECTOR_BIND_NOTES = {
  "profile.nickname": "Settings에서 관리하는 닉네임입니다.",
  "profile.bio": "Settings에서 관리하는 소개글입니다.",
  "profile.avatarUrl": "Settings에서 관리하는 프로필 사진입니다.",
  "site.title": "Settings에서 관리하는 사이트 제목입니다.",
  "post.title": "글 제목이라 글 편집 화면에서 바뀝니다.",
  "post.createdAt": "글을 쓴 날짜라 글에서 옵니다.",
  "category.name": "카테고리 이름이라 카테고리 관리에서 바뀝니다.",
  "folder.name": "폴더 이름이라 카테고리 관리에서 바뀝니다.",
  "item.title": "목록에 들어오는 글 제목이라 글에서 옵니다.",
  "item.name": "목록 항목 이름이라 그 항목의 데이터에서 옵니다."
};


function studioInspectorBindNote(bindPath) {

  return (
    STUDIO_INSPECTOR_BIND_NOTES[bindPath] ||
    `${bindPath} 값으로 자동으로 채워지는 자리입니다.`
  );

}


function studioInspectorNoteFor(info) {

  if (info.isProtectedRegion) {
    return "이 자리는 글 본문이 표시되는 보호 영역이라 직접 수정할 수 없어요.";
  }

  const notes = [];

  if (info.bindPath) {
    notes.push(`내용은 ${info.bindPath} 값으로 자동으로 채워져요.`);
  }

  if (info.isViewerBinding) {
    notes.push("관리자용 링크라 주소는 바꿀 수 없어요.");
  } else if (info.hrefPath) {
    notes.push(`주소는 ${info.hrefPath} 값으로 자동으로 채워져요.`);
  }

  if (info.srcPath && info.kind === "image" && !info.imageSlot) {
    notes.push("글/배너 데이터에서 오는 이미지라 여기서 교체할 수 없어요.");
  }

  if (info.isInsideRepeat || info.isRepeatTemplate) {
    notes.push("반복되는 항목이라 같은 자리 전체에 함께 적용돼요.");
  }

  return notes.join(" ");

}


/* =========================================================
   폼 그리기
========================================================== */

function appendStudioInspectorRow(label, controlNode, clearHandler) {

  const row =
    document.createElement("label");

  row.className =
    "studio-inspector-row";

  const caption =
    document.createElement("span");

  caption.className =
    "studio-inspector-row-label";

  caption.textContent =
    label;

  row.appendChild(caption);
  row.appendChild(controlNode);

  if (clearHandler) {

    const clear =
      document.createElement("button");

    clear.type =
      "button";

    clear.className =
      "studio-inspector-clear";

    clear.textContent =
      "기본";

    clear.addEventListener("click", clearHandler);

    row.appendChild(clear);

  }

  studioInspectorFields.appendChild(row);

}


function renderStudioInspectorBindNote(spec, info) {

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    spec.label;

  const note =
    document.createElement("p");

  note.className =
    "studio-inspector-block-note";

  note.id =
    "studioInspectorBindNote";

  note.dataset.inspectorControl =
    "textBinding";

  note.textContent =
    studioInspectorBindNote(info.bindPath);

  block.appendChild(caption);
  block.appendChild(note);

  studioInspectorFields.appendChild(block);

}


function renderStudioInspectorControl(spec, info, declarations) {

  const current =
    window.readInspectorControlValue(spec.control, declarations);

  if (spec.type === "textBlock") {

    renderStudioInspectorTextBlock(spec, info);

    return;

  }

  if (spec.type === "bindNote") {

    renderStudioInspectorBindNote(spec, info);

    return;

  }

  if (spec.type === "imageSize") {

    renderStudioInspectorSizeBlock(spec, info, declarations);

    return;

  }

  if (spec.type === "crop") {

    renderStudioInspectorCropBlock(spec, info, declarations);

    return;

  }

  if (spec.type === "text") {

    const input =
      document.createElement("input");

    input.type = "text";
    input.className = "studio-inspector-input";
    input.dataset.inspectorControl = spec.control;

    input.value =
      info.staticHref || "";

    input.addEventListener("change", () => {
      commitStudioInspectorHref(input.value);
    });

    appendStudioInspectorRow(spec.label, input);

    return;

  }

  if (spec.type === "number") {

    const input =
      document.createElement("input");

    input.type = "number";
    input.min = "0";
    input.className = "studio-inspector-input studio-inspector-input--number";
    input.dataset.inspectorControl = spec.control;
    input.value = current;
    input.placeholder = "기본";

    input.addEventListener("change", () => {
      commitStudioInspectorStyle(spec.control, input.value);
    });

    appendStudioInspectorRow(
      `${spec.label}${spec.unit ? ` (${spec.unit})` : ""}`,
      input,
      () => commitStudioInspectorStyle(spec.control, "")
    );

    return;

  }

  if (spec.type === "color") {

    const input =
      document.createElement("input");

    input.type = "color";
    input.className = "studio-inspector-color";
    input.dataset.inspectorControl = spec.control;
    input.value = current || "#000000";

    input.addEventListener("change", () => {
      commitStudioInspectorStyle(spec.control, input.value);
    });

    appendStudioInspectorRow(
      spec.label,
      input,
      () => commitStudioInspectorStyle(spec.control, "")
    );

    return;

  }

  if (spec.type === "choice") {

    const group =
      document.createElement("span");

    group.className =
      "studio-inspector-choice";

    spec.options.forEach(([value, text]) => {

      const option =
        document.createElement("button");

      option.type = "button";
      option.className = "studio-inspector-choice-option";
      option.dataset.inspectorControl = spec.control;
      option.dataset.inspectorValue = value;
      option.textContent = text;

      if (current === value) {
        option.classList.add("is-active");
      }

      option.addEventListener("click", () => {
        commitStudioInspectorStyle(spec.control, current === value ? "" : value);
      });

      group.appendChild(option);

    });

    appendStudioInspectorRow(spec.label, group);

    return;

  }

  if (spec.type === "border") {

    const group =
      document.createElement("span");

    group.className =
      "studio-inspector-choice";

    const width =
      document.createElement("input");

    width.type = "number";
    width.min = "0";
    width.className = "studio-inspector-input studio-inspector-input--number";
    width.dataset.inspectorControl = "borderWidth";
    width.value = current.width;
    width.placeholder = "0";

    const color =
      document.createElement("input");

    color.type = "color";
    color.className = "studio-inspector-color";
    color.dataset.inspectorControl = "borderColor";
    color.value = current.color || "#000000";

    const apply = () =>
      commitStudioInspectorStyle("border", { width: width.value, color: color.value });

    width.addEventListener("change", apply);
    color.addEventListener("change", apply);

    group.appendChild(width);
    group.appendChild(color);

    appendStudioInspectorRow(
      spec.label,
      group,
      () => commitStudioInspectorStyle("border", { width: "", color: "" })
    );

    return;

  }

  if (spec.type === "image") {

    const group =
      document.createElement("span");

    group.className =
      "studio-inspector-choice";

    const change =
      document.createElement("button");

    change.type = "button";
    change.className = "studio-inspector-choice-option";
    change.id = "studioInspectorImageChange";
    change.textContent = "이미지 변경";
    change.disabled = !info.capabilities.imageSource;

    change.addEventListener("click", () => {

      if (typeof window.openSkinImagesPanel === "function") {
        window.openSkinImagesPanel();
      } else {
        showStudioToast("이미지 라이브러리를 열 수 없어요.", { isError: true });
      }

    });

    const clear =
      document.createElement("button");

    clear.type = "button";
    clear.className = "studio-inspector-choice-option";
    clear.id = "studioInspectorImageClear";
    clear.textContent = "이미지 제거";
    clear.disabled = !info.capabilities.imageClear;

    clear.addEventListener("click", () => {

      if (typeof window.setStudioImageSlot !== "function") {
        return;
      }

      if (window.setStudioImageSlot(info.imageSlot, null)) {
        showStudioToast("이미지를 비웠어요.");
      }

    });

    group.appendChild(change);
    group.appendChild(clear);

    appendStudioInspectorRow(
      `${spec.label} (${info.imageSlot || "슬롯 없음"})`,
      group
    );

    return;

  }

}


/* 팝오버가 "다른 모양"으로 바뀜는가. 이것이 바뀌었을 때만
   자리를 다시 고른다 — 같은 모양으로 내용만 다시 그리는
   경우(자르기 확대·구도 갱신, 크기 확정)는 손이 올라가 있는
   판이므로 그 자리 그대로 둔다(요구사항 C,
   studio-inspector-overlay.js placeStudioInspectorPopover 머리말). */
let studioInspectorPopoverShape = "";

function studioInspectorPopoverShapeOf(resolved) {

  return [
    studioInspectorSelection ? studioInspectorSelection.editId : "",
    resolved ? resolved.info.kind : "",
    studioInspectorEditingOpen ? "open" : "shut",
    studioInspectorCropDraft ? "crop" : "-"
  ].join("|");

}


function renderStudioInspectorPopover() {

  if (!studioInspectorPopover) {
    return;
  }

  const resolved =
    describeStudioInspectorSelection();

  /* 폼을 다시 그리는 순간 이전 입력 요소 참조는 전부 죽는다 —
     드래그가 그 참조로 값을 쓰지 않도록 먼저 끊는다. */
  studioInspectorSizeRange = null;
  studioInspectorSizeNumber = null;
  studioInspectorCropZoomRange = null;

  if (!resolved) {

    studioInspectorPopover.hidden = true;
    studioInspectorSelectBox.hidden = true;

    studioInspectorResizable = false;

    studioInspectorPopoverShape = "";

    resetStudioInspectorPopoverPlacement();

    paintStudioInspectorHandles(null, null);

    notifyStudioInspectorSelectionChanged();

    return;

  }

  studioInspectorResizable =
    resolved.info.kind === "image" &&
    resolved.info.capabilities.size === true;

  studioInspectorPopover.hidden =
    false;

  studioInspectorPopoverTitle.textContent =
    studioInspectorLabelFor(resolved.info);

  const note =
    studioInspectorNoteFor(resolved.info);

  studioInspectorNote.textContent =
    note;

  studioInspectorNote.hidden =
    !note;

  studioInspectorDirectButton.setAttribute(
    "aria-expanded",
    String(studioInspectorEditingOpen)
  );

  studioInspectorFields.innerHTML =
    "";

  studioInspectorFields.hidden =
    !studioInspectorEditingOpen;

  if (studioInspectorEditingOpen) {

    const controls =
      buildStudioInspectorControls(resolved.info);

    if (!controls.length) {

      const empty =
        document.createElement("p");

      empty.className =
        "studio-inspector-empty";

      empty.textContent =
        "이 요소에는 직접 수정할 수 있는 항목이 없어요.";

      studioInspectorFields.appendChild(empty);

    } else {

      /* 컨트롤마다 "지금 값"을 어느 규칙에서 읽을지 물어본다 —
         자른 이미지의 너비·모양·정렬은 이미지가 아니라 프레임
         (래퍼)의 규칙에 들어 있다(studio-inspector-crop.js). */
      controls.forEach((spec) => {
        renderStudioInspectorControl(
          spec,
          resolved.info,
          studioInspectorCropDeclarationsFor(spec.control, resolved)
        );
      });

    }

  }

  studioInspectorUndoButton.hidden =
    !studioInspectorUndo;

  paintStudioInspectorHandles(
    studioInspectorSelection ? studioInspectorSelection.rect : null,
    studioInspectorSelection
      ? (studioInspectorSelection.visibleRect || studioInspectorSelection.rect)
      : null
  );

  const shape =
    studioInspectorPopoverShapeOf(resolved);

  const shapeChanged =
    shape !== studioInspectorPopoverShape;

  studioInspectorPopoverShape =
    shape;

  placeStudioInspectorPopover(
    studioInspectorSelection
      ? (studioInspectorSelection.visibleRect || studioInspectorSelection.rect)
      : null,
    { force: shapeChanged }
  );

  notifyStudioInspectorSelectionChanged();

}


/* =========================================================
   "✦ AI 수정" (PHASE AI-6B)

   ★ 이 버튼은 OpenAI를 부르지 않는다.
   하는 일은 "선택을 유지한 채 AI Assistant를 열고 입력칸에 커서를
   둔다"가 전부다. 실제 호출은 사용자가 문장을 쓰고 Send를 눌렀을
   때 studio/ai/studio-ai-panel.js가 한다(요구사항 1절).

   패널이 이미 열려 있으면 setStudioAiPanelOpen()은 아무 것도 하지
   않고 포커스도 옮기지 않는다 — 그래서 포커스는 여기서 한 번 더
   직접 준다. 두 번 눌러도 결과가 같아야 한다.
========================================================== */

function handleStudioInspectorAiRequest() {

  if (!describeStudioInspectorSelection()) {
    return;
  }

  if (typeof window.setStudioAiPanelOpen === "function") {
    window.setStudioAiPanelOpen(true);
  }

  if (typeof window.renderStudioAiSelectionChip === "function") {
    window.renderStudioAiSelectionChip();
  }

  const input =
    document.getElementById("studioAiDrawerInput");

  if (input) {
    input.focus();
  }

}
