/* =========================================================
   이미지 자르기 — 공개 화면 렌더 E2E

   "Studio에서 자른 결과가 **Inspector가 없는 공개 화면**에서도
   자르기 CSS만으로 그대로 보이는가"를 확인한다. 자르기 자체의
   동작은 studio/studio-crop-e2e-test.mjs가 보고, 이 파일은 그
   **산출물**만 본다.

   ★ 두 단계를 한 파일에서 잇는다 — 이게 이 테스트의 핵심이다.

     1단계  studio/studio-lifecycle-scenario.html?scenario=y 를 열어
            실제 Studio UI로 이미지를 자르고 **Save + Export**한다.
     2단계  그 Export .json을 그대로 get_published_skin의 응답으로
            돌려주고, 저장소의 실제 index.html을 띄워 공개 HOME을
            렌더한다.

     중간에 사람이 손으로 옮겨 적는 값이 없다 — 공개 화면이 받는
     것은 Studio가 내보낸 바이트 그대로다.

   ★ sanitizer / CSS validator 통과를 **명시적으로** 확인한다.
     공개 렌더는 skin/skin-render.js 하나를 지나고 그 함수가 매
     호출마다 sanitizeSkinHTML() + validateAndScopeSkinCss()를 다시
     돌린다. 그래서
       - 래퍼 <span>과 data-imory-edit-id가 렌더된 DOM에 남아 있는가
       - 스코프된 <style> 안에 --imory-crop / overflow / object-position
         규칙이 남아 있는가
     둘을 직접 읽어서 확인한다(화면이 맞다는 것만으로 넘기지 않는다).

   ★ Supabase는 네트워크 mock이다(skin-published-frame-e2e-test.mjs와
     같은 방식). HTML/CSS/JS는 저장소의 실제 파일을 그대로 서빙한다.

   ★ 실행 방법
     node skin/skin-crop-published-e2e-test.mjs
     node skin/skin-crop-published-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8947;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const STUDIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=y`;
const BASE = `http://localhost:${PORT}`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `\n        ${detail}` : ""}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const near = (a, b, tolerance = 1.6) => Math.abs(a - b) <= tolerance;


/* =========================================================
   정적 서버 — 실제 파일 + SPA fallback(_redirects와 같은 동작)
========================================================== */

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

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const abs = path.join(ROOT, rel);

    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(abs).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(fs.readFileSync(path.join(ROOT, "index.html")));
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


async function loadPlaywright(browserName) {
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

  const tried = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let mod;
    try {
      mod = createRequire(entry)("playwright");
    } catch {
      continue;
    }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(String(err.message).split("\n")[0]);
    }
  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다.\n` +
    `시도: ${tried.join(" | ") || "설치 없음"}\n` +
    "`npx playwright install " + browserName + "`을 먼저 실행하세요."
  );
}


/* =========================================================
   fixture 이미지 — 자연 크기가 서로 다른 진짜 PNG
   (studio/studio-crop-e2e-test.mjs와 같은 이유 — 원본 비율이
    하나뿐이면 "정사각형일 때만 맞는 코드"도 통과한다)
========================================================== */

function makePng(width, height) {

  function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) {
        c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
      }
    }
    return (~c) >>> 0;
  }

  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed), 0);
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.alloc((width * 3 + 1) * height))),
    chunk("IEND", Buffer.alloc(0))
  ]);

}

const FIXTURE_IMAGES = {
  "profile.png": makePng(40, 40),
  "cover.png": makePng(80, 20),
  "portrait.png": makePng(20, 60)
};

async function routeFixtureImages(page) {
  await page.route("https://example.com/**", async (route) => {
    const name = route.request().url().split("/").pop();
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: FIXTURE_IMAGES[name] || FIXTURE_IMAGES["profile.png"]
    });
  });
}


/* =========================================================
   1단계 — Studio에서 실제로 자르고 Save + Export

   공개 화면에서 확인할 것들이 한 페이지에 다 있도록 HOME template을
   먼저 갈아 끼운다(Code Apply와 같은 경로인 applyStudioDirectEdit).
   스킨 작성자가 쓸 법한 평범한 마크업이다:

     .pub-avatar   슬롯 연결(profile) · 정사각형
     .pub-cover    슬롯 연결(cover) · 가로형
     .pub-linked   <a> 안의 이미지(링크 클릭이 살아 있는지)
     .pub-portrait 정적 URL · 세로 사진
========================================================== */

const PUBLIC_HOME_HTML =
  '<div class="pub-home">' +
  '<h1 class="pub-title" data-imory-bind="site.title"></h1>' +
  '<img class="pub-avatar" data-imory-src="profile.avatarUrl" alt="프로필">' +
  '<img class="pub-cover" data-imory-src="images.cover" alt="커버">' +
  '<a class="pub-link" href="/testuser/category/1">' +
  '<img class="pub-linked" src="https://example.com/cover.png" alt="링크 이미지">' +
  '</a>' +
  '<img class="pub-portrait" src="https://example.com/portrait.png" alt="세로 사진">' +
  '</div>';

const PUBLIC_HOME_CSS =
  '.pub-home { padding: 12px; }' +
  '.pub-avatar { width: 120px; height: 120px; object-fit: cover; }' +
  '.pub-cover { width: 300px; height: 100px; object-fit: cover; }' +
  '.pub-linked { width: 200px; height: 80px; object-fit: cover; }' +
  '.pub-portrait { width: 90px; height: 160px; object-fit: cover; }';


async function openStudio(context, consoleErrors) {

  const page = await context.newPage();

  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(`studio :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`studio :: ${err.message}`));

  await page.route("**/api/skin-ai", route =>
    route.fulfill({ status: 500, contentType: "text/plain", body: "must not be called" })
  );

  await routeFixtureImages(page);

  await page.goto(STUDIO_URL, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  return page;

}


function previewHas(page, selector, timeoutMs = 8000) {
  return page.waitForFunction(
    (sel) => {
      const frame = document.getElementById("studioPreviewFrame");
      const doc = frame && frame.contentDocument;
      return !!(doc && doc.querySelector(sel));
    },
    selector,
    { timeout: timeoutMs }
  );
}


async function selectInPreview(page, selector) {

  const className = selector.replace(/^\./, "");

  await page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    if (!el) throw new Error("preview element not found: " + sel);
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, selector);

  await page.waitForFunction(
    (name) => {
      const selection = window.getStudioInspectorSelection();
      return !!selection && selection.classNames.indexOf(name) !== -1;
    },
    className,
    { timeout: 6000 }
  );

  await page.waitForFunction(
    () => {
      const state = window.getStudioInspectorState();
      return !!(state.metrics && state.metrics.width > 0);
    },
    null,
    { timeout: 6000 }
  );

}


async function openDirectEdit(page) {

  for (let attempt = 0; attempt < 3; attempt += 1) {

    if (await page.evaluate(() => window.getStudioInspectorState().editingOpen)) {
      return;
    }

    await page.click("#studioInspectorDirectButton");

    const opened = await page
      .waitForFunction(() => window.getStudioInspectorState().editingOpen === true, null, { timeout: 2000 })
      .then(() => true, () => false);

    if (opened) return;

    await sleep(300);

  }

  throw new Error("직접 수정 폼이 열리지 않았습니다");

}


/* 한 이미지를 자른다 — 비율 → 확대 → (선택) 드래그 → 적용 */
async function cropImage(page, selector, options) {

  await selectInPreview(page, selector);
  await openDirectEdit(page);

  await page.click("#studioInspectorCropOpen");
  await page.waitForFunction(() => !!window.getStudioInspectorState().cropDraft, null, { timeout: 4000 });
  await sleep(250);

  await page.click(`[data-inspector-control="cropRatio"][data-inspector-value="${options.ratio}"]`);
  await sleep(400);

  if (options.zoom) {
    await page.evaluate((next) => {
      const input = document.getElementById("studioInspectorCropZoom");
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, options.zoom);
    await sleep(400);
  }

  if (options.dragX || options.dragY) {

    const start = await page.evaluate(() => {
      const el = document.getElementById("studioInspectorCropSurface");
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    if (!start) throw new Error("자르기 드래그 판이 보이지 않습니다: " + selector);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let step = 1; step <= 4; step += 1) {
      await page.mouse.move(
        start.x + ((options.dragX || 0) * step) / 4,
        start.y + ((options.dragY || 0) * step) / 4
      );
      await sleep(45);
    }
    await page.mouse.up();
    await sleep(350);

  }

  await page.click("#studioInspectorCropApply");
  await page.waitForFunction(() => !window.getStudioInspectorState().cropDraft, null, { timeout: 4000 });
  await sleep(500);

}


/* Studio Preview 안의 프레임/사진 사각형 — 공개 화면과 비교할 기준 */
async function studioGeometry(page, selector) {
  return page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    if (!el) return null;
    const view = doc.defaultView;
    const parent = el.parentElement;
    const marker = parent ? view.getComputedStyle(parent).getPropertyValue("--imory-crop").trim() : "";
    const frameEl = (marker && parent.children.length === 1) ? parent : el;
    const f = frameEl.getBoundingClientRect();
    const i = el.getBoundingClientRect();
    const r = (n) => Math.round(n * 100) / 100;
    return {
      cropped: !!(marker && parent.children.length === 1),
      frame: { width: r(f.width), height: r(f.height) },
      image: { width: r(i.width), height: r(i.height) },
      offsetX: r(i.left - f.left),
      offsetY: r(i.top - f.top),
      objectPosition: view.getComputedStyle(el).objectPosition
    };
  }, selector);
}


async function buildCroppedPackage(context, consoleErrors) {

  const page = await openStudio(context, consoleErrors);

  /* HOME template을 공개 화면용으로 갈아 끼운다(Code Apply와 같은 경로) */
  await page.evaluate(
    ([html, css]) => window.applyStudioDirectEdit("home", html, css),
    [PUBLIC_HOME_HTML, PUBLIC_HOME_CSS]
  );

  await sleep(800);
  await previewHas(page, ".pub-home");

  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await previewHas(page, "[data-imory-edit-id]");

  await cropImage(page, ".pub-avatar", { ratio: "16:9", zoom: 170, dragX: 24, dragY: 12 });

  await cropImage(page, ".pub-cover", { ratio: "1:1" });

  /* 커버 프레임만 일부러 모바일 폭보다 넓게 키운다 — 그래야
     "좁은 화면에서 max-width:100%로 줄어든 프레임"이 실제로
     만들어지고, 그 상태에서 비율/구도/빈틈을 잴 수 있다.
     (자른 뒤의 너비 컨트롤은 프레임을 대상으로 한다) */
  await page.evaluate(() => {
    const input = document.getElementById("studioInspectorSizeNumber");
    input.value = "400";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await sleep(700);
  await cropImage(page, ".pub-linked", { ratio: "3:2", zoom: 140 });
  await cropImage(page, ".pub-portrait", { ratio: "4:3" });

  const studio = {
    avatar: await studioGeometry(page, ".pub-avatar"),
    cover: await studioGeometry(page, ".pub-cover"),
    linked: await studioGeometry(page, ".pub-linked"),
    portrait: await studioGeometry(page, ".pub-portrait")
  };

  /* Save */
  await page.click("#studioSaveButton");
  await page.waitForFunction(
    () => window.getStudioAiWorkingState().isDirty === false,
    null,
    { timeout: 8000 }
  );

  const saved = await page.evaluate(() => {
    const calls = window.__savedDraftCallsY || [];
    return calls.length ? calls[calls.length - 1].p_content : null;
  });

  /* Export */
  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.click("#studioExportButton");
  const download = await downloadPromise;
  const exportedText = fs.readFileSync(await download.path(), "utf8");

  await page.close();

  return { studio, saved, exported: JSON.parse(exportedText), exportedText };

}


/* =========================================================
   2단계 — 공개 화면 (index.html + skin-render.js)
========================================================== */

const DB = {
  profiles: [{
    user_id: OWNER_ID, slug: SLUG, home_mode: "customize",
    nickname: "테스트 사용자", bio: "자르기 공개 렌더 확인"
  }],
  site_settings: [
    { user_id: OWNER_ID, key: "blog_title", value: "CROP PUBLIC" },
    { user_id: OWNER_ID, key: "favicon_url", value: "" }
  ],
  categories: [
    { id: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1 }
  ],
  posts: [
    { id: 101, user_id: OWNER_ID, category_id: 1, title: "첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", quote_preset_id: null }
  ],
  post_contents: [{ post_id: 101, content: "본문입니다." }],
  banners: [],
  quote_presets: []
};

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function queryTable(table, params) {
  let rows = (DB[table] || []).map(r => ({ ...r }));

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    const m = /^(eq|neq|in|gt|gte|lt|lte)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
      rows = rows.filter(r => list.includes(String(r[key])));
      continue;
    }
    rows = rows.filter(r => {
      const cur = r[key];
      if (op === "eq") return String(cur) === val;
      if (op === "neq") return String(cur) !== val;
      if (op === "gt") return Number(cur) > Number(val);
      if (op === "gte") return Number(cur) >= Number(val);
      if (op === "lt") return Number(cur) < Number(val);
      return Number(cur) <= Number(val);
    });
  }

  const order = params.get("order");
  if (order) {
    for (const clause of order.split(",").reverse()) {
      const [col, ...rest] = clause.split(".");
      const desc = rest.includes("desc");
      rows.sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (desc ? -1 : 1)));
    }
  }

  const limit = params.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));

  const select = params.get("select");
  if (select && select !== "*") {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }

  return rows;
}


async function installSupabaseMock(page, skinPackage) {

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {

    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 401, headers, contentType: "application/json",
        body: JSON.stringify({ message: "no session" })
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/get_published_skin")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({
          skin: skinPackage,
          schemaVersion: skinPackage.schemaVersion,
          /* 슬롯 값은 published 응답이 함께 준다 — 자르기와 무관하게
             지금까지와 같은 경로다. */
          imageSlotValues: {
            profile: "https://example.com/profile.png",
            cover: "https://example.com/cover.png"
          }
        })
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json", body: "null"
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const rows = queryTable(url.pathname.slice("/rest/v1/".length), url.searchParams);
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (single && rows.length === 0) {
        return route.fulfill({
          status: 406, headers, contentType: "application/json",
          body: JSON.stringify({ code: "PGRST116", message: "0 rows" })
        });
      }
      return route.fulfill({
        status: 200, headers,
        contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
        body: JSON.stringify(single ? rows[0] : rows)
      });
    }

    return route.fulfill({ status: 404, headers, body: "{}" });

  });

}


async function openPublicHome(context, skinPackage, viewport, consoleErrors) {

  const page = await context.newPage();

  await page.setViewportSize(viewport);

  page.on("pageerror", err => consoleErrors.push(`public :: ${err.message}`));

  await installSupabaseMock(page, skinPackage);
  await routeFixtureImages(page);

  await page.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });

  await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 20000 });
  await page.waitForTimeout(600);

  return page;

}


/* 공개 화면의 프레임/사진 사각형 + 자르기 CSS 생존 여부 */
async function publicGeometry(page, selector) {
  return page.evaluate((sel) => {

    const el = document.querySelector(`#themeMount ${sel}`);
    if (!el) return null;

    const parent = el.parentElement;
    const marker = parent ? getComputedStyle(parent).getPropertyValue("--imory-crop").trim() : "";
    const isFrame = !!(marker && parent.children.length === 1);
    const frameEl = isFrame ? parent : el;

    const f = frameEl.getBoundingClientRect();
    const i = el.getBoundingClientRect();
    const imageStyle = getComputedStyle(el);
    const frameStyle = getComputedStyle(frameEl);
    const r = (n) => Math.round(n * 100) / 100;

    return {
      cropped: isFrame,
      marker,
      wrapperTag: isFrame ? frameEl.tagName.toLowerCase() : null,
      wrapperEditId: isFrame ? frameEl.getAttribute("data-imory-edit-id") : null,
      frame: { left: r(f.left), top: r(f.top), right: r(f.right), bottom: r(f.bottom), width: r(f.width), height: r(f.height) },
      image: { left: r(i.left), top: r(i.top), right: r(i.right), bottom: r(i.bottom), width: r(i.width), height: r(i.height) },
      offsetX: r(i.left - f.left),
      offsetY: r(i.top - f.top),
      objectFit: imageStyle.objectFit,
      objectPosition: imageStyle.objectPosition,
      framePosition: frameStyle.position,
      frameOverflow: frameStyle.overflow,
      frameDisplay: frameStyle.display,
      frameMaxWidth: frameStyle.maxWidth,
      src: el.getAttribute("src"),
      insideLink: !!el.closest("a")
    };

  }, selector);
}


function coversFrame(g) {
  if (!g) return false;
  const slack = 0.6;
  return (
    g.image.left <= g.frame.left + slack &&
    g.image.top <= g.frame.top + slack &&
    g.image.right >= g.frame.right - slack &&
    g.image.bottom >= g.frame.bottom - slack
  );
}


/* =========================================================
   실행
========================================================== */

(async () => {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });

  const consoleErrors = [];

  try {

    /* ---------- 1단계 ---------- */

    const { studio, saved, exported, exportedText } = await buildCroppedPackage(context, consoleErrors);

    record(
      "P0. Studio에서 이미지 넷을 자르고 Save + Export까지 마쳤다",
      studio.avatar.cropped && studio.cover.cropped &&
        studio.linked.cropped && studio.portrait.cropped &&
        !!saved && !!exported,
      JSON.stringify({ avatar: studio.avatar.frame, cover: studio.cover.frame })
    );

    record(
      "P0b. Export .json이 저장된 draft와 같은 자르기 결과를 담고 있다(HTML/CSS 동일)",
      exported.css === saved.css &&
        exported.templates.home.html === saved.templates.home.html &&
        /--imory-crop/.test(exportedText),
      JSON.stringify({ cssSame: exported.css === saved.css, htmlSame: exported.templates.home.html === saved.templates.home.html })
    );

    /* ---------- 2단계: 데스크톱 공개 화면 ---------- */

    const desktop = await openPublicHome(context, exported, { width: 1280, height: 900 }, consoleErrors);

    const pub = {
      avatar: await publicGeometry(desktop, ".pub-avatar"),
      cover: await publicGeometry(desktop, ".pub-cover"),
      linked: await publicGeometry(desktop, ".pub-linked"),
      portrait: await publicGeometry(desktop, ".pub-portrait")
    };

    /* --- sanitizer / CSS validator 생존을 직접 확인 --- */

    const survived = await desktop.evaluate(() => {
      const root = document.querySelector("#themeMount [data-skin-root]");
      const style = root ? root.querySelector("style") : null;
      const css = style ? style.textContent : "";
      return {
        wrapperCount: root
          ? Array.from(root.querySelectorAll("span[data-imory-edit-id]"))
              .filter(s => s.children.length === 1 && s.firstElementChild.tagName === "IMG")
              .length
          : 0,
        hasMarkerRule: /--imory-crop\s*:/.test(css),
        hasOverflowRule: /overflow:\s*hidden/.test(css),
        hasObjectPosition: /object-position:/.test(css),
        hasAspectRatio: /aspect-ratio:/.test(css),
        /* 스코프가 실제로 걸렸는지 — 자르기 규칙도 예외가 아니다 */
        scopedMarkerRule: /\.imory-skin-root-[a-z0-9]+\s*\[data-imory-edit-id/.test(css),
        cssLength: css.length
      };
    });

    record(
      "P1. sanitizer 이후에도 래퍼 <span data-imory-edit-id>가 공개 DOM에 그대로 남는다 (4개)",
      survived.wrapperCount === 4 &&
        pub.avatar.wrapperTag === "span" &&
        !!pub.avatar.wrapperEditId,
      JSON.stringify({ wrapperCount: survived.wrapperCount, editId: pub.avatar.wrapperEditId })
    );

    record(
      "P2. CSS validator 이후에도 자르기 규칙(--imory-crop / overflow / aspect-ratio / object-position)이 스코프된 채 남는다",
      survived.hasMarkerRule && survived.hasOverflowRule &&
        survived.hasAspectRatio && survived.hasObjectPosition &&
        survived.scopedMarkerRule,
      JSON.stringify(survived)
    );

    record(
      "P3. Inspector 없이 자르기 CSS만으로 프레임이 성립한다(block · relative · overflow hidden · max-width 100%)",
      pub.avatar.framePosition === "relative" &&
        pub.avatar.frameOverflow === "hidden" &&
        pub.avatar.frameDisplay === "block" &&
        pub.avatar.frameMaxWidth === "100%" &&
        pub.avatar.objectFit === "cover",
      JSON.stringify({
        position: pub.avatar.framePosition,
        overflow: pub.avatar.frameOverflow,
        display: pub.avatar.frameDisplay,
        maxWidth: pub.avatar.frameMaxWidth
      })
    );

    /* --- 프레임 크기와 구도가 Studio와 같은가 --- */

    const sameAsStudio = (name) =>
      near(pub[name].frame.width, studio[name].frame.width) &&
      near(pub[name].frame.height, studio[name].frame.height) &&
      near(pub[name].image.width, studio[name].image.width, 2) &&
      near(pub[name].offsetX, studio[name].offsetX, 1.2) &&
      near(pub[name].offsetY, studio[name].offsetY, 1.2) &&
      pub[name].objectPosition === studio[name].objectPosition;

    record(
      "P4. 공개 화면의 프레임 크기·사진 위치·구도가 Studio Preview와 일치한다(네 이미지 모두)",
      ["avatar", "cover", "linked", "portrait"].every(sameAsStudio),
      JSON.stringify({
        avatar: { studio: studio.avatar, public: { frame: pub.avatar.frame, image: pub.avatar.image, offsetX: pub.avatar.offsetX, offsetY: pub.avatar.offsetY, objectPosition: pub.avatar.objectPosition } },
        portrait: { studio: studio.portrait.frame, public: pub.portrait.frame }
      })
    );

    record(
      "P5. 공개 화면에서도 프레임에 빈틈이 없다(네 이미지 모두)",
      ["avatar", "cover", "linked", "portrait"].every(name => coversFrame(pub[name])),
      JSON.stringify({
        avatar: { frame: pub.avatar.frame, image: pub.avatar.image },
        cover: { frame: pub.cover.frame, image: pub.cover.image }
      })
    );

    const desktopOverflow = await desktop.evaluate(() => ({
      docWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth
    }));

    record(
      "P6. 데스크톱 공개 화면에 가로 넘침이 없다",
      desktopOverflow.scrollWidth <= desktopOverflow.docWidth + 1 &&
        desktopOverflow.bodyScrollWidth <= desktopOverflow.docWidth + 1,
      JSON.stringify(desktopOverflow)
    );

    /* --- 자른 이미지의 링크 클릭 --- */

    await desktop.click("#themeMount a.pub-link");
    await desktop.waitForTimeout(1200);

    const navigated = await desktop.evaluate(() => ({
      path: location.pathname,
      postAreaVisible: !!document.querySelector("#postArea:not([hidden])")
    }));

    record(
      "P7. 자른 이미지를 감싼 링크가 공개 화면에서 그대로 동작한다(래퍼가 <a> 안쪽이므로)",
      pub.linked.insideLink === true &&
        navigated.path === `/${SLUG}/category/1`,
      JSON.stringify(navigated)
    );

    await desktop.close();

    /* ---------- 2단계: 모바일 공개 화면 ---------- */

    const mobile = await openPublicHome(context, exported, { width: 390, height: 844 }, consoleErrors);

    const mobilePub = {
      avatar: await publicGeometry(mobile, ".pub-avatar"),
      cover: await publicGeometry(mobile, ".pub-cover"),
      linked: await publicGeometry(mobile, ".pub-linked"),
      portrait: await publicGeometry(mobile, ".pub-portrait")
    };

    const mobileOverflow = await mobile.evaluate(() => ({
      docWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth
    }));

    record(
      "P8. 모바일 공개 화면 — 좁아서 줄어든 프레임에서도 비율과 구도가 그대로다",
      ["avatar", "cover", "linked", "portrait"].every(name =>
        mobilePub[name].cropped &&
        mobilePub[name].objectPosition === studio[name].objectPosition &&
        near(
          mobilePub[name].frame.width / mobilePub[name].frame.height,
          studio[name].frame.width / studio[name].frame.height,
          0.02
        )
      ),
      JSON.stringify({
        cover: { frame: mobilePub.cover.frame, position: mobilePub.cover.objectPosition },
        avatar: { frame: mobilePub.avatar.frame }
      })
    );

    record(
      "P9. 모바일 공개 화면 — 프레임이 줄어들어도 빈틈이 없고 가로 넘침이 없다",
      ["avatar", "cover", "linked", "portrait"].every(name => coversFrame(mobilePub[name])) &&
        mobileOverflow.scrollWidth <= mobileOverflow.docWidth + 1 &&
        mobileOverflow.bodyScrollWidth <= mobileOverflow.docWidth + 1,
      JSON.stringify({
        overflow: mobileOverflow,
        cover: { frame: mobilePub.cover.frame, image: mobilePub.cover.image }
      })
    );

    /* 실제로 좁아졌는지 — 그렇지 않으면 P8/P9가 아무 것도 검증하지 못한다 */
    record(
      "P9b. (전제) 모바일에서 400px 커버 프레임이 실제로 화면 폭에 맞춰 줄어들었다 — P8/P9가 빈 검사가 아님을 보장한다",
      mobilePub.cover.frame.width < studio.cover.frame.width - 20,
      JSON.stringify({ studio: studio.cover.frame.width, mobile: mobilePub.cover.frame.width })
    );

    await mobile.close();

    record(
      "Z. 콘솔/페이지 오류 없음",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 5).join("\n        ")
    );

  } catch (err) {

    record("실행 중 예외", false, String(err && err.stack ? err.stack : err));

  } finally {

    await context.close();
    await browser.close();
    server.close();

  }

  const passed = results.filter(r => r.pass).length;

  console.log(`\n${passed}/${results.length} PASS`);

  process.exit(passed === results.length ? 0 : 1);

})();
