/* =========================================================
   imory-gallery-grid-v1.json 생성기 (GALLERY-1 샘플 스킨)

   JSON 안에 HTML/CSS를 한 줄 문자열로 밀어 넣는 대신, 읽을 수
   있는 형태로 여기에 두고 빌드한다. 기준 문서: IMORY_GALLERY1_DESIGN.md §6

     node skin/test-skins/build-gallery-grid-v1.mjs
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));


/* =========================================================
   공통 조각
========================================================== */

const header = `
<header class="gg-bar">
  <a class="gg-brand" data-imory-href="navigation.home.href" data-imory-bind="site.title"></a>
  <nav class="gg-nav">
    <a class="gg-nav-item" data-imory-repeat="navigation.postCategories" data-imory-href="item.href" data-imory-bind="item.name"></a>
  </nav>
</header>`;

const ownerTools = `
<p class="gg-owner" data-imory-if="viewer.isOwner">
  <a class="gg-owner-link" data-imory-if="viewer.writeHref" data-imory-href="viewer.writeHref">WRITE</a>
  <a class="gg-owner-link" data-imory-if="viewer.manageHref" data-imory-href="viewer.manageHref">EDIT</a>
</p>`;


/* =========================================================
   HOME
========================================================== */

const home = `
<div class="gg-page">
  ${header}
  <main class="gg-main">
    <section class="gg-profile">
      <img class="gg-avatar" data-imory-src="profile.avatarUrl" alt="">
      <div>
        <h1 class="gg-name" data-imory-bind="profile.nickname"></h1>
        <p class="gg-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>
      </div>
      ${ownerTools}
    </section>

    <section class="gg-section">
      <h2 class="gg-section-title">RECENT</h2>
      <ul class="gg-list">
        <li class="gg-list-item" data-imory-repeat="home.recentPosts">
          <a class="gg-list-link" data-imory-href="item.href">
            <span class="gg-list-title" data-imory-bind="item.title"></span>
            <small class="gg-list-date" data-imory-bind="item.publishedAtLabel"></small>
          </a>
        </li>
      </ul>
    </section>
  </main>
</div>`;


/* =========================================================
   CATEGORY — 목록과 갤러리를 함께 갖는다

   category.isList / category.isGallery 중 하나만 참이므로 둘 중
   한 영역만 그려진다. 갤러리 카테고리라도 이 스킨이 아니라면
   플랫폼이 갤러리 모드를 켜지 않으므로(기준 문서 §4) 다른 스킨의
   화면은 전혀 영향받지 않는다.

   ★ 폴더 영역과 카드 영역의 경계
     갤러리 모드에서 category.tree에는 **폴더 노드만** 들어 있고
     (root의 글은 카드 영역이 담당한다) 카드 영역에는 root의 direct
     글만 들어 있다 — 같은 글이 두 군데 나올 수 없다.
     목록 모드에서는 지금까지처럼 tree에 글 가지도 함께 있다.

   ★ 사진 없음 / 로드 실패
     .gg-thumb 안에 대체 표시(.gg-thumb-fallback)를 항상 깔고 그
     위에 <img>를 얹는다. item.hasThumbnail이 false면 img 자체가
     접히고(대체 표시가 그대로 보인다), 이미지 주소는 있는데 로드에
     실패하면 img가 빈 상자로 남아 뒤의 대체 표시가 그대로 비친다.
     스킨 HTML에는 스크립트를 쓸 수 없으므로 onerror 대신 이 구조로
     해결한다.
========================================================== */

const galleryCard = `
<li class="gg-card" data-imory-repeat="category.gallery.cards">
  <a class="gg-card-link" data-imory-href="item.href">
    <span class="gg-thumb">
      <span class="gg-thumb-fallback"><span class="gg-thumb-mark"></span></span>
      <img class="gg-thumb-img" data-imory-if="item.hasThumbnail" data-imory-src="item.thumbnailUrl" alt="">
      <span class="gg-lock" data-imory-if="item.isLocked">LOCKED</span>
    </span>
    <span class="gg-card-title" data-imory-bind="item.title"></span>
  </a>
</li>`;

const pager = `
<nav class="gg-pager" data-imory-if="category.pagination.hasPages">
  <a class="gg-pager-edge" data-imory-if="category.pagination.hasPrev" data-imory-href="category.pagination.prevHref">PREV</a>
  <span class="gg-pager-nums">
    <span class="gg-pager-slot" data-imory-repeat="category.pagination.pages">
      <a class="gg-pager-num" data-imory-href="item.href" data-imory-bind="item.label"></a>
      <span class="gg-pager-dot" data-imory-if="item.isCurrent"></span>
    </span>
  </span>
  <a class="gg-pager-edge" data-imory-if="category.pagination.hasNext" data-imory-href="category.pagination.nextHref">NEXT</a>
</nav>`;

const folderStrip = `
<section class="gg-folders" data-imory-if="category.hasFolders">
  <div class="gg-folder" data-imory-repeat="category.tree">
    <span class="gg-folder-card" data-imory-if="item.name">
      <span class="gg-folder-name" data-imory-bind="item.name"></span>
      <a class="gg-folder-open" data-imory-if="item.folderHref" data-imory-href="item.folderHref">OPEN</a>
    </span>
  </div>
</section>`;

const category = `
<div class="gg-page">
  ${header}
  <main class="gg-main">
    <div class="gg-head-row">
      <h1 class="gg-title" data-imory-bind="category.name"></h1>
      ${ownerTools}
    </div>

    ${folderStrip}

    <section class="gg-gallery" data-imory-if="category.isGallery">
      <ul class="gg-grid">${galleryCard}</ul>
      <p class="gg-empty" data-imory-if="category.gallery.isEmpty">아직 글이 없습니다.</p>
      ${pager}
    </section>

    <section class="gg-listing" data-imory-if="category.isList">
      <ul class="gg-list">
        <li class="gg-list-item" data-imory-repeat="category.posts">
          <a class="gg-list-link" data-imory-href="item.href">
            <span class="gg-list-title" data-imory-bind="item.title"></span>
            <small class="gg-list-date" data-imory-bind="item.publishedAtLabel"></small>
          </a>
        </li>
      </ul>
    </section>
  </main>
</div>`;


/* =========================================================
   POST / BANNER / FOLDER — 갤러리와 직접 관계는 없지만, 샘플
   스킨 하나로 전체 동선(카드 → 글 → 뒤로)을 확인할 수 있어야
   하므로 최소 형태로 함께 둔다.
========================================================== */

const post = `
<div class="gg-page">
  ${header}
  <main class="gg-main gg-main--post">
    <p class="gg-crumb"><a data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a></p>
    <h1 class="gg-title" data-imory-bind="post.title"></h1>
    <p class="gg-post-date" data-imory-bind="post.publishedAtLabel"></p>
    ${ownerTools}
    <article class="gg-post-body" data-imory-region="post-body"></article>
  </main>
</div>`;

const banner = `
<div class="gg-page">
  ${header}
  <main class="gg-main">
    <h1 class="gg-title" data-imory-bind="bannerCategory.name"></h1>
    <ul class="gg-grid">
      <li class="gg-card" data-imory-repeat="bannerCategory.items">
        <a class="gg-card-link" data-imory-href="item.linkUrl">
          <span class="gg-thumb">
            <span class="gg-thumb-fallback"><span class="gg-thumb-mark"></span></span>
            <img class="gg-thumb-img" data-imory-src="item.imageUrl" alt="">
          </span>
          <span class="gg-card-title" data-imory-bind="item.title"></span>
        </a>
      </li>
    </ul>
  </main>
</div>`;

const folder = `
<div class="gg-page">
  ${header}
  <main class="gg-main">
    <p class="gg-crumb"><a data-imory-href="folder.parentHref">← BACK</a></p>
    <h1 class="gg-title" data-imory-bind="folder.name"></h1>
    <p class="gg-owner">
      <a class="gg-owner-link" data-imory-if="folder.isList" data-imory-href="folder.seriesHref">이어읽기</a>
      <a class="gg-owner-link" data-imory-if="folder.isSeries" data-imory-href="folder.listHref">목록</a>
    </p>

    <ul class="gg-list" data-imory-if="folder.isList">
      <li class="gg-list-item" data-imory-repeat="folder.posts">
        <a class="gg-list-link" data-imory-href="item.href">
          <span class="gg-list-title" data-imory-bind="item.title"></span>
          <small class="gg-list-date" data-imory-bind="item.publishedAtLabel"></small>
        </a>
      </li>
    </ul>

    <div class="gg-series" data-imory-if="folder.isSeries">
      <article class="gg-series-item" data-imory-repeat="folder.posts">
        <h2 class="gg-series-title" data-imory-bind="item.title"></h2>
        <div class="gg-post-body" data-imory-region="post-body"></div>
      </article>
    </div>
  </main>
</div>`;


/* =========================================================
   CSS

   ★ 열 수·비율·간격·제목 표시는 전부 이 CSS의 값 하나씩이다
     (요구사항 4절 "디자인은 스킨 HTML/CSS에서 바꿀 수 있게"):
       --gg-cols       데스크톱 열 수 (기본 3)
       --gg-cols-sm    모바일 열 수 (기본 2)
       --gg-ratio      썸네일 비율 (기본 1 = 정사각)
       --gg-gap        카드 간격
       .gg-card-title  제목 줄 (display:none으로 감추면 사진만 남는다)
========================================================== */

const css = `
.gg-page { --gg-cols: 3; --gg-cols-sm: 2; --gg-ratio: 1; --gg-gap: 14px; --gg-ink: #33323a; --gg-muted: #8d8a92; --gg-line: #e8e5e8; min-height: 100%; padding: 42px 20px 64px; background: #fff; color: var(--gg-ink); font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; font-size: 13px; line-height: 1.6; letter-spacing: -0.01em; }
.gg-page *, .gg-page *::before, .gg-page *::after { box-sizing: border-box; }
.gg-page a { color: inherit; text-decoration: none; }

.gg-bar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 18px; width: min(900px, 100%); margin: 0 auto 30px; padding-bottom: 14px; border-bottom: 1px solid var(--gg-line); }
.gg-brand { font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
.gg-nav { display: flex; flex-wrap: wrap; gap: 12px; }
.gg-nav-item { font-size: 11px; letter-spacing: 0.08em; color: var(--gg-muted); }
.gg-nav-item:hover { color: var(--gg-ink); }

.gg-main { width: min(900px, 100%); margin: 0 auto; }
.gg-main--post { width: min(680px, 100%); }

.gg-head-row { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 18px; }
.gg-title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.01em; }
.gg-crumb { margin: 0 0 10px; font-size: 11px; letter-spacing: 0.06em; color: var(--gg-muted); }
.gg-post-date { margin: 0 0 18px; font-size: 11px; color: var(--gg-muted); }

.gg-owner { display: flex; gap: 10px; margin: 0; }
.gg-owner-link { font-size: 10px; letter-spacing: 0.12em; color: var(--gg-muted); }
.gg-owner-link:hover { color: var(--gg-ink); }

.gg-profile { display: flex; align-items: center; gap: 14px; margin-bottom: 30px; }
.gg-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: #f2f0f2; }
.gg-name { margin: 0; font-size: 16px; font-weight: 600; }
.gg-bio { margin: 2px 0 0; font-size: 12px; color: var(--gg-muted); }

.gg-section { margin-top: 26px; }
.gg-section-title { margin: 0 0 10px; font-size: 10px; letter-spacing: 0.14em; color: var(--gg-muted); }

.gg-folders { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.gg-folder { display: contents; }
.gg-folder-card { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--gg-line); border-radius: 999px; font-size: 11px; }
.gg-folder-name { letter-spacing: 0.02em; }
.gg-folder-open { font-size: 9px; letter-spacing: 0.1em; color: var(--gg-muted); }

.gg-grid { display: grid; grid-template-columns: repeat(var(--gg-cols), minmax(0, 1fr)); gap: var(--gg-gap); margin: 0; padding: 0; list-style: none; }
.gg-card { min-width: 0; }
.gg-card-link { display: block; min-width: 0; }
.gg-thumb { position: relative; display: block; width: 100%; aspect-ratio: var(--gg-ratio); overflow: hidden; border: 1px solid var(--gg-line); border-radius: 4px; background: #f7f6f7; }
.gg-thumb-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: repeating-linear-gradient(135deg, #f7f6f7 0 8px, #f1eff1 8px 16px); }
.gg-thumb-mark { display: block; width: 18px; height: 18px; border: 1px solid #d6d2d6; border-radius: 3px; }
.gg-thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.gg-thumb-img[hidden] { display: none; }
.gg-lock { position: absolute; right: 6px; bottom: 6px; padding: 2px 6px; border-radius: 999px; background: rgba(41, 39, 44, .74); color: #fff; font-size: 8px; letter-spacing: 0.12em; }
.gg-lock[hidden] { display: none; }
.gg-card-title { display: block; margin-top: 7px; overflow: hidden; font-size: 11px; line-height: 1.45; white-space: nowrap; text-overflow: ellipsis; color: var(--gg-ink); }

.gg-empty { margin: 26px 0; font-size: 12px; text-align: center; color: var(--gg-muted); }
.gg-empty[hidden] { display: none; }

.gg-pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin-top: 28px; }
.gg-pager[hidden] { display: none; }
.gg-pager-nums { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.gg-pager-slot { position: relative; display: flex; flex-direction: column; align-items: center; }
.gg-pager-dot { display: block; width: 3px; height: 3px; margin-top: 1px; border-radius: 50%; background: var(--gg-ink); }
.gg-pager-dot[hidden] { display: none; }
.gg-pager-num { min-width: 24px; padding: 4px 6px; border: 1px solid transparent; border-radius: 4px; font-size: 11px; text-align: center; color: var(--gg-muted); }
.gg-pager-num:hover { border-color: var(--gg-line); color: var(--gg-ink); }
.gg-pager-edge { font-size: 9px; letter-spacing: 0.12em; color: var(--gg-muted); }
.gg-pager-edge[hidden] { display: none; }

.gg-list { margin: 0; padding: 0; list-style: none; }
.gg-list-item { border-bottom: 1px solid var(--gg-line); }
.gg-list-link { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 2px; }
.gg-list-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.gg-list-date { flex: 0 0 auto; font-size: 10px; color: var(--gg-muted); }

.gg-post-body { margin-top: 18px; font-size: 13px; line-height: 1.85; }
.gg-series-item { padding-bottom: 26px; border-bottom: 1px solid var(--gg-line); }
.gg-series-title { margin: 22px 0 0; font-size: 15px; font-weight: 600; }

.gg-gallery[hidden], .gg-listing[hidden], .gg-folders[hidden], .gg-owner[hidden], .gg-series[hidden] { display: none; }

@media (max-width: 640px) {
  .gg-page { padding: 26px 14px 48px; }
  .gg-grid { grid-template-columns: repeat(var(--gg-cols-sm), minmax(0, 1fr)); }
  .gg-title { font-size: 17px; }
}
`;


/* =========================================================
   조립
========================================================== */

const oneLine = (value) =>
  value
    .replace(/\n\s*/g, "")
    .trim();


const skin = {

  schemaVersion: 1,

  templates: {
    home: { html: oneLine(home) },
    category: { html: oneLine(category) },
    post: { html: oneLine(post) },
    banner: { html: oneLine(banner) },
    folder: { html: oneLine(folder) }
  },

  css:
    css
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n"),

  imageSlots: [
    {
      name: "profile",
      label: "프로필 사진",
      required: false,
      aspectRatioHint: "1:1"
    }
  ],

  regions: [],

  metadata: {
    title: "Imory Gallery Grid v1",
    generatedBy: "manual",
    supports: {
      home: true,
      category: true,
      post: true,
      banner: true,
      folder: true
    },
    requiredContext: [
      "site.title",
      "profile.nickname",
      "profile.bio",
      "profile.avatarUrl",
      "navigation.home.href",
      "navigation.postCategories",
      "viewer.isOwner",
      "viewer.writeHref",
      "viewer.manageHref",
      "home.recentPosts",
      "category.name",
      "category.posts",
      "category.tree",
      "category.hasFolders",
      "category.isGallery",
      "category.isList",
      "category.gallery.cards",
      "category.gallery.isEmpty",
      "category.pagination.pages",
      "category.pagination.hasPages",
      "category.pagination.hasPrev",
      "category.pagination.hasNext",
      "post.title",
      "post.publishedAtLabel",
      "post.categoryName",
      "post.categoryHref",
      "bannerCategory.name",
      "bannerCategory.items",
      "folder.name",
      "folder.posts",
      "folder.parentHref",
      "folder.isList",
      "folder.isSeries",
      "folder.listHref",
      "folder.seriesHref"
    ]
  }

};


fs.writeFileSync(
  path.join(HERE, "imory-gallery-grid-v1.json"),
  JSON.stringify(skin, null, 2) + "\n",
  "utf8"
);

console.log("imory-gallery-grid-v1.json written");
