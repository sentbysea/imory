/* =========================================================
   STUDIO — LAYERS (STUDIO-LAYERS-SHELL-1 · STUDIO-LAYERS-STRUCTURE-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md
              §1 · §2 · §3
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §23 · §25 · §28 · §32

   왼쪽 패널의 넷째 자리다 — `Select · Images · Layers · Layout`.

   ── 이 파일이 하는 일 ──────────────────────────────────
     1) 지금 working draft 의 v2 캔버스 구조를 **읽어서** 보여 준다
     2) 행을 누르면 기존 캔버스 선택 관문으로 그 요소를 고른다
     3) 행마다 대표 사진 · 눈 · 자물쇠 · 삭제 단추를 붙인다
        (STUDIO-LAYERS-STRUCTURE-1)

   그리고 맨 위에 재료 추가 자리를 붙인다 — 그 화면을 만드는 곳은
   여전히 studio/inspector/studio-canvas-add-v2.js 한 곳이다.

   ── 이 파일이 **하지 않는** 일 ─────────────────────────
     · draft 를 직접 고치지 않는다. 구조 동작은 전부
       studio-canvas-layers-ops.js 의 문 하나를 지난다.
     · 끄는 제스처도 여기 없다 — studio-canvas-layers-drag.js 다.
     · 그룹 조작 · 영구 group 노드 · 타이포그래피 · rich text 는
       이번 범위가 아니다(계획 문서 §6 의 다음 줄들).

   ── 행의 생김새 ────────────────────────────────────────

     [⠿ 손잡이] [★ 대표] [이름(고르기)] [👁 눈] [🔒 자물쇠] [🗑 삭제]

     · 대표 단추는 **메인 비주얼 안의 사진**에만 있다.
     · 오른쪽 세 단추는 pointerdown 을 멈춘다 — 누르면 행이 골라지지도
       끌리지도 않는다(계약 §32-2).
     · 숨김 · 잠금된 행도 **목록에는 남는다**. 그것이 다시 켜는
       유일한 길이다.

   ── 왜 상태를 들고 있지 않은가 ─────────────────────────
   트리는 **별도 상태 저장소가 아니다**(계획 문서 §2-1). 그릴 때마다
   studioCanvasNodeList() 로 draft 에서 다시 만든다. 행의 identity 는
   기존 Canvas id 하나이고, 그 id 는 캔버스 하나 안에서 유일하다
   (계약 §14-5).

   이 파일이 기억하는 것은 **접기/펼치기** 하나뿐이다. 그것은 저장되지
   않는 화면 상태라 Undo 에도 Save 에도 들어가지 않는다.

   ── 선택의 단일 원천 ───────────────────────────────────
   studio/inspector/studio-canvas-selection.js 다(계획 문서 §2-2).
   Layers 전용 두 번째 선택 배열을 만들지 않는다.

     Layers → Preview   proposeStudioCanvasSelection({ ids, primaryId })
                        — 좌표를 싣지 않는다. 그 함수가 지금 draft 로
                        검증하고, 확정한 뒤 native/sandbox 프레임 양쪽에
                        같은 id 를 내려보낸다.
     Preview → Layers   `studio-canvas-panel` 이벤트 하나
                        (notifyStudioCanvasPanel). 선택이 바뀌는 모든
                        자리와 working draft 가 바뀌는 모든 자리가 그
                        한 곳을 지나므로, 여기서는 그 이벤트만 듣는다.

   ── classic script ─────────────────────────────────────
   studio-canvas-selection.js · studio-canvas-add-v2.js 의 창구를
   **호출 시점에** 쓴다(로드 순서를 강제하지 않는다).
========================================================== */


/* 사람이 읽는 종류 이름 — 값 표는 계약이고 이름만 여기다.
   studio-canvas-selection.js studioCanvasElementLabel() 과 같은 표를
   쓰되, 그 함수가 없는 문서에서도 트리가 읽히도록 여기서 한 번 더
   본다(그 함수가 있으면 그쪽이 먼저다). */
const STUDIO_CANVAS_LAYER_LABELS = {
  logo: "로고",
  category_nav: "카테고리",
  text: "글자",
  divider: "구분선",
  main_visual: "메인 비주얼",
  photo: "사진",
  sticker: "스티커",
  shape: "도형"
};


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 그림이 들어가는 재료

   이 셋만 `props.slot` 을 갖는다(계약 §14-4). 행을 누르면 선택과
   **동시에** 그 자리의 이미지 선택기로 넘어가는 것도 이 셋이다.
========================================================== */
const STUDIO_CANVAS_LAYER_IMAGE_TYPES =
  ["photo", "sticker", "logo"];


/* 트리의 두 묶음 — 계획 문서 §2-1 의 그 표 */
const STUDIO_CANVAS_LAYER_GROUPS = [
  { key: "flow", label: "자동 배치" },
  { key: "overlay", label: "페이지 장식" }
];


/*
  행 오른쪽의 단추 셋 (STUDIO-LAYERS-STRUCTURE-1)

  ★ 글자로 그린다 — 아이콘 폰트도 SVG 도 새로 들이지 않는다. 상태에
    따라 글자가 바뀌므로 `aria-pressed` 와 함께 읽으면 뜻이 분명하다.
*/
const STUDIO_CANVAS_LAYER_FLAG_BUTTONS = [
  {
    flag: "hidden",
    className: "studio-canvas-layers-eye",
    on: "🙈",
    off: "👁",
    labelOn: "다시 보이기",
    labelOff: "숨기기"
  },
  {
    flag: "locked",
    className: "studio-canvas-layers-lock",
    on: "🔒",
    off: "🔓",
    labelOn: "잠금 풀기",
    labelOff: "잠그기"
  }
];


let studioCanvasLayersRoot = null;

let studioCanvasLayersTree = null;

let studioCanvasLayersEmpty = null;

let studioCanvasLayersAddToggle = null;

let studioCanvasLayersAddHost = null;

let studioCanvasLayersNote = null;

/* STUDIO-LAYERS-MEDIA-1 — 트리 아래의 "스킨 이미지" 구역 */
let studioCanvasLayersMedia = null;

let studioCanvasLayersMediaList = null;


/* 재료 추가 자리가 펼쳐져 있는가 — 화면 상태다(저장되지 않는다) */
let studioCanvasLayersAddOpen = false;


/*
  접어 둔 `main_visual` 의 id 들. **접힌 것만** 담는다 — 새 프레임은
  기본이 펼침이어야 방금 만든 요소가 곧바로 보인다(계획 문서 §3).
*/
const studioCanvasLayersCollapsed = new Set();


/* 지금 화면에 그려져 있는 트리의 지문. 같으면 DOM 을 다시 만들지
   않는다 — 선택 표시만 갈아 끼운다. 그래야 스크롤 자리와 포커스가
   유지된다(Inspector 의 shape 와 같은 사고방식). */
let studioCanvasLayersShape = "";


/* =========================================================
   1. 읽기 — 지금 draft 가 무엇인가
========================================================== */

function studioCanvasLayersPayload() {

  if (
    typeof window.studioCanvasDraftPayload !== "function" ||
    typeof window.studioCanvasPayloadVersion !== "function"
  ) {
    return null;
  }

  return window.studioCanvasDraftPayload();

}


function studioCanvasLayersVersion() {

  const payload =
    studioCanvasLayersPayload();

  return payload ? window.studioCanvasPayloadVersion(payload) : null;

}


function studioCanvasLayersEditing() {

  return typeof window.studioCanvasEditingIsOn === "function" &&
    window.studioCanvasEditingIsOn();

}


function studioCanvasLayerLabel(type) {

  if (typeof window.studioCanvasElementLabel === "function") {

    const label =
      window.studioCanvasElementLabel(type);

    if (label) {
      return label;
    }

  }

  return STUDIO_CANVAS_LAYER_LABELS[type] || type || "요소";

}


/*
  studioCanvasLayersRows() -> [{ id, kind, type, parentId, primary, depth, group }]

  ★ 순서를 여기서 정하지 않는다. studioCanvasNodeList() 가 주는 그
    순서가 곧 draft 의 배열 순서다(v2 는 블록 → 그 프레임 내부 →
    overlay, skin/skin-home-canvas-write-v2.js listSkinHomeCanvasV2Nodes).
    화면만의 정렬을 만들면 "보이는 순서"와 "저장된 순서"가 갈라진다.
*/
function studioCanvasLayersRows() {

  if (typeof window.studioCanvasNodeList !== "function") {
    return [];
  }

  /*
    ★ v2 만 트리로 읽는다.

    studioCanvasNodeList() 는 v1 캔버스의 평평한 요소 목록도 준다.
    하지만 Layers 가 보여 주는 것은 **v2 의 구조**다 — 흐름 · 프레임
    소속 · 페이지 장식. v1 에는 그 구분이 없어서 같은 트리로 읽으면
    "자동 배치"라는 이름 아래 아무 관계도 없는 목록이 서게 된다.
    그래서 여기서 멈추고, 화면은 왜 비었는지를 대신 말한다.
  */
  if (studioCanvasLayersVersion() !== 2) {
    return [];
  }

  const nodes =
    window.studioCanvasNodeList();

  if (!Array.isArray(nodes) || !nodes.length) {
    return [];
  }

  /*
    각 main_visual 의 대표 사진(계약 §28-1)과 각 행의 눈 · 자물쇠.

    ★ **payload 를 한 번만 읽고 한 번만 훑는다.** 노드마다
      studioCanvasNodeInfo() 를 부르면 그 함수가 그때마다
      resolveSkinHomeCanvas() 로 캔버스 전체를 다시 풀고 다시
      검증한다 — 요소가 200개면 그 일을 200번 한다. 트리는 선택이
      바뀔 때마다 만들어지므로 그 값이 그대로 화면 지연이 된다.
  */
  const primaryOf =
    {};

  const stateOf =
    {};

  const mark = (node) => {

    if (!node || typeof node !== "object" || typeof node.id !== "string") {
      return;
    }

    const props =
      (node.props && typeof node.props === "object") ? node.props : null;

    stateOf[node.id] = {
      hidden: node.hidden === true,
      locked: node.locked === true,

      /* STUDIO-LAYERS-MEDIA-1 — 그림이 들어가는 자리를 가진 행인가.
         사진 · 스티커 · 로고가 그 셋이고(계약 §14-4 의 표), 자리
         이름은 `props.slot` 하나다. 메인 비주얼 자신은 자리를 갖지
         않는다 — 그 안의 사진이 갖는다. */
      slot:
        (
          STUDIO_CANVAS_LAYER_IMAGE_TYPES.indexOf(node.type) !== -1 &&
          props &&
          typeof props.slot === "string"
        )
          ? props.slot
          : ""
    };

  };

  const payload =
    studioCanvasLayersPayload();

  const blocks =
    (payload && payload.flow && Array.isArray(payload.flow.blocks))
      ? payload.flow.blocks
      : [];

  blocks.forEach((block) => {

    mark(block);

    if (!block || block.type !== "main_visual") {
      return;
    }

    const props =
      (block.props && typeof block.props === "object") ? block.props : null;

    primaryOf[block.id] =
      (props && typeof props.primaryId === "string") ? props.primaryId : "";

    ((props && Array.isArray(props.elements)) ? props.elements : []).forEach(mark);

  });

  ((payload && Array.isArray(payload.overlays)) ? payload.overlays : []).forEach(mark);

  return nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    type: node.type,
    parentId: node.parentId || null,

    /* ★ 자기 배열 안의 **진짜 자리**다 — 끌어 옮길 때 `expected` 로
       그대로 쓴다(계약 §32-4). 화면 순서를 다시 세지 않는다. */
    index: Number.isInteger(node.index) ? node.index : -1,

    depth: node.kind === "frame-element" ? 1 : 0,
    group: node.kind === "overlay" ? "overlay" : "flow",

    hidden: stateOf[node.id] ? stateOf[node.id].hidden : false,
    locked: stateOf[node.id] ? stateOf[node.id].locked : false,

    /* 그림 자리 이름(없으면 "") — STUDIO-LAYERS-MEDIA-1 */
    slot: stateOf[node.id] ? stateOf[node.id].slot : "",

    primary:
      node.kind === "frame-element" &&
      !!node.parentId &&
      primaryOf[node.parentId] === node.id,

    /* 대표가 될 수 있는 자리인가 — 메인 비주얼 안의 사진 하나다
       (계획 문서 §2-5). 그 밖에는 단추 자체를 그리지 않는다. */
    canBePrimary:
      node.kind === "frame-element" &&
      !!node.parentId &&
      node.type === "photo"
  }));

}


function studioCanvasLayersSelection() {

  const selection =
    (typeof window.getStudioCanvasSelection === "function")
      ? window.getStudioCanvasSelection()
      : null;

  return {
    ids: (selection && Array.isArray(selection.ids)) ? selection.ids : [],
    primaryId: (selection && selection.primaryId) || null
  };

}


/* 이 프레임이 지금 펼쳐져 있는가 */
function studioCanvasLayersExpanded(blockId) {

  return !studioCanvasLayersCollapsed.has(blockId);

}


/*
  그 폴더를 펼쳐 보여 준다 (STUDIO-LAYERS-STRUCTURE-1)

  묶기가 끝난 뒤 부른다 — 방금 넣은 것이 접힌 폴더 안으로 사라지면
  주인은 아무 일도 안 일어났다고 읽는다(이번 범위의 "attach 된
  요소의 대상 폴더는 펼쳐 보인다").

  ★ 접혀 있을 때만 손댄다. 그러지 않으면 그릴 때마다 서로를 부른다.
*/
function expandStudioCanvasLayersFolder(blockId) {

  if (!blockId || !studioCanvasLayersCollapsed.has(blockId)) {
    return;
  }

  studioCanvasLayersCollapsed.delete(blockId);

  renderStudioCanvasLayers(true);

}


/*
  거절 이유 한 줄 (STUDIO-LAYERS-STRUCTURE-1)

  ★ 다시 그려도 지워지지 않는다 — 트리 DOM 과 별개의 요소다. 다음
    동작이 성공하거나 끌기를 새로 시작하면 비운다.
*/
function setStudioCanvasLayersMessage(text) {

  if (!studioCanvasLayersNote) {
    return;
  }

  const value =
    (typeof text === "string") ? text : "";

  studioCanvasLayersNote.textContent =
    value;

  studioCanvasLayersNote.hidden =
    !value;

}


/* =========================================================
   2. 고르기 — 기존 관문 하나로

   ★ 좌표를 싣지 않는다. proposeStudioCanvasSelection() 이 지금
     draft 로 존재 · 중복 · 고를 수 있는가를 다시 보고, 정렬과
     primary 까지 정한 뒤 프레임에 내려보낸다(그 파일 §6).
     여기서 그 판정을 한 벌 더 적지 않는다.
========================================================== */

function selectStudioCanvasLayer(id, additive) {

  if (typeof window.proposeStudioCanvasSelection !== "function") {
    return false;
  }

  return window.proposeStudioCanvasSelection({
    ids: [id],
    primaryId: id,
    mode: additive ? "toggle" : "replace"
  });

}


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 사진 행을 누르면 그 자리의 이미지 화면

   상단 Images 버튼이 없어진 자리를 메우는 길이다. 행을 한 번 누르면
   **고르는 일과 여는 일이 함께** 일어난다 — Preview 에는 파란 테두리,
   왼쪽 패널에는 그 자리의 이미지 선택기. ← Layers 로 돌아오면 트리와
   선택이 그대로다(선택은 이 파일이 들고 있지 않고 캔버스 선택 하나가
   원천이라 저절로 그렇다).

   ★ 여는 조건을 좁게 잡는다(사용자 지시)

     · 수식키(Ctrl/⌘ · Shift)가 눌린 클릭은 **고르기만** 한다
       — 여러 개를 고르는 중에 화면이 바뀌면 그 흐름이 끊긴다.
     · 끌고 있는 동안에는 열지 않는다.
     · 손잡이 · 눈 · 자물쇠 · 삭제는 애초에 이 핸들러에 오지 않는다
       (그 단추들이 pointerdown/click 을 멈춘다).
     · 그림 자리가 없는 종류(글자 · 도형 · 카테고리 …)는 고르기만
       한다 — 바꿀 사진이 없다.

   ★ 슬롯 이름이 지금 선언에 없으면 열지 않는다. 그런 자리는 패널이
     보여 줄 수 없고(setStudioImageSlot 도 거절한다), 빈 화면으로
     넘어가느니 트리에 남는 편이 낫다.
========================================================== */

function studioCanvasLayersDeclaredSlot(slotName) {

  if (
    typeof slotName !== "string" ||
    !slotName ||
    typeof window.getStudioImageSlotState !== "function"
  ) {
    return null;
  }

  const state =
    window.getStudioImageSlotState();

  if (!state || !Array.isArray(state.slots)) {
    return null;
  }

  return state.slots.find((slot) => slot.name === slotName) || null;

}


function openStudioCanvasLayerImages(slotName) {

  if (!studioCanvasLayersDeclaredSlot(slotName)) {
    return false;
  }

  if (typeof window.setSkinImagesPanelSlot !== "function") {
    return false;
  }

  window.setSkinImagesPanelSlot(slotName);

  if (typeof window.showStudioLeftPanelMode !== "function") {
    return false;
  }

  window.showStudioLeftPanelMode("images", { returnTo: "layers" });

  return true;

}


/* 그 자리에 지금 걸린 이미지의 식별자(없으면 "") — 트리 지문용 */
function studioCanvasLayersThumbKey(slotName) {

  const declared =
    studioCanvasLayersDeclaredSlot(slotName);

  return (declared && declared.binding) ? declared.binding.imageId : "";

}


function studioCanvasLayersIsDragging() {

  if (typeof window.getStudioCanvasLayersDragState !== "function") {
    return false;
  }

  const state =
    window.getStudioCanvasLayersDragState();

  return !!(state && state.dragging);

}


/* =========================================================
   3. DOM — 한 번 만들고 다시 쓴다
========================================================== */

function studioCanvasLayersEl(tag, className, text) {

  const node =
    document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (typeof text === "string") {
    node.textContent = text;
  }

  return node;

}


function ensureStudioCanvasLayers() {

  if (studioCanvasLayersRoot) {
    return studioCanvasLayersRoot;
  }

  const host =
    document.getElementById("studioLeftPanelLayers");

  if (!host) {
    return null;
  }

  studioCanvasLayersRoot =
    studioCanvasLayersEl("div", "studio-canvas-layers");

  studioCanvasLayersRoot.id =
    "studioCanvasLayers";


  /* ── 맨 위: 재료 추가 (계획 문서 §3) ──
     sticky 다 — 트리가 길어도 같은 자리에 있다(CSS). */

  const top =
    studioCanvasLayersEl("div", "studio-canvas-layers-top");

  studioCanvasLayersAddToggle =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-add-toggle",
      "＋ 재료 추가"
    );

  studioCanvasLayersAddToggle.type = "button";
  studioCanvasLayersAddToggle.id = "studioCanvasLayersAddToggle";
  studioCanvasLayersAddToggle.setAttribute("aria-expanded", "false");
  studioCanvasLayersAddToggle.setAttribute("aria-controls", "studioCanvasLayersAddHost");

  studioCanvasLayersAddToggle.addEventListener(
    "click",
    () => setStudioCanvasLayersAddOpen(!studioCanvasLayersAddOpen)
  );

  top.appendChild(studioCanvasLayersAddToggle);

  studioCanvasLayersRoot.appendChild(top);


  studioCanvasLayersAddHost =
    studioCanvasLayersEl("div", "studio-canvas-layers-add");

  studioCanvasLayersAddHost.id =
    "studioCanvasLayersAddHost";

  studioCanvasLayersAddHost.hidden =
    true;

  studioCanvasLayersRoot.appendChild(studioCanvasLayersAddHost);


  /* ── 왜 안 됐는가 (STUDIO-LAYERS-STRUCTURE-1) ──
     거절된 구조 동작의 이유가 여기 한 줄로 뜬다. 성공하면 비운다.
     ★ 이 줄은 화면 상태다 — draft 에도 Undo 에도 들어가지 않는다. */

  studioCanvasLayersNote =
    studioCanvasLayersEl("p", "studio-canvas-layers-note");

  studioCanvasLayersNote.id =
    "studioCanvasLayersNote";

  studioCanvasLayersNote.setAttribute("role", "status");

  studioCanvasLayersNote.hidden =
    true;

  studioCanvasLayersRoot.appendChild(studioCanvasLayersNote);


  studioCanvasLayersTree =
    studioCanvasLayersEl("div", "studio-canvas-layers-tree");

  studioCanvasLayersTree.id =
    "studioCanvasLayersTree";

  studioCanvasLayersTree.setAttribute("role", "tree");
  studioCanvasLayersTree.setAttribute("aria-label", "HOME 캔버스 레이어");

  studioCanvasLayersRoot.appendChild(studioCanvasLayersTree);


  studioCanvasLayersEmpty =
    studioCanvasLayersEl("p", "studio-canvas-layers-empty");

  studioCanvasLayersEmpty.id =
    "studioCanvasLayersEmpty";

  studioCanvasLayersRoot.appendChild(studioCanvasLayersEmpty);


  /* ── STUDIO-LAYERS-MEDIA-1 — 스킨 이미지 ──

     트리의 행으로 표현되지 않는 그림 자리들이다. 캔버스가 아닌
     스킨(legacy · v1)에서는 **모든** 자리가 여기 있고, v2 에서는
     HOME 캔버스가 쓰지 않는 자리(CATEGORY · POST · BANNER 템플릿이
     쓰는 그림 · 파비콘류)만 남는다.

     ★ 상단 Images 버튼을 되살리지 않기 위한 자리다. 그 버튼이
       사라져도 "예전에 바꿀 수 있던 그림"에 손이 닿아야 한다.
     ★ 기술 이름(slot.name)은 적지 않는다 — 사람이 읽는 label 만.
  */

  studioCanvasLayersMedia =
    studioCanvasLayersEl("section", "studio-canvas-layers-media");

  studioCanvasLayersMedia.id =
    "studioCanvasLayersMedia";

  studioCanvasLayersMedia.hidden =
    true;

  const mediaHeading =
    studioCanvasLayersEl(
      "p",
      "studio-canvas-layers-media-heading",
      "스킨 이미지"
    );

  studioCanvasLayersMedia.appendChild(mediaHeading);

  studioCanvasLayersMediaList =
    studioCanvasLayersEl("div", "studio-canvas-layers-media-list");

  studioCanvasLayersMediaList.id =
    "studioCanvasLayersMediaList";

  studioCanvasLayersMedia.appendChild(studioCanvasLayersMediaList);

  studioCanvasLayersRoot.appendChild(studioCanvasLayersMedia);


  host.appendChild(studioCanvasLayersRoot);

  return studioCanvasLayersRoot;

}


/* =========================================================
   4. 재료 추가 자리 여닫기

   ★ 화면을 만드는 곳은 studio-canvas-add-v2.js 하나다. 여기서
     종류 표도 기본값 표도 한 벌 더 적지 않는다(계획 문서 §3).
========================================================== */

function setStudioCanvasLayersAddOpen(open) {

  studioCanvasLayersAddOpen =
    !!open;

  syncStudioCanvasLayersAdd();

}


function syncStudioCanvasLayersAdd() {

  if (!studioCanvasLayersAddHost || !studioCanvasLayersAddToggle) {
    return;
  }

  const canAdd =
    typeof window.studioCanvasV2AddIsOn === "function" &&
    typeof window.buildStudioCanvasV2AddSection === "function" &&
    window.studioCanvasV2AddIsOn();

  studioCanvasLayersAddToggle.disabled =
    !canAdd;

  const open =
    canAdd && studioCanvasLayersAddOpen;

  studioCanvasLayersAddToggle.setAttribute("aria-expanded", String(open));

  studioCanvasLayersAddHost.hidden =
    !open;

  if (!open) {

    studioCanvasLayersAddHost.textContent =
      "";

    return;

  }

  /*
    ★ 다시 만드는 조건이 있다. 추가 자리의 모양은 **지금 고른 것이
      어느 프레임 안인가**에 따라 달라진다(studioCanvasV2AddFrameId —
      "메인 비주얼 안" 줄이 생기고 사라진다). 그래서 그 프레임 id 를
      지문으로 들고, 바뀔 때만 다시 그린다. 값만 바뀐 경우
      (슬롯 목록)에는 옵션만 갈아 끼운다 — 고르던 칸이 죽지 않게.
  */
  const frameId =
    (typeof window.getStudioCanvasAddState === "function")
      ? (window.getStudioCanvasAddState().frameId || "")
      : "";

  if (studioCanvasLayersAddHost.dataset.frameId !== frameId ||
      !studioCanvasLayersAddHost.firstChild) {

    studioCanvasLayersAddHost.textContent =
      "";

    studioCanvasLayersAddHost.appendChild(
      window.buildStudioCanvasV2AddSection()
    );

    studioCanvasLayersAddHost.dataset.frameId =
      frameId;

    return;

  }

  if (typeof window.syncStudioCanvasV2AddSection === "function") {
    window.syncStudioCanvasV2AddSection();
  }

}


/* =========================================================
   5. 트리 그리기
========================================================== */

/*
  행 오른쪽의 작은 단추 하나.

  ★ **pointerdown 을 멈춘다.** 그래야 이 단추를 누른 입력이 행
    고르기로도, 끌기로도 이어지지 않는다(계약 §32-2). click 만
    멈추면 끌기가 pointerdown 에서 이미 시작돼 버린다.
*/
function studioCanvasLayersActionButton(className, text, label, onClick) {

  const button =
    studioCanvasLayersEl("button", `studio-canvas-layers-action ${className}`, text);

  button.type = "button";

  button.setAttribute("aria-label", label);

  button.title = label;

  button.addEventListener("pointerdown", (event) => event.stopPropagation());

  button.addEventListener("click", (event) => {

    event.stopPropagation();

    onClick();

  });

  return button;

}


/*
  구조 동작 하나 — 부르고 결과를 화면에 적는다.

  ★ 창구는 **호출 시점에** 찾는다(studio-canvas-layers-ops.js 가 이
    파일보다 나중에 로드돼도 된다 — 다른 classic script 들과 같은
    규칙). 없으면 조용히 실패하지 않고 그 사실을 적는다.
*/
function runStudioCanvasLayersAction(name, args) {

  if (typeof window[name] !== "function") {

    setStudioCanvasLayersMessage(
      "이 동작을 아직 쓸 수 없습니다 — 화면을 새로 고쳐 주세요."
    );

    return;

  }

  const result =
    window[name].apply(null, args);

  setStudioCanvasLayersMessage(
    (result && result.accepted) ? "" : ((result && result.message) || "")
  );

}


function studioCanvasLayersRowNode(row, expanded) {

  const wrap =
    studioCanvasLayersEl("div", "studio-canvas-layers-row");

  wrap.dataset.layerId = row.id;
  wrap.dataset.layerKind = row.kind;
  wrap.dataset.layerType = row.type;
  wrap.dataset.layerParent = row.parentId || "";
  wrap.dataset.layerIndex = String(row.index);

  if (row.hidden) {
    wrap.dataset.layerHidden = "true";
  }

  if (row.locked) {
    wrap.dataset.layerLocked = "true";
  }

  if (row.depth) {
    wrap.dataset.layerDepth = String(row.depth);
  }

  wrap.setAttribute("role", "treeitem");


  /* ── 끌기 손잡이 (STUDIO-LAYERS-STRUCTURE-1) ──
     `touch-action: none` 은 이 요소 하나에만 있다(CSS) — 패널의
     세로 스크롤을 죽이지 않기 위해서다. */

  const handle =
    studioCanvasLayersEl("span", "studio-canvas-layers-handle", "⠿");

  handle.setAttribute("aria-hidden", "true");

  handle.dataset.layerHandle = row.id;

  if (typeof window.bindStudioCanvasLayersHandle === "function") {
    window.bindStudioCanvasLayersHandle(handle);
  }

  wrap.appendChild(handle);


  /* 폴더(= main_visual)만 접기 손잡이를 갖는다. 계획 문서 §2-7 —
     첫 단계의 "폴더"는 이 한 단계뿐이다. */
  const isFolder =
    row.kind === "block" && row.type === "main_visual";

  if (isFolder) {

    const twisty =
      studioCanvasLayersEl(
        "button",
        "studio-canvas-layers-twisty",
        expanded ? "▾" : "▸"
      );

    twisty.type = "button";
    twisty.id = `studioCanvasLayerTwisty-${row.id}`;
    twisty.setAttribute("aria-expanded", String(expanded));
    twisty.setAttribute(
      "aria-label",
      expanded ? "메인 비주얼 접기" : "메인 비주얼 펼치기"
    );

    twisty.addEventListener("click", (event) => {

      /* 손잡이는 **고르지 않는다** — 접고 펴기만 한다 */
      event.stopPropagation();

      if (studioCanvasLayersCollapsed.has(row.id)) {
        studioCanvasLayersCollapsed.delete(row.id);
      } else {
        studioCanvasLayersCollapsed.add(row.id);
      }

      /* 지문이 바뀌므로 다시 그린다 */
      renderStudioCanvasLayers(true);

    });

    wrap.appendChild(twisty);

  } else {

    wrap.appendChild(
      studioCanvasLayersEl("span", "studio-canvas-layers-twisty-gap")
    );

  }


  /* ── ★ 대표 사진 ──
     메인 비주얼 안의 **사진**에만 있다. 누르면 그 프레임의 대표가
     되고, 옛 대표는 보통 사진으로 남는다(계획 문서 §2-5). */

  if (row.canBePrimary) {

    const star =
      studioCanvasLayersActionButton(
        "studio-canvas-layers-star",
        row.primary ? "★" : "☆",
        row.primary ? "지금 대표 사진입니다" : "대표 사진으로 지정",
        () => {

          if (row.primary) {
            return;
          }

          runStudioCanvasLayersAction(
            "studioCanvasLayersPrimary", [row.id, row.parentId]
          );

        }
      );

    star.setAttribute("aria-pressed", String(!!row.primary));

    star.disabled = !!row.primary;

    star.id = `studioCanvasLayerPrimary-${row.id}`;

    wrap.appendChild(star);

  } else {

    wrap.appendChild(
      studioCanvasLayersEl("span", "studio-canvas-layers-star-gap")
    );

  }


  const pick =
    studioCanvasLayersEl("button", "studio-canvas-layers-pick");

  pick.type = "button";
  pick.id = `studioCanvasLayer-${row.id}`;

  /* ── STUDIO-LAYERS-MEDIA-1 — 사진 행의 작은 미리보기 ──
     지금 그 자리에 무엇이 들어 있는지 트리에서 바로 보인다. 빈
     자리는 빈 네모로 남는다(가짜 그림을 넣지 않는다). */

  const declared =
    row.slot ? studioCanvasLayersDeclaredSlot(row.slot) : null;

  if (declared) {

    const thumb =
      studioCanvasLayersEl("span", "studio-canvas-layers-thumb");

    thumb.dataset.layerThumb = declared.binding ? "filled" : "empty";

    if (declared.binding) {

      const img =
        document.createElement("img");

      img.src = declared.binding.imageUrl;
      img.alt = "";
      img.loading = "lazy";

      thumb.appendChild(img);

    }

    pick.appendChild(thumb);

  }

  /* 이름은 지금까지처럼 **종류**다 — 트리는 구조를 읽는 화면이고,
     그 자리의 사람이 읽는 이름은 넘어간 화면의 제목이 된다. */
  pick.appendChild(
    studioCanvasLayersEl(
      "span",
      "studio-canvas-layers-name",
      studioCanvasLayerLabel(row.type)
    )
  );

  pick.title =
    declared
      ? `${declared.label} — 누르면 사진을 고릅니다`
      : `${studioCanvasLayerLabel(row.type)} · ${row.id}`;

  pick.addEventListener("click", (event) => {

    /* Ctrl/⌘ 는 **더하기/빼기**다(계획 문서 §2-2). 그 판정도 여기서
       하지 않는다 — mode 만 넘기고 합치는 것은 선택 관문이 한다. */
    const additive =
      event.ctrlKey || event.metaKey;

    const picked =
      selectStudioCanvasLayer(row.id, additive);

    /* STUDIO-LAYERS-MEDIA-1 — 수식키 없는 사진 행의 단일 클릭만
       이미지 화면으로 넘어간다(위 ★). */
    if (
      !picked ||
      additive ||
      event.shiftKey ||
      !row.slot ||
      studioCanvasLayersIsDragging()
    ) {
      return;
    }

    openStudioCanvasLayerImages(row.slot);

  });

  wrap.appendChild(pick);


  /* ── 👁 눈 · 🔒 자물쇠 ──
     검증도 렌더러도 블록 · 프레임 내부 요소 · overlay 셋 모두에 이 두
     칸을 갖고 있다(계약 §32-5). 그래서 모든 행에 그린다. */

  STUDIO_CANVAS_LAYER_FLAG_BUTTONS.forEach((spec) => {

    const on =
      row[spec.flag] === true;

    const button =
      studioCanvasLayersActionButton(
        spec.className,
        on ? spec.on : spec.off,
        on ? spec.labelOn : spec.labelOff,
        () => runStudioCanvasLayersAction(
          "studioCanvasLayersFlag", [row.id, spec.flag, !on]
        )
      );

    button.setAttribute("aria-pressed", String(on));

    button.id = `studioCanvasLayer${spec.flag === "hidden" ? "Eye" : "Lock"}-${row.id}`;

    wrap.appendChild(button);

  });


  /* ── 🗑 삭제 ──
     메인 비주얼이면 자식 수를 보여 주고 한 번 묻는다. 대표 사진처럼
     지울 수 없는 것은 이유를 보여 주고 거부한다(계약 §32-9). */

  const remove =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-remove",
      "🗑",
      "삭제",
      () => runStudioCanvasLayersAction("studioCanvasLayersRemove", [row])
    );

  remove.id = `studioCanvasLayerRemove-${row.id}`;

  wrap.appendChild(remove);

  return wrap;

}


/*
  트리의 지문 — **모양**만 들어간다(선택은 빠진다).

  선택이 바뀔 때마다 DOM 을 다시 만들면 Preview 에서 요소를 고를
  때마다 Layers 의 스크롤이 처음으로 돌아간다. 선택 표시는 아래
  paintStudioCanvasLayersSelection() 이 속성만 갈아 끼운다.
*/
function studioCanvasLayersShapeOf(rows, version) {

  return `v${version || 0}|` + rows.map(
    (row) =>
      `${row.id}:${row.kind}:${row.type}:${row.parentId || ""}:${row.index}` +
      `:${row.primary ? "p" : ""}${row.canBePrimary ? "P" : ""}` +
      `:${row.hidden ? "h" : ""}${row.locked ? "l" : ""}` +
      `:${(row.kind === "block" && row.type === "main_visual" && !studioCanvasLayersExpanded(row.id)) ? "c" : ""}` +

      /* STUDIO-LAYERS-MEDIA-1 — 행의 작은 미리보기도 **모양**이다.
         사진을 바꾸면 draft 의 구조는 그대로라 이 한 조각이 없으면
         트리가 옛 그림을 그대로 들고 있는다(슬롯 연결은 구조가
         아니라 값이라 위 칸들 중 어디에도 나타나지 않는다). */
      `:${row.slot || ""}=${studioCanvasLayersThumbKey(row.slot)}`
  ).join(",");

}


function paintStudioCanvasLayersSelection() {

  if (!studioCanvasLayersTree) {
    return;
  }

  const selection =
    studioCanvasLayersSelection();

  Array.from(
    studioCanvasLayersTree.querySelectorAll(".studio-canvas-layers-row")
  ).forEach((node) => {

    const id =
      node.dataset.layerId;

    const selected =
      selection.ids.indexOf(id) !== -1;

    node.setAttribute("aria-selected", String(selected));

    node.classList.toggle("is-selected", selected);

    node.classList.toggle(
      "is-primary-selected",
      selected && selection.primaryId === id
    );

  });


  /* 고른 것이 접힌 프레임 안에 있으면 펼쳐 보여 준다
     (계획 문서 §2-2 "필요한 경우 펼쳐져 보인다").
     ★ 이 펼침은 다시 그리기를 부르므로, 실제로 접혀 있을 때만
       손댄다 — 그렇지 않으면 그릴 때마다 서로를 부른다. */
  if (!selection.primaryId) {
    return;
  }

  const info =
    (typeof window.studioCanvasNodeInfo === "function")
      ? window.studioCanvasNodeInfo(selection.primaryId)
      : null;

  if (
    info &&
    info.kind === "frame-element" &&
    info.parentId &&
    studioCanvasLayersCollapsed.has(info.parentId)
  ) {

    studioCanvasLayersCollapsed.delete(info.parentId);

    renderStudioCanvasLayers(true);

  }

}


/*
  renderStudioCanvasLayers(force)

  ★ 패널이 닫혀 있어도 도는 것이 맞다 — 가벼운 읽기이고, 다시 열
    때 이미 최신이어야 한다. 무거운 일(추가 자리 만들기)만 열려
    있을 때 한다.
*/
/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 스킨 이미지 구역 그리기

   트리가 비어 있든(legacy 스킨 · Select 가 꺼짐) 가득 차 있든 **늘**
   그린다. 이 구역이 상단 Images 버튼을 대신하므로, 트리가 없다는
   이유로 함께 사라지면 그 스킨의 그림에 손이 닿지 않는다.
========================================================== */

function studioCanvasLayersMediaSlots(rows) {

  if (typeof window.getStudioImageSlotState !== "function") {
    return [];
  }

  const state =
    window.getStudioImageSlotState();

  if (!state || !state.hasWorkingSkin || !Array.isArray(state.slots)) {
    return [];
  }

  /* 트리의 행이 이미 보여 주는 자리는 뺀다(같은 자리를 두 곳에서
     고르게 하지 않는다). v2 가 아니면 행 자체가 없으므로 전부 남는다.

     ★ rows 는 부르는 쪽이 이미 만든 것을 넘긴다 — 여기서 다시 만들면
       캔버스 전체를 한 번 더 풀고 다시 검증한다(파일 머리말의 그 비용). */
  const shown =
    new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => row.slot)
        .filter(Boolean)
    );

  return state.slots.filter((slot) => !shown.has(slot.name));

}


function renderStudioCanvasLayersMedia(rows) {

  if (!studioCanvasLayersMedia || !studioCanvasLayersMediaList) {
    return;
  }

  const slots =
    studioCanvasLayersMediaSlots(rows);

  studioCanvasLayersMedia.hidden =
    !slots.length;

  studioCanvasLayersMediaList.textContent =
    "";

  slots.forEach((slot) => {

    const button =
      studioCanvasLayersEl("button", "studio-canvas-layers-media-item");

    button.type = "button";
    button.id = `studioCanvasLayersMedia-${slot.name}`;
    button.dataset.mediaSlot = slot.name;

    const thumb =
      studioCanvasLayersEl("span", "studio-canvas-layers-thumb");

    thumb.dataset.layerThumb = slot.binding ? "filled" : "empty";

    if (slot.binding) {

      const img =
        document.createElement("img");

      img.src = slot.binding.imageUrl;
      img.alt = "";
      img.loading = "lazy";

      thumb.appendChild(img);

    }

    button.appendChild(thumb);

    button.appendChild(
      studioCanvasLayersEl(
        "span",
        "studio-canvas-layers-media-name",
        slot.label
      )
    );

    button.title =
      `${slot.label} — 누르면 사진을 고릅니다`;

    button.addEventListener("click", () => {
      openStudioCanvasLayerImages(slot.name);
    });

    studioCanvasLayersMediaList.appendChild(button);

  });

}


function renderStudioCanvasLayers(force) {

  const root =
    ensureStudioCanvasLayers();

  if (!root) {
    return;
  }

  syncStudioCanvasLayersAdd();

  const version =
    studioCanvasLayersVersion();

  const editing =
    studioCanvasLayersEditing();

  /* 트리에 그릴 행들 — 한 번만 만든다. v2 가 아니면 빈 배열이고,
     그때는 선언된 그림 자리가 **전부** 아래 구역으로 간다. */
  const rows =
    studioCanvasLayersRows();

  renderStudioCanvasLayersMedia(rows);


  /* ── 트리를 그릴 수 없는 경우들 — 왜 비었는지 말해 준다 ── */

  if (!editing || version !== 2) {

    studioCanvasLayersTree.textContent = "";

    studioCanvasLayersShape = "";

    studioCanvasLayersEmpty.hidden = false;

    studioCanvasLayersEmpty.textContent =
      !editing
        ? "HOME 캔버스를 편집할 때 이 목록이 보입니다 — 위의 Select를 켜고 HOME으로 가세요."
        : "이 HOME은 아직 캔버스(v2)가 아닙니다 — 레이어 목록이 없습니다.";

    return;

  }


  if (!rows.length) {

    studioCanvasLayersTree.textContent = "";

    studioCanvasLayersShape = "";

    studioCanvasLayersEmpty.hidden = false;

    studioCanvasLayersEmpty.textContent =
      "아직 아무것도 없습니다 — 위의 ＋ 재료 추가로 시작하세요.";

    return;

  }

  studioCanvasLayersEmpty.hidden = true;

  studioCanvasLayersEmpty.textContent = "";


  const shape =
    studioCanvasLayersShapeOf(rows, version);

  if (!force && shape === studioCanvasLayersShape) {

    paintStudioCanvasLayersSelection();

    return;

  }

  studioCanvasLayersShape =
    shape;

  studioCanvasLayersTree.textContent =
    "";


  STUDIO_CANVAS_LAYER_GROUPS.forEach((group) => {

    const mine =
      rows.filter((row) => row.group === group.key);

    /* ★ 비어 있어도 제목은 그린다(STUDIO-LAYERS-STRUCTURE-1).
       `페이지 장식` 제목이 곧 "메인 비주얼에서 빼기"의 drop 자리라,
       장식이 하나도 없을 때 그 자리가 사라지면 프레임 안의 요소를
       꺼낼 길이 없어진다. */

    const title =
      studioCanvasLayersEl("p", "studio-canvas-layers-group", group.label);

    title.id =
      `studioCanvasLayersGroup-${group.key}`;

    /* 끄는 쪽이 이 제목을 찾는다 — `페이지 장식` 이 곧 "빼기" 의
       drop 자리다(studio-canvas-layers-drag.js) */
    title.dataset.layerGroup =
      group.key;

    studioCanvasLayersTree.appendChild(title);

    if (!mine.length) {

      const none =
        studioCanvasLayersEl(
          "p",
          "studio-canvas-layers-none",
          group.key === "overlay"
            ? "아직 페이지 장식이 없습니다 — 여기로 끌어 오면 메인 비주얼에서 빠집니다."
            : "아직 자동 배치 블록이 없습니다."
        );

      none.id =
        `studioCanvasLayersNone-${group.key}`;

      studioCanvasLayersTree.appendChild(none);

    }

    mine.forEach((row) => {

      /* 접힌 프레임의 자식은 그리지 않는다 */
      if (
        row.kind === "frame-element" &&
        row.parentId &&
        !studioCanvasLayersExpanded(row.parentId)
      ) {
        return;
      }

      const expanded =
        row.kind === "block" && row.type === "main_visual"
          ? studioCanvasLayersExpanded(row.id)
          : false;

      studioCanvasLayersTree.appendChild(
        studioCanvasLayersRowNode(row, expanded)
      );

    });

  });

  paintStudioCanvasLayersSelection();

}


/* =========================================================
   6. 셸이 부르는 두 창구
========================================================== */

function openStudioCanvasLayersPanel() {

  ensureStudioCanvasLayers();

  renderStudioCanvasLayers(true);

}


/* =========================================================
   7. 연결

   ★ 이벤트 하나다 — Canvas Inspector 가 듣는 바로 그 이벤트다
     (studio-canvas-selection.js notifyStudioCanvasPanel). 선택이
     바뀌는 모든 자리와 working draft 가 바뀌는 모든 자리
     (bumpStudioWorkingRevision → reconcileStudioCanvasSelection)가
     그 한 곳을 지난다.
========================================================== */

if (typeof window !== "undefined") {

  window.addEventListener(
    "studio-canvas-panel",
    () => renderStudioCanvasLayers(false)
  );

  window.openStudioCanvasLayersPanel = openStudioCanvasLayersPanel;
  window.renderStudioCanvasLayers = renderStudioCanvasLayers;

  /* STUDIO-LAYERS-STRUCTURE-1 — 끄는 쪽과 구조 동작이 부르는 둘 */
  window.setStudioCanvasLayersMessage = setStudioCanvasLayersMessage;
  window.expandStudioCanvasLayersFolder = expandStudioCanvasLayersFolder;

  /* 진단 · 테스트가 보는 한 줄 — production 코드는 읽지 않는다 */
  window.getStudioCanvasLayersState =
    () => {

      const selection =
        studioCanvasLayersSelection();

      const rows =
        studioCanvasLayersRows();

      return {
        version: studioCanvasLayersVersion(),
        editing: studioCanvasLayersEditing(),

        open:
          typeof window.isStudioLeftPanelShowing === "function" &&
          window.isStudioLeftPanelShowing("layers"),

        /* 저장 구조 그대로 — 테스트가 draft 배열 순서와 맞춰 본다 */
        rows: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          type: row.type,
          parentId: row.parentId,
          index: row.index,
          primary: row.primary,
          canBePrimary: row.canBePrimary,
          hidden: row.hidden,
          locked: row.locked,

          /* STUDIO-LAYERS-MEDIA-1 — 그림 자리 이름(없으면 "") */
          slot: row.slot || "",
          expanded:
            (row.kind === "block" && row.type === "main_visual")
              ? studioCanvasLayersExpanded(row.id)
              : null
        })),

        note:
          (studioCanvasLayersNote && !studioCanvasLayersNote.hidden)
            ? studioCanvasLayersNote.textContent
            : "",

        /* 실제로 화면에 그려진 행들(접힌 프레임의 자식은 빠진다) */
        drawn:
          studioCanvasLayersTree
            ? Array.from(
                studioCanvasLayersTree.querySelectorAll(".studio-canvas-layers-row")
              ).map((node) => node.dataset.layerId)
            : [],

        selectedIds: selection.ids.slice(),
        primaryId: selection.primaryId,

        /* STUDIO-LAYERS-MEDIA-1 — 트리 아래의 스킨 이미지 구역 */
        media: {
          visible: !!(studioCanvasLayersMedia && !studioCanvasLayersMedia.hidden),
          slots:
            studioCanvasLayersMediaList
              ? Array.from(
                  studioCanvasLayersMediaList.querySelectorAll(".studio-canvas-layers-media-item")
                ).map((node) => node.dataset.mediaSlot)
              : []
        },

        add: {
          on:
            typeof window.studioCanvasV2AddIsOn === "function" &&
            window.studioCanvasV2AddIsOn(),
          open: studioCanvasLayersAddOpen,
          visible: !!document.getElementById("studioCanvasAdd")
        }
      };

    };

}
