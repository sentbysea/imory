/* =========================================================
   SKIN HTML SANITIZER

   AI_SKIN_PHASE1A_DESIGN.md 6절 구현. Skin Package의 `html`
   필드(4절 data-imory-* 바인딩 문법이 섞인 마크업)를 저장하기
   *전에* 통과시키는 화이트리스트 새니타이저다.

   posts/posts-sanitize.js와 동일한 접근 방식을 쓴다: 원본 DOM을
   그대로 신뢰하지 않고, 허용된 태그/속성만 골라 항상 새 DOM을
   만들어서 반환한다(cloneNode/innerHTML로 원본을 그대로 옮기지
   않음) — 대상 태그/속성 집합만 Skin 전용으로 새로 정의했다.

   책임 경계: 이 파일은 "저장 시점"에만 호출된다. skin-render.js
   (renderSkin)는 이미 sanitize를 통과한 HTML만 받는다는 전제로
   동작하며, 스스로 재검증하지 않는다(설계 문서 5절) — 즉 이
   파일을 거치지 않은 HTML을 renderSkin에 넘기는 것은 호출자의
   책임 위반이다.

   의존 없음(순수 DOM API). index.html/기존 Customize는 이 파일을
   로드하지 않는다.
========================================================== */

const SKIN_SANITIZE_ALLOWED_TAGS = new Set([
  "div", "section", "article", "header", "footer", "nav", "main", "aside", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "br", "hr",
  "b", "strong", "i", "em", "u", "small", "mark", "blockquote", "cite", "sub", "sup",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img",
  "details", "summary"
]);

/* 내용까지 통째로 제거(unwrap 아님) — posts-sanitize.js의 unwrap
   기본 동작과 달리, 이 태그들은 자식이 안전한 텍스트로 노출되면
   안 되는 것들이다(예: <script>alert(1)</script> 내부 텍스트가
   그대로 새어나오면 안 됨). */
const SKIN_SANITIZE_REMOVE_WITH_CONTENT_TAGS = new Set([
  "script", "iframe", "object", "embed", "applet", "link", "meta", "base",
  "form", "input", "button", "select", "textarea",
  "video", "audio", "source", "track", "canvas", "svg",
  "style", "noscript", "template"
]);

/* 태그 무관 공통 허용 속성(값 검증 불필요) */
const SKIN_SANITIZE_ALLOWED_COMMON_ATTRS = new Set(["class", "lang", "dir", "title", "role"]);

/* v0.1 바인딩 속성 5종 — 값은 URL이 아니라 context path 문자열 */
const SKIN_SANITIZE_BIND_ATTRS = new Set([
  "data-imory-bind",
  "data-imory-src",
  "data-imory-href",
  "data-imory-repeat",
  "data-imory-if"
]);

/* =========================================================
   data-imory-region (PHASE1C-E, 7절 Protected Post-Body Contract)

   나머지 5종과 달리 값이 context path가 아니라 고정 문자열
   식별자다(resolve 대상 아님, skin-render.js가 그대로 통과시킴).
   허용 값은 두 개다 — 그 외 값은 저장 시점에 조용히 제거한다
   (속성 자체가 안 남으므로 렌더러가 이후 이 이름으로 region을
   찾을 일도 없다).

   - "post-body": 글 본문이 들어갈 자리(PHASE 1C-E).
   - "owner-tools": 소유자에게만 보이는 플랫폼 도구(＋ / edit)가
     들어갈 자리. 스킨이 이 자리를 그려 두면 플랫폼이 자기 버튼을
     그 안으로 옮겨 스킨의 줄맞춤을 그대로 따른다
     (posts/view/posts-view-owner-tools.js). 안 그려도 되고, 그때는
     플랫폼이 스킨의 첫 콘텐츠 줄을 재서 맞춘다. 비소유자에게는
     이 자리가 항상 비어 있다 — 스킨은 그 안에 아무것도 넣지
     않는다(넣어도 렌더러가 비운다). id 속성은 여전히 SKIN_SANITIZE_DENY_ATTRS
   에서 전면 금지된 채라 Skin이 표준 id로 system root를 spoof할 수
   없다 — region 식별은 항상 이 전용 속성만으로 이뤄진다.
========================================================== */
const SKIN_SANITIZE_REGION_ATTR = "data-imory-region";
/* HIGHLIGHT-1: "memo-tools" — 메모 카드 안에 주인장 전용 도구(⋮)가
   들어갈 자리. post-body/owner-tools와 같은 성격의 고정 식별자이고,
   repeat 안에 두면 렌더러가 항목 키(data-imory-region-key = 카드 id)를
   찍어 주므로(skin/skin-render.js) 플랫폼이 "어느 카드의 자리인지"를
   DOM 순서가 아니라 키로 안다. 방문자에게는 항상 비어 있다 — 스킨이
   무엇을 넣어도 렌더러가 비운다. */
const SKIN_SANITIZE_ALLOWED_REGION_NAMES = new Set(["post-body", "owner-tools", "memo-tools"]);

/* =========================================================
   data-imory-edit-id (PHASE AI-6A, Element Inspector + Direct Edit)

   Studio의 Direct Edit이 "지금 고른 이 요소"를 재렌더/재저장 뒤에도
   같은 요소로 다시 찾기 위한 **안정 식별자**다. 값은 context path도
   URL도 아니고 렌더러가 해석하지도 않는다 — 오직 두 곳에서만
   쓰인다: (1) Studio가 생성하는 CSS 규칙의 attribute selector
   (`[data-imory-edit-id="..."]`), (2) 그 요소를 다시 찾는
   querySelector 문자열.

   그래서 값 형태를 아주 좁게 제한한다: 첫 글자는 영문, 이후는
   영문/숫자/`_`/`-`만, 최대 64자. 따옴표·대괄호·공백·역슬래시가
   원천적으로 들어갈 수 없으므로 위 두 문자열 조립에 그대로 꽂아도
   selector 구문을 깨거나 벗어날 수 없다. 형태가 맞지 않으면 조용히
   버린다(id 속성이 여전히 전면 금지인 것과 같은 결 — 이 속성은
   id의 대체재가 아니라 Studio 전용 편집 표식이다).

   published skin에서도 이 속성은 그대로 남는다(renderSkin이 매번
   sanitize를 다시 돌리므로 여기서 허용해야 공개 화면에서도 Direct
   Edit CSS 규칙이 실제로 적용된다) — 하지만 아무 동작도 트리거하지
   않는 순수 표식이라 렌더 결과에는 영향이 없다.
========================================================== */
const SKIN_SANITIZE_EDIT_ID_ATTR = "data-imory-edit-id";
const SKIN_SANITIZE_EDIT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* 명시적으로 전량 제거되는 속성(접두어 매칭은 별도 처리) */
const SKIN_SANITIZE_DENY_ATTRS = new Set([
  "style", "srcdoc", "formaction", "xlink:href",
  "autofocus", "contenteditable", "draggable", "tabindex",
  "id" /* v0.1 전면 금지, 6-3절 */
]);

/* data-imory-* path 값 자체는 URL이 아니라 dotted identifier여야
   한다(예: "navigation.categories", "item.href") — 허용 문자만
   통과시켜 저장 단계부터 이상한 값이 섞이는 걸 막는다. 실제
   존재 여부/의미 검증은 렌더 시점(skin-render.js)의 몫이다. */
const SKIN_SANITIZE_BIND_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

const SKIN_SANITIZE_UNSAFE_URL_SCHEMES = [
  "javascript:", "data:", "vbscript:", "file:", "blob:", "mailto:", "tel:"
];

/* =========================================================
   URL 검증 (6-5절) — sanitizer의 정적 href/src 및 skin-render.js의
   런타임 URL 바인딩이 공통으로 사용하는 단일 판정 함수.
========================================================== */

function isSafeSkinUrl(rawUrl) {

  if (typeof rawUrl !== "string") {
    return false;
  }

  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return false;
  }

  /* 공백/제어문자를 끼워 스킴을 위장하는 흔한 우회
     (예: "jav\tascript:alert(1)")를 막기 위해 스킴 판별에는
     제어문자/공백을 제거한 문자열을 쓴다. */
  const strippedForSchemeCheck = trimmed
    .replace(/[\x00-\x1F\x7F\s]/g, "")
    .toLowerCase();

  if (SKIN_SANITIZE_UNSAFE_URL_SCHEMES.some((scheme) => strippedForSchemeCheck.startsWith(scheme))) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, "https://imory-skin-url-base.invalid/");
    return parsed.protocol === "https:";
  } catch (err) {
    return false;
  }

}

function isSafeSkinBindPath(value) {

  return typeof value === "string" && SKIN_SANITIZE_BIND_PATH_PATTERN.test(value);

}

/* =========================================================
   속성 복사 — 화이트리스트 통과분만 새 엘리먼트에 옮긴다.
========================================================== */

function copySkinSanitizedAttributes(sourceEl, destEl, tag) {

  Array.from(sourceEl.attributes).forEach((attr) => {

    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (SKIN_SANITIZE_DENY_ATTRS.has(name)) {
      return;
    }

    if (name.startsWith("on")) {
      return;
    }

    if (SKIN_SANITIZE_BIND_ATTRS.has(name)) {
      if (isSafeSkinBindPath(value)) {
        destEl.setAttribute(name, value);
      } else {
        console.warn(`[skin-sanitize] dropped malformed binding path ${name}="${value}"`);
      }
      return;
    }

    if (name === SKIN_SANITIZE_EDIT_ID_ATTR) {
      if (SKIN_SANITIZE_EDIT_ID_PATTERN.test(value)) {
        destEl.setAttribute(name, value);
      } else {
        console.warn(`[skin-sanitize] dropped malformed ${name}="${value}"`);
      }
      return;
    }

    if (name === SKIN_SANITIZE_REGION_ATTR) {
      if (SKIN_SANITIZE_ALLOWED_REGION_NAMES.has(value)) {
        destEl.setAttribute(name, value);
      } else {
        console.warn(`[skin-sanitize] dropped unsupported ${name}="${value}"`);
      }
      return;
    }

    if (name.startsWith("aria-")) {
      destEl.setAttribute(name, value);
      return;
    }

    if (SKIN_SANITIZE_ALLOWED_COMMON_ATTRS.has(name)) {
      destEl.setAttribute(name, value);
      return;
    }

    if (name === "alt" && tag === "img") {
      destEl.setAttribute("alt", value);
      return;
    }

    if (name === "href" && tag === "a") {
      if (isSafeSkinUrl(value)) {
        destEl.setAttribute("href", value);
      } else {
        console.warn(`[skin-sanitize] dropped unsafe href="${value}"`);
      }
      return;
    }

    if (name === "src" && tag === "img") {
      if (isSafeSkinUrl(value)) {
        destEl.setAttribute("src", value);
      } else {
        console.warn(`[skin-sanitize] dropped unsafe src="${value}"`);
      }
      return;
    }

    /* 화이트리스트에 없는 나머지 속성은 전부 기본 거부 */

  });

}

/* =========================================================
   재귀 새니타이즈 — posts-sanitize.js의 sanitizeRichNode와
   동일한 원칙(원본을 신뢰하지 않고 새 노드를 구성).
========================================================== */

function sanitizeSkinNode(node, target, doc) {

  if (node.nodeType === Node.TEXT_NODE) {
    target.appendChild(doc.createTextNode(node.textContent || ""));
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    /* 주석 등은 조용히 버림 */
    return;
  }

  const tag = node.tagName.toLowerCase();

  if (SKIN_SANITIZE_REMOVE_WITH_CONTENT_TAGS.has(tag)) {
    return;
  }

  if (!SKIN_SANITIZE_ALLOWED_TAGS.has(tag)) {
    /* 허용되지 않은 미지의 태그 — 껍데기만 벗기고 자식은 살림 */
    Array.from(node.childNodes).forEach((child) => sanitizeSkinNode(child, target, doc));
    return;
  }

  const element = doc.createElement(tag);

  copySkinSanitizedAttributes(node, element, tag);

  Array.from(node.childNodes).forEach((child) => sanitizeSkinNode(child, element, doc));

  target.appendChild(element);

}

/* =========================================================
   sanitizeSkinHTML(html, ownerDocument?) -> string

   ownerDocument는 iframe 등 다른 document 컨텍스트에서 파싱해야
   할 때만 넘긴다. 기본은 전역 document(Studio는 항상 이 안에서
   저장을 트리거하므로 충분).

   원본 파싱에 element.innerHTML이 아니라 DOMParser를 쓴다(Slice
   3.5에서 실제 Chromium 테스트로 발견) — 심지어 document에
   붙어있지 않은(detached) <div>라도 .innerHTML을 대입하는 순간
   <img src="...">/<link href="...">처럼 리소스를 불러오는 태그는
   새니타이저가 뭘 지우기로 결정하기도 전에 그 URL로 실제 요청을
   이미 보내버린다("javascript:" 스킴은 브라우저가 애초에 이미지로
   못 받아오니 무해하지만, 예를 들어 <link rel="prefetch"
   href="https://attacker.example/beacon">처럼 아직 지워지지 않은
   상태에서 곧바로 실행되는 요청이면 최종적으로 그 태그를
   제거하더라도 요청 자체는 이미 나간 뒤다). DOMParser로 만든
   document는 브라우징 컨텍스트가 없어 리소스를 전혀 fetch하지
   않는다 — 실제로 innerHTML 대입 시엔 요청이 나가고 DOMParser로는
   전혀 나가지 않음을 확인했다. */

function sanitizeSkinHTML(html, ownerDocument) {

  const doc = ownerDocument || document;

  const parsedDoc = new DOMParser().parseFromString(String(html || ""), "text/html");

  const clean = doc.createElement("div");

  Array.from(parsedDoc.body.childNodes).forEach((child) => sanitizeSkinNode(child, clean, doc));

  return clean.innerHTML;

}
