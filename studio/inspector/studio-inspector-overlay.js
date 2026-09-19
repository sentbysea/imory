/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: overlay

   Preview **위에** 얹는 층 하나를 통째로 담당한다.

     - overlay DOM을 처음 켤 때 한 번만 만든다
       (buildStudioInspectorLayer) — hover 테두리 / 선택 테두리 /
       모서리 핸들 4개 / 팝오버 껍데기
     - iframe 안 좌표를 Studio(뷰포트) 좌표로 옮긴다
       (studioInspectorFrameGeometry / studioInspectorMapRect /
       studioInspectorMapRectRaw)
     - 그 좌표로 테두리·이름표·핸들을 칠한다(팝오버는 왼쪽 패널에
       산다 — STUDIO-SHELL-1)
     - Studio 레이아웃이 바뀌면 다시 칠한다
       (repaintStudioInspectorOverlay + resize/ResizeObserver)

   ★ 스킨 DOM에는 아무 것도 붙이지 않는다. 왜 iframe 안이 아니라
     Studio overlay인지는 studio-inspector.js 머리말 참고.

   ★ 팝오버 **안의 내용**은 여기서 그리지 않는다 — 껍데기와 머리
     (이름 · 종류 · 바깥 영역 선택 · 선택 해제, DIRECT-UX-1)까지만
     만들고, 폼은
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
       studio-inspector-overlay.js     overlay DOM · 좌표 변환 · 테두리/이름표/핸들
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

  /* =====================================================
     DIRECT-UX-1 — 패널 머리

     예전의 "직접 수정 | ✦ AI 수정" 두 탭은 없다. 이 패널 자체가
     직접 수정 화면이고(항목이 늘 펼쳐져 있다), AI 는 오른쪽 AI
     Assistant 에서만 한다 — 여는 곳은 Quick Bar 의 "AI로 수정"이다.

       이름            프로필 이미지
       종류 · 페이지   이미지 · HOME
       [바깥 영역 선택] [선택 해제]
  ====================================================== */

  const head =
    document.createElement("div");

  head.className =
    "studio-inspector-head";

  studioInspectorPopoverTitle =
    document.createElement("p");

  studioInspectorPopoverTitle.className =
    "studio-inspector-popover-title";

  studioInspectorPopoverTitle.id =
    "studioInspectorPopoverTitle";

  studioInspectorPopoverMeta =
    document.createElement("p");

  studioInspectorPopoverMeta.className =
    "studio-inspector-popover-meta";

  studioInspectorPopoverMeta.id =
    "studioInspectorPopoverMeta";

  const actions =
    document.createElement("div");

  actions.className =
    "studio-inspector-popover-actions";

  studioInspectorOuterButton =
    document.createElement("button");

  studioInspectorOuterButton.type = "button";
  studioInspectorOuterButton.className = "studio-inspector-action";
  studioInspectorOuterButton.id = "studioInspectorOuterButton";
  studioInspectorOuterButton.textContent = "바깥 영역 선택";
  studioInspectorOuterButton.title = "지금 고른 요소를 감싸는 영역을 고릅니다";

  const deselectButton =
    document.createElement("button");

  deselectButton.type = "button";
  deselectButton.className = "studio-inspector-action";
  deselectButton.id = "studioInspectorDeselectButton";
  deselectButton.textContent = "선택 해제";
  deselectButton.title = "선택 해제 · Esc";

  actions.appendChild(studioInspectorOuterButton);
  actions.appendChild(deselectButton);

  head.appendChild(studioInspectorPopoverTitle);
  head.appendChild(studioInspectorPopoverMeta);
  head.appendChild(actions);

  /* 좁은 화면에서 Quick Bar 가 들어오는 자리(studio-inspector-quickbar.js) */
  const quickBarSlot =
    document.createElement("div");

  quickBarSlot.className =
    "studio-inspector-quickbar-slot";

  quickBarSlot.id =
    "studioInspectorQuickBarSlot";

  /* 움직임 효과 상태 한 줄 — 효과가 있을 때만 보인다(§11) */
  studioInspectorMotion =
    document.createElement("div");

  studioInspectorMotion.className =
    "studio-inspector-motion";

  studioInspectorMotion.id =
    "studioInspectorMotion";

  studioInspectorMotion.hidden =
    true;

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

  /* STUDIO-SHELL-1.1 — 팝오버 아래의 "되돌리기" 버튼은 만들지 않는다.
     직접 편집은 applyWorkingSkinChanges 를 지나 상단 ↶
     (studio/studio-history.js)에 한 칸으로 쌓이고, 사용자가 되돌리는
     곳은 그 하나다. undoStudioInspectorEdit() 와 studioInspectorUndo
     기록은 호환 경로로 남는다 — studioInspectorUndoButton 은 null
     그대로이고, 그것을 만지는 자리는 전부 건너뛴다. */

  studioInspectorPopover.appendChild(head);
  studioInspectorPopover.appendChild(quickBarSlot);
  studioInspectorPopover.appendChild(studioInspectorNote);
  studioInspectorPopover.appendChild(studioInspectorMotion);
  studioInspectorPopover.appendChild(studioInspectorFields);

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

  /* 삼등분 가이드선. 판의 자식이라 판이 hidden이면 함께 사라진다 —
     "자르는 동안에만 보이고 적용하면 숨는다"를 따로 켜고 끌 필요가
     없다. 선 자체는 pointer-events: none이라 그 위를 끌어도 사진
     드래그가 그대로 시작된다(CSS). */
  const cropGuide =
    document.createElement("div");

  cropGuide.className =
    "studio-inspector-crop-guide";

  cropGuide.id =
    "studioInspectorCropGuide";

  studioInspectorCropSurface.appendChild(cropGuide);

  /* STUDIO-SHELL-1 — 선택 요소 이름표. 테두리와 같은 층에 두되
     핸들보다 **먼저** 붙인다 — 둘이 겹치면 핸들이 위에서 잡힌다.
     내용은 renderStudioInspectorPopover()가 팝오버 제목과 같은
     문구로 채운다. */
  studioInspectorSelectLabel =
    document.createElement("div");

  studioInspectorSelectLabel.className =
    "studio-inspector-select-label";

  studioInspectorSelectLabel.id =
    "studioInspectorSelectLabel";

  studioInspectorSelectLabel.setAttribute("aria-hidden", "true");

  studioInspectorSelectLabel.hidden =
    true;

  studioInspectorLayer.appendChild(studioInspectorHoverBox);
  studioInspectorLayer.appendChild(studioInspectorSelectBox);
  studioInspectorLayer.appendChild(studioInspectorSelectLabel);
  studioInspectorLayer.appendChild(studioInspectorCropSurface);

  /* 자유 비율 핸들 — 자르기 판과 같은 사각형 위에 앉지만 판보다
     위에 있어야 잡힌다(레이어에 나중에 붙는다). 판과 마찬가지로
     **보이는 사각형**을 쓴다(paintStudioInspectorCropHandles). */
  studioInspectorCropHandles =
    STUDIO_INSPECTOR_CROP_HANDLE_EDGES.map((edge) => {

      const handle =
        document.createElement("div");

      handle.className =
        `studio-inspector-crop-handle studio-inspector-crop-handle--${edge}`;

      handle.id =
        `studioInspectorCropHandle-${edge}`;

      handle.dataset.inspectorCropHandle =
        edge;

      handle.hidden =
        true;

      handle.addEventListener(
        "pointerdown",
        (event) => beginStudioInspectorCropSideDrag(event, edge, handle)
      );

      handle.addEventListener(
        "lostpointercapture",
        cancelStudioInspectorCropSideDrag
      );

      handle.addEventListener("dragstart", (event) => event.preventDefault());

      studioInspectorLayer.appendChild(handle);

      return handle;

    });

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

  /* =====================================================
     LAYOUT-1 — 자유 배치의 이동 손잡이

     자유 배치(free) 안에 있는 요소만 가진다. 선택 테두리 왼쪽 위
     바깥에 앉는다 — 모서리 크기 핸들 네 개와 자리가 겹치지 않는
     유일한 자리이고, 자유 배치 요소는 크기 핸들을 갖지 않으므로
     (이미지가 아닌 컨테이너가 대부분) 실제로는 거의 단독이다.

     "요소 자체를 끄는" 방식을 쓰지 않는 이유: 프레임 안 요소를
     직접 끌면 그 안의 링크·텍스트 선택·저자 JS 와 뒤엉킨다.
     Inspector 의 다른 드래그(크기·자르기)가 전부 overlay 손잡이인
     것과 같은 판단이다.
  ====================================================== */

  studioInspectorMoveHandle =
    document.createElement("div");

  studioInspectorMoveHandle.className =
    "studio-inspector-move-handle";

  studioInspectorMoveHandle.id =
    "studioInspectorMoveHandle";

  studioInspectorMoveHandle.dataset.inspectorMoveHandle =
    "free";

  studioInspectorMoveHandle.setAttribute("role", "button");

  studioInspectorMoveHandle.setAttribute("aria-label", "자유 배치 위치 옮기기");

  studioInspectorMoveHandle.textContent =
    "✥";

  studioInspectorMoveHandle.hidden =
    true;

  studioInspectorMoveHandle.addEventListener(
    "pointerdown",
    (event) => {

      if (typeof beginStudioInspectorLayoutDrag === "function") {
        beginStudioInspectorLayoutDrag(event, studioInspectorMoveHandle);
      }

    }
  );

  studioInspectorMoveHandle.addEventListener(
    "lostpointercapture",
    () => {

      if (typeof cancelStudioInspectorLayoutDrag === "function") {
        cancelStudioInspectorLayoutDrag();
      }

    }
  );

  studioInspectorMoveHandle.addEventListener(
    "dragstart",
    (event) => event.preventDefault()
  );

  studioInspectorLayer.appendChild(studioInspectorMoveHandle);

  /* =====================================================
     STUDIO-SHELL-1 — 팝오버는 Preview 위에 뜨지 않는다

     왼쪽 패널의 Select 자리(#studioLeftPanelSelect)에 들어가
     패널 내용이 된다. 안내 문구(#studioLeftPanelSelectEmpty) **앞**
     에 넣는다 — 선택이 생기면 CSS 가 그 문구를 물린다
     (studio-shell.css). 자리가 없는 문서(셸이 없는 하네스)에서만
     예전처럼 레이어에 붙는다.
  ====================================================== */

  const popoverHost =
    document.getElementById("studioLeftPanelSelect");

  if (popoverHost) {
    popoverHost.insertBefore(studioInspectorPopover, popoverHost.firstChild);
  } else {
    studioInspectorLayer.appendChild(studioInspectorPopover);
  }

  studioInspectorShell.appendChild(studioInspectorLayer);

  /* Quick Bar · hover 이름표 · 겹친 요소 메뉴(studio-inspector-quickbar.js) */
  if (typeof buildStudioInspectorQuickBar === "function") {
    buildStudioInspectorQuickBar(studioInspectorLayer);
  }

  studioInspectorOuterButton.addEventListener(
    "click",
    () => {
      if (typeof selectStudioInspectorOuter === "function") {
        selectStudioInspectorOuter();
      }
    }
  );

  deselectButton.addEventListener(
    "click",
    () => clearStudioInspectorSelection()
  );

  if (studioInspectorUndoButton) {
    studioInspectorUndoButton.addEventListener(
      "click",
      undoStudioInspectorEdit
    );
  }

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

  paintStudioInspectorCropHandles(visible);

  /* 배치 모듈(studio-inspector-layout.js)이 로드되지 않은 문서에서도
     overlay 자체는 살아 있어야 한다 — 좌표 칠하기가 여기서 예외를
     내면 테두리도 핸들도 팝오버도 전부 멈춘다. */
  if (typeof paintStudioInspectorMoveHandle === "function") {
    paintStudioInspectorMoveHandle(visible);
  }

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
   선택 요소 이름표 (STUDIO-SHELL-1)

   예전에는 여기가 "팝오버 위치"였다 — 긴 직접 수정 카드가 선택
   요소 옆에 떠서 자리를 고르고(위/아래·좌/우 보정, 손이 슬라이더를
   잡고 있는 동안 고정, 편집 중인 요소를 덮으면 다시 고르기),
   그래도 Preview 의 일부를 가렸다. 이제 그 카드는 왼쪽 패널의
   Select 자리에 산다(buildStudioInspectorLayer) — 떠 있지 않으므로
   고를 자리도 없다.

   Preview 위에 남는 것은 셋이다: 선택 테두리 · 이 이름표 · 이동/
   크기 핸들. 이름표는 테두리 왼쪽 위 **바깥**에 붙고, 그 자리가
   Preview 위쪽 경계(또는 그 위를 덮은 Top Dock) 밖이면 테두리
   **안쪽** 위에 붙는다. 자유 배치 이동 손잡이(✥)가 같은 모서리
   바깥에 있으면 그 옆으로 비킨다.

   sandbox 스킨에서는 테두리를 프레임이 그리지만(studio-inspector-
   state.js studioInspectorRemoteOverlay) 이름표는 이쪽이 그린다 —
   좌표는 같은 rects 메시지로 온다.
========================================================== */

const STUDIO_INSPECTOR_LABEL_GAP = 3;

/* 이동 손잡이(20px + 여백)만큼 */
const STUDIO_INSPECTOR_LABEL_MOVE_SHIFT = 24;


function studioInspectorLabelTopBound(frameBox) {

  if (!studioInspectorTopDock) {
    return frameBox.top;
  }

  const dock =
    studioInspectorTopDock.getBoundingClientRect();

  /* 바가 접혀 올라가 있으면 사각형이 뷰포트 위로 나가 있다 */
  return dock.bottom > frameBox.top && dock.left < frameBox.right
    ? Math.max(frameBox.top, dock.bottom)
    : frameBox.top;

}


function paintStudioInspectorSelectLabel(rect) {

  const label =
    studioInspectorSelectLabel;

  if (!label) {
    return;
  }

  const mapped =
    (studioInspectorSelection && label.textContent)
      ? studioInspectorMapRect(rect)
      : null;

  if (!mapped) {

    label.hidden = true;

    if (typeof paintStudioInspectorQuickBar === "function") {
      paintStudioInspectorQuickBar(null);
    }

    return;

  }

  label.hidden = false;

  const frame =
    studioInspectorFrameGeometry().box;

  const shift =
    (studioInspectorMoveHandle && !studioInspectorMoveHandle.hidden)
      ? STUDIO_INSPECTOR_LABEL_MOVE_SHIFT
      : 0;

  const height =
    label.offsetHeight || 20;

  const outside =
    mapped.top - height - STUDIO_INSPECTOR_LABEL_GAP;

  const top =
    outside >= studioInspectorLabelTopBound(frame)
      ? outside
      : mapped.top + STUDIO_INSPECTOR_LABEL_GAP;

  /* DIRECT-UX-1 — 이름표는 Preview 프레임 밖으로 나가지 않는다
     (390px 에서 오른쪽 끝 요소를 고르면 예전에는 60px 이 삐져나가
     Studio 에 가로 스크롤이 생길 수 있었다). */
  const maxWidth =
    Math.max(40, Math.min(240, Math.round(frame.width - 8)));

  label.style.maxWidth = `${maxWidth}px`;

  const width =
    Math.min(label.offsetWidth || maxWidth, maxWidth);

  const left =
    Math.max(frame.left + 2, Math.min(mapped.left + shift, frame.right - width - 2));

  label.style.left = `${Math.round(left)}px`;
  label.style.top = `${Math.round(top)}px`;

  if (typeof paintStudioInspectorQuickBar === "function") {
    paintStudioInspectorQuickBar(rect);
  }

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

  if (typeof paintStudioInspectorHoverLabel === "function") {
    paintStudioInspectorHoverLabel(studioInspectorHover, studioInspectorHoverEditId);
  }

  if (studioInspectorSelection) {

    const visible =
      studioInspectorSelection.visibleRect || studioInspectorSelection.rect;

    paintStudioInspectorBox(studioInspectorSelectBox, visible);

    paintStudioInspectorHandles(studioInspectorSelection.rect, visible);

    /* stage가 움직인 경우다(창 크기 · 왼쪽/AI 패널 · Desktop/Mobile) —
       이름표도 테두리를 따라간다. */
    paintStudioInspectorSelectLabel(visible);

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
