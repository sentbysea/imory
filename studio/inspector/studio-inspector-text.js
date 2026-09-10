/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 텍스트 내용 직접 편집

   "입력 중"과 "확정"을 자로 자르듯 나눈 쪽이다.

     renderStudioInspectorTextBlock()  textarea + 적용/취소 버튼
     sendStudioInspectorTextPreview()  입력 중 → Preview에만 임시 반영
     commitStudioInspectorTextDraft()  적용 → 편집 한 번으로 확정
     cancelStudioInspectorTextDraft()  취소 → 임시 반영을 걷어낸다
     commitStudioInspectorText()       실제 확정(HTML + white-space CSS)

   ★ 입력 중인 문자열은 studioInspectorTextDraft 하나뿐이고
     (studio-inspector-state.js), SkinPackage에도 dirty에도 Undo에도
     들어가지 않는다. 선택이 바뀌거나 취소하면 흔적 없이 사라진다
     (studio-inspector.js의 clearStudioInspectorTransient).

   ★ 이렇게 나눈 이유는 IME다 — 자세한 내용은 아래
     renderStudioInspectorTextBlock() 머리말.

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
   studio/inspector/studio-inspector-edit.js
   (applyStudioInspectorPatch / mergeStudioInspectorDeclarations).
========================================================== */


/* =========================================================
   텍스트 내용 블록 (Select mode 직접 편집 라운드)

   한 줄 input이 아니라 textarea다 — 스킨 문구는 두 줄짜리 인사말
   처럼 줄을 나누고 싶은 경우가 흔하다. 그리고 **입력 중에는 아무
   것도 확정하지 않는다**:

     입력 → Preview에만 임시 반영(postInspectorPreviewToFrame)
     적용 → 한 번의 편집으로 확정(= Undo 한 번으로 복원)
     취소 → 임시 반영을 걷어내고 원래 문구로 되돌린다

   이렇게 나눈 이유가 IME다. 예전처럼 글자마다 SkinPackage를 고치면
   그때마다 스킨 전체가 다시 그려지고, 그 사이에 있는 textarea는
   새로 만들어진다 — 한글 조합 중이면 조합이 끊기고 커서가 튄다.
   조합 중(compositionstart~end)에는 미리보기조차 보내지 않는다.
========================================================== */

function renderStudioInspectorTextBlock(spec, info) {

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    spec.label;

  const input =
    document.createElement("textarea");

  input.className =
    "studio-inspector-textarea";

  input.id =
    "studioInspectorTextInput";

  input.rows =
    3;

  input.dataset.inspectorControl =
    "text";

  /* 폼이 다시 그려져도(다른 컨트롤을 만졌다든가) 입력 중이던 값은
     잃지 않는다. */
  input.value =
    studioInspectorTextDraft === null
      ? (info.text || "")
      : studioInspectorTextDraft;

  input.addEventListener("compositionstart", () => {
    studioInspectorComposing = true;
  });

  input.addEventListener("compositionend", () => {
    studioInspectorComposing = false;
    studioInspectorTextDraft = input.value;
    sendStudioInspectorTextPreview();
  });

  input.addEventListener("input", () => {

    studioInspectorTextDraft =
      input.value;

    if (studioInspectorComposing) {
      return;
    }

    sendStudioInspectorTextPreview();

  });

  const actions =
    document.createElement("div");

  actions.className =
    "studio-inspector-block-actions";

  const apply =
    document.createElement("button");

  apply.type = "button";
  apply.className = "studio-inspector-block-button studio-inspector-block-button--primary";
  apply.id = "studioInspectorTextApply";
  apply.textContent = "적용";

  apply.addEventListener("click", commitStudioInspectorTextDraft);

  const cancel =
    document.createElement("button");

  cancel.type = "button";
  cancel.className = "studio-inspector-block-button";
  cancel.id = "studioInspectorTextCancel";
  cancel.textContent = "취소";

  cancel.addEventListener("click", cancelStudioInspectorTextDraft);

  actions.appendChild(apply);
  actions.appendChild(cancel);

  block.appendChild(caption);
  block.appendChild(input);
  block.appendChild(actions);

  studioInspectorFields.appendChild(block);

  /* 입력하던 중에 다른 컨트롤을 만져 폼이 다시 그려졌다면(그때
     스킨이 재렌더되면서 임시 반영이 사라진다) 미리보기를 다시
     보낸다 — 입력칸과 화면이 서로 다른 문구를 보이지 않게. */
  if (studioInspectorTextDraft !== null) {
    sendStudioInspectorTextPreview();
  }

}


function commitStudioInspectorText(value) {

  const text =
    String(value);

  return applyStudioInspectorPatch((element, css) => {

    /* textContent만 쓴다 — 사용자가 무엇을 입력하든 마크업으로
       해석되지 않는다(skin-render.js의 데이터 주입 원칙과 동일). */
    element.textContent =
      text;

    /* 줄바꿈은 textContent 안에 그대로 들어가지만, HTML에서는 그냥
       공백으로 접힌다 — 저장 후 다시 불러와도 화면에 남게 하려면
       white-space를 함께 올려야 한다(= 규칙 하나가 더 붙는다).
       한 줄로 되돌리면 그 규칙도 같이 사라진다. */
    return {
      css: mergeStudioInspectorDeclarations(
        css,
        studioInspectorSelection.editId,
        "whiteSpace",
        text.indexOf("\n") === -1 ? "" : "pre-wrap"
      )
    };

  });

}


function sendStudioInspectorTextPreview() {

  if (!studioInspectorSelection || studioInspectorTextDraft === null) {
    return;
  }

  sendStudioInspectorPreview({
    editId: studioInspectorSelection.editId,
    text: studioInspectorTextDraft
  });

}


function commitStudioInspectorTextDraft() {

  if (!studioInspectorSelection || studioInspectorTextDraft === null) {
    return;
  }

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return;
  }

  const value =
    studioInspectorTextDraft;

  studioInspectorTextDraft =
    null;

  studioInspectorComposing =
    false;

  /* 내용이 그대로면 편집 이력을 만들지 않는다. */
  if (value === (resolved.info.text || "")) {

    clearStudioInspectorPreview();

    renderStudioInspectorPopover();

    return;

  }

  clearStudioInspectorPreview();

  if (commitStudioInspectorText(value)) {
    showStudioToast("문구를 바꿨어요.");
  }

}


function cancelStudioInspectorTextDraft() {

  studioInspectorTextDraft =
    null;

  studioInspectorComposing =
    false;

  clearStudioInspectorPreview();

  /* 폼을 다시 그리면 textarea가 원래 문구로 채워진다. */
  renderStudioInspectorPopover();

}
