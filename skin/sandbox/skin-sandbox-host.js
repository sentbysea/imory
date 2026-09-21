/* =========================================================
   SKIN SANDBOX - HOST (ES 모듈, 부모 쪽)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §B-1 / §D-3 / §D-4 / §L
   단계: SANDBOX-2 — 공개 HOME/CATEGORY/POST 를 별도 origin iframe에서
         그리고, 프레임 안 링크가 기존 SPA 라우터로 이어진다.
         SANDBOX-4 — Skin Studio Preview 도 **이 파일을 그대로** 쓴다.
         Preview 전용 복제본은 없다(§L-3).

   ---------------------------------------------------------
   ★ 왜 독립 모듈인가

   sandbox 분기를 skin-home.js / skin-category.js / skin-post.js에
   각각 흩뿌리면, 나중에 origin 규칙이나 sandbox 속성을 고칠 때
   여섯 군데를 동시에 고쳐야 하고 한 군데만 빠져도 그 페이지만
   격리가 약해진다. 그래서 iframe을 만드는 코드는 이 파일 하나다.

   ★ 공개 진입점은 mountSandboxSkin() 하나다

     mountSandboxSkin({ container, pageType, template, context })
       -> { ok:true, handle } | { ok:false, reason }

   그리고 SANDBOX-4 에서 하나 더 — **이미 떠 있는 프레임에 다음 한 장**:

     renderSandboxSkinPage(handle, { pageType, template, context })
       -> { ok:true } | { ok:false, reason }

   Studio Preview 는 글자 하나 고칠 때마다 다시 그려야 하는데, 그때마다
   cross-origin iframe 을 새로 만들면 문서 로드와 READY 왕복을 처음부터
   다시 하게 된다(그 사이 화면이 빈다). 공개 화면은 화면을 옮길 때
   컨테이너가 통째로 비워지므로 지금까지처럼 mount 를 쓴다.

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

     frameOrigin : string         // 선택(SANDBOX-4). 주면 플래그/origin
                                  // 판정을 호출자가 이미 했다는 뜻이다.
                                  // http(s) 가 아니거나 부모와 같은
                                  // origin 이면 **여전히 거부**한다.
                                  // 공개 화면은 주지 않는다.
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


  /* =====================================================
     ★ SANDBOX-4 — opts.frameOrigin (호출자가 이미 판정한 경우)

     공개 화면은 이 값을 **주지 않는다**. 그때는 아래 두 관문이
     지금까지처럼 그대로 돈다 — 공개 경로는 한 줄도 달라지지
     않는다.

     Skin Studio Preview 만 준다. Preview 문서의 주소는
     /studio/preview/preview-frame.html 이라 isSandboxSkinEnabled()
     의 production 분기(주소 첫 칸 = blog slug)가 성립하지 않는다.
     그래서 부모가 같은 config 파일의
     isSandboxSkinPreviewEnabled(win, slug) 로 먼저 판정하고,
     그 결과로 얻은 frame origin 을 여기에 넘긴다.

     넘겨받아도 **낮출 수 없는 것**이 둘 있다:
       · http/https 가 아닌 값은 거부한다.
       · 부모와 같은 origin 이면 거부한다(아래 same-origin 관문).
     격리가 사라지는 방향으로는 이 문이 열리지 않는다.
  ====================================================== */

  const givenOrigin =
    typeof opts.frameOrigin === "string" ? opts.frameOrigin.trim() : "";

  let frameOrigin =
    "";

  const buildUrl =
    readGlobal("buildSandboxSkinFrameUrl");

  if (typeof buildUrl !== "function") {
    return { ok: false, reason: "no-origin" };
  }


  if (givenOrigin) {

    let parsedGiven =
      null;

    try {
      parsedGiven = new URL(givenOrigin);
    }
    catch (err) {
      parsedGiven = null;
    }

    if (
      !parsedGiven ||
      (parsedGiven.protocol !== "http:" && parsedGiven.protocol !== "https:") ||
      parsedGiven.origin !== givenOrigin
    ) {
      return { ok: false, reason: "no-origin" };
    }

    frameOrigin = parsedGiven.origin;

  }

  else {

    /* --- 기능 플래그 ------------------------------------ */

    const isEnabled =
      readGlobal("isSandboxSkinEnabled");

    if (typeof isEnabled !== "function" || isEnabled(win) !== true) {
      return { ok: false, reason: "disabled" };
    }


    /* --- frame origin ----------------------------------- */

    const resolveOrigin =
      readGlobal("resolveSandboxSkinFrameOrigin");

    if (typeof resolveOrigin !== "function") {
      return { ok: false, reason: "no-origin" };
    }


    frameOrigin =
      resolveOrigin(win);

  }


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

    /* SANDBOX-5A — 저자 JS */
    authorJsSent: false,
    lastScriptError: "",
    onScriptError: null,

    /* SANDBOX-6A — Element Inspector(Select) */
    onInspect: null,
    inspectEnabled: false,

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
   좌우 영역의 모바일 패널 (IMORY_SIDES_DESIGN.md §7)

   프레임은 콘텐츠 높이만큼 늘어나 있어서 프레임 안의 fixed 패널은
   "화면"이 아니라 프레임 전체에 붙는다. 스크롤은 부모가 하므로
   부모가 두 가지를 한다.

     1) 패널이 열린 동안 **부모의** 스크롤을 잠근다 — native 와
        같은 함수(skin/skin-sides.js lockSkinSidesScroll)다.
     2) 프레임 좌표로 "지금 보이는 부분"을 내려보낸다. 창 크기가
        바뀌면 다시.

   프레임 바깥(부모)을 누르면 닫으라고 알린다. 프레임이 내려가면
   (화면 전환 · 다시 그리기 실패) 잠금은 여기서 반드시 풀린다.
========================================================== */

function readSandboxSidesViewport(handle) {

  const iframe = handle.iframe;

  const doc = iframe.ownerDocument;

  const win = doc.defaultView;

  const rect = iframe.getBoundingClientRect();

  let clipTop = 0;

  let clipBottom =
    win.visualViewport && win.visualViewport.height
      ? Math.min(win.innerHeight, win.visualViewport.height + win.visualViewport.offsetTop)
      : win.innerHeight;

  let el = iframe.parentElement;

  while (el && el !== doc.body && el !== doc.documentElement) {

    const overflowY = win.getComputedStyle(el).overflowY;

    if (/(auto|scroll|hidden|clip)/.test(overflowY)) {

      const box = el.getBoundingClientRect();

      clipTop = Math.max(clipTop, box.top + el.clientTop);

      clipBottom = Math.min(clipBottom, box.top + el.clientTop + el.clientHeight);

    }

    el = el.parentElement;

  }

  const top = Math.max(0, clipTop - rect.top);

  const bottom = Math.min(rect.height, clipBottom - rect.top);

  return {
    top: Math.round(top),
    height: Math.max(0, Math.round(bottom - top))
  };

}


function sendSandboxSidesViewport(handle) {

  if (!handle || handle.destroyed || !handle.iframe) {
    return;
  }

  const viewport = readSandboxSidesViewport(handle);

  sendToSandboxFrame(
    handle,
    handle.TYPES.SIDES_VIEWPORT,
    {
      contract: 1,
      renderSeq: handle.renderSeq,
      top: viewport.top,
      height: viewport.height
    }
  );

}


function openSandboxSides(handle) {

  if (!handle || handle.destroyed || !handle.iframe) {
    return;
  }

  const lock = readGlobal("lockSkinSidesScroll");

  if (!handle.sidesRelease && typeof lock === "function") {
    handle.sidesRelease = lock(handle.iframe);
  }

  sendSandboxSidesViewport(handle);

  if (handle.sidesCleanup) {
    return;
  }

  const doc = handle.iframe.ownerDocument;

  const win = doc.defaultView;

  const onResize = () => sendSandboxSidesViewport(handle);

  const onPointerDown = (event) => {

    if (event.target === handle.iframe) {
      return;
    }

    sendToSandboxFrame(
      handle,
      handle.TYPES.SIDES_CLOSE,
      { contract: 1, renderSeq: handle.renderSeq }
    );

  };

  win.addEventListener("resize", onResize);

  if (win.visualViewport) {
    win.visualViewport.addEventListener("resize", onResize);
  }

  doc.addEventListener("pointerdown", onPointerDown, true);

  handle.sidesCleanup = () => {

    win.removeEventListener("resize", onResize);

    if (win.visualViewport) {
      win.visualViewport.removeEventListener("resize", onResize);
    }

    doc.removeEventListener("pointerdown", onPointerDown, true);

  };

}


function releaseSandboxSides(handle) {

  if (!handle) {
    return;
  }

  if (handle.sidesCleanup) {
    handle.sidesCleanup();
    handle.sidesCleanup = null;
  }

  if (handle.sidesRelease) {
    handle.sidesRelease();
    handle.sidesRelease = null;
  }

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
   살아 있는 handle 장부 · 지금 화면(screen)

   ---------------------------------------------------------
   ★ 왜 "지금 화면" 이라는 축이 필요한가 (SANDBOX-5B)

   이 앱의 공개 화면은 **두 자리**에 그려진다.

     HOME                      #themeMount   (#viewerArea 안)
     CATEGORY/GALLERY/BANNER/  #postList /
     HIGHLIGHTS/POST           #postSkinContainer  (#postArea 안)

   그리고 HOME 으로 옮겨 갈 때 #postArea 를 접기만 하듯,
   HOME 에서 다른 화면으로 갈 때도 #themeMount 를 비우지 않는다 —
   #postArea 가 그 위를 덮을 뿐이다. native 스킨에서는 그것이 맞는
   동작이다(덮인 DOM 은 아무 일도 하지 않는다).

   sandbox 스킨에서는 맞지 않는다. 덮인 자리에 남은 iframe 은
   살아 있는 문서이고, 그 안의 타이머 · rAF · 리스너 ·
   **저자 JS** 가 계속 돈다. 그래서 production 에서 HOME →
   CATEGORY 뒤에 프레임이 둘 떠 있었다(둘 다 실행 중).

   고치는 자리는 "iframe 을 지우는 코드"를 진입 모듈마다 뿌리는
   것이 아니라, **지금 어느 자리가 현재 화면인가**를 한 곳에서
   아는 것이다. 그 한 곳이 이 장부이고, 그것을 알려 주는 쪽은
   기존 화면 전환의 주인인 posts/view/posts-view-transition.js
   (body.post-mode 를 켜고 끄는 그 지점) 하나다.

   ---------------------------------------------------------
   ★ 규칙 넷

     1. 지금 화면이 아닌 자리의 handle 은 **제거**한다(가리지
        않는다). iframe 을 DOM 에서 떼면 그 realm 이 통째로
        사라지므로 타이머 · rAF · 리스너 · observer · 저자 JS 가
        함께 끝난다(프레임의 pagehide 에서 onCleanup 도 돈다).
     2. HOME 자리의 handle 은 버리기 전에 **다시 띄울 재료**를
        적어 둔다(suspendedHomeSandbox). 조회도 Context 조립도
        다시 하지 않는다 — 같은 payload 로 프레임만 새로 띄운다.
     3. 지금 화면이 post 인 동안 도착한 HOME mount 요청은 프레임을
        만들지 않고 그 재료만 적어 둔다(deferred). 주소로 곧장
        /category/1 에 들어온 경우 index.html 의 initHomeRenderer()
        가 뒤늦게 HOME 을 그리는데, 그때 프레임이 하나 더 생기는
        것을 여기서 막는다.
     4. 같은 자리(screen)에 새로 mount 하면 그 자리의 옛 handle 은
        전부 내린다. CATEGORY → POST 는 컨테이너가 서로 다르지만
        (#postList / #postSkinContainer) 같은 자리다.

   destroy 된 handle 의 늦은 postMessage 는 이미 무시된다 —
   destroySandboxSkinFrame() 이 리스너를 떼고, 남은 호출에서도
   handle.destroyed 가 먼저 걸린다.
========================================================== */

const liveSandboxHandles =
  [];


/*
  "" 이면 아직 아무도 알려 주지 않았다 = 모든 mount 를 그대로
  받는다. Skin Studio Preview 문서(preview-frame.html)는 이 모듈을
  자기 문서에서 따로 로드하고 post-mode 라는 것이 없으므로 끝까지
  "" 이다 — 이 라운드의 판정이 Preview 를 건드리지 않는다.
*/

let activeSandboxScreen =
  "";


/*
  HOME 자리를 비우면서 적어 둔 재료. { options, scrollTop }.
  하나뿐이다 — HOME 은 한 자리이고, 늦게 온 것이 이긴다.
*/

let suspendedHomeSandbox =
  null;


/*
  자리(screen)마다의 mount 순번.

  ★ 왜 장부만으로는 모자라는가

  mount 는 두 번 기다린다(READY 왕복 · RENDERED). 장부에 오르는
  것은 첫 기다림이 끝난 뒤다. 그래서 CATEGORY 프레임이 아직
  READY 를 기다리는 동안 POST 로 옮겨 가면, POST 의 mount 가
  하는 정리(sweepSandboxHandles)는 아직 장부에 없는 그 CATEGORY
  프레임을 보지 못한다. 잠시 뒤 그것이 장부에 올라 **가려진 채
  남는다** — 2026-09-16 뒤로/앞으로 반복에서 실제로 재현됐다
  (#postList(안 보임) + #postSkinContainer).

  그래서 mount 를 시작할 때 그 자리의 번호를 하나 올리고, 기다림이
  끝날 때마다 자기 번호가 아직 최신인지 본다. 이 파일의 renderSeq
  와 같은 장치이고, posts/view/* 의 요청 순번과도 같은 생각이다.
*/

const sandboxScreenMountSeq = {
  home: 0,
  post: 0
};


/*
  복귀(resume)가 진행 중인가. 한 번에 하나만 돈다 —
  suspendedHomeSandbox 를 기다리기 **전에** 비우므로, 그 사이
  들어온 다른 sync 호출은 다시 띄우지 않는다.
*/

let homeSandboxResuming =
  false;


function sandboxScreenOf(pageType) {

  return pageType === "home" ? "home" : "post";

}


function trackSandboxHandle(handle) {

  liveSandboxHandles.push(handle);

}


function forgetSandboxHandle(handle) {

  const at =
    liveSandboxHandles.indexOf(handle);

  if (at !== -1) {
    liveSandboxHandles.splice(at, 1);
  }

}


/*
  HOME 자리의 handle 을 내리기 전에 재료를 적어 둔다. 컨테이너가
  이미 문서에서 떨어져 나갔으면 적지 않는다 — 그 자리로는 돌아갈
  수 없다.
*/

function rememberSuspendedHomeSandbox(handle) {

  const options =
    handle && handle.mountOptions;

  const container =
    options && options.container;

  if (!container || !container.isConnected) {
    return;
  }

  suspendedHomeSandbox = {
    options: options,

    /* 돌아왔을 때 보던 자리를 그대로 — 스킨 HOME 은 #themeMount 가 스크롤한다 */
    scrollTop:
      typeof container.scrollTop === "number" ? container.scrollTop : 0
  };

}


function retireSandboxHandle(handle) {

  if (
    handle &&
    handle.screen === "home" &&
    !handle.destroyed
  ) {
    rememberSuspendedHomeSandbox(handle);
  }

  /* 장부에서 빼는 것은 destroySandboxSkinFrame() 이 한다 */

  destroySandboxSkinFrame(handle);

}


/*
  mount 직전 정리. 같은 자리(screen)의 것과, 같은 컨테이너의 것과,
  이미 떨어져 나간 것을 내린다.

  ★ **다른 자리**의 handle 은 여기서 건드리지 않는다. 그것은
  syncSandboxSkinScreen() 의 몫이다 — 새 화면이 다 그려진 뒤에
  옛 자리를 내려야 화면이 비는 순간이 생기지 않는다(기존 SPA 의
  "이전 화면을 유지한다" 원칙 그대로).
*/

function sweepSandboxHandles(container, screen) {

  const doomed =
    liveSandboxHandles.filter(
      (handle) => {

        const detached =
          !handle.iframe ||
          !handle.iframe.isConnected;

        const sameContainer =
          container &&
          handle.iframe &&
          handle.iframe.parentNode === container;

        const sameScreen =
          screen &&
          handle.screen === screen;

        return (
          handle.destroyed || detached || sameContainer || sameScreen
        );

      }
    );


  /*
    같은 자리를 다시 그리는 중이다 — 재료를 적어 둘 이유가
    없다(방금 새것이 들어온다). 떨어져 나간 것도 마찬가지다.
  */

  for (const handle of doomed) {
    destroySandboxSkinFrame(handle);
  }

}


/* =========================================================
   syncSandboxSkinScreen(screen, options) -> Promise<void>

   "지금 현재 화면은 여기다" 하나만 알려 주는 창구.

     screen : "home" | "post"
     options.retirePrevious : false 면 옛 자리를 아직 내리지 않는다
                              (닫히는 애니메이션이 도는 동안 옛
                               화면이 비어 보이지 않게)

   ★ 부르는 곳은 posts/view/posts-view-transition.js 한 곳이다.
     (body.post-mode 를 켜고 끄는 자리 + closePostArea 의 첫 줄)

   ★ sandbox 프레임이 하나도 없는 배포/스킨에서는 전부 no-op 다 —
     장부가 비어 있고 적어 둔 재료도 없으므로 native 스킨의 화면
     전환은 한 줄도 달라지지 않는다.
========================================================== */

export async function syncSandboxSkinScreen(screen, options) {

  const opts =
    options || {};

  const next =
    screen === "home" ? "home" : "post";

  activeSandboxScreen =
    next;


  /* --- ① 이 자리가 다시 현재 화면이 됐다 --------------- */

  if (
    next === "home" &&
    suspendedHomeSandbox &&
    !homeSandboxResuming
  ) {

    const record =
      suspendedHomeSandbox;

    suspendedHomeSandbox =
      null;

    homeSandboxResuming =
      true;

    try {
      await resumeHomeSandbox(record);
    }

    finally {
      homeSandboxResuming = false;
    }

  }


  /* --- ② 지금 화면이 아닌 자리는 내린다 ---------------- */

  if (opts.retirePrevious === false) {
    return;
  }

  for (let i = liveSandboxHandles.length - 1; i >= 0; i -= 1) {

    const handle =
      liveSandboxHandles[i];

    if (handle.screen !== activeSandboxScreen) {
      retireSandboxHandle(handle);
    }

  }

}


async function resumeHomeSandbox(record) {

  const container =
    record.options && record.options.container;

  if (!container || !container.isConnected) {
    return;
  }


  const mounted =
    await mountPreparedSandboxSkin(record.options);


  /*
    ★ 기다리는 사이에 **다른 화면**이 현재 화면이 됐으면 이 프레임은
    이미 옛것이다. 재료는 다시 적어 두고(다음 복귀에서 쓴다) 프레임만
    내린다.

    판정을 순번이 아니라 activeSandboxScreen 으로 하는 이유:
    HOME 으로 돌아오는 길에는 sync("home") 이 **두 번** 불린다
    (closePostArea 첫 줄에서 한 번, 커튼이 걷힌 뒤 한 번 — 앞의
    것이 복귀를 시작하고 뒤의 것이 옛 화면을 내린다). 순번으로
    재면 두 번째 호출 때문에 방금 띄운 HOME 프레임을 스스로
    내려 버린다(2026-09-16 실측).
  */

  if (activeSandboxScreen !== "home") {

    if (mounted && mounted.ok && mounted.handle) {
      retireSandboxHandle(mounted.handle);
    }

    else if (mounted && mounted.deferred) {
      /* mount 가 스스로 적어 뒀다 */
    }

    else {
      suspendedHomeSandbox = record;
    }

    return;

  }


  if (mounted && (mounted.ok || mounted.deferred)) {

    if (mounted.ok) {

      try {
        container.scrollTop = record.scrollTop || 0;
      }
      catch (err) { /* 스크롤 복원 실패는 화면을 막지 않는다 */ }

    }

    return;

  }


  /*
    ★ 프레임이 다시 뜨지 못했다 — 백지로 두지 않는다.

    같은 스킨을 native 로 그린다(skin-home.js 가 처음 mount 실패
    때 하는 것과 같은 규칙). 조회도 Context 조립도 다시 하지
    않는다 — 그 재료는 호출자가 이 thunk 안에 이미 담아 줬다.
    다시 시도하지는 않는다(무한 재시도 금지).
  */

  const renderNative =
    record.options && record.options.renderNative;

  if (typeof renderNative === "function") {

    try {

      container.innerHTML = "";

      renderNative(container);

    }

    catch (err) {

      console.error(
        "[skin-sandbox-host] HOME native fallback failed",
        err
      );

    }

  }

}


/* =========================================================
   resolveSandboxParentOrigin(container)

   프레임에 보낼 이미지 주소를 절대 주소로 바꿀 때 쓰는 값
   (skin/sandbox/skin-sandbox-context.js sandboxImageUrl).
========================================================== */

function resolveSandboxParentOrigin(container) {

  const win =
    container &&
    container.ownerDocument
      ? container.ownerDocument.defaultView
      : (typeof window !== "undefined" ? window : null);

  return win && win.location ? win.location.origin : "";

}


/* =========================================================
   prepareSandboxSkin(options) -> { ok:true, mount } | { ok:false, reason }

   ★ SANDBOX-2에서 mount 를 둘로 쪼갠 이유

   CATEGORY/POST 의 기존 렌더 경로는 **떨어진(detached) 스크래치
   엘리먼트**에 먼저 그린 뒤, 요청 순번이 아직 최신일 때만 그
   내용을 화면 컨테이너로 **옮긴다**(posts/view/posts-view-list.js,
   posts-view-detail.js). 늦게 도착한 응답이 최신 화면을 덮지 않게
   하는 기존 장치다.

   그런데 iframe 은 DOM 에서 옮기는 순간 **문서가 다시 로드된다** —
   핸드셰이크도 렌더도 처음부터 다시 하게 되고, 그 사이 화면이
   비어 보인다. 그래서 sandbox 경로는 "그려 두고 옮긴다"를 쓸 수
   없다.

   대신 옮길 수 없는 부분만 미룬다:

     prepare : 조회·template·Context 투영·nav 표 발급 (여기까지가
               느린 일이고, 늦게 끝나도 화면을 건드리지 않는다)
     mount   : 실제 iframe 생성 (호출자가 requestId 를 확인한 뒤,
               **살아 있는 컨테이너**에 대고 한 번만 부른다)

   결과적으로 "늦은 응답이 최신 화면을 덮지 않는다"는 성질은 그대로
   유지된다 — 늦게 끝난 prepare 의 mount 는 호출되지 않는다.
========================================================== */

/* =========================================================
   projectSandboxRenderInput(opts)
     -> { ok:true, pageType, template, data, navRegistry }
      | { ok:false, reason }

   "이번 한 장에 보낼 것"을 만드는 단계 전체. prepareSandboxSkin()
   이 원래 하던 일을 그대로 꺼낸 것이고, SANDBOX-4 에서
   renderSandboxSkinPage() 가 같은 경로를 두 번째로 쓴다.

   ★ 여기가 데이터 신뢰 경계다. 원본 context 는 이 함수 안에서
   끝나고, 아래(=postMessage) 로는 투영 결과만 간다.

   opts.navResolveTarget 은 Studio Preview 만 준다 — 이유는
   skin/sandbox/skin-sandbox-nav.js 의 createSandboxNavRegistry
   주석에 있다. 공개 화면은 주지 않으므로 기본 판정자가 쓰인다.
========================================================== */

/* =========================================================
   SANDBOX-5A — resolveSandboxAuthorJs(opts, template, context)
     -> "" | string

   ★ 저자 JS 가 wire 에 오를지 말지를 정하는 **유일한 자리**다.

   여기서 "" 를 돌려주면 프레임은 코드를 받지 못하고, 받지 못한
   코드는 실행될 수 없다. 공개 다섯 화면과 Studio Preview 가 전부
   이 함수를 지난다 — 화면마다 따로 판정하지 않는다.

   관문(하나라도 걸리면 ""):

     1. template.js 가 비어 있지 않은 문자열인가
        (없으면 = 지금까지의 모든 스킨. 아무 일도 일어나지 않는다)
     2. 상한 안인가(프로토콜과 같은 값 —
        SANDBOX_MAX_AUTHOR_JS_CHARS. 넘으면 메시지 자체가 거부되므로
        여기서 먼저 떨어뜨리고 이유를 남긴다)
     3. isSandboxSkinAuthorJsEnabled(win, slug)
        = 전역 kill switch + 호스트 + (production 이면) slug 두 목록
        (skin/sandbox/skin-sandbox-config.js)

   ★ renderMode 는 왜 여기서 안 보는가

   이 파일에 들어온다는 것 자체가 renderMode:"sandbox" 라는 뜻이다.
   native 스킨은 호출자(skin/skin-home.js 등)의 분기에서 이미
   갈라져 이 함수까지 오지 않는다.

   ★ slug 는 주소가 아니라 **지금 그리는 블로그의 것**을 쓴다.

   context.site.slug 는 DB 에서 온 값이고 방문자가 주소로 바꿀 수
   없다. Studio Preview 는 주소 첫 칸이 언제나 "studio" 라서 주소로는
   가를 수 없기도 하다(isSandboxSkinPreviewEnabled 와 같은 이유).

   ★ 플래그를 어느 window 에서 읽는가

   opts.flagWindow 가 있으면 그것(= Studio Preview 가 주는 Studio
   문서). 없으면 컨테이너의 문서 — 공개 화면이 그 경우다.
========================================================== */

function resolveSandboxAuthorJs(opts, template, context) {

  const code =
    template && typeof template.js === "string" ? template.js : "";

  if (!code) {
    return "";
  }


  const limit =
    readGlobal("SANDBOX_MAX_AUTHOR_JS_CHARS");

  if (
    typeof limit === "number" &&
    code.length > limit
  ) {

    console.warn(
      "[skin-sandbox-host] author js too long — not sent to the frame"
    );

    return "";

  }


  const isEnabled =
    readGlobal("isSandboxSkinAuthorJsEnabled");

  if (typeof isEnabled !== "function") {
    return "";
  }


  const win =
    opts.flagWindow ||
    opts.win ||
    (
      opts.container && opts.container.ownerDocument
        ? opts.container.ownerDocument.defaultView
        : (typeof window !== "undefined" ? window : null)
    );

  const slug =
    context && context.site && typeof context.site.slug === "string"
      ? context.site.slug
      : "";


  return isEnabled(win, slug) === true ? code : "";

}


function projectSandboxRenderInput(opts) {

  const pageType =
    opts.pageType;


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
    ★ nav 표는 **이번 렌더의 것**이다. 투영이 도는 동안 Context 의
    href 가 하나씩 등록되고, 그 표는 그 렌더의 handle 에만 붙는다 —
    옛 화면의 navId 가 새 화면에서 통하지 않는다.
  */

  const createRegistry =
    readGlobal("createSandboxNavRegistry");

  const registryWin =
    opts.win ||
    (
      opts.container && opts.container.ownerDocument
        ? opts.container.ownerDocument.defaultView
        : undefined
    );

  const navRegistry =
    typeof createRegistry === "function"
      ? createRegistry(
        registryWin,
        typeof opts.navResolveTarget === "function"
          ? { resolveTarget: opts.navResolveTarget }
          : undefined
      )
      : null;


  const data =
    project(
      opts.context,
      pageType,
      {
        nav: navRegistry,
        origin: resolveSandboxParentOrigin(opts.container)
      }
    );

  if (!data) {
    return { ok: false, reason: "bad-context" };
  }


  return {
    ok: true,
    pageType: pageType,
    template: template,
    data: data,
    navRegistry: navRegistry,

    /*
      SANDBOX-5A — 프레임으로 **실제로 보낼** 저자 코드. 관문을
      통과하지 못했으면 빈 문자열이고, 빈 문자열은 payload 에
      실리지 않는다(아래 renderSandboxPageIntoHandle).
    */

    authorJs: resolveSandboxAuthorJs(opts, template, opts.context)
  };

}


export function prepareSandboxSkin(options) {

  const opts =
    options || {};


  const prepared =
    projectSandboxRenderInput({
      pageType: opts.pageType,
      template: opts.template,
      context: opts.context,
      container: opts.container,
      flagWindow: opts.flagWindow,
      navResolveTarget: opts.navResolveTarget
    });

  if (!prepared.ok) {
    return prepared;
  }


  return {

    ok: true,

    pageType: prepared.pageType,

    /*
      SANDBOX-5A — 호출자가 "이 화면은 저자 JS 를 실행한다"를 미리
      알 수 있게 한다. Studio Preview 가 프레임 재사용 여부를 정할
      때 쓴다(needs-new-realm).
    */

    hasAuthorJs: prepared.authorJs !== "",

    mount: function (container) {

      return mountPreparedSandboxSkin({
        container: container || opts.container,
        pageType: prepared.pageType,
        template: prepared.template,
        data: prepared.data,
        navRegistry: prepared.navRegistry,
        authorJs: prepared.authorJs,
        frameOrigin: opts.frameOrigin,

        /*
          SANDBOX-5B — 복귀(resume)가 실패했을 때 같은 스킨을
          native 로 그릴 thunk. 주지 않으면 그 경우 그 자리는
          비어 있게 된다(지금까지의 호출자는 주지 않았다).
        */

        renderNative: opts.renderNative,

        onNavigate: opts.onNavigate,
        onScriptError: opts.onScriptError,

        /* SANDBOX-6A — 프레임의 Select 결과를 받을 곳 */
        onInspect: opts.onInspect,

        timeoutMs: opts.timeoutMs,
        renderTimeoutMs: opts.renderTimeoutMs,
        onError: opts.onError
      });

    }

  };

}


/* =========================================================
   mountSandboxSkin(options) -> Promise<result>

   options = {
     container : HTMLElement
     pageType  : "home" | "category" | "post"
     template  : { html, css }     // resolveSkinTemplate()의 결과
     context   : object            // build*SkinContext()의 결과(원본)
     timeoutMs / renderTimeoutMs / onError : 선택
   }

   result = { ok:true, handle } | { ok:false, reason }

   reason: mountSandboxSkinFrame의 값들 +
           "bad-page-type" "bad-template" "no-projector"
           "bad-context" "send-failed" "render-timeout" "frame-error"

   prepare + mount 를 한 번에 하는 편의 함수다. 컨테이너가 이미
   화면에 붙어 있고 옮길 일이 없는 HOME 이 이 경로를 쓴다.
========================================================== */

export async function mountSandboxSkin(options) {

  const prepared =
    prepareSandboxSkin(options);

  if (!prepared.ok) {
    return prepared;
  }


  return prepared.mount((options || {}).container);

}


/* =========================================================
   renderSandboxPageIntoHandle(handle, opts) -> Promise<result>

   ★ SANDBOX-4 — "이미 떠 있는 프레임에 한 장 더 그린다".

   mountPreparedSandboxSkin() 이 처음 한 장을 그릴 때 쓰던 블록을
   그대로 꺼낸 것이다. 새로 생긴 것은 **호출자가 둘**이라는 사실
   하나뿐이다:

     1. mountPreparedSandboxSkin()  — 프레임을 막 띄운 직후 첫 장
     2. renderSandboxSkinPage()     — 살아 있는 프레임에 다음 장

   2가 필요한 이유는 Skin Studio Preview 다. 거기서는 HTML/CSS 한
   글자를 고칠 때마다, 그리고 미리보는 페이지를 바꿀 때마다 다시
   그려야 한다. 그때마다 cross-origin iframe 을 새로 만들면 문서
   로드와 READY 왕복을 처음부터 다시 하게 되고(그 사이 화면이
   비어 보인다), 무엇보다 "iframe 은 정확히 하나"라는 요구가
   깨진다.

   ★ 늦게 도착한 응답은 여기서도 버려진다

   handle.renderSeq 를 먼저 올리고, 그 값과 다른 renderSeq 를
   가진 RENDERED/HEIGHT/NAVIGATE 는 무시한다 — 옛 렌더의 답이
   최신 화면을 덮지 않는다. 프레임 쪽도 같은 규칙으로 옛 렌더
   메시지를 버린다(skin/sandbox/skin-sandbox-frame.js renderPage).

   opts = {
     pageType, template, data, navRegistry, renderTimeoutMs
   }
========================================================== */

/* =========================================================
   buildSandboxTemplatePayload(template, authorJs)

   프레임에 보낼 template 봉투. 알려진 키만 새 리터럴에 담는다
   (프로토콜과 같은 원칙) — 그리고 **저자 코드가 비어 있으면 js
   키 자체를 만들지 않는다**. 지금까지의 모든 스킨에서 이 메시지는
   SANDBOX-4 와 byte 단위로 같다.
========================================================== */

/* 좌우 영역 설정 봉투 — { left, right } (+ 모바일에서 끈 쪽이 있으면 mobile) */
export function copySandboxSidesSetting(sides) {

  const copy = {
    left: sides.left === true,
    right: sides.right === true
  };

  const mobile = sides.mobile;

  if (
    mobile && typeof mobile === "object" &&
    (mobile.left === false || mobile.right === false)
  ) {
    copy.mobile = { left: mobile.left !== false, right: mobile.right !== false };
  }

  return copy;

}


/* HOME 캔버스 봉투 — 모양이 틀리면 undefined(키를 만들지 않는다).
   판정과 복사를 둘 다 skin/skin-home-canvas.js 한 곳에 맡긴다
   (IMORY_HOME_CANVAS_CONTRACT.md). 그 파일이 없는 문서에서는 키를
   만들지 않는다 — 검사 규칙을 여기 복사하면 두 곳이 갈라진다. */
export function copySandboxHomeCanvas(canvas) {

  if (!canvas || typeof canvas !== "object") {
    return undefined;
  }

  return typeof coerceSkinHomeCanvasRenderPayload === "function"
    ? coerceSkinHomeCanvasRenderPayload(canvas)
    : undefined;

}


/* 스킨 설정 봉투 — 모양이 틀리거나 비었으면 undefined(키를 만들지 않는다) */
export function copySandboxSkinSettings(settings) {

  if (!settings || typeof settings !== "object") {
    return undefined;
  }

  return typeof coerceSkinSettingsRenderSetting === "function"
    ? coerceSkinSettingsRenderSetting(settings)
    : undefined;

}


function buildSandboxTemplatePayload(template, authorJs) {

  const payload = {
    html: template.html,
    css: typeof template.css === "string" ? template.css : ""
  };

  /* 좌우 영역 설정 — resolveSkinTemplate 이 regions 에서 만든다. 영역
     설정이 없는 스킨은 키 자체가 없다(봉투가 지금까지와 같다). */
  if (template.sides && typeof template.sides === "object") {
    payload.sides = copySandboxSidesSetting(template.sides);
  }

  /* 주인의 스킨 설정(색 · 사진 구성 · D-day) — 설정이 없는 스킨은 키가
     없다. 알려진 칸만 새 리터럴로 옮긴다(skin/skin-settings.js). */
  const settings = copySandboxSkinSettings(template.settings);

  if (settings) {
    payload.settings = settings;
  }

  /* HOME 캔버스 — resolveSkinTemplate 이 regions + 표시 위치에서
     만든다. 캔버스가 없는 스킨은 키 자체가 없다. */
  const canvas = copySandboxHomeCanvas(template.canvas);

  if (canvas) {
    payload.canvas = canvas;
  }

  if (typeof authorJs === "string" && authorJs) {
    payload.js = authorJs;
  }

  return payload;

}


async function renderSandboxPageIntoHandle(handle, opts) {

  const pageType =
    opts.pageType;

  const template =
    opts.template;

  const data =
    opts.data;

  const TYPES =
    handle.TYPES;


  handle.pageType =
    pageType;

  handle.navRegistry =
    opts.navRegistry || null;


  /*
    SANDBOX-5A — 이 프레임(realm)에 저자 코드를 보낸 적이 있는가.
    한 번이라도 보냈으면 그 realm 은 재사용하지 않는다 — 임의 JS 가
    남긴 타이머/리스너/observer 를 전부 되돌릴 방법이 없기 때문이다
    (renderSandboxSkinPage 의 needs-new-realm).
  */

  if (opts.authorJs) {
    handle.authorJsSent = true;
  }


  /*
    높이 적용 횟수는 렌더 하나당 세는 값이다 — 다시 그릴 때마다
    0으로 되돌려야 오래 열어 둔 Studio 에서 높이가 굳지 않는다.
  */

  handle.appliedHeight = 0;
  handle.heightApplies = 0;
  handle.rendered = false;

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


        /* 좌우 영역 — 위 openSandboxSides 주석. 옛 화면의 알림은 버린다. */
        handle.handlers[TYPES.SIDES_STATE] =
          (payload) => {

            if (payload.renderSeq !== handle.renderSeq) {
              return;
            }

            if (payload.open) {
              openSandboxSides(handle);
            } else {
              releaseSandboxSides(handle);
            }

          };


        handle.handlers[TYPES.FRAME_ERROR] =
          (payload) => {

            handle.lastReason = payload.code;

            if (handle.onError) {
              handle.onError(payload.code);
            }

            finish({ ok: false, reason: "frame-error" });

          };


        /*
          ★ SANDBOX-5A — 저자 JS 의 오류.

          FRAME_ERROR 와 달리 **렌더를 접지 않는다**(finish 를
          부르지 않는다). HTML/CSS 는 이미 그려져 있고 그대로
          남아야 한다 — 공개 화면은 native 로 폴백하지 않고,
          Studio 는 프레임을 유지한 채 안내만 띄운다.

          payload 에는 문장도 stack 도 없다. 정해진 짧은 코드
          하나뿐이다.
        */

        handle.handlers[TYPES.SCRIPT_ERROR] =
          (payload) => {

            if (payload.renderSeq !== handle.renderSeq) {
              return;
            }

            handle.lastScriptError = payload.code;

            if (typeof handle.onScriptError === "function") {
              handle.onScriptError(payload.code);
            }

          };


        /*
          ★ SANDBOX-6A — Element Inspector 가 올려보내는 넷.

          여기서는 **해석하지 않는다.** 프로토콜이 이미 모양을
          확인했고(식별자 형태·태그 형태·사각형 범위), 이 층이
          더하는 것은 "지금 화면의 것인가" 하나다 — 옛 렌더에서
          늦게 도착한 선택은 버린다.

          그 다음 판정(그 식별자가 지금 draft template 에 실제로
          있는가)은 부모 realm 의 Studio 가 한다. 프레임이 보낸
          descriptor 를 신뢰 입력으로 쓰는 코드는 이 파일에 없다.
        */

        const inspectRelay =
          (kind) => (payload) => {

            if (payload.renderSeq !== handle.renderSeq) {
              return;
            }

            if (typeof handle.onInspect !== "function") {
              return;
            }

            handle.onInspect(kind, payload);

          };

        handle.handlers[TYPES.INSPECT_HOVER] = inspectRelay("hover");
        handle.handlers[TYPES.INSPECT_SELECT] = inspectRelay("select");
        handle.handlers[TYPES.INSPECT_RECTS] = inspectRelay("rects");
        handle.handlers[TYPES.INSPECT_ERROR] = inspectRelay("error");

        /* SANDBOX-SELECT-PARITY-1 — 겹친 후보 · 더블클릭 글자 · 본체
           끌기. 같은 관문(지금 화면의 것인가)만 지나고 해석하지 않는다. */
        /* HOME-CANVAS-SELECT-1B-2 — 프레임의 캔버스 선택 **제안**.
           여기서도 해석하지 않는다 — "지금 화면의 것인가" 하나만
           보고 그대로 올린다. 그 id 들이 실제로 고를 수 있는
           것인지는 부모 realm 의 Studio 가 자기 draft 로 판단한다. */
        handle.handlers[TYPES.CANVAS_PROPOSE] = inspectRelay("canvas-propose");

        handle.handlers[TYPES.INSPECT_CANDIDATES] = inspectRelay("candidates");
        handle.handlers[TYPES.INSPECT_TEXT] = inspectRelay("text");
        handle.handlers[TYPES.INSPECT_DRAG] = inspectRelay("drag");


        /*
          ★ SANDBOX-2 — 이동 요청.

          프레임은 주소를 보내지 않는다. 부모가 이번 렌더에 발급한
          정수 하나만 온다. 그 정수를 route 로 바꾸는 표는 이
          handle 에만 있고, 그 표에는 이번 화면의 Context 가 실제로
          내려보낸 공개 주소밖에 없다(skin/sandbox/skin-sandbox-nav.js).

          여기서 하는 일은 표를 한 번 뒤져 보고 기존 라우터에
          넘기는 것뿐이다 — sandbox 전용 라우팅을 만들지 않는다.
        */

        handle.handlers[TYPES.NAVIGATE] =
          (payload) => {

            /*
              옛 화면에서 늦게 도착한 클릭은 버린다. 그 사이 이미
              다른 화면으로 옮겨 갔을 수 있다.
            */

            if (payload.renderSeq !== handle.renderSeq) {
              return;
            }


            if (
              !handle.navRegistry ||
              typeof handle.navRegistry.resolve !== "function"
            ) {
              return;
            }


            const target =
              handle.navRegistry.resolve(payload.navId);

            if (!target) {

              /* 표에 없는 id — 조용히 무시한다(응답하지 않는다) */

              handle.lastReason = "unknown-nav-id";
              return;

            }


            /*
              ★ SANDBOX-4 — 나가는 문이 둘이다.

              handle.onNavigate 가 있으면(= Skin Studio Preview)
              그쪽으로 넘긴다. Preview 는 실제 공개 주소로 나가면
              안 되고, 보고 있는 미리보기 페이지만 바뀌어야 한다.
              그 판정과 화면 전환은 이미 있는 Studio 경로
              (studio/preview/preview-route.js +
               preview-navigation.js)가 그대로 한다.

              주지 않으면(= 공개 화면) 지금까지와 똑같다.
            */

            if (typeof handle.onNavigate === "function") {

              handle.onNavigate(target);

              return;

            }


            const navigate =
              readGlobal("navigateToSkinRoute");

            if (typeof navigate !== "function") {
              return;
            }


            /*
              기존 SPA 라우터 하나로 들어간다. 주소·history·스크롤
              정책·미저장 입력 보호는 전부 그쪽이 오늘처럼 한다 —
              프레임은 history 를 절대 만지지 않는다(설계 문서 §F#4).
            */

            navigate(target.route, target.url);

          };


        const sent =
          sendToSandboxFrame(
            handle,
            TYPES.RENDER_PAGE,
            {
              contract: 1,
              pageType: pageType,
              renderSeq: renderSeq,
              template: buildSandboxTemplatePayload(
                template,
                opts.authorJs
              ),
              data: data
            }
          );

        if (!sent) {
          finish({ ok: false, reason: "send-failed" });
        }

      }
    );


  /*
    ★ 이 함수는 실패했다고 프레임을 치우지 않는다.

    첫 장(mount)에서는 호출자가 곧바로 치운다 — 아무것도 그리지
    못한 프레임을 남길 이유가 없다. 다시 그리기(Studio Preview)
    에서는 반대다: 방금 편집한 HTML 한 번이 렌더에 실패했다고
    멀쩡히 떠 있던 프레임을 없애면, 다음 글자를 칠 때 핸드셰이크
    부터 다시 하게 되고 그 사이 화면이 빈다. 무엇을 할지는
    호출자가 정한다.
  */

  return rendered;

}


/* =========================================================
   renderSandboxSkinPage(handle, options) -> Promise<result>

   SANDBOX-4 — 이미 떠 있는 프레임에 **다음 한 장**을 그린다.

   options = {
     pageType : "home" | "category" | "post" | "banner" | "highlights"
     template : { html, css }
     context  : object          // 원본 Context(투영 전)
     renderTimeoutMs / navResolveTarget : 선택
   }

   result = { ok:true } | { ok:false, reason }

   ★ prepareSandboxSkin() 과 같은 신뢰 경계를 그대로 지난다 —
   원본 context 는 투영 함수에서 끝나고, nav 표는 **이번 렌더의
   것**으로 새로 발급된다(옛 화면의 navId 가 통하지 않는다).
========================================================== */

export async function renderSandboxSkinPage(handle, options) {

  const opts =
    options || {};

  if (
    !handle ||
    handle.destroyed ||
    !handle.iframe ||
    !handle.iframe.isConnected
  ) {
    return { ok: false, reason: "no-handle" };
  }


  const prepared =
    projectSandboxRenderInput({
      pageType: opts.pageType,
      template: opts.template,
      context: opts.context,
      container: handle.iframe.parentNode,
      win: handle.win,
      flagWindow: opts.flagWindow,
      navResolveTarget: opts.navResolveTarget
    });

  if (!prepared.ok) {
    return prepared;
  }


  /* =====================================================
     ★ SANDBOX-5A — 저자 JS 가 얽히면 이 프레임을 재사용하지 않는다

     임의의 JS 가 남기는 것(setInterval · requestAnimationFrame
     고리 · window/document 리스너 · MutationObserver · Promise 에
     잡힌 참조)을 전부 되돌릴 방법은 없다. 하나만 놓쳐도 다시
     그릴 때마다 조금씩 쌓인다.

     그래서 청소하지 않고 **realm 을 버린다.** 여기서 거절하면
     호출자가 프레임을 없애고 새로 띄우며, 그때 READY/ACK ->
     RENDER -> JS 순서를 처음부터 다시 밟는다. 옛 프레임이 늦게
     보낸 메시지는 renderSeq 와 source 검증에 걸려 버려진다.

     두 경우에 거절한다:
       · 이번 렌더가 저자 JS 를 실행한다
       · 이 프레임이 **전에** 저자 JS 를 실행했다
         (이번에 JS 가 비어 있어도 옛 타이머가 살아 있다)

     둘 다 아니면 지금까지와 똑같이 재사용한다 — SANDBOX-4 의
     Studio Preview 는 한 줄도 달라지지 않는다.
  ====================================================== */

  if (prepared.authorJs || handle.authorJsSent) {
    return { ok: false, reason: "needs-new-realm" };
  }


  return renderSandboxPageIntoHandle(
    handle,
    {
      pageType: prepared.pageType,
      template: prepared.template,
      data: prepared.data,
      navRegistry: prepared.navRegistry,
      authorJs: prepared.authorJs,
      renderTimeoutMs: opts.renderTimeoutMs
    }
  );

}


async function mountPreparedSandboxSkin(opts) {

  const pageType =
    opts.pageType;

  const template =
    opts.template;

  const data =
    opts.data;


  const screen =
    sandboxScreenOf(pageType);


  /* =====================================================
     ★ SANDBOX-5B — 지금 현재 화면이 아닌 자리면 띄우지 않는다

     주소로 곧장 /category/1 에 들어오면 index.html 의
     initHomeRenderer() 가 경로와 무관하게 HOME 도 그린다. 그때
     프레임을 만들면 문서에 프레임이 둘이 된다(하나는 덮여 있지만
     둘 다 실행 중). 그래서 만들지 않고 **재료만 적어 둔다** —
     HOME 으로 돌아오는 순간 syncSandboxSkinScreen("home") 이
     그대로 띄운다.

     호출자에게는 성공으로 알린다. 실패로 알리면 같은 스킨을
     native 로 #themeMount 에 그려 두게 되고, 나중에 복귀한
     프레임과 그 DOM 이 한 자리에 겹친다.

     activeSandboxScreen 이 "" 인 문서(Skin Studio Preview)는 이
     분기를 타지 않는다.

     ★ 이 관문은 **HOME 쪽으로만** 닫힌다 (한쪽으로만 비대칭이다)

     반대쪽(지금 HOME 인데 post 화면 프레임이 온다)은 정상 경로다.
     기존 SPA 는 새 화면을 **다 그린 뒤에** 표시 공간을 드러낸다
     (posts-view-list.js 의 "Skin 후보면 이전 화면을 그대로 둔다").
     그래서 CATEGORY 프레임은 body.post-mode 가 켜지기 **전에**
     mount 된다 — 그때 막으면 카테고리가 통째로 비어 버린다.
  ====================================================== */

  if (
    screen === "home" &&
    activeSandboxScreen === "post"
  ) {

    suspendedHomeSandbox = {
      options: opts,
      scrollTop: 0
    };

    return { ok: true, deferred: true, reason: "inactive-screen" };

  }


  /*
    옛 handle 정리 — 같은 자리(screen)의 것 · 같은 컨테이너의 것 ·
    이미 떨어져 나간 것. 다른 자리의 것은 건드리지 않는다
    (syncSandboxSkinScreen 의 몫 — 위 장부 주석 참고).
  */

  sweepSandboxHandles(opts.container, screen);


  /* 이 자리의 최신 mount 는 이제 나다 (위 상수 주석) */

  sandboxScreenMountSeq[screen] += 1;

  const mountToken =
    sandboxScreenMountSeq[screen];


  /* --- 빈 프레임 --------------------------------------- */

  const mounted =
    await mountSandboxSkinFrame({
      container: opts.container,
      frameOrigin: opts.frameOrigin,
      timeoutMs: opts.timeoutMs,
      onError: opts.onError
    });

  if (!mounted.ok) {
    return mounted;
  }


  const handle =
    mounted.handle;


  /*
    기다리는 사이에 같은 자리에서 다음 화면이 시작됐다 — 이 프레임은
    그리기도 전에 옛것이 됐다. 그리지 않고 치운다.
  */

  if (sandboxScreenMountSeq[screen] !== mountToken) {

    destroySandboxSkinFrame(handle);

    return { ok: true, deferred: true, reason: "superseded" };

  }


  /*
    ★ SANDBOX-4 — 이동을 누가 처리하는가.

    주지 않으면(=공개 화면) 기존대로 navigateToSkinRoute() 로
    간다. Studio Preview 만 자기 것을 준다 — 거기서는 실제
    공개 주소로 나가면 안 되고 Preview 페이지만 바뀌어야 한다.
  */

  handle.onNavigate =
    typeof opts.onNavigate === "function" ? opts.onNavigate : null;


  /*
    SANDBOX-5A — 저자 JS 오류를 누가 보여 주는가.

    주지 않으면(= 공개 화면) 아무것도 표시하지 않는다. 방문자에게
    스킨 저자의 코드 사정을 알릴 이유가 없고, 화면은 HTML/CSS 로
    이미 정상이다. Studio 만 자기 것을 주고 짧은 안내를 띄운다.
  */

  handle.onScriptError =
    typeof opts.onScriptError === "function" ? opts.onScriptError : null;


  /*
    SANDBOX-6A — Element Inspector 의 결과를 누가 받는가.

    주지 않으면(= 공개 화면) 아무도 받지 않는다. 공개 화면에는
    Select 라는 것 자체가 없고, 그래서 부모가 INSPECT_MODE 를
    보내는 일도 없다 — 프레임의 Inspector 는 영영 꺼진 채다.
    Skin Studio Preview 만 자기 것을 준다.
  */

  handle.onInspect =
    typeof opts.onInspect === "function" ? opts.onInspect : null;


  /*
    SANDBOX-5B — 이 handle 이 어느 자리의 것인가, 그리고 다시
    띄우려면 무엇이 필요한가. 복귀(resume)는 이 옵션 하나로 끝난다 —
    조회도 Context 조립도 다시 하지 않는다.
  */

  handle.pageType =
    pageType;

  handle.screen =
    screen;

  handle.mountOptions =
    opts;


  trackSandboxHandle(handle);


  /* --- 렌더 ------------------------------------------- */

  const rendered =
    await renderSandboxPageIntoHandle(
      handle,
      {
        pageType: pageType,
        template: template,
        data: data,
        navRegistry: opts.navRegistry,
        authorJs: opts.authorJs,
        renderTimeoutMs: opts.renderTimeoutMs
      }
    );


  if (!rendered.ok) {

    destroySandboxSkinFrame(handle);

    return { ok: false, reason: rendered.reason };

  }


  /*
    ★ 핸드셰이크와 렌더를 기다리는 동안(await 둘) 화면이 바뀌어
    컨테이너가 통째로 비워졌을 수 있다. 그러면 이 프레임은 이미
    문서에서 떨어져 나갔고, 살려 둘 이유가 없다 — 리스너만 남는다.
    호출자에게는 실패로 알려서 "프레임이 안 떴을 때"와 같은 길로
    가게 한다.
  */

  if (!handle.iframe || !handle.iframe.isConnected) {

    destroySandboxSkinFrame(handle);

    return { ok: false, reason: "detached" };

  }


  /*
    렌더를 기다리는 사이에 같은 자리에서 다음 화면이 시작됐다.
    (CATEGORY → POST 처럼 컨테이너가 서로 달라도 같은 자리다 —
    그래서 컨테이너 기준 정리만으로는 잡히지 않는다.)
  */

  if (sandboxScreenMountSeq[screen] !== mountToken) {

    retireSandboxHandle(handle);

    return { ok: true, deferred: true, reason: "superseded" };

  }


  /*
    ★ SANDBOX-5B — 기다리는 동안 다른 화면이 현재 화면이 됐을 수도
    있다. 주소로 곧장 /category/1 에 들어오면 index.html 의
    initHomeRenderer() 가 HOME 도 그리는데, 그 렌더가 카테고리보다
    늦게 끝나면 위의 "띄우지 않는다" 관문(mount 를 시작할 때 한 번
    본다)을 지나온 뒤가 된다. 그래서 끝날 때 한 번 더 본다.

    위 관문과 같은 이유로 여기서도 **HOME 쪽으로만** 닫는다 —
    post 화면 프레임은 표시 공간이 드러나기 전에 완성되는 것이
    정상이다.

    재료를 적어 두고 내린다(retireSandboxHandle) — HOME 으로
    돌아오는 순간 다시 뜬다.
  */

  if (
    handle.screen === "home" &&
    activeSandboxScreen === "post"
  ) {

    retireSandboxHandle(handle);

    return { ok: true, deferred: true, reason: "screen-changed" };

  }


  return { ok: true, handle };

}


/* =========================================================
   sendSandboxPostBody(handle, body) -> boolean

   SANDBOX-2 — POST 본문 한 덩어리.

   body = { html, containerStyle, isHtmlContent }
          (호출자는 지금까지와 같은 모양을 준다 — 공개 화면도
           Studio Preview 도 고치지 않았다)

   ★ 부모가 **공개 뷰어와 같은 파이프라인**으로 이미 서식·sanitize를
   끝낸 결과물만 여기로 온다(posts/view/posts-view-detail.js 의
   renderPostBodyInto() 를 화면 밖 엘리먼트에 대고 부른 결과).
   이 함수는 그것을 옮기기만 한다 — 새 sanitize 로직을 만들지
   않는다(Studio Preview 의 preview:post-body 와 같은 책임 분리).

   ---------------------------------------------------------
   ★ SANDBOX-3.1 — 서식을 stylesheet 로 옮기는 자리

   프레임 CSP 에는 style-src 'unsafe-inline' 이 없다. 그래서 이
   HTML 을 그대로 보내면 프레임에서 **style 속성이 전부 무시되고**
   글자만 남는다(Quote Preset 의 글꼴·크기·색·행간·형광펜이
   통째로 빠진다). 2026-09-15 chromium·webkit 양쪽 실측.

   여기서 고치는 이유 — **공개 화면과 Studio Preview 의 유일한
   공통 출구**이기 때문이다. 두 호출자는 한 줄도 고치지 않았고,
   native 경로는 이 함수를 지나지 않으므로 지금까지와 완전히
   같다(요구사항 7).

   변환 자체는 posts/style/posts-body-style-extract.js 가 한다 —
   속성/값 allowlist 를 통과한 선언만 규칙으로 옮기고, 통과하지
   못한 것은 **양쪽 모두에서 사라진다**(프레임에 죽은 속성을
   실어 보내지 않는다).

   prefix 로 프레임 루트의 id 를 주는 이유는 우선순위다 —
   그 파일 상단 주석 참고.

   ★ 변환 함수가 없는 문서(전역 미로드)에서는 **보내지 않는다**.
   그대로 보내면 서식 없는 본문이 나오고, 그것은 조용한 오작동이라
   원인을 찾기 어렵다. 차라리 본문이 비고 콘솔에 이유가 남는 쪽이
   낫다.
========================================================== */

const SANDBOX_POST_BODY_CSS_PREFIX = "#sandboxFrameRoot";


export function sendSandboxPostBody(handle, body) {

  if (
    !handle ||
    handle.destroyed ||
    !handle.TYPES ||
    !body
  ) {
    return false;
  }


  const extract =
    readGlobal("extractPostBodyStyleSheet");

  if (typeof extract !== "function") {

    console.error(
      "[skin-sandbox-host] posts-body-style-extract.js 가 로드되지 않아 " +
      "본문 서식을 프레임으로 보낼 수 없습니다."
    );

    return false;

  }


  const converted =
    extract({
      html: typeof body.html === "string" ? body.html : "",
      containerStyle:
        typeof body.containerStyle === "string" ? body.containerStyle : "",
      prefix: SANDBOX_POST_BODY_CSS_PREFIX
    });


  return sendToSandboxFrame(
    handle,
    handle.TYPES.POST_BODY,
    {
      contract: 1,
      renderSeq: handle.renderSeq,
      html: converted.html,
      bodyCss: converted.css,
      isHtmlContent: body.isHtmlContent === true
    }
  );

}


/* =========================================================
   SANDBOX-6A — Element Inspector 를 켜고, 선택을 정한다

   sendSandboxInspectMode(handle, enabled) -> boolean
   sendSandboxInspectPick(handle, editId|null) -> boolean

   ★ 두 함수 모두 renderSeq 를 지금 값으로 단다. 프레임은 자기
     renderSeq 와 다른 INSPECT_* 를 버린다 — 페이지를 옮긴 뒤
     늦게 도착한 지시가 새 화면의 선택을 건드리지 않는다.

   ★ 아직 한 장도 그리지 않은 프레임(renderSeq 0)에는 보내지
     않는다. 그때 보내 봐야 프레임이 버린다 — 부모는 렌더가 끝난
     직후에 다시 보낸다(studio/preview/preview-sandbox.js).

   ★ handle.inspectEnabled 를 여기서 기억한다. 저자 JS 가 얽힌
     렌더에서는 프레임(realm)이 새로 만들어지고 그 안의 Inspector
     는 꺼진 채로 시작하므로, 호출자가 렌더 뒤에 이 값을 보고
     다시 켜 준다.
========================================================== */

export function sendSandboxInspectMode(handle, enabled) {

  if (!handle || handle.destroyed || !handle.TYPES) {
    return false;
  }


  handle.inspectEnabled = !!enabled;


  if (!handle.renderSeq) {
    return false;
  }


  return sendToSandboxFrame(
    handle,
    handle.TYPES.INSPECT_MODE,
    {
      contract: 1,
      renderSeq: handle.renderSeq,
      enabled: !!enabled
    }
  );

}


export function sendSandboxInspectPick(handle, editId) {

  if (!handle || handle.destroyed || !handle.TYPES || !handle.renderSeq) {
    return false;
  }


  const payload = {
    contract: 1,
    renderSeq: handle.renderSeq
  };

  /*
    ★ 값이 없으면 키 자체를 만들지 않는다 — 그것이 "해제"다
    (skin/sandbox/skin-sandbox-protocol.js INSPECT_PICK).
    프로토콜이 알려진 키만 옮기므로 undefined 를 실어도 같은
    결과지만, 뜻을 코드 모양으로 남긴다.
  */

  if (typeof editId === "string" && editId) {
    payload.editId = editId;
  }


  return sendToSandboxFrame(
    handle,
    handle.TYPES.INSPECT_PICK,
    payload
  );

}


/* =========================================================
   SANDBOX-SELECT-PARITY-1 — 직접 조작 지시

   sendSandboxInspectChoose(handle, index)   겹친 요소 메뉴의 칸
   sendSandboxInspectParent(handle)          바깥 영역 선택
   sendSandboxInspectCaps(handle, caps)      끌 수 있나 · 글자를 고칠 수 있나
   sendSandboxInspectPreview(handle, value)  임시 미리보기(글자 · 자유 배치 좌표)

   ★ 넷 다 **값을 새 리터럴로 옮겨** 보낸다 — 호출자의 객체를 그대로
     넘기지 않는다(모르는 키가 섞여 프레임에 가지 않게). 프로토콜이
     한 번 더 거른다.
========================================================== */

function sendInspectDirective(handle, type, payload) {

  if (!handle || handle.destroyed || !handle.TYPES || !handle.renderSeq) {
    return false;
  }

  return sendToSandboxFrame(
    handle,
    handle.TYPES[type],
    Object.assign({ contract: 1, renderSeq: handle.renderSeq }, payload)
  );

}


export function sendSandboxInspectChoose(handle, index) {

  if (!Number.isInteger(index) || index < 0) {
    return false;
  }

  return sendInspectDirective(handle, "INSPECT_CHOOSE", { index: index });

}


export function sendSandboxInspectParent(handle) {

  return sendInspectDirective(handle, "INSPECT_PARENT", {});

}


export function sendSandboxInspectCaps(handle, caps) {

  const payload = {
    movable: !!(caps && caps.movable === true),
    textEditable: !!(caps && caps.textEditable === true)
  };

  if (caps && typeof caps.editId === "string" && caps.editId) {
    payload.editId = caps.editId;
  }

  return sendInspectDirective(handle, "INSPECT_CAPS", payload);

}


export function sendSandboxInspectPreview(handle, value) {

  if (!value || value.clear === true) {
    return sendInspectDirective(handle, "INSPECT_PREVIEW", { clear: true });
  }

  if (typeof value.editId !== "string" || !value.editId) {
    return false;
  }

  const payload = { editId: value.editId };

  if (typeof value.text === "string") {
    payload.text = value.text;
  }

  ["layoutX", "layoutY"].forEach((key) => {
    if (typeof value[key] === "number" && Number.isFinite(value[key])) {
      payload[key] = Math.min(1, Math.max(0, value[key]));
    }
  });

  if (payload.text === undefined && payload.layoutX === undefined && payload.layoutY === undefined) {
    return false;
  }

  return sendInspectDirective(handle, "INSPECT_PREVIEW", payload);

}


/* =========================================================
   HOME-CANVAS-SELECT-1B-1 — 캔버스 선택을 프레임에 알린다

   sendSandboxCanvasSelect(handle, selection) -> boolean

   selection = { active, ids[], primaryId|null, generation }

   ★ 호출자의 객체를 그대로 넘기지 않는다 — 알려진 칸만 새
     리터럴로 옮긴다(위 네 지시와 같은 규칙). 프로토콜이 한 번 더
     거른다.

   ★ 아직 한 장도 그리지 않은 프레임(renderSeq 0)에는 보내지
     않는다. 부모가 렌더 직후에 다시 보낸다
     (studio/preview/preview-sandbox.js flushSandboxInspectState).
========================================================== */

export function sendSandboxCanvasSelect(handle, selection) {

  if (!handle || handle.destroyed || !handle.TYPES || !handle.renderSeq) {
    return false;
  }


  const value =
    (selection && typeof selection === "object") ? selection : null;


  const ids =
    (value && Array.isArray(value.ids))
      ? value.ids.filter(
          (id, index, list) =>
            typeof id === "string" && id && list.indexOf(id) === index
        )
      : [];


  const primaryId =
    (value && typeof value.primaryId === "string" && value.primaryId)
      ? value.primaryId
      : null;


  const active =
    !!(value && value.active === true && primaryId && ids.indexOf(primaryId) !== -1);


  /* HOME-CANVAS-SELECT-1B-2 — 고른 것이 있으면 편집 중인 것이
     당연하고, 고른 것이 없어도 편집 중일 수 있다(lasso). */
  const editing =
    active || !!(value && value.editing === true);


  const payload = {
    contract: 1,
    renderSeq: handle.renderSeq,
    editing: editing,
    active: active,
    ids: active ? ids.slice() : [],
    generation:
      (value && Number.isInteger(value.generation) && value.generation >= 0)
        ? value.generation
        : 0
  };

  /* 해제에는 primaryId 칸 자체를 만들지 않는다 — 프로토콜이 그
     모양을 요구한다(INSPECT_PICK 의 editId 와 같은 결). */
  if (active) {
    payload.primaryId = primaryId;
  }


  return sendToSandboxFrame(
    handle,
    handle.TYPES.CANVAS_SELECT,
    payload
  );

}


/* =========================================================
   destroySandboxSkinFrame(handle)

   리스너를 떼고 iframe을 없앤다. 두 번 불러도 안전하다.
========================================================== */

export function destroySandboxSkinFrame(handle) {

  if (!handle || handle.destroyed) {
    return;
  }


  /* 열린 패널이 부모 스크롤을 잠가 둔 채 프레임이 내려가면 안 된다 */
  releaseSandboxSides(handle);

  handle.destroyed = true;

  handle.handlers = {};


  /*
    SANDBOX-5B — 장부에서도 뺀다. 한 곳에서만 빼야 "내렸는데
    장부에는 남아 있는" 상태가 생기지 않는다.
  */

  forgetSandboxHandle(handle);


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
  prepareSandboxSkin,
  mountSandboxSkinFrame,
  renderSandboxSkinPage,
  sendSandboxPostBody,
  syncSandboxSkinScreen,
  destroySandboxSkin,
  destroySandboxSkinFrame
};


if (typeof window !== "undefined") {

  window.skinSandboxHost =
    sandboxHostApi;


  /*
    SANDBOX-5B — 화면 전환의 주인(posts/view/posts-view-transition.js)
    은 classic script 라 이 모듈을 import 할 수 없고, 전환 도중에
    Promise 를 기다릴 수도 없다(기다리는 사이 화면이 또 바뀐다).
    그래서 전역 함수 하나로 준다 — 이 모듈이 아직 로드되지 않은
    문서에서는 undefined 이고, 호출자는 그때 아무것도 하지 않는다.
  */

  window.syncSandboxSkinScreen =
    syncSandboxSkinScreen;

  if (typeof window.__resolveSkinSandboxHostReady === "function") {
    window.__resolveSkinSandboxHostReady(sandboxHostApi);
  }

  else if (!window.skinSandboxHostReady) {
    window.skinSandboxHostReady = Promise.resolve(sandboxHostApi);
  }

}
