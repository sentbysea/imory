/* =========================================================
   HOME CANVAS — 프레임 안 편집 runtime (HOME-CANVAS-SELECT-1B-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §15
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ── 이 파일이 하는 것 / 하지 않는 것 ────────────────────
   한다:   부모가 **확정해 내려 준** 캔버스 선택 ID 하나를 받아,
           그 요소가 지금 이 문서의 DOM 에 실제로 있는지 다시 확인한
           뒤, Moveable 로 **회전을 따라가는 테두리 하나**를 그린다.

   안 한다: 이동 · 크기 · 회전 조작 · 손잡이 · Selecto · 다중 선택 ·
           lasso · Canvas JSON 수정 · Undo · 부모에게 좌표 올려보내기.
           이번 단계의 Moveable 은 **표시 전용**이고, 이 파일은 스킨
           DOM 에도 Canvas 데이터에도 한 글자도 쓰지 않는다.

   ── 왜 프레임 안에서 도는가 ─────────────────────────────
   Canvas DOM 이 있는 문서가 둘이다.

     native  studio/preview/preview-frame.html
     sandbox skin/sandbox/frame.html   (별도 origin · cross-origin)

   sandbox 쪽 DOM 은 부모가 아예 볼 수 없다. 그리고 native 쪽도,
   요소가 rAF 로 움직이거나 늦게 온 이미지로 자리가 바뀌면 부모가
   그리는 테두리는 한 프레임씩 늦는다. 그래서 **선택의 주인은 부모
   (Studio)**, **그리는 실행자는 프레임**으로 나눈다 — 기존 sandbox
   Inspector 테두리가 이미 쓰는 경계와 같다.

   부모는 ID 를 내려 줄 뿐 무엇을 그릴지 정하지 않고, 프레임은
   받은 ID 를 **자기 DOM 에서 다시 확인**하기 전에는 아무 것도
   그리지 않는다. 없는 ID 를 다른 요소로 바꿔 주지 않는다.

   ── 왜 두 문서가 같은 파일을 읽는가 ─────────────────────
   같은 기능을 두 벌로 두면 한쪽만 고쳐지는 날이 온다. 그래서
   실행 코드는 이 파일 하나이고, 두 문서는 **연결만** 다르다:

     native  studio/preview/preview-bridge.js   가 import() 한다
     sandbox skin/sandbox/skin-sandbox-frame.js 가 import() 한다

   ── 왜 정적 <script> 가 아니라 동적 import 인가 ─────────
   skin/sandbox/frame.html 은 **공개 화면**이기도 하다. 거기에 이
   파일을 정적으로 걸면 캔버스를 편집하지 않는 모든 방문자가 이
   파일을 받는다. 그래서 두 문서 다 "첫 Canvas 요소가 실제로
   골라졌을 때" 처음 부른다 — 공개 비용이 0 이다(VENDOR-1 이
   UMD 에 대해 세운 것과 같은 원칙, 계약 §13).

   그 동적 import 주소에는 부르는 쪽이 `?v=APP_BUILD_VERSION` 을
   붙인다(CLAUDE.md §4). 이 파일은 **정적 import 가 하나도 없다** —
   그래서 어느 문서의 import map 에도 올릴 것이 없다.

   ── 모듈 상태는 문서마다 따로다 ─────────────────────────
   ES 모듈 인스턴스는 realm 마다 하나다. native 프레임과 sandbox
   프레임은 서로 다른 realm 이므로 아래 vendorLoaderPromise 도,
   controller 도 각자 자기 것을 갖는다 — 전역을 공유한다고 가정하지
   않는다.
========================================================== */


/* 렌더러가 붙이는 이름과 같다(skin/skin-home-canvas-render.js).
   "그 id 를 가진 **캔버스 요소**가 지금 이 DOM 에 있는가"를 묻는
   선택자가 이 둘의 조합이다 — 평범한 스킨 요소는 앞 속성이 없어
   걸리지 않는다. */
const CANVAS_ELEMENT_ATTR = "data-imory-canvas-element";

const CANVAS_EDIT_ID_ATTR = "data-imory-edit-id";

/* skin/skin-home-canvas.js SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN 과
   같은 규칙. 이 값이 querySelector 의 문자열이 되므로 관문을 겹친다. */
const CANVAS_ELEMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;


/* VENDOR-1 의 지연 로더. **이 한 파일**만 부른다 — Moveable ·
   Selecto UMD 의 주소는 그 파일이 갖는다(여기에 복사해 적지
   않는다). sandbox origin 에서는 이 경로 하나가 allowlist 에
   올라가 있어야 한다(core/lib/skin-sandbox-server.js). */
const VENDOR_LOADER_PATH = "/studio/studio-home-canvas-vendor.js";


/* 문서 하나당 한 번. 실패한 Promise 는 남기지 않는다 — 네트워크가
   한 번 끊겼다고 그 문서에서 영영 다시 시도할 수 없게 만들지
   않는다(vendor 로더와 같은 규칙). */
let vendorLoaderPromise = null;


/* 값은 여기에 적지 않고 build-version.js 의 전역에서 읽는다
   (CLAUDE.md §4). 두 프레임 문서 모두 그 파일을 먼저 받는다. */
function versionedUrl(path, win) {

  const version =
    (win && typeof win.APP_BUILD_VERSION === "string") ? win.APP_BUILD_VERSION : "";

  return version
    ? `${path}?v=${encodeURIComponent(version)}`
    : path;

}


/* =========================================================
   ensureCanvasEditorVendorLoader(doc)

   → Promise<ensureHomeCanvasEditorVendors>

   ★ 로더를 두 번 주입하지 않는다. studio/studio-home-canvas-vendor.js
     는 classic script 이고 최상위 const 를 선언하므로, 같은 문서에서
     두 번 실행되면 "already been declared" 로 통째로 죽는다.
========================================================== */

function ensureCanvasEditorVendorLoader(doc) {

  const win =
    doc.defaultView || window;


  if (typeof win.ensureHomeCanvasEditorVendors === "function") {
    return Promise.resolve(win.ensureHomeCanvasEditorVendors);
  }


  if (vendorLoaderPromise) {
    return vendorLoaderPromise;
  }


  const url =
    versionedUrl(VENDOR_LOADER_PATH, win);


  const loading =
    new Promise(
      (resolve, reject) => {

        const script =
          doc.createElement("script");

        script.src = url;
        script.async = false;

        script.addEventListener(
          "load",
          () => {

            /* 파일은 왔는데 전역이 없다 = 우리가 아는 그 파일이
               아니다(200 인 SPA fallback HTML 을 성공으로 보지 않는
               것과 같은 이유). */
            if (typeof win.ensureHomeCanvasEditorVendors !== "function") {

              reject(
                new Error(
                  `HOME Canvas 편집 로더 실패: ${VENDOR_LOADER_PATH} ` +
                  "(응답은 받았지만 ensureHomeCanvasEditorVendors 가 없다)"
                )
              );

              return;

            }

            resolve(win.ensureHomeCanvasEditorVendors);

          }
        );

        script.addEventListener(
          "error",
          () => {

            reject(
              new Error(`HOME Canvas 편집 로더 실패: ${url} 를 받지 못했다`)
            );

          }
        );

        doc.head.appendChild(script);

      }
    );


  vendorLoaderPromise = loading;

  loading.catch(
    () => {

      if (vendorLoaderPromise === loading) {
        vendorLoaderPromise = null;
      }

    }
  );


  return loading;

}


/* =========================================================
   표시 전용 Moveable 설정 — 이번 단계가 켜는 것은 테두리뿐

   ★ 조작 able 을 **전부** 끈다.

   그래서 이 Moveable 은 target 에 pointer 리스너를 하나도 달지
   않는다 — 0.53.0 의 _updateEvents() 는 "dragStart 를 가진 able 이
   하나도 없으면" targetGesto 를 만들지 않고 이미 있으면 떼어 낸다.
   기존 Select 의 pointerdown 선택(skin/sandbox/skin-sandbox-inspect.js ·
   studio/preview/preview-inspect-direct.js)이 그대로 산다.

   ★ renderDirections: [] 는 손잡이(모서리 · 변)를 만들지 않는다.
     hideDefaultLines 는 **끄지 않는다** — 그 네 줄이 우리가 원하는
     "회전을 따라가는 테두리"다(내부 state.renderLines 는 요소의
     네 꼭짓점 pos1~pos4 에서 나오므로 축에 평행한 상자가 아니다).

   ★ cspNonce 는 공식 옵션이다. 전역 createElement 를 가로채지도,
     style 태그를 사후에 훑지도, CSP 를 넓히지도 않는다. 0.53.0 에서
     **작동하지만 deprecated** 라는 것이 VENDOR-1 의 판정이고, 그래서
     버전을 고정해 두었다(계약 §13).
========================================================== */

function displayOnlyMoveableOptions(target, nonce) {

  return {

    target: target,

    /* 조작 — 전부 끈다 */
    draggable: false,
    resizable: false,
    scalable: false,
    rotatable: false,
    warpable: false,
    pinchable: false,
    clippable: false,
    roundable: false,
    snappable: false,
    edgeDraggable: false,
    dragArea: false,
    passDragArea: false,

    /* 손잡이와 기준점 표시 */
    renderDirections: [],
    origin: false,
    hideDefaultLines: false,

    /* 입력에 끼어들지 않는다 */
    checkInput: false,
    preventDefault: false,
    preventClickDefault: false,
    preventClickEventOnDrag: false,

    /* 따라가기는 아래 rAF 한 곳이 맡는다 — 관측기를 두 벌 두지
       않는다(어느 것이 갱신했는지 추적할 수 없게 된다) */
    useResizeObserver: false,
    useMutationObserver: false,

    zoom: 1,

    cspNonce: typeof nonce === "string" ? nonce : ""

  };

}


/* =========================================================
   createHomeCanvasSelectionFrame(options) -> controller

   options = {
     doc            : Document
     getRoot        : () => Element|null   렌더 컨테이너
     getNonce       : () => string         이 문서의 CSP nonce
     onActiveChange : (active, editId) => void
   }

   controller = {
     apply(payload)   부모가 확정한 선택
     onRender()       다시 그렸을 때(target DOM 재생성)
     isActive()
     debugState()     진단용 — 이 realm 안에서만 읽힌다
     dispose()
   }

   payload = { active, ids, primaryId, generation }
========================================================== */

export function createHomeCanvasSelectionFrame(options) {

  const opts =
    options || {};

  const doc =
    opts.doc || document;

  const win =
    doc.defaultView || window;


  const state = {

    disposed: false,

    /* Moveable — 이 프레임에 **최대 하나**다 */
    moveable: null,
    ctor: null,

    /* 지금 틀이 붙어 있는 요소의 식별자 */
    targetId: null,

    /* 부모가 매긴 선택 순번. 이보다 낮은 번호의 메시지는 이미
       지나간 선택이다(늦게 도착한 것). */
    generation: -1,

    /* 마지막으로 받은 payload — 재렌더 뒤 되살릴 때 쓴다 */
    lastPayload: null,

    /* vendor 를 기다리는 중인 요청의 순번. 늦게 도착한 vendor 가
       이미 갈린 선택에 틀을 붙이지 않게 한다. */
    pendingGeneration: -1,

    /* onActiveChange 로 마지막에 알린 값 */
    reported: false,

    /* 실패를 한 번만 적는다(중복 토스트 금지). 다시 시도하는 것
       자체는 막지 않는다 — 로더가 실패한 Promise 를 버리므로
       다음 선택에서 정상적으로 재시도된다. */
    loggedFailure: false,

    rafId: 0,
    signature: ""

  };


  function renderRoot() {

    const el =
      (typeof opts.getRoot === "function") ? opts.getRoot() : null;

    return el || doc.body;

  }


  function frameNonce() {

    const value =
      (typeof opts.getNonce === "function") ? opts.getNonce() : "";

    return typeof value === "string" ? value : "";

  }


  /*
    elementFor(id)

    ★ 부모의 판정을 믿고 그리지 않는다.

    부모는 draft 의 Canvas 데이터에서 "그 id 가 있고 hidden 도
    locked 도 아니다"를 본다(studio/inspector/studio-canvas-selection.js
    studioCanvasSelectableElement). 여기서 보는 것은 **다른 것**이다 —
    "그 id 를 가진 캔버스 요소가 **지금 이 화면에** 실제로 그려져
    있는가". 둘 다 통과해야 틀이 붙는다.

    못 찾으면 null 이다. 비슷한 다른 요소로 바꿔 주지 않는다.
  */
  function elementFor(id) {

    if (typeof id !== "string" || !CANVAS_ELEMENT_ID_PATTERN.test(id)) {
      return null;
    }

    const container =
      renderRoot();

    if (!container || typeof container.querySelector !== "function") {
      return null;
    }

    const el =
      container.querySelector(
        `[${CANVAS_ELEMENT_ATTR}][${CANVAS_EDIT_ID_ATTR}="${id}"]`
      );

    return (el && el.isConnected) ? el : null;

  }


  function report(active) {

    const next =
      !!active;

    if (state.reported === next) {
      return;
    }

    state.reported = next;

    if (typeof opts.onActiveChange === "function") {

      try {
        opts.onActiveChange(next, next ? state.targetId : null);
      }
      catch (err) {
        /* 알림이 실패해도 틀은 그대로 둔다 */
      }

    }

  }


  /*
    실패 — 선택 자체는 부모가 그대로 갖고 있고, 화면에는 이 라운드
    이전의 축에 평행한 테두리가 남는다(부모 overlay · 프레임 안
    Inspector 테두리). 일반 Inspector 선택으로 바꾸지 않는다.
  */
  function fail(err) {

    if (!state.loggedFailure) {

      state.loggedFailure = true;

      console.warn(
        "[home-canvas-editor] 회전 선택 틀을 만들지 못했습니다 — " +
        "기존 테두리로 표시합니다.",
        err
      );

    }

    report(false);

  }


  /* =========================================================
     따라가기 — rAF 한 곳

     ResizeObserver 도 MutationObserver 도 켜지 않는다. 재는 값
     하나(요소의 사각형 + transform)가 바뀌었을 때만 updateRect()
     를 부른다. 스크롤 · 부모 scale · 늦게 온 이미지 · 글꼴 교체 ·
     `height:"auto"` 의 재조판이 전부 이 한 값에 나타난다.

     선택이 없으면 돌지 않는다.
  ========================================================== */

  function signatureOf(el) {

    const box =
      el.getBoundingClientRect();

    const transform =
      win.getComputedStyle(el).transform;

    return [
      Math.round(box.left * 100),
      Math.round(box.top * 100),
      Math.round(box.width * 100),
      Math.round(box.height * 100),
      transform
    ].join("|");

  }


  function tick() {

    state.rafId = 0;

    if (state.disposed || !state.moveable || !state.targetId) {
      return;
    }

    const el =
      elementFor(state.targetId);

    if (!el) {

      /* 재렌더 · 삭제로 그 요소가 사라졌다 — 조용히 걷는다 */
      detach();

      return;

    }

    if (state.moveable.target !== el) {

      /* 같은 id 인데 DOM 이 새로 만들어졌다(재렌더) */
      state.moveable.target = el;
      state.moveable.updateRect();
      state.signature = signatureOf(el);

    }
    else {

      const next =
        signatureOf(el);

      if (next !== state.signature) {
        state.signature = next;
        state.moveable.updateRect();
      }

    }

    state.rafId =
      win.requestAnimationFrame(tick);

  }


  function startFollow() {

    if (state.rafId || state.disposed) {
      return;
    }

    state.rafId =
      win.requestAnimationFrame(tick);

  }


  function stopFollow() {

    if (!state.rafId) {
      return;
    }

    win.cancelAnimationFrame(state.rafId);

    state.rafId = 0;

  }


  /* =========================================================
     붙이기 / 걷기

     ★ 인스턴스는 프레임당 최대 하나다. 다른 요소로 옮길 때는
       **만들지 않고 target 만 갱신**한다(§8).
  ========================================================== */

  function attach(el) {

    if (!state.ctor) {
      return false;
    }

    try {

      if (!state.moveable) {

        state.moveable =
          new state.ctor(doc.body, displayOnlyMoveableOptions(el, frameNonce()));

        /*
          ★ 테두리가 클릭을 삼키지 않게 한다.

          control box 자체는 1×1 이지만 네 줄(.moveable-line)은 요소
          외곽 위에 놓인다. 조작 able 이 전부 꺼져 있어 저 줄들에
          리스너는 없지만, pointer 대상이기는 하다 — 그대로 두면
          요소의 테두리를 정확히 누른 클릭이 스킨 DOM 에 닿지 않아
          "가끔 선택이 안 된다"가 된다.

          CSSOM 으로 쓰는 인라인 값은 CSP 의 style-src 검사를 받지
          않는다(검사 대상은 마크업의 style **속성**이다). Moveable
          자신도 같은 방식으로 control box 에 좌표를 쓴다.
        */
        const box =
          (typeof state.moveable.getControlBoxElement === "function")
            ? state.moveable.getControlBoxElement()
            : null;

        if (box) {

          box.style.pointerEvents = "none";

          /* 테스트와 진단이 "누구 것인가"를 읽는다 */
          box.setAttribute("data-imory-canvas-frame", "1");

        }

      }
      else if (state.moveable.target !== el) {

        state.moveable.target = el;
        state.moveable.updateRect();

      }
      else {

        state.moveable.updateRect();

      }

    }
    catch (err) {

      fail(err);

      return false;

    }

    state.signature =
      signatureOf(el);

    report(true);

    startFollow();

    return true;

  }


  /*
    걷기 — 인스턴스는 남기고 target 만 푼다.

    Moveable 0.53.0 은 target 이 없으면 control box 를
    `display:none` 으로 렌더한다(render() 의 display 판정). 그래서
    인스턴스를 없앴다 만들었다 하지 않아도 화면에서 확실히 사라지고,
    다시 고를 때 요청도 생성도 새로 하지 않는다.
  */
  function detach() {

    stopFollow();

    state.targetId = null;
    state.signature = "";

    if (state.moveable) {

      try {
        state.moveable.target = null;
        state.moveable.updateRect();
      }
      catch (err) {
        /* 이미 무너진 인스턴스다 — 아래에서 알림만 맞춘다 */
      }

    }

    report(false);

  }


  /* =========================================================
     apply(payload) — 부모가 확정한 선택

     ★ vendor 는 여기서 **처음** 불린다. 그것도 위 세 관문
       (active · primaryId · 지금 DOM 에 그 캔버스 요소가 있다)을
       전부 지난 뒤에만이다. 그래서

         공개 HOME · 공개 sandbox HOME · Studio 를 열기만 한 상태 ·
         Select 모드만 켠 상태 · 일반 template 요소 선택 ·
         Canvas 가 없는 스킨

       은 전부 요청 0 이다 — 이 controller 가 아예 만들어지지 않거나,
       만들어져도 이 줄에 닿지 않는다.
  ========================================================== */

  function apply(payload) {

    if (state.disposed) {
      return false;
    }


    const value =
      (payload && typeof payload === "object") ? payload : null;


    const generation =
      (value && Number.isInteger(value.generation)) ? value.generation : 0;

    /* 이미 지나간 선택의 메시지다(늦게 도착) */
    if (generation < state.generation) {
      return false;
    }

    state.generation = generation;

    state.lastPayload = value;


    const wanted =
      (value && value.active === true && typeof value.primaryId === "string")
        ? value.primaryId
        : null;


    if (!wanted) {
      detach();
      return false;
    }


    const el =
      elementFor(wanted);

    if (!el) {

      /* 부모가 가리킨 요소가 이 화면에 없다 — 아무것도 그리지
         않는다(다른 요소로 대체하지 않는다) */
      detach();

      return false;

    }


    state.targetId = wanted;


    if (state.ctor) {
      return attach(el);
    }


    /* vendor 를 아직 받지 않았다 — 이 문서에서 처음이다 */

    state.pendingGeneration = generation;

    ensureCanvasEditorVendorLoader(doc)
      .then((ensure) => ensure())
      .then(
        (vendors) => {

          if (state.disposed) {
            return;
          }

          /* 기다리는 사이에 선택이 갈렸다 */
          if (state.pendingGeneration !== state.generation) {
            return;
          }

          if (!vendors || typeof vendors.Moveable !== "function") {
            fail(new Error("Moveable 생성자를 받지 못했습니다"));
            return;
          }

          state.ctor = vendors.Moveable;

          /* ★ Selecto 는 여기서 만들지 않는다. 로더가 두 UMD 를
             한 벌로 돌려주므로 파일은 함께 받지만, 이번 단계에서
             생성자를 부르는 곳은 없다(§13). */

          const current =
            state.targetId ? elementFor(state.targetId) : null;

          if (!current) {
            detach();
            return;
          }

          attach(current);

        }
      )
      .catch(
        (err) => {

          if (state.disposed) {
            return;
          }

          fail(err);

        }
      );

    return false;

  }


  /*
    onRender() — 이 문서가 화면을 다시 그렸다.

    같은 id 의 요소가 새 DOM 으로 다시 만들어졌을 수 있고, 아예
    사라졌을 수도 있다(캔버스 제거 · HOME 이탈 · 요소 삭제).
    마지막 payload 를 같은 관문에 한 번 더 태운다 — generation 은
    그대로이므로 위 "늦게 도착" 판정에 걸리지 않는다.
  */
  function onRender() {

    if (state.disposed) {
      return;
    }

    if (!state.lastPayload) {
      detach();
      return;
    }

    apply(state.lastPayload);

  }


  function dispose() {

    state.disposed = true;

    stopFollow();

    if (state.moveable) {

      try {
        state.moveable.destroy();
      }
      catch (err) {
        /* 이미 사라진 문서일 수 있다 */
      }

      state.moveable = null;

    }

    state.targetId = null;
    state.lastPayload = null;

    report(false);

  }


  return {

    apply: apply,
    onRender: onRender,
    dispose: dispose,

    isActive: function () {
      return !!(state.moveable && state.targetId);
    },

    /* 진단용 — 같은 realm 안에서만 읽힌다. 이 창구로 선택을 바꿀
       수는 없다(읽기 전용). */
    debugState: function () {

      const box =
        (state.moveable && typeof state.moveable.getControlBoxElement === "function")
          ? state.moveable.getControlBoxElement()
          : null;

      let rect = null;

      if (state.moveable && state.targetId) {

        try {

          const value =
            state.moveable.getRect();

          rect = {
            left: value.left,
            top: value.top,
            width: value.width,
            height: value.height,
            rotation: value.rotation,
            pos1: value.pos1,
            pos2: value.pos2,
            pos3: value.pos3,
            pos4: value.pos4
          };

        }
        catch (err) {
          rect = null;
        }

      }

      return {
        targetId: state.targetId,
        generation: state.generation,
        hasInstance: !!state.moveable,
        instances: doc.querySelectorAll(".moveable-control-box").length,
        selectoInstances: doc.querySelectorAll(".selecto-selection").length,
        controlBoxDisplay: box ? box.style.display : null,
        lines: box ? box.querySelectorAll(".moveable-line").length : 0,
        rect: rect
      };

    }

  };

}
