/* =========================================================
   SKIN STUDIO - MINIMAL CONFIRM DIALOG (Skin Draft Publish)

   Publish 클릭 시 "저장된 스킨을 공개 홈페이지에 적용할까요?"를
   묻는 데 쓰는 범용 confirm dialog. 구현 전에 프로젝트 안에 이미
   쓰이는 공용 confirm dialog가 있는지 조사했으나 없었다(window.confirm
   만 studio-preview.js의 Back 버튼 dirty 체크에 쓰이고 있었고,
   그건 "정보 확인" 수준이라 그대로 재사용하기엔 이 동작(공개
   사이트에 실제로 반영되는 동작)의 무게에 비해 너무 가볍다고
   판단했다) — 그래서 studio/editor/code-editor.js의 modal 패턴
   (최초 호출 시 DOM 한 번만 만들고 재사용, ESC로 취소, 배경 클릭
   으로는 닫지 않음)을 그대로 따르는 최소 dialog를 새로 만들었다.

   classic script — window.openStudioConfirmDialog로 노출된다.
   의존 없음(순수 DOM API), 이 파일 자신은 아무 도메인 지식도
   모른다 — message/버튼 문구/onConfirm 콜백을 전부 호출자
   (studio-preview.js)가 매번 넘긴다.
========================================================== */

let studioConfirmOverlay = null;
let studioConfirmMessage = null;
let studioConfirmCancelButton = null;
let studioConfirmConfirmButton = null;

let studioConfirmCurrentOnConfirm = null;
let studioConfirmIsOpen = false;


function buildStudioConfirmDom() {

  const overlay =
    document.createElement("div");

  overlay.className =
    "studio-confirm-overlay";

  overlay.hidden =
    true;


  const modal =
    document.createElement("div");

  modal.className =
    "studio-confirm-modal";

  overlay.appendChild(
    modal
  );


  const message =
    document.createElement("p");

  message.className =
    "studio-confirm-message";

  modal.appendChild(
    message
  );


  const actions =
    document.createElement("div");

  actions.className =
    "studio-confirm-actions";

  modal.appendChild(
    actions
  );


  const cancelButton =
    document.createElement("button");

  cancelButton.type =
    "button";

  cancelButton.className =
    "studio-confirm-button";

  actions.appendChild(
    cancelButton
  );


  const confirmButton =
    document.createElement("button");

  confirmButton.type =
    "button";

  confirmButton.className =
    "studio-confirm-button studio-confirm-button--primary";

  actions.appendChild(
    confirmButton
  );


  document.body.appendChild(
    overlay
  );


  studioConfirmOverlay =
    overlay;

  studioConfirmMessage =
    message;

  studioConfirmCancelButton =
    cancelButton;

  studioConfirmConfirmButton =
    confirmButton;


  /*
    code-editor.js와 동일한 선택 — 배경(overlay) 클릭으로는 닫지
    않는다. Cancel/ESC만 닫는 경로다(의도치 않은 클릭으로 확인
    다이얼로그가 조용히 사라지는 것을 피한다).
  */

  cancelButton.addEventListener(
    "click",
    closeStudioConfirmDialog
  );

  confirmButton.addEventListener(
    "click",
    () => {

      const onConfirm =
        studioConfirmCurrentOnConfirm;

      closeStudioConfirmDialog();

      if (onConfirm) {
        onConfirm();
      }

    }
  );

}


document.addEventListener(
  "keydown",
  (event) => {

    if (!studioConfirmIsOpen) {
      return;
    }

    if (event.key === "Escape") {
      closeStudioConfirmDialog();
    }

  }
);


/* =========================================================
   openStudioConfirmDialog({ message, confirmLabel, cancelLabel,
   onConfirm })

   onConfirm은 사용자가 확인 버튼을 눌렀을 때만 호출된다 — dialog는
   그 호출 *전에* 먼저 닫힌다(성공/실패 토스트 등 이후 UI 갱신이
   dialog 위가 아니라 Studio 본체에서 바로 보이도록). 취소/ESC는
   아무 콜백도 부르지 않고 그냥 닫는다.
========================================================== */

function openStudioConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm }) {

  if (!studioConfirmOverlay) {
    buildStudioConfirmDom();
  }

  studioConfirmCurrentOnConfirm =
    onConfirm || null;

  studioConfirmMessage.textContent =
    message || "";

  studioConfirmCancelButton.textContent =
    cancelLabel || "취소";

  studioConfirmConfirmButton.textContent =
    confirmLabel || "확인";

  studioConfirmOverlay.hidden =
    false;

  studioConfirmIsOpen =
    true;

  studioConfirmConfirmButton.focus();

}


function closeStudioConfirmDialog() {

  if (!studioConfirmOverlay) {
    return;
  }

  studioConfirmOverlay.hidden =
    true;

  studioConfirmIsOpen =
    false;

  studioConfirmCurrentOnConfirm =
    null;

}


if (typeof window !== "undefined") {

  window.openStudioConfirmDialog =
    openStudioConfirmDialog;

}
