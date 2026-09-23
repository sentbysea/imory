/* =========================================================
   STUDIO — HOME 캔버스 Inspector (HOME-CANVAS-INSPECTOR-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §22
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14-15 (PLAN)

   ── 무엇을 푸는가 ───────────────────────────────────────
   Canvas 요소를 눌러도 왼쪽 패널에는 "Preview에서 고칠 요소를
   누르세요"만 보였다. 선택 상태는 이미 있었지만(SELECT-1A ~
   TRANSFORM-1C) 그것을 **표시하는 화면**이 없었다.

   ── 소유권 — 세 번째 저장소를 만들지 않는다 ─────────────
   왼쪽 패널의 Select 자리에는 이제 두 화면이 산다.

     기존 Inspector 팝오버(#studioInspectorPopover)  template 요소
     이 파일의 Canvas 패널(#studioCanvasInspector)   Canvas 요소

   둘은 **동시에 켜지지 않는다**. 그것을 지키는 것은 이 파일이
   아니라 이미 있는 선택 라우터다(studio-inspector.js
   routeStudioInspectSelectMessage · setStudioInspectorSelection —
   한쪽이 켜질 때 다른 쪽을 건는다). 이 파일은 그 결과를 **읽어서
   그릴 뿐** 누가 주인인지 다시 판단하지 않는다.

     읽는 곳  getStudioCanvasSelection()   무엇이 골라져 있나
              studioCanvasDraftPayload()   지금 draft 의 그 값

   ── 언제 다시 그리는가 ──────────────────────────────────
   `studio-canvas-panel` 한 이벤트다(studio-canvas-selection.js
   notifyStudioCanvasPanel). 선택 확정 · 편집 모드 변경 · draft 변경
   (드래그 · 리사이즈 · 회전 · Undo/Redo · Import · 재로드)이 전부
   그 한 줄을 지난다. 이 파일이 따로 폴링하거나 draft revision 을
   세지 않는다.

   ── 쓰기 경로 ───────────────────────────────────────────
   모든 수정이 `commitStudioCanvasInspectorEdit()` 하나를 지난다
   (studio-canvas-selection.js). 프레임의 직접 조작이 쓰는 그 관문
   한 벌을 그대로 쓴다 — 선택 · 순번 · hidden/locked · 허용 키 ·
   expected · 범위. 패널이 draft 를 직접 만지는 줄은 **없다**.

   ── 한 세션 = Undo 한 칸 ────────────────────────────────
   글자    focus 에서 기록 한 칸을 잡고, 입력마다 draft 를 고치되
           기록은 만들지 않으며(coalesce), blur 에서 한 칸으로
           확정한다. Escape 는 시작값으로 되돌리고 기록하지 않는다.
   숫자    입력 중에는 아무것도 쓰지 않는다. Enter · blur 에서 한
           번 쓰므로 그 한 번이 곧 한 칸이다.

   ── 이번 단계가 하지 않는 것 ────────────────────────────
   hidden/locked 토글(레이어 목록이 없어 되돌릴 길이 없다) · 레이어
   목록 · 다중 일괄 편집 · 그룹 transform · 글꼴 · 크기 · 색 · 정렬 ·
   shape 스타일 · 이미지 업로드 · Crop · 카테고리 선택 UI ·
   HTML 편집 · v2.

   classic script 다. 의존(먼저 로드되어야 함):
     skin/skin-home-canvas.js                normalizeSkinHomeCanvasRotation
                                             SKIN_HOME_CANVAS_* 상수
     studio/inspector/studio-canvas-selection.js
                                             getStudioCanvasSelection ·
                                             commitStudioCanvasInspectorEdit ·
                                             studioCanvasDraftPayload
     studio/studio-history.js                captureStudioHistoryState ·
                                             recordStudioHistory
                                             (호출 시점에만 읽는다)
========================================================== */


/* 사람이 읽는 칸 이름. 값은 전부 Canvas 좌표 px 이다(계약 §4). */
const STUDIO_CANVAS_FIELD_LABELS = {
  x: "X",
  y: "Y",
  width: "Width",
  height: "Height",
  rotation: "Rotation"
};


/* 확정이 거부된 이유 → 사람이 읽는 한 줄. 모르는 사유는 마지막
   문장으로 떨어진다(거부 자체를 숨기지 않는다). */
const STUDIO_CANVAS_REJECT_MESSAGES = {
  coord: "±100000 안의 숫자여야 합니다.",
  size: "0보다 크고 100000 이하인 숫자여야 합니다.",
  auto: "이 요소는 Auto 높이를 쓸 수 없습니다.",
  rotation: "유한한 숫자여야 합니다.",
  text: "글자는 문자열이어야 합니다.",
  length: "글자는 2000자를 넘을 수 없습니다.",
  expected: "그 사이에 값이 바뀌었습니다 — 새 값을 보고 다시 고쳐 주세요.",
  selection: "고른 요소가 바뀌었습니다.",
  generation: "고른 요소가 바뀌었습니다.",
  element: "그 요소를 더 이상 고칠 수 없습니다.",
  "not-editing": "지금은 캔버스를 고칠 수 없습니다.",
  current: "저장된 값이 계약을 어기고 있어 고칠 수 없습니다.",

  /* HOME-CANVAS-V2-ELEMENTS-1 — 소속과 따라가기(계약 §28) */
  layout: "프레임이 지금 화면의 어디에 있는지 아직 모릅니다 — 잠시 뒤에 다시 눌러 주세요.",
  "auto-origin": "높이가 Auto 이고 세로 기준점이 위가 아니라서 자리를 정확히 옮길 수 없습니다 — 높이를 숫자로 둔 뒤에 해 주세요.",
  primary: "메인 비주얼의 대표 사진은 빼거나 지울 수 없습니다.",
  frame: "어느 메인 비주얼에 묶을지 골라 주세요.",
  pin: "먼저 따라가기 방식을 기준점으로 바꿔 주세요.",
  limit: "이 자리에는 더 넣을 수 없습니다(한 층에 200개).",
  invalid: "계약을 어기는 모양이라 바꾸지 않았습니다.",
  space: "지금은 이 프레임의 자를 만들 수 없습니다."
};


/* =========================================================
   상태 — 그려 둔 화면의 **모양**과 열려 있는 입력 세션뿐이다.

   값은 하나도 들고 있지 않는다. 무엇이 골라져 있고 그 값이
   얼마인지는 언제나 getStudioCanvasSelection() 과 draft 에서
   그때그때 읽는다(머리말 "세 번째 저장소를 만들지 않는다").
========================================================== */

let studioCanvasInspectorRoot = null;

let studioCanvasInspectorBody = null;

/* 지금 그려 둔 화면이 어떤 모양인가 — 이것이 같으면 DOM 을 다시
   만들지 않고 값만 갈아 끼운다. 다시 만들면 입력 중이던 칸이
   포커스와 커서를 잃는다. */
let studioCanvasInspectorShape = "";

/* 지금 화면의 입력 요소들 — { x, y, width, height, rotation, auto, text } */
let studioCanvasInspectorInputs = null;

/* 칸마다의 오류 문구 자리 */
let studioCanvasInspectorErrors = null;

/*
  글자 입력 세션 — focus 에서 열리고 blur 에서 닫힌다.

    id       그때 고른 요소
    start    focus 시점의 문구(Escape 가 돌아갈 자리)
    before   focus 시점의 Undo 한 칸(captureStudioHistoryState)
*/
let studioCanvasInspectorTextSession = null;

/* 숫자 입력 세션 — { id, field, start } */
let studioCanvasInspectorNumberSession = null;


/* =========================================================
   1. 지금 무엇을 그려야 하는가

   ★ 관문을 새로 만들지 않는다. "HOME 인가 · 유효한 v1 canvas 인가 ·
     Select 가 켜져 있는가"는 studioCanvasEditingIsOn() 이 이미 본다.
========================================================== */

function studioCanvasInspectorView() {

  if (
    typeof window.getStudioCanvasSelection !== "function" ||
    typeof window.studioCanvasEditingIsOn !== "function"
  ) {
    return { mode: "none" };
  }

  if (!window.studioCanvasEditingIsOn()) {
    return { mode: "none" };
  }

  const selection =
    window.getStudioCanvasSelection();

  if (!selection.ids.length) {
    return { mode: "none" };
  }

  if (selection.ids.length > 1) {
    return { mode: "multi", count: selection.ids.length };
  }

  /* 값은 선택 상태가 아니라 **draft** 에서 읽는다 — 드래그 · Undo 로
     선택은 그대로인 채 값만 바뀌는 길이 있다(머리말). */
  const element =
    (typeof window.studioCanvasSelectableElement === "function")
      ? window.studioCanvasSelectableElement(selection.primaryId)
      : null;

  if (!element) {
    return { mode: "none" };
  }

  /* =====================================================
     HOME-CANVAS-V2-EDITOR-1A — v2 는 다른 화면을 쓴다.

     같은 "single" 이지만 고칠 수 있는 칸이 통째로 다르다(자유 좌표
     다섯 칸 ↔ 흐름 안의 자리). 그래서 `version` 과 `kind` 를 view 에
     싣고, 그리는 쪽이 갈린다(studio-canvas-inspector-v2.js).

     ★ `node` 는 `element` 와 같은 객체다. 이름을 둘 두는 이유는 v1
       코드가 `view.element` 를 그대로 읽기 때문이고, v2 쪽은 "요소"가
       아니라 블록일 수도 있어 `node` 로 부른다.
  ====================================================== */
  const version =
    (typeof window.studioCanvasPayloadVersion === "function")
      ? window.studioCanvasPayloadVersion(window.studioCanvasDraftPayload())
      : 1;

  if (version === 2) {

    const info =
      (typeof window.studioCanvasNodeInfo === "function")
        ? window.studioCanvasNodeInfo(element.id)
        : null;

    if (!info) {
      return { mode: "none" };
    }

    const payload =
      window.studioCanvasDraftPayload();

    /* =====================================================
       HOME-CANVAS-V2-EDITOR-1B — 그 요소의 **좌표 자**

       프레임 내부 요소와 overlay 는 자리 · 크기 · 각도를 갖는다.
       그런데 그 값이 어느 자 위의 숫자인가는 어디에 있는 요소인가가
       정하고(§26-2), `follow:"pin"` 은 저장된 칸이 자리 자체도
       아니다. 그래서 패널도 **자를 통해** 읽고 쓴다 — 직접 조작이
       쓰는 그 자 하나다.

       ★ 값을 들고 있지 않는다. 그릴 때마다 · sync 할 때마다 다시
         계산한다(이 파일 머리말의 그 규칙).

       ★ null 일 수 있다. 블록이면 애초에 없고(자리가 좌표가 아니다),
         프레임의 자를 만들 수 없는 데이터에서도 null 이다 — 그때는
         읽기 전용 요약만 그린다.
    ====================================================== */
    const space =
      (info.kind !== "block" && typeof window.studioCanvasV2Space === "function")
        ? window.studioCanvasV2Space(element.id)
        : null;

    return {
      mode: "single",
      version: 2,
      kind: info.kind,
      id: element.id,
      type: element.type,
      element: element,
      node: element,
      space: space,
      index: info.index,
      parentId: info.parentId,
      blockCount:
        (payload && payload.flow && Array.isArray(payload.flow.blocks))
          ? payload.flow.blocks.length
          : 0,
      generation: selection.generation
    };

  }

  return {
    mode: "single",
    version: 1,
    kind: "element",
    id: element.id,
    type: element.type,
    element: element,
    node: element,
    generation: selection.generation
  };

}


/* 그 요소가 `height:"auto"` 를 쓸 수 있는가(계약 §6) — 표는
   skin/skin-home-canvas.js 한 곳이다. */
function studioCanvasInspectorAutoAllowed(type) {

  const list =
    (typeof window.SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES !== "undefined" &&
      Array.isArray(window.SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES))
      ? window.SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES
      : ["text", "category_nav"];

  return list.indexOf(type) !== -1;

}


/* =========================================================
   STUDIO-LAYERS-SHELL-1 — 재료 추가는 이 패널을 떠났다

   HOME-CANVAS-V2-ADD-1 이 만든 추가 자리는 **선택을 보지 않는
   화면**이라, "고른 것 하나"를 그리는 이 패널의 맨 위에 얹혀
   있었다. 이제 Layers 패널이 그 자리의 주인이다
   (studio/inspector/studio-canvas-layers.js · 계획 문서 §3).

   그래서 이 파일은 추가에 대해 아무것도 알지 않는다 — 고른 것이
   없으면 예전처럼 화면을 통째로 숨긴다.
========================================================== */


/* 지금 화면이 그려야 할 **모양**의 지문. 값은 들어가지 않는다 —
   값이 바뀌었다고 DOM 을 다시 만들면 입력 중인 칸이 죽는다. */
function studioCanvasInspectorShapeOf(view) {

  if (view.mode === "single") {
    /* HOME-CANVAS-V2-EDITOR-1A — 같은 요소라도 v1 화면과 v2 화면은
       DOM 이 다르고, v2 안에서도 블록 · 프레임 내부 · overlay 가
       다르다. 지문에 그 둘을 넣지 않으면 화면이 바뀌어야 할 때
       옛 DOM 이 남는다.

       HOME-CANVAS-V2-EDITOR-1B — 자를 만들 수 있는가도 지문이다.
       같은 요소라도 자가 없으면 입력칸 대신 읽기 전용 요약을
       그리므로, 그 둘을 한 지문으로 두면 옛 DOM 이 남는다. */
    /* HOME-CANVAS-V2-ELEMENTS-1 — 따라가기 방식도 지문이다. `pin` 이
       되면 기준 대상 · 기준점 칸이 생기므로(계약 §28-4) 그 둘을 한
       지문으로 두면 옛 DOM 이 남는다. */
    return (
      `single:${view.version || 1}:${view.kind || "element"}:` +
      `${view.id}:${view.type}:${view.space ? "geo" : "ro"}:` +
      `${(view.space && view.space.follow) || ""}`
    );
  }

  if (view.mode === "multi") {
    return `multi:${view.count}`;
  }

  return "none";

}


/* =========================================================
   2. 자리 만들기

   기존 팝오버와 **같은 부모**(#studioLeftPanelSelect)에 들어간다.
   안내 문구(#studioLeftPanelSelectEmpty) **앞**이어야 CSS 가 그
   문구를 물린다(studio-shell.css 의 형제 선택자).
========================================================== */

function ensureStudioCanvasInspector() {

  if (studioCanvasInspectorRoot) {
    return studioCanvasInspectorRoot;
  }

  const host =
    document.getElementById("studioLeftPanelSelect");

  if (!host) {
    return null;
  }

  studioCanvasInspectorRoot =
    document.createElement("div");

  studioCanvasInspectorRoot.className =
    "studio-canvas-inspector";

  studioCanvasInspectorRoot.id =
    "studioCanvasInspector";

  studioCanvasInspectorRoot.setAttribute("data-imory-select-owner", "canvas");

  studioCanvasInspectorRoot.hidden =
    true;

  studioCanvasInspectorBody =
    document.createElement("div");

  studioCanvasInspectorBody.className =
    "studio-canvas-inspector-body";

  studioCanvasInspectorRoot.appendChild(studioCanvasInspectorBody);

  const empty =
    document.getElementById("studioLeftPanelSelectEmpty");

  if (empty && empty.parentNode === host) {
    host.insertBefore(studioCanvasInspectorRoot, empty);
  } else {
    host.appendChild(studioCanvasInspectorRoot);
  }

  return studioCanvasInspectorRoot;

}


/* =========================================================
   3. 작은 DOM 조각들
========================================================== */

function studioCanvasInspectorHead(view) {

  const head =
    document.createElement("div");

  head.className =
    "studio-canvas-inspector-head";

  const title =
    document.createElement("p");

  title.className =
    "studio-canvas-inspector-title";

  title.id =
    "studioCanvasInspectorTitle";

  /* ★ 주 제목은 **사람이 읽는 종류 이름**이다. 요소 id 는 아래
     보조 줄로 간다(계약 §22 — id 를 제목으로 쓰지 않는다). */
  title.textContent =
    (view.mode === "multi")
      ? `Canvas 요소 ${view.count}개 선택됨`
      : (
          (typeof window.studioCanvasElementLabel === "function")
            ? window.studioCanvasElementLabel(view.type)
            : "Canvas 요소"
        );

  head.appendChild(title);

  const meta =
    document.createElement("p");

  meta.className =
    "studio-canvas-inspector-meta";

  meta.id =
    "studioCanvasInspectorMeta";

  meta.textContent =
    (view.mode === "multi") ? "Canvas · HOME" : `Canvas · ${view.id}`;

  head.appendChild(meta);

  return head;

}


function studioCanvasInspectorNote(text, id) {

  const note =
    document.createElement("p");

  note.className =
    "studio-inspector-block-note studio-canvas-inspector-note";

  if (id) {
    note.id = id;
  }

  note.textContent =
    text;

  return note;

}


function studioCanvasInspectorReadRow(label, value) {

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-row studio-canvas-inspector-read";

  const name =
    document.createElement("span");

  name.className =
    "studio-inspector-row-label";

  name.textContent =
    label;

  const text =
    document.createElement("span");

  text.className =
    "studio-canvas-inspector-value";

  text.textContent =
    value;

  row.appendChild(name);
  row.appendChild(text);

  return row;

}


/* 칸 하나의 오류 자리. 비어 있으면 보이지 않는다. */
function studioCanvasInspectorErrorNode(field) {

  const node =
    document.createElement("p");

  node.className =
    "studio-canvas-inspector-error";

  node.id =
    `studioCanvasInspectorError-${field}`;

  node.hidden =
    true;

  return node;

}


function setStudioCanvasInspectorError(field, message) {

  const node =
    studioCanvasInspectorErrors ? studioCanvasInspectorErrors[field] : null;

  if (!node) {
    return;
  }

  node.textContent =
    message || "";

  node.hidden =
    !message;

}


function clearStudioCanvasInspectorErrors() {

  if (!studioCanvasInspectorErrors) {
    return;
  }

  Object.keys(studioCanvasInspectorErrors).forEach(
    (field) => setStudioCanvasInspectorError(field, "")
  );

}


function studioCanvasInspectorRejectText(reason) {

  return (
    Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_REJECT_MESSAGES, reason)
      ? STUDIO_CANVAS_REJECT_MESSAGES[reason]
      : "이 값으로는 고칠 수 없습니다."
  );

}


/* =========================================================
   4. 쓰기 — 관문은 하나다

   ★ 이 파일에서 draft 에 닿는 줄은 여기뿐이다.
========================================================== */

function commitStudioCanvasInspectorField(kind, next, expected, options) {

  const view =
    studioCanvasInspectorView();

  if (view.mode !== "single") {
    return { accepted: false, reason: "selection" };
  }

  if (typeof window.commitStudioCanvasInspectorEdit !== "function") {
    return { accepted: false, reason: "unsupported" };
  }

  const request = {
    kind: kind,
    id: view.id,
    expected: expected,
    next: next,
    generation: view.generation
  };

  if (options && options.coalesce) {
    request.coalesce = true;
  }

  return window.commitStudioCanvasInspectorEdit(request);

}


/* 지금 draft 의 그 요소에서 kind 가 소유한 칸들을 읽는다 —
   그것이 곧 `expected` 다. */
function studioCanvasInspectorCurrent(element, kind) {

  if (kind === "move") {
    return { x: element.x, y: element.y };
  }

  if (kind === "resize") {
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height
    };
  }

  if (kind === "rotate") {
    return {
      rotation:
        (typeof element.rotation === "number" && Number.isFinite(element.rotation))
          ? element.rotation
          : 0
    };
  }

  /* text */
  const props =
    (element.props && typeof element.props === "object") ? element.props : {};

  return { text: typeof props.text === "string" ? props.text : "" };

}


/* 지금 화면에 적을 값(문자열) */
function studioCanvasInspectorDisplay(element, field) {

  if (field === "rotation") {
    return String(
      (typeof element.rotation === "number" && Number.isFinite(element.rotation))
        ? element.rotation
        : 0
    );
  }

  if (field === "height" && element.height === "auto") {
    return "";
  }

  return String(element[field]);

}


/* =========================================================
   5. 숫자 칸 — Enter · blur 에서 **한 번** 쓴다

   ★ 입력 중에는 아무것도 쓰지 않는다. `-` · `.` · 빈 문자열처럼
     아직 숫자가 아닌 중간 상태를 JSON 에 넣지 않기 위해서다.
     그래서 한 칸의 한 편집 세션이 그대로 Undo 한 칸이다.

   ★ Width 만 바꾸는 것은 **모서리 리사이즈가 아니다** — 비율을
     따라 height 를 함께 움직이지 않는다(계약 §22-3). 손잡이의
     비율 규칙(§21-2)과 이 입력칸은 다른 동작이다.
========================================================== */

function studioCanvasInspectorFieldKind(field) {

  if (field === "x" || field === "y") {
    return "move";
  }

  if (field === "width" || field === "height") {
    return "resize";
  }

  return "rotate";

}


function commitStudioCanvasInspectorNumber(field, options) {

  const o =
    options || {};

  const view =
    studioCanvasInspectorView();

  const input =
    studioCanvasInspectorInputs ? studioCanvasInspectorInputs[field] : null;

  if (view.mode !== "single" || !input) {
    return false;
  }

  const raw =
    String(input.value).trim();

  const revert =
    () => {
      if (!o.keepText) {
        input.value = studioCanvasInspectorDisplay(view.element, field);
      }
    };

  if (!raw) {

    setStudioCanvasInspectorError(field, "값을 입력하세요.");

    revert();

    return false;

  }

  const parsed =
    Number(raw);

  if (!Number.isFinite(parsed)) {

    setStudioCanvasInspectorError(field, "숫자를 입력하세요.");

    revert();

    return false;

  }

  const kind =
    studioCanvasInspectorFieldKind(field);

  const expected =
    studioCanvasInspectorCurrent(view.element, kind);

  const next =
    { ...expected };

  /* ★ 각도의 표현은 계약 파일 한 곳이 정한다(§19-3 · §22-3) —
     손으로 돌린 결과와 같은 자로 접고 반올림한다. */
  next[field] =
    (field === "rotation" &&
      typeof window.normalizeSkinHomeCanvasRotation === "function")
      ? window.normalizeSkinHomeCanvasRotation(parsed)
      : parsed;

  const result =
    commitStudioCanvasInspectorField(kind, next, expected);

  if (!result || !result.accepted) {

    setStudioCanvasInspectorError(
      field,
      studioCanvasInspectorRejectText(result && result.reason)
    );

    revert();

    return false;

  }

  setStudioCanvasInspectorError(field, "");

  /* 접힌 각도처럼 저장값이 입력과 다를 수 있다 — 화면을 저장값으로
     맞춘다(다시 그리기가 곧 오지만, 같은 모양이면 포커스가 있는
     칸은 건너뛰므로 여기서 한 번 적는다). */
  const after =
    studioCanvasInspectorView();

  if (after.mode === "single") {
    input.value = studioCanvasInspectorDisplay(after.element, field);
  }

  return true;

}


function studioCanvasInspectorNumberRow(field, view) {

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-row studio-canvas-inspector-row";

  const label =
    document.createElement("label");

  label.className =
    "studio-inspector-row-label";

  label.htmlFor =
    `studioCanvasInspector-${field}`;

  label.textContent =
    STUDIO_CANVAS_FIELD_LABELS[field];

  const input =
    document.createElement("input");

  input.type =
    "text";

  /* type="number" 를 쓰지 않는다 — 브라우저가 중간 상태에서 빈
     문자열을 돌려주어 "무엇을 입력했는가"를 읽을 수 없다. */
  input.inputMode =
    "decimal";

  input.className =
    "studio-inspector-input studio-inspector-input--number";

  input.id =
    `studioCanvasInspector-${field}`;

  input.dataset.canvasField =
    field;

  input.value =
    studioCanvasInspectorDisplay(view.element, field);

  /* ★ Auto 높이에서는 숫자 칸을 잠근다. 그 상태의 표시값은 빈
     문자열이고(§6 의 "auto"), 잠그지 않으면 들어갔다 나오기만 해도
     "값을 입력하세요" 가 뜬다. 숫자로 바꾸는 길은 위 Auto 체크를
     끄는 것 하나다. */
  if (field === "height") {
    input.disabled = view.element.height === "auto";
  }

  input.addEventListener("focus", () => {

    studioCanvasInspectorNumberSession = {
      id: view.id,
      field: field,
      start: input.value
    };

  });

  input.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {

      event.preventDefault();

      commitStudioCanvasInspectorNumber(field, { keepText: true });

      return;

    }

    if (event.key === "Escape") {

      event.preventDefault();
      event.stopPropagation();

      const session =
        studioCanvasInspectorNumberSession;

      const now =
        studioCanvasInspectorView();

      input.value =
        (session && session.field === field)
          ? session.start
          : (
              now.mode === "single"
                ? studioCanvasInspectorDisplay(now.element, field)
                : input.value
            );

      setStudioCanvasInspectorError(field, "");

      studioCanvasInspectorNumberSession = null;

      input.blur();

    }

  });

  input.addEventListener("blur", () => {

    if (!studioCanvasInspectorNumberSession ||
        studioCanvasInspectorNumberSession.field !== field) {
      return;
    }

    const session =
      studioCanvasInspectorNumberSession;

    studioCanvasInspectorNumberSession = null;

    /* 한 글자도 안 바뀌었으면 쓸 것이 없다 — 기록도 0 칸이다 */
    if (String(input.value).trim() === String(session.start).trim()) {
      setStudioCanvasInspectorError(field, "");
      return;
    }

    commitStudioCanvasInspectorNumber(field);

  });

  row.appendChild(label);
  row.appendChild(input);

  if (!studioCanvasInspectorInputs) {
    studioCanvasInspectorInputs = {};
  }

  studioCanvasInspectorInputs[field] = input;

  const wrap =
    document.createElement("div");

  wrap.className =
    "studio-canvas-inspector-field";

  wrap.appendChild(row);

  const error =
    studioCanvasInspectorErrorNode(field);

  wrap.appendChild(error);

  if (!studioCanvasInspectorErrors) {
    studioCanvasInspectorErrors = {};
  }

  studioCanvasInspectorErrors[field] = error;

  return wrap;

}


/* =========================================================
   Height 의 Auto — 계약이 허용하는 타입에서만 나온다(§6)

   켜면 `height:"auto"`, 끄면 지금 화면에 그려진 높이를 숫자로
   굳힌다. 둘 다 resize 한 번이다(= Undo 한 칸).
========================================================== */

function studioCanvasInspectorAutoToggle(view) {

  const wrap =
    document.createElement("label");

  wrap.className =
    "studio-canvas-inspector-auto";

  const box =
    document.createElement("input");

  box.type =
    "checkbox";

  box.id =
    "studioCanvasInspectorAuto";

  box.checked =
    view.element.height === "auto";

  const text =
    document.createElement("span");

  text.textContent =
    "내용에 맞추기(Auto)";

  box.addEventListener("change", () => {

    const now =
      studioCanvasInspectorView();

    if (now.mode !== "single") {
      return;
    }

    const expected =
      studioCanvasInspectorCurrent(now.element, "resize");

    if (box.checked) {

      if (expected.height === "auto") {
        return;
      }

      const result =
        commitStudioCanvasInspectorField(
          "resize",
          { ...expected, height: "auto" },
          expected
        );

      if (!result || !result.accepted) {
        box.checked = false;
        setStudioCanvasInspectorError(
          "height",
          studioCanvasInspectorRejectText(result && result.reason)
        );
      }

      return;

    }

    if (expected.height !== "auto") {
      return;
    }

    /* 숫자로 굳힐 때의 값 — 지금 **화면에 그려진** 높이를 Canvas
       좌표로 되돌린다. 그 자가 없으면 폭을 쓴다(음수 · 0 이 될 수
       없는 값 하나가 필요할 뿐이고, 사용자는 곧 숫자를 고친다). */
    const measured =
      studioCanvasInspectorMeasuredHeight(now.id);

    const result =
      commitStudioCanvasInspectorField(
        "resize",
        { ...expected, height: measured > 0 ? measured : expected.width },
        expected
      );

    if (!result || !result.accepted) {
      box.checked = true;
      setStudioCanvasInspectorError(
        "height",
        studioCanvasInspectorRejectText(result && result.reason)
      );
    }

  });

  wrap.appendChild(box);
  wrap.appendChild(text);

  if (!studioCanvasInspectorInputs) {
    studioCanvasInspectorInputs = {};
  }

  studioCanvasInspectorInputs.auto = box;

  return wrap;

}


/*
  화면에 그려진 높이를 Canvas 좌표로. native Preview 에서만 잴 수
  있다(sandbox 는 cross-origin) — 재지 못하면 0 이다.
*/
function studioCanvasInspectorMeasuredHeight(elementId) {

  try {

    const frame =
      document.getElementById("studioPreviewFrame");

    const doc =
      frame ? frame.contentDocument : null;

    if (!doc) {
      return 0;
    }

    const node =
      doc.querySelector(`[data-imory-edit-id="${elementId}"]`);

    const root =
      doc.querySelector("[data-imory-canvas-root]");

    if (!node || !root) {
      return 0;
    }

    const payload =
      (typeof window.studioCanvasDraftPayload === "function")
        ? window.studioCanvasDraftPayload()
        : null;

    const baseWidth =
      (payload && payload.baseWidth > 0) ? payload.baseWidth : 390;

    const drawn =
      root.getBoundingClientRect().width;

    if (!(drawn > 0)) {
      return 0;
    }

    const scale =
      drawn / baseWidth;

    const value =
      node.offsetHeight / scale;

    return (typeof window.roundSkinHomeCanvasCoord === "function")
      ? window.roundSkinHomeCanvasCoord(value)
      : Math.round(value);

  }
  catch (err) {
    return 0;
  }

}


/* =========================================================
   6. 글자 — 한 focus 세션이 Undo 한 칸

   ★ 평문이다. `<b>` 도 `&` 도 그대로 저장되고, 렌더러가
     `textContent` 로 그리므로 화면에서도 글자 그대로다(계약 §22-2).
     이 패널은 HTML 편집기를 만들지 않는다.

   ★ 입력마다 draft 를 고친다 — 그래야 Preview 가 즉시 따라오고,
     입력 중에 Save 를 눌러도 최신 값이 실린다. 기록만 세션이
     맡는다(coalesce).

   ★ textarea 는 이 문서(부모)에 있다. Preview 가 다시 그려져도
     이 입력칸은 다시 만들어지지 않으므로 한글 조합이 끊기지
     않는다 — 프레임 안 요소를 고치던 기존 텍스트 편집과 다른
     점이다(studio-inspector-text.js 머리말의 그 이유).
========================================================== */

function studioCanvasInspectorTextBlock(view) {

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block studio-canvas-inspector-text";

  const label =
    document.createElement("label");

  label.className =
    "studio-inspector-block-label";

  label.htmlFor =
    "studioCanvasInspectorText";

  label.textContent =
    "글자";

  const input =
    document.createElement("textarea");

  input.className =
    "studio-inspector-textarea";

  input.id =
    "studioCanvasInspectorText";

  input.rows =
    3;

  input.dataset.canvasField =
    "text";

  const max =
    (typeof window.SKIN_HOME_CANVAS_MAX_TEXT_CHARS === "number")
      ? window.SKIN_HOME_CANVAS_MAX_TEXT_CHARS
      : 2000;

  input.maxLength =
    max;

  input.value =
    studioCanvasInspectorCurrent(view.element, "text").text;

  input.addEventListener("focus", () => {

    studioCanvasInspectorTextSession = {
      id: view.id,
      start: input.value,
      before:
        (typeof window.captureStudioHistoryState === "function")
          ? window.captureStudioHistoryState()
          : null
    };

  });

  input.addEventListener("input", () => {

    writeStudioCanvasInspectorText(input.value);

  });

  input.addEventListener("keydown", (event) => {

    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    cancelStudioCanvasInspectorTextSession();

    input.blur();

  });

  input.addEventListener("blur", () => {

    closeStudioCanvasInspectorTextSession();

  });

  block.appendChild(label);
  block.appendChild(input);

  const error =
    studioCanvasInspectorErrorNode("text");

  block.appendChild(error);

  if (!studioCanvasInspectorInputs) {
    studioCanvasInspectorInputs = {};
  }

  if (!studioCanvasInspectorErrors) {
    studioCanvasInspectorErrors = {};
  }

  studioCanvasInspectorInputs.text = input;
  studioCanvasInspectorErrors.text = error;

  return block;

}


/* 입력 한 번 — draft 는 바뀌고 기록은 생기지 않는다 */
function writeStudioCanvasInspectorText(value) {

  const view =
    studioCanvasInspectorView();

  if (view.mode !== "single" || view.type !== "text") {
    return false;
  }

  const expected =
    studioCanvasInspectorCurrent(view.element, "text");

  if (expected.text === value) {
    setStudioCanvasInspectorError("text", "");
    return true;
  }

  const result =
    commitStudioCanvasInspectorField(
      "text",
      { text: value },
      expected,
      { coalesce: !!studioCanvasInspectorTextSession }
    );

  if (!result || !result.accepted) {

    setStudioCanvasInspectorError(
      "text",
      studioCanvasInspectorRejectText(result && result.reason)
    );

    return false;

  }

  setStudioCanvasInspectorError("text", "");

  return true;

}


/*
  세션 닫기 — 시작값과 다르면 **한 칸**을 남긴다.

  ★ 기록은 세션이 시작될 때 잡아 둔 한 칸이다. 그 사이에 draft 가
    몇 번 바뀌었든 ↶ 한 번이면 문장 전체가 돌아간다.
*/
function closeStudioCanvasInspectorTextSession() {

  const session =
    studioCanvasInspectorTextSession;

  studioCanvasInspectorTextSession =
    null;

  if (!session) {
    return;
  }

  const view =
    studioCanvasInspectorView();

  const now =
    (view.mode === "single" && view.type === "text")
      ? studioCanvasInspectorCurrent(view.element, "text").text
      : session.start;

  /* 바뀐 것이 없다 — 기록 0 칸(계약 §22-4) */
  if (now === session.start) {
    return;
  }

  if (session.before && typeof window.recordStudioHistory === "function") {
    window.recordStudioHistory(session.before);
  }

}


/*
  Escape — focus 를 시작할 때의 문구로 되돌리고 기록은 남기지 않는다.
*/
function cancelStudioCanvasInspectorTextSession() {

  const session =
    studioCanvasInspectorTextSession;

  if (!session) {
    return;
  }

  const input =
    studioCanvasInspectorInputs ? studioCanvasInspectorInputs.text : null;

  /* 되돌리는 쓰기도 세션 안이다 — 기록을 만들지 않는다 */
  writeStudioCanvasInspectorText(session.start);

  if (input) {
    input.value = session.start;
  }

  setStudioCanvasInspectorError("text", "");

  studioCanvasInspectorTextSession =
    null;

}


/* =========================================================
   7. 타입별 내용

   ★ 계약이 이미 가진 칸만 다룬다. 편집할 수 있는 칸이 없는
     타입에는 억지 입력창을 만들지 않고 어디서 고치는지만 적는다
     (계약 §22-2).
========================================================== */

function studioCanvasInspectorTypeBlock(view) {

  const element =
    view.element;

  const props =
    (element.props && typeof element.props === "object") ? element.props : {};

  const box =
    document.createElement("div");

  box.className =
    "studio-canvas-inspector-type";

  if (view.type === "text") {

    box.appendChild(studioCanvasInspectorTextBlock(view));

    box.appendChild(
      studioCanvasInspectorReadRow(
        "역할",
        typeof props.role === "string" && props.role ? props.role : "body"
      )
    );

    return box;

  }

  if (view.type === "photo" || view.type === "sticker") {

    box.appendChild(
      studioCanvasInspectorReadRow("슬롯", String(props.slot || "—"))
    );

    box.appendChild(
      studioCanvasInspectorNote(
        "이미지는 Images에서 변경합니다.",
        "studioCanvasInspectorImageNote"
      )
    );

    return box;

  }

  if (view.type === "logo") {

    box.appendChild(
      studioCanvasInspectorReadRow("슬롯", String(props.slot || "—"))
    );

    /* `fallback` 은 고정 선택지 하나다(계약 §7) — 자유 문자열 칸으로
       바꾸지 않는다. */
    box.appendChild(
      studioCanvasInspectorReadRow(
        "대체 표시",
        props.fallback === "site_title" || props.fallback === undefined
          ? "블로그 제목"
          : String(props.fallback)
      )
    );

    box.appendChild(
      studioCanvasInspectorNote(
        "이미지는 Images에서 변경합니다.",
        "studioCanvasInspectorImageNote"
      )
    );

    return box;

  }

  if (view.type === "category_nav") {

    const mode =
      props.mode === "selected" ? "selected" : "all";

    box.appendChild(studioCanvasInspectorReadRow("표시", mode));

    box.appendChild(
      studioCanvasInspectorReadRow(
        "카테고리",
        mode === "all"
          ? "전체"
          : `${Array.isArray(props.categoryIds) ? props.categoryIds.length : 0}개 지정`
      )
    );

    box.appendChild(
      studioCanvasInspectorNote(
        "카테고리 고르기와 순서는 아직 지원하지 않습니다.",
        "studioCanvasInspectorNavNote"
      )
    );

    return box;

  }

  /* shape */
  box.appendChild(
    studioCanvasInspectorReadRow(
      "도형",
      typeof props.kind === "string" && props.kind ? props.kind : "rect"
    )
  );

  box.appendChild(
    studioCanvasInspectorNote(
      "색 · 테두리 · 그림자는 스킨 CSS가 맡습니다.",
      "studioCanvasInspectorShapeNote"
    )
  );

  return box;

}


/* =========================================================
   8. 그리기
========================================================== */

function buildStudioCanvasInspector(view) {

  studioCanvasInspectorInputs = {};
  studioCanvasInspectorErrors = {};

  studioCanvasInspectorBody.textContent =
    "";

  /* 고른 것이 없다 — 이 패널은 비어 있다(재료 추가는 Layers 다) */
  if (view.mode === "none") {
    return;
  }

  studioCanvasInspectorBody.appendChild(studioCanvasInspectorHead(view));

  if (view.mode === "multi") {

    studioCanvasInspectorBody.appendChild(
      studioCanvasInspectorNote(
        "여러 요소 편집은 아직 지원하지 않습니다.",
        "studioCanvasInspectorMultiNote"
      )
    );

    return;

  }

  /* HOME-CANVAS-V2-EDITOR-1A — v2 는 통째로 다른 화면이다 */
  if (view.version === 2) {
    buildStudioCanvasV2Inspector(view);
    return;
  }

  studioCanvasInspectorBody.appendChild(studioCanvasInspectorTypeBlock(view));

  /* HOME-CANVAS-TYPOGRAPHY-1 — 글자 요소면 타이포그래피 한 블록.
     v2 화면도 **같은 함수**를 부른다(블록을 두 벌 만들지 않는다). */
  appendStudioCanvasTypographyBlock(studioCanvasInspectorBody, view);

  const geometry =
    document.createElement("div");

  geometry.className =
    "studio-canvas-inspector-geometry";

  geometry.id =
    "studioCanvasInspectorGeometry";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    "자리와 크기 (Canvas px)";

  geometry.appendChild(caption);

  ["x", "y", "width", "height"].forEach((field) => {
    geometry.appendChild(studioCanvasInspectorNumberRow(field, view));
  });

  if (studioCanvasInspectorAutoAllowed(view.type)) {
    geometry.appendChild(studioCanvasInspectorAutoToggle(view));
  }

  geometry.appendChild(studioCanvasInspectorNumberRow("rotation", view));

  studioCanvasInspectorBody.appendChild(geometry);

}


/*
  값만 갈아 끼운다 — DOM 은 그대로다.

  ★ **포커스가 있는 칸은 건너뛴다.** 입력 중인 글자를 저장값으로
    덮으면 커서가 튀고, 글자 입력에서는 방금 친 글자가 사라진다.
*/
function syncStudioCanvasInspectorValues(view) {

  if (view.mode !== "single" || !studioCanvasInspectorInputs) {
    return;
  }

  /* HOME-CANVAS-TYPOGRAPHY-1 — 타이포그래피 블록은 v1 · v2 어느
     화면에도 같은 모양으로 붙으므로 갈라지기 **전에** 맞춘다.
     값의 출처는 draft 의 CSS 라 아래 geometry 칸과 다르다. */
  syncStudioCanvasTypography(view);

  /* HOME-CANVAS-V2-EDITOR-1A — v2 화면의 칸은 v2 파일이 맞춘다 */
  if (view.version === 2) {
    syncStudioCanvasV2Inspector(view);
    return;
  }

  const active =
    document.activeElement;

  ["x", "y", "width", "height", "rotation"].forEach((field) => {

    const input =
      studioCanvasInspectorInputs[field];

    if (!input) {
      return;
    }

    if (field === "height") {
      input.disabled = view.element.height === "auto";
    }

    if (input === active) {
      return;
    }

    const value =
      studioCanvasInspectorDisplay(view.element, field);

    if (input.value !== value) {
      input.value = value;
    }

  });

  const auto =
    studioCanvasInspectorInputs.auto;

  if (auto && auto !== active) {
    auto.checked = view.element.height === "auto";
  }

  const text =
    studioCanvasInspectorInputs.text;

  if (text && text !== active) {

    const value =
      studioCanvasInspectorCurrent(view.element, "text").text;

    if (text.value !== value) {
      text.value = value;
    }

  }

}


function renderStudioCanvasInspector() {

  const root =
    ensureStudioCanvasInspector();

  if (!root) {
    return;
  }

  const view =
    studioCanvasInspectorView();

  const shape =
    studioCanvasInspectorShapeOf(view);

  if (view.mode === "none") {

    /* 고른 것이 사라졌다 — 열려 있던 세션도 함께 닫는다(기록은
       그때까지의 변화만큼 한 칸이다) */
    if (studioCanvasInspectorTextSession) {
      closeStudioCanvasInspectorTextSession();
    }

    studioCanvasInspectorNumberSession =
      null;

    root.hidden =
      true;

    studioCanvasInspectorBody.textContent =
      "";

    studioCanvasInspectorInputs = null;
    studioCanvasInspectorErrors = null;

    studioCanvasInspectorShape =
      shape;

    return;

  }

  root.hidden =
    false;

  if (shape !== studioCanvasInspectorShape) {

    /* 다른 요소로 넘어갔다 — 옛 요소의 세션을 닫는다 */
    if (studioCanvasInspectorTextSession) {
      closeStudioCanvasInspectorTextSession();
    }

    studioCanvasInspectorNumberSession =
      null;

    buildStudioCanvasInspector(view);

    studioCanvasInspectorShape =
      shape;

    return;

  }

  syncStudioCanvasInspectorValues(view);

}


/* =========================================================
   9. 연결

   ★ 이벤트 하나다. 무엇이 그 이벤트를 쏘는지는
     studio-canvas-selection.js notifyStudioCanvasPanel 머리말.
========================================================== */

if (typeof window !== "undefined") {

  window.addEventListener("studio-canvas-panel", renderStudioCanvasInspector);

  window.renderStudioCanvasInspector = renderStudioCanvasInspector;

  window.getStudioCanvasInspectorState =
    () => {

      const view =
        studioCanvasInspectorView();

      return {
        mode: view.mode,
        id: view.mode === "single" ? view.id : null,
        type: view.mode === "single" ? view.type : null,
        count: view.mode === "multi" ? view.count : (view.mode === "single" ? 1 : 0),
        visible: !!(studioCanvasInspectorRoot && !studioCanvasInspectorRoot.hidden),

        /* STUDIO-LAYERS-SHELL-1 — 추가 자리는 Layers 로 갔다.
           이 칸은 **언제나 false** 이고, 추가를 보는 창구는
           getStudioCanvasLayersState().add 다. 칸을 지우지 않고
           남기는 이유는 "이 패널에 추가가 있는가"를 묻는 기존
           단언이 조용히 사라지지 않고 false 로 답하게 하기 위해서다. */
        add: false,

        textSession: !!studioCanvasInspectorTextSession,
        numberSession:
          studioCanvasInspectorNumberSession
            ? studioCanvasInspectorNumberSession.field
            : null
      };

    };

}
