/* =========================================================
   SKIN SANDBOX - HOST (ES 모듈, 부모 쪽)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §B-1 / §D-3 / §D-4
   단계: SANDBOX-1 — 공개 HOME 한 장을 별도 origin iframe에서 그린다.

   ---------------------------------------------------------
   ★ 왜 독립 모듈인가

   sandbox 분기를 skin-home.js / skin-category.js / skin-post.js에
   각각 흩뿌리면, 나중에 origin 규칙이나 sandbox 속성을 고칠 때
   여섯 군데를 동시에 고쳐야 하고 한 군데만 빠져도 그 페이지만
   격리가 약해진다. 그래서 iframe을 만드는 코드는 이 파일 하나다.

   ★ 공개 진입점은 mountSandboxSkin() 하나다

     mountSandboxSkin({ container, pageType, template, context })
       -> { ok:true, handle } | { ok:false, reason }

   그 안에서:
     1. projectSkinContextForSandbox()로 **보낼 것만** 고른다
        (skin/sandbox/skin-sandbox-context.js — 데이터 신뢰 경계)
     2. mountSandboxSkinFrame()으로 빈 프레임을 띄우고
        IMORY_FRAME_READY -> IMORY_FRAME_ACK 왕복을 기다린다
     3. IMORY_RENDER_HOME을 보내고 IMORY_RENDERED를 기다린다
     4. 그 뒤로 오는 IMORY_HEIGHT로 iframe 높이를 맞춘다

   ★ Context 원본은 이 파일을 지나가지 않는다

   mountSandboxSkin()은 context를 받자마자 투영 함수에 넘기고,
   그 **결과만** 들고 다닌다. 원본 객체는 postMessage에 닿지
   않는다(설계 문서 §D-1).

   ---------------------------------------------------------
   ★ iframe sandbox 속성: allow-scripts allow-same-origin

   이 두 개만 준다. allow-top-navigation / allow-popups /
   allow-forms / allow-modals / allow-pointer-lock /
   allow-downloads 는 주지 않는다.

   allow-same-origin을 주는 이유:

     sandbox 속성에 allow-same-origin이 없으면 그 문서는
     **opaque origin**이 된다. 그러면
       ① 그 문서가 보내는 message의 event.origin이 "null"이 되고,
          부모는 postMessage(msg, "null")을 쓸 수 없어 결국
          targetOrigin="*"로 떨어진다 — 이번 라운드의 요구사항
          ("* 금지")과 정면으로 충돌한다.
       ② CSP의 'self'가 아무것도 가리키지 못한다.
       ③ 나중에 스킨이 자기 저장소를 쓰는 길이 완전히 막힌다.

   allow-scripts + allow-same-origin이 위험한 조합으로 불리는 것은
   **부모와 같은 origin의 문서**에 줄 때다. 그때는 iframe이
   parent.document로 나가 자기 sandbox 속성을 지우고 리로드해서
   샌드박스를 벗을 수 있다. 여기서는 frame 문서의 origin이
   부모와 **실제로 다르다** — allow-same-origin은 "부모와 같아진다"가
   아니라 "이 문서가 자기 자신의 origin을 유지한다"는 뜻이고,
   parent.document 접근은 브라우저가 그대로 막는다.

   ★ 그래서 이 설계의 안전성은 전적으로 "origin이 정말 다르다"에
   달려 있다. resolveSandboxSkinFrameOrigin()이 부모와 같은 origin을
   돌려주면 아예 iframe을 만들지 않고(§skin-sandbox-config.js),
   functions/_middleware.js가 메인 origin에서 frame 문서를 404로
   막는다. 그 두 가지는 정리정돈이 아니라 보안 장치다.

   ---------------------------------------------------------
   ★ 실패는 언제나 조용한 폴백

   mountSandboxSkin()/mountSandboxSkinFrame()은 throw하지 않는다.
   못 하면 { ok:false, reason }을 돌려주고 자기가 만든 iframe을
   치운다. 호출자(skin/skin-home.js)는 그때 **같은 SkinPackage를
   native로** 그린다 — 다시 시도하지 않는다.
========================================================== */


const SANDBOX_HOST_DEFAULT_TIMEOUT_MS =
  4000;


/*
  RENDERED를 기다리는 시간. READY 왕복과 따로 센다 — 프레임이
  살아 있는데 렌더만 늦는 경우와, 프레임 자체가 안 뜨는 경우를
  구분해서 진단할 수 있어야 한다.
*/

const SANDBOX_HOST_RENDER_TIMEOUT_MS =
  6000;


/*
  부모가 실제로 iframe에 적용할 높이의 상한. 프로토콜은 200000까지
  받지만(skin/sandbox/skin-sandbox-protocol.js), 적용은 더 좁게 한다 —
  한 화면이 그보다 길 이유가 없고, 브라우저가 감당 못 할 크기로
  자라는 것을 여기서 한 번 더 막는다.
*/

const SANDBOX_HOST_MIN_APPLIED_HEIGHT = 1;

const SANDBOX_HOST_MAX_APPLIED_HEIGHT = 40000;


/*
  높이 적용 횟수 상한(렌더 하나당). 프레임 쪽에도 보고 상한이
  있지만, 부모도 자기 몫의 방어선을 갖는다 — 무한 높이 메시지
  루프가 어느 한쪽 버그로 생겨도 화면이 멈추지 않게.
*/

const SANDBOX_HOST_MAX_HEIGHT_APPLIES = 200;


let sandboxInstanceSeq =
  0;


/* =========================================================
   readGlobal(name)

   config/protocol/context는 classic script라 전역으로 올라온다.
   이 모듈이 먼저 로드될 수도 있으므로 호출 시점에 읽는다
   (없으면 조용히 실패).
========================================================== */

function readGlobal(name) {

  return typeof window !== "undefined" ? window[name] : undefined;

}


/* =========================================================
   mountSandboxSkinFrame(options) -> Promise<result>

   **빈 프레임만** 띄운다. 스킨도 데이터도 넘기지 않는다 —
   그건 아래 mountSandboxSkin()의 몫이다. SANDBOX-0의 수동
   하네스(skin/skin-sandbox-test.html)가 이 함수를 그대로 쓴다.

   options = {
     container   : HTMLElement    // iframe을 넣을 자리
     timeoutMs   : number         // READY를 기다리는 시간
     onError     : (reason) => void   // 선택, 진단용
   }

   result = { ok:true,  handle }
          | { ok:false, reason }

   reason: "no-container" "disabled" "no-origin" "same-origin"
           "timeout" "create-failed"
========================================================== */

export async function mountSandboxSkinFrame(options) {

  const opts =
    options || {};

  const container =
    opts.container;


  if (!container || !container.ownerDocument) {
    return { ok: false, reason: "no-container" };
  }


  const doc =
    container.ownerDocument;

  const win =
    doc.defaultView;


  /* --- 기능 플래그 -------------------------------------- */

  const isEnabled =
    readGlobal("isSandboxSkinEnabled");

  if (typeof isEnabled !== "function" || isEnabled(win) !== true) {
    return { ok: false, reason: "disabled" };
  }


  /* --- frame origin ------------------------------------- */

  const resolveOrigin =
    readGlobal("resolveSandboxSkinFrameOrigin");

  const buildUrl =
    readGlobal("buildSandboxSkinFrameUrl");

  if (
    typeof resolveOrigin !== "function" ||
    typeof buildUrl !== "function"
  ) {
    return { ok: false, reason: "no-origin" };
  }


  const frameOrigin =
    resolveOrigin(win);

  if (!frameOrigin) {
    return { ok: false, reason: "no-origin" };
  }


  /*
    마지막 방어선. config가 이미 걸러내지만, 여기서 한 번 더 본다 —
    같은 origin에 allow-scripts allow-same-origin을 주는 일이
    어떤 경로로도 일어나지 않게.
  */

  if (win && frameOrigin === win.location.origin) {
    return { ok: false, reason: "same-origin" };
  }


  const frameUrl =
    buildUrl(frameOrigin);

  if (!frameUrl) {
    return { ok: false, reason: "no-origin" };
  }


  /* --- 프로토콜 ----------------------------------------- */

  const validate =
    readGlobal("validateSandboxMessage");

  const build =
    readGlobal("buildSandboxMessage");

  const TYPES =
    readGlobal("SANDBOX_MESSAGE_TYPES");

  if (
    typeof validate !== "function" ||
    typeof build !== "function" ||
    !TYPES
  ) {
    return { ok: false, reason: "create-failed" };
  }


  /* --- iframe ------------------------------------------- */

  sandboxInstanceSeq += 1;

  const instanceId =
    sandboxInstanceSeq;


  const iframe =
    doc.createElement("iframe");

  iframe.className =
    "imory-skin-sandbox-frame";

  iframe.setAttribute(
    "data-imory-sandbox-frame",
    String(instanceId)
  );

  /*
    최소 권한. 위 상단 주석 참고 — allow-top-navigation /
    allow-popups / allow-forms / allow-modals 는 주지 않는다.
  */

  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin"
  );

  iframe.setAttribute(
    "referrerpolicy",
    "no-referrer"
  );

  iframe.setAttribute(
    "loading",
    "eager"
  );

  iframe.setAttribute(
    "title",
    "스킨"
  );

  /*
    이중 스크롤 금지(CLAUDE.md §2). 프레임 문서도 자기 쪽에서
    overflow:hidden이고, 높이는 IMORY_HEIGHT가 맞춘다.
  */

  iframe.setAttribute(
    "scrolling",
    "no"
  );

  iframe.style.display = "block";
  iframe.style.width = "100%";
  iframe.style.maxWidth = "100%";
  iframe.style.border = "0";

  /*
    렌더 전 임시 높이. RENDERED가 오면 실제 높이로 바뀐다.
    0으로 두지 않는 이유: 프레임 안 스킨이 뷰포트 폭에 반응하는
    CSS를 쓸 때 높이 0인 뷰포트에서 첫 레이아웃을 잡으면 값이
    어긋난다.
  */
  iframe.style.height = "120px";

  /*
    프레임 문서가 투명하므로 부모 배경이 그대로 비친다
    (skin/sandbox/frame.html의 background: transparent).
  */
  iframe.style.background = "transparent";
  iframe.style.colorScheme = "normal";


  const state = {
    instanceId: instanceId,
    iframe: iframe,
    frameOrigin: frameOrigin,
    win: win,
    doc: doc,
    build: build,
    TYPES: TYPES,
    seq: 0,
    ready: false,
    destroyed: false,
    onMessage: null,
    lastReason: "",

    /* mountSandboxSkin()이 채운다 */
    renderSeq: 0,
    rendered: false,
    appliedHeight: 0,
    heightApplies: 0,
    onError: typeof opts.onError === "function" ? opts.onError : null,
    handlers: {}
  };


  const result =
    await new Promise(
      (resolve) => {

        let settled =
          false;

        const finish =
          (value) => {

            if (settled) {
              return;
            }

            settled = true;

            win.clearTimeout(timer);

            resolve(value);

          };


        const timer =
          win.setTimeout(
            () => {

              state.lastReason = "timeout";

              destroySandboxSkinFrame(state);

              finish({ ok: false, reason: "timeout" });

            },
            Number.isFinite(opts.timeoutMs)
              ? opts.timeoutMs
              : SANDBOX_HOST_DEFAULT_TIMEOUT_MS
          );


        state.onMessage =
          (event) => {

            if (state.destroyed) {
              return;
            }


            /*
              ★ 검증은 protocol 파일 한 곳에서만 한다.
              origin -> source -> 봉투 -> type -> 방향 -> seq ->
              payload(알려진 키만) -> 타입별 값.

              source를 iframe.contentWindow로 못박는 것이 핵심이다 —
              같은 sandbox origin의 **다른** window가 보낸 메시지를
              여기서 떨어뜨린다.
            */

            const verdict =
              validate(
                event,
                {
                  originAllowList: [frameOrigin],
                  source: iframe.contentWindow,
                  direction: "to-parent"
                }
              );

            if (!verdict.ok) {

              state.lastReason = verdict.reason;

              if (state.onError) {
                state.onError(verdict.reason);
              }

              /* 조용히 무시 — 응답하지 않는다 */
              return;

            }


            if (verdict.type === TYPES.FRAME_READY) {

              if (state.ready) {

                /*
                  중복 READY. 프레임이 다시 로드됐거나(뒤로가기
                  복원 등) 누가 흉내낸 것이다 — ACK도 렌더도 다시
                  보내지 않는다.
                */

                state.lastReason = "duplicate-ready";
                return;

              }


              state.ready = true;


              /* READY에 대한 답례는 ACK 하나뿐이다 */

              sendToSandboxFrame(
                state,
                TYPES.FRAME_ACK,
                { contract: 1 }
              );


              finish({ ok: true, handle: state });

              return;

            }


            /* 나머지는 mountSandboxSkin()이 꽂아 둔 핸들러로 */

            const handler =
              state.handlers[verdict.type];

            if (typeof handler === "function") {
              handler(verdict.payload);
            }

          };


        win.addEventListener(
          "message",
          state.onMessage
        );


        try {

          iframe.src = frameUrl;

          container.appendChild(iframe);

        }

        catch (err) {

          state.lastReason = "create-failed";

          destroySandboxSkinFrame(state);

          finish({ ok: false, reason: "create-failed" });

        }

      }
    );


  return result;

}


/* =========================================================
   sendToSandboxFrame(handle, type, payload)

   ★ targetOrigin은 **부모가 가진 상수**다. "*"도, event.origin을
   되받아 쓰는 것도 하지 않는다.
========================================================== */

function sendToSandboxFrame(handle, type, payload) {

  if (
    !handle ||
    handle.destroyed ||
    !handle.iframe ||
    !handle.iframe.contentWindow
  ) {
    return false;
  }


  handle.seq += 1;

  const message =
    handle.build(type, payload, handle.seq);

  if (!message) {
    return false;
  }


  handle.iframe.contentWindow.postMessage(
    message,
    handle.frameOrigin
  );


  return true;

}


/* =========================================================
   applySandboxFrameHeight(handle, height)

   프로토콜이 이미 정수·범위를 봤다. 여기서는 **부모 쪽 상한**과
   진동/루프 방지를 본다.
========================================================== */

function applySandboxFrameHeight(handle, height) {

  if (!handle || handle.destroyed || !handle.iframe) {
    return false;
  }


  if (
    !Number.isInteger(height) ||
    height < SANDBOX_HOST_MIN_APPLIED_HEIGHT ||
    height > SANDBOX_HOST_MAX_APPLIED_HEIGHT
  ) {
    return false;
  }


  if (Math.abs(height - handle.appliedHeight) <= 1) {
    return false;
  }


  if (handle.heightApplies >= SANDBOX_HOST_MAX_HEIGHT_APPLIES) {
    return false;
  }


  handle.appliedHeight = height;
  handle.heightApplies += 1;

  handle.iframe.style.height = height + "px";


  return true;

}


/* =========================================================
   mountSandboxSkin(options) -> Promise<result>

   options = {
     container : HTMLElement
     pageType  : "home"            // 이번 라운드는 HOME 한 장뿐
     template  : { html, css }     // resolveSkinTemplate()의 결과
     context   : object            // build*SkinContext()의 결과(원본)
     timeoutMs / renderTimeoutMs / onError : 선택
   }

   result = { ok:true, handle } | { ok:false, reason }

   reason: mountSandboxSkinFrame의 값들 +
           "bad-page-type" "bad-template" "no-projector"
           "bad-context" "send-failed" "render-timeout" "frame-error"
========================================================== */

export async function mountSandboxSkin(options) {

  const opts =
    options || {};

  const pageType =
    opts.pageType;


  /*
    ★ HOME 한 장이 이번 라운드의 전부다. 다른 page type으로
    불리면 여기서 끝낸다 — 호출자는 native로 간다.
  */

  const PAGE_TYPES =
    readGlobal("SANDBOX_CONTEXT_PAGE_TYPES");

  if (
    !Array.isArray(PAGE_TYPES) ||
    PAGE_TYPES.indexOf(pageType) === -1
  ) {
    return { ok: false, reason: "bad-page-type" };
  }


  const template =
    opts.template;

  if (
    !template ||
    typeof template.html !== "string"
  ) {
    return { ok: false, reason: "bad-template" };
  }


  /* --- 데이터 신뢰 경계 --------------------------------- */

  const project =
    readGlobal("projectSkinContextForSandbox");

  if (typeof project !== "function") {
    return { ok: false, reason: "no-projector" };
  }


  /*
    ★ 원본 context는 여기서 끝난다. 아래로는 투영 결과만 간다.
  */

  const data =
    project(opts.context, pageType);

  if (!data) {
    return { ok: false, reason: "bad-context" };
  }


  /* --- 빈 프레임 --------------------------------------- */

  const mounted =
    await mountSandboxSkinFrame({
      container: opts.container,
      timeoutMs: opts.timeoutMs,
      onError: opts.onError
    });

  if (!mounted.ok) {
    return mounted;
  }


  const handle =
    mounted.handle;

  const TYPES =
    handle.TYPES;


  /* --- 렌더 ------------------------------------------- */

  handle.renderSeq += 1;

  const renderSeq =
    handle.renderSeq;


  const rendered =
    await new Promise(
      (resolve) => {

        let settled =
          false;

        const finish =
          (value) => {

            if (settled) {
              return;
            }

            settled = true;

            handle.win.clearTimeout(timer);

            resolve(value);

          };


        const timer =
          handle.win.setTimeout(
            () => {

              handle.lastReason = "render-timeout";

              finish({ ok: false, reason: "render-timeout" });

            },
            Number.isFinite(opts.renderTimeoutMs)
              ? opts.renderTimeoutMs
              : SANDBOX_HOST_RENDER_TIMEOUT_MS
          );


        handle.handlers[TYPES.RENDERED] =
          (payload) => {

            /* 늦게 도착한 응답이 최신 화면을 덮지 않는다 */

            if (payload.renderSeq !== handle.renderSeq) {
              return;
            }

            handle.rendered = true;

            applySandboxFrameHeight(handle, payload.height);

            finish({ ok: true });

          };


        handle.handlers[TYPES.HEIGHT] =
          (payload) => {

            if (payload.renderSeq !== handle.renderSeq) {
              return;
            }

            applySandboxFrameHeight(handle, payload.height);

          };


        handle.handlers[TYPES.FRAME_ERROR] =
          (payload) => {

            handle.lastReason = payload.code;

            if (handle.onError) {
              handle.onError(payload.code);
            }

            finish({ ok: false, reason: "frame-error" });

          };


        const sent =
          sendToSandboxFrame(
            handle,
            TYPES.RENDER_HOME,
            {
              contract: 1,
              pageType: pageType,
              renderSeq: renderSeq,
              template: {
                html: template.html,
                css: typeof template.css === "string" ? template.css : ""
              },
              data: data
            }
          );

        if (!sent) {
          finish({ ok: false, reason: "send-failed" });
        }

      }
    );


  if (!rendered.ok) {

    destroySandboxSkinFrame(handle);

    return { ok: false, reason: rendered.reason };

  }


  return { ok: true, handle };

}


/* =========================================================
   destroySandboxSkinFrame(handle)

   리스너를 떼고 iframe을 없앤다. 두 번 불러도 안전하다.
========================================================== */

export function destroySandboxSkinFrame(handle) {

  if (!handle || handle.destroyed) {
    return;
  }


  handle.destroyed = true;

  handle.handlers = {};


  if (handle.win && handle.onMessage) {

    handle.win.removeEventListener(
      "message",
      handle.onMessage
    );

    handle.onMessage = null;

  }


  if (handle.iframe && handle.iframe.parentNode) {

    handle.iframe.parentNode.removeChild(
      handle.iframe
    );

  }

}


/* 이름 하나로 통일 — 호출자는 "스킨을 내린다"만 알면 된다 */

export const destroySandboxSkin =
  destroySandboxSkinFrame;


/* =========================================================
   핸드셰이크 — classic script가 폴링 없이 넘겨받는다

   index.html이 이 모듈보다 먼저
   `window.skinSandboxHostReady = new Promise(...)`를 선언해 두는
   패턴(skin/skin-home.js의 skinHomeReady와 동일). 선언이 없는
   문서(수동 하네스 등)에서는 이 모듈이 직접 해결된 Promise를
   올려 둔다 — 같은 이름으로 기다릴 수 있게.
========================================================== */

const sandboxHostApi = {
  mountSandboxSkin,
  mountSandboxSkinFrame,
  destroySandboxSkin,
  destroySandboxSkinFrame
};


if (typeof window !== "undefined") {

  window.skinSandboxHost =
    sandboxHostApi;

  if (typeof window.__resolveSkinSandboxHostReady === "function") {
    window.__resolveSkinSandboxHostReady(sandboxHostApi);
  }

  else if (!window.skinSandboxHostReady) {
    window.skinSandboxHostReady = Promise.resolve(sandboxHostApi);
  }

}
