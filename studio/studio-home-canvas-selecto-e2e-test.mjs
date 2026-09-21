/* =========================================================
   HOME CANVAS — Selecto lasso 와 다중 선택 E2E
   (HOME-CANVAS-SELECT-1B-2)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §16
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ★ 이번 단계도 **고르는 것까지**다. 고른 요소를 이동 · 크기 조절 ·
     회전하거나 Canvas JSON 을 쓰는 경로는 하나도 없다. 그래서 이
     파일은 좌표를 **바꾸지 않고**, 다음 넷만 잰다.

       1) 언제 vendor 와 Selecto 가 켜지는가
       2) lasso · Shift 가 무엇을 고르는가
       3) 부모가 정한 canonical 순서 · primary 가 맞는가
       4) 위조 · 삭제 · 재렌더에서 무엇이 남는가

   ── 손가락은 왜 안 되는가 ───────────────────────────────
   한 손가락 드래그가 세로 스크롤인지 선택 상자인지 가를 방법이
   없다. 가로채면 모바일 Preview 가 스크롤되지 않는다. 그래서
   touch 에서는 lasso 를 시작하지 않고 SELECT-1A 의 단일 탭이
   그대로 남는다(계약 §16-3). [touch] 절이 그것을 잰다.

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함) — moveable e2e 와 같은 방식이다.

   [cost]     공개 · Canvas 없는 Select · Canvas 있는 Select ·
              인스턴스 수 · 재요청 0
   [lasso]    빈 상태에서 시작 · 둘 고르기 · canonical 순서 ·
              primary · 그룹 target · 교체 · 빈 lasso 해제
   [shift]    Shift+lasso · Shift+클릭 · Shift+빈 곳 · primary 재계산
   [guard]    locked · hidden · 캔버스 밖 · 효과 DOM · 링크 ·
              Moveable 요소에서 시작
   [touch]    손가락 드래그는 lasso 를 만들지 않고 스크롤을 막지 않는다
   [view]     부모 scale(0.8) · Preview 내부 scroll
   [sandbox]  별도 origin 프레임에서 같은 것 + CSP 위반 0
   [reject]   위조 · 중복 · stale · 상한
   [life]     일부 삭제 · 재렌더 · 모드 전환 · 단일 클릭 회귀 ·
              template Inspector 회귀 · Canvas JSON 무변경

   Chromium 만 쓴다(§14).

   실행:
     node studio/studio-home-canvas-selecto-e2e-test.mjs
     node studio/studio-home-canvas-selecto-e2e-test.mjs --only=lasso
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8992;
const SANDBOX_PORT = 8993;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html?scenario=lay";

const MOVEABLE_URL_PART = "/studio/vendor/home-canvas/moveable-";
const SELECTO_URL_PART = "/studio/vendor/home-canvas/selecto-";
const RUNTIME_URL_PART = "/skin/skin-home-canvas-editor-runtime.js";

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
  ".woff2": "font/woff2"
};

const FIXTURE_IMAGE_PATH = "/__canvas-selecto-fixture__/swatch.svg";
const FIXTURE_IMAGE_URL = PARENT_ORIGIN + FIXTURE_IMAGE_PATH;
const FIXTURE_IMAGE_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
  '<rect width="80" height="80" fill="#c9803f"/></svg>';


function staticResponse(pathname, search) {

  let rel = decodeURIComponent(pathname);

  if (rel === FIXTURE_IMAGE_PATH) {
    return new Response(FIXTURE_IMAGE_BODY, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

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

   ★ 자리를 일부러 이렇게 둔다(좌표는 390 기준).

     cvA · cvB · cvC  왼쪽 위에 **서로 떨어져** 놓인 셋.
                      cvA+cvB 만 덮는 사각형과 셋 다 덮는 사각형을
                      그릴 수 있어야 한다.
     cvLocked         cvC 옆의 잠긴 요소(lasso 가 빼야 한다)
     cvHidden         숨긴 요소(같은 자리)
     cvNav            카테고리 링크 — Select 중 탐색하지 않는다
     cvFar            도화지 **아래쪽** 끝 — 위쪽 lasso 에 안 걸린다

   `.hc-outside` 는 도화지 **밖**의 평범한 스킨 요소다. 거기서
   시작한 드래그는 lasso 가 되지 않아야 한다(§3).
   `.hc-effect` 는 "사용자 JS 가 붙인 효과 DOM" 대역이다 — 도화지
   **안**에 있지만 `data-imory-canvas-element` 가 없으므로 후보가
   아니다(§12).
========================================================== */

const HOME_HTML =
  '<div class="hc-home">' +
  '<div class="hc-canvas" data-imory-canvas-root>' +
  /* 사용자 JS 가 붙였을 법한 효과 레이어 — 렌더러가 만든 것이
     아니므로 캔버스 요소 속성이 없다 */
  '<div class="hc-effect"></div>' +
  "</div>" +
  '<div class="hc-gap"></div>' +
  '<p class="hc-outside">도화지 밖 요소</p>' +
  "</div>";

const CANVAS_ELEMENTS = [
  { id: "cvA", type: "shape", x: 20, y: 30, width: 90, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvB", type: "shape", x: 140, y: 30, width: 90, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvC", type: "shape", x: 20, y: 130, width: 90, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvLocked", type: "photo", x: 140, y: 130, width: 90, height: 60,
    rotation: 0, hidden: false, locked: true, props: { slot: "photo_1" } },

  { id: "cvHidden", type: "text", x: 260, y: 130, width: 90, height: 40,
    rotation: 0, hidden: true, locked: false,
    props: { text: "숨김", role: "body" } },

  { id: "cvNav", type: "category_nav", x: 250, y: 30, width: 110, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { mode: "all", categoryIds: [] } },

  { id: "cvFar", type: "shape", x: 30, y: 700, width: 120, height: 80,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } }
];

/* draft 의 배열 순서 — canonical 정렬의 기준이다(§6) */
const CANVAS_ORDER = CANVAS_ELEMENTS.map((el) => el.id);

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진", required: false }
];

const CANVAS_CSS =
  ".hc-home { padding: 0; margin: 0; }" +
  ".hc-canvas { width: 100%; }" +
  ".hc-gap { height: 200px; }" +
  ".hc-effect { position: absolute; left: 0; top: 0; width: 100%; height: 100%;" +
  " pointer-events: none; }" +
  '[data-imory-canvas-type="text"], [data-imory-canvas-type="category_nav"]' +
  " { font: 14px/1.5 Arial, sans-serif; }" +
  '[data-imory-canvas-type="shape"] { background: #d2b48c; }';


function skinPackage(options) {

  const o = options || {};

  /* 표시 위치조차 없는 스킨 — Select 를 켜도 편집 모드가 켜지면
     안 된다(계약 §15-2) */
  if (o.noCanvas) {

    return {
      schemaVersion: 1,
      templates: {
        home: { html: '<div class="hc-home"><p class="hc-outside">평범한 스킨 요소</p></div>' },
        category: { html: '<div class="hc-category"></div>' },
        post: { html: '<div class="hc-post"><div data-imory-region="post-body"></div></div>' },
        banner: { html: '<div class="hc-banner"></div>' }
      },
      css: ".hc-home { padding: 40px; }",
      imageSlots: [],
      regions: [],
      metadata: {}
    };

  }

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
        enabled: true,
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

  const requests = [];
  const errors = [];
  const consoleErrors = [];

  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 900 },
    hasTouch: o.hasTouch === true
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

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("request", (req) => requests.push(req.url()));

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    ([pkg, slots]) => {
      window.__scenarioLaySkinPackage = pkg;
      window.__scenarioLaySkinImageSlotValues = slots;
    },
    [
      skinPackage(o),
      [{ skin_id: "skin-lay1", slot_name: "photo_1", image_url: FIXTURE_IMAGE_URL }]
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

  if (o.scale) {
    await page.addStyleTag({
      content:
        `#studioPreviewFrame { transform: scale(${o.scale}); transform-origin: top left; }`
    });
    await sleep(200);
  }

  page.__ctx = ctx;
  page.__errors = errors;
  page.__consoleErrors = consoleErrors;
  page.__requests = requests;

  return page;

}


const countRequests = (page, part) =>
  page.__requests.filter((u) => u.indexOf(part) !== -1).length;


async function canvasFrame(page, sandbox, timeout = 15000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {

    const frame = page.frames().find((f) =>
      sandbox
        ? (f.url().startsWith(SANDBOX_ORIGIN) && !f.isDetached())
        : (f.url().indexOf("preview-frame") !== -1 && !f.isDetached()));

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

  await sleep(500);

}


async function disableSelect(page) {

  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);

  if (on) {
    await page.click("#studioInspectorButton");
    await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);
  }

  await sleep(400);

}


/* Select 를 켜고 편집 모드가 실제로 켜질 때까지 기다린다 */
async function enableCanvasEditing(page) {

  await enableSelect(page);

  await page.waitForFunction(
    () => window.studioCanvasEditingIsOn && window.studioCanvasEditingIsOn() === true,
    null, { timeout: 12000 }
  );

  await sleep(900);

}


/* =========================================================
   좌표 — 프레임 안의 자리를 Studio 문서 좌표로

   ★ native 는 same-origin 이라 부모에서 계산한다. sandbox 는
     cross-origin 이라 Playwright 가 풀어 주는 중첩 프레임 좌표를
     쓴다(select e2e 와 같은 두 갈래).
========================================================== */

async function nativeRects(page, ids) {

  return page.evaluate((list) => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;

    const toParent = (r) => ({
      left: box.left + (bl + r.left) * scale,
      top: box.top + (bt + r.top) * scale,
      right: box.left + (bl + r.right) * scale,
      bottom: box.top + (bt + r.bottom) * scale
    });

    const out = {};

    list.forEach((sel) => {
      const el = doc.querySelector(sel);
      out[sel] = el ? toParent(el.getBoundingClientRect()) : null;
    });

    out.__canvas = (() => {
      const el = doc.querySelector("[data-imory-canvas-root]");
      return el ? toParent(el.getBoundingClientRect()) : null;
    })();

    return out;

  }, ids);

}


async function sandboxRects(page, frame, selectors) {

  const out = {};

  for (const sel of selectors.concat(["[data-imory-canvas-root]"])) {

    const box =
      await frame.locator(sel).first().boundingBox().catch(() => null);

    out[sel === "[data-imory-canvas-root]" ? "__canvas" : sel] =
      box
        ? { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
        : null;

  }

  return out;

}


/* 프레임 안을 스크롤해 도화지 위쪽을 화면 가운데로 끌어온다 */
async function bringCanvasIntoView(page) {

  await page.evaluate(() => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const el = doc.querySelector("[data-imory-canvas-root]");

    if (!el) return;

    el.scrollIntoView({ block: "start", inline: "nearest" });

    const r = el.getBoundingClientRect();
    doc.defaultView.scrollBy(0, r.top - doc.defaultView.innerHeight * 0.18);

  });

  await sleep(350);

}


/* =========================================================
   lasso — 실제 포인터로 끈다
========================================================== */

async function dragBox(page, from, to, options) {

  const o = options || {};

  if (o.shift) {
    await page.keyboard.down("Shift");
  }

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  /* 한 번에 끌면 Selecto 가 "끌지 않은 클릭"으로 볼 수 있다 —
     실제 손처럼 몇 걸음에 나눠 움직인다 */
  const steps = 8;

  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / steps),
      from.y + (to.y - from.y) * (i / steps)
    );
  }

  await page.mouse.up();

  if (o.shift) {
    await page.keyboard.up("Shift");
  }

  await sleep(500);

}


/* 여러 요소를 덮는 사각형의 모서리 두 점(여백 6px) */
function boxOver(rects, keys) {

  const boxes =
    keys.map((k) => rects[k]).filter(Boolean);

  if (boxes.length !== keys.length) {
    return null;
  }

  return {
    from: {
      x: Math.min(...boxes.map((b) => b.left)) - 6,
      y: Math.min(...boxes.map((b) => b.top)) - 6
    },
    to: {
      x: Math.max(...boxes.map((b) => b.right)) + 6,
      y: Math.max(...boxes.map((b) => b.bottom)) + 6
    }
  };

}


/*
  그 요소 **바로 아래**의 빈 자리. 도화지 안이면서 어떤 요소에도
  닿지 않는 사각형이다 — "아무것도 못 잡은 lasso" 를 만들 때 쓴다.

  ★ 도화지 아래 끝을 쓰지 않는 이유: 844 기준 도화지의 아래쪽은
    화면 밖이고, 화면 밖 좌표는 끌어도 아무 일이 일어나지 않아
    "해제되지 않았다"가 기능 실패처럼 보인다.
*/
function emptySpotBelow(rects, key) {

  const anchor =
    rects[key];

  const canvas =
    rects.__canvas;

  return {
    from: { x: canvas.left + 10, y: anchor.bottom + 16 },
    to: { x: canvas.left + 70, y: anchor.bottom + 66 }
  };

}


const byId = (id) => `[data-imory-edit-id="${id}"]`;


async function clickIn(page, selector, fx, fy, options) {

  const o = options || {};

  const p = await page.evaluate(([sel, ax, ay]) => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const el = doc.querySelector(sel);

    if (!el) return null;

    /* 화면 밖이면 아무 일도 일어나지 않는다 — 가운데로 끌어온다
       (Top Dock 이 위쪽을 덮으므로 조금 아래로) */
    el.scrollIntoView({ block: "center", inline: "nearest" });

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
      x: box.left + (bl + r.left + r.width * ax) * scale,
      y: box.top + (bt + r.top + r.height * ay) * scale
    };

  }, [selector, fx === undefined ? 0.5 : fx, fy === undefined ? 0.5 : fy]);

  if (!p) throw new Error("프레임 안에서 못 찾음: " + selector);

  if (o.shift) await page.keyboard.down("Shift");

  await page.mouse.click(p.x, p.y);

  if (o.shift) await page.keyboard.up("Shift");

  await sleep(450);

  return p;

}


/* =========================================================
   읽기
========================================================== */

const readState = (page) => page.evaluate(() => {

  const canvas = window.getStudioCanvasSelection();
  const inspector = window.getStudioInspectorSelection();

  const boxOf = (id) => {
    const el = document.getElementById(id);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
  };

  return {
    ids: canvas.ids,
    primaryId: canvas.primaryId,
    count: canvas.ids.length,
    frameActive: canvas.frameActive === true,
    editing: window.studioCanvasEditingIsOn ? window.studioCanvasEditingIsOn() : null,
    inspectorId: inspector ? inspector.editId : null,
    canvasBox: boxOf("studioCanvasSelectBox"),
    inspectorBox: boxOf("studioInspectorSelectBox")
  };

});


const frameState = (frame) =>
  frame.evaluate(() =>
    (typeof window.__imoryCanvasFrameState === "function")
      ? window.__imoryCanvasFrameState()
      : null);


const cspViolations = (frame) =>
  frame.evaluate(() => (window.__cspViolations || []).slice());


const readRegions = (page) => page.evaluate(() =>
  (typeof currentWorkingSkin !== "undefined" && currentWorkingSkin)
    ? JSON.stringify(currentWorkingSkin.regions)
    : null
);


/* 프레임이 보낼 법한 제안을 Studio 에 직접 넣는다 — 위조 판정용 */
const propose = (page, payload) => page.evaluate(
  (value) => window.proposeStudioCanvasSelection(value),
  payload
);


/* canonical 순서인가 */
const inCanvasOrder = (ids) => {

  const want =
    CANVAS_ORDER.filter((id) => ids.indexOf(id) !== -1);

  return JSON.stringify(ids) === JSON.stringify(want);

};


/* =========================================================
   실행
========================================================== */

async function main() {

  const pw = await loadPlaywright();

  const servers = [
    await startServer(PARENT_PORT),
    await startServer(SANDBOX_PORT)
  ];

  const browser = await pw.chromium.launch();

  try {

    /* ======================================================
       [cost] — 언제 켜지는가
    ====================================================== */
    if (wants("cost")) {

      section("cost");

      /* 1 — 공개 화면 둘 */
      for (const [label, url] of [
        ["공개 진입(index.html)", PARENT_ORIGIN + "/"],
        ["공개 sandbox 프레임", SANDBOX_ORIGIN + "/skin/sandbox/frame"]
      ]) {

        const page = await browser.newPage();
        const seen = [];
        page.on("request", (req) => seen.push(req.url()));

        await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
        await page.waitForTimeout(600);

        const umd = seen.filter((u) =>
          u.indexOf(MOVEABLE_URL_PART) !== -1 || u.indexOf(SELECTO_URL_PART) !== -1);

        check(`★ ${label} — UMD · runtime 요청 0`,
          umd.length === 0 &&
          seen.filter((u) => u.indexOf(RUNTIME_URL_PART) !== -1).length === 0,
          umd.join(" · ") || "요청 없음");

        await page.close();

      }

      /* 2 — Canvas 가 없는 스킨은 Select 를 켜도 0 */
      const bare = await openStudio(browser, { noCanvas: true });

      await enableSelect(bare);
      await sleep(1200);

      check("★ Canvas 가 없는 스킨은 Select 를 켜도 UMD · runtime 요청 0",
        countRequests(bare, MOVEABLE_URL_PART) === 0 &&
        countRequests(bare, SELECTO_URL_PART) === 0 &&
        countRequests(bare, RUNTIME_URL_PART) === 0,
        `moveable=${countRequests(bare, MOVEABLE_URL_PART)} ` +
        `runtime=${countRequests(bare, RUNTIME_URL_PART)}`);

      check("Canvas 가 없으면 편집 모드도 꺼져 있다",
        (await readState(bare)).editing === false);

      await bare.__ctx.close();

      /* 3 — Canvas 가 있는 HOME + Select */
      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      check("★ Studio 를 열기만 하면 요청 0",
        countRequests(page, MOVEABLE_URL_PART) === 0 &&
        countRequests(page, RUNTIME_URL_PART) === 0);

      await enableCanvasEditing(page);

      check("★ Canvas HOME 에서 Select 를 켜면 UMD 가 각각 1회",
        countRequests(page, MOVEABLE_URL_PART) === 1 &&
        countRequests(page, SELECTO_URL_PART) === 1,
        `moveable=${countRequests(page, MOVEABLE_URL_PART)} ` +
        `selecto=${countRequests(page, SELECTO_URL_PART)}`);

      check("★ 편집 runtime 도 1회",
        countRequests(page, RUNTIME_URL_PART) === 1,
        `${countRequests(page, RUNTIME_URL_PART)}회`);

      /* 4 · 6 — 인스턴스 수 */
      const s0 = await frameState(frame);

      check("★ native Selecto 인스턴스 1",
        !!s0 && s0.hasSelecto === true && s0.selectoInstances === 1,
        JSON.stringify(s0 && { hasSelecto: s0.hasSelecto, n: s0.selectoInstances }));

      check("★ 아직 아무것도 안 골랐어도 편집은 켜져 있다(lasso 대기)",
        !!s0 && s0.editing === true && s0.targetIds.length === 0,
        JSON.stringify(s0 && { editing: s0.editing, ids: s0.targetIds }));

      check("★ Moveable 인스턴스는 최대 1",
        !!s0 && s0.instances <= 1, `${s0 && s0.instances}개`);

      /* 재진입 — 추가 요청 0 */
      const before = {
        m: countRequests(page, MOVEABLE_URL_PART),
        s: countRequests(page, SELECTO_URL_PART),
        r: countRequests(page, RUNTIME_URL_PART)
      };

      await disableSelect(page);
      await enableCanvasEditing(page);

      check("★ 모드를 껐다 켜도 추가 요청 0",
        countRequests(page, MOVEABLE_URL_PART) === before.m &&
        countRequests(page, SELECTO_URL_PART) === before.s &&
        countRequests(page, RUNTIME_URL_PART) === before.r,
        `moveable=${countRequests(page, MOVEABLE_URL_PART)} ` +
        `selecto=${countRequests(page, SELECTO_URL_PART)} ` +
        `runtime=${countRequests(page, RUNTIME_URL_PART)}`);

      const s1 = await frameState(frame);

      check("★ 모드를 껐다 켜도 인스턴스가 늘지 않는다",
        !!s1 && s1.selectoInstances === 1 && s1.instances <= 1,
        JSON.stringify(s1 && { selecto: s1.selectoInstances, moveable: s1.instances }));

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [lasso] — 끌어서 고르기
    ====================================================== */
    if (wants("lasso")) {

      section("lasso");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await bringCanvasIntoView(page);

      const before = await readRegions(page);

      /* 7 · 8 — 빈 상태에서 시작해 둘을 고른다 */
      let rects = await nativeRects(page, [byId("cvA"), byId("cvB"), byId("cvC")]);

      const emptyFirst = await readState(page);

      check("lasso 전에는 아무것도 고르지 않은 상태다",
        emptyFirst.count === 0, `n=${emptyFirst.count}`);

      let span = boxOver(rects, [byId("cvA"), byId("cvB")]);

      check("cvA · cvB 를 덮는 사각형을 만들 수 있다", !!span,
        JSON.stringify(rects[byId("cvA")]));

      await dragBox(page, span.from, span.to);

      const two = await readState(page);
      const twoFrame = await frameState(frame);

      check("★ lasso 로 요소 둘을 고른다",
        two.count === 2 &&
        two.ids.indexOf("cvA") !== -1 && two.ids.indexOf("cvB") !== -1,
        `${JSON.stringify(two.ids)} · frame=${JSON.stringify(twoFrame && {
          gate: twoFrame.lastGate, hit: twoFrame.lastHit,
          selectable: twoFrame.lastSelectable, lasso: twoFrame.lassoCount
        })}`);

      /* 9 — canonical 순서 */
      check("★ ids 가 draft 의 canvas.elements[] 배열 순서다",
        inCanvasOrder(two.ids), `${JSON.stringify(two.ids)} · 기준 ${JSON.stringify(CANVAS_ORDER)}`);

      /* 10 — primary */
      check("★ primary 는 배열상 마지막(가장 앞에 보이는) 요소다",
        two.primaryId === two.ids[two.ids.length - 1],
        `primary=${two.primaryId} ids=${JSON.stringify(two.ids)}`);

      /* 11 — 그룹 Moveable target 2개 */
      const grouped = await frameState(frame);

      check("★ Moveable 이 그룹 target 둘을 잡는다",
        !!grouped && grouped.moveableTargets === 2,
        JSON.stringify(grouped && {
          targets: grouped.moveableTargets,
          instances: grouped.instances,
          controlBoxes: grouped.controlBoxes
        }));

      /* ★ 날것의 `.moveable-control-box` 는 그룹에서 3 이 된다
         (감싸는 상자 + 자식 둘) — 그것이 정상이다. 우리가 세는
         "인스턴스"는 우리가 표시한 바깥 상자 하나다. */
      check("그룹에서도 Moveable 인스턴스는 하나다",
        !!grouped && grouped.instances === 1 && grouped.hasInstance === true,
        `instances=${grouped && grouped.instances} ` +
        `controlBoxes=${grouped && grouped.controlBoxes}`);

      /* 12 — 일반 lasso 가 이전 선택을 교체한다 */
      rects = await nativeRects(page, [byId("cvC")]);
      span = boxOver(rects, [byId("cvC")]);

      await dragBox(page, span.from, span.to);

      const replaced = await readState(page);

      check("★ 일반 lasso 는 이전 선택을 **교체**한다",
        replaced.count === 1 && replaced.ids[0] === "cvC",
        JSON.stringify(replaced.ids));

      /* 15 — 결과 0개인 일반 lasso 는 해제

         ★ 빈 자리는 도화지 **아래 끝**이 아니라 cvC 바로 밑을 쓴다.
           도화지는 844 기준이라 아래 끝은 화면 밖이고, 화면 밖 좌표는
           끌리지도 않는다(조용히 아무 일도 안 일어난다). */
      const emptyBand = emptySpotBelow(rects, byId("cvC"));

      await dragBox(page, emptyBand.from, emptyBand.to);

      const cleared = await readState(page);

      check("★ 아무것도 못 잡은 일반 lasso 는 선택을 푼다",
        cleared.count === 0 && cleared.primaryId === null,
        JSON.stringify(cleared.ids));

      /* 셋을 한 번에 */
      rects = await nativeRects(page, [byId("cvA"), byId("cvB"), byId("cvC")]);
      span = boxOver(rects, [byId("cvA"), byId("cvB"), byId("cvC")]);

      await dragBox(page, span.from, span.to);

      const three = await readState(page);

      check("★ 셋을 덮으면 셋을 고른다(잠긴 · 숨긴 요소는 빠진다)",
        three.count === 3 &&
        ["cvA", "cvB", "cvC"].every((id) => three.ids.indexOf(id) !== -1),
        JSON.stringify(three.ids));

      /* 18 — 도화지 아래쪽 요소는 위쪽 lasso 에 안 걸린다 */
      check("★ 사각형 밖의 요소(cvFar)는 고르지 않는다",
        three.ids.indexOf("cvFar") === -1, JSON.stringify(three.ids));

      /* 30 — Canvas JSON 무변경 */
      const after = await readRegions(page);

      check("★ lasso 로 draft 의 regions 가 한 글자도 바뀌지 않는다",
        before !== null && before === after,
        before === after ? "" : "regions 가 바뀌었다");

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [shift] — 더하고 빼기
    ====================================================== */
    if (wants("shift")) {

      section("shift");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await bringCanvasIntoView(page);

      let rects = await nativeRects(page, [byId("cvA"), byId("cvB"), byId("cvC")]);

      /* 먼저 cvA 하나 */
      await clickIn(page, byId("cvA"));

      const one = await readState(page);

      check("단일 클릭이 하나를 고른다(SELECT-1A 경로 그대로)",
        one.count === 1 && one.ids[0] === "cvA", JSON.stringify(one.ids));

      /* 14 — Shift + 클릭으로 더한다 */
      await clickIn(page, byId("cvB"), 0.5, 0.5, { shift: true });

      const added = await readState(page);

      check("★ Shift + 클릭이 선택에 더한다",
        added.count === 2 &&
        added.ids.indexOf("cvA") !== -1 && added.ids.indexOf("cvB") !== -1,
        JSON.stringify(added.ids));

      check("Shift + 클릭 뒤에도 canonical 순서다",
        inCanvasOrder(added.ids), JSON.stringify(added.ids));

      check("★ Shift 로 더한 요소가 primary 가 된다",
        added.primaryId === "cvB", `primary=${added.primaryId}`);

      /* 14 — Shift + 클릭으로 뺀다 */
      await clickIn(page, byId("cvB"), 0.5, 0.5, { shift: true });

      const removed = await readState(page);

      check("★ Shift + 클릭을 한 번 더 하면 뺀다",
        removed.count === 1 && removed.ids[0] === "cvA",
        JSON.stringify(removed.ids));

      /* primary 가 빠지면 남은 것 중 배열상 마지막으로 */
      await clickIn(page, byId("cvC"), 0.5, 0.5, { shift: true });
      await clickIn(page, byId("cvB"), 0.5, 0.5, { shift: true });

      const threeNow = await readState(page);

      check("Shift 로 셋을 모았다",
        threeNow.count === 3, JSON.stringify(threeNow.ids));

      await clickIn(page, byId(threeNow.primaryId), 0.5, 0.5, { shift: true });

      const afterPrimaryGone = await readState(page);

      check("★ primary 를 Shift 로 빼면 남은 것 중 배열상 마지막이 primary 가 된다",
        afterPrimaryGone.count === 2 &&
        afterPrimaryGone.primaryId ===
          afterPrimaryGone.ids[afterPrimaryGone.ids.length - 1],
        `ids=${JSON.stringify(afterPrimaryGone.ids)} primary=${afterPrimaryGone.primaryId}`);

      /* 13 — Shift + lasso

         ★ 위 클릭들이 프레임을 스크롤했을 수 있다 — 자리를 다시 잰다. */
      rects = await nativeRects(page, [byId("cvA"), byId("cvB"), byId("cvC")]);

      let span = boxOver(rects, [byId("cvA"), byId("cvB")]);

      await dragBox(page, span.from, span.to);

      const base = await readState(page);

      check("일반 lasso 로 cvA · cvB 를 골랐다",
        base.count === 2, JSON.stringify(base.ids));

      /* ★ cvC 하나만 덮는 사각형을 쓴다. cvB + cvC 를 함께 덮는
         축 평행 사각형은 이 fixture 에서 cvA 까지 삼킨다 — 그러면
         재는 것이 XOR 이 아니라 "사각형이 무엇을 덮는가"가 된다. */
      span = boxOver(rects, [byId("cvC")]);

      await dragBox(page, span.from, span.to, { shift: true });

      const lassoAdded = await readState(page);

      check("★ Shift + lasso 가 기존 선택에 더한다",
        lassoAdded.count === 3 &&
        ["cvA", "cvB", "cvC"].every((id) => lassoAdded.ids.indexOf(id) !== -1),
        JSON.stringify(lassoAdded.ids));

      await dragBox(page, span.from, span.to, { shift: true });

      const toggled = await readState(page);

      check("★ Shift + lasso 를 같은 자리에 한 번 더 하면 뺀다(XOR)",
        toggled.count === 2 &&
        toggled.ids.indexOf("cvA") !== -1 &&
        toggled.ids.indexOf("cvB") !== -1 &&
        toggled.ids.indexOf("cvC") === -1,
        JSON.stringify(toggled.ids));

      /* 16 — Shift + 빈 곳 */
      const canvasBox = rects.__canvas;

      await dragBox(
        page,
        { x: canvasBox.left + 8, y: canvasBox.bottom - 90 },
        { x: canvasBox.left + 60, y: canvasBox.bottom - 40 },
        { shift: true }
      );

      const kept = await readState(page);

      check("★ Shift + 빈 lasso 는 기존 선택을 그대로 둔다",
        kept.count === toggled.count &&
        JSON.stringify(kept.ids) === JSON.stringify(toggled.ids),
        JSON.stringify(kept.ids));

      /* ★ 도화지 **안**의 빈 자리를 Shift 로 누른다. 도화지 밖은
         이 라운드의 범위가 아니다 — 거기는 평범한 Inspector 선택이
         그대로 가고(소유권이 넘어간다), Shift 가 뜻을 갖는 곳은
         캔버스 안이다(§5). */
      const emptyInside = emptySpotBelow(rects, byId("cvC"));

      await page.keyboard.down("Shift");
      await page.mouse.click(emptyInside.from.x, emptyInside.from.y);
      await page.keyboard.up("Shift");
      await sleep(500);

      const keptAfterEmpty = await readState(page);

      check("★ Shift + 도화지 안 빈 곳 클릭은 기존 선택을 그대로 둔다",
        keptAfterEmpty.count === toggled.count &&
        JSON.stringify(keptAfterEmpty.ids) === JSON.stringify(toggled.ids),
        JSON.stringify(keptAfterEmpty.ids));

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [guard] — 대상과 경계
    ====================================================== */
    if (wants("guard")) {

      section("guard");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await bringCanvasIntoView(page);

      const rects =
        await nativeRects(page, [
          byId("cvA"), byId("cvB"), byId("cvC"), byId("cvLocked"), byId("cvNav")
        ]);

      /* 17 — 잠긴 · 숨긴 요소까지 **덮어도** 그 둘은 빠진다

         ★ 사각형은 요소들의 실제 자리에서 만든다. 도화지 좌표로
           만들면 위쪽이 Studio Top Dock 아래로 들어가 눌리지 않는다. */
      await dragBox(
        page,
        ...(() => {
          const span = boxOver(rects, [
            byId("cvA"), byId("cvB"), byId("cvC"), byId("cvLocked")
          ]);
          return [span.from, span.to];
        })()
      );

      const all = await readState(page);

      check("★ 잠긴 요소는 lasso 대상이 아니다",
        all.ids.indexOf("cvLocked") === -1, JSON.stringify(all.ids));

      check("★ 숨긴 요소는 lasso 대상이 아니다",
        all.ids.indexOf("cvHidden") === -1, JSON.stringify(all.ids));

      check("그 위쪽의 고를 수 있는 요소는 전부 잡혔다",
        ["cvA", "cvB", "cvC"].every((id) => all.ids.indexOf(id) !== -1),
        JSON.stringify(all.ids));

      /* 19 — 효과 DOM · template 요소는 후보가 아니다 */
      const frameCheck = await frame.evaluate(() => {

        const root = document.querySelector("[data-imory-canvas-root]");

        return {
          effectExists: !!document.querySelector(".hc-effect"),
          effectIsCanvasElement:
            !!document.querySelector(".hc-effect[data-imory-canvas-element]"),
          canvasElementCount:
            root ? root.querySelectorAll("[data-imory-canvas-element]").length : -1,
          outsideIsCanvasElement:
            !!document.querySelector(".hc-outside[data-imory-canvas-element]")
        };

      });

      check("★ 사용자 JS 대역의 효과 DOM 은 캔버스 요소가 아니다(후보에서 빠진다)",
        frameCheck.effectExists === true &&
        frameCheck.effectIsCanvasElement === false,
        JSON.stringify(frameCheck));

      check("★ 도화지 밖의 template 요소도 캔버스 요소가 아니다",
        frameCheck.outsideIsCanvasElement === false);

      /* 18 — 도화지 **밖**에서 시작한 드래그는 lasso 가 아니다 */
      const beforeOutside = await readState(page);

      const outside = rects.__canvas;

      await dragBox(
        page,
        { x: outside.left + 30, y: outside.bottom + 40 },
        { x: outside.right - 30, y: outside.bottom + 120 }
      );

      const afterOutside = await readState(page);

      check("★ 도화지 밖에서 시작한 드래그는 lasso 를 만들지 않는다",
        JSON.stringify(afterOutside.ids) === JSON.stringify(beforeOutside.ids),
        `before=${JSON.stringify(beforeOutside.ids)} after=${JSON.stringify(afterOutside.ids)}`);

      /* 20 — Select 중 카테고리 링크는 탐색하지 않는다 */
      const urlBefore = page.url();

      await clickIn(page, `${byId("cvNav")} a`);

      const navState = await readState(page);

      check("★ Select 중 카테고리 링크는 탐색하지 않고 그 요소를 고른다",
        navState.count === 1 && navState.ids[0] === "cvNav" && page.url() === urlBefore,
        `ids=${JSON.stringify(navState.ids)}`);

      /* =====================================================
         23 — Moveable 의 control 요소에서 시작한 드래그는 Selecto 의
              것이 아니다

         ★ 실제 포인터로는 이 상황을 만들 수 없다. 이번 단계의
           control box 는 **클릭을 통과시키도록**(pointer-events:none)
           만들어 두었으므로, 선 위를 눌러도 이벤트의 target 은 그
           아래 스킨 요소다. 그것이 지금의 올바른 동작이다.

         그래도 관문은 **지금** 있어야 한다 — 손잡이가 생기는
         HOME-CANVAS-TRANSFORM-1 에서 핸들을 잡고 끄는 순간 lasso 가
         같이 시작되면 둘이 싸운다(§3). 그래서 관문 자체를 잰다:
         control box 를 target 으로 하는 mousedown 을 프레임 안에서
         직접 만들어 보내고, 드래그가 그 자리에서 걸렸는지 본다.
      ====================================================== */
      const moveableGate = await frame.evaluate(() => {

        const box = document.querySelector('[data-imory-canvas-frame="1"]');

        if (!box) return { found: false };

        const r = box.getBoundingClientRect();

        box.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: Math.round(r.left) + 1,
          clientY: Math.round(r.top) + 1
        }));

        const s = window.__imoryCanvasFrameState();

        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

        return { found: true, gate: s.lastGate, isMoveableElement: true };

      });

      check("★ Moveable 의 control 요소에서 시작한 드래그는 그 자리에서 걸린다",
        moveableGate.found === true && moveableGate.gate === "moveable-control",
        JSON.stringify(moveableGate));

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [touch] — 손가락으로는 lasso 를 시작하지 않는다
    ====================================================== */
    if (wants("touch")) {

      section("touch");

      const page = await openStudio(browser, { hasTouch: true });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await bringCanvasIntoView(page);

      const rects = await nativeRects(page, [byId("cvA"), byId("cvB")]);
      const span = boxOver(rects, [byId("cvA"), byId("cvB")]);

      const before = await readState(page);
      const lassoBefore = (await frameState(frame)).lassoCount;

      const scrollBefore = await frame.evaluate(() => window.scrollY);

      /* 손가락으로 같은 자리를 끈다 */
      await page.touchscreen.tap(span.from.x, span.from.y);
      await sleep(200);

      await page.evaluate(
        async ([from, to]) => {

          const dispatch = (type, x, y) => {
            const touch = new Touch({
              identifier: 1,
              target: document.elementFromPoint(x, y) || document.body,
              clientX: x,
              clientY: y
            });
            document.elementFromPoint(x, y)?.dispatchEvent(
              new TouchEvent(type, {
                bubbles: true,
                cancelable: true,
                touches: type === "touchend" ? [] : [touch],
                targetTouches: type === "touchend" ? [] : [touch],
                changedTouches: [touch]
              })
            );
          };

          dispatch("touchstart", from.x, from.y);

          for (let i = 1; i <= 6; i += 1) {
            dispatch(
              "touchmove",
              from.x + (to.x - from.x) * (i / 6),
              from.y + (to.y - from.y) * (i / 6)
            );
            await new Promise((r) => setTimeout(r, 16));
          }

          dispatch("touchend", to.x, to.y);

        },
        [span.from, span.to]
      );

      await sleep(700);

      const after = await readState(page);
      const lassoAfter = (await frameState(frame)).lassoCount;

      /* 21 — 손가락 드래그는 lasso 를 만들지 않는다 */
      check("★ 손가락 드래그는 lasso 를 만들지 않는다",
        lassoAfter === lassoBefore,
        `before=${lassoBefore} after=${lassoAfter}`);

      check("★ 손가락 드래그로 다중 선택이 생기지 않는다",
        after.count <= 1,
        `ids=${JSON.stringify(after.ids)} (이전 ${JSON.stringify(before.ids)})`);

      /* 스크롤을 막지 않는다 — 프레임을 실제로 굴려 본다 */
      await frame.evaluate(() => window.scrollBy(0, 120));
      await sleep(300);

      const scrollAfter = await frame.evaluate(() => window.scrollY);

      check("★ 손가락 정책이 Preview 스크롤을 막지 않는다",
        scrollAfter > scrollBefore,
        `${scrollBefore} → ${scrollAfter}`);

      /* 단일 탭은 그대로 된다 */
      await bringCanvasIntoView(page);

      const tapAt = await nativeRects(page, [byId("cvC")]);
      const box = tapAt[byId("cvC")];

      await page.touchscreen.tap(
        (box.left + box.right) / 2,
        (box.top + box.bottom) / 2
      );

      await sleep(600);

      const tapped = await readState(page);

      check("★ 손가락 단일 탭 선택은 그대로 된다(SELECT-1A)",
        tapped.count === 1 && tapped.ids[0] === "cvC",
        JSON.stringify(tapped.ids));

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [view] — scale · scroll
    ====================================================== */
    if (wants("view")) {

      section("view");

      /* 24 — 부모 scale(0.8) */
      const scaled = await openStudio(browser, { scale: 0.8 });
      await canvasFrame(scaled, false);

      await enableCanvasEditing(scaled);
      await bringCanvasIntoView(scaled);

      let rects = await nativeRects(scaled, [byId("cvA"), byId("cvB"), byId("cvC")]);
      let span = boxOver(rects, [byId("cvA"), byId("cvB")]);

      await dragBox(scaled, span.from, span.to);

      const scaledState = await readState(scaled);

      check("★ 부모 scale(0.8) 에서도 lasso 가 정확히 둘을 고른다",
        scaledState.count === 2 &&
        scaledState.ids.indexOf("cvA") !== -1 &&
        scaledState.ids.indexOf("cvB") !== -1,
        JSON.stringify(scaledState.ids));

      check("scale 조건에서도 cvC 는 걸리지 않는다",
        scaledState.ids.indexOf("cvC") === -1, JSON.stringify(scaledState.ids));

      await scaled.__ctx.close();

      /* 25 — Preview 내부 scroll */
      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      /* 도화지 아래쪽 요소를 화면으로 끌어온다 */
      await page.evaluate(() => {
        const f = document.getElementById("studioPreviewFrame");
        const doc = f.contentDocument;
        const el = doc.querySelector('[data-imory-edit-id="cvFar"]');
        el.scrollIntoView({ block: "center", inline: "nearest" });
      });

      await sleep(400);

      rects = await nativeRects(page, [byId("cvFar")]);
      span = boxOver(rects, [byId("cvFar")]);

      await dragBox(page, span.from, span.to);

      const scrolled = await readState(page);

      check("★ Preview 내부를 스크롤한 뒤에도 lasso 좌표가 맞는다",
        scrolled.count === 1 && scrolled.ids[0] === "cvFar",
        JSON.stringify(scrolled.ids));

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [sandbox] — 별도 origin 프레임
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);

      await frame.waitForFunction(
        () => {
          const s = window.__imoryCanvasFrameState && window.__imoryCanvasFrameState();
          return !!(s && s.editing === true && s.hasSelecto === true);
        },
        null, { timeout: 15000 }
      );

      /* 5 — sandbox Selecto 인스턴스 1 */
      const s0 = await frameState(frame);

      check("★ sandbox Selecto 인스턴스 1",
        s0.hasSelecto === true && s0.selectoInstances === 1,
        JSON.stringify({ hasSelecto: s0.hasSelecto, n: s0.selectoInstances }));

      check("★ sandbox — 아직 고르지 않았어도 편집은 켜져 있다",
        s0.editing === true && s0.targetIds.length === 0,
        JSON.stringify({ editing: s0.editing, ids: s0.targetIds }));

      /* lasso — cross-origin 이라 Playwright 가 푼 좌표를 쓴다 */
      await frame.locator(byId("cvA")).first().scrollIntoViewIfNeeded();
      await sleep(300);

      const rects =
        await sandboxRects(page, frame, [byId("cvA"), byId("cvB"), byId("cvC")]);

      const span = boxOver(rects, [byId("cvA"), byId("cvB")]);

      check("sandbox — cvA · cvB 를 덮는 사각형을 만들 수 있다", !!span,
        JSON.stringify(rects[byId("cvA")]));

      await dragBox(page, span.from, span.to);

      const two = await readState(page);

      check("★ sandbox — lasso 로 둘을 고른다",
        two.count === 2 &&
        two.ids.indexOf("cvA") !== -1 && two.ids.indexOf("cvB") !== -1,
        JSON.stringify(two.ids));

      check("★ sandbox — ids 가 canonical 순서다",
        inCanvasOrder(two.ids), JSON.stringify(two.ids));

      const grouped = await frameState(frame);

      check("★ sandbox — Moveable 이 그룹 target 둘을 잡는다",
        grouped.moveableTargets === 2 && grouped.instances === 1,
        JSON.stringify({ targets: grouped.moveableTargets, instances: grouped.instances }));

      /* 26 — CSP 위반 0 */
      const violations = await cspViolations(frame);

      check("★ sandbox CSP 위반 0건 — Selecto 의 style 도 nonce 로 통과한다",
        violations.length === 0, JSON.stringify(violations.slice(0, 3)));

      const cspErrors = page.__consoleErrors.filter(
        (t) => t.indexOf("Content Security Policy") !== -1);

      check("★ sandbox — 콘솔 CSP 오류 0건",
        cspErrors.length === 0, cspErrors.slice(0, 2).join(" | "));

      const styled = await frame.evaluate(() =>
        Array.prototype.map.call(
          document.querySelectorAll("style[data-styled-id]"),
          (el) => ({ id: el.getAttribute("data-styled-id"), applied: !!el.sheet })
        ));

      check("★ sandbox — Moveable · Selecto 의 <style> 이 실제로 적용됐다(sheet !== null)",
        styled.length >= 2 && styled.every((s) => s.applied),
        JSON.stringify(styled));

      /* Shift + 클릭도 cross-origin 에서 된다 */
      await page.keyboard.down("Shift");

      const cBox = rects[byId("cvC")];

      await page.mouse.click(
        (cBox.left + cBox.right) / 2,
        (cBox.top + cBox.bottom) / 2
      );

      await page.keyboard.up("Shift");
      await sleep(600);

      const shifted = await readState(page);

      check("★ sandbox — Shift + 클릭이 선택에 더한다",
        shifted.count === 3 && shifted.ids.indexOf("cvC") !== -1,
        JSON.stringify(shifted.ids));

      check("sandbox 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [reject] — 부모가 거부하는 제안
    ====================================================== */
    if (wants("reject")) {

      section("reject");

      const page = await openStudio(browser, {});
      await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await bringCanvasIntoView(page);

      await clickIn(page, byId("cvA"));

      const base = await readState(page);

      check("기준 선택을 만들었다",
        base.count === 1 && base.ids[0] === "cvA", JSON.stringify(base.ids));

      /* 27 — 위조 · 중복 · 상한 · locked · hidden */
      const cases = [
        ["지금 draft 에 없는 id",
          { ids: ["cvGhost"], primaryId: "cvGhost", mode: "replace", generation: 0 }],
        ["정상 id 하나 + 없는 id 하나",
          { ids: ["cvB", "cvGhost"], primaryId: "cvB", mode: "replace", generation: 0 }],
        ["잠긴 요소",
          { ids: ["cvLocked"], primaryId: "cvLocked", mode: "replace", generation: 0 }],
        ["숨긴 요소",
          { ids: ["cvHidden"], primaryId: "cvHidden", mode: "replace", generation: 0 }],
        ["중복 id",
          { ids: ["cvB", "cvB"], primaryId: "cvB", mode: "replace", generation: 0 }],
        ["상한을 넘는 배열",
          {
            ids: Array.from({ length: 65 }, (_, i) => "cv" + i),
            primaryId: "cv0", mode: "replace", generation: 0
          }]
      ];

      for (const [label, payload] of cases) {

        const accepted = await propose(page, payload);
        const state = await readState(page);

        check(`★ ${label} 가 섞인 제안은 **전체가** 거부된다`,
          accepted === false &&
          JSON.stringify(state.ids) === JSON.stringify(base.ids),
          `accepted=${accepted} ids=${JSON.stringify(state.ids)}`);

      }

      /* 정상 제안은 통과한다 — 거부가 "아무것도 안 통한다"가 아님을 보인다 */
      const ok = await propose(page,
        { ids: ["cvB", "cvC"], primaryId: "cvC", mode: "replace", generation: 0 });

      const okState = await readState(page);

      check("정상 제안은 그대로 통과한다",
        ok === true && okState.count === 2 && okState.primaryId === "cvC",
        JSON.stringify(okState.ids));

      /* 편집이 꺼져 있으면 제안 자체가 성립하지 않는다 */
      await disableSelect(page);

      const whenOff = await propose(page,
        { ids: ["cvA"], primaryId: "cvA", mode: "replace", generation: 0 });

      check("★ Select 가 꺼져 있으면 제안이 통하지 않는다",
        whenOff === false, `accepted=${whenOff}`);

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [life] — 삭제 · 재렌더 · 회귀
    ====================================================== */
    if (wants("life")) {

      section("life");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await bringCanvasIntoView(page);

      const rects = await nativeRects(page, [byId("cvA"), byId("cvB"), byId("cvC")]);
      const span = boxOver(rects, [byId("cvA"), byId("cvB"), byId("cvC")]);

      await dragBox(page, span.from, span.to);

      const three = await readState(page);

      check("셋을 골랐다", three.count === 3, JSON.stringify(three.ids));

      /* 28 — 일부만 지우면 나머지는 남는다 */
      await page.evaluate(() => {

        const next = JSON.parse(JSON.stringify(currentWorkingSkin));

        next.regions = next.regions.map((region) => {
          if (region.name !== "home_canvas") return region;
          const copy = JSON.parse(JSON.stringify(region));
          copy.canvas.elements =
            copy.canvas.elements.filter((el) => el.id !== "cvB");
          return copy;
        });

        window.applyAiSkinPackage(next, { label: "테스트: cvB 삭제" });

      });

      await sleep(1400);

      const afterDelete = await readState(page);

      check("★ 고른 것 중 하나를 지워도 나머지 선택은 남는다",
        afterDelete.count === 2 &&
        afterDelete.ids.indexOf("cvB") === -1 &&
        afterDelete.ids.indexOf("cvA") !== -1 &&
        afterDelete.ids.indexOf("cvC") !== -1,
        JSON.stringify(afterDelete.ids));

      check("★ 지운 뒤 primary 가 남은 것 중 하나다",
        afterDelete.ids.indexOf(afterDelete.primaryId) !== -1,
        `primary=${afterDelete.primaryId}`);

      /* 29 — 재렌더 뒤 인스턴스가 늘지 않는다 */
      const afterRender = await frameState(frame);

      check("★ 재렌더 뒤에도 인스턴스는 각각 하나다",
        afterRender.instances === 1 && afterRender.selectoInstances === 1,
        JSON.stringify({
          moveable: afterRender.instances, selecto: afterRender.selectoInstances
        }));

      check("★ 재렌더 뒤에도 그룹 target 이 살아 있는 둘이다",
        afterRender.moveableTargets === 2,
        `${afterRender.moveableTargets}개`);

      /* 31 — 단일 클릭 회귀 */
      await clickIn(page, byId("cvA"));

      const single = await readState(page);

      check("★ 단일 클릭은 여전히 하나만 고른다(회귀 0)",
        single.count === 1 && single.ids[0] === "cvA",
        JSON.stringify(single.ids));

      /* 32 — template Inspector 회귀 */
      await clickIn(page, ".hc-outside");

      const plain = await readState(page);

      check("★ 일반 template 요소 선택이 예전처럼 동작한다",
        plain.inspectorId !== null &&
        plain.inspectorBox !== null &&
        plain.count === 0,
        `inspector=${plain.inspectorId} canvas=${JSON.stringify(plain.ids)}`);

      /* 모드 종료 */
      await disableSelect(page);
      await sleep(700);

      const off = await readState(page);
      const offFrame = await frameState(frame);

      check("★ Select 를 끄면 캔버스 선택도 편집도 꺼진다",
        off.count === 0 && off.editing === false,
        `ids=${JSON.stringify(off.ids)} editing=${off.editing}`);

      check("★ Select 를 끄면 프레임의 Selecto 도 걷힌다",
        !!offFrame && offFrame.hasSelecto === false && offFrame.editing === false,
        JSON.stringify(offFrame && {
          hasSelecto: offFrame.hasSelecto, editing: offFrame.editing
        }));

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }

  }
  finally {
    await browser.close();
    for (const s of servers) s.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    console.log("실패:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }

}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});
