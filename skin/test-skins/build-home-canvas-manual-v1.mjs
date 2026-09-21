/* =========================================================
   imory-home-canvas-manual-v1.json 생성기
   (HOME-CANVAS-MILESTONE-1 수동 테스트 스킨)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

     node skin/test-skins/build-home-canvas-manual-v1.mjs

   ★ 이 스킨은 제품 기본 스킨도 사용자용 preset 도 아니다.

   HOME 캔버스의 **기본 조작을 손으로 확인하기 위한 도구**다. 기본
   스킨을 바꾸지 않고, 가입할 때 자동으로 붙지 않고, 기존 계정을
   migration 하지 않는다 — 주인이 Studio 에서 직접 Import 해야만
   쓰이고, Publish 도 직접 해야 한다. metadata.title 에 그 사실을
   적어 두어 목록에서 제품 스킨과 섞이지 않게 한다.

   ── 왜 이 파일이 필요한가 ──────────────────────────────
   지금 Studio 에는 **Canvas 를 새로 만들거나 요소를 추가하는 UI 가
   없다**(로드맵의 `ELEMENTS-1` 이 아직 없다). 구현된 것은 이미
   있는 요소를 고르고 · 옮기고 · 크기를 바꾸고 · 돌리는 것까지다.
   그래서 `home_canvas` 와 표시 위치를 **이미 갖고 있는** 파일이
   없으면 배포된 화면에서 그 기능을 손으로 시험할 방법이 없다.

   ── 왜 JSON 을 손으로 관리하지 않는가 ──────────────────
   저장소의 다른 test-skin 과 같은 이유다. HTML·CSS 를 한 줄
   문자열로 밀어 넣은 JSON 은 읽을 수도 고칠 수도 없다. 읽을 수
   있는 형태를 여기 두고 빌드해서, 같은 입력이면 같은 JSON 이
   다시 나오게 한다.

   ── 이미지 ─────────────────────────────────────────────
   저장소에 그림을 **넣지 않는다**. photo · sticker · logo 는 기존
   이미지 슬롯 계약만 선언하고 비워 둔다 — 주인이 Studio Images
   에서 자기 그림을 넣는다. 슬롯이 비어도 wrapper 는 남으므로
   (계약 §12-4) 선택 · 이동 · 리사이즈 · 회전은 그림 없이도 전부
   확인할 수 있다. 자동 테스트는 SVG fixture 를 실행 중에만 만든다.

   ── 디자인 ─────────────────────────────────────────────
   예쁘게 만드는 파일이 아니다. 각 요소의 자리 · 경계 · 앞뒤 순서 ·
   auto 높이 · object-fit · 링크가 **눈으로 구분되는** 최소 스타일만
   둔다. 흰 바탕 · 짙은 회흑색 글자 · 차가운 남색 포인트 · 얇은 선.
   플랫폼 편집 손잡이와 부딪히는 전역 선택자 · 과도한 !important ·
   전체 transform 덮어쓰기는 쓰지 않는다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));


/* =========================================================
   Canvas 요소

   ★ 배열 순서가 곧 앞뒤 순서다(계약 §4 — z 필드가 없다). 잠긴
     배경이 맨 앞에 와서 맨 뒤에 깔린다.

   좌표는 전부 390 × 844 기준이다.

   무엇을 손으로 확인하려고 그 요소를 넣었는가:

     canvas_backdrop   도화지 전체를 덮는 **잠긴** 배경. 그 위에서
                       lasso 가 시작되어야 하고(잠긴 요소는 배경으로
                       취급된다 — 계약 §17-2), 클릭으로 골라지지
                       않아야 한다.
     canvas_logo       logo. 슬롯이 비면 블로그 제목이 글자로 나온다.
     canvas_title      height:"auto" 글자. 가로를 줄이면 줄이 늘고
                       높이가 따라오는지 본다.
     canvas_photo      photo + **초기 회전 -4°**. object-fit 확인.
     canvas_edge_mark  **음수 x(-46)** — 도화지 왼쪽으로 삐져나간
                       장식. 넘친 것을 자를지는 스킨 CSS 의 몫이라
                       (계약 §4-1) 이 스킨은 보이게 둔다.
     canvas_sticker    sticker + **초기 회전 16°**. 사진과 **겹친다**
                       (x 214~260 · y 392~458) — 겹친 자리를 클릭했을
                       때 앞의 것이 골라지는지 본다.
     canvas_note_panel 숫자 height 도형. 그 위의 글자와 겹친다.
     canvas_note_text  **숫자 height** 글자(auto 가 아니다). 세로
                       손잡이로 끌어도 "auto → 숫자" 전환이 일어날
                       것이 없는 대조군이다.
     canvas_rule       line 도형 — 얇은 것도 고를 수 있는지.
     canvas_caption    두 번째 height:"auto" 글자.
     canvas_nav        category_nav(mode:"all") — 실제 링크가 나오고
                       눌러서 카테고리로 가는지.

   초기 회전이 있는 요소는 셋이다(photo · edge_mark · sticker) —
   회전한 요소의 리사이즈 기준점이 맞는지(계약 §18)를 손으로 볼 수
   있어야 하므로 하나로는 부족하다.
========================================================== */

const CANVAS_ELEMENTS = [

  { id: "canvas_backdrop", type: "shape",
    x: 0, y: 0, width: 390, height: 844,
    rotation: 0, hidden: false, locked: true,
    props: { kind: "rect" } },

  { id: "canvas_logo", type: "logo",
    x: 24, y: 36, width: 150, height: 40,
    rotation: 0, hidden: false, locked: false,
    props: { slot: "title_logo", fallback: "site_title" } },

  { id: "canvas_title", type: "text",
    x: 24, y: 92, width: 300, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "고요한 기록\nHOME CANVAS", role: "title" } },

  { id: "canvas_photo", type: "photo",
    x: 24, y: 168, width: 236, height: 290,
    rotation: -4, hidden: false, locked: false,
    props: { slot: "photo_main" } },

  { id: "canvas_edge_mark", type: "shape",
    x: -46, y: 250, width: 120, height: 120,
    rotation: 30, hidden: false, locked: false,
    props: { kind: "ellipse" } },

  { id: "canvas_sticker", type: "sticker",
    x: 214, y: 392, width: 104, height: 104,
    rotation: 16, hidden: false, locked: false,
    props: { slot: "sticker_1" } },

  { id: "canvas_note_panel", type: "shape",
    x: 24, y: 516, width: 342, height: 132,
    rotation: 0, hidden: false, locked: false,
    props: { kind: "rect" } },

  { id: "canvas_note_text", type: "text",
    x: 40, y: 532, width: 310, height: 100,
    rotation: 0, hidden: false, locked: false,
    props: {
      text: "숫자 높이 글자.\n뒤의 판과 겹쳐 앞뒤 순서를 본다.",
      role: "body"
    } },

  { id: "canvas_rule", type: "shape",
    x: 24, y: 672, width: 342, height: 2,
    rotation: 0, hidden: false, locked: false,
    props: { kind: "line" } },

  { id: "canvas_caption", type: "text",
    x: 24, y: 688, width: 260, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: {
      text: "auto 높이 — 가로를 줄이면 줄이 늘고 높이가 따라온다.",
      role: "caption"
    } },

  { id: "canvas_nav", type: "category_nav",
    x: 24, y: 752, width: 342, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { mode: "all", categoryIds: [] } }

];


/* =========================================================
   Template

   ★ HOME 에 표시 위치(data-imory-canvas-root)는 **정확히 하나**다
     — 둘 이상이면 계약 §3 의 fallback 표대로 캔버스가 아예 그려지지
     않는다.

   나머지 화면(CATEGORY · POST · BANNER · FOLDER)에는 캔버스를 두지
   않는다. 이번 마일스톤이 확인하는 것은 HOME 이고, 다른 화면은
   "Import 한 뒤에도 사이트를 돌아다닐 수 있는가" 만 만족하면 된다.
   POST 와 FOLDER 에는 본문 자리(post-body region)가 필수다.
========================================================== */

const ownerTools = `
<p class="hcm-owner" data-imory-if="viewer.isOwner">
  <a class="hcm-owner-link" data-imory-if="viewer.writeHref" data-imory-href="viewer.writeHref">WRITE</a>
  <a class="hcm-owner-link" data-imory-if="viewer.manageHref" data-imory-href="viewer.manageHref">EDIT</a>
</p>`;

const home = `
<div class="hcm-page">
  <p class="hcm-badge">HOME CANVAS — manual test v1</p>
  <div class="hcm-canvas" data-imory-canvas-root></div>
  ${ownerTools}
  <p class="hcm-foot">수동 검사용 스킨입니다. 확인이 끝나면 원래 스킨을 다시 Import 하세요.</p>
</div>`;

const category = `
<div class="hcm-page">
  <p class="hcm-crumb"><a data-imory-href="navigation.home.href" data-imory-bind="site.title"></a></p>
  <h1 class="hcm-head" data-imory-bind="category.name"></h1>
  ${ownerTools}
  <ul class="hcm-list">
    <li class="hcm-list-item" data-imory-repeat="category.posts">
      <a class="hcm-list-link" data-imory-href="item.href" data-imory-bind="item.title"></a>
    </li>
  </ul>
</div>`;

const post = `
<div class="hcm-page">
  <p class="hcm-crumb"><a data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a></p>
  <h1 class="hcm-head" data-imory-bind="post.title"></h1>
  <p class="hcm-date" data-imory-bind="post.publishedAtLabel"></p>
  ${ownerTools}
  <article class="hcm-body" data-imory-region="post-body"></article>
</div>`;

const banner = `
<div class="hcm-page">
  <h1 class="hcm-head" data-imory-bind="bannerCategory.name"></h1>
  <ul class="hcm-list">
    <li class="hcm-list-item" data-imory-repeat="bannerCategory.items">
      <a class="hcm-list-link" data-imory-href="item.linkUrl" data-imory-bind="item.title"></a>
    </li>
  </ul>
</div>`;

const folder = `
<div class="hcm-page">
  <p class="hcm-crumb"><a data-imory-href="folder.parentHref">← BACK</a></p>
  <h1 class="hcm-head" data-imory-bind="folder.name"></h1>
  <div class="hcm-series" data-imory-repeat="folder.posts">
    <h2 class="hcm-series-title" data-imory-bind="item.title"></h2>
    <article class="hcm-body" data-imory-region="post-body"></article>
  </div>
</div>`;


/* =========================================================
   CSS

   ★ 특정도와 !important 를 쓰지 않는다. 플랫폼의 좌표 CSS
     (skin/skin-home-canvas-render.css)는 선택자가 0,1,x 이고 스킨
     CSS 에는 인스턴스 스코프 클래스가 앞에 붙어(0,2,x) 이미 더
     강하다 — 덮어쓰려고 !important 를 붙일 이유가 없다. 붙이면
     나중에 자르기(crop)처럼 render 시점에 좌표를 주는 기능과
     부딪힌다(IMAGE-CROP-PRIORITY-1).

   ★ 좌표 · aspect-ratio · position 을 다시 적지 않는다. 그것은
     플랫폼 파일의 몫이고, 여기서 겹쳐 쓰면 어느 쪽이 그린 자리인지
     구분할 수 없게 된다.

   ── 도화지 폭 ──────────────────────────────────────────
   max-width 를 520px 로 둔다. 390 기준 좌표가 화면에서 약 1.33 배로
   커지므로 (1) 배율이 1 이 아닌 경로를 실제로 지나고 (2) 손잡이가
   손으로 잡기에 충분히 크다. 세로는 플랫폼이 aspect-ratio 로
   가로에 묶는다 — 여기서 height 를 적지 않는다.

   ── 넘친 요소 ──────────────────────────────────────────
   overflow 를 정하지 않는다. canvas_edge_mark 가 왼쪽으로 삐져나간
   것이 **보여야** 하기 때문이다(계약 §4-1 — 자를지 보일지는 스킨의
   선택이다).
========================================================== */

const css = `
.hcm-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 12px 48px;
  color: #22262b;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
}

.hcm-badge {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5b6b80;
}

/* ---- 도화지 ------------------------------------------- */

/* 실제 크기를 눈으로 확인할 수 있게 얇은 테두리를 두른다 */
.hcm-canvas {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  background: #ffffff;
  outline: 1px solid #c6cfda;
}

/* ---- 요소 공통 ---------------------------------------- */

/* 경계가 보이도록 아주 얇은 선만 준다 — 배치를 확인하는 선이다 */
.hcm-canvas [data-imory-canvas-element] {
  outline: 1px dashed rgba(91, 107, 128, 0.55);
}

/* 잠긴 배경은 선을 빼고 아주 옅은 바탕만 준다 */
.hcm-canvas [data-imory-canvas-locked] {
  outline: none;
  background: #f7f9fb;
}

/* ---- photo · sticker · logo --------------------------- */

/* 빈 슬롯에서도 틀이 보이게 — 그림이 들어오면 그 위를 덮는다 */
.hcm-canvas [data-imory-canvas-type="photo"],
.hcm-canvas [data-imory-canvas-type="sticker"],
.hcm-canvas [data-imory-canvas-type="logo"] {
  background: #eef2f7;
}

/* object-fit 이 듣는지 보려면 틀과 그림의 비율이 달라야 한다 */
.hcm-canvas [data-imory-canvas-image] {
  border-radius: 2px;
}

.hcm-canvas [data-imory-canvas-logo-text] {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #1d3557;
}

/* ---- 글자 --------------------------------------------- */

.hcm-canvas [data-imory-canvas-role="title"] {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #1a1d21;
}

.hcm-canvas [data-imory-canvas-role="body"] {
  font-size: 13px;
  color: #2f353c;
}

.hcm-canvas [data-imory-canvas-role="caption"] {
  font-size: 12px;
  color: #5b6b80;
}

/* ---- 도형 --------------------------------------------- */

.hcm-canvas [data-imory-canvas-shape="rect"] {
  background: #eaeff5;
}

.hcm-canvas [data-imory-canvas-shape="ellipse"] {
  background: #1d3557;
  opacity: 0.18;
}

.hcm-canvas [data-imory-canvas-shape="line"] {
  background: #1d3557;
}

/* 잠긴 배경은 위의 rect 규칙보다 뒤에 와서 옅은 바탕을 지킨다 */
.hcm-canvas [data-imory-canvas-locked][data-imory-canvas-shape="rect"] {
  background: #f7f9fb;
}

/* ---- 카테고리 ----------------------------------------- */

.hcm-canvas [data-imory-canvas-nav-item] {
  display: inline-block;
  margin: 0 10px 4px 0;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1d3557;
  text-decoration: none;
  border-bottom: 1px solid #1d3557;
}

/* ---- 도화지 밖 ---------------------------------------- */

.hcm-owner {
  margin: 14px 0 0;
  display: flex;
  gap: 10px;
}

.hcm-owner-link {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #1d3557;
  text-decoration: none;
  border: 1px solid #c6cfda;
  padding: 4px 10px;
}

.hcm-foot {
  margin: 20px 0 0;
  font-size: 11px;
  color: #7c8798;
}

/* ---- 다른 화면 ---------------------------------------- */

.hcm-crumb {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hcm-crumb a {
  color: #5b6b80;
  text-decoration: none;
}

.hcm-head {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
}

.hcm-date {
  margin: 0 0 14px;
  font-size: 11px;
  color: #7c8798;
}

.hcm-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.hcm-list-item {
  border-top: 1px solid #e6eaf0;
}

.hcm-list-link {
  display: block;
  padding: 10px 0;
  font-size: 14px;
  color: #22262b;
  text-decoration: none;
}

.hcm-series {
  margin: 24px 0 0;
  border-top: 1px solid #e6eaf0;
  padding-top: 14px;
}

.hcm-series-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.hcm-body {
  font-size: 14px;
}
`;


/* =========================================================
   빌드
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

  /*
    주인이 Studio Images 에서 채우는 세 슬롯. 이름 규칙은
    skin/skin-package-images.js SKIN_IMAGE_SLOT_NAME_PATTERN
    (`/^[a-z][a-z0-9_]{0,49}$/`) — **snake_case 소문자**다.
    저장소에 그림을 넣지 않으므로 required 는 전부 false 다.
  */
  imageSlots: [
    { name: "photo_main", label: "캔버스 사진", required: false, aspectRatioHint: "4:5" },
    { name: "sticker_1", label: "캔버스 스티커", required: false, aspectRatioHint: "1:1" },
    { name: "title_logo", label: "캔버스 로고", required: false, aspectRatioHint: "4:1" }
  ],

  regions: [
    {
      name: "home_canvas",
      enabled: true,
      canvas: {
        version: 1,
        baseWidth: 390,
        baseHeight: 844,
        elements: CANVAS_ELEMENTS
      }
    }
  ],

  metadata: {
    title: "IMORY HOME CANVAS — manual test v1",
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
      "navigation.home.href",
      "navigation.categories",
      "viewer.isOwner",
      "viewer.writeHref",
      "viewer.manageHref",
      "category.name",
      "category.posts",
      "post.title",
      "post.publishedAtLabel",
      "post.categoryName",
      "post.categoryHref",
      "bannerCategory.name",
      "bannerCategory.items",
      "folder.name",
      "folder.posts",
      "folder.parentHref"
    ]
  }

};


fs.writeFileSync(
  path.join(HERE, "imory-home-canvas-manual-v1.json"),
  JSON.stringify(skin, null, 2) + "\n",
  "utf8"
);

console.log("imory-home-canvas-manual-v1.json written");
