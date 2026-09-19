/* =========================================================
   TRANSITION-1 — Skin Studio 직접 편집 E2E

   기준 문서: IMORY_TRANSITION_PRIMITIVE_DESIGN.md

   production 과 같은 스크립트 구성으로 Studio 를 띄우고
   (studio/studio-lifecycle-scenario.html?scenario=lay — 배치 라운드와
   같은 fixture), Select mode 에서 **전환을 손으로 고친다**.

   보는 것은 LAYOUT-1 과 같은 두 축이다.
     1. working draft 의 HTML 속성이 계약대로 바뀌는가
     2. Preview 가 그 값으로 실제로 움직이는가(그리고 편집할 때마다
        화면 전체가 다시 들어오지는 않는가)

   [form]   전환 폼이 나오는 자리 · 효과가 없을 때는 효과 칸 하나뿐
   [type]   효과 고르기 → 속성 · Preview 가 편집 재렌더에서 appear 를
            다시 돌리지 않고, 확정 뒤 한 번만 재생한다
   [param]  속도 · 방향 · 움직임 · 방향이 뜻을 잃는 효과로 바꾸면 방향이
            걷힌다 · **고른 요소만** 바뀐다
   [play]   ▶ 미리 보기
   [none]   "없음"은 속성 넷을 전부 걷는다
   [undo]   되돌리기 한 칸
   [save]   저장 payload 에 속성만 실린다(상태/style/inert 없음)
   [dock]   Dock 패널에는 전환 칸이 없고(사용자 UI 단순화), working draft 의
            bottomDock.transition 은 여전히 네 칸짜리 객체 · Code/AI 값 보존
   [mobile] 390px Studio 창

   실행:
     node studio/studio-transition-e2e-test.mjs
     node studio/studio-transition-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8967;

const SCENARIO_URL =
  `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=lay`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


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
    try { version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0"; } catch { /* */ }
    found.push({ entry, version });
  }
  const toParts = (v) => v.split(".").map(Number);
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
    } catch { /* 다음 */ }
  }
  throw new Error(`playwright ${browserName} 을(를) 실행할 수 없습니다`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
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
    console.log(`  PASS  ${name}`);
    return;
  }
  failures.push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
}

function wants(name) {
  if (ONLY && ONLY !== name) return false;
  console.log(`\n[${name}]`);
  return true;
}


/* Preview iframe 에도 심기는 기록기(addInitScript 는 모든 frame 에 들어간다) */
function animationRecorder() {
  /* WebKit 은 iframe 에 init script 를 두 번 넣는 경우가 있다 — 두 겹으로
     감싸면 호출 하나가 두 번 기록된다 */
  if (window.__animLog) return;
  window.__animLog = [];
  document.addEventListener("animationstart", (event) => {
    window.__animLog.push({ kind: "css", cls: String(event.target.className || "") });
  }, true);
  const original = Element.prototype.animate;
  Element.prototype.animate = function (...a) {
    window.__animLog.push({ kind: "waapi", cls: String(this.className || ""), duration: a[1] && a[1].duration });
    return original.apply(this, a);
  };
}


/* =========================================================
   Studio 조작 helper — studio-layout-e2e-test.mjs 와 같은 방식
========================================================== */

function previewHas(page, selector, timeoutMs = 8000) {
  return page.waitForFunction(
    (sel) => {
      const frame = document.getElementById("studioPreviewFrame");
      const doc = frame && frame.contentDocument;
      return !!(doc && doc.querySelector(sel));
    },
    selector,
    { timeout: timeoutMs }
  );
}

async function selectInPreview(page, selector) {
  const className = selector.replace(/^\./, "");
  await page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, selector);
  await page.waitForFunction(
    (name) => {
      const selection = window.getStudioInspectorSelection();
      return !!selection && selection.classNames.indexOf(name) !== -1;
    },
    className,
    { timeout: 6000 }
  );
}

async function openDirectEdit(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.evaluate(() => window.getStudioInspectorState().editingOpen)) return;
    await page.click("#studioInspectorDirectButton");
    const opened = await page
      .waitForFunction(() => window.getStudioInspectorState().editingOpen === true, null, { timeout: 2000 })
      .then(() => true, () => false);
    if (opened) return;
    await sleep(250);
  }
  throw new Error("직접 수정 폼이 열리지 않았습니다");
}

const draftHtml = (page) =>
  page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html);

const workingPackage = (page) =>
  page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage);

function formRows(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#studioInspectorFields .studio-inspector-row")).map((row) => {
      const control = row.querySelector("select, input, button");
      return {
        label: row.querySelector(".studio-inspector-row-label").textContent.trim(),
        tag: control ? control.tagName.toLowerCase() : null,
        id: control ? control.id : null,
        value: control && "value" in control ? control.value : null
      };
    })
  );
}

async function chooseById(page, id, value) {
  const ok = await page.evaluate(({ id, value }) => {
    const select = document.getElementById(id);
    if (!select) return false;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { id, value });
  await sleep(450);
  return ok;
}

/* 그 요소의 여는 태그만(속성 비교용) */
function openingTag(html, className) {
  const m = new RegExp(`<[a-z0-9]+[^>]*class="${className}"[^>]*>`).exec(html);
  return m ? m[0] : "";
}

async function previewState(page, selector) {
  return page.evaluate((sel) => {
    const frame = document.getElementById("studioPreviewFrame");
    const win = frame.contentWindow;
    const el = frame.contentDocument.querySelector(sel);
    return {
      state: el ? el.getAttribute("data-imory-transition-state") : null,
      duration: el ? el.style.getPropertyValue("--imory-tr-duration") : null,
      log: (win.__animLog || []).slice()
    };
  }, selector);
}

const clearPreviewLog = (page) =>
  page.evaluate(() => { document.getElementById("studioPreviewFrame").contentWindow.__animLog = []; });


async function openStudio(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (err) => failures.push(`pageerror: ${err.message}`));
  await context.addInitScript(animationRecorder);
  await page.route("**/api/skin-ai", (route) => route.fulfill({ status: 500, body: "must not be called" }));
  await page.goto(SCENARIO_URL, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 20000 }
  );
  await previewHas(page, ".lay-home");
  return { context, page };
}

async function enableSelect(page) {
  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await previewHas(page, "[data-imory-edit-id]");
}


async function run() {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  try {

    const { context, page } = await openStudio(browser, { width: 1280, height: 900 });

    await enableSelect(page);

    const original = await draftHtml(page);


    if (wants("form")) {

      await selectInPreview(page, ".lay-text");
      await openDirectEdit(page);

      const info = await page.evaluate(() => window.getStudioInspectorSelection());
      check("보호 구역 밖 요소는 transition capability 를 갖는다", info.capabilities && info.capabilities.transition === true, JSON.stringify(info.capabilities));

      const rows = await formRows(page);
      const typeRow = rows.find((r) => r.id === "studioInspectorTransitionType");

      check("'전환 효과' 칸이 있고 지금은 없음", !!typeRow && typeRow.label === "전환 효과" && typeRow.value === "", JSON.stringify(rows));
      check("효과가 없을 때는 속도/방향/움직임 칸이 없다", !rows.some((r) => r.id === "studioInspectorTransitionDuration" || r.id === "studioInspectorTransitionDirection"));

      const options = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#studioInspectorTransitionType option")).map((o) => o.value)
      );
      check(
        "효과는 없음 + 다섯 종류(primitive 이름을 문구로 감싼다)",
        JSON.stringify(options) === JSON.stringify(["", "fade", "slide", "scale", "fade-slide", "fade-scale"]),
        JSON.stringify(options)
      );
    }


    if (wants("type")) {

      await selectInPreview(page, ".lay-text");
      await openDirectEdit(page);
      await clearPreviewLog(page);

      await chooseById(page, "studioInspectorTransitionType", "fade-slide");

      const html = await draftHtml(page);
      const tag = openingTag(html, "lay-text");

      check("★ 고른 요소에 data-imory-transition=\"fade-slide\" 가 적힌다", tag.indexOf('data-imory-transition="fade-slide"') !== -1, tag);

      await sleep(300);
      const pv = await previewState(page, ".lay-text");

      check("Preview 가 다시 그려져도 appear(CSS)는 돌지 않는다(편집마다 화면이 다시 들어오지 않는다)", pv.state === "shown" && pv.log.filter((l) => l.kind === "css").length === 0, JSON.stringify(pv));
      check("★ 확정 뒤 고른 요소의 들어오기가 한 번 재생된다", pv.log.filter((l) => l.kind === "waapi" && l.cls.indexOf("lay-text") !== -1).length === 1, JSON.stringify(pv.log));

      const rows = await formRows(page);
      check(
        "효과를 고르면 속도 · 방향 · 움직임 · 미리 보기가 나온다",
        ["studioInspectorTransitionDuration", "studioInspectorTransitionDirection", "studioInspectorTransitionEasing", "studioInspectorTransitionPlay"]
          .every((id) => rows.some((r) => r.id === id)),
        JSON.stringify(rows)
      );
    }


    if (wants("param")) {

      await selectInPreview(page, ".lay-text");
      await openDirectEdit(page);

      if ((await draftHtml(page)).indexOf("data-imory-transition=") === -1) {
        await chooseById(page, "studioInspectorTransitionType", "fade-slide");
      }

      await chooseById(page, "studioInspectorTransitionDuration", "360");
      await chooseById(page, "studioInspectorTransitionDirection", "left");
      await chooseById(page, "studioInspectorTransitionEasing", "smooth");

      let tag = openingTag(await draftHtml(page), "lay-text");

      check("속도 '느리게' → duration=\"360\"", tag.indexOf('data-imory-transition-duration="360"') !== -1, tag);
      check("방향 → direction=\"left\"", tag.indexOf('data-imory-transition-direction="left"') !== -1, tag);
      check("움직임 '부드럽게' → easing=\"smooth\"", tag.indexOf('data-imory-transition-easing="smooth"') !== -1, tag);

      const pv = await previewState(page, ".lay-text");
      check("Preview 에 같은 값이 컴파일돼 있다(--imory-tr-duration 360ms)", pv.duration === "360ms", pv.duration);

      const html = await draftHtml(page);
      const others = (html.match(/data-imory-transition=/g) || []).length;
      check("★ 고른 요소만 바뀐다(요청 범위)", others === 1, String(others));

      await chooseById(page, "studioInspectorTransitionType", "fade");
      tag = openingTag(await draftHtml(page), "lay-text");

      check("방향이 뜻을 잃는 효과(fade)로 바꾸면 방향이 걷힌다", tag.indexOf("data-imory-transition-direction") === -1 && tag.indexOf('data-imory-transition="fade"') !== -1, tag);
      check("속도와 움직임은 남는다", tag.indexOf('data-imory-transition-duration="360"') !== -1 && tag.indexOf('data-imory-transition-easing="smooth"') !== -1, tag);

      const rows = await formRows(page);
      check("fade 에는 방향 칸이 없다", !rows.some((r) => r.id === "studioInspectorTransitionDirection"));
    }


    if (wants("play")) {

      await selectInPreview(page, ".lay-text");
      await openDirectEdit(page);

      if ((await draftHtml(page)).indexOf("data-imory-transition=") === -1) {
        await chooseById(page, "studioInspectorTransitionType", "fade");
      }

      await sleep(500);
      await clearPreviewLog(page);
      await page.click("#studioInspectorTransitionPlay");
      await sleep(200);

      const pv = await previewState(page, ".lay-text");
      check("★ ▶ 미리 보기가 Preview 의 그 요소를 한 번 재생한다", pv.log.filter((l) => l.kind === "waapi" && l.cls.indexOf("lay-text") !== -1).length === 1, JSON.stringify(pv.log));

      const unchanged = await draftHtml(page);
      await page.click("#studioInspectorTransitionPlay");
      await sleep(200);
      check("미리 보기는 draft 를 바꾸지 않는다", (await draftHtml(page)) === unchanged);
    }


    if (wants("undo")) {

      await selectInPreview(page, ".lay-text");
      await openDirectEdit(page);

      const before = await draftHtml(page);
      await chooseById(page, "studioInspectorTransitionType", "scale");
      const changed = await draftHtml(page);
      check("효과가 바뀌었다", changed !== before && openingTag(changed, "lay-text").indexOf('data-imory-transition="scale"') !== -1);

      await page.click("#studioUndoButton");
      await sleep(500);
      check("★ 되돌리기가 직전 한 벌을 그대로 복원한다", (await draftHtml(page)) === before);
    }


    if (wants("save")) {

      await selectInPreview(page, ".lay-g1");
      await openDirectEdit(page);
      await chooseById(page, "studioInspectorTransitionType", "fade-scale");

      await page.evaluate(() => { window.top.__savedDraftCallsLay = []; });
      await page.click("#studioSaveButton");
      await page.waitForFunction(() => (window.top.__savedDraftCallsLay || []).length > 0, null, { timeout: 8000 });

      const saved = await page.evaluate(() => {
        const calls = window.top.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content.templates.home.html;
      });

      check("★ 저장되는 HTML 에 전환 속성이 실린다", /class="lay-g1"[^>]*data-imory-transition="fade-scale"|data-imory-transition="fade-scale"[^>]*class="lay-g1"/.test(saved), saved.slice(0, 700));
      check(
        "저장 HTML 에 런타임 흔적이 없다(상태 · custom property · inert)",
        saved.indexOf("data-imory-transition-state") === -1 && saved.indexOf("--imory-tr-") === -1 && saved.indexOf("inert") === -1 && saved.indexOf("style=") === -1,
        saved.slice(0, 500)
      );
    }


    if (wants("none")) {

      await selectInPreview(page, ".lay-text");
      await openDirectEdit(page);

      await chooseById(page, "studioInspectorTransitionType", "fade-slide");
      await chooseById(page, "studioInspectorTransitionDuration", "600");
      await chooseById(page, "studioInspectorTransitionType", "");

      const tag = openingTag(await draftHtml(page), "lay-text");
      check("★ '없음'(애니메이션 없애기)은 속성 넷을 전부 걷는다", tag.indexOf("data-imory-transition") === -1, tag);

      const pv = await previewState(page, ".lay-text");
      check("Preview 에서도 상태 속성이 사라진다", pv.state === null, String(pv.state));
    }


    if (wants("dock")) {

      await page.evaluate(() => {
        if (window.getStudioInspectorState().enabled) document.getElementById("studioInspectorButton").click();
      });

      await page.click("#studioDockButton");
      await page.waitForSelector(".dock-panel-overlay--open", { timeout: 5000 });

      /*
        Dock 패널 단순화 라운드 — 전환 칸(종류 · 속도 · 움직임 · 방향)은
        사용자 UI 에서 걷어냈다(IMORY_BOTTOM_DOCK_DESIGN.md §9). 움직임은
        그대로 **같은 공용 primitive 의 네 칸짜리 객체**로 저장된다 —
        이 패널이 조용한 기본값을 쓰고, Code · AI 가 정한 값은 지우지
        않는다.
      */

      const labels = () => page.evaluate(() =>
        Array.from(document.querySelectorAll(".dock-panel-modal .dock-panel-label")).map((l) => l.textContent)
      );

      check(
        "Dock 패널 — 전환 · 속도 · 움직임 · 방향 칸이 사용자에게 보이지 않는다",
        !(await labels()).some((t) => /전환|속도|움직임|방향/.test(t)),
        JSON.stringify(await labels())
      );

      await page.click(".dock-panel-button--primary");
      await sleep(700);

      const pkg = await workingPackage(page);
      check(
        "★ working draft 의 bottomDock.transition 은 여전히 네 칸짜리 객체다(기본 fade-slide)",
        JSON.stringify(pkg.bottomDock && pkg.bottomDock.transition) ===
          JSON.stringify({ type: "fade-slide", duration: 200, easing: "smooth", direction: "up" }),
        JSON.stringify(pkg.bottomDock && pkg.bottomDock.transition)
      );

      const pvDock = await page.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const root = doc.querySelector("[data-imory-dock-position]");
        return root ? { transition: root.getAttribute("data-imory-dock-transition"), clip: root.hasAttribute("data-imory-transition-clip") } : null;
      });
      check("Preview dock 에 종류 이름이 나가고, 위아래로 접히므로 가로 자르기는 없다", pvDock && pvDock.transition === "fade-slide" && !pvDock.clip, JSON.stringify(pvDock));

      /* Code · AI 가 정한 움직임 — 패널을 열고 적용해도 그대로 */
      const custom = { type: "slide", duration: 360, easing: "smooth", direction: "right" };
      await page.evaluate((transition) => {
        const dock = window.getStudioBottomDock();
        window.setStudioBottomDock({ ...dock, transition });
      }, custom);
      await sleep(400);

      await page.click("#studioDockButton");
      await page.waitForSelector(".dock-panel-overlay--open", { timeout: 5000 });
      await page.click(".dock-panel-button--primary");
      await sleep(700);

      const kept = (await workingPackage(page)).bottomDock.transition;
      check("Code · AI 가 정한 전환은 패널을 적용해도 지워지지 않는다", JSON.stringify(kept) === JSON.stringify(custom), JSON.stringify(kept));

      const pvDock2 = await page.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const root = doc.querySelector("[data-imory-dock-position]");
        return root ? { transition: root.getAttribute("data-imory-dock-transition"), clip: root.hasAttribute("data-imory-transition-clip") } : null;
      });
      check("그때 Preview dock 은 옆으로 접히므로 가로 자르기", pvDock2 && pvDock2.transition === "slide" && pvDock2.clip, JSON.stringify(pvDock2));

      await page.keyboard.press("Escape");
      await page.evaluate(() => window.closeSkinDockPanel && window.closeSkinDockPanel());
    }

    await context.close();


    if (wants("mobile")) {

      const m = await openStudio(browser, { width: 390, height: 844 });

      await enableSelect(m.page);
      await selectInPreview(m.page, ".lay-text");
      await openDirectEdit(m.page);

      const r = await m.page.evaluate(() => {
        const select = document.getElementById("studioInspectorTransitionType");
        const rect = select ? select.getBoundingClientRect() : null;
        return {
          has: !!select,
          inside: !!rect && rect.left >= 0 && rect.right <= window.innerWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });

      check("390px — 전환 칸이 화면 안에 있다", r.has && r.inside, JSON.stringify(r));
      check("390px — Studio 가로 넘침 0", r.overflow <= 0, String(r.overflow));

      await chooseById(m.page, "studioInspectorTransitionType", "fade");
      check("390px — 고르면 draft 에 들어간다", openingTag(await draftHtml(m.page), "lay-text").indexOf('data-imory-transition="fade"') !== -1);

      await m.context.close();
    }

    void original;

  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);
  if (failures.length) {
    console.log(failures.map((f) => "  - " + f).join("\n"));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
