/* =========================================================
   STUDIO — LAYERS · 트리 조립 (STUDIO-CANVAS-LAYERS-SPLIT-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md
              §1 · §2 · §3
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §23 · §25 ·
              §28 · §32 · §35 · §38

   studio/inspector/studio-canvas-layers.js 에서 갈라 나온 셋 중 하나다.
   여기는 **무엇을 그릴 것인가**만 안다 — DOM 을 하나도 만들지 않는다.

     · 지금 working draft 를 읽어 행 목록을 만든다
     · 그룹 폴더 행을 화면에서만 끼운다(계약 §38-4)
     · 접힘 · 폴더 판정 · 트리의 지문(shape)을 계산한다
     · 그림 자리(슬롯) 선언을 읽는다

   ── 상태를 갖지 않는다 ─────────────────────────────────
   접힘 집합(studioCanvasLayersCollapsed) · 이름 고치는 중
   (studioCanvasLayersRenaming) 을 **읽기만** 한다. 그 둘을 선언하고
   고치는 곳은 studio-canvas-layers.js 하나다(소유자 하나).

   ── classic script ─────────────────────────────────────
   형제 파일의 최상위 함수를 **호출 시점에** 쓴다. 이 파일은
   studio-canvas-layers.js 보다 **먼저** 실려야 한다 — 그 파일의
   맨 아래 창구 등록이 최상위에서 실행되기 때문이다(그 반대 방향은
   전부 함수 안이라 순서가 강제되지 않는다).
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


/* =========================================================
   읽기 — 지금 draft 가 무엇인가
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


/* =========================================================
   선택 · 접힘 — 읽기만 한다

   ★ 선택의 원천은 studio-canvas-selection.js 이고, 접힘 집합을
     선언하는 곳은 studio-canvas-layers.js 다. 여기서는 둘 다
     **읽기만** 한다.
========================================================== */

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


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 그림 자리(슬롯) 선언 읽기

   행이 어떤 자리를 갖는지, 그 자리에 지금 무엇이 걸려 있는지.
   그 자리로 **넘어가는 일**은 studio-canvas-layers-row.js 다.
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


/* 그 자리에 지금 걸린 이미지의 식별자(없으면 "") — 트리 지문용 */
function studioCanvasLayersThumbKey(slotName) {

  const declared =
    studioCanvasLayersDeclaredSlot(slotName);

  return (declared && declared.binding) ? declared.binding.imageId : "";

}


/* 트리의 행으로 표현되지 않는 그림 자리들 — 그 목록을 그리는 곳은
   studio-canvas-layers-row.js renderStudioCanvasLayersMedia() 다. */
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

/*
  트리의 지문 — **모양**만 들어간다(선택은 빠진다).

  선택이 바뀔 때마다 DOM 을 다시 만들면 Preview 에서 요소를 고를
  때마다 Layers 의 스크롤이 처음으로 돌아간다. 선택 표시는
  studio-canvas-layers.js paintStudioCanvasLayersSelection() 이
  속성만 갈아 끼운다.
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
