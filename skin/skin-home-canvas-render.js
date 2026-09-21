/* =========================================================
   SKIN HOME CANVAS RENDER — HOME 캔버스의 **정적 렌더러**
   (HOME-CANVAS-RENDER-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ── 둘로 나뉜다 ─────────────────────────────────────────
     skin/skin-home-canvas.js         데이터 — 찾기 · 검증 · 실행 payload
     skin/skin-home-canvas-render.js  ← 이 파일. DOM 생성 · 갱신 · 제거
     skin/skin-home-canvas-render.css 좌표 표현에 필요한 **구조** CSS

   색 · 글꼴 · 테두리 · 배경 · 장식은 한 줄도 여기 없다. 그것은
   스킨 CSS 의 몫이다(계약 문서 §8) — 요소마다 붙는
   `data-imory-edit-id="<element.id>"` 가 그 선택자다.

   ── 이 라운드가 하는 것 / 하지 않는 것 ──────────────────
   한다:   공개 native HOME · Studio native Preview 에서 저장된
           Canvas 를 같은 DOM · 같은 좌표로 그린다.
   안 한다: sandbox 프레임 렌더(RENDER-1B) · 선택 · 드래그 · 크기 ·
           회전 · Inspector · Undo · preset · 위젯. 조작 UI 가
           하나도 없다 — 이 파일은 리스너를 단 하나도 만들지 않는다.

   ★ sandbox 프레임에 이 파일이 없다

   판정은 "renderSkin 이 부르는가"가 아니라 **문서가 이 파일을
   로드했는가**다. skin/sandbox/frame.html 은 이 파일을 로드하지
   않으므로(그리고 core/lib/skin-sandbox-server.js 의 allowlist 에도
   없으므로) 프레임 안에서는 compileSkinHomeCanvas 가 아예 정의되지
   않고, 프레임은 지금까지와 같은 HOME 을 그린다. sides · settings 가
   쓰는 `typeof … === "function"` 관문과 같은 규칙이다.

   ── 좌표를 어떻게 그리는가 ─────────────────────────────
   저장 좌표는 `baseWidth`(390) × `baseHeight` 자 위의 숫자다. 실제
   화면 폭은 template 와 스킨 CSS 가 정한다. 둘을 잇는 방법으로
   **ResizeObserver 도 매 프레임 재계산도 쓰지 않는다** — 표식에
   `aspect-ratio: baseWidth / baseHeight` 를 주어 세로를 가로에
   묶고, 요소의 x · y · width · height 를 **백분율**로 적는다.
   백분율은 표식 상자를 기준으로 풀리므로 표식이 넓어지면 네 값이
   **같은 배율로** 함께 커진다.

     left   = x      / baseWidth  * 100%
     top    = y      / baseHeight * 100%
     width  = width  / baseWidth  * 100%
     height = height / baseHeight * 100%

   회전은 `transform: rotate()` 이고 transform-origin 기본값이
   요소 **중심**이라 계약(§4)이 그대로 성립한다.

   ── 왜 style 속성이 아니라 CSSOM 인가 ──────────────────
   skin/skin-layout.js 와 같은 이유다. `style` 속성은 sanitizer 가
   전면 금지하고 sandbox 프레임의 CSP 에는 style-src 'unsafe-inline'
   이 없다. element.style.setProperty() 같은 **CSSOM 쓰기는 CSP 가
   막지 않는다**. 그래서 이 파일은 검증된 숫자로 만든 custom
   property 만 써 넣고, 실제 배치 규칙은 플랫폼 스타일시트 한 장
   (skin/skin-home-canvas-render.css)이 그 값을 읽어 적용한다.

   **사용자 문자열은 CSS 문자열에 한 글자도 섞이지 않는다** — 좌표는
   실행 payload 가 이미 유한한 숫자로 검증한 값이고, 이 파일은 그
   숫자를 다시 한 번 확인한 뒤에만 쓴다(계약 문서 §5).

   ── 무엇을 다시 그려도 안전한가 ────────────────────────
   compileSkinHomeCanvas() 는 자기가 만든 자식만 걷어내고 다시
   만든다. 표식 자체와 스킨이 표식에 준 class · 속성은 건드리지
   않는다. 캔버스가 사라지거나 꺼지면 만든 DOM 과 활성 표시만
   정리한다.

   ★ 자기가 만든 자식을 무엇으로 아는가

   `data-imory-canvas-element` 다. 이 속성은 저장 경계의 화이트리스트
   (skin/skin-sanitize.js)에 **없으므로** 스킨 HTML 에서 올 수 없다 —
   표식 안에 스킨이 직접 적어 둔 자식이 있어도 그것은 지워지지 않는다.

   classic script 다(ES 모듈이 아니다) — skin-sides.js · skin-layout.js
   와 같고, 노드 단위 테스트를 위해 module.exports 로도 낸다.
   의존: 같은 문서에 skin-home-canvas.js(실행 payload 재확인)와
   skin-sanitize.js(isSafeSkinUrl)가 먼저 로드되어 있어야 한다.
   둘 다 없어도 던지지 않는다 — 안전한 쪽(그리지 않음)으로 간다.
========================================================== */


/* 표시 위치 — skin/skin-home-canvas.js 의 SKIN_HOME_CANVAS_ROOT_ATTR
   와 같은 이름이다. 이 파일은 그 파일 없이도 "표식을 찾는 것"까지는
   할 수 있어야 해서 한 번 더 적고, 단위 테스트가 둘을 대조한다. */
const SKIN_CANVAS_RENDER_ROOT_ATTR = "data-imory-canvas-root";

/* 렌더러가 얹는 상태 — 저장되는 HTML 에는 들어갈 수 없다(위 ★) */
const SKIN_CANVAS_RENDER_ACTIVE_ATTR = "data-imory-canvas-active";
const SKIN_CANVAS_RENDER_VERSION_ATTR = "data-imory-canvas-version";
const SKIN_CANVAS_RENDER_ELEMENT_ATTR = "data-imory-canvas-element";
const SKIN_CANVAS_RENDER_TYPE_ATTR = "data-imory-canvas-type";
const SKIN_CANVAS_RENDER_HEIGHT_ATTR = "data-imory-canvas-height";
const SKIN_CANVAS_RENDER_HIDDEN_ATTR = "data-imory-canvas-hidden";
const SKIN_CANVAS_RENDER_LOCKED_ATTR = "data-imory-canvas-locked";
const SKIN_CANVAS_RENDER_ROLE_ATTR = "data-imory-canvas-role";
const SKIN_CANVAS_RENDER_SHAPE_ATTR = "data-imory-canvas-shape";
const SKIN_CANVAS_RENDER_NAV_MODE_ATTR = "data-imory-canvas-nav-mode";
const SKIN_CANVAS_RENDER_NAV_ATTR = "data-imory-canvas-nav";
const SKIN_CANVAS_RENDER_NAV_ITEM_ATTR = "data-imory-canvas-nav-item";
const SKIN_CANVAS_RENDER_TEXT_ATTR = "data-imory-canvas-text";
const SKIN_CANVAS_RENDER_IMAGE_ATTR = "data-imory-canvas-image";
const SKIN_CANVAS_RENDER_LOGO_TEXT_ATTR = "data-imory-canvas-logo-text";

/* Studio Inspector 가 나중에 이 선택자로 CSS 를 고친다(계약 §8) */
const SKIN_CANVAS_RENDER_EDIT_ID_ATTR = "data-imory-edit-id";

/* skin/skin-home-canvas.js SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN 과
   같은 규칙. 여기서 한 번 더 보는 이유는 이 값이 DOM 속성이 되기
   때문이다 — 실행 payload 가 이미 걸렀지만 관문을 겹친다. */
const SKIN_CANVAS_RENDER_ELEMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* 이미지 슬롯 이름 — Object.prototype 을 긁지 않기 위한 1차 관문 */
const SKIN_CANVAS_RENDER_SLOT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

/* custom property 이름 */
const SKIN_CANVAS_RENDER_VARS = {
  baseWidth: "--imory-canvas-base-width",
  baseHeight: "--imory-canvas-base-height",
  x: "--imory-canvas-x",
  y: "--imory-canvas-y",
  width: "--imory-canvas-width",
  height: "--imory-canvas-height",
  rotation: "--imory-canvas-rotation"
};


/* =========================================================
   0. 작은 도구 — 숫자만 CSS 로 간다
========================================================== */

function isSkinCanvasRenderNumber(value) {

  return typeof value === "number" && Number.isFinite(value);

}


/*
  소수 여섯 자리까지. 390px 도화지에서 0.000001% 는 4e-6 px 이라
  눈에도 측정에도 남지 않는다. 꼬리 0 을 떼어 두 화면의 문자열이
  같게 만든다(공개 native ↔ Studio Preview 대조가 문자열 비교다).
*/
function skinCanvasRenderTrimNumber(value) {

  const text = value.toFixed(6);

  if (text.indexOf(".") === -1) {
    return text;
  }

  return text.replace(/\.?0+$/, "") || "0";

}


function skinCanvasRenderPercent(value, base) {

  if (!isSkinCanvasRenderNumber(value) || !isSkinCanvasRenderNumber(base) || base <= 0) {
    return null;
  }

  return skinCanvasRenderTrimNumber((value / base) * 100) + "%";

}


function setSkinCanvasRenderVar(el, name, value) {

  if (value === null) {
    el.style.removeProperty(name);
    return;
  }

  el.style.setProperty(name, value);

}


/* =========================================================
   0-1. 좌표를 쓰는 **한 곳** (HOME-CANVAS-TRANSFORM-1A)

   ★ 편집기가 이 계산을 복제하지 않게 한다.

   드래그 중의 임시 위치도, 확정된 뒤 다시 그려진 위치도 결국
   같은 두 custom property(`--imory-canvas-x` · `--imory-canvas-y`)
   다. 그 값을 만드는 규칙(백분율 · 소수 여섯 자리 · 꼬리 0 제거)을
   편집 runtime 이 자기 쪽에 한 벌 더 적으면, 한쪽만 고쳐지는 날
   드래그 중과 확정 뒤의 자리가 미세하게 달라진다.

   그래서 렌더러가 요소를 처음 만들 때 쓰는 그 함수를 그대로
   내보내고(skin/skin-home-canvas-editor-runtime.js 가 부른다),
   이것이 없는 문서에서는 편집기가 **이동을 켜지 않는다**.

   ★ transform 을 건드리지 않는다. 회전은 `--imory-canvas-rotation`
     이 갖고 있고 이 함수는 x · y 두 칸만 쓴다 — 임시 translate()
     를 덧붙이지 않으므로 회전한 요소도 그대로 돈다.
========================================================== */

function setSkinCanvasElementPosition(el, x, y, baseWidth, baseHeight) {

  if (!el || !el.style) {
    return false;
  }

  const left =
    skinCanvasRenderPercent(x, baseWidth);

  const top =
    skinCanvasRenderPercent(y, baseHeight);

  if (left === null || top === null) {
    return false;
  }

  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.x, left);
  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.y, top);

  return true;

}


/*
  readSkinCanvasElementPositionVars(el) -> { x, y } | null

  지금 요소에 적혀 있는 **원본 문자열** 둘. 드래그를 취소할 때
  그대로 되돌려 쓰기 위한 것이라 숫자로 바꾸지 않는다 — 다시
  파싱해서 다시 쓰면 위에서 한 번 버린 자릿수가 두 번 버려진다.
*/
function readSkinCanvasElementPositionVars(el) {

  if (!el || !el.style) {
    return null;
  }

  return {
    x: el.style.getPropertyValue(SKIN_CANVAS_RENDER_VARS.x),
    y: el.style.getPropertyValue(SKIN_CANVAS_RENDER_VARS.y)
  };

}


function restoreSkinCanvasElementPositionVars(el, saved) {

  if (!el || !el.style || !saved) {
    return false;
  }

  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.x, saved.x || null);
  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.y, saved.y || null);

  return true;

}


/* =========================================================
   0-2. 크기를 쓰는 **한 곳** (HOME-CANVAS-TRANSFORM-1B)

   ★ 요소 하나의 geometry 를 쓰는 함수는 이 파일에 **하나**다.

   아래 applySkinCanvasElementBox() 는 렌더러가 요소를 처음 만들 때
   (buildSkinCanvasElementNode) 와 편집기가 리사이즈 중 임시로 고칠
   때 **둘 다** 부르는 그 함수다. 백분율 · 자릿수 · `height:"auto"`
   판정을 두 벌 두지 않기 위한 것이고, 이것이 없는 문서에서는
   편집기가 **리사이즈를 켜지 않는다**.

   ★ `height` 는 숫자이거나 `"auto"` 다.

   숫자면 `--imory-canvas-height` 와 `data-imory-canvas-height="fixed"`,
   `"auto"` 면 그 칸을 **지우고** `"auto"` 로 적는다(계약 §6). 둘 다
   한 함수 안에 있어야 "숫자로 바뀌었는데 속성은 auto 로 남았다"가
   생기지 않는다.

   ★ transform 을 건드리지 않는다 — 회전은 `--imory-canvas-rotation`
     이 갖고 있고 이 함수는 네 칸만 쓴다.
========================================================== */

function applySkinCanvasElementBox(el, box, baseWidth, baseHeight) {

  if (!el || !el.style || !box) {
    return false;
  }

  const left =
    skinCanvasRenderPercent(box.x, baseWidth);

  const top =
    skinCanvasRenderPercent(box.y, baseHeight);

  const width =
    skinCanvasRenderPercent(box.width, baseWidth);

  if (left === null || top === null || width === null) {
    return false;
  }

  /* 숫자 높이는 비율까지 만들어 본 뒤에 쓴다 — 하나라도 만들 수
     없으면 **한 칸도 쓰지 않는다**(반쪽만 적용된 geometry 금지) */
  const fixedHeight =
    isSkinCanvasRenderNumber(box.height)
      ? skinCanvasRenderPercent(box.height, baseHeight)
      : null;

  if (isSkinCanvasRenderNumber(box.height) && fixedHeight === null) {
    return false;
  }

  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.x, left);
  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.y, top);
  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.width, width);

  if (fixedHeight !== null) {

    el.setAttribute(SKIN_CANVAS_RENDER_HEIGHT_ATTR, "fixed");

    setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.height, fixedHeight);

  } else {

    /*
      `"auto"` — 고정 높이를 주지 않는다. 내용이 정한다(계약 §6).
      ★ 칸을 **지운다**. 남겨 두면 나중에 CSS 가 그 변수를 다시
        읽게 되는 날 옛 높이가 되살아난다.
    */
    el.setAttribute(SKIN_CANVAS_RENDER_HEIGHT_ATTR, "auto");

    setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.height, null);

  }

  return true;

}


/*
  setSkinCanvasElementBox(el, box, baseWidth, baseHeight)

  편집기가 부르는 이름. 위 함수 그대로다 — 렌더러 쪽 이름과 편집기
  쪽 이름을 가르는 이유는, 편집기가 `window` 에서 찾는 이름이
  하나로 고정되어야 "이 문서가 그 계산을 갖고 있는가"를 한 줄로
  물어볼 수 있기 때문이다(editor-runtime 의 positionApi()).
*/
function setSkinCanvasElementBox(el, box, baseWidth, baseHeight) {

  return applySkinCanvasElementBox(el, box, baseWidth, baseHeight);

}


/*
  readSkinCanvasElementBoxVars(el) -> { x, y, width, height, heightMode }

  지금 요소에 적혀 있는 **원본 문자열** 넷과 높이 모드. 제스처를
  취소할 때 그대로 되돌려 쓰기 위한 것이라 숫자로 바꾸지 않는다 —
  다시 파싱해서 다시 쓰면 한 번 버린 자릿수가 두 번 버려진다.
*/
function readSkinCanvasElementBoxVars(el) {

  if (!el || !el.style) {
    return null;
  }

  return {
    x: el.style.getPropertyValue(SKIN_CANVAS_RENDER_VARS.x),
    y: el.style.getPropertyValue(SKIN_CANVAS_RENDER_VARS.y),
    width: el.style.getPropertyValue(SKIN_CANVAS_RENDER_VARS.width),
    height: el.style.getPropertyValue(SKIN_CANVAS_RENDER_VARS.height),
    heightMode: el.getAttribute(SKIN_CANVAS_RENDER_HEIGHT_ATTR) || ""
  };

}


function restoreSkinCanvasElementBoxVars(el, saved) {

  if (!el || !el.style || !saved) {
    return false;
  }

  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.x, saved.x || null);
  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.y, saved.y || null);
  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.width, saved.width || null);
  setSkinCanvasRenderVar(el, SKIN_CANVAS_RENDER_VARS.height, saved.height || null);

  /* 높이 모드도 되돌린다 — `"auto"` 에서 숫자로 바꾸던 제스처를
     취소하면 속성까지 `"auto"` 로 돌아가야 한다 */
  if (saved.heightMode === "fixed" || saved.heightMode === "auto") {
    el.setAttribute(SKIN_CANVAS_RENDER_HEIGHT_ATTR, saved.heightMode);
  }

  return true;

}


/* =========================================================
   1. Context 읽기 — 기존 경로를 그대로 쓴다

   이미지는 이미 있는 이미지 슬롯(context.images), 카테고리는 이미
   있는 Context(context.navigation.categories), 블로그 제목은
   context.site.title 이다. **새 저장 방식도 새 라우터도 만들지
   않는다**(계약 §7 · 작업 지침 §2).
========================================================== */

function readSkinCanvasImageUrl(context, slot) {

  if (typeof slot !== "string" || !SKIN_CANVAS_RENDER_SLOT_NAME_PATTERN.test(slot)) {
    return null;
  }

  const images = context && context.images;

  if (!images || typeof images !== "object") {
    return null;
  }

  /* 슬롯 이름이 "constructor" 여도 프로토타입을 긁지 않는다 */
  if (!Object.prototype.hasOwnProperty.call(images, slot)) {
    return null;
  }

  const value = images[slot];

  if (typeof value !== "string" || !value) {
    return null;
  }

  /* skin-render.js 의 URL 바인딩과 같은 단일 판정 함수 */
  if (typeof isSafeSkinUrl === "function" && !isSafeSkinUrl(value)) {
    return null;
  }

  return value;

}


function readSkinCanvasSiteTitle(context) {

  const title = context && context.site && context.site.title;

  return typeof title === "string" ? title : "";

}


/*
  mode:"all"      -> 표시 가능한 카테고리 전체(스킨 메뉴가 쓰는 그 배열)
  mode:"selected" -> categoryIds 순서대로, 없는 id 는 건너뛴다

  ★ 저장 데이터를 고치지 않는다 — 없는 id 는 이번 화면에서 빠질 뿐
    props.categoryIds 에 그대로 남는다.
*/
function readSkinCanvasCategories(context, props) {

  const all =
    (context && context.navigation && Array.isArray(context.navigation.categories))
      ? context.navigation.categories
      : [];

  if (props.mode !== "selected") {
    return all.slice();
  }

  const ids = Array.isArray(props.categoryIds) ? props.categoryIds : [];

  const picked = [];

  ids.forEach((wanted) => {

    if (typeof wanted !== "string" || !wanted) {
      return;
    }

    const hit =
      all.find((item) => item && String(item.id) === wanted);

    if (hit) {
      picked.push(hit);
    }

  });

  return picked;

}


/* =========================================================
   2. 요소 하나의 DOM

   최상위는 **항상 div** 다. 종류마다 바깥 상자의 태그가 달라지면
   좌표 · 회전 · 앞뒤 순서를 다루는 규칙이 종류마다 갈라지고, 나중에
   붙을 조작 손잡이(SELECT-1)도 대상 태그를 하나로 못 잡는다.
   의미가 있는 태그(p · ul · a · img)는 그 안에 넣는다.
========================================================== */

function buildSkinCanvasElementNode(doc, element, canvas, context) {

  const node = doc.createElement("div");

  node.setAttribute(SKIN_CANVAS_RENDER_ELEMENT_ATTR, "");
  node.setAttribute(SKIN_CANVAS_RENDER_TYPE_ATTR, element.type);

  if (
    typeof element.id === "string" &&
    SKIN_CANVAS_RENDER_ELEMENT_ID_PATTERN.test(element.id)
  ) {
    node.setAttribute(SKIN_CANVAS_RENDER_EDIT_ID_ATTR, element.id);
  }

  /* ── 좌표와 크기 ──

     ★ 편집기가 리사이즈 중에 부르는 그 함수다(§0-2). 백분율 ·
       자릿수 · `height:"auto"` 판정을 여기 한 벌 더 적지 않는다 —
       두 벌이 되면 한쪽만 고쳐지는 날 "끄는 동안"과 "다시 그린 뒤"
       의 크기가 미세하게 달라진다.

     height:"auto" 는 "높이를 적지 않는다"이지 "높이를 못 고친다"가
     아니다(계약 §6). 고정 높이를 주지 않고 내용이 정하게 둔다. */

  applySkinCanvasElementBox(
    node,
    { x: element.x, y: element.y, width: element.width, height: element.height },
    canvas.baseWidth,
    canvas.baseHeight
  );

  /* 회전 중심은 요소 중심이다 — transform-origin 기본값이 그것이라
     따로 적지 않는다(적으면 스킨이 바꿀 여지만 줄어든다). */
  setSkinCanvasRenderVar(node, SKIN_CANVAS_RENDER_VARS.rotation,
    skinCanvasRenderTrimNumber(
      isSkinCanvasRenderNumber(element.rotation) ? element.rotation : 0
    ) + "deg");

  /* ── 상태 ── */

  if (element.hidden === true) {
    /* `hidden` 속성이 실제로 감추고, data 속성은 재는 쪽과 스킨
       CSS 가 상태를 볼 수 있게 한다. 플랫폼 CSS 가 display 를
       건드리지 않으므로 UA 의 [hidden] 이 그대로 이긴다. */
    node.hidden = true;
    node.setAttribute(SKIN_CANVAS_RENDER_HIDDEN_ATTR, "true");
  }

  if (element.locked === true) {
    /* 공개 화면의 모양을 바꾸지 않는다 — 표시만 한다(계약 §5) */
    node.setAttribute(SKIN_CANVAS_RENDER_LOCKED_ATTR, "true");
  }

  /* ── 종류별 내용 ── */

  fillSkinCanvasElementNode(doc, node, element, context);

  return node;

}


function fillSkinCanvasElementNode(doc, node, element, context) {

  const props =
    (element.props && typeof element.props === "object") ? element.props : {};

  if (element.type === "photo" || element.type === "sticker") {

    /* 빈 슬롯이어도 최상위 wrapper 는 남는다 — 플랫폼 기본
       placeholder 디자인을 넣지 않는다(계약 §6 · §7). */
    const url = readSkinCanvasImageUrl(context, props.slot);

    if (url) {
      node.appendChild(buildSkinCanvasImage(doc, url, ""));
    }

    return;

  }

  if (element.type === "logo") {

    const url = readSkinCanvasImageUrl(context, props.slot);
    const title = readSkinCanvasSiteTitle(context);

    if (url) {
      /* alt 는 지금 이 블로그의 실제 제목이다 */
      node.appendChild(buildSkinCanvasImage(doc, url, title));
      return;
    }

    if (props.fallback === "site_title" && title) {

      const span = doc.createElement("span");
      span.setAttribute(SKIN_CANVAS_RENDER_LOGO_TEXT_ATTR, "");
      span.textContent = title;
      node.appendChild(span);

    }

    return;

  }

  if (element.type === "text") {

    const role =
      typeof props.role === "string" && props.role ? props.role : "body";

    /* 의미 역할일 뿐이다 — 플랫폼은 role 로 글자 크기도 색도 주지
       않는다(계약 §8). 스킨 CSS 가 이 속성을 선택자로 쓴다. */
    node.setAttribute(SKIN_CANVAS_RENDER_ROLE_ATTR, role);

    const p = doc.createElement("p");
    p.setAttribute(SKIN_CANVAS_RENDER_TEXT_ATTR, "");

    /*
      textContent 다 — 사용자 문자열을 innerHTML 로 넣지 않는다.
      줄바꿈은 플랫폼 CSS 의 white-space 가 살린다(내용 보존이지
      시각 디자인이 아니다).
    */
    p.textContent = typeof props.text === "string" ? props.text : "";

    node.appendChild(p);

    return;

  }

  if (element.type === "category_nav") {

    const mode = props.mode === "selected" ? "selected" : "all";

    node.setAttribute(SKIN_CANVAS_RENDER_NAV_MODE_ATTR, mode);

    const items = readSkinCanvasCategories(context, props);

    /* 빈 결과면 wrapper 만 남는다 — 가짜 항목을 채우지 않는다 */
    if (!items.length) {
      return;
    }

    const list = doc.createElement("ul");
    list.setAttribute(SKIN_CANVAS_RENDER_NAV_ATTR, "");

    items.forEach((item) => {

      const li = doc.createElement("li");

      /*
        버튼이 아니라 실제 링크다. href 는 Context 가 이미 만든
        내부 주소이고(skin/skin-context.js buildSitePath), 클릭은
        기존 공통 라우팅(skin/skin-link-nav.js)이 가져간다 —
        별도 라우터를 만들지 않는다(작업 지침 §2).
      */
      const link = doc.createElement("a");
      link.setAttribute(SKIN_CANVAS_RENDER_NAV_ITEM_ATTR, "");

      if (
        typeof item.href === "string" &&
        (typeof isSafeSkinUrl !== "function" || isSafeSkinUrl(item.href))
      ) {
        link.setAttribute("href", item.href);
      }

      link.textContent = typeof item.name === "string" ? item.name : "";

      li.appendChild(link);
      list.appendChild(li);

    });

    node.appendChild(list);

    return;

  }

  if (element.type === "shape") {

    /*
      플랫폼은 "무슨 도형인가"만 알려 준다. fill · stroke · 두께 ·
      색은 전부 스킨 CSS 다 — 렌더러가 임의의 검정 도형을 칠하지
      않는다(계약 §8).
    */
    const kind =
      (props.kind === "ellipse" || props.kind === "line") ? props.kind : "rect";

    node.setAttribute(SKIN_CANVAS_RENDER_SHAPE_ATTR, kind);

  }

}


function buildSkinCanvasImage(doc, url, alt) {

  const img = doc.createElement("img");

  img.setAttribute(SKIN_CANVAS_RENDER_IMAGE_ATTR, "");
  img.setAttribute("src", url);

  /* 기본 alt 는 빈 문자열 — 장식 사진에 가짜 설명을 붙이지 않는다 */
  img.setAttribute("alt", typeof alt === "string" ? alt : "");

  return img;

}


/* =========================================================
   3. 표식 하나에 그리기 · 지우기
========================================================== */

function findSkinCanvasOwnedChildren(marker) {

  return Array.prototype.filter.call(
    marker.children,
    (child) =>
      child.nodeType === 1 &&
      child.hasAttribute &&
      child.hasAttribute(SKIN_CANVAS_RENDER_ELEMENT_ATTR)
  );

}


/*
  clearSkinHomeCanvas(marker)

  렌더러가 만든 것만 걷어낸다. 표식 자체 · 스킨이 표식에 준
  class 와 속성 · 스킨이 표식 안에 직접 적어 둔 자식은 남는다.
*/
function clearSkinHomeCanvas(marker) {

  if (!marker || typeof marker.removeAttribute !== "function") {
    return;
  }

  findSkinCanvasOwnedChildren(marker).forEach((child) => {
    marker.removeChild(child);
  });

  marker.removeAttribute(SKIN_CANVAS_RENDER_ACTIVE_ATTR);
  marker.removeAttribute(SKIN_CANVAS_RENDER_VERSION_ATTR);

  marker.style.removeProperty(SKIN_CANVAS_RENDER_VARS.baseWidth);
  marker.style.removeProperty(SKIN_CANVAS_RENDER_VARS.baseHeight);

}


function renderSkinHomeCanvasInto(marker, canvas, context) {

  const doc = marker.ownerDocument;

  /* 다시 그려도 중복되지 않는다 — 먼저 자기 것만 걷어낸다 */
  findSkinCanvasOwnedChildren(marker).forEach((child) => {
    marker.removeChild(child);
  });

  marker.setAttribute(SKIN_CANVAS_RENDER_ACTIVE_ATTR, "true");
  marker.setAttribute(SKIN_CANVAS_RENDER_VERSION_ATTR, String(canvas.version));

  /*
    도화지의 비율. 요소 위치로 다시 계산하지 않는다 — 아래쪽에
    일부러 둔 여백이 사라지지 않게(계약 §4-1).
  */
  setSkinCanvasRenderVar(marker, SKIN_CANVAS_RENDER_VARS.baseWidth,
    skinCanvasRenderTrimNumber(canvas.baseWidth));

  setSkinCanvasRenderVar(marker, SKIN_CANVAS_RENDER_VARS.baseHeight,
    skinCanvasRenderTrimNumber(canvas.baseHeight));

  /* 배열 순서가 곧 앞뒤 순서다 — 별도 z-index 를 만들지 않는다 */
  canvas.elements.forEach((element) => {
    marker.appendChild(
      buildSkinCanvasElementNode(doc, element, canvas, context)
    );
  });

}


/* =========================================================
   4. 입구 — renderSkin() 이 mount 끝에 한 번 부른다

   compileSkinHomeCanvas(root, canvas, context) -> Element | null

   돌려주는 값은 실제로 그린 표식(없으면 null)이다.

   ★ 그리지 않는 경우에는 **기존 HOME DOM 을 한 글자도 건드리지
     않는다**(계약 §3 의 fallback 표).

     표식 없음        기존 HOME
     표식 둘 이상     기존 HOME (표식을 고르지 않는다)
     실행 payload 없음 기존 HOME
     데이터가 깨짐     기존 HOME (원본은 regions 에 그대로 남는다)
     미래 version      기존 HOME

   표식을 **자동으로 만들지 않는다.**

   `enabled:false` 와 "HOME 인가"는 이 함수가 보지 않는다 — 그 둘은
   실행 payload 를 만드는 자리(skin/skin-template.js resolveSkinTemplate
   → resolveSkinHomeCanvas)에서 이미 갈린다. 캔버스가 아닌 화면과
   꺼진 캔버스에서는 `skin.canvas` 키 자체가 없다.
========================================================== */

function compileSkinHomeCanvas(root, canvas, context) {

  if (!root || typeof root.querySelectorAll !== "function") {
    return null;
  }

  const markers =
    root.querySelectorAll("[" + SKIN_CANVAS_RENDER_ROOT_ATTR + "]");

  /*
    정확히 하나일 때만 그린다. 둘 이상이면 "어느 쪽이 그 캔버스인가"를
    렌더러가 임의로 고를 수 없다 — 기존 HOME 으로 간다.
  */
  if (markers.length !== 1) {

    /* 전에 그린 것이 남아 있으면(스킨을 바꿔 표식이 늘어난 경우)
       그것만 정리한다. 없으면 아무 일도 일어나지 않는다. */
    Array.prototype.forEach.call(markers, clearSkinHomeCanvas);

    return null;

  }

  const marker = markers[0];

  /*
    봉투에서 돌아온 값이든 같은 realm 에서 만든 값이든, 받는 쪽이
    한 번 더 자기 리터럴로 옮긴다(계약 §9). 이 관문이 미래 version ·
    깨진 데이터 · 모르는 칸을 전부 걸러 준다.
  */
  const payload =
    typeof coerceSkinHomeCanvasRenderPayload === "function"
      ? coerceSkinHomeCanvasRenderPayload(canvas)
      : undefined;

  if (!payload || !Array.isArray(payload.elements)) {
    clearSkinHomeCanvas(marker);
    return null;
  }

  renderSkinHomeCanvasInto(marker, payload, context);

  return marker;

}


if (typeof window !== "undefined") {

  window.SKIN_CANVAS_RENDER_ROOT_ATTR = SKIN_CANVAS_RENDER_ROOT_ATTR;
  window.SKIN_CANVAS_RENDER_ELEMENT_ATTR = SKIN_CANVAS_RENDER_ELEMENT_ATTR;
  window.SKIN_CANVAS_RENDER_VARS = SKIN_CANVAS_RENDER_VARS;

  /* HOME-CANVAS-TRANSFORM-1A — 편집 runtime 이 좌표를 쓰는 한 곳 */
  window.setSkinCanvasElementPosition = setSkinCanvasElementPosition;
  window.readSkinCanvasElementPositionVars = readSkinCanvasElementPositionVars;
  window.restoreSkinCanvasElementPositionVars = restoreSkinCanvasElementPositionVars;

  /* HOME-CANVAS-TRANSFORM-1B — 편집 runtime 이 **크기**를 쓰는 한 곳 */
  window.setSkinCanvasElementBox = setSkinCanvasElementBox;
  window.readSkinCanvasElementBoxVars = readSkinCanvasElementBoxVars;
  window.restoreSkinCanvasElementBoxVars = restoreSkinCanvasElementBoxVars;

  window.compileSkinHomeCanvas = compileSkinHomeCanvas;
  window.clearSkinHomeCanvas = clearSkinHomeCanvas;

}

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SKIN_CANVAS_RENDER_ROOT_ATTR,
    SKIN_CANVAS_RENDER_ACTIVE_ATTR,
    SKIN_CANVAS_RENDER_VERSION_ATTR,
    SKIN_CANVAS_RENDER_ELEMENT_ATTR,
    SKIN_CANVAS_RENDER_TYPE_ATTR,
    SKIN_CANVAS_RENDER_HEIGHT_ATTR,
    SKIN_CANVAS_RENDER_HIDDEN_ATTR,
    SKIN_CANVAS_RENDER_LOCKED_ATTR,
    SKIN_CANVAS_RENDER_ROLE_ATTR,
    SKIN_CANVAS_RENDER_SHAPE_ATTR,
    SKIN_CANVAS_RENDER_EDIT_ID_ATTR,
    SKIN_CANVAS_RENDER_ELEMENT_ID_PATTERN,
    SKIN_CANVAS_RENDER_SLOT_NAME_PATTERN,
    SKIN_CANVAS_RENDER_VARS,

    skinCanvasRenderTrimNumber,
    skinCanvasRenderPercent,
    setSkinCanvasElementPosition,
    readSkinCanvasElementPositionVars,
    restoreSkinCanvasElementPositionVars,
    applySkinCanvasElementBox,
    setSkinCanvasElementBox,
    readSkinCanvasElementBoxVars,
    restoreSkinCanvasElementBoxVars,
    readSkinCanvasImageUrl,
    readSkinCanvasCategories,

    compileSkinHomeCanvas,
    clearSkinHomeCanvas
  };

}
