/* =========================================================
   imory-bottom-dock-v1.json 만들기

     node skin/test-skins/build-bottom-dock-v1.mjs

   왜 빌더가 있나 — 이 스킨의 값어치는 **dock 하나**에 있는데,
   그것을 JSON 문자열 안의 이스케이프된 HTML/CSS 로 직접 적으면
   읽을 수도 고칠 수도 없다. 다른 fixture 빌더들과 같은 이유다
   (build-gallery-grid-v1.mjs · build-sandbox-screens-v1.mjs).

   이 파일은 "디자이너에게 보여 주는 예시"다 — 플랫폼 코드가
   참조하지 않는다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));


/* =========================================================
   dock — 작은 오브젝트들이 모여 있는 느낌

   아이콘 모양이 서로 다르다(동그라미 · 네모 · 겹친 네모 · 선).
   같은 크기의 rounded square 를 줄세우지 않는 것이 이 예시의
   핵심이다 — data-imory-kind 로 온 종류 토큰마다 CSS 가 다르게
   그린다.
========================================================== */

const DOCK_HTML = `
<nav class="bd-dock" aria-label="바로가기">

  <span class="bd-dock-trigger" data-imory-dock="trigger"
        data-imory-if="dock.collapsible"
        data-imory-bind="dock.trigger.text"></span>

  <ul class="bd-dock-items" data-imory-dock="items">

    <li class="bd-dock-item" data-imory-repeat="dock.items">

      <a class="bd-dock-link"
         data-imory-href="item.href"
         data-imory-kind="item.visual.iconKind">

        <span class="bd-dock-mark"
              data-imory-if="item.visual.hasText"
              data-imory-bind="item.visual.text"></span>

        <img class="bd-dock-photo"
             data-imory-if="item.visual.isImage"
             data-imory-src="item.visual.imageUrl" alt="">

        <span class="bd-dock-label"
              data-imory-if="item.hasLabel"
              data-imory-bind="item.label"></span>

      </a>

    </li>

  </ul>

  <!--
    open 항목(action: panel:about)이 여는 자리.
    플랫폼은 dock 루트의 data-imory-dock-open 만 바꾸고,
    무엇이 어떻게 보이는지는 아래 CSS 가 정한다.
  -->
  <div class="bd-dock-panel">
    <p class="bd-dock-panel-line" data-imory-bind="profile.nickname"></p>
    <p class="bd-dock-panel-bio" data-imory-if="profile.bio" data-imory-bind="profile.bio"></p>
  </div>

</nav>
`.trim();


const HOME_HTML = `
<div class="bd-page">
  <header class="bd-head">
    <h1 class="bd-title" data-imory-bind="site.title"></h1>
    <p class="bd-nick" data-imory-bind="profile.nickname"></p>
    <span data-imory-region="owner-tools"></span>
  </header>

  <nav class="bd-nav">
    <a class="bd-nav-link" data-imory-repeat="navigation.categories"
       data-imory-kind="item.iconKind"
       data-imory-href="item.href" data-imory-bind="item.name"></a>
  </nav>

  <ol class="bd-list">
    <li class="bd-list-item" data-imory-repeat="home.recentPosts">
      <a class="bd-list-link" data-imory-href="item.href" data-imory-bind="item.title"></a>
      <span class="bd-date" data-imory-bind="item.publishedAtLabel"></span>
    </li>
  </ol>
</div>
`.trim();


const CATEGORY_HTML = `
<div class="bd-page">
  <header class="bd-head">
    <h1 class="bd-title" data-imory-bind="category.name"></h1>
    <span data-imory-region="owner-tools"></span>
  </header>

  <ol class="bd-list" data-imory-if="category.showPostsList">
    <li class="bd-list-item" data-imory-repeat="category.posts">
      <a class="bd-list-link" data-imory-href="item.href" data-imory-bind="item.title"></a>
      <span class="bd-date" data-imory-bind="item.publishedAtLabel"></span>
    </li>
  </ol>

  <ul class="bd-tree" data-imory-if="category.hasFolders">
    <li class="bd-tree-node" data-imory-repeat="category.tree">
      <a class="bd-tree-folder" data-imory-if="item.folderHref"
         data-imory-href="item.folderHref" data-imory-bind="item.name"></a>
      <a class="bd-list-link" data-imory-if="item.href"
         data-imory-href="item.href" data-imory-bind="item.title"></a>
    </li>
  </ul>

  <nav class="bd-pages" data-imory-if="category.pagination.hasPages">
    <a class="bd-page-link" data-imory-repeat="category.pagination.pages"
       data-imory-href="item.href" data-imory-bind="item.label"></a>
  </nav>

  <!--
    ★ 흐름 dock 을 여기 두겠다는 표시. 스킨이 이 자리를 그려 두면
    플랫폼이 자기 자리를 만들지 않고 여기에 넣는다(fixed 일 때는
    무시된다 — 그때는 뷰포트에 고정되는 자리가 따로 있다).
  -->
  <div class="bd-dock-slot" data-imory-region="bottom-dock"></div>
</div>
`.trim();


const POST_HTML = `
<div class="bd-page">
  <header class="bd-head">
    <a class="bd-back" data-imory-if="post.categoryHref"
       data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a>
    <span data-imory-region="owner-tools"></span>
  </header>

  <h1 class="bd-title" data-imory-bind="post.title"></h1>
  <p class="bd-date" data-imory-bind="post.publishedAtLabel"></p>

  <div class="bd-body" data-imory-region="post-body"></div>
</div>
`.trim();


const CSS = `
/* ── 페이지 ─────────────────────────────────────────── */

.bd-page {
  --bd-ink: #3a3538;
  --bd-quiet: #9b9296;
  --bd-line: #ece7e8;
  --bd-accent: #d9a7b4;

  max-width: 640px;
  margin: 0 auto;
  padding: 28px 20px;

  color: var(--bd-ink);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.75;
}

.bd-head {
  display: flex;
  align-items: center;
  gap: 10px;

  padding-bottom: 14px;
  margin-bottom: 18px;

  border-bottom: 1px solid var(--bd-line);
}

.bd-title { flex: 1 1 auto; margin: 0; font-size: 19px; letter-spacing: 0.06em; }
.bd-nick  { margin: 0; font-size: 12px; color: var(--bd-quiet); }
.bd-date  { font-size: 11px; color: var(--bd-quiet); }
.bd-back  { font-size: 12px; color: var(--bd-quiet); text-decoration: none; }

.bd-nav { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }

.bd-nav-link {
  font-size: 12px;
  color: var(--bd-ink);
  text-decoration: none;
  padding-left: 16px;
  position: relative;
}

/* 종류마다 다른 표식 — 순서가 아니라 data-kind 로 (재료 일치 계약) */
.bd-nav-link::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 7px;
  height: 7px;
  background: var(--bd-accent);
}
.bd-nav-link[data-kind="document"]::before { border-radius: 1px; }
.bd-nav-link[data-kind="image"]::before    { border-radius: 50%; }
.bd-nav-link[data-kind="quote"]::before    { width: 2px; height: 11px; top: 0.4em; }
.bd-nav-link[data-kind="link"]::before     { height: 2px; width: 11px; top: 0.85em; }

.bd-list, .bd-tree { list-style: none; margin: 0 0 24px; padding: 0; }

.bd-list-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px dotted var(--bd-line);
}

.bd-list-link, .bd-tree-folder {
  color: var(--bd-ink);
  text-decoration: none;
  font-size: 14px;
}

.bd-pages { display: flex; gap: 10px; }
.bd-page-link { font-size: 12px; color: var(--bd-quiet); text-decoration: none; }

.bd-body { margin-top: 18px; }

[hidden] { display: none !important; }


/* ── dock ───────────────────────────────────────────────

   작은 오브젝트들이 모여 있는 느낌. 같은 크기의 네모를 줄세우지
   않는다 — 종류마다 표식의 모양이 다르고, 아래로 갈수록 여백이
   넉넉하다. 순검정은 쓰지 않는다.
──────────────────────────────────────────────────────── */

.bd-dock {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 14px;

  padding: 10px 16px 14px;

  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

.bd-dock-items {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 20px;

  list-style: none;
  margin: 0;
  padding: 0;
}

.bd-dock-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;

  text-decoration: none;
  color: #7e7579;

  font-size: 10px;
  letter-spacing: 0.1em;
}

.bd-dock-mark { font-size: 15px; line-height: 1; }
.bd-dock-mark:empty { display: none; }

.bd-dock-photo { width: 20px; height: 20px; object-fit: contain; }

/* 종류마다 다른 오브젝트 — 하나도 같은 모양이 아니다 */
.bd-dock-link::before {
  content: "";
  width: 16px;
  height: 16px;
  border: 1px solid #c9bfc3;
}
.bd-dock-link[data-kind="home"]::before   { border-radius: 0; transform: rotate(45deg); width: 12px; height: 12px; }
.bd-dock-link[data-kind="camera"]::before { border-radius: 4px; }
.bd-dock-link[data-kind="quote"]::before  { border: none; border-left: 2px solid #c9bfc3; height: 15px; width: 6px; }
.bd-dock-link[data-kind="note"]::before   { border-radius: 2px 8px 2px 2px; }
.bd-dock-link[data-kind="heart"]::before  { border: none; }

/* 그림이 글자/사진으로 오는 항목에는 표식을 그리지 않는다 */
.bd-dock-link:not([data-kind])::before { display: none; }

.bd-dock-trigger {
  font-size: 15px;
  line-height: 1;
  color: var(--bd-accent, #d9a7b4);
}


/* 접힘 — 전환은 플랫폼의 공용 primitive 를 쓴다(transition: fade) */

:root[data-imory-dock-state="collapsed"] .bd-dock-items {
  /* 플랫폼 CSS 가 opacity 를 다루므로 여기서는 자리만 줄인다 */
  gap: 0;
}


/* 패널 — open 항목이 여는 자리 */

.bd-dock-panel {
  display: none;

  max-width: 240px;
  padding: 10px 12px;

  font-size: 12px;
  line-height: 1.7;
  color: #6f676a;

  background: #fdfbfb;
  border: 1px solid #ece7e8;
  border-radius: 10px;
}

:root[data-imory-dock-open="about"] .bd-dock-panel { display: block; }

.bd-dock-panel-line { margin: 0; }
.bd-dock-panel-bio  { margin: 4px 0 0; color: #a49a9e; }


/* fixed 로 놓였을 때만 바닥에서 살짝 띄운다 */

:root[data-imory-dock-position="fixed"] .bd-dock {
  background: rgba(253, 251, 251, 0.92);
  border-top: 1px solid #f0ebec;
}

/* 흐름 안에 놓였을 때는 배경도 선도 없다 */

:root[data-imory-dock-position="static"] .bd-dock,
:root[data-imory-dock-position="sticky"] .bd-dock {
  background: transparent;
  border-top: 1px dotted #ece7e8;
}


@media (max-width: 480px) {
  .bd-page { padding: 20px 16px; }
  .bd-title { font-size: 17px; }
  .bd-dock-items { gap: 14px; }
}
`.trim();


const skin = {
  schemaVersion: 1,

  templates: {
    home: { html: HOME_HTML },
    category: { html: CATEGORY_HTML },
    post: { html: POST_HTML },
    dock: { html: DOCK_HTML }
  },

  css: CSS,

  bottomDock: {
    visible: true,

    /* 이 스킨의 HOME 은 짧고 CATEGORY 는 길다 — auto 가 화면마다 알아서 고른다 */
    position: "auto",

    collapsible: true,
    defaultState: "expanded",
    transition: "fade",

    trigger: { type: "emoji", value: "♡", label: "메뉴 열기" },

    items: [
      { id: "home", label: "home", audience: "all", visual: { type: "icon", value: "home" }, action: { type: "navigate", target: "home" } },
      { id: "gallery", label: "photo", audience: "all", visual: { type: "icon", value: "camera" }, action: { type: "navigate", target: "gallery" } },
      { id: "quotes", label: "quotes", audience: "all", visual: { type: "icon", value: "quote" }, action: { type: "navigate", target: "highlights" } },
      { id: "about", label: "about", audience: "all", visual: { type: "icon", value: "note" }, action: { type: "open", target: "panel:about" } },
      { id: "write", label: "write", audience: "owner", visual: { type: "text", value: "＋" }, action: { type: "action", target: "write" } }
    ]
  },

  imageSlots: [],
  regions: [],

  metadata: {
    title: "Imory Bottom Dock v1",
    description:
      "BOTTOM-DOCK-1 예시 스킨. dock 이 어떻게 '작은 오브젝트들이 모여 있는' 모습이 될 수 있는지 보여 준다 — " +
      "종류마다 표식의 모양이 다르고(data-imory-kind → [data-kind]), 접으면 하트 하나만 남고, " +
      "about 항목은 dock 안의 패널을 연다([data-imory-dock-open]). CATEGORY 에는 흐름 dock 자리를 " +
      "직접 그려 두었다(data-imory-region=\"bottom-dock\")."
  }
};


const out =
  path.join(HERE, "imory-bottom-dock-v1.json");

fs.writeFileSync(out, JSON.stringify(skin, null, 2) + "\n", "utf8");

console.log(`wrote ${out}`);
