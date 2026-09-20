/* =========================================================
   SKIN SANDBOX — ELEMENT INSPECTOR (frame 쪽, classic script)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §P (SANDBOX-6A)
             docs/features/studio/history/AI_SKIN_PHASE_AI6A_ELEMENT_INSPECTOR.md

   ---------------------------------------------------------
   ★ 이 파일이 하는 일

   프레임 안에서 "지금 포인터 밑에 있는 스킨 요소"와 "고른 요소"를
   찾아 **식별자와 사각형만** 부모에게 올려보낸다. 그리고 그 두
   요소에 테두리를 그린다.

   올라가는 값은 native Inspector 와 정확히 같은 최소값이다
   (studio/preview/preview-bridge.js PHASE AI-6A 주석):

     data-imory-edit-id 문자열 하나 · 태그 이름 · 사각형 넷

   DOM 노드도, innerHTML 도, 사용자 글 본문도, 이벤트 핸들러도,
   computed style 덤프도 올라가지 않는다. 고른 요소가 **무엇인지**
   (바인딩 / 보호 영역 / 가능한 수정 / 반복 template)는 부모가
   자기 SkinPackage 에서 그 id 로 다시 찾아 판단한다 — 프레임이
   판단해서 올려보내지 않는다. 그래서 이 realm 에서 도는 저자 JS 가
   메시지를 위조해도 얻는 것이 없다: 지금 draft template 에 없는
   id 는 부모의 대조에서 떨어진다.

   ---------------------------------------------------------
   ★ 테두리를 왜 프레임 안에 그리는가

   native 는 Studio 가 Preview **위에** overlay 를 얹어 그린다.
   프레임에서는 그럴 수 없다 — 저자 JS 의 rAF 애니메이션이나 늦게
   오는 이미지로 사각형이 움직이면 그때마다 좌표를 부모로 올려야
   하고, 그 왕복이 한 프레임씩 늦는다. 여기서 그리면 같은 realm 의
   같은 rAF 안에서 따라간다.

   그 대신 부모는 자기 hover/선택 테두리를 그리지 않는다(중복 표시).
   부모가 overlay 로 계속 하는 일은 **팝오버(선택 패널)** 하나이고,
   그 자리를 잡으려고 좌표는 여전히 받는다.

   ★ overlay 가 레이아웃과 높이에 영향을 주지 않는다

   테두리 요소는 #sandboxFrameRoot 가 **아니라** document.body 에
   붙고 position:fixed 다. 프레임 높이는 렌더 컨테이너(root)만 재므로
   (skin-sandbox-frame.js measureHeight), 이 요소는 높이에 한 픽셀도
   더하지 않는다. pointer-events:none 이라 hit-test 대상도 아니다.

   ★ 스타일은 nonce 가 붙은 <style> 하나다

   이 문서의 CSP 에는 style-src 'unsafe-inline' 이 없다. 본문 서식이
   이미 같은 방식을 쓴다(skin-sandbox-frame.js postBodyStyleElement).
   CSP 를 넓히지 않는다.

   ---------------------------------------------------------
   ★ Inspect 중에 사용자 상호작용을 어떻게 막는가

   capture 단계에서 click / auxclick / dragstart / pointerdown 을
   받아 그 자리에서 전파를 끊는다. 그래서

     · 링크(anchor) — skin-sandbox-frame.js 의 onFrameClick 도
       capture 리스너지만, 이 파일의 리스너가 **먼저** 등록되므로
       (bridge 가 start() 안에서 이 controller 를 먼저 만든다)
       여기서 끊긴다. 그 함수도 자기 첫 줄에서 다시 한 번 확인한다 —
       전파 제어 한 가지에만 기대지 않는다.
     · 저자 JS 의 click/pointerdown 핸들러 — 저자 코드는 렌더 루트
       **안쪽**에 리스너를 다는데, capture 는 document 에서 먼저
       돌므로 stopPropagation() 이 그 리스너에 도달하기 전에 끊는다.
     · form 제출 — iframe sandbox 에 allow-forms 가 없어 애초에
       막혀 있고, submit 도 여기서 한 번 더 막는다.

   ★ 저자 JS realm 을 건드리지 않는다

   Inspect 를 켜고 끄는 것으로 다시 그리지 않는다(부모가 재렌더를
   보내지 않는다). 그래서 저자 JS 는 다시 돌지 않고, 타이머도 한
   벌 그대로다. 끄면 리스너의 첫 줄 판정만 false 로 돌아가므로
   원래 상호작용이 그대로 살아난다.

   전역으로 노출:
     createSandboxInspector(options) -> controller

   options = {
     doc          : Document
     getRoot      : () => HTMLElement|null   (렌더 컨테이너)
     getRenderSeq : () => number
     getNonce     : () => string
     send         : (type, payload) => boolean
     TYPES        : SANDBOX_MESSAGE_TYPES
   }

   controller = {
     setEnabled(enabled)      부모의 INSPECT_MODE
     pick(editId|null)        부모의 INSPECT_PICK
     choose(index)            부모의 INSPECT_CHOOSE  (SANDBOX-SELECT-PARITY-1)
     selectParent()           부모의 INSPECT_PARENT
     setCaps(payload)         부모의 INSPECT_CAPS
     preview(payload)         부모의 INSPECT_PREVIEW
     onRender()               렌더가 끝났을 때(선택 되살리기)
     dispose()
     isEnabled()
   }

   ★ SANDBOX-SELECT-PARITY-1 — 실제 포인터의 hit-test 는 이제 native
     Preview 와 같은 선택 우선순위다(자리의 요소 전부 → 순위). 그
     부분과 더블클릭 편집 · 본체 끌기 · 겹친 후보 · 바깥 영역은
     skin/sandbox/skin-sandbox-inspect-direct.js 에 있다. 이 파일은
     테두리 · 좌표 보고 · 모드/선택의 주인으로 남는다.

   의존: skin/skin-inspect-target.js (isInspectableElement /
   resolveInspectableAncestor / pickInspectableAtPoint) ·
   skin/sandbox/skin-sandbox-inspect-direct.js — frame.html 이 이
   파일보다 먼저 로드한다.
========================================================== */


var SANDBOX_INSPECT_EDIT_ID_ATTR = "data-imory-edit-id";

/*
  좌표를 다시 보내는 빈도의 상한. 저자 JS 가 rAF 로 매 프레임 DOM 을
  움직이면 사각형도 매 프레임 바뀐다 — 그것을 그대로 postMessage 로
  올리면 부모의 팝오버 배치가 초당 60번 돈다. 테두리는 이 realm 에서
  즉시 따라가므로(그것이 사용자가 보는 것이다), 부모에게는 이 간격
  으로만 알린다.
*/
var SANDBOX_INSPECT_RECT_INTERVAL_MS = 120;


/*
  테두리 스타일. 색은 native Inspector 와 같은 결로 맞춘다
  (studio/inspector/studio-inspector.css).

  ★ 선택 대상에서 제외되는 이유가 두 겹이다: pointer-events:none 과,
    hit-test 가 렌더 루트 안쪽만 훑는다는 것(이 요소는 body 의 직계
    자식이라 루트 밖이다).
*/
var SANDBOX_INSPECT_CSS = [
  ".imory-sandbox-inspect-box {",
  "  position: fixed;",
  "  pointer-events: none;",
  "  z-index: 2147483647;",
  "  box-sizing: border-box;",
  "  display: none;",
  "}",
  ".imory-sandbox-inspect-box[data-visible] {",
  "  display: block;",
  "}",
  ".imory-sandbox-inspect-box--hover {",
  "  outline: 1px dashed rgba(255, 51, 170, 0.75);",
  "  outline-offset: 0;",
  "  background: rgba(255, 51, 170, 0.06);",
  "}",
  ".imory-sandbox-inspect-box--select {",
  "  outline: 2px solid rgba(255, 51, 170, 0.95);",
  "  outline-offset: 0;",
  "}",
  /* SANDBOX-SELECT-PARITY-1 — 커서는 native Preview 와 같은 규칙
     (studio/preview/preview-frame.html): 고를 수 있는 자리 위에서만
     손가락, 끌 수 있는 요소 위에서는 이동, 글자를 고치는 중에는 글자.
     표식은 skin-sandbox-inspect-direct.js 가 단다. */
  "body.imory-sandbox-inspect-on,",
  "body.imory-sandbox-inspect-on * {",
  "  cursor: default !important;",
  "}",
  "body.imory-sandbox-inspect-on {",
  "  -webkit-user-select: none;",
  "  user-select: none;",
  "}",
  "body.imory-sandbox-inspect-on [data-imory-inspector-hover],",
  "body.imory-sandbox-inspect-on [data-imory-inspector-hover] * {",
  "  cursor: pointer !important;",
  "}",
  "body.imory-sandbox-inspect-on [data-imory-inspector-movable],",
  "body.imory-sandbox-inspect-on [data-imory-inspector-movable] * {",
  "  cursor: move !important;",
  "}",
  "body.imory-sandbox-inspect-on [data-imory-inspector-editing],",
  "body.imory-sandbox-inspect-on [data-imory-inspector-editing] * {",
  "  cursor: text !important;",
  "  -webkit-user-select: text;",
  "  user-select: text;",
  "}",
  "body.imory-sandbox-inspect-on [data-imory-inspector-editing] {",
  "  outline: none;",
  "}",
  "body.imory-sandbox-inspect-on img {",
  "  -webkit-user-drag: none;",
  "}"
].join("\n");


function createSandboxInspector(options) {

  var opts =
    options || {};

  var doc =
    opts.doc || document;

  var win =
    doc.defaultView || window;


  var state = {
    enabled: false,
    hoverEl: null,
    selectedEl: null,
    selectedEditId: null,

    styleEl: null,
    hoverBox: null,
    selectBox: null,

    rafId: 0,
    lastSentAt: 0,
    lastSentKey: "",

    listeners: [],
    disposed: false
  };

  /* SANDBOX-SELECT-PARITY-1 — 직접 조작(아래 install 에서 만든다) */
  var direct = null;


  /* =========================================================
     보내기 — 언제나 지금 렌더의 renderSeq 를 단다
  ========================================================== */

  function send(type, payload) {

    if (typeof opts.send !== "function") {
      return false;
    }

    var seq =
      typeof opts.getRenderSeq === "function" ? opts.getRenderSeq() : 0;

    if (!Number.isInteger(seq) || seq < 1) {
      return false;
    }

    payload.contract = 1;
    payload.renderSeq = seq;

    return opts.send(type, payload) === true;

  }


  function sendInspectError(code) {

    send(opts.TYPES.INSPECT_ERROR, { code: code });

  }


  function root() {

    return typeof opts.getRoot === "function" ? opts.getRoot() : null;

  }


  function editIdOf(el) {

    return (el && el.getAttribute)
      ? el.getAttribute(SANDBOX_INSPECT_EDIT_ID_ATTR)
      : null;

  }


  /* =========================================================
     선택 가능 범위 (지시문 4절)

     기본 규칙은 세 realm 이 함께 쓰는 파일에 있다
     (skin/skin-inspect-target.js resolveInspectableAncestor) —
     렌더 루트 자신은 제외되고, 편집 식별자가 없는 요소도 제외된다.

     여기서 **더** 막는 것은 프레임에만 있는 자리들이다:

       · post-body region 안쪽 — 사용자가 쓴 글이다. 스킨 template
         이 아니므로 고쳐도 저장할 곳이 없다.
       · highlight-tools / owner-tools 같은 플랫폼 region 안쪽 —
         같은 이유다.
       · 저자 JS 가 만들어 붙인 요소 — template 에서 나온 것이
         아니므로 편집 식별자가 없다. 위 공용 규칙이 이미 걸러
         내지만, 그 사실을 여기 적어 둔다(sanitizer 가 지운 요소는
         애초에 DOM 에 없다).
  ========================================================== */

  function isInsideProtectedRegion(el) {

    var node =
      el;

    while (node && node.nodeType === 1) {

      if (node.hasAttribute && node.hasAttribute("data-imory-region")) {
        return true;
      }

      node = node.parentElement;

    }

    return false;

  }


  function resolveTarget(node) {

    var container =
      root();

    if (!container) {
      return null;
    }

    if (typeof resolveInspectableAncestor !== "function") {
      return null;
    }

    var found =
      resolveInspectableAncestor(node, container, editIdOf);

    if (!found) {
      return null;
    }

    /* region 자체도, 그 안쪽도 고를 수 없다 */
    if (isInsideProtectedRegion(found)) {
      return null;
    }

    return found;

  }


  /* =========================================================
     좌표 — 이 문서의 뷰포트 기준

     부모가 iframe 의 자리를 더해 Preview 문서 좌표로 바꾸고
     (studio/preview/preview-sandbox.js), 그 다음은 native 와 같은
     변환을 탄다(studio/inspector/studio-inspector-overlay.js).
  ========================================================== */

  function rectOf(el) {

    if (!el || !el.isConnected) {
      return null;
    }

    var box =
      el.getBoundingClientRect();

    return {
      left: Math.round(box.left * 100) / 100,
      top: Math.round(box.top * 100) / 100,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100
    };

  }


  /* =========================================================
     metricsOf(el) — 자유 배치 끌기가 비율을 세우는 기준

     SANDBOX-SELECT-PARITY-1. native 의 inspectorMetricsOf() 중
     **끌기에 필요한 넷**만이다(요소 크기 · 부모 안쪽 폭/높이).
     이미지 자연 크기는 보내지 않는다 — 크기 조절 · 자르기는 이
     프레임에서 열지 않는다(IMORY_SANDBOX_SKIN_DESIGN.md §S).
  ========================================================== */

  function metricsOf(el) {

    if (!el || !el.isConnected) {
      return null;
    }

    var box =
      el.getBoundingClientRect();

    var parent =
      el.parentElement;

    var parentWidth = 0;
    var parentHeight = 0;

    if (parent) {

      var style =
        win.getComputedStyle(parent);

      parentWidth =
        parent.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);

      parentHeight =
        parent.clientHeight -
        (parseFloat(style.paddingTop) || 0) -
        (parseFloat(style.paddingBottom) || 0);

    }

    return {
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
      parentWidth: Math.max(0, Math.round(parentWidth)),
      parentHeight: Math.max(0, Math.round(parentHeight))
    };

  }


  /* =========================================================
     테두리
  ========================================================== */

  function ensureLayer() {

    if (state.styleEl && state.styleEl.isConnected) {
      return;
    }

    var style =
      doc.createElement("style");

    style.setAttribute("data-imory-inspect-style", "1");

    var nonce =
      typeof opts.getNonce === "function" ? opts.getNonce() : "";

    if (nonce) {
      style.setAttribute("nonce", nonce);
      style.nonce = nonce;
    }

    style.textContent = SANDBOX_INSPECT_CSS;

    doc.head.appendChild(style);

    state.styleEl = style;


    state.hoverBox =
      doc.createElement("div");

    state.hoverBox.className =
      "imory-sandbox-inspect-box imory-sandbox-inspect-box--hover";

    state.selectBox =
      doc.createElement("div");

    state.selectBox.className =
      "imory-sandbox-inspect-box imory-sandbox-inspect-box--select";

    /*
      ★ 렌더 루트가 아니라 body 에 붙인다 — 프레임 높이는 루트만
      재므로(measureHeight) 이 요소는 높이에 영향을 주지 않는다.
    */

    doc.body.appendChild(state.hoverBox);
    doc.body.appendChild(state.selectBox);

  }


  function paintBox(box, rect) {

    if (!box) {
      return;
    }

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      box.removeAttribute("data-visible");
      return;
    }

    box.style.left = rect.left + "px";
    box.style.top = rect.top + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";

    box.setAttribute("data-visible", "1");

  }


  function repaint() {

    paintBox(state.hoverBox, rectOf(state.hoverEl));
    paintBox(state.selectBox, rectOf(state.selectedEl));

  }


  /* =========================================================
     좌표 보고 — 저자 JS 애니메이션·이미지 로드로 움직일 때

     ★ 테두리는 매 프레임 따라가고(repaint), 부모에게는 값이 실제로
       달라졌을 때만, 그것도 간격을 두고 알린다.
  ========================================================== */

  function targetPayload(el, editId, withTag) {

    var rect =
      rectOf(el);

    if (!el || !editId || !rect) {
      return null;
    }

    var value = {
      editId: editId,
      rect: rect
    };

    if (withTag) {

      value.tagName = el.tagName.toLowerCase();

      var metrics = metricsOf(el);

      if (metrics) {
        value.metrics = metrics;
      }

    }

    return value;

  }


  function pumpRects() {

    state.rafId = 0;

    if (!state.enabled || state.disposed) {
      return;
    }

    repaint();

    var now =
      Date.now();

    if (now - state.lastSentAt >= SANDBOX_INSPECT_RECT_INTERVAL_MS) {

      var hover =
        targetPayload(state.hoverEl, editIdOf(state.hoverEl), false);

      var selected =
        targetPayload(state.selectedEl, state.selectedEditId, true);

      var key =
        JSON.stringify([hover, selected]);

      if (key !== state.lastSentKey) {

        state.lastSentKey = key;
        state.lastSentAt = now;

        var payload = {};

        if (hover) {
          payload.hover = hover;
        }

        if (selected) {
          payload.selected = selected;
        }

        send(opts.TYPES.INSPECT_RECTS, payload);

      }

    }

    state.rafId =
      win.requestAnimationFrame(pumpRects);

  }


  function startPump() {

    if (state.rafId || !state.enabled) {
      return;
    }

    state.rafId =
      win.requestAnimationFrame(pumpRects);

  }


  function stopPump() {

    if (!state.rafId) {
      return;
    }

    win.cancelAnimationFrame(state.rafId);

    state.rafId = 0;

  }


  /* =========================================================
     hover / 선택
  ========================================================== */

  function setHover(el) {

    if (el === state.hoverEl) {
      return;
    }

    state.hoverEl = el;

    repaint();

    var editId =
      editIdOf(el);

    var rect =
      rectOf(el);

    if (!el || !editId || !rect) {

      send(opts.TYPES.INSPECT_HOVER, {});

      return;

    }

    send(opts.TYPES.INSPECT_HOVER, {
      editId: editId,
      rect: rect
    });

  }


  /*
    options.silent — 부모가 시켜서 바꾼 선택은 다시 올려보내지
    않는다. 올려보내면 부모가 그것을 또 처리하고, 그 결과로 다시
    내려와 메시지가 무한히 오간다(native 쪽에서 실제로 겪은 일 —
    studio/preview/preview-bridge.js setInspectorSelection 주석).
  */

  function setSelection(el, options) {

    state.selectedEl =
      el || null;

    state.selectedEditId =
      el ? editIdOf(el) : null;

    state.lastSentKey = "";

    repaint();

    if (direct) {
      direct.syncMovableMark();
    }

    if (options && options.silent) {
      return;
    }

    var selected =
      targetPayload(state.selectedEl, state.selectedEditId, true);

    if (!selected) {

      send(opts.TYPES.INSPECT_SELECT, {});

      return;

    }

    send(opts.TYPES.INSPECT_SELECT, selected);

  }


  /* =========================================================
     리스너 — 전부 capture 단계

     ★ 끄고 켤 때 붙였다 뗐다 하지 않는다. 첫 줄에서 state.enabled
       를 확인하고 빠져나간다 — "껐는데 하나가 남아 있다"는 상태를
       만들지 않는다(native 와 같은 규칙).
  ========================================================== */

  function on(target, type, handler) {

    target.addEventListener(type, handler, true);

    state.listeners.push([target, type, handler]);

  }


  function swallow(event) {

    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

  }


  /* =========================================================
     고르는 순간은 **pointerdown** 이다 (click 이 아니다)

     ★ 왜 click 이 아닌가 — 2026-09-16 WebKit 실측.

     Inspect 중에는 저자 JS 의 드래그가 시작되지 않도록 pointerdown
     의 전파를 capture 에서 끊는다. 그런데 WebKit 은 터치 제스처에서
     그 뒤의 click 을 만들어 주지 않는 경우가 있어, 손가락으로는
     아무것도 고를 수 없었다(마우스/chromium 에서는 멀쩡했다).

     그래서 "고르기"를 pointerdown 으로 올린다. 마우스·터치·펜이
     모두 같은 한 이벤트를 지나므로 엔진별 보정 이벤트에 기대지
     않는다. click 은 여전히 받아서 **삼키기만** 한다 — 링크 이동과
     저자 JS 의 click 핸들러를 막는 일은 그대로다.
  ========================================================== */

  function pickAt(node) {

    var target =
      resolveTarget(node);

    if (!target) {

      /*
        고를 것이 없는 자리다. **아무 일도 하지 않는다** — 빈 선택을
        만들지도, 지금 선택을 풀지도 않는다(지시문 4절). 진단용
        코드만 올린다.
      */

      sendInspectError("not-inspectable");

      return;

    }

    setSelection(target);

  }


  function onClick(event) {

    if (!state.enabled) {
      return;
    }

    /*
      ★ 링크 이동도, 저자 JS 의 click 핸들러도, form 동작도 실행되지
      않는다 — 고를 수 있는 요소가 아니어도 마찬가지다.
    */

    swallow(event);

  }


  function onPointerDown(event) {

    if (!state.enabled) {
      return;
    }

    /*
      ★ preventDefault 는 하지 않는다 — 터치에서 그것을 하면 엔진에
        따라 이후 이벤트가 통째로 사라진다. 전파만 끊는다(저자 JS 의
        드래그가 시작되지 않게).
    */

    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    /* 보조 버튼(가운데/오른쪽)은 고르지 않는다 */

    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    /* SANDBOX-SELECT-PARITY-1 — 실제 포인터는 **자리**로 고른다
       (선택 우선순위 · 겹친 요소 · 끌기 준비). 좌표 없는 합성
       이벤트만 아래 예전 규칙으로 간다(native 와 같다). */
    if (direct && direct.pointerDown(event)) {
      return;
    }

    pickAt(event.target);

  }


  function onPointerMove(event) {

    if (!state.enabled) {
      return;
    }

    if (direct && direct.pointerMove(event)) {
      return;
    }

    setHover(resolveTarget(event.target));

  }


  function onPointerUp(event) {

    if (!state.enabled || !direct) {
      return;
    }

    if (direct.pointerUp(event)) {
      event.stopPropagation();
    }

  }


  function onPointerCancel(event) {

    if (!state.enabled || !direct) {
      return;
    }

    direct.pointerCancel(event);

  }


  /* 더블클릭 = 고른 글자를 그 자리에서 고치기(Studio 가 허락한 것만) */
  function onDblClick(event) {

    if (!state.enabled) {
      return;
    }

    swallow(event);

    if (direct) {
      direct.dblClick(event);
    }

  }


  function onPointerLeave(event) {

    if (!state.enabled || event.relatedTarget) {
      return;
    }

    setHover(null);

  }


  function onKeyDown(event) {

    if (!state.enabled || event.key !== "Escape") {
      return;
    }

    /* 글자를 고치는 중의 Escape 는 "그 입력만 취소"다 — 편집 요소의
       리스너가 받는다. 여기서 선택까지 풀지 않는다. */
    if (direct && direct.keyDown(event)) {
      return;
    }

    /*
      프레임 안에서 누른 Escape. 선택만 푼다 — Inspect mode 자체는
      부모가 갖는다(native 와 같은 정책).
    */

    setSelection(null);

  }


  /* =========================================================
     공개 API
  ========================================================== */

  function setEnabled(enabled) {

    var next =
      !!enabled;

    if (next === state.enabled) {
      return;
    }

    state.enabled = next;

    if (next) {

      ensureLayer();

      doc.body.classList.add("imory-sandbox-inspect-on");

      startPump();

      return;

    }

    /* 끈다 — 임시 상태를 전부 걷고 테두리를 내린다 */

    stopPump();

    if (direct) {
      direct.reset({ disabled: true });
    }

    state.hoverEl = null;
    state.selectedEl = null;
    state.selectedEditId = null;
    state.lastSentKey = "";

    repaint();

    if (direct) {
      direct.syncMovableMark();
    }

    doc.body.classList.remove("imory-sandbox-inspect-on");

  }


  function pick(editId) {

    if (!state.enabled) {
      return;
    }

    var container =
      root();

    if (!container) {

      sendInspectError("no-root");

      return;

    }

    if (typeof editId !== "string" || !editId) {

      setSelection(null, { silent: true });

      return;

    }

    /*
      ★ 속성 선택자에 값을 그대로 넣지 않는다. editId 는 프로토콜이
      이미 모양을 검사했지만(SANDBOX_INSPECT_EDIT_ID_PATTERN), 그
      하나에만 기대지 않는다 — 여기서는 훑어 보며 비교한다.
    */

    var candidates =
      container.querySelectorAll("[" + SANDBOX_INSPECT_EDIT_ID_ATTR + "]");

    for (var i = 0; i < candidates.length; i += 1) {

      if (candidates[i].getAttribute(SANDBOX_INSPECT_EDIT_ID_ATTR) === editId) {

        setSelection(candidates[i], { silent: true });

        return;

      }

    }

    setSelection(null, { silent: true });

  }


  /* =========================================================
     onRender() — 다시 그린 뒤

     이전 element 참조는 문서에서 떨어져 나갔다. 같은 id 를 가진
     요소가 아직 있으면 선택을 **되살리고**, 없으면 조용히 푼다
     (지시문 7절 — 오류가 아니라 정상 fallback).

     ★ 반복 항목이면 같은 id 의 첫 번째 요소로 붙는다. 반복으로
       복제된 항목들은 **같은 template 요소에서 나왔으므로 id 가
       서로 같기 때문**이다 — 그래서 "데이터 한 건"이 아니라 반복
       template 자체가 선택된다(지시문 6절). native 와 같다.
  ========================================================== */

  function onRender() {

    if (!state.enabled) {
      return;
    }

    ensureLayer();

    /* 고치던 글자 · 끌기 · 겹친 후보 · 임시 미리보기는 옛 DOM 의
       것이다 — 버린다(Studio 가 확정했으면 새 DOM 에 이미 있다). */
    if (direct) {
      direct.reset();
    }

    state.hoverEl = null;

    var wanted =
      state.selectedEditId;

    state.selectedEl = null;
    state.selectedEditId = null;

    if (wanted) {
      pick(wanted);
    }

    state.lastSentKey = "";

    repaint();

    startPump();

    /*
      되살리지 못했으면 부모에게 알린다 — 부모는 그 요소가 사라진
      것으로 보고 선택을 조용히 푼다.
    */

    if (wanted && !state.selectedEl) {

      send(opts.TYPES.INSPECT_SELECT, {});

    }

  }


  function dispose() {

    state.disposed = true;

    setEnabled(false);

    for (var i = 0; i < state.listeners.length; i += 1) {

      state.listeners[i][0].removeEventListener(
        state.listeners[i][1],
        state.listeners[i][2],
        true
      );

    }

    state.listeners = [];

  }


  /* --- 리스너 등록 (한 번) ------------------------------- */

  on(doc, "click", onClick);
  on(doc, "auxclick", onClick);
  on(doc, "pointerdown", onPointerDown);
  on(doc, "pointerover", onPointerMove);
  on(doc, "pointermove", onPointerMove);
  on(doc, "pointerout", onPointerLeave);
  on(doc, "pointerup", onPointerUp);
  on(doc, "pointercancel", onPointerCancel);
  on(doc, "dblclick", onDblClick);
  on(doc, "keydown", onKeyDown);

  on(doc, "dragstart", function (event) {

    if (!state.enabled) {
      return;
    }

    event.preventDefault();

  });

  on(doc, "submit", function (event) {

    if (!state.enabled) {
      return;
    }

    swallow(event);

  });

  on(win, "resize", function () {

    if (!state.enabled) {
      return;
    }

    repaint();

  });


  /* =========================================================
     SANDBOX-SELECT-PARITY-1 — 직접 조작
     (skin/sandbox/skin-sandbox-inspect-direct.js)

     그 파일은 이 controller 의 상태를 아래 함수로만 읽고 쓴다.
     파일이 로드되지 않은 문서에서는 direct 가 null 이고, 모든
     입력이 예전 규칙으로 간다.
  ========================================================== */

  if (typeof createSandboxInspectDirect === "function") {

    direct = createSandboxInspectDirect({
      doc: doc,
      win: win,
      root: root,
      editIdOf: editIdOf,
      isProtected: isInsideProtectedRegion,
      resolveTarget: resolveTarget,
      rectOf: rectOf,
      selected: function () {
        return (state.selectedEl && state.selectedEl.isConnected) ? state.selectedEl : null;
      },
      select: function (el) {
        setSelection(el || null);
      },
      hover: setHover,
      send: send,
      error: sendInspectError,
      TYPES: opts.TYPES
    });

  }


  function whenEnabled(fn) {

    return function (value) {

      if (!state.enabled || !direct) {
        return;
      }

      fn(value);

    };

  }


  return {

    setEnabled: setEnabled,
    pick: pick,
    onRender: onRender,
    dispose: dispose,

    /* 부모의 INSPECT_CHOOSE / _PARENT / _CAPS / _PREVIEW */
    choose: whenEnabled(function (index) { direct.choose(index); }),
    selectParent: whenEnabled(function () { direct.selectParent(); }),
    setCaps: whenEnabled(function (payload) { direct.setCaps(payload); }),
    preview: whenEnabled(function (payload) { direct.preview(payload); }),

    isEnabled: function () {
      return state.enabled;
    },

    /* 진단용 — 이 realm 안에서만 읽힌다(부모는 cross-origin) */
    debugState: function () {
      return {
        enabled: state.enabled,
        selectedEditId: state.selectedEditId,
        hoverEditId: editIdOf(state.hoverEl),
        boxes: doc.querySelectorAll(".imory-sandbox-inspect-box").length,
        direct: direct ? direct.debugState() : null
      };
    }

  };

}
