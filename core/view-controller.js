/* =========================================================
   CORE - VIEW CONTROLLER (cover ↔ profile)

   cover/profile 현재 상태를 core가 단독 소유.

   themes/sua는 이 파일의 setView()/openProfileView()/
   closeProfileView()만 호출해서 상태를 바꾸고,
   getCurrentView()로만 현재 상태를 읽는다.
   sua 전용 연출(heart/model-viewer/inertia/LOVE EVENT 등)은
   이 파일이 전혀 모른다 — 상태가 바뀔 때 "viewchange"
   이벤트만 window에 발행하고, 실제 연출은 이벤트를 구독하는
   테마 쪽(themes/sua/cover-profile.js 등)이 담당한다.

   이 파일은 sua 스크립트(themes/sua/heart-interaction.js,
   themes/sua/cover-profile.js)보다 먼저 로드되어야 함
   (index.html 순서 참고).
========================================================== */

const VIEW_COVER =
  "cover";

const VIEW_PROFILE =
  "profile";


let currentView =
  VIEW_COVER;


function getCurrentView() {

  return currentView;

}


function setView(nextView) {

  if (
    nextView === currentView
  ) {
    return;
  }


  const previousView =
    currentView;


  currentView =
    nextView;


  window.dispatchEvent(
    new CustomEvent(
      "viewchange",
      {
        detail: {
          view: nextView,
          previousView: previousView
        }
      }
    )
  );

}


function openProfileView() {

  setView(VIEW_PROFILE);

}


function closeProfileView() {

  setView(VIEW_COVER);

}
