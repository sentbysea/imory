/* =========================================================
   PHASE AI-5A / AI-5A.1 — AI 패널 레이아웃 + AI 적용 후 화면 유지 E2E

   ★ 실제 OpenAI를 부르지 않는다. 이 파일은 /api/skin-ai를
   가로채 **고정된 유효 SkinPackage**를 그대로 돌려준다 — 서버
   (functions/api/skin-ai.js)와 모델 경로는 studio/studio-ai-panel-
   e2e-test.mjs가 이미 덮고 있고, 여기서 재는 것은 그 응답이
   적용된 **뒤의 화면**이기 때문이다.

   검사 범위
     A. 패널이 Preview 오른쪽에 서고 Preview를 덮지 않는다 +
        Top Dock의 AI Assistant / divider (AI-5A.1)
     B. 두 진입점(toolbar / 헤더 접기)이 같은 state를 토글하고
        aria-expanded가 항상 함께 움직인다
     C. Preview를 클릭해도 **접히지 않는다** (AI-5A.1에서 뒤집힘)
     D. Preview 안 링크/버튼은 그대로 동작한다
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
     U. 여닫기 모션 — Preview/Top Dock/패널이 같은 타이밍으로
        움직이고 layout jump가 없다, reduced-motion 대응 (AI-5A.1)
     V. Top Dock 기본 상태 = 펼침, AI 패널 상태와 서로 독립 (AI-5A.1)
     W. Top Dock 반응형 배치 — 폭을 줄여도 토글/버튼/handle이
        서로 겹치지 않고, 넓을 때는 토글이 정중앙 (반응형 라운드)

   ★ 실행 방법
     node studio/studio-ai-panel-layout-e2e-test.mjs
     node studio/studio-ai-panel-layout-e2e-test.mjs --browser=webkit
     node studio/studio-ai-panel-layout-e2e-test.mjs --only=resize

   --only= 뒤에 쓸 수 있는 이름:
     layout / toggle / collapse / resize / textarea / keys /
     route / import / attach / loading / viewport / motion / dock /
     dockfit
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


/*
  PHASE AI-5A.1 — 여는 곳은 Top Dock의 "AI Assistant" 하나뿐이라
  dock을 먼저 열어야 한다(실제 사용자와 같은 순서).

  그리고 이제 여닫기에 0.15s 슬라이드가 붙었으므로, 좌표를 재는
  검사들이 애니메이션 도중 값을 읽지 않도록 "다 들어왔다"까지
  기다린다(모션 자체는 아래 runMotion이 따로 검증한다).
*/
async function waitForPanelSettled(page, expectOpen) {
  await page.waitForFunction(
    (open) => {
      const panel = document.getElementById("studioAiDrawer");
      const box = panel.getBoundingClientRect();

      if (open) {
        return box.right <= window.innerWidth + 1;
      }

      /*
        닫힘은 transform이 끝난 **뒤에** visibility가 hidden이 되는
        계약이다(studio.css: visibility 0s linear 0.15s) — 그 두 번째
        단계까지 기다려야 "다 닫혔다"이다. resizer도 같은 지연을
        쓰므로 함께 본다.
      */
      const resizer = document.getElementById("studioAiResizer");

      return (
        box.left >= window.innerWidth - 1 &&
        window.getComputedStyle(panel).visibility === "hidden" &&
        window.getComputedStyle(resizer).visibility === "hidden"
      );
    },
    expectOpen,
    { timeout: 3000 }
  );
}


async function openPanel(page) {
  const open = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);
  if (!open) {
    await openTopDock(page);
    await page.click("#studioAiToggleButton");
  }
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === true);
  await waitForPanelSettled(page, true);
}


async function closePanel(page) {
  const open = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);
  if (open) await page.click("#studioAiPanelCollapse");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === false);
  await waitForPanelSettled(page, false);
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
      resizer: r("studioAiResizer"),
      topDock: r("studioTopDockZone"),
      toggleButton: r("studioAiToggleButton"),
      publishButton: r("studioPublishButton")
    };
  });
}


/* 지금 화면에 보이는가(visibility/display 모두 고려) */
function visibility(page, id) {
  return page.evaluate((elementId) => {
    const el = document.getElementById(elementId);
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return { display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents };
  }, id);
}


/* =========================================================
   A. 레이아웃 — 패널이 Preview 오른쪽에 서고 덮지 않는다
========================================================== */

async function runLayout(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  const closed = await rects(page);
  const closedPanelVisibility = await visibility(page, "studioAiDrawer");

  await openPanel(page);

  const open = await rects(page);
  const openResizerVisibility = await visibility(page, "studioAiResizer");

  const width = await page.evaluate(() => window.getStudioAiPanelLayoutState().width);

  const toolbar = await page.evaluate(() => {
    const button = document.getElementById("studioAiToggleButton");
    const publish = document.getElementById("studioPublishButton");
    const dividers = document.querySelectorAll(".studio-top-dock-actions .studio-top-dock-divider");
    const divider = dividers[0];
    const actions = Array.from(document.querySelector(".studio-top-dock-actions").children);
    const buttonStyle = window.getComputedStyle(button);
    const publishStyle = window.getComputedStyle(publish);
    const dividerStyle = divider ? window.getComputedStyle(divider) : null;

    return {
      handleExists: !!document.getElementById("studioAiHandle"),
      label: button.textContent.trim(),
      controls: button.getAttribute("aria-controls"),
      disabled: button.disabled,
      dividerCount: dividers.length,
      dividerWidth: divider ? Math.round(divider.getBoundingClientRect().width) : null,
      dividerText: divider ? divider.textContent : null,
      /* Publish -> divider -> AI Assistant 순서 */
      orderOk:
        actions.indexOf(publish) >= 0 &&
        actions.indexOf(divider) === actions.indexOf(publish) + 1 &&
        actions.indexOf(button) === actions.indexOf(divider) + 1,
      sameHeight:
        Math.round(button.getBoundingClientRect().height) ===
        Math.round(publish.getBoundingClientRect().height),
      sameFontSize: buttonStyle.fontSize === publishStyle.fontSize,
      sameRadius: buttonStyle.borderTopLeftRadius === publishStyle.borderTopLeftRadius,
      /* 색은 달라야 한다 — 토큰이 실제로 적용됐는지 */
      accentColored:
        buttonStyle.color !== publishStyle.color &&
        buttonStyle.borderTopColor !== publishStyle.borderTopColor,
      dividerBackground: dividerStyle ? dividerStyle.backgroundColor : null
    };
  });

  record(
    "A1. 접혀 있으면 Preview stage와 Top Dock이 화면 전체를 그대로 쓴다",
    Math.abs(closed.stage.right - closed.innerWidth) < 1 &&
      Math.abs(closed.topDock.right - closed.innerWidth) < 1,
    `stage.right=${closed.stage.right} topDock.right=${closed.topDock.right} innerWidth=${closed.innerWidth}`
  );

  record(
    "A2. 접힌 상태에서 패널은 화면 밖으로 나가 있고 보이지 않는다",
    closedPanelVisibility.visibility === "hidden" &&
      closedPanelVisibility.pointerEvents === "none" &&
      closed.panel.left >= closed.innerWidth - 1,
    `visibility=${JSON.stringify(closedPanelVisibility)} panel.left=${closed.panel.left} innerWidth=${closed.innerWidth}`
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
    "A7. 펼친 상태에서 resizer가 잡을 수 있게 나타난다",
    openResizerVisibility.visibility === "visible" &&
      openResizerVisibility.pointerEvents === "auto" &&
      open.resizer.width > 0,
    `visibility=${JSON.stringify(openResizerVisibility)} resizer.width=${open.resizer.width}`
  );

  /* ---------------------------------------------------------
     PHASE AI-5A.1 — 오른쪽 세로 탭 제거 + Top Dock 진입점
  --------------------------------------------------------- */

  record(
    "A8. 오른쪽 가장자리의 세로 AI 탭이 더 이상 문서에 없다",
    toolbar.handleExists === false,
    `#studioAiHandle=${toolbar.handleExists}`
  );

  record(
    "A9. Top Dock에 'AI Assistant' 버튼이 있다",
    toolbar.label === "AI Assistant" &&
      toolbar.controls === "studioAiDrawer" &&
      toolbar.disabled === false,
    JSON.stringify(toolbar)
  );

  record(
    "A10. Publish와 AI Assistant 사이에 1px divider가 있다(문자 | 아님)",
    toolbar.dividerCount === 1 &&
      toolbar.dividerWidth === 1 &&
      toolbar.dividerText === "" &&
      toolbar.orderOk === true,
    JSON.stringify(toolbar)
  );

  record(
    "A11. AI Assistant는 다른 toolbar 버튼과 같은 높이/글꼴을 쓰고 색만 다르다",
    toolbar.sameHeight === true &&
      toolbar.sameFontSize === true &&
      toolbar.sameRadius === true &&
      toolbar.accentColored === true,
    JSON.stringify(toolbar)
  );

  await page.close();

}


/* =========================================================
   B. 접기 / 펼치기
========================================================== */

async function runToggle(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  const readAria = () => page.evaluate(() => ({
    toolbar: document.getElementById("studioAiToggleButton").getAttribute("aria-expanded"),
    collapse: document.getElementById("studioAiPanelCollapse").getAttribute("aria-expanded"),
    isOpen: document.getElementById("studioAiDrawer").classList.contains("is-open"),
    shell: document.getElementById("studioPreviewShell").classList.contains("has-ai-panel"),
    inputTabIndex: document.getElementById("studioAiDrawerInput").tabIndex,
    /* 상태는 한 군데(레이아웃 모듈)만 갖는다 */
    stateOpen: window.getStudioAiPanelLayoutState().open
  }));

  await openTopDock(page);

  const before = await readAria();

  /* --- toolbar로 열기 --- */
  await page.click("#studioAiToggleButton");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === true);

  const opened = await readAria();

  const focused = await page.evaluate(() => document.activeElement.id);

  /* --- toolbar로 다시 닫기(같은 버튼이 toggle) --- */
  await page.click("#studioAiToggleButton");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === false);

  const toggledClosed = await readAria();

  /* --- 다시 열고 패널 헤더로 닫기 --- */
  await page.click("#studioAiToggleButton");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === true);

  await page.click("#studioAiPanelCollapse");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === false);

  const collapsedClosed = await readAria();

  record(
    "B1. 처음에는 접혀 있다 (두 버튼 모두 aria-expanded=false, textarea는 Tab 순서 밖)",
    before.toolbar === "false" && before.collapse === "false" &&
      before.isOpen === false && before.shell === false &&
      before.inputTabIndex === -1 && before.stateOpen === false,
    JSON.stringify(before)
  );

  record(
    "B2. toolbar의 AI Assistant를 누르면 펼쳐지고 두 버튼의 aria-expanded가 함께 true가 된다",
    opened.toolbar === "true" && opened.collapse === "true" &&
      opened.isOpen === true && opened.shell === true &&
      opened.inputTabIndex === 0 && opened.stateOpen === true,
    JSON.stringify(opened)
  );

  record(
    "B3. 펼치면 입력칸에 포커스가 간다",
    focused === "studioAiDrawerInput",
    `activeElement=${focused}`
  );

  record(
    "B4. 같은 AI Assistant 버튼을 다시 누르면 닫힌다(toggle)",
    toggledClosed.toolbar === "false" && toggledClosed.collapse === "false" &&
      toggledClosed.isOpen === false && toggledClosed.shell === false &&
      toggledClosed.stateOpen === false,
    JSON.stringify(toggledClosed)
  );

  record(
    "B5. 패널 헤더의 접기로 닫아도 toolbar의 aria-expanded가 즉시 false가 된다(state 하나)",
    collapsedClosed.toolbar === "false" && collapsedClosed.collapse === "false" &&
      collapsedClosed.isOpen === false && collapsedClosed.shell === false &&
      collapsedClosed.inputTabIndex === -1 && collapsedClosed.stateOpen === false,
    JSON.stringify(collapsedClosed)
  );

  await page.close();

}


/* =========================================================
   C/D. Preview를 눌러도 접히지 않는다 (PHASE AI-5A.1에서 뒤집힘)

   AI-5A에는 "Preview를 클릭하면 접힌다"가 있었다. 결과를 눌러
   확인하면서 패널을 열어 둔 채 비교하는 흐름이 더 중요해서
   제거했다 — 이제 패널을 닫는 것은 두 버튼뿐이다.
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
     C1. Preview(iframe) 안 진짜 마우스 클릭 — 패널은 그대로

     좌표는 Preview stage 한가운데를 쓴다 — 화면 위쪽 48px 띠는
     #studioTopDockZone(투명하지만 클릭을 받는 예약 영역)이라
     iframe에 닿지 않는다(이번 라운드와 무관한 기존 배치).
  --------------------------------------------------------- */

  const stage = await page.evaluate(() => {
    const r = document.getElementById("studioPreviewStage").getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  await page.mouse.click(stage.x, stage.y);
  await sleep(300);

  const afterPreviewClick = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);

  record(
    "C1. Preview를 클릭해도 패널이 접히지 않는다 (PHASE AI-5A.1)",
    afterPreviewClick === true,
    `click=${JSON.stringify(stage)} open=${afterPreviewClick}`
  );

  /* ---------------------------------------------------------
     C2. auto-collapse용 postMessage 자체가 사라졌다

     preview:surface-pointer는 이 용도로만 있었으므로 iframe/부모
     양쪽에서 함께 지웠다. 혹시 남아 있더라도 부모가 반응하지
     않는지까지 확인한다(직접 쏴 본다).
  --------------------------------------------------------- */

  const protocolGone = await page.evaluate(async () => {
    window.postMessage({ type: "preview:surface-pointer" }, window.location.origin);
    await new Promise(resolve => setTimeout(resolve, 200));
    return {
      stillOpen: window.getStudioAiPanelLayoutState().open,
      handlerGone: typeof window.collapseStudioAiPanelFromPreview === "undefined"
    };
  });

  record(
    "C2. preview:surface-pointer 경로가 제거되어 부모가 아무 반응도 하지 않는다",
    protocolGone.stillOpen === true && protocolGone.handlerGone === true,
    JSON.stringify(protocolGone)
  );

  /* ---------------------------------------------------------
     D3. Preview 안 링크는 기존대로 동작한다

     scenario x의 navigation 링크는 화면 맨 위(Top Dock 예약 영역
     아래)라 실제 마우스로는 그 띠에 가린다 — 그래서 여기서만
     iframe 안에서 진짜 이벤트를 직접 dispatch한다(기존
     studio-ai-panel-e2e-test.mjs의 클릭 interception 검사와 같은
     방식). click 쪽 defaultPrevented는 preview-bridge.js의 기존
     앵커 가로채기가 만든 것이라 true가 정상이다.
  --------------------------------------------------------- */

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
    "D3. Preview 안 링크는 그대로 CATEGORY로 이동하고, 그동안에도 패널은 열려 있다",
    linkOutcome !== null &&
      linkOutcome.downPrevented === false &&
      afterLinkClick.open === true &&
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
  await closePanel(page);
  await openPanel(page);

  const reopened = await page.evaluate(() => window.getStudioAiPanelLayoutState().width);

  record(
    "E3. 접었다 다시 펴도 조절한 폭이 유지된다(세션 동안)",
    reopened === maxed.width,
    `reopened=${reopened} expected=${maxed.width}`
  );

  /* ---------------------------------------------------------
     K. 닫혀 있으면 resizer가 아예 잡히지 않는다 (PHASE AI-5A.1)

     CSS(pointer-events:none + visibility:hidden)와 JS 가드
     (studioAiPanelOpen) 둘 다 확인한다 — 닫힌 상태에서 resizer가
     있던 자리를 드래그해도 폭이 바뀌지 않아야 한다.
  --------------------------------------------------------- */

  await closePanel(page);

  const closedResizer = await visibility(page, "studioAiResizer");

  const widthBeforeDrag = await page.evaluate(() => window.getStudioAiPanelLayoutState().width);

  /* 열려 있었다면 resizer가 있었을 좌표를 그대로 긁어 본다 */
  await page.mouse.move(1280 - widthBeforeDrag, 400);
  await page.mouse.down();
  await page.mouse.move(600, 400, { steps: 6 });
  await page.mouse.up();

  const afterClosedDrag = await page.evaluate(() => window.getStudioAiPanelLayoutState());

  record(
    "K1. 닫혀 있으면 resizer가 포인터를 받지 않고 드래그로 폭이 바뀌지 않는다",
    closedResizer.pointerEvents === "none" &&
      closedResizer.visibility === "hidden" &&
      afterClosedDrag.resizing === false &&
      afterClosedDrag.width === widthBeforeDrag,
    `closedResizer=${JSON.stringify(closedResizer)} width=${widthBeforeDrag} -> ${afterClosedDrag.width}`
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

    /*
      PHASE AI-5A.1 — divider와 AI Assistant가 붙어도 toolbar가
      한 줄에 들어가야 한다. "한 줄"은 모든 버튼의 top이 같고,
      맨 왼쪽 버튼이 Back 오른쪽에서 시작하며, 맨 오른쪽 버튼이
      dock 안에 있다는 것으로 잰다.
    */
    const toolbarFit = await page.evaluate(() => {
      const actions = document.querySelector(".studio-top-dock-actions");
      const dock = document.getElementById("studioTopDock");
      const buttons = Array.from(actions.querySelectorAll("button"))
        .map(el => el.getBoundingClientRect());
      const divider = actions
        .querySelector(".studio-top-dock-divider")
        .getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      const dockBox = dock.getBoundingClientRect();
      const back = document.getElementById("studioBackButton").getBoundingClientRect();
      const groups = document.querySelector(".studio-top-dock-groups").getBoundingClientRect();

      const rowTop = Math.round(buttons[0].top);
      const rowBottom = Math.round(buttons[0].bottom);

      return {
        buttonTops: buttons.map(b => Math.round(b.top)),
        /* 버튼은 전부 같은 줄에 있어야 한다(divider는 더 짧고 가운데 정렬이라 제외) */
        singleRow: new Set(buttons.map(b => Math.round(b.top))).size === 1,
        /* divider는 그 줄 안에서 세로 가운데 */
        dividerCentered:
          divider.top > rowTop &&
          divider.bottom < rowBottom &&
          Math.abs(
            (divider.top - rowTop) - (rowBottom - divider.bottom)
          ) <= 1,
        insideDock:
          actionsBox.right <= dockBox.right + 1 &&
          actionsBox.left >= dockBox.left - 1,
        clearsBack: actionsBox.left > back.right,
        clearsCenterGroup: actionsBox.left > groups.right,
        actionsRight: actionsBox.right,
        dockRight: dockBox.right
      };
    });

    record(
      `S${width === 1280 ? 1 : 2}. ${width}x900에서 가로 overflow가 없고 Preview/패널이 나란히 있다`,
      r.scrollWidth <= r.innerWidth &&
        Math.abs(r.panel.right - r.innerWidth) < 1 &&
        r.stage.right < r.panel.right &&
        r.stage.right > 0,
      JSON.stringify(r)
    );

    record(
      `S${width === 1280 ? 3 : 4}. ${width}x900에서 toolbar가 한 줄에 들어가고 기존 버튼과 겹치지 않는다`,
      toolbarFit.singleRow === true &&
        toolbarFit.dividerCentered === true &&
        toolbarFit.insideDock === true &&
        toolbarFit.clearsBack === true &&
        toolbarFit.clearsCenterGroup === true,
      JSON.stringify(toolbarFit)
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

  /*
    PHASE AI-5A.1 — overlay 모드에서 패널이 Top Dock 밴드 아래에서
    시작하므로, 여닫는 버튼(AI Assistant)과 패널 헤더의 접기 버튼이
    둘 다 가려지지 않고 눌린다.
  */
  const narrowReach = await page.evaluate(() => {
    const toggle = document.getElementById("studioAiToggleButton").getBoundingClientRect();
    const panel = document.getElementById("studioAiDrawer").getBoundingClientRect();
    const collapse = document.getElementById("studioAiPanelCollapse").getBoundingClientRect();
    const topOf = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.id || el.className) : null;
    };
    return {
      toggleNotCovered: toggle.bottom <= panel.top + 1,
      toggleHit: topOf(toggle.left + toggle.width / 2, toggle.top + toggle.height / 2),
      collapseHit: topOf(collapse.left + collapse.width / 2, collapse.top + collapse.height / 2)
    };
  });

  record(
    "T3. overlay 모드에서도 AI Assistant와 패널 접기 버튼이 서로 가리지 않고 눌린다",
    narrowReach.toggleNotCovered === true &&
      narrowReach.toggleHit === "studioAiToggleButton" &&
      narrowReach.collapseHit === "studioAiPanelCollapse",
    JSON.stringify(narrowReach)
  );

  /* 닫으면 overlay가 사라지고 Preview가 다시 전부 보인다 */
  await closePanel(page);

  const narrowClosed = await rects(page);

  record(
    "T4. overlay를 닫으면 Preview가 다시 화면 전체를 쓰고 가로 overflow가 없다",
    Math.abs(narrowClosed.stage.right - narrowClosed.innerWidth) < 1 &&
      narrowClosed.panel.left >= narrowClosed.innerWidth - 1 &&
      narrowClosed.scrollWidth <= narrowClosed.innerWidth,
    JSON.stringify(narrowClosed)
  );

  await page.close();

}


/* =========================================================
   U. 여닫기 모션 (PHASE AI-5A.1)

   "같은 timing으로 움직인다"를 직접 재려면 애니메이션 도중의
   좌표가 필요하다 — 열기를 시작한 뒤 중간 시점에 세 요소
   (Preview stage / Top Dock zone / 패널)의 좌표를 한 번에 읽어
   서로 붙어 있는지 본다. 셋이 다른 duration으로 움직이면 그
   순간 stage.right와 panel.left가 벌어진다(= 흰 틈이 보인다).

   layout jump는 "중간 좌표가 시작/끝 사이에 있는가"로 잰다 —
   전환 없이 툭 끊기면 중간 프레임이 이미 최종값이라 이 검사가
   실패한다.
========================================================== */

async function runMotion(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  /* 선언된 모션 값이 Top Dock과 같은 타이밍인가 */
  const motion = await page.evaluate(() => {
    const shell = document.getElementById("studioPreviewShell");
    const shellStyle = window.getComputedStyle(shell);
    const dockBar = document.getElementById("studioTopDock");
    const stage = document.getElementById("studioPreviewStage");
    const panel = document.getElementById("studioAiDrawer");
    const zone = document.getElementById("studioTopDockZone");
    return {
      token: shellStyle.getPropertyValue("--studio-ai-panel-motion").trim(),
      topDockBar: window.getComputedStyle(dockBar).transitionDuration,
      stage: window.getComputedStyle(stage).transitionDuration,
      zone: window.getComputedStyle(zone).transitionDuration,
      panel: window.getComputedStyle(panel).transitionDuration,
      stageProperty: window.getComputedStyle(stage).transitionProperty,
      panelProperty: window.getComputedStyle(panel).transitionProperty
    };
  });

  record(
    "U1. 패널 모션이 Top Dock과 같은 타이밍(0.15s)을 쓴다",
    motion.token === "0.15s ease" &&
      motion.topDockBar === "0.15s" &&
      motion.stage === "0.15s" &&
      motion.zone === "0.15s" &&
      motion.panel.startsWith("0.15s"),
    JSON.stringify(motion)
  );

  record(
    "U2. 주 효과는 layout/slide다 (stage는 right, 패널은 transform)",
    motion.stageProperty.includes("right") &&
      motion.panelProperty.includes("transform"),
    JSON.stringify(motion)
  );

  /* --- 애니메이션 도중 좌표 --- */

  await openTopDock(page);

  const openingFrames = await page.evaluate(async () => {
    const stage = document.getElementById("studioPreviewStage");
    const panel = document.getElementById("studioAiDrawer");
    const zone = document.getElementById("studioTopDockZone");

    const read = () => ({
      stageRight: stage.getBoundingClientRect().right,
      panelLeft: panel.getBoundingClientRect().left,
      zoneRight: zone.getBoundingClientRect().right
    });

    const start = read();

    document.getElementById("studioAiToggleButton").click();

    await new Promise(resolve => setTimeout(resolve, 70));
    const mid = read();

    await new Promise(resolve => setTimeout(resolve, 400));
    const end = read();

    return { start, mid, end };
  });

  const { start, mid, end } = openingFrames;

  record(
    "U3. 여는 동안 Preview stage가 중간 좌표를 거친다(툭 끊기지 않는다)",
    mid.stageRight < start.stageRight - 5 && mid.stageRight > end.stageRight + 5,
    JSON.stringify(openingFrames)
  );

  record(
    "U4. 여는 동안 stage / Top Dock zone / 패널이 같은 좌표를 유지한다(틈이 벌어지지 않는다)",
    Math.abs(mid.stageRight - mid.panelLeft) <= 8 &&
      Math.abs(mid.zoneRight - mid.panelLeft) <= 8,
    JSON.stringify(mid)
  );

  record(
    "U5. 모션이 끝나면 세 요소가 정확히 맞물린다",
    Math.abs(end.stageRight - end.panelLeft) <= 7 &&
      Math.abs(end.zoneRight - end.panelLeft) <= 7,
    JSON.stringify(end)
  );

  /* --- 닫는 동안 --- */

  const closingFrames = await page.evaluate(async () => {
    const stage = document.getElementById("studioPreviewStage");
    const panel = document.getElementById("studioAiDrawer");

    const read = () => ({
      stageRight: stage.getBoundingClientRect().right,
      panelLeft: panel.getBoundingClientRect().left,
      panelVisibility: window.getComputedStyle(panel).visibility
    });

    const start = read();

    document.getElementById("studioAiPanelCollapse").click();

    await new Promise(resolve => setTimeout(resolve, 70));
    const mid = read();

    await new Promise(resolve => setTimeout(resolve, 400));
    const end = read();

    return { start, mid, end };
  });

  record(
    "U6. 닫는 동안에도 중간 좌표를 거치고, 다 나간 뒤에야 숨겨진다",
    closingFrames.mid.stageRight > closingFrames.start.stageRight + 5 &&
      closingFrames.mid.stageRight < closingFrames.end.stageRight - 5 &&
      closingFrames.mid.panelVisibility === "visible" &&
      closingFrames.end.panelVisibility === "hidden",
    JSON.stringify(closingFrames)
  );

  await page.close();

  /* --- L. prefers-reduced-motion --- */

  const reducedContext = await context.browser().newContext({ reducedMotion: "reduce" });

  const reducedPage = await openStudio(reducedContext, { viewport: { width: 1280, height: 800 } });

  const reduced = await reducedPage.evaluate(() => {
    const shell = document.getElementById("studioPreviewShell");
    const stage = document.getElementById("studioPreviewStage");
    const panel = document.getElementById("studioAiDrawer");
    return {
      token: window.getComputedStyle(shell).getPropertyValue("--studio-ai-panel-motion").trim(),
      stage: window.getComputedStyle(stage).transitionDuration,
      panel: window.getComputedStyle(panel).transitionDuration
    };
  });

  await openPanel(reducedPage);

  const reducedOpen = await rects(reducedPage);

  record(
    "U7. prefers-reduced-motion에서는 전환을 없앤다",
    reduced.token === "0s" &&
      reduced.stage === "0s" &&
      reduced.panel.split(",").every(d => d.trim() === "0s"),
    JSON.stringify(reduced)
  );

  record(
    "U8. 전환을 없애도 열린 결과 레이아웃은 동일하다",
    Math.abs(reducedOpen.panel.right - reducedOpen.innerWidth) < 1 &&
      Math.abs(reducedOpen.stage.right - reducedOpen.panel.left) <= 7,
    JSON.stringify(reducedOpen)
  );

  await reducedPage.close();
  await reducedContext.close();

}


/* =========================================================
   V. Top Dock 기본 상태와 AI 패널의 독립성 (PHASE AI-5A.1)

   AI 진입점이 dock 안으로 들어오면서 "들어오자마자 AI Assistant가
   보이는가"가 중요해졌다. 초기값은 studio/index.html 마크업의
   .is-open이 정하고 어디에도 저장하지 않는다 — 그래서 새로 연
   페이지는 항상 펼친 상태로 시작한다.

   두 토글(dock / AI 패널)이 서로의 상태를 건드리지 않는지도
   여기서 함께 잰다.
========================================================== */

async function runDock(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  const initial = await page.evaluate(() => {
    const zone = document.getElementById("studioTopDockZone");
    const bar = document.getElementById("studioTopDock");
    const handle = document.getElementById("studioTopDockHandle");
    const toggle = document.getElementById("studioAiToggleButton");
    const barBox = bar.getBoundingClientRect();
    const toggleBox = toggle.getBoundingClientRect();
    return {
      zoneOpen: zone.classList.contains("is-open"),
      handleExpanded: handle.getAttribute("aria-expanded"),
      handleIcon: document.getElementById("studioTopDockHandleIcon").textContent,
      /* 바가 실제로 화면 안에 내려와 있는가 */
      barVisible: barBox.top >= -1 && barBox.bottom > 0,
      /* AI Assistant가 실제로 보이고 눌리는 자리에 있는가 */
      toggleVisible: toggleBox.top >= 0 && toggleBox.bottom <= window.innerHeight,
      toggleHit: (() => {
        const el = document.elementFromPoint(
          toggleBox.left + toggleBox.width / 2,
          toggleBox.top + toggleBox.height / 2
        );
        return el ? el.id : null;
      })(),
      aiPanelOpen: window.getStudioAiPanelLayoutState().open
    };
  });

  record(
    "V1. Studio에 처음 들어가면 Top Dock이 펼쳐져 있다",
    initial.zoneOpen === true &&
      initial.handleExpanded === "true" &&
      initial.handleIcon === "▴" &&
      initial.barVisible === true,
    JSON.stringify(initial)
  );

  record(
    "V2. 그래서 AI Assistant가 최초 화면에서 바로 보이고 눌린다",
    initial.toggleVisible === true &&
      initial.toggleHit === "studioAiToggleButton",
    JSON.stringify(initial)
  );

  record(
    "V3. Top Dock이 펼쳐져 있어도 AI 패널은 닫힌 채로 시작한다(별개 상태)",
    initial.aiPanelOpen === false
  );

  /* --- V4. 클릭 한 번으로 AI 패널이 열린다 (dock을 먼저 열 필요 없음) --- */

  await page.click("#studioAiToggleButton");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === true);
  await waitForPanelSettled(page, true);

  const afterOneClick = await page.evaluate(() => ({
    aiPanelOpen: window.getStudioAiPanelLayoutState().open,
    zoneOpen: document.getElementById("studioTopDockZone").classList.contains("is-open")
  }));

  record(
    "V4. 최초 화면에서 AI Assistant 한 번만 눌러도 패널이 열린다",
    afterOneClick.aiPanelOpen === true && afterOneClick.zoneOpen === true,
    JSON.stringify(afterOneClick)
  );

  /* --- V5/V6. dock을 접어도 AI 패널 상태는 그대로 --- */

  const stageBeforeCollapse = (await rects(page)).stage;

  await page.click("#studioTopDockHandle");
  await page.waitForFunction(
    () => document.getElementById("studioTopDockZone").classList.contains("is-open") === false
  );
  await sleep(250);

  const afterDockCollapse = await page.evaluate(() => {
    const bar = document.getElementById("studioTopDock").getBoundingClientRect();
    return {
      zoneOpen: document.getElementById("studioTopDockZone").classList.contains("is-open"),
      handleExpanded: document.getElementById("studioTopDockHandle").getAttribute("aria-expanded"),
      handleIcon: document.getElementById("studioTopDockHandleIcon").textContent,
      barOffScreen: bar.bottom <= 1,
      aiPanelOpen: window.getStudioAiPanelLayoutState().open,
      aiPanelWidth: window.getStudioAiPanelLayoutState().width
    };
  });

  record(
    "V5. Top Dock handle로 접히고 바가 화면 밖으로 나간다",
    afterDockCollapse.zoneOpen === false &&
      afterDockCollapse.handleExpanded === "false" &&
      afterDockCollapse.handleIcon === "▾" &&
      afterDockCollapse.barOffScreen === true,
    JSON.stringify(afterDockCollapse)
  );

  record(
    "V6. dock을 접어도 AI 패널은 열린 그대로다(두 토글이 서로 독립)",
    afterDockCollapse.aiPanelOpen === true &&
      afterDockCollapse.aiPanelWidth === 380,
    JSON.stringify(afterDockCollapse)
  );

  /* --- V7. dock을 접은 뒤에도 패널 헤더로 닫을 수 있고, dock 상태는 불변 --- */

  await page.click("#studioAiPanelCollapse");
  await page.waitForFunction(() => window.getStudioAiPanelLayoutState().open === false);
  await waitForPanelSettled(page, false);

  const afterPanelClose = await page.evaluate(() => ({
    aiPanelOpen: window.getStudioAiPanelLayoutState().open,
    zoneOpen: document.getElementById("studioTopDockZone").classList.contains("is-open"),
    toolbarExpanded: document.getElementById("studioAiToggleButton").getAttribute("aria-expanded")
  }));

  const stageAfterAll = (await rects(page)).stage;

  record(
    "V7. AI 패널을 닫아도 Top Dock은 접힌 그대로다(패널이 dock을 건드리지 않는다)",
    afterPanelClose.aiPanelOpen === false &&
      afterPanelClose.zoneOpen === false &&
      afterPanelClose.toolbarExpanded === "false",
    JSON.stringify(afterPanelClose)
  );

  record(
    "V8. AI 패널이 닫히면 Preview가 다시 화면 전체를 쓴다(dock 상태와 무관)",
    Math.abs(stageAfterAll.right - stageAfterAll.width) < 1 &&
      stageAfterAll.right > stageBeforeCollapse.right,
    `before=${stageBeforeCollapse.right} after=${stageAfterAll.right}`
  );

  /* --- V9. handle을 다시 누르면 열린다 --- */

  await page.click("#studioTopDockHandle");
  await page.waitForFunction(
    () => document.getElementById("studioTopDockZone").classList.contains("is-open") === true
  );
  await sleep(250);

  const reopened = await page.evaluate(() => {
    const bar = document.getElementById("studioTopDock").getBoundingClientRect();
    return {
      zoneOpen: document.getElementById("studioTopDockZone").classList.contains("is-open"),
      handleExpanded: document.getElementById("studioTopDockHandle").getAttribute("aria-expanded"),
      barVisible: bar.top >= -1 && bar.bottom > 0,
      aiPanelOpen: window.getStudioAiPanelLayoutState().open
    };
  });

  record(
    "V9. handle을 다시 누르면 Top Dock이 열리고, AI 패널 상태는 여전히 그대로다",
    reopened.zoneOpen === true &&
      reopened.handleExpanded === "true" &&
      reopened.barVisible === true &&
      reopened.aiPanelOpen === false,
    JSON.stringify(reopened)
  );

  /* --- V10. Desktop/Mobile 토글 회귀 --- */

  const viewportToggle = await page.evaluate(async () => {
    const stage = document.getElementById("studioPreviewStage");
    const wrap = document.getElementById("studioPreviewFrameWrap");
    const options = Array.from(document.querySelectorAll(".studio-viewport-toggle-option"));

    options.find(b => b.dataset.viewportMode === "mobile").click();
    await new Promise(resolve => setTimeout(resolve, 200));

    const mobile = {
      hasClass: stage.classList.contains("studio-preview-stage--mobile"),
      activeLabel: document.querySelector(".studio-viewport-toggle-option--active").textContent.trim(),
      /*
        레이아웃 폭(offsetWidth)으로 잰다 — getBoundingClientRect는
        #studioPreviewFrameWrap에 걸린 transform: scale()이 반영된
        시각 크기라 390이 아니다(studio.css의 의도된 동작: iframe의
        레이아웃 뷰포트는 항상 390으로 두고 화면이 좁으면 시각적으로만
        축소한다).
      */
      frameWidth: document.getElementById("studioPreviewFrame").offsetWidth,
      scale: wrap.style.getPropertyValue("--studio-mobile-scale")
    };

    options.find(b => b.dataset.viewportMode === "desktop").click();
    await new Promise(resolve => setTimeout(resolve, 200));

    const desktop = {
      hasClass: stage.classList.contains("studio-preview-stage--mobile"),
      activeLabel: document.querySelector(".studio-viewport-toggle-option--active").textContent.trim()
    };

    return { mobile, desktop };
  });

  record(
    "V10. Desktop/Mobile Preview 토글에 회귀가 없다(Top Dock 기본값 변경과 무관)",
    viewportToggle.mobile.hasClass === true &&
      viewportToggle.mobile.activeLabel === "Mobile" &&
      viewportToggle.mobile.frameWidth === 390 &&
      viewportToggle.desktop.hasClass === false &&
      viewportToggle.desktop.activeLabel === "Desktop",
    JSON.stringify(viewportToggle)
  );

  await page.close();

}


/* =========================================================
   W. Top Dock 반응형 배치 (반응형 라운드)

   예전에는 가운데 Desktop/Mobile 토글이 position:absolute +
   left:50%로 흐름 밖에 있어서, 창을 좁히면 오른쪽 actions
   그룹이 그 위로 그대로 겹쳤다(실측: 패널 닫힘 ~990px,
   패널 열림 ~1279px부터). 이제 셋이 같은 flex 줄에 있으므로
   여기서는 "겹치지 않는가"와 "넓을 때는 여전히 정중앙인가"를
   폭을 단계적으로 줄여 가며 잰다 — AI 패널 열림/닫힘 양쪽.
========================================================== */

/* 두 사각형이 실제로 겹치는가(같은 줄에 있고 x가 물리는가) */
function overlaps(a, b) {
  return (
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5
  );
}

function dockProbe(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        left: b.left, right: b.right, top: b.top, bottom: b.bottom,
        width: b.width, height: b.height
      };
    };

    const zone = box("#studioTopDockZone");

    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      zone,
      bar: box("#studioTopDock"),
      lead: box(".studio-top-dock-lead"),
      groups: box(".studio-top-dock-groups"),
      toggle: box("#studioViewportToggle"),
      actions: box(".studio-top-dock-actions"),
      handle: box("#studioTopDockHandle"),
      aiButton: box("#studioAiToggleButton"),
      aiDrawer: box("#studioAiDrawer"),
      /* 오른쪽 끝 버튼이 실제로 눌리는 자리에 있는가 */
      aiButtonHit: (() => {
        const el = document.getElementById("studioAiToggleButton");
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          b.left + b.width / 2,
          b.top + b.height / 2
        );
        return hit ? hit.id : null;
      })()
    };
  });
}


async function runDockFit(context) {

  const page = await openStudio(context, { viewport: { width: 1600, height: 900 } });

  /* --- W1. 넓은 화면에서는 토글이 정확히 가운데 --- */

  const wide = [];

  for (const width of [1600, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await sleep(120);
    const m = await dockProbe(page);
    wide.push({
      width,
      center: (m.toggle.left + m.toggle.right) / 2,
      expected: m.innerWidth / 2,
      handleCenter: (m.handle.left + m.handle.right) / 2,
      rows: Math.round(m.bar.height)
    });
  }

  record(
    "W1. 넓은 화면(1600/1440/1280)에서는 Desktop/Mobile 토글이 화면 정중앙이다",
    wide.every(w => Math.abs(w.center - w.expected) <= 2 && w.rows <= 50),
    JSON.stringify(wide)
  );

  record(
    "W1-b. handle도 같은 중심을 쓴다(토글 divider 바로 위/아래)",
    wide.every(w => Math.abs(w.handleCenter - w.expected) <= 2),
    JSON.stringify(wide)
  );

  /* --- W2/W3. 폭을 단계적으로 줄여도 겹치지 않는다 (패널 닫힘/열림) --- */

  const widths = [1280, 1180, 1100, 1000, 900, 800, 720, 640, 480, 390];

  for (const panelOpen of [false, true]) {

    await page.setViewportSize({ width: 1600, height: 900 });
    await sleep(120);

    if (panelOpen) {
      await openPanel(page);
    } else {
      await closePanel(page);
    }

    const bad = [];
    const shifts = [];

    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await sleep(150);

      const m = await dockProbe(page);

      const problems = [];

      if (overlaps(m.groups, m.lead)) problems.push("groups↔lead");
      if (overlaps(m.groups, m.actions)) problems.push("groups↔actions");
      if (overlaps(m.lead, m.actions)) problems.push("lead↔actions");
      if (overlaps(m.handle, m.toggle)) problems.push("handle↔toggle");
      if (overlaps(m.handle, m.actions)) problems.push("handle↔actions");

      /* 오른쪽 끝 버튼이 화면 밖으로 밀려나면 안 된다 */
      if (m.aiButton.right > m.innerWidth + 0.5) problems.push("aiButton overflow");
      if (m.aiButton.left < -0.5) problems.push("aiButton offscreen-left");
      if (m.aiButtonHit !== "studioAiToggleButton") problems.push(`aiButton hit=${m.aiButtonHit}`);

      /* 문서 자체가 가로로 스크롤되면 안 된다 */
      if (m.scrollWidth > m.innerWidth + 0.5) problems.push("h-scroll");

      shifts.push({ width, toggleCenter: Math.round((m.toggle.left + m.toggle.right) / 2), barH: Math.round(m.bar.height) });

      if (problems.length) bad.push({ width, problems });
    }

    record(
      `W2${panelOpen ? "-panel" : ""}. 폭을 1280→390으로 줄이는 동안 Top Dock 요소가 서로 겹치지 않는다 (AI 패널 ${panelOpen ? "열림" : "닫힘"})`,
      bad.length === 0,
      bad.length ? JSON.stringify(bad) : JSON.stringify(shifts)
    );

    /* 좁아질수록 토글이 왼쪽으로 밀린다(오른쪽 버튼에 자리를 내준다) */
    const monotone = shifts
      .filter(s => s.barH <= 50)
      .every((s, i, arr) => i === 0 || s.toggleCenter <= arr[i - 1].toggleCenter + 1);

    record(
      `W3${panelOpen ? "-panel" : ""}. 한 줄로 남아 있는 동안 토글은 좁아질수록 왼쪽으로만 이동한다 (AI 패널 ${panelOpen ? "열림" : "닫힘"})`,
      monotone,
      JSON.stringify(shifts)
    );

  }

  /* --- W4. 390px에서 AI 패널 overlay가 바에 가리지 않는다 --- */

  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(200);

  const narrow = await dockProbe(page);

  record(
    "W4. 390px에서 AI 패널 overlay가 (두 줄 이상이 된) Top Dock 바 아래에서 시작한다",
    narrow.aiDrawer.top >= narrow.bar.bottom - 1,
    JSON.stringify({ drawerTop: narrow.aiDrawer.top, barBottom: narrow.bar.bottom, barH: narrow.bar.height })
  );

  await closePanel(page);

  /* --- W5. 닫으면 handle이 다시 화면 맨 위에 남아 클릭 가능하다 --- */

  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(150);
  await page.click("#studioTopDockHandle");
  await page.waitForFunction(
    () => document.getElementById("studioTopDockZone").classList.contains("is-open") === false
  );
  await sleep(250);

  const closed = await page.evaluate(() => {
    const handle = document.getElementById("studioTopDockHandle");
    const bar = document.getElementById("studioTopDock");
    const hb = handle.getBoundingClientRect();
    const bb = bar.getBoundingClientRect();
    const hit = document.elementFromPoint(hb.left + hb.width / 2, hb.top + hb.height / 2);
    return {
      handleTop: Math.round(hb.top),
      handleBottom: Math.round(hb.bottom),
      barBottom: Math.round(bb.bottom),
      hit: hit ? (hit.id || hit.className) : null
    };
  });

  record(
    "W5. 좁은 화면에서 dock을 접어도 handle은 화면 맨 위(y=0)에 남고 눌린다",
    Math.abs(closed.handleTop) <= 1 &&
      closed.handleBottom > 0 &&
      Math.abs(closed.barBottom) <= 1 &&
      (closed.hit === "studioTopDockHandle" || closed.hit === "studioTopDockHandleIcon"),
    JSON.stringify(closed)
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
  if (shouldRun("motion")) await runMotion(context);
  if (shouldRun("dock")) await runDock(context);
  if (shouldRun("dockfit")) await runDockFit(context);

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
