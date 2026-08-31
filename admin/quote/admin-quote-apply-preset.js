/* =========================================================
   QUOTE - APPLY PRESET SETTINGS

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 저장된 프리셋 하나를 골랐을 때, 그 settings 객체를
   모든 입력 폼 필드에 되돌려 채워 넣는 로직.
========================================================== */


/* =========================================================
   APPLY PRESET SETTINGS
========================================================== */

function applyQuoteSettings(
  settings
) {

  /* CANVAS */

  currentQuoteRatio =
    settings.ratio ||
    "1:1";


  quoteRatioButtons.forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.ratio ===
        currentQuoteRatio
      );

    }
  );


  if (
    quoteCustomRatioFields
  ) {

    quoteCustomRatioFields.hidden =
      currentQuoteRatio !==
      "custom";

  }


  if (quoteRatioWidth) {

    quoteRatioWidth.value =
      settings.ratioWidth ??
      4;

  }


  if (quoteRatioHeight) {

    quoteRatioHeight.value =
      settings.ratioHeight ??
      5;

  }


  if (quoteWidth) {

    quoteWidth.value =
      settings.exportWidth ??
      1080;

  }


  if (quoteBackground) {

    quoteBackground.value =
      settings.background ||
      "#ffffff";

  }


  if (quotePadding) {

    quotePadding.value =
      settings.padding ??
      48;

  }


  if (quoteVerticalPadding) {

    quoteVerticalPadding.value =
      settings.verticalPadding ??
      0;

  }


  if (quoteHorizontalPadding) {

    quoteHorizontalPadding.value =
      settings.horizontalPadding ??
      0;

  }


  /* TITLE */

  if (quoteTitleEnabled) {

    quoteTitleEnabled.checked =
      settings.titleEnabled ??
      true;

  }


  if (quoteTitleColor) {

    quoteTitleColor.value =
      settings.titleColor ||
      "#222222";

  }


  if (quoteTitleSize) {

    quoteTitleSize.value =
      settings.titleSize ??
      24;

  }


  if (quoteTitleWeight) {

    quoteTitleWeight.value =
      settings.titleWeight ||
      "400";

  }


  if (quoteTitleAlign) {

    quoteTitleAlign.value =
      settings.titleAlign ||
      "left";

  }


  if (quoteTitleLetterSpacing) {

    quoteTitleLetterSpacing.value =
      settings.titleLetterSpacing ??
      0;

  }


  if (quoteTitleSpacing) {

    quoteTitleSpacing.value =
      settings.titleSpacing ??
      28;

  }


  /* BODY */

  if (quoteBodyFont) {

    quoteBodyFont.value =
      settings.bodyFont ||
      "pretendard";

  }


  if (quoteTextColor) {

    quoteTextColor.value =
      settings.bodyColor ||
      "#333333";

  }


  /*
    ★ NEW

    예전에 저장한 Vibe 프리셋에는
    highlightColor가 없을 수 있으므로
    기본값 #f4dce6 사용.
  */

  if (quoteHighlightColor) {

    quoteHighlightColor.value =
      settings.highlightColor ||
      "#f4dce6";

  }


  /*
    ★ NEW
    예전에 저장한 프리셋에는
    pointColor가 없을 수 있으므로
    기본값 #5c7cfa 사용.
  */

  if (quotePointColor) {

    quotePointColor.value =
      settings.pointColor ||
      "#5c7cfa";

  }


  if (quoteFontSize) {

    quoteFontSize.value =
      settings.bodySize ??
      16;

  }


  if (quoteBodyWeight) {

    quoteBodyWeight.value =
      settings.bodyWeight ||
      "500";

  }


  if (quoteLineHeight) {

    quoteLineHeight.value =
      settings.lineHeight ??
      1.8;

  }


  if (quoteLetterSpacing) {

    quoteLetterSpacing.value =
      settings.letterSpacing ??
      0;

  }


  if (quoteParagraphSpacing) {

    quoteParagraphSpacing.value =
      settings.paragraphSpacing ??
      14;

  }


  if (quoteBodyAlign) {

    quoteBodyAlign.value =
      settings.bodyAlign ||
      "left";

  }


  if (quoteVerticalAlign) {

    quoteVerticalAlign.value =
      settings.verticalAlign ||
      "top";

  }


  if (quoteLineBreak) {

    quoteLineBreak.value =
      settings.lineBreak ||
      "keep";

  }


  if (quoteIndent) {

    quoteIndent.value =
      settings.indent ??
      0;

  }


  /* ACTION */

  if (quoteActionColor) {

    quoteActionColor.value =
      settings.actionColor ||
      "#888888";

  }


  if (quoteActionWeight) {

    quoteActionWeight.value =
      settings.actionWeight ||
      "400";

  }


  if (quoteActionItalic) {

    quoteActionItalic.checked =
      settings.actionItalic ??
      false;

  }


  /* DIALOGUE */

  if (quoteDialogueColor) {

    quoteDialogueColor.value =
      settings.dialogueColor ||
      "#333333";

  }


  if (quoteDialogueWeight) {

    quoteDialogueWeight.value =
      settings.dialogueWeight ||
      "500";

  }


  if (quoteDialogueItalic) {

    quoteDialogueItalic.checked =
      settings.dialogueItalic ??
      false;

  }


  /* SOURCE */

  if (quoteTestSource) {

    quoteTestSource.value =
      settings.sourceText ??
      "@hongcha";

  }


  if (quoteSourceEnabled) {

    quoteSourceEnabled.checked =
      settings.sourceEnabled ??
      true;

  }


  if (quoteSourceColor) {

    quoteSourceColor.value =
      settings.sourceColor ||
      "#999999";

  }


  if (quoteSourceSize) {

    quoteSourceSize.value =
      settings.sourceSize ??
      11;

  }


  if (quoteSourceWeight) {

    quoteSourceWeight.value =
      settings.sourceWeight ||
      "300";

  }


  if (quoteSourceAlign) {

    quoteSourceAlign.value =
      settings.sourceAlign ||
      "right";

  }


  if (quoteSourceSpacing) {

    quoteSourceSpacing.value =
      settings.sourceSpacing ??
      28;

  }


  if (quoteSourceBottomOffset) {

    quoteSourceBottomOffset.value =
      settings.sourceBottomOffset ??
      0;

  }


  updateQuotePreview();

}


