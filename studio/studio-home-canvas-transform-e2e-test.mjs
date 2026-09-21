/* =========================================================
   HOME CANVAS — 단일 요소 이동 · JSON 저장 · Undo E2E
   (HOME-CANVAS-TRANSFORM-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §17
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ★ 이번 단계가 소유하는 것은 **x · y 두 칸**이다.

   그래서 이 파일이 매번 다시 보는 것은 "얼마나 움직였는가"보다
   "**그 밖에 무엇이 바뀌지 않았는가**"다. width · height ·
   rotation · props · hidden · locked · 배열 순서 · 모르는 필드 ·
   다른 요소 · 스킨 CSS 가 한 글자도 달라지면 안 된다.

   ── 왜 좌표를 픽셀이 아니라 JSON 으로 재는가 ────────────
   화면 픽셀은 도화지 폭 · 부모 scale · 스크롤에 따라 달라진다.
   계약이 말하는 것은 390 자 위의 숫자이므로, 재는 값도 그것이다.
   픽셀은 "끈 만큼 갔는가"를 확인하는 보조로만 쓴다.

   ── 손가락은 왜 안 되는가 ───────────────────────────────
   도화지 전체를 덮는 배경 사진이 선택된 상태에서 한 손가락
   드래그를 가로채면 모바일 Preview 가 아예 스크롤되지 않는다.
   lasso 와 같은 이유이고(계약 §16-3), [touch] 절이 그것을 잰다.

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함) — selecto e2e 와 같은 방식이다.

   [move]     native 이동 · x·y 만 · 390 기준 · 반복 누적 · 회전 ·
              auto 높이 · 음수 · 다른 요소 불변
   [view]     다른 도화지 폭 · 부모 scale(0.8) · Preview 내부 scroll
   [undo]     한 제스처 = 한 칸 · 이동량 0 = 기록 없음 · Undo · Redo
   [round]    Save → 다시 열기 · Export → Import · Publish resolve ·
              모르는 필드 보존 · 입력 non-mutation
   [reject]   stale 순번 · expected 불일치 · 허용 외 키 · kind 위조
   [cancel]   Escape · pointercancel · 선택 변경 · HOME 이탈
   [gesture]  고른 요소 위 lasso 금지 · 미선택 요소 · 빈 자리 ·
              locked 위 · 다중 선택 · 단일 클릭 회귀
   [touch]    손가락은 옮기지 않고 스크롤을 막지 않는다
   [sandbox]  별도 origin 프레임에서 같은 결과 + CSP 위반 0

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-transform-e2e-test.mjs
     node studio/studio-home-canvas-transform-e2e-test.mjs --only=move
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8994;
const SANDBOX_PORT = 8995;

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

const FIXTURE_IMAGE_PATH = "/__canvas-transform-fixture__/swatch.svg";
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

     cvA      왼쪽 위. 이 라운드의 주인공 — 거의 모든 절이 이것을
              끈다. `zzz` 는 **우리가 모르는 필드**다(§17-5 보존).
     cvB      옆의 또 다른 요소. "다른 요소는 그대로인가"의 대조군.
     cvRot    30도 돌아간 요소 — 옮겨도 회전은 그대로여야 한다.
     cvAuto   height:"auto" — 고정 높이가 없어도 옮길 수 있어야 한다.
     cvLocked 잠긴 요소. 그 위에서는 lasso 가 시작돼야 한다(§17-2).
     cvFar    도화지 아래쪽 — Preview 내부 스크롤 절이 쓴다.

   `.hc-outside` 는 도화지 **밖**의 평범한 스킨 요소이고,
   `.hc-effect` 는 "사용자 JS 가 붙인 효과 DOM" 대역이다(도화지
   안이지만 캔버스 요소가 아니고 pointer-events 가 없다).
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
  { id: "cvA", type: "shape", x: 20, y: 40, width: 90, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" },
    zzz: { keep: "unknown-field" } },

  { id: "cvB", type: "shape", x: 160, y: 40, width: 90, height: 60,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvRot", type: "shape", x: 20, y: 140, width: 80, height: 50,
    rotation: 30, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvAuto", type: "text", x: 160, y: 140, width: 120, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "자동 높이", role: "body" } },

  { id: "cvLocked", type: "photo", x: 20, y: 240, width: 120, height: 80,
    rotation: 0, hidden: false, locked: true, props: { slot: "photo_1" } },

  { id: "cvFar", type: "shape", x: 30, y: 700, width: 120, height: 80,
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
      /* 우리가 모르는 **다른 항목** — 이동이 이것을 지우면 안 된다 */
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
   Playwright 가 풀어 주는 중첩 프레임 좌표를 쓴다(선택 e2e 와
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


async function rectsFor(page, frame, sandbox, ids) {

  const selectors = ids.map(byId);

  return sandbox
    ? sandboxRects(page, frame, selectors)
    : nativeRects(page, selectors);

}


/* 그 요소를 화면 가운데로 끌어온다(Top Dock 이 위쪽을 덮으므로
   조금 아래로). native 전용 — sandbox 는 프레임을 통째로 스크롤한다. */
async function bringIntoView(page, frame, sandbox, id) {

  if (sandbox) {

    await frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - window.innerHeight * 0.55);
    }, byId(id));

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

  await sleep(350);

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

  await sleep(o.settle === undefined ? 600 : o.settle);

}


/* 요소 가운데에서 (dx, dy) 만큼 끈다. 화면 좌표 기준이다. */
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


const positionOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el ? { x: el.x, y: el.y } : null;
};


/* x · y 를 뺀 나머지 전부 — "그 밖에 무엇이 바뀌었는가"의 지문 */
const fingerprintOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  if (!el) return null;
  const copy = { ...el };
  delete copy.x;
  delete copy.y;
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


/* 고른 뒤 프레임에서 이동이 실제로 켜졌는가 */
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


const close = async (page) => {
  await page.__ctx.close().catch(() => {});
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
       [move] — native 단일 이동
    ====================================================== */
    if (wants("move")) {

      section("move");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const before = await readCanvas(page);

      await clickElement(page, frame, false, "cvA");

      const picked = await readState(page);

      check("단일 선택 · 좌표가 프레임으로 내려간다",
        picked.count === 1 && picked.ids[0] === "cvA" &&
        !!picked.geometry && picked.geometry.x === 20 && picked.geometry.y === 40,
        JSON.stringify(picked.geometry));

      const ready = await waitForDraggable(page, frame, true);

      check("이동이 켜졌다", ready && ready.draggable === true,
        ready ? ready.dragGate : "state 없음");

      /* 도화지 폭이 390 보다 크면 배율이 1 이 아니다 — 픽셀을
         Canvas 좌표로 되돌려 기대값을 만든다 */
      const view = await rectsFor(page, frame, false, ["cvA"]);
      const scale = view.__canvas.width / 390;

      await dragElement(page, frame, false, "cvA", 60, 40);

      const after = await readCanvas(page);
      const moved = positionOf(after, "cvA");

      const wantX = Math.round((20 + 60 / scale) * 1000) / 1000;
      const wantY = Math.round((40 + 40 / scale) * 1000) / 1000;

      check("x · y 가 Canvas 좌표로 바뀌었다",
        moved && Math.abs(moved.x - wantX) <= 0.6 && Math.abs(moved.y - wantY) <= 0.6,
        `${JSON.stringify(moved)} (기대 ~${wantX}, ${wantY}, 배율 ${scale.toFixed(3)})`);

      check("소수점 셋째 자리까지만 저장된다",
        moved &&
        String(moved.x).replace(/^-?\d+\.?/, "").length <= 3 &&
        String(moved.y).replace(/^-?\d+\.?/, "").length <= 3,
        JSON.stringify(moved));

      check("x · y 밖의 칸은 그대로다 (width · height · rotation · props · 모르는 필드)",
        fingerprintOf(after, "cvA") === fingerprintOf(before, "cvA"),
        fingerprintOf(after, "cvA"));

      check("다른 요소는 손대지 않았다",
        JSON.stringify(elementOf(after, "cvB")) === JSON.stringify(elementOf(before, "cvB")));

      check("요소 배열 순서가 그대로다",
        JSON.stringify(after.canvas.elements.map((el) => el.id)) ===
        JSON.stringify(CANVAS_ORDER));

      check("canvas · 항목의 모르는 칸이 보존됐다",
        after.canvas.extra === "unknown-canvas-field" &&
        after.note === "unknown-entry-field" &&
        after.canvas.baseWidth === 390 && after.canvas.baseHeight === 844);

      const regionsAfter = await readRegions(page);

      check("regions 의 다른 항목이 그대로다",
        JSON.stringify(regionsAfter[0]) ===
        JSON.stringify({ name: "some_other_region", enabled: true, payload: { keep: true } }),
        JSON.stringify(regionsAfter[0]));

      check("스킨 CSS 는 한 글자도 바뀌지 않았다",
        await page.evaluate(() => currentWorkingSkin.css) === CANVAS_CSS);

      /* --- 반복 드래그 — 누적 오차 --- */

      const beforeRepeat = positionOf(await readCanvas(page), "cvA");

      for (let i = 0; i < 4; i += 1) {
        await dragElement(page, frame, false, "cvA", 10, 0);
      }

      const afterRepeat = positionOf(await readCanvas(page), "cvA");

      check("반복해서 끌어도 오차가 쌓이지 않는다",
        Math.abs((afterRepeat.x - beforeRepeat.x) - (4 * 10 / scale)) <= 0.8 &&
        afterRepeat.y === beforeRepeat.y,
        `${beforeRepeat.x} → ${afterRepeat.x} (한 번에 ${(10 / scale).toFixed(3)})`);

      /* --- 회전한 요소 --- */

      await clickElement(page, frame, false, "cvRot");
      await waitForDraggable(page, frame, true);

      const rotBefore = elementOf(await readCanvas(page), "cvRot");

      await dragElement(page, frame, false, "cvRot", 30, 20);

      const rotAfter = elementOf(await readCanvas(page), "cvRot");

      check("회전한 요소도 옮겨지고 rotation 은 그대로다",
        rotAfter.rotation === 30 &&
        rotAfter.x > rotBefore.x && rotAfter.y > rotBefore.y &&
        rotAfter.width === rotBefore.width && rotAfter.height === rotBefore.height,
        JSON.stringify({ x: rotAfter.x, y: rotAfter.y, rotation: rotAfter.rotation }));

      const rotTransform = await page.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector('[data-imory-edit-id="cvRot"]');
        return el ? getComputedStyle(el).transform : null;
      });

      check("회전이 화면에서도 살아 있다",
        typeof rotTransform === "string" && rotTransform !== "none" &&
        rotTransform.indexOf("matrix") === 0,
        rotTransform);

      /* --- height:"auto" --- */

      await clickElement(page, frame, false, "cvAuto");
      await waitForDraggable(page, frame, true);

      const autoBefore = elementOf(await readCanvas(page), "cvAuto");

      await dragElement(page, frame, false, "cvAuto", 25, 25);

      const autoAfter = elementOf(await readCanvas(page), "cvAuto");

      check('height:"auto" 요소도 옮겨지고 height 는 그대로 "auto" 다',
        autoAfter.height === "auto" &&
        autoAfter.x > autoBefore.x && autoAfter.y > autoBefore.y,
        JSON.stringify({ x: autoAfter.x, y: autoAfter.y, height: autoAfter.height }));

      /* --- 음수 좌표 --- */

      await clickElement(page, frame, false, "cvA");
      await waitForDraggable(page, frame, true);

      const negBefore = positionOf(await readCanvas(page), "cvA");

      await dragElement(page, frame, false, "cvA", -Math.round((negBefore.x + 30) * scale), 0);

      const negAfter = positionOf(await readCanvas(page), "cvA");

      check("도화지 밖으로 나가는 음수 x 를 자동으로 되돌리지 않는다",
        negAfter.x < 0, JSON.stringify(negAfter));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [view] — 다른 폭 · 부모 scale · 내부 scroll
    ====================================================== */
    if (wants("view")) {

      section("view");

      /* --- 1. 좁은 도화지(60%) --- */
      {
        const page = await openStudio(browser, { narrow: true });
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await clickElement(page, frame, false, "cvA");
        await waitForDraggable(page, frame, true);

        const view = await rectsFor(page, frame, false, ["cvA"]);
        const scale = view.__canvas.width / 390;

        await dragElement(page, frame, false, "cvA", 60, 0);

        const moved = positionOf(await readCanvas(page), "cvA");

        check("도화지가 좁아도 같은 픽셀 이동이 같은 Canvas 좌표가 된다",
          Math.abs(moved.x - (20 + 60 / scale)) <= 0.8,
          `${moved.x} (배율 ${scale.toFixed(3)})`);

        await close(page);
      }

      /* --- 2. 부모 scale(0.8) --- */
      {
        const page = await openStudio(browser, { scale: 0.8 });
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await clickElement(page, frame, false, "cvA");
        await waitForDraggable(page, frame, true);

        const view = await rectsFor(page, frame, false, ["cvA"]);

        /* 부모 좌표의 60px 은 프레임 안에서 60/0.8 = 75px 이다 —
           `__scale` 이 그 배율이고, 도화지 폭도 같은 배율로 재어진다 */
        const canvasScale = view.__canvas.width / 390;

        await dragElement(page, frame, false, "cvA", 60, 0);

        const moved = positionOf(await readCanvas(page), "cvA");

        check("부모 scale(0.8) 에서도 좌표가 어긋나지 않는다",
          Math.abs(moved.x - (20 + 60 / canvasScale)) <= 0.8,
          `${moved.x} (부모배율 ${view.__scale.toFixed(3)} · 도화지배율 ${canvasScale.toFixed(3)})`);

        await close(page);
      }

      /* --- 3. Preview 내부 스크롤 --- */
      {
        const page = await openStudio(browser, {});
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);

        await page.evaluate(() => {
          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          doc.defaultView.scrollTo(0, 260);
        });
        await sleep(300);

        await clickElement(page, frame, false, "cvFar");
        await waitForDraggable(page, frame, true);

        const view = await rectsFor(page, frame, false, ["cvFar"]);
        const scale = view.__canvas.width / 390;

        const beforeFar = positionOf(await readCanvas(page), "cvFar");

        await dragElement(page, frame, false, "cvFar", 40, 0);

        const afterFar = positionOf(await readCanvas(page), "cvFar");

        check("Preview 안이 스크롤된 상태에서도 좌표가 맞는다",
          Math.abs((afterFar.x - beforeFar.x) - 40 / scale) <= 0.8,
          `${beforeFar.x} → ${afterFar.x}`);

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
      await clickElement(page, frame, false, "cvA");
      await waitForDraggable(page, frame, true);

      const start = await historyState(page);

      await dragElement(page, frame, false, "cvA", 50, 30);

      const oneDrag = await historyState(page);
      const afterDrag = positionOf(await readCanvas(page), "cvA");

      check("한 번의 드래그가 Undo 한 칸이다",
        oneDrag.undo === start.undo + 1,
        `${start.undo} → ${oneDrag.undo}`);

      /* --- 이동량 0 --- */

      await dragElement(page, frame, false, "cvA", 0, 0, { steps: 3 });

      const zeroDrag = await historyState(page);

      check("이동량 0 은 기록을 만들지 않는다",
        zeroDrag.undo === oneDrag.undo,
        `${oneDrag.undo} → ${zeroDrag.undo}`);

      check("이동량 0 에서 좌표도 그대로다",
        JSON.stringify(positionOf(await readCanvas(page), "cvA")) ===
        JSON.stringify(afterDrag));

      /* --- Undo --- */

      await page.click("#studioUndoButton");
      await sleep(900);

      const undone = positionOf(await readCanvas(page), "cvA");

      check("Undo 가 드래그 전 좌표로 돌린다",
        undone.x === 20 && undone.y === 40, JSON.stringify(undone));

      const keptSelection = await readState(page);

      check("Undo 뒤에도 선택이 그대로다",
        keptSelection.count === 1 && keptSelection.ids[0] === "cvA",
        JSON.stringify(keptSelection.ids));

      check("Undo 뒤 좌표도 다시 내려갔다",
        !!keptSelection.geometry &&
        keptSelection.geometry.x === 20 && keptSelection.geometry.y === 40,
        JSON.stringify(keptSelection.geometry));

      /* --- Redo --- */

      await page.click("#studioRedoButton");
      await sleep(900);

      const redone = positionOf(await readCanvas(page), "cvA");

      check("Redo 가 드래그 뒤 좌표로 돌아온다",
        JSON.stringify(redone) === JSON.stringify(afterDrag),
        `${JSON.stringify(redone)} vs ${JSON.stringify(afterDrag)}`);

      /* --- rerender 뒤에도 다시 끌 수 있는가 --- */

      const again = await waitForDraggable(page, frame, true);

      check("Undo · Redo 뒤 새 DOM 에 다시 붙어 이동이 켜져 있다",
        again && again.draggable === true && again.targetIds.join() === "cvA",
        again ? `${again.dragGate} · ${again.targetIds.join()}` : "state 없음");

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
      await clickElement(page, frame, false, "cvA");
      await waitForDraggable(page, frame, true);

      await dragElement(page, frame, false, "cvA", 70, 45);

      const moved = positionOf(await readCanvas(page), "cvA");

      /* --- 입력 non-mutation --- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const el = entry.canvas.elements.find((e) => e.id === "cvA");
        return { x: el.x, y: el.y };
      });

      check("들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.x === 20 && untouched.y === 40, JSON.stringify(untouched));

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

        const el =
          entry ? entry.canvas.elements.find((e) => e.id === "cvA") : null;

        return {
          ok: true,
          x: el ? el.x : null,
          y: el ? el.y : null,
          zzz: el ? JSON.stringify(el.zzz) : null,
          other: JSON.stringify(
            (result.skinPackage.regions || []).find((r) => r && r.name === "some_other_region")
          )
        };

      });

      check("Export → Import 를 지나도 좌표가 같다",
        roundTrip.ok && roundTrip.x === moved.x && roundTrip.y === moved.y,
        JSON.stringify(roundTrip));

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

        const el =
          payload ? payload.elements.find((e) => e.id === "cvA") : null;

        return el ? { x: el.x, y: el.y, width: el.width } : null;

      });

      check("Publish 이 쓰는 resolve 에서도 같은 좌표다",
        resolved && resolved.x === moved.x && resolved.y === moved.y && resolved.width === 90,
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
          x: el ? el.x : null,
          y: el ? el.y : null
        };

      });

      check("Save 가 보낸 content 에 새 좌표가 있다",
        saved.x === moved.x && saved.y === moved.y,
        JSON.stringify({ x: saved.x, y: saved.y }));

      await close(page);

      /* 저장된 content 로 Studio 를 다시 연다 */
      const reopened = await openStudio(browser, { package: saved.content });

      await canvasFrame(reopened, false);

      const reloaded = positionOf(await readCanvas(reopened), "cvA");

      check("저장된 draft 로 다시 열면 그 자리에 있다",
        reloaded && reloaded.x === moved.x && reloaded.y === moved.y,
        JSON.stringify(reloaded));

      const drawn = await reopened.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector('[data-imory-edit-id="cvA"]');
        return el ? el.style.getPropertyValue("--imory-canvas-x") : null;
      });

      check("다시 연 화면이 그 좌표를 실제로 그린다",
        typeof drawn === "string" && drawn.endsWith("%") &&
        Math.abs(parseFloat(drawn) - (moved.x / 390 * 100)) < 0.001,
        String(drawn));

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
      await clickElement(page, frame, false, "cvA");
      await waitForDraggable(page, frame, true);

      const now = await readState(page);
      const gen = now.generation;

      const base = await readCanvas(page);

      const cases = [
        ["stale 순번",
          { kind: "move", id: "cvA", expected: { x: 20, y: 40 }, next: { x: 99, y: 99 }, generation: gen - 1 }],
        ["미래 순번",
          { kind: "move", id: "cvA", expected: { x: 20, y: 40 }, next: { x: 99, y: 99 }, generation: gen + 5 }],
        ["expected 불일치",
          { kind: "move", id: "cvA", expected: { x: 21, y: 40 }, next: { x: 99, y: 99 }, generation: gen }],
        ["고르지 않은 요소",
          { kind: "move", id: "cvB", expected: { x: 160, y: 40 }, next: { x: 99, y: 99 }, generation: gen }],
        ["잠긴 요소",
          { kind: "move", id: "cvLocked", expected: { x: 20, y: 240 }, next: { x: 99, y: 99 }, generation: gen }],
        ["없는 요소",
          { kind: "move", id: "cvNope", expected: { x: 0, y: 0 }, next: { x: 9, y: 9 }, generation: gen }],
        ["kind 위조",
          { kind: "resize", id: "cvA", expected: { x: 20, y: 40 }, next: { x: 99, y: 99 }, generation: gen }],
        ["허용 외 키",
          { kind: "move", id: "cvA", expected: { x: 20, y: 40 }, next: { x: 99, y: 99, width: 300 }, generation: gen }],
        ["유한하지 않은 수",
          { kind: "move", id: "cvA", expected: { x: 20, y: 40 }, next: { x: null, y: 99 }, generation: gen }],
        ["상한 밖",
          { kind: "move", id: "cvA", expected: { x: 20, y: 40 }, next: { x: 1e9, y: 0 }, generation: gen }]
      ];

      for (const [label, request] of cases) {

        const result = await commit(page, request);

        check(`거부: ${label}`, result && result.accepted === false,
          JSON.stringify(result));

      }

      const untouched = await readCanvas(page);

      check("거부된 요청은 Canvas JSON 을 한 글자도 바꾸지 않았다",
        JSON.stringify(untouched) === JSON.stringify(base));

      check("거부가 Undo 기록을 만들지 않았다",
        (await historyState(page)).undo === 0,
        JSON.stringify(await historyState(page)));

      /* 같은 값을 두 번 — 두 번째는 expected 가 어긋나 거부된다 */
      const good = { kind: "move", id: "cvA", expected: { x: 20, y: 40 }, next: { x: 33, y: 55 }, generation: gen };

      const first = await commit(page, good);
      const second = await commit(page, good);

      check("정상 요청 하나는 받아들인다",
        first && first.accepted === true, JSON.stringify(first));

      check("같은 요청을 다시 보내면 거부한다(중복 확정)",
        second && second.accepted === false, JSON.stringify(second));

      check("받아들인 뒤 좌표가 정확히 그 값이다",
        JSON.stringify(positionOf(await readCanvas(page), "cvA")) ===
        JSON.stringify({ x: 33, y: 55 }));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [cancel] — 취소와 실패
    ====================================================== */
    if (wants("cancel")) {

      section("cancel");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await clickElement(page, frame, false, "cvA");
      await waitForDraggable(page, frame, true);

      const base = positionOf(await readCanvas(page), "cvA");

      /* --- Escape --- */

      await bringIntoView(page, frame, false, "cvA");

      let rects = await rectsFor(page, frame, false, ["cvA"]);
      let box = rects[byId("cvA")];
      let from = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };

      await dragFrom(page, from, { x: from.x + 70, y: from.y + 50 }, {
        noUp: true,
        beforeUp: async () => {
          await page.keyboard.press("Escape");
          await sleep(250);
        }
      });

      await page.mouse.up();
      await sleep(600);

      check("Escape 가 이동을 취소한다",
        JSON.stringify(positionOf(await readCanvas(page), "cvA")) === JSON.stringify(base),
        JSON.stringify(positionOf(await readCanvas(page), "cvA")));

      check("Escape 취소가 Undo 기록을 만들지 않는다",
        (await historyState(page)).undo === 0);

      const keptAfterEscape = await readState(page);

      check("Escape 취소가 선택까지 풀지는 않는다",
        keptAfterEscape.count === 1 && keptAfterEscape.ids[0] === "cvA",
        JSON.stringify(keptAfterEscape.ids));

      const drawnBack = await page.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector('[data-imory-edit-id="cvA"]');
        return el ? el.style.getPropertyValue("--imory-canvas-x") : null;
      });

      check("취소 뒤 화면도 시작 자리로 돌아온다",
        Math.abs(parseFloat(drawnBack) - (20 / 390 * 100)) < 0.001, String(drawnBack));

      /* --- 끄는 도중 선택이 갈리면 --- */

      rects = await rectsFor(page, frame, false, ["cvA"]);
      box = rects[byId("cvA")];
      from = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };

      await dragFrom(page, from, { x: from.x + 70, y: from.y + 50 }, {
        noUp: true,
        beforeUp: async () => {
          await page.evaluate(() => window.clearStudioCanvasSelection());
          await sleep(250);
        }
      });

      await page.mouse.up();
      await sleep(700);

      check("끄는 도중 선택이 풀리면 확정하지 않는다",
        JSON.stringify(positionOf(await readCanvas(page), "cvA")) === JSON.stringify(base),
        JSON.stringify(positionOf(await readCanvas(page), "cvA")));

      check("그 취소도 기록을 만들지 않는다",
        (await historyState(page)).undo === 0);

      /* --- Select 를 끄면 --- */

      await clickElement(page, frame, false, "cvA");
      await waitForDraggable(page, frame, true);

      await page.click("#studioInspectorButton");
      await sleep(700);

      const off = await frameState(frame);

      check("Select 를 끄면 이동도 꺼진다",
        off && off.draggable === false && off.editing === false,
        off ? `${off.dragGate} · editing=${off.editing}` : "state 없음");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [gesture] — lasso 와 본체 이동의 경계
    ====================================================== */
    if (wants("gesture")) {

      section("gesture");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      /* --- 1. 미선택 요소 위에서 끌기 --- */

      await bringIntoView(page, frame, false, "cvA");

      let rects = await rectsFor(page, frame, false, ["cvA", "cvB"]);
      let box = rects[byId("cvA")];

      await dragFrom(page,
        { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 },
        { x: (box.left + box.right) / 2 + 60, y: (box.top + box.bottom) / 2 });

      let state = await readState(page);
      let fs = await frameState(frame);

      check("미선택 요소 위에서 끌어도 lasso 가 시작되지 않는다",
        fs && fs.lastGate === "canvas-element", fs ? fs.lastGate : "state 없음");

      check("미선택 요소 위 끌기가 좌표를 바꾸지 않는다",
        JSON.stringify(positionOf(await readCanvas(page), "cvA")) ===
        JSON.stringify({ x: 20, y: 40 }));

      /* --- 2. 빈 자리에서 끌면 lasso --- */

      rects = await rectsFor(page, frame, false, ["cvA", "cvB"]);
      const canvas = rects.__canvas;
      const a = rects[byId("cvA")];
      const b = rects[byId("cvB")];

      await dragFrom(page,
        { x: Math.min(a.left, b.left) - 8, y: Math.min(a.top, b.top) - 8 },
        { x: Math.max(a.right, b.right) + 8, y: Math.max(a.bottom, b.bottom) + 8 });

      state = await readState(page);

      check("빈 자리에서 시작한 lasso 는 그대로 동작한다",
        state.count === 2 && state.ids.join() === "cvA,cvB",
        JSON.stringify(state.ids));

      check("여럿을 고르면 이동이 꺼진다",
        (await waitForDraggable(page, frame, false)).draggable === false);

      const multiState = await frameState(frame);

      check("여럿을 골라도 그룹 틀은 그대로 있다",
        multiState.moveableTargets === 2, String(multiState.moveableTargets));

      check("여럿을 골랐을 때는 좌표가 내려가지 않는다",
        state.geometry === null, JSON.stringify(state.geometry));

      /* --- 3. 잠긴 요소 위에서는 lasso --- */

      await page.evaluate(() => window.clearStudioCanvasSelection());
      await sleep(400);

      await bringIntoView(page, frame, false, "cvLocked");

      rects = await rectsFor(page, frame, false, ["cvLocked"]);
      const locked = rects[byId("cvLocked")];

      await dragFrom(page,
        { x: locked.left + 6, y: locked.top + 6 },
        { x: locked.right - 6, y: locked.bottom - 6 });

      fs = await frameState(frame);

      check("잠긴 요소 위에서는 lasso 가 시작된다",
        fs && fs.lastGate === "ok" && fs.lassoCount >= 1,
        fs ? `${fs.lastGate} · lasso ${fs.lassoCount}` : "state 없음");

      /* --- 4. 고른 요소 위에서 끌면 lasso 가 아니라 이동 --- */

      await clickElement(page, frame, false, "cvA");
      await waitForDraggable(page, frame, true);

      const lassoBefore = (await frameState(frame)).lassoCount;

      await dragElement(page, frame, false, "cvA", 40, 0);

      fs = await frameState(frame);

      check("고른 요소 위 끌기는 lasso 를 만들지 않는다",
        fs.lassoCount === lassoBefore, `${lassoBefore} → ${fs.lassoCount}`);

      check("고른 요소 위 끌기는 이동으로 확정된다",
        fs.moveCount >= 1 && fs.lastSettle === "accepted",
        `${fs.moveCount} · ${fs.lastSettle} · 좌표 ${JSON.stringify(fs.geometryLog)}` +
        `${page.__canvasLogs.length ? " · " + page.__canvasLogs.join(" | ") : ""}`);

      check("끈 뒤에도 선택이 그 하나로 남는다",
        (await readState(page)).ids.join() === "cvA");

      /* --- 5. 단일 클릭 선택 회귀 --- */

      await clickElement(page, frame, false, "cvB");

      check("평범한 단일 클릭 선택이 그대로 동작한다",
        (await readState(page)).ids.join() === "cvB");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [touch] — 손가락은 옮기지 않는다
    ====================================================== */
    if (wants("touch")) {

      section("touch");

      /* 뷰포트는 데스크톱 그대로 두고 **입력만** 손가락으로 바꾼다.
         마우스와 손가락이 함께 있는 기기가 정확히 이 모양이고,
         계약이 가르는 것도 화면 크기가 아니라 그 순간의 입력이다
         (계약 §17-2). */
      const page = await openStudio(browser, { hasTouch: true });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await bringIntoView(page, frame, false, "cvA");

      const rects = await rectsFor(page, frame, false, ["cvA"]);
      const box = rects[byId("cvA")];

      const spot = {
        x: (box.left + box.right) / 2,
        y: (box.top + box.bottom) / 2
      };

      /* 손가락 탭으로 고른다(SELECT-1A 의 단일 탭) */
      await page.touchscreen.tap(spot.x, spot.y);
      await sleep(700);

      const picked = await readState(page);

      check("손가락 탭으로 고르는 것은 그대로다",
        picked.count === 1 && picked.ids[0] === "cvA", JSON.stringify(picked.ids));

      const before = positionOf(await readCanvas(page), "cvA");

      /*
        ★ "스크롤을 막지 않는다"를 **취소 여부**로 잰다.

        합성 touchmove 로는 실제 스크롤이 일어나지 않으므로
        scrollY 를 비교해 봐야 아무것도 증명하지 못한다. 브라우저가
        스크롤을 하느냐 마느냐는 그 이벤트가 `preventDefault()` 되었
        는가로 갈리고, dispatchEvent 의 반환값이 바로 그 값이다.
      */
      const result = await page.evaluate((point) => {

        const frameEl = document.getElementById("studioPreviewFrame");
        const doc = frameEl.contentDocument;
        const win = doc.defaultView;
        const fb = frameEl.getBoundingClientRect();

        const fx = point.x - fb.left;
        const fy = point.y - fb.top;

        const target = doc.elementFromPoint(fx, fy) || doc.body;

        const cancelled = [];

        const fire = (type, cy) => {

          const touch = new win.Touch({
            identifier: 1,
            target: target,
            clientX: fx,
            clientY: cy
          });

          const ok = target.dispatchEvent(new win.TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : [touch],
            targetTouches: type === "touchend" ? [] : [touch],
            changedTouches: [touch]
          }));

          if (!ok) {
            cancelled.push(type);
          }

        };

        fire("touchstart", fy);
        fire("touchmove", fy - 40);
        fire("touchmove", fy - 90);
        fire("touchend", fy - 90);

        return { cancelled: cancelled, editId: target.closest("[data-imory-edit-id]")
          ? target.closest("[data-imory-edit-id]").getAttribute("data-imory-edit-id")
          : null };

      }, spot);

      await sleep(700);

      const after = positionOf(await readCanvas(page), "cvA");

      check("손가락으로 끈 자리가 실제로 그 요소다",
        result.editId === "cvA", String(result.editId));

      check("손가락 드래그는 좌표를 바꾸지 않는다",
        JSON.stringify(after) === JSON.stringify(before),
        `${JSON.stringify(before)} → ${JSON.stringify(after)}`);

      check("손가락 드래그를 취소하지 않는다(스크롤이 살아 있다)",
        result.cancelled.length === 0, JSON.stringify(result.cancelled));

      const fs = await frameState(frame);

      check("손가락 입력으로는 이동이 한 번도 시작되지 않는다",
        fs && fs.moveCount === 0 && !fs.dragging,
        fs ? `${fs.lastMoveGate} · move ${fs.moveCount}` : "state 없음");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [sandbox] — 별도 origin 프레임
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);
      await clickElement(page, frame, true, "cvA");

      const ready = await waitForDraggable(page, frame, true);

      check("sandbox 프레임에서도 이동이 켜진다",
        ready && ready.draggable === true,
        ready ? ready.dragGate : "state 없음");

      const before = await readCanvas(page);

      const view = await rectsFor(page, frame, true, ["cvA"]);
      const scale = view.__canvas.width / 390;

      await dragElement(page, frame, true, "cvA", 60, 40);

      const after = await readCanvas(page);
      const moved = positionOf(after, "cvA");

      check("sandbox 에서 끌면 Canvas JSON 이 바뀐다",
        moved &&
        Math.abs(moved.x - (20 + 60 / scale)) <= 0.8 &&
        Math.abs(moved.y - (40 + 40 / scale)) <= 0.8,
        `${JSON.stringify(moved)} (배율 ${scale.toFixed(3)})`);

      check("sandbox 에서도 x · y 밖은 그대로다",
        fingerprintOf(after, "cvA") === fingerprintOf(before, "cvA"));

      check("sandbox 에서도 다른 요소는 그대로다",
        JSON.stringify(elementOf(after, "cvB")) === JSON.stringify(elementOf(before, "cvB")));

      check("sandbox 에서도 한 제스처가 Undo 한 칸이다",
        (await historyState(page)).undo === 1,
        JSON.stringify(await historyState(page)));

      const fs = await frameState(frame);

      check("sandbox 확정이 승인으로 끝났다",
        fs && fs.lastSettle === "accepted" && fs.moveCount === 1,
        fs ? `${fs.lastSettle} · ${fs.moveCount}` : "state 없음");

      const violations = await cspViolations(frame);

      check("sandbox CSP 위반 0", violations.length === 0,
        JSON.stringify(violations.slice(0, 3)));

      /* --- native 와 같은 결과인가 --- */

      await close(page);

      const nativePage = await openStudio(browser, {});
      const nativeFrame = await canvasFrame(nativePage, false);

      await enableCanvasEditing(nativePage);
      await clickElement(nativePage, nativeFrame, false, "cvA");
      await waitForDraggable(nativePage, nativeFrame, true);

      const nativeView = await rectsFor(nativePage, nativeFrame, false, ["cvA"]);
      const nativeScale = nativeView.__canvas.width / 390;

      await dragElement(nativePage, nativeFrame, false, "cvA", 60, 40);

      const nativeMoved = positionOf(await readCanvas(nativePage), "cvA");

      check("native 와 sandbox 가 같은 배율 · 같은 계산을 쓴다",
        Math.abs((nativeMoved.x - 20) * nativeScale - (moved.x - 20) * scale) <= 2 &&
        Math.abs((nativeMoved.y - 40) * nativeScale - (moved.y - 40) * scale) <= 2,
        `native ${JSON.stringify(nativeMoved)} @${nativeScale.toFixed(3)} · ` +
        `sandbox ${JSON.stringify(moved)} @${scale.toFixed(3)}`);

      check("pageerror 0(native)", nativePage.__errors.length === 0,
        nativePage.__errors[0] || "");

      await close(nativePage);

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
