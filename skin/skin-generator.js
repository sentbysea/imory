/* =========================================================
   SKIN GENERATOR (deterministic v1, multipage)

   AI_SKIN_PHASE1B_DESIGN.md 7-3절 / AI_SKIN_PHASE1C_PAGE_CONTRACT.md
   Slice 1C-H. Questionnaire 답변(3문항)을 AI 없이 완성된 멀티페이지
   SkinPackage(HOME/CATEGORY/POST)로 바꾸는 순수 함수 하나만
   담는다 — DOM/Supabase를 전혀 건드리지 않는다(RPC 호출/검증은
   skin/skin-initializer.js의 몫).

   출력 shape의 canonical source는 templates.home/category/post다
   (skin/test-skins/static-test-post-skin.json이 이미 이 shape의
   선례다) — top-level html은 더 이상 만들지 않는다.
   skin/skin-template.js의 resolveSkinTemplate()이 templates.*를
   최우선으로 읽으므로, HOME/CATEGORY/POST 공개 라우트와 Studio
   Preview 양쪽 다 별도 배선 없이 즉시 이 결과를 소비한다.

   html에는 인라인 style 속성을 절대 쓰지 않는다 — skin/
   skin-sanitize.js의 SKIN_SANITIZE_DENY_ATTRS가 style을 전량
   제거하므로(저장/렌더 양쪽에서), 레이아웃 분기는 전부 클래스
   이름 + CSS 커스텀 프로퍼티(--skin-*)로만 표현한다.

   세 template은 하나의 공유 css만 쓴다(페이지별 css 없음 —
   skin-package-normalize.js/skin-template.js가 이미 이 v0.1
   원칙을 전제한다). 세 template이 정확히 같은 .skin-shell/
   .skin-block--meta|nav|main 클래스 체계를 공유하므로, 이 하나의
   css가 자연스럽게 "하나의 Skin처럼 보이는" 공통 디자인 언어를
   만든다.

   classic script — window.generateInitialSkin으로 노출된다.
   의존 없음(순수 문자열 조립).
========================================================== */

const SKIN_GENERATOR_APPEARANCE_TOKENS = {

  light: {
    bg: "#ffffff",
    surface: "#f7f7f8",
    text: "#1a1a1a",
    muted: "#6b6b6b",
    border: "#e5e5e5",
    accent: "#5c7cfa"
  },

  dark: {
    bg: "#15161a",
    surface: "#1e1f24",
    text: "#eaeaea",
    muted: "#9a9a9a",
    border: "#2a2b30",
    accent: "#7c9cfa"
  }

};

const SKIN_GENERATOR_COLUMN_COUNT = {
  "one-column": 1,
  "two-column": 2,
  "three-column": 3
};


/* =========================================================
   공유 HTML 조각 — data-imory-bind/repeat/if/href/src는 전부
   skin/skin-context.js가 만드는 context shape(page/home/category/
   post/navigation/site/profile/images)을 그대로 가리킨다
   (skin-render.js의 resolveSkinPath 참고). nav 조각은 HOME/
   CATEGORY/POST 세 template과 세 homeStyle 전부에서 글자 하나
   다르지 않게 재사용된다 — 레이아웃별 배치(가로/세로)는 오직
   createLayoutCss()가 결정한다(9절 "레이아웃별 navigation 배치
   차이"가 CSS 하나로 구현되는 이유).
========================================================== */

const SKIN_GENERATOR_HEADER_HTML =
  `<header class="skin-header"><h1 class="skin-header-title" data-imory-bind="site.title"></h1></header>`;

const SKIN_GENERATOR_NAV_HTML =
  `<nav class="skin-block skin-block--nav skin-nav">` +
  `<ul class="skin-nav-list">` +
  `<li class="skin-nav-item" data-imory-repeat="navigation.categories">` +
  `<a class="skin-nav-link" data-imory-href="item.href" data-imory-bind="item.name"></a>` +
  `</li>` +
  `</ul>` +
  `</nav>`;


/* ---- HOME 전용 meta/main 조각 ---- */

const SKIN_GENERATOR_HOME_INTRO_HTML =
  `<section class="skin-block skin-block--meta skin-intro">` +
  `<p class="skin-intro-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>` +
  `</section>`;

const SKIN_GENERATOR_HOME_PROFILE_HTML =
  `<section class="skin-block skin-block--meta skin-profile">` +
  `<img class="skin-profile-avatar" data-imory-src="images.profile" alt="profile">` +
  `<p class="skin-profile-nickname" data-imory-bind="profile.nickname"></p>` +
  `<p class="skin-profile-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>` +
  `</section>`;

const SKIN_GENERATOR_HOME_MAIN_HTML =
  `<section class="skin-block skin-block--main skin-posts">` +
  `<h2 class="skin-posts-title">Recent Posts</h2>` +
  `<ul class="skin-posts-list">` +
  `<li class="skin-posts-item" data-imory-repeat="home.recentPosts">` +
  `<a data-imory-href="item.href" data-imory-bind="item.title"></a>` +
  `</li>` +
  `</ul>` +
  `</section>`;


/* ---- CATEGORY 전용 meta/main 조각 ---- */

const SKIN_GENERATOR_CATEGORY_META_HTML =
  `<header class="skin-block skin-block--meta skin-category-meta">` +
  `<h2 class="skin-category-title" data-imory-bind="category.name"></h2>` +
  `</header>`;

const SKIN_GENERATOR_CATEGORY_MAIN_HTML =
  `<section class="skin-block skin-block--main skin-category-list">` +
  `<ul class="skin-category-posts-list">` +
  `<li class="skin-category-posts-item" data-imory-repeat="category.posts">` +
  `<a class="skin-category-posts-link" data-imory-href="item.href" data-imory-bind="item.title"></a>` +
  `<time class="skin-category-posts-date" data-imory-bind="item.publishedAt"></time>` +
  `</li>` +
  `</ul>` +
  `</section>`;


/* ---- POST 전용 meta/main 조각 ----

   본문(post-body)은 data-imory-region으로만 "자리"를 표시한다 —
   data-imory-bind로 직접 노출하지 않는다(AI_SKIN_PHASE1C_PAGE_
   CONTRACT.md 7절 Protected Post-Body Contract). skin-render.js의
   applySkinRegion()이 mount 시점에 이 안의 어떤 placeholder도
   항상 비우므로, 여기 들어있는 안내 문구는 실제로는 화면에
   남지 않는다(skin/test-skins/static-test-post-skin.json과 동일
   패턴). */

const SKIN_GENERATOR_POST_META_HTML =
  `<header class="skin-block skin-block--meta skin-post-meta">` +
  `<a class="skin-post-category-link" data-imory-if="post.categoryName" data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a>` +
  `<time class="skin-post-date" data-imory-bind="post.publishedAt"></time>` +
  `</header>`;

const SKIN_GENERATOR_POST_MAIN_HTML =
  `<article class="skin-block skin-block--main skin-post">` +
  `<h1 class="skin-post-title" data-imory-bind="post.title"></h1>` +
  `<div class="skin-post-body-slot" data-imory-region="post-body">` +
  `<p class="skin-authored-placeholder">본문이 여기 표시됩니다</p>` +
  `</div>` +
  `</article>`;


/* =========================================================
   homeStyle별 meta 조각 선택 + 페이지 wrapper

   3(homeStyle) x 3(layoutPreference) 조합을 전부 하드코딩하지
   않는다 — homeStyle은 오직 "meta 블록이 있는지, 있다면 무엇인지"
   만 결정하고(7-3절), nav/main은 세 homeStyle 전부에서 동일하다.
   레이아웃(1/2/3단)에 따른 배치는 wrapSkinShell()이 붙이는
   `skin-shell--cols-N` 클래스 하나로 createLayoutCss()가 전담한다.
========================================================== */

function selectSkinGeneratorHomeMetaHtml(homeStyle) {

  if (homeStyle === "intro") {
    return SKIN_GENERATOR_HOME_INTRO_HTML;
  }

  if (homeStyle === "profile") {
    return SKIN_GENERATOR_HOME_PROFILE_HTML;
  }

  return "";

}


/*
  hasMeta는 createLayoutCss()가 cols=2에서 auto-placement 없이
  meta 유무에 따라 nav/main의 grid-row를 명시적으로 고정하기 위한
  마커 클래스(skin-shell--has-meta)를 결정한다 — grid 배치를
  브라우저의 자동 배치 알고리즘에 맡기지 않는다(아래 createLayoutCss
  주석 참고).
*/
function wrapSkinShell(pageType, columnCount, hasMeta, bodyHtml) {

  const metaModifierClass =
    hasMeta ? " skin-shell--has-meta" : "";

  return (
    `<div class="skin-shell skin-shell--${pageType} skin-shell--cols-${columnCount}${metaModifierClass}">` +
    SKIN_GENERATOR_HEADER_HTML +
    `<div class="skin-shell-grid">` +
    bodyHtml +
    `</div>` +
    `</div>`
  );

}


function createHomeTemplate(homeStyle, columnCount) {

  const metaHtml =
    selectSkinGeneratorHomeMetaHtml(homeStyle);

  const bodyHtml =
    metaHtml +
    SKIN_GENERATOR_NAV_HTML +
    SKIN_GENERATOR_HOME_MAIN_HTML;

  return {
    html: wrapSkinShell("home", columnCount, metaHtml !== "", bodyHtml)
  };

}


function createCategoryTemplate(columnCount) {

  const bodyHtml =
    SKIN_GENERATOR_CATEGORY_META_HTML +
    SKIN_GENERATOR_NAV_HTML +
    SKIN_GENERATOR_CATEGORY_MAIN_HTML;

  return {
    html: wrapSkinShell("category", columnCount, true, bodyHtml)
  };

}


function createPostTemplate(columnCount) {

  const bodyHtml =
    SKIN_GENERATOR_POST_META_HTML +
    SKIN_GENERATOR_NAV_HTML +
    SKIN_GENERATOR_POST_MAIN_HTML;

  return {
    html: wrapSkinShell("post", columnCount, true, bodyHtml)
  };

}


/* =========================================================
   CSS — appearance 변수 + 공통 컴포넌트 규칙 + 레이아웃 배치.
   세 template 전부가 공유하는 단 하나의 css 문자열을 만든다
   (skin-package-normalize.js: v0.1은 페이지별 css를 두지 않는다).
========================================================== */

function createAppearanceVariables(baseAppearance) {

  const tokens =
    SKIN_GENERATOR_APPEARANCE_TOKENS[baseAppearance] ||
    SKIN_GENERATOR_APPEARANCE_TOKENS.light;

  return (
    `.skin-shell {` +
    `--skin-bg: ${tokens.bg};` +
    `--skin-surface: ${tokens.surface};` +
    `--skin-text: ${tokens.text};` +
    `--skin-muted: ${tokens.muted};` +
    `--skin-border: ${tokens.border};` +
    `--skin-accent: ${tokens.accent};` +
    `}`
  );

}


function createSkinGeneratorBaseCss() {

  return (
    `.skin-shell {` +
    `background: var(--skin-bg);` +
    `color: var(--skin-text);` +
    `font-family: system-ui, sans-serif;` +
    `max-width: 960px;` +
    `margin: 0 auto;` +
    `padding: 32px 20px;` +
    `}` +

    `.skin-header { margin: 0 0 24px; }` +
    `.skin-header-title { margin: 0; font-size: 22px; font-weight: 600; }` +

    `.skin-block--meta {` +
    `padding: 20px;` +
    `border-radius: 12px;` +
    `background: var(--skin-surface);` +
    `border: 1px solid var(--skin-border);` +
    `}` +

    `.skin-profile-avatar {` +
    `width: 72px; height: 72px; border-radius: 50%;` +
    `object-fit: cover; display: block; margin: 0 0 12px;` +
    `}` +

    `.skin-profile-nickname { margin: 0 0 6px; font-weight: 600; }` +
    `.skin-profile-bio, .skin-intro-bio { margin: 0; color: var(--skin-muted); line-height: 1.6; }` +

    `.skin-nav-list { list-style: none; margin: 0; padding: 0; }` +
    `.skin-nav-item { margin: 0 0 8px; }` +

    `.skin-nav-link, .skin-posts-list a, .skin-category-posts-link, .skin-post-category-link {` +
    `color: var(--skin-text);` +
    `text-decoration: none;` +
    `}` +

    `.skin-nav-link:hover, .skin-posts-list a:hover, .skin-category-posts-link:hover, .skin-post-category-link:hover {` +
    `color: var(--skin-accent);` +
    `}` +

    `.skin-posts-list, .skin-category-posts-list { list-style: none; margin: 0; padding: 0; }` +
    `.skin-posts-item, .skin-category-posts-item { margin: 0 0 8px; }` +
    `.skin-posts-title { margin: 0 0 12px; font-size: 15px; color: var(--skin-muted); }` +

    `.skin-category-title { margin: 0; font-size: 20px; font-weight: 600; }` +
    `.skin-category-posts-date { display: block; font-size: 12px; color: var(--skin-muted); }` +

    `.skin-post-meta { display: flex; align-items: center; gap: 12px; }` +
    `.skin-post-date { font-size: 12px; color: var(--skin-muted); }` +
    `.skin-post-title { margin: 0 0 16px; font-size: 24px; }` +
    `.skin-post-body-slot {` +
    `margin-top: 8px;` +
    `padding: 12px 0 0;` +
    `border-top: 1px solid var(--skin-border);` +
    `}`
  );

}


function createLayoutCss(columnCount) {

  if (columnCount === 1) {

    return (
      `.skin-shell-grid { display: grid; gap: 24px; grid-template-columns: 1fr; }` +
      `.skin-shell--cols-1 .skin-nav-list { display: flex; flex-direction: row; flex-wrap: wrap; gap: 16px; }` +
      `.skin-shell--cols-1 .skin-nav-item { margin: 0; }`
    );

  }

  if (columnCount === 2) {

    /*
      grid-template-columns/rows를 명시적으로 2x2로 고정하고,
      meta/nav/main 세 블록 각각의 grid-column *과* grid-row를
      전부 명시한다 — 브라우저의 grid auto-placement 알고리즘에
      기대지 않는다(meta가 있을 때 없을 때 두 경우를
      `skin-shell--has-meta` 마커 클래스로 명확히 분기).

      meta 있음(HOME intro/profile, CATEGORY, POST):
        row1: meta(1/-1)
        row2: nav(1) | main(2)

      meta 없음(HOME index):
        row1: nav(1) | main(2)
    */

    return (
      `.skin-shell-grid { display: grid; gap: 24px; align-items: start; grid-template-columns: 200px 1fr; grid-template-rows: auto auto; }` +

      `.skin-shell--has-meta .skin-block--meta { grid-column: 1 / -1; grid-row: 1; }` +
      `.skin-shell--has-meta .skin-block--nav { grid-column: 1; grid-row: 2; }` +
      `.skin-shell--has-meta .skin-block--main { grid-column: 2; grid-row: 2; }` +

      `.skin-shell:not(.skin-shell--has-meta) .skin-block--nav { grid-column: 1; grid-row: 1; }` +
      `.skin-shell:not(.skin-shell--has-meta) .skin-block--main { grid-column: 2; grid-row: 1; }` +

      `@media (max-width: 640px) {` +
      `.skin-shell-grid { grid-template-columns: 1fr; grid-template-rows: none; }` +
      `.skin-block--meta, .skin-block--nav, .skin-block--main { grid-column: 1; grid-row: auto; }` +
      `}`
    );

  }

  /*
    3단: DOM 순서(meta -> nav -> main, wrapSkinShell()이 항상 이
    순서로 마크업을 쓴다)와 시각적 순서(meta | main | nav)가
    의도적으로 다르다 — CSS Grid의 명시적 grid-column 배치만으로
    시각적 좌우 순서를 바꾸고, DOM 자체는 절대 재정렬하지 않는다.
    이유: 키보드 tab 순서/스크린 리더 낭독 순서는 DOM 순서를
    따라야 자연스럽다(meta 다음 nav, 그 다음 main) — "PROFILE |
    CONTENT | NAV"라는 시각적 배치 요구가 접근성 순서까지 바꿔야
    할 이유는 없다. grid-row는 단일 행이라 값이 전부 1로 동일하지만
    "auto-placement에 기대지 않는다"는 원칙을 cols=2와 동일하게
    지키기 위해 명시적으로 적는다.
  */

  return (
    `.skin-shell-grid { display: grid; gap: 24px; align-items: start; grid-template-columns: 1fr 2fr 1fr; grid-template-rows: auto; }` +
    `.skin-block--meta { grid-column: 1; grid-row: 1; }` +
    `.skin-block--main { grid-column: 2; grid-row: 1; }` +
    `.skin-block--nav { grid-column: 3; grid-row: 1; }` +
    `@media (max-width: 640px) {` +
    `.skin-shell-grid { grid-template-columns: 1fr; }` +
    `.skin-block--meta, .skin-block--main, .skin-block--nav { grid-column: 1; grid-row: auto; }` +
    `}`
  );

}


function buildSkinGeneratorCss(baseAppearance, columnCount) {

  return (
    createAppearanceVariables(baseAppearance) +
    createSkinGeneratorBaseCss() +
    createLayoutCss(columnCount)
  );

}


function buildSkinGeneratorImageSlots(homeStyle) {

  const imageSlots =
    [
      {
        name: "profile",
        label: "프로필 사진",
        required: false,
        aspectRatioHint: "1:1"
      }
    ];


  if (homeStyle === "profile") {

    imageSlots.push(
      {
        name: "header",
        label: "상단 배경 이미지",
        required: false,
        aspectRatioHint: "16:9"
      }
    );

  }


  return imageSlots;

}


/* =========================================================
   generateInitialSkin(answers) -> SkinPackage

   answers = { layoutPreference, baseAppearance, homeStyle }
   (AI_SKIN_PHASE1B_DESIGN.md 7-2절 자료구조 그대로, 문항 추가 없음)

   반환값은 templates.home/category/post 셋을 항상 전부 채운
   멀티페이지 SkinPackage다 — Questionnaire 완료 직후부터 Studio
   Preview 안에서 HOME→CATEGORY→POST가 추가 수동 작업 없이 바로
   탐색 가능하다(studio/preview/preview-navigation.js가 이미
   resolveSkinTemplate()로 이 shape을 소비한다, Slice 1C-G).
========================================================== */

function generateInitialSkin(answers) {

  const layoutPreference =
    answers?.layoutPreference ||
    "one-column";

  const baseAppearance =
    answers?.baseAppearance ||
    "light";

  const homeStyle =
    answers?.homeStyle ||
    "index";


  const columnCount =
    SKIN_GENERATOR_COLUMN_COUNT[layoutPreference] ||
    1;


  return {

    schemaVersion: 1,

    templates: {
      home: createHomeTemplate(homeStyle, columnCount),
      category: createCategoryTemplate(columnCount),
      post: createPostTemplate(columnCount)
    },

    css:
      buildSkinGeneratorCss(
        baseAppearance,
        columnCount
      ),

    imageSlots:
      buildSkinGeneratorImageSlots(
        homeStyle
      ),

    regions: [],

    metadata: {
      generatedBy: "deterministic-v1",
      supports: { home: true, list: true, post: true }
    }

  };

}


if (typeof window !== "undefined") {

  window.generateInitialSkin =
    generateInitialSkin;

}
