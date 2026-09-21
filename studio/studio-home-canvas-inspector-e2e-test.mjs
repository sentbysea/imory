/* =========================================================
   HOME CANVAS — 왼쪽 Canvas Inspector E2E
   (HOME-CANVAS-INSPECTOR-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §22
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14-15 (PLAN)

   ★ 이번 단계가 소유하는 것은 **왼쪽 패널 한 화면**이다.

   그래서 이 파일이 매번 다시 보는 것은 셋이다.

     1  누가 그 자리의 주인인가 — template 팝오버와 Canvas 패널이
        **동시에** 보이지 않는가
     2  고친 값이 계약대로 저장되는가 — 그 칸 하나만, 나머지는
        한 글자도 그대로
     3  한 번의 편집이 Undo **한 칸**인가

   ── 왜 JSON 으로 재는가 ─────────────────────────────────
   화면 픽셀은 도화지 폭 · 배율에 따라 달라진다. 계약이 말하는
   것은 390 자 위의 숫자와 `props` 의 문자열이므로, 재는 값도
   그것이다(이동 e2e 와 같은 규칙).

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함).

   [panel]    패널 라우팅 — 타입별 화면 · template 과의 소유권 ·
              빈 곳 · 다중 선택 · Select 종료 · HOME 이외 화면
   [text]     글자 — 여러 줄 · 평문 · Undo 한 칸 · Escape ·
              변화 없음 · Save 중 최신값 · geometry 불변 ·
              chrome 재측정
   [geometry] 숫자 칸 — 음수 · auto · rotation 정규화 · 거부 ·
              Undo 한 칸 · 직접 조작 · Undo/Redo 뒤 갱신 · 보존
   [round]    Save → 다시 열기 · Export → Import · Publish resolve
   [sandbox]  별도 origin 프레임에서 같은 결과 + CSP 위반 0

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-inspector-e2e-test.mjs
     node studio/studio-home-canvas-inspector-e2e-test.mjs --only=text
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 9004;
const SANDBOX_PORT = 9005;

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

const FIXTURE_IMAGE_PATH = "/__canvas-inspector-fixture__/swatch.svg";
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
   fixture — 여섯 종류가 **전부** 있다

   패널이 타입마다 다른 화면을 그리므로, 하나라도 빠지면 그 타입의
   화면은 아무도 보지 않은 채 배포된다.

     cvText    height:"auto" 인 글자. 이 파일의 주인공.
               `zzz` 는 **우리가 모르는 요소 필드**이고
               `props.mystery` 는 **모르는 props 필드**다(§22-5 보존).
     cvFixed   숫자 height 인 글자 — 줄이 늘면 내용이 상자를 넘는다.
               chrome 재측정 절이 이것을 쓴다.
     cvPhoto · cvLogo · cvSticker · cvNav · cvShape
               타입별 화면의 대조군.
     cvLocked  잠긴 요소 — 패널이 열리지 않아야 한다.
========================================================== */

const HOME_HTML =
  '<div class="hc-home">' +
  '<p class="hc-outside">도화지 밖 요소</p>' +
  '<div class="hc-canvas" data-imory-canvas-root></div>' +
  '<div class="hc-gap"></div>' +
  "</div>";

const CANVAS_ELEMENTS = [
  { id: "cvText", type: "text", x: 20, y: 40, width: 200, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "한 줄", role: "title", mystery: "keep-props" },
    zzz: { keep: "unknown-field" } },

  { id: "cvFixed", type: "text", x: 20, y: 140, width: 160, height: 24,
    rotation: 0, hidden: false, locked: false,
    props: { text: "고정 높이", role: "body" } },

  { id: "cvPhoto", type: "photo", x: 230, y: 40, width: 120, height: 90,
    rotation: 0, hidden: false, locked: false, props: { slot: "photo_1" } },

  { id: "cvLogo", type: "logo", x: 230, y: 150, width: 120, height: 60,
    rotation: 0, hidden: false, locked: false,
    props: { slot: "title_logo", fallback: "site_title" } },

  { id: "cvSticker", type: "sticker", x: 20, y: 240, width: 90, height: 90,
    rotation: 0, hidden: false, locked: false, props: { slot: "sticker_1" } },

  /* ★ 숫자 height 다. 이 시나리오에는 그 카테고리가 없어 목록이 비고,
     "auto" 면 상자가 0 이라 누를 수 없다. */
  { id: "cvNav", type: "category_nav", x: 20, y: 360, width: 200, height: 70,
    rotation: 0, hidden: false, locked: false,
    props: { mode: "selected", categoryIds: ["cat-a", "cat-b"] } },

  { id: "cvShape", type: "shape", x: 230, y: 250, width: 100, height: 100,
    rotation: 30, hidden: false, locked: false, props: { kind: "ellipse" } },

  { id: "cvLocked", type: "shape", x: 230, y: 380, width: 100, height: 60,
    rotation: 0, hidden: false, locked: true, props: { kind: "rect" } }
];

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진", required: false },
  { name: "title_logo", label: "로고", required: false },
  { name: "sticker_1", label: "스티커", required: false }
];

const CANVAS_CSS =
  /* ★ 위쪽 여백은 장식이 아니다. Studio 의 Top Dock 이 Preview 위에
     떠 있어서, 문서 맨 위(y≈0)에 있는 요소는 눌러도 그 막대가 먼저
     받는다 — 도화지 밖 요소를 그 아래로 내려 둔다. */
  ".hc-home { padding: 240px 0 0; margin: 0; }" +
  ".hc-canvas { width: 100%; }" +
  ".hc-gap { height: 200px; }" +
  ".hc-outside { margin: 0 0 8px; padding: 8px; background: #eee; }" +
  '[data-imory-canvas-type="text"] { font: 14px/1.5 Arial, sans-serif; }' +
  '[data-imory-canvas-type="shape"] { background: #d2b48c; }' +
  '[data-imory-canvas-type="sticker"] { background: #e8dcc8; }' +
  '[data-imory-canvas-type="category_nav"] { background: #dce8e2; }' +
  '[data-imory-canvas-type="photo"] { background: #efe3d2; }' +
  '[data-imory-canvas-type="logo"] { background: #e6e0f0; }';


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
      /* 우리가 모르는 **다른 항목** — 패널이 이것을 지우면 안 된다 */
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


/*
  이 배포가 **모르는** version. 계약 §9-(3) 에 따라 파일은 통과하고
  보존되지만 실행되지 않는다 — 그러면 고를 요소도 없고 패널도 없다.
*/
function futurePackage() {

  const pkg =
    skinPackage({});

  const entry =
    pkg.regions.find((r) => r.name === "home_canvas");

  entry.canvas = {
    version: 2,
    baseWidth: 390,
    baseHeight: 844,
    elements: [{ id: "v2only", kind: "flow", something: "else" }]
  };

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

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
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
   좌표 — native 는 부모에서, sandbox 는 중첩 프레임 좌표로
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

    return out;

  }, selectors);

}


async function sandboxRects(page, frame, selectors) {

  const out = {};

  for (const sel of selectors) {

    const box =
      await frame.locator(sel).first().boundingBox().catch(() => null);

    out[sel] =
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


async function bringIntoView(page, frame, sandbox, selector) {

  if (sandbox) {

    await frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - window.innerHeight * 0.55);
    }, selector);

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
    }, selector);

  }

  await sleep(350);

}


async function clickSelector(page, frame, sandbox, selector, options) {

  const o = options || {};

  await bringIntoView(page, frame, sandbox, selector);

  const rects =
    sandbox
      ? await sandboxRects(page, frame, [selector])
      : await nativeRects(page, [selector]);

  const box =
    rects[selector];

  if (!box) throw new Error("요소를 찾지 못했습니다: " + selector);

  const x =
    box.left + box.width * (o.fx === undefined ? 0.5 : o.fx);

  const y =
    box.top + box.height * (o.fy === undefined ? 0.5 : o.fy);

  if (o.shift) await page.keyboard.down("Shift");

  await page.mouse.click(x, y);

  if (o.shift) await page.keyboard.up("Shift");

  await sleep(o.settle === undefined ? 600 : o.settle);

}


const clickElement = (page, frame, sandbox, id, options) =>
  clickSelector(page, frame, sandbox, byId(id), options);


/* =========================================================
   읽기
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
    ? JSON.stringify(currentWorkingSkin.regions)
    : null
);


const elementOf = (canvas, id) =>
  canvas ? canvas.canvas.elements.find((el) => el.id === id) || null : null;


const textOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el && el.props ? el.props.text : null;
};


const geometryOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el
    ? { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation }
    : null;
};


/* 왼쪽 패널이 지금 무엇을 보여 주고 있는가 — DOM 그대로 읽는다 */
const readPanel = (page) => page.evaluate(() => {

  const seen = (id) => {
    const el = document.getElementById(id);
    return !!(el && !el.hidden && el.getClientRects().length);
  };

  const textOfId = (id) => {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : null;
  };

  const rows =
    Array.from(
      document.querySelectorAll("#studioCanvasInspector .studio-canvas-inspector-read")
    ).map((row) => row.textContent.trim());

  const errorOf = (field) => {
    const el = document.getElementById(`studioCanvasInspectorError-${field}`);
    return el && !el.hidden ? el.textContent.trim() : "";
  };

  const valueOf = (field) => {
    const el = document.getElementById(`studioCanvasInspector-${field}`);
    return el ? el.value : null;
  };

  const text =
    document.getElementById("studioCanvasInspectorText");

  return {
    canvasPanel: seen("studioCanvasInspector"),
    popover: seen("studioInspectorPopover"),
    hint: (() => {
      const el = document.getElementById("studioLeftPanelSelectEmpty");
      if (!el) return false;
      return getComputedStyle(el).display !== "none";
    })(),
    title: textOfId("studioCanvasInspectorTitle"),
    meta: textOfId("studioCanvasInspectorMeta"),
    rows: rows,
    hasText: !!text,
    textValue: text ? text.value : null,
    textMax: text ? text.maxLength : null,
    hasGeometry: !!document.getElementById("studioCanvasInspectorGeometry"),
    hasAuto: !!document.getElementById("studioCanvasInspectorAuto"),
    autoChecked: (() => {
      const el = document.getElementById("studioCanvasInspectorAuto");
      return el ? el.checked : null;
    })(),
    heightDisabled: (() => {
      const el = document.getElementById("studioCanvasInspector-height");
      return el ? el.disabled : null;
    })(),
    multiNote: textOfId("studioCanvasInspectorMultiNote"),
    imageNote: textOfId("studioCanvasInspectorImageNote"),
    navNote: textOfId("studioCanvasInspectorNavNote"),
    shapeNote: textOfId("studioCanvasInspectorShapeNote"),
    values: {
      x: valueOf("x"),
      y: valueOf("y"),
      width: valueOf("width"),
      height: valueOf("height"),
      rotation: valueOf("rotation")
    },
    errors: {
      x: errorOf("x"),
      y: errorOf("y"),
      width: errorOf("width"),
      height: errorOf("height"),
      rotation: errorOf("rotation"),
      text: errorOf("text")
    },
    state: window.getStudioCanvasInspectorState
      ? window.getStudioCanvasInspectorState()
      : null,
    inspectorSelection: (() => {
      const hit = window.getStudioInspectorSelection();
      return hit ? hit.editId : null;
    })(),
    canvasSelection: window.getStudioCanvasSelection().ids
  };

});


const historyState = (page) =>
  page.evaluate(() =>
    window.getStudioHistoryState ? window.getStudioHistoryState() : null);


const frameState = (frame) =>
  frame.evaluate(() =>
    (typeof window.__imoryCanvasFrameState === "function")
      ? window.__imoryCanvasFrameState()
      : null);


const cspViolations = (frame) =>
  frame.evaluate(() => (window.__cspViolations || []).slice());


/* 프레임이 그린 글자 — 평문인가 HTML 인가 */
const drawnText = (page, frame, sandbox, id) => {

  const run = (sel) => {
    const el = document.querySelector(sel);
    const body = el ? el.querySelector("[data-imory-canvas-text]") : null;
    return body
      ? { text: body.textContent, html: body.innerHTML, bold: body.querySelectorAll("b").length }
      : null;
  };

  return sandbox
    ? frame.evaluate(run, byId(id))
    : page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        const body = el ? el.querySelector("[data-imory-canvas-text]") : null;
        return body
          ? { text: body.textContent, html: body.innerHTML, bold: body.querySelectorAll("b").length }
          : null;
      }, byId(id));

};


/* textarea 에 실제로 글자를 친다(포커스 → 지우기 → 입력) */
async function typeText(page, value, options) {

  const o = options || {};

  await page.focus("#studioCanvasInspectorText");

  await page.evaluate(() => {
    const el = document.getElementById("studioCanvasInspectorText");
    el.setSelectionRange(0, el.value.length);
  });

  await page.keyboard.press("Delete");

  await page.keyboard.type(value, { delay: o.delay === undefined ? 12 : o.delay });

  await sleep(250);

  /* ★ 세션을 닫는다. 한 칸의 기록은 blur 에서 확정되므로(계약 §22-4)
     이것 없이 Undo 를 세면 항상 0 이다 — 실제 사용에서도 사용자는
     다른 곳을 눌러 빠져나온다. */
  if (!o.keepFocus) {
    await page.evaluate(() => {
      const el = document.getElementById("studioCanvasInspectorText");
      if (el) el.blur();
    });
  }

  await sleep(o.settle === undefined ? 500 : o.settle);

}


/* 숫자 칸 한 번 고치기 — Enter 로 확정하고 blur 까지 간다 */
async function typeNumber(page, field, value, options) {

  const o = options || {};

  const sel = `#studioCanvasInspector-${field}`;

  await page.focus(sel);

  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.setSelectionRange(0, el.value.length);
  }, sel);

  await page.keyboard.press("Delete");

  if (value !== "") {
    await page.keyboard.type(String(value), { delay: 10 });
  }

  if (o.escape) {
    await page.keyboard.press("Escape");
  } else {
    await page.keyboard.press("Enter");
  }

  await sleep(200);

  /* blur 까지 간다 — 확정은 Enter 가 했고, 세션도 닫아야 다음 절이
     깨끗하다 */
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.blur();
  }, sel);

  await sleep(o.settle === undefined ? 500 : o.settle);

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
       [panel] — 누가 그 자리의 주인인가
    ====================================================== */
    if (wants("panel")) {

      section("panel");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const idle = await readPanel(page);

      check("아무것도 고르지 않으면 Canvas 패널이 없고 안내가 보인다",
        idle.canvasPanel === false && idle.popover === false && idle.hint === true,
        JSON.stringify({ c: idle.canvasPanel, p: idle.popover, h: idle.hint }));

      /* --- text --- */

      await clickElement(page, frame, false, "cvText");

      const textPanel = await readPanel(page);

      check("Canvas 글자를 고르면 Canvas Inspector 가 열린다",
        textPanel.canvasPanel === true && textPanel.title === "Canvas 글자",
        String(textPanel.title));

      check("제목은 종류 이름이고 id 는 보조 줄이다",
        textPanel.meta === "Canvas · cvText" &&
        textPanel.title.indexOf("cvText") === -1,
        String(textPanel.meta));

      check("글자에는 textarea 와 geometry 가 함께 있다",
        textPanel.hasText === true && textPanel.hasGeometry === true &&
        textPanel.textValue === "한 줄",
        JSON.stringify({ t: textPanel.hasText, g: textPanel.hasGeometry }));

      check("template 팝오버는 닫혀 있고 안내도 물러난다",
        textPanel.popover === false && textPanel.hint === false);

      check("선택 소유자 둘이 동시에 켜지지 않는다",
        textPanel.inspectorSelection === null &&
        JSON.stringify(textPanel.canvasSelection) === JSON.stringify(["cvText"]),
        JSON.stringify(textPanel.canvasSelection));

      check("auto 높이 요소에는 Auto 스위치가 있고 숫자 칸이 잠긴다",
        textPanel.hasAuto === true && textPanel.autoChecked === true &&
        textPanel.heightDisabled === true,
        JSON.stringify({ a: textPanel.hasAuto, c: textPanel.autoChecked }));

      /* --- photo --- */

      await clickElement(page, frame, false, "cvPhoto");

      const photoPanel = await readPanel(page);

      check("Canvas 사진 — 슬롯 이름과 Images 안내",
        photoPanel.title === "Canvas 사진" &&
        photoPanel.rows.join("|").indexOf("photo_1") !== -1 &&
        photoPanel.imageNote === "이미지는 Images에서 변경합니다.",
        JSON.stringify(photoPanel.rows));

      check("사진에는 글자 입력칸이 없다",
        photoPanel.hasText === false && photoPanel.hasAuto === false);

      /* --- logo --- */

      await clickElement(page, frame, false, "cvLogo");

      const logoPanel = await readPanel(page);

      check("Canvas 로고 — 슬롯 · 대체 표시 · Images 안내",
        logoPanel.title === "Canvas 로고" &&
        logoPanel.rows.join("|").indexOf("title_logo") !== -1 &&
        logoPanel.rows.join("|").indexOf("블로그 제목") !== -1 &&
        !!logoPanel.imageNote,
        JSON.stringify(logoPanel.rows));

      /* --- sticker --- */

      await clickElement(page, frame, false, "cvSticker");

      const stickerPanel = await readPanel(page);

      check("Canvas 스티커 — 슬롯과 Images 안내",
        stickerPanel.title === "Canvas 스티커" &&
        stickerPanel.rows.join("|").indexOf("sticker_1") !== -1 &&
        !!stickerPanel.imageNote,
        JSON.stringify(stickerPanel.rows));

      /* --- category_nav --- */

      await clickElement(page, frame, false, "cvNav");

      const navPanel = await readPanel(page);

      check("Canvas 카테고리 — 지금 개수만 읽기 전용으로",
        navPanel.title === "Canvas 카테고리" &&
        navPanel.rows.join("|").indexOf("2개 지정") !== -1 &&
        !!navPanel.navNote,
        JSON.stringify(navPanel.rows));

      /* --- shape --- */

      await clickElement(page, frame, false, "cvShape");

      const shapePanel = await readPanel(page);

      check("Canvas 도형 — kind 읽기 전용 · 스타일은 스킨 CSS",
        shapePanel.title === "Canvas 도형" &&
        shapePanel.rows.join("|").indexOf("ellipse") !== -1 &&
        !!shapePanel.shapeNote,
        JSON.stringify(shapePanel.rows));

      check("도형에는 Auto 스위치가 없다", shapePanel.hasAuto === false);

      /* --- template 요소로 소유권이 넘어간다 --- */

      await clickSelector(page, frame, false, ".hc-outside");

      const templatePanel = await readPanel(page);

      check("template 요소를 고르면 기존 Inspector 가 주인이 된다",
        templatePanel.popover === true &&
        templatePanel.canvasPanel === false &&
        templatePanel.canvasSelection.length === 0 &&
        !!templatePanel.inspectorSelection,
        JSON.stringify({
          p: templatePanel.popover,
          c: templatePanel.canvasPanel,
          i: templatePanel.inspectorSelection
        }));

      /* --- 빈 곳 --- */

      await clickElement(page, frame, false, "cvText");
      await clickSelector(page, frame, false, ".hc-gap");

      const emptyPanel = await readPanel(page);

      check("빈 곳을 누르면 둘 다 닫히고 안내가 돌아온다",
        emptyPanel.canvasPanel === false && emptyPanel.popover === false &&
        emptyPanel.hint === true,
        JSON.stringify({ c: emptyPanel.canvasPanel, p: emptyPanel.popover }));

      /* --- 다중 선택 --- */

      await clickElement(page, frame, false, "cvText");
      await clickElement(page, frame, false, "cvShape", { shift: true });

      const multi = await readPanel(page);

      check("두 개를 고르면 개수만 알린다",
        multi.canvasPanel === true &&
        multi.title === "Canvas 요소 2개 선택됨" &&
        multi.multiNote === "여러 요소 편집은 아직 지원하지 않습니다.",
        JSON.stringify({ t: multi.title, n: multi.multiNote }));

      check("다중 선택에는 입력칸이 하나도 없다",
        multi.hasText === false && multi.hasGeometry === false &&
        multi.hasAuto === false);

      check("첫 요소를 몰래 primary 로 골라 고치지 않는다",
        multi.state && multi.state.mode === "multi" && multi.state.id === null,
        JSON.stringify(multi.state));

      /* --- 단일로 돌아온다 --- */

      await clickElement(page, frame, false, "cvText");

      const back = await readPanel(page);

      check("단일 선택으로 돌아오면 그 요소의 패널이 곧바로 복원된다",
        back.title === "Canvas 글자" && back.textValue === "한 줄" &&
        back.hasGeometry === true,
        String(back.title));

      /* --- 잠긴 요소 --- */

      await clickElement(page, frame, false, "cvLocked");

      const locked = await readPanel(page);

      check("잠긴 요소로는 패널이 열리지 않는다",
        locked.canvasSelection.indexOf("cvLocked") === -1,
        JSON.stringify(locked.canvasSelection));

      /* --- Select 종료 --- */

      await clickElement(page, frame, false, "cvText");
      await page.click("#studioInspectorButton");
      await sleep(700);

      const off = await readPanel(page);

      check("Select 를 끄면 Canvas 패널도 닫힌다",
        off.canvasPanel === false,
        JSON.stringify({ c: off.canvasPanel }));

      /* --- 유효하지 않은 Canvas (미래 version) --- */

      await enableSelect(page);
      await clickElement(page, frame, false, "cvText");

      const futureImport = await page.evaluate(async (pkgText) => {

        const result = await window.validateSkinPackageImport(pkgText);

        if (!result.ok) {
          return { ok: false, message: result.message };
        }

        window.applyImportedSkinPackage(result.skinPackage, {});

        return { ok: true };

      }, JSON.stringify(futurePackage()));

      await sleep(1200);

      const future = await readPanel(page);

      check("미래 version 캔버스에서는 패널이 열리지 않는다",
        futureImport.ok === true &&
        future.canvasPanel === false && future.canvasSelection.length === 0,
        JSON.stringify({ i: futureImport, c: future.canvasPanel }));

      const futureKept = await readCanvas(page);

      check("v2 데이터는 보존되고 실행되지 않는다",
        futureKept && futureKept.canvas.version === 2 &&
        futureKept.canvas.elements.length === 1 &&
        futureKept.canvas.elements[0].id === "v2only",
        JSON.stringify(futureKept && futureKept.canvas.version));

      /* --- HOME 이외 화면 ---

         ★ 이 관문은 studioCanvasEditingIsOn() 의 첫 줄이다
           (currentPreviewPageType !== "home"). 시나리오 화면에서
           실제 CATEGORY 로 가려면 스킨 안 링크가 필요한데 이 fixture
           에는 없으므로, 관문 자체를 그 자리에서 재운다. */

      const offHome = await page.evaluate(() => {

        const before = currentPreviewPageType;

        currentPreviewPageType = "category";

        const editing = window.studioCanvasEditingIsOn();

        window.renderStudioCanvasInspector();

        const el = document.getElementById("studioCanvasInspector");

        const visible = !!(el && !el.hidden);

        currentPreviewPageType = before;

        return { editing, visible };

      });

      check("HOME 이 아니면 Canvas 패널이 없다",
        offHome.editing === false && offHome.visible === false,
        JSON.stringify(offHome));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [text] — 글자
    ====================================================== */
    if (wants("text")) {

      section("text");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await clickElement(page, frame, false, "cvText");

      const startHistory = await historyState(page);
      const startGeometry = geometryOf(await readCanvas(page), "cvText");

      /* --- 한 줄 → 여러 줄 --- */

      await typeText(page, "첫 줄\n둘째 줄\n셋째 줄");

      const typed = await readCanvas(page);

      check("여러 줄이 그대로 저장된다",
        textOf(typed, "cvText") === "첫 줄\n둘째 줄\n셋째 줄",
        JSON.stringify(textOf(typed, "cvText")));

      const drawn = await drawnText(page, frame, false, "cvText");

      check("입력 중에 Preview 가 곧바로 따라온다",
        drawn && drawn.text === "첫 줄\n둘째 줄\n셋째 줄",
        JSON.stringify(drawn && drawn.text));

      check("글자 편집만으로 geometry 가 달라지지 않는다",
        JSON.stringify(geometryOf(typed, "cvText")) === JSON.stringify(startGeometry),
        JSON.stringify(geometryOf(typed, "cvText")));

      check("모르는 props 필드가 남는다",
        elementOf(typed, "cvText").props.mystery === "keep-props" &&
        elementOf(typed, "cvText").props.role === "title",
        JSON.stringify(elementOf(typed, "cvText").props));

      check("모르는 요소 필드도 남는다",
        JSON.stringify(elementOf(typed, "cvText").zzz) ===
        JSON.stringify({ keep: "unknown-field" }));

      /* --- 한 focus 세션 = Undo 한 칸 --- */

      const afterTyping = await historyState(page);

      check("여러 글자를 쳐도 Undo 는 한 칸이다",
        afterTyping.undo === startHistory.undo + 1,
        `${startHistory.undo} → ${afterTyping.undo}`);

      await page.click("#studioUndoButton");
      await sleep(900);

      check("Undo 한 번이 세션 전체를 되돌린다",
        textOf(await readCanvas(page), "cvText") === "한 줄",
        JSON.stringify(textOf(await readCanvas(page), "cvText")));

      await page.click("#studioRedoButton");
      await sleep(900);

      check("Redo 가 새 문구로 돌아온다",
        textOf(await readCanvas(page), "cvText") === "첫 줄\n둘째 줄\n셋째 줄");

      const afterRedo = await readPanel(page);

      check("Undo · Redo 뒤 패널 값이 따라간다",
        afterRedo.textValue === "첫 줄\n둘째 줄\n셋째 줄",
        JSON.stringify(afterRedo.textValue));

      /* --- HTML 이 아니라 글자다 --- */

      await typeText(page, "<b>굵게</b> & <i>기울임</i>");

      const plain = await drawnText(page, frame, false, "cvText");

      check("태그처럼 생긴 글자가 HTML 로 실행되지 않는다",
        plain && plain.bold === 0 && plain.text === "<b>굵게</b> & <i>기울임</i>",
        JSON.stringify(plain));

      check("저장된 값도 평문 그대로다",
        textOf(await readCanvas(page), "cvText") === "<b>굵게</b> & <i>기울임</i>");

      /* --- 변화 없음 = Undo 0 --- */

      const beforeNoop = await historyState(page);

      await page.focus("#studioCanvasInspectorText");
      await page.evaluate(() => document.getElementById("studioCanvasInspectorText").blur());
      await sleep(500);

      const afterNoop = await historyState(page);

      check("값을 바꾸지 않은 세션은 기록을 만들지 않는다",
        afterNoop.undo === beforeNoop.undo,
        `${beforeNoop.undo} → ${afterNoop.undo}`);

      /* --- Escape --- */

      const beforeEscape = await historyState(page);

      await page.focus("#studioCanvasInspectorText");
      await page.keyboard.type("되돌릴 글자", { delay: 12 });
      await sleep(300);
      await page.keyboard.press("Escape");
      await sleep(700);

      const escaped = await readCanvas(page);
      const afterEscape = await historyState(page);

      check("Escape 가 focus 시작 문구로 되돌린다",
        textOf(escaped, "cvText") === "<b>굵게</b> & <i>기울임</i>",
        JSON.stringify(textOf(escaped, "cvText")));

      check("Escape 는 Undo 를 만들지 않는다",
        afterEscape.undo === beforeEscape.undo,
        `${beforeEscape.undo} → ${afterEscape.undo}`);

      /* --- 입력 중 Save --- */

      await page.focus("#studioCanvasInspectorText");
      await page.evaluate(() => {
        const el = document.getElementById("studioCanvasInspectorText");
        el.setSelectionRange(0, el.value.length);
      });
      await page.keyboard.press("Delete");
      await page.keyboard.type("저장 직전 글자", { delay: 12 });
      await sleep(350);

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const savedText = await page.evaluate(() => {
        const calls = window.__savedDraftCallsLay;
        const content = calls[calls.length - 1].p_content;
        const entry = (content.regions || []).find((r) => r && r.name === "home_canvas");
        const el = entry ? entry.canvas.elements.find((e) => e.id === "cvText") : null;
        return el ? el.props.text : null;
      });

      check("입력 중에 Save 를 눌러도 최신 글자가 실린다",
        savedText === "저장 직전 글자", JSON.stringify(savedText));

      /* --- 길이 경계 --- */

      const limits = await page.evaluate(() => {

        const gen = window.getStudioCanvasSelection().generation;
        const long = "가".repeat(2001);
        const fit = "나".repeat(2000);

        const current = () => {
          const entry =
            (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");
          return entry.canvas.elements.find((e) => e.id === "cvText").props.text;
        };

        const tooLong = window.commitStudioCanvasInspectorEdit({
          kind: "text",
          id: "cvText",
          expected: { text: current() },
          next: { text: long },
          generation: gen
        });

        const okLong = window.commitStudioCanvasInspectorEdit({
          kind: "text",
          id: "cvText",
          expected: { text: current() },
          next: { text: fit },
          generation: gen
        });

        return {
          tooLong: tooLong.accepted,
          tooLongReason: tooLong.reason,
          okLong: okLong.accepted,
          stored: current().length
        };

      });

      check("2000자를 넘으면 거부한다",
        limits.tooLong === false && limits.tooLongReason === "length",
        JSON.stringify(limits));

      check("2000자는 받아들인다",
        limits.okLong === true && limits.stored === 2000,
        JSON.stringify(limits));

      const maxAttr = (await readPanel(page)).textMax;

      check("입력칸 자체가 2000자에서 멈춘다", maxAttr === 2000, String(maxAttr));

      /* --- 잘못된 입력은 draft 를 일부만 고치지 않는다 --- */

      const bad = await page.evaluate(() => {

        const gen = window.getStudioCanvasSelection().generation;

        const entry = () =>
          (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

        const before = JSON.stringify(entry());

        const results = [
          window.commitStudioCanvasInspectorEdit({
            kind: "text", id: "cvText",
            expected: { text: entry().canvas.elements[0].props.text },
            next: { text: 42 }, generation: gen
          }),
          window.commitStudioCanvasInspectorEdit({
            kind: "text", id: "cvText",
            expected: { text: entry().canvas.elements[0].props.text },
            next: { text: "새 글", role: "body" }, generation: gen
          }),
          window.commitStudioCanvasInspectorEdit({
            kind: "text", id: "cvPhoto",
            expected: { text: "" }, next: { text: "그림에 글자" }, generation: gen
          })
        ];

        return {
          accepted: results.map((r) => r.accepted),
          reasons: results.map((r) => r.reason),
          unchanged: JSON.stringify(entry()) === before
        };

      });

      check("숫자 · 허용 외 키 · 다른 타입은 전부 거부한다",
        bad.accepted.every((v) => v === false),
        JSON.stringify(bad.reasons));

      check("거부된 요청이 draft 를 한 글자도 바꾸지 않았다",
        bad.unchanged === true);

      /* --- chrome 재측정 --- */

      await clickElement(page, frame, false, "cvFixed");
      await sleep(600);

      const chromeBefore = await frameState(frame);

      await typeText(page, "한 줄\n두 줄\n세 줄\n네 줄\n다섯 줄");

      const chromeAfter = await frameState(frame);

      const bottomOf = (state) =>
        (state && state.chromePadding) ? state.chromePadding.bottom : null;

      check("줄이 늘면 선택 chrome 이 새 content bounds 를 다시 잰다",
        bottomOf(chromeBefore) !== null && bottomOf(chromeAfter) !== null &&
        bottomOf(chromeAfter) > bottomOf(chromeBefore),
        `${bottomOf(chromeBefore)} → ${bottomOf(chromeAfter)}`);

      check("chrome 재측정이 저장 geometry 를 바꾸지 않는다",
        JSON.stringify(geometryOf(await readCanvas(page), "cvFixed")) ===
        JSON.stringify({ x: 20, y: 140, width: 160, height: 24, rotation: 0 }),
        JSON.stringify(geometryOf(await readCanvas(page), "cvFixed")));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [geometry] — 숫자 칸
    ====================================================== */
    if (wants("geometry")) {

      section("geometry");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await clickElement(page, frame, false, "cvShape");

      const beforeAll = await readRegions(page);

      /* --- 음수 x --- */

      const beforeOne = await historyState(page);

      await typeNumber(page, "x", -40);

      const negative = geometryOf(await readCanvas(page), "cvShape");

      check("음수 X 를 받아들인다", negative.x === -40, JSON.stringify(negative));

      check("한 칸의 한 편집 세션이 Undo 한 칸이다",
        (await historyState(page)).undo === beforeOne.undo + 1,
        `${beforeOne.undo} → ${(await historyState(page)).undo}`);

      /* --- Width 만 바꾸면 Height 는 그대로 --- */

      await typeNumber(page, "width", 140);

      const sized = geometryOf(await readCanvas(page), "cvShape");

      check("Width 숫자 입력은 비율을 유지하지 않는다(Height 불변)",
        sized.width === 140 && sized.height === 100,
        JSON.stringify(sized));

      check("회전은 리사이즈가 건드리지 않는다", sized.rotation === 30);

      /* --- rotation 정규화 --- */

      await typeNumber(page, "rotation", 400);

      const rotated = geometryOf(await readCanvas(page), "cvShape");

      check("rotation 은 한 바퀴 안으로 접힌다(400 → 40)",
        rotated.rotation === 40, String(rotated.rotation));

      const rotatedPanel = await readPanel(page);

      check("화면도 접힌 값을 보여 준다",
        rotatedPanel.values.rotation === "40",
        String(rotatedPanel.values.rotation));

      await typeNumber(page, "rotation", -30);

      check("음수도 같은 자로 접힌다(-30 → 330)",
        geometryOf(await readCanvas(page), "cvShape").rotation === 330,
        String(geometryOf(await readCanvas(page), "cvShape").rotation));

      /* --- 잘못된 입력 --- */

      const beforeBad = await readCanvas(page);
      const beforeBadHistory = await historyState(page);

      await typeNumber(page, "width", "");

      const emptyPanel = await readPanel(page);

      check("빈 값은 0 으로 저장되지 않고 오류를 적는다",
        !!emptyPanel.errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140,
        JSON.stringify(emptyPanel.errors.width));

      await typeNumber(page, "width", "abc");

      check("숫자가 아니면 거부한다",
        !!(await readPanel(page)).errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140);

      await typeNumber(page, "width", "1e9");

      check("상한 밖은 거부한다",
        !!(await readPanel(page)).errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140);

      await typeNumber(page, "width", "0");

      check("0 폭은 거부한다",
        !!(await readPanel(page)).errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140);

      check("거부는 draft 를 한 칸도 바꾸지 않았다",
        JSON.stringify(await readCanvas(page)) === JSON.stringify(beforeBad));

      check("거부는 기록도 만들지 않았다",
        (await historyState(page)).undo === beforeBadHistory.undo,
        `${beforeBadHistory.undo} → ${(await historyState(page)).undo}`);

      /* --- Escape · 변화 0 --- */

      const beforeEscape = await historyState(page);

      await typeNumber(page, "x", 999, { escape: true });

      check("Escape 는 값을 되돌리고 기록도 만들지 않는다",
        geometryOf(await readCanvas(page), "cvShape").x === -40 &&
        (await historyState(page)).undo === beforeEscape.undo,
        JSON.stringify(geometryOf(await readCanvas(page), "cvShape")));

      await typeNumber(page, "x", -40);

      check("같은 값을 다시 넣으면 기록 0 칸이다",
        (await historyState(page)).undo === beforeEscape.undo,
        `${beforeEscape.undo} → ${(await historyState(page)).undo}`);

      /* --- auto 높이 --- */

      await clickElement(page, frame, false, "cvText");

      const autoOn = await readPanel(page);

      check("text 는 Auto 로 시작한다",
        autoOn.autoChecked === true && autoOn.heightDisabled === true);

      await page.click("#studioCanvasInspectorAuto");
      await sleep(900);

      const fixed = geometryOf(await readCanvas(page), "cvText");

      check("Auto 를 끄면 지금 높이가 숫자로 굳는다",
        typeof fixed.height === "number" && fixed.height > 0,
        JSON.stringify(fixed.height));

      const fixedPanel = await readPanel(page);

      check("숫자가 되면 Height 칸이 열린다",
        fixedPanel.heightDisabled === false && fixedPanel.values.height !== "");

      await typeNumber(page, "height", 88);

      check("숫자 높이를 직접 넣을 수 있다",
        geometryOf(await readCanvas(page), "cvText").height === 88);

      await page.click("#studioCanvasInspectorAuto");
      await sleep(900);

      check('Auto 를 다시 켜면 "auto" 로 돌아간다',
        geometryOf(await readCanvas(page), "cvText").height === "auto",
        JSON.stringify(geometryOf(await readCanvas(page), "cvText").height));

      /* --- 허용되지 않는 타입 --- */

      const autoRejected = await page.evaluate(() => {

        const entry = () =>
          (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

        const el = () => entry().canvas.elements.find((e) => e.id === "cvShape");

        /* 지금 고른 것은 cvText 다 — 고르지 않은 요소는 애초에 거부다.
           그래서 먼저 고른 뒤에 넣는다. */
        return { current: el().height };

      });

      await clickElement(page, frame, false, "cvShape");

      const shapeAuto = await page.evaluate(() => {

        const gen = window.getStudioCanvasSelection().generation;

        const entry =
          (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

        const el = entry.canvas.elements.find((e) => e.id === "cvShape");

        return window.commitStudioCanvasInspectorEdit({
          kind: "resize",
          id: "cvShape",
          expected: { x: el.x, y: el.y, width: el.width, height: el.height },
          next: { x: el.x, y: el.y, width: el.width, height: "auto" },
          generation: gen
        });

      });

      check('도형에는 "auto" 를 쓸 수 없다',
        shapeAuto.accepted === false && shapeAuto.reason === "auto",
        JSON.stringify(shapeAuto) + " / " + JSON.stringify(autoRejected));

      /* --- 직접 조작 뒤 패널 값 --- */

      await clickElement(page, frame, false, "cvPhoto");

      const beforeDrag = await readPanel(page);

      const rects = await nativeRects(page, [byId("cvPhoto")]);
      const box = rects[byId("cvPhoto")];

      await page.mouse.move((box.left + box.right) / 2, (box.top + box.bottom) / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) {
        await page.mouse.move(
          (box.left + box.right) / 2 + (60 * i) / 8,
          (box.top + box.bottom) / 2 + (40 * i) / 8
        );
      }
      await page.mouse.up();
      await sleep(900);

      const afterDrag = await readPanel(page);
      const draggedGeometry = geometryOf(await readCanvas(page), "cvPhoto");

      check("드래그 뒤 패널 값이 곧바로 새 좌표를 보여 준다",
        afterDrag.values.x === String(draggedGeometry.x) &&
        afterDrag.values.y === String(draggedGeometry.y) &&
        afterDrag.values.x !== beforeDrag.values.x,
        JSON.stringify(afterDrag.values));

      await page.click("#studioUndoButton");
      await sleep(900);

      const afterUndo = await readPanel(page);

      check("Undo 뒤에도 패널 값이 따라간다",
        afterUndo.values.x === "230" && afterUndo.values.y === "40",
        JSON.stringify(afterUndo.values));

      /* --- 다른 요소 · 다른 region 불변 --- */

      const finalRegions = JSON.parse(await readRegions(page));
      const startRegions = JSON.parse(beforeAll);

      const other = (regions) =>
        JSON.stringify(regions.find((r) => r && r.name === "some_other_region"));

      check("다른 region 항목은 그대로다",
        other(finalRegions) === other(startRegions), other(finalRegions));

      const untouched = (regions, id) => {
        const entry = regions.find((r) => r && r.name === "home_canvas");
        return JSON.stringify(entry.canvas.elements.find((e) => e.id === id));
      };

      check("건드리지 않은 요소는 한 글자도 바뀌지 않았다",
        untouched(finalRegions, "cvNav") === untouched(startRegions, "cvNav") &&
        untouched(finalRegions, "cvLogo") === untouched(startRegions, "cvLogo"));

      check("canvas 의 모르는 칸과 항목의 모르는 칸이 남는다",
        (() => {
          const entry = finalRegions.find((r) => r && r.name === "home_canvas");
          return entry.note === "unknown-entry-field" &&
            entry.canvas.extra === "unknown-canvas-field";
        })());

      check("요소 순서가 그대로다",
        (() => {
          const ids = (regions) =>
            regions.find((r) => r && r.name === "home_canvas")
              .canvas.elements.map((e) => e.id).join();
          return ids(finalRegions) === ids(startRegions);
        })());

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
      await clickElement(page, frame, false, "cvText");

      await typeText(page, "왕복\n두 줄");
      await typeNumber(page, "x", 55);

      const edited = await readCanvas(page);

      check("패널이 고친 값이 draft 에 있다",
        textOf(edited, "cvText") === "왕복\n두 줄" &&
        geometryOf(edited, "cvText").x === 55,
        JSON.stringify(geometryOf(edited, "cvText")));

      /* --- 입력 non-mutation --- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const el = entry.canvas.elements.find((e) => e.id === "cvText");
        return { text: el.props.text, x: el.x };
      });

      check("들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.text === "한 줄" && untouched.x === 20,
        JSON.stringify(untouched));

      /* --- Export → Import --- */

      const roundTrip = await page.evaluate(async () => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const text = window.serializeSkinPackageExport(exported.skinPackage);

        const result = await window.validateSkinPackageImport(text);

        if (!result.ok) return { ok: false, message: result.message };

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const el = entry ? entry.canvas.elements.find((e) => e.id === "cvText") : null;

        return {
          ok: true,
          text: el ? el.props.text : null,
          role: el ? el.props.role : null,
          mystery: el ? el.props.mystery : null,
          x: el ? el.x : null,
          zzz: el ? JSON.stringify(el.zzz) : null
        };

      });

      check("Export → Import 를 지나도 문구와 좌표가 같다",
        roundTrip.ok && roundTrip.text === "왕복\n두 줄" && roundTrip.x === 55,
        JSON.stringify(roundTrip));

      check("Export → Import 에서 모르는 필드도 남는다",
        roundTrip.ok && roundTrip.mystery === "keep-props" &&
        roundTrip.role === "title" &&
        roundTrip.zzz === JSON.stringify({ keep: "unknown-field" }),
        JSON.stringify(roundTrip));

      /* --- Publish resolve --- */

      const resolved = await page.evaluate(() => {

        const payload =
          window.resolveSkinHomeCanvas(
            currentWorkingSkin,
            currentWorkingSkin.templates.home.html
          );

        const el = payload ? payload.elements.find((e) => e.id === "cvText") : null;

        return el ? { text: el.props.text, role: el.props.role, x: el.x } : null;

      });

      check("Publish 이 쓰는 resolve 에서도 같은 문구다",
        resolved && resolved.text === "왕복\n두 줄" && resolved.x === 55 &&
        resolved.role === "title",
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
        return calls[calls.length - 1].p_content;
      });

      await close(page);

      const reopened = await openStudio(browser, { package: saved });

      await canvasFrame(reopened, false);

      const reloaded = await readCanvas(reopened);

      check("저장된 draft 로 다시 열면 그 문구가 그대로다",
        textOf(reloaded, "cvText") === "왕복\n두 줄" &&
        geometryOf(reloaded, "cvText").x === 55,
        JSON.stringify(textOf(reloaded, "cvText")));

      const drawnAgain = await drawnText(reopened, null, false, "cvText");

      check("다시 연 화면이 그 문구를 실제로 그린다",
        drawnAgain && drawnAgain.text === "왕복\n두 줄",
        JSON.stringify(drawnAgain && drawnAgain.text));

      await close(reopened);

    }


    /* ======================================================
       [sandbox] — 별도 origin 프레임
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);

      await clickElement(page, frame, true, "cvText");

      const panel = await readPanel(page);

      check("sandbox 에서도 같은 부모 패널이 열린다",
        panel.canvasPanel === true && panel.title === "Canvas 글자" &&
        panel.textValue === "한 줄",
        JSON.stringify({ t: panel.title, v: panel.textValue }));

      await typeText(page, "sandbox 글자\n두 줄");

      check("sandbox 에서도 draft 가 같은 문구를 갖는다",
        textOf(await readCanvas(page), "cvText") === "sandbox 글자\n두 줄",
        JSON.stringify(textOf(await readCanvas(page), "cvText")));

      const drawn = await drawnText(page, frame, true, "cvText");

      check("별도 origin 프레임이 그 문구를 평문으로 그린다",
        drawn && drawn.text === "sandbox 글자\n두 줄" && drawn.bold === 0,
        JSON.stringify(drawn && drawn.text));

      await typeNumber(page, "x", 77);

      check("sandbox 에서도 숫자 칸이 저장된다",
        geometryOf(await readCanvas(page), "cvText").x === 77,
        JSON.stringify(geometryOf(await readCanvas(page), "cvText")));

      const violations = await cspViolations(frame);

      check("프레임 CSP 위반 0", violations.length === 0,
        JSON.stringify(violations.slice(0, 3)));

      const parentViolations =
        await page.evaluate(() => (window.__cspViolations || []).slice());

      check("부모 CSP 위반 0", parentViolations.length === 0,
        JSON.stringify(parentViolations.slice(0, 3)));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }

  }
  finally {
    await browser.close();
    servers.forEach((s) => s.close());
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    failures.forEach((f) => console.log("  - " + f));
    process.exitCode = 1;
  }

}


main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
