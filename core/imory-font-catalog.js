/* =========================================================
   IMORY FONT CATALOG — 사용자가 고를 수 있는 글꼴 **한 벌**
   (HOME-CANVAS-TYPOGRAPHY-1)

   기준 문서: docs/contracts/IMORY_FONT_CATALOG_CONTRACT.md

   ── 왜 이 파일이 있나 ───────────────────────────────────
   글꼴 선택지가 두 곳에서 따로 자라고 있었다.

     Quote Preset BODY > FONT   admin/quote/admin-quote-panel.html 에
                                <option> 두 개가 **직접** 적혀 있었고,
                                key -> font-family 변환은 세 파일에
                                같은 삼항식으로 복붙돼 있었다
                                (posts/style/posts-body-layout.js ·
                                 posts/preview/posts-page-layout.js 두 곳)
     Canvas 글자                아예 없었다

   그 둘이 같은 여섯 가지를 쓰려면 목록도 변환도 **한 곳**이어야
   한다. 이 파일이 그 한 곳이다 — 화면은 목록을 다시 적지 않고
   여기서 읽어 <option> 을 만들고, 변환은 아래 resolver 하나를
   지난다.

   ── 무엇이 여기 있고 무엇이 없나 ────────────────────────
   있다:   key · 표시명 · font-family stack · 제공하는 굵기.
   없다:   @font-face · <link> · 어느 화면이 어떤 글꼴을 쓰는가.
           폰트 **파일**을 실제로 가져오는 곳은 core/imory-fonts.css
           한 장뿐이고(§ 아래 "파일은 어디서 오나"), 이 파일은
           그 CSS 가 선언한 이름을 부를 뿐이다.

   ── key 는 저장값이다 ───────────────────────────────────
   `quote_presets.settings.bodyFont` 에 그대로 들어가고, Canvas 쪽은
   key 를 저장하지 않지만(스킨 CSS 에 stack 을 쓴다) 폼이 지금 값을
   되읽을 때 stack -> key 로 되짚는다. 그래서 **key 는 한 번 정하면
   바뀌지 않는다.**

     pretendard      2026-09 이전부터 있던 키 — 기본값이다
     nanummyeongjo   2026-09 이전부터 있던 키 (하이픈 없음)

   위 둘은 이미 DB 에 들어 있는 값이므로 철자를 고치지 않는다.
   share card 의 `font` 설정은 **다른 키 체계**(`nanum-myeongjo`,
   하이픈 있음)를 쓰고 이 카탈로그와 무관하다 — core/lib/share-card.js.

   ── 모르는 키 ───────────────────────────────────────────
   resolveImoryFontStack() 은 모르는 키에 null 을 돌려준다. 값을
   **삭제하거나 기본값으로 덮어쓰지 않는다** — 옛 프리셋의 저장값은
   그대로 남고, 화면에서만 기본 stack 으로 그려진다(기존 호환 정책:
   posts/style/posts-body-layout.js 의 "알 수 없는 필드는 그대로
   들고 다닌다").

   ── 파일은 어디서 오나 ──────────────────────────────────
   core/imory-fonts.css 한 장이다. 그 파일을 읽는 문서가 곧 "이 여섯을
   실제로 그릴 수 있는 문서"이고, 목록은 그 파일 머리말에 있다.

   classic script 다(ES 모듈이 아니다). 노드 단위 테스트를 위해
   module.exports 로도 낸다 — 브라우저에서는 전역 함수/상수가 된다.
========================================================== */


/*
  ★ 순서가 곧 화면의 순서다. Canvas Select 의 [글꼴 ▼] 와 Quote
    Preset 의 BODY > FONT 가 이 배열을 그대로 훑어 <option> 을
    만든다(두 화면에 목록을 다시 적지 않는다).

  weights — 그 글꼴이 **실제로** 갖고 있거나 우리가 제공하는 굵기.
    UI 의 굵기 선택지(기본 · 400 · 500 · 700)와 같은 것이 아니다.
    여기 없는 굵기를 고르면 브라우저가 합성한다(가짜 볼드). 이
    배열이 하는 일은 하나 더 있다 — core/imory-fonts.css 가 Google
    Fonts 에서 **어떤 굵기를 받아 오는가**와 대조되고, 그 대조는
    core/imory-font-catalog-test.mjs 가 한다.
*/
var IMORY_FONT_CATALOG = [

  {
    key: "pretendard",
    label: "Pretendard",
    cssFamily: '"Pretendard", sans-serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    source: "jsdelivr"
  },

  {
    key: "nanumgothic",
    label: "나눔고딕",
    cssFamily: '"Nanum Gothic", sans-serif',
    weights: [400, 700, 800],
    source: "google"
  },

  {
    key: "nanumsquareneo",
    label: "나눔스퀘어네오",
    cssFamily: '"NanumSquareNeo", "Nanum Square Neo", sans-serif',

    /* ★ 400 · 700 뿐이다. 공식 배포의 variable woff2 는 브라우저가
       열지 못하고(OTS 거부 — core/imory-fonts.css 의 그 주석),
       정적 배포에는 500 이 없다. 그래서 UI 에서 "500 중간" 을
       골라도 **이 글꼴만** 400 으로 그려진다. */
    weights: [400, 700],
    source: "self"
  },

  {
    key: "nanummyeongjo",
    label: "나눔명조",
    cssFamily: '"Nanum Myeongjo", serif',
    weights: [400, 700, 800],
    source: "google"
  },

  {
    key: "gowundodum",
    label: "고운돋움",
    cssFamily: '"Gowun Dodum", sans-serif',
    weights: [400],
    source: "google"
  },

  {
    key: "gowunbatang",
    label: "고운바탕",
    cssFamily: '"Gowun Batang", serif',
    weights: [400, 700],
    source: "google"
  }

];


/* 값이 비었거나 모르는 키일 때 **화면이** 쓰는 글꼴. 저장값을 이
   키로 덮어쓰는 것이 아니다(머리말의 "모르는 키"). */
var IMORY_FONT_DEFAULT_KEY = "pretendard";


function imoryFontEntry(key) {

  if (typeof key !== "string" || !key) {
    return null;
  }

  for (var i = 0; i < IMORY_FONT_CATALOG.length; i += 1) {

    if (IMORY_FONT_CATALOG[i].key === key) {
      return IMORY_FONT_CATALOG[i];
    }

  }

  return null;

}


function isImoryFontKey(key) {

  return !!imoryFontEntry(key);

}


/* =========================================================
   resolveImoryFontStack(key) -> stack | null

   모르는 키에 **null** 이다. "모르는 값을 조용히 기본값으로
   바꾸는" 자리를 만들지 않기 위해서다 — 기본값이 필요한 쪽은
   아래 resolveImoryFontFamily() 를 쓰고, 저장값을 판단하는 쪽은
   null 을 보고 스스로 정한다.
========================================================== */

function resolveImoryFontStack(key) {

  var entry =
    imoryFontEntry(key);

  return entry ? entry.cssFamily : null;

}


/* =========================================================
   resolveImoryFontFamily(key) -> stack

   **화면에 그릴 때** 쓰는 길. 비었거나 모르는 키면 기본 stack 을
   돌려준다. Quote 의 세 자리(발행 본문 · 글쓰기 Preview 의 제목 ·
   출처)가 예전에 갖고 있던 삼항식

     resolved.bodyFont === "nanummyeongjo"
       ? '"Nanum Myeongjo", serif'
       : '"Pretendard", sans-serif'

   과 **두 기존 키에서 글자 하나까지 같은 결과**다(그 대조는
   core/imory-font-catalog-test.mjs 가 한다) — 그래서 이미 발행된
   글의 본문 글꼴이 이 라운드로 바뀌지 않는다.
========================================================== */

function resolveImoryFontFamily(key) {

  return (
    resolveImoryFontStack(key) ||
    resolveImoryFontStack(IMORY_FONT_DEFAULT_KEY)
  );

}


/* =========================================================
   imoryFontKeyOfStack(stack) -> key | null

   stack 하나를 카탈로그의 key 로 되짚는다. Canvas 는 key 를
   저장하지 않고 스킨 CSS 에 stack 을 쓰므로(계약 §8 — 시각
   스타일은 CSS 의 몫), 폼이 "지금 이 요소는 무엇으로 되어 있나"를
   물을 때 이 길로 읽는다.

   ★ 공백만 다른 값도 같은 것으로 본다. 사람이 쓴 스킨 CSS 나
     AI 가 만든 CSS 에서 `"Nanum Myeongjo",serif` 처럼 붙여 쓴
     값이 올 수 있고, 그것을 "우리 목록에 없는 글꼴"로 읽으면
     폼이 빈 칸으로 보이면서 다음 저장에서 사용자가 고른 적 없는
     값으로 덮인다.
========================================================== */

function imoryFontNormalizeStack(value) {

  return (
    String(value == null ? "" : value)
      .replace(/\s*,\s*/g, ",")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );

}


function imoryFontKeyOfStack(stack) {

  var wanted =
    imoryFontNormalizeStack(stack);

  if (!wanted) {
    return null;
  }

  for (var i = 0; i < IMORY_FONT_CATALOG.length; i += 1) {

    if (imoryFontNormalizeStack(IMORY_FONT_CATALOG[i].cssFamily) === wanted) {
      return IMORY_FONT_CATALOG[i].key;
    }

  }

  return null;

}


/* =========================================================
   fillImoryFontSelect(select, options)

   <select> 하나를 카탈로그로 채운다. 두 화면이 같은 목록을 같은
   순서로 그리게 하는 자리다.

     options.includeDefault   맨 앞에 "스킨 기본값"(value "") 을 둔다.
                              Canvas 는 켜고(선언을 지우는 길이 필요),
                              Quote 는 끈다(bodyFont 는 늘 값이 있다).
     options.defaultLabel     그 첫 칸의 문구
     options.value            고를 값. 카탈로그에 없는 값이면
                              **그 값을 지우지 않고** 임시 <option>
                              하나를 만들어 고른 채로 둔다 — 옛
                              프리셋을 열었다 저장하기만 해도 모르는
                              키가 사라지는 일을 막는다.
========================================================== */

function fillImoryFontSelect(select, options) {

  if (!select) {
    return;
  }

  var opts =
    options || {};

  select.textContent =
    "";

  if (opts.includeDefault) {

    var blank =
      document.createElement("option");

    blank.value =
      "";

    blank.textContent =
      opts.defaultLabel || "스킨 기본값";

    select.appendChild(blank);

  }

  IMORY_FONT_CATALOG.forEach(function (entry) {

    var option =
      document.createElement("option");

    option.value =
      entry.key;

    option.textContent =
      entry.label;

    select.appendChild(option);

  });

  var value =
    typeof opts.value === "string" ? opts.value : "";

  if (value && !isImoryFontKey(value)) {

    var unknown =
      document.createElement("option");

    unknown.value =
      value;

    unknown.textContent =
      value + " (알 수 없는 글꼴)";

    select.appendChild(unknown);

  }

  select.value =
    value;

}


if (typeof window !== "undefined") {

  window.IMORY_FONT_CATALOG = IMORY_FONT_CATALOG;
  window.IMORY_FONT_DEFAULT_KEY = IMORY_FONT_DEFAULT_KEY;
  window.isImoryFontKey = isImoryFontKey;
  window.resolveImoryFontStack = resolveImoryFontStack;
  window.resolveImoryFontFamily = resolveImoryFontFamily;
  window.imoryFontKeyOfStack = imoryFontKeyOfStack;
  window.fillImoryFontSelect = fillImoryFontSelect;

}


/* node(단위 테스트)에서도 같은 파일을 읽을 수 있게 */
if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    IMORY_FONT_CATALOG: IMORY_FONT_CATALOG,
    IMORY_FONT_DEFAULT_KEY: IMORY_FONT_DEFAULT_KEY,
    isImoryFontKey: isImoryFontKey,
    resolveImoryFontStack: resolveImoryFontStack,
    resolveImoryFontFamily: resolveImoryFontFamily,
    imoryFontKeyOfStack: imoryFontKeyOfStack
  };

}
