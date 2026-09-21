/* =========================================================
   HOME CANVAS — 저장 왕복 E2E (HOME-CANVAS-CONTRACT-1B · 1C)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md

   ★ 이 라운드는 **데이터 계약만** 구현한다. 캔버스 요소는 아직
     화면에 그려지지 않는다 — 그래서 이 파일은 픽셀을 재지 않고,
     SkinPackage 가 실제 Studio 를 지나 돌아올 때 `regions` 의
     `home_canvas` 항목이 **한 칸도 잃지 않는가**만 본다.

   studio/studio-lifecycle-scenario.html?scenario=lay 에
   `__scenarioLaySkinPackage` 로 캔버스 fixture 를 심어 연다.

   [import]    실제 Import 창 — 정상 파일은 통과, 잘못된 캔버스는
               **정확한 필드 경로**와 함께 거부되고 draft 는 그대로
   [roundtrip] Export → 파일에 canvas 가 그대로(모르는 칸 포함) →
               그 파일을 다시 Import → 같은 값
   [persist]   Save payload → 그 content 로 다시 열기 → Publish 된
               content 까지 canvas 가 그대로
   [ai]        AI 응답(서버가 regions 를 그대로 되돌려 준다)을 적용해도
               canvas 가 사라지지 않는다. 이미 깨져 있는 canvas 도
               AI 수정을 막지 않는다
   [v2]        조합형 Canvas(`version:2`, V2-DATA-1) — 잘못된 v2 는
               **정확한 경로**와 함께 거부되고, 유효한 v2 는 Import →
               Save → 다시 열기 → Export → Publish → AI 를 한 칸도
               잃지 않고 지난다. 그러면서도 **아직 그려지지 않는다**
   [legacy]    캔버스가 없는 기존 스킨은 Save/Export 결과가 그대로다

   계약 자체(요소 규칙 · 오류 경로 · 실행 payload · 봉투)는 브라우저
   없이 도는 node skin/skin-home-canvas-test.mjs 가 본다.

   실행:
     node studio/studio-home-canvas-e2e-test.mjs
     node studio/studio-home-canvas-e2e-test.mjs --only=persist
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8982;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=lay`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");


/* =========================================================
   fixture — 캔버스가 있는 스킨 하나

   ★ 일부러 넣어 둔 것 셋.
     1) 모르는 region(`someone_elses_thing`)
     2) canvas 안의 모르는 칸(`futureCanvasField`)
     3) 요소 안의 모르는 칸(`futureElementField`)
   셋 다 모든 경로를 지나 돌아와야 한다.
========================================================== */

const CANVAS_HOME_HTML =
  '<div class="hc-home">' +
  '<h1 class="hc-title" data-imory-bind="site.title"></h1>' +
  '<div class="hc-canvas" data-imory-canvas-root></div>' +
  "</div>";

const CANVAS_REGION = {
  name: "home_canvas",
  enabled: true,
  canvas: {
    version: 1,
    baseWidth: 390,
    /* HOME-CANVAS-CONTRACT-1C — 도화지 전체의 세로 길이. 기본 844 가
       아니라 일부러 긴 스크롤형 값을 쓴다: 어느 단계에서든 844 로
       "기본값이 채워진" 것을 왕복 성공으로 착각하지 않게. */
    baseHeight: 1600,
    elements: [
      {
        id: "canvas_photo1",
        type: "photo",
        x: 20,
        y: 120,
        width: 260,
        height: 320,
        rotation: 0,
        hidden: false,
        locked: false,
        props: { slot: "photo_1" },
        futureElementField: "keep me"
      },
      {
        id: "canvas_text1",
        type: "text",
        x: 20,
        y: 470,
        width: 260,
        height: "auto",
        rotation: -2,
        hidden: false,
        locked: false,
        props: { text: "A quiet archive.", role: "body" }
      }
    ],
    futureCanvasField: { keep: true }
  }
};

const CANVAS_SKIN = {
  schemaVersion: 1,
  templates: {
    home: { html: CANVAS_HOME_HTML },
    category: { html: '<div class="hc-category"></div>' },
    post: { html: '<div class="hc-post"><div data-imory-region="post-body"></div></div>' }
  },
  css: ".hc-home { padding: 8px; }",
  imageSlots: [{ name: "photo_1", label: "사진 1", required: false }],
  regions: [
    { name: "someone_elses_thing", payload: { deep: [1, 2] } },
    CANVAS_REGION
  ],
  metadata: { title: "HOME Canvas fixture" }
};

/* =========================================================
   v2 fixture — 조합형 Canvas 하나 (HOME-CANVAS-V2-DATA-1)

   로드맵 §14-3 의 예시에 **모르는 칸 넷**을 섞어 둔 것이다
   (canvas · flow · block · 프레임 내부 요소 · overlay). 이 라운드가
   v2 를 검증하기 시작했으므로, 검증이 "통과시킨다"에서 끝나지 않고
   Import → Save → 다시 열기 → Export → Publish → AI 를 지나도 **한
   칸도 잃지 않는지**를 v1 과 같은 자로 본다.

   ★ 유효한 v2 라도 **아직 그려지지 않는다** — 이 절은 그것도 함께
     확인한다(공개 resolve 에 canvas 키가 없다 = 기존 HOME fallback).
========================================================== */

const V2_REGION = {
  name: "home_canvas",
  enabled: true,
  canvas: {
    version: 2,
    baseWidth: 390,
    baseHeight: 1240,
    flow: {
      direction: "column",
      padding: { top: 48, right: 24, bottom: 64, left: 24 },
      gap: 20,
      blocks: [
        {
          id: "canvas_b1logo",
          type: "logo",
          width: 120,
          height: 40,
          align: "center",
          props: { slot: "title_logo", fallback: "site_title" },
          futureBlockField: "keep me"
        },
        {
          id: "canvas_b2nav",
          type: "category_nav",
          width: 342,
          height: "auto",
          align: "stretch",
          margin: { top: 8 },
          props: { mode: "all", categoryIds: [] }
        },
        {
          id: "canvas_b3title",
          type: "text",
          width: 300,
          height: "auto",
          align: "center",
          props: { text: "FOREVER YOUNG", role: "title" }
        },
        {
          id: "canvas_b4rule",
          type: "divider",
          width: 120,
          height: 1,
          align: "center",
          margin: { top: 12, bottom: 12 }
        },
        {
          id: "canvas_b5main",
          type: "main_visual",
          width: 300,
          height: "auto",
          align: "center",
          margin: { top: 24, bottom: 24 },
          props: {
            baseWidth: 300,
            baseHeight: 380,
            primaryId: "canvas_m1photo",
            elements: [
              {
                id: "canvas_m0paper",
                type: "shape",
                follow: "transform",
                x: -18, y: 26, width: 300, height: 360, rotation: -6,
                props: { kind: "rect" },
                futureElementField: "keep me"
              },
              {
                id: "canvas_m1photo",
                type: "photo",
                follow: "transform",
                x: 0, y: 0, width: 300, height: 380,
                props: { slot: "photo_main" }
              },
              {
                id: "canvas_m2left",
                type: "text",
                follow: "pin",
                width: 92, height: 22,
                pin: {
                  target: "photo", anchor: "left", origin: "right",
                  offset: { x: 8, y: -40 }
                },
                props: { text: "puppy !", role: "label" }
              }
            ]
          }
        }
      ],
      futureFlowField: { keep: true }
    },
    overlays: [
      {
        id: "canvas_o1number",
        type: "text",
        x: -46, y: 980, width: 260, height: 200, rotation: 0,
        props: { text: "01", role: "label" },
        futureOverlayField: [1, 2]
      }
    ],
    futureCanvasField: { keep: true }
  }
};

const V2_SKIN = {
  schemaVersion: 1,
  templates: {
    home: { html: CANVAS_HOME_HTML },
    category: { html: '<div class="hc-category"></div>' },
    post: { html: '<div class="hc-post"><div data-imory-region="post-body"></div></div>' }
  },
  css: ".hc-home { padding: 8px; }",
  imageSlots: [
    { name: "title_logo", label: "로고", required: false },
    { name: "photo_main", label: "메인 사진", required: false }
  ],
  regions: [
    { name: "someone_elses_thing", payload: { deep: [1, 2] } },
    V2_REGION
  ],
  metadata: { title: "HOME Canvas v2 fixture" }
};

const PLAIN_SKIN = {
  schemaVersion: 1,
  templates: {
    home: { html: '<div class="hc-home"><h1 data-imory-bind="site.title"></h1></div>' },
    category: { html: '<div class="hc-category"></div>' },
    post: { html: '<div class="hc-post"><div data-imory-region="post-body"></div></div>' }
  },
  css: ".hc-home { padding: 8px; }",
  imageSlots: [],
  regions: [],
  metadata: { title: "HOME Canvas 없는 스킨" }
};

const clone = (v) => JSON.parse(JSON.stringify(v));

const canvasOf = (regions) => {
  const entry = (regions || []).find((e) => e && e.name === "home_canvas");
  return entry ? entry.canvas : null;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);


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
   Studio 열기
========================================================== */

async function openStudio(browser, options) {

  const opts = options || {};

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true
  });

  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));

  /*
    AI — 진짜 서버를 거치지 않는다. 이 파일이 보는 것은 모델도
    서버도 아니라 "서버가 regions 를 그대로 되돌려 줄 때 Studio 가
    그것을 잃지 않는가"다. 그래서 mock 도 진짜 서버와 같은 일을
    한다: 요청에 실려 온 skinPackage.regions 를 **그대로** 돌려주고
    css 만 바꾼다(functions/api/skin-ai.js 의 result 리터럴과 같다).
  */
  await page.route("**/api/skin-ai", async (route) => {

    if (!opts.ai) {
      await route.fulfill({ status: 500, body: "must not be called" });
      return;
    }

    let sent = {};
    try { sent = JSON.parse(route.request().postData() || "{}"); } catch { /* */ }

    const current = sent.skinPackage || {};

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        ok: true,
        summary: "글씨 색을 바꿨습니다.",
        skinPackage: {
          schemaVersion: 1,
          templates: current.templates,
          css: ".hc-home { padding: 8px; color: crimson; }\n/* imory-ai canvas fixture */",
          imageSlots: current.imageSlots || [],
          regions: current.regions || [],
          metadata: current.metadata || {}
        }
      })
    });

  });

  await page.addInitScript((pkg) => { window.__scenarioLaySkinPackage = pkg; }, opts.skin || CANVAS_SKIN);

  await page.goto(SCENARIO_URL, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null, { timeout: 20000 }
  );

  await page.waitForFunction(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return !!(doc && doc.querySelector(".hc-home"));
  }, null, { timeout: 10000 });

  return { context, page, errors };

}

const draftRegions = (page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(currentWorkingSkin.regions || [])));

const previewHasCanvasRoot = (page) =>
  page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return doc.querySelectorAll("[data-imory-canvas-root]").length;
  });


/*
  Import 창은 **거부된 뒤에도 열려 있다**(사용자가 그 자리에서
  고쳐야 하니까). 그래서 이 함수는 닫혀 있을 때만 연다 — 매번
  #studioImportButton 을 누르면 overlay 가 클릭을 가로챈다.
*/
async function importJson(page, text) {

  const alreadyOpen = await page.evaluate(() => {
    const overlay = document.querySelector(".import-editor-overlay");
    return !!overlay && !overlay.hasAttribute("hidden");
  });

  if (!alreadyOpen) {
    await page.click("#studioImportButton");
    await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });
  }

  await page.fill(".import-editor-textarea", text);
  await page.click(".import-editor-actions .import-editor-button:nth-of-type(2)");

  await page.waitForFunction(() => {
    const msg = document.querySelector(".import-editor-message");
    return msg && msg.textContent && !/확인하는 중/.test(msg.textContent);
  }, null, { timeout: 10000 });

  return page.evaluate(() => {
    const msg = document.querySelector(".import-editor-message");
    const apply = document.querySelector(".import-editor-button--primary");
    return {
      message: msg ? msg.textContent : "",
      isError: !!(msg && msg.classList.contains("import-editor-message--error")),
      canApply: !!(apply && !apply.disabled)
    };
  });

}

async function closeImport(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}


async function run() {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  try {

    /* ------------------------------------------------- */
    if (wants("import")) {

      section("import");

      const { context, page, errors } = await openStudio(browser);

      check("★ 표시 위치가 Preview 문서에 살아 있다(저장 경계가 지우지 않았다)",
        (await previewHasCanvasRoot(page)) === 1);

      check("여는 순간의 draft 에 canvas 가 그대로(모르는 칸 포함)",
        same(canvasOf(await draftRegions(page)), CANVAS_REGION.canvas),
        JSON.stringify(canvasOf(await draftRegions(page))));

      /* 잘못된 캔버스 — 정확한 경로와 함께 거부 */
      const broken = clone(CANVAS_SKIN);
      broken.regions[1].canvas.elements[1].width = -3;

      let r = await importJson(page, JSON.stringify(broken));

      check("★ 잘못된 canvas 는 거부되고 **필드 경로**를 보여 준다",
        r.isError && !r.canApply && r.message.includes("regions[1].canvas.elements[1].width"),
        r.message);

      /* 중복 id */
      const dup = clone(CANVAS_SKIN);
      dup.regions[1].canvas.elements[1].id = "canvas_photo1";

      r = await importJson(page, JSON.stringify(dup));

      check("★ 중복 id 도 거부(조용히 새 id 로 고치지 않는다)",
        r.isError && !r.canApply && r.message.includes("regions[1].canvas.elements[1].id"),
        r.message);

      /* photo 의 auto 높이 */
      const badHeight = clone(CANVAS_SKIN);
      badHeight.regions[1].canvas.elements[0].height = "auto";

      r = await importJson(page, JSON.stringify(badHeight));

      check("★ photo 의 height \"auto\" 거부 · text 의 \"auto\" 는 통과",
        r.isError && r.message.includes("regions[1].canvas.elements[0].height"),
        r.message);

      /* 도화지 전체 높이(1C) — 0 · 누락 둘 다 baseHeight 경로로 거부 */
      const badBase = clone(CANVAS_SKIN);
      badBase.regions[1].canvas.baseHeight = 0;

      r = await importJson(page, JSON.stringify(badBase));

      check("★ baseHeight 0 거부 · 경로가 regions[1].canvas.baseHeight",
        r.isError && !r.canApply && r.message.includes("regions[1].canvas.baseHeight"),
        r.message);

      const noBase = clone(CANVAS_SKIN);
      delete noBase.regions[1].canvas.baseHeight;

      r = await importJson(page, JSON.stringify(noBase));

      check("★ baseHeight 누락도 거부(v1 필수 필드 — 조용히 844 로 채우지 않는다)",
        r.isError && !r.canApply && r.message.includes("regions[1].canvas.baseHeight"),
        r.message);

      check("거부된 Import 는 draft 를 바꾸지 않았다(원래 값 그대로)",
        same(canvasOf(await draftRegions(page)), CANVAS_REGION.canvas));

      /*
        미래 version — 거부가 아니다.

        ★ 숫자는 **3** 이다. HOME-CANVAS-V2-DATA-1 부터 `version: 2` 는
          §14 규칙으로 실제 검증되는 조합형 Canvas 라 "내용을 보지 않고
          통과시키는 version" 의 예가 될 수 없다. 단언의 뜻은 그대로다.
      */
      const future = clone(CANVAS_SKIN);
      future.regions[1].canvas = { version: 3, baseWidth: 999, elements: [{ nonsense: true }] };

      r = await importJson(page, JSON.stringify(future));

      check("★ 미래 canvas.version 은 거부가 아니다(파일이 통과한다)",
        !r.isError && r.canApply, r.message);

      await page.click(".import-editor-button--primary");
      await page.waitForTimeout(600);

      check("★ 적용된 미래 version 이 draft 에 **그대로 보존**된다",
        same(canvasOf(await draftRegions(page)), future.regions[1].canvas),
        JSON.stringify(canvasOf(await draftRegions(page))));

      check("미래 version 스킨도 Preview 가 그려진다(기존 HOME fallback)",
        (await previewHasCanvasRoot(page)) === 1);

      check("페이지 오류 없음", errors.length === 0, errors.join(" | "));

      await context.close();

    }


    /* ------------------------------------------------- */
    if (wants("roundtrip")) {

      section("roundtrip");

      const { context, page } = await openStudio(browser);

      const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
      await page.click("#studioExportButton");
      const download = await downloadPromise;
      const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));

      check("★ Export 파일의 canvas 가 한 칸도 빠지지 않는다(모르는 칸 포함)",
        same(canvasOf(exported.regions), CANVAS_REGION.canvas),
        JSON.stringify(canvasOf(exported.regions)));

      check("모르는 region 도 자리 그대로",
        same(exported.regions[0], CANVAS_SKIN.regions[0]) && exported.regions.length === 2);

      check("★ Export 파일의 baseHeight 가 844 로 되돌아가지 않는다",
        canvasOf(exported.regions).baseHeight === 1600,
        String(canvasOf(exported.regions).baseHeight));

      /* 그 파일을 고쳐서 다시 Import — 도화지 높이도 함께 바꾼다 */
      const edited = clone(exported);
      edited.regions[1].canvas.baseHeight = 2400;
      edited.regions[1].canvas.elements.push({
        id: "canvas_shape1",
        type: "shape",
        x: 10, y: 10, width: 60, height: 60,
        rotation: 45, hidden: false, locked: true,
        props: { kind: "ellipse" }
      });

      const r = await importJson(page, JSON.stringify(edited));
      check("고친 Export 파일이 다시 Import 된다", !r.isError && r.canApply, r.message);

      await page.click(".import-editor-button--primary");
      await page.waitForTimeout(600);

      const after = canvasOf(await draftRegions(page));

      check("★ Export → Import 왕복 뒤에도 요소 id 가 그대로",
        same(after.elements.map((e) => e.id), ["canvas_photo1", "canvas_text1", "canvas_shape1"]),
        JSON.stringify(after.elements.map((e) => e.id)));

      check("왕복 뒤에도 모르는 칸이 살아 있다",
        same(after.futureCanvasField, { keep: true }) &&
        after.elements[0].futureElementField === "keep me");

      check("★ 고쳐 넣은 baseHeight(2400)가 draft 에 그대로 들어간다",
        after.baseHeight === 2400, String(after.baseHeight));

      check("★ 요소를 하나 더해도 baseHeight 는 저절로 바뀌지 않는다",
        await page.evaluate(() =>
          window.resolveSkinTemplate(currentWorkingSkin, "home").canvas.baseHeight === 2400));

      await context.close();

    }


    /* ------------------------------------------------- */
    if (wants("persist")) {

      section("persist");

      const { context, page } = await openStudio(browser);

      /* 저장을 일으키려면 dirty 여야 한다 — Code 로 CSS 한 줄을 고친다 */
      await page.evaluate(() => { window.top.__savedDraftCallsLay = []; });

      const r = await importJson(page, JSON.stringify(
        Object.assign(clone(CANVAS_SKIN), { css: ".hc-home { padding: 12px; }" })
      ));
      check("Save 를 일으킬 Import 통과", !r.isError && r.canApply, r.message);
      await page.click(".import-editor-button--primary");
      await page.waitForTimeout(600);

      await page.click("#studioSaveButton");
      await page.waitForFunction(() => (window.top.__savedDraftCallsLay || []).length > 0, null, { timeout: 8000 });

      const saved = await page.evaluate(() => {
        const calls = window.top.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      check("★ Save payload 의 canvas 가 그대로",
        same(canvasOf(saved.regions), CANVAS_REGION.canvas),
        JSON.stringify(canvasOf(saved.regions)));

      check("Save 된 HOME html 에 표시 위치가 남아 있다",
        /data-imory-canvas-root/.test(saved.templates.home.html));

      /* 저장한 content 로 다시 연다 */
      const reopened = await openStudio(browser, { skin: saved });

      check("★ 다시 열어도 canvas 가 그대로",
        same(canvasOf(await draftRegions(reopened.page)), CANVAS_REGION.canvas));

      check("다시 연 Preview 에도 표시 위치가 하나",
        (await previewHasCanvasRoot(reopened.page)) === 1);

      /* Publish */
      await reopened.page.evaluate(() => {
        window.top.__savedDraftCallsLay = [];
        window.top.__publishedLay = undefined;
      });

      const r2 = await importJson(reopened.page, JSON.stringify(
        Object.assign(clone(saved), { css: ".hc-home { padding: 16px; }" })
      ));
      check("Publish 전 Save 를 일으킬 Import 통과", !r2.isError && r2.canApply, r2.message);
      await reopened.page.click(".import-editor-button--primary");
      await reopened.page.waitForTimeout(600);

      await reopened.page.click("#studioSaveButton");
      await reopened.page.waitForFunction(() => (window.top.__savedDraftCallsLay || []).length > 0, null, { timeout: 8000 });
      await reopened.page.waitForFunction(() => !document.getElementById("studioPublishButton").disabled, null, { timeout: 8000 });
      await reopened.page.click("#studioPublishButton");
      await reopened.page.click(".studio-confirm-button--primary");
      await reopened.page.waitForFunction(() => window.top.__publishedLay !== undefined, null, { timeout: 8000 });

      const published = await reopened.page.evaluate(() => window.top.__publishedLay);

      check("★ Publish 된 content 의 canvas 가 그대로",
        published && same(canvasOf(published.regions), CANVAS_REGION.canvas),
        JSON.stringify(published && canvasOf(published.regions)));

      check("★ Save → 다시 열기 → Publish 세 단계 모두 baseHeight 1600 (844 로 안 돌아간다)",
        canvasOf(saved.regions).baseHeight === 1600 &&
        canvasOf(await draftRegions(reopened.page)).baseHeight === 1600 &&
        canvasOf(published.regions).baseHeight === 1600);

      /*
        ★ 공개 resolve — 발행된 그 SkinPackage 를 실제
        resolveSkinTemplate() 에 넣어 "공개 화면이 받을 재료"를 만든다.
        Studio 문서가 공개 화면과 **같은 파일**을 로드하고 있으므로
        여기서 그대로 부를 수 있다.
      */
      const resolved = await reopened.page.evaluate((pkg) => {
        const home = window.resolveSkinTemplate(pkg, "home");
        const category = window.resolveSkinTemplate(pkg, "category");
        return {
          keys: Object.keys(home).sort(),
          canvas: home.canvas || null,
          categoryHasCanvas: category.canvas !== undefined
        };
      }, published);

      check("★ 발행된 스킨의 공개 resolve 에 실행용 canvas 가 실린다",
        resolved.canvas &&
        resolved.canvas.version === 1 &&
        resolved.canvas.baseWidth === 390 &&
        resolved.canvas.baseHeight === 1600 &&
        resolved.canvas.elements.length === 2,
        JSON.stringify(resolved.keys));

      check("★ 실행용 payload 에는 모르는 칸이 없다(보존용 원본과 다르다)",
        resolved.canvas.futureCanvasField === undefined &&
        resolved.canvas.elements[0].futureElementField === undefined &&
        Object.keys(resolved.canvas.elements[0].props).join() === "slot");

      check("CATEGORY 에는 싣지 않는다", resolved.categoryHasCanvas === false);

      await reopened.context.close();
      await context.close();

    }


    /* ------------------------------------------------- */
    if (wants("ai")) {

      section("ai");

      const { context, page } = await openStudio(browser, { ai: true });

      await page.click("#studioAiToggleButton");
      await page.waitForSelector("#studioAiDrawerInput", { timeout: 5000 });
      await page.fill("#studioAiDrawerInput", "글씨 색을 조금 바꿔줘");
      await page.click("#studioAiDrawerSend");

      await page.waitForFunction(
        () => /imory-ai canvas fixture/.test(currentWorkingSkin.css || ""),
        null, { timeout: 15000 }
      );

      check("★ AI 수정 뒤에도 canvas 가 그대로(요소도 모르는 칸도)",
        same(canvasOf(await draftRegions(page)), CANVAS_REGION.canvas),
        JSON.stringify(canvasOf(await draftRegions(page))));

      check("AI 수정 뒤에도 모르는 region 이 자리 그대로",
        same((await draftRegions(page))[0], CANVAS_SKIN.regions[0]));

      await context.close();

      /*
        ★ 이미 저장된 canvas 가 깨져 있어도 AI 수정을 막지 않는다.
          그 경우의 계약은 "삭제하지 않고 fallback" 이지 "막기" 가
          아니다(계약 문서 §9 · skin-package-import.js canvasSource).
      */
      const brokenSkin = clone(CANVAS_SKIN);
      brokenSkin.regions[1].canvas.elements[0].width = -1;

      const broken = await openStudio(browser, { ai: true, skin: brokenSkin });

      await broken.page.click("#studioAiToggleButton");
      await broken.page.waitForSelector("#studioAiDrawerInput", { timeout: 5000 });
      await broken.page.fill("#studioAiDrawerInput", "글씨 색을 조금 바꿔줘");
      await broken.page.click("#studioAiDrawerSend");

      await broken.page.waitForFunction(
        () => /imory-ai canvas fixture/.test(currentWorkingSkin.css || ""),
        null, { timeout: 15000 }
      );

      check("★ 이미 깨진 canvas 가 AI 수정 전체를 막지 않는다",
        same(canvasOf(await draftRegions(broken.page)), brokenSkin.regions[1].canvas),
        JSON.stringify(canvasOf(await draftRegions(broken.page))));

      check("깨진 canvas 는 실행되지 않는다(공개 resolve 에 키 없음)",
        await broken.page.evaluate(() =>
          window.resolveSkinTemplate(currentWorkingSkin, "home").canvas === undefined));

      await broken.context.close();

    }


    /* ------------------------------------------------- */
    if (wants("v2")) {

      section("v2");

      const { context, page, errors } = await openStudio(browser, { skin: V2_SKIN, ai: true });

      check("여는 순간의 draft 에 v2 canvas 가 그대로(모르는 칸 다섯 곳 포함)",
        same(canvasOf(await draftRegions(page)), V2_REGION.canvas),
        JSON.stringify(canvasOf(await draftRegions(page))));

      check("★ 유효한 v2 도 아직 그려지지 않는다(공개 resolve 에 canvas 키 없음 = 기존 HOME fallback)",
        await page.evaluate(() =>
          window.resolveSkinTemplate(currentWorkingSkin, "home").canvas === undefined));

      check("그래도 표시 위치는 Preview 문서에 살아 있다",
        (await previewHasCanvasRoot(page)) === 1);

      /* 잘못된 v2 — 정확한 경로와 함께 거부 */
      const badBlock = clone(V2_SKIN);
      badBlock.regions[1].canvas.flow.blocks[2].width = -3;

      let r = await importJson(page, JSON.stringify(badBlock));

      check("★ 잘못된 블록은 거부되고 **필드 경로**를 보여 준다",
        r.isError && !r.canApply &&
        r.message.includes("regions[1].canvas.flow.blocks[2].width"),
        r.message);

      const badPrimary = clone(V2_SKIN);
      badPrimary.regions[1].canvas.flow.blocks[4].props.primaryId = "canvas_m0paper";

      r = await importJson(page, JSON.stringify(badPrimary));

      check("★ primaryId 가 사진이 아니면 거부(경로는 props.primaryId)",
        r.isError && !r.canApply &&
        r.message.includes("regions[1].canvas.flow.blocks[4].props.primaryId"),
        r.message);

      const dupId = clone(V2_SKIN);
      dupId.regions[1].canvas.overlays[0].id = "canvas_b3title";

      r = await importJson(page, JSON.stringify(dupId));

      check("★ 블록 id 와 overlay id 가 부딪히면 거부(한 이름 공간)",
        r.isError && !r.canApply &&
        r.message.includes("regions[1].canvas.overlays[0].id"),
        r.message);

      const withElements = clone(V2_SKIN);
      withElements.regions[1].canvas.elements = [];

      r = await importJson(page, JSON.stringify(withElements));

      check("★ v2 에 최상위 elements 가 있으면 거부(v1 writer 가 닿을 길을 막는다)",
        r.isError && !r.canApply &&
        r.message.includes("regions[1].canvas.elements"),
        r.message);

      check("거부된 Import 는 draft 를 바꾸지 않았다(원래 값 그대로)",
        same(canvasOf(await draftRegions(page)), V2_REGION.canvas));

      /* 고친 v2 를 넣는다 — Save 를 일으키려면 dirty 여야 하므로 css 도 바꾼다 */
      const edited = clone(V2_SKIN);
      edited.css = ".hc-home { padding: 12px; }";
      edited.regions[1].canvas.baseHeight = 2400;
      edited.regions[1].canvas.flow.blocks.push({
        id: "canvas_b6note",
        type: "text",
        width: 300,
        height: "auto",
        align: "left",
        margin: { top: -8 },
        props: { text: "an added block", role: "caption" }
      });

      r = await importJson(page, JSON.stringify(edited));
      check("고친 v2 파일이 Import 된다", !r.isError && r.canApply, r.message);

      await page.click(".import-editor-button--primary");
      await page.waitForTimeout(600);

      check("★ 적용된 v2 가 draft 에 그대로(새 블록 · 음수 margin · 2400 포함)",
        same(canvasOf(await draftRegions(page)), edited.regions[1].canvas),
        JSON.stringify(canvasOf(await draftRegions(page))));

      /* Export */
      const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
      await page.click("#studioExportButton");
      const download = await downloadPromise;
      const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));

      check("★ Export 파일의 v2 canvas 가 한 칸도 빠지지 않는다",
        same(canvasOf(exported.regions), edited.regions[1].canvas),
        JSON.stringify(canvasOf(exported.regions)));

      /* Save */
      await page.evaluate(() => { window.top.__savedDraftCallsLay = []; });
      await page.click("#studioSaveButton");
      await page.waitForFunction(() => (window.top.__savedDraftCallsLay || []).length > 0, null, { timeout: 8000 });

      const saved = await page.evaluate(() => {
        const calls = window.top.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      check("★ Save payload 의 v2 canvas 가 그대로",
        same(canvasOf(saved.regions), edited.regions[1].canvas),
        JSON.stringify(canvasOf(saved.regions)));

      /* 저장한 content 로 다시 열고 Publish */
      const reopened = await openStudio(browser, { skin: saved });

      check("★ 다시 열어도 v2 canvas 가 그대로",
        same(canvasOf(await draftRegions(reopened.page)), edited.regions[1].canvas));

      await reopened.page.evaluate(() => {
        window.top.__savedDraftCallsLay = [];
        window.top.__publishedLay = undefined;
      });

      const r2 = await importJson(reopened.page, JSON.stringify(
        Object.assign(clone(saved), { css: ".hc-home { padding: 16px; }" })
      ));
      check("Publish 전 Save 를 일으킬 Import 통과", !r2.isError && r2.canApply, r2.message);
      await reopened.page.click(".import-editor-button--primary");
      await reopened.page.waitForTimeout(600);

      await reopened.page.click("#studioSaveButton");
      await reopened.page.waitForFunction(() => (window.top.__savedDraftCallsLay || []).length > 0, null, { timeout: 8000 });
      await reopened.page.waitForFunction(() => !document.getElementById("studioPublishButton").disabled, null, { timeout: 8000 });
      await reopened.page.click("#studioPublishButton");
      await reopened.page.click(".studio-confirm-button--primary");
      await reopened.page.waitForFunction(() => window.top.__publishedLay !== undefined, null, { timeout: 8000 });

      const published = await reopened.page.evaluate(() => window.top.__publishedLay);

      check("★ Publish 된 content 의 v2 canvas 가 그대로",
        published && same(canvasOf(published.regions), edited.regions[1].canvas),
        JSON.stringify(published && canvasOf(published.regions)));

      check("★ 발행된 v2 스킨도 공개 resolve 에 canvas 키가 없다(렌더러가 아직 없다)",
        await reopened.page.evaluate((pkg) =>
          window.resolveSkinTemplate(pkg, "home").canvas === undefined, published));

      await reopened.context.close();

      /* AI — 서버가 regions 를 그대로 돌려줄 때 v2 를 잃지 않는가 */
      await page.click("#studioAiToggleButton");
      await page.waitForSelector("#studioAiDrawerInput", { timeout: 5000 });
      await page.fill("#studioAiDrawerInput", "글씨 색을 조금 바꿔줘");
      await page.click("#studioAiDrawerSend");

      await page.waitForFunction(
        () => /imory-ai canvas fixture/.test(currentWorkingSkin.css || ""),
        null, { timeout: 15000 }
      );

      check("★ AI 수정 뒤에도 v2 canvas 가 그대로(블록도 프레임 내부도 모르는 칸도)",
        same(canvasOf(await draftRegions(page)), edited.regions[1].canvas),
        JSON.stringify(canvasOf(await draftRegions(page))));

      check("페이지 오류 없음", errors.length === 0, errors.join(" | "));

      await context.close();

    }


    /* ------------------------------------------------- */
    if (wants("legacy")) {

      section("legacy");

      const { context, page, errors } = await openStudio(browser, { skin: PLAIN_SKIN });

      check("캔버스가 없는 스킨의 Preview 에 표시 위치 0개",
        (await previewHasCanvasRoot(page)) === 0);

      check("★ 공개 resolve 에 canvas 키조차 없다(기존 스킨 회귀)",
        await page.evaluate(() =>
          JSON.stringify(Object.keys(window.resolveSkinTemplate(currentWorkingSkin, "home")).sort()) ===
          JSON.stringify(["css", "html", "js"])));

      const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
      await page.click("#studioExportButton");
      const download = await downloadPromise;
      const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));

      check("Export 의 regions 는 여전히 빈 배열", same(exported.regions, []));

      const r = await importJson(page, JSON.stringify(exported));
      check("캔버스가 없는 파일도 지금까지처럼 Import 된다", !r.isError && r.canApply, r.message);

      await closeImport(page);

      check("페이지 오류 없음", errors.length === 0, errors.join(" | "));

      await context.close();

    }

  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    console.log("실패:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }

}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
