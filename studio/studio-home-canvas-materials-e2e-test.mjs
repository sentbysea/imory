/* =========================================================
   STUDIO — Layers 의 재료 탐색 화면 E2E
   (STUDIO-LAYERS-MATERIALS-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §35
   계획:      docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §3

   ── 이 파일이 재는 것 ───────────────────────────────────
   화면 하나다 — `＋ 재료 추가`를 누르면 열리는 **요소 추가** 하위
   화면. 쓰기 경로(관문 · 순수 함수 · 기록 한 칸)는 이 라운드에서
   한 글자도 바뀌지 않았으므로 여기서 다시 재지 않는다. 그쪽은
   studio/studio-home-canvas-inspector-e2e-test.mjs --only=v2add 다.

   그래서 여기서 보는 것은 넷이다.

     1  **고르는 길이 화면에 있는가** — 분류 둘 · 카드 여덟 ·
        이름과 설명 · 2열 격자
     2  **한 번 누르면 한 칸인가** — 만들고 · 고르고 · 트리로
        돌아가 그 행을 보여 준다
     3  **없는 것을 만들지 않는가** — 이미 있는 홈 구성은 중복으로
        만들지 않고 그것을 고른다. 준비 중 카드는 **데이터를 한 줄도
        쓰지 않는다**
     4  **갇히지 않는가** — Escape 와 `← Layers` 가 같은 곳으로 간다

   [screen]   하위 화면 진입 · 분류와 순서 · 카드의 이름/설명/그림 ·
              트리가 물러난다 · 슬롯 칸이 남아 있다
   [add]      지원되는 재료 클릭 추가 · Undo 한 칸 · 새 요소 선택 ·
              Preview 외곽선 · Layers 행 연결
   [dupe]     홈 구성 중복 생성 방지 · `추가됨` 카드가 기존 요소를
              고른다 · 처음부터 있는 스킨
   [soon]     준비 중 카드는 눌리지 않고 데이터를 쓰지 않는다
   [back]     Escape · `← Layers` · 초점
   [mobile]   390px — 가로 스크롤 0 · 잘림 0
   [sandbox]  별도 origin 프레임에서 같은 결과 + CSP 위반 0

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-materials-e2e-test.mjs
     node studio/studio-home-canvas-materials-e2e-test.mjs --only=add
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 9008;
const SANDBOX_PORT = 9009;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html?scenario=lay";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = argOf("only", "");

const wants = (name) => !ONLY || ONLY.split(",").map((n) => n.trim()).includes(name);
const section = (name) => console.log(`\n[${name}]`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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


/* =========================================================
   playwright
========================================================== */

async function loadPlaywright() {
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
    if (!mod.chromium) continue;
    try {
      const probe = await mod.chromium.launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }
  throw new Error(`playwright chromium 을 실행할 수 없습니다.\n  - ${tried.join("\n  - ") || "없음"}`);
}


/* =========================================================
   정적 서버 — 배포되는 middleware 를 그대로 태운다
========================================================== */

const middleware = await import(
  pathToFileURL(path.join(ROOT, "functions", "_middleware.js")).href
);

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
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
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
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  return new Response(fs.readFileSync(path.join(ROOT, "index.html")), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
  });

}


function startServer(port) {

  const server = http.createServer(async (req, res) => {

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
      res.end(String((err && err.stack) || err));
      return;
    }

    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });

    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);

  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));

}


/* =========================================================
   fixture

   ★ **비어 있는 홈에서 시작한다.** 이 화면이 처음 쓰이는 자리가
     "아직 아무것도 없는 캔버스"이고, 홈 구성 셋(로고 · 카테고리 ·
     메인 비주얼)이 전부 `추가됨`이 아닌 상태에서 출발해야 §35-4 의
     두 갈래를 모두 잴 수 있다.

     mvPackage() 는 그 반대다 — `main_visual` 이 처음부터 있는 스킨.
========================================================== */

const HOME_HTML =
  '<div class="mt-home">' +
  '<div class="mt-canvas" data-imory-canvas-root></div>' +
  "</div>";

const CANVAS_CSS =
  ".mt-home { padding: 0; margin: 0; }" +
  ".mt-canvas { width: 100%; }" +
  '[data-imory-canvas-type="text"] { font: 14px/1.5 Arial, sans-serif; }' +
  '[data-imory-canvas-type="photo"] { background: #efe3d2; }' +
  '[data-imory-canvas-type="logo"] { background: #e6e0f0; }' +
  '[data-imory-canvas-type="category_nav"] { background: #dce8e2; }';

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진", required: false },
  { name: "title_logo", label: "로고", required: false }
];


function skinPackage(options) {

  const o = options || {};

  const pkg = {
    schemaVersion: 1,
    templates: {
      home: { html: HOME_HTML },
      category: { html: '<div class="mt-category"></div>' },
      post: { html: '<div class="mt-post"><div data-imory-region="post-body"></div></div>' },
      banner: { html: '<div class="mt-banner"></div>' }
    },
    css: CANVAS_CSS,
    imageSlots: IMAGE_SLOTS,
    regions: [
      {
        name: "home_canvas",
        enabled: true,
        canvas: {
          version: 2,
          baseWidth: 390,
          baseHeight: 900,
          flow: {
            direction: "column",
            padding: { top: 40, right: 24, bottom: 40, left: 24 },
            gap: 10,
            blocks: JSON.parse(JSON.stringify(o.blocks || []))
          },
          overlays: JSON.parse(JSON.stringify(o.overlays || []))
        }
      }
    ],
    metadata: {}
  };

  if (o.sandbox) {
    pkg.renderMode = "sandbox";
  }

  return pkg;

}


/* 처음부터 홈 구성 셋이 다 있는 스킨 */
function fullPackage(options) {

  return skinPackage({
    ...(options || {}),
    blocks: [
      { id: "mtLogo", type: "logo", width: 160, height: 48, align: "left",
        props: { slot: "title_logo", fallback: "site_title" } },

      { id: "mtNav", type: "category_nav", width: 300, height: 60, align: "stretch",
        props: { mode: "all", categoryIds: [] } },

      { id: "mtMain", type: "main_visual", width: 300, height: 200, align: "center",
        props: {
          baseWidth: 150, baseHeight: 100, primaryId: "mtPhoto",
          elements: [
            { id: "mtPhoto", type: "photo", follow: "transform",
              x: 10, y: 5, width: 120, height: 80, props: { slot: "photo_1" } }
          ]
        } }
    ]
  });

}


/* 빈 캔버스는 그릴 것이 없어 프레임 준비 판정이 어렵다 — 아무
   자리에도 걸리지 않는 글자 블록 하나를 둔다. */
function seedPackage(options) {

  return skinPackage({
    ...(options || {}),
    blocks: [
      { id: "mtText", type: "text", width: 300, height: "auto", align: "center",
        props: { text: "씨앗", role: "title" } }
    ]
  });

}


/* =========================================================
   Studio 열기
========================================================== */

async function openStudio(browser, options) {

  const o = options || {};

  const errors = [];

  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 900 }
  });

  await ctx.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blockedURI: e.blockedURI
      });
    });
  });

  const page = await ctx.newPage();

  page.on("pageerror", (err) => errors.push(String(err.stack || err.message || err)));

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    (pkg) => { window.__scenarioLaySkinPackage = pkg; },
    o.package || seedPackage(o)
  );

  const flags =
    o.sandbox
      ? `&sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(SANDBOX_ORIGIN)}`
      : "";

  await page.goto(`${PARENT_ORIGIN}${STUDIO_PATH}${flags}`, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState &&
      window.getStudioAiWorkingState().hasWorkingSkin === true,
    null, { timeout: 25000 }
  );

  page.__ctx = ctx;
  page.__errors = errors;

  return page;

}


async function canvasFrame(page, sandbox, timeout = 15000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {

    const frame = page.frames().find((f) =>
      sandbox
        ? (f.url().startsWith(SANDBOX_ORIGIN) && !f.isDetached())
        : (f.url().indexOf("preview-frame") !== -1 && !f.isDetached()));

    if (frame) {

      /* ★ 흐름 블록은 `data-imory-canvas-block` 이고 자유 장식만
         `data-imory-canvas-element` 다. 이 파일의 fixture 는 블록
         하나로 시작하므로 둘 다 본다. */
      const drawn = await frame
        .evaluate(() =>
          !!document.querySelector("[data-imory-canvas-element],[data-imory-canvas-block]"))
        .catch(() => false);

      if (drawn) return frame;

    }

    await sleep(120);

  }

  throw new Error("캔버스를 그린 프레임을 찾지 못했습니다");

}


async function enableCanvasEditing(page) {

  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);

  if (!on) {

    const visible = await page.evaluate(() => {
      const b = document.getElementById("studioInspectorButton");
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
    });

    if (!visible && await page.locator("#studioTopDockHandle").isVisible().catch(() => false)) {
      await page.click("#studioTopDockHandle");
      await sleep(400);
    }

    await page.click("#studioInspectorButton");

  }

  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);

  await page.waitForFunction(
    () => window.studioCanvasEditingIsOn && window.studioCanvasEditingIsOn() === true,
    null, { timeout: 12000 }
  );

  await sleep(900);

}


/* =========================================================
   화면 창구
========================================================== */

const layersState = (page) =>
  page.evaluate(() => window.getStudioCanvasLayersState());

const addState = (page) =>
  page.evaluate(() => window.getStudioCanvasAddState());

const cardOf = (state, key) =>
  (state.cards || []).find((card) => card.key === key) || null;

const selectionOf = (page) =>
  page.evaluate(() => window.getStudioCanvasSelection());

const readCanvas = (page) => page.evaluate(() => {

  if (typeof currentWorkingSkin === "undefined" || !currentWorkingSkin) {
    return null;
  }

  const entry =
    (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

  return entry ? JSON.parse(JSON.stringify(entry)) : null;

});

const v2Blocks = (canvas) =>
  (canvas && canvas.canvas && canvas.canvas.flow) ? canvas.canvas.flow.blocks : [];

const v2Overlays = (canvas) =>
  (canvas && canvas.canvas && canvas.canvas.overlays) || [];


/* 재료 화면을 연다 — 트리에서 `＋ 재료 추가` 를 누르는 그 길 하나 */
async function openMaterials(page) {

  await page.evaluate(() => window.showStudioLeftPanelMode("layers"));

  await page.waitForSelector("#studioCanvasLayersAddToggle", { state: "visible", timeout: 8000 });

  const open =
    await page.evaluate(() =>
      document.getElementById("studioCanvasLayersAddToggle").getAttribute("aria-expanded") === "true");

  if (!open) {
    await page.click("#studioCanvasLayersAddToggle");
  }

  await page.waitForSelector("#studioCanvasAdd", { state: "visible", timeout: 8000 });

  await sleep(200);

}


async function main() {

  const playwright = await loadPlaywright();

  const servers = [
    await startServer(PARENT_PORT),
    await startServer(SANDBOX_PORT)
  ];

  const browser = await playwright.chromium.launch();

  /* 화면에 보여야 하는 카드 — 순서까지 계약이다(§35-2) */
  const HOME_KEYS = ["logo", "category_nav", "main_visual"];
  const DECOR_KEYS = ["photo", "text", "divider", "shape", "sticker"];

  try {

    /* =====================================================
       [screen]
    ====================================================== */

    if (wants("screen")) {

      section("screen");

      const page = await openStudio(browser, {});

      await canvasFrame(page, false);
      await enableCanvasEditing(page);

      await page.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(300);

      const tree = await layersState(page);

      check("처음에는 Layers 트리 화면이다",
        tree.screen === "tree" && tree.add.open === false && tree.add.visible === false,
        JSON.stringify({ s: tree.screen, a: tree.add }));

      await openMaterials(page);

      const opened = await layersState(page);

      check("★ ＋ 재료 추가를 누르면 같은 패널 안에서 하위 화면이 열린다",
        opened.screen === "add" && opened.add.open === true &&
        opened.add.visible === true && opened.add.back === true &&
        opened.add.title === "요소 추가",
        JSON.stringify({ s: opened.screen, a: opened.add }));

      check("★ 하위 화면에서는 트리가 물러난다(같은 자리에 둘이 겹치지 않는다)",
        await page.evaluate(() => {
          const tree = document.getElementById("studioCanvasLayersTree");
          const toggle = document.getElementById("studioCanvasLayersAddToggle");
          return getComputedStyle(tree).display === "none" && toggle.hidden === true;
        }),
        "");

      /* ---- 분류 둘과 그 순서 ---- */

      const groups = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#studioCanvasAdd .studio-material-group"))
          .map((node) => ({
            id: node.id,
            heading: node.querySelector(".studio-material-group-heading").textContent,
            cards: Array.from(node.querySelectorAll(".studio-material-card"))
              .map((card) => card.dataset.materialKey)
          })));

      check("★ 분류는 홈 구성 · 꾸미기 둘이고 순서도 그대로다",
        groups.length === 2 &&
        groups[0].id === "studioCanvasAddGroup-home" &&
        groups[0].heading === "홈 구성" &&
        groups[1].id === "studioCanvasAddGroup-decor" &&
        groups[1].heading === "꾸미기",
        JSON.stringify(groups.map((g) => g.heading)));

      check("★ '필수 요소'라는 말을 쓰지 않는다",
        await page.evaluate(() =>
          document.getElementById("studioCanvasAdd").textContent.indexOf("필수") === -1),
        "");

      check("★ 홈 구성의 카드 셋",
        groups[0].cards.join(",") === HOME_KEYS.join(","),
        groups[0].cards.join(","));

      check("★ 꾸미기의 카드 다섯",
        groups[1].cards.join(",") === DECOR_KEYS.join(","),
        groups[1].cards.join(","));

      /* ---- 카드 하나의 생김새 ---- */

      const cards = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#studioCanvasAdd .studio-material-card"))
          .map((card) => ({
            key: card.dataset.materialKey,
            tag: card.tagName,
            name: card.querySelector(".studio-material-card-name").textContent,
            desc: (card.querySelector(".studio-material-card-desc") || {}).textContent || "",
            icon: !!card.querySelector("svg.studio-material-card-icon"),
            label: card.getAttribute("aria-label") || "",
            items: card.dataset.materialItems
          })));

      check("★ 카드마다 그림 · 이름 · 짧은 설명이 있다",
        cards.length === 8 &&
        cards.every((card) => card.icon && card.name.length > 0 && card.desc.length > 0),
        JSON.stringify(cards.map((c) => [c.key, c.icon, c.desc.length])));

      check("★ 카드는 단추라 키보드로 옮겨 다니고 이름이 읽힌다",
        cards.every((card) => card.tag === "BUTTON" && card.label.indexOf(card.name) === 0),
        JSON.stringify(cards.map((c) => c.label).slice(0, 3)));

      const named = {};
      cards.forEach((card) => { named[card.key] = card; });

      check("요청한 이름과 설명 그대로다",
        named.logo.name === "로고" &&
        named.logo.desc === "사이트 이름이나 로고 이미지" &&
        named.category_nav.name === "카테고리 메뉴" &&
        named.main_visual.name === "메인 비주얼" &&
        named.photo.name === "사진" &&
        named.text.name === "글자" &&
        named.divider.name === "구분선" &&
        named.shape.name === "도형" &&
        named.sticker.name === "디자인 요소" &&
        named.sticker.desc === "테이프·스티커 같은 장식",
        JSON.stringify(Object.keys(named).map((k) => named[k].name)));

      /* ---- 하위 재료 목록으로 들어갈 구조 (§35-5) ---- */

      check("★ 카드마다 하위 재료 수가 적혀 있다(지금은 전부 하나)",
        cards.every((card) => card.items === "1"),
        JSON.stringify(cards.map((c) => c.items)));

      /* ---- 2열 격자 ---- */

      const grid = await page.evaluate(() => {
        const node = document.querySelector("#studioCanvasAdd .studio-material-grid");
        return {
          columns: getComputedStyle(node).gridTemplateColumns.split(" ").length,
          role: node.getAttribute("role")
        };
      });

      check("★ 2열 카드 격자다", grid.columns === 2 && grid.role === "list",
        JSON.stringify(grid));

      /* ---- 사진 슬롯 칸은 그대로 있다 ---- */

      const add = await addState(page);

      check("사진 슬롯 칸이 남아 있고 선언된 슬롯을 준다",
        Array.isArray(add.slotOptions) &&
        add.slotOptions.indexOf("photo_1") !== -1 &&
        add.slotOptions.indexOf("") !== -1,
        JSON.stringify(add.slotOptions));

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [add] — 한 번 누른 결과 전부
    ====================================================== */

    if (wants("add")) {

      section("add");

      const page = await openStudio(browser, {});

      const previewFrame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await openMaterials(page);

      const before = await readCanvas(page);

      check("시작할 때 자유 장식은 비어 있다",
        v2Overlays(before).length === 0, String(v2Overlays(before).length));

      await page.click("#studioCanvasAddCard-shape");
      await sleep(900);

      const after = await readCanvas(page);
      const made = v2Overlays(after)[v2Overlays(after).length - 1];
      const selection = await selectionOf(page);

      check("★ 지원되는 재료는 카드를 누르면 곧바로 만들어진다",
        v2Overlays(after).length === 1 && made && made.type === "shape",
        JSON.stringify(made && { id: made.id, type: made.type }));

      check("★ 새 요소가 곧바로 선택이다",
        selection.ids.join(",") === made.id && selection.primaryId === made.id,
        JSON.stringify(selection.ids));

      const back = await layersState(page);

      check("★ 만들고 나면 Layers 트리로 돌아간다",
        back.screen === "tree" && back.add.open === false,
        JSON.stringify({ s: back.screen, o: back.add.open }));

      check("★ 그 요소의 Layers 행이 트리에 그려져 있다",
        back.drawn.indexOf(made.id) !== -1 &&
        back.selectedIds.join(",") === made.id,
        JSON.stringify({ d: back.drawn, s: back.selectedIds }));

      check("무엇을 만들었는지 한 줄로 알려 준다",
        back.note.indexOf("도형") !== -1, back.note);

      /* ---- Preview 의 파란 외곽선 ---- */

      /* ★ 테두리를 그리는 주체가 둘이다. 자리를 바꿀 수 있는 요소는
         **프레임 안의 Moveable 틀**이 그리고(HOME-CANVAS-SELECT-1B-1 —
         그때 부모의 축평행 상자는 일부러 내려간다), 그렇지 않으면
         부모의 `#studioCanvasSelectBox` 가 그린다. 이름표는 두 경우
         모두 부모가 그린다. 여기서 재는 것은 "그 요소의 자리를 잡아
         화면에 표시했는가" 하나다. */
      const outline = await page.evaluate(() => {

        const box =
          document.getElementById("studioCanvasSelectBox");

        const label =
          document.getElementById("studioCanvasSelectLabel");

        const selection =
          window.getStudioCanvasSelection();

        return {
          rect: (selection.items[0] || {}).rect || null,
          frameActive: selection.frameActive,
          boxShown: !!(box && !box.hidden),
          labelShown: !!(label && !label.hidden),
          labelText: label ? label.textContent : ""
        };

      });

      check("★ Preview 에 그 요소의 외곽선이 그려진다",
        !!outline.rect && outline.rect.width > 0 && outline.rect.height > 0 &&
        (outline.boxShown || outline.frameActive === true),
        JSON.stringify(outline));

      check("무엇을 골랐는지 이름표가 붙는다",
        outline.labelShown && outline.labelText.indexOf("도형") !== -1,
        JSON.stringify({ s: outline.labelShown, t: outline.labelText }));

      check("★ 그 테두리는 실제로 프레임 안에 그려져 있다",
        await previewFrame.evaluate((id) => {
          const el = document.querySelector(`[data-imory-edit-id="${id}"]`);
          const moveable = document.querySelector(".moveable-control-box");
          return !!el && !!moveable;
        }, made.id),
        made.id);

      /* ---- Undo 한 칸 ---- */

      await page.evaluate(() => window.undoStudioHistory());
      await sleep(800);

      const undone = await readCanvas(page);

      check("★ 추가는 Undo 한 칸이다",
        v2Overlays(undone).length === 0, String(v2Overlays(undone).length));

      await page.evaluate(() => window.redoStudioHistory());
      await sleep(800);

      check("Redo 하면 다시 돌아온다",
        v2Overlays(await readCanvas(page)).length === 1, "");

      /* ---- 사진이 들어가는 재료는 빈 슬롯을 함께 선언한다 ---- */

      const slotsBefore =
        await page.evaluate(() => window.getStudioImageSlotState().slots.length);

      await openMaterials(page);
      await page.selectOption("#studioCanvasAddSlot", "");
      await page.click("#studioCanvasAddCard-photo");
      await sleep(900);

      const slotsAfter =
        await page.evaluate(() => window.getStudioImageSlotState().slots.map((s) => s.name));

      check("★ 사진 카드는 빈 이미지 슬롯을 함께 선언한다",
        slotsAfter.length === slotsBefore + 1,
        JSON.stringify(slotsAfter));

      check("그 사실을 한 줄로 알려 준다",
        (await layersState(page)).note.indexOf("사진 자리") !== -1,
        (await layersState(page)).note);

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [dupe] — 홈 구성은 중복으로 만들지 않는다 (§35-4)
    ====================================================== */

    if (wants("dupe")) {

      section("dupe");

      const page = await openStudio(browser, {});

      await canvasFrame(page, false);
      await enableCanvasEditing(page);

      await openMaterials(page);

      const fresh = await addState(page);

      check("아직 없는 홈 구성 카드는 '추가' 상태다",
        HOME_KEYS.every((key) => cardOf(fresh, key).state === "add") &&
        HOME_KEYS.every((key) => cardOf(fresh, key).target === "flow"),
        JSON.stringify(HOME_KEYS.map((k) => cardOf(fresh, k).state)));

      await page.click("#studioCanvasAddCard-logo");
      await sleep(900);

      const one = await readCanvas(page);
      const logoId = v2Blocks(one).filter((b) => b.type === "logo").map((b) => b.id);

      check("로고를 한 번 만들었다", logoId.length === 1, JSON.stringify(logoId));

      await openMaterials(page);

      const marked = await addState(page);

      check("★ 이미 있으면 카드에 '추가됨'이 표시된다",
        cardOf(marked, "logo").state === "added" &&
        cardOf(marked, "logo").disabled === false,
        JSON.stringify(cardOf(marked, "logo")));

      check("표식이 화면에도 적힌다",
        await page.evaluate(() =>
          document.querySelector("#studioCanvasAddCard-logo .studio-material-card-badge")
            .textContent === "추가됨"),
        "");

      /* ---- 눌러도 새로 만들지 않고 그것을 고른다 ---- */

      await page.evaluate(() => window.clearStudioCanvasSelection());
      await sleep(300);

      await page.click("#studioCanvasAddCard-logo");
      await sleep(900);

      const twice = await readCanvas(page);
      const selection = await selectionOf(page);
      const state = await layersState(page);

      check("★ 눌러도 로고가 둘이 되지 않는다",
        v2Blocks(twice).filter((b) => b.type === "logo").length === 1,
        String(v2Blocks(twice).filter((b) => b.type === "logo").length));

      check("★ 대신 이미 있는 그 요소를 고른다",
        selection.primaryId === logoId[0], String(selection.primaryId));

      check("★ Layers 로 돌아가 그 행을 보여 준다",
        state.screen === "tree" &&
        state.drawn.indexOf(logoId[0]) !== -1 &&
        state.selectedIds.join(",") === logoId[0],
        JSON.stringify({ s: state.screen, sel: state.selectedIds }));

      check("새로 만들지 않았다고 알려 준다",
        state.note.indexOf("새로 만들지 않았습니다") !== -1, state.note);

      await page.__ctx.close();

      /* ---- 처음부터 셋 다 있는 스킨 ---- */

      const full = await openStudio(browser, { package: fullPackage({}) });

      await canvasFrame(full, false);
      await enableCanvasEditing(full);

      await openMaterials(full);

      const already = await addState(full);

      check("★ 처음부터 있는 스킨에서는 홈 구성 셋이 모두 '추가됨'이다",
        HOME_KEYS.every((key) => cardOf(already, key).state === "added"),
        JSON.stringify(HOME_KEYS.map((k) => cardOf(already, k).state)));

      check("꾸미기 카드는 그대로 '추가' 상태다",
        DECOR_KEYS.every((key) => cardOf(already, key).state === "add"),
        JSON.stringify(DECOR_KEYS.map((k) => cardOf(already, k).state)));

      check("페이지 오류 0", full.__errors.length === 0,
        full.__errors.slice(0, 2).join(" | "));

      await full.__ctx.close();

    }


    /* =====================================================
       [soon] — 준비 중 카드는 데이터를 쓰지 않는다

       ★ 지금 여덟 장 모두 계약이 받는 종류라 화면에는 준비 중이
         없다. 그 상태는 **관문이 그 종류를 더는 받지 않을 때**
         나온다 — 그래서 여기서는 계약의 종류 표 하나에서 `sticker`
         를 빼고(배포마다 다를 수 있는 그 표를 패널이 call time 에
         읽는다는 것이 §35-3 이다) 카드가 어떻게 되는지를 본다.
    ====================================================== */

    if (wants("soon")) {

      section("soon");

      const page = await openStudio(browser, {});

      await canvasFrame(page, false);
      await enableCanvasEditing(page);

      await page.evaluate(() => {
        window.SKIN_HOME_CANVAS_ELEMENT_TYPES =
          window.SKIN_HOME_CANVAS_ELEMENT_TYPES.filter((type) => type !== "sticker");
      });

      await openMaterials(page);

      const state = await addState(page);

      check("★ 받는 자리가 없는 카드는 '준비 중'이고 눌리지 않는다",
        cardOf(state, "sticker").state === "soon" &&
        cardOf(state, "sticker").disabled === true &&
        cardOf(state, "sticker").target === "",
        JSON.stringify(cardOf(state, "sticker")));

      check("표식이 화면에도 적힌다",
        await page.evaluate(() =>
          document.querySelector("#studioCanvasAddCard-sticker .studio-material-card-badge")
            .textContent === "준비 중"),
        "");

      check("나머지 카드는 멀쩡하다",
        cardOf(state, "shape").state === "add" &&
        cardOf(state, "photo").state === "add",
        "");

      const before = JSON.stringify(await readCanvas(page));

      /* disabled 를 우회해 눌러도 — 합성 클릭 · 낡은 화면 */
      await page.evaluate(() => {
        document.getElementById("studioCanvasAddCard-sticker").disabled = false;
        document.getElementById("studioCanvasAddCard-sticker").click();
      });

      await sleep(800);

      check("★ 준비 중 카드는 눌러도 데이터를 한 줄도 쓰지 않는다",
        JSON.stringify(await readCanvas(page)) === before, "");

      check("여전히 재료 화면에 머문다",
        (await layersState(page)).screen === "add", "");

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [back] — 갇히지 않는다
    ====================================================== */

    if (wants("back")) {

      section("back");

      const page = await openStudio(browser, {});

      await canvasFrame(page, false);
      await enableCanvasEditing(page);

      await openMaterials(page);

      check("★ 화면을 열면 ← Layers 에 초점이 간다",
        await page.evaluate(() =>
          document.activeElement && document.activeElement.id === "studioCanvasAddBack"),
        await page.evaluate(() => document.activeElement && document.activeElement.id));

      await page.click("#studioCanvasAddBack");
      await sleep(400);

      const byButton = await layersState(page);

      check("★ ← Layers 로 트리에 돌아온다",
        byButton.screen === "tree" && byButton.add.open === false,
        JSON.stringify({ s: byButton.screen }));

      check("돌아오면 ＋ 재료 추가에 초점이 돌아간다",
        await page.evaluate(() =>
          document.activeElement && document.activeElement.id === "studioCanvasLayersAddToggle"),
        await page.evaluate(() => document.activeElement && document.activeElement.id));

      await openMaterials(page);

      await page.keyboard.press("Escape");
      await sleep(400);

      const byEscape = await layersState(page);

      check("★ Escape 도 같은 곳으로 간다",
        byEscape.screen === "tree" && byEscape.add.open === false,
        JSON.stringify({ s: byEscape.screen }));

      check("★ 되돌아온 트리에서 다시 열 수 있다(한 번 쓰고 죽지 않는다)",
        await (async () => {
          await openMaterials(page);
          return (await layersState(page)).screen === "add";
        })(),
        "");

      /* 카드에서 Escape 를 눌러도 같다 */
      await page.focus("#studioCanvasAddCard-shape");
      await page.keyboard.press("Escape");
      await sleep(400);

      check("카드에 초점이 있을 때 Escape 도 같다",
        (await layersState(page)).screen === "tree", "");

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [mobile] — 390px
    ====================================================== */

    if (wants("mobile")) {

      section("mobile");

      const page = await openStudio(browser, {
        viewport: { width: 390, height: 780 }
      });

      await canvasFrame(page, false);
      await enableCanvasEditing(page);

      await openMaterials(page);

      /* 시트를 충분히 올려 카드가 보이게 한다 */
      await page.evaluate(() => {
        if (typeof window.setStudioSheetState === "function") {
          window.setStudioSheetState("full", { reveal: true });
        }
      });

      await sleep(500);

      const box = await page.evaluate(() => {

        const screen =
          document.getElementById("studioCanvasAdd");

        const section =
          screen.closest(".studio-left-panel-section");

        const cards =
          Array.from(screen.querySelectorAll(".studio-material-card"));

        return {
          overflowX: section.scrollWidth - section.clientWidth,
          columns:
            getComputedStyle(screen.querySelector(".studio-material-grid"))
              .gridTemplateColumns.split(" ").length,
          clipped: cards.filter((card) => {
            const r = card.getBoundingClientRect();
            const s = section.getBoundingClientRect();
            return r.right > s.right + 1 || r.left < s.left - 1;
          }).length,
          cut: cards.filter((card) => card.scrollWidth > card.clientWidth + 1).length,
          drawn: cards.length
        };

      });

      check("★ 390px 에서 가로 스크롤이 없다", box.overflowX <= 0, String(box.overflowX));

      check("★ 390px 에서도 2열이다", box.columns === 2, String(box.columns));

      check("★ 카드가 패널 밖으로 나가지 않는다",
        box.drawn === 8 && box.clipped === 0, JSON.stringify(box));

      check("★ 카드 안의 글자가 잘리지 않는다", box.cut === 0, String(box.cut));

      /* 같은 하위 화면이다 — 모바일 전용 화면을 따로 만들지 않았다 */
      check("모바일도 같은 하위 화면을 쓴다",
        (await layersState(page)).screen === "add" &&
        await page.locator("#studioCanvasAddBack").count() === 1,
        "");

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [sandbox] — 별도 origin 에서 같은 결과
    ====================================================== */

    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, {
        sandbox: true,
        package: seedPackage({ sandbox: true })
      });

      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);

      await openMaterials(page);

      const state = await addState(page);

      check("★ sandbox 에서도 같은 카드 여덟이다",
        state.cards.length === 8 &&
        state.cards.every((card) => card.drawn === true),
        JSON.stringify(state.cards.map((c) => c.key)));

      await page.click("#studioCanvasAddCard-shape");
      await sleep(1200);

      const made = v2Overlays(await readCanvas(page))[0];
      const layers = await layersState(page);

      check("★ sandbox 에서도 만들고 · 고르고 · 트리로 돌아온다",
        !!made && made.type === "shape" &&
        layers.screen === "tree" &&
        layers.selectedIds.join(",") === made.id &&
        layers.drawn.indexOf(made.id) !== -1,
        JSON.stringify({ made: made && made.id, s: layers.screen }));

      check("★ 프레임이 그 요소를 실제로 그렸다",
        await frame.evaluate(
          (id) => !!document.querySelector(`[data-imory-edit-id="${id}"]`), made.id),
        made.id);

      const violations = await frame.evaluate(() => window.__cspViolations || []);

      check("★ 프레임 CSP 위반 0",
        violations.length === 0, JSON.stringify(violations.slice(0, 3)));

      const parentViolations =
        await page.evaluate(() => window.__cspViolations || []);

      check("부모 문서 CSP 위반 0",
        parentViolations.length === 0,
        JSON.stringify(parentViolations.slice(0, 3)));

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }

  } finally {

    await browser.close();

    servers.forEach((s) => s.close());

  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    failures.forEach((line) => console.log(`  - ${line}`));
    process.exit(1);
  }

}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});
