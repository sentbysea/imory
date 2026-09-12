/* =========================================================
   POSTS VIEW — 하이라이팅 모드 · 말풍선 · 메모 팝업 (HIGHLIGHT-1 §4~6)

   글 읽기 화면 위에서 일어나는 모든 하이라이트 조작. 저장은 하지 않고
   (posts-view-highlight-store.js), 위치 계산도 하지 않는다
   (posts-view-highlight-anchor.js) — 이 파일은 **화면과 조작**만 맡는다.

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §2, §5, §6


   ★ 세 가지 상태

     읽기          누구나. 메모가 달린 하이라이트를 누르면 메모를 읽는
                   말풍선이 열린다. 편집 도구는 없다.
     하이라이팅    주인장만. 범위를 고르면 색 목록이 뜨고, 저장된
                   하이라이트를 누르면 '메모 / 삭제' 말풍선이 열린다.
     메모 작성     위 둘 어디서든 열리는 팝업.

   모드에 들어가도 본문 레이아웃은 그대로다 — 화면을 다시 그리지 않고
   작은 표시 띠 하나와 '완료' 버튼만 더한다(요구사항 4).


   ★ 선택이 풀려 적용되지 않는 문제 (요구사항 4)

   두 겹으로 막는다.
     1) 색 목록을 여는 **그 순간** 선택 범위를 읽어 저장할 값
        (excerpt/prefix/suffix/textStart)을 이미 확정해 둔다. 그 뒤
        선택이 풀리든 말든 저장에 쓰이는 값은 변하지 않는다.
     2) 색 목록 안의 모든 버튼은 pointerdown에서 기본 동작을 막는다
        (posts/editor/posts-color-picker.js의 bindImoryTapButton) —
        애초에 선택이 풀리지 않는다.

   ★ 본문 편집 명령과 섞지 않는다 (요구사항 4)

   색 목록 UI만 에디터와 같은 것을 쓴다(openImoryColorMenu). 고른 색으로
   하는 일은 전혀 다르다 — document.execCommand도, 본문 저장도 없고
   save_own_post_highlight RPC 하나만 부른다.

   의존(classic script, 먼저 로드돼야 함):
   posts-view-popover.js · posts-view-highlight-anchor.js ·
   posts-view-highlight-store.js · posts/editor/posts-color-picker.js ·
   posts/view/posts-view-tools-menu.js(showPostViewerToast).
========================================================== */


/* 지금 하이라이트가 걸려 있는 본문 그릇 */

let postHighlightRoot =
  null;


let postHighlightContext =
  {
    postId: null,

    isOwner: false,

    /* 실제로 칠해진 id — 여기 없으면 "원문이 변경되어 찾을 수 없음" */
    placed:
      new Set()
  };


let postHighlightModeOn =
  false;


let postHighlightModeBar =
  null;


let postHighlightSelectionTimer =
  0;


/* 지금 말풍선이 기준으로 삼은 사각형(스크롤을 따라가기 위해 다시 잰다) */

let postHighlightBubbleAnchor =
  null;


/* 기본 하이라이트 색 — 색 목록 맨 앞에 붙는다 */

const POST_HIGHLIGHT_DEFAULT_COLOR =
  "#f6e0c8";



/* =========================================================
   본문에 하이라이트 얹기

   각 렌더러가 본문을 그린 **직후** 부른다. 본문 innerHTML이 통째로
   바뀌는 지점이므로 이전 표시는 자동으로 사라져 있다.
========================================================== */

async function renderPostHighlights(
  options = {}
) {

  teardownPostHighlightScreen();


  const root =
    options.bodyTarget ||
    null;


  postHighlightRoot =
    root;


  postHighlightContext =
    {
      postId:
        options.postId ??
        null,

      isOwner:
        Boolean(options.isOwner),

      placed:
        new Set()
    };


  if (
    !root ||
    postHighlightContext.postId === null
  ) {

    return;

  }


  const items =
    await loadPostHighlights(
      postHighlightContext.postId,
      {
        secretPassword:
          options.secretPassword ||
          null
      }
    );


  /*
    본문이 그 사이 다른 글로 바뀌었으면 그리지 않는다 — 늦은 응답이
    최신 화면을 덮어쓰지 않게 한다.
  */

  if (
    postHighlightRoot !== root ||
    !root.isConnected
  ) {

    return;

  }


  postHighlightContext.placed =
    applyPostHighlights(
      root,
      items
    );


  /*
    이번에 어떤 카드가 자리를 찾았고 못 찾았는지 적어 둔다 — 메모
    카테고리의 카드가 "원문에서 위치를 찾을 수 없음"을 표시할 때
    쓰는 마지막 확인 결과다(posts-view-highlight-store.js).
  */

  recordPostHighlightPlacement(
    items,
    postHighlightContext.placed
  );


  /* 메모 카드에서 "원문 보기"로 들어왔으면 그 자리까지 데려간다 */

  focusRequestedPostHighlight();


  root.addEventListener(
    "click",
    handlePostHighlightClick
  );


  root.setAttribute(
    "data-post-highlights",
    "on"
  );

}


function teardownPostHighlightScreen() {

  exitPostHighlightMode({
    silent: true
  });


  closeImoryPopover({
    silent: true
  });


  closePostMemoPopup({
    silent: true
  });


  if (postHighlightRoot) {

    postHighlightRoot.removeEventListener(
      "click",
      handlePostHighlightClick
    );


    postHighlightRoot.removeAttribute(
      "data-post-highlights"
    );

  }


  postHighlightRoot =
    null;


  postHighlightBubbleAnchor =
    null;

}



/* =========================================================
   하이라이팅 모드
========================================================== */

function enterPostHighlightMode() {

  if (
    !postHighlightRoot ||
    !postHighlightContext.isOwner ||
    postHighlightModeOn
  ) {

    return;

  }


  postHighlightModeOn =
    true;


  document.documentElement.setAttribute(
    "data-post-highlight-mode",
    "on"
  );


  showPostHighlightModeBar();


  document.addEventListener(
    "selectionchange",
    handlePostHighlightSelectionChange
  );

}


function exitPostHighlightMode(
  options = {}
) {

  if (!postHighlightModeOn) {

    /* 모드가 아니어도 띠가 남아 있으면 치운다 */

    hidePostHighlightModeBar();


    return;

  }


  postHighlightModeOn =
    false;


  document.documentElement.removeAttribute(
    "data-post-highlight-mode"
  );


  document.removeEventListener(
    "selectionchange",
    handlePostHighlightSelectionChange
  );


  window.clearTimeout(
    postHighlightSelectionTimer
  );


  hidePostHighlightModeBar();


  if (!options.silent) {

    closeImoryPopover({
      silent: true
    });

  }

}


function isPostHighlightModeOn() {

  return postHighlightModeOn;

}


function showPostHighlightModeBar() {

  if (
    postHighlightModeBar &&
    postHighlightModeBar.isConnected
  ) {

    postHighlightModeBar.hidden =
      false;


    return;

  }


  const bar =
    document.createElement("div");


  bar.className =
    "post-highlight-mode-bar";


  bar.setAttribute(
    "data-post-hl-ui",
    "1"
  );


  bar.setAttribute(
    "role",
    "status"
  );


  const label =
    document.createElement("span");


  label.className =
    "post-highlight-mode-label";


  label.textContent =
    "하이라이팅 모드";


  const hint =
    document.createElement("span");


  hint.className =
    "post-highlight-mode-hint";


  hint.textContent =
    "본문에서 문장을 고르세요";


  const done =
    document.createElement("button");


  done.type =
    "button";


  done.className =
    "post-highlight-mode-done";


  done.textContent =
    "완료";


  done.addEventListener(
    "click",
    () => {

      exitPostHighlightMode();

    }
  );


  bar.appendChild(label);

  bar.appendChild(hint);

  bar.appendChild(done);


  document.body.appendChild(bar);


  postHighlightModeBar =
    bar;

}


function hidePostHighlightModeBar() {

  if (postHighlightModeBar) {

    postHighlightModeBar.remove();


    postHighlightModeBar =
      null;

  }

}



/* =========================================================
   범위 선택 → 색 목록

   모바일은 꾹 눌러, 데스크톱은 드래그로 고른다 — 둘 다 브라우저의
   기본 텍스트 선택이고, 끝났다는 신호가 selectionchange다. 고르는
   중에는 계속 바뀌므로 잠깐 멈춘 뒤에만 색 목록을 연다.
========================================================== */

function handlePostHighlightSelectionChange() {

  window.clearTimeout(
    postHighlightSelectionTimer
  );


  postHighlightSelectionTimer =
    window.setTimeout(
      offerPostHighlightColorMenu,
      320
    );

}


function offerPostHighlightColorMenu() {

  if (
    !postHighlightModeOn ||
    !postHighlightRoot
  ) {

    return;

  }


  const selection =
    window.getSelection();


  if (
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed
  ) {

    return;

  }


  const range =
    selection.getRangeAt(0);


  /*
    ★ 지금 확정한다. 아래에서 색 목록을 여는 사이에 선택이 풀려도
    저장에 쓰이는 값은 이 객체다(요구사항 4).
  */

  const anchor =
    rangeToPostHighlightAnchor(
      postHighlightRoot,
      range
    );


  if (!anchor) {

    /*
      본문 밖이 섞였거나 글자가 없는 선택 — 저장 대상이 아니다.
      조용히 무시한다(고르는 도중에도 계속 들어오는 신호다).
    */

    return;

  }


  /* 자리 기준도 지금 굳힌다 — 선택이 풀리면 range는 무의미해진다 */

  const rect =
    range.getBoundingClientRect();


  const frozenRect =
    {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height
    };


  openImoryColorMenu({

    anchor:
      {
        getBoundingClientRect:
          () =>
            frozenRect
      },

    color:
      POST_HIGHLIGHT_DEFAULT_COLOR,

    presetColor:
      POST_HIGHLIGHT_DEFAULT_COLOR,

    onPickPreset:
      (color) => {

        commitPostHighlight(
          anchor,
          color
        );

      },

    onCustomBegin:
      () =>
        true,

    onCustomApply:
      (color) => {

        commitPostHighlight(
          anchor,
          color
        );

      },

    onCustom:
      (color) => {

        commitPostHighlight(
          anchor,
          color
        );

      }

  });

}


/*
  실제 저장. 결과에 따라 화면을 정확히 맞춘다 — 실패를 성공처럼
  보여주지 않는다(요구사항 8).
*/

async function commitPostHighlight(
  anchor,
  color
) {

  if (
    !postHighlightRoot ||
    postHighlightContext.postId === null
  ) {

    return;

  }


  const result =
    await savePostHighlight({
      postId:
        postHighlightContext.postId,

      color,

      anchor
    });


  if (!result.ok) {

    if (result.reason === "overlap") {

      showPostViewerToast(
        "이미 표시한 부분과 겹칩니다 — 그 표시를 눌러 색을 바꿔 주세요",
        "error"
      );

    }

    else if (result.reason === "busy") {

      /* 앞의 저장이 끝나지 않았다 — 조용히 무시한다(중복 저장 방지) */

    }

    else {

      console.error(
        "[post-highlights] 저장 실패:",
        result.error
      );


      showPostViewerToast(
        "저장하지 못했습니다",
        "error"
      );

    }


    return;

  }


  /* 선택을 풀고 다시 칠한다 */

  try {

    window.getSelection()?.removeAllRanges();

  }

  catch (err) {

    /* 무시 */

  }


  repaintPostHighlights();


  showPostViewerToast(
    result.status === "recolored"
      ? "색을 바꿨습니다"
      : "메모 카드를 만들었습니다",
    "ok"
  );

}


function repaintPostHighlights() {

  if (!postHighlightRoot) {

    return;

  }


  const items =
    getCachedPostHighlights(
      postHighlightContext.postId
    );


  postHighlightContext.placed =
    applyPostHighlights(
      postHighlightRoot,
      items
    );


  recordPostHighlightPlacement(
    items,
    postHighlightContext.placed
  );

}


/* =========================================================
   메모 카드 → 원문의 그 자리 (요구사항 6)

   주소에는 발췌문도 메모도 싣지 않는다. 카드를 누를 때 "이 카드로
   간다"만 이 세션에 적어 두고(sessionStorage), 도착한 글이 그 카드를
   실제로 찾았을 때만 그 자리로 데려간다. 못 찾으면 글은 정상적으로
   열리고 이유를 알린다 — 엉뚱한 문장으로 데려가지 않는다.
========================================================== */

const POST_HIGHLIGHT_FOCUS_KEY =
  "imory-highlight-focus";


function requestPostHighlightFocus(
  id
) {

  try {

    window.sessionStorage.setItem(
      POST_HIGHLIGHT_FOCUS_KEY,
      String(id)
    );

  }

  catch (err) {

    /* 저장이 막히면 그냥 글 맨 위로 간다 */

  }

}


function takeRequestedPostHighlightFocus() {

  try {

    const value =
      window.sessionStorage.getItem(
        POST_HIGHLIGHT_FOCUS_KEY
      );


    window.sessionStorage.removeItem(
      POST_HIGHLIGHT_FOCUS_KEY
    );


    return value ||
      null;

  }

  catch (err) {

    return null;

  }

}


function focusRequestedPostHighlight() {

  const id =
    takeRequestedPostHighlightFocus();


  if (
    !id ||
    !postHighlightRoot
  ) {

    return;

  }


  /* 이 글의 카드가 아니면 아무 일도 없다 */

  if (!getCachedPostHighlightById(id)) {

    return;

  }


  if (!postHighlightContext.placed.has(String(id))) {

    showPostViewerToast(
      "원문이 변경되어 위치를 찾을 수 없습니다",
      "error"
    );


    return;

  }


  const span =
    postHighlightRoot.querySelector(
      `.${POST_HIGHLIGHT_SPAN_CLASS}[${POST_HIGHLIGHT_ID_ATTR}="${String(id).replace(/"/g, "")}"]`
    );


  if (!span) {

    return;

  }


  window.setTimeout(
    () => {

      try {

        span.scrollIntoView({
          block: "center",

          behavior: "smooth"
        });

      }

      catch (err) {

        span.scrollIntoView();

      }


      span.setAttribute(
        "data-post-highlight-focus",
        "1"
      );


      window.setTimeout(
        () => {

          span.removeAttribute(
            "data-post-highlight-focus"
          );

        },
        1600
      );

    },
    60
  );

}



/* =========================================================
   하이라이트 클릭 → 말풍선
========================================================== */

function handlePostHighlightClick(
  event
) {

  const span =
    event.target?.closest?.(
      `.${POST_HIGHLIGHT_SPAN_CLASS}`
    );


  if (
    !span ||
    !postHighlightRoot ||
    !postHighlightRoot.contains(span)
  ) {

    return;

  }


  const id =
    span.getAttribute(
      POST_HIGHLIGHT_ID_ATTR
    );


  const item =
    getCachedPostHighlightById(id);


  if (!item) {

    return;

  }


  /*
    읽기 상태에서는 메모가 있을 때만 반응한다 — 메모 없는 하이라이트는
    그냥 표시일 뿐이라 아무것도 열지 않는다(요구사항 5).
  */

  if (
    !postHighlightModeOn &&
    !item.note
  ) {

    return;

  }


  event.preventDefault();


  /*
    ★ 누른 줄을 기준으로 삼는다 (요구사항 5 마지막)

    여러 줄에 걸친 하이라이트는 조각마다 <span>이 따로 있고, 한 조각도
    줄바꿈되면 client rect가 여럿이다. 누른 지점이 들어 있는 사각형을
    고른다 — 없으면 그 조각의 첫 줄.
  */

  postHighlightBubbleAnchor =
    resolvePostHighlightLineAnchor(
      span,
      event.clientX,
      event.clientY
    );


  openPostHighlightBubble(
    item
  );

}


function resolvePostHighlightLineAnchor(
  span,
  x,
  y
) {

  return () => {

    if (
      !span ||
      !span.isConnected
    ) {

      return null;

    }


    const rects =
      Array.from(
        span.getClientRects()
      );


    if (!rects.length) {

      return null;

    }


    const hit =
      rects.find(
        (rect) =>
          y >= rect.top - 2 &&
          y <= rect.bottom + 2 &&
          x >= rect.left - 2 &&
          x <= rect.right + 2
      );


    return (
      hit ||
      rects[0]
    );

  };

}


function repositionPostHighlightBubble() {

  scheduleImoryPopoverReposition();

}


function openPostHighlightBubble(
  item
) {

  const isOwnerEditing =
    postHighlightModeOn &&
    postHighlightContext.isOwner;


  openImoryPopover({

    name:
      "post-highlight",

    className:
      isOwnerEditing
        ? "imory-popover--menu"
        : "imory-popover--note",

    anchorRect:
      postHighlightBubbleAnchor ||
      (() => null),

    render:
      (body) => {

        if (!isOwnerEditing) {

          renderPostHighlightNoteBubble(
            body,
            item
          );


          return;

        }


        renderImoryPopoverMenu(
          body,
          [
            {
              label:
                item.note
                  ? "메모 수정"
                  : "메모",

              onSelect:
                () => {

                  openPostMemoPopup(item);

                }
            },

            {
              label:
                "삭제",

              danger:
                true,

              /*
                메모가 포함된 하이라이트는 삭제 범위를 분명히
                알린다(요구사항 5).
              */
              hint:
                item.note
                  ? "메모도 함께"
                  : "",

              onSelect:
                () => {

                  confirmDeletePostHighlight(item);

                }
            }
          ]
        );

      }

  });

}


/* 읽기 상태의 말풍선 — 메모를 읽기만 한다(편집 도구 없음) */

function renderPostHighlightNoteBubble(
  body,
  item
) {

  const note =
    document.createElement("div");


  note.className =
    "imory-popover-note";


  note.textContent =
    item.note;


  body.appendChild(note);

}


async function confirmDeletePostHighlight(
  item
) {

  const message =
    item.note
      ? "이 하이라이트와 메모 카드를 함께 지웁니다. 계속할까요?"
      : "이 하이라이트를 지웁니다. 계속할까요?";


  if (!window.confirm(message)) {

    return;

  }


  const result =
    await deletePostHighlight(
      item.id
    );


  if (!result.ok) {

    console.error(
      "[post-highlights] 삭제 실패:",
      result.error
    );


    showPostViewerToast(
      "삭제하지 못했습니다",
      "error"
    );


    return;

  }


  clearPostHighlightMarks(
    postHighlightRoot,
    item.id
  );


  postHighlightContext.placed.delete(
    String(item.id)
  );


  showPostViewerToast(
    "지웠습니다",
    "ok"
  );

}



/* =========================================================
   메모 작성 팝업 (요구사항 6)

     위쪽  선택한 발췌문
     아래쪽 메모 입력 textarea
     오른쪽 아래 SAVE

   기존 메모가 있으면 그 내용을 불러온다. 저장에 실패하면 쓴 내용을
   그대로 남긴다 — 팝업을 닫지 않는다.
========================================================== */

let postMemoPopupRoot =
  null;


let postMemoPopupSession =
  null;


function openPostMemoPopup(
  item,
  options = {}
) {

  closeImoryPopover({
    silent: true
  });


  closePostMemoPopup({
    silent: true
  });


  const overlay =
    document.createElement("div");


  overlay.className =
    "post-memo-popup";


  overlay.setAttribute(
    "data-post-hl-ui",
    "1"
  );


  const panel =
    document.createElement("div");


  panel.className =
    "post-memo-popup-panel";


  panel.setAttribute(
    "role",
    "dialog"
  );


  panel.setAttribute(
    "aria-label",
    "메모"
  );


  const excerpt =
    document.createElement("blockquote");


  excerpt.className =
    "post-memo-popup-excerpt";


  excerpt.style.borderLeftColor =
    item.color ||
    POST_HIGHLIGHT_DEFAULT_COLOR;


  excerpt.textContent =
    item.excerpt;


  const field =
    document.createElement("textarea");


  field.className =
    "post-memo-popup-field";


  field.placeholder =
    "메모";


  field.value =
    item.note ||
    "";


  field.setAttribute(
    "data-popover-focus",
    "1"
  );


  const footer =
    document.createElement("div");


  footer.className =
    "post-memo-popup-footer";


  const status =
    document.createElement("span");


  status.className =
    "post-memo-popup-status";


  const cancel =
    document.createElement("button");


  cancel.type =
    "button";


  cancel.className =
    "post-memo-popup-cancel";


  cancel.textContent =
    "취소";


  const save =
    document.createElement("button");


  save.type =
    "button";


  save.className =
    "post-memo-popup-save";


  save.textContent =
    "SAVE";


  footer.appendChild(status);

  footer.appendChild(cancel);

  footer.appendChild(save);


  panel.appendChild(excerpt);

  panel.appendChild(field);

  panel.appendChild(footer);


  overlay.appendChild(panel);


  document.body.appendChild(overlay);


  postMemoPopupRoot =
    overlay;


  postMemoPopupSession =
    {
      id:
        item.id,

      onSaved:
        options.onSaved ||
        null
    };


  cancel.addEventListener(
    "click",
    () => {

      closePostMemoPopup();

    }
  );


  overlay.addEventListener(
    "pointerdown",
    (event) => {

      if (event.target === overlay) {

        closePostMemoPopup();

      }

    }
  );


  overlay.addEventListener(
    "keydown",
    (event) => {

      if (event.key === "Escape") {

        event.preventDefault();


        closePostMemoPopup();

      }

    }
  );


  /*
    모바일 키보드가 올라와도 입력창과 SAVE에 닿아야 한다(요구사항 6).
    키보드가 열리면 visualViewport가 줄어드는데, 그때 패널을 화면 안으로
    다시 끌어온다.
  */

  field.addEventListener(
    "focus",
    () => {

      window.setTimeout(
        () => {

          try {

            panel.scrollIntoView({
              block: "nearest",

              behavior: "smooth"
            });

          }

          catch (err) {

            /* 무시 */

          }

        },
        200
      );

    }
  );


  save.addEventListener(
    "click",
    async () => {

      if (save.disabled) {

        return;

      }


      save.disabled =
        true;


      status.textContent =
        "저장 중...";


      status.setAttribute(
        "data-tone",
        "pending"
      );


      const result =
        await updatePostHighlightNote(
          item.id,
          field.value
        );


      if (!result.ok) {

        /* 쓴 내용을 그대로 남긴다 — 팝업을 닫지 않는다 */

        console.error(
          "[post-highlights] 메모 저장 실패:",
          result.error
        );


        status.textContent =
          "저장하지 못했습니다";


        status.setAttribute(
          "data-tone",
          "error"
        );


        save.disabled =
          false;


        return;

      }


      const note =
        field.value.trim();


      item.note =
        note;


      markPostHighlightHasNote(
        postHighlightRoot,
        item.id,
        Boolean(note)
      );


      postMemoPopupSession?.onSaved?.(note);


      closePostMemoPopup();


      showPostViewerToast(
        note
          ? "메모를 저장했습니다"
          : "메모를 지웠습니다",
        "ok"
      );

    }
  );


  window.setTimeout(
    () => {

      try {

        field.focus({
          preventScroll: true
        });

      }

      catch (err) {

        field.focus();

      }

    },
    0
  );

}


function closePostMemoPopup(
  options = {}
) {

  if (postMemoPopupRoot) {

    postMemoPopupRoot.remove();


    postMemoPopupRoot =
      null;

  }


  postMemoPopupSession =
    null;


  void options;

}
