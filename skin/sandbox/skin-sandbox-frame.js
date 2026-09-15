/* =========================================================
   SKIN SANDBOX - FRAME BRIDGE (ES 모듈, frame 문서 안)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §E SANDBOX-1
   단계: SANDBOX-1 — HOME 한 장

   이 파일이 하는 일은 넷뿐이다.
     1. 부모에게 IMORY_FRAME_READY를 한 번 보낸다.
     2. IMORY_FRAME_ACK을 받으면 표시만 남긴다.
     3. IMORY_RENDER_HOME을 받으면 **기존 renderSkin()**으로 그린다.
     4. 그린 높이를 IMORY_RENDERED / IMORY_HEIGHT로 올린다.

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

   ★ 링크는 이번 라운드에서 비활성이다

   네비게이션은 SANDBOX-2다. 지금은 프레임 안의 클릭을
   preventDefault로 삼킨다 — 눌러도 아무 일도 일어나지 않는다.
   프레임이 스스로 주소를 바꾸거나 새 탭을 여는 길은 만들지
   않는다(iframe sandbox 속성에도 allow-top-navigation /
   allow-popups가 없다).
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
    sentReady: false,
    acked: false,
    seq: 0,

    renderSeq: 0,
    instance: null,
    lastHeight: 0,
    heightReports: 0,
    resizeObserver: null
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

  function renderHome(payload) {

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
            styleNonce: window.__imorySandboxNonce || ""
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


    container.setAttribute("data-imory-sandbox-state", "rendered");

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


    if (verdict.type === SANDBOX_MESSAGE_TYPES.RENDER_HOME) {

      renderHome(verdict.payload);

    }

  }


  /* =========================================================
     블록된 네비게이션 (SANDBOX-2까지)
  ========================================================== */

  function swallowClicks(event) {

    const anchor =
      event.target && event.target.closest
        ? event.target.closest("a")
        : null;

    if (!anchor) {
      return;
    }


    event.preventDefault();

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


    FRAME_STATE.parentOrigin =
      resolveParentOrigin();

    window.addEventListener("message", onMessage);

    document.addEventListener("click", swallowClicks, true);


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
