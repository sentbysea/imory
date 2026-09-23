/* =========================================================
   STUDIO — LAYERS 의 끌어 옮기기 (STUDIO-LAYERS-STRUCTURE-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §2-3 · §2-4
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §32-7 · §32-8

   ── 무엇을 끄는가 ──────────────────────────────────────
   **행의 손잡이(⠿)만** 끈다. 행 전체를 끌면 좁은 화면에서 목록을
   세로로 넘기려는 손가락이 전부 끌기가 된다.

     데스크톱(mouse · pen)  손잡이를 누르면 곧바로 시작
     좁은 화면(touch)       손잡이를 **길게** 눌러야 시작

   그래서 `touch-action: none` 은 **손잡이 하나**에만 있다
   (studio-canvas-layers.css). 패널 전체에 주면 세로 스크롤이 죽는다.

   ── 무엇이 유효한 drop 인가 ────────────────────────────

     같은 부모 안의 자리        → 순서(reorder)
     `메인 비주얼` 행의 가운데  → 묶기(attach)   — overlay 만
     `페이지 장식` 묶음 제목    → 빼기(detach)   — 프레임 내부 요소만

   그 밖은 전부 **금지**로 보여 주고, 손을 놓아도 아무 일도 하지
   않는다(기록 0 칸). 서로 다른 부모의 자리를 순서 바꾸기로 처리하지
   않는 것이 이 규칙의 요점이다 — 소속이 바뀌는 길은 위 둘뿐이다.

   ── 자리 계산을 다시 적지 않는다 ───────────────────────
   묶기 · 빼기의 좌표는 `planStudioCanvasV2Attach()` ·
   `planStudioCanvasV2Detach()` 가 이미 정한다(계약 §28-4). 이 파일이
   보내는 것은 **어느 것을 어느 폴더에** 까지다.

   ── drag 중에는 draft 를 쓰지 않는다 ───────────────────
   끄는 동안 바뀌는 것은 화면의 표시뿐이다. 확정은 손을 놓을 때
   **한 번**이고, 그래서 한 번의 drop 이 Undo 한 칸이다.
========================================================== */


/*
  길게 누르기 시간.

  ★ 실측으로 정했다(2026-09-23, Playwright · 390px WebKit/Chromium).
    · 220ms 는 목록을 세로로 넘기려는 손가락에서도 자주 걸렸다.
    · 500ms 는 "끌리지 않는다"고 느낄 만큼 늦었다.
    · 350ms 는 스크롤 의도와 겹치지 않았고(그 전에 슬롭을 넘는다)
      누르고 있으면 확실히 시작됐다.
  그래서 350 이다. 그 전에 손가락이 슬롭을 넘으면 스크롤로 읽고
  타이머를 버린다.
*/
const STUDIO_CANVAS_LAYERS_LONG_PRESS_MS = 350;

/* 길게 누르기 **전에** 이만큼 움직이면 스크롤 의도다(세로로 크게
   움직이는 것이 목록 넘기기이므로 세로 기준이 더 헐겁지 않다) */
const STUDIO_CANVAS_LAYERS_TOUCH_SLOP = 8;

/*
  끄는 동안 목록 **끝에 닿으면** 저절로 넘긴다.

  ★ 띠가 좁다(16px · 한 걸음 8px). 넓게 잡으면 목록 맨 아래에 있는
    자리 — 이를테면 `페이지 장식` 묶음 제목 — 가 그 띠 안에 들어가고,
    거기에 떨구려고 다가가는 순간 목록이 스스로 넘어가 **겨누던 자리가
    손가락 밑에서 빠져나간다**(2026-09-23 실측: 28px 띠에서 빼기 drop 이
    순서 바꾸기로 떨어졌다). 한 줄 높이보다 좁게 둔다.
*/
const STUDIO_CANVAS_LAYERS_EDGE = 16;

const STUDIO_CANVAS_LAYERS_EDGE_STEP = 8;


/*
  지금 끌고 있는 것. 없으면 null 이다.

    {
      row      끌기를 시작할 때 본 행 { id, kind, type, parentId, index }
      handle   손잡이 요소(pointer capture 를 들고 있다)
      pointerId
      started  길게 누르기를 지났는가(touch) · 곧바로 true(mouse)
      timer    길게 누르기 타이머
      origin   { x, y } 누른 자리
      scroller 저절로 넘길 상자
      plan     지금 자리의 drop 계획(아래 studioCanvasLayersDropPlan)
    }

  ★ 이것은 **화면 상태**다. 저장되지 않고 Undo 에도 들어가지 않는다.
*/
let studioCanvasLayersDrag = null;


/* =========================================================
   1. 지금 pointer 자리가 무엇을 뜻하는가
========================================================== */

function studioCanvasLayersTreeEl() {

  return document.getElementById("studioCanvasLayersTree");

}


/* 그려져 있는 행들 — DOM 순서가 곧 draft 배열 순서다
   (studio-canvas-layers.js 가 그 순서로만 그린다) */
function studioCanvasLayersDrawnRows() {

  const tree =
    studioCanvasLayersTreeEl();

  if (!tree) {
    return [];
  }

  return Array.from(
    tree.querySelectorAll(".studio-canvas-layers-row")
  ).map((node) => ({
    node: node,
    id: node.dataset.layerId,
    kind: node.dataset.layerKind,
    type: node.dataset.layerType,
    parentId: node.dataset.layerParent || "",
    index: Number(node.dataset.layerIndex)
  }));

}


/*
  studioCanvasLayersDropPlan(row, x, y) -> plan | null

    plan { op, index?, frameId?, at?, side? }

      op     "reorder" | "attach" | "detach"
      at     표시를 붙일 DOM 요소
      side   "before" | "after" | "into"   (표시용)

  ★ 아무것도 돌려주지 않으면 **금지**다. 손을 놓아도 아무 일이
    일어나지 않는다.
*/
function studioCanvasLayersDropPlan(row, x, y) {

  const tree =
    studioCanvasLayersTreeEl();

  if (!tree || !row) {
    return null;
  }


  /* ── (1) 묶기 — `메인 비주얼` 행의 **가운데 띠** ──
     위/아래 끝은 그 프레임 앞뒤 자리(순서)로 남겨 둔다. */

  if (row.kind === "overlay") {

    const folders =
      Array.from(
        tree.querySelectorAll(
          '.studio-canvas-layers-row[data-layer-type="main_visual"]'
        )
      );

    for (let i = 0; i < folders.length; i += 1) {

      const rect =
        folders[i].getBoundingClientRect();

      if (
        x >= rect.left && x <= rect.right &&
        y >= rect.top + rect.height * 0.25 &&
        y <= rect.bottom - rect.height * 0.25
      ) {

        return {
          op: "attach",
          frameId: folders[i].dataset.layerId,
          at: folders[i],
          side: "into"
        };

      }

    }

  }


  /* ── (2) 빼기 — `페이지 장식` 묶음 제목 ── */

  if (row.kind === "frame-element") {

    const header =
      tree.querySelector('.studio-canvas-layers-group[data-layer-group="overlay"]');

    if (header) {

      const rect =
        header.getBoundingClientRect();

      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { op: "detach", at: header, side: "into" };
      }

    }

  }


  /* ── (3) 순서 — **같은 부모 안**에서만 ──

     ★ 자리는 "나를 뺀 형제 중 가운데가 pointer 보다 위인 것의 수"다.
       그 값이 곧 순수 함수가 받는 자리다(뺀 뒤 끼우는 자리 —
       writeSkinHomeCanvasV2ReorderNode).
  */

  const siblings =
    studioCanvasLayersDrawnRows().filter(
      (item) =>
        item.kind === row.kind &&
        item.parentId === row.parentId
    );

  if (siblings.length < 2) {
    return null;
  }

  /* pointer 가 이 묶음의 세로 범위 밖이면 그 자리는 이 부모의
     자리가 아니다 — 다른 부모의 자리를 순서로 처리하지 않는다 */
  const first =
    siblings[0].node.getBoundingClientRect();

  const last =
    siblings[siblings.length - 1].node.getBoundingClientRect();

  if (y < first.top - first.height || y > last.bottom + last.height) {
    return null;
  }

  const others =
    siblings.filter((item) => item.id !== row.id);

  let index = 0;

  others.forEach((item) => {

    const rect =
      item.node.getBoundingClientRect();

    if (y > rect.top + rect.height / 2) {
      index += 1;
    }

  });

  const anchor =
    index < others.length ? others[index] : others[others.length - 1];

  return {
    op: "reorder",
    index: index,
    at: anchor ? anchor.node : null,
    side: index < others.length ? "before" : "after"
  };

}


/* =========================================================
   2. 표시 — 유효한 자리와 금지된 자리를 가른다
========================================================== */

function paintStudioCanvasLayersDrop(plan) {

  const tree =
    studioCanvasLayersTreeEl();

  if (!tree) {
    return;
  }

  Array.from(
    tree.querySelectorAll(".is-drop-before, .is-drop-after, .is-drop-into")
  ).forEach((node) => {
    node.classList.remove("is-drop-before", "is-drop-after", "is-drop-into");
  });

  tree.dataset.drop =
    plan ? plan.op : "none";

  if (plan && plan.at) {
    plan.at.classList.add(`is-drop-${plan.side}`);
  }

}


function setStudioCanvasLayersDragging(on, id) {

  const tree =
    studioCanvasLayersTreeEl();

  if (!tree) {
    return;
  }

  tree.classList.toggle("is-dragging", !!on);

  Array.from(
    tree.querySelectorAll(".studio-canvas-layers-row")
  ).forEach((node) => {
    node.classList.toggle("is-dragged", !!on && node.dataset.layerId === id);
  });

  if (!on) {
    paintStudioCanvasLayersDrop(null);
    delete tree.dataset.drop;
  }

}


/* 목록 끝에 닿으면 저절로 넘긴다 — 끌고 있는 동안만 */
function studioCanvasLayersEdgeScroll(y) {

  const scroller =
    studioCanvasLayersDrag ? studioCanvasLayersDrag.scroller : null;

  if (!scroller) {
    return;
  }

  const rect =
    scroller.getBoundingClientRect();

  if (y < rect.top + STUDIO_CANVAS_LAYERS_EDGE) {
    scroller.scrollTop -= STUDIO_CANVAS_LAYERS_EDGE_STEP;
  } else if (y > rect.bottom - STUDIO_CANVAS_LAYERS_EDGE) {
    scroller.scrollTop += STUDIO_CANVAS_LAYERS_EDGE_STEP;
  }

}


function studioCanvasLayersScroller(node) {

  let current =
    node ? node.parentElement : null;

  while (current) {

    const style =
      window.getComputedStyle(current);

    if (
      /(auto|scroll)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }

    current = current.parentElement;

  }

  return null;

}


/* =========================================================
   3. 제스처
========================================================== */

function studioCanvasLayersDragCancel() {

  if (!studioCanvasLayersDrag) {
    return;
  }

  const drag =
    studioCanvasLayersDrag;

  studioCanvasLayersDrag =
    null;

  if (drag.timer) {
    window.clearTimeout(drag.timer);
  }

  try {
    if (drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }
  } catch (err) {
    /* 이미 놓였다 — 취소에 실패는 없다 */
  }

  setStudioCanvasLayersDragging(false, drag.row.id);

}


function studioCanvasLayersDragBegin() {

  if (!studioCanvasLayersDrag || studioCanvasLayersDrag.started) {
    return;
  }

  studioCanvasLayersDrag.started = true;

  setStudioCanvasLayersDragging(true, studioCanvasLayersDrag.row.id);

  /* 무엇을 끌고 있는지 Preview 에서도 보이게 한다. 고를 수 없는
     것(숨김 · 잠금)이면 제안이 거절되고 선택은 그대로다 — 여기서
     Layers 전용 가짜 선택을 만들지 않는다(계획 문서 §2-2). */
  if (typeof window.proposeStudioCanvasSelection === "function") {

    window.proposeStudioCanvasSelection({
      ids: [studioCanvasLayersDrag.row.id],
      primaryId: studioCanvasLayersDrag.row.id,
      mode: "replace"
    });

  }

}


function studioCanvasLayersDragStart(event, handle) {

  if (event.button !== undefined && event.button !== 0) {
    return;
  }

  const node =
    handle.closest(".studio-canvas-layers-row");

  if (!node) {
    return;
  }


  /* =====================================================
     여러 개를 골라 둔 채로는 시작하지 않는다.

     ★ **조용히 해제하지 않는다.** 고른 것을 말없이 버리면 주인은
       방금 한 선택이 사라진 이유를 알 수 없다. 거부하고 이유를
       적는다 — 여러 요소를 함께 옮기는 것은 V2-GROUP-1A 다.
  ====================================================== */
  const selection =
    (typeof window.getStudioCanvasSelection === "function")
      ? window.getStudioCanvasSelection()
      : null;

  if (selection && selection.ids.length > 1) {

    if (typeof window.setStudioCanvasLayersMessage === "function") {
      window.setStudioCanvasLayersMessage(
        "여러 요소 이동은 다음 단계에서 지원합니다 — 하나만 골라 주세요."
      );
    }

    return;

  }

  if (typeof window.setStudioCanvasLayersMessage === "function") {
    window.setStudioCanvasLayersMessage("");
  }


  const row = {
    id: node.dataset.layerId,
    kind: node.dataset.layerKind,
    type: node.dataset.layerType,
    parentId: node.dataset.layerParent || "",
    index: Number(node.dataset.layerIndex)
  };

  if (!row.id || !Number.isInteger(row.index)) {
    return;
  }

  try {
    handle.setPointerCapture(event.pointerId);
  } catch (err) {
    /* capture 를 못 받아도 끌기는 된다(move 가 문서로 온다) */
  }

  studioCanvasLayersDrag = {
    row: row,
    handle: handle,
    pointerId: event.pointerId,
    started: false,
    timer: null,
    origin: { x: event.clientX, y: event.clientY },
    scroller: studioCanvasLayersScroller(node),
    plan: null
  };

  /* 손가락은 길게 눌러야 시작한다 — 그 전의 움직임은 스크롤이다 */
  if (event.pointerType === "touch") {

    studioCanvasLayersDrag.timer =
      window.setTimeout(
        studioCanvasLayersDragBegin,
        STUDIO_CANVAS_LAYERS_LONG_PRESS_MS
      );

    return;

  }

  studioCanvasLayersDragBegin();

}


function studioCanvasLayersDragMove(event) {

  const drag =
    studioCanvasLayersDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  if (!drag.started) {

    /* 아직 길게 누르기 전이다 — 슬롭을 넘으면 스크롤 의도다 */
    const dx =
      Math.abs(event.clientX - drag.origin.x);

    const dy =
      Math.abs(event.clientY - drag.origin.y);

    if (
      dx > STUDIO_CANVAS_LAYERS_TOUCH_SLOP ||
      dy > STUDIO_CANVAS_LAYERS_TOUCH_SLOP
    ) {
      studioCanvasLayersDragCancel();
    }

    return;

  }

  /* 끌고 있는 동안에는 목록이 손가락을 따라 움직이지 않는다 */
  if (event.cancelable) {
    event.preventDefault();
  }

  studioCanvasLayersEdgeScroll(event.clientY);

  drag.plan =
    studioCanvasLayersDropPlan(drag.row, event.clientX, event.clientY);

  paintStudioCanvasLayersDrop(drag.plan);

}


function studioCanvasLayersDragDrop(event) {

  const drag =
    studioCanvasLayersDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  const started =
    drag.started;

  const row =
    drag.row;

  const plan =
    started
      ? studioCanvasLayersDropPlan(row, event.clientX, event.clientY)
      : null;

  studioCanvasLayersDragCancel();

  if (!started || !plan) {
    return;
  }

  /* 창구는 **호출 시점에** 찾는다(studio-canvas-layers-ops.js 가 이
     파일보다 나중에 로드돼도 된다). 없으면 아무것도 하지 않는다. */
  const call = (name, args) =>
    (typeof window[name] === "function")
      ? window[name].apply(null, args)
      : null;

  let result = null;

  if (plan.op === "reorder") {

    result =
      call("studioCanvasLayersReorder", [row, plan.index]);

  }
  else if (plan.op === "attach") {

    result =
      call("studioCanvasLayersAttach", [row.id, plan.frameId]);

  }
  else if (plan.op === "detach") {

    result =
      call("studioCanvasLayersDetach", [row.id]);

  }

  if (typeof window.setStudioCanvasLayersMessage === "function") {
    window.setStudioCanvasLayersMessage(
      (result && result.accepted) ? "" : ((result && result.message) || "")
    );
  }

  /* 묶은 것은 그 폴더 안에 있다 — 접혀 있으면 펼쳐 보여 준다
     (계획 문서 §2-2 · 이번 범위의 "대상 폴더는 펼쳐 보인다") */
  if (
    result && result.accepted && plan.op === "attach" &&
    typeof window.expandStudioCanvasLayersFolder === "function"
  ) {
    window.expandStudioCanvasLayersFolder(plan.frameId);
  }

}


/* =========================================================
   4. 연결 — 손잡이 하나에 pointerdown, 나머지는 문서에서 듣는다

   ★ 문서에서 듣는 이유는 pointer capture 가 없는 경우에도(브라우저
     · 합성 이벤트) move 와 up 을 놓치지 않기 위해서다. 끌고 있지
     않으면 첫 줄에서 곧바로 빠져나온다.
========================================================== */

function bindStudioCanvasLayersHandle(handle) {

  handle.addEventListener(
    "pointerdown",
    (event) => {

      /* 손잡이는 **고르지도 않는다** — 끄는 일만 한다 */
      event.stopPropagation();

      studioCanvasLayersDragStart(event, handle);

    }
  );

}


if (typeof window !== "undefined") {

  document.addEventListener("pointermove", studioCanvasLayersDragMove, { passive: false });

  document.addEventListener("pointerup", studioCanvasLayersDragDrop);

  document.addEventListener("pointercancel", studioCanvasLayersDragCancel);

  /* 창 밖으로 나가거나 다른 것이 pointer 를 가져갔다 */
  window.addEventListener("blur", studioCanvasLayersDragCancel);

  /*
    ★ **window 의 capture** 다. 그래야 Studio 의 다른 Escape 처리
      (시트 닫기 · 입력 취소)보다 먼저 온다 — 끌고 있는 중이면 그
      Escape 는 이 제스처의 것이고, 그때 시트가 함께 닫히면 끌던
      목록 자체가 사라진다. 끌고 있지 않으면 아무것도 하지 않고
      그대로 흘려보낸다.
  */
  window.addEventListener(
    "keydown",
    (event) => {

      if (event.key === "Escape" && studioCanvasLayersDrag) {

        event.stopPropagation();

        studioCanvasLayersDragCancel();

      }

    },
    true
  );

  window.bindStudioCanvasLayersHandle = bindStudioCanvasLayersHandle;
  window.studioCanvasLayersDragCancel = studioCanvasLayersDragCancel;

  window.STUDIO_CANVAS_LAYERS_LONG_PRESS_MS =
    STUDIO_CANVAS_LAYERS_LONG_PRESS_MS;

  /* 진단 · 테스트가 보는 한 줄 — production 코드는 읽지 않는다 */
  window.getStudioCanvasLayersDragState =
    () => {

      const tree =
        studioCanvasLayersTreeEl();

      return {
        dragging: !!(studioCanvasLayersDrag && studioCanvasLayersDrag.started),
        armed: !!studioCanvasLayersDrag,
        id: studioCanvasLayersDrag ? studioCanvasLayersDrag.row.id : null,
        drop: tree ? (tree.dataset.drop || "") : "",
        plan:
          (studioCanvasLayersDrag && studioCanvasLayersDrag.plan)
            ? { ...studioCanvasLayersDrag.plan, at: undefined }
            : null
      };

    };

}
