/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR + DIRECT EDIT (PHASE AI-6A/6B)

   Preview 안의 요소를 F12 Inspector처럼 직접 고르고, 간단한 수정은
   OpenAI를 전혀 부르지 않고 여기서 끝낸다.

   ★ 이 파일이 하는 일 — Inspector의 진입점과 lifecycle
     - Top Dock의 "Select" 토글(#studioInspectorButton)
     - 선택 상태의 **전이**: 고르기 / 해제하기 / 임시 상태 걷어내기
       (setStudioInspectorSelection / clearStudioInspectorSelection /
       clearStudioInspectorTransient)
     - iframe이 올려보낸 메시지 처리(handleStudioInspectorMessage)
     - 모드 켜고 끄기와 그때의 재렌더(setStudioInspectorEnabled /
       stampSkinForInspector)
     - Escape 처리
     - 바깥에서 쓰는 전역 창구(window.getStudioInspectorSelection 등)

   ★ 선택 상태의 **소유** — 바뀔 때마다 window 이벤트
     "studio-inspector-selection"을 쏘고, 값은 항상
     window.getStudioInspectorSelection()으로 읽게 한다
     (PHASE AI-6B, 요구사항 10절)

   ★ 이 파일이 하지 않는 일
     - OpenAI 호출 — "✦ AI 수정" 버튼도 패널을 열 뿐이다.
       실제 호출은 사용자가 문장을 쓰고 Send를 눌렀을 때
       studio/ai/studio-ai-panel.js가 한다(PHASE AI-6B)
     - AI 패널의 선택 chip — studio/ai/studio-ai-selection.js
     - 자동 Save(사용자가 Save를 눌러야만 DB에 간다)
     - 요소 식별/capability/CSS 규칙 계산 — 전부
       studio/inspector/studio-inspector-model.js(순수 함수)
     - iframe 안의 hit-test — studio/preview/preview-bridge.js
     - overlay 그리기 / 폼 그리기 / 확정 / 텍스트 / 이미지 크기 —
       아래 "파일 나누기"의 나머지 여섯 파일

   ★ Inspector가 꺼져 있을 때
     Preview로 나가는 skin은 지금까지와 byte 단위로 동일하고
     (stampSkinForInspector가 그대로 돌려준다), overlay는 hidden이며,
     iframe의 Inspector 리스너도 전부 첫 줄에서 빠져나간다. 즉 이번
     Phase는 "켰을 때만" 존재하는 기능이다(요구사항 1절).

   ★ 왜 Preview 안이 아니라 Studio overlay인가 (요구사항 6절)
     팝오버를 iframe 안에 그리면 (1) 스킨 CSS가 그 DOM에 영향을
     주고, (2) 스킨 HTML을 저장할 때 그 DOM이 섞여 들어갈 위험이
     생기며, (3) Preview가 Mobile 모드에서 scale()로 축소될 때
     컨트롤까지 같이 작아진다. Studio overlay는 셋 다 없다 —
     #studioPreviewBackButton이 이미 같은 이유로 stage 밖 형제로
     놓여 있다(studio/index.html 주석 참고).

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

   ★ 리스너는 파일마다 **한 번씩만** 등록된다(전부 top-level).
     이 파일: 토글 버튼 click, document keydown.
     overlay: window resize, stage ResizeObserver.
     image-size: document pointermove/up/cancel.
     overlay DOM 안쪽 리스너는 buildStudioInspectorLayer()가 달고,
     그 함수는 studioInspectorLayer가 이미 있으면 첫 줄에서
     빠져나간다 — 모드를 껐다 켜도 다시 달리지 않는다. 모드를 끌
     때 정리되는 것은 선택/임시 상태이고(clearStudioInspectorSelection),
     overlay는 hidden으로만 내려간다.

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   위 여섯 파일 전부, studio/inspector/studio-inspector-model.js,
   studio/studio-preview.js(applyStudioDirectEdit /
   postInspectorModeToFrame / showStudioToast / resolveCodeEditorSource /
   currentWorkingSkin / currentPreviewPageType),
   skin/skin-sanitize.js(sanitizeSkinHTML / isSafeSkinUrl),
   studio/preview/preview-navigation.js(renderCurrentPreviewEntry).
   studio/index.html 로드 순서 참고.
========================================================== */


/* 선택이 바뀌거나 모드를 끄거나 페이지가 바뀔 때 — 확정되지 않은
   것은 전부 여기서 사라진다. */
function clearStudioInspectorTransient() {

  if (studioInspectorDrag) {
    cancelStudioInspectorHandleDrag(null);
  }

  if (studioInspectorCropDrag) {
    finishStudioInspectorCropDrag(studioInspectorCropDrag);
  }

  studioInspectorTextDraft = null;
  studioInspectorComposing = false;
  studioInspectorSizeRange = null;
  studioInspectorSizeNumber = null;
  studioInspectorCropDraft = null;
  studioInspectorCropZoomRange = null;

  clearStudioInspectorPreview();

}


/* =========================================================
   선택 / hover 상태
========================================================== */

function clearStudioInspectorSelection() {

  /* 확정되지 않은 입력/드래그가 남아 있으면 먼저 걷어낸다 —
     선택이 사라진 뒤에 걷어내려 하면 어느 요소에 되돌릴지 알 수
     없다. */
  clearStudioInspectorTransient();

  studioInspectorSelection =
    null;

  studioInspectorEditingOpen =
    false;

  studioInspectorMetrics =
    null;

  studioInspectorResizable =
    false;

  paintStudioInspectorHandles(null);

  if (studioInspectorSelectBox) {
    studioInspectorSelectBox.hidden = true;
  }

  if (studioInspectorCropSurface) {
    studioInspectorCropSurface.hidden = true;
  }

  if (studioInspectorPopover) {
    studioInspectorPopover.hidden = true;
  }

  notifyStudioInspectorSelectionChanged();

  if (typeof window.postInspectorSelectionToFrame === "function") {
    window.postInspectorSelectionToFrame(null);
  }

}


function setStudioInspectorSelection(editId, tagName, rect, metrics) {

  if (!editId || !window.isValidInspectorEditId(editId)) {
    clearStudioInspectorSelection();
    return;
  }

  const isSameElement =
    !!studioInspectorSelection && studioInspectorSelection.editId === editId;

  /* 다른 요소로 옮겨가면 이전 요소에서 입력하던 값은 버린다 —
     "적용"을 누르지 않았으므로 확정된 적이 없다. */
  if (!isSameElement) {
    clearStudioInspectorTransient();
  }

  studioInspectorSelection = {
    editId,
    tagName: tagName || null,
    rect: rect || null
  };

  studioInspectorMetrics =
    metrics || null;

  /* 다른 요소를 새로 고르면 폼은 접힌 상태에서 시작한다 —
     팝오버가 곧바로 커다랗게 열려 Preview를 가리지 않게. */
  if (!isSameElement) {
    studioInspectorEditingOpen = false;
  }

  paintStudioInspectorBox(studioInspectorSelectBox, rect);

  renderStudioInspectorPopover();

}


/* =========================================================
   iframe -> Studio 메시지 (studio-preview.js가 그대로 넘겨준다)

   origin/source는 그쪽에서 이미 확인했다 — 여기서는 shape만 본다.
========================================================== */

function handleStudioInspectorMessage(data) {

  if (!studioInspectorEnabled) {
    return;
  }

  if (data.type === "preview:inspect-escape") {
    clearStudioInspectorSelection();
    return;
  }

  if (data.type === "preview:inspect-hover") {

    studioInspectorHover =
      data.rect || null;

    paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);

    return;

  }

  if (data.type === "preview:inspect-select") {

    setStudioInspectorSelection(
      data.editId,
      data.tagName,
      data.rect,
      data.metrics
    );

    return;

  }

  if (data.type === "preview:inspect-rects") {

    studioInspectorHover =
      (data.hover && data.hover.rect) || null;

    paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);

    if (!studioInspectorSelection) {
      return;
    }

    if (!data.selected || !data.selected.rect) {

      /* 재렌더 뒤 그 요소가 사라졌다(다른 페이지로 이동했거나
         스킨이 바뀌었다) — 선택을 유지하면 좌표 없는 팝오버만
         남으므로 정리한다. */
      clearStudioInspectorSelection();

      return;

    }

    studioInspectorSelection.rect =
      data.selected.rect;

    /* 임시 미리보기(입력 중/드래그 중)가 떠 있는 동안에는 실측값을
       받아들이지 않는다 — 지금 화면에 보이는 크기는 아직 확정된
       것이 아니라서, 그 값을 기준으로 삼으면 (1) 사용자의 손과
       숫자가 서로를 쫓아다니고 (2) "바뀐 게 없다"는 판정이 잘못
       나온다. 좌표(테두리/핸들)만 따라간다. */
    if (!studioInspectorDrag && !studioInspectorPreviewActive) {
      studioInspectorMetrics = data.selected.metrics || studioInspectorMetrics;
    }

    paintStudioInspectorBox(studioInspectorSelectBox, data.selected.rect);

    paintStudioInspectorHandles(data.selected.rect);

    placeStudioInspectorPopover(data.selected.rect);

    return;

  }

}


/* =========================================================
   Inspector 켜고 끄기

   켜고 끌 때마다 지금 화면을 다시 그린다 — Preview로 나가는
   skin에 임시 id를 넣고/빼야 하기 때문이다(postRenderToFrame의
   stampSkinForInspector). 재렌더 경로는 preview-navigation.js의
   renderCurrentPreviewEntry() 하나를 그대로 쓴다(새 렌더 분기를
   만들지 않는다).
========================================================== */

function setStudioInspectorEnabled(enabled) {

  const next =
    !!enabled && !!currentWorkingSkin;

  if (next === studioInspectorEnabled) {
    return;
  }

  studioInspectorEnabled =
    next;

  if (next) {
    buildStudioInspectorLayer();
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.hidden = !next;
  }

  if (!next) {

    clearStudioInspectorSelection();

    studioInspectorHover = null;
    studioInspectorUndo = null;

    if (studioInspectorHoverBox) {
      studioInspectorHoverBox.hidden = true;
    }

    studioInspectorHandles.forEach((handle) => {
      handle.hidden = true;
    });

  }

  if (studioInspectorToggleButton) {

    studioInspectorToggleButton.setAttribute(
      "aria-pressed",
      String(next)
    );

    studioInspectorToggleButton.classList.toggle(
      "studio-corner-button--active",
      next
    );

  }

  if (typeof window.postInspectorModeToFrame === "function") {
    window.postInspectorModeToFrame(next);
  }

  if (currentWorkingSkin && typeof renderCurrentPreviewEntry === "function") {
    renderCurrentPreviewEntry();
  }

}


function stampSkinForInspector(skin) {

  if (!studioInspectorEnabled || !skin || typeof skin.html !== "string") {
    return skin;
  }

  try {

    return {
      ...skin,
      html: window.stampInspectorEditIds(skin.html).html
    };

  } catch (err) {

    console.warn("[studio-inspector] stamp failed, rendering without edit ids", err);

    return skin;

  }

}


if (studioInspectorToggleButton) {

  studioInspectorToggleButton.addEventListener(
    "click",
    () => setStudioInspectorEnabled(!studioInspectorEnabled)
  );

}


/*
  Escape는 두 문서에서 모두 받는다 — 포커스가 Studio(팝오버 입력칸
  등)에 있을 때는 iframe의 keydown이 오지 않는다. 어느 쪽으로
  들어와도 처리는 여기 한 곳이다: 선택만 풀고 Inspector mode 자체는
  유지한다(요구사항 5절).
*/
document.addEventListener(
  "keydown",
  (event) => {

    if (!studioInspectorEnabled || event.key !== "Escape") {
      return;
    }

    /* 드래그 중 Escape는 "시작 전 크기로 되돌리기"다 —
       선택까지 풀어 버리면 사용자는 되돌아간 결과를 확인할 수
       없다(요구사항 3절). */
    if (studioInspectorDrag) {

      event.preventDefault();

      cancelStudioInspectorHandleDrag(null);

      return;

    }

    /* 자르기 드래그 중 Escape는 "끌기 시작 전 구도로 되돌리기"다 —
       모서리 드래그와 같은 결이다. */
    if (studioInspectorCropDrag) {

      event.preventDefault();

      cancelStudioInspectorCropDrag(null);

      return;

    }

    /* 자르기를 편집하던 중이면 그 임시 편집만 취소한다(선택과
       Inspector mode는 그대로) — 사용자가 되돌아간 결과를 바로
       확인할 수 있어야 한다. */
    if (studioInspectorCropDraft) {

      event.preventDefault();

      cancelStudioInspectorCropDraft();

      return;

    }

    /* 텍스트를 입력하던 중이면 그 입력만 취소한다. */
    if (studioInspectorTextDraft !== null) {

      event.preventDefault();

      cancelStudioInspectorTextDraft();

      return;

    }

    if (!studioInspectorSelection) {
      return;
    }

    clearStudioInspectorSelection();

  }
);


if (typeof window !== "undefined") {

  window.setStudioInspectorEnabled =
    setStudioInspectorEnabled;

  window.stampSkinForInspector =
    stampSkinForInspector;

  window.handleStudioInspectorMessage =
    handleStudioInspectorMessage;

  /* AI 패널의 선택 chip(×)이 부른다 — 선택 해제의 경로를
     Inspector 한 곳으로 유지하기 위해서다(요구사항 10절). */
  window.clearStudioInspectorSelection =
    clearStudioInspectorSelection;

  /* =========================================================
     선택 요소의 지금 상태. studio/ai/studio-ai-selection.js가
     이 값 하나로 chip 문구와 서버로 보낼 selectionContext를
     만든다(PHASE AI-6B) — 선택 상태의 복사본을 그쪽에 두지
     않기 위해, 필요할 때마다 여기서 다시 계산해 간다.

     여기 담기는 것은 전부 **현재 SkinPackage에서 다시 계산한**
     값이다. 스냅샷이 아니므로 Code Apply/Import/AI 적용 뒤에도
     옛 판단이 남지 않는다(describeStudioInspectorSelection 주석).
  ========================================================== */
  window.getStudioInspectorSelection =
    function () {

      const resolved =
        describeStudioInspectorSelection();

      if (!studioInspectorEnabled || !resolved) {
        return null;
      }

      return {
        pageType: currentPreviewPageType,
        editId: studioInspectorSelection.editId,
        tagName: resolved.info.tagName,
        kind: resolved.info.kind,
        label: studioInspectorLabelFor(resolved.info),
        classNames: resolved.info.classNames,
        bindPath: resolved.info.bindPath,
        srcPath: resolved.info.srcPath,
        hrefPath: resolved.info.hrefPath,
        region: resolved.info.region,
        isProtectedRegion: resolved.info.isProtectedRegion,
        isViewerBinding: resolved.info.isViewerBinding,
        repeatPath: resolved.info.repeatPath,
        isInsideRepeat: resolved.info.isInsideRepeat,
        text: resolved.info.text,
        imageSlot: resolved.info.imageSlot,
        capabilities: resolved.info.capabilities
      };

    };

  /* 테스트(studio/studio-inspector-e2e-test.mjs)가 내부 변수를
     들여다보지 않고도 상태를 확인할 수 있게 하는 읽기 전용 창구.
     production 코드는 이 전역을 참조하지 않는다. */
  window.getStudioInspectorState =
    function () {

      return {
        enabled: studioInspectorEnabled,
        editingOpen: studioInspectorEditingOpen,
        hasUndo: !!studioInspectorUndo,
        selection:
          studioInspectorSelection
            ? { ...studioInspectorSelection }
            : null,
        hover: studioInspectorHover ? { ...studioInspectorHover } : null,

        /* Select mode 직접 편집 라운드 — 확정되지 않은 상태.
           "취소/선택 해제 뒤에 임시 변경이 남지 않는다"를 테스트가
           내부 변수를 뒤지지 않고 확인할 수 있게 한다. */
        textDraft: studioInspectorTextDraft,
        composing: studioInspectorComposing,
        resizable: studioInspectorResizable,
        dragging: !!studioInspectorDrag,

        /* 이미지 자르기 라운드 — 확정 전 값. "취소/Escape/선택
           해제 뒤에 자르기 임시 편집이 남지 않는다"를 테스트가
           내부 변수를 뒤지지 않고 확인할 수 있게 한다. */
        cropDraft:
          studioInspectorCropDraft ? { ...studioInspectorCropDraft } : null,
        cropDragging: !!studioInspectorCropDrag,
        metrics: studioInspectorMetrics ? { ...studioInspectorMetrics } : null
      };

    };

}
