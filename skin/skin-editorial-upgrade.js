/* =========================================================
   이미 만들어진 아이모리 기본 스킨을 올려 주기 (EDITORIAL-EXISTING-UPGRADE-1)

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md §22

   ★ 무엇이 문제였나

   EDITORIAL-CUSTOMIZATION-1(37dee90)이 더한 두 가지는 **스킨의 구조**
   에 들어 있다 — Studio 의 코드가 아니라 그 스킨의 HTML · CSS ·
   imageSlots 에.

     카테고리 줄의 글자 크기   `.ied-nav-list` 가 크기를 갖고
                               `.ied-nav-link` 는 `1em` 으로 물려받는다
     HOME 제목 로고            `title_logo` 이미지 슬롯 + 제목 자리의
                               로고/글자 두 갈래

   그래서 **그 배포 뒤에 새로 만든 스킨**에만 기능이 있고, 이미
   만들어 둔 스킨(TEST1)에는 칸이 잠긴 채로 남는다. 전체 JSON 을 다시
   Import 하면 사진 · 색 · D-day · 단 구성 · 직접 편집이 전부 날아간다.

   ★ 무엇을 하는가

   지금 draft 가 **확실히** 아이모리 기본 스킨일 때만, 모자란 구조
   두 가지를 그 자리에 채워 넣는다. templates 를 갈아끼우지 않는다 —
   글자 하나를 고르듯 필요한 곳만 고친다.

     1) `.ied-nav-link` 의 글자 크기를 `.ied-nav-list` 로 옮기고
        링크는 `1em` 으로 바꾼다. **지금 크기를 그대로 옮긴다** —
        화면은 한 픽셀도 바뀌지 않는다.
     2) `title_logo` 슬롯을 선언하고, HOME 제목 자리에 로고 갈래를
        세우고, 그 두 갈래를 가르는 CSS 를 넣는다. 슬롯이 비어 있는
        동안에는 지금까지와 똑같이 글자 제목이 보인다.

   ★ 무엇을 넣을지는 여기서 짓지 않는다

   `createImoryEditorialDefaultSkin()` 이 만든 **오늘의 기본 스킨**에서
   그 조각을 떼어 쓴다(skin/skin-default-editorial.js). 같은 문자열을
   두 곳에 적어 두면 한쪽만 고쳐지는 날이 온다.

   ★ 판정 (임의의 사용자 스킨에는 절대 적용하지 않는다)

   metadata.generatedBy 가 아이모리 기본 스킨이고, HOME 이 그 스킨의
   뼈대(`ied-sheet ied-home` · `ied-mast` · `ied-nav-list`)를 그대로
   갖고 있고, CSS 에 그 스킨의 색 변수 선언이 있어야 한다. 하나라도
   어긋나면 "고칠 수 없다"로 끝난다 — 짐작해서 남의 스킨을 건드리지
   않는다.

   ★ 두 번 해도 같다

   각 단계는 "이미 있는가"를 먼저 묻는다. 슬롯 · 마크업 · CSS 가
   이미 있으면 그 단계는 없는 것이 되고, 단계가 하나도 남지 않으면
   applicable 은 false 다(= 버튼이 사라진다).

   ★ 되돌리기

   적용은 Studio 의 Import 와 같은 한 걸음이다
   (applyImportedSkinPackage) — working draft 하나가 통째로 바뀌는
   기록 한 칸이라 상단 ↶ 한 번으로 그대로 돌아온다. DB 에는 손대지
   않는다.

   의존(호출 시점): skin/skin-default-editorial.js
   (createImoryEditorialDefaultSkin).
========================================================== */


/* 이 라운드가 채워 넣는 단계들 — 화면에 그대로 나오는 이름이다 */
const IMORY_EDITORIAL_UPGRADE_STEPS = [
  { key: "navFontSize", name: "카테고리 줄 글자 크기" },
  { key: "titleLogo", name: "HOME 제목 로고" }
];


function imoryEditorialDefaultFactory() {

  const factory =
    typeof globalThis !== "undefined"
      ? globalThis.createImoryEditorialDefaultSkin
      : null;

  return typeof factory === "function" ? factory : null;

}


function imoryEditorialDefaultId() {

  const id =
    typeof globalThis !== "undefined"
      ? globalThis.IMORY_EDITORIAL_DEFAULT_ID
      : null;

  return typeof id === "string" && id ? id : "imory-editorial-default-v2";

}


/* =========================================================
   CSS 규칙 하나 — 선택자 다음의 `{ … }` 한 덩어리

   이 스킨의 규칙에는 중첩 괄호가 없다(미디어 쿼리 안의 규칙은
   여기서 찾지 않는다). 선택자 뒤에 공백 하나와 `{` 를 함께 찾으므로
   `.ied-nav-link` 와 `.ied-nav-link:hover` 가 섞이지 않는다.
========================================================== */

function imoryEditorialCssRule(css, selector) {

  const text =
    String(css || "");

  const needle =
    `${selector} {`;

  let at =
    text.indexOf(`\n${needle}`);

  if (at === -1) {
    at = text.indexOf(needle) === 0 ? 0 : -1;
  } else {
    at += 1;
  }

  if (at === -1) {
    return null;
  }

  const open =
    text.indexOf("{", at);

  const close =
    text.indexOf("}", open);

  if (open === -1 || close === -1) {
    return null;
  }

  return {
    start: at,
    open,
    close,
    body: text.slice(open + 1, close)
  };

}


function imoryEditorialReadDeclaration(body, property) {

  const match =
    new RegExp(`(^|;|\\n)\\s*${property}\\s*:([^;}]*)`, "i").exec(String(body || ""));

  return match ? match[2].trim() : "";

}


function imoryEditorialWriteRuleBody(css, selector, body) {

  const rule =
    imoryEditorialCssRule(css, selector);

  if (!rule) {
    return css;
  }

  return css.slice(0, rule.open + 1) + body + css.slice(rule.close);

}


/* =========================================================
   이 draft 가 아이모리 기본 스킨인가

   세 가지가 모두 맞아야 한다. 하나라도 어긋나면 손대지 않는다.
========================================================== */

const IMORY_EDITORIAL_HOME_MARKS = [
  'class="ied ied-page--home"',
  "ied-sheet ied-home",
  "ied-mast",
  "ied-nav-list"
];


function imoryEditorialHomeHtmlOf(skin) {

  const home =
    skin && skin.templates && skin.templates.home;

  return home && typeof home.html === "string" ? home.html : "";

}


function isImoryEditorialDefaultSkin(skin) {

  if (!skin || typeof skin !== "object") {
    return false;
  }

  const generatedBy =
    skin.metadata && skin.metadata.generatedBy;

  if (generatedBy !== imoryEditorialDefaultId()) {
    return false;
  }

  const html =
    imoryEditorialHomeHtmlOf(skin);

  if (!IMORY_EDITORIAL_HOME_MARKS.every((mark) => html.indexOf(mark) !== -1)) {
    return false;
  }

  const css =
    String(skin.css || "");

  return (
    css.indexOf("--ied-bg: var(--imory-color-background") !== -1 &&
    !!imoryEditorialCssRule(css, ".ied-nav-list") &&
    !!imoryEditorialCssRule(css, ".ied-nav-link")
  );

}


/* =========================================================
   1) 카테고리 줄이 글자 크기를 갖는다

   ★ 지금 크기를 그대로 옮긴다. 링크에 `font-size: 13px` 이 적혀
     있었다면 줄이 13px 을 받고 링크가 `1em` 이 된다 — 계산된 크기가
     같으므로 화면은 그대로다. 크기가 아예 없던(있을 수 없지만)
     경우에만 오늘의 기본값을 쓴다.
========================================================== */

function imoryEditorialNavStepNeeded(css) {

  const list =
    imoryEditorialCssRule(css, ".ied-nav-list");

  const link =
    imoryEditorialCssRule(css, ".ied-nav-link");

  if (!list || !link) {
    return false;
  }

  return (
    !imoryEditorialReadDeclaration(list.body, "font-size") ||
    imoryEditorialReadDeclaration(link.body, "font-size") !== "1em"
  );

}


function imoryEditorialApplyNavStep(css, freshCss) {

  const list =
    imoryEditorialCssRule(css, ".ied-nav-list");

  const link =
    imoryEditorialCssRule(css, ".ied-nav-link");

  if (!list || !link) {
    return css;
  }

  const freshList =
    imoryEditorialCssRule(freshCss, ".ied-nav-list");

  const carried =
    imoryEditorialReadDeclaration(link.body, "font-size") ||
    (freshList ? imoryEditorialReadDeclaration(freshList.body, "font-size") : "") ||
    "11.5px";

  /* 링크 — 있던 크기를 1em 으로. 없었으면 한 줄 더한다. */
  const nextLinkBody =
    imoryEditorialReadDeclaration(link.body, "font-size")
      ? link.body.replace(/(^|;|\n)(\s*)font-size\s*:[^;}]*/i, "$1$2font-size: 1em")
      : `${link.body.replace(/\s+$/, "")}\n  font-size: 1em;\n`;

  let next =
    imoryEditorialWriteRuleBody(css, ".ied-nav-link", nextLinkBody);

  /* 줄 — 크기가 없을 때만 넣는다. 자리는 `column-gap` 바로 앞이다
     (오늘의 기본 스킨과 같은 자리). */
  const listAfter =
    imoryEditorialCssRule(next, ".ied-nav-list");

  if (listAfter && !imoryEditorialReadDeclaration(listAfter.body, "font-size")) {

    const line =
      `  font-size: ${carried};\n`;

    const nextListBody =
      /\n(\s*)column-gap\s*:/.test(listAfter.body)
        ? listAfter.body.replace(/\n(\s*)column-gap\s*:/, `\n${line}$1column-gap:`)
        : `${listAfter.body.replace(/\s+$/, "")}\n${line}`;

    next =
      imoryEditorialWriteRuleBody(next, ".ied-nav-list", nextListBody);

  }

  return next;

}


/* =========================================================
   2) HOME 제목 로고

   HTML — 제목 자리의 `<h1 class="ied-title" …>` 앞에 로고 갈래를
   세우고, 원래 제목에는 `ied-title--text` 를 더한다. 원래 h1 의
   속성은 한 글자도 건드리지 않는다(직접 편집 식별자 포함).

   CSS — 오늘의 기본 스킨에서 로고 절을 통째로 떼어 `.ied-title--small`
   바로 뒤에 넣는다. 자리를 못 찾으면 맨 뒤에 붙인다.

   슬롯 — 오늘의 기본 스킨이 선언한 `title_logo` 그대로.
========================================================== */

const IMORY_EDITORIAL_TITLE_PATTERN =
  /<h1 class="ied-title"((?:[^>]*\s)?data-imory-bind="site\.title"[^>]*)><\/h1>/;


function imoryEditorialLogoHtml(freshHtml) {

  const start =
    freshHtml.indexOf('<h1 class="ied-title ied-title--logo"');

  const end =
    freshHtml.indexOf('<h1 class="ied-title ied-title--text"');

  return (start !== -1 && end > start) ? freshHtml.slice(start, end) : "";

}


function imoryEditorialLogoCss(freshCss) {

  const start =
    freshCss.indexOf("/* ── HOME 제목 로고");

  if (start === -1) {
    return "";
  }

  const end =
    freshCss.indexOf("\n.ied-sub {", start);

  return end > start ? freshCss.slice(start, end).replace(/\s+$/, "") : "";

}


function imoryEditorialLogoStepNeeded(skin) {

  return imoryEditorialHomeHtmlOf(skin).indexOf("images.title_logo") === -1;

}


function imoryEditorialInsertLogoCss(css, block) {

  if (!block || css.indexOf(".ied-title--logo") !== -1) {
    return css;
  }

  const anchor =
    imoryEditorialCssRule(css, ".ied-title--small");

  if (!anchor) {
    return `${css.replace(/\s+$/, "")}\n\n${block}\n`;
  }

  return (
    css.slice(0, anchor.close + 1) +
    `\n\n${block}` +
    css.slice(anchor.close + 1)
  );

}


/* =========================================================
   describeImoryEditorialUpgrade(skin) — 지금 draft 를 보고
   "무엇을 채울 수 있는가"를 답한다. 화면(Layout 패널)은 이 결과만
   보고 그린다.

     isEditorial  아이모리 기본 스킨인가
     upToDate     기본 스킨인데 채울 것이 없다
     applicable   채울 것이 있다(= 버튼을 보여 준다)
     steps        채울 단계들(이름)
     upgraded     적용했을 때의 SkinPackage(없으면 null)
     reason       applicable 이 아닐 때의 한 줄
========================================================== */

function describeImoryEditorialUpgrade(skin) {

  const none = (reason) =>
    ({ isEditorial: false, upToDate: false, applicable: false, steps: [], upgraded: null, reason });

  if (!skin || typeof skin !== "object") {
    return none("편집 중인 스킨이 없어요.");
  }

  if (!isImoryEditorialDefaultSkin(skin)) {
    return none("이 스킨은 아이모리 기본 스킨이 아니라서 여기서 올려 줄 수 없어요.");
  }

  const factory =
    imoryEditorialDefaultFactory();

  if (!factory) {
    return {
      ...none("이 배포에서는 스킨 업데이트를 쓸 수 없어요."),
      isEditorial: true
    };
  }

  const fresh =
    factory();

  const freshCss =
    String(fresh.css || "");

  const freshHtml =
    imoryEditorialHomeHtmlOf(fresh);

  const logoHtml =
    imoryEditorialLogoHtml(freshHtml);

  const logoCss =
    imoryEditorialLogoCss(freshCss);

  const logoSlot =
    (Array.isArray(fresh.imageSlots) ? fresh.imageSlots : [])
      .find((slot) => slot && slot.name === "title_logo") || null;

  const html =
    imoryEditorialHomeHtmlOf(skin);

  const css =
    String(skin.css || "");

  const steps = [];

  if (imoryEditorialNavStepNeeded(css)) {
    steps.push("navFontSize");
  }

  const logoNeeded =
    imoryEditorialLogoStepNeeded(skin);

  /* 넣을 조각이 없거나 제목 자리를 못 찾으면 그 단계는 없는 것으로
     둔다 — 반쯤 고친 스킨을 만들지 않는다. */
  const logoReady =
    !!logoHtml && !!logoCss && !!logoSlot && IMORY_EDITORIAL_TITLE_PATTERN.test(html);

  if (logoNeeded && logoReady) {
    steps.push("titleLogo");
  }

  if (!steps.length) {

    return {
      isEditorial: true,
      upToDate: !logoNeeded,
      applicable: false,
      steps: [],
      upgraded: null,
      reason: logoNeeded
        ? "이 스킨의 HOME 제목 자리를 찾지 못해 로고 기능을 넣을 수 없어요. AI 나 Code 로 고칠 수 있어요."
        : "이 스킨에는 최신 기능이 이미 들어 있어요."
    };

  }

  let nextCss =
    css;

  let nextHtml =
    html;

  let nextSlots =
    Array.isArray(skin.imageSlots) ? skin.imageSlots.slice() : [];

  if (steps.indexOf("navFontSize") !== -1) {
    nextCss = imoryEditorialApplyNavStep(nextCss, freshCss);
  }

  if (steps.indexOf("titleLogo") !== -1) {

    nextHtml =
      nextHtml.replace(
        IMORY_EDITORIAL_TITLE_PATTERN,
        (whole, attrs) => `${logoHtml}<h1 class="ied-title ied-title--text"${attrs}></h1>`
      );

    nextCss =
      imoryEditorialInsertLogoCss(nextCss, logoCss);

    if (!nextSlots.some((slot) => slot && slot.name === "title_logo")) {
      nextSlots = nextSlots.concat([{ ...logoSlot }]);
    }

  }

  /* templates 를 갈아끼우지 않는다 — HOME 의 html 한 칸만 바뀌고
     category · post 와 regions · metadata · renderMode · js 는
     들어온 그대로 나간다. */
  const upgraded = {
    ...skin,
    templates: {
      ...skin.templates,
      home: { ...skin.templates.home, html: nextHtml }
    },
    css: nextCss,
    imageSlots: nextSlots
  };

  return {
    isEditorial: true,
    upToDate: false,
    applicable: true,
    steps: steps.map((key) => IMORY_EDITORIAL_UPGRADE_STEPS.find((step) => step.key === key)),
    upgraded,
    reason: ""
  };

}


if (typeof window !== "undefined") {
  window.IMORY_EDITORIAL_UPGRADE_STEPS = IMORY_EDITORIAL_UPGRADE_STEPS;
  window.isImoryEditorialDefaultSkin = isImoryEditorialDefaultSkin;
  window.describeImoryEditorialUpgrade = describeImoryEditorialUpgrade;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    IMORY_EDITORIAL_UPGRADE_STEPS,
    isImoryEditorialDefaultSkin,
    describeImoryEditorialUpgrade
  };
}
