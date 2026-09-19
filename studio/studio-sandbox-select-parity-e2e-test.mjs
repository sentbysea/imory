/* =========================================================
   SANDBOX-SELECT-PARITY-1 — sandbox 스킨의 Select 가 일반 Preview 와 같은가

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §S
             IMORY_DIRECT_UX_DESIGN.md (DIRECT-UX-1)

   DIRECT-UX-1 의 fixture(studio-lifecycle-scenario.html?scenario=dux)를
   **그대로** 쓰되 SkinPackage 에 renderMode:"sandbox" 한 줄만 더해 연다.
   그래서 같은 스킨 · 같은 데이터가 native Preview 와 별도 origin 프레임에서
   각각 그려지고, 그 둘의 Select 동작을 견준다.

   두 개의 실제 origin(8970 = Studio / 8971 = frame)을 띄우고 둘 다
   배포되는 그 functions/_middleware.js 에 통과시킨다
   (studio/studio-sandbox-preview-e2e-test.mjs 와 같은 구성).

   ★ 프레임 안 클릭은 **진짜 포인터**다(page.mouse). 새 선택 규칙은 좌표를
     본다. 좌표 없는 합성 이벤트는 예전 규칙이다(대조군으로 한 번 본다).

     priority  덮개 밑 글자 · 합성은 예전 규칙(대조) · 래퍼 빈 곳 = 해제 ·
               격자 빈틈 = 격자 · 바깥 영역 사슬 · hover 이름표/커서
     names     같은 요소의 이름이 native 와 sandbox 에서 글자 단위로 같다 ·
               패널/이름표/AI chip/selectionContext · 코드 이름 미노출
     overlap   겹친 요소 메뉴(Studio 의 것) · 고르기 · 선택됨 · Esc · 한 사슬
     text      더블클릭 편집 · 입력 중 기록 0 · Ctrl/⌘+Enter 한 칸 · Esc ·
               blur · ↶↷ · 링크 이동 0 · 바인딩 글자는 안 열림
     image     Quick Bar 이미지 변경 → 그 슬롯 · 한 칸 · HTML 불변 · 크기/자르기
               칸 없음과 이유 한 줄
     quickbar  앞으로/뒤로 · 숨기기/보이기 · 형제 순서 · AI로 수정(전송 0)
     move      자유 배치 본체 끌기(끄는 중 프레임이 따라옴 · 놓으면 한 칸)
     restore   패널 수정 · Undo · Redo · Save · 이미지 · AI · Code 뒤 같은 요소 ·
               지운 요소는 해제
     preserve  격자+효과 요소의 글자색만 → 적용 → Undo/Redo → Save → 다시 열기 →
               Select 를 끈(공개와 같은) 렌더
     zoom      Mobile Preview(축소)에서 클릭 좌표 · 이름표 · 테두리 · 스크롤 뒤 이름표
     narrow    390px Studio 창 — 선택 · Quick Bar 는 시트 · 겹친 메뉴는 시트 · 넘침 0
     sheet     (MOBILE-SHEET-1) 390px — 접힘으로 열림 · 바깥 Preview 문서 끝의 여유 ·
               고른 요소가 시트에 덮이지 않음 · 펼치면 바깥 문서만 최소한 스크롤 ·
               접어도 튀지 않음
     forge     프레임 realm 이 지어낸 후보/글자/지시 · 다른 origin 메시지 거부

   실행:
     node studio/studio-sandbox-select-parity-e2e-test.mjs
     node studio/studio-sandbox-select-parity-e2e-test.mjs --only=text
     node studio/studio-sandbox-select-parity-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8970;
const SANDBOX_PORT = 8971;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html";

const SANDBOX_FLAGS =
  `sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(SANDBOX_ORIGIN)}`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const shouldRun = (name) => !ONLY || ONLY === name;

const results = [];
const consoleErrors = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${!pass && detail ? `\n        ${detail}` : ""}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MOD = process.platform === "darwin" ? "Meta" : "Control";


/* =========================================================
   서버 — 배포되는 그 middleware 그대로(두 origin)
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
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function staticResponse(pathname, search) {

  let rel = decodeURIComponent(pathname);
  const query = search || "";

  if (rel.endsWith("/index.html")) {
    return new Response(null, { status: 308, headers: { "Location": rel.slice(0, -"index.html".length) + query } });
  }

  if (rel.endsWith(".html")) {
    return new Response(null, { status: 308, headers: { "Location": rel.slice(0, -".html".length) + query } });
  }

  if (rel.endsWith("/")) rel += "index.html";

  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + ".html"))) {
    rel += ".html";
  }

  const abs = path.join(ROOT, rel);

  if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return new Response(fs.readFileSync(abs), {
      status: 200,
      headers: { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream", "Cache-Control": "no-store" }
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
      res.end(String(err && err.stack || err));
      return;
    }

    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });

    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);

  });

  return new Promise(resolve => server.listen(port, () => resolve(server)));
}


async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const dir of fs.readdirSync(npxCache)) candidates.push(path.join(npxCache, dir, "node_modules"));
  }
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  candidates.push(path.join(ROOT, "node_modules"));
  if (process.env.IMORY_PLAYWRIGHT_MODULES) candidates.push(process.env.IMORY_PLAYWRIGHT_MODULES);

  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch { /* 다음 후보 */ }
  }

  throw new Error(`playwright ${browserName}을(를) 실행할 수 없습니다.`);
}


/* =========================================================
   fixture — DIRECT-UX-1 의 dux 스킨 그대로 + renderMode:"sandbox"

   바뀐 것은 둘뿐이다:
     · renderMode:"sandbox"
     · 자유 배치 사진의 src 를 data: 로(프레임 CSP 의 img-src 는
       example.com 을 열지 않는다 — 없는 출처를 여는 대신 fixture 를
       그 계약에 맞춘다)
========================================================== */

const GIF_1X1 =
  "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

function duxPackage(options) {

  const opts = options || {};

  const pkg = {
    schemaVersion: 1,
    templates: {
      home: {
        html:
          '<div class="dx-page">' +
          '<header class="dx-head">' +
          '<img class="dx-avatar" data-imory-src="profile.avatarUrl" alt="">' +
          '<h1 class="dx-title" data-imory-bind="site.title"></h1>' +
          '<p class="dx-bio">안녕하세요 소개 문구입니다</p>' +
          '<a class="dx-link" href="/scenario-dux/category/301">카테고리 보기</a>' +
          '<div class="dx-veil"></div>' +
          '</header>' +
          '<nav class="dx-menu">' +
          '<a class="dx-menu-item" data-imory-repeat="navigation.postCategories" data-imory-href="item.href"><span class="dx-menu-name" data-imory-bind="item.name"></span></a>' +
          '</nav>' +
          '<ul class="dx-recent">' +
          '<li class="dx-recent-item" data-imory-repeat="home.recentPosts"><a class="dx-recent-link" data-imory-href="item.href" data-imory-bind="item.title"></a></li>' +
          '</ul>' +
          '<div class="dx-wrap">' +
          '<section class="dx-grid" data-imory-layout="grid" data-imory-layout-columns="2" data-imory-layout-gap="12" data-imory-transition="fade-slide" data-imory-transition-duration="400">' +
          '<div class="dx-card"><p class="dx-card-text">카드 하나</p></div>' +
          '<div class="dx-card"><p class="dx-card-text" data-imory-transition="fade">카드 둘</p></div>' +
          '</section>' +
          '</div>' +
          '<div class="dx-stage" data-imory-layout="free" data-imory-layout-height="220">' +
          '<div class="dx-back" data-imory-item-x="0" data-imory-item-y="0" data-imory-item-width="70" data-imory-item-height="90"></div>' +
          `<img class="dx-photo" src="${opts.native ? "https://example.com/dux-photo.png" : GIF_1X1}" alt="" data-imory-item-x="0.05" data-imory-item-y="0.1" data-imory-item-width="40" data-imory-item-z="1">` +
          '<p class="dx-caption" data-imory-item-x="0.08" data-imory-item-y="0.2" data-imory-item-width="35" data-imory-item-z="2">겹친 제목</p>' +
          '<div class="dx-note" data-imory-item-x="1" data-imory-item-y="1" data-imory-item-width="25">메모</div>' +
          '</div>' +
          '</div>'
      },
      category: {
        html: '<div class="dx-category"><h1 data-imory-bind="category.name"></h1></div>'
      },
      post: {
        html: '<div class="dx-post"><h1 data-imory-bind="post.title"></h1><div data-imory-region="post-body"></div></div>'
      }
    },
    css:
      '.dx-page { padding: 12px; } ' +
      '.dx-head { position: relative; padding: 16px; } ' +
      '.dx-veil { position: absolute; inset: 0; } ' +
      '.dx-avatar { width: 64px; height: 64px; object-fit: cover; display: block; } ' +
      '.dx-title { font-size: 22px; margin: 8px 0; } ' +
      '.dx-bio { margin: 0 0 8px; } ' +
      '.dx-menu { display: flex; gap: 8px; padding: 8px 0; } ' +
      '.dx-wrap { padding: 24px; } ' +
      '.dx-card { height: 60px; background: #eef; } ' +
      '.dx-stage { margin-top: 16px; } ' +
      '.dx-back { background: #fde; } ' +
      '.dx-photo { height: 120px; object-fit: cover; } ' +
      '.dx-caption { margin: 0; font-size: 18px; } ' +
      '.dx-note { background: #dfd; height: 30px; }',
    imageSlots: [
      { name: "profile", label: "프로필 사진", required: false, aspectRatioHint: "1:1" }
    ],
    regions: [],
    metadata: { generatedBy: "deterministic-v1" }
  };

  if (!opts.native) {
    pkg.renderMode = "sandbox";
  }

  return pkg;

}


/* =========================================================
   열기
========================================================== */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/* 프레임 CSP 가 example.com 이미지를 막는다(scenario 의 프로필 사진
   주소) — 그것은 CSP 가 일하는 것이지 오류가 아니다. */
function ignorableConsole(text) {
  return /example\.com|Content Security Policy|Refused to load the image|favicon|cdn-cgi|save (draft|failed)|failed \(scenario\)/i.test(text);
}

async function openStudio(browser, options) {

  const opts = options || {};

  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 860 },
    ...(opts.contextOptions || {})
  });

  const page = await context.newPage();

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error" || ignorableConsole(msg.text())) return;
    consoleErrors.push(`${opts.tag || ""} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${opts.tag || ""} :: ${err.message}`));

  page.__aiCalls = 0;
  await page.route("**/api/skin-ai", async (route) => {
    page.__aiCalls += 1;
    if (typeof page.__aiHandler === "function") {
      await page.__aiHandler(route);
      return;
    }
    await route.fulfill({ status: 500, contentType: "text/plain", body: "not used" });
  });
  await page.route("https://example.com/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 })
  );

  const pkg = opts.savedPackage || duxPackage({ native: opts.native });

  await page.addInitScript((value) => {
    window.__scenarioDuxSkinPackage = value;
    try { localStorage.setItem("imory.studio.coach.v1", "done"); } catch (err) { /* */ }
  }, pkg);

  const query =
    "?scenario=dux" + (opts.native ? "" : `&${SANDBOX_FLAGS}`);

  await page.goto(PARENT_ORIGIN + STUDIO_PATH + query, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  if (opts.native) {
    await page.waitForFunction(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return !!(doc && doc.querySelector(".dx-page"));
    }, null, { timeout: 12000 });
  } else {
    const frame = await sbFrame(page);
    await frame.waitForSelector(".dx-page", { state: "attached", timeout: 12000 });
  }

  page.__context = context;

  return page;

}

async function closeStudio(page) {
  await page.__context.close();
}


/* =========================================================
   프레임 손잡이
========================================================== */

async function sbFrame(page, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const frame = page.frames().find(f => f.url().startsWith(SANDBOX_ORIGIN) && !f.isDetached());
    if (frame) return frame;
    await sleep(80);
  }
  throw new Error("sandbox frame not found");
}

async function fx(page, fn, arg) {
  return (await sbFrame(page)).evaluate(fn, arg);
}

const frameInspect = (page) => fx(page, () =>
  typeof window.__imorySandboxInspectState === "function" ? window.__imorySandboxInspectState() : null
);

const sandboxFrameCount = (page) => page.evaluate(() => {
  const doc = document.getElementById("studioPreviewFrame").contentDocument;
  return doc ? doc.querySelectorAll("iframe[data-imory-sandbox-frame]").length : -1;
});


async function ensureTopDockOpen(page) {
  const visible = await page.evaluate(() => {
    const b = document.getElementById("studioInspectorButton");
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
  if (visible) return;
  if (await page.locator("#studioTopDockHandle").isVisible().catch(() => false)) {
    await page.click("#studioTopDockHandle");
    await sleep(400);
  }
}

async function enableSelect(page) {
  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);
  if (!on) {
    await ensureTopDockOpen(page);
    await page.click("#studioInspectorButton");
  }
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  const frame = await sbFrame(page);
  await frame.waitForSelector("body.imory-sandbox-inspect-on", { state: "attached", timeout: 8000 });
  await frame.waitForFunction(() => {
    const el = document.querySelector(".dx-bio");
    return !!(el && el.getAttribute("data-imory-edit-id"));
  }, null, { timeout: 8000 });
  await sleep(200);
}

/* 누를 자리를 Preview 문서의 이 높이 비율로 스크롤해 둔다(390px 에서는
   아래 시트가 Preview 아래쪽을 덮는다 — DIRECT-UX-1 과 같은 사정) */
let pointAnchor = 0.5;

/* 프레임 안 요소의 한 점 → Studio 문서 좌표
   (안쪽 iframe 자리 + 바깥 Preview 프레임의 축소 배율 · 테두리) */
async function sbPoint(page, selector, fxr = 0.5, fyr = 0.5, index = 0) {
  const r = await fx(page, ([sel, index]) => {
    const el = document.querySelectorAll(sel)[index];
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  }, [selector, index]);
  if (!r) return null;
  const p = await page.evaluate(([r, fxr, fyr, anchor]) => {
    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const inner = doc.querySelector("iframe[data-imory-sandbox-frame]");
    const win = doc.defaultView;
    let ib = inner.getBoundingClientRect();
    const targetY = ib.top + inner.clientTop + r.top + r.height * fyr;
    win.scrollBy(0, targetY - win.innerHeight * anchor);
    ib = inner.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    return {
      x: box.left + (bl + ib.left + inner.clientLeft + r.left + r.width * fxr) * scale,
      y: box.top + (bt + ib.top + inner.clientTop + r.top + r.height * fyr) * scale,
      scale
    };
  }, [r, fxr, fyr, pointAnchor]);
  await sleep(60);
  return p;
}

/* 프레임 안 사각형(프레임 뷰포트 좌표) → Studio 문서 좌표 */
async function mapFrameRect(page, r) {
  return page.evaluate((r) => {
    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const inner = doc.querySelector("iframe[data-imory-sandbox-frame]");
    const ib = inner.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    return {
      left: box.left + (bl + ib.left + inner.clientLeft + r.left) * scale,
      top: box.top + (bt + ib.top + inner.clientTop + r.top) * scale,
      width: r.width * scale,
      height: r.height * scale
    };
  }, r);
}

async function collapseSheetIfNarrow(page) {
  const state = await page.evaluate(() => window.getStudioShellState());
  if (state.narrow && state.leftPanelOpen) {
    await page.click("#studioLeftPanelCollapse");
    await page.waitForFunction(() => window.getStudioShellState().leftPanelOpen === false, null, { timeout: 3000 }).catch(() => {});
    await sleep(350);
  }
}

async function realClick(page, selector, fxr, fyr, index) {
  const p = await sbPoint(page, selector, fxr, fyr, index);
  if (!p) throw new Error("no element: " + selector);
  await page.mouse.click(p.x, p.y);
  await sleep(160);
  return p;
}

async function realDblClick(page, selector, index = 0) {
  const p = await sbPoint(page, selector, 0.5, 0.5, index);
  if (!p) throw new Error("no element: " + selector);
  await page.mouse.click(p.x, p.y);
  await sleep(220);
  await page.mouse.dblclick(p.x, p.y);
  await sleep(220);
  return p;
}

/* 좌표 없는 합성 pointerdown — 예전 규칙(눌린 노드에서 가장 가까운 요소) */
async function legacySelect(page, selector, index = 0) {
  const editId = await fx(page, ([sel, index]) => {
    const el = document.querySelectorAll(sel)[index];
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    return el.getAttribute("data-imory-edit-id");
  }, [selector, index]);
  await page.waitForFunction((id) => {
    const s = window.getStudioInspectorSelection();
    return !!(s && s.editId === id);
  }, editId, { timeout: 5000 });
  await sleep(120);
}

async function selectedClass(page) {
  const id = await page.evaluate(() => {
    const s = window.getStudioInspectorSelection();
    return s ? s.editId : null;
  });
  if (!id) return null;
  return fx(page, (id) => {
    const el = Array.from(document.querySelectorAll("[data-imory-edit-id]"))
      .find(node => node.getAttribute("data-imory-edit-id") === id);
    return el ? el.getAttribute("class") : "?";
  }, id);
}

/* 프레임이 고른 요소(프레임 쪽 상태)의 class */
async function frameSelectedClass(page) {
  const state = await frameInspect(page);
  if (!state || !state.selectedEditId) return null;
  return fx(page, (id) => {
    const el = Array.from(document.querySelectorAll("[data-imory-edit-id]"))
      .find(node => node.getAttribute("data-imory-edit-id") === id);
    return el ? el.getAttribute("class") : "?";
  }, state.selectedEditId);
}

async function waitSelected(page, cls, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const c = await selectedClass(page).catch(() => null);
    if (c && c.split(/\s+/).includes(cls)) return true;
    await sleep(80);
  }
  return false;
}

const draft = (page) => page.evaluate(() => {
  const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
  return { html: pkg.templates.home.html, css: pkg.css };
});

const history = (page) => page.evaluate(() => window.getStudioHistoryState());

const directState = async (page) => {
  const s = await frameInspect(page);
  return s ? s.direct : null;
};

const panelTexts = (page) => page.evaluate(() => ({
  title: document.getElementById("studioInspectorPopoverTitle")?.textContent || "",
  meta: document.getElementById("studioInspectorPopoverMeta")?.textContent || "",
  label: document.getElementById("studioInspectorSelectLabel")?.textContent || "",
  note: document.getElementById("studioInspectorNote")?.hidden ? "" : (document.getElementById("studioInspectorNote")?.textContent || ""),
  fields: Array.from(document.querySelectorAll("#studioInspectorFields .studio-inspector-row-label, #studioInspectorFields .studio-inspector-block-label, #studioInspectorFields .studio-inspector-section, #studioInspectorFields .studio-inspector-block-note")).map(el => el.textContent)
}));

const listControls = (page) => page.evaluate(() => Array.from(
  new Set(Array.from(document.querySelectorAll("#studioInspectorFields [data-inspector-control]")).map(el => el.dataset.inspectorControl))
));

function leaksCode(text) {
  return /<|>|dx-|data-imory|\be\d+(-\d+)+\b|\b(site|profile|item|post|images|navigation|home|category)\.[A-Za-z]+/.test(text || "");
}

const noHorizontalOverflow = (page) => page.evaluate(() => {
  const el = document.scrollingElement || document.documentElement;
  return el.scrollWidth <= el.clientWidth + 1 && document.body.scrollWidth <= document.documentElement.clientWidth + 1;
});

const frameNoHorizontalOverflow = (page) => fx(page, () =>
  document.body.scrollWidth <= document.documentElement.clientWidth + 1
);

async function savedContent(page) {
  return page.evaluate(() => {
    const calls = window.__savedDraftCallsDux || [];
    return calls.length ? calls[calls.length - 1].p_content : null;
  });
}

async function save(page) {
  const n = await page.evaluate(() => (window.__savedDraftCallsDux || []).length);
  await page.click("#studioSaveButton");
  await page.waitForFunction((n) => (window.__savedDraftCallsDux || []).length > n, n, { timeout: 8000 });
  await page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === false, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
}

async function waitDraft(page, predicateSource, arg, timeout = 5000) {
  return page.waitForFunction(
    ([src, arg]) => {
      const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
      return new Function("pkg", "arg", src)(pkg, arg);
    },
    [predicateSource, arg],
    { timeout }
  ).then(() => true, () => false);
}


/* =========================================================
   priority
========================================================== */

async function runPriority(browser) {

  const page = await openStudio(browser, { tag: "priority" });
  await enableSelect(page);

  record("P0. sandbox 스킨이 별도 origin 프레임 하나에 그려진다", (await sandboxFrameCount(page)) === 1);

  /* P1 */
  await realClick(page, ".dx-bio");
  record("P1. 투명 덮개 밑의 글자를 누르면 래퍼(<header>)가 아니라 그 글자가 선택된다",
    await waitSelected(page, "dx-bio"), String(await selectedClass(page)));

  /* P1b — 대조군 */
  await legacySelect(page, ".dx-veil").catch(() => {});
  const legacy = await selectedClass(page);
  record("P1b. 대조군: 좌표 없는 합성 입력은 예전 규칙 그대로 — 눌린 투명 덮개 자체가 잡힌다",
    legacy === "dx-veil", String(legacy));

  /* P2 */
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await realClick(page, ".dx-wrap", 0.5, 0.06);
  await sleep(200);
  const afterEmpty = await page.evaluate(() => window.getStudioInspectorSelection());
  const frameAfterEmpty = await frameInspect(page);
  record("P2. 단순 래퍼의 빈 곳 = 선택 해제(Studio · 프레임 둘 다)",
    afterEmpty === null && frameAfterEmpty.selectedEditId === null,
    JSON.stringify({ studio: afterEmpty && afterEmpty.name, frame: frameAfterEmpty.selectedEditId }));

  /* P3 */
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await realClick(page, ".dx-page", 0.004, 0.5);
  await sleep(200);
  record("P3. 페이지 전체 래퍼의 여백도 일반 클릭의 대상이 아니다(선택 해제)",
    (await page.evaluate(() => window.getStudioInspectorSelection())) === null);

  /* P4 */
  await realClick(page, ".dx-grid", 0.5, 0.5);
  record("P4. 배치를 선언한 구성 요소(격자)의 빈틈을 누르면 그 격자",
    await waitSelected(page, "dx-grid"), String(await selectedClass(page)));

  /* P5 */
  await realClick(page, ".dx-card-text");
  await waitSelected(page, "dx-card-text");
  const chain = [await selectedClass(page)];
  for (let i = 0; i < 6; i += 1) {
    const visible = await page.evaluate(() => !document.getElementById("studioInspectorOuterButton").hidden);
    if (!visible) break;
    const before = await page.evaluate(() => window.getStudioInspectorSelection().editId);
    await page.click("#studioInspectorOuterButton");
    await page.waitForFunction((b) => {
      const s = window.getStudioInspectorSelection();
      return s && s.editId !== b;
    }, before, { timeout: 3000 }).catch(() => {});
    await sleep(120);
    chain.push(await selectedClass(page));
  }
  const outerHiddenAtTop = await page.evaluate(() => document.getElementById("studioInspectorOuterButton").hidden);
  const frameChainEnd = await frameSelectedClass(page);
  record("P5. '바깥 영역 선택'이 프레임 안에서 한 칸씩(카드 → 격자 → 여백 래퍼 → 배경) · 맨 바깥에서 버튼 없음 · 프레임 테두리도 따라감",
    chain.join(">") === "dx-card-text>dx-card>dx-grid>dx-wrap>dx-page" && outerHiddenAtTop && frameChainEnd === "dx-page",
    JSON.stringify({ chain, outerHiddenAtTop, frameChainEnd }));

  /* P6 hover */
  await page.keyboard.press("Escape");
  await sleep(150);
  const tp = await sbPoint(page, ".dx-title");
  await page.mouse.move(tp.x - 30, tp.y - 30);
  await page.mouse.move(tp.x, tp.y, { steps: 5 });
  await sleep(350);
  const studioHover = await page.evaluate(() => {
    const label = document.getElementById("studioInspectorHoverLabel");
    return {
      label: label && !label.hidden ? label.textContent : null,
      studioBox: !document.getElementById("studioInspectorHoverBox").hidden
    };
  });
  const frameHover = await fx(page, () => {
    const title = document.querySelector(".dx-title");
    const box = document.querySelector(".imory-sandbox-inspect-box--hover");
    return {
      marked: title.hasAttribute("data-imory-inspector-hover"),
      cursor: getComputedStyle(title).cursor,
      box: !!box && box.hasAttribute("data-visible"),
      bodyCursor: getComputedStyle(document.querySelector(".dx-wrap")).cursor
    };
  });
  record("P6. 올리면 프레임 안 테두리 · Studio 이름표(홈 이름) · 손가락 커서, 고를 수 없는 자리는 기본 커서 · Studio 는 테두리를 겹쳐 그리지 않는다",
    studioHover.label === "홈 이름" && !studioHover.studioBox && frameHover.marked &&
      frameHover.cursor === "pointer" && frameHover.box && frameHover.bodyCursor === "default",
    JSON.stringify({ studioHover, frameHover }));

  await closeStudio(page);

}


/* =========================================================
   names — native 와 글자 단위로 같은 이름
========================================================== */

const NAME_CASES = [
  [".dx-title", "홈 이름", "텍스트"],
  [".dx-avatar", "프로필 이미지", "이미지"],
  [".dx-bio", "텍스트", "텍스트"],
  [".dx-link", "링크", "링크"],
  [".dx-menu", "카테고리 메뉴", "영역"],
  [".dx-menu-item", "카테고리 메뉴 항목", "링크"],
  [".dx-recent", "최근 글 목록", "영역"],
  [".dx-recent-item", "글 카드", "영역"],
  [".dx-recent-link", "글 제목", "링크"],
  [".dx-grid", null, null],
  [".dx-page", "배경", "영역"]
];

async function nativeLegacySelect(page, selector) {
  const editId = await page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return el.getAttribute("data-imory-edit-id");
  }, selector);
  await page.waitForFunction((id) => {
    const s = window.getStudioInspectorSelection();
    return !!(s && s.editId === id);
  }, editId, { timeout: 5000 });
  await sleep(120);
}

async function collectNames(page, selectFn, sandbox) {
  const out = {};
  for (const [sel] of NAME_CASES) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.getStudioInspectorSelection() === null, null, { timeout: 3000 }).catch(() => {});
    if (sandbox) {
      const end = Date.now() + 3000;
      while (Date.now() < end && (await frameInspect(page)).selectedEditId) await sleep(50);
    }
    await selectFn(page, sel);
    const t = await panelTexts(page);
    const ctx = await page.evaluate(() => window.getStudioInspectorSelection());
    out[sel] = { title: t.title, meta: t.meta, label: t.label, note: t.note, fields: t.fields, name: ctx && ctx.name };
  }
  return out;
}

async function runNames(browser) {

  const native = await openStudio(browser, { native: true, tag: "names-native" });
  await enableSelect(native).catch(async () => {
    /* native 는 프레임이 없다 — 식별자만 기다린다 */
  });
  await native.waitForFunction(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc && doc.querySelector(".dx-bio");
    return !!(el && el.getAttribute("data-imory-edit-id"));
  }, null, { timeout: 8000 });
  const nativeNames = await collectNames(native, nativeLegacySelect);
  await closeStudio(native);

  const page = await openStudio(browser, { tag: "names" });
  await enableSelect(page);
  const sandboxNames = await collectNames(page, legacySelect, true);

  const diffs = [];
  const leaks = [];
  let expectedOk = true;

  for (const [sel, name, kind] of NAME_CASES) {
    const a = nativeNames[sel];
    const b = sandboxNames[sel];
    if (a.title !== b.title || a.meta !== b.meta || a.label !== b.label || a.name !== b.name) {
      diffs.push({ sel, native: a, sandbox: b });
    }
    if (name && (b.title !== name || b.label !== name || b.meta !== `${kind} · HOME`)) {
      expectedOk = false;
    }
    [b.title, b.meta, b.label, b.note, ...b.fields].forEach(text => { if (leaksCode(text)) leaks.push(text); });
  }

  record("N1. 같은 요소의 이름 · 종류 · 페이지가 native Preview 와 sandbox 프레임에서 글자 단위로 같다(패널 머리 · 이름표 · selectionContext)",
    diffs.length === 0, JSON.stringify(diffs).slice(0, 600));
  record("N2. 스킨 계약에서 만든 이름(홈 이름 · 프로필 이미지 · 카테고리 메뉴 · 최근 글 목록 · 글 카드 · 배경 …)",
    expectedOk, JSON.stringify(Object.fromEntries(Object.entries(sandboxNames).map(([k, v]) => [k, v.title]))));
  record("N3. 패널 · 이름표 · 안내 · 항목 이름에 태그/클래스/data-imory/식별자/바인딩 경로가 없다", leaks.length === 0, JSON.stringify(leaks));

  /* N4. hover 이름표도 같은 이름 */
  await page.keyboard.press("Escape");
  const hp = await sbPoint(page, ".dx-recent-link");
  await page.mouse.move(hp.x - 20, hp.y - 20);
  await page.mouse.move(hp.x, hp.y, { steps: 4 });
  await sleep(350);
  const hoverLabel = await page.evaluate(() => {
    const label = document.getElementById("studioInspectorHoverLabel");
    return label && !label.hidden ? label.textContent : null;
  });
  record("N4. hover 이름표도 같은 이름(글 제목)", hoverLabel === "글 제목", String(hoverLabel));

  /* N5. AI chip · selectionContext.label */
  await legacySelect(page, ".dx-avatar");
  await page.click("#studioInspectorAiButton");
  await page.waitForFunction(() => {
    const el = document.getElementById("studioAiSelectionChipLabel");
    return el && el.textContent.length > 0;
  }, null, { timeout: 4000 }).catch(() => {});
  const chip = await page.evaluate(() => document.getElementById("studioAiSelectionChipLabel")?.textContent || "");
  const ctx = await page.evaluate(() => window.getStudioAiSelectionContext());
  record("N5. AI chip 과 selectionContext.label 도 같은 이름(HOME · 프로필 이미지)",
    chip === "선택됨: HOME · 프로필 이미지" && ctx && ctx.label === "HOME · 프로필 이미지",
    JSON.stringify({ chip, label: ctx && ctx.label }));

  await closeStudio(page);

}


/* =========================================================
   overlap — Studio 의 겹친 요소 메뉴
========================================================== */

async function readPickMenu(page) {
  return page.evaluate(() => {
    const m = document.getElementById("studioInspectorPickMenu");
    return {
      open: !!m && !m.hidden,
      sheet: !!m && m.classList.contains("is-sheet"),
      title: m?.querySelector(".studio-inspector-pick-title")?.textContent,
      items: Array.from(m?.querySelectorAll(".studio-inspector-pick-item") || []).map(el => ({
        name: el.querySelector(".studio-inspector-pick-name").textContent,
        outer: el.classList.contains("is-outer"),
        current: el.getAttribute("aria-current") === "true"
      })),
      selection: window.getStudioInspectorSelection()
    };
  });
}

async function runOverlap(browser) {

  const page = await openStudio(browser, { tag: "overlap" });
  await enableSelect(page);

  await realClick(page, ".dx-caption", 0.2, 0.5);
  await page.waitForFunction(() => !document.getElementById("studioInspectorPickMenu").hidden, null, { timeout: 3000 }).catch(() => {});
  const menu = await readPickMenu(page);
  const names = menu.items.map(i => i.name);
  const frameMenus = await fx(page, () => document.querySelectorAll("[role='menu'], .studio-inspector-pick-menu").length);
  record("O1. 겹친 자리 — 고르지 않고 Studio 의 '무엇을 선택할까요?'(텍스트 · 이미지 · 영역 …, 바깥 영역은 맨 아래) · 프레임 안에는 메뉴를 만들지 않는다",
    menu.open && menu.title === "무엇을 선택할까요?" && menu.selection === null &&
      names[0] === "텍스트" && names.includes("이미지") && names.length >= 3 &&
      menu.items[menu.items.length - 1].outer === true && /^바깥 영역/.test(names[names.length - 1]) &&
      !names.some(leaksCode) && frameMenus === 0,
    JSON.stringify({ menu, frameMenus }));

  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll("#studioInspectorPickMenu .studio-inspector-pick-item"))
      .find(el => el.querySelector(".studio-inspector-pick-name").textContent === "이미지");
    item.click();
  });
  const pickedPhoto = await waitSelected(page, "dx-photo");
  const closed = await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden);
  record("O2. 메뉴에서 고른 요소(이미지)가 선택되고(프레임 테두리도) 메뉴는 닫힌다",
    pickedPhoto && closed && (await frameSelectedClass(page)) === "dx-photo");

  await realClick(page, ".dx-caption", 0.2, 0.5);
  await sleep(150);
  const marked = (await readPickMenu(page)).items.filter(i => i.current).map(i => i.name);
  await page.keyboard.press("Escape");
  await sleep(150);
  const afterEsc = await page.evaluate(() => ({
    open: !document.getElementById("studioInspectorPickMenu").hidden,
    sel: !!window.getStudioInspectorSelection()
  }));
  record("O3. 다시 열면 지금 고른 요소에 '선택됨' · Esc 는 메뉴만 닫고 선택은 그대로",
    marked.length === 1 && marked[0] === "이미지" && !afterEsc.open && afterEsc.sel,
    JSON.stringify({ marked, afterEsc }));

  await realClick(page, ".dx-caption", 0.2, 0.5);
  await sleep(150);
  await page.mouse.click(30, 520);
  await sleep(150);
  record("O4. 메뉴 밖을 누르면 닫힌다", await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden));

  await realClick(page, ".dx-card-text");
  await sleep(150);
  const noMenu = await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden);
  record("O5. 담김(카드 안 글자)이면 메뉴 없이 바로 그 글자", noMenu && await waitSelected(page, "dx-card-text"));

  await closeStudio(page);

}


/* =========================================================
   text — 더블클릭 편집
========================================================== */

async function runText(browser) {

  const page = await openStudio(browser, { tag: "text" });
  await enableSelect(page);

  const before = await draft(page);
  const h0 = await history(page);

  await realDblClick(page, ".dx-bio");
  const opened = await (await sbFrame(page)).waitForFunction(() => {
    const s = window.__imorySandboxInspectState();
    return s && s.direct && s.direct.editing === true;
  }, null, { timeout: 3000 }).then(() => true, () => false);
  await page.keyboard.press("End");
  await page.keyboard.type("!!");
  await sleep(200);
  const mid = {
    opened,
    direct: await directState(page),
    history: await history(page),
    textarea: await page.evaluate(() => document.getElementById("studioInspectorTextInput")?.value),
    draftSame: (await draft(page)).html === before.html,
    cursor: await fx(page, () => getComputedStyle(document.querySelector(".dx-bio")).cursor)
  };
  record("T1. 프레임 안 글자를 두 번 누르면 그 자리에서 고친다 — 입력 중 기록 0 · draft 불변 · 패널 칸이 같은 문구로 따라온다 · 글자 커서",
    mid.opened && mid.direct.editing && mid.history.undo === h0.undo && mid.draftSame &&
      mid.textarea === "안녕하세요 소개 문구입니다!!" && mid.cursor === "text",
    JSON.stringify(mid));

  await page.keyboard.press(`${MOD}+Enter`);
  await waitDraft(page, "return pkg.templates.home.html.includes('소개 문구입니다!!')");
  await sleep(300);
  const committed = await draft(page);
  const h1 = await history(page);
  const frameText = await fx(page, () => document.querySelector(".dx-bio").textContent);
  record("T2. Ctrl/⌘+Enter = 적용 — ↶ 정확히 한 칸 · 선택 유지 · 프레임에 반영(innerHTML 이 아니라 patch 경로)",
    committed.html.includes("소개 문구입니다!!") && h1.undo === h0.undo + 1 &&
      (await selectedClass(page)) === "dx-bio" && (await directState(page)).editing === false &&
      frameText === "안녕하세요 소개 문구입니다!!" && committed.html.split("dx-bio").length === 2,
    JSON.stringify({ h0, h1, frameText }));

  /* T3 Escape */
  await realDblClick(page, ".dx-bio");
  await page.keyboard.press("End");
  await page.keyboard.type("XYZ");
  await page.keyboard.press("Escape");
  await sleep(250);
  const afterEsc = {
    text: await fx(page, () => document.querySelector(".dx-bio").textContent),
    sel: !!(await page.evaluate(() => window.getStudioInspectorSelection())),
    frameSel: (await frameInspect(page)).selectedEditId
  };
  const h2 = await history(page);
  record("T3. Escape = 취소 — 원래 문구 · 기록/draft 불변 · 선택은 풀리지 않는다(프레임도)",
    afterEsc.text === "안녕하세요 소개 문구입니다!!" && afterEsc.sel && !!afterEsc.frameSel &&
      h2.undo === h1.undo && (await draft(page)).html === committed.html,
    JSON.stringify({ afterEsc, h2 }));

  /* T4 blur */
  await realDblClick(page, ".dx-bio");
  await page.keyboard.press("End");
  await page.keyboard.type("?");
  await page.click("#studioInspectorPopoverTitle");
  await waitDraft(page, "return pkg.templates.home.html.includes('소개 문구입니다!!?')");
  const h3 = await history(page);
  record("T4. 포커스를 잃으면(Studio 패널을 누름) 적용 — 한 칸", h3.undo === h2.undo + 1, JSON.stringify(h3));

  /* T5 undo/redo */
  const afterT4 = await draft(page);
  await page.click("#studioUndoButton");
  await sleep(400);
  const undone = await draft(page);
  const selUndo = await selectedClass(page);
  await page.click("#studioRedoButton");
  await sleep(400);
  const redone = await draft(page);
  record("T5. ↶ = 편집 직전, ↷ = 편집 직후(글자 단위) · 되돌린 뒤에도 그 글자가 선택된 채",
    undone.html === committed.html && redone.html === afterT4.html && selUndo === "dx-bio",
    JSON.stringify({ selUndo }));

  /* T6 링크 */
  const pageBefore = await page.evaluate(() => typeof currentPreviewPageType === "string" ? currentPreviewPageType : null);
  await realDblClick(page, ".dx-link");
  await page.keyboard.press("End");
  await page.keyboard.type(" →");
  await realClick(page, ".dx-link", 0.2, 0.5).catch(() => {});
  await page.keyboard.press(`${MOD}+Enter`);
  await waitDraft(page, "return pkg.templates.home.html.includes('카테고리 보기 →')");
  await sleep(300);
  const linkHtml = (await draft(page)).html;
  const linkInfo = {
    page: await page.evaluate(() => typeof currentPreviewPageType === "string" ? currentPreviewPageType : null),
    framePage: await fx(page, () => document.getElementById("sandboxFrameRoot").getAttribute("data-imory-sandbox-page"))
  };
  record("T6. 링크 글자를 고치는 동안 눌러도 페이지가 옮겨지지 않고 주소는 그대로 · 문구만 바뀐다",
    pageBefore === "home" && linkInfo.page === "home" && linkInfo.framePage === "home" &&
      linkHtml.includes("카테고리 보기 →") && linkHtml.includes('href="/scenario-dux/category/301"'),
    JSON.stringify(linkInfo));

  /* T7 바인딩 */
  await realDblClick(page, ".dx-title");
  const bound = await directState(page);
  record("T7. 데이터가 채우는 글자(홈 이름)는 더블클릭해도 편집이 열리지 않는다", bound.editing === false, JSON.stringify(bound));

  /* T8 패널 textarea 의 임시 미리보기도 프레임에 닿는다 */
  await legacySelect(page, ".dx-bio");
  const h8 = await history(page);
  await page.fill("#studioInspectorTextInput", "패널에서 고친 문구");
  await sleep(300);
  const live = await fx(page, () => document.querySelector(".dx-bio").textContent);
  const h8b = await history(page);
  record("T8. 패널의 내용 칸에 입력하는 동안 프레임이 임시로 따라온다(기록 0)",
    live === "패널에서 고친 문구" && h8b.undo === h8.undo, JSON.stringify({ live }));

  await closeStudio(page);

}


/* =========================================================
   image
========================================================== */

async function runImage(browser) {

  const page = await openStudio(browser, { tag: "image" });
  await enableSelect(page);

  await realClick(page, ".dx-avatar");
  await waitSelected(page, "dx-avatar");
  const before = await draft(page);
  const h0 = await history(page);
  const panel = await panelTexts(page);
  const controls = await listControls(page);
  const quick = await page.evaluate(() => {
    const b = document.getElementById("studioInspectorQuickImage");
    return { visible: !!b && !b.hidden && !document.getElementById("studioInspectorQuickBar").hidden };
  });
  const handles = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".studio-inspector-handle")).filter(h => !h.hidden).length);
  const imageButtons = await page.evaluate(() => ({
    change: !!document.getElementById("studioInspectorImageChange"),
    crop: !!document.getElementById("studioInspectorCropOpen")
  }));
  record("I0. sandbox 이미지 — 이미지 변경 · 맞춤 · 모서리 · 정렬 · 기타는 열리고, 너비 · 자르기 칸과 모서리 핸들은 없고 이유가 한 줄",
    imageButtons.change && !imageButtons.crop && !controls.includes("size") &&
      ["objectFit", "shape", "imageAlign", "hidden", "opacity"].every(c => controls.includes(c)) &&
      /크기와 자르기/.test(panel.note) && handles === 0,
    JSON.stringify({ controls, imageButtons, note: panel.note, handles }));

  await page.click("#studioInspectorQuickImage");
  await page.waitForFunction(() => window.getStudioShellState().leftPanelMode === "images", null, { timeout: 4000 });
  await page.waitForSelector(".images-panel-card-attach", { timeout: 6000 });
  const slotState = await page.evaluate(() => ({
    pressed: Array.from(document.querySelectorAll(".images-panel-slot-pick"))
      .filter(b => b.getAttribute("aria-pressed") === "true")
      .map(b => b.querySelector(".images-panel-slot-label").textContent),
    sel: !!window.getStudioInspectorSelection()
  }));
  record("I1. Quick Bar '이미지 변경' → Images 패널이 그 이미지의 슬롯을 고른 채 · 선택 유지",
    quick.visible && slotState.pressed.length === 1 && slotState.pressed[0] === "프로필 사진" && slotState.sel,
    JSON.stringify({ quick, slotState }));

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".images-panel-card"))
      .find(c => c.querySelector("img").src.includes("dux-b"));
    card.querySelector(".images-panel-card-attach").click();
  });
  await sleep(600);
  const after = await draft(page);
  const h1 = await history(page);
  record("I2. 고른 이미지 연결 = ↶ 한 칸 · 템플릿 HTML/CSS 는 한 글자도 안 바뀐다 · 선택 유지(같은 요소)",
    h1.undo === h0.undo + 1 && after.html === before.html && after.css === before.css &&
      (await selectedClass(page)) === "dx-avatar",
    JSON.stringify({ h0, h1 }));

  await closeStudio(page);

}


/* =========================================================
   quickbar
========================================================== */

async function runQuickbar(browser) {

  const page = await openStudio(browser, { tag: "quickbar" });
  await enableSelect(page);

  await legacySelect(page, ".dx-caption");
  const bar = await page.evaluate(() => {
    const b = document.getElementById("studioInspectorQuickBar");
    const visible = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };
    const frame = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    const r = b.getBoundingClientRect();
    return {
      shown: !b.hidden,
      forward: visible("studioInspectorQuickForward"),
      backward: visible("studioInspectorQuickBackward"),
      hide: visible("studioInspectorQuickHide"),
      ai: visible("studioInspectorAiButton"),
      image: visible("studioInspectorQuickImage"),
      insideFrame: r.left >= frame.left - 1 && r.right <= frame.right + 1,
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      titles: Array.from(b.querySelectorAll("button")).filter(x => !x.hidden).map(x => x.title)
    };
  });
  const selBox = await fx(page, () => {
    const b = document.querySelector(".imory-sandbox-inspect-box--select").getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  const mappedBox = await mapFrameRect(page, selBox);
  const overlapsBox = !(bar.rect.right <= mappedBox.left || bar.rect.left >= mappedBox.left + mappedBox.width ||
    bar.rect.bottom <= mappedBox.top || bar.rect.top >= mappedBox.top + mappedBox.height);
  record("Q1. Quick Bar — 앞으로 · 뒤로 · 숨기기 · AI로 수정(이미지 변경 없음) · tooltip · 프레임 안 · 프레임 안 선택 테두리를 가리지 않음",
    bar.shown && bar.forward && bar.backward && bar.hide && bar.ai && !bar.image && bar.insideFrame &&
      !overlapsBox && bar.titles.every(Boolean),
    JSON.stringify({ bar, mappedBox }));

  const h0 = await history(page);
  await page.click("#studioInspectorQuickForward");
  await sleep(400);
  const zUp = /class="dx-caption"[^>]*data-imory-item-z="3"/.test((await draft(page)).html);
  await page.click("#studioInspectorQuickBackward");
  await sleep(400);
  const zDown = /class="dx-caption"[^>]*data-imory-item-z="2"/.test((await draft(page)).html);
  record("Q2. 앞으로/뒤로 = 겹침 순서 ±1, 누를 때마다 ↶ 한 칸", zUp && zDown && (await history(page)).undo === h0.undo + 2);

  await page.click("#studioInspectorQuickHide");
  await sleep(500);
  const hidden = {
    frame: await fx(page, () => {
      const el = document.querySelector(".dx-caption");
      const cs = getComputedStyle(el);
      return { opacity: cs.opacity, display: cs.display };
    }),
    rule: /display: none/.test((await draft(page)).css),
    label: await page.evaluate(() => document.querySelector("#studioInspectorQuickHide .studio-inspector-quick-text").textContent)
  };
  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);
  await sleep(500);
  const offDisplay = await fx(page, () => getComputedStyle(document.querySelector(".dx-caption")).display);
  record("Q3. 숨기기 — 규칙 한 줄 · Select 중 프레임에서는 흐리게 · Select 를 끄면 프레임에서 사라진다",
    hidden.rule && hidden.frame.display !== "none" && Number(hidden.frame.opacity) < 0.5 &&
      hidden.label === "보이기" && offDisplay === "none",
    JSON.stringify({ hidden, offDisplay }));

  await enableSelect(page);
  await legacySelect(page, ".dx-caption");
  await page.click("#studioInspectorQuickHide");
  await sleep(400);
  const shown = await page.evaluate(() => ({
    rule: /display: none/.test(window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css),
    label: document.querySelector("#studioInspectorQuickHide .studio-inspector-quick-text").textContent
  }));
  record("Q4. 보이기 — display 줄만 지워진다", !shown.rule && shown.label === "숨기기", JSON.stringify(shown));

  await legacySelect(page, ".dx-card", 0);
  const orderBar = await page.evaluate(() => ({
    fwdDisabled: document.getElementById("studioInspectorQuickForward").disabled,
    bwdDisabled: document.getElementById("studioInspectorQuickBackward").disabled,
    fwdLabel: document.querySelector("#studioInspectorQuickForward .studio-inspector-quick-text").textContent
  }));
  const h1 = await history(page);
  await page.click("#studioInspectorQuickBackward");
  await sleep(400);
  const html = (await draft(page)).html;
  record("Q5. 격자 안 요소의 앞으로/뒤로 = 형제 순서 한 칸 · ↶ 한 칸",
    orderBar.fwdDisabled && !orderBar.bwdDisabled && orderBar.fwdLabel === "순서 앞으로" &&
      html.indexOf("카드 둘") < html.indexOf("카드 하나") && (await history(page)).undo === h1.undo + 1,
    JSON.stringify(orderBar));

  await legacySelect(page, ".dx-avatar");
  await page.click("#studioInspectorAiButton");
  await page.waitForFunction(() => window.isStudioAiPanelOpen && window.isStudioAiPanelOpen(), null, { timeout: 3000 });
  await page.waitForFunction(() => { const r = document.getElementById("studioAiSuggestions"); return r && !r.hidden; }, null, { timeout: 3000 }).catch(() => {});
  const sugg = await page.evaluate(() => Array.from(document.querySelectorAll("#studioAiSuggestions .studio-ai-suggestion")).map(b => b.textContent));
  await page.fill("#studioAiDrawerInput", "");
  await page.click("#studioAiSuggestions .studio-ai-suggestion");
  await sleep(200);
  const input = await page.inputValue("#studioAiDrawerInput");
  const ctx = await page.evaluate(() => window.getStudioAiSelectionContext());
  record("Q6. 'AI로 수정' → AI Assistant 가 열리고 sandbox 선택 유지 · 이름과 selectionContext 전달 · 제안은 넣기만 · 전송 0",
    sugg.length > 0 && sugg.length <= 4 && input === sugg[0] && page.__aiCalls === 0 &&
      !!ctx && ctx.label === "HOME · 프로필 이미지" && (await frameSelectedClass(page)) === "dx-avatar",
    JSON.stringify({ sugg, input, aiCalls: page.__aiCalls, ctx: ctx && ctx.label }));

  await closeStudio(page);

}


/* =========================================================
   move — 자유 배치 본체 끌기
========================================================== */

async function runMove(browser) {

  const page = await openStudio(browser, { tag: "move" });
  await enableSelect(page);

  await realClick(page, ".dx-note");
  await waitSelected(page, "dx-note");
  const caps = await (await sbFrame(page)).waitForFunction(() => {
    const s = window.__imorySandboxInspectState();
    return s && s.direct && s.direct.caps.movable === true;
  }, null, { timeout: 3000 }).then(() => true, () => false);
  const moveCursor = await fx(page, () => getComputedStyle(document.querySelector(".dx-note")).cursor);

  const h0 = await history(page);
  const p = await sbPoint(page, ".dx-note");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(p.x - 8 * i, p.y - 4 * i);
    await sleep(20);
  }
  await sleep(200);
  const mid = {
    liveX: await fx(page, () => document.querySelector(".dx-note").style.getPropertyValue("--imory-it-x")),
    dragging: (await directState(page)).dragging,
    history: (await history(page)).undo
  };
  await page.mouse.up();
  await sleep(500);
  const h1 = await history(page);
  const html = (await draft(page)).html;
  const m = /class="dx-note"[^>]*/.exec(html) || [""];
  const x = Number((/data-imory-item-x="([^"]+)"/.exec(m[0]) || [])[1]);
  const y = Number((/data-imory-item-y="([^"]+)"/.exec(m[0]) || [])[1]);
  record("M1. 프레임 안 본체를 끌면 옮겨진다 — 이동 커서 · 끄는 동안 프레임이 따라오고 기록 0 · 놓으면 ↶ 한 칸 · 선택 유지",
    caps && moveCursor === "move" && mid.dragging === true && mid.liveX !== "" && Number(mid.liveX) < 1 &&
      mid.history === h0.undo && h1.undo === h0.undo + 1 && x < 1 && y < 1 &&
      (await selectedClass(page)) === "dx-note",
    JSON.stringify({ caps, moveCursor, mid, h0, h1, x, y }));

  await page.click("#studioUndoButton");
  await sleep(400);
  record("M2. ↶ 하면 원래 자리(x=1, y=1)",
    /class="dx-note"[^>]*data-imory-item-x="1"[^>]*data-imory-item-y="1"/.test((await draft(page)).html));

  const h2 = await history(page);
  const p2 = await sbPoint(page, ".dx-note");
  await page.mouse.move(p2.x, p2.y);
  await page.mouse.down();
  await page.mouse.move(p2.x + 2, p2.y + 1);
  await page.mouse.up();
  await sleep(350);
  record("M3. 문턱(4px)보다 작은 흔들림은 클릭이다 — 기록 0 · 선택 유지",
    (await history(page)).undo === h2.undo && (await selectedClass(page)) === "dx-note");

  await closeStudio(page);

}


/* =========================================================
   restore — 바뀐 뒤에도 같은 sandbox 요소
========================================================== */

async function sameSelection(page, cls) {
  await sleep(450);
  return (await selectedClass(page)) === cls && (await frameSelectedClass(page)) === cls;
}

async function runRestore(browser) {

  const page = await openStudio(browser, { tag: "restore" });
  await enableSelect(page);

  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");

  await page.evaluate(() => {
    const input = document.querySelector('#studioInspectorFields [data-inspector-control="color"]');
    input.value = "#aa3300";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const r1 = await sameSelection(page, "dx-bio");
  const color = await fx(page, () => getComputedStyle(document.querySelector(".dx-bio")).color);
  record("R1. Select 패널 수정(글자색) 적용 뒤 — 프레임에 반영되고 같은 요소가 선택된 채(Studio · 프레임)",
    r1 && color === "rgb(170, 51, 0)", color);

  await page.click("#studioUndoButton");
  const r2 = await sameSelection(page, "dx-bio");
  await page.click("#studioRedoButton");
  const r3 = await sameSelection(page, "dx-bio");
  record("R2. Undo · Redo 뒤에도 같은 요소", r2 && r3, JSON.stringify({ r2, r3 }));

  await save(page);
  record("R3. Save 뒤에도 같은 요소", await sameSelection(page, "dx-bio"));

  /* AI 변경 */
  page.__aiHandler = async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const pkg = body.skinPackage;
    pkg.css = `${pkg.css} .dx-ai-mark { color: rgb(1, 2, 3); }`;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, skinPackage: pkg, summary: "바꿨어요" }) });
  };
  await page.click("#studioInspectorAiButton");
  await page.waitForFunction(() => window.isStudioAiPanelOpen && window.isStudioAiPanelOpen(), null, { timeout: 3000 });
  await page.fill("#studioAiDrawerInput", "색을 조금 바꿔 줘");
  await page.click("#studioAiDrawerSend");
  const aiApplied = await waitDraft(page, "return pkg.css.includes('.dx-ai-mark')", null, 10000);
  const r4 = await sameSelection(page, "dx-bio");
  record("R4. AI 변경 적용 뒤에도 같은 요소(선택 요소 AI · 전송 1)", aiApplied && r4 && page.__aiCalls === 1,
    JSON.stringify({ aiApplied, r4, calls: page.__aiCalls }));
  await page.click("#studioAiPanelCollapse").catch(() => {});

  /* Code 적용 */
  await page.click("#studioCodeButton").catch(async () => {
    await page.click("#studioMoreButton");
    await page.click("#studioCodeButton");
  });
  await page.waitForFunction(() => { const o = document.querySelector(".code-editor-overlay"); return !!o && !o.hidden; });
  let areas = await page.$$(".code-editor-textarea");
  await areas[1].fill((await areas[1].inputValue()) + " .dx-code-mark { color: rgb(4, 5, 6); }");
  await page.click(".code-editor-button--primary");
  await waitDraft(page, "return pkg.css.includes('.dx-code-mark')");
  await page.evaluate(() => { const o = document.querySelector(".code-editor-overlay"); if (o && !o.hidden) document.querySelector(".code-editor-close").click(); });
  record("R5. Code 적용 뒤에도 같은 요소", await sameSelection(page, "dx-bio"));

  /* 이미지 변경 */
  await legacySelect(page, ".dx-avatar");
  await page.click("#studioInspectorQuickImage");
  await page.waitForSelector(".images-panel-card-attach", { timeout: 6000 });
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".images-panel-card")).find(c => c.querySelector("img").src.includes("dux-b"));
    card.querySelector(".images-panel-card-attach").click();
  });
  record("R6. 이미지 변경 뒤에도 같은 요소", await sameSelection(page, "dx-avatar"));

  /* 지운 요소 — 다른 요소로 넘어가지 않고 해제 */
  await legacySelect(page, ".dx-bio");
  await page.click("#studioCodeButton").catch(() => {});
  await page.waitForFunction(() => { const o = document.querySelector(".code-editor-overlay"); return !!o && !o.hidden; });
  areas = await page.$$(".code-editor-textarea");
  const htmlValue = await areas[0].inputValue();
  const removed = htmlValue.replace(/<p class="dx-bio"[^>]*>[\s\S]*?<\/p>/, "");
  await areas[0].fill(removed);
  await page.click(".code-editor-button--primary");
  await waitDraft(page, "return !pkg.templates.home.html.includes('dx-bio')");
  await page.evaluate(() => { const o = document.querySelector(".code-editor-overlay"); if (o && !o.hidden) document.querySelector(".code-editor-close").click(); });
  await sleep(600);
  const gone = {
    studio: await page.evaluate(() => window.getStudioInspectorSelection()),
    frame: (await frameInspect(page)).selectedEditId
  };
  record("R7. 고른 요소가 지워지면 뒤 형제로 넘어가지 않고 선택이 풀린다(Studio · 프레임 둘 다)",
    htmlValue !== removed && gone.studio === null && gone.frame === null,
    JSON.stringify({ studio: gone.studio && gone.studio.name, frame: gone.frame }));

  await closeStudio(page);

}


/* =========================================================
   preserve — 숨은 격자 · 효과 값 보존
========================================================== */

const GRID_ATTRS = [
  'data-imory-layout="grid"',
  'data-imory-layout-columns="2"',
  'data-imory-layout-gap="12"',
  'data-imory-transition="fade-slide"',
  'data-imory-transition-duration="400"'
];

function gridTag(html) {
  return (/<section class="dx-grid"[^>]*>/.exec(html) || [""])[0];
}

const frameGrid = (page) => fx(page, () => {
  const grid = document.querySelector(".dx-grid");
  const cs = getComputedStyle(grid);
  return {
    display: cs.display,
    columns: cs.gridTemplateColumns.split(" ").filter(Boolean).length,
    color: cs.color,
    transition: grid.getAttribute("data-imory-transition"),
    duration: grid.getAttribute("data-imory-transition-duration"),
    /* Select 가 켜져 있으면 모든 요소에 임시 식별자가 찍힌다 — 편집하지 않은 글자에 없으면 Select 없는 렌더다 */
    stamped: document.querySelector(".dx-bio").hasAttribute("data-imory-edit-id")
  };
});

async function runPreserve(browser) {

  const page = await openStudio(browser, { tag: "preserve" });
  await enableSelect(page);

  await realClick(page, ".dx-grid", 0.5, 0.5);
  await waitSelected(page, "dx-grid");
  const h0 = await history(page);
  const d0 = await draft(page);
  await page.evaluate(() => {
    const input = document.querySelector('#studioInspectorFields [data-inspector-control="color"]');
    input.value = "#123456";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitDraft(page, "return pkg.css.includes('#123456')");
  await sleep(400);
  const d1 = await draft(page);
  const h1 = await history(page);
  const g1 = await frameGrid(page);
  /* 숨은 배치 · 전환 값 — 템플릿 전체의 그 속성 목록이 앞뒤로 같은가 */
  const hiddenAttrs = (html) => (html.match(/ data-imory-(layout|item|transition)[a-z-]*="[^"]*"/g) || []).join("");
  const htmlChangedOnlyByPromotion =
    hiddenAttrs(d1.html) === hiddenAttrs(d0.html) && hiddenAttrs(d0.html).length > 0;
  record("V1. sandbox 격자 + 움직임 효과 요소에서 글자색만 → 속성 다섯 그대로 · CSS 에 color 한 줄 · 템플릿 전체의 배치·전환 속성 목록 불변 · ↶ 한 칸 · 프레임에 격자·효과·새 색",
    GRID_ATTRS.every(a => gridTag(d1.html).includes(a)) && /color: #123456/.test(d1.css) &&
      htmlChangedOnlyByPromotion && h1.undo === h0.undo + 1 &&
      g1.display === "grid" && g1.columns === 2 && g1.color === "rgb(18, 52, 86)" &&
      g1.transition === "fade-slide" && g1.duration === "400",
    JSON.stringify({ tag: gridTag(d1.html), g1, h0, h1 }));

  await page.click("#studioUndoButton");
  await sleep(450);
  const du = await draft(page);
  const gu = await frameGrid(page);
  await page.click("#studioRedoButton");
  await sleep(450);
  const dr = await draft(page);
  const gr = await frameGrid(page);
  record("V2. Undo = 색만 빠지고 격자·효과는 그대로 · Redo = 다시 그 색(각각 한 칸)",
    !/#123456/.test(du.css) && GRID_ATTRS.every(a => gridTag(du.html).includes(a)) && gu.display === "grid" &&
      dr.css === d1.css && gr.color === "rgb(18, 52, 86)",
    JSON.stringify({ gu, gr }));

  await save(page);
  const saved = await savedContent(page);
  record("V3. Save 한 content 에 격자·효과 속성과 새 글자색", GRID_ATTRS.every(a => gridTag(saved.templates.home.html).includes(a)) &&
    /color: #123456/.test(saved.css) && saved.renderMode === "sandbox");

  /* Publish */
  await page.click("#studioPublishButton");
  await page.waitForFunction(() => {
    const el = document.getElementById("studioSaveStatus");
    return el && /공개됨|저장됨/.test(el.textContent + (el.getAttribute("aria-label") || ""));
  }, null, { timeout: 8000 }).catch(() => {});
  await closeStudio(page);

  /* 다시 열기 — Select 를 켜지 않은(공개 화면과 같은) 렌더 */
  const reopened = await openStudio(browser, { savedPackage: saved, tag: "preserve-reopen" });
  const view = await frameGrid(reopened);
  record("V4. Save 한 content 로 다시 열어 Select 없이 그린 프레임(공개와 같은 renderSkin · 임시 식별자 없음) — 격자 2열 · 효과 · 새 색",
    view.display === "grid" && view.columns === 2 && view.color === "rgb(18, 52, 86)" &&
      view.transition === "fade-slide" && view.duration === "400" && view.stamped === false,
    JSON.stringify(view));

  await reopened.click('#studioViewportToggle [data-viewport-mode="mobile"]').catch(() => {});
  await sleep(600);
  const mobile = await frameGrid(reopened);
  record("V5. 같은 값이 Mobile Preview 프레임에도", mobile.color === "rgb(18, 52, 86)" && mobile.transition === "fade-slide",
    JSON.stringify(mobile));
  await closeStudio(reopened);

}


/* =========================================================
   zoom — Mobile Preview(축소)에서 좌표
========================================================== */

async function runZoom(browser) {

  /* Preview 가 스크롤되도록 창 높이를 줄인다(Z3) */
  const page = await openStudio(browser, { viewport: { width: 1280, height: 520 }, tag: "zoom" });
  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await sleep(600);
  await enableSelect(page);

  const p = await realClick(page, ".dx-bio");
  const picked = await waitSelected(page, "dx-bio");
  await sleep(300);
  const box = await fx(page, () => {
    const b = document.querySelector(".imory-sandbox-inspect-box--select").getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  const el = await fx(page, () => {
    const b = document.querySelector(".dx-bio").getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  const mapped = await mapFrameRect(page, box);
  const label = await page.evaluate(() => {
    const l = document.getElementById("studioInspectorSelectLabel");
    const r = l.getBoundingClientRect();
    return { hidden: l.hidden, left: r.left, top: r.top, bottom: r.bottom, text: l.textContent };
  });
  record("Z1. 축소된 Mobile Preview 에서도 누른 그 글자가 선택되고, 프레임 테두리가 요소와 겹친다",
    p.scale < 0.999 && picked && Math.abs(box.left - el.left) < 1 && Math.abs(box.width - el.width) < 1,
    JSON.stringify({ scale: p.scale, box, el }));
  record("Z2. 이름표가 프레임 테두리 자리에 붙는다(축소 배율 반영)",
    !label.hidden && label.text === "텍스트" && Math.abs(label.left - mapped.left) <= 3 &&
      (Math.abs(label.bottom - mapped.top) <= 6 || Math.abs(label.top - mapped.top) <= 6),
    JSON.stringify({ label, mapped }));

  /* hover 이름표 */
  await page.keyboard.press("Escape");
  const hp = await sbPoint(page, ".dx-title");
  await page.mouse.move(hp.x - 10, hp.y - 10);
  await page.mouse.move(hp.x, hp.y, { steps: 4 });
  await sleep(350);
  const hover = await page.evaluate(() => {
    const l = document.getElementById("studioInspectorHoverLabel");
    const f = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    const r = l.getBoundingClientRect();
    return { text: l.hidden ? null : l.textContent, inside: r.left >= f.left - 1 && r.right <= f.right + 1 };
  });
  record("Z4. 축소 상태의 hover 이름표 — 이름 · Preview 프레임 안", hover.text === "홈 이름" && hover.inside, JSON.stringify(hover));

  /* 스크롤 뒤에도 이름표가 따라온다 — Desktop Preview 는 문서가 스크롤된다
     (Mobile 은 프레임 전체가 축소돼 내부 스크롤이 없다) */
  await page.click('#studioViewportToggle [data-viewport-mode="desktop"]');
  await sleep(600);
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await sleep(300);
  const boxD = await fx(page, () => {
    const b = document.querySelector(".imory-sandbox-inspect-box--select").getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  const mappedD = await mapFrameRect(page, boxD);
  const scrolled = await page.evaluate(() => {
    const win = document.getElementById("studioPreviewFrame").contentWindow;
    const before = win.scrollY;
    win.scrollBy(0, before > 40 ? -40 : 40);
    return win.scrollY - before;
  });
  await sleep(400);
  const mapped2 = await mapFrameRect(page, boxD);
  const label2 = await page.evaluate(() => {
    const r = document.getElementById("studioInspectorSelectLabel").getBoundingClientRect();
    return { left: r.left, top: r.top, bottom: r.bottom };
  });
  record("Z3. Preview 를 스크롤해도 이름표가 프레임 테두리를 따라온다(프레임 안 좌표는 그대로여도)",
    Math.abs(mapped2.top - mappedD.top) > 1 &&
      (Math.abs(label2.bottom - mapped2.top) <= 6 || Math.abs(label2.top - mapped2.top) <= 6),
    JSON.stringify({ scrolled, mapped: mappedD.top, mapped2: mapped2.top, label2 }));


  await closeStudio(page);

}


/* =========================================================
   narrow — 390px Studio 창
========================================================== */

async function runNarrow(browser) {

  pointAnchor = 0.25;

  const page = await openStudio(browser, { viewport: { width: 390, height: 844 }, tag: "narrow" });
  await enableSelect(page);
  await collapseSheetIfNarrow(page);

  await realClick(page, ".dx-bio");
  const picked = await waitSelected(page, "dx-bio");
  await sleep(400);
  const sheet = await page.evaluate(() => {
    const bar = document.getElementById("studioInspectorQuickBar");
    const slot = document.getElementById("studioInspectorQuickBarSlot");
    return {
      docked: !!bar && !!slot && slot.contains(bar) && bar.classList.contains("is-docked"),
      fieldsOpen: !document.getElementById("studioInspectorFields").hidden
    };
  });
  record("W1. 390px — 프레임 안 글자를 눌러 고르면 Quick Bar 는 아래 시트 안 · 항목도 열림",
    picked && sheet.docked && sheet.fieldsOpen, JSON.stringify(sheet));

  await collapseSheetIfNarrow(page);
  await realClick(page, ".dx-caption", 0.2, 0.5);
  await page.waitForFunction(() => !document.getElementById("studioInspectorPickMenu").hidden, null, { timeout: 3000 }).catch(() => {});
  const menu = await readPickMenu(page);
  record("W2. 390px — 겹친 요소 메뉴는 아래 시트 모양", menu.open && menu.sheet && menu.items.length >= 3, JSON.stringify(menu));
  await page.keyboard.press("Escape");

  const overflow = { studio: await noHorizontalOverflow(page), frame: await frameNoHorizontalOverflow(page) };
  record("W3. 390px — Studio · 프레임 양쪽 가로 넘침 0", overflow.studio && overflow.frame, JSON.stringify(overflow));

  const label = await page.evaluate(() => {
    const l = document.getElementById("studioInspectorSelectLabel");
    if (l.hidden) return { hidden: true };
    const r = l.getBoundingClientRect();
    return { hidden: false, left: r.left, right: r.right, vw: window.innerWidth };
  });
  record("W4. 390px — 선택 이름표가 화면 안", label.hidden || (label.left >= 0 && label.right <= label.vw + 1), JSON.stringify(label));

  await closeStudio(page);

  pointAnchor = 0.5;

}


/* =========================================================
   sheet — MOBILE-SHEET-1 세 단계 시트 · sandbox Preview

   sandbox 스킨의 Preview 에서도 스크롤하는 것은 바깥 Preview 문서다
   (안쪽 프레임은 내용 높이만큼 커지고 자기 스크롤이 없다). 그래서 시트가
   덮은 만큼의 여유와 "고른 요소를 시트 위로"가 native 와 같은 길로 된다.
========================================================== */

async function runSheet(browser) {

  const page = await openStudio(browser, { viewport: { width: 390, height: 844 }, tag: "sheet" });
  await enableSelect(page);

  const outer = () => page.evaluate(() => {
    const win = document.getElementById("studioPreviewFrame").contentWindow;
    const panel = document.getElementById("studioLeftPanel").getBoundingClientRect();
    return {
      scrollY: Math.round(win.scrollY),
      inset: win.__imoryStudioSheetInset(),
      sheetTop: Math.round(panel.top),
      state: window.getStudioSheetState(),
      frames: win.document.querySelectorAll("iframe[data-imory-sandbox-frame]").length
    };
  });

  const noteRect = async () => {
    const r = await fx(page, () => {
      const b = document.querySelector(".dx-note").getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height, innerScroll: Math.round(window.scrollY) };
    });
    const m = await mapFrameRect(page, r);
    return { frameTop: Math.round(r.top), innerScroll: r.innerScroll, top: m.top, bottom: m.top + m.height, x: m.left + m.width / 2, y: m.top + m.height / 2 };
  };

  const o0 = await outer();
  record(
    "H1. sandbox — Select 를 켜면 접힘 · 바깥 Preview 문서 끝에 시트 높이만큼 Studio 전용 여유(프레임은 하나 그대로)",
    o0.state === "peek" && o0.inset.inset > 0 && o0.inset.spacer && o0.frames === 1,
    JSON.stringify(o0)
  );

  const n0 = await noteRect();
  await page.mouse.click(n0.x, n0.y);
  const picked = await waitSelected(page, "dx-note");
  await sleep(300);
  const o1 = await outer();
  const n1 = await noteRect();
  record(
    "H2. sandbox — 프레임 안 요소를 고르면 접힘이고 그 요소가 시트에 덮이지 않는다",
    picked && o1.state === "peek" && n1.bottom <= o1.sheetTop,
    JSON.stringify({ o1, note: n1 })
  );

  await page.click("#studioLeftPanelSheetUp");
  await sleep(500);
  const o2 = await outer();
  const n2 = await noteRect();
  const label = await page.evaluate(() => {
    const l = document.getElementById("studioInspectorSelectLabel");
    const r = l.getBoundingClientRect();
    return { hidden: l.hidden, bottom: Math.round(r.bottom) };
  });
  const gap = o2.sheetTop - n2.bottom;
  record(
    "H3. sandbox — 내용 보기로 펼치면 바깥 Preview 문서만 스크롤돼 요소가 시트 위(최소한 · 12px 여백) · 안쪽 프레임은 스크롤하지 않고 요소 자리도 그대로 · 이름표가 따라옴",
    o2.state === "content" && o2.scrollY > o1.scrollY && gap >= 8 && gap <= 18 &&
      n2.innerScroll === 0 && n2.frameTop === n0.frameTop && !label.hidden && label.bottom <= n2.top + 2 && o2.frames === 1,
    JSON.stringify({ scrollY: [o1.scrollY, o2.scrollY], gap, frameTop: [n0.frameTop, n2.frameTop], label })
  );

  await page.click("#studioLeftPanelSheetDown");
  await sleep(400);
  const o3 = await outer();
  record(
    "H4. sandbox — 접힘으로 내려도 Preview 가 튀지 않는다",
    o3.state === "peek" && o3.scrollY === o2.scrollY,
    JSON.stringify({ scrollY: [o2.scrollY, o3.scrollY] })
  );

  const overflow = { studio: await noHorizontalOverflow(page), frame: await frameNoHorizontalOverflow(page) };
  record("H5. sandbox — 390px Studio · 프레임 양쪽 가로 넘침 0", overflow.studio && overflow.frame, JSON.stringify(overflow));

  await closeStudio(page);

}


/* =========================================================
   forge — 위조 · 다른 origin
========================================================== */

async function forge(page, type, payload) {
  return fx(page, ([type, payload]) => {
    const seq = window.__imorySandboxInspectState().renderSeq;
    window.parent.postMessage(
      { imory: 1, type, seq: 9000 + Math.floor(Math.random() * 900), payload: Object.assign({ contract: 1, renderSeq: seq }, payload) },
      "*"
    );
    return seq;
  }, [type, payload]);
}

async function runForge(browser) {

  const page = await openStudio(browser, { tag: "forge" });
  await enableSelect(page);

  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  const real = await page.evaluate(() => window.getStudioInspectorSelection());
  const d0 = await draft(page);
  const h0 = await history(page);
  const rect = { left: 10, top: 10, width: 50, height: 20 };

  /* F1 — draft 에 없는 식별자로 만든 후보 */
  await forge(page, "IMORY_INSPECT_CANDIDATES", {
    point: { x: 20, y: 20 },
    candidates: [
      { editId: "zzzforged1", tagName: "p", rect },
      { editId: "zzzforged2", tagName: "div", rect, outer: true }
    ]
  });
  await sleep(300);
  record("F1. 지금 template 에 없는 식별자로 지어낸 후보는 메뉴가 되지 않는다",
    await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden) &&
      (await page.evaluate(() => window.getStudioInspectorSelection().editId)) === real.editId);

  /* F2 — begin 없이 온 글자 확정 */
  await forge(page, "IMORY_INSPECT_TEXT", { phase: "commit", editId: real.editId, text: "HACKED" });
  await sleep(400);
  record("F2. 사용자가 편집을 시작하지 않았는데 온 글자 확정은 버려진다(draft · 기록 불변)",
    (await draft(page)).html === d0.html && (await history(page)).undo === h0.undo);

  /* F3 — 데이터가 채우는 글자(홈 이름)의 편집 */
  const titleId = await fx(page, () => document.querySelector(".dx-title").getAttribute("data-imory-edit-id"));
  await legacySelect(page, ".dx-title");
  await forge(page, "IMORY_INSPECT_TEXT", { phase: "begin", editId: titleId, text: "" });
  await forge(page, "IMORY_INSPECT_TEXT", { phase: "commit", editId: titleId, text: "HACKED TITLE" });
  await sleep(400);
  record("F3. 바인딩 글자에 대한 편집 메시지는 begin 부터 받지 않는다(draft 불변)",
    (await draft(page)).html === d0.html && !(await draft(page)).html.includes("HACKED"));

  /* F4 — 후보 칸에 class/selector 를 끼운 봉투 */
  await forge(page, "IMORY_INSPECT_CANDIDATES", {
    point: { x: 20, y: 20 },
    candidates: [
      { editId: titleId, tagName: "h1", rect, className: "dx-title" },
      { editId: real.editId, tagName: "p", rect, selector: ".dx-bio" }
    ]
  });
  await sleep(300);
  record("F4. 후보에 class/selector 를 끼운 메시지는 프로토콜에서 떨어진다(메뉴 없음)",
    await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden));

  /* F5 — 다른 origin(같은 origin 의 Preview 문서)이 프레임인 척 */
  await page.evaluate(([rect, id]) => {
    const win = document.getElementById("studioPreviewFrame").contentWindow;
    win.postMessage({
      imory: 1, type: "IMORY_INSPECT_CANDIDATES", seq: 9999,
      payload: { contract: 1, renderSeq: 1, point: { x: 1, y: 1 }, candidates: [{ editId: id, tagName: "p", rect }, { editId: id, tagName: "p", rect }] }
    }, "*");
  }, [rect, real.editId]);
  await sleep(300);
  record("F5. 프레임이 아닌 origin/source 에서 온 봉투는 무시된다",
    await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden));

  /* F6 — 프레임 realm 이 자기에게 부모용 지시(CAPS)를 보내도 받지 않는다 */
  const capsBefore = (await directState(page)).caps;
  await fx(page, (id) => {
    window.postMessage({
      imory: 1, type: "IMORY_INSPECT_CAPS", seq: 9998,
      payload: { contract: 1, renderSeq: window.__imorySandboxInspectState().renderSeq, editId: id, movable: true, textEditable: true }
    }, "*");
  }, titleId);
  await sleep(300);
  const capsAfter = (await directState(page)).caps;
  record("F6. 저자 JS 가 자기 프레임에 '고칠 수 있다'를 심을 수 없다(origin 이 부모가 아니다)",
    JSON.stringify(capsBefore) === JSON.stringify(capsAfter) && capsAfter.textEditable === false,
    JSON.stringify({ capsBefore, capsAfter }));

  record("F7. 프레임은 여전히 하나다", (await sandboxFrameCount(page)) === 1);

  await closeStudio(page);

}


/* =========================================================
   실행
========================================================== */

const parentServer = await startServer(PARENT_PORT);
const sandboxServer = await startServer(SANDBOX_PORT);

const pw = await loadPlaywright(BROWSER);
const browser = await pw[BROWSER].launch();

const SECTIONS = [
  ["priority", runPriority],
  ["names", runNames],
  ["overlap", runOverlap],
  ["text", runText],
  ["image", runImage],
  ["quickbar", runQuickbar],
  ["move", runMove],
  ["restore", runRestore],
  ["preserve", runPreserve],
  ["zoom", runZoom],
  ["narrow", runNarrow],
  ["sheet", runSheet],
  ["forge", runForge]
];

try {

  for (const [name, fn] of SECTIONS) {
    if (!shouldRun(name)) continue;
    console.log(`\n[${name}]`);
    try {
      await fn(browser);
    } catch (err) {
      record(`${name}: 예외 없이 끝난다`, false, String(err && err.stack || err).slice(0, 600));
    }
  }

  record("Z. 콘솔 오류 없음", consoleErrors.length === 0, consoleErrors.slice(0, 6).join(" | "));

} finally {
  await browser.close();
  parentServer.close();
  sandboxServer.close();
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (${BROWSER})`);
if (failed.length) console.log("실패:\n  - " + failed.map(f => f.name).join("\n  - "));
process.exit(failed.length ? 1 : 0);
