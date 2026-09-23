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

   그리고 맨 위에 `＋ 재료 추가`를 둔다. 누르면 트리가 물러나고
   **요소 추가 하위 화면**이 같은 자리에 선다
   (STUDIO-LAYERS-MATERIALS-1A · 계약 §35) — 그 화면의 본문(분류 둘 ·
   카드 여덟)을 만드는 곳은 여전히
   studio/inspector/studio-canvas-add-v2.js 한 곳이고, 이 파일은
   **머리(`← Layers` · 제목)와 돌아가는 길**만 갖는다. 어디로
   돌아갈지 아는 곳이 여기뿐이기 때문이다.

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

/* STUDIO-LAYERS-MATERIALS-1A — 하위 화면의 머리(`← Layers` · 제목) */
let studioCanvasLayersAddHead = null;

let studioCanvasLayersAddHost = null;

let studioCanvasLayersNote = null;

/* HOME-CANVAS-GROUP-1A — 맨 위의 `그룹 만들기` 단추 */
let studioCanvasLayersGroupButton = null;

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

  const base =
    nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      type: node.type,
      parentId: node.parentId || null,

      /* ★ 자기 배열 안의 **진짜 자리**다 — 끌어 옮길 때 `expected` 로
         그대로 쓴다(계약 §32-4). 화면 순서를 다시 세지 않는다. */
      index: Number.isInteger(node.index) ? node.index : -1,

      depth: node.kind === "frame-element" ? 1 : 0,
      group: node.kind === "overlay" ? "overlay" : "flow",

      /* HOME-CANVAS-GROUP-1A — 이 행이 들어 있는 그룹(없으면 null) */
      groupId: null,

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

  return studioCanvasLayersWithGroups(base);

}


/* =========================================================
   HOME-CANVAS-GROUP-1A — 폴더 행 끼우기 (계약 §38-4)

   그룹 멤버는 배열에서 **연속일 필요가 없다.** 폴더를 만들려고
   배열을 재정렬하지 않는다 — 그것은 곧 앞뒤 겹침 순서가 바뀐다는
   뜻이고, "그룹을 만들어도 화면이 안 바뀐다"에 정면으로 어긋난다.

   그래서 화면에서만 모은다.

     · 폴더 행은 그 그룹의 **첫 멤버 자리**(배열에서 가장 앞선
       멤버)에 선다.
     · 폴더 안의 자식 순서는 **원본 배열의 상대 순서** 그대로다.
     · 멤버 사이에 끼어 있던 그룹 밖 요소는 폴더 **뒤로** 밀려
       그려진다. 데이터는 한 칸도 안 움직인다.

   ★ 순서 끌기는 이 화면 순서를 세지 않고 **배열 index** 로 자리를
     정한다(studio-canvas-layers-drag.js) — 그래서 폴더가 모아
     놓아도 끌어 옮긴 결과가 맞는다.
========================================================== */

function studioCanvasLayersWithGroups(rows) {

  const groups =
    (typeof window.studioCanvasDraftGroups === "function")
      ? window.studioCanvasDraftGroups()
      : [];

  if (!groups.length) {
    return rows;
  }

  /* 요소 id → 그 요소를 가진 그룹. 낡은 명단(없는 id)은 저절로
     빠진다 — 없는 것을 있는 것처럼 그리지 않는다(설계 §7-3). */
  const ownerOf = {};

  const groupById = {};

  groups.forEach(
    (group) => {

      groupById[group.id] = group;

      group.members.forEach(
        (id) => {
          if (!Object.prototype.hasOwnProperty.call(ownerOf, id)) {
            ownerOf[id] = group.id;
          }
        }
      );

    }
  );

  const membersOf = {};

  rows.forEach(
    (row) => {

      const groupId =
        ownerOf[row.id];

      if (!groupId) {
        return;
      }

      row.groupId = groupId;

      (membersOf[groupId] = membersOf[groupId] || []).push(row);

    }
  );

  const emitted = {};

  const out = [];

  rows.forEach(
    (row) => {

      if (!row.groupId) {
        out.push(row);
        return;
      }

      if (emitted[row.groupId]) {
        return;
      }

      emitted[row.groupId] = true;

      const mine =
        membersOf[row.groupId];

      /* 그룹이 성립하려면 **화면에 실제로 보이는 멤버**가 둘 이상
         이어야 한다. 하나뿐이면 폴더를 그리지 않고 그냥 그 요소다. */
      if (!mine || mine.length < 2) {
        mine.forEach((item) => { item.groupId = null; });
        out.push(row);
        return;
      }

      const group =
        groupById[row.groupId];

      out.push({
        id: group.id,
        kind: "group",
        type: "group",

        /* 프레임 안의 그룹은 그 프레임의 자식 자리에 선다 */
        parentId: row.parentId,
        index: -1,
        depth: row.depth,
        group: row.group,
        groupId: null,

        name: group.name || "",
        count: mine.length,

        /* 파생 표시 — 멤버가 전부 숨김/잠김이면 폴더도 그렇게 보인다.
           **누를 수 없다**(계약 §38-11). */
        hidden: mine.every((item) => item.hidden),
        locked: mine.every((item) => item.locked),

        slot: "",
        primary: false,
        canBePrimary: false
      });

      mine.forEach(
        (item) => {
          out.push(Object.assign({}, item, { depth: item.depth + 1 }));
        }
      );

    }
  );

  return out;

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
  접었다 펼 수 있는 행인가 — `main_visual` 프레임과 **그룹 폴더**
  둘이다(HOME-CANVAS-GROUP-1A).
*/
function studioCanvasLayersIsFolder(row) {

  return (
    row.kind === "group" ||
    (row.kind === "block" && row.type === "main_visual")
  );

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


/*
  HOME-CANVAS-GROUP-1A — 폴더 행을 누르면 **멤버 전부**를 고른다
  (계약 §38-9).

  ★ 새 선택 상태를 만들지 않는다. 지금 있는 다중 선택 하나(ids
    배열)를 그대로 쓰고, 그 집합이 어떤 그룹의 멤버와 같아지는
    순간 패널이 "그룹 선택"으로 읽는다 — 파생이라 Undo ·
    reconcile · lasso 가 그대로 맞는다.

  ★ 1A 에서는 그 선택에 **이동 · 크기 · 회전 손잡이가 붙지
    않는다.** 다중 선택이면 Moveable 이 이미 손잡이를 끄고 틀만
    그린다(계약 §16 · §38-9) — 새로 끄는 줄이 없다.
*/
function selectStudioCanvasLayerGroup(groupId) {

  if (
    typeof window.studioCanvasGroupInfo !== "function" ||
    typeof window.proposeStudioCanvasSelection !== "function"
  ) {
    return false;
  }

  const info =
    window.studioCanvasGroupInfo(groupId);

  if (!info || !info.live.length) {
    return false;
  }

  return window.proposeStudioCanvasSelection({
    ids: info.live.slice(),
    primaryId: info.live[info.live.length - 1],
    mode: "replace"
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


  /* ── 그룹 만들기 (HOME-CANVAS-GROUP-1A · 계약 §38-3) ──

     여럿을 고른 상태에서만 보인다. **고를 수 없는 조합이면
     보이되 눌리지 않고**, 왜 안 되는지 한 줄을 적는다 — 조용히
     사라지면 주인은 이 기능이 있는지조차 모른다. */

  studioCanvasLayersGroupButton =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-group-create",
      "▣ 그룹 만들기"
    );

  studioCanvasLayersGroupButton.type = "button";
  studioCanvasLayersGroupButton.id = "studioCanvasLayersGroupCreate";
  studioCanvasLayersGroupButton.hidden = true;

  studioCanvasLayersGroupButton.addEventListener(
    "click",
    () => runStudioCanvasLayersAction("studioCanvasLayersGroupCreate", [])
  );

  top.appendChild(studioCanvasLayersGroupButton);


  /* ── 하위 화면의 머리 (STUDIO-LAYERS-MATERIALS-1A) ──

     `＋ 재료 추가`를 누르면 트리가 물러나고 **요소 추가** 화면이
     그 자리에 선다. 돌아가는 길이 하나(`← Layers`)뿐이어야 하므로
     그 단추는 같은 sticky 줄에 있고, 본문(카드 격자)을 만드는 곳은
     여전히 studio/inspector/studio-canvas-add-v2.js 하나다.

     ★ Images 의 자리 하나 화면과 같은 규칙이다 — 어디로 돌아갈지
       아는 곳이 화면을 연 쪽이다(studio-shell.js 의 그 사고방식). */

  studioCanvasLayersAddHead =
    studioCanvasLayersEl("div", "studio-canvas-layers-subhead");

  studioCanvasLayersAddHead.id =
    "studioCanvasAddHead";

  studioCanvasLayersAddHead.hidden =
    true;

  const back =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-back",
      "← Layers"
    );

  back.type = "button";
  back.id = "studioCanvasAddBack";

  /* STUDIO-LAYERS-MATERIALS-1B — 뒤로가기는 **한 단계씩**이다
     (계약 §36-3).

       재료 목록  →  요소 추가  →  Layers

     그 첫 단계를 아는 곳은 추가 화면 자신이다(어느 분류를 열고
     있는지 그쪽만 안다). 그래서 먼저 물어보고, 그쪽이 처리하지
     않았을 때만 이 패널이 하위 화면을 닫는다. */
  back.addEventListener(
    "click",
    () => studioCanvasLayersAddBack()
  );

  studioCanvasLayersAddHead.appendChild(back);

  const subtitle =
    studioCanvasLayersEl(
      "p",
      "studio-canvas-layers-subtitle",
      "요소 추가"
    );

  subtitle.id =
    "studioCanvasAddTitle";

  studioCanvasLayersAddHead.appendChild(subtitle);

  top.appendChild(studioCanvasLayersAddHead);

  studioCanvasLayersRoot.appendChild(top);


  /* Escape 도 `← Layers` 와 같은 곳으로 간다 — 하위 화면에 갇히지
     않게. 패널 안에서만 듣는다(문서 전역에 또 하나 달지 않는다). */
  studioCanvasLayersRoot.addEventListener("keydown", (event) => {

    if (event.key === "Escape" && studioCanvasLayersAddOpen) {
      event.stopPropagation();

      /* `←` 와 **같은 곳**을 지난다 — 단계가 두 곳에 적히면 한쪽만
         고쳐지는 날 Escape 만 한 단계를 건너뛴다 */
      studioCanvasLayersAddBack();
    }

  });


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

/* =========================================================
   STUDIO-LAYERS-MATERIALS-1B — 뒤로가기 한 단계 (계약 §36-3)

   `←` 와 Escape 가 함께 지나는 한 곳이다.

     재료 목록  →  요소 추가   추가 화면이 처리한다
     요소 추가  →  Layers      이 패널이 하위 화면을 닫는다

   ★ 단계를 **이 함수 하나**로 모은다. 두 곳에 적으면 한쪽만
     고쳐지는 날 Escape 만 한 단계를 건너뛴다.
========================================================== */
function studioCanvasLayersAddBack() {

  if (
    typeof window.studioCanvasV2AddBack === "function" &&
    window.studioCanvasV2AddBack()
  ) {
    return;
  }

  setStudioCanvasLayersAddOpen(false);

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1B — 하위 화면의 머리

   제목이 화면마다 다르다("요소 추가" · 그 분류 이름). 무엇을
   적을지 아는 곳은 추가 화면이고, 어디에 적을지 아는 곳은 여기다.
   그래서 그쪽이 화면을 바꾸면 이 함수를 부른다.
========================================================== */
function syncStudioCanvasLayersAddHead() {

  const title =
    document.getElementById("studioCanvasAddTitle");

  const back =
    document.getElementById("studioCanvasAddBack");

  if (!title || !back) {
    return;
  }

  const deep =
    typeof window.getStudioCanvasAddState === "function" &&
    window.getStudioCanvasAddState().screen === "items";

  title.textContent =
    (typeof window.studioCanvasV2AddTitle === "function")
      ? window.studioCanvasV2AddTitle()
      : "요소 추가";

  /* 어디로 돌아가는지 글자로 적는다 — 두 단계가 같은 모양이면
     "한 번 더 눌러야 트리로 간다"를 알 수 없다 */
  back.textContent =
    deep ? "← 요소 추가" : "← Layers";

}


function setStudioCanvasLayersAddOpen(open) {

  const was =
    studioCanvasLayersAddOpen;

  studioCanvasLayersAddOpen =
    !!open;

  /* STUDIO-LAYERS-MATERIALS-1B — 하위 화면을 닫으면 다음에 열 때
     분류 격자부터다. 닫아 둔 화면의 단계를 기억하면 `＋ 재료 추가`
     가 사람마다 다른 화면을 연다. */
  if (
    !studioCanvasLayersAddOpen &&
    typeof window.resetStudioCanvasV2AddScreen === "function"
  ) {
    window.resetStudioCanvasV2AddScreen();
  }

  syncStudioCanvasLayersAdd();

  syncStudioCanvasLayersAddHead();

  if (was === studioCanvasLayersAddOpen) {
    return;
  }

  /* 화면이 바뀌었으면 초점도 따라간다 — 하위 화면에서는 `← Layers`,
     돌아오면 그 화면을 연 `＋ 재료 추가`. 키보드만 쓰는 사람이
     사라진 단추에 초점을 둔 채 남지 않게. */
  const focus =
    studioCanvasLayersAddOpen
      ? document.getElementById("studioCanvasAddBack")
      : studioCanvasLayersAddToggle;

  if (focus && !focus.hidden && typeof focus.focus === "function") {
    focus.focus();
  }

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1A — 트리로 돌아가 그 행을 드러낸다

   재료를 만든 직후(그리고 "이미 있는 것"을 고른 직후) 부른다.
   하위 화면을 닫고 · 접힌 프레임을 펼치고 · 그 행이 보이는 자리로
   스크롤한다. 선택 자체는 이미 기존 관문이 했다.

   ★ 창구를 두는 이유는 **돌아갈 곳을 아는 곳이 여기뿐**이기
     때문이다. studio-canvas-add-v2.js 는 자기가 어느 패널의 어느
     화면에 붙어 있는지 몰라도 된다.
========================================================== */
function revealStudioCanvasLayersRow(elementId, note) {

  setStudioCanvasLayersAddOpen(false);

  setStudioCanvasLayersMessage(
    (typeof note === "string") ? note : ""
  );

  const info =
    (typeof window.studioCanvasNodeInfo === "function")
      ? window.studioCanvasNodeInfo(elementId)
      : null;

  if (info && info.kind === "frame-element" && info.parentId) {
    expandStudioCanvasLayersFolder(info.parentId);
  }

  renderStudioCanvasLayers(true);

  if (!studioCanvasLayersTree) {
    return;
  }

  const row =
    Array.from(
      studioCanvasLayersTree.querySelectorAll(".studio-canvas-layers-row")
    ).find((node) => node.dataset.layerId === elementId);

  if (row && typeof row.scrollIntoView === "function") {
    row.scrollIntoView({ block: "nearest" });
  }

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

  /* STUDIO-LAYERS-MATERIALS-1A — 트리인가 하위 화면인가.
     트리 · 빈 안내 · 스킨 이미지 · 상태 줄을 한꺼번에 물리는 것은
     CSS 다(아래 세 줄이 각자 hidden 을 다투지 않게). */
  studioCanvasLayersRoot.dataset.layersScreen =
    open ? "add" : "tree";

  studioCanvasLayersAddToggle.hidden =
    open;

  if (studioCanvasLayersAddHead) {
    studioCanvasLayersAddHead.hidden = !open;
  }

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

    /* 새로 그린 본문이 몇 번째 화면인지 머리도 따라간다 */
    syncStudioCanvasLayersAddHead();

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


/* =========================================================
   HOME-CANVAS-GROUP-1A — 폴더 행 (계약 §38-4 · §38-6 · §38-7)

   ★ 손잡이가 없다. 그룹을 한 덩어리로 위아래 옮기는 것은 1A 에
     없다 — 멤버를 배열에서 연속으로 모으면 사이에 낀 요소와의
     겹침 순서가 바뀌기 때문이다(설계 §5 의 ★).

   ★ 눈 · 자물쇠도 없다. 저장 구조에 그룹의 `hidden`/`locked` 칸이
     **없고**(계약 §38-1), 멤버 전부에 일괄로 쓰면 **끌 때 되돌릴
     수 없다** — 원래 혼자 숨어 있던 멤버까지 함께 드러난다.
     되돌릴 수 없는 토글을 만들지 않는다.
========================================================== */

/* 이름을 고치고 있는 그룹 — { id, start } | null */
let studioCanvasLayersRenaming = null;


function studioCanvasLayersGroupRowNode(row, expanded) {

  const wrap =
    studioCanvasLayersEl("div", "studio-canvas-layers-row studio-canvas-layers-group-row");

  wrap.dataset.layerId = row.id;
  wrap.dataset.layerKind = "group";
  wrap.dataset.layerType = "group";
  wrap.dataset.layerParent = row.parentId || "";
  wrap.dataset.layerIndex = "-1";
  wrap.dataset.layerCount = String(row.count);

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

  /* 손잡이 자리는 비워 둔다 — 들여쓰기가 멤버 행과 어긋나지 않게 */
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-handle-gap")
  );

  const twisty =
    studioCanvasLayersEl(
      "button",
      "studio-canvas-layers-twisty",
      expanded ? "▾" : "▸"
    );

  twisty.type = "button";
  twisty.id = `studioCanvasLayerTwisty-${row.id}`;
  twisty.setAttribute("aria-expanded", String(expanded));
  twisty.setAttribute("aria-label", expanded ? "그룹 접기" : "그룹 펼치기");

  twisty.addEventListener("click", (event) => {

    event.stopPropagation();

    if (studioCanvasLayersCollapsed.has(row.id)) {
      studioCanvasLayersCollapsed.delete(row.id);
    } else {
      studioCanvasLayersCollapsed.add(row.id);
    }

    renderStudioCanvasLayers(true);

  });

  wrap.appendChild(twisty);

  /* ★ 자리는 비우지 않는다 — 멤버 행의 ★ 칸과 폭을 맞춘다 */
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-star-gap")
  );


  const pick =
    studioCanvasLayersEl("button", "studio-canvas-layers-pick");

  pick.type = "button";
  pick.id = `studioCanvasLayer-${row.id}`;

  pick.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-folder", "📁")
  );

  const renaming =
    !!(studioCanvasLayersRenaming && studioCanvasLayersRenaming.id === row.id);

  if (renaming) {

    /* ★ 고치는 동안에는 멤버 수와 단추 셋이 물러난다(CSS). 390px
       에서 그 칸들이 그대로 서 있으면 입력 칸이 60px 도 안 남는다
       — 실측 58px. 어차피 고치는 중에는 누를 수 없는 것들이다. */
    wrap.dataset.layerRenaming = "true";

    /* 인라인 입력 — 확정은 Enter · blur, 취소는 Escape(계약 §38-6) */
    const input =
      document.createElement("input");

    input.type = "text";
    input.className = "studio-canvas-layers-rename";
    input.id = `studioCanvasLayerRenameInput-${row.id}`;
    input.value = row.name || "";
    input.maxLength =
      (typeof window.SKIN_HOME_CANVAS_GROUP_NAME_MAX === "number")
        ? window.SKIN_HOME_CANVAS_GROUP_NAME_MAX
        : 40;
    input.setAttribute("aria-label", "그룹 이름");

    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());

    let done = false;

    const finish = (commit) => {

      if (done) {
        return;
      }

      done = true;

      const value = input.value;

      studioCanvasLayersRenaming = null;

      if (commit) {
        runStudioCanvasLayersAction(
          "studioCanvasLayersGroupRename", [row.id, value]
        );
      }

      renderStudioCanvasLayers(true);

    };

    input.addEventListener("keydown", (event) => {

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      }
      else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }

    });

    input.addEventListener("blur", () => finish(true));

    pick.appendChild(input);

    /* 그리고 나서 초점을 준다 — 다시 그린 직후다 */
    window.setTimeout(() => {
      if (input.isConnected) {
        input.focus();
        input.select();
      }
    }, 0);

  }
  else {

    pick.appendChild(
      studioCanvasLayersEl(
        "span",
        "studio-canvas-layers-name",
        row.name || "그룹"
      )
    );

  }

  pick.appendChild(
    studioCanvasLayersEl(
      "span",
      "studio-canvas-layers-count",
      `(${row.count})`
    )
  );

  pick.title =
    `${row.name || "그룹"} · 요소 ${row.count}개 — 누르면 전체를 고릅니다`;

  pick.addEventListener("click", (event) => {

    if (renaming) {
      return;
    }

    event.stopPropagation();

    selectStudioCanvasLayerGroup(row.id);

  });

  /* 더블클릭은 이름 고치기다(계약 §38-6) */
  pick.addEventListener("dblclick", (event) => {

    event.stopPropagation();
    event.preventDefault();

    studioCanvasLayersRenaming = { id: row.id };

    renderStudioCanvasLayers(true);

  });

  wrap.appendChild(pick);


  /* 눈 · 자물쇠 자리는 비운다 — 폭을 멤버 행과 맞추되 누를 수 없다 */
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-flag-gap")
  );
  wrap.appendChild(
    studioCanvasLayersEl("span", "studio-canvas-layers-flag-gap")
  );


  /* ── ✎ 이름 변경 ── */

  const rename =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-rename-button",
      "✎",
      "그룹 이름 변경",
      () => {
        studioCanvasLayersRenaming = { id: row.id };
        renderStudioCanvasLayers(true);
      }
    );

  rename.id = `studioCanvasLayerRename-${row.id}`;

  wrap.appendChild(rename);


  /* ── ⤺ 그룹 해제 — 폴더만 없앤다 ── */

  const dissolve =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-dissolve",
      "⤺",
      "그룹 해제 — 폴더만 없애고 요소는 남깁니다",
      () => runStudioCanvasLayersAction(
        "studioCanvasLayersGroupDissolve", [row.id]
      )
    );

  dissolve.id = `studioCanvasLayerDissolve-${row.id}`;

  wrap.appendChild(dissolve);


  /* ── 🗑 그룹 삭제 — 자식까지 ── */

  const remove =
    studioCanvasLayersActionButton(
      "studio-canvas-layers-remove",
      "🗑",
      "그룹 삭제 — 안의 요소까지 함께 지웁니다",
      () => runStudioCanvasLayersAction(
        "studioCanvasLayersGroupRemove", [row.id]
      )
    );

  remove.id = `studioCanvasLayerRemove-${row.id}`;

  wrap.appendChild(remove);

  return wrap;

}


function studioCanvasLayersRowNode(row, expanded) {

  if (row.kind === "group") {
    return studioCanvasLayersGroupRowNode(row, expanded);
  }

  const wrap =
    studioCanvasLayersEl("div", "studio-canvas-layers-row");

  wrap.dataset.layerId = row.id;
  wrap.dataset.layerKind = row.kind;
  wrap.dataset.layerType = row.type;
  wrap.dataset.layerParent = row.parentId || "";
  wrap.dataset.layerIndex = String(row.index);

  /* HOME-CANVAS-GROUP-1A — 이 행이 어느 폴더 안인가(없으면 빈 값).
     끌기가 "그룹에서 빼기"를 이 한 칸으로 판정한다. */
  wrap.dataset.layerGroupId = row.groupId || "";

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
      `:${studioCanvasLayersIsFolder(row) && !studioCanvasLayersExpanded(row.id) ? "c" : ""}` +

      /* HOME-CANVAS-GROUP-1A — 소속 · 이름 · 멤버 수 · 이름 고치는 중.
         넷 다 **모양**이다: 소속이 바뀌면 행이 폴더 안팎으로 옮겨
         가고, 이름 칸은 입력으로 바뀐다. 빠지면 옛 DOM 이 남는다. */
      `:${row.groupId || ""}` +
      `:${row.kind === "group" ? `${row.name}/${row.count}` : ""}` +
      `:${(studioCanvasLayersRenaming && studioCanvasLayersRenaming.id === row.id) ? "r" : ""}` +

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

  /* =====================================================
     HOME-CANVAS-GROUP-1A — 고른 것이 접힌 **그룹** 안일 수도 있다
     (계약 §38-4). 프레임과 같은 규칙이고, 그룹 선택 자체(멤버
     전부)에서도 그 폴더가 열린다.
  ====================================================== */
  const groupId =
    (typeof window.studioCanvasGroupOfMember === "function")
      ? window.studioCanvasGroupOfMember(selection.primaryId)
      : null;

  /*
    ★ **그룹 전체를 고른 경우는 펼치지 않는다.** 폴더 행을 누르면
      멤버 전부가 선택인데(§38-9), 그것을 "안에 있는 것을 골랐다"로
      읽으면 접은 폴더가 곧바로 다시 열려 접을 수가 없다. 자동
      펼침은 **자식 하나를 따로 골랐을 때**의 규칙이다(계약 §38-4).
  */
  const whole =
    (typeof window.studioCanvasSelectedGroup === "function")
      ? window.studioCanvasSelectedGroup()
      : null;

  if (groupId && whole && whole.id === groupId) {
    return;
  }

  if (groupId && studioCanvasLayersCollapsed.has(groupId)) {

    studioCanvasLayersCollapsed.delete(groupId);

    renderStudioCanvasLayers(true);

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


/* =========================================================
   HOME-CANVAS-GROUP-1A — `그룹 만들기` 단추의 상태 (계약 §38-3)

   ★ 판정을 여기서 하지 않는다. "지금 고른 것으로 묶을 수 있는가"는
     선택을 들고 있는 곳이 안다(studioCanvasGroupCreateReason) —
     같은 규칙을 두 벌 적으면 단추와 관문이 갈라진다.
========================================================== */

function syncStudioCanvasLayersGroupButton() {

  if (!studioCanvasLayersGroupButton) {
    return;
  }

  /* 하위 화면(재료 추가)에서는 트리가 물러나 있다 — 함께 숨는다 */
  if (
    studioCanvasLayersAddOpen ||
    studioCanvasLayersVersion() !== 2 ||
    !studioCanvasLayersEditing()
  ) {
    studioCanvasLayersGroupButton.hidden = true;
    return;
  }

  const selection =
    studioCanvasLayersSelection();

  if (selection.ids.length < 2) {
    studioCanvasLayersGroupButton.hidden = true;
    return;
  }

  /* 이미 그 자체가 한 그룹이면 만들 것이 없다 */
  const already =
    (typeof window.studioCanvasSelectedGroup === "function")
      ? window.studioCanvasSelectedGroup()
      : null;

  if (already) {
    studioCanvasLayersGroupButton.hidden = true;
    return;
  }

  const reason =
    (typeof window.studioCanvasGroupCreateReason === "function")
      ? window.studioCanvasGroupCreateReason()
      : "";

  studioCanvasLayersGroupButton.hidden = false;

  studioCanvasLayersGroupButton.disabled = !!reason;

  studioCanvasLayersGroupButton.dataset.reason = reason || "";

  studioCanvasLayersGroupButton.title =
    reason
      ? (
          (typeof window.studioCanvasLayersRejectText === "function")
            ? window.studioCanvasLayersRejectText("group-create", reason)
            : "지금은 묶을 수 없습니다."
        )
      : `고른 요소 ${selection.ids.length}개를 한 그룹으로 묶습니다`;

}


function renderStudioCanvasLayers(force) {

  const root =
    ensureStudioCanvasLayers();

  if (!root) {
    return;
  }

  syncStudioCanvasLayersAdd();

  syncStudioCanvasLayersGroupButton();

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

      /* 접힌 프레임의 자식은 그리지 않는다 — 폴더 행 자신도 그렇다 */
      if (
        (row.kind === "frame-element" || row.kind === "group") &&
        row.parentId &&
        !studioCanvasLayersExpanded(row.parentId)
      ) {
        return;
      }

      /* HOME-CANVAS-GROUP-1A — 접힌 그룹의 멤버도 그리지 않는다 */
      if (row.groupId && !studioCanvasLayersExpanded(row.groupId)) {
        return;
      }

      const expanded =
        studioCanvasLayersIsFolder(row)
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

  /* HOME-CANVAS-GROUP-1A — 폴더 고르기와 이름 고치기.
     ★ 이름 입력 칸은 **트리의 그 행 하나**다. Canvas 패널의
       `이름 변경` 도 이 창구로 와서 같은 칸을 연다 — 입력을 두 벌
       만들지 않는다(계약 §38-6). */
  window.selectStudioCanvasLayerGroup = selectStudioCanvasLayerGroup;

  window.startStudioCanvasLayersRename =
    (groupId) => {

      if (
        typeof window.studioCanvasGroupInfo !== "function" ||
        !window.studioCanvasGroupInfo(groupId)
      ) {
        return false;
      }

      studioCanvasLayersRenaming = { id: groupId };

      studioCanvasLayersCollapsed.delete(groupId);

      if (typeof window.showStudioLeftPanelMode === "function") {
        window.showStudioLeftPanelMode("layers");
      }

      ensureStudioCanvasLayers();

      renderStudioCanvasLayers(true);

      return true;

    };

  /* STUDIO-LAYERS-MATERIALS-1A — 재료 화면이 트리로 돌아오는 창구 */
  window.revealStudioCanvasLayersRow = revealStudioCanvasLayersRow;
  window.setStudioCanvasLayersAddOpen = setStudioCanvasLayersAddOpen;

  /* STUDIO-LAYERS-MATERIALS-1B — 하위 화면의 머리와 뒤로가기 한 단계 */
  window.syncStudioCanvasLayersAddHead = syncStudioCanvasLayersAddHead;
  window.studioCanvasLayersAddBack = studioCanvasLayersAddBack;

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

          /* HOME-CANVAS-GROUP-1A — 소속 폴더 · 폴더 행의 이름과 수 */
          groupId: row.groupId || "",
          name: row.kind === "group" ? (row.name || "") : "",
          count: row.kind === "group" ? row.count : 0,
          depth: row.depth,

          expanded:
            studioCanvasLayersIsFolder(row)
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

        /* STUDIO-LAYERS-MATERIALS-1A — 지금 서 있는 화면 */
        screen:
          studioCanvasLayersRoot
            ? (studioCanvasLayersRoot.dataset.layersScreen || "tree")
            : "",

        /* HOME-CANVAS-GROUP-1A — 그룹 명단 · 만들기 단추 · 이름 입력 */
        groups:
          (typeof window.studioCanvasDraftGroups === "function")
            ? window.studioCanvasDraftGroups()
            : [],

        selectedGroup:
          (typeof window.studioCanvasSelectedGroup === "function" &&
            window.studioCanvasSelectedGroup())
            ? window.studioCanvasSelectedGroup().id
            : null,

        groupCreate: {
          visible: !!(studioCanvasLayersGroupButton && !studioCanvasLayersGroupButton.hidden),
          disabled: !!(studioCanvasLayersGroupButton && studioCanvasLayersGroupButton.disabled),
          reason:
            (studioCanvasLayersGroupButton && studioCanvasLayersGroupButton.dataset.reason) || ""
        },

        renaming: studioCanvasLayersRenaming ? studioCanvasLayersRenaming.id : null,

        add: {
          on:
            typeof window.studioCanvasV2AddIsOn === "function" &&
            window.studioCanvasV2AddIsOn(),
          open: studioCanvasLayersAddOpen,
          visible: !!document.getElementById("studioCanvasAdd"),

          /* 하위 화면의 머리 — `← Layers` 와 제목 */
          back: !!(studioCanvasLayersAddHead && !studioCanvasLayersAddHead.hidden),
          title:
            (document.getElementById("studioCanvasAddTitle") || {}).textContent || ""
        }
      };

    };

}
