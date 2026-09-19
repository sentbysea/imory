/* =========================================================
   BOTTOM-DOCK-1 — Skin Studio 의 dock 설정 패널 E2E

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md §12

   studio/studio-lifecycle-scenario.html?scenario=y (production 과
   같은 스크립트 구성 + in-memory supabase mock)를 실제 URL 로 띄워
   studio/dock/dock-panel.js · studio-preview.js ·
   skin/skin-bottom-dock*.js 를 저장소의 실제 파일 그대로 구동한다.

   검사 범위
     open      dock 이 없는 스킨에서 버튼 → 기본 구성이 채워진다
     apply     적용 → working draft 에 들어가고 Preview 에 나타난다
     settings  자리/접기/전환을 바꾸면 Preview 의 상태 속성이 바뀐다
     items     추가 · 삭제 · 순서(↑↓) · 동작 종류에 따라 칸이 바뀐다
     reject    모양이 틀리면 적용되지 않고 이유가 나온다
     cancel    ★ 취소는 정말로 아무 일도 없다(draft 불변)
     remove    dock 없애기 → 설정 키가 사라진다
     click     ★ Preview 의 dock 을 누르면 설정 패널이 열린다
     export    Export → Import 왕복에 bottomDock 이 그대로 산다
     mobile    390px 에서 가로 넘침 0

   실행:
     node studio/dock/studio-dock-panel-e2e-test.mjs
     node studio/dock/studio-dock-panel-e2e-test.mjs --only=items
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PORT = 8963;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=y`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const shouldRun = (name) => !ONLY || ONLY === name;

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const section = (name) => {
  if (!shouldRun(name)) return false;
  console.log(`\n[${name}]`);
  return true;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));


/* =========================================================
   서버 · playwright
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

  const found = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let version = "0.0.0";
    try {
      version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0";
    } catch { /* 못 읽으면 가장 낮게 */ }
    found.push({ entry, version });
  }

  const toParts = v => v.split(".").map(Number);
  found.sort((a, b) => {
    const [ax, ay, az] = toParts(a.version);
    const [bx, by, bz] = toParts(b.version);
    return (bx - ax) || (by - ay) || (bz - az);
  });

  for (const { entry } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch { /* 다음 후보 */ }
  }

  throw new Error(`playwright ${browserName}을(를) 실행할 수 없습니다.`);
}


/* =========================================================
   페이지 도우미
========================================================== */

const consoleErrors = [];

/* 이미지 라이브러리 mock 이 원래 남기는 오류(다른 Studio e2e 와 동일) */
const PRE_EXISTING_CONSOLE_ERROR = /image library probe failed/;

async function openStudio(context) {

  const page = await context.newPage();

  page.on("console", msg => {
    if (msg.type() !== "error") return;
    if (PRE_EXISTING_CONSOLE_ERROR.test(msg.text())) return;
    consoleErrors.push(msg.text());
  });

  page.on("pageerror", err => consoleErrors.push(err.message));

  await page.goto(SCENARIO_URL, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  await page.waitForSelector("#studioPreviewFrame");
  await sleep(700);

  return page;

}

const workingPackage = (page) =>
  page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage);

async function openDockPanel(page) {
  await page.click("#studioDockButton");
  await page.waitForSelector(".dock-panel-overlay--open", { timeout: 5000 });
}

async function applyDockPanel(page) {
  await page.click(".dock-panel-button--primary");
  await sleep(600);
}

async function panelMessage(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".dock-panel-message");
    return {
      text: el ? el.textContent.trim() : "",
      isError: !!(el && el.classList.contains("dock-panel-message--error"))
    };
  });
}

const panelIsOpen = (page) =>
  page.evaluate(() => !!document.querySelector(".dock-panel-overlay--open"));

/* 설정 줄 하나의 select 를 라벨로 찾아 값을 바꾼다 */
async function setSettingByLabel(page, labelText, value) {
  await page.evaluate(({ labelText, value }) => {
    const rows = Array.from(document.querySelectorAll(".dock-panel-settings .dock-panel-row"));
    const row = rows.find(r => r.querySelector(".dock-panel-label")?.textContent === labelText);
    const select = row && row.querySelector("select");
    if (!select) throw new Error(`설정 줄 "${labelText}" 을 찾지 못했다`);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { labelText, value });
  await sleep(120);
}

/* Preview iframe 안의 dock 상태 */
async function readPreviewDock(page) {
  const frame = page.frames().find(f => f.url().includes("preview-frame.html"));
  if (!frame) return { count: 0 };
  return frame.evaluate(() => {
    const roots = Array.from(document.querySelectorAll("[data-imory-dock-position]"));
    if (roots.length !== 1) return { count: roots.length };
    const root = roots[0];
    return {
      count: 1,
      position: root.getAttribute("data-imory-dock-position"),
      state: root.getAttribute("data-imory-dock-state"),
      transition: root.getAttribute("data-imory-dock-transition"),
      ids: Array.from(root.querySelectorAll("[data-imory-dock-item]"))
        .map(el => el.getAttribute("data-imory-dock-item"))
    };
  });
}

const itemCount = (page) =>
  page.evaluate(() => document.querySelectorAll(".dock-panel-item").length);


/* =========================================================
   실행
========================================================== */

async function run() {

  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();

  try {

    /* --------------------------------------------------- */

    if (section("open")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      check(
        "working draft 가 있으면 Dock 버튼이 눌린다",
        await page.evaluate(() => !document.getElementById("studioDockButton").disabled)
      );

      check(
        "이 스킨에는 아직 dock 이 없다(전제)",
        (await workingPackage(page)).bottomDock === undefined
      );

      await openDockPanel(page);

      check("패널이 열린다", await panelIsOpen(page));

      check(
        "★ dock 이 없으면 기본 구성이 채워지고 그 사실을 알린다",
        (await panelMessage(page)).text.includes("기본 구성")
      );

      check("기본 항목이 3개다(모바일 권장 범위)", (await itemCount(page)) === 3, String(await itemCount(page)));

      check(
        "패널을 여는 것만으로는 draft 가 바뀌지 않는다",
        (await workingPackage(page)).bottomDock === undefined
      );

      check(
        "생김새를 고치는 칸은 없다(색/크기/글꼴)",
        await page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll(".dock-panel-label"))
            .map(el => el.textContent);
          return !labels.some(t => /색|크기|글꼴|폰트/.test(t));
        })
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("apply")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      check("적용하면 패널이 닫힌다", !(await panelIsOpen(page)));

      const pkg = await workingPackage(page);

      check(
        "★ working draft 에 정규화된 설정이 들어간다",
        !!pkg.bottomDock &&
        pkg.bottomDock.items.length === 3 &&
        pkg.bottomDock.position === "auto",
        JSON.stringify(pkg.bottomDock && pkg.bottomDock.position)
      );

      check(
        "dirty 가 되어 Save 가 활성화된다",
        await page.evaluate(() => !document.getElementById("studioSaveButton").disabled)
      );

      check(
        "DB 에는 쓰지 않는다(Save 를 누르기 전까지)",
        await page.evaluate(() => (window.__scenarioSavedDraftCalls || 0) === 0) !== false
      );

      const dock = await readPreviewDock(page);

      check("★ Preview 에 dock 이 하나 그려진다", dock.count === 1, JSON.stringify(dock));

      check(
        "항목이 설정 그대로다",
        (dock.ids || []).join(",") === "home,highlights,top",
        (dock.ids || []).join(",")
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("settings")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await setSettingByLabel(page, "자리", "static");
      await setSettingByLabel(page, "접기", "on");
      await setSettingByLabel(page, "전환", "slide");
      await applyDockPanel(page);

      const dock = await readPreviewDock(page);

      check("자리가 Preview 에 반영된다", dock.position === "static", dock.position);
      check("전환 종류가 반영된다", dock.transition === "slide", dock.transition);
      check("접기를 켜면 상태 속성이 붙는다", dock.state === "expanded", dock.state);

      /* 다시 열면 저장된 값이 그대로 보인다 */
      await openDockPanel(page);

      const shown = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(".dock-panel-settings .dock-panel-row"));
        const get = (label) => {
          const row = rows.find(r => r.querySelector(".dock-panel-label")?.textContent === label);
          return row ? row.querySelector("select").value : null;
        };
        return { position: get("자리"), collapse: get("접기"), transition: get("전환") };
      });

      check(
        "다시 열면 저장된 설정이 그대로 보인다",
        shown.position === "static" && shown.collapse === "on" && shown.transition === "slide",
        JSON.stringify(shown)
      );

      check(
        "접기를 켜야 '처음 상태'와 '접는 표식' 줄이 나온다",
        await page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll(".dock-panel-settings .dock-panel-label"))
            .map(el => el.textContent);
          return labels.includes("처음 상태") && labels.includes("접는 표식");
        })
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("items")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);

      const before = await itemCount(page);

      await page.click(".dock-panel-button--add");
      await sleep(150);

      check("항목을 추가할 수 있다", (await itemCount(page)) === before + 1);

      /* 마지막 항목 삭제 */
      await page.evaluate(() => {
        const cards = document.querySelectorAll(".dock-panel-item");
        cards[cards.length - 1].querySelector(".dock-panel-remove").click();
      });
      await sleep(150);

      check("항목을 삭제할 수 있다", (await itemCount(page)) === before);

      /* 두 번째 항목을 위로 */
      await page.evaluate(() => {
        document.querySelectorAll(".dock-panel-item")[1]
          .querySelector('.dock-panel-move[aria-label="위로"]').click();
      });
      await sleep(150);

      await applyDockPanel(page);

      const pkg = await workingPackage(page);

      check(
        "★ ↑ 로 바꾼 순서가 그대로 저장된다",
        pkg.bottomDock.items.map(i => i.id).join(",") === "highlights,home,top",
        pkg.bottomDock.items.map(i => i.id).join(",")
      );

      const dock = await readPreviewDock(page);

      check(
        "Preview 의 그리는 순서도 같다",
        (dock.ids || []).join(",") === "highlights,home,top",
        (dock.ids || []).join(",")
      );

      /* 동작 종류를 바꾸면 그에 맞는 칸이 나온다 */
      await openDockPanel(page);

      await page.evaluate(() => {
        const card = document.querySelectorAll(".dock-panel-item")[0];
        const rows = Array.from(card.querySelectorAll(".dock-panel-row"));
        const row = rows.find(r => r.querySelector(".dock-panel-label")?.textContent === "동작");
        const select = row.querySelector("select");
        select.value = "open";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await sleep(150);

      check(
        "★ '패널 열기'를 고르면 패널 이름 칸이 나온다",
        await page.evaluate(() => {
          const card = document.querySelectorAll(".dock-panel-item")[0];
          return Array.from(card.querySelectorAll(".dock-panel-label"))
            .some(el => el.textContent === "패널 이름");
        })
      );

      check(
        "'어디로' 칸은 사라진다",
        await page.evaluate(() => {
          const card = document.querySelectorAll(".dock-panel-item")[0];
          return !Array.from(card.querySelectorAll(".dock-panel-label"))
            .some(el => el.textContent === "어디로");
        })
      );

      check(
        "★ 카테고리를 고를 수 있다(주인장은 자기 카테고리를 안다)",
        await page.evaluate(() => {
          const card = document.querySelectorAll(".dock-panel-item")[1];
          const rows = Array.from(card.querySelectorAll(".dock-panel-row"));
          const row = rows.find(r => r.querySelector(".dock-panel-label")?.textContent === "어디로");
          if (!row) return false;
          return Array.from(row.querySelectorAll("option"))
            .some(o => o.value.startsWith("category:"));
        })
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("reject")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);

      /* 아이콘 값을 비운다 — 정규화가 거부한다 */
      await page.evaluate(() => {
        const card = document.querySelectorAll(".dock-panel-item")[0];
        const rows = Array.from(card.querySelectorAll(".dock-panel-row"));
        const row = rows.find(r => r.querySelector(".dock-panel-label")?.textContent === "그림 값");
        const input = row.querySelector("input");
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      await page.click(".dock-panel-button--primary");
      await sleep(300);

      const message = await panelMessage(page);

      check("★ 모양이 틀리면 적용되지 않는다", await panelIsOpen(page));
      check("무엇이 문제인지 알려 준다", message.isError && message.text.includes("items[0]"), message.text);
      check(
        "그때 draft 는 그대로다",
        (await workingPackage(page)).bottomDock === undefined
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("cancel")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      const applied = await workingPackage(page);

      await openDockPanel(page);

      await page.evaluate(() => {
        const cards = document.querySelectorAll(".dock-panel-item");
        cards[0].querySelector(".dock-panel-remove").click();
      });
      await sleep(150);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll(".dock-panel-button"))
          .find(b => b.textContent === "취소").click();
      });
      await sleep(300);

      check("취소하면 패널이 닫힌다", !(await panelIsOpen(page)));

      check(
        "★ 취소는 정말로 아무 일도 없다 — draft 가 그대로다",
        JSON.stringify((await workingPackage(page)).bottomDock) ===
          JSON.stringify(applied.bottomDock)
      );

      /* 다시 열면 취소한 편집이 남아 있지 않다 */
      await openDockPanel(page);

      check(
        "다시 열면 저장된 상태에서 시작한다",
        (await itemCount(page)) === applied.bottomDock.items.length,
        String(await itemCount(page))
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("remove")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      check("먼저 dock 이 생겼다(전제)", !!(await workingPackage(page)).bottomDock);

      await openDockPanel(page);

      await page.click(".dock-panel-button--quiet");
      await sleep(500);

      const pkg = await workingPackage(page);

      check(
        "★ dock 없애기 → 설정 키 자체가 사라진다",
        pkg.bottomDock === undefined,
        JSON.stringify(pkg.bottomDock)
      );

      check("Preview 에서도 사라진다", (await readPreviewDock(page)).count === 0);

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("click")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      check("패널이 닫혀 있다(전제)", !(await panelIsOpen(page)));

      const frame = page.frames().find(f => f.url().includes("preview-frame.html"));

      await frame.evaluate(() => {
        document.querySelector("[data-imory-dock-item]").click();
      });

      await sleep(400);

      check(
        "★ Preview 의 dock 을 누르면 설정 패널이 열린다",
        await panelIsOpen(page)
      );

      check(
        "그 클릭이 Preview 를 다른 화면으로 옮기지 않는다",
        await frame.evaluate(() => !!document.querySelector("[data-imory-dock-position]"))
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("export")) {

      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        acceptDownloads: true
      });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await setSettingByLabel(page, "접기", "on");
      await applyDockPanel(page);

      const applied = (await workingPackage(page)).bottomDock;

      const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
      await page.click("#studioExportButton");
      const download = await downloadPromise;
      const text = fs.readFileSync(await download.path(), "utf8");
      const exported = JSON.parse(text);

      check(
        "★ Export 파일에 bottomDock 이 그대로 실린다",
        JSON.stringify(exported.bottomDock) === JSON.stringify(applied),
        JSON.stringify(exported.bottomDock && exported.bottomDock.collapsible)
      );

      /* 같은 파일을 붙여넣기로 다시 Import */
      await page.click("#studioImportButton");
      await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });

      await page.evaluate((json) => {
        const ta = document.querySelector(".import-editor-textarea");
        ta.value = json;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }, text);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll(".import-editor-button"))
          .find(b => /검증|Validate/i.test(b.textContent))?.click();
      });
      await sleep(600);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll(".import-editor-button"))
          .find(b => /Apply|적용/i.test(b.textContent))?.click();
      });
      await sleep(800);

      const after = (await workingPackage(page)).bottomDock;

      check(
        "★ 다시 Import 해도 같은 설정이다(왕복 손실 없음)",
        JSON.stringify(after) === JSON.stringify(applied),
        JSON.stringify(after)
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("mobile")) {

      const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );

      check("390px 에서 가로 넘침 없음", overflow <= 0, String(overflow));

      check(
        "패널이 화면 안에 들어온다",
        await page.evaluate(() => {
          const modal = document.querySelector(".dock-panel-modal");
          const r = modal.getBoundingClientRect();
          return r.left >= -1 && r.right <= window.innerWidth + 1;
        })
      );

      check(
        "적용 버튼이 화면 안에 있다",
        await page.evaluate(() => {
          const btn = document.querySelector(".dock-panel-button--primary");
          const r = btn.getBoundingClientRect();
          return r.width > 0 && r.right <= window.innerWidth + 1;
        })
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (shouldRun("errors") || !ONLY) {
      console.log("\n[errors]");
      check(
        "새로운 console/page 오류가 없다",
        consoleErrors.length === 0,
        consoleErrors.slice(0, 3).join(" | ")
      );
    }

  } finally {
    await browser.close();
    server.close();
  }

}

await run();

console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);

if (failures.length) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
