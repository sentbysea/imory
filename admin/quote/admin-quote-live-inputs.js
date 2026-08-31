/* =========================================================
   QUOTE - LIVE INPUTS / COLLECT PRESET SETTINGS

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 설정 입력칸이 바뀔 때마다 프리뷰 갱신, 폼 입력값을
   모아서 하나의 settings 객체로 만드는 함수
   (collectQuoteSettings 등 — 프리셋 저장/DB에 그대로 들어감).
========================================================== */


/* =========================================================
   LIVE INPUTS
========================================================== */

const quoteLiveInputs = [

  quoteTestTitle,
  quoteTestBody,
  quoteTestSource,

  quoteRatioWidth,
  quoteRatioHeight,
  quoteWidth,
  quoteBackground,
  quotePadding,
  quoteVerticalPadding,
  quoteHorizontalPadding,

  quoteTitleEnabled,
  quoteTitleColor,
  quoteTitleSize,
  quoteTitleWeight,
  quoteTitleAlign,
  quoteTitleLetterSpacing,
  quoteTitleSpacing,

  quoteBodyFont,
  quoteTextColor,

  /*
    ★ NEW
  */
  quoteHighlightColor,
  quotePointColor,

  quoteFontSize,
  quoteBodyWeight,
  quoteLineHeight,
  quoteLetterSpacing,
  quoteParagraphSpacing,
  quoteBodyAlign,
  quoteVerticalAlign,
  quoteLineBreak,
  quoteIndent,

  quoteActionColor,
  quoteActionWeight,
  quoteActionItalic,

  quoteDialogueColor,
  quoteDialogueWeight,
  quoteDialogueItalic,

  quoteSourceEnabled,
  quoteSourceColor,
  quoteSourceSize,
  quoteSourceWeight,
  quoteSourceAlign,
  quoteSourceSpacing,
  quoteSourceBottomOffset

];


quoteLiveInputs.forEach(
  input => {

    if (!input) {
      return;
    }


    input.addEventListener(
      "input",
      updateQuotePreview
    );


    input.addEventListener(
      "change",
      updateQuotePreview
    );

  }
);


/* =========================================================
   COLLECT PRESET SETTINGS
========================================================== */

function collectQuoteSettings() {

  return {

    /* CANVAS */

    ratio:
      currentQuoteRatio,

    ratioWidth:
      Number(
        quoteRatioWidth?.value
      ) || 4,

    ratioHeight:
      Number(
        quoteRatioHeight?.value
      ) || 5,

    exportWidth:
      Number(
        quoteWidth?.value
      ) || 1080,

    background:
      quoteBackground?.value ||
      "#ffffff",

    padding:
      Number(
        quotePadding?.value
      ) || 0,

    verticalPadding:
      Number(
        quoteVerticalPadding?.value
      ) || 0,

    horizontalPadding:
      Number(
        quoteHorizontalPadding?.value
      ) || 0,


    /* TITLE */

    titleEnabled:
      quoteTitleEnabled?.checked ??
      true,

    titleColor:
      quoteTitleColor?.value ||
      "#222222",

    titleSize:
      Number(
        quoteTitleSize?.value
      ) || 24,

    titleWeight:
      quoteTitleWeight?.value ||
      "400",

    titleAlign:
      quoteTitleAlign?.value ||
      "left",

    titleLetterSpacing:
      Number(
        quoteTitleLetterSpacing?.value
      ) || 0,

    titleSpacing:
      Number(
        quoteTitleSpacing?.value
      ) || 0,


    /* BODY */

    bodyFont:
      quoteBodyFont?.value ||
      "pretendard",

    bodyColor:
      quoteTextColor?.value ||
      "#333333",


    /*
      ★ NEW
      메인 글 에디터의 PRESET HIGHLIGHT가
      이 값을 사용하게 된다.
    */

    highlightColor:
      quoteHighlightColor?.value ||
      "#f4dce6",


    /*
      ★ NEW
      메인 글 에디터의 POINT COLOR가
      이 값을 사용하게 된다.
    */

    pointColor:
      quotePointColor?.value ||
      "#5c7cfa",


    bodySize:
      Number(
        quoteFontSize?.value
      ) || 16,

    bodyWeight:
      quoteBodyWeight?.value ||
      "500",

    lineHeight:
      Number(
        quoteLineHeight?.value
      ) || 1.8,

    letterSpacing:
      Number(
        quoteLetterSpacing?.value
      ) || 0,

    paragraphSpacing:
      Number(
        quoteParagraphSpacing?.value
      ) || 0,

    bodyAlign:
      quoteBodyAlign?.value ||
      "left",

    verticalAlign:
      quoteVerticalAlign?.value ||
      "top",

    lineBreak:
      quoteLineBreak?.value ||
      "keep",

    indent:
      Number(
        quoteIndent?.value
      ) || 0,


    /* ACTION */

    actionColor:
      quoteActionColor?.value ||
      "#888888",

    actionWeight:
      quoteActionWeight?.value ||
      "400",

    actionItalic:
      quoteActionItalic?.checked ??
      false,


    /* DIALOGUE */

    dialogueColor:
      quoteDialogueColor?.value ||
      "#333333",

    dialogueWeight:
      quoteDialogueWeight?.value ||
      "500",

    dialogueItalic:
      quoteDialogueItalic?.checked ??
      false,


    /* SOURCE */

    sourceText:
      quoteTestSource?.value ||
      "",

    sourceEnabled:
      quoteSourceEnabled?.checked ??
      true,

    sourceColor:
      quoteSourceColor?.value ||
      "#999999",

    sourceSize:
      Number(
        quoteSourceSize?.value
      ) || 11,

    sourceWeight:
      quoteSourceWeight?.value ||
      "300",

    sourceAlign:
      quoteSourceAlign?.value ||
      "right",

    sourceSpacing:
      Number(
        quoteSourceSpacing?.value
      ) || 0,


    /*
      ★ NEW
      source는 항상 캔버스 맨 아래 고정. 이 값은 그 고정
      위치에서 캔버스 맨 아래로부터 추가로 얼마나 띄울지
      (marginBottom)를 정한다 — posts-preview.js의
      createPreviewSource 참고.
    */

    sourceBottomOffset:
      Number(
        quoteSourceBottomOffset?.value
      ) || 0

  };

}


