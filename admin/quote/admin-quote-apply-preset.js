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

  /*
    ★ 저장된 ratio를 그대로 버튼 값으로 쓰지 않는다.

    지금 버튼은 uniform / auto / custom 셋뿐인데, 그 전
    프리셋에는 "1:1" · "4:5" · "9:16" 같은 고정 비율 문자열이
    들어 있다. 그 값은 **custom + 가로 비/세로 비**로 손실 없이
    들어온다 — 같은 규칙을 Preview도 쓰므로(감사 §11.2) 두
    화면이 같은 프리셋에서 다른 캔버스를 그리지 않는다.
  */

  currentQuoteRatio =
    quoteRatioModeFromSettings(
      resolved
    );


  const ratioParts =
    quoteRatioPartsFromSettings(
      resolved
    );


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
      [quoteRatioWidth, ratioParts.width],
      [quoteRatioHeight, ratioParts.height],
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
      [quoteHighlightHeight, resolved.highlightHeight],
      [quoteBodyRuleColor, resolved.bodyRuleColor],
      [quoteBodyRuleWidth, resolved.bodyRuleWidth],
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
      [quoteDialogueRuleColor, resolved.dialogueRuleColor],
      [quoteDialogueRuleWidth, resolved.dialogueRuleWidth],


      /* SOURCE */

      [quoteTestSource, resolved.sourceText],
      [quoteSourceColor, resolved.sourceColor],
      [quoteSourceSize, resolved.sourceSize],
      [quoteSourceWeight, resolved.sourceWeight],
      [quoteSourceAlign, resolved.sourceAlign],
      [quoteSourceSpacing, resolved.sourceSpacing],
      [quoteSourceBottomOffset, resolved.sourceBottomOffset],
      [quoteSourceRuleColor, resolved.sourceRuleColor],
      [quoteSourceRuleWidth, resolved.sourceRuleWidth],


      /* CANVAS 배경 사진 */

      [
        quoteBackgroundScale,
        Math.round(
          resolved.backgroundImageScale * 100
        )
      ],
      [quoteBackgroundBlur, resolved.backgroundImageBlur],
      [
        quoteBackgroundOverlayOpacity,
        Math.round(
          resolved.backgroundOverlayOpacity * 100
        )
      ],
      [quoteBackgroundOverlayColor, resolved.backgroundOverlayColor]
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
      [quoteDialogueRuleEnabled, resolved.dialogueRuleEnabled],
      [quoteSourceEnabled, resolved.sourceEnabled],
      [quoteSourceRuleEnabled, resolved.sourceRuleEnabled]
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


  /*
    배경 사진의 주소와 중심은 입력칸이 없으므로 따로 되돌린다
    (admin-quote-refs.js의 상태 변수).
  */

  quoteBackgroundImageUrl =
    resolved.backgroundImageUrl ||
    "";

  quoteBackgroundFocusX =
    resolved.backgroundImageFocusX;

  quoteBackgroundFocusY =
    resolved.backgroundImageFocusY;


  if (
    typeof syncQuoteBackgroundControls === "function"
  ) {

    syncQuoteBackgroundControls();

  }


  if (
    typeof syncAllQuoteRangeInputs === "function"
  ) {

    syncAllQuoteRangeInputs();

  }


  updateQuotePreview();

}
