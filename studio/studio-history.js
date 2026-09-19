/* =========================================================
   SKIN STUDIO — UNDO / REDO (STUDIO-SHELL-1)

   기준 문서: IMORY_STUDIO_SHELL_DESIGN.md §4

   상단 바의 ↶ / ↷ 가 쓰는 **working draft 변경 기록**이다.

   ★ 무엇을 기록하는가
     working draft 를 바꾸는 입구 넷이 바꾸기 **직전** 상태를 한
     칸씩 남긴다(studio/studio-preview.js):

       applyWorkingSkinChanges   Code Apply · Inspector 직접 편집
       applyImportedSkinPackage  Import · AI 적용 · AI 되돌리기
       setStudioBottomDock       Dock 패널
       setStudioImageSlot        Images 패널

     한 칸 = { skin, imageSlots, isDirty, draftVersionId }. skin 과
     imageSlots 는 **참조**로 들고 있다 — 두 값 모두 바뀔 때마다 새
     객체로 교체되고 제자리에서 고쳐지지 않는다(studio-preview.js 의
     네 입구가 전부 spread 로 새 객체를 만든다). 그래서 복사 없이
     스냅샷이 된다.

   ★ 되돌리기도 같은 입구로 들어간다
     applyImportedSkinPackage(…, { preserveNavigation, dirty,
     imageSlotBindings }) — AI 되돌리기가 이미 쓰는 그 경로다. 그래서
     revision 이 오르고(늦게 온 AI 응답은 stale 로 버려진다), Inspector
     선택 복원 관문(bumpStudioWorkingRevision)도 그대로 지난다. 이
     파일은 새 적용 경로를 만들지 않는다.

   ★ dirty 는 AI 되돌리기와 같은 규칙이다
     그 칸을 기록한 뒤로 Save 가 있었다면(draftVersionId 가 다르면)
     되돌린 화면은 저장된 draft 와 다르므로 dirty 다. 없었다면 그때의
     dirty 를 그대로 돌려놓는다(studio-preview.js applyAiSkinPackage
     주석 "되돌리기와 그 사이의 Save").

   ★ 저장하지 않는다
     기록은 이 문서가 살아 있는 동안만 있다. 다른 스킨을 불러오거나
     다시 mount 하면 비운다(resetStudioHistory). Save/Publish 는 기록을
     건드리지 않는다 — 내용을 바꾸지 않기 때문이다.

   ★ 기존 "되돌리기" 둘은 그대로다
     Inspector 팝오버의 되돌리기(직전 직접 편집 한 번)와 AI 패널의
     되돌리기(직전 AI 적용 한 번)는 그 자리의 문맥 도구로 남는다.
     그 둘도 위 입구를 지나므로 이 기록에 한 칸으로 쌓인다.

   의존: studio/studio-preview.js(currentWorkingSkin ·
   currentWorkingImageSlots · isStudioDirty · currentDraftVersionId ·
   isStudioSavePending · isStudioPublishPending ·
   applyImportedSkinPackage · showStudioToast). 전부 호출 시점에만
   읽는다.
========================================================== */

const STUDIO_HISTORY_LIMIT = 50;

let studioHistoryUndoStack = [];

let studioHistoryRedoStack = [];

/* 되돌리는 중에 입구가 또 기록하지 않게 한다 */
let studioHistoryRestoring = false;

const studioHistoryUndoButton =
  document.getElementById("studioUndoButton");

const studioHistoryRedoButton =
  document.getElementById("studioRedoButton");


/* 지금 상태 한 칸. 기록할 working draft 가 없으면 null. */
function captureStudioHistoryState() {

  if (!currentWorkingSkin) {
    return null;
  }

  return {
    skin: currentWorkingSkin,
    imageSlots: currentWorkingImageSlots,
    isDirty: isStudioDirty,
    draftVersionId: currentDraftVersionId
  };

}


/* 입구가 **바꾼 뒤에** 부른다 — before 는 바꾸기 직전에 잡아 둔
   값이다. 바꾸기에 실패했으면(예외) 부르지 않으므로 빈 칸이 쌓이지
   않는다. */
function recordStudioHistory(before) {

  if (studioHistoryRestoring || !before || !before.skin) {
    return;
  }

  /* 내용이 그대로면(같은 참조) 칸을 만들지 않는다 */
  if (
    before.skin === currentWorkingSkin &&
    before.imageSlots === currentWorkingImageSlots
  ) {
    return;
  }

  studioHistoryUndoStack.push(before);

  if (studioHistoryUndoStack.length > STUDIO_HISTORY_LIMIT) {
    studioHistoryUndoStack.shift();
  }

  studioHistoryRedoStack = [];

  updateStudioHistoryButtons();

}


function resetStudioHistory() {

  studioHistoryUndoStack = [];

  studioHistoryRedoStack = [];

  updateStudioHistoryButtons();

}


function studioHistoryIsBlocked() {

  return (
    !currentWorkingSkin ||
    isStudioSavePending ||
    isStudioPublishPending
  );

}


function updateStudioHistoryButtons() {

  const blocked =
    studioHistoryIsBlocked();

  if (studioHistoryUndoButton) {
    studioHistoryUndoButton.disabled =
      blocked || studioHistoryUndoStack.length === 0;
  }

  if (studioHistoryRedoButton) {
    studioHistoryRedoButton.disabled =
      blocked || studioHistoryRedoStack.length === 0;
  }

}


function restoreStudioHistoryState(state) {

  const savedSince =
    state.draftVersionId !== currentDraftVersionId;

  studioHistoryRestoring = true;

  try {

    applyImportedSkinPackage(
      state.skin,
      {
        dirty: savedSince ? true : state.isDirty,
        imageSlotBindings: state.imageSlots,
        preserveNavigation: true
      }
    );

  } finally {

    studioHistoryRestoring = false;

  }

}


function undoStudioHistory() {

  if (studioHistoryIsBlocked() || !studioHistoryUndoStack.length) {
    return false;
  }

  const current =
    captureStudioHistoryState();

  const previous =
    studioHistoryUndoStack.pop();

  studioHistoryRedoStack.push(current);

  restoreStudioHistoryState(previous);

  updateStudioHistoryButtons();

  return true;

}


function redoStudioHistory() {

  if (studioHistoryIsBlocked() || !studioHistoryRedoStack.length) {
    return false;
  }

  const current =
    captureStudioHistoryState();

  const next =
    studioHistoryRedoStack.pop();

  studioHistoryUndoStack.push(current);

  restoreStudioHistoryState(next);

  updateStudioHistoryButtons();

  return true;

}


studioHistoryUndoButton?.addEventListener("click", undoStudioHistory);

studioHistoryRedoButton?.addEventListener("click", redoStudioHistory);


/* =========================================================
   단축키 — Ctrl/⌘+Z · Ctrl/⌘+Shift+Z · Ctrl+Y

   글을 쓰는 자리(입력칸 · textarea · contenteditable)에서는 그
   자리의 되돌리기가 먼저다 — 여기서 가로채지 않는다. Code/Import
   편집기와 확인 dialog 도 전부 입력칸이나 그 위의 버튼에 포커스가
   있으므로 같은 규칙으로 빠진다. Preview iframe 안에 포커스가 있으면
   이 문서에 keydown 이 오지 않는다(Inspector 의 Escape 와 같다).
========================================================== */

function studioHistoryKeyTargetIsEditable(target) {

  if (!target || target === document.body) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag =
    String(target.tagName || "").toLowerCase();

  return tag === "input" || tag === "textarea" || tag === "select";

}


document.addEventListener(
  "keydown",
  (event) => {

    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }

    if (studioHistoryKeyTargetIsEditable(event.target)) {
      return;
    }

    /* 떠 있는 편집기/dialog 가 있으면 그 위에서의 단축키다 */
    if (event.target && event.target.closest && event.target.closest("[role='dialog'], dialog")) {
      return;
    }

    const key =
      String(event.key || "").toLowerCase();

    const wantsRedo =
      (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);

    const wantsUndo =
      key === "z" && !event.shiftKey;

    if (!wantsUndo && !wantsRedo) {
      return;
    }

    const done =
      wantsRedo ? redoStudioHistory() : undoStudioHistory();

    if (done) {
      event.preventDefault();
    }

  }
);


updateStudioHistoryButtons();


if (typeof window !== "undefined") {

  window.captureStudioHistoryState = captureStudioHistoryState;
  window.recordStudioHistory = recordStudioHistory;
  window.resetStudioHistory = resetStudioHistory;
  window.updateStudioHistoryButtons = updateStudioHistoryButtons;
  window.undoStudioHistory = undoStudioHistory;
  window.redoStudioHistory = redoStudioHistory;

  /* 테스트용 읽기 창구 — production 코드는 읽지 않는다 */
  window.getStudioHistoryState =
    function () {
      return {
        undo: studioHistoryUndoStack.length,
        redo: studioHistoryRedoStack.length
      };
    };

}
