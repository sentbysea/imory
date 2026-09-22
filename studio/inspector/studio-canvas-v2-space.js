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


if (typeof window !== "undefined") {

  window.STUDIO_CANVAS_V2_SPACE_KINDS = STUDIO_CANVAS_V2_SPACE_KINDS;
  window.studioCanvasV2Space = studioCanvasV2Space;
  window.planStudioCanvasV2Transform = planStudioCanvasV2Transform;

}
