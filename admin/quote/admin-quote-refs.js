/* =========================================================
   QUOTE - REFS / STATE / MESSAGE

   admin-quote.js가 너무 커져서(2900줄+) 기능별로 쪼갠 것
   중 첫 번째 파일. admin/quote/ 폴더의 다른 파일들은 전부
   여기 있는 DOM 참조와 상태 변수를 공유해서 쓰므로 반드시
   이 파일이 제일 먼저 로드돼야 함(admin/index.html의
   스크립트 순서 참고).

   내용: 프리뷰/설정/프리셋 목록 DOM 요소 참조, 상태 변수,
   저장 메시지 표시.
========================================================== */


/* =========================================================
   ELEMENTS
========================================================== */

/* ACCORDION */

const quoteAccordionSections =
  document.querySelectorAll(
    "[data-quote-section]"
  );

const quoteAccordionToggles =
  document.querySelectorAll(
    ".quote-accordion-toggle"
  );


/* MOBILE TAB BAR */

const quoteControls =
  document.querySelector(
    ".quote-controls"
  );

const quoteMobileTabButtons =
  document.querySelectorAll(
    ".quote-mobile-tab"
  );


/* =========================================================
   TEST CONTENT
========================================================== */

const quoteTestTitle =
  document.getElementById(
    "quoteTestTitle"
  );

const quoteTestBody =
  document.getElementById(
    "quoteTestBody"
  );

const quoteTestSource =
  document.getElementById(
    "quoteTestSource"
  );


/* =========================================================
   CANVAS
========================================================== */

const quoteRatioButtons =
  document.querySelectorAll(
    ".quote-ratio-button"
  );

const quoteCustomRatioFields =
  document.getElementById(
    "quoteCustomRatioFields"
  );

const quoteRatioWidth =
  document.getElementById(
    "quoteRatioWidth"
  );

const quoteRatioHeight =
  document.getElementById(
    "quoteRatioHeight"
  );

const quoteWidth =
  document.getElementById(
    "quoteWidth"
  );

const quoteBackground =
  document.getElementById(
    "quoteBackground"
  );

const quotePadding =
  document.getElementById(
    "quotePadding"
  );

const quoteVerticalPadding =
  document.getElementById(
    "quoteVerticalPadding"
  );

const quoteHorizontalPadding =
  document.getElementById(
    "quoteHorizontalPadding"
  );


/* =========================================================
   TITLE
========================================================== */

const quoteTitleEnabled =
  document.getElementById(
    "quoteTitleEnabled"
  );

const quoteTitleColor =
  document.getElementById(
    "quoteTitleColor"
  );

const quoteTitleSize =
  document.getElementById(
    "quoteTitleSize"
  );

const quoteTitleWeight =
  document.getElementById(
    "quoteTitleWeight"
  );

const quoteTitleAlign =
  document.getElementById(
    "quoteTitleAlign"
  );

const quoteTitleLetterSpacing =
  document.getElementById(
    "quoteTitleLetterSpacing"
  );

const quoteTitleSpacing =
  document.getElementById(
    "quoteTitleSpacing"
  );


/* =========================================================
   BODY
========================================================== */

const quoteBodyFont =
  document.getElementById(
    "quoteBodyFont"
  );

const quoteTextColor =
  document.getElementById(
    "quoteTextColor"
  );


/*
  ★ NEW
  메인 에디터의 PRESET 하이라이트에서 사용할 색
*/

const quoteHighlightColor =
  document.getElementById(
    "quoteHighlightColor"
  );


/*
  ★ NEW
  메인 에디터의 포인트 컬러(글자색 강조)에서 사용할 색
*/

const quotePointColor =
  document.getElementById(
    "quotePointColor"
  );


const quoteFontSize =
  document.getElementById(
    "quoteFontSize"
  );

const quoteBodyWeight =
  document.getElementById(
    "quoteBodyWeight"
  );

const quoteLineHeight =
  document.getElementById(
    "quoteLineHeight"
  );

const quoteLetterSpacing =
  document.getElementById(
    "quoteLetterSpacing"
  );

const quoteParagraphSpacing =
  document.getElementById(
    "quoteParagraphSpacing"
  );

const quoteBodyAlign =
  document.getElementById(
    "quoteBodyAlign"
  );

const quoteVerticalAlign =
  document.getElementById(
    "quoteVerticalAlign"
  );

const quoteLineBreak =
  document.getElementById(
    "quoteLineBreak"
  );

const quoteIndent =
  document.getElementById(
    "quoteIndent"
  );


/* =========================================================
   ACTION / DIALOGUE
========================================================== */

const quoteActionColor =
  document.getElementById(
    "quoteActionColor"
  );

const quoteActionWeight =
  document.getElementById(
    "quoteActionWeight"
  );

const quoteActionItalic =
  document.getElementById(
    "quoteActionItalic"
  );

const quoteDialogueColor =
  document.getElementById(
    "quoteDialogueColor"
  );

const quoteDialogueWeight =
  document.getElementById(
    "quoteDialogueWeight"
  );

const quoteDialogueItalic =
  document.getElementById(
    "quoteDialogueItalic"
  );


/* =========================================================
   SOURCE
========================================================== */

const quoteSourceEnabled =
  document.getElementById(
    "quoteSourceEnabled"
  );

const quoteSourceColor =
  document.getElementById(
    "quoteSourceColor"
  );

const quoteSourceSize =
  document.getElementById(
    "quoteSourceSize"
  );

const quoteSourceWeight =
  document.getElementById(
    "quoteSourceWeight"
  );

const quoteSourceAlign =
  document.getElementById(
    "quoteSourceAlign"
  );

const quoteSourceSpacing =
  document.getElementById(
    "quoteSourceSpacing"
  );

const quoteSourceBottomOffset =
  document.getElementById(
    "quoteSourceBottomOffset"
  );


/* =========================================================
   PREVIEW
========================================================== */

const quotePreviewStage =
  document.getElementById(
    "quotePreviewStage"
  );

const quotePreviewCanvas =
  document.getElementById(
    "quotePreviewCanvas"
  );

const quotePreviewTitle =
  document.getElementById(
    "quotePreviewTitle"
  );

const quotePreviewText =
  document.getElementById(
    "quotePreviewText"
  );

const quotePreviewSource =
  document.getElementById(
    "quotePreviewSource"
  );

const quotePreviewSize =
  document.getElementById(
    "quotePreviewSize"
  );

const quotePreviewHelp =
  document.getElementById(
    "quotePreviewHelp"
  );

/* =========================================================
   PRESET
========================================================== */

const quotePresetName =
  document.getElementById(
    "quotePresetName"
  );

const quoteNewButton =
  document.getElementById(
    "quoteNewButton"
  );

const quoteSaveButton =
  document.getElementById(
    "quoteSaveButton"
  );

const quoteSaveMessage =
  document.getElementById(
    "quoteSaveMessage"
  );

let quotePresetList =
  document.getElementById(
    "quotePresetList"
  );


/* =========================================================
   STATE
========================================================== */

let currentQuoteRatio =
  "1:1";

let currentQuotePresetId =
  null;


/* =========================================================
   MESSAGE
========================================================== */

function showQuoteMessage(
  message,
  autoHide = false
) {

  if (!quoteSaveMessage) {
    return;
  }


  if (
    quoteSaveMessage._messageTimer
  ) {

    clearTimeout(
      quoteSaveMessage._messageTimer
    );

  }


  if (
    quoteSaveMessage._fadeTimer
  ) {

    clearTimeout(
      quoteSaveMessage._fadeTimer
    );

  }


  quoteSaveMessage.style.transition =
    "none";

  quoteSaveMessage.style.opacity =
    "1";

  quoteSaveMessage.textContent =
    message;


  if (!autoHide) {
    return;
  }


  quoteSaveMessage._messageTimer =
    setTimeout(
      () => {

        quoteSaveMessage.style.transition =
          "opacity 0.6s ease";

        quoteSaveMessage.style.opacity =
          "0";


        quoteSaveMessage._fadeTimer =
          setTimeout(
            () => {

              quoteSaveMessage.textContent =
                "";

              quoteSaveMessage.style.transition =
                "none";

              quoteSaveMessage.style.opacity =
                "1";

            },
            600
          );

      },
      2000
    );

}


