/* =========================================================
   HOME CANVAS — Canvas 글자의 타이포그래피 E2E
   (HOME-CANVAS-TYPOGRAPHY-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §31
   계획:      docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §4

   ── 이 파일이 매번 다시 보는 것 ─────────────────────────
     1  **어디에 저장되나** — 스킨 CSS 의 그 요소 규칙 한 줄이고,
        Canvas JSON 은 한 글자도 바뀌지 않는다(계약 §8)
     2  **기본값이 무엇인가** — 고르지 않은 칸은 선언이 **없다**.
        화면에서 잰 값이 기본값인 척 CSS 에 박히지 않는다
     3  **한 조작 = Undo 한 칸**
     4  **글꼴이 진짜 내려오는가** — fallback 으로 그려 놓고
        "글꼴이 적용됐다"고 세지 않는다

   [panel]    네 자리에서 블록이 나오고 · 아닌 곳에서는 안 나온다 ·
              여섯 글꼴과 순서 · 고급 설정 기본 접힘 · 다중 선택
   [edit]     여섯 칸의 확정 → CSS · live preview · reset ·
              범위 밖 거부 · JSON 불변 · 남의 선언 보존
   [undo]     조작 한 번 = Undo 한 칸 · Redo
   [round]    Save → 다시 열기 · Export → Import · Publish resolve
   [fonts]    여섯이 실제로 로드된다(FontFace.status) · 고른 글꼴이
              실제로 그려진다(글자 폭이 대체 글꼴과 다르다)
   [stale]    지나간 선택 · 없는 요소 · 편집 꺼짐에서 거부
   [mobile]   390px — 세 칸이 감기고 잘리지 않는다
   [sandbox]  별도 origin 에서 같은 결과 + 글꼴 로드 + CSP 위반 0

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-typography-e2e-test.mjs
     node studio/studio-home-canvas-typography-e2e-test.mjs --only=edit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 9006;
const SANDBOX_PORT = 9007;

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

   ★ 글꼴 파일(woff2)과 바깥 CDN 이 이 절의 주인공이라, MIME 표에
     font/woff2 가 있어야 하고 프레임의 CSP 는 실제 헤더여야 한다.
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

   ── v1 ─────────────────────────────────────────────────
     tyText   글자. 이 파일의 주인공.
     tyNav    category_nav — 글자가 들어 있지만 **범위 밖**이다
     tyLogo   logo — 대체 표시도 글자지만 **범위 밖**이다
     tyShape  도형 — 대조군

   ── v2 ─────────────────────────────────────────────────
     v2Text   흐름 text 블록
     v2Tag    main_visual **내부** text
     v2Over   overlay text

   ★ 스킨 CSS 는 그 요소에 **자기 선언 둘**을 미리 갖고 있다
     (tyText 의 opacity · letter-spacing 이 아닌 다른 속성). 한 칸을
     고칠 때 그 둘이 살아남는지 보기 위해서다(계획 §4-2).
========================================================== */

const HOME_HTML =
  '<div class="ty-home">' +
  '<div class="ty-canvas" data-imory-canvas-root></div>' +
  '<div class="ty-gap"></div>' +
  "</div>";

const V1_ELEMENTS = [
  { id: "tyText", type: "text", x: 20, y: 40, width: 260, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "한글 AaBb 0123", role: "title", mystery: "keep-props" },
    zzz: { keep: "unknown-field" } },

  { id: "tyNav", type: "category_nav", x: 20, y: 160, width: 200, height: 70,
    rotation: 0, hidden: false, locked: false,
    props: { mode: "selected", categoryIds: ["cat-a"] } },

  { id: "tyLogo", type: "logo", x: 20, y: 260, width: 160, height: 60,
    rotation: 0, hidden: false, locked: false,
    props: { slot: "title_logo", fallback: "site_title" } },

  { id: "tyShape", type: "shape", x: 230, y: 260, width: 90, height: 90,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } }
];

const V2_BLOCKS = [
  { id: "v2Text", type: "text", width: 300, height: "auto", align: "center",
    margin: { top: 10, right: 0, bottom: 6, left: 0 },
    props: { text: "한글 AaBb 0123", role: "title" } },

  { id: "v2Main", type: "main_visual", width: 300, height: 200, align: "center",
    props: {
      baseWidth: 150, baseHeight: 100, primaryId: "v2Photo",
      elements: [
        { id: "v2Photo", type: "photo", follow: "transform",
          x: 10, y: 5, width: 120, height: 80, props: { slot: "photo_1" } },
        { id: "v2Tag", type: "text", follow: "transform",
          x: 10, y: 60, width: 100, height: 24,
          props: { text: "프레임 안 글자", role: "label" } }
      ]
    } }
];

const V2_OVERLAYS = [
  { id: "v2Over", type: "text", x: 20, y: 600, width: 200, height: 40,
    rotation: 0, props: { text: "페이지 장식 글자", role: "label" } }
];

/* 그 요소가 원래 갖고 있던 선언 둘. 타이포그래피 한 칸을 고쳐도
   이 둘은 살아 있어야 한다. */
const OWN_RULE =
  '[data-imory-edit-id="tyText"][data-imory-edit-id="tyText"]' +
  " { opacity: 0.9; text-align: right; }";

const CANVAS_CSS =
  ".ty-home { padding: 240px 0 0; margin: 0; }" +
  ".ty-canvas { width: 100%; }" +
  ".ty-gap { height: 200px; }" +
  '[data-imory-canvas-type="text"] { font: 14px/1.5 Arial, sans-serif; }' +
  '[data-imory-canvas-type="shape"] { background: #d2b48c; }' +
  '[data-imory-canvas-type="photo"] { background: #efe3d2; }' +
  '[data-imory-canvas-type="logo"] { background: #e6e0f0; }' +
  '[data-imory-canvas-type="category_nav"] { background: #dce8e2; }' +
  "\n\n" + OWN_RULE + "\n";

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
      category: { html: '<div class="ty-category"></div>' },
      post: { html: '<div class="ty-post"><div data-imory-region="post-body"></div></div>' },
      banner: { html: '<div class="ty-banner"></div>' }
    },
    css: CANVAS_CSS,
    imageSlots: IMAGE_SLOTS,
    regions: [
      { name: "some_other_region", enabled: true, payload: { keep: true } },
      {
        name: "home_canvas",
        enabled: true,
        canvas: {
          version: 1,
          baseWidth: 390,
          baseHeight: 844,
          elements: JSON.parse(JSON.stringify(V1_ELEMENTS))
        }
      }
    ],
    metadata: {}
  };

  if (o.v2) {

    const entry =
      pkg.regions.find((r) => r.name === "home_canvas");

    entry.canvas = {
      version: 2,
      baseWidth: 390,
      baseHeight: 1000,
      flow: {
        direction: "column",
        padding: { top: 40, right: 24, bottom: 40, left: 24 },
        gap: 10,
        blocks: JSON.parse(JSON.stringify(V2_BLOCKS))
      },
      overlays: JSON.parse(JSON.stringify(V2_OVERLAYS))
    };

  }

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
  });

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    (pkg) => { window.__scenarioLaySkinPackage = pkg; },
    o.package || skinPackage(o)
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
   좌표 · 클릭
========================================================== */

const byId = (id) => `[data-imory-edit-id="${id}"]`;


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
      box ? { left: box.x, top: box.y, width: box.width, height: box.height } : null;

  }

  return out;

}


async function bringIntoView(page, frame, sandbox, selector) {

  const scroll = (sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ block: "center", inline: "center" });
  };

  if (sandbox) {
    await frame.evaluate(scroll, selector);
  } else {
    await page.evaluate((sel) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(sel);
      if (el) el.scrollIntoView({ block: "center", inline: "center" });
    }, selector);
  }

  await sleep(350);

}


async function clickElement(page, frame, sandbox, id, options) {

  const o = options || {};
  const selector = byId(id);

  await bringIntoView(page, frame, sandbox, selector);

  const rects =
    sandbox
      ? await sandboxRects(page, frame, [selector])
      : await nativeRects(page, [selector]);

  const box = rects[selector];

  if (!box) throw new Error("요소를 찾지 못했습니다: " + id);

  if (o.shift) await page.keyboard.down("Shift");

  await page.mouse.click(
    box.left + box.width * 0.5,
    box.top + box.height * 0.5
  );

  if (o.shift) await page.keyboard.up("Shift");

  await sleep(o.settle === undefined ? 600 : o.settle);

}


/* main_visual 안쪽은 **두 번** 눌러야 들어간다(계약 §25-2) */
async function selectInsideFrame(page, frame, sandbox, frameId, innerId) {

  await clickElement(page, frame, sandbox, frameId);
  await clickElement(page, frame, sandbox, innerId);

}


/* =========================================================
   읽기
========================================================== */

const readTypo = (page) => page.evaluate(() => {

  const state =
    window.getStudioCanvasTypographyState();

  const fontSelect =
    document.getElementById("studioCanvasTypo-font");

  const advanced =
    document.getElementById("studioCanvasTypoAdvanced");

  const errorOf = (field) => {
    const el = document.getElementById(`studioCanvasTypoError-${field}`);
    return el && !el.hidden ? el.textContent.trim() : "";
  };

  const inputValue = (field) => {
    const el = document.getElementById(`studioCanvasTypo-${field}`);
    return el ? el.value : null;
  };

  return {
    ...state,
    fontOptions:
      fontSelect ? Array.from(fontSelect.options).map((o) => o.value) : null,
    advancedOpen: advanced ? advanced.open : null,
    inputs: {
      font: inputValue("font"),
      size: inputValue("size"),
      weight: inputValue("weight"),
      color: inputValue("color"),
      letter: inputValue("letter"),
      line: inputValue("line")
    },
    errors: {
      size: errorOf("size"),
      letter: errorOf("letter"),
      line: errorOf("line")
    },
    hasResetButtons:
      ["font", "size", "weight", "color", "letter", "line"]
        .every((f) => !!document.getElementById(`studioCanvasTypoReset-${f}`))
  };

});


/* 지금 draft 의 스킨 CSS 안에서 **그 요소의 규칙 한 줄** */
const readRule = (page, editId) => page.evaluate((id) => {

  const source =
    resolveCodeEditorSource(currentWorkingSkin, "home");

  return window.readInspectorEditDeclarations(source.css, id);

}, editId);


const readCss = (page) => page.evaluate(() =>
  resolveCodeEditorSource(currentWorkingSkin, "home").css);


const readCanvasJson = (page) => page.evaluate(() => {

  const entry =
    (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

  return entry ? JSON.stringify(entry) : null;

});


/* 화면에 **실제로** 적용된 값 */
async function computedOf(page, frame, sandbox, id, props) {

  const selector = byId(id);

  const read = (sel, list) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    list.forEach((p) => { out[p] = cs.getPropertyValue(p); });
    out.__width = Math.round(el.getBoundingClientRect().width * 100) / 100;
    return out;
  };

  if (sandbox) {
    return frame.evaluate(
      ([sel, list]) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out = {};
        list.forEach((p) => { out[p] = cs.getPropertyValue(p); });
        return out;
      },
      [selector, props]
    );
  }

  return page.evaluate(
    ([sel, list]) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(sel);
      if (!el) return null;
      const cs = doc.defaultView.getComputedStyle(el);
      const out = {};
      list.forEach((p) => { out[p] = cs.getPropertyValue(p); });
      return out;
    },
    [selector, props]
  );

}


/* =========================================================
   쓰기 — 패널의 칸을 실제로 만진다
========================================================== */

async function pickSelect(page, field, value) {

  await page.selectOption(`#studioCanvasTypo-${field}`, value);

  await sleep(700);

}


async function typeNumber(page, field, value) {

  const sel = `#studioCanvasTypo-${field}`;

  await page.focus(sel);

  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.value = "";
  }, sel);

  if (value !== "") {
    await page.type(sel, String(value));
  }

  await page.keyboard.press("Enter");

  await sleep(700);

}


async function pickColor(page, value) {

  /* <input type="color"> 는 타이핑으로 못 고친다 — 값을 넣고
     production 과 같은 change 이벤트를 쏜다(확정 시점도 change 다). */
  await page.evaluate((v) => {

    const el = document.getElementById("studioCanvasTypo-color");

    el.value = v;

    el.dispatchEvent(new Event("change", { bubbles: true }));

  }, value);

  await sleep(700);

}


async function clickReset(page, field) {

  await page.click(`#studioCanvasTypoReset-${field}`);

  await sleep(700);

}


/* =========================================================
   글꼴이 **정말로** 내려왔는가

   ★ getComputedStyle 의 font-family 는 "선언된 이름"이라 파일이
     없어도 그대로 나온다. 그것으로는 로드를 잴 수 없다.

     FontFaceSet 에 그 family 의 face 가 있고 status 가 "loaded"
     인지 본다 — 대체 글꼴로 그려진 경우에는 face 자체가 없다.
========================================================== */

const fontStatus = async (target, family) =>
  target.evaluate(async (name) => {

    try {
      await document.fonts.load(`400 16px "${name}"`);
    } catch (err) {
      return { error: String(err && err.message) };
    }

    const faces =
      Array.from(document.fonts).filter((f) =>
        String(f.family).replace(/^"|"$/g, "") === name);

    return {
      count: faces.length,
      loaded: faces.filter((f) => f.status === "loaded").length,
      check: document.fonts.check(`400 16px "${name}"`)
    };

  }, family);


/* =========================================================
   같은 글자를 그 글꼴과 대체 글꼴로 재어 **폭이 다른지** 본다 —
   "선언은 됐는데 fallback 으로 그려졌다"를 잡는 두 번째 그물이다.

   ★ 표본에 **로마자가 넉넉히** 들어간다. 한글만으로 재면 전각
     글자의 폭이 monospace 와 거의 같아져서(실측: 나눔스퀘어네오
     580.28 vs fallback 580 — 0.28px) 판정이 그물 구실을 못 한다.
     같은 여섯을 로마자 섞인 표본으로 재면 620 ↔ 645~773 으로
     갈린다.

   ★ 대조군은 **아무 데도 없는 이름**이라 반드시 monospace 로
     떨어진다. 그 값과 같으면 그 글꼴은 안 온 것이다.
========================================================== */

const FONT_SAMPLE = "Handgloves AaBbCc 0123456789 Wm";

const measureWidths = async (target, families) =>
  target.evaluate(async ([list, sample]) => {

    const measure = (stack) => {

      const span = document.createElement("span");

      span.textContent = sample;

      span.style.position = "absolute";
      span.style.left = "-9999px";
      span.style.top = "0";
      span.style.whiteSpace = "nowrap";
      span.style.fontSize = "40px";
      span.style.fontFamily = stack;

      document.body.appendChild(span);

      const width =
        Math.round(span.getBoundingClientRect().width * 100) / 100;

      span.remove();

      return width;

    };

    const out = {};

    for (const name of list) {

      try {
        await document.fonts.load(`400 40px "${name}"`);
      } catch (err) { /* 그래도 재어 본다 */ }

      out[name] = measure(`"${name}", monospace`);

    }

    out.__fallback = measure('"Imory No Such Font 42", monospace');

    return out;

  }, [families, FONT_SAMPLE]);


/* 지금 그 요소에 **실제로 적용된 stack** 으로 같은 글자를 재 본다.
   패널에서 고른 글꼴이 화면의 글자 모양을 정말 바꾸는지 보는 길이다
   (요소 자체의 폭은 Canvas 좌표가 정하므로 글꼴로 변하지 않는다). */
const measureAppliedWidth = async (target, selector) =>
  target.evaluate(async ([sel, sample]) => {

    const el = document.querySelector(sel);

    if (!el) return null;

    const stack = getComputedStyle(el).fontFamily;

    const first = String(stack).split(",")[0].trim().replace(/^["']|["']$/g, "");

    try {
      await document.fonts.load(`400 40px "${first}"`);
    } catch (err) { /* 그래도 재어 본다 */ }

    const span = document.createElement("span");

    span.textContent = sample;

    span.style.position = "absolute";
    span.style.left = "-9999px";
    span.style.whiteSpace = "nowrap";
    span.style.fontSize = "40px";
    span.style.fontFamily = stack;

    document.body.appendChild(span);

    const width =
      Math.round(span.getBoundingClientRect().width * 100) / 100;

    span.remove();

    return { stack: stack, width: width };

  }, [selector, FONT_SAMPLE]);


/* =========================================================
   본체
========================================================== */

async function main() {

  const playwright = await loadPlaywright();

  const servers = [
    await startServer(PARENT_PORT),
    await startServer(SANDBOX_PORT)
  ];

  const browser = await playwright.chromium.launch();

  const catalogKeys = [
    "pretendard", "nanumgothic", "nanumsquareneo",
    "nanummyeongjo", "gowundodum", "gowunbatang"
  ];

  try {

    /* =====================================================
       [panel]
    ====================================================== */

    if (wants("panel")) {

      section("panel");

      /* ---- v1 ---- */

      let page = await openStudio(browser, {});
      let frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await clickElement(page, frame, false, "tyText");

      let state = await readTypo(page);

      check("★ v1 text 를 고르면 타이포그래피 블록이 나온다",
        state.applies === true && state.visible === true && state.id === "tyText",
        JSON.stringify({ applies: state.applies, visible: state.visible, id: state.id }));

      check("★ 글꼴 선택지가 카탈로그 여섯 + 빈 칸이고 순서가 같다",
        state.fontOptions &&
        state.fontOptions.length === 7 &&
        state.fontOptions[0] === "" &&
        state.fontOptions.slice(1).join(",") === catalogKeys.join(","),
        (state.fontOptions || []).join(","));

      check("★ 고급 설정은 기본 접힘이다",
        state.advancedOpen === false, String(state.advancedOpen));

      check("칸마다 '기본으로 되돌리기'가 있다", state.hasResetButtons === true);

      check("★ 아직 아무것도 안 골랐으면 여섯 칸이 전부 비어 있다 " +
        "(잰 값을 기본값인 척 채우지 않는다)",
        state.inputs.font === "" &&
        state.inputs.size === "" &&
        state.inputs.weight === "" &&
        state.inputs.letter === "" &&
        state.inputs.line === "",
        JSON.stringify(state.inputs));

      await clickElement(page, frame, false, "tyNav");

      state = await readTypo(page);

      check("★ category_nav 는 범위 밖이다 (블록이 없다)",
        state.applies === false && state.visible === false,
        JSON.stringify({ applies: state.applies, visible: state.visible }));

      await clickElement(page, frame, false, "tyLogo");

      state = await readTypo(page);

      check("★ logo 의 대체 표시도 범위 밖이다",
        state.applies === false && state.visible === false);

      await clickElement(page, frame, false, "tyShape");

      state = await readTypo(page);

      check("도형에는 블록이 없다", state.applies === false);

      /* 다중 선택 */
      await clickElement(page, frame, false, "tyText");
      await clickElement(page, frame, false, "tyShape", { shift: true });

      state = await readTypo(page);

      check("★ 여러 개를 고르면 블록이 사라진다 (단독 선택에서만)",
        state.applies === false && state.visible === false);

      await page.__ctx.close();

      /* ---- v2 ---- */

      page = await openStudio(browser, { v2: true });
      frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await clickElement(page, frame, false, "v2Text");

      state = await readTypo(page);

      check("★ v2 흐름 text 블록에도 블록이 나온다",
        state.applies === true && state.id === "v2Text", state.id);

      await selectInsideFrame(page, frame, false, "v2Main", "v2Tag");

      state = await readTypo(page);

      check("★ main_visual **내부** text 에도 나온다",
        state.applies === true && state.id === "v2Tag", state.id);

      await clickElement(page, frame, false, "v2Over");

      state = await readTypo(page);

      check("★ overlay text 에도 나온다",
        state.applies === true && state.id === "v2Over", state.id);

      await clickElement(page, frame, false, "v2Photo");

      state = await readTypo(page);

      check("프레임 안의 사진에는 없다", state.applies === false);

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [edit]
    ====================================================== */

    if (wants("edit")) {

      section("edit");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const jsonBefore = await readCanvasJson(page);

      await clickElement(page, frame, false, "tyText");

      /* ---- 글꼴 ---- */

      await pickSelect(page, "font", "gowunbatang");

      let rule = await readRule(page, "tyText");

      check("★ 글꼴이 그 요소의 CSS 규칙에 적힌다",
        rule["font-family"] === '"Gowun Batang", serif',
        JSON.stringify(rule));

      check("★ 그 요소가 원래 갖고 있던 선언 둘이 살아 있다",
        rule.opacity === "0.9" && rule["text-align"] === "right",
        JSON.stringify(rule));

      let computed =
        await computedOf(page, frame, false, "tyText", ["font-family"]);

      check("★ Preview 에 곧바로 보인다 (live)",
        computed && computed["font-family"].indexOf("Gowun Batang") !== -1,
        computed && computed["font-family"]);

      /* ---- 크기 ---- */

      await typeNumber(page, "size", "28");

      rule = await readRule(page, "tyText");

      check("크기가 px 로 적힌다", rule["font-size"] === "28px", rule["font-size"]);

      computed = await computedOf(page, frame, false, "tyText", ["font-size"]);

      check("Preview 의 실제 글자 크기가 28px 이다",
        computed && computed["font-size"] === "28px", computed && computed["font-size"]);

      /* ---- 굵기 ---- */

      await pickSelect(page, "weight", "700");

      rule = await readRule(page, "tyText");

      check("굵기가 적힌다", rule["font-weight"] === "700", rule["font-weight"]);

      /* ---- 고급: 색 · 자간 · 행간 ---- */

      await page.evaluate(() => {
        document.getElementById("studioCanvasTypoAdvanced").open = true;
      });

      await pickColor(page, "#23395b");

      rule = await readRule(page, "tyText");

      check("글자색이 적힌다", rule.color === "#23395b", rule.color);

      await typeNumber(page, "letter", "-1.5");

      rule = await readRule(page, "tyText");

      check("자간이 px 로 적힌다 (음수)",
        rule["letter-spacing"] === "-1.5px", rule["letter-spacing"]);

      await typeNumber(page, "line", "1.45");

      rule = await readRule(page, "tyText");

      check("★ 행간은 단위 없는 숫자다",
        rule["line-height"] === "1.45", rule["line-height"]);

      computed =
        await computedOf(page, frame, false, "tyText",
          ["letter-spacing", "line-height", "color", "font-weight"]);

      check("Preview 에 네 값이 전부 살아 있다",
        computed &&
        computed["letter-spacing"] === "-1.5px" &&
        computed["font-weight"] === "700" &&
        computed.color === "rgb(35, 57, 91)",
        JSON.stringify(computed));

      /* ---- Canvas JSON 은 한 글자도 안 바뀐다 ---- */

      check("★ Canvas JSON 이 한 글자도 바뀌지 않았다 (계약 §8)",
        (await readCanvasJson(page)) === jsonBefore);

      /* ---- 눈금 ---- */

      await typeNumber(page, "letter", "0.07");

      rule = await readRule(page, "tyText");

      check("★ 자간은 0.1 눈금에 붙는다",
        rule["letter-spacing"] === "0.1px", rule["letter-spacing"]);

      check("칸에도 붙은 값이 보인다",
        (await readTypo(page)).inputs.letter === "0.1");

      await typeNumber(page, "size", "16.7");

      rule = await readRule(page, "tyText");

      check("★ 크기는 1 눈금이다 (16.7 -> 17)",
        rule["font-size"] === "17px", rule["font-size"]);

      /* ---- 범위 밖 ---- */

      await typeNumber(page, "size", "200");

      let state = await readTypo(page);

      rule = await readRule(page, "tyText");

      check("★ 범위 밖 크기는 거부되고 값이 그대로다",
        rule["font-size"] === "17px" && state.errors.size !== "",
        `${rule["font-size"]} / ${state.errors.size}`);

      await typeNumber(page, "line", "5");

      rule = await readRule(page, "tyText");

      check("★ 범위 밖 행간도 거부된다 (선언이 지워지지 않는다)",
        rule["line-height"] === "1.45", rule["line-height"]);

      await typeNumber(page, "letter", "-9");

      rule = await readRule(page, "tyText");

      check("★ 범위 밖 자간도 거부된다",
        rule["letter-spacing"] === "0.1px", rule["letter-spacing"]);

      /* ---- reset ---- */

      await clickReset(page, "size");

      rule = await readRule(page, "tyText");

      check("★ '기본' 은 그 선언 하나만 지운다",
        !("font-size" in rule) &&
        rule["font-family"] === '"Gowun Batang", serif' &&
        rule["font-weight"] === "700" &&
        rule.opacity === "0.9",
        JSON.stringify(rule));

      await pickSelect(page, "font", "");

      rule = await readRule(page, "tyText");

      check("글꼴의 '스킨 기본값' 선택지도 선언을 지운다",
        !("font-family" in rule), JSON.stringify(rule));

      await clickReset(page, "color");
      await clickReset(page, "letter");
      await clickReset(page, "line");
      await clickReset(page, "weight");

      rule = await readRule(page, "tyText");

      check("★ 여섯을 전부 되돌리면 원래 선언 둘만 남는다",
        Object.keys(rule).sort().join(",") === "opacity,text-align",
        JSON.stringify(rule));

      state = await readTypo(page);

      check("칸도 전부 비었다",
        state.inputs.size === "" && state.inputs.font === "" &&
        state.inputs.weight === "" && state.inputs.letter === "" &&
        state.inputs.line === "",
        JSON.stringify(state.inputs));

      const css = await readCss(page);

      check("★ 계산값이 기본값인 척 CSS 에 남지 않았다",
        css.indexOf("font-size") === -1 &&
        css.indexOf("letter-spacing") === -1 &&
        css.indexOf("line-height") === -1,
        css.slice(css.indexOf("tyText")).slice(0, 160));

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [undo]
    ====================================================== */

    if (wants("undo")) {

      section("undo");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await clickElement(page, frame, false, "tyText");

      await pickSelect(page, "font", "nanumgothic");
      await typeNumber(page, "size", "22");
      await pickSelect(page, "weight", "500");

      let rule = await readRule(page, "tyText");

      check("세 번 고쳤다",
        rule["font-family"] === '"Nanum Gothic", sans-serif' &&
        rule["font-size"] === "22px" &&
        rule["font-weight"] === "500",
        JSON.stringify(rule));

      const undo = async () => {
        await page.click("#studioUndoButton");
        await sleep(700);
      };

      await undo();

      rule = await readRule(page, "tyText");

      check("★ Undo 한 번에 굵기만 돌아간다 (조작 한 번 = 한 칸)",
        !("font-weight" in rule) && rule["font-size"] === "22px",
        JSON.stringify(rule));

      await undo();

      rule = await readRule(page, "tyText");

      check("★ 한 번 더 — 크기만 돌아간다",
        !("font-size" in rule) &&
        rule["font-family"] === '"Nanum Gothic", sans-serif',
        JSON.stringify(rule));

      await undo();

      rule = await readRule(page, "tyText");

      check("★ 한 번 더 — 처음 상태다 (원래 선언 둘만)",
        Object.keys(rule).sort().join(",") === "opacity,text-align",
        JSON.stringify(rule));

      await page.click("#studioRedoButton");
      await sleep(700);

      rule = await readRule(page, "tyText");

      check("Redo 가 글꼴을 되살린다",
        rule["font-family"] === '"Nanum Gothic", sans-serif',
        JSON.stringify(rule));

      /* 한 칸을 고치면 기록이 **정확히 하나** 늘어난다 */
      const depth = () =>
        page.evaluate(() => window.getStudioHistoryState().undo);

      const beforeOne = await depth();

      await typeNumber(page, "size", "18");

      const afterOne = await depth();

      check("★ 한 번 고치면 기록이 정확히 한 칸 늘어난다",
        afterOne === beforeOne + 1, `${beforeOne} -> ${afterOne}`);

      /* 같은 값을 다시 고르면 기록이 생기지 않는다 */
      await pickSelect(page, "font", "nanumgothic");

      const afterSame = await depth();

      check("★ 같은 값이면 기록도 dirty 도 만들지 않는다",
        afterSame === afterOne, `${afterOne} -> ${afterSame}`);

      const sameResult = await page.evaluate(() =>
        window.commitStudioCanvasTypography("font", "nanumgothic"));

      check("그 확정은 unchanged 로 답한다",
        sameResult.ok === true && sameResult.unchanged === true,
        JSON.stringify(sameResult));

      check("패널이 선택을 잃지 않았다",
        (await readTypo(page)).id === "tyText");

      await page.__ctx.close();

    }


    /* =====================================================
       [round] — Save · Export/Import · Publish
    ====================================================== */

    if (wants("round")) {

      section("round");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await clickElement(page, frame, false, "tyText");

      await pickSelect(page, "font", "nanumsquareneo");
      await typeNumber(page, "size", "30");

      const expected = {
        "font-family": '"NanumSquareNeo", "Nanum Square Neo", sans-serif',
        "font-size": "30px"
      };

      /* ---- Save ---- */

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

      check("★ 저장된 SkinPackage 의 css 에 그 규칙이 있다",
        saved && typeof saved.css === "string" &&
        saved.css.indexOf('"NanumSquareNeo", "Nanum Square Neo", sans-serif') !== -1 &&
        saved.css.indexOf("font-size: 30px") !== -1,
        saved && typeof saved.css === "string"
          ? saved.css.slice(saved.css.indexOf("tyText")).slice(0, 200)
          : "없음");

      check("★ Canvas JSON 에는 스타일 칸이 없다 (계약 §8)",
        JSON.stringify(
          (saved.regions || []).find((r) => r && r.name === "home_canvas")
        ).indexOf("font") === -1);

      /* ---- Publish ---- */

      await page.waitForFunction(
        () => !document.getElementById("studioPublishButton").disabled,
        null, { timeout: 10000 }
      );

      await page.click("#studioPublishButton");

      /* 확인 한 번을 지난다 */
      await page.click(".studio-confirm-button--primary");

      await page.waitForFunction(
        () => window.top.__publishedLay !== undefined &&
          window.top.__publishedLay !== null,
        null, { timeout: 15000 }
      );

      const published = await page.evaluate(() => window.top.__publishedLay);

      check("★ 공개된 SkinPackage 의 css 도 같다",
        published && typeof published.css === "string" &&
        published.css.indexOf('"NanumSquareNeo", "Nanum Square Neo", sans-serif') !== -1 &&
        published.css.indexOf("font-size: 30px") !== -1,
        published && typeof published.css === "string"
          ? published.css.slice(published.css.indexOf("tyText")).slice(0, 160)
          : "없음");

      /* ---- Export -> Import (저장된 content 를 그대로 다시 연다) ---- */

      const exported = JSON.stringify(saved);

      check("Export 결과에도 그대로 있다",
        exported.indexOf("NanumSquareNeo") !== -1);

      /* ---- 다시 열기 ---- */

      await page.__ctx.close();

      const reopened = await openStudio(browser, {
        package: JSON.parse(exported)
      });

      const reframe = await canvasFrame(reopened, false);

      await enableCanvasEditing(reopened);

      await clickElement(reopened, reframe, false, "tyText");

      const rule = await readRule(reopened, "tyText");

      check("★ 다시 열어도 그 값이고, 폼이 그 값을 되읽는다",
        rule["font-family"] === expected["font-family"] &&
        rule["font-size"] === expected["font-size"],
        JSON.stringify(rule));

      const state = await readTypo(reopened);

      check("★ 폼의 글꼴 칸이 카탈로그 key 로 되짚어진다",
        state.inputs.font === "nanumsquareneo" && state.inputs.size === "30",
        JSON.stringify(state.inputs));

      await reopened.__ctx.close();

    }


    /* =====================================================
       [fonts] — 진짜 내려오는가
    ====================================================== */

    if (wants("fonts")) {

      section("fonts");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      /* native Preview 문서 안에서 잰다 — 부모(Studio) 문서가 아니다 */
      const preview =
        page.frames().find((f) => f.url().indexOf("preview-frame") !== -1);

      const families = [
        "Pretendard", "Nanum Gothic", "NanumSquareNeo",
        "Nanum Myeongjo", "Gowun Dodum", "Gowun Batang"
      ];

      for (const family of families) {

        const status = await fontStatus(preview, family);

        check(`★ ${family} 가 native Preview 에서 실제로 로드된다`,
          status && status.count > 0 && status.loaded > 0 && status.check === true,
          JSON.stringify(status));

      }

      const widths = await measureWidths(preview, families);

      families.forEach((family) => {

        check(`★ ${family} 로 그린 글자 폭이 대체 글꼴과 다르다`,
          Math.abs(widths[family] - widths.__fallback) > 1,
          `${widths[family]} vs fallback ${widths.__fallback}`);

      });

      check("★ 여섯이 서로 다른 글꼴이다 (폭이 전부 다르다)",
        new Set(families.map((f) => widths[f])).size === families.length,
        families.map((f) => `${f}=${widths[f]}`).join(" · "));

      /* 고른 글꼴이 실제 렌더에 쓰이는가 — 같은 글자, 다른 폭 */
      await clickElement(page, frame, false, "tyText");

      await pickSelect(page, "font", "nanummyeongjo");
      await sleep(900);

      const serif = await measureAppliedWidth(preview, byId("tyText"));

      await pickSelect(page, "font", "nanumsquareneo");
      await sleep(900);

      const neo = await measureAppliedWidth(preview, byId("tyText"));

      check("★ 고른 글꼴이 그 요소에 실제로 적용된다",
        serif && neo &&
        serif.stack.indexOf("Nanum Myeongjo") !== -1 &&
        neo.stack.indexOf("NanumSquareNeo") !== -1,
        `${serif && serif.stack} → ${neo && neo.stack}`);

      check("★ 글꼴을 바꾸면 같은 글자의 폭이 실제로 달라진다",
        serif && neo && Math.abs(serif.width - neo.width) > 1,
        `myeongjo ${serif && serif.width} vs neo ${neo && neo.width}`);

      check("페이지 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();

    }


    /* =====================================================
       [stale] — 지나간 선택 · 없는 요소 · 편집 꺼짐
    ====================================================== */

    if (wants("stale")) {

      section("stale");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await clickElement(page, frame, false, "tyText");

      const before = await readCss(page);

      /* 고른 것이 없다 */
      const cleared = await page.evaluate(() => {

        window.clearStudioCanvasSelection();

        return window.commitStudioCanvasTypography("size", "40");

      });

      check("★ 선택이 없으면 거부된다",
        cleared.ok === false && cleared.reason === "selection",
        JSON.stringify(cleared));

      check("CSS 가 한 글자도 안 바뀌었다", (await readCss(page)) === before);

      /* =====================================================
         ★ 지나간 화면의 확정 — **가장 실제로 일어나는 경우**

         숫자 칸은 blur 에서 확정한다. 그래서 사용자가 값을 친 채
         Preview 의 다른 글자를 누르면, 선택이 먼저 옮겨간 뒤에
         그 확정이 도착할 수 있다. 그대로 쓰면 A 를 보며 친 값이
         B 에 박힌다 — 그것을 막는지 본다.
      ====================================================== */

      await clickElement(page, frame, false, "tyText");

      const drawnFor = (await readTypo(page)).drawnFor;

      check("패널이 누구를 위해 그려졌는지 들고 있다",
        drawnFor === "tyText", String(drawnFor));

      const stolen = await page.evaluate(() => {

        /* 화면은 tyText 를 위해 그려져 있는데, 선택만 다른 요소로
           옮겨 둔다(프레임이 먼저 도착한 상황). */
        const real =
          window.getStudioCanvasSelection;

        window.getStudioCanvasSelection =
          () => ({
            ids: ["tyShape"],
            primaryId: "tyShape",
            items: [],
            generation: real().generation
          });

        const result =
          window.commitStudioCanvasTypography("size", "40");

        window.getStudioCanvasSelection = real;

        return result;

      });

      check("★ 선택이 먼저 옮겨갔으면 거부된다 (옛 화면의 값)",
        stolen.ok === false && stolen.reason === "selection",
        JSON.stringify(stolen));

      check("그때도 CSS 는 그대로다", (await readCss(page)) === before);

      /* 없는 칸 이름 */
      const bogus = await page.evaluate(() =>
        window.commitStudioCanvasTypography("정체불명", "40"));

      check("★ 모르는 칸 이름은 거부된다",
        bogus.ok === false && bogus.reason === "unsupported",
        JSON.stringify(bogus));

      /* 편집이 꺼진 상태 */
      await clickElement(page, frame, false, "tyText");

      await page.click("#studioInspectorButton");
      await sleep(600);

      const off = await page.evaluate(() =>
        window.commitStudioCanvasTypography("size", "40"));

      check("★ Select 를 끄면 거부된다",
        off.ok === false && off.reason === "not-editing",
        JSON.stringify(off));

      check("CSS 가 끝까지 그대로다", (await readCss(page)) === before);

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

      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await clickElement(page, frame, false, "tyText");

      /* 390px 에서는 왼쪽 패널이 **편집 시트**다(MOBILE-SHEET-1).
         peek 로 접혀 있으면 칸이 화면 밖이라 잴 수도 만질 수도
         없으므로, 사람이 하는 그 조작(시트 펼치기)을 먼저 한다. */
      await page.evaluate(() => {
        if (typeof window.setStudioSheetState === "function") {
          window.setStudioSheetState("full");
        }
      });

      await sleep(600);

      await page.evaluate(() => {
        const node = document.getElementById("studioCanvasInspectorTypography");
        if (node) node.scrollIntoView({ block: "center" });
      });

      await sleep(400);

      const measure = () => page.evaluate(() => {

        const box =
          document.getElementById("studioCanvasInspectorTypography");

        if (!box) return null;

        const cells =
          Array.from(box.querySelectorAll(".studio-canvas-typo-cell"));

        const parent =
          box.getBoundingClientRect();

        return {
          width: Math.round(parent.width),
          overflow: cells.some((c) => {
            const r = c.getBoundingClientRect();
            return r.right > parent.right + 1 || r.left < parent.left - 1;
          }),
          /* 칸 안의 내용이 잘려 스크롤이 생겼나 */
          clipped: cells.some((c) => c.scrollWidth > c.clientWidth + 1),
          /* 위 세 칸(글꼴 · 크기 · 굵기)이 몇 줄에 놓였나 */
          rows: new Set(
            cells.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().top))
          ).size,
          visible: cells.every((c) => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
        };

      });

      const layout = await measure();

      check("★ 390px 에서 칸이 패널 밖으로 넘치지 않는다",
        layout && layout.overflow === false, JSON.stringify(layout));

      check("★ 칸 안의 글자가 잘리지 않는다",
        layout && layout.clipped === false, JSON.stringify(layout));

      check("칸이 전부 보인다", layout && layout.visible === true);

      /* 좁은 화면에서도 고칠 수 있다 */
      await typeNumber(page, "size", "20");

      const rule = await readRule(page, "tyText");

      check("390px 에서도 확정된다", rule["font-size"] === "20px", rule["font-size"]);

      /* =====================================================
         ★ **감기는지**를 본다 — 자르지 않는다는 것의 실체

         390px 의 시트 폭에서는 세 칸이 한 줄에 들어간다. 그것이
         정답이고, 계약이 말하는 "자연스럽게 감긴다"는 **더 좁아지면
         잘리는 대신 줄이 늘어난다**는 뜻이다. 그래서 패널을 억지로
         좁혀 그 경계를 직접 넘겨 본다(고정 breakpoint 가 없다는
         것도 이 방법으로만 확인된다).
      ====================================================== */

      const narrow = await page.evaluate(() => {

        const box =
          document.getElementById("studioCanvasInspectorTypography");

        const before =
          box.getBoundingClientRect().width;

        const out = {};

        [220, 150].forEach((width) => {

          box.style.width = `${width}px`;

          const cells =
            Array.from(box.querySelectorAll(".studio-canvas-typo-cell"));

          const parent =
            box.getBoundingClientRect();

          out[width] = {
            rows: new Set(
              cells.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().top))
            ).size,
            overflow: cells.some((c) =>
              c.getBoundingClientRect().right > parent.right + 1),
            clipped: cells.some((c) => c.scrollWidth > c.clientWidth + 1)
          };

        });

        box.style.width = "";

        return { before: Math.round(before), ...out };

      });

      check("★ 좁아지면 세 칸이 잘리지 않고 줄이 늘어난다",
        narrow["220"].rows === 2 && narrow["150"].rows === 3,
        JSON.stringify(narrow));

      check("★ 감긴 뒤에도 넘치거나 잘리지 않는다",
        narrow["220"].overflow === false && narrow["220"].clipped === false &&
        narrow["150"].overflow === false && narrow["150"].clipped === false,
        JSON.stringify(narrow));

      await page.__ctx.close();

    }


    /* =====================================================
       [sandbox] — 별도 origin
    ====================================================== */

    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true, v2: true });
      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);

      await clickElement(page, frame, true, "v2Text");

      let state = await readTypo(page);

      check("★ sandbox 에서도 v2 text 에 블록이 나온다",
        state.applies === true && state.id === "v2Text", state.id);

      await pickSelect(page, "font", "gowundodum");
      await typeNumber(page, "size", "26");

      const rule = await readRule(page, "v2Text");

      check("★ native 와 같은 규칙이 적힌다",
        rule["font-family"] === '"Gowun Dodum", sans-serif' &&
        rule["font-size"] === "26px",
        JSON.stringify(rule));

      const computed =
        await computedOf(page, frame, true, "v2Text", ["font-family", "font-size"]);

      check("★ 프레임 안에 실제로 적용된다",
        computed &&
        computed["font-family"].indexOf("Gowun Dodum") !== -1 &&
        computed["font-size"] === "26px",
        JSON.stringify(computed));

      /* 글꼴 파일이 **그 origin 에서** 내려왔는가 */
      const families = [
        "Pretendard", "Nanum Gothic", "NanumSquareNeo",
        "Nanum Myeongjo", "Gowun Dodum", "Gowun Batang"
      ];

      for (const family of families) {

        const status = await fontStatus(frame, family);

        check(`★ ${family} 가 sandbox 프레임에서도 실제로 로드된다`,
          status && status.count > 0 && status.loaded > 0 && status.check === true,
          JSON.stringify(status));

      }

      const widths = await measureWidths(frame, ["Pretendard", "NanumSquareNeo"]);

      check("★ sandbox 에서도 fallback 이 아니다",
        Math.abs(widths.Pretendard - widths.__fallback) > 1 &&
        Math.abs(widths["NanumSquareNeo"] - widths.__fallback) > 1,
        JSON.stringify(widths));

      /* CSP */
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
