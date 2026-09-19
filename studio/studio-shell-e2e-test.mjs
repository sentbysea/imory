/* =========================================================
   STUDIO-SHELL-1 — 상단 세 그룹 · 왼쪽 패널 · Undo/Redo · 좁은 화면

   기준 문서: IMORY_STUDIO_SHELL_DESIGN.md

   실제 Studio 와 같은 스크립트 구성의 시나리오 문서
   (studio/studio-lifecycle-scenario.html?scenario=y)를 띄운다.
   supabase 만 in-memory mock 이고 HTML/CSS/JS 는 저장소의 실제
   파일이다.

   무엇을 보는가 — "버튼이 거기 있는가"가 아니라 **눌렀을 때 그 일이
   일어나는가**와 **어디에 그려졌는가**다.

     toolbar  세 그룹의 구성 · Publish 만 primary · Import|Export 한
              덩어리 · id 가 한 벌 · 현재 페이지 표시가 이동을 따라감 ·
              Code/Import/Export/Save 가 새 자리에서 동작
     panels   Select/Images/Dock 이 같은 왼쪽 패널을 쓴다 · 패널만큼
              stage 가 비킨다 · Images/Dock 을 다녀와도 고른 요소가
              그대로 · Dock 의 적용 안 한 사본이 살아남는다 · AI 패널과
              동시에 열림 · 좌우 패널 개폐마다 Preview 가 stage 가운데
     inspect  팝오버가 Preview 위가 아니라 패널 안 · Preview 위에는
              테두리 · 이름표 · 핸들만
     history  Undo/Redo 가 직접 편집 · Dock · 이미지 슬롯을 되돌리고
              다시 적용 · dirty · Save 뒤의 Undo · 단축키(입력칸 제외)
     fit      1600→320px 폭마다 컨트롤끼리 겹침 0 · 화면 밖 0 (AI 열림/닫힘) ·
              1280+AI 에서 한 줄(가장 긴 페이지 이름으로도)
     narrow   390px — 가로 넘침 0 · 첫 줄 Select/Images/Dock/Save/
              Publish/··· · ··· 메뉴의 Code/Import/Export · 왼쪽 패널은
              아래 시트 · AI 와 번갈아 열림 · 버튼끼리 겹치지 않음

   실행:
     node studio/studio-shell-e2e-test.mjs
     node studio/studio-shell-e2e-test.mjs --browser=webkit
     node studio/studio-shell-e2e-test.mjs --only=panels
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8968;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=y`;

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
   공용 도구
========================================================== */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function openStudio(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport || { width: 1280, height: 800 });

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  await page.route("**/api/skin-ai", route =>
    route.fulfill({ status: 500, contentType: "text/plain", body: "not used" })
  );
  await page.route("https://example.com/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 })
  );

  await page.goto(SCENARIO_URL, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );
  await previewHas(page, ".y-home");
  return page;
}

function previewHas(page, selector, timeoutMs = 8000) {
  return page.waitForFunction(
    (sel) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return !!(doc && doc.querySelector(sel));
    },
    selector,
    { timeout: timeoutMs }
  );
}

async function previewClick(page, selector) {
  return page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    if (!el) return null;
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  }, selector);
}

async function selectInPreview(page, selector) {
  const name = selector.replace(/^\./, "");
  await previewClick(page, selector);
  await page.waitForFunction(
    (n) => {
      const s = window.getStudioInspectorSelection();
      return !!s && s.classNames.indexOf(n) !== -1;
    },
    name,
    { timeout: 6000 }
  );
}

/* 패널 모션(0.15s)이 끝날 때까지 */
async function settle(page) {
  await sleep(260);
}

function rect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      left: b.left, right: b.right, top: b.top, bottom: b.bottom,
      width: b.width, height: b.height,
      visible: b.width > 0 && b.height > 0 && window.getComputedStyle(el).visibility !== "hidden"
    };
  }, selector);
}

function shell(page) {
  return page.evaluate(() => window.getStudioShellState());
}

function workingHomeHtml(page) {
  return page.evaluate(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    return (pkg.templates && pkg.templates.home && pkg.templates.home.html) || pkg.html || "";
  });
}

function isDirty(page) {
  return page.evaluate(() => window.getStudioAiWorkingState().isDirty);
}

function overlaps(a, b) {
  return !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

const TOOLBAR_IDS = [
  "studioBackButton", "studioInspectorButton", "studioImagesButton", "studioDockButton",
  "studioPageIndicator", "studioViewportToggle", "studioUndoButton", "studioRedoButton",
  "studioCodeButton", "studioImportButton", "studioExportButton", "studioMoreButton",
  "studioSaveButton", "studioPublishButton", "studioAiToggleButton"
];


/* =========================================================
   toolbar — 세 그룹
========================================================== */

async function runToolbar(context) {

  const page = await openStudio(context);

  const groups = await page.evaluate((ids) => {
    const where = (id) => {
      const el = document.getElementById(id);
      if (el.closest(".studio-top-dock-lead")) return "lead";
      if (el.closest(".studio-top-dock-groups")) return "center";
      if (el.closest(".studio-top-dock-actions")) return "actions";
      return "none";
    };
    const out = {};
    ids.forEach(id => { out[id] = where(id); });
    out.duplicates = ids.filter(id => document.querySelectorAll(`#${id}`).length !== 1);
    return out;
  }, TOOLBAR_IDS);

  record(
    "A1. 왼쪽 = Select · Images · Dock(+나가기), 가운데 = 현재 페이지 · Desktop/Mobile · Undo/Redo, 오른쪽 = Code · Import · Export · Save · Publish",
    ["studioBackButton", "studioInspectorButton", "studioImagesButton", "studioDockButton"].every(id => groups[id] === "lead") &&
      ["studioPageIndicator", "studioViewportToggle", "studioUndoButton", "studioRedoButton"].every(id => groups[id] === "center") &&
      ["studioCodeButton", "studioImportButton", "studioExportButton", "studioSaveButton", "studioPublishButton"].every(id => groups[id] === "actions"),
    JSON.stringify(groups)
  );

  record(
    "A2. 같은 기능의 버튼이 두 벌 있지 않다(id 마다 요소 하나)",
    groups.duplicates.length === 0,
    JSON.stringify(groups.duplicates)
  );

  const look = await page.evaluate(() => {
    const primaries = Array.from(document.querySelectorAll("#studioTopDock .studio-corner-button--primary")).map(b => b.id);
    const imp = document.getElementById("studioImportButton");
    const exp = document.getElementById("studioExportButton");
    const ib = imp.getBoundingClientRect();
    const eb = exp.getBoundingClientRect();
    const more = document.getElementById("studioMoreButton");
    return {
      primaries,
      samePair: imp.parentElement === exp.parentElement && imp.parentElement.classList.contains("studio-button-pair"),
      gap: eb.left - ib.right,
      sameRow: Math.abs(eb.top - ib.top) < 1,
      moreVisible: more.getClientRects().length > 0
    };
  });

  record(
    "A3. Publish 만 primary 이고, Import · Export 는 붙은 한 덩어리다(간격 ≤ 0)",
    look.primaries.length === 1 && look.primaries[0] === "studioPublishButton" &&
      look.samePair && look.gap <= 0.5 && look.gap >= -1.5 && look.sameRow,
    JSON.stringify(look)
  );

  record("A4. 넓은 화면에는 ··· 버튼이 없다", look.moreVisible === false);

  /* A5. 가운데 그룹이 바 정중앙 */
  const center = await page.evaluate(() => {
    const g = document.querySelector(".studio-top-dock-groups").getBoundingClientRect();
    const bar = document.getElementById("studioTopDock").getBoundingClientRect();
    return { group: (g.left + g.right) / 2, bar: (bar.left + bar.right) / 2, barH: bar.height };
  });
  record(
    "A5. 1280px 에서 가운데 그룹은 바의 정중앙이고 바는 한 줄이다",
    Math.abs(center.group - center.bar) <= 2 && center.barH <= 50,
    JSON.stringify(center)
  );

  /* A6. 현재 페이지 표시 */
  const before = await page.textContent("#studioPageIndicator");
  await previewClick(page, ".y-link");
  await previewHas(page, ".y-category");
  await page.waitForFunction(() => document.getElementById("studioPageIndicator").textContent === "CATEGORY");
  await page.click("#studioPreviewBackButton");
  await previewHas(page, ".y-home");
  const after = await page.textContent("#studioPageIndicator");
  record(
    "A6. 현재 페이지 표시가 Preview 이동을 따라간다(HOME → CATEGORY → HOME)",
    before.trim() === "HOME" && after.trim() === "HOME",
    JSON.stringify({ before, after })
  );

  /* A7. Code / Import / Export 가 새 자리에서 동작 */
  await page.click("#studioCodeButton");
  const codeOpen = await page.waitForFunction(
    () => { const o = document.querySelector(".code-editor-overlay"); return !!o && !o.hidden; },
    null, { timeout: 4000 }
  ).then(() => true, () => false);
  await page.click(".code-editor-close");
  await page.click("#studioImportButton");
  const importOpen = await page.waitForFunction(
    () => { const o = document.querySelector(".import-editor-overlay"); return !!o && !o.hidden; },
    null, { timeout: 4000 }
  ).then(() => true, () => false);
  await page.click(".import-editor-close");
  const download = page.waitForEvent("download", { timeout: 8000 });
  await page.click("#studioExportButton");
  const file = await download.then(d => d.suggestedFilename(), () => "");
  record(
    "A7. Code · Import 는 편집기를 열고 Export 는 .json 을 내려준다",
    codeOpen && importOpen && /\.json$/.test(file),
    JSON.stringify({ codeOpen, importOpen, file })
  );

  /* A8. Desktop/Mobile 전환 */
  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  const mobile = await page.evaluate(() => ({
    cls: document.getElementById("studioPreviewStage").classList.contains("studio-preview-stage--mobile"),
    frame: document.getElementById("studioPreviewFrame").offsetWidth
  }));
  await page.click('#studioViewportToggle [data-viewport-mode="desktop"]');
  const desktop = await page.evaluate(() =>
    document.getElementById("studioPreviewStage").classList.contains("studio-preview-stage--mobile")
  );
  record(
    "A8. Desktop/Mobile 전환이 그대로 동작한다(Mobile 은 390px 프레임)",
    mobile.cls && mobile.frame === 390 && desktop === false,
    JSON.stringify({ mobile, desktop })
  );

  await page.close();

}


/* =========================================================
   panels — 왼쪽 패널 하나를 셋이 나눠 쓴다
========================================================== */

async function runPanels(context) {

  const page = await openStudio(context);

  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await previewHas(page, "[data-imory-edit-id]");
  await settle(page);

  const p1 = await rect(page, "#studioLeftPanel");
  const s1 = await rect(page, "#studioPreviewStage");
  const st1 = await shell(page);
  record(
    "B1. Select 를 누르면 Inspector 가 켜지고 왼쪽 패널이 열리며 stage 가 패널만큼 비킨다",
    st1.leftPanelOpen && st1.leftPanelMode === "select" && p1.visible &&
      Math.abs(p1.left) < 1 && Math.abs(s1.left - p1.right) <= 1.5,
    JSON.stringify({ p1, s1, st1 })
  );

  await selectInPreview(page, ".y-heading");
  const firstId = await page.evaluate(() => window.getStudioInspectorSelection().editId);

  await page.click("#studioImagesButton");
  await page.waitForFunction(() => {
    const o = document.querySelector("#studioLeftPanelImages .images-panel-overlay");
    return !!o && !o.hidden;
  });
  const b2 = await page.evaluate(() => ({
    mode: window.getStudioShellState().leftPanelMode,
    selectHidden: document.getElementById("studioLeftPanelSelect").hidden,
    inspectorOn: window.getStudioInspectorState().enabled,
    selection: window.getStudioInspectorSelection() && window.getStudioInspectorSelection().editId,
    selectExpanded: document.getElementById("studioInspectorButton").getAttribute("aria-expanded"),
    imagesExpanded: document.getElementById("studioImagesButton").getAttribute("aria-expanded"),
    bodyOverlay: !!document.querySelector("body > .images-panel-overlay")
  }));
  record(
    "B2. Images 는 같은 왼쪽 패널에 열리고(modal 아님) Select 모드와 고른 요소는 그대로다",
    b2.mode === "images" && b2.selectHidden && b2.inspectorOn && b2.selection === firstId &&
      b2.selectExpanded === "false" && b2.imagesExpanded === "true" && !b2.bodyOverlay,
    JSON.stringify(b2)
  );

  /* Dock — 사본에 항목 하나를 더한 채 떠났다 돌아온다 */
  await page.click("#studioDockButton");
  await page.waitForSelector("#studioLeftPanelDock .dock-panel-overlay--open");
  const itemsBefore = await page.$$eval("#studioLeftPanelDock .dock-panel-item", els => els.length);
  await page.click("#studioLeftPanelDock .dock-panel-button--add");
  const itemsAdded = await page.$$eval("#studioLeftPanelDock .dock-panel-item", els => els.length);
  const b3 = await page.evaluate(() => ({
    mode: window.getStudioShellState().leftPanelMode,
    imagesHidden: document.querySelector("#studioLeftPanelImages .images-panel-overlay").hidden,
    bodyOverlay: !!document.querySelector("body > .dock-panel-overlay")
  }));
  record(
    "B3. Dock 도 같은 왼쪽 패널에 열린다(modal 아님, Images 는 닫힘)",
    b3.mode === "dock" && b3.imagesHidden && !b3.bodyOverlay && itemsAdded === itemsBefore + 1,
    JSON.stringify({ b3, itemsBefore, itemsAdded })
  );

  await page.click("#studioInspectorButton");
  await settle(page);
  const b4 = await page.evaluate(() => ({
    mode: window.getStudioShellState().leftPanelMode,
    inspectorOn: window.getStudioInspectorState().enabled,
    selection: window.getStudioInspectorSelection() && window.getStudioInspectorSelection().editId,
    popoverVisible: !document.getElementById("studioInspectorPopover").hidden
  }));
  record(
    "B4. Images · Dock 을 다녀와 Select 로 돌아와도 고른 요소가 그대로다",
    b4.mode === "select" && b4.inspectorOn && b4.selection === firstId && b4.popoverVisible,
    JSON.stringify({ b4, firstId })
  );

  /* Select 를 보는 동안 Escape 는 선택만 푼다 — 숨은 Dock 사본은 남는다 */
  await page.keyboard.press("Escape");
  await page.click("#studioDockButton");
  await page.waitForSelector("#studioLeftPanelDock .dock-panel-overlay--open");
  const itemsKept = await page.$$eval("#studioLeftPanelDock .dock-panel-item", els => els.length);
  record(
    "B5. 다른 내용을 보다 돌아오면 Dock 의 적용하지 않은 사본이 그대로다(Escape 도 그 사본을 버리지 않는다)",
    itemsKept === itemsAdded,
    JSON.stringify({ itemsKept, itemsAdded })
  );

  const dockBefore = await page.evaluate(() => JSON.stringify(window.getStudioAiWorkingState({ includePackage: true }).skinPackage.bottomDock || null));
  await page.click("#studioLeftPanelDock .dock-panel-footer .dock-panel-button:not(.dock-panel-button--primary):not(.dock-panel-button--quiet)");
  await settle(page);
  const b6 = await page.evaluate(() => ({
    open: window.getStudioShellState().leftPanelOpen,
    mode: window.getStudioShellState().leftPanelMode,
    dock: JSON.stringify(window.getStudioAiWorkingState({ includePackage: true }).skinPackage.bottomDock || null),
    stageLeft: document.getElementById("studioPreviewStage").getBoundingClientRect().left
  }));
  record(
    "B6. Dock 취소는 working draft 를 바꾸지 않고, Select 모드가 켜져 있으니 패널은 Select 로 돌아간다",
    b6.open && b6.mode === "select" && b6.dock === dockBefore && b6.stageLeft > 100,
    JSON.stringify(b6)
  );

  /* 좌우 동시 + 가운데 정렬 */
  await page.click("#studioAiToggleButton");
  await settle(page);
  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await settle(page);

  const both = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const stage = r("studioPreviewStage");
    const left = r("studioLeftPanel");
    const ai = r("studioAiDrawer");
    const frame = r("studioPreviewFrame");
    return {
      stageLeft: stage.left, stageRight: stage.right, leftRight: left.right, aiLeft: ai.left,
      stageCenter: (stage.left + stage.right) / 2, frameCenter: (frame.left + frame.right) / 2,
      frameInside: frame.left >= stage.left - 1 && frame.right <= stage.right + 1,
      aiOpen: window.getStudioAiPanelLayoutState().open, leftOpen: window.getStudioShellState().leftPanelOpen
    };
  });
  record(
    "B7. 왼쪽 패널과 AI 패널을 함께 열면 stage 가 둘 사이이고 Mobile Preview 가 그 가운데에 있다",
    both.aiOpen && both.leftOpen &&
      Math.abs(both.stageLeft - both.leftRight) <= 1.5 &&
      Math.abs(both.stageRight - both.aiLeft) <= 1.5 &&
      Math.abs(both.stageCenter - both.frameCenter) <= 2 && both.frameInside,
    JSON.stringify(both)
  );

  await page.click("#studioLeftPanelCollapse");
  await settle(page);
  const leftClosed = await page.evaluate(() => {
    const stage = document.getElementById("studioPreviewStage").getBoundingClientRect();
    const frame = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    const panel = document.getElementById("studioLeftPanel");
    return {
      stageLeft: stage.left,
      center: Math.abs((stage.left + stage.right) / 2 - (frame.left + frame.right) / 2),
      panelHidden: window.getComputedStyle(panel).visibility === "hidden",
      inspectorOn: window.getStudioInspectorState().enabled
    };
  });
  await page.click("#studioAiPanelCollapse");
  await settle(page);
  const noneOpen = await page.evaluate(() => {
    const stage = document.getElementById("studioPreviewStage").getBoundingClientRect();
    const frame = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    return {
      stage: [stage.left, stage.right, window.innerWidth],
      center: Math.abs((stage.left + stage.right) / 2 - (frame.left + frame.right) / 2)
    };
  });
  record(
    "B8. 패널을 하나씩 접을 때마다 stage 가 다시 계산되고 Preview 는 계속 가운데다(접어도 Select 모드는 유지)",
    Math.abs(leftClosed.stageLeft) < 1 && leftClosed.center <= 2 && leftClosed.panelHidden && leftClosed.inspectorOn &&
      Math.abs(noneOpen.stage[0]) < 1 && Math.abs(noneOpen.stage[1] - noneOpen.stage[2]) < 1 && noneOpen.center <= 2,
    JSON.stringify({ leftClosed, noneOpen })
  );

  await page.click('#studioViewportToggle [data-viewport-mode="desktop"]');

  /* 접힌 채 같은 요소를 누르면 Select 가 다시 열린다(선택 유지) */
  await selectInPreview(page, ".y-heading");
  await settle(page);
  const reopen = await page.evaluate(() => ({ ...window.getStudioShellState(), on: window.getStudioInspectorState().enabled, sel: window.getStudioInspectorSelection() && window.getStudioInspectorSelection().editId }));

  /* Select 는 여전히 토글이다 — 보여 주는 중에도, 접힌 채로도 누르면 모드가 꺼진다 */
  await page.click("#studioInspectorButton");
  await settle(page);
  const off = await page.evaluate(() => ({ ...window.getStudioShellState(), on: window.getStudioInspectorState().enabled, pressed: document.getElementById("studioInspectorButton").getAttribute("aria-pressed") }));
  await page.click("#studioInspectorButton");
  await page.click("#studioLeftPanelCollapse");
  await settle(page);
  await page.click("#studioInspectorButton");
  await settle(page);
  const offCollapsed = await page.evaluate(() => ({ ...window.getStudioShellState(), on: window.getStudioInspectorState().enabled }));
  record(
    "B9. 접어 둔 Select 는 Preview 에서 요소를 누르면 다시 열리고, Select 버튼은 예전처럼 토글이다(보여 주는 중에도 접힌 채로도 누르면 꺼진다)",
    reopen.leftPanelOpen && reopen.leftPanelMode === "select" && reopen.on && !!reopen.sel &&
      !off.leftPanelOpen && !off.on && off.pressed === "false" &&
      !offCollapsed.leftPanelOpen && !offCollapsed.on,
    JSON.stringify({ reopen, off, offCollapsed })
  );

  /* Images 닫기 버튼 → 패널이 접힌다 */
  await page.click("#studioImagesButton");
  await page.waitForFunction(() => !document.querySelector("#studioLeftPanelImages .images-panel-overlay").hidden);
  await page.click("#studioLeftPanelImages .images-panel-done-button");
  await settle(page);
  const imagesClosed = await shell(page);
  record(
    "B10. Images 의 닫기는 왼쪽 패널을 접는다",
    !imagesClosed.leftPanelOpen,
    JSON.stringify(imagesClosed)
  );

  await page.close();

}


/* =========================================================
   inspect — Preview 위에는 테두리 · 이름표 · 핸들만
========================================================== */

async function runInspect(context) {

  const page = await openStudio(context);

  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await previewHas(page, "[data-imory-edit-id]");
  await settle(page);

  await selectInPreview(page, ".y-static-image");
  await sleep(150);

  const c = await page.evaluate(() => {
    const popover = document.getElementById("studioInspectorPopover");
    const label = document.getElementById("studioInspectorSelectLabel");
    const box = document.getElementById("studioInspectorSelectBox");
    const frame = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    const pb = popover.getBoundingClientRect();
    const lb = label.getBoundingClientRect();
    const bb = box.getBoundingClientRect();
    const handles = Array.from(document.querySelectorAll(".studio-inspector-handle")).filter(h => !h.hidden).length;
    return {
      inPanel: !!popover.closest("#studioLeftPanelSelect"),
      inLayer: !!popover.closest("#studioInspectorLayer"),
      popoverOverFrame: pb.right > frame.left + 1 && pb.left < frame.right - 1 && pb.bottom > frame.top && pb.top < frame.bottom,
      labelText: label.textContent,
      titleText: document.getElementById("studioInspectorPopoverTitle").textContent,
      labelVisible: !label.hidden && lb.width > 0,
      labelNearBox: Math.abs(lb.left - bb.left) <= 2 && (Math.abs(lb.bottom + 3 - bb.top) <= 2 || Math.abs(lb.top - 3 - bb.top) <= 2),
      labelPointer: window.getComputedStyle(label).pointerEvents,
      boxVisible: !box.hidden,
      handles,
      layerChildren: Array.from(document.getElementById("studioInspectorLayer").children).map(el => el.className.split(" ")[0])
    };
  });
  record(
    "C1. 직접 수정 팝오버는 왼쪽 패널 안에 있고 Preview 위에 겹치지 않는다",
    c.inPanel && !c.inLayer && !c.popoverOverFrame,
    JSON.stringify(c)
  );
  record(
    "C2. Preview 위에는 선택 테두리 · 요소 이름표 · 크기 핸들이 남는다(이름표는 팝오버 제목과 같은 문구, 클릭을 가로채지 않음)",
    c.boxVisible && c.labelVisible && c.labelText && c.labelText === c.titleText &&
      c.labelNearBox && c.labelPointer === "none" && c.handles === 4 &&
      c.layerChildren.indexOf("studio-inspector-popover") === -1,
    JSON.stringify(c)
  );

  await page.keyboard.press("Escape");
  await sleep(100);
  const cleared = await page.evaluate(() => ({
    label: document.getElementById("studioInspectorSelectLabel").hidden,
    popover: document.getElementById("studioInspectorPopover").hidden,
    empty: window.getComputedStyle(document.getElementById("studioLeftPanelSelectEmpty")).display !== "none"
  }));
  record(
    "C3. 선택을 풀면 이름표도 사라지고 패널에는 안내 문구가 나온다",
    cleared.label && cleared.popover && cleared.empty,
    JSON.stringify(cleared)
  );

  /* 직접 수정의 "이미지 변경"은 같은 패널을 Images 로 바꾼다 — 숨은 자리에
     그려지지 않는다. 닫으면 Select 로(고른 요소 그대로) 돌아온다. */
  await selectInPreview(page, ".y-cover");
  for (let i = 0; i < 3; i += 1) {
    if (await page.evaluate(() => window.getStudioInspectorState().editingOpen)) break;
    await page.click("#studioInspectorDirectButton");
    await sleep(200);
  }
  await page.click("#studioInspectorImageChange");
  await page.waitForFunction(() => !document.querySelector("#studioLeftPanelImages .images-panel-overlay").hidden);
  await settle(page);
  const viaInspector = await page.evaluate(() => {
    const overlay = document.querySelector("#studioLeftPanelImages .images-panel-overlay");
    return {
      mode: window.getStudioShellState().leftPanelMode,
      visible: overlay.getClientRects().length > 0 && overlay.getBoundingClientRect().width > 0,
      on: window.getStudioInspectorState().enabled,
      sel: window.getStudioInspectorSelection() && window.getStudioInspectorSelection().classNames
    };
  });
  await page.click("#studioLeftPanelImages .images-panel-done-button");
  await settle(page);
  const backToSelect = await page.evaluate(() => ({
    ...window.getStudioShellState(),
    sel: window.getStudioInspectorSelection() && window.getStudioInspectorSelection().classNames,
    popover: !document.getElementById("studioInspectorPopover").hidden
  }));
  record(
    "C3-b. 직접 수정의 '이미지 변경'은 왼쪽 패널을 Images 로 바꾸고(보이는 자리), 닫으면 고른 요소 그대로 Select 로 돌아온다",
    viaInspector.mode === "images" && viaInspector.visible && viaInspector.on &&
      Array.isArray(viaInspector.sel) && viaInspector.sel.indexOf("y-cover") !== -1 &&
      backToSelect.leftPanelOpen && backToSelect.leftPanelMode === "select" &&
      Array.isArray(backToSelect.sel) && backToSelect.sel.indexOf("y-cover") !== -1 && backToSelect.popover,
    JSON.stringify({ viaInspector, backToSelect })
  );

  /* 패널을 접어 둔 채 새 요소를 고르면 Select 가 다시 열린다 */
  await page.click("#studioLeftPanelCollapse");
  await settle(page);
  await selectInPreview(page, ".y-heading");
  await settle(page);
  const revealed = await shell(page);
  record(
    "C4. 패널이 접혀 있어도 새 요소를 고르면 Select 내용으로 다시 열린다",
    revealed.leftPanelOpen && revealed.leftPanelMode === "select",
    JSON.stringify(revealed)
  );

  await page.close();

}


/* =========================================================
   history — Undo / Redo
========================================================== */

async function runHistory(context) {

  const page = await openStudio(context);

  const initial = await page.evaluate(() => ({
    undo: document.getElementById("studioUndoButton").disabled,
    redo: document.getElementById("studioRedoButton").disabled,
    dirty: window.getStudioAiWorkingState().isDirty
  }));
  record(
    "D1. 처음에는 Undo · Redo 가 비활성이다",
    initial.undo && initial.redo && initial.dirty === false,
    JSON.stringify(initial)
  );

  const original = await workingHomeHtml(page);

  /* 직접 편집 — 텍스트 */
  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await previewHas(page, "[data-imory-edit-id]");
  await selectInPreview(page, ".y-heading");
  for (let i = 0; i < 3; i += 1) {
    if (await page.evaluate(() => window.getStudioInspectorState().editingOpen)) break;
    await page.click("#studioInspectorDirectButton");
    await sleep(200);
  }
  await page.fill('#studioInspectorFields [data-inspector-control="text"]', "Shell Heading");
  await page.click("#studioInspectorTextApply");
  await page.waitForFunction(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    return pkg.templates.home.html.indexOf("Shell Heading") !== -1;
  });

  const edited = await page.evaluate(() => ({
    undo: document.getElementById("studioUndoButton").disabled,
    dirty: window.getStudioAiWorkingState().isDirty
  }));

  await page.click("#studioUndoButton");
  await previewHas(page, ".y-home");
  const undone = await workingHomeHtml(page);
  const undoneState = await page.evaluate(() => ({
    dirty: window.getStudioAiWorkingState().isDirty,
    redo: document.getElementById("studioRedoButton").disabled,
    save: document.getElementById("studioSaveButton").disabled
  }));

  await page.click("#studioRedoButton");
  const redone = await workingHomeHtml(page);
  const redoneDirty = await isDirty(page);

  record(
    "D2. 직접 편집 → Undo 는 원래 HTML 과 dirty=false 로, Redo 는 편집과 dirty=true 로",
    !edited.undo && edited.dirty === true &&
      undone === original && undoneState.dirty === false && undoneState.redo === false && undoneState.save === true &&
      redone.indexOf("Shell Heading") !== -1 && redoneDirty === true,
    JSON.stringify({ edited, undoneState, redoneDirty, undoneSame: undone === original })
  );

  /* 되돌린 뒤 선택 요소가 여전히 그 요소인가(선택 복원 로직을 그대로 지난다) */
  const selectionAfter = await page.evaluate(() => {
    const s = window.getStudioInspectorSelection();
    return s ? s.classNames : null;
  });
  record(
    "D3. Undo/Redo 는 선택 복원 관문을 그대로 지난다(같은 요소면 선택 유지)",
    Array.isArray(selectionAfter) && selectionAfter.indexOf("y-heading") !== -1,
    JSON.stringify(selectionAfter)
  );

  /* Dock 적용 → Undo */
  await page.click("#studioDockButton");
  await page.waitForSelector("#studioLeftPanelDock .dock-panel-overlay--open");
  await page.click("#studioLeftPanelDock .dock-panel-button--primary");
  await page.waitForFunction(() => !!window.getStudioAiWorkingState({ includePackage: true }).skinPackage.bottomDock);
  await page.click("#studioUndoButton");
  const dockUndone = await page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.bottomDock || null);
  const htmlAfterDockUndo = await workingHomeHtml(page);
  record(
    "D4. Dock 적용도 한 칸이다 — Undo 하면 dock 이 사라지고 그 앞의 편집은 남는다",
    dockUndone === null && htmlAfterDockUndo.indexOf("Shell Heading") !== -1,
    JSON.stringify({ dockUndone })
  );

  /* 단축키 — 본문 포커스에서는 Undo, AI 입력칸에서는 가로채지 않는다 */
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+z`);
  const afterShortcut = await workingHomeHtml(page);
  await page.click("#studioAiToggleButton");
  await page.focus("#studioAiDrawerInput");
  const historyBefore = await page.evaluate(() => window.getStudioHistoryState());
  await page.keyboard.press(`${mod}+Shift+z`);
  const historyAfter = await page.evaluate(() => window.getStudioHistoryState());
  record(
    "D5. Ctrl+Z 는 본문 포커스에서 Undo 이고, 입력칸 안의 Ctrl+Shift+Z 는 가로채지 않는다",
    afterShortcut === original && JSON.stringify(historyBefore) === JSON.stringify(historyAfter),
    JSON.stringify({ shortcutUndid: afterShortcut === original, historyBefore, historyAfter })
  );
  await page.click("#studioAiPanelCollapse");

  /* Save 뒤의 Undo — 저장된 draft 와 다르므로 dirty */
  await page.click("#studioRedoButton");
  await page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === true);
  await page.click("#studioSaveButton");
  await page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === false, null, { timeout: 8000 });
  await page.click("#studioUndoButton");
  const afterSaveUndo = await page.evaluate(() => ({
    dirty: window.getStudioAiWorkingState().isDirty,
    save: document.getElementById("studioSaveButton").disabled,
    publish: document.getElementById("studioPublishButton").disabled
  }));
  record(
    "D6. Save 뒤에 Undo 하면 dirty 가 되고 Save 가 다시 열린다(Publish 는 잠김)",
    afterSaveUndo.dirty === true && afterSaveUndo.save === false && afterSaveUndo.publish === true,
    JSON.stringify(afterSaveUndo)
  );

  await page.close();

}


/* =========================================================
   narrow — 390px
========================================================== */

async function runNarrow(context) {

  const page = await openStudio(context, { width: 390, height: 844 });
  await settle(page);

  const m = await page.evaluate((ids) => {
    const r = (id) => {
      const el = document.getElementById(id);
      if (!el || el.getClientRects().length === 0) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    };
    const out = {};
    ids.forEach(id => { out[id] = r(id); });
    out.innerWidth = window.innerWidth;
    out.scrollWidth = document.documentElement.scrollWidth;
    out.bar = r("studioTopDock");
    return out;
  }, TOOLBAR_IDS);

  const row1 = ["studioInspectorButton", "studioImagesButton", "studioDockButton", "studioSaveButton", "studioPublishButton", "studioMoreButton"];
  const row2 = ["studioBackButton", "studioPageIndicator", "studioViewportToggle", "studioUndoButton", "studioRedoButton", "studioAiToggleButton"];
  const row1Top = m.studioInspectorButton && m.studioInspectorButton.top;

  record(
    "E1. 390px 에서 가로 넘침이 없고 모든 상단 컨트롤이 화면 안이다",
    m.scrollWidth <= m.innerWidth &&
      [...row1, ...row2].every(id => m[id] && m[id].left >= -0.5 && m[id].right <= m.innerWidth + 0.5),
    JSON.stringify({ scrollWidth: m.scrollWidth, innerWidth: m.innerWidth })
  );

  record(
    "E2. 첫 줄 = Select · Images · Dock · Save · Publish · ··· (한 줄), 둘째 줄 = 나머지",
    row1.every(id => m[id] && Math.abs(m[id].top - row1Top) <= 3) &&
      row2.every(id => m[id] && m[id].top > row1Top + 10),
    JSON.stringify(Object.fromEntries([...row1, ...row2].map(id => [id, m[id] && Math.round(m[id].top)])))
  );

  record(
    "E3. Code · Import · Export 는 ··· 를 열기 전에는 보이지 않는다",
    m.studioCodeButton === null && m.studioImportButton === null && m.studioExportButton === null,
    JSON.stringify({ code: m.studioCodeButton, imp: m.studioImportButton, exp: m.studioExportButton })
  );

  const visible = [...row1, ...row2].map(id => [id, m[id]]).filter(([, b]) => b);
  const clashes = [];
  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      if (overlaps(visible[i][1], visible[j][1])) clashes.push(`${visible[i][0]}↔${visible[j][0]}`);
    }
  }
  record("E4. 상단 컨트롤끼리 겹치지 않는다", clashes.length === 0, JSON.stringify(clashes));

  /* ··· 메뉴 */
  await page.click("#studioMoreButton");
  const menu = await page.evaluate(() => {
    const more = document.getElementById("studioMoreButton").getBoundingClientRect();
    const ids = ["studioCodeButton", "studioImportButton", "studioExportButton"];
    const boxes = ids.map(id => {
      const el = document.getElementById(id);
      if (el.getClientRects().length === 0) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    });
    return {
      expanded: document.getElementById("studioMoreButton").getAttribute("aria-expanded"),
      boxes,
      belowMore: boxes.every(b => b && b.top >= more.bottom - 1),
      inside: boxes.every(b => b && b.left >= 0 && b.right <= window.innerWidth),
      hit: (() => {
        const b = document.getElementById("studioCodeButton").getBoundingClientRect();
        const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return el && el.id;
      })()
    };
  });
  record(
    "E5. ··· 를 누르면 Code · Import · Export 가 그 아래 세로 목록으로 보이고 눌린다",
    menu.expanded === "true" && menu.belowMore && menu.inside && menu.hit === "studioCodeButton",
    JSON.stringify(menu)
  );

  await page.click("#studioCodeButton");
  const codeOpen = await page.waitForFunction(
    () => { const o = document.querySelector(".code-editor-overlay"); return !!o && !o.hidden; },
    null, { timeout: 4000 }
  ).then(() => true, () => false);
  const menuClosed = await page.evaluate(() => window.getStudioShellState().moreMenuOpen);
  await page.click(".code-editor-close");
  record(
    "E6. 메뉴의 Code 는 편집기를 열고 메뉴는 닫힌다",
    codeOpen && menuClosed === false,
    JSON.stringify({ codeOpen, menuClosed })
  );

  await page.click("#studioMoreButton");
  await page.keyboard.press("Escape");
  const escClosed = await page.evaluate(() => window.getStudioShellState().moreMenuOpen);
  await page.click("#studioMoreButton");
  await page.mouse.click(200, 600);
  const outsideClosed = await page.evaluate(() => window.getStudioShellState().moreMenuOpen);
  record("E7. Escape 와 바깥 누르기로 메뉴가 닫힌다", escClosed === false && outsideClosed === false);

  /* 왼쪽 패널 = 아래 시트 */
  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await settle(page);
  const sheet = await page.evaluate(() => {
    const p = document.getElementById("studioLeftPanel").getBoundingClientRect();
    const bar = document.getElementById("studioTopDock").getBoundingClientRect();
    const stage = document.getElementById("studioPreviewStage").getBoundingClientRect();
    return {
      left: p.left, right: p.right, top: p.top, bottom: p.bottom,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      barBottom: bar.bottom, stageLeft: stage.left,
      scrollWidth: document.documentElement.scrollWidth
    };
  });
  record(
    "E8. 좁은 화면의 왼쪽 패널은 화면 아래 전체 폭 시트이고 Preview 를 밀지 않는다",
    Math.abs(sheet.left) < 1 && Math.abs(sheet.right - sheet.innerWidth) < 1 &&
      Math.abs(sheet.bottom - sheet.innerHeight) < 1 && sheet.top > sheet.barBottom + 40 &&
      Math.abs(sheet.stageLeft) < 1 && sheet.scrollWidth <= sheet.innerWidth,
    JSON.stringify(sheet)
  );

  await selectInPreview(page, ".y-heading");
  await settle(page);
  const inSheet = await page.evaluate(() => {
    const popover = document.getElementById("studioInspectorPopover");
    const b = popover.getBoundingClientRect();
    const panel = document.getElementById("studioLeftPanel").getBoundingClientRect();
    return { inside: b.top >= panel.top - 1 && b.left >= panel.left - 1 && b.right <= panel.right + 1, visible: !popover.hidden };
  });
  record("E9. 시트 안에서 고른 요소의 수정 내용이 보인다", inSheet.inside && inSheet.visible, JSON.stringify(inSheet));

  /* AI 와 번갈아 */
  await page.click("#studioAiToggleButton");
  await settle(page);
  const aiOpen = await page.evaluate(() => ({ ai: window.getStudioAiPanelLayoutState().open, left: window.getStudioShellState().leftPanelOpen, sel: !!window.getStudioInspectorSelection() }));
  await page.click("#studioImagesButton");
  await settle(page);
  const leftAgain = await page.evaluate(() => ({ ai: window.getStudioAiPanelLayoutState().open, left: window.getStudioShellState().leftPanelOpen, mode: window.getStudioShellState().leftPanelMode }));
  record(
    "E10. 좁은 화면에서는 AI 패널과 왼쪽 시트가 번갈아 열린다(고른 요소는 유지)",
    aiOpen.ai && !aiOpen.left && aiOpen.sel && !leftAgain.ai && leftAgain.left && leftAgain.mode === "images",
    JSON.stringify({ aiOpen, leftAgain })
  );

  const finalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("E11. 패널을 여닫은 뒤에도 가로 넘침 0", finalOverflow <= 0, String(finalOverflow));

  await page.close();

}


/* =========================================================
   fit — 폭을 줄여 가며 버튼 하나하나를 잰다

   좁은 화면에서는 그룹 wrapper 가 display:contents 라 사각형이
   없다 — 그래서 wrapper 가 아니라 **보이는 컨트롤끼리** 겹침을 본다.
========================================================== */

async function runFit(context) {

  const page = await openStudio(context, { width: 1600, height: 900 });

  const probe = () => page.evaluate((ids) => {
    const boxes = [];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.getClientRects().length === 0) return;
      const b = el.getBoundingClientRect();
      if (b.width === 0) return;
      boxes.push({ id, left: b.left, right: b.right, top: b.top, bottom: b.bottom });
    });
    const bar = document.getElementById("studioTopDock").getBoundingClientRect();
    return {
      boxes,
      barHeight: Math.round(bar.height),
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    };
  }, TOOLBAR_IDS);

  const widths = [1600, 1440, 1280, 1180, 1100, 1000, 900, 800, 721, 720, 640, 480, 390, 360, 320];

  for (const aiOpen of [false, true]) {

    await page.setViewportSize({ width: 1600, height: 900 });
    const isOpen = await page.evaluate(() => window.getStudioAiPanelLayoutState().open);
    if (isOpen !== aiOpen) await page.click("#studioAiToggleButton");
    await settle(page);

    const bad = [];
    const bars = [];

    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await sleep(160);
      const m = await probe();
      const problems = [];
      for (let i = 0; i < m.boxes.length; i += 1) {
        const a = m.boxes[i];
        if (a.left < -0.5 || a.right > m.innerWidth + 0.5) problems.push(`${a.id} offscreen`);
        for (let j = i + 1; j < m.boxes.length; j += 1) {
          const b = m.boxes[j];
          /* Import|Export 는 테두리 1px 를 일부러 겹친 한 덩어리다 */
          const pair = a.id === "studioImportButton" && b.id === "studioExportButton";
          if (overlaps(a, b) && !(pair && Math.abs(a.right - b.left) <= 1.5)) {
            problems.push(`${a.id}↔${b.id}`);
          }
        }
      }
      if (m.scrollWidth > m.innerWidth + 0.5) problems.push("h-scroll");
      bars.push(`${width}:${m.barHeight}`);
      if (problems.length) bad.push({ width, problems });
    }

    record(
      `F1${aiOpen ? "-ai" : ""}. 1600→320px 어느 폭에서도 상단 컨트롤이 서로 겹치거나 화면 밖으로 나가지 않는다 (AI ${aiOpen ? "열림" : "닫힘"})`,
      bad.length === 0,
      bad.length ? JSON.stringify(bad) : bars.join(" ")
    );

  }

  /* 1280 + AI(바 900px) — 가장 긴 페이지 이름에서도 한 줄 */
  await page.setViewportSize({ width: 1280, height: 900 });
  await settle(page);
  const oneRow = await page.evaluate(() => {
    const indicator = document.getElementById("studioPageIndicator");
    const heights = [];
    ["HOME", "CATEGORY", "HIGHLIGHTS"].forEach(label => {
      indicator.textContent = label;
      heights.push(Math.round(document.getElementById("studioTopDock").getBoundingClientRect().height));
    });
    indicator.textContent = "HOME";
    return heights;
  });
  record(
    "F2. 1280px 창에 AI 패널을 열어도(바 900px) 상단은 한 줄이다 — 현재 페이지가 HIGHLIGHTS 여도",
    oneRow.every(h => h <= 50),
    JSON.stringify(oneRow)
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
const context = await browser.newContext({ acceptDownloads: true });

try {
  if (shouldRun("toolbar")) await runToolbar(context);
  if (shouldRun("panels")) await runPanels(context);
  if (shouldRun("inspect")) await runInspect(context);
  if (shouldRun("history")) await runHistory(context);
  if (shouldRun("narrow")) await runNarrow(context);
  if (shouldRun("fit")) await runFit(context);
} catch (err) {
  record("X. 예외 없이 끝난다", false, String(err && err.stack || err));
} finally {
  await context.close();
  await browser.close();
  server.close();
}

record(
  "Z. console/page 오류가 없다",
  consoleErrors.length === 0,
  consoleErrors.join("\n        ")
);

const passed = results.filter(r => r.pass).length;
console.log(`\n=== ${passed}/${results.length} PASS ===`);
if (passed !== results.length) process.exitCode = 1;
