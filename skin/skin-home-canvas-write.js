/* =========================================================
   SKIN HOME CANVAS — v1 Canvas 의 **불변 쓰기**
   (HOME-CANVAS-TRANSFORM-1A · 1B · 1C · INSPECTOR-1A · CODE-SPLIT-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md

   skin/skin-home-canvas.js 에서 **줄만 옮겨 온** 파일이다 — 복사
   규칙도 거부 이유(reason)도 그대로다(CODE-SPLIT-1).

   여기 있는 것

     writeSkinHomeCanvasRegion            regions 항목 하나
     writeSkinHomeCanvasElementFields     공용 불변 수정 **한 곳**
     writeSkinHomeCanvasElementPosition   x · y
     writeSkinHomeCanvasElementBox        x · y · width · height
     writeSkinHomeCanvasElementRotation   rotation
     writeSkinHomeCanvasElementText       props.text
     createEmptySkinHomeCanvas            빈 v1 캔버스 하나

   ★ **쓰는 것은 v1 뿐이다.** 이 파일의 어느 함수도 canvas.version 을
     보지 않고 `canvas.elements` 를 찾는다 — 그 칸이 없다는 것이 곧
     "v2 데이터에 닿을 수 없다"의 근거이고(§14-9 함정 2), 그래서 v2
     검증 파일과 이 파일은 서로를 부르지 않는다.

   ★ 판정(무엇이 유효한 좌표인가 · "auto" 를 쓸 수 있는 종류는
     무엇인가)은 skin/skin-home-canvas.js 의 표 하나를 본다. 여기서
     새 규칙을 만들지 않는다 — 조용히 고치지 않는 것이 §9 다.

   ★ 이 파일은 skin/skin-home-canvas.js **다음에** 로드된다.
========================================================== */

/* =========================================================
   4. 쓰기 — 원래 배열을 바꾸지 않는다

   이번 라운드에는 이 함수를 부르는 UI 가 없다. 그래도 여기 두는
   이유는 "enabled:false 가 데이터를 지우지 않는다"와 "모르는 칸을
   보존한다"가 **코드로 성립해야** 계약이기 때문이다 — 나중에
   Studio 패널이 생길 때 각자 새로 쓰면 규칙이 갈라진다.
========================================================== */

function writeSkinHomeCanvasRegion(regions, changes) {

  const next = [];

  let written = false;

  (Array.isArray(regions) ? regions : []).forEach((entry) => {

    if (
      !isSkinHomeCanvasPlainObject(entry) ||
      entry.name !== SKIN_HOME_CANVAS_REGION_NAME
    ) {
      next.push(entry);
      return;
    }

    if (written) {
      /* 같은 이름이 둘이면 뒤의 것은 버린다 — 읽을 때도 앞의 것만 본다 */
      return;
    }

    written = true;

    next.push(mergeSkinHomeCanvasRegionEntry(entry, changes));

  });

  if (!written) {
    next.push(mergeSkinHomeCanvasRegionEntry({ name: SKIN_HOME_CANVAS_REGION_NAME }, changes));
  }

  return next;

}


/*
  항목 하나를 새 객체로 만든다 — 모르는 칸은 그대로 옮긴다.
  changes 에 없는 칸은 손대지 않는다: `{ enabled:false }` 만 주면
  canvas 는 **그 자리에 남는다**(§2 "enabled:false 일 때 데이터를
  삭제하지 않는다").
*/
function mergeSkinHomeCanvasRegionEntry(entry, changes) {

  const merged = {};

  Object.keys(entry).forEach((key) => {
    if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
      merged[key] = entry[key];
    }
  });

  merged.name = SKIN_HOME_CANVAS_REGION_NAME;

  if (isSkinHomeCanvasPlainObject(changes)) {

    if (changes.enabled !== undefined) {
      merged.enabled = changes.enabled !== false;
    }

    if (changes.canvas !== undefined) {
      merged.canvas = changes.canvas;
    }

  }

  return merged;

}


/* =========================================================
   4-1. 요소 하나의 geometry 만 바꾼다
        (HOME-CANVAS-TRANSFORM-1A · 1B · 1C)

   writeSkinHomeCanvasElementPosition — x · y 둘 (이동, 1A)
   writeSkinHomeCanvasElementBox      — x · y · width · height (리사이즈, 1B)
   writeSkinHomeCanvasElementRotation — rotation 하나 (회전, 1C)

     -> { ok: true,  regions, previous: { ...그 칸들 } }
     -> { ok: false, reason }

   ★ 세 함수가 **같은 불변 수정 한 곳**을 쓴다.

   아래 writeSkinHomeCanvasElementFields() 가 그 한 곳이고, 위의 셋은
   "어떤 칸을 소유하는가"와 "그 값이 유효한가"만 다르게 준다. 복사
   규칙(모르는 필드 보존 · 배열 순서 · 입력 non-mutation)이 두 벌이
   되면 한쪽만 고쳐지는 날 이동과 리사이즈의 보존 범위가 갈라진다.

   ★ 바뀌는 칸 밖은 전부 그대로 새 객체로 옮긴다 — regions 의 모르는
   항목 · 항목의 모르는 칸 · canvas 의 모르는 칸 · element 의 모르는
   칸 · props · hidden · locked · 배열 순서 · 다른 요소 객체(같은
   참조로 옮긴다). 이동은 width · height · rotation 까지, 리사이즈는
   rotation 까지, 회전은 x · y · width · height 까지 보존한다.

   ★ 입력을 mutate 하지 않는다. 바뀌는 경로 위의 객체(regions 배열 ·
     home_canvas 항목 · canvas · elements 배열 · 그 요소)만 새로
     만들고, 그 밖의 값은 참조로 옮긴다. 그래서 Undo 가 들고 있는
     직전 스냅샷이 이 호출로 바뀌지 않는다(studio/studio-history.js
     머리말 "참조로 들고 있다").

   ★ `expected` 를 주면 **지금 값과 정확히 같을 때만** 쓴다.
     프레임이 본 화면과 지금 draft 가 다르면(늦게 도착한 확정 ·
     그 사이의 Undo · Import) 쓰지 않고 거부한다.

   ★ 모르는 키를 받지 않는다. `next` 의 키는 소유한 칸과 **정확히**
     같아야 하고, 하나라도 더 있으면 거부한다 — 이동 메시지로
     width 가, 리사이즈 메시지로 rotation 이 새어 들어갈 길을
     만들지 않는다.
========================================================== */

function writeSkinHomeCanvasElementFields(regions, elementId, next, expected, spec) {

  if (
    typeof elementId !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(elementId)
  ) {
    return { ok: false, reason: "id" };
  }

  if (!isSkinHomeCanvasPlainObject(next)) {
    return { ok: false, reason: "shape" };
  }

  const keys =
    Object.keys(next);

  if (
    keys.length !== spec.keys.length ||
    spec.keys.some((key) => keys.indexOf(key) === -1)
  ) {
    return { ok: false, reason: "keys" };
  }

  const found =
    findSkinHomeCanvasRegion(regions);

  if (!found) {
    return { ok: false, reason: "region" };
  }

  const canvas =
    found.entry.canvas;

  if (!isSkinHomeCanvasPlainObject(canvas) || !Array.isArray(canvas.elements)) {
    return { ok: false, reason: "canvas" };
  }

  /* 같은 id 가 둘이면 캔버스 전체가 무효다(§5-1) — 그런 데이터에
     쓰지 않는다. 고르는 쪽도 같은 이유로 이미 거부한다. */
  const hits =
    canvas.elements.filter(
      (element) =>
        isSkinHomeCanvasPlainObject(element) && element.id === elementId
    );

  if (hits.length !== 1) {
    return { ok: false, reason: hits.length ? "duplicate" : "missing" };
  }

  const current =
    hits[0];

  /*
    ★ 값 검사는 요소를 찾은 **뒤에** 한다.

    `height:"auto"` 가 허용되는지는 그 요소의 type 이 정하므로
    (§6), 요소 없이는 `next` 가 유효한지조차 말할 수 없다.
  */
  const nextReason =
    spec.checkNext(next, current);

  if (nextReason) {
    return { ok: false, reason: nextReason };
  }

  const currentReason =
    spec.checkCurrent(current);

  if (currentReason) {
    return { ok: false, reason: currentReason };
  }

  /*
    ★ 지금 값을 **무엇으로 읽는가**는 spec 이 정한다.

    x · y · width · height 는 요소에 반드시 적혀 있으므로 그대로
    읽는다. `rotation` 은 **빠져 있을 수 있고**, 그때 화면상 값은
    0 이다(계약 §5). 프레임은 그 화면값을 근거로 돌리므로
    `expected.rotation` 은 0 으로 올라온다 — 여기서도 같은 자로
    읽지 않으면 "한 번도 돌린 적 없는 요소는 영영 돌릴 수 없다"가
    된다(HOME-CANVAS-TRANSFORM-1C).
  */
  /*
    ★ 바뀌는 칸이 **요소 자신인가 `props` 안인가**는 spec 이 정한다
      (HOME-CANVAS-INSPECTOR-1A).

    geometry 다섯 칸은 요소 자신에 있고, 글자 내용(`props.text`)은 한
    겹 안에 있다. 그 한 겹 때문에 복사 규칙 · expected 검사 · 모르는
    필드 보존을 두 벌로 만들지 않는다 — 읽는 자리와 쓰는 자리만
    갈라진다.
  */
  const inProps =
    spec.container === "props";

  const owner =
    inProps
      ? (isSkinHomeCanvasPlainObject(current.props) ? current.props : {})
      : current;

  const readCurrent =
    (key) =>
      (typeof spec.readCurrent === "function")
        ? spec.readCurrent(current, key)
        : owner[key];

  const previous = {};

  spec.keys.forEach((key) => {
    previous[key] = readCurrent(key);
  });

  if (isSkinHomeCanvasPlainObject(expected)) {

    /* 지금 값과 **정확히** 같을 때만 쓴다. `"auto"` 도 이 한 줄이
       가른다 — 문자열과 숫자는 === 로 절대 같지 않다. */
    if (spec.keys.some((key) => expected[key] !== readCurrent(key))) {
      return { ok: false, reason: "expected" };
    }

  }

  if (spec.keys.every((key) => readCurrent(key) === next[key])) {
    return { ok: true, regions: regions, previous: previous, unchanged: true };
  }


  const nextElements =
    canvas.elements.map(
      (element) => {

        if (element !== current) {
          return element;
        }

        const copy =
          copySkinHomeCanvasObject(element);

        if (inProps) {

          /* props 의 모르는 칸(`role` · 뒤 버전이 쓸 칸)은 그대로 옮기고
             소유한 칸만 갈아 끼운다 */
          const propsCopy =
            copySkinHomeCanvasObject(owner);

          spec.keys.forEach((key) => {
            propsCopy[key] = next[key];
          });

          copy.props = propsCopy;

        }
        else {

          spec.keys.forEach((key) => {
            copy[key] = next[key];
          });

        }

        return copy;

      }
    );


  const nextCanvas =
    copySkinHomeCanvasObject(canvas);

  nextCanvas.elements = nextElements;


  const nextRegions =
    regions.map(
      (entry, index) => {

        if (index !== found.index) {
          return entry;
        }

        const copy =
          copySkinHomeCanvasObject(entry);

        copy.canvas = nextCanvas;

        return copy;

      }
    );


  return { ok: true, regions: nextRegions, previous: previous };

}


function writeSkinHomeCanvasElementPosition(regions, elementId, next, expected) {

  return writeSkinHomeCanvasElementFields(
    regions,
    elementId,
    next,
    expected,
    {
      keys: ["x", "y"],

      checkNext: (value) =>
        (isSkinHomeCanvasCoord(value.x) && isSkinHomeCanvasCoord(value.y))
          ? ""
          : "coord",

      checkCurrent: (element) =>
        (isSkinHomeCanvasCoord(element.x) && isSkinHomeCanvasCoord(element.y))
          ? ""
          : "current"
    }
  );

}


/*
  HOME-CANVAS-TRANSFORM-1B — 리사이즈가 소유하는 것은 **네 칸**이다.

  ★ `height` 는 숫자이거나 `"auto"` 다. `"auto"` 는 그 요소의 type 이
    허용할 때만이고(§6), 그 판정은 요소를 찾은 뒤에 한다 — 검사
    함수가 요소를 함께 받는 이유다.

  ★ 네 칸이 한 요청이다. 폭만 바뀌는 좌우 리사이즈에서도 x · y ·
    height 가 함께 온다(값이 같을 뿐이다). 칸마다 메시지를 가르면
    "폭은 저장됐는데 x 는 안 됐다"는 중간 상태가 생긴다.
*/
function writeSkinHomeCanvasElementBox(regions, elementId, next, expected) {

  return writeSkinHomeCanvasElementFields(
    regions,
    elementId,
    next,
    expected,
    {
      keys: ["x", "y", "width", "height"],

      checkNext: (value, element) => {

        if (!isSkinHomeCanvasCoord(value.x) || !isSkinHomeCanvasCoord(value.y)) {
          return "coord";
        }

        if (!isSkinHomeCanvasSize(value.width)) {
          return "size";
        }

        if (value.height === SKIN_HOME_CANVAS_AUTO_HEIGHT) {

          return skinHomeCanvasAutoHeightAllowed(element) ? "" : "auto";

        }

        return isSkinHomeCanvasSize(value.height) ? "" : "size";

      },

      checkCurrent: (element) => {

        if (!isSkinHomeCanvasCoord(element.x) || !isSkinHomeCanvasCoord(element.y)) {
          return "current";
        }

        if (!isSkinHomeCanvasSize(element.width)) {
          return "current";
        }

        if (element.height === SKIN_HOME_CANVAS_AUTO_HEIGHT) {
          return skinHomeCanvasAutoHeightAllowed(element) ? "" : "current";
        }

        return isSkinHomeCanvasSize(element.height) ? "" : "current";

      }
    }
  );

}


/*
  HOME-CANVAS-TRANSFORM-1C — 회전이 소유하는 것은 **한 칸**이다.

  ★ `rotation` 은 요소에 **없을 수 있다**(계약 §5 — 빠지면 0).
    그래서 지금 값을 읽는 자를 따로 준다(위 readCurrent). 화면도
    부모도 프레임도 "없으면 0"으로 같은 값을 보고, 실제로 돌린
    제스처만 그 칸을 JSON 에 만든다 — 고르기만 해서는 `rotation:0`
    이 새로 생기지 않는다.

  ★ 허용 범위는 계약이 이미 가진 그것 하나다 — **유한한 숫자**
    (§5 의 검증 규칙). 회전용으로 새 범위를 만들지 않는다.

  ★ x · y · width · height 는 회전이 바꾸지 않는다. 회전 중심이
    요소 상자의 정중앙이므로 상자 자체는 그대로다(§4) — 네 칸은
    공용 복사 규칙이 보존한다.
*/
function writeSkinHomeCanvasElementRotation(regions, elementId, next, expected) {

  return writeSkinHomeCanvasElementFields(
    regions,
    elementId,
    next,
    expected,
    {
      keys: ["rotation"],

      readCurrent: (element) =>
        isSkinHomeCanvasFiniteNumber(element.rotation) ? element.rotation : 0,

      checkNext: (value) =>
        isSkinHomeCanvasFiniteNumber(value.rotation) ? "" : "rotation",

      /* 적혀 있지 않은 것은 잘못이 아니다 — 그때의 지금 값이 0 이다.
         적혀 있는데 숫자가 아니면 그 요소는 애초에 계약을 어긴 것이다. */
      checkCurrent: (element) =>
        (
          element.rotation === undefined ||
          isSkinHomeCanvasFiniteNumber(element.rotation)
        )
          ? ""
          : "current"
    }
  );

}


/*
  HOME-CANVAS-INSPECTOR-1A — 글자 요소의 **내용 한 칸**(`props.text`).

  ★ 소유하는 것은 `props.text` 하나다. `role` 도 `x` · `y` · `width` ·
    `height` · `rotation` 도 이 함수가 건드리지 않는다 — 위 셋과 같은
    공용 불변 수정을 쓰고, 다른 것은 `container: "props"` 한 줄뿐이다.

  ★ 규칙은 검증기가 이미 가진 그것 하나다(§7 의 text) — 문자열이고
    2000자 이하. **빈 문자열도 유효하다**(계약에 최소 길이가 없다).
    여기서 새 규칙을 만들지 않는다.

  ★ 들어온 것은 평문이다. `<b>` 가 섞여 있어도 그대로 저장되고,
    렌더러가 `textContent` 로 그리므로 화면에서도 글자 그대로다
    (skin/skin-home-canvas-render.js §12-4). 줄바꿈도 문자열이라
    그대로 남는다.
*/
function writeSkinHomeCanvasElementText(regions, elementId, next, expected) {

  return writeSkinHomeCanvasElementFields(
    regions,
    elementId,
    next,
    expected,
    {
      container: "props",
      keys: ["text"],

      checkNext: (value, element) => {

        if (element.type !== "text") {
          return "type";
        }

        if (typeof value.text !== "string") {
          return "text";
        }

        return (value.text.length <= SKIN_HOME_CANVAS_MAX_TEXT_CHARS)
          ? ""
          : "length";

      },

      checkCurrent: (element) => {

        if (element.type !== "text") {
          return "current";
        }

        const props =
          isSkinHomeCanvasPlainObject(element.props) ? element.props : {};

        return (typeof props.text === "string") ? "" : "current";

      }
    }
  );

}

/* 그 요소의 type 이 `height:"auto"` 를 쓸 수 있는가(§6) — 검증기와
   같은 표를 본다(SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES) */
function skinHomeCanvasAutoHeightAllowed(element) {

  return (
    isSkinHomeCanvasPlainObject(element) &&
    SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES.indexOf(element.type) !== -1
  );

}


/*
  빈 v1 캔버스 — 프리셋이 아니라 "아무것도 놓이지 않은 면" 하나다.
  요소가 없어도 도화지는 높이를 갖는다(baseHeight, 기본 844).
*/
function createEmptySkinHomeCanvas() {

  return {
    version: SKIN_HOME_CANVAS_VERSION,
    baseWidth: SKIN_HOME_CANVAS_BASE_WIDTH,
    baseHeight: SKIN_HOME_CANVAS_BASE_HEIGHT,
    elements: []
  };

}


if (typeof window !== "undefined") {

  window.writeSkinHomeCanvasRegion = writeSkinHomeCanvasRegion;

  /* HOME-CANVAS-TRANSFORM-1A */
  window.writeSkinHomeCanvasElementPosition = writeSkinHomeCanvasElementPosition;

  /* HOME-CANVAS-TRANSFORM-1B */
  window.writeSkinHomeCanvasElementBox = writeSkinHomeCanvasElementBox;

  /* HOME-CANVAS-TRANSFORM-1C */
  window.writeSkinHomeCanvasElementRotation = writeSkinHomeCanvasElementRotation;

  /* HOME-CANVAS-INSPECTOR-1A */
  window.writeSkinHomeCanvasElementText = writeSkinHomeCanvasElementText;

  window.createEmptySkinHomeCanvas = createEmptySkinHomeCanvas;

}


if (typeof module !== "undefined" && module.exports) {

  const api = {

    writeSkinHomeCanvasRegion,
    writeSkinHomeCanvasElementPosition,
    writeSkinHomeCanvasElementBox,
    writeSkinHomeCanvasElementRotation,
    writeSkinHomeCanvasElementText,
    createEmptySkinHomeCanvas

  };

  module.exports = api;

  /* Node: 브라우저의 공유 전역 흉내 — 지금 이 이름들을 형제가 부르지는
     않지만, 세 파일이 **같은 한 줄**을 쓰게 두어 규칙이 갈라지지 않게
     한다(skin/skin-home-canvas.js 상단 "세 파일이다"). */
  Object.assign(globalThis, api);

}
