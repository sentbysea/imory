/* =========================================================
   SUA THEME - 프로필 패널 (하트 커버)

   home-profile.js에서 이동(themes/sua 분리).

   viewerArea/heartViewer/heartGroup/heartStage/page1/page2/
   moreButton/backButton 요소와 stopInertia(),
   stopRotationTracking()은 themes/sua/heart-interaction.js에
   있음 — 이 파일은 그 파일보다 나중에 로드되어야 함
   (index.html 순서 참고).

   메뉴 열기/닫기(menuButton/menuPanel)는 테마와 무관한
   imory 공통 기능이라 home/menu.js로 옮겼음.

   cover/profile 현재 상태는 core/view-controller.js가
   소유한다. 이 파일은 상태를 직접 갖거나 대입하지 않고,
   core가 발행하는 "viewchange" 이벤트를 구독해서 sua 전용
   연출(관성 정지, autoRotate, profile-open 클래스, 페이지
   복원 등)만 수행한다. 바깥 클릭으로 닫을 때도 core의
   closeProfileView()를 호출할 뿐, 상태 전환 자체는 core가
   담당한다.
========================================================== */

/* =========================================================
   core view change 구독 → sua 전용 연출
========================================================== */

window.addEventListener(
  "viewchange",
  (event) => {

    if (
      event.detail.view
      === VIEW_PROFILE
    ) {

      handleProfileOpen();

    } else {

      handleProfileClose();

    }

  }
);


function handleProfileOpen() {

  stopInertia();

  stopRotationTracking();


  heartViewer.autoRotate =
    false;


  showPage1();


  heartGroup.classList.add(
    "profile-open"
  );

}


function handleProfileClose() {

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

    if (
      getCurrentView()
      !== VIEW_PROFILE
    ) {
      return;
    }


    if (
      heartStage.contains(
        event.target
      )
    ) {
      return;
    }


    closeProfileView();

  }
);
