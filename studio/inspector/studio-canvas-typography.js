/* =========================================================
   STUDIO — Canvas 글자의 타이포그래피 (HOME-CANVAS-TYPOGRAPHY-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §8 · §31
   계획:      docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §4

   ── 무엇을 고치나 ───────────────────────────────────────
   Canvas 의 `text` 요소를 **단독으로** 골랐을 때 Select 패널에
   나오는 한 블록이다.

     타이포그래피
     [글꼴 ▼] [크기 16] [굵기 ▼]

     고급 설정 ▾
     [글자색] [자간] [행간]

   대상 넷: v1 text · v2 flow text 블록 · main_visual 내부 text ·
   v2 overlay text. 전부 `type === "text"` 하나로 갈린다.
   category_nav 의 글자 · logo 의 대체 표시 · 일반 HTML Inspector ·
   글자 **일부**의 색(rich text)은 이 파일의 범위가 아니다.

   ── 어디에 저장하나 — 세 번째 저장소를 만들지 않는다 ───
   Canvas JSON 에 `props.fontSize` 같은 칸을 **만들지 않는다**
   (계약 §8: Canvas JSON 은 좌표 · 구조 · 글자 내용, 시각 스타일은
   스킨 CSS). Canvas 요소는 렌더될 때 이미
   `data-imory-edit-id="<element.id>"` 를 받으므로
   (skin/skin-home-canvas-render.js), 일반 Element Inspector 가 쓰는
   **그 규칙 한 줄**에 그대로 쓴다.

     선택자   [data-imory-edit-id="X"][data-imory-edit-id="X"]
     읽기     readInspectorEditDeclarations()
     쓰기     writeInspectorEditDeclarations()
     값 규칙  buildInspectorStylePatch() / readInspectorControlValue()

   전부 studio/inspector/studio-inspector-model.js 한 벌이다 —
   Canvas 용 writer 를 복제하지 않는다. "스킨 기본값으로" 는 그
   선언 **하나만** 지우는 것이고, 같은 규칙의 다른 선언과 사용자가
   적은 스킨 CSS 는 한 글자도 다시 쓰지 않는다(writer 가 그 요소의
   규칙 한 줄만 갈아끼운다).

   ── 왜 applyStudioInspectorPatch() 를 쓰지 않나 ─────────
   그 함수는 **template HTML 안에서** 요소를 찾아 임시 id 를
   승격시킨다. Canvas 요소는 template HTML 에 없다 — 렌더러가
   draft 의 Canvas JSON 을 읽어 만든다. 그래서 찾을 수 없고,
   찾을 필요도 없다(id 가 이미 영구적이다). 여기서는 HTML 을 한
   글자도 건드리지 않고 **CSS 만** 바꿔 같은 종착점
   (applyStudioDirectEdit)으로 내려간다.

   ── 한 조작 = Undo 한 칸 ────────────────────────────────
   applyStudioDirectEdit -> applyWorkingSkinChanges 가 이미
   captureStudioWorkingChange / recordStudioWorkingChange 로 한 칸을
   기록한다. 이 파일이 기록을 따로 만들지 않는다.

   확정 시점은 칸마다 다르지만 규칙은 하나다 — **값이 실제로
   바뀌는 순간에 한 번**.

     select    change
     색        change (input 은 끌고 있는 동안 계속 온다 —
               그걸로 확정하면 한 번의 조작이 수십 칸이 된다)
     숫자      Enter · blur. 값이 그대로면 아무것도 쓰지 않는다.

   ── 관문 ────────────────────────────────────────────────
   직접 조작 · 글자 내용이 쓰는 그 관문과 **같은 다섯 가지**를 본다
   (studio-canvas-selection.js commitStudioCanvasElementChange).

     편집 중인가 · 단일 선택인가 · 그 id 인가 · 순번이 맞는가 ·
     지금 draft 에 그 요소가 있는가

   다른 점은 여섯 번째가 없다는 것뿐이다 — expected 가 없다. 이
   경로는 Canvas JSON 을 고치지 않으므로 "그 사이에 값이 바뀌었나"를
   물을 대상이 다르고, 대신 확정 직전에 **지금 CSS** 를 다시 읽어
   병합한다(늦게 온 값이 남의 선언을 지우지 않는다).

   classic script. 호출 시점 의존:
     core/imory-font-catalog.js        카탈로그 · resolver
     studio-inspector-model.js         값 규칙 · CSS 읽기/쓰기
     studio-canvas-selection.js        선택 · 편집 여부 · draft
     studio-preview.js                 applyStudioDirectEdit ·
                                       currentWorkingSkin(전역 lexical)
   로드 자리: studio-canvas-inspector-v2.js 뒤(두 화면이 이 파일의
   블록을 자기 안에 붙인다 — 아래 studioCanvasTypographyBlock).
========================================================== */


/* 이 블록이 소유하는 여섯 칸. 값 규칙은 전부 모델 파일에 있고
   (studio-inspector-model.js), 여기 있는 것은 "어느 칸이 어떤
   컨트롤 이름을 쓰는가" 뿐이다. */
const STUDIO_CANVAS_TYPO_FIELDS = {
  font: { control: "canvasFontFamily", label: "글꼴" },
  size: { control: "canvasFontSize", label: "크기" },
  weight: { control: "fontWeight", label: "굵기" },
  color: { control: "color", label: "글자색" },
  letter: { control: "canvasLetterSpacing", label: "자간" },
  line: { control: "canvasLineHeight", label: "행간" }
};


/* −/+ 가 붙는 칸 셋. 범위 · 눈금 · 자리수는 여기 적지 않는다 —
   모델의 INSPECTOR_CANVAS_TYPO_RANGES 하나가 갖는다. */
const STUDIO_CANVAS_TYPO_STEP_FIELDS = ["size", "letter", "line"];


function studioCanvasTypoRange(field) {

  const spec =
    STUDIO_CANVAS_TYPO_FIELDS[field];

  const ranges =
    (typeof window !== "undefined" && window.INSPECTOR_CANVAS_TYPO_RANGES)
      ? window.INSPECTOR_CANVAS_TYPO_RANGES
      : null;

  return (spec && ranges) ? (ranges[spec.control] || null) : null;

}


/* 굵기 선택지 — 값은 일반 Inspector 의 원천 하나다
   (INSPECTOR_WEIGHT_VALUES). "기본" 은 값이 없는 것 = 선언 없음. */
const STUDIO_CANVAS_TYPO_WEIGHTS = [
  { value: "", label: "기본" },
  { value: "400", label: "400 보통" },
  { value: "500", label: "500 중간" },
  { value: "700", label: "700 굵게" }
];


/* 숫자 칸이 거부됐을 때 보여 줄 한 줄. 범위는 모델이 갖고 있고
   문구만 여기서 만든다(숫자를 두 곳에 적지 않는다). */
function studioCanvasTypoRangeText(control) {

  const ranges =
    (typeof window !== "undefined" && window.INSPECTOR_CANVAS_TYPO_RANGES)
      ? window.INSPECTOR_CANVAS_TYPO_RANGES
      : null;

  const range =
    ranges ? ranges[control] : null;

  if (!range) {
    return "이 값으로는 고칠 수 없습니다.";
  }

  return `${range.min} ~ ${range.max} 사이의 숫자여야 합니다.`;

}


/* 확정이 거부된 이유 → 사람이 읽는 한 줄. Canvas 패널의 표와 같은
   사유 이름을 쓴다(studio-canvas-inspector.js
   STUDIO_CANVAS_REJECT_MESSAGES) — 그쪽에 있는 이름은 그 표를
   그대로 쓰고, 여기만 갖는 것은 없다. */
function studioCanvasTypoRejectText(reason) {

  return studioCanvasInspectorRejectText(reason);

}


/* 지금 입력 중인 숫자 칸 하나(Enter · blur 에서만 확정하므로 시작
   값을 들고 있어야 Escape 와 "안 바뀌었음"을 판정할 수 있다).
   글자 내용 세션(studioCanvasInspectorTextSession)과 **다른 변수**다
   — 그쪽은 draft 를 고치는 세션이고 이쪽은 CSS 다. */
let studioCanvasTypoSession = null;

/* 이 블록이 만든 입력칸들. 다시 그리지 않고 값만 맞출 때 쓴다. */
let studioCanvasTypoInputs = null;

/* =========================================================
   HOME-CANVAS-INSPECTOR-COMPACT-1 — −/+ 한 묶음 = Undo 한 칸

   −/+ 는 누를 때마다 확정한다(Preview 가 바로 따라오고, 그 사이
   Save 를 눌러도 최신 값이 실린다). 그러나 기록까지 한 번에 한 칸씩
   쌓이면 다섯 번 누른 크기를 되돌리는 데 ↶ 를 다섯 번 눌러야 한다.

   그래서 글자 내용 세션과 **같은 규칙**을 쓴다(계약 §22-4 ·
   studio-canvas-inspector.js closeStudioCanvasInspectorTextSession):
   첫 클릭에서 한 칸을 잡아 두고, 그 묶음에서 포커스가 떠날 때
   **한 칸**을 남긴다. 그 사이의 확정은 전부 coalesce 로 내려간다.

     field   어느 칸의 세션인가
     id      어느 요소를 보며 눌렀나(선택이 옮겨가면 값 비교를 접는다)
     start   세션을 열 때의 값 — 되돌아왔으면 기록 0 칸이다
     before  captureStudioHistoryState() 한 칸
========================================================== */
let studioCanvasTypoStepSession = null;

/* 고급 설정을 펼쳐 두었는가. **선택이 바뀌어도 유지한다** — 자간을
   고치려고 편 사람이 다음 글자를 고를 때마다 다시 펴지 않게. */
let studioCanvasTypoAdvancedOpen = false;

/* =========================================================
   이 화면은 **어느 요소를 위해** 그려졌나

   확정은 "그 화면에서 고른 값"이다. 그런데 숫자 칸은 blur 에서
   확정하므로 **선택이 먼저 옮겨간 뒤에** 도착할 수 있다. 그때
   `studioCanvasInspectorView()` 를 다시 읽으면 이미 **다음 요소**가
   나오고, 그대로 쓰면 사용자가 A 를 보며 친 값이 B 에 박힌다.

   그래서 블록을 그릴 때의 id 를 붙들어 두고, 확정 시점에 지금
   선택과 대조한다. 어긋나면 받지 않는다.

   ★ 순번(generation)은 여기 두지 않는다. 프레임이 보내는 좌표
     메시지는 **건너편 realm 에서 비동기로** 오므로 그 사이에 순번이
     갈릴 수 있지만(계약 §17-8), 이 패널은 같은 문서 안에서 지금
     선택을 그 자리에서 읽는다 — 그 값을 자기 자신과 비교하는
     관문은 빈 껍데기다. 실제로 어긋날 수 있는 것은 위의 id 다.
========================================================== */
let studioCanvasTypoEditId = null;


/* =========================================================
   이 요소가 타이포그래피를 갖는가

   view 는 studioCanvasInspectorView() 가 만든 그 객체다. v1 · v2 ·
   프레임 내부 · overlay 가 전부 `type` 을 싣고 있으므로 판정은
   한 줄이다.
========================================================== */

function studioCanvasTypographyApplies(view) {

  return !!(
    view &&
    view.mode === "single" &&
    view.type === "text" &&
    typeof view.id === "string" &&
    view.id
  );

}


/* =========================================================
   지금 이 요소의 선언들

   **draft 의 CSS 를 그때그때 다시 읽는다.** 값을 들고 있지 않는
   이유는 Canvas 패널의 다른 칸과 같다 — Undo/Redo · Import · AI ·
   Code 적용이 선택을 그대로 둔 채 CSS 만 바꾸는 길이 있다.
========================================================== */

function studioCanvasTypographyDeclarations(editId) {

  if (
    !currentWorkingSkin ||
    typeof window.readInspectorEditDeclarations !== "function"
  ) {
    return {};
  }

  const source =
    resolveCodeEditorSource(currentWorkingSkin, "home");

  if (!source) {
    return {};
  }

  return window.readInspectorEditDeclarations(source.css, editId);

}


function studioCanvasTypographyValue(field) {

  const spec =
    STUDIO_CANVAS_TYPO_FIELDS[field];

  const view =
    studioCanvasInspectorView();

  if (!spec || !studioCanvasTypographyApplies(view)) {
    return "";
  }

  if (typeof window.readInspectorControlValue !== "function") {
    return "";
  }

  return (
    window.readInspectorControlValue(
      spec.control,
      studioCanvasTypographyDeclarations(view.id)
    ) || ""
  );

}


/* =========================================================
   확정 — 이 파일에서 draft 에 닿는 줄은 여기뿐이다

   commitStudioCanvasTypography(field, value, options) -> { ok, reason? }

   ★ `options.coalesce` 는 **기록만** 끈다(계약과 저장값은 그대로다).
     −/+ 한 묶음이 Undo 한 칸이 되게 하는 손잡이이고, 그 한 칸은
     세션을 여닫는 쪽이 남긴다(위 studioCanvasTypoStepSession).
========================================================== */

function commitStudioCanvasTypography(field, value, options) {

  const spec =
    STUDIO_CANVAS_TYPO_FIELDS[field];

  if (!spec) {
    return { ok: false, reason: "unsupported" };
  }

  if (
    typeof window.studioCanvasEditingIsOn !== "function" ||
    !window.studioCanvasEditingIsOn()
  ) {
    return { ok: false, reason: "not-editing" };
  }

  const selection =
    window.getStudioCanvasSelection();

  const view =
    studioCanvasInspectorView();

  if (!studioCanvasTypographyApplies(view)) {
    return { ok: false, reason: "selection" };
  }

  /* 단일 선택이고, 그것이 지금 그리고 있는 그 요소여야 한다 */
  if (
    !selection ||
    selection.ids.length !== 1 ||
    selection.ids[0] !== view.id ||
    selection.primaryId !== view.id
  ) {
    return { ok: false, reason: "selection" };
  }

  /* ★ **화면이 그려진 그 요소**여야 한다(위 변수 머리말). 선택이
     먼저 옮겨간 뒤 도착한 blur 는 여기서 걸린다 — 그 값이 다음
     요소에 박히지 않는다. */
  if (
    typeof studioCanvasTypoEditId !== "string" ||
    studioCanvasTypoEditId !== view.id
  ) {
    return { ok: false, reason: "selection" };
  }

  /* 지금 draft 에 정말로 있는 요소인가 */
  if (
    typeof window.studioCanvasSelectableElement !== "function" ||
    !window.studioCanvasSelectableElement(view.id)
  ) {
    return { ok: false, reason: "element" };
  }

  if (!currentWorkingSkin) {
    return { ok: false, reason: "no-skin" };
  }

  const source =
    resolveCodeEditorSource(currentWorkingSkin, "home");

  if (!source) {
    return { ok: false, reason: "no-skin" };
  }

  /* ★ 지금 CSS 를 **다시 읽어** 병합한다. 화면을 그릴 때 읽어 둔
     사본을 쓰면 그 사이에 들어온 다른 변경(AI · Code · 다른 칸)을
     덮어쓴다. */
  const declarations =
    window.readInspectorEditDeclarations(source.css, view.id);

  const patch =
    window.buildInspectorStylePatch(spec.control, value);

  let changed =
    false;

  Object.keys(patch).forEach((property) => {

    if (patch[property] === null) {

      if (Object.prototype.hasOwnProperty.call(declarations, property)) {
        delete declarations[property];
        changed = true;
      }

      return;

    }

    if (declarations[property] !== patch[property]) {
      declarations[property] = patch[property];
      changed = true;
    }

  });

  /* 같은 값이다 — 기록도 dirty 도 만들지 않는다(§17-6 과 같은 규칙) */
  if (!changed) {
    return { ok: true, unchanged: true };
  }

  const nextCss =
    window.writeInspectorEditDeclarations(source.css, view.id, declarations);

  try {

    /* HTML 은 **한 글자도 바뀌지 않는다** — 그대로 돌려준다.
       한 칸의 기록 · dirty · Save/Publish 버튼 · 다시 그리기는
       전부 이 함수 안에서 일어난다(studio-preview.js). */
    window.applyStudioDirectEdit(
      "home",
      source.html,
      nextCss,
      (options && options.coalesce === true)
        ? { coalesceHistory: true }
        : undefined
    );

  } catch (err) {

    console.error("[studio-canvas-typography] apply failed", err);

    return { ok: false, reason: "rejected" };

  }

  return { ok: true };

}


/* =========================================================
   그리기

   HOME-CANVAS-INSPECTOR-COMPACT-1 — 칸 하나의 모양이 바뀌었다.

     [라벨            기본]     <- 머리줄. 되돌리기는 여기 오른쪽 끝
     [   컨트롤          ]     <- 한 칸을 통째로 쓰는 줄
     [오류 한 줄        ]

   예전에는 되돌리기 버튼이 컨트롤과 **같은 줄**에 있었다. 한 줄에
   칸을 둘씩 놓으면 그 줄에 −/+ · 입력칸 · 기본 넷이 들어가 어느
   것도 제 폭을 갖지 못한다. 머리줄로 올리면 컨트롤이 칸 폭을 전부
   쓰고, 라벨 줄은 어차피 비어 있던 오른쪽을 쓴다.
========================================================== */

function studioCanvasTypoRow(field, node) {

  const spec =
    STUDIO_CANVAS_TYPO_FIELDS[field];

  const cell =
    document.createElement("div");

  cell.className =
    "studio-canvas-typo-cell";

  const head =
    document.createElement("div");

  head.className =
    "studio-canvas-typo-head";

  const label =
    document.createElement("label");

  label.className =
    "studio-canvas-typo-label";

  label.htmlFor =
    `studioCanvasTypo-${field}`;

  label.textContent =
    spec.label;

  head.appendChild(label);

  /* "스킨 기본값으로" — 그 선언 **하나만** 지운다. 선택 칸에는
     빈 선택지가 이미 있지만, 색과 숫자 칸에는 그 길이 없으므로
     모든 칸에 같은 버튼을 둔다(어느 칸에서 되돌릴 수 있는지
     사람이 외우지 않게). */
  const reset =
    document.createElement("button");

  reset.type =
    "button";

  reset.className =
    "studio-inspector-clear studio-canvas-typo-reset";

  reset.id =
    `studioCanvasTypoReset-${field}`;

  reset.textContent =
    "기본";

  reset.title =
    "스킨 기본값으로";

  reset.addEventListener("click", () => {

    /* 다른 칸의 −/+ 묶음이 열려 있었다면 여기서 끝난다 —
       그 묶음의 한 칸이 이 확정보다 먼저 쌓여야 순서가 맞다. */
    closeStudioCanvasTypoStepSession();

    applyStudioCanvasTypoResult(
      field,
      commitStudioCanvasTypography(field, "")
    );

  });

  head.appendChild(reset);

  cell.appendChild(head);

  const line =
    document.createElement("div");

  line.className =
    "studio-canvas-typo-line";

  line.appendChild(node);

  cell.appendChild(line);

  const error =
    document.createElement("p");

  error.className =
    "studio-canvas-inspector-error studio-canvas-typo-error";

  error.id =
    `studioCanvasTypoError-${field}`;

  error.hidden =
    true;

  cell.appendChild(error);

  studioCanvasTypoInputs[field] = {
    input: node,
    error: error
  };

  return cell;

}


/* 확정 한 번의 끝맺음 — 거부면 이유를 보이고, 성공이면 화면을
   저장값에 맞춘다. 네 종류의 칸이 전부 이 한 줄로 끝난다. */
function applyStudioCanvasTypoResult(field, result) {

  if (result && result.ok) {

    setStudioCanvasTypoError(field, "");

    renderStudioCanvasInspector();

    return true;

  }

  setStudioCanvasTypoError(
    field,
    studioCanvasTypoRejectText(result ? result.reason : "")
  );

  return false;

}


function setStudioCanvasTypoError(field, message) {

  const entry =
    studioCanvasTypoInputs ? studioCanvasTypoInputs[field] : null;

  if (!entry || !entry.error) {
    return;
  }

  entry.error.textContent =
    message || "";

  entry.error.hidden =
    !message;

}


/* =========================================================
   −/+ 묶음의 시작과 끝 (위 studioCanvasTypoStepSession 머리말)
========================================================== */

function openStudioCanvasTypoStepSession(field, start) {

  /* 다른 칸의 묶음이 열려 있으면 먼저 닫는다 — 두 칸의 변화가
     한 칸에 섞이지 않게. */
  if (studioCanvasTypoStepSession && studioCanvasTypoStepSession.field !== field) {
    closeStudioCanvasTypoStepSession();
  }

  if (studioCanvasTypoStepSession) {
    return;
  }

  studioCanvasTypoStepSession = {
    field: field,
    id: studioCanvasTypoEditId,
    start: start,
    before:
      (typeof window.captureStudioHistoryState === "function")
        ? window.captureStudioHistoryState()
        : null
  };

}


function closeStudioCanvasTypoStepSession() {

  const session =
    studioCanvasTypoStepSession;

  studioCanvasTypoStepSession =
    null;

  if (!session) {
    return;
  }

  /* 눌렀다가 제자리로 돌아왔다 — 기록 0 칸이다(계약 §22-4 의 그
     규칙). 화면이 이미 다른 요소로 옮겨갔으면 값을 견줄 수 없으므로
     그때는 기록 쪽의 판정에만 맡긴다(같은 draft 면 한 칸도 쌓지
     않는다 — studio-history.js recordStudioHistory). */
  if (
    session.id === studioCanvasTypoEditId &&
    studioCanvasTypographyValue(session.field) === session.start
  ) {
    return;
  }

  if (session.before && typeof window.recordStudioHistory === "function") {
    window.recordStudioHistory(session.before);
  }

}


function studioCanvasTypoSelect(field, build) {

  const select =
    document.createElement("select");

  select.className =
    "studio-inspector-input studio-canvas-typo-select";

  select.id =
    `studioCanvasTypo-${field}`;

  build(select);

  select.addEventListener("change", () => {

    closeStudioCanvasTypoStepSession();

    applyStudioCanvasTypoResult(
      field,
      commitStudioCanvasTypography(field, select.value)
    );

  });

  return select;

}


function studioCanvasTypoFontSelect(value) {

  return studioCanvasTypoSelect("font", (select) => {

    if (typeof window.fillImoryFontSelect === "function") {

      window.fillImoryFontSelect(
        select,
        { includeDefault: true, defaultLabel: "스킨 기본값", value: value }
      );

      return;

    }

    /* 카탈로그가 없으면 빈 선택지 하나만 — 목록을 여기 다시 적지
       않는다(그러면 두 벌이 된다). */
    const blank =
      document.createElement("option");

    blank.value = "";
    blank.textContent = "스킨 기본값";

    select.appendChild(blank);

  });

}


function studioCanvasTypoWeightSelect(value) {

  return studioCanvasTypoSelect("weight", (select) => {

    STUDIO_CANVAS_TYPO_WEIGHTS.forEach((item) => {

      const option =
        document.createElement("option");

      option.value = item.value;
      option.textContent = item.label;

      select.appendChild(option);

    });

    select.value =
      value;

  });

}


/* =========================================================
   숫자 칸 — 크기 · 자간 · 행간

   ★ type="number" 를 쓰지 않는다. 브라우저가 중간 상태에서 빈
     문자열을 돌려주어 "무엇을 입력했는가"를 읽을 수 없다(Canvas
     geometry 칸과 같은 판단).

   ★ 빈 칸은 0 이 아니라 **스킨 기본값**이다 — 지우고 나가면 그
     선언이 없어진다.

   HOME-CANVAS-INSPECTOR-COMPACT-1 — 세 칸에 −/+ 가 붙는다.

     [−] [  16  ] [+]

   ★ 숫자를 **직접 치는 길은 그대로**다. −/+ 는 그 칸에 쓰고 곧바로
     확정하는 지름길일 뿐이고, 범위 · 눈금 · "빈 값 = 스킨 기본값"
     판정은 전부 같은 함수 하나가 한다(inspectorCanvasTypoNumber).

   ★ 칸이 비어 있으면(= 스킨 기본값) −/+ 는 **잠근다**. 이 패널은
     잰 값을 기본값인 척 채우지 않는다는 것이 계약이고(§31), 그러면
     −/+ 가 출발할 숫자가 없다. 숫자를 지어내는 대신 잠그고 이유를
     `title` 에 적는다 — 한 번 치고 나면 그때부터 눌러 고칠 수 있다.

   ★ 눈금의 양 끝에서도 잠근다. 눌러도 아무 일이 없는 버튼을 살려
     두면 "왜 안 커지나"가 된다.
========================================================== */

/* −/+ 한 번. 지금 칸의 값에서 눈금 한 칸만큼 움직인다. */
function studioCanvasTypoStep(field, direction) {

  const spec =
    STUDIO_CANVAS_TYPO_FIELDS[field];

  const range =
    studioCanvasTypoRange(field);

  const entry =
    studioCanvasTypoInputs ? studioCanvasTypoInputs[field] : null;

  const input =
    (entry && entry.input) ? entry.input.querySelector("input") : null;

  if (!spec || !range || !input || typeof window.inspectorCanvasTypoNumber !== "function") {
    return;
  }

  const raw =
    String(input.value).trim();

  /* 스킨 기본값 — 출발할 숫자가 없다(위 머리말) */
  if (raw === "") {
    return;
  }

  const base =
    window.inspectorCanvasTypoNumber(spec.control, raw);

  if (base === null) {

    setStudioCanvasTypoError(field, studioCanvasTypoRangeText(spec.control));

    return;

  }

  const moved =
    Number(base) + (direction * range.step);

  const clamped =
    Math.min(range.max, Math.max(range.min, moved));

  const next =
    window.inspectorCanvasTypoNumber(spec.control, clamped);

  /* 눈금의 끝이다 — 아무것도 쓰지 않는다(기록도 0 칸) */
  if (next === null || next === base) {

    input.value = base;

    setStudioCanvasTypoError(field, "");

    return;

  }

  /* 첫 클릭이 이 묶음의 시작이다. 그 전 상태 한 칸을 여기서 잡아
     두고, 확정은 coalesce 로 내려보낸다(기록은 묶음이 끝날 때 한 칸). */
  openStudioCanvasTypoStepSession(field, base);

  input.value =
    next;

  applyStudioCanvasTypoResult(
    field,
    commitStudioCanvasTypography(field, next, { coalesce: true })
  );

}


function studioCanvasTypoStepButton(field, direction) {

  const button =
    document.createElement("button");

  button.type =
    "button";

  button.className =
    "studio-canvas-typo-step-button";

  button.id =
    `studioCanvasTypo${direction < 0 ? "Down" : "Up"}-${field}`;

  button.textContent =
    direction < 0 ? "−" : "+";

  button.setAttribute(
    "aria-label",
    `${STUDIO_CANVAS_TYPO_FIELDS[field].label} ${direction < 0 ? "줄이기" : "키우기"}`
  );

  button.addEventListener("click", () => {

    /* WebKit 은 버튼을 눌러도 포커스를 주지 않는다 — 그러면 묶음이
       끝나는 것을 알 수 있는 focusout 이 영영 오지 않는다. 우리가
       준다(누른 자리에 포커스가 가는 것이 동작상으로도 맞다). */
    try {
      button.focus();
    }
    catch (err) {
      /* 포커스를 못 받아도 조작은 그대로다 — 묶음은 다음 칸의
         확정이나 다시 그리기에서 닫힌다 */
    }

    studioCanvasTypoStep(field, direction);

  });

  return button;

}


function studioCanvasTypoNumber(field, value, placeholder) {

  const spec =
    STUDIO_CANVAS_TYPO_FIELDS[field];

  const input =
    document.createElement("input");

  input.type =
    "text";

  input.inputMode =
    "decimal";

  input.className =
    "studio-inspector-input studio-inspector-input--number studio-canvas-typo-number";

  input.id =
    `studioCanvasTypo-${field}`;

  input.placeholder =
    placeholder;

  input.value =
    value;

  const finish = () => {

    const session =
      studioCanvasTypoSession;

    studioCanvasTypoSession =
      null;

    if (!session || session.field !== field) {
      return;
    }

    const raw =
      String(input.value).trim();

    /* 한 글자도 안 바뀌었으면 쓸 것이 없다 — 기록도 0 칸이다 */
    if (raw === String(session.start).trim()) {
      setStudioCanvasTypoError(field, "");
      return;
    }

    /* 비우기 = 스킨 기본값으로. 그 밖의 값은 **확정 경로와 같은
       함수**로 먼저 판정한다 — 범위 밖이면 아무것도 쓰지 않고
       이유를 보인다(빈 값으로 떨어져 선언이 지워지지 않게). */
    const normalized =
      raw === ""
        ? ""
        : (
            (typeof window.inspectorCanvasTypoNumber === "function")
              ? window.inspectorCanvasTypoNumber(spec.control, raw)
              : null
          );

    if (normalized === null) {

      setStudioCanvasTypoError(field, studioCanvasTypoRangeText(spec.control));

      input.value =
        session.start;

      return;

    }

    /* 눈금에 붙은 값을 칸에도 되돌려 적는다 — 16.7 을 친 크기는
       17 이 되고, 화면과 저장값이 어긋난 채 남지 않는다. */
    input.value =
      normalized;

    applyStudioCanvasTypoResult(
      field,
      commitStudioCanvasTypography(field, normalized)
    );

  };

  input.addEventListener("focus", () => {

    /* 직접 치기는 −/+ 묶음과 **다른** 조작이다 — 여기서 그 묶음을
       닫아 한 칸으로 마무리하고, 이 입력은 자기 세션을 연다. */
    closeStudioCanvasTypoStepSession();

    studioCanvasTypoSession = {
      field: field,
      start: input.value
    };

  });

  input.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {

      event.preventDefault();

      finish();

      /* 다음 입력이 다시 "바뀌었나"를 판정할 수 있게 세션을 새로
         연다 — 칸에는 아직 포커스가 있다. */
      studioCanvasTypoSession = {
        field: field,
        start: input.value
      };

      return;

    }

    if (event.key === "Escape") {

      event.preventDefault();
      event.stopPropagation();

      const session =
        studioCanvasTypoSession;

      input.value =
        (session && session.field === field)
          ? session.start
          : input.value;

      studioCanvasTypoSession =
        null;

      setStudioCanvasTypoError(field, "");

      input.blur();

    }

  });

  input.addEventListener("blur", () => finish());

  /* =====================================================
     [−][입력칸][+] 한 묶음

     ★ 색 칸과 같은 모양으로 감싼다 — 값을 맞추는 쪽
       (syncStudioCanvasTypography)이 "SPAN 이면 안의 input" 이라는
       그 한 줄을 그대로 쓴다. 칸마다 다른 규칙을 만들지 않는다.
  ====================================================== */
  const wrap =
    document.createElement("span");

  wrap.className =
    "studio-canvas-typo-step";

  wrap.appendChild(studioCanvasTypoStepButton(field, -1));
  wrap.appendChild(input);
  wrap.appendChild(studioCanvasTypoStepButton(field, 1));

  /* 포커스가 이 묶음을 떠나면 −/+ 한 묶음이 끝난다 = Undo 한 칸.
     묶음 **안에서** 옮겨 다니는 것(− → + → 입력칸)은 한 묶음이다. */
  wrap.addEventListener("focusout", (event) => {

    if (event.relatedTarget && wrap.contains(event.relatedTarget)) {
      return;
    }

    closeStudioCanvasTypoStepSession();

  });

  return wrap;

}


function studioCanvasTypoColor(value) {

  const wrap =
    document.createElement("span");

  wrap.className =
    "studio-canvas-typo-color";

  const input =
    document.createElement("input");

  input.type =
    "color";

  input.className =
    "studio-inspector-color studio-canvas-typo-color-input";

  input.id =
    "studioCanvasTypo-color";

  /* 값이 없으면(스킨 기본값) 색 칸은 무엇이든 보여야 하므로
     검정을 **표시만** 한다 — 이 값이 저장되는 것은 사용자가
     실제로 색을 고른 뒤뿐이다. */
  input.value =
    value || "#000000";

  if (!value) {
    wrap.classList.add("is-unset");
  }

  /* input 이 아니라 change 다 — 끌고 있는 동안의 값으로 확정하면
     한 번의 조작이 Undo 수십 칸이 된다. */
  input.addEventListener("change", () => {

    closeStudioCanvasTypoStepSession();

    applyStudioCanvasTypoResult(
      "color",
      commitStudioCanvasTypography("color", input.value)
    );

  });

  wrap.appendChild(input);

  return wrap;

}


/* =========================================================
   studioCanvasTypographyBlock(view) -> HTMLElement | null

   v1 화면(studio-canvas-inspector.js)과 v2 화면
   (studio-canvas-inspector-v2.js)이 **같은 이 함수**를 부른다.
   블록을 두 벌 만들지 않는다.
========================================================== */

function studioCanvasTypographyBlock(view) {

  if (!studioCanvasTypographyApplies(view)) {
    return null;
  }

  /* 화면을 새로 만든다 — 열려 있던 −/+ 묶음은 여기서 한 칸으로
     끝난다(옛 칸을 가리키는 세션이 새 DOM 에 남지 않게). */
  closeStudioCanvasTypoStepSession();

  studioCanvasTypoInputs =
    {};

  studioCanvasTypoSession =
    null;

  /* 이 화면이 **누구를 위해** 그려졌나(위 변수 머리말) */
  studioCanvasTypoEditId =
    view.id;

  const declarations =
    studioCanvasTypographyDeclarations(view.id);

  const read =
    (field) => {

      const spec =
        STUDIO_CANVAS_TYPO_FIELDS[field];

      return (
        (typeof window.readInspectorControlValue === "function")
          ? (window.readInspectorControlValue(spec.control, declarations) || "")
          : ""
      );

    };

  const box =
    document.createElement("div");

  box.className =
    "studio-canvas-inspector-typo";

  box.id =
    "studioCanvasInspectorTypography";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    "타이포그래피";

  box.appendChild(caption);

  /* =====================================================
     HOME-CANVAS-INSPECTOR-COMPACT-1 — 두 줄 × 두 칸

       1줄  글꼴 · 글자색
       2줄  크기 · 굵기
       고급 자간 · 행간

     예전에는 글꼴 · 크기 · 굵기가 한 줄, 글자색 · 자간 · 행간이
     고급 한 줄이었다. 자주 함께 고치는 것(글꼴과 색 · 크기와 굵기)을
     같은 줄에 놓고 칸을 둘로 줄이면, 같은 패널 폭에서 칸 하나가
     넓어져 −/+ 가 들어가고 세로 길이도 짧아진다.

     줄은 그리는 쪽에서 나눈다 — grid 를 둘 두면 CSS 에 breakpoint 를
     두지 않고도 "이 둘은 한 줄"이 된다. 좁아지면 각 grid 가
     자기 안에서 감긴다(칸의 min-width · studio-inspector.css).
  ====================================================== */
  const basic =
    document.createElement("div");

  basic.className =
    "studio-canvas-typo-grid";

  basic.appendChild(
    studioCanvasTypoRow("font", studioCanvasTypoFontSelect(read("font")))
  );

  basic.appendChild(
    studioCanvasTypoRow("color", studioCanvasTypoColor(read("color")))
  );

  box.appendChild(basic);

  const sizing =
    document.createElement("div");

  sizing.className =
    "studio-canvas-typo-grid";

  sizing.appendChild(
    studioCanvasTypoRow(
      "size",
      studioCanvasTypoNumber("size", read("size"), "기본")
    )
  );

  sizing.appendChild(
    studioCanvasTypoRow("weight", studioCanvasTypoWeightSelect(read("weight")))
  );

  box.appendChild(sizing);

  /* 고급 설정 — 기본 접힘 */
  const advanced =
    document.createElement("details");

  advanced.className =
    "studio-canvas-typo-advanced";

  advanced.id =
    "studioCanvasTypoAdvanced";

  advanced.open =
    studioCanvasTypoAdvancedOpen;

  advanced.addEventListener("toggle", () => {

    studioCanvasTypoAdvancedOpen =
      advanced.open;

  });

  const summary =
    document.createElement("summary");

  summary.className =
    "studio-canvas-typo-summary";

  summary.textContent =
    "고급 설정";

  advanced.appendChild(summary);

  const advancedGrid =
    document.createElement("div");

  advancedGrid.className =
    "studio-canvas-typo-grid";

  advancedGrid.appendChild(
    studioCanvasTypoRow(
      "letter",
      studioCanvasTypoNumber("letter", read("letter"), "기본")
    )
  );

  advancedGrid.appendChild(
    studioCanvasTypoRow(
      "line",
      studioCanvasTypoNumber("line", read("line"), "기본")
    )
  );

  advanced.appendChild(advancedGrid);

  box.appendChild(advanced);

  /* ★ 처음 그릴 때도 −/+ 를 잠근다. renderStudioCanvasInspector() 는
     화면을 새로 만든 뒤 sync 를 부르지 않고 돌아가므로(모양이 바뀐
     자리), 여기서 맞추지 않으면 **처음 한 번만** 빈 칸에서도 눌리는
     버튼이 된다(v2 Height 칸과 같은 이유). */
  STUDIO_CANVAS_TYPO_STEP_FIELDS.forEach((field) => {
    syncStudioCanvasTypoStepButtons(field, read(field));
  });

  return box;

}


/* 두 화면이 부르는 한 줄. 블록이 없으면(글자가 아니면) 아무것도
   붙이지 않고, 있으면 그 자리에 넣는다. */
function appendStudioCanvasTypographyBlock(parent, view) {

  const block =
    studioCanvasTypographyBlock(view);

  if (block && parent) {
    parent.appendChild(block);
  }

  return block;

}


/* =========================================================
   −/+ 의 잠금 — 값 하나로 정해진다(위 studioCanvasTypoNumber 머리말)

     빈 값(스킨 기본값)   둘 다 잠김
     눈금의 아래 끝       − 만 잠김
     눈금의 위 끝         + 만 잠김
========================================================== */

function syncStudioCanvasTypoStepButtons(field, value) {

  const entry =
    studioCanvasTypoInputs ? studioCanvasTypoInputs[field] : null;

  if (
    !entry ||
    !entry.input ||
    STUDIO_CANVAS_TYPO_STEP_FIELDS.indexOf(field) === -1
  ) {
    return;
  }

  /* ★ 문서가 아니라 **그 묶음 안에서** 찾는다 — 화면을 처음 만들 때는
     아직 붙지 않았으므로 getElementById 로는 없다(v2 의 Height 잠금이
     같은 자리에서 걸렸던 그 함정). */
  const down =
    entry.input.querySelector(`#studioCanvasTypoDown-${field}`);

  const up =
    entry.input.querySelector(`#studioCanvasTypoUp-${field}`);

  if (!down || !up) {
    return;
  }

  const range =
    studioCanvasTypoRange(field);

  const number =
    String(value).trim() === "" ? null : Number(value);

  const known =
    !!range && number !== null && Number.isFinite(number);

  down.disabled =
    !known || number <= range.min;

  up.disabled =
    !known || number >= range.max;

  const why =
    known
      ? ""
      : "먼저 숫자를 넣어 주세요 — 지금은 스킨 기본값입니다.";

  down.title = why;
  up.title = why;

}


/* =========================================================
   값만 갈아 끼우기 — DOM 은 그대로다

   ★ 포커스가 있는 칸은 건너뛴다(입력 중인 글자를 덮지 않는다).
========================================================== */

function syncStudioCanvasTypography(view) {

  if (!studioCanvasTypoInputs || !studioCanvasTypographyApplies(view)) {
    return;
  }

  const declarations =
    studioCanvasTypographyDeclarations(view.id);

  const active =
    document.activeElement;

  Object.keys(STUDIO_CANVAS_TYPO_FIELDS).forEach((field) => {

    const entry =
      studioCanvasTypoInputs[field];

    if (!entry || !entry.input) {
      return;
    }

    const node =
      entry.input.tagName === "SPAN"
        ? entry.input.querySelector("input")
        : entry.input;

    if (!node) {
      return;
    }

    const value =
      (typeof window.readInspectorControlValue === "function")
        ? (window.readInspectorControlValue(
            STUDIO_CANVAS_TYPO_FIELDS[field].control,
            declarations
          ) || "")
        : "";

    /* −/+ 는 값이 무엇인가에 따라 잠긴다 — 입력칸에 포커스가 있어도
       버튼은 맞춰 둔다(잠금은 화면의 사실이지 입력 중인 글자가
       아니다). */
    syncStudioCanvasTypoStepButtons(field, value);

    if (node === active) {
      return;
    }

    if (field === "color") {

      node.value =
        value || "#000000";

      entry.input.classList.toggle(
        "is-unset",
        !value
      );

      return;

    }

    if (field === "font" && value && typeof window.fillImoryFontSelect === "function") {

      /* 카탈로그에 없는 글꼴이 규칙에 적혀 있을 수 있다 — 그때는
         fill 이 임시 <option> 을 만든다. 여기서는 되읽기가 이미
         빈 문자열을 주므로(모르는 stack) 이 가지는 사실상
         "우리 여섯 중 하나" 뿐이다. */
      node.value = value;

      return;

    }

    node.value =
      value;

  });

}


function getStudioCanvasTypographyState() {

  const view =
    studioCanvasInspectorView();

  const applies =
    studioCanvasTypographyApplies(view);

  const node =
    document.getElementById("studioCanvasInspectorTypography");

  const values =
    {};

  Object.keys(STUDIO_CANVAS_TYPO_FIELDS).forEach((field) => {

    values[field] =
      applies ? studioCanvasTypographyValue(field) : "";

  });

  return {
    applies: applies,
    visible: !!node,
    id: applies ? view.id : null,

    /* 이 화면이 누구를 위해 그려졌나 — 확정 관문이 보는 그 값 */
    drawnFor: studioCanvasTypoEditId,
    advancedOpen: studioCanvasTypoAdvancedOpen,
    values: values,

    /* HOME-CANVAS-INSPECTOR-COMPACT-1 — 지금 열려 있는 −/+ 묶음과
       세 칸의 버튼 잠금(화면을 안 보고도 잴 수 있게) */
    stepSession:
      studioCanvasTypoStepSession ? studioCanvasTypoStepSession.field : null,
    steps: STUDIO_CANVAS_TYPO_STEP_FIELDS.reduce(
      (out, field) => {

        const wrap =
          studioCanvasTypoInputs ? studioCanvasTypoInputs[field] : null;

        const down =
          (wrap && wrap.input)
            ? wrap.input.querySelector(`#studioCanvasTypoDown-${field}`)
            : null;

        const up =
          (wrap && wrap.input)
            ? wrap.input.querySelector(`#studioCanvasTypoUp-${field}`)
            : null;

        out[field] = {
          present: !!down && !!up,
          downDisabled: down ? down.disabled === true : null,
          upDisabled: up ? up.disabled === true : null
        };

        return out;

      },
      {}
    ),
    fonts:
      (typeof window.IMORY_FONT_CATALOG !== "undefined" &&
        Array.isArray(window.IMORY_FONT_CATALOG))
        ? window.IMORY_FONT_CATALOG.map((entry) => entry.key)
        : []
  };

}


if (typeof window !== "undefined") {

  window.studioCanvasTypographyBlock = studioCanvasTypographyBlock;
  window.appendStudioCanvasTypographyBlock = appendStudioCanvasTypographyBlock;
  window.syncStudioCanvasTypography = syncStudioCanvasTypography;
  window.commitStudioCanvasTypography = commitStudioCanvasTypography;
  window.studioCanvasTypographyApplies = studioCanvasTypographyApplies;
  window.getStudioCanvasTypographyState = getStudioCanvasTypographyState;

}
