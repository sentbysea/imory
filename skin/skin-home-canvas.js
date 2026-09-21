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

   ── canvas.version — 세 갈래 (HOME-CANVAS-V2-DATA-1) ────
     1     평면 자유 Canvas. 위 모양. 검증하고 **그린다**
     2     조합형 Canvas(로드맵 §14) — `flow.blocks` + `overlays`.
           이 라운드부터 **엄격히 검증**하지만 아직 그리지 않는다
           (DOM renderer 가 다음 작업이다). 통과해도 화면은 기존
           HOME 이고, 실행 봉투에도 실리지 않는다
     3+    내용을 보지 않고 보존만 한다(미래 version)

   - 모르는 이름 · 모르는 칸은 읽지 않고 **그대로 보존**한다.
   - 쓰기 함수는 원래 배열을 바꾸지 않고 새 배열을 돌려준다.
   - `enabled:false` 는 데이터를 **지우지 않는다** — 캔버스를 껐다가
     다시 켜도 요소가 그대로 남는다.
   - 항목이 없는 스킨(= 지금까지의 모든 스킨)이면 렌더 재료에
     `canvas` 키가 생기지 않는다 — sandbox 봉투와 Preview 메시지가
     byte 단위로 그대로다.


   ── 세 파일이다 (HOME-CANVAS-CODE-SPLIT-1) ──────────────
   한 파일이 2,400줄을 넘어서 **동작을 바꾸지 않고** 책임만 갈랐다.
   계약도 공개 함수 이름도 그대로다.

     skin/skin-home-canvas.js        ← 이 파일. 공통 진입점.
                                     상수 · 작은 도구 · 마크업 판정 ·
                                     v1 요소 검증 · version 분기 ·
                                     region 탐색 · 실행 payload
     skin/skin-home-canvas-v2.js     v2(조합형) 값 표와 검증
     skin/skin-home-canvas-write.js  v1 불변 writer(region · geometry ·
                                     글자) 와 빈 캔버스

   ★ 의존은 한 방향이다 — v2 와 write 가 이 파일의 공용 판정을
     빌려 쓴다. 이 파일이 아래를 부르는 곳은 **version 분기 한 줄**
     뿐이다(validateSkinCanvasData → validateSkinCanvasV2Data).
     그래서 로드 순서는 언제나 **이 파일이 먼저**다.

   ★ 세 파일 다 classic script 다. 브라우저에서는 최상위
     const · function 이 한 전역 렉시컬 스코프를 공유하므로 서로를
     그냥 부른다. Node 에는 그 공유 스코프가 없어서(파일마다 모듈
     스코프다) 각 파일이 module.exports 와 **함께** 형제가 부르는
     이름만 globalThis 에 올린다 — 파일 끝의 그 한 블록이 브라우저의
     공유 스코프를 Node 에서 흉내 내는 자리다. require 의 입구는
     언제나 이 파일이고(형제를 여기서 불러 합쳐 낸다), 그래서
     require("skin-home-canvas.js") 의 결과는 가르기 전과 같다.

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
   저장되는 숫자의 **표현**을 정하는 한 곳
   (HOME-CANVAS-TRANSFORM-1C 에서 생겼고, INSPECTOR-1A 에서 여기로
    올라왔다 — 그 전에는 프레임 runtime 안에만 있었다)

   ★ 왜 이 파일인가. 이 규칙을 쓰는 realm 이 셋이다 — Studio 부모의
     왼쪽 패널 입력칸 · native Preview 프레임 · sandbox 프레임.
     셋 다 이 파일을 classic script 로 이미 읽는다(studio/index.html ·
     studio/preview/preview-frame.html · skin/sandbox/frame.html ·
     index.html). 한 벌만 두려면 여기다.

   ★ 검증기는 이 규칙을 **쓰지 않는다.** 계약이 `rotation` 에
     요구하는 것은 여전히 "유한한 숫자" 하나이고(§5), 이미 저장된
     -30 · 400 은 그대로 남는다. 접는 것은 **새로 확정되는 값**
     하나뿐이다 — 쓰는 쪽이 부르고, 순수 함수 writer 는 부르지
     않는다(조용히 고치지 않는다, §9).
========================================================== */

const SKIN_HOME_CANVAS_FULL_TURN = 360;

const SKIN_HOME_CANVAS_COORD_DECIMALS = 1000;


/* 소수점 셋째 자리까지. 정확한 정수면 정수 그대로다(-0 은 0). */
function roundSkinHomeCanvasCoord(value) {

  if (!Number.isFinite(value)) {
    return value;
  }

  const rounded =
    Math.round(value * SKIN_HOME_CANVAS_COORD_DECIMALS) /
    SKIN_HOME_CANVAS_COORD_DECIMALS;

  return Object.is(rounded, -0) ? 0 : rounded;

}


/*
  normalizeSkinHomeCanvasRotation(deg) -> deg

  한 바퀴 안으로 접고 좌표와 같은 자릿수로 반올림한다.

    365 -> 5      -30 -> 330     359.9996 -> 0     400 -> 40

  ★ 제스처 **도중**에는 부르지 않는다. 그때는 연속 각도를 써야
    한 바퀴를 넘는 순간 화면이 반대로 튀지 않는다 — 접는 것은
    확정 한 번뿐이다(계약 §19-3).

  ★ 숫자가 아니면 0 이다(계약 §5 의 기본값).
*/
function normalizeSkinHomeCanvasRotation(deg) {

  if (!Number.isFinite(deg)) {
    return 0;
  }

  const folded =
    ((deg % SKIN_HOME_CANVAS_FULL_TURN) + SKIN_HOME_CANVAS_FULL_TURN) %
    SKIN_HOME_CANVAS_FULL_TURN;

  const rounded =
    roundSkinHomeCanvasCoord(folded);

  /* 359.9999 는 접은 뒤에도 한 바퀴 안이지만, 반올림이 그것을
     360 으로 만들 수 있다 — 그때는 0 이다. */
  return rounded === SKIN_HOME_CANVAS_FULL_TURN ? 0 : rounded;

}


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

/*
  얕은 복사 — 불변 수정이 쓰는 한 줄.

  `__proto__` · `constructor` · `prototype` 은 옮기지 않는다(프로토타입
  오염). 요소 · canvas · regions 항목 · props 네 자리가 같은 규칙을
  써야 하므로 여기 한 곳에 둔다.
*/
function copySkinHomeCanvasObject(source) {

  const copy = {};

  Object.keys(source || {}).forEach((key) => {
    if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
      copy[key] = source[key];
    }
  });

  return copy;

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
  validateSkinCanvasId(id, path, seen) -> { ok } | { ok:false, path, message }

  id 규칙 한 곳이다 — v1 요소 · v2 블록 · 프레임 내부 요소 · overlay 가
  전부 여기에 묻는다(§5-1 · §14-5).

  ★ `seen` 을 주면 **그 이름 공간 안에서 중복까지** 본다. v2 는 블록 ·
    프레임 내부 요소 · overlay 가 **한 이름 공간**이라(§14-5) 걷는
    도중에 등록해야 하고, v1 은 지금까지처럼 validateSkinCanvasData 가
    elements 를 다 본 뒤에 따로 센다(기존 오류 문구를 바꾸지 않는다).
*/
function validateSkinCanvasId(id, path, seen) {

  if (typeof id !== "string" || !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id)) {
    return skinHomeCanvasFail(
      path,
      "id는 영문자로 시작하고 영문자·숫자·_·- 만 쓰는 64자 이하 문자열이어야 합니다."
    );
  }

  if (seen) {

    if (seen.has(id)) {
      return skinHomeCanvasFail(
        path,
        `id "${id}"가 두 번 쓰였습니다. id는 캔버스 하나 안에서(블록 · 프레임 내부 요소 · overlay 전부) 유일해야 합니다.`
      );
    }

    seen.add(id);

  }

  return { ok: true };

}


/*
  validateSkinCanvasElement(element, path, options) -> { ok } | { ok:false, path, message }

  region 이름을 모른다 — 앞으로 좌우 패널 Canvas 가 생겨도 이 함수는
  그대로다(파일 상단 "확장 방향").

  options (전부 선택 — 주지 않으면 지금까지의 v1 판정 그대로다)

    seen        id 이름 공간. 주면 중복 id 도 여기서 걸린다(위).
    requireXY   false 면 x · y 가 **없어도 된다**. `follow:"pin"` 인
                프레임 내부 요소가 그 경우다 — 위치를 anchor 가
                정하므로 x · y 는 보존만 되는 칸이다(§14-6).
                **있으면 모양은 맞아야 한다** — 조용히 버리지 않는다.
*/
function validateSkinCanvasElement(element, path, options) {

  const opts =
    isSkinHomeCanvasPlainObject(options) ? options : {};

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
  const idResult =
    validateSkinCanvasId(element.id, `${path}.id`, opts.seen);

  if (!idResult.ok) {
    return idResult;
  }

  /* x · y */
  for (const axis of ["x", "y"]) {

    if (element[axis] === undefined && opts.requireXY === false) {
      continue;
    }

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
  validateSkinCanvasData(canvas, path)
    -> { ok, future?, version?, renderable? } | { ok:false, path, message }

  ★ 미래 version 은 **실패가 아니다**. `{ ok: true, future: true }` 를
    돌려준다 — 파일은 통과하고(보존), 실행만 하지 않는다(§9).
    이 배포가 모르는 version 의 elements 를 이 배포의 v1 규칙으로
    검사하는 것은 틀린 판정이다.

  ★ **세 갈래다**(HOME-CANVAS-V2-DATA-1).

      version 1   v1 규칙으로 검사하고 **실행한다**(renderable:true)
      version 2   §14 규칙으로 **엄격히 검사**하되 실행하지 않는다
                  (renderable:false — 렌더러가 아직 없다)
      version 3+  내용을 보지 않고 보존만 한다(future:true)

    v2 를 "모르는 version" 자리에서 꺼낸 것이 이 라운드다. 그래서
    v2 파일은 이제 **잘못 적혀 있으면 새 Import 에서 거부**되고,
    올바르면 통과하되 화면은 여전히 기존 HOME 이다.
*/
function validateSkinCanvasData(canvas, path) {

  if (!isSkinHomeCanvasPlainObject(canvas)) {
    return skinHomeCanvasFail(path, "canvas는 객체({...})여야 합니다.");
  }

  if (!Number.isInteger(canvas.version) || canvas.version < 1) {
    return skinHomeCanvasFail(`${path}.version`, "canvas.version은 1 이상의 정수여야 합니다.");
  }

  if (canvas.version === SKIN_HOME_CANVAS_V2_VERSION) {
    return validateSkinCanvasV2Data(canvas, path);
  }

  if (canvas.version !== SKIN_HOME_CANVAS_VERSION) {
    return { ok: true, future: true, renderable: false };
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

  return { ok: true, renderable: true };

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
     - **유효한 v2 조합형 Canvas** — 검증은 하지만 그리는 렌더러가
       아직 없다(HOME-CANVAS-V2-DATA-1). 실행 봉투에 v2 를 싣지
       않으므로 sandbox 프로토콜도 지금과 같다
     - 저장된 데이터가 계약을 어긴다 (조용히 고치거나 지우지 않는다)
========================================================== */

function buildSkinCanvasRenderPayload(canvas) {

  const check =
    validateSkinCanvasData(canvas, "canvas");

  /* 실행 가능한 것은 지금 v1 하나다 — 미래 version 도 유효한 v2 도
     renderable 이 아니다 */
  if (!check.ok || !check.renderable) {
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

  /* HOME-CANVAS-INSPECTOR-1A */
  window.roundSkinHomeCanvasCoord = roundSkinHomeCanvasCoord;
  window.normalizeSkinHomeCanvasRotation = normalizeSkinHomeCanvasRotation;

  window.createSkinHomeCanvasElementId = createSkinHomeCanvasElementId;

  window.resolveSkinHomeCanvas = resolveSkinHomeCanvas;
  window.buildSkinCanvasRenderPayload = buildSkinCanvasRenderPayload;
  window.coerceSkinHomeCanvasRenderPayload = coerceSkinHomeCanvasRenderPayload;

  /*
    ★ SKIN_HOME_CANVAS_V2_VERSION · writeSkinHomeCanvas* ·
      createEmptySkinHomeCanvas 는 여기 없다. 그 값들은 형제 파일이
      선언하고(skin-home-canvas-v2.js · skin-home-canvas-write.js),
      **자기 파일에서** window 에 올린다 — 이 스크립트가 먼저 도므로
      여기서 적으면 아직 선언되지 않은 이름을 읽는다(TDZ).
  */

}


if (typeof module !== "undefined" && module.exports) {

  /*
    ★ Node 에는 classic script 의 공유 전역이 없다(파일 상단 "세 파일이다").
      형제가 call time 에 찾는 이름을 globalThis 에 올린 **뒤에** 형제를
      부른다 — 그러면 브라우저와 같은 결선이 된다.
  */
  Object.assign(globalThis, {
    SKIN_HOME_CANVAS_REGION_NAME,
    SKIN_HOME_CANVAS_VERSION,
    SKIN_HOME_CANVAS_BASE_WIDTH,
    SKIN_HOME_CANVAS_BASE_HEIGHT,
    SKIN_HOME_CANVAS_ELEMENT_TYPES,
    SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES,
    SKIN_HOME_CANVAS_AUTO_HEIGHT,
    SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN,
    SKIN_HOME_CANVAS_MAX_ELEMENTS,
    SKIN_HOME_CANVAS_MAX_TEXT_CHARS,
    SKIN_HOME_CANVAS_MAX_COORD,
    isSkinHomeCanvasPlainObject,
    isSkinHomeCanvasFiniteNumber,
    isSkinHomeCanvasCoord,
    isSkinHomeCanvasSize,
    copySkinHomeCanvasObject,
    skinHomeCanvasFail,
    validateSkinCanvasId,
    validateSkinCanvasElement,
    validateSkinCanvasElementProps,
    findSkinHomeCanvasRegion
  });

  /* 가르기 전과 **같은 한 덩어리**를 낸다 — require 의 입구는 이 파일이다 */
  const v2 = require("./skin-home-canvas-v2.js");
  const write = require("./skin-home-canvas-write.js");

  module.exports = Object.assign({
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
    roundSkinHomeCanvasCoord,
    normalizeSkinHomeCanvasRotation,
    createSkinHomeCanvasElementId,

    resolveSkinHomeCanvas,
    buildSkinCanvasRenderPayload,
    coerceSkinHomeCanvasRenderPayload
  }, v2, write);

}
