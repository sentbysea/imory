/* =========================================================
   POSTS - RICH EDITOR EVENTS (PAGE BREAK / KEY / PASTE)

   posts.js 분할본. DOM 참조/상태는 posts-refs.js에 있음
   (반드시 먼저 로드돼야 함).

   내용: 수동 페이지 나누기 삽입, contenteditable 키보드/입력
   이벤트, 붙여넣기(줄바꿈 유지, 서식 제거), 툴바 선택영역
   유지 처리.
========================================================== */


/* =========================================================
   MANUAL PAGE BREAK
========================================================== */

function insertEditorPageBreak() {

  if (
    !postEditorContent
  ) {
    return;
  }


  /*
    toolbar 클릭 직전 저장된
    caret 위치 복원.
  */

  restoreEditorSelection();


  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.rangeCount === 0
  ) {

    showPostEditorMessage(
      "페이지를 나눌 위치에 커서를 놓아주세요."
    );


    return;

  }


  const range =
    selection.getRangeAt(
      0
    );


  if (
    !nodeIsInsideEditor(
      range.startContainer
    )
  ) {

    showPostEditorMessage(
      "페이지를 나눌 위치에 커서를 놓아주세요."
    );


    return;

  }


  pushEditorUndoSnapshot(
    true
  );


  /*
    선택된 글자가 있다면
    선택 시작점을 기준으로 삽입.
  */

  range.collapse(
    true
  );


  const marker =
    document.createElement(
      "div"
    );


  marker.className =
    "post-editor-page-break";


  marker.dataset.pageBreak =
    "true";


  marker.setAttribute(
    "contenteditable",
    "false"
  );


  marker.textContent =
    "PAGE BREAK";


  /*
    editor 자체에 커서가 있는 경우
  */

  if (
    range.startContainer ===
    postEditorContent
  ) {

    const reference =
      postEditorContent.childNodes[
        range.startOffset
      ] || null;


    postEditorContent.insertBefore(
      marker,
      reference
    );

  }


  /*
    일반 텍스트 바로 위에 커서가 있는 경우:
    텍스트를 정확히 그 위치에서 둘로 나눔.
  */

  else if (
    range.startContainer.nodeType ===
      Node.TEXT_NODE
    &&
    range.startContainer.parentNode ===
      postEditorContent
  ) {

    const textNode =
      range.startContainer;


    const offset =
      range.startOffset;


    const after =
      textNode.splitText(
        offset
      );


    postEditorContent.insertBefore(
      marker,
      after
    );

  }


  /*
    highlight 등 내부 span 안에 있는 경우에는
    해당 최상위 덩어리 다음에서 나눔.
  */

  else {

    let topLevel =
      range.startContainer
        .nodeType ===
        Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer
              .parentElement;


    while (
      topLevel &&
      topLevel.parentNode !==
        postEditorContent
    ) {

      topLevel =
        topLevel.parentElement;

    }


    if (topLevel) {

      topLevel.after(
        marker
      );

    }


    else {

      postEditorContent.appendChild(
        marker
      );

    }

  }


  /*
    커서를 PAGE BREAK 뒤로 이동.
  */

  const nextRange =
    document.createRange();


  nextRange.setStartAfter(
    marker
  );


  nextRange.collapse(
    true
  );


  selection.removeAllRanges();


  selection.addRange(
    nextRange
  );


  savedEditorRange =
    nextRange.cloneRange();


  postEditorContent.focus();


  showPostEditorMessage(
    ""
  );


  updateEditorPreview();

}

/* =========================================================
   RICH EDITOR EVENTS
========================================================== */

postEditorTitle
  ?.addEventListener(
    "input",
    updateEditorPreview
  );


postEditorContent
  ?.addEventListener(
    "input",
    () => {

      saveEditorSelection();

      updateEditorPreview();

    }
  );


postEditorContent
  ?.addEventListener(
    "keyup",
    saveEditorSelection
  );


postEditorContent
  ?.addEventListener(
    "mouseup",
    saveEditorSelection
  );


postEditorContent
  ?.addEventListener(
    "touchend",
    () => {

      setTimeout(
        saveEditorSelection,
        0
      );

    }
  );


document.addEventListener(
  "selectionchange",
  () => {

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
      nodeIsInsideEditor(
        range.commonAncestorContainer
      )
    ) {

      saveEditorSelection();

    }

  }
);

/* =========================================================
   ENTER = SIMPLE LINE BREAK
========================================================== */

postEditorContent
  ?.addEventListener(
    "keydown",
    event => {

      if (
        event.key !== "Enter"
      ) {
        return;
      }


      event.preventDefault();


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
          range.commonAncestorContainer
        )
      ) {
        return;
      }


      pushEditorUndoSnapshot(
        true
      );


      range.deleteContents();


      const br =
        document.createElement(
          "br"
        );


      range.insertNode(
        br
      );


      const nextRange =
        document.createRange();


      nextRange.setStartAfter(
        br
      );


      nextRange.collapse(
        true
      );


      selection.removeAllRanges();


      selection.addRange(
        nextRange
      );


      savedEditorRange =
        nextRange.cloneRange();


      updateEditorPreview();

    }
  );

/* =========================================================
   PASTE
   일반 텍스트 + 줄바꿈 그대로 붙여넣기
========================================================== */

postEditorContent
  ?.addEventListener(
    "paste",
    event => {

      const selection =
        window.getSelection();


      if (
        !selection ||
        selection.rangeCount === 0
      ) {
        return;
      }


      const range =
        selection.getRangeAt(0);


      if (
        !nodeIsInsideEditor(
          range.commonAncestorContainer
        )
      ) {
        return;
      }


      const text =
        event.clipboardData
          ?.getData("text/plain");


      /*
        브라우저에서 텍스트를 못 가져온 경우에는
        기본 붙여넣기를 막지 않음.
      */

      if (
        typeof text !== "string"
      ) {
        return;
      }


      event.preventDefault();


      pushEditorUndoSnapshot(
        true
      );


      range.deleteContents();


      const fragment =
        document.createDocumentFragment();


      const lines =
        text.split(/\r?\n/);


      let lastNode =
        null;


      lines.forEach(
        (line, index) => {

          const textNode =
            document.createTextNode(
              line
            );


          fragment.appendChild(
            textNode
          );


          lastNode =
            textNode;


          if (
            index <
            lines.length - 1
          ) {

            const br =
              document.createElement(
                "br"
              );


            fragment.appendChild(
              br
            );


            lastNode =
              br;

          }

        }
      );


      range.insertNode(
        fragment
      );


      if (lastNode) {

        range.setStartAfter(
          lastNode
        );


        range.collapse(true);


        selection.removeAllRanges();


        selection.addRange(
          range
        );


        savedEditorRange =
          range.cloneRange();

      }


      updateEditorPreview();

    }
  );

  /* =========================================================
   TOOLBAR SELECTION KEEP
========================================================== */

function captureEditorSelectionBeforeToolbar() {

  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.rangeCount === 0
  ) {
    return;
  }


  const range =
    selection.getRangeAt(0);


  if (
    range.collapsed ||
    !nodeIsInsideEditor(
      range.commonAncestorContainer
    )
  ) {
    return;
  }


  savedEditorRange =
    range.cloneRange();

}

function captureEditorCaretBeforeToolbar() {

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
    )
  ) {
    return;
  }


  savedEditorRange =
    range.cloneRange();

}

/*
  데스크톱 + 모바일 둘 다 pointerdown 사용
*/

[
  postEditorFontToggle,
  postEditorClearStyle
].forEach(
  button => {

    button
      ?.addEventListener(
        "pointerdown",
        event => {

          captureEditorSelectionBeforeToolbar();

          /*
            버튼이 focus를 훔치지 못하게 함.
          */
          event.preventDefault();

        }
      );

  }
);

