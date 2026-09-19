/* =========================================================
   EDITORIAL-DEFAULT-SKIN-2 — 아이모리 기본 스킨 렌더 E2E

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md

   skin/skin-editorial-default-render-harness.html 에서 **실제
   renderSkin()** 이 그린 화면을 getBoundingClientRect / 계산된 스타일로
   잰다. 사진은 이 서버가 그 자리에서 만드는 색 SVG 다
   (/__test-photo/<n>.svg) — 사용자 원화는 쓰지도 커밋하지도 않는다.

   [css]       스킨 CSS 가 저장 판정(analyzeSkinCss · 스코프)에서 선언을
               하나도 잃지 않는다
   [photos]    사진 0·1·2·3·4장 → empty · hero · pair · triptych(넷째는
               접히고 슬롯은 남는다) · 직접 고른 구성 · 깨진 이미지 0
   [width]     320·390·768·1024·1280·1440 × 1·2·3단 × 사진 0~3 — 가로
               넘침 0 · 사진 묶음이 카테고리 줄 폭 안 · 제목 크기 상한 ·
               칼럼/패널 판정
   [columns]   데스크톱 1·2·3단의 칸 순서 · 세로 hairline · 겹침 0 ·
               종이가 켜진 칸 합만큼
   [palette]   밝은/어두운/주인이 고른 색 — 네 역할이 전체에 · 대비
   [long]      긴 제목 · 긴 카테고리 이름
   [empty]     신규 빈 계정 — 빈 목록 · 깨진 이미지 · 가짜 값 0, 빈 표지
   [scroll]    내용이 많으면 스크롤 · 적으면 한 화면
   [owner]     WRITE · ADMIN 은 주인에게만
   [nav]       카테고리 · 최근 글 링크가 실제 주소
   [drawer]    모바일 좌우 패널 — 열기 · Escape · 바깥 · 뒤로가기 · 포커스
               복귀 · 패널 안 스크롤 · 모바일에서 끄기
   [dday]      D-day 계산 · 없으면 접힘
   [reduced]   prefers-reduced-motion

   실행:
     node skin/skin-editorial-default-e2e-test.mjs
     node skin/skin-editorial-default-e2e-test.mjs --browser=webkit
     node skin/skin-editorial-default-e2e-test.mjs --only=photos
     IMORY_EDITORIAL_SHOT=<디렉터리> node skin/skin-editorial-default-e2e-test.mjs --only=shots
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8978;
const HARNESS = `http://localhost:${PORT}/skin/skin-editorial-default-render-harness.html`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const SHOT_DIR = process.env.IMORY_EDITORIAL_SHOT || "";

const require = createRequire(import.meta.url);
const settingsLib = require("./skin-settings.js");
const { IMORY_EDITORIAL_PALETTES } = require("./skin-default-editorial.js");


async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const dir of fs.readdirSync(npxCache)) candidates.push(path.join(npxCache, dir, "node_modules"));
  }
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  candidates.push(path.join(ROOT, "node_modules"));
  const found = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let version = "0.0.0";
    try { version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0"; } catch { /* */ }
    found.push({ entry, version });
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  const tried = [];
  for (const { entry, version } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try { const probe = await mod[browserName].launch(); await probe.close(); return mod; }
    catch (err) { tried.push(`${version}: ${String(err.message).split("\n")[0]}`); }
  }
  throw new Error(`playwright ${browserName}: ${tried.join(" / ") || "없음"}`);
}


/* ---------------------------------------------------------
   테스트 사진 — 실행 때 만드는 색 SVG. 사진마다 색이 달라서 "어느
   슬롯이 어디 그려졌나"를 픽셀로도 가를 수 있다.
--------------------------------------------------------- */

const PHOTO_COLORS = {
  "1": ["#2c3e70", "#9fb3d9"],
  "2": ["#6b2f3a", "#e3b3a8"],
  "3": ["#2f5b4a", "#b7dcc9"],
  "4": ["#5a4a1f", "#e6d49a"],
  pair: ["#3d3355", "#c9bde6"]
};

export function testPhotoSvg(key) {
  const [dark, light] = PHOTO_COLORS[key] || PHOTO_COLORS["1"];
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">' +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>` +
    '<rect width="600" height="800" fill="url(#g)"/>' +
    `<circle cx="300" cy="300" r="120" fill="${dark}" opacity="0.55"/>` +
    `<rect x="170" y="440" width="260" height="360" rx="120" fill="${dark}" opacity="0.7"/>` +
    '</svg>'
  );
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const photo = /^\/__test-photo\/([a-z0-9]+)\.svg$/.exec(url.pathname);
    if (photo) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      res.end(testPhotoSvg(photo[1]));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const abs = path.join(ROOT, rel);
    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(abs).pipe(res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}


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

const wants = (name) => (!ONLY ? name !== "shots" : ONLY === name);
const section = (name) => console.log(`\n[${name}]`);


/* =========================================================
   하네스 열기 · 그리기 · 재기
========================================================== */

async function openHarness(browser, viewport, extra) {
  const context = await browser.newContext({
    viewport: viewport || { width: 390, height: 844 },
    reducedMotion: (extra && extra.reducedMotion) || "no-preference",
    hasTouch: !!(extra && extra.hasTouch)
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(HARNESS, { waitUntil: "load" });
  await page.waitForFunction(() => window.harnessReady && document.querySelector("[data-skin-root]"));
  await page.evaluate(() => window.harnessReady);
  return { context, page, errors };
}

async function render(page, options) {
  await page.evaluate((o) => window.renderDefault({ fresh: true, ...o }), options || {});
  /* 판정(칼럼/패널)은 두 프레임 안에 끝난다 · 사진 디코드 */
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-imory-sides="frame"]');
    return !frame || frame.hasAttribute("data-imory-sides-layout");
  });
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("#mount img")).filter((img) => !img.closest("[hidden]") && img.getAttribute("src"));
    await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/* 한 번에 재는 모양 */
function measure(page) {
  return page.evaluate(() => {
    const mount = document.getElementById("mount");
    const q = (sel) => mount.querySelector(sel);
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest("[hidden]");
    };
    const frame = q('[data-imory-sides="frame"]');
    const set = q('[data-imory-photos="set"]');
    const nav = q(".ied-main .ied-nav") || q(".ied-nav");
    const shown = set ? Array.from(set.querySelectorAll('[data-imory-photos-state="shown"]')) : [];
    const title = q(".ied-title");
    const vis = (sel) => visible(q(sel));
    return {
      layout: frame && frame.getAttribute("data-imory-sides-layout"),
      on: frame && frame.getAttribute("data-imory-sides-on"),
      photosLayout: set && set.getAttribute("data-imory-photos-layout"),
      photosCount: set && Number(set.getAttribute("data-imory-photos-count")),
      photosFilled: set && Number(set.getAttribute("data-imory-photos-filled")),
      shownSlots: shown.map((el) => (el.querySelector("img") || {}).getAttribute?.("data-imory-src") || null),
      shownPositions: shown.map((el) => el.getAttribute("data-imory-photos-position")),
      rest: set ? set.querySelectorAll('[data-imory-photos-state="rest"]').length : 0,
      shownRects: shown.map((el) => rect(el.querySelector(".ied-photo-frame"))),
      shownVisible: shown.every(visible),
      setRect: rect(set),
      navRect: rect(nav),
      overflowX: Math.max(mount.scrollWidth - mount.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      scroll: { height: mount.scrollHeight, client: mount.clientHeight },
      titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : null,
      titleRect: rect(title),
      emptyVisible: vis(".ied-empty"),
      captionVisible: vis(".ied-caption"),
      brokenImages: Array.from(mount.querySelectorAll("img")).filter((img) => visible(img) && !(img.complete && img.naturalWidth > 0)).length,
      visibleImages: Array.from(mount.querySelectorAll("img")).filter(visible).length,
      areas: {
        left: rect(q('[data-imory-sides-area="left"]')),
        main: rect(q('[data-imory-sides-area="main"]')),
        right: rect(q('[data-imory-sides-area="right"]'))
      },
      areaVisible: {
        left: vis('[data-imory-sides-area="left"]'),
        right: vis('[data-imory-sides-area="right"]')
      },
      openers: {
        left: vis('.ied-main [data-imory-sides-open="left"]'),
        right: vis('.ied-main [data-imory-sides-open="right"]')
      },
      sheetRect: rect(q(".ied-sheet")),
      footRect: rect(q(".ied-main .ied-foot") || q(".ied-foot"))
    };
  });
}

async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const full = await page.evaluate(() => {
    const mount = document.getElementById("mount");
    return mount.scrollHeight;
  });
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(vp.height, full), 3000) });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
  await page.setViewportSize(vp);
}


/* =========================================================
   [shots] — 눈으로 볼 스크린샷(판정 없음)
========================================================== */

async function runShots(browser) {
  section("shots");
  const cases = [
    ["m-empty-owner", { width: 390, height: 844 }, { photos: 0, data: "empty", owner: true }],
    ["m-empty-visitor", { width: 390, height: 844 }, { photos: 0, data: "empty" }],
    ["m-hero", { width: 390, height: 844 }, { photos: 1, columns: 1 }],
    ["m-pair", { width: 390, height: 844 }, { photos: 2, columns: 2 }],
    ["m-triptych", { width: 390, height: 844 }, { photos: 3, columns: 3, owner: true }],
    ["m-320-triptych", { width: 320, height: 640 }, { photos: 3, columns: 3, data: "long" }],
    ["d-1col", { width: 1280, height: 860 }, { photos: 1, columns: 1 }],
    ["d-2col", { width: 1280, height: 860 }, { photos: 1, columns: 2, dday: { date: "2024-09-21", label: "since we met" } }],
    ["d-3col", { width: 1280, height: 860 }, { photos: 1, columns: 3, pair: true, dday: { date: "2024-09-21", label: "since we met" } }],
    ["d-3col-empty", { width: 1440, height: 900 }, { photos: 0, columns: 3, data: "empty", owner: true }],
    ["d-3col-dark", { width: 1280, height: 860 }, { photos: 3, columns: 3, pair: true, palette: "dark" }],
    ["t-768-3col", { width: 768, height: 1024 }, { photos: 2, columns: 3 }]
  ];
  for (const [name, viewport, options] of cases) {
    const { context, page } = await openHarness(browser, viewport);
    await render(page, options);
    await shot(page, name);
    await context.close();
  }
  check("스크린샷", true, SHOT_DIR || "(IMORY_EDITORIAL_SHOT 없음)");
}


/* =========================================================
   [css]
========================================================== */

async function runCss(browser) {
  section("css");
  const { context, page, errors } = await openHarness(browser, { width: 1280, height: 860 });
  const report = await page.evaluate(() => window.analyzeDefaultSkinCss());
  check("저장 판정 통과(strict)", report.ok === true, report.issues.slice(0, 3).join(" | "));
  check("잘라낸 선언 0", report.changed === false && report.issues.length === 0, report.issues.slice(0, 3).join(" | "));
  check("스코프 통과", report.scopedOk === true, report.scopedWarnings.slice(0, 3).join(" | "));
  check("스코프 뒤에도 ::first-line · clip-path · color-mix · @media 가 남는다",
    /::first-line/.test(report.scopedCss) && /clip-path/.test(report.scopedCss) &&
    /color-mix/.test(report.scopedCss) && /prefers-reduced-motion/.test(report.scopedCss));

  const css = await page.evaluate(() => window.createImoryEditorialDefaultSkin({}).css);
  const defaults = settingsLib.readSkinThemeColorDefaults(css);
  check("CSS 의 var() 기본값 = IMORY_EDITORIAL_PALETTES.light",
    JSON.stringify(defaults) === JSON.stringify(IMORY_EDITORIAL_PALETTES.light), JSON.stringify(defaults));
  check("금색 계열 포인트가 없다(UI 선 · 별 · 글자)", !/#(c9a|d4af|b8860b|daa520|ffd700|c5a)/i.test(css));
  check("CSS 배경 이미지로 사진을 숨기지 않는다", !/background(-image)?\s*:[^;]*url\(/i.test(css));
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   [photos]
========================================================== */

async function runPhotos(browser) {
  section("photos");
  const { context, page, errors } = await openHarness(browser, { width: 390, height: 844 });

  const expect = { 0: "empty", 1: "hero", 2: "pair", 3: "triptych", 4: "triptych" };

  for (let n = 0; n <= 4; n += 1) {
    await render(page, { photos: n, columns: 1 });
    const m = await measure(page);
    check(`${n}장 → ${expect[n]}`, m.photosLayout === expect[n], `${m.photosLayout} count=${m.photosCount} filled=${m.photosFilled}`);
    check(`${n}장 — 보이는 장 수 ${Math.min(n, 3)}`, m.photosCount === Math.min(n, 3) && m.shownRects.length === Math.min(n, 3));
    check(`${n}장 — 깨진 이미지 0 · 보이는 사진이 실제로 그려졌다`, m.brokenImages === 0 && m.shownVisible, `broken=${m.brokenImages}`);
    check(`${n}장 — 빈 표지는 0장일 때만`, m.emptyVisible === (n === 0));
    if (n === 4) {
      check("4장 — 넷째는 접히고(rest) 슬롯 순서대로 앞의 셋", m.rest === 1 &&
        JSON.stringify(m.shownSlots) === JSON.stringify(["images.photo_1", "images.photo_2", "images.photo_3"]), JSON.stringify(m.shownSlots));
    }
    if (n === 3) {
      const [a, b, c] = m.shownRects;
      check("세 장 — 가운데가 더 크다", b.width > a.width && b.width > c.width && b.height > a.height);
      check("세 장 — 왼쪽 · 가운데 · 오른쪽 순서", a.left < b.left && b.left < c.left);
      const overlap = Math.max(0, a.right - b.left) + Math.max(0, b.right - c.left);
      check("세 장 — 겹쳐도 살짝(각 사진 폭의 10% 이하)", overlap <= 0.1 * (a.width + c.width), `overlap=${overlap.toFixed(1)}`);
      /* 글자(번호 · 낱말)의 실제 자리 — 캡션 상자가 아니라 글자가 가려지는가 */
      const caps = await page.evaluate(() => Array.from(document.querySelectorAll('[data-imory-photos-state="shown"] .ied-photo-cap'))
        .map((c) => {
          const spans = Array.from(c.children).map((x) => x.getBoundingClientRect());
          return {
            l: Math.min(...spans.map((r) => r.left)), r: Math.max(...spans.map((r) => r.right)),
            t: Math.min(...spans.map((r) => r.top)), b: Math.max(...spans.map((r) => r.bottom)),
            vis: getComputedStyle(c).display !== "none"
          };
        }));
      const frames = m.shownRects;
      const capHitsCenter = caps.some((cap, i) => i !== 1 && cap.r > frames[1].left && cap.l < frames[1].right && cap.b > frames[1].top && cap.t < frames[1].bottom);
      check("세 장 — 번호 · 낱말이 보이고 가운데 사진에 가리지 않는다", caps.every((c) => c.vis) && !capHitsCenter);
    }
    if (n === 2) {
      const [a, b] = m.shownRects;
      const cap = await page.evaluate(() => { const r = document.querySelector(".ied-caption").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      check("두 장 — 위아래이고 문장이 사이에", a.bottom <= cap.top + 0.5 && cap.bottom <= b.top + 0.5);
      check("두 장 — 가로 사진", a.width > a.height && b.width > b.height);
    }
    if (n === 1) {
      const [a] = m.shownRects;
      check("한 장 — 세로 사진 · 가운데", a.height > a.width && Math.abs((a.left + a.right) / 2 - (m.navRect.left + m.navRect.right) / 2) < 1.5);
    }
  }

  /* 직접 고른 구성 — 채운 장 수까지만 */
  const manual = [
    [{ photos: 3, layout: "hero" }, "hero", 1],
    [{ photos: 3, layout: "pair" }, "pair", 2],
    [{ photos: 2, layout: "triptych" }, "pair", 2],
    [{ photos: 3, layout: "empty" }, "empty", 0],
    [{ photos: 0, layout: "triptych" }, "empty", 0],
    [{ photos: 4, layout: "auto" }, "triptych", 3]
  ];
  for (const [opts, layout, count] of manual) {
    await render(page, { columns: 1, ...opts });
    const m = await measure(page);
    check(`직접 고름 ${opts.layout} · 사진 ${opts.photos}장 → ${layout}`, m.photosLayout === layout && m.photosCount === count, `${m.photosLayout}/${m.photosCount}`);
  }

  /* 빈 슬롯이 앞에 있어도 채워진 것만 센다 */
  await render(page, { columns: 1, photos: 0 });
  await page.evaluate(() => {
    const pkg = window.createImoryEditorialDefaultSkin({ columns: 1 });
    return pkg;
  });
  const gap = await page.evaluate(async () => {
    const mod = await import("./skin-render.js");
    const pkg = window.createImoryEditorialDefaultSkin({ columns: 1 });
    const template = window.resolveSkinTemplate(pkg, "home");
    const box = document.createElement("div");
    document.body.appendChild(box);
    const ctx = { site: { title: "t" }, profile: {}, navigation: { home: { href: "/x" }, categories: [], highlights: {} },
      home: { recentPosts: [], highlights: { hasCard: false } }, viewer: { isOwner: false },
      images: { photo_1: null, photo_2: "/__test-photo/2.svg", photo_3: null, photo_4: "/__test-photo/4.svg" } };
    const inst = mod.renderSkin({ container: box, skin: template, context: ctx });
    const set = box.querySelector('[data-imory-photos="set"]');
    const result = {
      layout: set.getAttribute("data-imory-photos-layout"),
      shown: Array.from(set.querySelectorAll('[data-imory-photos-state="shown"] img')).map((i) => i.getAttribute("data-imory-src"))
    };
    inst.destroy();
    box.remove();
    return result;
  });
  check("비어 있는 앞 슬롯은 건너뛴다(2 · 4번만 → 두 장)", gap.layout === "pair" &&
    JSON.stringify(gap.shown) === JSON.stringify(["images.photo_2", "images.photo_4"]), JSON.stringify(gap));

  /* 저장 경계 — 런타임 속성은 저장되는 HTML 에 들어갈 수 없다 */
  const saved = await page.evaluate(() => {
    const html = '<section data-imory-photos="set" data-imory-photos-layout="pair" data-imory-photos-count="2">' +
      '<figure data-imory-photos-item data-imory-photos-state="shown" data-imory-photos-position="1"></figure>' +
      '<figure data-imory-photos-item="weird"></figure><div data-imory-photos="grid"></div></section>';
    return window.sanitizeSkinHTML(html, document);
  });
  check("저장 경계 — set · item 은 남고 런타임 · 모르는 값은 사라진다",
    /data-imory-photos="set"/.test(saved) && /data-imory-photos-item=""/.test(saved) &&
    !/photos-layout|photos-count|photos-state|photos-position|="weird"|="grid"/.test(saved), saved);

  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   [width]
========================================================== */

async function runWidth(browser) {
  section("width");
  const widths = [320, 390, 768, 1024, 1280, 1440];
  const expectLayout = (w, columns) => {
    if (columns === 1) return "columns";
    if (w <= 430) return "drawer";
    if (columns === 2) return w >= 768 ? "columns" : "drawer";
    return w >= 1024 ? "columns" : "drawer";
  };
  for (const width of widths) {
    const { context, page, errors } = await openHarness(browser, { width, height: 900 });
    let worst = { overflow: 0, photo: 0, title: 0 };
    let layoutsOk = true;
    let photoOk = true;
    let details = [];
    for (const columns of [1, 2, 3]) {
      for (const photos of [0, 1, 2, 3]) {
        await render(page, { columns, photos, pair: true });
        const m = await measure(page);
        worst.overflow = Math.max(worst.overflow, m.overflowX);
        worst.title = Math.max(worst.title, m.titleFont);
        if (m.layout !== expectLayout(width, columns)) {
          layoutsOk = false;
          details.push(`${columns}단=${m.layout}`);
        }
        const nav = m.navRect;
        const set = m.setRect;
        const inside = (r) => r.left >= nav.left - 0.5 && r.right <= nav.right + 0.5;
        if (!(set.width <= nav.width + 0.5 && inside(set) && m.shownRects.every(inside))) {
          photoOk = false;
          details.push(`${columns}단/${photos}장 set=${set.width.toFixed(0)} nav=${nav.width.toFixed(0)}`);
        }
      }
    }
    check(`${width}px — 가로 넘침 0`, worst.overflow <= 0, `max=${worst.overflow}`);
    check(`${width}px — 사진 구성이 카테고리 줄 폭 안`, photoOk, details.filter((d) => /set=/.test(d)).slice(0, 3).join(" "));
    check(`${width}px — 제목 글자 34px 이하`, worst.title <= 34, `${worst.title}px`);
    check(`${width}px — 칼럼/패널 판정`, layoutsOk, [...new Set(details.filter((d) => /단=/.test(d)))].join(" "));
    check(`${width}px — 오류 0`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await context.close();
  }
}


/* =========================================================
   [columns]
========================================================== */

async function runColumns(browser) {
  section("columns");
  const { context, page } = await openHarness(browser, { width: 1280, height: 900 });

  await render(page, { columns: 1, photos: 1 });
  let m = await measure(page);
  check("1단 — 가운데 HOME 만 · 좌우 영역 없음", !m.areaVisible.left && !m.areaVisible.right && m.layout === "columns");
  check("1단 — 종이가 가운데 · 본문 최대 폭(620+2) 이하", Math.abs((m.sheetRect.left + m.sheetRect.right) / 2 - 640) < 2 && m.sheetRect.width <= 623, `w=${m.sheetRect.width}`);

  await render(page, { columns: 2, photos: 1 });
  m = await measure(page);
  check("2단 — 가운데 + 오른쪽 칼럼", !m.areaVisible.left && m.areaVisible.right && m.areas.main.right <= m.areas.right.left + 0.5);
  check("2단 — 여는 버튼 없음(칼럼)", !m.openers.left && !m.openers.right);

  await render(page, { columns: 3, photos: 1, pair: true });
  m = await measure(page);
  check("3단 — 왼쪽 · 가운데 · 오른쪽 순서 · 겹침 0", m.areaVisible.left && m.areaVisible.right &&
    m.areas.left.right <= m.areas.main.left + 0.5 && m.areas.main.right <= m.areas.right.left + 0.5);
  check("3단 — 좌우 칼럼의 위가 같은 줄", Math.abs(m.areas.left.top - m.areas.right.top) < 1);
  const lines = await page.evaluate(() => {
    const l = document.querySelector(".ied-side--left");
    const r = document.querySelector(".ied-side--right");
    const cs = (el) => getComputedStyle(el);
    return {
      left: cs(l).borderRightWidth, right: cs(r).borderLeftWidth,
      leftBg: cs(l).backgroundColor, radius: cs(document.querySelector(".ied-sheet")).borderTopLeftRadius,
      shadowsInSides: !!(cs(l).boxShadow && cs(l).boxShadow !== "none")
    };
  });
  check("3단 — 두꺼운 카드 대신 1px 세로선으로 가른다", lines.left === "1px" && lines.right === "1px" && !lines.shadowsInSides);
  check("3단 — 칼럼에 배경을 칠하지 않는다(종이의 두 겹 선이 이어진다)", /rgba\(0, 0, 0, 0\)|transparent/.test(lines.leftBg), lines.leftBg);
  check("3단 — 종이가 켜진 칸의 합만큼(204+620+228+2)", Math.abs(m.sheetRect.width - 1054) < 2, `w=${m.sheetRect.width}`);
  check("3단 — 왼쪽 영역에 페어 사진 · 오른쪽 영역에 카테고리", await page.evaluate(() =>
    !!document.querySelector(".ied-side--left .ied-portrait img[src]") &&
    document.querySelectorAll(".ied-side--right .ied-side-cat a[href]").length >= 3));

  /* 넓은 화면에서 본문이 좁아지지 않는다 */
  check("3단 — 본문 칸 폭 ≥ 본문 최소 가독 폭(440)", m.areas.main.width >= 440, `${m.areas.main.width}`);

  await context.close();
}


/* =========================================================
   [palette]
========================================================== */

/* 계산된 색 — rgb()/rgba() 와 color-mix 가 돌려주는 color(srgb r g b) 둘 다 */
function parseRgb(text) {
  const hex = (vals) => "#" + vals.map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, "0")).join("");
  const rgb = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(text || "");
  if (rgb) return hex([rgb[1], rgb[2], rgb[3]]);
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text || "");
  if (srgb) return hex([srgb[1] * 255, srgb[2] * 255, srgb[3] * 255]);
  return null;
}

async function readColors(page) {
  const raw = await page.evaluate(() => {
    const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
    return {
      bg: cs(".ied-sheet", "backgroundColor"),
      pageBg: cs(".ied", "backgroundColor"),
      title: cs(".ied-title", "color"),
      sub: cs(".ied-sub", "color"),
      nav: cs(".ied-nav-link", "color"),
      date: cs(".ied-list-date", "color"),
      line: cs(".ied-sheet", "borderTopColor"),
      star: cs(".ied-star", "backgroundColor"),
      body: cs(".ied-list-title", "color")
    };
  });
  const out = {};
  Object.keys(raw).forEach((k) => { out[k] = parseRgb(raw[k]); });
  return out;
}

async function runPalette(browser) {
  section("palette");
  const { context, page } = await openHarness(browser, { width: 1280, height: 900 });
  const contrast = settingsLib.skinColorContrast;

  for (const palette of ["light", "dark"]) {
    await render(page, { columns: 3, photos: 1, palette });
    const c = await readColors(page);
    const p = IMORY_EDITORIAL_PALETTES[palette];
    check(`${palette} — 배경 = 배경색`, c.bg === p.background && c.pageBg === p.background, `${c.bg}`);
    check(`${palette} — 제목 · 별 = 포인트 1`, c.title === p.accent && c.star === p.accent, `${c.title} ${c.star}`);
    check(`${palette} — 본문 글자 = 본문색`, c.body === p.text && c.sub === p.text, `${c.body}`);
    check(`${palette} — 본문 대비 ≥ 7`, contrast(c.body, c.bg) >= 7, contrast(c.body, c.bg).toFixed(2));
    check(`${palette} — 제목(포인트 1) 대비 ≥ 4.5`, contrast(c.title, c.bg) >= 4.5, contrast(c.title, c.bg).toFixed(2));
    check(`${palette} — 흐린 글자(날짜) 대비 ≥ 4.5`, contrast(c.date, c.bg) >= 4.5, contrast(c.date, c.bg).toFixed(2));
    check(`${palette} — 선(포인트 2 에서 파생) 대비 ≥ 1.2`, contrast(c.line, c.bg) >= 1.2, contrast(c.line, c.bg).toFixed(2));
  }

  /* 주인이 고른 네 색이 그대로 전체에 */
  const custom = { background: "#fbf7f1", text: "#2a1d14", accent: "#7a2e2e", accent2: "#b89a86" };
  await render(page, { columns: 3, photos: 1, palette: custom });
  const c = await readColors(page);
  check("주인이 고른 색 — 배경 · 글자 · 포인트 1 이 그대로", c.bg === custom.background && c.body === custom.text && c.title === custom.accent,
    JSON.stringify(c));
  check("주인이 고른 색 — 선이 포인트 2 쪽으로 바뀐다(파생)", c.line !== null && contrast(c.line, c.bg) >= 1.2 &&
    c.line !== (await (async () => { await render(page, { columns: 3, photos: 1 }); return (await readColors(page)).line; })()));
  const rule = await page.evaluate(() => {
    const style = document.querySelector("#mount [data-skin-root] > style");
    return style ? style.textContent.slice(0, 200) : "";
  });
  check("설정이 없으면 색 규칙이 한 글자도 붙지 않는다", !/--imory-color-/.test(rule.split("\n")[0]) || /var\(/.test(rule.split("\n")[0]), rule.split("\n")[0].slice(0, 80));

  await context.close();
}


/* =========================================================
   [long] · [empty] · [scroll] · [owner] · [nav]
========================================================== */

async function runLong(browser) {
  section("long");
  for (const width of [320, 390, 1280]) {
    const { context, page } = await openHarness(browser, { width, height: 800 });
    await render(page, { columns: 3, photos: 3, data: "long", pair: true });
    const m = await measure(page);
    check(`${width}px — 긴 제목 · 긴 카테고리에서 가로 넘침 0`, m.overflowX <= 0, `${m.overflowX}`);
    const clipped = await page.evaluate(() => Array.from(document.querySelectorAll(".ied-nav-link, .ied-side-link, .ied-title, .ied-list-title"))
      .filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).length);
    check(`${width}px — 글자가 상자 밖으로 새지 않는다`, clipped === 0, `${clipped}`);
    check(`${width}px — 제목 34px 이하`, m.titleFont <= 34);
    await context.close();
  }
}

async function runEmpty(browser) {
  section("empty");
  for (const [width, columns] of [[390, 3], [1280, 3], [1280, 1]]) {
    const { context, page, errors } = await openHarness(browser, { width, height: 860 });
    for (const owner of [false, true]) {
      await render(page, { columns, photos: 0, data: "empty", owner });
      const m = await measure(page);
      const who = owner ? "주인" : "방문자";
      const facts = await page.evaluate(() => {
        const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0 && !el.closest("[hidden]"); };
        const mount = document.getElementById("mount");
        const lists = Array.from(mount.querySelectorAll("ol, ul")).filter(vis).filter((l) => !l.querySelector("li"));
        /* 장식(aria-hidden — 쪽 번호 "01")은 데이터가 아니다 */
        const texts = Array.from(mount.querySelectorAll("*")).filter((el) => vis(el) && el.children.length === 0 && !el.closest('[aria-hidden="true"]')).map((el) => el.textContent.trim()).filter(Boolean);
        return {
          emptyLists: lists.length,
          head: vis(mount.querySelector(".ied-empty-head")) ? mount.querySelector(".ied-empty-head").textContent : null,
          write: !!Array.from(mount.querySelectorAll("a")).find((a) => vis(a) && /write/i.test(a.textContent)),
          admin: !!Array.from(mount.querySelectorAll("a")).find((a) => vis(a) && /admin/i.test(a.textContent)),
          ddays: Array.from(mount.querySelectorAll(".ied-dday")).filter(vis).length,
          numbers: texts.filter((t) => /^\d[\d,]*$/.test(t)),
          navLinks: Array.from(mount.querySelectorAll(".ied-main .ied-nav-link")).filter(vis).map((a) => a.textContent)
        };
      });
      check(`${width}px ${columns}단 ${who} — 빈 표지(Begin the first page.)`, m.emptyVisible && /first page/i.test(facts.head || ""));
      check(`${width}px ${columns}단 ${who} — 이미지 · 깨진 이미지 · 빈 목록 0`, m.visibleImages === 0 && m.brokenImages === 0 && facts.emptyLists === 0, `img=${m.visibleImages} lists=${facts.emptyLists}`);
      check(`${width}px ${columns}단 ${who} — 가짜 방문자 수 · D-day 숫자 없음`, facts.ddays === 0 && facts.numbers.length === 0, facts.numbers.join(","));
      check(`${width}px ${columns}단 ${who} — 카테고리 줄에는 HOME 만`, facts.navLinks.length === 1 && /home/i.test(facts.navLinks[0]));
      check(`${width}px ${columns}단 ${who} — WRITE · ADMIN ${owner ? "보임" : "없음"}`, facts.write === owner && facts.admin === owner);
      if (width === 1280) {
        check(`${width}px ${columns}단 ${who} — 한 화면 안에서 완성(스크롤 없음)`, m.scroll.height <= m.scroll.client + 1, `${m.scroll.height}/${m.scroll.client}`);
      }
    }
    check(`${width}px ${columns}단 — 오류 0`, errors.length === 0, errors.join(" | "));
    await context.close();
  }
}

async function runScroll(browser) {
  section("scroll");
  const { context, page } = await openHarness(browser, { width: 390, height: 640 });
  await render(page, { columns: 1, photos: 3, data: "many" });
  let m = await measure(page);
  check("글이 많고 화면이 낮으면 세로로 스크롤한다", m.scroll.height > m.scroll.client + 100, `${m.scroll.height}/${m.scroll.client}`);
  await page.evaluate(() => { const mount = document.getElementById("mount"); mount.scrollTop = mount.scrollHeight; });
  const footVisible = await page.evaluate(() => {
    const r = document.querySelector(".ied-main .ied-foot").getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top >= 0;
  });
  check("맨 아래까지 내리면 발(footer)이 보인다(잘림 없음)", footVisible);
  const latest = await page.evaluate(() => document.querySelectorAll(".ied-latest .ied-list-item").length);
  check("1단 — 최근 글이 가운데에 전부(10)", latest === 10, `${latest}`);

  await page.setViewportSize({ width: 1280, height: 520 });
  await render(page, { columns: 3, photos: 1 });
  m = await measure(page);
  check("낮은 데스크톱 — 줄이지 않고 스크롤", m.scroll.height > m.scroll.client, `${m.scroll.height}/${m.scroll.client}`);
  await context.close();
}

async function runOwner(browser) {
  section("owner");
  const { context, page } = await openHarness(browser, { width: 1280, height: 900 });
  for (const owner of [false, true]) {
    await render(page, { columns: 3, photos: 1, owner });
    const links = await page.evaluate(() => Array.from(document.querySelectorAll(".ied-owner a")).filter((a) => a.getClientRects().length && !a.closest("[hidden]")).map((a) => a.getAttribute("href")));
    check(`${owner ? "주인" : "방문자"} — WRITE · ADMIN`, owner
      ? JSON.stringify(links) === JSON.stringify(["/test1?write=1", "/test1/admin"])
      : links.length === 0, JSON.stringify(links));
  }
  await context.close();
}

async function runNav(browser) {
  section("nav");
  const { context, page } = await openHarness(browser, { width: 1280, height: 900 });
  await render(page, { columns: 3, photos: 1 });
  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll(".ied-main .ied-nav-link")).filter((a) => !a.closest("[hidden]")).map((a) => a.getAttribute("href")));
  check("카테고리 줄 = HOME + 실제 카테고리 주소", JSON.stringify(hrefs) === JSON.stringify(["/test1", "/test1/category/1", "/test1/category/2", "/test1/highlights"]), JSON.stringify(hrefs));
  await page.click(".ied-main .ied-nav-link >> nth=1");
  await page.click(".ied-side--right .ied-list-link >> nth=0");
  const navs = await page.evaluate(() => window.harnessNavigations.slice());
  check("카테고리 · 최근 글 클릭이 그 주소로", JSON.stringify(navs) === JSON.stringify(["/test1/category/1", "/test1/post/1"]), JSON.stringify(navs));
  const current = await page.evaluate(() => {
    const a = document.querySelector(".ied-nav-item--current .ied-nav-link");
    return { aria: a.getAttribute("aria-current"), line: getComputedStyle(a).borderBottomWidth, text: a.textContent };
  });
  check("HOME 에서는 HOME 에 밑줄 · aria-current", current.aria === "page" && current.line === "1px" && /home/i.test(current.text));
  const pills = await page.evaluate(() => Array.from(document.querySelectorAll(".ied-nav-link, .ied-side-link, .ied-owner-link"))
    .filter((a) => parseFloat(getComputedStyle(a).borderTopLeftRadius) > 6 || getComputedStyle(a).backgroundColor !== "rgba(0, 0, 0, 0)").length);
  check("알약(둥근 배경) 버튼이 없다", pills === 0, `${pills}`);
  await context.close();
}


/* =========================================================
   [drawer]
========================================================== */

async function readDrawer(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-imory-sides="frame"]');
    const area = (s) => frame.querySelector(`[data-imory-sides-area="${s}"]`);
    return {
      layout: frame.getAttribute("data-imory-sides-layout"),
      active: frame.getAttribute("data-imory-sides-active"),
      phase: frame.getAttribute("data-imory-sides-phase"),
      left: area("left").getAttribute("data-imory-sides-state"),
      right: area("right").getAttribute("data-imory-sides-state"),
      focusInRight: area("right").contains(document.activeElement),
      focusInLeft: area("left").contains(document.activeElement),
      focusIsRightOpener: document.activeElement && document.activeElement.matches('.ied-main [data-imory-sides-open="right"]'),
      mountScroll: document.getElementById("mount").scrollTop,
      mountOverflow: getComputedStyle(document.getElementById("mount")).overflowY
    };
  });
}

async function waitClosed(page) {
  await page.waitForFunction(() => !document.querySelector('[data-imory-sides="frame"]').hasAttribute("data-imory-sides-active"), null, { timeout: 3000 }).catch(() => {});
}

async function runDrawer(browser) {
  section("drawer");
  const { context, page, errors } = await openHarness(browser, { width: 390, height: 700 });
  await render(page, { columns: 3, photos: 3, data: "many", pair: true });

  await page.evaluate(() => { document.getElementById("mount").scrollTop = 300; });
  await page.waitForTimeout(100);
  const scrolledTo = await page.evaluate(() => document.getElementById("mount").scrollTop);
  let d = await readDrawer(page);
  check("HOME 을 내려 둔다", scrolledTo > 200, `${scrolledTo}`);
  check("390px 3단 — 패널(좌우 모두 닫힘)", d.layout === "drawer" && d.left === "closed" && d.right === "closed");

  /* 좌표로 누른다 — page.click 은 누르기 전에 요소를 화면 안으로
     스크롤해 "위치 유지"를 잴 수 없게 만든다. 머리가 붙어 있으니
     내려간 자리에서도 버튼이 보인다. */
  const opener = await page.evaluate(() => {
    const r = document.querySelector('.ied-main [data-imory-sides-open="right"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, inView: r.top >= 0 && r.bottom <= window.innerHeight };
  });
  check("내려간 자리에서도 여는 버튼이 화면 안(머리가 위에 붙는다)", opener.inView, JSON.stringify(opener));
  await page.mouse.click(opener.x, opener.y);
  await page.waitForTimeout(450);
  d = await readDrawer(page);
  check("오른쪽 버튼 → 오른쪽 패널이 열리고 포커스가 안으로", d.active === "right" && d.right === "open" && d.focusInRight);
  check("열린 동안 HOME 스크롤이 잠기고 위치는 그대로", d.mountOverflow === "hidden" && d.mountScroll === scrolledTo, `${d.mountOverflow} ${d.mountScroll}/${scrolledTo}`);
  const rect = await page.evaluate(() => { const r = document.querySelector(".ied-side--right").getBoundingClientRect(); return { l: r.left, r: r.right }; });
  check("오른쪽 패널은 화면 오른쪽 끝에 붙는다", Math.abs(rect.r - 390) < 1 && rect.l > 0);

  const inner = await page.evaluate(async () => {
    const panel = document.querySelector(".ied-side--right");
    const before = panel.scrollTop;
    panel.scrollTop = 200;
    await new Promise((r) => requestAnimationFrame(r));
    return { scrollable: panel.scrollHeight > panel.clientHeight, moved: panel.scrollTop > before, mount: document.getElementById("mount").scrollTop };
  });
  check("패널 안이 따로 스크롤된다(HOME 은 그대로)", inner.scrollable && inner.moved && inner.mount === scrolledTo, JSON.stringify(inner));

  await page.keyboard.press("Escape");
  await waitClosed(page);
  d = await readDrawer(page);
  check("Escape → 닫히고 포커스가 연 버튼으로 · 스크롤 그대로", !d.active && d.right === "closed" && d.focusIsRightOpener && d.mountScroll === scrolledTo, JSON.stringify(d));

  await page.click('.ied-main [data-imory-sides-open="left"]');
  await page.waitForTimeout(450);
  d = await readDrawer(page);
  check("왼쪽 버튼 → 왼쪽 패널(페어 사진 · 소개)", d.active === "left" && d.focusInLeft &&
    await page.evaluate(() => !!document.querySelector(".ied-side--left .ied-portrait img[src]")));
  await page.mouse.click(370, 400);
  await waitClosed(page);
  d = await readDrawer(page);
  check("바깥(덮개) 클릭 → 닫힘", !d.active && d.left === "closed");

  await page.evaluate(() => history.pushState({ harness: 1 }, "", "#panel"));
  await page.click('.ied-main [data-imory-sides-open="right"]');
  await page.waitForTimeout(450);
  await page.goBack();
  await waitClosed(page);
  d = await readDrawer(page);
  check("뒤로가기 → 닫힘(가로채지 않는다)", !d.active && d.right === "closed");

  await page.click('.ied-main [data-imory-sides-open="right"]');
  await page.waitForTimeout(450);
  await page.click(".ied-side--right .ied-close");
  await waitClosed(page);
  d = await readDrawer(page);
  check("닫기(×) → 닫힘", !d.active);

  /* 모바일에서 끄기 */
  await render(page, { columns: 3, photos: 1, mobile: false });
  let m = await measure(page);
  d = await readDrawer(page);
  const latestInMain = await page.evaluate(() => { const el = document.querySelector(".ied-latest"); return getComputedStyle(el).display !== "none"; });
  check("모바일에서 끔 — 여는 버튼 없음 · 좌우 영역 off", !m.openers.left && !m.openers.right && d.left === "off" && d.right === "off");
  check("모바일에서 끔 — 최근 글은 가운데로", latestInMain);
  check("모바일에서 끔 — 가로 넘침 0", m.overflowX <= 0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  m = await measure(page);
  check("모바일에서 끔 — 넓은 화면에서는 칼럼 그대로", m.layout === "columns" && m.areaVisible.left && m.areaVisible.right);

  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   [dday]
========================================================== */

async function runDday(browser) {
  section("dday");
  const { context, page } = await openHarness(browser, { width: 1280, height: 900 });
  const today = settingsLib.skinDdayToday();
  const shift = (days) => { const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

  await render(page, { columns: 2, photos: 1, dday: { date: shift(-729), label: "since we met" } });
  let dday = await page.evaluate(() => ({ num: document.querySelector(".ied-dday-num").textContent, label: document.querySelector(".ied-dday-label").textContent, vis: getComputedStyle(document.querySelector(".ied-dday")).display !== "none" && !document.querySelector(".ied-dday").hidden }));
  check("729일 전 → 730(당일이 1일) · 이름", dday.vis && dday.num === "730" && dday.label === "since we met", JSON.stringify(dday));

  await render(page, { columns: 2, photos: 1, dday: { date: shift(0), label: "" } });
  dday = await page.evaluate(() => ({ num: document.querySelector(".ied-dday-num").textContent, labelHidden: document.querySelector(".ied-dday-label").hidden }));
  check("오늘 → 1 · 이름이 비면 접힘", dday.num === "1" && dday.labelHidden);

  await render(page, { columns: 2, photos: 1, dday: { date: shift(12), label: "D-DAY" } });
  dday = await page.evaluate(() => document.querySelector(".ied-dday-num").textContent);
  check("12일 뒤 → D-12", dday === "D-12", dday);

  await render(page, { columns: 2, photos: 1 });
  const hidden = await page.evaluate(() => document.querySelector(".ied-dday").hidden);
  check("설정이 없으면 D-day 자리가 접힌다", hidden === true);

  check("계산 함수 — 윤년 · 한국 시간", settingsLib.buildSkinDdayContext({ date: "2024-02-28" }, new Date("2024-03-01T15:30:00Z")).days === 4 &&
    settingsLib.buildSkinDdayContext({ date: "2024-03-01" }, new Date("2024-02-29T15:30:00Z")).days === 1);
  await context.close();
}


/* =========================================================
   [reduced]
========================================================== */

async function runReduced(browser) {
  section("reduced");
  const { context, page } = await openHarness(browser, { width: 390, height: 700 }, { reducedMotion: "reduce" });
  await render(page, { columns: 3, photos: 1 });
  const t = await page.evaluate(() => ({
    side: getComputedStyle(document.querySelector(".ied-side--right")).transitionDuration,
    nav: getComputedStyle(document.querySelector(".ied-nav-link")).transitionDuration,
    photo: getComputedStyle(document.querySelector(".ied-photo-frame")).transitionDuration,
    appear: document.querySelector('[data-imory-photos="set"]').getAnimations().length
  }));
  check("줄인 움직임 — 패널 · 링크 · 사진에 전환 없음", /^0s(, 0s)*$/.test(t.side) && /^0s(, 0s)*$/.test(t.nav) && /^0s(, 0s)*$/.test(t.photo), JSON.stringify(t));
  check("줄인 움직임 — 사진 묶음의 등장 애니메이션 0", t.appear === 0, `${t.appear}`);
  await page.click('.ied-main [data-imory-sides-open="right"]');
  const opened = await page.evaluate(() => document.querySelector(".ied-side--right").getAttribute("data-imory-sides-state"));
  check("줄인 움직임 — 패널은 곧바로 열린다", opened === "open");
  await context.close();
}


/* =========================================================
   실행
========================================================== */

const server = await startServer();
let browser;

try {
  const playwright = await loadPlaywright(BROWSER);
  browser = await playwright[BROWSER].launch();
  console.log(`browser: ${BROWSER}`);

  if (wants("shots")) await runShots(browser);
  if (wants("css")) await runCss(browser);
  if (wants("photos")) await runPhotos(browser);
  if (wants("width")) await runWidth(browser);
  if (wants("columns")) await runColumns(browser);
  if (wants("palette")) await runPalette(browser);
  if (wants("long")) await runLong(browser);
  if (wants("empty")) await runEmpty(browser);
  if (wants("scroll")) await runScroll(browser);
  if (wants("owner")) await runOwner(browser);
  if (wants("nav")) await runNav(browser);
  if (wants("drawer")) await runDrawer(browser);
  if (wants("dday")) await runDday(browser);
  if (wants("reduced")) await runReduced(browser);

} catch (err) {
  failures.push(`실행 중 예외: ${err && err.stack || err}`);
  console.log(err);
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log("  - " + f));
  process.exitCode = 1;
}
