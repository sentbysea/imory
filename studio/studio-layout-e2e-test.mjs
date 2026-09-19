/* =========================================================
   LAYOUT-1 — Skin Studio 직접 편집 E2E

   기준 문서: IMORY_LAYOUT_PRIMITIVE_DESIGN.md

   production 과 같은 스크립트 구성으로 Studio 를 띄우고
   (studio/studio-lifecycle-scenario.html?scenario=lay), Select mode
   에서 **배치를 손으로 고친다**. 보는 것은 두 가지가 언제나 함께
   맞는가이다.

     1. working draft 의 HTML 속성이 계약대로 바뀌는가
     2. Preview 화면이 실제로 그렇게 다시 그려지는가

   1만 보면 "저장은 되는데 화면은 그대로"를 놓치고, 2만 보면
   "화면은 맞는데 저장이 안 되는" 것을 놓친다.

   무엇을 보는가
   ------------
   [form]   배치 폼이 나오는 자리와 나오지 않는 자리
   [type]   배치 방식 고르기(없음 -> 격자 -> 세로) · 종류를 바꿀 때
            이전 종류 전용 파라미터가 걷힌다
   [param]  열 수 · 간격 — **고른 컨테이너만** 바뀐다(요구사항 12절)
   [item]   격자 자식의 칸(span)
   [order]  형제 순서 ↑↓ — 화면 순서가 따라오고 간격은 유지된다
   [free]   자유 배치 자식의 이동 손잡이 · 드래그 · 비율 좌표
   [slot]   사이드바의 영역(sidebar/main)
   [undo]   되돌리기 한 칸
   [save]   저장 payload 에 배치 속성이 그대로 실린다
   [mobile] 390px Studio 창에서도 배치 폼을 쓸 수 있다

   실행:
     node studio/studio-layout-e2e-test.mjs
     node studio/studio-layout-e2e-test.mjs --browser=webkit
     node studio/studio-layout-e2e-test.mjs --only=free
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8965;

const SCENARIO_URL =
  `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=lay`;

const args = process.argv.slice(2);

const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");


/* =========================================================
   playwright 찾기 (다른 e2e 와 같은 loader)
========================================================== */

async function loadPlaywright(browserName) {

  const candidates = [];

  const npxCache = path.join(
    process.env.LOCALAPPDATA || os.homedir(),
    "npm-cache",
    "_npx"
  );

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

  const toParts = (v) => v.split(".").map(Number);

  found.sort((a, b) => {
    const [ax, ay, az] = toParts(a.version);
    const [bx, by, bz] = toParts(b.version);
    return (bx - ax) || (by - ay) || (bz - az);
  });

  const tried = [];

  for (const { entry, version } of found) {

    let mod;

    try {
      mod = createRequire(entry)("playwright");
    } catch {
      continue;
    }

    const type = mod[browserName];

    if (!type) continue;

    try {
      const probe = await type.launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }

  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다.\n` +
    `시도한 설치:\n  - ${tried.join("\n  - ") || "없음"}\n` +
    `\`npx playwright install ${browserName}\`을 먼저 실행하세요.`
  );

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

      res.writeHead(200, {
        "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });

      fs.createReadStream(abs).pipe(res);

      return;

    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");

  });

  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));

}


let passed = 0;
let failed = 0;

function check(name, condition, detail) {

  if (condition) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);

}

function section(title) {
  console.log(`\n[${title}]`);
}

function wants(name) {
  return !ONLY || ONLY === name;
}

function near(a, b, tolerance = 1.5) {
  return Math.abs(a - b) <= tolerance;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/* =========================================================
   Studio 조작 helper (기존 inspector e2e 와 같은 방식)
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

  const className = selector.replace(/^\./, "");

  await previewClick(page, selector);

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

    if (await page.evaluate(() => window.getStudioInspectorState().editingOpen)) {
      return;
    }

    await page.click("#studioInspectorDirectButton");

    const opened = await page
      .waitForFunction(
        () => window.getStudioInspectorState().editingOpen === true,
        null,
        { timeout: 2000 }
      )
      .then(() => true, () => false);

    if (opened) return;

    await sleep(250);

  }

  throw new Error("직접 수정 폼이 열리지 않았습니다");

}

/* working draft 의 HOME html — 저장되는 그 문자열이다 */
function draftHtml(page) {

  return page.evaluate(() => {

    const state =
      window.getStudioAiWorkingState({ includePackage: true });

    return state.skinPackage.templates.home.html;

  });

}

/* 팝오버의 행들을 라벨 -> 요소 종류로 읽는다 */
function formRows(page) {

  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#studioInspectorFields .studio-inspector-row"))
      .map((row) => {

        const control =
          row.querySelector("select, input, .studio-inspector-layout-order");

        return {
          label: row.querySelector(".studio-inspector-row-label").textContent.trim(),
          tag: control ? control.tagName.toLowerCase() : null,
          value: control && "value" in control ? control.value : null
        };

      })
  );

}

/* 라벨로 <select> 를 찾아 고른다 */
async function chooseByLabel(page, label, value) {

  const changed = await page.evaluate(({ label, value }) => {

    const row =
      Array.from(document.querySelectorAll("#studioInspectorFields .studio-inspector-row"))
        .find((r) => r.querySelector(".studio-inspector-row-label").textContent.trim() === label);

    const select = row && row.querySelector("select");

    if (!select) return false;

    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));

    return true;

  }, { label, value });

  await sleep(400);

  return changed;

}

/* 라벨로 숫자 칸을 찾아 값을 넣는다 */
async function typeByLabel(page, label, value) {

  const changed = await page.evaluate(({ label, value }) => {

    const row =
      Array.from(document.querySelectorAll("#studioInspectorFields .studio-inspector-row"))
        .find((r) => r.querySelector(".studio-inspector-row-label").textContent.trim() === label);

    const input = row && row.querySelector("input");

    if (!input) return false;

    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    return true;

  }, { label, value });

  await sleep(400);

  return changed;

}

function previewRects(page, selectors) {

  return page.evaluate((list) => {

    const doc = document.getElementById("studioPreviewFrame").contentDocument;

    const out = {};

    list.forEach((selector) => {

      const el = doc.querySelector(selector);

      if (!el) {
        out[selector] = null;
        return;
      }

      const r = el.getBoundingClientRect();

      out[selector] = {
        left: r.left, top: r.top, right: r.right, bottom: r.bottom,
        width: r.width, height: r.height
      };

    });

    return out;

  }, selectors);

}


async function run() {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  const consoleErrors = [];

  try {

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    page.on("pageerror", (err) => consoleErrors.push(err.message));

    /* AI 는 이번 파일에서 한 번도 불려선 안 된다 */
    let aiCalls = 0;

    await page.route("**/api/skin-ai", async (route) => {
      aiCalls += 1;
      await route.fulfill({ status: 500, contentType: "text/plain", body: "must not be called" });
    });

    await page.goto(SCENARIO_URL, { waitUntil: "load" });

    await page.waitForFunction(
      () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
      null,
      { timeout: 20000 }
    );

    await previewHas(page, ".lay-home");

    await page.click("#studioInspectorButton");

    await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);

    await previewHas(page, "[data-imory-edit-id]");


    /* =====================================================
       [form] 배치 폼이 나오는 자리
    ====================================================== */

    if (wants("form")) {

      section("form");

      await selectInPreview(page, ".lay-plain");
      await openDirectEdit(page);

      const plainRows = await formRows(page);

      check(
        "자식이 있는 컨테이너에 '배치 방식' 이 있다",
        plainRows.some((row) => row.label === "배치 방식"),
        JSON.stringify(plainRows.map((r) => r.label))
      );

      check(
        "아직 배치를 고르지 않았으므로 값은 '없음'(빈 값)",
        plainRows.find((row) => row.label === "배치 방식").value === "",
        JSON.stringify(plainRows.find((row) => row.label === "배치 방식"))
      );

      await selectInPreview(page, ".lay-text");
      await openDirectEdit(page);

      const textRows = await formRows(page);

      check(
        "담을 것이 없는 텍스트에는 배치 폼이 없다",
        !textRows.some((row) => row.label === "배치 방식"),
        JSON.stringify(textRows.map((r) => r.label))
      );

      check(
        "기존 컨트롤은 그대로 나온다(회귀)",
        textRows.some((row) => row.label.indexOf("글자 크기") !== -1),
        JSON.stringify(textRows.map((r) => r.label))
      );

      await selectInPreview(page, ".lay-g1");
      await openDirectEdit(page);

      const childRows = await formRows(page);

      check(
        "격자 자식에는 칸과 순서가 있다",
        childRows.some((row) => row.label.indexOf("가로 칸") !== -1) &&
        childRows.some((row) => row.label === "순서"),
        JSON.stringify(childRows.map((r) => r.label))
      );

    }


    /* =====================================================
       [type] 배치 방식 고르기
    ====================================================== */

    if (wants("type")) {

      section("type");

      await selectInPreview(page, ".lay-plain");
      await openDirectEdit(page);

      await chooseByLabel(page, "배치 방식", "grid");

      const html = await draftHtml(page);

      check(
        "격자를 고르면 draft HTML 에 속성이 생긴다",
        /class="lay-plain"[^>]*data-imory-layout="grid"/.test(html) ||
        /data-imory-layout="grid"[^>]*class="lay-plain"/.test(html),
        html.slice(0, 400)
      );

      await previewHas(page, '.lay-plain[data-imory-layout="grid"]');

      const r = await previewRects(page, [".lay-plain", ".lay-p1", ".lay-p2"]);

      check(
        "Preview 가 실제로 2열로 다시 그려진다",
        near(r[".lay-p1"].top, r[".lay-p2"].top) &&
        r[".lay-p1"].right <= r[".lay-p2"].left + 1,
        JSON.stringify(r)
      );

      /* 격자 전용 파라미터를 하나 준 다음 세로로 바꾼다.

         ★ 검사는 **그 요소의 여는 태그만** 본다. HTML 전체를 보면
         옆에 있는 .lay-grid 의 columns 가 걸려서 "안 걷혔다"로
         잘못 읽힌다(실제로는 그쪽을 건드리면 안 된다). */
      await typeByLabel(page, "열 수 (열)", "3");

      const withColumns = await draftHtml(page);

      const plainTagOf = (html) => {
        const start = html.indexOf('<div class="lay-plain"');
        return start === -1 ? "" : html.slice(start, html.indexOf(">", start) + 1);
      };

      check(
        "격자일 때 열 수가 그 요소에 실제로 붙는다(뒤 검사의 전제)",
        plainTagOf(withColumns).indexOf('data-imory-layout-columns="3"') !== -1,
        plainTagOf(withColumns)
      );

      await chooseByLabel(page, "배치 방식", "stack:column");

      const afterSwitch = await draftHtml(page);

      check(
        "세로로 바꾸면 stack + direction=column 이 된다",
        plainTagOf(afterSwitch).indexOf('data-imory-layout="stack"') !== -1 &&
        plainTagOf(afterSwitch).indexOf('data-imory-layout-direction="column"') !== -1,
        plainTagOf(afterSwitch)
      );

      check(
        "★ 이전 종류에서만 뜻이 있던 파라미터가 걷힌다(columns)",
        plainTagOf(afterSwitch).indexOf("data-imory-layout-columns") === -1,
        plainTagOf(afterSwitch)
      );

      check(
        "옆 격자의 열 수는 건드려지지 않는다",
        afterSwitch.indexOf('class="lay-grid" data-imory-layout="grid" data-imory-layout-columns="2"') !== -1,
        afterSwitch.slice(afterSwitch.indexOf('class="lay-grid"'), afterSwitch.indexOf('class="lay-grid"') + 200)
      );

      const stacked = await previewRects(page, [".lay-p1", ".lay-p2"]);

      check(
        "세로로 바꾼 것이 화면에도 반영된다",
        stacked[".lay-p1"].bottom <= stacked[".lay-p2"].top + 1,
        JSON.stringify(stacked)
      );

      /* 배치 없음으로 되돌리면 속성이 전부 사라진다 */
      await chooseByLabel(page, "배치 방식", "");

      const cleared = await draftHtml(page);

      check(
        "'없음' 을 고르면 배치 속성이 전부 사라진다",
        !/class="lay-plain"[^>]*data-imory-layout/.test(cleared) &&
        cleared.indexOf('class="lay-plain"') !== -1,
        cleared.slice(0, 400)
      );

    }


    /* =====================================================
       [param] 열 수 — 고른 컨테이너만
    ====================================================== */

    if (wants("param")) {

      section("param");

      const before = await previewRects(page, [".lay-side-menu", ".lay-f1"]);

      await selectInPreview(page, ".lay-grid");
      await openDirectEdit(page);

      const rows = await formRows(page);

      check(
        "지금 값이 폼에 그대로 보인다(열 수 2)",
        rows.find((row) => row.label === "열 수 (열)").value === "2",
        JSON.stringify(rows)
      );

      await typeByLabel(page, "열 수 (열)", "3");

      await previewHas(page, '.lay-grid[data-imory-layout-columns="3"]');

      const r = await previewRects(page, [".lay-grid", ".lay-g1", ".lay-g2", ".lay-g3"]);

      check(
        "3열이 되어 세 항목이 한 줄에 온다",
        near(r[".lay-g1"].top, r[".lay-g2"].top) &&
        near(r[".lay-g2"].top, r[".lay-g3"].top),
        JSON.stringify(r)
      );

      const after = await previewRects(page, [".lay-side-menu", ".lay-f1"]);

      check(
        "★ 다른 영역의 배치는 건드려지지 않는다(요구사항 12절)",
        near(after[".lay-side-menu"].width, before[".lay-side-menu"].width) &&
        near(after[".lay-f1"].width, before[".lay-f1"].width),
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
      );

      /* 범위 밖은 거부된다 */
      await typeByLabel(page, "열 수 (열)", "99");

      const html = await draftHtml(page);

      check(
        "범위 밖 값은 들어가지 않는다(3 그대로)",
        html.indexOf('data-imory-layout-columns="3"') !== -1 &&
        html.indexOf('columns="99"') === -1,
        html.slice(0, 500)
      );

    }


    /* =====================================================
       [item] 격자 자식의 칸
    ====================================================== */

    if (wants("item")) {

      section("item");

      await selectInPreview(page, ".lay-g1");
      await openDirectEdit(page);

      await typeByLabel(page, "가로 칸 (칸)", "2");

      const html = await draftHtml(page);

      check(
        "자식에 span 속성이 붙는다",
        /class="lay-g1"[^>]*data-imory-item-span="2"/.test(html) ||
        /data-imory-item-span="2"[^>]*class="lay-g1"/.test(html),
        html.slice(0, 500)
      );

      await previewHas(page, '.lay-g1[data-imory-item-span="2"]');

      const r = await previewRects(page, [".lay-grid", ".lay-g1", ".lay-g2"]);

      const track =
        (r[".lay-grid"].width - 10 * 2) / 3;

      check(
        "화면에서도 두 칸을 차지한다",
        near(r[".lay-g1"].width, track * 2 + 10, 2),
        `expected=${track * 2 + 10} got=${r[".lay-g1"].width}`
      );

    }


    /* =====================================================
       [order] 형제 순서
    ====================================================== */

    if (wants("order")) {

      section("order");

      await selectInPreview(page, ".lay-g3");
      await openDirectEdit(page);

      const rows = await formRows(page);

      check(
        "마지막 형제는 '뒤로' 가 잠겨 있다",
        await page.evaluate(() => {
          const down = document.getElementById("studioInspectorLayoutOrder-down");
          const up = document.getElementById("studioInspectorLayoutOrder-up");
          return !!down && down.disabled === true && !!up && up.disabled === false;
        }),
        JSON.stringify(rows)
      );

      await page.click("#studioInspectorLayoutOrder-up");

      await sleep(500);

      const html = await draftHtml(page);

      check(
        "★ 순서 이동이 HTML 의 형제 순서를 바꾼다(G3 가 G2 앞으로)",
        html.indexOf('class="lay-g3"') < html.indexOf('class="lay-g2"'),
        html.slice(html.indexOf('class="lay-grid"'), html.indexOf('class="lay-grid"') + 400)
      );

      const r = await previewRects(page, [".lay-g1", ".lay-g2", ".lay-g3"]);

      /* 읽는 순서로 본다(줄 먼저, 그 다음 왼쪽). 앞 절에서 G1 이
         두 칸을 차지하게 만들었으므로 G3 는 첫 줄 오른쪽 끝,
         G2 는 둘째 줄이다 — 단순히 left 만 견주면 어긋난다. */
      const readingOrder = (a, b) =>
        a.top < b.top - 1 || (near(a.top, b.top) && a.left < b.left);

      check(
        "화면 순서도 따라온다(읽는 순서로 G3 가 G2 앞)",
        readingOrder(r[".lay-g3"], r[".lay-g2"]),
        JSON.stringify(r)
      );

      check(
        "옮겨도 간격은 그대로(10px)",
        near(r[".lay-g3"].left - r[".lay-g1"].right, 10, 2) ||
        near(r[".lay-g2"].left - r[".lay-g3"].right, 10, 2),
        JSON.stringify(r)
      );

    }


    /* =====================================================
       [free] 자유 배치 — 손잡이와 드래그
    ====================================================== */

    if (wants("free")) {

      section("free");

      await selectInPreview(page, ".lay-f1");
      await openDirectEdit(page);

      const rows = await formRows(page);

      check(
        "자유 배치 자식에는 좌표 칸이 나온다(%)",
        rows.some((row) => row.label === "가로 위치 (%)") &&
        rows.some((row) => row.label === "세로 위치 (%)"),
        JSON.stringify(rows.map((r) => r.label))
      );

      check(
        "자유 배치에는 '순서' 가 없다(자리는 좌표가 정한다)",
        !rows.some((row) => row.label === "순서"),
        JSON.stringify(rows.map((r) => r.label))
      );

      const handle =
        await page.evaluate(() => {

          const el = document.getElementById("studioInspectorMoveHandle");

          if (!el || el.hidden) return null;

          const r = el.getBoundingClientRect();

          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };

        });

      check("이동 손잡이가 보인다", !!handle, JSON.stringify(handle));

      if (handle) {

        const box = await previewRects(page, [".lay-free", ".lay-f1"]);

        /* 가로로는 **움직일 수 있는 거리보다 짧게**, 세로로는 그보다
           길게 끈다. 그래서 한 번의 드래그로 두 가지를 함께 본다 —
           가로는 포인터를 따라온 거리(기어비), 세로는 상한에서 멈추는
           것(clamp). */
        const DRAG_X = 600;
        const DRAG_Y = 400;

        /* 움직일 수 있는 거리 = 부모 안쪽 폭 − 자기 폭 */
        const rangeX =
          box[".lay-free"].width - box[".lay-f1"].width;

        await page.mouse.move(handle.x, handle.y);
        await page.mouse.down();
        await page.mouse.move(handle.x + DRAG_X, handle.y + DRAG_Y, { steps: 12 });
        await page.mouse.up();

        await sleep(600);

        const html = await draftHtml(page);

        const f1Tag =
          html.slice(html.indexOf('<div class="lay-f1"'), html.indexOf(">", html.indexOf('<div class="lay-f1"')) + 1);

        const savedX =
          Number((f1Tag.match(/data-imory-item-x="([\d.]+)"/) || [])[1]);

        check(
          "★ 가로 좌표가 포인터 이동 거리와 1:1 로 맞는다(기어비)",
          Number.isFinite(savedX) && Math.abs(savedX - DRAG_X / rangeX) <= 0.02,
          `saved=${savedX} expected=${DRAG_X / rangeX} rangeX=${rangeX}`
        );

        check(
          "★ 세로는 상한(1)에서 멈춘다 — 끌어도 컨테이너 밖으로 못 나간다",
          /data-imory-item-y="1"/.test(f1Tag),
          f1Tag
        );

        const moved = await previewRects(page, [".lay-free", ".lay-f1"]);

        check(
          "화면에서 가로는 끈 만큼 옮겨졌다",
          near(moved[".lay-f1"].left, box[".lay-f1"].left + DRAG_X, 3),
          `before=${box[".lay-f1"].left} after=${moved[".lay-f1"].left}`
        );

        check(
          "화면에서 아래쪽은 컨테이너 안쪽에 딱 붙는다",
          near(moved[".lay-f1"].bottom, moved[".lay-free"].bottom, 2),
          `free=${JSON.stringify(moved[".lay-free"])} f1=${JSON.stringify(moved[".lay-f1"])}`
        );

        check(
          "어느 방향으로도 컨테이너를 벗어나지 않는다",
          moved[".lay-f1"].right <= moved[".lay-free"].right + 1 &&
          moved[".lay-f1"].bottom <= moved[".lay-free"].bottom + 1
        );

        check(
          "드래그 한 번이 편집 한 칸이다(Undo 가 생겼다)",
          await page.evaluate(() => window.getStudioInspectorState().hasUndo === true)
        );

        check(
          "끌기 전의 자리와는 실제로 달라졌다",
          !near(box[".lay-f1"].left, moved[".lay-f1"].left, 5),
          `before=${box[".lay-f1"].left} after=${moved[".lay-f1"].left}`
        );

      }

      /* 숫자 칸으로도 같은 값을 쓴다 — % 로 보여주고 비율로 저장 */
      await selectInPreview(page, ".lay-f1");
      await openDirectEdit(page);

      await typeByLabel(page, "가로 위치 (%)", "25");

      const typedHtml = await draftHtml(page);

      check(
        "★ 화면에는 % 로, 파일에는 비율로 저장된다(25 -> 0.25)",
        /data-imory-item-x="0\.25"/.test(typedHtml),
        typedHtml.slice(typedHtml.indexOf('class="lay-f1"') - 150, typedHtml.indexOf('class="lay-f1"') + 200)
      );

    }


    /* =====================================================
       [slot] 사이드바 영역
    ====================================================== */

    if (wants("slot")) {

      section("slot");

      await selectInPreview(page, ".lay-side-main");
      await openDirectEdit(page);

      const rows = await formRows(page);

      check(
        "사이드바 자식에는 '영역' 이 나온다",
        rows.some((row) => row.label === "영역"),
        JSON.stringify(rows.map((r) => r.label))
      );

      const before = await previewRects(page, [".lay-side-menu", ".lay-side-main"]);

      check(
        "지금은 메뉴가 왼쪽이다",
        before[".lay-side-menu"].left < before[".lay-side-main"].left,
        JSON.stringify(before)
      );

      await selectInPreview(page, ".lay-side");
      await openDirectEdit(page);

      await chooseByLabel(page, "사이드바 자리", "right");

      await previewHas(page, '.lay-side[data-imory-layout-side="right"]');

      const after = await previewRects(page, [".lay-side-menu", ".lay-side-main"]);

      check(
        "★ 자리를 오른쪽으로 바꾸면 화면이 뒤집힌다(HTML 순서는 그대로)",
        after[".lay-side-menu"].left > after[".lay-side-main"].left,
        JSON.stringify(after)
      );

      check(
        "사이드바 폭은 그대로(150px)",
        near(after[".lay-side-menu"].width, 150),
        String(after[".lay-side-menu"].width)
      );

    }


    /* =====================================================
       [undo] 되돌리기
    ====================================================== */

    if (wants("undo")) {

      section("undo");

      await selectInPreview(page, ".lay-grid");
      await openDirectEdit(page);

      const before = await draftHtml(page);

      await typeByLabel(page, "간격 (px)", "40");

      const changed = await draftHtml(page);

      check(
        "간격이 바뀌었다",
        changed.indexOf('data-imory-layout-gap="40"') !== -1,
        changed.slice(0, 400)
      );

      await page.click("#studioUndoButton");

      await sleep(500);

      const undone = await draftHtml(page);

      check(
        "★ 되돌리기가 직전 한 벌을 그대로 복원한다",
        undone === before,
        `before.len=${before.length} undone.len=${undone.length}`
      );

    }


    /* =====================================================
       [save] 저장 payload
    ====================================================== */

    if (wants("save")) {

      section("save");

      await page.evaluate(() => { window.top.__savedDraftCallsLay = []; });

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => (window.top.__savedDraftCallsLay || []).length > 0,
        null,
        { timeout: 8000 }
      );

      const saved =
        await page.evaluate(() => {

          const calls = window.top.__savedDraftCallsLay;

          return calls[calls.length - 1].p_content.templates.home.html;

        });

      check(
        "★ 저장되는 HTML 에 배치 속성이 그대로 실린다",
        saved.indexOf('data-imory-layout="grid"') !== -1 &&
        saved.indexOf('data-imory-layout="free"') !== -1 &&
        saved.indexOf('data-imory-layout="sidebar"') !== -1 &&
        saved.indexOf('data-imory-slot="sidebar"') !== -1,
        saved.slice(0, 600)
      );

      check(
        "이번 라운드에서 손으로 고친 값이 살아 있다",
        saved.indexOf('data-imory-item-span="2"') !== -1 &&
        /data-imory-item-x="0\.25"/.test(saved),
        saved.slice(0, 800)
      );

      check(
        "저장 경계를 지난 뒤에도 컴파일러가 만든 style 속성은 없다(HTML 은 속성만 담는다)",
        saved.indexOf("--imory-lay-") === -1 && saved.indexOf('style=') === -1,
        saved.slice(0, 600)
      );

      /* =====================================================
         ★ 저장한 자리가 **다시 열었을 때** 그대로인가

         fixture 는 in-memory 라 새로고침하면 초기값으로 돌아간다.
         그래서 방금 저장된 content 를 addInitScript 로 심어 문서를
         새로 연다(scenario t/y 가 쓰는 방식 그대로) — "저장 -> 재로드"
         한 바퀴를 실제로 도는 유일한 방법이다.
      ====================================================== */

      const savedPackage =
        await page.evaluate(() => {
          const calls = window.top.__savedDraftCallsLay;
          return calls[calls.length - 1].p_content;
        });

      const reopened = await context.newPage();

      reopened.on("pageerror", (err) => consoleErrors.push(err.message));

      await reopened.addInitScript(
        (pkg) => { window.__scenarioLaySkinPackage = pkg; },
        savedPackage
      );

      await reopened.goto(SCENARIO_URL, { waitUntil: "load" });

      await reopened.waitForFunction(
        () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
        null,
        { timeout: 20000 }
      );

      await previewHas(reopened, ".lay-home");

      const restored = await previewRects(reopened, [".lay-free", ".lay-f1", ".lay-grid", ".lay-g1"]);

      check(
        "★ 다시 열어도 자유 배치 자리가 그대로다(x=0.25)",
        near(
          restored[".lay-f1"].left,
          restored[".lay-free"].left + 0.25 * (restored[".lay-free"].width - restored[".lay-f1"].width),
          2
        ),
        JSON.stringify(restored)
      );

      check(
        "다시 열어도 격자 칸(span=2)이 그대로다",
        restored[".lay-g1"].width > restored[".lay-grid"].width / 2,
        JSON.stringify(restored)
      );

      await reopened.close();

    }


    /* =====================================================
       [mobile] 390px Studio 창
    ====================================================== */

    if (wants("mobile")) {

      section("mobile");

      await page.setViewportSize({ width: 390, height: 780 });

      await sleep(500);

      await selectInPreview(page, ".lay-grid");
      await openDirectEdit(page);

      const state =
        await page.evaluate(() => {

          const popover = document.getElementById("studioInspectorPopover");
          const r = popover.getBoundingClientRect();

          return {
            hidden: popover.hidden,
            inViewport: r.left >= -1 && r.right <= window.innerWidth + 1,
            overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            hasLayoutRow: Array.from(popover.querySelectorAll(".studio-inspector-row-label"))
              .some((el) => el.textContent.trim() === "배치 방식")
          };

        });

      check("390px 에서 배치 폼이 화면 안에 있다", state.hidden === false && state.inViewport, JSON.stringify(state));
      check("390px 에서 배치 방식 행이 나온다", state.hasLayoutRow, JSON.stringify(state));
      check("390px 에서 Studio 가로 넘침 0", state.overflow, JSON.stringify(state));

      await page.setViewportSize({ width: 1280, height: 900 });

    }


    section("console");

    check("AI 는 한 번도 불리지 않았다", aiCalls === 0, String(aiCalls));

    const realErrors =
      consoleErrors.filter((text) => text.indexOf("favicon") === -1);

    check("콘솔 오류 없음", realErrors.length === 0, realErrors.join("\n        "));

  } finally {

    await browser.close();
    server.close();

  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);

  process.exit(failed === 0 ? 0 : 1);

}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
