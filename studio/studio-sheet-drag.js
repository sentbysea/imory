/* =========================================================
   SKIN STUDIO — MOBILE SHEET: 손잡이 드래그 (MOBILE-SHEET-1)

   기준 문서: IMORY_STUDIO_SHELL_DESIGN.md §5-1

   studio/studio-sheet.js 의 한 부분이다 — 단계(setStudioSheetState) ·
   높이 재기(studioSheetTopLimit · studioSheetKeyboard) · Preview 알림
   (scheduleStudioSheetPublish)은 그 파일에 있고, 여기서는 손잡이를 잡고
   끄는 동안의 높이와 놓았을 때 어느 단계에 정착할지만 정한다. 그 파일
   **뒤에** 로드된다(최상위 const 를 로드 시점에 읽는다).
========================================================== */

/* =========================================================
   손잡이 드래그

   손잡이에서만 잡는다(touch-action:none 은 손잡이에만 — 시트 안
   입력칸 · 목록 스크롤과 Preview 스크롤은 그대로다). 끄는 동안은 그
   높이를 그대로 보여 주고, 놓으면 가장 가까운 단계로 정착한다.
   24px 보다 적게 움직이면(빠르게 튕긴 게 아니면) 단계를 바꾸지 않는다.
   가장 가까운 단계가 시작 단계와 같아도 충분히 움직였으면 그 방향으로
   한 단계. 접힘에서 아래로 끌면 닫힌다. 움직이지 않고 톡 누르면
   접힘 ↔ 내용 보기(전체 화면에서는 내용 보기로).
========================================================== */

const STUDIO_SHEET_DRAG_ORDER = ["closed", "peek", "content", "full"];

/* 이보다 적게 움직이면 단계를 바꾸지 않는다(px) */
const STUDIO_SHEET_DRAG_MIN_TRAVEL = 24;

/* 이보다 빠르면(px/ms) 거리가 짧아도 한 단계 */
const STUDIO_SHEET_FLICK_SPEED = 0.5;


function studioSheetStopHeights() {

  const shellHeight =
    studioSheetShell ? studioSheetShell.clientHeight : window.innerHeight;

  const style =
    window.getComputedStyle(studioSheetPanel);

  const chrome =
    (studioSheetHeader ? studioSheetHeader.offsetHeight : 48) +
    (parseFloat(style.paddingBottom) || 0) +
    (parseFloat(style.borderTopWidth) || 0);

  const full =
    Math.max(chrome, shellHeight - studioSheetTopLimit() - studioSheetKeyboard);

  const contentMax =
    Math.max(120, Math.min(shellHeight * STUDIO_SHEET_CONTENT_RATIO, full - 56));

  const content =
    Math.max(chrome + 40, Math.min(studioSheetContentHeight || contentMax, contentMax));

  return { closed: 0, peek: chrome, content, full };

}


function resolveStudioSheetDragTarget(drag) {

  const travel =
    drag.height - drag.startHeight;

  const flick =
    Math.abs(drag.velocity) >= STUDIO_SHEET_FLICK_SPEED && Math.abs(travel) >= 8;

  if (Math.abs(travel) < STUDIO_SHEET_DRAG_MIN_TRAVEL && !flick) {
    return drag.startState;
  }

  const direction =
    flick ? Math.sign(drag.velocity) : Math.sign(travel);

  let nearest =
    drag.startState;

  let best =
    Infinity;

  STUDIO_SHEET_DRAG_ORDER.forEach((stop) => {

    const distance =
      Math.abs(drag.heights[stop] - drag.height);

    if (distance < best) {
      best = distance;
      nearest = stop;
    }

  });

  const start =
    STUDIO_SHEET_DRAG_ORDER.indexOf(drag.startState);

  let index =
    STUDIO_SHEET_DRAG_ORDER.indexOf(nearest);

  if (Math.sign(index - start) !== direction) {
    index = start + direction;
  }

  index =
    Math.max(0, Math.min(STUDIO_SHEET_DRAG_ORDER.length - 1, index));

  return STUDIO_SHEET_DRAG_ORDER[index];

}


function beginStudioSheetDrag(event) {

  if (!studioSheetIsActive() || studioSheetDrag) {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  event.preventDefault();

  try {
    studioSheetHandle.setPointerCapture(event.pointerId);
  } catch (err) {
    /* 캡처가 없어도 손잡이 위에서는 계속 받는다 */
  }

  const height =
    studioSheetPanel.offsetHeight;

  const now =
    performance.now();

  studioSheetDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startHeight: height,
    height,
    startState: studioSheetState,
    startTime: now,
    lastY: event.clientY,
    lastTime: now,
    velocity: 0,
    moved: false,
    heights: studioSheetStopHeights()
  };

}


function moveStudioSheetDrag(event) {

  const drag =
    studioSheetDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  const travel =
    drag.startY - event.clientY;

  if (!drag.moved) {

    if (Math.abs(travel) < 4) {
      return;
    }

    drag.moved = true;

    studioSheetPanel.classList.add("is-sheet-dragging");

    syncStudioSheet();

  }

  const now =
    performance.now();

  const elapsed =
    now - drag.lastTime;

  if (elapsed > 0) {
    drag.velocity = (drag.lastY - event.clientY) / elapsed;
  }

  drag.lastY = event.clientY;
  drag.lastTime = now;

  drag.height =
    Math.max(
      drag.heights.peek * 0.5,
      Math.min(drag.heights.full, drag.startHeight + travel)
    );

  studioSheetPanel.style.height =
    `${Math.round(drag.height)}px`;

  scheduleStudioSheetPublish();

}


function finishStudioSheetDrag(event, cancelled) {

  const drag =
    studioSheetDrag;

  if (!drag || (event && event.pointerId !== drag.pointerId)) {
    return;
  }

  studioSheetDrag =
    null;

  studioSheetPanel.classList.remove("is-sheet-dragging");

  studioSheetPanel.style.removeProperty("height");

  /* 마지막 움직임이 오래 전이면 튕김이 아니다 */
  if (performance.now() - drag.lastTime > 120) {
    drag.velocity = 0;
  }

  if (cancelled) {
    setStudioSheetState(drag.startState, { reveal: false });
    return;
  }

  if (!drag.moved) {

    if (performance.now() - drag.startTime < 400) {
      setStudioSheetState(drag.startState === "peek" ? "content" : (drag.startState === "full" ? "content" : "peek"));
    } else {
      setStudioSheetState(drag.startState, { reveal: false });
    }

    return;

  }

  const target =
    resolveStudioSheetDragTarget(drag);

  if (target === "closed") {

    setStudioSheetState("peek", { reveal: false });

    if (typeof collapseStudioLeftPanel === "function") {
      collapseStudioLeftPanel();
    }

    return;

  }

  setStudioSheetState(target, { reveal: STUDIO_SHEET_DRAG_ORDER.indexOf(target) > STUDIO_SHEET_DRAG_ORDER.indexOf(drag.startState) });

}


if (studioSheetHandle) {

  studioSheetHandle.addEventListener("pointerdown", beginStudioSheetDrag);
  studioSheetHandle.addEventListener("pointermove", moveStudioSheetDrag);
  studioSheetHandle.addEventListener("pointerup", (event) => finishStudioSheetDrag(event, false));
  studioSheetHandle.addEventListener("pointercancel", (event) => finishStudioSheetDrag(event, true));
  studioSheetHandle.addEventListener("lostpointercapture", (event) => finishStudioSheetDrag(event, false));

}
