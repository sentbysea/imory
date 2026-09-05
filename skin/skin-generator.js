/* =========================================================
   SKIN GENERATOR (deterministic v1)

   AI_SKIN_PHASE1B_DESIGN.md 7-3절. Questionnaire 답변(3문항)을
   AI 없이 SkinPackage로 바꾸는 순수 함수 하나만 담는다 —
   DOM/Supabase를 전혀 건드리지 않는다(RPC 호출/검증은
   skin/skin-initializer.js의 몫).

   출력 shape는 skin/test-skins/static-test-skin.json과 동일한
   계약을 따른다(schemaVersion/html/css/imageSlots/regions/
   metadata) — html의 data-imory-* 바인딩 문법은
   skin/skin-context.js가 만드는 context shape
   (site/profile/navigation/home/banners/images)를 그대로 겨냥한다.

   html에는 인라인 style 속성을 절대 쓰지 않는다 — skin/
   skin-sanitize.js의 SKIN_SANITIZE_DENY_ATTRS가 style을 전량
   제거하므로(저장/렌더 양쪽에서), 레이아웃 분기는 전부 클래스
   이름으로만 표현하고 실제 grid-column 값은 css에 클래스
   규칙으로 넣는다.

   classic script — window.generateInitialSkin으로 노출된다.
   의존 없음(순수 문자열 조립).
========================================================== */

const SKIN_GENERATOR_DENSITY = "balanced";

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
   HTML 섹션 조각 — data-imory-bind/repeat/if/href/src는 전부
   skin/skin-context.js가 만드는 context shape을 그대로 가리킨다
   (skin/skin-render.js의 resolveSkinPath 참고).
========================================================== */

const SKIN_GENERATOR_HEADER_HTML =
  `<header class="skin-home-header"><h1 class="skin-home-title" data-imory-bind="site.title"></h1></header>`;

const SKIN_GENERATOR_PROFILE_HTML =
  `<section class="skin-profile">` +
  `<img class="skin-profile-avatar" data-imory-src="images.profile" alt="profile">` +
  `<p class="skin-profile-nickname" data-imory-bind="profile.nickname"></p>` +
  `<p class="skin-profile-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>` +
  `</section>`;

const SKIN_GENERATOR_INTRO_HTML =
  `<section class="skin-intro">` +
  `<p class="skin-intro-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>` +
  `</section>`;

const SKIN_GENERATOR_NAV_HTML =
  `<nav class="skin-nav">` +
  `<ul class="skin-nav-list">` +
  `<li class="skin-nav-item" data-imory-repeat="navigation.categories">` +
  `<a data-imory-href="item.href" data-imory-bind="item.name"></a>` +
  `</li>` +
  `</ul>` +
  `</nav>`;

const SKIN_GENERATOR_POSTS_HTML =
  `<section class="skin-posts">` +
  `<h2 class="skin-posts-title">Recent Posts</h2>` +
  `<ul class="skin-posts-list">` +
  `<li class="skin-posts-item" data-imory-repeat="home.recentPosts">` +
  `<a data-imory-href="item.href" data-imory-bind="item.title"></a>` +
  `</li>` +
  `</ul>` +
  `</section>`;


/* =========================================================
   homeStyle별 섹션 순서 — 3(homeStyle) x 3(layout) 조합을 전부
   하드코딩하지 않고, "섹션 문자열 + 순서 배열 + 컬럼 수 기반
   CSS 규칙"의 조합으로 구현한다(7-3절). nav/posts는 세
   homeStyle 전부에서 항상 함께 그리드에 들어가므로(intro/profile은
   그 앞에 전체 폭 섹션이 하나 더 붙을 뿐), grid-column span은
   homeStyle과 무관하게 컬럼 수만으로 결정된다 — buildSkinGeneratorCss
   참고.
========================================================== */

const SKIN_GENERATOR_HOME_STYLE_SECTIONS = {

  intro: [
    { key: "intro", html: SKIN_GENERATOR_INTRO_HTML, fullWidth: true },
    { key: "nav", html: SKIN_GENERATOR_NAV_HTML, fullWidth: false },
    { key: "posts", html: SKIN_GENERATOR_POSTS_HTML, fullWidth: false }
  ],

  index: [
    { key: "nav", html: SKIN_GENERATOR_NAV_HTML, fullWidth: false },
    { key: "posts", html: SKIN_GENERATOR_POSTS_HTML, fullWidth: false }
  ],

  profile: [
    { key: "profile", html: SKIN_GENERATOR_PROFILE_HTML, fullWidth: true },
    { key: "nav", html: SKIN_GENERATOR_NAV_HTML, fullWidth: false },
    { key: "posts", html: SKIN_GENERATOR_POSTS_HTML, fullWidth: false }
  ]

};


function buildSkinGeneratorHtml(homeStyle, columnCount) {

  const sections =
    SKIN_GENERATOR_HOME_STYLE_SECTIONS[homeStyle] ||
    SKIN_GENERATOR_HOME_STYLE_SECTIONS.index;


  const bodyHtml =
    sections
      .map(
        (section) =>
          section.html
      )
      .join("");


  return (
    `<div class="skin-home skin-home--${homeStyle}">` +
    SKIN_GENERATOR_HEADER_HTML +
    `<div class="skin-home-grid skin-home-grid--cols-${columnCount}">` +
    bodyHtml +
    `</div>` +
    `</div>`
  );

}


function buildSkinGeneratorCss(baseAppearance, columnCount) {

  const tokens =
    SKIN_GENERATOR_APPEARANCE_TOKENS[baseAppearance] ||
    SKIN_GENERATOR_APPEARANCE_TOKENS.light;


  /*
    nav은 항상 1칸, 나머지 칸은 posts가 전부 가져간다 — 컬럼이
    1개뿐이면 grid-template-columns가 1fr 하나뿐이라 span 값과
    무관하게 그냥 세로로 쌓인다(1단 레이아웃).
  */

  const navSpan =
    1;

  const postsSpan =
    Math.max(
      1,
      columnCount - navSpan
    );


  return (
    `.skin-home {` +
    `background: ${tokens.bg};` +
    `color: ${tokens.text};` +
    `font-family: system-ui, sans-serif;` +
    `max-width: 960px;` +
    `margin: 0 auto;` +
    `padding: 32px 20px;` +
    `}` +

    `.skin-home-header { margin: 0 0 24px; }` +
    `.skin-home-title { margin: 0; font-size: 22px; font-weight: 600; }` +

    `.skin-home-grid {` +
    `display: grid;` +
    `gap: 24px;` +
    `align-items: start;` +
    `grid-template-columns: repeat(${columnCount}, 1fr);` +
    `}` +

    `.skin-home-grid--cols-${columnCount} .skin-nav { grid-column: span ${navSpan}; }` +
    `.skin-home-grid--cols-${columnCount} .skin-posts { grid-column: span ${postsSpan}; }` +

    `.skin-profile, .skin-intro {` +
    `grid-column: 1 / -1;` +
    `padding: 20px;` +
    `border-radius: 12px;` +
    `background: ${tokens.surface};` +
    `border: 1px solid ${tokens.border};` +
    `}` +

    `.skin-profile-avatar {` +
    `width: 72px; height: 72px; border-radius: 50%;` +
    `object-fit: cover; display: block; margin: 0 0 12px;` +
    `}` +

    `.skin-profile-nickname { margin: 0 0 6px; font-weight: 600; }` +
    `.skin-profile-bio, .skin-intro-bio { margin: 0; color: ${tokens.muted}; line-height: 1.6; }` +

    `.skin-nav-list, .skin-posts-list { list-style: none; margin: 0; padding: 0; }` +
    `.skin-nav-item, .skin-posts-item { margin: 0 0 8px; }` +

    `.skin-nav a, .skin-posts a {` +
    `color: ${tokens.text};` +
    `text-decoration: none;` +
    `}` +

    `.skin-nav a:hover, .skin-posts a:hover { color: ${tokens.accent}; }` +

    `.skin-posts-title { margin: 0 0 12px; font-size: 15px; color: ${tokens.muted}; }` +

    `@media (max-width: 640px) {` +
    `.skin-home-grid { grid-template-columns: 1fr; }` +
    `.skin-home-grid .skin-nav, .skin-home-grid .skin-posts { grid-column: 1 / -1; }` +
    `}`
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
   (AI_SKIN_PHASE1B_DESIGN.md 7-2절 자료구조 그대로)
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

    html:
      buildSkinGeneratorHtml(
        homeStyle,
        columnCount
      ),

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
      layoutPreference,
      baseAppearance,
      homeStyle,
      density: SKIN_GENERATOR_DENSITY
    }

  };

}


if (typeof window !== "undefined") {

  window.generateInitialSkin =
    generateInitialSkin;

}
