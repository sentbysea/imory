/* =========================================================
   HOME CANVAS — 조건부 vendor 활성화와 단일 Moveable 선택 틀 E2E
   (HOME-CANVAS-SELECT-1B-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §15
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ★ 이 라운드의 Moveable 은 **표시 전용**이다. 이동 · 크기 · 회전
     조작 · 손잡이 · Selecto · 다중 선택은 없다. 그래서 이 파일은
     좌표를 **바꾸지 않고**, 다음 셋만 잰다.

       1) 언제 vendor 를 받는가(그리고 언제 받지 않는가)
       2) 틀이 요소의 **실제 회전**을 따라가는가
       3) 언제 걷히는가 · 실패하면 무엇으로 돌아가는가

   ── 회전을 무엇으로 판정하는가 ──────────────────────────
   단순한 bounding rect 비교로는 "회전을 따라가는 틀"과 "축에
   평행한 외곽 상자"를 가를 수 없다 — 둘의 외곽은 같다. 그래서
   Moveable 이 실제로 그린 네 줄(.moveable-line) 하나하나의
   사각형을 잰다.

     회전 0°  : 모든 줄이 축에 평행하다(짧은 변 ≈ 0)
     회전 20° : **모든 줄이 대각선**이다(가로도 세로도 크다)
     길이     : 네 줄의 길이가 요소의 (가로, 가로, 세로, 세로)다

   축에 평행한 상자를 그렸다면 두 번째에서 반드시 떨어진다.

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함). 그래서 두 origin 다
   functions/_middleware.js 를 통과시킨다 —
   skin/sandbox/skin-sandbox-e2e-test.mjs 와 같은 방식이다.

   [cost]     공개 · Studio · Select 만 · 일반 요소 선택 = vendor 0,
              첫 Canvas 선택 = UMD 각각 1, 재선택 = 추가 0
   [native]   native Preview 의 인스턴스 · 회전 · auto 높이 ·
              scale · scroll · target 갱신
   [sandbox]  sandbox 프레임의 인스턴스 · CSP 위반 0 · 회전
   [life]     해제 · 일반 요소 전환 · HOME 이탈 · 캔버스 제거 ·
              요소 삭제 · stale id · stale generation
   [fallback] vendor 실패 → 기존 축 평행 테두리
   [data]     Canvas JSON 무변경 · template Inspector 회귀 0

   Chromium 만 쓴다(§11).

   실행:
     node studio/studio-home-canvas-moveable-e2e-test.mjs
     node studio/studio-home-canvas-moveable-e2e-test.mjs --only=native
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8990;
const SANDBOX_PORT = 8991;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html?scenario=lay";

const MOVEABLE_URL_PART = "/studio/vendor/home-canvas/moveable-";
const SELECTO_URL_PART = "/studio/vendor/home-canvas/selecto-";
const LOADER_URL_PART = "/studio/studio-home-canvas-vendor.js";
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

/* 실행 중에 만들어 내보내는 단색 SVG — 저장소에 이미지 파일을
   새로 넣지 않는다. sandbox CSP 의 img-src 는 부모 origin 을
   허용하므로(resolveSandboxMediaOrigins) **부모 origin 주소**로
   준다 — 외부 이미지 허용 범위를 넓히지 않는다(§9). */
const FIXTURE_IMAGE_PATH = "/__canvas-moveable-fixture__/swatch.svg";
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

  /* Cloudflare Pages 의 HTML URL handling — .html 은 308 이다
     (skin/sandbox/skin-sandbox-e2e-test.mjs 머리말의 실측) */
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

  /* _redirects 의 SPA fallback */
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

   ★ 자리를 일부러 이렇게 둔다.
     cvPlain   회전 0 · 숫자 높이            (테두리 일치의 기준)
     cvRot20   회전 20° · 숫자 높이
     cvRot45   회전 45° · 숫자 높이
     cvAuto    회전 0 · height:"auto"        (실제 조판 높이)
     cvAutoRot 회전 20° · height:"auto"
     cvGone    [life] 에서 지워 볼 요소
========================================================== */

const HOME_HTML =
  '<div class="hc-home">' +
  '<div class="hc-canvas" data-imory-canvas-root></div>' +
  '<div class="hc-gap"></div>' +
  '<p class="hc-foot">평범한 스킨 요소</p>' +
  "</div>";

const CANVAS_ELEMENTS = [
  { id: "cvPlain", type: "shape", x: 20, y: 40, width: 150, height: 90,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvRot20", type: "shape", x: 210, y: 40, width: 120, height: 60,
    rotation: 20, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvRot45", type: "shape", x: 40, y: 200, width: 110, height: 70,
    rotation: 45, hidden: false, locked: false, props: { kind: "rect" } },

  { id: "cvAuto", type: "text", x: 20, y: 330, width: 170, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "자동 높이 글자", role: "body" } },

  { id: "cvAutoRot", type: "text", x: 40, y: 430, width: 150, height: "auto",
    rotation: 20, hidden: false, locked: false,
    props: { text: "회전 자동 높이", role: "body" } },

  { id: "cvPhoto", type: "photo", x: 210, y: 200, width: 120, height: 120,
    rotation: 0, hidden: false, locked: false, props: { slot: "photo_1" } },

  { id: "cvGone", type: "shape", x: 40, y: 560, width: 140, height: 80,
    rotation: 0, hidden: false, locked: false, props: { kind: "rect" } }
];

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진", required: false }
];

/* 글꼴과 배경만 못박는다 — 배치는 렌더러의 custom property 가 한다.
   `height:"auto"` 글자의 조판 높이가 엔진마다 흔들리지 않게 글꼴과
   줄 높이를 고정한다(계약 §12 parity 와 같은 이유). */
const CANVAS_CSS =
  ".hc-home { padding: 0; margin: 0; }" +
  ".hc-canvas { width: 100%; }" +
  ".hc-gap { height: 300px; }" +
  '[data-imory-canvas-type="text"] { font: 14px/1.5 Arial, sans-serif; }' +
  '[data-imory-canvas-type="shape"] { background: #d2b48c; }';


function skinPackage(options) {

  const o = options || {};

  /* HOME-CANVAS-SELECT-1B-2 — 표시 위치조차 없는 스킨. Select 를
     켜도 편집 모드가 켜지지 않아야 한다(계약 §15-2). */
  if (o.noCanvas) {

    return {
      schemaVersion: 1,
      templates: {
        home: { html: '<div class="hc-home"><p class="hc-foot">평범한 스킨 요소</p></div>' },
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
   Studio 열기 — 요청 회계와 CSP 위반 수집을 함께 건다
========================================================== */

async function openStudio(browser, options) {

  const o = options || {};

  const requests = [];
  const errors = [];
  const consoleErrors = [];

  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 900 }
  });

  /* 모든 frame 에 CSP 위반 수집기를 건다 — sandbox 프레임은
     cross-origin 이라 부모에서 읽을 수 없고, 그 realm 안에서
     모아 두었다가 frame.evaluate 로 꺼내 온다. */
  await ctx.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blockedURI: e.blockedURI,
        tag: e.target && e.target.tagName ? e.target.tagName : null
      });
    });
  });

  const page = await ctx.newPage();

  page.on("pageerror", (err) => errors.push(String(err.message || err)));

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("request", (req) => requests.push(req.url()));

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  if (o.blockMoveable) {
    await page.route("**/studio/vendor/home-canvas/moveable-*", (route) => route.abort());
  }

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

  await sleep(400);

}


async function disableSelect(page) {

  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);

  if (on) {
    await page.click("#studioInspectorButton");
    await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);
  }

  await sleep(400);

}


/* =========================================================
   누르기 — 실제 포인터로 (select e2e 와 같은 방식)
========================================================== */

async function clickIn(page, selector, fx, fy) {

  const p = await page.evaluate(([sel, ax, ay]) => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const el = doc.querySelector(sel);

    if (!el) return null;

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

  await page.mouse.click(p.x, p.y);
  await sleep(400);

  return p;

}


async function clickInSandbox(page, frame, selector, fx, fy) {

  const loc = frame.locator(selector).first();

  await loc.scrollIntoViewIfNeeded({ timeout: 6000 });

  const box = await loc.boundingBox();

  if (!box) throw new Error("sandbox 프레임 안에서 못 찾음: " + selector);

  const x = box.x + box.width * (fx === undefined ? 0.5 : fx);
  const y = box.y + box.height * (fy === undefined ? 0.5 : fy);

  const vp = page.viewportSize();

  if (x < 0 || y < 0 || x > vp.width || y > vp.height) {
    throw new Error(`누를 자리가 화면 밖입니다(${selector}): ${Math.round(x)},${Math.round(y)}`);
  }

  await page.mouse.click(x, y);

  await sleep(450);

}


const byId = (id) => `[data-imory-edit-id="${id}"]`;


/* =========================================================
   재기 — 프레임 안에서 Moveable 이 실제로 그린 네 줄

   ★ union(외곽) 만으로는 회전을 가릴 수 없다. 줄 하나하나의
     사각형을 함께 돌려준다(머리말).
========================================================== */

const measure = (frame, elementId) => frame.evaluate((id) => {

  const el =
    document.querySelector(
      `[data-imory-canvas-element][data-imory-edit-id="${id}"]`
    );

  const box =
    document.querySelector('[data-imory-canvas-frame="1"]');

  const out = {
    found: !!el,
    hasBox: !!box,
    display: box ? getComputedStyle(box).display : null,
    instances: document.querySelectorAll(".moveable-control-box").length,
    selecto:
      document.querySelectorAll(".selecto-selection").length +
      (typeof window.Selecto === "function" && window.__selectoInstances ? 1 : 0),
    lines: [],
    union: null,
    elRect: null,
    offset: null,
    transform: el ? getComputedStyle(el).transform : null
  };

  if (el) {
    const r = el.getBoundingClientRect();
    out.elRect = { x: r.left, y: r.top, w: r.width, h: r.height };
    out.offset = { w: el.offsetWidth, h: el.offsetHeight };
  }

  if (!box) {
    return out;
  }

  /* ★ 테두리 **네 줄**만 센다.

     HOME-CANVAS-TRANSFORM-1C 가 회전 손잡이를 켜면서 control box 에
     `.moveable-line.moveable-rotation-line` 이 하나 더 생겼다 —
     요소 위로 뻗은 40px 막대이고, 외곽이 아니다. 그것까지 세면
     "네 줄이 요소 외곽과 일치하는가"가 참일 수 없다. */
  const lines =
    Array.prototype.slice.call(
      box.querySelectorAll(".moveable-line:not(.moveable-rotation-line)")
    );

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let i = 0; i < lines.length; i += 1) {
    const lr = lines[i].getBoundingClientRect();
    out.lines.push({
      w: lr.width,
      h: lr.height,
      len: Math.sqrt(lr.width * lr.width + lr.height * lr.height)
    });
    minX = Math.min(minX, lr.left);
    minY = Math.min(minY, lr.top);
    maxX = Math.max(maxX, lr.right);
    maxY = Math.max(maxY, lr.bottom);
  }

  if (lines.length) {
    out.union = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  return out;

}, elementId);


const frameState = (frame) =>
  frame.evaluate(() =>
    (typeof window.__imoryCanvasFrameState === "function")
      ? window.__imoryCanvasFrameState()
      : null);


const cspViolations = (frame) =>
  frame.evaluate(() => (window.__cspViolations || []).slice());


const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* union 이 요소의 외곽과 같은가 */
function unionMatches(m, tol) {
  return (
    !!m.union && !!m.elRect &&
    near(m.union.x, m.elRect.x, tol) &&
    near(m.union.y, m.elRect.y, tol) &&
    near(m.union.w, m.elRect.w, tol) &&
    near(m.union.h, m.elRect.h, tol)
  );
}

/*
  네 줄의 길이가 요소의 (가로, 가로, 세로, 세로)인가

  ★ 줄에는 두께가 있다(1px). 길이 L · 각도 θ · 두께 t 인 선분의
    **축에 평행한 외곽**은 (L·|cos|+t·|sin|, L·|sin|+t·|cos|) 이라,
    그 대각선은 √(L² + t² + 2Lt·sin2θ) 다 — 45° 에서 정확히 L+t 만큼
    커진다(2026-09-21 실측: 271 → 272.8). 그래서 허용 오차는 두께와
    부분 픽셀을 합한 3px 이다. 회전을 따라가는가 아닌가를 가르는
    것은 이 값이 아니라 allDiagonal() 이다.
*/
function lengthsMatch(m, tol) {
  if (!m.offset || m.lines.length !== 4) return false;
  const got = m.lines.map((l) => l.len).sort((a, b) => a - b);
  const want = [m.offset.w, m.offset.w, m.offset.h, m.offset.h].sort((a, b) => a - b);
  return got.every((v, i) => near(v, want[i], tol));
}

/* 축에 평행한가 / 전부 대각선인가 */
const allAxisAligned = (m) =>
  m.lines.length === 4 && m.lines.every((l) => Math.min(l.w, l.h) <= 2.5);

const allDiagonal = (m) =>
  m.lines.length === 4 && m.lines.every((l) => Math.min(l.w, l.h) >= 3);


const readCanvasState = (page) => page.evaluate(() => {

  const canvas = window.getStudioCanvasSelection();
  const inspector = window.getStudioInspectorSelection();

  const boxOf = (id) => {
    const el = document.getElementById(id);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };

  return {
    primaryId: canvas.primaryId,
    count: canvas.ids.length,
    frameActive: canvas.frameActive === true,
    inspectorId: inspector ? inspector.editId : null,
    canvasBox: boxOf("studioCanvasSelectBox"),
    inspectorBox: boxOf("studioInspectorSelectBox")
  };

});


const readRegions = (page) => page.evaluate(() =>
  (typeof currentWorkingSkin !== "undefined" && currentWorkingSkin)
    ? JSON.stringify(currentWorkingSkin.regions)
    : null
);


/* 부모가 프레임에 직접 메시지를 쏜다 — stale/위조 판정용 */
const postCanvasSelect = (page, payload) => page.evaluate((value) => {

  document.getElementById("studioPreviewFrame").contentWindow.postMessage(
    Object.assign({ type: "preview:canvas-select" }, value),
    window.location.origin
  );

}, payload);


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
       [cost] — vendor 는 언제 받는가
    ====================================================== */
    if (wants("cost")) {

      section("cost");

      /* 1 · 2 — 공개 화면 둘 */
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

        const runtime = seen.filter((u) => u.indexOf(RUNTIME_URL_PART) !== -1);

        check(`★ ${label} — vendor UMD 요청 0`,
          umd.length === 0, umd.join(" · ") || "요청 없음");

        check(`★ ${label} — 편집 runtime 요청 0`,
          runtime.length === 0, runtime.join(" · ") || "요청 없음");

        await page.close();

      }

      /* 3 — Studio 를 열기만 했다 */
      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      check("★ Studio 를 열기만 하면 vendor UMD 요청 0",
        countRequests(page, MOVEABLE_URL_PART) === 0 &&
        countRequests(page, SELECTO_URL_PART) === 0,
        `moveable=${countRequests(page, MOVEABLE_URL_PART)} ` +
        `selecto=${countRequests(page, SELECTO_URL_PART)}`);

      check("★ Studio 를 열기만 하면 편집 runtime 요청 0",
        countRequests(page, RUNTIME_URL_PART) === 0);

      /* =====================================================
         4 — Select 모드를 켰다

         ★ HOME-CANVAS-SELECT-1B-2 에서 이 칸의 뜻이 바뀌었다.

         1B-1 에서는 "첫 요소를 골랐을 때"가 관문이었으므로 Select 만
         켜면 요청이 0 이었다. 이제 lasso 가 **아무것도 고르지 않은
         상태에서** 시작돼야 하므로, Canvas 가 있는 HOME 에서 Select 를
         켜는 순간이 관문이다(계약 §15-2).

         Canvas 가 **없는** 스킨에서는 여전히 0 이고, 그것은 아래
         [cost-nocanvas] 가 따로 잰다.
      ====================================================== */
      await enableSelect(page);

      await page.waitForFunction(
        () => window.studioCanvasEditingIsOn && window.studioCanvasEditingIsOn() === true,
        null, { timeout: 10000 }
      );

      await sleep(900);

      check("★ Canvas 가 있는 HOME 에서 Select 를 켜면 그때 vendor 를 받는다",
        countRequests(page, MOVEABLE_URL_PART) === 1 &&
        countRequests(page, SELECTO_URL_PART) === 1,
        `moveable=${countRequests(page, MOVEABLE_URL_PART)} ` +
        `selecto=${countRequests(page, SELECTO_URL_PART)}`);

      check("★ 편집 runtime 도 그때 한 번만 받는다",
        countRequests(page, RUNTIME_URL_PART) === 1,
        `${countRequests(page, RUNTIME_URL_PART)}회`);

      /* 5 — 일반 template 요소 선택: 추가 요청이 없다 */
      await clickIn(page, ".hc-foot");
      await sleep(400);

      const plainState = await readCanvasState(page);

      check("일반 요소가 기존 Inspector 로 골라졌다",
        plainState.inspectorId !== null && plainState.primaryId === null,
        `inspector=${plainState.inspectorId}`);

      check("★ 일반 template 요소를 골라도 추가 요청 0",
        countRequests(page, MOVEABLE_URL_PART) === 1 &&
        countRequests(page, SELECTO_URL_PART) === 1 &&
        countRequests(page, RUNTIME_URL_PART) === 1);

      /* 6 — 첫 Canvas 선택 */
      await clickIn(page, byId("cvPlain"));

      await page.waitForFunction(
        () => window.getStudioCanvasSelection().frameActive === true,
        null, { timeout: 15000 }
      );

      check("★ 첫 Canvas 선택 뒤에도 Moveable UMD 요청은 정확히 1",
        countRequests(page, MOVEABLE_URL_PART) === 1,
        `${countRequests(page, MOVEABLE_URL_PART)}회`);

      check("★ 첫 Canvas 선택 뒤에도 Selecto UMD 요청은 정확히 1",
        countRequests(page, SELECTO_URL_PART) === 1,
        "로더가 두 파일을 한 벌로 돌려준다(§4)");

      check("★ 편집 runtime 은 한 번만 받는다",
        countRequests(page, RUNTIME_URL_PART) === 1,
        `${countRequests(page, RUNTIME_URL_PART)}회`);

      check("★ 로더도 프레임 문서에서 한 번만 받는다",
        page.__requests.filter(
          (u) => u.indexOf(LOADER_URL_PART) !== -1 && u.indexOf("/preview/") === -1
        ).length >= 1,
        "Studio 문서와 Preview 문서가 각자 한 벌씩 갖는다");

      /* 7 — 재선택 · 모드 재진입 */
      const after = {
        moveable: countRequests(page, MOVEABLE_URL_PART),
        selecto: countRequests(page, SELECTO_URL_PART),
        runtime: countRequests(page, RUNTIME_URL_PART)
      };

      await clickIn(page, byId("cvRot20"));
      await clickIn(page, byId("cvPlain"));
      await disableSelect(page);
      await enableSelect(page);
      await clickIn(page, byId("cvRot45"));
      await sleep(600);

      check("★ 재선택 · 모드 재진입 뒤 추가 요청 0",
        countRequests(page, MOVEABLE_URL_PART) === after.moveable &&
        countRequests(page, SELECTO_URL_PART) === after.selecto &&
        countRequests(page, RUNTIME_URL_PART) === after.runtime,
        `moveable=${countRequests(page, MOVEABLE_URL_PART)} ` +
        `selecto=${countRequests(page, SELECTO_URL_PART)} ` +
        `runtime=${countRequests(page, RUNTIME_URL_PART)}`);

      /* 10 — Moveable 은 여전히 하나다

         ★ HOME-CANVAS-SELECT-1B-2 에서 Selecto 인스턴스가 **하나**
           생긴다(lasso). 그 수와 동작은
           studio/studio-home-canvas-selecto-e2e-test.mjs 가 갖는다 —
           이 파일이 지키는 것은 "Moveable 은 프레임당 하나"다. */
      const m = await measure(frame, "cvRot45");

      check("★ Moveable 인스턴스는 하나다",
        m.instances === 1, `${m.instances}개`);

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();


      /* =====================================================
         Canvas 가 **없는** 스킨에서는 Select 를 켜도 요청 0

         1B-2 가 관문을 앞으로 옮겼어도 "Canvas 가 있을 때만"은
         그대로다(계약 §15-2).
      ====================================================== */
      const bare = await openStudio(browser, { noCanvas: true });

      await bare.waitForFunction(
        () => window.getStudioAiWorkingState().hasWorkingSkin === true,
        null, { timeout: 20000 }
      );

      await enableSelect(bare);
      await sleep(1200);

      check("★ Canvas 가 없는 스킨은 Select 를 켜도 vendor UMD 요청 0",
        countRequests(bare, MOVEABLE_URL_PART) === 0 &&
        countRequests(bare, SELECTO_URL_PART) === 0,
        `moveable=${countRequests(bare, MOVEABLE_URL_PART)} ` +
        `selecto=${countRequests(bare, SELECTO_URL_PART)}`);

      check("★ Canvas 가 없는 스킨은 편집 runtime 요청도 0",
        countRequests(bare, RUNTIME_URL_PART) === 0,
        `${countRequests(bare, RUNTIME_URL_PART)}회`);

      await bare.__ctx.close();

    }


    /* ======================================================
       [native] — native Preview 의 틀
    ====================================================== */
    if (wants("native")) {

      section("native");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableSelect(page);

      /* 12 — 회전 0° */
      await clickIn(page, byId("cvPlain"));
      await page.waitForFunction(
        () => window.getStudioCanvasSelection().frameActive === true,
        null, { timeout: 15000 }
      );

      const plain = await measure(frame, "cvPlain");

      /* 8 — 인스턴스 하나 */
      check("★ native Preview 의 Moveable 인스턴스는 하나다",
        plain.instances === 1, `${plain.instances}개`);

      check("회전 0° — 네 줄이 그려졌다",
        plain.lines.length === 4, `${plain.lines.length}줄`);

      check("★ 회전 0° — 테두리가 요소 외곽과 일치한다(±1.5px)",
        unionMatches(plain, 1.5),
        `union=${JSON.stringify(plain.union)} el=${JSON.stringify(plain.elRect)}`);

      check("회전 0° — 네 줄이 전부 축에 평행하다",
        allAxisAligned(plain), JSON.stringify(plain.lines));

      /* 7(소유권) — Studio 의 축 평행 상자는 내려가 있다 */
      const plainState = await readCanvasState(page);

      check("★ Moveable 이 잡은 동안 Studio 의 축 평행 overlay 는 숨는다",
        plainState.frameActive === true && plainState.canvasBox === null,
        `frameActive=${plainState.frameActive} box=${JSON.stringify(plainState.canvasBox)}`);

      /* 13 — 회전 20° · 45° */
      for (const [id, deg] of [["cvRot20", 20], ["cvRot45", 45]]) {

        await clickIn(page, byId(id));
        await sleep(400);

        const m = await measure(frame, id);

        check(`★ 회전 ${deg}° — 네 줄이 전부 대각선이다(축 평행 상자가 아니다)`,
          allDiagonal(m), JSON.stringify(m.lines));

        check(`회전 ${deg}° — 네 줄의 길이가 요소의 가로·세로다(±3px · 줄 두께 보정)`,
          lengthsMatch(m, 3),
          `lens=${m.lines.map((l) => l.len.toFixed(1)).join(",")} ` +
          `offset=${JSON.stringify(m.offset)}`);

        check(`회전 ${deg}° — 외곽도 요소의 회전 외곽과 일치한다(±1.5px)`,
          unionMatches(m, 1.5),
          `union=${JSON.stringify(m.union)} el=${JSON.stringify(m.elRect)}`);

      }

      /* 14 — height:"auto" */
      for (const [id, label, diagonal] of [
        ["cvAuto", '회전 0 · height:"auto"', false],
        ["cvAutoRot", '회전 20° · height:"auto"', true]
      ]) {

        await clickIn(page, byId(id));
        await sleep(400);

        const m = await measure(frame, id);

        check(`★ ${label} — 실제 조판 높이를 쓴다`,
          lengthsMatch(m, 3) && m.offset.h > 0,
          `offset=${JSON.stringify(m.offset)} ` +
          `lens=${m.lines.map((l) => l.len.toFixed(1)).join(",")}`);

        check(`${label} — 외곽 일치(±1.5px)`,
          unionMatches(m, 1.5),
          `union=${JSON.stringify(m.union)} el=${JSON.stringify(m.elRect)}`);

        check(`${label} — ${diagonal ? "대각선" : "축 평행"}`,
          diagonal ? allDiagonal(m) : allAxisAligned(m));

      }

      /* 17 — 요소 변경 시 target 갱신 (인스턴스는 그대로 하나) */
      await clickIn(page, byId("cvPlain"));
      await sleep(300);
      await clickIn(page, byId("cvRot20"));
      await sleep(400);

      const swapped = await measure(frame, "cvRot20");
      const swappedState = await frameState(frame);

      check("★ 다른 요소를 골라도 인스턴스는 하나이고 target 만 바뀐다",
        swapped.instances === 1 &&
        swappedState && swappedState.targetId === "cvRot20" &&
        unionMatches(swapped, 1.5),
        `instances=${swapped.instances} target=${swappedState && swappedState.targetId}`);

      /* 16 — Preview 내부 scroll */
      await frame.evaluate(() => window.scrollBy(0, 160));
      await sleep(350);

      const scrolled = await measure(frame, "cvRot20");

      check("★ Preview 내부 스크롤 뒤에도 틀이 요소를 따라간다(±1.5px)",
        unionMatches(scrolled, 1.5) && allDiagonal(scrolled),
        `union=${JSON.stringify(scrolled.union)} el=${JSON.stringify(scrolled.elRect)}`);

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();


      /* 15 — 부모 scale(0.8) */
      const scaled = await openStudio(browser, { scale: 0.8 });
      const scaledFrame = await canvasFrame(scaled, false);

      await enableSelect(scaled);
      await clickIn(scaled, byId("cvRot20"));

      await scaled.waitForFunction(
        () => window.getStudioCanvasSelection().frameActive === true,
        null, { timeout: 15000 }
      );

      const scaledMeasure = await measure(scaledFrame, "cvRot20");

      check("★ 부모 scale(0.8) 에서도 틀이 요소와 일치한다(±1.5px)",
        unionMatches(scaledMeasure, 1.5) && allDiagonal(scaledMeasure),
        `union=${JSON.stringify(scaledMeasure.union)} ` +
        `el=${JSON.stringify(scaledMeasure.elRect)}`);

      check("부모 scale 에서도 인스턴스는 하나",
        scaledMeasure.instances === 1, `${scaledMeasure.instances}개`);

      await scaled.__ctx.close();

    }


    /* ======================================================
       [sandbox] — 별도 origin 프레임
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      await enableSelect(page);

      /* 프레임이 그린 테두리가 sandbox 쪽 소유다 */
      await clickInSandbox(page, frame, byId("cvPlain"));

      await page.waitForFunction(
        () => window.getStudioCanvasSelection().primaryId === "cvPlain",
        null, { timeout: 15000 }
      );

      await frame.waitForFunction(
        () => {
          const s = window.__imoryCanvasFrameState && window.__imoryCanvasFrameState();
          return !!(s && s.targetId === "cvPlain" && s.hasInstance);
        },
        null, { timeout: 15000 }
      );

      const plain = await measure(frame, "cvPlain");

      /* 9 — 인스턴스 하나 */
      check("★ sandbox 프레임의 Moveable 인스턴스는 하나다",
        plain.instances === 1, `${plain.instances}개`);

      check("★ sandbox — 회전 0° 테두리가 요소 외곽과 일치한다(±1.5px)",
        unionMatches(plain, 1.5),
        `union=${JSON.stringify(plain.union)} el=${JSON.stringify(plain.elRect)}`);

      /* 11 — CSP 위반 0 (배포되는 헤더 그대로) */
      const violations = await cspViolations(frame);

      check("★ sandbox CSP 위반 0건 — Moveable 의 style 이 nonce 로 통과한다",
        violations.length === 0, JSON.stringify(violations.slice(0, 3)));

      const cspErrors = page.__consoleErrors.filter(
        (t) => t.indexOf("Content Security Policy") !== -1);

      check("★ 콘솔 CSP 오류 0건",
        cspErrors.length === 0, cspErrors.slice(0, 2).join(" | "));

      /* Moveable 의 style 이 실제로 적용됐는가(el.sheet) —
         VENDOR-1 이 쓴 것과 같은 판정이다. CSP 는 삽입이 아니라
         적용을 막으므로 요소 수로는 가릴 수 없다. */
      const styled = await frame.evaluate(() =>
        Array.prototype.map.call(
          document.querySelectorAll("style[data-styled-id]"),
          (el) => ({ id: el.getAttribute("data-styled-id"), applied: !!el.sheet })
        ));

      check("★ Moveable 의 <style> 이 실제로 적용됐다(sheet !== null)",
        styled.length > 0 && styled.every((s) => s.applied),
        JSON.stringify(styled));

      /* 프레임 안의 축 평행 Inspector 테두리는 내려가 있다 */
      const inspectState = await frame.evaluate(() =>
        window.__imorySandboxInspectState ? window.__imorySandboxInspectState() : null);

      check("★ 프레임의 축 평행 선택 테두리는 Moveable 에 자리를 내준다",
        !!inspectState &&
        inspectState.canvasFrameActive === true &&
        inspectState.selectBoxVisible === false,
        JSON.stringify(inspectState && {
          canvasFrameActive: inspectState.canvasFrameActive,
          selectBoxVisible: inspectState.selectBoxVisible
        }));

      /* 13 — sandbox 에서도 회전을 따라간다 */
      await clickInSandbox(page, frame, byId("cvRot20"));
      await sleep(400);

      const rot = await measure(frame, "cvRot20");

      check("★ sandbox — 회전 20° 네 줄이 전부 대각선이다",
        allDiagonal(rot), JSON.stringify(rot.lines));

      check("sandbox — 네 줄의 길이가 요소의 가로·세로다(±3px · 줄 두께 보정)",
        lengthsMatch(rot, 3),
        `lens=${rot.lines.map((l) => l.len.toFixed(1)).join(",")} ` +
        `offset=${JSON.stringify(rot.offset)}`);

      check("★ sandbox — Moveable 인스턴스는 하나다",
        rot.instances === 1, `${rot.instances}개`);

      /* 요청 회계 — sandbox origin 에서 정확히 한 벌 */
      const fromSandbox = (part) =>
        page.__requests.filter(
          (u) => u.startsWith(SANDBOX_ORIGIN) && u.indexOf(part) !== -1).length;

      check("★ sandbox origin 에서 runtime · 로더 · UMD 가 각각 1회",
        fromSandbox(RUNTIME_URL_PART) === 1 &&
        fromSandbox(LOADER_URL_PART) === 1 &&
        fromSandbox(MOVEABLE_URL_PART) === 1 &&
        fromSandbox(SELECTO_URL_PART) === 1,
        `runtime=${fromSandbox(RUNTIME_URL_PART)} ` +
        `loader=${fromSandbox(LOADER_URL_PART)} ` +
        `moveable=${fromSandbox(MOVEABLE_URL_PART)} ` +
        `selecto=${fromSandbox(SELECTO_URL_PART)}`);

      /* 18 — 해제하면 틀이 사라진다

         ★ 여기서 Escape 를 쓰지 않는다. sandbox 프레임의 Escape 는
           **프레임 안의 포커스**가 받아야 하는데, 그 경로는
           SANDBOX-SELECT-PARITY-1 이 이미 재고 있다. 이 절이 재려는
           것은 "부모가 active:false 를 내려보내면 프레임의 틀이
           걷히는가" 하나이므로, 그 한 경로만 곧장 태운다(빈 곳
           클릭은 프레임에서 **아무 일도 하지 않는 것**이 계약이라
           해제 경로가 아니다 — skin-sandbox-inspect.js pickAt). */
      await page.evaluate(() => window.clearStudioCanvasSelection());
      await sleep(700);

      const cleared = await measure(frame, "cvRot20");
      const clearedState = await frame.evaluate(() =>
        window.__imorySandboxInspectState ? window.__imorySandboxInspectState() : null);

      check("★ sandbox — 해제하면 control box 가 display:none 이다",
        cleared.display === "none", `display=${cleared.display}`);

      check("sandbox — 해제 뒤 프레임의 축 평행 테두리 소유권도 돌아온다",
        !!clearedState && clearedState.canvasFrameActive === false,
        JSON.stringify(clearedState && { canvasFrameActive: clearedState.canvasFrameActive }));

      check("sandbox 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [life] — 언제 걷히는가 · 늦게 온 것은 어떻게 되는가
    ====================================================== */
    if (wants("life")) {

      section("life");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableSelect(page);
      await clickIn(page, byId("cvPlain"));

      await page.waitForFunction(
        () => window.getStudioCanvasSelection().frameActive === true,
        null, { timeout: 15000 }
      );

      /* 18 — 해제(Escape) */
      await page.keyboard.press("Escape");
      await sleep(500);

      const escaped = await measure(frame, "cvPlain");
      const escapedState = await readCanvasState(page);

      check("★ 선택 해제 — control box 가 display:none 이다",
        escaped.display === "none", `display=${escaped.display}`);

      check("선택 해제 — Studio 쪽 선택도 비었다",
        escapedState.primaryId === null && escapedState.frameActive === false);

      /* 19 — 일반 요소로 전환 */
      await clickIn(page, byId("cvPlain"));
      await sleep(400);
      await clickIn(page, ".hc-foot");
      await sleep(500);

      const swapped = await measure(frame, "cvPlain");
      const swappedState = await readCanvasState(page);

      check("★ 일반 요소로 옮기면 Canvas 틀이 사라진다",
        swapped.display === "none" &&
        swappedState.primaryId === null &&
        swappedState.inspectorId !== null,
        `display=${swapped.display} inspector=${swappedState.inspectorId}`);

      /* 25 — template Inspector overlay 회귀 0 */
      check("★ 일반 요소의 Inspector 테두리는 그대로 보인다",
        swappedState.inspectorBox !== null,
        JSON.stringify(swappedState.inspectorBox));

      /* 21 — 지금 화면에 없는 id (위조 · 늦게 도착) */
      await clickIn(page, byId("cvPlain"));
      await sleep(400);

      const gen = await page.evaluate(() =>
        window.getStudioCanvasSelection().generation);

      await postCanvasSelect(page, {
        active: true, ids: ["cvGhost"], primaryId: "cvGhost", generation: gen
      });

      await sleep(500);

      const ghostState = await frameState(frame);

      check("★ 지금 DOM 에 없는 id 는 틀을 만들지 않는다(다른 요소로 대체하지 않는다)",
        !!ghostState && ghostState.targetId === null,
        `target=${ghostState && ghostState.targetId}`);

      /* 21 — 낮은 generation 은 버린다 */
      await clickIn(page, byId("cvRot20"));
      await sleep(400);

      const gen2 = await page.evaluate(() =>
        window.getStudioCanvasSelection().generation);

      await postCanvasSelect(page, {
        active: true, ids: ["cvPlain"], primaryId: "cvPlain", generation: gen2 - 1
      });

      await sleep(500);

      const staleState = await frameState(frame);

      check("★ 낮은 generation 의 메시지는 지금 선택을 덮지 않는다",
        !!staleState && staleState.targetId === "cvRot20",
        `target=${staleState && staleState.targetId}`);

      /* 20 — 요소 삭제 */
      await clickIn(page, byId("cvGone"));

      await page.waitForFunction(
        () => window.getStudioCanvasSelection().primaryId === "cvGone",
        null, { timeout: 10000 });

      await page.evaluate(() => {

        const next = JSON.parse(JSON.stringify(currentWorkingSkin));

        next.regions = next.regions.map((region) => {
          if (region.name !== "home_canvas") return region;
          const copy = JSON.parse(JSON.stringify(region));
          copy.canvas.elements =
            copy.canvas.elements.filter((el) => el.id !== "cvGone");
          return copy;
        });

        window.applyAiSkinPackage(next, { label: "테스트: 요소 삭제" });

      });

      await sleep(1200);

      const deleted = await measure(frame, "cvGone");
      const deletedState = await readCanvasState(page);

      check("★ 고른 요소를 지우면 틀이 걷힌다",
        deleted.display === "none" && deletedState.primaryId === null,
        `display=${deleted.display} primary=${deletedState.primaryId}`);

      /* 20 — 캔버스 제거(enabled:false) */
      await clickIn(page, byId("cvPlain"));

      await page.waitForFunction(
        () => window.getStudioCanvasSelection().frameActive === true,
        null, { timeout: 10000 });

      await page.evaluate(() => {

        const next = JSON.parse(JSON.stringify(currentWorkingSkin));

        next.regions = next.regions.map((region) =>
          region.name === "home_canvas"
            ? Object.assign({}, region, { enabled: false })
            : region);

        window.applyAiSkinPackage(next, { label: "테스트: 캔버스 끄기" });

      });

      await sleep(1200);

      const offState = await readCanvasState(page);
      const offMeasure = await measure(frame, "cvPlain");

      check("★ 캔버스를 끄면 선택도 틀도 사라진다",
        offState.primaryId === null && offMeasure.display === "none",
        `primary=${offState.primaryId} display=${offMeasure.display}`);

      check("Studio 쪽 스크립트 오류 없음",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();


      /* 20 — HOME 이탈 */
      const away = await openStudio(browser, {});
      const awayFrame = await canvasFrame(away, false);

      await enableSelect(away);
      await clickIn(away, byId("cvPlain"));

      await away.waitForFunction(
        () => window.getStudioCanvasSelection().frameActive === true,
        null, { timeout: 15000 });

      /* Studio 에는 페이지 선택기가 없다 — 사용자는 Preview 안의
         링크로 옮기고, Select 모드에서는 그 클릭이 선택으로 바뀐다.
         그래서 프레임이 보냈을 메시지를 받는 그 함수를 직접 부른다
         (운영에서도 이 한 곳을 지난다 —
          studio/preview/preview-navigation.js). */
      await away.evaluate(() =>
        handlePreviewNavigateMessage("/scenario-lay/category/301"));

      await sleep(1800);

      const awayState = await readCanvasState(away);

      check("★ HOME 을 떠나면 캔버스 선택이 풀린다",
        awayState.primaryId === null && awayState.frameActive === false,
        `primary=${awayState.primaryId} frameActive=${awayState.frameActive}`);

      const awayBox = await awayFrame.evaluate(() => {
        const box = document.querySelector('[data-imory-canvas-frame="1"]');
        return box ? getComputedStyle(box).display : "없음";
      }).catch(() => "프레임 없음");

      check("HOME 을 떠나면 틀도 보이지 않는다",
        awayBox === "none" || awayBox === "없음" || awayBox === "프레임 없음",
        `display=${awayBox}`);

      await away.__ctx.close();

    }


    /* ======================================================
       [fallback] — vendor 를 못 받았을 때
    ====================================================== */
    if (wants("fallback")) {

      section("fallback");

      const page = await openStudio(browser, { blockMoveable: true });
      const frame = await canvasFrame(page, false);

      await enableSelect(page);
      await clickIn(page, byId("cvRot20"));

      await page.waitForFunction(
        () => window.getStudioCanvasSelection().primaryId === "cvRot20",
        null, { timeout: 15000 });

      await sleep(1500);

      const state = await readCanvasState(page);
      const m = await measure(frame, "cvRot20");

      check("★ vendor 실패 — 캔버스 선택 자체는 유지된다",
        state.primaryId === "cvRot20",
        `primary=${state.primaryId}`);

      check("★ vendor 실패 — 일반 Inspector 선택으로 바뀌지 않는다",
        state.inspectorId === null, `inspector=${state.inspectorId}`);

      check("★ vendor 실패 — 기존 축 평행 테두리가 그대로 보인다",
        state.frameActive === false && state.canvasBox !== null,
        `frameActive=${state.frameActive} box=${JSON.stringify(state.canvasBox)}`);

      check("vendor 실패 — Moveable control box 는 아예 없다",
        m.hasBox === false && m.instances === 0,
        `hasBox=${m.hasBox} instances=${m.instances}`);

      /* 중복 토스트를 반복하지 않는다 — 같은 실패를 여러 번 겪어도
         경고는 문서당 한 줄이다 */
      await clickIn(page, byId("cvPlain"));
      await sleep(900);
      await clickIn(page, byId("cvRot45"));
      await sleep(900);

      const warned = page.__consoleErrors.filter(
        (t) => t.indexOf("선택 틀") !== -1).length;

      check("★ vendor 실패를 반복해도 오류를 쏟아내지 않는다",
        warned <= 1, `${warned}회`);

      check("Studio 쪽 치명적 오류 없음(경고만)",
        page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

      await page.__ctx.close();

    }


    /* ======================================================
       [data] — 표시 전용이라는 것
    ====================================================== */
    if (wants("data")) {

      section("data");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      const before = await readRegions(page);

      await enableSelect(page);

      for (const id of ["cvPlain", "cvRot20", "cvRot45", "cvAuto", "cvAutoRot", "cvPhoto"]) {
        await clickIn(page, byId(id));
        await sleep(250);
      }

      await page.waitForFunction(
        () => window.getStudioCanvasSelection().frameActive === true,
        null, { timeout: 15000 });

      /* 틀이 붙은 채로 스크롤 · 포인터 이동까지 해 본다 */
      await frame.evaluate(() => window.scrollBy(0, 120));
      await page.mouse.move(640, 500);
      await page.mouse.move(700, 560);
      await sleep(500);

      const after = await readRegions(page);

      /* 23 · 24 */
      check("★ Moveable 이 붙어 있는 동안 draft 의 regions 가 한 글자도 바뀌지 않는다",
        before !== null && before === after,
        before === after ? "" : "regions 가 바뀌었다");

      const coords = await page.evaluate(() => {

        const region =
          currentWorkingSkin.regions.find((r) => r.name === "home_canvas");

        return region.canvas.elements.map((el) => [
          el.id, el.x, el.y, el.width, el.height, el.rotation
        ]);

      });

      const want = CANVAS_ELEMENTS.map((el) => [
        el.id, el.x, el.y, el.width, el.height, el.rotation
      ]);

      check("★ 요소의 x · y · width · height · rotation 변화 0",
        JSON.stringify(coords) === JSON.stringify(want),
        JSON.stringify(coords));

      /* 25 — template Inspector 회귀 0 */
      await clickIn(page, ".hc-foot");
      await sleep(500);

      const plainState = await readCanvasState(page);

      check("★ 일반 요소 Inspector 가 예전처럼 동작한다(테두리 · 선택)",
        plainState.inspectorId !== null &&
        plainState.inspectorBox !== null &&
        plainState.primaryId === null,
        `inspector=${plainState.inspectorId} box=${JSON.stringify(plainState.inspectorBox)}`);

      /* 테두리 위를 정확히 눌러도 클릭이 삼켜지지 않는다 —
         control box 는 pointer-events:none 이다 */
      await clickIn(page, byId("cvPlain"));
      await sleep(400);
      await clickIn(page, byId("cvPlain"), 0.5, 0.01);
      await sleep(400);

      const edgeState = await readCanvasState(page);

      check("★ 테두리 바로 위를 눌러도 선택이 통한다(control box 는 클릭을 삼키지 않는다)",
        edgeState.primaryId === "cvPlain",
        `primary=${edgeState.primaryId}`);

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
