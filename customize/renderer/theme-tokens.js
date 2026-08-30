/* =========================================================
   CUSTOMIZE RENDERER - THEME TOKENS

   background/point 2개 입력만으로 CSS 커스텀 프로퍼티 7개를
   계산하는 순수 함수. DOM을 건드리지 않는다(값 계산만) —
   실제 적용은 render-layout.js가 container.style.setProperty로
   담당.

   이번 단계에는 Advanced override가 없고, 시스템 UI 전체
   CSS를 이 토큰으로 바꿔치는 일도 하지 않는다(customize
   renderer가 렌더하는 범위 안에서만 사용).

   block-defaults.js(CUSTOMIZE_DEFAULT_THEME)보다 뒤에
   로드돼도 상관없음 — 이 파일 자체는 그 상수를 참조하지 않고
   자체 fallback을 갖는다.
========================================================== */

const CUSTOMIZE_THEME_TOKEN_NAMES =
  [
    "--theme-bg",
    "--theme-surface",
    "--theme-surface-hover",
    "--theme-text",
    "--theme-text-muted",
    "--theme-accent",
    "--theme-border"
  ];


/* =========================================================
   색상 유틸(순수 함수)
========================================================== */

function isValidCustomizeHexColor(
  value
) {

  return (
    typeof value === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(value)
  );

}


function parseCustomizeHexColor(
  hex
) {

  const normalized =
    hex.slice(1);

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };

}


function toCustomizeHexColor(
  rgb
) {

  const clampByte =
    (value) =>
      Math.max(
        0,
        Math.min(255, Math.round(value))
      );

  const toHex =
    (value) =>
      clampByte(value)
        .toString(16)
        .padStart(2, "0");

  return (
    "#" +
    toHex(rgb.r) +
    toHex(rgb.g) +
    toHex(rgb.b)
  );

}


/* 두 색을 weight(0~1, target 쪽 비중)만큼 섞음 */

function mixCustomizeColor(
  base,
  target,
  weight
) {

  return {
    r: base.r + (target.r - base.r) * weight,
    g: base.g + (target.g - base.g) * weight,
    b: base.b + (target.b - base.b) * weight
  };

}


/* WCAG relative luminance (0 = 검정, 1 = 흰색) */

function getCustomizeRelativeLuminance(
  rgb
) {

  const toLinear =
    (channel) => {

      const normalized =
        channel / 255;

      return (
        normalized <= 0.03928
          ? normalized / 12.92
          : Math.pow(
              (normalized + 0.055) / 1.055,
              2.4
            )
      );

    };

  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );

}


/* =========================================================
   computeCustomizeThemeTokens

   입력: { background, point } ("#rrggbb" 문자열, 둘 다 옵션 —
   빠지거나 잘못된 값이면 CUSTOMIZE_DEFAULT_THEME과 동일한
   fallback을 씀).

   출력: { "--theme-bg": "#...", ... } 7개 키를 가진 새 객체.
   순수 함수 — 입력 객체를 변형하지 않고, 매 호출 새 객체를 반환.
========================================================== */

function computeCustomizeThemeTokens(
  input
) {

  const FALLBACK_BACKGROUND =
    "#ffffff";

  const FALLBACK_POINT =
    "#5c7cfa";

  const backgroundHex =
    isValidCustomizeHexColor(input?.background)
      ? input.background
      : FALLBACK_BACKGROUND;

  const pointHex =
    isValidCustomizeHexColor(input?.point)
      ? input.point
      : FALLBACK_POINT;


  const backgroundRgb =
    parseCustomizeHexColor(backgroundHex);

  const luminance =
    getCustomizeRelativeLuminance(backgroundRgb);

  const isDarkBackground =
    luminance < 0.5;


  const white =
    { r: 255, g: 255, b: 255 };

  const black =
    { r: 0, g: 0, b: 0 };

  const textRgb =
    isDarkBackground ? white : black;

  const surfaceMixTarget =
    isDarkBackground ? white : black;


  const surfaceRgb =
    mixCustomizeColor(
      backgroundRgb,
      surfaceMixTarget,
      0.06
    );

  const surfaceHoverRgb =
    mixCustomizeColor(
      backgroundRgb,
      surfaceMixTarget,
      0.12
    );

  const borderRgb =
    mixCustomizeColor(
      backgroundRgb,
      surfaceMixTarget,
      0.18
    );

  const textMutedRgb =
    mixCustomizeColor(
      textRgb,
      backgroundRgb,
      0.45
    );


  return {
    "--theme-bg": backgroundHex,
    "--theme-surface": toCustomizeHexColor(surfaceRgb),
    "--theme-surface-hover": toCustomizeHexColor(surfaceHoverRgb),
    "--theme-text": toCustomizeHexColor(textRgb),
    "--theme-text-muted": toCustomizeHexColor(textMutedRgb),
    "--theme-accent": pointHex,
    "--theme-border": toCustomizeHexColor(borderRgb)
  };

}
