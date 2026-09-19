/* =========================================================
   IMORY EDITORIAL — 아이모리 기본 스킨 (EDITORIAL-DEFAULT-SKIN-2)

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md

   가입한 사람이 곧바로 글을 백업할 수 있고, 나중에 자기 사진 · 색 ·
   좌우 영역으로 꾸밀 수 있는 공용 뼈대. 특정 작품의 문구를 박아 넣지
   않고 편집 디자인의 문법만 쓴다 — 거의 흰 바탕 · 작은 가운데 제목 ·
   좁은 가운데 칼럼 · 얇은 테두리와 hairline · 알약이 아닌 글자 링크.

   이 파일은 SkinPackage 를 **만드는 함수**다(DOM · Supabase 를 건드리지
   않는다). 쓰는 곳:
     - skin/skin-initializer.js  Studio 첫 스킨(가입 뒤 처음 여는 Studio)
     - skin/test-skins/build-imory-editorial-default-v2.mjs
                                 Import 할 수 있는 JSON 으로 내보내기
     - 테스트(node 는 module.exports 로 읽는다)

   ── 설정과 디자인 ────────────────────────────────────────
   주인이 고르는 값은 전부 SkinPackage.regions 에 있고(skin/skin-settings.js
   · skin/skin-sides.js), 이 HTML/CSS 는 그 값을 읽기만 한다.

     1·2·3단            left_sidebar / right_sidebar  → data-imory-sides*
     모바일 패널         *_sidebar.mobile
     색 네 역할          theme_colors                   → var(--imory-color-*, 기본값)
     HOME 사진 구성      home_photos                    → data-imory-photos*
     D-day              dday                           → settings.dday.*

   ── 사진 ───────────────────────────────────────────────
   전부 이미지 슬롯이다(photo_1 ~ photo_4, pair_photo). CSS 배경으로
   숨기지 않는다 — 이미지 바꾸기 · 자르기 · 확대 · 위치 · Save ·
   Export/Import 가 여느 슬롯과 같다. 사진이 하나도 없으면 사진 자리
   대신 글자와 선만으로 된 빈 표지가 선다(깨진 이미지 · 회색 상자 없음).

   ── 스크롤 ───────────────────────────────────────────────
   내용이 적으면 한 화면에 들어오는 표지이고, 많거나 화면이 낮으면
   그냥 세로로 스크롤한다. 높이를 vh 로 정하는 곳은 전부 px 상한이 있는
   clamp() 안이다 — sandbox 프레임에서 vh 는 "프레임 높이"라서 상한이
   없으면 프레임과 내용이 서로를 키운다.

   classic script — window.createImoryEditorialDefaultSkin 으로 낸다.
========================================================== */

const IMORY_EDITORIAL_DEFAULT_ID = "imory-editorial-default-v2";

/* 기본색 — CSS 의 var() 기본값과 같은 값이다(테스트가 대조한다) */
const IMORY_EDITORIAL_PALETTES = {
  light: {
    background: "#ffffff",
    text: "#1b2340",
    accent: "#1f3a78",
    accent2: "#8796b0"
  },
  dark: {
    background: "#11141c",
    text: "#e8ecf5",
    accent: "#b3c3ea",
    accent2: "#5f6d88"
  }
};

/* 사람이 바꿔 쓰는 짧은 문구 — Studio 에서 글자를 두 번 눌러 고친다 */
const IMORY_EDITORIAL_TEXT = {
  captionKo: "오래 두고 다시 읽을 이야기들.",
  captionEn: "a quiet record, kept page by page.",
  emptyHead: "Begin the first page.",
  emptyNoteA: "quietly kept,",
  emptyNoteB: "one page at a time.",
  words: ["prologue", "chapter", "epilogue", "appendix"],
  sideWordsA: "prologue.",
  sideWordsB: "chapter.",
  sideWordsC: "epilogue.",
  sideQuoteLeft: "every page, kept.",
  sideQuoteRight: "a personal archive."
};


/* =========================================================
   조각
========================================================== */

function imoryEditorialNav(currentHome) {

  return (
    '<nav class="ied-nav" aria-label="카테고리">' +
      '<ul class="ied-nav-list">' +
        `<li class="ied-nav-item${currentHome ? " ied-nav-item--current" : ""}">` +
          `<a class="ied-nav-link" data-imory-href="navigation.home.href"${currentHome ? ' aria-current="page"' : ""}>Home</a>` +
        '</li>' +
        '<li class="ied-nav-item" data-imory-repeat="navigation.categories">' +
          '<a class="ied-nav-link" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
        '</li>' +
        '<li class="ied-nav-item" data-imory-if="navigation.highlights.showStandaloneLink">' +
          '<a class="ied-nav-link" data-imory-href="navigation.highlights.href" data-imory-bind="navigation.highlights.name"></a>' +
        '</li>' +
      '</ul>' +
    '</nav>'
  );

}


function imoryEditorialTop(number, pageHtml, withOpeners) {

  return (
    '<header class="ied-top">' +
      (withOpeners
        ? '<span class="ied-open ied-open--left" data-imory-sides-open="left" aria-label="프로필 열기"><span class="ied-icon-ring" aria-hidden="true"></span></span>'
        : "") +
      `<p class="ied-top-mark" aria-hidden="true"><span class="ied-top-no">${number}</span></p>` +
      pageHtml +
      (withOpeners
        ? '<span class="ied-open ied-open--right" data-imory-sides-open="right" aria-label="메뉴 열기"><span class="ied-icon-lines" aria-hidden="true"></span></span>'
        : "") +
    '</header>'
  );

}


const IMORY_EDITORIAL_STAR = '<span class="ied-star" aria-hidden="true"></span>';

const IMORY_EDITORIAL_RULE_STAR =
  `<p class="ied-rule-star" aria-hidden="true">${IMORY_EDITORIAL_STAR}</p>`;


function imoryEditorialFoot() {

  return (
    '<footer class="ied-foot">' +
      '<p class="ied-foot-line"><span class="ied-foot-text" data-imory-bind="site.title"></span></p>' +
      IMORY_EDITORIAL_STAR +
    '</footer>'
  );

}


function imoryEditorialOwner(withManage) {

  return (
    '<p class="ied-owner" data-imory-if="viewer.isOwner">' +
      '<a class="ied-owner-link" data-imory-if="viewer.writeHref" data-imory-href="viewer.writeHref">Write</a>' +
      '<span class="ied-owner-bar" aria-hidden="true"></span>' +
      (withManage
        ? '<a class="ied-owner-link" data-imory-if="viewer.manageHref" data-imory-href="viewer.manageHref">Edit</a>' +
          '<span class="ied-owner-bar ied-owner-bar--manage" data-imory-if="viewer.manageHref" aria-hidden="true"></span>'
        : "") +
      '<a class="ied-owner-link" data-imory-if="viewer.adminHref" data-imory-href="viewer.adminHref">Admin</a>' +
    '</p>'
  );

}


function imoryEditorialPostList(path, className) {

  return (
    `<ol class="ied-list ${className || ""}">` +
      `<li class="ied-list-item" data-imory-repeat="${path}">` +
        '<a class="ied-list-link" data-imory-href="item.href">' +
          '<span class="ied-list-title" data-imory-bind="item.title"></span>' +
          '<time class="ied-list-date" data-imory-bind="item.publishedAtLabel"></time>' +
        '</a>' +
      '</li>' +
    '</ol>'
  );

}


/* HOME 사진 하나 — 슬롯이 비면 data-imory-if 가 접는다 */
function imoryEditorialPhoto(n) {

  const slot = `photo_${n}`;

  return (
    `<figure class="ied-photo ied-photo--${n}" data-imory-photos-item data-imory-if="images.${slot}">` +
      '<span class="ied-photo-frame">' +
        `<img class="ied-photo-img" data-imory-src="images.${slot}" alt="">` +
      '</span>' +
      '<figcaption class="ied-photo-cap">' +
        `<span class="ied-photo-no">0${n}</span>` +
        `<span class="ied-photo-word">${IMORY_EDITORIAL_TEXT.words[n - 1]}</span>` +
      '</figcaption>' +
    '</figure>'
  );

}


/* =========================================================
   HOME
========================================================== */

function imoryEditorialHomeHtml() {

  const t = IMORY_EDITORIAL_TEXT;

  const left =
    '<aside class="ied-side ied-side--left" data-imory-sides-area="left" aria-label="프로필">' +
      '<div class="ied-side-head">' +
        '<p class="ied-side-label">Profile</p>' +
        '<span class="ied-close" data-imory-sides-close="left" aria-label="프로필 닫기"></span>' +
      '</div>' +
      '<figure class="ied-portrait" data-imory-if="images.pair_photo">' +
        '<span class="ied-portrait-frame"><img class="ied-portrait-img" data-imory-src="images.pair_photo" alt=""></span>' +
      '</figure>' +
      '<p class="ied-side-names" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>' +
      '<p class="ied-side-words">' +
        `<span class="ied-side-word">${t.sideWordsA}</span>` +
        `<span class="ied-side-word">${t.sideWordsB}</span>` +
        `<span class="ied-side-word">${t.sideWordsC}</span>` +
      '</p>' +
      `<p class="ied-side-quote">${t.sideQuoteLeft}</p>` +
      IMORY_EDITORIAL_RULE_STAR +
    '</aside>';

  const right =
    '<aside class="ied-side ied-side--right" data-imory-sides-area="right" aria-label="메뉴">' +
      '<div class="ied-side-head">' +
        '<p class="ied-side-label">Categories</p>' +
        '<span class="ied-close" data-imory-sides-close="right" aria-label="메뉴 닫기"></span>' +
      '</div>' +
      '<ul class="ied-side-cats">' +
        '<li class="ied-side-cat"><a class="ied-side-link" data-imory-href="navigation.home.href">Home</a></li>' +
        '<li class="ied-side-cat" data-imory-repeat="navigation.categories">' +
          '<a class="ied-side-link" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
        '</li>' +
        '<li class="ied-side-cat" data-imory-if="navigation.highlights.showStandaloneLink">' +
          '<a class="ied-side-link" data-imory-href="navigation.highlights.href" data-imory-bind="navigation.highlights.name"></a>' +
        '</li>' +
      '</ul>' +
      '<section class="ied-side-block ied-dday" data-imory-if="settings.dday">' +
        IMORY_EDITORIAL_RULE_STAR +
        '<p class="ied-side-label">D-day</p>' +
        '<p class="ied-dday-num" data-imory-bind="settings.dday.display"></p>' +
        '<p class="ied-dday-label" data-imory-if="settings.dday.label" data-imory-bind="settings.dday.label"></p>' +
      '</section>' +
      '<section class="ied-side-block ied-side-latest" data-imory-if="home.recentPosts">' +
        IMORY_EDITORIAL_RULE_STAR +
        '<p class="ied-side-label">Latest</p>' +
        imoryEditorialPostList("home.recentPosts", "ied-list--side") +
      '</section>' +
      '<section class="ied-side-block ied-side-highlight" data-imory-if="home.highlights.hasCard">' +
        IMORY_EDITORIAL_RULE_STAR +
        '<p class="ied-side-label" data-imory-bind="navigation.highlights.name"></p>' +
        '<figure class="ied-quote" data-imory-repeat="home.highlights.featured" data-imory-color="item.color">' +
          '<blockquote class="ied-quote-text" data-imory-bind="item.excerpt"></blockquote>' +
          '<figcaption class="ied-quote-source" data-imory-bind="item.sourcePathLabel"></figcaption>' +
        '</figure>' +
      '</section>' +
      IMORY_EDITORIAL_RULE_STAR +
      `<p class="ied-side-quote">${t.sideQuoteRight}</p>` +
    '</aside>';

  const main =
    '<main class="ied-main" data-imory-sides-area="main">' +
      imoryEditorialTop("01", '<p class="ied-top-page">Home</p>', true) +
      '<section class="ied-mast">' +
        '<h1 class="ied-title" data-imory-bind="site.title"></h1>' +
        '<p class="ied-sub" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>' +
      '</section>' +
      imoryEditorialNav(true) +
      /* 사진 구성 — 몇 장을 어떻게 놓을지는 플랫폼이 정해 묶음에 적는다
         (data-imory-photos-layout). 이 스킨은 그 값별 모양만 그린다. */
      '<section class="ied-photos" data-imory-photos="set" aria-label="HOME 사진"' +
        ' data-imory-transition="fade-slide" data-imory-transition-duration="420"' +
        ' data-imory-transition-easing="smooth" data-imory-transition-direction="up">' +
        imoryEditorialPhoto(1) +
        imoryEditorialPhoto(2) +
        imoryEditorialPhoto(3) +
        imoryEditorialPhoto(4) +
        '<p class="ied-caption">' +
          `<span class="ied-caption-ko">${t.captionKo}</span>` +
          `<span class="ied-caption-en">${t.captionEn}</span>` +
        '</p>' +
        '<div class="ied-empty">' +
          '<span class="ied-empty-ribbon" aria-hidden="true"></span>' +
          IMORY_EDITORIAL_STAR +
          `<p class="ied-empty-head">${t.emptyHead}</p>` +
          IMORY_EDITORIAL_RULE_STAR +
          '<p class="ied-empty-note">' +
            `<span class="ied-empty-line">${t.emptyNoteA}</span>` +
            `<span class="ied-empty-line">${t.emptyNoteB}</span>` +
          '</p>' +
        '</div>' +
      '</section>' +
      '<section class="ied-latest" data-imory-if="home.recentPosts">' +
        '<p class="ied-label">Latest</p>' +
        imoryEditorialPostList("home.recentPosts") +
      '</section>' +
      imoryEditorialOwner(false) +
      imoryEditorialFoot() +
    '</main>';

  return (
    '<div class="ied ied-page--home">' +
      '<div class="ied-sheet ied-home" data-imory-sides="frame">' +
        left +
        main +
        right +
      '</div>' +
    '</div>'
  );

}


/* =========================================================
   CATEGORY · POST — 같은 종이의 짝(좌우 영역 없음)
========================================================== */

function imoryEditorialCategoryHtml() {

  return (
    '<div class="ied ied-page--inner">' +
      '<div class="ied-sheet ied-inner">' +
        imoryEditorialTop("02", '<p class="ied-top-page" data-imory-bind="category.name"></p>', false) +
        '<section class="ied-mast ied-mast--small">' +
          '<a class="ied-title ied-title--small" data-imory-href="navigation.home.href" data-imory-bind="site.title"></a>' +
        '</section>' +
        imoryEditorialNav(false) +
        '<main class="ied-body">' +
          '<h1 class="ied-page-title" data-imory-bind="category.name"></h1>' +
          IMORY_EDITORIAL_RULE_STAR +
          imoryEditorialOwner(true) +
          '<section class="ied-folders" data-imory-if="category.hasFolders">' +
            '<p class="ied-label">Folders</p>' +
            '<ul class="ied-folder-list">' +
              '<li class="ied-folder" data-imory-repeat="category.tree">' +
                '<span class="ied-folder-row" data-imory-if="item.name">' +
                  '<span class="ied-folder-name" data-imory-bind="item.name"></span>' +
                  '<a class="ied-folder-open" data-imory-if="item.folderHref" data-imory-href="item.folderHref">Open</a>' +
                '</span>' +
              '</li>' +
            '</ul>' +
          '</section>' +
          '<section class="ied-gallery" data-imory-if="category.isGallery">' +
            '<ul class="ied-grid">' +
              '<li class="ied-card" data-imory-repeat="category.gallery.cards">' +
                '<a class="ied-card-link" data-imory-href="item.href">' +
                  '<span class="ied-card-thumb">' +
                    '<span class="ied-card-blank" aria-hidden="true"></span>' +
                    '<img class="ied-card-img" data-imory-if="item.hasThumbnail" data-imory-src="item.thumbnailUrl" alt="">' +
                    '<span class="ied-card-lock" data-imory-if="item.isLocked">Locked</span>' +
                  '</span>' +
                  '<span class="ied-card-title" data-imory-bind="item.title"></span>' +
                '</a>' +
              '</li>' +
            '</ul>' +
            '<p class="ied-note" data-imory-if="category.gallery.isEmpty">아직 글이 없습니다.</p>' +
          '</section>' +
          '<section class="ied-listing" data-imory-if="category.isList">' +
            imoryEditorialPostList("category.posts") +
          '</section>' +
          '<nav class="ied-pager" data-imory-if="category.pagination.hasPages" aria-label="페이지">' +
            '<a class="ied-pager-edge" data-imory-if="category.pagination.hasPrev" data-imory-href="category.pagination.prevHref">Prev</a>' +
            '<span class="ied-pager-nums">' +
              '<span class="ied-pager-slot" data-imory-repeat="category.pagination.pages">' +
                '<a class="ied-pager-num" data-imory-href="item.href" data-imory-bind="item.label"></a>' +
                '<span class="ied-pager-dot" data-imory-if="item.isCurrent" aria-hidden="true"></span>' +
              '</span>' +
            '</span>' +
            '<a class="ied-pager-edge" data-imory-if="category.pagination.hasNext" data-imory-href="category.pagination.nextHref">Next</a>' +
          '</nav>' +
        '</main>' +
        imoryEditorialFoot() +
      '</div>' +
    '</div>'
  );

}


function imoryEditorialPostHtml() {

  return (
    '<div class="ied ied-page--inner">' +
      '<div class="ied-sheet ied-inner">' +
        imoryEditorialTop(
          "03",
          '<a class="ied-top-page" data-imory-if="post.categoryHref" data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a>',
          false
        ) +
        '<section class="ied-mast ied-mast--small">' +
          '<a class="ied-title ied-title--small" data-imory-href="navigation.home.href" data-imory-bind="site.title"></a>' +
        '</section>' +
        imoryEditorialNav(false) +
        '<main class="ied-body ied-article">' +
          '<h1 class="ied-page-title" data-imory-bind="post.title"></h1>' +
          '<p class="ied-article-date" data-imory-bind="post.publishedAtLabel"></p>' +
          IMORY_EDITORIAL_RULE_STAR +
          '<div class="ied-article-body" data-imory-region="post-body"></div>' +
        '</main>' +
        imoryEditorialFoot() +
      '</div>' +
    '</div>'
  );

}


/* =========================================================
   CSS
========================================================== */

function imoryEditorialCss() {

  const light = IMORY_EDITORIAL_PALETTES.light;

  return `
/* ── 색 · 글꼴 ───────────────────────────────────────────
   색은 네 역할뿐이다. 주인이 Studio 에서 고르면 플랫폼이
   --imory-color-* 를 루트에 싣고, 없으면 var() 의 기본값이다.
   옅은 선 · 흐린 글자 · 장식은 전부 이 넷에서 섞어 만든다. */
.ied {
  --ied-bg: var(--imory-color-background, ${light.background});
  --ied-ink: var(--imory-color-text, ${light.text});
  --ied-accent: var(--imory-color-accent, ${light.accent});
  --ied-accent-2: var(--imory-color-accent-2, ${light.accent2});

  --ied-muted: color-mix(in srgb, var(--ied-ink) 74%, var(--ied-bg));
  --ied-line: color-mix(in srgb, var(--ied-accent-2) 72%, var(--ied-bg));
  --ied-hair: color-mix(in srgb, var(--ied-accent-2) 40%, var(--ied-bg));
  --ied-wash: color-mix(in srgb, var(--ied-accent-2) 9%, var(--ied-bg));
  --ied-shadow: color-mix(in srgb, var(--ied-ink) 18%, transparent);

  --ied-display: "Didot", "Bodoni 72", "Bodoni MT", "Libre Bodoni", "Playfair Display", "Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", "Times New Roman", serif;
  --ied-serif: "Cormorant Garamond", "EB Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, "Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", Georgia, serif;

  /* 가운데 칼럼 — 카테고리 줄과 사진 묶음이 같은 폭을 넘지 않는다 */
  --ied-measure: 380px;
  --ied-inset: clamp(10px, 2.6vw, 28px);

  box-sizing: border-box;
  min-height: 100%;
  padding: var(--ied-inset);
  background: var(--ied-bg);
  color: var(--ied-ink);
  font-family: var(--ied-serif);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}

/* 초기화는 :where() 로 — 한 클래스짜리 규칙(.ied-owner 의 여백 · 링크 색)이
   초기화에 지지 않게 명시도를 .ied 하나로 둔다 */
.ied *, .ied *::before, .ied *::after { box-sizing: border-box; }
.ied [hidden] { display: none !important; }
.ied :where(p, h1, ol, ul, figure, blockquote) { margin: 0; }
.ied :where(ol, ul) { padding: 0; list-style: none; }
.ied :where(a) { color: inherit; text-decoration: none; }
.ied a:focus-visible, .ied [role="button"]:focus-visible {
  outline: 1px solid var(--ied-accent);
  outline-offset: 4px;
}

.ied-label,
.ied-side-label {
  font-size: 10.5px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--ied-accent);
}


/* ── 종이(겉 테두리) ─────────────────────────────────────
   두 겹 선 — 바깥 1px 선 + 안쪽 hairline(inset 그림자라 둥근
   모서리를 따라간다) */
.ied-sheet {
  position: relative;
  min-height: clamp(520px, calc(100vh - 2 * var(--ied-inset)), 1400px);
  border: 1px solid var(--ied-line);
  border-radius: clamp(14px, 2vw, 22px);
  box-shadow: inset 0 0 0 5px var(--ied-bg), inset 0 0 0 6px var(--ied-hair);
  background: var(--ied-bg);
}

/* 칼럼일 때 종이는 켜진 칸의 합만큼만 — 넓은 화면에서 가운데에 모인다.
   패널일 때는 제한하지 않는다(좁혀 두면 폭 판정이 칼럼으로 돌아오지
   못한다). */
.ied-home {
  /* 좌우 영역(IMORY_SIDES_DESIGN.md) — 폭 · 본문 최소/최대 폭 · 패널.
     틀 자신에 적는다 — 플랫폼 기본값이 틀에 붙어 있어서 조상에 적으면
     그 기본값에 가려진다. 안쪽 칸 · 종이 폭 계산도 이 값을 읽는다. */
  --imory-sides-left-width: 204px;
  --imory-sides-right-width: 228px;
  --imory-sides-main-min: 440px;
  --imory-sides-main-max: 620px;
  --imory-sides-drawer-width: min(84vw, 320px);
  --imory-sides-duration: 320ms;
  --imory-sides-backdrop: color-mix(in srgb, var(--ied-ink) 26%, transparent);

  --ied-l: 0px;
  --ied-r: 0px;
  margin: 0 auto;
}
.ied-home[data-imory-sides-layout="columns"] {
  max-width: calc(var(--ied-l) + var(--imory-sides-main-max) + var(--ied-r) + 2px);
}
.ied-home[data-imory-sides-layout="columns"][data-imory-sides-on~="left"] { --ied-l: var(--imory-sides-left-width); }
.ied-home[data-imory-sides-layout="columns"][data-imory-sides-on~="right"] { --ied-r: var(--imory-sides-right-width); }

.ied-inner {
  max-width: 620px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 0 clamp(18px, 5vw, 44px);
}


/* ── 가운데 ──────────────────────────────────────────── */
.ied-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0 clamp(18px, 5vw, 44px);
}

.ied-home[data-imory-sides-layout="drawer"] > .ied-main {
  max-width: var(--imory-sides-main-max);
  margin: 0 auto;
}

.ied-home[data-imory-sides-layout] > .ied-main {
  min-height: clamp(518px, calc(100vh - 2 * var(--ied-inset) - 2px), 1398px);
}

.ied-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding-top: 6px;
}

/* 모바일(패널)에서는 여는 버튼이 늘 손에 닿게 머리가 위에 붙는다 —
   HOME 을 내려 읽다가도 스크롤 위치를 잃지 않고 좌우 영역을 연다 */
.ied-home[data-imory-sides-layout="drawer"] .ied-top {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--ied-bg);
}

.ied-top-mark {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-right: auto;
  color: var(--ied-accent);
}

.ied-top-no {
  font-family: var(--ied-display);
  font-style: italic;
  font-size: clamp(24px, 1.2vw + 18px, 32px);
  line-height: 1;
}

.ied-top-mark::after {
  content: "";
  width: clamp(28px, 6vw, 48px);
  height: 1px;
  background: var(--ied-line);
}

.ied-top-page {
  min-width: 0;
  font-size: 10.5px;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--ied-accent);
  text-align: right;
  overflow-wrap: anywhere;
}

.ied-open {
  flex: none;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--ied-accent);
}

.ied-open--left { margin-left: -12px; }
.ied-open--right { margin-right: -12px; }

.ied-icon-lines {
  width: 18px;
  height: 1px;
  background: currentColor;
  box-shadow: 0 -5px 0 currentColor, 0 5px 0 currentColor;
}

.ied-icon-ring {
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.ied-mast {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(14px, 2.4vh, 22px);
  padding: clamp(18px, 4vh, 44px) 0 clamp(16px, 2.6vh, 26px);
  text-align: center;
}

/* 작은 가운데 제목 — 두 줄이 되면 둘째 줄부터 기울인다 */
.ied-title {
  display: block;
  max-width: 9.5em;
  font-family: var(--ied-display);
  font-weight: 400;
  font-style: italic;
  font-size: clamp(24px, 1.4vw + 18px, 34px);
  line-height: 1.04;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  text-wrap: balance;
  overflow-wrap: anywhere;
  color: var(--ied-accent);
}

.ied-title::first-line { font-style: normal; }

.ied-title--small { font-size: clamp(18px, 0.8vw + 15px, 24px); }

.ied-sub {
  max-width: var(--ied-measure);
  font-size: 11px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  line-height: 1.8;
  color: var(--ied-ink);
  overflow-wrap: anywhere;
}

.ied-mast--small { padding: 10px 0 14px; }


/* ── 카테고리 — 알약이 아니라 글자 링크 ────────────────── */
.ied-nav {
  width: min(100%, var(--ied-measure));
  margin: 0 auto;
}

.ied-nav-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  column-gap: clamp(18px, 7%, 36px);
  row-gap: 6px;
}

.ied-nav-item { min-width: 0; }

.ied-nav-link {
  display: inline-block;
  padding: 8px 0 7px;
  font-size: 11.5px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ied-ink);
  border-bottom: 1px solid transparent;
  overflow-wrap: anywhere;
  transition: border-color 0.25s ease, color 0.25s ease;
}

.ied-nav-link:hover { border-bottom-color: var(--ied-line); color: var(--ied-accent); }
.ied-nav-item--current .ied-nav-link { border-bottom-color: var(--ied-accent); color: var(--ied-accent); }


/* ── HOME 사진 구성 ──────────────────────────────────────
   묶음은 카테고리 줄과 같은 폭을 넘지 않는다. 구성(empty · hero ·
   pair · triptych)은 플랫폼이 data-imory-photos-layout 에 적는다. */
.ied-photos {
  position: relative;
  width: min(100%, var(--ied-measure));
  margin: clamp(22px, 3.6vh, 36px) auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.ied-photo { position: relative; margin: 0; }

.ied-photo-frame {
  display: block;
  overflow: hidden;
  border: 1px solid var(--ied-line);
  background: var(--ied-wash);
}

.ied-photo-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 30%;
}

.ied-photo-cap { display: none; }

.ied-photo[data-imory-photos-position="1"] { order: 0; }
.ied-photo[data-imory-photos-position="2"] { order: 2; }
.ied-photo[data-imory-photos-position="3"] { order: 4; }
.ied-caption { order: 5; }
.ied-empty { order: 6; }

/* 한 장 — 세로 사진 하나, 양옆에 작은 별 */
.ied-photos[data-imory-photos-layout="hero"] .ied-photo { width: 74%; }
.ied-photos[data-imory-photos-layout="hero"] .ied-photo-frame { aspect-ratio: 3 / 4; }

.ied-photos[data-imory-photos-layout="hero"] .ied-photo::before,
.ied-photos[data-imory-photos-layout="hero"] .ied-photo::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 8px;
  height: 12px;
  margin-top: -6px;
  background: var(--ied-accent);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
}

.ied-photos[data-imory-photos-layout="hero"] .ied-photo::before { left: -20px; }
.ied-photos[data-imory-photos-layout="hero"] .ied-photo::after { right: -20px; }

.ied-photos[data-imory-photos-layout="hero"] .ied-caption {
  width: 88%;
  padding: 12px 16px;
  border: 1px solid var(--ied-line);
}

/* 두 장 — 가로 사진 둘, 사이에 문장 */
.ied-photos[data-imory-photos-layout="pair"] .ied-photo { width: 94%; }
.ied-photos[data-imory-photos-layout="pair"] .ied-photo-frame { aspect-ratio: 16 / 10; }
.ied-photos[data-imory-photos-layout="pair"] .ied-caption { order: 1; width: 100%; }

.ied-photos[data-imory-photos-layout="pair"] .ied-caption-ko::before,
.ied-photos[data-imory-photos-layout="pair"] .ied-caption-ko::after,
.ied-photos[data-imory-photos-layout="triptych"] .ied-caption-ko::before,
.ied-photos[data-imory-photos-layout="triptych"] .ied-caption-ko::after {
  content: "";
  flex: 1 1 0;
  min-width: 12px;
  height: 1px;
  background: var(--ied-line);
}

/* 세 장 — 가운데가 조금 크고 양옆이 받친다(살짝 겹친다) */
.ied-photos[data-imory-photos-layout="triptych"] {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}

.ied-photos[data-imory-photos-layout="triptych"] .ied-photo { width: 29%; margin-top: 9%; }
.ied-photos[data-imory-photos-layout="triptych"] .ied-photo-frame { aspect-ratio: 2 / 5; }

.ied-photos[data-imory-photos-layout="triptych"] .ied-photo[data-imory-photos-position="2"] {
  z-index: 1;
  width: 40%;
  margin: 0 -2%;
}

.ied-photos[data-imory-photos-layout="triptych"] .ied-photo[data-imory-photos-position="2"] .ied-photo-frame {
  box-shadow: 0 0 0 4px var(--ied-bg);
}

.ied-photos[data-imory-photos-layout="triptych"] .ied-photo-cap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-top: 10px;
  text-align: center;
}

.ied-photo-no {
  font-family: var(--ied-display);
  font-style: italic;
  font-size: 12px;
  color: var(--ied-accent);
}

.ied-photo-word {
  font-size: 8.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ied-ink);
  overflow-wrap: normal;
}

.ied-photos[data-imory-photos-layout="triptych"] .ied-caption {
  flex-basis: 100%;
  margin-top: 26px;
}

/* 문장 두 줄 — 한글 한 줄 + 기울인 영문 한 줄 */
.ied-caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.ied-caption-ko {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  justify-content: center;
  font-family: var(--ied-serif);
  font-size: 15px;
  letter-spacing: 0.02em;
  color: var(--ied-accent);
  overflow-wrap: anywhere;
}

.ied-caption-en {
  font-family: var(--ied-serif);
  font-style: italic;
  font-size: 14px;
  letter-spacing: 0.04em;
  color: var(--ied-ink);
  overflow-wrap: anywhere;
}

/* 사진이 없을 때 — 글자와 선만으로 된 빈 표지 */
.ied-photos[data-imory-photos-layout="empty"] .ied-caption { display: none; }
.ied-photos:not([data-imory-photos-layout="empty"]) .ied-empty { display: none; }

.ied-empty {
  position: relative;
  isolation: isolate;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(16px, 3vh, 28px);
  padding: clamp(32px, 8vh, 110px) 0 clamp(24px, 6vh, 90px);
  text-align: center;
  overflow: hidden;
}

/* 옅은 리본 — 큰 원 두 개의 가장자리가 흐르는 선처럼 보인다 */
.ied-empty-ribbon {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}

.ied-empty-ribbon::before,
.ied-empty-ribbon::after {
  content: "";
  position: absolute;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--ied-accent-2) 22%, var(--ied-bg));
  box-shadow: 0 0 0 9px color-mix(in srgb, var(--ied-accent-2) 5%, var(--ied-bg));
}

.ied-empty-ribbon::before { width: 150%; left: 36%; top: -46%; }
.ied-empty-ribbon::after { width: 132%; right: 32%; top: 40%; }

.ied-empty-head {
  font-family: var(--ied-display);
  font-style: italic;
  font-size: clamp(16px, 0.8vw + 13px, 21px);
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ied-accent);
}

.ied-empty-note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--ied-serif);
  font-style: italic;
  font-size: 15px;
  letter-spacing: 0.22em;
  color: var(--ied-ink);
}


/* ── 별 · 선 ─────────────────────────────────────────── */
.ied-star {
  display: inline-block;
  flex: none;
  width: 9px;
  height: 14px;
  background: var(--ied-accent);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
}

.ied-rule-star {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.ied-rule-star::before,
.ied-rule-star::after {
  content: "";
  width: clamp(36px, 12%, 64px);
  height: 1px;
  background: var(--ied-line);
}


/* ── 최근 글 ─────────────────────────────────────────── */
.ied-latest { display: none; }

/* 오른쪽 영역이 없을 때(1단 · 모바일에서 끈 경우)만 가운데에 */
.ied-home:not([data-imory-sides-on~="right"]) .ied-latest:not([hidden]) {
  display: block;
  width: min(100%, var(--ied-measure));
  margin: clamp(28px, 4vh, 40px) auto 0;
}

.ied-latest > .ied-label { text-align: center; margin-bottom: 8px; }

.ied-list { counter-reset: ied-item; }

.ied-list-item {
  counter-increment: ied-item;
  border-top: 1px solid var(--ied-hair);
}

.ied-list-item:last-child { border-bottom: 1px solid var(--ied-hair); }

.ied-list-link {
  display: grid;
  grid-template-columns: 2.2em minmax(0, 1fr);
  column-gap: 8px;
  padding: 10px 0;
}

.ied-list-link::before {
  content: counter(ied-item, decimal-leading-zero);
  grid-row: 1 / span 2;
  padding-top: 3px;
  font-family: var(--ied-display);
  font-style: italic;
  font-size: 12px;
  color: var(--ied-accent);
}

.ied-list-title {
  font-size: 15px;
  line-height: 1.4;
  color: var(--ied-ink);
  overflow-wrap: anywhere;
  transition: color 0.2s ease;
}

.ied-list-date {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ied-muted);
}

.ied-list-link:hover .ied-list-title { color: var(--ied-accent); }


/* ── 주인 전용 · 발 ──────────────────────────────────── */
.ied-owner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  margin-top: clamp(20px, 3.5vh, 40px);
  font-size: 11px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--ied-accent);
}

.ied-owner-link { padding: 10px 0; border-bottom: 1px solid transparent; transition: border-color 0.25s ease; }
.ied-owner-link:hover { border-bottom-color: var(--ied-line); }

.ied-owner-bar {
  width: 1px;
  height: 20px;
  background: var(--ied-line);
}

.ied-foot {
  margin-top: auto;
  padding: clamp(28px, 5vh, 44px) 0 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ied-foot-line {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  font-size: 10px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--ied-accent);
  text-align: center;
}

.ied-foot-line::before,
.ied-foot-line::after {
  content: "";
  flex: 1 1 0;
  min-width: 16px;
  height: 1px;
  background: var(--ied-line);
}

.ied-foot-text { min-width: 0; max-width: 70%; overflow-wrap: anywhere; }


/* ── 좌우 영역 ───────────────────────────────────────── */
.ied-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 30px 22px 34px;
  font-size: 13px;
  min-width: 0;
}

/* 칼럼 — 배경 없이(종이의 두 겹 선이 이어진다) 세로 hairline 하나로
   가른다. 선은 종이 테두리에 닿지 않게 위아래를 띄운다. */
.ied-home[data-imory-sides-layout="columns"] > .ied-side { margin: 22px 0; padding-top: 8px; padding-bottom: 12px; }
.ied-home[data-imory-sides-layout="columns"] > .ied-side--left { border-right: 1px solid var(--ied-hair); }
.ied-home[data-imory-sides-layout="columns"] > .ied-side--right { border-left: 1px solid var(--ied-hair); }

.ied-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ied-line);
}

.ied-close {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  margin: -12px -12px -12px auto;
  cursor: pointer;
  color: var(--ied-accent);
}

.ied-close::before,
.ied-close::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 1px;
  background: currentColor;
  transform: translate(-50%, -50%) rotate(45deg);
}

.ied-close::after { transform: translate(-50%, -50%) rotate(-45deg); }

.ied-side-cats { display: flex; flex-direction: column; gap: 2px; }

.ied-side-link {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ied-ink);
  overflow-wrap: anywhere;
  transition: color 0.2s ease;
}

.ied-side-link::before {
  content: "";
  flex: none;
  width: 14px;
  height: 1px;
  transform: translateY(-3px);
  background: var(--ied-line);
}

.ied-side-link:hover { color: var(--ied-accent); }

.ied-side-block { display: flex; flex-direction: column; gap: 12px; }

.ied-side-block > .ied-rule-star { margin: 6px 0 4px; }

.ied-dday { align-items: center; text-align: center; }

.ied-dday-num {
  font-family: var(--ied-display);
  font-style: italic;
  font-size: 34px;
  line-height: 1;
  color: var(--ied-accent);
}

.ied-dday-label {
  font-size: 10px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--ied-muted);
  overflow-wrap: anywhere;
}

.ied-list--side .ied-list-title { font-size: 13.5px; }

.ied-quote {
  padding-left: 12px;
  border-left: 1px solid var(--imory-color, var(--ied-accent));
}

.ied-quote-text {
  font-style: normal;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.ied-quote-source {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--ied-muted);
  overflow-wrap: anywhere;
}

.ied-side-quote {
  font-style: italic;
  font-size: 15px;
  line-height: 1.5;
  text-align: center;
  color: var(--ied-accent);
}

.ied-portrait { align-self: center; width: 100%; max-width: 132px; }

.ied-portrait-frame {
  display: block;
  aspect-ratio: 3 / 5;
  overflow: hidden;
  border: 1px solid var(--ied-line);
  background: var(--ied-wash);
}

.ied-portrait-img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }

.ied-side-names {
  font-size: 10.5px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  line-height: 1.8;
  color: var(--ied-ink);
  overflow-wrap: anywhere;
}

.ied-side-words {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 0;
  border-top: 1px solid var(--ied-hair);
  border-bottom: 1px solid var(--ied-hair);
  font-size: 10.5px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--ied-accent);
}

.ied-side--left .ied-side-quote { text-align: left; }

.ied-side > .ied-rule-star:last-child,
.ied-side > .ied-side-quote:last-child { margin-top: auto; }

/* 모바일 패널 — 종이 그대로, 옆 그림자 하나 */
.ied-home[data-imory-sides-layout="drawer"] > .ied-side {
  padding-top: 18px;
  background: var(--ied-bg);
  box-shadow: 0 0 0 1px var(--ied-hair), 0 24px 60px var(--ied-shadow);
}

.ied-home[data-imory-sides-layout="columns"] .ied-side-head { padding-top: 10px; }


/* ── CATEGORY · POST ─────────────────────────────────── */
.ied-body {
  width: min(100%, 560px);
  margin: 0 auto;
  padding-top: clamp(24px, 4vw, 44px);
}

.ied-page-title {
  font-family: var(--ied-display);
  font-weight: 400;
  font-size: clamp(22px, 1.4vw + 16px, 32px);
  line-height: 1.25;
  text-align: center;
  color: var(--ied-accent);
  overflow-wrap: anywhere;
}

.ied-body > .ied-rule-star { margin: 18px 0 8px; }

.ied-body > .ied-owner { margin-top: 12px; }

.ied-folders, .ied-listing, .ied-gallery { margin-top: 28px; }

.ied-folder-list { display: flex; flex-direction: column; margin-top: 8px; }

.ied-folder-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--ied-hair);
}

.ied-folder-name { min-width: 0; overflow-wrap: anywhere; }

.ied-folder-open {
  font-size: 10px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--ied-accent);
}

.ied-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
  gap: 18px 14px;
}

.ied-card-thumb {
  position: relative;
  display: block;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--ied-hair);
  background: var(--ied-wash);
}

.ied-card-blank { position: absolute; inset: 0; }
.ied-card-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

.ied-card-lock {
  position: absolute;
  left: 8px;
  bottom: 8px;
  font-size: 9px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--ied-accent);
  background: var(--ied-bg);
  padding: 2px 6px;
}

.ied-card-title {
  display: block;
  margin-top: 8px;
  font-size: 13.5px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.ied-note { margin-top: 18px; text-align: center; color: var(--ied-muted); }

.ied-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 28px;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.ied-pager-nums { display: flex; gap: 10px; }
.ied-pager-slot { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
.ied-pager-num { padding: 6px 4px; }
.ied-pager-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--ied-accent); }
.ied-pager-edge { color: var(--ied-accent); padding: 6px 0; }

.ied-article-date {
  margin-top: 10px;
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  color: var(--ied-muted);
}

.ied-article > .ied-rule-star { margin: 20px 0 28px; }

.ied-article-body { min-width: 0; }


/* ── 움직임 — 손끝이 아니라 마우스에서만, 줄이라면 없이 ── */
@media (hover: hover) {
  .ied-photo-frame { transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
  .ied-photo:hover .ied-photo-frame { transform: translateY(-3px); }
}

@media (prefers-reduced-motion: reduce) {
  .ied-nav-link,
  .ied-list-title,
  .ied-owner-link,
  .ied-side-link,
  .ied-photo-frame { transition: none; }
  .ied-photo:hover .ied-photo-frame { transform: none; }
}
`.trim() + "\n";

}


/* =========================================================
   createImoryEditorialDefaultSkin(options) -> SkinPackage

   options = {
     columns:    1 | 2 | 3            (기본 1)
     appearance: "light" | "dark"     (기본 light — light 면 색 설정을
                                        적지 않는다: CSS 기본값이 곧 light)
   }

   regions 에 적는 것은 단 구성과(어두운 분위기일 때만) 색뿐이다.
   사진 구성은 적지 않는다 — 자동(auto)이 기본값이다.
========================================================== */

function createImoryEditorialDefaultSkin(options) {

  const o = options || {};

  const columns = o.columns === 2 || o.columns === 3 ? o.columns : 1;

  const regions = [
    { name: "left_sidebar", enabled: columns === 3 },
    { name: "right_sidebar", enabled: columns >= 2 }
  ];

  if (o.appearance === "dark") {
    regions.push({ name: "theme_colors", colors: { ...IMORY_EDITORIAL_PALETTES.dark } });
  }

  const slot = (name, label, aspectRatioHint) =>
    ({ name, label, required: false, aspectRatioHint });

  return {
    schemaVersion: 1,
    templates: {
      home: { html: imoryEditorialHomeHtml() },
      category: { html: imoryEditorialCategoryHtml() },
      post: { html: imoryEditorialPostHtml() }
    },
    css: imoryEditorialCss(),
    imageSlots: [
      slot("photo_1", "HOME 사진 1", "3:4"),
      slot("photo_2", "HOME 사진 2", "3:4"),
      slot("photo_3", "HOME 사진 3", "3:4"),
      slot("photo_4", "HOME 사진 4", "3:4"),
      slot("pair_photo", "프로필 사진(왼쪽 영역)", "3:5")
    ],
    regions,
    /* metadata 에는 문답의 답을 남기지 않는다(studio-lifecycle-test B4) */
    metadata: {
      generatedBy: IMORY_EDITORIAL_DEFAULT_ID,
      supports: { home: true, category: true, post: true }
    }
  };

}


/*
  Studio 첫 스킨 문답(skin-questionnaire)의 답 -> 위 options.

  지금 문답은 세 가지를 묻는다. 이 스킨이 쓰는 것은 둘이다.
    layoutPreference  one-column | two-column | three-column -> columns
    baseAppearance    light | dark                           -> appearance
    homeStyle         intro | index | profile                -> (읽지 않는다)
  다음 단계의 가입 문답이 무엇을 바꾸는지는 기준 문서 §9.
*/
function imoryEditorialOptionsFromAnswers(answers) {

  const a = answers || {};

  const columns =
    a.layoutPreference === "three-column" ? 3
      : a.layoutPreference === "two-column" ? 2
        : 1;

  return {
    columns,
    appearance: a.baseAppearance === "dark" ? "dark" : "light"
  };

}


if (typeof window !== "undefined") {
  window.IMORY_EDITORIAL_DEFAULT_ID = IMORY_EDITORIAL_DEFAULT_ID;
  window.IMORY_EDITORIAL_PALETTES = IMORY_EDITORIAL_PALETTES;
  window.createImoryEditorialDefaultSkin = createImoryEditorialDefaultSkin;
  window.imoryEditorialOptionsFromAnswers = imoryEditorialOptionsFromAnswers;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    IMORY_EDITORIAL_DEFAULT_ID,
    IMORY_EDITORIAL_PALETTES,
    IMORY_EDITORIAL_TEXT,
    createImoryEditorialDefaultSkin,
    imoryEditorialOptionsFromAnswers
  };
}
