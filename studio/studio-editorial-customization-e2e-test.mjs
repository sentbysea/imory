/* =========================================================
   EDITORIAL-CUSTOMIZATION-1 — 기본 스킨을 사용자가 직접 고치는 길 E2E

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md §10

   studio/studio-lifecycle-scenario.html ?scenario=eds (아이모리 기본
   스킨이 draft 인 주인). 사진은 이 테스트가 page.route 로 만드는 색
   SVG 다 — 사용자 원화는 쓰지 않는다.

   [scroll]  Layout 패널이 자기 안에서 세로로 스크롤한다 — 844 · 720 ·
             600px 높이와 390px 시트, 키보드가 열린 상태. Studio 문서와
             Preview 는 함께 밀리지 않는다.
   [frame]   사진 영역 너비 — 슬라이더 · 숫자 · 좌우 손잡이가 한 값이고
             프레임이 실제로 넓어진다 · 콘텐츠 폭에 맞추기 · 기본 ·
             Undo/Redo 한 칸 · 한 장/두 장/세 장
   [crop]    프레임 너비와 사진 확대가 서로를 건드리지 않는다
   [nav]     카테고리 줄의 글자 크기 — 줄 하나를 골라 다섯 항목이 함께
             · 320 · 390 · 1280px 에서 가로 넘침 0 · 긴 이름
   [logo]    HOME 제목 로고 — 없으면 글자 · 채우면 로고 · 지우면 글자 ·
             너비 조절 · Layout 패널의 길
   [persist] Save → 다시 열기 · Export → Import · Publish

   실행:
     node studio/studio-editorial-customization-e2e-test.mjs
     node studio/studio-editorial-customization-e2e-test.mjs --browser=webkit
     node studio/studio-editorial-customization-e2e-test.mjs --only=frame

   IMORY_EDC_SHOT=<디렉터리> 를 주면 눈으로 볼 스크린샷을 남긴다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8981;
const SCENARIO = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const SHOT_DIR = process.env.IMORY_EDC_SHOT || "";

const require = createRequire(import.meta.url);


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

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    /* 공개 렌더 하네스(skin/skin-editorial-default-render-harness.html)가
       쓰는 사진 — 서버가 그 자리에서 만든다 */
    const photo = /^\/__test-photo\/([a-z0-9]+)\.svg$/.exec(url.pathname);
    if (photo) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      res.end(photo[1] === "logo" ? logoSvg() : photoSvg(Number(photo[1]) || 1));
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

/* 실행 때 만드는 색 사진 · 투명 PNG 로고 대역 */
function photoSvg(n) {
  const colors = [["#2c3e70", "#9fb3d9"], ["#6b2f3a", "#e3b3a8"], ["#2f5b4a", "#b7dcc9"], ["#5a4a1f", "#e6d49a"]][(n - 1) % 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${colors[1]}"/><circle cx="300" cy="320" r="120" fill="${colors[0]}"/></svg>`;
}

/* 배경이 비어 있는(투명) 가로형 타이포 로고 — 실제 사용자가 올리는
   투명 PNG 와 같은 자리를 차지한다(420 × 120). */
function logoSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120">' +
    '<text x="12" y="86" font-family="Georgia, serif" font-size="72" fill="#1f3a78">TEST1</text></svg>';
}


/* 키보드 흉내 — 이 문서의 visualViewport 를 바꿔 끼운다(Preview 프레임에는
   손대지 않는다). studio/studio-mobile-sheet-e2e-test.mjs 와 같은 장치다. */
const FAKE_KEYBOARD = `
  if (window.top === window) {
    const target = new EventTarget();
    let keyboard = 0;
    const vv = {
      get width() { return window.innerWidth; },
      get height() { return window.innerHeight - keyboard; },
      get offsetTop() { return 0; },
      get offsetLeft() { return 0; },
      get pageTop() { return window.scrollY; },
      get pageLeft() { return window.scrollX; },
      get scale() { return 1; },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target)
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
    window.__setKeyboard = (px) => { keyboard = px || 0; target.dispatchEvent(new Event("resize")); };
  }
`;


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

const wants = (name) => !ONLY || ONLY === name;
const section = (name) => console.log(`\n[${name}]`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  if (!SHOT_DIR) return;
  /* 좁은 화면에서는 시트가 접힌 채라 무엇을 고쳤는지 보이지 않는다 —
     사진으로 남길 때만 한 단계 올렸다가 **원래 단계로 되돌린다**
     (Preview 의 자리가 달라지면 그 뒤 좌표 검사가 흔들린다). */
  const raised = await page.evaluate(() => {
    const state = window.getStudioShellState && window.getStudioShellState();
    const up = document.getElementById("studioLeftPanelSheetUp");
    if (!state || !state.narrow || !state.leftPanelOpen || !up || up.hidden) return false;
    up.click();
    return true;
  }).catch(() => false);

  if (raised) await sleep(400);

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: false });

  if (raised) {
    await page.evaluate(() => document.getElementById("studioLeftPanelSheetDown").click()).catch(() => {});
    await sleep(400);
  }
}


/* =========================================================
   Studio 열기 · 공용 조작
========================================================== */

async function openStudio(browser, options) {
  const opts = options || {};
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, acceptDownloads: true });
  await context.route("https://imory-test.invalid/**", (route) => {
    const url = route.request().url();
    if (/logo/.test(url)) {
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: logoSvg() });
      return;
    }
    const n = Number((/photo-(\d)/.exec(url) || [0, 1])[1]);
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: photoSvg(n) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));
  await page.route("**/api/skin-ai", (route) => route.fulfill({ status: 500, body: "must not be called" }));
  await page.addInitScript((init) => {
    if (init.pkg) window.__scenarioEdsSkinPackage = init.pkg;
    if (init.slots) window.__scenarioEdsSlots = init.slots;
  }, { pkg: opts.pkg || null, slots: opts.slots || null });
  if (opts.keyboard) await page.addInitScript(FAKE_KEYBOARD);
  await page.goto(`${SCENARIO}?scenario=eds`, { waitUntil: "load" });
  await page.waitForFunction(() => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true, null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return !!(doc && doc.querySelector("[data-imory-photos-layout]"));
  }, null, { timeout: 15000 });
  await sleep(400);
  return { context, page, errors };
}

async function openLayout(page) {
  await page.evaluate(() => document.getElementById("studioLayoutButton").click());
  await page.waitForSelector("#studioLeftPanelLayout .studio-home-settings", { timeout: 5000 });
  await sleep(200);
}

async function enableSelect(page) {
  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);
  if (!on) await page.evaluate(() => document.getElementById("studioInspectorButton").click());
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await sleep(250);
}

/* 프레임 안 요소의 한 점을 이 문서 좌표로(Mobile 축소 · 테두리 포함) */
async function pointIn(page, selector, fx = 0.5, fy = 0.5, index = 0) {
  return page.evaluate(([sel, fx, fy, index]) => {
    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const el = doc.querySelectorAll(sel)[index];
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    return {
      x: box.left + ((parseFloat(cs.borderLeftWidth) || 0) + r.left + r.width * fx) * scale,
      y: box.top + ((parseFloat(cs.borderTopWidth) || 0) + r.top + r.height * fy) * scale
    };
  }, [selector, fx, fy, index]);
}

async function realClick(page, selector, fx = 0.5, fy = 0.5, index = 0) {
  const p = await pointIn(page, selector, fx, fy, index);
  if (!p) throw new Error("no element: " + selector);
  await page.mouse.click(p.x, p.y);
  await sleep(300);
  return p;
}

/* 지금 고른 요소의 class */
const selectedClass = (page) => page.evaluate(() => {
  const s = window.getStudioInspectorSelection();
  if (!s) return null;
  const doc = document.getElementById("studioPreviewFrame").contentDocument;
  const el = doc.querySelector(`[data-imory-edit-id="${s.editId}"]`);
  return el ? el.getAttribute("class") : "?";
});

/* 바깥 영역 선택을 필요한 만큼 눌러 이 class 에 닿는다 */
async function selectOuterUntil(page, className, steps = 4) {
  for (let i = 0; i < steps; i += 1) {
    const cls = await selectedClass(page);
    if (cls && cls.split(/\s+/).includes(className)) return true;
    const clicked = await page.evaluate(() => {
      const button = document.getElementById("studioInspectorOuterButton");
      if (!button) return false;
      button.click();
      return true;
    });
    if (!clicked) return false;
    await sleep(350);
  }
  const cls = await selectedClass(page);
  return !!(cls && cls.split(/\s+/).includes(className));
}

const studioState = (page) => page.evaluate(() => ({
  dirty: isStudioDirty,
  history: window.getStudioHistoryState(),
  css: currentWorkingSkin.css || "",
  home: currentWorkingSkin.templates.home.html
}));

async function setNumber(page, id, value) {
  await page.evaluate(([sel, v]) => {
    const input = document.getElementById(sel);
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, [id, value]);
  await sleep(450);
}

async function setControl(page, control, value) {
  await page.evaluate(([c, v]) => {
    const input = document.querySelector(`#studioInspectorFields [data-inspector-control="${c}"]`);
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, [control, value]);
  await sleep(450);
}

const undo = async (page) => { await page.evaluate(() => document.getElementById("studioUndoButton").click()); await sleep(400); };
const redo = async (page) => { await page.evaluate(() => document.getElementById("studioRedoButton").click()); await sleep(400); };

/* 프레임 안 실측 */
const measure = (page, selector, index = 0) => page.evaluate(([sel, i]) => {
  const doc = document.getElementById("studioPreviewFrame").contentDocument;
  const el = doc.querySelectorAll(sel)[i];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = doc.defaultView.getComputedStyle(el);
  return {
    width: Math.round(r.width), height: Math.round(r.height),
    left: Math.round(r.left), top: Math.round(r.top),
    fontSize: Math.round(parseFloat(cs.fontSize) || 0),
    display: cs.display,
    hidden: el.hidden === true
  };
}, [selector, index]);

const overflowIn = (page) => page.evaluate(() => {
  const doc = document.getElementById("studioPreviewFrame").contentDocument;
  return doc.documentElement.scrollWidth - doc.documentElement.clientWidth;
});


/* =========================================================
   [scroll] Layout 패널이 자기 안에서 스크롤한다
========================================================== */

async function runScroll(browser) {
  section("scroll");

  for (const height of [844, 720, 600]) {

    const { context, page, errors } = await openStudio(browser, { viewport: { width: 1280, height } });
    await openLayout(page);

    const box = await page.evaluate(() => {
      const el = document.getElementById("studioLeftPanelLayout");
      return {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
        docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight
      };
    });

    check(`${height}px — Layout 패널만 세로 스크롤을 갖는다(문서는 늘어나지 않는다)`,
      box.overflowY === "auto" && box.docScroll <= 0, JSON.stringify(box));

    /* 맨 아래(D-day 이름 칸)까지 실제로 닿는가 */
    const reached = await page.evaluate(async () => {
      const panel = document.getElementById("studioLeftPanelLayout");
      const last = panel.querySelector(".studio-home-dday-label");
      last.scrollIntoView({ block: "end" });
      await new Promise((r) => setTimeout(r, 200));
      const r = last.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return {
        visible: r.top >= p.top - 1 && r.bottom <= p.bottom + 1 && r.height > 0,
        previewScroll: document.getElementById("studioPreviewFrame").contentDocument.defaultView.scrollY,
        docScrollTop: document.documentElement.scrollTop
      };
    });

    check(`${height}px — 마지막 설정(D-day 이름)까지 손이 닿는다`, reached.visible, JSON.stringify(reached));
    check(`${height}px — 패널을 스크롤해도 Preview · Studio 문서는 제자리`,
      reached.previewScroll === 0 && reached.docScrollTop === 0, JSON.stringify(reached));

    /* 색 설정까지 스크롤한 화면 한 장 */
    if (height === 600) await shot(page, "1-layout-panel-scrolled");

    check(`${height}px — 오류 0`, errors.length === 0, errors.join(" | "));
    await context.close();

  }

  /* 390px 시트 — 기존 3단계 계약 안에서 시트 안쪽이 스크롤한다 */
  {
    const { context, page, errors } = await openStudio(browser, { viewport: { width: 390, height: 844 }, keyboard: true });
    await openLayout(page);
    await sleep(350);

    const sheet = await page.evaluate(() => {
      const panel = document.getElementById("studioLeftPanel");
      const section = document.getElementById("studioLeftPanelLayout");
      return {
        state: panel.getAttribute("data-sheet-state"),
        scrolls: section.scrollHeight > section.clientHeight + 1,
        overflowY: getComputedStyle(section).overflowY,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panelOverflow: section.scrollWidth - section.clientWidth
      };
    });

    check("390px 시트 — 시트 안쪽이 스크롤하고 가로 넘침은 0",
      sheet.overflowY === "auto" && sheet.scrolls && sheet.docOverflow <= 0 && sheet.panelOverflow <= 0, JSON.stringify(sheet));

    const full = await page.evaluate(async () => {
      document.getElementById("studioLeftPanelSheetUp").click();
      await new Promise((r) => setTimeout(r, 400));
      const panel = document.getElementById("studioLeftPanel");
      const section = document.getElementById("studioLeftPanelLayout");
      const last = section.querySelector(".studio-home-dday-label");
      last.scrollIntoView({ block: "end" });
      await new Promise((r) => setTimeout(r, 200));
      const r = last.getBoundingClientRect();
      const s = section.getBoundingClientRect();
      return { state: panel.getAttribute("data-sheet-state"), visible: r.top >= s.top - 1 && r.bottom <= s.bottom + 1 };
    });

    check("390px 시트 — 전체 화면 단계에서 마지막 설정까지 닿는다", full.visible, JSON.stringify(full));

    /* 키보드가 열린 상태 — visualViewport 를 흉내 내어 시트가 줄어든다 */
    const keyboard = await page.evaluate(async () => {
      const height = 320;
      window.__setKeyboard(height);
      await new Promise((r) => setTimeout(r, 400));
      const section = document.getElementById("studioLeftPanelLayout");
      const last = section.querySelector(".studio-home-dday-label");
      last.scrollIntoView({ block: "end" });
      await new Promise((r) => setTimeout(r, 200));
      const r = last.getBoundingClientRect();
      const s = section.getBoundingClientRect();
      return {
        panelBottom: Math.round(document.getElementById("studioLeftPanel").getBoundingClientRect().bottom),
        keyboardTop: window.innerHeight - height,
        visible: r.top >= s.top - 1 && r.bottom <= s.bottom + 1
      };
    });

    check("390px 키보드 — 시트가 키보드 위에 서고 그 안에서 마지막 설정까지 닿는다",
      keyboard.visible && keyboard.panelBottom <= keyboard.keyboardTop + 2, JSON.stringify(keyboard));

    check("390px — 오류 0", errors.length === 0, errors.join(" | "));
    await context.close();
  }
}


/* =========================================================
   [frame] 사진 영역 너비
========================================================== */

async function selectFirstPhoto(page) {
  await enableSelect(page);
  await realClick(page, ".ied-photo-img");
  await page.waitForSelector("#studioInspectorSizeNumber", { timeout: 5000, state: "attached" });
}

async function runFrame(browser) {
  section("frame");

  const { context, page, errors } = await openStudio(browser, { viewport: { width: 390, height: 844 } });
  await selectFirstPhoto(page);

  const start = await measure(page, ".ied-photo-img");
  const caption = await measure(page, ".ied-caption");

  const form = await page.evaluate(() => ({
    label: document.querySelector("#studioInspectorFields .studio-inspector-block-label").textContent,
    note: (document.getElementById("studioInspectorSizeNote") || {}).textContent || "",
    fit: !!document.getElementById("studioInspectorSizeFit"),
    number: document.getElementById("studioInspectorSizeNumber").value,
    max: Number(document.getElementById("studioInspectorSizeRange").max),
    sides: Array.from(document.querySelectorAll(".studio-inspector-handle")).filter((h) => !h.hidden).map((h) => h.dataset.inspectorHandle)
  }));

  check("이름이 '사진 영역 너비' 이고 안내가 확대와 구분된다",
    form.label.indexOf("사진 영역 너비") === 0 && /자르기.*확대/.test(form.note), `${form.label} / ${form.note}`);
  check("지금 값 = 지금 보이는 프레임 폭", Math.abs(Number(form.number) - start.width) <= 3, `${form.number} vs ${start.width}`);
  check("상한 = HOME 가운데 칸의 폭(그보다 큰 값은 고르지 않는다)", form.max >= caption.width && form.max <= caption.width + 80, `${form.max} / caption ${caption.width}`);
  check("좌우 손잡이가 나온다", form.sides.includes("w") && form.sides.includes("e"), form.sides.join(","));
  await shot(page, "2-photo-frame-default");

  /* 아래 텍스트 상자와 같은 폭까지 */
  await setNumber(page, "studioInspectorSizeNumber", caption.width);
  const widened = await measure(page, ".ied-photo-img");
  const widenedFrame = await measure(page, ".ied-photo");

  check("아래 텍스트 상자 폭까지 실제로 넓어진다(숫자만 바뀌지 않는다)",
    widened.width > start.width + 20 && Math.abs(widenedFrame.width - caption.width) <= 2,
    JSON.stringify({ start: start.width, now: widened.width, frame: widenedFrame.width, caption: caption.width }));
  check("가로 넘침 0", (await overflowIn(page)) <= 0);
  await shot(page, "3-photo-frame-to-caption-width");

  const afterWiden = await studioState(page);
  check("규칙은 사진이 아니라 바깥 상자가 받는다(사진에는 px 가 붙지 않는다)",
    /\[data-imory-edit-id="[^"]+"\]\[data-imory-edit-id="[^"]+"\] \{ width: \d+px !important; max-width: 100% !important; \}/.test(afterWiden.css),
    (afterWiden.css.match(/\[data-imory-edit-id[^\n]*$/m) || [""])[0]);
  check("그 바깥 상자의 식별자가 HTML 에 남는다(다음 렌더에서 규칙이 떠돌지 않는다)",
    (() => {
      const id = (afterWiden.css.match(/\[data-imory-edit-id="([^"]+)"\]/) || [])[1];
      return !!id && afterWiden.home.includes(`data-imory-edit-id="${id}"`);
    })(), "");

  /* 슬라이더와 숫자가 한 값 */
  await page.evaluate(() => {
    const range = document.getElementById("studioInspectorSizeRange");
    range.value = "240";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(450);
  const bySlider = await measure(page, ".ied-photo");
  const numberNow = await page.evaluate(() => document.getElementById("studioInspectorSizeNumber").value);
  check("슬라이더와 숫자칸이 같은 값 · 화면도 그 값",
    numberNow === "240" && Math.abs(bySlider.width - 240) <= 2, `${numberNow} / ${bySlider.width}`);

  /* 좌우 손잡이 드래그 */
  const drag = await page.evaluate(() => {
    const h = document.getElementById("studioInspectorHandle-e");
    const b = h.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(drag.x, drag.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(drag.x + i * 4, drag.y + (i % 2 ? 3 : -3));
  await page.mouse.up();
  await sleep(500);

  const dragged = await measure(page, ".ied-photo");
  const draggedNumber = await page.evaluate(() => Number(document.getElementById("studioInspectorSizeNumber").value));
  check("좌우 손잡이로 끈 폭 = Inspector 숫자 = 화면",
    dragged.width > 240 && Math.abs(draggedNumber - dragged.width) <= 3, `${draggedNumber} / ${dragged.width}`);

  const afterDrag = await studioState(page);
  check("드래그 한 번 = 기록 한 칸", afterDrag.history.undo === 3, JSON.stringify(afterDrag.history));

  /* 콘텐츠 폭에 맞추기 */
  await page.evaluate(() => document.getElementById("studioInspectorSizeFit").click());
  await sleep(500);
  const fitted = await measure(page, ".ied-photo");
  const column = await measure(page, ".ied-photos");
  check("콘텐츠 폭에 맞추기 — 칸을 꽉 채운다(px 고정이 아니라 100%)",
    Math.abs(fitted.width - column.width) <= 2 && /width: 100% !important/.test((await studioState(page)).css),
    `${fitted.width} / ${column.width}`);

  /* 기본으로 되돌리기 */
  await page.evaluate(() => document.getElementById("studioInspectorSizeReset").click());
  await sleep(500);
  const reset = await measure(page, ".ied-photo-img");
  check("기본 — 스킨이 정한 폭으로 돌아온다", Math.abs(reset.width - start.width) <= 2, `${reset.width} vs ${start.width}`);

  await undo(page);
  const undone = await measure(page, ".ied-photo");
  check("↶ — 바로 전 폭(꽉 찬 폭)", Math.abs(undone.width - column.width) <= 2, `${undone.width}`);
  await redo(page);
  const redone = await measure(page, ".ied-photo-img");
  check("↷ — 기본으로 다시", Math.abs(redone.width - start.width) <= 2, `${redone.width}`);

  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();

  /* 두 장 · 세 장 구성에서도 같은 컨트롤이 산다 */
  for (const [layout, count] of [["pair", 2], ["triptych", 3]]) {

    const slots = {};
    for (let i = 1; i <= count; i += 1) slots[`photo_${i}`] = { imageId: `img-eds-${i}`, imageUrl: `https://imory-test.invalid/photo-${i}.svg` };

    const s = await openStudio(browser, { viewport: { width: 390, height: 844 }, slots });
    await selectFirstPhoto(s.page);

    const before = await measure(s.page, ".ied-photo", 0);
    const others = await measure(s.page, ".ied-photo", 1);

    /* 상한(칸의 폭)을 넘겨 달라고 하지 않는다 — 넘기면 상한에서 멈추고
       "얼마나 넓어졌나"를 재지 못한다. */
    const max = await s.page.evaluate(() => Number(document.getElementById("studioInspectorSizeRange").max));
    const target = Math.min(Math.round(before.width) + 30, max);

    await setNumber(s.page, "studioInspectorSizeNumber", target);
    const after = await measure(s.page, ".ied-photo", 0);
    const othersAfter = await measure(s.page, ".ied-photo", 1);

    check(`${layout} — 고른 사진의 자리만 넓어진다`,
      Math.abs(after.width - target) <= 2 && after.width > before.width && Math.abs(othersAfter.width - others.width) <= 2,
      JSON.stringify({ before: before.width, target, after: after.width, other: othersAfter.width }));
    check(`${layout} — 가로 넘침 0`, (await overflowIn(s.page)) <= 0);
    check(`${layout} — 오류 0`, s.errors.length === 0, s.errors.join(" | "));
    await s.context.close();

  }
}


/* =========================================================
   [crop] 프레임 너비와 사진 확대는 서로를 건드리지 않는다
========================================================== */

async function runCrop(browser) {
  section("crop");

  const { context, page, errors } = await openStudio(browser, { viewport: { width: 390, height: 844 } });
  await selectFirstPhoto(page);

  const caption = await measure(page, ".ied-caption");
  await setNumber(page, "studioInspectorSizeNumber", caption.width);
  const framed = await measure(page, ".ied-photo");

  /* 자르기 — 프레임은 그대로 두고 안쪽 사진만 확대 */
  await page.evaluate(() => document.getElementById("studioInspectorCropOpen").click());
  await page.waitForSelector("#studioInspectorCropZoom", { timeout: 5000, state: "attached" });
  await sleep(300);

  const zoomBefore = await measure(page, ".ied-photo-img");

  await page.evaluate(() => {
    const zoom = document.getElementById("studioInspectorCropZoom");
    zoom.value = String(Math.min(Number(zoom.max), 180));
    zoom.dispatchEvent(new Event("input", { bubbles: true }));
    zoom.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(400);

  const zoomLive = await measure(page, ".ied-photo-img");
  const frameLive = await measure(page, ".ied-photo");

  check("확대는 곧바로 Preview 에 · 프레임 폭은 그대로",
    zoomLive.width > zoomBefore.width + 10 && Math.abs(frameLive.width - framed.width) <= 2,
    JSON.stringify({ img: [zoomBefore.width, zoomLive.width], frame: [framed.width, frameLive.width] }));

  await page.evaluate(() => document.getElementById("studioInspectorCropApply").click());
  await sleep(600);
  await shot(page, "4-photo-frame-with-zoom");

  const frameAfter = await measure(page, ".ied-photo");
  check("적용해도 프레임 폭은 내가 정한 그대로", Math.abs(frameAfter.width - framed.width) <= 3, `${frameAfter.width} vs ${framed.width}`);

  const css = (await studioState(page)).css;
  check("자르기 보호 규칙과 프레임 너비 규칙이 따로 산다(서로 덮지 않는다)",
    /width: \d+px !important/.test(css) && /--imory-crop/.test(css), "");

  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   [nav] 카테고리 줄의 글자 크기
========================================================== */

async function runNav(browser) {
  section("nav");

  const { context, page, errors } = await openStudio(browser, { viewport: { width: 390, height: 844 } });
  await enableSelect(page);

  await realClick(page, ".ied-nav-link", 0.5, 0.5, 1);
  const onRow = await selectOuterUntil(page, "ied-nav-list");
  check("카테고리 줄 전체를 고를 수 있다(링크 하나가 아니라)", onRow, await selectedClass(page));

  const has = await page.evaluate(() => !!document.querySelector('#studioInspectorFields [data-inspector-control="fontSize"]') &&
    !!document.querySelector('#studioInspectorFields [data-inspector-control="fontSizeRange"]'));
  check("Inspector 에 글자 크기 — 숫자칸과 슬라이더", has);

  const before = await measure(page, ".ied-nav-link", 1);

  await setControl(page, "fontSize", 20);
  const big = await measure(page, ".ied-nav-link", 1);
  const bigHome = await measure(page, ".ied-nav-link", 0);

  check("줄 전체가 함께 커진다(항목 하나가 아니라)",
    big.fontSize === 20 && bigHome.fontSize === 20 && before.fontSize < 20,
    JSON.stringify({ before: before.fontSize, now: big.fontSize, home: bigHome.fontSize }));
  check("390px — 가로 넘침 0", (await overflowIn(page)) <= 0);
  await shot(page, "5-nav-font-size");

  await setControl(page, "fontSize", 9);
  const small = await measure(page, ".ied-nav-link", 1);
  check("작게도 된다", small.fontSize === 9, `${small.fontSize}`);

  /* 지나치게 키워도 넘치지 않는다 */
  await setControl(page, "fontSize", 72);
  check("아주 크게 해도 가로 스크롤이 생기지 않는다(줄이 접힌다)", (await overflowIn(page)) <= 0);

  await setControl(page, "fontSize", 20);
  const state = await studioState(page);
  check("규칙은 줄 하나에만 붙는다", /font-size: 20px/.test(state.css), "");

  await context.close();

  /* 긴 카테고리 이름 · 320 / 1280px */
  for (const width of [320, 1280]) {

    const s = await openStudio(browser, { viewport: { width, height: 900 } });
    await enableSelect(s.page);
    await realClick(s.page, ".ied-nav-link", 0.5, 0.5, 1);
    await selectOuterUntil(s.page, "ied-nav-list");
    await setControl(s.page, "fontSize", 28);

    check(`${width}px — 큰 글자에서도 가로 넘침 0`, (await overflowIn(s.page)) <= 0);
    check(`${width}px — 오류 0`, s.errors.length === 0, s.errors.join(" | "));
    await s.context.close();

  }

  check("오류 0", errors.length === 0, errors.join(" | "));
}


/* =========================================================
   [logo] HOME 제목 로고
========================================================== */

const LOGO_SLOT = { title_logo: { imageId: "img-eds-logo", imageUrl: "https://imory-test.invalid/logo.svg" } };

async function readTitle(page) {
  return page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const text = doc.querySelector(".ied-title--text");
    const logo = doc.querySelector(".ied-title--logo");
    const img = doc.querySelector(".ied-logo-img");
    const view = doc.defaultView;
    return {
      textShown: !!text && !text.hidden && view.getComputedStyle(text).display !== "none",
      textValue: text ? text.textContent : null,
      logoShown: !!logo && !logo.hidden && view.getComputedStyle(logo).display !== "none",
      logoSrc: img ? img.getAttribute("src") : null,
      logoWidth: img && img.getClientRects().length ? Math.round(img.getBoundingClientRect().width) : 0,
      objectFit: img ? view.getComputedStyle(img).objectFit : null,
      srText: logo ? (logo.querySelector(".ied-sr") || {}).textContent : null,
      broken: Array.from(doc.querySelectorAll("img")).filter((i) => i.getClientRects().length && !i.getAttribute("src")).length
    };
  });
}

async function runLogo(browser) {
  section("logo");

  const { context, page, errors } = await openStudio(browser);

  const plain = await readTitle(page);
  check("로고가 없으면 글자 제목", plain.textShown && !plain.logoShown && plain.textValue === "Forever, My Foe", JSON.stringify(plain));
  check("로고 자리가 비어도 깨진 이미지가 없다", plain.broken === 0, `${plain.broken}`);
  await shot(page, "6-title-text");

  /* Layout 패널이 그 길을 안내한다 */
  await openLayout(page);
  const panel = await page.evaluate(() => {
    const root = document.querySelector("#studioLeftPanelLayout .studio-home-settings");
    return {
      text: root.textContent,
      pick: root.querySelector(".studio-home-buttons button").textContent,
      clearDisabled: root.querySelectorAll(".studio-home-buttons button")[1].disabled
    };
  });
  check("Layout 패널에 'HOME 제목' 칸과 '로고 고르기'", /HOME 제목/.test(panel.text) && panel.pick === "로고 고르기" && panel.clearDisabled, panel.pick);
  check("개발자 낱말이 없다", !/imageSlot|title_logo|data-imory|regions/i.test(panel.text), "");

  await page.evaluate(() => document.querySelector("#studioLeftPanelLayout .studio-home-buttons button").click());
  await page.waitForSelector("#studioLeftPanelImages .images-panel-slot-list", { timeout: 5000 });
  const opened = await page.evaluate(() => {
    const active = document.querySelector("#studioLeftPanelImages .images-panel-slot--selected");
    return { mode: window.getStudioShellState().leftPanelMode, slot: active ? active.textContent : "" };
  });
  check("그 버튼이 Images 를 'HOME 제목 로고' 슬롯에 맞춘 채 연다",
    opened.mode === "images" && /HOME 제목 로고/.test(opened.slot), JSON.stringify(opened));

  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();

  /* 로고가 채워진 상태 */
  const s = await openStudio(browser, { slots: Object.assign({ photo_1: { imageId: "img-eds-1", imageUrl: "https://imory-test.invalid/photo-1.svg" } }, LOGO_SLOT) });
  const withLogo = await readTitle(s.page);

  check("로고를 채우면 같은 자리에 로고가 서고 글자 제목은 물러난다",
    withLogo.logoShown && !withLogo.textShown && /logo\.svg/.test(withLogo.logoSrc || ""), JSON.stringify(withLogo));
  check("로고는 object-fit: contain (강제로 자르지 않는다)", withLogo.objectFit === "contain", withLogo.objectFit);
  check("읽어 주는 이름은 실제 블로그 제목", withLogo.srText === "Forever, My Foe", withLogo.srText);
  await shot(s.page, "7-title-logo");

  /* 로고 너비 조절 */
  await enableSelect(s.page);
  await realClick(s.page, ".ied-logo-img");
  await s.page.waitForSelector("#studioInspectorSizeNumber", { timeout: 5000, state: "attached" });

  const label = await s.page.evaluate(() => document.querySelector("#studioInspectorFields .studio-inspector-block-label").textContent);
  check("로고는 제 폭을 갖는다 — 컨트롤 이름이 '너비'", label.indexOf("너비") === 0 && label.indexOf("사진 영역") === -1, label);

  const logoBefore = (await readTitle(s.page)).logoWidth;
  await setNumber(s.page, "studioInspectorSizeNumber", 220);
  const logoAfter = await readTitle(s.page);
  check("로고 너비를 Studio 에서 바꾼다 · 높이는 비율대로",
    Math.abs(logoAfter.logoWidth - 220) <= 2 && logoAfter.logoWidth !== logoBefore, `${logoBefore} → ${logoAfter.logoWidth}`);
  check("콘텐츠 폭을 넘지 않는다", (await overflowIn(s.page)) <= 0);

  /* 로고 지우기 → 글자 제목으로 즉시 복귀 */
  await openLayout(s.page);
  await s.page.evaluate(() => document.querySelectorAll("#studioLeftPanelLayout .studio-home-buttons button")[1].click());
  await sleep(600);
  const cleared = await readTitle(s.page);
  check("로고를 지우면 글자 제목이 곧바로 돌아온다", cleared.textShown && !cleared.logoShown && cleared.broken === 0, JSON.stringify(cleared));

  const history = await studioState(s.page);
  await undo(s.page);
  const back = await readTitle(s.page);
  check("↶ 한 번에 로고가 돌아온다(모드 따로, 이미지 따로가 아니다)", back.logoShown, JSON.stringify({ undo: history.history.undo, logo: back.logoShown }));

  check("오류 0", s.errors.length === 0, s.errors.join(" | "));
  await s.context.close();
}


/* =========================================================
   [persist] Save → 다시 열기 · Export → Import · Publish
========================================================== */

async function runPersist(browser) {
  section("persist");

  const { context, page, errors } = await openStudio(browser, {
    viewport: { width: 390, height: 844 },
    slots: Object.assign({ photo_1: { imageId: "img-eds-1", imageUrl: "https://imory-test.invalid/photo-1.svg" } }, LOGO_SLOT)
  });

  /* 사진 영역 넓히기 + 카테고리 글자 키우기 + 로고 너비 */
  await enableSelect(page);
  await realClick(page, ".ied-photo-img");
  await page.waitForSelector("#studioInspectorSizeNumber", { timeout: 5000, state: "attached" });
  const caption = await measure(page, ".ied-caption");
  await setNumber(page, "studioInspectorSizeNumber", caption.width);

  await realClick(page, ".ied-nav-link", 0.5, 0.5, 1);
  await selectOuterUntil(page, "ied-nav-list");
  await setControl(page, "fontSize", 18);

  const want = {
    frame: (await measure(page, ".ied-photo")).width,
    nav: (await measure(page, ".ied-nav-link", 1)).fontSize,
    logo: (await readTitle(page)).logoShown
  };

  await page.evaluate(() => document.getElementById("studioSaveButton").click());
  await page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === false, null, { timeout: 10000 });

  const saved = await page.evaluate(() => {
    const calls = window.__savedDraftCallsEds || [];
    return calls.length ? calls[calls.length - 1].p_content : null;
  });

  check("Save payload — 두 규칙이 CSS 에 있고 런타임 흔적은 없다",
    !!saved && /width: \d+px !important/.test(saved.css) && /font-size: 18px/.test(saved.css) &&
    !/data-imory-photos-(layout|count|filled|state|position)/.test(JSON.stringify(saved.templates)), "");

  /* Export 는 실제 버튼(다운로드)으로 받는다 */
  const download = await (async () => {
    const wait = page.waitForEvent("download", { timeout: 10000 });
    await page.evaluate(() => document.getElementById("studioExportButton").click());
    const file = await wait;
    return fs.readFileSync(await file.path(), "utf8");
  })();

  await context.close();

  /* 저장한 content 로 다시 열기 */
  const again = await openStudio(browser, {
    viewport: { width: 1280, height: 900 },
    pkg: saved,
    slots: Object.assign({ photo_1: { imageId: "img-eds-1", imageUrl: "https://imory-test.invalid/photo-1.svg" } }, LOGO_SLOT)
  });

  const reopened = {
    frame: (await measure(again.page, ".ied-photo")).width,
    nav: (await measure(again.page, ".ied-nav-link", 1)).fontSize,
    logo: (await readTitle(again.page)).logoShown
  };

  check("Save → 새로 열기 — 사진 영역 · 카테고리 글자 · 로고가 그대로",
    reopened.frame === want.frame && reopened.nav === want.nav && reopened.logo === want.logo,
    JSON.stringify({ want, reopened }));
  await shot(again.page, "8-desktop-same-settings");

  /* Export → Import 왕복 — 실제 Import 창 · 파일 선택 */
  await again.page.evaluate(() => document.getElementById("studioImportButton").click());
  await again.page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });
  await again.page.setInputFiles(".import-editor-file-input", {
    name: "skin.json", mimeType: "application/json", buffer: Buffer.from(download, "utf8")
  });
  await again.page.waitForFunction(() => {
    const msg = document.querySelector(".import-editor-message");
    const apply = document.querySelector(".import-editor-button--primary");
    return msg && msg.textContent.includes("검증 성공") && apply && !apply.disabled;
  }, null, { timeout: 10000 });
  await again.page.click(".import-editor-button--primary");
  await again.page.waitForFunction(() => {
    const el = document.querySelector(".import-editor-overlay");
    return el && el.hidden === true;
  }, null, { timeout: 5000 });
  await sleep(800);

  const importedFrame = await measure(again.page, ".ied-photo");
  const importedNav = await measure(again.page, ".ied-nav-link", 1);

  check("Export → Import — 같은 폭 · 같은 글자 크기",
    !!importedFrame && !!importedNav &&
    importedFrame.width === want.frame && importedNav.fontSize === want.nav,
    JSON.stringify({ frame: importedFrame && importedFrame.width, nav: importedNav && importedNav.fontSize, want }));

  /* Publish — 공개되는 것은 저장된 draft 다 */
  await again.page.evaluate(() => document.getElementById("studioSaveButton").click());
  await again.page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === false, null, { timeout: 10000 });
  await again.page.waitForFunction(() => !document.getElementById("studioPublishButton").disabled, null, { timeout: 8000 });
  await again.page.click("#studioPublishButton");
  await again.page.click(".studio-confirm-button--primary");
  await again.page.waitForFunction(() => window.top.__publishedEds !== undefined, null, { timeout: 10000 }).catch(() => {});
  const published = await again.page.evaluate(() => window.top.__publishedEds ? JSON.stringify(window.top.__publishedEds) : "");
  check("Publish — 같은 규칙이 공개 쪽으로 간다",
    /width: \d+px !important/.test(published) && /font-size: 18px/.test(published),
    published ? "ok" : "publish mock 없음");

  check("오류 0", errors.length === 0 && again.errors.length === 0, errors.concat(again.errors).join(" | "));
  await again.context.close();

  return JSON.parse(published || "null");
}


/* =========================================================
   [public] 공개 화면이 Studio 와 같은 결과인가

   공개된 SkinPackage 를 **실제 renderSkin()** 에 그대로 넣는다
   (skin/skin-editorial-default-render-harness.html — 공개 HOME 과
   같이 #mount 가 스크롤하는 문서). 플랫폼은 이 라운드에서 공개
   렌더를 한 줄도 바꾸지 않았으므로, 같은 결과가 나오는 근거는
   "고친 것이 전부 SkinPackage 안에 있다" 하나다.
========================================================== */

async function runPublic(browser, publishedPackage) {
  section("public");

  if (!publishedPackage) {
    check("공개할 SkinPackage 를 받았다", false, "persist 절을 함께 돌려야 한다");
    return;
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));

  await page.goto(`http://localhost:${PORT}/skin/skin-editorial-default-render-harness.html`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.harnessReady, null, { timeout: 15000 });

  await page.evaluate((pkg) => window.renderDefault({
    package: pkg, columns: 3, photos: 1, logo: true, fresh: true
  }), publishedPackage);
  await sleep(700);

  const seen = await page.evaluate(() => {
    const photo = document.querySelector(".ied-photo");
    const nav = document.querySelector(".ied-nav-link");
    const logo = document.querySelector(".ied-logo-img");
    const text = document.querySelector(".ied-title--text");
    const cs = (el) => getComputedStyle(el);
    return {
      frame: photo ? Math.round(photo.getBoundingClientRect().width) : null,
      nav: nav ? Math.round(parseFloat(cs(nav).fontSize)) : null,
      logoShown: !!(logo && logo.getClientRects().length),
      logoFit: logo ? cs(logo).objectFit : null,
      textShown: !!(text && text.getClientRects().length),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  check("공개 렌더 — 사진 영역 너비가 Studio 에서 정한 그대로", seen.frame === 289, JSON.stringify(seen));
  check("공개 렌더 — 카테고리 글자 크기가 그대로", seen.nav === 18, `${seen.nav}`);
  check("공개 렌더 — 로고 제목이 서고 글자 제목은 물러난다", seen.logoShown && !seen.textShown && seen.logoFit === "contain", JSON.stringify(seen));
  check("공개 렌더 — 가로 넘침 0", seen.overflow <= 0, `${seen.overflow}`);

  /* 390px 도 같다 */
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(500);
  const narrow = await page.evaluate(() => ({
    frame: Math.round(document.querySelector(".ied-photo").getBoundingClientRect().width),
    column: Math.round(document.querySelector(".ied-photos").getBoundingClientRect().width),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));

  check("공개 렌더 390px — 정한 폭을 넘지 않고 칸 안에 담긴다(가로 넘침 0)",
    narrow.frame <= narrow.column + 1 && narrow.overflow <= 0, JSON.stringify(narrow));

  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   실행
========================================================== */

const server = await startServer();
const playwright = await loadPlaywright(BROWSER);
const browser = await playwright[BROWSER].launch();

console.log(`browser: ${BROWSER}`);

try {
  if (wants("scroll")) await runScroll(browser);
  if (wants("frame")) await runFrame(browser);
  if (wants("crop")) await runCrop(browser);
  if (wants("nav")) await runNav(browser);
  if (wants("logo")) await runLogo(browser);
  /* 공개 렌더는 "공개된 그 SkinPackage" 가 있어야 하므로 persist 가
     돌려준 것을 그대로 쓴다(--only=public 이면 persist 도 함께 돈다). */
  if (wants("persist") || wants("public")) {
    const published = await runPersist(browser);
    if (wants("public") || !ONLY) await runPublic(browser, published);
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
