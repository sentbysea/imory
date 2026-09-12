/* =========================================================
   POSTS - BODY BLOCKS (복사 상자 · 메모 · 구분선)

   기준 문서: IMORY_EDITOR_DECOR_DESIGN.md §11

   본문 한가운데에 끼워 넣는 "덩어리" 셋을 한 곳에서 정의한다.
   에디터(삽입·편집), 사니타이저(저장), 공개 뷰어, 발췌
   PREVIEW/export가 전부 이 파일의 모양과 판정을 쓴다 — 같은
   블록을 네 군데에서 따로 정의하지 않기 위해서다.

   ★ 저장되는 모양

     복사 상자
       <div class="post-copy-box">
         <div class="post-copy-box-title">부제목</div>
         <div class="post-copy-box-body">내용…</div>
       </div>

     메모
       <div class="post-memo">
         <div class="post-memo-title">제목</div>
         <div class="post-memo-body">내용…</div>
       </div>

     구분선
       <div class="post-divider" data-divider="solid"></div>

   ★ 저장되지 않는 것 — 조작 UI

     편집창의 삭제 버튼·구분선 종류 드롭다운은 블록 **안에**
     들어가지만 class="post-block-tool" + contenteditable="false"
     이고, 사니타이저가 통째로 버린다(posts/posts-sanitize.js).
     그래서 저장되는 HTML · 공개 본문 · 발췌 이미지 어디에도
     조작 아이콘이 새어나갈 자리가 구조적으로 없다 (요구사항 8).

     공개 화면의 "복사" 버튼도 저장되지 않는다. 렌더가 끝난 뒤
     플랫폼 코드가 붙이고(enhancePostBlocksForViewing), 동작은
     위임 리스너 하나가 처리한다 — 저장 HTML에 onclick 같은
     인라인 이벤트나 <script>를 넣는 방식은 쓰지 않는다.

   ★ 내용은 글자와 줄바꿈뿐이다

     두 상자의 안쪽은 사니타이저가 **텍스트와 <br>만** 남긴다.
     사용자가 HTML 코드를 써넣어도 태그로 살아나지 않고 글자
     그대로 보이고, 그대로 복사된다 (요구사항 5).

     화면에서는 white-space: pre-wrap이라 연속 공백도 입력한
     그대로 보인다. 복사할 때도 같은 규칙으로 글자를 만든다
     (postCopyBoxPlainText).

   classic script. posts/style/posts-body-layout.js 뒤에 로드한다.
========================================================== */


const POST_COPY_BOX_CLASS =
  "post-copy-box";

const POST_COPY_BOX_TITLE_CLASS =
  "post-copy-box-title";

const POST_COPY_BOX_BODY_CLASS =
  "post-copy-box-body";


const POST_MEMO_CLASS =
  "post-memo";

const POST_MEMO_TITLE_CLASS =
  "post-memo-title";

const POST_MEMO_BODY_CLASS =
  "post-memo-body";


const POST_DIVIDER_CLASS =
  "post-divider";


/* 편집창 전용 조작 UI — 저장되지 않는다 */

const POST_BLOCK_TOOL_CLASS =
  "post-block-tool";


/* 공개 화면의 복사 버튼 — 렌더 뒤에 붙고 저장되지 않는다 */

const POST_COPY_BOX_COPY_CLASS =
  "post-copy-box-copy";


/*
  구분선 다섯 가지. 값은 저장되는 data-divider의 내용이고,
  label은 삽입 드롭다운과 편집창 드롭다운이 함께 쓴다.

  미리보기는 글자로 준다 — <select>의 목록은 OS가 그리는 창이라
  CSS가 닿지 않아서, 어떤 선인지 보여줄 방법이 글자뿐이다.
*/

const POST_DIVIDER_STYLES =
  [
    {
      value: "solid",
      label: "실선",
      preview: "───"
    },
    {
      value: "dotted",
      label: "점선",
      preview: "┈┈┈"
    },
    {
      value: "dashed",
      label: "파선",
      preview: "╌╌╌"
    },
    {
      value: "double",
      label: "이중선",
      preview: "═══"
    },
    {
      value: "dots",
      label: "가운데 점 세 개",
      preview: "⋯"
    }
  ];


const POST_DIVIDER_DEFAULT_STYLE =
  "solid";


function normalizePostDividerStyle(
  value
) {

  const text =
    String(
      value ||
      ""
    ).trim();


  return POST_DIVIDER_STYLES.some(
    style =>
      style.value === text
  )
    ? text
    : POST_DIVIDER_DEFAULT_STYLE;

}



/* =========================================================
   판정
========================================================== */

function postNodeHasClass(
  node,
  className
) {

  return (
    node?.nodeType ===
      Node.ELEMENT_NODE &&
    node.classList
      ?.contains(
        className
      ) === true
  );

}


function isPostCopyBoxNode(
  node
) {

  return postNodeHasClass(
    node,
    POST_COPY_BOX_CLASS
  );

}


function isPostMemoNode(
  node
) {

  return postNodeHasClass(
    node,
    POST_MEMO_CLASS
  );

}


function isPostDividerNode(
  node
) {

  return postNodeHasClass(
    node,
    POST_DIVIDER_CLASS
  );

}


function isPostBlockToolNode(
  node
) {

  return postNodeHasClass(
    node,
    POST_BLOCK_TOOL_CLASS
  );

}


/*
  셋 중 하나인가. 문단 경계 판정 · 대사/지문 파싱 건너뛰기 ·
  발췌 페이지 나누기에서 모두 이 하나를 쓴다.
*/

function isPostBlockNode(
  node
) {

  return (
    isPostCopyBoxNode(
      node
    ) ||
    isPostMemoNode(
      node
    ) ||
    isPostDividerNode(
      node
    )
  );

}


/*
  이 노드가 블록 **안에** 들어 있는가(자기 자신 포함).

  대사("…")·지문(*…*) 파싱이 상자 안의 글자를 건드리지 않게
  하는 데 쓴다 — 코드나 메모에 들어 있는 따옴표·별표가 제멋대로
  대사 색으로 칠해지면 안 된다 (요구사항 8).
*/

function postNodeIsInsidePostBlock(
  node
) {

  let current =
    node?.nodeType ===
    Node.ELEMENT_NODE
      ? node
      : node?.parentElement;


  while (current) {

    if (
      isPostBlockNode(
        current
      )
    ) {

      return true;

    }


    current =
      current.parentElement;

  }


  return false;

}



/* =========================================================
   글자 뽑기

   ★ 내용만, 입력한 그대로 (요구사항 5)

   복사되는 것은 .post-copy-box-body 안의 글자뿐이다 — 부제목도,
   복사 버튼의 글자도, 어떤 장식용 백틱도 들어가지 않는다.
   상자를 코드처럼 보이게 하려고 양끝에 백틱을 붙이는 일도 하지
   않는다. 사용자가 내용에 직접 쓴 백틱·따옴표·기호·공백은
   그대로 남는다.

   <br>은 줄바꿈 하나로 돌린다. 편집 중 브라우저가 만드는 <div>
   묶음도 줄바꿈으로 센다 — 화면에 보이는 줄 수와 복사되는 줄
   수가 같아야 한다.
*/

function postBlockPlainText(
  root
) {

  if (!root) {

    return "";

  }


  let text =
    "";


  /* 직전에 줄바꿈을 이미 넣었는가 — 같은 경계에서 두 번 넣지 않는다 */

  let atLineStart =
    true;


  const newline =
    () => {

      text += "\n";


      atLineStart =
        true;

    };


  const walk =
    node => {

      if (
        node.nodeType ===
        Node.TEXT_NODE
      ) {

        const value =
          node.nodeValue ||
          "";


        if (value) {

          text += value;


          atLineStart =
            false;

        }


        return;

      }


      if (
        node.nodeType !==
        Node.ELEMENT_NODE
      ) {

        return;

      }


      /* 조작 UI는 글자가 아니다 */

      if (
        isPostBlockToolNode(
          node
        ) ||
        node.classList.contains(
          POST_COPY_BOX_COPY_CLASS
        )
      ) {

        return;

      }


      if (
        node.tagName === "BR"
      ) {

        newline();


        return;

      }


      const isBlock =
        node.tagName === "DIV" ||
        node.tagName === "P";


      if (
        isBlock &&
        !atLineStart
      ) {

        newline();

      }


      Array.from(
        node.childNodes
      ).forEach(
        walk
      );


      if (
        isBlock &&
        !atLineStart
      ) {

        newline();

      }

    };


  Array.from(
    root.childNodes
  ).forEach(
    walk
  );


  /*
    마지막 줄바꿈 하나는 떼어낸다 — 블록 경계에서 저절로 붙는
    것이라 사용자가 친 줄바꿈이 아니다.
  */

  return text.replace(
    /\n$/,
    ""
  );

}


function postCopyBoxPlainText(
  box
) {

  return postBlockPlainText(
    box?.querySelector(
      `.${POST_COPY_BOX_BODY_CLASS}`
    )
  );

}



/* =========================================================
   만들기

   editable  편집창에 넣을 것인가. 공개 화면에서는 상자 안의
             글자가 편집되면 안 되므로 contenteditable을 주지
             않는다 — 공개 본문은 애초에 contenteditable 바깥에
             있지만, 발췌 PREVIEW처럼 같은 함수를 쓰는 자리가
             있어서 명시한다.
========================================================== */

function createPostTextBlockPart(
  className,
  text,
  placeholder,
  editable
) {

  const part =
    document.createElement(
      "div"
    );


  part.className =
    className;


  if (editable) {

    part.setAttribute(
      "data-placeholder",
      placeholder
    );

  }


  /*
    줄바꿈을 <br>로 넣는다 — textContent에 "\n"을 그대로 넣으면
    pre-wrap 덕에 화면에는 보이지만, contenteditable에서 한 줄을
    지우는 순간 브라우저가 제멋대로 <div>로 바꿔 버린다.
  */

  String(
    text ||
    ""
  )
    .split(
      /\r?\n/
    )
    .forEach(
      (
        line,
        index
      ) => {

        if (index > 0) {

          part.appendChild(
            document.createElement(
              "br"
            )
          );

        }


        if (line) {

          part.appendChild(
            document.createTextNode(
              line
            )
          );

        }

      }
    );


  return part;

}


function createPostCopyBox(
  options = {}
) {

  const box =
    document.createElement(
      "div"
    );


  box.className =
    POST_COPY_BOX_CLASS;


  box.appendChild(
    createPostTextBlockPart(
      POST_COPY_BOX_TITLE_CLASS,
      options.title,
      "부제목",
      options.editable
    )
  );


  box.appendChild(
    createPostTextBlockPart(
      POST_COPY_BOX_BODY_CLASS,
      options.body,
      "복사될 내용",
      options.editable
    )
  );


  return box;

}


function createPostMemo(
  options = {}
) {

  const memo =
    document.createElement(
      "div"
    );


  memo.className =
    POST_MEMO_CLASS;


  memo.appendChild(
    createPostTextBlockPart(
      POST_MEMO_TITLE_CLASS,
      options.title,
      "제목",
      options.editable
    )
  );


  memo.appendChild(
    createPostTextBlockPart(
      POST_MEMO_BODY_CLASS,
      options.body,
      "메모",
      options.editable
    )
  );


  return memo;

}


function createPostDivider(
  style
) {

  const divider =
    document.createElement(
      "div"
    );


  divider.className =
    POST_DIVIDER_CLASS;


  divider.dataset.divider =
    normalizePostDividerStyle(
      style
    );


  return divider;

}



/* =========================================================
   공개 화면 — 복사 버튼 붙이기

   ★ 저장 HTML에는 들어가지 않는다 (요구사항 8)

   본문을 그린 뒤에 플랫폼 코드가 버튼을 넣고, 누르는 동작은
   아래 위임 리스너 하나가 처리한다. 저장되는 HTML에 인라인
   이벤트나 <script>를 심지 않는다.

   발췌(PREVIEW/export)에서는 부르지 않는다 — 이미지에 조작
   아이콘이 들어가면 안 된다.
========================================================== */

const POST_COPY_BOX_COPY_LABEL =
  "copy";

const POST_COPY_BOX_COPIED_LABEL =
  "copied";

const POST_COPY_BOX_FAILED_LABEL =
  "failed";


function enhancePostBlocksForViewing(
  container
) {

  if (!container) {

    return;

  }


  container
    .querySelectorAll(
      `.${POST_COPY_BOX_CLASS}`
    )
    .forEach(
      box => {

        if (
          box.querySelector(
            `.${POST_COPY_BOX_COPY_CLASS}`
          )
        ) {

          return;

        }


        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          POST_COPY_BOX_COPY_CLASS;


        button.textContent =
          POST_COPY_BOX_COPY_LABEL;


        button.setAttribute(
          "aria-label",
          "내용 복사"
        );


        /*
          상자 맨 앞에 넣는다 — 자리는 CSS(absolute)가 정하고,
          DOM 순서는 화면 낭독기가 "이 상자에 복사 버튼이 있다"를
          먼저 알리도록 앞에 둔다.
        */

        box.insertBefore(
          button,
          box.firstChild
        );

      }
    );

}


/*
  클립보드에 넣는다. 성공했을 때만 성공이라고 말한다
  (요구사항 5).

  navigator.clipboard는 https(또는 localhost) + 사용자 제스처
  안에서만 동작한다. 막힌 환경을 위해 예전 방식(execCommand)을
  한 번 더 시도하고, 그것도 실패하면 실패로 알린다.
*/

async function copyPostTextToClipboard(
  text
) {

  try {

    if (
      navigator.clipboard
        ?.writeText
    ) {

      await navigator.clipboard.writeText(
        text
      );


      return true;

    }

  }

  catch (error) {

    /* 아래 폴백으로 */

  }


  try {

    const area =
      document.createElement(
        "textarea"
      );


    area.value =
      text;


    /*
      화면 밖에 두되 display:none은 쓰지 않는다 — 숨겨진
      요소는 선택이 되지 않아 복사도 되지 않는다.
    */

    area.setAttribute(
      "readonly",
      "readonly"
    );


    area.style.position =
      "fixed";


    area.style.top =
      "-1000px";


    area.style.opacity =
      "0";


    document.body.appendChild(
      area
    );


    area.select();


    area.setSelectionRange(
      0,
      text.length
    );


    const ok =
      document.execCommand(
        "copy"
      );


    area.remove();


    return ok === true;

  }

  catch (error) {

    return false;

  }

}


function flashPostCopyBoxResult(
  button,
  ok
) {

  button.textContent =
    ok
      ? POST_COPY_BOX_COPIED_LABEL
      : POST_COPY_BOX_FAILED_LABEL;


  button.dataset.copyState =
    ok
      ? "ok"
      : "failed";


  window.clearTimeout(
    button.imoryCopyResetTimer
  );


  button.imoryCopyResetTimer =
    window.setTimeout(
      () => {

        button.textContent =
          POST_COPY_BOX_COPY_LABEL;


        delete button.dataset.copyState;

      },
      1400
    );

}


/*
  위임 리스너 하나. 본문이 다시 그려져도(공개 글 이동, 스킨
  region 교체) 다시 걸 필요가 없다.
*/

document.addEventListener(
  "click",
  async event => {

    const button =
      event.target?.closest?.(
        `.${POST_COPY_BOX_COPY_CLASS}`
      );


    if (!button) {

      return;

    }


    event.preventDefault();


    const box =
      button.closest(
        `.${POST_COPY_BOX_CLASS}`
      );


    if (!box) {

      return;

    }


    const ok =
      await copyPostTextToClipboard(
        postCopyBoxPlainText(
          box
        )
      );


    flashPostCopyBoxResult(
      button,
      ok
    );

  }
);
