/* =========================================================
   POSTS - EDITOR: 블록 삽입 (복사 상자 · 메모 · 구분선)

   기준 문서: IMORY_EDITOR_DECOR_DESIGN.md §11
   블록의 모양·판정·복사 규칙은 posts/style/posts-body-blocks.js.

   이 파일이 하는 일은 넷이다.

     1. 툴바 3행에서 커서 자리에 블록을 넣는다.
     2. 편집창 안의 블록에 조작 UI(삭제 · 구분선 종류)를 붙인다.
        저장되는 HTML에는 들어가지 않는다 — 사니타이저가
        .post-block-tool을 통째로 버린다.
     3. 블록 앞뒤에 평범한 문단을 이어 쓸 수 있게 자리를 만든다.
     4. 블록 안의 편집도 기존 undo/redo·프리뷰 갱신에 얹는다.

   ★ 조작 UI는 매번 다시 붙인다

     undo/redo는 본문 innerHTML을 통째로 갈아끼운다. 그때 조작
     UI에 걸어 둔 리스너가 있으면 전부 끊어진다. 그래서 리스너는
     개별 버튼이 아니라 편집창 하나에 위임으로 걸고, UI 자체는
     "없으면 만든다"(ensureEditorBlockTools)로 다시 맞춘다.
     저장된 글을 열 때 조작 UI가 생기는 길도 같은 함수다.

   classic script. posts/editor/posts-refs.js ·
   posts/style/posts-body-blocks.js보다 뒤에 로드돼야 한다.
========================================================== */


/* =========================================================
   삽입 자리 찾기

   커서가 본문 흐름의 **최상위 어디에** 있는지로 정한다. 블록은
   문단 사이에 놓이는 덩어리라 서식 span 안쪽에 끼울 수 없다 —
   PAGE break(insertEditorPageBreak)와 같은 규칙이다.
========================================================== */

function editorTopLevelInsertReference() {

  restoreEditorSelection();


  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.rangeCount === 0
  ) {

    return undefined;

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

    return undefined;

  }


  range.collapse(
    true
  );


  /* 편집창 자체에 커서가 있는 경우 */

  if (
    range.startContainer ===
    postEditorContent
  ) {

    return postEditorContent.childNodes[
      range.startOffset
    ] || null;

  }


  /* 최상위 텍스트 한가운데면 그 자리에서 글을 둘로 나눈다 */

  if (
    range.startContainer.nodeType ===
      Node.TEXT_NODE &&
    range.startContainer.parentNode ===
      postEditorContent
  ) {

    return range.startContainer.splitText(
      range.startOffset
    );

  }


  /* 서식 span·블록 안쪽이면 그 덩어리 **다음**에 놓는다 */

  let topLevel =
    range.startContainer.nodeType ===
    Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;


  while (
    topLevel &&
    topLevel.parentNode !== postEditorContent
  ) {

    topLevel =
      topLevel.parentElement;

  }


  return topLevel
    ? topLevel.nextSibling
    : null;

}


/*
  ★ 블록 앞뒤에 글을 쓸 자리를 만든다 (요구사항 5·7)

  블록이 본문 맨 앞이나 맨 끝, 또는 다른 블록 바로 옆에 놓이면
  그 사이에 커서를 둘 자리가 없다 — contenteditable에서 두
  블록 사이를 클릭해도 캐럿이 들어가지 못한다. 블록 양옆에
  <br>을 하나씩 보장해서 언제나 평범한 문단을 이어 쓸 수 있게
  한다.

  <br> 하나는 "줄바꿈"이지 문단 경계가 아니다(문단 경계는 연속
  두 개) — 그래서 이 자리가 문단 간격이나 강조선 판정을 바꾸지
  않는다.
*/

function ensureEditorBlockSpacing(
  block
) {

  const before =
    block.previousSibling;


  /*
    앞이 글자나 <br>이면 이미 커서를 둘 자리가 있다. 아무것도
    없거나(본문 맨 앞) 바로 앞이 또 다른 블록일 때만 만든다.
  */

  if (
    !before ||
    isPostBlockNode(
      before
    )
  ) {

    block.parentNode.insertBefore(
      document.createElement(
        "br"
      ),
      block
    );

  }


  const after =
    block.nextSibling;


  if (
    !after ||
    isPostBlockNode(
      after
    )
  ) {

    block.parentNode.insertBefore(
      document.createElement(
        "br"
      ),
      block.nextSibling
    );

  }

}


/*
  블록 하나를 지금 커서 자리에 넣는다. 넣은 뒤 커서를 어디에
  둘지는 블록마다 다르다 — 글을 쓰는 상자는 그 안으로, 구분선은
  바로 뒤로.
*/

function insertEditorBlock(
  block,
  options = {}
) {

  if (!postEditorContent) {

    return false;

  }


  const reference =
    editorTopLevelInsertReference();


  if (
    reference === undefined
  ) {

    showPostEditorMessage(
      "넣을 위치에 커서를 놓아주세요."
    );


    return false;

  }


  pushEditorUndoSnapshot(
    true
  );


  postEditorContent.insertBefore(
    block,
    reference
  );


  ensureEditorBlockSpacing(
    block
  );


  ensureEditorBlockTools(
    postEditorContent
  );


  const caretTarget =
    options.caretInto
      ? block.querySelector(
          options.caretInto
        )
      : null;


  const range =
    document.createRange();


  if (caretTarget) {

    range.selectNodeContents(
      caretTarget
    );


    range.collapse(
      true
    );

  }

  else {

    range.setStartAfter(
      block
    );


    range.collapse(
      true
    );

  }


  const selection =
    window.getSelection();


  selection.removeAllRanges();


  selection.addRange(
    range
  );


  savedEditorRange =
    range.cloneRange();


  postEditorContent.focus();


  showPostEditorMessage(
    ""
  );


  updateEditorPreview();


  if (
    typeof syncEditorRuleOverlay === "function"
  ) {

    syncEditorRuleOverlay();

  }


  return true;

}



/* =========================================================
   조작 UI — 편집창에서만 보이고 저장되지 않는다
========================================================== */

function createEditorBlockToolShell() {

  const tool =
    document.createElement(
      "div"
    );


  tool.className =
    POST_BLOCK_TOOL_CLASS;


  /*
    ★ contenteditable="false"가 두 가지를 동시에 한다.

      - 안의 글자가 본문 내용으로 편집되지 않는다.
      - 버튼/드롭다운이 실제로 눌린다(편집 가능한 영역 안의
        컨트롤은 브라우저가 조작 대신 캐럿 이동으로 다루는
        경우가 있다).
  */

  tool.setAttribute(
    "contenteditable",
    "false"
  );


  return tool;

}


function createEditorBlockDeleteButton() {

  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";


  button.className =
    "post-block-tool-button";


  button.dataset.blockAction =
    "delete";


  button.textContent =
    "×";


  button.setAttribute(
    "aria-label",
    "이 블록 삭제"
  );


  button.title =
    "이 블록 삭제";


  return button;

}


function createEditorDividerStyleSelect(
  current
) {

  const select =
    document.createElement(
      "select"
    );


  select.className =
    "post-block-tool-select";


  select.dataset.blockAction =
    "divider-style";


  select.setAttribute(
    "aria-label",
    "구분선 종류"
  );


  POST_DIVIDER_STYLES.forEach(
    style => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        style.value;


      option.textContent =
        `${style.preview}  ${style.label}`;


      select.appendChild(
        option
      );

    }
  );


  select.value =
    normalizePostDividerStyle(
      current
    );


  return select;

}


/*
  편집창 안의 블록에 조작 UI가 없으면 붙인다. 이미 있으면
  그대로 둔다 — 저장된 글을 열 때, undo/redo 뒤, 블록을 새로
  넣은 뒤 모두 이 함수 하나로 맞춘다.
*/

function ensureEditorBlockTools(
  container
) {

  if (!container) {

    return;

  }


  container
    .querySelectorAll(
      `.${POST_COPY_BOX_CLASS}, .${POST_MEMO_CLASS}, .${POST_DIVIDER_CLASS}`
    )
    .forEach(
      block => {

        if (
          block.querySelector(
            `:scope > .${POST_BLOCK_TOOL_CLASS}`
          )
        ) {

          return;

        }


        const tool =
          createEditorBlockToolShell();


        if (
          isPostDividerNode(
            block
          )
        ) {

          tool.appendChild(
            createEditorDividerStyleSelect(
              block.dataset.divider
            )
          );

        }


        tool.appendChild(
          createEditorBlockDeleteButton()
        );


        block.insertBefore(
          tool,
          block.firstChild
        );

      }
    );

}


/*
  블록을 지운다. 양옆에 만들어 둔 <br> 중 하나도 함께 걷어내서,
  넣기 전과 같은 모양으로 돌아가게 한다.
*/

function removeEditorBlock(
  block
) {

  pushEditorUndoSnapshot(
    true
  );


  const after =
    block.nextSibling;


  if (
    after &&
    after.nodeName === "BR"
  ) {

    after.remove();

  }


  const range =
    document.createRange();


  range.setStartBefore(
    block
  );


  range.collapse(
    true
  );


  block.remove();


  const selection =
    window.getSelection();


  selection.removeAllRanges();


  selection.addRange(
    range
  );


  savedEditorRange =
    range.cloneRange();


  postEditorContent.focus();


  updateEditorPreview();


  if (
    typeof syncEditorRuleOverlay === "function"
  ) {

    syncEditorRuleOverlay();

  }

}



/* =========================================================
   위임 리스너 — 조작 UI는 undo/redo로 다시 만들어지므로
   개별 요소에 걸지 않는다
========================================================== */

postEditorContent
  ?.addEventListener(
    "click",
    event => {

      const button =
        event.target?.closest?.(
          `.${POST_BLOCK_TOOL_CLASS} [data-block-action="delete"]`
        );


      if (!button) {

        return;

      }


      const block =
        button.closest(
          `.${POST_COPY_BOX_CLASS}, .${POST_MEMO_CLASS}, .${POST_DIVIDER_CLASS}`
        );


      if (!block) {

        return;

      }


      event.preventDefault();


      removeEditorBlock(
        block
      );

    }
  );


postEditorContent
  ?.addEventListener(
    "change",
    event => {

      const select =
        event.target?.closest?.(
          '[data-block-action="divider-style"]'
        );


      if (!select) {

        return;

      }


      const block =
        select.closest(
          `.${POST_DIVIDER_CLASS}`
        );


      if (!block) {

        return;

      }


      pushEditorUndoSnapshot(
        true
      );


      block.dataset.divider =
        normalizePostDividerStyle(
          select.value
        );


      updateEditorPreview();

    }
  );



/* =========================================================
   툴바 3행
========================================================== */

bindImoryTapButton(
  postEditorInsertCopyBox,
  {

    onDown:
      () => {

        captureEditorCaretBeforeToolbar();

      },

    onFire:
      () => {

        insertEditorBlock(
          createPostCopyBox(
            {
              editable: true
            }
          ),
          {
            caretInto:
              `.${POST_COPY_BOX_TITLE_CLASS}`
          }
        );

      }

  }
);


bindImoryTapButton(
  postEditorInsertMemo,
  {

    onDown:
      () => {

        captureEditorCaretBeforeToolbar();

      },

    onFire:
      () => {

        insertEditorBlock(
          createPostMemo(
            {
              editable: true
            }
          ),
          {
            caretInto:
              `.${POST_MEMO_TITLE_CLASS}`
          }
        );

      }

  }
);


/*
  ★ 드롭다운은 "무엇을 넣을 것인가"다.

  고른 뒤 첫 option(안내 문구)으로 되돌린다 — 그래야 같은
  종류를 연달아 두 번 넣을 수 있다(change가 다시 뜬다).

  <select>는 pointerdown을 막으면 목록 자체가 열리지 않으므로
  bindImoryTapButton을 쓰지 않는다. 대신 목록이 열리기 전
  (pointerdown)에 캐럿을 붙잡아 둔다.
*/

postEditorInsertDivider
  ?.addEventListener(
    "pointerdown",
    () => {

      captureEditorCaretBeforeToolbar();

    }
  );


postEditorInsertDivider
  ?.addEventListener(
    "change",
    () => {

      const style =
        postEditorInsertDivider.value;


      postEditorInsertDivider.value =
        "";


      if (!style) {

        return;

      }


      insertEditorBlock(
        createPostDivider(
          style
        )
      );

    }
  );
