/* =========================================================
   HOME - 프로필 패널 / 메뉴

   script.js에서 분리됨.

   menuButton/menuPanel/viewerArea/heartGroup/heartStage/
   page1/page2/moreButton/backButton 요소와 profileOpen,
   stopInertia(), stopRotationTracking()은 home-love-event.js
   에 있음 — 이 파일은 그 파일보다 나중에 로드되어야 함
   (index.html 순서 참고).
========================================================== */

/* =========================================================
   메뉴
========================================================== */

menuButton.addEventListener(
  "click",
  (event) => {

    event.stopPropagation();

    const isOpen =
      menuPanel.classList.toggle(
        "open"
      );

    menuButton.classList.toggle(
      "open",
      isOpen
    );

    menuButton.setAttribute(
      "aria-expanded",
      isOpen
    );

  }
);


menuPanel.addEventListener(
  "click",
  (event) => {

    event.stopPropagation();

  }
);


/*
  메뉴가 열려 있는 상태에서 메뉴/버튼 바깥을 클릭하면
  자연스럽게 닫힘.
*/

document.addEventListener(
  "click",
  (event) => {

    if (
      !menuPanel.classList.contains(
        "open"
      )
    ) {

      return;

    }


    if (
      menuPanel.contains(
        event.target
      ) ||
      menuButton.contains(
        event.target
      )
    ) {

      return;

    }


    menuPanel.classList.remove(
      "open"
    );

    menuButton.classList.remove(
      "open"
    );

    menuButton.setAttribute(
      "aria-expanded",
      "false"
    );

  }
);


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
