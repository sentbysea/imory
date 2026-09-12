/* =========================================================
   POSTS VIEW — 글 뷰어 도구 메뉴 (HIGHLIGHT-1 §3)

   글 읽기 화면의 점 세 개(⋮)와 그 메뉴. 예전의 EDIT 버튼 자리를
   대신한다.

     주인장 : 글자 크기 조절 · 하이라이팅 모드 · 글 링크 복사 · 글 수정
     방문자 : 글자 크기 조절 · 글 링크 복사

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §2

   ★ 점 세 개는 기본 외형일 뿐이다 (요구사항 3 마지막, 10)

   스킨은 자기 자리에 <a href="...?tools=1">를 그려 모양·문구·위치를
   마음대로 정할 수 있다. 그러면 플랫폼은 자기 버튼을 접고 그 링크에
   같은 메뉴를 연결한다 — 같은 동작이 화면에 두 번 나타나지 않는다.
   판정 근거는 스킨 이름도 클래스도 아니고 **주소**뿐이다
   (skin/skin-owner-entry.js가 EDIT/WRITE를 알아보는 방법과 같다).

   스킨이 아무것도 그리지 않으면 플랫폼의 ⋮가 그대로 남는다 — 그래서
   어떤 스킨에서도 이 기능에 닿을 수 있다.

   ★ 글자 크기

   계산·저장은 기존 posts/posts-reader-scale.js를 그대로 쓴다(요구사항 3
   "기존 조절 로직이 있다면 우선 재사용한다"). 바뀌는 것은 이번 읽기
   화면의 인라인 font-size 하나뿐이고 원본 본문·프리셋·스킨 저장값은
   건드리지 않는다.

   ★ 글 링크 복사

   기존의 정식 공개 글 주소 생성 로직(buildPostRoute)을 그대로 쓴다.
   관리용 쿼리(?manage/?write/?edit/?tools/?highlight)도, 초대 토큰도,
   비밀번호도 붙지 않는다 — 경로만 만들고 origin을 앞에 붙인다.

   의존(classic script, 이 파일보다 먼저 로드돼야 함):
   core/lib/site-path.js · posts/editor/posts-refs.js ·
   posts/posts-reader-scale.js · posts/view/posts-view-popover.js ·
   posts/style/posts-body-blocks.js(copyPostTextToClipboard).
========================================================== */


/*
  지금 열려 있는 글에 대한 도구 상태. 매 글마다
  setupPostViewerTools()가 다시 세운다.
*/

let postViewerToolsState =
  {
    postId: null,

    isOwner: false,

    bodyTarget: null,

    /* 스킨이 그린 도구 링크들(있으면 플랫폼 버튼을 접는다) */
    skinAnchors: []
  };


function getPostViewerToolsState() {

  return postViewerToolsState;

}


/* =========================================================
   setupPostViewerTools(options)

   각 렌더러가 "이 글의 화면이 확정된 직후" 한 번 부른다.

     postId      이 글
     isOwner     보는 사람이 이 글의 주인인가(표시용 — 권한은 DB가)
     bodyTarget  본문이 그려진 그릇(글자 크기 · 하이라이트의 기준)
     skinRoot    스킨이 그려진 컨테이너(없으면 legacy 화면)
     enabled     false면 도구 자체를 감춘다(비밀글 잠김 화면 등)
========================================================== */

function setupPostViewerTools(
  options = {}
) {

  closeImoryPopover({
    silent: true
  });


  /* 이전 글에서 연결했던 스킨 링크의 핸들러를 떼어낸다 */

  postViewerToolsState.skinAnchors.forEach(
    (entry) => {

      entry.anchor.removeEventListener(
        "click",
        entry.handler
      );

    }
  );


  postViewerToolsState =
    {
      postId:
        options.postId ??
        null,

      isOwner:
        Boolean(options.isOwner),

      bodyTarget:
        options.bodyTarget ||
        null,

      skinAnchors:
        []
    };


  if (
    !options.enabled ||
    postViewerToolsState.postId === null
  ) {

    setPostToolsButtonVisible(false);


    return;

  }


  /*
    스킨이 그린 도구 링크를 찾는다. <a href>의 쿼리만 본다 —
    어떤 스킨이든 그 주소를 그리기만 하면 인정된다.
  */

  const anchors =
    findSkinToolsAnchors(
      options.skinRoot
    );


  anchors.forEach(
    (anchor) => {

      const handler =
        (event) => {

          /* 새 탭/수정키 클릭 등 브라우저 기본 동작은 존중한다 */

          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {

            return;

          }


          event.preventDefault();


          togglePostToolsMenu(anchor);

        };


      anchor.addEventListener(
        "click",
        handler
      );


      postViewerToolsState.skinAnchors.push({
        anchor,

        handler
      });

    }
  );


  setPostToolsButtonVisible(
    anchors.length === 0
  );

}


/*
  스킨이 그린 도구 링크 — ?tools=1을 가리키는 같은 오리진 <a href>.
  ?highlight=1은 주인장 전용 지름길이라 주인장에게만 인정한다.
*/

function findSkinToolsAnchors(
  skinRoot
) {

  const found =
    [];


  if (
    !skinRoot ||
    typeof skinRoot.querySelectorAll !== "function"
  ) {

    return found;

  }


  skinRoot
    .querySelectorAll("a[href]")
    .forEach(
      (anchor) => {

        let url;


        try {

          url =
            new URL(
              anchor.href,
              window.location.href
            );

        }

        catch (err) {

          return;

        }


        if (url.origin !== window.location.origin) {

          return;

        }


        if (isSiteToolsRequested(url.search)) {

          found.push(anchor);

        }

      }
    );


  return found;

}


function setPostToolsButtonVisible(
  visible
) {

  if (!postToolsButton) {

    return;

  }


  postToolsButton.hidden =
    !visible;


  postToolsButton.setAttribute(
    "aria-expanded",
    "false"
  );

}


/* =========================================================
   메뉴 열기
========================================================== */

function togglePostToolsMenu(
  anchor
) {

  if (isImoryPopoverOpen("post-tools")) {

    closeImoryPopover();


    return;

  }


  openPostToolsMenu(anchor);

}


function openPostToolsMenu(
  anchor
) {

  const trigger =
    anchor ||
    postToolsButton;


  if (!trigger) {

    return;

  }


  if (postToolsButton) {

    postToolsButton.setAttribute(
      "aria-expanded",
      trigger === postToolsButton
        ? "true"
        : "false"
    );

  }


  openImoryPopover({
    name:
      "post-tools",

    className:
      "imory-popover--menu",

    anchorRect:
      imoryPopoverRectOf(trigger),

    returnFocus:
      trigger,

    onClose:
      () => {

        if (postToolsButton) {

          postToolsButton.setAttribute(
            "aria-expanded",
            "false"
          );

        }

      },

    render:
      (body) => {

        renderImoryPopoverMenu(
          body,
          buildPostToolsMenuItems()
        );

      }
  });

}


function buildPostToolsMenuItems() {

  const items =
    [];


  /*
    글자 크기 — 메뉴 안에서 바로 조절한다(메뉴를 닫지 않는다).
    HTML 모드 글처럼 기준 크기가 없는 글에서는 줄 자체를 내지 않는다.
  */

  if (
    typeof readerFontScaleAdjustable === "function" &&
    readerFontScaleAdjustable()
  ) {

    items.push({
      custom:
        buildPostFontScaleRow()
    });


    items.push(null);

  }


  if (postViewerToolsState.isOwner) {

    items.push({
      label:
        "하이라이팅 모드",

      onSelect:
        () => {

          if (typeof enterPostHighlightMode === "function") {

            enterPostHighlightMode();

          }

        }
    });

  }


  items.push({
    label:
      "글 링크 복사",

    onSelect:
      async () => {

        const url =
          buildCanonicalPostUrl(
            postViewerToolsState.postId
          );


        if (!url) {

          showPostViewerToast(
            "주소를 만들 수 없습니다",
            "error"
          );


          return;

        }


        const ok =
          typeof copyPostTextToClipboard === "function"
            ? await copyPostTextToClipboard(url)
            : false;


        /* 실패를 성공으로 표시하지 않는다 */

        showPostViewerToast(
          ok
            ? "링크를 복사했습니다"
            : "복사하지 못했습니다",
          ok
            ? "ok"
            : "error"
        );

      }
  });


  if (postViewerToolsState.isOwner) {

    items.push({
      label:
        "글 수정",

      onSelect:
        () => {

          if (
            postViewerToolsState.postId !== null &&
            typeof openPostEditor === "function"
          ) {

            openPostEditor(
              postViewerToolsState.postId
            );

          }

        }
    });

  }


  return items;

}


/*
  정식 공개 글 주소. 기존 경로 생성 로직(buildPostRoute)만 쓰고
  쿼리는 하나도 붙이지 않는다.
*/

function buildCanonicalPostUrl(
  postId
) {

  if (
    postId === null ||
    postId === undefined ||
    typeof buildPostRoute !== "function"
  ) {

    return null;

  }


  return (
    window.location.origin +
    buildPostRoute(
      `/post/${postId}`
    )
  );

}


/* =========================================================
   글자 크기 줄 (− 100% +)
========================================================== */

function buildPostFontScaleRow() {

  const row =
    document.createElement("div");


  row.className =
    "imory-popover-row";


  const label =
    document.createElement("span");


  label.className =
    "imory-popover-row-label";


  label.textContent =
    "글자 크기";


  const controls =
    document.createElement("div");


  controls.className =
    "imory-popover-row-controls";


  const down =
    document.createElement("button");


  down.type =
    "button";


  down.className =
    "imory-popover-step";


  down.textContent =
    "−";


  down.setAttribute(
    "aria-label",
    "글자 크기 작게"
  );


  down.setAttribute(
    "data-popover-focus",
    "1"
  );


  const value =
    document.createElement("span");


  value.className =
    "imory-popover-step-value";


  const up =
    document.createElement("button");


  up.type =
    "button";


  up.className =
    "imory-popover-step";


  up.textContent =
    "+";


  up.setAttribute(
    "aria-label",
    "글자 크기 크게"
  );


  const sync =
    () => {

      const scale =
        getReaderFontScale();


      value.textContent =
        `${Math.round(scale * 100)}%`;


      down.disabled =
        scale <= READER_FONT_SCALE_MIN + 0.001;

      up.disabled =
        scale >= READER_FONT_SCALE_MAX - 0.001;

    };


  down.addEventListener(
    "click",
    () => {

      setReaderFontScale(
        getReaderFontScale() -
        READER_FONT_SCALE_STEP
      );


      sync();


      /* 글자 크기가 바뀌면 말풍선 자리도 다시 잰다(요구사항 5) */

      scheduleImoryPopoverReposition();


      if (typeof repositionPostHighlightBubble === "function") {

        repositionPostHighlightBubble();

      }

    }
  );


  up.addEventListener(
    "click",
    () => {

      setReaderFontScale(
        getReaderFontScale() +
        READER_FONT_SCALE_STEP
      );


      sync();


      scheduleImoryPopoverReposition();


      if (typeof repositionPostHighlightBubble === "function") {

        repositionPostHighlightBubble();

      }

    }
  );


  sync();


  controls.appendChild(down);

  controls.appendChild(value);

  controls.appendChild(up);


  row.appendChild(label);

  row.appendChild(controls);


  return row;

}



/* =========================================================
   토스트 — 성공/실패를 구분해 알린다
========================================================== */

let postViewerToastTimer =
  0;


function showPostViewerToast(
  message,
  tone
) {

  let toast =
    document.getElementById(
      "postViewerToast"
    );


  if (!toast) {

    toast =
      document.createElement("div");


    toast.id =
      "postViewerToast";


    toast.className =
      "post-viewer-toast";


    toast.setAttribute(
      "role",
      "status"
    );


    toast.setAttribute(
      "data-post-hl-ui",
      "1"
    );


    document.body.appendChild(toast);

  }


  toast.textContent =
    message;


  toast.setAttribute(
    "data-tone",
    tone ||
    "ok"
  );


  toast.classList.add(
    "is-visible"
  );


  window.clearTimeout(
    postViewerToastTimer
  );


  postViewerToastTimer =
    window.setTimeout(
      () => {

        toast.classList.remove(
          "is-visible"
        );

      },
      2200
    );

}



/* =========================================================
   플랫폼 버튼의 클릭
========================================================== */

postToolsButton
  ?.addEventListener(
    "click",
    () => {

      togglePostToolsMenu(
        postToolsButton
      );

    }
  );
