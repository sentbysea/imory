/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 크기 · 자리 · 여백 폼
   (COMMON-SELECT-BOX-1)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §20

   Select 패널은 색이 아니라 **상자**에서 시작한다. 이 파일은 그
   상자 항목들을 그리고, Preview 의 손잡이 드래그를 같은 값으로
   잇는다.

     studioInspectorBoxInfo()          이 요소에 무엇이 실제로 듣는가
     renderStudioInspectorBoxWidth()   가로 — 자동 · 내용 · 부모 폭 · 직접
     renderStudioInspectorBoxHeight()  세로 — 자동 · 최소 높이 · 직접
     renderStudioInspectorBoxPlace()   상자 위치 — 왼쪽 · 가운데 · 오른쪽 · 폭 채우기
     renderStudioInspectorBoxAlign()   내용 정렬 — 가로 · 세로
     renderStudioInspectorBoxPad()     안쪽 여백(전체 + 네 방향)
     renderStudioInspectorBoxSpace()   바깥 간격(위 · 아래 · 좌우)
     renderStudioInspectorBoxBorder()  테두리 없음/있음 · 굵기
     renderStudioInspectorBoxRadius()  모서리 둥글기
     renderStudioInspectorDetails()    "색상 · 꾸미기" 접힘 절
     begin/move/end/cancelStudioInspectorBoxDrag()  손잡이 드래그

   ★ "실제로 작동하는 설정만"

   무엇을 그릴지는 **화면에서 잰 값**이 정한다(studioInspectorBoxInfo).
   inline 요소에는 너비도 안쪽 여백도 듣지 않으므로 그 칸을 내고,
   absolute 요소에는 바깥 간격이 뜻이 없으므로 내지 않는다. 모든
   요소에 같은 무효 컨트롤을 줄 세우지 않는다는 뜻이다.

   ★ 상자 위치와 내용 정렬은 한 벌이 아니다

   버튼 모양이 닮았다고 합치면 "가운데 놓인 상자 안에서 글자는
   왼쪽"을 만들 수 없다. 둘은 건드리는 속성부터 다르다 — 자리는
   margin, 정렬은 align 계열이다(studio-inspector-box-model.js).

   ★ 슬라이더 · 숫자 · 손잡이는 한 값이다

   셋 다 previewStudioInspectorBoxSize() / commitStudioInspectorBoxSize()
   둘을 지난다. 끄는 동안은 임시 반영만 하고 손을 뗐을 때 한 번
   확정하므로, 드래그 한 번이 Undo 한 칸이다.

   의존(이 파일보다 먼저 로드되어야 함):
   studio/inspector/studio-inspector-state.js,
   studio/inspector/studio-inspector-box-model.js,
   studio/inspector/studio-inspector-controls.js
   (appendStudioInspectorRow · bindStudioInspectorRange ·
   studioInspectorRangeFill). 호출 시점 의존:
   studio-inspector-edit.js(commitStudioInspectorStyle ·
   applyStudioInspectorPatch · mergeStudioInspectorDeclarations).
========================================================== */


const STUDIO_INSPECTOR_BOX_MIN = 8;

const STUDIO_INSPECTOR_BOX_MAX = 2000;

/* 가로 · 세로 정렬 버튼. 값은 사람이 고르는 세 자리다. */
const STUDIO_INSPECTOR_BOX_ALIGN_X =
  [["left", "start", "왼쪽"], ["center", "center", "가운데"], ["right", "end", "오른쪽"]];

const STUDIO_INSPECTOR_BOX_ALIGN_Y =
  [["start", "start", "위"], ["center", "center", "가운데"], ["end", "end", "아래"]];


/* =========================================================
   studioInspectorBoxInfo(info) — 이 요소에 무엇이 실제로 듣는가

   실측(display · position)이 없으면 보통의 블록으로 본다 — 칸을
   통째로 감추는 것보다 낫다(sandbox 프레임의 옛 배포).
========================================================== */

function studioInspectorBoxInfo(info, resolved) {

  const metrics =
    studioInspectorMetrics || {};

  const display =
    String(metrics.display || "");

  const position =
    String(metrics.position || "");

  const styleable =
    !!info && !info.isProtectedRegion;

  /* 너비 · 안쪽 여백이 듣지 않는 자리 */
  const inline =
    display === "inline" || display === "contents";

  /* 바깥 간격이 뜻을 갖지 않는 자리 */
  const absolute =
    position === "absolute" || position === "fixed";

  const mode =
    (display === "flex" || display === "inline-flex")
      ? (/column/.test(String(metrics.flexDirection || "")) ? "flex-col" : "flex-row")
      : ((display === "grid" || display === "inline-grid") ? "grid" : "block");

  const boxy =
    styleable && !!info && info.kind !== "image" && !inline;

  return {
    styleable,
    inline,
    absolute,
    mode,
    width: Math.round(Number(metrics.width) || 0),
    height: Math.round(Number(metrics.height) || 0),
    parentWidth: Math.round(Number(metrics.parentWidth) || 0),
    parentHeight: Math.round(Number(metrics.parentHeight) || 0),
    canSize: boxy,
    canPlace: boxy && !absolute,
    canAlign: boxy,
    /* inline 요소에도 안쪽 여백은 듣는다(좌우는 완전히, 위아래는
       줄 높이를 밀지 않을 뿐) — 그래서 여기만 inline 을 막지 않는다.
       너비 · 자리 · 위아래 간격은 듣지 않으므로 위에서 막힌다. */
    canPad: styleable && !!info && info.kind !== "image",
    canSpace: styleable && !!info && !inline && !absolute,
    canBorder: styleable && !!info && !info.isProtectedRegion
  };

}


/* 이번 선택의 상자 선언 — 선택한 요소 자신의 규칙이다(자르기 ·
   "사진 영역 너비"처럼 다른 요소로 가는 컨트롤이 아니다). */
function studioInspectorBoxDeclarations(resolved) {

  return (resolved && studioInspectorSelection)
    ? window.readInspectorEditDeclarations(resolved.source.css, studioInspectorSelection.editId)
    : {};

}


function studioInspectorBoxChoice(control, options, current, onPick) {

  const group =
    document.createElement("span");

  group.className =
    "studio-inspector-choice";

  options.forEach(([value, text]) => {

    const option =
      document.createElement("button");

    option.type = "button";
    option.className = "studio-inspector-choice-option";
    option.dataset.inspectorControl = control;
    option.dataset.inspectorValue = value;
    option.textContent = text;

    if (current === value) {
      option.classList.add("is-active");
    }

    option.setAttribute("aria-pressed", String(current === value));

    option.addEventListener("click", () => onPick(value));

    group.appendChild(option);

  });

  return group;

}


/* 슬라이더 + 숫자 한 벌 — 끄는 동안 임시, 손을 떼면 확정 */
function studioInspectorBoxSlider(spec) {

  const group =
    document.createElement("span");

  group.className =
    "studio-inspector-range-group";

  const range =
    document.createElement("input");

  range.type = "range";
  range.className = "studio-inspector-range";
  range.dataset.inspectorControl = `${spec.control}Range`;
  range.min = String(spec.min);
  range.max = String(spec.max);
  range.step = "1";
  range.value = String(spec.value);
  range.setAttribute("aria-label", spec.label);

  const number =
    document.createElement("input");

  number.type = "number";
  number.className = "studio-inspector-input studio-inspector-input--number";
  number.dataset.inspectorControl = `${spec.control}Number`;
  number.min = String(spec.min);
  number.max = String(spec.max);
  number.value = String(spec.value);

  bindStudioInspectorRange(range);

  range.addEventListener("input", () => {
    number.value = range.value;
    spec.onPreview(Number(range.value));
  });

  range.addEventListener("change", () => {
    spec.onCommit(Number(range.value));
  });

  number.addEventListener("input", () => {
    range.value = number.value;
    studioInspectorRangeFill(range);
  });

  number.addEventListener("change", () => {
    spec.onCommit(Number(number.value));
  });

  number.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      spec.onCommit(Number(number.value));
    }
  });

  group.appendChild(range);
  group.appendChild(number);

  return group;

}


/* px 한 칸 — 여백처럼 "비우면 기본" 인 값에 쓴다 */
function studioInspectorBoxNumber(control, value, onCommit) {

  const input =
    document.createElement("input");

  input.type = "number";
  input.min = "0";
  input.className = "studio-inspector-input studio-inspector-input--number";
  input.dataset.inspectorControl = control;
  input.value = value === "" ? "" : String(value);
  input.placeholder = "기본";

  input.addEventListener("change", () => onCommit(input.value));

  return input;

}


/* =========================================================
   1. 크기
========================================================== */

function studioInspectorBoxWidthMax(box, current) {

  return Math.max(
    box.parentWidth || 0,
    box.width || 0,
    Number(current) || 0,
    240
  );

}


function renderStudioInspectorBoxWidth(spec, info, declarations, resolved) {

  const box =
    studioInspectorBoxInfo(info, resolved);

  const value =
    window.readInspectorControlValue("boxWidth", declarations);

  /* 값이 없으면 지금 화면에서 실제로 그려진 폭이 첫 자리다 —
     Inspector 의 숫자와 Preview 의 크기가 처음부터 같다. */
  const px =
    value.px || String(box.width || STUDIO_INSPECTOR_BOX_MIN);

  const max =
    studioInspectorBoxWidthMax(box, px);

  const commitMode = (mode) => {

    clearStudioInspectorPreview();

    commitStudioInspectorStyle(
      "boxWidth",
      mode === value.mode ? { mode: "" } : { mode, px }
    );

  };

  appendStudioInspectorRow(
    spec.label,
    studioInspectorBoxChoice(
      "boxWidth",
      [["auto", "자동"], ["content", "내용 맞춤"], ["fill", "부모 폭 맞춤"], ["fixed", "직접 입력"]],
      value.mode || "auto",
      (mode) => commitMode(mode === "auto" ? "" : mode)
    )
  );

  appendStudioInspectorRow(
    `${spec.label} (px)`,
    studioInspectorBoxSlider({
      control: "boxWidth",
      label: `${spec.label} 값`,
      min: STUDIO_INSPECTOR_BOX_MIN,
      max,
      value: Math.min(Math.max(Number(px) || STUDIO_INSPECTOR_BOX_MIN, STUDIO_INSPECTOR_BOX_MIN), max),
      onPreview: (next) => previewStudioInspectorBoxSize({ width: next }),
      onCommit: (next) => commitStudioInspectorBoxSize({ width: next })
    }),
    studioInspectorClearIf(
      !!value.mode,
      () => {
        clearStudioInspectorPreview();
        commitStudioInspectorStyle("boxWidth", { mode: "" });
      }
    )
  );

}


function renderStudioInspectorBoxHeight(spec, info, declarations, resolved) {

  const box =
    studioInspectorBoxInfo(info, resolved);

  const value =
    window.readInspectorControlValue("boxHeight", declarations);

  const px =
    value.px || String(box.height || STUDIO_INSPECTOR_BOX_MIN);

  const max =
    Math.max(box.height * 2, box.parentHeight || 0, Number(px) || 0, 400);

  appendStudioInspectorRow(
    spec.label,
    studioInspectorBoxChoice(
      "boxHeight",
      [["auto", "자동"], ["min", "최소 높이"], ["fixed", "직접 입력"]],
      value.mode || "auto",
      (mode) => {
        clearStudioInspectorPreview();
        commitStudioInspectorStyle(
          "boxHeight",
          mode === "auto" ? { mode: "" } : { mode, px }
        );
      }
    )
  );

  if (value.mode) {

    appendStudioInspectorRow(
      `${spec.label} (px)`,
      studioInspectorBoxSlider({
        control: "boxHeight",
        label: `${spec.label} 값`,
        min: STUDIO_INSPECTOR_BOX_MIN,
        max,
        value: Math.min(Math.max(Number(px) || STUDIO_INSPECTOR_BOX_MIN, STUDIO_INSPECTOR_BOX_MIN), max),
        onPreview: (next) =>
          previewStudioInspectorBoxSize({ height: next, heightMode: value.mode }),
        onCommit: (next) =>
          commitStudioInspectorBoxSize({ height: next, heightMode: value.mode })
      }),
      studioInspectorClearIf(
        true,
        () => {
          clearStudioInspectorPreview();
          commitStudioInspectorStyle("boxHeight", { mode: "" });
        }
      )
    );

  }

}


/* =========================================================
   2. 상자 위치 — 부모 안에서 어디에 놓이는가

   "폭 채우기"는 자리가 아니라 폭이라 boxWidth 로 간다. 둘이 같은
   값을 가리키므로 위 "가로"의 `부모 폭 맞춤`과 늘 같이 켜진다.
========================================================== */

function renderStudioInspectorBoxPlace(spec, info, declarations) {

  const place =
    window.readInspectorControlValue("boxPlace", declarations);

  const width =
    window.readInspectorControlValue("boxWidth", declarations);

  const current =
    width.mode === "fill" ? "fill" : (place.place || "");

  appendStudioInspectorRow(
    spec.label,
    studioInspectorBoxChoice(
      "boxPlace",
      [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"], ["fill", "폭 채우기"]],
      current,
      (value) => {

        clearStudioInspectorPreview();

        if (value === "fill") {
          commitStudioInspectorStyle("boxWidth", current === "fill" ? { mode: "" } : { mode: "fill" });
          return;
        }

        commitStudioInspectorStyle(
          "boxPlace",
          { place: current === value ? "" : value, side: place.side }
        );

      }
    ),
    studioInspectorClearIf(
      !!place.place,
      () => commitStudioInspectorStyle("boxPlace", { place: "", side: place.side })
    )
  );

}


/* =========================================================
   3. 내용 정렬 — 상자 **안**의 글자와 칸

   세로는 "높이가 있을 때"만 뜻이 있다. 자동 높이 상자에는 남는
   공간이 없어 어느 값을 골라도 그림이 같다 — 그래서 높이를 정했거나
   이미 flex/grid 인 자리에만 그린다.
========================================================== */

function renderStudioInspectorBoxAlign(spec, info, declarations, resolved) {

  const box =
    studioInspectorBoxInfo(info, resolved);

  const current =
    window.readInspectorBoxAlign(declarations, box.mode);

  const height =
    window.readInspectorControlValue("boxHeight", declarations);

  const commit = (next) => {

    clearStudioInspectorPreview();

    commitStudioInspectorStyle("boxAlign", {
      mode: box.mode,
      x: next.x,
      y: next.y
    });

  };

  appendStudioInspectorRow(
    "가로",
    studioInspectorBoxChoice(
      "align",
      STUDIO_INSPECTOR_BOX_ALIGN_X.map(([value, , text]) => [value, text]),
      (STUDIO_INSPECTOR_BOX_ALIGN_X.find(([, key]) => key === current.x) || [""])[0],
      (value) => {

        const key =
          (STUDIO_INSPECTOR_BOX_ALIGN_X.find(([name]) => name === value) || ["", ""])[1];

        commit({ x: current.x === key ? "" : key, y: current.y });

      }
    ),
    studioInspectorClearIf(!!current.x, () => commit({ x: "", y: current.y }))
  );

  if (!height.mode && box.mode === "block") {
    return;
  }

  appendStudioInspectorRow(
    "세로",
    studioInspectorBoxChoice(
      "alignY",
      STUDIO_INSPECTOR_BOX_ALIGN_Y.map(([value, , text]) => [value, text]),
      current.y,
      (value) => commit({ x: current.x, y: current.y === value ? "" : value })
    ),
    studioInspectorClearIf(!!current.y, () => commit({ x: current.x, y: "" }))
  );

}


/* =========================================================
   4. 여백 — 안쪽(padding)과 바깥(margin)

   안쪽 여백은 "전체" 한 칸으로 시작하고, 펼치면 네 방향이 나온다.
   네 방향이 서로 다르면 전체 칸은 비어 보이고(placeholder 가
   "다름"), 전체 칸에 숫자를 넣으면 네 방향이 같아진다.
========================================================== */

let studioInspectorPadDetail = false;


function renderStudioInspectorBoxPad(spec, info, declarations) {

  const pad =
    window.readInspectorControlValue("boxPad", declarations);

  const sides =
    [["top", "위"], ["right", "오른쪽"], ["bottom", "아래"], ["left", "왼쪽"]];

  const values =
    sides.map(([side]) => pad[side]);

  const uniform =
    values.every((value) => value === values[0]) ? values[0] : "";

  const commit = (next) => commitStudioInspectorStyle("boxPad", next);

  const all =
    studioInspectorBoxNumber("padding", uniform, (value) =>
      commit({ top: value, right: value, bottom: value, left: value }));

  if (!uniform && values.some(Boolean)) {
    all.placeholder = "다름";
  }

  const detail =
    document.createElement("button");

  detail.type = "button";
  detail.className = "studio-inspector-detail-toggle";
  detail.dataset.inspectorControl = "paddingDetail";
  detail.id = "studioInspectorPadDetail";
  detail.textContent = studioInspectorPadDetail ? "접기" : "자세히";
  detail.setAttribute("aria-expanded", String(studioInspectorPadDetail));

  detail.addEventListener("click", () => {
    studioInspectorPadDetail = !studioInspectorPadDetail;
    renderStudioInspectorPopover();
  });

  const group =
    document.createElement("span");

  group.className = "studio-inspector-range-group";
  group.appendChild(all);
  group.appendChild(detail);

  appendStudioInspectorRow(
    `${spec.label} (px)`,
    group,
    studioInspectorClearIf(
      values.some(Boolean),
      () => commit({ top: "", right: "", bottom: "", left: "" })
    )
  );

  if (!studioInspectorPadDetail) {
    return;
  }

  sides.forEach(([side, name]) => {

    appendStudioInspectorRow(
      name,
      studioInspectorBoxNumber(
        `padding${side.charAt(0).toUpperCase()}${side.slice(1)}`,
        pad[side],
        (value) => commit({ ...pad, [side]: value })
      ),
      studioInspectorClearIf(!!pad[side], () => commit({ ...pad, [side]: "" }))
    );

  });

}


function renderStudioInspectorBoxSpace(spec, info, declarations, resolved) {

  const box =
    studioInspectorBoxInfo(info, resolved);

  const space =
    window.readInspectorControlValue("boxSpace", declarations);

  const place =
    window.readInspectorControlValue("boxPlace", declarations);

  const commitSpace = (next) =>
    commitStudioInspectorStyle("boxSpace", { ...space, ...next });

  appendStudioInspectorRow(
    `${spec.label} 위 (px)`,
    studioInspectorBoxNumber("spaceTop", space.top, (value) => commitSpace({ top: value })),
    studioInspectorClearIf(!!space.top, () => commitSpace({ top: "" }))
  );

  appendStudioInspectorRow(
    `${spec.label} 아래 (px)`,
    studioInspectorBoxNumber("spaceBottom", space.bottom, (value) => commitSpace({ bottom: value })),
    studioInspectorClearIf(!!space.bottom, () => commitSpace({ bottom: "" }))
  );

  /* 좌우는 "상자 위치"와 같은 속성을 쓰므로 한 컨트롤로 간다 —
     가운데(auto)와 좌우 간격(px)이 서로를 덮지 않는 이유다. */
  if (!box.canPlace) {
    return;
  }

  appendStudioInspectorRow(
    `${spec.label} 좌우 (px)`,
    studioInspectorBoxNumber("spaceSide", place.side, (value) =>
      commitStudioInspectorStyle("boxPlace", { place: place.place, side: value })),
    studioInspectorClearIf(
      !!place.side,
      () => commitStudioInspectorStyle("boxPlace", { place: place.place, side: "" })
    )
  );

}


/* =========================================================
   7. 테두리 · 모서리

   색은 기본적으로 지금 글자색을 따른다(currentColor) = Layout 에서
   정한 테마색이 그대로 내려온다. 따로 고르는 색은 아래 "색상 ·
   꾸미기" 절에만 있다.
========================================================== */

function renderStudioInspectorBoxBorder(spec, info, declarations) {

  const border =
    window.readInspectorControlValue("boxBorder", declarations);

  const commit = (next) =>
    commitStudioInspectorStyle("boxBorder", { ...border, ...next });

  appendStudioInspectorRow(
    spec.label,
    studioInspectorBoxChoice(
      "borderOn",
      [["none", "없음"], ["on", "있음"]],
      border.on === true ? "on" : (border.on === false ? "none" : ""),
      (value) => commit({ on: value === "on" })
    ),
    studioInspectorClearIf(border.on !== null, () => commit({ on: null }))
  );

  if (border.on !== true) {
    return;
  }

  appendStudioInspectorRow(
    "굵기 (px)",
    studioInspectorBoxNumber("borderWidth", border.width, (value) => commit({ width: value }))
  );

}


function renderStudioInspectorBoxRadius(spec, info, declarations) {

  const current =
    window.readInspectorControlValue("boxRadius", declarations);

  appendStudioInspectorRow(
    `${spec.label} (px)`,
    studioInspectorBoxNumber("radius", current, (value) =>
      commitStudioInspectorStyle("boxRadius", value)),
    studioInspectorClearIf(
      current !== "",
      () => commitStudioInspectorStyle("boxRadius", "")
    )
  );

}


/* 테두리 색 — "색상 · 꾸미기" 절에만 있다(기본은 테마색 상속) */
function renderStudioInspectorBorderColor(spec, info, declarations) {

  const border =
    window.readInspectorControlValue("boxBorder", declarations);

  const input =
    document.createElement("input");

  input.type = "color";
  input.className = "studio-inspector-color";
  input.dataset.inspectorControl = "borderColor";
  input.value = border.color || "#000000";

  if (!border.color) {
    input.classList.add("is-unset");
    input.title = "Layout 에서 정한 색을 따릅니다";
  }

  input.addEventListener("change", () =>
    commitStudioInspectorStyle("boxBorder", { ...border, on: true, color: input.value }));

  appendStudioInspectorRow(
    spec.label,
    input,
    studioInspectorClearIf(
      !!border.color,
      () => commitStudioInspectorStyle("boxBorder", { ...border, color: "" })
    )
  );

}


/* =========================================================
   9. 색상 · 꾸미기 — 아래쪽 접힘 절

   색을 지우지는 않는다. 다만 맨 아래로 내리고 접어 둔다 — Layout
   에서 정한 테마색을 그대로 쓰는 것이 기본이고, 여기 색은 이
   요소 하나에만 거는 덮어쓰기라서다.

   접힘 상태는 팝오버를 다시 그려도 그대로 남는다(선택을 바꿔도
   같다 — 한 번 펼친 사람은 계속 펼친 채로 쓴다).
========================================================== */

let studioInspectorDetailsOpen = false;


function renderStudioInspectorDetails(spec) {

  const head =
    document.createElement("button");

  head.type = "button";
  head.className = "studio-inspector-details";
  head.id = "studioInspectorDetails";
  head.dataset.inspectorControl = "details";
  head.setAttribute("aria-expanded", String(studioInspectorDetailsOpen));
  head.textContent = `${spec.label} ${studioInspectorDetailsOpen ? "▴" : "▾"}`;

  head.addEventListener("click", () => {
    studioInspectorDetailsOpen = !studioInspectorDetailsOpen;
    renderStudioInspectorPopover();
  });

  studioInspectorFields.appendChild(head);

  const body =
    document.createElement("div");

  body.className = "studio-inspector-details-body";
  body.id = "studioInspectorDetailsBody";
  body.hidden = !studioInspectorDetailsOpen;

  studioInspectorFields.appendChild(body);

  /* 다음 행들은 이 상자 안으로 들어간다 — appendStudioInspectorRow 가
     studioInspectorFieldTarget 을 먼저 본다. */
  studioInspectorFieldTarget = body;

}


/* =========================================================
   Preview 손잡이 드래그 (이미지가 아닌 상자)

   이미지의 모서리 드래그(studio-inspector-image-size.js)와 같은
   구조다 — 기준점은 반대쪽 모서리, 포인터는 핸들이 캡처, 한
   프레임에 한 번만 임시 반영, 손을 뗐을 때 한 번 확정.

   다른 점 하나: 비율을 지키지 않는다. 글 상자의 가로와 세로는
   서로 매인 값이 아니다.
========================================================== */

function studioInspectorBoxClamp(value) {

  const number =
    Math.round(Number(value));

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(Math.max(number, STUDIO_INSPECTOR_BOX_MIN), STUDIO_INSPECTOR_BOX_MAX);

}


function syncStudioInspectorBoxInputs(next) {

  const set = (control, value) => {

    if (value === undefined) {
      return;
    }

    const range =
      studioInspectorFields.querySelector(`[data-inspector-control="${control}Range"]`);

    const number =
      studioInspectorFields.querySelector(`[data-inspector-control="${control}Number"]`);

    if (range) {
      range.value = String(value);
      studioInspectorRangeFill(range);
    }

    if (number) {
      number.value = String(value);
    }

  };

  set("boxWidth", next.width);
  set("boxHeight", next.height);

}


function previewStudioInspectorBoxSize(next) {

  if (!studioInspectorSelection) {
    return;
  }

  const style = {};

  if (next.width !== undefined) {

    const width =
      studioInspectorBoxClamp(next.width);

    if (width !== null) {
      style.width = `${width}px`;
      style["max-width"] = "100%";
    }

  }

  if (next.height !== undefined) {

    const height =
      studioInspectorBoxClamp(next.height);

    if (height !== null) {
      style[next.heightMode === "min" ? "min-height" : "height"] = `${height}px`;
    }

  }

  if (!Object.keys(style).length) {
    return;
  }

  syncStudioInspectorBoxInputs(next);

  sendStudioInspectorPreview({
    editId: studioInspectorSelection.editId,
    style
  });

}


/* 가로와 세로를 **한 번에** 확정한다 — 모서리 드래그 한 번이
   Undo 두 칸이 되지 않게 한다. */
function commitStudioInspectorBoxSize(next) {

  if (!studioInspectorSelection) {
    return false;
  }

  const width =
    next.width === undefined ? null : studioInspectorBoxClamp(next.width);

  const height =
    next.height === undefined ? null : studioInspectorBoxClamp(next.height);

  if (width === null && height === null) {
    return false;
  }

  clearStudioInspectorPreview();

  const editId =
    studioInspectorSelection.editId;

  return applyStudioInspectorPatch((element, css) => {

    let nextCss =
      css;

    if (width !== null) {
      nextCss = mergeStudioInspectorDeclarations(
        nextCss, editId, "boxWidth", { mode: "fixed", px: width }
      );
    }

    if (height !== null) {
      nextCss = mergeStudioInspectorDeclarations(
        nextCss, editId, "boxHeight",
        { mode: next.heightMode === "min" ? "min" : "fixed", px: height }
      );
    }

    return { css: nextCss };

  });

}


function beginStudioInspectorBoxDrag(event, corner, handle) {

  if (
    !studioInspectorEnabled ||
    !studioInspectorBoxResizable ||
    !studioInspectorSelection ||
    studioInspectorBoxDrag
  ) {
    return;
  }

  const mapped =
    studioInspectorMapRectRaw(studioInspectorSelection.rect);

  if (!mapped || !mapped.scale) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const horizontal =
    corner.indexOf("w") !== -1 || corner.indexOf("e") !== -1;

  const vertical =
    corner.indexOf("n") !== -1 || corner.indexOf("s") !== -1;

  const declarations =
    studioInspectorBoxDeclarations(describeStudioInspectorSelection());

  const height =
    window.readInspectorControlValue("boxHeight", declarations);

  studioInspectorBoxDrag = {
    pointerId: event.pointerId,
    handle,
    corner,
    horizontal,
    vertical,
    heightMode: height.mode === "min" ? "min" : "fixed",
    scale: mapped.scale,
    anchorX: corner.indexOf("w") === -1 ? mapped.left : mapped.right,
    anchorY: corner.indexOf("n") === -1 ? mapped.top : mapped.bottom,
    startWidth: Math.round(studioInspectorSelection.rect.width),
    startHeight: Math.round(studioInspectorSelection.rect.height),
    width: Math.round(studioInspectorSelection.rect.width),
    height: Math.round(studioInspectorSelection.rect.height),
    frame: 0
  };

  try {
    handle.setPointerCapture(event.pointerId);
  } catch (err) {
    /* 캡처가 안 되는 환경에서도 아래 document 리스너가 받는다 */
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.add("is-dragging");
  }

}


function moveStudioInspectorBoxDrag(event) {

  const drag =
    studioInspectorBoxDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  const width =
    drag.horizontal
      ? studioInspectorBoxClamp(Math.abs(event.clientX - drag.anchorX) / drag.scale)
      : null;

  const height =
    drag.vertical
      ? studioInspectorBoxClamp(Math.abs(event.clientY - drag.anchorY) / drag.scale)
      : null;

  if (
    (width === null || width === drag.width) &&
    (height === null || height === drag.height)
  ) {
    return;
  }

  if (width !== null) {
    drag.width = width;
  }

  if (height !== null) {
    drag.height = height;
  }

  if (!drag.frame) {

    drag.frame =
      window.requestAnimationFrame(() => {

        drag.frame = 0;

        if (studioInspectorBoxDrag === drag) {
          previewStudioInspectorBoxSize({
            width: drag.horizontal ? drag.width : undefined,
            height: drag.vertical ? drag.height : undefined,
            heightMode: drag.heightMode
          });
        }

      });

  }

}


function finishStudioInspectorBoxDrag(drag) {

  if (drag.frame) {
    window.cancelAnimationFrame(drag.frame);
  }

  try {

    if (drag.handle.hasPointerCapture && drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }

  } catch (err) {
    /* 이미 풀렸으면 그만이다 */
  }

  studioInspectorBoxDrag =
    null;

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.remove("is-dragging");
  }

}


function endStudioInspectorBoxDrag(event) {

  const drag =
    studioInspectorBoxDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  finishStudioInspectorBoxDrag(drag);

  if (drag.width === drag.startWidth && drag.height === drag.startHeight) {
    clearStudioInspectorPreview();
    return;
  }

  commitStudioInspectorBoxSize({
    width: drag.horizontal ? drag.width : undefined,
    height: drag.vertical ? drag.height : undefined,
    heightMode: drag.heightMode
  });

}


function cancelStudioInspectorBoxDrag(event) {

  const drag =
    studioInspectorBoxDrag;

  if (!drag || (event && event.pointerId !== drag.pointerId)) {
    return;
  }

  finishStudioInspectorBoxDrag(drag);

  clearStudioInspectorPreview();

}


/* 이미지 크기 조절과 상자 크기 조절은 같은 핸들에서 시작한다 —
   지금 선택이 어느 쪽인지는 여기서 한 번만 가른다. */
function beginStudioInspectorAnyHandleDrag(event, corner, handle) {

  if (studioInspectorResizable) {
    beginStudioInspectorHandleDrag(event, corner, handle);
    return;
  }

  beginStudioInspectorBoxDrag(event, corner, handle);

}


document.addEventListener("pointermove", moveStudioInspectorBoxDrag);

document.addEventListener("pointerup", endStudioInspectorBoxDrag);

document.addEventListener("pointercancel", cancelStudioInspectorBoxDrag);
