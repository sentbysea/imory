/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: Select 패널의 항목 (DIRECT-UX-1)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §9 · §10 · §11

   studio-inspector-controls.js 가 폼을 그리는 **틀**(행 하나 그리기 ·
   컨트롤 종류별 분기 · 팝오버 전체 다시 그리기)이라면, 이 파일은 일반
   UI 에서 **무엇을 보여 줄지**와 이 라운드가 더한 행들을 갖는다:

     buildStudioInspectorControls()  아홉 절의 차례(COMMON-SELECT-BOX-1)
     renderStudioInspectorSection()  절 제목
     renderStudioInspectorVisibility() 표시 — 보이기/숨기기
     renderStudioInspectorOpacity()  투명도 — 슬라이더 + 숫자
     renderStudioInspectorOrder()    앞뒤 — 겹침 순서 / 형제 순서
     renderStudioInspectorMotion()   "움직임 효과 적용됨 [미리보기]" 한 줄

   예전 목록(배치 · 전환 폼 포함)은 controls.js 의
   buildStudioInspectorAdvancedControls() 로 남아 개발/테스트 스위치에서만
   쓰인다(아래 머리말).

   의존(호출 시점): studio-inspector-controls.js(appendStudioInspectorRow /
   bindStudioInspectorRange / studioInspectorClearIf /
   buildStudioInspectorAdvancedControls), studio-inspector-quickbar.js
   (commitStudioInspectorHidden / studioInspectorIsHidden /
   studioInspectorOrderInfo / commitStudioInspectorOrder),
   studio-inspector-edit.js(commitStudioInspectorStyle),
   studio-inspector-crop.js(studioInspectorCropWrapperOf),
   studio/studio-preview.js(postTransitionPlayToFrame).
========================================================== */


/* 개발/테스트 스위치 — window.IMORY_STUDIO_ADVANCED_INSPECTOR = true 이면
   예전 목록(배치·전환 폼 포함)을 그린다. 화면에 켜는 곳은 없다 —
   배치/전환 엔진의 e2e(studio-layout · studio-transition)가 그 폼으로
   엔진을 두드린다. 일반 UI 의 차례는 아래 COMMON-SELECT-BOX-1 절. */

function studioInspectorAdvancedFields() {
  return window.IMORY_STUDIO_ADVANCED_INSPECTOR === true;
}


const STUDIO_INSPECTOR_ALIGN_OPTIONS =
  [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]];


/* =========================================================
   COMMON-SELECT-BOX-1 — 아홉 절의 차례

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §20

   Select 패널은 색이 아니라 **상자**에서 시작한다. 사람이 화면을
   고칠 때 먼저 정하는 것이 "얼마나 크고 · 어디에 놓이고 · 안의
   글자가 어떻게 서는가"이기 때문이다. 색은 지우지 않았다 — 맨
   아래 접힘 절로 내렸다. Layout 에서 정한 테마색을 그대로 쓰는
   것이 기본이고, 여기 색은 이 요소 하나에만 거는 덮어쓰기다.

     1 크기           가로(자동·내용·부모 폭·직접) · 세로(자동·최소·직접)
     2 상자 위치      왼쪽 · 가운데 · 오른쪽 · 폭 채우기
     3 내용 정렬      가로(왼·가운데·오른) · 세로(위·가운데·아래)
     4 여백           안쪽 여백(전체 + 네 방향) · 바깥 간격
     5 요소별 기능    내용 · 이동할 곳 · 이미지 · 맞춤 · 자르기
     6 타이포그래피   글꼴 · 글자 크기 · 굵기
     7 테두리 · 모서리
     8 표시 · 투명도  표시 · 투명도 · 앞뒤
     9 색상 · 꾸미기  (접힘) 글자색 · 배경색 · 테두리 색

   ★ 상자 위치와 내용 정렬을 한 벌로 합치지 않는다
     합치면 "가운데 놓인 상자 안에서 글자는 왼쪽"을 만들 수 없다.
     둘은 건드리는 속성부터 다르다(studio-inspector-box-model.js).

   ★ 그 요소에 실제로 듣는 것만 그린다
     inline 요소에는 너비도 안쪽 여백도 듣지 않고, absolute 요소
     에는 바깥 간격이 뜻이 없다. 그 판단은 화면에서 잰 display /
     position 이 한다(studioInspectorBoxInfo) — 모든 요소에 같은
     무효 컨트롤을 줄 세우지 않는다.

   ★ 배치(LAYOUT-1)와 전환(TRANSITION-1)의 상세 칸은 여기서
     그리지 않는다. 값은 지우지 않는다 — 모든 확정은 그 요소 규칙의
     해당 속성만 바꾸므로(applyStudioInspectorPatch) 숨긴 값은 한
     글자도 건드려지지 않는다. 효과가 있는 요소에는 상태 한 줄과
     [미리보기]만 보인다.

   ★ 개발/테스트 스위치 — window.IMORY_STUDIO_ADVANCED_INSPECTOR = true
     이면 예전 목록(배치·전환 폼 포함)을 그린다. 화면에 켜는 곳은 없다.
========================================================== */

/* 5절의 이름은 요소마다 다르다 — "요소별 기능"이 화면에서 뜻하는 말 */
const STUDIO_INSPECTOR_FEATURE_SECTION = {
  text: "내용",
  link: "내용과 링크",
  image: "이미지",
  container: "이 요소의 기능"
};


function buildStudioInspectorControls(info, resolved) {

  if (studioInspectorAdvancedFields()) {
    return buildStudioInspectorAdvancedControls(info);
  }

  const can =
    info.capabilities;

  const styleable =
    !info.isProtectedRegion;

  const image =
    info.kind === "image";

  const box =
    typeof studioInspectorBoxInfo === "function"
      ? studioInspectorBoxInfo(info, resolved)
      : { canSize: false, canPlace: false, canAlign: false, canPad: false, canSpace: false, canBorder: false };

  const controls = [];

  const section = (label) => controls.push({ type: "section", label });


  /* ---- 1. 크기 ------------------------------------------ */

  if (image && can.size) {

    /* EDITORIAL-CUSTOMIZATION-1 — 스킨이 자리를 정해 둔 사진에서는
       사진 자신의 너비가 아니라 **그 자리의 너비**를 고친다. 사진을
       크게 보는 일은 아래 "자르기"의 확대가 맡는다. */
    const framed =
      typeof studioInspectorSizeOwner === "function" && !!studioInspectorSizeOwner();

    section("크기");

    controls.push({
      control: "size",
      type: "imageSize",
      label: framed ? "사진 영역 너비" : "너비",
      unit: "px"
    });

  } else if (box.canSize) {

    section("크기");

    controls.push({ control: "boxWidth", type: "boxWidth", label: "가로" });
    controls.push({ control: "boxHeight", type: "boxHeight", label: "세로" });

  }


  /* ---- 2. 상자 위치 ------------------------------------- */

  if (image && can.imageAlign) {

    section("상자 위치");

    controls.push({
      control: "imageAlign",
      type: "choice",
      label: "부모 안에서",
      options: STUDIO_INSPECTOR_ALIGN_OPTIONS
    });

  } else if (box.canPlace) {

    section("상자 위치");

    controls.push({ control: "boxPlace", type: "boxPlace", label: "부모 안에서" });

  }


  /* ---- 3. 내용 정렬 ------------------------------------- */

  if (box.canAlign) {

    section("내용 정렬");

    controls.push({ control: "boxAlign", type: "boxAlign", label: "정렬" });

  }


  /* ---- 4. 여백 ------------------------------------------ */

  if (box.canPad || box.canSpace) {

    section("여백");

    if (box.canPad) {
      controls.push({ control: "boxPad", type: "boxPad", label: "안쪽 여백" });
    }

    if (box.canSpace) {
      controls.push({ control: "boxSpace", type: "boxSpace", label: "바깥 간격" });
    }

  }


  /* ---- 5. 요소별 기능 ----------------------------------- */

  const feature = [];

  if (can.text) {

    feature.push({
      control: "text",
      type: "textBlock",
      label: info.kind === "link" ? "표시 문구" : "내용"
    });

  } else if (info.bindPath && styleable && (info.kind === "text" || info.kind === "link")) {

    feature.push({
      control: "textBinding",
      type: "bindNote",
      label: info.kind === "link" ? "표시 문구" : "내용"
    });

  }

  if (can.href) {
    feature.push({ control: "href", type: "text", label: "이동할 곳" });
  }

  if (image && (can.imageSource || can.imageClear)) {
    feature.push({ control: "imageSource", type: "image", label: "이미지" });
  }

  if (image) {

    /* 자른 이미지는 구도를 자르기가 정한다 — 맞춤을 따로 두면 둘이
       서로를 덮는다. */
    const cropped =
      !!(resolved && typeof studioInspectorCropWrapperOf === "function" &&
        studioInspectorCropWrapperOf(resolved.element, resolved.source.css));

    if (styleable && !cropped) {
      feature.push({
        control: "objectFit",
        type: "choice",
        label: "맞춤",
        options: [["cover", "공간 채우기"], ["contain", "이미지 전체 보기"]]
      });
    }

    if (can.crop) {
      feature.push({ control: "crop", type: "crop", label: "자르기" });
    }

  }

  if (feature.length) {
    section(STUDIO_INSPECTOR_FEATURE_SECTION[info.kind] || "이 요소의 기능");
    feature.forEach((spec) => controls.push(spec));
  }


  /* ---- 6. 타이포그래피 ---------------------------------- */

  if (can.typography && !image) {

    section("타이포그래피");

    if (info.kind === "text" || info.kind === "link") {

      controls.push({
        control: "fontFamily",
        type: "choice",
        label: "글꼴",
        options: [["sans", "고딕"], ["serif", "명조"], ["mono", "고정폭"]]
      });

    }

    controls.push({ control: "fontSize", type: "numberRange", label: "글자 크기", unit: "px" });

    if (info.kind === "text" || info.kind === "link") {

      controls.push({
        control: "fontWeight",
        type: "choice",
        label: "굵기",
        options: [["400", "보통"], ["500", "중간"], ["700", "굵게"]]
      });

    }

  }


  /* ---- 7. 테두리 · 모서리 ------------------------------- */

  if (box.canBorder) {

    section("테두리 · 모서리");

    controls.push({ control: "boxBorder", type: "boxBorder", label: "테두리" });

    if (image && can.shape) {

      controls.push({
        control: "shape",
        type: "choice",
        label: "모서리",
        options: [["square", "각지게"], ["soft", "약간 둥글게"], ["circle", "원형"]]
      });

    } else if (!image) {

      controls.push({ control: "boxRadius", type: "boxRadius", label: "모서리 둥글기" });

    }

  }


  /* ---- 8. 표시 · 투명도 --------------------------------- */

  if (styleable) {

    section("표시 · 투명도");

    controls.push({ control: "hidden", type: "visibility", label: "표시" });

    controls.push({ control: "opacity", type: "range", label: "투명도", unit: "%" });

    if (resolved && typeof studioInspectorOrderInfo === "function" && studioInspectorOrderInfo(resolved).mode) {
      controls.push({ control: "order", type: "order", label: "앞뒤" });
    }

  }


  /* ---- 9. 색상 · 꾸미기 (접힘) -------------------------- */

  const decoration = [];

  if (can.color) {
    decoration.push({ control: "color", type: "color", label: "글자색" });
  }

  if (can.background) {
    decoration.push({ control: "background", type: "color", label: "배경색" });
  }

  if (box.canBorder) {
    decoration.push({ control: "borderColor", type: "borderColor", label: "테두리 색" });
  }

  if (decoration.length) {
    controls.push({ type: "details", label: "색상 · 꾸미기" });
    decoration.forEach((spec) => controls.push(spec));
  }

  return controls;

}





function renderStudioInspectorSection(spec) {

  const heading =
    document.createElement("p");

  heading.className =
    "studio-inspector-section";

  heading.textContent =
    spec.label;

  studioInspectorFields.appendChild(heading);

}


/* 표시 여부 — 보이기 / 숨기기 두 칸 */
function renderStudioInspectorVisibility(spec, resolved) {

  const hidden =
    typeof studioInspectorIsHidden === "function" && studioInspectorIsHidden(resolved);

  const group =
    document.createElement("span");

  group.className =
    "studio-inspector-choice";

  [["shown", "보이기", false], ["hidden", "숨기기", true]].forEach(([value, text, hide]) => {

    const option =
      document.createElement("button");

    option.type = "button";
    option.className = "studio-inspector-choice-option";
    option.dataset.inspectorControl = "hidden";
    option.dataset.inspectorValue = value;
    option.textContent = text;

    if (hidden === hide) {
      option.classList.add("is-active");
    }

    option.addEventListener("click", () => {
      if (hidden !== hide) {
        commitStudioInspectorHidden(hide);
      }
    });

    group.appendChild(option);

  });

  appendStudioInspectorRow(spec.label, group);

}


/* 투명도 — 슬라이더 + 숫자. 손을 뗄 때(change) 한 번 확정한다 */
function renderStudioInspectorOpacity(spec, current) {

  const group =
    document.createElement("span");

  group.className =
    "studio-inspector-range-group";

  const range =
    document.createElement("input");

  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.step = "1";
  range.className = "studio-inspector-range";
  range.id = "studioInspectorOpacityRange";
  range.dataset.inspectorControl = "opacity";
  range.value = current === "" ? "100" : current;
  range.setAttribute("aria-label", "투명도");

  const number =
    document.createElement("input");

  number.type = "number";
  number.min = "0";
  number.max = "100";
  number.className = "studio-inspector-input studio-inspector-input--number";
  number.id = "studioInspectorOpacityNumber";
  number.dataset.inspectorControl = "opacityNumber";
  number.value = current === "" ? "100" : current;

  bindStudioInspectorRange(range);

  range.addEventListener("input", () => {
    number.value = range.value;
  });

  range.addEventListener("change", () => {
    commitStudioInspectorStyle("opacity", range.value);
  });

  number.addEventListener("change", () => {
    commitStudioInspectorStyle("opacity", number.value);
  });

  group.appendChild(range);
  group.appendChild(number);

  appendStudioInspectorRow(
    `${spec.label} (${spec.unit})`,
    group,
    studioInspectorClearIf(current !== "", () => commitStudioInspectorStyle("opacity", ""))
  );

}


/* =========================================================
   숫자 + 슬라이더 한 줄 (EDITORIAL-CUSTOMIZATION-1)

   글자 크기처럼 "조금씩 밀어 보며 고르는" 값에 쓴다. 숫자칸의
   data-inspector-control 은 예전 숫자칸과 같은 이름 그대로다 —
   슬라이더가 옆에 생겼을 뿐 고치는 값도, 확정 경로도 같다.

   슬라이더는 끄는 동안 **임시 미리보기**를 보내고(저장 없음), 손을
   뗐을 때 한 번만 확정한다 = 드래그 한 번이 Undo 한 칸이다.
   숫자 · 슬라이더 · 확정이 같은 commitStudioInspectorStyle() 하나를
   지나므로 "슬라이더와 숫자가 서로 다른 값을 만든다"가 없다.
========================================================== */

const STUDIO_INSPECTOR_NUMBER_RANGE = {
  fontSize: { min: 8, max: 72, fallback: 16 }
};


function renderStudioInspectorNumberRange(spec, current, resolved) {

  const bounds =
    STUDIO_INSPECTOR_NUMBER_RANGE[spec.control] || { min: 0, max: 100, fallback: 0 };

  /* 값이 없으면 지금 화면에서 실제로 그려진 크기를 첫 자리로 쓴다 —
     "기본"과 사용자가 고른 값이 같은 자에서 시작한다(실측은 iframe
     이 한다, preview-bridge.js inspectorMetricsOf). */
  const measured =
    spec.control === "fontSize" && studioInspectorMetrics
      ? Math.round(Number(studioInspectorMetrics.fontSize) || 0)
      : 0;

  const start =
    current !== ""
      ? Number(current)
      : (measured > 0 ? measured : bounds.fallback);

  const value =
    Math.min(Math.max(start, bounds.min), bounds.max);

  const group =
    document.createElement("span");

  group.className =
    "studio-inspector-range-group";

  const range =
    document.createElement("input");

  range.type = "range";
  range.min = String(bounds.min);
  range.max = String(bounds.max);
  range.step = "1";
  range.className = "studio-inspector-range";
  range.id = `studioInspector${spec.control.charAt(0).toUpperCase()}${spec.control.slice(1)}Range`;
  range.dataset.inspectorControl = `${spec.control}Range`;
  range.value = String(value);
  range.setAttribute("aria-label", spec.label);

  const number =
    document.createElement("input");

  number.type = "number";
  number.min = String(bounds.min);
  number.max = String(bounds.max);
  number.className = "studio-inspector-input studio-inspector-input--number";
  number.dataset.inspectorControl = spec.control;
  number.value = current === "" ? "" : String(value);
  number.placeholder = "기본";

  bindStudioInspectorRange(range);

  range.addEventListener("input", () => {

    number.value = range.value;

    if (studioInspectorSelection) {

      sendStudioInspectorPreview({
        editId: studioInspectorSelection.editId,
        style: window.buildInspectorStylePatch(spec.control, range.value)
      });

    }

  });

  range.addEventListener("change", () => {
    clearStudioInspectorPreview();
    commitStudioInspectorStyle(spec.control, range.value);
  });

  number.addEventListener("change", () => {
    clearStudioInspectorPreview();
    commitStudioInspectorStyle(spec.control, number.value);
  });

  group.appendChild(range);
  group.appendChild(number);

  appendStudioInspectorRow(
    `${spec.label}${spec.unit ? ` (${spec.unit})` : ""}`,
    group,
    studioInspectorClearIf(current !== "", () => commitStudioInspectorStyle(spec.control, ""))
  );

}


/* 앞으로 / 뒤로 — Quick Bar 와 같은 일(commitStudioInspectorOrder) */
function renderStudioInspectorOrder(spec, resolved) {

  const order =
    studioInspectorOrderInfo(resolved);

  if (!order.mode) {
    return;
  }

  const group =
    document.createElement("span");

  group.className =
    "studio-inspector-choice";

  [["forward", 1, order.mode === "z" ? "앞으로" : "순서 앞으로", order.canForward],
   ["backward", -1, order.mode === "z" ? "뒤로" : "순서 뒤로", order.canBackward]].forEach(
    ([key, direction, text, enabled]) => {

      const button =
        document.createElement("button");

      button.type = "button";
      button.className = "studio-inspector-choice-option";
      button.id = `studioInspectorOrder-${key}`;
      button.dataset.inspectorControl = "order";
      button.dataset.inspectorValue = key;
      button.textContent = text;
      button.disabled = !enabled;

      button.addEventListener("click", () => commitStudioInspectorOrder(direction));

      group.appendChild(button);

    }
  );

  appendStudioInspectorRow(spec.label, group);

}


/* =========================================================
   움직임 효과 상태 (DIRECT-UX-1 §11)

   효과가 있는 요소에만 한 줄: "움직임 효과 적용됨 [미리보기]".
   미리보기는 지금 효과를 한 번 재생할 뿐 값을 바꾸지 않는다. 효과를
   더하거나 바꾸는 폼은 일반 UI 에 없다(AI · Code).
========================================================== */

function renderStudioInspectorMotion(info, blocked) {

  const line =
    studioInspectorMotion;

  if (!line) {
    return;
  }

  const declared =
    info && info.transition && info.transition.declared;

  const hasMotion =
    !!declared && !!declared.type && declared.type !== "none";

  line.innerHTML = "";

  if (!hasMotion || studioInspectorAdvancedFields()) {
    line.hidden = true;
    return;
  }

  const text =
    document.createElement("span");

  text.className = "studio-inspector-motion-text";
  text.textContent = "움직임 효과 적용됨";

  line.appendChild(text);

  if (!blocked) {

    const play =
      document.createElement("button");

    play.type = "button";
    play.className = "studio-inspector-clear";
    play.id = "studioInspectorMotionPlay";
    play.textContent = "미리보기";
    play.title = "지금 효과를 한 번 재생합니다(값은 바뀌지 않아요)";

    play.addEventListener("click", () => {
      if (info.editId && typeof postTransitionPlayToFrame === "function") {
        postTransitionPlayToFrame(info.editId);
      }
    });

    line.appendChild(play);

  }

  line.hidden = false;

}
