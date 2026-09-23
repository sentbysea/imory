/* =========================================================
   SETTINGS — BOTTOM DOCK 진입 (STUDIO-LAYERS-SHELL-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §1-1

   ── 이 파일이 하는 일은 하나다 ─────────────────────────
   SETTINGS > HOME 의 버튼을 누르면 Skin Studio 화면으로 옮기고,
   그 안의 iframe 에게 "Bottom Dock 편집기를 열어라"고 말한다.

   ── 이 파일이 **하지 않는** 일 ─────────────────────────
   Dock 설정 화면 · dock 데이터 읽기 · 정규화 · 저장.
   전부 지금까지처럼 Studio 가 한다(studio/dock/dock-panel.js →
   setStudioBottomDock → working draft → Save). 여기에 두 번째
   저장 경로를 만들지 않는 것이 이 라운드의 조건이다.

   ── 왜 되풀이해 보내는가 ───────────────────────────────
   Studio 는 이 문서와 **다른 browsing context** 라, 처음 열릴 때는
   아직 스킨을 불러오는 중이라 working draft 가 없다. 그 상태에서는
   Dock 편집기가 사본을 만들 수 없어 Studio 가 조용히 무시한다
   (studio/studio-shell.js studioShellCanShowMode).

   그래서 짧은 간격으로 다시 보내고, Studio 가 실제로 연 뒤
   한 번 답하면 멈춘다. 새 "준비됐다" 신호나 새 상태를 만들지 않는
   가장 작은 방법이다.

   시간이 다 되면 안내 한 줄을 남긴다 — 조용히 아무 일도 일어나지
   않는 것이 제일 나쁘다.

   classic script — admin/admin.js 의 showSkinStudioPanel() 과
   #skinStudioFrame 을 **호출 시점에** 쓴다.
========================================================== */

const STUDIO_MSG_OPEN_PANEL =
  "admin:open-studio-panel";

const STUDIO_MSG_PANEL_OPENED =
  "studio:panel-opened";


/* 다시 보내는 간격과 총 시간 — Studio 가 스킨을 불러오는 데 드는
   시간(네트워크 + RPC)을 넉넉히 덮는다 */
const BOTTOM_DOCK_RETRY_MS = 300;

const BOTTOM_DOCK_TIMEOUT_MS = 15000;


const bottomDockOpenButton =
  document.getElementById("bottomDockOpenButton");

const bottomDockOpenMessage =
  document.getElementById("bottomDockOpenMessage");


/* 지금 돌고 있는 되풀이 — 한 번에 하나다 */
let bottomDockPendingTimer = null;

let bottomDockPendingUntil = 0;


function bottomDockSetMessage(text) {

  if (bottomDockOpenMessage) {
    bottomDockOpenMessage.textContent = text || "";
  }

}


function bottomDockStopPending() {

  if (bottomDockPendingTimer !== null) {
    window.clearTimeout(bottomDockPendingTimer);
  }

  bottomDockPendingTimer = null;

  bottomDockPendingUntil = 0;

}


function bottomDockStudioWindow() {

  const frame =
    document.getElementById("skinStudioFrame");

  return (frame && frame.contentWindow) ? frame.contentWindow : null;

}


function bottomDockSendOnce() {

  const studio =
    bottomDockStudioWindow();

  if (!studio) {
    return;
  }

  studio.postMessage(
    { type: STUDIO_MSG_OPEN_PANEL, mode: "dock" },
    window.location.origin
  );

}


function bottomDockTick() {

  bottomDockPendingTimer =
    null;

  if (!bottomDockPendingUntil) {
    return;
  }

  if (Date.now() >= bottomDockPendingUntil) {

    bottomDockStopPending();

    bottomDockSetMessage(
      "Skin Studio가 아직 준비되지 않았습니다 — Studio 안에서 화면 아래 dock을 눌러 여세요."
    );

    return;

  }

  bottomDockSendOnce();

  bottomDockPendingTimer =
    window.setTimeout(bottomDockTick, BOTTOM_DOCK_RETRY_MS);

}


function openBottomDockInStudio() {

  bottomDockStopPending();

  bottomDockSetMessage("");

  /*
    Skin Studio 화면으로 옮긴다. iframe 은 admin 이 처음 뜰 때 이미
    src 를 갖고 있으므로 여기서 다시 만들거나 다시 읽지 않는다 —
    편집 중이던 draft 가 날아간다.
  */
  if (typeof window.showSkinStudioPanel === "function") {
    window.showSkinStudioPanel();
  }
  else if (typeof showSkinStudioPanel === "function") {
    showSkinStudioPanel();
  }
  else {
    bottomDockSetMessage("Skin Studio를 열 수 없습니다.");
    return;
  }

  bottomDockPendingUntil =
    Date.now() + BOTTOM_DOCK_TIMEOUT_MS;

  bottomDockTick();

}


/* Studio 가 실제로 열었다는 답 — 되풀이를 멈춘다.

   ★ 같은 origin 이고 그 iframe 에서 온 메시지인지까지 본다
     (admin/admin-session.js 의 STUDIO_MSG_BACK 과 같은 검사). */
window.addEventListener(
  "message",
  (event) => {

    if (event.origin !== window.location.origin) {
      return;
    }

    if (event.source !== bottomDockStudioWindow()) {
      return;
    }

    const data =
      event.data;

    if (
      !data ||
      typeof data !== "object" ||
      data.type !== STUDIO_MSG_PANEL_OPENED ||
      data.mode !== "dock"
    ) {
      return;
    }

    bottomDockStopPending();

    bottomDockSetMessage("");

  }
);


bottomDockOpenButton?.addEventListener(
  "click",
  openBottomDockInStudio
);


if (typeof window !== "undefined") {

  /* 테스트가 보는 한 줄 — production 코드는 읽지 않는다 */
  window.getAdminBottomDockEntryState =
    () => ({
      hasButton: !!bottomDockOpenButton,
      pending: bottomDockPendingTimer !== null,
      message: bottomDockOpenMessage ? bottomDockOpenMessage.textContent : ""
    });

}
