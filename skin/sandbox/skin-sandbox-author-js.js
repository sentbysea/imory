/* =========================================================
   SKIN SANDBOX - AUTHOR JS RUNTIME (classic script, frame 문서 안)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §O
   단계: SANDBOX-5A — 스킨 저자가 쓴 JavaScript 를, **오직 별도
         origin 의 sandbox 프레임 안에서만** 실행한다.

   이 파일은 frame 문서(skin/sandbox/frame.html)에만 로드된다.
   부모(imory.me)·Studio·Preview 바깥 프레임에는 로드되지 않고,
   sandbox origin 의 경로 allowlist 에만 적혀 있다
   (core/lib/skin-sandbox-server.js SANDBOX_ALLOWED_PATHS).

   ---------------------------------------------------------
   ★ 어떻게 실행하는가 — nonce 가 붙은 script 요소 하나

   eval 도 new Function 도 Blob URL 도 쓰지 않고, CSP 를 한 칸도
   넓히지 않았다. frame 문서는 요청마다 새 nonce 를 받고
   (functions/_middleware.js -> createSandboxNonce), 그 nonce 가
   붙은 script 요소는 이미 허용돼 있다:

     script-src 'self' 'nonce-...' <css 파서 URL 하나>

   그래서 저자 코드를 담은 script 요소에 **그 nonce 를 달아**
   붙이면 그대로 실행된다. 'unsafe-inline' 도 'unsafe-eval' 도
   blob: 도 더하지 않는다 — CSP 전문은 SANDBOX-3 과 글자 단위로
   같다(설계 문서 §O-6).

   ★ nonce 가 무엇이고 무엇이 아닌가 (오해하기 쉬운 자리)

   nonce 는 "이 script 를 실행해도 된다"는 **허가 표식**이다.
   임의 JS 가 실행된 뒤까지 지켜지는 비밀이 아니다 — 여기서
   실행된 저자 코드는 자기 script 요소의
   document.currentScript.nonce 로, 또는 이 realm 의 다른 요소가
   가진 nonce 프로퍼티로 그 값을 **읽을 수 있다**(브라우저가
   가리는 것은 getAttribute("nonce") 뿐이다).

   그래도 상관없다. 이 설계의 경계는 nonce 가 아니라 **별도
   origin · CSP(connect-src 'none' 등) · iframe sandbox 속성 ·
   부모가 쥔 이동 표**이고, 저자가 nonce 로 script 를 하나 더
   붙여도 얻는 것이 없다 — 그는 이미 이 realm 에서 임의 코드를
   돌리고 있다.

   계약으로 지키는 것은 하나다: nonce 는 SkinPackage 에도 부모
   메시지 payload 에도 실리지 않는다.

   ★ classic script 인 이유(모듈이 아니라)

   classic 인라인 script 는 append 하는 그 자리에서 **동기적으로**
   실행된다. 그래서
     (1) "렌더가 끝난 뒤에 실행된다"가 코드 모양으로 보장되고,
     (2) 문법 오류와 최상위 예외를 append 를 감싼 error 리스너가
         그 자리에서 잡을 수 있다.
   module 이면 실행이 microtask 로 밀려서 둘 다 흐려진다.
   외부 import 는 어차피 CSP 가 막으므로 module 로 얻을 것이 없다.

   ★ textContent 로 넣는다(innerHTML 이 아니다)

   textContent 는 HTML 파싱을 거치지 않는다. 그래서 저자 코드 안의
   닫는 script 태그 문자열이나 따옴표가 문서를 깨지 못한다 —
   탈출을 막으려고 문자열을 고칠 필요가 없고, 고치지 않으므로
   저자가 쓴 코드가 **한 글자도 바뀌지 않는다**.

   ---------------------------------------------------------
   ★ 실행되기 전에 통과해야 하는 것

   부모는 저자 JS 를 아무 때나 보내지 않는다. 다섯 관문이 전부
   참일 때만 wire 에 오른다(skin/sandbox/skin-sandbox-host.js
   resolveSandboxAuthorJs):

     sandbox 기능 ON · production 이면 hostname imory.me ·
     blog slug 가 test1 · renderMode === "sandbox" ·
     저자 JS 전용 kill switch ON

   이 파일은 그 위에 **자기 몫의 관문 둘**을 더 둔다:

     1. 전역 kill switch 를 실행 직전에 다시 본다
        (SANDBOX_SKIN_AUTHOR_JS_ENABLED — 이 문서도 같은 config
         파일을 로드한다). 부모가 어떤 이유로든 코드를 보냈더라도
         스위치가 꺼져 있으면 실행하지 않는다.
     2. **한 realm 에 한 번만** 실행한다(그 판정은 호출자인
        skin/sandbox/skin-sandbox-frame.js 가 들고 있다).

   ---------------------------------------------------------
   ★ 두 번 실행하지 않는 이유 — 청소할 수 없기 때문이다

   임의의 JS 가 남기는 것을 전부 되돌릴 방법은 없다. setInterval,
   requestAnimationFrame 고리, window/document 에 건 리스너,
   MutationObserver, Promise 안에 잡혀 있는 참조 — 그중 하나만
   놓쳐도 화면을 옮길 때마다 조금씩 쌓인다.

   그래서 이 라운드는 청소하지 않는다. **realm 을 버린다.**
   다시 그릴 때마다 부모가 iframe 을 새로 만들고(그 순간 문서가
   통째로 사라지므로 타이머도 리스너도 함께 없어진다), READY/ACK →
   RENDER → JS 순서를 처음부터 다시 밟는다. 옛 프레임이 늦게
   보낸 메시지는 renderSeq 와 source 검증에 걸려 버려진다.

   onCleanup() 은 그래도 제공한다 — 저자가 자기 코드에서 정리
   지점을 갖고 싶을 때 쓰라고. 프레임이 사라지기 직전(pagehide)에
   불린다. 이 API 가 없어도 격리는 성립하지만, 있으면 저자가
   "언제 멈춰야 하는가"를 표현할 수 있다.

   ---------------------------------------------------------
   ★ 저자 JS 에 주는 것 — window.imorySkin 하나

   전역을 새로 복제해 주지 않는다. 프레임의 window 는 이미 저자
   것이고(이 문서에는 supabase client 도 인증도 부모 DOM 도 없다),
   따로 줘야 하는 것은 "이 렌더에 대한 사실" 넷과 함수 둘뿐이다.

     imorySkin.version    1          API 계약 버전
     imorySkin.pageType   "home" …   지금 그려진 화면
     imorySkin.root       Element    이번 렌더의 루트(#sandboxFrameRoot)
     imorySkin.context    object     공개용으로 투영된 Context(동결)
     imorySkin.navigate(href) -> boolean
     imorySkin.onCleanup(fn)  -> boolean

   ★ navigate() 는 기존 경로를 우회하지 않는다.

   href 를 그대로 부모에 보내지 않는다. 프레임이 가진 것은 **이번
   렌더에 부모가 발급한 표**(href -> 정수 navId)뿐이고, navigate()
   는 그 표를 뒤져 정수 하나를 올릴 뿐이다 — 링크를 클릭했을 때와
   **완전히 같은 경로**다(skin/sandbox/skin-sandbox-frame.js
   onFrameClick). 표에 없는 주소는 false 를 돌려주고 아무 일도
   일어나지 않는다. 저자가 parent.location 을 만지거나 임의 href 를
   postMessage 로 보내는 길은 여전히 없다.

   ★ context 는 **복사본**이고 동결돼 있다.

   저자 코드가 렌더러가 들고 있는 객체를 고쳐서 다음 렌더를
   어긋나게 만들 수 없게 한다. 안에 토큰·이메일·UUID·관리자 URL 은
   애초에 없다 — 그 판정은 skin/sandbox/skin-sandbox-context.js
   한 곳에서만 한다(이 파일은 그 결과를 복사만 한다).
========================================================== */


/*
  API 계약 버전. 저자 코드가 `imorySkin.version === 1` 로 자기가
  아는 계약인지 확인할 수 있다. 키가 늘어나기만 하는 변경은 이
  값을 올리지 않고, 있던 키의 의미가 바뀌면 올린다.
*/

var SANDBOX_AUTHOR_API_VERSION = 1;


/*
  onCleanup() 으로 등록할 수 있는 함수 개수. 무한정 쌓이는 배열을
  만들지 않기 위한 상한이고, 넘으면 등록이 false 를 돌려준다.
*/

var SANDBOX_AUTHOR_MAX_CLEANUPS = 64;


/* =========================================================
   deepFreezeSandboxValue(value, depth)

   투영된 Context 의 복사본을 얼린다. 깊이 상한을 두는 이유는
   순환/과도한 깊이에서 재귀가 폭주하지 않게 하기 위해서다 —
   투영 결과는 이미 얕은 순수 데이터다(설계 문서 §D-1).
========================================================== */

function deepFreezeSandboxValue(value, depth) {

  const level =
    typeof depth === "number" ? depth : 0;

  if (level > 12 || !value || typeof value !== "object") {
    return value;
  }


  if (Object.isFrozen(value)) {
    return value;
  }


  Object.freeze(value);


  const keys =
    Object.keys(value);

  for (let i = 0; i < keys.length; i += 1) {
    deepFreezeSandboxValue(value[keys[i]], level + 1);
  }


  return value;

}


/* =========================================================
   cloneSandboxContextForAuthor(context)

   structuredClone 이 있으면 그것을, 없으면 JSON 왕복을 쓴다.
   투영 결과는 함수도 DOM 도 없는 순수 데이터라 둘 다 손실이 없다.
   복사에 실패하면 null 을 돌려준다 — 그때 API 의 context 는 빈
   객체가 된다(저자 코드가 죽지 않게).
========================================================== */

function cloneSandboxContextForAuthor(context) {

  if (!context || typeof context !== "object") {
    return null;
  }


  try {

    if (typeof structuredClone === "function") {
      return structuredClone(context);
    }

  }

  catch (err) {
    /* 아래 JSON 으로 */
  }


  try {
    return JSON.parse(JSON.stringify(context));
  }

  catch (err) {
    return null;
  }

}


/* =========================================================
   buildSandboxAuthorApi(options) -> object (frozen)

   options = {
     pageType : string
     root     : Element
     context  : object      // 투영된 Context (원본을 주지 않는다)
     navigate : (href) => boolean
     cleanups : Function[]  // 호출자가 들고 있는 배열
   }
========================================================== */

function buildSandboxAuthorApi(options) {

  const opts =
    options || {};

  const cleanups =
    Array.isArray(opts.cleanups) ? opts.cleanups : [];


  const clonedContext =
    cloneSandboxContextForAuthor(opts.context);


  const api = {

    version: SANDBOX_AUTHOR_API_VERSION,

    pageType:
      typeof opts.pageType === "string" ? opts.pageType : "",

    root:
      opts.root || null,

    context:
      deepFreezeSandboxValue(clonedContext || {}),

    /*
      표에 있는 주소일 때만 true. 그 판정과 표는 전부 부모 것이고,
      이 함수는 정수 하나를 올리는 것 말고 하는 일이 없다.
    */

    navigate: function (href) {

      if (typeof opts.navigate !== "function") {
        return false;
      }

      return opts.navigate(href) === true;

    },

    /*
      프레임이 사라지기 직전에 불린다. 등록에 성공하면 true.
      (realm 을 통째로 버리므로 이 고리가 없어도 격리는 성립한다 —
       저자가 자기 정리 지점을 표현하라고 주는 것이다.)
    */

    onCleanup: function (fn) {

      if (
        typeof fn !== "function" ||
        cleanups.length >= SANDBOX_AUTHOR_MAX_CLEANUPS
      ) {
        return false;
      }

      cleanups.push(fn);

      return true;

    }

  };


  return Object.freeze(api);

}


/* =========================================================
   runSandboxAuthorCleanups(cleanups)

   하나가 던져도 나머지를 계속 부른다. 배열은 비운다(두 번 불리지
   않게).
========================================================== */

function runSandboxAuthorCleanups(cleanups) {

  if (!Array.isArray(cleanups)) {
    return 0;
  }


  const list =
    cleanups.splice(0, cleanups.length);

  let ran =
    0;

  for (let i = 0; i < list.length; i += 1) {

    try {
      list[i]();
      ran += 1;
    }

    catch (err) {
      /* 저자 코드의 예외로 프레임을 멈추지 않는다 */
    }

  }


  return ran;

}


/* =========================================================
   runSandboxAuthorScript(options)
     -> { ok:true } | { ok:false, code }

   options = {
     code    : string         // 저자 코드 원문
     nonce   : string         // 이 요청의 CSP nonce
     doc     : Document       // 기본값 document
     api     : object         // window.imorySkin 에 올릴 값
     onError : (code) => void // "script-error" 한 번만
   }

   code 는 이 함수가 **고치지 않는다**. 감싸지도, 잘라내지도,
   escape 하지도 않는다 — textContent 는 HTML 파싱을 거치지 않아
   그럴 필요가 없다.
========================================================== */

function runSandboxAuthorScript(options) {

  const opts =
    options || {};

  const doc =
    opts.doc || (typeof document !== "undefined" ? document : null);


  if (!doc || typeof opts.code !== "string" || !opts.code) {
    return { ok: false, code: "script-blocked" };
  }


  /*
    ★ 실행 직전 kill switch. 부모가 이미 판정했지만, 스위치는
    "한 곳에서 끄면 어디서도 안 돈다"여야 의미가 있다.
  */

  if (
    typeof SANDBOX_SKIN_AUTHOR_JS_ENABLED === "undefined" ||
    SANDBOX_SKIN_AUTHOR_JS_ENABLED !== true
  ) {
    return { ok: false, code: "script-blocked" };
  }


  /* --- API 를 먼저 올린다 ------------------------------ */

  if (opts.api && typeof window !== "undefined") {

    try {

      /*
        writable:false / configurable:false — 저자 코드가 자기
        realm 에서 이 이름을 덮어써도 다른 코드가 받는 값이
        바뀌지 않게. (realm 이 매번 새것이므로 재정의 충돌은
        일어나지 않는다.)
      */

      Object.defineProperty(
        window,
        "imorySkin",
        {
          value: opts.api,
          writable: false,
          configurable: false,
          enumerable: true
        }
      );

    }

    catch (err) {
      /* 이미 정의돼 있으면 그대로 둔다 */
    }

  }


  /* --- 실행 중 오류를 한 번만 올린다 -------------------- */

  let reported =
    false;

  const report =
    function () {

      if (reported) {
        return;
      }

      reported = true;

      if (typeof opts.onError === "function") {
        opts.onError("script-error");
      }

    };


  /*
    문법 오류와 최상위 예외는 append 하는 동안 window 의 error
    이벤트로 온다(classic script 라 동기적이다). 그 뒤에 타이머나
    rAF 안에서 나는 오류도 같은 리스너가 잡는다 — 그래서 떼지
    않고 남겨 둔다.

    ★ 콘솔에는 우리가 따로 남기지 않는다: 브라우저가 이미 원래
    오류를 프레임 콘솔에 찍는다. 부모로 올라가는 것은 코드 하나뿐이다.
  */

  const onWindowError =
    function () {
      report();
    };

  const onRejection =
    function () {
      report();
    };

  if (typeof window !== "undefined") {
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onRejection);
  }


  /* --- script 요소 -------------------------------------- */

  const el =
    doc.createElement("script");

  /*
    type 을 적지 않는다 = classic script. append 하는 자리에서
    동기적으로 실행된다(파일 상단 "classic script 인 이유").
  */

  if (typeof opts.nonce === "string" && opts.nonce) {
    el.setAttribute("nonce", opts.nonce);
    el.nonce = opts.nonce;
  }

  el.setAttribute("data-imory-author-js", "1");

  el.textContent = opts.code;


  try {

    /*
      head 에 붙인다 — #sandboxFrameRoot 안의 DOM 을 건드리지
      않으므로, 스킨이 그린 마크업이 native 렌더와 같은 모양으로
      남는다(저자 코드가 스스로 바꾸기 전까지는).
    */

    (doc.head || doc.documentElement).appendChild(el);

  }

  catch (err) {

    report();

  }


  return reported
    ? { ok: false, code: "script-error" }
    : { ok: true };

}


/* =========================================================
   node(단위 테스트)에서도 같은 파일을 읽을 수 있게
========================================================== */

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SANDBOX_AUTHOR_API_VERSION,
    SANDBOX_AUTHOR_MAX_CLEANUPS,
    deepFreezeSandboxValue,
    cloneSandboxContextForAuthor,
    buildSandboxAuthorApi,
    runSandboxAuthorCleanups,
    runSandboxAuthorScript
  };

}
