/* =========================================================
   SUA THEME - 프로필 패널 (하트 커버)

   home-profile.js에서 이동(themes/sua 분리).

   viewerArea/heartViewer/heartGroup/heartStage/page1/page2/
   moreButton/backButton 요소와 profileOpen, stopInertia(),
   stopRotationTracking()은 themes/sua/heart-interaction.js에
   있음 — 이 파일은 그 파일보다 나중에 로드되어야 함
   (index.html 순서 참고).

   메뉴 열기/닫기(menuButton/menuPanel)는 테마와 무관한
   imory 공통 기능이라 home/menu.js로 옮겼음. profileOpen /
   openProfile / closeProfile / heartGroup.profile-open
   강결합은 다음 단계에서 core/view-controller로 분리하기
   전까지 지금 이대로 sua 테마 안에 그대로 유지함.
========================================================== */

/* =========================================================
   프로필
========================================================== */

function openProfile() {

  stopInertia();

  stopRotationTracking();


  profileOpen =
    true;


  heartViewer.autoRotate =
    false;


  showPage1();


  heartGroup.classList.add(
    "profile-open"
  );

}


function closeProfile() {

  profileOpen =
    false;


  heartGroup.classList.remove(
    "profile-open"
  );


  showPage1();


  heartViewer.autoRotate =
    true;

}


/* 프로필 1페이지 */

function showPage1() {

  page1.classList.add(
    "active"
  );


  page2.classList.remove(
    "active"
  );


  heartGroup.classList.remove(
    "detail-open"
  );

}


/* 프로필 2페이지 */

function showPage2() {

  page1.classList.remove(
    "active"
  );


  page2.classList.add(
    "active"
  );


  heartGroup.classList.add(
    "detail-open"
  );

}


/* MORE */

moreButton.addEventListener(
  "click",
  (event) => {

    event.stopPropagation();

    showPage2();

  }
);


/* BACK */

backButton.addEventListener(
  "click",
  (event) => {

    event.stopPropagation();

    showPage1();

  }
);


/* =========================================================
   하트 내부 클릭
========================================================== */

heartStage.addEventListener(
  "click",
  (event) => {

    event.stopPropagation();

  }
);


/* =========================================================
   흰 배경 클릭 → 프로필 닫기
========================================================== */

viewerArea.addEventListener(
  "click",
  (event) => {

    if (!profileOpen) {
      return;
    }


    if (
      heartStage.contains(
        event.target
      )
    ) {
      return;
    }


    closeProfile();

  }
);
