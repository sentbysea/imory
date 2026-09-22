/* =========================================================
   STUDIO — HOME 캔버스 Inspector 의 **v2 화면** (HOME-CANVAS-V2-EDITOR-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §25
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14 (PLAN)

   ── 왜 파일이 갈라졌나 ─────────────────────────────────
   studio/inspector/studio-canvas-inspector.js 는 **v1 자유 배치
   요소**의 화면이다 — 자리(x·y)와 크기와 각도. v2 의 자동 배치
   블록에는 그 다섯 칸이 아예 없고(위치는 순서 · 정렬 · 여백이
   정한다 — §14-10 의 책임 표) 대신 흐름 안의 칸이 있다. 한 파일에
   두 화면을 넣으면 "지금 어느 칸이 보이는가"를 조건문으로 추적하게
   된다.

   ★ classic script 다. 앞 파일의 최상위 `let`(studioCanvasInspectorBody ·
     …Inputs · …Errors · …TextSession)과 함수를 **그대로** 쓴다 —
     classic script 의 최상위 바인딩은 같은 전역 렉시컬 환경을
     공유한다. window 에 올려 다리를 놓지 않는다.

   ── 무엇을 고칠 수 있나 ────────────────────────────────

     블록(logo · category_nav · text · divider · main_visual)
       순서 · 정렬 · 여백 네 칸 · 폭 · 높이("auto" 포함)
       + text 블록은 문구

     프레임 내부 요소 · overlay
       **읽기 전용 요약**(+ text 면 문구). 좌표 편집과 직접 조작은
       다음 라운드다(§25-7) — 여기서 절반만 열면 "패널로는 되는데
       손으로는 안 되는" 자리가 생긴다.

   ── 쓰기 ────────────────────────────────────────────────
   전부 commitStudioCanvasInspectorField() 하나를 지난다(앞 파일).
   그 뒤는 v1 과 **같은 관문 한 벌**이고(선택 · 순번 · 허용 키 ·
   expected) 불변 수정만 v2 writer 가 한다.

   ── 한 번의 입력 = Undo 한 칸 ──────────────────────────
   숫자 · 정렬 · 순서는 한 번 확정할 때 한 번 쓴다. 글자만 세션이
   기록을 맡는다(v1 과 같은 규칙 · 같은 세션 변수).
========================================================== */


/* 블록 정렬 — 값 표는 skin/skin-home-canvas-v2.js 하나다 */
const STUDIO_CANVAS_V2_ALIGN_LABELS = {
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
  stretch: "가득"
};

const STUDIO_CANVAS_V2_EDGE_LABELS = {
  top: "위",
  right: "오른쪽",
  bottom: "아래",
  left: "왼쪽"
};

/* 프레임 내부 요소가 프레임이 커질 때 무엇을 따라가나(계약 §24-3) */
const STUDIO_CANVAS_V2_FOLLOW_LABELS = {
  transform: "프레임을 따라 커진다",
  pin: "기준점만 따라간다(크기 유지)"
};


function studioCanvasV2Aligns() {

  return (Array.isArray(window.SKIN_HOME_CANVAS_BLOCK_ALIGNS))
    ? window.SKIN_HOME_CANVAS_BLOCK_ALIGNS
    : ["left", "center", "right", "stretch"];

}


function studioCanvasV2Edges() {

  return (Array.isArray(window.SKIN_HOME_CANVAS_EDGES))
    ? window.SKIN_HOME_CANVAS_EDGES
    : ["top", "right", "bottom", "left"];

}


/* 그 블록이 `height:"auto"` 를 쓸 수 있는가(§14-4) */
function studioCanvasV2AutoAllowed(type) {

  const list =
    (Array.isArray(window.SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES))
      ? window.SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES
      : ["text", "category_nav", "divider", "main_visual"];

  return list.indexOf(type) !== -1;

}


/* =========================================================
   지금 값 — `expected` 가 되는 자리

   ★ 빠진 칸은 **화면의 값**으로 읽는다. `align` 이 없으면 left,
     `margin` 이 없으면 네 칸 다 0 이다(§14-4). writer 쪽
     readCurrent 와 **같은 자**여야 한다 — 어긋나면 "한 번도 적지
     않은 칸은 영영 못 고친다"가 된다.
========================================================== */

function studioCanvasV2Current(node, kind) {

  if (kind === "v2-align") {

    return {
      align:
        (studioCanvasV2Aligns().indexOf(node.align) !== -1)
          ? node.align
          : studioCanvasV2Aligns()[0]
    };

  }

  if (kind === "v2-width") {
    return { width: node.width };
  }

  if (kind === "v2-height") {
    return { height: node.height };
  }

  if (kind === "v2-margin") {

    const margin =
      (node.margin && typeof node.margin === "object") ? node.margin : {};

    const out = {};

    studioCanvasV2Edges().forEach((edge) => {
      out[edge] =
        (typeof margin[edge] === "number" && Number.isFinite(margin[edge]))
          ? margin[edge]
          : 0;
    });

    return out;

  }

  /* v2-text */
  const props =
    (node.props && typeof node.props === "object") ? node.props : {};

  return { text: typeof props.text === "string" ? props.text : "" };

}


/* =========================================================
   1. 순서 — 위로 · 아래로

   ★ `hidden` 블록도 배열의 한 칸이다(화면에서는 건너뛰지만 —
     계약 §23-5). 그래서 "몇 번째"는 언제나 배열 자리다. 그러지
     않으면 저장값과 화면이 어긋난다.
========================================================== */

function studioCanvasV2OrderRow(view) {

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-row studio-canvas-inspector-order";

  const label =
    document.createElement("span");

  label.className =
    "studio-inspector-row-label";

  label.textContent =
    "순서";

  row.appendChild(label);

  const total =
    view.blockCount;

  const at =
    view.index;

  const button =
    (text, delta, disabled, id) => {

      const el =
        document.createElement("button");

      el.type = "button";
      el.className = "studio-inspector-mini-button";
      el.id = id;
      el.textContent = text;
      el.disabled = disabled;

      el.addEventListener("click", () => {

        const now =
          studioCanvasInspectorView();

        if (now.mode !== "single" || now.kind !== "block") {
          return;
        }

        const result =
          commitStudioCanvasInspectorField(
            "v2-order",
            { index: now.index + delta },
            { index: now.index }
          );

        if (!result || !result.accepted) {
          setStudioCanvasInspectorError(
            "order",
            studioCanvasInspectorRejectText(result && result.reason)
          );
          return;
        }

        setStudioCanvasInspectorError("order", "");

      });

      return el;

    };

  const up =
    button("↑ 위로", -1, at <= 0, "studioCanvasInspectorOrderUp");

  const down =
    button("↓ 아래로", 1, at >= total - 1, "studioCanvasInspectorOrderDown");

  const at_ =
    document.createElement("span");

  at_.className = "studio-canvas-inspector-value";
  at_.id = "studioCanvasInspectorOrderAt";
  at_.textContent = `${at + 1} / ${total}`;

  row.appendChild(up);
  row.appendChild(down);
  row.appendChild(at_);

  const error =
    studioCanvasInspectorErrorNode("order");

  const box =
    document.createElement("div");

  box.appendChild(row);
  box.appendChild(error);

  studioCanvasInspectorInputs.orderUp = up;
  studioCanvasInspectorInputs.orderDown = down;
  studioCanvasInspectorInputs.orderAt = at_;
  studioCanvasInspectorErrors.order = error;

  return box;

}


/* =========================================================
   2. 정렬 — 네 값 중 하나
========================================================== */

function studioCanvasV2AlignRow(view) {

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-row studio-canvas-inspector-align";

  const label =
    document.createElement("label");

  label.className = "studio-inspector-row-label";
  label.htmlFor = "studioCanvasInspectorAlign";
  label.textContent = "정렬";

  const select =
    document.createElement("select");

  select.className = "studio-inspector-select";
  select.id = "studioCanvasInspectorAlign";
  select.dataset.canvasField = "align";

  studioCanvasV2Aligns().forEach((value) => {

    const option =
      document.createElement("option");

    option.value = value;

    option.textContent =
      Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_V2_ALIGN_LABELS, value)
        ? STUDIO_CANVAS_V2_ALIGN_LABELS[value]
        : value;

    select.appendChild(option);

  });

  select.value =
    studioCanvasV2Current(view.node, "v2-align").align;

  select.addEventListener("change", () => {

    const now =
      studioCanvasInspectorView();

    if (now.mode !== "single" || now.kind !== "block") {
      return;
    }

    const result =
      commitStudioCanvasInspectorField(
        "v2-align",
        { align: select.value },
        studioCanvasV2Current(now.node, "v2-align")
      );

    if (!result || !result.accepted) {

      setStudioCanvasInspectorError(
        "align",
        studioCanvasInspectorRejectText(result && result.reason)
      );

      select.value = studioCanvasV2Current(now.node, "v2-align").align;

      return;

    }

    setStudioCanvasInspectorError("align", "");

  });

  row.appendChild(label);
  row.appendChild(select);

  const error =
    studioCanvasInspectorErrorNode("align");

  const box =
    document.createElement("div");

  box.appendChild(row);
  box.appendChild(error);

  studioCanvasInspectorInputs.align = select;
  studioCanvasInspectorErrors.align = error;

  return box;

}


/* =========================================================
   3. 숫자 칸 — 폭 · 높이 · 여백 네 칸

   ★ v1 과 같은 규칙이다(계약 §22-3). 입력 중에는 아무것도 쓰지
     않고 Enter · blur 에서 **한 번** 쓴다 — `-` 나 빈 문자열 같은
     중간 상태가 JSON 에 들어가지 않는다.
========================================================== */

function studioCanvasV2CommitNumber(field) {

  const view =
    studioCanvasInspectorView();

  if (view.mode !== "single" || view.kind !== "block") {
    return false;
  }

  const input =
    studioCanvasInspectorInputs ? studioCanvasInspectorInputs[field] : null;

  if (!input) {
    return false;
  }

  const raw =
    input.value.trim();

  const value =
    Number(raw);

  if (!raw || !Number.isFinite(value)) {

    setStudioCanvasInspectorError(field, "숫자를 넣어 주세요.");

    input.value = studioCanvasV2Display(view, field);

    return false;

  }

  const edges =
    studioCanvasV2Edges();

  const isEdge =
    edges.indexOf(field) !== -1;

  const kind =
    isEdge ? "v2-margin" : (field === "width" ? "v2-width" : "v2-height");

  const expected =
    studioCanvasV2Current(view.node, kind);

  /* margin 은 네 칸을 함께 보낸다 — 한 칸만 바뀐 새 리터럴이다
     (계약 §25-4의 그 이유) */
  const next =
    isEdge ? { ...expected, [field]: value } : { [field]: value };

  const result =
    commitStudioCanvasInspectorField(kind, next, expected);

  if (!result || !result.accepted) {

    setStudioCanvasInspectorError(
      field,
      studioCanvasInspectorRejectText(result && result.reason)
    );

    input.value = studioCanvasV2Display(studioCanvasInspectorView(), field);

    return false;

  }

  setStudioCanvasInspectorError(field, "");

  return true;

}


function studioCanvasV2Display(view, field) {

  if (view.mode !== "single" || !view.node) {
    return "";
  }

  if (field === "width") {
    return String(view.node.width);
  }

  if (field === "height") {
    return view.node.height === "auto" ? "" : String(view.node.height);
  }

  return String(studioCanvasV2Current(view.node, "v2-margin")[field]);

}


function studioCanvasV2NumberRow(field, label, view) {

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-row studio-canvas-inspector-number";

  const name =
    document.createElement("label");

  name.className = "studio-inspector-row-label";
  name.htmlFor = `studioCanvasInspectorV2-${field}`;
  name.textContent = label;

  const input =
    document.createElement("input");

  input.type = "text";
  input.inputMode = "numeric";
  input.className = "studio-inspector-input studio-inspector-input--number";
  input.id = `studioCanvasInspectorV2-${field}`;
  input.dataset.canvasField = field;

  input.value =
    studioCanvasV2Display(view, field);

  /* ★ 처음 그릴 때도 잠근다. renderStudioCanvasInspector() 는 화면을
     새로 만든 뒤 sync 를 부르지 않고 돌아가므로(모양이 바뀐 자리),
     여기서 적지 않으면 `height:"auto"` 인 블록의 Height 칸이 **처음
     한 번만** 열려 있다. */
  if (field === "height") {
    input.disabled = view.node.height === "auto";
  }

  input.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
      event.preventDefault();
      studioCanvasV2CommitNumber(field);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      input.value = studioCanvasV2Display(studioCanvasInspectorView(), field);
      setStudioCanvasInspectorError(field, "");
      input.blur();
    }

  });

  input.addEventListener("blur", () => {
    studioCanvasV2CommitNumber(field);
  });

  row.appendChild(name);
  row.appendChild(input);

  const error =
    studioCanvasInspectorErrorNode(field);

  const box =
    document.createElement("div");

  box.appendChild(row);
  box.appendChild(error);

  studioCanvasInspectorInputs[field] = input;
  studioCanvasInspectorErrors[field] = error;

  return box;

}


/* =========================================================
   4. 높이 Auto 스위치 — 켜면 `"auto"`, 끄면 **지금 그려진 높이**

   ★ 끌 때 무슨 숫자로 가는가(HOME-CANVAS-V2-MANUAL-FIX-1 ·
     계약 §29-3).

   처음에는 "Height 칸에 적혀 있는 숫자"를 썼다. 그런데 Auto 인
   동안 그 칸은 **잠겨 있어서**(아래 studioCanvasV2NumberRow) 숫자를
   넣을 수 없고, 스위치를 끄면 "숫자를 먼저 넣어 주세요"만 나왔다 —
   클릭 한 번으로는 Auto 를 끌 수 없었다.

   이제 v1 과 같은 답을 쓴다: **지금 화면에 그려진 높이**다. v2
   블록의 실제 높이는 흐름과 스킨 조판이 정하므로 부모가 재지
   못하고(sandbox 는 cross-origin), 프레임이 보고한 값을 쓴다
   (`preview:canvas-layout` 의 `blocks` · 계약 §29-3).

   ★ 그 보고가 아직 없으면(방금 그렸다 · 그 블록이 화면에 없다)
     Height 칸에 적혀 있던 숫자를 쓰고, 그것도 없으면 그때만
     "숫자를 먼저" 라고 말한다 — 숫자를 지어내지 않는다.

   ★ Undo 는 정확히 `"auto"` 로 돌아간다. 한 번의 확정이 한 칸이고
     (commitStudioCanvasInspectorField) `expected` 가 `"auto"` 이기
     때문이다.
========================================================== */

function studioCanvasV2AutoToggle(view) {

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-row studio-canvas-inspector-auto";

  const label =
    document.createElement("label");

  label.className = "studio-inspector-row-label";
  label.htmlFor = "studioCanvasInspectorV2Auto";
  label.textContent = "높이 Auto";

  const input =
    document.createElement("input");

  input.type = "checkbox";
  input.id = "studioCanvasInspectorV2Auto";
  input.checked = view.node.height === "auto";

  input.addEventListener("change", () => {

    const now =
      studioCanvasInspectorView();

    if (now.mode !== "single" || now.kind !== "block") {
      return;
    }

    const expected =
      studioCanvasV2Current(now.node, "v2-height");

    let next;

    if (input.checked) {
      next = { height: "auto" };
    }
    else {

      /* 1순위 — 지금 화면에 그려진 높이(계약 §29-3) */
      const measured =
        (typeof window.studioCanvasV2MeasuredHeight === "function")
          ? window.studioCanvasV2MeasuredHeight(now.node.id)
          : null;

      /* 2순위 — 칸에 적혀 있던 숫자(Auto 인 동안에는 잠겨 있지만,
         숫자 → Auto → 다시 숫자로 돌아오는 길에서는 값이 남아 있다) */
      const typed =
        studioCanvasInspectorInputs.height
          ? Number(studioCanvasInspectorInputs.height.value.trim())
          : NaN;

      const value =
        (Number.isFinite(measured) && measured > 0)
          ? measured
          : ((Number.isFinite(typed) && typed > 0) ? typed : null);

      if (value === null) {

        setStudioCanvasInspectorError(
          "height",
          "지금 높이를 잴 수 없어요. Height 에 숫자를 넣어 주세요."
        );

        input.checked = true;

        return;

      }

      next = { height: value };

    }

    const result =
      commitStudioCanvasInspectorField("v2-height", next, expected);

    if (!result || !result.accepted) {

      setStudioCanvasInspectorError(
        "height",
        studioCanvasInspectorRejectText(result && result.reason)
      );

      input.checked = expected.height === "auto";

      return;

    }

    setStudioCanvasInspectorError("height", "");

  });

  row.appendChild(label);
  row.appendChild(input);

  studioCanvasInspectorInputs.v2auto = input;

  return row;

}


/* =========================================================
   5. 글자 — v1 과 **같은 세션 변수 · 같은 규칙**

   focus 에서 기록 한 칸을 잡고, 입력마다 draft 를 고치되 기록은
   만들지 않으며(coalesce), blur 에서 한 칸으로 확정한다. Escape 는
   시작값으로 되돌리고 기록하지 않는다(계약 §22-4).

   ★ 평문이다. 렌더러가 textContent 로 넣으므로 `<b>` 가 실행되지
     않고 줄바꿈은 그대로 남는다(계약 §8 · §23-3).
========================================================== */

function writeStudioCanvasV2Text(value) {

  const view =
    studioCanvasInspectorView();

  if (view.mode !== "single" || view.type !== "text") {
    return false;
  }

  const expected =
    studioCanvasV2Current(view.node, "v2-text");

  if (expected.text === value) {
    setStudioCanvasInspectorError("text", "");
    return true;
  }

  const result =
    commitStudioCanvasInspectorField(
      "v2-text",
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


function studioCanvasV2TextBlock(view) {

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block studio-canvas-inspector-text";

  const label =
    document.createElement("label");

  label.className = "studio-inspector-block-label";
  label.htmlFor = "studioCanvasInspectorText";
  label.textContent = "글자";

  const input =
    document.createElement("textarea");

  input.className = "studio-inspector-textarea";
  input.id = "studioCanvasInspectorText";
  input.rows = 3;
  input.dataset.canvasField = "text";

  input.maxLength =
    (typeof window.SKIN_HOME_CANVAS_MAX_TEXT_CHARS === "number")
      ? window.SKIN_HOME_CANVAS_MAX_TEXT_CHARS
      : 2000;

  input.value =
    studioCanvasV2Current(view.node, "v2-text").text;

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
    writeStudioCanvasV2Text(input.value);
  });

  input.addEventListener("keydown", (event) => {

    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const session =
      studioCanvasInspectorTextSession;

    if (session) {
      writeStudioCanvasV2Text(session.start);
      input.value = session.start;
      setStudioCanvasInspectorError("text", "");
      studioCanvasInspectorTextSession = null;
    }

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

  studioCanvasInspectorInputs.text = input;
  studioCanvasInspectorErrors.text = error;

  return block;

}


/* =========================================================
   5-2. 자리 · 크기 · 각도 — 프레임 내부 요소와 overlay
        (HOME-CANVAS-V2-EDITOR-1B)

   ★ 값은 **그 선택의 자 위의 숫자**다(`view.space`). 직접 조작이
     쓰는 그 자 하나이고, 그래서 손으로 끈 결과와 패널의 숫자가
     언제나 같은 단위다(계약 §26-2).

     프레임 내부 transform   프레임 내부 좌표(props.baseWidth 자)
     프레임 내부 pin         프레임 상자 좌표 — `기준점 + offset`
     overlay                 도화지 좌표(v1 요소와 같다)

   ★ pin 의 X · Y 는 **기준점에서 옮긴 결과**를 적는다. 저장되는
     것은 `pin.offset` 이고 그 환산은 쓰기 관문 앞의 한 곳이 한다
     (studio/inspector/studio-canvas-v2-space.js) — 패널은 화면에
     보이는 그 자리를 그대로 보여 준다.

   ★ 숫자 칸의 규칙은 v1 · v2 블록과 같다(계약 §22-3 · §25-4):
     입력 중에는 아무것도 쓰지 않고 Enter · blur 에서 한 번 쓴다.
     그래서 한 칸의 한 편집 세션이 Undo 한 칸이다.
========================================================== */

const STUDIO_CANVAS_V2_FREE_FIELDS = ["x", "y", "width", "height", "rotation"];

const STUDIO_CANVAS_V2_FREE_LABELS = {
  x: "X",
  y: "Y",
  width: "Width",
  height: "Height",
  rotation: "Rotation"
};


/* 그 칸이 어느 kind 에 실려 가는가 — v1 의 그 표와 나란하다 */
function studioCanvasV2FreeKind(field) {

  if (field === "x" || field === "y") {
    return "v2-move";
  }

  if (field === "width" || field === "height") {
    return "v2-resize";
  }

  return "v2-rotate";

}


/* 그 kind 가 소유한 칸들의 **지금 값**(= `expected`) */
function studioCanvasV2FreeCurrent(space, kind) {

  if (kind === "v2-move") {
    return { x: space.x, y: space.y };
  }

  if (kind === "v2-resize") {
    return {
      x: space.x,
      y: space.y,
      width: space.width,
      height: space.height
    };
  }

  return { rotation: space.rotation };

}


/*
  ★ 화면에는 소수 셋째 자리까지만 적는다.

  pin 의 X · Y 는 `기준점 + offset` 이라 배율에 따라 긴 소수가 될 수
  있다(프레임 폭이 나누어지지 않는 경우). 손으로 끈 결과의 자릿수도
  셋째 자리이므로(editor-runtime 의 roundCanvasCoord) 같은 자를 쓴다.

  ★ **저장값을 깎지 않는다.** 이것은 보여 주는 문자열일 뿐이고,
    `expected` 는 언제나 자에서 읽은 그 숫자다(계약 §26-4).
*/
function studioCanvasV2FreeNumberText(value) {

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value);
  }

  return String(Math.round(value * 1000) / 1000);

}


function studioCanvasV2FreeDisplay(view, field) {

  if (view.mode !== "single" || !view.space) {
    return "";
  }

  if (field === "height" && view.space.height === "auto") {
    return "";
  }

  return studioCanvasV2FreeNumberText(view.space[field]);

}


function studioCanvasV2CommitFree(field) {

  const view =
    studioCanvasInspectorView();

  if (view.mode !== "single" || view.kind === "block" || !view.space) {
    return false;
  }

  const input =
    studioCanvasInspectorInputs ? studioCanvasInspectorInputs[field] : null;

  if (!input) {
    return false;
  }

  const raw =
    String(input.value).trim();

  const value =
    Number(raw);

  if (!raw || !Number.isFinite(value)) {

    setStudioCanvasInspectorError(field, "숫자를 넣어 주세요.");

    input.value = studioCanvasV2FreeDisplay(view, field);

    return false;

  }

  const kind =
    studioCanvasV2FreeKind(field);

  const expected =
    studioCanvasV2FreeCurrent(view.space, kind);

  const next =
    { ...expected };

  /* ★ 각도의 표현은 계약 파일 한 곳이 정한다 — 손으로 돌린 결과와
     같은 자로 접고 반올림한다(§19-3 · §22-3). */
  next[field] =
    (field === "rotation" &&
      typeof window.normalizeSkinHomeCanvasRotation === "function")
      ? window.normalizeSkinHomeCanvasRotation(value)
      : value;

  const result =
    commitStudioCanvasInspectorField(kind, next, expected);

  if (!result || !result.accepted) {

    setStudioCanvasInspectorError(
      field,
      studioCanvasInspectorRejectText(result && result.reason)
    );

    input.value = studioCanvasV2FreeDisplay(studioCanvasInspectorView(), field);

    return false;

  }

  setStudioCanvasInspectorError(field, "");

  /* 접힌 각도처럼 저장값이 입력과 다를 수 있다 — 화면을 저장값으로
     맞춘다(v1 과 같은 이유) */
  const after =
    studioCanvasInspectorView();

  if (after.mode === "single" && after.space) {
    input.value = studioCanvasV2FreeDisplay(after, field);
  }

  return true;

}


function studioCanvasV2FreeNumberRow(field, view) {

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-row studio-canvas-inspector-number";

  const name =
    document.createElement("label");

  name.className = "studio-inspector-row-label";
  name.htmlFor = `studioCanvasInspectorV2-${field}`;
  name.textContent = STUDIO_CANVAS_V2_FREE_LABELS[field];

  const input =
    document.createElement("input");

  input.type = "text";
  input.inputMode = "numeric";
  input.className = "studio-inspector-input studio-inspector-input--number";
  input.id = `studioCanvasInspectorV2-${field}`;
  input.dataset.canvasField = field;

  input.value =
    studioCanvasV2FreeDisplay(view, field);

  /* ★ `height:"auto"` 인 요소의 Height 칸은 잠긴다. 여기서 숫자를
     지어내지 않는다 — 세로 손잡이로 끌면 화면에서 잰 높이로 숫자가
     된다(계약 §18-3 · §26-6). */
  if (field === "height") {
    input.disabled = view.space.height === "auto";
  }

  input.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
      event.preventDefault();
      studioCanvasV2CommitFree(field);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      input.value = studioCanvasV2FreeDisplay(studioCanvasInspectorView(), field);
      setStudioCanvasInspectorError(field, "");
      input.blur();
    }

  });

  input.addEventListener("blur", () => {
    studioCanvasV2CommitFree(field);
  });

  row.appendChild(name);
  row.appendChild(input);

  const error =
    studioCanvasInspectorErrorNode(field);

  const box =
    document.createElement("div");

  box.appendChild(row);
  box.appendChild(error);

  studioCanvasInspectorInputs[field] = input;
  studioCanvasInspectorErrors[field] = error;

  return box;

}


/* =========================================================
   5-2. 소속과 따라가기 (HOME-CANVAS-V2-ELEMENTS-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §28

   ── 여기 있는 칸 ───────────────────────────────────────

     따라가기        transform ↔ pin            (kind: v2-follow)
     기준 대상 · 기준점 · 자기 기준점  (pin 일 때 · kind: v2-pin)
     메인 비주얼로 묶기 / 에서 빼기 / 삭제      (구조 입구)

   ★ 앞 셋은 **자리를 유지한 채** 바뀐다. 그 계산은 패널이 하지
     않는다 — 확정 뒤 번역 한 곳이 렌더러의 자로 한다
     (studio/inspector/studio-canvas-v2-space.js).

   ★ 뒤 셋은 고치는 관문이 아니라 **구조 입구**를 지난다
     (commitStudioCanvasStructureNode). 바뀌는 것이 한 칸이 아니라
     소속이라 `expected` 로 지킬 지금 값이 없기 때문이다(§28-5).
========================================================== */

const STUDIO_CANVAS_V2_PIN_TARGET_LABELS = {
  frame: "프레임 전체",
  photo: "대표 사진"
};

const STUDIO_CANVAS_V2_PIN_POINT_LABELS = {
  "top-left": "왼쪽 위",
  top: "위",
  "top-right": "오른쪽 위",
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
  "bottom-left": "왼쪽 아래",
  bottom: "아래",
  "bottom-right": "오른쪽 아래"
};


function studioCanvasV2PinTargets() {

  return Array.isArray(window.SKIN_HOME_CANVAS_PIN_TARGETS)
    ? window.SKIN_HOME_CANVAS_PIN_TARGETS
    : ["frame", "photo"];

}


function studioCanvasV2PinPoints() {

  return Array.isArray(window.SKIN_HOME_CANVAS_PIN_POINTS)
    ? window.SKIN_HOME_CANVAS_PIN_POINTS
    : Object.keys(STUDIO_CANVAS_V2_PIN_POINT_LABELS);

}


/* 지금 pin 의 세 칸 — 실행 payload 는 언제나 채워져 있다(§23-2) */
function studioCanvasV2PinCurrent(node) {

  const pin =
    (node && node.pin && typeof node.pin === "object") ? node.pin : {};

  return {
    target: pin.target === "photo" ? "photo" : "frame",
    anchor:
      (studioCanvasV2PinPoints().indexOf(pin.anchor) !== -1) ? pin.anchor : "center",
    origin:
      (studioCanvasV2PinPoints().indexOf(pin.origin) !== -1) ? pin.origin : "center"
  };

}


/* select 한 줄 — 값 표 · 이름 표 · 고쳤을 때 할 일만 다르다 */
function studioCanvasV2ChoiceRow(spec) {

  const row =
    document.createElement("div");

  row.className = "studio-inspector-row";

  const label =
    document.createElement("label");

  label.className = "studio-inspector-row-label";
  label.htmlFor = spec.id;
  label.textContent = spec.label;

  const select =
    document.createElement("select");

  select.className = "studio-inspector-select";
  select.id = spec.id;

  spec.values.forEach((value) => {

    const option =
      document.createElement("option");

    option.value = value;

    option.textContent =
      Object.prototype.hasOwnProperty.call(spec.labels, value)
        ? spec.labels[value]
        : value;

    select.appendChild(option);

  });

  select.value = spec.value;

  select.addEventListener("change", () => spec.onChange(select));

  row.appendChild(label);
  row.appendChild(select);

  const error =
    studioCanvasInspectorErrorNode(spec.field);

  const box =
    document.createElement("div");

  box.appendChild(row);
  box.appendChild(error);

  studioCanvasInspectorInputs[spec.field] = select;
  studioCanvasInspectorErrors[spec.field] = error;

  return box;

}


/*
  따라가기 방식.

  ★ 고르는 순간 **자리가 유지된 채** 바뀐다. `pin` 으로 갈 때는
    왼쪽 위 기준으로 시작하고(계약 §28-4), 기준점은 아래 칸에서
    바꾼다 — 그때도 자리는 그대로다.
*/
function studioCanvasV2FollowRow(view) {

  return studioCanvasV2ChoiceRow({

    id: "studioCanvasInspectorFollow",
    field: "follow",
    label: "따라가기",
    values: ["transform", "pin"],
    labels: STUDIO_CANVAS_V2_FOLLOW_LABELS,
    value: view.space.follow === "pin" ? "pin" : "transform",

    onChange: (select) => {

      const now =
        studioCanvasInspectorView();

      if (now.mode !== "single" || now.kind !== "frame-element") {
        return;
      }

      const current =
        (now.space && now.space.follow === "pin") ? "pin" : "transform";

      if (select.value === current) {
        return;
      }

      const result =
        commitStudioCanvasInspectorField(
          "v2-follow",
          { follow: select.value },
          { follow: current }
        );

      if (!result || !result.accepted) {

        setStudioCanvasInspectorError(
          "follow",
          studioCanvasInspectorRejectText(result && result.reason)
        );

        select.value = current;

        return;

      }

      setStudioCanvasInspectorError("follow", "");

    }

  });

}


/*
  pin 의 세 칸. 하나를 바꿔도 **자리는 그대로**이고 offset 만
  다시 계산된다(계약 §28-4) — 그래서 셋이 한 요청이다.
*/
function studioCanvasV2PinRow(view, field, label, values, labels) {

  const current =
    studioCanvasV2PinCurrent(view.node);

  return studioCanvasV2ChoiceRow({

    id: `studioCanvasInspectorPin-${field}`,
    field: `pin-${field}`,
    label: label,
    values: values,
    labels: labels,
    value: current[field],

    onChange: (select) => {

      const now =
        studioCanvasInspectorView();

      if (now.mode !== "single" || now.kind !== "frame-element") {
        return;
      }

      const before =
        studioCanvasV2PinCurrent(now.node);

      const next =
        Object.assign({}, before);

      next[field] = select.value;

      const result =
        commitStudioCanvasInspectorField("v2-pin", next, before);

      if (!result || !result.accepted) {

        setStudioCanvasInspectorError(
          `pin-${field}`,
          studioCanvasInspectorRejectText(result && result.reason)
        );

        select.value = before[field];

        return;

      }

      setStudioCanvasInspectorError(`pin-${field}`, "");

    }

  });

}


function studioCanvasV2PinBlock(view) {

  const box =
    document.createElement("div");

  box.className = "studio-canvas-inspector-pin";
  box.id = "studioCanvasInspectorPin";

  const caption =
    document.createElement("p");

  caption.className = "studio-inspector-block-label";
  caption.textContent = "기준점 — 프레임이 커질 때 붙어 있을 자리";

  box.appendChild(caption);

  box.appendChild(
    studioCanvasV2PinRow(
      view, "target", "기준 대상",
      studioCanvasV2PinTargets(), STUDIO_CANVAS_V2_PIN_TARGET_LABELS)
  );

  box.appendChild(
    studioCanvasV2PinRow(
      view, "anchor", "대상의 기준점",
      studioCanvasV2PinPoints(), STUDIO_CANVAS_V2_PIN_POINT_LABELS)
  );

  box.appendChild(
    studioCanvasV2PinRow(
      view, "origin", "자기 기준점",
      studioCanvasV2PinPoints(), STUDIO_CANVAS_V2_PIN_POINT_LABELS)
  );

  return box;

}


/* 지금 draft 의 `main_visual` 블록들 — 묶을 수 있는 자리 */
function studioCanvasV2Frames() {

  if (typeof window.studioCanvasDraftPayload !== "function") {
    return [];
  }

  const payload =
    window.studioCanvasDraftPayload();

  const blocks =
    (payload && payload.flow && Array.isArray(payload.flow.blocks))
      ? payload.flow.blocks
      : [];

  return blocks.filter(
    (block) => block && typeof block === "object" && block.type === "main_visual"
  );

}


/* 구조 입구 하나 — 누르면 소속이 바뀌거나 사라진다 */
function studioCanvasV2StructureButton(spec) {

  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "studio-inspector-mini-button studio-canvas-structure-button";
  button.id = spec.id;
  button.textContent = spec.label;

  button.addEventListener("click", () => {

    const now =
      studioCanvasInspectorView();

    if (now.mode !== "single") {
      return;
    }

    if (typeof window.commitStudioCanvasStructureNode !== "function") {
      return;
    }

    const request =
      { op: spec.op, id: now.id };

    if (spec.op === "attach") {

      const select =
        studioCanvasInspectorInputs && studioCanvasInspectorInputs.attachFrame;

      request.frameId = select ? select.value : "";

    }

    const result =
      window.commitStudioCanvasStructureNode(request);

    setStudioCanvasInspectorError(
      "structure",
      (result && result.accepted)
        ? ""
        : studioCanvasInspectorRejectText(result && result.reason)
    );

  });

  return button;

}


/*
  소속을 바꾸는 자리.

  ★ 묶을 프레임은 **주인이 고른다**(계약 §28-2). 하나뿐이어도
    고르는 칸을 그린다 — lasso 나 가까움으로 소속이 정해지지 않는
    다는 것이 이 계약의 요점이다.
*/
function studioCanvasV2StructureBlock(view) {

  const box =
    document.createElement("div");

  box.className = "studio-canvas-inspector-structure";
  box.id = "studioCanvasInspectorStructure";

  const caption =
    document.createElement("p");

  caption.className = "studio-inspector-block-label";
  caption.textContent = "소속";

  box.appendChild(caption);

  if (view.kind === "overlay") {

    const frames =
      studioCanvasV2Frames();

    if (frames.length) {

      box.appendChild(
        studioCanvasV2ChoiceRow({
          id: "studioCanvasInspectorAttachFrame",
          field: "attachFrame",
          label: "묶을 메인 비주얼",
          values: frames.map((frame) => frame.id),
          labels: {},
          value: frames[0].id,
          onChange: () => {}
        })
      );

      box.appendChild(
        studioCanvasV2StructureButton({
          id: "studioCanvasAttach",
          op: "attach",
          label: "메인 비주얼로 묶기"
        })
      );

    }
    else {

      box.appendChild(
        studioCanvasInspectorNote(
          "묶을 메인 비주얼이 없습니다 — 먼저 흐름에 하나 만드세요.",
          "studioCanvasInspectorNoFrame"
        )
      );

    }

  }

  if (view.kind === "frame-element") {

    box.appendChild(
      studioCanvasV2StructureButton({
        id: "studioCanvasDetach",
        op: "detach",
        label: "메인 비주얼에서 빼기"
      })
    );

  }

  box.appendChild(
    studioCanvasV2StructureButton({
      id: "studioCanvasRemove",
      op: "remove",
      label: "삭제"
    })
  );

  const error =
    studioCanvasInspectorErrorNode("structure");

  studioCanvasInspectorErrors.structure = error;

  box.appendChild(error);

  return box;

}


/*
  따라가기 · pin 세 칸의 값만 갈아 끼운다(Undo · Import 로 바뀐다).
  **포커스가 있는 칸은 건너뛴다** — v1 과 같은 이유다.
*/
function syncStudioCanvasV2FollowInputs(view) {

  if (view.kind !== "frame-element" || !studioCanvasInspectorInputs) {
    return;
  }

  const active =
    document.activeElement;

  const follow =
    studioCanvasInspectorInputs.follow;

  if (follow && follow !== active) {
    follow.value = view.space.follow === "pin" ? "pin" : "transform";
  }

  if (view.space.follow !== "pin") {
    return;
  }

  const current =
    studioCanvasV2PinCurrent(view.node);

  ["target", "anchor", "origin"].forEach((field) => {

    const select =
      studioCanvasInspectorInputs[`pin-${field}`];

    if (select && select !== active) {
      select.value = current[field];
    }

  });

}


/* 그 자가 무슨 자인지 한 줄로 — 숫자만 보면 알 수 없다 */
function studioCanvasV2SpaceCaption(view) {

  if (view.kind === "overlay") {
    return "도화지 좌표 (Canvas px)";
  }

  return (view.space.follow === "pin")
    ? "프레임 좌표 (기준점에서 옮긴 자리)"
    : "프레임 내부 좌표 (Canvas px)";

}


function studioCanvasV2FreeBlock(view) {

  const layout =
    document.createElement("div");

  layout.className = "studio-canvas-inspector-geometry";
  layout.id = "studioCanvasInspectorV2Free";

  const caption =
    document.createElement("p");

  caption.className = "studio-inspector-block-label";
  caption.textContent = studioCanvasV2SpaceCaption(view);

  layout.appendChild(caption);

  /* HOME-CANVAS-V2-ELEMENTS-1 — `1B` 에서는 읽기 전용 한 줄이었다.
     이제 고를 수 있고, 고르면 **자리를 유지한 채** 방식이 바뀐다
     (계약 §28-4). */
  if (view.kind === "frame-element") {
    layout.appendChild(studioCanvasV2FollowRow(view));
  }

  STUDIO_CANVAS_V2_FREE_FIELDS.forEach((field) => {
    layout.appendChild(studioCanvasV2FreeNumberRow(field, view));
  });

  if (view.space.height === "auto") {

    layout.appendChild(
      studioCanvasInspectorNote(
        "높이가 Auto 입니다 — 세로 손잡이로 끌면 숫자가 됩니다.",
        "studioCanvasInspectorV2AutoNote"
      )
    );

  }

  return layout;

}


/* 값만 갈아 끼운다 — 포커스가 있는 칸은 건너뛴다(v1 과 같은 이유) */
function syncStudioCanvasV2FreeInputs(view) {

  const active =
    document.activeElement;

  STUDIO_CANVAS_V2_FREE_FIELDS.forEach((field) => {

    const input =
      studioCanvasInspectorInputs[field];

    if (!input || input === active) {
      return;
    }

    if (field === "height") {
      input.disabled = view.space.height === "auto";
    }

    const value =
      studioCanvasV2FreeDisplay(view, field);

    if (input.value !== value) {
      input.value = value;
    }

  });

}


/* =========================================================
   6. 화면 하나

   ★ 무엇이 골라졌는지 **먼저** 적는다(계약 §25-3). `main_visual`
     안에서는 프레임과 내부 요소가 같은 자리에 겹쳐 있으므로, 이
     한 줄이 없으면 주인이 지금 무엇을 고치고 있는지 알 수 없다.
========================================================== */

function studioCanvasV2WhereNote(view) {

  if (view.kind === "block") {

    return (view.type === "main_visual")
      ? "메인 비주얼 **프레임 전체**를 고르고 있습니다. 한 번 더 누르면 안쪽 요소로 들어갑니다."
      : "자동 배치 블록입니다 — 흐름 안의 자리를 고칩니다.";

  }

  if (view.kind === "frame-element") {
    return "메인 비주얼 **안쪽 요소**입니다. 프레임으로 나가려면 프레임 밖을 누르세요.";
  }

  return "페이지 자유 장식(overlay)입니다.";

}


function buildStudioCanvasV2Inspector(view) {

  studioCanvasInspectorBody.appendChild(
    studioCanvasInspectorNote(
      studioCanvasV2WhereNote(view).replace(/\*\*/g, ""),
      "studioCanvasInspectorWhere"
    )
  );

  if (view.type === "text") {
    studioCanvasInspectorBody.appendChild(studioCanvasV2TextBlock(view));
  }

  if (view.kind !== "block") {

    /* =====================================================
       HOME-CANVAS-V2-EDITOR-1B — 자리 · 크기 · 각도를 고친다

       `1A` 에서는 여기가 읽기 전용 요약이었다. 이제는 자 위의
       다섯 칸이 입력이고, 자를 만들 수 없을 때만 예전처럼 요약을
       그린다(숫자를 지어내지 않는다 — 계약 §26-6).
    ====================================================== */

    if (view.space) {

      studioCanvasInspectorBody.appendChild(studioCanvasV2FreeBlock(view));

      /* HOME-CANVAS-V2-ELEMENTS-1 — pin 의 기준 셋과 소속 */
      if (view.kind === "frame-element" && view.space.follow === "pin") {
        studioCanvasInspectorBody.appendChild(studioCanvasV2PinBlock(view));
      }

      studioCanvasInspectorBody.appendChild(studioCanvasV2StructureBlock(view));

      return;

    }

    const box =
      document.createElement("div");

    box.className = "studio-canvas-inspector-type";
    box.id = "studioCanvasInspectorV2Read";

    if (view.kind === "frame-element") {

      const follow =
        view.node.follow === "pin" ? "pin" : "transform";

      box.appendChild(
        studioCanvasInspectorReadRow(
          "따라가기",
          STUDIO_CANVAS_V2_FOLLOW_LABELS[follow]
        )
      );

    }

    box.appendChild(
      studioCanvasInspectorReadRow(
        "크기",
        `${view.node.width} × ${view.node.height === "auto" ? "auto" : view.node.height}`
      )
    );

    box.appendChild(
      studioCanvasInspectorNote(
        "이 프레임의 자를 만들 수 없어 자리와 크기를 고칠 수 없습니다.",
        "studioCanvasInspectorV2ReadNote"
      )
    );

    studioCanvasInspectorBody.appendChild(box);

    /* 자를 만들 수 없어도 **지우고 빼는 것은 할 수 있다** — 자리
       계산이 필요 없는 동작이고(빼기는 필요하다 · 거기서 다시
       거절된다), 고칠 수 없는 요소가 지울 수도 없으면 주인이
       손쓸 길이 없다 */
    studioCanvasInspectorBody.appendChild(studioCanvasV2StructureBlock(view));

    return;

  }

  const layout =
    document.createElement("div");

  layout.className = "studio-canvas-inspector-geometry";
  layout.id = "studioCanvasInspectorV2Layout";

  const caption =
    document.createElement("p");

  caption.className = "studio-inspector-block-label";
  caption.textContent = "흐름 안의 자리 (Canvas px)";

  layout.appendChild(caption);

  layout.appendChild(studioCanvasV2OrderRow(view));
  layout.appendChild(studioCanvasV2AlignRow(view));
  layout.appendChild(studioCanvasV2NumberRow("width", "Width", view));
  layout.appendChild(studioCanvasV2NumberRow("height", "Height", view));

  if (studioCanvasV2AutoAllowed(view.type)) {
    layout.appendChild(studioCanvasV2AutoToggle(view));
  }

  const marginCaption =
    document.createElement("p");

  marginCaption.className = "studio-inspector-block-label";
  marginCaption.textContent = "여백 (음수도 됩니다)";

  layout.appendChild(marginCaption);

  studioCanvasV2Edges().forEach((edge) => {
    layout.appendChild(
      studioCanvasV2NumberRow(edge, STUDIO_CANVAS_V2_EDGE_LABELS[edge], view)
    );
  });

  studioCanvasInspectorBody.appendChild(layout);

  /* HOME-CANVAS-V2-ELEMENTS-1 — 블록도 지울 수 있다. `main_visual` 을
     지우면 그 안의 장식도 함께 없어진다 — 프레임이 곧 그 자리다. */
  studioCanvasInspectorBody.appendChild(studioCanvasV2StructureBlock(view));

}


/*
  값만 갈아 끼운다 — DOM 은 그대로다.
  **포커스가 있는 칸은 건너뛴다**(v1 과 같은 이유).
*/
function syncStudioCanvasV2Inspector(view) {

  if (view.mode !== "single" || !studioCanvasInspectorInputs) {
    return;
  }

  const active =
    document.activeElement;

  const text =
    studioCanvasInspectorInputs.text;

  if (text && text !== active) {

    const value =
      studioCanvasV2Current(view.node, "v2-text").text;

    if (text.value !== value) {
      text.value = value;
    }

  }

  if (view.kind !== "block") {

    /* HOME-CANVAS-V2-EDITOR-1B — 프레임 내부 요소 · overlay 의
       다섯 칸. 자가 없으면 그릴 것도 없다(읽기 전용 요약). */
    if (view.space) {
      syncStudioCanvasV2FreeInputs(view);
      syncStudioCanvasV2FollowInputs(view);
    }

    return;

  }

  ["width", "height"].concat(studioCanvasV2Edges()).forEach((field) => {

    const input =
      studioCanvasInspectorInputs[field];

    if (!input || input === active) {
      return;
    }

    if (field === "height") {
      input.disabled = view.node.height === "auto";
    }

    const value =
      studioCanvasV2Display(view, field);

    if (input.value !== value) {
      input.value = value;
    }

  });

  const align =
    studioCanvasInspectorInputs.align;

  if (align && align !== active) {
    align.value = studioCanvasV2Current(view.node, "v2-align").align;
  }

  const auto =
    studioCanvasInspectorInputs.v2auto;

  if (auto && auto !== active) {
    auto.checked = view.node.height === "auto";
  }

  const at =
    studioCanvasInspectorInputs.orderAt;

  if (at) {
    at.textContent = `${view.index + 1} / ${view.blockCount}`;
  }

  if (studioCanvasInspectorInputs.orderUp) {
    studioCanvasInspectorInputs.orderUp.disabled = view.index <= 0;
  }

  if (studioCanvasInspectorInputs.orderDown) {
    studioCanvasInspectorInputs.orderDown.disabled =
      view.index >= view.blockCount - 1;
  }

}
