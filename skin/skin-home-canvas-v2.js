/* =========================================================
   SKIN HOME CANVAS — v2(조합형) Canvas 의 **데이터 검증**
   (HOME-CANVAS-V2-DATA-1 · CODE-SPLIT-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14 (PLAN)

   skin/skin-home-canvas.js 에서 **줄만 옮겨 온** 파일이다 — 판정도
   오류 문구도 그대로다(CODE-SPLIT-1).

   여기 있는 것

     v2 의 값 표(블록 종류 · 정렬 · 흐름 방향 · 모서리 · pin)
     flow · block · main_visual · 프레임 내부 요소 · pin · overlays 검증
     v2 전용 오류 경로

   여기 없는 것

     v1 요소 판정 · 작은 도구 · 오류 객체 — 전부
     skin/skin-home-canvas.js 것을 그대로 부른다. v2 가 v1 과 뜻이
     같은 칸에 **같은 자**를 쓴다는 것이 §14-4 이고, 그 자를 두 벌
     만들지 않는 것이 이 파일이 얇은 이유다.

   ★ 이 파일은 skin/skin-home-canvas.js **다음에** 로드된다. 그
     파일의 version 분기 한 줄(validateSkinCanvasData)이 여기의
     validateSkinCanvasV2Data 를 부르고, 반대로 여기서는 그 파일의
     공용 판정만 부른다.

   ★ 통과해도 **그려지지 않는다**. renderable:false 이므로 실행
     payload 가 만들어지지 않고 화면은 기존 HOME 이다 — v2 렌더러는
     후속 작업이다(V2-FLOW-RENDER-1).
========================================================== */

/* =========================================================
   v2 — 조합형 Canvas의 값 표 (HOME-CANVAS-V2-DATA-1)

   로드맵 §14 가 정한 모양이다. 이 라운드는 **데이터만** 안다 —
   v2 를 그리는 DOM 도 CSS 도 Studio 패널도 없다. 유효한 v2 도
   실행용 payload 를 만들지 않으므로 화면은 기존 HOME 이다(§3 의
   fallback 표). 그래서 아래 목록은 **검증기만** 쓴다.

     v1  평면 자유 Canvas — `canvas.elements` 하나
     v2  두 층 — `canvas.flow.blocks`(자동 배치) + `canvas.overlays`(자유)

   v1 과 뜻이 같은 칸은 **같은 이름 · 같은 값 표 · 같은 자**를 쓴다
   (§14-4). 좌표 · 크기 상한도 v1 의 그것 하나다 — v2 용으로 새
   범위를 만들지 않는다.
========================================================== */

/* 조합형 Canvas 의 version. 이 배포는 **보존하고 검증만** 한다. */
const SKIN_HOME_CANVAS_V2_VERSION = 2;

/* 자동 배치 블록 종류 — v2 첫 범위는 이 다섯이다(§14-4) */
const SKIN_HOME_CANVAS_BLOCK_TYPES =
  ["logo", "category_nav", "text", "divider", "main_visual"];

/*
  블록 height 에 "auto" 를 쓸 수 있는 종류(§14-4) — `logo` 만 양수다.
  v1 의 표(text · category_nav)와 **다른 표다**: 흐름 안에서는
  `divider` 와 `main_visual` 도 높이를 내용에 맡길 수 있다.
*/
const SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES =
  ["text", "category_nav", "divider", "main_visual"];

/*
  블록의 가로 정렬(§14-4).

  ★ 이름 함정. skin/skin-layout.js 의 배치 primitive 에도 `align` 이
    있지만 값이 start · center · end · stretch · baseline 이고
    **교차축**을 뜻한다. 그쪽은 스킨 템플릿의 HTML 속성 층이고
    이쪽은 Canvas JSON 이다 — 두 값 표를 섞지 않는다.
*/
const SKIN_HOME_CANVAS_BLOCK_ALIGNS = ["left", "center", "right", "stretch"];

/* v2 첫 범위는 세로 흐름 하나다(§14-12). row · grid 는 후속이다. */
const SKIN_HOME_CANVAS_FLOW_DIRECTIONS = ["column"];

/* padding · margin 의 네 칸 */
const SKIN_HOME_CANVAS_EDGES = ["top", "right", "bottom", "left"];

/* main_visual 내부 요소 — 프레임이 커질 때 무엇을 따라가나(§14-6) */
const SKIN_HOME_CANVAS_FOLLOW_MODES = ["transform", "pin"];

/* pin.target — `photo` 는 primaryId 요소의 상자다 */
const SKIN_HOME_CANVAS_PIN_TARGETS = ["frame", "photo"];

/* pin.anchor · pin.origin — 아홉 점 */
const SKIN_HOME_CANVAS_PIN_POINTS = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right"
];
/* =========================================================
   2-1. v2 검증 — 조합형 Canvas (HOME-CANVAS-V2-DATA-1)

   로드맵 §14 를 그대로 옮긴 것이다. **새 판단을 덧붙이지 않는다** —
   §14 가 말하지 않는 칸에 v2 전용 제한을 새로 만들지 않고, 범위가
   필요한 자리에서는 v1 이 이미 쓰는 자(좌표 ±100000 · 크기 0 초과
   100000 이하 · 요소 수 200)를 그대로 빌려 쓴다.

   ★ 통과해도 **실행되지 않는다**. validateSkinCanvasData 가 v2 에
     `renderable:false` 를 붙이므로 buildSkinCanvasRenderPayload 가
     undefined 를 주고 기존 HOME 이 그려진다(§3 fallback). 이 라운드는
     "파일이 올바른가"만 말한다.

   ★ 필수와 선택을 가르는 자는 v1 §5 의 그것이다 — **안전한 기본값이
     하나뿐인 칸은 선택**(빠진 것과 기본값을 적은 것이 같은 뜻),
     그렇지 않은 칸은 필수. 그래서 `flow.direction` · `padding` ·
     `gap` · `align` · `margin` · `maxWidth` · `hidden` · `locked` ·
     `follow` · `pin` · `overlays` 는 선택이고, 블록의 `id` · `type` ·
     `width` · `height` 와 `flow.blocks` 는 필수다.

   ★ `flow` 는 필수다 — 그 칸이 있다는 것 자체가 "이 canvas 는 v2 다"
     의 근거이고(§14-9 함정 2 의 elements ↔ flow 판정이 거기에 기댄다),
     빠진 것을 빈 흐름으로 읽으면 v1 을 v2 로 잘못 적은 파일이 조용히
     통과한다.
========================================================== */

/*
  padding · margin 의 네 칸. 각 칸 선택이고 빠지면 0 이다.

  ★ **음수를 허용한다**(§14-4 — 일부러 겹치기 위해). 자는 v1 의
    좌표 자를 그대로 쓴다.
*/
function validateSkinCanvasEdges(value, path) {

  if (value === undefined) {
    return { ok: true };
  }

  if (!isSkinHomeCanvasPlainObject(value)) {
    return skinHomeCanvasFail(
      path,
      "top · right · bottom · left 를 담은 객체({...})여야 합니다."
    );
  }

  for (const edge of SKIN_HOME_CANVAS_EDGES) {

    if (value[edge] === undefined) {
      continue;
    }

    if (!isSkinHomeCanvasCoord(value[edge])) {
      return skinHomeCanvasFail(
        `${path}.${edge}`,
        `${edge}는 ±${SKIN_HOME_CANVAS_MAX_COORD} 안의 유한한 숫자여야 합니다(음수도 허용).`
      );
    }

  }

  return { ok: true };

}


/*
  pin — 프레임(또는 primary 사진)의 어느 점에, 자기 어느 점을 놓나
  (§14-6). 네 칸 전부 선택이고 기본값은 frame · center · center ·
  {x:0,y:0} 다.
*/
function validateSkinCanvasPin(pin, path) {

  if (!isSkinHomeCanvasPlainObject(pin)) {
    return skinHomeCanvasFail(path, "pin은 객체({...})여야 합니다.");
  }

  if (
    pin.target !== undefined &&
    SKIN_HOME_CANVAS_PIN_TARGETS.indexOf(pin.target) === -1
  ) {
    return skinHomeCanvasFail(
      `${path}.target`,
      `target은 ${SKIN_HOME_CANVAS_PIN_TARGETS.join(" · ")} 중 하나여야 합니다.`
    );
  }

  for (const key of ["anchor", "origin"]) {

    if (pin[key] === undefined) {
      continue;
    }

    if (SKIN_HOME_CANVAS_PIN_POINTS.indexOf(pin[key]) === -1) {
      return skinHomeCanvasFail(
        `${path}.${key}`,
        `${key}는 ${SKIN_HOME_CANVAS_PIN_POINTS.join(" · ")} 중 하나여야 합니다.`
      );
    }

  }

  if (pin.offset !== undefined) {

    if (!isSkinHomeCanvasPlainObject(pin.offset)) {
      return skinHomeCanvasFail(`${path}.offset`, "offset은 { x, y } 객체여야 합니다.");
    }

    for (const axis of ["x", "y"]) {

      if (pin.offset[axis] === undefined) {
        continue;
      }

      if (!isSkinHomeCanvasCoord(pin.offset[axis])) {
        return skinHomeCanvasFail(
          `${path}.offset.${axis}`,
          `${axis}는 ±${SKIN_HOME_CANVAS_MAX_COORD} 안의 유한한 숫자여야 합니다(음수도 허용).`
        );
      }

    }

  }

  return { ok: true };

}


/*
  main_visual 내부의 자유 요소 하나(§14-5 · §14-6).

  **v1 요소 하나와 같은 모양**에 `follow` 와 `pin` 두 칸이 더 있다 —
  그래서 판정도 v1 의 그 함수를 그대로 부른다.

  ★ 중첩 금지. v2 첫 범위는 프레임 **한 단계**다(§14-12) — 내부
    요소가 될 수 있는 것은 v1 의 여섯 종류이고, `main_visual` 과
    `container` 는 그 목록에 없다. 목록에 없다는 것만으로도 거부되지만
    이유를 읽을 수 있게 문구를 따로 준다.

  ★ 안 쓰는 칸을 요구하지도 지우지도 않는다(§14-6). `follow:"pin"` 은
    x · y 없이도 유효하고, `follow:"transform"` 은 pin 없이도 유효하며,
    둘 다 적혀 있으면 **둘 다 모양이 맞아야** 한다 — 토글해도 잃지
    않는 칸이 깨진 채로 저장되게 두지 않는다.
*/
function validateSkinCanvasFrameElement(element, path, seen) {

  if (!isSkinHomeCanvasPlainObject(element)) {
    return skinHomeCanvasFail(path, "프레임 내부 요소는 객체({...})여야 합니다.");
  }

  if (element.type === "main_visual" || element.type === "container") {
    return skinHomeCanvasFail(
      `${path}.type`,
      `main_visual 안에 ${element.type}을(를) 다시 넣을 수 없습니다(v2 첫 범위는 프레임 한 단계입니다).`
    );
  }

  const follow =
    element.follow === undefined ? "transform" : element.follow;

  if (SKIN_HOME_CANVAS_FOLLOW_MODES.indexOf(follow) === -1) {
    return skinHomeCanvasFail(
      `${path}.follow`,
      `follow는 ${SKIN_HOME_CANVAS_FOLLOW_MODES.join(" · ")} 중 하나여야 합니다.`
    );
  }

  const base =
    validateSkinCanvasElement(
      element,
      path,
      { seen: seen, requireXY: follow === "transform" }
    );

  if (!base.ok) {
    return base;
  }

  if (element.pin !== undefined) {

    const pin =
      validateSkinCanvasPin(element.pin, `${path}.pin`);

    if (!pin.ok) {
      return pin;
    }

  }

  return { ok: true };

}


/*
  main_visual 의 props — 사진 한 장이 아니라 편집 프레임 하나(§14-5).

  ★ elements 를 **먼저** 다 본 뒤에 primaryId 를 본다. 내부 요소가
    깨져 있는데 "primaryId 를 찾을 수 없습니다"를 먼저 말하면 주인이
    엉뚱한 칸을 고치게 된다.
*/
function validateSkinCanvasMainVisualProps(props, path, seen) {

  for (const key of ["baseWidth", "baseHeight"]) {
    if (!isSkinHomeCanvasSize(props[key])) {
      return skinHomeCanvasFail(
        `${path}.${key}`,
        `${key}는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다(프레임 내부 좌표의 자 — 블록의 width 와 다릅니다).`
      );
    }
  }

  if (!Array.isArray(props.elements)) {
    return skinHomeCanvasFail(`${path}.elements`, "elements는 배열이어야 합니다.");
  }

  if (props.elements.length === 0) {
    return skinHomeCanvasFail(
      `${path}.elements`,
      "elements는 비어 있을 수 없습니다(최소한 primary 사진 하나)."
    );
  }

  if (props.elements.length > SKIN_HOME_CANVAS_MAX_ELEMENTS) {
    return skinHomeCanvasFail(
      `${path}.elements`,
      `프레임 내부 요소는 ${SKIN_HOME_CANVAS_MAX_ELEMENTS}개를 넘을 수 없습니다.`
    );
  }

  for (let i = 0; i < props.elements.length; i++) {

    const result =
      validateSkinCanvasFrameElement(props.elements[i], `${path}.elements[${i}]`, seen);

    if (!result.ok) {
      return result;
    }

  }

  if (typeof props.primaryId !== "string" || !props.primaryId) {
    return skinHomeCanvasFail(
      `${path}.primaryId`,
      "primaryId(기준이 되는 사진 요소의 id)가 필요합니다."
    );
  }

  const primary =
    props.elements.filter(
      (item) =>
        isSkinHomeCanvasPlainObject(item) && item.id === props.primaryId
    );

  if (primary.length !== 1) {
    return skinHomeCanvasFail(
      `${path}.primaryId`,
      `primaryId "${props.primaryId}"를 이 프레임의 elements 에서 찾을 수 없습니다.`
    );
  }

  if (primary[0].type !== "photo") {
    return skinHomeCanvasFail(
      `${path}.primaryId`,
      `primaryId가 가리키는 요소는 type이 "photo"여야 합니다(지금은 "${primary[0].type}").`
    );
  }

  if (primary[0].hidden === true) {
    return skinHomeCanvasFail(
      `${path}.primaryId`,
      "primaryId가 가리키는 요소는 hidden일 수 없습니다."
    );
  }

  return { ok: true };

}


/*
  블록 종류별 props(§14-4 의 표).

  logo · category_nav · text 는 **v1 과 같은 표**를 쓴다 — 같은 의미의
  칸을 두 벌 만들지 않는다. divider 는 props 가 없고, main_visual 만
  v2 의 새 모양이다.
*/
function validateSkinCanvasBlockProps(type, props, path, seen) {

  if (type === "divider") {
    return { ok: true };
  }

  if (type === "main_visual") {
    return validateSkinCanvasMainVisualProps(props, path, seen);
  }

  return validateSkinCanvasElementProps(type, props, path);

}


/*
  자동 배치 블록 하나(§14-4).

  ★ 블록에는 x · y · rotation 이 없다 — 위치는 순서 · align · margin
    이 정한다(§14-10 의 책임 표). 그래도 그런 칸이 적혀 있다고 거부
    하지는 않는다: **모르는 칸은 보존**이 v1 부터의 규칙이다(§9).
*/
function validateSkinCanvasBlock(block, path, seen) {

  if (!isSkinHomeCanvasPlainObject(block)) {
    return skinHomeCanvasFail(path, "자동 배치 블록은 객체({...})여야 합니다.");
  }

  /* type — props 판정이 여기에 달려 있으므로 먼저 본다(v1 과 같은 순서) */
  if (SKIN_HOME_CANVAS_BLOCK_TYPES.indexOf(block.type) === -1) {
    return skinHomeCanvasFail(
      `${path}.type`,
      `type은 ${SKIN_HOME_CANVAS_BLOCK_TYPES.join(" · ")} 중 하나여야 합니다.`
    );
  }

  const type = block.type;

  const idResult =
    validateSkinCanvasId(block.id, `${path}.id`, seen);

  if (!idResult.ok) {
    return idResult;
  }

  /* width — **"auto" 는 없다.** 가용 폭 전부는 align:"stretch" 가 뜻한다 */
  if (!isSkinHomeCanvasSize(block.width)) {
    return skinHomeCanvasFail(
      `${path}.width`,
      `width는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다("auto"는 없습니다 — 가용 폭 전부는 align "stretch"가 뜻합니다).`
    );
  }

  const autoAllowed =
    SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES.indexOf(type) !== -1;

  if (block.height === SKIN_HOME_CANVAS_AUTO_HEIGHT) {

    if (!autoAllowed) {
      return skinHomeCanvasFail(
        `${path}.height`,
        `height "auto"는 ${SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES.join(" · ")} 블록에서만 쓸 수 있습니다.`
      );
    }

  } else if (!isSkinHomeCanvasSize(block.height)) {

    return skinHomeCanvasFail(
      `${path}.height`,
      autoAllowed
        ? `height는 0보다 큰 숫자이거나 "auto"여야 합니다.`
        : `height는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다.`
    );

  }

  if (
    block.align !== undefined &&
    SKIN_HOME_CANVAS_BLOCK_ALIGNS.indexOf(block.align) === -1
  ) {
    return skinHomeCanvasFail(
      `${path}.align`,
      `align은 ${SKIN_HOME_CANVAS_BLOCK_ALIGNS.join(" · ")} 중 하나여야 합니다.`
    );
  }

  const margin =
    validateSkinCanvasEdges(block.margin, `${path}.margin`);

  if (!margin.ok) {
    return margin;
  }

  /* maxWidth — align:"stretch" 일 때만 뜻이 있지만, 저장은 언제나 남는다 */
  if (block.maxWidth !== undefined && !isSkinHomeCanvasSize(block.maxWidth)) {
    return skinHomeCanvasFail(
      `${path}.maxWidth`,
      `maxWidth는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다.`
    );
  }

  for (const flag of ["hidden", "locked"]) {
    if (block[flag] !== undefined && typeof block[flag] !== "boolean") {
      return skinHomeCanvasFail(`${path}.${flag}`, `${flag}는 true 또는 false여야 합니다.`);
    }
  }

  if (block.props !== undefined && !isSkinHomeCanvasPlainObject(block.props)) {
    return skinHomeCanvasFail(`${path}.props`, "props는 객체({...})여야 합니다.");
  }

  const props =
    isSkinHomeCanvasPlainObject(block.props) ? block.props : {};

  return validateSkinCanvasBlockProps(type, props, `${path}.props`, seen);

}


/*
  flow — 위에서 아래로 흐르는 층(§14-3 · §14-4).

  ★ gap 과 padding 에 음수 제한을 새로 만들지 않는다. §14 가 말하지
    않은 것을 여기서 정하지 않고, v1 의 좌표 자만 씌운다.
*/
function validateSkinCanvasFlow(flow, path, seen) {

  if (!isSkinHomeCanvasPlainObject(flow)) {
    return skinHomeCanvasFail(path, "canvas.flow는 객체({...})여야 합니다.");
  }

  if (
    flow.direction !== undefined &&
    SKIN_HOME_CANVAS_FLOW_DIRECTIONS.indexOf(flow.direction) === -1
  ) {
    return skinHomeCanvasFail(
      `${path}.direction`,
      `direction은 ${SKIN_HOME_CANVAS_FLOW_DIRECTIONS.join(" · ")} 중 하나여야 합니다(v2 첫 범위는 세로 흐름 하나입니다).`
    );
  }

  const padding =
    validateSkinCanvasEdges(flow.padding, `${path}.padding`);

  if (!padding.ok) {
    return padding;
  }

  if (flow.gap !== undefined && !isSkinHomeCanvasCoord(flow.gap)) {
    return skinHomeCanvasFail(
      `${path}.gap`,
      `gap은 ±${SKIN_HOME_CANVAS_MAX_COORD} 안의 유한한 숫자여야 합니다.`
    );
  }

  if (!Array.isArray(flow.blocks)) {
    return skinHomeCanvasFail(`${path}.blocks`, "flow.blocks는 배열이어야 합니다.");
  }

  if (flow.blocks.length > SKIN_HOME_CANVAS_MAX_ELEMENTS) {
    return skinHomeCanvasFail(
      `${path}.blocks`,
      `자동 배치 블록은 ${SKIN_HOME_CANVAS_MAX_ELEMENTS}개를 넘을 수 없습니다.`
    );
  }

  for (let i = 0; i < flow.blocks.length; i++) {

    const result =
      validateSkinCanvasBlock(flow.blocks[i], `${path}.blocks[${i}]`, seen);

    if (!result.ok) {
      return result;
    }

  }

  return { ok: true };

}


/*
  validateSkinCanvasV2Data(canvas, path)
    -> { ok:true, version:2, renderable:false } | { ok:false, path, message }

  ★ 최상위 `elements` 를 **거부**한다(§14-9 함정 2).

    v1 의 불변 수정 writeSkinHomeCanvasElementFields() 는 version 을
    보지 않고 `canvas.elements` 배열을 찾아 id 로 쓴다. 그 칸이 없다는
    것이 곧 "v1 writer 는 v2 데이터에 닿을 수 없다"의 근거다 — 그래서
    두 칸이 함께 있는 파일은 어느 쪽이 진짜인지 파일만 보고 알 수 없게
    두지 않고 새 Import 에서 거부한다.

    반대 방향(v1 canvas 에 flow 가 섞여 있는 것)은 거부하지 않는다.
    v1 에서 진짜는 언제나 `elements` 이고 `flow` 는 모르는 칸이라
    애매하지 않으며, 거기에 새 거부를 만들면 "모르는 칸은 보존"(§9)이
    v1 에서 깨진다.
*/
function validateSkinCanvasV2Data(canvas, path) {

  if (canvas.baseWidth !== SKIN_HOME_CANVAS_BASE_WIDTH) {
    return skinHomeCanvasFail(
      `${path}.baseWidth`,
      `canvas.baseWidth는 ${SKIN_HOME_CANVAS_BASE_WIDTH}이어야 합니다(저장 좌표 기준 자 — v1 과 같습니다).`
    );
  }

  if (!isSkinHomeCanvasSize(canvas.baseHeight)) {
    return skinHomeCanvasFail(
      `${path}.baseHeight`,
      `canvas.baseHeight는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다(도화지 전체의 세로 길이 — 블록 높이의 합으로 자동 계산하지 않습니다).`
    );
  }

  if (canvas.elements !== undefined) {
    return skinHomeCanvasFail(
      `${path}.elements`,
      "v2 캔버스는 최상위 elements를 가질 수 없습니다(요소는 flow.blocks 와 overlays 에 있습니다)."
    );
  }

  /*
    ★ 한 이름 공간이다 — 블록 id · 프레임 내부 요소 id · overlay id
      가 전부 여기 들어간다(§14-5). 렌더러가 전부
      data-imory-edit-id 로 내보내므로 문서 안에서 유일해야 하고,
      §14-7 의 묶기 · 해제가 id 를 바꾸지 않고 소속만 옮기기 때문이다.
  */
  const seen = new Set();

  const flow =
    validateSkinCanvasFlow(canvas.flow, `${path}.flow`, seen);

  if (!flow.ok) {
    return flow;
  }

  /*
    overlays 항목 하나의 모양은 **v1 요소 하나와 정확히 같다**(§14-8) —
    그래서 v1 판정을 그대로 부른다. 배열 자체는 선택이다(장식이
    없다는 뜻이 하나뿐이다).
  */
  if (canvas.overlays !== undefined) {

    if (!Array.isArray(canvas.overlays)) {
      return skinHomeCanvasFail(`${path}.overlays`, "canvas.overlays는 배열이어야 합니다.");
    }

    if (canvas.overlays.length > SKIN_HOME_CANVAS_MAX_ELEMENTS) {
      return skinHomeCanvasFail(
        `${path}.overlays`,
        `페이지 자유 장식은 ${SKIN_HOME_CANVAS_MAX_ELEMENTS}개를 넘을 수 없습니다.`
      );
    }

    for (let i = 0; i < canvas.overlays.length; i++) {

      const result =
        validateSkinCanvasElement(
          canvas.overlays[i],
          `${path}.overlays[${i}]`,
          { seen: seen }
        );

      if (!result.ok) {
        return result;
      }

    }

  }

  return { ok: true, version: SKIN_HOME_CANVAS_V2_VERSION, renderable: false };

}


if (typeof window !== "undefined") {

  /* 이 값을 선언하는 파일이 여기다 — 공통 파일의 version 분기가
     call time 에 읽는다(파일 상단). */
  window.SKIN_HOME_CANVAS_V2_VERSION = SKIN_HOME_CANVAS_V2_VERSION;

}


if (typeof module !== "undefined" && module.exports) {

  const api = {

    SKIN_HOME_CANVAS_V2_VERSION,

    /* HOME-CANVAS-V2-DATA-1 — 조합형 Canvas 의 값 표 */
    SKIN_HOME_CANVAS_BLOCK_TYPES,
    SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES,
    SKIN_HOME_CANVAS_BLOCK_ALIGNS,
    SKIN_HOME_CANVAS_FLOW_DIRECTIONS,
    SKIN_HOME_CANVAS_EDGES,
    SKIN_HOME_CANVAS_FOLLOW_MODES,
    SKIN_HOME_CANVAS_PIN_TARGETS,
    SKIN_HOME_CANVAS_PIN_POINTS,

    validateSkinCanvasV2Data

  };

  module.exports = api;

  /* Node: 공통 파일의 version 분기가 이 둘을 call time 에 찾는다
     (skin/skin-home-canvas.js 상단 "세 파일이다"). */
  Object.assign(globalThis, api);

}
