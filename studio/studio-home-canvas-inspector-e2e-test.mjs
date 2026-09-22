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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  '[data-imory-canvas-type="logo"] { background: #e6e0f0; }' +
  /* v2 의 divider — 칠하지 않으면 4px 투명 상자라 손으로 누르기 어렵다 */
  '[data-imory-canvas-type="divider"] { background: #cdc3b6; }';


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


/* =========================================================
   v2 fixture (HOME-CANVAS-V2-EDITOR-1A)

   블록 다섯이 §14-4 의 표를 한 번씩 밟는다 — logo · text · divider ·
   category_nav · main_visual. `main_visual` 안에는 사진과 장식이
   있어서 "한 번 클릭 → 프레임 / 한 번 더 → 안쪽"을 잴 수 있다.

     v2Text    글자 블록. 이 절의 주인공.
               `zzz` 는 **모르는 블록 필드**, `props.mystery` 는
               **모르는 props 필드**다(§25-1 보존).
     v2Main    main_visual — 그 안에 v2Photo(사진) · v2Paper(장식)
     v2Wide    align:"stretch" — 흐름 폭을 거의 다 쓴다(hit-test 가
               "페이지 전체 래퍼"로 떨어뜨리지 않는지 본다)
========================================================== */

const V2_BLOCKS = [
  { id: "v2Logo", type: "logo", width: 160, height: 48, align: "left",
    props: { slot: "title_logo", fallback: "site_title" } },

  { id: "v2Text", type: "text", width: 300, height: "auto", align: "center",
    margin: { top: 10, right: 0, bottom: 6, left: 0 },
    zzz: { keep: "unknown-block-field" },
    props: { text: "한 줄", role: "title", mystery: "keep-props" } },

  { id: "v2Rule", type: "divider", width: 120, height: 14, align: "center" },

  { id: "v2Wide", type: "category_nav", width: 342, height: 60, align: "stretch",
    props: { mode: "selected", categoryIds: ["cat-a"] } },

  { id: "v2Main", type: "main_visual", width: 300, height: 200, align: "center",
    margin: { top: 12, right: 0, bottom: 0, left: 0 },
    props: {
      baseWidth: 150, baseHeight: 100, primaryId: "v2Photo",
      elements: [
        { id: "v2Paper", type: "shape", follow: "transform",
          x: -5, y: 0, width: 150, height: 90, rotation: -4, props: { kind: "rect" } },
        { id: "v2Photo", type: "photo", follow: "transform",
          x: 10, y: 5, width: 120, height: 80, props: { slot: "photo_1" } },
        { id: "v2Tag", type: "text", follow: "pin", width: 60, height: 20,
          pin: { target: "photo", anchor: "right", origin: "left", offset: { x: 6, y: 0 } },
          props: { text: "tag", role: "label" } }
      ]
    } }
];

const V2_OVERLAYS = [
  { id: "v2Over", type: "text", x: 20, y: 700, width: 120, height: 40,
    rotation: 0, props: { text: "overlay", role: "label" } }
];


function v2Package(options) {

  const o = options || {};

  const pkg =
    skinPackage(o);

  const entry =
    pkg.regions.find((r) => r.name === "home_canvas");

  entry.canvas = {
    version: 2,
    baseWidth: 390,
    baseHeight: 1100,
    extra: "unknown-canvas-field",
    flow: {
      direction: "column",
      padding: { top: 40, right: 24, bottom: 40, left: 24 },
      gap: 10,
      blocks: JSON.parse(JSON.stringify(V2_BLOCKS))
    },
    overlays: JSON.parse(JSON.stringify(V2_OVERLAYS))
  };

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

  /*
    ★ 숫자는 **3** 이다. HOME-CANVAS-V2-DATA-1 부터 `version: 2` 는
      실제로 검증되는 조합형 Canvas 라, 그 숫자로는 "이 배포가 모르는
      version" 을 더 이상 만들 수 없다. 이 함수가 보려는 것은 그대로다
      — 실행되지 않는 canvas 에서는 고를 요소가 없다.
  */
  entry.canvas = {
    version: 3,
    baseWidth: 390,
    baseHeight: 844,
    elements: [{ id: "v3only", kind: "flow", something: "else" }]
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
      el.scrollIntoView({ block: "center", inline: "center" });
    }, selector);

  }
  else {

    await page.evaluate((sel) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(sel);
      if (!el) return;
      /* ★ scrollBy 가 아니라 scrollIntoView 다. 앞의 것은 "지금 자리에서
         얼마나" 라서 스크롤 담당 요소가 window 가 아니거나 그 사이에
         다시 그려지면 어긋난 만큼이 그대로 쌓인다 — v2 절에서 블록이
         화면 밖(-1600px)으로 밀려 클릭이 통째로 빗나갔다. */
      el.scrollIntoView({ block: "center", inline: "center" });
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


/* ---- v2 (HOME-CANVAS-V2-EDITOR-1A) ---- */

const v2Blocks = (canvas) =>
  (canvas && canvas.canvas && canvas.canvas.flow) ? canvas.canvas.flow.blocks : [];

const v2BlockOf = (canvas, id) =>
  v2Blocks(canvas).find((b) => b && b.id === id) || null;

/* 블록 · 프레임 내부 · overlay 어디에 있든 찾는다 */
const v2NodeOf = (canvas, id) => {

  const block = v2BlockOf(canvas, id);

  if (block) {
    return block;
  }

  for (const b of v2Blocks(canvas)) {
    const inner = (b && b.props && b.props.elements) || [];
    const hit = inner.find((e) => e && e.id === id);
    if (hit) return hit;
  }

  const overlays = (canvas && canvas.canvas && canvas.canvas.overlays) || [];

  return overlays.find((e) => e && e.id === id) || null;

};

const v2OrderOf = (canvas) =>
  v2Blocks(canvas).map((b) => b.id).join(",");

const v2TextOf = (canvas, id) => {
  const node = v2NodeOf(canvas, id);
  return node && node.props ? node.props.text : null;
};


/* v2 패널이 지금 무엇을 보여 주는가 */
const readV2Panel = (page) => page.evaluate(() => {

  const textOfId = (id) => {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : null;
  };

  const valueOf = (field) => {
    const el = document.getElementById(`studioCanvasInspectorV2-${field}`);
    return el ? el.value : null;
  };

  const errorOf = (field) => {
    const el = document.getElementById(`studioCanvasInspectorError-${field}`);
    return el && !el.hidden ? el.textContent.trim() : "";
  };

  const align =
    document.getElementById("studioCanvasInspectorAlign");

  const auto =
    document.getElementById("studioCanvasInspectorV2Auto");

  const up =
    document.getElementById("studioCanvasInspectorOrderUp");

  const down =
    document.getElementById("studioCanvasInspectorOrderDown");

  const text =
    document.getElementById("studioCanvasInspectorText");

  return {
    title: textOfId("studioCanvasInspectorTitle"),
    meta: textOfId("studioCanvasInspectorMeta"),
    where: textOfId("studioCanvasInspectorWhere"),
    hasLayout: !!document.getElementById("studioCanvasInspectorV2Layout"),
    hasReadOnly: !!document.getElementById("studioCanvasInspectorV2Read"),
    /* v1 화면의 자리 — v2 에서는 없어야 한다 */
    hasV1Geometry: !!document.getElementById("studioCanvasInspectorGeometry"),
    hasText: !!text,
    textValue: text ? text.value : null,
    align: align ? align.value : null,
    alignOptions: align ? Array.from(align.options).map((o) => o.value) : null,
    auto: auto ? auto.checked : null,
    orderAt: textOfId("studioCanvasInspectorOrderAt"),
    upDisabled: up ? up.disabled : null,
    downDisabled: down ? down.disabled : null,
    heightDisabled: (() => {
      const el = document.getElementById("studioCanvasInspectorV2-height");
      return el ? el.disabled : null;
    })(),
    values: {
      width: valueOf("width"),
      height: valueOf("height"),
      top: valueOf("top"),
      right: valueOf("right"),
      bottom: valueOf("bottom"),
      left: valueOf("left")
    },
    errors: {
      width: errorOf("width"),
      height: errorOf("height"),
      top: errorOf("top"),
      align: errorOf("align"),
      order: errorOf("order"),
      text: errorOf("text")
    },
    canvasSelection: window.getStudioCanvasSelection().ids,
    primaryId: window.getStudioCanvasSelection().primaryId
  };

});


/* v2 숫자 칸에 값을 넣고 확정한다(Enter) */
async function typeV2Number(page, field, value) {

  const sel = `#studioCanvasInspectorV2-${field}`;

  await page.focus(sel);

  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.setSelectionRange(0, el.value.length);
  }, sel);

  await page.keyboard.press("Delete");

  await page.keyboard.type(String(value), { delay: 10 });

  await page.keyboard.press("Enter");

  /* ★ 확정한 뒤 포커스를 놓는다. 다음 typeV2Number 가 잠긴 칸을
     겨냥하면 Playwright 는 포커스를 옮기지 못하고, 그러면 글자가
     **이 칸에** 그대로 이어 붙는다(실제로 -8 이 -890 이 됐다). */
  await page.evaluate((f) => {
    const el = document.querySelector(f);
    if (el) el.blur();
  }, sel);

  await sleep(350);

}


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

      check("미래 version 데이터는 보존되고 실행되지 않는다",
        futureKept && futureKept.canvas.version === 3 &&
        futureKept.canvas.elements.length === 1 &&
        futureKept.canvas.elements[0].id === "v3only",
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
       [v2] — 조합형 Canvas 의 선택과 기본 배치 (V2-EDITOR-1A)
    ====================================================== */
    if (wants("v2")) {

      section("v2");

      const page = await openStudio(browser, { package: v2Package({}) });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      /* ---- 1. 블록을 고를 수 있다 ---- */

      await clickElement(page, frame, false, "v2Text");

      let panel = await readV2Panel(page);

      check("★ v2 글자 블록을 누르면 Canvas 패널이 그 블록을 연다",
        same(panel.canvasSelection, ["v2Text"]) &&
        panel.meta === "Canvas · v2Text" &&
        panel.title === "Canvas 글자",
        JSON.stringify({ s: panel.canvasSelection, m: panel.meta, t: panel.title }));

      check("★ v2 화면은 흐름 칸이고 v1 의 자유 좌표 칸은 없다",
        panel.hasLayout === true && panel.hasV1Geometry === false &&
        panel.values.width === "300" && panel.values.height === "" &&
        panel.align === "center",
        JSON.stringify(panel.values));

      check("★ 정렬은 계약의 네 값이다",
        same(panel.alignOptions, ["left", "center", "right", "stretch"]),
        JSON.stringify(panel.alignOptions));

      check("★ 여백 네 칸이 저장값대로다(빠진 칸은 0)",
        panel.values.top === "10" && panel.values.bottom === "6" &&
        panel.values.right === "0" && panel.values.left === "0",
        JSON.stringify(panel.values));

      check("★ height \"auto\" 면 Auto 가 켜져 있고 Height 칸이 잠긴다",
        panel.auto === true && panel.heightDisabled === true);

      check("★ 순서가 몇 번째인지 보인다(배열 자리 — 숨긴 블록도 한 칸)",
        panel.orderAt === "2 / 5" && panel.upDisabled === false,
        panel.orderAt);

      /* ---- 2. 선택 전환 ---- */

      await clickElement(page, frame, false, "v2Rule");

      panel = await readV2Panel(page);

      check("★ 다른 블록으로 옮겨 가면 그 블록의 화면이 된다(divider)",
        same(panel.canvasSelection, ["v2Rule"]) &&
        panel.title === "Canvas 구분선" &&
        panel.values.width === "120" && panel.values.height === "14",
        JSON.stringify({ s: panel.canvasSelection, v: panel.values }));

      await clickElement(page, frame, false, "v2Wide");

      panel = await readV2Panel(page);

      check("★ align:\"stretch\" 블록도 고를 수 있다(페이지 래퍼로 떨어지지 않는다)",
        same(panel.canvasSelection, ["v2Wide"]) && panel.align === "stretch",
        JSON.stringify(panel.canvasSelection));

      /* ---- 3. main_visual — 한 번 클릭은 프레임, 한 번 더는 안쪽 ---- */

      await clickElement(page, frame, false, "v2Photo");

      panel = await readV2Panel(page);

      check("★ main_visual 안을 누르면 **프레임 전체**가 골라진다",
        same(panel.canvasSelection, ["v2Main"]) &&
        panel.title === "Canvas 메인 비주얼" &&
        panel.hasLayout === true,
        JSON.stringify({ s: panel.canvasSelection, t: panel.title }));

      check("★ 패널이 지금 프레임을 고르고 있다고 적는다",
        typeof panel.where === "string" && panel.where.indexOf("프레임 전체") !== -1,
        panel.where);

      await clickElement(page, frame, false, "v2Photo");

      panel = await readV2Panel(page);

      check("★ 한 번 더 누르면 프레임 **안쪽 요소**로 들어간다",
        same(panel.canvasSelection, ["v2Photo"]) &&
        panel.title === "Canvas 사진",
        JSON.stringify({ s: panel.canvasSelection, t: panel.title }));

      check("★ 안쪽 요소는 읽기 전용 요약이고 흐름 칸이 없다(§25-7)",
        panel.hasReadOnly === true && panel.hasLayout === false,
        JSON.stringify({ r: panel.hasReadOnly, l: panel.hasLayout }));

      check("★ 패널이 지금 안쪽 요소를 고르고 있다고 적는다",
        typeof panel.where === "string" && panel.where.indexOf("안쪽 요소") !== -1,
        panel.where);

      /* 같은 프레임 안에서는 형제끼리 바로 옮겨 다닌다.

         ★ v2Paper 가 아니라 v2Tag 를 쓴다 — 종이는 사진 **뒤에** 깔려
           있어서 가운데를 누르면 위에 있는 사진이 잡힌다(그것이 맞는
           동작이다). pin 라벨은 사진 밖에 있어 겹치지 않는다. */
      await clickElement(page, frame, false, "v2Tag");

      panel = await readV2Panel(page);

      check("★ 들어와 있는 동안에는 형제 장식으로 바로 옮겨 간다",
        same(panel.canvasSelection, ["v2Tag"]),
        JSON.stringify(panel.canvasSelection));

      /* 프레임 밖으로 나가면 다시 "밖" 이다 */
      await clickElement(page, frame, false, "v2Text");
      await clickElement(page, frame, false, "v2Photo");

      panel = await readV2Panel(page);

      check("★ 프레임 밖을 한 번 거치면 다시 프레임 전체부터다",
        same(panel.canvasSelection, ["v2Main"]),
        JSON.stringify(panel.canvasSelection));

      /* ---- 4. 기본 칸 — 저장 · 보존 · Undo 한 칸 ---- */

      const before = await readCanvas(page);

      check("아직 draft 는 그대로다", v2BlockOf(before, "v2Text").align === "center");

      await clickElement(page, frame, false, "v2Text");

      /* align */

      let h0 = await historyState(page);

      await page.selectOption("#studioCanvasInspectorAlign", "right");
      await sleep(400);

      let now = await readCanvas(page);
      let h1 = await historyState(page);

      check("★ 정렬을 바꾸면 그 칸만 바뀐다",
        v2BlockOf(now, "v2Text").align === "right" &&
        v2BlockOf(now, "v2Text").width === 300 &&
        v2BlockOf(now, "v2Text").props.text === "한 줄",
        JSON.stringify(v2BlockOf(now, "v2Text")));

      check("★ 정렬 한 번이 Undo 한 칸이다",
        h1.undo === h0.undo + 1, `${h0.undo} → ${h1.undo}`);

      check("★ 모르는 블록 필드 · 모르는 props 필드가 그대로다",
        v2BlockOf(now, "v2Text").zzz.keep === "unknown-block-field" &&
        v2BlockOf(now, "v2Text").props.mystery === "keep-props" &&
        v2BlockOf(now, "v2Text").props.role === "title",
        JSON.stringify(v2BlockOf(now, "v2Text").props));

      check("★ 다른 블록 · 프레임 내부 · overlay 가 한 글자도 안 바뀐다",
        v2OrderOf(now) === "v2Logo,v2Text,v2Rule,v2Wide,v2Main" &&
        v2NodeOf(now, "v2Photo").width === 120 &&
        v2NodeOf(now, "v2Tag").pin.offset.x === 6 &&
        v2NodeOf(now, "v2Over").x === 20,
        v2OrderOf(now));

      check("★ canvas 의 모르는 칸도 그대로다",
        now.canvas.extra === "unknown-canvas-field" &&
        now.canvas.flow.gap === 10 &&
        now.canvas.flow.padding.top === 40);

      /* width */

      h0 = await historyState(page);

      await typeV2Number(page, "width", 240);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 폭을 고치면 저장된다 · Undo 한 칸",
        v2BlockOf(now, "v2Text").width === 240 && h1.undo === h0.undo + 1,
        `${v2BlockOf(now, "v2Text").width} / ${h0.undo}→${h1.undo}`);

      /* margin — 한 칸을 바꿔도 네 칸이 함께 실린다 */

      h0 = await historyState(page);

      await typeV2Number(page, "top", -8);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 여백은 음수도 된다 · 나머지 세 칸은 그대로 · Undo 한 칸",
        same(v2BlockOf(now, "v2Text").margin, { top: -8, right: 0, bottom: 6, left: 0 }) &&
        h1.undo === h0.undo + 1,
        JSON.stringify(v2BlockOf(now, "v2Text").margin));

      /* height — Auto 끄기 · 켜기 */

      panel = await readV2Panel(page);

      check("★ Auto 가 켜진 동안 Height 칸은 잠겨 있다(그 칸으로는 못 고친다)",
        panel.heightDisabled === true &&
        v2BlockOf(await readCanvas(page), "v2Text").height === "auto",
        String(panel.heightDisabled));

      await page.evaluate(() => {
        const el = document.getElementById("studioCanvasInspectorV2-height");
        el.disabled = false;
        el.value = "90";
      });

      await page.click("#studioCanvasInspectorV2Auto");
      await sleep(400);

      now = await readCanvas(page);

      check("★ Auto 를 끄면 적어 둔 숫자로 간다",
        v2BlockOf(now, "v2Text").height === 90,
        String(v2BlockOf(now, "v2Text").height));

      h0 = await historyState(page);

      await page.click("#studioCanvasInspectorV2Auto");
      await sleep(400);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ Auto 를 켜면 \"auto\" 로 돌아간다 · Undo 한 칸",
        v2BlockOf(now, "v2Text").height === "auto" && h1.undo === h0.undo + 1,
        String(v2BlockOf(now, "v2Text").height));

      /* logo 는 auto 를 쓸 수 없다 — 스위치 자체가 없다 */

      await clickElement(page, frame, false, "v2Logo");

      const logoPanel = await page.evaluate(() =>
        !!document.getElementById("studioCanvasInspectorV2Auto"));

      check("★ logo 블록에는 Auto 스위치가 없다(계약의 표 그대로)",
        logoPanel === false);

      /* ---- 5. 순서 ---- */

      await clickElement(page, frame, false, "v2Rule");

      panel = await readV2Panel(page);

      check("순서를 옮기기 전에 그 블록이 골라져 있다",
        same(panel.canvasSelection, ["v2Rule"]) && panel.orderAt === "3 / 5",
        JSON.stringify({ s: panel.canvasSelection, at: panel.orderAt }));

      h0 = await historyState(page);

      await page.click("#studioCanvasInspectorOrderUp");
      await sleep(400);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 위로 한 칸 — 배열 순서가 바뀌고 나머지는 그대로다",
        v2OrderOf(now) === "v2Logo,v2Rule,v2Text,v2Wide,v2Main" &&
        h1.undo === h0.undo + 1,
        v2OrderOf(now));

      panel = await readV2Panel(page);

      check("★ 옮긴 뒤 패널의 자리 표시도 따라간다",
        panel.orderAt === "2 / 5" && same(panel.canvasSelection, ["v2Rule"]),
        panel.orderAt);

      await page.click("#studioCanvasInspectorOrderUp");
      await sleep(400);

      panel = await readV2Panel(page);

      check("★ 맨 위에서는 ↑ 가 잠긴다",
        panel.orderAt === "1 / 5" && panel.upDisabled === true,
        JSON.stringify({ at: panel.orderAt, up: panel.upDisabled }));

      /* ---- 6. 글자 ---- */

      await clickElement(page, frame, false, "v2Text");

      h0 = await historyState(page);

      await typeText(page, "v2 여러 줄\n<b>굵게</b>");

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 글자를 고치면 평문 그대로 저장된다(줄바꿈 유지)",
        v2TextOf(now, "v2Text") === "v2 여러 줄\n<b>굵게</b>",
        JSON.stringify(v2TextOf(now, "v2Text")));

      check("★ 글자 한 세션이 Undo 한 칸이다",
        h1.undo === h0.undo + 1, `${h0.undo} → ${h1.undo}`);

      const drawn = await drawnText(page, frame, false, "v2Text");

      check("★ 화면에도 HTML 이 실행되지 않는다",
        drawn && drawn.bold === 0 && drawn.text.indexOf("<b>") !== -1,
        JSON.stringify(drawn));

      /* 프레임 내부의 글자 장식도 같은 칸을 쓴다 */

      await clickElement(page, frame, false, "v2Photo");
      await clickElement(page, frame, false, "v2Tag");

      panel = await readV2Panel(page);

      if (same(panel.canvasSelection, ["v2Tag"])) {

        await typeText(page, "새 태그");

        now = await readCanvas(page);

        check("★ 프레임 안쪽 글자도 같은 경로로 고쳐진다",
          v2TextOf(now, "v2Tag") === "새 태그" &&
          v2NodeOf(now, "v2Tag").pin.target === "photo",
          JSON.stringify(v2TextOf(now, "v2Tag")));

      }
      else {
        check("★ 프레임 안쪽 글자도 같은 경로로 고쳐진다", false,
          "v2Tag 를 고르지 못했다: " + JSON.stringify(panel.canvasSelection));
      }

      /* ---- 7. Undo 한 번이 정말 한 칸을 되돌린다 ---- */

      const beforeUndo = await readCanvas(page);

      await page.click("#studioUndoButton");
      await sleep(600);

      const afterUndo = await readCanvas(page);

      check("★ ↶ 한 번이 방금 친 글자 전체를 되돌린다",
        v2TextOf(afterUndo, "v2Tag") === "tag" &&
        v2TextOf(beforeUndo, "v2Tag") === "새 태그",
        JSON.stringify({ before: v2TextOf(beforeUndo, "v2Tag"), after: v2TextOf(afterUndo, "v2Tag") }));

      /* ---- 8. 입력 non-mutation · Export → Import ---- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const block = entry.canvas.flow.blocks.find((b) => b.id === "v2Text");
        return { align: block.align, width: block.width, text: block.props.text };
      });

      check("★ 들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.align === "center" && untouched.width === 300 &&
        untouched.text === "한 줄",
        JSON.stringify(untouched));

      const roundTrip = await page.evaluate(async () => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const text = window.serializeSkinPackageExport(exported.skinPackage);

        const result = await window.validateSkinPackageImport(text);

        if (!result.ok) return { ok: false, message: result.message };

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const blocks = entry ? entry.canvas.flow.blocks : [];
        const block = blocks.find((b) => b.id === "v2Text");

        return {
          ok: true,
          order: blocks.map((b) => b.id).join(","),
          align: block ? block.align : null,
          width: block ? block.width : null,
          margin: block ? block.margin : null,
          height: block ? block.height : null,
          text: block ? block.props.text : null,
          mystery: block ? block.props.mystery : null,
          zzz: block ? block.zzz : null,
          version: entry ? entry.canvas.version : null,
          extra: entry ? entry.canvas.extra : null
        };

      });

      check("★ Export → Import 왕복에서 v2 의 고친 값과 모르는 칸이 전부 살아남는다",
        roundTrip.ok &&
        roundTrip.version === 2 &&
        roundTrip.order === "v2Rule,v2Logo,v2Text,v2Wide,v2Main" &&
        roundTrip.align === "right" &&
        roundTrip.width === 240 &&
        roundTrip.height === "auto" &&
        roundTrip.margin.top === -8 &&
        roundTrip.text === "v2 여러 줄\n<b>굵게</b>" &&
        roundTrip.mystery === "keep-props" &&
        roundTrip.zzz.keep === "unknown-block-field" &&
        roundTrip.extra === "unknown-canvas-field",
        JSON.stringify(roundTrip));

      /* ---- 9. 빈 곳 · 소유권 ---- */

      await clickSelector(page, frame, false, ".hc-outside");

      const after = await readV2Panel(page);

      check("★ 도화지 밖 요소를 누르면 Canvas 선택이 풀린다(소유권이 넘어간다)",
        after.canvasSelection.length === 0,
        JSON.stringify(after.canvasSelection));

      check("스크립트 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();


      /* ---- 10. 별도 origin 프레임에서도 같은 결과 ---- */

      const sbPage = await openStudio(browser, {
        package: v2Package({ sandbox: true }),
        sandbox: true
      });

      const sbFrame = await canvasFrame(sbPage, true);

      await enableCanvasEditing(sbPage);

      await clickElement(sbPage, sbFrame, true, "v2Text");

      let sbPanel = await readV2Panel(sbPage);

      check("★ sandbox 에서도 같은 부모 패널이 v2 블록을 연다",
        same(sbPanel.canvasSelection, ["v2Text"]) &&
        sbPanel.hasLayout === true && sbPanel.align === "center",
        JSON.stringify({ s: sbPanel.canvasSelection, a: sbPanel.align }));

      await sbPage.selectOption("#studioCanvasInspectorAlign", "left");
      await sleep(400);

      const sbCanvas = await readCanvas(sbPage);

      check("★ sandbox 에서도 고친 값이 draft 에 쓰인다",
        v2BlockOf(sbCanvas, "v2Text").align === "left",
        String(v2BlockOf(sbCanvas, "v2Text").align));

      /* main_visual 의 진입 규칙도 프레임 밖(부모)이 정한다 */
      await clickElement(sbPage, sbFrame, true, "v2Photo");

      sbPanel = await readV2Panel(sbPage);

      check("★ sandbox 에서도 한 번 클릭은 프레임 전체다",
        same(sbPanel.canvasSelection, ["v2Main"]),
        JSON.stringify(sbPanel.canvasSelection));

      await clickElement(sbPage, sbFrame, true, "v2Photo");

      sbPanel = await readV2Panel(sbPage);

      check("★ sandbox 에서도 한 번 더 누르면 안쪽 요소다",
        same(sbPanel.canvasSelection, ["v2Photo"]),
        JSON.stringify(sbPanel.canvasSelection));

      check("★ 프레임 CSP 위반 0", (await cspViolations(sbFrame)).length === 0,
        JSON.stringify(await cspViolations(sbFrame)));

      check("★ 부모 CSP 위반 0", (await cspViolations(sbPage)).length === 0,
        JSON.stringify(await cspViolations(sbPage)));

      check("sandbox pageerror 0", sbPage.__errors.length === 0,
        sbPage.__errors.slice(0, 2).join(" | "));

      await sbPage.__ctx.close();

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
