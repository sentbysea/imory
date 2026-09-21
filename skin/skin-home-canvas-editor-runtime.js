/* =========================================================
   HOME CANVAS — 프레임 안 편집 runtime
   (HOME-CANVAS-SELECT-1B-1 · 1B-2 · TRANSFORM-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §15 · §16 · §17
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ── 이 파일이 하는 것 / 하지 않는 것 ────────────────────
   한다:   1) 부모가 **확정해 내려 준** 캔버스 선택을 받아, 그 요소들이
             지금 이 문서의 DOM 에 실제로 있는지 다시 확인한 뒤
             Moveable 로 테두리를 그린다(하나면 회전을 따라가는 틀,
             여럿이면 그룹 틀 하나).
           2) Selecto 로 끌어서 고른 결과와 Shift 클릭을 **제안**으로
             올려보낸다.
           3) TRANSFORM-1A — 단독으로 고른 요소 하나를 마우스 · 펜으로
             끌어 옮기고, 그 결과를 **확정 요청**으로 올려보낸다.

   안 한다: 크기 · 회전 조작 · 손잡이 · 그룹 이동 · 손가락 이동 ·
           Canvas JSON 수정 · Undo · **최종 선택과 최종 좌표의
           확정**. 끄는 동안 이 문서에서 움직이는 것은 custom
           property 두 칸뿐이고, 무엇을 실제로 저장할지는 언제나
           부모가 자기 draft 를 보고 정한다.

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

/* =========================================================
   HOME-CANVAS-TRANSFORM-1A — 이동

   ★ 이번 단계가 켜는 조작은 `draggable` **하나**다. 손잡이(크기 ·
     회전)는 여전히 만들지 않는다.

   ★ 저장 단위는 소수점 셋째 자리까지다. 390 자 도화지에서 0.001 은
     실제 화면의 1/1000 px 보다 작고, 그보다 더 적으면 같은 자리를
     여러 번 끌었을 때 문자열이 계속 길어진다.

   ★ 확정을 올려보낸 뒤 **답을 기다리는 동안**에도 임시 위치를
     유지한다. 부모가 승인하면 그 값이 그대로 남고, 거부하면 부모가
     내려 준 현재 값으로 되돌아간다(§9). 답이 아예 오지 않는 경우
     (프레임 교체 · 부모 오류)를 위해 상한을 하나 둔다 — 그때는
     마지막으로 알고 있던 값으로 돌아간다.
========================================================== */

const CANVAS_MOVE_KIND = "move";

const CANVAS_COORD_DECIMALS = 1000;

const CANVAS_COMMIT_TIMEOUT_MS = 4000;

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
   Moveable 설정 — 테두리, 그리고 **본체 이동 하나**

   ★ 손잡이 able 은 여전히 전부 꺼져 있다. 켜는 것은 `draggable`
     하나이고, 그것도 생성 시점에는 false 다 — 조건이 맞을 때만
     setDraggableState() 가 켠다(계약 §17-1).

   ★ 그래서 이 Moveable 은 조건이 맞을 때 target 에 pointer 리스너를
     단다(0.53.0 의 _updateEvents 는 "dragStart 를 가진 able 이 하나
     라도 있으면" targetGesto 를 만든다). 그 gesto 는 mousedown /
     touchstart 를 듣고, 기존 Select 는 document capture 의
     **pointerdown** 을 듣는다 — 서로 다른 이벤트라 한쪽이 다른 쪽을
     지우지 않는다(Selecto 와 같은 사정).

   ★ preventClickEventOnDrag: true 가 이번에 켜졌다.

     native Preview 의 Inspector 는 **click** 으로 고른다. 끌고 난 뒤
     따라오는 click 을 그대로 두면 방금 옮긴 요소를 한 번 더 고르는
     메시지가 왕복한다(선택은 그대로지만 순번이 헛돈다). gesto 가
     **끌었을 때만** 그 한 번을 막는다 — 끌지 않은 평범한 클릭에는
     손대지 않으므로 SELECT-1A 의 단일 클릭 선택은 그대로다.

   ★ renderDirections: [] 는 손잡이(모서리 · 변)를 만들지 않는다.
     hideDefaultLines 는 **끄지 않는다** — 그 네 줄이 우리가 원하는
     "회전을 따라가는 테두리"다(내부 state.renderLines 는 요소의
     네 꼭짓점 pos1~pos4 에서 나오므로 축에 평행한 상자가 아니다).

   ★ 이벤트 handler 는 **`.on()` 으로만** 건다. 옵션으로 넘기면
     한 번도 불리지 않는다.

     0.53.0 의 vanilla 래퍼는 생성자에서 옵션을 복사한 뒤 모든
     `onXxx` 칸을 **자기 emitter 로 덮어쓴다**(번들 실측:
     `su.forEach(t => u["on"+Camel(t)] = e => this.trigger(t, e))`).
     그래서 우리가 넣은 `onDragStart` 는 그 자리에서 사라진다 —
     2026-09-21 에 실제로 그렇게 만들었다가, 관문도 통과하고
     targetGesto 도 붙었는데 드래그가 **한 번도 시작되지 않는**
     상태를 보고서야 알았다.

     거절은 `e.stop()` 이다. emitter 의 `emit()` 은 listener 중
     하나라도 `stop()` 을 부르면 false 를 돌려주고, Draggable 은
     그 값을 보고 제스처를 접는다(`!1 !== (parentEvent || trigger)`).

   ★ cspNonce 는 공식 옵션이다. 전역 createElement 를 가로채지도,
     style 태그를 사후에 훑지도, CSP 를 넓히지도 않는다. 0.53.0 에서
     **작동하지만 deprecated** 라는 것이 VENDOR-1 의 판정이고, 그래서
     버전을 고정해 두었다(계약 §13).
========================================================== */

function displayOnlyMoveableOptions(target, nonce) {

  return {

    target: target,

    /*
      조작 — 이동 하나만. **생성 시점에 켠다.**

      ★ 처음에 끄고 조건이 맞을 때 `moveable.draggable = true` 로
        켜는 길을 먼저 만들었다가 되돌렸다. 0.53.0 의 vanilla 래퍼는
        prop 마다 setter 를 두지만 그 setter 는 `setState` 이고,
        preact 의 setState 는 **렌더를 미룬다**. able 목록과 target
        gesto 는 그 렌더 뒤의 `_updateEvents()` 에서 만들어지므로,
        켠 직후에 누르면 pointer 리스너가 아직 없다 — 2026-09-21
        실측에서 `props.draggable` 은 true 인데 `targetGesto` 가
        없었고, 드래그가 **한 번도 시작되지 않았다**.

      ★ 켜 둔 채로 두어도 "고르지 않은 요소가 끌린다"가 생기지
        않는다. Moveable 의 target 은 언제나 **부모가 확정한 선택**
        이고, 그 위에서 dragStart 가 다시 dragGate() 를 지난다
        (거기서 false 를 돌려주면 0.53.0 은 그 자리에서 제스처를
        접는다 — 번들 실측). 관문이 한 곳이라 켜고 끄는 타이밍을
        추적할 일이 없다.
    */
    draggable: true,

    /* 움직임을 반올림하지 않는다 — 우리는 Moveable 의 translate 를
       쓰지 않고 clientX/clientY 를 직접 쓴다(§17-3) */
    throttleDrag: 0,
    throttleDragRotate: 0,

    preventClickEventOnDrag: true,

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

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 이동

       geometry  부모가 내려 준 **단일 선택 요소의 Canvas 좌표**.
                 프레임은 JSON 을 갖고 있지 않으므로 이 값 없이는
                 "무엇에서 얼마나 움직였는가"를 말할 수 없다.
                 DOM 의 백분율을 거꾸로 풀지 않는다 — 그 값은 이미
                 여섯 자리에서 잘린 것이라 되돌리면 원본이 아니다.

       drag      지금 진행 중인 제스처. 시작 시점의 clientX/Y 와
                 **시작 좌표**를 들고 있고, 매 프레임 그 시작값에
                 누적 이동량을 더한다(직전 프레임의 delta 를 계속
                 더하지 않는다 — §17-3).

       pending   확정을 올려보내고 답을 기다리는 중. 그동안 임시
                 위치를 유지하고 새 드래그를 받지 않는다.
    ====================================================== */

    geometry: null,
    geometryLog: [],
    drag: null,
    pending: null,
    pendingTimer: 0,

    /* 확정 요청마다 하나씩 오른다. 부모는 답에 이 번호를 달아
       돌려주고, 프레임은 **자기 번호와 같은 답**에만 반응한다 —
       좌표 메시지는 이 답 말고도 나오기 때문이다(계약 §17-8). */
    requestSeq: 0,

    /* 진단 — 마지막 이동이 어떻게 끝났는가 */
    moveCount: 0,
    lastMoveGate: "",
    lastCommit: null,
    lastSettle: "",

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

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 끄는 동안에는 재지 않는다.

       Moveable 은 제스처가 도는 동안 자기 control box 를 **자기
       계산으로** 그린다(우리가 target 에 transform 을 쓰지 않아도
       따라온다). 그 사이 우리가 updateRect() 를 부르면 그 계산의
       기준이 제자리에서 갈려 테두리가 요소와 어긋난다.

       우리가 옮기는 양과 Moveable 이 그리는 양은 둘 다 같은
       clientX/Y 차이에서 나오므로, 재지 않아도 둘은 붙어 있다.
    ====================================================== */
    if (state.drag) {
      state.rafId = win.requestAnimationFrame(tick);
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

      /* HOME-CANVAS-TRANSFORM-1A — 옵션이 아니라 여기서 건다
         (위 displayOnlyMoveableOptions 의 ★ 주석) */
      state.moveable.on("dragStart", onCanvasDragStart);
      state.moveable.on("drag", onCanvasDrag);
      state.moveable.on("dragEnd", onCanvasDragEnd);

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

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 끄는 동안 같은 target 을 다시
       잡지 않는다.

       sandbox 에서는 끌기 시작과 거의 동시에 "같은 것을 골랐다"가
       한 번 더 내려온다(위 apply 의 함정 주석). 그때 updateRect()
       를 부르면 Moveable 이 제스처 도중에 기준을 다시 재어 테두리가
       요소와 어긋난다 — tick 이 끄는 동안 재지 않는 것과 같은
       이유다.
    ====================================================== */
    if (state.drag && state.moveable && sameTargets(elements)) {
      markControlBox();
      return true;
    }

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

    /* HOME-CANVAS-TRANSFORM-1A — 조건이 맞으면 여기서 이동이 켜진다.
       맞지 않으면(여럿 · 좌표 없음 · 잠김) 꺼진 채로 테두리만 남는다. */
    syncDraggable();

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

    cancelDrag("detach");

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
     HOME-CANVAS-TRANSFORM-1A — 단일 요소 이동

     ★ 이 프레임은 Canvas JSON 을 갖고 있지 않다.

     그래서 "지금 몇이냐"를 스스로 알 수 없다. DOM 에 적힌 백분율을
     거꾸로 풀지도 않는다 — 그 값은 렌더러가 이미 여섯 자리에서
     자른 것이라 되돌리면 원본과 미세하게 다르고, 그 차이가 그대로
     저장되면 끌지도 않은 요소가 조금씩 움직인다.

     대신 부모가 **선택과 짝지어** 좌표 하나를 내려 준다
     (setGeometry). 이동은 그 값에서 시작하고, 확정도 그 값을
     `expected` 로 달고 올라간다 — 부모는 자기 draft 의 현재 값과
     대조한 뒤에만 쓴다.

     ★ 끄는 동안 Canvas JSON 도 working draft 도 Undo 도 스킨 CSS 도
       한 글자 바뀌지 않는다. 이 프레임 안에서 custom property 두
       칸이 움직일 뿐이다(§17-4).
  ========================================================== */

  /*
    좌표를 쓰는 함수는 렌더러의 것을 그대로 쓴다
    (skin/skin-home-canvas-render.js §0-1). 이 문서가 그 파일을
    읽지 않았으면 **이동을 켜지 않는다** — 계산을 여기에 한 벌 더
    적지 않는다.
  */
  function positionApi() {

    if (
      typeof win.setSkinCanvasElementPosition !== "function" ||
      typeof win.readSkinCanvasElementPositionVars !== "function" ||
      typeof win.restoreSkinCanvasElementPositionVars !== "function"
    ) {
      return null;
    }

    return {
      set: win.setSkinCanvasElementPosition,
      read: win.readSkinCanvasElementPositionVars,
      restore: win.restoreSkinCanvasElementPositionVars
    };

  }


  /* 소수점 셋째 자리까지. 정확한 정수면 정수 그대로다(-0 은 0). */
  function roundCanvasCoord(value) {

    const rounded =
      Math.round(value * CANVAS_COORD_DECIMALS) / CANVAS_COORD_DECIMALS;

    return Object.is(rounded, -0) ? 0 : rounded;

  }


  /*
    frame px → Canvas 좌표의 배율.

    ★ 도화지의 **가로폭 하나**로 정한다. 세로는 렌더러가
      `aspect-ratio: baseWidth / baseHeight` 로 가로에 묶어 두었으므로
      같은 배율이다(skin/skin-home-canvas-render.css §1). 세로를 따로
      재면 스킨이 높이를 덮어썼을 때 x 와 y 가 서로 다른 자로
      움직인다.

    ★ 부모 문서의 Preview `transform: scale()` 은 여기에 들어오지
      않는다. 이 문서 안의 getBoundingClientRect 와 pointer 의
      clientX 는 둘 다 **이 프레임의 좌표계**이고, 바깥의 scale 은
      둘 다에 똑같이 적용되므로 나누면 사라진다.
  */
  function canvasScale(baseWidth) {

    const root =
      canvasRoot();

    if (!root || !(baseWidth > 0)) {
      return 0;
    }

    const box =
      root.getBoundingClientRect();

    return box.width > 0 ? (box.width / baseWidth) : 0;

  }


  /*
    지금 이동을 켜도 되는가 — 이유를 문자열로 돌려준다(§17-1).

    "ok" 가 아닌 값은 전부 진단용이고, 그 상태에서는 Moveable 의
    draggable 이 꺼져 있어 애초에 제스처가 시작되지 않는다.
  */
  function dragGate() {

    if (state.disposed || !state.editing) {
      return "not-editing";
    }

    if (state.pending) {
      return "pending";
    }

    if (state.targetIds.length !== 1) {
      return "not-single";
    }

    const id =
      state.targetIds[0];

    if (primaryId() !== id) {
      return "not-primary";
    }

    const geometry =
      state.geometry;

    if (!geometry || geometry.id !== id) {
      return "no-geometry";
    }

    if (geometry.generation !== state.generation) {
      return "stale-geometry";
    }

    const el =
      elementFor(id);

    if (!el) {
      return "no-element";
    }

    /* 부모가 draft 에서 이미 본 것이지만 화면에서도 한 번 더 본다 —
       늦게 온 재렌더가 그 사이에 잠갔을 수 있다 */
    if (el.hasAttribute("hidden") || el.getAttribute(CANVAS_LOCKED_ATTR) === "true") {
      return "locked";
    }

    if (!positionApi()) {
      return "no-renderer";
    }

    if (!(canvasScale(geometry.baseWidth) > 0)) {
      return "no-scale";
    }

    return "ok";

  }


  /*
    syncDraggable()

    able 을 켜고 끄지 않는다(위 displayOnlyMoveableOptions 주석) —
    지금 이동을 받을 수 있는지 다시 재어 진단에 남길 뿐이다. 실제
    판정은 언제나 제스처가 시작될 때 dragGate() 가 한다.
  */
  function syncDraggable() {

    if (!state.moveable) {
      return false;
    }

    const gate =
      dragGate();

    state.lastMoveGate = gate;

    return gate === "ok";

  }


  function restoreDragPosition(gesture) {

    const api =
      positionApi();

    if (!api || !gesture || !gesture.el || !gesture.saved) {
      return;
    }

    try {
      api.restore(gesture.el, gesture.saved);
    }
    catch (err) {
      /* 이미 사라진 노드다 — 재렌더가 제자리를 그린다 */
    }

  }


  function clearPendingTimer() {

    if (state.pendingTimer) {
      win.clearTimeout(state.pendingTimer);
      state.pendingTimer = 0;
    }

  }


  /*
    cancelDrag(reason)

    **끄는 중인 제스처만** 접는다 — 시작 자리로 되돌리고 부모에게는
    아무 말도 하지 않는다(확정을 보낸 적이 없다, §9).

    ★ 이미 확정을 보내 **답을 기다리는 중인 것은 건드리지 않는다.**

    승인된 확정은 곧바로 화면을 다시 그리게 하고, 그 재렌더가
    이 함수를 부른다(onRender). 거기서 기다림까지 접으면 **정상적으로
    저장된 이동이 "답을 못 받았다"가 되어** 화면만 제자리로 돌아간다
    (2026-09-21 이 라운드의 e2e 가 그렇게 잡았다). 기다림을 끝내는
    것은 번호가 붙은 답 하나, 상한 시간, 그리고 dispose() 뿐이다.
  */
  function cancelDrag(reason) {

    if (!state.drag) {
      return;
    }

    const gesture =
      state.drag;

    state.drag = null;

    gesture.cancelled = true;

    restoreDragPosition(gesture);

    if (state.moveable && typeof state.moveable.stopDrag === "function") {

      try {
        state.moveable.stopDrag("target");
      }
      catch (err) {
        /* 이미 끝난 제스처다 */
      }

    }

    state.lastMoveGate = "cancel:" + (reason || "");

  }


  /*
    abandonPendingCommit(reason)

    기다림 자체를 접는다. 이 문서가 사라지는 경우(dispose)에만
    쓴다 — 그 밖에는 답이 오거나 상한 시간이 끝낸다.
  */
  function abandonPendingCommit(reason) {

    if (!state.pending) {
      return;
    }

    const pending =
      state.pending;

    state.pending = null;

    clearPendingTimer();

    restoreDragPosition(pending);

    state.lastSettle = "cancel:" + (reason || "");

  }


  /*
    거절은 `event.stop()` 이다 — 반환값이 아니다(위
    displayOnlyMoveableOptions 의 ★ 주석). emitter 가 그 호출을 보고
    false 를 돌려주면 Draggable 이 그 자리에서 제스처를 접는다.
  */
  function refuseDrag(event, reason) {

    state.lastMoveGate = reason;

    if (event && typeof event.stop === "function") {
      event.stop();
    }

    return false;

  }


  function onCanvasDragStart(event) {

    const gate =
      dragGate();

    if (gate !== "ok") {
      return refuseDrag(event, gate);
    }

    /*
      손가락으로는 본체를 끌지 않는다(§17-2).

      도화지 전체를 덮는 배경 사진이 선택된 상태에서 한 손가락
      드래그를 가로채면 모바일 Preview 가 아예 스크롤되지 않는다.
      lasso 와 같은 이유이고, 같은 판정 함수를 쓴다.
    */
    if (isCoarsePointerEvent(event && event.inputEvent)) {
      return refuseDrag(event, "coarse-pointer");
    }

    const geometry =
      state.geometry;

    const el =
      elementFor(geometry.id);

    const api =
      positionApi();

    const scale =
      canvasScale(geometry.baseWidth);

    if (!el || !api || !(scale > 0)) {
      return refuseDrag(event, "no-basis");
    }

    state.drag = {
      id: geometry.id,
      el: el,
      scale: scale,
      startX: event.clientX,
      startY: event.clientY,
      baseX: geometry.x,
      baseY: geometry.y,
      baseWidth: geometry.baseWidth,
      baseHeight: geometry.baseHeight,
      generation: state.generation,
      saved: api.read(el),
      nextX: geometry.x,
      nextY: geometry.y,
      cancelled: false
    };

    state.lastMoveGate = "ok";

    return true;

  }


  function onCanvasDrag(event) {

    const gesture =
      state.drag;

    if (!gesture || gesture.cancelled) {
      return;
    }

    if (!gesture.el.isConnected) {
      cancelDrag("detached");
      return;
    }

    const api =
      positionApi();

    if (!api) {
      cancelDrag("no-renderer");
      return;
    }

    /*
      ★ 시작값 + **누적** 이동량이다.

      직전 프레임의 delta 를 계속 더하면 반올림이 매 프레임 쌓여
      한 번의 드래그 안에서도 어긋난다. 여기서는 언제나 시작
      clientX/Y 와의 차이를 쓰므로 프레임 수와 무관하다(§17-3).
    */
    const dx =
      (event.clientX - gesture.startX) / gesture.scale;

    const dy =
      (event.clientY - gesture.startY) / gesture.scale;

    gesture.nextX = roundCanvasCoord(gesture.baseX + dx);
    gesture.nextY = roundCanvasCoord(gesture.baseY + dy);

    try {

      api.set(
        gesture.el,
        gesture.nextX,
        gesture.nextY,
        gesture.baseWidth,
        gesture.baseHeight
      );

    }
    catch (err) {
      cancelDrag("write-failed");
    }

  }


  function onCanvasDragEnd() {

    const gesture =
      state.drag;

    state.drag = null;

    if (!gesture || gesture.cancelled) {
      return;
    }

    /* 움직이지 않았다 — 확정도, 기록도 없다(§17-6) */
    if (gesture.nextX === gesture.baseX && gesture.nextY === gesture.baseY) {
      restoreDragPosition(gesture);
      state.lastMoveGate = "no-move";
      return;
    }

    if (typeof opts.onTransform !== "function") {
      restoreDragPosition(gesture);
      state.lastMoveGate = "no-channel";
      return;
    }

    /*
      ★ 임시 위치를 **그대로 둔 채** 답을 기다린다.

      여기서 먼저 시작 자리로 되돌리면 승인된 경우에도 한 프레임
      제자리로 튀었다가 다시 간다. 부모의 답(새 geometry)이 그
      기다림을 끝낸다 — 승인이면 방금 자리를 그대로 확정하고,
      거부면 부모가 내려 준 현재 값으로 되돌아간다.
    */
    state.requestSeq += 1;

    gesture.requestId = state.requestSeq;

    state.pending = gesture;

    state.moveCount += 1;

    state.lastCommit = {
      id: gesture.id,
      expected: { x: gesture.baseX, y: gesture.baseY },
      next: { x: gesture.nextX, y: gesture.nextY },
      generation: gesture.generation,
      requestId: gesture.requestId
    };

    state.lastSettle = "pending";

    syncDraggable();

    try {

      opts.onTransform({
        kind: CANVAS_MOVE_KIND,
        id: gesture.id,
        expected: { x: gesture.baseX, y: gesture.baseY },
        next: { x: gesture.nextX, y: gesture.nextY },
        generation: gesture.generation,
        requestId: gesture.requestId
      });

    }
    catch (err) {
      cancelDrag("send-failed");
      return;
    }

    clearPendingTimer();

    /* 답이 아예 오지 않는 경우(프레임 교체 · 부모 오류)에도 임시
       위치가 영영 남지 않게 한다 */
    state.pendingTimer =
      win.setTimeout(
        () => {

          state.pendingTimer = 0;

          if (state.pending === gesture) {
            state.pending = null;
            restoreDragPosition(gesture);
            state.lastSettle = "timeout";
            syncDraggable();
          }

        },
        CANVAS_COMMIT_TIMEOUT_MS
      );

  }


  /* =========================================================
     setGeometry(payload) — 부모가 내려 준 단일 선택의 Canvas 좌표

     payload = { active, id, x, y, baseWidth, baseHeight, generation }

     ★ 두 가지 일을 한다.

       1) 다음 드래그의 **시작 좌표**를 정한다.
       2) 확정을 기다리는 중이었다면 그 기다림을 **끝낸다** —
          승인이면 받은 값이 방금 놓은 자리와 같고, 거부면 예전
          값이라 화면이 제자리로 돌아간다. 프레임은 둘을 구분해
          행동하지 않는다: 언제나 "부모가 말한 값"으로 맞춘다.
  ========================================================== */

  function setGeometry(payload) {

    if (state.disposed) {
      return;
    }

    const value =
      (payload && typeof payload === "object" && payload.active === true)
        ? {
            id: typeof payload.id === "string" ? payload.id : "",
            x: payload.x,
            y: payload.y,
            baseWidth: payload.baseWidth,
            baseHeight: payload.baseHeight,
            generation:
              Number.isInteger(payload.generation) ? payload.generation : -1
          }
        : null;

    /* 진단 — 마지막 몇 개의 좌표 메시지. "승인인데 왜 되돌아갔나"를
       다시 재현하지 않고 읽을 수 있게 남긴다. */
    state.geometryLog.push(
      value
        ? `${value.id}@${value.x},${value.y}#${value.generation}${state.pending ? "*" : ""}`
        : `off${state.pending ? "*" : ""}`
    );

    if (state.geometryLog.length > 8) {
      state.geometryLog.shift();
    }

    const usable =
      !!value &&
      CANVAS_ELEMENT_ID_PATTERN.test(value.id) &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      value.baseWidth > 0 &&
      value.baseHeight > 0 &&
      value.generation >= 0;

    state.geometry =
      usable ? value : null;


    /* =====================================================
       끌고 있는 중에 좌표가 왔다.

       ★ 시작 좌표가 그대로면 **같은 선택을 다시 확정한 것**이다
         (위 apply 의 함정 주석). 진행 중인 제스처가 새 순번을
         받아 간다 — 확정이 그 순번으로 올라가야 부모의 관문을
         지난다.

       ★ 시작 좌표가 달라졌으면 그 사이에 draft 가 바뀐 것이다
         (Undo · Import · AI 적용). 지금 끌고 있는 값은 더 이상
         근거가 없으므로 접는다(§9).
    ====================================================== */

    if (state.drag) {

      if (
        usable &&
        value.id === state.drag.id &&
        value.x === state.drag.baseX &&
        value.y === state.drag.baseY
      ) {
        state.drag.generation = value.generation;
      }
      else {
        cancelDrag("geometry");
      }

    }


    /* =====================================================
       ★ 답은 **번호가 붙은 것 하나**다.

       좌표 메시지는 이 답 말고도 나온다 — 선택이 바뀔 때, 다시
       그린 뒤, draft 가 바뀔 때마다. 실제로 확정이 부모에 닿기
       **전에** 확정 전 값을 그대로 담은 좌표가 한 번 더 내려왔고,
       그것을 답으로 읽었더니 승인된 이동이 "거부됐다"가 되어
       제자리로 돌아갔다(2026-09-21 이 라운드의 e2e 가 잡았다).

       그래서 기다리는 동안에는 **자기 요청 번호를 단 메시지**만
       답으로 받는다. 나머지는 다음 이동의 시작점만 갱신한다.
    ====================================================== */

    const pending =
      (state.pending && payload && payload.answering === state.pending.requestId)
        ? state.pending
        : null;

    if (pending) {

      const api =
        positionApi();

      const el =
        elementFor(pending.id);

      state.pending = null;

      clearPendingTimer();

      if (usable && value.id === pending.id) {

        /* =================================================
           ★ 판정은 **값**으로 한다 — 그릴 수 있었는가가 아니라.

           승인된 확정 뒤에는 부모가 화면을 다시 그린다. 그래서 이
           메시지를 처리하는 순간 우리가 끌던 노드가 이미 새 노드로
           갈려 있을 수 있다. 그것을 "되돌렸다"로 적으면 정상적으로
           저장된 이동이 실패로 보인다(2026-09-21 이 라운드의 e2e 가
           실제로 그렇게 읽었다).

           부모가 말한 값이 우리가 부탁한 값과 같으면 승인이다.
           화면은 새 DOM 이 이미 그 자리에 그려 놓았거나, 아래
           한 줄이 맞춰 준다.
        ================================================= */

        if (api && el) {

          try {
            api.set(el, value.x, value.y, value.baseWidth, value.baseHeight);
          }
          catch (err) {
            /* 이미 갈린 노드다 — 새 DOM 이 제자리를 그린다 */
          }

        }

        state.lastSettle =
          (value.x === pending.nextX && value.y === pending.nextY)
            ? "accepted"
            : "restored";

      }
      else {

        restoreDragPosition(pending);

        state.lastSettle = "restored";

      }

    }

    syncDraggable();

  }


  /*
    topCanvasElementAt(x, y)

    그 자리에서 **가장 위에 있는** 캔버스 요소. lasso 와 본체 이동을
    가르는 판정이다(§17-2).

      고를 수 있는 요소가 위에 있다  → 그 요소(= lasso 금지)
      잠긴 요소가 위에 있다          → null (배경처럼 본다)
      도화지 바탕                    → null (lasso)

    숨긴 요소는 상자가 없어 애초에 이 목록에 오지 않고, `pointer-events:
    none` 인 것(사용자 JS 효과 레이어 · Moveable control box)도 오지
    않는다 — 브라우저의 elementsFromPoint 가 이미 걸러 준다.
  */
  function topCanvasElementAt(x, y) {

    const root =
      canvasRoot();

    if (!root || typeof doc.elementsFromPoint !== "function") {
      return null;
    }

    const stack =
      doc.elementsFromPoint(x, y) || [];

    for (let i = 0; i < stack.length; i += 1) {

      let el =
        stack[i];

      while (el && el.nodeType === 1) {

        /* 도화지 바탕에 먼저 닿았다 — 이 자리에는 요소가 없다 */
        if (el === root) {
          return null;
        }

        if (
          typeof el.hasAttribute === "function" &&
          el.hasAttribute(CANVAS_ELEMENT_ATTR) &&
          root.contains(el)
        ) {

          return el.getAttribute(CANVAS_LOCKED_ATTR) === "true" ? null : el;

        }

        el = el.parentElement;

      }

    }

    return null;

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

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 요소 위에서 시작한 끌기는
       lasso 가 아니다(§17-2).

       ★ SELECT-1B-2 에서는 `preventDragFromInside:false` 로 두어
         **요소 위에서도** lasso 가 시작됐다. 도화지 전체를 덮는
         배경 사진이 흔해서 시작할 빈 자리가 없었기 때문이다. 이제
         그 자리에서 시작한 끌기는 "이 요소를 옮긴다"는 뜻이 될 수
         있으므로 둘을 갈라야 한다.

         고를 수 있는 요소 위     lasso 시작 금지
                                  (고른 요소면 Moveable 이 옮기고,
                                   아니면 아무 일도 없다 — 먼저
                                   클릭해서 고른다)
         잠긴 요소 위             배경처럼 보고 lasso 허용
         빈 도화지                lasso

       그래서 배경 사진 위에서 lasso 를 하려면 그 사진을 잠근다 —
       "건드리지 않겠다"는 표시가 곧 "배경으로 쓰겠다"가 된다.
    ====================================================== */

    if (topCanvasElementAt(event.clientX, event.clientY)) {
      return gate("canvas-element");
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

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1A — 선택이 갈리면 제스처도 끝이다(§9).

       ★ 순번이 올랐다고 취소하지 않는다. **같은 요소를 다시
         확정한 것**이면 이어 간다.

       함정: sandbox 프레임의 Inspector 는 **pointerdown** 에서
       고른다(skin/sandbox/skin-sandbox-inspect.js). 그래서 이미
       고른 요소를 끌기 시작하는 그 순간에도 "이것을 골랐다"가 한
       번 더 올라가고, 부모는 같은 선택을 새 순번으로 확정해 내려
       준다. 그 메시지는 언제나 dragStart **뒤에** 도착한다
       (postMessage 는 비동기다). 그것을 취소로 읽으면 sandbox 에서는
       이동이 **한 번도 성립하지 않는다**(2026-09-21 실측).

       그래서 가르는 기준을 순번이 아니라 **무엇을 골랐는가**로
       둔다. 같은 단독 선택이면 진행 중인 제스처가 새 순번을
       받아 간다(아래) — 확정도 그 순번으로 올라가므로 부모의
       "최신 순번인가" 관문을 그대로 지난다.
    ====================================================== */

    const stillSame =
      !!state.drag &&
      !!value &&
      value.active === true &&
      Array.isArray(value.ids) &&
      value.ids.length === 1 &&
      value.ids[0] === state.drag.id &&
      value.primaryId === state.drag.id;

    if (generation !== state.generation && !stillSame) {
      cancelDrag("generation");
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

      state.geometry = null;

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


    /* 끌고 있던 요소가 더 이상 **단독 선택**이 아니다 — 제스처를
       접는다(선택 변경 · 삭제 · 다중 선택으로 넓힘, §9) */
    if (
      state.drag &&
      (wanted.length !== 1 || wanted[0] !== state.drag.id)
    ) {
      cancelDrag("selection");
    }


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

    /* 화면이 다시 그려졌다 — 끌고 있던 노드는 이미 없다(§9).
       확정을 기다리는 중이었다면 그 답은 곧 새 좌표로 온다. */
    cancelDrag("render");

    if (!state.lastPayload) {
      detach();
      return;
    }

    apply(state.lastPayload);

  }


  function dispose() {

    cancelDrag("dispose");

    abandonPendingCommit("dispose");

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

    clearPendingTimer();

    state.targetIds = [];
    state.lastPayload = null;
    state.geometry = null;
    state.editing = false;

    report(false);

  }


  /* Shift + 클릭 — window capture(위 머리말). controller 가 살아
     있는 동안 한 번만 등록하고, 첫 줄에서 editing 을 확인해
     빠져나간다("껐는데 하나가 남아 있다"를 만들지 않는다). */
  on(win, "pointerdown", onShiftPointerDown);
  on(win, "pointerup", onShiftPointerUp);

  on(win, "pointercancel", function () {

    state.shiftPress = null;

    /* HOME-CANVAS-TRANSFORM-1A — 손을 놓은 것이 아니라 입력이
       끊긴 것이다(§9). 확정하지 않고 시작 자리로 돌린다. */
    cancelDrag("pointercancel");

  });


  /* =========================================================
     HOME-CANVAS-TRANSFORM-1A — Escape 는 이동을 취소한다(§9)

     ★ 끄는 동안에만 가로챈다. 그때는 이 키의 뜻이 "지금 옮기던
       것을 없던 일로"이고, 그대로 흘려보내면 Inspector 가 **선택
       까지** 풀어 버린다(skin/sandbox/skin-sandbox-inspect.js ·
       studio/preview/preview-inspect-direct.js 의 Escape). 끌고
       있지 않을 때는 손대지 않는다 — 그 키의 기존 뜻 그대로다.
  ========================================================== */

  on(win, "keydown", function (event) {

    if (!state.drag || event.key !== "Escape") {
      return;
    }

    cancelDrag("escape");

    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    event.preventDefault();

  });


  return {

    apply: apply,
    onRender: onRender,
    setGeometry: setGeometry,
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
        /* HOME-CANVAS-TRANSFORM-1A — "지금 끌면 옮겨지는가".
           able 은 언제나 켜져 있고, 판정은 이 관문 하나다. */
        draggable: dragGate() === "ok",
        dragGate: dragGate(),
        dragging: !!state.drag,
        pendingCommit: !!state.pending,
        geometry:
          state.geometry
            ? {
                id: state.geometry.id,
                x: state.geometry.x,
                y: state.geometry.y,
                generation: state.geometry.generation
              }
            : null,
        moveCount: state.moveCount,
        lastMoveGate: state.lastMoveGate,
        lastCommit: state.lastCommit,
        lastSettle: state.lastSettle,
        geometryLog: state.geometryLog.slice(),

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
