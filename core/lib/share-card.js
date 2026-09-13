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
========================================================== */


/* X large image card 비율 1.91:1 */

export const SHARE_CARD_WIDTH =
  1200;

export const SHARE_CARD_HEIGHT =
  628;


/* =========================================================
   X UI 데드존

   카드 왼쪽 아래에는 X 가 자기 UI(재생 표시 · 도메인 칩 · 링크
   바)를 얹는 경우가 있다. 그래서 **바닥 100px 안에는 글자를 두지
   않는다** — 제목/메타/도메인의 가장 아래 기준선이 바닥에서
   100px 위(y = 528)이고, 실제 글자 덩어리는 y = 350~525 사이에
   들어간다.

   좌우 여백은 64px(요구 최소 48px보다 넉넉하게).
========================================================== */

export const SHARE_CARD_BOTTOM_SAFE_ZONE =
  100;

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


export const SHARE_CARD_OVERLAY_KEYS =
  ["black", "white"];


export const SHARE_CARD_DEFAULT_SETTINGS =
  {
    overlay: "black",
    overlayStrength: 55,
    font: "pretendard",
    imageUrl: "",
    version: "0"
  };


/* =========================================================
   설정 정규화

   site_settings.key = 'share_card' 한 칸에 JSON 문자열로 저장된다
   (구조화된 값 하나 — 새 테이블도 새 컬럼도 만들지 않는다).

     {
       "image_url": "https://.../user-share-cards/<uid>/<uuid>",
       "overlay": "black" | "white",
       "overlay_strength": 0..100,
       "font": "pretendard" | "nanum-myeongjo",
       "version": "1757800000000"
     }

   저장된 값이 없거나 깨졌거나 모르는 값이면 기본값으로 되돌린다 —
   카드가 안 나오는 것보다 기본 모양으로라도 나오는 것이 낫다.
   version 은 저장할 때만 바뀌는 숫자 문자열이고, OG 이미지 주소의
   ?v= 에 섞여 SNS 캐시를 갱신하는 데 쓰인다.
========================================================== */

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


  const strength =
    Number(source.overlay_strength);


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


  return {

    overlay:
      SHARE_CARD_OVERLAY_KEYS.includes(source.overlay)
        ? source.overlay
        : SHARE_CARD_DEFAULT_SETTINGS.overlay,

    overlayStrength:
      Number.isFinite(strength)
        ? Math.min(100, Math.max(0, Math.round(strength)))
        : SHARE_CARD_DEFAULT_SETTINGS.overlayStrength,

    font:
      SHARE_CARD_FONT_KEYS.includes(source.font)
        ? source.font
        : SHARE_CARD_DEFAULT_SETTINGS.font,

    imageUrl:
      typeof source.image_url === "string"
        ? source.image_url.trim()
        : "",

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
      overlay: card.overlay,
      overlay_strength: card.overlayStrength,
      font: card.font,
      image_url: card.imageUrl,
      version: card.version
    });


  return JSON.stringify({

    image_url:
      normalized.imageUrl,

    overlay:
      normalized.overlay,

    overlay_strength:
      normalized.overlayStrength,

    font:
      normalized.font,

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
  우상단 라벨. 표시 번호를 따로 저장하는 구조가 없으므로 **글 id**를
  그대로 쓴다 — 이미 주소(/:slug/post/:id)에 드러나 있는 값이고,
  글을 지우거나 옮겨도 달라지지 않는다(카드가 예측 가능해야 한다).
  세 자리로 채워서 `POST 014` 모양을 만든다.
*/

export function shareCardPostLabel(
  postId
) {

  const digits =
    String(postId === null || postId === undefined ? "" : postId)
      .replace(/[^0-9]/g, "");


  if (!digits) {

    return "POST";

  }


  return `POST ${digits.padStart(3, "0")}`;

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
   카드 HTML 한 장

   fields:
     card            normalizeShareCardSettings() 결과
     backgroundUrl   배경 사진(글 대표 → 기본 카드 사진 → 빈 값)
     title           글 제목(공개 글일 때만 실제 제목이 온다)
     categoryName    카테고리 이름
     slug            주인장 slug (@slug)
     postLabel       'POST 014'
     domain          우측 아래 도메인 글자

   배경이 빈 값이면 서비스 기본 그라데이션이 깔린다.
========================================================== */

export function buildShareCardHtml(
  fields
) {

  const card =
    normalizeShareCardSettings({
      overlay: fields.card && fields.card.overlay,
      overlay_strength: fields.card && fields.card.overlayStrength,
      font: fields.card && fields.card.font,
      image_url: fields.card && fields.card.imageUrl,
      version: fields.card && fields.card.version
    });


  const title =
    collapseShareCardText(fields.title) ||
    "제목 없는 글";

  const categoryName =
    collapseShareCardText(fields.categoryName);

  const slug =
    collapseShareCardText(fields.slug);

  const postLabel =
    collapseShareCardText(fields.postLabel) ||
    "POST";

  const domain =
    collapseShareCardText(fields.domain) ||
    "imory.me";


  const backgroundUrl =
    typeof fields.backgroundUrl === "string"
      ? fields.backgroundUrl.trim()
      : "";


  const meta =
    [
      slug ? `@${slug}` : "",
      categoryName
    ]
      .filter(Boolean)
      .join(" · ");


  return `<!DOCTYPE html>
<html lang="ko" data-overlay="${escapeShareCardHtml(card.overlay)}" data-font="${escapeShareCardHtml(card.font)}" style="--share-card-alpha:${(card.overlayStrength / 100).toFixed(3)}">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${escapeShareCardHtml(SHARE_CARD_FONTS["pretendard"].stylesheet)}">
<link rel="stylesheet" href="${escapeShareCardHtml(SHARE_CARD_FONTS["nanum-myeongjo"].stylesheet)}">
<style>
${shareCardCss()}
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

  <div class="share-card-label" id="shareCardLabel">${escapeShareCardHtml(postLabel)}</div>

  <div class="share-card-block">

    <div class="share-card-category" id="shareCardCategory">${escapeShareCardHtml(categoryName)}</div>

    <h1 class="share-card-title" id="shareCardTitle">${escapeShareCardHtml(title)}</h1>

    <div class="share-card-meta" id="shareCardMeta">${escapeShareCardHtml(meta)}</div>

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
   같은 자리(바닥에서 103px 위)에 있다.
========================================================== */

function shareCardCss() {

  return `
:root {
  --share-card-alpha: 0.55;
}

html[data-overlay="black"] {
  --share-card-rgb: 0, 0, 0;
  --share-card-title: #ffffff;
  --share-card-sub: rgba(255, 255, 255, 0.86);
  --share-card-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
}

/* WHITE 는 짙은 회색이다 — 순검정은 쓰지 않는다
   (core/design-tokens.css 의 --imory-gray-800 / -700 값). */

html[data-overlay="white"] {
  --share-card-rgb: 255, 255, 255;
  --share-card-title: #333333;
  --share-card-sub: #555555;
  --share-card-shadow: 0 1px 12px rgba(255, 255, 255, 0.65);
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

  background-position: center;
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

  font-size: 20px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.22em;

  color: var(--share-card-sub);

  text-shadow: var(--share-card-shadow);
}

/* =========================================================
   글자 덩어리 — 바닥에서 103px 위에서 끝난다

     y 355 카테고리 라벨
     y 383 제목(최대 2줄 · 110.4px)
     y 503 @slug · 카테고리
     y 525 덩어리 끝
     y 528~628 아무 글자도 없는 안전영역

   글자 크기와 line-height 를 모두 못박아 둔 이유: 브라우저 기본
   line-height(normal)는 폰트마다 다르고, 그러면 이 좌표가 폰트
   선택에 따라 흔들린다. 데드존은 흔들려선 안 되는 값이다.
========================================================== */

.share-card-block {
  position: absolute;
  left: ${SHARE_CARD_SIDE_PADDING}px;
  bottom: 103px;

  width: 760px;
}

.share-card-category {
  margin: 0 0 8px;

  font-size: 18px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.2em;

  color: var(--share-card-sub);

  text-shadow: var(--share-card-shadow);

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.share-card-category:empty {
  display: none;
}

.share-card-title {
  margin: 0;

  font-size: 46px;
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

  max-height: 110.4px;

  /* 한글은 단어 안에서 끊지 않는다(긴 URL 같은 것만 강제로 끊음) */
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.share-card-meta {
  margin: 10px 0 0;

  font-size: 20px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.02em;

  color: var(--share-card-sub);

  text-shadow: var(--share-card-shadow);

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.share-card-domain {
  position: absolute;
  right: ${SHARE_CARD_SIDE_PADDING}px;
  bottom: 103px;

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
   미리보기 전용 — 값이 바뀔 때 문서를 다시 만들지 않는다

   설정 화면은 슬라이더를 끌 때마다 iframe 을 다시 로드하지 않고
   이 문서에 postMessage 를 보낸다(깜빡임 없음 · 배경 사진 재요청
   없음). 서버 렌더에는 메시지가 오지 않으므로 이 스크립트는 아무
   일도 하지 않는다 — 그래도 **같은 문서**를 쓰기 위해 항상 넣는다.

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
    var text = payload.text || {};

    if (card.overlay) { root.setAttribute("data-overlay", card.overlay); }
    if (card.font) { root.setAttribute("data-font", card.font); }

    if (typeof card.overlayStrength === "number") {
      root.style.setProperty(
        "--share-card-alpha",
        (Math.min(100, Math.max(0, card.overlayStrength)) / 100).toFixed(3)
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
    if ("categoryName" in text) { setText("shareCardCategory", text.categoryName); }
    if ("meta" in text) { setText("shareCardMeta", text.meta); }
    if ("postLabel" in text) { setText("shareCardLabel", text.postLabel); }
    if ("domain" in text) { setText("shareCardDomain", text.domain); }

  });

})();
`;

}
