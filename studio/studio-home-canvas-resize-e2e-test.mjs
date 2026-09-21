/* =========================================================
   HOME CANVAS — 단일 요소 리사이즈 · JSON 저장 · Undo E2E
   (HOME-CANVAS-TRANSFORM-1B)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §18
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ★ 이번 단계가 소유하는 것은 **x · y · width · height 네 칸**이다.

   그래서 이 파일이 매번 다시 보는 것은 "얼마나 커졌는가"보다
   "**그 밖에 무엇이 바뀌지 않았는가**"다 — rotation · props ·
   hidden · locked · 배열 순서 · 모르는 필드 · 다른 요소 · 스킨 CSS
   가 한 글자도 달라지면 안 된다.

   ── 왜 크기를 픽셀이 아니라 JSON 으로 재는가 ─────────────
   화면 픽셀은 도화지 폭 · 부모 scale · 스크롤에 따라 달라진다.
   계약이 말하는 것은 390 자 위의 숫자이므로, 재는 값도 그것이다.
   픽셀은 "잡은 변이 그만큼 갔는가 · 반대편이 그대로인가"를 확인하는
   보조로 쓴다.

   ── 반대편 기준점을 어떻게 재는가 ───────────────────────
   회전한 요소의 "반대편 변"은 getBoundingClientRect 로 알 수 없다
   (그것은 축에 정렬된 바깥 상자다). 그래서 **Moveable 손잡이 자신의
   자리**를 잰다 — 손잡이는 회전한 요소의 변 중앙과 모서리에 정확히
   놓이므로, `e` 를 끌었을 때 `w` 손잡이가 제자리면 그것이 곧 "서쪽
   변이 고정됐다"다.

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함) — transform e2e 와 같은 방식이다.

   [handle]   손잡이 8 개 · 단일만 · 잡을 수 있는 hit area ·
              vendor 요청 시점
   [resize]   e · s · nw · se 실제 포인터 리사이즈 · 기준점 ·
              네 칸 밖 불변 · 최소 크기
   [rotate]   0° · 20° · 45° 에서 반대편 기준점과 rotation 보존
   [auto]     좌우는 auto 유지 · 세로/모서리는 숫자 전환 ·
              단순 클릭은 auto 유지
   [view]     좁은 도화지 · 부모 scale(0.8) · Preview 내부 scroll
   [undo]     한 제스처 = 한 칸 · 0 변화 = 기록 0 · Undo/Redo ·
              auto 복원
   [round]    Save → 다시 열기 · Export → Import · Publish resolve
   [reject]   잠김 · 숨김 · stale 순번 · 모르는 키 · expected 불일치 ·
              취소
   [gesture]  본체 이동 회귀 · 빈 도화지 lasso · 손잡이에서 lasso 0 ·
              손가락
   [sandbox]  별도 origin 에서 같은 JSON + CSP 위반 0

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-resize-e2e-test.mjs
     node studio/studio-home-canvas-resize-e2e-test.mjs --only=resize
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8996;
const SANDBOX_PORT = 8997;

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
  ".woff2": "font/woff2"
};

const FIXTURE_IMAGE_PATH = "/__canvas-resize-fixture__/swatch.svg";
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

     cvA      왼쪽 위. 이 라운드의 주인공. `zzz` 는 **우리가 모르는
              필드**다(§18-6 보존).
     cvB      옆의 또 다른 요소. "다른 요소는 그대로인가"의 대조군.
     cvRot20  20° · cvRot45 45° — 회전 기준점 절이 쓴다.
     cvAuto   height:"auto" (text) — auto 절의 주인공.
     cvAuto2  height:"auto" 두 번째 — 세로 전환과 좌우 유지를 각각
              다른 요소에서 본다(한 요소를 숫자로 바꾼 뒤에는 그
              요소로 "auto 유지"를 다시 볼 수 없다).
     cvLocked 잠긴 요소 · cvHidden 숨긴 요소 — 거부 절이 쓴다.
     cvFar    도화지 아래쪽 — Preview 내부 스크롤 절이 쓴다.

   좌우 여백을 넉넉히 둔다 — 손잡이를 잡고 끌 때 다른 요소와 겹치면
   "무엇을 잡았는가"가 흐려진다.
========================================================== */

const HOME_HTML =
  '<div class="hc-home">' +
  '<div class="hc-canvas" data-imory-canvas-root>' +
  '<div class="hc-effect"></div>' +
  "</div>" +
  '<div class="hc-gap"></div>' +
  '<p class="hc-outside">도화지 밖 요소</p>' +
  "</div>";

const CANVAS_ELEMENTS = [
  { id: "cvA", type: "shape", x: 40, y: 60, width: 90, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" },
    zzz: { keep: "unknown-field" } },

  { id: "cvB", type: "shape", x: 250, y: 60, width: 80, height: 50,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvRot20", type: "shape", x: 60, y: 200, width: 90, height: 60,
    rotation: 20, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvRot45", type: "shape", x: 60, y: 340, width: 90, height: 60,
    rotation: 45, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvAuto", type: "text", x: 40, y: 480, width: 120, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "자동 높이", role: "body" } },

  { id: "cvAuto2", type: "text", x: 220, y: 480, width: 120, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "자동 높이 둘", role: "body" } },

  { id: "cvLocked", type: "photo", x: 40, y: 560, width: 120, height: 80,
    rotation: 0, hidden: false, locked: true, props: { slot: "photo_1" } },

  { id: "cvHidden", type: "shape", x: 220, y: 560, width: 80, height: 50,
    rotation: 0, hidden: true, locked: false, props: { kind: "rect" } },

  { id: "cvFar", type: "shape", x: 60, y: 720, width: 120, height: 80,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } }
];

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
  '[data-imory-canvas-type="text"] { font: 14px/1.5 Arial, sans-serif; }' +
  '[data-imory-canvas-type="shape"] { background: #d2b48c; }';

/* 도화지 폭을 좁혀 배율이 1 이 아닌 경우를 만든다([view]) */
const NARROW_CANVAS_CSS =
  CANVAS_CSS + ".hc-canvas { width: 60%; margin: 0 auto; }";


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
    css: o.narrow ? NARROW_CANVAS_CSS : CANVAS_CSS,
    imageSlots: IMAGE_SLOTS,
    regions: [
      /* 우리가 모르는 **다른 항목** — 리사이즈가 이것을 지우면 안 된다 */
      { name: "some_other_region", enabled: true, payload: { keep: true } },
      {
        name: "home_canvas",
        enabled: true,
        note: "unknown-entry-field",
        canvas: {
          version: 1,
          baseWidth: 390,
          baseHeight: 844,
          extra: "unknown-canvas-field",
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

  const errors = [];
  const consoleErrors = [];
  const canvasLogs = [];
  const vendorRequests = [];

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

  page.on("request", (req) => {
    if (req.url().includes("/studio/vendor/home-canvas/")) {
      vendorRequests.push(req.url());
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    /* 확정이 거부되면 부모가 사유를 한 줄 남긴다 — 실패했을 때
       "왜"를 로그에서 다시 찾지 않아도 되게 모아 둔다 */
    if (msg.text().indexOf("[studio-canvas]") !== -1) canvasLogs.push(msg.text());
  });

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    ([pkg, slots]) => {
      window.__scenarioLaySkinPackage = pkg;
      window.__scenarioLaySkinImageSlotValues = slots;
    },
    [
      o.package || skinPackage(o),
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
  page.__canvasLogs = canvasLogs;
  page.__vendorRequests = vendorRequests;

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


async function enableCanvasEditing(page) {

  await enableSelect(page);

  await page.waitForFunction(
    () => window.studioCanvasEditingIsOn && window.studioCanvasEditingIsOn() === true,
    null, { timeout: 12000 }
  );

  await sleep(900);

}


/* =========================================================
   좌표

   native 는 same-origin 이라 부모에서 계산하고, sandbox 는
   Playwright 가 풀어 주는 중첩 프레임 좌표를 쓴다(transform e2e 와
   같은 두 갈래).
========================================================== */

async function nativeRects(page, selectors) {

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
      bottom: box.top + (bt + r.bottom) * scale,
      width: r.width * scale,
      height: r.height * scale
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

    out.__scale = scale;

    return out;

  }, selectors);

}


async function sandboxRects(page, frame, selectors) {

  const out = {};

  for (const sel of selectors.concat(["[data-imory-canvas-root]"])) {

    const box =
      await frame.locator(sel).first().boundingBox().catch(() => null);

    out[sel === "[data-imory-canvas-root]" ? "__canvas" : sel] =
      box
        ? {
            left: box.x, top: box.y,
            right: box.x + box.width, bottom: box.y + box.height,
            width: box.width, height: box.height
          }
        : null;

  }

  return out;

}


const byId = (id) => `[data-imory-edit-id="${id}"]`;

const HANDLE_SELECTOR =
  '[data-imory-canvas-frame="1"] .moveable-control[data-direction]';


async function rectsFor(page, frame, sandbox, ids) {

  const selectors = ids.map(byId);

  return sandbox
    ? sandboxRects(page, frame, selectors)
    : nativeRects(page, selectors);

}


/* =========================================================
   손잡이 자리

   ★ 반대편 기준점을 재는 자다(머리말). 손잡이는 회전한 요소의 변
     중앙 · 모서리에 정확히 놓이므로, 회전 요소에서도 "이 변이
     제자리인가"를 픽셀로 물어볼 수 있다.
========================================================== */

async function handleCenters(page, frame, sandbox) {

  if (!sandbox) {

    return page.evaluate((selector) => {

      const f = document.getElementById("studioPreviewFrame");
      const doc = f.contentDocument;
      const box = f.getBoundingClientRect();
      const scale = box.width / (f.offsetWidth || box.width);
      const cs = getComputedStyle(f);
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0;

      const out = {};

      doc.querySelectorAll(selector).forEach((handle) => {

        const r = handle.getBoundingClientRect();

        out[handle.getAttribute("data-direction")] = {
          x: box.left + (bl + r.left + r.width / 2) * scale,
          y: box.top + (bt + r.top + r.height / 2) * scale,
          size: Math.min(r.width, r.height) * scale,
          pointerEvents: getComputedStyle(handle).pointerEvents
        };

      });

      return out;

    }, HANDLE_SELECTOR);

  }

  const out = {};

  for (const dir of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {

    const box =
      await frame
        .locator(`[data-imory-canvas-frame="1"] .moveable-control[data-direction="${dir}"]`)
        .first()
        .boundingBox()
        .catch(() => null);

    if (box) {
      out[dir] = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        size: Math.min(box.width, box.height),
        pointerEvents: "auto"
      };
    }

  }

  return out;

}


/* =========================================================
   입력 — 실제 포인터로 끈다
========================================================== */

async function dragFrom(page, from, to, options) {

  const o = options || {};

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  /* 한 번에 끌면 "끌지 않은 클릭"으로 보일 수 있다 — 실제 손처럼
     몇 걸음에 나눠 움직인다 */
  const steps = o.steps || 8;

  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / steps),
      from.y + (to.y - from.y) * (i / steps)
    );
    if (o.pause) await sleep(o.pause);
  }

  if (o.beforeUp) {
    await o.beforeUp();
  }

  if (o.noUp) {
    return;
  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 700 : o.settle);

}


/* 그 요소 가운데에서 (dx, dy) 만큼 끈다 — 본체 이동(회귀 확인용) */
async function dragElement(page, frame, sandbox, id, dx, dy, options) {

  await bringIntoView(page, frame, sandbox, id);

  const rects =
    await rectsFor(page, frame, sandbox, [id]);

  const box =
    rects[byId(id)];

  if (!box) {
    throw new Error("요소를 찾지 못했습니다: " + id);
  }

  const from = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2
  };

  await dragFrom(page, from, { x: from.x + dx, y: from.y + dy }, options);

  return { box, from };

}


/*
  손잡이 하나를 (dx, dy) 만큼 끈다.

  끌기 **전** 손잡이 자리를 함께 돌려주므로, 부르는 쪽이 끌고 난 뒤
  다시 재어 "반대편이 제자리인가"를 비교할 수 있다.
*/
async function resizeBy(page, frame, sandbox, id, dir, dx, dy, options) {

  await bringIntoView(page, frame, sandbox, id);

  const before =
    await handleCenters(page, frame, sandbox);

  const handle =
    before[dir];

  if (!handle) {
    throw new Error(`손잡이를 찾지 못했습니다: ${id} ${dir}`);
  }

  await dragFrom(
    page,
    { x: handle.x, y: handle.y },
    { x: handle.x + dx, y: handle.y + dy },
    options
  );

  return before;

}


/* 그 요소를 화면 가운데로 끌어온다(Top Dock 이 위쪽을 덮으므로
   조금 아래로)

   ★ sandbox 에서 **스크롤하는 것은 sandbox 프레임이 아니다.**

   프레임 구조가 parent → #studioPreviewFrame → .imory-skin-sandbox-frame
   이고(studio/preview/preview-sandbox.js 머리말), 안쪽 sandbox iframe 은
   자기 내용 높이만큼 늘어나 있어 **스스로 스크롤하지 않는다**. 그 안에서
   window.scrollBy 를 불러도 아무 일도 일어나지 않고, 그러면 화면 밖에
   있는 요소의 좌표로 클릭해 **엉뚱한 자리를 누른다**(2026-09-21: 그
   때문에 sandbox 에서 두 번째 선택이 되지 않아, 여전히 고른 채였던 앞
   요소를 리사이즈하고 있었다).

   그래서 Playwright 가 풀어 주는 화면 좌표를 보고 **Preview 문서**를
   민다. 한 번에 맞지 않을 수 있어(스크롤 상한 · 레이아웃 변화) 몇 번
   수렴시킨다. */
async function bringIntoView(page, frame, sandbox, id) {

  if (sandbox) {

    const wantY =
      page.viewportSize().height * 0.55;

    for (let i = 0; i < 4; i += 1) {

      const box =
        await frame.locator(byId(id)).first().boundingBox().catch(() => null);

      if (!box) {
        break;
      }

      const delta =
        (box.y + box.height / 2) - wantY;

      if (Math.abs(delta) < 20) {
        break;
      }

      await page.evaluate((d) => {
        document.getElementById("studioPreviewFrame")
          .contentDocument.defaultView.scrollBy(0, d);
      }, delta);

      await sleep(250);

    }

  }
  else {

    await page.evaluate((sel) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      doc.defaultView.scrollBy(
        0, r.top + r.height / 2 - doc.defaultView.innerHeight * 0.55
      );
    }, byId(id));

  }

  await sleep(400);

}


/* =========================================================
   읽기 — JSON 이 진실이다
========================================================== */

const readCanvas = (page) => page.evaluate(() => {

  if (typeof currentWorkingSkin === "undefined" || !currentWorkingSkin) {
    return null;
  }

  const entry =
    (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

  return entry ? JSON.parse(JSON.stringify(entry)) : null;

});


const readRegions = (page) => page.evaluate(() =>
  (typeof currentWorkingSkin !== "undefined" && currentWorkingSkin)
    ? JSON.parse(JSON.stringify(currentWorkingSkin.regions))
    : null
);


const elementOf = (canvas, id) =>
  canvas ? canvas.canvas.elements.find((el) => el.id === id) || null : null;


const boxOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el
    ? { x: el.x, y: el.y, width: el.width, height: el.height }
    : null;
};


/* 네 칸을 뺀 나머지 전부 — "그 밖에 무엇이 바뀌었는가"의 지문 */
const fingerprintOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  if (!el) return null;
  const copy = { ...el };
  delete copy.x;
  delete copy.y;
  delete copy.width;
  delete copy.height;
  return JSON.stringify(copy);
};


const readState = (page) => page.evaluate(() => {

  const canvas = window.getStudioCanvasSelection();

  return {
    ids: canvas.ids,
    primaryId: canvas.primaryId,
    count: canvas.ids.length,
    generation: canvas.generation,
    geometry: window.studioCanvasSingleGeometry
      ? window.studioCanvasSingleGeometry()
      : null,
    editing: window.studioCanvasEditingIsOn
      ? window.studioCanvasEditingIsOn()
      : null
  };

});


const frameState = (frame) =>
  frame.evaluate(() =>
    (typeof window.__imoryCanvasFrameState === "function")
      ? window.__imoryCanvasFrameState()
      : null);


const cspViolations = (frame) =>
  frame.evaluate(() => (window.__cspViolations || []).slice());


const historyState = (page) =>
  page.evaluate(() =>
    window.getStudioHistoryState ? window.getStudioHistoryState() : null);


/* 프레임을 거치지 않고 확정 함수에 직접 넣는다 — 위조 판정용 */
const commit = (page, request) => page.evaluate(
  (value) => window.commitStudioCanvasElementTransform(value),
  request
);


async function clickElement(page, frame, sandbox, id, options) {

  const o = options || {};

  await bringIntoView(page, frame, sandbox, id);

  const rects =
    await rectsFor(page, frame, sandbox, [id]);

  const box =
    rects[byId(id)];

  if (!box) throw new Error("요소를 찾지 못했습니다: " + id);

  if (o.shift) await page.keyboard.down("Shift");

  await page.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2);

  if (o.shift) await page.keyboard.up("Shift");

  await sleep(500);

}


/* 고른 뒤 프레임에서 조작이 실제로 켜졌는가 */
async function waitForDraggable(page, frame, want = true, timeout = 8000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {

    const state = await frameState(frame).catch(() => null);

    if (state && !!state.draggable === want) {
      return state;
    }

    await sleep(150);

  }

  return frameState(frame).catch(() => null);

}


/* 손잡이 여덟이 붙을 때까지 */
async function waitForHandles(page, frame, want = 8, timeout = 8000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {

    const state = await frameState(frame).catch(() => null);

    if (state && state.resizeHandles === want) {
      return state;
    }

    await sleep(150);

  }

  return frameState(frame).catch(() => null);

}


async function pick(page, frame, sandbox, id) {

  await clickElement(page, frame, sandbox, id);
  await waitForDraggable(page, frame, true);
  return waitForHandles(page, frame, 8);

}


const close = async (page) => {
  await page.__ctx.close().catch(() => {});
};


/* 두 자리가 1px 안에서 같은가 */
const near = (a, b, tol = 1) =>
  !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

const gap = (a, b) =>
  (!a || !b) ? "없음"
    : `Δ(${(b.x - a.x).toFixed(2)}, ${(b.y - a.y).toFixed(2)})`;


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
       [handle] — 손잡이가 언제 · 몇 개 · 잡을 수 있게 붙는가
    ====================================================== */
    if (wants("handle")) {

      section("handle");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      check("Studio 를 열고 HOME 을 그린 것만으로는 vendor 요청 0",
        page.__vendorRequests.length === 0,
        page.__vendorRequests.join(" · ") || "요청 없음");

      await enableCanvasEditing(page);

      const idle = await frameState(frame);
      const idleSelection = await readState(page);

      check("Select 만 켠 상태에는 잡을 수 있는 손잡이가 없다",
        idle && idle.resizeHandles === 0,
        idle
          ? `${idle.resizeHandles} 개 · 선택 ${JSON.stringify(idleSelection.ids)}`
          : "state 없음");

      const ready = await pick(page, frame, false, "cvA");

      check("단독 선택에 손잡이가 여덟이다",
        ready && ready.resizeHandles === 8,
        ready ? String(ready.resizeHandles) : "state 없음");

      check("여덟 방향이 모두 있다",
        ready &&
        ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
          .every((dir) => ready.resizeHandleDirections.indexOf(dir) !== -1),
        ready ? ready.resizeHandleDirections.join(",") : "");

      check("★ 손잡이는 모두 잡을 수 있다 (control box 의 pointer-events 를 되돌려 받았다)",
        ready && ready.resizeHandleHit === 8,
        ready ? `${ready.resizeHandleHit}/8` : "state 없음");

      const centers = await handleCenters(page, frame, false);

      check("손잡이가 마우스로 잡을 만한 크기다",
        Object.keys(centers).length === 8 &&
        Object.values(centers).every((h) => h.size >= 8),
        Object.values(centers).map((h) => h.size.toFixed(1)).join(" · "));

      /* 손잡이가 요소의 변 · 모서리에 놓였는가 */
      const rect = (await rectsFor(page, frame, false, ["cvA"]))[byId("cvA")];

      check("손잡이가 요소의 네 변과 네 모서리에 놓인다",
        Math.abs(centers.nw.x - rect.left) <= 1 &&
        Math.abs(centers.nw.y - rect.top) <= 1 &&
        Math.abs(centers.se.x - rect.right) <= 1 &&
        Math.abs(centers.se.y - rect.bottom) <= 1 &&
        Math.abs(centers.n.x - (rect.left + rect.right) / 2) <= 1,
        `nw(${centers.nw.x.toFixed(1)},${centers.nw.y.toFixed(1)}) ` +
        `vs 요소(${rect.left.toFixed(1)},${rect.top.toFixed(1)})`);

      check("vendor 를 실제로 받아 왔다(고른 뒤에)",
        page.__vendorRequests.length > 0,
        String(page.__vendorRequests.length));

      /* --- 다중 선택 --- */

      await clickElement(page, frame, false, "cvB", { shift: true });
      await sleep(700);

      const multi = await readState(page);

      check("Shift 클릭으로 둘이 골라졌다",
        multi.count === 2, JSON.stringify(multi.ids));

      const multiFrame = await frameState(frame);

      check("★ 여럿을 고르면 잡을 수 있는 리사이즈 손잡이가 없다",
        multiFrame && multiFrame.resizeHandles === 0,
        multiFrame
          ? `${multiFrame.resizeHandles} 개 · ${multiFrame.resizeHandleDirections.join(",")}`
          : "state 없음");

      check("여럿을 고르면 좌표도 내려가지 않는다(그룹 조작 없음)",
        multi.geometry === null, JSON.stringify(multi.geometry));

      check("그룹 틀은 남아 있다",
        multiFrame && multiFrame.controlBoxes > 0,
        multiFrame ? String(multiFrame.controlBoxes) : "");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [resize] — 실제 포인터로 크기를 바꾼다
    ====================================================== */
    if (wants("resize")) {

      section("resize");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const before = await readCanvas(page);

      await pick(page, frame, false, "cvA");

      const view = await rectsFor(page, frame, false, ["cvA"]);
      const scale = view.__canvas.width / 390;

      /* --- 동쪽: width 만 늘고 x · y 는 그대로 --- */

      const eBefore = await resizeBy(page, frame, false, "cvA", "e", 60, 0);
      const eAfter = await handleCenters(page, frame, false);

      const afterE = await readCanvas(page);
      const boxE = boxOf(afterE, "cvA");

      const wantW = Math.round((90 + 60 / scale) * 1000) / 1000;

      check("동쪽 손잡이가 width 를 Canvas 좌표로 늘린다",
        boxE && Math.abs(boxE.width - wantW) <= 0.6,
        `${JSON.stringify(boxE)} (기대 width ~${wantW}, 배율 ${scale.toFixed(3)})`);

      check("동쪽 리사이즈는 x · y 를 바꾸지 않는다",
        boxE && boxE.x === 40 && boxE.y === 60,
        JSON.stringify(boxE));

      check("동쪽 리사이즈에서 height 는 그대로다",
        boxE && boxE.height === 60, String(boxE && boxE.height));

      check("★ 서쪽 변이 제자리다 (반대편 기준점)",
        near(eBefore.w, eAfter.w), gap(eBefore.w, eAfter.w));

      check("동쪽 변이 끈 만큼 갔다",
        Math.abs((eAfter.e.x - eBefore.e.x) - 60) <= 1.5,
        `${(eAfter.e.x - eBefore.e.x).toFixed(2)} (기대 60)`);

      check("소수점 셋째 자리까지만 저장된다",
        boxE &&
        String(boxE.width).replace(/^-?\d+\.?/, "").length <= 3,
        String(boxE.width));

      check("네 칸 밖은 그대로다 (rotation · props · 모르는 필드 zzz)",
        fingerprintOf(afterE, "cvA") === fingerprintOf(before, "cvA"),
        fingerprintOf(afterE, "cvA"));

      check("다른 요소는 손대지 않았다",
        JSON.stringify(elementOf(afterE, "cvB")) ===
        JSON.stringify(elementOf(before, "cvB")));

      check("요소 배열 순서가 그대로다",
        JSON.stringify(afterE.canvas.elements.map((el) => el.id)) ===
        JSON.stringify(CANVAS_ORDER));

      check("canvas · 항목의 모르는 칸이 보존됐다",
        afterE.canvas.extra === "unknown-canvas-field" &&
        afterE.note === "unknown-entry-field" &&
        afterE.canvas.baseWidth === 390 && afterE.canvas.baseHeight === 844);

      const regionsAfter = await readRegions(page);

      check("regions 의 다른 항목이 그대로다",
        JSON.stringify(regionsAfter[0]) ===
        JSON.stringify({ name: "some_other_region", enabled: true, payload: { keep: true } }),
        JSON.stringify(regionsAfter[0]));

      check("스킨 CSS 는 한 글자도 바뀌지 않았다",
        await page.evaluate(() => currentWorkingSkin.css) === CANVAS_CSS);

      /* --- 남쪽: height 만 늘고 x · y 는 그대로 --- */

      const sBefore = await resizeBy(page, frame, false, "cvA", "s", 0, 40);
      const sAfter = await handleCenters(page, frame, false);

      const boxS = boxOf(await readCanvas(page), "cvA");

      check("남쪽 손잡이가 height 를 늘린다",
        boxS && Math.abs(boxS.height - (60 + 40 / scale)) <= 0.6,
        JSON.stringify(boxS));

      check("남쪽 리사이즈는 x · y · width 를 바꾸지 않는다",
        boxS && boxS.x === boxE.x && boxS.y === boxE.y && boxS.width === boxE.width,
        JSON.stringify(boxS));

      check("★ 북쪽 변이 제자리다",
        near(sBefore.n, sAfter.n), gap(sBefore.n, sAfter.n));

      /* --- 서쪽 + 북쪽(nw): 반대쪽 모서리가 고정 --- */

      const nwBefore = await resizeBy(page, frame, false, "cvA", "nw", -30, -20);
      const nwAfter = await handleCenters(page, frame, false);

      const boxNW = boxOf(await readCanvas(page), "cvA");

      check("nw 손잡이가 x · y 를 줄이고 크기를 늘린다",
        boxNW &&
        boxNW.x < boxS.x && boxNW.y < boxS.y &&
        boxNW.width > boxS.width && boxNW.height > boxS.height,
        JSON.stringify(boxNW));

      check("★ se 모서리가 제자리다 (반대편 기준점)",
        near(nwBefore.se, nwAfter.se), gap(nwBefore.se, nwAfter.se));

      check("nw 리사이즈가 x · width 를 짝으로 바꾼다 (오른쪽 변 유지)",
        Math.abs((boxNW.x + boxNW.width) - (boxS.x + boxS.width)) <= 0.8,
        `${(boxNW.x + boxNW.width).toFixed(3)} vs ${(boxS.x + boxS.width).toFixed(3)}`);

      /* --- se: 왼쪽 위 모서리 고정 --- */

      const seBefore = await resizeBy(page, frame, false, "cvA", "se", 25, 25);
      const seAfter = await handleCenters(page, frame, false);

      const boxSE = boxOf(await readCanvas(page), "cvA");

      check("se 손잡이는 x · y 를 바꾸지 않고 크기만 늘린다",
        boxSE &&
        boxSE.x === boxNW.x && boxSE.y === boxNW.y &&
        boxSE.width > boxNW.width && boxSE.height > boxNW.height,
        JSON.stringify(boxSE));

      check("★ nw 모서리가 제자리다",
        near(seBefore.nw, seAfter.nw), gap(seBefore.nw, seAfter.nw));

      /* --- 최소 크기 --- */

      await pick(page, frame, false, "cvB");

      await resizeBy(page, frame, false, "cvB", "w", 4000, 0);

      const tiny = boxOf(await readCanvas(page), "cvB");

      check("★ 아무리 줄여도 width 는 1 이상이다",
        tiny && tiny.width >= 1,
        JSON.stringify(tiny));

      /* --- 도화지 밖으로 나가도 되돌리지 않는다 --- */

      await pick(page, frame, false, "cvA");

      const outBefore = boxOf(await readCanvas(page), "cvA");

      /* 왼쪽 변을 도화지 바깥까지 끈다 */
      await resizeBy(page, frame, false, "cvA", "w", -(outBefore.x + 40) * scale, 0);

      const out = boxOf(await readCanvas(page), "cvA");

      check("★ 도화지 밖으로 나간 x 를 자동으로 되돌리지 않는다",
        out && out.x < 0,
        `${JSON.stringify(out)} (시작 x ${outBefore.x})`);

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [rotate] — 회전한 요소의 반대편 기준점
    ====================================================== */
    if (wants("rotate")) {

      section("rotate");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const before = await readCanvas(page);

      for (const [id, degrees] of [["cvRot20", 20], ["cvRot45", 45]]) {

        await pick(page, frame, false, id);

        /* --- 동쪽: 서쪽 변이 고정 --- */

        const eBefore = await resizeBy(page, frame, false, id, "e", 50, 0);
        const eAfter = await handleCenters(page, frame, false);

        const box = boxOf(await readCanvas(page), id);
        const el = elementOf(await readCanvas(page), id);

        check(`${degrees}° 요소도 width 가 늘어난다`,
          box && box.width > 90, JSON.stringify(box));

        check(`${degrees}° 요소의 rotation 이 그대로다`,
          el && el.rotation === degrees, String(el && el.rotation));

        check(`★ ${degrees}° 에서 서쪽 변이 제자리다`,
          near(eBefore.w, eAfter.w, 1.5), gap(eBefore.w, eAfter.w));

        check(`${degrees}° 에서 x · y 가 함께 움직인다(중심 회전 보정)`,
          box && (box.x !== 60 || box.y !== (id === "cvRot20" ? 200 : 340)),
          JSON.stringify(box));

        /* --- nw: se 모서리가 고정 --- */

        const nwBefore = await resizeBy(page, frame, false, id, "nw", -20, -20);
        const nwAfter = await handleCenters(page, frame, false);

        check(`★ ${degrees}° 에서 se 모서리가 제자리다`,
          near(nwBefore.se, nwAfter.se, 1.5), gap(nwBefore.se, nwAfter.se));

        const rotTransform = await page.evaluate((sel) => {
          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          const node = doc.querySelector(sel);
          return node ? getComputedStyle(node).transform : null;
        }, byId(id));

        check(`${degrees}° 회전이 화면에서도 살아 있다`,
          typeof rotTransform === "string" && rotTransform.indexOf("matrix") === 0,
          rotTransform);

      }

      const after = await readCanvas(page);

      check("회전 요소의 네 칸 밖이 그대로다",
        fingerprintOf(after, "cvRot20") === fingerprintOf(before, "cvRot20") &&
        fingerprintOf(after, "cvRot45") === fingerprintOf(before, "cvRot45"));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [auto] — height:"auto" 는 언제 숫자가 되는가
    ====================================================== */
    if (wants("auto")) {

      section("auto");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      /* --- 좌우 손잡이: auto 유지 --- */

      await pick(page, frame, false, "cvAuto");

      const autoStart = boxOf(await readCanvas(page), "cvAuto");

      check('시작은 height:"auto" 다',
        autoStart && autoStart.height === "auto", JSON.stringify(autoStart));

      const eBefore = await resizeBy(page, frame, false, "cvAuto", "e", 50, 0);
      const eAfter = await handleCenters(page, frame, false);

      const afterE = boxOf(await readCanvas(page), "cvAuto");

      check('★ 동쪽 손잡이는 width 만 바꾸고 "auto" 를 유지한다',
        afterE && afterE.height === "auto" && afterE.width > autoStart.width,
        JSON.stringify(afterE));

      check("동쪽 auto 리사이즈에서 x · y 도 그대로다",
        afterE && afterE.x === autoStart.x && afterE.y === autoStart.y,
        JSON.stringify(afterE));

      check("auto 요소에서도 서쪽 변이 제자리다",
        near(eBefore.w, eAfter.w), gap(eBefore.w, eAfter.w));

      /* 폭이 늘면 줄바꿈이 달라져 실제 높이는 브라우저가 다시 잡는다 */
      const domHeight = await page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const node = doc.querySelector(sel);
        return node ? node.style.getPropertyValue("--imory-canvas-height") : null;
      }, byId("cvAuto"));

      check('★ "auto" 인 동안 높이 칸을 화면에도 쓰지 않는다',
        domHeight === "", `"${domHeight}"`);

      /* --- 서쪽 손잡이: 여전히 auto --- */

      await resizeBy(page, frame, false, "cvAuto", "w", -30, 0);

      const afterW = boxOf(await readCanvas(page), "cvAuto");

      check('서쪽 손잡이도 "auto" 를 유지한다',
        afterW && afterW.height === "auto" && afterW.x < afterE.x,
        JSON.stringify(afterW));

      /* --- 단순 클릭 · 0 변화 --- */

      const beforeClickHistory = await historyState(page);

      const centers = await handleCenters(page, frame, false);

      await page.mouse.move(centers.s.x, centers.s.y);
      await page.mouse.down();
      await page.mouse.up();
      await sleep(700);

      const afterClick = boxOf(await readCanvas(page), "cvAuto");

      check('★ 손잡이를 그냥 누르기만 하면 "auto" 가 그대로다',
        afterClick && afterClick.height === "auto",
        JSON.stringify(afterClick));

      check("0 변화는 기록을 만들지 않는다",
        (await historyState(page)).undo === beforeClickHistory.undo,
        `${beforeClickHistory.undo} → ${(await historyState(page)).undo}`);

      /* --- 남쪽 손잡이: 숫자로 전환 --- */

      const sBefore = await resizeBy(page, frame, false, "cvAuto", "s", 0, 45);
      const sAfter = await handleCenters(page, frame, false);

      const afterS = boxOf(await readCanvas(page), "cvAuto");

      /* 시작 높이는 화면에서 잰 값이라 정확한 상수를 기대할 수 없다 —
         "숫자가 됐고, 늘어난 만큼 늘었다"를 본다 */
      const grew =
        (sAfter.s.y - sBefore.s.y);

      check('★ 남쪽 손잡이가 "auto" 를 숫자 높이로 바꾼다',
        afterS && typeof afterS.height === "number" && afterS.height > 0,
        JSON.stringify(afterS));

      check("남쪽 전환에서 x · y · width 는 그대로다",
        afterS &&
        afterS.x === afterW.x && afterS.y === afterW.y &&
        afterS.width === afterW.width,
        JSON.stringify(afterS));

      check("남쪽 변이 끈 만큼 갔다",
        Math.abs(grew - 45) <= 2, `${grew.toFixed(2)} (기대 45)`);

      check("★ 북쪽 변은 제자리다",
        near(sBefore.n, sAfter.n), gap(sBefore.n, sAfter.n));

      const fixedMode = await page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const node = doc.querySelector(sel);
        return node
          ? {
              attr: node.getAttribute("data-imory-canvas-height"),
              value: node.style.getPropertyValue("--imory-canvas-height")
            }
          : null;
      }, byId("cvAuto"));

      check("숫자가 된 뒤에는 화면도 고정 높이로 그린다",
        fixedMode && fixedMode.attr === "fixed" && fixedMode.value.endsWith("%"),
        JSON.stringify(fixedMode));

      /* --- 모서리 손잡이도 숫자로 전환 --- */

      await pick(page, frame, false, "cvAuto2");

      const auto2Start = boxOf(await readCanvas(page), "cvAuto2");

      const seBefore = await resizeBy(page, frame, false, "cvAuto2", "se", 30, 30);
      const seAfter = await handleCenters(page, frame, false);

      const afterSE = boxOf(await readCanvas(page), "cvAuto2");

      check('★ 모서리 손잡이도 "auto" 를 숫자로 바꾼다',
        afterSE && typeof afterSE.height === "number" &&
        afterSE.width > auto2Start.width,
        JSON.stringify(afterSE));

      check("모서리 전환에서도 nw 모서리가 제자리다",
        near(seBefore.nw, seAfter.nw), gap(seBefore.nw, seAfter.nw));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [view] — 도화지 폭 · 부모 scale · Preview 내부 scroll
    ====================================================== */
    if (wants("view")) {

      section("view");

      /* --- 좁은 도화지(60%) --- */
      {
        const page = await openStudio(browser, { narrow: true });
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await pick(page, frame, false, "cvA");

        const view = await rectsFor(page, frame, false, ["cvA"]);
        const scale = view.__canvas.width / 390;

        await resizeBy(page, frame, false, "cvA", "e", 50, 0);

        const box = boxOf(await readCanvas(page), "cvA");

        check("좁은 도화지에서도 픽셀이 Canvas 좌표로 환산된다",
          box && Math.abs(box.width - (90 + 50 / scale)) <= 0.8,
          `${JSON.stringify(box)} (배율 ${scale.toFixed(3)})`);

        check("배율이 1 이 아니다(이 절이 의미 있으려면)",
          Math.abs(scale - 1) > 0.05, scale.toFixed(3));

        await close(page);
      }

      /* --- 부모 scale(0.8) --- */
      {
        const page = await openStudio(browser, { scale: 0.8 });
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await pick(page, frame, false, "cvA");

        const view = await rectsFor(page, frame, false, ["cvA"]);
        const scale = view.__canvas.width / 390;

        const eBefore = await resizeBy(page, frame, false, "cvA", "e", 48, 0);
        const eAfter = await handleCenters(page, frame, false);

        const box = boxOf(await readCanvas(page), "cvA");

        check("부모 scale 이 있어도 같은 계산이다(두 번 보정하지 않는다)",
          box && Math.abs(box.width - (90 + 48 / scale)) <= 0.8,
          `${JSON.stringify(box)} (배율 ${scale.toFixed(3)})`);

        check("부모 scale 에서도 서쪽 변이 제자리다",
          near(eBefore.w, eAfter.w), gap(eBefore.w, eAfter.w));

        await close(page);
      }

      /* --- Preview 내부 scroll --- */
      {
        const page = await openStudio(browser, {});
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await pick(page, frame, false, "cvFar");

        const scrolled = await page.evaluate(() => {
          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          return doc.defaultView.scrollY;
        });

        check("Preview 안이 실제로 스크롤됐다", scrolled > 50, String(scrolled));

        const view = await rectsFor(page, frame, false, ["cvFar"]);
        const scale = view.__canvas.width / 390;

        const eBefore = await resizeBy(page, frame, false, "cvFar", "e", 40, 0);
        const eAfter = await handleCenters(page, frame, false);

        const box = boxOf(await readCanvas(page), "cvFar");

        check("스크롤 뒤에도 손잡이 자리와 좌표가 맞는다",
          box && Math.abs(box.width - (120 + 40 / scale)) <= 0.8,
          JSON.stringify(box));

        check("스크롤 뒤에도 서쪽 변이 제자리다",
          near(eBefore.w, eAfter.w), gap(eBefore.w, eAfter.w));

        check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

        await close(page);
      }

    }


    /* ======================================================
       [undo] — 한 제스처 = 한 칸
    ====================================================== */
    if (wants("undo")) {

      section("undo");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      const start = await historyState(page);

      await resizeBy(page, frame, false, "cvA", "se", 40, 30);

      const oneGesture = await historyState(page);
      const afterResize = boxOf(await readCanvas(page), "cvA");

      check("한 번의 리사이즈가 Undo 한 칸이다",
        oneGesture.undo === start.undo + 1,
        `${start.undo} → ${oneGesture.undo}`);

      /* --- Undo --- */

      await page.click("#studioUndoButton");
      await sleep(900);

      const undone = boxOf(await readCanvas(page), "cvA");

      check("Undo 가 리사이즈 전 네 칸으로 돌린다",
        undone.x === 40 && undone.y === 60 &&
        undone.width === 90 && undone.height === 60,
        JSON.stringify(undone));

      const keptSelection = await readState(page);

      check("Undo 뒤에도 선택이 그대로다",
        keptSelection.count === 1 && keptSelection.ids[0] === "cvA",
        JSON.stringify(keptSelection.ids));

      check("Undo 뒤 geometry 도 크기까지 다시 내려갔다",
        !!keptSelection.geometry &&
        keptSelection.geometry.width === 90 &&
        keptSelection.geometry.height === 60,
        JSON.stringify(keptSelection.geometry));

      const again = await waitForHandles(page, frame, 8);

      check("Undo 뒤 새 DOM 에 손잡이가 다시 붙는다",
        again && again.resizeHandles === 8 && again.draggable === true,
        again ? `${again.resizeHandles} · ${again.dragGate}` : "state 없음");

      /* --- Redo --- */

      await page.click("#studioRedoButton");
      await sleep(900);

      const redone = boxOf(await readCanvas(page), "cvA");

      check("Redo 가 리사이즈 뒤 값으로 돌아온다",
        JSON.stringify(redone) === JSON.stringify(afterResize),
        `${JSON.stringify(redone)} vs ${JSON.stringify(afterResize)}`);

      /* --- auto → 숫자 → Undo --- */

      await pick(page, frame, false, "cvAuto");

      const autoBefore = boxOf(await readCanvas(page), "cvAuto");

      await resizeBy(page, frame, false, "cvAuto", "s", 0, 40);

      const converted = boxOf(await readCanvas(page), "cvAuto");

      check('auto 가 숫자로 바뀌었다(Undo 대상 준비)',
        typeof converted.height === "number", JSON.stringify(converted));

      await page.click("#studioUndoButton");
      await sleep(900);

      const restored = boxOf(await readCanvas(page), "cvAuto");

      check('★ Undo 하면 정확히 "auto" 로 돌아간다',
        restored && restored.height === "auto" &&
        JSON.stringify(restored) === JSON.stringify(autoBefore),
        JSON.stringify(restored));

      const restoredDom = await page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const node = doc.querySelector(sel);
        return node ? node.getAttribute("data-imory-canvas-height") : null;
      }, byId("cvAuto"));

      check('Undo 뒤 화면도 다시 "auto" 로 그린다',
        restoredDom === "auto", String(restoredDom));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [round] — 저장 왕복
    ====================================================== */
    if (wants("round")) {

      section("round");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      await resizeBy(page, frame, false, "cvA", "se", 55, 35);

      /* auto → 숫자 도 함께 태운다 */
      await pick(page, frame, false, "cvAuto");
      await resizeBy(page, frame, false, "cvAuto", "s", 0, 30);

      /* auto 그대로인 것도 하나 남긴다 */
      await pick(page, frame, false, "cvAuto2");
      await resizeBy(page, frame, false, "cvAuto2", "e", 30, 0);

      const resized = boxOf(await readCanvas(page), "cvA");
      const convertedAuto = boxOf(await readCanvas(page), "cvAuto");
      const keptAuto = boxOf(await readCanvas(page), "cvAuto2");

      check("세 경우가 준비됐다(숫자 · auto→숫자 · auto 유지)",
        typeof resized.height === "number" &&
        typeof convertedAuto.height === "number" &&
        keptAuto.height === "auto",
        JSON.stringify([resized.height, convertedAuto.height, keptAuto.height]));

      /* --- 입력 non-mutation --- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const a = entry.canvas.elements.find((e) => e.id === "cvA");
        const auto = entry.canvas.elements.find((e) => e.id === "cvAuto");
        return { w: a.width, h: a.height, autoH: auto.height };
      });

      check("들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.w === 90 && untouched.h === 60 && untouched.autoH === "auto",
        JSON.stringify(untouched));

      /* --- Export → Import --- */

      const roundTrip = await page.evaluate(async () => {

        const exported =
          window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) {
          return { ok: false, message: exported.message };
        }

        const text =
          window.serializeSkinPackageExport(exported.skinPackage);

        const result =
          await window.validateSkinPackageImport(text);

        if (!result.ok) {
          return { ok: false, message: result.message };
        }

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const pickEl = (id) =>
          entry ? entry.canvas.elements.find((e) => e.id === id) : null;

        const a = pickEl("cvA");
        const auto = pickEl("cvAuto");
        const auto2 = pickEl("cvAuto2");

        return {
          ok: true,
          a: a ? { x: a.x, y: a.y, width: a.width, height: a.height } : null,
          autoH: auto ? auto.height : null,
          auto2H: auto2 ? auto2.height : null,
          zzz: a ? JSON.stringify(a.zzz) : null,
          other: JSON.stringify(
            (result.skinPackage.regions || []).find((r) => r && r.name === "some_other_region")
          )
        };

      });

      check("Export → Import 를 지나도 네 칸이 같다",
        roundTrip.ok && JSON.stringify(roundTrip.a) === JSON.stringify(resized),
        JSON.stringify(roundTrip));

      check('Export → Import 가 "auto" 와 숫자를 구분해서 남긴다',
        roundTrip.ok &&
        roundTrip.autoH === convertedAuto.height &&
        roundTrip.auto2H === "auto",
        JSON.stringify([roundTrip.autoH, roundTrip.auto2H]));

      check("Export → Import 에서 모르는 필드도 남는다",
        roundTrip.ok && roundTrip.zzz === JSON.stringify({ keep: "unknown-field" }),
        String(roundTrip.zzz));

      /* --- Publish 용 resolve --- */

      const resolved = await page.evaluate(() => {

        const payload =
          window.resolveSkinHomeCanvas(
            currentWorkingSkin,
            currentWorkingSkin.templates.home.html
          );

        const pickEl = (id) =>
          payload ? payload.elements.find((e) => e.id === id) : null;

        const a = pickEl("cvA");
        const auto2 = pickEl("cvAuto2");

        return {
          a: a ? { x: a.x, y: a.y, width: a.width, height: a.height } : null,
          auto2H: auto2 ? auto2.height : null
        };

      });

      check("Publish 이 쓰는 resolve 에서도 같은 네 칸이다",
        resolved && JSON.stringify(resolved.a) === JSON.stringify(resized) &&
        resolved.auto2H === "auto",
        JSON.stringify(resolved));

      /* --- Save → 다시 열기 --- */

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const saved = await page.evaluate(() => {

        const calls = window.__savedDraftCallsLay;
        const content = calls[calls.length - 1].p_content;
        const entry = (content.regions || []).find((r) => r && r.name === "home_canvas");
        const el = entry ? entry.canvas.elements.find((e) => e.id === "cvA") : null;

        return {
          content: content,
          box: el ? { x: el.x, y: el.y, width: el.width, height: el.height } : null
        };

      });

      check("Save 가 보낸 content 에 새 네 칸이 있다",
        JSON.stringify(saved.box) === JSON.stringify(resized),
        JSON.stringify(saved.box));

      await close(page);

      /* 저장된 content 로 Studio 를 다시 연다 */
      const reopened = await openStudio(browser, { package: saved.content });

      await canvasFrame(reopened, false);

      const reloaded = boxOf(await readCanvas(reopened), "cvA");

      check("저장된 draft 로 다시 열면 그 크기다",
        JSON.stringify(reloaded) === JSON.stringify(resized),
        JSON.stringify(reloaded));

      const drawn = await reopened.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        return el
          ? {
              width: el.style.getPropertyValue("--imory-canvas-width"),
              height: el.style.getPropertyValue("--imory-canvas-height")
            }
          : null;
      }, byId("cvA"));

      check("다시 연 화면이 그 크기를 실제로 그린다",
        drawn && drawn.width.endsWith("%") &&
        Math.abs(parseFloat(drawn.width) - (resized.width / 390 * 100)) < 0.001,
        JSON.stringify(drawn));

      const autoDrawn = await reopened.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        return el ? el.getAttribute("data-imory-canvas-height") : null;
      }, byId("cvAuto2"));

      check('다시 연 화면에서 "auto" 요소는 여전히 auto 다',
        autoDrawn === "auto", String(autoDrawn));

      await close(reopened);

    }


    /* ======================================================
       [reject] — 부모가 되짚어 본다
    ====================================================== */
    if (wants("reject")) {

      section("reject");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      const before = await readCanvas(page);
      const startHistory = await historyState(page);
      const gen = (await readState(page)).generation;

      const base = { x: 40, y: 60, width: 90, height: 60 };

      const unchanged = async (label, request, detail) => {

        const answer = await commit(page, request);

        const after = await readCanvas(page);

        check(label,
          answer.accepted === false &&
          JSON.stringify(after) === JSON.stringify(before) &&
          (await historyState(page)).undo === startHistory.undo,
          `${answer.reason}${detail ? " · " + detail : ""}`);

      };

      await unchanged("stale 순번은 거부된다", {
        kind: "resize", id: "cvA", expected: base,
        next: { ...base, width: 200 }, generation: gen - 1, requestId: 1
      });

      await unchanged("미래 순번도 거부된다", {
        kind: "resize", id: "cvA", expected: base,
        next: { ...base, width: 200 }, generation: gen + 5, requestId: 1
      });

      await unchanged("expected 가 어긋나면 거부된다", {
        kind: "resize", id: "cvA", expected: { ...base, width: 999 },
        next: { ...base, width: 200 }, generation: gen, requestId: 1
      });

      await unchanged("★ next 에 모르는 키가 섞이면 전체가 거부된다", {
        kind: "resize", id: "cvA", expected: base,
        next: { ...base, width: 200, rotation: 30 }, generation: gen, requestId: 1
      }, "조용히 골라 담지 않는다");

      await unchanged("★ next 에서 칸이 빠지면 거부된다", {
        kind: "resize", id: "cvA", expected: base,
        next: { x: 40, y: 60, width: 200 }, generation: gen, requestId: 1
      });

      await unchanged("0 이하의 크기는 거부된다", {
        kind: "resize", id: "cvA", expected: base,
        next: { ...base, width: 0 }, generation: gen, requestId: 1
      });

      await unchanged("상한을 넘는 크기는 거부된다", {
        kind: "resize", id: "cvA", expected: base,
        next: { ...base, width: 1e9 }, generation: gen, requestId: 1
      });

      await unchanged("유한하지 않은 크기는 거부된다", {
        kind: "resize", id: "cvA", expected: base,
        next: { ...base, height: null }, generation: gen, requestId: 1
      });

      await unchanged('★ shape 은 height:"auto" 를 쓸 수 없다', {
        kind: "resize", id: "cvA", expected: base,
        next: { ...base, height: "auto" }, generation: gen, requestId: 1
      }, "auto 는 text · category_nav 만 (계약 §6)");

      /* ★ `rotate` 는 TRANSFORM-1C 에서 **이름이 생겼다**. 그래도 이
         모양(네 칸)으로는 여전히 거부된다 — kind 마다 소유하는
         모양이 하나이기 때문이다. 아직 이름이 없는 것은 `scale` 이다. */
      await unchanged("모르는 kind 는 거부된다", {
        kind: "scale", id: "cvA", expected: base,
        next: { ...base, width: 200 }, generation: gen, requestId: 1
      });

      await unchanged("★ kind 만 rotate 로 바꿔 달아도 거부된다", {
        kind: "rotate", id: "cvA", expected: base,
        next: { ...base, width: 200 }, generation: gen, requestId: 1
      }, "rotate 가 소유하는 것은 각도 한 칸이다");

      await unchanged("고르지 않은 요소는 거부된다", {
        kind: "resize", id: "cvB",
        expected: { x: 250, y: 60, width: 80, height: 50 },
        next: { x: 250, y: 60, width: 150, height: 50 },
        generation: gen, requestId: 1
      });

      await unchanged("없는 요소는 거부된다", {
        kind: "resize", id: "cvNope", expected: base,
        next: { ...base, width: 200 }, generation: gen, requestId: 1
      });

      /* --- 잠긴 · 숨긴 요소는 애초에 고를 수 없다 --- */

      await clickElement(page, frame, false, "cvLocked");
      await sleep(600);

      const lockedPick = await readState(page);

      check("잠긴 요소는 클릭으로 골라지지 않는다",
        lockedPick.ids.indexOf("cvLocked") === -1,
        JSON.stringify(lockedPick.ids));

      await unchanged("잠긴 요소의 확정은 거부된다", {
        kind: "resize", id: "cvLocked",
        expected: { x: 40, y: 560, width: 120, height: 80 },
        next: { x: 40, y: 560, width: 200, height: 80 },
        generation: (await readState(page)).generation, requestId: 1
      });

      await unchanged("숨긴 요소의 확정은 거부된다", {
        kind: "resize", id: "cvHidden",
        expected: { x: 220, y: 560, width: 80, height: 50 },
        next: { x: 220, y: 560, width: 150, height: 50 },
        generation: (await readState(page)).generation, requestId: 1
      });

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [cancel] — 취소하면 아무 일도 없었던 것이 된다
    ====================================================== */
    if (wants("cancel")) {

      section("cancel");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      const before = await readCanvas(page);
      const startHistory = await historyState(page);

      /* --- Escape --- */

      const centers = await handleCenters(page, frame, false);

      await page.mouse.move(centers.e.x, centers.e.y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i += 1) {
        await page.mouse.move(centers.e.x + 10 * i, centers.e.y);
        await sleep(20);
      }

      const midWidth = await page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        return el ? el.style.getPropertyValue("--imory-canvas-width") : null;
      }, byId("cvA"));

      await page.keyboard.press("Escape");
      await sleep(400);
      await page.mouse.up();
      await sleep(700);

      const afterEscape = await readCanvas(page);

      check("끄는 동안 화면은 실제로 커졌다(취소 전)",
        typeof midWidth === "string" &&
        Math.abs(parseFloat(midWidth) - (90 / 390 * 100)) > 0.5,
        String(midWidth));

      check("Escape 는 JSON 을 그대로 둔다",
        JSON.stringify(afterEscape) === JSON.stringify(before));

      check("Escape 는 기록도 만들지 않는다",
        (await historyState(page)).undo === startHistory.undo);

      const restoredWidth = await page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        return el ? el.style.getPropertyValue("--imory-canvas-width") : null;
      }, byId("cvA"));

      check("Escape 는 화면도 원래 크기로 되돌린다",
        typeof restoredWidth === "string" &&
        Math.abs(parseFloat(restoredWidth) - (90 / 390 * 100)) < 0.001,
        String(restoredWidth));

      const keptSelection = await readState(page);

      check("★ Escape 로 선택이 풀리지는 않는다",
        keptSelection.count === 1 && keptSelection.ids[0] === "cvA",
        JSON.stringify(keptSelection.ids));

      /* --- 끄는 도중 선택 해제 --- */

      const c2 = await handleCenters(page, frame, false);

      await page.mouse.move(c2.se.x, c2.se.y);
      await page.mouse.down();
      for (let i = 1; i <= 5; i += 1) {
        await page.mouse.move(c2.se.x + 8 * i, c2.se.y + 8 * i);
        await sleep(20);
      }

      await page.evaluate(() => window.clearStudioCanvasSelection());
      await sleep(300);

      await page.mouse.up();
      await sleep(700);

      check("끄는 도중 선택이 풀리면 확정하지 않는다",
        JSON.stringify(await readCanvas(page)) === JSON.stringify(before) &&
        (await historyState(page)).undo === startHistory.undo,
        JSON.stringify(boxOf(await readCanvas(page), "cvA")));

      /* --- 끄는 도중 Select 끄기 ---

         ★ 버튼을 누르지 않고 프로그램으로 끈다. 포인터가 눌려 있는
           동안 page.click 을 하면 Playwright 가 포인터를 그 버튼
           자리로 **옮기므로**, 진행 중인 리사이즈가 그 자리까지
           따라가 무엇이 취소를 시켰는지 알 수 없게 된다(2026-09-21:
           그렇게 재다가 width 가 최소값까지 줄어든 것을 "확정됐다"로
           읽었다). 위 clearStudioCanvasSelection 과 같은 결이다. */

      await pick(page, frame, false, "cvA");

      const c3 = await handleCenters(page, frame, false);

      await page.mouse.move(c3.e.x, c3.e.y);
      await page.mouse.down();
      for (let i = 1; i <= 5; i += 1) {
        await page.mouse.move(c3.e.x + 8 * i, c3.e.y);
        await sleep(20);
      }

      await page.evaluate(() => window.setStudioInspectorEnabled(false));
      await sleep(300);

      await page.mouse.up();
      await sleep(700);

      check("끄는 도중 Select 를 끄면 확정하지 않는다",
        JSON.stringify(await readCanvas(page)) === JSON.stringify(before),
        JSON.stringify(boxOf(await readCanvas(page), "cvA")));

      const off = await frameState(frame);

      check("Select 를 끄면 손잡이도 사라진다",
        off && off.resizeHandles === 0 && off.editing === false,
        off ? `${off.resizeHandles} · editing=${off.editing}` : "state 없음");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [gesture] — 손잡이가 늘어도 이전 제스처는 그대로다
    ====================================================== */
    if (wants("gesture")) {

      section("gesture");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      /* --- 본체 끌기(이동) 회귀 --- */

      const before = boxOf(await readCanvas(page), "cvA");

      await dragElement(page, frame, false, "cvA", 40, 25);

      const moved = boxOf(await readCanvas(page), "cvA");

      check("요소 본체를 끌면 여전히 이동이다(크기는 그대로)",
        moved &&
        moved.x > before.x && moved.y > before.y &&
        moved.width === before.width && moved.height === before.height,
        JSON.stringify(moved));

      const afterMove = await frameState(frame);

      check("이동 확정이 승인으로 끝났다",
        afterMove && afterMove.lastSettle === "accepted" &&
        afterMove.lastCommit && afterMove.lastCommit.kind === "move",
        afterMove ? `${afterMove.lastSettle} · ${afterMove.lastCommit.kind}` : "");

      /* --- 손잡이에서 시작한 끌기는 lasso 가 아니다 --- */

      const lassoBefore = (await frameState(frame)).lassoCount;

      await resizeBy(page, frame, false, "cvA", "e", 30, 0);

      const afterResize = await frameState(frame);

      check("★ 손잡이를 끌어도 lasso 는 시작되지 않는다",
        afterResize.lassoCount === lassoBefore,
        `${lassoBefore} → ${afterResize.lassoCount} · ${afterResize.lastGate}`);

      check("리사이즈 확정이 승인으로 끝났다",
        afterResize.lastSettle === "accepted" &&
        afterResize.lastCommit.kind === "resize",
        `${afterResize.lastSettle} · ${afterResize.lastCommit.kind}`);

      check("★ 손잡이를 눌러도 선택이 유지된다",
        (await readState(page)).ids.join() === "cvA",
        JSON.stringify((await readState(page)).ids));

      /* --- 빈 도화지 lasso 회귀 ---

         ★ 빈 자리를 **재어서** 고른다. cvA 는 이 절에서 이미 옮겨지고
           커졌으므로 "요소 오른쪽에서 얼마" 같은 상대 좌표는 옆
           요소와 겹칠 수 있다(2026-09-21: 그렇게 잡았다가 `canvas-element`
           관문에 걸렸다). 두 줄 사이의 가로 띠는 fixture 가 비워
           두었으니 그 띠의 가운데를 쓴다. */

      const gapRects =
        await rectsFor(page, frame, false, ["cvA", "cvB", "cvRot20"]);

      const bandTop =
        Math.max(gapRects[byId("cvA")].bottom, gapRects[byId("cvB")].bottom);

      const bandY =
        (bandTop + gapRects[byId("cvRot20")].top) / 2;

      check("두 줄 사이에 빈 띠가 있다",
        gapRects[byId("cvRot20")].top - bandTop > 30,
        `${bandTop.toFixed(1)} ~ ${gapRects[byId("cvRot20")].top.toFixed(1)}`);

      await dragFrom(
        page,
        { x: gapRects.__canvas.left + gapRects.__canvas.width * 0.5, y: bandY },
        { x: gapRects.__canvas.left + gapRects.__canvas.width * 0.8, y: bandY + 10 }
      );

      const afterLasso = await frameState(frame);

      check("빈 도화지에서는 여전히 lasso 가 시작된다",
        afterLasso.lassoCount === lassoBefore + 1,
        `${afterLasso.lassoCount} · ${afterLasso.lastGate}`);

      /* --- 손가락 --- */

      await close(page);

      const touchPage = await openStudio(browser, {
        hasTouch: true,
        viewport: { width: 420, height: 860 }
      });

      const touchFrame = await canvasFrame(touchPage, false);

      await enableCanvasEditing(touchPage);
      await pick(touchPage, touchFrame, false, "cvA");

      const touchBefore = boxOf(await readCanvas(touchPage), "cvA");

      const touchHandles = await handleCenters(touchPage, touchFrame, false);

      await touchPage.touchscreen.tap(touchHandles.e.x, touchHandles.e.y);
      await sleep(500);

      const dispatched = await touchPage.evaluate(
        ([sel, x, y]) => {

          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          const node = doc.querySelector(sel);
          const frameEl = document.getElementById("studioPreviewFrame");
          const fb = frameEl.getBoundingClientRect();

          const touch = (type, cx, cy) => {

            const t = new doc.defaultView.Touch({
              identifier: 7,
              target: node,
              clientX: cx - fb.left,
              clientY: cy - fb.top
            });

            return node.dispatchEvent(
              new doc.defaultView.TouchEvent(type, {
                bubbles: true, cancelable: true,
                touches: type === "touchend" ? [] : [t],
                targetTouches: type === "touchend" ? [] : [t],
                changedTouches: [t]
              })
            );

          };

          touch("touchstart", x, y);

          /* ★ 반환값이 답이다 — 합성 touchmove 로는 실제 스크롤이
             일어나지 않으므로 scrollY 로는 아무것도 증명할 수 없다.
             "취소되지 않았다" = preventDefault 되지 않았다. */
          const notCancelled = touch("touchmove", x + 50, y);

          touch("touchend", x + 50, y);

          return notCancelled;

        },
        [byId("cvA"), touchHandles.e.x, touchHandles.e.y]
      );

      const touchAfter = boxOf(await readCanvas(touchPage), "cvA");

      check("★ 손가락으로는 리사이즈가 시작되지 않는다",
        JSON.stringify(touchAfter) === JSON.stringify(touchBefore),
        JSON.stringify(touchAfter));

      check("★ touchmove 가 preventDefault 되지 않는다(스크롤이 살아 있다)",
        dispatched === true, String(dispatched));

      const touchState = await frameState(touchFrame);

      check("손가락 탭 선택은 그대로다",
        (await readState(touchPage)).ids.join() === "cvA",
        JSON.stringify((await readState(touchPage)).ids));

      check("pageerror 0(touch)", touchPage.__errors.length === 0,
        touchPage.__errors[0] || "");

      await close(touchPage);

    }


    /* ======================================================
       [sandbox] — 별도 origin 에서 같은 결과
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);
      await clickElement(page, frame, true, "cvA");

      const ready = await waitForHandles(page, frame, 8);

      check("sandbox 프레임에도 손잡이 여덟이 붙는다",
        ready && ready.resizeHandles === 8 && ready.resizeHandleHit === 8,
        ready ? `${ready.resizeHandles} · hit ${ready.resizeHandleHit}` : "state 없음");

      const before = await readCanvas(page);

      const view = await rectsFor(page, frame, true, ["cvA"]);
      const scale = view.__canvas.width / 390;

      const eBefore = await resizeBy(page, frame, true, "cvA", "e", 60, 0);
      const eAfter = await handleCenters(page, frame, true);

      const after = await readCanvas(page);
      const box = boxOf(after, "cvA");

      check("sandbox 에서 손잡이를 끌면 Canvas JSON 이 바뀐다",
        box && Math.abs(box.width - (90 + 60 / scale)) <= 1,
        `${JSON.stringify(box)} (배율 ${scale.toFixed(3)})`);

      check("sandbox 에서도 x · y 는 그대로다",
        box && box.x === 40 && box.y === 60, JSON.stringify(box));

      check("sandbox 에서도 서쪽 변이 제자리다",
        near(eBefore.w, eAfter.w, 1.5), gap(eBefore.w, eAfter.w));

      check("sandbox 에서도 네 칸 밖은 그대로다",
        fingerprintOf(after, "cvA") === fingerprintOf(before, "cvA"));

      check("sandbox 에서도 다른 요소는 그대로다",
        JSON.stringify(elementOf(after, "cvB")) ===
        JSON.stringify(elementOf(before, "cvB")));

      check("sandbox 에서도 한 제스처가 Undo 한 칸이다",
        (await historyState(page)).undo === 1,
        JSON.stringify(await historyState(page)));

      const fs2 = await frameState(frame);

      check("sandbox 확정이 승인으로 끝났다",
        fs2 && fs2.lastSettle === "accepted" &&
        fs2.lastCommit && fs2.lastCommit.kind === "resize",
        fs2 ? `${fs2.lastSettle} · ${fs2.lastCommit.kind}` : "state 없음");

      check("★ sandbox 에서도 선택이 유지된다(pointerdown 이 손잡이를 무시한다)",
        (await readState(page)).ids.join() === "cvA",
        JSON.stringify((await readState(page)).ids));

      /* --- auto 전환도 sandbox 에서 --- */

      await clickElement(page, frame, true, "cvAuto");

      const autoReady = await waitForHandles(page, frame, 8);

      check("sandbox 에서 auto 요소에도 손잡이가 붙는다",
        autoReady && autoReady.resizeHandles === 8 &&
        autoReady.geometry && autoReady.geometry.height === "auto",
        autoReady
          ? `${autoReady.resizeHandles} · ${JSON.stringify(autoReady.geometry)}`
          : "state 없음");

      await resizeBy(page, frame, true, "cvAuto", "s", 0, 35);

      const sandboxAuto = boxOf(await readCanvas(page), "cvAuto");
      const autoSettle = await frameState(frame);

      check('sandbox 에서도 "auto" 가 숫자로 바뀐다',
        sandboxAuto && typeof sandboxAuto.height === "number",
        `${JSON.stringify(sandboxAuto)} · settle=${autoSettle && autoSettle.lastSettle}` +
        ` · gate=${autoSettle && autoSettle.lastMoveGate}` +
        ` · commit=${JSON.stringify(autoSettle && autoSettle.lastCommit)}`);

      const violations = await cspViolations(frame);

      check("sandbox CSP 위반 0", violations.length === 0,
        JSON.stringify(violations.slice(0, 3)));

      check("pageerror 0(sandbox)", page.__errors.length === 0,
        page.__errors[0] || "");

      /* --- native 와 같은 결과인가 --- */

      await close(page);

      const nativePage = await openStudio(browser, {});
      const nativeFrame = await canvasFrame(nativePage, false);

      await enableCanvasEditing(nativePage);
      await pick(nativePage, nativeFrame, false, "cvA");

      const nativeView = await rectsFor(nativePage, nativeFrame, false, ["cvA"]);
      const nativeScale = nativeView.__canvas.width / 390;

      await resizeBy(nativePage, nativeFrame, false, "cvA", "e", 60, 0);

      const nativeBox = boxOf(await readCanvas(nativePage), "cvA");

      check("native 와 sandbox 가 같은 배율 · 같은 계산을 쓴다",
        Math.abs((nativeBox.width - 90) * nativeScale - (box.width - 90) * scale) <= 2,
        `native ${JSON.stringify(nativeBox)} @${nativeScale.toFixed(3)} · ` +
        `sandbox ${JSON.stringify(box)} @${scale.toFixed(3)}`);

      await clickElement(nativePage, nativeFrame, false, "cvAuto");
      await waitForHandles(nativePage, nativeFrame, 8);

      await resizeBy(nativePage, nativeFrame, false, "cvAuto", "s", 0, 35);

      const nativeAuto = boxOf(await readCanvas(nativePage), "cvAuto");

      check("native 와 sandbox 의 auto 전환 높이가 같다",
        nativeAuto && sandboxAuto &&
        Math.abs(nativeAuto.height * nativeScale - sandboxAuto.height * scale) <= 2,
        `native ${nativeAuto.height} @${nativeScale.toFixed(3)} · ` +
        `sandbox ${sandboxAuto.height} @${scale.toFixed(3)}`);

      check("pageerror 0(native)", nativePage.__errors.length === 0,
        nativePage.__errors[0] || "");

      await close(nativePage);

    }


    /* ======================================================
       [public] — 공개 화면에는 손잡이도 vendor 도 없다
    ====================================================== */
    if (wants("public")) {

      section("public");

      for (const [label, url] of [
        ["공개 진입(index.html)", PARENT_ORIGIN + "/"],
        ["공개 sandbox 프레임", SANDBOX_ORIGIN + "/skin/sandbox/frame"]
      ]) {

        const page = await browser.newPage();

        const vendorReqs = [];

        page.on("request", (req) => {
          if (req.url().includes("/studio/vendor/home-canvas/")) {
            vendorReqs.push(req.url());
          }
        });

        await page.goto(url, { waitUntil: "networkidle" });
        await sleep(600);

        check(`${label} — vendor 요청 0`,
          vendorReqs.length === 0,
          vendorReqs.map((u) => u.replace(/^https?:\/\/[^/]+/, "")).join(" · ") ||
            "요청 없음");

        check(`${label} — 리사이즈 손잡이 0`,
          await page.evaluate(() =>
            document.querySelectorAll(".moveable-control[data-direction]").length) === 0);

        await page.close();

      }

    }

  }
  finally {

    await browser.close();

    for (const server of servers) {
      await new Promise((r) => server.close(r));
    }

  }


  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
