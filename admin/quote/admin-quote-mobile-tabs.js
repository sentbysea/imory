/* =========================================================
   QUOTE - MOBILE TAB BAR

   admin-quote.js 분할본. DOM 참조(quoteControls,
   quoteMobileTabButtons, quoteAccordionSections)는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   모바일(max-width:600px)에서는 .quote-controls가 화면
   하단에 항상 보이는 고정 시트가 되고(프리뷰와 위아래로
   완전히 나뉨 — 접었다 펼쳤다 하지 않음), 원래 7개였던
   아코디언(TEST CONTENT/CANVAS/GENERAL/TITLE/BODY/SOURCE/PRESET)을
   5개 탭(content/canvas/title-source/body/preset)으로 묶어서
   보여준다. 탭을 누르면 data-quote-mobile-tab 값이 일치하는
   섹션만 보이고 나머지는 숨긴다 — 예전처럼 7개를 전부 위아래로
   스크롤하며 찾을 필요 없이, 프리뷰는 위에 그대로 보이는 채로
   원하는 설정 그룹만 바로 열어볼 수 있다.

   데스크톱에서는 이 파일이 하는 일이 전혀 없다(기존처럼
   7개 아코디언을 각자 접었다 펼쳤다 하는 그대로).
========================================================== */


function isAdminQuoteMobile() {

  return window.matchMedia(
    "(max-width: 600px)"
  ).matches;

}


let quoteMobileActiveTab =
  "content";


/* =========================================================
   TAB FILTER
========================================================== */

function applyQuoteMobileTabFilter() {

  if (
    !isAdminQuoteMobile()
  ) {

    /*
      데스크톱으로 돌아오면 모바일에서 걸어둔 hidden을
      전부 풀어서, 기존 아코디언 개별 open/close 상태가
      다시 그대로 보이게 한다.
    */

    quoteAccordionSections.forEach(
      section => {

        section.hidden =
          false;

      }
    );

    return;

  }


  quoteAccordionSections.forEach(
    section => {

      section.hidden =
        section.dataset.quoteMobileTab !==
        quoteMobileActiveTab;

    }
  );

}


/*
  탭 전환 자체가 이미 "이 그룹을 보고 싶다"는 선택이므로,
  탭을 누른 순간에는(=resize 등 필터 재적용 시점 말고)
  개별 섹션의 +/- 접힘 상태와 무관하게 펼쳐서 보여준다.
  resize에서까지 이걸 하면, 탭 안에서 일부러 접어둔 섹션이
  화면 회전 한 번에 다시 펼쳐져버리는 부작용이 있어서 분리함.
*/

function openSectionsForActiveQuoteMobileTab() {

  quoteAccordionSections.forEach(
    section => {

      if (
        section.dataset.quoteMobileTab !==
        quoteMobileActiveTab
      ) {
        return;
      }


      section.classList.add(
        "is-open"
      );


      const content =
        section.querySelector(
          ".quote-accordion-content"
        );

      if (content) {

        content.hidden =
          false;

      }


      const icon =
        section.querySelector(
          ".quote-accordion-icon"
        );

      if (icon) {

        icon.textContent =
          "−";

      }

    }
  );

}


/* =========================================================
   TAB SWITCH
========================================================== */

function setQuoteMobileTab(
  tabKey
) {

  quoteMobileActiveTab =
    tabKey;


  quoteMobileTabButtons.forEach(
    button => {

      button.setAttribute(
        "aria-pressed",
        String(
          button.dataset.quoteMobileTabTarget ===
          tabKey
        )
      );

    }
  );


  applyQuoteMobileTabFilter();

  openSectionsForActiveQuoteMobileTab();


  quoteControls
    ?.scrollTo(
      {
        top: 0,
        behavior: "auto"
      }
    );

}


quoteMobileTabButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        setQuoteMobileTab(
          button.dataset.quoteMobileTabTarget
        );

      }
    );

  }
);



/* =========================================================
   INIT / RESIZE
========================================================== */

window.addEventListener(
  "resize",
  applyQuoteMobileTabFilter
);


applyQuoteMobileTabFilter();

openSectionsForActiveQuoteMobileTab();
