/* =========================================================
   HOME CANVAS — 선택 소유권과 단일 선택 기반 E2E
   (HOME-CANVAS-SELECT-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md
   조사:      HOME-CANVAS-SELECT-AUDIT-1

   ★ 이 라운드는 **고르고 푸는 것**까지다. Selecto · Moveable ·
     다중 선택 · 이동 · 크기 · 회전 · Canvas JSON 수정 · Inspector
     입력 필드는 없다. 그래서 이 파일은 좌표를 **바꾸지** 않고,
     "무엇이 골라졌는가 · 누가 주인인가 · 테두리가 맞는 자리에
     있는가"만 잰다.

   화면은 실제 Studio 가 그린다 —
     native  studio/studio-lifecycle-scenario.html?scenario=lay
             의 Preview iframe(studio/preview/preview-frame.html)
     sandbox 같은 문서 + renderMode:"sandbox" → 별도 origin 프레임
             (skin/sandbox/frame.html)

   [select]    여섯 종류 · 내부 자식 · 배경 없는 요소 · 전면 요소 ·
               회전 요소를 한 번 눌러 고른다 · 상태는 배열 모양 ·
               입력 데이터 non-mutation
   [owner]     캔버스 ↔ 일반 Inspector 소유권 전환 · 빈 곳 · 유령
               테두리 없음 · overlay 중복 없음
   [guard]     locked · 그 밑의 요소 · hidden · stale/위조 거부
   [pick]      겹친 요소 후보 메뉴에서 캔버스 고르기
   [link]      Select 모드에서 카테고리 링크는 탐색하지 않는다 ·
               Select 밖에서는 탐색한다
   [reconcile] 삭제 · enabled:false · 페이지 이동 뒤 선택이 풀린다
   [sandbox]   native 와 같은 primary id · 위조 거부
   [scale]     Preview 부모에 scale 이 걸린 조건에서의 overlay 오차
   [vendor]    Moveable · Selecto UMD 요청 0

   Chromium 만 쓴다(§11).

   실행:
     node studio/studio-home-canvas-select-e2e-test.mjs
     node studio/studio-home-canvas-select-e2e-test.mjs --only=guard
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8988;
const SANDBOX_PORT = 8989;

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
   playwright · 정적 서버
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


const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2"
};

/* 실행 중에 만들어 내보내는 단색 SVG — 저장소에 이미지 파일을
   새로 넣지 않는다(로드맵 §9) */
const FIXTURE_IMAGE_PATH = "/__canvas-select-fixture__/swatch.svg";
const FIXTURE_IMAGE_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
  '<rect width="80" height="80" fill="#c9803f"/></svg>';


/*
  sandbox origin 은 **allowlist 에 적힌 것만** 내보낸다. 운영과 같은
  목록을 그대로 읽어 쓴다(core/lib/skin-sandbox-server.js) — 이
  라운드가 그 목록을 늘리지 않았다는 것도 이 서버가 함께 증명한다.
*/
function makeHandler(sandbox) {

  const sandboxMod =
    sandbox
      ? createRequire(path.join(ROOT, "package.json"))("./core/lib/skin-sandbox-server.js")
      : null;

  return (req, res) => {

    const url = new URL(req.url, "http://localhost");

    let rel = decodeURIComponent(url.pathname);

    if (sandboxMod) {

      if (rel === "/skin/sandbox/frame" || rel === "/skin/sandbox/frame.html") {
        rel = "/skin/sandbox/frame.html";
      }
      else if (!sandboxMod.SANDBOX_ALLOWED_PATHS.includes(rel)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("blocked");
        return;
      }

    }

    if (rel === FIXTURE_IMAGE_PATH) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      res.end(FIXTURE_IMAGE_BODY);
      return;
    }

    if (rel.endsWith("/")) rel += "index.html";

    const abs = path.join(ROOT, rel);

    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      });
      fs.createReadStream(abs).pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");

  };

}

function startServer(port, sandbox) {
  const server = http.createServer(makeHandler(sandbox));
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}


/* =========================================================
   fixture — 여섯 종류 + 이 라운드가 재는 자리들

   ★ 자리를 일부러 이렇게 둔다.
     cvBg        도화지 전체를 덮는 배경 사진(전면 요소 · 겹침 규칙)
     cvShapeBare 스킨이 배경도 테두리도 주지 않은 도형
     cvUnder     잠긴 요소 **밑에** 깔린 요소
     cvLockedTop cvUnder 보다 넓은 잠긴 요소(오른쪽에 잠김만 있는 띠)
     cvOverA/B   서로를 완전히 덮지 않고 **걸친** 두 요소(후보 메뉴)
     cvHidden    숨긴 요소
========================================================== */

/* .hc-foot 은 **캔버스 밖의 평범한 스킨 요소**다. 소유권이 오가는
   것을 보려면 캔버스와 같은 화면에 있으면서 캔버스 요소가 아닌
   것이 하나 필요하다. 도화지 위(.hc-title)가 아니라 아래에 두는
   이유는 실용적이다 — Top Dock 이 Preview 위쪽을 덮어서, 문서
   맨 위에 있는 요소는 화면 가운데로 끌어올 수가 없다. */
const HOME_HTML =
  '<div class="hc-home">' +
  '<h1 class="hc-title" data-imory-bind="site.title"></h1>' +
  '<div class="hc-canvas" data-imory-canvas-root></div>' +
  /* 빈 곳 — 글자도 자식도 없는 상자라 고를 수 있는 것이 아무 것도
     없다(isInspectableElement 가 거짓 → 위로 올라가면 페이지 래퍼).
     "빈 곳을 누르면 둘 다 풀린다"를 재려면 이런 자리가 필요하다. */
  '<div class="hc-gap"></div>' +
  '<p class="hc-foot">평범한 스킨 요소</p>' +
  "</div>";

const CANVAS_ELEMENTS = [
  { id: "cvBg", type: "photo", x: 0, y: 0, width: 390, height: 844,
    rotation: 0, hidden: false, locked: false, props: { slot: "photo_1" } },

  { id: "cvShape", type: "shape", x: 20, y: 40, width: 150, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvShapeBare", type: "shape", x: 210, y: 40, width: 120, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvPhoto", type: "photo", x: 20, y: 120, width: 120, height: 120,
    rotation: 0, hidden: false, locked: false, props: { slot: "photo_1" } },

  { id: "cvLogo", type: "logo", x: 210, y: 120, width: 100, height: 60,
    rotation: 0, hidden: false, locked: false,
    props: { slot: "photo_1", fallback: "site_title" } },

  { id: "cvText", type: "text", x: 20, y: 262, width: 170, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "고른 글자", role: "body" } },

  { id: "cvSticker", type: "sticker", x: 260, y: 250, width: 70, height: 70,
    rotation: 20, hidden: false, locked: false, props: { slot: "sticker_1" } },

  { id: "cvTextRot", type: "text", x: 30, y: 340, width: 150, height: 34,
    rotation: 20, hidden: false, locked: false,
    props: { text: "회전 글자", role: "body" } },

  { id: "cvNav", type: "category_nav", x: 20, y: 430, width: 170, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { mode: "all", categoryIds: [] } },

  { id: "cvUnder", type: "shape", x: 40, y: 500, width: 150, height: 90,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvLockedTop", type: "photo", x: 40, y: 500, width: 250, height: 90,
    rotation: 0, hidden: false, locked: true, props: { slot: "photo_1" } },

  { id: "cvOverA", type: "shape", x: 30, y: 640, width: 170, height: 110,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvOverB", type: "text", x: 150, y: 680, width: 160, height: 40,
    rotation: 0, hidden: false, locked: false,
    props: { text: "걸친 글자", role: "body" } },

  { id: "cvHidden", type: "text", x: 20, y: 790, width: 170, height: 34,
    rotation: 0, hidden: true, locked: false,
    props: { text: "숨김", role: "body" } }
];

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진", required: false },
  { name: "sticker_1", label: "스티커", required: false }
];

/* 스킨 CSS — 글꼴만 못박고, 배경은 **일부러 두 요소에만** 준다.
   배경이 없어도 고를 수 있다는 것이 이 라운드의 핵심이라(§2) 나머지
   요소는 투명하게 둔다. */
const CANVAS_CSS =
  ".hc-home { padding: 0; margin: 0; }" +
  ".hc-canvas { width: 100%; }" +
  ".hc-gap { height: 200px; }" +
  '[data-imory-canvas-type="text"], [data-imory-canvas-type="category_nav"]' +
  " { font: 14px/1.5 Arial, sans-serif; }" +
  '[data-imory-edit-id="cvShape"] { background: #d2b48c; }' +
  '[data-imory-edit-id="cvOverA"] { background: #9aa7c8; }';

function skinPackage(options) {

  const o = options || {};

  const pkg = {
    schemaVersion: 1,
    templates: {
      home: { html: HOME_HTML },
      category: { html: '<div class="hc-category"><p class="hc-cat-mark">CATEGORY</p></div>' },
      post: { html: '<div class="hc-post"><div data-imory-region="post-body"></div></div>' },
      banner: { html: '<div class="hc-banner"></div>' }
    },
    css: CANVAS_CSS,
    imageSlots: IMAGE_SLOTS,
    regions: [
      {
        name: "home_canvas",
        enabled: o.enabled === false ? false : true,
        canvas: {
          version: 1,
          baseWidth: 390,
          baseHeight: 844,
          elements: o.elements || CANVAS_ELEMENTS
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


/* =========================================================
   Studio 열기
========================================================== */

async function openStudio(browser, options) {

  const o = options || {};

  const vendorHits = [];
  const errors = [];

  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 900 }
  });

  const page = await ctx.newPage();

  page.on("pageerror", (err) => errors.push(String(err.message || err)));

  page.on("request", (req) => {
    if (req.url().indexOf("/studio/vendor/home-canvas/") !== -1) {
      vendorHits.push(req.url());
    }
  });

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    ([pkg, slots]) => {
      window.__scenarioLaySkinPackage = pkg;
      window.__scenarioLaySkinImageSlotValues = slots;
    },
    [
      skinPackage(o),
      [
        { skin_id: "skin-lay1", slot_name: "photo_1", image_url: FIXTURE_IMAGE_PATH },
        { skin_id: "skin-lay1", slot_name: "sticker_1", image_url: FIXTURE_IMAGE_PATH }
      ]
    ]
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

  /* [scale] — 운영 CSS 를 고치지 않는다. 이 조건은 테스트가 만든다. */
  if (o.scale) {
    await page.addStyleTag({
      content:
        `#studioPreviewFrame { transform: scale(${o.scale}); transform-origin: top left; }`
    });
    await sleep(200);
  }

  page.__ctx = ctx;
  page.__errors = errors;
  page.__vendorHits = vendorHits;

  return page;

}


async function canvasFrame(page, sandbox, timeout = 15000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {

    const frame = page.frames().find((f) =>
      sandbox
        ? (f.url().startsWith(SANDBOX_ORIGIN) && !f.isDetached())
        : (f.url().indexOf("preview-frame.html") !== -1 && !f.isDetached()));

    if (frame) {
      const drawn = await frame
        .evaluate(() => !!document.querySelector("[data-imory-canvas-element]"))
        .catch(() => false);
      if (drawn) return frame;
    }

    await sleep(120);

  }

  throw new Error("캔버스를 그린 프레임을 찾지 못했습니다");

}


async function enableSelect(page) {

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

  await sleep(400);

}


async function disableSelect(page) {

  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);

  if (on) {
    await page.click("#studioInspectorButton");
    await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);
  }

  await sleep(300);

}


/* =========================================================
   누르기

   native 는 프레임 안 요소의 한 점을 **Studio 문서 좌표**로 바꿔
   실제 포인터로 누른다(studio-direct-ux-e2e-test.mjs 와 같은 방식 —
   Mobile 축소 · 테두리 · [scale] 조건까지 그대로 반영된다).
========================================================== */

async function pointIn(page, selector, fx, fy) {

  return page.evaluate(([sel, fx, fy]) => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const el = doc.querySelector(sel);

    if (!el) return null;

    el.scrollIntoView({ block: "center", inline: "nearest" });

    /* Top Dock 이 프레임 위쪽을 덮는다 — 누를 자리를 조금 아래로 */
    const before = el.getBoundingClientRect();
    doc.defaultView.scrollBy(
      0, before.top + before.height / 2 - doc.defaultView.innerHeight * 0.55
    );

    const r = el.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;

    return {
      x: box.left + (bl + r.left + r.width * fx) * scale,
      y: box.top + (bt + r.top + r.height * fy) * scale,
      scale,
      origin: { x: box.left + bl * scale, y: box.top + bt * scale },
      elRect: { x: r.x, y: r.y, w: r.width, h: r.height }
    };

  }, [selector, fx === undefined ? 0.5 : fx, fy === undefined ? 0.5 : fy]);

}


async function clickIn(page, selector, fx, fy) {

  const p = await pointIn(page, selector, fx, fy);

  if (!p) throw new Error("프레임 안에서 못 찾음: " + selector);

  await page.mouse.click(p.x, p.y);
  await sleep(260);

  return p;

}


const byId = (id) => `[data-imory-edit-id="${id}"]`;


/* sandbox 프레임은 cross-origin 이라 부모 문서에서 좌표를 계산할 수
   없다 — Playwright 가 중첩 프레임의 좌표를 풀어 준다. */
async function clickInSandbox(page, frame, selector, fx, fy) {

  const loc = frame.locator(selector).first();

  await loc.scrollIntoViewIfNeeded({ timeout: 6000 });

  const box = await loc.boundingBox();

  if (!box) throw new Error("sandbox 프레임 안에서 못 찾음: " + selector);

  /* locator.click() 을 쓰지 않는다 — 그쪽은 "누를 자리를 다른 것이
     가리고 있으면" 거부한다. 잠긴 요소가 **일부러** 위를 덮고 있는
     자리를 눌러야 하므로(§2), native 쪽과 같이 실제 포인터로 그
     좌표를 누른다. */
  const x = box.x + box.width * (fx === undefined ? 0.5 : fx);
  const y = box.y + box.height * (fy === undefined ? 0.5 : fy);

  /* 도화지를 덮는 요소는 사각형이 화면보다 크다 — 그 중심은 화면
     밖이라 눌러도 엉뚱한 곳이 눌린다. 조용히 틀리지 않게 막는다. */
  const vp = page.viewportSize();

  if (x < 0 || y < 0 || x > vp.width || y > vp.height) {
    throw new Error(
      `누를 자리가 화면 밖입니다(${selector}): ${Math.round(x)},${Math.round(y)}`
    );
  }

  await page.mouse.click(x, y);

  await sleep(320);

}


/* =========================================================
   읽기
========================================================== */

const readState = (page) => page.evaluate(() => {

  const canvas = window.getStudioCanvasSelection();
  const inspector = window.getStudioInspectorSelection();
  const raw = window.getStudioInspectorState();

  const boxOf = (id) => {
    const el = document.getElementById(id);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };

  return {
    canvas: {
      ids: canvas.ids,
      primaryId: canvas.primaryId,
      count: canvas.items.length,
      label: canvas.items[0] ? canvas.items[0].label : "",
      type: canvas.items[0] ? canvas.items[0].type : ""
    },
    inspectorApi: inspector ? inspector.editId : null,
    inspectorRaw: raw.selection ? raw.selection.editId : null,
    canvasBox: boxOf("studioCanvasSelectBox"),
    inspectorBox: boxOf("studioInspectorSelectBox"),
    canvasLabelText: (() => {
      const el = document.getElementById("studioCanvasSelectLabel");
      return el && !el.hidden ? el.textContent : "";
    })(),
    canvasBoxCount: document.querySelectorAll("#studioCanvasSelectBox").length,
    pickMenuOpen: (() => {
      const el = document.getElementById("studioInspectorPickMenu");
      return !!(el && !el.hidden);
    })(),
    pickNames: Array.from(
      document.querySelectorAll("#studioInspectorPickMenu .studio-inspector-pick-name")
    ).map((el) => el.textContent)
  };

});


const readRegions = (page) => page.evaluate(() =>
  (typeof currentWorkingSkin !== "undefined" && currentWorkingSkin)
    ? JSON.stringify(currentWorkingSkin.regions)
    : null
);


/* =========================================================
   실행
========================================================== */

async function main() {

  const pw = await loadPlaywright();

  const servers = [
    await startServer(PARENT_PORT, false),
    await startServer(SANDBOX_PORT, true)
  ];

  const browser = await pw.chromium.launch();

  try {

    /* ======================================================
       [select]
    ====================================================== */
    if (wants("select")) {

      section("select");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      const drawn = await frame.evaluate(() =>
        document.querySelectorAll("[data-imory-canvas-element]").length);

      check("캔버스가 Studio Preview 에 그려졌다",
        drawn === CANVAS_ELEMENTS.length, `${drawn}개`);

      const before = await readRegions(page);

      await enableSelect(page);

      /* 1 · 5 · 6 · 7 · 8 — wrapper 를 직접 누른다 */
      const direct = [
        ["cvShape", "도형(스킨이 배경을 준 것)"],
        ["cvShapeBare", "배경 · 테두리가 없는 도형"],
        ["cvBg", "도화지 전체를 덮는 사진"],
        ["cvTextRot", "회전한 글자"]
      ];

      for (const [id, label] of direct) {
        await clickIn(page, byId(id));
        const s = await readState(page);
        check(`한 번 눌러 고른다 — ${label}`,
          s.canvas.primaryId === id && s.canvas.count === 1,
          `primary=${s.canvas.primaryId} n=${s.canvas.count}`);
      }

      /* 2 · 3 · 4 — 내부 자식을 눌러도 wrapper 하나로 올라간다 */
      const inner = [
        [`${byId("cvPhoto")} img`, "cvPhoto", "사진 안쪽 <img>"],
        [`${byId("cvLogo")} img`, "cvLogo", "로고 안쪽 <img>"],
        [`${byId("cvSticker")} img`, "cvSticker", "스티커 안쪽 <img>"],
        [`${byId("cvText")} p`, "cvText", "글자 안쪽 <p>"],
        [`${byId("cvNav")} a`, "cvNav", "카테고리 안쪽 <a>"]
      ];

      for (const [selector, id, label] of inner) {
        await clickIn(page, selector);
        const s = await readState(page);
        check(`내부 자식을 눌러도 요소 하나가 고른다 — ${label}`,
          s.canvas.primaryId === id && s.canvas.count === 1,
          `primary=${s.canvas.primaryId}`);
      }

      /* 23 — 배열 모양이지만 지금은 최대 1개 */
      const shape = await page.evaluate(() => {
        const sel = window.getStudioCanvasSelection();
        return {
          idsIsArray: Array.isArray(sel.ids),
          itemsIsArray: Array.isArray(sel.items),
          n: sel.ids.length,
          primaryMatches: sel.primaryId === sel.ids[0],
          hasType: typeof sel.items[0].type === "string",
          hasRect: !!sel.items[0].rect,
          hasLocked: typeof sel.items[0].locked === "boolean"
        };
      });

      check("상태는 배열 모양이고(ids · items) 지금은 정확히 1개다",
        shape.idsIsArray && shape.itemsIsArray && shape.n === 1 &&
        shape.primaryMatches && shape.hasType && shape.hasRect && shape.hasLocked,
        JSON.stringify(shape));

      /* 이름표 */
      const labelState = await readState(page);
      check("고른 요소의 종류가 이름표에 보인다",
        labelState.canvasLabelText === "Canvas 카테고리",
        `"${labelState.canvasLabelText}"`);

      /* 24 — 입력 데이터 non-mutation */
      const after = await readRegions(page);
      check("★ 고르기만으로 draft 의 regions 가 한 글자도 바뀌지 않는다",
        before !== null && before === after,
        before === after ? "" : "regions 가 바뀌었다");

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [owner]
    ====================================================== */
    if (wants("owner")) {

      section("owner");

      const page = await openStudio(browser, {});
      await canvasFrame(page, false);
      await enableSelect(page);

      /* 10 — 캔버스 선택이 기존 Inspector 선택을 푼다 */
      await clickIn(page, ".hc-foot");
      const afterTitle = await readState(page);

      check("일반 요소(.hc-foot)가 기존 Inspector 로 고른다",
        afterTitle.inspectorApi !== null && afterTitle.canvas.primaryId === null,
        `inspector=${afterTitle.inspectorApi} canvas=${afterTitle.canvas.primaryId}`);

      await clickIn(page, byId("cvPhoto"));
      const afterCanvas = await readState(page);

      check("★ 캔버스를 고르면 기존 Inspector 선택이 풀린다",
        afterCanvas.canvas.primaryId === "cvPhoto" &&
        afterCanvas.inspectorApi === null && afterCanvas.inspectorRaw === null,
        `canvas=${afterCanvas.canvas.primaryId} inspectorRaw=${afterCanvas.inspectorRaw}`);

      /* 21 — 유령 테두리 없음 */
      check("★ 유령 Inspector 테두리가 남지 않는다(캔버스 선택 중 #studioInspectorSelectBox 는 숨어 있다)",
        afterCanvas.inspectorBox === null && afterCanvas.canvasBox !== null,
        `inspectorBox=${JSON.stringify(afterCanvas.inspectorBox)}`);

      /* 11 — 일반 요소를 고르면 캔버스 선택이 풀린다 */
      await clickIn(page, ".hc-foot");
      const backToTitle = await readState(page);

      check("★ 일반 요소를 고르면 캔버스 선택이 풀린다",
        backToTitle.canvas.primaryId === null && backToTitle.canvas.count === 0 &&
        backToTitle.inspectorApi !== null,
        `canvas=${backToTitle.canvas.primaryId} inspector=${backToTitle.inspectorApi}`);

      check("두 테두리가 동시에 보이지 않는다",
        backToTitle.canvasBox === null,
        JSON.stringify(backToTitle.canvasBox));

      /* 12 — 빈 곳 클릭 시 둘 다 해제 */
      await clickIn(page, byId("cvPhoto"));
      await page.mouse.click(160, 500);
      await sleep(300);
      const afterOutside = await readState(page);

      check("★ Preview 바깥(왼쪽 패널)을 눌러도 상태가 깨지지 않는다",
        afterOutside.canvas.count <= 1, "");

      /* 12 — 진짜 빈 곳(고를 것이 아무 것도 없는 자리) */
      await clickIn(page, byId("cvPhoto"));
      const beforeEmpty = await readState(page);

      await clickIn(page, ".hc-gap");
      const afterEmpty = await readState(page);

      check("★ 빈 곳을 누르면 캔버스 선택과 Inspector 선택이 함께 풀린다",
        beforeEmpty.canvas.primaryId === "cvPhoto" &&
        afterEmpty.canvas.primaryId === null &&
        afterEmpty.inspectorApi === null &&
        afterEmpty.inspectorRaw === null &&
        afterEmpty.canvasBox === null && afterEmpty.inspectorBox === null,
        `canvas=${afterEmpty.canvas.primaryId} inspector=${afterEmpty.inspectorRaw}`);

      /* 진짜 빈 곳 — 캔버스 바깥의 HOME 여백 */
      await clickIn(page, byId("cvPhoto"));
      await page.keyboard.press("Escape");
      await sleep(250);
      const afterEscape = await readState(page);

      check("★ Escape 로 캔버스 선택이 풀린다(둘 다 비어 있다)",
        afterEscape.canvas.primaryId === null &&
        afterEscape.inspectorApi === null &&
        afterEscape.canvasBox === null,
        `canvas=${afterEscape.canvas.primaryId} box=${JSON.stringify(afterEscape.canvasBox)}`);

      /* 22 — 재선택 · 해제를 반복해도 overlay 가 늘지 않는다 */
      for (let i = 0; i < 3; i += 1) {
        await clickIn(page, byId("cvShape"));
        await clickIn(page, byId("cvPhoto"));
        await page.keyboard.press("Escape");
        await sleep(120);
      }

      const repeated = await readState(page);

      check("★ 재선택 · 해제를 반복해도 overlay 요소가 하나뿐이다",
        repeated.canvasBoxCount === 1 && repeated.canvasBox === null,
        `n=${repeated.canvasBoxCount}`);

      /* Select mode 를 끄면 캔버스 선택도 사라진다 */
      await clickIn(page, byId("cvShape"));
      await disableSelect(page);
      const afterOff = await readState(page);

      check("Select mode 를 끄면 캔버스 선택도 함께 풀린다",
        afterOff.canvas.primaryId === null && afterOff.canvasBox === null,
        `canvas=${afterOff.canvas.primaryId}`);

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [guard] — locked · hidden · stale
    ====================================================== */
    if (wants("guard")) {

      section("guard");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);
      await enableSelect(page);

      /* 14 — 잠긴 요소만 있는 띠(오른쪽 끝)를 누른다 */
      await clickIn(page, byId("cvLockedTop"), 0.92, 0.5);
      const lockedClick = await readState(page);

      check("★ 잠긴 요소는 화면 클릭으로 고를 수 없다",
        lockedClick.canvas.primaryId !== "cvLockedTop",
        `primary=${lockedClick.canvas.primaryId}`);

      check("잠긴 자리를 누르면 그 밑의 바탕(cvBg)이 잡힌다",
        lockedClick.canvas.primaryId === "cvBg",
        `primary=${lockedClick.canvas.primaryId}`);

      /* 15 — 잠긴 요소 아래에 깔린 요소는 고를 수 있다 */
      await clickIn(page, byId("cvUnder"), 0.3, 0.5);
      const underClick = await readState(page);

      check("★ 잠긴 요소 밑에 깔린 요소는 고를 수 있다",
        underClick.canvas.primaryId === "cvUnder",
        `primary=${underClick.canvas.primaryId}`);

      /* 16 — hidden 은 상자가 없어 잡히지 않는다 */
      const hiddenBox = await frame.evaluate(() => {
        const el = document.querySelector('[data-imory-edit-id="cvHidden"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, hidden: el.hidden === true };
      });

      check("★ 숨긴 요소는 상자가 없어 클릭 대상이 되지 않는다",
        !!hiddenBox && hiddenBox.hidden === true &&
        hiddenBox.w === 0 && hiddenBox.h === 0,
        JSON.stringify(hiddenBox));

      /* 18 — 위조 · stale 식별자 거부 (부모 확정 함수를 직접 부른다) */
      const forged = await page.evaluate(() => {
        const rect = { left: 10, top: 10, width: 40, height: 40 };
        const out = {};
        [
          ["존재하지 않는 id", "cvNoSuchThing"],
          ["잠긴 요소", "cvLockedTop"],
          ["숨긴 요소", "cvHidden"]
        ].forEach(([label, id]) => {
          window.clearStudioCanvasSelection();
          window.setStudioCanvasSelection(id, rect, rect);
          out[label] = window.getStudioCanvasSelection().primaryId;
        });
        return out;
      });

      check("★ 없는 id · 잠긴 요소 · 숨긴 요소는 선택이 만들어지지 않는다",
        Object.values(forged).every((v) => v === null),
        JSON.stringify(forged));

      /* 근거 판정 자체 */
      const evidence = await page.evaluate(() => ({
        real: !!window.studioCanvasSelectableElement("cvPhoto"),
        locked: !!window.studioCanvasSelectableElement("cvLockedTop"),
        hidden: !!window.studioCanvasSelectableElement("cvHidden"),
        junk: !!window.studioCanvasSelectableElement("../etc/passwd"),
        empty: !!window.studioCanvasSelectableElement("")
      }));

      check("draft 존재 검증 — 실제 요소만 참이다",
        evidence.real === true && evidence.locked === false &&
        evidence.hidden === false && evidence.junk === false && evidence.empty === false,
        JSON.stringify(evidence));

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [pick] — 겹친 요소 후보
    ====================================================== */
    if (wants("pick")) {

      section("pick");

      const page = await openStudio(browser, {});
      await canvasFrame(page, false);
      await enableSelect(page);

      /* 바탕(cvBg)은 다른 요소를 **완전히** 덮으므로 묻지 않는다 */
      await clickIn(page, byId("cvPhoto"));
      const overBg = await readState(page);

      check("바탕 요소가 깔려 있어도 한 번에 고른다(묻지 않는다)",
        overBg.canvas.primaryId === "cvPhoto" && overBg.pickMenuOpen === false,
        `primary=${overBg.canvas.primaryId} menu=${overBg.pickMenuOpen}`);

      /* cvOverA 와 cvOverB 는 서로 **걸쳐** 있다 — 묻는다 */
      await page.keyboard.press("Escape");
      await sleep(150);

      await clickIn(page, byId("cvOverB"), 0.15, 0.5);
      const menu = await readState(page);

      check("★ 걸친 두 캔버스 요소는 후보 메뉴로 묻는다",
        menu.pickMenuOpen === true && menu.pickNames.length >= 2,
        `menu=${menu.pickMenuOpen} names=${JSON.stringify(menu.pickNames)}`);

      check("후보 칸에 캔버스 요소의 종류가 보인다",
        menu.pickNames.some((n) => n.indexOf("Canvas") !== -1),
        JSON.stringify(menu.pickNames));

      /* 후보를 고르면 **캔버스 선택**으로 확정된다 */
      const targetIndex = await page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll("#studioInspectorPickMenu .studio-inspector-pick-item")
        );
        const hit = items.find((el) =>
          (el.textContent || "").indexOf("Canvas 도형") !== -1);
        return hit ? items.indexOf(hit) : -1;
      });

      if (targetIndex >= 0) {
        await page.locator("#studioInspectorPickMenu .studio-inspector-pick-item")
          .nth(targetIndex).click();
        await sleep(350);
      }

      const chosen = await readState(page);

      check("★ 후보에서 고른 캔버스 요소가 캔버스 선택으로 확정된다",
        chosen.canvas.primaryId === "cvOverA" && chosen.inspectorApi === null,
        `canvas=${chosen.canvas.primaryId} inspector=${chosen.inspectorApi}`);

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [link] — 카테고리 링크
    ====================================================== */
    if (wants("link")) {

      section("link");

      const page = await openStudio(browser, {});
      await canvasFrame(page, false);

      /* 19 — Select 모드에서는 탐색하지 않고 요소를 고른다.
         (먼저 이쪽을 본다 — 탐색해 버리면 HOME 으로 되돌아올
          길이 Studio 에 없다. 페이지 선택기가 없는 설계다.) */
      await enableSelect(page);

      const urlBefore = page.url();

      await clickIn(page, `${byId("cvNav")} a`);

      const selectModeClick = await readState(page);

      const stillHome = await page.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        return !!(doc && doc.querySelector("[data-imory-canvas-element]"));
      });

      check("★ Select 모드에서 카테고리 링크는 탐색하지 않고 그 요소를 고른다",
        stillHome === true &&
        selectModeClick.canvas.primaryId === "cvNav" &&
        page.url() === urlBefore,
        `home=${stillHome} primary=${selectModeClick.canvas.primaryId}`);

      /* 20 — Select 를 끄면 기존 내부 탐색이 그대로 동작한다 */
      await disableSelect(page);

      await clickIn(page, `${byId("cvNav")} a`);
      await sleep(900);

      const navigated = await page.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        return !!(doc && doc.querySelector(".hc-cat-mark"));
      });

      check("★ Select 모드가 아닐 때 카테고리 링크는 기존 내부 탐색을 한다",
        navigated === true, navigated ? "" : "CATEGORY 화면으로 가지 않았다");

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [reconcile]
    ====================================================== */
    if (wants("reconcile")) {

      section("reconcile");

      const page = await openStudio(browser, {});
      await canvasFrame(page, false);
      await enableSelect(page);

      /* 요소를 지운다 — Import 와 같은 확정 경로(draft 교체)를 쓴다 */
      await clickIn(page, byId("cvPhoto"));

      const selected = await readState(page);

      check("먼저 고른다", selected.canvas.primaryId === "cvPhoto",
        String(selected.canvas.primaryId));

      const removed = await page.evaluate(() => {
        /* 지금 draft 에서 그 요소 하나만 빼고 다시 넣는다 —
           bumpStudioWorkingRevision 을 지나는 실제 경로를 쓴다 */
        const next = JSON.parse(JSON.stringify(currentWorkingSkin));
        const region = next.regions.find((r) => r.name === "home_canvas");
        region.canvas.elements =
          region.canvas.elements.filter((el) => el.id !== "cvPhoto");
        window.applyStudioImportedSkin
          ? window.applyStudioImportedSkin(next)
          : window.__applyTestSkin && window.__applyTestSkin(next);
        return typeof window.applyStudioImportedSkin === "function";
      }).catch(() => false);

      if (!removed) {

        /* 위 창구가 없으면 Code Apply 와 같은 길을 쓴다 */
        await page.evaluate(() => {
          const next = JSON.parse(JSON.stringify(currentWorkingSkin));
          const region = next.regions.find((r) => r.name === "home_canvas");
          region.canvas.elements =
            region.canvas.elements.filter((el) => el.id !== "cvPhoto");
          currentWorkingSkin = next;
          if (typeof window.bumpStudioWorkingRevision === "function") {
            window.bumpStudioWorkingRevision();
          }
          else if (typeof bumpStudioWorkingRevision === "function") {
            bumpStudioWorkingRevision();
          }
        });

      }

      await sleep(700);

      const afterRemove = await readState(page);

      /* draft 가 실제로 바뀌었는가 — 안 바뀐 채로 선택만 풀렸다면
         이 절은 아무 것도 증명하지 못한다 */
      const removedForReal = await page.evaluate(() => {
        const region = currentWorkingSkin.regions.find((r) => r.name === "home_canvas");
        const gone = !region.canvas.elements.some((el) => el.id === "cvPhoto");
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        return {
          gone,
          drawn: doc ? doc.querySelectorAll("[data-imory-canvas-element]").length : -1
        };
      });

      /* ★ 화면은 아직 그 요소를 그리고 있다.

         이 지름길(draft 교체 + revision bump)은 Preview 를 다시
         mount 하지 않기 때문이다. 그래서 이 검사는 오히려 더 센
         것을 본다 — 프레임은 계속 그 요소의 좌표를 올리고 있는데도,
         **지금 draft 가 그 요소를 더 이상 받쳐 주지 않는다**는 이유
         하나로 선택이 풀린다(reconcileStudioCanvasSelection). */
      check("요소가 draft 에서 실제로 빠졌다(화면은 아직 옛 DOM 을 들고 있다)",
        removedForReal.gone === true &&
        removedForReal.drawn === CANVAS_ELEMENTS.length,
        JSON.stringify(removedForReal));

      check("★ 고른 요소가 draft 에서 사라지면 선택이 풀린다(다른 요소로 바뀌지 않는다)",
        afterRemove.canvas.primaryId === null && afterRemove.canvasBox === null,
        `primary=${afterRemove.canvas.primaryId}`);

      /* enabled:false */
      await clickIn(page, byId("cvShape"));

      await page.evaluate(() => {
        const next = JSON.parse(JSON.stringify(currentWorkingSkin));
        next.regions.find((r) => r.name === "home_canvas").enabled = false;
        currentWorkingSkin = next;
        if (typeof window.bumpStudioWorkingRevision === "function") {
          window.bumpStudioWorkingRevision();
        }
        else if (typeof bumpStudioWorkingRevision === "function") {
          bumpStudioWorkingRevision();
        }
      });

      await sleep(700);

      const afterDisable = await readState(page);

      check("★ 캔버스가 꺼지면(enabled:false) 선택이 풀린다",
        afterDisable.canvas.primaryId === null,
        `primary=${afterDisable.canvas.primaryId}`);

      await page.__ctx.close();


      /* 페이지 이동 — 따로 연다(위에서 draft 를 바꿨다) */
      const page2 = await openStudio(browser, {});
      await canvasFrame(page2, false);
      await enableSelect(page2);

      await clickIn(page2, byId("cvPhoto"));

      const beforeMove = await readState(page2);

      /* Studio 에는 페이지 선택기가 없다 — 사용자는 Preview 안의
         링크로 옮긴다. Select 모드에서는 그 클릭이 선택으로 바뀌므로
         (그게 이 라운드가 지키는 규칙이다), 프레임이 보냈을 메시지를
         받는 그 함수를 직접 부른다(studio/preview/preview-navigation.js
         handlePreviewNavigateMessage — 운영에서도 이 한 곳을 지난다). */
      await page2.evaluate(() => handlePreviewNavigateMessage("/scenario-lay/category/301"));

      await sleep(1500);

      const afterMove = await readState(page2);

      check("★ HOME 을 떠나면 캔버스 선택이 풀린다",
        beforeMove.canvas.primaryId === "cvPhoto" &&
        afterMove.canvas.primaryId === null &&
        afterMove.canvasBox === null,
        `before=${beforeMove.canvas.primaryId} after=${afterMove.canvas.primaryId}`);

      check("Studio 쪽 스크립트 오류 없음",
        page2.__errors.length === 0, page2.__errors.slice(0, 3).join(" | "));

      await page2.__ctx.close();

    }


    /* ======================================================
       [sandbox]
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      check("sandbox 프레임이 캔버스를 그렸다",
        (await frame.evaluate(() =>
          document.querySelectorAll("[data-imory-canvas-element]").length)) ===
          CANVAS_ELEMENTS.length,
        frame.url());

      await enableSelect(page);
      await frame.waitForSelector("body.imory-sandbox-inspect-on",
        { state: "attached", timeout: 8000 });
      await sleep(300);

      /* 9 — native 와 같은 primary id */
      /* cvBg 는 도화지를 통째로 덮는다 — 가운데가 아니라
         **아무 요소도 없는 자리**(캔버스 좌표 350,200)를 누른다 */
      const cases = [
        ["cvShapeBare", 0.5, 0.5],
        ["cvBg", 350 / 390, 200 / 844],
        ["cvTextRot", 0.5, 0.5]
      ];
      const sandboxPicked = {};

      for (const [id, fx, fy] of cases) {
        await clickInSandbox(page, frame, byId(id), fx, fy);
        const s = await readState(page);
        sandboxPicked[id] = s.canvas.primaryId;
      }

      check("★ sandbox 에서도 같은 요소가 primary 가 된다",
        cases.every(([id]) => sandboxPicked[id] === id),
        JSON.stringify(sandboxPicked));

      /* 내부 자식 — sandbox 에서도 wrapper 하나로 올라간다.
         (이 시나리오의 sandbox 프레임에는 이미지 슬롯 값이 실리지
          않아 <img> 가 없다 — 이 라운드의 범위 밖이라 글자로 잰다) */
      await clickInSandbox(page, frame, `${byId("cvText")} p`);
      const innerPick = await readState(page);

      check("sandbox 에서도 내부 자식(<p>)을 누르면 요소 하나가 고른다",
        innerPick.canvas.primaryId === "cvText",
        String(innerPick.canvas.primaryId));

      /* 테두리는 프레임이 그린다 — 부모는 그리지 않는다 */
      const boxes = await page.evaluate(() => {
        const el = document.getElementById("studioCanvasSelectBox");
        return { hidden: !el || el.hidden };
      });

      const frameBox = await frame.evaluate(() =>
        document.querySelectorAll(".imory-sandbox-inspect-box--select").length);

      check("sandbox 에서는 프레임이 테두리를 그리고 부모는 그리지 않는다",
        boxes.hidden === true && frameBox >= 1,
        `parentHidden=${boxes.hidden} frameBoxes=${frameBox}`);

      /* 14 · 16 — sandbox 에서도 잠긴/숨긴 요소는 고를 수 없다 */
      await clickInSandbox(page, frame, byId("cvUnder"));
      const underPick = await readState(page);

      check("sandbox 에서도 잠긴 요소 밑의 요소가 고른다",
        underPick.canvas.primaryId === "cvUnder",
        String(underPick.canvas.primaryId));

      /* 18 — 위조 메시지 거부: 프레임이 보낸 척하는 식별자 */
      const forged = await page.evaluate(async () => {

        const before = window.getStudioCanvasSelection().primaryId;

        window.dispatchEvent(new MessageEvent("message", {
          data: {
            type: "preview:inspect-select",
            remote: true,
            editId: "cvLockedTop",
            rect: { left: 10, top: 10, width: 40, height: 40 }
          },
          origin: window.location.origin,
          source: window
        }));

        await new Promise((r) => setTimeout(r, 200));

        return { before, after: window.getStudioCanvasSelection().primaryId };

      });

      check("★ 잠긴 요소를 가리키는 선택 메시지는 상태를 바꾸지 않는다",
        forged.after === forged.before,
        JSON.stringify(forged));

      check("sandbox 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [scale] — Preview 부모에 scale 이 걸린 조건
    ====================================================== */
    if (wants("scale")) {

      section("scale");

      /* native — overlay 는 부모 문서가 그린다.
         프레임 안 좌표를 부모 좌표로 옮겨 실제 사각형과 견준다. */
      const page = await openStudio(browser, { scale: 0.8 });
      await canvasFrame(page, false);
      await enableSelect(page);

      const scaleSeen = await page.evaluate(() => {
        const f = document.getElementById("studioPreviewFrame");
        return f.getBoundingClientRect().width / (f.offsetWidth || 1);
      });

      check("Preview 부모에 축소가 실제로 걸렸다",
        Math.abs(scaleSeen - 0.8) < 0.01, `scale=${scaleSeen.toFixed(3)}`);

      const measured = [];

      for (const id of ["cvPhoto", "cvShapeBare", "cvTextRot"]) {

        const p = await clickIn(page, byId(id));
        const s = await readState(page);

        if (!p || !s.canvasBox) {
          measured.push({ id, error: "선택되지 않았거나 테두리가 없다" });
          continue;
        }

        /* 요소의 실제 자리(프레임 좌표) → 부모 좌표 */
        const expected = {
          x: p.origin.x + p.elRect.x * p.scale,
          y: p.origin.y + p.elRect.y * p.scale,
          w: p.elRect.w * p.scale,
          h: p.elRect.h * p.scale
        };

        measured.push({
          id,
          dx: +(s.canvasBox.x - expected.x).toFixed(2),
          dy: +(s.canvasBox.y - expected.y).toFixed(2),
          dw: +(s.canvasBox.w - expected.w).toFixed(2),
          dh: +(s.canvasBox.h - expected.h).toFixed(2)
        });

      }

      const worst =
        measured.reduce((max, m) =>
          m.error ? Infinity :
            Math.max(max, Math.abs(m.dx), Math.abs(m.dy), Math.abs(m.dw), Math.abs(m.dh)), 0);

      check("★ 부모 scale 에서도 native overlay 가 실제 사각형과 1px 안으로 맞는다",
        worst <= 1, `최대 오차 ${worst === Infinity ? "측정 실패" : worst.toFixed(2) + "px"} · ` +
        JSON.stringify(measured));

      await page.__ctx.close();


      /* sandbox — 테두리를 프레임이 그린다. 둘 다 프레임 좌표라
         부모 scale 은 양쪽에 똑같이 걸린다(그것이 맞는지 본다). */
      const spage = await openStudio(browser, { sandbox: true, scale: 0.8 });
      const sframe = await canvasFrame(spage, true);

      await enableSelect(spage);
      await sframe.waitForSelector("body.imory-sandbox-inspect-on",
        { state: "attached", timeout: 8000 });
      await sleep(300);

      await clickInSandbox(spage, sframe, byId("cvPhoto"));
      await sleep(250);

      const sandboxDelta = await sframe.evaluate(() => {

        const el = document.querySelector('[data-imory-edit-id="cvPhoto"]');
        const box = document.querySelector(".imory-sandbox-inspect-box--select");

        if (!el || !box) return null;

        const a = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();

        return {
          dx: +(b.x - a.x).toFixed(2),
          dy: +(b.y - a.y).toFixed(2),
          dw: +(b.width - a.width).toFixed(2),
          dh: +(b.height - a.height).toFixed(2)
        };

      });

      const sandboxWorst =
        sandboxDelta
          ? Math.max(Math.abs(sandboxDelta.dx), Math.abs(sandboxDelta.dy),
              Math.abs(sandboxDelta.dw), Math.abs(sandboxDelta.dh))
          : Infinity;

      check("★ 부모 scale 에서도 sandbox 프레임의 테두리가 실제 사각형과 1px 안으로 맞는다",
        sandboxWorst <= 1,
        sandboxDelta ? JSON.stringify(sandboxDelta) : "측정 실패");

      await spage.__ctx.close();

    }


    /* ======================================================
       [vendor] — Moveable · Selecto UMD 요청 0
    ====================================================== */
    if (wants("vendor")) {

      section("vendor");

      const page = await openStudio(browser, {});

      check("Studio 를 열기만 했을 때 UMD 요청 0",
        page.__vendorHits.length === 0, page.__vendorHits.join(" | "));

      await canvasFrame(page, false);
      await enableSelect(page);

      check("Select 를 켰을 때 UMD 요청 0",
        page.__vendorHits.length === 0, page.__vendorHits.join(" | "));

      await clickIn(page, byId("cvPhoto"));

      const picked = await readState(page);

      check("캔버스 요소를 골랐을 때도 UMD 요청 0",
        picked.canvas.primaryId === "cvPhoto" && page.__vendorHits.length === 0,
        `primary=${picked.canvas.primaryId} hits=${page.__vendorHits.length}`);

      await page.__ctx.close();


      const spage = await openStudio(browser, { sandbox: true });
      const sframe = await canvasFrame(spage, true);

      await enableSelect(spage);
      await sframe.waitForSelector("body.imory-sandbox-inspect-on",
        { state: "attached", timeout: 8000 });

      await clickInSandbox(spage, sframe, byId("cvShape"));

      check("sandbox 에서 골랐을 때도 UMD 요청 0",
        spage.__vendorHits.length === 0, spage.__vendorHits.join(" | "));

      /* 프레임 쪽 문서도 loader 를 부르지 않는다 */
      const frameHasLoader = await sframe.evaluate(() =>
        typeof window.ensureHomeCanvasEditorVendors);

      check("sandbox 프레임 문서에는 vendor loader 가 아직 없다(SELECT-1B 의 일)",
        frameHasLoader === "undefined", frameHasLoader);

      await spage.__ctx.close();

    }

  }
  finally {
    await browser.close();
    servers.forEach((s) => s.close());
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    console.log("실패:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
