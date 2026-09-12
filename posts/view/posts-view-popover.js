/* =========================================================
   POSTS VIEW — 팝오버 (HIGHLIGHT-1)

   화면에 떠서 기준 요소를 따라다니는 작은 판 하나. 셋이 같은 것을
   쓴다 — 글 뷰어 도구 메뉴(⋮), 하이라이트 말풍선(메모/삭제), 메모
   카드의 ⋮ 메뉴.

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §5

   ★ 왜 document.body에 붙이는가

   #postArea에 backdrop-filter가 걸려 있어 그 안에서는 position: fixed의
   기준이 뷰포트가 아니라 #postArea가 된다(posts/posts-base.css의 소유자
   도구 주석에 같은 함정이 적혀 있다). 그래서 이 판은 항상 body의
   자식으로 만들고 fixed로 놓는다 — 스킨이 어떤 변형/필터를 쓰든
   화면 좌표가 흔들리지 않는다.

   ★ 자리 규칙 (요구사항 5)

     · 기준 사각형 바로 위에 놓는다. 위가 모자라면 아래로 뒤집는다.
     · 좌우는 화면 안으로 당긴다(가장자리에서 잘리지 않는다).
     · 스크롤·회전·크기 변경·글자 크기 변경이 있으면 다시 잰다.
     · 기준이 화면 밖으로 나가면 숨긴다(닫지는 않는다 — 다시 들어오면
       그대로 보인다).

   기준은 요소가 아니라 **사각형을 돌려주는 함수**로 받는다. 여러 줄에
   걸친 하이라이트에서 "누른 줄"을 기준으로 삼으려면 요소 하나의
   getBoundingClientRect로는 부족하기 때문이다(그 값은 여러 줄 전체를
   감싼 사각형이다).

   ★ 키보드

   Escape로 닫고, 위/아래 화살표로 항목 사이를 오간다. 열 때 첫 항목에
   포커스를 주고, 닫을 때 열었던 버튼으로 포커스를 돌려준다.

   classic script. 의존 없음(순수 DOM).
========================================================== */


let imoryPopoverRoot =
  null;


let imoryPopoverSession =
  null;


let imoryPopoverFrame =
  0;


/* 화면 가장자리에서 남겨 둘 여백 */

const IMORY_POPOVER_EDGE_GAP =
  12;


/* 기준 사각형과 판 사이 간격 */

const IMORY_POPOVER_ANCHOR_GAP =
  8;


function ensureImoryPopover() {

  if (
    imoryPopoverRoot &&
    imoryPopoverRoot.isConnected
  ) {

    return imoryPopoverRoot;

  }


  const root =
    document.createElement("div");


  root.className =
    "imory-popover";


  /*
    본문 평문 색인에서 빠져야 한다 — 이 판의 글자가 본문으로 세어지면
    하이라이트 위치가 어긋난다(posts-view-highlight-anchor.js).
  */

  root.setAttribute(
    "data-post-hl-ui",
    "1"
  );


  root.hidden =
    true;


  document.body.appendChild(root);


  imoryPopoverRoot =
    root;


  return root;

}


function isImoryPopoverOpen(
  name
) {

  return Boolean(
    imoryPopoverSession &&
    (
      !name ||
      imoryPopoverSession.name === name
    )
  );

}


function getImoryPopoverBody() {

  return (
    imoryPopoverSession
      ? imoryPopoverSession.body
      : null
  );

}


/* =========================================================
   openImoryPopover(options)

   options
     name        구분용 이름(같은 이름이면 다시 열 때 토글로 쓸 수 있다)
     anchorRect  () => DOMRect | null   기준 사각형(필수)
     returnFocus 닫을 때 포커스를 돌려줄 요소
     className   판에 더할 클래스
     render      (body) => void         내용을 그리는 함수
     onClose     () => void
========================================================== */

function openImoryPopover(
  options = {}
) {

  const root =
    ensureImoryPopover();


  closeImoryPopover({
    silent: true
  });


  root.className =
    "imory-popover" +
    (
      options.className
        ? ` ${options.className}`
        : ""
    );


  root.innerHTML =
    "";


  const body =
    document.createElement("div");


  body.className =
    "imory-popover-body";


  root.appendChild(body);


  imoryPopoverSession =
    {
      name:
        options.name ||
        "popover",

      anchorRect:
        typeof options.anchorRect === "function"
          ? options.anchorRect
          : () => null,

      returnFocus:
        options.returnFocus ||
        null,

      onClose:
        options.onClose ||
        null,

      body
    };


  if (typeof options.render === "function") {

    options.render(body);

  }


  root.hidden =
    false;


  positionImoryPopover();


  startImoryPopoverTracking();


  /* 첫 조작 대상에 포커스 — 키보드만으로도 쓸 수 있어야 한다 */

  const first =
    body.querySelector(
      "[data-popover-focus], button, a[href], textarea, input, select"
    );


  if (first && typeof first.focus === "function") {

    try {

      first.focus({
        preventScroll: true
      });

    }

    catch (err) {

      first.focus();

    }

  }


  return body;

}


function closeImoryPopover(
  options = {}
) {

  if (!imoryPopoverSession) {

    return;

  }


  const session =
    imoryPopoverSession;


  imoryPopoverSession =
    null;


  stopImoryPopoverTracking();


  if (imoryPopoverRoot) {

    imoryPopoverRoot.hidden =
      true;

    imoryPopoverRoot.innerHTML =
      "";

  }


  if (
    !options.silent &&
    session.returnFocus &&
    session.returnFocus.isConnected &&
    typeof session.returnFocus.focus === "function"
  ) {

    try {

      session.returnFocus.focus({
        preventScroll: true
      });

    }

    catch (err) {

      session.returnFocus.focus();

    }

  }


  if (
    !options.silent &&
    typeof session.onClose === "function"
  ) {

    session.onClose();

  }

}


/* =========================================================
   자리 잡기
========================================================== */

function positionImoryPopover() {

  if (
    !imoryPopoverSession ||
    !imoryPopoverRoot
  ) {

    return;

  }


  const rect =
    imoryPopoverSession.anchorRect();


  if (
    !rect ||
    !Number.isFinite(rect.top)
  ) {

    imoryPopoverRoot.style.visibility =
      "hidden";


    return;

  }


  const viewportWidth =
    window.innerWidth ||
    document.documentElement.clientWidth;

  const viewportHeight =
    window.innerHeight ||
    document.documentElement.clientHeight;


  /*
    기준이 화면 밖으로 완전히 나갔으면 숨긴다 — 닫지는 않는다.
    (요구사항 5 "대상 문장이 화면 밖으로 나가면 숨김")
  */

  if (
    rect.bottom < 0 ||
    rect.top > viewportHeight ||
    rect.right < 0 ||
    rect.left > viewportWidth
  ) {

    imoryPopoverRoot.style.visibility =
      "hidden";


    return;

  }


  imoryPopoverRoot.style.visibility =
    "visible";


  /*
    폭은 먼저 화면에 맞춰 묶어 둔다 — 재기 전에 정해야 높이가 맞다.
    모바일에서 화면 너비를 넘지 않는 것이 이 기능 전체의 규칙이다
    (요구사항 1).
  */

  imoryPopoverRoot.style.maxWidth =
    `${Math.max(160, viewportWidth - IMORY_POPOVER_EDGE_GAP * 2)}px`;


  const own =
    imoryPopoverRoot.getBoundingClientRect();


  /* 세로 — 위가 모자라면 아래로 */

  const above =
    rect.top - IMORY_POPOVER_ANCHOR_GAP - own.height;

  const below =
    rect.bottom + IMORY_POPOVER_ANCHOR_GAP;


  let top =
    above >= IMORY_POPOVER_EDGE_GAP
      ? above
      : below;


  if (top + own.height > viewportHeight - IMORY_POPOVER_EDGE_GAP) {

    top =
      Math.max(
        IMORY_POPOVER_EDGE_GAP,
        viewportHeight - IMORY_POPOVER_EDGE_GAP - own.height
      );

  }


  /* 가로 — 기준의 가운데에 맞추되 화면 안으로 당긴다 */

  let left =
    rect.left + rect.width / 2 - own.width / 2;


  left =
    Math.min(
      left,
      viewportWidth - IMORY_POPOVER_EDGE_GAP - own.width
    );

  left =
    Math.max(
      IMORY_POPOVER_EDGE_GAP,
      left
    );


  imoryPopoverRoot.style.top =
    `${Math.round(top)}px`;

  imoryPopoverRoot.style.left =
    `${Math.round(left)}px`;


  imoryPopoverRoot.setAttribute(
    "data-placement",
    above >= IMORY_POPOVER_EDGE_GAP
      ? "top"
      : "bottom"
  );

}


function scheduleImoryPopoverReposition() {

  if (imoryPopoverFrame) {

    return;

  }


  imoryPopoverFrame =
    requestAnimationFrame(
      () => {

        imoryPopoverFrame =
          0;


        positionImoryPopover();

      }
    );

}


function handleImoryPopoverPointerDown(
  event
) {

  if (!imoryPopoverSession) {

    return;

  }


  if (
    imoryPopoverRoot &&
    imoryPopoverRoot.contains(event.target)
  ) {

    return;

  }


  if (
    imoryPopoverSession.returnFocus &&
    imoryPopoverSession.returnFocus.contains?.(event.target)
  ) {

    /* 연 버튼을 다시 누른 것 — 그쪽 핸들러가 토글한다 */

    return;

  }


  closeImoryPopover();

}


function handleImoryPopoverKeyDown(
  event
) {

  if (!imoryPopoverSession) {

    return;

  }


  if (event.key === "Escape") {

    event.preventDefault();


    closeImoryPopover();


    return;

  }


  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp"
  ) {

    return;

  }


  const focusables =
    Array.from(
      imoryPopoverSession.body.querySelectorAll(
        "button:not([disabled]), a[href], textarea, input:not([type='hidden'])"
      )
    );


  if (focusables.length < 2) {

    return;

  }


  const current =
    focusables.indexOf(
      document.activeElement
    );


  if (current === -1) {

    return;

  }


  event.preventDefault();


  const next =
    event.key === "ArrowDown"
      ? (current + 1) % focusables.length
      : (current - 1 + focusables.length) % focusables.length;


  focusables[next].focus();

}


let imoryPopoverTracking =
  false;


function startImoryPopoverTracking() {

  if (imoryPopoverTracking) {

    return;

  }


  imoryPopoverTracking =
    true;


  /*
    capture + passive. 스크롤은 #postArea 안에서 일어나므로 window의
    capture 단계에서 받아야 잡힌다.
  */

  window.addEventListener(
    "scroll",
    scheduleImoryPopoverReposition,
    {
      capture: true,

      passive: true
    }
  );

  window.addEventListener(
    "resize",
    scheduleImoryPopoverReposition
  );

  window.addEventListener(
    "orientationchange",
    scheduleImoryPopoverReposition
  );

  document.addEventListener(
    "pointerdown",
    handleImoryPopoverPointerDown,
    true
  );

  document.addEventListener(
    "keydown",
    handleImoryPopoverKeyDown,
    true
  );

}


function stopImoryPopoverTracking() {

  if (!imoryPopoverTracking) {

    return;

  }


  imoryPopoverTracking =
    false;


  window.removeEventListener(
    "scroll",
    scheduleImoryPopoverReposition,
    {
      capture: true
    }
  );

  window.removeEventListener(
    "resize",
    scheduleImoryPopoverReposition
  );

  window.removeEventListener(
    "orientationchange",
    scheduleImoryPopoverReposition
  );

  document.removeEventListener(
    "pointerdown",
    handleImoryPopoverPointerDown,
    true
  );

  document.removeEventListener(
    "keydown",
    handleImoryPopoverKeyDown,
    true
  );

}


/* =========================================================
   메뉴 항목을 그리는 공통 helper

   items: [{ label, hint, onSelect, danger, disabled }] — 구분선은
   null로 표현한다.
========================================================== */

function renderImoryPopoverMenu(
  body,
  items
) {

  body.setAttribute(
    "role",
    "menu"
  );


  items.forEach(
    (item) => {

      if (!item) {

        const divider =
          document.createElement("div");


        divider.className =
          "imory-popover-divider";


        body.appendChild(divider);


        return;

      }


      if (item.custom) {

        body.appendChild(
          item.custom
        );


        return;

      }


      const button =
        document.createElement("button");


      button.type =
        "button";


      button.className =
        "imory-popover-item" +
        (
          item.danger
            ? " imory-popover-item--danger"
            : ""
        );


      button.setAttribute(
        "role",
        "menuitem"
      );


      button.disabled =
        Boolean(item.disabled);


      const label =
        document.createElement("span");


      label.className =
        "imory-popover-item-label";


      label.textContent =
        item.label;


      button.appendChild(label);


      if (item.hint) {

        const hint =
          document.createElement("span");


        hint.className =
          "imory-popover-item-hint";


        hint.textContent =
          item.hint;


        button.appendChild(hint);

      }


      button.addEventListener(
        "click",
        () => {

          if (item.keepOpen) {

            item.onSelect?.(button);


            return;

          }


          closeImoryPopover({
            silent: true
          });


          item.onSelect?.(button);

        }
      );


      body.appendChild(button);

    }
  );

}


/*
  요소의 사각형을 돌려주는 기준 함수. 요소가 사라지면 null이라
  팝오버가 스스로 숨는다.
*/

function imoryPopoverRectOf(
  element
) {

  return () => {

    if (
      !element ||
      !element.isConnected
    ) {

      return null;

    }


    return element.getBoundingClientRect();

  };

}
