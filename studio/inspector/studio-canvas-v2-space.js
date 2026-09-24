/* =========================================================
   STUDIO — v2 Canvas 의 **좌표 자**와 storage 번역
   (HOME-CANVAS-V2-EDITOR-1B)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §26
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14 (PLAN)

   ── 이 파일이 있는 이유 ────────────────────────────────

   v1 에서는 "화면의 자리"와 "저장된 칸"이 같았다. 요소의 `x` 가 곧
   도화지 좌표이고, 도화지 폭 하나로 배율이 풀렸다.

   v2 는 그렇지 않다. 같은 `x` 라도 어디에 있는 요소인가에 따라 자가
   다르고, `follow:"pin"` 장식은 **저장된 칸이 자리 자체가 아니다**
   (기준점에서 얼마나 떨어졌는가다).

     overlay                도화지 자(canvas.baseWidth · baseHeight)
     프레임 내부 transform   프레임 내부 자(props.baseWidth · …)
     프레임 내부 pin         프레임 상자 자 + `pin.offset`

   그래서 **선택 하나마다 자를 하나 정하고**, 그 자 위의 숫자만
   프레임과 패널에 내려보낸다. 프레임은 지금까지처럼 "x · y ·
   width · height · rotation" 다섯 칸만 알고, 그것이 무슨 자인지는
   묻지 않는다(§14 의 소유권 — 무엇을 고칠지는 언제나 부모가 안다).

   ── 자를 만드는 계산은 렌더러의 그것 하나다 ────────────

   프레임 폭 · 프레임 높이 · primary 사진 상자 · pin 기준점은 전부
   skin/skin-home-canvas-render.js 의 함수가 계산한다
   (`resolveSkinCanvasFrameGeometry` · `resolveSkinCanvasPinPoint` ·
   `SKIN_CANVAS_RENDER_PIN_FRACTIONS`). **여기에 한 벌 더 적지
   않는다** — 두 벌이 되면 한쪽만 고쳐지는 날 패널의 숫자와 화면의
   자리가 어긋난다. 그래서 Studio 문서도 그 렌더러 파일을 로드한다
   (studio/index.html — 그리지는 않고 자만 빌려 쓴다).

   ── 여기 있는 것 ───────────────────────────────────────

     studioCanvasV2Space(id)
       그 요소의 자와 **지금 값**(자 위의 숫자)

     planStudioCanvasV2Transform(kind, id, next, expected)
       자 위의 값 → storage 칸 + 그것을 쓸 순수 함수의 이름

   ★ 쓰지는 않는다. 확정 관문은 여전히 한 곳이고
     (studio/inspector/studio-canvas-selection.js
     commitStudioCanvasElementChange), 불변 수정은 순수 함수가 한다
     (skin/skin-home-canvas-write-v2.js).

   classic script 다. 의존(호출 시점에 읽는다):
     skin/skin-home-canvas-render.js     프레임의 자 · pin 기준점
     skin/skin-home-canvas-write-v2.js   findSkinHomeCanvasV2Node
     studio/inspector/studio-canvas-selection.js
                                         studioCanvasDraftPayload
========================================================== */


/* 자 위의 값이 소유하는 칸 — 프레임이 보내는 그 다섯 칸이다 */
const STUDIO_CANVAS_V2_SPACE_KINDS = {
  "v2-move": ["x", "y"],
  "v2-resize": ["x", "y", "width", "height"],
  "v2-rotate": ["rotation"]
};


/*
  pin 의 아홉 점 → 분수.

  ★ 표를 여기서 다시 적지 않고 **렌더러의 함수**를 부른다. 그 표는
    classic script 의 최상위 `const` 라 `window` 에 올라오지 않지만
    (전역 객체 속성이 되는 것은 `function` 선언뿐이다), 그것을 읽는
    `skinCanvasRenderPinFraction()` 은 함수라 올라온다 — 빠진
    `origin` 의 기본값(center)까지 그 함수가 이미 안다(§24-4).
*/
function studioCanvasV2PinFraction(name) {

  if (typeof window.skinCanvasRenderPinFraction === "function") {
    return window.skinCanvasRenderPinFraction(name);
  }

  return { x: 0.5, y: 0.5 };

}


/*
  흐름 층의 자 — 블록의 백분율이 풀리는 상자다(렌더러의 `metrics`).

  ★ 렌더러와 **같은 두 줄**이다(buildSkinCanvasFlowNode). 실행
    payload 의 `flow.padding` 은 네 칸이 언제나 채워져 있으므로
    (§23-2) 여기서 빠진 칸을 다시 가르지 않는다.
*/
function studioCanvasV2FlowMetrics(payload) {

  const flow =
    (payload && payload.flow && typeof payload.flow === "object")
      ? payload.flow
      : {};

  const padding =
    (flow.padding && typeof flow.padding === "object") ? flow.padding : {};

  const pad =
    (value) => (typeof value === "number" && Number.isFinite(value)) ? value : 0;

  return {
    /* HOME-CANVAS-V2-MANUAL-FIX-1 — 렌더러가 만드는 metrics 와
       **같은 모양**이어야 한다. 숫자 height 의 자가 흐름 층 높이에서
       도화지 폭으로 옮겨 가면서(계약 §29-1) 이 칸이 생겼고, 빠지면
       숫자 height 인 프레임의 자를 만들 수 없어 패널이 읽기 전용으로
       떨어진다(2026-09-22 e2e 가 그것을 잡았다). */
    baseWidth: payload.baseWidth,
    width: payload.baseWidth - pad(padding.left) - pad(padding.right),
    height: payload.baseHeight - pad(padding.top) - pad(padding.bottom)
  };

}


/*
  studioCanvasV2Space(id) -> space | null

  space = {
    id          그 요소
    kind        "frame-element" | "overlay"
    follow      "transform" | "pin" | null(overlay)
    scopeId     백분율과 배율의 기준이 되는 **상자의 edit id**
                (프레임 블록). overlay 는 null — 도화지가 기준이다.
    baseWidth   그 자의 가로 칸 수
    baseHeight  그 자의 세로 칸 수
    originX/Y   자기 상자의 어느 점이 그 자리에 놓이는가(0~1).
                pin 만 0 이 아니다(§24-4 의 translate).
    anchorX/Y   pin 의 기준점(자 위의 숫자). pin 이 아니면 0.
    offsetX/Y   지금 저장된 `pin.offset`. pin 이 아니면 0.
    x · y · width · height · rotation
                **자 위의 지금 값**. 프레임에 내려가고 패널에 적힌다.
  }

  풀 수 없으면 null 이다 — 프레임이 자를 못 만드는 경우(§24-3)와
  같은 판정이고, 그때는 직접 조작도 패널 입력도 켜지지 않는다.

  ★ 블록은 null 이다. 블록의 자리는 좌표가 아니다(§14-10).
*/
function studioCanvasV2Space(elementId) {

  if (typeof window.studioCanvasDraftPayload !== "function") {
    return null;
  }

  const payload =
    window.studioCanvasDraftPayload();

  if (
    !payload ||
    payload.version !== 2 ||
    typeof window.findSkinHomeCanvasV2Node !== "function"
  ) {
    return null;
  }

  const hit =
    window.findSkinHomeCanvasV2Node(payload, elementId);

  if (!hit || hit.kind === "block") {
    return null;
  }

  const node =
    hit.node;

  const rotation =
    (typeof node.rotation === "number" && Number.isFinite(node.rotation))
      ? node.rotation
      : 0;

  /* ── overlay — v1 요소와 같은 자다(§14-8) ── */

  if (hit.kind === "overlay") {

    if (
      !(payload.baseWidth > 0) || !(payload.baseHeight > 0) ||
      typeof node.x !== "number" || !Number.isFinite(node.x) ||
      typeof node.y !== "number" || !Number.isFinite(node.y)
    ) {
      return null;
    }

    return {
      id: elementId,
      kind: "overlay",
      follow: null,
      scopeId: null,
      baseWidth: payload.baseWidth,
      baseHeight: payload.baseHeight,

      /* HOME-CANVAS-GROUP-1B — 이 자의 한 칸이 **도화지 좌표로 몇인가**
         (계약 §39-5). overlay 는 도화지 자 그 자체라 1 이다. */
      unitScale: 1,

      originX: 0,
      originY: 0,
      anchorX: 0,
      anchorY: 0,
      offsetX: 0,
      offsetY: 0,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: rotation
    };

  }

  /* ── 프레임 내부 — 프레임의 자를 렌더러에게 묻는다 ── */

  if (
    typeof window.resolveSkinCanvasFrameGeometry !== "function" ||
    typeof window.resolveSkinCanvasPinPoint !== "function"
  ) {
    return null;
  }

  const blocks =
    (payload.flow && Array.isArray(payload.flow.blocks)) ? payload.flow.blocks : [];

  const block =
    blocks.find(
      (item) => item && typeof item === "object" && item.id === hit.parentId
    ) || null;

  if (!block) {
    return null;
  }

  const frame =
    window.resolveSkinCanvasFrameGeometry(
      block,
      studioCanvasV2FlowMetrics(payload)
    );

  if (!frame || !(frame.width > 0) || !(frame.height > 0) || !(frame.scale > 0)) {
    return null;
  }

  const follow =
    node.follow === "pin" ? "pin" : "transform";

  /* =====================================================
     HOME-CANVAS-GROUP-1B — 프레임 상자 자 ↔ 도화지 자의 배율
     (계약 §30-3). 데스크톱 최대 폭이 켜진 화면에서만 1 이 아니고,
     보고가 없으면 1 이다 — 숫자를 지어내지 않는다.
  ====================================================== */
  const pageScale =
    studioCanvasV2FramePageScale(payload, frame, hit.parentId);

  if (follow === "transform") {

    /* =====================================================
       내부 `transform` 의 자 — 프레임 내부 좌표 그대로다.

       ★ 세로 칸 수는 **저장값이 아니라 계산값**이다.
         `props.baseHeight` 는 내부 좌표의 자일 뿐이고, 프레임의
         실제 세로 길이는 숫자 `height` 또는 primary 사진의 비율이
         정한다(§24-5). 그래서 세로 자는 그 길이를 가로 배율로
         되돌린 값이다.

            baseHeight' = 프레임 높이 ÷ S_frame

         이러면 x · y · width · height 네 칸이 **저장된 그 숫자
         그대로** 이 자 위의 값이 되고, 배율도 한 개다(가로 · 세로
         가 같다 — 프레임 상자가 이미 그 비율이므로).
    ====================================================== */

    if (
      typeof node.x !== "number" || !Number.isFinite(node.x) ||
      typeof node.y !== "number" || !Number.isFinite(node.y)
    ) {
      return null;
    }

    return {
      id: elementId,
      kind: "frame-element",
      follow: "transform",
      scopeId: hit.parentId,
      baseWidth: frame.baseWidth,
      baseHeight: frame.height / frame.scale,

      /* HOME-CANVAS-GROUP-1B — 내부 자의 한 칸은 프레임 배율만큼
         도화지 자다. 그려진 폭이 저장값보다 좁으면 그만큼 더
         작다(계약 §39-5). */
      unitScale: frame.scale * pageScale,

      originX: 0,
      originY: 0,
      anchorX: 0,
      anchorY: 0,
      offsetX: 0,
      offsetY: 0,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: rotation
    };

  }

  /* =====================================================
     내부 `pin` 의 자 — **프레임 상자 자**다(로컬 자가 아니다).

     pin 장식의 크기는 `S_frame` 을 받지 않고(§24-3의 표) 좌표도
     `anchor 기준점 + offset` 으로 프레임 상자 위에서 풀린다. 그래서
     이 요소의 자는 프레임 상자 그 자체다.

     ★ 자 위의 `x` · `y` 는 **기준점 + offset**, 즉 `origin` 이 놓일
       자리다(렌더러가 `--imory-canvas-x` 로 적는 그 값). 자기 상자의
       왼쪽 위가 아니다 — 그 몫은 CSS 의 백분율 translate 가 뺀다.
  ====================================================== */

  const pin =
    (node.pin && typeof node.pin === "object") ? node.pin : {};

  const target =
    (pin.target === "photo" && frame.photo)
      ? frame.photo
      : { x: 0, y: 0, width: frame.width, height: frame.height };

  /* 기준점만 — offset 을 뺀 값이다. 자리를 옮길 때 필요한 offset 을
     `x − anchorX` 로 계산하기 위해 따로 들고 있는다(§26-4). */
  const anchor =
    window.resolveSkinCanvasPinPoint({ anchor: pin.anchor }, target);

  const point =
    window.resolveSkinCanvasPinPoint(pin, target);

  const origin =
    studioCanvasV2PinFraction(pin.origin);

  const offset =
    (pin.offset && typeof pin.offset === "object") ? pin.offset : {};

  const num =
    (value) => (typeof value === "number" && Number.isFinite(value)) ? value : 0;

  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }

  return {
    id: elementId,
    kind: "frame-element",
    follow: "pin",
    scopeId: hit.parentId,
    baseWidth: frame.width,
    baseHeight: frame.height,

    /* HOME-CANVAS-GROUP-1B — pin 의 자는 **프레임 상자**다. 저장값
       그대로가 도화지 자이고, 그려진 폭이 좁아진 만큼만 갈린다. */
    unitScale: pageScale,

    originX: origin.x,
    originY: origin.y,
    anchorX: anchor.x,
    anchorY: anchor.y,
    offsetX: num(offset.x),
    offsetY: num(offset.y),
    x: point.x,
    y: point.y,
    width: node.width,
    height: node.height,
    rotation: rotation
  };

}


/* =========================================================
   planStudioCanvasV2Transform(kind, id, next, expected)

     -> { ok: true, writer, next, expected }
     -> { ok: false, reason }

   자 위의 값을 **storage 칸**으로 번역한다. 하는 일은 셋이다.

     1  지금 자를 다시 만든다(draft 에서 — 프레임이 보낸 값을
        근거로 삼지 않는다)
     2  `expected` 가 그 자의 **지금 값과 정확히 같은가**
     3  `next` 를 storage 칸으로 옮기고, 그 칸을 쓸 순수 함수를 고른다

   ★ `expected` 를 자 위에서 본다. storage 로 옮긴 뒤에 비교하면
     pin 의 `x − anchorX` 가 부동소수점 한 칸 어긋나는 날 "그 사이에
     값이 바뀌었습니다" 가 뜬다 — 비교하는 두 값이 **같은 계산의
     결과**여야 그런 일이 없다(둘 다 지금 draft 에서 나온다).

   ★ 그래도 순수 함수에 `expected` 를 넘긴다. 그 값은 draft 에서
     읽은 storage 값이므로 관문이 하나 더 있는 셈이고, regions 원본과
     실행 payload 가 어긋난 데이터에서는 거기서 걸린다.
========================================================== */

function planStudioCanvasV2Transform(kind, elementId, next, expected) {

  const keys =
    Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_V2_SPACE_KINDS, kind)
      ? STUDIO_CANVAS_V2_SPACE_KINDS[kind]
      : null;

  if (!keys) {
    return { ok: false, reason: "kind" };
  }

  const space =
    studioCanvasV2Space(elementId);

  if (!space) {
    return { ok: false, reason: "space" };
  }

  if (!next || typeof next !== "object" || !expected || typeof expected !== "object") {
    return { ok: false, reason: "shape" };
  }

  /* 위 ★ — 자 위에서 본다 */
  if (keys.some((key) => expected[key] !== space[key])) {
    return { ok: false, reason: "expected" };
  }

  if (kind === "v2-rotate") {

    return {
      ok: true,
      writer: "writeSkinHomeCanvasV2NodeRotation",
      next: { rotation: next.rotation },
      expected: { rotation: space.rotation }
    };

  }

  const resize =
    kind === "v2-resize";

  if (space.follow === "pin") {

    /* =====================================================
       pin — 자리는 `offset` 으로 저장된다(§26-4)

         offset = 자 위의 자리 − 기준점

       ★ `target` · `anchor` · `origin` 은 그대로다. 고정 관계를
         바꾸지 않고 **필요한 offset 만** 다시 계산한다.

       ★ 크기를 바꿀 때도 같은 한 줄이다. 프레임이 이미 `origin`
         몫을 좌표에 되돌려 보내므로(editor-runtime 의 origin 보정)
         여기 오는 `x` 는 언제나 "origin 이 놓일 자리"다 — 그래서
         상자가 커져도 고정 기준점이 제자리에 남는다.
    ====================================================== */

    /*
      ★ 자리가 그대로면 **저장된 offset 을 그대로 쓴다.**

      `(기준점 + offset) − 기준점` 이 부동소수점에서 원래 offset 과
      마지막 비트까지 같다는 보장이 없다. 그 차이가 그대로 저장되면
      한 칸도 옮기지 않은 요청이 Undo 한 칸을 만든다 — 자리가 같으면
      offset 도 같다고 읽는 편이 맞다.
    */
    const plan = {
      ok: true,
      writer:
        resize
          ? "writeSkinHomeCanvasV2NodePinBox"
          : "writeSkinHomeCanvasV2NodePinOffset",
      next: {
        offsetX:
          (next.x === space.x) ? space.offsetX : (next.x - space.anchorX),
        offsetY:
          (next.y === space.y) ? space.offsetY : (next.y - space.anchorY)
      },
      expected: {
        offsetX: space.offsetX,
        offsetY: space.offsetY
      }
    };

    if (resize) {

      plan.next.width = next.width;
      plan.next.height = next.height;

      plan.expected.width = space.width;
      plan.expected.height = space.height;

    }

    return plan;

  }

  /* transform · overlay — 자 위의 값이 곧 저장값이다 */

  const plan = {
    ok: true,
    writer:
      resize
        ? "writeSkinHomeCanvasV2NodeBox"
        : "writeSkinHomeCanvasV2NodePosition",
    next: { x: next.x, y: next.y },
    expected: { x: space.x, y: space.y }
  };

  if (resize) {

    plan.next.width = next.width;
    plan.next.height = next.height;

    plan.expected.width = space.width;
    plan.expected.height = space.height;

  }

  return plan;

}


/* =========================================================
   소속을 옮기는 계산 (HOME-CANVAS-V2-ELEMENTS-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §28

   ── 재는 것은 하나뿐이다 ───────────────────────────────

   프레임의 폭 · 높이 · 배율 · primary 사진 상자 · pin 기준점은 전부
   렌더러가 **저장값에서** 계산한다(§24-3 · §26-3). 데이터가 줄 수
   없는 것은 하나다 — `main_visual` 이 흐름 안에서 **어디에
   놓였는가**. 앞 블록들의 실제 높이가 그것을 정하고, 글자 블록의
   `height:"auto"` 는 스킨 조판이 정한다.

   그래서 프레임이 그 한 값만 보고하고(도화지 폭의 분수 —
   `preview:canvas-layout`), 이 파일이 그것을 Canvas 좌표로 읽어
   묶기 · 빼기의 자로 쓴다. 나머지는 지금까지처럼 draft 에서 나온다.

   ── 왜 이 계산이 writer 에 없는가 ──────────────────────

   §26-4 의 그 경계 그대로다. 순수 writer 는 regions 하나만 보고
   불변으로 옮겨 적고, "그 자리를 새 자로 얼마라고 적어야 하는가"는
   렌더러의 자를 아는 이 realm 이 정한다. 자를 두 벌 만들지 않는다.

   ── 높이가 Auto 인 pin 장식 ────────────────────────────

   `pin` 요소의 화면 자리는 `기준점 + offset − origin × 자기 크기`
   이고, 그 마지막 항은 높이를 알아야 한다. `height:"auto"` 의 실제
   높이는 스킨 조판이 정하므로 우리는 모른다 — 그래서 **세로
   기준점이 위가 아닐 때만** 문제가 되고, 그때는 숫자를 지어내지
   않고 `auto-origin` 으로 거절한다(§25-4 의 "Auto 를 끌 때 숫자를
   지어내지 않는다"와 같은 자리).
========================================================== */

/* 프레임이 마지막으로 보고한 자리 — id → { x, y }(도화지 폭의 분수) */
let studioCanvasV2FrameLayout = {};

/* HOME-CANVAS-V2-MANUAL-FIX-1 — 블록이 화면에서 갖는 높이
   (id → 도화지 폭의 분수 · 계약 §29-3). 같은 보고에 실려 온다. */
let studioCanvasV2BlockLayout = {};

/* HOME-CANVAS-V2-MANUAL-FIX-1 — 고른 요소가 지금 물려받고 있는 모양
   ({ id, props } · 계약 §29-6). 묶기 · 빼기가 그 자리에서 읽는다. */
let studioCanvasV2Look = null;

/* 그 규칙에 적어도 되는 속성 — 프레임이 보낸 키를 그대로 믿지 않는다 */
const STUDIO_CANVAS_V2_LOOK_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-transform", "text-align",
  "color", "white-space"
];

/* 값에 쓸 수 있는 글자 — sandbox 프로토콜과 같은 자다(native 도
   같은 자를 지나게 해서 두 화면이 갈라지지 않게 한다) */
const STUDIO_CANVAS_V2_LOOK_VALUE = /^[-A-Za-z0-9 ,.%#()'"\/]{1,120}$/;


/*
  setStudioCanvasFrameLayout(frames)

  Preview(native · sandbox)가 올린 **보고**다. 저장되는 값이 아니고,
  묶기 · 빼기를 누른 그 순간의 자로만 쓰인다.

  ★ 모르는 칸은 버린다. 여기 들어오는 것은 프레임 하나의 id 와
    분수 둘뿐이다.
*/
function setStudioCanvasFrameLayout(frames, blocks, look) {

  studioCanvasV2Look =
    studioCanvasV2LookLiteral(look);

  const nextBlocks = {};

  (Array.isArray(blocks) ? blocks : []).forEach(
    (block) => {

      if (
        !block ||
        typeof block !== "object" ||
        typeof block.id !== "string" ||
        typeof block.h !== "number" ||
        !Number.isFinite(block.h) ||
        !(block.h > 0)
      ) {
        return;
      }

      nextBlocks[block.id] = block.h;

    }
  );

  studioCanvasV2BlockLayout = nextBlocks;

  const next = {};

  (Array.isArray(frames) ? frames : []).forEach(
    (frame) => {

      if (
        !frame ||
        typeof frame !== "object" ||
        typeof frame.id !== "string" ||
        typeof frame.x !== "number" || !Number.isFinite(frame.x) ||
        typeof frame.y !== "number" || !Number.isFinite(frame.y)
      ) {
        return;
      }

      /* HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 그려진 폭(계약 §30-3).
         옛 프레임 문서는 보내지 않는다 — 그때는 지금까지처럼
         저장값에서 계산한다. */
      next[frame.id] = {
        x: frame.x,
        y: frame.y,
        w:
          (typeof frame.w === "number" && Number.isFinite(frame.w) && frame.w > 0)
            ? frame.w
            : null
      };

    }
  );

  studioCanvasV2FrameLayout = next;

}


/*
  HOME-CANVAS-V2-MANUAL-FIX-1 — 보고된 모양을 새 리터럴로(계약 §29-6)

  봉투에서 온 객체를 그대로 들고 있지 않고, 아는 키 · 아는 모양의
  값만 옮겨 담는다. native 도 sandbox 와 **같은 자**를 지난다.
*/
function studioCanvasV2LookLiteral(look) {

  if (
    !look ||
    typeof look !== "object" ||
    typeof look.id !== "string" ||
    !look.props ||
    typeof look.props !== "object"
  ) {
    return null;
  }

  const props = {};

  STUDIO_CANVAS_V2_LOOK_PROPERTIES.forEach(
    (name) => {

      const value =
        look.props[name];

      if (typeof value === "string" && STUDIO_CANVAS_V2_LOOK_VALUE.test(value)) {
        props[name] = value;
      }

    }
  );

  return Object.keys(props).length ? { id: look.id, props: props } : null;

}


/*
  그 요소가 **지금 물려받고 있는 모양**. 보고가 없거나 다른 요소의
  것이면 null 이다 — 숫자도 문자열도 지어내지 않는다.
*/
function studioCanvasV2NodeLook(id) {

  if (
    !studioCanvasV2Look ||
    typeof id !== "string" ||
    studioCanvasV2Look.id !== id
  ) {
    return null;
  }

  return { ...studioCanvasV2Look.props };

}


/* =========================================================
   HOME-CANVAS-V2-MANUAL-FIX-1 — 그 블록이 **화면에서 갖는 높이**
   (Canvas 좌표 · 계약 §29-3)

   Auto 스위치를 끌 때 "지금 보이는 그 높이"로 굳히는 데 쓴다.
   보고가 없으면(아직 안 왔다 · 그 블록이 화면에 없다) null 이고,
   그때는 숫자를 지어내지 않는다.
========================================================== */
function studioCanvasV2MeasuredHeight(id) {

  if (
    typeof id !== "string" ||
    !Object.prototype.hasOwnProperty.call(studioCanvasV2BlockLayout, id) ||
    typeof window.studioCanvasDraftPayload !== "function"
  ) {
    return null;
  }

  const payload =
    window.studioCanvasDraftPayload();

  if (!payload || !(payload.baseWidth > 0)) {
    return null;
  }

  const value =
    studioCanvasV2Round(studioCanvasV2BlockLayout[id] * payload.baseWidth);

  return (Number.isFinite(value) && value > 0) ? value : null;

}


/* =========================================================
   studioCanvasV2FramePageScale(payload, frame, blockId)
   (HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 · 계약 §30-3)

   프레임 상자 자 ↔ **도화지 자**의 배율. 없으면 1 이다.

   ── 왜 1 이 아닌 때가 생겼나 ───────────────────────────
   V2-ELEMENTS-1 까지 이 둘은 **같은 자**였다. 프레임 상자의 폭이 곧
   `frame.width` 도화지 단위였기 때문이다(§24-3). 데스크톱 최대
   폭(§30-3)이 생기면서, 화면이 설계 폭보다 넓으면 프레임은 저장값이
   말하는 폭보다 좁게 그려진다 — 그만큼 두 자가 갈린다.

     k = 그려진 폭(도화지 단위) ÷ frame.width

   ── 무엇에 쓰고 무엇에 쓰지 않는가 ─────────────────────
   **도화지 ↔ 프레임 상자**를 오가는 계산에만 쓴다 — 묶기와 빼기
   둘이다. 그 밖의 자는 전부 저장 공간 안에서만 도므로 k 와 무관하다:

     `frame.scale`(로컬 ↔ 프레임 상자)   저장값끼리의 비다
     pin 의 자(프레임 상자)              저장값 그대로다
     프레임이 재는 배율                  DOM 을 재므로 이미 맞다

   ★ 보고가 없으면(옛 프레임 문서 · 아직 첫 보고 전) 1 이다 —
     지금까지의 그 계산으로 돌아간다. 숫자를 지어내지 않는다.
========================================================== */
function studioCanvasV2FramePageScale(payload, frame, blockId) {

  if (!payload || !frame || !(frame.width > 0) || !(payload.baseWidth > 0)) {
    return 1;
  }

  const hit =
    (typeof blockId === "string" &&
      Object.prototype.hasOwnProperty.call(studioCanvasV2FrameLayout, blockId))
      ? studioCanvasV2FrameLayout[blockId]
      : null;

  if (!hit || typeof hit.w !== "number" || !(hit.w > 0)) {
    return 1;
  }

  const k =
    (hit.w * payload.baseWidth) / frame.width;

  return (Number.isFinite(k) && k > 0) ? k : 1;

}


/* 그 프레임의 왼쪽 위 — **Canvas 좌표**. 보고가 없으면 null 이다 */
function studioCanvasV2FrameOrigin(frameId) {

  const hit =
    Object.prototype.hasOwnProperty.call(studioCanvasV2FrameLayout, frameId)
      ? studioCanvasV2FrameLayout[frameId]
      : null;

  if (!hit || typeof window.studioCanvasDraftPayload !== "function") {
    return null;
  }

  const payload =
    window.studioCanvasDraftPayload();

  if (!payload || !(payload.baseWidth > 0)) {
    return null;
  }

  return {
    x: hit.x * payload.baseWidth,
    y: hit.y * payload.baseWidth
  };

}


/* 소수 셋째 자리 — 저장되는 좌표의 자는 언제나 그 하나다(§17-5) */
function studioCanvasV2Round(value) {

  return (typeof window.roundSkinHomeCanvasCoord === "function")
    ? window.roundSkinHomeCanvasCoord(value)
    : Math.round(value * 1000) / 1000;

}


/*
  그 프레임 블록의 자 — 렌더러의 계산 하나다(§26-3).

  -> { block, frame, origin } | null
*/
function studioCanvasV2FrameSpace(payload, frameId) {

  if (
    !payload ||
    typeof window.resolveSkinCanvasFrameGeometry !== "function" ||
    typeof frameId !== "string"
  ) {
    return null;
  }

  const blocks =
    (payload.flow && Array.isArray(payload.flow.blocks)) ? payload.flow.blocks : [];

  const block =
    blocks.find(
      (item) =>
        item && typeof item === "object" &&
        item.id === frameId && item.type === "main_visual"
    ) || null;

  if (!block) {
    return null;
  }

  const frame =
    window.resolveSkinCanvasFrameGeometry(
      block,
      studioCanvasV2FlowMetrics(payload)
    );

  if (!frame || !(frame.width > 0) || !(frame.height > 0) || !(frame.scale > 0)) {
    return null;
  }

  const origin =
    studioCanvasV2FrameOrigin(frameId);

  return origin
    ? {
        block: block,
        frame: frame,
        origin: origin,

        /* HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 프레임 상자 자 ↔
           도화지 자의 배율. 묶기 · 빼기만 쓴다(계약 §30-3). */
        pageScale: studioCanvasV2FramePageScale(payload, frame, frameId)
      }
    : null;

}


/* `pin` 이 가리키는 상자 — 렌더러와 같은 fallback 이다(§24-4) */
function studioCanvasV2PinTargetBox(frame, target) {

  return (target === "photo" && frame.photo)
    ? frame.photo
    : { x: 0, y: 0, width: frame.width, height: frame.height };

}


/*
  프레임 내부 요소 하나의 **프레임 좌표 위 왼쪽 위와 크기**.

  -> { x, y, width, height } | { reason }

  ★ `height:"auto"` 는 그대로 "auto" 로 돌려준다 — 옮긴 뒤에도
    내용이 높이를 정하는 것이 맞다. 세로 자리를 계산하는 데 높이가
    필요한 경우(위 머리말)에만 거절한다.
*/
function studioCanvasV2FrameElementBox(node, frame) {

  const auto =
    node.height === "auto";

  if (node.follow !== "pin") {

    if (
      typeof node.x !== "number" || !Number.isFinite(node.x) ||
      typeof node.y !== "number" || !Number.isFinite(node.y)
    ) {
      return { reason: "space" };
    }

    return {
      x: node.x * frame.scale,
      y: node.y * frame.scale,
      width: node.width * frame.scale,
      height: auto ? "auto" : node.height * frame.scale
    };

  }

  const pin =
    (node.pin && typeof node.pin === "object") ? node.pin : {};

  const point =
    window.resolveSkinCanvasPinPoint(
      pin,
      studioCanvasV2PinTargetBox(frame, pin.target)
    );

  const origin =
    studioCanvasV2PinFraction(pin.origin);

  if (auto && origin.y !== 0) {
    return { reason: "auto-origin" };
  }

  return {
    x: point.x - origin.x * node.width,
    y: point.y - origin.y * (auto ? 0 : node.height),
    width: node.width,
    height: auto ? "auto" : node.height
  };

}


/* 두 계산이 함께 쓰는 입구 — 지금 draft 가 v2 인가 · 그 id 가 무엇인가 */
function studioCanvasV2Locate(elementId) {

  if (
    typeof window.studioCanvasDraftPayload !== "function" ||
    typeof window.findSkinHomeCanvasV2Node !== "function" ||
    typeof window.resolveSkinCanvasPinPoint !== "function"
  ) {
    return null;
  }

  const payload =
    window.studioCanvasDraftPayload();

  if (!payload || payload.version !== 2) {
    return null;
  }

  const hit =
    window.findSkinHomeCanvasV2Node(payload, elementId);

  return hit ? { payload: payload, hit: hit } : null;

}


/*
  planStudioCanvasV2Attach(elementId, frameId)

    -> { ok:true, next: { x, y, width, height } }   프레임 내부 좌표
    -> { ok:false, reason }

  overlay 하나를 그 프레임 안의 같은 화면 자리로 옮긴다.

      로컬값 = (도화지 좌표 − 프레임의 왼쪽 위) ÷ S_frame

  ★ 새 소속은 `transform` 이다(writer 가 그렇게 적는다 — §28-2).
    그래서 크기도 `S_frame` 으로 나눈다.
*/
function planStudioCanvasV2Attach(elementId, frameId) {

  const found =
    studioCanvasV2Locate(elementId);

  if (!found) {
    return { ok: false, reason: "space" };
  }

  if (found.hit.kind !== "overlay") {
    return { ok: false, reason: "kind" };
  }

  const space =
    studioCanvasV2FrameSpace(found.payload, frameId);

  if (!space) {
    return { ok: false, reason: "layout" };
  }

  const node =
    found.hit.node;

  if (
    typeof node.x !== "number" || !Number.isFinite(node.x) ||
    typeof node.y !== "number" || !Number.isFinite(node.y)
  ) {
    return { ok: false, reason: "space" };
  }

  /* 도화지 자 → 로컬 자. `frame.scale` 은 로컬 ↔ 프레임 상자이고,
     프레임 상자 ↔ 도화지는 `pageScale` 이다(계약 §30-3) —
     상한이 물리지 않은 화면에서는 그 값이 1 이라 지금까지와 같다. */
  const s =
    space.frame.scale * space.pageScale;

  return {
    ok: true,
    next: {
      x: studioCanvasV2Round((node.x - space.origin.x) / s),
      y: studioCanvasV2Round((node.y - space.origin.y) / s),
      width: studioCanvasV2Round(node.width / s),
      height:
        node.height === "auto"
          ? "auto"
          : studioCanvasV2Round(node.height / s)
    }
  };

}


/*
  planStudioCanvasV2Detach(elementId)

    -> { ok:true, next: { x, y, width, height } }   도화지 좌표
    -> { ok:false, reason }

  묶기의 역이다. `transform` 은 로컬값에 `S_frame` 을 곱하고,
  `pin` 은 이미 프레임 상자 자 위의 값이라 곱하지 않는다(§24-3 의 표).
*/
function planStudioCanvasV2Detach(elementId) {

  const found =
    studioCanvasV2Locate(elementId);

  if (!found) {
    return { ok: false, reason: "space" };
  }

  if (found.hit.kind !== "frame-element") {
    return { ok: false, reason: "kind" };
  }

  const space =
    studioCanvasV2FrameSpace(found.payload, found.hit.parentId);

  if (!space) {
    return { ok: false, reason: "layout" };
  }

  const box =
    studioCanvasV2FrameElementBox(found.hit.node, space.frame);

  if (box.reason) {
    return { ok: false, reason: box.reason };
  }

  /* 프레임 상자 자 → 도화지 자(계약 §30-3). 상한이 물리지 않은
     화면에서는 1 이라 지금까지와 같은 식이다. */
  const k =
    space.pageScale;

  return {
    ok: true,
    next: {
      x: studioCanvasV2Round(space.origin.x + box.x * k),
      y: studioCanvasV2Round(space.origin.y + box.y * k),
      width: studioCanvasV2Round(box.width * k),
      height:
        box.height === "auto"
          ? "auto"
          : studioCanvasV2Round(box.height * k)
    }
  };

}


/*
  planStudioCanvasV2Follow(elementId, next, expected)

    next     { follow }   바꿀 방식
    expected { follow }   지금 방식

    -> { ok:true, writer, next, expected }
    -> { ok:false, reason }

  **자리를 유지한 채** 따라가기 방식을 바꾼다. 두 방식은 쓰는 칸도
  자도 다르므로(§14-6 · §26-2) 방식만 바꾸면 장식이 다른 자리로
  튄다 — 그래서 이 한 요청이 방식과 그 방식에서의 자리를 함께
  소유한다.

  ★ `transform` → `pin` 은 **왼쪽 위 기준**으로 시작한다(§28-4).
    기준점이 가운데면 자기 크기를 알아야 offset 이 나오고,
    `height:"auto"` 장식에서는 그 값이 없다. 기준 대상 · 기준점은
    바꾼 뒤에 패널에서 고른다(그때도 자리는 그대로다).
*/
function planStudioCanvasV2Follow(elementId, next, expected) {

  if (!next || typeof next !== "object" || !expected || typeof expected !== "object") {
    return { ok: false, reason: "shape" };
  }

  const found =
    studioCanvasV2Locate(elementId);

  if (!found) {
    return { ok: false, reason: "space" };
  }

  if (found.hit.kind !== "frame-element") {
    return { ok: false, reason: "kind" };
  }

  const node =
    found.hit.node;

  const current =
    node.follow === "pin" ? "pin" : "transform";

  if (expected.follow !== current) {
    return { ok: false, reason: "expected" };
  }

  if (next.follow !== "pin" && next.follow !== "transform") {
    return { ok: false, reason: "follow" };
  }

  if (next.follow === current) {
    return { ok: false, reason: "unchanged" };
  }

  const space =
    studioCanvasV2FrameSpace(found.payload, found.hit.parentId);

  if (!space) {
    return { ok: false, reason: "layout" };
  }

  const box =
    studioCanvasV2FrameElementBox(node, space.frame);

  if (box.reason) {
    return { ok: false, reason: box.reason };
  }

  const s =
    space.frame.scale;

  if (next.follow === "pin") {

    /* 왼쪽 위 기준 — 기준점 (0,0) 이므로 offset 이 곧 프레임 좌표다 */
    return {
      ok: true,
      writer: "writeSkinHomeCanvasV2NodeFollow",
      next: {
        follow: "pin",
        offsetX: studioCanvasV2Round(box.x),
        offsetY: studioCanvasV2Round(box.y),
        width: studioCanvasV2Round(box.width),
        height: box.height === "auto" ? "auto" : studioCanvasV2Round(box.height),
        target: "frame",
        anchor: "top-left",
        origin: "top-left"
      },
      expected: { follow: current }
    };

  }

  return {
    ok: true,
    writer: "writeSkinHomeCanvasV2NodeFollow",
    next: {
      follow: "transform",
      x: studioCanvasV2Round(box.x / s),
      y: studioCanvasV2Round(box.y / s),
      width: studioCanvasV2Round(box.width / s),
      height: box.height === "auto" ? "auto" : studioCanvasV2Round(box.height / s)
    },
    expected: { follow: current }
  };

}


/*
  planStudioCanvasV2Pin(elementId, next, expected)

    next · expected { target, anchor, origin }

    -> { ok:true, writer, next: { …셋 + offsetX · offsetY }, expected }
    -> { ok:false, reason }

  기준 대상 · 기준점 · 자기 기준점을 바꾸되 **지금 자리는 그대로**
  두도록 offset 을 다시 계산한다.

      화면 자리 = 기준점 + offset − origin × 자기 크기

  세 칸 중 하나가 바뀌면 그 식의 다른 항이 달라지므로, 같은 자리에
  있으려면 offset 이 함께 바뀌어야 한다. 그것이 §14-6 이 `anchor` 와
  `origin` 을 둘 다 둔 이유이고, 그래서 **바꾸는 요청이 offset 을
  함께 소유한다**(편집기가 몰래 다시 계산하지 않는다).
*/
function planStudioCanvasV2Pin(elementId, next, expected) {

  if (!next || typeof next !== "object" || !expected || typeof expected !== "object") {
    return { ok: false, reason: "shape" };
  }

  const found =
    studioCanvasV2Locate(elementId);

  if (!found) {
    return { ok: false, reason: "space" };
  }

  if (found.hit.kind !== "frame-element" || found.hit.node.follow !== "pin") {
    return { ok: false, reason: "pin" };
  }

  const node =
    found.hit.node;

  /* 실행 payload 의 `pin` 은 네 칸이 언제나 채워져 있다(§23-2 의
     그 규칙) — 빠진 칸을 여기서 다시 가르지 않는다 */
  const pin =
    (node.pin && typeof node.pin === "object") ? node.pin : {};

  const offset =
    (pin.offset && typeof pin.offset === "object") ? pin.offset : {};

  const num =
    (value) => (typeof value === "number" && Number.isFinite(value)) ? value : 0;

  const now = {
    target: pin.target === "photo" ? "photo" : "frame",
    anchor: pin.anchor,
    origin: pin.origin
  };

  if (
    expected.target !== now.target ||
    expected.anchor !== now.anchor ||
    expected.origin !== now.origin
  ) {
    return { ok: false, reason: "expected" };
  }

  const space =
    studioCanvasV2FrameSpace(found.payload, found.hit.parentId);

  if (!space) {
    return { ok: false, reason: "layout" };
  }

  const frame =
    space.frame;

  const point =
    window.resolveSkinCanvasPinPoint(
      pin,
      studioCanvasV2PinTargetBox(frame, now.target)
    );

  const originNow =
    studioCanvasV2PinFraction(now.origin);

  const originNext =
    studioCanvasV2PinFraction(next.origin);

  const auto =
    node.height === "auto";

  if (auto && originNow.y !== originNext.y) {
    return { ok: false, reason: "auto-origin" };
  }

  /* 새 `origin` 이 놓일 자리 — 화면 자리는 그대로다 */
  const wanted = {
    x: point.x + (originNext.x - originNow.x) * node.width,
    y: point.y + (originNext.y - originNow.y) * (auto ? 0 : node.height)
  };

  const anchorPoint =
    window.resolveSkinCanvasPinPoint(
      { anchor: next.anchor },
      studioCanvasV2PinTargetBox(frame, next.target)
    );

  if (!Number.isFinite(anchorPoint.x) || !Number.isFinite(anchorPoint.y)) {
    return { ok: false, reason: "space" };
  }

  return {
    ok: true,
    writer: "writeSkinHomeCanvasV2NodePin",
    next: {
      target: next.target,
      anchor: next.anchor,
      origin: next.origin,
      offsetX: studioCanvasV2Round(wanted.x - anchorPoint.x),
      offsetY: studioCanvasV2Round(wanted.y - anchorPoint.y)
    },
    expected: {
      target: now.target,
      anchor: now.anchor,
      origin: now.origin,
      offsetX: num(offset.x),
      offsetY: num(offset.y)
    }
  };

}


/* =========================================================
   STUDIO-LAYERS-MATERIALS-1B — 놓은 자리를 Canvas 좌표로
   (계약 §36-5)

   ── 왜 여기인가 ────────────────────────────────────────

   이 파일이 이미 "자"를 맡고 있다. 묶기 · 빼기가 "화면의 그 자리를
   다른 자 위의 숫자로 다시 적는" 일인 것처럼, 끌어다 놓기는 "손가락
   자리를 그 자 위의 숫자로 적는" 일이다. 자를 두 벌 만들지 않는다.

   ── 무엇이 들어오나 ────────────────────────────────────

   `preview:canvas-box` 의 답이다 — **픽셀**이고 Preview 문서의
   뷰포트 기준이다(sandbox 는 안쪽 iframe 자리를 이미 더했다).

     root    도화지의 안쪽 상자
     blocks  흐름 블록마다 하나(id 로 찾는다)
     frames  `main_visual` 마다 하나

   ★ **저장되는 숫자가 아니다.** 끌기를 시작할 때 한 번 재고, 놓을
     때 한 번 쓰고 버린다. 그 사이에 화면이 바뀌지 않는 이유는
     포인터가 부모에 붙들려 있기 때문이다(계약 §36-5).
========================================================== */

let studioCanvasBoxes =
  { root: null, blocks: {}, frames: {} };


/* 사각형 한 칸 — 숫자 넷이 아니면 **없는 것**이다 */
function studioCanvasBoxRect(rect) {

  if (
    !rect ||
    typeof rect !== "object" ||
    typeof rect.left !== "number" || !Number.isFinite(rect.left) ||
    typeof rect.top !== "number" || !Number.isFinite(rect.top) ||
    typeof rect.width !== "number" || !Number.isFinite(rect.width) ||
    typeof rect.height !== "number" || !Number.isFinite(rect.height) ||
    !(rect.width > 0)
  ) {
    return null;
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };

}


function setStudioCanvasBoxes(value) {

  const next =
    { root: null, blocks: {}, frames: {} };

  if (value && typeof value === "object") {

    next.root =
      studioCanvasBoxRect(value.root);

    ["blocks", "frames"].forEach((key) => {

      (Array.isArray(value[key]) ? value[key] : []).forEach((item) => {

        if (!item || typeof item !== "object" || typeof item.id !== "string") {
          return;
        }

        const rect =
          studioCanvasBoxRect(item.rect);

        if (rect) {
          next[key][item.id] = rect;
        }

      });

    });

  }

  studioCanvasBoxes = next;

}


function studioCanvasBoxesSnapshot() {

  return studioCanvasBoxes;

}


/*
  Preview 문서 좌표 → 도화지 좌표.

  ★ 상자 밖도 그대로 돌려준다. "밖이다"를 판정하는 것은 부르는
    쪽이고(금지 표시를 그려야 한다), 여기서 잘라 버리면 가장자리
    바깥이 전부 가장자리로 보인다.
*/
function studioCanvasPointToCanvas(previewX, previewY) {

  const root =
    studioCanvasBoxes.root;

  const payload =
    (typeof window.studioCanvasDraftPayload === "function")
      ? window.studioCanvasDraftPayload()
      : null;

  if (!root || !payload || !(payload.baseWidth > 0)) {
    return null;
  }

  const k =
    payload.baseWidth / root.width;

  return {
    x: (previewX - root.left) * k,
    y: (previewY - root.top) * k,

    /* 도화지 안인가 — 밖이면 자유 층에 놓을 수 없다 */
    inside:
      previewX >= root.left &&
      previewX <= root.left + root.width &&
      previewY >= root.top &&
      previewY <= root.top + root.height
  };

}


/*
  Preview 문서 좌표 → 그 프레임의 **내부** 좌표(계약 §24-3).

  프레임의 자는 `props.baseWidth` 이고, 화면에서 그 프레임이 차지한
  폭이 그 자의 배율이다. 저장값으로 계산하지 않는 이유는 §30-3 이다 —
  데스크톱 최대 폭에서 프레임은 저장값보다 좁게 그려진다.
*/
function studioCanvasPointToFrame(frameId, previewX, previewY) {

  const rect =
    studioCanvasBoxes.frames[frameId];

  if (!rect) {
    return null;
  }

  const node =
    (typeof window.studioCanvasNodeInfo === "function")
      ? window.studioCanvasNodeInfo(frameId)
      : null;

  const props =
    (node && node.node && node.node.props && typeof node.node.props === "object")
      ? node.node.props
      : null;

  const base =
    (props && typeof props.baseWidth === "number" && props.baseWidth > 0)
      ? props.baseWidth
      : null;

  if (!base) {
    return null;
  }

  const k =
    base / rect.width;

  return {
    x: (previewX - rect.left) * k,
    y: (previewY - rect.top) * k,
    inside:
      previewX >= rect.left &&
      previewX <= rect.left + rect.width &&
      previewY >= rect.top &&
      previewY <= rect.top + rect.height
  };

}


/*
  흐름의 **삽입선** — 이 세로 자리는 몇 번째 사이인가.

  ★ 순서는 **draft 가 정한다.** 화면에 그려진 순서를 그대로 쓰지
    않는 이유는 숨긴 블록이다 — 그려지지 않은 블록이 draft 배열에는
    있고, DOM 몇 번째를 그대로 쓰면 그만큼 어긋난다.

  ★ 블록이 하나도 없으면 0 이다(맨 앞 = 맨 뒤).
*/
function studioCanvasFlowInsertIndex(previewY) {

  const payload =
    (typeof window.studioCanvasDraftPayload === "function")
      ? window.studioCanvasDraftPayload()
      : null;

  const blocks =
    (payload && payload.flow && Array.isArray(payload.flow.blocks))
      ? payload.flow.blocks
      : [];

  if (!blocks.length) {
    return { index: 0, line: null };
  }

  for (let i = 0; i < blocks.length; i += 1) {

    const rect =
      studioCanvasBoxes.blocks[blocks[i].id];

    if (!rect) {
      continue;
    }

    /* 그 블록의 **위 절반**이면 그 앞, 아래 절반이면 다음 자리를
       계속 본다 */
    if (previewY < rect.top + rect.height / 2) {
      return { index: i, line: rect.top };
    }

  }

  const last =
    studioCanvasBoxes.blocks[blocks[blocks.length - 1].id] || null;

  return {
    index: blocks.length,
    line: last ? (last.top + last.height) : null
  };

}


/* =========================================================
   HOME-CANVAS-GROUP-1B — 그룹 전체 이동의 **계획 한 벌**

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §39-5
   설계:      docs/plans/IMORY_HOME_CANVAS_GROUP_DESIGN.md §4-5

   planStudioCanvasV2GroupMove(ids, dx, dy)

     -> { ok: true, steps: [{ writer, id, next, expected }, …] }
     -> { ok: false, reason, id? }

   `dx` · `dy` 는 **도화지 자**의 공통 delta 하나다(프레임이 보고한
   그 값). 멤버마다 하는 일은 넷이다.

     1  그 멤버의 자와 지금 값을 읽는다(studioCanvasV2Space)
     2  공통 delta 를 그 자의 delta 로 바꾼다  d / unitScale
     3  자 위의 새 값을 계획으로 바꾼다(planStudioCanvasV2Transform)
     4  전부 성공한 **뒤에** 부르는 쪽이 한 번에 적용한다

   ★ 좌표 수식을 새로 만들지 않는다. 자를 만드는 곳도(§26-3),
     자 위의 값을 storage 칸으로 옮기는 곳도(§26-4) 이미 하나씩
     있고, 여기서는 그 둘을 멤버 수만큼 부를 뿐이다. `pin` 멤버가
     `pin.offset` 을 쓰는 것도 그 번역이 이미 안다.

   ★ **하나라도 실패하면 전부 실패다.** 계획을 다 만든 뒤에야
     돌려주므로, 부르는 쪽은 "절반만 옮겨진 그룹"을 볼 수 없다
     (계약 §39-6).

   ★ 반올림은 **저장 직전 한 번**이다. 나누고 더하는 동안에는 배정도
     그대로 두고, 자 위의 최종 값에만 좌표의 자릿수 규칙을 쓴다
     (studioCanvasV2Round — 소수 셋째 자리). 멤버끼리의 상대 자리가
     그 반올림으로 흔들리는 폭은 도화지 자로 0.001 미만이다.
========================================================== */

function planStudioCanvasV2GroupMove(ids, dx, dy) {

  if (!Array.isArray(ids) || !ids.length) {
    return { ok: false, reason: "members" };
  }

  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { ok: false, reason: "delta" };
  }

  const steps =
    [];

  for (let i = 0; i < ids.length; i += 1) {

    const id =
      ids[i];

    const space =
      studioCanvasV2Space(id);

    if (!space) {
      return { ok: false, reason: "space", id: id };
    }

    /* 블록 · 좌표가 없는 노드는 애초에 그룹이 될 수 없다(§38-2).
       그래도 여기서 한 번 더 본다 — 0 으로 나누지 않기 위해서다. */
    if (!Number.isFinite(space.unitScale) || !(space.unitScale > 0)) {
      return { ok: false, reason: "scale", id: id };
    }

    if (!Number.isFinite(space.x) || !Number.isFinite(space.y)) {
      return { ok: false, reason: "space", id: id };
    }

    const next = {
      x: studioCanvasV2Round(space.x + (dx / space.unitScale)),
      y: studioCanvasV2Round(space.y + (dy / space.unitScale))
    };

    const plan =
      planStudioCanvasV2Transform(
        "v2-move", id, next, { x: space.x, y: space.y });

    if (!plan || !plan.ok) {
      return { ok: false, reason: (plan && plan.reason) || "plan", id: id };
    }

    steps.push({
      writer: plan.writer,
      id: id,
      next: plan.next,
      expected: plan.expected
    });

  }

  return { ok: true, steps: steps };

}



/* =========================================================
   HOME-CANVAS-GROUP-1C — 그룹 전체 크기 조절 · 회전의 **계획 한 벌**

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §40
   설계:      docs/plans/IMORY_HOME_CANVAS_GROUP_DESIGN.md §4-6 · §4-7

   ── 기준점은 어떻게 저장 좌표가 되는가 ─────────────────

   프레임은 저장 좌표계의 원점을 모른다(프레임 안 요소는 프레임의
   원점을 쓴다 — §26-2). 그래서 기준점 자체를 보내지 않고, 멤버마다
   **차이 벡터**를 보낸다. 그 벡터에는 원점이 지워져 있다.

     v(m) = (그 멤버의 기준 점 − anchor)        도화지 자

   한 그룹의 멤버는 전부 **같은 좌표 공간**이므로(계약 §38-2) 자기
   자 위의 값에 `unitScale` 을 곱하면 원점이 같은 한 자 위로 모인다.
   그래서 보고된 멤버 하나로 기준점을 되짚을 수 있다.

     A = space.x × unitScale − v.x            (y 도 같다)

   되짚은 A 를 멤버마다 자기 자로 나누면 그 멤버의 고정점이다. 이
   한 점을 **모든 멤버가 공유**하므로 상대 배치와 비율이 흔들리지
   않고, 화면에 없는 **숨은 멤버**도 같은 식으로 옮겨진다(계약
   §40-6).

   ── 크기 조절 ─────────────────────────────────────────

     x' = A + s(x − A)        w' = w × s        h' = h × s
     rotation 그대로          "auto" 는 "auto" 그대로

   ★ `pin` 멤버도 **같은 한 줄**이다. 그 요소의 `x` 는 상자의 왼쪽
     위가 아니라 `origin` 이 놓일 자리이지만(§24-4), 균등 배율은
     아핀 변환이라 상자 위의 어느 점이든 같은 식을 따른다 —
     `origin` 항이 양변에서 지워진다.

   ── 회전 ──────────────────────────────────────────────

     c' = P + R(θ)(c − P)     Δ = c' − c
     x' = x + Δ               rotation' = normalize(rotation + θ)
     크기는 한 칸도 바뀌지 않는다

   ★ 여기서만 **중심**이 필요하고, 중심에는 세로 길이가 필요하다.
     `height:"auto"` 인 멤버의 그 길이는 저장값이 줄 수 없어 프레임이
     잰 값을 쓴다(보고의 `h`). 화면에 없는 숨은 멤버가 `"auto"` 면
     잰 값도 없으므로 **그 그룹은 회전하지 않는다**(§40-6).
========================================================== */

/* 단일 리사이즈의 바닥과 같은 값이다(editor-runtime 의
   CANVAS_MIN_SIZE). 그보다 작게 줄지 않는다. */
const STUDIO_CANVAS_GROUP_MIN_SIZE = 1;


function studioCanvasGroupMaxCoord() {

  return (typeof window.SKIN_HOME_CANVAS_MAX_COORD === "number" &&
    window.SKIN_HOME_CANVAS_MAX_COORD > 0)
    ? window.SKIN_HOME_CANVAS_MAX_COORD
    : 100000;

}


/*
  studioCanvasV2GroupScaleRange(ids) -> { min, max } | null

  멤버 **전부가 가능한** 공통 배율의 교집합이다(계약 §40-7).

  ★ 멤버마다 따로 자르지 않는 이유가 여기 있다. 하나가 바닥에
    닿았다고 그 멤버만 멈추면 그룹의 상대 배치와 비율이 그 순간
    깨진다. 그래서 **구간을 먼저 겹쳐** 하나로 만들고, 화면이 그
    범위 안에서만 배율을 만든다.

  ★ `"auto"` 높이는 배율을 받지 않으므로(가로만 받는다 — §4-6)
    세로 쪽 제한도 만들지 않는다.
*/
function studioCanvasV2GroupScaleRange(ids) {

  if (!Array.isArray(ids) || !ids.length) {
    return null;
  }

  const max =
    studioCanvasGroupMaxCoord();

  let lo = 0;
  let hi = Infinity;

  for (let i = 0; i < ids.length; i += 1) {

    const space =
      studioCanvasV2Space(ids[i]);

    if (!space) {
      return null;
    }

    const sides =
      [space.width].concat(
        (typeof space.height === "number" && Number.isFinite(space.height))
          ? [space.height]
          : []
      );

    for (let k = 0; k < sides.length; k += 1) {

      const side =
        sides[k];

      if (!Number.isFinite(side) || !(side > 0)) {
        return null;
      }

      lo = Math.max(lo, STUDIO_CANVAS_GROUP_MIN_SIZE / side);
      hi = Math.min(hi, max / side);

    }

  }

  if (!(lo > 0) || !Number.isFinite(hi) || !(hi >= lo)) {
    return null;
  }

  return { min: lo, max: hi };

}


/*
  studioCanvasV2GroupCanRotate(ids) -> boolean

  회전은 멤버마다 **중심**이 필요하고, 화면에 없는 멤버의 중심은
  저장값만으로 낼 수 없다(`height:"auto"`). 그런 멤버가 하나라도
  있으면 회전 손잡이를 아예 그리지 않는다 — 시작을 막고 이유를
  남기는 편이, 끝에서 통째로 되돌리는 것보다 낫다.
*/
function studioCanvasV2GroupCanRotate(ids, hiddenIds) {

  if (!Array.isArray(ids) || !ids.length) {
    return false;
  }

  const hidden =
    Array.isArray(hiddenIds) ? hiddenIds : [];

  for (let i = 0; i < ids.length; i += 1) {

    const space =
      studioCanvasV2Space(ids[i]);

    if (!space) {
      return false;
    }

    if (
      hidden.indexOf(ids[i]) !== -1 &&
      !(typeof space.height === "number" && Number.isFinite(space.height))
    ) {
      return false;
    }

  }

  return true;

}


/* 보고된 멤버 한 줄을 id 로 찾는 표 — 모양은 이미 두 관문이 봤다 */
function studioCanvasGroupReportMap(members) {

  const map =
    {};

  if (!Array.isArray(members)) {
    return map;
  }

  members.forEach(
    (item) => {

      if (
        !item || typeof item !== "object" ||
        typeof item.id !== "string" || !item.id ||
        !Number.isFinite(item.vx) || !Number.isFinite(item.vy) ||
        !Number.isFinite(item.h)
      ) {
        return;
      }

      map[item.id] = { vx: item.vx, vy: item.vy, h: item.h };

    }
  );

  return map;

}


/* 그 멤버의 지금 세로 길이(자기 자). 숫자면 저장값, `"auto"` 면
   프레임이 잰 값이다. 둘 다 없으면 null 이다. */
function studioCanvasGroupHeightOf(space, report) {

  if (typeof space.height === "number" && Number.isFinite(space.height)) {
    return space.height;
  }

  if (report && Number.isFinite(report.h) && space.unitScale > 0) {
    return report.h / space.unitScale;
  }

  return null;

}


/*
  그 멤버의 상자 정중앙(자기 자).

  ★ `pin` 은 `x` 가 `origin` 이 놓일 자리다 — 중심은 그 점에서
    `(0.5 − origin) × 크기` 만큼 떨어져 있다(§24-4). overlay 와
    `transform` 은 origin 이 0 이라 이 식이 `x + w/2` 로 줄어든다.
*/
function studioCanvasGroupCenterOf(space, height) {

  return {
    x: space.x + (0.5 - space.originX) * space.width,
    y: space.y + (0.5 - space.originY) * height
  };

}


/*
  planStudioCanvasV2GroupResize(ids, scale, members)

    -> { ok:true, steps:[…] } | { ok:false, reason, id? }

  `ids` 는 옮길 멤버 전부(숨은 멤버 포함 — 부모의 `live`),
  `members` 는 프레임이 보고한 줄(보이는 멤버만)이다.
*/
function planStudioCanvasV2GroupResize(ids, scale, members) {

  if (!Array.isArray(ids) || !ids.length) {
    return { ok: false, reason: "members" };
  }

  if (!Number.isFinite(scale) || !(scale > 0)) {
    return { ok: false, reason: "scale" };
  }

  const report =
    studioCanvasGroupReportMap(members);

  /* ── 기준점을 되짚는다 — 보고된 **첫 멤버** 하나로 ── */

  const anchor =
    studioCanvasGroupAnchorFrom(
      ids, report, (space) => ({ x: space.x, y: space.y }));

  if (!anchor) {
    return { ok: false, reason: "anchor" };
  }

  const steps =
    [];

  for (let i = 0; i < ids.length; i += 1) {

    const id =
      ids[i];

    const space =
      studioCanvasV2Space(id);

    if (!space) {
      return { ok: false, reason: "space", id: id };
    }

    if (!Number.isFinite(space.unitScale) || !(space.unitScale > 0)) {
      return { ok: false, reason: "scale", id: id };
    }

    if (
      !Number.isFinite(space.x) || !Number.isFinite(space.y) ||
      !Number.isFinite(space.width) || !(space.width > 0)
    ) {
      return { ok: false, reason: "space", id: id };
    }

    /* 그 멤버의 자 위의 고정점 */
    const ax =
      anchor.x / space.unitScale;

    const ay =
      anchor.y / space.unitScale;

    const auto =
      !(typeof space.height === "number" && Number.isFinite(space.height));

    const next = {
      x: studioCanvasV2Round(ax + (space.x - ax) * scale),
      y: studioCanvasV2Round(ay + (space.y - ay) * scale),
      width: studioCanvasV2Round(space.width * scale),

      /* ★ `"auto"` 는 `"auto"` 로 남는다 — 가로만 배율을 받고
         세로는 계속 내용이 정한다(계약 §40-4). 조용히 숫자로
         굳히지 않는다. */
      height: auto ? space.height : studioCanvasV2Round(space.height * scale)
    };

    const plan =
      planStudioCanvasV2Transform(
        "v2-resize", id, next,
        {
          x: space.x,
          y: space.y,
          width: space.width,
          height: space.height
        });

    if (!plan || !plan.ok) {
      return { ok: false, reason: (plan && plan.reason) || "plan", id: id };
    }

    steps.push({
      writer: plan.writer,
      id: id,
      next: plan.next,
      expected: plan.expected
    });

  }

  return { ok: true, steps: steps };

}


/*
  기준점 되짚기 — 보고된 멤버 중 **명단에서 가장 앞선 하나**를 쓴다.

  ★ 어느 멤버로 되짚어도 같은 점이 나온다(위 머리말의 그 식). 순서를
    못박는 이유는 답이 달라져서가 아니라, 같은 입력이 언제나 같은
    결과를 내야 하기 때문이다.
*/
function studioCanvasGroupAnchorFrom(ids, report, pointOf) {

  for (let i = 0; i < ids.length; i += 1) {

    const hit =
      Object.prototype.hasOwnProperty.call(report, ids[i])
        ? report[ids[i]]
        : null;

    if (!hit) {
      continue;
    }

    const space =
      studioCanvasV2Space(ids[i]);

    if (!space || !Number.isFinite(space.unitScale) || !(space.unitScale > 0)) {
      continue;
    }

    const point =
      pointOf(space, hit);

    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }

    return {
      x: point.x * space.unitScale - hit.vx,
      y: point.y * space.unitScale - hit.vy
    };

  }

  return null;

}


/*
  planStudioCanvasV2GroupRotate(ids, angle, members)

    -> { ok:true, steps:[…] } | { ok:false, reason, id? }

  한 멤버가 **두 칸**을 바꾼다 — 자리와 각도. 둘은 서로 다른 칸이라
  같은 묶음에 나란히 넣어도 서로의 `expected` 를 깨지 않는다.
*/
function planStudioCanvasV2GroupRotate(ids, angle, members) {

  if (!Array.isArray(ids) || !ids.length) {
    return { ok: false, reason: "members" };
  }

  if (!Number.isFinite(angle)) {
    return { ok: false, reason: "angle" };
  }

  const report =
    studioCanvasGroupReportMap(members);

  const pivot =
    studioCanvasGroupAnchorFrom(
      ids, report,
      (space, hit) => {

        const height =
          studioCanvasGroupHeightOf(space, hit);

        return (height === null)
          ? null
          : studioCanvasGroupCenterOf(space, height);

      }
    );

  if (!pivot) {
    return { ok: false, reason: "pivot" };
  }

  const rad =
    angle * Math.PI / 180;

  const cos =
    Math.cos(rad);

  const sin =
    Math.sin(rad);

  const steps =
    [];

  for (let i = 0; i < ids.length; i += 1) {

    const id =
      ids[i];

    const space =
      studioCanvasV2Space(id);

    if (!space) {
      return { ok: false, reason: "space", id: id };
    }

    if (!Number.isFinite(space.unitScale) || !(space.unitScale > 0)) {
      return { ok: false, reason: "scale", id: id };
    }

    const height =
      studioCanvasGroupHeightOf(
        space,
        Object.prototype.hasOwnProperty.call(report, id) ? report[id] : null
      );

    /* 화면에 없는 `"auto"` 멤버다 — 중심을 지어내지 않는다(§40-6) */
    if (height === null) {
      return { ok: false, reason: "auto-height", id: id };
    }

    const center =
      studioCanvasGroupCenterOf(space, height);

    /* 도화지 자 위에서 피벗 둘레로 돈다 */
    const vx =
      center.x * space.unitScale - pivot.x;

    const vy =
      center.y * space.unitScale - pivot.y;

    const dx =
      (vx * cos - vy * sin) - vx;

    const dy =
      (vx * sin + vy * cos) - vy;

    const next = {
      x: studioCanvasV2Round(space.x + dx / space.unitScale),
      y: studioCanvasV2Round(space.y + dy / space.unitScale)
    };

    const move =
      planStudioCanvasV2Transform(
        "v2-move", id, next, { x: space.x, y: space.y });

    if (!move || !move.ok) {
      return { ok: false, reason: (move && move.reason) || "plan", id: id };
    }

    steps.push({
      writer: move.writer,
      id: id,
      next: move.next,
      expected: move.expected
    });

    /* 각도는 지금까지의 그 규칙 그대로 접는다(0 ≤ deg < 360) */
    const rotation =
      studioCanvasV2Round(
        (typeof window.normalizeSkinHomeCanvasRotation === "function")
          ? window.normalizeSkinHomeCanvasRotation(space.rotation + angle)
          : ((space.rotation + angle) % 360 + 360) % 360
      );

    const turn =
      planStudioCanvasV2Transform(
        "v2-rotate", id, { rotation: rotation }, { rotation: space.rotation });

    if (!turn || !turn.ok) {
      return { ok: false, reason: (turn && turn.reason) || "plan", id: id };
    }

    steps.push({
      writer: turn.writer,
      id: id,
      next: turn.next,
      expected: turn.expected
    });

  }

  return { ok: true, steps: steps };

}


if (typeof window !== "undefined") {

  window.STUDIO_CANVAS_V2_SPACE_KINDS = STUDIO_CANVAS_V2_SPACE_KINDS;
  window.studioCanvasV2Space = studioCanvasV2Space;
  window.planStudioCanvasV2Transform = planStudioCanvasV2Transform;

  /* HOME-CANVAS-GROUP-1B */
  window.planStudioCanvasV2GroupMove = planStudioCanvasV2GroupMove;

  /* HOME-CANVAS-GROUP-1C */
  window.planStudioCanvasV2GroupResize = planStudioCanvasV2GroupResize;
  window.planStudioCanvasV2GroupRotate = planStudioCanvasV2GroupRotate;
  window.studioCanvasV2GroupScaleRange = studioCanvasV2GroupScaleRange;
  window.studioCanvasV2GroupCanRotate = studioCanvasV2GroupCanRotate;

  /* HOME-CANVAS-V2-ELEMENTS-1 — 소속과 따라가기 */
  window.setStudioCanvasFrameLayout = setStudioCanvasFrameLayout;
  window.studioCanvasV2FrameOrigin = studioCanvasV2FrameOrigin;
  window.planStudioCanvasV2Attach = planStudioCanvasV2Attach;
  window.planStudioCanvasV2Detach = planStudioCanvasV2Detach;
  window.planStudioCanvasV2Follow = planStudioCanvasV2Follow;
  window.planStudioCanvasV2Pin = planStudioCanvasV2Pin;

  /* HOME-CANVAS-V2-MANUAL-FIX-1 — 블록이 화면에서 갖는 높이 ·
     고른 요소가 물려받고 있는 모양 */
  window.studioCanvasV2MeasuredHeight = studioCanvasV2MeasuredHeight;
  window.studioCanvasV2NodeLook = studioCanvasV2NodeLook;

  /* 진단 · 테스트가 보는 한 줄 */
  window.getStudioCanvasFrameLayout =
    () => JSON.parse(JSON.stringify(studioCanvasV2FrameLayout));

  window.getStudioCanvasBlockLayout =
    () => JSON.parse(JSON.stringify(studioCanvasV2BlockLayout));

  /* STUDIO-LAYERS-MATERIALS-1B — 끌어다 놓을 자리(계약 §36-5) */
  window.setStudioCanvasBoxes = setStudioCanvasBoxes;
  window.studioCanvasBoxesSnapshot = studioCanvasBoxesSnapshot;
  window.studioCanvasPointToCanvas = studioCanvasPointToCanvas;
  window.studioCanvasPointToFrame = studioCanvasPointToFrame;
  window.studioCanvasFlowInsertIndex = studioCanvasFlowInsertIndex;

  window.getStudioCanvasBoxes =
    () => JSON.parse(JSON.stringify(studioCanvasBoxes));

}
