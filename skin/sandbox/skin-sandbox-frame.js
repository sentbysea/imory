/* =========================================================
   SKIN SANDBOX - FRAME BRIDGE (classic script, frame 문서 안)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §E SANDBOX-0
   단계: SANDBOX-0 — **빈 프레임**이다.

   이 파일이 하는 일은 셋뿐이다.
     1. 화면에 "SANDBOX FRAME READY"를 쓴다(진단용).
     2. 부모에게 IMORY_FRAME_READY를 한 번 보낸다.
     3. IMORY_FRAME_ACK을 받으면 data-imory-ack="1"로 표시한다.

   ---------------------------------------------------------
   ★ 이 문서가 로드하지 않는 것 (의도적)

     - supabase-js / core/lib/supabase-client.js
     - 인증 코드(auth/*)
     - 관리자 코드(admin/*, studio/*)
     - skin/skin-context.js (skin-context builder)
     - skin/skin-render.js  (SANDBOX-1에서 들어온다)

   frame은 렌더러이지 데이터 클라이언트가 아니다. 조회·권한 판정·
   Context 조립은 전부 부모가 오늘처럼 한다(CLAUDE.md §2).
   CSP의 connect-src 'none'이 이 원칙을 헤더로도 못박는다.

   ★ classic script인 이유

   SANDBOX-0의 frame은 ES 모듈이 필요 없다. 모듈을 쓰면 정적
   import에 ?v=가 붙지 않아 import map(인라인 <script
   type="importmap">)이 필요해지고, 그러면 CSP script-src에
   인라인 허용이 하나 더 필요해진다. 빈 프레임을 띄우자고 CSP를
   넓힐 이유가 없다. SANDBOX-1이 renderSkin()을 들여올 때
   import map과 그 nonce를 함께 다룬다(그 TODO는
   functions/_middleware.js의 CSP 주석에 적어 두었다).

   ★ 부모를 어떻게 믿는가

   resolveSandboxSkinParentOrigins()는 **이 문서 자신의 상수**다.
   부모가 메시지로 알려 준 origin을 쓰지 않는다 — 그러면 공격자가
   값을 심을 수 있는 경로가 생긴다. 보내는 쪽 targetOrigin도 이
   상수에서 고른 값이지 "*"가 아니다.

   허용 origin이 여러 개인 경우(로컬 개발) READY를 보낼 대상은
   **하나**여야 하므로, 실제로 우리를 끼운 부모의 origin을
   document.referrer에서 읽어 허용 목록과 대조한 뒤 그 값을 쓴다.
   대조에 실패하면 아무것도 보내지 않는다(그리고 CSP의
   frame-ancestors가 애초에 그런 부모를 막는다).
========================================================== */


(function () {

  "use strict";


  const FRAME_STATE = {
    parentOrigin: "",
    sentReady: false,
    acked: false,
    seq: 0
  };


  /* =========================================================
     화면 — 진단 문구 하나. 상용 디자인은 하지 않는다.
  ========================================================== */

  function paintDiagnostic() {

    const root =
      document.getElementById("sandboxFrameRoot");

    if (!root) {
      return null;
    }


    root.textContent =
      "SANDBOX FRAME READY";

    root.setAttribute(
      "data-imory-sandbox-state",
      "ready"
    );

    return root;

  }


  /* =========================================================
     resolveParentOrigin()

     "지금 나를 끼운 부모가 허용 목록 안에 있는가".
     referrer가 비어 있을 수 있으므로(referrerpolicy="no-referrer"를
     부모가 iframe에 걸어 두었다) 허용 목록이 정확히 하나면 그것을
     쓴다 — production이 바로 그 경우다(https://imory.me 하나).
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


    /*
      목록이 구체적인 origin 하나뿐이면 그것이 답이다.
      (referrerpolicy="no-referrer" 때문에 referrer를 못 믿는다.)
    */

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
     sendReady()
  ========================================================== */

  function sendReady() {

    if (
      FRAME_STATE.sentReady ||
      !FRAME_STATE.parentOrigin ||
      window.parent === window
    ) {
      return;
    }


    if (typeof buildSandboxMessage !== "function") {
      return;
    }


    FRAME_STATE.seq += 1;

    const message =
      buildSandboxMessage(
        SANDBOX_MESSAGE_TYPES.FRAME_READY,
        { contract: 1 },
        FRAME_STATE.seq
      );

    if (!message) {
      return;
    }


    /* ★ targetOrigin은 상수에서 고른 값. "*"가 아니다. */

    window.parent.postMessage(
      message,
      FRAME_STATE.parentOrigin
    );

    FRAME_STATE.sentReady = true;

  }


  /* =========================================================
     onMessage — 부모가 보낸 것만, 그것도 ACK만
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
        (진단이 필요한 개발 중에는 아래 카운터만 올린다 —
         테스트가 "거부됐다"를 관찰할 수 있게 하되, 상대에게는
         아무것도 돌려주지 않는다.)
      */

      window.__imorySandboxRejected =
        (window.__imorySandboxRejected || 0) + 1;

      window.__imorySandboxLastReason =
        verdict.reason;

      return;

    }


    if (verdict.type !== SANDBOX_MESSAGE_TYPES.FRAME_ACK) {
      return;
    }


    FRAME_STATE.acked = true;

    const root =
      document.getElementById("sandboxFrameRoot");

    if (root) {

      /*
        화면 문구는 그대로 "SANDBOX FRAME READY" 하나다.
        왕복 성립 여부는 텍스트가 아니라 속성으로 남긴다.
      */

      root.setAttribute(
        "data-imory-ack",
        "1"
      );

    }

  }


  /* =========================================================
     시작
  ========================================================== */

  function start() {

    paintDiagnostic();

    FRAME_STATE.parentOrigin =
      resolveParentOrigin();

    window.addEventListener(
      "message",
      onMessage
    );

    sendReady();

  }


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  }

  else {
    start();
  }

}());
