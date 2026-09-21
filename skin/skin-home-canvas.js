/* =========================================================
   SKIN HOME CANVAS — HOME 캔버스 **데이터 계약**
   (HOME-CANVAS-CONTRACT-1B · 1C)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ★ 이 파일은 **데이터만** 다룬다.
     요소 DOM 을 만들지 않고, 조작 UI 도 Moveable/Selecto 도 없다.
     캔버스를 실제로 그리는 것은 다음 작업(HOME-CANVAS-RENDER-1)이다.
     그래서 이 파일에는 document 를 만지는 코드가 한 줄도 없다 —
     저장 경계(sanitize)가 부르는 순수 판정 함수와, 렌더 재료를
     만드는 순수 변환 함수뿐이다.

   ── 둘로 나뉜다 — 설정과 디자인 ─────────────────────────
   좌우 영역(skin/skin-sides.js)  ·  주인의 스킨 설정
   (skin/skin-settings.js)과 같은 결이다.

     설정  캔버스에 무엇이 어디에 놓였는가
           → SkinPackage.regions 의 `home_canvas` 항목
     디자인 그 요소들이 어떤 글꼴 · 색 · 테두리로 보이는가
           → 스킨 CSS (요소마다 data-imory-edit-id 선택자)

   regions 는 원래부터 모든 경로(Import · Export · Save · Publish ·
   AI · sandbox 봉투)를 그대로 지나가던 배열이다. **새 최상위
   SkinPackage 필드를 만들지 않는다.**

     "regions": [
       { "name": "home_canvas",
         "enabled": true,
         "canvas": {
           "version": 1,
           "baseWidth": 390,
           "baseHeight": 844,
           "elements": [
             { "id": "canvas_a1b2c3d4-...", "type": "photo",
               "x": 20, "y": 120, "width": 260, "height": 320,
               "rotation": 0, "hidden": false, "locked": false,
               "props": { "slot": "photo_1" } }
           ]
         } }
     ]

   - 모르는 이름 · 모르는 칸은 읽지 않고 **그대로 보존**한다.
   - 쓰기 함수는 원래 배열을 바꾸지 않고 새 배열을 돌려준다.
   - `enabled:false` 는 데이터를 **지우지 않는다** — 캔버스를 껐다가
     다시 켜도 요소가 그대로 남는다.
   - 항목이 없는 스킨(= 지금까지의 모든 스킨)이면 렌더 재료에
     `canvas` 키가 생기지 않는다 — sandbox 봉투와 Preview 메시지가
     byte 단위로 그대로다.

   ── 보존용 원본 vs 실행용 payload ───────────────────────
   §9 의 요구다. 두 길이 다르다.

     보존  Import/Export/Save/Publish/AI 는 regions 를 **손대지
           않는다**. 모르는 칸도, 미래 version 도 그대로 남는다.
     실행  resolveSkinHomeCanvas() 가 **알려진 칸만** 새 리터럴로
           옮긴 payload 를 만든다. 그 payload 만 프레임으로 나간다.

   그래서 "저장은 돼 있는데 실행되지 않는" 상태가 존재한다 —
   미래 version, 깨진 기존 데이터, 표시 위치 없는 스킨이 전부
   그 상태다. 셋 다 기존 HOME 을 그대로 그린다(fallback).

   ── 표시 위치 ───────────────────────────────────────────
     <div data-imory-canvas-root></div>

   HOME template 안에 **정확히 하나**. 저장 경계가 이 파일의 표에
   묻는다(skin/skin-sanitize.js). 없거나 둘 이상이면 캔버스 실행
   데이터를 만들지 않는다 — 기존 HOME 그대로다. 기존 스킨에
   이 표식을 자동으로 넣어 주지 않는다.

   ── 요소 id 와 data-imory-edit-id ───────────────────────
   ★ 함정. §8 은 "각 요소는 후속 Renderer 에서 안정적인
     data-imory-edit-id 를 받아야 한다"고 적는다. 그런데 저장
     경계의 edit-id 규칙은

       skin/skin-sanitize.js  SKIN_SANITIZE_EDIT_ID_PATTERN
       /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

     이다 — **점이 없고, 64자 이하이고, 글자로 시작**해야 한다.
     `crypto.randomUUID()` 는 `0e02b2c3-...` 처럼 **숫자로 시작할 수
     있어서** 그 규칙을 통과하지 못한다. 그래서 이 파일이 만드는
     id 는 `canvas_` 를 앞에 붙인다(43자, 항상 글자로 시작).

     판정도 같은 규칙을 쓴다. 규칙에 맞지 않는 id 는 새 Import 에서
     **거부**한다 — 저장은 됐는데 나중에 Renderer 가 그 요소만
     선택할 수 없는 상태를 파일만 보고 구분할 수 없게 두지 않는다.

   ── 앞으로의 확장 방향(이번에 구현하지 않음) ────────────
   같은 canvas 데이터 구조를 `left_sidebar` · `right_sidebar` 항목
   안에도 붙일 수 있게 만들어 두었다 — 이 파일의 판정 함수는
   region 이름을 인자로 받지 않고 `home_canvas` 하나만 찾지만,
   validate/resolve 의 본체(validateSkinCanvasData /
   buildSkinCanvasRenderPayload)는 이름을 모른다. 좌우 Canvas 를
   붙일 때는 찾는 이름만 늘리면 된다. **이번 작업에서는 좌우
   Canvas · 패널 편집 UI · 위젯을 만들지 않는다.**

   ES 모듈이 아니다 — skin-sides.js · skin-settings.js 처럼 classic
   script 이고, 노드 단위 테스트를 위해 module.exports 로도 낸다.
   의존 없음(전역 함수를 부르지 않는다) — sandbox frame 문서에도
   그대로 로드된다.
========================================================== */


/* SkinPackage.regions 의 이름 */
const SKIN_HOME_CANVAS_REGION_NAME = "home_canvas";

/* 이 배포가 실행할 수 있는 canvas.version. 다른 값은 보존만 한다. */
const SKIN_HOME_CANVAS_VERSION = 1;

/* v1 의 저장 좌표 기준 자. 화면 폭을 390px 로 고정한다는 뜻이 아니다. */
const SKIN_HOME_CANVAS_BASE_WIDTH = 390;

/* =========================================================
   도화지 전체의 세로 길이 (HOME-CANVAS-CONTRACT-1C)

   ★ 각 요소의 height 와 **다른 것**이다. baseHeight 는 "이 캔버스가
     어디까지인가"이고, 요소 height 는 "그 요소가 얼마나 큰가"다.

   ★ 요소의 가장 아래 좌표로 **자동 계산하지 않는다.** 그렇게 하면
     아래쪽에 일부러 둔 여백이 사라지고, 요소를 하나 옮길 때마다
     페이지 전체 높이가 예기치 않게 바뀐다. 요소가 하나도 없는
     캔버스도 높이를 갖는다.

   ★ 요소가 이 경계를 일부 벗어나는 것을 데이터 계약이 금지하지
     않는다. 넘친 것을 어떻게 다룰지(자르기 · 늘리기 · 스크롤)는
     Renderer 계약의 몫이다.

   기본값 844 는 새 캔버스 하나의 출발점이다(390×844 = 한 화면형).
   긴 스크롤형 캔버스는 이 값을 키워서 만든다 — 그 구분이 곧
   baseHeight 다.
========================================================== */
const SKIN_HOME_CANVAS_BASE_HEIGHT = 844;

/* 표시 위치 — 마크업 계약. 저장 경계(skin/skin-sanitize.js)가 이 표에 묻는다 */
const SKIN_HOME_CANVAS_ROOT_ATTR = "data-imory-canvas-root";

const SKIN_HOME_CANVAS_ATTRIBUTE_RULES = {
  [SKIN_HOME_CANVAS_ROOT_ATTR]: [""]
};

/* v1 요소 종류 — 이 여섯이 전부다 */
const SKIN_HOME_CANVAS_ELEMENT_TYPES =
  ["photo", "text", "logo", "category_nav", "sticker", "shape"];

/* height 에 "auto" 를 쓸 수 있는 종류 */
const SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES = ["text", "category_nav"];

const SKIN_HOME_CANVAS_AUTO_HEIGHT = "auto";

/* text.props.role — 의미 역할(시각 스타일이 아니다) */
const SKIN_HOME_CANVAS_TEXT_ROLES =
  ["title", "subtitle", "body", "caption", "label"];

/* category_nav.props.mode */
const SKIN_HOME_CANVAS_NAV_MODES = ["all", "selected"];

/* shape.props.kind */
const SKIN_HOME_CANVAS_SHAPE_KINDS = ["rect", "ellipse", "line"];

/* logo.props.fallback — 슬롯이 비었을 때 무엇을 그리는가 */
const SKIN_HOME_CANVAS_LOGO_FALLBACKS = ["site_title"];

/*
  요소 id — skin/skin-sanitize.js 의 SKIN_SANITIZE_EDIT_ID_PATTERN 과
  **같은 정규식**이어야 한다(파일 상단 "함정" 참고). 이 파일은 의존이
  없어야 해서 값을 한 번 더 적는다 — skin/skin-package-export.js 가
  renderMode 목록을 복사해 적는 것과 같은 판단이고, 두 곳이 갈라지지
  않게 단위 테스트가 양방향으로 대조한다(skin/skin-home-canvas-test.mjs).
*/
const SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/*
  props.slot — 이미지 슬롯 이름. skin/skin-package-images.js 의
  SKIN_IMAGE_SLOT_NAME_PATTERN 과 같은 정규식이다(그 파일은 sandbox
  origin 에 없어서 부를 수 없다). 위와 같은 이유로 단위 테스트가 대조한다.
*/
const SKIN_HOME_CANVAS_SLOT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

/*
  상한. 실행용 payload 가 프레임으로 나가므로 크기를 못박아 둔다 —
  렌더러가 없는 지금도 계약의 일부다(sandbox 프로토콜이 같은 값을
  다시 검사한다).
*/
const SKIN_HOME_CANVAS_MAX_ELEMENTS = 200;
const SKIN_HOME_CANVAS_MAX_TEXT_CHARS = 2000;
const SKIN_HOME_CANVAS_MAX_CATEGORY_IDS = 50;
const SKIN_HOME_CANVAS_MAX_CATEGORY_ID_CHARS = 64;

/* 좌표 · 크기의 절대 한계. 유한한 숫자여도 이 밖이면 거부한다. */
const SKIN_HOME_CANVAS_MAX_COORD = 100000;


/* =========================================================
   0. 작은 도구
========================================================== */

function isSkinHomeCanvasPlainObject(value) {

  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


function isSkinHomeCanvasFiniteNumber(value) {

  return typeof value === "number" && Number.isFinite(value);

}


function isSkinHomeCanvasCoord(value) {

  return (
    isSkinHomeCanvasFiniteNumber(value) &&
    Math.abs(value) <= SKIN_HOME_CANVAS_MAX_COORD
  );

}


function isSkinHomeCanvasSize(value) {

  return (
    isSkinHomeCanvasFiniteNumber(value) &&
    value > 0 &&
    value <= SKIN_HOME_CANVAS_MAX_COORD
  );

}


/*
  새 요소 id. `crypto.randomUUID()` 를 쓰되 앞에 `canvas_` 를 붙인다
  (파일 상단 "함정" — UUID 는 숫자로 시작할 수 있어서 edit-id 규칙을
  통과하지 못한다). randomUUID 가 없는 환경에서는 getRandomValues 로,
  그것도 없으면 시간+난수로 만든다.
*/
function createSkinHomeCanvasElementId() {

  const cryptoObj =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `canvas_${cryptoObj.randomUUID()}`;
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {

    const bytes = new Uint8Array(16);

    cryptoObj.getRandomValues(bytes);

    let hex = "";

    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }

    return `canvas_${hex}`;

  }

  return `canvas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

}


/* =========================================================
   1. 마크업 — 표시 위치

   저장 경계(skin/skin-sanitize.js)가 부르는 두 함수. 값 표에 없는
   것은 속성만 조용히 사라진다(sides · photos 와 같은 규칙).
========================================================== */

function isSkinHomeCanvasAttributeName(name) {

  return Object.prototype.hasOwnProperty.call(SKIN_HOME_CANVAS_ATTRIBUTE_RULES, name);

}


/* 저장할 값 | null(버린다) */
function sanitizeSkinHomeCanvasAttributeValue(name, value) {

  if (!isSkinHomeCanvasAttributeName(name)) {
    return null;
  }

  const normalized = String(value == null ? "" : value).trim().toLowerCase();

  return SKIN_HOME_CANVAS_ATTRIBUTE_RULES[name].indexOf(normalized) !== -1
    ? normalized
    : null;

}


/*
  countSkinHomeCanvasRoots(html) -> 0 | 1 | 2 | ...

  "정확히 하나" 계약을 판정하는 유일한 함수다. skinHtmlHasSidesFrame
  과 같은 문자열 검사다(DOM 을 만들지 않는다 — 이 파일은 document 를
  모른다).
*/
function countSkinHomeCanvasRoots(html) {

  const text = String(html == null ? "" : html);

  const matches =
    text.match(/data-imory-canvas-root(?=[\s/>=])/gi);

  return matches ? matches.length : 0;

}


function skinHtmlHasCanvasRoot(html) {

  return countSkinHomeCanvasRoots(html) === 1;

}


/* =========================================================
   2. 검증 — 새 Import 가 올 때

   결과는 두 모양뿐이다.

     { ok: true }
     { ok: false, path, message }

   path 는 사용자가 자기 파일에서 **그 자리를 찾을 수 있는** 경로다.

     regions[2].canvas.elements[1].width
     regions[2].canvas.elements[3].id

   조용히 고치지 않는다 — 중복 id · 잘못된 타입 · 잘못된 숫자 ·
   허용되지 않은 "auto" 는 전부 거부다.
========================================================== */

function skinHomeCanvasFail(path, message) {

  return { ok: false, path, message };

}


/*
  validateSkinCanvasElement(element, path) -> { ok } | { ok:false, path, message }

  region 이름을 모른다 — 앞으로 좌우 패널 Canvas 가 생겨도 이 함수는
  그대로다(파일 상단 "확장 방향").
*/
function validateSkinCanvasElement(element, path) {

  if (!isSkinHomeCanvasPlainObject(element)) {
    return skinHomeCanvasFail(path, "캔버스 요소는 객체({...})여야 합니다.");
  }

  /* type — props 판정이 여기에 달려 있으므로 먼저 본다 */
  if (SKIN_HOME_CANVAS_ELEMENT_TYPES.indexOf(element.type) === -1) {
    return skinHomeCanvasFail(
      `${path}.type`,
      `type은 ${SKIN_HOME_CANVAS_ELEMENT_TYPES.join(" · ")} 중 하나여야 합니다.`
    );
  }

  const type = element.type;

  /* id — edit-id 규칙과 같다(파일 상단 "함정") */
  if (
    typeof element.id !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(element.id)
  ) {
    return skinHomeCanvasFail(
      `${path}.id`,
      "id는 영문자로 시작하고 영문자·숫자·_·- 만 쓰는 64자 이하 문자열이어야 합니다."
    );
  }

  /* x · y */
  for (const axis of ["x", "y"]) {
    if (!isSkinHomeCanvasCoord(element[axis])) {
      return skinHomeCanvasFail(
        `${path}.${axis}`,
        `${axis}는 ±${SKIN_HOME_CANVAS_MAX_COORD} 안의 유한한 숫자여야 합니다.`
      );
    }
  }

  /* width — 항상 양수 */
  if (!isSkinHomeCanvasSize(element.width)) {
    return skinHomeCanvasFail(
      `${path}.width`,
      `width는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다.`
    );
  }

  /*
    height — 모든 요소가 양수 숫자를 쓸 수 있고, text · category_nav
    만 "auto" 도 쓸 수 있다. "auto" 는 **높이 조정 불가라는 뜻이
    아니다** — 후속 Inspector 가 세로 손잡이로 실제 숫자 높이로
    바꿀 수 있어야 하고, `내용에 맞추기` 로 다시 "auto" 가 된다.
  */
  const autoAllowed =
    SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES.indexOf(type) !== -1;

  if (element.height === SKIN_HOME_CANVAS_AUTO_HEIGHT) {

    if (!autoAllowed) {
      return skinHomeCanvasFail(
        `${path}.height`,
        `height "auto"는 ${SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES.join(" · ")} 에서만 쓸 수 있습니다.`
      );
    }

  } else if (!isSkinHomeCanvasSize(element.height)) {

    return skinHomeCanvasFail(
      `${path}.height`,
      autoAllowed
        ? `height는 0보다 큰 숫자이거나 "auto"여야 합니다.`
        : `height는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다.`
    );

  }

  /*
    rotation · hidden · locked · props 는 **선택**이다.
    빠지면 0 · false · false · {} 다.

    이유: 이 넷은 안전한 기본값이 하나뿐이라(회전 없음 · 보임 ·
    안 잠김 · 설정 없음) 빠뜨린 것과 기본값을 적은 것이 같은 뜻이다.
    id · type · x · y · width · height 는 그렇지 않아서 필수다.
    들어 있으면 모양은 맞아야 한다 — 조용히 고치지 않는다.
  */
  if (
    element.rotation !== undefined &&
    !isSkinHomeCanvasFiniteNumber(element.rotation)
  ) {
    return skinHomeCanvasFail(
      `${path}.rotation`,
      "rotation은 유한한 숫자(요소 중심 기준 시계 방향 각도)여야 합니다."
    );
  }

  for (const flag of ["hidden", "locked"]) {
    if (element[flag] !== undefined && typeof element[flag] !== "boolean") {
      return skinHomeCanvasFail(`${path}.${flag}`, `${flag}는 true 또는 false여야 합니다.`);
    }
  }

  if (element.props !== undefined && !isSkinHomeCanvasPlainObject(element.props)) {
    return skinHomeCanvasFail(`${path}.props`, "props는 객체({...})여야 합니다.");
  }

  const props =
    isSkinHomeCanvasPlainObject(element.props) ? element.props : {};

  return validateSkinCanvasElementProps(type, props, `${path}.props`);

}


function validateSkinCanvasSlotProp(props, path, required) {

  if (props.slot === undefined) {

    if (required) {
      return skinHomeCanvasFail(`${path}.slot`, "slot(이미지 슬롯 이름)이 필요합니다.");
    }

    return { ok: true };

  }

  if (
    typeof props.slot !== "string" ||
    !SKIN_HOME_CANVAS_SLOT_NAME_PATTERN.test(props.slot)
  ) {
    return skinHomeCanvasFail(
      `${path}.slot`,
      "slot은 영소문자로 시작하고 영소문자·숫자·_ 만 쓰는 50자 이하 이름이어야 합니다."
    );
  }

  return { ok: true };

}


function validateSkinCanvasElementProps(type, props, path) {

  if (type === "photo" || type === "sticker") {
    return validateSkinCanvasSlotProp(props, path, true);
  }

  if (type === "logo") {

    const slot = validateSkinCanvasSlotProp(props, path, true);

    if (!slot.ok) {
      return slot;
    }

    if (
      props.fallback !== undefined &&
      SKIN_HOME_CANVAS_LOGO_FALLBACKS.indexOf(props.fallback) === -1
    ) {
      return skinHomeCanvasFail(
        `${path}.fallback`,
        `fallback은 ${SKIN_HOME_CANVAS_LOGO_FALLBACKS.join(" · ")} 중 하나여야 합니다.`
      );
    }

    return { ok: true };

  }

  if (type === "text") {

    if (typeof props.text !== "string") {
      return skinHomeCanvasFail(`${path}.text`, "text(실제 내용)는 문자열이어야 합니다.");
    }

    if (props.text.length > SKIN_HOME_CANVAS_MAX_TEXT_CHARS) {
      return skinHomeCanvasFail(
        `${path}.text`,
        `text는 ${SKIN_HOME_CANVAS_MAX_TEXT_CHARS}자를 넘을 수 없습니다.`
      );
    }

    if (
      props.role !== undefined &&
      SKIN_HOME_CANVAS_TEXT_ROLES.indexOf(props.role) === -1
    ) {
      return skinHomeCanvasFail(
        `${path}.role`,
        `role은 ${SKIN_HOME_CANVAS_TEXT_ROLES.join(" · ")} 중 하나여야 합니다.`
      );
    }

    return { ok: true };

  }

  if (type === "category_nav") {

    if (
      props.mode !== undefined &&
      SKIN_HOME_CANVAS_NAV_MODES.indexOf(props.mode) === -1
    ) {
      return skinHomeCanvasFail(
        `${path}.mode`,
        `mode는 ${SKIN_HOME_CANVAS_NAV_MODES.join(" · ")} 중 하나여야 합니다.`
      );
    }

    if (props.categoryIds !== undefined) {

      if (!Array.isArray(props.categoryIds)) {
        return skinHomeCanvasFail(`${path}.categoryIds`, "categoryIds는 배열이어야 합니다.");
      }

      if (props.categoryIds.length > SKIN_HOME_CANVAS_MAX_CATEGORY_IDS) {
        return skinHomeCanvasFail(
          `${path}.categoryIds`,
          `categoryIds는 ${SKIN_HOME_CANVAS_MAX_CATEGORY_IDS}개를 넘을 수 없습니다.`
        );
      }

      for (let i = 0; i < props.categoryIds.length; i++) {

        const id = props.categoryIds[i];

        if (
          typeof id !== "string" ||
          !id ||
          id.length > SKIN_HOME_CANVAS_MAX_CATEGORY_ID_CHARS
        ) {
          return skinHomeCanvasFail(
            `${path}.categoryIds[${i}]`,
            `카테고리 id는 ${SKIN_HOME_CANVAS_MAX_CATEGORY_ID_CHARS}자 이하의 빈 문자열이 아닌 문자열이어야 합니다.`
          );
        }

      }

    }

    return { ok: true };

  }

  /* shape */
  if (SKIN_HOME_CANVAS_SHAPE_KINDS.indexOf(props.kind) === -1) {
    return skinHomeCanvasFail(
      `${path}.kind`,
      `kind는 ${SKIN_HOME_CANVAS_SHAPE_KINDS.join(" · ")} 중 하나여야 합니다.`
    );
  }

  return { ok: true };

}


/*
  validateSkinCanvasData(canvas, path) -> { ok, future? } | { ok:false, path, message }

  ★ 미래 version 은 **실패가 아니다**. `{ ok: true, future: true }` 를
    돌려준다 — 파일은 통과하고(보존), 실행만 하지 않는다(§9).
    이 배포가 모르는 version 의 elements 를 이 배포의 v1 규칙으로
    검사하는 것은 틀린 판정이다.
*/
function validateSkinCanvasData(canvas, path) {

  if (!isSkinHomeCanvasPlainObject(canvas)) {
    return skinHomeCanvasFail(path, "canvas는 객체({...})여야 합니다.");
  }

  if (!Number.isInteger(canvas.version) || canvas.version < 1) {
    return skinHomeCanvasFail(`${path}.version`, "canvas.version은 1 이상의 정수여야 합니다.");
  }

  if (canvas.version !== SKIN_HOME_CANVAS_VERSION) {
    return { ok: true, future: true };
  }

  if (canvas.baseWidth !== SKIN_HOME_CANVAS_BASE_WIDTH) {
    return skinHomeCanvasFail(
      `${path}.baseWidth`,
      `canvas.baseWidth는 ${SKIN_HOME_CANVAS_BASE_WIDTH}이어야 합니다(v1 의 저장 좌표 기준 자).`
    );
  }

  /*
    HOME-CANVAS-CONTRACT-1C — 도화지 전체의 세로 길이.

    baseWidth 와 달리 **고정값이 아니다**(긴 스크롤형 캔버스가
    그래서 가능하다). v1 의 필수 필드다 — 지금까지 저장된 실제
    사용자 캔버스가 하나도 없으므로 옵션으로 둘 이유가 없고,
    빠진 것을 조용히 844 로 채우면 "한 화면형으로 만든 캔버스"와
    "높이를 안 적은 캔버스"가 파일만 보고 구분되지 않는다.

    상한은 좌표·크기와 같은 자를 쓴다(SKIN_HOME_CANVAS_MAX_COORD) —
    요소가 그 밖으로 못 나가는데 도화지만 더 클 이유가 없다.
  */
  if (!isSkinHomeCanvasSize(canvas.baseHeight)) {
    return skinHomeCanvasFail(
      `${path}.baseHeight`,
      `canvas.baseHeight는 0보다 크고 ${SKIN_HOME_CANVAS_MAX_COORD} 이하인 숫자여야 합니다(도화지 전체의 세로 길이 — 요소의 height 와 다릅니다).`
    );
  }

  if (!Array.isArray(canvas.elements)) {
    return skinHomeCanvasFail(`${path}.elements`, "canvas.elements는 배열이어야 합니다.");
  }

  if (canvas.elements.length > SKIN_HOME_CANVAS_MAX_ELEMENTS) {
    return skinHomeCanvasFail(
      `${path}.elements`,
      `캔버스 요소는 ${SKIN_HOME_CANVAS_MAX_ELEMENTS}개를 넘을 수 없습니다.`
    );
  }

  const seenIds = new Set();

  for (let i = 0; i < canvas.elements.length; i++) {

    const elementPath = `${path}.elements[${i}]`;

    const result =
      validateSkinCanvasElement(canvas.elements[i], elementPath);

    if (!result.ok) {
      return result;
    }

    const id = canvas.elements[i].id;

    if (seenIds.has(id)) {
      return skinHomeCanvasFail(
        `${elementPath}.id`,
        `id "${id}"가 두 번 쓰였습니다. 요소 id는 캔버스 안에서 유일해야 합니다.`
      );
    }

    seenIds.add(id);

  }

  return { ok: true };

}


/*
  validateSkinHomeCanvasRegions(regions) -> { ok } | { ok:false, path, message }

  Import 가 부르는 유일한 입구다. regions 배열 전체를 훑어
  `home_canvas` 이름의 항목만 본다 — 모르는 이름은 건드리지 않는다.

  ★ 같은 이름이 둘이면 **둘 다** 검사한다. 읽을 때는 앞의 것만
    쓰지만(sides 와 같은 규칙), 뒤의 것이 깨져 있는 파일을 통과
    시키면 나중에 앞의 것을 지웠을 때 갑자기 깨진 것이 드러난다.
*/
function validateSkinHomeCanvasRegions(regions) {

  if (regions === undefined || regions === null) {
    return { ok: true };
  }

  if (!Array.isArray(regions)) {
    return skinHomeCanvasFail("regions", "regions는 배열이어야 합니다.");
  }

  for (let i = 0; i < regions.length; i++) {

    const entry = regions[i];

    if (
      !isSkinHomeCanvasPlainObject(entry) ||
      entry.name !== SKIN_HOME_CANVAS_REGION_NAME
    ) {
      continue;
    }

    const path = `regions[${i}]`;

    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
      return skinHomeCanvasFail(`${path}.enabled`, "enabled는 true 또는 false여야 합니다.");
    }

    /*
      canvas 칸이 아예 없는 `{ "name": "home_canvas" }` 는 통과한다 —
      "이 스킨은 캔버스를 안다"는 기록만 있고 아직 아무것도 놓지
      않은 상태다(sides 의 `{ "name": "right_sidebar" }` 와 같다).
    */
    if (entry.canvas === undefined || entry.canvas === null) {
      continue;
    }

    const result =
      validateSkinCanvasData(entry.canvas, `${path}.canvas`);

    if (!result.ok) {
      return result;
    }

  }

  return { ok: true };

}


/* =========================================================
   3. 읽기 — 보존된 원본

   regions 에서 항목을 찾기만 한다. 아무것도 복사하지 않고 고치지도
   않는다 — 호출자는 이 결과를 **읽기만** 해야 한다.
========================================================== */

function findSkinHomeCanvasRegion(regions) {

  if (!Array.isArray(regions)) {
    return null;
  }

  for (let i = 0; i < regions.length; i++) {

    const entry = regions[i];

    if (
      isSkinHomeCanvasPlainObject(entry) &&
      entry.name === SKIN_HOME_CANVAS_REGION_NAME
    ) {
      /* 같은 이름이 둘이면 앞의 것이 이긴다(sides 와 같은 규칙) */
      return { entry, index: i };
    }

  }

  return null;

}


function readSkinHomeCanvasRegion(skinPackage) {

  const found =
    findSkinHomeCanvasRegion(skinPackage && skinPackage.regions);

  return found ? found.entry : null;

}


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
  const readCurrent =
    (key) =>
      (typeof spec.readCurrent === "function")
        ? spec.readCurrent(current, key)
        : current[key];

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

        const copy = {};

        Object.keys(element).forEach((key) => {
          if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
            copy[key] = element[key];
          }
        });

        spec.keys.forEach((key) => {
          copy[key] = next[key];
        });

        return copy;

      }
    );


  const nextCanvas = {};

  Object.keys(canvas).forEach((key) => {
    if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
      nextCanvas[key] = canvas[key];
    }
  });

  nextCanvas.elements = nextElements;


  const nextRegions =
    regions.map(
      (entry, index) => {

        if (index !== found.index) {
          return entry;
        }

        const copy = {};

        Object.keys(entry).forEach((key) => {
          if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
            copy[key] = entry[key];
          }
        });

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


/* =========================================================
   5. 실행용 payload — 알려진 칸만

   ★ 여기부터가 "보존"이 아니라 "실행"이다.

   결과는 항상 **새 리터럴**이다. 입력 객체와 배열을 mutate 하지
   않고, 입력의 어떤 객체도 결과에 그대로 실리지 않는다(props 까지
   새로 만든다) — 그래서 프레임으로 나가는 값에 모르는 칸이 섞일
   수 없고, 호출자가 결과를 고쳐도 draft 가 바뀌지 않는다.

   undefined 를 돌려주는 경우 = 캔버스를 실행하지 않는다(기존 HOME
   fallback):

     - `home_canvas` 항목이 없다
     - `enabled: false`
     - canvas 칸이 없다
     - 이 배포가 모르는 canvas.version (미래 버전)
     - 저장된 데이터가 계약을 어긴다 (조용히 고치거나 지우지 않는다)
========================================================== */

function buildSkinCanvasRenderPayload(canvas) {

  const check =
    validateSkinCanvasData(canvas, "canvas");

  if (!check.ok || check.future) {
    return undefined;
  }

  /*
    baseWidth 는 v1 고정값이라 상수를 쓰고, baseHeight 는 캔버스마다
    다르므로 **검증을 통과한 그 값**을 싣는다(위 validateSkinCanvasData
    가 이미 양수임을 보장한다).
  */
  return {
    version: SKIN_HOME_CANVAS_VERSION,
    baseWidth: SKIN_HOME_CANVAS_BASE_WIDTH,
    baseHeight: canvas.baseHeight,
    elements: canvas.elements.map(buildSkinCanvasElementPayload)
  };

}


function buildSkinCanvasElementPayload(element) {

  const props =
    isSkinHomeCanvasPlainObject(element.props) ? element.props : {};

  return {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation:
      isSkinHomeCanvasFiniteNumber(element.rotation) ? element.rotation : 0,
    hidden: element.hidden === true,
    locked: element.locked === true,
    props: buildSkinCanvasPropsPayload(element.type, props)
  };

}


function buildSkinCanvasPropsPayload(type, props) {

  if (type === "photo" || type === "sticker") {
    return { slot: props.slot };
  }

  if (type === "logo") {

    const payload = { slot: props.slot };

    payload.fallback =
      SKIN_HOME_CANVAS_LOGO_FALLBACKS.indexOf(props.fallback) !== -1
        ? props.fallback
        : SKIN_HOME_CANVAS_LOGO_FALLBACKS[0];

    return payload;

  }

  if (type === "text") {

    return {
      text: props.text,
      role:
        SKIN_HOME_CANVAS_TEXT_ROLES.indexOf(props.role) !== -1
          ? props.role
          : "body"
    };

  }

  if (type === "category_nav") {

    return {
      mode:
        SKIN_HOME_CANVAS_NAV_MODES.indexOf(props.mode) !== -1
          ? props.mode
          : "all",
      categoryIds:
        Array.isArray(props.categoryIds) ? props.categoryIds.slice() : []
    };

  }

  /* shape */
  return { kind: props.kind };

}


/*
  resolveSkinHomeCanvas(skinPackage, templateHtml) -> payload | undefined

  resolveSkinTemplate() 이 HOME template 에 대해서만 부른다.

  ★ templateHtml 을 함께 받는 이유는 §3 의 표시 위치 계약이다.
    표식이 없거나 둘 이상인 스킨에는 캔버스를 **싣지 않는다** —
    그리면 안 되는 데이터를 프레임까지 보내지 않고, 지금까지의 모든
    스킨에서 봉투가 byte 단위로 그대로다.
*/
function resolveSkinHomeCanvas(skinPackage, templateHtml) {

  if (!skinHtmlHasCanvasRoot(templateHtml)) {
    return undefined;
  }

  const entry =
    readSkinHomeCanvasRegion(skinPackage);

  if (!entry || entry.enabled === false) {
    return undefined;
  }

  if (!isSkinHomeCanvasPlainObject(entry.canvas)) {
    return undefined;
  }

  return buildSkinCanvasRenderPayload(entry.canvas);

}


/*
  coerceSkinHomeCanvasRenderPayload(value) -> payload | undefined

  봉투(sandbox 메시지 · Preview 메시지)에서 **돌아온** 값이다.
  프로토콜이 이미 모양을 검사했지만, 받는 쪽도 한 번 더 자기
  리터럴로 옮긴다 — coerceSkinSidesRenderSetting 과 같은 규칙이다.
*/
function coerceSkinHomeCanvasRenderPayload(value) {

  if (!isSkinHomeCanvasPlainObject(value)) {
    return undefined;
  }

  return buildSkinCanvasRenderPayload(value);

}


if (typeof window !== "undefined") {

  window.SKIN_HOME_CANVAS_REGION_NAME = SKIN_HOME_CANVAS_REGION_NAME;
  window.SKIN_HOME_CANVAS_VERSION = SKIN_HOME_CANVAS_VERSION;
  window.SKIN_HOME_CANVAS_BASE_WIDTH = SKIN_HOME_CANVAS_BASE_WIDTH;
  window.SKIN_HOME_CANVAS_BASE_HEIGHT = SKIN_HOME_CANVAS_BASE_HEIGHT;
  window.SKIN_HOME_CANVAS_ROOT_ATTR = SKIN_HOME_CANVAS_ROOT_ATTR;
  window.SKIN_HOME_CANVAS_ELEMENT_TYPES = SKIN_HOME_CANVAS_ELEMENT_TYPES;

  window.isSkinHomeCanvasAttributeName = isSkinHomeCanvasAttributeName;
  window.sanitizeSkinHomeCanvasAttributeValue = sanitizeSkinHomeCanvasAttributeValue;
  window.countSkinHomeCanvasRoots = countSkinHomeCanvasRoots;
  window.skinHtmlHasCanvasRoot = skinHtmlHasCanvasRoot;

  window.validateSkinCanvasData = validateSkinCanvasData;
  window.validateSkinHomeCanvasRegions = validateSkinHomeCanvasRegions;

  window.findSkinHomeCanvasRegion = findSkinHomeCanvasRegion;
  window.readSkinHomeCanvasRegion = readSkinHomeCanvasRegion;
  window.writeSkinHomeCanvasRegion = writeSkinHomeCanvasRegion;

  /* HOME-CANVAS-TRANSFORM-1A */
  window.writeSkinHomeCanvasElementPosition = writeSkinHomeCanvasElementPosition;

  /* HOME-CANVAS-TRANSFORM-1B */
  window.writeSkinHomeCanvasElementBox = writeSkinHomeCanvasElementBox;

  /* HOME-CANVAS-TRANSFORM-1C */
  window.writeSkinHomeCanvasElementRotation = writeSkinHomeCanvasElementRotation;

  window.createEmptySkinHomeCanvas = createEmptySkinHomeCanvas;
  window.createSkinHomeCanvasElementId = createSkinHomeCanvasElementId;

  window.resolveSkinHomeCanvas = resolveSkinHomeCanvas;
  window.buildSkinCanvasRenderPayload = buildSkinCanvasRenderPayload;
  window.coerceSkinHomeCanvasRenderPayload = coerceSkinHomeCanvasRenderPayload;

}

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SKIN_HOME_CANVAS_REGION_NAME,
    SKIN_HOME_CANVAS_VERSION,
    SKIN_HOME_CANVAS_BASE_WIDTH,
    SKIN_HOME_CANVAS_BASE_HEIGHT,
    SKIN_HOME_CANVAS_ROOT_ATTR,
    SKIN_HOME_CANVAS_ATTRIBUTE_RULES,
    SKIN_HOME_CANVAS_ELEMENT_TYPES,
    SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES,
    SKIN_HOME_CANVAS_AUTO_HEIGHT,
    SKIN_HOME_CANVAS_TEXT_ROLES,
    SKIN_HOME_CANVAS_NAV_MODES,
    SKIN_HOME_CANVAS_SHAPE_KINDS,
    SKIN_HOME_CANVAS_LOGO_FALLBACKS,
    SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN,
    SKIN_HOME_CANVAS_SLOT_NAME_PATTERN,
    SKIN_HOME_CANVAS_MAX_ELEMENTS,
    SKIN_HOME_CANVAS_MAX_TEXT_CHARS,
    SKIN_HOME_CANVAS_MAX_CATEGORY_IDS,
    SKIN_HOME_CANVAS_MAX_CATEGORY_ID_CHARS,
    SKIN_HOME_CANVAS_MAX_COORD,

    isSkinHomeCanvasAttributeName,
    sanitizeSkinHomeCanvasAttributeValue,
    countSkinHomeCanvasRoots,
    skinHtmlHasCanvasRoot,

    validateSkinCanvasElement,
    validateSkinCanvasData,
    validateSkinHomeCanvasRegions,

    findSkinHomeCanvasRegion,
    readSkinHomeCanvasRegion,
    writeSkinHomeCanvasRegion,
    writeSkinHomeCanvasElementPosition,
    writeSkinHomeCanvasElementBox,
    writeSkinHomeCanvasElementRotation,
    createEmptySkinHomeCanvas,
    createSkinHomeCanvasElementId,

    resolveSkinHomeCanvas,
    buildSkinCanvasRenderPayload,
    coerceSkinHomeCanvasRenderPayload
  };

}
