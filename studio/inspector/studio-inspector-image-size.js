/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 이미지 크기

   슬라이더 · px 입력칸 · 모서리 드래그 셋이 **같은 함수 두 개**를
   쓴다(previewStudioInspectorSize / commitStudioInspectorSize).
   그래서 "숫자와 슬라이더와 드래그 결과가 서로 다르다"가 구조적으로
   생기지 않는다.

     studioInspectorSizeRatio/Baseline/Max()  지금 값과 한계 계산
     renderStudioInspectorSizeBlock()         너비 블록 UI
     previewStudioInspectorSize()             임시 반영(저장 안 됨)
     commitStudioInspectorSize()              확정(= Undo 한 번)
     begin/move/end/cancelStudioInspectorHandleDrag()  모서리 드래그

   ★ 드래그의 기준점은 **반대쪽 모서리**이고 포인터는 핸들이
     캡처한다 — 이유는 아래 모서리 드래그 절 머리말.

   ★ 핸들 DOM 자체는 여기서 만들지 않는다(overlay가 만들고 칠한다).
     여기는 그 핸들에서 시작된 드래그가 무슨 값을 만드는가만 본다.

   ★ 파일 나누기 (Inspector 파일 분리 라운드)
     Element Inspector는 한 파일(studio-inspector.js)에 다 있었다.
     동작은 그대로 두고 책임만 나눴다 — 전부 classic script이고,
     top-level let은 여러 script가 공유하는 **하나의** 전역 lexical
     환경에 들어가므로(studio-preview.js의 currentWorkingSkin을
     이 파일들이 그대로 읽는 것과 같은 방식) window에 상태를 따로
     노출하지 않는다.

       studio-inspector-state.js       공유 상태 · 선택 해석 · 임시 채널
       studio-inspector-overlay.js     overlay DOM · 좌표 변환 · 테두리/핸들/팝오버 위치
       studio-inspector-edit.js        확정 경로(patch/스타일/링크/Undo)
       studio-inspector-text.js        텍스트 임시 편집 · 적용 · 취소
       studio-inspector-image-size.js  이미지 너비 컨트롤 · 모서리 드래그
       studio-inspector-controls.js    직접 수정 폼 UI · 팝오버 그리기
       studio-inspector.js             진입 · lifecycle · 선택 상태 전이 · 전역 창구

     로드 순서는 위 순서 그대로다(studio/index.html ·
     studio/studio-lifecycle-scenario.html). state가 맨 앞인 이유는
     const/let이 TDZ를 갖기 때문이다 — 뒤 파일들이 **로드 시점에**
     그 값을 읽는다(overlay의 ResizeObserver, 이 파일의 토글 버튼
     리스너). 함수 선언은 전역 객체 속성이라 호출 시점에만 있으면
     되므로 순서에 걸리지 않는다.

   의존(이 파일보다 먼저 로드되어야 함):
   studio/inspector/studio-inspector-state.js,
   studio/inspector/studio-inspector-overlay.js
   (studioInspectorMapRectRaw), studio/inspector/studio-inspector-edit.js
   (commitStudioInspectorStyle).
========================================================== */


/* =========================================================
   이미지 너비 블록 — 슬라이더 + px 입력 + 기본으로 되돌리기

   초기값은 "지금 화면에 실제로 보이는 폭"이다(iframe이 잰 metrics).
   이미 이 요소에 크기 규칙을 써 둔 적이 있으면 그 값이 곧 보이는
   폭이므로 둘은 자연히 같다.

   상한은 부모 안쪽 폭이 **아니다**. 확정 규칙에 max-width:100%가 늘
   함께 들어가므로(studio-inspector-model.js size) 부모보다 큰 값도
   가로 넘침을 만들지 않고 "자리에 꽉 참"이 될 뿐이다. 부모 폭으로
   상한을 눌렀더니, 실제 사이트보다 좁은 Preview에서 꽉 찬 너비를
   아예 고를 수 없었다 — 그래서 지금은 부모 폭의 몇 배까지 열어 두고
   (STUDIO_INSPECTOR_SIZE_HEADROOM), 그 부모 폭은 "여기가 꽉 참"이라는
   안내로만 쓴다(studioInspectorSizeFullWidth).
========================================================== */

/* =========================================================
   너비의 주인은 셋 중 하나다 (EDITORIAL-CUSTOMIZATION-1)

     사진 자신    보통의 이미지
     자르기 프레임 자른 사진 — "너비"는 잘라 보여 주는 창의 너비다
     바깥 상자    스킨이 `width: 74%` 같은 식으로 자리를 정해 두고
                  사진은 그 안을 가득 채우는 경우
                  (studio/preview/preview-bridge.js inspectorSizeOwnerOf)

   셋째가 이 라운드에서 생겼다. 그 전에는 사진에 `width: 320px` 을
   써도 화면이 꿈쩍하지 않았다 — 같이 들어가는 `max-width: 100%` 가
   바깥 상자의 폭에 붙들리기 때문이다. 그래서 그 경우에는 컨트롤
   이름이 "size" 가 아니라 "frameSize" 가 되고, 규칙은 바깥 상자가
   받는다. 사진을 **더 키워 보는 일**(확대·구도)은 자르기가 맡는다 —
   두 일이 이름도 대상도 겹치지 않는다.
========================================================== */

/* 스킨이 폭을 정해 둔 바깥 상자가 있는가 — 있으면 그 실측값 */
function studioInspectorSizeOwner() {

  const owner =
    studioInspectorMetrics && studioInspectorMetrics.sizeOwner;

  return (
    owner &&
    typeof owner.editId === "string" &&
    window.isValidInspectorEditId(owner.editId)
  )
    ? owner
    : null;

}


function studioInspectorSizeOwnerEditId() {

  const owner =
    studioInspectorSizeOwner();

  return owner ? owner.editId : null;

}


/* 이번 선택에서 너비를 쓰는 컨트롤의 이름 */
function studioInspectorSizeControl() {

  return studioInspectorSizeOwner() ? "frameSize" : "size";

}


/* 크기 컨트롤이 읽고 써야 할 선언. 자른 이미지에서는 이미지가
   아니라 **프레임(래퍼)**의 규칙이고, 스킨이 자리를 정해 둔
   사진에서는 **바깥 상자**의 규칙이다. */
function studioInspectorSizeDeclarations(resolved) {

  const owner =
    studioInspectorSizeOwner();

  if (owner && resolved) {

    return window.readInspectorEditDeclarations(
      resolved.source.css,
      owner.editId
    );

  }

  return studioInspectorCropDeclarationsFor("size", resolved);

}


/* 지금 선택이 잘려 있는가 — 임시 미리보기를 이미지가 아니라
   프레임에 적용해야 하는지를 이 값으로 가른다(실측은 iframe이
   한다, preview-bridge.js inspectorMetricsOf). */
function studioInspectorSizeTargetsFrame() {

  return !!(studioInspectorMetrics && studioInspectorMetrics.cropped);

}


function studioInspectorSizeRatio(declarations) {

  /* 바깥 상자를 끌 때의 비율은 그 상자가 지금 화면에서 가진
     비율이다 — 사진의 비율이 아니다(상자 안에 캡션이 함께 있을 수
     있다). 확정 규칙에는 비율이 들어가지 않는다(buildInspectorStylePatch
     "frameSize") — 모서리 드래그의 손맛에만 쓴다. */
  const owner =
    studioInspectorSizeOwner();

  if (owner) {
    return (owner.width > 0 && owner.height > 0) ? owner.width / owner.height : null;
  }

  const declared =
    Number(window.readInspectorControlValue("sizeRatio", declarations));

  if (Number.isFinite(declared) && declared > 0) {
    return declared;
  }

  const metrics =
    studioInspectorMetrics;

  if (metrics && metrics.width > 0 && metrics.height > 0) {
    return metrics.width / metrics.height;
  }

  if (metrics && metrics.naturalWidth > 0 && metrics.naturalHeight > 0) {
    return metrics.naturalWidth / metrics.naturalHeight;
  }

  return null;

}


function studioInspectorSizeBaseline(declarations) {

  /* 이번 선택의 컨트롤 이름으로 읽는다 — "사진 영역 너비"의 선언에는
     !important 가 붙어 있어 "size" 로 읽으면 빈 값이 되고, 그러면
     폼이 **실측값**으로 떨어진다. 실측은 확정 직후 한 박자 늦게
     도착하므로 방금 고른 숫자가 칸에서 되돌아가 보인다. */
  const declared =
    Number(window.readInspectorControlValue(studioInspectorSizeControl(), declarations));

  if (Number.isFinite(declared) && declared > 0) {
    return Math.round(declared);
  }

  /* 바깥 상자가 주인이면 지금 값은 그 상자의 실측 폭이다 —
     사진의 폭이 아니다(둘이 같은 경우가 많지만 같다는 보장이 없다). */
  const owner =
    studioInspectorSizeOwner();

  if (owner && owner.width > 0) {
    return Math.round(owner.width);
  }

  const metrics =
    studioInspectorMetrics;

  return metrics && metrics.width > 0 ? Math.round(metrics.width) : null;

}


/* 이 자리에서 "꽉 참"이 되는 폭 — 부모 안쪽 폭이다. 상한이 아니라
   안내용이고, 못 쟀으면 0이다. 바깥 상자가 주인이면 그 상자를 담고
   있는 칸(= HOME 가운데 칼럼)의 안쪽 폭이다. */
function studioInspectorSizeFullWidth() {

  const owner =
    studioInspectorSizeOwner();

  if (owner) {
    return owner.parentWidth > 0 ? Math.round(owner.parentWidth) : 0;
  }

  const metrics =
    studioInspectorMetrics;

  return metrics && metrics.parentWidth > 0
    ? Math.round(metrics.parentWidth)
    : 0;

}


function studioInspectorSizeMax(currentWidth) {

  const parentWidth =
    studioInspectorSizeFullWidth();

  /* 사진 영역(바깥 상자)의 상한은 담고 있는 칸의 폭이다 — 그보다 큰
     값은 어차피 max-width:100% 에 눌려 같은 그림이고, 슬라이더의
     오른쪽 끝이 "칸을 꽉 채운 자리"라는 뜻을 갖는 편이 낫다.
     칸을 못 쟀으면 아래 일반 규칙으로 떨어진다. */
  if (studioInspectorSizeOwner() && parentWidth) {

    return Math.max(
      parentWidth,
      currentWidth || 0,
      STUDIO_INSPECTOR_SIZE_MIN + 1
    );

  }

  /* 부모 폭의 몇 배까지 — 꽉 찬 너비를 훌쩍 넘겨 고를 수 있으면서도
     슬라이더 한 칸이 쓸 수 없을 만큼 커지지는 않는 폭이다. 아주 좁은
     자리(작은 칸 안의 아이콘 등)에서는 MIN_RANGE가 바닥을 받쳐 준다.
     부모를 못 쟀으면 절대 상한을 그대로 쓴다. */
  const limit =
    parentWidth
      ? Math.max(
          parentWidth * STUDIO_INSPECTOR_SIZE_HEADROOM,
          STUDIO_INSPECTOR_SIZE_MIN_RANGE
        )
      : STUDIO_INSPECTOR_SIZE_MAX;

  /* 이미 그보다 큰 값이 들어 있으면(스킨이 원래 그렇게 만들었다면)
     슬라이더가 그 값을 표현조차 못 하는 일이 없게 한다. */
  return Math.max(
    Math.round(Math.min(limit, STUDIO_INSPECTOR_SIZE_MAX)),
    currentWidth || 0,
    STUDIO_INSPECTOR_SIZE_MIN + 1
  );

}


function renderStudioInspectorSizeBlock(spec, info, declarations) {

  const baseline =
    studioInspectorSizeBaseline(declarations);

  const value =
    baseline || STUDIO_INSPECTOR_SIZE_MIN;

  const max =
    studioInspectorSizeMax(value);

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
    `${spec.label} (${spec.unit})`;

  const reset =
    document.createElement("button");

  reset.type = "button";
  reset.className = "studio-inspector-clear";
  reset.id = "studioInspectorSizeReset";
  reset.textContent = "기본";

  reset.addEventListener("click", () => {

    clearStudioInspectorPreview();

    commitStudioInspectorStyle(studioInspectorSizeControl(), "");

  });

  head.appendChild(caption);
  head.appendChild(reset);

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-size-row";

  const range =
    document.createElement("input");

  range.type = "range";
  range.className = "studio-inspector-range";
  range.id = "studioInspectorSizeRange";
  range.dataset.inspectorControl = "sizeRange";
  range.min = String(STUDIO_INSPECTOR_SIZE_MIN);
  range.max = String(max);
  range.step = "1";
  range.value = String(value);

  bindStudioInspectorRange(range);

  const number =
    document.createElement("input");

  number.type = "number";
  number.className = "studio-inspector-input studio-inspector-input--number";
  number.id = "studioInspectorSizeNumber";
  number.dataset.inspectorControl = "size";
  number.min = String(STUDIO_INSPECTOR_SIZE_MIN);
  number.max = String(max);
  number.value = String(value);

  /* 슬라이더를 끄는 동안(input)은 미리보기만, 손을 뗐을 때(change)
     한 번만 확정한다 — 드래그 한 번 = Undo 한 번. */
  range.addEventListener("input", () => {
    previewStudioInspectorSize(Number(range.value), { from: "range" });
  });

  range.addEventListener("change", () => {
    commitStudioInspectorSize(Number(range.value));
  });

  number.addEventListener("input", () => {
    previewStudioInspectorSize(Number(number.value), { from: "number" });
  });

  number.addEventListener("change", () => {
    commitStudioInspectorSize(Number(number.value));
  });

  number.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
      event.preventDefault();
      commitStudioInspectorSize(Number(number.value));
    }

  });

  row.appendChild(range);
  row.appendChild(number);

  block.appendChild(head);
  block.appendChild(row);

  const fullWidth =
    studioInspectorSizeFullWidth();

  const owner =
    studioInspectorSizeOwner();

  /* 사진 영역이면 "칸을 꽉 채우기"를 한 번에 고를 수 있다. 값은 px 가
     아니라 100% 라 데스크톱에서도 모바일에서도 그 칸을 꽉 채운다. */
  if (owner && fullWidth) {

    const filled =
      window.readInspectorControlValue("frameSizeFill", declarations) === "fill";

    const fit =
      document.createElement("button");

    fit.type = "button";
    fit.className = "studio-inspector-clear studio-inspector-size-fit";
    fit.id = "studioInspectorSizeFit";
    fit.textContent = "콘텐츠 폭에 맞추기";
    fit.setAttribute("aria-pressed", String(filled));

    fit.addEventListener("click", () => {

      clearStudioInspectorPreview();

      commitStudioInspectorStyle("frameSize", filled ? "" : "fill");

    });

    block.appendChild(fit);

  }

  /* "왜 여기서 안 늘어나지"의 답을 슬라이더 옆에 적어 둔다 — 꽉 차는
     폭은 Preview 폭에 따라 달라지고(공개 화면은 더 넓다), 그보다 큰
     값도 넘치지 않고 꽉 찬 채로 보인다. 부모를 못 쟀으면 생략한다. */
  if (fullWidth) {

    const note =
      document.createElement("p");

    note.className = "studio-inspector-block-note";
    note.id = "studioInspectorSizeNote";

    note.textContent =
      owner
        ? `사진이 놓이는 자리(바깥 여백 · 테두리 포함)의 너비예요. ` +
          `이 칸은 ${fullWidth}px 까지 넓힐 수 있고, 그 안의 사진을 ` +
          `크게 보고 싶으면 아래 "자르기"에서 확대합니다.`
        : `지금 미리보기에서는 ${fullWidth}px이면 자리에 꽉 차요 — ` +
          `더 크게 두어도 넘치지 않고 꽉 찬 채로 보여요.`;

    block.appendChild(note);

  }

  studioInspectorFields.appendChild(block);

  studioInspectorSizeRange = range;
  studioInspectorSizeNumber = number;

}


/* =========================================================
   이미지 너비 — 임시 반영 / 확정

   슬라이더·숫자칸·모서리 드래그 셋이 같은 함수 두 개를 쓴다.
   그래서 "숫자·슬라이더·드래그 결과가 서로 다르다"가 구조적으로
   생기지 않는다.
========================================================== */

function studioInspectorClampSize(width) {

  const value =
    Math.round(Number(width));

  if (!Number.isFinite(value)) {
    return null;
  }

  const max =
    studioInspectorSizeMax(
      studioInspectorSizeNumber ? Number(studioInspectorSizeNumber.max) : 0
    );

  return Math.min(Math.max(value, STUDIO_INSPECTOR_SIZE_MIN), max);

}


function syncStudioInspectorSizeInputs(width, options) {

  const from =
    (options && options.from) || "";

  if (studioInspectorSizeRange && from !== "range") {

    studioInspectorSizeRange.value = String(width);

    /* 값만 넣으면 채워진 구간이 따라오지 않는다(input 이벤트가
       나지 않으므로) — 모서리를 끄는 동안 슬라이더 막대가 그
       자리에 얼어붙는다. */
    studioInspectorRangeFill(studioInspectorSizeRange);

  }

  if (studioInspectorSizeNumber && from !== "number") {
    studioInspectorSizeNumber.value = String(width);
  }

}


function previewStudioInspectorSize(width, options) {

  const value =
    studioInspectorClampSize(width);

  if (value === null || !studioInspectorSelection) {
    return;
  }

  syncStudioInspectorSizeInputs(value, options);

  /* 드래그는 시작할 때 잰 비율을 끝까지 그대로 쓴다 — 미리보기가
     매 프레임 다시 재면 반올림이 조금씩 누적된다. */
  const ratio =
    (options && Number.isFinite(options.ratio) && options.ratio > 0)
      ? options.ratio
      : (() => {

          const resolved =
            describeStudioInspectorSelection();

          return resolved
            ? studioInspectorSizeRatio(studioInspectorSizeDeclarations(resolved))
            : null;

        })();

  sendStudioInspectorPreview({
    editId: studioInspectorSelection.editId,
    width: value,
    ratio: ratio || undefined,
    target:
      studioInspectorSizeOwner()
        ? "sizeOwner"
        : (studioInspectorSizeTargetsFrame() ? "frame" : "image")
  });

}


function commitStudioInspectorSize(width, options) {

  const value =
    studioInspectorClampSize(width);

  if (value === null || !studioInspectorSelection) {
    return false;
  }

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return false;
  }

  /* 실제 크기가 그대로면 편집 이력을 만들지 않는다(요구사항 3절). */
  if (value === studioInspectorSizeBaseline(studioInspectorSizeDeclarations(resolved))) {

    clearStudioInspectorPreview();

    syncStudioInspectorSizeInputs(value, {});

    return false;

  }

  const ratio =
    (options && Number.isFinite(options.ratio) && options.ratio > 0)
      ? options.ratio
      : studioInspectorSizeRatio(studioInspectorSizeDeclarations(resolved));

  clearStudioInspectorPreview();

  return commitStudioInspectorStyle(
    studioInspectorSizeControl(),
    { width: value, ratio }
  );

}


/* =========================================================
   모서리 드래그

   ★ 기준점은 **반대쪽 모서리**다. 드래그를 시작한 순간의 화면
   좌표로 한 번만 잡아 두고, 그 뒤로는 포인터와 그 점 사이의 거리만
   본다 — 그래서 드래그 중 이미지가 커지면서 자기 자리가 밀려도
   (일반 흐름 배치라 그렇다) 계산이 흔들리지 않는다. 페이지를
   절대좌표 배치로 바꾸지 않는 이유이자, 바꿀 필요가 없는 이유다.

   ★ 배율/스크롤은 studioInspectorMapRectRaw()가 이미 반영한 화면
   좌표에서 시작하므로, 포인터 이동량을 iframe 안 px로 되돌릴 때
   scale로 나누기만 하면 된다(Mobile Preview의 축소, AI 패널을
   여닫아 생기는 이동, 창 크기 변경 모두 같은 식으로 처리된다).

   ★ 포인터는 핸들이 캡처한다. 그래서 포인터가 이미지 밖으로,
   iframe 밖으로, 심지어 창 밖으로 나가도 move/up이 계속 이 핸들로
   온다 — "드래그가 끊긴다"도 "계속 붙잡힌 채로 남는다"도 없다
   (lostpointercapture는 취소로 받는다).
========================================================== */

function beginStudioInspectorHandleDrag(event, corner, handle) {

  if (
    !studioInspectorEnabled ||
    !studioInspectorResizable ||
    !studioInspectorSelection ||
    studioInspectorDrag
  ) {
    return;
  }

  const mapped =
    studioInspectorMapRectRaw(studioInspectorSelection.rect);

  if (!mapped || !mapped.scale) {
    return;
  }

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const sizeDeclarations =
    studioInspectorSizeDeclarations(resolved);

  const startWidth =
    studioInspectorSizeBaseline(sizeDeclarations) ||
    Math.round(studioInspectorSelection.rect.width);

  studioInspectorDrag = {
    pointerId: event.pointerId,
    handle,
    corner,

    /* 좌우 손잡이는 가로 한 축만 바꾼다 — 세로 이동량을 섞으면
       손이 위아래로 흔들리는 만큼 폭이 따라 흔들린다. */
    axis:
      STUDIO_INSPECTOR_HANDLE_SIDES.indexOf(corner) === -1 ? "" : "x",

    scale: mapped.scale,
    /* 반대쪽 모서리 */
    anchorX: corner.indexOf("w") === -1 ? mapped.left : mapped.right,
    anchorY: corner.indexOf("n") === -1 ? mapped.top : mapped.bottom,
    ratio: studioInspectorSizeRatio(sizeDeclarations),
    startWidth,
    width: startWidth,
    frame: 0
  };

  try {
    handle.setPointerCapture(event.pointerId);
  } catch (err) {
    /* 캡처가 안 되는 환경(오래된 WebKit 등)에서도 아래 document
       리스너가 move/up을 받아 준다 — 기능이 없어지지는 않는다. */
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.add("is-dragging");
  }

}


function moveStudioInspectorHandleDrag(event) {

  const drag =
    studioInspectorDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  const dx =
    Math.abs(event.clientX - drag.anchorX) / drag.scale;

  const dy =
    (Math.abs(event.clientY - drag.anchorY) / drag.scale) * (drag.ratio || 1);

  /* 비율이 고정돼 있으므로 가로/세로 중 하나만 보면 대각선 드래그가
     한쪽 축에서만 반응하는 느낌이 된다 — 두 축이 각각 요구하는
     너비의 평균을 쓴다. */
  const next =
    studioInspectorClampSize(
      (drag.ratio && drag.axis !== "x") ? (dx + dy) / 2 : dx
    );

  if (next === null || next === drag.width) {
    return;
  }

  drag.width =
    next;

  /* pointermove마다 postMessage를 쏘지 않는다 — 한 프레임에 한 번만
     보낸다(요구사항 4절 "매 pointermove마다 재렌더/Undo 금지"). */
  if (!drag.frame) {

    drag.frame =
      window.requestAnimationFrame(() => {

        drag.frame = 0;

        if (studioInspectorDrag === drag) {
          previewStudioInspectorSize(drag.width, { ratio: drag.ratio });
        }

      });

  }

}


function finishStudioInspectorDrag(drag) {

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

  studioInspectorDrag =
    null;

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.remove("is-dragging");
  }

}


function endStudioInspectorHandleDrag(event) {

  const drag =
    studioInspectorDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  finishStudioInspectorDrag(drag);

  /* 실제로 크기가 변하지 않았으면 아무 것도 확정하지 않는다 —
     임시 반영만 걷어낸다(= 이력도 생기지 않는다). */
  if (drag.width === drag.startWidth) {

    clearStudioInspectorPreview();

    syncStudioInspectorSizeInputs(drag.startWidth, {});

    return;

  }

  commitStudioInspectorSize(drag.width, { ratio: drag.ratio });

}


function cancelStudioInspectorHandleDrag(event) {

  const drag =
    studioInspectorDrag;

  if (!drag || (event && event.pointerId !== drag.pointerId)) {
    return;
  }

  finishStudioInspectorDrag(drag);

  clearStudioInspectorPreview();

  syncStudioInspectorSizeInputs(drag.startWidth, {});

}


/*
  모서리 드래그의 move/up — 핸들이 아니라 document에서 받는다.

  포인터를 캡처했으면 이벤트의 target은 계속 그 핸들이고, 캡처가
  안 되는 환경에서는 포인터 아래의 아무 요소나 target이 된다. 어느
  쪽이든 document까지는 올라오므로, 여기 한 곳만 보면 "이미지 밖으로
  나갔다 / iframe 위로 지나갔다 / 창 밖으로 나갔다"를 따로 다루지
  않아도 된다. 드래그 중이 아니면 첫 줄에서 빠져나간다.
*/
document.addEventListener("pointermove", moveStudioInspectorHandleDrag);

document.addEventListener("pointerup", endStudioInspectorHandleDrag);

document.addEventListener("pointercancel", cancelStudioInspectorHandleDrag);
