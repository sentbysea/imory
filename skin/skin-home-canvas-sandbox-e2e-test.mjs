/* =========================================================
   HOME CANVAS — cross-origin sandbox 정적 Renderer E2E
   (HOME-CANVAS-RENDER-1B)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §12

   RENDER-1A 가 만든 **같은 렌더러**(skin/skin-home-canvas-render.js
   + .css)가 실제 cross-origin sandbox 프레임 안에서도 같은 DOM 과
   같은 좌표를 내는가를 잰다. sandbox 전용 렌더러는 없다.

   ★ 실물 서버 · 실물 CSP
   두 서버 모두 요청을 **배포되는 그 Pages Function**
   (functions/_middleware.js)에 그대로 통과시킨다. CSP 문자열을
   흉내 낸 하네스로는 "CSP 아래에서 정말 그려지는가"를 판정할 수
   없다(skin/sandbox/skin-sandbox-e2e-test.mjs 와 같은 규약).

     부모   http://localhost:8984
     프레임 http://localhost:8985

   ★ 네 화면을 어떻게 재는가

     쌍 A (공개)  skin/skin-sandbox-test.html?native=1
                  한 문서가 **같은 template · 같은 투영 Context** 로
                  native 와 sandbox 를 동시에 그린다 → 전부 대조
     쌍 B (Studio) studio-lifecycle-scenario.html?scenario=sb
                  같은 시나리오(=같은 DB 행)를 renderMode 만 바꿔
                  native Preview / sandbox Preview 로 연다 → 전부 대조
     쌍 A ↔ 쌍 B  두 쌍은 slug 가 만드는 **주소**만 다를 수 있으므로
                  href 를 뺀 나머지(구조 · 글자 · 이미지 · 좌표)를 대조

   ★ 글꼴과 폭을 fixture 가 못박는다
   플랫폼은 글자 크기를 정하지 않으므로(계약 §8) `height:"auto"`
   요소의 높이는 **스킨 조판**이 정한다. 네 문서의 기본 글꼴이 서로
   다르니 실제 스킨이 그러듯 fixture 가 폭과 글꼴을 적는다
   (RENDER-1A 와 같은 이유 · 그 변환 규칙은 RESPONSIVE-1).

   ★ 테스트 이미지
   실행 중 만든 단색 SVG 를 Playwright route 로 돌려준다. 주소는
   **실제 배포에서 이미지 슬롯이 갖는 모양**(Supabase Storage)이다 —
   프레임 CSP 의 img-src 가 허용하는 출처가 그것이고, 로컬 http
   주소는 isSafeSkinUrl() 이 막는다(https 만 통과). 저장소에는 이미지
   파일을 새로 넣지 않고, 네트워크로 나가는 요청도 없다(route 가
   가로챈다).

   [isolate]  두 origin 이 실제로 다르고 부모가 frame DOM 을 못 읽는다
   [assets]   Canvas JS/CSS 가 sandbox origin 에서 올바른 Content-Type
              으로 200 · SPA fallback HTML 이 아님 · ?v= 가 붙어도 같음
              · allowlist 밖은 여전히 404
   [csp]      실제 응답 헤더의 CSP · 위반 0 · geometry(style.setProperty)
              가 실제로 먹었는가
   [public]   공개 sandbox 렌더 — 여섯 타입 · 이미지 슬롯 · logo
              fallback · category all/selected
   [width]    390px 과 다른 폭에서 같은 배율
   [fallback] canvas 없음 · marker 없음 · marker 2개 · 미래 version ·
              enabled:false · elements:[]
   [rerender] 재렌더 중복 0 · 제거 시 정리 · 스킨이 쓴 자식 보존
   [nav]      category 링크 클릭이 **기존 sandbox navigation 메시지**로
              부모에 올라온다(프레임은 자기 문서를 떠나지 않는다)
   [v2-flow]  조합형 Canvas v2(V2-FLOW-RENDER-1 · V2-MAIN-VISUAL-1)가
              프레임 안에서도 같은 DOM · 같은 좌표다 — 흐름 층 · 정렬 ·
              합산 여백 · hidden · overlays · main_visual **내부**
              (사진 슬롯 · transform/pin · origin translate · 회전 ·
              height:"auto" 비율) · CSP 위반 0 ·
              잘못된 v2 는 프레임에도 안 실린다
   [pages]    CATEGORY · POST · BANNER 는 프레임에서도 캔버스를 안 그린다
   [parity]   네 화면

   실행:
     node skin/skin-home-canvas-sandbox-e2e-test.mjs
     node skin/skin-home-canvas-sandbox-e2e-test.mjs --only=parity
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/*
  배포 버전의 **유일한 원천**에서 읽는다(CLAUDE.md §4). 그 파일은
  classic script 라 require 가 안 되므로 상수 한 줄만 꺼낸다 —
  값을 이 파일에 복사해 두면 배포마다 둘이 어긋난다.
*/
const APP_BUILD_VERSION = (() => {

  const text =
    fs.readFileSync(path.join(ROOT, "core", "lib", "build-version.js"), "utf8");

  const m = text.match(/const\s+APP_BUILD_VERSION\s*=\s*"([^"]+)"/);

  if (!m) {
    throw new Error("core/lib/build-version.js 에서 APP_BUILD_VERSION 을 찾지 못했습니다");
  }

  return m[1];

})();

const PARENT_PORT = 8984;
const SANDBOX_PORT = 8985;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const SANDBOX_HARNESS = "/skin/skin-sandbox-test.html";
const SCENARIO_PATH = "/studio/studio-lifecycle-scenario.html";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const wants = (name) => !ONLY || ONLY.split(",").map((n) => n.trim()).includes(name);
const section = (name) => console.log(`\n[${name}]`);


/* 배포되는 그 함수 그대로 */
const middleware = await import(
  pathToFileURL(path.join(ROOT, "functions", "_middleware.js")).href
);

/* 프레임 CSP 의 img-src 가 여는 출처 — 값을 복사해 적지 않는다 */
const server = await import(
  pathToFileURL(path.join(ROOT, "core", "lib", "skin-sandbox-server.js")).href
);

const FIXTURE_IMAGE_URL =
  server.SANDBOX_SUPABASE_ORIGIN +
  "/storage/v1/object/public/imory-canvas-test/swatch.svg";

const FIXTURE_IMAGE_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
  '<rect width="80" height="80" fill="#c9803f"/></svg>';


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


/* =========================================================
   서버 — 저장소 파일 + 배포와 같은 Pages Function
   (skin/sandbox/skin-sandbox-e2e-test.mjs 와 같은 규약:
    .html 은 308, 없는 경로는 SPA fallback)
========================================================== */

const FUNCTION_ENV = {
  SANDBOX_SKIN_HOST: `localhost:${SANDBOX_PORT}`,
  SANDBOX_SKIN_PARENT_ORIGINS: PARENT_ORIGIN
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

function staticResponse(pathname, search) {

  let rel = decodeURIComponent(pathname);
  const query = search || "";

  if (rel.endsWith("/index.html")) {
    return new Response(null, {
      status: 308,
      headers: { "Location": rel.slice(0, -"index.html".length) + query }
    });
  }

  if (rel.endsWith(".html")) {
    return new Response(null, {
      status: 308,
      headers: { "Location": rel.slice(0, -".html".length) + query }
    });
  }

  if (rel.endsWith("/")) rel += "index.html";

  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + ".html"))) {
    rel += ".html";
  }

  const abs = path.join(ROOT, rel);

  if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return new Response(fs.readFileSync(abs), {
      status: 200,
      headers: {
        "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
        "Cache-Control": "no-store"
      }
    });
  }

  /* _redirects 의 SPA fallback: /* /index.html 200 */
  return new Response(fs.readFileSync(path.join(ROOT, "index.html")), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });

}

function startServer(port) {

  const httpServer = http.createServer(async (req, res) => {

    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url, `http://${host}`);

    let response;

    try {
      response = await middleware.onRequest({
        request: new Request(url.toString(), { method: req.method }),
        env: FUNCTION_ENV,
        next: async () => staticResponse(url.pathname, url.search)
      });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(err && err.stack || err));
      return;
    }

    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });

    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);

  });

  return new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer)));

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

const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 1 : tolerance);


/* =========================================================
   fixture — RENDER-1A 와 같은 열둘, 여섯 종류

   운영 스킨도 예시 스킨도 만들지 않는다. 네 화면에 **같은 객체**
   를 넣어야 parity 가 의미를 가지므로 여기 한 벌만 둔다.
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
  { id: "canvas_nav_all", type: "category_nav", x: 20, y: 620, width: 350, height: "auto",
    rotation: 0, hidden: false, locked: false, props: { mode: "all", categoryIds: [] } },
  { id: "canvas_nav_picked", type: "category_nav", x: 20, y: 680, width: 350, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { mode: "selected", categoryIds: ["302", "does-not-exist", "301"] } }
];

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진 1", required: false },
  { name: "photo_empty", label: "빈 사진", required: false },
  { name: "logo_empty", label: "빈 로고", required: false },
  { name: "sticker_1", label: "스티커", required: false }
];

/*
  도화지 폭과 조판을 스킨이 적는다 — 네 문서의 기본 글꼴이 달라도
  같은 그림이 나오게(위 머리말). 실제 스킨이 하는 일과 같다.
*/
const CANVAS_CSS =
  ".hc-home { padding: 0; margin: 0; }" +
  ".hc-canvas { width: 320px; }" +
  '[data-imory-canvas-type="text"], [data-imory-canvas-type="category_nav"]' +
  " { font: 14px/1.5 Arial, sans-serif; }" +
  '[data-imory-canvas-type="logo"] { font: 16px/1.2 Arial, sans-serif; }' +
  "[data-imory-canvas-nav] { display: block; }";

const canvasData = (overrides) => ({
  version: 1,
  baseWidth: 390,
  baseHeight: 844,
  elements: CANVAS_ELEMENTS,
  ...(overrides || {})
});


/* =========================================================
   v2 조합형 Canvas fixture (HOME-CANVAS-V2-FLOW-RENDER-1)

   RENDER-1A 쪽(skin/skin-home-canvas-render-e2e-test.mjs)이 쓰는 것과
   **같은 모양**이다 — 그 파일이 native 에서 숫자를 검산했으므로 여기서
   할 일은 "프레임 안에서도 같은가" 하나다. 종류 다섯 · 정렬 네 값 ·
   maxWidth · hidden · overlay 가 한 번씩 들어 있다.
========================================================== */

const V2_BLOCKS = [
  { id: "canvas_v2logo", type: "logo", width: 120, height: 40, align: "left",
    props: { slot: "logo_empty", fallback: "site_title" } },

  { id: "canvas_v2gone", type: "divider", width: 100, height: 8, align: "center", hidden: true },

  { id: "canvas_v2title", type: "text", width: 300, height: "auto", align: "center",
    margin: { top: 6, bottom: 4 }, props: { text: "FLOW TITLE", role: "title" } },

  { id: "canvas_v2rule", type: "divider", width: 120, height: 2, align: "right",
    margin: { right: 10 } },

  { id: "canvas_v2nav", type: "category_nav", width: 340, height: "auto", align: "stretch",
    margin: { left: 8, right: 12 }, props: { mode: "selected", categoryIds: ["302", "nope", "301"] } },

  { id: "canvas_v2wide", type: "text", width: 340, height: 30, align: "stretch",
    maxWidth: 120, locked: true, props: { text: "CLAMP", role: "label" } },

  /* V2-MAIN-VISUAL-1 — 내부까지 RENDER-1A 쪽과 **같은 fixture** 다.
     숫자 검산은 그 파일이 native 에서 했고(§[v2-frame]) 여기서는
     "프레임 안에서도 같은가"만 본다. */
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

  /* height:"auto" 프레임 — 높이가 primary 사진 상자의 비율이다 */
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
  { id: "canvas_v2over", type: "text", x: -20, y: 700, width: 100, height: 40,
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

function skinPackage(options) {

  const o = options || {};

  const pkg = {
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

  if (o.sandbox !== false) {
    pkg.renderMode = "sandbox";
  }

  return pkg;

}

/*
  공개 쌍의 Context — Studio 쌍이 쓰는 scenario `sb` 의 실제 행과
  같은 값이다(블로그 제목 하나 · 카테고리 넷). 두 쌍의 글자까지
  대조하기 위해서다. 주소(href)만 slug 규칙이 만들므로 쌍을 가로질러
  비교하지 않는다.
*/
const SB_CATEGORIES = [
  { id: "301", name: "LOG", type: "post", iconKind: "post" },
  { id: "302", name: "PIC", type: "gallery", iconKind: "gallery" },
  { id: "303", name: "FRIENDS", type: "banner", iconKind: "banner" },
  { id: "304", name: "NOTES", type: "highlight", iconKind: "highlight" }
];

const CONTEXT = {
  site: { title: "SANDBOX PREVIEW BLOG", slug: "scenario-sb", faviconUrl: null, description: null, language: "ko" },
  profile: { nickname: "Scenario SB", bio: null, avatarUrl: null },
  navigation: {
    home: { name: "SANDBOX PREVIEW BLOG", href: "/scenario-sb", enabled: true, type: "home", iconKind: "home" },
    categories: SB_CATEGORIES.map((c) => ({
      ...c, href: "/scenario-sb/category/" + c.id, itemCount: null
    })),
    postCategories: [],
    galleryCategories: [],
    bannerCategories: []
  },
  home: { recentPosts: [], highlights: { cards: [], featured: [], card: null, hasCard: false, count: 0, isEmpty: true, hasError: false } },
  images: {
    photo_1: FIXTURE_IMAGE_URL,
    photo_empty: null,
    logo_empty: null,
    sticker_1: FIXTURE_IMAGE_URL
  },
  viewer: { isOwner: false },
  page: { type: "home", isHome: true, isCategory: false, isPost: false, isBanner: false, isFolder: false, isHighlights: false, isMemos: false }
};

const SLOT_VALUE_ROWS = (skinId) => [
  { skin_id: skinId, slot_name: "photo_1", image_url: FIXTURE_IMAGE_URL },
  { skin_id: skinId, slot_name: "sticker_1", image_url: FIXTURE_IMAGE_URL }
];


/* =========================================================
   캔버스 읽기 — 네 문서가 **같은 표현식**을 쓴다
   (서로 다른 browsing context 라 전역을 공유하지 않는다)

   ★ 회전한 요소의 getBoundingClientRect() 는 회전 뒤 외곽 상자다.
     위치는 **중심**으로(회전이 중심을 안 옮긴다), 크기는 레이아웃
     크기(offsetWidth/offsetHeight)로 잰다.
========================================================== */

const readCanvasSource = (rootSelector) => `(() => {
  const root = document.querySelector(${JSON.stringify(rootSelector)});
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
    markers: document.querySelectorAll("[data-imory-canvas-root]").length,
    ownedCount: owned.length,
    styleLink: Boolean(document.querySelector("link[data-imory-skin-home-canvas]")),
    elements: owned.map((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector("[data-imory-canvas-image]");
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
        displayed: getComputedStyle(el).display !== "none",
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
        imgOk: img ? (img.complete && img.naturalWidth > 0) : null,
        innerTags: Array.from(el.querySelectorAll("*")).map((n) => n.tagName.toLowerCase()).join(","),
        text: text ? text.textContent : null,
        logoText: logoText ? logoText.textContent : null,
        links: Array.from(el.querySelectorAll("[data-imory-canvas-nav-item]"))
          .map((a) => ({ name: a.textContent, href: a.getAttribute("href") }))
      };
    })
  };
})()`;

/* 프레임 문서 · Studio Preview 문서는 캔버스가 문서에 하나뿐이다 */
const READ_DOC = readCanvasSource("[data-imory-canvas-root]");

/* 공개 하네스는 native 와 sandbox 를 한 문서에 함께 그린다 */
const READ_NATIVE_MOUNT = readCanvasSource("#nativeMount [data-imory-canvas-root]");


/* =========================================================
   v2 읽기 (HOME-CANVAS-V2-FLOW-RENDER-1)

   층이 둘이므로 읽는 것도 둘이다 — 흐름 층의 블록과 표식 바로
   아래의 자유 장식. 좌표는 전부 표식 기준 상대값이다.
========================================================== */

const readV2Source = (rootSelector) => `(() => {
  const root = document.querySelector(${JSON.stringify(rootSelector)});
  if (!root) return { found: false };
  const rr = root.getBoundingClientRect();
  const flow = root.querySelector(":scope > [data-imory-canvas-flow]");
  const angle = (el) => {
    const m = /^matrix\\(([^)]+)\\)$/.exec(getComputedStyle(el).transform);
    if (!m) return 0;
    const n = m[1].split(",").map(Number);
    return Math.round(Math.atan2(n[1], n[0]) * 180 / Math.PI * 100) / 100;
  };
  const round = (v) => Math.round(v * 100) / 100;
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
    childCount: root.children.length,
    hasFlow: !!flow,
    flowDirection: flow ? flow.getAttribute("data-imory-canvas-flow") : null,
    flowPosition: flow ? getComputedStyle(flow).position : null,
    flowDisplay: flow ? getComputedStyle(flow).display : null,
    padTop: flow ? round(parseFloat(getComputedStyle(flow).paddingTop)) : null,
    padLeft: flow ? round(parseFloat(getComputedStyle(flow).paddingLeft)) : null,
    blocks: blocks.map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const text = el.querySelector("[data-imory-canvas-text]");
      const logoText = el.querySelector("[data-imory-canvas-logo-text]");
      const img = el.querySelector("[data-imory-canvas-image]");
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
        displayed: cs.display !== "none",
        frameBaseW: el.style.getPropertyValue("--imory-canvas-frame-base-width").trim(),
        frameBaseH: el.style.getPropertyValue("--imory-canvas-frame-base-height").trim(),
        frameRatioW: el.style.getPropertyValue("--imory-canvas-frame-ratio-width").trim(),
        frameRatioH: el.style.getPropertyValue("--imory-canvas-frame-ratio-height").trim(),
        /* V2-MAIN-VISUAL-1 — main_visual 내부. 좌표는 **프레임 상자
           기준** 상대값이라 두 문서의 화면 위치가 달라도 대조된다. */
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
            cx: round(nr.left + nr.width / 2 - r.left),
            cy: round(nr.top + nr.height / 2 - r.top),
            w: n.offsetWidth,
            h: n.offsetHeight,
            left: round(nr.left - r.left),
            right: round(nr.right - r.left),
            bottom: round(nr.bottom - r.top),
            angle: angle(n),
            imgSrc: ni ? ni.getAttribute("src") : null,
            imgFit: ni ? getComputedStyle(ni).objectFit : null,
            text: nt ? nt.textContent : null,
            innerTags: Array.from(n.querySelectorAll("*")).map((t) => t.tagName.toLowerCase()).join(",")
          };
        }),
        vars: {
          gap: el.style.getPropertyValue("--imory-canvas-block-gap").trim(),
          marginTop: el.style.getPropertyValue("--imory-canvas-block-margin-top").trim(),
          width: el.style.getPropertyValue("--imory-canvas-block-width").trim(),
          stretchWidth: el.style.getPropertyValue("--imory-canvas-block-stretch-width").trim(),
          maxWidth: el.style.getPropertyValue("--imory-canvas-block-max-width").trim(),
          height: el.style.getPropertyValue("--imory-canvas-block-height").trim()
        },
        x: round(r.left - rr.left),
        y: round(r.top - rr.top),
        w: round(r.width),
        h: round(r.height),
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
        cx: round(r.left + r.width / 2 - rr.left),
        cy: round(r.top + r.height / 2 - rr.top),
        w: el.offsetWidth,
        h: el.offsetHeight,
        angle: angle(el),
        text: text ? text.textContent : null
      };
    })
  };
})()`;

const READ_V2_DOC = readV2Source("[data-imory-canvas-root]");
const READ_V2_NATIVE = readV2Source("#nativeMount [data-imory-canvas-root]");

/*
  대조용 — 좌표는 서브픽셀 때문에 따로 본다(v1 의 domShape 과 같은 규약).
  href 는 두 쌍이 slug 규칙으로만 다를 수 있어 옵션이다.
*/
function v2DomShape(reading, options) {

  const withHref = !options || options.href !== false;

  return {
    active: reading.active,
    version: reading.version,
    hasFlow: reading.hasFlow,
    flowDirection: reading.flowDirection,
    flowPosition: reading.flowPosition,
    flowDisplay: reading.flowDisplay,
    childCount: reading.childCount,
    blocks: reading.blocks.map((b) => ({
      tag: b.tag, type: b.type, editId: b.editId, align: b.align,
      heightMode: b.heightMode, role: b.role, navMode: b.navMode,
      hiddenAttr: b.hiddenAttr, lockedAttr: b.lockedAttr,
      isFrame: b.isFrame, displayed: b.displayed,
      frameBaseW: b.frameBaseW, frameBaseH: b.frameBaseH,
      frameRatioW: b.frameRatioW, frameRatioH: b.frameRatioH,
      vars: b.vars, innerTags: b.innerTags,
      /* V2-MAIN-VISUAL-1 — 좌표(cx · left …)는 서브픽셀 때문에 아래
         boxDiff 처럼 따로 보고, 여기서는 DOM 과 변수 문자열만 본다 */
      inner: b.inner.map((n) => ({
        editId: n.editId, type: n.type, follow: n.follow,
        heightMode: n.heightMode, role: n.role, shape: n.shape,
        position: n.position, vars: n.vars, angle: n.angle,
        imgSrc: n.imgSrc, imgFit: n.imgFit, text: n.text, innerTags: n.innerTags
      })),
      text: b.text, logoText: b.logoText, imgSrc: b.imgSrc,
      links: withHref ? b.links : b.links.map((l) => l.name)
    })),
    overlays: reading.overlays.map((o) => ({
      type: o.type, editId: o.editId, isOverlay: o.isOverlay,
      position: o.position, vars: o.vars, angle: o.angle, text: o.text
    }))
  };
}


/* 대조용 — 좌표는 따로 본다(서브픽셀 허용치가 필요하다) */
function domShape(reading, options) {

  const withHref = !options || options.href !== false;

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
      links: withHref ? e.links : e.links.map((l) => l.name)
    }))
  };
}

function compareDom(label, a, b, options) {

  const sa = JSON.stringify(domShape(a, options), null, 1);
  const sb = JSON.stringify(domShape(b, options), null, 1);

  if (sa === sb) {
    check(label, true, `요소 ${a.ownedCount}개`);
    return;
  }

  const la = sa.split("\n");
  const lb = sb.split("\n");
  const diff = [];
  for (let i = 0; i < Math.max(la.length, lb.length) && diff.length < 6; i += 1) {
    if (la[i] !== lb[i]) diff.push(`${i}: ${la[i]} / ${lb[i]}`);
  }
  check(label, false, diff.join(" || "));

}

function compareGeometry(label, a, b) {

  const bad = a.elements.filter((e, i) => {
    if (e.displayed === false) return false;      /* 상자가 없다 */
    const s = b.elements[i];
    if (!s || s.editId !== e.editId) return true;
    return !near(e.cx, s.cx, 1) || !near(e.cy, s.cy, 1) ||
      !near(e.w, s.w, 1) || !near(e.h, s.h, 1) ||
      !near(e.angle, s.angle, 0.75);
  });

  const f = (v) => Math.round(v * 10) / 10;

  check(label, bad.length === 0,
    bad.length
      ? bad.map((e) => {
          const s = b.elements.find((x) => x.editId === e.editId);
          return `${e.editId} (${f(e.cx)},${f(e.cy)},${f(e.w)},${f(e.h)},${e.angle}°)` +
            ` vs (${s ? [f(s.cx), f(s.cy), f(s.w), f(s.h), s.angle].join(",") : "없음"})`;
        }).join(" | ")
      : `도화지 ${f(a.rootW)}×${f(a.rootH)} / ${f(b.rootW)}×${f(b.rootH)}`);

}

const findEl = (reading, id) => reading.elements.find((e) => e.editId === id);


/* =========================================================
   공개 하네스 열기 (native + sandbox 한 문서)
========================================================== */

const SANDBOX_FLAGS =
  `sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(SANDBOX_ORIGIN)}`;

async function openPublic(browser, options) {

  const o = options || {};

  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1000, height: 1000 }
  });

  await ctx.route(FIXTURE_IMAGE_URL, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: FIXTURE_IMAGE_BODY }));

  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e)));

  /* CSP 위반은 **모든 프레임**에서 모은다 */
  await page.addInitScript(() => {
    /* 프레임이 **정말로 무엇을 올려보내는가** — 원문 그대로 모은다 */
    window.__frameMessages = [];
    window.addEventListener("message", (event) => {
      try {
        window.__frameMessages.push(JSON.parse(JSON.stringify(event.data)));
      } catch (err) { /* 직렬화할 수 없는 것은 우리 것이 아니다 */ }
    }, true);

    window.__cspViolations = [];
    window.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push(
        event.violatedDirective + " <- " + (event.blockedURI || "(inline)")
      );
    });
  });

  await page.addInitScript(([pkg, context, slug]) => {
    window.__sandboxHarnessSkinPackageOverride = pkg;
    window.__sandboxHarnessContextOverride = context;
    /* 실제 문서에서는 home/site-owner.js 가 준다(?linkNav=1 일 때만 쓰인다) */
    window.siteOwnerSlug = slug;
  }, [o.skinPackage || skinPackage(), o.context || CONTEXT, CONTEXT.site.slug]);

  const query =
    "?" + SANDBOX_FLAGS +
    (o.native === false ? "" : "&native=1") +
    (o.linkNav ? "&linkNav=1" : "") +
    (o.pageType ? "&pageType=" + o.pageType : "");

  await page.goto(PARENT_ORIGIN + SANDBOX_HARNESS + query, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.__sandboxHarnessResult !== undefined, null, { timeout: 20000 }
  );

  const frame = page.frames().find((f) => f.url().startsWith(SANDBOX_ORIGIN)) || null;

  if (frame) {
    await frame.waitForFunction(
      () => document.getElementById("sandboxFrameRoot")
        .getAttribute("data-imory-sandbox-state") === "rendered",
      null, { timeout: 15000 }
    ).catch(() => {});
  }

  await page.waitForTimeout(200);

  return { ctx, page, frame, consoleErrors, pageErrors };

}

async function collectCspViolations(page) {
  const all = [];
  for (const f of page.frames()) {
    const list = await f.evaluate(() => window.__cspViolations || []).catch(() => []);
    all.push(...list);
  }
  return all;
}


/* =========================================================
   Studio 두 화면 — 같은 scenario(sb), renderMode 만 다르다
========================================================== */

async function openStudio(browser, options) {

  const o = options || {};

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });

  await ctx.route(FIXTURE_IMAGE_URL, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: FIXTURE_IMAGE_BODY }));

  const page = await ctx.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e)));

  await page.route("**/api/skin-ai", (route) => route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(() => {
    window.__cspViolations = [];
    window.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push(
        event.violatedDirective + " <- " + (event.blockedURI || "(inline)")
      );
    });
  });

  await page.addInitScript(([pkg, rows]) => {
    window.__scenarioSandboxSkinPackage = pkg;
    window.__scenarioSandboxSkinImageSlotValues = rows;
  }, [o.skinPackage, SLOT_VALUE_ROWS("skin-sb1")]);

  const query =
    "?scenario=sb" + (o.sandbox ? "&" + SANDBOX_FLAGS : "");

  await page.goto(PARENT_ORIGIN + SCENARIO_PATH + query, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null, { timeout: 25000 }
  );

  return { ctx, page, pageErrors };

}

/* Studio native Preview — preview-frame.html (같은 origin) */
function studioPreviewFrame(page) {
  return page.frames().find((f) => f.url().indexOf("preview-frame") !== -1) || null;
}

/* Studio sandbox Preview — preview-frame.html 안의 cross-origin frame */
function studioSandboxFrame(page) {
  return page.frames().find((f) => f.url().startsWith(SANDBOX_ORIGIN)) || null;
}


/* =========================================================
   실행
========================================================== */

async function run() {

  const playwright = await loadPlaywright(BROWSER);
  const parentServer = await startServer(PARENT_PORT);
  const sandboxServer = await startServer(SANDBOX_PORT);
  const browser = await playwright[BROWSER].launch();

  /* [parity] 가 쓰도록 쌍 A 의 읽기를 남겨 둔다 */
  let publicNative = null;
  let publicSandbox = null;

  try {

    /* ------------------------------------------------- */
    if (wants("assets")) {

      section("assets");

      const CANVAS_ASSETS = [
        ["/skin/skin-home-canvas-render.js", "javascript"],
        ["/skin/skin-home-canvas-render.css", "css"],
        /* 짝이 되는 데이터 계약 파일은 CONTRACT-1B 부터 있었다 — 함께 확인한다 */
        ["/skin/skin-home-canvas.js", "javascript"]
      ];

      for (const [p, kind] of CANVAS_ASSETS) {

        /* ★ 배포 버전 문자열을 여기 복사해 적지 않는다 — 원천은
           core/lib/build-version.js 의 APP_BUILD_VERSION 하나다
           (CLAUDE.md §4). allowlist 는 pathname 만 보므로 어떤 값이
           붙어도 판정이 같아야 하고, 그것을 **실제 배포 값**으로
           확인한다. */
        for (const suffix of ["", `?v=${APP_BUILD_VERSION}`]) {

          const res = await fetch(SANDBOX_ORIGIN + p + suffix);
          const type = (res.headers.get("content-type") || "").toLowerCase();
          const body = await res.text();

          const typeOk =
            kind === "css" ? type.includes("text/css") : type.includes("javascript");

          /* ★ SPA fallback HTML 이 200 으로 온 것을 성공으로 보지 않는다 */
          const notFallback =
            !type.includes("text/html") && body.indexOf("<!DOCTYPE html>") === -1;

          check(`sandbox origin: ${p}${suffix ? " (?v=)" : ""} 가 올바른 Content-Type 으로 200`,
            res.status === 200 && typeOk && notFallback,
            `${res.status} ${type} ${body.length}B`);

        }

      }

      /* allowlist 가 넓어지지 않았다 */
      const outside = [
        "/skin/skin-home-canvas-render-harness.html",
        "/skin/skin-home-canvas-render-e2e-test.mjs",
        "/skin/skin-template.js",
        "/studio/index.html"
      ];

      for (const p of outside) {
        const res = await fetch(SANDBOX_ORIGIN + p);
        check(`sandbox origin: allowlist 밖 ${p} 는 404`, res.status === 404, String(res.status));
      }

      /* 메인 origin 회귀 0 */
      for (const [p, kind] of CANVAS_ASSETS) {
        const res = await fetch(PARENT_ORIGIN + p);
        const type = (res.headers.get("content-type") || "").toLowerCase();
        const typeOk = kind === "css" ? type.includes("text/css") : type.includes("javascript");
        check(`메인 origin: ${p} 는 그대로 200`, res.status === 200 && typeOk, `${res.status} ${type}`);
      }

      check("메인 origin 에서 frame 문서는 여전히 404",
        (await fetch(PARENT_ORIGIN + "/skin/sandbox/frame")).status === 404);

    }


    /* ------------------------------------------------- */
    if (wants("isolate") || wants("csp") || wants("public") || wants("parity")) {

      const pub = await openPublic(browser);

      /* ---- isolate ---- */
      if (wants("isolate")) {

        section("isolate");

        check("프레임이 떴다", Boolean(pub.frame), pub.frame ? pub.frame.url() : "없음");

        check("★ 부모와 프레임의 origin 이 실제로 다르다",
          Boolean(pub.frame) && new URL(pub.frame.url()).origin !== PARENT_ORIGIN,
          `${PARENT_ORIGIN} vs ${pub.frame ? new URL(pub.frame.url()).origin : "-"}`);

        const access = await pub.page.evaluate(() => {
          const iframe = document.querySelector("iframe.imory-skin-sandbox-frame");
          if (!iframe) return "no-iframe";
          try {
            const doc = iframe.contentWindow.document;
            return doc ? "READ:" + doc.querySelectorAll("*").length : "null";
          } catch (err) {
            return err && err.name ? err.name : "throw";
          }
        });

        check("★ 부모가 frame DOM 을 못 읽는다(SecurityError)",
          access === "SecurityError", access);

        /* 부모(host)는 캔버스 때문이든 아니든 frame 문서를 직접
           열지 않는다 — 데이터는 postMessage 하나로만 간다. */
        const hostSource =
          fs.readFileSync(path.join(ROOT, "skin/sandbox/skin-sandbox-host.js"), "utf8");

        check("★ 부모가 frame DOM 에 손대는 코드가 한 줄도 없다",
          hostSource.indexOf("contentDocument") === -1 &&
          hostSource.indexOf("contentWindow.document") === -1);

      }

      /* ---- csp ---- */
      if (wants("csp")) {

        section("csp");

        const framePage = await fetch(SANDBOX_ORIGIN + "/skin/sandbox/frame");
        const csp = framePage.headers.get("content-security-policy") || "";

        check("★ 실제 응답에 CSP 가 있고 default-src 가 'none' 이다",
          csp.indexOf("default-src 'none'") !== -1, csp.slice(0, 120));

        check("★ CSP 를 넓히지 않았다 — unsafe-inline · unsafe-eval 없음",
          csp.indexOf("unsafe-inline") === -1 && csp.indexOf("unsafe-eval") === -1, csp);

        check("style-src 는 여전히 'self' + nonce 뿐이다",
          /style-src 'self' 'nonce-[A-Za-z0-9_-]+'/.test(csp),
          (csp.split(";").find((p) => p.indexOf("style-src") !== -1) || "").trim());

        const nonceMatch = /nonce-([A-Za-z0-9_-]+)/.exec(csp);
        const scriptSrc = (csp.split(";").find((p) => p.indexOf("script-src") !== -1) || "").trim();

        check("script-src 에 새 출처가 없다(self · nonce · CSS 파서 하나)",
          Boolean(nonceMatch) &&
          scriptSrc === `script-src 'self' 'nonce-${nonceMatch[1]}' ${server.SANDBOX_CSS_PARSER_URL}`,
          scriptSrc);

        const violations = await collectCspViolations(pub.page);

        check("★ CSP 위반 0건(부모 · 프레임 전부)",
          violations.length === 0, violations.slice(0, 4).join(" | "));

        const cspConsole = pub.consoleErrors.filter((t) =>
          /content security policy|refused to/i.test(t));

        check("★ 콘솔에 CSP 오류 0건", cspConsole.length === 0, cspConsole.slice(0, 3).join(" | "));

        check("스크립트 오류 0건", pub.pageErrors.length === 0, pub.pageErrors.slice(0, 3).join(" | "));

        /* Canvas JS 와 CSS 가 프레임 안에서 실제로 살아 있는가 */
        const alive = await pub.frame.evaluate(() => ({
          renderer: typeof window.compileSkinHomeCanvas === "function",
          link: Boolean(document.querySelector("link[data-imory-skin-home-canvas]")),
          linkHref: (document.querySelector("link[data-imory-skin-home-canvas]") || {}).href || "",
          sheetLoaded: Array.from(document.styleSheets)
            .some((s) => (s.href || "").indexOf("skin-home-canvas-render.css") !== -1 && s.cssRules.length > 0)
        }));

        check("★ Canvas 렌더러가 프레임 안에서 실행됐다(차단 0)", alive.renderer);
        check("★ Canvas 구조 CSS 가 프레임에 걸리고 실제로 읽혔다",
          alive.link && alive.sheetLoaded, alive.linkHref);

        /* geometry 가 정말로 먹었는가 — style.setProperty(CSSOM) 가 CSP 대상이 아님 */
        const geometry = await pub.frame.evaluate(() => {
          const el = document.querySelector('[data-imory-edit-id="canvas_photo_filled"]');
          const cs = getComputedStyle(el);
          return {
            inlineVar: el.style.getPropertyValue("--imory-canvas-x").trim(),
            left: cs.left,
            position: cs.position,
            hasStyleAttr: el.hasAttribute("style")
          };
        });

        check("★ style.setProperty() 로 쓴 geometry 가 CSP 아래에서 실제로 적용됐다",
          geometry.inlineVar === "5.128205%" && geometry.position === "absolute" &&
          parseFloat(geometry.left) > 15 && parseFloat(geometry.left) < 18,
          JSON.stringify(geometry));

      }

      /* ---- public ---- */
      if (wants("public") || wants("parity")) {

        publicSandbox = await pub.frame.evaluate(READ_DOC);
        publicNative = await pub.page.evaluate(READ_NATIVE_MOUNT);

      }

      if (wants("public")) {

        section("public");

        const f = publicSandbox;

        check("★ 공개 sandbox 프레임이 캔버스를 그렸다",
          f.found && f.active === "true" && f.version === "1" &&
          f.ownedCount === CANVAS_ELEMENTS.length,
          JSON.stringify({ a: f.active, n: f.ownedCount }));

        check("★ 배열 순서 = DOM 순서",
          f.elements.map((e) => e.editId).join(",") === CANVAS_ELEMENTS.map((e) => e.id).join(","),
          f.elements.map((e) => e.editId).join(","));

        check("도화지가 baseHeight 비율을 갖는다(320 → 692.5)",
          near(f.rootW, 320, 0.6) && near(f.rootH, 320 * (844 / 390), 1),
          `${f.rootW.toFixed(1)}×${f.rootH.toFixed(1)}`);

        check("photo — 채워진 슬롯은 img 하나이고 실제로 로드됐다",
          findEl(f, "canvas_photo_filled").innerTags === "img" &&
          findEl(f, "canvas_photo_filled").imgSrc === FIXTURE_IMAGE_URL &&
          findEl(f, "canvas_photo_filled").imgOk === true,
          String(findEl(f, "canvas_photo_filled").imgSrc));

        check("★ photo — 빈 슬롯이어도 wrapper 만 남는다",
          findEl(f, "canvas_photo_empty").innerTags === "");

        check("shape — rect · ellipse · line 이 구분되고 내용은 비었다",
          findEl(f, "canvas_shape_rect").shape === "rect" &&
          findEl(f, "canvas_shape_round").shape === "ellipse" &&
          findEl(f, "canvas_shape_line").shape === "line" &&
          f.elements.filter((e) => e.type === "shape").every((e) => e.innerTags === ""));

        check("★ logo — 슬롯이 비면 site_title 을 글자로",
          findEl(f, "canvas_logo_text").innerTags === "span" &&
          findEl(f, "canvas_logo_text").logoText === "SANDBOX PREVIEW BLOG",
          String(findEl(f, "canvas_logo_text").logoText));

        check("logo — 이미지가 있으면 img · alt 는 실제 블로그 제목",
          findEl(f, "canvas_logo_image").innerTags === "img" &&
          findEl(f, "canvas_logo_image").imgAlt === "SANDBOX PREVIEW BLOG");

        check("sticker — img · alt 는 빈 문자열",
          findEl(f, "canvas_sticker").innerTags === "img" &&
          findEl(f, "canvas_sticker").imgAlt === "");

        check("★ text — 줄바꿈 보존 · HTML 이 실행되지 않는다",
          findEl(f, "canvas_text_body").text.indexOf("\n") !== -1 &&
          findEl(f, "canvas_text_body").innerTags === "p" &&
          (await pub.frame.evaluate(() => window.__canvasXss === undefined)),
          JSON.stringify(findEl(f, "canvas_text_body").text));

        check("★ category_nav all — 카테고리 전체를 순서대로",
          JSON.stringify(findEl(f, "canvas_nav_all").links.map((l) => l.name)) ===
          JSON.stringify(SB_CATEGORIES.map((c) => c.name)),
          JSON.stringify(findEl(f, "canvas_nav_all").links.map((l) => l.name)));

        check("★ category_nav selected — categoryIds 순서대로 · 없는 id 는 건너뛴다",
          JSON.stringify(findEl(f, "canvas_nav_picked").links.map((l) => l.name)) ===
          JSON.stringify(["PIC", "LOG"]),
          JSON.stringify(findEl(f, "canvas_nav_picked").links.map((l) => l.name)));

        check("링크는 실제 a[href] 이고 기존 내부 주소를 쓴다",
          findEl(f, "canvas_nav_all").links.every((l) => (l.href || "").startsWith("/scenario-sb/")),
          JSON.stringify(findEl(f, "canvas_nav_all").links.map((l) => l.href)));

        check("hidden 요소는 프레임에서도 그려지지 않는다",
          findEl(f, "canvas_shape_line").hiddenAttr === "true" &&
          findEl(f, "canvas_shape_line").displayed === false);

        check("locked 요소는 표시만 되고 모양은 그대로",
          findEl(f, "canvas_photo_empty").lockedAttr === "true" &&
          near(findEl(f, "canvas_photo_empty").w, 70 * (320 / 390), 1));

        /* 390 저장 좌표 → 320 도화지 */
        const scale = 320 / 390;
        const wrong = CANVAS_ELEMENTS.filter((spec) => {
          if (spec.hidden === true) return false;
          const el = findEl(f, spec.id);
          if (!el) return true;
          if (!near(el.cx, (spec.x + spec.width / 2) * scale, 1)) return true;
          if (!near(el.w, spec.width * scale, 1)) return true;
          if (typeof spec.height === "number") {
            if (!near(el.cy, (spec.y + spec.height / 2) * scale, 1)) return true;
            if (!near(el.h, spec.height * scale, 1)) return true;
          }
          return false;
        });

        check("★ 프레임에서도 저장 좌표가 같은 배율로 풀린다",
          wrong.length === 0, wrong.map((s) => s.id).join(", "));

        check("★ 회전 각도가 프레임에서도 그대로",
          near(findEl(f, "canvas_sticker").angle, 45, 0.75) &&
          near(findEl(f, "canvas_shape_round").angle, 12, 0.75) &&
          near(findEl(f, "canvas_text_body").angle, -2, 0.75),
          [findEl(f, "canvas_sticker").angle, findEl(f, "canvas_shape_round").angle,
            findEl(f, "canvas_text_body").angle].join("/"));

      }

      await pub.ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("v2-flow")) {

      section("v2-flow");

      /*
        같은 문서에서 native 와 sandbox 를 함께 그린다(공개 쌍 A 와
        같은 하네스). 숫자 검산은 native 쪽에서 이미 끝났으므로
        (skin/skin-home-canvas-render-e2e-test.mjs [v2-flow] 절)
        여기서 묻는 것은 **프레임 안에서도 같은가** 다.
      */
      const pub = await openPublic(browser, {
        skinPackage: skinPackage({
          regions: [{ name: "home_canvas", enabled: true, canvas: v2CanvasData() }]
        })
      });

      const frameRead = await pub.frame.evaluate(READ_V2_DOC);
      const nativeRead = await pub.page.evaluate(READ_V2_NATIVE);

      check("★ 공개 sandbox 프레임이 v2 를 그렸다",
        frameRead.found && frameRead.active === "true" && frameRead.version === "2" &&
        frameRead.hasFlow && frameRead.blocks.length === V2_BLOCKS.length,
        JSON.stringify({ v: frameRead.version, f: frameRead.hasFlow, n: frameRead.blocks.length }));

      check("★ 프레임 안에서도 흐름 층이 absolute + flex 다(구조 CSS 가 닿았다)",
        frameRead.flowPosition === "absolute" && frameRead.flowDisplay === "flex" &&
        frameRead.flowDirection === "column",
        JSON.stringify({ p: frameRead.flowPosition, d: frameRead.flowDisplay }));

      check("★ 블록 배열 순서 = DOM 순서",
        frameRead.blocks.map((b) => b.editId).join(",") === V2_BLOCKS.map((b) => b.id).join(","),
        frameRead.blocks.map((b) => b.editId).join(","));

      const fBlock = (id) => frameRead.blocks.find((b) => b.editId === id);

      /* 저장 좌표 390 → 도화지 320. padding 을 뺀 자가 350 이다 */
      const scale = 320 / 390;

      check("★ 프레임에서도 정렬 네 값이 같은 배율로 풀린다",
        near(fBlock("canvas_v2logo").x, 20 * scale, 1) &&
        near(fBlock("canvas_v2logo").w, 120 * scale, 1) &&
        near(fBlock("canvas_v2title").x, 45 * scale, 1) &&
        near(fBlock("canvas_v2rule").x, 240 * scale, 1) &&
        near(fBlock("canvas_v2nav").w, 330 * scale, 1) &&
        near(fBlock("canvas_v2wide").w, 120 * scale, 1),
        JSON.stringify([fBlock("canvas_v2logo").x, fBlock("canvas_v2title").x,
          fBlock("canvas_v2rule").x, fBlock("canvas_v2nav").w]));

      check("★ padding · gap · margin 합산도 프레임에서 같다(40·10+6)",
        near(frameRead.padTop, 40 * scale, 1) &&
        near(fBlock("canvas_v2title").y -
          (fBlock("canvas_v2logo").y + fBlock("canvas_v2logo").h), 16 * scale, 1),
        `${frameRead.padTop} / ${fBlock("canvas_v2title").y}`);

      check("★ hidden 블록이 프레임에서도 자리를 차지하지 않는다",
        fBlock("canvas_v2gone").displayed === false && near(fBlock("canvas_v2gone").h, 0, 0.1));

      /* ---- main_visual 내부 (V2-MAIN-VISUAL-1) ---- */

      const fMain = fBlock("canvas_v2main");
      const fInner = (id) => fMain.inner.find((n) => n.editId === id);

      check("★ main_visual 내부가 프레임 안에서도 배열 순서로 그려진다",
        fMain.isFrame === true &&
        fMain.inner.map((n) => n.editId).join(",") ===
          "canvas_v2paper,canvas_v2photo,canvas_v2label,canvas_v2tag,canvas_v2cap" &&
        fMain.inner.map((n) => n.follow).join(",") ===
          "transform,transform,pin,pin,pin",
        fMain.inner.map((n) => n.editId).join(","));

      check("★ 프레임 안에서도 primary 사진이 이미지 슬롯으로 그려진다(CSP img-src 통과)",
        fInner("canvas_v2photo").innerTags === "img" &&
        typeof fInner("canvas_v2photo").imgSrc === "string" &&
        fInner("canvas_v2photo").imgSrc.startsWith("https://") &&
        fInner("canvas_v2photo").imgFit === "contain",
        JSON.stringify({ s: fInner("canvas_v2photo").imgSrc, f: fInner("canvas_v2photo").imgFit }));

      check("★ 프레임 안에서도 transform 은 S_frame 을 받고 pin 은 안 받는다",
        near(fInner("canvas_v2paper").w, 300 * scale, 1) &&
        near(fInner("canvas_v2photo").w, 200 * scale, 1) &&
        near(fInner("canvas_v2label").w, 40 * scale, 1) &&
        near(fInner("canvas_v2tag").w, 40 * scale, 1),
        JSON.stringify([fInner("canvas_v2paper").w, fInner("canvas_v2photo").w,
          fInner("canvas_v2label").w, fInner("canvas_v2tag").w]));

      check("★ 프레임 안에서도 pin 의 origin 을 CSS translate 가 뺀다(라벨 오른쪽 변이 기준점)",
        fInner("canvas_v2label").vars.tx === "-100%" &&
        fInner("canvas_v2label").vars.ty === "-50%" &&
        near(fInner("canvas_v2label").right, 12 * scale, 1),
        `${fInner("canvas_v2label").right}`);

      check("★ 프레임 안에서도 회전이 translate 뒤에 걸린다(태그 8°)",
        near(fInner("canvas_v2tag").angle, 8, 0.75), String(fInner("canvas_v2tag").angle));

      check("★ height \"auto\" 프레임의 비율이 프레임 안에서도 primary 사진 상자다(200 × 80)",
        fBlock("canvas_v2auto").frameRatioW === "100" &&
        fBlock("canvas_v2auto").frameRatioH === "40" &&
        near(fBlock("canvas_v2auto").w, 200 * scale, 1) &&
        near(fBlock("canvas_v2auto").h, 80 * scale, 1),
        `${fBlock("canvas_v2auto").w} × ${fBlock("canvas_v2auto").h}`);

      check("★ category 링크가 프레임에서도 실제 a[href] 이고 내부 주소를 쓴다",
        fBlock("canvas_v2nav").links.length === 2 &&
        fBlock("canvas_v2nav").links.every((l) => (l.href || "").startsWith("/scenario-sb/")),
        JSON.stringify(fBlock("canvas_v2nav").links.map((l) => l.href)));

      check("★ 자유 장식이 프레임에서도 v1 규칙대로다(위치 · 크기 · 회전)",
        frameRead.overlays.length === 1 &&
        frameRead.overlays[0].isOverlay === true &&
        frameRead.overlays[0].position === "absolute" &&
        frameRead.overlays[0].vars.rotation === "15deg" &&
        near(frameRead.overlays[0].cx, 30 * scale, 1) &&
        near(frameRead.overlays[0].cy, 720 * scale, 1) &&
        near(frameRead.overlays[0].angle, 15, 0.75),
        JSON.stringify(frameRead.overlays[0] && frameRead.overlays[0].vars));

      /* ---- native ↔ sandbox parity ---- */

      check("★ native ↔ sandbox — DOM 이 글자 단위로 같다",
        JSON.stringify(v2DomShape(nativeRead)) === JSON.stringify(v2DomShape(frameRead)),
        JSON.stringify(v2DomShape(frameRead)).slice(0, 300));

      /* ★ 숨긴 블록은 상자가 없다(display:none 의 rect 는 전부 0) —
         두 문서에서 도화지의 화면 위치가 다르므로 상대 좌표가 의미를
         갖지 않는다. 안 그려졌다는 사실은 위 [hidden] 검사가 본다. */
      const boxDiff = frameRead.blocks.filter((b, i) => {
        const n = nativeRead.blocks[i];
        if (!n) return true;
        if (b.displayed === false) return n.displayed !== false;
        return !near(n.x, b.x, 1) || !near(n.y, b.y, 1) ||
          !near(n.w, b.w, 1) || !near(n.h, b.h, 1);
      });

      check("★ native ↔ sandbox — 블록 좌표와 크기가 같다",
        boxDiff.length === 0, boxDiff.map((b) => b.editId).join(", "));

      /* V2-MAIN-VISUAL-1 — 프레임 내부는 **프레임 기준** 상대좌표로 잰다 */
      const innerDiff = [];

      frameRead.blocks.forEach((b, i) => {
        const n = nativeRead.blocks[i];
        if (!n || b.displayed === false) return;
        b.inner.forEach((item, k) => {
          const other = n.inner[k];
          if (!other || other.editId !== item.editId) {
            innerDiff.push(item.editId + "(없음)");
            return;
          }
          if (
            !near(other.cx, item.cx, 1) || !near(other.cy, item.cy, 1) ||
            !near(other.w, item.w, 1) || !near(other.h, item.h, 1) ||
            !near(other.angle, item.angle, 0.1)
          ) {
            innerDiff.push(item.editId);
          }
        });
      });

      check("★ native ↔ sandbox — main_visual 내부 요소의 좌표 · 크기 · 각도가 같다",
        innerDiff.length === 0, innerDiff.join(", "));

      check("★ native ↔ sandbox — 자유 장식의 중심 · 크기 · 각도가 같다",
        nativeRead.overlays.length === frameRead.overlays.length &&
        frameRead.overlays.every((o, i) =>
          near(nativeRead.overlays[i].cx, o.cx, 1) &&
          near(nativeRead.overlays[i].cy, o.cy, 1) &&
          near(nativeRead.overlays[i].w, o.w, 1) &&
          near(nativeRead.overlays[i].angle, o.angle, 0.1)));

      /* ---- 봉투 · CSP ---- */

      const violations = await collectCspViolations(pub.page);

      check("★ v2 를 그려도 CSP 위반 0건(완화 없음)",
        violations.length === 0, violations.slice(0, 4).join(" | "));

      check("★ 스크립트 오류 0건", pub.pageErrors.length === 0,
        pub.pageErrors.slice(0, 3).join(" | "));

      /*
        ★ 봉투 자체는 여기서 다시 재지 않는다. 프레임이 v2 를 그렸다는
          것이 곧 "부모의 strict allowlist(isSandboxTemplate)를 지났고,
          프레임이 자기 쪽에서 한 번 더 payload 로 옮겼다"의 증거다.
          칸 목록은 브라우저 없이 도는 skin/skin-home-canvas-test.mjs
          [protocol] 절이 양방향으로 본다.
      */

      /* ---- 잘못된 v2 는 프레임에도 가지 않는다 ---- */

      await pub.ctx.close();

      const badPub = await openPublic(browser, {
        skinPackage: skinPackage({
          regions: [{
            name: "home_canvas", enabled: true,
            canvas: v2CanvasData({
              flow: {
                direction: "column", padding: {}, gap: 0,
                blocks: [{ id: "canvas_bad", type: "logo", width: 120, height: "auto",
                  props: { slot: "logo_empty" } }]
              }
            })
          }]
        })
      });

      const badFrame = await badPub.frame.evaluate(READ_V2_DOC);

      check("★ 잘못된 v2 는 프레임에도 실리지 않는다(기존 HOME)",
        badFrame.found && badFrame.active === null && badFrame.hasFlow === false,
        JSON.stringify({ a: badFrame.active, f: badFrame.hasFlow }));

      await badPub.ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("nav")) {

      section("nav");

      {
        /*
          공개 문서처럼 링크 규칙(skin/skin-link-nav.js)을 함께 로드한다
          — 프레임이 받는 navId 표를 채우는 mint() 가 그 함수에 묻는다.
        */
        const pub = await openPublic(browser, { native: false, linkNav: true });

        /*
          공개 화면에서는 handle.onNavigate 가 없으면 기존
          navigateToSkinRoute() 로 간다(이 하네스 문서에는 그 전역이
          없다). 여기서는 **기존 메시지 경로가 부모까지 닿는지**를
          보려고 그 자리에 기록만 하는 함수를 끼운다 — 프레임에도
          운영 코드에도 테스트 전용 메시지를 더하지 않는다.
        */
        await pub.page.evaluate(() => {
          window.__navTargets = [];
          window.__sandboxHarnessHandle.onNavigate = (target) => {
            window.__navTargets.push(target);
          };
        });

        const before = pub.frame.url();

        await pub.frame.locator('[data-imory-edit-id="canvas_nav_all"] a').first().click();
        await pub.page.waitForTimeout(400);

        const targets = await pub.page.evaluate(() => window.__navTargets);

        check("★ 캔버스 카테고리 클릭이 기존 sandbox navigation 메시지로 부모에 올라온다",
          targets.length === 1 && targets[0] &&
          targets[0].href === "/scenario-sb/category/301" &&
          targets[0].route && targets[0].route.page === "category",
          JSON.stringify(targets));

        check("프레임은 자기 문서를 떠나지 않는다", pub.frame.url() === before,
          pub.frame.url());

        /* 정적 서버가 Pages 처럼 .html 을 308 로 접으므로 확장자 없는
           주소가 정본이다 — 그 문서를 떠나지 않았는지만 본다. */
        check("부모 문서도 그대로다(이동은 라우터가 처리한다)",
          pub.page.url().indexOf("/skin/skin-sandbox-test") !== -1,
          pub.page.url());

        /*
          ★ 프레임이 **주소가 아니라** 부모가 발급한 정수 하나를
            돌려보낸다(skin/sandbox/skin-sandbox-nav.js). 캔버스 링크도
            그 계약을 그대로 쓴다 — 별도 라우터도, 새 메시지도 없다.
        */
        const wire = await pub.page.evaluate(() =>
          (window.__frameMessages || []).filter((m) => m && m.type === "IMORY_NAVIGATE"));

        const navPayload = wire.length ? wire[wire.length - 1].payload : null;

        check("★ 캔버스 링크도 기존 계약대로 navId 정수 하나만 올린다(주소를 보내지 않는다)",
          wire.length === 1 && navPayload &&
          Number.isInteger(navPayload.navId) &&
          navPayload.url === undefined && navPayload.href === undefined,
          JSON.stringify(wire));

        await pub.ctx.close();

      }

    }


    /* ------------------------------------------------- */
    if (wants("width")) {

      section("width");

      /* 도화지 폭만 다른 스킨 — 저장 데이터는 그대로다 */
      const wide = skinPackage({
        css: CANVAS_CSS.replace(".hc-canvas { width: 320px; }", ".hc-canvas { width: 780px; }")
      });

      const pub = await openPublic(browser, { skinPackage: wide, viewport: { width: 1200, height: 1000 } });

      const f = await pub.frame.evaluate(READ_DOC);
      const n = await pub.page.evaluate(READ_NATIVE_MOUNT);

      const scale = 780 / 390;

      check("★ 도화지 780px — 세로도 같은 배율",
        near(f.rootW, 780, 0.6) && near(f.rootH, 844 * scale, 1.5),
        `${f.rootW.toFixed(1)}×${f.rootH.toFixed(1)}`);

      const wrong = CANVAS_ELEMENTS.filter((spec) => {
        if (spec.hidden === true) return false;
        const el = findEl(f, spec.id);
        if (!el) return true;
        if (!near(el.cx, (spec.x + spec.width / 2) * scale, 1)) return true;
        if (!near(el.w, spec.width * scale, 1)) return true;
        if (typeof spec.height === "number") {
          if (!near(el.cy, (spec.y + spec.height / 2) * scale, 1)) return true;
          if (!near(el.h, spec.height * scale, 1)) return true;
        }
        return false;
      });

      check("★ 도화지 780px — 네 값이 모두 같은 배율(2)",
        wrong.length === 0, wrong.map((s) => s.id).join(", "));

      compareDom("★ 780px 에서도 native 와 sandbox 의 DOM 이 같다", n, f);
      compareGeometry("★ 780px 에서도 native 와 sandbox 의 좌표가 같다", n, f);

      check("CSP 위반 0건", (await collectCspViolations(pub.page)).length === 0);

      await pub.ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("fallback")) {

      section("fallback");

      const cases = [
        ["canvas 없음", skinPackage({ regions: [] }), 0, false],
        ["표식 없음", skinPackage({ homeHtml: PLAIN_HOME_HTML }), 0, false],
        ["표식 둘", skinPackage({ homeHtml: TWO_MARKER_HOME_HTML }), 0, false],
        ["미래 version", skinPackage({ canvas: { version: 99 } }), 0, false],
        ["enabled:false", skinPackage({ regions: [{ name: "home_canvas", enabled: false, canvas: canvasData() }] }), 0, false],
        ["깨진 데이터", skinPackage({ canvas: { elements: [{ id: "canvas_broken", type: "photo", x: 0, y: 0, width: 0, height: 10, props: { slot: "photo_1" } }] } }), 0, false],
        ["elements:[]", skinPackage({ canvas: { elements: [] } }), 0, true]
      ];

      for (const [label, pkg, expectCount, expectActive] of cases) {

        const pub = await openPublic(browser, { skinPackage: pkg, native: false });

        const f = await pub.frame.evaluate(READ_DOC);

        if (expectActive) {

          check(`★ ${label} — 빈 Canvas 면으로 그려진다`,
            f.found && f.active === "true" && f.ownedCount === 0 &&
            near(f.rootH, 320 * (844 / 390), 1),
            `active=${f.active} n=${f.ownedCount} h=${f.rootH.toFixed(1)}`);

        } else {

          check(`★ ${label} — 프레임에서도 기존 HOME 그대로(활성 0 · 요소 ${expectCount})`,
            (f.found ? f.active === null : true) && (f.found ? f.ownedCount === 0 : true) &&
            !f.styleLink,
            `found=${f.found} active=${f.found ? f.active : "-"} n=${f.found ? f.ownedCount : 0} link=${f.styleLink}`);

        }

        check(`${label} — 스크립트 오류 · CSP 위반 0`,
          pub.pageErrors.length === 0 && (await collectCspViolations(pub.page)).length === 0,
          pub.pageErrors.slice(0, 2).join(" | "));

        await pub.ctx.close();

      }

    }


    /* ------------------------------------------------- */
    if (wants("rerender")) {

      section("rerender");

      const pub = await openPublic(browser, { native: false });

      /* 프레임이 봉투에서 받은 것과 **같은** 실행 payload
         (부모가 resolveSkinTemplate 으로 만들어 보낸 그 값이다) */
      const canvasPayload =
        await pub.page.evaluate(() => window.__sandboxHarnessTemplate.canvas);

      const repeat = await pub.frame.evaluate((canvas) => {

        const root = document.querySelector("[data-skin-root]");
        const marker = root.querySelector("[data-imory-canvas-root]");

        /* 스킨이 표식 안에 직접 적어 둔 자식이 있다고 가정한다 */
        const own = document.createElement("i");
        own.className = "skin-owned";
        marker.insertBefore(own, marker.firstChild);
        marker.classList.add("skin-added-class");

        const context = { site: { title: "SANDBOX PREVIEW BLOG" }, navigation: { categories: [] }, images: {} };

        const before = JSON.stringify(canvas);

        window.compileSkinHomeCanvas(root, canvas, context);
        window.compileSkinHomeCanvas(root, canvas, context);
        window.compileSkinHomeCanvas(root, canvas, context);

        return {
          hasCanvas: Boolean(canvas),
          elements: marker.querySelectorAll(":scope > [data-imory-canvas-element]").length,
          skinOwned: marker.querySelectorAll(".skin-owned").length,
          keepsClass: marker.classList.contains("skin-added-class"),
          markerStill: marker.hasAttribute("data-imory-canvas-root"),
          nonMutated: JSON.stringify(canvas) === before
        };

      }, canvasPayload);

      check("프레임이 실행 payload 를 갖고 있다", repeat.hasCanvas);

      check("★ 같은 표식에 세 번 그려도 요소가 중복되지 않는다",
        repeat.elements === CANVAS_ELEMENTS.length, String(repeat.elements));

      check("★ 스킨이 표식 안에 적어 둔 자식은 지워지지 않는다", repeat.skinOwned === 1);

      check("표식과 스킨이 준 class · 속성은 그대로",
        repeat.keepsClass && repeat.markerStill);

      check("★ 입력 Canvas 데이터를 mutate 하지 않는다", repeat.nonMutated);

      const cleared = await pub.frame.evaluate(() => {
        const root = document.querySelector("[data-skin-root]");
        const marker = root.querySelector("[data-imory-canvas-root]");
        window.compileSkinHomeCanvas(root, undefined, {});
        return {
          elements: marker.querySelectorAll("[data-imory-canvas-element]").length,
          active: marker.hasAttribute("data-imory-canvas-active"),
          version: marker.hasAttribute("data-imory-canvas-version"),
          baseVar: marker.style.getPropertyValue("--imory-canvas-base-width"),
          skinOwned: marker.querySelectorAll(".skin-owned").length,
          markerStill: marker.hasAttribute("data-imory-canvas-root")
        };
      });

      check("★ 캔버스가 사라지면 만든 DOM 과 활성 표시만 정리한다",
        cleared.elements === 0 && cleared.active === false && cleared.version === false &&
        cleared.baseVar === "" && cleared.skinOwned === 1 && cleared.markerStill,
        JSON.stringify(cleared));

      check("CSP 위반 0건", (await collectCspViolations(pub.page)).length === 0);

      await pub.ctx.close();

    }


    /* ------------------------------------------------- */
    if (wants("pages")) {

      section("pages");

      for (const pageType of ["category", "post", "banner"]) {

        const pub = await openPublic(browser, { pageType, native: false });

        const f = pub.frame ? await pub.frame.evaluate(READ_DOC) : { found: false };

        check(`★ ${pageType.toUpperCase()} — 표식이 있어도 프레임이 캔버스를 그리지 않는다`,
          f.found && f.markers === 1 && f.active === null &&
          f.ownedCount === 0 && !f.styleLink,
          JSON.stringify({ found: f.found, markers: f.markers, active: f.active, n: f.ownedCount }));

        check(`${pageType.toUpperCase()} — 스크립트 오류 0`,
          pub.pageErrors.length === 0, pub.pageErrors.slice(0, 2).join(" | "));

        await pub.ctx.close();

      }

    }


    /* ------------------------------------------------- */
    if (wants("parity")) {

      section("parity");

      /* 쌍 A — 공개 (한 문서, 같은 template · 같은 투영 Context) */

      check("공개 native 와 공개 sandbox 가 둘 다 그려졌다",
        Boolean(publicNative) && Boolean(publicSandbox) &&
        publicNative.ownedCount === CANVAS_ELEMENTS.length &&
        publicSandbox.ownedCount === CANVAS_ELEMENTS.length,
        `${publicNative ? publicNative.ownedCount : "-"} / ${publicSandbox ? publicSandbox.ownedCount : "-"}`);

      compareDom("★ 쌍 A — 공개 native ↔ 공개 sandbox 의 DOM 이 같다",
        publicNative, publicSandbox);

      compareGeometry("★ 쌍 A — 공개 native ↔ 공개 sandbox 의 좌표가 같다(1px · 0.75°)",
        publicNative, publicSandbox);


      /* 쌍 B — Studio (같은 scenario, renderMode 만 다르다) */

      const studioNativeSession =
        await openStudio(browser, { skinPackage: skinPackage({ sandbox: false }), sandbox: false });

      const nativePreview = studioPreviewFrame(studioNativeSession.page);

      if (nativePreview) {
        await nativePreview.waitForFunction(
          () => Boolean(document.querySelector("[data-imory-canvas-element]")),
          null, { timeout: 20000 }
        ).catch(() => {});
      }

      await studioNativeSession.page.waitForTimeout(400);

      const studioNative =
        nativePreview ? await nativePreview.evaluate(READ_DOC) : { found: false, ownedCount: 0, elements: [] };

      check("Studio native Preview 가 캔버스를 그렸다",
        studioNative.found && studioNative.active === "true" &&
        studioNative.ownedCount === CANVAS_ELEMENTS.length,
        `${studioNative.found} n=${studioNative.ownedCount}`);

      await studioNativeSession.ctx.close();


      const studioSandboxSession =
        await openStudio(browser, { skinPackage: skinPackage(), sandbox: true });

      let sandboxPreview = null;
      for (let i = 0; i < 40 && !sandboxPreview; i += 1) {
        sandboxPreview = studioSandboxFrame(studioSandboxSession.page);
        if (!sandboxPreview) await studioSandboxSession.page.waitForTimeout(500);
      }

      if (sandboxPreview) {
        await sandboxPreview.waitForFunction(
          () => Boolean(document.querySelector("[data-imory-canvas-element]")),
          null, { timeout: 20000 }
        ).catch(() => {});
      }

      await studioSandboxSession.page.waitForTimeout(400);

      const studioSandbox =
        sandboxPreview ? await sandboxPreview.evaluate(READ_DOC) : { found: false, ownedCount: 0, elements: [] };

      check("Studio sandbox Preview 가 cross-origin 프레임에 캔버스를 그렸다",
        studioSandbox.found && studioSandbox.active === "true" &&
        studioSandbox.ownedCount === CANVAS_ELEMENTS.length &&
        Boolean(sandboxPreview) && sandboxPreview.url().startsWith(SANDBOX_ORIGIN),
        `${studioSandbox.found} n=${studioSandbox.ownedCount} ${sandboxPreview ? sandboxPreview.url() : "프레임 없음"}`);

      compareDom("★ 쌍 B — Studio native ↔ Studio sandbox 의 DOM 이 같다",
        studioNative, studioSandbox);

      compareGeometry("★ 쌍 B — Studio native ↔ Studio sandbox 의 좌표가 같다(1px · 0.75°)",
        studioNative, studioSandbox);

      check("Studio sandbox 쪽 CSP 위반 0건",
        (await collectCspViolations(studioSandboxSession.page)).length === 0);

      await studioSandboxSession.ctx.close();


      /* 쌍 A ↔ 쌍 B — 주소만 빼고 전부 */

      compareDom("★ 네 화면 — 공개 쌍 ↔ Studio 쌍의 DOM 이 같다(주소 제외)",
        publicSandbox, studioSandbox, { href: false });

      compareGeometry("★ 네 화면 — 공개 쌍 ↔ Studio 쌍의 좌표가 같다(1px · 0.75°)",
        publicSandbox, studioSandbox);

      check("네 화면 모두 같은 도화지 비율",
        [publicNative, publicSandbox, studioNative, studioSandbox]
          .every((r) => near(r.rootH / r.rootW, 844 / 390, 0.01)),
        [publicNative, publicSandbox, studioNative, studioSandbox]
          .map((r) => (r.rootH / r.rootW).toFixed(3)).join(" / "));

    }

  } finally {
    await browser.close();
    parentServer.close();
    sandboxServer.close();
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
