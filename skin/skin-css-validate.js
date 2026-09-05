/* =========================================================
   SKIN CSS VALIDATOR / SCOPER

   AI_SKIN_PHASE1A_DESIGN.md 7절 구현. Skin Package의 `css` 필드를
   저장(발행)하기 *전에* 통과시키는 파이프라인:

     raw CSS -> parse -> 위험 구문 제거/치환 -> .imory-skin-root
     스코프 강제 -> serialize -> 저장해도 되는 안전한 CSS

   책임 경계: 이 파일은 "저장 시점"에만 로드된다. 공개 HOME은
   이미 스코프가 끝난 최종 CSS 문자열을 <style>.textContent로
   삽입하기만 하면 되므로(skin-render.js, Slice 2) css-tree를
   전혀 로드하지 않는다(7-2절) — index.html/기존 Customize는 이
   파일을 로드하지 않는다.

   의존 패키지: @eslint/css-tree (github.com/eslint/csstree)
   — 원 저장소 css-tree(github.com/csstree/csstree, 최신 3.2.1)와
   API가 동일(parse/walk/generate)하지만, 실제 유지보수 활동은
   ESLint 포크 쪽이 훨씬 최근이다(Slice 3 구현 시점 기준 —
   eslint/csstree 최근 커밋 2026-09-01, 4.1.0 릴리스 3일 전 /
   csstree/csstree 최근 커밋 2026-03-05, 6개월 정체). 그래서
   @eslint/css-tree를 채택한다(7-2절 "패키지 확정은 Slice 3에서"
   결정 반영).

   exact package: @eslint/css-tree
   exact version: 4.1.0 (MIT)
   exact CDN URL: https://cdn.jsdelivr.net/npm/@eslint/css-tree@4.1.0/dist/csstree.esm.js
   (버전을 생략하거나 @latest를 쓰지 않는다 — 7-2절 원칙)

   이 파일 자체가 ES 모듈이다(정적 import 사용) — 로드하는 쪽은
   반드시 `<script type="module" src="skin/skin-css-validate.js">`
   로 불러와야 한다. 이 프로젝트의 나머지 skin/*.js는 전역 함수를
   내보내는 classic script이므로, 이 모듈도 window에 동일한
   방식으로 API를 노출해 나머지 코드와 자연스럽게 섞이게 한다.
========================================================== */

import * as csstree from "https://cdn.jsdelivr.net/npm/@eslint/css-tree@4.1.0/dist/csstree.esm.js";

const SKIN_CSS_SCOPE_CLASS_BASE = "imory-skin-root";

/* Slice 3.5 보강: namespace가 주어지면 이 렌더 인스턴스 전용
   scope class를 만든다. 고정된 `.imory-skin-root` 하나만 쓰면,
   같은 document에 서로 다른 Skin이 동시에 렌더될 때(Studio
   프리뷰 이력, 갤러리 등) 두 root가 같은 class를 공유하게 되어
   "class는 같지만 다른 DOM 서브트리"인 두 selector가 동일
   specificity로 충돌한다 — 나중에 삽입된 <style>이 CSS 캐스케이드
   규칙상 무조건 이긴다(선택자 자체가 같으므로 각 root 안에서만
   적용되는 게 아니라 문서 전체에서 "마지막 것이 이긴다"로 깨짐).
   namespace가 없으면(저장 시점 검증 등 인스턴스 개념이 없는 호출)
   기존과 동일한 범용 클래스를 그대로 쓴다. */
function getSkinCssScopeClass(namespace) {
  return namespace ? `${SKIN_CSS_SCOPE_CLASS_BASE}-${namespace}` : SKIN_CSS_SCOPE_CLASS_BASE;
}

const SKIN_CSS_UNSAFE_URL_SCHEMES = ["javascript:", "data:", "vbscript:", "file:", "blob:"];

/* url()과 마찬가지로 href/src(6-5절)와 정책을 맞춘다 — mailto:/tel:은
   href/src 쪽 정책과 달리 CSS url()에는 애초에 의미가 없는
   스킴이라 별도로 나열하지 않는다(https/상대경로 외 전부 차단되는
   결과는 동일). */
function isSafeSkinCssUrl(rawUrl) {

  if (typeof rawUrl !== "string") {
    return false;
  }

  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return false;
  }

  const strippedForSchemeCheck = trimmed
    .replace(/[\x00-\x1F\x7F\s]/g, "")
    .toLowerCase();

  if (SKIN_CSS_UNSAFE_URL_SCHEMES.some((scheme) => strippedForSchemeCheck.startsWith(scheme))) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, "https://imory-skin-url-base.invalid/");
    return parsed.protocol === "https:";
  } catch (err) {
    return false;
  }

}

/* 레거시 IE 전용이지만 방어적으로 차단(7-3절) — 프로퍼티 이름
   자체로 판정하므로 값의 인코딩/따옴표 여부와 무관하게 걸린다. */
const SKIN_CSS_DANGEROUS_PROPERTY_NAMES = new Set(["-moz-binding", "behavior"]);

/* custom property(--*) 값은 항상 Raw 노드로 파싱되어(브라우저가
   원래 opaque하게 취급하는 값이라 구조 검증이 불가능하다) 아래
   Url/Function 기반 검사를 그대로 적용할 수 없다. var()로
   간접 참조되어 다른 선언에 재주입될 수 있으므로(8-4절과 같은
   결의 방어적 판단), 키워드 스캔으로 최소한의 안전망을 둔다. */
const SKIN_CSS_DANGEROUS_RAW_PATTERN = /(javascript:|vbscript:|expression\s*\(|-moz-binding|behavior\s*:)/i;

/* 8-2절(POST 단계 선행 설계) 1차 방어 — v0.1(HOME 전용)에는 이
   selector가 실제로 등장할 상황이 없지만, 이 validator가 POST
   단계에서도 그대로 재사용될 것이므로 지금부터 넣어둔다. */
const SKIN_CSS_PROTECTED_SELECTOR_PATTERN = /#postDetailContent\b|\.post-detail-content\b|\.post-dialogue\b|\.post-action\b|\.post-inline-/;

function isSkinCssKeyframesAtruleName(name) {
  return String(name || "").toLowerCase().endsWith("keyframes");
}

function isPureGlobalSelectorCompound(node) {

  if (node.type === "PseudoClassSelector" && node.name === "root") {
    return true;
  }

  if (node.type === "TypeSelector" && (node.name === "html" || node.name === "body")) {
    return true;
  }

  return false;

}

/* =========================================================
   selector 스코프 — 모든 Rule의 셀렉터 앞에 scope class(기본
   `.imory-skin-root`, namespace가 있으면 `.imory-skin-root-<ns>`,
   위 getSkinCssScopeClass 참고)를 강제로 삽입한다(7-3절).
   `:root`/`html`/`body`가 selector의 맨 앞 compound 전체(다른
   simple selector와 결합되지 않은 단독 형태)일 때만 scope
   class로 치환하고, 그 외(예: `body.dark`, `div :root span`)는
   안전 쪽으로 접두어만 붙인다 — 매치 대상이 없어져 죽은 규칙이
   될 뿐 위험하지 않다.
========================================================== */

function scopeSkinCssSelector(selectorNode, scopeClass) {

  const children = selectorNode.children;
  const items = children.toArray();

  let compoundEnd = items.findIndex((node) => node.type === "Combinator");

  if (compoundEnd === -1) {
    compoundEnd = items.length;
  }

  if (compoundEnd === 1 && isPureGlobalSelectorCompound(items[0])) {
    children.shift();
    children.prependData({ type: "ClassSelector", name: scopeClass });
    return;
  }

  children.prependData({ type: "Combinator", name: " " });
  children.prependData({ type: "ClassSelector", name: scopeClass });

}

/* =========================================================
   @keyframes 이름 격리(Slice 3.5 보강)

   `.imory-skin-root` selector 스코프는 selector에만 적용되고
   `@keyframes <name>` 식별자 자체나 `animation`/`animation-name`이
   그 이름을 참조하는 부분에는 아무 영향이 없다 — CSS keyframe
   이름은 문서 전체에서 전역이라, 서로 다른 Skin이 같은 document에
   함께 렌더되면(Studio 프리뷰 이력, 갤러리 등 향후 시나리오)
   나중에 등록된 `@keyframes fade`가 먼저 것을 그냥 덮어써 버린다.

   `namespace`가 주어졌을 때만 이 렌더 인스턴스 전용 이름으로
   바꿔치기한다(저장되는 CSS 자체는 원래 이름을 그대로 유지 —
   이식성을 위해 이 치환은 항상 렌더 시점에만 적용, 3절 "구조와
   개인화의 분리" 원칙과 동일한 결).

   한계(문서화된 채로 v0.1 범위에서 받아들임): `animation`
   shorthand 안에서는 이름과 키워드(ease/infinite/alternate 등)가
   구분 없이 전부 Identifier로 파싱된다. 이 함수는 "이 스타일시트
   안에서 실제로 `@keyframes`로 정의된 이름과 정확히 같은
   Identifier"만 바꾼다 — 작성자가 자기 keyframe 이름을 우연히
   `infinite`처럼 진짜 키워드와 똑같이 지었을 때만 그 shorthand
   안의 키워드 자리까지 함께 바뀌는 드문 edge case가 있다. */

function namespaceSkinCssKeyframes(ast, namespace) {

  if (!namespace) {
    return;
  }

  const renameMap = new Map();

  csstree.walk(ast, {
    visit: "Atrule",
    enter(node) {

      if (!isSkinCssKeyframesAtruleName(node.name)) {
        return;
      }

      if (!node.prelude || node.prelude.type !== "AtrulePrelude") {
        return;
      }

      const identifierNode = node.prelude.children.first;

      if (!identifierNode || identifierNode.type !== "Identifier") {
        return;
      }

      const originalName = identifierNode.name;

      if (!renameMap.has(originalName)) {
        renameMap.set(originalName, `imory-kf-${namespace}-${originalName}`);
      }

      identifierNode.name = renameMap.get(originalName);

    }
  });

  if (renameMap.size === 0) {
    return;
  }

  csstree.walk(ast, {
    visit: "Declaration",
    enter(node) {

      const propertyLower = node.property.toLowerCase();

      if (propertyLower !== "animation" && propertyLower !== "animation-name") {
        return;
      }

      csstree.walk(node.value, (valueNode) => {
        if (valueNode.type === "Identifier" && renameMap.has(valueNode.name)) {
          valueNode.name = renameMap.get(valueNode.name);
        }
      });

    }
  });

}

/* =========================================================
   validateAndScopeSkinCss(rawCss, options) -> { css, ok, warnings }

   options.namespace: 주어지면 @keyframes 이름을 이 렌더 인스턴스
   전용으로 격리한다(위 설명 참고). 저장 시점 검증(Slice 3 원래
   용도)에서는 생략 — 저장되는 CSS는 원래 이름을 유지한다.

   ok=false는 raw CSS를 구조적으로 신뢰할 수 없다고 판단한
   경우다(csstree 자체가 onParseError를 보고한 경우) — 이 경우
   css는 항상 빈 문자열이다(설계 문서 10절 "CSS validation 실패
   → CSS만 빈 문자열로 대체" 정책을 이 함수 자체가 구현).

   ok=true인데 warnings가 채워져 있는 건 실패가 아니라 "위험한
   구문을 발견해서 제거하고 나머지는 정상 반환했다"는 정보성
   기록이다(예: "@import 제거함").
========================================================== */

export function validateAndScopeSkinCss(rawCss, options = {}) {

  const { namespace } = options;
  const scopeClass = getSkinCssScopeClass(namespace);

  const warnings = [];
  const parseErrors = [];

  const ast = csstree.parse(String(rawCss || ""), {
    positions: false,
    onParseError: (err) => parseErrors.push(err.message)
  });

  if (parseErrors.length > 0) {
    /* csstree는 매우 관대한 복구 파서라 구조를 못 잡은 부분도
       원문에 가깝게 generate()로 되돌려줄 수 있다 — 이 되돌림
       결과가 실제 브라우저 CSS 파서에서 어떻게 해석될지는
       보장할 수 없으므로(파서 간 해석 차이 위험), 파싱 중 하나라도
       경고가 나오면 그 결과를 절대 신뢰하지 않고 통째로 실패
       처리한다. */
    return { css: "", ok: false, warnings: parseErrors, scopeClass };
  }

  /* 1) @import 완전 제거 — 외부 리소스를 통한 우회 방지 */
  csstree.walk(ast, {
    visit: "Atrule",
    enter(node, item, list) {
      if (list && node.name.toLowerCase() === "import") {
        warnings.push(`@import 제거됨`);
        list.remove(item);
      }
    }
  });

  /* 2) 선언 단위 검증 — 위험 프로퍼티 이름 / custom property
     키워드 스캔 / 구조화되지 못한(Raw) 일반 프로퍼티 선언 제거 */
  csstree.walk(ast, {
    visit: "Declaration",
    enter(node, item, list) {

      if (!list) {
        return;
      }

      const propertyLower = node.property.toLowerCase();
      const isCustomProperty = propertyLower.startsWith("--");

      if (SKIN_CSS_DANGEROUS_PROPERTY_NAMES.has(propertyLower)) {
        warnings.push(`위험 프로퍼티 제거됨: ${node.property}`);
        list.remove(item);
        return;
      }

      if (isCustomProperty) {
        const rawValue = node.value.type === "Raw" ? node.value.value : csstree.generate(node.value);
        if (SKIN_CSS_DANGEROUS_RAW_PATTERN.test(rawValue)) {
          warnings.push(`위험 키워드가 포함된 custom property 제거됨: ${node.property}`);
          list.remove(item);
        }
        return;
      }

      if (node.value.type === "Raw") {
        /* 일반 프로퍼티인데 csstree가 값을 구조화하지 못했다는
           뜻(예: 따옴표 없는 url(javascript:alert(1))처럼 문법이
           깨진 url-token) — 내용을 검증할 방법이 없으므로 통째로
           버린다. */
        warnings.push(`구조화되지 않은(Raw) 값의 선언 제거됨: ${node.property}`);
        list.remove(item);
      }

    }
  });

  /* 3) expression() 함수 / url() 스킴 검증 — 문서 전체를 한 번에
     순회(어디에 있든 동일 규칙 적용: 일반 Rule, @font-face 등) */
  csstree.walk(ast, (node, item, list) => {

    if (node.type === "Function" && node.name.toLowerCase() === "expression") {
      if (list) {
        warnings.push(`expression() 사용 제거됨`);
        list.remove(item);
      }
      return;
    }

    if (node.type === "Url" && !isSafeSkinCssUrl(node.value)) {
      warnings.push(`안전하지 않은 url() 제거됨: ${node.value}`);
      if (list) {
        list.remove(item);
      }
    }

  });

  /* 4) 위 제거로 값이 완전히 비어버린 일반 프로퍼티 선언 정리
     (custom property는 원래도 Raw라 대상에서 제외) */
  csstree.walk(ast, {
    visit: "Declaration",
    enter(node, item, list) {

      if (!list || node.property.toLowerCase().startsWith("--")) {
        return;
      }

      if (node.value.type === "Value" && node.value.children.isEmpty) {
        warnings.push(`정리 후 비어버린 선언 제거됨: ${node.property}`);
        list.remove(item);
      }

    }
  });

  /* 5) 보호 대상 selector 차단(8-2절 1차 방어, POST 단계 선행
     설계 — v0.1 HOME 범위에는 실질 위험이 없지만 이 validator가
     이후 POST 단계에서도 재사용될 것을 고려해 지금부터 넣는다).
     selector list 안에서 문제되는 selector만 제거하고, 그 결과
     selector list가 통째로 비면 rule 자체를 제거한다. */
  csstree.walk(ast, {
    visit: "Rule",
    enter(ruleNode) {

      if (!ruleNode.prelude || ruleNode.prelude.type !== "SelectorList") {
        return;
      }

      ruleNode.prelude.children.forEach((selectorNode, item, list) => {

        const selectorText = csstree.generate(selectorNode);

        if (SKIN_CSS_PROTECTED_SELECTOR_PATTERN.test(selectorText)) {
          warnings.push(`보호 대상 selector 제거됨: ${selectorText}`);
          list.remove(item);
        }

      });

    }
  });

  csstree.walk(ast, {
    visit: "Rule",
    enter(node, item, list) {
      if (list && node.prelude && node.prelude.type === "SelectorList" && node.prelude.children.isEmpty) {
        list.remove(item);
      }
    }
  });

  /* 6) 남은 모든 실제 selector에 스코프 강제 적용. @keyframes
     내부의 selector(0%/50%/from/to 등)는 DOM selector가 아니라
     타이밍 selector이므로 절대 접두어를 붙이면 안 된다 —
     csstree 워커의 `this.atrule` 컨텍스트로 감지해서 제외한다. */
  csstree.walk(ast, {
    visit: "Selector",
    enter(node) {

      if (this.atrule && isSkinCssKeyframesAtruleName(this.atrule.name)) {
        return;
      }

      scopeSkinCssSelector(node, scopeClass);

    }
  });

  /* 7) @keyframes 이름 격리(namespace가 주어졌을 때만) */
  namespaceSkinCssKeyframes(ast, namespace);

  return { css: csstree.generate(ast), ok: true, warnings, scopeClass };

}

/* 나머지 skin/*.js가 전역 classic script인 것과 동일한 방식으로
   섞여 쓰일 수 있도록 window에도 노출한다(이 파일만 type="module"). */
if (typeof window !== "undefined") {
  window.validateAndScopeSkinCss = validateAndScopeSkinCss;
}
