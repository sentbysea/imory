/* =========================================================
   STUDIO — v2 HOME 캔버스에 **재료를 추가하는 자리**
   (HOME-CANVAS-V2-ADD-1 · STUDIO-LAYERS-MATERIALS-1A · 1B · 1C)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §27 · §35 · §36 ·
              §37
   로드맵:    docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §3

   ── 왜 파일이 갈라져 있나 ──────────────────────────────
   studio-canvas-inspector.js 는 **고른 것 하나**의 화면이고
   studio-canvas-inspector-v2.js 는 그 v2 판이다. 추가는 다르다 —
   **아무것도 고르지 않았을 때도** 있어야 하고, 무엇을 고르고 있든
   같은 자리에 같은 모양으로 있어야 한다. 그래서 이 파일은
   "선택"이 아니라 "지금 캔버스가 v2 인가" 하나만 보고 그린다.

   ── 어느 패널에 붙는가 (STUDIO-LAYERS-SHELL-1) ─────────
   **Layers 패널**이다(studio/inspector/studio-canvas-layers.js).
   `＋ 재료 추가`를 누르면 트리가 물러나고 이 화면이 그 자리에 선다.
   머리(`←` · 제목)는 Layers 가 그린다 — 그 패널이 어디로 돌아갈지를
   아는 유일한 곳이라. 이 파일은 **본문**만 만들고, 지금 몇 번째
   화면인지는 아래 두 창구로 알려 준다.

     studioCanvasV2AddTitle()   머리에 적을 제목
     studioCanvasV2AddBack()    한 단계 뒤로 — 더 갈 데가 없으면 false

   ── 이 라운드가 바꾼 것 (STUDIO-LAYERS-MATERIALS-1B) ────

   1A 에서 카드 하나는 재료 **하나**였다. 이제 카드는 **분류**이고,
   누르면 같은 패널에서 그 분류의 **재료 목록**이 열린다.

     Layers  ←  요소 추가  ←  재료 목록

   · 목록도 표도 이 파일에 없다. 분류 · 재료 · 기본값 · 썸네일
     데이터는 전부 skin/skin-home-canvas-materials.js 한 곳이다.
   · 카드가 쓰기 경로에 보내는 것은 **재료 id 한 줄**이다. DOM 이
     임의 JSON 을 들고 있지 않다(계약 §36-2).
   · 쓰기 경로는 그대로다 — commitStudioCanvasAddNode() →
     addStudioCanvasV2Node() → writeSkinHomeCanvasV2AddNode().
   · 새 저장 모양도 새 재료 종류도 만들지 않았다.

   ── 카드(분류) 하나가 아는 것 ──────────────────────────

     type      계약의 재료 종류 하나
     targets   넣을 자리의 **우선순위**. 앞에서부터 "지금 그 자리가
               이 종류를 받는가"를 관문에 물어 첫 번째로 되는 곳을
               쓴다. 되는 곳이 없으면 그 카드는 **준비 중**이다.
     unique    이미 있으면 새로 만들지 않고 **그것을 고른다**(§35-4)

   ★ 그 순서는 **누르기**의 것이다. 끌어다 놓을 때는 포인터가 있는
     곳이 자리를 정한다(§37-2) — 그래서 `text` 처럼 흐름과 자유 층을
     둘 다 받는 재료가 두 자리 모두에 닿는다.

   ── 이 라운드가 바꾼 것 (STUDIO-LAYERS-MATERIALS-1C) ────

   재료 칸이 **둘로 갈라졌다**.

     카드 본문   누르면 기본 자리에 만든다 · 세로 스크롤은 브라우저 것
     손잡이 ⠿    끌어다 놓는 유일한 시작점 (`touch-action: none`)

   1B 에서는 카드 단추 자체가 끌기의 시작점이라 `touch-action: none`
   이 카드 전체에 있었고, 좁은 화면에서 카드 위의 손가락이 목록을
   넘기지 못했다(계약 §36-9 의 그 남은 차이 → §37-3).

   ── 사진이 들어가는 종류 ───────────────────────────────
   `photo` · `sticker` · `logo` 와 `main_visual` 의 primary 사진은
   **이미지 슬롯 이름**이 필요하다(계약 §7). 그래서 이 화면 아래에
   슬롯 고르기 한 칸이 그대로 있고, 고르지 않으면 **빈 슬롯 하나를
   함께 선언한다**.

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


/* 화면의 두 분류 묶음 (§35-2) */
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


/*
  분류 카드 표 · 재료 표 — **여기 없다**(§36-2).

  skin/skin-home-canvas-materials.js 가 그 둘을 갖고, 이 파일은
  호출 시점에 읽는다. 로드 순서가 어긋나도(그럴 일은 없지만) 화면이
  비는 것으로 끝나고, 사본을 만들어 두 벌이 되지 않는다.
*/
function studioCanvasMaterialCategories() {

  return Array.isArray(window.SKIN_HOME_CANVAS_MATERIAL_CATEGORIES)
    ? window.SKIN_HOME_CANVAS_MATERIAL_CATEGORIES
    : [];

}


function studioCanvasMaterialCategoryOf(key) {

  return (typeof window.skinHomeCanvasMaterialCategory === "function")
    ? window.skinHomeCanvasMaterialCategory(key)
    : null;

}


function studioCanvasMaterialItems(categoryKey) {

  return (typeof window.skinHomeCanvasMaterialsOf === "function")
    ? window.skinHomeCanvasMaterialsOf(categoryKey)
    : [];

}


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
   재료 썸네일 (STUDIO-LAYERS-MATERIALS-1B · §36-3)

   "실제 결과를 알아볼 수 있는" 그림이다. 그리는 재료는 카탈로그의
   `preview` 한 칸뿐이고 — DOM 도 HTML 도 아닌 **데이터**다 — 여기서
   그것을 작은 상자 하나로 옮긴다.

   ★ 값은 **CSSOM 으로** 쓴다(`style` 속성이 아니다). 렌더 CSS 가
     스킨마다 다른 값을 갖는 자리가 아니고, CSP 검사 대상도 아니다
     (skin/skin-home-canvas-editor-runtime.js 의 그 방법과 같다).

   ★ 썸네일은 **자기 데이터**로만 그린다. 재료가 실제로 쓰는
     스킨 CSS 선언(`style`)을 그대로 끌어오지 않는다 — 그 값은
     `currentColor` 처럼 놓인 자리에서 풀리는 것이 섞여 있어서,
     작은 칸에서는 뜻이 달라진다.
========================================================== */

/* 썸네일 상자의 기준 — 칸이 이만큼이고 그 안에 재료를 앉힌다 */
const STUDIO_MATERIAL_THUMB = { width: 44, height: 34 };


function studioCanvasMaterialThumb(item) {

  const wrap =
    document.createElement("span");

  wrap.className = "studio-material-item-thumb";
  wrap.setAttribute("aria-hidden", "true");

  const preview =
    (item && item.preview && typeof item.preview === "object") ? item.preview : {};

  const kind =
    typeof preview.kind === "string" ? preview.kind : "shape";

  /* 분류 아이콘을 쓰는 것들 — 홈 구성 셋은 "어떻게 생겼는가"가 아니라
     "무엇인가"로 알아본다(로고 · 메뉴 · 메인 비주얼) */
  if (kind === "logo" || kind === "nav" || kind === "main") {

    wrap.dataset.thumbKind = kind;
    wrap.appendChild(studioCanvasMaterialIcon(kind));

    return wrap;

  }

  const box =
    document.createElement("span");

  box.className = "studio-material-thumb-box";

  wrap.dataset.thumbKind = kind;

  if (kind === "divider") {

    const thickness =
      (typeof preview.thickness === "number" && preview.thickness > 0)
        ? preview.thickness
        : 2;

    box.style.setProperty("width", `${STUDIO_MATERIAL_THUMB.width}px`);

    if (preview.dash) {
      box.style.setProperty("height", "0px");
      box.style.setProperty("border-top", `${thickness}px dashed currentColor`);
      box.style.setProperty("background", "none");
    }
    else {
      box.style.setProperty("height", `${thickness}px`);
    }

    wrap.appendChild(box);

    return wrap;

  }

  if (kind === "text") {

    const size =
      (typeof preview.size === "number" && preview.size > 0) ? preview.size : 10;

    box.classList.add("studio-material-thumb-box--text");

    box.style.setProperty("font-size", `${size}px`);
    box.style.setProperty(
      "font-weight",
      preview.weight === "700" ? "700" : "400"
    );

    box.textContent = "Aa";

    wrap.appendChild(box);

    return wrap;

  }

  /* photo · sticker · shape — 상자 하나. 비율과 모서리가 차이다 */

  const ratio =
    (typeof preview.ratio === "number" && preview.ratio > 0) ? preview.ratio : 1;

  const thickness =
    (typeof preview.thickness === "number" && preview.thickness > 0)
      ? preview.thickness
      : 0;

  let width =
    STUDIO_MATERIAL_THUMB.width;

  let height =
    thickness ? thickness : Math.round(width / ratio);

  if (height > STUDIO_MATERIAL_THUMB.height) {
    height = STUDIO_MATERIAL_THUMB.height;
    width = Math.round(height * ratio);
  }

  box.style.setProperty("width", `${width}px`);
  box.style.setProperty("height", `${height}px`);

  if (typeof preview.radius === "string" && preview.radius !== "0") {
    box.style.setProperty("border-radius", preview.radius);
  }

  /* 사진과 장식은 **그림이 들어올 자리**다 — 칠하지 않고 테두리로
     자리를 보여 준다(§36-2 의 그 이유와 같다) */
  if (kind === "photo" || kind === "sticker") {
    box.classList.add("studio-material-thumb-box--slot");
  }

  wrap.appendChild(box);

  return wrap;

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
  frame: "어느 메인 비주얼 안인지 알 수 없습니다 — 그 프레임을 다시 골라 주세요.",

  /* STUDIO-LAYERS-MATERIALS-1B — 카탈로그에 없는 재료 */
  material: "그 재료를 찾지 못했습니다 — 목록을 다시 열어 주세요.",
  target: "이 재료는 그 자리에 넣을 수 없습니다."
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
  장부에 매달아 둘 수 없다. 그래서 이 파일이 직접 들고 있고,
  Layers 가 화면을 다시 만들면 새 칸이 이 자리를 대신한다.
*/
let studioCanvasV2AddSlotSelect = null;


/* 지금 그려져 있는 분류 카드들 — key → button */
let studioCanvasMaterialCardNodes = {};

/* 지금 그려져 있는 재료 단추들 — id → button */
let studioCanvasMaterialItemNodes = {};

/* STUDIO-LAYERS-MATERIALS-1C — 그 재료의 **끌기 손잡이** — id → span.
   단추와 따로 들고 있는 이유는 `준비 중` 일 때 손잡이만 내리기
   때문이다(단추는 `disabled` 로 남아 이유를 읽힌다). */
let studioCanvasMaterialItemHandles = {};


/* =========================================================
   지금 몇 번째 화면인가 (STUDIO-LAYERS-MATERIALS-1B · §36-3)

     null        분류 카드 격자 ("요소 추가")
     <카테고리>  그 분류의 재료 목록

   ★ **화면 상태**다. 저장되지 않고 Undo 에도 들어가지 않는다.
     Layers 가 하위 화면을 닫으면 여기도 처음으로 돌아간다.
========================================================== */
let studioCanvasMaterialScreen = null;


function studioCanvasV2AddTitle() {

  const category =
    studioCanvasMaterialScreen
      ? studioCanvasMaterialCategoryOf(studioCanvasMaterialScreen)
      : null;

  return category ? category.label : "요소 추가";

}


/*
  한 단계 뒤로.

    true   이 파일이 처리했다(재료 목록 → 요소 추가)
    false  더 갈 데가 없다 → Layers 가 하위 화면을 닫는다

  ★ `← ` 와 Escape 가 **같은 이 함수**를 지난다. 뒤로가기 단계가
    두 곳에 적히면 한쪽만 고쳐지는 날 Escape 만 한 단계를 건너뛴다.
*/
function studioCanvasV2AddBack() {

  if (!studioCanvasMaterialScreen) {
    return false;
  }

  setStudioCanvasMaterialScreen(null);

  return true;

}


/* Layers 가 하위 화면을 닫을 때 — 다음에 열면 분류 격자부터다 */
function resetStudioCanvasV2AddScreen() {

  studioCanvasMaterialScreen = null;

}


function setStudioCanvasMaterialScreen(key) {

  studioCanvasMaterialScreen =
    (typeof key === "string" && key) ? key : null;

  const host =
    document.getElementById("studioCanvasAdd");

  if (host && host.parentNode) {

    const parent =
      host.parentNode;

    parent.replaceChild(buildStudioCanvasV2AddSection(), host);

  }

  /* 머리(제목 · `←`)를 아는 곳은 Layers 다 — 그쪽에 다시 그리라고
     알린다. 창구가 없으면(이 파일만 실린 문서) 본문만 바뀐다. */
  if (typeof window.syncStudioCanvasLayersAddHead === "function") {
    window.syncStudioCanvasLayersAddHead();
  }

  /* 화면이 바뀌었으면 초점을 첫 재료로 옮긴다 — 키보드만 쓰는
     사람이 사라진 단추에 초점을 둔 채 남지 않게 */
  const first =
    document.querySelector(".studio-material-item, .studio-material-card");

  if (first && typeof first.focus === "function") {
    first.focus();
  }

}


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
   카드 · 재료 하나의 지금 상태 (§35-3 · §35-4 · §36-4)

     add    누르면 만든다
     added  이미 있다 → 누르면 **그것을 고른다**(중복으로 만들지 않는다)
     soon   지금 계약에 이 재료를 받는 자리가 없다 → 준비 중

   ★ 셋 다 **읽기**다. 여기서 draft 를 만지지 않는다.
========================================================== */

/* `unique` 분류가 가리키는, 이미 있는 그 요소 — 없으면 null */
function studioCanvasMaterialExistingId(category) {

  if (!category.unique || typeof window.studioCanvasNodeList !== "function") {
    return null;
  }

  /* ★ 자리를 가리지 않는다. 흐름에 로고가 없어도 프레임 안에 하나
     있으면 "이미 있는" 것이다 — 사용자가 보는 화면에는 로고가 하나
     있기 때문이다. */
  const hit =
    window.studioCanvasNodeList().find((node) => node && node.type === category.type);

  return hit ? hit.id : null;

}


/* 이 종류를 지금 넣을 수 있는 자리 — 없으면 null(준비 중) */
function studioCanvasMaterialTarget(targets, type) {

  if (typeof window.studioCanvasV2AddTypes !== "function") {
    return null;
  }

  const frameId =
    studioCanvasV2AddFrameId();

  const list =
    Array.isArray(targets) ? targets : [];

  for (let i = 0; i < list.length; i += 1) {

    const target =
      list[i];

    /* 프레임 안은 **어느 프레임인가**를 알 때만 쓴다(§28-2) */
    if (target === "frame" && !frameId) {
      continue;
    }

    const types =
      window.studioCanvasV2AddTypes(target);

    if (Array.isArray(types) && types.indexOf(type) !== -1) {
      return target;
    }

  }

  return null;

}


function studioCanvasMaterialState(category) {

  const existingId =
    studioCanvasMaterialExistingId(category);

  if (existingId) {
    return { state: "added", target: null, existingId: existingId };
  }

  const target =
    studioCanvasMaterialTarget(category.targets, category.type);

  return {
    state: target ? "add" : "soon",
    target: target,
    existingId: null
  };

}


/*
  재료 하나의 상태 — 분류의 것과 같은 판정이되 **그 재료의 자리
  표**를 본다(계약 §36-4). 표를 여기서 다시 적지 않고 카탈로그의
  resolve 를 지난다.
*/
function studioCanvasMaterialItemState(item) {

  const category =
    studioCanvasMaterialCategoryOf(item.category);

  if (!category) {
    return { state: "soon", target: null, existingId: null, preset: null };
  }

  const preset =
    (typeof window.resolveSkinHomeCanvasMaterialPreset === "function")
      ? window.resolveSkinHomeCanvasMaterialPreset(item.id)
      : null;

  if (!preset) {
    return { state: "soon", target: null, existingId: null, preset: null };
  }

  const existingId =
    studioCanvasMaterialExistingId(category);

  if (existingId) {
    return { state: "added", target: null, existingId: existingId, preset: preset };
  }

  const target =
    studioCanvasMaterialTarget(preset.targets, preset.type);

  return {
    state: target ? "add" : "soon",
    target: target,
    existingId: null,
    preset: preset
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
function addStudioCanvasV2Material(target, type, options) {

  const select =
    studioCanvasV2AddSlotSelect;

  const extra =
    (options && typeof options === "object") ? options : {};

  const result =
    window.commitStudioCanvasAddNode({
      target: target,
      type: type,
      slot: select ? select.value : "",

      /* HOME-CANVAS-V2-ELEMENTS-1 — 프레임 안은 **어느 프레임인가**를
         함께 보낸다. 누르는 그 순간의 선택에서 읽으므로, 그리고 나서
         선택이 바뀌었으면 관문이 다시 본다.

         ★ STUDIO-LAYERS-MATERIALS-1B — 끌어다 놓았을 때는 **놓은
           그 프레임**이다(§36-5). 그때는 선택을 보지 않는다 —
           손가락이 올라가 있던 프레임이 곧 사용자가 고른 것이다. */
      frameId:
        (target !== "frame")
          ? ""
          : ((typeof extra.frameId === "string" && extra.frameId)
              ? extra.frameId
              : (studioCanvasV2AddFrameId() || "")),

      /* STUDIO-LAYERS-MATERIALS-1B — 재료 id 한 줄 · 끌어다 놓은
         자리 · 흐름의 삽입선(계약 §36) */
      materialId: (typeof extra.materialId === "string") ? extra.materialId : "",
      at: extra.at || null,
      index: Number.isInteger(extra.index) ? extra.index : null
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
    (typeof extra.label === "string" && extra.label)
      ? extra.label
      : (STUDIO_CANVAS_V2_ADD_LABELS[result.type || type] || type);

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


/*
  분류 카드를 눌렀을 때.

    added  이미 있는 그 요소를 고른다(하위 화면을 열지 않는다 —
           새로 만들 것이 없으므로 §35-4 · §36-6)
    soon   왜 안 되는지만 적는다
    add    그 분류의 **재료 목록**을 연다(§36-3)
*/
function studioCanvasMaterialClick(category) {

  const now =
    studioCanvasMaterialState(category);

  if (now.state === "added") {
    selectStudioCanvasMaterial(now.existingId);
    return;
  }

  if (now.state === "soon") {

    /* ★ 여기서 draft 를 만지지 않는다. 단추는 이미 disabled 이지만
       (합성 클릭 · 낡은 화면에서 새어 들어올 수 있으므로) 같은
       판정을 한 번 더 한다. */
    setStudioCanvasV2AddMessage(
      `${category.label}은(는) 아직 준비 중입니다.`,
      false
    );

    return;

  }

  setStudioCanvasV2AddMessage("", false);

  setStudioCanvasMaterialScreen(category.key);

}


/* 재료 하나를 눌렀을 때 — 여기서 실제로 만들어진다 */
function studioCanvasMaterialItemClick(item) {

  const now =
    studioCanvasMaterialItemState(item);

  if (now.state === "added") {
    selectStudioCanvasMaterial(now.existingId);
    return;
  }

  if (now.state === "soon") {

    setStudioCanvasV2AddMessage(
      `${item.label}은(는) 지금 넣을 자리가 없습니다.`,
      false
    );

    return;

  }

  addStudioCanvasV2Material(
    now.target,
    now.preset.type,
    { materialId: item.id, label: item.label }
  );

}


/* =========================================================
   분류 카드 격자
========================================================== */

function studioCanvasMaterialCard(category) {

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "studio-material-card";
  button.id = `studioCanvasAddCard-${category.key}`;

  button.dataset.materialKey = category.key;
  button.dataset.materialType = category.type;

  /* 하위 재료가 몇인가 — 목록 화면이 그만큼 그린다 */
  button.dataset.materialItems =
    String(studioCanvasMaterialItems(category.key).length);

  button.appendChild(studioCanvasMaterialIcon(category.icon));

  const body =
    document.createElement("span");

  body.className = "studio-material-card-body";

  const name =
    document.createElement("span");

  name.className = "studio-material-card-name";
  name.textContent = category.label;

  const desc =
    document.createElement("span");

  desc.className = "studio-material-card-desc";
  desc.textContent = category.desc;

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

  button.addEventListener("click", () => studioCanvasMaterialClick(category));

  studioCanvasMaterialCardNodes[category.key] = button;

  return button;

}


const STUDIO_MATERIAL_BADGE_TEXT = {
  added: "추가됨",
  soon: "준비 중"
};


function syncStudioCanvasMaterialCard(category) {

  const button =
    studioCanvasMaterialCardNodes[category.key];

  if (!button) {
    return;
  }

  const now =
    studioCanvasMaterialState(category);

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
      ? `${category.label} — 이미 있습니다. 누르면 그 요소를 고릅니다`
      : (now.state === "soon"
          ? `${category.label} — 준비 중`
          : `${category.label} — 누르면 재료를 고릅니다`)
  );

}


/* =========================================================
   재료 목록 (STUDIO-LAYERS-MATERIALS-1B · §36-3)
========================================================== */

function studioCanvasMaterialItemButton(item) {

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "studio-material-item";
  button.id = `studioCanvasAddItem-${item.id}`;

  /* ★ DOM 이 들고 있는 것은 **id 뿐**이고, 무엇을 만들지는 카탈로그와
     순수 함수가 정한다(계약 §36-2). */
  button.dataset.materialId = item.id;
  button.dataset.materialCategory = item.category;

  button.appendChild(studioCanvasMaterialThumb(item));

  const body =
    document.createElement("span");

  body.className = "studio-material-item-body";

  const name =
    document.createElement("span");

  name.className = "studio-material-item-name";
  name.textContent = item.label;

  const desc =
    document.createElement("span");

  desc.className = "studio-material-item-desc";
  desc.textContent = item.desc || "";

  body.appendChild(name);
  body.appendChild(desc);

  button.appendChild(body);

  const badge =
    document.createElement("span");

  badge.className = "studio-material-card-badge";
  badge.hidden = true;

  button.appendChild(badge);

  button.addEventListener("click", () => studioCanvasMaterialItemClick(item));

  studioCanvasMaterialItemNodes[item.id] = button;

  return button;

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1C — 끌기 손잡이 (계약 §37-3)

   Layers 의 행 손잡이와 **같은 글자 · 같은 규칙**이다(⠿ ·
   `touch-action: none` 은 이 요소 하나에만). 다른 점은 자리뿐이다 —
   행은 왼쪽 끝에 두고, 카드는 칸 안에서 위 오른쪽에 띄운다.

   ★ **카드 단추 안에 넣지 않는다.** 안에 있으면 손잡이를 눌렀다
     뗀 click 이 단추로 올라가 재료가 하나 만들어진다. 칸(`cell`)
     안의 **형제**로 두고 절대 위치로 띄운다.

   ★ 단추가 아니라 `role="img"` 인 span 이다. 눌러서 일어나는 일이
     없는 요소를 단추로 만들면 키보드로 들어갔을 때 아무 일도
     하지 않는 자리가 생긴다 — 키보드는 카드 본문 하나로 전부
     할 수 있다(누르면 기본 자리에 만든다).
========================================================== */
function studioCanvasMaterialItemHandle(item) {

  const handle =
    document.createElement("span");

  handle.className = "studio-material-item-handle";
  handle.id = `studioCanvasAddHandle-${item.id}`;

  handle.textContent = "⠿";

  /* 끌기가 보는 그 한 줄이다(studio-canvas-materials-drag.js) */
  handle.dataset.materialId = item.id;

  handle.setAttribute("role", "img");
  handle.setAttribute("aria-label", "끌어서 추가");

  studioCanvasMaterialItemHandles[item.id] = handle;

  return handle;

}


/* 카드 하나의 칸 — 단추와 손잡이가 함께 선다 */
function studioCanvasMaterialItemCell(item) {

  const cell =
    studioCanvasMaterialCell(studioCanvasMaterialItemButton(item));

  cell.appendChild(studioCanvasMaterialItemHandle(item));

  return cell;

}


function syncStudioCanvasMaterialItem(item) {

  const button =
    studioCanvasMaterialItemNodes[item.id];

  if (!button) {
    return;
  }

  const now =
    studioCanvasMaterialItemState(item);

  button.dataset.materialState = now.state;
  button.dataset.addTarget = now.target || "";

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

  button.setAttribute(
    "aria-label",
    now.state === "added"
      ? `${item.label} — 이미 있습니다. 누르면 그 요소를 고릅니다`
      : (now.state === "soon"
          ? `${item.label} — 지금 넣을 자리가 없습니다`
          : `${item.label} 추가 — ${item.desc || ""}`)
  );

  /* STUDIO-LAYERS-MATERIALS-1C — 만들 자리가 없으면 끌 것도 없다.
     `추가됨` 은 손잡이를 남긴다 — 끌면 "이미 있습니다"가 뜨고
     아무것도 만들지 않는 그 길이 계약이다(§36-7). */
  const handle =
    studioCanvasMaterialItemHandles[item.id];

  if (handle) {
    handle.hidden = (now.state === "soon");
  }

}


/* 지금 어디에 들어가는가 — 한 줄 안내(분류 격자 · 재료 목록 공통) */
function studioCanvasMaterialTargetNote() {

  return studioCanvasV2AddFrameId()
    ? "고른 메인 비주얼 안에 들어갑니다."
    : "끌어다 놓으면 그 자리에, 누르면 기본 자리에 들어갑니다.";

}


function syncStudioCanvasMaterialGroupNote() {

  const decor =
    document.getElementById("studioCanvasAddGroupNote-decor");

  if (decor) {

    decor.textContent =
      studioCanvasV2AddFrameId()
        ? "고른 메인 비주얼 안에 들어갑니다."
        : "원하는 만큼 더할 수 있습니다.";

  }

  const items =
    document.getElementById("studioCanvasAddItemsNote");

  if (items) {
    items.textContent = studioCanvasMaterialTargetNote();
  }

}


/* =========================================================
   화면 만들기
========================================================== */

function studioCanvasMaterialGrid() {

  const grid =
    document.createElement("div");

  grid.className = "studio-material-grid";

  /* 격자지만 목록이다 — 스크린리더가 "몇 개 중 몇 번째"를 읽는다 */
  grid.setAttribute("role", "list");

  return grid;

}


function studioCanvasMaterialCell(node) {

  const cell =
    document.createElement("div");

  cell.className = "studio-material-cell";
  cell.setAttribute("role", "listitem");

  cell.appendChild(node);

  return cell;

}


function buildStudioCanvasV2AddCategories(box) {

  STUDIO_CANVAS_MATERIAL_GROUPS.forEach((group) => {

    const mine =
      studioCanvasMaterialCategories().filter(
        (category) => category.group === group.key
      );

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
      studioCanvasMaterialGrid();

    mine.forEach((category) => {
      grid.appendChild(studioCanvasMaterialCell(studioCanvasMaterialCard(category)));
    });

    section.appendChild(grid);

    box.appendChild(section);

  });

}


function buildStudioCanvasV2AddItems(box, categoryKey) {

  const category =
    studioCanvasMaterialCategoryOf(categoryKey);

  const items =
    studioCanvasMaterialItems(categoryKey);

  box.dataset.materialCategory =
    categoryKey;

  const note =
    document.createElement("p");

  note.className = "studio-material-group-note";
  note.id = "studioCanvasAddItemsNote";
  note.textContent = studioCanvasMaterialTargetNote();

  box.appendChild(note);

  if (!category || !items.length) {

    const empty =
      document.createElement("p");

    empty.className = "studio-material-empty";
    empty.id = "studioCanvasAddItemsEmpty";
    empty.textContent = "이 분류에는 아직 재료가 없습니다.";

    box.appendChild(empty);

    return;

  }

  const grid =
    studioCanvasMaterialGrid();

  grid.classList.add("studio-material-grid--items");

  items.forEach((item) => {
    grid.appendChild(studioCanvasMaterialItemCell(item));
  });

  box.appendChild(grid);

}


function buildStudioCanvasV2AddSection() {

  studioCanvasMaterialCardNodes = {};
  studioCanvasMaterialItemNodes = {};
  studioCanvasMaterialItemHandles = {};

  const box =
    document.createElement("div");

  box.className = "studio-material-screen";
  box.id = "studioCanvasAdd";

  /* 테스트와 CSS 가 보는 한 줄 — 지금 몇 번째 화면인가 */
  box.dataset.materialScreen =
    studioCanvasMaterialScreen ? "items" : "categories";

  if (studioCanvasMaterialScreen) {
    buildStudioCanvasV2AddItems(box, studioCanvasMaterialScreen);
  }
  else {
    buildStudioCanvasV2AddCategories(box);
  }

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

  if (studioCanvasMaterialScreen) {

    studioCanvasMaterialItems(studioCanvasMaterialScreen)
      .forEach(syncStudioCanvasMaterialItem);

    return;

  }

  studioCanvasMaterialCategories().forEach(syncStudioCanvasMaterialCard);

}


if (typeof window !== "undefined") {

  window.studioCanvasV2AddIsOn = studioCanvasV2AddIsOn;

  /* STUDIO-LAYERS-SHELL-1 — Layers 패널이 이 둘로 추가 화면을
     붙이고 갱신한다. 두 파일 다 classic script 라 최상위 함수를
     그냥 부를 수도 있지만, 로드 순서가 반대여도(Layers 가 먼저)
     깨지지 않도록 창구를 둔다. */
  window.buildStudioCanvasV2AddSection = buildStudioCanvasV2AddSection;
  window.syncStudioCanvasV2AddSection = syncStudioCanvasV2AddSection;

  /* STUDIO-LAYERS-MATERIALS-1B — 하위 화면의 단계(§36-3).
     머리를 그리는 Layers 가 이 셋을 본다. */
  window.studioCanvasV2AddTitle = studioCanvasV2AddTitle;
  window.studioCanvasV2AddBack = studioCanvasV2AddBack;
  window.resetStudioCanvasV2AddScreen = resetStudioCanvasV2AddScreen;

  /* 끌어다 놓기가 쓰는 둘(studio-canvas-materials-drag.js).
     그쪽은 **id 만** 들고 오고, 상태와 만들기는 이 파일이 한다. */
  window.studioCanvasMaterialItemState = studioCanvasMaterialItemState;
  window.studioCanvasMaterialThumb = studioCanvasMaterialThumb;
  window.addStudioCanvasV2Material = addStudioCanvasV2Material;
  window.setStudioCanvasV2AddMessage = setStudioCanvasV2AddMessage;

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

        /* STUDIO-LAYERS-MATERIALS-1B — 지금 몇 번째 화면인가 */
        screen: studioCanvasMaterialScreen ? "items" : "categories",
        category: studioCanvasMaterialScreen || "",
        title: studioCanvasV2AddTitle(),

        /* STUDIO-LAYERS-MATERIALS-1A — 화면에 그려진 분류 카드들 */
        cards:
          studioCanvasMaterialCategories().map((category) => {

            const node =
              studioCanvasMaterialCardNodes[category.key];

            return {
              key: category.key,
              group: category.group,
              type: category.type,
              label: category.label,
              desc: category.desc,
              items: studioCanvasMaterialItems(category.key).length,
              drawn: !!(node && node.isConnected),
              state: node ? (node.dataset.materialState || "") : "",
              target: node ? (node.dataset.addTarget || "") : "",
              disabled: node ? !!node.disabled : null
            };

          }),

        /* STUDIO-LAYERS-MATERIALS-1B — 그려진 재료들(목록 화면에서만) */
        items:
          (studioCanvasMaterialScreen
            ? studioCanvasMaterialItems(studioCanvasMaterialScreen)
            : []
          ).map((item) => {

            const node =
              studioCanvasMaterialItemNodes[item.id];

            const handle =
              studioCanvasMaterialItemHandles[item.id];

            return {
              id: item.id,
              category: item.category,
              label: item.label,
              type: item.type,
              drawn: !!(node && node.isConnected),
              state: node ? (node.dataset.materialState || "") : "",
              target: node ? (node.dataset.addTarget || "") : "",
              disabled: node ? !!node.disabled : null,

              /* STUDIO-LAYERS-MATERIALS-1C — 끌기 손잡이가 있는가 ·
                 계약이 이 재료에 허용하는 자리는 무엇인가(§37-1) */
              handle: !!(handle && handle.isConnected && !handle.hidden),
              targets:
                (typeof window.resolveSkinHomeCanvasMaterialPreset === "function")
                  ? ((window.resolveSkinHomeCanvasMaterialPreset(item.id) || {}).targets || [])
                  : []
            };

          })
      };

    };

}
