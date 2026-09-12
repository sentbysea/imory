/* =========================================================
   QUOTE - APPLY PRESET SETTINGS

   admin-quote.js 분할본. DOM 참조/상태는
   admin-quote-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 저장된 프리셋 하나를 골랐을 때, 그 settings 객체를
   모든 입력 폼 필드에 되돌려 채워 넣는 로직.

   ★ 기본값을 여기서 따로 정하지 않는다.

     예전에는 이 파일이 "폼 기본값"(padding 48, titleSpacing 28,
     paragraphSpacing 14 …)을 갖고 있었고, 수집(collectQuoteSettings)과
     실제 렌더(applyPostBodyStyles)는 또 다른 기본값을 갖고 있었다.
     그래서 키가 빠진 옛 프리셋에서 폼에 보이는 값 · 두 미리보기 ·
     발행 본문이 서로 달랐다(IMORY_QUOTE_PRESET_RENDER_AUDIT.md
     §4 (E)).

     지금은 공용 normalizePostStyleSettings()
     (posts/style/posts-body-layout.js) 하나만 쓴다. 그 기본값은
     **지금 발행된 본문과 에디터 PREVIEW가 실제로 그리던 값**이라,
     폼이 보여주는 값이 곧 화면에 그려지는 값이다.

   ★ 알 수 없는 필드

     원본 settings를 loadedQuotePresetSettings에 그대로 남겨
     둔다 — collectQuoteSettings()가 그 위에 폼 값을 덮어쓰므로,
     이 화면에 입력칸이 없는 필드가 저장 한 번으로 사라지지
     않는다.
========================================================== */


/* =========================================================
   APPLY PRESET SETTINGS
========================================================== */

function applyQuoteSettings(
  settings
) {

  loadedQuotePresetSettings =
    settings &&
    typeof settings === "object"
      ? {
          ...settings
        }
      : {};


  const resolved =
    normalizePostStyleSettings(
      settings
    );


  /* CANVAS */

  currentQuoteRatio =
    resolved.ratio;


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


  const fieldValues =
    [
      [quoteRatioWidth, resolved.ratioWidth],
      [quoteRatioHeight, resolved.ratioHeight],
      [quoteWidth, resolved.exportWidth],
      [quoteBackground, resolved.background],
      [quotePadding, resolved.padding],
      [quoteVerticalPadding, resolved.verticalPadding],
      [quoteHorizontalPadding, resolved.horizontalPadding],


      /* TITLE */

      [quoteTitleColor, resolved.titleColor],
      [quoteTitleSize, resolved.titleSize],
      [quoteTitleWeight, resolved.titleWeight],
      [quoteTitleAlign, resolved.titleAlign],
      [quoteTitleLetterSpacing, resolved.titleLetterSpacing],
      [quoteTitleSpacing, resolved.titleSpacing],


      /* BODY */

      [quoteBodyFont, resolved.bodyFont],
      [quoteTextColor, resolved.bodyColor],
      [quoteHighlightColor, resolved.highlightColor],
      [quotePointColor, resolved.pointColor],
      [quoteFontSize, resolved.bodySize],
      [quoteBodyWeight, resolved.bodyWeight],
      [quoteLineHeight, resolved.lineHeight],
      [quoteLetterSpacing, resolved.letterSpacing],
      [quoteParagraphSpacing, resolved.paragraphSpacing],
      [quoteBodyAlign, resolved.bodyAlign],
      [quoteVerticalAlign, resolved.verticalAlign],
      [quoteLineBreak, resolved.lineBreak],
      [quoteIndent, resolved.indent],


      /* ACTION */

      [quoteActionColor, resolved.actionColor],
      [quoteActionWeight, resolved.actionWeight],


      /* DIALOGUE */

      [quoteDialogueColor, resolved.dialogueColor],
      [quoteDialogueWeight, resolved.dialogueWeight],


      /* SOURCE */

      [quoteTestSource, resolved.sourceText],
      [quoteSourceColor, resolved.sourceColor],
      [quoteSourceSize, resolved.sourceSize],
      [quoteSourceWeight, resolved.sourceWeight],
      [quoteSourceAlign, resolved.sourceAlign],
      [quoteSourceSpacing, resolved.sourceSpacing],
      [quoteSourceBottomOffset, resolved.sourceBottomOffset]
    ];


  fieldValues.forEach(
    (
      [
        input,
        value
      ]
    ) => {

      if (!input) {
        return;
      }


      input.value =
        String(
          value
        );

    }
  );


  const checkedValues =
    [
      [quoteTitleEnabled, resolved.titleEnabled],
      [quoteActionItalic, resolved.actionItalic],
      [quoteDialogueItalic, resolved.dialogueItalic],
      [quoteSourceEnabled, resolved.sourceEnabled]
    ];


  checkedValues.forEach(
    (
      [
        input,
        value
      ]
    ) => {

      if (!input) {
        return;
      }


      input.checked =
        value;

    }
  );


  updateQuotePreview();

}
