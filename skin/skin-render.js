/* =========================================================
   SKIN RENDERER

   AI_SKIN_PHASE1A_DESIGN.md 4~5절 + Slice 3.5 trust-boundary
   보강 구현.

   renderSkin({container, skin, context, mode}) -> {update, destroy}

   책임 경계(Slice 3.5로 변경됨 — 중요): DB에 저장된 skin_versions
   row는 authenticated owner가 Supabase REST를 직접 호출해 Studio
   UI를 우회하고 넣었을 수도 있다("저장 시점에 sanitize를 통과한
   것만 저장된다"는 계약은 클라이언트 코드로만 강제되는 관례일
   뿐, DB 권한(GRANT) 수준에서 구조적으로 강제되지 않는다 — 2-6절
   참고). 그래서 renderSkin()은 더 이상 "skin.html/css가 이미
   안전하다"고 가정하지 않는다 — **호출될 때마다 항상**
   sanitizeSkinHTML()과 validateAndScopeSkinCss()를 내부적으로
   실행한 뒤에만 DOM에 반영한다. Preview든 공개 HOME이든, skin이
   방금 검증된 draft든 몇 달 전에 저장된 published row든 예외
   없이 동일하게 방어한다 — "raw skin을 실수로 여기 직접 넘겨도
   안전하다"가 이 함수의 유일한 신뢰 경계다. 저장 시점 sanitize/
   validate는 여전히 유효하고 유용하지만(저장된 CSS를 정규화해
   재검증 비용을 낮추는 등), 보안 경계로서의 책임은 이제 이
   함수 하나가 진다.

   사용자 데이터(Skin Context)를 DOM에 꽂는 부분은 항상
   textContent만 쓴다 — innerHTML로 데이터를 주입하는 코드는 이
   파일 어디에도 없다.

   document-agnostic: container.ownerDocument로 동작하므로 부모
   문서든 iframe 안이든 그대로 동작한다(render-layout.js 선례
   계승, 설계 문서 5절).

   이 파일은 ES 모듈이다(정적 import 사용) — 반드시
   `<script type="module" src="skin/skin-render.js">`로 로드해야
   한다. 의존: skin-sanitize.js가 classic script로 먼저 로드되어
   전역 sanitizeSkinHTML()/isSafeSkinUrl()을 제공해야 한다(모듈
   스크립트는 문서 파싱이 끝난 뒤 실행되므로, 앞서 로드된 classic
   script의 전역 함수는 항상 이미 존재한다).
========================================================== */

import { validateAndScopeSkinCss } from "./skin-css-validate.js";

function resolveSkinPath(scope, path) {

  if (typeof path !== "string" || !path) {
    return undefined;
  }

  const parts = path.split(".").filter(Boolean);

  let current = scope;

  for (const part of parts) {

    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }

    current = current[part];

  }

  return current;

}

function isSkinTruthy(value) {

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Boolean(value);

}

function makeSkinItemResolver(item, outerResolve) {

  return function resolveItemPath(path) {

    if (path === "item") {
      return item;
    }

    if (path.startsWith("item.")) {
      return resolveSkinPath(item, path.slice("item.".length));
    }

    return outerResolve(path);

  };

}

/* =========================================================
   data-imory-repeat

   최상위(non-nested) 반복만 지원한다. resolvePath가 이미 item
   스코프(makeSkinItemResolver로 만들어진 resolver)일 때 또
   data-imory-repeat를 만나면 nested repeat이므로 명시적으로
   미지원 처리한다(경고 후 빈 배열 취급) — repeatDepth로 판별.
========================================================== */

function applySkinRepeat(templateEl, resolvePath, repeatDepth) {

  const path = templateEl.getAttribute("data-imory-repeat");

  const parent = templateEl.parentNode;

  if (!parent) {
    return;
  }

  if (repeatDepth > 0) {
    console.warn(`[skin-render] nested data-imory-repeat is not supported (path="${path}") — element skipped`);
    parent.removeChild(templateEl);
    return;
  }

  let list;

  try {
    list = resolvePath(path);
  } catch (err) {
    console.warn(`[skin-render] failed to resolve data-imory-repeat path "${path}"`, err);
    list = undefined;
  }

  if (!Array.isArray(list)) {

    if (list !== undefined && list !== null) {
      console.warn(`[skin-render] data-imory-repeat path "${path}" did not resolve to an array`, list);
    }

    parent.removeChild(templateEl);
    return;

  }

  const doc = templateEl.ownerDocument;
  const anchor = doc.createComment(`imory-repeat:${path}`);

  parent.replaceChild(anchor, templateEl);
  templateEl.removeAttribute("data-imory-repeat");

  list.forEach((item) => {

    const clone = templateEl.cloneNode(true);
    const itemResolve = makeSkinItemResolver(item, resolvePath);

    parent.insertBefore(clone, anchor);

    walkSkinTree(clone, itemResolve, repeatDepth + 1);

  });

  parent.removeChild(anchor);

}

/* =========================================================
   data-imory-if — truthy/falsy 판정만 지원(비교 연산 없음,
   설계 문서 4-3절).
========================================================== */

function applySkinIf(el, resolvePath) {

  const path = el.getAttribute("data-imory-if");

  let value;

  try {
    value = resolvePath(path);
  } catch (err) {
    console.warn(`[skin-render] failed to resolve data-imory-if path "${path}"`, err);
    value = undefined;
  }

  el.hidden = !isSkinTruthy(value);

}

/* =========================================================
   data-imory-bind — 항상 textContent로만 대입(XSS 원천 차단).
========================================================== */

function applySkinBind(el, resolvePath) {

  const path = el.getAttribute("data-imory-bind");

  let value;

  try {
    value = resolvePath(path);
  } catch (err) {
    console.warn(`[skin-render] failed to resolve data-imory-bind path "${path}"`, err);
    value = undefined;
  }

  if (value === undefined || value === null) {
    el.textContent = "";
    return;
  }

  el.textContent = String(value);

}

/* =========================================================
   data-imory-src / data-imory-href — resolve 후 URL 검증을
   통과한 값만 적용. 실패하면 속성 자체를 지운다(스킨 CSS/기본
   상태에 맡김 — v0.1은 placeholder 대체를 하지 않음, 그건
   skin-fallback.js/Slice 5의 몫).
========================================================== */

function applySkinUrlBinding(el, prop, resolvePath) {

  const attrName = `data-imory-${prop}`;
  const path = el.getAttribute(attrName);

  let value;

  try {
    value = resolvePath(path);
  } catch (err) {
    console.warn(`[skin-render] failed to resolve ${attrName} path "${path}"`, err);
    value = undefined;
  }

  if (typeof value !== "string" || !isSafeSkinUrl(value)) {

    if (value !== undefined && value !== null && value !== "") {
      console.warn(`[skin-render] blocked unsafe or invalid URL for ${attrName}="${path}"`, value);
    }

    el.removeAttribute(prop);
    return;

  }

  el.setAttribute(prop, value);

}

/* =========================================================
   walkSkinTree — 단일 재귀 순회로 repeat > if > bind/src/href
   순서를 자연스럽게 보장한다. repeat을 만나면 그 서브트리는
   전적으로 applySkinRepeat이 처리하고(각 clone마다 재귀 재진입),
   원본 템플릿 엘리먼트 자체의 if/bind/자식 순회는 하지 않는다.
========================================================== */

function walkSkinTree(el, resolvePath, repeatDepth) {

  if (!el || el.nodeType !== 1) {
    return;
  }

  if (el.hasAttribute("data-imory-repeat")) {
    applySkinRepeat(el, resolvePath, repeatDepth);
    return;
  }

  if (el.hasAttribute("data-imory-if")) {
    applySkinIf(el, resolvePath);
  }

  if (el.hasAttribute("data-imory-bind")) {
    applySkinBind(el, resolvePath);
  }

  if (el.hasAttribute("data-imory-src")) {
    applySkinUrlBinding(el, "src", resolvePath);
  }

  if (el.hasAttribute("data-imory-href")) {
    applySkinUrlBinding(el, "href", resolvePath);
  }

  Array.from(el.children).forEach((child) => walkSkinTree(child, resolvePath, repeatDepth));

}

/* =========================================================
   renderSkin({container, skin, context, mode}) -> {update, destroy}

   skin.html은 sanitizeSkinHTML()을 통과한 뒤 <template>.innerHTML로
   파싱한다 — <template> 콘텐츠는 parser-inserted 스크립트도
   "already started" 플래그가 설정된 채로 파싱되어(innerHTML과
   동일한 fragment parsing 경로), 이후 cloneNode로 실제 문서에
   삽입돼도 <script>가 실행되지 않는다. 이건 sanitize와 무관하게
   브라우저가 항상 보장해 주는 2차 방어선이고, on* 이벤트 속성이나
   javascript: 스킴처럼 속성 기반인 위험은 그 방어선 밖이라
   sanitizeSkinHTML()이 반드시 먼저 걸러야 한다 — 그래서 이제
   renderSkin 스스로 매번 그 단계를 수행한다(파일 상단 책임 경계).

   각 renderSkin() 호출(= 화면에 마운트되는 skin 인스턴스 하나)마다
   고유한 keyframe namespace를 부여한다 — 같은 document에 서로
   다른 Skin이 동시에 렌더되어도(Studio 프리뷰 이력, 갤러리 등)
   `@keyframes fade` 같은 흔한 이름이 서로 덮어쓰지 않는다
   (skin-css-validate.js의 namespaceSkinCssKeyframes 참고). update()로
   다시 그릴 때도 같은 namespace를 유지해 인스턴스 정체성을
   보존한다.
========================================================== */

let skinRenderInstanceCounter = 0;

export function renderSkin({ container, skin, context, mode = "view" } = {}) {

  if (!container) {
    throw new Error("renderSkin: container is required");
  }

  let currentSkin = skin;
  let currentContext = context;
  let currentMode = mode;

  const instanceNamespace = `i${++skinRenderInstanceCounter}`;

  function mount() {

    const doc = container.ownerDocument;

    const safeHtml = sanitizeSkinHTML(String(currentSkin?.html || ""), doc);

    const cssResult = validateAndScopeSkinCss(String(currentSkin?.css || ""), { namespace: instanceNamespace });

    if (!cssResult.ok) {
      console.warn("[skin-render] css validation failed, rendering without CSS", cssResult.warnings);
    }

    const safeCss = cssResult.ok ? cssResult.css : "";

    container.innerHTML = "";

    const root = doc.createElement("div");
    /* scopeClass는 이 인스턴스 전용(예: imory-skin-root-i3) —
       validateAndScopeSkinCss가 실제로 selector 앞에 붙인 것과
       똑같은 클래스를 root에 실어야 스코프가 성립한다. 범용
       "imory-skin-root"도 함께 남겨서(관례/문서/과거에 이 이름을
       직접 하드코딩한 CSS와의 하위 호환) 이중으로 붙인다 — 단,
       실제 충돌 방지는 인스턴스 전용 클래스가 담당한다. */
    root.className = `imory-skin-root ${cssResult.scopeClass}`;
    root.setAttribute("data-skin-root", "");

    const styleEl = doc.createElement("style");
    styleEl.textContent = safeCss;
    root.appendChild(styleEl);

    const template = doc.createElement("template");
    template.innerHTML = safeHtml;
    root.appendChild(template.content.cloneNode(true));

    container.appendChild(root);

    const resolveTopLevel = (path) => resolveSkinPath(currentContext, path);

    Array.from(root.children)
      .filter((child) => child !== styleEl)
      .forEach((child) => walkSkinTree(child, resolveTopLevel, 0));

  }

  mount();

  return {

    update(nextSkin, nextContext) {

      if (nextSkin !== undefined) {
        currentSkin = nextSkin;
      }

      if (nextContext !== undefined) {
        currentContext = nextContext;
      }

      mount();

    },

    destroy() {
      container.innerHTML = "";
    }

  };

}

/* 나머지 skin/*.js가 전역 classic script인 것과 동일한 방식으로
   섞여 쓰일 수 있도록 window에도 노출한다(이 파일만 type="module"). */
if (typeof window !== "undefined") {
  window.renderSkin = renderSkin;
}
