/* =========================================================
   HOME CANVAS — 수동 테스트 스킨 통합 smoke E2E
   (HOME-CANVAS-MILESTONE-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)

   ★ 이 파일은 **새 기능을 재지 않는다.**

   이동(§17) · 리사이즈(§18) · 회전(§19)의 세부 판정은 각자의 e2e 가
   이미 갖고 있다. 여기서 묻는 것은 하나다 —

     "주인이 배포된 Studio 에서 `imory-home-canvas-manual-v1.json` 을
      Import 해서 실제로 그 기능을 손으로 시험할 수 있는가."

   그래서 대상이 합성 fixture 가 아니라 **저장소에 실제로 들어가는
   그 JSON 파일**이다. 그 파일을 읽어서 Import 게이트에 넣고, 통과한
   결과를 draft 로 올려 한 흐름(Import → Validate → Apply → 렌더 →
   Select → 이동/리사이즈/회전 + Undo/Redo → 다중 선택 → Save →
   다시 열기 → Export → 재Import → Publish resolve → sandbox parity)
   을 끝까지 한 번 지난다.

   ── 왜 실제 파일을 읽는가 ───────────────────────────────
   builder 가 만든 JSON 을 테스트가 다시 손으로 조립하면, 파일이
   깨져도 테스트는 통과한다. 사용자가 고를 그 바이트가 Import 를
   지나는지가 이 라운드의 산출물이므로 파일을 그대로 읽는다.

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함) — transform · resize · rotate e2e 와
   같다.

   ── 이미지 ─────────────────────────────────────────────
   그 스킨은 슬롯을 **비워서** 배포된다(저장소에 그림을 넣지 않는다).
   그래서 두 경우를 다 본다: [render] 는 **빈 슬롯**에서 구조와 조작이
   되는지, [images] 는 실행 중에만 만드는 SVG fixture 를 한 슬롯에
   넣었을 때 `<img>` 가 붙는지. fixture 를 JSON 에 심지 않는다.

   ── 브라우저 ───────────────────────────────────────────
   `--browser=webkit` 을 받는다. 다만 **포인터 조작 절은 Chromium
   에서만** 돈다(Moveable 손잡이 제스처는 형제 e2e 넷이 모두 Chromium
   전용이다 — 같은 이유). WebKit 에서는 그 절들을 건너뛴다고 찍고,
   Import · 렌더 · 왕복 · parity 는 두 브라우저에서 모두 돈다.

   [import]   실제 파일이 Import 게이트를 지난다 · 표식 1개 ·
              canvas 왕복 · CSS 가 살아남는다 · 이미지 슬롯 목록
   [render]   빈 슬롯에서 11개 요소가 실제로 그려진다 · 좌표 ·
              겹침 순서 · auto 높이 · 도화지 밖 요소 · 카테고리 링크
   [images]   슬롯을 채우면 img 가 붙는다(fixture 는 실행 중에만)
   [select]   Select 모드 · 단일 선택 · 잠긴 배경은 안 골라진다
   [move]     이동 + Undo/Redo                      (Chromium)
   [resize]   리사이즈 + Undo/Redo · auto 가로/세로  (Chromium)
   [rotate]   회전 + Undo/Redo                      (Chromium)
   [multi]    lasso · Shift · 다중에는 손잡이 없음 · 잠긴 배경 위 lasso
                                                     (Chromium)
   [round]    Save → 다시 열기 → Export → 재Import → Publish resolve
   [sandbox]  별도 origin 에서 같은 JSON · CSP 위반 0
   [safety]   기본 스킨 불변 · 공개 화면에 vendor 요청 0

   실행:
     node studio/studio-home-canvas-manual-skin-e2e-test.mjs
     node studio/studio-home-canvas-manual-skin-e2e-test.mjs --only=render
     node studio/studio-home-canvas-manual-skin-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 9002;
const SANDBOX_PORT = 9003;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html?scenario=lay";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const ONLY = argOf("only", "");
const BROWSER = argOf("browser", "chromium");

const wants = (name) => !ONLY || ONLY.split(",").map((n) => n.trim()).includes(name);
const section = (name) => console.log(`\n[${name}]`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 포인터 조작 절은 Chromium 에서만 — 머리말의 그 이유 */
const POINTER_OK = BROWSER === "chromium";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name, why) {
  console.log(`  SKIP  ${name} — ${why}`);
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
    if (!mod[BROWSER]) continue;
    try {
      const probe = await mod[BROWSER].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }
  throw new Error(`playwright ${BROWSER} 을 실행할 수 없습니다.\n  - ${tried.join("\n  - ") || "없음"}`);
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

/*
  ★ 저장소에 그림을 넣지 않는다 — 이 SVG 는 **실행 중에만** 있는
    fixture 이고 [images] 절에서만 슬롯에 꽂힌다. 수동 테스트 JSON
    에는 들어가지 않는다(계약이 아니라 도구다).
*/
const FIXTURE_IMAGE_PATH = "/__canvas-manual-fixture__/swatch.svg";
const FIXTURE_IMAGE_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">' +
  '<rect width="120" height="40" fill="#1d3557"/></svg>';


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
   대상 — **저장소의 그 파일 그대로**
========================================================== */

const MANUAL_REL = "skin/test-skins/imory-home-canvas-manual-v1.json";

const MANUAL_TEXT =
  fs.readFileSync(path.join(ROOT, MANUAL_REL), "utf8");

const MANUAL = JSON.parse(MANUAL_TEXT);

const MANUAL_IDS =
  MANUAL.regions
    .find((r) => r.name === "home_canvas")
    .canvas.elements.map((el) => el.id);

/*
  `lay` scenario 가 선언한 카테고리 — category_nav(mode:"all") 이
  무엇을 그려야 하는가의 정답이다.

  ★ 숫자를 테스트에 박지 않는다. 하네스는 FIXTURES 를 window 에
    올리지 않으므로(그것을 위해 하네스를 고치는 것은 이 라운드의
    범위가 아니다) 선언된 자리를 파일에서 읽는다 — 하네스가
    카테고리를 늘리거나 줄이면 이 값이 같이 따라온다.
*/
const SCENARIO_CATEGORIES = (() => {

  const text =
    fs.readFileSync(path.join(HERE, "studio-lifecycle-scenario.html"), "utf8");

  const re =
    /\{\s*id:\s*"([^"]+)",\s*user_id:\s*"user-lay",\s*name:\s*"([^"]+)",\s*type:\s*"([^"]+)"/g;

  const out = [];

  let m;
  while ((m = re.exec(text))) {
    out.push({ id: m[1], name: m[2], type: m[3] });
  }

  return out;

})();

/* 이 절들이 쓰는 요소 — JSON 의 그 id 다 */
const PHOTO = "canvas_photo";
const STICKER = "canvas_sticker";
const AUTO_TEXT = "canvas_caption";
const LOCKED_BG = "canvas_backdrop";
const NOTE = "canvas_note_text";


/* =========================================================
   Studio 열기
========================================================== */

async function openStudio(browser, options) {

  const o = options || {};

  const errors = [];
  const vendorRequests = [];

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

  page.on("request", (req) => {
    if (req.url().includes("/studio/vendor/home-canvas/")) {
      vendorRequests.push(req.url());
    }
  });

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    ([pkg, slots]) => {
      window.__scenarioLaySkinPackage = pkg;
      window.__scenarioLaySkinImageSlotValues = slots;
    },
    [o.package || MANUAL, o.slots || []]
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
   좌표 — transform · resize · rotate e2e 와 같은 자
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


/* 손잡이 여덟의 자리 */
async function handleCenters(page, frame, sandbox) {

  const boxes = sandbox
    ? await frame.evaluate((sel) =>
        Array.from(document.querySelectorAll(sel)).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            dir: el.getAttribute("data-direction"),
            x: r.left + r.width / 2, y: r.top + r.height / 2
          };
        }), HANDLE_SELECTOR)
    : await page.evaluate((sel) => {
        const f = document.getElementById("studioPreviewFrame");
        const doc = f.contentDocument;
        const box = f.getBoundingClientRect();
        const scale = box.width / (f.offsetWidth || box.width);
        const cs = getComputedStyle(f);
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const bt = parseFloat(cs.borderTopWidth) || 0;
        return Array.from(doc.querySelectorAll(sel)).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            dir: el.getAttribute("data-direction"),
            x: box.left + (bl + r.left + r.width / 2) * scale,
            y: box.top + (bt + r.top + r.height / 2) * scale
          };
        });
      }, HANDLE_SELECTOR);

  const out = {};

  /* sandbox 는 프레임 좌표라 부모 좌표로 올린다 */
  if (sandbox) {
    const shift =
      await page.evaluate(() => {
        const f = document.getElementById("studioPreviewFrame");
        const r = f.getBoundingClientRect();
        return { x: r.left, y: r.top };
      });
    boxes.forEach((b) => {
      out[b.dir] = { x: b.x + shift.x, y: b.y + shift.y };
    });
    return out;
  }

  boxes.forEach((b) => { out[b.dir] = { x: b.x, y: b.y }; });

  return out;

}


async function rotationHandle(page, frame, sandbox) {

  const list = sandbox
    ? await frame.evaluate((sel) =>
        Array.from(document.querySelectorAll(sel)).map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }), ROTATION_SELECTOR)
    : await page.evaluate((sel) => {
        const f = document.getElementById("studioPreviewFrame");
        const doc = f.contentDocument;
        const box = f.getBoundingClientRect();
        const scale = box.width / (f.offsetWidth || box.width);
        const cs = getComputedStyle(f);
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const bt = parseFloat(cs.borderTopWidth) || 0;
        return Array.from(doc.querySelectorAll(sel)).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: box.left + (bl + r.left + r.width / 2) * scale,
            y: box.top + (bt + r.top + r.height / 2) * scale
          };
        });
      }, ROTATION_SELECTOR);

  if (!list.length) return null;

  if (sandbox) {
    const shift = await page.evaluate(() => {
      const r = document.getElementById("studioPreviewFrame").getBoundingClientRect();
      return { x: r.left, y: r.top };
    });
    return { x: list[0].x + shift.x, y: list[0].y + shift.y };
  }

  return list[0];

}


/* =========================================================
   입력
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
  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 700 : o.settle);

}


/* 그 요소를 화면 가운데보다 조금 아래로 — 회전 손잡이가 요소 위로
   40px 떨어져 있으므로(rotate e2e 와 같은 이유) */
async function bringIntoView(page, frame, sandbox, id) {

  if (sandbox) {

    const wantY = page.viewportSize().height * 0.6;

    for (let i = 0; i < 4; i += 1) {

      const box =
        await frame.locator(byId(id)).first().boundingBox().catch(() => null);

      if (!box) break;

      const delta = (box.y + box.height / 2) - wantY;

      if (Math.abs(delta) < 20) break;

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


async function dragElement(page, frame, sandbox, id, dx, dy) {

  await bringIntoView(page, frame, sandbox, id);

  const box = (await rectsFor(page, frame, sandbox, [id]))[byId(id)];

  if (!box) throw new Error("요소를 찾지 못했습니다: " + id);

  const from = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2
  };

  await dragFrom(page, from, { x: from.x + dx, y: from.y + dy });

}


async function resizeBy(page, frame, sandbox, id, dir, dx, dy) {

  await bringIntoView(page, frame, sandbox, id);

  const handle = (await handleCenters(page, frame, sandbox))[dir];

  if (!handle) throw new Error(`손잡이를 찾지 못했습니다: ${id} ${dir}`);

  await dragFrom(page, handle, { x: handle.x + dx, y: handle.y + dy });

}


/* 회전 손잡이를 호(arc)로 끈다 — rotate e2e 와 같은 이유로 직선이
   아니다(중심을 스치면 각도가 요동친다) */
async function rotateBy(page, frame, sandbox, id, deg) {

  await bringIntoView(page, frame, sandbox, id);

  const box = (await rectsFor(page, frame, sandbox, [id]))[byId(id)];
  const handle = await rotationHandle(page, frame, sandbox);

  if (!box || !handle) throw new Error("회전 손잡이를 찾지 못했습니다: " + id);

  const center = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2
  };

  const radius = Math.hypot(handle.x - center.x, handle.y - center.y);
  const start = Math.atan2(handle.y - center.y, handle.x - center.x);

  const steps = 12;

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();

  for (let i = 1; i <= steps; i += 1) {
    const angle = start + (deg * Math.PI / 180) * (i / steps);
    await page.mouse.move(
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle)
    );
  }

  await page.mouse.up();

  await sleep(700);

}


async function dragBox(page, from, to, options) {

  const o = options || {};

  if (o.shift) await page.keyboard.down("Shift");

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / 8),
      from.y + (to.y - from.y) * (i / 8)
    );
  }

  await page.mouse.up();

  if (o.shift) await page.keyboard.up("Shift");

  await sleep(500);

}


function boxOver(rects, keys) {

  const boxes = keys.map((k) => rects[k]).filter(Boolean);

  if (boxes.length !== keys.length) return null;

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


async function clickElement(page, frame, sandbox, id, options) {

  const o = options || {};

  await bringIntoView(page, frame, sandbox, id);

  const box = (await rectsFor(page, frame, sandbox, [id]))[byId(id)];

  if (!box) throw new Error("요소를 찾지 못했습니다: " + id);

  if (o.shift) await page.keyboard.down("Shift");

  await page.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2);

  if (o.shift) await page.keyboard.up("Shift");

  await sleep(500);

}


/* =========================================================
   읽기 — JSON 이 진실이다
========================================================== */

const readCanvas = (page) => page.evaluate(() => {

  if (typeof currentWorkingSkin === "undefined" || !currentWorkingSkin) return null;

  const entry =
    (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

  return entry ? JSON.parse(JSON.stringify(entry)) : null;

});

const elementOf = (canvas, id) =>
  canvas ? canvas.canvas.elements.find((el) => el.id === id) || null : null;

const geomOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el
    ? {
        x: el.x, y: el.y, width: el.width, height: el.height,
        rotation: Object.prototype.hasOwnProperty.call(el, "rotation")
          ? el.rotation : "칸없음"
      }
    : null;
};

const readState = (page) => page.evaluate(() => {
  const c = window.getStudioCanvasSelection();
  return {
    ids: c.ids,
    primaryId: c.primaryId,
    count: c.ids.length,
    editing: window.studioCanvasEditingIsOn ? window.studioCanvasEditingIsOn() : null
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


async function waitForDraggable(page, frame, want = true, timeout = 8000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {
    const state = await frameState(frame).catch(() => null);
    if (state && !!state.draggable === want) return state;
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

  console.log(`\nbrowser: ${BROWSER}${POINTER_OK ? "" : " (포인터 조작 절은 건너뜀)"}`);
  console.log(`대상: ${MANUAL_REL} — 요소 ${MANUAL_IDS.length}개`);

  const pw = await loadPlaywright();

  const servers = [
    await startServer(PARENT_PORT),
    await startServer(SANDBOX_PORT)
  ];

  const browser = await pw[BROWSER].launch();

  try {

    /* ======================================================
       [import] — 실제 파일이 Import 게이트를 지난다
    ====================================================== */
    if (wants("import")) {

      section("import");

      const page = await openStudio(browser, {});

      const result = await page.evaluate(async (text) => {

        const r = await window.validateSkinPackageImport(text);

        if (!r.ok) return { ok: false, reason: r.reason, message: r.message };

        const pkg = r.skinPackage;
        const entry = (pkg.regions || []).find((x) => x && x.name === "home_canvas");

        return {
          ok: true,
          roots: window.countSkinHomeCanvasRoots(pkg.templates.home.html),
          enabled: entry ? entry.enabled : null,
          version: entry ? entry.canvas.version : null,
          baseWidth: entry ? entry.canvas.baseWidth : null,
          baseHeight: entry ? entry.canvas.baseHeight : null,
          ids: entry ? entry.canvas.elements.map((el) => el.id) : [],
          canvasJson: entry ? JSON.stringify(entry.canvas) : null,
          slots: (pkg.imageSlots || []).map((s) => s.name),
          cssLength: String(pkg.css || "").length,
          hasHcm: String(pkg.css || "").indexOf("hcm-canvas") !== -1,
          templateKeys: Object.keys(pkg.templates).sort().join(",")
        };

      }, MANUAL_TEXT);

      check("★ [import] 저장소의 그 JSON 이 Import 검증을 통과한다",
        result.ok === true,
        result.ok ? "" : `${result.reason} — ${result.message}`);

      check("[import] HOME 표시 위치가 정확히 하나다",
        result.ok && result.roots === 1, String(result.roots));

      check("[import] home_canvas v1 이 켜져 있고 도화지가 390×844 다",
        result.ok && result.enabled === true && result.version === 1 &&
        result.baseWidth === 390 && result.baseHeight === 844,
        JSON.stringify({ v: result.version, w: result.baseWidth, h: result.baseHeight }));

      check("★ [import] 요소 11개가 순서 그대로 살아 있다",
        result.ok && result.ids.join() === MANUAL_IDS.join(),
        result.ok ? result.ids.join(" ") : "");

      check("★ [import] Canvas JSON 이 파일의 그것과 한 글자도 다르지 않다",
        result.ok &&
        result.canvasJson ===
          JSON.stringify(MANUAL.regions.find((r) => r.name === "home_canvas").canvas));

      check("[import] 이미지 슬롯 셋이 그대로 나온다",
        result.ok && result.slots.join() === "photo_main,sticker_1,title_logo",
        result.ok ? result.slots.join(" ") : "");

      check("★ [import] CSS 가 Import 판정에서 살아남는다(전부 버려지지 않았다)",
        result.ok && result.cssLength > 500 && result.hasHcm === true,
        result.ok ? `${result.cssLength}자` : "");

      check("[import] 다섯 화면 template 이 다 들어 있다",
        result.ok && result.templateKeys === "banner,category,folder,home,post",
        result.ok ? result.templateKeys : "");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [render] — 빈 슬롯에서 실제로 그려진다

       ★ 이 절은 슬롯을 **비워 둔다**. 저장소에 그림이 없는 채로
         배포되므로, 주인이 Import 한 직후의 화면이 바로 이것이다.
    ====================================================== */
    if (wants("render")) {

      section("render");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      const drawn = await page.evaluate(() => {

        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const root = doc.querySelector("[data-imory-canvas-root]");

        const els =
          Array.from(doc.querySelectorAll("[data-imory-canvas-element]"));

        const at = (id) => {
          const el = doc.querySelector(`[data-imory-edit-id="${id}"]`);
          if (!el) return null;
          return {
            x: el.style.getPropertyValue("--imory-canvas-x"),
            y: el.style.getPropertyValue("--imory-canvas-y"),
            width: el.style.getPropertyValue("--imory-canvas-width"),
            rotation: el.style.getPropertyValue("--imory-canvas-rotation"),
            heightMode: el.getAttribute("data-imory-canvas-height"),
            type: el.getAttribute("data-imory-canvas-type"),
            locked: el.hasAttribute("data-imory-canvas-locked"),
            offsetHeight: el.offsetHeight,
            hasImg: !!el.querySelector("img")
          };
        };

        const rootBox = root.getBoundingClientRect();

        return {
          active: root.getAttribute("data-imory-canvas-active"),
          version: root.getAttribute("data-imory-canvas-version"),
          count: els.length,
          order: els.map((el) => el.getAttribute("data-imory-edit-id")),
          /* 도화지가 aspect-ratio 로 세로를 받았는가 */
          ratio: rootBox.height / rootBox.width,
          rootWidth: rootBox.width,
          photo: at("canvas_photo"),
          sticker: at("canvas_sticker"),
          caption: at("canvas_caption"),
          note: at("canvas_note_text"),
          backdrop: at("canvas_backdrop"),
          edge: at("canvas_edge_mark"),
          logoText: (() => {
            const el = doc.querySelector('[data-imory-edit-id="canvas_logo"]');
            const span = el && el.querySelector("[data-imory-canvas-logo-text]");
            return span ? span.textContent : null;
          })(),
          navLinks: Array.from(
            doc.querySelectorAll('[data-imory-edit-id="canvas_nav"] [data-imory-canvas-nav-item]')
          ).map((a) => ({ text: a.textContent, href: a.getAttribute("href") }))
        };

      });

      check("★ [render] 도화지가 활성이고 요소 11개가 그려진다",
        drawn.active === "true" && drawn.version === "1" &&
        drawn.count === MANUAL_IDS.length,
        `${drawn.count}개`);

      check("★ [render] DOM 순서가 배열 순서 그대로다(= 겹침 앞뒤 순서)",
        drawn.order.join() === MANUAL_IDS.join(),
        drawn.order.join(" "));

      check("[render] 도화지 세로가 가로에 390:844 로 묶여 있다",
        Math.abs(drawn.ratio - 844 / 390) < 0.02,
        `${drawn.ratio.toFixed(3)} (want ${(844 / 390).toFixed(3)}) · 폭 ${drawn.rootWidth.toFixed(0)}px`);

      /* 좌표는 백분율이다 — 저장값 / base * 100 */
      const pct = (v, base) => `${(v / base * 100)}%`;

      check("★ [render] photo 의 좌표가 저장값에서 나온 백분율이다",
        drawn.photo &&
        Math.abs(parseFloat(drawn.photo.x) - 24 / 390 * 100) < 0.001 &&
        Math.abs(parseFloat(drawn.photo.y) - 168 / 844 * 100) < 0.001 &&
        Math.abs(parseFloat(drawn.photo.width) - 236 / 390 * 100) < 0.001,
        JSON.stringify(drawn.photo));

      check("[render] 초기 회전이 실제로 적용된다(photo -4° · sticker 16°)",
        drawn.photo && drawn.sticker &&
        Math.abs(parseFloat(drawn.photo.rotation) + 4) < 0.001 &&
        Math.abs(parseFloat(drawn.sticker.rotation) - 16) < 0.001,
        `${drawn.photo && drawn.photo.rotation} · ${drawn.sticker && drawn.sticker.rotation}`);

      check('★ [render] auto 높이 글자는 내용이 높이를 정한다(height="auto")',
        drawn.caption && drawn.caption.heightMode === "auto" &&
        drawn.caption.offsetHeight > 0,
        drawn.caption ? `${drawn.caption.heightMode} · ${drawn.caption.offsetHeight}px` : "");

      check('[render] 숫자 높이 글자는 fixed 다',
        drawn.note && drawn.note.heightMode === "fixed",
        drawn.note ? drawn.note.heightMode : "");

      check("[render] 잠긴 배경이 locked 표시를 갖는다",
        drawn.backdrop && drawn.backdrop.locked === true);

      check("[render] 도화지 밖으로 나간 장식이 음수 백분율을 받는다",
        drawn.edge && parseFloat(drawn.edge.x) < 0,
        drawn.edge ? drawn.edge.x : "");

      check("★ [render] 빈 슬롯에는 img 가 없고 wrapper 만 남는다",
        drawn.photo && drawn.photo.hasImg === false &&
        drawn.sticker && drawn.sticker.hasImg === false);

      check("[render] 로고 슬롯이 비면 블로그 제목이 글자로 나온다",
        typeof drawn.logoText === "string" && drawn.logoText.length > 0,
        String(drawn.logoText));

      /*
        mode:"all" 이므로 링크는 **표시 가능한 카테고리 전부**여야
        한다. 숫자를 여기 박지 않는다 — scenario 가 선언한 그 목록
        (SCENARIO_CATEGORIES, 파일에서 읽는다)과 이름까지 대조한다.
        하네스가 카테고리를 늘리면 이 절이 같이 따라온다.
      */
      check("★ [render] category_nav 가 표시 가능한 카테고리 전부를 실제 링크로 그린다",
        drawn.navLinks.length === SCENARIO_CATEGORIES.length &&
        drawn.navLinks.map((a) => a.text).join() ===
          SCENARIO_CATEGORIES.map((c) => c.name).join() &&
        drawn.navLinks.every((a, i) =>
          typeof a.href === "string" &&
          a.href.endsWith(`/category/${SCENARIO_CATEGORIES[i].id}`)),
        `${drawn.navLinks.length}/${SCENARIO_CATEGORIES.length} — ` +
        drawn.navLinks.map((a) => `${a.text}→${a.href}`).join(" "));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [images] — 슬롯을 채우면 img 가 붙는다

       ★ fixture SVG 는 실행 중에만 있다. JSON 에 넣지 않는다.
    ====================================================== */
    if (wants("images")) {

      section("images");

      /*
        ★ 슬롯 값은 **루트 상대 주소**로 넣는다. `isSafeSkinUrl()`
          (skin/skin-sanitize.js — sanitizer 와 런타임 URL 바인딩의
          단일 판정 함수)은 최종 protocol 이 `https:` 인 것만 통과
          시키므로 `http://localhost:PORT/...` 는 **거부된다**. 루트
          상대 주소는 판정용 base 가 https 라서 통과하고, 실제 문서
          에서는 이 테스트 서버의 그 파일로 풀린다.

          그래서 이 절이 img 를 보는 것 자체가 의미가 있다 — 주소가
          막히면 계약대로 wrapper 만 남고 src 가 붙지 않으므로
          (§12-4) "이미지가 실제로 연결됐다"를 검증하는 자리가 된다.
      */
      const page = await openStudio(browser, {
        slots: [
          { skin_id: "skin-lay1", slot_name: "photo_main", image_url: FIXTURE_IMAGE_PATH }
        ]
      });

      await canvasFrame(page, false);

      const shown = await page.evaluate(() => {

        const doc = document.getElementById("studioPreviewFrame").contentDocument;

        const img =
          doc.querySelector('[data-imory-edit-id="canvas_photo"] img');

        const sticker =
          doc.querySelector('[data-imory-edit-id="canvas_sticker"] img');

        return {
          hasPhotoImg: !!img,
          src: img ? img.getAttribute("src") : null,
          alt: img ? img.getAttribute("alt") : null,
          fit: img ? getComputedStyle(img).objectFit : null,
          /* 안 채운 슬롯은 그대로 비어 있다 */
          hasStickerImg: !!sticker
        };

      });

      check("★ [images] 채운 슬롯에 img 가 붙는다",
        shown.hasPhotoImg === true && /swatch\.svg/.test(String(shown.src)),
        String(shown.src));

      check("[images] alt 는 빈 문자열이다(장식 이미지)",
        shown.alt === "");

      check("[images] object-fit:cover 가 듣는다(사진이 눌리지 않는다)",
        shown.fit === "cover", String(shown.fit));

      check("[images] 안 채운 슬롯은 여전히 비어 있다",
        shown.hasStickerImg === false);

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [select] — Select 모드와 단일 선택
    ====================================================== */
    if (wants("select")) {

      section("select");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      check("[select] Select 를 켜기 전에는 캔버스 편집이 꺼져 있다",
        (await page.evaluate(() =>
          window.studioCanvasEditingIsOn ? window.studioCanvasEditingIsOn() : null)) !== true);

      await enableCanvasEditing(page);

      check("★ [select] Canvas 가 있는 HOME 에서 Select 를 켜면 편집이 켜진다",
        (await readState(page)).editing === true);

      await clickElement(page, frame, false, PHOTO);

      const one = await readState(page);

      check("★ [select] photo 를 클릭하면 그것 하나가 골라진다",
        one.count === 1 && one.ids[0] === PHOTO,
        one.ids.join(" "));

      /* 잠긴 배경 — 클릭으로 골라지지 않는다(§14-3) */
      await page.mouse.click(10, 10);
      await sleep(300);

      const canvasBox =
        (await nativeRects(page, []))["__canvas"];

      /* 도화지 안이면서 다른 요소가 없는 자리 = 잠긴 배경 위 */
      await page.mouse.click(
        canvasBox.right - 12,
        canvasBox.top + 12
      );
      await sleep(500);

      const bg = await readState(page);

      check("★ [select] 잠긴 배경은 클릭으로 골라지지 않는다",
        !bg.ids.includes(LOCKED_BG),
        bg.ids.join(" ") || "(없음)");

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [move] — 이동 + Undo/Redo                    (Chromium)
    ====================================================== */
    if (wants("move")) {

      section("move");

      if (!POINTER_OK) {
        skip("이동 · Undo/Redo", `${BROWSER} 에서는 Moveable 제스처를 재지 않는다`);
      }
      else {

        const page = await openStudio(browser, {});
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await clickElement(page, frame, false, PHOTO);
        await waitForDraggable(page, frame, true);

        const before = geomOf(await readCanvas(page), PHOTO);
        const h0 = await historyState(page);

        await dragElement(page, frame, false, PHOTO, 60, 40);

        const after = geomOf(await readCanvas(page), PHOTO);
        const h1 = await historyState(page);

        check("★ [move] 본체를 끌면 x · y 가 바뀐다",
          after.x !== before.x && after.y !== before.y,
          `${JSON.stringify(before)} → ${JSON.stringify(after)}`);

        check("★ [move] 상자의 나머지 칸은 그대로다",
          after.width === before.width && after.height === before.height &&
          after.rotation === before.rotation);

        check("[move] 한 제스처가 Undo 한 칸이다",
          h1.undo === h0.undo + 1, `${h0.undo} → ${h1.undo}`);

        await page.click("#studioUndoButton");
        await sleep(900);

        check("★ [move] Undo 가 원래 자리로 돌린다",
          JSON.stringify(geomOf(await readCanvas(page), PHOTO)) === JSON.stringify(before));

        await page.click("#studioRedoButton");
        await sleep(900);

        check("[move] Redo 가 옮긴 자리로 돌아온다",
          JSON.stringify(geomOf(await readCanvas(page), PHOTO)) === JSON.stringify(after));

        check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

        await close(page);

      }

    }


    /* ======================================================
       [resize] — 리사이즈 + auto 높이 전환         (Chromium)
    ====================================================== */
    if (wants("resize")) {

      section("resize");

      if (!POINTER_OK) {
        skip("리사이즈 · auto 높이 전환", `${BROWSER} 에서는 Moveable 제스처를 재지 않는다`);
      }
      else {

        const page = await openStudio(browser, {});
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await clickElement(page, frame, false, PHOTO);
        await waitForDraggable(page, frame, true);

        const handles = await handleCenters(page, frame, false);

        check("★ [resize] 단독 선택에 손잡이 여덟이 붙는다",
          Object.keys(handles).length === 8,
          Object.keys(handles).sort().join(" "));

        const before = geomOf(await readCanvas(page), PHOTO);

        await resizeBy(page, frame, false, PHOTO, "se", 50, 40);

        const after = geomOf(await readCanvas(page), PHOTO);

        check("★ [resize] se 손잡이가 width · height 를 키운다",
          after.width > before.width && after.height > before.height,
          `${before.width}×${before.height} → ${after.width}×${after.height}`);

        await page.click("#studioUndoButton");
        await sleep(900);

        check("[resize] Undo 가 원래 크기로 돌린다",
          JSON.stringify(geomOf(await readCanvas(page), PHOTO)) === JSON.stringify(before));

        /* --- auto 높이 글자: 가로는 유지 · 세로는 숫자로 --- */

        await clickElement(page, frame, false, AUTO_TEXT);
        await waitForDraggable(page, frame, true);

        const autoBefore = geomOf(await readCanvas(page), AUTO_TEXT);

        check('[resize] 그 글자는 height:"auto" 로 시작한다',
          autoBefore.height === "auto", JSON.stringify(autoBefore));

        await resizeBy(page, frame, false, AUTO_TEXT, "e", -40, 0);

        const autoWide = geomOf(await readCanvas(page), AUTO_TEXT);

        check('★ [resize] 좌우 손잡이는 "auto" 를 지킨다',
          autoWide.height === "auto" && autoWide.width < autoBefore.width,
          JSON.stringify(autoWide));

        await resizeBy(page, frame, false, AUTO_TEXT, "s", 40, 40);

        const autoTall = geomOf(await readCanvas(page), AUTO_TEXT);

        check('★ [resize] 세로 손잡이는 "auto" 를 숫자로 바꾼다',
          typeof autoTall.height === "number",
          JSON.stringify(autoTall));

        await page.click("#studioUndoButton");
        await sleep(900);

        check('★ [resize] Undo 하면 정확히 "auto" 로 돌아온다',
          geomOf(await readCanvas(page), AUTO_TEXT).height === "auto");

        check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

        await close(page);

      }

    }


    /* ======================================================
       [rotate] — 회전 + Undo/Redo                  (Chromium)
    ====================================================== */
    if (wants("rotate")) {

      section("rotate");

      if (!POINTER_OK) {
        skip("회전 · Undo/Redo", `${BROWSER} 에서는 Moveable 제스처를 재지 않는다`);
      }
      else {

        const page = await openStudio(browser, {});
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);
        await clickElement(page, frame, false, NOTE);
        await waitForDraggable(page, frame, true);

        const handle = await rotationHandle(page, frame, false);

        check("★ [rotate] 단독 선택에 회전 손잡이 하나가 붙는다", !!handle);

        const before = geomOf(await readCanvas(page), NOTE);

        await rotateBy(page, frame, false, NOTE, 30);

        const after = geomOf(await readCanvas(page), NOTE);

        check("★ [rotate] 회전 손잡이가 rotation 을 바꾼다",
          typeof after.rotation === "number" && after.rotation !== before.rotation,
          `${before.rotation} → ${after.rotation}`);

        check("★ [rotate] 상자 네 칸은 바뀌지 않는다",
          after.x === before.x && after.y === before.y &&
          after.width === before.width && after.height === before.height,
          JSON.stringify({ before, after }));

        await page.click("#studioUndoButton");
        await sleep(900);

        check("[rotate] Undo 가 원래 각도로 돌린다",
          JSON.stringify(geomOf(await readCanvas(page), NOTE)) === JSON.stringify(before));

        await page.click("#studioRedoButton");
        await sleep(900);

        check("[rotate] Redo 가 돌린 각도로 돌아온다",
          JSON.stringify(geomOf(await readCanvas(page), NOTE)) === JSON.stringify(after));

        check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

        await close(page);

      }

    }


    /* ======================================================
       [multi] — lasso · Shift · 다중에는 손잡이 없음 (Chromium)
    ====================================================== */
    if (wants("multi")) {

      section("multi");

      if (!POINTER_OK) {
        skip("lasso · 다중 선택", `${BROWSER} 에서는 Selecto 제스처를 재지 않는다`);
      }
      else {

        const page = await openStudio(browser, {});
        const frame = await canvasFrame(page, false);

        await enableCanvasEditing(page);

        /* --- Shift 클릭으로 둘 --- */

        await clickElement(page, frame, false, PHOTO);
        await clickElement(page, frame, false, STICKER, { shift: true });

        const two = await readState(page);

        check("★ [multi] Shift 클릭으로 둘을 고른다",
          two.count === 2 &&
          two.ids.includes(PHOTO) && two.ids.includes(STICKER),
          two.ids.join(" "));

        const handles = await handleCenters(page, frame, false);
        const rot = await rotationHandle(page, frame, false);

        check("★ [multi] 다중 선택에는 조작 손잡이가 없다",
          Object.keys(handles).length === 0 && rot === null,
          `손잡이 ${Object.keys(handles).length} · 회전 ${rot ? 1 : 0}`);

        /* --- lasso — 잠긴 배경 위에서 시작한다 --- */

        await page.mouse.click(10, 10);
        await sleep(300);

        await bringIntoView(page, frame, false, NOTE);

        const rects =
          await nativeRects(page, [byId(NOTE), byId("canvas_note_panel")]);

        const area = boxOver(rects, [byId(NOTE), byId("canvas_note_panel")]);

        check("[multi] lasso 를 칠 자리를 찾았다", !!area);

        if (area) {

          await dragBox(page, area.from, area.to);

          const lassoed = await readState(page);

          check("★ [multi] 잠긴 배경 위에서 시작한 lasso 가 요소들을 고른다",
            lassoed.count >= 2 &&
            lassoed.ids.includes(NOTE) &&
            lassoed.ids.includes("canvas_note_panel"),
            lassoed.ids.join(" "));

          check("★ [multi] lasso 결과에 잠긴 배경은 들어오지 않는다",
            !lassoed.ids.includes(LOCKED_BG),
            lassoed.ids.join(" "));

          /*
            빈 lasso 는 해제.

            ★ 자리를 **다시 재서** 잡는다. 위에서 쓴 rects 는 lasso
              전에 찍은 것이고, 그 사이 bringIntoView 가 Preview 를
              스크롤했으므로 도화지 위쪽은 이미 화면 밖일 수 있다.
              화면 밖 좌표로 끌면 아무 일도 일어나지 않아서 "해제되지
              않았다"가 기능 실패처럼 보인다(계약 §16 의 그 함정).

            자리는 **지금 화면에 있는 caption 의 오른쪽**이다 — 도화지
            안이면서 어떤 요소에도 닿지 않는다(caption 은 x 24~284,
            그 위의 구분선은 y 672~674, 카테고리는 y 752 부터다).
          */
          const fresh =
            await nativeRects(page, [byId(AUTO_TEXT)]);

          const anchor = fresh[byId(AUTO_TEXT)];

          check("[multi] 빈 lasso 를 칠 자리가 화면 안에 있다",
            !!anchor && anchor.right + 70 < fresh.__canvas.right,
            anchor ? JSON.stringify({ right: Math.round(anchor.right) }) : "없음");

          await dragBox(page,
            { x: anchor.right + 10, y: anchor.top + 4 },
            { x: anchor.right + 70, y: anchor.top + 44 });

          check("[multi] 아무것도 못 잡은 lasso 는 선택을 푼다",
            (await readState(page)).count === 0,
            (await readState(page)).ids.join(" ") || "(없음)");

        }

        check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

        await close(page);

      }

    }


    /* ======================================================
       [round] — Save → 다시 열기 → Export → 재Import → Publish
    ====================================================== */
    if (wants("round")) {

      section("round");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      /*
        왕복을 보려면 **draft 가 실제로 더러워져 있어야** 한다 — Save
        버튼은 바뀐 것이 없으면 disabled 다(그게 맞는 동작이다).

        Chromium 은 실제 포인터 제스처로 바꾼다.

        WebKit 에서는 제스처를 재지 않으므로(머리말) 부모의 확정 함수
        `commitStudioCanvasElementTransform()` 를 직접 부른다 —
        프레임이 요청을 올렸을 때 부모가 지나는 **그 경로 그대로**이고
        (선택 · 순번 · expected · 허용 키를 다시 보는 관문 포함) 빠지는
        것은 포인터 입력뿐이다. 그래서 두 브라우저 모두 "바뀐 좌표가
        Save · Export · Publish 를 지나 살아남는가"를 같은 무게로 묻는다.
      */
      await enableCanvasEditing(page);
      await clickElement(page, frame, false, PHOTO);

      let want;

      if (POINTER_OK) {

        await waitForDraggable(page, frame, true);
        await dragElement(page, frame, false, PHOTO, 45, 30);

        want = geomOf(await readCanvas(page), PHOTO);

        check("[round] 제스처로 좌표를 바꿔 두었다",
          want.x !== 24 || want.y !== 168, JSON.stringify(want));

      }
      else {

        const answer = await page.evaluate((id) => {

          const sel = window.getStudioCanvasSelection();

          return window.commitStudioCanvasElementTransform({
            kind: "move",
            id: id,
            expected: { x: 24, y: 168 },
            next: { x: 69, y: 198 },
            generation: sel.generation,
            requestId: 1
          });

        }, PHOTO);

        want = geomOf(await readCanvas(page), PHOTO);

        check("[round] 확정 함수로 좌표를 바꿔 두었다(포인터 없이)",
          answer && answer.accepted === true &&
          want.x === 69 && want.y === 198,
          `${JSON.stringify(answer)} · ${JSON.stringify(want)}`);

        skip("포인터 제스처", `${BROWSER} — 확정 함수 경로로 대신 확인했다`);

      }

      /* --- 입력 non-mutation --- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const el = entry.canvas.elements.find((e) => e.id === "canvas_photo");
        return { x: el.x, y: el.y };
      });

      check("[round] 들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.x === 24 && untouched.y === 168, JSON.stringify(untouched));

      /* --- Export → 재Import --- */

      const roundTrip = await page.evaluate(async () => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const text = window.serializeSkinPackageExport(exported.skinPackage);

        const result = await window.validateSkinPackageImport(text);

        if (!result.ok) return { ok: false, message: result.message };

        const before =
          (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

        const after =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        return {
          ok: true,
          same: JSON.stringify(before.canvas) === JSON.stringify(after.canvas),
          ids: after.canvas.elements.map((el) => el.id),
          roots: window.countSkinHomeCanvasRoots(result.skinPackage.templates.home.html),
          slots: (result.skinPackage.imageSlots || []).map((s) => s.name)
        };

      });

      check("★ [round] Export → 재Import 뒤 Canvas JSON 이 동일하다",
        roundTrip.ok && roundTrip.same === true,
        roundTrip.ok ? "" : String(roundTrip.message));

      check("[round] 왕복 뒤에도 요소 순서와 표식과 슬롯이 그대로다",
        roundTrip.ok && roundTrip.ids.join() === MANUAL_IDS.join() &&
        roundTrip.roots === 1 &&
        roundTrip.slots.join() === "photo_main,sticker_1,title_logo");

      /* --- Publish 가 쓰는 resolve --- */

      const resolved = await page.evaluate(() => {

        const payload =
          window.resolveSkinHomeCanvas(
            currentWorkingSkin,
            currentWorkingSkin.templates.home.html
          );

        const el = payload ? payload.elements.find((e) => e.id === "canvas_photo") : null;

        return payload
          ? {
              count: payload.elements.length,
              baseHeight: payload.baseHeight,
              x: el ? el.x : null,
              y: el ? el.y : null
            }
          : null;

      });

      check("★ [round] Publish 이 쓰는 resolve 에서도 같은 좌표다",
        resolved && resolved.count === MANUAL_IDS.length &&
        resolved.baseHeight === 844 &&
        resolved.x === want.x && resolved.y === want.y,
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

        return {
          content: content,
          canvasJson: entry ? JSON.stringify(entry.canvas) : null
        };

      });

      const workingJson = await page.evaluate(() =>
        JSON.stringify(
          (currentWorkingSkin.regions || [])
            .find((r) => r && r.name === "home_canvas").canvas));

      check("★ [round] Save 가 보낸 content 의 Canvas 가 화면의 그것과 같다",
        saved.canvasJson === workingJson);

      await close(page);

      const reopened = await openStudio(browser, { package: saved.content });

      await canvasFrame(reopened, false);

      const reloaded = geomOf(await readCanvas(reopened), PHOTO);

      check("★ [round] 저장된 draft 로 다시 열면 그 자리에 있다",
        reloaded && reloaded.x === want.x && reloaded.y === want.y,
        JSON.stringify(reloaded));

      const drawnAgain = await reopened.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector('[data-imory-edit-id="canvas_photo"]');
        return {
          x: el ? el.style.getPropertyValue("--imory-canvas-x") : null,
          count: doc.querySelectorAll("[data-imory-canvas-element]").length
        };
      });

      check("[round] 다시 연 화면이 요소 전부를 그 좌표로 다시 그린다",
        drawnAgain.count === MANUAL_IDS.length &&
        Math.abs(parseFloat(drawnAgain.x) - (want.x / 390 * 100)) < 0.001,
        JSON.stringify(drawnAgain));

      check("pageerror 0", reopened.__errors.length === 0, reopened.__errors[0] || "");

      await close(reopened);

    }


    /* ======================================================
       [sandbox] — 별도 origin 에서 같은 JSON
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      /*
        ★ 수동 테스트 JSON 은 `renderMode` 를 **갖지 않는다**(= native).
          그것이 주인이 Import 했을 때의 기본 경로이고, 손으로 시험하기
          에도 단순하다. sandbox 는 같은 파일을 프레임 안에서 그려도
          같은 JSON 이 나오는지 보려는 것이므로, 파일에 모드를 박는
          대신 **사본에만** 켜서 확인한다.
      */
      const sandboxPackage = JSON.parse(JSON.stringify(MANUAL));
      sandboxPackage.renderMode = "sandbox";

      check("[sandbox] 배포되는 JSON 자체에는 renderMode 가 없다(기본은 native)",
        MANUAL.renderMode === undefined, String(MANUAL.renderMode));

      const page = await openStudio(browser, {
        sandbox: true,
        package: sandboxPackage
      });

      const frame = await canvasFrame(page, true);

      check("★ [sandbox] 별도 origin 프레임이다",
        frame.url().startsWith(SANDBOX_ORIGIN), frame.url());

      const inFrame = await frame.evaluate(() => {

        const root = document.querySelector("[data-imory-canvas-root]");
        const els = Array.from(document.querySelectorAll("[data-imory-canvas-element]"));
        const photo = document.querySelector('[data-imory-edit-id="canvas_photo"]');

        return {
          active: root ? root.getAttribute("data-imory-canvas-active") : null,
          count: els.length,
          order: els.map((el) => el.getAttribute("data-imory-edit-id")),
          x: photo ? photo.style.getPropertyValue("--imory-canvas-x") : null,
          rotation: photo ? photo.style.getPropertyValue("--imory-canvas-rotation") : null,
          navLinks: document
            .querySelectorAll('[data-imory-edit-id="canvas_nav"] [data-imory-canvas-nav-item]')
            .length
        };

      });

      check("★ [sandbox] 프레임 안에서도 요소 11개가 순서대로 그려진다",
        inFrame.active === "true" &&
        inFrame.count === MANUAL_IDS.length &&
        inFrame.order.join() === MANUAL_IDS.join(),
        `${inFrame.count}개`);

      check("[sandbox] 좌표와 회전이 native 와 같은 값이다",
        Math.abs(parseFloat(inFrame.x) - 24 / 390 * 100) < 0.001 &&
        Math.abs(parseFloat(inFrame.rotation) + 4) < 0.001,
        JSON.stringify({ x: inFrame.x, r: inFrame.rotation }));

      check("[sandbox] 카테고리 링크도 프레임 안에 같은 수로 그려진다",
        inFrame.navLinks === SCENARIO_CATEGORIES.length,
        `${inFrame.navLinks}/${SCENARIO_CATEGORIES.length}`);

      const violations = await cspViolations(frame);

      check("★ [sandbox] CSP 위반 0",
        violations.length === 0,
        JSON.stringify(violations.slice(0, 3)));

      /* Chromium 이면 프레임 안에서 조작까지 확인하고 JSON 을 대조한다 */
      if (POINTER_OK) {

        await enableCanvasEditing(page);
        await clickElement(page, frame, true, PHOTO);
        await waitForDraggable(page, frame, true);

        const before = geomOf(await readCanvas(page), PHOTO);

        await dragElement(page, frame, true, PHOTO, 40, 30);

        const after = geomOf(await readCanvas(page), PHOTO);

        check("★ [sandbox] 프레임 안에서 끌어도 같은 JSON 칸이 바뀐다",
          after.x !== before.x && after.y !== before.y &&
          after.width === before.width && after.height === before.height,
          `${JSON.stringify(before)} → ${JSON.stringify(after)}`);

        check("★ [sandbox] 조작 뒤에도 CSP 위반 0",
          (await cspViolations(frame)).length === 0);

      }
      else {
        skip("프레임 안 조작", `${BROWSER} 에서는 Moveable 제스처를 재지 않는다`);
      }

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [safety] — 이 스킨이 아무것도 자동으로 바꾸지 않는다
    ====================================================== */
    if (wants("safety")) {

      section("safety");

      /* 기본 스킨 · 다른 test-skin 에 캔버스가 번지지 않았다 */
      const base =
        fs.readFileSync(
          path.join(ROOT, "skin/test-skins/imory-editorial-default-v2.json"), "utf8");

      check("★ [safety] 제품 기본 스킨에는 home_canvas 도 표식도 없다",
        base.indexOf("home_canvas") === -1 &&
        base.indexOf("data-imory-canvas-root") === -1);

      const others =
        fs.readdirSync(path.join(ROOT, "skin/test-skins"))
          .filter((n) => n.endsWith(".json") && n !== "imory-home-canvas-manual-v1.json")
          .filter((n) => {
            const t = fs.readFileSync(path.join(ROOT, "skin/test-skins", n), "utf8");
            return t.indexOf("home_canvas") !== -1 ||
              t.indexOf("data-imory-canvas-root") !== -1;
          });

      check("★ [safety] 캔버스를 가진 test-skin 은 이 파일 하나뿐이다",
        others.length === 0, others.join(" "));

      /*
        공개 화면 — Studio 전용 vendor 를 한 번도 요청하지 않는다.
        캔버스가 **있는** 스킨으로 공개 HOME 을 여는 것이 요점이다
        (없는 스킨에서 0 인 것은 아무것도 증명하지 않는다).
      */
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const pub = await ctx.newPage();

      const vendor = [];
      pub.on("request", (req) => {
        if (req.url().includes("/studio/")) vendor.push(req.url());
      });

      const pubErrors = [];
      pub.on("pageerror", (e) => pubErrors.push(String(e.message || e)));

      await pub.goto(
        `${PARENT_ORIGIN}/skin/skin-home-canvas-render-harness`,
        { waitUntil: "load" });

      await pub.waitForFunction(() => !!window.harnessReady, null, { timeout: 15000 });

      /*
        ★ 공개 문서에 **이 수동 테스트 스킨을** 실제로 그린다.
          캔버스가 없는 기본 fixture 로 "vendor 요청 0" 을 재면
          아무것도 증명하지 않는다 — 요소가 11개 그려진 공개 화면에서
          0 이어야 의미가 있다.
      */
      const publicDrawn = await pub.evaluate(async (pkg) => {

        await window.harnessReady;

        window.renderCanvasHarness({ skinPackage: pkg, width: 390, fresh: true });

        return {
          count: document.querySelectorAll("[data-imory-canvas-element]").length,
          active: (() => {
            const root = document.querySelector("[data-imory-canvas-root]");
            return root ? root.getAttribute("data-imory-canvas-active") : null;
          })()
        };

      }, MANUAL);

      await sleep(800);

      check("[safety] 공개 문서가 이 스킨의 요소 전부를 실제로 그렸다",
        publicDrawn.active === "true" && publicDrawn.count === MANUAL_IDS.length,
        `${publicDrawn.count}/${MANUAL_IDS.length}`);

      check("★ [safety] 캔버스를 그린 공개 문서도 Studio 전용 자산을 요청하지 않는다",
        vendor.length === 0, vendor.slice(0, 3).join(" "));

      check("[safety] 공개 문서에 스크립트 오류 0",
        pubErrors.length === 0, pubErrors[0] || "");

      await ctx.close();

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
