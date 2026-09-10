/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 확정 경로

   직접 수정이 SkinPackage에 **실제로 반영되는** 유일한 길이다
   (요구사항 13절 "state mutation 경로를 한 곳으로").

     applyStudioInspectorPatch()   모든 확정이 지나는 한 함수
     mergeStudioInspectorDeclarations()  이 요소의 CSS 규칙 한 줄만 갈아끼우기
     commitStudioInspectorHref()   링크 주소
     commitStudioInspectorStyle()  나머지 스타일 컨트롤 전부
     undoStudioInspectorEdit()     직전 한 벌로 되돌리기

   ★ 텍스트 확정(commitStudioInspectorText)은 여기 없다 —
     HTML과 CSS를 한 번에 바꿔야 하고 그 이유가 텍스트 고유라서
     studio-inspector-text.js가 갖는다. 크기 확정
     (commitStudioInspectorSize)도 마찬가지로
     studio-inspector-image-size.js에 있다. 둘 다 결국 이 파일의
     applyStudioInspectorPatch() / commitStudioInspectorStyle()을
     지난다.

   ★ 임시 미리보기는 이 파일을 지나지 않는다(그래서 저장되지
     않는다) — studio-inspector-state.js의 sendStudioInspectorPreview().

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
   studio/inspector/studio-inspector-state.js. 호출 시점 의존:
   studio/studio-preview.js(applyStudioDirectEdit / showStudioToast),
   skin/skin-sanitize.js(sanitizeSkinHTML / isSafeSkinUrl),
   studio-inspector-model.js(buildInspectorStylePatch /
   writeInspectorEditDeclarations / commitInspectorEditId).
========================================================== */


/* =========================================================
   DIRECT EDIT 적용

   모든 수정이 이 함수 하나를 지난다(요구사항 13절 "state mutation
   경로를 한 곳으로"). 하는 일 순서:

     1. 지금 template을 stamp해서 대상 요소를 찾는다
     2. patch(요소를 고치거나 css를 바꾼다)
     3. 임시 id를 전부 걷어내고 **이 요소의 id만** 남긴다
     4. sanitize -> applyStudioDirectEdit(= Code Apply와 같은 경로)

   실패하면 working draft는 한 글자도 바뀌지 않는다 — 3단계까지는
   전부 파싱된 사본 위에서만 일어나고, 실제 반영은 4단계 한 번뿐
   이기 때문이다.
========================================================== */

function applyStudioInspectorPatch(patch) {

  if (!studioInspectorSelection || !currentWorkingSkin) {
    return false;
  }

  const pageType =
    currentPreviewPageType;

  const source =
    studioInspectorTemplateSource();

  if (!source) {
    return false;
  }

  const editId =
    studioInspectorSelection.editId;

  const stamped =
    window.stampInspectorEditIds(source.html);

  const element =
    stamped.doc.body.querySelector(`[data-imory-edit-id="${editId}"]`);

  if (!element) {

    showStudioToast("선택한 요소를 더 이상 찾을 수 없어요.", { isError: true });

    clearStudioInspectorSelection();

    return false;

  }

  let nextCss =
    source.css;

  const result =
    patch(element, source.css) || {};

  if (typeof result.css === "string") {
    nextCss = result.css;
  }

  const nextHtml =
    window.commitInspectorEditId(stamped, editId);

  const snapshot = {
    pageType,
    html: source.html,
    css: source.css
  };

  try {

    window.applyStudioDirectEdit(
      pageType,
      sanitizeSkinHTML(nextHtml),
      nextCss
    );

  } catch (err) {

    console.error("[studio-inspector] direct edit failed", err);

    showStudioToast(
      err?.message || "직접 수정을 적용하지 못했어요.",
      { isError: true }
    );

    return false;

  }

  studioInspectorUndo =
    snapshot;

  renderStudioInspectorPopover();

  return true;

}



/* 지금 규칙에 이 컨트롤의 값만 덮어쓴 CSS 문자열을 만든다.
   commitStudioInspectorStyle()과 같은 계산을 두 번 쓰지 않으려고
   따로 뺐다 — 텍스트 확정은 HTML과 CSS를 **한 번에** 바꿔야 하기
   때문이다(줄바꿈 유지용 white-space). */
function mergeStudioInspectorDeclarations(css, editId, control, value) {

  const declarations =
    window.readInspectorEditDeclarations(css, editId);

  const patch =
    window.buildInspectorStylePatch(control, value);

  Object.keys(patch).forEach((property) => {

    if (patch[property] === null) {
      delete declarations[property];
    } else {
      declarations[property] = patch[property];
    }

  });

  return window.writeInspectorEditDeclarations(css, editId, declarations);

}


function commitStudioInspectorHref(value) {

  const trimmed =
    String(value || "").trim();

  if (trimmed && !isSafeSkinUrl(trimmed)) {

    showStudioToast(
      "https 주소 또는 사이트 내부 경로만 넣을 수 있어요.",
      { isError: true }
    );

    return;

  }

  applyStudioInspectorPatch((element) => {

    if (trimmed) {
      element.setAttribute("href", trimmed);
    } else {
      element.removeAttribute("href");
    }

    return {};

  });

}


function commitStudioInspectorStyle(control, value) {

  return applyStudioInspectorPatch((element, css) => ({
    css: mergeStudioInspectorDeclarations(
      css,
      studioInspectorSelection.editId,
      control,
      value
    )
  }));

}


function undoStudioInspectorEdit() {

  if (!studioInspectorUndo) {
    return;
  }

  const snapshot =
    studioInspectorUndo;

  studioInspectorUndo =
    null;

  try {

    window.applyStudioDirectEdit(
      snapshot.pageType,
      snapshot.html,
      snapshot.css
    );

    showStudioToast("직접 수정을 되돌렸어요.");

  } catch (err) {

    console.error("[studio-inspector] undo failed", err);

    showStudioToast("되돌리지 못했어요.", { isError: true });

  }

  renderStudioInspectorPopover();

}
