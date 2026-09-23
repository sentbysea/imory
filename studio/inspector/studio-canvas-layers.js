/* =========================================================
   STUDIO — LAYERS (STUDIO-LAYERS-SHELL-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md
              §1 · §2 · §3 · §7
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §23 · §25 · §28

   왼쪽 패널의 넷째 자리다 — `Select · Images · Layers · Layout`.

   ── 이 파일이 하는 일은 둘뿐이다 ───────────────────────
     1) 지금 working draft 의 v2 캔버스 구조를 **읽어서** 보여 준다
     2) 행을 누르면 기존 캔버스 선택 관문으로 그 요소를 고른다

   그리고 맨 위에 재료 추가 자리를 붙인다 — 그 화면을 만드는 곳은
   여전히 studio/inspector/studio-canvas-add-v2.js 한 곳이다.

   ── 이 파일이 **하지 않는** 일 (계획 문서 §7 "이번에 하지 않는다")
     순서 drag · 묶기/빼기 drop · primary 변경 · 숨김 · 잠금 ·
     삭제 · 그룹 조작 · 타이포그래피 · rich text.
     ★ 그래서 이 파일에는 draft 를 쓰는 코드가 한 줄도 없다.

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


/* 트리의 두 묶음 — 계획 문서 §2-1 의 그 표 */
const STUDIO_CANVAS_LAYER_GROUPS = [
  { key: "flow", label: "자동 배치" },
  { key: "overlay", label: "페이지 장식" }
];


let studioCanvasLayersRoot = null;

let studioCanvasLayersTree = null;

let studioCanvasLayersEmpty = null;

let studioCanvasLayersAddToggle = null;

let studioCanvasLayersAddHost = null;


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

  /* 각 main_visual 의 대표 사진 — 블록 노드에서 읽는다(계약 §28-1).
     ★ 읽기만 한다. 바꾸는 것은 이번 단계가 아니다(계획 문서 §2-5). */
  const primaryOf =
    {};

  nodes.forEach((node) => {

    if (node.kind !== "block" || node.type !== "main_visual") {
      return;
    }

    const info =
      (typeof window.studioCanvasNodeInfo === "function")
        ? window.studioCanvasNodeInfo(node.id)
        : null;

    const props =
      (info && info.node && typeof info.node.props === "object" && info.node.props)
        ? info.node.props
        : null;

    primaryOf[node.id] =
      (props && typeof props.primaryId === "string") ? props.primaryId : "";

  });

  return nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    type: node.type,
    parentId: node.parentId || null,
    depth: node.kind === "frame-element" ? 1 : 0,
    group: node.kind === "overlay" ? "overlay" : "flow",
    primary:
      node.kind === "frame-element" &&
      !!node.parentId &&
      primaryOf[node.parentId] === node.id
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

function studioCanvasLayersRowNode(row, expanded) {

  const wrap =
    studioCanvasLayersEl("div", "studio-canvas-layers-row");

  wrap.dataset.layerId = row.id;
  wrap.dataset.layerKind = row.kind;
  wrap.dataset.layerType = row.type;

  if (row.depth) {
    wrap.dataset.layerDepth = String(row.depth);
  }

  wrap.setAttribute("role", "treeitem");


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


  const pick =
    studioCanvasLayersEl("button", "studio-canvas-layers-pick");

  pick.type = "button";
  pick.id = `studioCanvasLayer-${row.id}`;

  /* ★ 대표 사진 표식은 **읽기 전용**이다(계획 문서 §2-5) */
  if (row.primary) {

    pick.appendChild(
      studioCanvasLayersEl("span", "studio-canvas-layers-star", "★")
    );

  }

  pick.appendChild(
    studioCanvasLayersEl(
      "span",
      "studio-canvas-layers-name",
      studioCanvasLayerLabel(row.type)
    )
  );

  pick.title =
    `${studioCanvasLayerLabel(row.type)} · ${row.id}`;

  pick.addEventListener("click", (event) => {

    /* Ctrl/⌘ 는 **더하기/빼기**다(계획 문서 §2-2). 그 판정도 여기서
       하지 않는다 — mode 만 넘기고 합치는 것은 선택 관문이 한다. */
    selectStudioCanvasLayer(row.id, event.ctrlKey || event.metaKey);

  });

  wrap.appendChild(pick);

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
      `${row.id}:${row.kind}:${row.type}:${row.parentId || ""}` +
      `:${row.primary ? "p" : ""}` +
      `:${(row.kind === "block" && row.type === "main_visual" && !studioCanvasLayersExpanded(row.id)) ? "c" : ""}`
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


  const rows =
    studioCanvasLayersRows();

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

    if (!mine.length) {
      return;
    }

    const title =
      studioCanvasLayersEl("p", "studio-canvas-layers-group", group.label);

    title.id =
      `studioCanvasLayersGroup-${group.key}`;

    studioCanvasLayersTree.appendChild(title);

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
          primary: row.primary,
          expanded:
            (row.kind === "block" && row.type === "main_visual")
              ? studioCanvasLayersExpanded(row.id)
              : null
        })),

        /* 실제로 화면에 그려진 행들(접힌 프레임의 자식은 빠진다) */
        drawn:
          studioCanvasLayersTree
            ? Array.from(
                studioCanvasLayersTree.querySelectorAll(".studio-canvas-layers-row")
              ).map((node) => node.dataset.layerId)
            : [],

        selectedIds: selection.ids.slice(),
        primaryId: selection.primaryId,

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
