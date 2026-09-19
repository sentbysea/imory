/* =========================================================
   imory-editorial-home-v1.json 만들기 (EDITORIAL-RESPONSIVE-HOME-1)

     node skin/test-skins/build-editorial-home-v1.mjs

   아이모리 기본 스킨의 바탕이 될 "잡지 표지형 반응형 HOME" 시안.
   기준 문서: IMORY_SIDES_DESIGN.md

   - 좌우 영역은 data-imory-sides* 속성만으로 선언한다. 칼럼 ↔ 패널
     전환 · 열고 닫기 · 포커스 · 스크롤 잠금은 플랫폼이 한다 —
     이 CSS 에 미디어 쿼리가 없다.
   - 1단 · 2단 · 3단은 regions 가 정한다(여기서는 3단으로 낸다).
   - 색은 --skin-background · --skin-text · --skin-accent 세 값에서
     나머지(surface · muted · line · accent-ink)가 color-mix 로
     나온다. 어두운 배경은 세 값만 바꾸면 된다(아래 DARK_PALETTE —
     e2e 가 그 판으로 대비를 잰다).
   - 대표 사진은 이미지 슬롯 `cover` 다. 비어 있으면 표지는 글자만으로
     선다(깨진 이미지 · 빈 카드 · 가짜 글이 없다).
   - sandbox 프레임에서는 vh 가 "프레임 높이"라서(프레임이 콘텐츠를
     따라 자란다) vh 로 크기를 정하는 곳은 전부 px 상한이 있는
     clamp() 안에 둔다 — 상한이 없으면 프레임과 사진이 서로를 키운다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const LIGHT_PALETTE = {
  background: "#ffffff",
  text: "#1b1a17",
  accent: "#a0442c"
};

export const DARK_PALETTE = {
  background: "#16171a",
  text: "#eeece6",
  accent: "#e0967a"
};


/* ---------------------------------------------------------
   HOME
--------------------------------------------------------- */

const closeButton = (side, label) =>
  `<span class="ed-close" data-imory-sides-close="${side}" aria-label="${label}"></span>`;

const home =
  '<div class="ed ed-home" data-imory-sides="frame">' +

    /* 왼쪽 — 목차 */
    '<aside class="ed-side ed-side--left" data-imory-sides-area="left" aria-label="목차">' +
      '<div class="ed-side-head">' +
        '<p class="ed-label">Contents</p>' +
        closeButton("left", "목차 닫기") +
      '</div>' +
      '<nav class="ed-toc" aria-label="카테고리">' +
        '<a class="ed-toc-home" data-imory-href="navigation.home.href">Home</a>' +
        '<ol class="ed-toc-list" data-imory-if="navigation.categories">' +
          '<li class="ed-toc-item" data-imory-repeat="navigation.categories">' +
            '<a class="ed-toc-link" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
          '</li>' +
        '</ol>' +
      '</nav>' +
      '<p class="ed-side-foot">' +
        '<a class="ed-side-foot-link" data-imory-href="navigation.highlights.href" data-imory-bind="navigation.highlights.name"></a>' +
      '</p>' +
    '</aside>' +

    /* 가운데 — 표지 */
    '<main class="ed-main" data-imory-sides-area="main">' +
      '<header class="ed-mast">' +
        '<span class="ed-trigger ed-trigger--left" data-imory-sides-open="left" aria-label="목차 열기"><span class="ed-icon-lines"></span></span>' +
        '<p class="ed-mast-mark" data-imory-bind="site.slug"></p>' +
        '<span class="ed-trigger ed-trigger--right" data-imory-sides-open="right" aria-label="최근 글 열기"><span class="ed-icon-ring"></span></span>' +
      '</header>' +
      /* 사진이 제목보다 **먼저** 온다 — 사진이 없을 때(hidden) 제목을
         키우는 규칙이 형제 선택자(.ed-photo[hidden] + .ed-title)라서다.
         보이는 순서는 CSS order 가 제목을 위로 올린다. 사진의 alt 는
         비어 있어(장식) 읽는 순서에 끼지 않는다. */
      '<section class="ed-cover">' +
        '<figure class="ed-photo" data-imory-if="images.cover">' +
          '<img class="ed-photo-img" data-imory-src="images.cover" alt="">' +
        '</figure>' +
        '<h1 class="ed-title" data-imory-bind="site.title"></h1>' +
        '<p class="ed-byline" data-imory-if="profile.nickname">' +
          '<span class="ed-byline-by">by</span> <span class="ed-byline-name" data-imory-bind="profile.nickname"></span>' +
        '</p>' +
      '</section>' +
      '<nav class="ed-cats" data-imory-if="navigation.categories" aria-label="카테고리">' +
        '<ul class="ed-cats-list">' +
          '<li class="ed-cats-item" data-imory-repeat="navigation.categories">' +
            '<a class="ed-cats-link" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
          '</li>' +
        '</ul>' +
      '</nav>' +
      '<section class="ed-latest" data-imory-if="home.recentPosts">' +
        '<p class="ed-label">Latest</p>' +
        '<ol class="ed-list">' +
          '<li class="ed-list-item" data-imory-repeat="home.recentPosts">' +
            '<a class="ed-list-link" data-imory-href="item.href">' +
              '<span class="ed-list-title" data-imory-bind="item.title"></span>' +
              '<time class="ed-list-date" data-imory-bind="item.publishedAtLabel"></time>' +
            '</a>' +
          '</li>' +
        '</ol>' +
      '</section>' +
      '<footer class="ed-foot"><span class="ed-foot-title" data-imory-bind="site.title"></span></footer>' +
    '</main>' +

    /* 오른쪽 — 사람 · 최근 글 · 하이라이트 */
    '<aside class="ed-side ed-side--right" data-imory-sides-area="right" aria-label="최근 글">' +
      '<div class="ed-side-head">' +
        /* 글이 없으면 제목 없는 여백으로 둔다(빈 칸에 이름표만 달지 않는다) */
        '<p class="ed-label" data-imory-if="home.recentPosts">Notes</p>' +
        closeButton("right", "최근 글 닫기") +
      '</div>' +
      '<div class="ed-profile" data-imory-if="profile.nickname">' +
        '<img class="ed-avatar" data-imory-if="profile.avatarUrl" data-imory-src="profile.avatarUrl" alt="프로필 사진">' +
        '<p class="ed-profile-name" data-imory-bind="profile.nickname"></p>' +
        '<p class="ed-profile-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>' +
      '</div>' +
      '<section class="ed-notes" data-imory-if="home.recentPosts">' +
        '<p class="ed-label">Latest</p>' +
        '<ol class="ed-list">' +
          '<li class="ed-list-item" data-imory-repeat="home.recentPosts">' +
            '<a class="ed-list-link" data-imory-href="item.href">' +
              '<span class="ed-list-title" data-imory-bind="item.title"></span>' +
              '<time class="ed-list-date" data-imory-bind="item.publishedAtLabel"></time>' +
            '</a>' +
          '</li>' +
        '</ol>' +
      '</section>' +
      '<section class="ed-quote" data-imory-if="home.highlights.hasCard">' +
        '<p class="ed-label" data-imory-bind="navigation.highlights.name"></p>' +
        '<figure class="ed-quote-card" data-imory-repeat="home.highlights.featured" data-imory-color="item.color">' +
          '<blockquote class="ed-quote-text" data-imory-bind="item.excerpt"></blockquote>' +
          '<figcaption class="ed-quote-source" data-imory-bind="item.sourcePathLabel"></figcaption>' +
        '</figure>' +
      '</section>' +
      '<p class="ed-side-foot">' +
        '<a class="ed-side-foot-link" data-imory-href="navigation.highlights.href" data-imory-bind="navigation.highlights.name"></a>' +
      '</p>' +
    '</aside>' +

  '</div>';


/* ---------------------------------------------------------
   CATEGORY / POST — 같은 종이 · 같은 글꼴의 간단한 짝.
   이번 라운드는 HOME 이 주인공이다(CATEGORY/POST 재설계는 범위 밖).
--------------------------------------------------------- */

const category =
  '<div class="ed ed-page">' +
    '<header class="ed-page-head">' +
      '<a class="ed-page-home" data-imory-href="navigation.home.href" data-imory-bind="site.title"></a>' +
      '<a class="ed-page-edit" data-imory-if="viewer.manageHref" data-imory-href="viewer.manageHref">Edit</a>' +
    '</header>' +
    '<main class="ed-page-main">' +
      '<h1 class="ed-page-title" data-imory-bind="category.name"></h1>' +
      '<ol class="ed-list ed-page-list">' +
        '<li class="ed-list-item" data-imory-repeat="category.posts">' +
          '<a class="ed-list-link" data-imory-href="item.href">' +
            '<span class="ed-list-title" data-imory-bind="item.title"></span>' +
            '<time class="ed-list-date" data-imory-bind="item.publishedAtLabel"></time>' +
          '</a>' +
        '</li>' +
      '</ol>' +
    '</main>' +
  '</div>';

const post =
  '<div class="ed ed-page">' +
    '<header class="ed-page-head">' +
      '<a class="ed-page-home" data-imory-href="navigation.home.href" data-imory-bind="site.title"></a>' +
      '<a class="ed-page-back" data-imory-if="post.categoryName" data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a>' +
    '</header>' +
    '<main class="ed-page-main ed-article">' +
      '<h1 class="ed-page-title" data-imory-bind="post.title"></h1>' +
      '<p class="ed-article-date" data-imory-bind="post.publishedAtLabel"></p>' +
      '<div class="ed-article-body" data-imory-region="post-body"></div>' +
    '</main>' +
  '</div>';


/* ---------------------------------------------------------
   CSS
--------------------------------------------------------- */

const css = `
/* ── 색 · 글꼴 — 바꾸는 값은 맨 위 세 줄이다 ───────────── */
.ed {
  --skin-background: ${LIGHT_PALETTE.background};
  --skin-text: ${LIGHT_PALETTE.text};
  --skin-accent: ${LIGHT_PALETTE.accent};

  --skin-surface: color-mix(in srgb, var(--skin-text) 3%, var(--skin-background));
  --skin-muted: color-mix(in srgb, var(--skin-text) 70%, var(--skin-background));
  --skin-line: color-mix(in srgb, var(--skin-text) 16%, var(--skin-background));
  --skin-accent-ink: color-mix(in srgb, var(--skin-accent) 80%, var(--skin-text));

  --ed-serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", serif;
  --ed-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;

  /* 좌우 영역(IMORY_SIDES_DESIGN.md) — 폭과 모바일 패널의 움직임 */
  --imory-sides-width: 248px;
  --imory-sides-main-min: 560px;
  --imory-sides-main-max: 720px;
  --imory-sides-drawer-width: min(84vw, 320px);
  --imory-sides-duration: 320ms;
  --imory-sides-backdrop: color-mix(in srgb, var(--skin-text) 30%, transparent);

  box-sizing: border-box;
  min-height: 100vh;
  background: var(--skin-background);
  color: var(--skin-text);
  font-family: var(--ed-sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.ed *, .ed *::before, .ed *::after { box-sizing: border-box; }
.ed [hidden] { display: none !important; }
.ed p, .ed h1, .ed ol, .ed ul, .ed figure, .ed blockquote { margin: 0; }
.ed ol, .ed ul { padding: 0; list-style: none; }
.ed a { color: inherit; text-decoration: none; }
.ed a:focus-visible, .ed [role="button"]:focus-visible {
  outline: 2px solid var(--skin-accent-ink);
  outline-offset: 3px;
}

.ed-label {
  font-size: 10.5px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--skin-muted);
}


/* ── 가운데 — 표지 ────────────────────────────────────── */
.ed-main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 0 clamp(20px, 5vw, 56px);
  background: var(--skin-background);
}

.ed-mast {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 60px;
  border-bottom: 1px solid var(--skin-line);
}

/* 모바일(패널)에서는 여는 버튼이 늘 손에 닿게 머리가 위에 붙는다 */
.ed[data-imory-sides-layout="drawer"] .ed-mast {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--skin-background);
}

.ed-mast-mark {
  grid-column: 2;
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--skin-muted);
  overflow-wrap: anywhere;
}

.ed-trigger {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--skin-text);
}

.ed-trigger--left { grid-column: 1; }
.ed-trigger--right { grid-column: 3; }

.ed-icon-lines {
  width: 18px;
  height: 1px;
  background: currentColor;
  box-shadow: 0 -5px 0 currentColor, 0 5px 0 currentColor;
}

.ed-icon-ring {
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 50%;
  box-shadow: inset 0 0 0 3px var(--skin-background), inset 0 0 0 7px currentColor;
}

.ed-cover {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(14px, 2.6vh, 26px);
  padding: clamp(24px, 5vh, 56px) 0 clamp(20px, 4vh, 44px);
  text-align: center;
}

.ed-title {
  max-width: 24ch;
  font-family: var(--ed-serif);
  font-weight: 400;
  font-size: clamp(18px, 1.2vw + 12px, 26px);
  line-height: 1.3;
  letter-spacing: 0.08em;
  overflow-wrap: anywhere;
}

.ed-title::before,
.ed-title::after {
  content: "";
  display: block;
  width: 28px;
  height: 1px;
  margin: 0 auto;
  background: var(--skin-accent);
}

.ed-title::before { margin-bottom: 14px; }
.ed-title::after { margin-top: 14px; }

.ed-photo {
  position: relative;
  width: min(100%, calc(clamp(220px, 46vh, 560px) * 0.8));
  aspect-ratio: 4 / 5;
  outline: 1px solid var(--skin-line);
  outline-offset: 10px;
  background: var(--skin-surface);
}

.ed-photo-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ed-byline {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 14px;
  color: var(--skin-muted);
  overflow-wrap: anywhere;
}

.ed-title { order: -1; }

/* 대표 사진이 없으면 제목이 표지의 주인공이 된다.
   has 선택자 대신 형제 선택자를 쓴다 — 스킨 CSS 스코프가 has 안의
   상대 선택자에도 루트 클래스를 끼워 넣어 규칙이 영영 안 맞는다
   (IMORY_SIDES_DESIGN.md 남은 차이). */
.ed-photo[hidden] + .ed-title {
  font-size: clamp(28px, 4.2vw + 8px, 52px);
  letter-spacing: 0.04em;
  padding: clamp(28px, 10vh, 120px) 0;
}

/* 카테고리 — 알약이 아니라 글자 링크. 넷 이상이면 두 줄 */
.ed-cats {
  border-top: 1px solid var(--skin-line);
  padding: 20px 0 24px;
}

.ed-cats-list {
  display: flex;
  flex-wrap: wrap;
  row-gap: 10px;
  max-width: 560px;
  margin: 0 auto;
  counter-reset: ed-cat;
}

.ed-cats-item {
  counter-increment: ed-cat;
  flex: 0 0 100%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  min-width: 0;
  padding: 0 12px;
  text-align: center;
}

/* 넷 이상이면 두 줄(수량 선택자 — 첫 항목이 끝에서 넷째 이상) */
.ed-cats-item:first-child:nth-last-child(n+4),
.ed-cats-item:first-child:nth-last-child(n+4) ~ .ed-cats-item {
  flex-basis: 50%;
}

.ed-cats-item::before {
  content: counter(ed-cat, decimal-leading-zero);
  flex: none;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--skin-accent-ink);
}

.ed-cats-link {
  min-width: 0;
  font-size: 14px;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
  border-bottom: 1px solid transparent;
}

.ed-cats-link:hover { border-bottom-color: var(--skin-accent); }

/* 목차 칼럼이 옆에 있으면 표지 아래 카테고리는 겹친다 — 숨긴다.
   모바일(패널)에서는 표지가 카테고리를 보여 준다. */
.ed[data-imory-sides-layout="columns"][data-imory-sides-on~="left"] .ed-cats { display: none; }

/* 최근 글은 오른쪽 영역이 없을 때(1단 · 왼쪽만)만 표지 아래에 */
.ed-latest { display: none; }
.ed:not([data-imory-sides-on~="right"]) .ed-latest:not([hidden]) {
  display: block;
  border-top: 1px solid var(--skin-line);
  padding: 24px 0 8px;
}

.ed-foot {
  margin-top: auto;
  padding: 22px 0 28px;
  border-top: 1px solid var(--skin-line);
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--skin-muted);
  overflow-wrap: anywhere;
}


/* ── 목록(최근 글 · 카테고리 글) ─────────────────────────── */
.ed-list { counter-reset: ed-item; margin-top: 12px; }

.ed-list-item {
  counter-increment: ed-item;
  border-top: 1px solid var(--skin-line);
}

.ed-list-link {
  display: grid;
  grid-template-columns: 2.2em minmax(0, 1fr);
  column-gap: 8px;
  padding: 11px 0;
}

.ed-list-link::before {
  content: counter(ed-item, decimal-leading-zero);
  grid-row: 1 / span 2;
  padding-top: 3px;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--skin-accent-ink);
}

.ed-list-title {
  font-family: var(--ed-serif);
  font-size: 15px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.ed-list-date {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--skin-muted);
}

.ed-list-link:hover .ed-list-title { color: var(--skin-accent-ink); }


/* ── 좌우 영역 ───────────────────────────────────────── */
.ed-side {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 20px 24px 40px;
  background: var(--skin-surface);
  font-size: 13.5px;
}

.ed-side--left { border-right: 1px solid var(--skin-line); }
.ed-side--right { border-left: 1px solid var(--skin-line); }

.ed-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--skin-line);
}

/* 칼럼일 때는 닫기가 없으니 머리선을 이름표가 갖는다 — 이름표가
   사라지면(글 없는 빈 홈) 선도 함께 사라져 빈 칸은 여백이 된다 */
.ed[data-imory-sides-layout="columns"] .ed-side-head {
  display: block;
  min-height: 0;
  padding-bottom: 0;
  border-bottom: 0;
}

.ed[data-imory-sides-layout="columns"] .ed-side-head > .ed-label {
  padding: 12px 0;
  border-bottom: 1px solid var(--skin-line);
}

.ed-close {
  position: relative;
  width: 44px;
  height: 44px;
  margin: -8px -12px -8px auto;
  cursor: pointer;
  color: var(--skin-text);
}

.ed-close::before,
.ed-close::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 1px;
  background: currentColor;
  transform: translate(-50%, -50%) rotate(45deg);
}

.ed-close::after { transform: translate(-50%, -50%) rotate(-45deg); }

.ed-toc { display: flex; flex-direction: column; gap: 14px; }

.ed-toc-home {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 15px;
}

.ed-toc-list { counter-reset: ed-toc; }

.ed-toc-item {
  counter-increment: ed-toc;
  display: grid;
  grid-template-columns: 2.2em minmax(0, 1fr);
  column-gap: 8px;
  padding: 9px 0;
  border-top: 1px solid var(--skin-line);
}

.ed-toc-item::before {
  content: counter(ed-toc, decimal-leading-zero);
  padding-top: 3px;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--skin-accent-ink);
}

.ed-toc-link {
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ed-toc-link:hover { color: var(--skin-accent-ink); }

.ed-side-foot {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--skin-line);
  font-size: 10.5px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.ed-side-foot-link { color: var(--skin-muted); }

/* 하이라이트 링크는 한 번만 — 왼쪽 영역이 있으면 그쪽에 */
.ed[data-imory-sides-on~="left"] > .ed-side--right .ed-side-foot { display: none; }
.ed-side-foot-link:hover { color: var(--skin-accent-ink); }

.ed-profile { display: flex; flex-direction: column; gap: 6px; }

.ed-avatar {
  width: 64px;
  height: 80px;
  object-fit: cover;
  margin-bottom: 6px;
  outline: 1px solid var(--skin-line);
  outline-offset: 4px;
}

.ed-profile-name {
  font-family: var(--ed-serif);
  font-size: 17px;
  overflow-wrap: anywhere;
}

.ed-profile-bio {
  color: var(--skin-muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.ed-quote-card {
  margin-top: 12px;
  padding-left: 14px;
  border-left: 2px solid var(--imory-color, var(--skin-accent));
}

.ed-quote-text {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 14.5px;
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.ed-quote-source {
  margin-top: 8px;
  font-size: 11px;
  color: var(--skin-muted);
  overflow-wrap: anywhere;
}

/* 모바일 패널 — 바탕은 종이 그대로, 옆 그림자 하나 */
.ed[data-imory-sides-layout="drawer"] > .ed-side {
  background: var(--skin-background);
  box-shadow: 0 0 48px color-mix(in srgb, var(--skin-text) 16%, transparent);
}


/* ── CATEGORY / POST ────────────────────────────────── */
.ed-page { padding: 0 clamp(20px, 5vw, 56px) 64px; }

.ed-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 720px;
  min-height: 60px;
  margin: 0 auto;
  border-bottom: 1px solid var(--skin-line);
  font-size: 10.5px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

.ed-page-home { overflow-wrap: anywhere; }
.ed-page-back, .ed-page-edit { color: var(--skin-muted); }

.ed-page-main { max-width: 720px; margin: 0 auto; padding-top: clamp(32px, 6vw, 64px); }

.ed-page-title {
  font-family: var(--ed-serif);
  font-weight: 400;
  font-size: clamp(24px, 2vw + 16px, 36px);
  line-height: 1.3;
  text-align: center;
  overflow-wrap: anywhere;
}

.ed-page-list { margin-top: 32px; }

.ed-article-date {
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--skin-muted);
}

.ed-article-body { margin-top: 40px; }
`.trim() + "\n";


const skinPackage = {
  schemaVersion: 1,
  templates: {
    home: { html: home },
    category: { html: category },
    post: { html: post }
  },
  css,
  imageSlots: [
    { name: "cover", label: "대표 사진", required: false, aspectRatioHint: "4:5" }
  ],
  regions: [
    { name: "left_sidebar", enabled: true },
    { name: "right_sidebar", enabled: true }
  ],
  metadata: {
    title: "Imory Editorial Home v1",
    generatedBy: "manual",
    supports: { home: true, category: true, post: true }
  }
};


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(here, "imory-editorial-home-v1.json");
  fs.writeFileSync(out, JSON.stringify(skinPackage, null, 2) + "\n");
  console.log("wrote", path.relative(process.cwd(), out));
}

export default skinPackage;
