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

   상한은 부모 안쪽 폭이다 — 그보다 크게 만들 수 있게 두면 모바일
   Preview에서 곧바로 가로 넘침이 생긴다. (그래도 넘치지 않도록
   확정 규칙에는 max-width: 100%가 늘 함께 들어간다 —
   studio-inspector-model.js size 참고.)
========================================================== */

/* 크기 컨트롤이 읽고 써야 할 선언. 자른 이미지에서는 이미지가
   아니라 **프레임(래퍼)**의 규칙이다 — 자른 뒤의 "너비"는 사진의
   너비가 아니라 잘라 보여주는 창의 너비이기 때문이다. */
function studioInspectorSizeDeclarations(resolved) {

  return studioInspectorCropDeclarationsFor("size", resolved);

}


/* 지금 선택이 잘려 있는가 — 임시 미리보기를 이미지가 아니라
   프레임에 적용해야 하는지를 이 값으로 가른다(실측은 iframe이
   한다, preview-bridge.js inspectorMetricsOf). */
function studioInspectorSizeTargetsFrame() {

  return !!(studioInspectorMetrics && studioInspectorMetrics.cropped);

}


function studioInspectorSizeRatio(declarations) {

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

  const declared =
    Number(window.readInspectorControlValue("size", declarations));

  if (Number.isFinite(declared) && declared > 0) {
    return Math.round(declared);
  }

  const metrics =
    studioInspectorMetrics;

  return metrics && metrics.width > 0 ? Math.round(metrics.width) : null;

}


function studioInspectorSizeMax(currentWidth) {

  const metrics =
    studioInspectorMetrics;

  const parentWidth =
    metrics && metrics.parentWidth > 0 ? metrics.parentWidth : 0;

  const limit =
    Math.min(
      STUDIO_INSPECTOR_SIZE_MAX,
      parentWidth || STUDIO_INSPECTOR_SIZE_MAX
    );

  /* 이미 그보다 큰 값이 들어 있으면(스킨이 원래 그렇게 만들었다면)
     슬라이더가 그 값을 표현조차 못 하는 일이 없게 한다. */
  return Math.max(limit, currentWidth || 0, STUDIO_INSPECTOR_SIZE_MIN + 1);

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

    commitStudioInspectorStyle("size", "");

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
    target: studioInspectorSizeTargetsFrame() ? "frame" : "image"
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

  return commitStudioInspectorStyle("size", { width: value, ratio });

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
    studioInspectorClampSize(drag.ratio ? (dx + dy) / 2 : dx);

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
