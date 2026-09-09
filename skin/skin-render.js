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

/*
  중첩 repeat 안에서는 안쪽 item이 바깥 item을 가린다(일반적인
  반복문 관례와 같다). 바깥 스코프의 다른 경로(category.name 등)는
  outerResolve로 그대로 넘어가므로 계속 쓸 수 있고, 바깥 item만
  이름이 겹쳐서 닿지 않는다 — 폴더 트리에서는 각 단계가 자기
  item(폴더/글)만 그리므로 실제로 문제가 되지 않는다.
*/

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

/*
  중첩 repeat의 최대 깊이(FOLDER-1).

  폴더 트리를 끝까지 그리는 데 필요한 깊이는 4다:
    1) category.tree            (root 컨테이너: 1단계 폴더 + root 글)
    2) item.children            (1단계 폴더 안: 2단계 폴더 + 글)
    3) item.children            (2단계 폴더 안: 3단계 폴더 + 글)
    4) item.children            (3단계 폴더 안: 글만 — 폴더는 3단계까지)
  한 단계를 여유로 더 둬서 5로 잡는다. 상한을 두는 이유는 재귀가
  무한해질 수 있어서가 아니라(깊이는 템플릿 중첩으로 이미 유한하다)
  repeat × repeat × ... 의 조합 폭발을 막기 위해서다.
*/

const SKIN_MAX_REPEAT_DEPTH = 5;

/* =========================================================
   repeat 안의 region — 항목 키 (FOLDER-2, Series Viewer)

   폴더 페이지는 `data-imory-repeat="folder.posts"` 안에 글마다
   `data-imory-region="post-body"`를 하나씩 둔다. 렌더러는 clone을
   만들 때 그 clone 안의 region에 **어느 항목의 것인지**를 플랫폼
   소유 속성(data-imory-region-key = item.id)으로 찍어 둔다. 본문을
   채우는 쪽(posts/view/posts-view-folder.js, studio/preview/
   preview-bridge.js)은 DOM 순서가 아니라 이 키로 글과 region을
   짝짓는다 — 스킨이 region을 조건부(data-imory-if)로 숨기거나
   순서를 바꿔도 다른 글의 본문이 엉뚱한 자리에 들어가지 않는다.

   이 속성은 스킨 HTML에서 올 수 없다(skin-sanitize.js의 속성
   화이트리스트에 없어 저장/렌더 전에 항상 제거된다). 렌더러만
   찍고, 렌더러가 찍은 값만 읽힌다.

   안쪽 repeat이 먼저 자기 항목으로 찍으므로(walkSkinTree가 깊이
   우선), 바깥 repeat은 아직 키가 없는 region만 채운다 — 중첩
   repeat에서도 가장 가까운 항목의 키가 남는다.
========================================================== */

const SKIN_REGION_KEY_ATTR = "data-imory-region-key";

function resolveSkinRepeatItemKey(item) {

  if (!item || typeof item !== "object") {
    return null;
  }

  const id = item.id;

  if (typeof id === "number" && Number.isFinite(id)) {
    return String(id);
  }

  if (typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return id;
  }

  return null;

}

function stampSkinRepeatRegionKeys(clone, item) {

  const key = resolveSkinRepeatItemKey(item);

  if (key === null) {
    return;
  }

  const regions = [];

  if (clone.hasAttribute("data-imory-region")) {
    regions.push(clone);
  }

  clone.querySelectorAll("[data-imory-region]").forEach((el) => regions.push(el));

  regions.forEach((el) => {

    if (!el.hasAttribute(SKIN_REGION_KEY_ATTR)) {
      el.setAttribute(SKIN_REGION_KEY_ATTR, key);
    }

  });

}

/* =========================================================
   data-imory-repeat

   FOLDER-1부터 중첩 반복을 지원한다(SKIN_MAX_REPEAT_DEPTH단계까지).
   폴더 트리(category.tree)는 item.children을 따라 내려가야 그려지는데,
   그 전까지는 이 함수가 nested repeat을 만나면 요소를 지워 버려서
   어떤 스킨도 계층 구조를 표현할 수 없었다.

   기존 스킨 동작은 바뀌지 않는다 — 지금까지 nested repeat은 아예
   렌더되지 않았으므로 이 완화로 사라지던 요소가 되살아날 뿐이고,
   1단계 repeat만 쓰는 기존 스킨은 코드 경로가 이전과 동일하다.

   상한을 넘으면 지금까지와 같이 경고 후 그 요소를 제거한다.
========================================================== */

function applySkinRepeat(templateEl, resolvePath, repeatDepth) {

  const path = templateEl.getAttribute("data-imory-repeat");

  const parent = templateEl.parentNode;

  if (!parent) {
    return;
  }

  if (repeatDepth >= SKIN_MAX_REPEAT_DEPTH) {
    console.warn(`[skin-render] data-imory-repeat nesting exceeds ${SKIN_MAX_REPEAT_DEPTH} levels (path="${path}") — element skipped`);
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

    stampSkinRepeatRegionKeys(clone, item);

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
   data-imory-region — protected post-body contract
   (AI_SKIN_PHASE1C_PAGE_CONTRACT.md 7절/Slice 1C-E).

   값을 resolve하지 않는다(경로가 아니라 고정 식별자, 이미
   저장 시점에 skin-sanitize.js가 "post-body" 외 값을 제거했다).
   이 엘리먼트는 Skin이 소유하는 게 아니라 caller(POST Viewer)가
   실제 본문을 mount할 자리이므로, Skin 저작자가 미리보기용으로
   넣어둔 임의 child DOM(플레이스홀더 텍스트 등)은 여기서 항상
   비운다 — region 안의 콘텐츠는 caller가 채우기 전까지 항상 빈
   컨테이너다. bind/if 등 다른 data-imory-* 속성과의 조합은 v0.1이
   지원하지 않는다(문서 5절, region은 단독으로만 쓰인다).
========================================================== */

function applySkinRegion(el) {

  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }

}

/* =========================================================
   walkSkinTree — 단일 재귀 순회로 repeat > region > if > bind/src/href
   순서를 자연스럽게 보장한다. repeat/region을 만나면 그 서브트리는
   전적으로 각자의 처리 함수가 담당하고(repeat은 각 clone마다 재귀
   재진입, region은 자식을 비우고 종료), 원본 템플릿 엘리먼트 자체의
   if/bind/자식 순회는 하지 않는다.
========================================================== */

function walkSkinTree(el, resolvePath, repeatDepth) {

  if (!el || el.nodeType !== 1) {
    return;
  }

  if (el.hasAttribute("data-imory-repeat")) {
    applySkinRepeat(el, resolvePath, repeatDepth);
    return;
  }

  if (el.hasAttribute("data-imory-region")) {
    applySkinRegion(el);
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

/* region 이름은 caller(예: POST Viewer)가 넘기는 리터럴이지 Skin
   콘텐츠에서 오는 값이 아니지만, attribute selector 문자열 조립에
   그대로 꽂히므로(querySelector) 방어적으로 형태를 제한한다. */
function isValidSkinRegionName(name) {
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);
}

let skinRenderInstanceCounter = 0;

export function renderSkin({ container, skin, context, mode = "view" } = {}) {

  if (!container) {
    throw new Error("renderSkin: container is required");
  }

  let currentSkin = skin;
  let currentContext = context;
  let currentMode = mode;
  let currentRoot;

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
    currentRoot = root;

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
      currentRoot = undefined;
    },

    /* =========================================================
       getRegion(name) -> Element | undefined

       protected post-body contract(PHASE1C 7절/Slice 1C-E)의
       caller-facing API. 항상 "지금 mount되어 있는" DOM을 live
       query하므로, update()로 재마운트된 뒤에는 이전에 저장해 둔
       엘리먼트 참조가 아니라 getRegion()을 다시 호출해서 새
       엘리먼트를 받아야 한다(재마운트 시 container.innerHTML을
       통째로 다시 그리므로 이전 참조는 detached된다 — 이건
       renderSkin() 자체의 기존 동작이지 이 API가 새로 만드는
       제약이 아니다). skin.templates.post에 "post-body" region이
       없으면 undefined — 호출자는 이 경우를 "이 Skin은 POST 본문을
       표시할 자리가 없다"로 취급해야 한다(문서 15절, template
       invalid/unsupported 판정 후보).
    ========================================================== */
    getRegion(name) {

      if (!currentRoot || !isValidSkinRegionName(name)) {
        return undefined;
      }

      return currentRoot.querySelector(`[data-imory-region="${name}"]`) || undefined;

    },

    /* =========================================================
       getRegions(name) -> Array<{ key: string | null, element }>

       FOLDER-2(Series Viewer). 같은 이름의 region 전부를 DOM 순서로
       돌려준다. key는 repeat 안에서 렌더러가 찍은 항목 키
       (data-imory-region-key, 위 stampSkinRepeatRegionKeys)이고,
       repeat 밖의 region은 null이다. getRegion()과 같은 이유로
       항상 live query다 — update() 뒤에는 다시 불러야 한다.
    ========================================================== */
    getRegions(name) {

      if (!currentRoot || !isValidSkinRegionName(name)) {
        return [];
      }

      return Array.from(
        currentRoot.querySelectorAll(`[data-imory-region="${name}"]`)
      ).map((element) => ({
        key: element.getAttribute(SKIN_REGION_KEY_ATTR),
        element
      }));

    }

  };

}

/* 나머지 skin/*.js가 전역 classic script인 것과 동일한 방식으로
   섞여 쓰일 수 있도록 window에도 노출한다(이 파일만 type="module"). */
if (typeof window !== "undefined") {
  window.renderSkin = renderSkin;
}
