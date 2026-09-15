/* =========================================================
   SKIN SANDBOX - HOST (ES 모듈, 부모 쪽)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §B-1 / §D-3 / §D-4
   단계: SANDBOX-0 — **빈 프레임**만 띄운다. 스킨도 데이터도
   본문도 넘기지 않는다(그건 SANDBOX-1 이후).

   ---------------------------------------------------------
   ★ 왜 독립 모듈인가

   sandbox 분기를 skin-home.js / skin-category.js / skin-post.js에
   각각 흩뿌리면, 나중에 origin 규칙이나 sandbox 속성을 고칠 때
   여섯 군데를 동시에 고쳐야 하고 한 군데만 빠져도 그 페이지만
   격리가 약해진다. 그래서 iframe을 만드는 코드는 이 파일 하나다.
   공개 렌더러는 (SANDBOX-1에서) 이 모듈을 부르기만 한다.

   ★ 이 라운드에서 이 파일은 아무 곳에서도 호출되지 않는다.
   index.html도 skin-home.js도 고치지 않았다 — 기존 렌더링 경로에
   코드가 한 줄도 추가되지 않았다는 뜻이다. 호출자는 SANDBOX-1이
   붙인다. 지금은 skin/skin-sandbox-test.html(수동 하네스)과
   skin/sandbox/skin-sandbox-e2e-test.mjs만 부른다.

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
   functions/_middleware.js가 메인 origin에서 frame.html을 404로
   막는다. 그 두 가지는 정리정돈이 아니라 보안 장치다.

   ---------------------------------------------------------
   ★ 실패는 언제나 조용한 폴백

   mountSandboxSkinFrame()은 throw하지 않는다. 못 하면
   { ok:false, reason } 을 돌려주고 자기가 만든 iframe을 치운다.
   호출자(SANDBOX-1의 skin-home.js)는 그때 오늘과 똑같이
   native/legacy 경로로 간다.
========================================================== */


const SANDBOX_HOST_DEFAULT_TIMEOUT_MS =
  4000;


let sandboxInstanceSeq =
  0;


/* =========================================================
   readGlobal(name)

   config/protocol은 classic script라 전역으로 올라온다. 이 모듈이
   먼저 로드될 수도 있으므로 호출 시점에 읽는다(없으면 조용히 실패).
========================================================== */

function readGlobal(name) {

  return typeof window !== "undefined" ? window[name] : undefined;

}


/* =========================================================
   mountSandboxSkinFrame(options) -> Promise<result>

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
    이중 스크롤 금지(CLAUDE.md §2). 높이는 SANDBOX-1의
    IMORY_HEIGHT가 맞춘다 — 이번 라운드는 진단용 고정 높이다.
  */

  iframe.setAttribute(
    "scrolling",
    "no"
  );

  iframe.style.display = "block";
  iframe.style.width = "100%";
  iframe.style.maxWidth = "100%";
  iframe.style.border = "0";
  iframe.style.height = "120px";


  const state = {
    instanceId: instanceId,
    iframe: iframe,
    frameOrigin: frameOrigin,
    win: win,
    seq: 0,
    ready: false,
    destroyed: false,
    onMessage: null,
    lastReason: ""
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
              payload(알려진 키만).

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

              if (typeof opts.onError === "function") {
                opts.onError(verdict.reason);
              }

              /* 조용히 무시 — 응답하지 않는다 */
              return;

            }


            if (verdict.type !== TYPES.FRAME_READY) {
              return;
            }


            state.ready = true;


            /* READY에 대한 답례는 ACK 하나뿐이다 */

            state.seq += 1;

            const ack =
              build(
                TYPES.FRAME_ACK,
                { contract: 1 },
                state.seq
              );

            if (ack && iframe.contentWindow) {

              /*
                ★ targetOrigin은 **부모가 가진 상수**다.
                "*"도, event.origin을 되받아 쓰는 것도 하지 않는다.
              */

              iframe.contentWindow.postMessage(
                ack,
                frameOrigin
              );

            }


            finish({ ok: true, handle: state });

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
   destroySandboxSkinFrame(handle)

   리스너를 떼고 iframe을 없앤다. 두 번 불러도 안전하다.
========================================================== */

export function destroySandboxSkinFrame(handle) {

  if (!handle || handle.destroyed) {
    return;
  }


  handle.destroyed = true;


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


/* =========================================================
   핸드셰이크 — classic script가 폴링 없이 넘겨받는다

   index.html이 이 모듈보다 먼저
   `window.skinSandboxHostReady = new Promise(...)`를 선언해 두는
   패턴(skin/skin-home.js의 skinHomeReady와 동일). 이 라운드에서는
   index.html을 고치지 않으므로, 선언이 없으면 이 모듈이 직접
   해결된 Promise를 올려 둔다 — 하네스/테스트가 같은 이름으로
   기다릴 수 있게.
========================================================== */

const sandboxHostApi = {
  mountSandboxSkinFrame,
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
