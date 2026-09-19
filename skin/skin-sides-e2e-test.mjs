/* =========================================================
   EDITORIAL-RESPONSIVE-HOME-1 — 좌우 영역 · 잡지 표지형 HOME E2E

   기준 문서: IMORY_SIDES_DESIGN.md

   화면은 실제 renderSkin() 이 그린다(skin/skin-sides-render-harness.html).
   공개 HOME 처럼 문서가 아니라 #mount 가 스크롤한다. 공개 화면의
   **진입 경로**(index.html · sandbox 프레임)는
   skin/sandbox/skin-sandbox-e2e-test.mjs --only=sides 가,
   Studio 는 studio/studio-sides-e2e-test.mjs 가 본다.

   ★ 재는 것은 좌표 · 계산 스타일 · 포커스 · 스크롤 위치다.

   [layout]   1·2·3단 × 390/430/834/1100/1280 — 칼럼인가 패널인가,
              칸이 겹치지 않는가, 본문 최대 폭, 여는 버튼은 패널일 때만
              켜진 쪽만, 가로 넘침 0
   [boundary] 칼럼/패널 경계가 "본문 최소 폭 + 켜진 영역 폭" 에서 바뀐다
   [cover]    기본 콘텐츠에서 첫 화면 안에 제목·사진·카테고리(모바일)
              낮은 화면에서는 줄이지 않고 스크롤
   [cats]     0개 · 3개(한 줄) · 4개 이상(두 줄) · 긴 이름(잘림·겹침 0)
   [empty]    빈 홈 — 깨진 이미지 · 빈 카드 · 가짜 글 없음
   [palette]  밝은/어두운 배경에서 글자·보조글자·포인트·선의 대비
   [drawer]   여닫기 · 방향 · 포커스 가두기/복원 · Escape · 바깥 클릭 ·
              닫기 버튼 · 스크롤 잠금과 위치 유지 · 패널 안 스크롤 ·
              패널 안 링크 · history 불변 · 넓어지면 칼럼 · 다시 그려도
              열린 채 · reduced motion
   [legacy]   틀이 없는 스킨에는 속성 · 요소 · 잠금이 하나도 없다

   실행:
     node skin/skin-sides-e2e-test.mjs
     node skin/skin-sides-e2e-test.mjs --browser=webkit
     node skin/skin-sides-e2e-test.mjs --only=drawer
     IMORY_SIDES_SHOT=<디렉터리>  스크린샷을 남긴다
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8976;
const HARNESS = `http://localhost:${PORT}/skin/skin-sides-render-harness.html`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const SHOT_DIR = process.env.IMORY_SIDES_SHOT || "";


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
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }
  throw new Error(`playwright ${browserName} 를 실행할 수 없습니다.\n  - ${tried.join("\n  - ") || "없음"}`);
}


const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const abs = path.join(ROOT, decodeURIComponent(url.pathname));
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

const section = (name) => {
  if (ONLY && ONLY !== name) return false;
  console.log(`\n[${name}]`);
  return true;
};


/* =========================================================
   하네스 열기 · 읽기
========================================================== */

async function open(browser, viewport, query, contextOptions) {
  const ctx = await browser.newContext({ viewport, ...(contextOptions || {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));
  await page.goto(`${HARNESS}?${query || ""}`);
  await page.evaluate(() => window.harnessReady);
  /* 사진 디코드 + ResizeObserver 한 바퀴 */
  await page.waitForFunction(() => {
    const img = document.querySelector(".ed-photo-img");
    return !img || img.closest("[hidden]") || img.complete;
  }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
  return { ctx, page, errors };
}

async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
}

/* 틀과 세 칸의 상태를 통째로 */
async function readFrame(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-imory-sides="frame"]');
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.left), right: Math.round(r.right), y: Math.round(r.top), bottom: Math.round(r.bottom),
        w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, visibility: cs.visibility, position: cs.position,
        state: el.getAttribute("data-imory-sides-state"),
        inert: el.hasAttribute("inert")
      };
    };
    const area = (name) => rect(frame.querySelector(`[data-imory-sides-area="${name}"]`));
    const triggers = Array.from(frame.querySelectorAll("[data-imory-sides-open]")).map((t) => {
      const r = t.getBoundingClientRect();
      return {
        side: t.getAttribute("data-imory-sides-open"),
        visible: getComputedStyle(t).display !== "none" && r.width > 0,
        w: Math.round(r.width), h: Math.round(r.height),
        label: t.getAttribute("aria-label") || t.textContent.trim(),
        role: t.getAttribute("role") || t.tagName.toLowerCase(),
        expanded: t.getAttribute("aria-expanded"),
        controls: t.getAttribute("aria-controls"),
        fallback: t.hasAttribute("data-imory-sides-fallback")
      };
    });
    const mount = document.getElementById("mount");
    return {
      layout: frame.getAttribute("data-imory-sides-layout"),
      on: frame.getAttribute("data-imory-sides-on"),
      count: frame.getAttribute("data-imory-sides-count"),
      active: frame.getAttribute("data-imory-sides-active"),
      phase: frame.getAttribute("data-imory-sides-phase"),
      frameW: Math.round(frame.getBoundingClientRect().width),
      left: area("left"), main: area("main"), right: area("right"),
      triggers,
      overflowX: Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mount.scrollWidth - mount.clientWidth
      ),
      mountScrollTop: mount.scrollTop,
      mountOverflow: getComputedStyle(mount).overflowY,
      focus: (() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        return {
          inLeft: !!a.closest('[data-imory-sides-area="left"]'),
          inRight: !!a.closest('[data-imory-sides-area="right"]'),
          opener: a.getAttribute("data-imory-sides-open"),
          closer: a.hasAttribute("data-imory-sides-close"),
          tag: a.tagName.toLowerCase()
        };
      })()
    };
  });
}

const visibleArea = (a) => !!a && a.display !== "none" && a.visibility !== "hidden" && a.w > 0;


/* 사람 눈으로 보는 대비(WCAG) — 계산 스타일의 rgb()/color(srgb …) 둘 다 읽는다 */
async function readPalette(page) {
  return page.evaluate(() => {
    const parse = (text) => {
      const probe = document.createElement("i");
      probe.style.color = text;
      document.body.appendChild(probe);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = getComputedStyle(probe).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      probe.remove();
      return [r, g, b];
    };
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const frame = document.querySelector(".ed");
    const cs = getComputedStyle(frame);
    const v = (name) => parse(cs.getPropertyValue(name).trim());
    const bg = v("--skin-background");
    const surface = v("--skin-surface");
    const text = v("--skin-text");
    const muted = v("--skin-muted");
    const line = v("--skin-line");
    const accentInk = v("--skin-accent-ink");
    const actual = {
      title: parse(getComputedStyle(document.querySelector(".ed-title")).color),
      mainBg: parse(getComputedStyle(document.querySelector(".ed-main")).backgroundColor),
      sideBg: parse(getComputedStyle(document.querySelector(".ed-side--right")).backgroundColor),
      sideText: parse(getComputedStyle(document.querySelector(".ed-list-title")).color)
    };
    return {
      text: contrast(text, bg),
      textOnSurface: contrast(text, surface),
      muted: contrast(muted, bg),
      mutedOnSurface: contrast(muted, surface),
      accentInk: contrast(accentInk, bg),
      line: contrast(line, bg),
      titleActual: contrast(actual.title, actual.mainBg),
      sideActual: contrast(actual.sideText, actual.sideBg),
      bgIsDark: lum(bg) < 0.2
    };
  });
}


/* =========================================================
   실행
========================================================== */

async function run() {

  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();

  try {

    /* ------------------------------------------------- */
    if (section("layout")) {

      const cases = [
        { vp: { width: 390, height: 844 }, expect: { 1: "columns", 2: "drawer", 3: "drawer" } },
        { vp: { width: 430, height: 932 }, expect: { 1: "columns", 2: "drawer", 3: "drawer" } },
        { vp: { width: 834, height: 1112 }, expect: { 1: "columns", 2: "columns", 3: "drawer" } },
        { vp: { width: 1100, height: 800 }, expect: { 1: "columns", 2: "columns", 3: "columns" } },
        { vp: { width: 1280, height: 800 }, expect: { 1: "columns", 2: "columns", 3: "columns" } }
      ];

      for (const c of cases) {
        for (const count of [1, 2, 3]) {

          const { ctx, page, errors } = await open(browser, c.vp, `count=${count}`);
          const f = await readFrame(page);
          const tag = `${c.vp.width}px ${count}단`;

          check(`${tag}: ${c.expect[count] === "columns" ? "칼럼" : "패널"}`, f.layout === c.expect[count], f.layout);
          check(`${tag}: 켜진 쪽 표시`, f.count === String(count) &&
            f.on === ({ 1: "", 2: "right", 3: "left right" })[count], `${f.on}/${f.count}`);
          check(`${tag}: 가로 넘침 0`, f.overflowX <= 0, String(f.overflowX));
          check(`${tag}: 스크립트 오류 없음`, errors.length === 0, errors.join(" | "));

          if (f.layout === "columns") {

            const areas = [f.left, f.main, f.right].filter(visibleArea);
            const ordered = areas.every((a, i) => i === 0 || areas[i - 1].right <= a.x + 1);

            check(`${tag}: 칸이 겹치지 않고 왼→오`, ordered, areas.map((a) => `${a.x}-${a.right}`).join(" "));
            check(`${tag}: 켜진 칸만 보인다`,
              visibleArea(f.left) === (count === 3) && visibleArea(f.right) === (count >= 2) && visibleArea(f.main));
            check(`${tag}: 본문 최대 폭(720) 안`, f.main.w <= 721, String(f.main.w));
            check(`${tag}: 칸들이 가운데에 모인다`,
              Math.abs((areas[0].x) - (c.vp.width - areas[areas.length - 1].right)) <= 2,
              `${areas[0].x} / ${c.vp.width - areas[areas.length - 1].right}`);
            check(`${tag}: 여는 버튼이 없다(칼럼은 처음부터 보인다)`, f.triggers.every((t) => !t.visible));

            if (count === 3) {
              check(`${tag}: 좌우 칸 높이가 달라도 같은 줄에서 시작`, f.left.y === f.main.y && f.right.y === f.main.y,
                `${f.left.y}/${f.main.y}/${f.right.y}`);
            }

          } else {

            check(`${tag}: 본문이 화면 폭 전체(찌그러지지 않는다)`, f.main.w >= c.vp.width - 1, String(f.main.w));
            check(`${tag}: 닫힌 패널은 보이지 않고 눌리지 않는다`,
              [f.left, f.right].filter((a) => a && a.state === "closed").every((a) => a.visibility === "hidden" && a.inert));
            const visibleTriggers = f.triggers.filter((t) => t.visible).map((t) => t.side).sort().join(",");
            check(`${tag}: 여는 버튼은 켜진 쪽만`, visibleTriggers === (count === 3 ? "left,right" : "right"), visibleTriggers);
            check(`${tag}: 여는 버튼 44px 이상 · 이름 · aria`,
              f.triggers.filter((t) => t.visible).every((t) => t.w >= 44 && t.h >= 44 && t.label && t.role === "button" && t.expanded === "false" && t.controls),
              JSON.stringify(f.triggers.filter((t) => t.visible)));
            check(`${tag}: 스킨이 버튼을 그렸으니 플랫폼 버튼이 끼어들지 않는다`, f.triggers.every((t) => !t.fallback));

          }

          await shot(page, `layout-${c.vp.width}-${count}`);
          await ctx.close();
        }
      }
    }


    /* ------------------------------------------------- */
    if (section("boundary")) {

      /* 스킨: main-min 560 + 248 × 켜진 칸 → 3단 1056 · 2단 808 */
      for (const [count, need] of [[3, 1056], [2, 808]]) {
        const { ctx, page } = await open(browser, { width: need + 40, height: 800 }, `count=${count}`);

        const at = async (width) => {
          await page.evaluate((w) => { document.getElementById("mount").style.width = `${w}px`; document.getElementById("mount").style.right = "auto"; }, width);
          await page.waitForTimeout(120);
          return page.evaluate(() => document.querySelector("[data-imory-sides-layout]").getAttribute("data-imory-sides-layout"));
        };

        /* #mount 의 스크롤바 폭만큼 틀이 좁다 — 틀 폭으로 재 맞춘다 */
        const gutter = await page.evaluate(() => {
          const m = document.getElementById("mount");
          return m.offsetWidth - m.clientWidth;
        });

        const above = await at(need + gutter);
        const below = await at(need + gutter - 1);

        check(`${count}단: 틀 폭 ${need}px 에서 칼럼`, above === "columns", above);
        check(`${count}단: ${need - 1}px 에서 패널`, below === "drawer", below);

        /* 스킨이 폭을 바꾸면 경계도 따라 움직인다 */
        await page.evaluate(() => {
          const frame = document.querySelector('[data-imory-sides="frame"]');
          frame.style.setProperty("--imory-sides-width", "300px");
        });
        const moved = await at(need + gutter + 10);
        check(`${count}단: 칸 폭을 넓히면 같은 폭에서 패널로(경계가 스킨 값을 따른다)`, moved === "drawer", moved);

        await ctx.close();
      }
    }


    /* ------------------------------------------------- */
    if (section("cover")) {

      for (const vp of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
        const { ctx, page } = await open(browser, vp, "count=3");
        const r = await page.evaluate(() => {
          const box = (s) => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
          return { title: box(".ed-title"), photo: box(".ed-photo"), cats: box(".ed-cats-list"), foot: box(".ed-foot"), h: innerHeight };
        });
        check(`${vp.width}×${vp.height}: 제목 · 사진 · 카테고리가 첫 화면 안`,
          r.title.top >= 0 && r.photo.bottom <= r.h && r.cats.bottom <= r.h, JSON.stringify(r));
        check(`${vp.width}×${vp.height}: 사진이 표지의 중심(폭의 절반 이상)`, r.photo.w >= vp.width * 0.5, String(r.photo.w));
        await shot(page, `cover-${vp.width}`);
        await ctx.close();
      }

      {
        const { ctx, page } = await open(browser, { width: 1280, height: 800 }, "count=3");
        const r = await page.evaluate(() => {
          const b = (s) => document.querySelector(s).getBoundingClientRect();
          return { title: Math.round(b(".ed-title").top), photo: Math.round(b(".ed-photo").bottom), h: innerHeight, titleSize: parseFloat(getComputedStyle(document.querySelector(".ed-title")).fontSize) };
        });
        check("1280×800: 제목과 사진이 첫 화면 안", r.title >= 0 && r.photo <= r.h, JSON.stringify(r));
        check("1280×800: 제목은 작은 가운데 제목(사진이 주인공)", r.titleSize <= 26.5, String(r.titleSize));
        await ctx.close();
      }

      {
        const { ctx, page } = await open(browser, { width: 1280, height: 520 }, "count=3");
        const r = await page.evaluate(() => {
          const m = document.getElementById("mount");
          const photo = document.querySelector(".ed-photo").getBoundingClientRect();
          return { scrollable: m.scrollHeight > m.clientHeight, photoH: Math.round(photo.height), titleSize: parseFloat(getComputedStyle(document.querySelector(".ed-title")).fontSize) };
        });
        check("낮은 데스크톱(520px): 문서가 스크롤된다", r.scrollable);
        check("낮은 데스크톱: 사진이 하한 아래로 줄지 않는다(220px 대의 4:5)", r.photoH >= 219, String(r.photoH));
        check("낮은 데스크톱: 글자를 줄이지 않는다", r.titleSize >= 18, String(r.titleSize));
        await shot(page, "cover-1280x520");
        await ctx.close();
      }
    }


    /* ------------------------------------------------- */
    if (section("cats")) {

      const readCats = (page) => page.evaluate(() => {
        const nav = document.querySelector(".ed-cats");
        const items = Array.from(document.querySelectorAll(".ed-cats-item"));
        const rects = items.map((i) => i.getBoundingClientRect());
        const overlaps = rects.some((a, i) => rects.some((b, j) => i < j &&
          a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
        const clipped = Array.from(document.querySelectorAll(".ed-cats-link")).some((l) => l.scrollWidth > l.clientWidth + 1);
        const rows = new Set(rects.map((r) => Math.round(r.top))).size;
        return {
          hidden: !nav || nav.hidden || getComputedStyle(nav).display === "none",
          count: items.length,
          rows,
          overlaps,
          clipped,
          overflow: document.getElementById("mount").scrollWidth - document.getElementById("mount").clientWidth
        };
      });

      {
        const { ctx, page } = await open(browser, { width: 390, height: 844 }, "data=empty");
        const c = await readCats(page);
        check("카테고리 0개: 카테고리 줄 자체가 없다", c.hidden, JSON.stringify(c));
        await ctx.close();
      }

      {
        const { ctx, page } = await open(browser, { width: 390, height: 844 }, "count=3");
        const c = await readCats(page);
        check("카테고리 4개: 두 줄(2열)", c.count === 4 && c.rows === 2, JSON.stringify(c));
        await ctx.close();
      }

      {
        const { ctx, page } = await open(browser, { width: 390, height: 844 }, "count=3");
        await page.evaluate(() => {
          const items = document.querySelectorAll(".ed-cats-item");
          items[3].remove();
        });
        const c = await readCats(page);
        check("카테고리 3개: 한 줄에 하나(1열)", c.count === 3 && c.rows === 3, JSON.stringify(c));
        await ctx.close();
      }

      for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
        const { ctx, page } = await open(browser, vp, "count=3&data=long");
        const c = await readCats(page);
        check(`${vp.width}px 긴 이름 10개: 잘림 0 · 겹침 0 · 가로 넘침 0`, c.count === 10 && !c.clipped && !c.overlaps && c.overflow <= 0, JSON.stringify(c));
        const t = await page.evaluate(() => {
          const title = document.querySelector(".ed-title");
          return { clipped: title.scrollWidth > title.clientWidth + 1, right: title.getBoundingClientRect().right, w: innerWidth };
        });
        check(`${vp.width}px 긴 블로그 제목: 잘리지 않고 화면 안`, !t.clipped && t.right <= t.w, JSON.stringify(t));
        await shot(page, `long-${vp.width}`);
        await ctx.close();
      }

      {
        const { ctx, page } = await open(browser, { width: 1280, height: 800 }, "count=3&data=long");
        const r = await page.evaluate(() => {
          const clipped = Array.from(document.querySelectorAll(".ed-toc-link, .ed-list-title")).filter((el) => el.offsetParent)
            .some((el) => el.scrollWidth > el.clientWidth + 1);
          const side = document.querySelector(".ed-side--left").getBoundingClientRect();
          const main = document.querySelector(".ed-main").getBoundingClientRect();
          return { clipped, sideRight: Math.round(side.right), mainLeft: Math.round(main.left) };
        });
        check("1280 긴 이름: 좌우 칼럼 안에서 잘림 0 · 본문을 침범하지 않는다", !r.clipped && r.sideRight <= r.mainLeft, JSON.stringify(r));
        await shot(page, "long-1280-dark-no");
        await ctx.close();
      }
    }


    /* ------------------------------------------------- */
    if (section("empty")) {

      for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
        const { ctx, page } = await open(browser, vp, "count=3&data=empty");
        const r = await page.evaluate(() => {
          const shown = (el) => el && !el.closest("[hidden]") && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
          const imgs = Array.from(document.querySelectorAll(".ed img")).filter(shown);
          const title = document.querySelector(".ed-title");
          const emptyBlocks = Array.from(document.querySelectorAll(".ed-latest, .ed-notes, .ed-quote, .ed-cats, .ed-profile")).filter(shown);
          const labels = Array.from(document.querySelectorAll(".ed-side--right .ed-label")).filter(shown);
          return {
            imgs: imgs.length,
            titleShown: shown(title) && title.textContent.trim().length > 0,
            titleSize: parseFloat(getComputedStyle(title).fontSize),
            emptyBlocks: emptyBlocks.map((el) => el.className),
            rightLabels: labels.length,
            homeLink: shown(document.querySelector(".ed-toc-home")) || vp.width < 800
          };
        });
        check(`${vp.width}px 빈 홈: 이미지(깨진 그림)가 하나도 없다`, r.imgs === 0, String(r.imgs));
        check(`${vp.width}px 빈 홈: 빈 카드/목록이 없다`, r.emptyBlocks.length === 0, r.emptyBlocks.join(","));
        check(`${vp.width}px 빈 홈: 오른쪽 칸에 빈 이름표가 없다`, r.rightLabels === 0, String(r.rightLabels));
        check(`${vp.width}px 빈 홈: 블로그 제목이 표지의 주인공(사진 없음 → 큰 제목)`, r.titleShown && r.titleSize >= 28, String(r.titleSize));
        await shot(page, `empty-${vp.width}`);
        await ctx.close();
      }

      {
        const { ctx, page } = await open(browser, { width: 390, height: 844 }, "count=3&data=full&cover=0");
        const r = await page.evaluate(() => ({
          figureHidden: document.querySelector(".ed-photo").hidden,
          broken: Array.from(document.querySelectorAll("img")).filter((i) => !i.closest("[hidden]") && i.complete && i.naturalWidth === 0).length
        }));
        check("대표 사진 없음: 자리(틀)도 없고 깨진 이미지 0", r.figureHidden && r.broken === 0, JSON.stringify(r));
        await ctx.close();
      }
    }


    /* ------------------------------------------------- */
    if (section("palette")) {

      for (const palette of ["light", "dark"]) {
        const { ctx, page } = await open(browser, { width: 1280, height: 800 }, `count=3&palette=${palette}`);
        const p = await readPalette(page);
        check(`${palette}: 배경 판정`, p.bgIsDark === (palette === "dark"));
        check(`${palette}: 본문 글자 대비 ≥ 7`, p.text >= 7 && p.titleActual >= 7, `${p.text.toFixed(2)} / ${p.titleActual.toFixed(2)}`);
        check(`${palette}: 사이드 영역 위 글자 대비 ≥ 7`, p.textOnSurface >= 7 && p.sideActual >= 7, `${p.textOnSurface.toFixed(2)} / ${p.sideActual.toFixed(2)}`);
        check(`${palette}: 보조 글자 대비 ≥ 4.5(배경 · 사이드)`, p.muted >= 4.5 && p.mutedOnSurface >= 4.5, `${p.muted.toFixed(2)} / ${p.mutedOnSurface.toFixed(2)}`);
        check(`${palette}: 포인트 글자(번호) 대비 ≥ 4.5`, p.accentInk >= 4.5, p.accentInk.toFixed(2));
        check(`${palette}: 선이 보인다(1.2 ≤ 대비 < 글자)`, p.line >= 1.2 && p.line < p.muted, p.line.toFixed(2));
        await shot(page, `palette-${palette}`);
        await ctx.close();
      }

      {
        const { ctx, page } = await open(browser, { width: 390, height: 844 }, "count=3&palette=dark");
        await page.click('[data-imory-sides-open="right"]');
        await page.waitForTimeout(450);
        const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".ed-side--right")).backgroundColor);
        check("dark: 모바일 패널 바탕도 어두운 종이", /rgb\((\d+), (\d+), (\d+)\)/.test(bg) && Number(bg.match(/\d+/)[0]) < 60, bg);
        await shot(page, "palette-dark-drawer");
        await ctx.close();
      }
    }


    /* ------------------------------------------------- */
    if (section("drawer")) {

      const vp = { width: 390, height: 844 };

      /* 여닫기 · 방향 · 포커스 · Escape */
      {
        const { ctx, page } = await open(browser, vp, "count=3&data=many&pad=900");

        const closedPose = await page.evaluate(() => {
          const x = (s) => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(s)).transform).m41;
          return { left: x(".ed-side--left"), right: x(".ed-side--right") };
        });
        check("닫힌 왼쪽은 왼쪽 밖, 오른쪽은 오른쪽 밖에서 기다린다", closedPose.left < 0 && closedPose.right > 0, JSON.stringify(closedPose));

        await page.evaluate(() => { document.getElementById("mount").scrollTop = 240; });
        const historyBefore = await page.evaluate(() => history.length);

        await page.click('[data-imory-sides-open="left"]');
        await page.waitForTimeout(60);
        const mid = await page.evaluate(() => document.querySelector(".ed-side--left").getBoundingClientRect().left);
        await page.waitForTimeout(450);
        let f = await readFrame(page);

        check("왼쪽 버튼 → 왼쪽 패널이 열린다", f.active === "left" && f.phase === "open" && f.left.state === "open" && f.left.visibility === "visible", JSON.stringify({ a: f.active, s: f.left.state }));
        check("왼쪽에서 들어온다(움직이는 중 x < 0)", mid < 0, String(mid));
        check("열린 패널은 화면 안 · 화면 높이 전체", f.left.x === 0 && f.left.right <= vp.width && f.left.y === 0 && f.left.h === vp.height, JSON.stringify(f.left));
        check("본문은 찌그러지지 않는다(폭 그대로)", f.main.w >= vp.width - 1, String(f.main.w));
        check("포커스가 패널 안으로", f.focus && f.focus.inLeft, JSON.stringify(f.focus));
        check("여는 버튼 aria-expanded=true", f.triggers.find((t) => t.side === "left").expanded === "true");
        check("뒤 문서 스크롤 잠금 · 위치 그대로", f.mountOverflow === "hidden" && f.mountScrollTop === 240, `${f.mountOverflow} ${f.mountScrollTop}`);
        check("대화상자로 읽힌다(role · aria-modal · 이름)", await page.evaluate(() => {
          const a = document.querySelector(".ed-side--left");
          return a.getAttribute("role") === "dialog" && a.getAttribute("aria-modal") === "true" && !!a.getAttribute("aria-label");
        }));
        check("본문은 inert(뒤로 탭이 새지 않는다)", await page.evaluate(() => document.querySelector(".ed-main").hasAttribute("inert")));

        /* 휠 — 뒤가 움직이지 않는다 */
        await page.mouse.move(360, 600);
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(150);
        f = await readFrame(page);
        check("열린 동안 뒤 문서는 스크롤되지 않는다", f.mountScrollTop === 240, String(f.mountScrollTop));

        /* Tab 가두기 */
        const cycle = [];
        for (let i = 0; i < 18; i++) {
          await page.keyboard.press("Tab");
          cycle.push(await page.evaluate(() => !!document.activeElement.closest('[data-imory-sides-area="left"]')));
        }
        await page.keyboard.press("Shift+Tab");
        cycle.push(await page.evaluate(() => !!document.activeElement.closest('[data-imory-sides-area="left"]')));
        check("Tab/Shift+Tab 이 패널 안에서만 돈다", cycle.every(Boolean), cycle.join(","));

        await page.keyboard.press("Escape");
        await page.waitForTimeout(450);
        f = await readFrame(page);
        check("Escape → 닫힘", !f.active && f.left.state === "closed" && f.left.visibility === "hidden", JSON.stringify({ a: f.active, s: f.left.state }));
        check("포커스가 연 버튼으로 돌아온다", f.focus && f.focus.opener === "left", JSON.stringify(f.focus));
        check("닫은 뒤 스크롤 위치 그대로 · 잠금 풀림", f.mountScrollTop === 240 && f.mountOverflow === "auto", `${f.mountScrollTop} ${f.mountOverflow}`);
        check("본문 inert 해제", !(await page.evaluate(() => document.querySelector(".ed-main").hasAttribute("inert"))));
        check("브라우저 기록을 만들지 않는다", (await page.evaluate(() => history.length)) === historyBefore);

        /* 오른쪽 — 오른쪽에서 · 바깥 클릭 */
        await page.click('[data-imory-sides-open="right"]');
        await page.waitForTimeout(60);
        const midRight = await page.evaluate(() => document.querySelector(".ed-side--right").getBoundingClientRect().right);
        await page.waitForTimeout(450);
        f = await readFrame(page);
        check("오른쪽 버튼 → 오른쪽 패널(오른쪽 끝에 붙는다)", f.active === "right" && f.right.right === vp.width && f.right.x > 0, JSON.stringify(f.right));
        check("오른쪽에서 들어온다(움직이는 중 right > 화면 폭)", midRight > vp.width, String(midRight));

        /* 패널 안 스크롤 */
        const inner = await page.evaluate(() => {
          const a = document.querySelector(".ed-side--right");
          const before = a.scrollHeight > a.clientHeight;
          a.scrollTop = 200;
          return { long: before, moved: a.scrollTop > 0 };
        });
        check("긴 내용은 패널 안에서 스크롤된다", inner.long && inner.moved, JSON.stringify(inner));
        check("그동안 뒤 문서 위치 그대로", (await readFrame(page)).mountScrollTop === 240);

        await page.mouse.click(20, 400); /* 패널(오른쪽) 바깥 = 덮개 */
        await page.waitForTimeout(450);
        f = await readFrame(page);
        check("바깥(덮개) 클릭 → 닫힘 · 포커스 복원", !f.active && f.focus && f.focus.opener === "right", JSON.stringify(f.focus));

        /* 닫기 버튼 */
        await page.click('[data-imory-sides-open="left"]');
        await page.waitForTimeout(450);
        await page.click('.ed-side--left [data-imory-sides-close]');
        await page.waitForTimeout(450);
        f = await readFrame(page);
        check("닫기 버튼 → 닫힘 · 포커스 복원", !f.active && f.focus && f.focus.opener === "left", JSON.stringify(f.focus));

        /* 키보드로 연다(스킨 버튼은 span — role=button + Enter) */
        await page.focus('[data-imory-sides-open="right"]');
        await page.keyboard.press("Enter");
        await page.waitForTimeout(450);
        f = await readFrame(page);
        check("Enter 로 연다(버튼이 아닌 요소도)", f.active === "right");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(450);

        /* 패널 안 링크 — 이동은 그대로, 패널은 닫힌다 */
        await page.click('[data-imory-sides-open="left"]');
        await page.waitForTimeout(450);
        await page.click(".ed-toc-link >> nth=1");
        await page.waitForTimeout(100);
        const nav = await page.evaluate(() => window.harnessNavigations.slice(-1)[0]);
        f = await readFrame(page);
        check("패널 안 링크: 이동 요청은 그대로 · 패널은 즉시 닫히고 잠금 풀림", nav === "/test1/category/2" && !f.active && f.mountOverflow === "auto", `${nav} ${f.active} ${f.mountOverflow}`);

        await shot(page, "drawer-after");
        await ctx.close();
      }

      /* 열린 채 넓어지면 칼럼 · 잠금 해제 */
      {
        const { ctx, page } = await open(browser, vp, "count=3");
        await page.click('[data-imory-sides-open="right"]');
        await page.waitForTimeout(450);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(250);
        const f = await readFrame(page);
        check("열린 채 넓어지면 칼럼 · 패널 상태 해제 · 잠금 풀림",
          f.layout === "columns" && !f.active && f.right.state === "column" && f.mountOverflow === "auto" && !f.right.inert,
          JSON.stringify({ l: f.layout, a: f.active, s: f.right.state, o: f.mountOverflow }));
        await ctx.close();
      }

      /* 다시 그려도(Studio 가 글자 하나마다 그린다) 열린 채 · 잠금은 하나 */
      {
        const { ctx, page } = await open(browser, vp, "count=3&pad=900");
        await page.click('[data-imory-sides-open="left"]');
        await page.waitForTimeout(450);
        await page.evaluate(() => window.renderEditorial({ count: 3 }));
        await page.waitForTimeout(200);
        let f = await readFrame(page);
        check("다시 그린 뒤에도 같은 패널이 열려 있다(움직임 없이)", f.active === "left" && f.left.state === "open", JSON.stringify({ a: f.active }));
        check("잠금은 여전히 하나", f.mountOverflow === "hidden");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(450);
        f = await readFrame(page);
        check("그 뒤 닫으면 잠금이 완전히 풀린다", !f.active && f.mountOverflow === "auto", f.mountOverflow);

        await page.click('[data-imory-sides-open="left"]');
        await page.waitForTimeout(450);
        await page.evaluate(() => window.renderEditorial({ count: 1 }));
        await page.waitForTimeout(200);
        f = await readFrame(page);
        check("1단으로 바꾸면 패널 없이 칼럼 · 잠금 풀림", f.layout === "columns" && !f.active && f.mountOverflow === "auto", `${f.layout} ${f.mountOverflow}`);
        await ctx.close();
      }

      /* reduced motion — 기다리지 않는다 */
      {
        const { ctx, page } = await open(browser, vp, "count=3", { reducedMotion: "reduce" });
        await page.click('[data-imory-sides-open="left"]');
        await page.waitForTimeout(30);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(30);
        const f = await readFrame(page);
        check("reduced motion: 닫기를 기다리지 않는다", !f.active && f.left.state === "closed", f.left.state);
        await ctx.close();
      }

      /* 문서가 스크롤하는 모양(Studio Preview)도 같다 */
      {
        const { ctx, page } = await open(browser, vp, "count=3&scroller=document&data=many&pad=900");
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.click('[data-imory-sides-open="right"]');
        await page.waitForTimeout(450);
        const locked = await page.evaluate(() => ({ y: scrollY, o: getComputedStyle(document.documentElement).overflow }));
        await page.mouse.move(40, 500);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(150);
        const still = await page.evaluate(() => scrollY);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(450);
        const after = await page.evaluate(() => ({ y: scrollY, o: getComputedStyle(document.documentElement).overflow }));
        check("문서 스크롤: 잠금 · 위치 유지 · 풀림", locked.o === "hidden" && locked.y === 300 && still === 300 && after.y === 300 && after.o === "visible",
          JSON.stringify({ locked, still, after }));
        await ctx.close();
      }
    }


    /* ------------------------------------------------- */
    if (section("legacy")) {

      const { ctx, page } = await open(browser, { width: 390, height: 844 }, "count=3");
      const r = await page.evaluate(async () => {
        const res = await fetch("./test-skins/imory-quiet-frame-v4.json");
        const pkg = await res.json();
        const template = window.resolveSkinTemplate(pkg, "home");
        const host = document.createElement("div");
        document.body.appendChild(host);
        const { renderSkin } = await import("./skin-render.js");
        renderSkin({ container: host, skin: template, context: { site: { title: "x" }, profile: {}, navigation: { categories: [] }, home: { recentPosts: [] } } });
        const any = Array.from(host.querySelectorAll("*")).some((el) =>
          Array.from(el.attributes).some((a) => a.name.startsWith("data-imory-sides")));
        return { hasSidesKey: "sides" in template, any, controllers: (host.__imorySidesControllers || []).length };
      });
      check("틀이 없는 기존 스킨: sides 키 없음 · 속성/요소 0 · 컨트롤러 0", !r.hasSidesKey && !r.any && r.controllers === 0, JSON.stringify(r));

      const sanitized = await page.evaluate(() => {
        const out = window.sanitizeSkinHTML(
          '<div data-imory-sides="frame" data-imory-sides-layout="drawer" data-imory-sides-on="left">' +
          '<aside data-imory-sides-area="left" data-imory-sides-state="open" inert></aside>' +
          '<main data-imory-sides-area="middle"></main>' +
          '<span data-imory-sides-open="left" data-imory-sides-fallback></span></div>'
        );
        return out;
      });
      check("저장 경계: 계약 속성만 남고 런타임 상태는 사라진다",
        /data-imory-sides="frame"/.test(sanitized) && /data-imory-sides-area="left"/.test(sanitized) &&
        /data-imory-sides-open="left"/.test(sanitized) &&
        !/sides-layout|sides-on|sides-state|sides-fallback|middle|inert/.test(sanitized), sanitized);

      await ctx.close();
    }

  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed (${BROWSER})`);
  if (failures.length) {
    console.log("실패:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
