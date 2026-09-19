/* =========================================================
   PREVIEW — 클릭하고 바로 고치는 Select (DIRECT-UX-1, iframe 쪽)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md

   studio/preview/preview-bridge.js(ES 모듈)의 Inspector 가 쓰는
   "직접 조작" 부분만 모았다. 브리지는 이미 2천 줄이 넘고, 여기
   있는 것은 한 덩어리(사용자의 손이 Preview 안에서 하는 일)라
   따로 둔다. classic script 이고 window.previewInspectDirect 하나만
   내놓는다. 브리지의 상태(고른 요소 · 스킨 루트 · 부모로 보내기)는
   install() 로 받은 함수로만 읽는다 — 이 파일이 브리지 변수를 직접
   만지지 않는다.

   ★ 하는 일
     1. 선택 우선순위 — 눌린 **자리**에 겹친 요소 전부를 보고
        (elementsFromPoint) 글자 · 이미지 · 링크 · 구성 요소를 래퍼보다
        먼저 고른다. 래퍼만 있는 자리는 빈 곳이다(선택 해제).
        순위 규칙은 skin/skin-inspect-target.js pickInspectableAtPoint.
     2. 겹친 요소 — 서로를 담지 않는 후보가 둘 이상이면 고르지 않고
        후보 목록을 Studio 로 올린다(preview:inspect-pick). Studio 가
        메뉴를 띄우고 사용자가 고른 칸의 **순번**만 내려보낸다
        (preview:inspector-choose). 반복 항목은 같은 식별자를 공유하므로
        식별자가 아니라 이 문서가 들고 있는 요소 참조로 고른다.
     3. 바깥 영역 — 고른 요소에서 위로 한 칸(크기가 같은 래퍼는 건너뛴다)
        (preview:inspector-parent).
     4. 텍스트 더블클릭 편집 — 그 자리를 잠시 contenteditable 로 연다.
        저장되는 것은 이 DOM 이 아니다: 끝나면 문구만 Studio 로 올리고
        (preview:inspect-text), Studio 가 기존 확정 경로
        (commitStudioInspectorText)로 SkinPackage 에 쓴다.
     5. 본문 끌어 옮기기 — 자유 배치 안의 요소는 본체를 끌면 움직인다.
        포인터 좌표만 올려보내고(preview:inspect-drag), 계산과 확정은
        Studio 의 기존 이동 엔진(studio-inspector-layout.js)이 한다.

   ★ 합성 이벤트(좌표가 없는 dispatchEvent)는 예전 규칙 그대로다
     — 눌린 노드에서 가장 가까운 요소. 좌표가 없으니 "그 자리에 무엇이
     겹쳐 있는가"를 물을 수 없다. 실제 포인터 입력(isTrusted)만 위
     규칙을 탄다.

   ★ Studio 가 알려 주는 것 — preview:inspector-caps
     { editId, movable, textEditable }. 고른 요소를 끌 수 있는가,
     더블클릭으로 글자를 고칠 수 있는가는 **Studio 가 지금 draft 에서**
     정한다(describeInspectorElement). 이 문서는 판단하지 않는다.
========================================================== */

(function () {

  "use strict";

  const DRAG_THRESHOLD = 4;

  const MSG_PICK = "preview:inspect-pick";
  const MSG_TEXT = "preview:inspect-text";
  const MSG_DRAG = "preview:inspect-drag";

  const MSG_CAPS = "preview:inspector-caps";
  const MSG_CHOOSE = "preview:inspector-choose";
  const MSG_PARENT = "preview:inspector-parent";

  const ATTR_HOVER = "data-imory-inspector-hover";
  const ATTR_MOVABLE = "data-imory-inspector-movable";
  const ATTR_EDITING = "data-imory-inspector-editing";

  let api = null;

  let caps = { editId: null, movable: false, textEditable: false };

  let pickList = [];

  let editing = null;

  let press = null;

  let suppressClickUntil = 0;

  let hoverFrame = 0;

  let hoverEvent = null;

  let markedHover = null;

  let markedMovable = null;


  function install(bridgeApi) {
    api = bridgeApi;
  }


  function active() {
    return !!api && api.isActive();
  }


  function pointUsable(event) {
    return !!event &&
      event.isTrusted === true &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY);
  }


  function pickAt(x, y) {

    const root = api.root();

    if (!root || typeof document.elementsFromPoint !== "function" ||
        typeof window.pickInspectableAtPoint !== "function") {
      return null;
    }

    return window.pickInspectableAtPoint(
      document.elementsFromPoint(x, y),
      root,
      api.editIdOf,
      window
    );

  }


  function describe(el) {

    return {
      editId: api.editIdOf(el),
      tagName: el.tagName.toLowerCase(),
      rect: api.rectOf(el),
      visibleRect: api.visibleRectOf(el)
    };

  }


  /* =========================================================
     표식 — 커서만 바꾼다(preview-frame.html 의 inspector CSS).
     스킨 DOM 에 붙지만 Preview 사본이라 저장되지 않는다(Save 가 읽는
     것은 Studio 의 SkinPackage 문자열이다).
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

    const selected = api ? api.selected() : null;

    const movable =
      !!selected &&
      caps.movable &&
      caps.editId === api.editIdOf(selected);

    markedMovable =
      mark(markedMovable, movable ? selected : null, ATTR_MOVABLE);

  }


  /* =========================================================
     hover — 실제 포인터는 자리로, 합성 이벤트는 노드로
  ========================================================== */

  function hoverTargetFor(event) {

    if (!pointUsable(event)) {
      return undefined;
    }

    const picked = pickAt(event.clientX, event.clientY);

    return picked ? picked.primary : null;

  }


  function applyHover(el) {

    markedHover = mark(markedHover, el, ATTR_HOVER);

    api.hover(el);

  }


  /* 브리지의 pointerover 가 부른다. 처리했으면 true. */
  function pointerOver(event) {

    if (editing || (press && press.started)) {
      return true;
    }

    const target = hoverTargetFor(event);

    if (target === undefined) {
      return false;
    }

    applyHover(target);

    return true;

  }


  /* 투명한 덮개 밑에서 움직이면 pointerover 가 다시 오지 않는다
     (target 이 그대로다) — 움직임마다 한 프레임에 한 번 다시 고른다. */
  function onPointerMoveHover(event) {

    if (!active() || editing || (press && press.started) || !pointUsable(event)) {
      return;
    }

    hoverEvent = event;

    if (hoverFrame) {
      return;
    }

    hoverFrame = window.requestAnimationFrame(() => {

      hoverFrame = 0;

      const pending = hoverEvent;

      hoverEvent = null;

      if (!pending || !active()) {
        return;
      }

      applyHover(hoverTargetFor(pending) || null);

    });

  }


  /* =========================================================
     click — 처리했으면 true(브리지는 예전 규칙으로 가지 않는다)
  ========================================================== */

  function handleClick(event) {

    if (Date.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      return true;
    }

    if (editing) {

      /* 고치는 중인 글자 안을 누르면 커서만 옮긴다(링크여도 이동하지
         않는다 — 브리지가 이미 preventDefault 했다). */
      if (editing.el.contains(event.target)) {
        return true;
      }

      finishTextEdit("commit");

    }

    if (!pointUsable(event)) {
      return false;
    }

    const picked = pickAt(event.clientX, event.clientY);

    if (!picked) {
      return false;
    }

    if (picked.overlap) {

      const selected = api.selected();

      pickList =
        picked.candidates.slice(0, 6).concat(picked.outer ? [picked.outer] : []);

      api.post({
        type: MSG_PICK,
        point: { x: event.clientX, y: event.clientY },
        candidates: pickList.map((el, index) => ({
          ...describe(el),
          outer: !!picked.outer && index === pickList.length - 1,
          current: el === selected
        }))
      });

      return true;

    }

    pickList = [];

    api.select(picked.primary);

    return true;

  }


  /* =========================================================
     바깥 영역 — 위로 한 칸. 크기가 같은 래퍼는 건너뛴다(눈으로는
     아무 것도 바뀌지 않아 "안 눌렸다"로 읽힌다).
  ========================================================== */

  function sameBox(a, b) {

    return (
      Math.abs(a.left - b.left) <= 1 &&
      Math.abs(a.top - b.top) <= 1 &&
      Math.abs(a.width - b.width) <= 1 &&
      Math.abs(a.height - b.height) <= 1
    );

  }


  function selectParent() {

    const selected = api.selected();
    const root = api.root();

    if (!selected || !root || !selected.isConnected) {
      return;
    }

    const base = selected.getBoundingClientRect();

    let fallback = null;

    let current = selected.parentElement;

    while (current && current !== root) {

      if (api.editIdOf(current) && window.isInspectableElement(current)) {

        if (!fallback) {
          fallback = current;
        }

        if (!sameBox(current.getBoundingClientRect(), base)) {
          api.select(current);
          return;
        }

      }

      current = current.parentElement;

    }

    if (fallback) {
      api.select(fallback);
    }

  }


  /* =========================================================
     텍스트 더블클릭 편집
  ========================================================== */

  /* textContent 는 줄바꿈(<br>)을 버리고, innerText 는 text-transform
     까지 적용해 대문자로 바꿔 돌려준다 — 저장할 문구는 사람이 친
     글자여야 하므로 노드를 직접 읽는다. */
  function readEditableText(node) {

    let out = "";

    Array.prototype.forEach.call(node.childNodes, (child) => {

      if (child.nodeType === 3) {
        out += child.data;
        return;
      }

      if (child.nodeName === "BR") {
        out += "\n";
        return;
      }

      if (child.nodeType === 1) {

        if (/^(DIV|P)$/.test(child.nodeName) && out && !out.endsWith("\n")) {
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

    let text =
      readEditableText(editing.el).replace(/\r\n?/g, "\n");

    /* 끝에 붙는 <br> 하나는 브라우저가 빈 줄을 보이려고 넣는 자리표시다 */
    const last = editing.el.lastChild;

    if (last && last.nodeName === "BR" && text.endsWith("\n")) {
      text = text.slice(0, -1);
    }

    return text;

  }


  function onEditInput() {

    if (!editing || editing.composing) {
      return;
    }

    api.post({ type: MSG_TEXT, phase: "input", editId: editing.editId, text: editText() });

  }


  function onEditCompositionStart() {
    if (editing) editing.composing = true;
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


  /* contenteditable="true" 로 떨어진 브라우저에서 서식 붙여넣기를
     막는다 — 글자만 들어간다. */
  function onEditPaste(event) {

    if (!editing || editing.plainOnly) {
      return;
    }

    event.preventDefault();

    const text =
      (event.clipboardData && event.clipboardData.getData("text/plain")) || "";

    document.execCommand("insertText", false, text);

  }


  function beginTextEdit(el) {

    if (editing || !el || !el.isConnected) {
      return false;
    }

    editing = {
      el,
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

    el.setAttribute(ATTR_EDITING, "");
    el.spellcheck = false;

    el.addEventListener("input", onEditInput);
    el.addEventListener("keydown", onEditKeydown);
    el.addEventListener("blur", onEditBlur);
    el.addEventListener("paste", onEditPaste);
    el.addEventListener("compositionstart", onEditCompositionStart);
    el.addEventListener("compositionend", onEditCompositionEnd);

    el.focus({ preventScroll: true });

    const range = document.createRange();

    range.selectNodeContents(el);

    const selection = window.getSelection();

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    api.post({ type: MSG_TEXT, phase: "begin", editId: editing.editId, text: editing.original });

    return true;

  }


  /* action: "commit" | "cancel" | "discard"(렌더로 DOM 이 바뀌었다 —
     알릴 것도 되돌릴 것도 없다) */
  function finishTextEdit(action) {

    const current = editing;

    if (!current || current.finishing) {
      return;
    }

    current.finishing = true;

    const text = action === "commit" ? editText() : current.original;

    const el = current.el;

    el.removeEventListener("input", onEditInput);
    el.removeEventListener("keydown", onEditKeydown);
    el.removeEventListener("blur", onEditBlur);
    el.removeEventListener("paste", onEditPaste);
    el.removeEventListener("compositionstart", onEditCompositionStart);
    el.removeEventListener("compositionend", onEditCompositionEnd);

    el.removeAttribute(ATTR_EDITING);

    if (current.previousEditable === null) {
      el.removeAttribute("contenteditable");
    } else {
      el.setAttribute("contenteditable", current.previousEditable);
    }

    if (action === "cancel" && el.isConnected) {
      el.textContent = current.original;
    }

    editing = null;

    const selection = window.getSelection();

    if (selection && el.isConnected && el.contains(selection.anchorNode)) {
      selection.removeAllRanges();
    }

    if (action === "discard") {
      return;
    }

    api.post({
      type: MSG_TEXT,
      phase: action === "commit" ? "commit" : "cancel",
      editId: current.editId,
      text
    });

  }


  function onDblClick(event) {

    if (!active() || editing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    let target = null;

    if (pointUsable(event)) {
      const picked = pickAt(event.clientX, event.clientY);
      target = picked && !picked.overlap ? picked.primary : null;
    }

    if (!target) {
      target = api.resolveTarget(event.target);
    }

    const selected = api.selected();

    if (
      target &&
      target === selected &&
      caps.textEditable &&
      caps.editId === api.editIdOf(target)
    ) {
      beginTextEdit(target);
    }

  }


  /* =========================================================
     본체 끌어 옮기기(자유 배치 안의 요소)
  ========================================================== */

  function onPointerDown(event) {

    if (!active() || editing || event.button !== 0 || event.isPrimary === false) {
      return;
    }

    const selected = api.selected();

    if (
      !selected ||
      !caps.movable ||
      caps.editId !== api.editIdOf(selected) ||
      !selected.contains(event.target)
    ) {
      return;
    }

    press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      target: selected,
      frame: 0,
      lastX: event.clientX,
      lastY: event.clientY
    };

  }


  function postDrag(phase, x, y) {
    api.post({ type: MSG_DRAG, phase, x, y });
  }


  function onPointerMove(event) {

    if (!press || event.pointerId !== press.pointerId) {
      return;
    }

    const dx = event.clientX - press.startX;
    const dy = event.clientY - press.startY;

    if (!press.started) {

      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }

      press.started = true;

      try {
        press.target.setPointerCapture(event.pointerId);
      } catch (err) {
        /* 캡처가 안 돼도 document 에 온다 */
      }

      applyHover(null);

      postDrag("start", press.startX, press.startY);

    }

    event.preventDefault();

    press.lastX = event.clientX;
    press.lastY = event.clientY;

    if (press.frame) {
      return;
    }

    const current = press;

    press.frame = window.requestAnimationFrame(() => {

      current.frame = 0;

      if (press === current && current.started) {
        postDrag("move", current.lastX, current.lastY);
      }

    });

  }


  function onPointerUp(event) {

    if (!press || event.pointerId !== press.pointerId) {
      return;
    }

    const current = press;

    press = null;

    if (current.frame) {
      window.cancelAnimationFrame(current.frame);
    }

    if (!current.started) {
      return;
    }

    /* 끈 뒤 따라오는 click 은 "다른 요소를 골랐다"가 아니다 */
    suppressClickUntil = Date.now() + 500;

    postDrag("end", event.clientX, event.clientY);

  }


  function onPointerCancel(event) {

    if (!press || (event && event.pointerId !== press.pointerId)) {
      return;
    }

    const current = press;

    press = null;

    if (current.frame) {
      window.cancelAnimationFrame(current.frame);
    }

    if (current.started) {
      postDrag("cancel", current.lastX, current.lastY);
    }

  }


  /* =========================================================
     Studio -> 이 문서
  ========================================================== */

  function handleMessage(data) {

    if (!data || typeof data.type !== "string") {
      return false;
    }

    if (data.type === MSG_CAPS) {

      const editId =
        (typeof data.editId === "string" && window.isValidInspectorEditId(data.editId))
          ? data.editId
          : null;

      caps = {
        editId,
        movable: !!editId && data.movable === true,
        textEditable: !!editId && data.textEditable === true
      };

      syncMovableMark();

      return true;

    }

    if (data.type === MSG_CHOOSE) {

      const index = Number(data.index);

      const el =
        Number.isInteger(index) && index >= 0 ? pickList[index] : null;

      pickList = [];

      if (active() && el && el.isConnected) {
        api.select(el);
      }

      return true;

    }

    if (data.type === MSG_PARENT) {

      if (active()) {
        selectParent();
      }

      return true;

    }

    return false;

  }


  /* 모드를 끄거나 다시 그려 DOM 이 바뀌었다 — 임시 상태를 전부 버린다 */
  function reset() {

    if (editing) {
      finishTextEdit(editing.el.isConnected ? "cancel" : "discard");
    }

    if (press) {
      onPointerCancel(null);
    }

    pickList = [];

    markedHover = mark(markedHover, null, ATTR_HOVER);

    if (!active()) {
      caps = { editId: null, movable: false, textEditable: false };
    }

    syncMovableMark();

  }


  function isEditing() {
    return !!editing;
  }


  document.addEventListener("dblclick", onDblClick, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointermove", onPointerMoveHover, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerCancel, true);


  window.previewInspectDirect = {
    install,
    handleClick,
    pointerOver,
    handleMessage,
    reset,
    isEditing,
    syncMovableMark,

    /* 테스트용 읽기 창구 — production 코드는 읽지 않는다 */
    getState() {
      return {
        caps: { ...caps },
        editing: !!editing,
        editingEditId: editing ? editing.editId : null,
        dragging: !!(press && press.started),
        pickCount: pickList.length
      };
    }
  };

}());
