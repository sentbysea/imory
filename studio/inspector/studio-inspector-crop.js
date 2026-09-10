/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 이미지 자르기

   원본 파일은 그대로 두고 "스킨에 보이는 범위와 구도"만 바꾼다.
   업로드한 이미지도, 그 URL도, 이미지 슬롯 연결도, Settings 연결도
   건드리지 않는다 — 바뀌는 것은 CSS 규칙 두 개와 <span> 래퍼
   하나뿐이다.

     studioInspectorCropWrapperOf()      이 이미지에 이미 프레임이 있나
     studioInspectorCropDeclarationsFor() 바깥 상자 컨트롤이 읽을 선언
     studioInspectorCropAwareCss()       바깥 상자 컨트롤의 확정 대상 전환
     renderStudioInspectorCropBlock()    자르기 UI
     begin/update/commit/cancel/reset…   임시 편집 → 확정
     begin/move/end/cancelStudioInspectorCropDrag()  사진 끌어 옮기기

   ★ 임시와 확정을 자로 자른다 — 텍스트/크기와 같은 구조다.
     비율 버튼·확대 슬라이더·드래그는 전부
     sendStudioInspectorPreview()로 iframe의 live DOM만 바꾸고,
     "적용"을 눌렀을 때만 applyStudioInspectorPatch()를 한 번
     지난다(= Undo 한 번). 그래서 Save/Publish/Export에는 확정된
     결과만 들어간다.

   ★ 왜 <span> 래퍼인가 — 자세한 계산은
     studio-inspector-crop-model.js 머리말에 있다. 여기서는 그
     래퍼를 **중복으로 만들지 않는 것**과, 이미 스킨에 있던
     레이아웃/링크/식별자를 깨지 않는 것이 일이다:

       - <span>이다. <div>로 만들면 <p> 안의 이미지를 감쌀 때
         HTML 파서가 문단을 쪼개 버린다(DOMParser도 그렇다).
       - <a> 안의 이미지는 래퍼도 <a> **안쪽**에 들어간다 —
         링크 클릭 범위가 그대로다.
       - 이미지의 data-imory-edit-id는 그대로 둔다. 래퍼는 자기
         id를 새로 받는다(이미지 id에서 파생) — 그래서 자른 뒤에도
         같은 이미지를 다시 고를 수 있고, 선택 요소 AI 수정도
         계속 그 이미지를 가리킨다.
       - 다시 자르기를 열면 그 래퍼를 **찾아서 고쳐 쓴다**
         (studioInspectorCropWrapperOf). 새로 감싸지 않는다.

   ★ 크기 조절과 자르기가 서로 덮어쓰지 않는 이유
     자른 뒤에는 "바깥 상자"의 주인이 래퍼로 바뀐다. 너비·모양·
     정렬 세 컨트롤은 그때부터 래퍼의 규칙을 읽고 쓰고
     (studioInspectorCropDeclarationsFor / studioInspectorCropAwareCss),
     이미지 쪽 규칙에는 자르기 선언만 남는다. 한 속성을 두 규칙이
     동시에 갖는 상태가 아예 만들어지지 않는다.

   의존(이 파일보다 먼저 로드되어야 함):
   studio/inspector/studio-inspector-state.js,
   studio/inspector/studio-inspector-crop-model.js,
   studio/inspector/studio-inspector-overlay.js
   (studioInspectorMapRect / studioInspectorMapRectRaw).
   호출 시점 의존: studio-inspector-edit.js
   (applyStudioInspectorPatch / mergeStudioInspectorDeclarations),
   studio-inspector-controls.js(renderStudioInspectorPopover),
   studio/studio-preview.js(showStudioToast).
========================================================== */


/* 자른 뒤 **래퍼**가 주인이 되는 컨트롤들. 전부 "바깥 상자가
   어떻게 생겼나"에 대한 것이라 잘려 나가는 안쪽 이미지에 붙어
   있으면 화면에서 사라진다(모서리 둥글기는 특히 그렇다 —
   overflow:hidden이 걸린 쪽에 있어야 실제로 잘린 모서리가 된다). */
const STUDIO_INSPECTOR_CROP_FRAME_CONTROLS =
  new Set(["size", "shape", "imageAlign", "crop"]);

/* 그중 실제로 **쓰기**까지 프레임으로 가는 것들. "crop"은 읽기만
   여기 끼어 있다 — 자르기 자신은 commitStudioInspectorStyle()을
   지나지 않고 applyStudioInspectorCrop()으로 두 규칙을 한 번에
   쓰기 때문이다. */
const STUDIO_INSPECTOR_CROP_FRAME_STYLE_CONTROLS =
  new Set(["size", "shape", "imageAlign"]);

/* 자르기를 풀 때 프레임에서 이미지로 되돌려 주는 선언. `display`는
   빠져 있다 — 프레임에는 항상 display:block이 붙어 있지만 그건
   자르기가 만든 값이지 사용자가 정한 값이 아니다(정렬을 지정한
   경우에만 아래에서 margin과 함께 되살린다). */
const STUDIO_INSPECTOR_CROP_RESTORE_TO_IMAGE =
  ["border-radius", "border", "text-align", "margin-left", "margin-right"];


/* =========================================================
   이 이미지에 이미 프레임(래퍼)이 있는가

   판정 근거는 **래퍼 자신의 CSS 규칙에 표식이 있는가** 하나다.
   클래스 이름이나 새 data-* 속성을 만들지 않았다 — 새 속성은
   skin/skin-sanitize.js의 허용 목록을 넓혀야 하고, 클래스는
   스킨 작성자가 쓰는 이름과 부딪힐 수 있다. custom property는
   저장 CSS에 그대로 남고 skin-css-validate.js도 그대로 통과한다.

   자식이 하나뿐인지도 함께 본다 — 자르기 래퍼는 언제나 이미지
   하나만 감싸므로, 우연히 표식을 물려받은(custom property는
   상속된다) 다른 상자를 프레임으로 착각하지 않게 한다.
========================================================== */

function studioInspectorCropWrapperOf(element, css) {

  const parent =
    element && element.parentElement;

  if (!parent || parent.nodeType !== 1 || parent.children.length !== 1) {
    return null;
  }

  const wrapperId =
    parent.getAttribute("data-imory-edit-id");

  if (!wrapperId || !window.isValidInspectorEditId(wrapperId)) {
    return null;
  }

  const declarations =
    window.readInspectorEditDeclarations(css, wrapperId);

  if (!declarations[window.INSPECTOR_CROP_MARKER]) {
    return null;
  }

  return {
    id: wrapperId,
    element: parent,
    declarations
  };

}


function studioInspectorCropContext(resolved) {

  if (!resolved) {
    return null;
  }

  const wrapper =
    studioInspectorCropWrapperOf(resolved.element, resolved.source.css);

  if (!wrapper) {
    return null;
  }

  return {
    wrapperId: wrapper.id,
    frameDeclarations: wrapper.declarations,
    crop: window.readInspectorCrop(wrapper.declarations, resolved.declarations)
  };

}


/* 폼이 지금 값을 채울 때 읽어야 할 선언 — 바깥 상자 컨트롤은
   프레임 것을, 나머지는 이미지 것을 본다. */
function studioInspectorCropDeclarationsFor(control, resolved) {

  if (!resolved) {
    return {};
  }

  if (!STUDIO_INSPECTOR_CROP_FRAME_CONTROLS.has(control)) {
    return resolved.declarations;
  }

  const wrapper =
    studioInspectorCropWrapperOf(resolved.element, resolved.source.css);

  return wrapper ? wrapper.declarations : resolved.declarations;

}


/* =========================================================
   studioInspectorCropAwareCss(css, control, value, element)

   commitStudioInspectorStyle()이 부르는 유일한 지점이다. 자른
   이미지가 아니면 지금까지와 완전히 같은 한 줄이고, 자른
   이미지면 대상 규칙만 프레임으로 바꾼다.

   프레임의 **구조 선언은 항상 다시 못 박는다**. 이유는 "기본"
   버튼이다 — 너비 기본은 width/height/aspect-ratio/max-width를
   지우고, 정렬 해제는 display/margin을 지운다. 그 값들 중
   aspect-ratio와 display는 자르기 프레임이 살아 있기 위해
   필요한 것이라, 지워지면 프레임이 통째로 무너진다(inline
   <span>은 width도 aspect-ratio도 받지 않는다). 그래서 컨트롤이
   무엇을 지우든 자르기 자신의 선언은 되돌려 놓는다.
========================================================== */

function studioInspectorCropAwareCss(css, control, value, element) {

  const wrapper =
    STUDIO_INSPECTOR_CROP_FRAME_STYLE_CONTROLS.has(control)
      ? studioInspectorCropWrapperOf(element, css)
      : null;

  const targetId =
    wrapper ? wrapper.id : studioInspectorSelection.editId;

  const next =
    mergeStudioInspectorDeclarations(css, targetId, control, value);

  if (!wrapper) {
    return next;
  }

  const declarations =
    window.readInspectorEditDeclarations(next, targetId);

  declarations[window.INSPECTOR_CROP_MARKER] =
    wrapper.declarations[window.INSPECTOR_CROP_MARKER];

  declarations.display = "block";
  declarations.position = "relative";
  declarations.overflow = "hidden";
  declarations["max-width"] = "100%";

  declarations["aspect-ratio"] =
    wrapper.declarations["aspect-ratio"] || declarations["aspect-ratio"];

  /* 너비를 사용자가 직접 정한 순간부터는 자르기를 풀 때 그 너비를
     되돌려 준다("기본"으로 지웠으면 다시 측정값 취급). */
  if (control === "size") {

    declarations[window.INSPECTOR_CROP_MARKER] =
      declarations.width ? "fixed" : "1";

  }

  return window.writeInspectorEditDeclarations(next, targetId, declarations);

}



/* =========================================================
   지금 자르기 프레임의 실측값과 축별 이동 여유

   ★ 왜 draft.frameWidth를 그냥 쓰지 않는가
   프레임에는 max-width: 100%가 늘 함께 붙는다(모바일에서 넘치지
   않게). Mobile Preview나 좁은 부모에서는 실제 폭이 draft 값보다
   작으므로, 이동 한계를 draft 값으로 재면 손과 사진이 어긋난다.
   그래서 **지금 그려진 사각형**을 먼저 쓴다 — 자르기가 열려 있는
   동안 selection.rect는 임시 미리보기가 얹힌 프레임의 사각형이다
   (preview-bridge.js inspectorFrameElementOf).
========================================================== */

function studioInspectorCropFrameBox() {

  const draft =
    studioInspectorCropDraft;

  const rect =
    studioInspectorSelection ? studioInspectorSelection.rect : null;

  let width =
    rect && rect.width > 0 ? rect.width : 0;

  let height =
    rect && rect.height > 0 ? rect.height : 0;

  if (!width && draft && Number(draft.frameWidth) > 0) {

    width =
      Number(draft.frameWidth);

    const ratio =
      Number(draft.ratio);

    height =
      ratio > 0 ? width / ratio : width;

  }

  const metrics =
    studioInspectorMetrics;

  return {
    width,
    height,
    naturalWidth: metrics ? metrics.naturalWidth : 0,
    naturalHeight: metrics ? metrics.naturalHeight : 0
  };

}


/* 이보다 적게 움직일 수 있는 축은 "움직일 수 없다"로 본다. 원본
   비율과 프레임 비율이 소수점 아래에서만 다를 때 cover가 1px도 안
   되는 여유를 남기는데, 그걸 살려 두면 슬라이더는 끝에서 끝까지
   가는데 화면은 그대로인 상태가 된다 — 제일 헷갈리는 경우다. */
const STUDIO_INSPECTOR_CROP_TRAVEL_MIN = 2;


/* 축별로 "끝에서 끝까지" 몇 px 움직일 수 있는가. 0이면 그 축은
   지금 설정에서 아예 움직일 수 없다 — 이유를 안내한다. */
function studioInspectorCropTravel() {

  if (!studioInspectorCropDraft || typeof window.inspectorCropTravelPx !== "function") {
    return { x: 0, y: 0 };
  }

  return window.inspectorCropTravelPx(
    studioInspectorCropDraft,
    studioInspectorCropFrameBox()
  );

}


/* 안내 문구 — "왜 지금 이 방향으로는 안 움직이는가"까지 말한다.
   자르기에서 제일 자주 막히는 자리라 그렇다(가로형 사진을 가로형
   프레임에 넣으면 확대 전에는 위아래로 움직일 여유가 0이다). */
function studioInspectorCropMoveHint(travel) {

  const canX = travel.x >= STUDIO_INSPECTOR_CROP_TRAVEL_MIN;
  const canY = travel.y >= STUDIO_INSPECTOR_CROP_TRAVEL_MIN;

  if (canX && canY) {
    return "사진을 끌거나 아래 위치 조절로 상하좌우 구도를 맞춰 보세요.";
  }

  if (canX) {
    return "지금은 좌우로만 움직일 수 있어요 — 확대하면 위아래로도 이동할 수 있어요.";
  }

  if (canY) {
    return "지금은 위아래로만 움직일 수 있어요 — 확대하면 좌우로도 이동할 수 있어요.";
  }

  return "사진이 프레임에 꼭 맞아 움직일 여유가 없어요 — 확대하거나 프레임 비율을 바꾸면 구도를 조절할 수 있어요.";

}


/* 방향 버튼 한 번에 움직일 거리(px). 화면에서 눈에 보이는 만큼만
   움직이게 고정 px로 정하고, 그 축의 여유로 나눠 -1~+1 단위로
   바꾼다 — 여유가 작은 축에서 한 번에 끝까지 튀지 않는다. */
const STUDIO_INSPECTOR_CROP_NUDGE_PX = 16;

function studioInspectorCropNudge(axis, direction) {

  const travel =
    studioInspectorCropTravel();

  const span =
    axis === "x" ? travel.x : travel.y;

  if (!(span >= STUDIO_INSPECTOR_CROP_TRAVEL_MIN)) {
    return;
  }

  const step =
    (2 * STUDIO_INSPECTOR_CROP_NUDGE_PX) / span;

  const current =
    axis === "x" ? studioInspectorCropDraft.x : studioInspectorCropDraft.y;

  updateStudioInspectorCropDraft(
    axis === "x"
      ? { x: current + step * direction }
      : { y: current + step * direction }
  );

}


/* =========================================================
   자르기를 시작할 수 있는가

   "이미지가 없거나 로드에 실패하면 이유를 안내하고 비활성화"는
   여기 한 곳에서만 정한다. 로드 실패 판정은 iframe이 재서 올려
   보낸 값이다(preview-bridge.js inspectorMetricsOf) — 실패한
   <img>는 브라우저가 alt 텍스트를 담은 인라인 요소로 취급해서
   프레임을 씌워도 아무 것도 보이지 않는다.
========================================================== */

function studioInspectorCropAvailability(info) {

  if (!info || !info.capabilities || !info.capabilities.crop) {
    return { ok: false, reason: "" };
  }

  const metrics =
    studioInspectorMetrics;

  if (!metrics) {
    return { ok: false, reason: "이미지 크기를 아직 재지 못했어요. 잠시 뒤에 다시 눌러 주세요." };
  }

  if (metrics.loaded === false) {
    return { ok: false, reason: "이미지를 불러오지 못해 자르기를 할 수 없어요. 이미지 주소를 먼저 확인해 주세요." };
  }

  if (!(metrics.width > 0) || !(metrics.height > 0)) {
    return { ok: false, reason: "이미지가 화면에 표시되지 않아 자르기를 할 수 없어요." };
  }

  return { ok: true, reason: "" };

}


/* =========================================================
   자르기 UI

   접혀 있을 때는 버튼 한두 개만 보이고, "자르기"를 누르면 그
   자리에서 비율·확대·안내가 펼쳐진다. 팝오버가 처음부터 커다랗게
   열려 Preview를 가리지 않게 하기 위해서다.
========================================================== */

function renderStudioInspectorCropBlock(spec, info, declarations) {

  const availability =
    studioInspectorCropAvailability(info);

  const cropped =
    !!declarations[window.INSPECTOR_CROP_MARKER];

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block";

  const head =
    document.createElement("div");

  head.className =
    "studio-inspector-block-head";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    spec.label;

  head.appendChild(caption);

  if (cropped) {

    const reset =
      document.createElement("button");

    reset.type = "button";
    reset.className = "studio-inspector-clear";
    reset.id = "studioInspectorCropReset";
    reset.textContent = "자르기 초기화";

    reset.addEventListener("click", resetStudioInspectorCrop);

    head.appendChild(reset);

  }

  block.appendChild(head);

  if (!availability.ok) {

    const note =
      document.createElement("p");

    note.className = "studio-inspector-block-note";
    note.id = "studioInspectorCropNote";
    note.textContent = availability.reason || "이 이미지는 자를 수 없어요.";

    block.appendChild(note);

    studioInspectorFields.appendChild(block);

    return;

  }

  if (!studioInspectorCropDraft) {

    const open =
      document.createElement("button");

    open.type = "button";
    open.className = "studio-inspector-block-button";
    open.id = "studioInspectorCropOpen";
    open.textContent = cropped ? "자르기 다시 하기" : "자르기";

    open.addEventListener("click", beginStudioInspectorCropEdit);

    const actions =
      document.createElement("div");

    actions.className = "studio-inspector-block-actions";

    actions.appendChild(open);

    block.appendChild(actions);

    studioInspectorFields.appendChild(block);

    return;

  }

  renderStudioInspectorCropEditor(block);

  studioInspectorFields.appendChild(block);

}


function renderStudioInspectorCropEditor(block) {

  const draft =
    studioInspectorCropDraft;

  /* 비율 — 프레임 **너비는 그대로 두고 높이만** 바뀐다
     (aspect-ratio + 고정 width의 자연스러운 결과다). */
  const ratioRow =
    document.createElement("div");

  ratioRow.className =
    "studio-inspector-choice";

  window.INSPECTOR_CROP_RATIO_PRESETS.forEach(([name, label, ratio]) => {

    const option =
      document.createElement("button");

    option.type = "button";
    option.className = "studio-inspector-choice-option";
    option.dataset.inspectorControl = "cropRatio";
    option.dataset.inspectorValue = name;
    option.textContent = label;

    const resolvedRatio =
      ratio === null
        ? studioInspectorCropMeasuredRatio()
        : window.inspectorAspectRatio(ratio);

    if (resolvedRatio && draft.ratio === resolvedRatio) {
      option.classList.add("is-active");
    }

    option.addEventListener("click", () => {

      updateStudioInspectorCropDraft({
        ratio: resolvedRatio || draft.ratio
      });

    });

    ratioRow.appendChild(option);

  });

  const ratioLabel =
    document.createElement("p");

  ratioLabel.className = "studio-inspector-block-label";
  ratioLabel.textContent = "프레임 비율";

  block.appendChild(ratioLabel);
  block.appendChild(ratioRow);

  /* 확대 — 100%가 "프레임을 딱 채우는 크기"다. 그보다 작게는
     내려가지 않는다(내려가면 프레임 안에 빈틈이 생긴다). */
  const zoomLabel =
    document.createElement("p");

  zoomLabel.className = "studio-inspector-block-label";
  zoomLabel.id = "studioInspectorCropZoomLabel";
  zoomLabel.textContent = `확대 (${Math.round(draft.zoom * 100)}%)`;

  const zoom =
    document.createElement("input");

  zoom.type = "range";
  zoom.className = "studio-inspector-range";
  zoom.id = "studioInspectorCropZoom";
  zoom.dataset.inspectorControl = "cropZoom";
  zoom.min = String(Math.round(window.INSPECTOR_CROP_ZOOM_MIN * 100));
  zoom.max = String(Math.round(window.INSPECTOR_CROP_ZOOM_MAX * 100));
  zoom.step = "1";
  zoom.value = String(Math.round(draft.zoom * 100));

  /* 끄는 동안에는 미리보기만, 손을 뗐을 때 폼을 다시 그린다 —
     입력 중에 폼을 다시 그리면 지금 잡고 있는 슬라이더가 통째로
     교체된다(크기 슬라이더와 같은 이유). */
  zoom.addEventListener("input", () => {

    zoomLabel.textContent =
      `확대 (${Math.round(Number(zoom.value))}%)`;

    updateStudioInspectorCropDraft(
      { zoom: Number(zoom.value) / 100 },
      { silent: true }
    );

  });

  zoom.addEventListener("change", () => {
    updateStudioInspectorCropDraft({ zoom: Number(zoom.value) / 100 });
  });

  block.appendChild(zoomLabel);
  block.appendChild(zoom);

  const travel =
    studioInspectorCropTravel();

  const hint =
    document.createElement("p");

  hint.className = "studio-inspector-block-note";
  hint.id = "studioInspectorCropHint";
  hint.textContent = studioInspectorCropMoveHint(travel);

  block.appendChild(hint);

  /* 바깥 상자가 프레임을 잘라내고 있으면 먼저 말해 준다 — 그때는
     프레임을 키워도 아랫부분이 화면에 나타나지 않는다(스킨 쪽
     레이아웃 문제라 여기서 고칠 수 없다). */
  if (studioInspectorClipped) {

    const clipped =
      document.createElement("p");

    clipped.className = "studio-inspector-block-note";
    clipped.id = "studioInspectorCropClipped";
    clipped.textContent =
      "바깥 상자가 이 이미지를 잘라내고 있어요 — 프레임을 키워도 잘린 쪽은 화면에 보이지 않습니다.";

    block.appendChild(clipped);

  }

  renderStudioInspectorCropPositionBlock(block, travel);

  const actions =
    document.createElement("div");

  actions.className = "studio-inspector-block-actions";

  const apply =
    document.createElement("button");

  apply.type = "button";
  apply.className = "studio-inspector-block-button studio-inspector-block-button--primary";
  apply.id = "studioInspectorCropApply";
  apply.textContent = "적용";

  apply.addEventListener("click", commitStudioInspectorCropDraft);

  const cancel =
    document.createElement("button");

  cancel.type = "button";
  cancel.className = "studio-inspector-block-button";
  cancel.id = "studioInspectorCropCancel";
  cancel.textContent = "취소";

  cancel.addEventListener("click", cancelStudioInspectorCropDraft);

  actions.appendChild(apply);
  actions.appendChild(cancel);

  block.appendChild(actions);

  studioInspectorCropZoomRange = zoom;

  /* 폼이 다시 그려졌다면(다른 컨트롤을 만졌다든가) 임시 반영이
     사라졌을 수 있다 — 화면과 입력값이 어긋나지 않게 다시 보낸다. */
  sendStudioInspectorCropPreview();

}




/* =========================================================
   위치 조절 — 슬라이더 두 개 + 방향 버튼 네 개

   ★ 왜 드래그만으로는 부족한가
   팝오버는 자르는 동안 프레임 옆으로 비켜 앉지만(overlay), 좁은
   화면에서는 프레임 위로 겹칠 수 있고 프레임이 작으면 끌 자리
   자체가 몇 십 px밖에 안 된다. 그래서 "사진을 잡지 않고도 구도를
   옮길 수 있는 길"을 함께 둔다(요구사항 D).

   ★ 값은 드래그와 **같은 상태 하나**(draft.x / draft.y)를 바꾼다 —
   슬라이더로 옮기고 이어서 끌어도 그 자리에서 이어진다.

   ★ 여유가 없는 축은 비활성으로 둔다. 움직이는 것처럼 보이는데
   화면이 그대로면 그게 제일 헷갈린다 — 대신 위 안내 문구가 이유를
   말한다(studioInspectorCropMoveHint).
========================================================== */

function renderStudioInspectorCropAxis(row, axis, travel, labels) {

  const span =
    axis === "x" ? travel.x : travel.y;

  const enabled =
    span >= STUDIO_INSPECTOR_CROP_TRAVEL_MIN;

  const line =
    document.createElement("div");

  line.className = "studio-inspector-crop-axis";

  const back =
    document.createElement("button");

  back.type = "button";
  back.className = "studio-inspector-crop-step";
  back.id = `studioInspectorCropStep-${axis}-back`;
  back.textContent = labels[0];
  back.title = labels[2];
  back.setAttribute("aria-label", labels[2]);
  back.disabled = !enabled;

  back.addEventListener("click", () => studioInspectorCropNudge(axis, -1));

  const range =
    document.createElement("input");

  range.type = "range";
  range.className = "studio-inspector-range studio-inspector-crop-position";
  range.id = `studioInspectorCropPosition-${axis}`;
  range.dataset.inspectorControl = `cropPosition${axis.toUpperCase()}`;
  range.min = "-100";
  range.max = "100";
  range.step = "1";
  range.disabled = !enabled;
  range.setAttribute("aria-label", axis === "x" ? "가로 위치" : "세로 위치");

  range.value =
    String(Math.round((axis === "x" ? studioInspectorCropDraft.x : studioInspectorCropDraft.y) * 100));

  /* 확대 슬라이더와 같은 규칙 — 끄는 동안에는 미리보기만, 손을
     뗐을 때 한 번 폼을 다시 그린다(그리는 순간 지금 잡고 있는
     슬라이더 요소가 통째로 교체되기 때문). */
  range.addEventListener("input", () => {

    updateStudioInspectorCropDraft(
      axis === "x"
        ? { x: Number(range.value) / 100 }
        : { y: Number(range.value) / 100 },
      { silent: true }
    );

  });

  range.addEventListener("change", () => {

    updateStudioInspectorCropDraft(
      axis === "x"
        ? { x: Number(range.value) / 100 }
        : { y: Number(range.value) / 100 }
    );

  });

  const forward =
    document.createElement("button");

  forward.type = "button";
  forward.className = "studio-inspector-crop-step";
  forward.id = `studioInspectorCropStep-${axis}-forward`;
  forward.textContent = labels[1];
  forward.title = labels[3];
  forward.setAttribute("aria-label", labels[3]);
  forward.disabled = !enabled;

  forward.addEventListener("click", () => studioInspectorCropNudge(axis, 1));

  line.appendChild(back);
  line.appendChild(range);
  line.appendChild(forward);

  row.appendChild(line);

}


function renderStudioInspectorCropPositionBlock(block, travel) {

  const label =
    document.createElement("p");

  label.className = "studio-inspector-block-label";
  label.id = "studioInspectorCropPositionLabel";
  label.textContent = "위치";

  const row =
    document.createElement("div");

  row.className = "studio-inspector-crop-position-row";
  row.id = "studioInspectorCropPositionRow";

  renderStudioInspectorCropAxis(row, "x", travel, ["←", "→", "왼쪽으로", "오른쪽으로"]);
  renderStudioInspectorCropAxis(row, "y", travel, ["↑", "↓", "위로", "아래로"]);

  block.appendChild(label);
  block.appendChild(row);

}

/* 지금 화면에 보이는 프레임 비율. "현재 비율" 버튼과, 처음
   자르기를 열 때의 기본값이 이 값을 쓴다. */
function studioInspectorCropMeasuredRatio() {

  const metrics =
    studioInspectorMetrics;

  if (!metrics || !(metrics.width > 0) || !(metrics.height > 0)) {
    return null;
  }

  return window.inspectorAspectRatio(metrics.width / metrics.height);

}


/* =========================================================
   임시 편집 — 시작 / 갱신 / 미리보기
========================================================== */

function beginStudioInspectorCropEdit() {

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return;
  }

  const availability =
    studioInspectorCropAvailability(resolved.info);

  if (!availability.ok) {

    showStudioToast(
      availability.reason || "이 이미지는 자를 수 없어요.",
      { isError: true }
    );

    return;

  }

  const context =
    studioInspectorCropContext(resolved);

  const measuredWidth =
    Math.round(studioInspectorMetrics.width);

  if (context && context.crop) {

    studioInspectorCropDraft = {
      ratio: context.crop.ratio || studioInspectorCropMeasuredRatio(),
      zoom: context.crop.zoom,
      x: context.crop.x,
      y: context.crop.y,
      frameWidth: context.crop.frameWidth || measuredWidth,
      fixedWidth: context.crop.fixedWidth
    };

  } else {

    /* 아직 자르지 않은 이미지 — 지금 보이는 크기와 비율이 곧
       시작 프레임이다. 그래서 "자르기"를 누른 직후에는 화면이
       전혀 바뀌지 않는다(사용자가 무언가 잃었다고 느끼지 않게). */
    const declaredWidth =
      Number(window.readInspectorControlValue("size", resolved.declarations));

    studioInspectorCropDraft = {
      ratio: studioInspectorCropMeasuredRatio(),
      zoom: 1,
      x: 0,
      y: 0,
      frameWidth: measuredWidth,
      fixedWidth: Number.isFinite(declaredWidth) && declaredWidth > 0
    };

  }

  renderStudioInspectorPopover();

  sendStudioInspectorCropPreview();

}


function updateStudioInspectorCropDraft(patch, options) {

  if (!studioInspectorCropDraft) {
    return;
  }

  const next = {
    ...studioInspectorCropDraft,
    ...(patch || {})
  };

  next.zoom = window.inspectorCropClampZoom(next.zoom);
  next.x = window.inspectorCropClampOffset(next.x);
  next.y = window.inspectorCropClampOffset(next.y);

  studioInspectorCropDraft =
    next;

  sendStudioInspectorCropPreview();

  if (!options || !options.silent) {
    renderStudioInspectorPopover();
  }

}


function sendStudioInspectorCropPreview() {

  if (!studioInspectorSelection || !studioInspectorCropDraft) {
    return;
  }

  sendStudioInspectorPreview({
    editId: studioInspectorSelection.editId,
    crop: { ...studioInspectorCropDraft }
  });

}


/* =========================================================
   확정 — 적용 한 번 = Undo 한 번

   래퍼를 만들든(처음) 있는 것을 고쳐 쓰든(다시 자르기)
   applyStudioInspectorPatch()를 **한 번만** 지난다. 그래서
   되돌리기 한 번이면 자르기 전 상태로 통째로 돌아간다.
========================================================== */

function applyStudioInspectorCrop(draft) {

  return applyStudioInspectorPatch((element, css) => {

    const doc =
      element.ownerDocument;

    const existing =
      studioInspectorCropWrapperOf(element, css);

    let wrapperId;

    let frameDeclarations;

    if (existing) {

      wrapperId =
        existing.id;

      frameDeclarations =
        existing.declarations;

    } else {

      const used =
        new Set(
          Array.from(doc.body.querySelectorAll("[data-imory-edit-id]"))
            .map((el) => el.getAttribute("data-imory-edit-id"))
        );

      wrapperId =
        window.buildInspectorCropWrapperId(
          studioInspectorSelection.editId,
          (candidate) => used.has(candidate)
        );

      const wrapper =
        doc.createElement("span");

      wrapper.setAttribute("data-imory-edit-id", wrapperId);

      element.parentNode.insertBefore(wrapper, element);

      wrapper.appendChild(element);

      frameDeclarations =
        {};

    }

    const imageDeclarations =
      window.readInspectorEditDeclarations(css, studioInspectorSelection.editId);

    /* 처음 자를 때만 — 바깥 상자 성격의 선언을 프레임으로 옮긴다.
       모서리 둥글기가 대표적이다: 잘려 나가는 안쪽 이미지에
       남아 있으면 화면에서 사라진다. */
    if (!existing) {

      window.INSPECTOR_CROP_FRAME_MOVE.forEach((property) => {

        if (imageDeclarations[property]) {
          frameDeclarations[property] = imageDeclarations[property];
          delete imageDeclarations[property];
        }

      });

    }

    window.INSPECTOR_CROP_IMAGE_DROP.forEach((property) => {
      delete imageDeclarations[property];
    });

    const built =
      window.buildInspectorCropDeclarations(draft, {
        frameWidth: draft.frameWidth,
        fixedWidth: !!draft.fixedWidth
      });

    Object.assign(frameDeclarations, built.frame);
    Object.assign(imageDeclarations, built.image);

    let next =
      window.writeInspectorEditDeclarations(css, wrapperId, frameDeclarations);

    next =
      window.writeInspectorEditDeclarations(
        next,
        studioInspectorSelection.editId,
        imageDeclarations
      );

    return { css: next };

  });

}


function commitStudioInspectorCropDraft() {

  const draft =
    studioInspectorCropDraft;

  if (!draft || !studioInspectorSelection) {
    return;
  }

  if (!describeStudioInspectorSelection()) {
    return;
  }

  studioInspectorCropDraft =
    null;

  if (studioInspectorCropDrag) {
    finishStudioInspectorCropDrag(studioInspectorCropDrag);
  }

  clearStudioInspectorPreview();

  if (applyStudioInspectorCrop(draft)) {
    showStudioToast("이미지 자르기를 적용했어요.");
  }

}


function cancelStudioInspectorCropDraft() {

  if (studioInspectorCropDrag) {
    finishStudioInspectorCropDrag(studioInspectorCropDrag);
  }

  studioInspectorCropDraft =
    null;

  clearStudioInspectorPreview();

  renderStudioInspectorPopover();

}


/* =========================================================
   자르기 초기화 — 자르기 설정만 해제한다

   래퍼를 걷어내고 두 규칙에서 자르기 선언만 지운다. 프레임이
   들고 있던 "사용자가 정한 것"(모서리 둥글기·테두리·정렬,
   그리고 사용자가 직접 정한 너비)은 이미지로 돌려준다 — 자르기만
   푼 것이지 그 설정까지 없앤 것은 아니기 때문이다.

   반대로 프레임 폭이 그냥 "그때 보이던 크기"였다면 아무 것도
   돌려주지 않는다(표식이 "1"). 그래야 스킨 CSS가 정하던 원래
   표시 방식으로 정확히 돌아간다.
========================================================== */

function resetStudioInspectorCrop() {

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved || !studioInspectorCropContext(resolved)) {
    return;
  }

  if (studioInspectorCropDrag) {
    finishStudioInspectorCropDrag(studioInspectorCropDrag);
  }

  studioInspectorCropDraft =
    null;

  clearStudioInspectorPreview();

  const applied =
    applyStudioInspectorPatch((element, css) => {

      const wrapper =
        studioInspectorCropWrapperOf(element, css);

      if (!wrapper) {
        return {};
      }

      const imageDeclarations =
        window.readInspectorEditDeclarations(css, studioInspectorSelection.editId);

      window.INSPECTOR_CROP_IMAGE_CLEAR.forEach((property) => {
        delete imageDeclarations[property];
      });

      STUDIO_INSPECTOR_CROP_RESTORE_TO_IMAGE.forEach((property) => {

        if (wrapper.declarations[property]) {
          imageDeclarations[property] = wrapper.declarations[property];
        }

      });

      /* 정렬은 display:block과 짝이라 둘을 함께 되살린다. */
      if (imageDeclarations["margin-left"] || imageDeclarations["margin-right"]) {
        imageDeclarations.display = "block";
      }

      if (
        String(wrapper.declarations[window.INSPECTOR_CROP_MARKER]).trim() === "fixed" &&
        wrapper.declarations.width
      ) {

        imageDeclarations.width = wrapper.declarations.width;
        imageDeclarations.height = "auto";
        imageDeclarations["max-width"] = "100%";

      }

      wrapper.element.parentNode.insertBefore(element, wrapper.element);

      wrapper.element.remove();

      let next =
        window.writeInspectorEditDeclarations(css, wrapper.id, {});

      next =
        window.writeInspectorEditDeclarations(
          next,
          studioInspectorSelection.editId,
          imageDeclarations
        );

      return { css: next };

    });

  if (applied) {
    showStudioToast("자르기를 해제했어요.");
  }

}


/* =========================================================
   사진 끌어 옮기기

   드래그를 받는 것은 Preview iframe이 아니라 Studio overlay 위의
   투명한 판이다(studioInspectorCropSurface). 그래서 좌표 계산이
   모서리 핸들과 **같은 함수**를 쓴다 — Mobile Preview의 축소
   배율도, AI 패널을 여닫아 생기는 이동도, 창 크기 변경도
   studioInspectorMapRectRaw()가 이미 반영한 뒤의 값이다.

   이동량은 프레임 크기로 나눠 정규화한다: 프레임 폭만큼 끌면
   구도가 한쪽 끝에서 반대쪽 끝까지 간다. 포인터를 오른쪽으로
   끌면 사진도 오른쪽으로 따라온다(= 왼쪽 부분이 보인다) —
   그래서 부호가 빼기다.
========================================================== */

function beginStudioInspectorCropDrag(event) {

  if (
    !studioInspectorEnabled ||
    !studioInspectorCropDraft ||
    !studioInspectorSelection ||
    studioInspectorCropDrag
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

  /* 확대·비율은 드래그 중에 바뀌지 않으므로 이동 여유는 시작할 때
     한 번만 잰다. **프레임 크기가 아니라 이 값으로 나눈다** —
     그래야 포인터를 움직인 만큼 사진이 따라온다(요구사항 D). */
  const travel =
    studioInspectorCropTravel();

  studioInspectorCropDrag = {
    pointerId: event.pointerId,
    scale: mapped.scale,
    travelX: travel.x,
    travelY: travel.y,
    startClientX: event.clientX,
    startClientY: event.clientY,
    baseX: studioInspectorCropDraft.x,
    baseY: studioInspectorCropDraft.y,
    frame: 0
  };

  try {
    studioInspectorCropSurface.setPointerCapture(event.pointerId);
  } catch (err) {
    /* 캡처가 안 되는 환경에서도 아래 document 리스너가 move/up을
       받아 준다 — 모서리 핸들과 같은 구조다. */
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.add("is-cropping");
  }

}


function moveStudioInspectorCropDrag(event) {

  const drag =
    studioInspectorCropDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  const dx =
    (event.clientX - drag.startClientX) / drag.scale;

  const dy =
    (event.clientY - drag.startClientY) / drag.scale;

  /* 여유가 0인 축은 아예 움직이지 않는다 — 나눗셈으로 끝까지
     clamp되어 "움직인 것처럼 보이는 값"이 남지 않게 한다. */
  const nextX =
    drag.travelX >= STUDIO_INSPECTOR_CROP_TRAVEL_MIN
      ? window.inspectorCropClampOffset(drag.baseX - (2 * dx) / drag.travelX)
      : drag.baseX;

  const nextY =
    drag.travelY >= STUDIO_INSPECTOR_CROP_TRAVEL_MIN
      ? window.inspectorCropClampOffset(drag.baseY - (2 * dy) / drag.travelY)
      : drag.baseY;

  if (
    studioInspectorCropDraft &&
    nextX === studioInspectorCropDraft.x &&
    nextY === studioInspectorCropDraft.y
  ) {
    return;
  }

  /* pointermove마다 postMessage를 쏘지 않는다 — 한 프레임에 한 번.
     (모서리 드래그와 같은 규칙) */
  if (!drag.frame) {

    drag.frame =
      window.requestAnimationFrame(() => {

        drag.frame = 0;

        if (studioInspectorCropDrag === drag) {
          updateStudioInspectorCropDraft({ x: nextX, y: nextY }, { silent: true });
        }

      });

  }

}


function finishStudioInspectorCropDrag(drag) {

  if (drag.frame) {
    window.cancelAnimationFrame(drag.frame);
  }

  try {

    if (
      studioInspectorCropSurface &&
      studioInspectorCropSurface.hasPointerCapture &&
      studioInspectorCropSurface.hasPointerCapture(drag.pointerId)
    ) {
      studioInspectorCropSurface.releasePointerCapture(drag.pointerId);
    }

  } catch (err) {
    /* 이미 풀렸으면 그만이다 */
  }

  studioInspectorCropDrag =
    null;

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.remove("is-cropping");
  }

}


function endStudioInspectorCropDrag(event) {

  const drag =
    studioInspectorCropDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  finishStudioInspectorCropDrag(drag);

  /* 드래그는 확정이 아니다 — 임시 반영만 남기고 "적용"을 기다린다.
     폼은 다시 그려 확대/비율 표시를 지금 값에 맞춘다. */
  renderStudioInspectorPopover();

}


function cancelStudioInspectorCropDrag(event) {

  const drag =
    studioInspectorCropDrag;

  if (!drag || (event && event.pointerId !== drag.pointerId)) {
    return;
  }

  finishStudioInspectorCropDrag(drag);

  updateStudioInspectorCropDraft({ x: drag.baseX, y: drag.baseY });

}


/* =========================================================
   드래그 판 위치 — 프레임(= 지금 선택 테두리)과 정확히 같은 자리

   잘라낸 부분까지 덮으면 Preview 밖으로 삐져나가므로, 테두리와
   똑같이 Preview 영역과의 교집합만 쓴다(studioInspectorMapRect).
========================================================== */

function paintStudioInspectorCropSurface(rect) {

  if (!studioInspectorCropSurface) {
    return;
  }

  const mapped =
    studioInspectorCropDraft ? studioInspectorMapRect(rect) : null;

  if (!mapped) {
    studioInspectorCropSurface.hidden = true;
    return;
  }

  studioInspectorCropSurface.style.left = `${mapped.left}px`;
  studioInspectorCropSurface.style.top = `${mapped.top}px`;
  studioInspectorCropSurface.style.width = `${mapped.width}px`;
  studioInspectorCropSurface.style.height = `${mapped.height}px`;

  studioInspectorCropSurface.hidden = false;

}


/*
  move/up은 판이 아니라 document에서 받는다 — 포인터가 판 밖으로,
  iframe 위로, 창 밖으로 나가도 계속 도착한다(모서리 드래그와
  같은 이유, studio-inspector-image-size.js 아래쪽 주석 참고).
*/
document.addEventListener("pointermove", moveStudioInspectorCropDrag);

document.addEventListener("pointerup", endStudioInspectorCropDrag);

document.addEventListener("pointercancel", cancelStudioInspectorCropDrag);
