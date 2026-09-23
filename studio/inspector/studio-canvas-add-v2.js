/* =========================================================
   STUDIO — v2 HOME 캔버스에 **재료를 추가하는 자리**
   (HOME-CANVAS-V2-ADD-1 · STUDIO-LAYERS-MATERIALS-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §27 · §35
   로드맵:    docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §3

   ── 왜 파일이 갈라져 있나 ──────────────────────────────
   studio-canvas-inspector.js 는 **고른 것 하나**의 화면이고
   studio-canvas-inspector-v2.js 는 그 v2 판이다. 추가는 다르다 —
   **아무것도 고르지 않았을 때도** 있어야 하고, 무엇을 고르고 있든
   같은 자리에 같은 모양으로 있어야 한다. 그래서 이 파일은
   "선택"이 아니라 "지금 캔버스가 v2 인가" 하나만 보고 그린다.

   ── 어느 패널에 붙는가 (STUDIO-LAYERS-SHELL-1) ─────────
   **Layers 패널**이다(studio/inspector/studio-canvas-layers.js).
   STUDIO-LAYERS-MATERIALS-1A 부터는 그 패널의 **하위 화면**이다 —
   `＋ 재료 추가`를 누르면 트리가 물러나고 이 화면이 그 자리에 선다.
   머리(`← Layers` · 제목)는 Layers 가 그린다(그 패널이 어디로
   돌아갈지를 아는 유일한 곳이라), 이 파일은 **본문**만 만든다.

   ── 이 라운드가 바꾼 것 (STUDIO-LAYERS-MATERIALS-1A) ────
   화면의 **생김새와 고르는 방법**뿐이다. 세로로 늘어선 글자 단추
   대신 분류 둘과 카드 격자를 그린다.

     · 쓰기 경로는 한 글자도 바뀌지 않았다 —
       commitStudioCanvasAddNode() → addStudioCanvasV2Node() →
       writeSkinHomeCanvasV2AddNode() 그대로다.
     · 새 저장 모양도 새 재료 종류도 만들지 않았다. 카드가 가리키는
       것은 전부 계약이 이미 받는 종류다(§27-2 · §28-2).
     · 종류 표를 한 벌 더 적지 않는다 — 어느 자리가 무엇을 받는지는
       여전히 관문(studioCanvasV2AddTypes)에 묻는다.

   ── 화면 (§35-2) ───────────────────────────────────────

     홈 구성   로고 · 카테고리 메뉴 · 메인 비주얼
     꾸미기    사진 · 글자 · 구분선 · 도형 · 디자인 요소

   "필수 요소"라고 부르지 않는다. 지우거나 숨길 수 있는 것들이라
   사용자 화면의 이름은 **홈 구성** 하나로 통일한다.

   ── 카드 하나가 아는 것 ────────────────────────────────

     type      계약의 재료 종류 하나
     targets   넣을 자리의 **우선순위**. 앞에서부터 "지금 그 자리가
               이 종류를 받는가"를 관문에 물어 첫 번째로 되는 곳을
               쓴다. 되는 곳이 없으면 그 카드는 **준비 중**이다.
     unique    이미 있으면 새로 만들지 않고 **그것을 고른다**(§35-4)
     items     하위 재료 목록. 지금은 카드마다 하나뿐이라 누르면
               곧바로 그 하나를 만든다. 둘 이상이 되는 날
               (STUDIO-LAYERS-MATERIALS-1B) 그때 하위 화면이 열린다 —
               이번 라운드에서 그 화면을 미리 만들지 않는다.

   ── 사진이 들어가는 종류 ───────────────────────────────
   `photo` · `sticker` · `logo` 와 `main_visual` 의 primary 사진은
   **이미지 슬롯 이름**이 필요하다(계약 §7). 그래서 이 화면 아래에
   슬롯 고르기 한 칸이 그대로 있고, 고르지 않으면 **빈 슬롯 하나를
   함께 선언한다** — 그림이 아직 없어도 저장되고 그려지며(빈 wrapper),
   나중에 Layers 의 그 행에서 사진을 넣을 수 있다.

   ── 쓰기 ────────────────────────────────────────────────
   commitStudioCanvasAddNode() 하나를 지난다(관문 · draft · 기록 ·
   선택까지 그쪽이 한다). 이 파일은 draft 를 만지지 않는다.

   ★ classic script 다. 앞 파일들의 최상위 함수를 그대로 쓴다 —
     window 에 올려 다리를 놓지 않는다.
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


/* 화면의 두 분류 (§35-2) */
const STUDIO_CANVAS_MATERIAL_GROUPS = [
  {
    key: "home",
    label: "홈 구성",
    note: "홈에 한 번씩 놓는 자리입니다."
  },
  {
    key: "decor",
    label: "꾸미기",
    note: "원하는 만큼 더할 수 있습니다."
  }
];


/* =========================================================
   카드 표

   ★ 여기 적힌 것은 **이름 · 설명 · 어느 자리를 먼저 보는가** 뿐이다.
     받는 종류의 표도, 새 요소의 기본값도 여기 없다(각각 계약의 두
     배열과 순수 함수가 정한다).

   ★ `targets` 의 `frame` 은 지금 `main_visual` 을 고르고 있을 때만
     쓸 수 있다(§28-2 — 소속은 언제나 명시적이다). 고르고 있지 않으면
     자동으로 다음 자리(`overlay`)로 내려간다.
========================================================== */
const STUDIO_CANVAS_MATERIAL_CARDS = [

  {
    key: "logo",
    group: "home",
    type: "logo",
    targets: ["flow"],
    unique: true,
    label: "로고",
    desc: "사이트 이름이나 로고 이미지",
    icon: "logo",
    items: [{ key: "logo", label: "로고", type: "logo" }]
  },

  {
    key: "category_nav",
    group: "home",
    type: "category_nav",
    targets: ["flow"],
    unique: true,
    label: "카테고리 메뉴",
    desc: "글 목록으로 이동하는 메뉴",
    icon: "nav",
    items: [{ key: "category_nav", label: "카테고리 메뉴", type: "category_nav" }]
  },

  {
    key: "main_visual",
    group: "home",
    type: "main_visual",
    targets: ["flow"],
    unique: true,
    label: "메인 비주얼",
    desc: "홈의 중심이 되는 사진 영역",
    icon: "main",
    items: [{ key: "main_visual", label: "메인 비주얼", type: "main_visual" }]
  },

  {
    key: "photo",
    group: "decor",
    type: "photo",
    targets: ["frame", "overlay"],
    unique: false,
    label: "사진",
    desc: "원하는 이미지를 배치",
    icon: "photo",
    items: [{ key: "photo", label: "사진", type: "photo" }]
  },

  {
    key: "text",
    group: "decor",
    type: "text",
    targets: ["frame", "overlay"],
    unique: false,
    label: "글자",
    desc: "제목이나 설명 추가",
    icon: "text",
    items: [{ key: "text", label: "글자", type: "text" }]
  },

  {
    key: "divider",
    group: "decor",
    type: "divider",

    /* 흐름만 받는다(§27-2) — 자유 층에는 `divider` 가 없다 */
    targets: ["flow"],
    unique: false,
    label: "구분선",
    desc: "영역 사이를 구분",
    icon: "divider",
    items: [{ key: "divider", label: "구분선", type: "divider" }]
  },

  {
    key: "shape",
    group: "decor",
    type: "shape",
    targets: ["frame", "overlay"],
    unique: false,
    label: "도형",
    desc: "사각형·원 등 기본 도형",
    icon: "shape",

    /* ★ 계약에는 `rect` · `ellipse` · `line` 셋이 있지만(§8) 지금
       쓰기 경로가 만드는 것은 기본값 하나(`rect`)다. 나머지 둘을
       고르는 하위 화면이 STUDIO-LAYERS-MATERIALS-1B 다 — 여기서
       임시 데이터로 만들지 않는다. */
    items: [{ key: "shape_rect", label: "사각형", type: "shape" }]
  },

  {
    key: "sticker",
    group: "decor",
    type: "sticker",
    targets: ["frame", "overlay"],
    unique: false,
    label: "디자인 요소",
    desc: "테이프·스티커 같은 장식",
    icon: "sticker",

    /* ★ 테이프 · 종이 조각 · 배지 같은 **프리셋**은 아직 없다.
       지금 계약으로 표현되는 장식은 `sticker` 하나이고, 그 하나를
       곧바로 만든다(§35-6). 프리셋 데이터와 이미지를 이번 라운드에
       대량으로 들여오지 않는다. */
    items: [{ key: "sticker", label: "스티커", type: "sticker" }]
  }

];


/* =========================================================
   카드 그림 — 24×24 한 벌

   ★ 아이콘 폰트도 이미지 파일도 새로 들이지 않는다. 선 몇 개짜리
     SVG 라 색은 `currentColor` 를 따르고, 다크/라이트에서 따로
     손보지 않아도 된다.
========================================================== */
const STUDIO_MATERIAL_ICON_NS = "http://www.w3.org/2000/svg";

const STUDIO_MATERIAL_ICONS = {

  logo: [
    ["rect", { x: "3", y: "6", width: "18", height: "12", rx: "2.5" }],
    ["path", { d: "M8.4 14.6 11 9.4l2.6 5.2" }],
    ["path", { d: "M9.4 13h3.2" }]
  ],

  nav: [
    ["path", { d: "M4 7.5h16" }],
    ["path", { d: "M4 12h10" }],
    ["path", { d: "M4 16.5h13" }]
  ],

  main: [
    ["rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }],
    ["rect", { x: "6.5", y: "8", width: "7.5", height: "8", rx: "1.5" }],
    ["circle", { cx: "17.2", cy: "10.2", r: "1.4" }]
  ],

  photo: [
    ["rect", { x: "4", y: "6", width: "16", height: "12", rx: "2" }],
    ["circle", { cx: "9", cy: "10.4", r: "1.3" }],
    ["path", { d: "M5.2 16.4 9.4 12.4l2.8 2.4 3.2-2.8 3.4 3.2" }]
  ],

  text: [
    ["path", { d: "M6 7.5h12" }],
    ["path", { d: "M12 7.5v9" }],
    ["path", { d: "M9.4 16.5h5.2" }]
  ],

  divider: [
    ["path", { d: "M6 7.5h12" }],
    ["path", { d: "M3 12h18" }],
    ["path", { d: "M6 16.5h12" }]
  ],

  shape: [
    ["rect", { x: "3.5", y: "4.5", width: "9", height: "9", rx: "1.2" }],
    ["circle", { cx: "15.5", cy: "15.5", r: "4.8" }]
  ],

  sticker: [
    ["path", { d: "M5.5 4h9l5 5v11h-14z" }],
    ["path", { d: "M14.5 4v5h5" }]
  ]

};


function studioCanvasMaterialIcon(kind) {

  const svg =
    document.createElementNS(STUDIO_MATERIAL_ICON_NS, "svg");

  svg.setAttribute("class", "studio-material-card-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const shapes =
    Object.prototype.hasOwnProperty.call(STUDIO_MATERIAL_ICONS, kind)
      ? STUDIO_MATERIAL_ICONS[kind]
      : [];

  shapes.forEach((shape) => {

    const node =
      document.createElementNS(STUDIO_MATERIAL_ICON_NS, shape[0]);

    Object.keys(shape[1]).forEach((name) => {
      node.setAttribute(name, shape[1][name]);
    });

    svg.appendChild(node);

  });

  return svg;

}


/* =========================================================
   HOME-CANVAS-V2-ELEMENTS-1 — `main_visual` **안**에 넣는 자리

   ★ 이 한 줄만 선택을 본다. 다른 두 자리는 "어디에 넣을지"가
     언제나 정해져 있지만(흐름의 맨 뒤 · 자유 층의 맨 뒤) 프레임
     안은 **어느 프레임인가**를 먼저 알아야 하고, 그것을 추측으로
     정하지 않는 것이 계약 §28-2 다. 그래서 지금 고른 것이
     프레임이거나 그 안의 요소일 때만 그 자리가 쓰인다.
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
  slot: "이미지 슬롯을 만들 수 없습니다 — 사진 슬롯을 확인해 주세요.",
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


/*
  STUDIO-LAYERS-SHELL-1 — 슬롯 칸의 DOM 참조.

  예전에는 Inspector 의 입력 장부(studioCanvasInspectorInputs.addSlot)
  에 넣어 두었다. 그 장부는 **고른 요소가 바뀔 때마다 비워지는**
  것이라, 추가 자리가 Select 를 떠나 Layers 로 옮겨 온 지금은 그
  장부에 매달아 둘 수 없다(Select 를 한 번 다시 그리면 Layers 안에
  살아 있는 칸의 참조가 사라진다). 그래서 이 파일이 직접 들고 있고,
  Layers 가 화면을 다시 만들면 새 칸이 이 자리를 대신한다.
*/
let studioCanvasV2AddSlotSelect = null;


/* 지금 그려져 있는 카드 단추들 — key → button. 같은 이유로 이
   파일이 직접 들고 있고, 화면을 다시 만들면 통째로 갈린다. */
let studioCanvasMaterialCardNodes = {};


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


/* 지금 선언된 이미지 슬롯들 — 사진 자리 목록이 보는 그 목록 하나다 */
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

  row.className = "studio-canvas-add-slot";

  const label =
    document.createElement("label");

  label.className = "studio-canvas-add-slot-label";
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

  studioCanvasV2AddSlotSelect = select;

  return row;

}


/* 옵션만 갈아 끼운다 — 슬롯은 사진 넣기 · Import · Undo 로 바뀐다 */
function syncStudioCanvasV2AddSlotOptions() {

  /* ★ "아직 문서에 붙었는가"를 보지 않는다. buildStudioCanvasV2AddSection()
     이 상자를 **붙이기 전에** 이 함수를 부르므로(그래야 처음 그려질 때
     이미 옵션과 기본값이 들어 있다), isConnected 로 거르면 첫 화면의
     슬롯 칸이 통째로 비어 버린다. 낡은 참조는 다음 build 가 덮는다. */
  const select =
    studioCanvasV2AddSlotSelect;

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


/* =========================================================
   카드 하나의 지금 상태 (§35-3 · §35-4)

     add    누르면 만든다
     added  이미 있다 → 누르면 **그것을 고른다**(중복으로 만들지 않는다)
     soon   지금 계약에 이 재료를 받는 자리가 없다 → 준비 중

   ★ 셋 다 **읽기**다. 여기서 draft 를 만지지 않는다.
========================================================== */

/* `unique` 카드가 가리키는, 이미 있는 그 요소 — 없으면 null */
function studioCanvasMaterialExistingId(card) {

  if (!card.unique || typeof window.studioCanvasNodeList !== "function") {
    return null;
  }

  /* ★ 자리를 가리지 않는다. 흐름에 로고가 없어도 프레임 안에 하나
     있으면 "이미 있는" 것이다 — 사용자가 보는 화면에는 로고가 하나
     있기 때문이다. */
  const hit =
    window.studioCanvasNodeList().find((node) => node && node.type === card.type);

  return hit ? hit.id : null;

}


/* 이 카드를 지금 넣을 수 있는 자리 — 없으면 null(준비 중) */
function studioCanvasMaterialTarget(card) {

  if (typeof window.studioCanvasV2AddTypes !== "function") {
    return null;
  }

  const frameId =
    studioCanvasV2AddFrameId();

  for (let i = 0; i < card.targets.length; i += 1) {

    const target =
      card.targets[i];

    /* 프레임 안은 **어느 프레임인가**를 알 때만 쓴다(§28-2) */
    if (target === "frame" && !frameId) {
      continue;
    }

    const types =
      window.studioCanvasV2AddTypes(target);

    if (Array.isArray(types) && types.indexOf(card.type) !== -1) {
      return target;
    }

  }

  return null;

}


function studioCanvasMaterialState(card) {

  const existingId =
    studioCanvasMaterialExistingId(card);

  if (existingId) {
    return { state: "added", target: null, existingId: existingId };
  }

  const target =
    studioCanvasMaterialTarget(card);

  return {
    state: target ? "add" : "soon",
    target: target,
    existingId: null
  };

}


/* =========================================================
   만들기

   한 번 누르면 한 칸 — 만들고, 고르고, **Layers 트리로 돌아가
   그 행을 보여 준다**(§35-3).

   ★ 실패해도 화면은 직전 그대로다. draft 를 고치는 곳은 관문
     하나이고 거기서 막히면 아무것도 바뀌지 않는다. 그때는 이 화면에
     머문 채 왜 안 됐는지만 적는다.
========================================================== */
function addStudioCanvasV2Material(target, type) {

  const select =
    studioCanvasV2AddSlotSelect;

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

    return result || { accepted: false, reason: reason };

  }

  const name =
    STUDIO_CANVAS_V2_ADD_LABELS[type] || type;

  setStudioCanvasV2AddMessage("", false);

  /* 트리로 돌아가 방금 만든 행을 드러낸다. 돌아갈 곳을 아는 것은
     Layers 하나뿐이라 그쪽 창구를 쓴다(창구가 없으면 — 이 파일만
     실린 문서 — 그냥 여기 머문다). */
  if (typeof window.revealStudioCanvasLayersRow === "function") {

    window.revealStudioCanvasLayersRow(
      result.id,
      result.declaredSlot
        ? `${name}을(를) 만들고 빈 사진 자리를 함께 만들었습니다 — 그 행의 사진을 눌러 넣으세요.`
        : `${name}을(를) 만들었습니다.`
    );

  }

  return result;

}


/* 이미 있는 것을 **고르는** 길 (§35-4) */
function selectStudioCanvasMaterial(elementId) {

  if (typeof window.proposeStudioCanvasSelection !== "function") {
    return false;
  }

  const accepted =
    window.proposeStudioCanvasSelection({
      ids: [elementId],
      primaryId: elementId,
      mode: "replace"
    });

  if (typeof window.revealStudioCanvasLayersRow === "function") {

    window.revealStudioCanvasLayersRow(
      elementId,
      "이미 있는 요소를 골랐습니다 — 새로 만들지 않았습니다."
    );

  }

  return accepted !== false;

}


function studioCanvasMaterialClick(card) {

  const now =
    studioCanvasMaterialState(card);

  if (now.state === "added") {
    selectStudioCanvasMaterial(now.existingId);
    return;
  }

  if (now.state === "soon") {

    /* ★ 여기서 draft 를 만지지 않는다. 단추는 이미 disabled 이지만
       (합성 클릭 · 낡은 화면에서 새어 들어올 수 있으므로) 같은
       판정을 한 번 더 한다. */
    setStudioCanvasV2AddMessage(
      `${card.label}은(는) 아직 준비 중입니다.`,
      false
    );

    return;

  }

  /* 지금은 카드마다 재료가 하나다 — 누르면 곧바로 그 하나를 만든다.
     둘 이상이 되는 날 여기서 하위 화면이 열린다(MATERIALS-1B). */
  addStudioCanvasV2Material(now.target, card.items[0].type);

}


/* =========================================================
   카드 격자
========================================================== */

function studioCanvasMaterialCard(card) {

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "studio-material-card";
  button.id = `studioCanvasAddCard-${card.key}`;

  button.dataset.materialKey = card.key;
  button.dataset.materialType = card.type;

  /* 하위 재료가 몇인가 — 지금은 전부 1 이다(MATERIALS-1B 가 늘린다) */
  button.dataset.materialItems = String(card.items.length);

  button.appendChild(studioCanvasMaterialIcon(card.icon));

  const body =
    document.createElement("span");

  body.className = "studio-material-card-body";

  const name =
    document.createElement("span");

  name.className = "studio-material-card-name";
  name.textContent = card.label;

  const desc =
    document.createElement("span");

  desc.className = "studio-material-card-desc";
  desc.textContent = card.desc;

  body.appendChild(name);
  body.appendChild(desc);

  button.appendChild(body);

  /* 상태 표식 — "추가됨" · "준비 중". 값이 없으면 비어 있고
     스크린리더에도 읽히지 않는다. */
  const badge =
    document.createElement("span");

  badge.className = "studio-material-card-badge";
  badge.hidden = true;

  button.appendChild(badge);

  button.addEventListener("click", () => studioCanvasMaterialClick(card));

  studioCanvasMaterialCardNodes[card.key] = button;

  return button;

}


const STUDIO_MATERIAL_BADGE_TEXT = {
  added: "추가됨",
  soon: "준비 중"
};


function syncStudioCanvasMaterialCard(card) {

  const button =
    studioCanvasMaterialCardNodes[card.key];

  if (!button) {
    return;
  }

  const now =
    studioCanvasMaterialState(card);

  button.dataset.materialState = now.state;

  /* 어디에 넣을지 — 프레임을 고르고 있으면 그 안이다. 화면에도
     한 줄로 적히지만(아래 그룹 안내) 이 값이 테스트가 보는 자리다. */
  button.dataset.addTarget = now.target || "";

  /* 준비 중만 눌리지 않는다. "추가됨"은 **고르는** 단추라 살아 있다. */
  button.disabled = (now.state === "soon");

  const badge =
    button.querySelector(".studio-material-card-badge");

  const text =
    Object.prototype.hasOwnProperty.call(STUDIO_MATERIAL_BADGE_TEXT, now.state)
      ? STUDIO_MATERIAL_BADGE_TEXT[now.state]
      : "";

  if (badge) {
    badge.textContent = text;
    badge.hidden = !text;
  }

  /* 스크린리더가 카드 이름만으로 무엇이 일어날지 알 수 있게 */
  button.setAttribute(
    "aria-label",
    now.state === "added"
      ? `${card.label} — 이미 있습니다. 누르면 그 요소를 고릅니다`
      : (now.state === "soon"
          ? `${card.label} — 준비 중`
          : `${card.label} 추가 — ${card.desc}`)
  );

}


/* 꾸미기 묶음의 안내 한 줄 — 지금 어디에 들어가는가 */
function syncStudioCanvasMaterialGroupNote() {

  const node =
    document.getElementById("studioCanvasAddGroupNote-decor");

  if (!node) {
    return;
  }

  const frameId =
    studioCanvasV2AddFrameId();

  node.textContent =
    frameId
      ? "고른 메인 비주얼 안에 들어갑니다."
      : "원하는 만큼 더할 수 있습니다.";

}


function buildStudioCanvasV2AddSection() {

  studioCanvasMaterialCardNodes = {};

  const box =
    document.createElement("div");

  box.className = "studio-material-screen";
  box.id = "studioCanvasAdd";

  STUDIO_CANVAS_MATERIAL_GROUPS.forEach((group) => {

    const mine =
      STUDIO_CANVAS_MATERIAL_CARDS.filter((card) => card.group === group.key);

    if (!mine.length) {
      return;
    }

    const section =
      document.createElement("section");

    section.className = "studio-material-group";
    section.id = `studioCanvasAddGroup-${group.key}`;

    const heading =
      document.createElement("h3");

    heading.className = "studio-material-group-heading";
    heading.id = `studioCanvasAddGroupHeading-${group.key}`;
    heading.textContent = group.label;

    section.appendChild(heading);

    const note =
      document.createElement("p");

    note.className = "studio-material-group-note";
    note.id = `studioCanvasAddGroupNote-${group.key}`;
    note.textContent = group.note;

    section.appendChild(note);

    const grid =
      document.createElement("div");

    grid.className = "studio-material-grid";

    /* 격자지만 목록이다 — 스크린리더가 "몇 개 중 몇 번째"를 읽는다 */
    grid.setAttribute("role", "list");

    mine.forEach((card) => {

      const cell =
        document.createElement("div");

      cell.className = "studio-material-cell";
      cell.setAttribute("role", "listitem");

      cell.appendChild(studioCanvasMaterialCard(card));

      grid.appendChild(cell);

    });

    section.appendChild(grid);

    box.appendChild(section);

  });

  box.appendChild(studioCanvasV2AddSlotRow());

  const message =
    document.createElement("p");

  message.className = "studio-canvas-add-message";
  message.id = "studioCanvasAddMessage";
  message.setAttribute("role", "status");
  message.hidden = true;

  box.appendChild(message);

  syncStudioCanvasV2AddSection();

  return box;

}


function syncStudioCanvasV2AddSection() {

  syncStudioCanvasV2AddSlotOptions();

  syncStudioCanvasMaterialGroupNote();

  STUDIO_CANVAS_MATERIAL_CARDS.forEach(syncStudioCanvasMaterialCard);

}


if (typeof window !== "undefined") {

  window.studioCanvasV2AddIsOn = studioCanvasV2AddIsOn;

  /* STUDIO-LAYERS-SHELL-1 — Layers 패널이 이 둘로 추가 화면을
     붙이고 갱신한다. 두 파일 다 classic script 라 최상위 함수를
     그냥 부를 수도 있지만, 로드 순서가 반대여도(Layers 가 먼저)
     깨지지 않도록 창구를 둔다. */
  window.buildStudioCanvasV2AddSection = buildStudioCanvasV2AddSection;
  window.syncStudioCanvasV2AddSection = syncStudioCanvasV2AddSection;

  /*
    카드가 덮지 않는 자리·종류 조합으로 한 번 만드는 길.

    ★ 제품 화면에는 이 창구를 쓰는 곳이 없다 — 카드가 전부 지난다.
      계약의 두 표는 카드보다 넓고(흐름의 `text`, 자유 층의 `logo` ·
      `category_nav` 등) 그 조합들은 MATERIALS-1B 의 하위 목록이
      드러낼 자리다. 그때까지 **쓰기 경로가 살아 있는지**는
      e2e 가 이 창구로 재고, 여기서 새 UI 를 만들지 않는다.
  */
  window.addStudioCanvasV2Material = addStudioCanvasV2Material;

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
          select ? Array.from(select.options).map((option) => option.value) : [],

        /* STUDIO-LAYERS-MATERIALS-1A — 화면에 그려진 카드들 */
        cards:
          STUDIO_CANVAS_MATERIAL_CARDS.map((card) => {

            const node =
              studioCanvasMaterialCardNodes[card.key];

            return {
              key: card.key,
              group: card.group,
              type: card.type,
              label: card.label,
              desc: card.desc,
              items: card.items.length,
              drawn: !!(node && node.isConnected),
              state: node ? (node.dataset.materialState || "") : "",
              target: node ? (node.dataset.addTarget || "") : "",
              disabled: node ? !!node.disabled : null
            };

          })
      };

    };

}
