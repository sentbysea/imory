/* =========================================================
   SHARE CARD — 글 공유 카드의 **유일한** 레이아웃

   기준 문서: IMORY_SHARE_CARD_DESIGN.md

   X(Twitter)에 공개 글 주소를 붙여 넣었을 때 뜨는
   summary_large_image 카드 한 장(1200 × 628)을 그린다.

   ★ 왜 ES 모듈 하나인가

   이 파일을 읽는 곳이 **둘**이고, 둘이 같은 그림을 내야 한다:

     1) SETTINGS > SHARE > CARD 의 실시간 미리보기
        (admin/settings/admin-share-card.js — 동적 import)
     2) /api/og/post 가 서버에서 실제로 찍는 카드
        (functions/api/og/post.js — 정적 import)

   "미리보기는 비슷한데 실제 카드가 다르다"를 구조적으로 없애려고
   두 곳이 **같은 함수로 같은 HTML 문서 문자열**을 만든다. 미리보기는
   그 문서를 iframe srcdoc 에 넣고, 서버는 그 문서를 헤드리스
   브라우저에 넘겨 스크린샷을 찍는다 — 같은 마크업 · 같은 CSS ·
   같은 웹폰트다.

   그래서 이 파일은 DOM 도 supabase 도 만지지 않는다(순수 문자열
   생성). 브라우저와 Cloudflare Workers 양쪽에서 그대로 돈다.

   ★ 카드 안에 들어가는 글자는 전부 바깥에서 받는다

   비밀글/비공개 글의 제목이 카드에 들어가면 안 되는 판정은 이
   파일의 일이 아니다 — 부르는 쪽(서버 함수)이 공개 글일 때만
   실제 제목을 넣는다. 이 파일은 받은 글자를 이스케이프해서 그릴
   뿐이다.

   ★ 카드 위의 글자는 셋뿐이다

     좌하단  글 제목
     우하단  도메인(imory.me)
     우상단  카드 라벨(사용자 지정 · 없으면 `카테고리 · 001`)

   `@slug`· 카테고리 메타 줄과 제목 위 카테고리 라벨은 없다 —
   X 가 카드 아래에 자기 링크 바로 블로그 제목을 이미 얹기
   때문에 같은 정보가 두 번 보이던 것을 걷어냈다.
========================================================== */


/* X large image card 비율 1.91:1 */

export const SHARE_CARD_WIDTH =
  1200;

export const SHARE_CARD_HEIGHT =
  628;


/* =========================================================
   X UI 데드존

   카드 왼쪽 아래에는 X 가 자기 UI(재생 표시 · 도메인 칩 · 검은
   링크 바)를 얹는다. 그래서 **바닥 100px 안에는 글자를 두지
   않는다**.

   글자 덩어리의 기준선은 바닥에서 115px 위다 — 데드존(100px)을
   넘지 않으면서, 예전처럼 지나치게 위로 띄우지도 않는다
   (요구: 110~120px).

   좌우 여백은 64px(요구 최소 48px보다 넉넉하게).
========================================================== */

export const SHARE_CARD_BOTTOM_SAFE_ZONE =
  100;

export const SHARE_CARD_BASELINE =
  115;

export const SHARE_CARD_SIDE_PADDING =
  64;


/* =========================================================
   폰트

   "현재 서비스에서 안정적으로 제공하는 폰트만" — 이미 제품이
   쓰고 있는 두 벌이다(index.html · admin/index.html 의 <link>와
   같은 주소).

     pretendard      admin/UI 공통 폰트
     nanum-myeongjo  본문 폰트 선택지(quote 프리셋 bodyFont)

   두 스타일시트를 **항상 둘 다** 링크한다. 그래서 폰트를 바꿀 때
   미리보기가 다시 로드되지 않아도 되고, 서버 렌더에서도 스크린샷
   전에 둘 다 로드가 끝난다(고른 쪽이 확실히 준비된다).
========================================================== */

export const SHARE_CARD_FONTS =
  {
    "pretendard": {
      label: "Pretendard",
      stack: "'Pretendard', system-ui, sans-serif",
      stylesheet:
        "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
    },

    "nanum-myeongjo": {
      label: "나눔명조",
      stack: "'Nanum Myeongjo', serif",
      stylesheet:
        "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap"
    }
  };


export const SHARE_CARD_FONT_KEYS =
  ["pretendard", "nanum-myeongjo"];


/* =========================================================
   제목 크기

   카드 레이아웃이 깨지지 않는 범위. 최대(72px)에서도 두 줄
   (72 × 1.2 × 2 = 172.8px)이 라벨(top 40) 아래에 들어간다:

     628 - 115(기준선) - 172.8 = y 340.2 에서 시작한다.
========================================================== */

export const SHARE_CARD_TITLE_SIZE_MIN =
  32;

export const SHARE_CARD_TITLE_SIZE_MAX =
  72;


/* 우상단 라벨 — 한 줄에 들어가야 한다 */

export const SHARE_CARD_LABEL_MAX_LENGTH =
  24;


/* =========================================================
   프레임 — 지금은 none 만 그린다

   나중에 border / polaroid / camera 를 붙일 자리다. 레이아웃
   분기는 **이 파일 한 곳**(shareCardFrameCss)에서만 늘어난다 —
   설정 정규화(normalizeShareCardSettings)와 카드 마크업은 이미
   frame 값을 실어 나르고 있으므로, 새 프레임을 더할 때 화면 코드나
   서버 코드를 고칠 일이 없다.
========================================================== */

export const SHARE_CARD_FRAME_KEYS =
  ["none", "border", "polaroid", "camera"];


/* =========================================================
   오버레이 색

   예전에는 BLACK / WHITE 두 개뿐이었다. 지금은 사용자가 고른
   색(hex)이 들어오고, 그 색의 밝기로 **카드 안 글자색을 자동으로**
   정한다(흰색 / 짙은 회색).
========================================================== */

export const SHARE_CARD_DEFAULT_OVERLAY_COLOR =
  "#000000";


/* 예전 값과의 다리 */

const SHARE_CARD_LEGACY_OVERLAY =
  {
    black: "#000000",
    white: "#ffffff"
  };


export function normalizeShareCardColor(
  value
) {

  const raw =
    String(value === null || value === undefined ? "" : value).trim();


  const short =
    /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);


  if (short) {

    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
      .toLowerCase();

  }


  const long =
    /^#?([0-9a-f]{6})$/i.exec(raw);


  return long
    ? `#${long[1].toLowerCase()}`
    : "";

}


/*
  오버레이 색 하나에서 카드가 쓰는 값 네 개를 만든다.

  밝기 판정은 인지 밝기(0.299 / 0.587 / 0.114)다. 밝은 오버레이
  위에서는 **짙은 회색**을 쓴다 — 순검정은 쓰지 않는다
  (core/design-tokens.css 의 --imory-gray-800 / -700 값).
*/

export function shareCardOverlayPalette(
  value
) {

  const color =
    normalizeShareCardColor(value) ||
    SHARE_CARD_DEFAULT_OVERLAY_COLOR;


  const r =
    parseInt(color.slice(1, 3), 16);

  const g =
    parseInt(color.slice(3, 5), 16);

  const b =
    parseInt(color.slice(5, 7), 16);


  const brightness =
    (r * 0.299 + g * 0.587 + b * 0.114) / 255;


  const isLight =
    brightness > 0.6;


  return {

    color,

    rgb:
      `${r}, ${g}, ${b}`,

    isLight,

    title:
      isLight ? "#333333" : "#ffffff",

    sub:
      isLight ? "#555555" : "rgba(255, 255, 255, 0.86)",

    shadow:
      isLight
        ? "0 1px 12px rgba(255, 255, 255, 0.65)"
        : "0 2px 14px rgba(0, 0, 0, 0.45)"

  };

}


export const SHARE_CARD_DEFAULT_SETTINGS =
  {
    overlayColor: SHARE_CARD_DEFAULT_OVERLAY_COLOR,
    overlayStrength: 55,
    font: "pretendard",
    titleSize: 46,
    imageUrl: "",
    imagePositionX: 50,
    imagePositionY: 50,
    cardLabel: "",
    frame: "none",
    version: "0"
  };


/* =========================================================
   설정 정규화

   site_settings.key = 'share_card' 한 칸에 JSON 문자열로 저장된다
   (구조화된 값 하나 — 새 테이블도 새 컬럼도 만들지 않는다).

     {
       "image_url": "https://.../user-share-cards/<uid>/<uuid>",
       "image_position_x": 50,
       "image_position_y": 50,
       "overlay_color": "#000000",
       "overlay_strength": 55,
       "font": "pretendard" | "nanum-myeongjo",
       "title_size": 46,
       "card_label": "",
       "frame": "none",
       "version": "1757800000000"
     }

   저장된 값이 없거나 깨졌거나 모르는 값이면 기본값으로 되돌린다 —
   카드가 안 나오는 것보다 기본 모양으로라도 나오는 것이 낫다.
   version 은 저장할 때만 바뀌는 숫자 문자열이고, OG 이미지 주소의
   ?v= 에 섞여 SNS 캐시를 갱신하는 데 쓰인다.

   ★ 예전 값: overlay: "black" | "white"

   컬러 피커로 바뀌기 전에 저장된 카드가 이미 있다. overlay_color
   가 없으면 그 두 값을 #000000 / #ffffff 로 옮겨 읽는다 — 예전
   카드가 저장 한 번 없이도 그대로 보인다.
========================================================== */

function clampShareCardNumber(
  value,
  min,
  max,
  fallback
) {

  const number =
    Number(value);


  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.round(number)))
    : fallback;

}


export function normalizeShareCardSettings(
  raw
) {

  let parsed =
    raw;


  if (typeof raw === "string") {

    try {

      parsed =
        JSON.parse(raw);

    }

    catch (err) {

      parsed =
        null;

    }

  }


  const source =
    (parsed && typeof parsed === "object")
      ? parsed
      : {};


  const version =
    (
      typeof source.version === "string" &&
      /^[0-9]{1,20}$/.test(source.version)
    )
      ? source.version
      : (
          Number.isSafeInteger(source.version) && source.version > 0
            ? String(source.version)
            : SHARE_CARD_DEFAULT_SETTINGS.version
        );


  /* 새 값 → 예전 값 → 기본값 */

  const overlayColor =
    normalizeShareCardColor(source.overlay_color) ||
    normalizeShareCardColor(source.overlayColor) ||
    SHARE_CARD_LEGACY_OVERLAY[source.overlay] ||
    normalizeShareCardColor(source.overlay) ||
    SHARE_CARD_DEFAULT_SETTINGS.overlayColor;


  const cardLabel =
    collapseShareCardText(source.card_label)
      .slice(0, SHARE_CARD_LABEL_MAX_LENGTH);


  return {

    overlayColor,

    overlayStrength:
      clampShareCardNumber(
        source.overlay_strength,
        0,
        100,
        SHARE_CARD_DEFAULT_SETTINGS.overlayStrength
      ),

    font:
      SHARE_CARD_FONT_KEYS.includes(source.font)
        ? source.font
        : SHARE_CARD_DEFAULT_SETTINGS.font,

    titleSize:
      clampShareCardNumber(
        source.title_size,
        SHARE_CARD_TITLE_SIZE_MIN,
        SHARE_CARD_TITLE_SIZE_MAX,
        SHARE_CARD_DEFAULT_SETTINGS.titleSize
      ),

    imageUrl:
      typeof source.image_url === "string"
        ? source.image_url.trim()
        : "",

    imagePositionX:
      clampShareCardNumber(
        source.image_position_x,
        0,
        100,
        SHARE_CARD_DEFAULT_SETTINGS.imagePositionX
      ),

    imagePositionY:
      clampShareCardNumber(
        source.image_position_y,
        0,
        100,
        SHARE_CARD_DEFAULT_SETTINGS.imagePositionY
      ),

    cardLabel,

    frame:
      SHARE_CARD_FRAME_KEYS.includes(source.frame)
        ? source.frame
        : SHARE_CARD_DEFAULT_SETTINGS.frame,

    version

  };

}


/* 저장할 모양으로 되돌린다(화면 → site_settings) */

export function serializeShareCardSettings(
  card,
  version
) {

  const normalized =
    normalizeShareCardSettings({
      overlay_color: card.overlayColor,
      overlay_strength: card.overlayStrength,
      font: card.font,
      title_size: card.titleSize,
      image_url: card.imageUrl,
      image_position_x: card.imagePositionX,
      image_position_y: card.imagePositionY,
      card_label: card.cardLabel,
      frame: card.frame,
      version: card.version
    });


  return JSON.stringify({

    image_url:
      normalized.imageUrl,

    image_position_x:
      normalized.imagePositionX,

    image_position_y:
      normalized.imagePositionY,

    overlay_color:
      normalized.overlayColor,

    overlay_strength:
      normalized.overlayStrength,

    font:
      normalized.font,

    title_size:
      normalized.titleSize,

    card_label:
      normalized.cardLabel,

    frame:
      normalized.frame,

    version:
      typeof version === "string" && /^[0-9]{1,20}$/.test(version)
        ? version
        : normalized.version

  });

}


/* =========================================================
   글자 다듬기
========================================================== */

export function escapeShareCardHtml(
  value
) {

  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

}


/*
  카드 위 두 줄짜리 제목에 들어갈 수 없는 글자(줄바꿈·연속 공백)를
  한 칸으로 정리한다. 실제 두 줄 자르기는 CSS(-webkit-line-clamp)가
  한다 — 미리보기와 서버 렌더가 같은 규칙이어야 하므로 글자 수로
  자르지 않는다.
*/

export function collapseShareCardText(
  value
) {

  return String(value === null || value === undefined ? "" : value)
    .replace(/\s+/g, " ")
    .trim();

}


/* =========================================================
   우상단 라벨

   사용자가 CARD LABEL 에 적어 둔 문구가 있으면 **그 문구 그대로**
   (ARCHIVE · SUMMER 2028 · LOG 034). 비워 두면 자동 라벨을 만든다:

     `카테고리 · 001`

   · 이름은 글이 실제로 들어 있는 가장 안쪽 컨테이너다 —
     폴더 안의 글이면 폴더 이름, 아니면 카테고리 이름.
   · 번호는 그 컨테이너 안에서 공개된 글을 created_at 오름차순으로
     센 순번이고, **게시 시점에 posts.share_label_seq 에 굳는다**
     (supabase/migrations/20260913180000_add_posts_share_label_seq.sql).
     그래서 앞 글을 지우거나 비공개로 돌려도 이미 나간 카드의
     번호가 뒤바뀌지 않는다.
   · 사용자 지정 목록 정렬(sort_order)은 쓰지 않는다.

   컨테이너 이름도 번호도 없으면 빈 문자열을 돌려준다 — 그때는
   카드에 라벨을 그리지 않는다.
========================================================== */

export function shareCardSequenceLabel(
  sequence
) {

  const number =
    Number(sequence);


  if (!Number.isFinite(number) || number <= 0) {

    return "";

  }


  return String(Math.floor(number)).padStart(3, "0");

}


export function shareCardAutoLabel(
  containerName,
  sequence
) {

  return [
    collapseShareCardText(containerName),
    shareCardSequenceLabel(sequence)
  ]
    .filter(Boolean)
    .join(" · ");

}


export function resolveShareCardLabel(
  cardLabel,
  containerName,
  sequence
) {

  const custom =
    collapseShareCardText(cardLabel)
      .slice(0, SHARE_CARD_LABEL_MAX_LENGTH);


  return custom ||
    shareCardAutoLabel(containerName, sequence);

}


/* =========================================================
   배경 구도

   기본 카드 사진에는 위치 조정(image_position_x/y)이 있다.
   글 대표 이미지에는 없다 — 그 사진은 글이 스스로 고른 것이고,
   카드 설정과 함께 움직이면 글마다 구도가 어긋난다.

   그래서 "지금 깔린 배경이 기본 카드 사진인가"로 판정한다.
   부르는 쪽(미리보기 · 서버)이 같은 규칙을 쓰도록 이 파일이
   정한다.
========================================================== */

export function shareCardBackgroundPosition(
  card,
  backgroundUrl
) {

  const url =
    typeof backgroundUrl === "string" ? backgroundUrl.trim() : "";


  if (!url || !card.imageUrl || url !== card.imageUrl) {

    return "50% 50%";

  }


  return `${card.imagePositionX}% ${card.imagePositionY}%`;

}


/* =========================================================
   카드 HTML 한 장

   fields:
     card            normalizeShareCardSettings() 결과
     backgroundUrl   배경 사진(글 대표 → 기본 카드 사진 → 빈 값)
     title           글 제목(공개 글일 때만 실제 제목이 온다)
     label           우상단 라벨(resolveShareCardLabel 결과)
     domain          우측 아래 도메인 글자

   배경이 빈 값이면 서비스 기본 그라데이션이 깔린다.
========================================================== */

export function buildShareCardHtml(
  fields
) {

  const card =
    normalizeShareCardSettings({
      overlay_color: fields.card && fields.card.overlayColor,
      overlay_strength: fields.card && fields.card.overlayStrength,
      font: fields.card && fields.card.font,
      title_size: fields.card && fields.card.titleSize,
      image_url: fields.card && fields.card.imageUrl,
      image_position_x: fields.card && fields.card.imagePositionX,
      image_position_y: fields.card && fields.card.imagePositionY,
      card_label: fields.card && fields.card.cardLabel,
      frame: fields.card && fields.card.frame,
      version: fields.card && fields.card.version
    });


  const palette =
    shareCardOverlayPalette(card.overlayColor);


  const title =
    collapseShareCardText(fields.title) ||
    "제목 없는 글";

  const label =
    collapseShareCardText(fields.label);

  const domain =
    collapseShareCardText(fields.domain) ||
    "imory.me";


  const backgroundUrl =
    typeof fields.backgroundUrl === "string"
      ? fields.backgroundUrl.trim()
      : "";


  const backgroundPosition =
    shareCardBackgroundPosition(card, backgroundUrl);


  const rootStyle =
    [
      `--share-card-alpha:${(card.overlayStrength / 100).toFixed(3)}`,
      `--share-card-rgb:${palette.rgb}`,
      `--share-card-title:${palette.title}`,
      `--share-card-sub:${palette.sub}`,
      `--share-card-shadow:${palette.shadow}`,
      `--share-card-title-size:${card.titleSize}px`,
      `--share-card-bg-position:${backgroundPosition}`
    ]
      .join(";");


  return `<!DOCTYPE html>
<html lang="ko" data-overlay="${palette.isLight ? "light" : "dark"}" data-font="${escapeShareCardHtml(card.font)}" data-frame="${escapeShareCardHtml(card.frame)}" style="${escapeShareCardHtml(rootStyle)}">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${escapeShareCardHtml(SHARE_CARD_FONTS["pretendard"].stylesheet)}">
<link rel="stylesheet" href="${escapeShareCardHtml(SHARE_CARD_FONTS["nanum-myeongjo"].stylesheet)}">
<style>
${shareCardCss()}
${shareCardFrameCss()}
</style>
</head>
<body>

<div class="share-card" id="shareCard">

  <div class="share-card-bg" id="shareCardBackground"${
    backgroundUrl
      ? ` style="background-image:url(&quot;${escapeShareCardHtml(backgroundUrl)}&quot;)"`
      : ""
  }></div>

  <div class="share-card-scrim"></div>

  <div class="share-card-frame" id="shareCardFrame"></div>

  <div class="share-card-label" id="shareCardLabel">${escapeShareCardHtml(label)}</div>

  <div class="share-card-block">

    <h1 class="share-card-title" id="shareCardTitle">${escapeShareCardHtml(title)}</h1>

  </div>

  <div class="share-card-domain" id="shareCardDomain">${escapeShareCardHtml(domain)}</div>

</div>

<script>
${shareCardLiveScript()}
</script>

</body>
</html>`;

}


/* =========================================================
   CSS — 1200 × 628 고정 좌표

   반응형이 없다. 이 문서는 언제나 1200 × 628 캔버스이고, 화면에
   작게 보여야 할 때는 **부모가 transform: scale()** 로 줄인다
   (admin/settings/admin-share-card.js). 그래서 미리보기를 줄여도
   레이아웃이 재계산되지 않는다 — 서버가 찍는 그림과 글자 배치가
   달라질 여지를 만들지 않기 위해서다.

   사진 구도에 따라 글자가 움직이지 않는다. 제목 덩어리는 항상
   같은 자리(바닥에서 115px 위)에 있다.
========================================================== */

function shareCardCss() {

  return `
:root {
  --share-card-alpha: 0.55;
  --share-card-rgb: 0, 0, 0;
  --share-card-title: #ffffff;
  --share-card-sub: rgba(255, 255, 255, 0.86);
  --share-card-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
  --share-card-title-size: 46px;
  --share-card-bg-position: 50% 50%;
}

html[data-font="pretendard"] {
  --share-card-font: ${SHARE_CARD_FONTS["pretendard"].stack};
}

html[data-font="nanum-myeongjo"] {
  --share-card-font: ${SHARE_CARD_FONTS["nanum-myeongjo"].stack};
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;

  background: #ffffff;
}

.share-card {
  position: relative;

  width: ${SHARE_CARD_WIDTH}px;
  height: ${SHARE_CARD_HEIGHT}px;

  overflow: hidden;

  font-family: var(--share-card-font);

  /* 배경 사진이 없을 때의 서비스 기본 바탕 */
  background:
    linear-gradient(
      135deg,
      #f6d7e2 0%,
      #efe3f2 38%,
      #d9e8f4 72%,
      #cfe7ea 100%
    );
}

.share-card-bg {
  position: absolute;
  inset: 0;

  background-position: var(--share-card-bg-position);
  background-repeat: no-repeat;
  background-size: cover;
}

.share-card-scrim {
  position: absolute;
  inset: 0;

  background:
    linear-gradient(
      to top,
      rgba(var(--share-card-rgb), calc(var(--share-card-alpha) * 0.92)) 0%,
      rgba(var(--share-card-rgb), calc(var(--share-card-alpha) * 0.84)) 26%,
      rgba(var(--share-card-rgb), calc(var(--share-card-alpha) * 0.42)) 58%,
      rgba(var(--share-card-rgb), 0) 86%
    ),
    linear-gradient(
      to bottom,
      rgba(var(--share-card-rgb), calc(var(--share-card-alpha) * 0.38)) 0%,
      rgba(var(--share-card-rgb), 0) 32%
    );
}

.share-card-label {
  position: absolute;
  top: 40px;
  right: ${SHARE_CARD_SIDE_PADDING}px;

  max-width: 520px;

  font-size: 20px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.22em;

  color: var(--share-card-sub);

  text-shadow: var(--share-card-shadow);

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 라벨이 비면 아무것도 그리지 않는다 */

.share-card-label:empty {
  display: none;
}

/* =========================================================
   글자 덩어리 — 바닥에서 115px 위에서 끝난다

     y 348 제목 시작(기본 46px · 두 줄일 때)
     y 513 덩어리 끝
     y 528~628 아무 글자도 없는 안전영역(X 검은 링크 바)

   글자 크기와 line-height 를 모두 못박아 둔 이유: 브라우저 기본
   line-height(normal)는 폰트마다 다르고, 그러면 이 좌표가 폰트
   선택에 따라 흔들린다. 데드존은 흔들려선 안 되는 값이다.

   제목 크기는 사용자 설정이지만 line-height 배수(1.2)와 두 줄
   제한은 고정이다 — 그래서 어떤 크기에서도 덩어리의 바닥은
   같은 자리다.
========================================================== */

.share-card-block {
  position: absolute;
  left: ${SHARE_CARD_SIDE_PADDING}px;
  bottom: ${SHARE_CARD_BASELINE}px;

  width: 860px;

  max-width: calc(100% - ${SHARE_CARD_SIDE_PADDING * 2}px - 200px);
}

.share-card-title {
  margin: 0;

  font-size: var(--share-card-title-size);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;

  color: var(--share-card-title);

  text-shadow: var(--share-card-shadow);

  /* 정확히 두 줄 — 넘치면 … 로 끝난다 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;

  max-height: calc(var(--share-card-title-size) * 2.4);

  /* 한글은 단어 안에서 끊지 않는다(긴 URL 같은 것만 강제로 끊음) */
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.share-card-domain {
  position: absolute;
  right: ${SHARE_CARD_SIDE_PADDING}px;
  bottom: ${SHARE_CARD_BASELINE}px;

  font-size: 22px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.16em;

  color: var(--share-card-sub);

  text-shadow: var(--share-card-shadow);
}
`;

}


/* =========================================================
   프레임 — 나중에 늘어날 자리

   지금은 `none` 뿐이라 아무것도 그리지 않는다. 새 프레임이
   생기면 여기에 `html[data-frame="border"] .share-card-frame { ... }`
   식으로 한 벌씩 더한다. 프레임이 글자 자리를 바꿔야 하면 같은
   블록에서 .share-card-block / .share-card-domain 의 좌표를
   함께 밀어 준다 — 좌표를 아는 곳이 이 파일 하나로 유지된다.
========================================================== */

function shareCardFrameCss() {

  return `
.share-card-frame {
  position: absolute;
  inset: 0;

  pointer-events: none;
}

/* none — 프레임 없음(기본) */

html[data-frame="none"] .share-card-frame {
  display: none;
}
`;

}


/* =========================================================
   미리보기 전용 — 값이 바뀔 때 문서를 다시 만들지 않는다

   설정 화면은 슬라이더를 끌 때마다 iframe 을 다시 로드하지 않고
   이 문서에 postMessage 를 보낸다(깜빡임 없음 · 배경 사진 재요청
   없음). 서버 렌더에는 메시지가 오지 않으므로 이 스크립트는 아무
   일도 하지 않는다 — 그래도 **같은 문서**를 쓰기 위해 항상 넣는다.

   ★ 색 계산을 여기서 하지 않는다

   오버레이 색 → 글자색/그림자 판정은 shareCardOverlayPalette()
   한 곳에만 있다. 부모가 그 함수를 부르고 결과(palette)를 그대로
   보낸다 — 같은 규칙이 두 군데에 적히는 것을 막는다.

   srcdoc iframe 은 부모와 같은 origin 이다. 그래도 우리가 정한
   type 이 아닌 메시지는 무시한다.
========================================================== */

function shareCardLiveScript() {

  return `
(function () {

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) { node.textContent = value == null ? "" : String(value); }
  }

  window.addEventListener("message", function (event) {

    var payload = event && event.data;

    if (!payload || payload.type !== "imory-share-card") { return; }

    var root = document.documentElement;
    var card = payload.card || {};
    var palette = payload.palette || null;
    var text = payload.text || {};

    if (card.font) { root.setAttribute("data-font", card.font); }
    if (card.frame) { root.setAttribute("data-frame", card.frame); }

    if (palette) {
      root.setAttribute("data-overlay", palette.isLight ? "light" : "dark");
      root.style.setProperty("--share-card-rgb", palette.rgb);
      root.style.setProperty("--share-card-title", palette.title);
      root.style.setProperty("--share-card-sub", palette.sub);
      root.style.setProperty("--share-card-shadow", palette.shadow);
    }

    if (typeof card.overlayStrength === "number") {
      root.style.setProperty(
        "--share-card-alpha",
        (Math.min(100, Math.max(0, card.overlayStrength)) / 100).toFixed(3)
      );
    }

    if (typeof card.titleSize === "number") {
      root.style.setProperty(
        "--share-card-title-size",
        Math.round(card.titleSize) + "px"
      );
    }

    if (typeof payload.backgroundPosition === "string") {
      root.style.setProperty(
        "--share-card-bg-position",
        payload.backgroundPosition
      );
    }

    if ("backgroundUrl" in payload) {
      var background = document.getElementById("shareCardBackground");
      if (background) {
        background.style.backgroundImage =
          payload.backgroundUrl
            ? 'url("' + String(payload.backgroundUrl).replace(/"/g, "%22") + '")'
            : "";
      }
    }

    if ("title" in text) { setText("shareCardTitle", text.title); }
    if ("label" in text) { setText("shareCardLabel", text.label); }
    if ("domain" in text) { setText("shareCardDomain", text.domain); }

  });

})();
`;

}
