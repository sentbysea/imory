/* =========================================================
   POSTS - EDITOR UNDO

   posts.js 분할본. DOM 참조/상태는 posts-refs.js에 있음
   (반드시 먼저 로드돼야 함).

   왜 필요한가: 하이라이트/포인트 컬러/서식 지우기/페이지
   나누기/Enter/붙여넣기가 전부 execCommand가 아니라 직접
   DOM을 조작(range.insertNode 등)해서 만들어져 있어서,
   브라우저 기본 Ctrl+Z(contenteditable 내장 undo)로는 거의
   추적이 안 된다 — 일반 타이핑만 반쯤 되다 말아서 오히려
   더 헷갈림. 그래서 매 변경 직전 전체 HTML을 스냅샷으로
   찍어두는 자체 undo 스택을 둔다.

   내용: 스냅샷 쌓기(pushEditorUndoSnapshot), 되돌리기
   (undoEditorChange), 새 글/다른 글로 전환 시 히스토리
   초기화(resetEditorUndoHistory), Ctrl/Cmd+Z 단축키(데스크톱),
   되돌리기 버튼(모바일에서도 사용).
========================================================== */


/* =========================================================
   STATE
========================================================== */

let editorUndoStack = [];

let editorUndoLastSnapshotAt = 0;

const EDITOR_UNDO_DEBOUNCE_MS = 800;

const EDITOR_UNDO_MAX_STEPS = 100;


/* =========================================================
   SNAPSHOT
========================================================== */

function pushEditorUndoSnapshot(
  force = false
) {

  if (!postEditorContent) {
    return;
  }


  const now =
    Date.now();


  /*
    타이핑 중엔(force=false) 한 글자마다 찍지 않고,
    잠깐 멈췄다가 다시 칠 때만 한 번씩 찍는다.
    툴바 동작(force=true)은 매번 찍는다.
  */

  if (
    !force &&
    now - editorUndoLastSnapshotAt <
      EDITOR_UNDO_DEBOUNCE_MS
  ) {
    return;
  }


  const html =
    postEditorContent.innerHTML;


  if (
    editorUndoStack.length &&
    editorUndoStack[
      editorUndoStack.length - 1
    ] === html
  ) {
    return;
  }


  editorUndoStack.push(
    html
  );


  if (
    editorUndoStack.length >
    EDITOR_UNDO_MAX_STEPS
  ) {

    editorUndoStack.shift();

  }


  editorUndoLastSnapshotAt =
    now;


  syncEditorUndoButtonState();

}



/* =========================================================
   UNDO
========================================================== */

function undoEditorChange() {

  if (
    !postEditorContent ||
    editorUndoStack.length === 0
  ) {
    return;
  }


  const previousHTML =
    editorUndoStack.pop();


  postEditorContent.innerHTML =
    previousHTML;


  savedEditorRange =
    null;


  updateEditorPreview();


  updateEditorToolbarState();


  syncEditorUndoButtonState();

}



/* =========================================================
   RESET (새 글 / 다른 글로 전환할 때)
========================================================== */

function resetEditorUndoHistory() {

  editorUndoStack =
    [];


  editorUndoLastSnapshotAt =
    0;


  syncEditorUndoButtonState();

}



/* =========================================================
   버튼 활성/비활성
========================================================== */

function syncEditorUndoButtonState() {

  if (!postEditorUndoButton) {
    return;
  }


  postEditorUndoButton.disabled =
    editorUndoStack.length === 0;

}



/* =========================================================
   타이핑 스냅샷

   Enter/붙여넣기/하이라이트 등은 execCommand를 안 거치는
   직접 DOM 조작이라 beforeinput이 안 뜬다 — 그래서 이
   리스너는 사실상 "일반 문자 타이핑"만 잡는다(해당 동작들은
   각자 위치에서 force=true로 직접 스냅샷을 찍음).
========================================================== */

postEditorContent
  ?.addEventListener(
    "beforeinput",
    () => {

      pushEditorUndoSnapshot(
        false
      );

    }
  );



/* =========================================================
   Ctrl / Cmd + Z (데스크톱)

   편집 영역에 포커스가 있을 때만 가로챈다 — TITLE 입력칸
   등 일반 input의 기본 undo는 건드리지 않음.
========================================================== */

document.addEventListener(
  "keydown",
  event => {

    const isUndoShortcut =
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      !event.shiftKey &&
      event.key.toLowerCase() ===
        "z";


    if (!isUndoShortcut) {
      return;
    }


    if (
      document.activeElement !==
      postEditorContent
    ) {
      return;
    }


    event.preventDefault();


    undoEditorChange();

  }
);



/* =========================================================
   버튼 (데스크톱 + 모바일)
========================================================== */

postEditorUndoButton
  ?.addEventListener(
    "click",
    undoEditorChange
  );


syncEditorUndoButtonState();
