/* =========================================================
   SKIN SANDBOX — 클릭하고 바로 고치는 Select (frame 쪽, classic script)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §S (SANDBOX-SELECT-PARITY-1)
             IMORY_DIRECT_UX_DESIGN.md (DIRECT-UX-1)

   ---------------------------------------------------------
   ★ 이 파일이 하는 일

   native Preview 문서의 studio/preview/preview-inspect-direct.js 가
   하는 일을 sandbox 프레임 realm 에서 **같은 규칙으로** 한다.

     1. 선택 우선순위 — 눌린 자리의 요소 전부(elementsFromPoint)를
        skin/skin-inspect-target.js pickInspectableAtPoint() 로 나눈다.
        규칙은 그 파일 하나다(세 realm 이 같은 파일을 읽는다) —
        여기에는 순위 판정 코드가 **없다**.
     2. 겹친 요소 — 서로를 담지 않는 후보가 둘 이상이면 고르지 않고
        후보(식별자 · 태그 · 사각형)만 올린다(INSPECT_CANDIDATES).
        메뉴는 Studio 의 것이다(프레임 안에 메뉴를 그리지 않는다).
        사용자가 고른 칸의 **순번**이 내려온다(INSPECT_CHOOSE).
     3. 바깥 영역 — 고른 그 복제본에서 위로 한 칸(INSPECT_PARENT).
     4. 더블클릭 글자 편집 — 그 요소를 잠깐 contenteditable 로 연다.
        저장되는 것은 이 DOM 이 **아니다**: 문구만 올리고
        (INSPECT_TEXT) Studio 가 기존 patch 경로로 쓴다.
     5. 자유 배치 본체 끌기 — 좌표만 올린다(INSPECT_DRAG). 계산과
        확정은 Studio 의 기존 이동 엔진이 한다.
     6. 임시 미리보기 — Studio 가 내려보내는 글자 · 자유 배치 좌표
        (INSPECT_PREVIEW)를 고른 요소에 **CSSOM 으로만** 얹는다
        (이 문서 CSP 에서 style 속성은 막히고 CSSOM 쓰기는 된다 —
        IMORY_SANDBOX_SKIN_DESIGN.md §M-3).

   ★ 무엇을 고칠 수 있는가는 판단하지 않는다
     끌 수 있는가 · 글자를 고칠 수 있는가는 Studio 가 자기 draft 에서
     정해 INSPECT_CAPS 로 내려보낸다. 이 파일은 그 값을 따를 뿐이고,
     Studio 는 commit 이 와도 draft 에서 한 번 더 거른다.

   ★ 합성 이벤트(좌표 없는 dispatchEvent)는 예전 규칙이다 — 눌린
     노드에서 가장 가까운 요소. 실제 포인터 입력(isTrusted)만 위
     규칙을 탄다(native 와 같다).

   ★ 올라가는 값: 식별자 · 태그 · 사각형 · 문구 · 좌표 · 순번.
     HTML · class · selector · computed style 은 올라가지 않는다.

   전역으로 노출:
     createSandboxInspectDirect(api) -> direct

   api = {
     doc, win,
     root()                 렌더 컨테이너
     editIdOf(el)
     isProtected(el)        data-imory-region 안쪽인가
     resolveTarget(node)    예전 규칙(합성 이벤트용)
     rectOf(el)
     selected()             지금 고른 요소
     select(el)             고르기(부모에 알린다) — null 이면 해제
     hover(el)
     send(type, payload)    renderSeq 는 호출자가 단다
     error(code)
     TYPES
   }

   의존: skin/skin-inspect-target.js (pickInspectableAtPoint /
   isInspectableElement) — frame.html 이 먼저 로드한다.
========================================================== */


var SANDBOX_DIRECT_DRAG_THRESHOLD = 4;

var SANDBOX_DIRECT_ATTR_HOVER = "data-imory-inspector-hover";
var SANDBOX_DIRECT_ATTR_MOVABLE = "data-imory-inspector-movable";
var SANDBOX_DIRECT_ATTR_EDITING = "data-imory-inspector-editing";

/* skin/skin-layout.css 가 읽는 자유 배치 좌표 — 확정 뒤 다시 그려진
   자리와 끄는 동안 보이는 자리가 같은 계산에서 나오게 같은 이름을 쓴다
   (studio/preview/preview-bridge.js applyInspectorPreview 와 같다). */
var SANDBOX_DIRECT_LAYOUT_PROPS = { layoutX: "--imory-it-x", layoutY: "--imory-it-y" };


function createSandboxInspectDirect(api) {

  var doc = api.doc;
  var win = api.win;

  var caps = { editId: null, movable: false, textEditable: false };

  /* 겹친 요소 메뉴에 올린 후보 — 순번으로만 다시 고른다
     (반복 항목은 식별자가 같다) */
  var pickList = [];

  var editing = null;

  var press = null;

  var hoverFrame = 0;
  var hoverEvent = null;

  var markedHover = null;
  var markedMovable = null;

  /* 임시 미리보기 — 되돌릴 원래 값 */
  var preview = null;


  function pointUsable(event) {
    return !!event &&
      event.isTrusted === true &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY);
  }


  /* =========================================================
     자리로 고르기

     ★ 보호 영역(data-imory-region — 글 본문 · 주인장 도구) 안쪽은
       지금까지처럼 고를 수 없다. 그 자리의 맨 위 스킨 요소가 영역
       안쪽이면 **아무 것도 하지 않는다**(SANDBOX-6A §Q-9 그대로).
       영역 안쪽 요소는 후보 목록에서도 뺀다.
  ========================================================== */

  function pickAtPoint(x, y) {

    var container = api.root();

    if (
      !container ||
      typeof doc.elementsFromPoint !== "function" ||
      typeof pickInspectableAtPoint !== "function"
    ) {
      return null;
    }

    var stack = doc.elementsFromPoint(x, y) || [];

    var inside = [];

    for (var i = 0; i < stack.length; i += 1) {
      if (stack[i] !== container && container.contains(stack[i])) {
        inside.push(stack[i]);
      }
    }

    if (inside.length && api.isProtected(inside[0])) {
      return { blocked: true };
    }

    var open = inside.filter(function (node) {
      return !api.isProtected(node);
    });

    return pickInspectableAtPoint(open, container, api.editIdOf, win);

  }


  function describe(el) {

    return {
      editId: api.editIdOf(el),
      tagName: el.tagName.toLowerCase(),
      rect: api.rectOf(el)
    };

  }


  /* =========================================================
     표식 — 커서만 바꾼다(skin-sandbox-inspect.js 의 nonce 스타일).
     Preview 사본의 DOM 이라 저장되지 않는다.
  ========================================================== */

  function mark(previous, next, attr) {

    if (previous && previous !== next && previous.isConnected) {
      previous.removeAttribute(attr);
    }

    if (next && next.isConnected) {
      next.setAttribute(attr, "");
    }

    return next || null;

  }


  function syncMovableMark() {

    var selected = api.selected();

    var movable =
      !!selected &&
      caps.movable &&
      caps.editId === api.editIdOf(selected);

    markedMovable =
      mark(markedMovable, movable ? selected : null, SANDBOX_DIRECT_ATTR_MOVABLE);

  }


  /* =========================================================
     hover — 실제 포인터는 자리로(한 프레임에 한 번), 합성은 노드로
  ========================================================== */

  function applyHover(el) {

    markedHover = mark(markedHover, el, SANDBOX_DIRECT_ATTR_HOVER);

    api.hover(el);

  }


  function hoverTargetFor(event) {

    var picked = pickAtPoint(event.clientX, event.clientY);

    return (picked && !picked.blocked) ? picked.primary : null;

  }


  /* 처리했으면 true — 호출자는 예전 규칙으로 가지 않는다 */
  function pointerMove(event) {

    if (press) {
      dragMove(event);
      return true;
    }

    if (editing) {
      return true;
    }

    if (!pointUsable(event)) {
      return false;
    }

    hoverEvent = event;

    if (hoverFrame) {
      return true;
    }

    hoverFrame = win.requestAnimationFrame(function () {

      hoverFrame = 0;

      var pending = hoverEvent;

      hoverEvent = null;

      if (!pending || editing || press) {
        return;
      }

      applyHover(hoverTargetFor(pending) || null);

    });

    return true;

  }


  function clearHover() {

    if (hoverFrame) {
      win.cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
    }

    hoverEvent = null;

    applyHover(null);

  }


  /* =========================================================
     고르기 — pointerdown 에서(skin-sandbox-inspect.js 머리말:
     WebKit 터치에서 click 이 오지 않는다)
  ========================================================== */

  function selectAt(event) {

    if (!pointUsable(event)) {
      return false;
    }

    var picked = pickAtPoint(event.clientX, event.clientY);

    if (!picked) {
      return false;
    }

    if (picked.blocked) {
      pickList = [];
      api.error("not-inspectable");
      return true;
    }

    if (picked.overlap) {

      var selected = api.selected();

      pickList =
        picked.candidates.slice(0, 6).concat(picked.outer ? [picked.outer] : []);

      var candidates = [];

      for (var i = 0; i < pickList.length; i += 1) {

        var entry = describe(pickList[i]);

        if (!entry.editId || !entry.rect) {
          continue;
        }

        if (picked.outer && i === pickList.length - 1) {
          entry.outer = true;
        }

        if (pickList[i] === selected) {
          entry.current = true;
        }

        candidates.push(entry);

      }

      /* 칸을 하나도 만들 수 없으면(좌표를 못 잰 경우) 맨 위를 고른다 */
      if (candidates.length !== pickList.length) {
        pickList = [];
        api.select(picked.primary);
        syncMovableMark();
        return true;
      }

      api.send(api.TYPES.INSPECT_CANDIDATES, {
        point: {
          x: Math.round(event.clientX * 100) / 100,
          y: Math.round(event.clientY * 100) / 100
        },
        candidates: candidates
      });

      return true;

    }

    pickList = [];

    /* 래퍼만 있는 자리 = 빈 곳 → 선택 해제(DIRECT-UX-1 §1) */
    api.select(picked.primary);

    syncMovableMark();

    return true;

  }


  function pointerDown(event) {

    if (editing) {

      /* 고치는 중인 글자 안을 누르면 커서만 옮긴다 */
      if (editing.el.contains(event.target)) {
        return true;
      }

      finishTextEdit("commit");

    }

    var selected = api.selected();

    /* 고른 자유 배치 요소 위를 누르면 끌기를 준비한다. 움직이지 않고
       떼면 그때 보통 클릭처럼 고른다(native 의 click 과 같다). */
    if (
      pointUsable(event) &&
      event.isPrimary !== false &&
      selected &&
      caps.movable &&
      caps.editId === api.editIdOf(selected) &&
      selected.contains(event.target)
    ) {

      press = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        started: false,
        target: selected,
        frame: 0,
        down: event
      };

      return true;

    }

    return selectAt(event);

  }


  /* =========================================================
     본체 끌기(자유 배치)
  ========================================================== */

  function postDrag(phase, x, y) {

    api.send(api.TYPES.INSPECT_DRAG, {
      phase: phase,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100
    });

  }


  function dragMove(event) {

    if (!press || event.pointerId !== press.pointerId) {
      return;
    }

    if (!press.started) {

      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < SANDBOX_DIRECT_DRAG_THRESHOLD) {
        return;
      }

      press.started = true;

      try {
        press.target.setPointerCapture(event.pointerId);
      } catch (err) {
        /* 캡처가 안 돼도 document 에 온다 */
      }

      clearHover();

      postDrag("start", press.startX, press.startY);

    }

    event.preventDefault();

    press.lastX = event.clientX;
    press.lastY = event.clientY;

    if (press.frame) {
      return;
    }

    var current = press;

    press.frame = win.requestAnimationFrame(function () {

      current.frame = 0;

      if (press === current && current.started) {
        postDrag("move", current.lastX, current.lastY);
      }

    });

  }


  function pointerUp(event) {

    if (!press || event.pointerId !== press.pointerId) {
      return false;
    }

    var current = press;

    press = null;

    if (current.frame) {
      win.cancelAnimationFrame(current.frame);
    }

    if (!current.started) {

      /* 흔들림 없이 뗐다 = 클릭 — 누른 자리에서 우선순위로 고른다 */
      selectAt(current.down);

      return true;

    }

    postDrag("end", event.clientX, event.clientY);

    return true;

  }


  function pointerCancel(event) {

    if (!press || (event && event.pointerId !== press.pointerId)) {
      return;
    }

    var current = press;

    press = null;

    if (current.frame) {
      win.cancelAnimationFrame(current.frame);
    }

    if (current.started) {
      postDrag("cancel", current.lastX, current.lastY);
    }

  }


  /* =========================================================
     더블클릭 글자 편집
  ========================================================== */

  /* textContent 는 <br> 을 버리고 innerText 는 text-transform 을
     적용한다 — 사람이 친 글자를 노드에서 직접 읽는다(native 와 같다). */
  function readEditableText(node) {

    var out = "";

    Array.prototype.forEach.call(node.childNodes, function (child) {

      if (child.nodeType === 3) {
        out += child.data;
        return;
      }

      if (child.nodeName === "BR") {
        out += "\n";
        return;
      }

      if (child.nodeType === 1) {

        if (/^(DIV|P)$/.test(child.nodeName) && out && out.charAt(out.length - 1) !== "\n") {
          out += "\n";
        }

        out += readEditableText(child);

      }

    });

    return out;

  }


  function editText() {

    if (!editing) {
      return "";
    }

    var text = readEditableText(editing.el).replace(/\r\n?/g, "\n");

    var last = editing.el.lastChild;

    if (last && last.nodeName === "BR" && text.charAt(text.length - 1) === "\n") {
      text = text.slice(0, -1);
    }

    return text;

  }


  function postText(phase, editId, text) {

    /* 상한을 넘는 문구는 프로토콜이 버린다 — 조용히 잘라 저장하지
       않는다. 입력 중이면 알리지 않고, 확정이면 취소로 되돌린다. */
    if (typeof SANDBOX_INSPECT_MAX_TEXT_CHARS === "number" && text.length > SANDBOX_INSPECT_MAX_TEXT_CHARS) {
      return false;
    }

    api.send(api.TYPES.INSPECT_TEXT, { phase: phase, editId: editId, text: text });

    return true;

  }


  function onEditInput() {

    if (!editing || editing.composing) {
      return;
    }

    postText("input", editing.editId, editText());

  }


  function onEditCompositionStart() {
    if (editing) {
      editing.composing = true;
    }
  }


  function onEditCompositionEnd() {

    if (!editing) {
      return;
    }

    editing.composing = false;

    onEditInput();

  }


  function onEditKeydown(event) {

    if (!editing) {
      return;
    }

    if (event.key === "Escape") {

      event.preventDefault();
      event.stopPropagation();

      finishTextEdit("cancel");

      return;

    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {

      event.preventDefault();
      event.stopPropagation();

      finishTextEdit("commit");

    }

  }


  function onEditBlur() {

    if (editing && !editing.finishing) {
      finishTextEdit("commit");
    }

  }


  function onEditPaste(event) {

    if (!editing || editing.plainOnly) {
      return;
    }

    event.preventDefault();

    var text =
      (event.clipboardData && event.clipboardData.getData("text/plain")) || "";

    doc.execCommand("insertText", false, text);

  }


  function beginTextEdit(el) {

    if (editing || !el || !el.isConnected) {
      return false;
    }

    clearPreview();

    editing = {
      el: el,
      editId: api.editIdOf(el),
      original: el.textContent,
      previousEditable: el.getAttribute("contenteditable"),
      composing: false,
      finishing: false,
      plainOnly: false
    };

    try {
      el.contentEditable = "plaintext-only";
    } catch (err) {
      /* 모르는 값이면 예외다 — 아래에서 true 로 */
    }

    editing.plainOnly = el.contentEditable === "plaintext-only";

    if (!editing.plainOnly) {
      el.contentEditable = "true";
    }

    el.setAttribute(SANDBOX_DIRECT_ATTR_EDITING, "");
    el.spellcheck = false;

    el.addEventListener("input", onEditInput);
    el.addEventListener("keydown", onEditKeydown);
    el.addEventListener("blur", onEditBlur);
    el.addEventListener("paste", onEditPaste);
    el.addEventListener("compositionstart", onEditCompositionStart);
    el.addEventListener("compositionend", onEditCompositionEnd);

    clearHover();

    el.focus({ preventScroll: true });

    var range = doc.createRange();

    range.selectNodeContents(el);

    var selection = win.getSelection();

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    postText("begin", editing.editId, editing.original);

    return true;

  }


  /* action: "commit" | "cancel" | "discard"(렌더로 DOM 이 바뀌었다) */
  function finishTextEdit(action) {

    var current = editing;

    if (!current || current.finishing) {
      return;
    }

    current.finishing = true;

    var text = action === "commit" ? editText() : current.original;

    var el = current.el;

    el.removeEventListener("input", onEditInput);
    el.removeEventListener("keydown", onEditKeydown);
    el.removeEventListener("blur", onEditBlur);
    el.removeEventListener("paste", onEditPaste);
    el.removeEventListener("compositionstart", onEditCompositionStart);
    el.removeEventListener("compositionend", onEditCompositionEnd);

    el.removeAttribute(SANDBOX_DIRECT_ATTR_EDITING);

    if (current.previousEditable === null) {
      el.removeAttribute("contenteditable");
    } else {
      el.setAttribute("contenteditable", current.previousEditable);
    }

    editing = null;

    var selection = win.getSelection();

    if (selection && el.isConnected && el.contains(selection.anchorNode)) {
      selection.removeAllRanges();
    }

    if (action === "discard") {
      return;
    }

    if (action === "commit" && !postText("commit", current.editId, text)) {
      action = "cancel";
      text = current.original;
    }

    if (action === "cancel") {

      if (el.isConnected) {
        el.textContent = current.original;
      }

      postText("cancel", current.editId, text);

    }

  }


  function dblClick(event) {

    if (editing) {
      return;
    }

    var target = null;

    if (pointUsable(event)) {
      var picked = pickAtPoint(event.clientX, event.clientY);
      target = (picked && !picked.blocked && !picked.overlap) ? picked.primary : null;
    }

    if (!target) {
      target = api.resolveTarget(event.target);
    }

    var selected = api.selected();

    if (
      target &&
      target === selected &&
      caps.textEditable &&
      caps.editId === api.editIdOf(target)
    ) {
      beginTextEdit(target);
    }

  }


  /* 처리했으면 true — 글자를 고치는 중의 키는 그 요소가 받는다 */
  function keyDown() {
    return !!editing;
  }


  /* =========================================================
     Studio → 이 문서
  ========================================================== */

  function setCaps(payload) {

    var editId =
      (payload && typeof payload.editId === "string") ? payload.editId : null;

    caps = {
      editId: editId,
      movable: !!editId && payload.movable === true,
      textEditable: !!editId && payload.textEditable === true
    };

    syncMovableMark();

  }


  function choose(index) {

    var el =
      (Number.isInteger(index) && index >= 0) ? pickList[index] : null;

    pickList = [];

    if (el && el.isConnected) {
      api.select(el);
      syncMovableMark();
    }

  }


  /* 바깥 영역 — 위로 한 칸. 크기가 같은 래퍼는 건너뛴다
     (preview-inspect-direct.js selectParent 와 같은 규칙) */
  function sameBox(a, b) {

    return (
      Math.abs(a.left - b.left) <= 1 &&
      Math.abs(a.top - b.top) <= 1 &&
      Math.abs(a.width - b.width) <= 1 &&
      Math.abs(a.height - b.height) <= 1
    );

  }


  function selectParent() {

    var selected = api.selected();
    var container = api.root();

    if (!selected || !container || !selected.isConnected) {
      return;
    }

    var base = selected.getBoundingClientRect();

    var fallback = null;

    var current = selected.parentElement;

    while (current && current !== container) {

      if (
        api.editIdOf(current) &&
        !api.isProtected(current) &&
        typeof isInspectableElement === "function" &&
        isInspectableElement(current)
      ) {

        if (!fallback) {
          fallback = current;
        }

        if (!sameBox(current.getBoundingClientRect(), base)) {
          api.select(current);
          syncMovableMark();
          return;
        }

      }

      current = current.parentElement;

    }

    if (fallback) {
      api.select(fallback);
      syncMovableMark();
    }

  }


  /* =========================================================
     임시 미리보기 — 글자와 자유 배치 좌표 둘뿐
  ========================================================== */

  function clearPreview() {

    var current = preview;

    preview = null;

    if (!current || !current.el.isConnected) {
      return;
    }

    if (typeof current.text === "string") {
      current.el.textContent = current.text;
    }

    Object.keys(current.props).forEach(function (name) {

      var before = current.props[name];

      if (before.value) {
        current.el.style.setProperty(name, before.value, before.priority);
      } else {
        current.el.style.removeProperty(name);
      }

    });

  }


  function rememberProp(name) {

    if (!Object.prototype.hasOwnProperty.call(preview.props, name)) {
      preview.props[name] = {
        value: preview.el.style.getPropertyValue(name),
        priority: preview.el.style.getPropertyPriority(name)
      };
    }

  }


  function applyPreview(payload) {

    if (!payload || payload.clear === true) {
      clearPreview();
      return;
    }

    var selected = api.selected();

    if (
      editing ||
      !selected ||
      !selected.isConnected ||
      payload.editId !== api.editIdOf(selected)
    ) {
      clearPreview();
      return;
    }

    if (!preview || preview.el !== selected) {
      clearPreview();
      preview = { el: selected, text: null, props: {} };
    }

    if (typeof payload.text === "string") {

      if (typeof preview.text !== "string") {
        preview.text = selected.textContent;
      }

      rememberProp("white-space");

      /* textContent 만 쓴다 — 입력을 마크업으로 해석하지 않는다 */
      selected.textContent = payload.text;

      if (payload.text.indexOf("\n") === -1) {
        selected.style.removeProperty("white-space");
      } else {
        selected.style.setProperty("white-space", "pre-wrap");
      }

    }

    Object.keys(SANDBOX_DIRECT_LAYOUT_PROPS).forEach(function (key) {

      var value = payload[key];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        return;
      }

      var name = SANDBOX_DIRECT_LAYOUT_PROPS[key];

      rememberProp(name);

      selected.style.setProperty(name, String(Math.min(1, Math.max(0, value))));

    });

  }


  /* =========================================================
     모드를 끄거나 다시 그렸다 — 임시 상태를 전부 버린다
  ========================================================== */

  function reset(options) {

    var disabled = !!(options && options.disabled);

    if (editing) {
      finishTextEdit(editing.el.isConnected && disabled ? "cancel" : "discard");
    }

    if (press) {
      pointerCancel(null);
    }

    pickList = [];

    clearPreview();

    clearHover();

    if (disabled) {
      caps = { editId: null, movable: false, textEditable: false };
    }

    syncMovableMark();

  }


  return {
    pointerDown: pointerDown,
    pointerMove: pointerMove,
    pointerUp: pointerUp,
    pointerCancel: pointerCancel,
    dblClick: dblClick,
    keyDown: keyDown,
    setCaps: setCaps,
    choose: choose,
    selectParent: selectParent,
    preview: applyPreview,
    reset: reset,
    syncMovableMark: syncMovableMark,
    isEditing: function () {
      return !!editing;
    },
    debugState: function () {
      return {
        caps: { editId: caps.editId, movable: caps.movable, textEditable: caps.textEditable },
        editing: !!editing,
        editingEditId: editing ? editing.editId : null,
        dragging: !!(press && press.started),
        pickCount: pickList.length,
        previewing: !!preview
      };
    }
  };

}
