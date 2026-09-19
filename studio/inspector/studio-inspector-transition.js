/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 전환(TRANSITION PRIMITIVE)

   기준 문서: IMORY_TRANSITION_PRIMITIVE_DESIGN.md
   계약/판정: skin/skin-transition.js

   고른 요소가 **나타날 때 어떻게 움직이는가**를 사람이 직접 고치는
   자리다. AI 가 "페이드되게", "아래에서 살짝 올라오게"를 받았을 때
   고치는 것도 **똑같은 속성**이다 — 그래서 이 파일에는 전환 규칙이
   한 줄도 없다. 허용 값·범위·기본값은 skin/skin-transition.js 가
   정하고, 여기는 그 표를 읽어 폼을 그린다(배치 폼과 같은 구조,
   studio-inspector-layout.js).

   ── 무엇을 고치나 ─────────────────────────────────────
   템플릿 HTML 의 속성 넷. 생성 CSS 규칙도 @keyframes 도 쓰지 않는다.

     data-imory-transition            효과 (없으면 움직임 없음)
     data-imory-transition-duration   속도(ms)
     data-imory-transition-easing     움직임의 곡선
     data-imory-transition-direction  방향 (방향이 뜻을 갖는 효과만)

   ── 미리 보기 ─────────────────────────────────────────
   Preview 는 편집마다 다시 그려서 전환을 저절로 재생하지 않는다
   (preview-bridge.js transitionAppear:false). 그래서 값을 바꾸면
   한 번 재생하고, "▶ 미리 보기" 버튼으로 다시 볼 수 있다.

   ── 확정 경로 ─────────────────────────────────────────
   전부 applyStudioInspectorPatch() 하나를 지난다 — 실패하면 working
   draft 는 한 글자도 바뀌지 않고, 성공하면 Undo 한 칸이 생긴다.

   ── 의존 ───────────────────────────────────────────────
   호출 시점: skin/skin-transition.js(전역 값 목록),
   studio-inspector-edit.js(applyStudioInspectorPatch),
   studio-inspector-controls.js(appendStudioInspectorRow),
   studio/studio-preview.js(postTransitionPlayToFrame, showStudioToast).
========================================================== */


/* =========================================================
   사용자에게 보이는 이름 — 내부 값과 화면 문구의 짝은 여기에만
========================================================== */

const STUDIO_TRANSITION_TYPE_CHOICES = [
  ["", "없음"],
  ["fade", "페이드"],
  ["slide", "슬라이드"],
  ["scale", "확대"],
  ["fade-slide", "페이드 + 슬라이드"],
  ["fade-scale", "페이드 + 확대"]
];

/* 속도는 이름 붙은 네 칸 + 지금 값(직접 적힌 값이면). 숫자 칸을
   따로 두지 않는다 — 사람에게는 "느리게"가 "360"보다 읽힌다. */
const STUDIO_TRANSITION_SPEED_CHOICES = [
  ["140", "빠르게"],
  ["", "보통"],
  ["360", "느리게"],
  ["600", "아주 느리게"]
];

const STUDIO_TRANSITION_DIRECTION_CHOICES = [
  ["", "아래에서 위로"],
  ["down", "위에서 아래로"],
  ["left", "오른쪽에서 왼쪽으로"],
  ["right", "왼쪽에서 오른쪽으로"]
];

const STUDIO_TRANSITION_EASING_CHOICES = [
  ["", "기본"],
  ["smooth", "부드럽게"],
  ["ease-out", "끝을 천천히"],
  ["ease-in", "시작을 천천히"],
  ["ease-in-out", "양끝을 천천히"],
  ["linear", "일정하게"]
];


/* =========================================================
   확정
========================================================== */

function studioInspectorTransitionPlayLater() {

  const selection =
    typeof studioInspectorSelection !== "undefined" ? studioInspectorSelection : null;

  const editId =
    selection && selection.editId;

  if (!editId || typeof postTransitionPlayToFrame !== "function") {
    return;
  }

  /* 확정은 Preview 를 다시 그린다(applyWorkingSkinChanges). 그
     렌더가 도착한 뒤에 재생해야 새 DOM 에서 움직인다. */
  window.setTimeout(() => postTransitionPlayToFrame(editId), 160);

}

/* 효과 바꾸기.

   "없음"은 속성 넷을 **전부** 걷는다 — 효과가 없는데 속도만 남아
   있으면 파일에는 값이 있는데 화면에서는 아무 일도 없다(감사
   경고가 그때마다 뜬다). 방향이 뜻을 잃는 효과(fade)로 바꿀 때는
   방향을 걷는다 — 배치 종류를 바꿀 때 이전 종류의 파라미터를 걷는
   것과 같은 판단이다. */
function commitStudioInspectorTransitionType(type) {

  const next =
    String(type || "").trim();

  if (next && !isSkinTransitionType(next)) {
    showStudioToast("이 값은 넣을 수 없어요.", { isError: true });
    return false;
  }

  const ok = applyStudioInspectorPatch((element) => {

    if (!next) {

      element.removeAttribute(SKIN_TRANSITION_ATTR);

      ["duration", "easing", "direction"].forEach((name) => {
        element.removeAttribute(SKIN_TRANSITION_PARAM_PREFIX + name);
      });

      return {};

    }

    element.setAttribute(SKIN_TRANSITION_ATTR, next);

    if (SKIN_TRANSITION_DIRECTIONAL_TYPES.indexOf(next) === -1) {
      element.removeAttribute(SKIN_TRANSITION_PARAM_PREFIX + "direction");
    }

    return {};

  });

  if (ok && next) {
    studioInspectorTransitionPlayLater();
  }

  return ok;

}

function commitStudioInspectorTransitionParam(name, value) {

  const attr =
    SKIN_TRANSITION_PARAM_PREFIX + name;

  const trimmed =
    String(value === null || value === undefined ? "" : value).trim();

  const stored =
    trimmed ? sanitizeSkinTransitionAttributeValue(attr, trimmed) : "";

  if (stored === null) {
    showStudioToast("이 값은 넣을 수 없어요.", { isError: true });
    return false;
  }

  const ok = applyStudioInspectorPatch((element) => {

    if (stored) {
      element.setAttribute(attr, stored);
    } else {
      element.removeAttribute(attr);
    }

    return {};

  });

  if (ok) {
    studioInspectorTransitionPlayLater();
  }

  return ok;

}


/* =========================================================
   폼 — controls.js 의 renderStudioInspectorControl() 이 부른다
========================================================== */

function studioInspectorTransitionSelect(id, labelText, value, options, onChange) {

  const select =
    document.createElement("select");

  select.className =
    "studio-inspector-input studio-inspector-select";

  select.id =
    id;

  options.forEach(([optionValue, optionLabel]) => {

    const option =
      document.createElement("option");

    option.value = optionValue;
    option.textContent = optionLabel;

    select.appendChild(option);

  });

  select.value =
    value;

  select.addEventListener("change", () => onChange(select.value));

  appendStudioInspectorRow(labelText, select);

  return select;

}

function renderStudioInspectorTransitionBlock(spec, info) {

  const transition =
    info.transition;

  if (!transition) {
    return;
  }

  const declared =
    transition.declared || {};

  studioInspectorTransitionSelect(
    "studioInspectorTransitionType",
    spec.label,
    declared.type && declared.type !== "none" ? declared.type : "",
    STUDIO_TRANSITION_TYPE_CHOICES,
    (value) => commitStudioInspectorTransitionType(value)
  );

  if (!declared.type || declared.type === "none") {
    return;
  }

  /* 속도 — 이름 붙은 칸에 없는 값이 적혀 있으면 그 값을 한 칸 더
     보여 준다(AI 나 Code Editor 가 적은 240 같은 값이 폼을 여는
     순간 "보통"으로 보이면 사람이 고친 줄 안다). */

  const speedChoices =
    STUDIO_TRANSITION_SPEED_CHOICES.slice();

  const currentSpeed =
    declared.duration || "";

  if (currentSpeed && !speedChoices.some(([value]) => value === currentSpeed)) {
    speedChoices.push([currentSpeed, `${currentSpeed}ms`]);
  }

  studioInspectorTransitionSelect(
    "studioInspectorTransitionDuration",
    "속도",
    currentSpeed,
    speedChoices,
    (value) => commitStudioInspectorTransitionParam("duration", value)
  );

  if (transition.directional) {

    studioInspectorTransitionSelect(
      "studioInspectorTransitionDirection",
      "방향",
      declared.direction && declared.direction !== "up" ? declared.direction : "",
      STUDIO_TRANSITION_DIRECTION_CHOICES,
      (value) => commitStudioInspectorTransitionParam("direction", value)
    );

  }

  studioInspectorTransitionSelect(
    "studioInspectorTransitionEasing",
    "움직임",
    declared.easing && declared.easing !== "ease" ? declared.easing : "",
    STUDIO_TRANSITION_EASING_CHOICES,
    (value) => commitStudioInspectorTransitionParam("easing", value)
  );

  const play =
    document.createElement("button");

  play.type = "button";
  play.id = "studioInspectorTransitionPlay";
  play.className = "studio-inspector-clear";
  play.textContent = "▶ 미리 보기";

  play.addEventListener("click", () => {

    if (info.editId && typeof postTransitionPlayToFrame === "function") {
      postTransitionPlayToFrame(info.editId);
    }

  });

  appendStudioInspectorRow("", play);

}
