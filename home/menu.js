/* =========================================================
   HOME - 메뉴 / 상단 고정 버튼 (imory 공통)

   home-love-event.js, home-profile.js에서 분리됨.

   menuButton/menuPanel 요소 선언과 열기/닫기 동작, 그리고
   상단 고정 버튼(메뉴/음악) 스크롤 숨김 로직은 원래
   home-love-event.js/home-profile.js에 하트/프로필과 함께
   섞여 있었지만, 전부 테마와 무관한 imory 공통 홈 shell
   기능이라 이 파일 하나로 모음.

   musicButton은 home/bgm.js에서 선언되므로 이 파일은 그
   파일보다 나중에 로드되어야 함(index.html 순서 참고).

   updateFixedButtonsOnScroll()은 전역 함수로,
   posts/editor/posts-refs.js가 글 읽기 화면(#postArea) 자체
   스크롤에서도 그대로 호출한다.
========================================================== */

/* =========================================================
   요소
========================================================== */

const menuButton =
  document.getElementById(
    "menuButton"
  );

const menuPanel =
  document.getElementById(
    "menuPanel"
  );


/* =========================================================
   상단 고정 버튼(메뉴/음악) 스크롤 시 숨김

   글을 읽을 때 텍스트를 가리지 않도록 아래로 스크롤하면
   숨기고, 위로 스크롤하거나 맨 위 근처로 오면 다시 보여준다.
   posts.js도 글 읽기 화면(#postArea)의 자체 스크롤에서
   이 함수를 그대로 호출한다(전역 함수로 공유).
========================================================== */

let lastFixedButtonScrollTop =
  0;

function updateFixedButtonsOnScroll(
  scrollTop
) {

  const scrollingDown =
    scrollTop >
    lastFixedButtonScrollTop;

  const pastThreshold =
    scrollTop > 24;

  const shouldHide =
    scrollingDown &&
    pastThreshold;


  menuButton?.classList.toggle(
    "is-scroll-hidden",
    shouldHide
  );

  musicButton?.classList.toggle(
    "is-scroll-hidden",
    shouldHide
  );


  lastFixedButtonScrollTop =
    scrollTop;

}


window.addEventListener(
  "scroll",
  () => {

    updateFixedButtonsOnScroll(
      window.scrollY
    );

  },
  {
    passive: true
  }
);


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
