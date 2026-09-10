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

  studioInspectorLayer.appendChild(studioInspectorHoverBox);
  studioInspectorLayer.appendChild(studioInspectorSelectBox);

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
function paintStudioInspectorHandles(rect) {

  if (!studioInspectorHandles.length) {
    return;
  }

  const mapped =
    studioInspectorResizable ? studioInspectorMapRectRaw(rect) : null;

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
      y <= mapped.frame.bottom + 1;

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

function placeStudioInspectorPopover(rect) {

  if (!studioInspectorPopover || studioInspectorPopover.hidden) {
    return;
  }

  const mapped =
    studioInspectorMapRect(rect);

  const bounds =
    studioInspectorStage
      ? studioInspectorStage.getBoundingClientRect()
      : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

  const size =
    studioInspectorPopover.getBoundingClientRect();

  const anchor =
    mapped || {
      left: bounds.left + 16,
      top: bounds.top + 16,
      width: 0,
      height: 0
    };

  let top =
    anchor.top + anchor.height + STUDIO_INSPECTOR_POPOVER_GAP;

  if (top + size.height > bounds.bottom - STUDIO_INSPECTOR_POPOVER_GAP) {

    const above =
      anchor.top - size.height - STUDIO_INSPECTOR_POPOVER_GAP;

    top =
      above >= bounds.top + STUDIO_INSPECTOR_POPOVER_GAP
        ? above
        : Math.max(
            bounds.top + STUDIO_INSPECTOR_POPOVER_GAP,
            bounds.bottom - size.height - STUDIO_INSPECTOR_POPOVER_GAP
          );

  }

  const left =
    Math.min(
      Math.max(anchor.left, bounds.left + STUDIO_INSPECTOR_POPOVER_GAP),
      Math.max(
        bounds.left + STUDIO_INSPECTOR_POPOVER_GAP,
        bounds.right - size.width - STUDIO_INSPECTOR_POPOVER_GAP
      )
    );

  studioInspectorPopover.style.left = `${left}px`;
  studioInspectorPopover.style.top = `${top}px`;

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
    paintStudioInspectorBox(studioInspectorSelectBox, studioInspectorSelection.rect);
    paintStudioInspectorHandles(studioInspectorSelection.rect);
    placeStudioInspectorPopover(studioInspectorSelection.rect);
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
