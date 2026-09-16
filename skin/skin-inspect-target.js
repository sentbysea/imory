/* =========================================================
   SKIN — "이 요소를 고를 수 있는가" (classic script, 의존 없음)

   기준 문서: docs/ai-skin/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md
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


/* node(단위 테스트)에서도 같은 파일을 읽을 수 있게 */
if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    INSPECTOR_NEVER_SELECTABLE_TAGS,
    INSPECTOR_TEXTUAL_TAGS,
    isInspectableElement,
    resolveInspectableAncestor
  };

}
