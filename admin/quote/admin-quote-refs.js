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


/*
  ★ NEW
  형광펜 높이 — 글자 크기에 대한 비율(%). 100이면 예전 그대로
  글자 상자를 가득 채운다(posts/style/posts-body-decor.js).
*/

const quoteHighlightHeight =
  document.getElementById(
    "quoteHighlightHeight"
  );

/*
  ★ 형광펜 높이·강조선 굵기·덮개 농도는 슬라이더에서 네모 숫자
  칸으로 바뀌었다(요구사항 3·1) — 값을 따로 보여주는 요소가
  없어졌으므로 *Value 참조도 함께 사라졌다.
*/


/*
  ★ NEW
  강조선(문단 왼쪽 세로선)의 BODY 기본값 — 에디터에서 수동으로
  걸 때 쓰인다.
*/

const quoteBodyRuleColor =
  document.getElementById(
    "quoteBodyRuleColor"
  );

const quoteBodyRuleWidth =
  document.getElementById(
    "quoteBodyRuleWidth"
  );

/*
  선과 글자 사이 거리(px). 값이 없는 옛 프리셋은 12px로 읽힌다
  (posts/style/posts-body-decor.js의 POST_RULE_GAP).
*/

const quoteBodyRuleGap =
  document.getElementById(
    "quoteBodyRuleGap"
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


/* ★ NEW — 대사 문단 강조선 자동 적용 */

const quoteDialogueRuleEnabled =
  document.getElementById(
    "quoteDialogueRuleEnabled"
  );

const quoteDialogueRuleColor =
  document.getElementById(
    "quoteDialogueRuleColor"
  );

const quoteDialogueRuleWidth =
  document.getElementById(
    "quoteDialogueRuleWidth"
  );

const quoteDialogueRuleGap =
  document.getElementById(
    "quoteDialogueRuleGap"
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


/* ★ NEW — 출처 강조선 */

const quoteSourceRuleEnabled =
  document.getElementById(
    "quoteSourceRuleEnabled"
  );

const quoteSourceRuleColor =
  document.getElementById(
    "quoteSourceRuleColor"
  );

const quoteSourceRuleWidth =
  document.getElementById(
    "quoteSourceRuleWidth"
  );

const quoteSourceRuleGap =
  document.getElementById(
    "quoteSourceRuleGap"
  );


/* =========================================================
   CANVAS 배경 사진 (★ NEW)

   기준 문서: posts/style/posts-canvas-background.js
========================================================== */

const quoteBackgroundPick =
  document.getElementById(
    "quoteBackgroundPick"
  );

const quoteBackgroundRemove =
  document.getElementById(
    "quoteBackgroundRemove"
  );

const quoteBackgroundFile =
  document.getElementById(
    "quoteBackgroundFile"
  );

const quoteBackgroundMessage =
  document.getElementById(
    "quoteBackgroundMessage"
  );

const quoteBackgroundSettings =
  document.getElementById(
    "quoteBackgroundSettings"
  );

const quoteBackgroundScale =
  document.getElementById(
    "quoteBackgroundScale"
  );

const quoteBackgroundScaleValue =
  document.getElementById(
    "quoteBackgroundScaleValue"
  );

const quoteBackgroundBlur =
  document.getElementById(
    "quoteBackgroundBlur"
  );

const quoteBackgroundBlurValue =
  document.getElementById(
    "quoteBackgroundBlurValue"
  );

const quoteBackgroundOverlayOpacity =
  document.getElementById(
    "quoteBackgroundOverlayOpacity"
  );

/*
  이미지 크기 고정 — 켜면 사진의 표시 너비를 캔버스 너비에 대한
  비율로 잡는다(posts/style/posts-canvas-background.js).
*/

const quoteBackgroundFixedSize =
  document.getElementById(
    "quoteBackgroundFixedSize"
  );

const quoteBackgroundOverlayColor =
  document.getElementById(
    "quoteBackgroundOverlayColor"
  );


/*
  배경 사진의 주소와 중심은 입력칸이 없다(슬라이더/드래그로만
  정한다) — 폼 값이 아니라 이 상태 변수가 들고 있고,
  collectQuoteSettings()가 그대로 저장한다.
*/

let quoteBackgroundImageUrl =
  "";

let quoteBackgroundFocusX =
  0.5;

let quoteBackgroundFocusY =
  0.5;


/*
  이미지 크기 고정일 때의 "표시 너비 ÷ 캔버스 너비". 입력칸이
  없다 — 옵션을 켜는 순간 미리보기에 지금 그려져 있는 크기를
  그대로 재서 잡는다(admin-quote-background.js).
*/

let quoteBackgroundWidthRatio =
  1;


/* =========================================================
   PREVIEW
========================================================== */

const quotePreviewStage =
  document.getElementById(
    "quotePreviewStage"
  );

/*
  ★ 페이지 한 장(제목/본문/출처)은 더 이상 static 마크업이
  아니다 — 글쓰기 화면과 같은 공용 코드
  (posts/preview/posts-page-layout.js)가 이 host 안에 만든다.
  그래서 quotePreviewTitle/Text/Source 참조도 없어졌다.
*/

const quotePreviewCanvas =
  document.getElementById(
    "quotePreviewCanvas"
  );

const quotePreviewPagination =
  document.getElementById(
    "quotePreviewPagination"
  );

const quotePreviewPrev =
  document.getElementById(
    "quotePreviewPrev"
  );

const quotePreviewNext =
  document.getElementById(
    "quotePreviewNext"
  );

const quotePreviewPageIndicator =
  document.getElementById(
    "quotePreviewPageIndicator"
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

/*
  비율 모드 — "uniform" · "auto" · "custom" 셋 중 하나다.
  옛 프리셋의 고정 비율 문자열("4:5" 등)은 프리셋을 열 때
  custom + 가로 비/세로 비로 들어온다
  (quoteRatioModeFromSettings — admin-quote-ratio-parser.js).
*/

let currentQuoteRatio =
  "custom";

let currentQuotePresetId =
  null;


/*
  ★ 마지막으로 불러온 프리셋의 settings 원본.

  collectQuoteSettings()가 이 객체를 밑바탕으로 쓴다 — 이
  화면에 입력칸이 없는 필드(예전 필드, 아직 UI로 옮기지 않은
  canvas 값, 다른 버전이 적어둔 값)가 저장 한 번으로 사라지지
  않게 하기 위해서다. 입력칸이 있는 필드는 전부 폼 값으로
  덮어쓴다.
*/

let loadedQuotePresetSettings =
  {};


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


