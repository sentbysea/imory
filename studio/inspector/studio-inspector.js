/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR + DIRECT EDIT (PHASE AI-6A/6B)

   Preview 안의 요소를 F12 Inspector처럼 직접 고르고, 간단한 수정은
   OpenAI를 전혀 부르지 않고 여기서 끝낸다.

   ★ 이 파일이 하는 일 — Inspector의 진입점과 lifecycle
     - Select 모드 켜고 끄기(버튼 클릭은 studio/studio-shell.js 가
       받아 이 파일의 setStudioInspectorEnabled 를 부른다)
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
     - OpenAI 호출 — Quick Bar 의 "AI로 수정"(예전 "✦ AI 수정")도
       패널을 열 뿐이다.
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
     이 파일: document keydown.
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

  if (studioInspectorCropSideDrag) {
    finishStudioInspectorCropSideDrag(studioInspectorCropSideDrag);
  }

  studioInspectorTextDraft = null;
  studioInspectorComposing = false;
  studioInspectorSizeRange = null;
  studioInspectorSizeNumber = null;
  studioInspectorCropDraft = null;
  studioInspectorCropZoomRange = null;
  studioInspectorCropLimitNote = null;

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

  studioInspectorBoxResizable =
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

  if (studioInspectorSelectLabel) {
    studioInspectorSelectLabel.hidden = true;
  }

  /* DIRECT-UX-1 — Quick Bar · 겹친 요소 메뉴 · 프레임에 알려 둔
     "끌 수 있다/글자를 고칠 수 있다"도 함께 걷는다 */
  if (typeof renderStudioInspectorQuickBar === "function") {
    renderStudioInspectorQuickBar(null, true);
  }

  if (typeof hideStudioInspectorPickMenu === "function") {
    hideStudioInspectorPickMenu();
  }

  notifyStudioInspectorSelectionChanged();

  if (typeof window.postInspectorSelectionToFrame === "function") {
    window.postInspectorSelectionToFrame(null);
  }

  if (typeof window.postInspectorCapsToFrame === "function") {
    window.postInspectorCapsToFrame(null);
  }

}


/* 레이아웃 사각형보다 실제로 보이는 자리가 작으면 조상이 잘라내고
   있다는 뜻이다. 1px은 반올림 여유다. */
function studioInspectorRectIsClipped(selection) {

  if (!selection || !selection.rect || !selection.visibleRect) {
    return false;
  }

  return (
    selection.visibleRect.width < selection.rect.width - 1 ||
    selection.visibleRect.height < selection.rect.height - 1
  );

}


/* =========================================================
   studioInspectorEditIdExistsInDraft(editId) -> boolean

   SANDBOX-6A. "그 식별자를 가진 요소가 **지금 draft 의 이 페이지
   template 에** 실제로 있는가."

   describeStudioInspectorSelection() 과 같은 방식으로 본다 —
   지금 SkinPackage 를 파싱해서 그 id 를 찾는다. 스냅샷을 믿지
   않으므로 Code Apply / Import / AI 적용 뒤에도 옛 판단이 남지
   않는다.

   ★ 여기서 stamp 를 한 번 더 하는 것이 핵심이다. Inspector 의
     임시 id 는 SkinPackage 에 남지 않으므로(studio-inspector-model.js
     commitInspectorEditId), 원본 html 을 그냥 뒤지면 아직 한 번도
     편집하지 않은 요소의 id 는 하나도 찾을 수 없다.
========================================================== */

function studioInspectorDraftElement(editId) {

  if (!window.isValidInspectorEditId(editId)) {
    return null;
  }

  const source =
    studioInspectorTemplateSource();

  if (!source || typeof source.html !== "string") {
    return null;
  }

  let stamped;

  try {
    stamped = window.stampInspectorEditIds(source.html);
  }
  catch (err) {
    return null;
  }

  return stamped.doc.body.querySelector(
    `[data-imory-edit-id="${editId}"]`
  );

}


function studioInspectorEditIdExistsInDraft(editId) {

  return !!studioInspectorDraftElement(editId);

}


/* =========================================================
   studioInspectorSelectionFingerprint(editId)

   고르는 **그 순간** 그 요소가 어떤 요소였는지의 요약을 남긴다.
   나중에 되살릴 때 이 값과 대조한다
   (studio-inspector-model.js resolveInspectorSelectionTarget).

   ★ 지금 draft 에서 계산한다 — 프레임이 보낸 값이 아니다. 그래서
     native 든 sandbox 든 같은 값이 나오고, 프레임이 지문을 위조할
     길도 없다.

   ★ (2026-09-17 보완) 값은 그 요소 하나의 지문이 아니라 **자리와
     속까지 담은 세 겹**이다(inspectorSelectionSignature). 완전히
     같은 형제가 여럿일 때 지문만으로는 "형제 하나가 지워져 뒤가
     자리를 물려받은" 경우를 가릴 수 없기 때문이다.
========================================================== */

function studioInspectorSelectionFingerprint(editId) {

  const element =
    studioInspectorDraftElement(editId);

  return element
    ? window.inspectorSelectionSignature(element)
    : "";

}


/* =========================================================
   reconcileStudioInspectorSelection()

   working draft 가 바뀔 때마다 한 번 부른다(studio-preview.js
   bumpStudioWorkingRevision — Direct Edit · Code Apply · Import ·
   AI 적용 · 되돌리기 · 이미지 슬롯 · remount 가 전부 그 한 곳을
   지난다).

   고른 요소를 **같은 요소라고 말할 근거가 남아 있으면** 아무 일도
   하지 않고, 없으면 조용히 푼다. 오류가 아니라 정상 fallback이다 —
   토스트도 띄우지 않는다(사용자가 방금 한 일은 성공했고, 선택이
   풀린 것은 그 결과일 뿐이다).

   ★ 왜 여기서 한 번 더 푸는가
   describeStudioInspectorSelection() 이 null 을 주면 팝오버는
   이미 숨고 getStudioInspectorSelection() 도 null 이다. 하지만
   studioInspectorSelection 자체는 남아 있어서, sandbox 프레임에는
   테두리가 그대로 떠 있고 rects 메시지도 계속 오간다. 상태를 실제로
   걷어내야 프레임까지 정리된다(clearStudioInspectorSelection 이
   프레임에 해제를 내려보낸다).
========================================================== */

function reconcileStudioInspectorSelection() {

  if (!studioInspectorEnabled || !studioInspectorSelection) {
    return;
  }

  if (describeStudioInspectorSelection()) {
    return;
  }

  studioInspectorLastLostReason =
    studioInspectorSelection.lostReason || "gone";

  console.info(
    "[studio-inspector] 선택을 유지할 근거가 없어 해제합니다",
    { reason: studioInspectorLastLostReason }
  );

  clearStudioInspectorSelection();

}


function setStudioInspectorSelection(editId, tagName, rect, metrics, visibleRect) {

  if (!editId || !window.isValidInspectorEditId(editId)) {
    clearStudioInspectorSelection();
    return;
  }

  /* 새로 고르면 "왜 못 되살렸는가"의 기록은 지운다 */
  studioInspectorLastLostReason =
    "";

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
    rect: rect || null,

    /* =====================================================
       고르는 순간의 지문. 나중에 "이 id 가 여전히 그 요소인가"를
       이 값 하나로 판정한다(studio-inspector-model.js
       resolveInspectorSelectionTarget). 지금 draft 에서 계산하므로
       native 와 sandbox 가 같은 값을 갖는다.
    ====================================================== */
    fingerprint: studioInspectorSelectionFingerprint(editId),

    /* 되살리지 못한 이유(진단·테스트용) */
    lostReason: "",

    /* 조상 overflow까지 반영한 "실제로 보이는" 사각형.
       테두리·핸들·자르기 드래그 판은 이 값을 쓴다 — rect는
       레이아웃 사각형이라 부모가 overflow: hidden으로 잘라내면
       화면에 없는 자리를 가리킨다(preview-bridge.js
       inspectorVisibleRectOf 머리말). 잘라내는 조상이 없으면
       둘은 같은 값이다. */
    visibleRect: visibleRect || rect || null
  };

  studioInspectorMetrics =
    metrics || null;

  studioInspectorClipped =
    studioInspectorRectIsClipped(studioInspectorSelection);

  /* 다른 요소를 새로 고르면 폼은 접힌 상태에서 시작한다 —
     팝오버가 곧바로 커다랗게 열려 Preview를 가리지 않게. */
  if (!isSameElement) {
    studioInspectorEditingOpen = false;
  }

  /* STUDIO-SHELL-1 — 고른 요소의 내용은 왼쪽 패널에 있다. 패널이
     접혀 있거나 Images/Dock 을 보여 주고 있으면 Select 로 돌린다
     (studio/studio-shell.js). 이 함수는 사용자의 클릭/탭에서 온
     select 메시지로만 불린다 — 좌표 갱신(rects)은 이 길을 지나지
     않으므로 사용자가 접어 둔 패널이 저절로 열리지 않는다. 같은
     요소를 다시 누른 것도 "그 내용을 보여 달라"로 본다. */
  if (typeof window.revealStudioLeftPanelForSelection === "function") {
    window.revealStudioLeftPanelForSelection({ sameElement: isSameElement });
  }

  /* SANDBOX-6A — 프레임이 테두리를 그린 경우에는 여기서 또 그리지
     않는다(studio-inspector-state.js studioInspectorRemoteOverlay). */
  if (studioInspectorRemoteOverlay) {

    if (studioInspectorSelectBox) {
      studioInspectorSelectBox.hidden = true;
    }

  }

  else {

    paintStudioInspectorBox(
      studioInspectorSelectBox,
      studioInspectorSelection.visibleRect
    );

  }

  renderStudioInspectorPopover();

}


/* =========================================================
   studioInspectorAcceptRemoteText(data) -> boolean

   SANDBOX-SELECT-PARITY-1. sandbox 프레임 realm 에서는 저자 JS 가
   돈다 — 그 코드가 글자 편집 메시지를 **쏠 수 있다고 가정한다**.
   그래서 프레임의 글자 확정은 다음을 모두 만족할 때만 받는다:

     1. "begin" 이 먼저 왔다 — 지금 고른 요소이고, draft 에서 그
        요소의 글자를 고칠 수 있다(capabilities.text).
     2. input / commit / cancel 은 그 begin 과 같은 식별자다.

   그래도 확정되는 것은 "고른 정적 글자 하나의 textContent"뿐이고
   (commitStudioInspectorText), ↶ 한 칸으로 되돌릴 수 있다. HTML ·
   속성 · 다른 요소에는 닿지 않는다.
========================================================== */

let studioInspectorRemoteTextEditId = null;


function studioInspectorAcceptRemoteText(data) {

  if (!studioInspectorSelection || data.editId !== studioInspectorSelection.editId) {
    return false;
  }

  if (data.phase === "begin") {

    const resolved =
      describeStudioInspectorSelection();

    studioInspectorRemoteTextEditId =
      (resolved && resolved.info.capabilities.text === true) ? data.editId : null;

    return !!studioInspectorRemoteTextEditId;

  }

  if (studioInspectorRemoteTextEditId !== data.editId) {
    return false;
  }

  if (data.phase === "commit" || data.phase === "cancel") {
    studioInspectorRemoteTextEditId = null;
  }

  return true;

}


/* =========================================================
   iframe -> Studio 메시지 (studio-preview.js가 그대로 넘겨준다)

   origin/source는 그쪽에서 이미 확인했다 — 여기서는 shape만 본다.
========================================================== */

function handleStudioInspectorMessage(data) {

  if (!studioInspectorEnabled) {
    return;
  }

  /* =====================================================
     SANDBOX-6A — 이 메시지가 프레임에서 왔는가

     왔다면 hover/선택 테두리는 프레임 안에 이미 그려져 있다.
     이 문서는 팝오버만 맡는다(studio-inspector-state.js
     studioInspectorRemoteOverlay 주석).

     native 메시지에는 이 칸이 없으므로 false 로 돌아간다 —
     같은 세션에서 sandbox 스킨을 native 스킨으로 바꿔도
     테두리가 사라진 채 남지 않는다.
  ====================================================== */

  studioInspectorRemoteOverlay =
    data.remote === true;

  if (studioInspectorRemoteOverlay) {

    if (studioInspectorHoverBox) {
      studioInspectorHoverBox.hidden = true;
    }

    if (studioInspectorSelectBox) {
      studioInspectorSelectBox.hidden = true;
    }

  }

  if (data.type === "preview:inspect-escape") {

    /* MOBILE-SHEET-1 — 좁은 화면에서 시트가 펼쳐져 있으면 Escape 는
       먼저 시트를 한 단계 내린다(전체 → 내용 → 접힘). 접힘에서의
       Escape 가 예전처럼 선택 해제다. */
    if (typeof window.consumeStudioSheetEscape === "function" && window.consumeStudioSheetEscape()) {
      return;
    }

    clearStudioInspectorSelection();
    return;

  }

  if (data.type === "preview:inspect-hover") {

    studioInspectorHover =
      data.visibleRect || data.rect || null;

    studioInspectorHoverEditId =
      (studioInspectorHover && window.isValidInspectorEditId(data.editId)) ? data.editId : null;

    if (!studioInspectorRemoteOverlay) {
      paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);
    }

    if (typeof paintStudioInspectorHoverLabel === "function") {
      paintStudioInspectorHoverLabel(studioInspectorHover, studioInspectorHoverEditId);
    }

    return;

  }

  /* =====================================================
     DIRECT-UX-1 — 프레임이 올린 직접 조작
       inspect-pick  한 자리에 겹친 후보들 → "무엇을 선택할까요?"
       inspect-text  더블클릭 글자 편집의 시작/입력/적용/취소
       inspect-drag  자유 배치 요소의 본체 끌기
     (studio/preview/preview-inspect-direct.js)
  ====================================================== */

  /* SANDBOX-SELECT-PARITY-1 — sandbox 프레임(remote)에서 온 것도 같은
     함수를 탄다. 한 겹씩 더 거르는 자리:
       pick  메뉴는 draft 에 실제로 있는 식별자로만 칸을 만든다
             (showStudioInspectorPickMenu).
       text  이 문서가 "그 요소를 고치기 시작했다"를 받아 둔 경우에만
             입력 · 확정을 받는다(아래 studioInspectorRemoteTextEditId).
             확정은 draft 에서 capabilities.text 를 한 번 더 본다.
       drag  draft 에서 정한 studioInspectorMovable 이 참일 때만. */

  if (data.type === "preview:inspect-pick") {

    if (typeof showStudioInspectorPickMenu === "function") {
      showStudioInspectorPickMenu(data);
    }

    return;

  }

  if (data.type === "preview:inspect-text") {

    if (studioInspectorRemoteOverlay && !studioInspectorAcceptRemoteText(data)) {
      return;
    }

    if (typeof handleStudioInspectorInlineText === "function") {
      handleStudioInspectorInlineText(data);
    }

    return;

  }

  if (data.type === "preview:inspect-drag") {

    if (typeof handleStudioInspectorFrameDrag === "function") {
      handleStudioInspectorFrameDrag(data);
    }

    return;

  }

  if (data.type === "preview:inspect-select") {

    /* =====================================================
       ★ 위조 선택 거부 (SANDBOX-6A 요구사항 9절)

       프레임 안에서는 스킨 저자의 JS 가 돈다. 그 코드가 부모에
       메시지를 쏠 수는 없지만(봉투·origin·source 검사), "프레임이
       무엇이든 보낼 수 있다"고 **가정하고** 한 겹 더 둔다:

       지금 draft 의 이 페이지 template 에 그 식별자를 가진 요소가
       **실제로 있는가**. 없으면 선택 자체를 만들지 않는다 —
       팝오버도, AI 선택 chip 도, selectionContext 도 생기지 않는다.

       native 경로는 지금까지처럼 그대로 둔다(remote 가 아닐 때는
       이 관문을 지나지 않는다) — 그 메시지는 같은 origin 의 같은
       스킨 DOM 에서 온 것이고, 이 라운드가 바꾸지 않기로 한 흐름이다.
    ====================================================== */

    if (
      studioInspectorRemoteOverlay &&
      data.editId &&
      !studioInspectorEditIdExistsInDraft(data.editId)
    ) {

      console.warn(
        "[studio-inspector] 프레임이 보낸 선택이 지금 template 에 없습니다 — 무시합니다."
      );

      return;

    }

    setStudioInspectorSelection(
      data.editId,
      data.tagName,
      data.rect,
      data.metrics,
      data.visibleRect
    );

    return;

  }

  if (data.type === "preview:inspect-rects") {

    studioInspectorHover =
      (data.hover && (data.hover.visibleRect || data.hover.rect)) || null;

    studioInspectorHoverEditId =
      (studioInspectorHover && data.hover && window.isValidInspectorEditId(data.hover.editId))
        ? data.hover.editId
        : null;

    if (!studioInspectorRemoteOverlay) {
      paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);
    }

    if (typeof paintStudioInspectorHoverLabel === "function") {
      paintStudioInspectorHoverLabel(studioInspectorHover, studioInspectorHoverEditId);
    }

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

    studioInspectorSelection.visibleRect =
      data.selected.visibleRect || data.selected.rect;

    const clipped =
      studioInspectorRectIsClipped(studioInspectorSelection);

    /* 자르는 동안 비율을 바꾸면 프레임이 커지면서 바깥 상자에 잘리기
       시작할 수 있다 — 그 사실이 뒤집힐 때만 폼을 다시 그린다.
       (매 좌표 갱신마다 다시 그리면 지금 잡고 있는 슬라이더가 통째로
       교체된다. 드래그 중에는 아예 손대지 않는다.) */
    if (clipped !== studioInspectorClipped) {

      studioInspectorClipped = clipped;

      if (studioInspectorCropDraft && !studioInspectorCropDrag) {
        renderStudioInspectorPopover();
      }

    }

    /* 임시 미리보기(입력 중/드래그 중)가 떠 있는 동안에는 실측값을
       받아들이지 않는다 — 지금 화면에 보이는 크기는 아직 확정된
       것이 아니라서, 그 값을 기준으로 삼으면 (1) 사용자의 손과
       숫자가 서로를 쫓아다니고 (2) "바뀐 게 없다"는 판정이 잘못
       나온다. 좌표(테두리/핸들)만 따라간다. */
    if (!studioInspectorDrag && !studioInspectorPreviewActive) {
      studioInspectorMetrics = data.selected.metrics || studioInspectorMetrics;
    }

    if (!studioInspectorRemoteOverlay) {

      paintStudioInspectorBox(
        studioInspectorSelectBox,
        studioInspectorSelection.visibleRect
      );

      paintStudioInspectorHandles(
        data.selected.rect,
        studioInspectorSelection.visibleRect
      );

    }

    /* 이름표는 테두리를 따라간다(STUDIO-SHELL-1). 팝오버는 왼쪽
       패널 안에 있으므로 좌표 갱신으로 움직이지 않는다 — 손이
       잡고 있는 슬라이더가 도망가는 일이 원천적으로 없다. */
    paintStudioInspectorSelectLabel(studioInspectorSelection.visibleRect);

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
    studioInspectorHoverEditId = null;
    studioInspectorUndo = null;

    if (studioInspectorHoverBox) {
      studioInspectorHoverBox.hidden = true;
    }

    if (typeof paintStudioInspectorHoverLabel === "function") {
      paintStudioInspectorHoverLabel(null, null);
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

    /* DIRECT-UX-1 — 숨긴 요소는 Select 모드 Preview 에서만 흐리게
       보인다(다시 골라 "보이기"로 돌릴 수 있어야 한다). working
       draft 는 그대로다 — 이 사본은 Preview 로만 나간다. */
    return {
      ...skin,
      html: window.stampInspectorEditIds(skin.html).html,
      css:
        typeof studioInspectorGhostHiddenCss === "function"
          ? studioInspectorGhostHiddenCss(skin.css)
          : skin.css
    };

  } catch (err) {

    console.warn("[studio-inspector] stamp failed, rendering without edit ids", err);

    return skin;

  }

}


/*
  STUDIO-SHELL-1 — Top Dock 의 Select 클릭은 studio/studio-shell.js 가
  받는다. Select 는 이제 "모드 켜고 끄기"이면서 동시에 왼쪽 패널의
  한 내용이라, Images/Dock 을 보다가 누르면 모드를 끄지 않고 패널만
  Select 로 돌린다(그래야 고른 요소가 남는다). 켜고 끄는 일 자체는
  여전히 이 파일의 setStudioInspectorEnabled() 하나다.
*/


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

    /* DIRECT-UX-1 — "무엇을 선택할까요?" 메뉴가 떠 있으면 메뉴만 닫는다 */
    if (typeof isStudioInspectorPickMenuOpen === "function" && isStudioInspectorPickMenuOpen()) {

      event.preventDefault();

      hideStudioInspectorPickMenu();

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

    /* 자유 비율로 변을 끄는 중이면 "끌기 시작 전 프레임"으로
       되돌린다 — 자르기 편집 자체는 열린 채로 둔다. */
    if (studioInspectorCropSideDrag) {

      event.preventDefault();

      cancelStudioInspectorCropSideDrag(null);

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
     working draft 가 바뀔 때마다 studio-preview.js 의
     bumpStudioWorkingRevision() 이 부른다 — 그 한 곳이 Direct Edit ·
     Code Apply · Import · AI 적용 · 되돌리기 · 이미지 슬롯 ·
     remount 의 공통 관문이다.
  ========================================================== */
  window.reconcileStudioInspectorSelection =
    reconcileStudioInspectorSelection;

  /* 선택 요소 AI 가 응답 적용 직전에 하는 "그 요소가 지금도 그
     요소인가"는 **살아 있는 선택**이 아니라 지금 draft 를 본다 —
     studio/ai/studio-ai-selection.js studioAiSelectionTargetIsIntact.
     요청의 타깃은 전송 시점 snapshot 이므로, 기다리는 사이 사용자가
     다른 요소를 골랐다고 그 요청이 틀려지지는 않는다. */

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

        /* =====================================================
           고른 순간의 지문. 선택 요소 AI 가 **전송 시점 snapshot**
           으로 들고 있다가, 응답을 적용하기 직전에 "그 요소가 지금도
           그 요소인가"를 확인하는 데 쓴다
           (studio/ai/studio-ai-selection.js
            studioAiSelectionTargetIsIntact).

           ★ 서버로는 가지 않는다 — selectionContext 는
           buildStudioAiSelectionContext() 가 필드를 하나씩 적어
           만들고, 그 목록에 이 값은 없다.
        ====================================================== */
        fingerprint: studioInspectorSelection.fingerprint || "",

        tagName: resolved.info.tagName,
        kind: resolved.info.kind,
        label: studioInspectorLabelFor(resolved.info, resolved.element),

        /* DIRECT-UX-1 — 사람이 읽는 이름과 종류(studio-inspector-names.js).
           AI chip · selectionContext.label 이 이 값을 쓴다. */
        name: studioInspectorLabelFor(resolved.info, resolved.element),
        kindName: studioInspectorKindName(resolved.element, resolved.info),
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

        /* 마지막으로 선택을 되살리지 못한 이유 — "gone" /
           "no-evidence" / "mismatch". 선택이 풀린 뒤에도 남는다
           (그때 selection 은 null 이라 거기 담아 두면 읽을 수 없다). */
        lostReason: studioInspectorLastLostReason,

        /* Select mode 직접 편집 라운드 — 확정되지 않은 상태.
           "취소/선택 해제 뒤에 임시 변경이 남지 않는다"를 테스트가
           내부 변수를 뒤지지 않고 확인할 수 있게 한다. */
        textDraft: studioInspectorTextDraft,
        composing: studioInspectorComposing,
        resizable: studioInspectorResizable,
        dragging: !!studioInspectorDrag,

        /* COMMON-SELECT-BOX-1 — 이미지가 아닌 상자의 크기 조절.
           손잡이는 같은 자리지만 주인이 다르다(위 resizable 은
           이미지, 이쪽은 상자). 끄는 중인지도 함께 본다. */
        boxResizable: studioInspectorBoxResizable,
        boxDragging: !!studioInspectorBoxDrag,

        /* 이미지 자르기 라운드 — 확정 전 값. "취소/Escape/선택
           해제 뒤에 자르기 임시 편집이 남지 않는다"를 테스트가
           내부 변수를 뒤지지 않고 확인할 수 있게 한다. */
        cropDraft:
          studioInspectorCropDraft ? { ...studioInspectorCropDraft } : null,
        cropDragging: !!studioInspectorCropDrag,

        /* 자유 비율 라운드 — 변/모서리를 끄는 중인가. */
        cropSizing: !!studioInspectorCropSideDrag,
        cropSizingEdge:
          studioInspectorCropSideDrag ? studioInspectorCropSideDrag.edge : null,

        /* 확대 상한에 걸려 프레임이 멈춰 있는가(안내가 떠 있는가) */
        cropLimited: studioInspectorCropLimited,
        metrics: studioInspectorMetrics ? { ...studioInspectorMetrics } : null
      };

    };

}
