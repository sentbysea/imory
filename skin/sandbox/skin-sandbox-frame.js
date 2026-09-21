/* =========================================================
   SKIN SANDBOX - FRAME BRIDGE (ES 모듈, frame 문서 안)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §E SANDBOX-1 / SANDBOX-2
   단계: SANDBOX-2 — HOME / CATEGORY / POST 와 안전한 페이지 이동

   이 파일이 하는 일은 여섯뿐이다.
     1. 부모에게 IMORY_FRAME_READY를 한 번 보낸다.
     2. IMORY_FRAME_ACK을 받으면 표시만 남긴다.
     3. IMORY_RENDER_PAGE(옛 IMORY_RENDER_HOME)를 받으면
        **기존 renderSkin()**으로 그린다.
     4. 그린 높이를 IMORY_RENDERED / IMORY_HEIGHT로 올린다.
     5. IMORY_POST_BODY를 받으면 post-body region에 넣는다.
     6. 프레임 안 링크를 누르면 IMORY_NAVIGATE로 **정수 하나**를
        올린다 — 주소가 아니다(아래 "링크" 절).

   ---------------------------------------------------------
   ★ 이 문서가 로드하지 않는 것 (의도적)

     - supabase-js / core/lib/supabase-client.js
     - 인증 코드(auth/*)
     - 관리자 코드(admin/*, studio/*)
     - skin/skin-context.js (skin-context builder)

   frame은 렌더러이지 데이터 클라이언트가 아니다. 조회·권한 판정·
   Context 조립은 전부 부모가 오늘처럼 한다(CLAUDE.md §2).
   CSP의 connect-src 'none'이 이 원칙을 헤더로도 못박는다.

   ★ 새 렌더러를 만들지 않는다

   공개 화면과 **같은** skin/skin-render.js를 정적 import한다.
   그래서 sanitizeSkinHTML()과 validateAndScopeSkinCss()가 여기서도
   렌더할 때마다 다시 돈다(Slice 3.5 신뢰 경계). HTML 문자열을
   innerHTML에 직접 꽂는 코드는 이 파일에 없다 — 그러면 렌더러의
   검증을 통째로 건너뛰게 된다.

   ★ ES 모듈인 이유 (SANDBOX-0에서 바뀐 점)

   SANDBOX-0의 frame은 classic script였다. 모듈을 쓰면 정적 import에
   ?v=가 붙지 않아 import map(인라인 script)이 필요해지고, 그러면
   CSP를 한 칸 넓혀야 하기 때문이었다. SANDBOX-1은 renderSkin()을
   들여오면서 그 칸을 **nonce로** 연다 — 'unsafe-inline'이 아니다.
   frame.html의 인라인 블록이 자기 nonce를 읽어
   writeVersionedImportMap()에 넘긴다(그 파일 주석 참고).

   ★ 부모를 어떻게 믿는가

   resolveSandboxSkinParentOrigins()는 **이 문서 자신의 상수**다.
   부모가 메시지로 알려 준 origin을 쓰지 않는다 — 그러면 공격자가
   값을 심을 수 있는 경로가 생긴다. 보내는 쪽 targetOrigin도 이
   상수에서 고른 값이지 "*"가 아니다.

   ★ 부모가 보낸 data도 믿지 않는다

   프로토콜 검사를 통과한 payload.data를 그대로 renderSkin()에
   넘기지 않는다. projectSkinContextForSandbox()를 **여기서 한 번
   더** 돌려서 알려진 키만 남긴다(skin/sandbox/skin-sandbox-context.js
   상단 "양쪽에서 각각 돈다").

   ★ 링크 (SANDBOX-2)

   프레임은 **여전히 스스로 어디로도 가지 않는다.** 모든 anchor
   클릭을 preventDefault로 막고, 그 위에서 부모가 발급한 표에
   있는 링크면 IMORY_NAVIGATE로 **정수 navId 하나**를 올린다.
   주소 문자열은 절대 보내지 않고, 이 파일에는 URL 파싱도 경로
   규칙도 없다 — "어디로 갈 수 있는가"의 판정은 전부 부모가
   미리 했다(skin/sandbox/skin-sandbox-nav.js).

   프레임이 스스로 주소를 바꾸거나 새 탭을 여는 길은 여전히
   없다(iframe sandbox 속성에 allow-top-navigation /
   allow-popups가 없고, CSP form-action 'none' 이다).
========================================================== */

import { renderSkin } from "../skin-render.js";


/* =========================================================
   높이 보고 규칙

   - 직전에 보낸 값과 1px 이하 차이면 보내지 않는다(진동 방지).
   - 렌더 한 번당 보고 횟수에 상한을 둔다. 스킨 CSS가 "높이에
     반응해서 높이를 바꾸는" 모양(vh 단위, 부모 높이에 맞춘 비율
     등)을 쓰면 부모가 높이를 적용 -> 프레임 높이 변화 -> 다시
     보고의 고리가 돌 수 있다. 상한에 닿으면 조용히 멈춘다 —
     화면은 마지막 값으로 남고, 무한 메시지 루프는 생기지 않는다.
========================================================== */

const SANDBOX_HEIGHT_EPSILON = 1;

const SANDBOX_HEIGHT_REPORT_LIMIT = 120;


(function () {

  "use strict";


  const FRAME_STATE = {
    parentOrigin: "",

    /* =====================================================
       SANDBOX-5A — 이 요청의 CSP nonce

       frame.html 의 인라인 블록이 window.__imorySandboxNonce 에
       올려 둔 값을 start() 가 여기로 옮겨 담고 **window 에서
       지운다**. 저자 JS 가 그 이름으로 nonce 를 주워 쓰는 길을
       남기지 않기 위해서다(frame.html 그 블록의 주석 참고).

       쓰이는 곳은 셋이다: 본문 서식 style · renderSkin 의 동적
       style · 저자 JS 를 담는 script.
    ====================================================== */

    nonce: "",

    /* =====================================================
       SANDBOX-5A — 저자 JS

       authorJsRan   : 이 realm 에서 이미 한 번 실행했는가.
                       **한 realm 에 한 번**이 이 라운드의 규칙이고,
                       다시 그릴 때는 부모가 프레임을 새로 만든다
                       (skin/sandbox/skin-sandbox-author-js.js 상단
                        "두 번 실행하지 않는 이유").
       authorCleanups: imorySkin.onCleanup() 으로 등록된 함수들.
                       pagehide 에서 한 번 불린다.
    ====================================================== */

    authorJsRan: false,
    authorCleanups: [],

    /* SANDBOX-3.1 — 본문 서식 <style> 하나(재사용) */
    postBodyStyle: null,

    /* =====================================================
       SANDBOX-6A — Element Inspector (Select)

       controller 는 **한 번만** 만든다(start 에서). Inspect 를
       켜고 끄는 것으로 realm 을 다시 만들지 않으므로 저자 JS 도
       다시 돌지 않고 타이머도 한 벌 그대로다.

       null 이면 이 문서에 skin-sandbox-inspect.js 가 로드되지
       않은 것이다 — 그때는 INSPECT_* 메시지가 와도 아무 일도
       일어나지 않는다(화면은 지금까지와 같다).
    ====================================================== */

    inspector: null,

    /* =====================================================
       HOME-CANVAS-SELECT-1B-1 — 캔버스 선택 틀 (Moveable)

       canvasFrame        skin/skin-home-canvas-editor-runtime.js 의
                          controller. **첫 Canvas 요소가 실제로
                          골라졌을 때** 처음 만들어진다.
       canvasFramePromise 그 모듈을 받아 오는 중인 Promise(문서당
                          하나). 실패하면 버려서 다음 선택이 다시
                          시도할 수 있게 한다.
       canvasSelection    마지막으로 받은 선택. 재렌더 뒤 되살릴 때
                          쓴다(같은 화면을 다시 그리면 캔버스 DOM 이
                          새로 만들어진다).

       ★ 공개 화면에서는 이 셋이 전부 비어 있다. 부모가 캔버스
         선택 메시지를 보내는 곳은 Studio 하나뿐이므로, 공개 방문자
         에게는 runtime 도 vendor UMD 도 요청되지 않는다.
    ====================================================== */

    canvasFrame: null,
    canvasFramePromise: null,
    canvasSelection: null,

    sentReady: false,
    acked: false,
    seq: 0,

    renderSeq: 0,
    instance: null,
    lastHeight: 0,
    heightReports: 0,
    resizeObserver: null,

    /* =====================================================
       SANDBOX-2 — 이동

       navByAnchor : anchor 요소 -> 부모가 발급한 navId

       ★ 왜 WeakMap 인가 (DOM 속성이 아니라)

       anchor 에 data-* 를 찍으면 프레임의 outerHTML 이 native
       렌더와 달라진다 — SANDBOX-1 이 "두 화면이 글자 단위로
       같다"를 e2e 로 재고 있고, 그 성질은 sandbox 가 native 를
       조용히 바꾸지 않는다는 증거다. 그래서 대응표는 이 realm
       안에만 둔다. 화면에 그려진 주소는 native 와 똑같다.

       navHrefToId : 부모가 보낸 표(payload.data.nav)를 옮긴 것
    ===================================================== */

    navByAnchor: null,
    navHrefToId: null,

    /*
       SANDBOX-2 — POST 본문

       렌더보다 먼저 도착할 수 있으므로(메시지는 비동기다) 같은
       renderSeq 의 것이면 들고 있다가 렌더 직후에 넣는다.
    */

    pendingBody: null
  };


  function root() {

    return document.getElementById("sandboxFrameRoot");

  }


  function notice() {

    return document.getElementById("sandboxFrameNotice");

  }


  /* =========================================================
     resolveParentOrigin()

     "지금 나를 끼운 부모가 허용 목록 안에 있는가".
     referrer가 비어 있을 수 있으므로(부모가 iframe에
     referrerpolicy="no-referrer"를 걸어 둔다) 허용 목록이 정확히
     하나면 그것을 쓴다 — production이 바로 그 경우다.
  ========================================================== */

  function resolveParentOrigin() {

    if (typeof resolveSandboxSkinParentOrigins !== "function") {
      return "";
    }


    const allowList =
      resolveSandboxSkinParentOrigins(window);

    if (!allowList.length) {
      return "";
    }


    if (
      allowList.length === 1 &&
      allowList[0] !== "__imory_dev_hosts__"
    ) {
      return allowList[0];
    }


    /*
      로컬 개발: 부모 포트를 미리 알 수 없다. ancestorOrigins가
      있으면 그것이 가장 정확하다(브라우저가 채워 준다 — 문서가
      조작할 수 없다). 없으면 referrer로 대신한다.
    */

    let candidate =
      "";

    try {

      const ancestors =
        window.location.ancestorOrigins;

      if (ancestors && ancestors.length) {
        candidate = ancestors[0];
      }

    }

    catch (err) {
      candidate = "";
    }


    if (!candidate && document.referrer) {

      try {
        candidate = new URL(document.referrer).origin;
      }
      catch (err) {
        candidate = "";
      }

    }


    if (!candidate) {
      return "";
    }


    if (
      typeof isAllowedSandboxParentOrigin === "function" &&
      isAllowedSandboxParentOrigin(candidate, allowList)
    ) {
      return candidate;
    }


    return "";

  }


  /* =========================================================
     send(type, payload)

     ★ targetOrigin은 상수에서 고른 값. "*"가 아니다.
  ========================================================== */

  function send(type, payload) {

    if (
      !FRAME_STATE.parentOrigin ||
      window.parent === window ||
      typeof buildSandboxMessage !== "function"
    ) {
      return false;
    }


    FRAME_STATE.seq += 1;

    const message =
      buildSandboxMessage(type, payload, FRAME_STATE.seq);

    if (!message) {
      return false;
    }


    window.parent.postMessage(
      message,
      FRAME_STATE.parentOrigin
    );

    return true;

  }


  function sendError(code) {

    send(
      SANDBOX_MESSAGE_TYPES.FRAME_ERROR,
      { contract: 1, code: code }
    );


    const el =
      notice();

    if (el) {
      el.setAttribute("data-visible", "1");
    }

  }


  /* =========================================================
     measureHeight()

     documentElement가 아니라 **렌더 컨테이너**를 잰다. html/body는
     뷰포트(= 지금 iframe 높이)만큼을 늘 차지하므로, 그것을 재면
     "부모가 준 높이"를 되돌려주는 꼴이 되어 줄어들 수가 없다.
  ========================================================== */

  function measureHeight() {

    const el =
      root();

    if (!el) {
      return 0;
    }


    const rect =
      el.getBoundingClientRect();


    return Math.max(
      1,
      Math.ceil(
        Math.max(
          rect.height,
          el.scrollHeight || 0
        )
      )
    );

  }


  function reportHeight(force) {

    const height =
      measureHeight();

    if (!height) {
      return 0;
    }


    if (
      !force &&
      Math.abs(height - FRAME_STATE.lastHeight) <= SANDBOX_HEIGHT_EPSILON
    ) {
      return FRAME_STATE.lastHeight;
    }


    if (FRAME_STATE.heightReports >= SANDBOX_HEIGHT_REPORT_LIMIT) {
      return FRAME_STATE.lastHeight;
    }


    FRAME_STATE.lastHeight = height;
    FRAME_STATE.heightReports += 1;


    send(
      SANDBOX_MESSAGE_TYPES.HEIGHT,
      {
        contract: 1,
        renderSeq: FRAME_STATE.renderSeq,
        height: height
      }
    );


    return height;

  }


  /* =========================================================
     watchHeight()

     렌더 직후 한 번 + ResizeObserver + 프레임 안 이미지의 load.
     웹폰트가 늦게 오는 경우는 document.fonts.ready로 한 번 더 본다
     (지원하지 않는 브라우저에서는 ResizeObserver가 대신 잡는다).
  ========================================================== */

  function watchHeight() {

    const el =
      root();

    if (!el) {
      return;
    }


    if (FRAME_STATE.resizeObserver) {
      FRAME_STATE.resizeObserver.disconnect();
      FRAME_STATE.resizeObserver = null;
    }


    if (typeof ResizeObserver === "function") {

      FRAME_STATE.resizeObserver =
        new ResizeObserver(
          () => {
            reportHeight(false);
          }
        );

      FRAME_STATE.resizeObserver.observe(el);

    }


    /*
      이미지는 늦게 온다. capture 단계로 듣는 이유: load는 버블하지
      않는다. 실패(error)도 같은 이유로 높이를 바꾼다.
    */

    el.addEventListener("load", () => { reportHeight(false); }, true);
    el.addEventListener("error", () => { reportHeight(false); }, true);


    if (document.fonts && document.fonts.ready) {

      document.fonts.ready.then(
        () => { reportHeight(false); },
        () => {}
      );

    }

  }


  /* =========================================================
     renderHome(payload)

     payload는 프로토콜 검사를 이미 통과했다(봉투·방향·알려진 키·
     타입별 값). 여기서 하는 것은 **데이터 재투영**과 렌더다.
  ========================================================== */

  /* =========================================================
     SANDBOX-2 — nav 표를 anchor 에 대응시킨다

     렌더가 끝난 DOM 을 한 번 훑으면서, 부모가 발급한 표에 있는
     주소를 가진 anchor 만 WeakMap 에 담는다. 표에 없는 주소
     (외부 배너 링크 등)는 담기지 않는다 — 눌러도 아무 일이 없다.

     ★ 이 함수는 주소를 **비교만** 한다. 해석하지도, 고치지도
       않는다. "어디로 갈 수 있는가"의 판정은 전부 부모가 이미
       했다(skin/sandbox/skin-sandbox-nav.js).
  ========================================================== */

  function indexNavAnchors(container, nav) {

    FRAME_STATE.navByAnchor =
      new WeakMap();

    FRAME_STATE.navHrefToId =
      new Map();


    if (!nav || !Array.isArray(nav.entries)) {
      return;
    }


    for (let i = 0; i < nav.entries.length; i += 1) {

      const entry =
        nav.entries[i];

      if (
        entry &&
        Number.isInteger(entry.id) &&
        typeof entry.href === "string"
      ) {

        FRAME_STATE.navHrefToId.set(entry.href, entry.id);

      }

    }


    if (!container || !FRAME_STATE.navHrefToId.size) {
      return;
    }


    const anchors =
      container.querySelectorAll("a[href]");

    for (let i = 0; i < anchors.length; i += 1) {

      const anchor =
        anchors[i];

      /*
        ★ 속성 값 그대로(getAttribute) 비교한다. .href 프로퍼티는
        브라우저가 **프레임 origin 기준**으로 절대화한 값이라
        부모가 보낸 문자열과 절대 같을 수 없다.
      */

      const id =
        FRAME_STATE.navHrefToId.get(
          anchor.getAttribute("href")
        );

      if (id) {
        FRAME_STATE.navByAnchor.set(anchor, id);
      }

    }

  }


  /* =========================================================
     SANDBOX-2 — POST 본문 주입

     부모가 공개 뷰어와 같은 파이프라인으로 이미 서식·sanitize를
     끝낸 결과물이다. 여기서 새 sanitize 를 하지 않는다 —
     studio/preview/preview-bridge.js 의 handlePostBodyMessage()와
     같은 책임 분리다.

     이 문서의 CSP 에는 script-src 에 'unsafe-inline' 이 없다.
     그래서 이 HTML 에 인라인 핸들러(onclick=…)나 <script> 가
     섞여 있어도 **실행되지 않는다** — innerHTML 자체가 script 를
     실행하지 않는 데 더해, 헤더로도 한 번 더 막혀 있다.
  ========================================================== */

  /* =========================================================
     postBodyStyleElement() — 본문 서식이 들어가는 <style> 하나

     ★ SANDBOX-3.1. 이 문서의 CSP 에는 style-src 'unsafe-inline' 이
     없다. 그래서 본문의 inline style 은 여기 도착하는 순간 전부
     무시된다 — 그것이 "글자는 나오는데 Quote Preset 서식이 빠지던"
     원인이었다.

     부모가 그 선언들을 검증해서 stylesheet 텍스트 하나로 바꿔
     보내고(posts/style/posts-body-style-extract.js), 이 문서는
     **자기 nonce 를 단 <style>** 에 그 텍스트를 넣는다. CSP 를
     넓히지 않고 같은 화면이 나온다.

     요소는 하나만 만들어 재사용한다 — 렌더마다 새로 만들면
     옛 규칙이 문서에 쌓인다.
  ========================================================== */

  function postBodyStyleElement() {

    if (FRAME_STATE.postBodyStyle) {
      return FRAME_STATE.postBodyStyle;
    }


    const el =
      document.createElement("style");

    el.setAttribute("data-imory-post-body-style", "1");

    const nonce =
      FRAME_STATE.nonce;

    if (nonce) {
      el.setAttribute("nonce", nonce);
      el.nonce = nonce;
    }

    document.head.appendChild(el);

    FRAME_STATE.postBodyStyle = el;

    return el;

  }


  function applyPostBody(body) {

    if (
      !FRAME_STATE.instance ||
      typeof FRAME_STATE.instance.getRegion !== "function"
    ) {
      return false;
    }


    /*
      region 은 렌더할 때마다 새로 만들어진다 — 캐싱 금지
      (skin/skin-post.js 와 같은 원칙).
    */

    const region =
      FRAME_STATE.instance.getRegion("post-body");

    if (!region) {
      return false;
    }


    /*
      컨테이너 선언도 bodyCss 안에 있고, 그 규칙은 이 클래스를
      가리킨다(posts-body-style-extract.js 의
      POST_BODY_STYLE_ROOT_CLASS). 문자열 버전 변환이 감싼 요소를
      다시 벗기므로 이 클래스만은 받는 쪽이 붙인다.
    */

    region.classList.add("imory-pb-root");

    postBodyStyleElement().textContent =
      typeof body.bodyCss === "string" ? body.bodyCss : "";

    region.innerHTML = body.html;


    /* 사진이 들어오면 높이가 달라진다 */

    reportHeight(false);


    return true;

  }


  /* =========================================================
     SANDBOX-5A — 저자 JS

     navigateByHref(href)

     imorySkin.navigate() 가 부르는 유일한 출구다. 링크 클릭
     (onFrameClick)과 **같은 표, 같은 메시지**를 쓴다 — 주소를
     부모에 보내지 않고, 부모가 이번 렌더에 발급한 정수 하나를
     돌려보낼 뿐이다. 표에 없는 주소면 false 이고 아무 일도
     일어나지 않는다.
  ========================================================== */

  function navigateByHref(href) {

    if (
      typeof href !== "string" ||
      !href ||
      !FRAME_STATE.navHrefToId
    ) {
      return false;
    }


    const navId =
      FRAME_STATE.navHrefToId.get(href);

    if (!navId) {
      return false;
    }


    return send(
      SANDBOX_MESSAGE_TYPES.NAVIGATE,
      {
        contract: 1,
        renderSeq: FRAME_STATE.renderSeq,
        navId: navId
      }
    ) === true;

  }


  /* =========================================================
     sendScriptError(code)

     ★ FRAME_ERROR 가 아니다. 저자 JS 의 오류로 화면을 접지
     않는다 — HTML/CSS 는 이미 그려져 있고 그대로 남는다
     (skin/sandbox/skin-sandbox-protocol.js SCRIPT_ERROR 주석).
     오류 문구도 stack 도 보내지 않는다. 부모가 받는 것은 정해진
     짧은 코드 하나뿐이다.
  ========================================================== */

  function sendScriptError(code) {

    send(
      SANDBOX_MESSAGE_TYPES.SCRIPT_ERROR,
      {
        contract: 1,
        renderSeq: FRAME_STATE.renderSeq,
        code: code
      }
    );

  }


  /* =========================================================
     runAuthorJs(code, pageType, context)

     렌더가 끝난 **뒤에** 부른다(renderPage 안에서 마지막 단계).
     그래서 저자 코드는 자기 DOM 이 이미 선 상태에서 시작한다.

     ★ 한 realm 에 한 번. 두 번째 요청은 실행하지 않고
       "script-blocked" 를 올린다 — 임의 JS 의 완전한 청소를
       보장할 수 없으므로 다시 그릴 때는 부모가 프레임 자체를
       새로 만든다(skin/sandbox/skin-sandbox-host.js
       renderSandboxSkinPage 의 needs-new-realm).

     ★ 실패해도 화면은 그대로다. 이 함수는 절대 던지지 않는다.
  ========================================================== */

  function runAuthorJs(code, pageType, context) {

    if (typeof code !== "string" || !code) {
      return;
    }


    if (
      typeof runSandboxAuthorScript !== "function" ||
      typeof buildSandboxAuthorApi !== "function"
    ) {

      /* 런타임 파일이 로드되지 않은 문서 — 실행하지 않는다 */

      sendScriptError("script-blocked");

      return;

    }


    if (FRAME_STATE.authorJsRan) {

      console.warn(
        "[skin-sandbox-frame] author js already ran in this realm"
      );

      sendScriptError("script-blocked");

      return;

    }


    FRAME_STATE.authorJsRan = true;


    let api =
      null;

    try {

      api =
        buildSandboxAuthorApi({
          pageType: pageType,
          root: root(),
          context: context,
          navigate: navigateByHref,
          cleanups: FRAME_STATE.authorCleanups
        });

    }

    catch (err) {

      console.error("[skin-sandbox-frame] author api build failed");

      sendScriptError("script-blocked");

      return;

    }


    const result =
      runSandboxAuthorScript({
        code: code,
        nonce: FRAME_STATE.nonce,
        doc: document,
        api: api,
        onError: function (errorCode) {

          /*
            실행 중에도, 그 뒤 타이머/rAF 안에서도 같은 리스너가
            부른다. 런타임이 첫 번째 한 번만 부르도록 이미
            눌러 준다.
          */

          sendScriptError(errorCode);

          /* 높이가 달라졌을 수 있다 */

          reportHeight(false);

        }
      });


    if (!result.ok && result.code === "script-blocked") {

      sendScriptError("script-blocked");

    }

  }


  function renderPage(payload) {

    /* 늦게 도착한 렌더가 최신 화면을 덮지 않는다 */

    if (payload.renderSeq <= FRAME_STATE.renderSeq) {
      return;
    }


    /*
      진단용 — **실제로 프레임에 도착한** data를 그대로 남긴다.
      이 문서의 realm 안에만 있고 부모는 읽을 수 없다(cross-origin).
      e2e가 여기서 금지 필드(토큰·UUID·본문 원문 …)가 하나도 없음을
      확인한다 — 투영 함수의 결과를 믿는 대신 wire를 직접 본다.
    */

    window.__imorySandboxLastReceived = payload.data;


    const container =
      root();

    if (!container) {
      sendError("no-root");
      return;
    }


    if (typeof renderSkin !== "function") {
      sendError("no-renderer");
      return;
    }


    if (
      typeof isSandboxContextShape !== "function" ||
      typeof projectSkinContextForSandbox !== "function" ||
      !isSandboxContextShape(payload.data)
    ) {
      sendError("bad-payload");
      return;
    }


    const context =
      projectSkinContextForSandbox(payload.data, payload.pageType);

    if (!context) {
      sendError("bad-payload");
      return;
    }


    FRAME_STATE.renderSeq = payload.renderSeq;
    FRAME_STATE.heightReports = 0;
    FRAME_STATE.lastHeight = 0;


    const skin =
      {
        html: payload.template.html,
        css: payload.template.css
      };

    /* 좌우 영역 설정(IMORY_SIDES_DESIGN.md) — 프로토콜이 모양을 이미
       확인했다({ left, right } 참/거짓). 없으면 키를 만들지 않는다. */
    if (payload.template.sides) {
      skin.sides = {
        left: payload.template.sides.left === true,
        right: payload.template.sides.right === true
      };
      /* 모바일에서 끈 쪽(EDITORIAL-DEFAULT-SKIN-2) — 프로토콜이 모양을 확인했다 */
      if (payload.template.sides.mobile) {
        skin.sides.mobile = {
          left: payload.template.sides.mobile.left === true,
          right: payload.template.sides.mobile.right === true
        };
      }
    }

    /* 주인의 스킨 설정(색 · 사진 구성 · D-day, skin/skin-settings.js) —
       프로토콜이 모양을 확인했고, 한 번 더 알려진 칸만 옮긴다. */
    if (payload.template.settings && typeof coerceSkinSettingsRenderSetting === "function") {
      const settings = coerceSkinSettingsRenderSetting(payload.template.settings);
      if (settings) {
        skin.settings = settings;
      }
    }

    /* HOME 캔버스의 실행 데이터(skin/skin-home-canvas.js) — 프로토콜이
       모양을 확인했고, 여기서 한 번 더 알려진 칸만 자기 리터럴로
       옮긴다(sides · settings 와 같은 규칙).

       ★ HOME-CANVAS-RENDER-1B — 이제 renderSkin() 이 이 키를 읽는다.
         이 문서가 /skin/skin-home-canvas-render.js 를 로드하므로
         (frame.html) 프레임 안에서도 공개 화면과 **같은 렌더러**가
         같은 DOM 을 만든다. 1B 이전에는 이 키가 여기까지만 오고
         표시 위치가 빈 채로 남았다. */
    if (payload.template.canvas && typeof coerceSkinHomeCanvasRenderPayload === "function") {
      const canvas = coerceSkinHomeCanvasRenderPayload(payload.template.canvas);
      if (canvas) {
        skin.canvas = canvas;
      }
    }


    try {

      if (FRAME_STATE.instance) {

        FRAME_STATE.instance.update(skin, context);

      }

      else {

        FRAME_STATE.instance =
          renderSkin({
            container: container,
            skin: skin,
            context: context,
            mode: "view",

            /*
              CSP style-src에 'unsafe-inline'이 없다. 렌더러가 만드는
              동적 <style>에 이 문서의 nonce를 달아 준다
              (skin/skin-render.js의 styleNonce 주석).
            */
            styleNonce: FRAME_STATE.nonce
          });

      }

    }

    catch (err) {

      /*
        ★ 원문도 stack도 부모에 보내지 않는다. 정해진 코드 하나뿐이다.
        콘솔에도 SkinPackage 원문이나 사용자 데이터를 찍지 않는다 —
        프레임 콘솔은 부모가 못 읽지만, 기록에는 남는다.
      */

      console.error("[skin-sandbox-frame] render failed");

      sendError("render-failed");

      return;

    }


    /*
      ★ SANDBOX-2 — 이제 링크가 살아난다.

      방금 그린 DOM 을 훑어 "부모가 발급한 표에 있는 주소"를 가진
      anchor 만 골라 둔다. 표에 없으면 눌러도 아무 일이 없다.
    */

    indexNavAnchors(container, context.nav);


    /*
      POST 본문이 렌더보다 먼저 도착했을 수 있다(메시지는
      비동기다). 같은 렌더의 것이면 지금 넣는다.
    */

    if (
      FRAME_STATE.pendingBody &&
      FRAME_STATE.pendingBody.renderSeq === payload.renderSeq
    ) {

      applyPostBody(FRAME_STATE.pendingBody);

      FRAME_STATE.pendingBody = null;

    }


    container.setAttribute("data-imory-sandbox-state", "rendered");

    container.setAttribute("data-imory-sandbox-page", payload.pageType);


    /*
      ★ SANDBOX-5A — 저자 JS 는 여기서, **렌더가 끝난 뒤에** 돈다.

      순서가 코드 모양으로 보인다: renderSkin() -> nav 표 ->
      본문 -> 저자 JS -> 높이 측정 -> RENDERED. 저자 코드가 DOM 을
      바꿔 높이가 달라져도 아래 measureHeight() 가 그 뒤라서
      처음부터 맞은 높이가 부모에 간다.

      template.js 가 없으면(= 지금까지의 모든 스킨, 그리고 저자 JS
      가 꺼진 모든 경우) 이 줄은 아무 일도 하지 않는다 — 부모가
      아예 보내지 않기 때문이다(skin/sandbox/skin-sandbox-host.js
      resolveSandboxAuthorJs).
    */

    runAuthorJs(
      payload.template.js,
      payload.pageType,
      context
    );


    /*
      ★ SANDBOX-6A — 다시 그렸으니 Inspector 가 선택을 되살린다.

      저자 JS **뒤에** 부르는 이유: 저자 코드가 DOM 을 바꿀 수
      있으므로, 그 뒤의 좌표라야 테두리가 맞는 자리에 선다.
      Inspect 가 꺼져 있으면 이 줄은 아무 일도 하지 않는다.
    */

    if (FRAME_STATE.inspector) {
      FRAME_STATE.inspector.onRender();
    }


    /*
      HOME-CANVAS-SELECT-1B-1 — 캔버스 DOM 도 통째로 다시 만들어졌다.
      같은 id 의 새 요소로 target 을 옮기고, 그 요소가 사라졌으면
      (캔버스 제거 · HOME 이탈 · 요소 삭제) 틀을 걷는다.

      ★ 한 번도 만들지 않았으면 여기서 만들지 않는다 — 재렌더가
        vendor 를 받아 오는 계기가 되지 않게.
    */

    if (FRAME_STATE.canvasFrame) {
      FRAME_STATE.canvasFrame.onRender();
    }


    const el =
      notice();

    if (el) {
      el.removeAttribute("data-visible");
    }


    watchHeight();


    const height =
      measureHeight();

    FRAME_STATE.lastHeight = height;


    send(
      SANDBOX_MESSAGE_TYPES.RENDERED,
      {
        contract: 1,
        pageType: payload.pageType,
        renderSeq: payload.renderSeq,
        height: height
      }
    );

  }


  /* =========================================================
     HOME-CANVAS-SELECT-1B-1 — 캔버스 선택 틀

     ★ 언제 처음 받는가

     "부모가 active:true 로 캔버스 선택을 내려보낸 순간"이다. 그
     메시지는 Studio 에서만, 그것도 HOME · 유효한 canvas · Select
     모드 · 고를 수 있는 요소를 전부 지난 뒤에 나간다
     (studio/inspector/studio-canvas-selection.js). 그래서

       공개 sandbox HOME · 아직 아무것도 고르지 않은 Studio ·
       일반 template 요소만 고른 Studio

     에서는 아래 import() 가 한 번도 실행되지 않는다 — runtime 도,
     그것이 부르는 Moveable · Selecto UMD 도 요청 0 이다.

     ★ 실행 코드는 native Preview 와 **같은 파일 한 벌**이다.
       이 함수가 하는 일은 "이 문서의 렌더 루트와 nonce 를 넘겨
       주고, 틀이 붙었는지 Inspector 에 알리는 것"뿐이다.
  ========================================================== */

  function canvasEditorRuntimeUrl() {

    const path =
      "/skin/skin-home-canvas-editor-runtime.js";

    /* 저장소 규칙: 주소에 ?v=APP_BUILD_VERSION(CLAUDE.md §4).
       값은 여기에 적지 않고 build-version.js 의 전역에서 읽는다. */
    return (typeof APP_BUILD_VERSION === "string" && APP_BUILD_VERSION)
      ? `${path}?v=${encodeURIComponent(APP_BUILD_VERSION)}`
      : path;

  }


  function ensureCanvasFrame() {

    if (FRAME_STATE.canvasFrame) {
      return Promise.resolve(FRAME_STATE.canvasFrame);
    }

    if (FRAME_STATE.canvasFramePromise) {
      return FRAME_STATE.canvasFramePromise;
    }

    const loading =
      import(canvasEditorRuntimeUrl()).then(
        (mod) => {

          if (typeof mod.createHomeCanvasSelectionFrame !== "function") {
            throw new Error("createHomeCanvasSelectionFrame 이 없습니다");
          }

          FRAME_STATE.canvasFrame =
            mod.createHomeCanvasSelectionFrame({

              doc: document,

              getRoot: root,

              /* ★ nonce 는 이 realm 안에서만 오간다 — 메시지에도,
                 SkinPackage 에도 실리지 않는다(frame.html 머리말).
                 Moveable 은 이것을 공식 cspNonce 옵션으로 받는다. */
              getNonce: function () {
                return FRAME_STATE.nonce;
              },

              /* 틀이 붙으면 축에 평행한 Inspector 테두리를 내린다 */
              onActiveChange: function (active) {

                if (FRAME_STATE.inspector &&
                    typeof FRAME_STATE.inspector.setCanvasFrameActive === "function") {

                  FRAME_STATE.inspector.setCanvasFrameActive(active);

                }

              },

              /*
                HOME-CANVAS-SELECT-1B-2 — lasso · Shift 클릭의 결과는
                **제안**이다. 확정은 부모가 자기 draft 로 한다.

                ★ 여기서 값을 만들지 않는다. runtime 이 준 것을 알려진
                  칸만 새 리터럴로 옮겨 보낸다 — 프로토콜이 한 번 더
                  거른다(형태 · 중복 · 상한 · mode).
              */
              onPropose: function (proposal) {

                if (!proposal || !Array.isArray(proposal.ids)) {
                  return;
                }

                const payload = {
                  contract: 1,
                  renderSeq: FRAME_STATE.renderSeq,
                  ids: proposal.ids.slice(),
                  mode: proposal.mode === "toggle" ? "toggle" : "replace",
                  generation:
                    Number.isInteger(proposal.generation) && proposal.generation >= 0
                      ? proposal.generation
                      : 0
                };

                if (typeof proposal.primaryId === "string" && proposal.primaryId) {
                  payload.primaryId = proposal.primaryId;
                }

                send(SANDBOX_MESSAGE_TYPES.CANVAS_PROPOSE, payload);

              }

            });

          return FRAME_STATE.canvasFrame;

        }
      );

    FRAME_STATE.canvasFramePromise = loading;

    loading.catch(
      () => {

        /* 다음 선택이 다시 시도할 수 있게 표에서 뺀다 */
        if (FRAME_STATE.canvasFramePromise === loading) {
          FRAME_STATE.canvasFramePromise = null;
        }

      }
    );

    return loading;

  }


  function applyCanvasSelection(payload) {

    FRAME_STATE.canvasSelection = payload;

    /* =====================================================
       HOME-CANVAS-SELECT-1B-2 — 관문이 `editing` 으로 옮겨졌다.

       lasso 는 아무것도 고르지 않은 상태에서 시작돼야 하므로,
       "고른 것이 있는가"가 아니라 "캔버스 편집이 켜졌는가"가
       runtime 을 불러오는 자리다. 부모가 HOME · 유효한 canvas ·
       Select 모드를 전부 보고 정한 값이다.

       꺼진 상태(editing:false)에서 아직 한 번도 만들지 않았으면
       만들지 않는다 — 공개 화면과 Canvas 없는 스킨의 요청 0 이
       여기서 지켜진다.
    ====================================================== */
    if (!FRAME_STATE.canvasFrame && !(payload && payload.editing === true)) {
      return;
    }

    ensureCanvasFrame()
      .then((frame) => frame.apply(FRAME_STATE.canvasSelection))
      .catch(
        (err) => {

          console.warn(
            "[sandbox-frame] 캔버스 선택 틀을 불러오지 못했습니다 — " +
            "기존 테두리로 표시합니다.",
            err && err.message ? err.message : err
          );

        }
      );

  }


  /* =========================================================
     onMessage — 부모가 보낸 것만
  ========================================================== */

  function onMessage(event) {

    if (typeof validateSandboxMessage !== "function") {
      return;
    }


    const verdict =
      validateSandboxMessage(
        event,
        {
          originAllowList:
            FRAME_STATE.parentOrigin ? [FRAME_STATE.parentOrigin] : [],

          /*
            ★ source를 window.parent로 못박는다. 같은 origin의
            다른 window(형제 iframe, 팝업)가 보낸 메시지를 여기서
            떨어뜨린다 — origin만 보면 못 잡는 경우다.
          */
          source: window.parent,

          direction: "to-frame"
        }
      );

    if (!verdict.ok) {

      /*
        조용히 무시한다. 응답도 화면 표시도 하지 않는다.
        (개발 중 진단용으로 카운터만 올린다 — 테스트가 "거부됐다"를
         관찰할 수 있게 하되, 상대에게는 아무것도 돌려주지 않는다.)
      */

      window.__imorySandboxRejected =
        (window.__imorySandboxRejected || 0) + 1;

      window.__imorySandboxLastReason =
        verdict.reason;

      return;

    }


    if (verdict.type === SANDBOX_MESSAGE_TYPES.FRAME_ACK) {

      FRAME_STATE.acked = true;

      const el =
        root();

      if (el) {
        el.setAttribute("data-imory-ack", "1");
      }

      return;

    }


    if (
      verdict.type === SANDBOX_MESSAGE_TYPES.RENDER_HOME ||
      verdict.type === SANDBOX_MESSAGE_TYPES.RENDER_PAGE
    ) {

      renderPage(verdict.payload);

      return;

    }


    if (verdict.type === SANDBOX_MESSAGE_TYPES.POST_BODY) {

      /*
        늦게 도착한 본문이 최신 화면을 덮지 않는다. 아직 그
        렌더가 오지 않았으면(메시지 순서가 뒤집힌 경우) 들고
        있다가 렌더 직후에 넣는다.
      */

      if (verdict.payload.renderSeq < FRAME_STATE.renderSeq) {
        return;
      }


      if (verdict.payload.renderSeq > FRAME_STATE.renderSeq) {

        FRAME_STATE.pendingBody = verdict.payload;

        return;

      }


      if (!applyPostBody(verdict.payload)) {

        sendError("no-body-region");

      }

      return;

    }


    /* =====================================================
       좌우 영역 — 부모가 알려 주는 "보이는 부분"과 바깥 클릭
       (skin/sandbox/skin-sandbox-protocol.js SIDES_*). 옛 화면의
       것은 버린다.
    ====================================================== */

    if (
      verdict.type === SANDBOX_MESSAGE_TYPES.SIDES_VIEWPORT ||
      verdict.type === SANDBOX_MESSAGE_TYPES.SIDES_CLOSE
    ) {

      if (verdict.payload.renderSeq !== FRAME_STATE.renderSeq) {
        return;
      }

      if (verdict.type === SANDBOX_MESSAGE_TYPES.SIDES_VIEWPORT) {
        if (typeof setSkinSidesViewport === "function") {
          setSkinSidesViewport(document, {
            top: verdict.payload.top,
            height: verdict.payload.height
          });
        }
        return;
      }

      if (typeof closeAllSkinSides === "function") {
        closeAllSkinSides(document);
      }

      return;

    }


    /* =====================================================
       SANDBOX-6A — Element Inspector

       ★ 늦게 도착한 지시는 버린다. 부모가 옛 화면에서 보낸
         INSPECT_* 가 새 화면의 선택을 건드리지 않게 한다.
         (프레임이 올려보내는 쪽도 언제나 지금 renderSeq 를
          달고 나간다 — skin-sandbox-inspect.js send())
    ====================================================== */

    /* =====================================================
       HOME-CANVAS-SELECT-1B-1 — 캔버스 선택

       옛 화면의 것은 버린다(위 INSPECT_* 와 같은 규칙). 늦게
       도착한 **같은 화면 안의** 옛 선택은 runtime 이 generation
       으로 한 번 더 거른다.
    ====================================================== */

    if (verdict.type === SANDBOX_MESSAGE_TYPES.CANVAS_SELECT) {

      if (verdict.payload.renderSeq !== FRAME_STATE.renderSeq) {
        return;
      }

      applyCanvasSelection({
        editing: verdict.payload.editing === true,
        active: verdict.payload.active === true,
        ids: verdict.payload.ids,
        primaryId:
          typeof verdict.payload.primaryId === "string"
            ? verdict.payload.primaryId
            : null,
        generation: verdict.payload.generation
      });

      return;

    }


    if (
      verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_MODE ||
      verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_PICK ||
      verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_CHOOSE ||
      verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_PARENT ||
      verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_CAPS ||
      verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_PREVIEW
    ) {

      if (!FRAME_STATE.inspector) {
        return;
      }

      if (verdict.payload.renderSeq !== FRAME_STATE.renderSeq) {
        return;
      }

      if (verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_MODE) {

        FRAME_STATE.inspector.setEnabled(verdict.payload.enabled === true);

        return;

      }

      /* SANDBOX-SELECT-PARITY-1 — 겹친 요소 메뉴의 칸 · 바깥 영역 ·
         Studio 가 정한 가능 여부 · 임시 미리보기
         (skin/sandbox/skin-sandbox-inspect.js) */

      if (verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_CHOOSE) {
        FRAME_STATE.inspector.choose(verdict.payload.index);
        return;
      }

      if (verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_PARENT) {
        FRAME_STATE.inspector.selectParent();
        return;
      }

      if (verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_CAPS) {
        FRAME_STATE.inspector.setCaps(verdict.payload);
        return;
      }

      if (verdict.type === SANDBOX_MESSAGE_TYPES.INSPECT_PREVIEW) {
        FRAME_STATE.inspector.preview(verdict.payload);
        return;
      }

      FRAME_STATE.inspector.pick(
        typeof verdict.payload.editId === "string"
          ? verdict.payload.editId
          : null
      );

      return;

    }

  }


  /* =========================================================
     SANDBOX-2 — 프레임 안 링크 클릭

     ★ 프레임은 스스로 어디로도 가지 않는다.

     어떤 anchor 든 기본 동작을 막는다(preventDefault). 그 위에서,
     부모가 발급한 표에 있는 링크면 **정수 하나**를 부모에 올린다.
     주소는 보내지 않는다 — 부모가 그 정수를 자기 표에서 route 로
     바꾼다(skin/sandbox/skin-sandbox-nav.js).

     그래서 이 함수에는 URL 파싱도, 경로 규칙도, "외부인가" 판정도
     없다. 그것은 전부 부모의 일이다.

     수정키/보조버튼 클릭은 그대로 흘려보낸다 — iframe sandbox 에
     allow-popups 가 없어 어차피 새 탭이 열리지 않고, 프레임이
     대신 이동해 버리면 사용자가 기대한 동작과 달라진다.
  ========================================================== */

  function onFrameClick(event) {

    /*
      ★ SANDBOX-6A — Inspect 중에는 링크가 "선택 대상"일 뿐이다.

      skin-sandbox-inspect.js 의 capture 리스너가 먼저 등록되어
      이미 전파를 끊었지만, 그 한 가지에만 기대지 않는다
      (native 쪽 preview-bridge.js 도 같은 이유로 두 겹이다).
    */

    if (FRAME_STATE.inspector && FRAME_STATE.inspector.isEnabled()) {
      return;
    }


    const anchor =
      event.target && event.target.closest
        ? event.target.closest("a")
        : null;

    if (!anchor) {
      return;
    }


    /*
      ★ 먼저 막는다. 표에 없는 링크도, 표가 아직 없을 때도
      프레임이 자기 주소를 바꾸는 일은 일어나지 않는다.
    */

    event.preventDefault();


    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }


    if (!FRAME_STATE.navByAnchor) {
      return;
    }


    const navId =
      FRAME_STATE.navByAnchor.get(anchor);

    if (!navId) {
      return;
    }


    send(
      SANDBOX_MESSAGE_TYPES.NAVIGATE,
      {
        contract: 1,
        renderSeq: FRAME_STATE.renderSeq,
        navId: navId
      }
    );

  }


  /* =========================================================
     시작
  ========================================================== */

  function start() {

    const el =
      root();

    if (el) {
      el.setAttribute("data-imory-sandbox-state", "ready");
    }


    /* =====================================================
       ★ SANDBOX-5A — nonce 를 이 클로저 안으로 옮기고 window 에서
       지운다.

       ★ 이것은 **정리이지 은닉이 아니다.** 착각하지 말 것.

       nonce 는 "이 script 를 실행해도 된다"는 허가 표식이다.
       임의 JS 가 돈 뒤의 비밀 경계가 아니다 — 이미 실행 중인
       저자 코드는 document.currentScript.nonce 로, 또는 이 realm
       의 다른 요소가 가진 nonce 프로퍼티로 그 값을 **읽을 수
       있다**(브라우저가 가리는 것은 getAttribute("nonce") 뿐이고
       IDL 프로퍼티는 same-origin 에 그대로 보인다).

       그래도 지우는 이유는 노출 면을 줄이는 것 하나다: 우리가
       계약으로 약속한 적 없는 전역 이름을 남겨 두지 않는다.
       저자가 그 값으로 script 를 하나 더 붙여도 얻는 것은 없다 —
       그는 이미 이 realm 에서 임의 코드를 돌리고 있다.

       실제 경계는 별도 origin · CSP · iframe sandbox 속성 ·
       부모가 쥔 이동 표이고, 그중 무엇도 nonce 가 비밀이라는
       가정에 기대지 않는다.

       ★ 계약으로 지키는 것은 하나다: nonce 는 SkinPackage 에도
       부모 메시지 payload 에도 실리지 않는다(프레임 밖으로
       나가지 않는다).

       delete 가 실패해도(프로퍼티가 없거나 막혀 있어도) 던지지
       않는다.
    ====================================================== */

    FRAME_STATE.nonce =
      typeof window.__imorySandboxNonce === "string"
        ? window.__imorySandboxNonce
        : "";

    try {
      delete window.__imorySandboxNonce;
    }
    catch (err) {
      window.__imorySandboxNonce = "";
    }


    /*
      SANDBOX-5A — 프레임이 사라지기 직전에 저자가 등록한 정리
      함수를 부른다. 이 realm 자체가 없어지므로 정리가 없어도
      격리는 성립하지만, 저자가 "언제 멈춰야 하는가"를 표현할 수
      있어야 한다.
    */

    window.addEventListener(
      "pagehide",
      function () {

        if (typeof runSandboxAuthorCleanups === "function") {
          runSandboxAuthorCleanups(FRAME_STATE.authorCleanups);
        }

      }
    );


    FRAME_STATE.parentOrigin =
      resolveParentOrigin();


    /* =====================================================
       ★ SANDBOX-6A — Inspector controller 를 **먼저** 만든다.

       그 안의 capture 리스너가 아래 onFrameClick 보다 먼저
       등록되어야, Inspect 중 링크 클릭이 그 함수에 닿기 전에
       끊긴다(등록 순서가 곧 capture 순서다).

       파일이 로드되지 않은 문서에서는 null 로 남고, INSPECT_*
       메시지가 와도 아무 일이 일어나지 않는다.
    ====================================================== */

    if (typeof createSandboxInspector === "function") {

      FRAME_STATE.inspector =
        createSandboxInspector({
          doc: document,
          getRoot: root,
          getRenderSeq: function () {
            return FRAME_STATE.renderSeq;
          },
          getNonce: function () {
            return FRAME_STATE.nonce;
          },
          send: send,
          TYPES: SANDBOX_MESSAGE_TYPES
        });

    }


    window.addEventListener("message", onMessage);

    document.addEventListener("click", onFrameClick, true);


    /* 좌우 영역 — 패널이 열리고 닫히는 것을 부모에게 알린다. 부모가
       자기 스크롤을 잠그고 "보이는 부분"을 돌려준다
       (skin/skin-sides.js 가 문서에 쏘는 이벤트). */
    document.addEventListener(
      "imory-sides-change",
      function (event) {

        const open =
          !!(event && event.detail && event.detail.open);

        if (!open && typeof setSkinSidesViewport === "function") {
          setSkinSidesViewport(document, null);
        }

        send(
          SANDBOX_MESSAGE_TYPES.SIDES_STATE,
          {
            contract: 1,
            renderSeq: FRAME_STATE.renderSeq,
            open: open
          }
        );

      }
    );


    /*
      진단용 — e2e 가 프레임 realm 안에서 Inspector 상태를 읽는다.
      이 창구로 선택을 바꿀 수는 없다(읽기 전용).
    */

    window.__imorySandboxInspectState =
      function () {

        /* renderSeq 는 비밀이 아니다(작은 정수이고 모든 메시지에
           실려 다닌다) — 위조 검사가 "지금 화면의 번호를 단 위조"를
           만들 수 있게 함께 읽힌다(SANDBOX-SELECT-PARITY-1 e2e). */
        return FRAME_STATE.inspector
          ? Object.assign(
              { renderSeq: FRAME_STATE.renderSeq },
              FRAME_STATE.inspector.debugState()
            )
          : null;

      };


    /*
      HOME-CANVAS-SELECT-1B-1 — 같은 성격의 읽기 전용 창구. 이
      realm 밖(부모)은 cross-origin 이라 읽을 수 없고, e2e 가
      프레임 안에서 "인스턴스가 몇 개인가 · 틀이 회전을 따라가는가"
      를 잰다. 이 창구로 선택을 바꿀 수는 없다.
    */

    window.__imoryCanvasFrameState =
      function () {

        return FRAME_STATE.canvasFrame
          ? FRAME_STATE.canvasFrame.debugState()
          : null;

      };


    if (!FRAME_STATE.sentReady) {

      FRAME_STATE.sentReady =
        send(
          SANDBOX_MESSAGE_TYPES.FRAME_READY,
          { contract: 1 }
        );

    }

  }


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  }

  else {
    start();
  }

}());
