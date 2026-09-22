/* =========================================================
   STUDIO — v2 HOME 캔버스에 **재료를 추가하는 자리**
   (HOME-CANVAS-V2-ADD-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §27
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14-13 (PLAN)

   ── 왜 파일이 또 갈라졌나 ──────────────────────────────
   studio-canvas-inspector.js 는 **고른 것 하나**의 화면이고
   studio-canvas-inspector-v2.js 는 그 v2 판이다. 추가는 다르다 —
   **아무것도 고르지 않았을 때도** 있어야 하고, 무엇을 고르고 있든
   같은 자리에 같은 모양으로 있어야 한다. 그래서 이 파일은
   "선택"이 아니라 "지금 캔버스가 v2 인가" 하나만 보고 그린다.

   ★ classic script 다. 앞 두 파일의 최상위 함수(studioCanvasInspectorNote
     등)를 그대로 쓴다 — window 에 올려 다리를 놓지 않는다.

   ── 무엇을 만들 수 있나 ────────────────────────────────

     자동 배치(흐름)  logo · category_nav · text · divider · main_visual
     페이지 자유 장식  photo · text · logo · category_nav · sticker · shape
     메인 비주얼 안    같은 여섯(HOME-CANVAS-V2-ELEMENTS-1 · 계약 §28-2)

   앞 두 표는 **계약의 그 두 표**이고, 이 파일은 관문
   (studio/inspector/studio-canvas-selection.js studioCanvasV2AddTypes)
   에 묻는다. 여기서 종류 목록을 한 벌 더 적지 않는다.

   ── 사진이 들어가는 종류 ───────────────────────────────
   `photo` · `sticker` · `logo` 와 `main_visual` 의 primary 사진은
   **이미지 슬롯 이름**이 필요하다(계약 §7). 그래서 이 패널에는
   슬롯 고르기 한 칸이 있고, 고르지 않으면 **빈 슬롯 하나를 함께
   선언한다** — 그림이 아직 없어도 저장되고 그려지며(빈 wrapper),
   Images 패널에 그 자리가 생겨 나중에 사진을 넣을 수 있다.

   ── 쓰기 ────────────────────────────────────────────────
   commitStudioCanvasAddNode() 하나를 지난다(관문 · draft · 기록 ·
   선택까지 그쪽이 한다). 이 파일은 draft 를 만지지 않는다.
========================================================== */


/* 사람이 읽는 종류 이름 — 값 표는 계약, 이름만 여기다 */
const STUDIO_CANVAS_V2_ADD_LABELS = {
  logo: "로고",
  category_nav: "카테고리",
  text: "글자",
  divider: "구분선",
  main_visual: "메인 비주얼",
  photo: "사진",
  sticker: "스티커",
  shape: "도형"
};


const STUDIO_CANVAS_V2_ADD_GROUPS = [
  { target: "flow", label: "자동 배치 — 위에서 아래로" },
  { target: "overlay", label: "페이지 자유 장식" }
];


/* =========================================================
   HOME-CANVAS-V2-ELEMENTS-1 — `main_visual` **안**에 넣는 자리

   ★ 이 한 줄만 선택을 본다. 다른 두 자리는 "어디에 넣을지"가
     언제나 정해져 있지만(흐름의 맨 뒤 · 자유 층의 맨 뒤) 프레임
     안은 **어느 프레임인가**를 먼저 알아야 하고, 그것을 추측으로
     정하지 않는 것이 계약 §28-2 다. 그래서 지금 고른 것이
     프레임이거나 그 안의 요소일 때만 이 자리가 보인다.
========================================================== */
function studioCanvasV2AddFrameId() {

  if (
    typeof window.getStudioCanvasSelection !== "function" ||
    typeof window.studioCanvasNodeInfo !== "function"
  ) {
    return null;
  }

  const selection =
    window.getStudioCanvasSelection();

  if (!selection || selection.ids.length !== 1 || !selection.primaryId) {
    return null;
  }

  const info =
    window.studioCanvasNodeInfo(selection.primaryId);

  if (!info) {
    return null;
  }

  if (info.kind === "block") {
    return info.type === "main_visual" ? info.id : null;
  }

  return (info.kind === "frame-element") ? info.parentId : null;

}


/* 거부 사유 → 사람이 읽는 한 줄 */
const STUDIO_CANVAS_V2_ADD_REJECT = {
  slot: "이미지 슬롯을 만들 수 없습니다 — Images 에서 슬롯을 확인해 주세요.",
  limit: "이 자리에는 더 넣을 수 없습니다(한 층에 200개).",
  canvas: "지금 캔버스는 v2 가 아닙니다.",
  "not-editing": "지금은 캔버스를 고칠 수 없습니다.",
  invalid: "계약을 어기는 모양이라 만들지 않았습니다.",
  "no-skin": "스킨을 아직 불러오지 못했습니다.",

  /* HOME-CANVAS-V2-ELEMENTS-1 — 프레임 안에 넣는 자리 */
  frame: "어느 메인 비주얼 안인지 알 수 없습니다 — 그 프레임을 다시 골라 주세요."
};


/*
  마지막으로 고른 슬롯. 패널 DOM 은 다시 만들어질 수 있고(다른 것을
  고르면 화면이 통째로 바뀐다) 그때마다 고른 슬롯이 처음으로
  돌아가면 사진 여럿을 같은 슬롯에 붙이려는 주인이 매번 다시 고른다.

    null  아직 고른 적 없음 → 비어 있는 첫 슬롯
    ""    "새 슬롯 만들기"
*/
let studioCanvasV2AddSlotChoice = null;


/* 지금 이 패널을 그릴 자리인가 — 선택과 무관하다 */
function studioCanvasV2AddIsOn() {

  if (
    typeof window.studioCanvasEditingIsOn !== "function" ||
    typeof window.studioCanvasPayloadVersion !== "function" ||
    typeof window.studioCanvasDraftPayload !== "function" ||
    typeof window.commitStudioCanvasAddNode !== "function"
  ) {
    return false;
  }

  if (!window.studioCanvasEditingIsOn()) {
    return false;
  }

  return window.studioCanvasPayloadVersion(window.studioCanvasDraftPayload()) === 2;

}


/* 지금 선언된 이미지 슬롯들 — Images 패널이 보는 그 목록 하나다 */
function studioCanvasV2AddSlots() {

  if (typeof window.getStudioImageSlotState !== "function") {
    return [];
  }

  const state =
    window.getStudioImageSlotState();

  return (state && Array.isArray(state.slots)) ? state.slots : [];

}


/* 그 칸이 지금 가리켜야 하는 값 */
function studioCanvasV2AddSlotValue(slots) {

  if (
    studioCanvasV2AddSlotChoice === "" ||
    (typeof studioCanvasV2AddSlotChoice === "string" &&
      slots.some((slot) => slot.name === studioCanvasV2AddSlotChoice))
  ) {
    return studioCanvasV2AddSlotChoice;
  }

  /* 비어 있는 첫 슬롯 — 이미 사진이 붙은 슬롯을 말없이 나눠 쓰면
     다른 요소의 그림이 함께 바뀐다 */
  const empty =
    slots.find((slot) => !slot.binding);

  return empty ? empty.name : "";

}


function studioCanvasV2AddSlotRow() {

  const row =
    document.createElement("div");

  row.className = "studio-inspector-row studio-canvas-add-slot";

  const label =
    document.createElement("label");

  label.className = "studio-inspector-row-label";
  label.htmlFor = "studioCanvasAddSlot";
  label.textContent = "사진 슬롯";

  const select =
    document.createElement("select");

  select.className = "studio-inspector-select";
  select.id = "studioCanvasAddSlot";

  select.addEventListener("change", () => {
    studioCanvasV2AddSlotChoice = select.value;
  });

  row.appendChild(label);
  row.appendChild(select);

  studioCanvasInspectorInputs.addSlot = select;

  return row;

}


/* 옵션만 갈아 끼운다 — 슬롯은 Images 패널 · Import · Undo 로 바뀐다 */
function syncStudioCanvasV2AddSlotOptions() {

  const select =
    studioCanvasInspectorInputs && studioCanvasInspectorInputs.addSlot;

  if (!select || select === document.activeElement) {
    return;
  }

  const slots =
    studioCanvasV2AddSlots();

  const wanted =
    slots
      .map((slot) => ({
        value: slot.name,
        text:
          `${slot.label} · ${slot.name}` +
          (slot.binding ? " · 사진 있음" : " · 비어 있음")
      }))
      .concat([{ value: "", text: "새 슬롯 만들기" }]);

  const shape =
    JSON.stringify(wanted);

  if (select.getAttribute("data-imory-options") !== shape) {

    select.textContent = "";

    wanted.forEach((item) => {

      const option =
        document.createElement("option");

      option.value = item.value;
      option.textContent = item.text;

      select.appendChild(option);

    });

    select.setAttribute("data-imory-options", shape);

  }

  select.value =
    studioCanvasV2AddSlotValue(slots);

}


function setStudioCanvasV2AddMessage(text, isError) {

  const node =
    document.getElementById("studioCanvasAddMessage");

  if (!node) {
    return;
  }

  node.textContent = text || "";
  node.hidden = !text;

  node.classList.toggle("studio-canvas-add-message--error", !!isError);

}


/*
  한 번 누르면 한 칸 — 만들고, 고르고, 무엇이 생겼는지 적는다.

  ★ 실패해도 화면은 직전 그대로다. draft 를 고치는 곳은 관문
    하나이고 거기서 막히면 아무것도 바뀌지 않는다.
*/
function addStudioCanvasV2Material(target, type) {

  const select =
    studioCanvasInspectorInputs && studioCanvasInspectorInputs.addSlot;

  const result =
    window.commitStudioCanvasAddNode({
      target: target,
      type: type,
      slot: select ? select.value : "",

      /* HOME-CANVAS-V2-ELEMENTS-1 — 프레임 안은 **어느 프레임인가**를
         함께 보낸다. 누르는 그 순간의 선택에서 읽으므로, 그리고 나서
         선택이 바뀌었으면 관문이 다시 본다. */
      frameId:
        (target === "frame") ? (studioCanvasV2AddFrameId() || "") : ""
    });

  if (!result || !result.accepted) {

    const reason =
      (result && result.reason) || "rejected";

    setStudioCanvasV2AddMessage(
      Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_V2_ADD_REJECT, reason)
        ? STUDIO_CANVAS_V2_ADD_REJECT[reason]
        : "지금은 만들 수 없습니다.",
      true
    );

    return;

  }

  const name =
    STUDIO_CANVAS_V2_ADD_LABELS[type] || type;

  setStudioCanvasV2AddMessage(
    result.declaredSlot
      ? `${name}을(를) 만들고 빈 이미지 슬롯 "${result.declaredSlot}"을 함께 선언했습니다 — Images 에서 사진을 넣으세요.`
      : `${name}을(를) 만들었습니다.`,
    false
  );

}


function studioCanvasV2AddButton(target, type) {

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "studio-inspector-mini-button studio-canvas-add-button";
  button.id =
    `studioCanvasAdd-${target}-${type}`;

  button.textContent =
    `+ ${STUDIO_CANVAS_V2_ADD_LABELS[type] || type}`;

  button.addEventListener("click", () => addStudioCanvasV2Material(target, type));

  return button;

}


function buildStudioCanvasV2AddSection() {

  const box =
    document.createElement("div");

  box.className = "studio-canvas-inspector-add";
  box.id = "studioCanvasAdd";

  const caption =
    document.createElement("p");

  caption.className = "studio-inspector-block-label";
  caption.textContent = "재료 추가";

  box.appendChild(caption);

  /* HOME-CANVAS-V2-ELEMENTS-1 — 지금 프레임 안에 있으면 그 자리가
     맨 위다. 고른 것이 프레임(또는 그 안의 요소)일 때만 있다. */
  const frameId =
    studioCanvasV2AddFrameId();

  const groups =
    frameId
      ? [{ target: "frame", label: "메인 비주얼 안 — 사진 주변 장식" }]
          .concat(STUDIO_CANVAS_V2_ADD_GROUPS)
      : STUDIO_CANVAS_V2_ADD_GROUPS;

  groups.forEach((group) => {

    const types =
      (typeof window.studioCanvasV2AddTypes === "function")
        ? window.studioCanvasV2AddTypes(group.target)
        : null;

    if (!Array.isArray(types) || !types.length) {
      return;
    }

    const label =
      document.createElement("p");

    label.className = "studio-canvas-add-group";
    label.textContent = group.label;

    box.appendChild(label);

    const row =
      document.createElement("div");

    row.className = "studio-canvas-add-row";

    types.forEach((type) => {
      row.appendChild(studioCanvasV2AddButton(group.target, type));
    });

    box.appendChild(row);

  });

  box.appendChild(studioCanvasV2AddSlotRow());

  const message =
    document.createElement("p");

  message.className = "studio-canvas-add-message";
  message.id = "studioCanvasAddMessage";
  message.hidden = true;

  box.appendChild(message);

  syncStudioCanvasV2AddSlotOptions();

  return box;

}


function syncStudioCanvasV2AddSection() {

  syncStudioCanvasV2AddSlotOptions();

}


if (typeof window !== "undefined") {

  window.studioCanvasV2AddIsOn = studioCanvasV2AddIsOn;

  /* 진단 · 테스트가 보는 한 줄 */
  window.getStudioCanvasAddState =
    () => {

      const select =
        document.getElementById("studioCanvasAddSlot");

      return {
        on: studioCanvasV2AddIsOn(),
        visible: !!document.getElementById("studioCanvasAdd"),

        /* HOME-CANVAS-V2-ELEMENTS-1 — 지금 프레임 안에 넣을 수 있는가 */
        frameId: studioCanvasV2AddFrameId(),

        slot: select ? select.value : null,
        slotOptions:
          select ? Array.from(select.options).map((option) => option.value) : []
      };

    };

}
