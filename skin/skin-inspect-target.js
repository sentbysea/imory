/* =========================================================
   SKIN — "이 요소를 고를 수 있는가" (classic script, 의존 없음)

   기준 문서: docs/features/studio/history/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md
             IMORY_SANDBOX_SKIN_DESIGN.md §P (SANDBOX-6A)

   ---------------------------------------------------------
   ★ 왜 이 파일이 따로 있는가

   Element Inspector 의 hit-test 규칙은 이제 **세 realm** 에서
   필요하다.

     1. Studio 문서            (studio/inspector/*)
     2. Preview 문서(native)   (studio/preview/preview-bridge.js)
     3. sandbox 프레임 문서    (skin/sandbox/skin-sandbox-inspect.js)

   1·2 는 지금까지 studio/inspector/studio-inspector-model.js 를
   각각 로드해서 같은 규칙을 썼다. 3 은 그렇게 할 수 없다 —
   sandbox origin 에서 나갈 수 있는 파일은 allowlist 에 적힌 것뿐이고
   (core/lib/skin-sandbox-server.js), 그 목록에 studio/* 를 올리는
   것은 "프레임은 렌더러이지 관리 코드가 아니다"라는 계약을 깬다
   (skin/sandbox/frame.html 머리말).

   규칙을 복붙하면 두 쪽이 서서히 달라지고, 달라지는 쪽은 늘
   느슨한 쪽이다. 그래서 **의존이 하나도 없는 이 파일 하나**를
   세 문서가 각각 로드한다 — skin/skin-sanitize.js 와
   skin/sandbox/skin-sandbox-protocol.js 가 이미 쓰고 있는 방식이다.

   ---------------------------------------------------------
   ★ 여기 있는 것은 "무엇을 고를 수 있는가"뿐이다

   고른 요소가 **무엇인지**(바인딩·보호 영역·가능한 수정)는 여기서
   판단하지 않는다. 그것은 언제나 Studio 가 자기 SkinPackage 에서
   다시 계산한다(studio/inspector/studio-inspector-model.js
   describeInspectorElement). 프레임은 판단하지 않고, 판단을
   올려보내지도 않는다.

   전역으로 노출되는 것(classic script 최상위 선언):
     INSPECTOR_NEVER_SELECTABLE_TAGS
     INSPECTOR_TEXTUAL_TAGS
     INSPECTOR_CANVAS_ELEMENT_ATTR
     INSPECTOR_CANVAS_LOCKED_ATTR
     isInspectableElement(el)
     resolveInspectableAncestor(node, root, editIdOf)
     inspectorLockedCanvasAncestor(node, root)

   ★ HOME 캔버스(HOME-CANVAS-SELECT-1A)

   캔버스 요소는 DOM 이 렌더러가 만든 것이라 "생김새"로 고를 수
   있는지가 갈리면 안 되고, 도화지를 덮는 요소가 page 로 오판되면
   안 되며, 잠긴 요소는 아예 없는 자리로 보여야 한다. 셋 다 이
   파일 한 곳에서 처리한다 — 세 realm 이 같은 파일을 읽으므로
   native Preview 와 sandbox 프레임의 판정이 저절로 같아진다.
========================================================== */


/* 장식용 빈 요소 — 눌러도 이 요소가 잡히지 않고 부모로 올라간다 */
const INSPECTOR_NEVER_SELECTABLE_TAGS =
  new Set(["br", "hr"]);


/* "글자가 들어가는 자리"로 취급하는 태그. describeInspectorElement()
   의 kind 판정에도 쓰인다(studio-inspector-model.js). */
const INSPECTOR_TEXTUAL_TAGS =
  new Set([
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "span", "small", "strong", "b", "em", "i", "u", "mark",
    "blockquote", "cite", "dt", "dd", "figcaption", "summary", "li"
  ]);


function isInspectableElement(el) {

  if (!el || el.nodeType !== 1) {
    return false;
  }

  const tag =
    el.tagName.toLowerCase();

  if (INSPECTOR_NEVER_SELECTABLE_TAGS.has(tag)) {
    return false;
  }

  if (tag === "img" || tag === "a") {
    return true;
  }

  /* data-imory-* 가 붙은 요소는 언제나 "의미 있는 단위"다. */
  if (
    Array.from(el.attributes).some(
      (attr) => attr.name.toLowerCase().startsWith("data-imory-")
    )
  ) {
    return true;
  }

  if (el.children.length > 0) {
    return true;
  }

  return !!(el.textContent || "").trim();

}


/* =========================================================
   resolveInspectableAncestor(node, root, editIdOf)

   클릭/hover 가 떨어진 노드에서 위로 올라가며 "사용자가 수정할
   만한 단위"를 찾는다. root 자신은 포함하지 않는다 — 렌더 컨테이너는
   플랫폼의 것이지 스킨의 것이 아니다.

   editIdOf(el) 는 "그 요소의 편집 식별자"를 돌려주는 함수다. 식별자가
   없는 요소는 부모가 고쳐도 저장 대상으로 되돌릴 수 없으므로 고를 수
   없다(studio/inspector/studio-inspector-model.js stampInspectorEditIds).

   찾지 못하면 null — 호출자는 **아무 일도 하지 않는다**(빈 선택을
   만들지 않는다).
========================================================== */

function resolveInspectableAncestor(node, root, editIdOf) {

  if (!root || typeof editIdOf !== "function") {
    return null;
  }

  let current =
    (node && node.nodeType === 1)
      ? node
      : (node ? node.parentElement : null);

  while (current && current !== root) {

    if (editIdOf(current) && isInspectableElement(current)) {
      return current;
    }

    current = current.parentElement;

  }

  return null;

}


/* =========================================================
   DIRECT-UX-1 — 무엇을 **먼저** 고르는가 (선택 우선순위)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §1

   위 resolveInspectableAncestor() 는 "눌린 노드에서 가장 가까운
   고를 수 있는 요소"다. 그것만으로는 두 가지가 틀린다:

     1. 페이지 전체를 덮는 투명한 래퍼(장식 층 · 파티클 층)가 위에
        있으면 그 래퍼가 잡히고, 밑의 글자는 영영 고를 수 없다.
     2. 카드 사이 빈틈 · 여백을 누르면 **페이지 전체 <div>** 가
        잡힌다 — 사용자는 "아무 것도 안 눌렀다"고 생각한다.

   그래서 눌린 **자리**에 겹쳐 있는 요소 전부(elementsFromPoint)를
   아래 순위로 나눈다.

     1 text       글자가 들어가는 끝 요소
     2 image      img · svg · picture · video
     3 link       a · button
     4 component  눈에 보이는 구성 요소 — 반복 항목 · region · dock ·
                  배치/전환을 선언한 요소 · 반복을 담은 목록 ·
                  nav/ul/li/article/figure · 배경/테두리/그림자가
                  실제로 그려지는 상자
     5 container  아무 것도 그리지 않는 단순 레이아웃 래퍼
     6 page       페이지 전체 래퍼(렌더 루트의 자식과, 그 안에서 자식이
                  하나뿐인 래퍼 사슬 · 루트와 같은 크기의 상자)

   1~4 가 "의미 있는 후보"다. 5·6 은 일반 클릭의 대상이 되지 않고,
   그것만 있는 자리는 **빈 곳**이다(호출자가 선택을 푼다). 5·6 은
   "바깥 영역 선택"과 겹친 요소 메뉴의 맨 아래 칸으로만 고른다.

   ★ 판단은 이 파일 한 곳이다. native Preview 문서
     (studio/preview/preview-inspect-direct.js)와 sandbox 프레임 문서
     (skin/sandbox/skin-sandbox-inspect-direct.js — SANDBOX-SELECT-PARITY-1)
     가 같은 함수를 읽는다.
   ★ 계산 스타일(배경·테두리)을 읽으므로 **그려진 문서**에서만 뜻이
     있다. Studio 가 들고 있는 DOMParser 사본에서 부르지 않는다.
========================================================== */

const INSPECTOR_RANK = {
  text: 1,
  image: 2,
  link: 3,
  component: 4,
  container: 5,
  page: 6
};

const INSPECTOR_IMAGE_TAGS =
  new Set(["img", "svg", "picture", "video", "canvas"]);

const INSPECTOR_COMPONENT_TAGS =
  new Set(["nav", "ul", "ol", "menu", "li", "article", "figure", "button", "form", "table", "dl", "blockquote"]);

/* 이 속성을 가진 요소는 스킨 저자가 "하나의 단위"로 선언한 것이다 */
const INSPECTOR_COMPONENT_ATTRS = [
  "data-imory-repeat",
  "data-imory-region",
  "data-imory-dock",
  "data-imory-slot",
  "data-imory-layout",
  "data-imory-transition",
  "data-imory-panel",
  "data-imory-toggle",

  /* HOME-CANVAS-SELECT-1A — 캔버스 요소는 **언제나** 하나의 단위다.

     캔버스 요소의 최상위는 늘 자식이 있는 <div> 라서, 이 줄이 없으면
     아래 순위 판정이 text · image · link 분기를 전부 지나치고
     inspectorHasVisibleBox() 하나에 걸린다 — 스킨 CSS 가 배경이나
     테두리를 준 요소만 고를 수 있고, 투명한 사진 · 글자 · 도형은
     "빈 곳"이 되어 클릭이 선택을 푼다(HOME-CANVAS-SELECT-AUDIT-1 §1).

     생김새로 고를 수 있는지가 갈리면 안 된다. 이 속성은 렌더러만
     붙이고 저장 경계의 화이트리스트에 없으므로(skin/skin-sanitize.js)
     스킨 HTML 이 흉내 낼 수도 없다. */
  "data-imory-canvas-element",

  /* HOME-CANVAS-V2-EDITOR-1A — v2 의 자동 배치 블록도 **언제나 하나의
     단위**다(계약 §23-3 · §24-2).

     블록은 자유 배치 요소가 아니라서 `data-imory-canvas-element` 를
     갖지 않는다. 그 한 줄이 없으면 `divider` 처럼 스킨 CSS 가 아직
     칠하지 않은 빈 상자가 inspectorHasVisibleBox() 에 걸리지 않아
     "누를 것이 없는 자리"로 떨어진다 — 위 캔버스 요소와 같은 이유,
     같은 해법이다. */
  "data-imory-canvas-block"
];


/* =========================================================
   HOME-CANVAS-SELECT-1A — 캔버스 요소를 알아보는 속성

   skin/skin-home-canvas-render.js 가 붙이는 이름과 같다. 이 파일은
   의존이 하나도 없어야 해서(세 realm 이 각자 로드한다) 상수를 한 번
   더 적고, 단위 테스트가 둘을 대조한다.
========================================================== */

const INSPECTOR_CANVAS_ELEMENT_ATTR = "data-imory-canvas-element";

const INSPECTOR_CANVAS_LOCKED_ATTR = "data-imory-canvas-locked";

/* HOME-CANVAS-V2-EDITOR-1A — v2 자동 배치 블록(계약 §23-3) */
const INSPECTOR_CANVAS_BLOCK_ATTR = "data-imory-canvas-block";


/* =========================================================
   HOME-CANVAS-TRANSFORM-1B — 편집 UI 는 Inspector 의 것이 아니다

   `data-imory-canvas-frame` 은 Canvas 편집 runtime 이 Moveable 의
   control box 에 붙이는 표식이다(skin/skin-home-canvas-editor-runtime.js
   markControlBox). 그 상자와 그 안의 손잡이 · 테두리가 여기 걸린다.

   ★ 왜 필요해졌는가

   `1A` 까지 control box 는 통째로 `pointer-events: none` 이라 어떤
   입력의 대상도 되지 않았다. `1B` 에서 **리사이즈 손잡이만** 그것을
   되돌려 받으면서(§18-11), 손잡이를 누른 pointerdown · click 이
   Inspector 에도 닿게 됐다. 그대로 두면 손잡이 아래에 있는 것이
   새로 골라지거나(모서리 손잡이는 요소 밖에 반쯤 걸쳐 있다) 아무
   것도 없는 자리로 읽혀 **선택이 풀리고**, 방금 시작한 리사이즈가
   그 자리에서 취소된다.

   ★ "고를 것이 없다"가 아니라 "내 입력이 아니다"다.

   그래서 부르는 쪽은 이 함수가 무언가를 돌려주면 **아무 일도 하지
   않고 빠져나간다** — 선택을 풀지도, 다시 고르지도, 오류를 알리지도
   않는다. 그 입력의 주인은 Moveable 이고, 그쪽은 mousedown 으로
   받으므로(0.53.0 은 pointer 이벤트를 쓰지 않는다 — 번들 실측)
   Inspector 가 비켜서기만 하면 된다.
========================================================== */

const INSPECTOR_EDIT_CHROME_ATTR = "data-imory-canvas-frame";

/* =========================================================
   ★ 같은 이름이 두 곳에서 쓰인다 (HOME-CANVAS-V2-EDITOR-1A)

   `data-imory-canvas-frame` 을 쓰는 것이 둘이다.

     Moveable control box   `="1"`  편집 runtime 이 붙인다
                                    (skin/skin-home-canvas-editor-runtime.js
                                     markControlBox)
     v2 `main_visual` 프레임 `=""`   렌더러가 붙인다
                                    (skin/skin-home-canvas-render.js · 계약 §24-2)

   V2-MAIN-VISUAL-1 까지는 값을 보지 않고 **속성만** 봤다. 그래서
   `main_visual` 안을 누른 입력이 전부 "편집 UI 위의 입력"으로 읽혀
   Inspector 가 비켜섰다 — 프레임도 그 안의 사진 · 장식도 고를 수
   없었다(계약 §24-7 이 남긴 함정).

   ★ 값으로 가른다. 편집 runtime 은 **처음부터** `="1"` 로 쓰고 자기
     선택자도 `[data-imory-canvas-frame="1"]` 이므로(같은 파일의
     markControlBox · 진단), 여기서 값을 보는 것만으로 두 뜻이 갈린다.
     렌더러가 붙이는 빈 값은 더 이상 이 관문에 걸리지 않는다.
========================================================== */

const INSPECTOR_EDIT_CHROME_VALUE = "1";


function inspectorEditChromeAncestor(node) {

  let current =
    (node && node.nodeType === 1)
      ? node
      : (node ? node.parentElement : null);

  while (current) {

    if (
      current.getAttribute &&
      current.getAttribute(INSPECTOR_EDIT_CHROME_ATTR) === INSPECTOR_EDIT_CHROME_VALUE
    ) {
      return current;
    }

    current = current.parentElement;

  }

  return null;

}


/*
  inspectorLockedCanvasAncestor(node, root) -> Element | null

  눌린 노드가 **잠긴** 캔버스 요소 안에 있는가.

  잠긴 요소는 화면 클릭으로 고르지 않는다(계약 §5 · SELECT-1A §2).
  "고르지 않는다"를 순위를 낮추는 것으로 표현하지 않고 후보 목록에서
  아예 빼는 이유는, 순위만 낮추면 조상 탐색이 그 위의 표식까지 올라가
  **잠긴 요소 밑에 깔린 다른 요소**를 가려 버리기 때문이다. 빼 두면
  그 자리는 "잠긴 요소가 없는 것과 같은 자리"가 된다 — 밑에 다른
  요소가 있으면 그것이 잡히고, 없으면 표식(= 캔버스 바탕)을 누른
  것과 같아진다.
*/
function inspectorLockedCanvasAncestor(node, root) {

  let current =
    (node && node.nodeType === 1)
      ? node
      : (node ? node.parentElement : null);

  while (current && current !== root) {

    if (
      current.hasAttribute &&
      current.hasAttribute(INSPECTOR_CANVAS_ELEMENT_ATTR)
    ) {

      return current.getAttribute(INSPECTOR_CANVAS_LOCKED_ATTR) === "true"
        ? current
        : null;

    }

    current = current.parentElement;

  }

  return null;

}


function inspectorIsTransparentColor(value) {

  const text =
    String(value || "").replace(/\s+/g, "").toLowerCase();

  return (
    !text ||
    text === "transparent" ||
    /^rgba\(\d+,\d+,\d+,0(\.0+)?\)$/.test(text)
  );

}


/* 그 상자가 **스스로** 무언가를 그리는가 — 배경색 · 배경 그림 ·
   테두리 · 그림자. 하나라도 있으면 사용자 눈에 "상자"다. */
function inspectorHasVisibleBox(el, win) {

  let style = null;

  try {
    style = (win || window).getComputedStyle(el);
  } catch (err) {
    return false;
  }

  if (!style) {
    return false;
  }

  if (!inspectorIsTransparentColor(style.backgroundColor)) {
    return true;
  }

  if (style.backgroundImage && style.backgroundImage !== "none") {
    return true;
  }

  if (style.boxShadow && style.boxShadow !== "none") {
    return true;
  }

  return ["Top", "Right", "Bottom", "Left"].some((side) =>
    parseFloat(style["border" + side + "Width"]) > 0 &&
    style["border" + side + "Style"] !== "none" &&
    !inspectorIsTransparentColor(style["border" + side + "Color"])
  );

}


/* 페이지 전체 래퍼인가 — 루트의 자식, 그 안에서 자식이 하나뿐인
   래퍼 사슬, 또는 루트와 거의 같은 크기의 상자 */
function inspectorIsPageLevel(el, root) {

  let node = el;

  while (node && node.parentElement) {

    if (node.parentElement === root) {
      return true;
    }

    if (node.parentElement.children.length !== 1) {
      break;
    }

    node = node.parentElement;

  }

  if (!root || typeof root.getBoundingClientRect !== "function") {
    return false;
  }

  const rootBox = root.getBoundingClientRect();
  const box = el.getBoundingClientRect();

  return (
    rootBox.width > 0 &&
    rootBox.height > 0 &&
    box.width >= rootBox.width * 0.96 &&
    box.height >= rootBox.height * 0.9
  );

}


function inspectorSelectionRank(el, root, win) {

  if (!el || el.nodeType !== 1) {
    return INSPECTOR_RANK.page;
  }

  const tag =
    el.tagName.toLowerCase();

  if (INSPECTOR_IMAGE_TAGS.has(tag)) {
    return INSPECTOR_RANK.image;
  }

  if (tag === "a" || tag === "button") {
    return INSPECTOR_RANK.link;
  }

  if (
    el.children.length === 0 &&
    (
      (el.textContent || "").trim() ||
      el.hasAttribute("data-imory-bind") ||
      INSPECTOR_TEXTUAL_TAGS.has(tag)
    )
  ) {
    return INSPECTOR_RANK.text;
  }

  /* HOME-CANVAS-SELECT-1A — 캔버스 요소는 "페이지 전체 래퍼"가 아니다.

     도화지를 꽉 채운 배경 사진은 루트와 거의 같은 크기라서 아래
     판정이 page(6)로 매긴다 — 그러면 한 번도 고를 수 없다. page 는
     "누를 것이 없는 자리"를 뜻하는 등급이고, 캔버스 요소는 언제나
     사용자가 놓은 하나의 물건이므로 그 등급에 들어갈 수 없다. */
  /* HOME-CANVAS-V2-EDITOR-1A — v2 블록도 같은 이유로 제외한다.
     `align:"stretch"` 블록은 흐름 층의 폭을 거의 다 쓰므로 아래
     판정이 page(6)로 매긴다 — 그러면 한 번도 고를 수 없다. */
  if (
    !el.hasAttribute(INSPECTOR_CANVAS_ELEMENT_ATTR) &&
    !el.hasAttribute(INSPECTOR_CANVAS_BLOCK_ATTR) &&
    inspectorIsPageLevel(el, root)
  ) {
    return INSPECTOR_RANK.page;
  }

  if (
    INSPECTOR_COMPONENT_TAGS.has(tag) ||
    INSPECTOR_COMPONENT_ATTRS.some((name) => el.hasAttribute(name)) ||
    Array.prototype.some.call(el.children, (child) => child.hasAttribute("data-imory-repeat")) ||
    inspectorHasVisibleBox(el, win)
  ) {
    return INSPECTOR_RANK.component;
  }

  return INSPECTOR_RANK.container;

}


/* =========================================================
   pickInspectableAtPoint(stack, root, editIdOf, win)
     -> { primary, candidates, outer, overlap }

   stack    눌린 자리의 요소들(document.elementsFromPoint 순서 —
            맨 위에 그려진 것이 먼저)
   primary  일반 클릭이 고를 요소. 의미 있는 후보(1~4) 중 **맨 위**.
            없으면 null(= 빈 곳)
   candidates  의미 있는 후보 전부(위에서 아래 순서, 중복 없음)
   outer    가장 가까운 래퍼(5·6) — 겹친 요소 메뉴의 "바깥 영역" 칸
   overlap  서로를 담지 않는 후보가 둘 이상인가 = **실제로 겹쳐
            있는가**. 제목이 카드 안에 있는 것은 겹침이 아니다(한
            사슬이다) — 그때마다 메뉴를 띄우면 모든 클릭이 한 번 더
            묻는 클릭이 된다.
========================================================== */

/* =========================================================
   HOME-CANVAS-SELECT-1A — 캔버스에서 "겹쳤다"는 무엇인가

   겹친 요소 메뉴는 "서로를 담지 않는 후보가 둘 이상"일 때 뜬다.
   캔버스 요소는 전부 형제라 DOM 으로는 서로를 담는 일이 없다 —
   그래서 이 규칙을 그대로 두면 **도화지를 덮는 배경 사진 하나만
   있어도 모든 클릭이 한 번 더 묻는 클릭**이 된다. 실제 캔버스는
   거의 언제나 바탕 요소를 깔고 시작한다.

   캔버스에서는 형제 사이의 포함을 **사각형**으로 읽는다. 한쪽이
   다른 쪽을 완전히 덮고 있으면 묻지 않는다 — 앞뒤 순서는 사용자가
   직접 정한 것이고, 덮은 쪽 위에서 누른 것이 무엇인지에 이견이
   없기 때문이다. **부분적으로** 걸친 두 요소는 지금까지처럼 묻는다.

   ★ 캔버스 요소끼리만이다. 스킨 DOM 의 후보 판정은 한 글자도
     바뀌지 않는다(둘 중 하나라도 캔버스 요소가 아니면 false).
========================================================== */

function inspectorRectCovers(outer, inner) {

  /* 0.5px 은 반올림 여유다 — 백분율 좌표에서 경계가 딱 맞는 두
     요소가 소수점 때문에 "덮지 않는다"로 읽히지 않게. */
  const pad = 0.5;

  return (
    outer.left <= inner.left + pad &&
    outer.top <= inner.top + pad &&
    outer.right >= inner.right - pad &&
    outer.bottom >= inner.bottom - pad
  );

}


function inspectorCanvasPairIsNested(a, b) {

  if (
    !a || !b ||
    !a.hasAttribute(INSPECTOR_CANVAS_ELEMENT_ATTR) ||
    !b.hasAttribute(INSPECTOR_CANVAS_ELEMENT_ATTR)
  ) {
    return false;
  }

  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();

  return inspectorRectCovers(ra, rb) || inspectorRectCovers(rb, ra);

}


function pickInspectableAtPoint(stack, root, editIdOf, win) {

  const seen = new Set();

  const ranked = [];

  (stack || []).forEach((node) => {

    if (!node || node === root || !root || !root.contains(node)) {
      return;
    }

    /* 잠긴 캔버스 요소는 이 자리에 없는 것으로 친다(위 머리말) */
    if (inspectorLockedCanvasAncestor(node, root)) {
      return;
    }

    const el =
      resolveInspectableAncestor(node, root, editIdOf);

    if (!el || seen.has(el)) {
      return;
    }

    seen.add(el);

    ranked.push({ el, rank: inspectorSelectionRank(el, root, win) });

  });

  const candidates =
    ranked
      .filter((entry) => entry.rank <= INSPECTOR_RANK.component)
      .map((entry) => entry.el);

  const outerEntry =
    ranked.find((entry) => entry.rank > INSPECTOR_RANK.component);

  let overlap = false;

  for (let i = 0; i < candidates.length && !overlap; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {

      if (candidates[i].contains(candidates[j]) || candidates[j].contains(candidates[i])) {
        continue;
      }

      /* 캔버스에서 "담고 있다"는 DOM 이 아니라 사각형이다(아래) */
      if (inspectorCanvasPairIsNested(candidates[i], candidates[j])) {
        continue;
      }

      overlap = true;
      break;

    }
  }

  return {
    primary: candidates.length ? candidates[0] : null,
    candidates,
    outer: outerEntry ? outerEntry.el : null,
    overlap
  };

}


/* node(단위 테스트)에서도 같은 파일을 읽을 수 있게 */
if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    INSPECTOR_NEVER_SELECTABLE_TAGS,
    INSPECTOR_TEXTUAL_TAGS,
    INSPECTOR_RANK,
    INSPECTOR_COMPONENT_ATTRS,
    INSPECTOR_CANVAS_ELEMENT_ATTR,
    INSPECTOR_CANVAS_LOCKED_ATTR,
    INSPECTOR_CANVAS_BLOCK_ATTR,
    INSPECTOR_EDIT_CHROME_ATTR,
    INSPECTOR_EDIT_CHROME_VALUE,
    isInspectableElement,
    resolveInspectableAncestor,
    inspectorLockedCanvasAncestor,
    inspectorEditChromeAncestor,
    inspectorRectCovers,
    inspectorCanvasPairIsNested,
    inspectorSelectionRank,
    pickInspectableAtPoint
  };

}
