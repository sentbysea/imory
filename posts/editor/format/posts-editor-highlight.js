/* =========================================================
   POSTS - RICH EDITOR: HIGHLIGHT / TOOLBAR STATE / CONTENT

   posts-editor.js 분할본 중 마지막. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음, selectWrappedContent/
   closestRichStyle 등은 posts-editor.js에 있음(둘 다
   이 파일보다 먼저 로드돼야 함).

   내용: 하이라이트 적용, 서식 지우기, 툴바 버튼 활성/비활성
   상태 갱신, 에디터 비우기/내용 설정/HTML·순수텍스트 추출.
========================================================== */


/* =========================================================
   HIGHLIGHT
========================================================== */

function applyEditorHighlight(
  color
) {

  const range =
    getEditorRange();


  if (!range) {
    return;
  }


  pushEditorUndoSnapshot(
    true
  );


  const safeColor =
    getSafeHighlightColor(
      color
    );


  /*
    선택 전체가 이미 하나의 highlight 안이라면
    span을 겹치지 않고 색만 바꿈.
  */

  const existing =
    closestRichStyle(
      range.startContainer,
      "post-inline-highlight"
    );


  if (
    existing &&
    existing.contains(
      range.endContainer.nodeType ===
        Node.ELEMENT_NODE
        ? range.endContainer
        : range.endContainer.parentElement
    )
  ) {

    existing.dataset.highlight =
      safeColor;


    existing.style.backgroundColor =
      safeColor;


    selectWrappedContent(
      existing
    );


    updateEditorPreview();

    updateEditorToolbarState();


    /*
      ★ 컬러피커(특히 pointerdown 즉시 적용) 이후에는
      selectionchange가 늦게(또는 OS 피커 포커스 이동과
      뒤엉켜) 뜰 수 있어서, 방금 적용한 위치를 기준으로
      직접 한 번 더 계산해 둔다 — 안 그러면 메뉴가 예전
      선택 위치에 멀리 남아있는 것처럼 보일 수 있다.
    */

    if (
      typeof syncEditorFloatingMenu ===
        "function"
    ) {

      syncEditorFloatingMenu();

    }


    return;

  }


  const wrapper =
    document.createElement(
      "span"
    );


  wrapper.className =
    "post-inline-highlight";


  wrapper.dataset.highlight =
    safeColor;


  wrapper.style.backgroundColor =
    safeColor;


  const fragment =
    range.extractContents();


  wrapper.appendChild(
    fragment
  );


  range.insertNode(
    wrapper
  );


  selectWrappedContent(
    wrapper
  );


  updateEditorPreview();

  updateEditorToolbarState();


  if (
    typeof syncEditorFloatingMenu ===
      "function"
  ) {

    syncEditorFloatingMenu();

  }

}



/* =========================================================
   POINT COLOR
   (HIGHLIGHT과 동일한 구조 — 배경색 대신 글자색)
========================================================== */

function applyEditorPointColor(
  color
) {

  const range =
    getEditorRange();


  if (!range) {
    return;
  }


  pushEditorUndoSnapshot(
    true
  );


  const safeColor =
    getSafePointColor(
      color
    );


  const existing =
    closestRichStyle(
      range.startContainer,
      "post-inline-color"
    );


  if (
    existing &&
    existing.contains(
      range.endContainer.nodeType ===
        Node.ELEMENT_NODE
        ? range.endContainer
        : range.endContainer.parentElement
    )
  ) {

    existing.dataset.pointColor =
      safeColor;


    existing.style.color =
      safeColor;


    selectWrappedContent(
      existing
    );


    updateEditorPreview();

    updateEditorToolbarState();


    /*
      ★ 컬러피커(특히 pointerdown 즉시 적용) 이후에는
      selectionchange가 늦게(또는 OS 피커 포커스 이동과
      뒤엉켜) 뜰 수 있어서, 방금 적용한 위치를 기준으로
      직접 한 번 더 계산해 둔다 — 안 그러면 메뉴가 예전
      선택 위치에 멀리 남아있는 것처럼 보일 수 있다.
    */

    if (
      typeof syncEditorFloatingMenu ===
        "function"
    ) {

      syncEditorFloatingMenu();

    }


    return;

  }


  const wrapper =
    document.createElement(
      "span"
    );


  wrapper.className =
    "post-inline-color";


  wrapper.dataset.pointColor =
    safeColor;


  wrapper.style.color =
    safeColor;


  const fragment =
    range.extractContents();


  wrapper.appendChild(
    fragment
  );


  range.insertNode(
    wrapper
  );


  selectWrappedContent(
    wrapper
  );


  updateEditorPreview();

  updateEditorToolbarState();


  if (
    typeof syncEditorFloatingMenu ===
      "function"
  ) {

    syncEditorFloatingMenu();

  }

}



/* =========================================================
   CLEAR STYLE
========================================================== */

function stripRichStylesFromFragment(
  fragment
) {

  const wrappers =
    Array.from(
      fragment.querySelectorAll(
        ".post-inline-font, .post-inline-highlight, .post-inline-color, b, strong, i, em, u"
      )
    );


  wrappers.reverse();


  wrappers.forEach(
    wrapper => {

      unwrapElement(
        wrapper
      );

    }
  );


  return fragment;

}


function clearEditorStyle() {

  const range =
    getEditorRange();


  if (!range) {
    return;
  }


  pushEditorUndoSnapshot(
    true
  );


  /*
    선택영역 안쪽 스타일 제거
  */

  const fragment =
    range.extractContents();


  stripRichStylesFromFragment(
    fragment
  );


  const marker =
    document.createElement(
      "span"
    );


  marker.appendChild(
    fragment
  );


  range.insertNode(
    marker
  );


  /*
    선택영역 바깥을 감싸고 있던
    font/highlight도 선택 전체에 해당하면 제거.
  */

  const parentFont =
    closestRichStyle(
      marker,
      "post-inline-font"
    );


  const parentHighlight =
    closestRichStyle(
      marker,
      "post-inline-highlight"
    );


  const parentPointColor =
    closestRichStyle(
      marker,
      "post-inline-color"
    );


  if (parentFont) {

    unwrapElement(
      parentFont
    );

  }


  if (parentHighlight) {

    unwrapElement(
      parentHighlight
    );

  }


  if (parentPointColor) {

    unwrapElement(
      parentPointColor
    );

  }


  /*
    임시 marker 제거
  */

  const markerParent =
    marker.parentNode;


  const selectionRange =
    document.createRange();


  selectionRange.selectNodeContents(
    marker
  );


  while (
    marker.firstChild
  ) {

    markerParent.insertBefore(
      marker.firstChild,
      marker
    );

  }


  marker.remove();


  markerParent.normalize();


  savedEditorRange =
    null;


  postEditorContent.focus();


  updateEditorPreview();

  updateEditorToolbarState();


  if (
    typeof syncEditorFloatingMenu ===
      "function"
  ) {

    syncEditorFloatingMenu();

  }

}



/* =========================================================
   TOOLBAR STATE
========================================================== */

function updateEditorToolbarState() {

  if (!postEditorContent) {
    return;
  }


  let fontActive =
    false;


  if (savedEditorRange) {

    const start =
      savedEditorRange
        .startContainer;


    const font =
      closestRichStyle(
        start,
        "post-inline-font"
      );


    fontActive =
      Boolean(
        font
      );

  }


  if (
    postEditorFontToggle
  ) {

    postEditorFontToggle
      .classList
      .toggle(
        "active",
        fontActive
      );


    postEditorFontToggle
      .setAttribute(
        "aria-pressed",
        fontActive
          ? "true"
          : "false"
      );

  }

}



/* =========================================================
   EDITOR CONTENT
========================================================== */

function clearRichEditor() {

  if (!postEditorContent) {
    return;
  }


  postEditorContent.replaceChildren();


  savedEditorRange =
    null;


  resetEditorUndoHistory();

}


function setRichEditorContent(
  content
) {

  if (!postEditorContent) {
    return;
  }


  const safeHTML =
    getPostContentAsSafeHTML(
      content
    );


  const temp =
    document.createElement(
      "div"
    );


  temp.innerHTML =
    safeHTML;


  postEditorContent.replaceChildren();


  while (
    temp.firstChild
  ) {

    postEditorContent.appendChild(
      temp.firstChild
    );

  }


  savedEditorRange =
    null;

}


function getRichEditorHTML() {

  if (!postEditorContent) {
    return "";
  }


  return sanitizeRichHTML(
    postEditorContent.innerHTML
  );

}


function getRichEditorPlainText() {

  if (!postEditorContent) {
    return "";
  }


  /*
    PAGE BREAK는 편집용 구조물이라
    실제 본문 텍스트로 세지 않음.
  */

  const clone =
    postEditorContent.cloneNode(
      true
    );


  clone
    .querySelectorAll(
      ".post-editor-page-break"
    )
    .forEach(
      marker => {

        marker.remove();

      }
    );


  return (
    clone.innerText ||
    clone.textContent ||
    ""
  );

}


