/* =========================================================
   EDITORIAL-RESPONSIVE-HOME-1 — Skin Studio 의 HOME 단 구성 E2E

   기준 문서: IMORY_SIDES_DESIGN.md §6

   studio/studio-lifecycle-scenario.html?scenario=lay 에 잡지 표지형
   스킨(skin/test-skins/imory-editorial-home-v1.json)을 심어 연다.

   [panel]     Layout 버튼 → 왼쪽 패널 · 지금 값(3단) · 2단/1단 고르기가
               draft(regions)와 Preview 를 함께 바꾼다 · Undo/Redo 한 칸 ·
               방향키
   [drawer]    Mobile Preview 에서 스킨 안 버튼으로 패널을 열고 닫아도
               dirty 도 기록도 늘지 않는다 · 다시 그려도 열린 채
   [persist]   Save payload(regions + 틀 속성 · 런타임 흔적 없음) →
               그 content 로 다시 열기 → Export → 고쳐서 Import → Publish
   [nomarkup]  틀이 없는 스킨에서는 고를 수 없다는 안내 · 버튼 잠김
   [narrow]    390px Studio — ··· 메뉴 안 Layout · 시트로 열림 · 넘침 0

   sandbox Preview 는 studio/studio-sandbox-preview-e2e-test.mjs
   --only=sides 가 본다(두 origin 이 필요하다).

   실행:
     node studio/studio-sides-e2e-test.mjs
     node studio/studio-sides-e2e-test.mjs --browser=webkit
     node studio/studio-sides-e2e-test.mjs --only=persist
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8977;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=lay`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const EDITORIAL =
  JSON.parse(fs.readFileSync(path.join(ROOT, "skin/test-skins/imory-editorial-home-v1.json"), "utf8"));


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

const wants = (name) => !ONLY || ONLY === name;
const section = (name) => console.log(`\n[${name}]`);


/* =========================================================
   Studio 열기 · 읽기
========================================================== */

async function openStudio(browser, options) {

  const opts = options || {};
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));

  await page.route("**/api/skin-ai", (route) => route.fulfill({ status: 500, body: "must not be called" }));

  if (opts.skin !== null) {
    await page.addInitScript((pkg) => { window.__scenarioLaySkinPackage = pkg; }, opts.skin || EDITORIAL);
  }

  await page.goto(SCENARIO_URL, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null, { timeout: 20000 }
  );

  await previewReady(page, opts.skin === null ? ".lay-home" : "[data-imory-sides-layout]");

  return { context, page, errors };

}

function previewReady(page, selector) {
  return page.waitForFunction((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return !!(doc && doc.querySelector(sel));
  }, selector, { timeout: 10000 });
}

/* Preview 문서 안의 틀 */
function readPreviewSides(page) {
  return page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const frame = doc.querySelector('[data-imory-sides="frame"]');
    if (!frame) return null;
    const vis = (name) => {
      const el = frame.querySelector(`[data-imory-sides-area="${name}"]`);
      const cs = doc.defaultView.getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && el.getBoundingClientRect().width > 0;
    };
    return {
      layout: frame.getAttribute("data-imory-sides-layout"),
      on: frame.getAttribute("data-imory-sides-on"),
      count: frame.getAttribute("data-imory-sides-count"),
      active: frame.getAttribute("data-imory-sides-active"),
      left: vis("left"), right: vis("right")
    };
  });
}

function readStudio(page) {
  return page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll("#studioLeftPanelLayout .studio-sides-options [role=radio]"));
    const status = document.querySelector("#studioLeftPanelLayout .studio-sides-status");
    return {
      regions: JSON.parse(JSON.stringify(currentWorkingSkin.regions || [])),
      dirty: isStudioDirty,
      history: window.getStudioHistoryState(),
      checked: (radios.find((r) => r.getAttribute("aria-checked") === "true") || {}).dataset?.count || null,
      disabled: radios.filter((r) => r.disabled).map((r) => r.dataset.count),
      status: status ? status.textContent : "",
      shell: window.getStudioShellState(),
      title: document.getElementById("studioLeftPanelTitle").textContent
    };
  });
}

const regionsSetting = (regions) => {
  const find = (name) => (regions || []).find((entry) => entry && entry.name === name);
  const on = (name) => { const e = find(name); return !!e && e.enabled !== false; };
  return { left: on("left_sidebar"), right: on("right_sidebar") };
};

async function chooseCount(page, count) {
  await page.click(`#studioLeftPanelLayout [role=radio][data-count="${count}"]`);
  await page.waitForTimeout(350);
}


/* =========================================================
   실행
========================================================== */

async function run() {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  try {

    /* ------------------------------------------------- */
    if (wants("panel")) {

      section("panel");

      const { context, page, errors } = await openStudio(browser);

      let p = await readPreviewSides(page);
      check("Preview(1280) 는 3단 칼럼", p && p.layout === "columns" && p.on === "left right" && p.left && p.right, JSON.stringify(p));

      check("Layout 버튼이 켜져 있다", await page.evaluate(() => !document.getElementById("studioLayoutButton").disabled));

      await page.click("#studioLayoutButton");
      await page.waitForTimeout(250);

      let s = await readStudio(page);
      check("왼쪽 패널이 HOME LAYOUT 으로 열린다", s.shell.leftPanelOpen && s.shell.leftPanelMode === "layout" && s.title === "HOME LAYOUT", JSON.stringify(s.shell));
      check("지금 값 3단이 선택되어 있다 · 막힌 칸 없음", s.checked === "3" && s.disabled.length === 0, JSON.stringify(s));
      check("열기만 해서는 dirty 도 기록도 없다", s.dirty === false && s.history.undo === 0, JSON.stringify(s.history));
      check("화면 문구에 개발자 낱말이 없다", await page.evaluate(() =>
        !/regions|data-imory|sidebar|drawer/i.test(document.getElementById("studioLeftPanelLayout").textContent)));

      await chooseCount(page, 2);
      s = await readStudio(page);
      p = await readPreviewSides(page);
      check("2단 → draft regions: 왼쪽 끔 · 오른쪽 켬", JSON.stringify(regionsSetting(s.regions)) === '{"left":false,"right":true}', JSON.stringify(s.regions));
      check("2단 → Preview 는 가운데 + 오른쪽", p.on === "right" && !p.left && p.right, JSON.stringify(p));
      check("2단 → dirty · 기록 한 칸", s.dirty === true && s.history.undo === 1, JSON.stringify(s.history));
      check("선택 표시가 2단으로", s.checked === "2");

      await chooseCount(page, 2);
      s = await readStudio(page);
      check("같은 값을 다시 골라도 기록이 늘지 않는다", s.history.undo === 1, JSON.stringify(s.history));

      await chooseCount(page, 1);
      p = await readPreviewSides(page);
      s = await readStudio(page);
      check("1단 → Preview 에 좌우 칸이 없다", p.count === "1" && !p.left && !p.right, JSON.stringify(p));
      check("1단 → 영역 항목은 지우지 않고 끈다(다시 켤 자리)", s.regions.length === 2 && s.regions.every((e) => e.enabled === false), JSON.stringify(s.regions));

      await page.click("#studioUndoButton");
      await page.waitForTimeout(350);
      s = await readStudio(page);
      p = await readPreviewSides(page);
      check("↶ 한 번 → 2단(Preview · 패널 표시 같이)", s.checked === "2" && p.on === "right", `${s.checked} ${p.on}`);

      await page.click("#studioUndoButton");
      await page.waitForTimeout(350);
      s = await readStudio(page);
      check("↶ 두 번 → 3단 · dirty 풀림", s.checked === "3" && s.dirty === false, JSON.stringify({ c: s.checked, d: s.dirty }));

      await page.click("#studioRedoButton");
      await page.waitForTimeout(350);
      s = await readStudio(page);
      check("↷ → 다시 2단", s.checked === "2");

      /* 방향키(radiogroup) */
      await page.focus('#studioLeftPanelLayout [role=radio][data-count="2"]');
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(350);
      s = await readStudio(page);
      check("방향키로 다음 값(3단) 고르기", s.checked === "3", s.checked);

      check("스크립트 오류 없음", errors.length === 0, errors.join(" | "));

      await context.close();
    }


    /* ------------------------------------------------- */
    if (wants("drawer")) {

      section("drawer");

      const { context, page } = await openStudio(browser);

      await page.click('[data-viewport-mode="mobile"]');
      await page.waitForTimeout(600);

      let p = await readPreviewSides(page);
      check("Mobile Preview → 패널", p.layout === "drawer", JSON.stringify(p));

      const before = await readStudio(page);

      const frameHandle = await page.$("#studioPreviewFrame");
      const frame = await frameHandle.contentFrame();

      await frame.click('[data-imory-sides-open="right"]');
      await page.waitForTimeout(500);
      p = await readPreviewSides(page);
      check("Preview 안 버튼 → 오른쪽 패널이 열린다", p.active === "right", JSON.stringify(p));

      const opened = await readStudio(page);
      check("★ 여닫기는 dirty 도 기록도 만들지 않는다", opened.dirty === before.dirty && opened.history.undo === before.history.undo,
        JSON.stringify({ before: before.history, after: opened.history, dirty: opened.dirty }));

      /* 다른 편집으로 Preview 를 다시 그려도 열린 채(움직임 없이) */
      await page.click("#studioLayoutButton");
      await page.waitForTimeout(250);
      await chooseCount(page, 3);
      p = await readPreviewSides(page);
      check("draft 가 바뀌어 다시 그려도 패널은 열린 채", p.active === "right", JSON.stringify(p));

      /* 다시 그린 뒤 되살린 패널은 포커스를 가져가지 않는다(Studio 입력칸을
         빼앗지 않게) — 사람처럼 패널 안을 한 번 누른 뒤 Escape */
      await frame.click('[data-imory-sides-area="right"] .ed-profile-name');
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      p = await readPreviewSides(page);
      check("Preview 안 Escape → 닫힘", !p.active, JSON.stringify(p));

      const after = await readStudio(page);
      check("닫아도 기록은 그대로(여닫기는 한 칸도 없다)", after.history.undo === before.history.undo, JSON.stringify(after.history));

      await context.close();
    }


    /* ------------------------------------------------- */
    if (wants("persist")) {

      section("persist");

      const { context, page } = await openStudio(browser);

      await page.click("#studioLayoutButton");
      await page.waitForTimeout(250);
      await chooseCount(page, 2);

      /* 패널을 연 채로 저장해도 런타임 흔적이 실리지 않아야 한다 */
      await page.click('[data-viewport-mode="mobile"]');
      await page.waitForTimeout(500);
      const frame = await (await page.$("#studioPreviewFrame")).contentFrame();
      await frame.click('[data-imory-sides-open="right"]');
      await page.waitForTimeout(400);

      await page.evaluate(() => { window.top.__savedDraftCallsLay = []; });
      await page.click("#studioSaveButton");
      await page.waitForFunction(() => (window.top.__savedDraftCallsLay || []).length > 0, null, { timeout: 8000 });

      const saved = await page.evaluate(() => {
        const calls = window.top.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      check("★ 저장 payload 의 regions = 2단", JSON.stringify(regionsSetting(saved.regions)) === '{"left":false,"right":true}', JSON.stringify(saved.regions));
      check("저장 HTML 에 틀 · 세 칸 · 여는 것이 그대로",
        /data-imory-sides="frame"/.test(saved.templates.home.html) &&
        /data-imory-sides-area="left"/.test(saved.templates.home.html) &&
        /data-imory-sides-open="right"/.test(saved.templates.home.html));
      check("저장 HTML 에 런타임 상태 · 플랫폼 요소가 없다",
        !/data-imory-sides-(layout|on|count|state|active|phase|backdrop|probe|fallback|instant)|inert|aria-modal|role="dialog"/.test(saved.templates.home.html),
        (saved.templates.home.html.match(/data-imory-sides-[a-z]+/g) || []).join(","));

      /* 저장한 content 로 다시 연다 */
      const reopened = await openStudio(browser, { skin: saved });
      let p = await readPreviewSides(reopened.page);
      check("★ 다시 열어도 2단", p.on === "right" && !p.left && p.right, JSON.stringify(p));
      await reopened.page.click("#studioLayoutButton");
      await reopened.page.waitForTimeout(250);
      check("다시 연 Studio 의 패널도 2단", (await readStudio(reopened.page)).checked === "2");

      /* Export → 고쳐서 Import */
      const downloadPromise = reopened.page.waitForEvent("download", { timeout: 10000 });
      await reopened.page.click("#studioExportButton");
      const download = await downloadPromise;
      const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
      check("★ Export 파일에 regions(2단)가 실린다", JSON.stringify(regionsSetting(exported.regions)) === '{"left":false,"right":true}', JSON.stringify(exported.regions));

      exported.regions = exported.regions.map((e) => ({ ...e, enabled: false }));

      await reopened.page.click("#studioImportButton");
      await reopened.page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });
      await reopened.page.fill(".import-editor-textarea", JSON.stringify(exported));
      await reopened.page.click(".import-editor-actions .import-editor-button:nth-of-type(2)");
      await reopened.page.waitForFunction(() => {
        const apply = document.querySelector(".import-editor-button--primary");
        return apply && !apply.disabled;
      }, null, { timeout: 10000 });
      await reopened.page.click(".import-editor-button--primary");
      await reopened.page.waitForTimeout(700);

      p = await readPreviewSides(reopened.page);
      const afterImport = await readStudio(reopened.page);
      check("★ Import(1단으로 고친 파일) → Preview 1단 · 패널 표시 1단", p.count === "1" && afterImport.checked === "1", `${p.count} ${afterImport.checked}`);

      /* Save → Publish */
      await reopened.page.evaluate(() => { window.top.__savedDraftCallsLay = []; window.top.__publishedLay = undefined; });
      await reopened.page.click("#studioSaveButton");
      await reopened.page.waitForFunction(() => (window.top.__savedDraftCallsLay || []).length > 0, null, { timeout: 8000 });
      await reopened.page.waitForFunction(() => !document.getElementById("studioPublishButton").disabled, null, { timeout: 8000 });
      await reopened.page.click("#studioPublishButton");
      await reopened.page.click(".studio-confirm-button--primary");
      await reopened.page.waitForFunction(() => window.top.__publishedLay !== undefined, null, { timeout: 8000 });

      const published = await reopened.page.evaluate(() => window.top.__publishedLay);
      check("★ Publish 된 content 의 regions = 1단(영역 항목은 남아 있다)",
        published && published.regions.length === 2 && JSON.stringify(regionsSetting(published.regions)) === '{"left":false,"right":false}',
        JSON.stringify(published && published.regions));
      check("Publish 된 HOME 에도 틀이 그대로", published && /data-imory-sides="frame"/.test(published.templates.home.html));

      await reopened.context.close();
      await context.close();
    }


    /* ------------------------------------------------- */
    if (wants("nomarkup")) {

      section("nomarkup");

      const { context, page } = await openStudio(browser, { skin: null });
      await page.click("#studioLayoutButton");
      await page.waitForTimeout(250);
      const s = await readStudio(page);
      check("틀이 없는 스킨: 세 값 모두 잠김", s.disabled.join(",") === "1,2,3", s.disabled.join(","));
      check("틀이 없는 스킨: 이유를 사람 말로", /자리가 없어서/.test(s.status), s.status);
      check("틀이 없는 스킨: Preview 에 좌우 흔적 0", await page.evaluate(() =>
        !document.getElementById("studioPreviewFrame").contentDocument.querySelector("[data-imory-sides-layout], [data-imory-sides-backdrop]")));
      await context.close();
    }


    /* ------------------------------------------------- */
    if (wants("narrow")) {

      section("narrow");

      const { context, page } = await openStudio(browser, { viewport: { width: 390, height: 844 } });

      const place = await page.evaluate(() => {
        const box = (id) => document.getElementById(id).getBoundingClientRect();
        const layout = box("studioLayoutButton");
        const select = box("studioInspectorButton");
        const undo = box("studioUndoButton");
        return {
          visible: layout.width > 0,
          secondRow: layout.top > select.bottom - 1 && Math.abs(layout.top - undo.top) < 12,
          inside: layout.left >= 0 && layout.right <= innerWidth,
          h: Math.round(layout.height)
        };
      });
      check("390px: Layout 은 둘째 줄(↶ ↷ 옆) · 화면 안", place.visible && place.secondRow && place.inside, JSON.stringify(place));

      await page.click("#studioLayoutButton");
      await page.waitForTimeout(400);

      const s = await readStudio(page);
      check("390px: Layout → 아래 시트로 열린다",
        s.shell.leftPanelOpen && s.shell.leftPanelMode === "layout" && s.shell.sheetState, JSON.stringify(s.shell));

      const fits = await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll("#studioLeftPanelLayout .studio-sides-options [role=radio]"));
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          inside: radios.every((r) => { const b = r.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.height >= 44; })
        };
      });
      check("390px: 가로 넘침 0 · 선택지가 화면 안 · 44px 이상", fits.overflow <= 0 && fits.inside, JSON.stringify(fits));

      await chooseCount(page, 1);
      check("390px: 1단 고르기", (await readStudio(page)).checked === "1");

      await context.close();
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
