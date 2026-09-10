/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: overlay

   Preview **위에** 얹는 층 하나를 통째로 담당한다.

     - overlay DOM을 처음 켤 때 한 번만 만든다
       (buildStudioInspectorLayer) — hover 테두리 / 선택 테두리 /
       모서리 핸들 4개 / 팝오버 껍데기
     - iframe 안 좌표를 Studio(뷰포트) 좌표로 옮긴다
       (studioInspectorFrameGeometry / studioInspectorMapRect /
       studioInspectorMapRectRaw)
     - 그 좌표로 테두리·핸들을 칠하고 팝오버를 앉힌다
     - Studio 레이아웃이 바뀌면 다시 칠한다
       (repaintStudioInspectorOverlay + resize/ResizeObserver)

   ★ 스킨 DOM에는 아무 것도 붙이지 않는다. 왜 iframe 안이 아니라
     Studio overlay인지는 studio-inspector.js 머리말 참고.

   ★ 팝오버 **안의 내용**은 여기서 그리지 않는다 — 껍데기와 버튼
     세 개(직접 수정 / ✦ AI 수정 / 되돌리기)까지만 만들고, 폼은
     studio-inspector-controls.js의 renderStudioInspectorPopover()가
     채운다. 그래야 "위치 계산"과 "무엇을 보여줄까"가 섞이지 않는다.

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
   studio/inspector/studio-inspector-state.js.
========================================================== */


/* =========================================================
   overlay DOM — 처음 켤 때 한 번만 만든다

   studio/index.html과 studio/studio-lifecycle-scenario.html 두
   문서에 같은 마크업을 복붙하지 않기 위해서다(AI 패널의 참고
   이미지 UI가 studio-ai-panel.js 안에서 만들어지는 것과 같은
   이유, studio/index.html 주석 참고).
========================================================== */

function buildStudioInspectorLayer() {

  if (studioInspectorLayer || !studioInspectorShell) {
    return;
  }

  studioInspectorLayer =
    document.createElement("div");

  studioInspectorLayer.className =
    "studio-inspector-layer";

  studioInspectorLayer.id =
    "studioInspectorLayer";

  studioInspectorLayer.hidden =
    true;

  studioInspectorHoverBox =
    document.createElement("div");

  studioInspectorHoverBox.className =
    "studio-inspector-outline studio-inspector-outline--hover";

  studioInspectorHoverBox.id =
    "studioInspectorHoverBox";

  studioInspectorHoverBox.hidden =
    true;

  studioInspectorSelectBox =
    document.createElement("div");

  studioInspectorSelectBox.className =
    "studio-inspector-outline studio-inspector-outline--selected";

  studioInspectorSelectBox.id =
    "studioInspectorSelectBox";

  studioInspectorSelectBox.hidden =
    true;

  studioInspectorPopover =
    document.createElement("div");

  studioInspectorPopover.className =
    "studio-inspector-popover";

  studioInspectorPopover.id =
    "studioInspectorPopover";

  studioInspectorPopover.hidden =
    true;

  studioInspectorPopoverTitle =
    document.createElement("p");

  studioInspectorPopoverTitle.className =
    "studio-inspector-popover-title";

  studioInspectorPopoverTitle.id =
    "studioInspectorPopoverTitle";

  const actions =
    document.createElement("div");

  actions.className =
    "studio-inspector-popover-actions";

  studioInspectorDirectButton =
    document.createElement("button");

  studioInspectorDirectButton.type =
    "button";

  studioInspectorDirectButton.className =
    "studio-inspector-action";

  studioInspectorDirectButton.id =
    "studioInspectorDirectButton";

  studioInspectorDirectButton.textContent =
    "직접 수정";

  const aiButton =
    document.createElement("button");

  aiButton.type =
    "button";

  aiButton.className =
    "studio-inspector-action studio-inspector-action--ai";

  aiButton.id =
    "studioInspectorAiButton";

  aiButton.textContent =
    "✦ AI 수정";

  actions.appendChild(studioInspectorDirectButton);
  actions.appendChild(aiButton);

  studioInspectorNote =
    document.createElement("p");

  studioInspectorNote.className =
    "studio-inspector-note";

  studioInspectorNote.id =
    "studioInspectorNote";

  studioInspectorNote.hidden =
    true;

  studioInspectorFields =
    document.createElement("div");

  studioInspectorFields.className =
    "studio-inspector-fields";

  studioInspectorFields.id =
    "studioInspectorFields";

  studioInspectorFields.hidden =
    true;

  studioInspectorUndoButton =
    document.createElement("button");

  studioInspectorUndoButton.type =
    "button";

  studioInspectorUndoButton.className =
    "studio-inspector-undo";

  studioInspectorUndoButton.id =
    "studioInspectorUndoButton";

  studioInspectorUndoButton.textContent =
    "되돌리기";

  studioInspectorUndoButton.hidden =
    true;

  studioInspectorPopover.appendChild(studioInspectorPopoverTitle);
  studioInspectorPopover.appendChild(actions);
  studioInspectorPopover.appendChild(studioInspectorNote);
  studioInspectorPopover.appendChild(studioInspectorFields);
  studioInspectorPopover.appendChild(studioInspectorUndoButton);

  /* 자르기 중에 사진을 끌어 옮기는 투명한 판. 평소에는 hidden이라
     Preview가 hover/click을 그대로 받고, 자르기를 여는 동안에만
     프레임 위에 깔린다(studio-inspector-crop.js). iframe 안이
     아니라 여기 있는 이유는 모서리 핸들과 같다 — 좌표 변환을
     한 벌만 쓰고, 스킨 DOM에는 아무 것도 붙이지 않기 위해서다. */
  studioInspectorCropSurface =
    document.createElement("div");

  studioInspectorCropSurface.className =
    "studio-inspector-crop-surface";

  studioInspectorCropSurface.id =
    "studioInspectorCropSurface";

  studioInspectorCropSurface.hidden =
    true;

  studioInspectorCropSurface.addEventListener(
    "pointerdown",
    beginStudioInspectorCropDrag
  );

  studioInspectorCropSurface.addEventListener(
    "lostpointercapture",
    cancelStudioInspectorCropDrag
  );

  studioInspectorCropSurface.addEventListener(
    "dragstart",
    (event) => event.preventDefault()
  );

  studioInspectorLayer.appendChild(studioInspectorHoverBox);
  studioInspectorLayer.appendChild(studioInspectorSelectBox);
  studioInspectorLayer.appendChild(studioInspectorCropSurface);

  /* 모서리 핸들 — 선택 테두리의 자식이 아니라 레이어의 형제로 둔다.
     테두리 박스는 Preview 영역과의 교집합으로 잘려 있어서(즉
     스크롤로 반쯤 나간 요소에서는 실제 모서리와 다른 자리다),
     핸들은 잘리지 않은 좌표로 따로 찍어야 한다. */
  studioInspectorHandles =
    STUDIO_INSPECTOR_HANDLE_CORNERS.map((corner) => {

      const handle =
        document.createElement("div");

      handle.className =
        `studio-inspector-handle studio-inspector-handle--${corner}`;

      handle.id =
        `studioInspectorHandle-${corner}`;

      handle.dataset.inspectorHandle =
        corner;

      handle.hidden =
        true;

      handle.addEventListener(
        "pointerdown",
        (event) => beginStudioInspectorHandleDrag(event, corner, handle)
      );

      /* move/up은 document에서 받는다(아래 리스너) — 포인터 캡처가
         걸리면 이벤트는 이 핸들을 거쳐 document까지 올라오고,
         캡처가 안 되는 환경에서도 document에는 도달하기 때문이다.
         한 곳에서만 받으면 두 경우를 따로 처리할 필요가 없다. */
      handle.addEventListener("lostpointercapture", cancelStudioInspectorHandleDrag);

      /* 브라우저 기본 드래그(핸들 자체를 끌고 가는 동작)를 막는다. */
      handle.addEventListener("dragstart", (event) => event.preventDefault());

      studioInspectorLayer.appendChild(handle);

      return handle;

    });

  studioInspectorLayer.appendChild(studioInspectorPopover);

  studioInspectorShell.appendChild(studioInspectorLayer);

  studioInspectorDirectButton.addEventListener(
    "click",
    () => {

      studioInspectorEditingOpen =
        !studioInspectorEditingOpen;

      renderStudioInspectorPopover();

    }
  );

  aiButton.addEventListener(
    "click",
    handleStudioInspectorAiRequest
  );

  studioInspectorUndoButton.addEventListener(
    "click",
    undoStudioInspectorEdit
  );

}



/* =========================================================
   좌표 변환 — iframe 안 좌표 -> Studio(뷰포트) 좌표

   Mobile 모드에서는 #studioPreviewFrameWrap에 CSS transform:
   scale()이 걸려 있다(studio.css). getBoundingClientRect()는 이미
   변환된 크기를 돌려주므로, 배율은 "실제로 그려진 폭 / 레이아웃
   폭"으로 구하면 정확하다 — 배율 값을 어디서도 따로 읽어올 필요가
   없고, 나중에 다른 변환이 추가돼도 이 식이 그대로 맞는다.

   테두리(모바일 프레임의 1px)는 iframe 요소의 border라 내부 문서
   좌표계의 원점이 그만큼 안쪽으로 밀린다 — offsetWidth는 border를
   포함하므로 배율 계산에는 문제가 없고, 원점만 보정하면 된다.
========================================================== */

function studioInspectorFrameGeometry() {

  const box =
    studioInspectorFrame.getBoundingClientRect();

  const layoutWidth =
    studioInspectorFrame.offsetWidth || box.width || 1;

  const scale =
    box.width / layoutWidth;

  const style =
    window.getComputedStyle(studioInspectorFrame);

  return {
    box,
    scale,
    borderLeft: parseFloat(style.borderLeftWidth) || 0,
    borderTop: parseFloat(style.borderTopWidth) || 0
  };

}


/* iframe 안에서 스크롤로 화면 밖에 나간 부분까지 테두리를 그리면
   Preview 바깥(Top Dock/AI 패널 위)에 선이 삐져나온다 — 항상
   Preview 영역과 교집합만 그린다. 교집합이 없으면 null. */
function studioInspectorMapRect(rect) {

  if (!rect || !studioInspectorFrame) {
    return null;
  }

  const geometry =
    studioInspectorFrameGeometry();

  const left =
    geometry.box.left + (geometry.borderLeft + rect.left) * geometry.scale;

  const top =
    geometry.box.top + (geometry.borderTop + rect.top) * geometry.scale;

  const right =
    left + rect.width * geometry.scale;

  const bottom =
    top + rect.height * geometry.scale;

  const clippedLeft =
    Math.max(left, geometry.box.left);

  const clippedTop =
    Math.max(top, geometry.box.top);

  const clippedRight =
    Math.min(right, geometry.box.right);

  const clippedBottom =
    Math.min(bottom, geometry.box.bottom);

  if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
    return null;
  }

  return {
    left: clippedLeft,
    top: clippedTop,
    width: clippedRight - clippedLeft,
    height: clippedBottom - clippedTop
  };

}


function paintStudioInspectorBox(element, rect) {

  if (!element) {
    return;
  }

  const mapped =
    studioInspectorMapRect(rect);

  if (!mapped) {
    element.hidden = true;
    return;
  }

  element.style.left = `${mapped.left}px`;
  element.style.top = `${mapped.top}px`;
  element.style.width = `${mapped.width}px`;
  element.style.height = `${mapped.height}px`;

  element.hidden = false;

}


/* =========================================================
   잘리지 않은 좌표 — 모서리 핸들과 드래그 기준점 계산용

   studioInspectorMapRect()는 Preview 영역과의 교집합만 돌려준다
   (테두리가 Top Dock 위로 삐져나가지 않게). 하지만 "반대쪽 모서리를
   기준으로 크기를 바꾼다"는 계산은 잘리기 전 좌표라야 맞다 —
   잘린 좌표를 쓰면 스크롤로 요소가 반쯤 나가 있을 때 기준점이
   화면 경계로 끌려와 드래그가 튄다.

   Desktop/Mobile 전환(scale)·AI 패널 여닫기·창 크기 변경은 전부
   getBoundingClientRect() 결과에 이미 반영돼 있으므로, 이 함수는
   부를 때마다 그 순간의 배율과 원점을 그대로 쓴다.
========================================================== */

function studioInspectorMapRectRaw(rect) {

  if (!rect || !studioInspectorFrame) {
    return null;
  }

  const geometry =
    studioInspectorFrameGeometry();

  const left =
    geometry.box.left + (geometry.borderLeft + rect.left) * geometry.scale;

  const top =
    geometry.box.top + (geometry.borderTop + rect.top) * geometry.scale;

  return {
    left,
    top,
    right: left + rect.width * geometry.scale,
    bottom: top + rect.height * geometry.scale,
    scale: geometry.scale,
    frame: geometry.box
  };

}


/* 핸들은 "지금 선택이 크기 조절 가능한 이미지"일 때만, 그리고 그
   모서리가 실제로 Preview 안에 보일 때만 그린다. */
function paintStudioInspectorHandles(rect, visibleRect) {

  /* 자르기 판과 모서리 핸들은 같은 사각형 위에 그려진다 — 둘을
     동시에 띄우면 사진을 끌려던 손이 핸들을 잡는다. 자르는 동안은
     핸들을 내리고, 자르기가 끝나면 다시 올라온다. 한 곳에서 함께
     칠해야 "한쪽만 남아 있다"가 생기지 않는다.

     ★ 판은 **보이는 사각형** 위에 깐다. 프레임이 부모의
     overflow: hidden에 잘려 있으면 레이아웃 사각형에는 화면에
     그려지지 않는 부분이 들어 있고, 그 자리를 끌어도 사진은
     없다(preview-bridge.js inspectorVisibleRectOf 머리말). */
  const visible =
    visibleRect || rect;

  paintStudioInspectorCropSurface(visible);

  if (!studioInspectorHandles.length) {
    return;
  }

  const mapped =
    (studioInspectorResizable && !studioInspectorCropDraft)
      ? studioInspectorMapRectRaw(rect)
      : null;

  /* 핸들 **좌표**는 레이아웃 사각형 그대로다 — 크기 조절 계산이
     반대쪽 모서리를 기준점으로 쓰기 때문이다. 다만 잘려서 보이지
     않는 모서리는 잡을 수 없으므로 내린다. */
  const clip =
    mapped && visible !== rect
      ? studioInspectorMapRectRaw(visible)
      : mapped;

  studioInspectorHandles.forEach((handle) => {

    if (!mapped) {
      handle.hidden = true;
      return;
    }

    const corner =
      handle.dataset.inspectorHandle;

    const x =
      corner.indexOf("w") === -1 ? mapped.right : mapped.left;

    const y =
      corner.indexOf("n") === -1 ? mapped.bottom : mapped.top;

    const inside =
      x >= mapped.frame.left - 1 &&
      x <= mapped.frame.right + 1 &&
      y >= mapped.frame.top - 1 &&
      y <= mapped.frame.bottom + 1 &&
      (!clip ||
        (x >= clip.left - 1 &&
         x <= clip.right + 1 &&
         y >= clip.top - 1 &&
         y <= clip.bottom + 1));

    if (!inside) {
      handle.hidden = true;
      return;
    }

    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;

    handle.hidden = false;

  });

}


/* =========================================================
   팝오버 위치 — 선택 요소 rect 기준, 화면 밖으로 나가면 위/아래·
   좌/우 자동 보정(요구사항 6절). 기준 영역은 뷰포트가 아니라
   Preview stage다 — AI 패널이 열려 있을 때 팝오버가 그 아래로
   숨지 않게 하기 위해서다.
========================================================== */

const STUDIO_INSPECTOR_POPOVER_GAP = 8;

/* 지금 앉아 있는 자리.

   ★ 규칙 (요구사항 C)
     - 손이 무언가를 만지고 있는 동안(슬라이더 · 숫자 입력 ·
       모서리 드래그 · 자르기 드래그 = 임시 미리보기가 떠 있는
       동안)에는 **절대 움직이지 않는다.** 이미지가 커지면 팝오버가
       따라 내려가고, 그러면 손이 잡고 있는 슬라이더가 밑으로
       도망간다. 그게 원래 불편의 정체다.
     - 손을 뗀 뒤에는 자리를 그대로 두되, 두 경우에만 다시 고른다:
       stage 밖으로 밀려났을 때, 그리고 **지금 편집 중인 요소를
       덮고 있을 때**. 덮은 채로 두면 모서리 핸들이 팝오버 밑으로
       들어가 잡히지 않는다.
     - 선택이 바뀌거나 폼 모양이 바뀌면 새로 고른다(force).

   ★ 선택 테두리와 모서리 핸들은 이 고정과 무관하게 늘 실제
     프레임을 따라간다 — 그쪽은 "무엇이 선택돼 있는가"를 보여주는
     선이고, 팝오버는 손이 올라가 있는 판이라서 요구가 반대다. */
let studioInspectorPopoverPlacement = null;


/* 지금 손이 무언가를 만지고 있는가 — 임시 미리보기가 떠 있으면
   그렇다(크기 슬라이더/숫자칸/모서리 드래그/자르기 전 과정). */
function studioInspectorPopoverIsBusy() {

  return !!(
    studioInspectorPreviewActive ||
    studioInspectorDrag ||
    studioInspectorCropDrag
  );

}


/* 모서리 핸들은 사각형 모서리에 걸쳐 그려진다 — 팝오버가 그 바로
   위까지 올라오면 핸들 절반이 덮인다. 그만큼 여유를 둔다. */
const STUDIO_INSPECTOR_HANDLE_HIT_PAD = 10;


/* 팝오버가 지금 편집 중인 사각형을 덮고 있는가(모서리 핸들이
   잡히는 자리까지 조금 넉넉하게 본다). */
function studioInspectorPopoverCovers(anchor, size, placement) {

  if (!anchor || !anchor.width || !anchor.height) {
    return false;
  }

  const pad =
    STUDIO_INSPECTOR_HANDLE_HIT_PAD;

  return !(
    placement.left > anchor.left + anchor.width + pad ||
    placement.left + size.width < anchor.left - pad ||
    placement.top > anchor.top + anchor.height + pad ||
    placement.top + size.height < anchor.top - pad
  );

}




function studioInspectorStageBounds() {

  return studioInspectorStage
    ? studioInspectorStage.getBoundingClientRect()
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

}


/* 앵커(선택 사각형) 기준으로 앉을 자리를 새로 고른다.

   자르는 동안에는 **옆으로** 비켜 앉는다 — 자르기는 프레임 위를
   직접 끄는 조작이라, 아래에 붙으면 큰 프레임에서 드래그 영역을
   덮는다. 옆에 자리가 없을 때만 위/아래로 돌아간다. */
function studioInspectorPopoverSpot(anchor, size, bounds) {

  const minLeft =
    bounds.left + STUDIO_INSPECTOR_POPOVER_GAP;

  const maxLeft =
    Math.max(minLeft, bounds.right - size.width - STUDIO_INSPECTOR_POPOVER_GAP);

  const minTop =
    bounds.top + STUDIO_INSPECTOR_POPOVER_GAP;

  const maxTop =
    Math.max(minTop, bounds.bottom - size.height - STUDIO_INSPECTOR_POPOVER_GAP);

  if (studioInspectorCropDraft) {

    const right =
      anchor.left + anchor.width + STUDIO_INSPECTOR_POPOVER_GAP;

    const left =
      anchor.left - size.width - STUDIO_INSPECTOR_POPOVER_GAP;

    const beside =
      (right + size.width <= bounds.right - STUDIO_INSPECTOR_POPOVER_GAP)
        ? right
        : (left >= minLeft ? left : null);

    if (beside !== null) {

      return {
        left: beside,
        top: Math.min(Math.max(anchor.top, minTop), maxTop)
      };

    }

  }

  let top =
    anchor.top + anchor.height + STUDIO_INSPECTOR_POPOVER_GAP;

  if (top + size.height > bounds.bottom - STUDIO_INSPECTOR_POPOVER_GAP) {

    const above =
      anchor.top - size.height - STUDIO_INSPECTOR_POPOVER_GAP;

    top =
      above >= minTop ? above : maxTop;

  }

  return {
    left: Math.min(Math.max(anchor.left, minLeft), maxLeft),
    top
  };

}


function placeStudioInspectorPopover(rect, options) {

  if (!studioInspectorPopover || studioInspectorPopover.hidden) {
    studioInspectorPopoverPlacement = null;
    return;
  }

  const bounds =
    studioInspectorStageBounds();

  const size =
    studioInspectorPopover.getBoundingClientRect();

  const mappedAnchor =
    studioInspectorMapRect(rect);

  /* 손을 떼고 난 뒤, 지금 자리가 편집 중인 요소를 덮고 있으면
     다시 고른다 — 안 그러면 모서리 핸들이 팝오버 밑에 깔린다. */
  const covering =
    !studioInspectorPopoverIsBusy() &&
    !!studioInspectorPopoverPlacement &&
    studioInspectorPopoverCovers(mappedAnchor, size, studioInspectorPopoverPlacement);

  const force =
    !!(options && options.force) ||
    !studioInspectorPopoverPlacement ||
    covering;

  if (!force) {

    /* 자리는 그대로 두되, stage 밖으로 밀려났으면 그만큼만 되민다.
       (AI 패널을 열어 stage가 좁아졌거나 창이 작아진 경우) */
    const minLeft =
      bounds.left + STUDIO_INSPECTOR_POPOVER_GAP;

    const maxLeft =
      Math.max(minLeft, bounds.right - size.width - STUDIO_INSPECTOR_POPOVER_GAP);

    const minTop =
      bounds.top + STUDIO_INSPECTOR_POPOVER_GAP;

    const maxTop =
      Math.max(minTop, bounds.bottom - size.height - STUDIO_INSPECTOR_POPOVER_GAP);

    const left =
      Math.min(Math.max(studioInspectorPopoverPlacement.left, minLeft), maxLeft);

    const top =
      Math.min(Math.max(studioInspectorPopoverPlacement.top, minTop), maxTop);

    studioInspectorPopoverPlacement = { left, top };

    studioInspectorPopover.style.left = `${left}px`;
    studioInspectorPopover.style.top = `${top}px`;

    return;

  }

  const anchor =
    mappedAnchor || {
      left: bounds.left + 16,
      top: bounds.top + 16,
      width: 0,
      height: 0
    };

  studioInspectorPopoverPlacement =
    studioInspectorPopoverSpot(anchor, size, bounds);

  studioInspectorPopover.style.left = `${studioInspectorPopoverPlacement.left}px`;
  studioInspectorPopover.style.top = `${studioInspectorPopoverPlacement.top}px`;

}


/* 팝오버 내용이 바뀌어 크기가 달라졌을 때(직접 수정 폼 여닫기,
   자르기 열기) 자리를 새로 고른다 — 내용이 그대로면 부르지
   않는다. renderStudioInspectorPopover()가 마지막에 부른다. */
function resetStudioInspectorPopoverPlacement() {

  studioInspectorPopoverPlacement = null;

}


/*
  Studio 쪽 레이아웃이 바뀌면(AI 패널 여닫기/폭 드래그/창 크기)
  iframe 안 좌표는 그대로여도 화면 위 위치는 달라진다 — 다시
  칠한다. 좌표 자체를 다시 물어보지는 않는다(iframe 안에서 아무
  일도 일어나지 않았으므로).
*/
function repaintStudioInspectorOverlay() {

  if (!studioInspectorEnabled) {
    return;
  }

  paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);

  if (studioInspectorSelection) {

    const visible =
      studioInspectorSelection.visibleRect || studioInspectorSelection.rect;

    paintStudioInspectorBox(studioInspectorSelectBox, visible);

    paintStudioInspectorHandles(studioInspectorSelection.rect, visible);

    /* stage가 움직인 경우다(창 크기 · AI 패널 · Desktop/Mobile) —
       그때는 팝오버도 새 자리를 골라야 한다. 다만 손이 무언가를
       잡고 있는 중이면 그대로 둔다(자리 보정만 한다). */
    placeStudioInspectorPopover(visible, { force: !studioInspectorPopoverIsBusy() });

  }

}


window.addEventListener("resize", repaintStudioInspectorOverlay);


/*
  창 크기만으로는 부족하다 — AI 패널을 여닫거나 폭을 끌면 창은
  그대로인 채 Preview stage만 좁아진다. Mobile Preview는 그 stage
  **가운데**에 놓이므로, 그때 iframe은 크기뿐 아니라 위치까지
  옆으로 밀린다(테두리와 핸들이 원래 자리에 남아 요소에서 떨어진다).

  stage 크기 변화 하나만 보면 세 경우(여닫기·폭 드래그·창 크기)를
  모두 덮는다. studio-preview.js가 같은 요소에 이미 Mobile 축소
  배율용 ResizeObserver를 달아 두었고(먼저 등록되어 먼저 실행된다),
  여기서는 그 결과가 반영된 좌표로 다시 칠하기만 한다.
*/
if (studioInspectorStage && typeof ResizeObserver === "function") {

  new ResizeObserver(
    repaintStudioInspectorOverlay
  ).observe(
    studioInspectorStage
  );

}
