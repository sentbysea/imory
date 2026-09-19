/* =========================================================
   IMAGE-CROP-PRIORITY-1 — 스킨 CSS 가 강해도 자르기가 이긴다 E2E

   기준 문서: IMORY_IMAGE_CROP_PRIORITY_DESIGN.md

   ★ 무엇을 재는가
     "확대 181%"가 **숫자로만** 바뀌고 화면의 사진이 그대로인 것을
     실패로 친다. 그래서 두 가지를 함께 본다.

       기하   사진 상자(<img>)의 사각형을 프레임 기준 비율로 잰 값이
              자르기 값(zoom · x · y)이 정하는 값과 같은가
              (getBoundingClientRect — 계산된 스타일이 아니라 **그려진
              자리**)
       픽셀   프레임을 실제로 찍은 PNG 의 다섯 점 색이, 그 기하에서
              사진(가로 = 빨강, 세로 = 초록 그러데이션)이 그 자리에
              그려졌을 때의 색과 같은가

     사진은 가로로 빨강 0→255, 세로로 초록 0→255 인 그러데이션이다.
     그래서 한 점의 색이 곧 "원본 사진의 어느 자리가 여기 그려졌는가"
     이고, 확대·이동이 실제로 그려졌는지를 색만으로 판정할 수 있다.

   ★ 네 화면 — 같은 저장물을 네 곳에서 연다
     Studio native Preview · Studio sandbox Preview(별도 origin 프레임)
     · 공개 화면 native(index.html) · 공개 화면 sandbox.
     sandbox 는 두 개의 실제 origin(포트)으로 띄우고 둘 다 배포되는
     functions/_middleware.js 에 통과시킨다
     (studio/studio-sandbox-preview-e2e-test.mjs 와 같은 방식).

   절 (--only=<이름>)
     strong    스킨이 사진에 !important 를 건 여섯 가지(없음 ·
               object-position · transform · 크기/위치/맞춤 전부 ·
               contain · cover) — 자른 결과가 **여섯 모두 같다**
               (1 · 2 · 3 · 4 · 5 · 6)
     live      적용 전 실시간 Preview — 확대 슬라이더 · 위치 슬라이더 ·
               사진 드래그가 곧바로 그려지고 draft/기록은 그대로(8)
     positions 위치 좌·중앙·우 × 상·중앙·하 아홉 자리(7)
     cancel    취소 = 열기 전 자르기 그대로(9) · 적용 = 기록 한 칸 ·
               Undo/Redo(10)
     persist   Save → 새로 열기(11) · Export → Import(12) ·
               네 화면이 같다(13) · 스킨 CSS 는 한 글자도 안 바뀐다
     mobile    390px Studio — 시트 세 단계에서 자르기(14)
     foe       FOREVER, MY FOE 실제 fixture — Import · header 슬롯 ·
               MOBILE Preview 에서 181% · 위치 · 적용 · Save/새로고침 ·
               Export/Import · Publish · 네 화면(15)
     keep      자르지 않은 이미지는 스킨의 object-fit/position 그대로 ·
               자르기가 없으면 보호 규칙도 없다
     editorial 아이모리 기본 스킨(EDITORIAL-DEFAULT-SKIN-2) — 사진 슬롯
               photo_2 자르기 + 주인 설정(색 · D-day · 모바일) · Save/새로
               열기 · Export/Import · Publish · 네 화면이 같은 구성 · 색 ·
               D-day · 좌우 영역 · 자르기(E1~E10)

   실행
     node studio/studio-crop-priority-e2e-test.mjs
     node studio/studio-crop-priority-e2e-test.mjs --browser=webkit
     node studio/studio-crop-priority-e2e-test.mjs --only=foe
     IMORY_CROP_SHOT=<디렉터리> 를 주면 프레임 PNG 를 남긴다
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8974;
const SANDBOX_PORT = 8975;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html";

const SANDBOX_FLAGS =
  `sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(SANDBOX_ORIGIN)}`;

const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";
const IMAGE_BASE = `https://${SUPABASE_HOST}/storage/v1/object/public/skin-images/u/`;
const PORTRAIT_URL = `${IMAGE_BASE}grad-portrait.png`;

const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";

const FOE_TEXT =
  fs.readFileSync(path.join(ROOT, "skin", "test-skins", "imory-skin-forever-my-foe.json"), "utf8");

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const shouldRun = (name) => !ONLY || ONLY === name;
const SHOT_DIR = process.env.IMORY_CROP_SHOT || "";

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `\n        ${detail}` : ""}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const near = (a, b, tolerance) => Math.abs(Number(a) - Number(b)) <= (tolerance === undefined ? 0.01 : tolerance);


/* =========================================================
   PNG — 그러데이션 사진을 만들고, 스크린샷을 읽는다
========================================================== */

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* 가로 → 빨강 0..255, 세로 → 초록 0..255, 파랑 90 고정 */
function makeGradientPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = Math.round(255 * x / (width - 1));
      row[2 + x * 3] = Math.round(255 * y / (height - 1));
      row[3 + x * 3] = 90;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const PORTRAIT_PNG = makeGradientPng(300, 400);

/* 스크린샷 PNG(8bit RGB/RGBA, 비인터레이스) 해독 */
function decodePng(buffer) {
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported png");
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[y * stride + x] = value & 0xff;
    }
  }
  return {
    width,
    height,
    at(fx, fy) {
      /* 3×3 평균 — 축소 배율에서 한 픽셀이 흔들리지 않게 */
      const cx = Math.min(width - 2, Math.max(1, Math.floor(fx * width)));
      const cy = Math.min(height - 2, Math.max(1, Math.floor(fy * height)));
      const sum = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = (cy + dy) * stride + (cx + dx) * channels;
          sum[0] += out[i]; sum[1] += out[i + 1]; sum[2] += out[i + 2];
        }
      }
      return sum.map((v) => Math.round(v / 9));
    }
  };
}

const SAMPLE_POINTS = [[0.15, 0.15], [0.85, 0.15], [0.5, 0.5], [0.15, 0.85], [0.85, 0.85]];


/* =========================================================
   서버 — 두 origin, 배포되는 middleware 그대로
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

  throw new Error(`playwright ${browserName}을(를) 실행할 수 없습니다. \`npx playwright install ${browserName}\`을 먼저 실행하세요.`);
}


const consoleErrors = [];

/* 콘솔 오류 중 이 라운드와 무관하게 늘 나는 것 — 폰트/외부 잡음, 그리고
   WebKit 이 Studio 시나리오에서 늘 내는 ResizeObserver 경고(이 라운드
   이전 코드 daefe2c 에서도 같은 절에서 똑같이 난다 — 2026-09-19 확인) */
const IGNORED_CONSOLE = /Failed to load resource|fonts\.googleapis|net::ERR_|ResizeObserver loop completed with undelivered notifications/;

/* WebKit 에서 FOE 를 sandbox 프레임으로 열면 CSP 가 스타일시트 하나를
   거절한다는 경고가 난다 — 이 라운드 이전 코드(daefe2c)에서도 같은 자리에서
   똑같이 나는 기존 동작이다(2026-09-19 확인). sandbox 문서에서만 넘긴다. */
const IGNORED_SANDBOX_CONSOLE = /Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/;

function watchConsole(page, label) {
  page.on("console", (msg) => {
    if (args.includes("--debug")) console.log(`[${label}:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error" || IGNORED_CONSOLE.test(msg.text())) return;
    if (/sandbox/.test(label) && IGNORED_SANDBOX_CONSOLE.test(msg.text())) return;
    consoleErrors.push(`${label} :: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    if (IGNORED_CONSOLE.test(err.message)) return;
    consoleErrors.push(`${label} :: ${err.message}`);
  });
}

async function routeImages(ctx) {
  await ctx.route(`${IMAGE_BASE}**`, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PORTRAIT_PNG, headers: { "access-control-allow-origin": "*" } })
  );
  await ctx.route("https://example.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PORTRAIT_PNG })
  );
  await ctx.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, contentType: "text/plain", body: "not used" })
  );
  for (const pattern of ["https://fonts.googleapis.com/**", "https://fonts.gstatic.com/**", "https://cdn.jsdelivr.net/gh/**", "https://unpkg.com/**"]) {
    await ctx.route(pattern, (route) => route.abort());
  }
}


/* =========================================================
   스킨 — 사진 두 장(세로 프레임 · 가로 프레임), 같은 세로 사진
========================================================== */

const BASE_CSS =
  ".cp-home{padding:16px;background:#ffffff}" +
  ".cp-portrait{position:relative;width:240px;height:320px;margin:0 0 16px;overflow:hidden;background:#000}" +
  ".cp-landscape{position:relative;width:320px;height:180px;margin:0;overflow:hidden;background:#000}" +
  ".cp-portrait img,.cp-landscape img{display:block;width:100%;height:100%;object-fit:cover}" +
  ".cp-note{margin:12px 0 0;font:12px/1.4 sans-serif}";

/* 스킨이 사진에 거는 강한 선언 — 요구사항 3절의 목록 */
const STRONG_VARIANTS = {
  plain: "",
  position: ".cp-home img{object-position:5% 95% !important}",
  transform: ".cp-home figure img{transform:scale(.55) rotate(9deg) !important;translate:12px 8px !important}",
  all:
    ".cp-home img{position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;" +
    "max-width:100% !important;max-height:100% !important;margin:0 !important;object-fit:fill !important;" +
    "object-position:0 0 !important;transform:translateX(20%) !important;aspect-ratio:1/1 !important}",
  contain: ".cp-home img{object-fit:contain !important;object-position:center !important}",
  cover: ".cp-home img{object-fit:cover !important;object-position:30% 70% !important}"
};

function cropSkin(extraCss, options) {
  return {
    schemaVersion: 1,
    ...((options && options.native) ? {} : { renderMode: "sandbox" }),
    templates: {
      home: {
        html:
          '<main class="cp-home">' +
          '<figure class="cp-portrait"><img class="cp-photo-p" data-imory-src="images.shot" alt="세로 프레임 사진"></figure>' +
          '<figure class="cp-landscape"><img class="cp-photo-l" data-imory-src="images.shot" alt="가로 프레임 사진"></figure>' +
          '<p class="cp-note">crop priority</p>' +
          "</main>"
      },
      category: { html: '<main class="cp-category"><h1 data-imory-bind="category.name"></h1></main>' },
      post: { html: '<main class="cp-post"><h1 data-imory-bind="post.title"></h1><div data-imory-region="post-body"></div></main>' }
    },
    css: BASE_CSS + (extraCss || ""),
    imageSlots: [{ name: "shot", label: "사진", required: false }],
    regions: [],
    metadata: { title: "crop priority", generatedBy: "IMAGE-CROP-PRIORITY-1 test" }
  };
}

const SHOT_SLOTS = { shot: { imageId: "img-shot", imageUrl: PORTRAIT_URL } };
const FOE_SLOTS = { header: { imageId: "img-header", imageUrl: PORTRAIT_URL } };


/* =========================================================
   Studio — scenario y(Save/Publish/이미지 슬롯이 있는 시나리오)
========================================================== */

async function openStudio(browser, options) {

  const opts = options || {};

  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
    reducedMotion: "reduce",
    acceptDownloads: true
  });

  await routeImages(ctx);

  await ctx.addInitScript(([pkg, slots]) => {
    if (pkg) window.__scenarioYSkinPackage = pkg;
    if (slots) window.__scenarioYSlots = slots;
  }, [opts.pkg || null, opts.slots || null]);

  const page = await ctx.newPage();
  watchConsole(page, opts.label || "studio");

  await page.goto(`${PARENT_ORIGIN}${STUDIO_PATH}?scenario=y${opts.sandbox ? `&${SANDBOX_FLAGS}` : ""}`, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 20000 }
  );

  if (opts.mobilePreview) {
    await page.click('[data-viewport-mode="mobile"]');
    await sleep(500);
  }

  return { ctx, page };

}

function previewFrameOf(page) {
  return page.frames().find((frame) => /preview-frame/.test(frame.url())) || null;
}

function sandboxFrameOf(page) {
  return page.frames().find((frame) => frame.url().startsWith(SANDBOX_ORIGIN)) || null;
}

async function waitIn(page, pick, selector, timeout) {
  const deadline = Date.now() + (timeout || 15000);
  while (Date.now() < deadline) {
    const frame = pick(page);
    if (frame) {
      const found = await frame.evaluate((sel) => {
        const el = document.querySelector(sel);
        return !!(el && (el.tagName !== "IMG" || (el.complete && el.naturalWidth > 0)));
      }, selector).catch(() => false);
      if (found) return frame;
    }
    await sleep(120);
  }
  throw new Error(`not rendered: ${selector}`);
}

async function enableSelect(page, probe) {
  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);
  if (!on) await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await page.waitForFunction((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc && doc.querySelector(sel);
    return !!(el && el.getAttribute("data-imory-edit-id") && doc.body.classList.contains("imory-inspector-on"));
  }, probe, { timeout: 10000 });
  await sleep(200);
}

async function disableSelect(page) {
  for (let i = 0; i < 3; i++) {
    const on = await page.evaluate(() => window.getStudioInspectorState().enabled);
    if (!on) return;
    await page.click("#studioInspectorButton");
    await sleep(300);
  }
}

/* 합성 클릭은 DIRECT-UX-1 이전 규칙(누른 요소 그대로)을 탄다 — 겹친
   장식 아래의 사진을 정확히 고르기 위해서다(studio-direct-ux-e2e 대조군). */
async function selectImage(page, selector) {
  await page.evaluate((sel) => {
    const el = document.getElementById("studioPreviewFrame").contentDocument.querySelector(sel);
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, selector);
  await page.waitForFunction((sel) => {
    const s = window.getStudioInspectorSelection();
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    const state = window.getStudioInspectorState();
    return !!(s && el && el.getAttribute("data-imory-edit-id") === s.editId && state.metrics && state.metrics.width > 0);
  }, selector, { timeout: 8000 });
  await sleep(150);
}

async function openCrop(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const visible = await page.evaluate(() => {
      const el = document.getElementById("studioInspectorCropOpen");
      return !!(el && el.offsetParent !== null);
    });
    if (visible) break;
    await page.evaluate(() => {
      const b = document.getElementById("studioInspectorDirectButton");
      if (b && b.offsetParent !== null) b.click();
    });
    await sleep(300);
  }
  await page.click("#studioInspectorCropOpen");
  await page.waitForFunction(() => !!window.getStudioInspectorState().cropDraft, null, { timeout: 5000 });
  await sleep(250);
}

async function slide(page, id, value, commit) {
  await page.evaluate(([el, v, c]) => {
    const input = document.getElementById(el);
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (c) input.dispatchEvent(new Event("change", { bubbles: true }));
  }, [id, value, commit !== false]);
  await sleep(250);
}

const setZoom = (page, percent, commit) => slide(page, "studioInspectorCropZoom", percent, commit);
const setX = (page, percent, commit) => slide(page, "studioInspectorCropPosition-x", percent, commit);
const setY = (page, percent, commit) => slide(page, "studioInspectorCropPosition-y", percent, commit);

async function applyCrop(page) {
  await page.click("#studioInspectorCropApply");
  await page.waitForFunction(() => !window.getStudioInspectorState().cropDraft, null, { timeout: 5000 });
  await sleep(500);
}

async function cancelCrop(page) {
  await page.click("#studioInspectorCropCancel");
  await page.waitForFunction(() => !window.getStudioInspectorState().cropDraft, null, { timeout: 5000 });
  await sleep(300);
}

/* 한 사진을 끝까지 자른다 — 연다 · 확대 · 위치 · 적용 */
async function cropWith(page, selector, crop) {
  await selectImage(page, selector);
  await openCrop(page);
  await setZoom(page, crop.zoom);
  await setX(page, crop.x);
  await setY(page, crop.y);
  await applyCrop(page);
}

const history = (page) => page.evaluate(() => window.getStudioHistoryState());

const working = (page) => page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }));

async function saveDraft(page) {
  await page.click("#studioSaveButton");
  await page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === false, null, { timeout: 10000 });
  return page.evaluate(() => {
    const calls = window.__savedDraftCallsY || [];
    return calls.length ? calls[calls.length - 1].p_content : null;
  });
}

async function exportPackage(page) {
  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.click("#studioExportButton");
  const download = await downloadPromise;
  return fs.readFileSync(await download.path(), "utf8");
}

async function importText(page, text) {
  await page.click("#studioImportButton");
  await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });
  await page.fill(".import-editor-textarea", text);
  await page.click(".import-editor-actions .import-editor-button:nth-child(2)");
  await page.waitForFunction(() => {
    const msg = document.querySelector(".import-editor-message");
    const apply = document.querySelector(".import-editor-button--primary");
    return msg && msg.textContent.includes("검증 성공") && apply && !apply.disabled;
  }, null, { timeout: 15000 }).catch(async (err) => {
    const msg = await page.evaluate(() => (document.querySelector(".import-editor-message") || {}).textContent);
    throw new Error(`Import 검증이 끝나지 않았다: ${msg}`);
  });
  await page.click(".import-editor-button--primary");
  await page.waitForFunction(() => { const el = document.querySelector(".import-editor-overlay"); return el && el.hidden === true; }, null, { timeout: 8000 });
  await sleep(600);
}


/* =========================================================
   공개 화면 — index.html(+ sandbox 프레임), supabase 만 mock
========================================================== */

const PUBLIC_DB = {
  profiles: [{ user_id: OWNER_ID, slug: SLUG, home_mode: "customize", nickname: "주인장", bio: "자르기 확인" }],
  site_settings: [
    { user_id: OWNER_ID, key: "blog_title", value: "CROP PRIORITY" },
    { user_id: OWNER_ID, key: "favicon_url", value: "" }
  ],
  categories: [{ id: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1, public_no: 1 }],
  posts: [{ id: 101, user_id: OWNER_ID, category_id: 1, title: "첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", quote_preset_id: null, public_no: 1 }],
  post_contents: [{ post_id: 101, content: "본문입니다." }],
  post_folders: [],
  post_gallery_images: [],
  post_covers: [],
  banners: [],
  quote_presets: []
};

function queryTable(table, params) {
  let rows = (PUBLIC_DB[table] || []).map((r) => ({ ...r }));
  for (const [key, raw] of params.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const m = /^(eq|neq|in|gt|gte|lt|lte|is)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      rows = rows.filter((r) => list.includes(String(r[key])));
    } else if (op === "eq") rows = rows.filter((r) => String(r[key]) === val);
    else if (op === "neq") rows = rows.filter((r) => String(r[key]) !== val);
    else if (op === "is") rows = rows.filter((r) => (val === "null" ? r[key] === null || r[key] === undefined : String(r[key]) === val));
  }
  const limit = params.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));
  return rows;
}

async function openPublic(browser, skinPackage, slotValues, options) {

  const opts = options || {};

  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
    reducedMotion: "reduce"
  });

  await routeImages(ctx);

  if (opts.sandbox) {
    await ctx.addInitScript((origin) => {
      try {
        localStorage.setItem("imory.sandboxSkin", "1");
        localStorage.setItem("imory.sandboxSkinOrigin", origin);
      } catch (err) { /* 없으면 플래그 없이 */ }
    }, SANDBOX_ORIGIN);
  }

  await ctx.route(`https://${SUPABASE_HOST}/**`, async (route) => {

    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS,HEAD",
      "access-control-expose-headers": "*"
    };

    if (url.pathname.startsWith("/storage/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PORTRAIT_PNG, headers });
    }
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({ status: 401, headers, contentType: "application/json", body: JSON.stringify({ message: "no session" }) });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/get_published_skin")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({ skin: skinPackage, schemaVersion: skinPackage.schemaVersion, imageSlotValues: slotValues })
      });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({ status: 200, headers, contentType: "application/json", body: "null" });
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const rows = queryTable(url.pathname.slice("/rest/v1/".length), url.searchParams);
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (single && rows.length === 0) {
        return route.fulfill({ status: 406, headers, contentType: "application/json", body: JSON.stringify({ code: "PGRST116", message: "0 rows" }) });
      }
      return route.fulfill({
        status: 200, headers,
        contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
        body: JSON.stringify(single ? rows[0] : rows)
      });
    }
    return route.fulfill({ status: 404, headers, body: "{}" });

  });

  const page = await ctx.newPage();
  watchConsole(page, opts.sandbox ? "public-sandbox" : "public");

  await page.goto(`${PARENT_ORIGIN}/${SLUG}`, { waitUntil: "load" });

  return { ctx, page };

}


/* =========================================================
   재기 — 기하 · 픽셀
========================================================== */

/* 문서 안에서 도는 함수 — 어느 문서(Preview · 프레임 · 공개)에서나 같다 */
function measureInDocument(selector) {

  const img = document.querySelector(selector);

  if (!img) return null;

  const parent = img.parentElement;
  const marker = parent ? getComputedStyle(parent).getPropertyValue("--imory-crop").trim() : "";
  const frameEl = (marker && parent.children.length === 1) ? parent : img;
  const f = frameEl.getBoundingClientRect();
  const i = img.getBoundingClientRect();
  const cs = getComputedStyle(img);
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const guards = Array.from(document.querySelectorAll("style"))
    .filter((s) => s.textContent.indexOf("@layer imory-crop-guard{") !== -1).length;

  return {
    cropped: frameEl !== img,
    marker,
    frameId: frameEl.getAttribute("data-imory-edit-id"),
    imageId: img.getAttribute("data-imory-edit-id"),
    frame: { left: r4(f.left), top: r4(f.top), width: r4(f.width), height: r4(f.height) },
    image: { left: r4(i.left), top: r4(i.top), width: r4(i.width), height: r4(i.height) },
    rel: {
      left: r4((i.left - f.left) / f.width),
      top: r4((i.top - f.top) / f.height),
      width: r4(i.width / f.width),
      height: r4(i.height / f.height)
    },
    fit: cs.objectFit,
    position: cs.objectPosition,
    transform: cs.transform,
    natural: [img.naturalWidth, img.naturalHeight],
    loaded: !!(img.complete && img.naturalWidth > 0),
    styleAttr: img.getAttribute("style"),
    frameStyleAttr: frameEl === img ? null : frameEl.getAttribute("style"),
    guards
  };

}

async function measure(frame, selector) {
  return frame.evaluate(measureInDocument, selector);
}

/* 그 기하에서 사진이 그려졌다면 (fx, fy) 에 보일 색 */
function expectedColor(geo, fx, fy) {

  const fw = geo.frame.width;
  const fh = geo.frame.height;
  const boxW = geo.rel.width * fw;
  const boxH = geo.rel.height * fh;
  const [nw, nh] = geo.natural;
  const scale = geo.fit === "contain" ? Math.min(boxW / nw, boxH / nh) : Math.max(boxW / nw, boxH / nh);
  const pw = nw * scale;
  const ph = nh * scale;
  const pos = String(geo.position).split(/\s+/).map((v) => parseFloat(v) / 100);
  const left = geo.rel.left * fw + (boxW - pw) * (Number.isFinite(pos[0]) ? pos[0] : 0.5);
  const top = geo.rel.top * fh + (boxH - ph) * (Number.isFinite(pos[1]) ? pos[1] : 0.5);
  const u = (fx * fw - left) / pw;
  const v = (fy * fh - top) / ph;

  if (u < 0 || u > 1 || v < 0 || v > 1) return null;

  return [Math.round(255 * u), Math.round(255 * v), 90];

}

async function framePixels(frame, geo, name) {
  /* sandbox 프레임 안의 vh 가 hero 를 끝없이 키운 경우(설계 문서 6절 —
     자르기와 무관한 기존 차이)는 찍지 않는다. 브라우저가 32767px 를
     넘는 스크린샷을 거절한다. */
  if (geo.frame.height > 12000 || geo.frame.width > 12000) {
    return null;
  }
  /* 적용 전 임시 프레임에는 식별자가 없다 — 사진의 부모로 찾는다 */
  const image = frame.locator(`[data-imory-edit-id="${geo.imageId}"]`).first();
  const target = geo.cropped ? image.locator("xpath=..") : image;
  /* Studio 가 Preview 위에 그리는 테두리·드래그 판(삼분선·옅은 막)은
     사진이 아니다 — 찍는 동안만 가린다(Preview 문서는 건드리지 않는다). */
  const page = frame.page();
  const toggleLayer = (hide) => page.evaluate((h) => {
    const layer = document.getElementById("studioInspectorLayer");
    if (layer) layer.style.visibility = h ? "hidden" : "";
  }, hide).catch(() => {});
  /* 좁은 Studio 에서는 상단 도구 모음이 Preview 위쪽을 덮는다 —
     프레임을 Preview 가운데로 옮겨 찍는다(스크롤만, 스킨은 그대로). */
  await image.evaluate((el) => {
    (el.parentElement || el).scrollIntoView({ block: "center", inline: "nearest" });
  });
  await sleep(120);
  await toggleLayer(true);
  const box = await target.boundingBox();
  if (!box || box.height > 12000 || box.width > 12000) {
    await toggleLayer(false);
    return null;
  }
  let buffer;
  try {
    buffer = await target.screenshot();
  } catch (err) {
    /* WebKit 은 요소가 아니라 문서 전체 높이로 한계를 재는 경우가 있다 —
       위와 같은 경우(끝없이 자란 sandbox hero)만 넘긴다 */
    if (/larger than 32767/.test(String(err && err.message))) return null;
    throw err;
  } finally {
    await toggleLayer(false);
  }
  if (SHOT_DIR && name) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), buffer);
  }
  const png = decodePng(buffer);
  return SAMPLE_POINTS.map(([fx, fy]) => png.at(fx, fy));
}

function colorDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/* 찍힌 색이 기하가 말하는 색과 같은가 — "숫자만 바뀌고 픽셀은 그대로"를 잡는다 */
function pixelsMatchGeometry(geo, pixels, tolerance, only) {
  return SAMPLE_POINTS.every(([fx, fy], index) => {
    if (only && !only.includes(index)) return true;
    const want = expectedColor(geo, fx, fy);
    return want && colorDistance(want, pixels[index]) <= (tolerance || 14);
  });
}

function pixelsClose(a, b, tolerance) {
  if (!a || !b) return false;
  return a.length === b.length && a.every((color, index) => colorDistance(color, b[index]) <= (tolerance || 10));
}

function pixelsDiffer(a, b, atLeast) {
  return a.some((color, index) => colorDistance(color, b[index]) >= (atLeast || 30));
}

/* 자르기 값이 정하는 기하(프레임 기준 비율) */
function expectedRel(crop) {
  const z = crop.zoom / 100;
  const x = crop.x / 100;
  const y = crop.y / 100;
  return {
    left: -(z - 1) * (1 + x) / 2,
    top: -(z - 1) * (1 + y) / 2,
    width: z,
    height: z,
    position: `${50 + 50 * x}% ${50 + 50 * y}%`
  };
}

function relMatches(geo, crop, tolerance) {
  const want = expectedRel(crop);
  const t = tolerance === undefined ? 0.004 : tolerance;
  return !!geo && geo.cropped &&
    near(geo.rel.left, want.left, t) && near(geo.rel.top, want.top, t) &&
    near(geo.rel.width, want.width, t) && near(geo.rel.height, want.height, t) &&
    geo.fit === "cover" && geo.position === want.position;
}

function relSame(a, b, tolerance) {
  const t = tolerance === undefined ? 0.004 : tolerance;
  return !!a && !!b && a.cropped === b.cropped &&
    near(a.rel.left, b.rel.left, t) && near(a.rel.top, b.rel.top, t) &&
    near(a.rel.width, b.rel.width, t) && near(a.rel.height, b.rel.height, t) &&
    a.fit === b.fit && a.position === b.position;
}

const brief = (geo) => geo ? JSON.stringify({ cropped: geo.cropped, marker: geo.marker, frame: geo.frame, rel: geo.rel, fit: geo.fit, position: geo.position }) : "null";


/* =========================================================
   [strong] 스킨의 !important 여섯 가지 — 결과가 같다
========================================================== */

const CROP_P = { zoom: 181, x: -50, y: 40 };
const CROP_L = { zoom: 150, x: 60, y: -30 };

async function runStrong(browser) {

  console.log("\n[strong] 스킨이 사진에 !important 를 걸어도 자르기가 이긴다");

  const outcome = {};

  for (const [variant, extra] of Object.entries(STRONG_VARIANTS)) {

    const { ctx, page } = await openStudio(browser, { pkg: cropSkin(extra), slots: SHOT_SLOTS, label: `strong-${variant}` });

    try {

      const preview = await waitIn(page, previewFrameOf, ".cp-photo-p");
      await waitIn(page, previewFrameOf, ".cp-photo-l");

      const before = await measure(preview, ".cp-photo-p");

      await enableSelect(page, ".cp-photo-p");
      await cropWith(page, ".cp-photo-p", CROP_P);
      await cropWith(page, ".cp-photo-l", CROP_L);
      await disableSelect(page);
      await sleep(300);

      const p = await measure(preview, ".cp-photo-p");
      const l = await measure(preview, ".cp-photo-l");

      outcome[variant] = {
        before,
        p,
        l,
        pPixels: await framePixels(preview, p, `strong-${variant}-portrait`),
        lPixels: await framePixels(preview, l, `strong-${variant}-landscape`)
      };

    } finally {
      await ctx.close();
    }

  }

  const plain = outcome.plain;

  record(
    "1. 일반 스킨에서 확대 181% — 사진 상자가 프레임의 1.81배로 그려지고 위치도 값대로(세로 사진 · 세로 프레임)",
    relMatches(plain.p, CROP_P) && near(plain.p.frame.width, 240, 1) && near(plain.p.frame.height, 320, 1),
    brief(plain.p)
  );

  record(
    "1b. 찍은 픽셀이 그 기하에서 사진이 그려진 색과 같다(확대 전 픽셀과는 다르다)",
    pixelsMatchGeometry(plain.p, plain.pPixels) && pixelsMatchGeometry(plain.l, plain.lPixels),
    JSON.stringify({ p: plain.pPixels, l: plain.lPixels })
  );

  record(
    "5. 세로 사진을 가로 프레임(320×180)에 — 확대 150% · 위치 값대로 · 빈틈 없음",
    relMatches(plain.l, CROP_L) && near(plain.l.frame.width, 320, 1) && near(plain.l.frame.height, 180, 1),
    brief(plain.l)
  );

  record(
    "4. 세로 사진을 세로 프레임(240×320)에 — 프레임이 스킨의 자리 그대로(부모를 채우는 방식)",
    plain.p.marker === "fill" && near(plain.p.frame.width, plain.before.frame.width, 1) && near(plain.p.frame.height, plain.before.frame.height, 1),
    JSON.stringify({ marker: plain.p.marker, before: plain.before.frame, after: plain.p.frame })
  );

  const labels = {
    position: "2. object-position !important 스킨",
    transform: "3. transform !important 스킨(scale · rotate · translate)",
    all: "3b. 크기·위치·inset·max-width·object-fit·object-position·transform·aspect-ratio 전부 !important",
    contain: "6a. object-fit: contain !important 스킨",
    cover: "6b. object-fit: cover !important 스킨"
  };

  for (const variant of Object.keys(labels)) {

    const got = outcome[variant];

    record(
      `${labels[variant]} — 자른 결과(기하 · 픽셀)가 일반 스킨과 같다`,
      relMatches(got.p, CROP_P) && relMatches(got.l, CROP_L) &&
        near(got.p.frame.width, plain.p.frame.width, 1) && near(got.p.frame.height, plain.p.frame.height, 1) &&
        near(got.l.frame.width, plain.l.frame.width, 1) && near(got.l.frame.height, plain.l.frame.height, 1) &&
        got.p.transform === "none" &&
        pixelsClose(got.pPixels, plain.pPixels) && pixelsClose(got.lPixels, plain.lPixels),
      JSON.stringify({ p: got.p.rel, frame: got.p.frame, transform: got.p.transform, pixels: got.pPixels, plainPixels: plain.pPixels })
    );

  }

  record(
    "6c. contain 스킨이어도 자르기의 맞춤은 cover(자르기 값이 이긴다) · 자르기 전에는 스킨의 contain 그대로",
    outcome.contain.before.fit === "contain" && outcome.contain.p.fit === "cover",
    JSON.stringify({ before: outcome.contain.before.fit, after: outcome.contain.p.fit })
  );

  record(
    "3c. 자르기 전 사진은 스킨의 transform 을 그대로 가진다(보호 규칙은 자른 사진에만)",
    outcome.transform.before.transform !== "none" && outcome.transform.before.guards === 0,
    JSON.stringify({ transform: outcome.transform.before.transform, guards: outcome.transform.before.guards })
  );

}


/* =========================================================
   [live] 적용 전 실시간 Preview
========================================================== */

async function runLive(browser) {

  console.log("\n[live] 적용 전 실시간 Preview — 확대 · 위치 · 드래그");

  const { ctx, page } = await openStudio(browser, { pkg: cropSkin(STRONG_VARIANTS.all), slots: SHOT_SLOTS, label: "live" });

  try {

    const preview = await waitIn(page, previewFrameOf, ".cp-photo-p");
    await enableSelect(page, ".cp-photo-p");
    await selectImage(page, ".cp-photo-p");
    await openCrop(page);

    const cssBefore = (await working(page)).skinPackage.css;
    const h0 = await history(page);
    const g0 = await measure(preview, ".cp-photo-p");
    const px0 = await framePixels(preview, g0, "live-0");

    /* input 만 — 손을 떼지 않은 상태 */
    await setZoom(page, 181, false);
    const g1 = await measure(preview, ".cp-photo-p");
    const px1 = await framePixels(preview, g1, "live-181");

    record(
      "8. 확대 슬라이더를 181% 로 끄는 동안(손을 떼기 전) Preview 사진이 곧바로 1.81배 — !important 스킨에서도",
      relMatches(g1, { zoom: 181, x: 0, y: 0 }) && pixelsMatchGeometry(g1, px1) && pixelsDiffer(px0, px1),
      JSON.stringify({ rel: g1.rel, px0, px1 })
    );

    await setZoom(page, 181, true);
    await setX(page, -100, false);
    await setY(page, 100, false);
    const g2 = await measure(preview, ".cp-photo-p");
    const px2 = await framePixels(preview, g2, "live-move");

    record(
      "8b. 위치 슬라이더(좌 끝 · 아래 끝)도 끄는 동안 곧바로 — 사진의 왼쪽·아래 가장자리가 프레임에 붙는다",
      relMatches(g2, { zoom: 181, x: -100, y: 100 }) && near(g2.image.left, g2.frame.left, 0.6) &&
        near(g2.image.top + g2.image.height, g2.frame.top + g2.frame.height, 0.6) &&
        pixelsMatchGeometry(g2, px2) && pixelsDiffer(px1, px2),
      JSON.stringify({ rel: g2.rel, px2 })
    );

    /* 사진 드래그 — 실제 포인터 */
    await setX(page, 0, true);
    await setY(page, 0, true);
    const g3 = await measure(preview, ".cp-photo-p");
    const surface = await page.evaluate(() => {
      const el = document.getElementById("studioInspectorCropSurface");
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: r.width };
    });
    await page.mouse.move(surface.x, surface.y);
    await page.mouse.down();
    for (let step = 1; step <= 4; step++) {
      await page.mouse.move(surface.x + (30 * step) / 4, surface.y + (20 * step) / 4);
      await sleep(40);
    }
    await sleep(120);
    const g4 = await measure(preview, ".cp-photo-p");
    await page.mouse.up();
    await sleep(300);

    record(
      "8c. 사진을 끄는 동안(손을 떼기 전) 사진이 포인터를 따라 오른쪽·아래로 30·20px 움직인다",
      near(g4.image.left - g3.image.left, 30, 1.5) && near(g4.image.top - g3.image.top, 20, 1.5),
      JSON.stringify({ dx: g4.image.left - g3.image.left, dy: g4.image.top - g3.image.top })
    );

    const cssDuring = (await working(page)).skinPackage.css;
    const h1 = await history(page);

    record(
      "8d. 적용 전에는 working draft 도 기록도 그대로(임시 미리보기만)",
      cssDuring === cssBefore && h1.undo === h0.undo,
      JSON.stringify({ h0, h1 })
    );

  } finally {
    await ctx.close();
  }

}


/* =========================================================
   [positions] 좌·중앙·우 × 상·중앙·하
========================================================== */

async function runPositions(browser) {

  console.log("\n[positions] 위치 아홉 자리(세로 사진 · 가로 프레임 · 확대 150%)");

  const { ctx, page } = await openStudio(browser, { pkg: cropSkin(STRONG_VARIANTS.position), slots: SHOT_SLOTS, label: "positions" });

  try {

    const preview = await waitIn(page, previewFrameOf, ".cp-photo-l");
    await enableSelect(page, ".cp-photo-l");
    await selectImage(page, ".cp-photo-l");
    await openCrop(page);
    await setZoom(page, 150);

    const failures = [];

    for (const x of [-100, 0, 100]) {
      for (const y of [-100, 0, 100]) {
        await setX(page, x);
        await setY(page, y);
        const geo = await measure(preview, ".cp-photo-l");
        const pixels = await framePixels(preview, geo, `pos-${x}-${y}`);
        const crop = { zoom: 150, x, y };
        const edgeX = x === -100 ? near(geo.image.left, geo.frame.left, 0.6)
          : x === 100 ? near(geo.image.left + geo.image.width, geo.frame.left + geo.frame.width, 0.6)
          : near(geo.image.left + geo.image.width / 2, geo.frame.left + geo.frame.width / 2, 0.6);
        const edgeY = y === -100 ? near(geo.image.top, geo.frame.top, 0.6)
          : y === 100 ? near(geo.image.top + geo.image.height, geo.frame.top + geo.frame.height, 0.6)
          : near(geo.image.top + geo.image.height / 2, geo.frame.top + geo.frame.height / 2, 0.6);
        if (!(relMatches(geo, crop) && edgeX && edgeY && pixelsMatchGeometry(geo, pixels))) {
          failures.push({ x, y, rel: geo.rel, position: geo.position, pixels });
        }
      }
    }

    record(
      "7. 위치 좌·중앙·우 × 상·중앙·하 — 아홉 자리 모두 사진 가장자리/가운데가 프레임에 맞고 픽셀이 그 자리의 색",
      failures.length === 0,
      failures.length ? JSON.stringify(failures[0]) : "9/9"
    );

    await cancelCrop(page);

  } finally {
    await ctx.close();
  }

}


/* =========================================================
   [cancel] 취소 · 적용 · Undo/Redo
========================================================== */

async function runCancel(browser) {

  console.log("\n[cancel] 취소 · 적용 한 칸 · Undo/Redo");

  const { ctx, page } = await openStudio(browser, { pkg: cropSkin(STRONG_VARIANTS.all), slots: SHOT_SLOTS, label: "cancel" });

  try {

    const preview = await waitIn(page, previewFrameOf, ".cp-photo-p");
    await enableSelect(page, ".cp-photo-p");

    /* 먼저 한 번 잘라 둔다 — "열기 전 자르기"가 있는 상태 */
    const first = { zoom: 130, x: 20, y: -20 };
    await cropWith(page, ".cp-photo-p", first);
    const committed = await measure(preview, ".cp-photo-p");
    const committedPx = await framePixels(preview, committed, "cancel-committed");
    const cssCommitted = (await working(page)).skinPackage.css;
    const h0 = await history(page);

    await openCrop(page);
    await setZoom(page, 240);
    await setX(page, -80);
    const during = await measure(preview, ".cp-photo-p");
    await cancelCrop(page);

    const after = await measure(preview, ".cp-photo-p");
    const afterPx = await framePixels(preview, after, "cancel-after");
    const h1 = await history(page);

    record(
      "9. 취소 → 패널을 열기 전 자르기(130%)로 정확히 — 기하 · 픽셀 · draft · 기록 모두 그대로, 임시 style 흔적 없음",
      relMatches(during, { zoom: 240, x: -80, y: -20 }) &&
        relSame(after, committed, 0.0005) && pixelsClose(afterPx, committedPx, 3) &&
        (await working(page)).skinPackage.css === cssCommitted && h1.undo === h0.undo &&
        !after.styleAttr && !after.frameStyleAttr,
      JSON.stringify({ during: during.rel, after: after.rel, committed: committed.rel, style: after.styleAttr, frameStyle: after.frameStyleAttr })
    );

    /* 적용 = 한 칸 */
    await openCrop(page);
    await setZoom(page, 181);
    await setY(page, 60);
    await applyCrop(page);
    const applied = await measure(preview, ".cp-photo-p");
    const appliedPx = await framePixels(preview, applied, "cancel-applied");
    const h2 = await history(page);

    record(
      "10. 적용 → 현재 결과 확정 · 기록 정확히 한 칸",
      relMatches(applied, { zoom: 181, x: 20, y: 60 }) && h2.undo === h1.undo + 1 && pixelsMatchGeometry(applied, appliedPx),
      JSON.stringify({ rel: applied.rel, h1, h2 })
    );

    await page.click("#studioUndoButton");
    await sleep(700);
    const undone = await measure(preview, ".cp-photo-p");
    const undonePx = await framePixels(preview, undone, "cancel-undo");

    record(
      "10b. ↶ 한 번 → 앞 자르기(130%) 그대로(기하 · 픽셀)",
      relSame(undone, committed, 0.0005) && pixelsClose(undonePx, committedPx, 3) && (await working(page)).skinPackage.css === cssCommitted,
      JSON.stringify({ undone: undone.rel })
    );

    await page.click("#studioRedoButton");
    await sleep(700);
    const redone = await measure(preview, ".cp-photo-p");
    const redonePx = await framePixels(preview, redone, "cancel-redo");

    record(
      "10c. ↷ 한 번 → 181% 자르기가 다시(기하 · 픽셀)",
      relSame(redone, applied, 0.0005) && pixelsClose(redonePx, appliedPx, 3),
      JSON.stringify({ redone: redone.rel })
    );

  } finally {
    await ctx.close();
  }

}


/* =========================================================
   [persist] Save · 새로고침 · Export/Import · 네 화면
========================================================== */

/* 가라앉은 값 — 연달아 두 번 같은 값이 나올 때까지(칼럼/패널 판정은 프레임
   폭이 자리 잡은 뒤에 끝난다 — sandbox 프레임은 뜬 직후 폭이 한 번 바뀐다) */
async function settledIn(frame, fn) {
  let previous = null;
  for (let i = 0; i < 12; i++) {
    const current = JSON.stringify(await frame.evaluate(fn));
    if (current === previous) return JSON.parse(current);
    previous = current;
    await sleep(150);
  }
  return JSON.parse(previous);
}

/* extraFn(선택) — 네 문서에서 똑같이 돌려 screens[kind].extra 에 담는다 */
async function fourScreens(browser, pkg, slotValues, slots, selectors, viewport, labelPrefix, extraFn) {

  const screens = {};

  /* Studio native */
  {
    const { ctx, page } = await openStudio(browser, { pkg, slots, label: `${labelPrefix}-studio-native`, viewport });
    try {
      const frame = await waitIn(page, previewFrameOf, selectors[0]);
      screens.studioNative = {};
      if (extraFn) screens.studioNative.extra = await settledIn(frame, extraFn);
      for (const sel of selectors) {
        const geo = await measure(frame, sel);
        screens.studioNative[sel] = { geo, px: await framePixels(frame, geo, `${labelPrefix}-studio-native-${sel.replace(/\W/g, "")}`) };
      }
    } finally { await ctx.close(); }
  }

  /* Studio sandbox */
  {
    const { ctx, page } = await openStudio(browser, { pkg, slots, sandbox: true, label: `${labelPrefix}-studio-sandbox`, viewport });
    try {
      const frame = await waitIn(page, sandboxFrameOf, selectors[0], 20000);
      screens.studioSandbox = {};
      if (extraFn) screens.studioSandbox.extra = await settledIn(frame, extraFn);
      for (const sel of selectors) {
        const geo = await measure(frame, sel);
        screens.studioSandbox[sel] = { geo, px: await framePixels(frame, geo, `${labelPrefix}-studio-sandbox-${sel.replace(/\W/g, "")}`) };
      }
    } finally { await ctx.close(); }
  }

  /* 공개 native / sandbox */
  for (const sandbox of [false, true]) {
    const { ctx, page } = await openPublic(browser, pkg, slotValues, { sandbox, viewport });
    try {
      const frame = sandbox
        ? await waitIn(page, sandboxFrameOf, selectors[0], 20000)
        : await waitIn(page, (p) => p.mainFrame(), `#themeMount ${selectors[0]}`, 20000);
      const key = sandbox ? "publicSandbox" : "publicNative";
      screens[key] = { sandboxFrames: await page.locator("iframe[data-imory-sandbox-frame]").count() };
      if (extraFn) screens[key].extra = await settledIn(frame, extraFn);
      for (const sel of selectors) {
        const geo = await measure(frame, sandbox ? sel : `#themeMount ${sel}`);
        screens[key][sel] = { geo, px: await framePixels(frame, geo, `${labelPrefix}-${key}-${sel.replace(/\W/g, "")}`) };
      }
    } finally { await ctx.close(); }
  }

  return screens;

}

async function runPersist(browser) {

  console.log("\n[persist] Save → 새로 열기 · Export → Import · 네 화면");

  const pkg = cropSkin(STRONG_VARIANTS.all);

  const { ctx, page } = await openStudio(browser, { pkg, slots: SHOT_SLOTS, label: "persist" });

  let saved;
  let exportedText;
  let studio;

  try {

    const preview = await waitIn(page, previewFrameOf, ".cp-photo-p");
    await enableSelect(page, ".cp-photo-p");
    await cropWith(page, ".cp-photo-p", CROP_P);
    await cropWith(page, ".cp-photo-l", CROP_L);
    await disableSelect(page);
    await sleep(300);

    studio = {
      p: await measure(preview, ".cp-photo-p"),
      l: await measure(preview, ".cp-photo-l")
    };
    studio.pPx = await framePixels(preview, studio.p, "persist-studio-p");
    studio.lPx = await framePixels(preview, studio.l, "persist-studio-l");

    saved = await saveDraft(page);
    exportedText = await exportPackage(page);

  } finally {
    await ctx.close();
  }

  const exported = JSON.parse(exportedText);

  record(
    "13a. 스킨 CSS 는 그대로 — 스킨의 !important 규칙이 저장물·Export 에 한 글자도 안 바뀌고 남아 있고, 보호 규칙(@layer)은 저장되지 않는다",
    saved && saved.css.indexOf(STRONG_VARIANTS.all) !== -1 && exported.css.indexOf(STRONG_VARIANTS.all) !== -1 &&
      saved.css.indexOf("@layer") === -1 && exported.css.indexOf("@layer") === -1,
    `saved ${saved ? saved.css.length : 0} chars`
  );

  /* 저장한 draft 로 새로 연다 */
  {
    const { ctx: c2, page: p2 } = await openStudio(browser, { pkg: saved, slots: SHOT_SLOTS, label: "persist-reload" });
    try {
      const preview = await waitIn(p2, previewFrameOf, ".cp-photo-p");
      await waitIn(p2, previewFrameOf, ".cp-photo-l");
      const p = await measure(preview, ".cp-photo-p");
      const l = await measure(preview, ".cp-photo-l");
      const pPx = await framePixels(preview, p, "persist-reload-p");
      const lPx = await framePixels(preview, l, "persist-reload-l");
      record(
        "11. Save → 새로 열기 — 두 사진의 자르기 기하와 픽셀이 그대로",
        relSame(p, studio.p) && relSame(l, studio.l) && pixelsClose(pPx, studio.pPx, 4) && pixelsClose(lPx, studio.lPx, 4) && relMatches(p, CROP_P),
        JSON.stringify({ p: p.rel, l: l.rel })
      );

      /* 다시 자르기를 열면 저장된 값이 채워진다 */
      await enableSelect(p2, ".cp-photo-p");
      await selectImage(p2, ".cp-photo-p");
      await openCrop(p2);
      const draft = await p2.evaluate(() => window.getStudioInspectorState().cropDraft);
      record(
        "11b. 다시 연 Studio 에서 자르기를 열면 181% · 위치 · 채우기 방식이 그대로 채워진다(화면은 안 바뀐다)",
        draft && near(draft.zoom, 1.81, 0.001) && near(draft.x, -0.5, 0.001) && near(draft.y, 0.4, 0.001) && draft.fill === "absolute" &&
          relSame(await measure(preview, ".cp-photo-p"), p),
        JSON.stringify(draft)
      );
      await cancelCrop(p2);
    } finally { await c2.close(); }
  }

  /* Export → 처음 상태 Studio 에 Import */
  {
    const { ctx: c3, page: p3 } = await openStudio(browser, { pkg: cropSkin(""), slots: SHOT_SLOTS, label: "persist-import" });
    try {
      await waitIn(p3, previewFrameOf, ".cp-photo-p");
      await importText(p3, exportedText);
      const preview = await waitIn(p3, previewFrameOf, ".cp-photo-p");
      await sleep(400);
      const p = await measure(preview, ".cp-photo-p");
      const l = await measure(preview, ".cp-photo-l");
      const pPx = await framePixels(preview, p, "persist-import-p");
      record(
        "12. Export → 다시 Import — 자르기 기하 · 픽셀 · 스킨 CSS 가 같다",
        relSame(p, studio.p) && relSame(l, studio.l) && pixelsClose(pPx, studio.pPx, 4) &&
          (await working(p3)).skinPackage.css === exported.css,
        JSON.stringify({ p: p.rel, l: l.rel })
      );
    } finally { await c3.close(); }
  }

  /* 네 화면 */
  const screens = await fourScreens(browser, saved, { shot: PORTRAIT_URL }, SHOT_SLOTS, [".cp-photo-p", ".cp-photo-l"], { width: 1280, height: 900 }, "persist");

  const kinds = ["studioNative", "studioSandbox", "publicNative", "publicSandbox"];
  const base = screens.studioNative;

  const detail = {};
  let same = true;
  for (const kind of kinds) {
    for (const sel of [".cp-photo-p", ".cp-photo-l"]) {
      const got = screens[kind][sel];
      const ok = relSame(got.geo, base[sel].geo) && near(got.geo.frame.width, base[sel].geo.frame.width, 1) &&
        near(got.geo.frame.height, base[sel].geo.frame.height, 1) && pixelsClose(got.px, base[sel].px, 6) &&
        pixelsMatchGeometry(got.geo, got.px) && got.geo.guards === 1;
      detail[`${kind}${sel}`] = ok ? "ok" : { rel: got.geo.rel, frame: got.geo.frame, px: got.px, guards: got.geo.guards };
      same = same && ok;
    }
  }

  record(
    "13. native · sandbox · 공개(native/sandbox) 네 화면에서 같은 자르기 — 기하 · 픽셀 · 보호 규칙 1벌",
    same && screens.publicSandbox.sandboxFrames === 1 && screens.publicNative.sandboxFrames === 0,
    JSON.stringify(detail)
  );

}


/* =========================================================
   [mobile] 390px Studio — 시트 세 단계
========================================================== */

async function runMobile(browser) {

  console.log("\n[mobile] 390px Studio — 접힘 · 내용 보기 · 전체 화면 시트에서 자르기");

  const { ctx, page } = await openStudio(browser, {
    pkg: cropSkin(STRONG_VARIANTS.all),
    slots: SHOT_SLOTS,
    viewport: { width: 390, height: 844 },
    label: "mobile"
  });

  try {

    const preview = await waitIn(page, previewFrameOf, ".cp-photo-p");
    await enableSelect(page, ".cp-photo-p");
    await selectImage(page, ".cp-photo-p");

    const s0 = await page.evaluate(() => window.getStudioSheetState());
    if (s0 === "peek") {
      await page.click("#studioLeftPanelSheetUp");
      await sleep(300);
    }
    const s1 = await page.evaluate(() => window.getStudioSheetState());

    await page.locator("#studioInspectorCropOpen").scrollIntoViewIfNeeded();
    await openCrop(page);

    await setZoom(page, 181, false);
    const live = await measure(preview, ".cp-photo-p");

    /* 내용 보기 시트가 Preview 아래쪽을 덮으므로 픽셀은 접힌 뒤(14b)에 찍는다 */
    record(
      "14. 390px · 내용 보기 시트에서 확대 181% — 끄는 동안 Preview 사진이 곧바로 1.81배",
      s0 === "peek" && s1 === "content" && relMatches(live, { zoom: 181, x: 0, y: 0 }),
      JSON.stringify({ s0, s1, rel: live.rel })
    );

    /* 전체 화면으로 올려도 같은 임시 결과, 위치도 그 자리에서 */
    await page.click("#studioLeftPanelSheetUp");
    await sleep(300);
    const s2 = await page.evaluate(() => window.getStudioSheetState());
    await setZoom(page, 181, true);
    await setX(page, 100);
    const full = await measure(preview, ".cp-photo-p");

    /* 접힘으로 내려도 자르기 임시 결과는 남는다 */
    await page.click("#studioLeftPanelSheetDown");
    await sleep(300);
    await page.click("#studioLeftPanelSheetDown");
    await sleep(300);
    const s3 = await page.evaluate(() => window.getStudioSheetState());
    const peek = await measure(preview, ".cp-photo-p");
    const peekPx = await framePixels(preview, peek, "mobile-peek");

    record(
      "14b. 전체 화면에서 위치를 바꾸고 접힘까지 내려도 Preview 의 자르기(181% · 오른쪽 끝)가 그대로 — 찍힌 픽셀도 그 자리",
      s2 === "full" && s3 === "peek" && relMatches(full, { zoom: 181, x: 100, y: 0 }) && relSame(peek, full, 0.0005) &&
        /* 390px Studio 는 상단 도구 모음이 Preview 위쪽을 덮는다 — 가운데·아래 세 점만 */
        pixelsMatchGeometry(peek, peekPx, 14, [2, 3, 4]),
      JSON.stringify({ s2, s3, full: full.rel, peek: peek.rel })
    );

    await page.click("#studioLeftPanelSheetUp");
    await sleep(300);
    await page.locator("#studioInspectorCropApply").scrollIntoViewIfNeeded();
    await applyCrop(page);
    const applied = await measure(preview, ".cp-photo-p");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    record(
      "14c. 적용 뒤에도 같은 자르기 · Studio 가로 넘침 0",
      relMatches(applied, { zoom: 181, x: 100, y: 0 }) && applied.guards === 1 && overflow <= 0,
      JSON.stringify({ rel: applied.rel, overflow })
    );

  } finally {
    await ctx.close();
  }

}


/* =========================================================
   [foe] FOREVER, MY FOE 실제 fixture
========================================================== */

const FOE_IMG = ".foe-photo img";
const FOE_CROP = { zoom: 181, x: 40, y: -30 };

async function runFoe(browser) {

  console.log("\n[foe] FOREVER, MY FOE — header 사진 181% · 위치 · 저장 · 공개");

  const { ctx, page } = await openStudio(browser, { label: "foe", mobilePreview: true });

  let saved;
  let exportedText;
  let studio;

  try {

    await importText(page, FOE_TEXT);
    const importedCss = (await working(page)).skinPackage.css;

    const bound = await page.evaluate((url) => window.setStudioImageSlot("header", { id: "img-header", public_url: url }), PORTRAIT_URL);
    const preview = await waitIn(page, previewFrameOf, FOE_IMG);
    await sleep(500);

    const before = await measure(preview, FOE_IMG);
    const beforePx = await framePixels(preview, before, "foe-before");
    const hero = await preview.evaluate(() => {
      const r = document.querySelector(".foe-photo").getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

    record(
      "15a. FOE Import · header 슬롯에 세로 사진 — 자르기 전에는 스킨 디자인 그대로(cover · center 30%(모바일) · 보호 규칙 없음)",
      bound === true && before.loaded && !before.cropped && before.fit === "cover" && before.position === "50% 30%" && before.guards === 0,
      JSON.stringify({ bound, fit: before.fit, position: before.position, guards: before.guards, frame: before.frame })
    );

    await enableSelect(page, FOE_IMG);
    await selectImage(page, FOE_IMG);
    await openCrop(page);

    await setZoom(page, 181, false);
    const live = await measure(preview, FOE_IMG);
    const livePx = await framePixels(preview, live, "foe-live");

    record(
      "15b. ★ MOBILE Preview 에서 확대 100% → 181% — 끄는 동안 hero 사진이 곧바로 1.81배(숫자만이 아니라 픽셀도 바뀐다)",
      relMatches(live, { zoom: 181, x: 0, y: 0 }) && pixelsDiffer(beforePx, livePx, 12) &&
        near(live.frame.width, hero.width, 1) && near(live.frame.height, hero.height, 1),
      JSON.stringify({ rel: live.rel, frame: live.frame, hero, beforePx, livePx })
    );

    await setZoom(page, 181, true);
    await setX(page, FOE_CROP.x);
    await setY(page, FOE_CROP.y);
    const moved = await measure(preview, FOE_IMG);
    const movedPx = await framePixels(preview, moved, "foe-moved");

    record(
      "15c. 좌우·상하 위치도 곧바로 반영",
      relMatches(moved, FOE_CROP) && pixelsDiffer(livePx, movedPx, 8),
      JSON.stringify({ rel: moved.rel, position: moved.position })
    );

    const h0 = await history(page);
    await applyCrop(page);
    const h1 = await history(page);
    const applied = await measure(preview, FOE_IMG);

    const skinCss = (await working(page)).skinPackage.css;

    record(
      "15d. 적용 → 기록 한 칸 · 같은 자르기 · 프레임은 hero 를 채우는 방식(fill-absolute)이라 데스크톱에서도 hero 전체",
      h1.undo === h0.undo + 1 && relMatches(applied, FOE_CROP) && applied.marker === "fill-absolute" && applied.guards === 1 &&
        near(applied.frame.width, hero.width, 1) && near(applied.frame.height, hero.height, 1),
      JSON.stringify({ h0, h1, marker: applied.marker, frame: applied.frame, hero })
    );

    record(
      "15e. 스킨 CSS 의 .foe-photo img{…!important} 는 그대로 남아 있다(지우거나 바꾸지 않았다)",
      importedCss.indexOf(".foe-photo img{display:block;width:100%!important;max-width:none!important;height:100%!important;margin:0!important;object-fit:cover!important;object-position:center 29%!important") !== -1 &&
        skinCss.indexOf(".foe-photo img{display:block;width:100%!important;max-width:none!important;height:100%!important;margin:0!important;object-fit:cover!important;object-position:center 29%!important") !== -1 &&
        skinCss.indexOf("@layer") === -1,
      `${skinCss.length} chars`
    );

    /* Desktop Preview 로 바꿔도 hero 전체를 채운다 */
    await disableSelect(page);
    await page.click('[data-viewport-mode="desktop"]');
    await sleep(800);
    const desktop = await measure(preview, FOE_IMG);
    const desktopHero = await preview.evaluate(() => {
      const r = document.querySelector(".foe-photo").getBoundingClientRect();
      return { width: r.width, height: r.height };
    });

    record(
      "15f. DESKTOP Preview 로 바꿔도 같은 자르기 값 · 프레임이 넓어진 hero 전체(px 폭을 굽지 않았다)",
      relMatches(desktop, FOE_CROP) && near(desktop.frame.width, desktopHero.width, 1) && near(desktop.frame.height, desktopHero.height, 1) &&
        desktop.frame.width > hero.width + 100,
      JSON.stringify({ frame: desktop.frame, desktopHero })
    );

    studio = { mobile: applied, desktop };

    saved = await saveDraft(page);
    exportedText = await exportPackage(page);

    await page.click("#studioPublishButton");
    await page.waitForSelector(".studio-confirm-overlay:not([hidden])", { timeout: 8000 }).catch(() => {});
    const confirmButton = await page.$(".studio-confirm-button--primary");
    if (confirmButton) await confirmButton.click();
    await sleep(1500);
    const published = await page.evaluate(() => {
      const s = document.getElementById("studioSaveStatus") || document.querySelector("[data-studio-save-status]");
      return s ? s.textContent : "";
    });
    studio.published = published;

  } finally {
    await ctx.close();
  }

  /* 저장 → 새로고침 */
  {
    const { ctx: c2, page: p2 } = await openStudio(browser, { pkg: saved, slots: FOE_SLOTS, label: "foe-reload", mobilePreview: true });
    try {
      const preview = await waitIn(p2, previewFrameOf, FOE_IMG);
      await sleep(400);
      const geo = await measure(preview, FOE_IMG);
      record(
        "15g. Save → 새로 열기(MOBILE) — 같은 자르기 · 같은 프레임",
        relSame(geo, studio.mobile) && near(geo.frame.width, studio.mobile.frame.width, 1) && near(geo.frame.height, studio.mobile.frame.height, 1),
        brief(geo)
      );
    } finally { await c2.close(); }
  }

  /* Export → Import */
  {
    const { ctx: c3, page: p3 } = await openStudio(browser, { label: "foe-import", mobilePreview: true, slots: FOE_SLOTS });
    try {
      await importText(p3, exportedText);
      await p3.evaluate((url) => window.setStudioImageSlot("header", { id: "img-header", public_url: url }), PORTRAIT_URL);
      const preview = await waitIn(p3, previewFrameOf, FOE_IMG);
      await sleep(400);
      const geo = await measure(preview, FOE_IMG);
      record("15h. Export → 다시 Import — 같은 자르기", relSame(geo, studio.mobile), brief(geo));
    } finally { await c3.close(); }
  }

  /* 네 화면 — 390 과 1280 두 폭 */
  const pkg = JSON.parse(JSON.stringify(saved));
  pkg.renderMode = "sandbox";

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {

    const screens = await fourScreens(browser, pkg, { header: PORTRAIT_URL }, FOE_SLOTS, [FOE_IMG], viewport, `foe-${viewport.width}`);

    const detail = {};
    let ok = true;

    for (const kind of ["studioNative", "studioSandbox", "publicNative", "publicSandbox"]) {
      const geo = screens[kind][FOE_IMG].geo;
      const pass = relMatches(geo, FOE_CROP) && geo.marker === "fill-absolute" && geo.guards === 1;
      detail[kind] = pass ? "ok" : brief(geo);
      ok = ok && pass;
    }

    /*
      공개 native/sandbox 픽셀 비교는 hero 크기가 같을 때만 뜻이 있다.
      FOE 의 hero 는 높이를 vh 로 정하는데, sandbox 프레임은 높이가
      내용을 따라가는 iframe 이라 그 안의 vh 가 공개 화면과 다르다
      (IMORY_SANDBOX_SKIN_DESIGN.md H-9 — 자르기와 무관한 기존 차이,
      이 라운드 범위 밖). 그때는 자르기 값(프레임 대비 비율)만 견준다.
      네 화면의 픽셀 일치는 고정 크기 프레임인 [persist] 13 이 본다.
    */
    const pn = screens.publicNative[FOE_IMG];
    const ps = screens.publicSandbox[FOE_IMG];
    const sameHero = near(pn.geo.frame.width, ps.geo.frame.width, 1) && near(pn.geo.frame.height, ps.geo.frame.height, 1);
    const pixelsSame = !sameHero || pixelsClose(pn.px, ps.px, 8);

    record(
      `15i. 공개 화면 ${viewport.width}px — Studio native/sandbox · 공개 native/sandbox 모두 181% · 같은 위치 · hero 를 채우는 프레임(hero 크기가 같으면 픽셀까지 같다)`,
      ok && pixelsSame && screens.publicSandbox.sandboxFrames === 1,
      JSON.stringify({ detail, sameHero, frames: screens.publicSandbox.sandboxFrames, pnFrame: pn.geo.frame, psFrame: ps.geo.frame, pn: pn.px, ps: ps.px })
    );

  }

  record(
    "15j. Publish — 상태가 '저장됨'(저장한 draft = 공개본). 공개 화면은 그 draft 로 위 15i 에서 열었다",
    typeof studio.published === "string" && studio.published.indexOf("저장됨") === 0,
    studio.published
  );

}


/* =========================================================
   [editorial] 아이모리 기본 스킨 — 사진 슬롯 자르기 · 스킨 설정 ·
   저장 · 공개 · 네 화면 (EDITORIAL-DEFAULT-SKIN-2)

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md

   기본 스킨(3단)에 세로 사진 셋 → 세 장 구성. 주인 설정(색 네 역할 ·
   D-day · 모바일에서 좌우 영역 끔)을 Studio 진입점으로 고르고, 가운데
   사진(photo_2)을 자른다. 그 저장물이 Save → 새로 열기 · Export →
   Import · Publish 를 지나 Studio native/sandbox · 공개 native/sandbox
   네 화면에서 같은 구성 · 같은 색 · 같은 D-day · 같은 자르기인가.
========================================================== */

const EDITORIAL_IMG = ".ied-photo--2 .ied-photo-img";
const EDITORIAL_CROP = { zoom: 170, x: 30, y: 40 };
const EDITORIAL_SLOTS = {
  photo_1: { imageId: "img-p1", imageUrl: PORTRAIT_URL },
  photo_2: { imageId: "img-p2", imageUrl: PORTRAIT_URL },
  photo_3: { imageId: "img-p3", imageUrl: PORTRAIT_URL }
};
const EDITORIAL_SLOT_VALUES = { photo_1: PORTRAIT_URL, photo_2: PORTRAIT_URL, photo_3: PORTRAIT_URL };
const EDITORIAL_COLORS = { background: "#fbf7f1", text: "#2a1d14", accent: "#7a2e2e", accent2: "#b89a86" };

const editorialLib = (() => {
  const req = createRequire(import.meta.url);
  return req(path.join(ROOT, "skin", "skin-default-editorial.js"));
})();

/* 문서 안에서 도는 함수 — 기본 스킨의 설정이 그려진 모양 */
function readEditorialInDocument() {
  const set = document.querySelector('[data-imory-photos="set"]');
  const sheet = document.querySelector(".ied-sheet");
  const dday = document.querySelector(".ied-dday");
  return {
    layout: set && set.getAttribute("data-imory-photos-layout"),
    count: set && set.getAttribute("data-imory-photos-count"),
    bg: sheet && getComputedStyle(sheet).backgroundColor,
    title: document.querySelector(".ied-title") && getComputedStyle(document.querySelector(".ied-title")).color,
    dday: dday && !dday.hidden ? document.querySelector(".ied-dday-num").textContent : null,
    ddayLabel: dday && !dday.hidden ? document.querySelector(".ied-dday-label").textContent : null,
    sides: sheet && sheet.getAttribute("data-imory-sides-layout"),
    on: sheet && sheet.getAttribute("data-imory-sides-on"),
    openers: Array.from(document.querySelectorAll(".ied-main [data-imory-sides-open]"))
      .filter((el) => getComputedStyle(el).display !== "none").length
  };
}

async function runEditorial(browser) {

  console.log("\n[editorial] 아이모리 기본 스킨 — 사진 슬롯 자르기 · 설정 · 저장 · 공개 · 네 화면");

  const base = editorialLib.createImoryEditorialDefaultSkin({ columns: 3 });

  const { ctx, page } = await openStudio(browser, { pkg: base, slots: EDITORIAL_SLOTS, label: "editorial" });

  let saved;
  let exportedText;
  let studioGeo;
  let publishedStatus = "";

  const ddayDate = "2024-09-21";

  try {

    const preview = await waitIn(page, previewFrameOf, EDITORIAL_IMG);
    await sleep(400);

    const first = await preview.evaluate(readEditorialInDocument);
    record("E1. 기본 스킨 · 사진 셋 → 세 장(triptych) · 3단 칼럼", first.layout === "triptych" && first.count === "3" && first.sides === "columns", JSON.stringify(first));

    const results = await page.evaluate(([colors, date]) => [
      window.setStudioHomeSetting("colors", colors),
      window.setStudioHomeSetting("dday", { enabled: true, date, label: "since we met" }),
      window.setStudioHomeSetting("mobile", false)
    ], [EDITORIAL_COLORS, ddayDate]);
    await sleep(600);
    const set = await (await waitIn(page, previewFrameOf, EDITORIAL_IMG)).evaluate(readEditorialInDocument);
    record("E2. Studio 설정(색 · D-day · 모바일) → Preview 에 곧바로",
      results.every((r) => r && r.ok) && set.bg === "rgb(251, 247, 241)" && set.title === "rgb(122, 46, 46)" && /^\d[\d,]*$/.test(set.dday || "") && set.ddayLabel === "since we met",
      JSON.stringify({ results, set }));

    await enableSelect(page, EDITORIAL_IMG);
    const h0 = await history(page);
    await cropWith(page, EDITORIAL_IMG, EDITORIAL_CROP);
    const h1 = await history(page);
    studioGeo = await measure(await waitIn(page, previewFrameOf, EDITORIAL_IMG), EDITORIAL_IMG);
    record("E3. 가운데 사진(photo_2 슬롯)을 자른다 — 기록 한 칸 · 같은 자르기 · 사진 칸을 채운다",
      h1.undo === h0.undo + 1 && relMatches(studioGeo, EDITORIAL_CROP) && studioGeo.guards === 1 && studioGeo.cropped,
      JSON.stringify({ h0, h1, geo: brief(studioGeo) }));

    /* 자른 뒤에도 구성은 그대로 · 설정도 그대로 */
    const afterCrop = await (await waitIn(page, previewFrameOf, EDITORIAL_IMG)).evaluate(readEditorialInDocument);
    record("E4. 자른 뒤에도 세 장 구성 · 색 · D-day 그대로", afterCrop.layout === "triptych" && afterCrop.bg === set.bg && afterCrop.dday === set.dday, JSON.stringify(afterCrop));

    await disableSelect(page);

    saved = await saveDraft(page);
    const names = (saved.regions || []).map((e) => e && e.name);
    record("E5. Save — regions 에 설정 넷(단 구성 · 모바일 · 색 · D-day) · 자르기 규칙은 CSS 에",
      names.includes("theme_colors") && names.includes("dday") &&
        saved.regions.find((e) => e.name === "right_sidebar").mobile === false &&
        JSON.stringify(saved.regions.find((e) => e.name === "theme_colors").colors) === JSON.stringify(EDITORIAL_COLORS) &&
        /--imory-crop|imory-crop/.test(saved.css) && !/data-imory-photos-(layout|state|position)/.test(JSON.stringify(saved.templates)),
      JSON.stringify(saved.regions));

    exportedText = await exportPackage(page);
    const exported = JSON.parse(exportedText);
    record("E6. Export — 같은 regions · 슬롯 선언",
      JSON.stringify(exported.regions) === JSON.stringify(saved.regions) &&
        JSON.stringify(exported.imageSlots.map((s) => s.name)) === JSON.stringify(["photo_1", "photo_2", "photo_3", "photo_4", "pair_photo"]),
      JSON.stringify(exported.regions));

    await page.click("#studioPublishButton");
    await page.waitForSelector(".studio-confirm-overlay:not([hidden])", { timeout: 8000 }).catch(() => {});
    const confirmButton = await page.$(".studio-confirm-button--primary");
    if (confirmButton) await confirmButton.click();
    await sleep(1500);
    publishedStatus = await page.evaluate(() => {
      const s = document.getElementById("studioSaveStatus") || document.querySelector("[data-studio-save-status]");
      return s ? s.textContent : "";
    });

  } finally {
    await ctx.close();
  }

  /* 저장 → 새로 열기 */
  {
    const { ctx: c2, page: p2 } = await openStudio(browser, { pkg: saved, slots: EDITORIAL_SLOTS, label: "editorial-reload" });
    try {
      const preview = await waitIn(p2, previewFrameOf, EDITORIAL_IMG);
      await sleep(400);
      const geo = await measure(preview, EDITORIAL_IMG);
      const state = await preview.evaluate(readEditorialInDocument);
      const panel = await p2.evaluate(() => window.getStudioHomeSettings());
      record("E7. Save → 새로 열기 — 같은 자르기 · 같은 설정(Preview 와 Layout 패널 값)",
        relSame(geo, studioGeo) && state.layout === "triptych" && state.bg === "rgb(251, 247, 241)" && state.dday !== null &&
          JSON.stringify(panel.colors) === JSON.stringify(EDITORIAL_COLORS) && panel.dday.date === ddayDate && panel.mobilePanels === false,
        JSON.stringify({ geo: brief(geo), state, panel: { colors: panel.colors, dday: panel.dday, mobile: panel.mobilePanels } }));
    } finally { await c2.close(); }
  }

  /* Export → Import */
  {
    const { ctx: c3, page: p3 } = await openStudio(browser, { label: "editorial-import", slots: EDITORIAL_SLOTS });
    try {
      await importText(p3, exportedText);
      for (const [slot, binding] of Object.entries(EDITORIAL_SLOTS)) {
        await p3.evaluate(([name, url, id]) => window.setStudioImageSlot(name, { id, public_url: url }), [slot, binding.imageUrl, binding.imageId]);
      }
      const preview = await waitIn(p3, previewFrameOf, EDITORIAL_IMG);
      await sleep(500);
      const geo = await measure(preview, EDITORIAL_IMG);
      const state = await preview.evaluate(readEditorialInDocument);
      const regions = await p3.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.regions);
      record("E8. Export → 다시 Import — 같은 자르기 · 같은 설정",
        relSame(geo, studioGeo) && state.layout === "triptych" && state.bg === "rgb(251, 247, 241)" &&
          JSON.stringify(regions) === JSON.stringify(saved.regions),
        JSON.stringify({ geo: brief(geo), state }));
    } finally { await c3.close(); }
  }

  /* 네 화면 — 390 과 1280 */
  const pkg = JSON.parse(JSON.stringify(saved));
  pkg.renderMode = "sandbox";

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {

    const screens = await fourScreens(browser, pkg, EDITORIAL_SLOT_VALUES, EDITORIAL_SLOTS, [EDITORIAL_IMG], viewport, `editorial-${viewport.width}`, readEditorialInDocument);

    const kinds = ["studioNative", "studioSandbox", "publicNative", "publicSandbox"];
    const states = kinds.map((k) => screens[k].extra);
    const reference = JSON.stringify(states[0]);
    const cropOk = kinds.every((k) => relMatches(screens[k][EDITORIAL_IMG].geo, EDITORIAL_CROP) && screens[k][EDITORIAL_IMG].geo.guards === 1);
    const wide = viewport.width >= 1024;

    record(
      `E9. ${viewport.width}px — 네 화면이 같은 구성 · 색 · D-day · 좌우 영역(${wide ? "칼럼" : "모바일에서 끔 → 여는 버튼 0"}) · 같은 자르기`,
      states.every((s) => JSON.stringify(s) === reference) && cropOk &&
        states[0].layout === "triptych" && states[0].bg === "rgb(251, 247, 241)" && states[0].dday !== null &&
        (wide ? states[0].sides === "columns" && states[0].on === "left right" : states[0].sides === "drawer" && states[0].on === "" && states[0].openers === 0) &&
        screens.publicSandbox.sandboxFrames === 1,
      JSON.stringify({ states, crop: kinds.map((k) => brief(screens[k][EDITORIAL_IMG].geo)) })
    );

  }

  record(
    "E10. Publish — 상태가 '저장됨'(저장한 draft = 공개본). 공개 화면은 그 draft 로 위 E9 에서 열었다",
    typeof publishedStatus === "string" && publishedStatus.indexOf("저장됨") === 0,
    publishedStatus
  );

}


/* =========================================================
   [keep] 자르지 않은 이미지는 스킨 디자인 그대로
========================================================== */

async function runKeep(browser) {

  console.log("\n[keep] 자르기가 없으면 아무 것도 바뀌지 않는다");

  const pkg = cropSkin(STRONG_VARIANTS.cover, { native: true });

  const { ctx, page } = await openPublic(browser, pkg, { shot: PORTRAIT_URL }, {});

  try {

    const frame = await waitIn(page, (p) => p.mainFrame(), "#themeMount .cp-photo-p", 20000);
    const geo = await measure(frame, "#themeMount .cp-photo-p");
    const styleText = await page.evaluate(() => Array.from(document.querySelectorAll("#themeMount style")).map((s) => s.textContent).join("\n"));

    record(
      "K1. 자르지 않은 사진은 스킨의 object-fit/object-position(!important) 그대로 · 보호 규칙도 layer 선언도 없다",
      !geo.cropped && geo.fit === "cover" && geo.position === "30% 70%" && geo.guards === 0 && styleText.indexOf("@layer") === -1,
      JSON.stringify({ fit: geo.fit, position: geo.position, guards: geo.guards })
    );

  } finally {
    await ctx.close();
  }

}


/* =========================================================
   실행
========================================================== */

const playwright = await loadPlaywright(BROWSER);

const parentServer = await startServer(PARENT_PORT);
const sandboxServer = await startServer(SANDBOX_PORT);

console.log(`IMAGE-CROP-PRIORITY-1 E2E — ${BROWSER}\n  studio/public : ${PARENT_ORIGIN}\n  frame         : ${SANDBOX_ORIGIN}`);

const browser = await playwright[BROWSER].launch();

const sections = [
  ["strong", runStrong],
  ["live", runLive],
  ["positions", runPositions],
  ["cancel", runCancel],
  ["persist", runPersist],
  ["mobile", runMobile],
  ["foe", runFoe],
  ["editorial", runEditorial],
  ["keep", runKeep]
];

try {

  for (const [name, run] of sections) {
    if (!shouldRun(name)) continue;
    try {
      await run(browser);
    } catch (err) {
      record(`[${name}] 절이 끝까지 돌았다`, false, String(err && err.stack || err).split("\n").slice(0, 4).join(" | "));
    }
  }

  record("Z. 콘솔 오류 없음", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));

} finally {
  await browser.close();
  parentServer.close();
  sandboxServer.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log("FAIL:\n" + failed.map((r) => `  - ${r.name}`).join("\n"));
  process.exitCode = 1;
}
