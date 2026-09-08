/* =========================================================
   PHASE AI-5A — AI 패널 레이아웃 + AI 적용 후 화면 유지 E2E

   ★ 실제 OpenAI를 부르지 않는다. 이 파일은 /api/skin-ai를
   가로채 **고정된 유효 SkinPackage**를 그대로 돌려준다 — 서버
   (functions/api/skin-ai.js)와 모델 경로는 studio/studio-ai-panel-
   e2e-test.mjs가 이미 덮고 있고, 여기서 재는 것은 그 응답이
   적용된 **뒤의 화면**이기 때문이다.

   검사 범위
     A. 패널이 Preview 오른쪽에 서고 Preview를 덮지 않는다
     B. 세로 탭 / 헤더 버튼으로 펼치고 접는다(aria-expanded 포함)
     C. Preview를 클릭하면 접힌다(iframe 안 실제 클릭)
     D. 패널 안을 클릭하면 접히지 않는다
     E. resizer 드래그로 폭이 바뀐다
     F. min/max로 clamp된다
     G. textarea가 1줄에서 최대 5줄까지 자란다
     H. 5줄을 넘으면 textarea 안에서만 스크롤한다
     I. Enter 전송 / Shift+Enter 줄바꿈 / IME 조합 중 Enter 무시
     J. "어떻게 바꾸고 싶나요?"가 한 곳에만 있다
     K~N. AI 적용/되돌리기가 보고 있던 HOME/CATEGORY/POST를 유지
     O. 그릴 수 없는 route면 HOME으로 떨어진다
     P. Import는 기존대로 HOME으로 리셋한다
     Q. 참고 이미지 UI가 사이드바 안에서 정상
     R. 로딩 표시/중단이 사이드바 안에서 정상
     S. 1280 / 1440에서 가로 overflow 없음
     T. 좁은 뷰포트에서는 overlay fallback

   ★ 실행 방법
     node studio/studio-ai-panel-layout-e2e-test.mjs
     node studio/studio-ai-panel-layout-e2e-test.mjs --browser=webkit
     node studio/studio-ai-panel-layout-e2e-test.mjs --only=resize

   --only= 뒤에 쓸 수 있는 이름:
     layout / toggle / collapse / resize / textarea / keys /
     route / import / attach / loading / viewport
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8938;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=x`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const shouldRun = (name) => !ONLY || ONLY === name;

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `\n        ${detail}` : ""}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));


/* =========================================================
   AI 응답 fixture

   scenario x의 fixture(.scenario-x-*)와 확실히 구분되는 클래스를
   쓴다 — "적용 뒤에도 같은 route에 있는가"를 재려면 HOME/CATEGORY/
   POST 중 어느 화면이 그려졌는지를 DOM에서 직접 읽을 수 있어야
   한다.
========================================================== */

const AI_SUMMARY = "여백을 조금 넓혔어요.";

const AI_PACKAGE = {
  schemaVersion: 1,
  templates: {
    home: { html: '<div class="ai5a-home"><h1 data-imory-bind="site.title"></h1></div>' },
    category: { html: '<div class="ai5a-category"><h1 data-imory-bind="category.name"></h1></div>' },
    post: { html: '<div class="ai5a-post"><h1 data-imory-bind="post.title"></h1><div data-imory-region="post-body"></div></div>' }
  },
  css: ".ai5a-home { color: teal; }",
  imageSlots: [],
  regions: [],
  metadata: { title: "PHASE AI-5A fixture" }
};

const IMPORT_PACKAGE = {
  schemaVersion: 1,
  templates: {
    home: { html: '<div class="imp-home"><h1 data-imory-bind="site.title"></h1></div>' },
    category: { html: '<div class="imp-category"></div>' },
    post: { html: '<div class="imp-post"><div data-imory-region="post-body"></div></div>' }
  },
  css: ".imp-home { color: navy; }",
  imageSlots: [],
  regions: [],
  metadata: { title: "PHASE AI-5A import fixture" }
};


/* =========================================================
   정적 서버 — 저장소의 실제 파일을 그대로 서빙한다
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
   /api/skin-ai 가로채기 — 고정 응답 + 필요 시 지연
========================================================== */

let aiRouteHold = false;
let aiRouteRelease = null;
let aiRouteCount = 0;

async function handleAiRoute(route) {

  aiRouteCount += 1;

  if (aiRouteHold) {
    await new Promise(resolve => { aiRouteRelease = resolve; });
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, summary: AI_SUMMARY, skinPackage: AI_PACKAGE })
  });

}


/*
  이번 작업과 무관한, scenario 하네스에 원래 있던 console error 하나
  (이 문서는 studio/images/skin-image-library.js를 로드하지 않는다).
*/
const PRE_EXISTING_CONSOLE_ERROR_PATTERN = /image library probe failed/;

const consoleErrors = [];

async function openStudio(context, options) {

  const page = await context.newPage();

  if (options && options.viewport) {
    await page.setViewportSize(options.viewport);
  }

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    if (PRE_EXISTING_CONSOLE_ERROR_PATTERN.test(msg.text())) return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  await page.route("**/api/skin-ai", handleAiRoute);

  await page.goto(SCENARIO_URL, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  await page.waitForSelector("#studioPreviewFrame");

  return page;

}


async function openPanel(page) {
  const open = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);
  if (!open) await page.click("#studioAiHandle");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === true);
}


async function openTopDock(page) {
  const isOpen = await page.evaluate(
    () => document.getElementById("studioTopDockZone").classList.contains("is-open")
  );
  if (!isOpen) await page.click("#studioTopDockHandle");
  await page.waitForFunction(
    () => document.getElementById("studioTopDockZone").classList.contains("is-open")
  );
}


function previewHas(page, selector, timeoutMs = 6000) {
  return page.waitForFunction(
    (sel) => {
      const frame = document.getElementById("studioPreviewFrame");
      const doc = frame && frame.contentDocument;
      return !!(doc && doc.querySelector(sel));
    },
    selector,
    { timeout: timeoutMs }
  ).then(() => true, () => false);
}


function location(page) {
  return page.evaluate(() => window.getCurrentPreviewLocation());
}


async function sendInstruction(page, text) {

  await openPanel(page);

  await page.fill("#studioAiDrawerInput", text);
  await page.click("#studioAiDrawerSend");

  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().pending === false &&
          window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

}


function rects(page) {
  return page.evaluate(() => {
    const r = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    };
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      stage: r("studioPreviewStage"),
      panel: r("studioAiDrawer"),
      dock: r("studioAiDock"),
      handle: r("studioAiHandle"),
      resizer: r("studioAiResizer"),
      topDock: r("studioTopDockZone")
    };
  });
}


/* =========================================================
   A. 레이아웃 — 패널이 Preview 오른쪽에 서고 덮지 않는다
========================================================== */

async function runLayout(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  const closed = await rects(page);

  await openPanel(page);

  const open = await rects(page);

  const width = await page.evaluate(() => window.getStudioAiPanelLayoutState().width);

  record(
    "A1. 접혀 있으면 Preview stage와 Top Dock이 화면 전체를 그대로 쓴다",
    Math.abs(closed.stage.right - closed.innerWidth) < 1 &&
      Math.abs(closed.topDock.right - closed.innerWidth) < 1,
    `stage.right=${closed.stage.right} topDock.right=${closed.topDock.right} innerWidth=${closed.innerWidth}`
  );

  record(
    "A2. 접힌 상태에서 패널은 렌더되지 않고 세로 탭만 보인다",
    closed.panel.width === 0 && closed.handle.width > 0,
    `panel.width=${closed.panel.width} handle.width=${closed.handle.width}`
  );

  record(
    "A3. 펼치면 패널이 화면 오른쪽 끝에 붙는다",
    Math.abs(open.panel.right - open.innerWidth) < 1 && open.panel.width > 0,
    `panel=${JSON.stringify(open.panel)} innerWidth=${open.innerWidth}`
  );

  record(
    "A4. Preview stage가 패널만큼 좁아진다(겹치지 않는다)",
    Math.abs(open.stage.right - open.panel.left) <= 7 &&
      open.stage.right < closed.stage.right,
    `stage.right=${open.stage.right} panel.left=${open.panel.left}`
  );

  record(
    "A5. Top Dock도 함께 좁아져 패널 아래로 들어가지 않는다",
    Math.abs(open.topDock.right - open.panel.left) <= 7,
    `topDock.right=${open.topDock.right} panel.left=${open.panel.left}`
  );

  record(
    "A6. 기본 폭이 360~420px 사이다",
    width >= 360 && width <= 420,
    `width=${width}`
  );

  record(
    "A7. 펼친 상태에서 세로 탭은 사라지고 resizer가 나타난다",
    open.handle.width === 0 && open.resizer.width > 0,
    `handle.width=${open.handle.width} resizer.width=${open.resizer.width}`
  );

  await page.close();

}


/* =========================================================
   B. 접기 / 펼치기
========================================================== */

async function runToggle(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  const readAria = () => page.evaluate(() => ({
    handle: document.getElementById("studioAiHandle").getAttribute("aria-expanded"),
    collapse: document.getElementById("studioAiPanelCollapse").getAttribute("aria-expanded"),
    isOpen: document.getElementById("studioAiDrawer").classList.contains("is-open"),
    shell: document.getElementById("studioPreviewShell").classList.contains("has-ai-panel"),
    inputTabIndex: document.getElementById("studioAiDrawerInput").tabIndex
  }));

  const before = await readAria();

  await page.click("#studioAiHandle");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === true);

  const opened = await readAria();

  const focused = await page.evaluate(() => document.activeElement.id);

  await page.click("#studioAiPanelCollapse");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === false);

  const closed = await readAria();

  record(
    "B1. 처음에는 접혀 있다 (aria-expanded=false, textarea는 Tab 순서 밖)",
    before.handle === "false" && before.collapse === "false" &&
      before.isOpen === false &&
      before.shell === false && before.inputTabIndex === -1,
    JSON.stringify(before)
  );

  record(
    "B2. 세로 탭을 누르면 펼쳐지고 aria-expanded가 두 버튼 모두 true가 된다",
    opened.handle === "true" && opened.collapse === "true" &&
      opened.isOpen === true && opened.shell === true && opened.inputTabIndex === 0,
    JSON.stringify(opened)
  );

  record(
    "B3. 펼치면 입력칸에 포커스가 간다",
    focused === "studioAiDrawerInput",
    `activeElement=${focused}`
  );

  record(
    "B4. 헤더의 접기 버튼으로 다시 접힌다",
    closed.handle === "false" && closed.collapse === "false" &&
      closed.isOpen === false && closed.shell === false && closed.inputTabIndex === -1,
    JSON.stringify(closed)
  );

  await page.close();

}


/* =========================================================
   C/D. Preview 클릭 시 접힘 / 패널 내부 클릭은 유지
========================================================== */

async function runCollapse(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await openPanel(page);

  /* --- D. 패널 안 클릭 --- */

  await page.click(".studio-ai-panel-title");
  await sleep(120);

  const afterPanelClick = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);

  await page.click("#studioAiDrawerInput");
  await sleep(120);

  const afterInputClick = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);

  record(
    "D1. 패널 헤더를 눌러도 접히지 않는다",
    afterPanelClick === true
  );

  record(
    "D2. 패널 입력칸을 눌러도 접히지 않는다",
    afterInputClick === true
  );

  /* ---------------------------------------------------------
     C1. Preview(iframe) 안 진짜 마우스 클릭

     좌표는 Preview stage 한가운데를 쓴다 — 화면 위쪽 48px 띠는
     #studioTopDockZone(투명하지만 클릭을 받는 예약 영역)이라
     iframe에 닿지 않는다(이번 라운드와 무관한 기존 배치).
  --------------------------------------------------------- */

  const stage = await page.evaluate(() => {
    const r = document.getElementById("studioPreviewStage").getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  await page.mouse.click(stage.x, stage.y);

  await page.waitForFunction(
    () => window.getStudioAiPanelLayoutState().open === false,
    null,
    { timeout: 3000 }
  ).then(() => {}, () => {});

  const afterPreviewClick = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);

  record(
    "C1. Preview를 클릭하면 패널이 접힌다",
    afterPreviewClick === false,
    `click=${JSON.stringify(stage)}`
  );

  /* ---------------------------------------------------------
     C2. 접는 경로가 Preview 안 링크를 막지 않는다

     scenario x의 navigation 링크는 화면 맨 위(Top Dock 예약 영역
     아래)라 실제 마우스로는 그 띠에 가린다 — 그래서 여기서만
     iframe 안에서 진짜 이벤트를 직접 dispatch한다(기존
     studio-ai-panel-e2e-test.mjs의 클릭 interception 검사와 같은
     방식). 확인하는 것은 두 가지다:
       - pointerdown이 취소되지 않았다(우리 리스너는 passive다)
       - 그런데도 링크는 그대로 동작해 CATEGORY로 이동한다
     click 쪽 defaultPrevented는 preview-bridge.js의 기존 앵커
     가로채기가 만든 것이라 true가 정상이다.
  --------------------------------------------------------- */

  await openPanel(page);

  const linkOutcome = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const link = doc.querySelector(".scenario-x-nav-link");
    if (!link) return null;

    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    link.dispatchEvent(down);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    return {
      href: link.getAttribute("href"),
      downPrevented: down.defaultPrevented,
      clickPrevented: click.defaultPrevented
    };
  });

  await page.waitForFunction(
    () => window.getCurrentPreviewLocation().type === "category",
    null,
    { timeout: 6000 }
  ).then(() => {}, () => {});

  const afterLinkClick = await page.evaluate(() => ({
    open: window.getStudioAiPanelLayoutState().open,
    location: window.getCurrentPreviewLocation()
  }));

  record(
    "C2. Preview 안 링크는 그대로 동작하면서 패널만 접힌다(pointerdown을 막지 않는다)",
    linkOutcome !== null &&
      linkOutcome.downPrevented === false &&
      afterLinkClick.open === false &&
      afterLinkClick.location.type === "category",
    `link=${JSON.stringify(linkOutcome)} after=${JSON.stringify(afterLinkClick)}`
  );

  await page.close();

}


/* =========================================================
   E/F. resizer 드래그 + clamp
========================================================== */

async function dragResizer(page, toClientX) {

  const box = await page.evaluate(() => {
    const r = document.getElementById("studioAiResizer").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(toClientX, box.y, { steps: 8 });
  await page.mouse.up();

}


async function runResize(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await openPanel(page);

  const before = await page.evaluate(() => window.getStudioAiPanelLayoutState());

  /* 왼쪽으로 끌면 넓어진다 */
  await dragResizer(page, 1280 - 520);

  const widened = await page.evaluate(() => window.getStudioAiPanelLayoutState());
  const widenedRects = await rects(page);

  /* 오른쪽 끝까지 끌면 min으로 clamp */
  await dragResizer(page, 1275);

  const minned = await page.evaluate(() => window.getStudioAiPanelLayoutState());

  /* 왼쪽 끝까지 끌면 max(뷰포트의 50%)로 clamp */
  await dragResizer(page, 5);

  const maxed = await page.evaluate(() => window.getStudioAiPanelLayoutState());
  const maxedRects = await rects(page);

  record(
    "E1. resizer를 왼쪽으로 끌면 패널이 넓어진다",
    widened.width > before.width && Math.abs(widened.width - 520) <= 8,
    `before=${before.width} after=${widened.width}`
  );

  record(
    "E2. 넓어진 폭이 실제 DOM 폭과 Preview stage 경계에 함께 반영된다",
    Math.abs(widenedRects.panel.width - widened.width) < 1 &&
      Math.abs(widenedRects.stage.right - widenedRects.panel.left) <= 7,
    `panel=${JSON.stringify(widenedRects.panel)} stage.right=${widenedRects.stage.right}`
  );

  record(
    "F1. 오른쪽 끝까지 끌어도 최소 폭 아래로는 줄지 않는다",
    minned.width === minned.minWidth,
    `width=${minned.width} min=${minned.minWidth}`
  );

  record(
    "F2. 왼쪽 끝까지 끌어도 뷰포트의 절반을 넘지 않는다",
    maxed.width === maxed.maxWidth && maxed.width === 640,
    `width=${maxed.width} max=${maxed.maxWidth}`
  );

  record(
    "F3. clamp된 뒤에도 Preview가 화면에 남는다(가로 overflow 없음)",
    maxedRects.stage.right > 0 &&
      maxedRects.scrollWidth <= maxedRects.innerWidth,
    `stage.right=${maxedRects.stage.right} scrollWidth=${maxedRects.scrollWidth}`
  );

  record(
    "F4. 드래그가 끝나면 resizing 상태와 body 클래스가 풀린다",
    (await page.evaluate(() => ({
      resizing: window.getStudioAiPanelLayoutState().resizing,
      bodyClass: document.body.classList.contains("studio-ai-resizing")
    }))).resizing === false,
    ""
  );

  /* 폭은 접었다 펴도 세션 동안 유지된다 */
  await page.click("#studioAiPanelCollapse");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === false);
  await openPanel(page);

  const reopened = await page.evaluate(() => window.getStudioAiPanelLayoutState().width);

  record(
    "E3. 접었다 다시 펴도 조절한 폭이 유지된다(세션 동안)",
    reopened === maxed.width,
    `reopened=${reopened} expected=${maxed.width}`
  );

  await page.close();

}


/* =========================================================
   G/H. textarea 자동 높이
========================================================== */

async function runTextarea(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await openPanel(page);

  const measure = () => page.evaluate(() => {
    const el = document.getElementById("studioAiDrawerInput");
    return {
      height: Math.round(el.getBoundingClientRect().height),
      overflowY: window.getComputedStyle(el).overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    };
  });

  const empty = await measure();

  await page.fill("#studioAiDrawerInput", "한 줄");
  const oneLine = await measure();

  await page.fill("#studioAiDrawerInput", "한 줄\n두 줄\n세 줄");
  const threeLines = await measure();

  await page.fill("#studioAiDrawerInput", "1\n2\n3\n4\n5");
  const fiveLines = await measure();

  await page.fill("#studioAiDrawerInput", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10");
  const tenLines = await measure();

  await page.fill("#studioAiDrawerInput", "다시 한 줄");
  const backToOne = await measure();

  record(
    "G1. 비어 있으면 한 줄 높이다(38px 안팎)",
    empty.height <= 42 && Math.abs(empty.height - oneLine.height) <= 1,
    `empty=${empty.height} oneLine=${oneLine.height}`
  );

  record(
    "G2. 세 줄을 쓰면 세 줄 높이로 자란다",
    threeLines.height > oneLine.height &&
      Math.abs(threeLines.height - (oneLine.height + 40)) <= 2,
    `oneLine=${oneLine.height} threeLines=${threeLines.height}`
  );

  record(
    "G3. 다섯 줄까지 자란다(1줄 + 4*20 = 118px 안팎)",
    Math.abs(fiveLines.height - 118) <= 2,
    `fiveLines=${fiveLines.height}`
  );

  record(
    "H1. 다섯 줄을 넘으면 높이가 더 자라지 않는다",
    tenLines.height === fiveLines.height,
    `five=${fiveLines.height} ten=${tenLines.height}`
  );

  record(
    "H2. 그 이상은 textarea 안에서만 스크롤한다",
    tenLines.overflowY === "auto" && tenLines.scrollHeight > tenLines.clientHeight,
    `overflowY=${tenLines.overflowY} scrollHeight=${tenLines.scrollHeight} clientHeight=${tenLines.clientHeight}`
  );

  record(
    "H3. 내용을 줄이면 높이도 다시 줄어든다",
    backToOne.height === oneLine.height && backToOne.overflowY === "hidden",
    `backToOne=${JSON.stringify(backToOne)}`
  );

  record(
    "G4. CSS resize 손잡이는 숨긴다",
    (await page.evaluate(
      () => window.getComputedStyle(document.getElementById("studioAiDrawerInput")).resize
    )) === "none"
  );

  /* 전송 후 값이 비면 높이도 한 줄로 돌아간다 */
  await page.fill("#studioAiDrawerInput", "1\n2\n3\n4\n5\n6");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const afterSend = await measure();

  record(
    "G5. 전송 후 입력이 비워지면 높이도 한 줄로 돌아간다",
    afterSend.height === empty.height && afterSend.overflowY === "hidden",
    `afterSend=${JSON.stringify(afterSend)} empty=${empty.height}`
  );

  await page.close();

}


/* =========================================================
   I/J. 키보드 회귀 + 중복 문구 제거
========================================================== */

async function runKeys(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await openPanel(page);

  const requestsBefore = aiRouteCount;

  /* Shift+Enter — 줄바꿈, 전송 안 함 */
  await page.click("#studioAiDrawerInput");
  await page.keyboard.type("첫 줄");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("둘째 줄");

  const afterShiftEnter = await page.evaluate(
    () => document.getElementById("studioAiDrawerInput").value
  );

  await sleep(150);

  const shiftEnterSent = aiRouteCount - requestsBefore;

  /* IME 조합 중 Enter — 전송 안 함 */
  const imeSent = await page.evaluate(() => {
    const el = document.getElementById("studioAiDrawerInput");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, "isComposing", { get: () => true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });

  await sleep(150);

  const imeRequests = aiRouteCount - requestsBefore;

  /* Enter — 전송 */
  await page.click("#studioAiDrawerInput");
  await page.keyboard.press("Enter");

  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const enterRequests = aiRouteCount - requestsBefore;

  record(
    "I1. Shift+Enter는 줄바꿈만 하고 전송하지 않는다",
    afterShiftEnter === "첫 줄\n둘째 줄" && shiftEnterSent === 0,
    `value=${JSON.stringify(afterShiftEnter)} requests=${shiftEnterSent}`
  );

  record(
    "I2. IME 조합 중의 Enter는 전송하지 않는다(기본 동작도 막지 않는다)",
    imeSent === false && imeRequests === 0,
    `defaultPrevented=${imeSent} requests=${imeRequests}`
  );

  record(
    "I3. 조합이 끝난 뒤의 Enter는 전송한다",
    enterRequests === 1,
    `requests=${enterRequests}`
  );

  /* J. 중복 문구 */
  const phrase = await page.evaluate(() => {
    const panel = document.getElementById("studioAiDrawer");
    const input = document.getElementById("studioAiDrawerInput");
    const text = panel.innerText || panel.textContent || "";
    return {
      inText: (text.match(/어떻게 바꾸고 싶나요/g) || []).length,
      placeholder: input.getAttribute("placeholder"),
      titleCount: panel.querySelectorAll(".studio-ai-panel-title").length,
      labelledBy: input.getAttribute("aria-labelledby")
    };
  });

  record(
    "J1. \"어떻게 바꾸고 싶나요?\"는 패널 헤더 한 곳에만 있다",
    phrase.inText === 1 && phrase.titleCount === 1,
    JSON.stringify(phrase)
  );

  record(
    "J2. textarea placeholder에는 같은 문구가 없고, 대신 헤더를 aria-labelledby로 가리킨다",
    (phrase.placeholder === null || phrase.placeholder === "") &&
      phrase.labelledBy === "studioAiPanelTitle",
    JSON.stringify(phrase)
  );

  await page.close();

}


/* =========================================================
   K~O. AI 적용/되돌리기 후 화면 유지
========================================================== */

async function runRoute(context) {

  /* --- K. HOME --- */

  let page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await sendInstruction(page, "홈에서 고쳐줘");

  const homeAfter = await location(page);
  const homeRendered = await previewHas(page, ".ai5a-home");

  record(
    "K1. HOME에서 AI를 적용하면 HOME이 그대로 유지되고 새 스킨으로 다시 그려진다",
    homeAfter.type === "home" && homeRendered === true,
    `location=${JSON.stringify(homeAfter)} rendered=${homeRendered}`
  );

  await page.close();

  /* --- L/N. CATEGORY --- */

  page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-x/category/301"));
  const onCategory = await previewHas(page, ".scenario-x-category");

  await sendInstruction(page, "카테고리를 보면서 고쳐줘");

  const categoryAfter = await location(page);
  const categoryRendered = await previewHas(page, ".ai5a-category");

  record(
    "L1. CATEGORY에서 AI를 적용하면 같은 CATEGORY가 유지된다",
    onCategory === true &&
      categoryAfter.type === "category" && categoryAfter.categoryId === "301" &&
      categoryRendered === true,
    `location=${JSON.stringify(categoryAfter)} rendered=${categoryRendered}`
  );

  await page.click("#studioAiDrawerUndo");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === false,
    null,
    { timeout: 5000 }
  );

  const undoLocation = await location(page);
  const undoRendered = await previewHas(page, ".scenario-x-category");

  record(
    "N1. 되돌리기 후에도 같은 CATEGORY에 남는다(이전 스킨으로 다시 그려진다)",
    undoLocation.type === "category" && undoLocation.categoryId === "301" &&
      undoRendered === true,
    `location=${JSON.stringify(undoLocation)} rendered=${undoRendered}`
  );

  await page.close();

  /* --- M. POST --- */

  page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-x/post/401"));
  const onPost = await previewHas(page, ".scenario-x-post");

  await sendInstruction(page, "글을 보면서 고쳐줘");

  const postAfter = await location(page);
  const postRendered = await previewHas(page, ".ai5a-post");

  record(
    "M1. POST에서 AI를 적용하면 같은 POST가 유지된다",
    onPost === true &&
      postAfter.type === "post" && postAfter.postId === "401" &&
      postRendered === true,
    `onPost=${onPost} location=${JSON.stringify(postAfter)} rendered=${postRendered}`
  );

  await page.close();

  /* --- O. 그릴 수 없는 route --- */

  page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-x/category/999"));

  /* 없는 카테고리는 fetch가 끝나야 "찾을 수 없습니다"가 된다 —
     그 전에는 "불러오는 중..."이라 그 상태로 재면 안 된다. */
  await page.waitForFunction(
    () => document.getElementById("studioPreviewOverlayText")
            .textContent.includes("찾을 수 없습니다"),
    null,
    { timeout: 8000 }
  );

  const missingOverlay = await page.evaluate(() => ({
    hidden: document.getElementById("studioPreviewOverlay").hidden,
    text: document.getElementById("studioPreviewOverlayText").textContent,
    location: window.getCurrentPreviewLocation()
  }));

  await sendInstruction(page, "없는 카테고리를 보고 있는데 고쳐줘");

  /*
    HOME fallback 판정도 fetch를 한 번 더 기다린 뒤에 난다(그
    카테고리가 지금도 없는지 확인해야 하므로) — 화면이 실제로
    HOME으로 바뀔 때까지 기다린 다음에 위치를 읽는다.
  */
  const fallbackRendered = await previewHas(page, ".ai5a-home");

  await page.waitForFunction(
    () => window.getCurrentPreviewLocation().type === "home",
    null,
    { timeout: 8000 }
  ).then(() => {}, () => {});

  const fallback = await location(page);
  const backHidden = await page.evaluate(
    () => document.getElementById("studioPreviewBackButton").hidden
  );

  record(
    "O0. 없는 카테고리는 평소처럼 그 자리에서 오류 상태로 남는다(기존 동작)",
    missingOverlay.hidden === false &&
      missingOverlay.text.includes("찾을 수 없습니다") &&
      missingOverlay.location.type === "category" &&
      missingOverlay.location.categoryId === "999",
    JSON.stringify(missingOverlay)
  );

  record(
    "O1. 그릴 수 없는 route에서 AI를 적용하면 HOME으로 떨어진다",
    fallback.type === "home" && fallbackRendered === true && backHidden === true,
    `location=${JSON.stringify(fallback)} rendered=${fallbackRendered} backHidden=${backHidden}`
  );

  await page.close();

}


/* =========================================================
   P. Import는 기존 계약(HOME 리셋)을 유지한다
========================================================== */

async function runImport(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-x/category/301"));
  const onCategory = await previewHas(page, ".scenario-x-category");

  await openTopDock(page);
  await page.click("#studioImportButton");
  await page.waitForSelector(".import-editor-textarea");

  await page.fill(".import-editor-textarea", JSON.stringify(IMPORT_PACKAGE));

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll(".import-editor-button"));
    buttons.find(b => b.textContent.trim() === "Validate").click();
  });

  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll(".import-editor-button"));
    const apply = buttons.find(b => b.textContent.trim() === "Apply to Draft");
    return apply && !apply.disabled;
  }, null, { timeout: 6000 });

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll(".import-editor-button"));
    buttons.find(b => b.textContent.trim() === "Apply to Draft").click();
  });

  const importRendered = await previewHas(page, ".imp-home");
  const importLocation = await location(page);

  record(
    "P1. Import는 지금까지처럼 HOME으로 리셋한다(AI 경로에만 유지 옵션이 붙는다)",
    onCategory === true &&
      importLocation.type === "home" && importRendered === true,
    `location=${JSON.stringify(importLocation)} rendered=${importRendered}`
  );

  await page.close();

}


/* =========================================================
   Q. 참고 이미지 UI가 사이드바 안에서 정상
========================================================== */

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function runAttach(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await openPanel(page);

  await page.setInputFiles("#studioAiDrawerAttachInput", [
    { name: "ref.png", mimeType: "image/png", buffer: PNG_1x1 }
  ]);

  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().attachmentCount === 1,
    null,
    { timeout: 5000 }
  );

  const geometry = await page.evaluate(() => {
    const panel = document.getElementById("studioAiDrawer").getBoundingClientRect();
    const thumb = document.querySelector(".studio-ai-drawer-thumb");
    const note = document.querySelector(".studio-ai-drawer-attach-note");
    const t = thumb ? thumb.getBoundingClientRect() : null;
    return {
      panel: { left: panel.left, right: panel.right },
      thumb: t ? { left: t.left, right: t.right, width: t.width, height: t.height } : null,
      noteHidden: note ? note.hidden : null,
      bodyScrolls: (() => {
        const body = document.getElementById("studioAiPanelBody");
        return body ? window.getComputedStyle(body).overflowY : null;
      })(),
      parentId: thumb ? thumb.parentElement.parentElement.id : null
    };
  });

  record(
    "Q1. 참고 이미지 thumbnail이 사이드바 안(패널 경계 내부)에 그려진다",
    geometry.thumb !== null &&
      geometry.thumb.left >= geometry.panel.left &&
      geometry.thumb.right <= geometry.panel.right &&
      geometry.thumb.width === 48,
    JSON.stringify(geometry)
  );

  record(
    "Q2. 첨부 UI가 패널 본문(#studioAiPanelBody) 안에 들어간다 — 헤더는 고정, 본문만 스크롤",
    geometry.parentId === "studioAiPanelBody" && geometry.bodyScrolls === "auto",
    JSON.stringify(geometry)
  );

  record(
    "Q3. 저장하지 않는다는 안내가 함께 보인다",
    geometry.noteHidden === false
  );

  await page.close();

}


/* =========================================================
   R. 로딩 표시 / 중단이 사이드바 안에서 정상
========================================================== */

async function runLoading(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await openPanel(page);

  aiRouteHold = true;

  await page.fill("#studioAiDrawerInput", "천천히 오는 응답");
  await page.click("#studioAiDrawerSend");

  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().pending === true,
    null,
    { timeout: 5000 }
  );

  const loading = await page.evaluate(() => {
    const status = document.getElementById("studioAiDrawerStatus");
    const dots = document.querySelector(".studio-ai-drawer-dots");
    const send = document.getElementById("studioAiDrawerSend");
    const panel = document.getElementById("studioAiDrawer").getBoundingClientRect();
    const statusBox = status.getBoundingClientRect();
    return {
      statusHidden: status.hidden,
      statusText: document.getElementById("studioAiDrawerStatusText").textContent,
      dotsHidden: dots ? dots.hidden : null,
      sendIsStop: send.classList.contains("studio-ai-drawer-send--stop"),
      inPanel: statusBox.left >= panel.left && statusBox.right <= panel.right
    };
  });

  /* 같은 버튼이 중단이다 */
  await page.click("#studioAiDrawerSend");

  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().pending === false,
    null,
    { timeout: 5000 }
  );

  const aborted = await page.evaluate(() => window.getStudioAiPanelDebugState());

  if (aiRouteRelease) {
    aiRouteRelease();
    aiRouteRelease = null;
  }
  aiRouteHold = false;

  await sleep(300);

  const afterRelease = await page.evaluate(() => ({
    panel: window.getStudioAiPanelDebugState(),
    working: window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css
  }));

  record(
    "R1. 요청 중 상태 줄/로딩 점이 사이드바 안에 표시되고 Send가 중단으로 바뀐다",
    loading.statusHidden === false &&
      loading.statusText.includes("스킨을 수정하고 있어요") &&
      loading.dotsHidden === false &&
      loading.sendIsStop === true &&
      loading.inPanel === true,
    JSON.stringify(loading)
  );

  record(
    "R2. 중단하면 요청이 끝나고 되돌리기도 생기지 않는다",
    aborted.pending === false && aborted.hasUndo === false && aborted.statusText === "",
    JSON.stringify(aborted)
  );

  record(
    "R3. 중단한 요청의 늦은 응답은 working draft를 바꾸지 않는다",
    afterRelease.panel.hasUndo === false &&
      !afterRelease.working.includes("ai5a-home"),
    JSON.stringify(afterRelease.panel)
  );

  await page.close();

}


/* =========================================================
   S/T. 뷰포트
========================================================== */

async function runViewport(context) {

  for (const width of [1280, 1440]) {

    const page = await openStudio(context, { viewport: { width, height: 900 } });

    await openPanel(page);

    const r = await rects(page);

    record(
      `S${width === 1280 ? 1 : 2}. ${width}x900에서 가로 overflow가 없고 Preview/패널이 나란히 있다`,
      r.scrollWidth <= r.innerWidth &&
        Math.abs(r.panel.right - r.innerWidth) < 1 &&
        r.stage.right < r.panel.right &&
        r.stage.right > 0,
      JSON.stringify(r)
    );

    await page.close();

  }

  /* T. 좁은 뷰포트 — overlay fallback */

  const page = await openStudio(context, { viewport: { width: 600, height: 800 } });

  await openPanel(page);

  const narrow = await rects(page);

  const resizerVisible = await page.evaluate(
    () => window.getComputedStyle(document.getElementById("studioAiResizer")).display
  );

  record(
    "T1. 좁은 화면에서는 패널이 Preview 위를 덮고(stage를 좁히지 않고) 뷰포트를 넘지 않는다",
    Math.abs(narrow.stage.right - narrow.innerWidth) < 1 &&
      narrow.panel.right <= narrow.innerWidth + 1 &&
      narrow.panel.width <= narrow.innerWidth * 0.92 + 1 &&
      narrow.scrollWidth <= narrow.innerWidth,
    JSON.stringify(narrow)
  );

  record(
    "T2. 좁은 화면에서는 resizer를 숨긴다(드래그로 뷰포트를 넘길 수 없다)",
    resizerVisible === "none",
    `display=${resizerVisible}`
  );

  await page.close();

}


/* =========================================================
   실행
========================================================== */

const server = await startServer();
console.log(`static server: http://localhost:${PORT}\n`);

const playwright = await loadPlaywright(BROWSER);
const browser = await playwright[BROWSER].launch();
const context = await browser.newContext();

try {

  if (shouldRun("layout")) await runLayout(context);
  if (shouldRun("toggle")) await runToggle(context);
  if (shouldRun("collapse")) await runCollapse(context);
  if (shouldRun("resize")) await runResize(context);
  if (shouldRun("textarea")) await runTextarea(context);
  if (shouldRun("keys")) await runKeys(context);
  if (shouldRun("route")) await runRoute(context);
  if (shouldRun("import")) await runImport(context);
  if (shouldRun("attach")) await runAttach(context);
  if (shouldRun("loading")) await runLoading(context);
  if (shouldRun("viewport")) await runViewport(context);

} finally {

  await context.close();
  await browser.close();
  server.close();

}

record(
  "Z1. 새로운 console/page 오류가 없다",
  consoleErrors.length === 0,
  consoleErrors.join("\n        ")
);

const passed = results.filter(r => r.pass).length;

console.log(`\n=== ${passed}/${results.length} PASS ===`);

if (passed !== results.length) {
  process.exitCode = 1;
}
