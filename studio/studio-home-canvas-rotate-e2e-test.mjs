/* =========================================================
   HOME CANVAS — 단일 요소 회전 · JSON 저장 · Undo E2E
   (HOME-CANVAS-TRANSFORM-1C)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §19
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ★ 이번 단계가 소유하는 것은 **`rotation` 한 칸**이다.

   그래서 이 파일이 매번 다시 보는 것은 "얼마나 돌았는가"보다
   "**상자가 그대로인가**"다 — x · y · width · height · props ·
   hidden · locked · 모르는 필드 · 다른 요소 · 배열 순서 · 스킨 CSS
   가 한 글자도 달라지면 안 된다. 회전 중심이 요소 상자의 정중앙
   이므로(transform-origin 기본값) 상자를 바꾸지 않고도 화면이 맞는
   것이 이 단계의 전제다.

   ── 각도를 어떻게 재는가 ───────────────────────────────
   저장값은 Canvas JSON 에서 읽는다. 화면값은 요소에 적힌
   `--imory-canvas-rotation` 문자열에서 읽는다 — **CSS matrix 에서
   역산하지 않는다**: matrix 는 380° 와 20° 를 구분하지 못하므로
   "한 바퀴를 넘는 동안 화면이 반대로 튀지 않았는가"를 물어볼 수
   없다. 그 칸이 곧 우리가 쓴 값이다.

   ── Moveable 의 누적 회전량을 어떻게 확인하는가 ─────────
   제스처를 **호(arc)** 로 끌면서 매 걸음 그 칸을 읽는다. 우리가
   쓰는 식이 `시작 각도 + dist` 이므로, 읽은 값이 의도한 호를 그대로
   따라오면 그 payload 가 누적 회전량이라는 뜻이다. 시작 각도가 20°
   인 요소에서 첫 걸음이 20° 근처였다는 것은 `dist` 가 **절대 각도가
   아니라 이번 제스처의 누적량**이라는 증거다.

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함) — transform · resize e2e 와 같다.

   [handle]   회전 손잡이 1 개 · 단일만 · 잡을 수 있는 hit area ·
              리사이즈 손잡이 여덟 회귀 · vendor 요청 시점
   [payload]  누적 회전량 실측 — 호를 따라오는가 · 시작 각도에서
              이어지는가 · 되돌리면 되돌아오는가
   [rotate]   실제 포인터 회전 · 상자 네 칸 불변 · 소수 셋째 자리 ·
              rotation 없는 요소 · 기존 각도에서 이어 돌리기
   [turn]     360° 경계 — 제스처 중 연속 · 저장은 한 바퀴 안
   [view]     좁은 도화지 · 부모 scale(0.8) · Preview 내부 scroll
   [undo]     한 제스처 = 한 칸 · 0 변화 = 기록 0 · Undo/Redo
   [round]    Save → 다시 열기 · Export → Import · Publish resolve
   [reject]   잠김 · 숨김 · stale 순번 · 모르는 키 · expected 불일치
   [cancel]   Escape · 끄는 도중 선택 해제
   [gesture]  본체 이동 · 리사이즈 회귀 · 손잡이에서 lasso 0 · 손가락
   [sandbox]  별도 origin 에서 같은 JSON + CSP 위반 0
   [public]   공개 화면에는 손잡이도 vendor 도 없다

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-rotate-e2e-test.mjs
     node studio/studio-home-canvas-rotate-e2e-test.mjs --only=payload
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8998;
const SANDBOX_PORT = 8999;

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

const FIXTURE_IMAGE_PATH = "/__canvas-rotate-fixture__/swatch.svg";
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

     cvA      이 라운드의 주인공. `rotation:0` 에서 시작한다.
              `zzz` 는 **우리가 모르는 필드**다(§19-6 보존).
     cvB      옆의 또 다른 요소 — "다른 요소는 그대로인가"의 대조군.
     cvNone   **`rotation` 칸이 아예 없는 요소.** 고르기만 해서는
              그 칸이 생기지 않아야 하고, 실제로 돌리면 생겨야 한다.
     cvRot20  이미 20° 인 요소 — "시작할 때 튀지 않는가".
     cvTurn   350° — 한 바퀴 경계.
     cvNeg    -30° — 이미 저장된 음수 값(일괄 정규화 금지).
     cvAuto   height:"auto" (text) — 회전이 높이 모드를 안 건드린다.
     cvLocked 잠긴 요소 · cvHidden 숨긴 요소 — 거부 절이 쓴다.
     cvFar    도화지 아래쪽 — Preview 내부 스크롤 절이 쓴다.

   위쪽에 여백을 넉넉히 둔다 — 회전 손잡이는 요소 **위**로 40px
   떨어진 자리에 그려지므로, 도화지 맨 위에 붙은 요소로는 잡을
   자리가 화면 밖이 된다.
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
  { id: "cvA", type: "shape", x: 40, y: 120, width: 90, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" },
    zzz: { keep: "unknown-field" } },

  { id: "cvB", type: "shape", x: 250, y: 120, width: 80, height: 50,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  /* ★ rotation 칸이 **없다** — 계약 §5 의 "빠지면 0" 그 요소다 */
  { id: "cvNone", type: "shape", x: 40, y: 250, width: 80, height: 50,
    hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvRot20", type: "shape", x: 250, y: 250, width: 90, height: 60,
    rotation: 20, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvTurn", type: "shape", x: 40, y: 390, width: 90, height: 60,
    rotation: 350, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvNeg", type: "shape", x: 250, y: 390, width: 90, height: 60,
    rotation: -30, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvAuto", type: "text", x: 40, y: 520, width: 120, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "자동 높이", role: "body" } },

  { id: "cvLocked", type: "photo", x: 40, y: 620, width: 120, height: 80,
    rotation: 0, hidden: false, locked: true, props: { slot: "photo_1" } },

  { id: "cvHidden", type: "shape", x: 250, y: 620, width: 80, height: 50,
    rotation: 0, hidden: true, locked: false, props: { kind: "rect" } },

  { id: "cvFar", type: "shape", x: 60, y: 740, width: 120, height: 80,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } }
];

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
      /* 우리가 모르는 **다른 항목** — 회전이 이것을 지우면 안 된다 */
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
    /* 확정이 거부되면 부모가 사유를 한 줄 남긴다 */
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
   Playwright 가 풀어 주는 중첩 프레임 좌표를 쓴다.
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

const ROTATION_SELECTOR =
  '[data-imory-canvas-frame="1"] .moveable-rotation-control';


async function rectsFor(page, frame, sandbox, ids) {

  const selectors = ids.map(byId);

  return sandbox
    ? sandboxRects(page, frame, selectors)
    : nativeRects(page, selectors);

}


/* 리사이즈 손잡이 여덟의 자리(회귀 확인용 — resize e2e 와 같은 자) */
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


/* 회전 손잡이 **하나**의 자리 */
async function rotationHandle(page, frame, sandbox) {

  if (!sandbox) {

    return page.evaluate((selector) => {

      const f = document.getElementById("studioPreviewFrame");
      const doc = f.contentDocument;
      const handle = doc.querySelector(selector);

      if (!handle) {
        return null;
      }

      const box = f.getBoundingClientRect();
      const scale = box.width / (f.offsetWidth || box.width);
      const cs = getComputedStyle(f);
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0;
      const r = handle.getBoundingClientRect();

      return {
        x: box.left + (bl + r.left + r.width / 2) * scale,
        y: box.top + (bt + r.top + r.height / 2) * scale,
        size: Math.min(r.width, r.height) * scale,
        pointerEvents: getComputedStyle(handle).pointerEvents
      };

    }, ROTATION_SELECTOR);

  }

  const box =
    await frame.locator(ROTATION_SELECTOR).first().boundingBox().catch(() => null);

  return box
    ? {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        size: Math.min(box.width, box.height),
        pointerEvents: "auto"
      }
    : null;

}


/* =========================================================
   화면에 적힌 각도 — **우리가 쓴 그 칸**을 읽는다

   ★ CSS matrix 에서 역산하지 않는다. matrix 는 380° 와 20° 를
     구분하지 못하므로 "한 바퀴를 넘는 동안 반대로 튀지 않았는가"를
     물어볼 수 없다(머리말).
========================================================== */

async function screenRotation(page, frame, sandbox, id) {

  const text = sandbox
    ? await frame.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.style.getPropertyValue("--imory-canvas-rotation") : "";
      }, byId(id))
    : await page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        return el ? el.style.getPropertyValue("--imory-canvas-rotation") : "";
      }, byId(id));

  const value = parseFloat(String(text || ""));

  return Number.isFinite(value) ? value : null;

}


/* =========================================================
   입력 — 실제 포인터로 끈다
========================================================== */

async function dragFrom(page, from, to, options) {

  const o = options || {};

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

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


/* 손잡이 하나를 (dx, dy) 만큼 끈다 — 리사이즈(회귀 확인용) */
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


/* =========================================================
   rotateBy — 회전 손잡이를 **호(arc)** 로 끈다

   ★ 직선으로 끌지 않는다. 손잡이를 중심 건너편으로 직선으로 밀면
     경로가 중심을 스치면서 각도가 순간적으로 요동치고, 정확히
     중심을 지나면 각도 자체가 정의되지 않는다. 손은 원을 그리므로
     테스트도 원을 그린다.

   ★ 중심은 요소의 축 정렬 바깥 상자의 한가운데다. 회전은 중심을
     보존하므로 회전한 요소에서도 그 값이 곧 중심이다.

   onStep(i) 를 주면 걸음마다 불러 결과를 모아 준다(경로 추적).
========================================================== */

async function rotateBy(page, frame, sandbox, id, deg, options) {

  const o = options || {};

  await bringIntoView(page, frame, sandbox, id);

  const rects =
    await rectsFor(page, frame, sandbox, [id]);

  const box =
    rects[byId(id)];

  if (!box) {
    throw new Error("요소를 찾지 못했습니다: " + id);
  }

  const handle =
    await rotationHandle(page, frame, sandbox);

  if (!handle) {
    throw new Error("회전 손잡이를 찾지 못했습니다: " + id);
  }

  const center = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2
  };

  const radius =
    Math.hypot(handle.x - center.x, handle.y - center.y);

  const start =
    Math.atan2(handle.y - center.y, handle.x - center.x);

  const steps = o.steps || 12;
  const samples = [];

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();

  for (let i = 1; i <= steps; i += 1) {

    const angle =
      start + (deg * Math.PI / 180) * (i / steps);

    await page.mouse.move(
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle)
    );

    if (o.onStep) {
      samples.push(await o.onStep(i, (deg * i) / steps));
    }

  }

  if (o.beforeUp) {
    await o.beforeUp();
  }

  if (o.noUp) {
    return { center, handle, radius, samples };
  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 700 : o.settle);

  return { center, handle, radius, samples };

}


/* 그 요소를 화면 가운데로 가져온다.

   ★ sandbox 에서 **스크롤하는 것은 sandbox 프레임이 아니다** —
   안쪽 iframe 은 자기 내용 높이만큼 늘어나 스스로 스크롤하지 않으므로
   밀어야 하는 것은 Preview 문서다(계약 §18-10 의 그 함정).

   ★ 회전 손잡이는 요소 **위**로 40px 떨어져 있으므로 요소를 화면
     한가운데보다 조금 아래에 둔다. */
async function bringIntoView(page, frame, sandbox, id) {

  if (sandbox) {

    const wantY =
      page.viewportSize().height * 0.6;

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
        0, r.top + r.height / 2 - doc.defaultView.innerHeight * 0.6
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


/* 저장된 각도. **칸이 없는 것과 0 인 것을 구분한다.** */
const rotationOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  if (!el) return "요소없음";
  return Object.prototype.hasOwnProperty.call(el, "rotation")
    ? el.rotation
    : "칸없음";
};


const boxOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el
    ? { x: el.x, y: el.y, width: el.width, height: el.height }
    : null;
};


/* `rotation` 을 뺀 나머지 전부 — "그 밖에 무엇이 바뀌었는가"의 지문.
   상자 네 칸도 여기 들어 있다(회전은 그것을 바꾸지 않는다). */
const fingerprintOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  if (!el) return null;
  const copy = { ...el };
  delete copy.rotation;
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


/* 회전 손잡이가 붙을 때까지 */
async function waitForRotationHandle(page, frame, want = 1, timeout = 8000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {

    const state = await frameState(frame).catch(() => null);

    if (state && state.rotationHandles === want) {
      return state;
    }

    await sleep(150);

  }

  return frameState(frame).catch(() => null);

}


async function pick(page, frame, sandbox, id) {

  await clickElement(page, frame, sandbox, id);
  await waitForDraggable(page, frame, true);
  return waitForRotationHandle(page, frame, 1);

}


const close = async (page) => {
  await page.__ctx.close().catch(() => {});
};


/* 두 자리가 tol 안에서 같은가 */
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
       [handle] — 회전 손잡이가 언제 · 몇 개 · 잡을 수 있게 붙는가
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

      check("Select 만 켠 상태에는 회전 손잡이가 없다",
        idle && idle.rotationHandles === 0,
        idle ? String(idle.rotationHandles) : "state 없음");

      const ready = await pick(page, frame, false, "cvA");

      check("단독 선택에 회전 손잡이가 **하나** 붙는다",
        ready && ready.rotationHandles === 1,
        ready ? String(ready.rotationHandles) : "state 없음");

      check("그 하나를 실제로 잡을 수 있다(control box 의 pointer-events 를 되돌려 받았다)",
        ready && ready.rotationHandleHit === 1,
        ready ? String(ready.rotationHandleHit) : "state 없음");

      check("리사이즈 손잡이 여덟은 그대로다(1B 회귀)",
        ready && ready.resizeHandles === 8 && ready.resizeHandleHit === 8,
        ready ? `${ready.resizeHandles} · hit ${ready.resizeHandleHit}` : "state 없음");

      const knob = await rotationHandle(page, frame, false);
      const rect = await rectsFor(page, frame, false, ["cvA"]);
      const box = rect[byId("cvA")];

      check("회전 손잡이는 요소 **위쪽**에 있다",
        !!knob && !!box && knob.y < box.top,
        knob ? `손잡이 y ${knob.y.toFixed(1)} · 요소 top ${box.top.toFixed(1)}` : "없음");

      check("회전 손잡이의 pointer-events 가 auto 다",
        !!knob && knob.pointerEvents === "auto",
        knob ? knob.pointerEvents : "없음");

      /* --- 여럿을 고르면 --- */

      await clickElement(page, frame, false, "cvB", { shift: true });
      await sleep(700);

      const many = await readState(page);
      const group = await frameState(frame);

      check("둘을 골랐다", many.count === 2, JSON.stringify(many.ids));

      check("★ 여럿을 고르면 회전 손잡이가 0 이다(그룹 회전은 다음 단계)",
        group && group.rotationHandles === 0 && group.rotationHandleHit === 0,
        group ? `${group.rotationHandles} · hit ${group.rotationHandleHit}` : "state 없음");

      check("여럿을 골랐을 때 리사이즈 손잡이도 0 이다(1B 회귀)",
        group && group.resizeHandleHit === 0,
        group ? String(group.resizeHandleHit) : "state 없음");

      check("그룹에서도 틀 자체는 남는다",
        group && group.instances >= 1 && group.moveableTargets === 2,
        group ? `${group.instances} · targets ${group.moveableTargets}` : "state 없음");

      /* --- 다시 단독 --- */

      const single = await pick(page, frame, false, "cvA");

      check("다시 단독으로 고르면 회전 손잡이가 돌아온다",
        single && single.rotationHandles === 1 && single.rotationHandleHit === 1,
        single ? String(single.rotationHandles) : "state 없음");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [payload] — Moveable 의 누적 회전량을 실제로 재어 본다
    ====================================================== */
    if (wants("payload")) {

      section("payload");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      /* --- 0° 에서 시작해 +60° 까지 호를 따라간다 --- */

      const walk = await rotateBy(page, frame, false, "cvA", 60, {
        steps: 12,
        onStep: async (i, want) => ({
          want: want,
          got: await screenRotation(page, frame, false, "cvA")
        })
      });

      const offs =
        walk.samples.map((s) => Math.abs(s.got - s.want));

      check("★ 화면 각도가 의도한 호를 그대로 따라온다(= dist 가 누적 회전량이다)",
        offs.every((d) => d <= 1.5),
        `최대 오차 ${Math.max(...offs).toFixed(3)}° · ` +
          walk.samples.map((s) => `${s.want.toFixed(0)}/${s.got.toFixed(2)}`).join(" "));

      check("★ 각도가 걸음마다 단조 증가한다(뒤로 튀지 않는다)",
        walk.samples.every((s, i) => i === 0 || s.got > walk.samples[i - 1].got),
        walk.samples.map((s) => s.got.toFixed(2)).join(" → "));

      check("각도를 정수로 스냅하지 않는다(throttleRotate 0)",
        walk.samples.some((s) => Math.abs(s.got - Math.round(s.got)) > 0.001),
        walk.samples.map((s) => s.got.toFixed(3)).join(" "));

      const saved = await readCanvas(page);

      check("손을 놓은 각도가 그대로 저장된다",
        Math.abs(rotationOf(saved, "cvA") - 60) <= 1.5,
        String(rotationOf(saved, "cvA")));

      /* --- 이미 20° 인 요소에서 시작한다 --- */

      await pick(page, frame, false, "cvRot20");

      const first = await screenRotation(page, frame, false, "cvRot20");

      const cont = await rotateBy(page, frame, false, "cvRot20", 30, {
        steps: 8,
        onStep: async (i, want) => ({
          want: 20 + want,
          got: await screenRotation(page, frame, false, "cvRot20")
        })
      });

      check("★ 고르기만 해서는 각도가 달라지지 않는다(20° 그대로)",
        Math.abs(first - 20) < 0.001, String(first));

      check("★ 시작 각도에서 **이어서** 돈다(dist 는 절대 각도가 아니다)",
        cont.samples.every((s) => Math.abs(s.got - s.want) <= 1.5),
        cont.samples.map((s) => `${s.want.toFixed(0)}/${s.got.toFixed(2)}`).join(" "));

      const after20 = await readCanvas(page);

      check("20° 에서 +30° 는 50° 로 저장된다",
        Math.abs(rotationOf(after20, "cvRot20") - 50) <= 1.5,
        String(rotationOf(after20, "cvRot20")));

      /* --- 갔다가 되돌아오면 제자리 --- */

      await pick(page, frame, false, "cvB");

      const there = await rotateBy(page, frame, false, "cvB", 45, {
        steps: 6, noUp: true
      });

      const peak = await screenRotation(page, frame, false, "cvB");

      /* 같은 자리로 되돌린다 — 손을 놓지 않은 채로 */
      for (let i = 5; i >= 0; i -= 1) {
        const angle =
          Math.atan2(there.handle.y - there.center.y, there.handle.x - there.center.x) +
          (45 * Math.PI / 180) * (i / 6);
        await page.mouse.move(
          there.center.x + there.radius * Math.cos(angle),
          there.center.y + there.radius * Math.sin(angle)
        );
      }

      const back = await screenRotation(page, frame, false, "cvB");

      await page.mouse.up();
      await sleep(700);

      check("★ 되돌리면 시작 각도로 돌아온다(매 이벤트의 delta 를 쌓지 않는다)",
        Math.abs(peak - 45) <= 1.5 && Math.abs(back) <= 1.5,
        `정점 ${peak.toFixed(2)}° → 복귀 ${back.toFixed(2)}°`);

      const restored = await readCanvas(page);

      check("제자리로 돌아온 제스처는 확정도 기록도 만들지 않는다",
        rotationOf(restored, "cvB") === 0 &&
        (await historyState(page)).undo === 2,
        `${rotationOf(restored, "cvB")} · undo ${(await historyState(page)).undo}`);

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [rotate] — 각도 한 칸만 바뀐다
    ====================================================== */
    if (wants("rotate")) {

      section("rotate");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      const before = await readCanvas(page);
      const beforeRegions = await readRegions(page);
      const beforeCss = await page.evaluate(() => currentWorkingSkin.css);

      await rotateBy(page, frame, false, "cvA", 40);

      const after = await readCanvas(page);
      const rotation = rotationOf(after, "cvA");

      check("회전 손잡이를 끌면 rotation 이 저장된다",
        Math.abs(rotation - 40) <= 1.5, String(rotation));

      check("소수 셋째 자리까지만 저장한다",
        String(rotation).replace(/^-?\d+\.?/, "").length <= 3, String(rotation));

      check("★ 상자 네 칸이 한 글자도 안 바뀐다",
        JSON.stringify(boxOf(after, "cvA")) ===
        JSON.stringify(boxOf(before, "cvA")),
        JSON.stringify(boxOf(after, "cvA")));

      check("★ rotation 밖은 지문 단위로 불변(props · 모르는 필드 zzz)",
        fingerprintOf(after, "cvA") === fingerprintOf(before, "cvA"),
        fingerprintOf(after, "cvA"));

      check("다른 요소 객체는 그대로다",
        JSON.stringify(elementOf(after, "cvB")) ===
        JSON.stringify(elementOf(before, "cvB")));

      check("배열 순서가 그대로다",
        after.canvas.elements.map((e) => e.id).join() ===
        before.canvas.elements.map((e) => e.id).join());

      check("canvas · 항목의 모르는 칸이 보존된다",
        after.canvas.extra === "unknown-canvas-field" &&
        after.note === "unknown-entry-field");

      const afterRegions = await readRegions(page);

      check("regions 의 다른 항목이 그대로다",
        JSON.stringify(afterRegions.find((r) => r.name === "some_other_region")) ===
        JSON.stringify(beforeRegions.find((r) => r.name === "some_other_region")));

      check("스킨 CSS 가 그대로다",
        (await page.evaluate(() => currentWorkingSkin.css)) === beforeCss);

      const drawn = await screenRotation(page, frame, false, "cvA");

      check("화면도 그 각도를 그린다",
        Math.abs(drawn - rotation) < 0.001,
        `${drawn} vs ${rotation}`);

      /* --- rotation 칸이 없던 요소 --- */

      await pick(page, frame, false, "cvNone");

      const pickedOnly = await readCanvas(page);

      check("★ 고르기만 해서는 rotation 칸이 생기지 않는다",
        rotationOf(pickedOnly, "cvNone") === "칸없음",
        String(rotationOf(pickedOnly, "cvNone")));

      const noneStart = await screenRotation(page, frame, false, "cvNone");

      check("칸이 없는 요소는 화면상 0° 다",
        Math.abs(noneStart) < 0.001, String(noneStart));

      await rotateBy(page, frame, false, "cvNone", 25);

      const noneAfter = await readCanvas(page);

      check("★ 실제로 돌리면 그때 rotation 칸이 생긴다",
        Math.abs(noneAfter.canvas.elements
          .find((e) => e.id === "cvNone").rotation - 25) <= 1.5,
        String(rotationOf(noneAfter, "cvNone")));

      check("그 요소의 상자도 그대로다",
        JSON.stringify(boxOf(noneAfter, "cvNone")) ===
        JSON.stringify(boxOf(before, "cvNone")));

      /* --- 이미 음수인 요소 --- */

      await pick(page, frame, false, "cvNeg");

      const negStart = await screenRotation(page, frame, false, "cvNeg");

      check("★ 저장된 -30° 가 0° 로 튀지 않는다",
        Math.abs(negStart + 30) < 0.001, String(negStart));

      await rotateBy(page, frame, false, "cvNeg", 20);

      const negAfter = await readCanvas(page);

      check("-30° 에서 +20° 는 -10° 다 — 한 바퀴 안이면 그대로 저장한다",
        Math.abs(rotationOf(negAfter, "cvNeg") - 350) <= 1.5,
        `${rotationOf(negAfter, "cvNeg")} (= -10° 를 한 바퀴 안으로 접은 값)`);

      /* --- height:"auto" 요소 --- */

      await pick(page, frame, false, "cvAuto");

      await rotateBy(page, frame, false, "cvAuto", 15);

      const autoAfter = await readCanvas(page);

      check('회전은 height:"auto" 를 숫자로 바꾸지 않는다',
        elementOf(autoAfter, "cvAuto").height === "auto",
        String(elementOf(autoAfter, "cvAuto").height));

      const autoMode = await page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        return el ? el.getAttribute("data-imory-canvas-height") : null;
      }, byId("cvAuto"));

      check('화면의 높이 모드도 "auto" 그대로다',
        autoMode === "auto", String(autoMode));

      const settle = await frameState(frame);

      check("확정이 승인으로 끝났다",
        settle && settle.lastSettle === "accepted" &&
        settle.lastCommit && settle.lastCommit.kind === "rotate",
        settle ? `${settle.lastSettle} · ${settle.lastCommit.kind}` : "state 없음");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [turn] — 360° 경계
    ====================================================== */
    if (wants("turn")) {

      section("turn");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvTurn");

      const start = await screenRotation(page, frame, false, "cvTurn");

      check("시작 각도가 저장된 350° 그대로다",
        Math.abs(start - 350) < 0.001, String(start));

      const walk = await rotateBy(page, frame, false, "cvTurn", 40, {
        steps: 10,
        onStep: async () => screenRotation(page, frame, false, "cvTurn")
      });

      check("★ 한 바퀴를 넘는 동안 화면 각도가 계속 커진다(반대로 튀지 않는다)",
        walk.samples.every((v, i) => i === 0 || v > walk.samples[i - 1]),
        walk.samples.map((v) => v.toFixed(1)).join(" → "));

      check("★ 제스처 중에는 한 바퀴를 넘은 연속 각도를 그대로 쓴다",
        walk.samples[walk.samples.length - 1] > 360,
        String(walk.samples[walk.samples.length - 1]));

      const after = await readCanvas(page);
      const stored = rotationOf(after, "cvTurn");

      check("★ 저장값은 한 바퀴 안으로 접힌다(390° 가 아니라 30°)",
        stored >= 0 && stored < 360 && Math.abs(stored - 30) <= 1.5,
        String(stored));

      const drawn = await screenRotation(page, frame, false, "cvTurn");

      check("확정 뒤 화면도 접힌 값으로 다시 그려진다(같은 그림이다)",
        Math.abs(drawn - stored) < 0.001, `${drawn} vs ${stored}`);

      const settle = await frameState(frame);

      check("한 바퀴를 넘겨도 확정은 승인이다(프레임이 접힌 답을 자기 값으로 읽는다)",
        settle && settle.lastSettle === "accepted",
        settle ? settle.lastSettle : "state 없음");

      /* --- 반대 방향으로도 --- */

      await pick(page, frame, false, "cvA");

      await rotateBy(page, frame, false, "cvA", -50);

      const neg = await readCanvas(page);

      check("★ 0° 에서 반대로 돌리면 음수가 아니라 310° 로 저장된다",
        Math.abs(rotationOf(neg, "cvA") - 310) <= 1.5,
        String(rotationOf(neg, "cvA")));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [view] — 배율과 스크롤은 각도를 바꾸지 않는다
    ====================================================== */
    if (wants("view")) {

      section("view");

      /* --- 좁은 도화지 --- */

      const narrow = await openStudio(browser, { narrow: true });
      const narrowFrame = await canvasFrame(narrow, false);

      await enableCanvasEditing(narrow);
      await pick(narrow, narrowFrame, false, "cvA");

      const view = await rectsFor(narrow, narrowFrame, false, ["cvA"]);
      const scale = view.__canvas.width / 390;

      await rotateBy(narrow, narrowFrame, false, "cvA", 35);

      check(`좁은 도화지(배율 ${scale.toFixed(3)})에서도 같은 각도다`,
        Math.abs(rotationOf(await readCanvas(narrow), "cvA") - 35) <= 1.5,
        String(rotationOf(await readCanvas(narrow), "cvA")));

      check("pageerror 0 (narrow)", narrow.__errors.length === 0,
        narrow.__errors[0] || "");

      await close(narrow);

      /* --- 부모 scale --- */

      const scaled = await openStudio(browser, { scale: 0.8 });
      const scaledFrame = await canvasFrame(scaled, false);

      await enableCanvasEditing(scaled);
      await pick(scaled, scaledFrame, false, "cvA");

      await rotateBy(scaled, scaledFrame, false, "cvA", 35);

      check("★ 부모 Preview 의 scale(0.8) 을 각도에 보정하지 않는다",
        Math.abs(rotationOf(await readCanvas(scaled), "cvA") - 35) <= 1.5,
        String(rotationOf(await readCanvas(scaled), "cvA")));

      check("pageerror 0 (scale)", scaled.__errors.length === 0,
        scaled.__errors[0] || "");

      await close(scaled);

      /* --- Preview 내부 스크롤 --- */

      const scrolled = await openStudio(browser, {});
      const scrolledFrame = await canvasFrame(scrolled, false);

      await enableCanvasEditing(scrolled);
      await pick(scrolled, scrolledFrame, false, "cvFar");

      await rotateBy(scrolled, scrolledFrame, false, "cvFar", 30);

      check("Preview 내부를 스크롤한 뒤에도 손잡이 자리와 각도가 맞는다",
        Math.abs(rotationOf(await readCanvas(scrolled), "cvFar") - 30) <= 1.5,
        String(rotationOf(await readCanvas(scrolled), "cvFar")));

      check("pageerror 0 (scroll)", scrolled.__errors.length === 0,
        scrolled.__errors[0] || "");

      await close(scrolled);

    }


    /* ======================================================
       [undo] — 한 제스처 = Undo 한 칸
    ====================================================== */
    if (wants("undo")) {

      section("undo");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      const start = await historyState(page);

      await rotateBy(page, frame, false, "cvA", 45);

      const oneGesture = await historyState(page);
      const afterRotate = rotationOf(await readCanvas(page), "cvA");

      check("한 번의 회전이 Undo 한 칸이다",
        oneGesture.undo === start.undo + 1,
        `${start.undo} → ${oneGesture.undo}`);

      /* --- 손잡이를 누르기만 하면 --- */

      const knob = await rotationHandle(page, frame, false);

      await page.mouse.move(knob.x, knob.y);
      await page.mouse.down();
      await page.mouse.up();
      await sleep(700);

      const clicked = await historyState(page);

      check("★ 회전 손잡이를 누르기만 하면 기록도 변화도 없다",
        clicked.undo === oneGesture.undo &&
        rotationOf(await readCanvas(page), "cvA") === afterRotate,
        `undo ${clicked.undo} · ${rotationOf(await readCanvas(page), "cvA")}`);

      /* --- Undo --- */

      await page.click("#studioUndoButton");
      await sleep(900);

      const undone = await readCanvas(page);

      check("Undo 가 회전 전 각도로 돌린다",
        rotationOf(undone, "cvA") === 0, String(rotationOf(undone, "cvA")));

      const keptSelection = await readState(page);

      check("Undo 뒤에도 선택이 그대로다",
        keptSelection.count === 1 && keptSelection.ids[0] === "cvA",
        JSON.stringify(keptSelection.ids));

      check("Undo 뒤 geometry 에 각도가 다시 내려갔다",
        !!keptSelection.geometry && keptSelection.geometry.rotation === 0,
        JSON.stringify(keptSelection.geometry));

      const again = await waitForRotationHandle(page, frame, 1);

      check("Undo 뒤 새 DOM 에 회전 손잡이가 다시 붙는다",
        again && again.rotationHandles === 1 && again.draggable === true,
        again ? `${again.rotationHandles} · ${again.dragGate}` : "state 없음");

      /* --- Redo --- */

      await page.click("#studioRedoButton");
      await sleep(900);

      check("Redo 가 회전 뒤 각도로 돌아온다",
        rotationOf(await readCanvas(page), "cvA") === afterRotate,
        String(rotationOf(await readCanvas(page), "cvA")));

      /* --- rotation 칸이 생긴 요소의 Undo --- */

      await pick(page, frame, false, "cvNone");
      await rotateBy(page, frame, false, "cvNone", 25);

      check("칸이 생겼다(Undo 대상 준비)",
        rotationOf(await readCanvas(page), "cvNone") !== "칸없음",
        String(rotationOf(await readCanvas(page), "cvNone")));

      await page.click("#studioUndoButton");
      await sleep(900);

      check("★ Undo 하면 rotation 칸이 **없던 상태**로 정확히 돌아간다",
        rotationOf(await readCanvas(page), "cvNone") === "칸없음",
        String(rotationOf(await readCanvas(page), "cvNone")));

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

      await rotateBy(page, frame, false, "cvA", 40);

      await pick(page, frame, false, "cvNone");
      await rotateBy(page, frame, false, "cvNone", 25);

      const rotated = rotationOf(await readCanvas(page), "cvA");
      const created = rotationOf(await readCanvas(page), "cvNone");

      /* --- 입력 non-mutation --- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const a = entry.canvas.elements.find((e) => e.id === "cvA");
        const none = entry.canvas.elements.find((e) => e.id === "cvNone");
        return {
          a: a.rotation,
          noneHas: Object.prototype.hasOwnProperty.call(none, "rotation")
        };
      });

      check("들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.a === 0 && untouched.noneHas === false,
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
        const none = pickEl("cvNone");
        const neg = pickEl("cvNeg");

        return {
          ok: true,
          a: a ? a.rotation : null,
          aBox: a ? { x: a.x, y: a.y, width: a.width, height: a.height } : null,
          none: none ? none.rotation : null,
          neg: neg ? neg.rotation : null,
          zzz: a ? JSON.stringify(a.zzz) : null
        };

      });

      check("Export → Import 를 지나도 각도가 같다",
        roundTrip.ok && roundTrip.a === rotated && roundTrip.none === created,
        JSON.stringify(roundTrip));

      check("Export → Import 를 지나도 상자가 그대로다",
        roundTrip.ok &&
        JSON.stringify(roundTrip.aBox) ===
          JSON.stringify({ x: 40, y: 120, width: 90, height: 60 }),
        JSON.stringify(roundTrip.aBox));

      check("★ 손대지 않은 요소의 음수 각도를 일괄 정규화하지 않는다",
        roundTrip.ok && roundTrip.neg === -30, String(roundTrip.neg));

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

        return {
          a: pickEl("cvA") ? pickEl("cvA").rotation : null,
          none: pickEl("cvNone") ? pickEl("cvNone").rotation : null
        };

      });

      check("Publish 이 쓰는 resolve 에서도 같은 각도다",
        resolved && resolved.a === rotated && resolved.none === created,
        JSON.stringify(resolved));

      /* --- Save → 다시 열기 --- */

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const savedContent = await page.evaluate(() => {
        const calls = window.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      await close(page);

      const reopened = await openStudio(browser, { package: savedContent });

      const reopenedFrame = await canvasFrame(reopened, false);

      check("저장된 draft 로 다시 열면 그 각도다",
        rotationOf(await readCanvas(reopened), "cvA") === rotated,
        String(rotationOf(await readCanvas(reopened), "cvA")));

      const drawn = await screenRotation(reopened, reopenedFrame, false, "cvA");

      check("다시 연 화면이 그 각도를 실제로 그린다",
        Math.abs(drawn - rotated) < 0.001, `${drawn} vs ${rotated}`);

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
        kind: "rotate", id: "cvA", expected: { rotation: 0 },
        next: { rotation: 30 }, generation: gen - 1, requestId: 1
      });

      await unchanged("미래 순번도 거부된다", {
        kind: "rotate", id: "cvA", expected: { rotation: 0 },
        next: { rotation: 30 }, generation: gen + 5, requestId: 1
      });

      await unchanged("expected 가 어긋나면 거부된다", {
        kind: "rotate", id: "cvA", expected: { rotation: 15 },
        next: { rotation: 30 }, generation: gen, requestId: 1
      });

      await unchanged("★ next 에 좌표가 섞이면 전체가 거부된다", {
        kind: "rotate", id: "cvA", expected: { rotation: 0 },
        next: { rotation: 30, x: 40, y: 120 }, generation: gen, requestId: 1
      }, "회전은 상자를 바꾸지 않는다 — 조용히 골라 담지 않는다");

      await unchanged("★ expected 에 좌표가 섞여도 거부된다", {
        kind: "rotate", id: "cvA", expected: { rotation: 0, x: 40 },
        next: { rotation: 30 }, generation: gen, requestId: 1
      });

      await unchanged("★ 각도가 빠지면 거부된다", {
        kind: "rotate", id: "cvA", expected: { rotation: 0 },
        next: {}, generation: gen, requestId: 1
      });

      await unchanged("유한하지 않은 각도는 거부된다", {
        kind: "rotate", id: "cvA", expected: { rotation: 0 },
        next: { rotation: null }, generation: gen, requestId: 1
      });

      await unchanged("문자열 각도는 거부된다", {
        kind: "rotate", id: "cvA", expected: { rotation: 0 },
        next: { rotation: "30" }, generation: gen, requestId: 1
      });

      await unchanged("모르는 kind 는 거부된다", {
        kind: "spin", id: "cvA", expected: { rotation: 0 },
        next: { rotation: 30 }, generation: gen, requestId: 1
      });

      await unchanged("★ kind 만 move 로 바꿔 달면 거부된다", {
        kind: "move", id: "cvA", expected: { rotation: 0 },
        next: { rotation: 30 }, generation: gen, requestId: 1
      }, "move 가 소유하는 것은 좌표 둘이다");

      await unchanged("고르지 않은 요소는 거부된다", {
        kind: "rotate", id: "cvB", expected: { rotation: 0 },
        next: { rotation: 30 }, generation: gen, requestId: 1
      });

      await unchanged("없는 요소는 거부된다", {
        kind: "rotate", id: "cvNope", expected: { rotation: 0 },
        next: { rotation: 30 }, generation: gen, requestId: 1
      });

      /* --- 잠긴 · 숨긴 요소 --- */

      await clickElement(page, frame, false, "cvLocked");
      await sleep(600);

      const lockedPick = await readState(page);

      check("잠긴 요소는 클릭으로 골라지지 않는다",
        lockedPick.ids.indexOf("cvLocked") === -1,
        JSON.stringify(lockedPick.ids));

      await unchanged("잠긴 요소의 확정은 거부된다", {
        kind: "rotate", id: "cvLocked", expected: { rotation: 0 },
        next: { rotation: 30 },
        generation: (await readState(page)).generation, requestId: 1
      });

      await unchanged("숨긴 요소의 확정은 거부된다", {
        kind: "rotate", id: "cvHidden", expected: { rotation: 0 },
        next: { rotation: 30 },
        generation: (await readState(page)).generation, requestId: 1
      });

      /* --- rotation 칸이 없는 요소의 expected 는 0 이다 --- */

      await pick(page, frame, false, "cvNone");

      const noneGen = (await readState(page)).generation;

      const wrongExpected = await commit(page, {
        kind: "rotate", id: "cvNone", expected: { rotation: 10 },
        next: { rotation: 30 }, generation: noneGen, requestId: 1
      });

      check("★ 칸이 없는 요소의 expected 는 0 이다(10 은 어긋난다)",
        wrongExpected.accepted === false &&
        rotationOf(await readCanvas(page), "cvNone") === "칸없음",
        wrongExpected.reason);

      const rightExpected = await commit(page, {
        kind: "rotate", id: "cvNone", expected: { rotation: 0 },
        next: { rotation: 30 }, generation: noneGen, requestId: 2
      });

      check("★ expected 0 으로는 받아들여지고 그때 칸이 생긴다",
        rightExpected.accepted === true &&
        rotationOf(await readCanvas(page), "cvNone") === 30,
        `${rightExpected.reason} · ${rotationOf(await readCanvas(page), "cvNone")}`);

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

      let midway = null;

      await rotateBy(page, frame, false, "cvA", 50, {
        steps: 8,
        noUp: true,
        beforeUp: async () => {
          midway = await screenRotation(page, frame, false, "cvA");
        }
      });

      check("끄는 동안 화면이 실제로 돌았다",
        midway !== null && Math.abs(midway - 50) <= 2, String(midway));

      check("끄는 동안에는 JSON 이 한 글자도 안 바뀐다",
        JSON.stringify(await readCanvas(page)) === JSON.stringify(before));

      await page.keyboard.press("Escape");
      await sleep(600);
      await page.mouse.up();
      await sleep(700);

      check("Escape 가 화면을 시작 각도로 되돌린다",
        Math.abs(await screenRotation(page, frame, false, "cvA")) < 0.001,
        String(await screenRotation(page, frame, false, "cvA")));

      check("Escape 뒤 JSON 도 기록도 그대로다",
        JSON.stringify(await readCanvas(page)) === JSON.stringify(before) &&
        (await historyState(page)).undo === startHistory.undo);

      check("★ Escape 가 선택까지 풀지는 않는다",
        (await readState(page)).ids.join() === "cvA",
        JSON.stringify((await readState(page)).ids));

      /* --- 끄는 도중 선택 해제 --- */

      await rotateBy(page, frame, false, "cvA", 40, {
        steps: 6,
        noUp: true,
        beforeUp: async () => {
          await page.evaluate(() => window.clearStudioCanvasSelection());
          await sleep(400);
        }
      });

      await page.mouse.up();
      await sleep(700);

      check("끄는 도중 선택이 풀리면 확정하지 않는다",
        JSON.stringify(await readCanvas(page)) === JSON.stringify(before) &&
        (await historyState(page)).undo === startHistory.undo,
        JSON.stringify(await historyState(page)));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [gesture] — 무엇이 이동이고 무엇이 회전인가
    ====================================================== */
    if (wants("gesture")) {

      section("gesture");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await pick(page, frame, false, "cvA");

      /* --- 본체 끌기는 여전히 이동 --- */

      await dragElement(page, frame, false, "cvA", 30, 20);

      const moved = await frameState(frame);
      const movedJson = await readCanvas(page);

      check("본체 끌기는 여전히 이동이다",
        moved && moved.lastCommit && moved.lastCommit.kind === "move",
        moved ? moved.lastCommit.kind : "state 없음");

      check("이동이 각도를 건드리지 않는다",
        rotationOf(movedJson, "cvA") === 0,
        String(rotationOf(movedJson, "cvA")));

      /* --- 리사이즈 손잡이는 여전히 리사이즈 --- */

      await resizeBy(page, frame, false, "cvA", "e", 40, 0);

      const resized = await frameState(frame);

      check("리사이즈 손잡이는 여전히 리사이즈다",
        resized && resized.lastCommit && resized.lastCommit.kind === "resize",
        resized ? resized.lastCommit.kind : "state 없음");

      check("리사이즈도 각도를 건드리지 않는다",
        rotationOf(await readCanvas(page), "cvA") === 0,
        String(rotationOf(await readCanvas(page), "cvA")));

      /* --- 회전 손잡이에서는 lasso 가 시작되지 않는다 --- */

      const lassoBefore = (await frameState(frame)).lassoCount;

      await rotateBy(page, frame, false, "cvA", 25);

      const rotated = await frameState(frame);

      check("회전 손잡이를 끌면 kind 는 rotate 다",
        rotated && rotated.lastCommit && rotated.lastCommit.kind === "rotate",
        rotated ? rotated.lastCommit.kind : "state 없음");

      check("★ 회전 손잡이를 끌어도 lasso 는 시작되지 않는다",
        rotated && rotated.lassoCount === lassoBefore,
        `${lassoBefore} → ${rotated ? rotated.lassoCount : "?"}`);

      check("★ 회전 손잡이를 눌러도 선택이 유지된다(Inspector 가 비켜선다)",
        (await readState(page)).ids.join() === "cvA",
        JSON.stringify((await readState(page)).ids));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

      /* --- 손가락 --- */

      const touch = await openStudio(browser, { hasTouch: true });
      const touchFrame = await canvasFrame(touch, false);

      await enableCanvasEditing(touch);
      await pick(touch, touchFrame, false, "cvA");

      const touchBefore = await readCanvas(touch);
      const knob = await rotationHandle(touch, touchFrame, false);
      const rects = await rectsFor(touch, touchFrame, false, ["cvA"]);
      const box = rects[byId("cvA")];

      const center = {
        x: (box.left + box.right) / 2,
        y: (box.top + box.bottom) / 2
      };

      const radius = Math.hypot(knob.x - center.x, knob.y - center.y);
      const a0 = Math.atan2(knob.y - center.y, knob.x - center.x);

      await touch.touchscreen.tap(knob.x, knob.y);
      await sleep(300);

      await touch.evaluate(
        ([x0, y0, cx, cy, r, base]) => {

          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          const target = doc.elementFromPoint(
            x0 - document.getElementById("studioPreviewFrame").getBoundingClientRect().left,
            y0 - document.getElementById("studioPreviewFrame").getBoundingClientRect().top
          ) || doc.body;

          const fire = (type, x, y) => {
            const touchObj = new Touch({
              identifier: 1, target: target, clientX: x, clientY: y
            });
            return target.dispatchEvent(new TouchEvent(type, {
              bubbles: true, cancelable: true,
              touches: type === "touchend" ? [] : [touchObj],
              targetTouches: type === "touchend" ? [] : [touchObj],
              changedTouches: [touchObj]
            }));
          };

          fire("touchstart", x0, y0);

          const results = [];

          for (let i = 1; i <= 6; i += 1) {
            const a = base + (40 * Math.PI / 180) * (i / 6);
            results.push(
              fire("touchmove", cx + r * Math.cos(a), cy + r * Math.sin(a))
            );
          }

          fire("touchend", x0, y0);

          return results;

        },
        [knob.x, knob.y, center.x, center.y, radius, a0]
      );

      await sleep(700);

      check("★ 손가락으로는 회전이 시작되지 않는다",
        JSON.stringify(await readCanvas(touch)) === JSON.stringify(touchBefore),
        String(rotationOf(await readCanvas(touch), "cvA")));

      const touchState = await frameState(touchFrame);

      check("관문이 coarse-pointer 에서 걸렸거나 아예 시작되지 않았다",
        touchState &&
        (touchState.lastMoveGate === "coarse-pointer" || touchState.dragging === false),
        touchState ? touchState.lastMoveGate : "state 없음");

      check("pageerror 0 (touch)", touch.__errors.length === 0,
        touch.__errors[0] || "");

      await close(touch);

    }


    /* ======================================================
       [sandbox] — 별도 origin 에서 같은 계산
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);
      await clickElement(page, frame, true, "cvA");

      const ready = await waitForRotationHandle(page, frame, 1);

      check("sandbox 프레임에도 회전 손잡이가 하나 붙는다",
        ready && ready.rotationHandles === 1 && ready.rotationHandleHit === 1,
        ready ? `${ready.rotationHandles} · hit ${ready.rotationHandleHit}` : "state 없음");

      const before = await readCanvas(page);

      await rotateBy(page, frame, true, "cvA", 40);

      const after = await readCanvas(page);
      const rotation = rotationOf(after, "cvA");

      check("sandbox 에서 회전 손잡이를 끌면 Canvas JSON 이 바뀐다",
        Math.abs(rotation - 40) <= 1.5, String(rotation));

      check("sandbox 에서도 상자 네 칸은 그대로다",
        JSON.stringify(boxOf(after, "cvA")) ===
        JSON.stringify(boxOf(before, "cvA")),
        JSON.stringify(boxOf(after, "cvA")));

      check("sandbox 에서도 rotation 밖은 그대로다",
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
        fs2.lastCommit && fs2.lastCommit.kind === "rotate",
        fs2 ? `${fs2.lastSettle} · ${fs2.lastCommit.kind}` : "state 없음");

      check("★ sandbox 에서도 선택이 유지된다(pointerdown 이 손잡이를 무시한다)",
        (await readState(page)).ids.join() === "cvA",
        JSON.stringify((await readState(page)).ids));

      /* --- 한 바퀴 경계도 sandbox 에서 --- */

      await clickElement(page, frame, true, "cvTurn");
      await waitForRotationHandle(page, frame, 1);

      await rotateBy(page, frame, true, "cvTurn", 40);

      check("sandbox 에서도 저장값이 한 바퀴 안으로 접힌다",
        Math.abs(rotationOf(await readCanvas(page), "cvTurn") - 30) <= 1.5,
        String(rotationOf(await readCanvas(page), "cvTurn")));

      /* --- CSP --- */

      const parentViolations = await page.evaluate(() =>
        (window.__cspViolations || []).slice());

      const frameViolations = await cspViolations(frame);

      check("CSP 위반 0 (부모)", parentViolations.length === 0,
        JSON.stringify(parentViolations.slice(0, 3)));

      check("CSP 위반 0 (프레임)", frameViolations.length === 0,
        JSON.stringify(frameViolations.slice(0, 3)));

      check("콘솔 CSP 오류 0",
        page.__consoleErrors.filter((t) => /Content Security Policy/i.test(t)).length === 0,
        page.__consoleErrors.filter((t) => /Content Security Policy/i.test(t))[0] || "");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [public] — 공개 화면에는 손잡이도 vendor 도 없다
    ====================================================== */
    if (wants("public")) {

      section("public");

      for (const [label, url] of [
        ["공개 진입", `${PARENT_ORIGIN}/`],
        ["공개 sandbox 프레임", `${SANDBOX_ORIGIN}/skin/sandbox/frame`]
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

        check(`${label} — 회전 손잡이 0`,
          await page.evaluate(() =>
            document.querySelectorAll(".moveable-rotation-control").length) === 0);

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
