/* =========================================================
   POSTS - RICH EDITOR

   posts.js에서 분리됨.

   postEditorMessage, postEditorCategory, postEditorContent 등
   DOM 요소와 savedEditorRange 상태는 posts/editor/posts-refs.js에
   있음(같은 페이지에서 함께 로드되어야 함).
   getSafeHighlightColor는 posts/style/posts-style-preset.js에 있음.

   이 파일도 다시 커져서, 하이라이트/서식 지우기/툴바 상태/
   에디터 콘텐츠 관련 함수는 posts-editor-highlight.js로
   옮겼음 — 그 파일은 이 파일보다 나중에 로드되어야 함
   (index.html 순서 참고).
========================================================== */

/* =========================================================
   EDITOR MESSAGE
========================================================== */

function showPostEditorMessage(
  message
) {

  if (!postEditorMessage) {
    return;
  }


  postEditorMessage.textContent =
    message;

}



/* =========================================================
   EDITOR CATEGORY
========================================================== */

async function loadPostEditorCategories(
  selectedCategoryId = null
) {

  if (!postEditorCategory) {
    return;
  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "categories"
      )
      .select(
        "id, name, sort_order"
      )
      .order(
        "sort_order",
        {
          ascending: true
        }
      );


  if (error) {

    console.error(
      error
    );

    return;

  }


  postEditorCategory.innerHTML =
    "";


  (data || []).forEach(
    category => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        category.id;


      option.textContent =
        category.name;


      postEditorCategory.appendChild(
        option
      );

    }
  );


  if (
    selectedCategoryId !==
    null
  ) {

    postEditorCategory.value =
      String(
        selectedCategoryId
      );

  }

}



/* =========================================================
   RICH EDITOR SELECTION
========================================================== */

function nodeIsInsideEditor(
  node
) {

  if (
    !node ||
    !postEditorContent
  ) {

    return false;

  }


  const element =
    node.nodeType ===
    Node.ELEMENT_NODE
      ? node
      : node.parentElement;


  return (
    element ===
      postEditorContent
    ||
    postEditorContent.contains(
      element
    )
  );

}


function saveEditorSelection() {

  if (!postEditorContent) {
    return;
  }


  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.rangeCount === 0
  ) {

    return;

  }


  const range =
    selection.getRangeAt(
      0
    );


  if (
    !nodeIsInsideEditor(
      range.startContainer
    ) ||
    !nodeIsInsideEditor(
      range.endContainer
    )
  ) {

    return;

  }


  savedEditorRange =
    range.cloneRange();


  updateEditorToolbarState();

}


function restoreEditorSelection() {

  if (
    !savedEditorRange ||
    !postEditorContent
  ) {

    return false;

  }


  const selection =
    window.getSelection();


  selection.removeAllRanges();


  selection.addRange(
    savedEditorRange
  );


  return true;

}


function getEditorRange() {

  if (
    !postEditorContent
  ) {

    return null;

  }


  restoreEditorSelection();


  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.rangeCount === 0
  ) {

    showPostEditorMessage(
      "스타일을 적용할 텍스트를 선택해주세요."
    );

    return null;

  }


  const range =
    selection.getRangeAt(
      0
    );


  if (
    range.collapsed ||
    !nodeIsInsideEditor(
      range.commonAncestorContainer
    )
  ) {

    showPostEditorMessage(
      "스타일을 적용할 텍스트를 선택해주세요."
    );

    return null;

  }


  return range;

}



/* =========================================================
   RANGE HELPERS
========================================================== */

function selectWrappedContent(
  wrapper
) {

  if (!wrapper) {
    return;
  }


  const range =
    document.createRange();


  range.selectNodeContents(
    wrapper
  );


  const selection =
    window.getSelection();


  selection.removeAllRanges();


  selection.addRange(
    range
  );


  savedEditorRange =
    range.cloneRange();

}


function unwrapElement(
  element
) {

  if (
    !element ||
    !element.parentNode
  ) {

    return;
  }


  const parent =
    element.parentNode;


  while (
    element.firstChild
  ) {

    parent.insertBefore(
      element.firstChild,
      element
    );

  }


  element.remove();


  parent.normalize();

}


function closestRichStyle(
  node,
  className
) {

  let element =
    node?.nodeType ===
      Node.ELEMENT_NODE
      ? node
      : node?.parentElement;


  while (
    element &&
    element !==
      postEditorContent
  ) {

    if (
      element.classList
        ?.contains(
          className
        )
    ) {

      return element;

    }


    element =
      element.parentElement;

  }


  return null;

}


function closestRichTag(
  node,
  tagNames
) {

  let element =
    node?.nodeType ===
      Node.ELEMENT_NODE
      ? node
      : node?.parentElement;


  while (
    element &&
    element !==
      postEditorContent
  ) {

    if (
      tagNames.includes(
        element.tagName
      )
    ) {

      return element;

    }


    element =
      element.parentElement;

  }


  return null;

}



/* =========================================================
   FONT TOGGLE
========================================================== */

function toggleEditorFont() {

  const range =
    getEditorRange();


  if (!range) {
    return;
  }


  pushEditorUndoSnapshot(
    true
  );


  const existing =
    closestRichStyle(
      range.startContainer,
      "post-inline-font"
    );


  /*
    선택이 이미 같은 font span 안에 있으면
    다시 누를 때 제거.
  */

  if (
    existing &&
    existing.contains(
      range.endContainer.nodeType ===
        Node.ELEMENT_NODE
        ? range.endContainer
        : range.endContainer.parentElement
    )
  ) {

    const text =
      existing.textContent;


    unwrapElement(
      existing
    );


    /*
      제거 뒤 선택은 굳이 정확히 유지하지 않아도
      편집 흐름에는 문제 없음.
    */

    savedEditorRange =
      null;


    postEditorContent.focus();


    updateEditorPreview();

    updateEditorToolbarState();

    return;

  }


  const wrapper =
    document.createElement(
      "span"
    );


  wrapper.className =
    "post-inline-font";


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

}



/* =========================================================
   BOLD / ITALIC / UNDERLINE TOGGLE

   toggleEditorFont과 동일한 wrap/unwrap 패턴을 태그 기반으로
   일반화. tagNames는 "이미 켜져 있다"고 판단할 조상 태그
   목록(예: 볼드는 STRONG/B 둘 다 인정), insertTag는 새로
   켤 때 실제로 삽입할 태그. b/strong/i/em/u는 이미 사이니타이저
   화이트리스트에 있어 저장/프리뷰/뷰어에 그대로 반영된다
   (posts-sanitize.js 참고). 서로 다른 태그끼리는 각자
   독립적으로 감싸므로 자연히 중첩(Bold+Italic 등) 가능.
========================================================== */

function toggleEditorInlineTag(
  tagNames,
  insertTag
) {

  const range =
    getEditorRange();


  if (!range) {
    return;
  }


  pushEditorUndoSnapshot(
    true
  );


  const existing =
    closestRichTag(
      range.startContainer,
      tagNames
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

    unwrapElement(
      existing
    );


    savedEditorRange =
      null;


    postEditorContent.focus();


    updateEditorPreview();

    updateEditorToolbarState();

    return;

  }


  const wrapper =
    document.createElement(
      insertTag
    );


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

}


function toggleEditorBold() {

  toggleEditorInlineTag(
    [
      "STRONG",
      "B"
    ],
    "strong"
  );

}


function toggleEditorItalic() {

  toggleEditorInlineTag(
    [
      "EM",
      "I"
    ],
    "em"
  );

}


function toggleEditorUnderline() {

  toggleEditorInlineTag(
    [
      "U"
    ],
    "u"
  );

}



