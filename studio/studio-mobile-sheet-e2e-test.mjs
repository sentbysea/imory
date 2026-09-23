/* =========================================================
   MOBILE-SHEET-1 — 좁은 화면의 세 단계 편집 시트

   기준 문서: IMORY_STUDIO_SHELL_DESIGN.md §5-1

   실제 Studio 와 같은 스크립트 구성의 시나리오 문서
   (studio/studio-lifecycle-scenario.html?scenario=dux)를 390px 로 띄운다.
   supabase 만 in-memory mock 이고 HTML/CSS/JS 는 저장소의 실제 파일이다.
   Preview 안 클릭은 **진짜 포인터**(page.mouse)다 — 선택 규칙이 좌표를
   본다(DIRECT-UX-1).

     states    Select 로 고르면 접힘(높이 56~72px) · 버튼으로 접힘 ↔ 내용 ↔
               전체 · 전체의 위 끝 = 상단 바 아래 · 내용 보기 ≤ 화면 55% ·
               aria-expanded · Escape 단계 내리기(전체 → 내용 → 접힘 → 선택
               해제) · 손잡이 드래그(작은 흔들림은 그대로 · 끄는 동안 그
               높이 · 위로 끌면 다음 단계 · 아래로 끌면 이전 단계 · 접힘에서
               아래로 끌면 닫힘 · 톡 누르면 접힘 ↔ 내용) · 단계 변경은 기록
               (↶)과 dirty 에 닿지 않는다
     preview   짧은 페이지: 시트가 열리면 Preview 끝에 Studio 전용 여유가
               생겨 맨 아래 요소를 시트를 닫지 않고 스크롤해 고를 수 있다 ·
               접힘에 덮이지 않음 · 내용 보기로 펼치면 **최소한만** 스크롤 ·
               스킨 좌표 · 스킨 DOM · draft 불변 · 접어도 · 닫아도 튀지 않음.
               긴 페이지: 위쪽 요소는 펼쳐도 스크롤 0 · 아래쪽 요소는 시트
               위 12px 까지만. Mobile Preview(축소 배율)에서도 같다
     panels    Select 입력하던 값 · Images 목록 스크롤 · Dock 적용 안 한
               값이 단계를 오가도 그대로 · Images/Dock 은 내용 보기로 열림 ·
               Quick Bar 이미지 변경 → Images → 붙이면 고른 요소로(접힘) ·
               Dock 적용 뒤 시트가 닫히지 않음 · AI 를 열면 시트가 숨고
               닫으면 같은 내용 · 같은 단계로
     quickbar  접힘 머리 한 줄 · 가로 넘침 0 · 칸마다 40×44 이상 · 접근
               이름 · 넘치면 ··· 목록(같은 버튼을 옮긴다) · 목록은 시트 위 ·
               누르면 그 일이 되고 닫힘 · Escape 는 목록 먼저
     keyboard  visualViewport 를 흉내 내 키보드를 연다 — 시트 아래 끝이
               키보드 위로 · 단계 그대로 · 적용 버튼이 키보드 위 · 전체
               화면도 상단 바 아래 ~ 키보드 위 · 닫으면 원래대로 · Preview
               안 글자 편집 중에는 잠시 접힘, 확정하면 원래 단계
     desktop   1280px — 왼쪽 패널 · stage 밀림 · 머리 모양 · Quick Bar 자리 ·
               Preview 여유 0 이 예전 그대로

   실행:
     node studio/studio-mobile-sheet-e2e-test.mjs
     node studio/studio-mobile-sheet-e2e-test.mjs --browser=webkit
     node studio/studio-mobile-sheet-e2e-test.mjs --only=preview
   IMORY_SHEET_SHOT=<디렉터리> 를 주면 단계별 스크린샷을 남긴다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8972;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=dux`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const shouldRun = (name) => !ONLY || ONLY === name;
const SHOT_DIR = process.env.IMORY_SHEET_SHOT || "";
const MOD = process.platform === "darwin" ? "Meta" : "Control";

const results = [];
const consoleErrors = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `\n        ${detail}` : ""}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));


/* =========================================================
   정적 서버 · Playwright
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
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
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
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
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(String(err.message).split("\n")[0]);
    }
  }
  throw new Error(`playwright ${browserName} 을(를) 실행할 수 없습니다. ${tried.join(" | ")}`);
}


/* =========================================================
   fixture — 짧은 페이지 · 긴 페이지

   window.__scenarioDuxSkinPackage 로 dux 시나리오의 draft 를 바꾼다
   (studio-lifecycle-scenario.html). 짧은 페이지는 화면 높이(100vh)에
   꼭 맞고 맨 아래 글이 접힌 시트 밑에 깔린다.
========================================================== */

const SHORT_SKIN = {
  schemaVersion: 1,
  templates: {
    home: {
      html:
        '<div class="sp-page">' +
        '<h1 class="sp-title">짧은 페이지</h1>' +
        '<p class="sp-mid">가운데 글</p>' +
        '<footer class="sp-foot"><p class="sp-foot-text">맨 아래 글</p></footer>' +
        '</div>'
    },
    category: { html: '<div class="sp-cat"><h1 data-imory-bind="category.name"></h1></div>' },
    post: { html: '<div class="sp-post"><h1 data-imory-bind="post.title"></h1><div data-imory-region="post-body"></div></div>' }
  },
  css:
    '.sp-page { min-height: 100vh; display: flex; flex-direction: column; padding: 0 16px; box-sizing: border-box; } ' +
    '.sp-title { margin: 120px 0 0; font-size: 24px; } ' +
    '.sp-mid { margin: 40px 0; } ' +
    '.sp-foot { margin-top: auto; padding: 10px 0; } ' +
    '.sp-foot-text { margin: 0; font-size: 16px; line-height: 24px; }',
  imageSlots: [],
  regions: [],
  metadata: { generatedBy: "deterministic-v1" }
};

const LONG_SKIN = {
  schemaVersion: 1,
  templates: {
    home: {
      html:
        '<div class="lp-page">' +
        Array.from({ length: 40 }, (_, i) => `<p class="lp-item lp-item-${i}">줄 ${i}</p>`).join("") +
        '</div>'
    },
    category: { html: '<div class="lp-cat"><h1 data-imory-bind="category.name"></h1></div>' },
    post: { html: '<div class="lp-post"><h1 data-imory-bind="post.title"></h1><div data-imory-region="post-body"></div></div>' }
  },
  css:
    '.lp-page { padding: 100px 16px 40px; } ' +
    '.lp-item { margin: 0; height: 40px; line-height: 40px; font-size: 16px; border-bottom: 1px solid #eee; }',
  imageSlots: [],
  regions: [],
  metadata: { generatedBy: "deterministic-v1" }
};


/* 키보드 흉내 — 이 문서의 visualViewport 를 바꿔 끼운다(Preview 프레임에는
   손대지 않는다). __setKeyboard(px) 가 그 높이만큼 아래를 가린다. */
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


/* =========================================================
   공용 도구
========================================================== */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function openStudio(browser, options) {
  const opts = options || {};
  const context = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 } });
  if (opts.skin) {
    await context.addInitScript((skin) => { window.__scenarioDuxSkinPackage = skin; }, opts.skin);
  }
  if (opts.keyboard) {
    await context.addInitScript(FAKE_KEYBOARD);
  }
  const page = await context.newPage();
  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));
  await page.route("**/api/skin-ai", route => route.fulfill({ status: 500, contentType: "text/plain", body: "not used" }));
  await page.route("https://example.com/**", route => route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 }));
  await page.goto(SCENARIO_URL, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );
  await sleep(300);
  return { page, context };
}

async function enableSelect(page, probe) {
  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);
  if (!on) await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await page.waitForFunction((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc && doc.querySelector(sel);
    return !!(el && el.getAttribute("data-imory-edit-id") && doc.body.classList.contains("imory-inspector-on"));
  }, probe || ".dx-bio", { timeout: 8000 });
  await sleep(200);
}

/* 요소 안 한 점의 Studio 좌표(Mobile 축소 배율 포함) */
async function pointIn(page, selector, fx = 0.3, fy = 0.5) {
  return page.evaluate(([sel, fx, fy]) => {
    const frame = document.getElementById("studioPreviewFrame");
    const el = frame.contentDocument.querySelector(sel);
    if (!el) return null;
    const box = frame.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    return {
      x: box.left + (bl + r.left + r.width * fx) * scale,
      y: box.top + (bt + r.top + r.height * fy) * scale
    };
  }, [selector, fx, fy]);
}

async function realClick(page, selector, fx, fy) {
  const p = await pointIn(page, selector, fx, fy);
  if (!p) throw new Error("no element: " + selector);
  await page.mouse.click(p.x, p.y);
  await sleep(150);
  return p;
}

async function legacySelect(page, selector) {
  await page.evaluate((sel) => {
    const el = document.getElementById("studioPreviewFrame").contentDocument.querySelector(sel);
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, selector);
  await sleep(200);
}

async function waitSelected(page, className, timeoutMs = 4000) {
  return page.waitForFunction((cls) => {
    const s = window.getStudioInspectorSelection();
    if (!s) return false;
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(`[data-imory-edit-id="${s.editId}"]`);
    return !!(el && el.classList.contains(cls));
  }, className, { timeout: timeoutMs }).then(() => true, () => false);
}

const sheet = (page) => page.evaluate(() => {
  const p = document.getElementById("studioLeftPanel");
  const r = p.getBoundingClientRect();
  const body = document.getElementById("studioLeftPanelBody");
  const bar = document.getElementById("studioTopDock").getBoundingClientRect();
  const tab = document.getElementById("studioTopDockHandle").getBoundingClientRect();
  return {
    state: window.getStudioSheetState(),
    open: p.classList.contains("is-open"),
    mode: p.dataset.mode,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    bodyVisible: getComputedStyle(body).visibility !== "hidden" && body.getBoundingClientRect().height > 0,
    bodyInert: !!body.inert,
    barBottom: Math.round(bar.bottom),
    chromeBottom: Math.round(Math.max(bar.bottom, tab.bottom)),
    vh: window.innerHeight,
    metrics: window.getStudioSheetMetrics()
  };
});

const history = (page) => page.evaluate(() => window.getStudioHistoryState());

const dirty = (page) => page.evaluate(() => window.getStudioAiWorkingState().isDirty);

const draftHtml = (page) => page.evaluate(() => {
  const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
  return JSON.stringify(pkg.templates) + "\n" + pkg.css;
});

/* 프레임 안 요소의 지금 모습: 문서 좌표(스킨 레이아웃) · 화면 좌표 · 스크롤 */
const frameEl = (page, selector) => page.evaluate((sel) => {
  const frame = document.getElementById("studioPreviewFrame");
  const win = frame.contentWindow;
  const el = frame.contentDocument.querySelector(sel);
  const box = frame.getBoundingClientRect();
  const scale = box.width / (frame.offsetWidth || box.width);
  const bt = parseFloat(getComputedStyle(frame).borderTopWidth) || 0;
  const r = el.getBoundingClientRect();
  return {
    docTop: Math.round(r.top + win.scrollY),
    docBottom: Math.round(r.bottom + win.scrollY),
    screenTop: box.top + (bt + r.top) * scale,
    screenBottom: box.top + (bt + r.bottom) * scale,
    scrollY: Math.round(win.scrollY),
    scale,
    inset: win.__imoryStudioSheetInset()
  };
}, selector);

const stepUp = async (page) => { await page.click("#studioLeftPanelSheetUp"); await sleep(250); };
const stepDown = async (page) => { await page.click("#studioLeftPanelSheetDown"); await sleep(250); };

async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${BROWSER}-${name}.png`) });
}

/* 손잡이를 잡고 dy 만큼(위가 음수) 끈다. 중간에 멈춰 높이를 읽는다. */
async function dragHandle(page, dy, options) {
  const opts = options || {};
  const h = await page.evaluate(() => {
    const r = document.getElementById("studioLeftPanelHandle").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  const steps = opts.steps || 10;
  let mid = null;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(h.x, h.y + (dy * i) / steps);
    await sleep(opts.slow ? 40 : 12);
    if (i === Math.floor(steps / 2)) {
      mid = await page.evaluate(() => ({
        height: document.getElementById("studioLeftPanel").offsetHeight,
        dragging: window.getStudioSheetMetrics().dragging
      }));
    }
  }
  if (opts.pause) await sleep(opts.pause);
  await page.mouse.up();
  await sleep(250);
  return { mid, start: h };
}


/* =========================================================
   states
========================================================== */

async function runStates(browser) {

  const { page, context } = await openStudio(browser);
  const h0 = await history(page);
  const d0 = await dirty(page);

  await enableSelect(page);
  const s0 = await sheet(page);
  record(
    "S1. Select 를 켜면 시트가 접힘으로 열린다 — 높이 56~72px · 본문은 보이지 않고 inert · 이름 자리에 안내",
    s0.open && s0.state === "peek" && s0.height >= 56 && s0.height <= 72 && s0.bottom === s0.vh &&
      !s0.bodyVisible && s0.bodyInert &&
      (await page.textContent("#studioLeftPanelName")).includes("누르세요"),
    JSON.stringify(s0)
  );

  await realClick(page, ".dx-bio");
  const picked = await waitSelected(page, "dx-bio");
  await sleep(200);
  const s1 = await sheet(page);
  const names = await page.evaluate(() => ({
    sheetName: document.getElementById("studioLeftPanelName").textContent,
    popoverTitle: document.getElementById("studioInspectorPopoverTitle").textContent,
    barInHeader: !!document.getElementById("studioLeftPanelHeader").querySelector("#studioInspectorQuickBar"),
    upLabel: document.getElementById("studioLeftPanelSheetUp").getAttribute("aria-label"),
    upExpanded: document.getElementById("studioLeftPanelSheetUp").getAttribute("aria-expanded"),
    downHidden: document.getElementById("studioLeftPanelSheetDown").hidden
  }));
  record(
    "S2. 요소를 고르면 접힘 — 머리에 사람이 읽는 이름(팝오버와 같은 문구) · Quick Bar · 펼치기(aria-expanded=false)",
    picked && s1.state === "peek" && s1.height <= 72 && names.sheetName === names.popoverTitle && names.sheetName.length > 0 &&
      names.barInHeader && names.upLabel === "펼치기" && names.upExpanded === "false" && names.downHidden,
    JSON.stringify({ s1, names })
  );
  await shot(page, "states-peek");

  await stepUp(page);
  const s2 = await sheet(page);
  const a2 = await page.evaluate(() => ({
    up: document.getElementById("studioLeftPanelSheetUp").getAttribute("aria-label"),
    down: document.getElementById("studioLeftPanelSheetDown").getAttribute("aria-label"),
    expanded: document.getElementById("studioLeftPanelSheetUp").getAttribute("aria-expanded"),
    status: document.getElementById("studioLeftPanelStatus").textContent
  }));
  record(
    "S3. 펼치기 → 내용 보기 — 화면의 55% 이하 · 본문이 보임 · 접기/전체 화면 버튼 · 스크린리더 문구",
    s2.state === "content" && s2.bodyVisible && !s2.bodyInert && s2.height > 72 && s2.height <= s2.vh * 0.55 + 1 &&
      s2.bottom === s2.vh && a2.up === "전체 화면으로 펼치기" && a2.down === "접기" && a2.expanded === "true" &&
      a2.status.includes("내용 보기"),
    JSON.stringify({ s2, a2 })
  );
  await shot(page, "states-content");

  await stepUp(page);
  const s3 = await sheet(page);
  record(
    "S4. 전체 화면 — 상단 도구 모음(바에 매달린 여닫기 탭까지) 바로 아래부터 화면 아래까지 · 펼치기 버튼은 숨음",
    s3.state === "full" && Math.abs(s3.top - s3.chromeBottom) <= 1 && s3.top > s3.barBottom && s3.bottom === s3.vh &&
      await page.evaluate(() => document.getElementById("studioLeftPanelSheetUp").hidden) &&
      (await page.getAttribute("#studioLeftPanelSheetDown", "aria-label")) === "내용 보기로 내리기",
    JSON.stringify(s3)
  );
  await shot(page, "states-full");

  await stepDown(page);
  const s4 = await sheet(page);
  await stepDown(page);
  const s5 = await sheet(page);
  const focusOut = await page.evaluate(() => !document.getElementById("studioLeftPanelBody").contains(document.activeElement));
  record(
    "S5. 내리기 → 내용 보기 → 접기 → 접힘 · 포커스가 접힌 본문 안에 남지 않음",
    s4.state === "content" && s5.state === "peek" && focusOut,
    JSON.stringify({ s4: s4.state, s5: s5.state, focusOut })
  );

  /* Escape 사다리 */
  await stepUp(page);
  await stepUp(page);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press("Escape");
  const e1 = (await sheet(page)).state;
  await page.keyboard.press("Escape");
  const e2 = (await sheet(page)).state;
  const selAfter2 = await page.evaluate(() => !!window.getStudioInspectorSelection());
  await page.keyboard.press("Escape");
  await sleep(150);
  const e3 = await sheet(page);
  const selAfter3 = await page.evaluate(() => !!window.getStudioInspectorSelection());
  record(
    "S6. Escape — 전체 → 내용 보기 → 접힘(선택 유지) → 그다음이 예전 규칙(선택 해제, 시트는 접힘으로 남음)",
    e1 === "content" && e2 === "peek" && selAfter2 && !selAfter3 && e3.open && e3.state === "peek",
    JSON.stringify({ e1, e2, selAfter2, e3: e3.state, selAfter3 })
  );

  /* Preview 에 포커스가 있을 때의 Escape(프레임이 올려 보냄)도 같은 사다리 */
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await stepUp(page);
  await page.evaluate(() => document.getElementById("studioPreviewFrame").contentWindow.focus());
  await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await sleep(200);
  const ef = await sheet(page);
  const efSel = await page.evaluate(() => !!window.getStudioInspectorSelection());
  record(
    "S7. Preview 안에서 누른 Escape 도 먼저 시트를 한 단계 내린다(선택 유지)",
    ef.state === "peek" && efSel,
    JSON.stringify({ state: ef.state, efSel })
  );

  /* 손잡이 드래그 */
  const g0 = await sheet(page);
  const small = await dragHandle(page, -12, { steps: 4, slow: true, pause: 200 });
  const g1 = await sheet(page);
  record(
    "S8. 손잡이를 12px 만 움직이면(흔들림) 단계가 그대로다",
    g0.state === "peek" && g1.state === "peek" && Math.abs(g1.height - g0.height) <= 1,
    JSON.stringify({ g0: g0.state, g1: g1.state, small })
  );

  const up1 = await dragHandle(page, -140, { steps: 12 });
  const g2 = await sheet(page);
  record(
    "S9. 손잡이를 위로 끌면 끄는 동안 그 높이가 보이고, 놓으면 다음 단계(접힘 → 내용 보기)",
    up1.mid && up1.mid.dragging && up1.mid.height > g0.height + 40 && g2.state === "content" && !g2.metrics.dragging &&
      await page.evaluate(() => document.getElementById("studioLeftPanel").style.height === ""),
    JSON.stringify({ mid: up1.mid, g2: g2.state })
  );

  await dragHandle(page, -300, { steps: 12 });
  const g3 = await sheet(page);
  await dragHandle(page, 120, { steps: 10, slow: true, pause: 200 });
  const g4 = await sheet(page);
  await dragHandle(page, 260, { steps: 10, slow: true, pause: 200 });
  const g5 = await sheet(page);
  record(
    "S10. 위로 크게 끌면 전체 화면 · 아래로 끌면 이전 단계(전체 → 내용 → 접힘) — 가장 가까운 단계에 정착",
    g3.state === "full" && g4.state === "content" && g5.state === "peek",
    JSON.stringify({ g3: g3.state, g4: g4.state, g5: g5.state })
  );

  const hb = await page.evaluate(() => {
    const r = document.getElementById("studioLeftPanelHandle").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(hb.x, hb.y);
  await sleep(250);
  const t1 = (await sheet(page)).state;
  await page.mouse.click(hb.x, (await page.evaluate(() => {
    const r = document.getElementById("studioLeftPanelHandle").getBoundingClientRect();
    return r.top + r.height / 2;
  })));
  await sleep(250);
  const t2 = (await sheet(page)).state;
  record("S11. 손잡이를 톡 누르면 접힘 ↔ 내용 보기", t1 === "content" && t2 === "peek", JSON.stringify({ t1, t2 }));

  const touchAction = await page.evaluate(() => ({
    handle: getComputedStyle(document.getElementById("studioLeftPanelHandle")).touchAction,
    panel: getComputedStyle(document.getElementById("studioLeftPanel")).touchAction,
    body: getComputedStyle(document.getElementById("studioLeftPanelBody")).touchAction
  }));
  record(
    "S12. 세로 끌기를 가로채는 곳은 손잡이뿐(touch-action) — 시트 · 본문은 브라우저 기본",
    touchAction.handle === "none" && touchAction.panel !== "none" && touchAction.body !== "none",
    JSON.stringify(touchAction)
  );

  await dragHandle(page, 80, { steps: 8, slow: true, pause: 200 });
  const closed = await sheet(page);
  const keepSel = await page.evaluate(() => !!window.getStudioInspectorSelection());
  record(
    "S13. 접힘에서 아래로 끌면 시트가 닫힌다(고른 요소 · Select 모드는 그대로)",
    !closed.open && keepSel && await page.evaluate(() => window.getStudioInspectorState().enabled),
    JSON.stringify({ open: closed.open, keepSel })
  );

  const h1 = await history(page);
  record(
    "S14. 단계를 몇 번 바꿔도 기록(↶)과 dirty 는 그대로다",
    h1.undo === h0.undo && h1.redo === h0.redo && (await dirty(page)) === d0,
    JSON.stringify({ h0, h1 })
  );

  await context.close();

}


/* =========================================================
   preview
========================================================== */

async function runPreview(browser) {

  /* ---- 짧은 페이지 ---- */
  {
    const { page, context } = await openStudio(browser, { skin: SHORT_SKIN });
    await enableSelect(page, ".sp-foot-text");
    const d0 = await draftHtml(page);
    const h0 = await history(page);

    const s0 = await sheet(page);
    const f0 = await frameEl(page, ".sp-foot-text");
    const covered = f0.screenBottom > s0.top;
    record(
      "P1. 짧은 페이지(100vh) — 접힌 시트가 맨 아래 글을 덮는다 · Preview 끝에 Studio 전용 여유가 생긴다(시트 높이만큼 · scroll-padding-bottom)",
      covered && f0.inset.inset === s0.metrics.cover && f0.inset.spacer && f0.inset.spacer.height >= s0.metrics.cover &&
        f0.inset.scrollPaddingBottom === `${s0.metrics.cover}px`,
      JSON.stringify({ sheetTop: s0.top, foot: f0 })
    );

    const spacerOutside = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const spacer = doc.querySelector("imory-studio-spacer");
      const root = doc.getElementById("previewRoot");
      return {
        exists: !!spacer,
        outsideRoot: !!spacer && !root.contains(spacer) && !doc.body.contains(spacer),
        hidden: !!spacer && getComputedStyle(spacer).visibility === "hidden" && getComputedStyle(spacer).pointerEvents === "none",
        rootStyle: root.getAttribute("style"),
        bodyStyle: doc.body.getAttribute("style"),
        skinStyled: Array.from(root.querySelectorAll("[style]")).map(e => e.className)
      };
    });
    record(
      "P2. 여유는 스킨 밖(<html> 의 Studio 전용 요소) — 보이지도 눌리지도 않고, 스킨 루트 · body 에 style 이 붙지 않는다",
      spacerOutside.exists && spacerOutside.outsideRoot && spacerOutside.hidden && !spacerOutside.rootStyle && !spacerOutside.bodyStyle,
      JSON.stringify(spacerOutside)
    );

    /* 시트를 닫지 않고 Preview 만 스크롤해서 맨 아래 글을 고른다 */
    const mid = await pointIn(page, ".sp-mid");
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(0, 400);
    await sleep(400);
    const f1 = await frameEl(page, ".sp-foot-text");
    const s1 = await sheet(page);
    await realClick(page, ".sp-foot-text", 0.2, 0.5);
    const picked = await waitSelected(page, "sp-foot-text");
    await sleep(250);
    const s2 = await sheet(page);
    const f2 = await frameEl(page, ".sp-foot-text");
    record(
      "P3. 시트를 닫지 않고 Preview 를 스크롤하면 맨 아래 글이 시트 위로 올라오고 · 누르면 골라지고 · 접힘이라 덮이지 않는다",
      f1.scrollY > 0 && f1.screenBottom <= s1.top && picked && s2.state === "peek" && f2.screenBottom <= s2.top,
      JSON.stringify({ scrolled: f1.scrollY, footBottom: f2.screenBottom, sheetTop: s2.top })
    );
    await shot(page, "preview-short-peek");

    await stepUp(page);
    await sleep(250);
    const s3 = await sheet(page);
    const f3 = await frameEl(page, ".sp-foot-text");
    const gap = s3.top - f3.screenBottom;
    record(
      "P4. 내용 보기로 펼치면 Preview 만 스크롤돼 고른 글이 시트 위에 보인다 — 최소한만(시트 위 12px 여백 · 가운데로 맞추지 않음)",
      s3.state === "content" && f3.scrollY > f2.scrollY && gap >= 10 && gap <= 16,
      JSON.stringify({ scrollY: [f2.scrollY, f3.scrollY], gap, sheetTop: s3.top })
    );
    await shot(page, "preview-short-content");

    record(
      "P5. 스킨 좌표는 그대로(문서 기준 위치 불변) · draft 불변 · 기록 불변",
      f3.docTop === f0.docTop && f3.docBottom === f0.docBottom && (await draftHtml(page)) === d0 &&
        (await history(page)).undo === h0.undo,
      JSON.stringify({ doc0: [f0.docTop, f0.docBottom], doc3: [f3.docTop, f3.docBottom] })
    );

    await stepDown(page);
    await sleep(300);
    const f4 = await frameEl(page, ".sp-foot-text");
    const s4 = await sheet(page);
    record(
      "P6. 접힘으로 내려도 Preview 가 튀지 않는다(스크롤 그대로 · 글은 여전히 보임)",
      s4.state === "peek" && f4.scrollY === f3.scrollY && f4.screenBottom <= s4.top,
      JSON.stringify({ scrollY: [f3.scrollY, f4.scrollY] })
    );

    await page.click("#studioLeftPanelCollapse");
    await sleep(350);
    const f5 = await frameEl(page, ".sp-foot-text");
    record(
      "P7. 시트를 닫아도 스크롤 자리가 당겨지지 않는다(여유는 사용자가 위로 스크롤하는 만큼 줄어든다)",
      f5.scrollY === f4.scrollY && f5.inset.inset === 0,
      JSON.stringify({ scrollY: [f4.scrollY, f5.scrollY], inset: f5.inset })
    );

    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, -1000);
    await sleep(400);
    const f6 = await frameEl(page, ".sp-foot-text");
    record(
      "P8. 닫힌 뒤 맨 위로 스크롤하면 Studio 전용 여유가 사라진다",
      f6.scrollY === 0 && f6.inset.spacer === null,
      JSON.stringify(f6.inset)
    );

    await context.close();
  }

  /* ---- 긴 페이지 ---- */
  {
    const { page, context } = await openStudio(browser, { skin: LONG_SKIN });
    await enableSelect(page, ".lp-item-3");

    await realClick(page, ".lp-item-2");
    await waitSelected(page, "lp-item-2");
    const a0 = await frameEl(page, ".lp-item-2");
    await stepUp(page);
    await sleep(250);
    const a1 = await frameEl(page, ".lp-item-2");
    record(
      "P9. 긴 페이지 — 위쪽 요소는 내용 보기로 펼쳐도 이미 보이므로 스크롤하지 않는다",
      a0.scrollY === a1.scrollY,
      JSON.stringify({ a0: a0.scrollY, a1: a1.scrollY })
    );
    await stepDown(page);

    /* 접힌 시트 바로 위의 줄 */
    const target = await page.evaluate(() => {
      const panelTop = document.getElementById("studioLeftPanel").getBoundingClientRect().top;
      const frame = document.getElementById("studioPreviewFrame");
      const items = Array.from(frame.contentDocument.querySelectorAll(".lp-item"));
      const hit = items.filter(el => el.getBoundingClientRect().bottom < panelTop - 20).pop();
      return hit ? "." + hit.className.split(" ")[1] : null;
    });
    await realClick(page, target);
    await waitSelected(page, target.slice(1));
    await sleep(200);
    const b0 = await frameEl(page, target);
    await stepUp(page);
    await sleep(250);
    const b1 = await frameEl(page, target);
    const s1 = await sheet(page);
    const gap = s1.top - b1.screenBottom;
    record(
      "P10. 긴 페이지 — 아래쪽 요소를 내용 보기로 펼치면 그 요소가 시트 위 12px 까지만 올라온다(스크롤 = 가려진 만큼)",
      b1.scrollY > b0.scrollY && gap >= 10 && gap <= 16 && b1.docTop === b0.docTop,
      JSON.stringify({ target, scrollY: [b0.scrollY, b1.scrollY], gap })
    );

    await stepDown(page);
    await sleep(250);
    const b2 = await frameEl(page, target);
    record("P11. 긴 페이지 — 접어도 스크롤이 튀지 않는다", b2.scrollY === b1.scrollY, JSON.stringify({ scrollY: [b1.scrollY, b2.scrollY] }));

    /* Mobile Preview(축소 배율) */
    await page.click('[data-viewport-mode="mobile"]');
    await sleep(600);
    const scale = (await frameEl(page, target)).scale;
    await page.evaluate(() => { document.getElementById("studioPreviewFrame").contentWindow.scrollTo(0, 0); });
    await sleep(300);
    const low = await page.evaluate(() => {
      const frame = document.getElementById("studioPreviewFrame");
      const box = frame.getBoundingClientRect();
      const s = box.width / frame.offsetWidth;
      const panelTop = document.getElementById("studioLeftPanel").getBoundingClientRect().top;
      const items = Array.from(frame.contentDocument.querySelectorAll(".lp-item"));
      const hit = items.filter(el => box.top + el.getBoundingClientRect().bottom * s < panelTop - 20).pop();
      return hit ? "." + hit.className.split(" ")[1] : null;
    });
    await realClick(page, low);
    await waitSelected(page, low.slice(1));
    await sleep(200);
    const z0 = await sheet(page);
    await stepUp(page);
    await sleep(300);
    const z1 = await frameEl(page, low);
    const zs = await sheet(page);
    const frameBottom = await page.evaluate(() => document.getElementById("studioPreviewFrame").getBoundingClientRect().bottom);
    const expectInset = Math.ceil((frameBottom - zs.top) / scale);
    record(
      "P12. Mobile Preview(축소) — 여유는 프레임 px(가린 높이 ÷ 배율)이고, 펼치면 고른 요소가 시트 위에 보인다",
      scale < 1 && z0.state === "peek" && Math.abs(z1.inset.inset - expectInset) <= 1 && z1.screenBottom <= zs.top - 4,
      JSON.stringify({ scale, inset: z1.inset.inset, expectInset, bottom: z1.screenBottom, sheetTop: zs.top })
    );
    await shot(page, "preview-mobile-zoom");

    await context.close();
  }

}


/* =========================================================
   panels
========================================================== */

async function runPanels(browser) {

  const { page, context } = await openStudio(browser);
  await enableSelect(page);

  /* Select 입력하던 값 */
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await stepUp(page);
  const h0 = await history(page);
  await page.fill("#studioInspectorTextInput", "아직 적용하지 않은 글");
  await stepDown(page);
  await stepUp(page);
  await stepUp(page);
  await stepDown(page);
  const kept = await page.inputValue("#studioInspectorTextInput");
  record(
    "N1. Select 에서 입력하던 값(적용 전)이 접힘 · 전체 화면을 오가도 그대로 · 기록 불변",
    kept === "아직 적용하지 않은 글" && (await history(page)).undo === h0.undo,
    JSON.stringify({ kept })
  );
  await page.click("#studioInspectorTextInput");
  await page.keyboard.press("Escape");
  await sleep(150);

  /* Images */
  await page.click("#studioImagesButton");
  await page.waitForFunction(() => {
    const grid = document.querySelector("#studioLeftPanelImages .images-panel-grid");
    return grid && grid.children.length >= 2;
  }, null, { timeout: 6000 });
  await sleep(250);
  const i0 = await sheet(page);
  const scrolled = await page.evaluate(() => {
    const body = document.querySelector("#studioLeftPanelImages .images-panel-body");
    body.scrollTop = 60;
    return { top: body.scrollTop, max: body.scrollHeight - body.clientHeight };
  });
  await stepDown(page);
  await stepUp(page);
  const i1 = await page.evaluate(() => document.querySelector("#studioLeftPanelImages .images-panel-body").scrollTop);
  record(
    "N2. 상단 Images → 내용 보기로 열림 · 목록 스크롤이 접힘을 다녀와도 그대로",
    i0.mode === "images" && i0.state === "content" && scrolled.top > 0 && i1 === scrolled.top,
    JSON.stringify({ state: i0.state, scrolled, after: i1 })
  );
  await shot(page, "panels-images");

  /* Quick Bar 이미지 변경 → Images → 붙이면 고른 요소로 */
  await page.click("#studioInspectorButton");
  await sleep(200);
  await legacySelect(page, ".dx-avatar");
  const avatar = await waitSelected(page, "dx-avatar");
  await sleep(200);
  const q0 = await sheet(page);
  const imageButton = await page.evaluate(() => {
    const b = document.getElementById("studioInspectorQuickImage");
    const r = b.getBoundingClientRect();
    return { visible: !b.hidden && r.width > 0, inHeader: !!b.closest("#studioLeftPanelHeader") };
  });
  await page.click("#studioInspectorQuickImage");
  await sleep(400);
  const q1 = await sheet(page);
  const hA = await history(page);
  await page.waitForSelector("#studioLeftPanelImages .images-panel-card-attach", { timeout: 6000 });
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("#studioLeftPanelImages .images-panel-card-attach"));
    buttons[buttons.length - 1].click();
  });
  await sleep(400);
  const q2 = await sheet(page);
  const stillAvatar = await waitSelected(page, "dx-avatar");
  record(
    "N3. 접힘 머리의 '이미지 변경' → Images 내용 보기 → 사진을 붙이면 고른 요소로(Select · 접힘) · 한 칸",
    avatar && q0.state === "peek" && imageButton.visible && imageButton.inHeader &&
      q1.mode === "images" && q1.state === "content" &&
      q2.mode === "select" && q2.state === "peek" && stillAvatar && (await history(page)).undo === hA.undo + 1,
    JSON.stringify({ q0: q0.state, imageButton, q1: [q1.mode, q1.state], q2: [q2.mode, q2.state], stillAvatar })
  );

  /* Dock */
  await page.evaluate(() => window.showStudioLeftPanelMode("dock"));
  await page.waitForSelector("#studioLeftPanelDock .dock-panel-overlay--open", { timeout: 5000 });
  await sleep(250);
  const k0 = await sheet(page);
  const input = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll("#studioLeftPanelDock .dock-panel-input")).find(el => el.getClientRects().length > 0));
  await input.asElement().fill("시트 테스트");
  await stepUp(page);
  await stepDown(page);
  await stepDown(page);
  await page.click("#studioInspectorButton");
  await sleep(200);
  await page.evaluate(() => window.showStudioLeftPanelMode("dock"));
  await sleep(300);
  const k1 = await sheet(page);
  const dockValue = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#studioLeftPanelDock .dock-panel-input")).map(el => el.value));
  record(
    "N4. 상단 Dock → 내용 보기 · 적용 안 한 값이 전체/접힘 · Select 를 다녀와도 그대로",
    k0.mode === "dock" && k0.state === "content" && k1.mode === "dock" && dockValue.includes("시트 테스트"),
    JSON.stringify({ k0: k0.state, k1: [k1.mode, k1.state], dockValue })
  );

  const hD = await history(page);
  await page.click("#studioLeftPanelDock .dock-panel-button--primary");
  await sleep(500);
  const k2 = await sheet(page);
  const applied = await page.evaluate(() => {
    const dock = window.getStudioBottomDock();
    return JSON.stringify(dock || null);
  });
  const k2Visible = await page.evaluate(() => {
    const el = document.querySelector("#studioLeftPanelDock .dock-panel-overlay--open");
    return !!el && el.getClientRects().length > 0;
  });
  record(
    "N5. Dock 적용 — working draft 에 들어가고(한 칸) 시트는 닫히지 않는다(같은 내용 · 같은 단계)",
    applied.includes("시트 테스트") && (await history(page)).undo === hD.undo + 1 &&
      k2.open && k2.mode === "dock" && k2.state === k1.state && k2Visible,
    JSON.stringify({ k2: [k2.open, k2.mode, k2.state], k2Visible })
  );

  /* AI 를 열고 닫기 */
  await page.click("#studioInspectorButton");
  await sleep(200);
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await stepUp(page);
  const before = await sheet(page);
  await page.click("#studioAiToggleButton");
  await sleep(400);
  const during = await sheet(page);
  const ai = await page.evaluate(() => ({
    open: window.getStudioAiPanelLayoutState().open,
    sel: !!window.getStudioInspectorSelection()
  }));
  await page.click("#studioAiToggleButton");
  await sleep(400);
  const after = await sheet(page);
  const selBack = await waitSelected(page, "dx-bio");
  record(
    "N6. AI 를 열면 시트가 숨고(겹치지 않음) 선택은 유지 · 닫으면 같은 내용 · 같은 단계로 돌아온다",
    before.state === "content" && !during.open && ai.open && ai.sel &&
      after.open && after.mode === "select" && after.state === "content" && selBack,
    JSON.stringify({ before: before.state, during: during.open, ai, after: [after.open, after.mode, after.state] })
  );

  await context.close();

}


/* =========================================================
   quickbar
========================================================== */

async function runQuickbar(browser) {

  const { page, context } = await openStudio(browser);
  await enableSelect(page);

  /* 자유 배치 안의 사진 — 이미지 변경 · 앞/뒤 · 숨기기 · AI 다섯 */
  await realClick(page, ".dx-photo", 0.9, 0.9);
  let photo = await waitSelected(page, "dx-photo");
  if (!photo) {
    await page.waitForFunction(() => !document.getElementById("studioInspectorPickMenu").hidden, null, { timeout: 2000 }).catch(() => {});
    await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll("#studioInspectorPickMenu button"))
        .find(b => /사진|이미지/.test(b.textContent));
      if (item) item.click();
    });
    photo = await waitSelected(page, "dx-photo");
  }
  await sleep(250);

  const readBar = () => page.evaluate(() => {
    const header = document.getElementById("studioLeftPanelHeader").getBoundingClientRect();
    const bar = document.getElementById("studioInspectorQuickBar");
    /* 보이는 순서(CSS order)대로 */
    const visible = Array.from(bar.querySelectorAll(":scope > .studio-inspector-quick"))
      .filter(b => !b.hidden && b.getClientRects().length > 0)
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const rects = visible.map(b => b.getBoundingClientRect());
    const tops = rects.map(r => Math.round(r.top));
    const menu = document.getElementById("studioInspectorQuickMenu");
    return {
      count: visible.length,
      keys: visible.map(b => b.dataset.inspectorQuick),
      oneRow: tops.every(t => Math.abs(t - tops[0]) <= 1),
      insideHeader: rects.every(r => r.left >= header.left - 0.5 && r.right <= header.right + 0.5),
      sizes: rects.every(r => r.width >= 40 - 0.5 && r.height >= 44 - 0.5),
      labels: visible.every(b => (b.getAttribute("aria-label") || "").length > 0 && (b.title || "").length > 0),
      moreShown: !document.getElementById("studioInspectorQuickMore").hidden,
      menuHidden: menu.hidden,
      menuKeys: Array.from(menu.children).filter(b => !b.hidden).map(b => b.dataset.inspectorQuick),
      barScroll: bar.scrollWidth <= bar.clientWidth + 1,
      nameWidth: Math.round(document.getElementById("studioLeftPanelName").getBoundingClientRect().width),
      pageOverflow: document.documentElement.scrollWidth <= window.innerWidth
    };
  });

  const q = await readBar();
  record(
    "Q1. 접힘 머리의 Quick Bar — 한 줄 · 머리 안 · 칸마다 40×44 이상 · 이름(aria-label · title) · 자리가 되면 넷 다 직접(AI · 숨기기 · 앞 · 뒤) · 가로 스크롤 0",
    photo && q.oneRow && q.insideHeader && q.sizes && q.labels && !q.moreShown && q.menuHidden &&
      q.keys.join(",") === "ai,hide,forward,backward" && q.nameWidth >= 90 && q.barScroll && q.pageOverflow,
    JSON.stringify(q)
  );
  await shot(page, "quickbar-peek");

  /* 내용 보기 — 단계 버튼이 둘이라 한 칸 좁다 → 넘치는 것은 ··· */
  await stepUp(page);
  const qc = await readBar();
  record(
    "Q2. 내용 보기(단계 버튼 둘) — 칸 수를 다시 재어 자주 쓰는 것(AI · 숨기기)만 직접, 나머지(앞 · 뒤)는 ··· 목록으로 · 여전히 한 줄 · 넘침 0",
    qc.oneRow && qc.insideHeader && qc.sizes && qc.moreShown && qc.menuHidden &&
      qc.keys.join(",") === "ai,hide,more" && qc.menuKeys.join(",") === "forward,backward" &&
      qc.nameWidth >= 90 && qc.pageOverflow,
    JSON.stringify(qc)
  );

  await page.click("#studioInspectorQuickMore");
  await sleep(150);
  const m = await page.evaluate(() => {
    const menu = document.getElementById("studioInspectorQuickMenu");
    const r = menu.getBoundingClientRect();
    const panelTop = document.getElementById("studioLeftPanel").getBoundingClientRect().top;
    const items = Array.from(menu.querySelectorAll(".studio-inspector-quick")).filter(b => !b.hidden);
    const first = items.find(b => !b.disabled);
    const fr = first ? first.getBoundingClientRect() : null;
    const hit = fr ? document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2) : null;
    return {
      open: !menu.hidden,
      expanded: document.getElementById("studioInspectorQuickMore").getAttribute("aria-expanded"),
      aboveSheet: r.bottom <= panelTop + 0.5,
      inside: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0,
      hitOk: !!(hit && first && first.contains(hit)),
      firstKey: first ? first.dataset.inspectorQuick : null,
      texts: items.map(b => b.textContent.trim())
    };
  });
  record(
    "Q3. ··· 를 누르면 나머지가 시트 위 목록으로(글자와 함께) · 화면 안 · 눌린다",
    m.open && m.expanded === "true" && m.aboveSheet && m.inside && m.hitOk && m.texts.every(t => t.length > 1),
    JSON.stringify(m)
  );
  await shot(page, "quickbar-menu");

  const h0 = await history(page);
  await page.click(`#studioInspectorQuickMenu [data-inspector-quick="${m.firstKey}"]`);
  await sleep(400);
  const afterClick = await page.evaluate(() => document.getElementById("studioInspectorQuickMenu").hidden);
  record(
    "Q4. 목록의 버튼을 누르면 그 일이 되고(↶ 한 칸) 목록은 닫힌다",
    (await history(page)).undo === h0.undo + 1 && afterClick,
    JSON.stringify({ key: m.firstKey, closed: afterClick })
  );

  await page.click("#studioInspectorQuickMore");
  await sleep(100);
  await page.keyboard.press("Escape");
  await sleep(150);
  const esc = await page.evaluate(() => ({
    menuHidden: document.getElementById("studioInspectorQuickMenu").hidden,
    sel: !!window.getStudioInspectorSelection(),
    state: window.getStudioSheetState()
  }));
  record("Q5. Escape 는 ··· 목록을 먼저 닫는다(선택 · 단계 그대로)", esc.menuHidden && esc.sel && esc.state === "content", JSON.stringify(esc));

  await stepDown(page);
  const qp = await readBar();
  record(
    "Q6. 다시 접힘 — ··· 로 옮겼던 버튼이 제자리로 돌아와 넷 다 직접",
    !qp.moreShown && qp.keys.join(",") === "ai,hide,forward,backward" && qp.oneRow,
    JSON.stringify(qp)
  );

  await context.close();

}


/* =========================================================
   keyboard
========================================================== */

async function runKeyboard(browser) {

  const { page, context } = await openStudio(browser, { keyboard: true });
  await enableSelect(page);

  await page.evaluate(() => window.showStudioLeftPanelMode("dock"));
  await page.waitForSelector("#studioLeftPanelDock .dock-panel-overlay--open", { timeout: 5000 });
  await sleep(250);
  const input = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll("#studioLeftPanelDock .dock-panel-input")).find(el => el.getClientRects().length > 0));
  await input.asElement().click();
  const k0 = await sheet(page);
  await page.evaluate(() => window.__setKeyboard(320));
  await sleep(300);
  const k1 = await sheet(page);
  const apply = await page.evaluate(() => {
    const b = document.querySelector("#studioLeftPanelDock .dock-panel-button--primary").getBoundingClientRect();
    return { bottom: Math.round(b.bottom), top: Math.round(b.top) };
  });
  const focusKept = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("dock-panel-input"));
  record(
    "K1. 키보드가 열리면 시트 아래 끝이 키보드 위로 · 단계 그대로 · 적용 버튼이 키보드 위 · 입력 포커스 유지",
    k1.state === k0.state && k1.bottom === k1.vh - 320 && apply.bottom <= k1.vh - 320 && k1.top >= k1.barBottom && focusKept,
    JSON.stringify({ k0: [k0.state, k0.bottom], k1: [k1.state, k1.top, k1.bottom], apply })
  );
  await shot(page, "keyboard-content");

  await stepUp(page);
  const k2 = await sheet(page);
  record(
    "K2. 키보드가 열린 채 전체 화면 — 상단 바 아래부터 키보드 위까지(100vh 로 잘리지 않음)",
    k2.state === "full" && Math.abs(k2.top - k2.chromeBottom) <= 1 && k2.bottom === k2.vh - 320,
    JSON.stringify(k2)
  );

  await page.evaluate(() => window.__setKeyboard(0));
  await sleep(300);
  const k3 = await sheet(page);
  record("K3. 키보드를 닫으면 시트가 화면 아래로 돌아오고 단계는 그대로", k3.state === "full" && k3.bottom === k3.vh, JSON.stringify(k3));
  await stepDown(page);

  /* Select 글자 칸 + 키보드 */
  await page.click("#studioInspectorButton");
  await sleep(200);
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await stepUp(page);
  await page.click("#studioInspectorTextInput");
  await page.evaluate(() => window.__setKeyboard(320));
  await sleep(300);
  const t = await page.evaluate(() => {
    const apply = Array.from(document.querySelectorAll("#studioInspectorPopover button")).find(b => b.textContent.trim() === "적용");
    const r = apply.getBoundingClientRect();
    const body = document.getElementById("studioLeftPanelBody").getBoundingClientRect();
    return { applyBottom: Math.round(r.bottom), bodyBottom: Math.round(body.bottom), vh: window.innerHeight };
  });
  record(
    "K4. Select 글자 칸 + 키보드 — 적용 버튼이 키보드 위에 있다",
    t.applyBottom <= t.vh - 320 && t.bodyBottom <= t.vh - 320,
    JSON.stringify(t)
  );
  await page.evaluate(() => window.__setKeyboard(0));
  await sleep(200);
  await page.keyboard.press("Escape");
  await sleep(200);
  const esc = await sheet(page);
  const escSel = await waitSelected(page, "dx-bio", 1000);
  record(
    "K4b. 시트 안 입력칸(초안 없음)에서 누른 Escape 는 시트를 한 단계 내린다(선택 유지)",
    esc.state === "peek" && escSel,
    JSON.stringify({ state: esc.state, escSel })
  );
  await stepUp(page);

  /* Preview 안 더블클릭 글자 편집 — 잠시 접힘, 확정하면 원래 단계 */
  const s0 = await sheet(page);
  const h0 = await history(page);
  const p = await pointIn(page, ".dx-bio", 0.3, 0.5);
  await page.mouse.dblclick(p.x, p.y);
  await sleep(300);
  const s1 = await sheet(page);
  await page.evaluate(() => window.__setKeyboard(300));
  await sleep(300);
  const bio = await frameEl(page, ".dx-bio");
  const s2 = await sheet(page);
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.keyboard.press(`${MOD}+Enter`);
  await sleep(400);
  await page.evaluate(() => window.__setKeyboard(0));
  await sleep(300);
  const s3 = await sheet(page);
  record(
    "K5. Preview 안 글자 편집 중에는 시트가 잠시 접힘 · 키보드가 열려도 그 글자가 시트/키보드에 덮이지 않음 · 확정하면 원래 단계",
    s0.state === "content" && s1.state === "peek" && bio.screenBottom <= s2.top && s3.state === "content" &&
      (await history(page)).undo === h0.undo + 1,
    JSON.stringify({ s0: s0.state, s1: s1.state, bioBottom: bio.screenBottom, sheetTop: s2.top, s3: s3.state })
  );

  await context.close();

}


/* =========================================================
   desktop
========================================================== */

async function runDesktop(browser) {

  const { page, context } = await openStudio(browser, { viewport: { width: 1280, height: 800 } });
  await enableSelect(page);
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await sleep(250);

  const d = await page.evaluate(() => {
    const panel = document.getElementById("studioLeftPanel").getBoundingClientRect();
    const stage = document.getElementById("studioPreviewStage").getBoundingClientRect();
    const bar = document.getElementById("studioTopDock").getBoundingClientRect();
    const shown = (id) => { const el = document.getElementById(id); return !!el && el.getClientRects().length > 0; };
    const bar2 = document.getElementById("studioInspectorQuickBar");
    const frame = document.getElementById("studioPreviewFrame").contentWindow;
    return {
      panel: { left: panel.left, width: Math.round(panel.width), top: Math.round(panel.top), bottom: Math.round(panel.bottom) },
      stageLeft: Math.round(stage.left),
      barBottom: Math.round(bar.bottom),
      vh: window.innerHeight,
      handle: shown("studioLeftPanelHandle"),
      name: shown("studioLeftPanelName"),
      up: shown("studioLeftPanelSheetUp"),
      down: shown("studioLeftPanelSheetDown"),
      collapse: shown("studioLeftPanelCollapse"),
      collapseLabel: document.getElementById("studioLeftPanelCollapse").getAttribute("aria-label"),
      collapseText: document.getElementById("studioLeftPanelCollapse").textContent,
      barDocked: bar2.classList.contains("is-docked"),
      barInHeader: !!bar2.closest("#studioLeftPanelHeader"),
      popoverVisible: !document.getElementById("studioInspectorPopover").hidden &&
        document.getElementById("studioInspectorPopover").getClientRects().length > 0,
      titleVisible: document.getElementById("studioInspectorPopoverTitle").getClientRects().length > 0,
      frameInset: frame.__imoryStudioSheetInset(),
      sheetVar: getComputedStyle(document.getElementById("studioPreviewShell")).getPropertyValue("--studio-mobile-sheet-height").trim()
    };
  });
  record(
    "D1. 1280px — 왼쪽 패널 320px · stage 가 그만큼 밀림 · 바 아래 ~ 화면 아래 · 머리는 제목과 ‹ 뿐(손잡이 · 이름 · 단계 버튼 없음)",
    d.panel.left === 0 && d.panel.width === 320 && d.stageLeft === 320 && Math.abs(d.panel.top - d.barBottom) <= 1 &&
      d.panel.bottom === d.vh && !d.handle && !d.name && !d.up && !d.down && d.collapse &&
      d.collapseLabel === "편집 패널 접기" && d.collapseText === "‹",
    JSON.stringify(d)
  );
  record(
    "D2. 1280px — Quick Bar 는 예전처럼 요소 옆에 뜬다(시트 머리가 아님) · 팝오버 제목도 그대로 · Preview 여유 0",
    !d.barDocked && !d.barInHeader && d.popoverVisible && d.titleVisible &&
      d.frameInset.inset === 0 && d.frameInset.spacer === null && d.sheetVar === "0px",
    JSON.stringify({ barDocked: d.barDocked, barInHeader: d.barInHeader, frameInset: d.frameInset, sheetVar: d.sheetVar })
  );

  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press("Escape");
  await sleep(150);
  record(
    "D3. 1280px — Escape 는 예전처럼 곧바로 선택 해제",
    !(await page.evaluate(() => window.getStudioInspectorSelection())),
    ""
  );

  await context.close();

}


/* =========================================================
   실행
========================================================== */

(async () => {

  const server = await startServer();
  let browser = null;

  try {

    const pw = await loadPlaywright(BROWSER);
    browser = await pw[BROWSER].launch();

    const sections = [
      ["states", runStates],
      ["preview", runPreview],
      ["panels", runPanels],
      ["quickbar", runQuickbar],
      ["keyboard", runKeyboard],
      ["desktop", runDesktop]
    ];

    for (const [name, run] of sections) {
      if (!shouldRun(name)) continue;
      console.log(`\n[${name}]`);
      try {
        await run(browser);
      } catch (err) {
        record(`${name} — 예외 없이 끝난다`, false, String(err && err.stack || err).split("\n").slice(0, 4).join(" | "));
      }
    }

    record(
      "Z. console/page 오류가 없다",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 5).join("\n        ")
    );

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    failed.forEach(f => console.log(`  - ${f.name}`));
    process.exit(1);
  }

})();
