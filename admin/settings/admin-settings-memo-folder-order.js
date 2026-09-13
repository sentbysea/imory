/* =========================================================
   SETTINGS — 메모 폴더 차례 (꾹 눌러 끌기)

   메모 화면(/memos?view=folders)에 폴더가 놓이는 순서를 정한다.
   여기서 폴더 = 원본 글의 카테고리이고, 움직이는 배열은 메모 전용
   (memoFolderOrder)이라 카테고리 목록의 순서(categories.sort_order)는
   한 글자도 바뀌지 않는다(IMORY_HIGHLIGHT1_DESIGN.md §7-1).

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §7-1
   저장: admin/settings/admin-settings-memo-folders.js (같은 SAVE)

   ── 왜 폴더 트리의 drag 코드를 재사용하지 않는가 ─────────
   posts/manage/posts-folder-sortable.js는 SortableJS 인스턴스를
   `.folder-tree-container`마다 하나씩 붙이고, 컨테이너 사이 이동을
   폴더 이동으로 해석한다 — 트리 DOM과 그 관리 화면(#postArea)에
   묶인 구조다. 여기 필요한 것은 **한 겹짜리 목록의 자리 바꾸기**
   하나뿐이고, 그걸 위해 admin 문서에 외부 CDN 의존을 새로 들이는
   것은 값이 맞지 않는다(그 45KB는 지금 admin이 전혀 받지 않는다).
   그래서 Pointer Events 위에 필요한 만큼만 직접 만든다.

   ── 모바일 스크롤과 부딪히지 않게 ───────────────────────
   목록을 위아래로 넘기려는 손짓이 전부 drag로 잡히면 설정 화면을
   스크롤할 수 없게 된다. 두 겹으로 가른다.

     1) 손잡이(≡)에서만 시작한다. 줄 전체를 잡게 두지 않는다.
     2) 터치는 **꾹 눌러야**(400ms) 시작한다. 그 전에 손가락이
        세로로 조금이라도 움직이면(6px) 그건 스크롤이므로 즉시
        포기하고 브라우저에 돌려준다.

   마우스는 기다리지 않는다 — 데스크톱에서는 손잡이를 누른 즉시
   끌 수 있다(스크롤과 헷갈릴 일이 없다).

   끌기가 실제로 시작된 뒤에만 touch-action을 잠근다(드래그 중인
   동안 CSS 클래스 하나로). 시작 전에는 페이지가 평소대로 스크롤된다.

   ── 키보드 ──────────────────────────────────────────────
   ↑↓ 버튼을 함께 둔다. 끌기를 쓸 수 없는 사람(키보드/보조기기)에게
   같은 일을 할 방법이 있어야 한다 — 두 조작 모두 같은 moveMemoFolder()
   한 곳을 부른다.

   classic script. admin-settings-memo-folders.js **뒤**에,
   admin-settings-save.js **앞**에 로드된다(memoFolderOrder /
   memoFolderTableAvailable / moveMemoFolder를 쓴다).
========================================================== */


const memoFolderOrderPanel =
  document.getElementById(
    "memoFolderOrderPanel"
  );


/* 터치에서 끌기로 인정하기까지 눌러야 하는 시간 */

const MEMO_FOLDER_DRAG_HOLD_MS =
  400;


/* 그 시간 안에 이만큼 움직이면 스크롤로 본다 */

const MEMO_FOLDER_DRAG_SLOP_PX =
  6;


let memoFolderDragSession =
  null;


/* =========================================================
   renderMemoFolderOrderList(categories, onChanged)

   renderCategories()가 목록을 다시 그릴 때마다 부른다.
   대상이 없으면 패널을 감춘다 — 빈 상자를 남기지 않는다.
========================================================== */

function renderMemoFolderOrderList(
  categories,
  onChanged
) {

  if (!memoFolderOrderPanel) {

    return;

  }


  cancelMemoFolderDrag();


  memoFolderOrderPanel.innerHTML =
    "";


  const nameById =
    new Map(
      (categories || [])
        .filter(
          (category) =>
            category.id &&
            category.type !== "banner"
        )
        .map(
          (category) =>
            [
              Number(category.id),
              (category.name || "").trim()
            ]
        )
    );


  const ids =
    (
      typeof memoFolderOrder !== "undefined" &&
      Array.isArray(memoFolderOrder)
        ? memoFolderOrder
        : []
    ).filter(
      (id) =>
        nameById.has(Number(id))
    );


  const available =
    typeof memoFolderTableAvailable === "undefined" ||
    memoFolderTableAvailable !== false;


  if (
    !available ||
    ids.length < 2
  ) {

    /*
      migration 이전 배포이거나 폴더가 하나뿐이면 정할 차례가 없다.
    */

    memoFolderOrderPanel.hidden =
      true;


    return;

  }


  memoFolderOrderPanel.hidden =
    false;


  const title =
    document.createElement("div");


  title.className =
    "memo-folder-order-title";


  title.textContent =
    "메모 폴더 차례";


  memoFolderOrderPanel.appendChild(title);


  const hint =
    document.createElement("p");


  hint.className =
    "memo-folder-order-hint";


  hint.textContent =
    "메모 화면에서 폴더가 놓이는 순서입니다. 손잡이를 끌어(모바일은 꾹 눌러 끌어) 바꾸거나 ↑↓를 쓰세요. 카테고리 목록의 순서는 바뀌지 않습니다.";


  memoFolderOrderPanel.appendChild(hint);


  const list =
    document.createElement("ul");


  list.className =
    "memo-folder-order-list";


  list.setAttribute(
    "role",
    "list"
  );


  ids.forEach(
    (id, index) => {

      list.appendChild(
        buildMemoFolderOrderItem(
          Number(id),
          nameById.get(Number(id)) || "(이름 없음)",
          index,
          ids.length,
          onChanged
        )
      );

    }
  );


  memoFolderOrderPanel.appendChild(list);

}


function buildMemoFolderOrderItem(
  id,
  name,
  index,
  total,
  onChanged
) {

  const item =
    document.createElement("li");


  item.className =
    "memo-folder-order-item";


  item.setAttribute(
    "data-memo-folder-id",
    String(id)
  );


  item.setAttribute(
    "data-memo-folder-index",
    String(index)
  );


  const handle =
    document.createElement("button");


  handle.type =
    "button";


  handle.className =
    "memo-folder-order-handle";


  handle.textContent =
    "≡";


  handle.setAttribute(
    "aria-label",
    `${name} 순서 옮기기`
  );


  /*
    손잡이는 <button>이지만 클릭으로 하는 일은 없다 — 끌기의
    시작점일 뿐이다. 키보드 사용자에게는 아래 ↑↓가 있으므로
    포커스 순서에서 뺀다(같은 일을 하는 자리가 둘이 되면
    Tab이 두 번 멈춘다).
  */

  handle.tabIndex =
    -1;


  handle.addEventListener(
    "pointerdown",
    (event) => {

      beginMemoFolderDrag(
        event,
        item,
        onChanged
      );

    }
  );


  item.appendChild(handle);


  const label =
    document.createElement("span");


  label.className =
    "memo-folder-order-name";


  label.textContent =
    name;


  item.appendChild(label);


  const actions =
    document.createElement("div");


  actions.className =
    "memo-folder-order-actions";


  [
    { label: "↑", delta: -1 },
    { label: "↓", delta: 1 }
  ].forEach(
    (spec) => {

      const button =
        document.createElement("button");


      button.type =
        "button";


      button.className =
        "imory-button imory-button--ghost imory-button--sm";


      button.textContent =
        spec.label;


      button.setAttribute(
        "aria-label",
        `${name} ${spec.delta < 0 ? "위로" : "아래로"}`
      );


      button.disabled =
        index + spec.delta < 0 ||
        index + spec.delta >= total;


      button.addEventListener(
        "click",
        () => {

          moveMemoFolder(
            index,
            spec.delta
          );


          onChanged();

        }
      );


      actions.appendChild(button);

    }
  );


  item.appendChild(actions);


  return item;

}



/* =========================================================
   끌기

   화면에서 요소를 실제로 옮기지 않는다 — 끌고 있는 줄에 표시만
   주고, 포인터가 어느 줄 위에 있는지로 "몇 번째로 갈 것인가"를
   계산해 놓을 자리 표시(is-drop-before/after)만 옮긴다. 손을 떼는
   순간에 배열 한 번 고치고 목록을 다시 그린다 — 중간 상태가 DOM에
   남지 않는다.
========================================================== */

function beginMemoFolderDrag(
  event,
  item,
  onChanged
) {

  if (
    event.button !== undefined &&
    event.button !== 0
  ) {

    return;

  }


  cancelMemoFolderDrag();


  const list =
    item.parentElement;


  if (!list) {

    return;

  }


  const isTouch =
    event.pointerType === "touch" ||
    event.pointerType === "pen";


  memoFolderDragSession =
    {
      pointerId:
        event.pointerId,

      item,

      list,

      onChanged,

      startY:
        event.clientY,

      /* 마우스는 기다리지 않는다 */
      armed:
        !isTouch,

      holdTimer:
        0,

      targetIndex:
        Number(
          item.getAttribute("data-memo-folder-index")
        ),

      moveHandler:
        null,

      endHandler:
        null
    };


  const session =
    memoFolderDragSession;


  session.moveHandler =
    (moveEvent) =>
      handleMemoFolderDragMove(moveEvent);


  session.endHandler =
    (endEvent) =>
      finishMemoFolderDrag(endEvent);


  window.addEventListener(
    "pointermove",
    session.moveHandler,
    {
      passive:
        false
    }
  );

  window.addEventListener(
    "pointerup",
    session.endHandler
  );

  window.addEventListener(
    "pointercancel",
    session.endHandler
  );


  if (session.armed) {

    armMemoFolderDrag();

  }

  else {

    session.holdTimer =
      window.setTimeout(
        () => {

          armMemoFolderDrag();

        },
        MEMO_FOLDER_DRAG_HOLD_MS
      );

  }

}


function armMemoFolderDrag() {

  const session =
    memoFolderDragSession;


  if (
    !session ||
    session.armed === "on"
  ) {

    return;

  }


  session.armed =
    "on";


  session.item.classList.add(
    "is-dragging"
  );


  /*
    이 클래스가 붙은 동안에만 목록의 touch-action이 잠긴다 —
    그 전까지 페이지는 평소대로 스크롤된다.
  */

  session.list.classList.add(
    "is-dragging"
  );


  try {

    session.item.setPointerCapture?.(
      session.pointerId
    );

  }

  catch (err) {

    /* 캡처를 못 해도 window 리스너로 계속 따라간다 */

  }

}


function handleMemoFolderDragMove(
  event
) {

  const session =
    memoFolderDragSession;


  if (
    !session ||
    event.pointerId !== session.pointerId
  ) {

    return;

  }


  if (session.armed !== "on") {

    /*
      아직 꾹 누르는 중이다. 여기서 움직였다면 스크롤하려는
      손짓이므로 조용히 물러난다 — preventDefault를 부르지
      않았으므로 그 스크롤은 그대로 이어진다.
    */

    if (
      Math.abs(event.clientY - session.startY) >
      MEMO_FOLDER_DRAG_SLOP_PX
    ) {

      cancelMemoFolderDrag();

    }


    return;

  }


  /* 끌기가 시작된 뒤에는 화면이 함께 스크롤되면 안 된다 */

  if (event.cancelable) {

    event.preventDefault();

  }


  const rows =
    Array.from(
      session.list.children
    );


  let nextIndex =
    rows.length - 1;


  for (let i = 0; i < rows.length; i += 1) {

    const rect =
      rows[i].getBoundingClientRect();


    if (
      event.clientY <
      rect.top + rect.height / 2
    ) {

      nextIndex =
        i;


      break;

    }

  }


  session.targetIndex =
    nextIndex;


  rows.forEach(
    (row, i) => {

      row.classList.toggle(
        "is-drop-target",
        i === nextIndex &&
        row !== session.item
      );

    }
  );

}


function finishMemoFolderDrag(
  event
) {

  const session =
    memoFolderDragSession;


  if (
    !session ||
    (
      event &&
      event.pointerId !== session.pointerId
    )
  ) {

    return;

  }


  const armed =
    session.armed === "on";


  const from =
    Number(
      session.item.getAttribute("data-memo-folder-index")
    );


  const to =
    session.targetIndex;


  const onChanged =
    session.onChanged;


  cancelMemoFolderDrag();


  if (
    !armed ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from === to
  ) {

    return;

  }


  moveMemoFolderTo(
    from,
    to
  );


  onChanged();

}


function cancelMemoFolderDrag() {

  const session =
    memoFolderDragSession;


  if (!session) {

    return;

  }


  memoFolderDragSession =
    null;


  window.clearTimeout(
    session.holdTimer
  );


  window.removeEventListener(
    "pointermove",
    session.moveHandler
  );

  window.removeEventListener(
    "pointerup",
    session.endHandler
  );

  window.removeEventListener(
    "pointercancel",
    session.endHandler
  );


  try {

    session.item.releasePointerCapture?.(
      session.pointerId
    );

  }

  catch (err) {

    /* 무시 */

  }


  session.item.classList.remove(
    "is-dragging"
  );


  session.list.classList.remove(
    "is-dragging"
  );


  Array.from(
    session.list.children
  ).forEach(
    (row) => {

      row.classList.remove(
        "is-drop-target"
      );

    }
  );

}


/*
  한 칸씩이 아니라 목적지까지 한 번에 옮긴다. moveMemoFolder()는
  인접한 두 칸을 맞바꾸는 함수라 여러 칸을 건너뛰면 사이의 차례가
  뒤섞인다 — 끌어서 놓는 조작에서는 "뽑아서 그 자리에 끼운다"가
  맞다(카테고리 ↑↓ 와 다른 점은 이것 하나뿐이다).
*/

function moveMemoFolderTo(
  from,
  to
) {

  if (
    typeof memoFolderOrder === "undefined" ||
    !Array.isArray(memoFolderOrder)
  ) {

    return;

  }


  if (
    from < 0 ||
    from >= memoFolderOrder.length ||
    to < 0 ||
    to >= memoFolderOrder.length
  ) {

    return;

  }


  const [moved] =
    memoFolderOrder.splice(
      from,
      1
    );


  memoFolderOrder.splice(
    to,
    0,
    moved
  );

}
