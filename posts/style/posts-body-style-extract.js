/* =========================================================
   POSTS - BODY STYLE EXTRACT (classic script, 순수 함수)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §M
   단계: SANDBOX-3.1 — sandbox 프레임의 POST 본문에서 Quote Preset
         서식이 빠지던 문제.

   ---------------------------------------------------------
   ★ 무엇을 푸는 함수인가

   본문 렌더 파이프라인(posts/style/posts-style-render.js)은 서식을
   **inline style 로** 건다 — `container.style.fontSize = ...`,
   형광펜 span 의 `background-image: linear-gradient(...)` 등.
   공개 native 화면에서는 그대로 잘 그려진다.

   그런데 sandbox 프레임의 CSP 에는 `style-src 'self' 'nonce-...'`
   만 있고 `'unsafe-inline'` 이 없다. 그래서 그 본문 HTML 이
   `innerHTML` 로 프레임에 들어가는 순간 **style 속성이 전부
   무시된다**(2026-09-15 chromium·webkit 실측). 글자는 나오는데
   글꼴·크기·색·행간·형광펜이 전부 빠진 상태가 된다.

   이 파일은 그 inline 선언을 **nonce 가 붙은 <style> 규칙으로
   옮긴다**. CSP 를 넓히지 않고 같은 화면을 얻는 길이다.

   ---------------------------------------------------------
   ★ 왜 여기서 CSS 파서를 새로 만들지 않는가

   이 함수는 **부모 realm**(메인 origin, CSP 없음)에서 돈다. 거기서는
   style 속성이 이미 브라우저의 CSS 파서를 통과해 CSSOM 선언 블록이
   되어 있다. 그래서 `el.style.item(i)` / `getPropertyValue()` 로
   읽기만 하면 된다 — 값의 문법 검증은 이미 **브라우저가** 했고,
   문법에 맞지 않는 선언은 그 시점에 이미 버려졌다.

   손으로 CSS 를 파싱하는 코드는 이 파일에 한 줄도 없다.

   ---------------------------------------------------------
   ★ 남은 위험은 "문법은 맞는데 위험한 값"뿐이고, 두 겹으로 막는다

   1) 속성 이름 allowlist (POST_BODY_STYLE_ALLOWED_PROPS)
      본문 파이프라인이 실제로 쓰는 것만. 목록은 실측으로 뽑았다
      (scratchpad 의 style-survey — 설계 문서 §M-2 에 결과가 있다).
      position/z-index/transform 처럼 화면을 덮거나 프레임 밖을
      건드릴 수 있는 것은 **넣지 않았다**.

   2) 값 allowlist
      · 네트워크를 부를 수 있는 형태를 **거부 목록이 아니라 허용
        목록으로** 막는다. 함수 표기가 들어 있으면 아래
        POST_BODY_STYLE_SAFE_FUNCTIONS 에 있는 것만 통과한다
        (rgb/rgba/hsl/hsla/calc/clamp/min/max/var + 그라디언트 4종).
        url() · image-set() · cross-fade() · element() 는 목록에
        없으므로 **통과하지 못한다** — CSS 로 외부 요청을 만들 수
        없다는 뜻이다.
      · `@`(@import 등) · `;` · `{` · `}` · `<` · `>` · 백슬래시
        이스케이프가 섞인 값은 거부한다. CSSOM 이 정상적으로는
        만들지 않는 모양이라, 나오면 그 자체가 신호다.
      · 길이 상한.

   3) 선택자 쪽은 **우리가 만든다**
      요소에 붙이는 클래스는 이 파일이 만든 `imory-pb-<번호>` 뿐이고,
      본문 HTML 의 글자는 선택자에 절대 들어가지 않는다. 즉 본문이
      무엇이든 임의의 CSS 규칙을 만들어 낼 수 없다.

   ---------------------------------------------------------
   ★ 우선순위(specificity) — 왜 prefix 를 받는가

   native 에서 inline style 은 author 규칙 전부를 이긴다(!important
   제외). 그냥 `.imory-pb-3 { }` 로 옮기면 특정도가 (0,1,0) 이라
   스킨의 `.sb-body p { color: red }`(0,1,1) 같은 규칙에 **져 버린다** —
   그러면 "CSP 는 통과했는데 서식이 또 달라진다"가 된다.

   그래서 호출자가 prefix 를 준다. sandbox 프레임은 자기 루트의
   **id** 인 `#sandboxFrameRoot` 를 주므로 규칙이 (1,1,0) 이 되고,
   스킨 CSS(클래스로 스코프됨)를 전부 이긴다. `!important` 에는
   지는데, 그것도 native inline 과 같은 관계다.

   ---------------------------------------------------------
   ★ native 경로는 이 파일을 부르지 않는다

   공개 native POST · Quote Preset 미리보기 · 에디터 PREVIEW ·
   발췌 export 는 지금까지와 똑같이 inline style 을 그대로 쓴다.
   이 변환은 **sandbox 프레임으로 나가는 길 하나**에서만 일어난다
   (skin/sandbox/skin-sandbox-host.js sendSandboxPostBody).
========================================================== */


/*
  본문 파이프라인이 실제로 만들어 내는 속성. 2026-09-15 실측
  (posts-style-render.js + posts-body-layout.js + posts-body-decor.js +
   posts-body-blocks.js + posts-style-dialogue.js + posts-sanitize.js 의
   모든 `.style.*` 쓰기와, 실제 렌더 결과 전수 조사).

  ★ 여기에 **없는** 것이 중요하다: position / top / left / z-index /
    transform / filter / clip-path / content / cursor / animation /
    transition / mix-blend-mode. 화면을 덮거나(클릭재킹) 프레임 밖을
    흉내내는 데 쓰일 수 있는 것들이라, 본문이 그것을 쓰지 않는 한
    열어 줄 이유가 없다.

  ★ background 는 **단축 속성이 아니라 낱개**만 받는다. CSSOM 이
    이미 낱개로 펼쳐 주므로(background-position -> -x/-y) 실무상
    차이가 없고, 단축 속성을 받으면 값 안에 url() 을 숨기기 쉬워진다.
*/

var POST_BODY_STYLE_ALLOWED_PROPS = [

  /* 글자 */
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-indent",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-color",
  "text-decoration-style",
  "text-transform",
  "white-space",
  "word-break",
  "overflow-wrap",
  "text-shadow",

  /* 형광펜 · 배경 (낱개만) */
  "background-color",
  "background-image",
  "background-repeat",
  "background-size",
  "background-position",
  "background-position-x",
  "background-position-y",
  "background-clip",
  "-webkit-background-clip",

  /* 문단 강조선 */
  "border-left-width",
  "border-left-style",
  "border-left-color",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "border-bottom-width",
  "border-bottom-style",
  "border-bottom-color",
  "border-radius",

  /* 상자 */
  "display",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "max-width",
  "width",
  "height",
  "min-height",
  "opacity",
  "vertical-align",
  "box-sizing"

];


/*
  값 안에 함수 표기가 있을 때 통과시키는 **유일한** 목록.
  여기에 url · image-set · cross-fade · element 가 없다는 것이
  "CSS 로 외부 요청을 만들 수 없다"의 근거다.
*/

var POST_BODY_STYLE_SAFE_FUNCTIONS = [
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "calc",
  "clamp",
  "min",
  "max",
  "var",
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeating-conic-gradient"
];


var POST_BODY_STYLE_MAX_VALUE_CHARS = 600;

var POST_BODY_STYLE_MAX_ELEMENTS = 20000;

var POST_BODY_STYLE_CLASS_PREFIX = "imory-pb-";

/*
  컨테이너(본문 region 자신)에 붙는 이름. 문자열 버전
  (extractPostBodyStyleSheet)은 감싼 요소를 다시 벗기므로 이
  클래스가 결과 HTML 에 남지 않는다 — **받는 쪽이 region 에
  직접 붙여야 한다**(skin/sandbox/skin-sandbox-frame.js).
*/

var POST_BODY_STYLE_ROOT_CLASS = POST_BODY_STYLE_CLASS_PREFIX + "root";


/* =========================================================
   isSafePostBodyStyleValue(value) -> boolean

   CSSOM 이 돌려준 **한 속성의 값 문자열**을 본다.
========================================================== */

function isSafePostBodyStyleValue(value) {

  if (typeof value !== "string") {
    return false;
  }


  var v =
    value.trim();

  if (!v || v.length > POST_BODY_STYLE_MAX_VALUE_CHARS) {
    return false;
  }


  /*
    CSSOM 이 정상적으로 만들어 내지 않는 글자들. 나오면 우리가
    모르는 경로로 들어온 값이므로 통째로 거부한다.

    · 세미콜론 · 중괄호   선언/블록 경계를 깨고 규칙을 새로 만들 수 있다
    · @                   @import 등
    · 부등호              </style> 로 스타일 블록을 닫는 시도
    · 역슬래시            CSS 이스케이프로 위 글자를 숨기는 길
    · CSS 주석 기호       주석을 닫고 밖으로 나가는 시도
  */

  if (/[;{}@<>\\]/.test(v)) {
    return false;
  }

  if (v.indexOf("/*") !== -1 || v.indexOf("*/") !== -1) {
    return false;
  }


  /*
    함수 표기가 있으면 허용 목록에 있는 이름만 받는다.
    url · image-set · cross-fade · element · expression 은 목록에
    없으므로 여기서 떨어진다.
  */

  var fnPattern =
    /([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\(/g;

  var match;

  while ((match = fnPattern.exec(v)) !== null) {

    if (
      POST_BODY_STYLE_SAFE_FUNCTIONS.indexOf(
        match[1].toLowerCase()
      ) === -1
    ) {
      return false;
    }

  }


  /*
    함수 이름 없이 여는 괄호만 있는 값(예: `( url(x) )`)도 받지
    않는다 — 위 검사가 이름을 못 잡는 형태다.
  */

  var bare =
    v.replace(fnPattern, "");

  if (bare.indexOf("(") !== -1) {
    return false;
  }


  return true;

}


/* =========================================================
   cssEscapeIdentValue — 클래스 이름은 우리가 만드는 값이라
   이스케이프가 필요 없다. 그래도 번호가 정수인지는 확인한다.
========================================================== */

function postBodyStyleClassName(index) {

  return POST_BODY_STYLE_CLASS_PREFIX + String(index);

}


/* =========================================================
   collectPostBodyStyleDeclarations(element) -> string

   한 요소의 inline 선언 중 **통과한 것만** `prop:value` 목록으로.
   빈 문자열이면 남길 것이 없다는 뜻이다.
========================================================== */

function collectPostBodyStyleDeclarations(element) {

  var style =
    element && element.style;

  if (!style || !style.length) {
    return "";
  }


  var out =
    [];

  for (var i = 0; i < style.length; i += 1) {

    var prop =
      style.item(i);

    if (
      typeof prop !== "string" ||
      POST_BODY_STYLE_ALLOWED_PROPS.indexOf(prop.toLowerCase()) === -1
    ) {
      continue;
    }


    var value =
      style.getPropertyValue(prop);

    if (!isSafePostBodyStyleValue(value)) {
      continue;
    }


    /*
      ★ !important 는 옮기지 않는다. 본문 파이프라인은 그것을
      만들지 않고, 옮기면 스킨 CSS 를 이길 수 없는 자리까지
      이기게 된다. 값만 옮긴다.
    */

    out.push(prop.toLowerCase() + ":" + value.trim());

  }


  return out.join(";");

}


/* =========================================================
   extractPostBodyInlineStyles(root, options)
     -> { css, moved, dropped }

   root            : 본문이 들어 있는 요소(부모 realm 의 detached
                     엘리먼트). **이 함수가 그 DOM 을 고친다** —
                     style 속성을 지우고 클래스를 붙인다.
   options.prefix  : 규칙 앞에 붙일 선택자(우선순위용). 예:
                     "#sandboxFrameRoot"
   options.rootSelector : root 자신의 선언을 어떤 선택자로 낼지.
                     주면 root 에도 클래스를 붙이고 그 규칙을 낸다.

   반환 css 는 그대로 <style> 하나에 넣으면 되는 완결된 텍스트다.
========================================================== */

function extractPostBodyInlineStyles(root, options) {

  var opts =
    options || {};

  var prefix =
    typeof opts.prefix === "string" && opts.prefix
      ? opts.prefix.trim() + " "
      : "";


  if (!root || !root.querySelectorAll) {
    return { css: "", moved: 0, dropped: 0 };
  }


  var rules =
    [];

  var seq =
    0;

  var moved =
    0;

  var dropped =
    0;


  /*
    ★ 본문에 이미 imory-pb-* 클래스가 들어 있으면 먼저 떼어 낸다.

    안 그러면 본문이 `class="imory-pb-1"` 을 미리 적어 두는 것만으로
    이 함수가 만든 첫 번째 규칙을 가져갈 수 있다. 우리가 만든 이름
    공간은 우리만 쓴다.
  */

  var pre =
    root.querySelectorAll('[class*="' + POST_BODY_STYLE_CLASS_PREFIX + '"]');

  for (var p = 0; p < pre.length; p += 1) {

    var names =
      Array.prototype.slice.call(pre[p].classList);

    for (var n = 0; n < names.length; n += 1) {

      if (names[n].indexOf(POST_BODY_STYLE_CLASS_PREFIX) === 0) {
        pre[p].classList.remove(names[n]);
      }

    }

  }


  var handle =
    function (element, forceRoot) {

      if (!element || element.nodeType !== 1) {
        return;
      }


      /* style 속성이 아예 없으면 건드릴 것이 없다 */

      if (
        !element.hasAttribute ||
        !element.hasAttribute("style")
      ) {
        return;
      }


      var declarations =
        collectPostBodyStyleDeclarations(element);


      var hadAny =
        element.style && element.style.length > 0;

      /*
        ★ style 속성은 **언제나** 지운다.

        통과한 선언은 아래에서 규칙으로 다시 나가고, 통과하지
        못한 선언은 여기서 사라진다. 프레임에서 어차피 CSP 에
        막히는 죽은 속성을 그대로 실어 보내지 않는다 — 그러면
        프레임 콘솔이 위반 경고로 뒤덮인다.
      */

      element.removeAttribute("style");


      if (!declarations) {

        if (hadAny) {
          dropped += 1;
        }

        return;

      }


      seq += 1;

      var className =
        forceRoot
          ? POST_BODY_STYLE_ROOT_CLASS
          : postBodyStyleClassName(seq);

      element.classList.add(className);

      rules.push(
        prefix + "." + className + "{" + declarations + "}"
      );

      moved += 1;

    };


  if (opts.rootSelector !== false) {
    handle(root, true);
  }


  var all =
    root.querySelectorAll("[style]");

  var limit =
    Math.min(all.length, POST_BODY_STYLE_MAX_ELEMENTS);

  for (var i = 0; i < limit; i += 1) {
    handle(all[i], false);
  }


  /*
    상한을 넘긴 나머지는 style 속성만 지운다 — 어차피 프레임에서
    적용되지 않는 값이라 실어 보낼 이유가 없다.
  */

  for (var j = limit; j < all.length; j += 1) {

    if (all[j].removeAttribute) {
      all[j].removeAttribute("style");
      dropped += 1;
    }

  }


  return {
    css: rules.join("\n"),
    moved: moved,
    dropped: dropped
  };

}


/* =========================================================
   extractPostBodyStyleSheet({ html, containerStyle, prefix })
     -> { html, css }

   문자열 버전. 호출자가 DOM 을 들고 있지 않을 때 쓴다
   (skin/sandbox/skin-sandbox-host.js).

   ★ <template> 을 쓰는 이유: 그 안의 내용은 **불활성**이라
   <img src> 가 네트워크를 부르지 않는다. 본문은 이미 부모 화면
   에서 한 번 그려졌을 수도 있으므로, 여기서 같은 그림을 다시
   받아 오지 않게 한다.
========================================================== */

function extractPostBodyStyleSheet(input) {

  var opts =
    input || {};

  var html =
    typeof opts.html === "string" ? opts.html : "";

  var containerStyle =
    typeof opts.containerStyle === "string" ? opts.containerStyle : "";


  if (typeof document === "undefined") {
    return { html: html, css: "" };
  }


  var template =
    document.createElement("template");

  /*
    컨테이너 선언을 함께 옮기기 위해 한 겹 감싼다. 감싼 요소는
    아래에서 다시 벗기므로 결과 HTML 의 구조는 그대로다.
  */

  var holder =
    document.createElement("div");

  if (containerStyle) {
    holder.setAttribute("style", containerStyle);
  }

  template.content.appendChild(holder);

  holder.innerHTML = html;


  var result =
    extractPostBodyInlineStyles(
      holder,
      {
        prefix: opts.prefix,
        rootSelector: containerStyle ? undefined : false
      }
    );


  return {
    html: holder.innerHTML,
    css: result.css,
    moved: result.moved,
    dropped: result.dropped
  };

}


/* =========================================================
   node(단위 테스트)에서도 같은 파일을 읽을 수 있게
========================================================== */

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    POST_BODY_STYLE_ALLOWED_PROPS,
    POST_BODY_STYLE_SAFE_FUNCTIONS,
    POST_BODY_STYLE_MAX_VALUE_CHARS,
    POST_BODY_STYLE_CLASS_PREFIX,
    POST_BODY_STYLE_ROOT_CLASS,
    isSafePostBodyStyleValue,
    collectPostBodyStyleDeclarations,
    extractPostBodyInlineStyles,
    extractPostBodyStyleSheet
  };

}
