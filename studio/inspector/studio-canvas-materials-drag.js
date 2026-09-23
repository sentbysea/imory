/* =========================================================
   STUDIO — 재료를 Preview 로 **끌어다 놓기**
   (STUDIO-LAYERS-MATERIALS-1B · 1C)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §36-5 · §36-6 ·
              §37
   로드맵:    docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §3

   ── 무엇을 끄는가 ──────────────────────────────────────
   **재료 카드의 손잡이(⠿)**뿐이다(`.studio-material-item-handle`).
   분류 카드는 끌 수 없다 — 그것은 "무엇을 만들지"가 아직 정해지지
   않은 자리이고, 끌어다 놓는 순간에는 만들 것이 하나로 정해져 있어야
   한다.

     데스크톱(mouse · pen)  손잡이를 누르고 움직이면 시작(슬롭 4px)
     좁은 화면(touch)       손잡이를 **길게** 눌러야 시작(350ms)

   ★ **1C — 손잡이가 카드 본문과 갈라졌다.** 1B 에서는 카드 단추
     자체가 끌기의 시작점이었고, 그래서 `touch-action: none` 이 카드
     전체에 있었다 — 손가락이 카드 위에서 위아래로 쓸면 브라우저가
     스크롤을 내주지 않아 좁은 화면에서 목록을 넘길 수 없었다
     (계약 §36-9 의 그 남은 차이). 이제 규칙은 Layers 의 그것과 같다.

       카드 본문   touch-action: pan-y   → 세로 스크롤은 브라우저 것
       손잡이      touch-action: none    → 여기서만 끌기가 시작한다

     손잡이는 카드 **단추 바깥**에 있다(같은 칸 안의 형제). 안에 두면
     손잡이를 눌렀다 뗀 click 이 카드로 올라가 "그냥 눌렀다"가 되어
     재료가 하나 만들어진다 — 끌 생각만 했는데 생긴다.

   그 350ms 는 Layers 의 끌기가 실측으로 정한 그 값이다
   (studio/inspector/studio-canvas-layers-drag.js) — 여기서 다시
   재지 않고 그 상수를 그대로 쓴다. 두 끌기가 다른 시간을 쓰면
   같은 패널 안에서 손가락이 다르게 반응한다.

   ── 왜 pointer capture 인가 ────────────────────────────

   Preview 는 iframe 이다(sandbox 에서는 iframe 안의 iframe). 그
   위를 지나는 포인터 이벤트는 보통 그 문서로 가고 부모는 아무것도
   받지 못한다. `setPointerCapture()` 를 걸면 손을 뗄 때까지 모든
   pointermove/up 이 **부모의 그 요소**로 온다 — 그래서 프레임 안에
   끌기 코드를 넣지 않아도 되고, sandbox 경계를 넘는 새 제스처
   메시지도 필요 없다.

   그 대신 "지금 가리키는 곳이 캔버스의 어디인가"를 부모가 알아야
   한다. 그 값은 저장값에서 나오지 않으므로(계약 §36-5) 끌기를
   시작할 때 **한 번** 물어 둔다 — `preview:canvas-probe`. 끌고
   있는 동안 프레임은 스크롤되지도 다시 그려지지도 않는다(포인터가
   여기 붙들려 있다).

   ── 자를 다시 만들지 않는다 ────────────────────────────

     Studio 화면 ↔ Preview 문서   studio-inspector-overlay.js
                                  (studioInspectorFrameGeometry ·
                                   studioInspectorMapRectRaw)
     Preview 문서 ↔ Canvas 좌표   studio-canvas-v2-space.js
                                  (studioCanvasPointToCanvas ·
                                   …ToFrame · …FlowInsertIndex)

   이 파일은 그 둘을 이어 붙이기만 한다.

   ── 놓기 전에는 아무것도 쓰지 않는다 ───────────────────

   끄는 동안 바뀌는 것은 화면의 표시뿐이다 — 그림자 하나와 윤곽
   하나. 확정은 손을 놓을 때 **한 번**이고, 그래서 한 번의 drop 이
   Undo 한 칸이다. 취소 · 금지 자리에 놓기는 기록 0 칸이다.

   ★ classic script 다.
========================================================== */


/* 끌기로 볼 만큼 움직였는가(데스크톱) */
const STUDIO_MATERIAL_DRAG_SLOP = 4;


/*
  길게 누르기 — Layers 의 그 값 하나다.

  ★ 그 파일이 먼저 로드되면 최상위 const 를 그대로 읽는다. 로드
    순서가 어긋난 문서에서도 숫자가 사라지지 않게 기본값을 둔다.
*/
function studioMaterialDragLongPressMs() {

  return (typeof STUDIO_CANVAS_LAYERS_LONG_PRESS_MS === "number")
    ? STUDIO_CANVAS_LAYERS_LONG_PRESS_MS
    : 350;

}


/*
  지금 끌고 있는 것. 없으면 null 이다.

    itemId     재료 카탈로그의 id — **이것 하나**가 만들 것을 정한다
    handle     눌린 손잡이(pointer capture 를 들고 있다)
    pointerId
    started    길게 누르기를 지났는가(touch) · 슬롭을 넘었는가(mouse)
    timer      길게 누르기 타이머
    origin     { x, y } 누른 자리
    plan       지금 자리의 drop 계획(아래 studioMaterialDropPlan)

  ★ 이것은 **화면 상태**다. 저장되지 않고 Undo 에도 들어가지 않는다.
*/
let studioMaterialDrag = null;


/*
  끌기가 끝난 뒤 **한 번** 오는 click 을 먹는다.

  ★ 이것이 없으면 끌기 하나가 재료를 **둘** 만든다. pointer capture
    를 걸어 둔 단추는 손을 어디에서 놓든 그 뒤에 click 을 받는다
    (mousedown/mouseup 이 같은 요소에 갇혀 있으므로). 그 click 은
    "그냥 눌렀다"와 구별되지 않아 기본 자리에 하나를 더 만든다.

    2026-09-23 실측: 금지 자리에 놓았는데 도화지 한가운데에 도형이
    생겼다 — drop 은 거절됐지만 뒤따라온 click 이 만든 것이었다.

  ★ 끌기가 **시작된** 경우에만 세운다. 시작하지 않은 누르기는 그냥
    누르기이고, 그 click 은 그대로 흘러야 한다(계약 §36-4).

  ★ **그 손잡이의, 곧바로 오는** click 하나만 먹는다. 브라우저가
    click 을 아예 보내지 않는 경우도 있어서(손을 멀리서 놓으면
    엔진마다 다르다) 조건 없이 세워 두면 그 표식이 살아남아
    **다음에 누르는 엉뚱한 단추**를 먹는다.

    2026-09-23 실측: 금지 자리 drop 뒤에 `＋ 재료 추가` 가 한 번
    안 열렸다 — 그 표식이 토글의 click 을 먹은 것이었다.

  ★ 1C — 손잡이가 카드 단추 **바깥**으로 나온 뒤에도 이 표식은
    남긴다. 손잡이는 이제 click 으로 아무것도 하지 않지만, 엔진에
    따라 capture 뒤의 click 이 손잡이가 아니라 **공통 조상**으로
    가기도 한다(`.studio-material-cell`). 그 조상이 카드를 품고
    있으므로, 그 한 번을 여기서 세워 두고 확실히 막는다.
*/
let studioMaterialEatClick = null;

/* 그 표식이 살아 있는 시간 — 같은 제스처의 click 은 이 안에 온다 */
const STUDIO_MATERIAL_CLICK_GRACE_MS = 600;


/* 표식 하나 — 먹을 범위는 **그 재료의 칸**이다(위 ★). 칸을 찾지
   못하면 손잡이 자신으로 좁힌다. */
function studioMaterialClickMark(handle) {

  const scope =
    (handle && typeof handle.closest === "function")
      ? (handle.closest(".studio-material-cell") || handle)
      : handle;

  return { scope: scope, at: Date.now() };

}


/* 따라다니는 그림자와 윤곽 — 전부 `pointer-events:none` 이다
   (끌고 있는 손이 자기 그림자를 잡으면 안 된다).

   `studioMaterialScope` 는 **대상 프레임 강조**다(§36-6) — 요소가
   놓일 윤곽과 따로 그린다. 둘을 한 상자로 합치면 "어느 프레임
   안인가"와 "그 안 어디인가"를 한꺼번에 보여 줄 수 없다. */
let studioMaterialGhost = null;
let studioMaterialHint = null;
let studioMaterialScope = null;


/* =========================================================
   1. 그 재료가 이 자리에 놓이는가 (계약 §36-5)

   ★ 가까운 프레임이나 자리를 **임의로 고르지 않는다**. 프레임 안은
     실제로 그 프레임 위에 놓았을 때만이고(§28-2 의 "소속은 언제나
     명시적이다"), 도화지 밖은 어느 자리도 아니다.
========================================================== */

const STUDIO_MATERIAL_DROP_REASON = {
  outside: "도화지 밖입니다",
  added: "이미 있습니다",
  unknown: "놓을 자리를 찾지 못했습니다",
  type: "이 자리에는 넣을 수 없습니다",
  measure: "화면 자리를 아직 재지 못했습니다"
};


/* 그 자리가 이 종류를 받는가 — 표는 관문이 갖는다 */
function studioMaterialTargetAccepts(target, type) {

  if (typeof window.studioCanvasV2AddTypes !== "function") {
    return false;
  }

  const types =
    window.studioCanvasV2AddTypes(target);

  return Array.isArray(types) && types.indexOf(type) !== -1;

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1C — **흐름 띠** (계약 §37-2)

   `text` 처럼 흐름과 자유 층을 **둘 다** 받는 재료는 "놓은 자리"가
   둘 중 하나를 골라야 한다. 1B 까지는 자유 층이 도화지 안 전부를
   가져가서 흐름에는 영영 닿지 못했다.

   띠는 **도화지 위 끝부터 마지막 블록의 아래 끝까지**다(가로는
   도화지 폭 전체). 그 아래는 블록이 하나도 없는 빈 자리이고, 거기
   놓은 것은 자유 장식이다.

     흐름 띠 위   →  흐름의 삽입선
     그 아래      →  자유 층 · 놓은 그 자리

   ★ 띠를 **재는 값**으로 만든다(블록 상자의 합). 저장값의 padding ·
     gap 으로 계산하면 정렬 · 숨김 · 데스크톱 최대 폭에서 화면과
     어긋난다(§30-3 과 같은 사정).

   ★ 블록이 하나도 없으면 띠의 높이가 0 이라 겨눌 수 없다. 그때도
     흐름에 닿을 수 있게 도화지 위 끝에 **최소 높이**를 준다.

   ★ **흐름만 받는 재료에는 이 띠를 묻지 않는다.** 구분선을 도화지
     아래쪽에 놓아도 삽입선이어야 한다(§36-5 의 그 표 그대로).
========================================================== */
const STUDIO_MATERIAL_FLOW_BAND_MIN = 24;


function studioMaterialFlowBand() {

  const boxes =
    (typeof window.studioCanvasBoxesSnapshot === "function")
      ? window.studioCanvasBoxesSnapshot()
      : null;

  const root =
    (boxes && boxes.root) ? boxes.root : null;

  if (!root || !(root.height > 0)) {
    return null;
  }

  const blocks =
    boxes.blocks || {};

  let bottom =
    root.top;

  Object.keys(blocks).forEach((id) => {

    const rect =
      blocks[id];

    if (!rect) {
      return;
    }

    const edge =
      rect.top + rect.height;

    if (edge > bottom) {
      bottom = edge;
    }

  });

  return {
    top: root.top,
    bottom:
      Math.min(
        root.top + root.height,
        Math.max(bottom, root.top + STUDIO_MATERIAL_FLOW_BAND_MIN)
      )
  };

}


function studioMaterialInFlowBand(previewY) {

  const band =
    studioMaterialFlowBand();

  return !!band && previewY >= band.top && previewY <= band.bottom;

}


/* 포인터가 올라가 있는 `main_visual` — 없으면 null */
function studioMaterialFrameAt(previewX, previewY) {

  const boxes =
    (typeof window.studioCanvasBoxesSnapshot === "function")
      ? window.studioCanvasBoxesSnapshot()
      : null;

  if (!boxes || !boxes.frames) {
    return null;
  }

  const ids =
    Object.keys(boxes.frames);

  for (let i = 0; i < ids.length; i += 1) {

    const rect =
      boxes.frames[ids[i]];

    if (
      previewX >= rect.left &&
      previewX <= rect.left + rect.width &&
      previewY >= rect.top &&
      previewY <= rect.top + rect.height
    ) {
      return { id: ids[i], rect: rect };
    }

  }

  return null;

}


/*
  studioMaterialDropPlan(itemId, previewX, previewY)

    -> { ok:true,  target, frameId, at, index, rect }
    -> { ok:false, reason }

  `rect` 는 **Preview 문서 좌표**의 윤곽이다(화면에 그릴 자리).
  그리는 것은 아래 §3 이 하고, 여기서는 자리만 정한다.
*/
function studioMaterialDropPlan(itemId, previewX, previewY) {

  const preset =
    (typeof window.resolveSkinHomeCanvasMaterialPreset === "function")
      ? window.resolveSkinHomeCanvasMaterialPreset(itemId)
      : null;

  if (!preset) {
    return { ok: false, reason: "unknown" };
  }

  /* 홈 구성처럼 하나뿐인 재료가 이미 있으면 끌어도 만들지 않는다
     (§36-6 — 중복 생성 금지. 고르는 것은 **누르기**의 몫이다) */
  const item =
    (typeof window.findSkinHomeCanvasMaterial === "function")
      ? window.findSkinHomeCanvasMaterial(itemId)
      : null;

  const state =
    (item && typeof window.studioCanvasMaterialItemState === "function")
      ? window.studioCanvasMaterialItemState(item)
      : null;

  if (state && state.state === "added") {
    return { ok: false, reason: "added" };
  }

  const canvas =
    (typeof window.studioCanvasPointToCanvas === "function")
      ? window.studioCanvasPointToCanvas(previewX, previewY)
      : null;

  if (!canvas) {
    return { ok: false, reason: "measure" };
  }

  if (!canvas.inside) {
    return { ok: false, reason: "outside" };
  }

  /* ── 프레임 안 — 실제로 그 위에 놓았을 때만 ── */

  if (preset.targets.indexOf("frame") !== -1) {

    const frame =
      studioMaterialFrameAt(previewX, previewY);

    if (frame && studioMaterialTargetAccepts("frame", preset.type)) {

      const at =
        (typeof window.studioCanvasPointToFrame === "function")
          ? window.studioCanvasPointToFrame(frame.id, previewX, previewY)
          : null;

      if (at) {

        return {
          ok: true,
          target: "frame",
          frameId: frame.id,
          at: { x: at.x, y: at.y },
          index: null,
          rect: studioMaterialOutlineRect(preset, frame.rect, previewX, previewY, frame.id),
          frameRect: frame.rect
        };

      }

    }

  }

  /* ── 흐름 — 유효한 삽입선 ──

     STUDIO-LAYERS-MATERIALS-1C — 자유 층을 **함께** 받는 재료는
     흐름 띠 위에서만 흐름이다(위 §). 흐름만 받는 재료는 도화지 안
     어디서나 흐름이고, 그것이 §36-5 의 그 표다. */

  if (
    preset.targets.indexOf("flow") !== -1 &&
    studioMaterialTargetAccepts("flow", preset.type) &&
    (preset.targets.indexOf("overlay") === -1 || studioMaterialInFlowBand(previewY))
  ) {

    const insert =
      (typeof window.studioCanvasFlowInsertIndex === "function")
        ? window.studioCanvasFlowInsertIndex(previewY)
        : null;

    if (insert) {

      const root =
        window.studioCanvasBoxesSnapshot().root;

      return {
        ok: true,
        target: "flow",
        frameId: "",
        at: null,
        index: insert.index,
        line: (insert.line === null) ? (root ? root.top : null) : insert.line,
        rect: null
      };

    }

  }

  /* ── 자유 층 — 놓은 그 자리 ── */

  if (
    preset.targets.indexOf("overlay") !== -1 &&
    studioMaterialTargetAccepts("overlay", preset.type)
  ) {

    const boxes =
      window.studioCanvasBoxesSnapshot();

    return {
      ok: true,
      target: "overlay",
      frameId: "",
      at: { x: canvas.x, y: canvas.y },
      index: null,
      rect: studioMaterialOutlineRect(preset, boxes.root, previewX, previewY, null)
    };

  }

  return { ok: false, reason: "type" };

}


/*
  놓이면 그려질 상자 — **Preview 문서 좌표**.

  크기는 프리셋이 적은 것이고, 적지 않았으면 계약의 기본값 표다
  (skin/skin-home-canvas-write-v2.js 의 그 두 표를 그대로 읽는다 —
  여기서 숫자를 한 벌 더 적지 않는다).

  ★ `height:"auto"` 는 실제 높이를 모른다 — 윤곽을 지어내지 않고
    한 줄 높이만큼만 그린다. 그려질 높이는 스킨 조판이 정한다.
*/
function studioMaterialPresetSize(preset) {

  const defaults =
    (typeof SKIN_HOME_CANVAS_V2_OVERLAY_DEFAULTS === "object" &&
      SKIN_HOME_CANVAS_V2_OVERLAY_DEFAULTS)
      ? SKIN_HOME_CANVAS_V2_OVERLAY_DEFAULTS[preset.type]
      : null;

  const size =
    preset.size || {};

  const width =
    (size.width !== undefined)
      ? size.width
      : (defaults ? defaults.width : 120);

  const height =
    (size.height !== undefined)
      ? size.height
      : (defaults ? defaults.height : 120);

  return {
    width: (typeof width === "number") ? width : 120,
    height: (typeof height === "number") ? height : 24
  };

}


function studioMaterialOutlineRect(preset, scopeRect, previewX, previewY, frameId) {

  if (!scopeRect || !(scopeRect.width > 0)) {
    return null;
  }

  const payload =
    (typeof window.studioCanvasDraftPayload === "function")
      ? window.studioCanvasDraftPayload()
      : null;

  if (!payload) {
    return null;
  }

  /* 그 자의 기준 폭 — 도화지이거나(자유 층) 프레임 안이다(§24-3) */
  let base =
    payload.baseWidth;

  let scale =
    1;

  if (frameId) {

    const info =
      (typeof window.studioCanvasNodeInfo === "function")
        ? window.studioCanvasNodeInfo(frameId)
        : null;

    const props =
      (info && info.node && info.node.props) ? info.node.props : null;

    if (!props || !(props.baseWidth > 0)) {
      return null;
    }

    base = props.baseWidth;

    /* 프레임 안의 기본 크기는 프레임 자로 줄어든다(§28-2 의 `k`) */
    scale =
      Math.min(1, base / (payload.baseWidth || base));

  }

  const size =
    studioMaterialPresetSize(preset);

  const px =
    scopeRect.width / base;

  const width =
    Math.max(2, size.width * scale * px);

  const height =
    Math.max(2, size.height * scale * px);

  return {
    left: previewX - width / 2,
    top: previewY - height / 2,
    width: width,
    height: height
  };

}


/* =========================================================
   2. 화면 좌표 ↔ Preview 문서 좌표

   ★ 정방향(Preview → Studio)은 Inspector 가 이미 갖고 있다. 여기
     있는 것은 그 **역**뿐이고, 같은 값 셋(상자 · 배율 · 테두리)을
     그 함수에서 받아 쓴다 — 배율을 다시 재지 않는다.
========================================================== */
function studioMaterialPointToPreview(clientX, clientY) {

  if (typeof studioInspectorFrameGeometry !== "function") {
    return null;
  }

  const geometry =
    studioInspectorFrameGeometry();

  if (!geometry || !geometry.box || !(geometry.scale > 0)) {
    return null;
  }

  return {
    x: (clientX - geometry.box.left) / geometry.scale - geometry.borderLeft,
    y: (clientY - geometry.box.top) / geometry.scale - geometry.borderTop
  };

}


/* =========================================================
   3. 끌고 있는 동안의 표시 (계약 §36-6)
========================================================== */

function studioMaterialEnsureGhost() {

  if (studioMaterialGhost && studioMaterialGhost.isConnected) {
    return studioMaterialGhost;
  }

  studioMaterialGhost =
    document.createElement("div");

  studioMaterialGhost.className = "studio-material-ghost";
  studioMaterialGhost.id = "studioMaterialGhost";
  studioMaterialGhost.setAttribute("aria-hidden", "true");

  document.body.appendChild(studioMaterialGhost);

  return studioMaterialGhost;

}


function studioMaterialEnsureHint() {

  if (studioMaterialHint && studioMaterialHint.isConnected) {
    return studioMaterialHint;
  }

  studioMaterialHint =
    document.createElement("div");

  studioMaterialHint.className = "studio-material-hint";
  studioMaterialHint.id = "studioMaterialHint";
  studioMaterialHint.setAttribute("aria-hidden", "true");

  document.body.appendChild(studioMaterialHint);

  return studioMaterialHint;

}


function studioMaterialEnsureScope() {

  if (studioMaterialScope && studioMaterialScope.isConnected) {
    return studioMaterialScope;
  }

  studioMaterialScope =
    document.createElement("div");

  studioMaterialScope.className = "studio-material-scope";
  studioMaterialScope.id = "studioMaterialScope";
  studioMaterialScope.setAttribute("aria-hidden", "true");

  document.body.appendChild(studioMaterialScope);

  return studioMaterialScope;

}


function studioMaterialClearVisuals() {

  [studioMaterialGhost, studioMaterialHint, studioMaterialScope].forEach((node) => {

    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }

  });

  studioMaterialGhost = null;
  studioMaterialHint = null;
  studioMaterialScope = null;

  document.body.classList.remove("studio-material-dragging");

}


function paintStudioMaterialGhost(clientX, clientY, plan) {

  const ghost =
    studioMaterialEnsureGhost();

  ghost.style.setProperty("left", `${clientX}px`);
  ghost.style.setProperty("top", `${clientY}px`);

  ghost.dataset.dropOk =
    plan && plan.ok ? "1" : "0";

  const reason =
    (plan && !plan.ok)
      ? (Object.prototype.hasOwnProperty.call(STUDIO_MATERIAL_DROP_REASON, plan.reason)
          ? STUDIO_MATERIAL_DROP_REASON[plan.reason]
          : STUDIO_MATERIAL_DROP_REASON.unknown)
      : "";

  const note =
    ghost.querySelector(".studio-material-ghost-note");

  if (note) {
    note.textContent = reason;
    note.hidden = !reason;
  }

}


/*
  놓일 자리의 윤곽.

    overlay · frame 안   요소가 놓일 상자
    frame(대상 강조)     그 프레임 전체
    flow                 삽입선 한 줄
*/
/* 대상 프레임 강조 — `main_visual` 안에 놓을 때만 (§36-6) */
function paintStudioMaterialScope(plan) {

  const scope =
    studioMaterialEnsureScope();

  if (!plan || !plan.ok || plan.target !== "frame" || !plan.frameRect) {
    scope.hidden = true;
    return;
  }

  const mapped =
    studioInspectorMapRectRaw(plan.frameRect);

  if (!mapped) {
    scope.hidden = true;
    return;
  }

  scope.hidden = false;

  scope.style.setProperty("left", `${mapped.left}px`);
  scope.style.setProperty("top", `${mapped.top}px`);
  scope.style.setProperty("width", `${mapped.right - mapped.left}px`);
  scope.style.setProperty("height", `${mapped.bottom - mapped.top}px`);

}


function paintStudioMaterialHint(plan) {

  paintStudioMaterialScope(plan);

  const hint =
    studioMaterialEnsureHint();

  if (!plan || !plan.ok) {
    hint.hidden = true;
    return;
  }

  if (plan.target === "flow") {

    const boxes =
      window.studioCanvasBoxesSnapshot();

    const root =
      boxes ? boxes.root : null;

    if (!root || plan.line === null || plan.line === undefined) {
      hint.hidden = true;
      return;
    }

    const mapped =
      studioInspectorMapRectRaw({
        left: root.left,
        top: plan.line,
        width: root.width,
        height: 0
      });

    if (!mapped) {
      hint.hidden = true;
      return;
    }

    hint.dataset.hintKind = "flow";
    hint.hidden = false;

    hint.style.setProperty("left", `${mapped.left}px`);
    hint.style.setProperty("top", `${mapped.top}px`);
    hint.style.setProperty("width", `${mapped.right - mapped.left}px`);
    hint.style.setProperty("height", "0px");

    return;

  }

  const rect =
    plan.rect;

  if (!rect) {
    hint.hidden = true;
    return;
  }

  const mapped =
    studioInspectorMapRectRaw(rect);

  if (!mapped) {
    hint.hidden = true;
    return;
  }

  hint.dataset.hintKind =
    (plan.target === "frame") ? "frame" : "overlay";

  hint.hidden = false;

  hint.style.setProperty("left", `${mapped.left}px`);
  hint.style.setProperty("top", `${mapped.top}px`);
  hint.style.setProperty("width", `${mapped.right - mapped.left}px`);
  hint.style.setProperty("height", `${mapped.bottom - mapped.top}px`);

}


/* =========================================================
   4. 제스처
========================================================== */

/*
  이 pointerdown 이 끌기의 시작점인가 — **손잡이 위**여야 한다.

  ★ 카드 본문은 여기서 null 로 끝난다. 그래야 카드 위의 손가락이
    목록을 세로로 넘길 수 있고(§37-3), 길게 눌러도 끌기가 시작되지
    않는다.

  ★ `준비 중` 재료는 손잡이가 아예 그려지지 않지만(add-v2), 합성
    이벤트 · 낡은 화면에서 새어 들어올 수 있으므로 짝이 되는 카드
    단추가 눌리는 상태인지 한 번 더 본다(클릭 경로의 그 방식과 같다).
*/
function studioMaterialDragTarget(node) {

  if (!node || typeof node.closest !== "function") {
    return null;
  }

  const handle =
    node.closest(".studio-material-item-handle");

  if (!handle || !handle.dataset.materialId || handle.hidden) {
    return null;
  }

  const cell =
    handle.closest(".studio-material-cell");

  const button =
    cell ? cell.querySelector(".studio-material-item") : null;

  if (!button || button.disabled) {
    return null;
  }

  return handle;

}


function beginStudioMaterialDrag() {

  if (!studioMaterialDrag || studioMaterialDrag.started) {
    return;
  }

  studioMaterialDrag.started = true;

  if (studioMaterialDrag.timer) {
    window.clearTimeout(studioMaterialDrag.timer);
    studioMaterialDrag.timer = null;
  }

  document.body.classList.add("studio-material-dragging");

  const ghost =
    studioMaterialEnsureGhost();

  ghost.textContent = "";

  /* 썸네일은 목록이 쓰는 그 함수 하나다 — 생김새가 갈라지지 않게 */
  const item =
    (typeof window.findSkinHomeCanvasMaterial === "function")
      ? window.findSkinHomeCanvasMaterial(studioMaterialDrag.itemId)
      : null;

  if (item && typeof window.studioCanvasMaterialThumb === "function") {
    ghost.appendChild(window.studioCanvasMaterialThumb(item));
  }

  const name =
    document.createElement("span");

  name.className = "studio-material-ghost-name";
  name.textContent = item ? item.label : "";

  ghost.appendChild(name);

  const note =
    document.createElement("span");

  note.className = "studio-material-ghost-note";
  note.hidden = true;

  ghost.appendChild(note);

}


function moveStudioMaterialDrag(event) {

  if (!studioMaterialDrag || !studioMaterialDrag.started) {
    return;
  }

  const point =
    studioMaterialPointToPreview(event.clientX, event.clientY);

  studioMaterialDrag.plan =
    point
      ? studioMaterialDropPlan(studioMaterialDrag.itemId, point.x, point.y)
      : { ok: false, reason: "measure" };

  paintStudioMaterialGhost(event.clientX, event.clientY, studioMaterialDrag.plan);

  paintStudioMaterialHint(studioMaterialDrag.plan);

}


/*
  손을 놓았다.

  ★ 확정은 여기 **한 번**이고, 그것이 Undo 한 칸이다. 금지 자리에
    놓았으면 draft 에 닿지 않는다(기록 0 칸).
*/
function finishStudioMaterialDrag() {

  const drag =
    studioMaterialDrag;

  studioMaterialDrag = null;

  studioMaterialClearVisuals();

  if (!drag || !drag.started) {
    return;
  }

  /* 위 ★ — 그 단추의, 곧바로 오는 click 하나를 먹는다 */
  studioMaterialEatClick = studioMaterialClickMark(drag.handle);

  const plan =
    drag.plan;

  if (!plan || !plan.ok) {

    if (plan && typeof window.setStudioCanvasV2AddMessage === "function") {

      window.setStudioCanvasV2AddMessage(
        Object.prototype.hasOwnProperty.call(STUDIO_MATERIAL_DROP_REASON, plan.reason)
          ? `${STUDIO_MATERIAL_DROP_REASON[plan.reason]} — 만들지 않았습니다.`
          : "그 자리에는 놓을 수 없습니다.",
        false
      );

    }

    return;

  }

  const item =
    (typeof window.findSkinHomeCanvasMaterial === "function")
      ? window.findSkinHomeCanvasMaterial(drag.itemId)
      : null;

  if (typeof window.addStudioCanvasV2Material !== "function") {
    return;
  }

  const preset =
    window.resolveSkinHomeCanvasMaterialPreset(drag.itemId);

  window.addStudioCanvasV2Material(
    plan.target,
    preset ? preset.type : "",
    {
      materialId: drag.itemId,
      label: item ? item.label : "",
      at: plan.at,
      index: plan.index,
      frameId: plan.frameId
    }
  );

}


function cancelStudioMaterialDrag() {

  if (!studioMaterialDrag) {
    return;
  }

  if (studioMaterialDrag.timer) {
    window.clearTimeout(studioMaterialDrag.timer);
  }

  if (studioMaterialDrag.started) {
    studioMaterialEatClick = studioMaterialClickMark(studioMaterialDrag.handle);
  }

  releaseStudioMaterialCapture();

  studioMaterialDrag = null;

  studioMaterialClearVisuals();

}


function releaseStudioMaterialCapture() {

  const drag =
    studioMaterialDrag;

  if (!drag || !drag.handle || typeof drag.handle.releasePointerCapture !== "function") {
    return;
  }

  try {
    drag.handle.releasePointerCapture(drag.pointerId);
  }
  catch (err) {
    /* 이미 풀렸다 — 그대로 둔다 */
  }

}


function onStudioMaterialPointerDown(event) {

  if (studioMaterialDrag || event.button !== 0) {
    return;
  }

  const handle =
    studioMaterialDragTarget(event.target);

  if (!handle) {
    return;
  }

  /* 끌 수 있으려면 놓을 자리를 알아야 한다 — 지금 한 번 묻는다.
     답이 오기 전에 손이 움직이면 "아직 재지 못했습니다"가 뜬다. */
  if (typeof window.postCanvasProbeToFrame === "function") {
    window.postCanvasProbeToFrame();
  }

  const touch =
    event.pointerType === "touch";

  studioMaterialDrag = {
    itemId: handle.dataset.materialId,
    handle: handle,
    pointerId: event.pointerId,
    touch: touch,

    /* 아직 끌기가 아니다. 데스크톱은 **움직이면**, 터치는 **길게
       누르면** 시작한다 — 그 전에 손을 놓으면 그냥 누르기다. */
    started: false,
    timer: null,
    origin: { x: event.clientX, y: event.clientY },
    plan: null
  };

  try {
    handle.setPointerCapture(event.pointerId);
  }
  catch (err) {
    /* capture 를 못 걸면 끌기를 포기한다 — 반쯤 붙잡힌 채로
       Preview 위를 지나면 이벤트가 프레임으로 새어 나간다 */
    studioMaterialDrag = null;
    return;
  }

  if (touch) {

    studioMaterialDrag.timer =
      window.setTimeout(
        () => {

          if (studioMaterialDrag) {
            beginStudioMaterialDrag();
          }

        },
        studioMaterialDragLongPressMs()
      );

  }

}


function onStudioMaterialPointerMove(event) {

  const drag =
    studioMaterialDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  const moved =
    Math.abs(event.clientX - drag.origin.x) +
    Math.abs(event.clientY - drag.origin.y);

  if (!drag.started) {

    /* 터치: 길게 누르기 **전에** 움직였으면 목록을 넘기려는 손이다 */
    if (drag.touch) {

      if (moved > STUDIO_MATERIAL_DRAG_SLOP) {
        cancelStudioMaterialDrag();
      }

      return;

    }

    /* 데스크톱: 슬롭을 넘으면 그때 시작한다 — 그냥 누르기(=기본
       자리에 만들기)와 겹치지 않게 */
    if (moved <= STUDIO_MATERIAL_DRAG_SLOP) {
      return;
    }

    beginStudioMaterialDrag();

  }

  event.preventDefault();

  moveStudioMaterialDrag(event);

}


function onStudioMaterialPointerUp(event) {

  const drag =
    studioMaterialDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  if (drag.timer) {
    window.clearTimeout(drag.timer);
    drag.timer = null;
  }

  releaseStudioMaterialCapture();

  /* 시작하지 않았다 — 손잡이를 그냥 눌렀다 뗀 것이고, **아무 일도
     일어나지 않는다**(1C · §37-3). 손잡이는 카드 단추 바깥이라 그
     click 이 카드로 올라가지 않는다. 기본 자리에 만드는 길은 카드
     본문을 누르는 그 하나다(계약 §36-4). */
  if (!drag.started) {
    studioMaterialDrag = null;
    studioMaterialClearVisuals();
    return;
  }

  finishStudioMaterialDrag();

}


function onStudioMaterialClick(event) {

  const mark =
    studioMaterialEatClick;

  if (!mark) {
    return;
  }

  /* 시간이 지났으면 그 제스처의 click 은 오지 않은 것이다 — 표식을
     버리고 지금 click 은 그대로 흘려보낸다 */
  if (Date.now() - mark.at > STUDIO_MATERIAL_CLICK_GRACE_MS) {
    studioMaterialEatClick = null;
    return;
  }

  /* **그 칸 안의** click 하나다 — 손잡이 자신이든, 엔진이 공통
     조상으로 올려 보낸 칸이든, 그 칸이 품은 카드 단추든. 칸 밖
     (다른 카드 · `＋ 재료 추가` · 패널의 다른 단추)은 건드리지
     않는다(§37-3). */
  if (!mark.scope || !mark.scope.contains(event.target)) {
    return;
  }

  studioMaterialEatClick = null;

  event.stopPropagation();
  event.preventDefault();

}


function onStudioMaterialKeyDown(event) {

  if (event.key === "Escape" && studioMaterialDrag) {
    event.stopPropagation();
    cancelStudioMaterialDrag();
  }

}


if (typeof window !== "undefined" && typeof document !== "undefined") {

  /* 위임으로 듣는다 — 재료 목록은 화면이 바뀔 때마다 통째로 다시
     만들어지므로 단추마다 다는 것은 매번 다시 다는 일이다 */
  document.addEventListener("pointerdown", onStudioMaterialPointerDown, true);
  document.addEventListener("pointermove", onStudioMaterialPointerMove, true);
  document.addEventListener("pointerup", onStudioMaterialPointerUp, true);
  document.addEventListener("pointercancel", () => cancelStudioMaterialDrag(), true);
  document.addEventListener("keydown", onStudioMaterialKeyDown, true);

  /* 끌기 뒤에 오는 click 하나를 먹는다(위 ★) — capture 라 단추의
     자기 핸들러보다 먼저 온다 */
  document.addEventListener("click", onStudioMaterialClick, true);

  /* 진단 · 테스트가 보는 한 줄 */
  window.getStudioMaterialDragState =
    () => ({
      dragging: !!(studioMaterialDrag && studioMaterialDrag.started),
      itemId: studioMaterialDrag ? studioMaterialDrag.itemId : null,
      ghost: !!(studioMaterialGhost && studioMaterialGhost.isConnected),
      plan:
        (studioMaterialDrag && studioMaterialDrag.plan)
          ? {
              ok: !!studioMaterialDrag.plan.ok,
              target: studioMaterialDrag.plan.target || "",
              frameId: studioMaterialDrag.plan.frameId || "",
              index:
                Number.isInteger(studioMaterialDrag.plan.index)
                  ? studioMaterialDrag.plan.index
                  : null,
              reason: studioMaterialDrag.plan.reason || ""
            }
          : null,
      hint:
        (studioMaterialHint && !studioMaterialHint.hidden)
          ? (studioMaterialHint.dataset.hintKind || "")
          : ""
    });

  /* STUDIO-LAYERS-MATERIALS-1C — 흐름 띠(Preview 문서 좌표).
     진단과 테스트가 "지금 어디까지가 흐름인가"를 본다. */
  window.studioMaterialFlowBand = studioMaterialFlowBand;

  /* 테스트가 끌기 없이 계획만 물어보는 창구(좌표는 Studio 화면 좌표) */
  window.studioMaterialDropPlanAt =
    (itemId, clientX, clientY) => {

      const point =
        studioMaterialPointToPreview(clientX, clientY);

      return point
        ? studioMaterialDropPlan(itemId, point.x, point.y)
        : { ok: false, reason: "measure" };

    };

}
