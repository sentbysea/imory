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

   ★ 두 가지 규칙

     1. 알 수 없는 필드를 보존한다.
        마지막으로 불러온 프리셋의 settings(loadedQuotePresetSettings)를
        밑바탕으로 깔고 그 위에 폼 값을 덮어쓴다 — 이 화면에
        입력칸이 없는 필드(옛 필드, 아직 UI로 옮기지 않은 canvas
        값)가 저장 한 번으로 사라지지 않는다.

     2. 명시적으로 저장된 0을 지운 값으로 보지 않는다.
        postStyleNumber()(posts/style/posts-body-layout.js)가
        빈 칸만 기본값으로 돌리고 "0"은 0으로 읽는다.

   ★ 누락된 legacy 값의 기본값 자체는 여기 있지 않다.
     applyQuoteSettings()가 프리셋을 폼에 되채울 때 이미 공용
     normalizePostStyleSettings()를 거치므로, 여기서 읽는 값은
     이미 정규화된 값이다(폼 → 저장 → 다시 열기 왕복에서 값이
     바뀌지 않는다).
========================================================== */

function quoteInputNumber(
  input,
  fallback
) {

  return postStyleNumber(
    input?.value,
    fallback
  );

}


function quoteInputText(
  input,
  fallback
) {

  return postStyleText(
    input?.value,
    fallback
  );

}


function collectQuoteSettings() {

  return {

    ...loadedQuotePresetSettings,


    /* CANVAS */

    ratio:
      currentQuoteRatio,

    ratioWidth:
      quoteInputNumber(
        quoteRatioWidth,
        POST_STYLE_DEFAULTS.ratioWidth
      ),

    ratioHeight:
      quoteInputNumber(
        quoteRatioHeight,
        POST_STYLE_DEFAULTS.ratioHeight
      ),

    exportWidth:
      quoteInputNumber(
        quoteWidth,
        POST_STYLE_DEFAULTS.exportWidth
      ),

    background:
      quoteInputText(
        quoteBackground,
        POST_STYLE_DEFAULTS.background
      ),

    padding:
      quoteInputNumber(
        quotePadding,
        POST_STYLE_DEFAULTS.padding
      ),

    verticalPadding:
      quoteInputNumber(
        quoteVerticalPadding,
        POST_STYLE_DEFAULTS.verticalPadding
      ),

    horizontalPadding:
      quoteInputNumber(
        quoteHorizontalPadding,
        POST_STYLE_DEFAULTS.horizontalPadding
      ),


    /* TITLE */

    titleEnabled:
      quoteTitleEnabled?.checked ??
      POST_STYLE_DEFAULTS.titleEnabled,

    titleColor:
      quoteInputText(
        quoteTitleColor,
        POST_STYLE_DEFAULTS.titleColor
      ),

    titleSize:
      quoteInputNumber(
        quoteTitleSize,
        POST_STYLE_DEFAULTS.titleSize
      ),

    titleWeight:
      quoteInputText(
        quoteTitleWeight,
        POST_STYLE_DEFAULTS.titleWeight
      ),

    titleAlign:
      quoteInputText(
        quoteTitleAlign,
        POST_STYLE_DEFAULTS.titleAlign
      ),

    titleLetterSpacing:
      quoteInputNumber(
        quoteTitleLetterSpacing,
        POST_STYLE_DEFAULTS.titleLetterSpacing
      ),

    titleSpacing:
      quoteInputNumber(
        quoteTitleSpacing,
        POST_STYLE_DEFAULTS.titleSpacing
      ),


    /* BODY */

    bodyFont:
      quoteInputText(
        quoteBodyFont,
        POST_STYLE_DEFAULTS.bodyFont
      ),

    bodyColor:
      quoteInputText(
        quoteTextColor,
        POST_STYLE_DEFAULTS.bodyColor
      ),


    /*
      메인 글 에디터의 PRESET HIGHLIGHT / POINT COLOR가
      이 값을 사용한다.
    */

    highlightColor:
      quoteInputText(
        quoteHighlightColor,
        POST_STYLE_DEFAULTS.highlightColor
      ),

    pointColor:
      quoteInputText(
        quotePointColor,
        POST_STYLE_DEFAULTS.pointColor
      ),


    bodySize:
      quoteInputNumber(
        quoteFontSize,
        POST_STYLE_DEFAULTS.bodySize
      ),

    bodyWeight:
      quoteInputText(
        quoteBodyWeight,
        POST_STYLE_DEFAULTS.bodyWeight
      ),

    lineHeight:
      quoteInputNumber(
        quoteLineHeight,
        POST_STYLE_DEFAULTS.lineHeight
      ),

    letterSpacing:
      quoteInputNumber(
        quoteLetterSpacing,
        POST_STYLE_DEFAULTS.letterSpacing
      ),

    paragraphSpacing:
      quoteInputNumber(
        quoteParagraphSpacing,
        POST_STYLE_DEFAULTS.paragraphSpacing
      ),

    bodyAlign:
      quoteInputText(
        quoteBodyAlign,
        POST_STYLE_DEFAULTS.bodyAlign
      ),

    verticalAlign:
      quoteInputText(
        quoteVerticalAlign,
        POST_STYLE_DEFAULTS.verticalAlign
      ),

    lineBreak:
      quoteInputText(
        quoteLineBreak,
        POST_STYLE_DEFAULTS.lineBreak
      ),

    indent:
      quoteInputNumber(
        quoteIndent,
        POST_STYLE_DEFAULTS.indent
      ),


    /* ACTION */

    actionColor:
      quoteInputText(
        quoteActionColor,
        POST_STYLE_DEFAULTS.actionColor
      ),

    actionWeight:
      quoteInputText(
        quoteActionWeight,
        POST_STYLE_DEFAULTS.actionWeight
      ),

    actionItalic:
      quoteActionItalic?.checked ??
      POST_STYLE_DEFAULTS.actionItalic,


    /* DIALOGUE */

    dialogueColor:
      quoteInputText(
        quoteDialogueColor,
        POST_STYLE_DEFAULTS.dialogueColor
      ),

    dialogueWeight:
      quoteInputText(
        quoteDialogueWeight,
        POST_STYLE_DEFAULTS.dialogueWeight
      ),

    dialogueItalic:
      quoteDialogueItalic?.checked ??
      POST_STYLE_DEFAULTS.dialogueItalic,


    /* SOURCE */

    /*
      출처 문구는 빈 문자열도 사용자가 고른 값이다 —
      기본값으로 되돌리지 않는다.
    */

    sourceText:
      typeof quoteTestSource?.value === "string"
        ? quoteTestSource.value
        : POST_STYLE_DEFAULTS.sourceText,

    sourceEnabled:
      quoteSourceEnabled?.checked ??
      POST_STYLE_DEFAULTS.sourceEnabled,

    sourceColor:
      quoteInputText(
        quoteSourceColor,
        POST_STYLE_DEFAULTS.sourceColor
      ),

    sourceSize:
      quoteInputNumber(
        quoteSourceSize,
        POST_STYLE_DEFAULTS.sourceSize
      ),

    sourceWeight:
      quoteInputText(
        quoteSourceWeight,
        POST_STYLE_DEFAULTS.sourceWeight
      ),

    sourceAlign:
      quoteInputText(
        quoteSourceAlign,
        POST_STYLE_DEFAULTS.sourceAlign
      ),

    sourceSpacing:
      quoteInputNumber(
        quoteSourceSpacing,
        POST_STYLE_DEFAULTS.sourceSpacing
      ),


    /*
      source는 항상 캔버스 맨 아래 고정. 이 값은 그 고정
      위치에서 캔버스 맨 아래로부터 추가로 얼마나 띄울지를
      정한다 — posts/preview/posts-page-layout.js의
      createPostPageSource 참고.
    */

    sourceBottomOffset:
      quoteInputNumber(
        quoteSourceBottomOffset,
        POST_STYLE_DEFAULTS.sourceBottomOffset
      )

  };

}
