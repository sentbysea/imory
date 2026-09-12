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
   덮개 농도 — 새 프리셋의 기본값은 50%

   ★ POST_STYLE_DEFAULTS.backgroundOverlayOpacity는 0 그대로
     둔다. 그 값은 **이미 저장된 프리셋을 읽는 기준**이라, 여기서
     0.5로 바꾸면 이 필드가 생기기 전에 저장된 모든 프리셋의
     외형이 배포 한 번으로 달라진다.

   ★ 그래서 "50%"는 폼의 시작값으로만 주고, 두 조건을 **함께**
     만족할 때만 준다.

       1. 저장된 값이 없다 — 키 자체가 없다는 뜻이다. 사용자가
          일부러 0%로 맞춰 저장했으면 키가 있으므로 그 0%가
          그대로 보존된다(요구사항 1).
       2. 배경 사진도 없다 — 덮개가 그려질 자리가 아직 없다.

     둘째 조건이 있어야 "열기만 했는데 외형이 달라지는" 경우가
     아예 없다. 사진이 이미 있는데 덮개 값만 없는 옛 프리셋은
     0% 그대로 두는 것이 맞고, 사진이 없는 프리셋은 50%로 시작해도
     화면에 아무 차이가 없다 — 그 프리셋에 사진을 새로 넣는
     순간이 곧 "신규"이고, 그때 50%가 준비돼 있게 된다.
========================================================== */

const QUOTE_NEW_OVERLAY_OPACITY =
  50;


function quoteOverlayOpacityForForm(
  settings,
  resolved
) {

  const source =
    settings &&
    typeof settings === "object"
      ? settings
      : {};


  const stored =
    Object.prototype.hasOwnProperty.call(
      source,
      "backgroundOverlayOpacity"
    ) &&
    source.backgroundOverlayOpacity !== null &&
    source.backgroundOverlayOpacity !== undefined &&
    source.backgroundOverlayOpacity !== "";


  if (
    !stored &&
    !resolved.backgroundImageUrl
  ) {

    return QUOTE_NEW_OVERLAY_OPACITY;

  }


  return Math.round(
    resolved.backgroundOverlayOpacity * 100
  );

}


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
      [quoteBodyRuleGap, resolved.bodyRuleGap],
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
      [quoteDialogueRuleGap, resolved.dialogueRuleGap],


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
      [quoteSourceRuleGap, resolved.sourceRuleGap],


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
        quoteOverlayOpacityForForm(
          settings,
          resolved
        )
      ],
      [quoteBackgroundOverlayColor, resolved.backgroundOverlayColor]
    ];


  /*
    ★ 확대 슬라이더의 범위를 저장값에 맞춰 넓힌다 (요구사항 2)

    슬라이더는 50~150%지만, 예전 슬라이더는 100~300%였다. 저장된
    값이 150%를 넘는 프리셋을 열었을 때 슬라이더가 150에서 멈추면
    **저장 한 번으로 사용자의 값이 깎여 나간다** — 열기만 했는데
    값이 바뀌는 일은 없어야 한다.

    그래서 그런 프리셋에서는 이 세션 동안만 최대치를 그 값까지
    늘린다. 사용자가 슬라이더를 150 이하로 내리면 그 뒤로는
    보통의 50~150 구간에서 움직인다(내린 값이 곧 사용자의 선택
    이므로 되돌릴 이유가 없다). 다른 프리셋을 고르면 그 프리셋의
    값에 맞춰 다시 정해진다.
  */

  if (quoteBackgroundScale) {

    const storedScale =
      Math.round(
        resolved.backgroundImageScale * 100
      );


    quoteBackgroundScale.max =
      String(
        Math.max(
          POST_BACKGROUND_UI_MAX_SCALE,
          storedScale
        )
      );


    quoteBackgroundScale.min =
      String(
        Math.min(
          POST_BACKGROUND_UI_MIN_SCALE,
          storedScale
        )
      );

  }


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
      [quoteSourceRuleEnabled, resolved.sourceRuleEnabled],
      [quoteBackgroundFixedSize, resolved.backgroundImageFixedSize]
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

  quoteBackgroundWidthRatio =
    resolved.backgroundImageWidthRatio;


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
