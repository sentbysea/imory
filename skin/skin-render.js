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
import { installContentWidthContract } from "../core/content-width.js";

/* 폭 계약 stylesheet.

   진입 문서(index.html / preview-frame.html)는 이 파일을
   loadVersionedStyles()로 미리 걸어 둔다 — FOUC 없이 첫 페인트부터
   적용되고, ?v=APP_BUILD_VERSION으로 CDN 캐시(4시간)도 무효화된다.
   그 <link>는 버전 쿼리가 붙은 URL이므로 속성이 아니라 **경로**로
   찾는다. 진입 문서가 걸어 두지 않은 document(테스트 하네스 등)에서만
   여기서 직접 넣고, 그때도 같은 버전 쿼리를 붙인다. */

const CONTENT_WIDTH_STYLESHEET_URL =
  new URL("../core/content-width.css", import.meta.url);

/* 배치 primitive stylesheet(IMORY_LAYOUT_PRIMITIVE_DESIGN.md).

   content-width.css 와 완전히 같은 방식으로 건다 — 진입 문서가
   loadVersionedStyles()로 미리 걸어 뒀으면 그대로 두고, 걸어 두지
   않은 document(테스트 하네스 등)에서만 여기서 넣는다.

   layout 속성이 하나도 없는 스킨에서는 이 파일의 어느 선택자도
   매치되지 않는다 — 그래서 기존 스킨의 렌더 결과는 바뀌지 않는다. */
const SKIN_LAYOUT_STYLESHEET_URL =
  new URL("./skin-layout.css", import.meta.url);

/* 전환 primitive stylesheet(IMORY_TRANSITION_PRIMITIVE_DESIGN.md).
   배치와 완전히 같은 방식으로 건다. 전환 속성이 하나도 없는
   스킨에서는 이 파일의 어느 선택자도 매치되지 않는다. */
const SKIN_TRANSITION_STYLESHEET_URL =
  new URL("./skin-transition.css", import.meta.url);

function ensureSkinStylesheet(doc, stylesheetUrl, marker) {

  const alreadyLinked =
    Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).some(
      (link) => {

        try {
          return new URL(link.getAttribute("href") || "", doc.baseURI).pathname ===
            stylesheetUrl.pathname;
        } catch (error) {
          return false;
        }

      }
    );

  if (alreadyLinked) {
    return;
  }

  const version =
    typeof APP_BUILD_VERSION === "string"
      ? APP_BUILD_VERSION
      : null;

  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = version
    ? `${stylesheetUrl.pathname}?v=${version}`
    : stylesheetUrl.href;
  link.setAttribute(marker, "");

  doc.head.appendChild(link);

}

/* 좌우 영역(IMORY_SIDES_DESIGN.md) — 같은 방식. 틀이 없는 스킨에서는
   이 파일의 어느 선택자도 매치되지 않는다. */
const SKIN_SIDES_STYLESHEET_URL =
  new URL("./skin-sides.css", import.meta.url);

function ensureSkinSidesStylesheet(doc) {
  ensureSkinStylesheet(doc, SKIN_SIDES_STYLESHEET_URL, "data-imory-skin-sides");
}

function ensureSkinLayoutStylesheet(doc) {
  ensureSkinStylesheet(doc, SKIN_LAYOUT_STYLESHEET_URL, "data-imory-skin-layout");
}

function ensureSkinTransitionStylesheet(doc) {
  ensureSkinStylesheet(doc, SKIN_TRANSITION_STYLESHEET_URL, "data-imory-skin-transition");
}

function ensureContentWidthStylesheet(doc) {

  const alreadyLinked =
    Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).some(
      (link) => {

        try {
          return new URL(link.getAttribute("href") || "", doc.baseURI).pathname ===
            CONTENT_WIDTH_STYLESHEET_URL.pathname;
        } catch (error) {
          return false;
        }

      }
    );

  if (alreadyLinked) {
    return;
  }

  /* build-version.js는 classic script의 top-level const라 전역
     lexical 바인딩이다 — window 속성이 아니므로 bare 식별자로
     읽는다(이 모듈과 같은 realm에서 이미 로드돼 있다). */

  const version =
    typeof APP_BUILD_VERSION === "string"
      ? APP_BUILD_VERSION
      : null;

  const widthContract = doc.createElement("link");
  widthContract.rel = "stylesheet";
  widthContract.href = version
    ? `${CONTENT_WIDTH_STYLESHEET_URL.pathname}?v=${version}`
    : CONTENT_WIDTH_STYLESHEET_URL.href;
  widthContract.setAttribute("data-imory-content-width", "");

  doc.head.appendChild(widthContract);

}


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

function applySkinRepeat(templateEl, resolvePath, repeatDepth, onRepeatItem) {

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

    walkSkinTree(clone, itemResolve, repeatDepth + 1, onRepeatItem);

    stampSkinRepeatRegionKeys(clone, item);

    /* =====================================================
       onRepeatItem(clone, item, path) — caller 가 자기 표식을
       찍는 자리 (BOTTOM-DOCK-1).

       왜 필요한가 — Bottom Dock 의 항목 중 일부는 주소가 없는
       동작이다(패널 열기 · 공유 · 맨 위로). 그런 항목을 눌렀을 때
       플랫폼이 "어느 항목인가"를 알아야 하는데, 스킨 HTML 에는
       그 표식을 적을 수 없다(skin/skin-sanitize.js 의 속성
       화이트리스트에 없어 저장/렌더 전에 늘 제거된다 —
       data-imory-region-key 와 정확히 같은 사정이다).

       그래서 **렌더러가 clone 을 만드는 그 자리**에서 caller 가
       한 번 손댈 수 있게 한다. 넘기지 않는 기존 호출자(공개
       HOME/CATEGORY/POST, Studio Preview, sandbox)는 결과가 한
       byte 도 바뀌지 않는다.
    ====================================================== */

    if (typeof onRepeatItem === "function") {

      try {
        onRepeatItem(clone, item, path);
      } catch (err) {
        console.warn("[skin-render] onRepeatItem threw", err);
      }

    }

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
   data-imory-kind — "이 항목이 어떤 종류인가"를 CSS가 볼 수 있게
   한다(SKIN_SURFACE_AND_TRANSITION_CONTRACT.md 재료 일치 라운드).

   왜 필요한가 — 카테고리 아이콘처럼 "종류에 따라 다르게 그리는"
   장식을 지금까지 스킨은 `li:nth-child(2)` 같은 **순서**나 본문에
   박은 글자(▤)로 흉내 낼 수밖에 없었다. 그러면 사용자가 카테고리
   순서를 바꾸거나 하나를 지우는 순간 아이콘이 통째로 어긋나고,
   목록 길이가 조금만 달라도 Studio와 공개 화면이 서로 다른 그림을
   그린다. 종류는 Context가 이미 알고 있으므로(navigation.*.iconKind)
   그 값을 속성 하나로 DOM에 얹어 CSS 선택자에 넘긴다.

     directive : data-imory-kind="item.iconKind"   (값은 context path)
     결과      : data-kind="document"              (해석된 종류 토큰)

   src/href와 같은 결이다 — 지시 속성과 결과 속성의 이름이 다르므로
   같은 DOM을 다시 렌더해도 경로가 값으로 덮어써지지 않는다.

   토큰은 아주 좁게 제한한다(소문자로 시작, 소문자/숫자/하이픈,
   32자) — 스킨 CSS의 attribute selector에 그대로 들어갈 값이라
   따옴표·대괄호·공백이 원천적으로 섞일 수 없어야 한다. 형태가
   맞지 않으면 속성을 지운다(스킨이 적어 둔 기본 모양이 남는다).
========================================================== */

const SKIN_KIND_TOKEN_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

function applySkinKind(el, resolvePath) {

  const path = el.getAttribute("data-imory-kind");

  let value;

  try {
    value = resolvePath(path);
  } catch (err) {
    console.warn(`[skin-render] failed to resolve data-imory-kind path "${path}"`, err);
    value = undefined;
  }

  if (typeof value !== "string" || !SKIN_KIND_TOKEN_PATTERN.test(value)) {

    el.removeAttribute("data-kind");
    return;

  }

  el.setAttribute("data-kind", value);

}

/* =========================================================
   data-imory-color — 항목마다 다른 색을 CSS 변수로 넘긴다.

   하이라이트 카드처럼 "저장된 색"이 있는 항목은 그 색으로 강조선을
   그릴 수 있어야 하는데, 스킨은 style 속성을 쓸 수 없고(sanitizer가
   전면 금지, skin/skin-sanitize.js) CSS만으로는 데이터에 있는 색을
   알 방법이 없다. 그래서 렌더러가 그 요소에 custom property 하나만
   얹어 준다.

     directive : data-imory-color="item.color"
     결과      : style="--imory-color: #f6e0c8"

   스킨 CSS는 `var(--imory-color, <기본색>)`로 받는다 — 값이 없거나
   모양이 틀리면 변수 자체가 없으므로 스킨이 적어 둔 기본색이 그대로
   쓰인다. 값은 #rgb / #rrggbb 만 받는다: setProperty에 넘기는
   문자열이라 함수·url·세미콜론이 섞이면 안 된다.
========================================================== */

const SKIN_COLOR_VALUE_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function applySkinColor(el, resolvePath) {

  const path = el.getAttribute("data-imory-color");

  let value;

  try {
    value = resolvePath(path);
  } catch (err) {
    console.warn(`[skin-render] failed to resolve data-imory-color path "${path}"`, err);
    value = undefined;
  }

  const trimmed =
    typeof value === "string" ? value.trim() : "";

  if (!SKIN_COLOR_VALUE_PATTERN.test(trimmed)) {

    el.style.removeProperty("--imory-color");
    return;

  }

  el.style.setProperty("--imory-color", trimmed);

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

function walkSkinTree(el, resolvePath, repeatDepth, onRepeatItem) {

  if (!el || el.nodeType !== 1) {
    return;
  }

  if (el.hasAttribute("data-imory-repeat")) {
    applySkinRepeat(el, resolvePath, repeatDepth, onRepeatItem);
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

  if (el.hasAttribute("data-imory-kind")) {
    applySkinKind(el, resolvePath);
  }

  if (el.hasAttribute("data-imory-color")) {
    applySkinColor(el, resolvePath);
  }

  Array.from(el.children).forEach((child) => walkSkinTree(child, resolvePath, repeatDepth, onRepeatItem));

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


/* =========================================================
   IMAGE-CROP-PRIORITY-1 — 자르기 보호 규칙
   (IMORY_IMAGE_CROP_PRIORITY_DESIGN.md)

   ★ 무엇이 문제였나
   Studio 자르기는 결과를 보통 CSS 규칙 둘로 저장한다(래퍼 = 프레임,
   <img> = 사진, docs/features/images/AI_SKIN_PHASE_AI6D_IMAGE_CROP.md 2절).
   그런데 스킨이 사진에

       .foe-photo img { width:100% !important; object-position:center 29% !important }

   처럼 !important 를 걸어 두면, 그보다 약한 자르기 규칙은 specificity
   를 아무리 올려도 이길 수 없다 — 확대 181% 가 계산은 됐는데 화면은
   100% 그대로였다(2026-09-19 FOREVER, MY FOE 실측).

   ★ 어떻게 하나 — 저장은 그대로, 그릴 때 보호한다
   저장된 자르기 규칙이 곧 자르기 데이터다. 렌더러는 그 값을 읽어
   **cascade layer 안의 !important 선언**으로 한 번 더 싣는다.
   CSS Cascade 5: !important 끼리는 layer 에 든 쪽이 layer 밖(스킨이
   쓴 모든 규칙)을 specificity 와 무관하게 이긴다. 그래서 스킨이
   선택자를 얼마나 세게 쓰든, 어떤 순서로 쓰든 자르기가 이긴다.

   - 스킨 CSS 는 한 글자도 바꾸지 않는다. 보호 규칙은 저장되지도,
     Export 되지도 않는다 — 렌더할 때마다 저장된 자르기 규칙에서
     다시 만든다(공개 화면 · Studio Preview · sandbox 프레임이 모두
     이 함수 하나를 지난다).
   - 자르기 프레임(`--imory-crop` 표식)이 **이미지 하나만** 감싼
     경우만 대상이다. 자르지 않은 이미지 · 아이콘 · SVG 는 스킨
     디자인(object-fit/position 포함) 그대로다.
   - 사진 쪽에서 막는 것은 "자르기가 정한 자리와 크기"를 흔드는
     속성뿐이다: 위치·크기·여백·변형·비율·맞춤. filter · 테두리 ·
     그림자 같은 장식은 스킨 것 그대로 남는다.
   - 프레임 쪽은 잘라 주는 두 가지만 막는다(overflow · contain).
     프레임의 크기·자리·모서리는 스킨과 자르기 규칙이 평소대로
     정한다.

   Studio 의 임시 미리보기(적용 전)도 같은 선언 묶음을 inline
   !important 로 얹는다(studio/preview/preview-bridge.js) — 적용 전과
   후가 같은 우선순위에서 그려진다.
========================================================== */

const SKIN_CROP_GUARD_LAYER = "imory-crop-guard";

const SKIN_CROP_MARKER = "--imory-crop";

const SKIN_CROP_EDIT_ID_ATTR = "data-imory-edit-id";

/* skin/skin-sanitize.js SKIN_SANITIZE_EDIT_ID_PATTERN 과 같은 모양 */
const SKIN_CROP_EDIT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const SKIN_CROP_PERCENT_PATTERN = /^-?(?:\d+|\d*\.\d+)%$/;

const SKIN_CROP_FIT_VALUES = ["cover", "contain"];


/* =========================================================
   buildSkinCropGuardDeclarations(image) -> { frame, image } | null

   image: 저장된 사진 규칙의 선언 { 속성: "값" }.
   자르기가 만든 모양(전부 %)이 아니면 null — 알 수 없는 값을
   !important 로 올리지 않는다.
========================================================== */

export function buildSkinCropGuardDeclarations(image) {

  const source =
    image || {};

  const read = (name) =>
    String(source[name] === undefined || source[name] === null ? "" : source[name]).trim();

  const left = read("left");
  const top = read("top");
  const width = read("width");
  const height = read("height");

  if (![left, top, width, height].every((value) => SKIN_CROP_PERCENT_PATTERN.test(value))) {
    return null;
  }

  if (!(parseFloat(width) > 0) || !(parseFloat(height) > 0)) {
    return null;
  }

  const position =
    read("object-position").split(/\s+/).filter(Boolean);

  const fit =
    read("object-fit").toLowerCase();

  return {
    frame: {
      overflow: "hidden",

      /* 사진의 절대배치 기준을 프레임으로 못 박는다. position 을
         건드리지 않아도 된다 — 스킨이 프레임을 absolute 로 옮겨
         두었든 static 으로 눌러 두었든 paint containment 가 곧
         containing block 이고, 넘친 부분도 잘라 준다. */
      contain: "paint"
    },
    image: {
      position: "absolute",
      left,
      top,
      right: "auto",
      bottom: "auto",
      width,
      height,
      "min-width": "0",
      "min-height": "0",
      "max-width": "none",
      "max-height": "none",
      margin: "0",
      padding: "0",
      transform: "none",
      translate: "none",
      rotate: "none",
      scale: "none",
      "aspect-ratio": "auto",
      "object-fit": SKIN_CROP_FIT_VALUES.includes(fit) ? fit : "cover",
      "object-position":
        (position.length === 2 && position.every((value) => SKIN_CROP_PERCENT_PATTERN.test(value)))
          ? position.join(" ")
          : "50% 50%"
    }
  };

}


function skinCropGuardDeclarationText(declarations) {

  return Object.keys(declarations)
    .map((property) => `${property}:${declarations[property]}!important`)
    .join(";");

}


/* =========================================================
   buildSkinCropGuardCss(fragment, editRules, scopeClass) -> string

   fragment   sanitize 를 지난 template 내용(반복 clone 전 — 반복
              항목은 같은 식별자를 나눠 쓰므로 규칙 하나로 충분하다)
   editRules  validateAndScopeSkinCss 가 모아 준 직접 편집 규칙
   scopeClass 이 렌더 인스턴스의 스코프 클래스

   자르기가 하나도 없으면 "" — 그때는 <style> 내용이 이 라운드
   이전과 한 글자도 다르지 않다.
========================================================== */

function buildSkinCropGuardCss(fragment, editRules, scopeClass) {

  if (!fragment || !editRules || typeof scopeClass !== "string" || !scopeClass) {
    return "";
  }

  const blocks = [];

  const seen = new Set();

  const selectorOf = (id) =>
    `[${SKIN_CROP_EDIT_ID_ATTR}="${id}"][${SKIN_CROP_EDIT_ID_ATTR}="${id}"]`;

  fragment.querySelectorAll(`[${SKIN_CROP_EDIT_ID_ATTR}]`).forEach((frame) => {

    const frameId =
      frame.getAttribute(SKIN_CROP_EDIT_ID_ATTR);

    const frameRule =
      SKIN_CROP_EDIT_ID_PATTERN.test(frameId || "") ? editRules[frameId] : null;

    const marker =
      frameRule && frameRule[SKIN_CROP_MARKER];

    if (!marker || !String(marker.value || "").trim()) {
      return;
    }

    /* 자르기 래퍼는 언제나 이미지 하나만 감싼다 — 표식을 가진
       다른 상자를 프레임으로 착각하지 않는다. */
    if (frame.children.length !== 1 || frame.firstElementChild.tagName !== "IMG") {
      return;
    }

    const imageId =
      frame.firstElementChild.getAttribute(SKIN_CROP_EDIT_ID_ATTR);

    if (!SKIN_CROP_EDIT_ID_PATTERN.test(imageId || "") || !editRules[imageId]) {
      return;
    }

    const key =
      `${frameId}>${imageId}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const values = {};

    Object.keys(editRules[imageId]).forEach((property) => {
      values[property] = editRules[imageId][property].value;
    });

    const guard =
      buildSkinCropGuardDeclarations(values);

    if (!guard) {
      return;
    }

    const frameSelector =
      `.${scopeClass} ${selectorOf(frameId)}`;

    blocks.push(`${frameSelector}{${skinCropGuardDeclarationText(guard.frame)}}`);
    blocks.push(`${frameSelector}>${selectorOf(imageId)}{${skinCropGuardDeclarationText(guard.image)}}`);

  });

  if (!blocks.length) {
    return "";
  }

  return `@layer ${SKIN_CROP_GUARD_LAYER}{\n${blocks.join("\n")}\n}`;

}

/* =========================================================
   styleNonce (선택, SANDBOX-1)

   이 렌더러는 스킨 CSS를 doc.createElement("style")로 만들어
   붙인다. 그 <style>은 **동적으로 만든 요소라도 CSP style-src의
   적용 대상**이다(2026-09-15 chromium 실측: style-src가
   nonce만 허용하면 nonce 없는 동적 <style>은 적용되지 않고
   "Applying inline style violates ..." 위반이 난다. 반면
   element.style.setProperty() 같은 CSSOM 쓰기는 막히지 않는다 —
   core/content-width.js는 그래서 영향이 없다).

   sandbox 프레임은 style-src에 'unsafe-inline'을 두지 않는다.
   그래서 그 문서만 이 옵션으로 자기 nonce를 넘긴다. 넘기지 않는
   기존 호출자(공개 HOME/CATEGORY/POST, Studio Preview)는 결과가
   한 byte도 바뀌지 않는다 — 아래에서 값이 문자열일 때만 속성을
   붙인다.
========================================================== */

/* =========================================================
   transitionAppear (선택, TRANSITION-1)

   전환을 선언한 요소가 마운트될 때 "들어오기"를 재생할지.
   기본은 재생이다(공개 화면 · sandbox 프레임 — 페이지 전환이
   이것이다). Studio Preview 만 false 를 넘긴다: 글자 하나 고칠
   때마다 화면 전체가 다시 들어오면 편집을 할 수 없다. 그때도
   값은 똑같이 컴파일되고, "미리 보기"가 같은 값으로 재생한다
   (skin/skin-transition.js compileSkinTransitionTree).
========================================================== */

export function renderSkin({ container, skin, context, mode = "view", styleNonce, onRepeatItem, transitionAppear = true } = {}) {

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
    installContentWidthContract(doc);
    ensureContentWidthStylesheet(doc);
    ensureSkinLayoutStylesheet(doc);
    ensureSkinTransitionStylesheet(doc);
    ensureSkinSidesStylesheet(doc);

    const safeHtml = sanitizeSkinHTML(String(currentSkin?.html || ""), doc);

    const cssResult = validateAndScopeSkinCss(String(currentSkin?.css || ""), { namespace: instanceNamespace });

    if (!cssResult.ok) {
      console.warn("[skin-render] css validation failed, rendering without CSS", cssResult.warnings);
    }

    const safeCss = cssResult.ok ? cssResult.css : "";

    /* 좌우 영역(IMORY_SIDES_DESIGN.md) — 비우기 **전에** 옛 틀을 내린다.
       열린 패널이 스크롤을 잠가 두었으면 여기서 풀린다. 열려 있던 쪽은
       새 틀에서 움직임 없이 다시 연다(Studio 가 글자 하나마다 다시
       그려도 패널이 닫히지 않게). 틀이 없던 스킨이면 null 이다. */
    const sidesOpenBefore =
      typeof disposeSkinSides === "function"
        ? disposeSkinSides(container)
        : null;

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

    /* CSP nonce — 위 styleNonce 주석 참고. 문서에 삽입되기 **전에**
       달아야 한다(삽입 후에 달면 이미 한 번 거부된 뒤다). 속성과
       IDL 양쪽에 넣는다 — 브라우저에 따라 nonce 속성을 감추고
       IDL 값만 유지한다. */
    if (typeof styleNonce === "string" && styleNonce) {
      styleEl.setAttribute("nonce", styleNonce);
      styleEl.nonce = styleNonce;
    }

    const template = doc.createElement("template");
    template.innerHTML = safeHtml;

    /* IMAGE-CROP-PRIORITY-1 — 자르기 보호 규칙(위 buildSkinCropGuardCss).
       layer 이름을 **맨 앞에서** 먼저 선언한다: !important 끼리는
       먼저 선언된 layer 가 이긴다. 스킨이 자기 @layer 를 쓰더라도
       이 layer 가 가장 먼저다. 자르기가 없으면 안 붙는다. */
    const cropGuardCss =
      cssResult.ok
        ? buildSkinCropGuardCss(template.content, cssResult.editRules, cssResult.scopeClass)
        : "";

    /* EDITORIAL-DEFAULT-SKIN-2 — 주인이 고른 색 네 역할을 스킨 루트의
       custom property 로(skin/skin-settings.js). 스킨은
       var(--imory-color-*, 기본값) 로 읽는다. 값은 검증된 #rrggbb 뿐이고,
       설정이 없으면 한 글자도 붙지 않는다. */
    const themeCss =
      cssResult.ok && typeof buildSkinThemeColorsCss === "function"
        ? buildSkinThemeColorsCss(currentSkin?.settings?.colors, cssResult.scopeClass)
        : "";

    const cssWithTheme =
      themeCss
        ? `${themeCss}\n${safeCss}`
        : safeCss;

    styleEl.textContent =
      cropGuardCss
        ? `@layer ${SKIN_CROP_GUARD_LAYER};\n${cssWithTheme}\n${cropGuardCss}`
        : cssWithTheme;

    root.appendChild(styleEl);

    root.appendChild(template.content.cloneNode(true));

    container.appendChild(root);
    currentRoot = root;

    /* EDITORIAL-DEFAULT-SKIN-2 — `settings.*` 는 Context 가 아니라 스킨
       설정(skin.settings, resolveSkinTemplate 이 regions 에서 만든다)에서
       온다. D-day 처럼 오늘 날짜로 계산되는 값이라 그릴 때 만든다.
       설정 파일이 없는 문서면 이 이름은 아무것도 가리키지 않는다. */
    const settingsScope =
      typeof buildSkinSettingsContext === "function"
        ? { settings: buildSkinSettingsContext(currentSkin?.settings) }
        : null;

    const resolveTopLevel = (path) =>
      settingsScope && typeof path === "string" && (path === "settings" || path.startsWith("settings."))
        ? resolveSkinPath(settingsScope, path)
        : resolveSkinPath(currentContext, path);

    Array.from(root.children)
      .filter((child) => child !== styleEl)
      .forEach((child) => walkSkinTree(child, resolveTopLevel, 0, onRepeatItem));

    /* =====================================================
       배치 primitive 컴파일 — 반드시 walk **뒤**다.

       data-imory-repeat 은 clone 을 만들어 넣으므로, walk 전에
       컴파일하면 반복으로 생긴 항목들이 자기 custom property 를
       못 받는다(격자 안에서 반복되는 카드가 전부 span 없이
       그려지는 식). 여기서 한 번 돌면 template 도 clone 도 전부
       같은 값을 받는다.

       layout 속성이 하나도 없는 스킨에서는 이 호출이 어떤 요소도
       건드리지 않는다 — style 속성조차 생기지 않으므로 기존
       스킨의 outerHTML 이 글자 단위로 그대로다
       (skin/skin-layout.js 7절).
    ====================================================== */
    /* HOME 사진 구성(skin/skin-settings.js) — walk **뒤**다: 어느 사진이
       채워졌는지는 data-imory-if 가 슬롯 값을 보고 정한 hidden 으로 안다.
       배치보다 먼저 — 접힌 사진이 격자의 칸을 차지하지 않게.
       사진 묶음이 없는 스킨에서는 어떤 요소도 건드리지 않는다. */
    if (typeof compileSkinPhotos === "function") {
      compileSkinPhotos(root, currentSkin?.settings?.photos);
    }

    if (typeof compileSkinLayoutTree === "function") {
      compileSkinLayoutTree(root);
    }

    /* 전환 primitive — 배치와 같은 자리, 같은 이유로 walk **뒤**다
       (반복 clone 도 자기 값을 받는다). 전환 속성이 없는 스킨에서는
       어떤 요소도 건드리지 않는다(skin/skin-transition.js 9절). */
    if (typeof compileSkinTransitionTree === "function") {
      compileSkinTransitionTree(root, { appear: transitionAppear !== false });
    }

    /* 좌우 영역 — 설정(skin.sides, resolveSkinTemplate 이 regions 에서
       만든다)과 틀(data-imory-sides="frame")이 만나는 자리. 틀이 없는
       스킨에서는 아무 요소도 건드리지 않는다. */
    if (typeof compileSkinSides === "function") {
      compileSkinSides(root, currentSkin?.sides, {
        container,
        restoreOpen: sidesOpenBefore
      });
    }

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
      if (typeof disposeSkinSides === "function") {
        disposeSkinSides(container);
      }
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

  /* Studio Preview 의 자르기 임시 미리보기가 같은 선언 묶음을 쓴다
     (studio/preview/preview-bridge.js applyInspectorPreview). */
  window.buildSkinCropGuardDeclarations = buildSkinCropGuardDeclarations;
}
