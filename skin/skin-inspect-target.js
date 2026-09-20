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
     isInspectableElement(el)
     resolveInspectableAncestor(node, root, editIdOf)
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
  "data-imory-toggle"
];


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

  if (inspectorIsPageLevel(el, root)) {
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

function pickInspectableAtPoint(stack, root, editIdOf, win) {

  const seen = new Set();

  const ranked = [];

  (stack || []).forEach((node) => {

    if (!node || node === root || !root || !root.contains(node)) {
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
      if (!candidates[i].contains(candidates[j]) && !candidates[j].contains(candidates[i])) {
        overlap = true;
        break;
      }
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
    isInspectableElement,
    resolveInspectableAncestor,
    inspectorSelectionRank,
    pickInspectableAtPoint
  };

}
