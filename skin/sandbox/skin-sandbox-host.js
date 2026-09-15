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
   살아 있는 handle 장부

   컨테이너가 innerHTML="" 로 비워지면 iframe 은 사라지지만 부모
   window 의 message 리스너는 남는다. 그것이 쌓이면 옛 화면의
   핸들러가 계속 돌고, 화면마다 리스너가 하나씩 늘어난다.

   그래서 mount 할 때마다
     ① 같은 컨테이너에 걸려 있던 이전 handle 을 확실히 내리고
     ② 문서에서 이미 떨어져 나간(iframe.isConnected === false)
        handle 을 전부 정리한다.

   이 장부가 SANDBOX-2 에서 새로 필요해진 이유: HOME 은 한 번
   mount 하면 그대로 남지만, CATEGORY/POST 는 화면을 옮길 때마다
   컨테이너가 통째로 비워진다.
========================================================== */

const liveSandboxHandles =
  [];


function trackSandboxHandle(handle) {

  liveSandboxHandles.push(handle);

}


function sweepSandboxHandles(container) {

  for (let i = liveSandboxHandles.length - 1; i >= 0; i -= 1) {

    const handle =
      liveSandboxHandles[i];

    const detached =
      !handle.iframe ||
      !handle.iframe.isConnected;

    const sameContainer =
      container &&
      handle.iframe &&
      handle.iframe.parentNode === container;

    if (handle.destroyed || detached || sameContainer) {

      destroySandboxSkinFrame(handle);

      liveSandboxHandles.splice(i, 1);

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
    navRegistry: navRegistry
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
      navResolveTarget: opts.navResolveTarget
    });

  if (!prepared.ok) {
    return prepared;
  }


  return {

    ok: true,

    pageType: prepared.pageType,

    mount: function (container) {

      return mountPreparedSandboxSkin({
        container: container || opts.container,
        pageType: prepared.pageType,
        template: prepared.template,
        data: prepared.data,
        navRegistry: prepared.navRegistry,
        frameOrigin: opts.frameOrigin,
        onNavigate: opts.onNavigate,
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


        handle.handlers[TYPES.FRAME_ERROR] =
          (payload) => {

            handle.lastReason = payload.code;

            if (handle.onError) {
              handle.onError(payload.code);
            }

            finish({ ok: false, reason: "frame-error" });

          };


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
      navResolveTarget: opts.navResolveTarget
    });

  if (!prepared.ok) {
    return prepared;
  }


  return renderSandboxPageIntoHandle(
    handle,
    {
      pageType: prepared.pageType,
      template: prepared.template,
      data: prepared.data,
      navRegistry: prepared.navRegistry,
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


  /* 옛 handle 정리 — 같은 컨테이너의 것과 이미 떨어져 나간 것 */

  sweepSandboxHandles(opts.container);


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
    ★ SANDBOX-4 — 이동을 누가 처리하는가.

    주지 않으면(=공개 화면) 기존대로 navigateToSkinRoute() 로
    간다. Studio Preview 만 자기 것을 준다 — 거기서는 실제
    공개 주소로 나가면 안 되고 Preview 페이지만 바뀌어야 한다.
  */

  handle.onNavigate =
    typeof opts.onNavigate === "function" ? opts.onNavigate : null;


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
  prepareSandboxSkin,
  mountSandboxSkinFrame,
  renderSandboxSkinPage,
  sendSandboxPostBody,
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
