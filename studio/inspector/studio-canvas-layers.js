/* =========================================================
   STUDIO — LAYERS (STUDIO-LAYERS-SHELL-1 · STUDIO-LAYERS-STRUCTURE-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md
              §1 · §2 · §3
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §23 · §25 · §28 · §32

   왼쪽 패널의 넷째 자리다 — `Select · Images · Layers · Layout`.

   ── 이 패널이 하는 일 ──────────────────────────────────
     1) 지금 working draft 의 v2 캔버스 구조를 **읽어서** 보여 준다
     2) 행을 누르면 기존 캔버스 선택 관문으로 그 요소를 고른다
     3) 행마다 대표 사진 · 눈 · 자물쇠 · 삭제 단추를 붙인다
        (STUDIO-LAYERS-STRUCTURE-1)

   그리고 맨 위에 `＋ 재료 추가`를 둔다. 누르면 트리가 물러나고
   **요소 추가 하위 화면**이 같은 자리에 선다
   (STUDIO-LAYERS-MATERIALS-1A · 계약 §35) — 그 화면의 본문(분류 둘 ·
   카드 여덟)을 만드는 곳은 여전히
   studio/inspector/studio-canvas-add-v2.js 한 곳이다.

   ── 이 파일이 갖는 것 (STUDIO-CANVAS-LAYERS-SPLIT-1) ───
   패널이 다섯 파일이다. 여기는 **상태 하나와 그리는 순서**다.

     studio-canvas-layers-tree.js    무엇을 그릴 것인가 — draft 읽기 ·
                                     행 목록 · 그룹 폴더 끼우기 ·
                                     접힘 판정 · 트리의 지문
     studio-canvas-layers-row.js     어떻게 생겼는가 — 행 · 폴더 행 ·
                                     행의 단추 · 그룹 이름 입력 ·
                                     `스킨 이미지` 구역
     studio-canvas-layers-screen.js  한 자리를 두 화면이 — 패널 뼈대 ·
                                     `＋ 재료 추가` 하위 화면 여닫기
     studio-canvas-layers-ops.js     구조 동작 창구와 거절 문장
     studio-canvas-layers-drag.js    손잡이 제스처 · drop 판정

     이 파일                         화면 상태(접힘 · 이름 고치는 중 ·
                                     하위 화면 열림 · DOM 참조 · 지문) ·
                                     고르기 · 그리는 순서 · 창구 등록

   ★ 상태의 **소유자는 여기 하나**다. 형제 파일들은 그 이름을 함수
     안에서 읽고 쓴다(classic script 는 최상위 렉시컬 스코프를
     공유한다) — 같은 값을 한 벌 더 들지 않는다.

   ── 이 패널이 **하지 않는** 일 ─────────────────────────
     · draft 를 직접 고치지 않는다. 구조 동작은 전부
       studio-canvas-layers-ops.js 의 문 하나를 지난다.
     · 끄는 제스처도 여기 없다 — studio-canvas-layers-drag.js 다.

   ── 왜 상태를 들고 있지 않은가 ─────────────────────────
   트리는 **별도 상태 저장소가 아니다**(계획 문서 §2-1). 그릴 때마다
   studioCanvasNodeList() 로 draft 에서 다시 만든다. 행의 identity 는
   기존 Canvas id 하나이고, 그 id 는 캔버스 하나 안에서 유일하다
   (계약 §14-5).

   이 파일이 기억하는 것은 **화면 상태**뿐이다 — 접기/펼치기 · 이름을
   고치는 중인 그룹 · 하위 화면이 열려 있는가. 저장되지 않으므로
   Undo 에도 Save 에도 들어가지 않는다.

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

   ★ 형제 셋(tree · row · screen)은 이 파일보다 **먼저** 실려야 한다 —
     맨 아래 창구 등록이 그 파일들의 함수를 최상위에서 읽기 때문이다.
     반대 방향(형제가 여기 상태를 보는 것)은 전부 함수 안이라 순서가
     강제되지 않는다.
========================================================== */


/* =========================================================
   화면 상태 — **선언하는 곳은 여기 하나다**

   형제 파일(tree · row · screen)이 이 이름들을 함수 안에서 읽고
   쓴다. 값을 복제하지 않는다.
========================================================== */

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

/* 이름을 고치고 있는 그룹 — { id, start } | null
   (HOME-CANVAS-GROUP-1A · 계약 §38-6. 입력 칸을 그리는 곳은
   studio-canvas-layers-row.js 이고, 여는 창구는 이 파일 아래의
   startStudioCanvasLayersRename 이다.) */
let studioCanvasLayersRenaming = null;


/* =========================================================
   접기 · 상태 줄
========================================================== */

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
   고르기 — 기존 관문 하나로

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
   선택 표시 — 속성만 갈아 끼운다

   ★ 다시 만들지 않는다. 선택이 바뀔 때마다 DOM 을 새로 만들면
     Preview 에서 요소를 고를 때마다 Layers 의 스크롤이 처음으로
     돌아간다(트리의 지문은 studio-canvas-layers-tree.js).
========================================================== */

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


/* =========================================================
   트리 그리는 순서
========================================================== */

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
   셸이 부르는 두 창구
========================================================== */

function openStudioCanvasLayersPanel() {

  ensureStudioCanvasLayers();

  renderStudioCanvasLayers(true);

}


/* =========================================================
   연결

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
