/* =========================================================
   HOME CANVAS — 정적 Renderer E2E (HOME-CANVAS-RENDER-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md

   저장된 Canvas 가 **공개 native 화면**과 **Studio native Preview**
   에서 같은 DOM · 같은 좌표로 그려지는가를 잰다.

   화면은 실제 renderSkin() 이 그린다.
     공개 native : skin/skin-home-canvas-render-harness.html
                   (skin/skin-home.js 가 부르는 그 함수 그대로)
     Studio      : studio/studio-lifecycle-scenario.html?scenario=lay
                   의 실제 Preview iframe(studio/preview/preview-frame.html)

   sandbox 프레임은 이번 범위가 아니다(HOME-CANVAS-RENDER-1B) —
   프레임 문서는 렌더러를 로드하지 않는다.

   [legacy]   캔버스가 없는 기존 스킨 · 표식 없는 스킨의 DOM 불변
   [fallback] 표식 없음 · 둘 이상 · 깨진 데이터 · 미래 version
   [frame]    도화지가 baseHeight 비율을 갖는다(요소가 없어도)
   [elements] 여섯 종류의 DOM 과 배열 순서
   [coords]   x·y·width·height · 폭을 바꿔도 같은 배율 · auto/fixed · 회전
   [state]    hidden · locked
   [safety]   글자와 카테고리 이름에서 HTML 이 실행되지 않는다
   [image]    자르기를 고르지 않은 그림은 **전체가 보인다**(contain) —
              가로긴 그림 → 세로 틀 · 세로긴 그림 → 가로 틀 · 정사각 →
              긴 틀 · logo · sticker · 비틀림 0 (MANUAL-UX-FIX-1)
   [content]  채워진 슬롯 · 빈 슬롯 · logo fallback · category all/selected
   [rerender] 재렌더 중복 없음 · 제거 시 정리 · 입력 non-mutation
   [v2-flow]  조합형 Canvas v2(V2-FLOW-RENDER-1) — 블록 순서 · 정렬
              네 값 · width/maxWidth · 숫자 height 와 auto ·
              padding/gap/margin 합산 · hidden 이 자리를 안 남김 ·
              종류 다섯의 DOM · main_visual 프레임 · overlays ·
              같은 배율 · 잘못된 v2 와 version 3 fallback ·
              v1 회귀 · 공개 화면의 vendor 요청 0
   [v2-frame] main_visual **내부**(V2-MAIN-VISUAL-1) — 사진과 장식의
              DOM · 배열 순서 · transform 은 S_frame 을 받고 pin 은
              안 받는다 · frame/photo anchor · origin 의 translate ·
              height:"auto" 프레임의 비율 · 사진 교체 뒤 장식 위치 ·
              프레임 밖 장식과 가로 스크롤 0
   [pages]    CATEGORY · POST · BANNER 무영향
   [parity]   공개 native ↔ Studio native Preview 의 DOM · 좌표

   계약 자체(요소 규칙 · 실행 payload · 봉투)는 브라우저 없이 도는
   node skin/skin-home-canvas-test.mjs 가, 저장 왕복은
   node studio/studio-home-canvas-e2e-test.mjs 가 본다.

   실행:
     node skin/skin-home-canvas-render-e2e-test.mjs
     node skin/skin-home-canvas-render-e2e-test.mjs --only=coords
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8983;
const HARNESS = `http://localhost:${PORT}/skin/skin-home-canvas-render-harness.html`;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=lay`;

/* 실행 중에 만들어 내보내는 단색 SVG — 저장소에 이미지 파일을
   새로 넣지 않는다(로드맵 §9). 경로가 절대 경로라 공개 하네스와
   Studio Preview 문서에서 **같은 주소**로 풀린다. */
const FIXTURE_IMAGE_PATH = "/__canvas-fixture__/swatch.svg";
const FIXTURE_IMAGE_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
  '<rect width="80" height="80" fill="#c9803f"/></svg>';

/* HOME-CANVAS-MANUAL-UX-FIX-1 — 틀과 **비율이 다른** 그림 둘
   (계약 §21-3). 자르기를 고르지 않았을 때 전체가 보이는가를 물어보려면
   정사각 하나로는 부족하다 — 가로긴 그림을 세로 틀에, 세로긴 그림을
   가로 틀에 넣어 봐야 한다. 저장소에 파일을 넣지 않고 서버가 만든다. */
const FIXTURE_WIDE_PATH = "/__canvas-fixture__/wide.svg";
const FIXTURE_WIDE_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">' +
  '<rect width="120" height="40" fill="#3f7fc9"/></svg>';

const FIXTURE_TALL_PATH = "/__canvas-fixture__/tall.svg";
const FIXTURE_TALL_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="120">' +
  '<rect width="40" height="120" fill="#4fa05a"/></svg>';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");


async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const dir of fs.readdirSync(npxCache)) {
      candidates.push(path.join(npxCache, dir, "node_modules"));
    }
  }
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  }
  candidates.push(path.join(ROOT, "node_modules"));

  const found = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let version = "0.0.0";
    try { version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0"; } catch { /* 낮게 */ }
    found.push({ entry, version });
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  const tried = [];
  for (const { entry, version } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }
  throw new Error(`playwright ${browserName} 를 실행할 수 없습니다.\n  - ${tried.join("\n  - ") || "없음"}`);
}


const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

function startServer() {
  const server = http.createServer((req, res) => {

    const url = new URL(req.url, "http://localhost");

    if (url.pathname === FIXTURE_IMAGE_PATH) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      res.end(FIXTURE_IMAGE_BODY);
      return;
    }

    if (url.pathname === FIXTURE_WIDE_PATH || url.pathname === FIXTURE_TALL_PATH) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      res.end(url.pathname === FIXTURE_WIDE_PATH ? FIXTURE_WIDE_BODY : FIXTURE_TALL_BODY);
      return;
    }

    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const abs = path.join(ROOT, rel);

    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(abs).pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}


let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const wants = (name) => !ONLY || ONLY.split(",").map((n) => n.trim()).includes(name);
const section = (name) => console.log(`\n[${name}]`);

const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.5 : tolerance);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);


/* =========================================================
   fixture — 여섯 종류가 한 번씩 · 운영 preset 을 만들지 않는다
========================================================== */

const HOME_HTML =
  '<div class="hc-home">' +
  '<h1 class="hc-title" data-imory-bind="site.title"></h1>' +
  '<div class="hc-canvas" data-imory-canvas-root></div>' +
  "</div>";

const PLAIN_HOME_HTML =
  '<div class="hc-home"><h1 class="hc-title" data-imory-bind="site.title"></h1>' +
  '<p class="hc-plain">표식이 없는 평범한 HOME</p></div>';

const TWO_MARKER_HOME_HTML =
  '<div class="hc-home">' +
  '<div class="hc-canvas" data-imory-canvas-root></div>' +
  '<div class="hc-canvas2" data-imory-canvas-root></div>' +
  "</div>";

/* 여섯 종류 · 숫자 height 와 "auto" · 회전 · hidden · locked ·
   빈 슬롯과 채워진 슬롯 · logo fallback · nav all 과 selected */
const CANVAS_ELEMENTS = [
  { id: "canvas_photo_filled", type: "photo", x: 20, y: 120, width: 260, height: 320,
    rotation: 0, hidden: false, locked: false, props: { slot: "photo_1" } },
  { id: "canvas_photo_empty", type: "photo", x: 300, y: 120, width: 70, height: 70,
    rotation: 0, hidden: false, locked: true, props: { slot: "photo_empty" } },
  { id: "canvas_shape_rect", type: "shape", x: 0, y: 0, width: 390, height: 40,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },
  { id: "canvas_shape_round", type: "shape", x: 240, y: 700, width: 90, height: 90,
    rotation: 12, hidden: false, locked: false, props: { kind: "ellipse" } },
  { id: "canvas_shape_line", type: "shape", x: 20, y: 96, width: 350, height: 2,
    rotation: 0, hidden: true, locked: false, props: { kind: "line" } },
  { id: "canvas_logo_text", type: "logo", x: 20, y: 44, width: 200, height: 40,
    rotation: 0, hidden: false, locked: false,
    props: { slot: "logo_empty", fallback: "site_title" } },
  { id: "canvas_logo_image", type: "logo", x: 240, y: 44, width: 60, height: 40,
    rotation: 0, hidden: false, locked: false,
    props: { slot: "photo_1", fallback: "site_title" } },
  { id: "canvas_text_body", type: "text", x: 20, y: 470, width: 260, height: "auto",
    rotation: -2, hidden: false, locked: false,
    props: { text: "A quiet archive.\n<img src=x onerror=\"window.__canvasXss=1\">", role: "caption" } },
  { id: "canvas_text_fixed", type: "text", x: 20, y: 560, width: 200, height: 60,
    rotation: 0, hidden: false, locked: false,
    props: { text: "고정 높이 글자", role: "title" } },
  { id: "canvas_sticker", type: "sticker", x: 290, y: 470, width: 80, height: 80,
    rotation: 45, hidden: false, locked: false, props: { slot: "sticker_1" } },
  { id: "canvas_nav_all", type: "category_nav", x: 20, y: 640, width: 350, height: "auto",
    rotation: 0, hidden: false, locked: false, props: { mode: "all", categoryIds: [] } },
  { id: "canvas_nav_picked", type: "category_nav", x: 20, y: 680, width: 350, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { mode: "selected", categoryIds: ["302", "does-not-exist", "301"] } }
];

const canvasData = (overrides) => ({
  version: 1,
  baseWidth: 390,
  baseHeight: 844,
  elements: CANVAS_ELEMENTS,
  ...(overrides || {})
});

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진 1", required: false },
  { name: "photo_empty", label: "빈 사진", required: false },
  { name: "logo_empty", label: "빈 로고", required: false },
  { name: "sticker_1", label: "스티커", required: false }
];

const CANVAS_CSS =
  ".hc-home { padding: 0; margin: 0; }" +
  ".hc-canvas { width: 100%; }";

const skinPackage = (options) => {
  const o = options || {};
  return {
    schemaVersion: 1,
    templates: {
      home: { html: o.homeHtml === undefined ? HOME_HTML : o.homeHtml },
      category: { html: '<div class="hc-category"><div data-imory-canvas-root></div></div>' },
      post: { html: '<div class="hc-post"><div data-imory-canvas-root></div><div data-imory-region="post-body"></div></div>' },
      banner: { html: '<div class="hc-banner"><div data-imory-canvas-root></div></div>' }
    },
    css: o.css === undefined ? CANVAS_CSS : o.css,
    imageSlots: IMAGE_SLOTS,
    regions:
      o.regions === undefined
        ? [{ name: "home_canvas", enabled: true, canvas: canvasData(o.canvas) }]
        : o.regions,
    metadata: {}
  };
};

/* =========================================================
   v2 조합형 Canvas fixture (HOME-CANVAS-V2-FLOW-RENDER-1)

   숫자를 **손으로 검산할 수 있게** 고른다. baseWidth 390 에서
   좌우 padding 20 씩이므로 가용 폭은 정확히 350 이고, 도화지 폭을
   390 으로 두면 배율 1 이라 아래 기대값이 그대로 px 이다.

     padding  top 40 · right 20 · bottom 30 · left 20
     gap      10
     가용 폭  350  (x = 20 부터)

   블록 일곱이 §14-4 의 표를 한 번씩 밟는다 — 정렬 네 값 · 숫자
   height 와 "auto" · margin 합산 · maxWidth 클램프 · hidden ·
   종류 다섯. overlay 하나가 자유 층이 흐름을 밀어내지 않음을 잰다.
========================================================== */

const V2_BLOCKS = [
  /* 0 — left. margin 없음. 빈 슬롯이라 블로그 제목으로 떨어진다 */
  { id: "canvas_v2logo", type: "logo", width: 120, height: 40, align: "left",
    props: { slot: "logo_empty", fallback: "site_title" } },

  /* 1 — hidden. **자리도 차지하지 않는다**(아래가 올라온다) */
  { id: "canvas_v2gone", type: "divider", width: 100, height: 8, align: "center", hidden: true },

  /* 2 — center + "auto" 높이. 위아래 margin 이 gap 과 합산된다 */
  { id: "canvas_v2title", type: "text", width: 300, height: "auto", align: "center",
    margin: { top: 6, bottom: 4 }, props: { text: "FLOW TITLE", role: "title" } },

  /* 3 — right + margin.right 가 더 민다(left 는 쓰이지 않는다) */
  { id: "canvas_v2rule", type: "divider", width: 120, height: 2, align: "right",
    margin: { right: 10, left: 999 } },

  /* 4 — stretch. 좌우 margin 이 **폭을 깎는다**(350 − 8 − 12 = 330) */
  { id: "canvas_v2nav", type: "category_nav", width: 340, height: "auto", align: "stretch",
    margin: { left: 8, right: 12 }, props: { mode: "selected", categoryIds: ["302", "nope", "301"] } },

  /* 5 — stretch + maxWidth. 120 에서 멈추고 **그 뒤 가운데**다 */
  { id: "canvas_v2wide", type: "text", width: 340, height: 30, align: "stretch",
    maxWidth: 120, locked: true, props: { text: "CLAMP", role: "label" } },

  /* 6 — main_visual. 숫자 height 이고 내부 자가 150 이라 S_frame = 2 다
         (V2-MAIN-VISUAL-1 — 손으로 검산할 수 있는 배율을 고른다).

     props.baseHeight 80 인데 프레임 높이는 200 이다 — 균등 배율이
     160 이므로 transform 장식은 **위쪽에 몰린다**(§14-6 의 의도).

       프레임 상자   300 × 200   (도화지 자, 가운데 정렬이라 x = 45)
       S_frame       300 / 150 = 2
       paper         x -10 · y 0 · 300 × 150   (프레임 왼쪽으로 10 넘침)
       photo         x  20 · y 10 · 200 × 100
       label(pin)    photo 왼쪽 가운데 − 8 → 오른쪽 변이 x 12
                     (자기 크기는 40 × 22 — S_frame 을 받지 않는다)
       tag(pin)      photo 오른쪽 가운데 + 80 → 왼쪽 변이 x 300
                     (프레임 오른쪽으로 40 넘침 · 8° 회전)
       cap(pin)      프레임 아래 가운데 + 10 → y 210 · 가로 가운데
                     (height "auto" — origin 은 CSS 가 뺀다) */
  { id: "canvas_v2main", type: "main_visual", width: 300, height: 200, align: "center",
    margin: { top: 12 },
    props: {
      baseWidth: 150, baseHeight: 80, primaryId: "canvas_v2photo",
      elements: [
        { id: "canvas_v2paper", type: "shape", follow: "transform",
          x: -5, y: 0, width: 150, height: 75, rotation: -6, props: { kind: "rect" } },
        { id: "canvas_v2photo", type: "photo", follow: "transform",
          x: 10, y: 5, width: 100, height: 50, props: { slot: "photo_1" } },
        { id: "canvas_v2label", type: "text", follow: "pin", width: 40, height: 22,
          pin: { target: "photo", anchor: "left", origin: "right", offset: { x: -8, y: 0 } },
          props: { text: "pin !", role: "label" } },
        { id: "canvas_v2tag", type: "text", follow: "pin", width: 40, height: 20, rotation: 8,
          pin: { target: "photo", anchor: "right", origin: "left", offset: { x: 80, y: -10 } },
          props: { text: "tag", role: "label" } },
        { id: "canvas_v2cap", type: "text", follow: "pin", width: 240, height: "auto",
          pin: { target: "frame", anchor: "bottom", origin: "top", offset: { x: 0, y: 10 } },
          props: { text: "2026 / 09 / 22", role: "caption" } }
      ]
    } },

  /* 7 — height:"auto" 프레임. 높이는 **primary 사진 상자의 비율**이다
         (§14-5). props.baseHeight 400 은 그 비율이 아니다 — 그쪽은
         내부 좌표의 자일 뿐이므로 이 블록이 둘을 갈라 준다.

           S_frame = 200 / 100 = 2
           비율    = 100 : 40 → 프레임 200 × 80
                     (props.baseWidth·baseHeight 였다면 800 이다) */
  { id: "canvas_v2auto", type: "main_visual", width: 200, height: "auto", align: "left",
    margin: { top: 8 },
    props: {
      baseWidth: 100, baseHeight: 400, primaryId: "canvas_v2autophoto",
      elements: [
        { id: "canvas_v2autophoto", type: "photo", follow: "transform",
          x: 0, y: 0, width: 100, height: 40, props: { slot: "photo_1" } }
      ]
    } }
];

const V2_OVERLAYS = [
  { id: "canvas_v2over", type: "text", x: -20, y: 900, width: 100, height: 40,
    rotation: 15, props: { text: "01", role: "label" } }
];

const v2CanvasData = (overrides) => ({
  version: 2,
  baseWidth: 390,
  baseHeight: 1000,
  flow: {
    direction: "column",
    padding: { top: 40, right: 20, bottom: 30, left: 20 },
    gap: 10,
    blocks: V2_BLOCKS
  },
  overlays: V2_OVERLAYS,
  ...(overrides || {})
});


/* 공개 하네스가 쓰는 Context — Studio 쪽 scenario lay 의 실제
   데이터(블로그 제목 · 카테고리 두 개)와 **같은 값**으로 맞춘다.
   [parity] 가 두 화면의 글자까지 대조하기 때문이다. */
const CONTEXT = {
  site: { title: "SCENARIO LAY BLOG", slug: "scenario-lay", description: null, language: "ko" },
  profile: { nickname: "Scenario LAY", bio: null, avatarUrl: null },
  navigation: {
    home: { name: "SCENARIO LAY BLOG", href: "/scenario-lay", enabled: true, type: "home", iconKind: "home" },
    categories: [
      { id: "301", name: "LOG", type: "post", iconKind: "post", href: "/scenario-lay/category/301", itemCount: null },
      { id: "302", name: "<b>NOTE</b>", type: "post", iconKind: "post", href: "/scenario-lay/category/302", itemCount: null }
    ],
    postCategories: [],
    galleryCategories: [],
    bannerCategories: []
  },
  home: { recentPosts: [] },
  images: {
    photo_1: FIXTURE_IMAGE_PATH,
    photo_empty: null,
    logo_empty: null,
    sticker_1: FIXTURE_IMAGE_PATH
  },
  viewer: { isOwner: false },
  page: { type: "home" }
};


/* =========================================================
   공개 하네스 열기 · 읽기
========================================================== */

async function openHarness(browser, viewport, query) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));
  await page.goto(query ? `${HARNESS}?${query}` : HARNESS);
  await page.evaluate(() => window.harnessReady);
  return { ctx, page, errors };
}

/* renderSkin 은 mount 마다 인스턴스 전용 스코프 클래스를 새로 만든다
   (imory-skin-root-i3 …). 두 렌더를 글자 단위로 대조할 때는 그 번호만
   지운다 — 이 라운드가 만드는 차이가 아니다. */
const normalizeScope = (html) => html.replace(/imory-skin-root-i\d+/g, "imory-skin-root-iN");

/* 하네스에서 한 번 그리고 결과를 읽는다 */
async function render(page, options) {
  await page.evaluate((o) => window.renderCanvasHarness(o), options);
  await page.waitForTimeout(80);
}


/*
  캔버스의 DOM 과 좌표를 통째로. 공개 화면과 Studio Preview 가
  **같은 함수**를 쓰도록 문자열로 넣는다(두 문서는 서로 다른
  browsing context 라 전역을 공유하지 않는다).

  ★ 회전한 요소의 getBoundingClientRect() 는 회전 뒤의 외곽 상자다.
    그래서 위치는 **중심**으로(회전은 중심을 옮기지 않는다), 크기는
    레이아웃 크기(offsetWidth/offsetHeight)로 잰다.
*/
const READ_CANVAS = `(() => {
  const root = document.querySelector("[data-imory-canvas-root]");
  if (!root) return { found: false };
  const rr = root.getBoundingClientRect();
  const owned = Array.prototype.filter.call(root.children, (el) =>
    el.hasAttribute && el.hasAttribute("data-imory-canvas-element"));
  const angle = (el) => {
    const t = getComputedStyle(el).transform;
    const m = /^matrix\\(([^)]+)\\)$/.exec(t);
    if (!m) return 0;
    const n = m[1].split(",").map(Number);
    return Math.round(Math.atan2(n[1], n[0]) * 180 / Math.PI * 100) / 100;
  };
  return {
    found: true,
    active: root.getAttribute("data-imory-canvas-active"),
    version: root.getAttribute("data-imory-canvas-version"),
    baseWidthVar: root.style.getPropertyValue("--imory-canvas-base-width").trim(),
    baseHeightVar: root.style.getPropertyValue("--imory-canvas-base-height").trim(),
    rootW: rr.width,
    rootH: rr.height,
    childCount: root.children.length,
    ownedCount: owned.length,
    elements: owned.map((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector("[data-imory-canvas-image]");
      const links = Array.from(el.querySelectorAll("[data-imory-canvas-nav-item]"));
      const text = el.querySelector("[data-imory-canvas-text]");
      const logoText = el.querySelector("[data-imory-canvas-logo-text]");
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("data-imory-canvas-type"),
        editId: el.getAttribute("data-imory-edit-id"),
        heightMode: el.getAttribute("data-imory-canvas-height"),
        role: el.getAttribute("data-imory-canvas-role"),
        shape: el.getAttribute("data-imory-canvas-shape"),
        navMode: el.getAttribute("data-imory-canvas-nav-mode"),
        hiddenAttr: el.getAttribute("data-imory-canvas-hidden"),
        lockedAttr: el.getAttribute("data-imory-canvas-locked"),
        displayed: el.offsetParent !== null || getComputedStyle(el).display !== "none",
        vars: {
          x: el.style.getPropertyValue("--imory-canvas-x").trim(),
          y: el.style.getPropertyValue("--imory-canvas-y").trim(),
          width: el.style.getPropertyValue("--imory-canvas-width").trim(),
          height: el.style.getPropertyValue("--imory-canvas-height").trim(),
          rotation: el.style.getPropertyValue("--imory-canvas-rotation").trim()
        },
        cx: r.left + r.width / 2 - rr.left,
        cy: r.top + r.height / 2 - rr.top,
        w: el.offsetWidth,
        h: el.offsetHeight,
        angle: angle(el),
        imgSrc: img ? img.getAttribute("src") : null,
        /* HOME-CANVAS-MANUAL-UX-FIX-1 — 자르기를 고르지 않은 그림의
           기본값(계약 §21-3). 네 화면 parity 가 이 값까지 대조하므로
           한 화면만 cover 로 돌아가면 그 자리에서 잡힌다. */
        imgFit: img ? getComputedStyle(img).objectFit : null,
        imgAlt: img ? img.getAttribute("alt") : null,
        innerTags: Array.from(el.querySelectorAll("*")).map((n) => n.tagName.toLowerCase()).join(","),
        text: text ? text.textContent : null,
        logoText: logoText ? logoText.textContent : null,
        links: links.map((a) => ({ name: a.textContent, href: a.getAttribute("href") }))
      };
    })
  };
})()`;

const readCanvas = (page) => page.evaluate(READ_CANVAS);


/*
  두 화면을 대조할 때 쓰는 모양.

  ★ 좌표와 DOM 을 나눠서 본다. DOM 은 **글자 단위**로 같아야 하고,
    좌표는 브라우저의 서브픽셀 때문에 허용치가 필요하다.

  ★ 두 화면의 도화지 폭을 **같게** 맞춰 놓고 잰다(parity fixture 의
    스킨 CSS 가 .hc-canvas 폭을 못박는다). 폭이 다르면 "auto" 높이
    글자가 다른 곳에서 줄바꿈되어 높이가 달라진다 — 이번 단계는
    상자를 비례로 키울 뿐 글자 크기를 바꾸지 않기 때문이고, 그
    변환 규칙은 HOME-CANVAS-RESPONSIVE-1 의 몫이다.

  href 는 뺀다. 공개 Context 와 Studio 가 같은 주소 규칙으로 만들지만
  이 fixture 의 카테고리 행에는 공개 번호가 없어서 두 경로의 결과가
  다를 수 있다 — 주소 계약은 이 라운드가 건드리지 않았다.
*/
function parityDom(reading) {
  return {
    active: reading.active,
    version: reading.version,
    baseWidthVar: reading.baseWidthVar,
    baseHeightVar: reading.baseHeightVar,
    ownedCount: reading.ownedCount,
    elements: reading.elements.map((e) => ({
      tag: e.tag, type: e.type, editId: e.editId, heightMode: e.heightMode,
      role: e.role, shape: e.shape, navMode: e.navMode,
      hiddenAttr: e.hiddenAttr, lockedAttr: e.lockedAttr, displayed: e.displayed,
      vars: e.vars, angle: e.angle,
      imgSrc: e.imgSrc, imgAlt: e.imgAlt, imgFit: e.imgFit,
      innerTags: e.innerTags,
      text: e.text, logoText: e.logoText,
      names: e.links.map((l) => l.name)
    }))
  };
}

const findEl = (reading, id) => reading.elements.find((e) => e.editId === id);


/* =========================================================
   v2 읽기 (HOME-CANVAS-V2-FLOW-RENDER-1)

   층이 둘이라 읽는 것도 둘이다 — 흐름 층의 블록과 표식 바로 아래의
   자유 장식. 좌표는 전부 **표식 기준 상대값**이라 도화지 폭만 알면
   손으로 검산된다.

   ★ 블록 상자는 `getBoundingClientRect()` 를 쓴다(회전이 없는 층이라
     회전 보정이 필요 없고, margin 합산을 재려면 실제 외곽이 필요하다).
========================================================== */

const READ_V2_CANVAS = `(() => {
  const root = document.querySelector("[data-imory-canvas-root]");
  if (!root) return { found: false };
  const rr = root.getBoundingClientRect();
  const flow = root.querySelector(":scope > [data-imory-canvas-flow]");
  const fr = flow ? flow.getBoundingClientRect() : null;
  const angle = (el) => {
    const m = /^matrix\\(([^)]+)\\)$/.exec(getComputedStyle(el).transform);
    if (!m) return 0;
    const n = m[1].split(",").map(Number);
    return Math.round(Math.atan2(n[1], n[0]) * 180 / Math.PI * 100) / 100;
  };
  const overlays = Array.prototype.filter.call(root.children, (el) =>
    el.hasAttribute && el.hasAttribute("data-imory-canvas-element"));
  const blocks = flow
    ? Array.prototype.filter.call(flow.children, (el) =>
        el.hasAttribute && el.hasAttribute("data-imory-canvas-block"))
    : [];
  return {
    found: true,
    active: root.getAttribute("data-imory-canvas-active"),
    version: root.getAttribute("data-imory-canvas-version"),
    rootW: rr.width,
    rootH: rr.height,
    ownedCount: root.children.length,
    hasFlow: !!flow,
    flowCount: flow ? flow.children.length : 0,
    flowDirection: flow ? flow.getAttribute("data-imory-canvas-flow") : null,
    flowPosition: flow ? getComputedStyle(flow).position : null,
    flowDisplay: flow ? getComputedStyle(flow).display : null,
    /* 흐름 층의 **content box** 왼쪽 위 — 블록 좌표의 원점이다 */
    padTop: flow ? parseFloat(getComputedStyle(flow).paddingTop) : null,
    padLeft: flow ? parseFloat(getComputedStyle(flow).paddingLeft) : null,
    padRight: flow ? parseFloat(getComputedStyle(flow).paddingRight) : null,
    padBottom: flow ? parseFloat(getComputedStyle(flow).paddingBottom) : null,
    flowX: fr ? fr.left - rr.left : null,
    flowY: fr ? fr.top - rr.top : null,
    flowW: fr ? fr.width : null,
    flowH: fr ? fr.height : null,
    blocks: blocks.map((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector("[data-imory-canvas-image]");
      const text = el.querySelector("[data-imory-canvas-text]");
      const logoText = el.querySelector("[data-imory-canvas-logo-text]");
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("data-imory-canvas-type"),
        editId: el.getAttribute("data-imory-edit-id"),
        align: el.getAttribute("data-imory-canvas-align"),
        heightMode: el.getAttribute("data-imory-canvas-height"),
        role: el.getAttribute("data-imory-canvas-role"),
        navMode: el.getAttribute("data-imory-canvas-nav-mode"),
        hiddenAttr: el.getAttribute("data-imory-canvas-hidden"),
        lockedAttr: el.getAttribute("data-imory-canvas-locked"),
        isFrame: el.hasAttribute("data-imory-canvas-frame"),
        isElementAttr: el.hasAttribute("data-imory-canvas-element"),
        displayed: cs.display !== "none",
        position: cs.position,
        marginTop: parseFloat(cs.marginTop),
        marginBottom: parseFloat(cs.marginBottom),
        marginLeft: parseFloat(cs.marginLeft),
        marginRight: parseFloat(cs.marginRight),
        frameBaseW: el.style.getPropertyValue("--imory-canvas-frame-base-width").trim(),
        frameBaseH: el.style.getPropertyValue("--imory-canvas-frame-base-height").trim(),
        frameRatioW: el.style.getPropertyValue("--imory-canvas-frame-ratio-width").trim(),
        frameRatioH: el.style.getPropertyValue("--imory-canvas-frame-ratio-height").trim(),
        x: r.left - rr.left,
        y: r.top - rr.top,
        w: r.width,
        h: r.height,
        childCount: el.children.length,
        /* V2-MAIN-VISUAL-1 — main_visual 내부 요소. 좌표는 **프레임
           상자 기준** 상대값이고, 회전한 요소는 중심으로 본다
           (bbox 는 회전 뒤의 외곽 상자이므로). */
        inner: Array.from(el.querySelectorAll("[data-imory-canvas-element]")).map((n) => {
          const nr = n.getBoundingClientRect();
          const nt = n.querySelector("[data-imory-canvas-text]");
          const ni = n.querySelector("[data-imory-canvas-image]");
          return {
            editId: n.getAttribute("data-imory-edit-id"),
            type: n.getAttribute("data-imory-canvas-type"),
            follow: n.getAttribute("data-imory-canvas-follow"),
            heightMode: n.getAttribute("data-imory-canvas-height"),
            role: n.getAttribute("data-imory-canvas-role"),
            shape: n.getAttribute("data-imory-canvas-shape"),
            position: getComputedStyle(n).position,
            vars: {
              x: n.style.getPropertyValue("--imory-canvas-x").trim(),
              y: n.style.getPropertyValue("--imory-canvas-y").trim(),
              width: n.style.getPropertyValue("--imory-canvas-width").trim(),
              height: n.style.getPropertyValue("--imory-canvas-height").trim(),
              rotation: n.style.getPropertyValue("--imory-canvas-rotation").trim(),
              tx: n.style.getPropertyValue("--imory-canvas-translate-x").trim(),
              ty: n.style.getPropertyValue("--imory-canvas-translate-y").trim()
            },
            cx: nr.left + nr.width / 2 - r.left,
            cy: nr.top + nr.height / 2 - r.top,
            w: n.offsetWidth,
            h: n.offsetHeight,
            /* 넘침을 재기 위한 실제 변(회전 없는 요소에서만 뜻이 있다) */
            left: nr.left - r.left,
            right: nr.right - r.left,
            bottom: nr.bottom - r.top,
            angle: angle(n),
            imgSrc: ni ? ni.getAttribute("src") : null,
            imgFit: ni ? getComputedStyle(ni).objectFit : null,
            text: nt ? nt.textContent : null,
            innerTags: Array.from(n.querySelectorAll("*")).map((t) => t.tagName.toLowerCase()).join(",")
          };
        }),
        innerTags: Array.from(el.querySelectorAll("*")).map((n) => n.tagName.toLowerCase()).join(","),
        text: text ? text.textContent : null,
        logoText: logoText ? logoText.textContent : null,
        imgSrc: img ? img.getAttribute("src") : null,
        links: Array.from(el.querySelectorAll("[data-imory-canvas-nav-item]"))
          .map((a) => ({ name: a.textContent, href: a.getAttribute("href") }))
      };
    }),
    overlays: overlays.map((el) => {
      const r = el.getBoundingClientRect();
      const text = el.querySelector("[data-imory-canvas-text]");
      return {
        type: el.getAttribute("data-imory-canvas-type"),
        editId: el.getAttribute("data-imory-edit-id"),
        isOverlay: el.hasAttribute("data-imory-canvas-overlay"),
        position: getComputedStyle(el).position,
        vars: {
          x: el.style.getPropertyValue("--imory-canvas-x").trim(),
          y: el.style.getPropertyValue("--imory-canvas-y").trim(),
          width: el.style.getPropertyValue("--imory-canvas-width").trim(),
          height: el.style.getPropertyValue("--imory-canvas-height").trim(),
          rotation: el.style.getPropertyValue("--imory-canvas-rotation").trim()
        },
        cx: r.left + r.width / 2 - rr.left,
        cy: r.top + r.height / 2 - rr.top,
        w: el.offsetWidth,
        h: el.offsetHeight,
        angle: angle(el),
        text: text ? text.textContent : null
      };
    })
  };
})()`;

const readV2Canvas = (page) => page.evaluate(READ_V2_CANVAS);

const findBlock = (reading, id) => reading.blocks.find((b) => b.editId === id);


/* =========================================================
   실행
========================================================== */

async function run() {

  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();

  try {

    /* ------------------------------------------------- */
    if (wants("legacy")) {

      section("legacy");

      /* 캔버스를 **한 번도** 그리지 않은 문서로 연다(?blank=1) */
      const { ctx, page, errors } = await openHarness(browser, null, "blank=1");

      /* 캔버스가 아예 없는 스킨 */
      await render(page, { skinPackage: skinPackage({ regions: [] }), context: CONTEXT, width: 390, fresh: true });
      const noCanvas = await page.evaluate(() => ({
        html: document.querySelector("[data-skin-root]").innerHTML,
        tmplCanvas: window.harnessTemplate.canvas === undefined,
        link: !!document.querySelector('link[data-imory-skin-home-canvas]')
      }));

      check("regions 가 비면 template 에 canvas 키조차 없다", noCanvas.tmplCanvas);
      check("★ 캔버스가 없는 스킨 — 표식 안에 요소가 하나도 생기지 않는다",
        !/data-imory-canvas-element/.test(noCanvas.html) &&
        !/data-imory-canvas-active/.test(noCanvas.html));
      check("★ 캔버스가 없는 스킨 — 플랫폼 CSS link 조차 붙지 않는다", noCanvas.link === false);

      /* 표식이 없는 스킨 — 렌더 결과가 캔버스 이전과 글자 단위로 같다 */
      await render(page, {
        skinPackage: skinPackage({ homeHtml: PLAIN_HOME_HTML, regions: [] }),
        context: CONTEXT, width: 390, fresh: true
      });
      const plainWithout = await page.evaluate(() => document.querySelector("[data-skin-root]").innerHTML);

      await render(page, {
        skinPackage: skinPackage({ homeHtml: PLAIN_HOME_HTML }),
        context: CONTEXT, width: 390, fresh: true
      });
      const plainWith = await page.evaluate(() => document.querySelector("[data-skin-root]").innerHTML);

      check("★ 표식이 없으면 regions 에 캔버스가 있어도 DOM 이 글자 단위로 같다",
        normalizeScope(plainWith) === normalizeScope(plainWithout));

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("fallback")) {

      section("fallback");

      const { ctx, page, errors } = await openHarness(browser);

      /* 표식 둘 — 어느 쪽인지 렌더러가 고르지 않는다 */
      await render(page, {
        skinPackage: skinPackage({ homeHtml: TWO_MARKER_HOME_HTML }),
        context: CONTEXT, width: 390, fresh: true
      });
      const two = await page.evaluate(() => ({
        markers: document.querySelectorAll("[data-imory-canvas-root]").length,
        elements: document.querySelectorAll("[data-imory-canvas-element]").length,
        active: document.querySelectorAll("[data-imory-canvas-active]").length,
        tmplCanvas: window.harnessTemplate.canvas === undefined
      }));

      check("★ 표식이 둘이면 그리지 않는다(기존 HOME)",
        two.markers === 2 && two.elements === 0 && two.active === 0 && two.tmplCanvas,
        JSON.stringify(two));

      /* 깨진 저장 데이터 — 조용히 고치거나 지우지 않는다 */
      const brokenPackage = skinPackage({
        canvas: { elements: [{ id: "canvas_broken", type: "photo", x: 0, y: 0, width: 0, height: 10, props: { slot: "photo_1" } }] }
      });
      const brokenBefore = JSON.stringify(brokenPackage);

      await render(page, { skinPackage: brokenPackage, context: CONTEXT, width: 390, fresh: true });
      const broken = await page.evaluate(() => ({
        elements: document.querySelectorAll("[data-imory-canvas-element]").length,
        active: document.querySelectorAll("[data-imory-canvas-active]").length,
        tmplCanvas: window.harnessTemplate.canvas === undefined
      }));

      check("★ 깨진 저장 데이터 — 그리지 않고 기존 HOME",
        broken.elements === 0 && broken.active === 0 && broken.tmplCanvas, JSON.stringify(broken));
      check("깨진 데이터를 렌더 경로가 고치지 않는다", JSON.stringify(brokenPackage) === brokenBefore);

      /* 이 배포가 모르는 미래 version */
      await render(page, {
        skinPackage: skinPackage({ canvas: { version: 99 } }),
        context: CONTEXT, width: 390, fresh: true
      });
      const future = await page.evaluate(() => ({
        elements: document.querySelectorAll("[data-imory-canvas-element]").length,
        tmplCanvas: window.harnessTemplate.canvas === undefined
      }));

      check("★ 미래 version — 그리지 않고 기존 HOME",
        future.elements === 0 && future.tmplCanvas, JSON.stringify(future));

      /* enabled:false */
      await render(page, {
        skinPackage: skinPackage({ regions: [{ name: "home_canvas", enabled: false, canvas: canvasData() }] }),
        context: CONTEXT, width: 390, fresh: true
      });
      check("enabled:false 면 그리지 않는다", await page.evaluate(() =>
        document.querySelectorAll("[data-imory-canvas-element]").length === 0));

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("frame")) {

      section("frame");

      const { ctx, page, errors } = await openHarness(browser);

      await render(page, {
        skinPackage: skinPackage({ canvas: { elements: [] } }),
        context: CONTEXT, width: 390, fresh: true
      });
      let f = await readCanvas(page);

      check("★ 요소가 없는 캔버스도 활성이다", f.found && f.active === "true" && f.version === "1",
        JSON.stringify({ a: f.active, v: f.version }));
      check("★ 빈 캔버스가 baseHeight 비율을 갖는다(390 → 844)",
        near(f.rootW, 390, 0.6) && near(f.rootH, 844, 1), `${f.rootW}x${f.rootH}`);
      check("요소가 하나도 없다", f.ownedCount === 0, String(f.ownedCount));

      /* 긴 스크롤형 — baseHeight 가 고정값이 아니다 */
      await render(page, {
        skinPackage: skinPackage({ canvas: { elements: [], baseHeight: 1600 } }),
        context: CONTEXT, width: 390, fresh: true
      });
      f = await readCanvas(page);

      check("★ baseHeight 1600 이면 비율도 1600/390 이다",
        near(f.rootH, 390 * (1600 / 390), 1.5) && f.baseHeightVar === "1600",
        `${f.rootW}x${f.rootH} var=${f.baseHeightVar}`);

      check("요소의 가장 아래 좌표로 높이를 다시 계산하지 않는다",
        f.baseHeightVar === "1600");

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("elements")) {

      section("elements");

      const { ctx, page, errors } = await openHarness(browser);

      await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, fresh: true });
      const f = await readCanvas(page);

      check("★ 요소 수와 배열 길이가 같다",
        f.ownedCount === CANVAS_ELEMENTS.length, `${f.ownedCount}/${CANVAS_ELEMENTS.length}`);

      check("★ DOM 순서 = 배열 순서(별도 z-index 를 만들지 않는다)",
        f.elements.map((e) => e.editId).join(",") === CANVAS_ELEMENTS.map((e) => e.id).join(","),
        f.elements.map((e) => e.editId).join(","));

      check("★ 모든 요소가 data-imory-edit-id 를 받는다(Inspector 선택자)",
        f.elements.every((e) => e.editId && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(e.editId)));

      check("최상위는 항상 div 이고 종류가 속성에 있다",
        f.elements.every((e) => e.tag === "div") &&
        f.elements.map((e) => e.type).join(",") === CANVAS_ELEMENTS.map((e) => e.type).join(","));

      check("photo — 채워진 슬롯은 img 하나",
        findEl(f, "canvas_photo_filled").innerTags === "img");
      check("★ photo — 빈 슬롯이어도 wrapper 는 남고 내용은 비어 있다",
        findEl(f, "canvas_photo_empty").innerTags === "");
      check("shape — kind 가 속성으로 구분된다(칠하지 않는다)",
        findEl(f, "canvas_shape_rect").shape === "rect" &&
        findEl(f, "canvas_shape_round").shape === "ellipse" &&
        findEl(f, "canvas_shape_line").shape === "line" &&
        f.elements.filter((e) => e.type === "shape").every((e) => e.innerTags === ""));
      check("logo — 이미지가 있으면 img · alt 는 실제 블로그 제목",
        findEl(f, "canvas_logo_image").innerTags === "img" &&
        findEl(f, "canvas_logo_image").imgAlt === "SCENARIO LAY BLOG");
      check("★ logo — 슬롯이 비고 fallback:site_title 이면 제목을 글자로",
        findEl(f, "canvas_logo_text").innerTags === "span" &&
        findEl(f, "canvas_logo_text").logoText === "SCENARIO LAY BLOG");
      check("text — p 하나 · role 이 속성으로",
        findEl(f, "canvas_text_body").innerTags === "p" &&
        findEl(f, "canvas_text_body").role === "caption" &&
        findEl(f, "canvas_text_fixed").role === "title");
      check("★ text — 줄바꿈이 보존된다",
        findEl(f, "canvas_text_body").text.indexOf("\n") !== -1,
        JSON.stringify(findEl(f, "canvas_text_body").text));
      check("sticker — 채워진 슬롯은 img · alt 는 빈 문자열",
        findEl(f, "canvas_sticker").innerTags === "img" &&
        findEl(f, "canvas_sticker").imgAlt === "");
      check("category_nav — ul > li > a 구조와 mode 속성",
        findEl(f, "canvas_nav_all").innerTags === "ul,li,a,li,a" &&
        findEl(f, "canvas_nav_all").navMode === "all" &&
        findEl(f, "canvas_nav_picked").navMode === "selected",
        findEl(f, "canvas_nav_all").innerTags);

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("coords")) {

      section("coords");

      const { ctx, page, errors } = await openHarness(browser);

      await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, fresh: true });
      const at390 = await readCanvas(page);

      check("도화지가 390 × 844", near(at390.rootW, 390, 0.6) && near(at390.rootH, 844, 1),
        `${at390.rootW}x${at390.rootH}`);

      /* 390 에서는 저장 좌표가 곧 픽셀이다. hidden 요소는 상자가
         없으므로(UA 의 [hidden]) 좌표를 잴 수 없다 — [state] 가 본다. */
      const MEASURABLE = CANVAS_ELEMENTS.filter((spec) => spec.hidden !== true);

      const wrong390 = MEASURABLE.filter((spec) => {
        const el = findEl(at390, spec.id);
        if (!el) return true;
        if (!near(el.cx, spec.x + spec.width / 2, 0.6)) return true;
        if (!near(el.w, spec.width, 0.6)) return true;
        if (typeof spec.height === "number") {
          if (!near(el.cy, spec.y + spec.height / 2, 0.6)) return true;
          if (!near(el.h, spec.height, 0.6)) return true;
        } else {
          /* "auto" 는 위쪽 모서리가 y 다(높이는 내용이 정한다) */
          if (!near(el.cy - el.h / 2, spec.y, 0.8)) return true;
        }
        return false;
      });

      check("★ 390px 에서 x · y · width · height 가 저장값 그대로",
        wrong390.length === 0,
        wrong390.map((s) => {
          const el = findEl(at390, s.id);
          return `${s.id} 기대(${s.x},${s.y},${s.width},${s.height}) 실제(${el ? [el.cx, el.cy, el.w, el.h].map((n) => Math.round(n * 10) / 10).join(",") : "없음"})`;
        }).join(" | "));

      check("★ 숫자 height 와 \"auto\" 가 구분된다",
        findEl(at390, "canvas_text_fixed").heightMode === "fixed" &&
        findEl(at390, "canvas_text_body").heightMode === "auto" &&
        findEl(at390, "canvas_nav_all").heightMode === "auto" &&
        findEl(at390, "canvas_photo_filled").heightMode === "fixed");

      check("\"auto\" 요소에는 고정 height custom property 가 없다",
        findEl(at390, "canvas_text_body").vars.height === "" &&
        findEl(at390, "canvas_nav_all").vars.height === "");

      check("★ 회전은 요소 중심 기준 · 저장한 각도 그대로",
        near(findEl(at390, "canvas_shape_round").angle, 12, 0.05) &&
        near(findEl(at390, "canvas_sticker").angle, 45, 0.05) &&
        near(findEl(at390, "canvas_text_body").angle, -2, 0.05),
        [12, 45, -2].join("/") + " vs " +
        [findEl(at390, "canvas_shape_round").angle, findEl(at390, "canvas_sticker").angle, findEl(at390, "canvas_text_body").angle].join("/"));

      check("회전해도 중심은 저장 좌표의 중심이다",
        near(findEl(at390, "canvas_sticker").cx, 290 + 40, 0.6) &&
        near(findEl(at390, "canvas_sticker").cy, 470 + 40, 0.6),
        `${findEl(at390, "canvas_sticker").cx},${findEl(at390, "canvas_sticker").cy}`);

      /* 폭을 바꿔도 같은 배율 — ResizeObserver 없이 CSS 비율로 */
      for (const width of [300, 780]) {

        await render(page, { skinPackage: skinPackage(), context: CONTEXT, width });
        const at = await readCanvas(page);
        const scale = width / 390;

        check(`도화지 ${width}px — 세로도 같은 배율`,
          near(at.rootW, width, 0.6) && near(at.rootH, 844 * scale, 1.5),
          `${at.rootW}x${at.rootH}`);

        const wrong = MEASURABLE.filter((spec) => {
          const el = findEl(at, spec.id);
          if (!el) return true;
          if (!near(el.cx, (spec.x + spec.width / 2) * scale, 1)) return true;
          if (!near(el.w, spec.width * scale, 1)) return true;
          if (typeof spec.height === "number") {
            if (!near(el.cy, (spec.y + spec.height / 2) * scale, 1)) return true;
            if (!near(el.h, spec.height * scale, 1)) return true;
          }
          return false;
        });

        check(`★ 도화지 ${width}px — 네 값이 모두 같은 배율(${scale})`,
          wrong.length === 0, wrong.map((s) => s.id).join(", "));

        const rotated = findEl(at, "canvas_sticker");
        check(`도화지 ${width}px — 회전 각도는 그대로`,
          near(rotated.angle, 45, 0.05), String(rotated.angle));

      }

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("state")) {

      section("state");

      const { ctx, page, errors } = await openHarness(browser);

      await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, fresh: true });
      const f = await readCanvas(page);

      const hidden = findEl(f, "canvas_shape_line");
      const locked = findEl(f, "canvas_photo_empty");

      check("★ hidden:true — DOM 은 있지만 화면에 그려지지 않는다",
        hidden.hiddenAttr === "true" && hidden.displayed === false);

      check("hidden 요소도 배열 순서 자리를 지킨다",
        f.elements[4].editId === "canvas_shape_line");

      check("★ locked:true — 표시만 되고 모양은 바뀌지 않는다",
        locked.lockedAttr === "true" && locked.displayed === true &&
        near(locked.w, 70, 0.6) && near(locked.h, 70, 0.6));

      check("잠기지 않은 요소에는 locked 속성이 없다",
        findEl(f, "canvas_photo_filled").lockedAttr === null);

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("safety")) {

      section("safety");

      const { ctx, page, errors } = await openHarness(browser);

      await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, fresh: true });

      const safety = await page.evaluate(() => {
        const text = document.querySelector('[data-imory-edit-id="canvas_text_body"]');
        const nav = document.querySelector('[data-imory-edit-id="canvas_nav_picked"]');
        return {
          xss: window.__canvasXss === undefined,
          textInner: text.querySelector("[data-imory-canvas-text]").innerHTML,
          textImgs: text.querySelectorAll("img").length,
          navNames: Array.from(nav.querySelectorAll("[data-imory-canvas-nav-item]")).map((a) => a.textContent),
          navBold: nav.querySelectorAll("b").length
        };
      });

      check("★ 글자 안의 <img onerror> 가 실행되지 않는다", safety.xss);
      check("★ 글자는 textContent 로만 들어간다(요소가 생기지 않는다)",
        safety.textImgs === 0 && safety.textInner.indexOf("&lt;img") !== -1,
        safety.textInner.slice(0, 80));
      check("★ 카테고리 이름의 <b> 도 글자 그대로다",
        safety.navBold === 0 && safety.navNames.indexOf("<b>NOTE</b>") !== -1,
        JSON.stringify(safety.navNames));

      /* 위험한 href 는 붙지 않는다 */
      await render(page, {
        skinPackage: skinPackage(),
        context: {
          ...CONTEXT,
          navigation: {
            ...CONTEXT.navigation,
            categories: [{ id: "301", name: "EVIL", type: "post", iconKind: "post", href: "javascript:alert(1)", itemCount: null }]
          }
        },
        width: 390
      });

      check("★ 안전하지 않은 href 는 붙지 않는다(링크는 남는다)",
        await page.evaluate(() => {
          const a = document.querySelector("[data-imory-canvas-nav-item]");
          return !!a && a.getAttribute("href") === null && a.textContent === "EVIL";
        }));

      /* 위험한 이미지 슬롯 값 */
      await render(page, {
        skinPackage: skinPackage(),
        context: { ...CONTEXT, images: { ...CONTEXT.images, photo_1: "javascript:alert(1)" } },
        width: 390
      });

      check("★ 안전하지 않은 이미지 주소는 img 자체를 만들지 않는다",
        await page.evaluate(() =>
          document.querySelector('[data-imory-edit-id="canvas_photo_filled"]').children.length === 0));

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("image")) {

      section("image");

      const { ctx, page, errors } = await openHarness(browser);

      /*
        ★ 틀과 비율이 다른 그림을 넣는다.

          canvas_photo_filled  260×320 세로 틀  ← 120×40 가로긴 그림
          canvas_sticker        80×80  정사각 틀 ← 40×120 세로긴 그림
          canvas_logo_image     60×40  가로 틀  ← photo_1(가로긴 그림)

        ★ 자르기 정보는 지금 Canvas payload 에 **없다**(계약 §21-3).
          그래서 여기서 재는 것은 "고르지 않았을 때의 기본값"이다.
      */
      await render(page, {
        skinPackage: skinPackage(),
        context: {
          ...CONTEXT,
          images: {
            ...CONTEXT.images,
            photo_1: FIXTURE_WIDE_PATH,
            sticker_1: FIXTURE_TALL_PATH
          }
        },
        width: 390,
        fresh: true
      });

      const shown = await page.evaluate(() => {

        const read = (id) => {

          const img =
            document.querySelector(`[data-imory-edit-id="${id}"] img`);

          if (!img) return null;

          const box = img.getBoundingClientRect();
          const wrap = img.parentElement.getBoundingClientRect();

          const nat = { w: img.naturalWidth, h: img.naturalHeight };

          /* contain 과 cover 가 각각 그려 낼 크기 — CSS 규칙을 그대로
             적은 것이고, 둘 중 어느 쪽이 실제인지는 objectFit 이 말한다 */
          const containK = Math.min(box.width / nat.w, box.height / nat.h);
          const coverK = Math.max(box.width / nat.w, box.height / nat.h);

          return {
            fit: getComputedStyle(img).objectFit,
            nat: nat,
            box: { w: box.width, h: box.height },
            wrap: { w: wrap.width, h: wrap.height },
            contain: { w: nat.w * containK, h: nat.h * containK },
            cover: { w: nat.w * coverK, h: nat.h * coverK },
            loaded: img.complete && img.naturalWidth > 0
          };

        };

        return {
          photo: read("canvas_photo_filled"),
          sticker: read("canvas_sticker"),
          logo: read("canvas_logo_image")
        };

      });

      for (const [key, label, natRatio] of [
        ["photo", "photo — 가로긴 그림(120×40)을 세로 틀(260×320)에", 3],
        ["sticker", "sticker — 세로긴 그림(40×120)을 정사각 틀에", 1 / 3],
        ["logo", "logo — 가로긴 그림을 가로 틀(60×40)에", 3]
      ]) {

        const m = shown[key];

        check(`${label} — 그림이 로드됐다`,
          !!m && m.loaded === true, JSON.stringify(m && m.nat));

        check(`★ ${label} — object-fit 이 contain 이다(자르지 않는다)`,
          !!m && m.fit === "contain", String(m && m.fit));

        check(`★ ${label} — 그려진 그림이 틀 안에 전부 들어온다`,
          !!m &&
          m.contain.w <= m.box.w + 0.5 && m.contain.h <= m.box.h + 0.5,
          `그림 ${m && m.contain.w.toFixed(1)}×${m && m.contain.h.toFixed(1)} ` +
          `틀 ${m && m.box.w.toFixed(1)}×${m && m.box.h.toFixed(1)}`);

        check(`★ ${label} — 비율이 그대로다(늘여 비틀지 않는다)`,
          !!m && Math.abs(m.contain.w / m.contain.h - natRatio) < 0.01,
          `${m && (m.contain.w / m.contain.h).toFixed(4)} vs ${natRatio.toFixed(4)}`);

        check(`${label} — cover 였다면 실제로 잘렸을 비율이다(이 절이 그 차이를 재고 있다)`,
          !!m &&
          (m.cover.w > m.box.w + 1 || m.cover.h > m.box.h + 1),
          `cover ${m && m.cover.w.toFixed(1)}×${m && m.cover.h.toFixed(1)}`);

        check(`${label} — img 자체는 틀을 그대로 채운다(레이아웃은 안 바뀐다)`,
          !!m &&
          Math.abs(m.box.w - m.wrap.w) <= 0.5 &&
          Math.abs(m.box.h - m.wrap.h) <= 0.5,
          `img ${m && m.box.w.toFixed(1)}×${m && m.box.h.toFixed(1)} ` +
          `wrapper ${m && m.wrap.w.toFixed(1)}×${m && m.wrap.h.toFixed(1)}`);

      }

      /* --- 정사각 그림 → 긴 틀 --- */

      await render(page, {
        skinPackage: skinPackage(),
        context: CONTEXT,
        width: 390
      });

      const square = await page.evaluate(() => {

        const img =
          document.querySelector('[data-imory-edit-id="canvas_photo_filled"] img');

        if (!img) return null;

        const box = img.getBoundingClientRect();
        const k = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);

        return {
          fit: getComputedStyle(img).objectFit,
          nat: { w: img.naturalWidth, h: img.naturalHeight },
          box: { w: box.width, h: box.height },
          drawn: { w: img.naturalWidth * k, h: img.naturalHeight * k }
        };

      });

      check("★ 정사각 그림(80×80)을 긴 틀(260×320)에 — 전체가 보이고 정사각이다",
        square && square.fit === "contain" &&
        Math.abs(square.drawn.w - square.drawn.h) < 0.01 &&
        square.drawn.h <= square.box.h + 0.5,
        JSON.stringify(square));

      check("★ 그래서 세로로 빈 자리가 남는다(계약이 허용하는 그 빈 자리)",
        square && square.box.h - square.drawn.h > 1,
        `${square && (square.box.h - square.drawn.h).toFixed(1)}px`);

      /* --- 빈 자리를 임의의 배경으로 칠하지 않는다 --- */

      const paint = await page.evaluate(() => {

        const el =
          document.querySelector('[data-imory-edit-id="canvas_photo_filled"]');

        const img = el.querySelector("img");

        const cs = getComputedStyle(img);
        const wrapCs = getComputedStyle(el);

        return {
          imgBackground: cs.backgroundColor,
          imgImage: cs.backgroundImage,
          wrapBackground: wrapCs.backgroundColor
        };

      });

      check("★ 플랫폼이 빈 자리를 칠하지 않는다(칠은 스킨 CSS 의 몫)",
        paint.imgBackground === "rgba(0, 0, 0, 0)" &&
        paint.imgImage === "none",
        JSON.stringify(paint));

      check("pageerror 0", errors.length === 0, errors[0] || "");

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("content")) {

      section("content");

      const { ctx, page, errors } = await openHarness(browser);

      await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, fresh: true });
      const f = await readCanvas(page);

      check("★ 채워진 슬롯은 그 주소를 그대로 쓴다(새 저장 방식 없음)",
        findEl(f, "canvas_photo_filled").imgSrc === FIXTURE_IMAGE_PATH,
        String(findEl(f, "canvas_photo_filled").imgSrc));

      check("이미지가 실제로 로드된다",
        await page.evaluate(() => {
          const img = document.querySelector('[data-imory-edit-id="canvas_photo_filled"] img');
          return !!img && img.complete && img.naturalWidth > 0;
        }));

      check("★ category_nav mode:all — 표시 가능한 카테고리 전체를 순서대로",
        JSON.stringify(findEl(f, "canvas_nav_all").links.map((l) => l.name)) ===
        JSON.stringify(["LOG", "<b>NOTE</b>"]),
        JSON.stringify(findEl(f, "canvas_nav_all").links));

      check("★ category_nav mode:selected — categoryIds 순서대로 · 없는 id 는 건너뛴다",
        JSON.stringify(findEl(f, "canvas_nav_picked").links.map((l) => l.name)) ===
        JSON.stringify(["<b>NOTE</b>", "LOG"]),
        JSON.stringify(findEl(f, "canvas_nav_picked").links));

      check("없는 id 를 건너뛰어도 저장 데이터는 그대로다",
        await page.evaluate(() =>
          window.harnessTemplate.canvas.elements
            .find((e) => e.id === "canvas_nav_picked").props.categoryIds.length === 3));

      check("★ 링크는 버튼이 아니라 실제 a[href] 이고 기존 내부 주소를 쓴다",
        findEl(f, "canvas_nav_all").links.every((l) => typeof l.href === "string" && l.href.startsWith("/scenario-lay/")),
        JSON.stringify(findEl(f, "canvas_nav_all").links.map((l) => l.href)));

      /* 내부 링크가 문서를 떠나지 않는다(공개 화면의 SPA 라우팅 자리) */
      await page.evaluate(() => { window.harnessNavigations.length = 0; });
      await page.click('[data-imory-edit-id="canvas_nav_all"] a');
      check("캔버스 카테고리 클릭이 내부 이동 경로로 간다",
        await page.evaluate(() => window.harnessNavigations[0] === "/scenario-lay/category/301"),
        JSON.stringify(await page.evaluate(() => window.harnessNavigations)));

      /* 카테고리가 하나도 없으면 wrapper 만 */
      await render(page, {
        skinPackage: skinPackage(),
        context: { ...CONTEXT, navigation: { ...CONTEXT.navigation, categories: [] } },
        width: 390
      });
      check("★ 카테고리가 없으면 wrapper 만 남는다(가짜 항목 없음)",
        await page.evaluate(() =>
          document.querySelector('[data-imory-edit-id="canvas_nav_all"]').children.length === 0));

      /* 제목이 비면 fallback 글자도 없다 */
      await render(page, {
        skinPackage: skinPackage(),
        context: { ...CONTEXT, site: { ...CONTEXT.site, title: "" } },
        width: 390
      });
      check("블로그 제목이 비면 로고 fallback 도 가짜 글자를 만들지 않는다",
        await page.evaluate(() =>
          document.querySelector('[data-imory-edit-id="canvas_logo_text"]').children.length === 0));

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("rerender")) {

      section("rerender");

      const { ctx, page, errors } = await openHarness(browser);

      await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, fresh: true });

      /* 같은 표식에 여러 번 — 렌더러를 직접 부른다(renderSkin 은 매번
         컨테이너를 비우므로 이 규칙을 따로 확인해야 한다) */
      const repeat = await page.evaluate(() => {
        const root = document.querySelector("[data-skin-root]");
        const marker = root.querySelector("[data-imory-canvas-root]");

        /* 스킨이 표식 안에 직접 적어 둔 자식이 있다고 가정한다 */
        const own = document.createElement("i");
        own.className = "skin-owned";
        marker.insertBefore(own, marker.firstChild);
        marker.classList.add("skin-added-class");

        const canvas = window.harnessTemplate.canvas;
        const context = { site: { title: "SCENARIO LAY BLOG" }, navigation: { categories: [] }, images: {} };

        window.compileSkinHomeCanvas(root, canvas, context);
        window.compileSkinHomeCanvas(root, canvas, context);
        window.compileSkinHomeCanvas(root, canvas, context);

        return {
          elements: marker.querySelectorAll(":scope > [data-imory-canvas-element]").length,
          skinOwned: marker.querySelectorAll(".skin-owned").length,
          keepsClass: marker.classList.contains("skin-added-class"),
          markerStill: marker.hasAttribute("data-imory-canvas-root")
        };
      });

      check("★ 같은 표식에 세 번 그려도 요소가 중복되지 않는다",
        repeat.elements === CANVAS_ELEMENTS.length, String(repeat.elements));
      check("★ 스킨이 표식 안에 적어 둔 자식은 지워지지 않는다", repeat.skinOwned === 1);
      check("표식과 스킨이 준 class · 속성은 그대로", repeat.keepsClass && repeat.markerStill);

      /* 캔버스가 사라지면 만든 DOM 과 활성 표시만 정리 */
      const cleared = await page.evaluate(() => {
        const root = document.querySelector("[data-skin-root]");
        const marker = root.querySelector("[data-imory-canvas-root]");
        window.compileSkinHomeCanvas(root, undefined, {});
        return {
          elements: marker.querySelectorAll("[data-imory-canvas-element]").length,
          active: marker.hasAttribute("data-imory-canvas-active"),
          version: marker.hasAttribute("data-imory-canvas-version"),
          baseVar: marker.style.getPropertyValue("--imory-canvas-base-width"),
          skinOwned: marker.querySelectorAll(".skin-owned").length,
          keepsClass: marker.classList.contains("skin-added-class"),
          markerStill: marker.hasAttribute("data-imory-canvas-root")
        };
      });

      check("★ 캔버스가 사라지면 만든 DOM 과 활성 표시만 정리한다",
        cleared.elements === 0 && cleared.active === false && cleared.version === false &&
        cleared.baseVar === "" && cleared.markerStill,
        JSON.stringify(cleared));
      check("정리해도 스킨의 자식 · class 는 남는다",
        cleared.skinOwned === 1 && cleared.keepsClass);

      /* 입력 데이터와 Context 를 고치지 않는다 */
      const nonMutation = await page.evaluate(() => {
        const root = document.querySelector("[data-skin-root]");
        const canvas = JSON.parse(JSON.stringify(window.harnessTemplate.canvas));
        const context = {
          site: { title: "SCENARIO LAY BLOG" },
          navigation: { categories: [{ id: "301", name: "LOG", href: "/scenario-lay/category/301" }] },
          images: { photo_1: null, photo_empty: null, logo_empty: null, sticker_1: null }
        };
        const canvasBefore = JSON.stringify(canvas);
        const contextBefore = JSON.stringify(context);
        window.compileSkinHomeCanvas(root, canvas, context);
        return {
          canvasSame: JSON.stringify(canvas) === canvasBefore,
          contextSame: JSON.stringify(context) === contextBefore
        };
      });

      check("★ 입력 Canvas 데이터를 mutate 하지 않는다", nonMutation.canvasSame);
      check("★ Context 를 mutate 하지 않는다", nonMutation.contextSame);

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("v2-flow")) {

      section("v2-flow");

      /* Studio 편집 라이브러리가 공개 화면에서 절대 받아지지 않는가 */
      const vendorHits = [];

      const { ctx, page, errors } = await openHarness(browser);

      page.on("request", (req) => {
        if (/\/studio\/vendor\//.test(req.url())) {
          vendorHits.push(req.url());
        }
      });

      const v2Package = (over) =>
        skinPackage({ regions: [{ name: "home_canvas", enabled: true, canvas: v2CanvasData(over) }] });

      const source = v2Package();
      const sourceBefore = JSON.stringify(source);

      await render(page, { skinPackage: source, context: CONTEXT, width: 390, fresh: true });

      const r = await readV2Canvas(page);

      /* 배율 1 — 아래 기대값이 그대로 px 이다 */
      const s = r.rootW / 390;

      /* ★ HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 층은 **문서 흐름 안**이다
         (계약 §29-1). 예전에는 `position:absolute; inset:0` 이었고,
         그래서 내용이 baseHeight 를 넘으면 도화지가 그 자리에서
         끝나 스킨 배경이 끊겼다. 지금은 높이를 내용이 정하고
         baseHeight 는 **최소**다. */
      check("★ 도화지가 v2 로 활성화되고 흐름 층이 하나 생긴다",
        r.active === "true" && r.version === "2" && r.hasFlow &&
        r.flowDirection === "column" &&
        r.flowPosition === "relative" && r.flowDisplay === "flex",
        JSON.stringify({ v: r.version, f: r.hasFlow, p: r.flowPosition, d: r.flowDisplay }));

      check("★ 배율 1 — 도화지가 baseWidth · baseHeight 비율이다(390 × 1000)",
        near(s, 1, 0.01) && near(r.rootH, 1000, 1.5), `${r.rootW} × ${r.rootH}`);

      check("★ flow.padding 네 칸이 baseWidth 자로 풀린다(40 · 20 · 30 · 20)",
        near(r.padTop, 40) && near(r.padRight, 20) &&
        near(r.padBottom, 30) && near(r.padLeft, 20),
        JSON.stringify([r.padTop, r.padRight, r.padBottom, r.padLeft]));

      /* ---- 블록 배열 순서와 종류 ---- */

      check("★ 블록 배열 순서가 곧 위에서 아래 순서다(숨긴 것도 DOM 에는 남는다)",
        same(r.blocks.map((b) => b.editId), V2_BLOCKS.map((b) => b.id)),
        r.blocks.map((b) => b.editId).join(","));

      check("★ 블록은 자유 배치 요소가 아니다(position 이 absolute 가 아니고 element 표식도 없다)",
        r.blocks.every((b) => b.position !== "absolute" && b.isElementAttr === false));

      check("★ 종류가 전부 최상위 div 에 붙는다(logo · divider · text · category_nav · main_visual)",
        same(r.blocks.map((b) => b.type),
          ["logo", "divider", "text", "divider", "category_nav", "text",
            "main_visual", "main_visual"]) &&
        r.blocks.every((b) => b.tag === "div"),
        r.blocks.map((b) => b.type).join(","));

      const logo = findBlock(r, "canvas_v2logo");
      const title = findBlock(r, "canvas_v2title");
      const rule = findBlock(r, "canvas_v2rule");
      const nav = findBlock(r, "canvas_v2nav");
      const clamp = findBlock(r, "canvas_v2wide");
      const frame = findBlock(r, "canvas_v2main");
      const gone = findBlock(r, "canvas_v2gone");

      /* ---- 종류별 DOM — v1 과 같은 안쪽 태그 · 같은 속성 ---- */

      check("★ logo 블록 — 빈 슬롯이면 블로그 제목으로 떨어진다(v1 과 같은 재료)",
        logo.logoText === CONTEXT.site.title && logo.imgSrc === null &&
        logo.innerTags === "span",
        JSON.stringify({ t: logo.logoText, i: logo.innerTags }));

      check("★ text 블록 — p 하나에 저장된 글자, role 은 속성으로",
        title.innerTags === "p" && title.text === "FLOW TITLE" &&
        title.role === "title" && clamp.role === "label");

      check("★ divider 블록 — 상자 하나뿐이다(플랫폼이 선을 그리지 않는다)",
        rule.childCount === 0 && rule.innerTags === "" && rule.role === null,
        JSON.stringify({ c: rule.childCount, i: rule.innerTags }));

      check("★ category_nav 블록 — ul/li/a 와 nav-mode 속성이 v1 과 같다",
        nav.navMode === "selected" &&
        nav.innerTags === "ul,li,a,li,a" &&
        same(nav.links.map((l) => l.name), ["<b>NOTE</b>", "LOG"]),
        nav.innerTags);

      check("★ category 링크가 Context 의 주소를 그대로 쓴다(기존 SPA 탐색이 가져간다)",
        same(nav.links.map((l) => l.href),
          ["/scenario-lay/category/302", "/scenario-lay/category/301"]),
        JSON.stringify(nav.links));

      check("★ main_visual — 외곽 프레임 표식 위에 내부 요소가 배열 순서로 그려진다",
        frame.isFrame === true && frame.childCount === 5 &&
        same(frame.inner.map((n) => n.editId),
          ["canvas_v2paper", "canvas_v2photo", "canvas_v2label", "canvas_v2tag", "canvas_v2cap"]),
        JSON.stringify({ c: frame.childCount, ids: frame.inner.map((n) => n.editId) }));

      check("★ main_visual 내부 좌표의 자를 변수로 남긴다(스킨 CSS 가 본다)",
        frame.frameBaseW === "150" && frame.frameBaseH === "80",
        `${frame.frameBaseW} / ${frame.frameBaseH}`);

      /* ---- 가로: 정렬 · width · maxWidth · margin ---- */

      check("★ align left — padding.left 에 붙고 width 가 저장값이다(x=20 · w=120)",
        near(logo.x, 20) && near(logo.w, 120), `${logo.x} / ${logo.w}`);

      check("★ align center — 가용 폭(350)의 가운데(x=45 · w=300)",
        near(title.x, 45) && near(title.w, 300), `${title.x} / ${title.w}`);

      check("★ align right — margin.right 가 더 밀고 margin.left 는 쓰이지 않는다(x=240)",
        near(rule.x, 240) && near(rule.w, 120) && near(rule.marginLeft, 999),
        `${rule.x} / ${rule.w} / ml=${rule.marginLeft}`);

      check("★ align stretch — 좌우 margin 이 폭을 깎는다(350−8−12=330 · x=28)",
        near(nav.x, 28) && near(nav.w, 330), `${nav.x} / ${nav.w}`);

      check("★ stretch + maxWidth — 120 에서 멈추고 **그 뒤 가운데**다(x=135 · w=120)",
        near(clamp.x, 135) && near(clamp.w, 120), `${clamp.x} / ${clamp.w}`);

      check("★ align center 의 main_visual 도 같은 자다(x=45 · w=300)",
        near(frame.x, 45) && near(frame.w, 300), `${frame.x} / ${frame.w}`);

      /* ---- 세로: 숫자 height · auto · gap+margin 합산 · hidden ---- */

      check("★ 숫자 height 는 baseHeight 자로 풀린다(logo 40 · rule 2 · clamp 30 · frame 200)",
        logo.heightMode === "fixed" && near(logo.h, 40) &&
        near(rule.h, 2) && near(clamp.h, 30) && near(frame.h, 200),
        JSON.stringify([logo.h, rule.h, clamp.h, frame.h]));

      check("★ height \"auto\" 는 실제 내용 높이다(0 보다 크고 고정값이 아니다)",
        title.heightMode === "auto" && nav.heightMode === "auto" &&
        title.h > 0 && nav.h > 0, `${title.h} / ${nav.h}`);

      check("★ 첫 블록 위에는 gap 이 없다 — padding.top 만이다(y=40)",
        near(logo.y, 40) && near(logo.marginTop, 0), `${logo.y} / ${logo.marginTop}`);

      check("★ hidden 블록은 자리를 차지하지 않는다(아래가 올라온다)",
        gone.hiddenAttr === "true" && gone.displayed === false && near(gone.h, 0),
        JSON.stringify({ d: gone.displayed, h: gone.h }));

      check("★ gap 과 margin 은 **합산**이고 collapse 하지 않는다(10+6=16 · 4+10=14)",
        near(title.y - (logo.y + logo.h), 16) &&
        near(rule.y - (title.y + title.h), 14),
        `${title.y - (logo.y + logo.h)} / ${rule.y - (title.y + title.h)}`);

      check("★ 숨긴 블록을 건너뛰어도 gap 이 두 번 붙지 않는다(logo 다음이 곧 title)",
        near(title.marginTop, 16), String(title.marginTop));

      check("★ margin.top 이 gap 과 함께 계산된 뒤에도 margin.bottom 은 자기 값이다",
        near(title.marginBottom, 4) && near(frame.marginTop, 22),
        `${title.marginBottom} / ${frame.marginTop}`);

      check("★ 내용이 길어져도 자르지 않는다(마지막 블록이 도화지 안에서 끝나고 overflow 를 정하지 않는다)",
        await page.evaluate(() => {
          const flow = document.querySelector("[data-imory-canvas-flow]");
          const cs = getComputedStyle(flow);
          return cs.overflowX === "visible" && cs.overflowY === "visible";
        }));

      /* ---- 자유 장식(overlays) ---- */

      /* ★ HOME-CANVAS-V2-MANUAL-FIX-1 — v2 의 자유 장식은 네 칸 전부
         **도화지 폭의 자**(100cqw)다(계약 §29-1). 도화지가 내용을
         따라 길어져도 y=920 인 장식이 함께 내려가지 않게 하는 값이고,
         실제 자리는 바로 아래 절이 px 로 다시 잰다(같은 배율이다).
         v1 요소는 지금도 백분율이다. */
      check("★ overlays 는 도화지 폭의 자로 네 칸을 쓴다(v2)",
        r.overlays.length === 1 &&
        r.overlays[0].position === "absolute" &&
        r.overlays[0].vars.x === "calc(-20 / 390 * 100cqw)" &&
        r.overlays[0].vars.y === "calc(900 / 390 * 100cqw)" &&
        r.overlays[0].vars.width === "calc(100 / 390 * 100cqw)" &&
        r.overlays[0].vars.height === "calc(40 / 390 * 100cqw)" &&
        r.overlays[0].vars.rotation === "15deg",
        JSON.stringify(r.overlays[0] && r.overlays[0].vars));

      check("★ overlay 의 실제 자리와 각도(중심 x=30 · y=920 · 15°)",
        near(r.overlays[0].cx, 30, 1) && near(r.overlays[0].cy, 920, 1) &&
        near(r.overlays[0].angle, 15, 0.1) &&
        near(r.overlays[0].w, 100, 1) && near(r.overlays[0].h, 40, 1),
        JSON.stringify([r.overlays[0].cx, r.overlays[0].cy, r.overlays[0].angle]));

      check("★ overlay 가 흐름을 밀어내지 않는다(자유 층은 흐름 바깥이다)",
        r.overlays[0].isOverlay === true && r.ownedCount === 2,
        String(r.ownedCount));

      /* ---- 같은 배율 ---- */

      await render(page, { skinPackage: v2Package(), context: CONTEXT, width: 780, fresh: true });

      const wide = await readV2Canvas(page);

      const wideLogo = findBlock(wide, "canvas_v2logo");
      const wideRule = findBlock(wide, "canvas_v2rule");
      const wideNav = findBlock(wide, "canvas_v2nav");
      const wideClamp = findBlock(wide, "canvas_v2wide");

      check("★ 780px 에서 가로 자리와 숫자 크기가 정확히 두 배다",
        near(wide.rootW, 780, 1) &&
        near(wideLogo.x, 40) && near(wideLogo.w, 240) && near(wideLogo.h, 80) &&
        near(wideRule.x, 480) && near(wideRule.w, 240) &&
        near(wideNav.x, 56) && near(wideNav.w, 660) &&
        near(wideClamp.x, 270) && near(wideClamp.w, 240),
        JSON.stringify([wideLogo.x, wideLogo.w, wideRule.x, wideNav.w, wideClamp.x]));

      check("★ padding · gap · margin 도 같은 배율이다(padding.top 80 · gap+margin 32)",
        near(wide.padTop, 80) && near(wide.padLeft, 40) &&
        near(findBlock(wide, "canvas_v2title").marginTop, 32),
        `${wide.padTop} / ${findBlock(wide, "canvas_v2title").marginTop}`);

      check("★ 부모 폭이 달라져도 overlay 는 같은 백분율 문자열이다(중복 보정 없음)",
        wide.overlays[0].vars.x === r.overlays[0].vars.x &&
        wide.overlays[0].vars.width === r.overlays[0].vars.width &&
        near(wide.overlays[0].w, 200, 1.5));

      /* ---- 재렌더 · 정리 · 입력 불변 ---- */

      await render(page, { skinPackage: v2Package(), context: CONTEXT, width: 390, fresh: true });

      const repeat = await page.evaluate(() => {
        const root = document.querySelector("[data-skin-root]");
        const marker = root.querySelector("[data-imory-canvas-root]");
        const own = document.createElement("i");
        own.className = "skin-owned";
        marker.insertBefore(own, marker.firstChild);
        const canvas = window.harnessTemplate.canvas;
        const context = { site: { title: "SCENARIO LAY BLOG" }, navigation: { categories: [] }, images: {} };
        window.compileSkinHomeCanvas(root, canvas, context);
        window.compileSkinHomeCanvas(root, canvas, context);
        return {
          flows: marker.querySelectorAll(":scope > [data-imory-canvas-flow]").length,
          blocks: marker.querySelectorAll("[data-imory-canvas-block]").length,
          overlays: marker.querySelectorAll(":scope > [data-imory-canvas-element]").length,
          skinOwned: marker.querySelectorAll(".skin-owned").length
        };
      });

      check("★ 세 번 그려도 흐름 층 하나 · 블록 여덟 · 장식 하나다(중복 0)",
        repeat.flows === 1 && repeat.blocks === V2_BLOCKS.length && repeat.overlays === 1,
        JSON.stringify(repeat));

      check("★ 스킨이 표식 안에 적어 둔 자식은 v2 에서도 지워지지 않는다",
        repeat.skinOwned === 1);

      const cleared = await page.evaluate(() => {
        const root = document.querySelector("[data-skin-root]");
        const marker = root.querySelector("[data-imory-canvas-root]");
        window.compileSkinHomeCanvas(root, undefined, {});
        return {
          flows: marker.querySelectorAll("[data-imory-canvas-flow]").length,
          blocks: marker.querySelectorAll("[data-imory-canvas-block]").length,
          active: marker.hasAttribute("data-imory-canvas-active"),
          skinOwned: marker.querySelectorAll(".skin-owned").length
        };
      });

      check("★ 캔버스가 사라지면 흐름 층까지 정리한다(스킨 자식은 남는다)",
        cleared.flows === 0 && cleared.blocks === 0 &&
        cleared.active === false && cleared.skinOwned === 1,
        JSON.stringify(cleared));

      check("★ 입력 SkinPackage 를 렌더 경로가 한 칸도 고치지 않는다",
        JSON.stringify(source) === sourceBefore);

      /* ---- fallback — 잘못된 v2 · 모르는 version ---- */

      const badV2 = v2Package();
      badV2.regions[0].canvas.flow.blocks =
        [{ id: "canvas_bad", type: "logo", width: 120, height: "auto", props: { slot: "logo_empty" } }];
      const badBefore = JSON.stringify(badV2);

      await render(page, { skinPackage: badV2, context: CONTEXT, width: 390, fresh: true });

      const bad = await page.evaluate(() => ({
        flows: document.querySelectorAll("[data-imory-canvas-flow]").length,
        blocks: document.querySelectorAll("[data-imory-canvas-block]").length,
        active: document.querySelectorAll("[data-imory-canvas-active]").length,
        tmplCanvas: window.harnessTemplate.canvas === undefined
      }));

      check("★ 잘못된 v2(logo 의 auto 높이) — 그리지 않고 기존 HOME 이다",
        bad.flows === 0 && bad.blocks === 0 && bad.active === 0 && bad.tmplCanvas,
        JSON.stringify(bad));

      check("잘못된 v2 를 렌더 경로가 고치지도 지우지도 않는다",
        JSON.stringify(badV2) === badBefore);

      const futureV2 = v2Package({ version: 3 });

      await render(page, { skinPackage: futureV2, context: CONTEXT, width: 390, fresh: true });

      const future = await page.evaluate(() => ({
        flows: document.querySelectorAll("[data-imory-canvas-flow]").length,
        active: document.querySelectorAll("[data-imory-canvas-active]").length,
        tmplCanvas: window.harnessTemplate.canvas === undefined
      }));

      check("★ version 3 은 여전히 기존 HOME 이다(보존만 하고 실행하지 않는다)",
        future.flows === 0 && future.active === 0 && future.tmplCanvas,
        JSON.stringify(future));

      /* ---- v1 회귀 ---- */

      await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, fresh: true });

      const back = await readCanvas(page);

      check("★ v1 회귀 — 같은 문서에서 v1 이 그대로 그려진다(흐름 층 없음)",
        back.version === "1" &&
        back.ownedCount === CANVAS_ELEMENTS.length &&
        await page.evaluate(() =>
          document.querySelectorAll("[data-imory-canvas-flow],[data-imory-canvas-block],[data-imory-canvas-overlay]").length === 0),
        JSON.stringify({ v: back.version, n: back.ownedCount }));

      check("★ 공개 화면이 Studio 편집 라이브러리를 한 번도 받지 않는다",
        vendorHits.length === 0, vendorHits.join(" | "));

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("grow")) {

      section("grow");

      /* =================================================
         도화지가 내용을 따라 자란다 (V2-MANUAL-FIX-1 · 계약 §29-1)

         주인이 수동 테스트에서 찾은 현상: `height:"auto"` 글자를
         길게 고치면 아래 블록은 밀리는데 **스킨이 칠한 배경이 그
         전에 끝났다**. 도화지가 `aspect-ratio` 로 세로를 확정하고
         흐름 층이 그 상자 밖으로 넘쳤기 때문이다.

         여기서 보는 것은 셋이다.

           1. 짧은 내용에서는 지금까지와 **정확히 같다**(baseHeight)
           2. 긴 내용에서는 도화지 · 배경이 **함께** 길어진다
           3. 그래도 숫자 height 인 블록은 저장값 그대로다
              (세로값의 자가 도화지 폭이라 흐름 길이에 흔들리지 않는다)
      ================================================== */

      const { ctx, page, errors } = await openHarness(browser, { width: 500, height: 900 });

      /* 배경을 칠하는 것은 **스킨**이다 — 도화지를 감싼 상자에
         색을 주고, 그 상자가 어디서 끝나는지를 잰다. */
      const growHtml =
        '<div class="hc-home grow-page">' +
        '<div class="hc-canvas" data-imory-canvas-root></div>' +
        "</div>";

      const growCss =
        CANVAS_CSS +
        " .grow-page { background: rgb(240, 230, 210); }" +
        " .hc-canvas { width: 100%; }";

      const growPackage = (text) =>
        skinPackage({
          homeHtml: growHtml,
          css: growCss,
          regions: [{
            name: "home_canvas",
            enabled: true,
            canvas: v2CanvasData({
              flow: {
                direction: "column",
                padding: { top: 40, right: 20, bottom: 30, left: 20 },
                gap: 10,
                blocks: [
                  { id: "canvas_g1", type: "logo", width: 120, height: 40,
                    align: "left", props: { slot: "title_logo", fallback: "site_title" } },
                  { id: "canvas_g2", type: "text", width: 300, height: "auto",
                    align: "left", props: { text: text, role: "body" } }
                ]
              },
              overlays: [
                { id: "canvas_gover", type: "text", x: 20, y: 900,
                  width: 100, height: 40, rotation: 0,
                  props: { text: "over", role: "label" } }
              ]
            })
          }]
        });

      const readGrow = (p) => p.evaluate(() => {
        const root = document.querySelector("[data-imory-canvas-root]");
        const flow = document.querySelector("[data-imory-canvas-flow]");
        const page = document.querySelector(".grow-page");
        const logo = document.querySelector('[data-imory-edit-id="canvas_g1"]');
        const over = document.querySelector('[data-imory-edit-id="canvas_gover"]');
        const r = (el) => {
          const box = el.getBoundingClientRect();
          return { top: box.top, height: box.height, bottom: box.bottom };
        };
        return {
          rootWidth: root.getBoundingClientRect().width,
          root: r(root),
          flow: r(flow),
          flowScroll: flow.scrollHeight,
          page: r(page),
          logoHeight: logo.getBoundingClientRect().height,
          overTop: over.getBoundingClientRect().top - root.getBoundingClientRect().top
        };
      });

      await render(page, { skinPackage: growPackage("짧은 한 줄"), context: CONTEXT, width: 390, fresh: true });

      const short = await readGrow(page);

      /* 배율 1 — baseHeight 1000 이 그대로 px 이다 */
      check("★ 짧은 내용에서는 도화지가 baseHeight 그대로다(지금까지와 같다)",
        near(short.rootWidth, 390, 1) && near(short.root.height, 1000, 1.5),
        `${short.rootWidth} × ${short.root.height}`);

      check("★ 흐름 층은 문서 흐름 안에 있고 도화지를 꽉 채운다",
        near(short.flow.height, short.root.height, 0.5) &&
        near(short.flow.top, short.root.top, 0.5),
        JSON.stringify({ flow: short.flow.height, root: short.root.height }));

      await render(page, {
        skinPackage: growPackage("길어진 글 ".repeat(320)),  /* 글자 상한(2000) 아래 */
        context: CONTEXT, width: 390, fresh: true
      });

      const tall = await readGrow(page);

      check("★ 내용이 baseHeight 를 넘으면 도화지가 그만큼 길어진다",
        tall.root.height > 1000 &&
        near(tall.root.height, tall.flowScroll, 2),
        JSON.stringify({ root: tall.root.height, content: tall.flowScroll }));

      check("★ 스킨이 칠한 배경이 그 끝까지 이어진다(현상 1 의 그 자리)",
        near(tall.page.bottom, tall.root.bottom, 1) &&
        tall.page.height >= tall.root.height - 1,
        JSON.stringify({ page: tall.page.bottom, root: tall.root.bottom }));

      check("★ 숫자 height 인 블록은 내용이 길어져도 저장값 그대로다(40)",
        near(short.logoHeight, 40, 0.5) && near(tall.logoHeight, 40, 0.5),
        JSON.stringify({ short: short.logoHeight, tall: tall.logoHeight }));

      check("★ 페이지 자유 장식도 도화지가 길어져도 제자리다(y=900)",
        near(short.overTop, 900, 1) && near(tall.overTop, 900, 1),
        JSON.stringify({ short: short.overTop, tall: tall.overTop }));

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("v2-frame")) {

      section("v2-frame");

      /* =================================================
         main_visual 내부 — 사진과 주변 장식 (V2-MAIN-VISUAL-1)

         손으로 검산한 기대값은 V2_BLOCKS 의 6번 블록 주석에 있다.
         도화지 폭을 390 으로 두면 S_page = 1 이라 아래 숫자가 그대로
         px 이고, 좌표는 전부 **프레임 상자 기준** 상대값이다.
      ================================================== */

      const { ctx, page, errors } = await openHarness(browser, { width: 390, height: 900 });

      /* 프레임 하나만 바꿔 다시 그린다 — 다른 블록은 [v2-flow] 가 본다 */
      const framePackage = (mutate) => {
        const canvas = JSON.parse(JSON.stringify(v2CanvasData()));
        const main = canvas.flow.blocks.find((b) => b.id === "canvas_v2main");
        if (mutate) mutate(main, canvas);
        return skinPackage({
          regions: [{ name: "home_canvas", enabled: true, canvas: canvas }]
        });
      };

      await render(page, { skinPackage: framePackage(), context: CONTEXT, width: 390, fresh: true });

      const r = await readV2Canvas(page);

      const frame = findBlock(r, "canvas_v2main");
      const auto = findBlock(r, "canvas_v2auto");

      const at = (reading, blockId, id) =>
        findBlock(reading, blockId).inner.find((n) => n.editId === id);

      const paper = at(r, "canvas_v2main", "canvas_v2paper");
      const photo = at(r, "canvas_v2main", "canvas_v2photo");
      const label = at(r, "canvas_v2main", "canvas_v2label");
      const tag = at(r, "canvas_v2main", "canvas_v2tag");
      const cap = at(r, "canvas_v2main", "canvas_v2cap");

      /* ---- DOM — v1 요소와 같은 재료 · 같은 안쪽 태그 ---- */

      check("★ 배율 1 · 프레임 상자가 저장값대로다(300 × 200, x=45)",
        near(r.rootW, 390, 1) && near(frame.w, 300) && near(frame.h, 200) &&
        near(frame.x, 45),
        `${frame.w} × ${frame.h} @ ${frame.x}`);

      check("★ 내부 요소는 자유 배치 요소와 **같은 표식**이다(absolute · element 속성)",
        frame.inner.length === 5 &&
        frame.inner.every((n) => n.position === "absolute"),
        frame.inner.map((n) => n.position).join(","));

      check("★ follow 가 속성으로 남는다(transform 둘 · pin 셋)",
        same(frame.inner.map((n) => n.follow),
          ["transform", "transform", "pin", "pin", "pin"]),
        frame.inner.map((n) => n.follow).join(","));

      check("★ primary 사진이 **기존 이미지 슬롯 경로**로 그려진다(img · contain)",
        photo.type === "photo" && photo.innerTags === "img" &&
        photo.imgSrc === FIXTURE_IMAGE_PATH && photo.imgFit === "contain",
        JSON.stringify({ t: photo.innerTags, s: photo.imgSrc, f: photo.imgFit }));

      check("★ 종이는 shape, 글자 장식은 p + role — v1 과 같은 안쪽 DOM",
        paper.shape === "rect" && paper.innerTags === "" &&
        label.innerTags === "p" && label.role === "label" &&
        cap.role === "caption" && cap.text === "2026 / 09 / 22",
        JSON.stringify({ sh: paper.shape, lt: label.innerTags, ct: cap.text }));

      /* ---- transform — 위치와 크기가 S_frame 으로 함께 커진다 ---- */

      check("★ transform 종이 — 300 × 150 · 중심 (140, 75) · −6°",
        near(paper.w, 300) && near(paper.h, 150) &&
        near(paper.cx, 140, 1) && near(paper.cy, 75, 1) &&
        near(paper.angle, -6, 0.1),
        JSON.stringify([paper.w, paper.h, paper.cx, paper.cy, paper.angle]));

      check("★ transform 사진 — 200 × 100 · 중심 (120, 60)",
        near(photo.w, 200) && near(photo.h, 100) &&
        near(photo.cx, 120, 1) && near(photo.cy, 60, 1),
        JSON.stringify([photo.w, photo.h, photo.cx, photo.cy]));

      check("★ 프레임이 세로로만 늘어난 몫은 transform 이 따라가지 않는다(200 아닌 150)",
        near(paper.h, 150) && near(frame.h, 200),
        `${paper.h} / ${frame.h}`);

      /* ---- pin — 기준점만 따라가고 자기 크기는 유지한다 ---- */

      check("★ pin 라벨 — 사진 왼쪽 가운데 기준 · 오른쪽 변이 x=12 · 40 × 22",
        near(label.w, 40) && near(label.h, 22) &&
        near(label.cx, -8, 1) && near(label.cy, 60, 1) &&
        label.vars.tx === "-100%" && label.vars.ty === "-50%",
        JSON.stringify([label.w, label.h, label.cx, label.cy, label.vars.tx]));

      check("★ pin 라벨의 오른쪽 변이 정확히 기준점이다(x=12)",
        near(label.right, 12, 1), String(label.right));

      check("★ pin 태그 — 사진 오른쪽 + 80 · 왼쪽 변이 x=300 · 8° 회전이 함께 걸린다",
        near(tag.w, 40) && near(tag.h, 20) &&
        near(tag.cx, 320, 1) && near(tag.cy, 50, 1) &&
        near(tag.angle, 8, 0.1) && tag.vars.tx === "0%" && tag.vars.ty === "-50%",
        JSON.stringify([tag.cx, tag.cy, tag.angle, tag.vars.tx]));

      check("★ pin 캡션 — **프레임** 아래 가운데 기준(사진 아래가 아니다) · y=210",
        cap.heightMode === "auto" && cap.h > 0 &&
        near(cap.w, 240) && near(cap.left, 30, 1) && near(cap.cy, 210 + cap.h / 2, 1) &&
        cap.vars.tx === "-50%" && cap.vars.ty === "0%",
        JSON.stringify([cap.w, cap.left, cap.cy, cap.h]));

      /* target 을 photo 로 바꾸면 같은 anchor 가 **사진 아래**가 된다 */
      await render(page, {
        skinPackage: framePackage((main) => {
          main.props.elements[4].pin.target = "photo";
        }),
        context: CONTEXT, width: 390, fresh: true
      });

      const capPhoto = at(await readV2Canvas(page), "canvas_v2main", "canvas_v2cap");

      /* 프레임 아래 가운데 (150, 200) → 사진 아래 가운데 (120, 110) 로
         옮겨 가므로 세로도 가로도 함께 움직인다 */
      check("★ 같은 anchor 라도 target:frame 과 target:photo 가 다른 자리다(210 → 120)",
        near(capPhoto.cy, 120 + capPhoto.h / 2, 1) && near(capPhoto.left, 0, 1),
        `${capPhoto.cy} / ${capPhoto.left} (h=${capPhoto.h})`);

      /* ---- 두 규칙이 갈리는 자리 — 프레임만 커질 때 ---- */

      await render(page, {
        skinPackage: framePackage((main) => { main.width = 150; }),
        context: CONTEXT, width: 390, fresh: true
      });

      const half = await readV2Canvas(page);
      const halfFrame = findBlock(half, "canvas_v2main");
      const halfPaper = at(half, "canvas_v2main", "canvas_v2paper");
      const halfLabel = at(half, "canvas_v2main", "canvas_v2label");
      const halfTag = at(half, "canvas_v2main", "canvas_v2tag");

      check("★ 프레임 폭이 절반(S_frame 2 → 1)이면 transform 장식은 절반이 된다",
        near(halfFrame.w, 150) && near(halfPaper.w, 150) && near(halfPaper.h, 75),
        `${halfFrame.w} / ${halfPaper.w} × ${halfPaper.h}`);

      check("★ 같은 변화에서 pin 장식의 **크기는 그대로**다(40 × 22 · 40 × 20)",
        near(halfLabel.w, 40) && near(halfLabel.h, 22) &&
        near(halfTag.w, 40) && near(halfTag.h, 20),
        JSON.stringify([halfLabel.w, halfLabel.h, halfTag.w, halfTag.h]));

      /* ★ 태그는 8° 돌아 있어 bbox 의 변이 아니라 **중심**으로 잰다
         (회전은 중심을 옮기지 않는다 — READ_V2_CANVAS 의 그 규약) */
      check("★ pin 의 **자리**는 줄어든 사진을 따라간다(태그 중심 320 → 210)",
        near(halfTag.cx, 210, 1) && near(halfLabel.right, 2, 1),
        `${halfTag.cx} / ${halfLabel.right}`);

      /* ---- 390 ↔ 780 — 화면 배율은 둘 다 같이 받는다 ---- */

      await render(page, { skinPackage: framePackage(), context: CONTEXT, width: 780, fresh: true });

      const wide = await readV2Canvas(page);
      const wideFrame = findBlock(wide, "canvas_v2main");
      const widePaper = at(wide, "canvas_v2main", "canvas_v2paper");
      const widePhoto = at(wide, "canvas_v2main", "canvas_v2photo");
      const wideLabel = at(wide, "canvas_v2main", "canvas_v2label");
      const wideTag = at(wide, "canvas_v2main", "canvas_v2tag");

      check("★ 780px — 화면 배율은 transform 과 pin **둘 다** 받는다(정확히 두 배)",
        near(wideFrame.w, 600, 1) &&
        near(widePaper.w, 600, 1) && near(widePaper.h, 300, 1) &&
        near(widePhoto.w, 400, 1) &&
        near(wideLabel.w, 80, 1) && near(wideLabel.h, 44, 1) &&
        near(wideTag.w, 80, 1),
        JSON.stringify([widePaper.w, widePhoto.w, wideLabel.w, wideTag.w]));

      check("★ 780px — 기준점도 두 배다(태그 중심 320 → 640 · 라벨 중심 −8 → −16)",
        near(wideTag.cx, 640, 1.5) && near(wideLabel.cx, -16, 1.5),
        `${wideTag.cx} / ${wideLabel.cx}`);

      check("★ 백분율 문자열이 두 폭에서 **같다**(부모 배율을 중복 보정하지 않는다)",
        same(wide.blocks.find((b) => b.editId === "canvas_v2main").inner.map((n) => n.vars),
          r.blocks.find((b) => b.editId === "canvas_v2main").inner.map((n) => n.vars)),
        JSON.stringify(wideTag.vars));

      /* ---- height:"auto" 프레임 ---- */

      check("★ height \"auto\" 프레임의 높이는 **primary 사진 상자의 비율**이다(200 × 80)",
        auto.heightMode === "auto" && near(auto.w, 200) && near(auto.h, 80, 1),
        `${auto.w} × ${auto.h}`);

      check("★ 그 비율은 props.baseWidth/baseHeight(100:400 → 800)가 아니다",
        auto.frameRatioW === "100" && auto.frameRatioH === "40" && auto.h < 200,
        `${auto.frameRatioW}:${auto.frameRatioH} → ${auto.h}`);

      check("★ auto 프레임 안에서도 백분율 세로값이 풀린다(사진이 프레임을 꽉 채운다)",
        near(at(r, "canvas_v2auto", "canvas_v2autophoto").w, 200) &&
        near(at(r, "canvas_v2auto", "canvas_v2autophoto").h, 80, 1),
        JSON.stringify([at(r, "canvas_v2auto", "canvas_v2autophoto").w,
          at(r, "canvas_v2auto", "canvas_v2autophoto").h]));

      /* ---- 사진 교체 — 장식은 같은 기준점을 따라간다 ---- */

      await render(page, {
        skinPackage: framePackage((main) => {
          main.props.elements[1].props.slot = "sticker_1";
        }),
        context: CONTEXT, width: 390, fresh: true
      });

      const swapped = await readV2Canvas(page);

      await render(page, {
        skinPackage: framePackage((main) => {
          main.props.elements[1].props.slot = "photo_empty";
        }),
        context: CONTEXT, width: 390, fresh: true
      });

      const emptied = await readV2Canvas(page);

      const innerVars = (reading) =>
        findBlock(reading, "canvas_v2main").inner.map((n) => ({ id: n.editId, ...n.vars }));

      check("★ 사진 슬롯을 바꿔도 장식의 좌표가 한 칸도 움직이지 않는다",
        same(innerVars(swapped), innerVars(r)) && same(innerVars(emptied), innerVars(r)),
        JSON.stringify(innerVars(emptied).slice(2, 3)));

      check("★ 빈 슬롯이어도 사진 요소의 상자는 남고 img 만 없다(placeholder 없음)",
        near(at(emptied, "canvas_v2main", "canvas_v2photo").w, 200) &&
        at(emptied, "canvas_v2main", "canvas_v2photo").imgSrc === null &&
        at(emptied, "canvas_v2main", "canvas_v2photo").innerTags === "",
        JSON.stringify({ s: at(emptied, "canvas_v2main", "canvas_v2photo").imgSrc }));

      check("★ 그림이 바뀌어도 auto 프레임의 높이가 같다(비율의 출처가 파일이 아니다)",
        near(findBlock(swapped, "canvas_v2auto").h, 80, 1) &&
        near(findBlock(emptied, "canvas_v2auto").h, 80, 1),
        `${findBlock(swapped, "canvas_v2auto").h} / ${findBlock(emptied, "canvas_v2auto").h}`);

      /* ---- 프레임 밖 장식 · 가로 스크롤 ---- */

      await render(page, { skinPackage: framePackage(), context: CONTEXT, width: 390, fresh: true });

      const spill = await page.evaluate(() => {
        const block = document.querySelector('[data-imory-canvas-type="main_visual"]');
        const cs = getComputedStyle(block);
        return {
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          position: cs.position,
          docScrollW: document.documentElement.scrollWidth,
          docClientW: document.documentElement.clientWidth,
          bodyScrollW: document.body.scrollWidth
        };
      });

      check("★ 프레임은 overflow 를 정하지 않는다(자를지는 스킨 CSS 의 몫)",
        spill.overflowX === "visible" && spill.overflowY === "visible" &&
        spill.position === "relative",
        JSON.stringify(spill));

      check("★ 장식이 실제로 프레임 밖으로 나온다(왼쪽 −10 · 오른쪽 +40 · 아래 +10)",
        paper.left < -5 && tag.right > 300 && cap.bottom > 200,
        JSON.stringify({ l: paper.left, r: tag.right, b: cap.bottom }));

      check("★ 390px 화면에서 페이지 전체에 가로 스크롤이 생기지 않는다",
        spill.docScrollW <= spill.docClientW,
        `${spill.docScrollW} / ${spill.docClientW}`);

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("pages")) {

      section("pages");

      const { ctx, page, errors } = await openHarness(browser);

      for (const pageType of ["category", "post", "banner"]) {

        await render(page, { skinPackage: skinPackage(), context: CONTEXT, width: 390, pageType, fresh: true });

        const other = await page.evaluate(() => ({
          markers: document.querySelectorAll("[data-imory-canvas-root]").length,
          elements: document.querySelectorAll("[data-imory-canvas-element]").length,
          active: document.querySelectorAll("[data-imory-canvas-active]").length,
          tmplCanvas: window.harnessTemplate ? window.harnessTemplate.canvas === undefined : true
        }));

        check(`★ ${pageType.toUpperCase()} — 표식이 있어도 캔버스를 그리지 않는다`,
          other.markers === 1 && other.elements === 0 && other.active === 0 && other.tmplCanvas,
          JSON.stringify(other));

      }

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("parity")) {

      section("parity");

      /*
        두 화면의 도화지 폭을 못박는다(위 parityDom 주석).

        ★ 글꼴도 스킨 CSS 가 못박는다. 플랫폼은 글자 크기를 정하지
          않으므로(계약 §8) "auto" 높이 요소의 실제 높이는 **스킨의
          조판**이 정한다 — 두 문서의 기본 글꼴이 다르면 같은 스킨을
          줘도 높이가 달라진다. 실제 스킨은 자기 조판을 적으므로
          parity fixture 도 그렇게 한다.
      */
      const PARITY_CSS =
        CANVAS_CSS.replace(".hc-canvas { width: 100%; }", ".hc-canvas { width: 320px; }") +
        '[data-imory-canvas-type="text"], [data-imory-canvas-type="category_nav"]' +
        " { font: 14px/1.5 Arial, sans-serif; }" +
        "[data-imory-canvas-nav] { display: block; }";

      const parityPackage = skinPackage({ css: PARITY_CSS });

      /* scenario lay 의 실제 카테고리는 LOG(301) 하나다 — 공개 쪽도
         같은 데이터로 맞춘다(두 화면의 글자까지 대조하기 때문이다). */
      const parityContext = {
        ...CONTEXT,
        navigation: {
          ...CONTEXT.navigation,
          categories: [CONTEXT.navigation.categories[0]]
        }
      };

      /* 공개 native */
      const pub = await openHarness(browser, { width: 1000, height: 900 });
      await render(pub.page, { skinPackage: parityPackage, context: parityContext, width: 390, fresh: true });
      await pub.page.waitForTimeout(200);
      const publicReading = await readCanvas(pub.page);

      /* Studio native Preview */
      const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const spage = await sctx.newPage();
      const serrors = [];
      spage.on("pageerror", (err) => serrors.push(String(err.message || err)));
      await spage.route("**/api/skin-ai", (route) => route.fulfill({ status: 500, body: "must not be called" }));

      await spage.addInitScript(
        ([pkg, slotValues]) => {
          window.__scenarioLaySkinPackage = pkg;
          window.__scenarioLaySkinImageSlotValues = slotValues;
        },
        [
          parityPackage,
          [
            { skin_id: "skin-lay1", slot_name: "photo_1", image_url: FIXTURE_IMAGE_PATH },
            { skin_id: "skin-lay1", slot_name: "sticker_1", image_url: FIXTURE_IMAGE_PATH }
          ]
        ]
      );

      await spage.goto(SCENARIO_URL, { waitUntil: "load" });
      await spage.waitForFunction(
        () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
        null, { timeout: 20000 }
      );
      await spage.waitForFunction(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        return !!(doc && doc.querySelector("[data-imory-canvas-element]"));
      }, null, { timeout: 15000 }).catch(() => {});
      await spage.waitForTimeout(400);

      const previewFrame =
        spage.frames().find((fr) => fr.url().indexOf("preview-frame.html") !== -1);

      if (!previewFrame) {
        throw new Error("Studio Preview 프레임을 찾지 못했습니다");
      }

      const studioReading = await previewFrame.evaluate(READ_CANVAS);

      check("Studio native Preview 가 캔버스를 그렸다",
        studioReading.found && studioReading.active === "true" &&
        studioReading.ownedCount === CANVAS_ELEMENTS.length,
        JSON.stringify({ found: studioReading.found, n: studioReading.ownedCount }));

      check("공개 native 가 캔버스를 그렸다",
        publicReading.found && publicReading.ownedCount === CANVAS_ELEMENTS.length,
        String(publicReading.ownedCount));

      const a = JSON.stringify(parityDom(publicReading), null, 1);
      const b = JSON.stringify(parityDom(studioReading), null, 1);

      if (a !== b) {
        const la = a.split("\n");
        const lb = b.split("\n");
        const diff = [];
        for (let i = 0; i < Math.max(la.length, lb.length) && diff.length < 6; i++) {
          if (la[i] !== lb[i]) diff.push(`${i}: 공개 ${la[i]} / Studio ${lb[i]}`);
        }
        check("★ 공개 native 와 Studio native Preview 의 DOM 이 같다", false, diff.join(" || "));
      } else {
        check("★ 공개 native 와 Studio native Preview 의 DOM 이 같다", true,
          `요소 ${publicReading.ownedCount}개`);
      }

      check("두 화면의 도화지 폭 · 비율이 같다",
        near(publicReading.rootW, studioReading.rootW, 0.6) &&
        near(publicReading.rootH, studioReading.rootH, 1),
        `${publicReading.rootW.toFixed(1)}x${publicReading.rootH.toFixed(1)} / ${studioReading.rootW.toFixed(1)}x${studioReading.rootH.toFixed(1)}`);

      /* hidden 요소는 상자가 없어서(display:none) 좌표를 잴 수 없다 —
         두 화면에서 "보이지 않음"이 같다는 것은 위 DOM 대조가 본다. */
      const geomDiff = publicReading.elements.filter((e, i) => {
        if (e.displayed === false) return false;
        const s = studioReading.elements[i];
        if (!s || s.editId !== e.editId) return true;
        return !near(e.cx, s.cx, 1) || !near(e.cy, s.cy, 1) ||
          !near(e.w, s.w, 1) || !near(e.h, s.h, 1);
      });

      check("★ 두 화면의 요소 좌표가 같다(회전 중심 · 크기 · \"auto\" 높이까지)",
        geomDiff.length === 0,
        geomDiff.map((e) => {
          const s = studioReading.elements.find((x) => x.editId === e.editId);
          const f = (v) => Math.round(v * 10) / 10;
          return `${e.editId} 공개(${f(e.cx)},${f(e.cy)},${f(e.w)},${f(e.h)})` +
            ` Studio(${s ? [f(s.cx), f(s.cy), f(s.w), f(s.h)].join(",") : "없음"})`;
        }).join(" | "));

      check("Studio 쪽 스크립트 오류 없음", serrors.length === 0, serrors.slice(0, 3).join(" | "));
      check("공개 쪽 스크립트 오류 없음", pub.errors.length === 0, pub.errors.join(" | "));

      await sctx.close();
      await pub.ctx.close();

    }

  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    console.log("실패:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }

}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
