/* =========================================================
   HOME CANVAS — 프레임 안 편집 runtime
   (HOME-CANVAS-SELECT-1B-1 · 1B-2)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §15 · §16
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ── 이 파일이 하는 것 / 하지 않는 것 ────────────────────
   한다:   1) 부모가 **확정해 내려 준** 캔버스 선택을 받아, 그 요소들이
             지금 이 문서의 DOM 에 실제로 있는지 다시 확인한 뒤
             Moveable 로 테두리를 그린다(하나면 회전을 따라가는 틀,
             여럿이면 그룹 틀 하나).
           2) Selecto 로 끌어서 고른 결과와 Shift 클릭을 **제안**으로
             올려보낸다.

   안 한다: 이동 · 크기 · 회전 조작 · 손잡이 · Canvas JSON 수정 ·
           Undo · **최종 선택의 확정**. Moveable 은 여전히 **표시
           전용**이고, 이 파일은 스킨 DOM 에도 Canvas 데이터에도 한
           글자도 쓰지 않는다.

   ── 누가 정하는가 ───────────────────────────────────────
   프레임은 "이것들이 잡혔다"까지만 말한다. 무엇이 최종 선택인지 ·
   어떤 순서인지 · 무엇이 primary 인지는 **언제나 부모(Studio)**가
   지금 draft 를 보고 정하고, 승인한 결과를 다시 내려 준다
   (studio/inspector/studio-canvas-selection.js
    proposeStudioCanvasSelection).

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
   파일을 받는다. 그래서 두 문서 다 **캔버스 편집이 실제로 켜졌을
   때** 처음 부른다 — 공개 비용이 0 이다(VENDOR-1 이 UMD 에 대해
   세운 것과 같은 원칙, 계약 §13).

   ★ 그 "켜졌을 때"가 1B-2 에서 한 칸 앞으로 왔다. 1B-1 에서는 첫
     요소를 고른 순간이었지만, lasso 는 **아무것도 고르지 않은
     상태에서** 시작돼야 하므로 이제 "Canvas 가 있는 HOME 에서
     Select 모드를 켠 순간"이다(계약 §16-2). Canvas 가 없는 스킨과
     공개 화면은 여전히 요청 0 이다.

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

/* 도화지(표시 위치) 자신 — lasso 를 시작할 수 있는 범위다(§3) */
const CANVAS_ROOT_ATTR = "data-imory-canvas-root";

const CANVAS_LOCKED_ATTR = "data-imory-canvas-locked";

/* skin/skin-home-canvas.js SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN 과
   같은 규칙. 이 값이 querySelector 의 문자열이 되므로 관문을 겹친다. */
const CANVAS_ELEMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* Shift + 클릭이 "끌기"가 아니라고 보는 움직임의 상한(px). 이보다
   더 움직였으면 그 입력은 Shift + lasso 다. */
const SHIFT_CLICK_SLOP = 5;

/* 규칙표를 못박을 때 쓰는 수. 한 화면에 이만큼의 컴포넌트가 동시에
   붙었다 떨어지는 일은 없다(위 pinEditorStyleSheets). */
const STYLE_PIN_COUNT = 1000000;


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
   HOME-CANVAS-SELECT-1B-2 — Selecto 설정

   ★ 1.26.3 의 실제 번들을 읽고 정한 값들이다(최신 문서가 아니라).

   selectByClick: false
     기본값이 true 다. 그대로 두면 Selecto 가 **평범한 클릭까지**
     자기 선택으로 처리해 SELECT-1A 의 단일 클릭 경로와 주인이
     둘이 된다. 클릭은 지금까지처럼 프레임 Inspector 가 맡는다 —
     여기는 **끌었을 때만** 일한다.

   hitRate: 1
     번들의 hitTest 는 `round(교집합 넓이 / 대상 넓이 * 100) >=
     hitRate` 다(단위 없는 숫자는 퍼센트). 그래서 1 이 "1% 이상
     겹치면 선택"이다.

   selectFromInside: true · preventDragFromInside: false
     기본값은 preventDragFromInside:true 라, 요소 **위에서** 시작한
     드래그가 lasso 가 되지 않는다. 실제 스킨의 HOME 은 도화지
     전체를 덮는 배경 사진을 흔히 쓰므로 그대로 두면 lasso 를 시작할
     빈 자리가 없다. ★ 요소 본체 끌기(이동)가 들어오는
     HOME-CANVAS-TRANSFORM-1 에서 이 둘을 다시 정해야 한다 —
     그때는 "위에서 끌면 이동, 빈 자리에서 끌면 lasso"를 갈라야 한다.

   rootContainer 를 주지 않는다
     번들은 rootContainer 가 있으면 선택 사각형을 `position:absolute`
     로, 없으면 `fixed` 로 놓는다. fixed 가 뷰포트 좌표 그대로라
     프레임 스크롤·부모 scale 에서 계산이 한 겹 줄어든다.

   toggleContinueSelect 를 주지 않는다
     Shift 의 뜻(더하기/빼기)은 **부모**가 정한다. Selecto 가 자기
     안에서 합치면 부모의 canonical 상태와 두 벌이 된다. 여기서는
     "이번 사각형이 잡은 것"만 올리고, 합치는 것은 부모의 몫이다.
========================================================== */

function lassoSelectoOptions(doc, getSelectable, condition, nonce) {

  return {

    /* 선택 사각형이 붙는 곳 — 스킨 DOM 이 아니라 body 다
       (Moveable control box 와 같은 자리) */
    container: doc.body,

    /*
      끌기를 듣는 곳.

      ★ 도화지 요소를 직접 주지 않는다. 재렌더마다 도화지는 **새
        노드**가 되므로 그때마다 Selecto 를 다시 만들어야 한다.
        대신 늘 같은 body 에서 듣고, "도화지 안에서 시작했는가"는
        아래 dragCondition 이 시작점 좌표로 판정한다 — 결과는 같고
        인스턴스는 하나로 유지된다(§2).

      ★ 기존 Inspector 와 부딪히지 않는다: 저쪽은 document capture
        에서 **pointerdown** 의 전파를 끊고, Selecto 의 gesto 는
        **mousedown / touchstart** 를 듣는다(번들 실측). 서로 다른
        이벤트라 한쪽이 다른 쪽을 지우지 않는다.
    */
    dragContainer: doc.body,

    /* 함수를 넣을 수 있다(번들의 getSelectableElements 가
       isFunction 을 먼저 본다) — 매 드래그마다 지금 화면의
       고를 수 있는 캔버스 요소만 새로 모은다. */
    selectableTargets: [getSelectable],

    selectByClick: false,
    selectFromInside: true,
    preventDragFromInside: false,
    clickBySelectEnd: false,
    continueSelect: false,

    hitRate: 1,
    ratio: 0,

    /* 입력 요소 위에서의 드래그를 가로채지 않는다 */
    checkInput: true,

    /* 기본 동작을 막지 않는다 — 스크롤과 링크는 프레임의 다른
       규칙이 정한다(Select 모드에서 링크는 이미 Inspector 가
       막는다) */
    preventDefault: false,

    /*
      ★ 끈 뒤에 따라오는 click 은 삼킨다.

      native Preview 의 Inspector 는 **click** 으로 고른다
      (studio/preview/preview-bridge.js 의 document capture). 끌기가
      끝나면 브라우저가 click 을 하나 만들고, 그 자리는 보통 "빈
      곳"이라 Inspector 가 **방금 만든 캔버스 선택을 지운다**
      (2026-09-21 이 라운드의 e2e 가 실제로 잡았다 —
       routeStudioInspectSelectMessage → setStudioInspectorSelection).

      gesto 가 그 한 번의 click 을 window capture 에서 막아 준다.
      **끌었을 때만** 막는다 — 끌지 않은 평범한 클릭에서는
      onDragEnd 가 곧바로 그 리스너를 떼므로(번들 실측), SELECT-1A
      의 단일 클릭 선택은 그대로 산다.
    */
    preventClickEventOnDrag: true,
    preventClickEventOnDragStart: false,
    preventRightClick: true,

    dragCondition: condition,

    cspNonce: typeof nonce === "string" ? nonce : ""

  };

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

    /*
      ★ 그룹에서는 dragArea 를 끄지 않는다.

      단일 target 의 기본값은 false 이고 우리도 그것을 원한다.
      그런데 MoveableGroup 의 기본값은 **true** 이고, 그것을 false 로
      덮으면 그룹이 mount 중에 죽는다(0.53.0 실측: componentDidMount
      → _updateEvents → updateRect 에서 null.style). 그룹에는 붙일
      단일 target 이 없어 그 영역 요소가 곧 기준점이기 때문이다.

      그래도 클릭을 삼키지는 않는다 — `.moveable-area` 는 control box
      의 자식이고, 우리가 그 상자에 `pointer-events: none` 을 주므로
      상속받는다(그 속성은 상속된다).
    */
    dragArea: Array.isArray(target) && target.length > 1,

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

    /* Moveable · Selecto — 이 프레임에 **각각 최대 하나**다 */
    moveable: null,
    selecto: null,
    ctor: null,
    selectoCtor: null,

    /* 캔버스 편집이 켜져 있는가(선택이 없어도 참일 수 있다 —
       lasso 는 빈 상태에서 시작한다) */
    editing: false,

    /* 지금 틀이 붙어 있는 요소들. 부모가 승인한 canonical 순서
       그대로다 — 프레임이 다시 정렬하지 않는다. */
    targetIds: [],

    /* 부모가 매긴 선택 순번. 이보다 낮은 번호의 메시지는 이미
       지나간 선택이다(늦게 도착한 것). */
    generation: -1,

    /* 마지막으로 받은 payload — 재렌더 뒤 되살릴 때 쓴다 */
    lastPayload: null,

    /* onActiveChange 로 마지막에 알린 값 */
    reported: false,

    /* 기다리는 중인 vendor 요청이 있는가(중복 호출 방지) */
    vendorPending: false,

    /* 이 프레임에서 lasso 를 몇 번 했는가 — 진단용 */
    lassoCount: 0,

    /* 마지막 lasso 가 시작된 자리(도화지 안이었는가) */
    dragAllowed: false,

    /* 진단 — 마지막 드래그가 어디서 걸렸는가 · 몇 개를 잡았는가 */
    shiftPress: null,
    promoteAfter: 0,
    lastGate: "",
    lastProposed: null,
    lastProposedMode: "",
    lastHit: -1,
    lastSelectable: -1,

    listeners: [],

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


  /* =========================================================
     HOME-CANVAS-SELECT-1B-2 — lasso 가 고를 수 있는 요소

     ★ 정확히 `[data-imory-canvas-element]` 만이다(§3).

     그래서 다음은 **애초에 후보가 아니다**: template 요소 ·
     사용자 JS 가 만든 꽃잎 · 파티클 · 효과 레이어 · Moveable 의
     control box · Selecto 자신의 사각형. 그것들에는 이 속성이
     없고, 이 속성은 저장 경계의 화이트리스트에 없어서 스킨 HTML
     에서 올 수도 없다(skin/skin-home-canvas-render.js 머리말).

     여기서 **더** 빼는 것은 셋이다.

       hidden          상자가 없어 사각형을 잴 수 없다
       locked          사용자가 "건드리지 않겠다"고 표시한 것
       도화지 밖        지금 렌더 루트 안에 없는 노드(재렌더 잔재)
  ========================================================== */

  function canvasRoot() {

    const container =
      renderRoot();

    return (container && typeof container.querySelector === "function")
      ? container.querySelector(`[${CANVAS_ROOT_ATTR}]`)
      : null;

  }


  function selectableElements() {

    const root =
      canvasRoot();

    if (!root) {
      return [];
    }

    return Array.prototype.filter.call(
      root.querySelectorAll(`[${CANVAS_ELEMENT_ATTR}]`),
      (el) =>
        el.isConnected &&
        !el.hasAttribute("hidden") &&
        el.getAttribute(CANVAS_LOCKED_ATTR) !== "true" &&
        CANVAS_ELEMENT_ID_PATTERN.test(el.getAttribute(CANVAS_EDIT_ID_ATTR) || "")
    );

  }


  /* 지금 붙어 있는 요소들. 하나라도 사라졌으면 null 을 그 자리에
     둔다 — 호출자가 "전부 살아 있는가"를 한 번에 본다. */
  function targetElements() {

    return state.targetIds.map((id) => elementFor(id));

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
        opts.onActiveChange(next, next ? primaryId() : null);
      }
      catch (err) {
        /* 알림이 실패해도 틀은 그대로 둔다 */
      }

    }

  }


  /*
    primaryId()

    부모가 승인한 primary 다. 프레임이 스스로 고르지 않는다 —
    payload 의 primaryId 를 그대로 쓰고, 그것이 지금 목록에 없으면
    (있을 수 없지만) 첫 칸으로 떨어진다.
  */
  function primaryId() {

    const wanted =
      (state.lastPayload && typeof state.lastPayload.primaryId === "string")
        ? state.lastPayload.primaryId
        : null;

    if (wanted && state.targetIds.indexOf(wanted) !== -1) {
      return wanted;
    }

    return state.targetIds.length ? state.targetIds[0] : null;

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

  function signatureOf(elements) {

    return elements.map(
      (el) => {

        if (!el) {
          return "-";
        }

        const box =
          el.getBoundingClientRect();

        return [
          Math.round(box.left * 100),
          Math.round(box.top * 100),
          Math.round(box.width * 100),
          Math.round(box.height * 100),
          win.getComputedStyle(el).transform
        ].join(",");

      }
    ).join("|");

  }


  /*
    사용자 JS 가 요소를 움직여도(파티클 · 복합 모션) 이 한 값이
    바뀌므로 틀이 따라간다 — 막지 않는다(계약 §15-7-1).
  */
  function tick() {

    state.rafId = 0;

    if (state.promoteAfter > 0) {
      state.promoteAfter -= 1;
    }

    if (state.disposed || !state.moveable || !state.targetIds.length) {
      return;
    }

    const elements =
      targetElements();

    if (elements.some((el) => !el)) {

      /* 재렌더 · 삭제로 하나라도 사라졌다 — 마지막 payload 를 같은
         관문에 다시 태운다(살아 있는 것만 남는다) */
      apply(state.lastPayload);

      return;

    }

    const next =
      signatureOf(elements);

    if (next !== state.signature || !sameTargets(elements)) {
      state.signature = next;
      setMoveableTarget(elements);
    }

    state.rafId =
      win.requestAnimationFrame(tick);

  }


  /* Moveable 이 지금 들고 있는 것이 이 요소들 그대로인가 */
  function sameTargets(elements) {

    const current =
      (state.moveable && typeof state.moveable.getTargets === "function")
        ? state.moveable.getTargets()
        : [];

    if (!current || current.length !== elements.length) {
      return false;
    }

    return elements.every((el, i) => current[i] === el);

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

  /*
    ★ 테두리가 클릭을 삼키지 않게 한다.

    control box 자체는 1×1 이지만 네 줄(.moveable-line)은 요소 외곽
    위에 놓인다. 조작 able 이 전부 꺼져 있어 저 줄들에 리스너는
    없지만, pointer 대상이기는 하다 — 그대로 두면 요소의 테두리를
    정확히 누른 클릭이 스킨 DOM 에 닿지 않아 "가끔 선택이 안 된다"가
    된다.

    CSSOM 으로 쓰는 인라인 값은 CSP 의 style-src 검사를 받지 않는다
    (검사 대상은 마크업의 style **속성**이다). Moveable 자신도 같은
    방식으로 control box 에 좌표를 쓴다.

    ★ 단일 ↔ 그룹을 오갈 때 control box 요소가 **새로 만들어진다**
      (0.53.0 은 key 가 "single" 과 "group" 으로 갈린다 — 번들 실측).
      그래서 target 을 바꿀 때마다 다시 표시한다.
  */
  function markControlBox() {

    const box =
      (state.moveable && typeof state.moveable.getControlBoxElement === "function")
        ? state.moveable.getControlBoxElement()
        : null;

    if (!box) {
      return;
    }

    /* =====================================================
       ★ 앞서 표시해 둔 상자가 남아 있으면 걷는다.

       단일 ↔ 그룹 전환에서 control box 요소가 새로 만들어지는데,
       그때 **옛 요소가 문서에 남는 경우**가 있다(0.53.0 실측).
       그대로 두면 "인스턴스가 둘"로 보이고, 더 나쁘게는 옛 자리에
       테두리가 하나 더 남는다.

       우리가 붙인 표시만 걷고 화면에서 감춘다 — 라이브러리가 아직
       들고 있을지 모르는 요소를 DOM 에서 지우지는 않는다.
    ====================================================== */

    Array.prototype.forEach.call(
      doc.querySelectorAll('[data-imory-canvas-frame="1"]'),
      (stale) => {

        if (stale === box) {
          return;
        }

        stale.removeAttribute("data-imory-canvas-frame");
        stale.style.display = "none";

      }
    );

    box.style.pointerEvents = "none";

    box.setAttribute("data-imory-canvas-frame", "1");

  }


  /*
    setMoveableTarget(elements)

    0개  → 틀 없음(target null)
    1개  → SELECT-1B-1 의 회전을 따라가는 단일 틀
    2개~ → Moveable 그룹 틀 하나

    ★ 0.53.0 은 `target` 에 **배열**을 받으면 스스로 그룹으로 간다
      (번들의 render: 평탄화한 길이가 1보다 크면 MoveableGroup).
      그래서 우리가 그룹 클래스를 직접 고르지 않는다.

    ★ 그룹에서는 `dragArea` 를 켠 채로 둔다 — 끄면 그룹이 mount
      중에 죽는다(displayOnlyMoveableOptions 의 주석). 그 영역이
      클릭을 삼키지 않는 것은 control box 의 `pointer-events: none`
      이 상속되기 때문이다.
  */
  /*
    ensureMoveable(first)

    ★ 첫 생성은 **반드시 단일 target** 이다.

    Moveable 의 <style> 은 첫 mount 때 한 번 주입되는데, 그 첫
    mount 가 그룹이면 nonce 가 붙지 않아 sandbox 의 style-src 에
    막힌다(2026-09-21 실측: Selecto 의 style 은 통과하고 Moveable 의
    것만 `nonce` 속성 없이 `sheet === null`). 그래서 여러 개를 한
    번에 고른 경우에도 **첫 요소 하나로 세운 뒤** 곧바로 배열로
    바꾼다 — 그때는 이미 붙은 style 을 함께 쓴다.

    고른 것이 없으면 아예 만들지 않는다. 그릴 것이 없으니 만들
    이유도 없고, "인스턴스는 최대 하나"도 그대로 지켜진다.
  */
  /* =========================================================
     pinEditorStyleSheets()

     ★ nonce 가 붙은 채로 들어간 <style> 을 **지워지지 않게** 못박는다.

     Moveable · Selecto 가 함께 쓰는 styled 헬퍼는 같은 규칙표를
     `<style data-styled-id data-styled-count>` 하나로 공유하고,
     컴포넌트가 mount 할 때 count 를 올리고 unmount 할 때 내린다.
     **0 이 되면 그 요소를 DOM 에서 지운다.**

     그런데 단일 target ↔ 그룹 target 전환은 컴포넌트를 통째로
     갈아 끼운다. 그 사이에 count 가 0 을 찍으면 규칙표가 지워지고,
     곧바로 이어지는 그룹 쪽 주입이 **nonce 없이** 새로 만든다 —
     sandbox 의 `style-src` 가 그것을 막아 선택 틀이 통째로
     무너진다(2026-09-21 실측: `nonce` 속성 없음 · `sheet === null`).

     CSP 는 **삽입 시점에** 판정하므로 나중에 nonce 를 붙여도
     되살아나지 않는다. 그래서 되살리는 대신 **처음부터 지워지지
     않게** 한다 — 이미 nonce 를 달고 정상으로 들어간 그 요소의
     count 를 크게 올려 둔다.

     ★ CSP 를 넓히지 않는다. style 을 새로 만들지도, 나중에 주입하지도
       않는다. 우리가 만든 요소 하나의 수명을 늘릴 뿐이다.
  ========================================================== */

  /* style 주입은 effect 라 만든 **직후**에는 아직 없다 — 다음 두
     프레임에 걸쳐 한 번씩 확인한다. */
  function pinEditorStyleSheetsSoon() {

    win.requestAnimationFrame(() => {
      pinEditorStyleSheets();
      win.requestAnimationFrame(pinEditorStyleSheets);
    });

  }


  function pinEditorStyleSheets() {

    try {

      Array.prototype.forEach.call(
        doc.querySelectorAll("style[data-styled-id]"),
        (el) => {

          /* 정상으로 들어간 것만 — 이미 막힌 것을 못박아 봐야
             소용이 없다(sheet 가 null 이다) */
          if (!el.sheet || el.getAttribute("data-imory-canvas-pinned")) {
            return;
          }

          el.setAttribute("data-styled-count", String(STYLE_PIN_COUNT));
          el.setAttribute("data-imory-canvas-pinned", "1");

        }
      );

    }
    catch (err) {
      /* 못박지 못해도 단일 선택은 그대로 동작한다 */
    }

  }


  function ensureMoveable(first) {

    if (state.moveable || !state.ctor || state.disposed || !first) {
      return false;
    }

    try {

      state.moveable =
        new state.ctor(doc.body, displayOnlyMoveableOptions(first, frameNonce()));

      /*
        ★ 여기서 한 번 **flush** 한다.

        0.53.0 은 렌더를 미뤘다가 한꺼번에 한다(vanilla wrapper 가
        dragStart 에서 `$_timer && forceUpdate()` 를 하는 것과 같은
        사정이다). 그래서 만들자마자 같은 tick 에서 target 을 배열로
        바꾸면 **단일 mount 가 한 번도 일어나지 않고** 곧바로 그룹이
        mount 된다 — 그리고 그 경로의 첫 style 주입에는 nonce 가
        붙지 않는다(2026-09-21 sandbox 실측).

        먼저 단일로 한 번 그려 두면 style 이 nonce 와 함께 붙고,
        뒤에 그룹으로 바뀌어도 그 style 을 함께 쓴다.
      */
      if (typeof state.moveable.forceUpdate === "function") {
        state.moveable.forceUpdate();
      }

      markControlBox();

      pinEditorStyleSheetsSoon();

      return true;

    }
    catch (err) {

      state.moveable = null;

      fail(err);

      return false;

    }

  }


  function setMoveableTarget(elements) {

    try {

      const target =
        elements.length === 0
          ? null
          : (elements.length === 1 ? elements[0] : elements.slice());

      const created =
        ensureMoveable(elements[0] || null);

      if (!state.moveable) {

        /* 아직 고른 것이 없으면 인스턴스를 만들지 않는다 —
           그릴 것이 없으니 만들 이유도 없다 */
        return elements.length === 0;

      }

      /*
        ★ 방금 만들었고 여러 개를 골랐다면, 그룹 승격을 **다음
          프레임으로 미룬다.**

        0.53.0 은 렌더를 미뤘다가 한다. 만들자마자 같은 tick 에서
        target 을 배열로 바꾸면 단일 mount 가 한 번도 일어나지
        않고 곧바로 그룹이 mount 되는데, 그 경로의 첫 style 주입에는
        nonce 가 붙지 않아 sandbox 의 style-src 에 막힌다
        (2026-09-21 실측 — 단일로 먼저 그려지면 정상이다).

        미뤄도 화면은 한 프레임 안에 맞는다 — 바로 뒤의 따라가기
        루프(tick)가 target 이 다르다는 것을 보고 그때 그룹으로
        올린다.
      */
      if (created) {

        /* 두 프레임을 준다 — 0.53.0 의 style 주입은 preact 의
           effect 이고, 그것은 렌더 **뒤**에 따로 돈다. 한 프레임만
           기다리면 아직 안 돌았을 수 있다. */
        state.promoteAfter = 2;

      }

      if (state.promoteAfter > 0 && elements.length > 1) {

        markControlBox();

        return true;

      }

      /* ★ dragArea 는 target 이 바뀔 때마다 다시 정한다 — 단일과
         그룹의 요구가 다르다(위 주석). */
      state.moveable.dragArea =
        Array.isArray(target) && target.length > 1;

      state.moveable.target = target;
      state.moveable.updateRect();

      markControlBox();

    }
    catch (err) {

      fail(err);

      return false;

    }

    return true;

  }


  function attach(elements) {

    if (!state.ctor) {
      return false;
    }

    if (!setMoveableTarget(elements)) {
      return false;
    }

    state.signature =
      signatureOf(elements);

    syncSelectoSelection(elements);

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

    state.targetIds = [];
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

    syncSelectoSelection([]);

    report(false);

  }


  /* =========================================================
     HOME-CANVAS-SELECT-1B-2 — Selecto (lasso)

     ★ 프레임은 **제안만** 한다. 확정은 부모다.
  ========================================================== */

  function syncSelectoSelection(elements) {

    if (!state.selecto || typeof state.selecto.setSelectedTargets !== "function") {
      return;
    }

    try {
      state.selecto.setSelectedTargets(elements.filter(Boolean));
    }
    catch (err) {
      /* 내부 상태 동기화 실패는 화면에 영향이 없다 */
    }

  }


  function propose(ids, primary, mode) {

    if (typeof opts.onPropose !== "function") {
      return;
    }

    state.lastProposed = ids.slice();
    state.lastProposedMode = mode;

    try {

      opts.onPropose({
        ids: ids.slice(),
        primaryId: primary,
        mode: mode,
        generation: state.generation < 0 ? 0 : state.generation
      });

    }
    catch (err) {
      /* 제안이 실패해도 화면은 지금 상태 그대로다 */
    }

  }


  /*
    포인터 정책(§4)

    손가락으로는 lasso 를 시작하지 않는다 — 한 손가락 드래그가
    세로 스크롤인지 선택 상자인지 가를 방법이 없고, 가로채면 모바일
    Preview 가 스크롤되지 않는다. 모바일에서는 SELECT-1A 의 단일
    탭 선택이 그대로 남는다.

    ★ `(pointer: fine)` 만 믿지 않는다 — 터치와 마우스가 함께 있는
      기기에서 그 질의는 참이고, 그래도 그 순간의 입력은 손가락일
      수 있다. **실제 이벤트의 종류**를 먼저 본다.
  */
  function isCoarsePointerEvent(event) {

    if (!event) {
      return false;
    }

    if (typeof event.pointerType === "string") {
      return event.pointerType === "touch";
    }

    return typeof event.type === "string" && event.type.indexOf("touch") === 0;

  }


  /* 그 자리가 도화지 안인가 — 도화지 요소를 dragContainer 로 주지
     않는 대신 좌표로 판정한다(위 lassoSelectoOptions 주석) */
  function pointInsideCanvas(x, y) {

    const root =
      canvasRoot();

    if (!root || typeof x !== "number" || typeof y !== "number") {
      return false;
    }

    const box =
      root.getBoundingClientRect();

    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

  }


  /* 마지막 드래그가 어디서 걸렸는가 — 진단용 한 줄. 이 realm
     안에서만 읽힌다(debugState). */
  function gate(reason) {

    state.lastGate = reason;

    return reason === "ok";

  }


  function lassoDragCondition(event) {

    state.dragAllowed = false;

    if (state.disposed || !state.editing) {
      return gate("not-editing");
    }

    const input =
      event ? event.inputEvent : null;

    if (isCoarsePointerEvent(input)) {
      return gate("coarse-pointer");
    }

    /* 보조 버튼으로는 시작하지 않는다 */
    if (input && typeof input.button === "number" && input.button !== 0) {
      return gate("not-primary-button");
    }

    if (!pointInsideCanvas(event.clientX, event.clientY)) {
      return gate("outside-canvas");
    }

    /*
      ★ Moveable 의 control 요소에서 시작한 드래그는 Selecto 의
        것이 아니다.

      이번 단계에는 핸들이 없지만(전부 꺼 두었다), 조작이 들어오는
      HOME-CANVAS-TRANSFORM-1 에서 핸들을 잡고 끄는 순간 lasso 가
      같이 시작되면 둘이 싸운다. Spike 가 확인한 충돌 방지 계약을
      지금 넣어 둔다.
    */
    const target =
      input ? input.target : null;

    if (
      target &&
      state.moveable &&
      typeof state.moveable.isMoveableElement === "function" &&
      state.moveable.isMoveableElement(target)
    ) {
      return gate("moveable-control");
    }

    state.dragAllowed = true;

    return gate("ok");

  }


  function onLassoEnd(event) {

    if (state.disposed || !state.editing || !state.dragAllowed) {
      return;
    }

    /*
      끌지 않은 클릭이다 — 여기서는 아무 일도 하지 않는다. 단일
      클릭은 지금까지처럼 프레임 Inspector 가 맡는다(SELECT-1A).
      이것을 빼먹으면 평범한 클릭 하나가 "아무것도 못 잡은 lasso"가
      되어 방금 만든 선택을 지운다.
    */
    if (event && event.isClick) {
      state.lastGate = "click-not-drag";
      return;
    }

    state.lassoCount += 1;

    const hit =
      (event && Array.isArray(event.selected)) ? event.selected : [];

    state.lastHit = hit.length;
    state.lastSelectable = selectableElements().length;

    const ids =
      hit
        .map((el) => (el && el.getAttribute) ? el.getAttribute(CANVAS_EDIT_ID_ATTR) : null)
        .filter((id, index, list) =>
          typeof id === "string" &&
          CANVAS_ELEMENT_ID_PATTERN.test(id) &&
          list.indexOf(id) === index
        );

    const shift =
      !!(event && event.inputEvent && event.inputEvent.shiftKey);

    if (!ids.length) {

      /* Shift + 빈 lasso 는 기존 선택을 그대로 둔다(§5) */
      if (shift) {
        return;
      }

      propose([], undefined, "replace");

      return;

    }

    propose(ids, ids[ids.length - 1], shift ? "toggle" : "replace");

  }


  function ensureSelecto() {

    if (state.selecto || !state.selectoCtor || state.disposed) {
      return;
    }

    try {

      state.selecto =
        new state.selectoCtor(
          lassoSelectoOptions(doc, selectableElements, lassoDragCondition, frameNonce())
        );

      state.selecto.on("selectEnd", onLassoEnd);

      pinEditorStyleSheetsSoon();

      /* 지금 선택을 내부 상태에도 맞춰 둔다 */
      syncSelectoSelection(targetElements().filter(Boolean));

    }
    catch (err) {

      state.selecto = null;

      fail(err);

    }

  }


  function destroySelecto() {

    if (!state.selecto) {
      return;
    }

    try {
      state.selecto.destroy();
    }
    catch (err) {
      /* 이미 사라진 문서일 수 있다 */
    }

    state.selecto = null;

  }


  /* =========================================================
     Shift + 클릭 (§5)

     ★ 왜 window capture 인가

     두 프레임의 Inspector 는 **document capture** 에서 pointerdown
     을 받아 그 자리에서 전파를 끊는다(skin/sandbox/skin-sandbox-inspect.js ·
     studio/preview/preview-inspect-direct.js). capture 경로는
     Window → Document → … 이므로 window 에 건 capture 리스너가
     **먼저** 돈다. 거기서 전파를 끊으면 Inspector 의 "하나만 고르기"가
     아예 돌지 않는다.

     ★ 그래도 캔버스 요소 위의 Shift 클릭에서만 끊는다. 그 밖의
       모든 입력은 손대지 않고 지금까지의 경로로 흘려보낸다.
  ========================================================== */

  function shiftPickAt(event) {

    if (typeof win.pickInspectableAtPoint !== "function") {
      return null;
    }

    const container =
      renderRoot();

    if (!container || typeof doc.elementsFromPoint !== "function") {
      return null;
    }

    const stack =
      doc.elementsFromPoint(event.clientX, event.clientY);

    const found =
      win.pickInspectableAtPoint(
        stack,
        container,
        (el) => (el && el.getAttribute) ? el.getAttribute(CANVAS_EDIT_ID_ATTR) : null,
        win
      );

    const el =
      found ? found.primary : null;

    if (!el || !el.hasAttribute(CANVAS_ELEMENT_ATTR)) {
      return null;
    }

    const id =
      el.getAttribute(CANVAS_EDIT_ID_ATTR);

    return (typeof id === "string" && CANVAS_ELEMENT_ID_PATTERN.test(id)) ? id : null;

  }


  /*
    ★ 뒤따라오는 click 하나를 삼킨다.

    native Preview 의 Inspector 는 **click** 으로 고른다. pointerdown
    의 전파를 끊어도 click 은 따로 오므로, 그것까지 막지 않으면
    Shift 로 더한 선택이 곧바로 "하나만 고르기"로 덮인다. gesto 가
    끌기 뒤에 하는 것과 같은 방식이다(window capture · 한 번만).
  */
  function swallowNextClick() {

    const once =
      (clickEvent) => {

        win.removeEventListener("click", once, true);

        clickEvent.stopPropagation();

        if (typeof clickEvent.stopImmediatePropagation === "function") {
          clickEvent.stopImmediatePropagation();
        }

        clickEvent.preventDefault();

      };

    win.addEventListener("click", once, true);

    /* click 이 아예 오지 않는 경우(취소 · 포커스 이동)를 위해 한
       박자 뒤에 스스로 걷는다 — 다음 클릭을 잘못 삼키지 않게. */
    win.setTimeout(() => win.removeEventListener("click", once, true), 700);

  }


  function onShiftPointerDown(event) {

    state.shiftPress = null;

    if (state.disposed || !state.editing || !event.shiftKey) {
      return;
    }

    if (isCoarsePointerEvent(event)) {
      return;
    }

    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    /* 도화지 밖은 우리 일이 아니다 — 평범한 Inspector 선택이
       그대로 간다(소유권이 넘어가는 길). */
    if (!pointInsideCanvas(event.clientX, event.clientY)) {
      return;
    }

    /* =====================================================
       여기부터는 이 입력의 주인이 우리다.

       요소 위든 빈 자리든 **Shift + 도화지 안**은 캔버스 편집의
       입력이다. Inspector 의 "하나만 고르기"가 돌면 방금 더한
       선택이 곧바로 덮이고, 빈 자리에서는 통째로 지워진다
       (§5 "Shift + 빈 곳은 기존 선택 유지").
    ====================================================== */

    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    swallowNextClick();

    const id =
      shiftPickAt(event);

    if (!id) {
      return;
    }

    /*
      ★ 제안은 **누를 때가 아니라 뗄 때** 낸다.

      Shift 를 누른 채 끌면 그것은 Shift + lasso 다(§5). 누르는
      순간 토글해 버리면 lasso 결과와 두 번 겹쳐 엉뚱한 집합이
      된다. 그래서 여기서는 기억만 하고, 움직이지 않은 채 뗐을
      때만 토글한다.
    */
    state.shiftPress = {
      id: id,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId
    };

  }


  function onShiftPointerUp(event) {

    const press =
      state.shiftPress;

    state.shiftPress = null;

    if (!press || state.disposed || !state.editing) {
      return;
    }

    if (press.pointerId !== undefined && event.pointerId !== press.pointerId) {
      return;
    }

    /* 끌었으면 lasso 의 몫이다 */
    const moved =
      Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y);

    if (moved > SHIFT_CLICK_SLOP) {
      return;
    }

    /* 그 요소가 아직 거기 있는가 */
    if (!elementFor(press.id)) {
      return;
    }

    propose([press.id], press.id, "toggle");

  }


  function on(target, type, handler) {

    target.addEventListener(type, handler, true);

    state.listeners.push([target, type, handler]);

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


    /* =====================================================
       HOME-CANVAS-SELECT-1B-2 — 편집 모드가 관문이다

       1B-1 에서는 "첫 요소를 골랐을 때"가 vendor 를 켜는 자리였다.
       이제 lasso 가 **아무것도 고르지 않은 상태에서** 시작돼야
       하므로 관문이 한 칸 앞으로 온다: 부모가 editing:true 를
       내려보낸 순간이다.

       그 판정은 전부 부모가 한다 — Studio 안의 Preview · HOME ·
       유효하고 활성화된 home_canvas · 표식 하나 · Select 모드.
       Canvas 가 없는 스킨에서는 editing 이 참이 되지 않으므로
       거기서는 여전히 요청 0 이다.
    ====================================================== */

    const editing =
      !!(value && value.editing === true);


    state.editing = editing;


    if (!editing) {

      detach();

      destroySelecto();

      return false;

    }


    /* 부모가 승인한 목록 — 지금 화면에 실제로 있는 것만 남긴다.
       비슷한 다른 요소로 바꿔 주지 않는다(없으면 그냥 빠진다). */

    const wanted =
      (value && value.active === true && Array.isArray(value.ids))
        ? value.ids.filter((id) => !!elementFor(id))
        : [];


    state.targetIds = wanted;


    if (state.ctor) {

      ensureMoveable(selectableElements()[0] || null);
      ensureSelecto();

      if (!wanted.length) {
        detach();
        return false;
      }

      return attach(targetElements());

    }


    /* vendor 를 아직 받지 않았다 — 이 문서에서 처음이다 */

    if (state.vendorPending) {
      return false;
    }

    state.vendorPending = true;

    ensureCanvasEditorVendorLoader(doc)
      .then((ensure) => ensure())
      .then(
        (vendors) => {

          state.vendorPending = false;

          /* 기다리는 사이에 편집이 꺼졌다 */
          if (state.disposed || !state.editing) {
            return;
          }

          if (!vendors || typeof vendors.Moveable !== "function") {
            fail(new Error("Moveable 생성자를 받지 못했습니다"));
            return;
          }

          state.ctor = vendors.Moveable;

          state.selectoCtor =
            (typeof vendors.Selecto === "function") ? vendors.Selecto : null;

          ensureMoveable(selectableElements()[0] || null);
      ensureSelecto();

          /* 기다리는 사이에 선택이 갈렸을 수 있다 — 지금 값으로
             다시 판정한다(늦게 온 vendor 가 옛 선택을 그리지 않게) */
          const current =
            targetElements();

          if (!state.targetIds.length || current.some((el) => !el)) {
            detach();
            return;
          }

          attach(current);

        }
      )
      .catch(
        (err) => {

          state.vendorPending = false;

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

    destroySelecto();

    if (state.moveable) {

      try {
        state.moveable.destroy();
      }
      catch (err) {
        /* 이미 사라진 문서일 수 있다 */
      }

      state.moveable = null;

    }

    state.listeners.forEach(
      ([target, type, handler]) => {
        target.removeEventListener(type, handler, true);
      }
    );

    state.listeners = [];

    state.targetIds = [];
    state.lastPayload = null;
    state.editing = false;

    report(false);

  }


  /* Shift + 클릭 — window capture(위 머리말). controller 가 살아
     있는 동안 한 번만 등록하고, 첫 줄에서 editing 을 확인해
     빠져나간다("껐는데 하나가 남아 있다"를 만들지 않는다). */
  on(win, "pointerdown", onShiftPointerDown);
  on(win, "pointerup", onShiftPointerUp);
  on(win, "pointercancel", function () { state.shiftPress = null; });


  return {

    apply: apply,
    onRender: onRender,
    dispose: dispose,

    isActive: function () {
      return !!(state.moveable && state.targetIds.length);
    },

    /* 진단용 — 같은 realm 안에서만 읽힌다. 이 창구로 선택을 바꿀
       수는 없다(읽기 전용). */
    debugState: function () {

      const box =
        (state.moveable && typeof state.moveable.getControlBoxElement === "function")
          ? state.moveable.getControlBoxElement()
          : null;

      let rect = null;

      if (state.moveable && state.targetIds.length) {

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

      const targets =
        (state.moveable && typeof state.moveable.getTargets === "function")
          ? state.moveable.getTargets()
          : [];

      return {
        /* 1B-1 과의 호환 — 단일 선택에서는 같은 값을 읽는다 */
        targetId: primaryId(),
        targetIds: state.targetIds.slice(),
        primaryId: primaryId(),
        editing: state.editing,
        generation: state.generation,
        hasInstance: !!state.moveable,

        /*
          ★ "인스턴스가 몇 개인가"는 **우리가 표시한 바깥 상자**로
            센다. `.moveable-control-box` 의 DOM 수로 세면 안 된다 —
            MoveableGroup 은 감싸는 상자 하나에 **자식 target 당 하나**
            를 더 그리므로, 둘을 고르면 정상 동작에서도 3 이 된다
            (0.53.0 실측). 아래 controlBoxes 가 그 날것의 수다.
        */
        instances: doc.querySelectorAll('[data-imory-canvas-frame="1"]').length,
        controlBoxes: doc.querySelectorAll(".moveable-control-box").length,
        moveableTargets: targets ? targets.length : 0,
        hasSelecto: !!state.selecto,
        selectoInstances: doc.querySelectorAll(".selecto-selection").length,
        lassoCount: state.lassoCount,
        lastGate: state.lastGate,
        lastProposed: state.lastProposed,
        lastProposedMode: state.lastProposedMode,
        lastHit: state.lastHit,
        lastSelectable: state.lastSelectable,
        controlBoxDisplay: box ? box.style.display : null,
        lines: box ? box.querySelectorAll(".moveable-line").length : 0,
        rect: rect
      };

    }

  };

}
