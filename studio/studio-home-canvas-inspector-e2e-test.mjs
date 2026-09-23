/* =========================================================
   HOME CANVAS — 왼쪽 Canvas Inspector E2E
   (HOME-CANVAS-INSPECTOR-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §22
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14-15 (PLAN)

   ★ 이번 단계가 소유하는 것은 **왼쪽 패널 한 화면**이다.

   그래서 이 파일이 매번 다시 보는 것은 셋이다.

     1  누가 그 자리의 주인인가 — template 팝오버와 Canvas 패널이
        **동시에** 보이지 않는가
     2  고친 값이 계약대로 저장되는가 — 그 칸 하나만, 나머지는
        한 글자도 그대로
     3  한 번의 편집이 Undo **한 칸**인가

   ── 왜 JSON 으로 재는가 ─────────────────────────────────
   화면 픽셀은 도화지 폭 · 배율에 따라 달라진다. 계약이 말하는
   것은 390 자 위의 숫자와 `props` 의 문자열이므로, 재는 값도
   그것이다(이동 e2e 와 같은 규칙).

   ── 왜 middleware 를 그대로 태우는가 ────────────────────
   sandbox 프레임의 CSP 위반 0 을 재려면 **배포되는 그 헤더**가
   있어야 한다(nonce 주입 포함).

   [panel]    패널 라우팅 — 타입별 화면 · template 과의 소유권 ·
              빈 곳 · 다중 선택 · Select 종료 · HOME 이외 화면
   [text]     글자 — 여러 줄 · 평문 · Undo 한 칸 · Escape ·
              변화 없음 · Save 중 최신값 · geometry 불변 ·
              chrome 재측정
   [geometry] 숫자 칸 — 음수 · auto · rotation 정규화 · 거부 ·
              Undo 한 칸 · 직접 조작 · Undo/Redo 뒤 갱신 · 보존
   [round]    Save → 다시 열기 · Export → Import · Publish resolve
   [v2]       v2 블록 — 선택 · 흐름 칸 · 순서 · 글자 · main_visual 진입
   [v2free]   v2 프레임 내부(transform · pin) · overlay 의 자리 · 크기 ·
              각도 — 패널 입력과 직접 조작이 **같은 자**인가 ·
              끈 픽셀 = 다시 그려진 픽셀 · pin 은 offset 으로 저장 ·
              390px · native ↔ sandbox · v1 직접 조작 회귀
              (HOME-CANVAS-V2-EDITOR-1B)
   [v2add]    v2 재료 추가 — 흐름 다섯 · 자유 장식 · main_visual 과
              primary 사진 · 빈 이미지 슬롯 · 즉시 선택 · Undo 한 칸 ·
              왕복 · 블록의 손잡이 (HOME-CANVAS-V2-ADD-1)
   [v2elements] 소속과 따라가기 — 추가 → 배치 → 묶기 → 프레임 크기
              변경 → 빼기 → Undo/Redo 한 길 · 프레임의 페이지 자리
              보고 · pin 의 기준 셋 · primary 거부 · 삭제 ·
              native ↔ sandbox (HOME-CANVAS-V2-ELEMENTS-1)
   [v2fix]    수동 테스트에서 나온 표시 · 편집 문제 다섯
              (HOME-CANVAS-V2-MANUAL-FIX-1)
   [v2resp]   선택 틀 · 겹침 · 화면별 크기
              (HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1)
   [layers]   왼쪽 Layers 패널 — 트리 순서 = draft 배열 순서 · 선택
              하나 · 접기/펼치기 · 행의 단추 (STUDIO-LAYERS-SHELL-1 ·
              STUDIO-LAYERS-STRUCTURE-1)
   [layerstruct] Layers 의 구조 관리 — 세 배열의 순서 drag · 금지된
              drop · 묶기/빼기 drop(자리 유지) · 대표 사진 · 숨김 ·
              잠금(Preview hit-test) · 삭제 · Undo/Redo ·
              Save → 다시 열기 · 390px 길게 누르기 · 다중 선택 거부 ·
              native ↔ sandbox (STUDIO-LAYERS-STRUCTURE-1)
   [sandbox]  별도 origin 프레임에서 같은 결과 + CSP 위반 0

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-inspector-e2e-test.mjs
     node studio/studio-home-canvas-inspector-e2e-test.mjs --only=text
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 9004;
const SANDBOX_PORT = 9005;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html?scenario=lay";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = argOf("only", "");

const wants = (name) => !ONLY || ONLY.split(",").map((n) => n.trim()).includes(name);
const section = (name) => console.log(`\n[${name}]`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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


/* =========================================================
   playwright
========================================================== */

async function loadPlaywright() {
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
    try { version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0"; } catch { /* 낮게 */ }
    found.push({ entry, version });
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  const tried = [];
  for (const { entry, version } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod.chromium) continue;
    try {
      const probe = await mod.chromium.launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }
  throw new Error(`playwright chromium 을 실행할 수 없습니다.\n  - ${tried.join("\n  - ") || "없음"}`);
}


/* =========================================================
   정적 서버 — 배포되는 middleware 를 그대로 태운다
========================================================== */

const middleware = await import(
  pathToFileURL(path.join(ROOT, "functions", "_middleware.js")).href
);

const FUNCTION_ENV = {
  SANDBOX_SKIN_HOST: `localhost:${SANDBOX_PORT}`,
  SANDBOX_SKIN_PARENT_ORIGINS: PARENT_ORIGIN
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2"
};

const FIXTURE_IMAGE_PATH = "/__canvas-inspector-fixture__/swatch.svg";
const FIXTURE_IMAGE_URL = PARENT_ORIGIN + FIXTURE_IMAGE_PATH;
const FIXTURE_IMAGE_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
  '<rect width="80" height="80" fill="#c9803f"/></svg>';


function staticResponse(pathname, search) {

  let rel = decodeURIComponent(pathname);

  if (rel === FIXTURE_IMAGE_PATH) {
    return new Response(FIXTURE_IMAGE_BODY, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  const query = search || "";

  if (rel.endsWith("/index.html")) {
    return new Response(null, {
      status: 308,
      headers: { "Location": rel.slice(0, -"index.html".length) + query }
    });
  }

  if (rel.endsWith(".html")) {
    return new Response(null, {
      status: 308,
      headers: { "Location": rel.slice(0, -".html".length) + query }
    });
  }

  if (rel.endsWith("/")) rel += "index.html";

  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + ".html"))) {
    rel += ".html";
  }

  const abs = path.join(ROOT, rel);

  if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return new Response(fs.readFileSync(abs), {
      status: 200,
      headers: {
        "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  return new Response(fs.readFileSync(path.join(ROOT, "index.html")), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
  });

}


function startServer(port) {

  const server = http.createServer(async (req, res) => {

    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url, `http://${host}`);

    let response;

    try {
      response = await middleware.onRequest({
        request: new Request(url.toString(), { method: req.method }),
        env: FUNCTION_ENV,
        next: async () => staticResponse(url.pathname, url.search)
      });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String((err && err.stack) || err));
      return;
    }

    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });

    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);

  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));

}


/* =========================================================
   fixture — 여섯 종류가 **전부** 있다

   패널이 타입마다 다른 화면을 그리므로, 하나라도 빠지면 그 타입의
   화면은 아무도 보지 않은 채 배포된다.

     cvText    height:"auto" 인 글자. 이 파일의 주인공.
               `zzz` 는 **우리가 모르는 요소 필드**이고
               `props.mystery` 는 **모르는 props 필드**다(§22-5 보존).
     cvFixed   숫자 height 인 글자 — 줄이 늘면 내용이 상자를 넘는다.
               chrome 재측정 절이 이것을 쓴다.
     cvPhoto · cvLogo · cvSticker · cvNav · cvShape
               타입별 화면의 대조군.
     cvLocked  잠긴 요소 — 패널이 열리지 않아야 한다.
========================================================== */

const HOME_HTML =
  '<div class="hc-home">' +
  '<p class="hc-outside">도화지 밖 요소</p>' +
  '<div class="hc-canvas" data-imory-canvas-root></div>' +
  '<div class="hc-gap"></div>' +
  "</div>";

const CANVAS_ELEMENTS = [
  { id: "cvText", type: "text", x: 20, y: 40, width: 200, height: "auto",
    rotation: 0, hidden: false, locked: false,
    props: { text: "한 줄", role: "title", mystery: "keep-props" },
    zzz: { keep: "unknown-field" } },

  { id: "cvFixed", type: "text", x: 20, y: 140, width: 160, height: 24,
    rotation: 0, hidden: false, locked: false,
    props: { text: "고정 높이", role: "body" } },

  { id: "cvPhoto", type: "photo", x: 230, y: 40, width: 120, height: 90,
    rotation: 0, hidden: false, locked: false, props: { slot: "photo_1" } },

  { id: "cvLogo", type: "logo", x: 230, y: 150, width: 120, height: 60,
    rotation: 0, hidden: false, locked: false,
    props: { slot: "title_logo", fallback: "site_title" } },

  { id: "cvSticker", type: "sticker", x: 20, y: 240, width: 90, height: 90,
    rotation: 0, hidden: false, locked: false, props: { slot: "sticker_1" } },

  /* ★ 숫자 height 다. 이 시나리오에는 그 카테고리가 없어 목록이 비고,
     "auto" 면 상자가 0 이라 누를 수 없다. */
  { id: "cvNav", type: "category_nav", x: 20, y: 360, width: 200, height: 70,
    rotation: 0, hidden: false, locked: false,
    props: { mode: "selected", categoryIds: ["cat-a", "cat-b"] } },

  { id: "cvShape", type: "shape", x: 230, y: 250, width: 100, height: 100,
    rotation: 30, hidden: false, locked: false, props: { kind: "ellipse" } },

  { id: "cvLocked", type: "shape", x: 230, y: 380, width: 100, height: 60,
    rotation: 0, hidden: false, locked: true, props: { kind: "rect" } }
];

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진", required: false },
  { name: "title_logo", label: "로고", required: false },
  { name: "sticker_1", label: "스티커", required: false }
];

const CANVAS_CSS =
  /* ★ 위쪽 여백은 장식이 아니다. Studio 의 Top Dock 이 Preview 위에
     떠 있어서, 문서 맨 위(y≈0)에 있는 요소는 눌러도 그 막대가 먼저
     받는다 — 도화지 밖 요소를 그 아래로 내려 둔다. */
  ".hc-home { padding: 240px 0 0; margin: 0; }" +
  ".hc-canvas { width: 100%; }" +
  ".hc-gap { height: 200px; }" +
  ".hc-outside { margin: 0 0 8px; padding: 8px; background: #eee; }" +
  '[data-imory-canvas-type="text"] { font: 14px/1.5 Arial, sans-serif; }' +
  '[data-imory-canvas-type="shape"] { background: #d2b48c; }' +
  '[data-imory-canvas-type="sticker"] { background: #e8dcc8; }' +
  '[data-imory-canvas-type="category_nav"] { background: #dce8e2; }' +
  '[data-imory-canvas-type="photo"] { background: #efe3d2; }' +
  '[data-imory-canvas-type="logo"] { background: #e6e0f0; }' +
  /* v2 의 divider — 칠하지 않으면 4px 투명 상자라 손으로 누르기 어렵다 */
  '[data-imory-canvas-type="divider"] { background: #cdc3b6; }';


function skinPackage(options) {

  const o = options || {};

  const pkg = {
    schemaVersion: 1,
    templates: {
      home: { html: HOME_HTML },
      category: { html: '<div class="hc-category"><p class="hc-cat-mark">CATEGORY</p></div>' },
      post: { html: '<div class="hc-post"><div data-imory-region="post-body"></div></div>' },
      banner: { html: '<div class="hc-banner"></div>' }
    },
    css: CANVAS_CSS,
    imageSlots: IMAGE_SLOTS,
    regions: [
      /* 우리가 모르는 **다른 항목** — 패널이 이것을 지우면 안 된다 */
      { name: "some_other_region", enabled: true, payload: { keep: true } },
      {
        name: "home_canvas",
        enabled: true,
        note: "unknown-entry-field",
        canvas: {
          version: 1,
          baseWidth: 390,
          baseHeight: 844,
          extra: "unknown-canvas-field",
          elements: o.elements || CANVAS_ELEMENTS
        }
      }
    ],
    metadata: {}
  };

  if (o.sandbox) {
    pkg.renderMode = "sandbox";
  }

  return pkg;

}


/* =========================================================
   v2 fixture (HOME-CANVAS-V2-EDITOR-1A)

   블록 다섯이 §14-4 의 표를 한 번씩 밟는다 — logo · text · divider ·
   category_nav · main_visual. `main_visual` 안에는 사진과 장식이
   있어서 "한 번 클릭 → 프레임 / 한 번 더 → 안쪽"을 잴 수 있다.

     v2Text    글자 블록. 이 절의 주인공.
               `zzz` 는 **모르는 블록 필드**, `props.mystery` 는
               **모르는 props 필드**다(§25-1 보존).
     v2Main    main_visual — 그 안에 v2Photo(사진) · v2Paper(장식)
     v2Wide    align:"stretch" — 흐름 폭을 거의 다 쓴다(hit-test 가
               "페이지 전체 래퍼"로 떨어뜨리지 않는지 본다)
========================================================== */

const V2_BLOCKS = [
  { id: "v2Logo", type: "logo", width: 160, height: 48, align: "left",
    props: { slot: "title_logo", fallback: "site_title" } },

  { id: "v2Text", type: "text", width: 300, height: "auto", align: "center",
    margin: { top: 10, right: 0, bottom: 6, left: 0 },
    zzz: { keep: "unknown-block-field" },
    props: { text: "한 줄", role: "title", mystery: "keep-props" } },

  { id: "v2Rule", type: "divider", width: 120, height: 14, align: "center" },

  { id: "v2Wide", type: "category_nav", width: 342, height: 60, align: "stretch",
    props: { mode: "selected", categoryIds: ["cat-a"] } },

  { id: "v2Main", type: "main_visual", width: 300, height: 200, align: "center",
    margin: { top: 12, right: 0, bottom: 0, left: 0 },
    props: {
      baseWidth: 150, baseHeight: 100, primaryId: "v2Photo",
      elements: [
        { id: "v2Paper", type: "shape", follow: "transform",
          x: -5, y: 0, width: 150, height: 90, rotation: -4, props: { kind: "rect" } },
        { id: "v2Photo", type: "photo", follow: "transform",
          x: 10, y: 5, width: 120, height: 80, props: { slot: "photo_1" } },
        { id: "v2Tag", type: "text", follow: "pin", width: 60, height: 20,
          pin: { target: "photo", anchor: "right", origin: "left", offset: { x: 6, y: 0 } },
          props: { text: "tag", role: "label" } }
      ]
    } }
];

const V2_OVERLAYS = [
  { id: "v2Over", type: "text", x: 20, y: 700, width: 120, height: 40,
    rotation: 0, props: { text: "overlay", role: "label" } }
];


function v2Package(options) {

  const o = options || {};

  const pkg =
    skinPackage(o);

  const entry =
    pkg.regions.find((r) => r.name === "home_canvas");

  entry.canvas = {
    version: 2,
    baseWidth: 390,
    baseHeight: 1100,
    extra: "unknown-canvas-field",
    flow: {
      direction: "column",
      padding: { top: 40, right: 24, bottom: 40, left: 24 },
      gap: 10,
      blocks: JSON.parse(JSON.stringify(V2_BLOCKS))
    },
    overlays: JSON.parse(JSON.stringify(V2_OVERLAYS))
  };

  return pkg;

}


/*
  이 배포가 **모르는** version. 계약 §9-(3) 에 따라 파일은 통과하고
  보존되지만 실행되지 않는다 — 그러면 고를 요소도 없고 패널도 없다.
*/
function futurePackage() {

  const pkg =
    skinPackage({});

  const entry =
    pkg.regions.find((r) => r.name === "home_canvas");

  /*
    ★ 숫자는 **3** 이다. HOME-CANVAS-V2-DATA-1 부터 `version: 2` 는
      실제로 검증되는 조합형 Canvas 라, 그 숫자로는 "이 배포가 모르는
      version" 을 더 이상 만들 수 없다. 이 함수가 보려는 것은 그대로다
      — 실행되지 않는 canvas 에서는 고를 요소가 없다.
  */
  entry.canvas = {
    version: 3,
    baseWidth: 390,
    baseHeight: 844,
    elements: [{ id: "v3only", kind: "flow", something: "else" }]
  };

  return pkg;

}


/* =========================================================
   Studio 열기
========================================================== */

async function openStudio(browser, options) {

  const o = options || {};

  const errors = [];
  const consoleErrors = [];
  const canvasLogs = [];

  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 900 }
  });

  await ctx.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blockedURI: e.blockedURI
      });
    });
  });

  const page = await ctx.newPage();

  page.on("pageerror", (err) => errors.push(String(err.stack || err.message || err)));

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.text().indexOf("[studio-canvas]") !== -1) canvasLogs.push(msg.text());
  });

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    ([pkg, slots]) => {
      window.__scenarioLaySkinPackage = pkg;
      window.__scenarioLaySkinImageSlotValues = slots;
    },
    [
      o.package || skinPackage(o),
      [{ skin_id: "skin-lay1", slot_name: "photo_1", image_url: FIXTURE_IMAGE_URL }]
    ]
  );

  const flags =
    o.sandbox
      ? `&sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(SANDBOX_ORIGIN)}`
      : "";

  await page.goto(`${PARENT_ORIGIN}${STUDIO_PATH}${flags}`, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState &&
      window.getStudioAiWorkingState().hasWorkingSkin === true,
    null, { timeout: 25000 }
  );

  page.__ctx = ctx;
  page.__errors = errors;
  page.__consoleErrors = consoleErrors;
  page.__canvasLogs = canvasLogs;

  return page;

}


async function canvasFrame(page, sandbox, timeout = 15000) {

  const end = Date.now() + timeout;

  while (Date.now() < end) {

    const frame = page.frames().find((f) =>
      sandbox
        ? (f.url().startsWith(SANDBOX_ORIGIN) && !f.isDetached())
        : (f.url().indexOf("preview-frame") !== -1 && !f.isDetached()));

    if (frame) {
      const drawn = await frame
        .evaluate(() => !!document.querySelector("[data-imory-canvas-element]"))
        .catch(() => false);
      if (drawn) return frame;
    }

    await sleep(120);

  }

  throw new Error("캔버스를 그린 프레임을 찾지 못했습니다");

}


async function enableSelect(page) {

  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);

  if (!on) {

    const visible = await page.evaluate(() => {
      const b = document.getElementById("studioInspectorButton");
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
    });

    if (!visible && await page.locator("#studioTopDockHandle").isVisible().catch(() => false)) {
      await page.click("#studioTopDockHandle");
      await sleep(400);
    }

    await page.click("#studioInspectorButton");

  }

  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);

  await sleep(500);

}


async function enableCanvasEditing(page) {

  await enableSelect(page);

  await page.waitForFunction(
    () => window.studioCanvasEditingIsOn && window.studioCanvasEditingIsOn() === true,
    null, { timeout: 12000 }
  );

  await sleep(900);

}


/* =========================================================
   STUDIO-LAYERS-SHELL-1 — 재료 추가는 **Layers 패널 안**이다

   예전에는 Select 패널 맨 위였다. 이제 왼쪽 패널의 셋째 자리이고,
   그 안에서도 "＋ 재료 추가"를 눌러 펼쳐야 버튼들이 보인다
   (계획 문서 §3).

   ★ Preview 에서 요소를 누르면 왼쪽 패널이 Select 로 돌아간다
     (studio-shell.js revealStudioLeftPanelForSelection). 그래서
     추가 버튼을 만지기 직전마다 이 함수를 부른다 — 한 번 열어 두고
     계속 쓸 수 있다고 가정하지 않는다.
========================================================== */
async function openAddPanel(page) {

  await page.evaluate(() => {

    window.showStudioLeftPanelMode("layers");

    const toggle =
      document.getElementById("studioCanvasLayersAddToggle");

    if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
      toggle.click();
    }

  });

  await page.waitForSelector("#studioCanvasAdd", { state: "visible", timeout: 8000 });

}


/*
  addMaterial(page, target, type)

  Layers 를 열고 · 만들고 · **Select 로 돌아온다**.

  ★ production 은 만든 뒤에도 Layers 에 머문다(계획 문서 §3 — 속성을
    고치러 Select 로 옮기는 것은 사람이 하는 일이다). 이 파일의 기존
    단언들은 곧바로 Canvas Inspector 의 칸을 재므로, 그 전환을 여기서
    한 번에 해 둔다.
*/
async function addMaterial(page, target, type) {

  await openAddPanel(page);

  await page.click(`#studioCanvasAdd-${target}-${type}`);

  await page.evaluate(() => window.showStudioLeftPanelMode("select"));

}


/* =========================================================
   좌표 — native 는 부모에서, sandbox 는 중첩 프레임 좌표로
========================================================== */

async function nativeRects(page, selectors) {

  return page.evaluate((list) => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;

    const toParent = (r) => ({
      left: box.left + (bl + r.left) * scale,
      top: box.top + (bt + r.top) * scale,
      right: box.left + (bl + r.right) * scale,
      bottom: box.top + (bt + r.bottom) * scale,
      width: r.width * scale,
      height: r.height * scale
    });

    const out = {};

    list.forEach((sel) => {
      const el = doc.querySelector(sel);
      out[sel] = el ? toParent(el.getBoundingClientRect()) : null;
    });

    return out;

  }, selectors);

}


async function sandboxRects(page, frame, selectors) {

  const out = {};

  for (const sel of selectors) {

    const box =
      await frame.locator(sel).first().boundingBox().catch(() => null);

    out[sel] =
      box
        ? {
            left: box.x, top: box.y,
            right: box.x + box.width, bottom: box.y + box.height,
            width: box.width, height: box.height
          }
        : null;

  }

  return out;

}


const byId = (id) => `[data-imory-edit-id="${id}"]`;


async function bringIntoView(page, frame, sandbox, selector) {

  if (sandbox) {

    await frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.scrollIntoView({ block: "center", inline: "center" });
    }, selector);

  }
  else {

    await page.evaluate((sel) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(sel);
      if (!el) return;
      /* ★ scrollBy 가 아니라 scrollIntoView 다. 앞의 것은 "지금 자리에서
         얼마나" 라서 스크롤 담당 요소가 window 가 아니거나 그 사이에
         다시 그려지면 어긋난 만큼이 그대로 쌓인다 — v2 절에서 블록이
         화면 밖(-1600px)으로 밀려 클릭이 통째로 빗나갔다. */
      el.scrollIntoView({ block: "center", inline: "center" });
    }, selector);

  }

  await sleep(350);

}


async function clickSelector(page, frame, sandbox, selector, options) {

  const o = options || {};

  await bringIntoView(page, frame, sandbox, selector);

  const rects =
    sandbox
      ? await sandboxRects(page, frame, [selector])
      : await nativeRects(page, [selector]);

  const box =
    rects[selector];

  if (!box) throw new Error("요소를 찾지 못했습니다: " + selector);

  const x =
    box.left + box.width * (o.fx === undefined ? 0.5 : o.fx);

  const y =
    box.top + box.height * (o.fy === undefined ? 0.5 : o.fy);

  if (o.shift) await page.keyboard.down("Shift");

  await page.mouse.click(x, y);

  if (o.shift) await page.keyboard.up("Shift");

  await sleep(o.settle === undefined ? 600 : o.settle);

}


const clickElement = (page, frame, sandbox, id, options) =>
  clickSelector(page, frame, sandbox, byId(id), options);


/* =========================================================
   직접 조작 — 실제 포인터로 끈다 (HOME-CANVAS-V2-EDITOR-1B)

   ★ 형제 e2e(transform · resize · rotate)의 그 helper 들이다. 여기서
     쓰는 이유는 v2 의 패널 입력과 손 조작이 **같은 자**를 쓰는지
     한 자리에서 대조해야 하기 때문이다(계약 §26-2).
========================================================== */

async function rectsFor(page, frame, sandbox, ids) {

  const selectors = ids.map(byId);

  return sandbox
    ? sandboxRects(page, frame, selectors)
    : nativeRects(page, selectors);

}


const HANDLE_SELECTOR =
  '[data-imory-canvas-frame="1"] .moveable-control[data-direction]';

const ROTATION_SELECTOR =
  '[data-imory-canvas-frame="1"] .moveable-rotation-control';


/* 손잡이 여덟의 가운데 — 부모 화면 좌표로 */
async function handleCenters(page, frame, sandbox) {

  if (!sandbox) {

    return page.evaluate((selector) => {

      const f = document.getElementById("studioPreviewFrame");
      const doc = f.contentDocument;
      const box = f.getBoundingClientRect();
      const scale = box.width / (f.offsetWidth || box.width);
      const cs = getComputedStyle(f);
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0;

      const out = {};

      doc.querySelectorAll(selector).forEach((handle) => {

        const r = handle.getBoundingClientRect();

        out[handle.getAttribute("data-direction")] = {
          x: box.left + (bl + r.left + r.width / 2) * scale,
          y: box.top + (bt + r.top + r.height / 2) * scale
        };

      });

      return out;

    }, HANDLE_SELECTOR);

  }

  const out = {};

  for (const dir of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {

    const box =
      await frame
        .locator(`[data-imory-canvas-frame="1"] .moveable-control[data-direction="${dir}"]`)
        .first()
        .boundingBox()
        .catch(() => null);

    if (box) {
      out[dir] = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }

  }

  return out;

}


async function rotationHandle(page, frame, sandbox) {

  if (!sandbox) {

    return page.evaluate((selector) => {

      const f = document.getElementById("studioPreviewFrame");
      const doc = f.contentDocument;
      const handle = doc.querySelector(selector);

      if (!handle) return null;

      const box = f.getBoundingClientRect();
      const scale = box.width / (f.offsetWidth || box.width);
      const cs = getComputedStyle(f);
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0;
      const r = handle.getBoundingClientRect();

      return {
        x: box.left + (bl + r.left + r.width / 2) * scale,
        y: box.top + (bt + r.top + r.height / 2) * scale
      };

    }, ROTATION_SELECTOR);

  }

  const box =
    await frame.locator(ROTATION_SELECTOR).first().boundingBox().catch(() => null);

  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;

}


/* 한 번에 끌면 "끌지 않은 클릭"으로 보일 수 있다 — 몇 걸음에 나눈다 */
async function dragFrom(page, from, to, options) {

  const o = options || {};

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  const steps = o.steps || 8;

  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / steps),
      from.y + (to.y - from.y) * (i / steps)
    );
  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 800 : o.settle);

}


/*
  요소 가운데에서 (dx, dy) 만큼 — 본체 이동

  ★ `noView: true` 를 주면 **화면을 스크롤하지 않는다.**

  화면 픽셀로 "끈 만큼 다시 그려졌는가"를 재는 절에서는 제스처가
  스크롤을 건드리면 안 된다 — scrollIntoView 가 요소를 다시 가운데로
  옮기면 그 이동량이 그대로 측정값에 섞인다(실측: 24px 을 끌었는데
  -14px 로 읽혔다). 그 절은 재기 전에 한 번만 스크롤한다.
*/
async function dragElement(page, frame, sandbox, id, dx, dy, options) {

  if (!(options && options.noView)) {
    await bringIntoView(page, frame, sandbox, byId(id));
  }

  const box =
    (await rectsFor(page, frame, sandbox, [id]))[byId(id)];

  if (!box) throw new Error("요소를 찾지 못했습니다: " + id);

  const from = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2
  };

  await dragFrom(page, from, { x: from.x + dx, y: from.y + dy }, options);

  return box;

}


/* 손잡이 하나를 (dx, dy) 만큼 — 크기 */
async function dragHandle(page, frame, sandbox, id, dir, dx, dy, options) {

  if (!(options && options.noView)) {
    await bringIntoView(page, frame, sandbox, byId(id));
  }

  const handle =
    (await handleCenters(page, frame, sandbox))[dir];

  if (!handle) throw new Error(`손잡이를 찾지 못했습니다: ${id} ${dir}`);

  await dragFrom(
    page, handle, { x: handle.x + dx, y: handle.y + dy }, options);

}


/* 회전 손잡이를 **호**로 끈다(직선으로 끌면 중심 근처에서 각도가 튄다) */
async function rotateBy(page, frame, sandbox, id, deg, options) {

  const o = options || {};

  if (!o.noView) {
    await bringIntoView(page, frame, sandbox, byId(id));
  }

  const box =
    (await rectsFor(page, frame, sandbox, [id]))[byId(id)];

  const handle =
    await rotationHandle(page, frame, sandbox);

  if (!box || !handle) {
    throw new Error("회전 손잡이를 찾지 못했습니다: " + id);
  }

  const center = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2
  };

  const radius =
    Math.hypot(handle.x - center.x, handle.y - center.y);

  const start =
    Math.atan2(handle.y - center.y, handle.x - center.x);

  const steps = o.steps || 12;

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();

  for (let i = 1; i <= steps; i += 1) {

    const angle =
      start + (deg * Math.PI / 180) * (i / steps);

    await page.mouse.move(
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle)
    );

  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 800 : o.settle);

}


/* =========================================================
   읽기
========================================================== */

const readCanvas = (page) => page.evaluate(() => {

  if (typeof currentWorkingSkin === "undefined" || !currentWorkingSkin) {
    return null;
  }

  const entry =
    (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

  return entry ? JSON.parse(JSON.stringify(entry)) : null;

});


const readRegions = (page) => page.evaluate(() =>
  (typeof currentWorkingSkin !== "undefined" && currentWorkingSkin)
    ? JSON.stringify(currentWorkingSkin.regions)
    : null
);


const elementOf = (canvas, id) =>
  canvas ? canvas.canvas.elements.find((el) => el.id === id) || null : null;


const textOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el && el.props ? el.props.text : null;
};


const geometryOf = (canvas, id) => {
  const el = elementOf(canvas, id);
  return el
    ? { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation }
    : null;
};


/* ---- v2 (HOME-CANVAS-V2-EDITOR-1A) ---- */

const v2Blocks = (canvas) =>
  (canvas && canvas.canvas && canvas.canvas.flow) ? canvas.canvas.flow.blocks : [];

const v2BlockOf = (canvas, id) =>
  v2Blocks(canvas).find((b) => b && b.id === id) || null;

/* 블록 · 프레임 내부 · overlay 어디에 있든 찾는다 */
const v2NodeOf = (canvas, id) => {

  const block = v2BlockOf(canvas, id);

  if (block) {
    return block;
  }

  for (const b of v2Blocks(canvas)) {
    const inner = (b && b.props && b.props.elements) || [];
    const hit = inner.find((e) => e && e.id === id);
    if (hit) return hit;
  }

  const overlays = (canvas && canvas.canvas && canvas.canvas.overlays) || [];

  return overlays.find((e) => e && e.id === id) || null;

};

const v2OrderOf = (canvas) =>
  v2Blocks(canvas).map((b) => b.id).join(",");

const v2TextOf = (canvas, id) => {
  const node = v2NodeOf(canvas, id);
  return node && node.props ? node.props.text : null;
};


/* v2 패널이 지금 무엇을 보여 주는가 */
const readV2Panel = (page) => page.evaluate(() => {

  const textOfId = (id) => {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : null;
  };

  const valueOf = (field) => {
    const el = document.getElementById(`studioCanvasInspectorV2-${field}`);
    return el ? el.value : null;
  };

  const errorOf = (field) => {
    const el = document.getElementById(`studioCanvasInspectorError-${field}`);
    return el && !el.hidden ? el.textContent.trim() : "";
  };

  const align =
    document.getElementById("studioCanvasInspectorAlign");

  const auto =
    document.getElementById("studioCanvasInspectorV2Auto");

  const up =
    document.getElementById("studioCanvasInspectorOrderUp");

  const down =
    document.getElementById("studioCanvasInspectorOrderDown");

  const text =
    document.getElementById("studioCanvasInspectorText");

  return {
    title: textOfId("studioCanvasInspectorTitle"),
    meta: textOfId("studioCanvasInspectorMeta"),
    where: textOfId("studioCanvasInspectorWhere"),
    hasLayout: !!document.getElementById("studioCanvasInspectorV2Layout"),
    hasReadOnly: !!document.getElementById("studioCanvasInspectorV2Read"),
    /* HOME-CANVAS-V2-EDITOR-1B — 프레임 내부 요소 · overlay 의 다섯 칸 */
    hasFree: !!document.getElementById("studioCanvasInspectorV2Free"),
    /* v1 화면의 자리 — v2 에서는 없어야 한다 */
    hasV1Geometry: !!document.getElementById("studioCanvasInspectorGeometry"),
    hasText: !!text,
    textValue: text ? text.value : null,
    align: align ? align.value : null,
    alignOptions: align ? Array.from(align.options).map((o) => o.value) : null,
    auto: auto ? auto.checked : null,
    orderAt: textOfId("studioCanvasInspectorOrderAt"),
    upDisabled: up ? up.disabled : null,
    downDisabled: down ? down.disabled : null,
    heightDisabled: (() => {
      const el = document.getElementById("studioCanvasInspectorV2-height");
      return el ? el.disabled : null;
    })(),
    values: {
      width: valueOf("width"),
      height: valueOf("height"),
      top: valueOf("top"),
      right: valueOf("right"),
      bottom: valueOf("bottom"),
      left: valueOf("left")
    },
    errors: {
      width: errorOf("width"),
      height: errorOf("height"),
      top: errorOf("top"),
      align: errorOf("align"),
      order: errorOf("order"),
      text: errorOf("text")
    },
    canvasSelection: window.getStudioCanvasSelection().ids,
    primaryId: window.getStudioCanvasSelection().primaryId
  };

});


/* ---- v2 프레임 내부 · overlay 의 자리 (HOME-CANVAS-V2-EDITOR-1B) ---- */

/*
  지금 선택의 **자**와 패널의 다섯 칸.

  ★ 자는 Studio 가 계산한 그것을 그대로 읽는다(window.studioCanvasV2Space).
    테스트가 프레임 폭을 다시 계산하면 그 계산이 맞는지 물어볼 수 없다 —
    대신 **화면 좌표**로 대조한다(아래 screenBox).
*/
const readV2Free = (page) => page.evaluate(() => {

  const valueOf = (field) => {
    const el = document.getElementById(`studioCanvasInspectorV2-${field}`);
    return el ? el.value : null;
  };

  const sel =
    window.getStudioCanvasSelection();

  const space =
    (sel.primaryId && typeof window.studioCanvasV2Space === "function")
      ? window.studioCanvasV2Space(sel.primaryId)
      : null;

  const caption =
    document.querySelector("#studioCanvasInspectorV2Free .studio-inspector-block-label");

  return {
    ids: sel.ids,
    primaryId: sel.primaryId,
    hasFree: !!document.getElementById("studioCanvasInspectorV2Free"),
    hasRead: !!document.getElementById("studioCanvasInspectorV2Read"),
    hasBlockLayout: !!document.getElementById("studioCanvasInspectorV2Layout"),
    caption: caption ? caption.textContent.trim() : null,
    autoNote: !!document.getElementById("studioCanvasInspectorV2AutoNote"),
    heightDisabled: (() => {
      const el = document.getElementById("studioCanvasInspectorV2-height");
      return el ? el.disabled : null;
    })(),
    values: {
      x: valueOf("x"),
      y: valueOf("y"),
      width: valueOf("width"),
      height: valueOf("height"),
      rotation: valueOf("rotation")
    },
    space: space
  };

});


/* 그 요소가 지금 **화면에서** 어디에 그려져 있나(부모 좌표) */
const screenBox = async (page, frame, sandbox, id) => {

  const box =
    (await rectsFor(page, frame, sandbox, [id]))[byId(id)];

  return box || null;

};


/* v2 숫자 칸에 값을 넣고 확정한다(Enter) */
async function typeV2Number(page, field, value) {

  const sel = `#studioCanvasInspectorV2-${field}`;

  await page.focus(sel);

  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.setSelectionRange(0, el.value.length);
  }, sel);

  await page.keyboard.press("Delete");

  await page.keyboard.type(String(value), { delay: 10 });

  await page.keyboard.press("Enter");

  /* ★ 확정한 뒤 포커스를 놓는다. 다음 typeV2Number 가 잠긴 칸을
     겨냥하면 Playwright 는 포커스를 옮기지 못하고, 그러면 글자가
     **이 칸에** 그대로 이어 붙는다(실제로 -8 이 -890 이 됐다). */
  await page.evaluate((f) => {
    const el = document.querySelector(f);
    if (el) el.blur();
  }, sel);

  await sleep(350);

}


/* 왼쪽 패널이 지금 무엇을 보여 주고 있는가 — DOM 그대로 읽는다 */
const readPanel = (page) => page.evaluate(() => {

  const seen = (id) => {
    const el = document.getElementById(id);
    return !!(el && !el.hidden && el.getClientRects().length);
  };

  const textOfId = (id) => {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : null;
  };

  const rows =
    Array.from(
      document.querySelectorAll("#studioCanvasInspector .studio-canvas-inspector-read")
    ).map((row) => row.textContent.trim());

  const errorOf = (field) => {
    const el = document.getElementById(`studioCanvasInspectorError-${field}`);
    return el && !el.hidden ? el.textContent.trim() : "";
  };

  const valueOf = (field) => {
    const el = document.getElementById(`studioCanvasInspector-${field}`);
    return el ? el.value : null;
  };

  const text =
    document.getElementById("studioCanvasInspectorText");

  return {
    canvasPanel: seen("studioCanvasInspector"),
    popover: seen("studioInspectorPopover"),
    hint: (() => {
      const el = document.getElementById("studioLeftPanelSelectEmpty");
      if (!el) return false;
      return getComputedStyle(el).display !== "none";
    })(),
    title: textOfId("studioCanvasInspectorTitle"),
    meta: textOfId("studioCanvasInspectorMeta"),
    rows: rows,
    hasText: !!text,
    textValue: text ? text.value : null,
    textMax: text ? text.maxLength : null,
    hasGeometry: !!document.getElementById("studioCanvasInspectorGeometry"),
    hasAuto: !!document.getElementById("studioCanvasInspectorAuto"),
    autoChecked: (() => {
      const el = document.getElementById("studioCanvasInspectorAuto");
      return el ? el.checked : null;
    })(),
    heightDisabled: (() => {
      const el = document.getElementById("studioCanvasInspector-height");
      return el ? el.disabled : null;
    })(),
    multiNote: textOfId("studioCanvasInspectorMultiNote"),
    imageNote: textOfId("studioCanvasInspectorImageNote"),
    navNote: textOfId("studioCanvasInspectorNavNote"),
    shapeNote: textOfId("studioCanvasInspectorShapeNote"),
    values: {
      x: valueOf("x"),
      y: valueOf("y"),
      width: valueOf("width"),
      height: valueOf("height"),
      rotation: valueOf("rotation")
    },
    errors: {
      x: errorOf("x"),
      y: errorOf("y"),
      width: errorOf("width"),
      height: errorOf("height"),
      rotation: errorOf("rotation"),
      text: errorOf("text")
    },
    state: window.getStudioCanvasInspectorState
      ? window.getStudioCanvasInspectorState()
      : null,
    inspectorSelection: (() => {
      const hit = window.getStudioInspectorSelection();
      return hit ? hit.editId : null;
    })(),
    canvasSelection: window.getStudioCanvasSelection().ids
  };

});


const historyState = (page) =>
  page.evaluate(() =>
    window.getStudioHistoryState ? window.getStudioHistoryState() : null);


const frameState = (frame) =>
  frame.evaluate(() =>
    (typeof window.__imoryCanvasFrameState === "function")
      ? window.__imoryCanvasFrameState()
      : null);


const cspViolations = (frame) =>
  frame.evaluate(() => (window.__cspViolations || []).slice());


/* 프레임이 그린 글자 — 평문인가 HTML 인가 */
const drawnText = (page, frame, sandbox, id) => {

  const run = (sel) => {
    const el = document.querySelector(sel);
    const body = el ? el.querySelector("[data-imory-canvas-text]") : null;
    return body
      ? { text: body.textContent, html: body.innerHTML, bold: body.querySelectorAll("b").length }
      : null;
  };

  return sandbox
    ? frame.evaluate(run, byId(id))
    : page.evaluate((sel) => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        const el = doc.querySelector(sel);
        const body = el ? el.querySelector("[data-imory-canvas-text]") : null;
        return body
          ? { text: body.textContent, html: body.innerHTML, bold: body.querySelectorAll("b").length }
          : null;
      }, byId(id));

};


/* textarea 에 실제로 글자를 친다(포커스 → 지우기 → 입력) */
async function typeText(page, value, options) {

  const o = options || {};

  await page.focus("#studioCanvasInspectorText");

  await page.evaluate(() => {
    const el = document.getElementById("studioCanvasInspectorText");
    el.setSelectionRange(0, el.value.length);
  });

  await page.keyboard.press("Delete");

  await page.keyboard.type(value, { delay: o.delay === undefined ? 12 : o.delay });

  await sleep(250);

  /* ★ 세션을 닫는다. 한 칸의 기록은 blur 에서 확정되므로(계약 §22-4)
     이것 없이 Undo 를 세면 항상 0 이다 — 실제 사용에서도 사용자는
     다른 곳을 눌러 빠져나온다. */
  if (!o.keepFocus) {
    await page.evaluate(() => {
      const el = document.getElementById("studioCanvasInspectorText");
      if (el) el.blur();
    });
  }

  await sleep(o.settle === undefined ? 500 : o.settle);

}


/* 숫자 칸 한 번 고치기 — Enter 로 확정하고 blur 까지 간다 */
async function typeNumber(page, field, value, options) {

  const o = options || {};

  const sel = `#studioCanvasInspector-${field}`;

  await page.focus(sel);

  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.setSelectionRange(0, el.value.length);
  }, sel);

  await page.keyboard.press("Delete");

  if (value !== "") {
    await page.keyboard.type(String(value), { delay: 10 });
  }

  if (o.escape) {
    await page.keyboard.press("Escape");
  } else {
    await page.keyboard.press("Enter");
  }

  await sleep(200);

  /* blur 까지 간다 — 확정은 Enter 가 했고, 세션도 닫아야 다음 절이
     깨끗하다 */
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.blur();
  }, sel);

  await sleep(o.settle === undefined ? 500 : o.settle);

}


const close = async (page) => {
  await page.__ctx.close().catch(() => {});
};


/* =========================================================
   실행
========================================================== */

async function main() {

  const pw = await loadPlaywright();

  const servers = [
    await startServer(PARENT_PORT),
    await startServer(SANDBOX_PORT)
  ];

  const browser = await pw.chromium.launch();

  try {

    /* ======================================================
       [panel] — 누가 그 자리의 주인인가
    ====================================================== */
    if (wants("panel")) {

      section("panel");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const idle = await readPanel(page);

      check("아무것도 고르지 않으면 Canvas 패널이 없고 안내가 보인다",
        idle.canvasPanel === false && idle.popover === false && idle.hint === true,
        JSON.stringify({ c: idle.canvasPanel, p: idle.popover, h: idle.hint }));

      /* --- text --- */

      await clickElement(page, frame, false, "cvText");

      const textPanel = await readPanel(page);

      check("Canvas 글자를 고르면 Canvas Inspector 가 열린다",
        textPanel.canvasPanel === true && textPanel.title === "Canvas 글자",
        String(textPanel.title));

      check("제목은 종류 이름이고 id 는 보조 줄이다",
        textPanel.meta === "Canvas · cvText" &&
        textPanel.title.indexOf("cvText") === -1,
        String(textPanel.meta));

      check("글자에는 textarea 와 geometry 가 함께 있다",
        textPanel.hasText === true && textPanel.hasGeometry === true &&
        textPanel.textValue === "한 줄",
        JSON.stringify({ t: textPanel.hasText, g: textPanel.hasGeometry }));

      check("template 팝오버는 닫혀 있고 안내도 물러난다",
        textPanel.popover === false && textPanel.hint === false);

      check("선택 소유자 둘이 동시에 켜지지 않는다",
        textPanel.inspectorSelection === null &&
        JSON.stringify(textPanel.canvasSelection) === JSON.stringify(["cvText"]),
        JSON.stringify(textPanel.canvasSelection));

      check("auto 높이 요소에는 Auto 스위치가 있고 숫자 칸이 잠긴다",
        textPanel.hasAuto === true && textPanel.autoChecked === true &&
        textPanel.heightDisabled === true,
        JSON.stringify({ a: textPanel.hasAuto, c: textPanel.autoChecked }));

      /* --- photo --- */

      await clickElement(page, frame, false, "cvPhoto");

      const photoPanel = await readPanel(page);

      check("Canvas 사진 — 슬롯 이름과 Images 안내",
        photoPanel.title === "Canvas 사진" &&
        photoPanel.rows.join("|").indexOf("photo_1") !== -1 &&
        photoPanel.imageNote === "이미지는 Images에서 변경합니다.",
        JSON.stringify(photoPanel.rows));

      check("사진에는 글자 입력칸이 없다",
        photoPanel.hasText === false && photoPanel.hasAuto === false);

      /* --- logo --- */

      await clickElement(page, frame, false, "cvLogo");

      const logoPanel = await readPanel(page);

      check("Canvas 로고 — 슬롯 · 대체 표시 · Images 안내",
        logoPanel.title === "Canvas 로고" &&
        logoPanel.rows.join("|").indexOf("title_logo") !== -1 &&
        logoPanel.rows.join("|").indexOf("블로그 제목") !== -1 &&
        !!logoPanel.imageNote,
        JSON.stringify(logoPanel.rows));

      /* --- sticker --- */

      await clickElement(page, frame, false, "cvSticker");

      const stickerPanel = await readPanel(page);

      check("Canvas 스티커 — 슬롯과 Images 안내",
        stickerPanel.title === "Canvas 스티커" &&
        stickerPanel.rows.join("|").indexOf("sticker_1") !== -1 &&
        !!stickerPanel.imageNote,
        JSON.stringify(stickerPanel.rows));

      /* --- category_nav --- */

      await clickElement(page, frame, false, "cvNav");

      const navPanel = await readPanel(page);

      check("Canvas 카테고리 — 지금 개수만 읽기 전용으로",
        navPanel.title === "Canvas 카테고리" &&
        navPanel.rows.join("|").indexOf("2개 지정") !== -1 &&
        !!navPanel.navNote,
        JSON.stringify(navPanel.rows));

      /* --- shape --- */

      await clickElement(page, frame, false, "cvShape");

      const shapePanel = await readPanel(page);

      check("Canvas 도형 — kind 읽기 전용 · 스타일은 스킨 CSS",
        shapePanel.title === "Canvas 도형" &&
        shapePanel.rows.join("|").indexOf("ellipse") !== -1 &&
        !!shapePanel.shapeNote,
        JSON.stringify(shapePanel.rows));

      check("도형에는 Auto 스위치가 없다", shapePanel.hasAuto === false);

      /* --- template 요소로 소유권이 넘어간다 --- */

      await clickSelector(page, frame, false, ".hc-outside");

      const templatePanel = await readPanel(page);

      check("template 요소를 고르면 기존 Inspector 가 주인이 된다",
        templatePanel.popover === true &&
        templatePanel.canvasPanel === false &&
        templatePanel.canvasSelection.length === 0 &&
        !!templatePanel.inspectorSelection,
        JSON.stringify({
          p: templatePanel.popover,
          c: templatePanel.canvasPanel,
          i: templatePanel.inspectorSelection
        }));

      /* --- 빈 곳 --- */

      await clickElement(page, frame, false, "cvText");
      await clickSelector(page, frame, false, ".hc-gap");

      const emptyPanel = await readPanel(page);

      check("빈 곳을 누르면 둘 다 닫히고 안내가 돌아온다",
        emptyPanel.canvasPanel === false && emptyPanel.popover === false &&
        emptyPanel.hint === true,
        JSON.stringify({ c: emptyPanel.canvasPanel, p: emptyPanel.popover }));

      /* --- 다중 선택 --- */

      await clickElement(page, frame, false, "cvText");
      await clickElement(page, frame, false, "cvShape", { shift: true });

      const multi = await readPanel(page);

      check("두 개를 고르면 개수만 알린다",
        multi.canvasPanel === true &&
        multi.title === "Canvas 요소 2개 선택됨" &&
        multi.multiNote === "여러 요소 편집은 아직 지원하지 않습니다.",
        JSON.stringify({ t: multi.title, n: multi.multiNote }));

      check("다중 선택에는 입력칸이 하나도 없다",
        multi.hasText === false && multi.hasGeometry === false &&
        multi.hasAuto === false);

      check("첫 요소를 몰래 primary 로 골라 고치지 않는다",
        multi.state && multi.state.mode === "multi" && multi.state.id === null,
        JSON.stringify(multi.state));

      /* --- 단일로 돌아온다 --- */

      await clickElement(page, frame, false, "cvText");

      const back = await readPanel(page);

      check("단일 선택으로 돌아오면 그 요소의 패널이 곧바로 복원된다",
        back.title === "Canvas 글자" && back.textValue === "한 줄" &&
        back.hasGeometry === true,
        String(back.title));

      /* --- 잠긴 요소 --- */

      await clickElement(page, frame, false, "cvLocked");

      const locked = await readPanel(page);

      check("잠긴 요소로는 패널이 열리지 않는다",
        locked.canvasSelection.indexOf("cvLocked") === -1,
        JSON.stringify(locked.canvasSelection));

      /* --- Select 종료 --- */

      await clickElement(page, frame, false, "cvText");
      await page.click("#studioInspectorButton");
      await sleep(700);

      const off = await readPanel(page);

      check("Select 를 끄면 Canvas 패널도 닫힌다",
        off.canvasPanel === false,
        JSON.stringify({ c: off.canvasPanel }));

      /* --- 유효하지 않은 Canvas (미래 version) --- */

      await enableSelect(page);
      await clickElement(page, frame, false, "cvText");

      const futureImport = await page.evaluate(async (pkgText) => {

        const result = await window.validateSkinPackageImport(pkgText);

        if (!result.ok) {
          return { ok: false, message: result.message };
        }

        window.applyImportedSkinPackage(result.skinPackage, {});

        return { ok: true };

      }, JSON.stringify(futurePackage()));

      await sleep(1200);

      const future = await readPanel(page);

      check("미래 version 캔버스에서는 패널이 열리지 않는다",
        futureImport.ok === true &&
        future.canvasPanel === false && future.canvasSelection.length === 0,
        JSON.stringify({ i: futureImport, c: future.canvasPanel }));

      const futureKept = await readCanvas(page);

      check("미래 version 데이터는 보존되고 실행되지 않는다",
        futureKept && futureKept.canvas.version === 3 &&
        futureKept.canvas.elements.length === 1 &&
        futureKept.canvas.elements[0].id === "v3only",
        JSON.stringify(futureKept && futureKept.canvas.version));

      /* --- HOME 이외 화면 ---

         ★ 이 관문은 studioCanvasEditingIsOn() 의 첫 줄이다
           (currentPreviewPageType !== "home"). 시나리오 화면에서
           실제 CATEGORY 로 가려면 스킨 안 링크가 필요한데 이 fixture
           에는 없으므로, 관문 자체를 그 자리에서 재운다. */

      const offHome = await page.evaluate(() => {

        const before = currentPreviewPageType;

        currentPreviewPageType = "category";

        const editing = window.studioCanvasEditingIsOn();

        window.renderStudioCanvasInspector();

        const el = document.getElementById("studioCanvasInspector");

        const visible = !!(el && !el.hidden);

        currentPreviewPageType = before;

        return { editing, visible };

      });

      check("HOME 이 아니면 Canvas 패널이 없다",
        offHome.editing === false && offHome.visible === false,
        JSON.stringify(offHome));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [text] — 글자
    ====================================================== */
    if (wants("text")) {

      section("text");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await clickElement(page, frame, false, "cvText");

      const startHistory = await historyState(page);
      const startGeometry = geometryOf(await readCanvas(page), "cvText");

      /* --- 한 줄 → 여러 줄 --- */

      await typeText(page, "첫 줄\n둘째 줄\n셋째 줄");

      const typed = await readCanvas(page);

      check("여러 줄이 그대로 저장된다",
        textOf(typed, "cvText") === "첫 줄\n둘째 줄\n셋째 줄",
        JSON.stringify(textOf(typed, "cvText")));

      const drawn = await drawnText(page, frame, false, "cvText");

      check("입력 중에 Preview 가 곧바로 따라온다",
        drawn && drawn.text === "첫 줄\n둘째 줄\n셋째 줄",
        JSON.stringify(drawn && drawn.text));

      check("글자 편집만으로 geometry 가 달라지지 않는다",
        JSON.stringify(geometryOf(typed, "cvText")) === JSON.stringify(startGeometry),
        JSON.stringify(geometryOf(typed, "cvText")));

      check("모르는 props 필드가 남는다",
        elementOf(typed, "cvText").props.mystery === "keep-props" &&
        elementOf(typed, "cvText").props.role === "title",
        JSON.stringify(elementOf(typed, "cvText").props));

      check("모르는 요소 필드도 남는다",
        JSON.stringify(elementOf(typed, "cvText").zzz) ===
        JSON.stringify({ keep: "unknown-field" }));

      /* --- 한 focus 세션 = Undo 한 칸 --- */

      const afterTyping = await historyState(page);

      check("여러 글자를 쳐도 Undo 는 한 칸이다",
        afterTyping.undo === startHistory.undo + 1,
        `${startHistory.undo} → ${afterTyping.undo}`);

      await page.click("#studioUndoButton");
      await sleep(900);

      check("Undo 한 번이 세션 전체를 되돌린다",
        textOf(await readCanvas(page), "cvText") === "한 줄",
        JSON.stringify(textOf(await readCanvas(page), "cvText")));

      await page.click("#studioRedoButton");
      await sleep(900);

      check("Redo 가 새 문구로 돌아온다",
        textOf(await readCanvas(page), "cvText") === "첫 줄\n둘째 줄\n셋째 줄");

      const afterRedo = await readPanel(page);

      check("Undo · Redo 뒤 패널 값이 따라간다",
        afterRedo.textValue === "첫 줄\n둘째 줄\n셋째 줄",
        JSON.stringify(afterRedo.textValue));

      /* --- HTML 이 아니라 글자다 --- */

      await typeText(page, "<b>굵게</b> & <i>기울임</i>");

      const plain = await drawnText(page, frame, false, "cvText");

      check("태그처럼 생긴 글자가 HTML 로 실행되지 않는다",
        plain && plain.bold === 0 && plain.text === "<b>굵게</b> & <i>기울임</i>",
        JSON.stringify(plain));

      check("저장된 값도 평문 그대로다",
        textOf(await readCanvas(page), "cvText") === "<b>굵게</b> & <i>기울임</i>");

      /* --- 변화 없음 = Undo 0 --- */

      const beforeNoop = await historyState(page);

      await page.focus("#studioCanvasInspectorText");
      await page.evaluate(() => document.getElementById("studioCanvasInspectorText").blur());
      await sleep(500);

      const afterNoop = await historyState(page);

      check("값을 바꾸지 않은 세션은 기록을 만들지 않는다",
        afterNoop.undo === beforeNoop.undo,
        `${beforeNoop.undo} → ${afterNoop.undo}`);

      /* --- Escape --- */

      const beforeEscape = await historyState(page);

      await page.focus("#studioCanvasInspectorText");
      await page.keyboard.type("되돌릴 글자", { delay: 12 });
      await sleep(300);
      await page.keyboard.press("Escape");
      await sleep(700);

      const escaped = await readCanvas(page);
      const afterEscape = await historyState(page);

      check("Escape 가 focus 시작 문구로 되돌린다",
        textOf(escaped, "cvText") === "<b>굵게</b> & <i>기울임</i>",
        JSON.stringify(textOf(escaped, "cvText")));

      check("Escape 는 Undo 를 만들지 않는다",
        afterEscape.undo === beforeEscape.undo,
        `${beforeEscape.undo} → ${afterEscape.undo}`);

      /* --- 입력 중 Save --- */

      await page.focus("#studioCanvasInspectorText");
      await page.evaluate(() => {
        const el = document.getElementById("studioCanvasInspectorText");
        el.setSelectionRange(0, el.value.length);
      });
      await page.keyboard.press("Delete");
      await page.keyboard.type("저장 직전 글자", { delay: 12 });
      await sleep(350);

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const savedText = await page.evaluate(() => {
        const calls = window.__savedDraftCallsLay;
        const content = calls[calls.length - 1].p_content;
        const entry = (content.regions || []).find((r) => r && r.name === "home_canvas");
        const el = entry ? entry.canvas.elements.find((e) => e.id === "cvText") : null;
        return el ? el.props.text : null;
      });

      check("입력 중에 Save 를 눌러도 최신 글자가 실린다",
        savedText === "저장 직전 글자", JSON.stringify(savedText));

      /* --- 길이 경계 --- */

      const limits = await page.evaluate(() => {

        const gen = window.getStudioCanvasSelection().generation;
        const long = "가".repeat(2001);
        const fit = "나".repeat(2000);

        const current = () => {
          const entry =
            (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");
          return entry.canvas.elements.find((e) => e.id === "cvText").props.text;
        };

        const tooLong = window.commitStudioCanvasInspectorEdit({
          kind: "text",
          id: "cvText",
          expected: { text: current() },
          next: { text: long },
          generation: gen
        });

        const okLong = window.commitStudioCanvasInspectorEdit({
          kind: "text",
          id: "cvText",
          expected: { text: current() },
          next: { text: fit },
          generation: gen
        });

        return {
          tooLong: tooLong.accepted,
          tooLongReason: tooLong.reason,
          okLong: okLong.accepted,
          stored: current().length
        };

      });

      check("2000자를 넘으면 거부한다",
        limits.tooLong === false && limits.tooLongReason === "length",
        JSON.stringify(limits));

      check("2000자는 받아들인다",
        limits.okLong === true && limits.stored === 2000,
        JSON.stringify(limits));

      const maxAttr = (await readPanel(page)).textMax;

      check("입력칸 자체가 2000자에서 멈춘다", maxAttr === 2000, String(maxAttr));

      /* --- 잘못된 입력은 draft 를 일부만 고치지 않는다 --- */

      const bad = await page.evaluate(() => {

        const gen = window.getStudioCanvasSelection().generation;

        const entry = () =>
          (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

        const before = JSON.stringify(entry());

        const results = [
          window.commitStudioCanvasInspectorEdit({
            kind: "text", id: "cvText",
            expected: { text: entry().canvas.elements[0].props.text },
            next: { text: 42 }, generation: gen
          }),
          window.commitStudioCanvasInspectorEdit({
            kind: "text", id: "cvText",
            expected: { text: entry().canvas.elements[0].props.text },
            next: { text: "새 글", role: "body" }, generation: gen
          }),
          window.commitStudioCanvasInspectorEdit({
            kind: "text", id: "cvPhoto",
            expected: { text: "" }, next: { text: "그림에 글자" }, generation: gen
          })
        ];

        return {
          accepted: results.map((r) => r.accepted),
          reasons: results.map((r) => r.reason),
          unchanged: JSON.stringify(entry()) === before
        };

      });

      check("숫자 · 허용 외 키 · 다른 타입은 전부 거부한다",
        bad.accepted.every((v) => v === false),
        JSON.stringify(bad.reasons));

      check("거부된 요청이 draft 를 한 글자도 바꾸지 않았다",
        bad.unchanged === true);

      /* --- chrome 재측정 --- */

      await clickElement(page, frame, false, "cvFixed");
      await sleep(600);

      const chromeBefore = await frameState(frame);

      await typeText(page, "한 줄\n두 줄\n세 줄\n네 줄\n다섯 줄");

      const chromeAfter = await frameState(frame);

      const bottomOf = (state) =>
        (state && state.chromePadding) ? state.chromePadding.bottom : null;

      check("줄이 늘면 선택 chrome 이 새 content bounds 를 다시 잰다",
        bottomOf(chromeBefore) !== null && bottomOf(chromeAfter) !== null &&
        bottomOf(chromeAfter) > bottomOf(chromeBefore),
        `${bottomOf(chromeBefore)} → ${bottomOf(chromeAfter)}`);

      check("chrome 재측정이 저장 geometry 를 바꾸지 않는다",
        JSON.stringify(geometryOf(await readCanvas(page), "cvFixed")) ===
        JSON.stringify({ x: 20, y: 140, width: 160, height: 24, rotation: 0 }),
        JSON.stringify(geometryOf(await readCanvas(page), "cvFixed")));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [geometry] — 숫자 칸
    ====================================================== */
    if (wants("geometry")) {

      section("geometry");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await clickElement(page, frame, false, "cvShape");

      const beforeAll = await readRegions(page);

      /* --- 음수 x --- */

      const beforeOne = await historyState(page);

      await typeNumber(page, "x", -40);

      const negative = geometryOf(await readCanvas(page), "cvShape");

      check("음수 X 를 받아들인다", negative.x === -40, JSON.stringify(negative));

      check("한 칸의 한 편집 세션이 Undo 한 칸이다",
        (await historyState(page)).undo === beforeOne.undo + 1,
        `${beforeOne.undo} → ${(await historyState(page)).undo}`);

      /* --- Width 만 바꾸면 Height 는 그대로 --- */

      await typeNumber(page, "width", 140);

      const sized = geometryOf(await readCanvas(page), "cvShape");

      check("Width 숫자 입력은 비율을 유지하지 않는다(Height 불변)",
        sized.width === 140 && sized.height === 100,
        JSON.stringify(sized));

      check("회전은 리사이즈가 건드리지 않는다", sized.rotation === 30);

      /* --- rotation 정규화 --- */

      await typeNumber(page, "rotation", 400);

      const rotated = geometryOf(await readCanvas(page), "cvShape");

      check("rotation 은 한 바퀴 안으로 접힌다(400 → 40)",
        rotated.rotation === 40, String(rotated.rotation));

      const rotatedPanel = await readPanel(page);

      check("화면도 접힌 값을 보여 준다",
        rotatedPanel.values.rotation === "40",
        String(rotatedPanel.values.rotation));

      await typeNumber(page, "rotation", -30);

      check("음수도 같은 자로 접힌다(-30 → 330)",
        geometryOf(await readCanvas(page), "cvShape").rotation === 330,
        String(geometryOf(await readCanvas(page), "cvShape").rotation));

      /* --- 잘못된 입력 --- */

      const beforeBad = await readCanvas(page);
      const beforeBadHistory = await historyState(page);

      await typeNumber(page, "width", "");

      const emptyPanel = await readPanel(page);

      check("빈 값은 0 으로 저장되지 않고 오류를 적는다",
        !!emptyPanel.errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140,
        JSON.stringify(emptyPanel.errors.width));

      await typeNumber(page, "width", "abc");

      check("숫자가 아니면 거부한다",
        !!(await readPanel(page)).errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140);

      await typeNumber(page, "width", "1e9");

      check("상한 밖은 거부한다",
        !!(await readPanel(page)).errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140);

      await typeNumber(page, "width", "0");

      check("0 폭은 거부한다",
        !!(await readPanel(page)).errors.width &&
        geometryOf(await readCanvas(page), "cvShape").width === 140);

      check("거부는 draft 를 한 칸도 바꾸지 않았다",
        JSON.stringify(await readCanvas(page)) === JSON.stringify(beforeBad));

      check("거부는 기록도 만들지 않았다",
        (await historyState(page)).undo === beforeBadHistory.undo,
        `${beforeBadHistory.undo} → ${(await historyState(page)).undo}`);

      /* --- Escape · 변화 0 --- */

      const beforeEscape = await historyState(page);

      await typeNumber(page, "x", 999, { escape: true });

      check("Escape 는 값을 되돌리고 기록도 만들지 않는다",
        geometryOf(await readCanvas(page), "cvShape").x === -40 &&
        (await historyState(page)).undo === beforeEscape.undo,
        JSON.stringify(geometryOf(await readCanvas(page), "cvShape")));

      await typeNumber(page, "x", -40);

      check("같은 값을 다시 넣으면 기록 0 칸이다",
        (await historyState(page)).undo === beforeEscape.undo,
        `${beforeEscape.undo} → ${(await historyState(page)).undo}`);

      /* --- auto 높이 --- */

      await clickElement(page, frame, false, "cvText");

      const autoOn = await readPanel(page);

      check("text 는 Auto 로 시작한다",
        autoOn.autoChecked === true && autoOn.heightDisabled === true);

      await page.click("#studioCanvasInspectorAuto");
      await sleep(900);

      const fixed = geometryOf(await readCanvas(page), "cvText");

      check("Auto 를 끄면 지금 높이가 숫자로 굳는다",
        typeof fixed.height === "number" && fixed.height > 0,
        JSON.stringify(fixed.height));

      const fixedPanel = await readPanel(page);

      check("숫자가 되면 Height 칸이 열린다",
        fixedPanel.heightDisabled === false && fixedPanel.values.height !== "");

      await typeNumber(page, "height", 88);

      check("숫자 높이를 직접 넣을 수 있다",
        geometryOf(await readCanvas(page), "cvText").height === 88);

      await page.click("#studioCanvasInspectorAuto");
      await sleep(900);

      check('Auto 를 다시 켜면 "auto" 로 돌아간다',
        geometryOf(await readCanvas(page), "cvText").height === "auto",
        JSON.stringify(geometryOf(await readCanvas(page), "cvText").height));

      /* --- 허용되지 않는 타입 --- */

      const autoRejected = await page.evaluate(() => {

        const entry = () =>
          (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

        const el = () => entry().canvas.elements.find((e) => e.id === "cvShape");

        /* 지금 고른 것은 cvText 다 — 고르지 않은 요소는 애초에 거부다.
           그래서 먼저 고른 뒤에 넣는다. */
        return { current: el().height };

      });

      await clickElement(page, frame, false, "cvShape");

      const shapeAuto = await page.evaluate(() => {

        const gen = window.getStudioCanvasSelection().generation;

        const entry =
          (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

        const el = entry.canvas.elements.find((e) => e.id === "cvShape");

        return window.commitStudioCanvasInspectorEdit({
          kind: "resize",
          id: "cvShape",
          expected: { x: el.x, y: el.y, width: el.width, height: el.height },
          next: { x: el.x, y: el.y, width: el.width, height: "auto" },
          generation: gen
        });

      });

      check('도형에는 "auto" 를 쓸 수 없다',
        shapeAuto.accepted === false && shapeAuto.reason === "auto",
        JSON.stringify(shapeAuto) + " / " + JSON.stringify(autoRejected));

      /* --- 직접 조작 뒤 패널 값 --- */

      await clickElement(page, frame, false, "cvPhoto");

      const beforeDrag = await readPanel(page);

      const rects = await nativeRects(page, [byId("cvPhoto")]);
      const box = rects[byId("cvPhoto")];

      await page.mouse.move((box.left + box.right) / 2, (box.top + box.bottom) / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) {
        await page.mouse.move(
          (box.left + box.right) / 2 + (60 * i) / 8,
          (box.top + box.bottom) / 2 + (40 * i) / 8
        );
      }
      await page.mouse.up();
      await sleep(900);

      const afterDrag = await readPanel(page);
      const draggedGeometry = geometryOf(await readCanvas(page), "cvPhoto");

      check("드래그 뒤 패널 값이 곧바로 새 좌표를 보여 준다",
        afterDrag.values.x === String(draggedGeometry.x) &&
        afterDrag.values.y === String(draggedGeometry.y) &&
        afterDrag.values.x !== beforeDrag.values.x,
        JSON.stringify(afterDrag.values));

      await page.click("#studioUndoButton");
      await sleep(900);

      const afterUndo = await readPanel(page);

      check("Undo 뒤에도 패널 값이 따라간다",
        afterUndo.values.x === "230" && afterUndo.values.y === "40",
        JSON.stringify(afterUndo.values));

      /* --- 다른 요소 · 다른 region 불변 --- */

      const finalRegions = JSON.parse(await readRegions(page));
      const startRegions = JSON.parse(beforeAll);

      const other = (regions) =>
        JSON.stringify(regions.find((r) => r && r.name === "some_other_region"));

      check("다른 region 항목은 그대로다",
        other(finalRegions) === other(startRegions), other(finalRegions));

      const untouched = (regions, id) => {
        const entry = regions.find((r) => r && r.name === "home_canvas");
        return JSON.stringify(entry.canvas.elements.find((e) => e.id === id));
      };

      check("건드리지 않은 요소는 한 글자도 바뀌지 않았다",
        untouched(finalRegions, "cvNav") === untouched(startRegions, "cvNav") &&
        untouched(finalRegions, "cvLogo") === untouched(startRegions, "cvLogo"));

      check("canvas 의 모르는 칸과 항목의 모르는 칸이 남는다",
        (() => {
          const entry = finalRegions.find((r) => r && r.name === "home_canvas");
          return entry.note === "unknown-entry-field" &&
            entry.canvas.extra === "unknown-canvas-field";
        })());

      check("요소 순서가 그대로다",
        (() => {
          const ids = (regions) =>
            regions.find((r) => r && r.name === "home_canvas")
              .canvas.elements.map((e) => e.id).join();
          return ids(finalRegions) === ids(startRegions);
        })());

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }


    /* ======================================================
       [round] — 저장 왕복
    ====================================================== */
    if (wants("round")) {

      section("round");

      const page = await openStudio(browser, {});
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);
      await clickElement(page, frame, false, "cvText");

      await typeText(page, "왕복\n두 줄");
      await typeNumber(page, "x", 55);

      const edited = await readCanvas(page);

      check("패널이 고친 값이 draft 에 있다",
        textOf(edited, "cvText") === "왕복\n두 줄" &&
        geometryOf(edited, "cvText").x === 55,
        JSON.stringify(geometryOf(edited, "cvText")));

      /* --- 입력 non-mutation --- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const el = entry.canvas.elements.find((e) => e.id === "cvText");
        return { text: el.props.text, x: el.x };
      });

      check("들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.text === "한 줄" && untouched.x === 20,
        JSON.stringify(untouched));

      /* --- Export → Import --- */

      const roundTrip = await page.evaluate(async () => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const text = window.serializeSkinPackageExport(exported.skinPackage);

        const result = await window.validateSkinPackageImport(text);

        if (!result.ok) return { ok: false, message: result.message };

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const el = entry ? entry.canvas.elements.find((e) => e.id === "cvText") : null;

        return {
          ok: true,
          text: el ? el.props.text : null,
          role: el ? el.props.role : null,
          mystery: el ? el.props.mystery : null,
          x: el ? el.x : null,
          zzz: el ? JSON.stringify(el.zzz) : null
        };

      });

      check("Export → Import 를 지나도 문구와 좌표가 같다",
        roundTrip.ok && roundTrip.text === "왕복\n두 줄" && roundTrip.x === 55,
        JSON.stringify(roundTrip));

      check("Export → Import 에서 모르는 필드도 남는다",
        roundTrip.ok && roundTrip.mystery === "keep-props" &&
        roundTrip.role === "title" &&
        roundTrip.zzz === JSON.stringify({ keep: "unknown-field" }),
        JSON.stringify(roundTrip));

      /* --- Publish resolve --- */

      const resolved = await page.evaluate(() => {

        const payload =
          window.resolveSkinHomeCanvas(
            currentWorkingSkin,
            currentWorkingSkin.templates.home.html
          );

        const el = payload ? payload.elements.find((e) => e.id === "cvText") : null;

        return el ? { text: el.props.text, role: el.props.role, x: el.x } : null;

      });

      check("Publish 이 쓰는 resolve 에서도 같은 문구다",
        resolved && resolved.text === "왕복\n두 줄" && resolved.x === 55 &&
        resolved.role === "title",
        JSON.stringify(resolved));

      /* --- Save → 다시 열기 --- */

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const saved = await page.evaluate(() => {
        const calls = window.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      await close(page);

      const reopened = await openStudio(browser, { package: saved });

      await canvasFrame(reopened, false);

      const reloaded = await readCanvas(reopened);

      check("저장된 draft 로 다시 열면 그 문구가 그대로다",
        textOf(reloaded, "cvText") === "왕복\n두 줄" &&
        geometryOf(reloaded, "cvText").x === 55,
        JSON.stringify(textOf(reloaded, "cvText")));

      const drawnAgain = await drawnText(reopened, null, false, "cvText");

      check("다시 연 화면이 그 문구를 실제로 그린다",
        drawnAgain && drawnAgain.text === "왕복\n두 줄",
        JSON.stringify(drawnAgain && drawnAgain.text));

      await close(reopened);

    }


    /* ======================================================
       [v2] — 조합형 Canvas 의 선택과 기본 배치 (V2-EDITOR-1A)
    ====================================================== */
    if (wants("v2")) {

      section("v2");

      const page = await openStudio(browser, { package: v2Package({}) });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      /* ---- 1. 블록을 고를 수 있다 ---- */

      await clickElement(page, frame, false, "v2Text");

      let panel = await readV2Panel(page);

      check("★ v2 글자 블록을 누르면 Canvas 패널이 그 블록을 연다",
        same(panel.canvasSelection, ["v2Text"]) &&
        panel.meta === "Canvas · v2Text" &&
        panel.title === "Canvas 글자",
        JSON.stringify({ s: panel.canvasSelection, m: panel.meta, t: panel.title }));

      check("★ v2 화면은 흐름 칸이고 v1 의 자유 좌표 칸은 없다",
        panel.hasLayout === true && panel.hasV1Geometry === false &&
        panel.values.width === "300" && panel.values.height === "" &&
        panel.align === "center",
        JSON.stringify(panel.values));

      check("★ 정렬은 계약의 네 값이다",
        same(panel.alignOptions, ["left", "center", "right", "stretch"]),
        JSON.stringify(panel.alignOptions));

      check("★ 여백 네 칸이 저장값대로다(빠진 칸은 0)",
        panel.values.top === "10" && panel.values.bottom === "6" &&
        panel.values.right === "0" && panel.values.left === "0",
        JSON.stringify(panel.values));

      check("★ height \"auto\" 면 Auto 가 켜져 있고 Height 칸이 잠긴다",
        panel.auto === true && panel.heightDisabled === true);

      check("★ 순서가 몇 번째인지 보인다(배열 자리 — 숨긴 블록도 한 칸)",
        panel.orderAt === "2 / 5" && panel.upDisabled === false,
        panel.orderAt);

      /* ---- 2. 선택 전환 ---- */

      await clickElement(page, frame, false, "v2Rule");

      panel = await readV2Panel(page);

      check("★ 다른 블록으로 옮겨 가면 그 블록의 화면이 된다(divider)",
        same(panel.canvasSelection, ["v2Rule"]) &&
        panel.title === "Canvas 구분선" &&
        panel.values.width === "120" && panel.values.height === "14",
        JSON.stringify({ s: panel.canvasSelection, v: panel.values }));

      await clickElement(page, frame, false, "v2Wide");

      panel = await readV2Panel(page);

      check("★ align:\"stretch\" 블록도 고를 수 있다(페이지 래퍼로 떨어지지 않는다)",
        same(panel.canvasSelection, ["v2Wide"]) && panel.align === "stretch",
        JSON.stringify(panel.canvasSelection));

      /* ---- 3. main_visual — 한 번 클릭은 프레임, 한 번 더는 안쪽 ---- */

      await clickElement(page, frame, false, "v2Photo");

      panel = await readV2Panel(page);

      check("★ main_visual 안을 누르면 **프레임 전체**가 골라진다",
        same(panel.canvasSelection, ["v2Main"]) &&
        panel.title === "Canvas 메인 비주얼" &&
        panel.hasLayout === true,
        JSON.stringify({ s: panel.canvasSelection, t: panel.title }));

      check("★ 패널이 지금 프레임을 고르고 있다고 적는다",
        typeof panel.where === "string" && panel.where.indexOf("프레임 전체") !== -1,
        panel.where);

      await clickElement(page, frame, false, "v2Photo");

      panel = await readV2Panel(page);

      check("★ 한 번 더 누르면 프레임 **안쪽 요소**로 들어간다",
        same(panel.canvasSelection, ["v2Photo"]) &&
        panel.title === "Canvas 사진",
        JSON.stringify({ s: panel.canvasSelection, t: panel.title }));

      /* HOME-CANVAS-V2-EDITOR-1B — `1A` 에서는 읽기 전용 요약이었다.
         이제는 자리 다섯 칸이고, 흐름 칸은 여전히 없다. */
      check("★ 안쪽 요소는 자리 칸이고 흐름 칸은 없다(§26-6)",
        panel.hasFree === true && panel.hasLayout === false &&
        panel.hasReadOnly === false,
        JSON.stringify({ f: panel.hasFree, l: panel.hasLayout, r: panel.hasReadOnly }));

      check("★ 패널이 지금 안쪽 요소를 고르고 있다고 적는다",
        typeof panel.where === "string" && panel.where.indexOf("안쪽 요소") !== -1,
        panel.where);

      /* 같은 프레임 안에서는 형제끼리 바로 옮겨 다닌다.

         ★ v2Paper 가 아니라 v2Tag 를 쓴다 — 종이는 사진 **뒤에** 깔려
           있어서 가운데를 누르면 위에 있는 사진이 잡힌다(그것이 맞는
           동작이다). pin 라벨은 사진 밖에 있어 겹치지 않는다. */
      await clickElement(page, frame, false, "v2Tag");

      panel = await readV2Panel(page);

      check("★ 들어와 있는 동안에는 형제 장식으로 바로 옮겨 간다",
        same(panel.canvasSelection, ["v2Tag"]),
        JSON.stringify(panel.canvasSelection));

      /* 프레임 밖으로 나가면 다시 "밖" 이다 */
      await clickElement(page, frame, false, "v2Text");
      await clickElement(page, frame, false, "v2Photo");

      panel = await readV2Panel(page);

      check("★ 프레임 밖을 한 번 거치면 다시 프레임 전체부터다",
        same(panel.canvasSelection, ["v2Main"]),
        JSON.stringify(panel.canvasSelection));

      /* ---- 4. 기본 칸 — 저장 · 보존 · Undo 한 칸 ---- */

      const before = await readCanvas(page);

      check("아직 draft 는 그대로다", v2BlockOf(before, "v2Text").align === "center");

      await clickElement(page, frame, false, "v2Text");

      /* =====================================================
         HOME-CANVAS-INSPECTOR-COMPACT-1 — 흐름 안의 자리가 조밀해졌다

           한 줄   Width · Height · 높이 Auto
           한 줄   위 · 오른쪽 · 아래 · 왼쪽

         ★ 재는 것은 "몇 줄인가"와 "패널 밖으로 넘치는가"다. 값이
           어떻게 저장되는가는 바로 아래 절이 그대로 본다 — 배치만
           바뀌고 계약은 한 글자도 바뀌지 않았다는 것이 이 라운드다.
      ====================================================== */

      const compactLines = await page.evaluate(() => {

        const layout =
          document.getElementById("studioCanvasInspectorV2Layout");

        if (!layout) return null;

        const lineOf = (id) => {

          const line =
            document.getElementById(id);

          if (!line) return null;

          const cells =
            Array.from(line.querySelectorAll(".studio-canvas-inspector-cell"));

          const parent =
            layout.getBoundingClientRect();

          return {
            count: cells.length,
            width: Math.round(parent.width),
            cellWidths: cells.map((c) => Math.round(c.getBoundingClientRect().width)),
            /* ★ 줄은 **아래 변**으로 센다. 이 줄은 `align-items:
               flex-end` 라(입력칸의 밑변을 맞춘다) 칸의 높이가 다르면
               같은 줄에서도 윗변이 갈린다 — 높이 Auto 칸은 체크박스
               하나라 숫자 칸보다 낮다. 밑변은 같은 줄이면 같다. */
            rows: new Set(
              cells.map((c) => Math.round(c.getBoundingClientRect().bottom))
            ).size,
            overflow: cells.some((c) => {
              const r = c.getBoundingClientRect();
              return r.right > parent.right + 1 || r.left < parent.left - 1;
            }),
            clipped: cells.some((c) => c.scrollWidth > c.clientWidth + 1)
          };

        };

        return {
          size: lineOf("studioCanvasInspectorV2SizeLine"),
          margin: lineOf("studioCanvasInspectorV2MarginLine"),

          /* 패널이 가로로 스크롤되면 안 된다(왼쪽 패널 전체) */
          panelScroll: (() => {
            const panel = layout.closest(".studio-left-panel") || layout.parentElement;
            return panel ? panel.scrollWidth > panel.clientWidth + 1 : null;
          })()
        };

      });

      check("★ Width · Height · 높이 Auto 가 한 줄이다",
        compactLines && compactLines.size &&
        compactLines.size.count === 3 && compactLines.size.rows === 1,
        JSON.stringify(compactLines && compactLines.size));

      check("★ 여백 네 방향이 한 줄이다",
        compactLines && compactLines.margin &&
        compactLines.margin.count === 4 && compactLines.margin.rows === 1,
        JSON.stringify(compactLines && compactLines.margin));

      check("★ 칸이 패널 밖으로 넘치거나 잘리지 않는다 · 가로 스크롤 0",
        compactLines &&
        compactLines.size.overflow === false &&
        compactLines.size.clipped === false &&
        compactLines.margin.overflow === false &&
        compactLines.margin.clipped === false &&
        compactLines.panelScroll === false,
        JSON.stringify(compactLines));

      /* align */

      let h0 = await historyState(page);

      await page.selectOption("#studioCanvasInspectorAlign", "right");
      await sleep(400);

      let now = await readCanvas(page);
      let h1 = await historyState(page);

      check("★ 정렬을 바꾸면 그 칸만 바뀐다",
        v2BlockOf(now, "v2Text").align === "right" &&
        v2BlockOf(now, "v2Text").width === 300 &&
        v2BlockOf(now, "v2Text").props.text === "한 줄",
        JSON.stringify(v2BlockOf(now, "v2Text")));

      check("★ 정렬 한 번이 Undo 한 칸이다",
        h1.undo === h0.undo + 1, `${h0.undo} → ${h1.undo}`);

      check("★ 모르는 블록 필드 · 모르는 props 필드가 그대로다",
        v2BlockOf(now, "v2Text").zzz.keep === "unknown-block-field" &&
        v2BlockOf(now, "v2Text").props.mystery === "keep-props" &&
        v2BlockOf(now, "v2Text").props.role === "title",
        JSON.stringify(v2BlockOf(now, "v2Text").props));

      check("★ 다른 블록 · 프레임 내부 · overlay 가 한 글자도 안 바뀐다",
        v2OrderOf(now) === "v2Logo,v2Text,v2Rule,v2Wide,v2Main" &&
        v2NodeOf(now, "v2Photo").width === 120 &&
        v2NodeOf(now, "v2Tag").pin.offset.x === 6 &&
        v2NodeOf(now, "v2Over").x === 20,
        v2OrderOf(now));

      check("★ canvas 의 모르는 칸도 그대로다",
        now.canvas.extra === "unknown-canvas-field" &&
        now.canvas.flow.gap === 10 &&
        now.canvas.flow.padding.top === 40);

      /* width */

      h0 = await historyState(page);

      await typeV2Number(page, "width", 240);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 폭을 고치면 저장된다 · Undo 한 칸",
        v2BlockOf(now, "v2Text").width === 240 && h1.undo === h0.undo + 1,
        `${v2BlockOf(now, "v2Text").width} / ${h0.undo}→${h1.undo}`);

      /* margin — 한 칸을 바꿔도 네 칸이 함께 실린다 */

      h0 = await historyState(page);

      await typeV2Number(page, "top", -8);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 여백은 음수도 된다 · 나머지 세 칸은 그대로 · Undo 한 칸",
        same(v2BlockOf(now, "v2Text").margin, { top: -8, right: 0, bottom: 6, left: 0 }) &&
        h1.undo === h0.undo + 1,
        JSON.stringify(v2BlockOf(now, "v2Text").margin));

      /* height — Auto 끄기 · 켜기 */

      panel = await readV2Panel(page);

      check("★ Auto 가 켜진 동안 Height 칸은 잠겨 있다(그 칸으로는 못 고친다)",
        panel.heightDisabled === true &&
        v2BlockOf(await readCanvas(page), "v2Text").height === "auto",
        String(panel.heightDisabled));

      /* =====================================================
         HOME-CANVAS-V2-MANUAL-FIX-1 — Auto 를 끄면 **지금 그려진
         높이**로 굳는다(계약 §29-3).

         예전에는 "Height 칸에 적어 둔 숫자"였다. 그런데 그 칸은
         Auto 인 동안 잠겨 있어서(바로 위 절) 주인은 숫자를 넣을 수
         없었고, 스위치를 끄면 "숫자를 먼저 넣어 주세요"만 나왔다 —
         클릭 한 번으로는 Auto 를 끌 수 없었다. 그래서 이 절도 칸을
         억지로 열어 값을 적어 넣고 있었다(아래 주석 처리된 줄).
      ====================================================== */

      const drawnHeight =
        await page.evaluate(() =>
          window.studioCanvasV2MeasuredHeight("v2Text"));

      await page.click("#studioCanvasInspectorV2Auto");
      await sleep(400);

      now = await readCanvas(page);

      check("★ Auto 를 끄면 지금 그려진 높이로 굳는다(클릭 한 번)",
        drawnHeight > 0 &&
        v2BlockOf(now, "v2Text").height === drawnHeight,
        JSON.stringify({ drawn: drawnHeight, saved: v2BlockOf(now, "v2Text").height }));

      check("★ 그 값은 화면에서 잰 그 높이다(패널 칸도 같은 값)",
        (await page.evaluate(() =>
          document.getElementById("studioCanvasInspectorV2-height").value)) ===
          String(drawnHeight));

      h0 = await historyState(page);

      await page.click("#studioCanvasInspectorV2Auto");
      await sleep(400);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ Auto 를 켜면 \"auto\" 로 돌아간다 · Undo 한 칸",
        v2BlockOf(now, "v2Text").height === "auto" && h1.undo === h0.undo + 1,
        String(v2BlockOf(now, "v2Text").height));

      /* logo 는 auto 를 쓸 수 없다 — 스위치 자체가 없다 */

      await clickElement(page, frame, false, "v2Logo");

      const logoPanel = await page.evaluate(() =>
        !!document.getElementById("studioCanvasInspectorV2Auto"));

      check("★ logo 블록에는 Auto 스위치가 없다(계약의 표 그대로)",
        logoPanel === false);

      /* ---- 5. 순서 ---- */

      await clickElement(page, frame, false, "v2Rule");

      panel = await readV2Panel(page);

      check("순서를 옮기기 전에 그 블록이 골라져 있다",
        same(panel.canvasSelection, ["v2Rule"]) && panel.orderAt === "3 / 5",
        JSON.stringify({ s: panel.canvasSelection, at: panel.orderAt }));

      h0 = await historyState(page);

      await page.click("#studioCanvasInspectorOrderUp");
      await sleep(400);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 위로 한 칸 — 배열 순서가 바뀌고 나머지는 그대로다",
        v2OrderOf(now) === "v2Logo,v2Rule,v2Text,v2Wide,v2Main" &&
        h1.undo === h0.undo + 1,
        v2OrderOf(now));

      panel = await readV2Panel(page);

      check("★ 옮긴 뒤 패널의 자리 표시도 따라간다",
        panel.orderAt === "2 / 5" && same(panel.canvasSelection, ["v2Rule"]),
        panel.orderAt);

      await page.click("#studioCanvasInspectorOrderUp");
      await sleep(400);

      panel = await readV2Panel(page);

      check("★ 맨 위에서는 ↑ 가 잠긴다",
        panel.orderAt === "1 / 5" && panel.upDisabled === true,
        JSON.stringify({ at: panel.orderAt, up: panel.upDisabled }));

      /* ---- 6. 글자 ---- */

      await clickElement(page, frame, false, "v2Text");

      h0 = await historyState(page);

      await typeText(page, "v2 여러 줄\n<b>굵게</b>");

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ 글자를 고치면 평문 그대로 저장된다(줄바꿈 유지)",
        v2TextOf(now, "v2Text") === "v2 여러 줄\n<b>굵게</b>",
        JSON.stringify(v2TextOf(now, "v2Text")));

      check("★ 글자 한 세션이 Undo 한 칸이다",
        h1.undo === h0.undo + 1, `${h0.undo} → ${h1.undo}`);

      const drawn = await drawnText(page, frame, false, "v2Text");

      check("★ 화면에도 HTML 이 실행되지 않는다",
        drawn && drawn.bold === 0 && drawn.text.indexOf("<b>") !== -1,
        JSON.stringify(drawn));

      /* 프레임 내부의 글자 장식도 같은 칸을 쓴다 */

      await clickElement(page, frame, false, "v2Photo");
      await clickElement(page, frame, false, "v2Tag");

      panel = await readV2Panel(page);

      if (same(panel.canvasSelection, ["v2Tag"])) {

        await typeText(page, "새 태그");

        now = await readCanvas(page);

        check("★ 프레임 안쪽 글자도 같은 경로로 고쳐진다",
          v2TextOf(now, "v2Tag") === "새 태그" &&
          v2NodeOf(now, "v2Tag").pin.target === "photo",
          JSON.stringify(v2TextOf(now, "v2Tag")));

      }
      else {
        check("★ 프레임 안쪽 글자도 같은 경로로 고쳐진다", false,
          "v2Tag 를 고르지 못했다: " + JSON.stringify(panel.canvasSelection));
      }

      /* ---- 7. Undo 한 번이 정말 한 칸을 되돌린다 ---- */

      const beforeUndo = await readCanvas(page);

      await page.click("#studioUndoButton");
      await sleep(600);

      const afterUndo = await readCanvas(page);

      check("★ ↶ 한 번이 방금 친 글자 전체를 되돌린다",
        v2TextOf(afterUndo, "v2Tag") === "tag" &&
        v2TextOf(beforeUndo, "v2Tag") === "새 태그",
        JSON.stringify({ before: v2TextOf(beforeUndo, "v2Tag"), after: v2TextOf(afterUndo, "v2Tag") }));

      /* ---- 8. 입력 non-mutation · Export → Import ---- */

      const untouched = await page.evaluate(() => {
        const pkg = window.__scenarioLaySkinPackage;
        const entry = (pkg.regions || []).find((r) => r && r.name === "home_canvas");
        const block = entry.canvas.flow.blocks.find((b) => b.id === "v2Text");
        return { align: block.align, width: block.width, text: block.props.text };
      });

      check("★ 들어온 SkinPackage 원본을 제자리에서 고치지 않았다",
        untouched.align === "center" && untouched.width === 300 &&
        untouched.text === "한 줄",
        JSON.stringify(untouched));

      const roundTrip = await page.evaluate(async () => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const text = window.serializeSkinPackageExport(exported.skinPackage);

        const result = await window.validateSkinPackageImport(text);

        if (!result.ok) return { ok: false, message: result.message };

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const blocks = entry ? entry.canvas.flow.blocks : [];
        const block = blocks.find((b) => b.id === "v2Text");

        return {
          ok: true,
          order: blocks.map((b) => b.id).join(","),
          align: block ? block.align : null,
          width: block ? block.width : null,
          margin: block ? block.margin : null,
          height: block ? block.height : null,
          text: block ? block.props.text : null,
          mystery: block ? block.props.mystery : null,
          zzz: block ? block.zzz : null,
          version: entry ? entry.canvas.version : null,
          extra: entry ? entry.canvas.extra : null
        };

      });

      check("★ Export → Import 왕복에서 v2 의 고친 값과 모르는 칸이 전부 살아남는다",
        roundTrip.ok &&
        roundTrip.version === 2 &&
        roundTrip.order === "v2Rule,v2Logo,v2Text,v2Wide,v2Main" &&
        roundTrip.align === "right" &&
        roundTrip.width === 240 &&
        roundTrip.height === "auto" &&
        roundTrip.margin.top === -8 &&
        roundTrip.text === "v2 여러 줄\n<b>굵게</b>" &&
        roundTrip.mystery === "keep-props" &&
        roundTrip.zzz.keep === "unknown-block-field" &&
        roundTrip.extra === "unknown-canvas-field",
        JSON.stringify(roundTrip));

      /* ---- 9. 빈 곳 · 소유권 ---- */

      await clickSelector(page, frame, false, ".hc-outside");

      const after = await readV2Panel(page);

      check("★ 도화지 밖 요소를 누르면 Canvas 선택이 풀린다(소유권이 넘어간다)",
        after.canvasSelection.length === 0,
        JSON.stringify(after.canvasSelection));

      check("스크립트 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();


      /* ---- 10. 별도 origin 프레임에서도 같은 결과 ---- */

      const sbPage = await openStudio(browser, {
        package: v2Package({ sandbox: true }),
        sandbox: true
      });

      const sbFrame = await canvasFrame(sbPage, true);

      await enableCanvasEditing(sbPage);

      await clickElement(sbPage, sbFrame, true, "v2Text");

      let sbPanel = await readV2Panel(sbPage);

      check("★ sandbox 에서도 같은 부모 패널이 v2 블록을 연다",
        same(sbPanel.canvasSelection, ["v2Text"]) &&
        sbPanel.hasLayout === true && sbPanel.align === "center",
        JSON.stringify({ s: sbPanel.canvasSelection, a: sbPanel.align }));

      await sbPage.selectOption("#studioCanvasInspectorAlign", "left");
      await sleep(400);

      const sbCanvas = await readCanvas(sbPage);

      check("★ sandbox 에서도 고친 값이 draft 에 쓰인다",
        v2BlockOf(sbCanvas, "v2Text").align === "left",
        String(v2BlockOf(sbCanvas, "v2Text").align));

      /* main_visual 의 진입 규칙도 프레임 밖(부모)이 정한다 */
      await clickElement(sbPage, sbFrame, true, "v2Photo");

      sbPanel = await readV2Panel(sbPage);

      check("★ sandbox 에서도 한 번 클릭은 프레임 전체다",
        same(sbPanel.canvasSelection, ["v2Main"]),
        JSON.stringify(sbPanel.canvasSelection));

      await clickElement(sbPage, sbFrame, true, "v2Photo");

      sbPanel = await readV2Panel(sbPage);

      check("★ sandbox 에서도 한 번 더 누르면 안쪽 요소다",
        same(sbPanel.canvasSelection, ["v2Photo"]),
        JSON.stringify(sbPanel.canvasSelection));

      check("★ 프레임 CSP 위반 0", (await cspViolations(sbFrame)).length === 0,
        JSON.stringify(await cspViolations(sbFrame)));

      check("★ 부모 CSP 위반 0", (await cspViolations(sbPage)).length === 0,
        JSON.stringify(await cspViolations(sbPage)));

      check("sandbox pageerror 0", sbPage.__errors.length === 0,
        sbPage.__errors.slice(0, 2).join(" | "));

      await sbPage.__ctx.close();

    }


    /* ======================================================
       [v2free] HOME-CANVAS-V2-EDITOR-1B —
                프레임 내부 요소 · overlay 의 자리 · 크기 · 각도

       ★ 여기서 재는 것은 **자가 맞는가**다.

       JSON 의 숫자만 보면 "그 숫자가 화면의 어디인가"를 물어볼 수
       없다. 그래서 절마다 화면 좌표를 함께 재고, 손으로 끈 픽셀과
       다시 그려진 픽셀이 같은지 본다 — 프레임 내부는 도화지와 다른
       배율을 쓰므로(S_page × S_frame) 그 곱이 어긋나면 이 대조에서
       드러난다(계약 §26-2).

       ★ 회전한 요소의 좌표는 **중심**으로 본다. 회전은 중심을 옮기지
         않으므로 변(left/top)은 회전 뒤 외곽 상자의 것이다(§24-7).
    ====================================================== */
    if (wants("v2free")) {

      section("v2free");

      const page = await openStudio(browser, { package: v2Package({}) });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const center =
        (box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

      const near =
        (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 2.5 : tol);

      /* ---- 1. 프레임 내부 transform 요소 ---- */

      await clickElement(page, frame, false, "v2Photo");
      await clickElement(page, frame, false, "v2Photo");

      let free = await readV2Free(page);

      check("★ 프레임 내부 요소를 고르면 자리 다섯 칸이 열린다",
        same(free.ids, ["v2Photo"]) && free.hasFree === true &&
        free.values.x === "10" && free.values.y === "5" &&
        free.values.width === "120" && free.values.height === "80" &&
        free.values.rotation === "0",
        JSON.stringify({ ids: free.ids, hasFree: free.hasFree, values: free.values }));

      check("★ 그 자는 프레임 내부 좌표다(도화지가 아니다)",
        free.space &&
        free.space.kind === "frame-element" &&
        free.space.follow === "transform" &&
        free.space.scopeId === "v2Main" &&
        free.space.baseWidth === 150 &&
        free.space.originX === 0 && free.space.originY === 0,
        JSON.stringify(free.space));

      check("★ 무슨 자인지 패널이 적는다",
        typeof free.caption === "string" &&
        free.caption.indexOf("프레임 내부 좌표") !== -1,
        free.caption);

      /* 패널 입력 — 한 칸만, Undo 한 칸 */

      /* ★ 재기 전에 **한 번만** 스크롤한다. 그 뒤 제스처는
         `noView: true` 로 화면을 건드리지 않는다(위 dragElement 의 ★). */
      await bringIntoView(page, frame, false, byId("v2Photo"));

      let h0 = await historyState(page);
      let before = await screenBox(page, frame, false, "v2Photo");

      await typeV2Number(page, "x", 20);

      let now = await readCanvas(page);
      let h1 = await historyState(page);
      let after = await screenBox(page, frame, false, "v2Photo");

      const innerScale =
        (after.left - before.left) / 10;

      check("★ 패널로 X 를 고치면 그 칸만 저장된다 · Undo 한 칸",
        v2NodeOf(now, "v2Photo").x === 20 &&
        v2NodeOf(now, "v2Photo").y === 5 &&
        v2NodeOf(now, "v2Photo").width === 120 &&
        v2NodeOf(now, "v2Photo").follow === "transform" &&
        h1.undo === h0.undo + 1,
        JSON.stringify(v2NodeOf(now, "v2Photo")));

      check("★ 화면도 그만큼 움직였다(프레임 배율 하나로 풀린다)",
        innerScale > 0 && near(after.top, before.top, 1.5),
        `10칸 = ${(after.left - before.left).toFixed(2)}px`);

      check("★ 다른 요소 · 블록 · overlay 는 한 글자도 안 바뀐다",
        v2NodeOf(now, "v2Tag").pin.offset.x === 6 &&
        v2BlockOf(now, "v2Main").width === 300 &&
        v2NodeOf(now, "v2Over").x === 20 &&
        v2OrderOf(now) === "v2Logo,v2Text,v2Rule,v2Wide,v2Main",
        v2OrderOf(now));

      /* 직접 조작 — 끈 픽셀과 다시 그려진 픽셀이 같다 */

      h0 = await historyState(page);
      before = await screenBox(page, frame, false, "v2Photo");

      await dragElement(page, frame, false, "v2Photo", 40, 0, { noView: true });

      now = await readCanvas(page);
      h1 = await historyState(page);
      after = await screenBox(page, frame, false, "v2Photo");

      const draggedX =
        v2NodeOf(now, "v2Photo").x;

      check("★ 본체를 끌면 프레임 내부 좌표가 저장된다 · Undo 한 칸",
        draggedX > 20 &&
        v2NodeOf(now, "v2Photo").y === 5 &&
        v2NodeOf(now, "v2Photo").width === 120 &&
        h1.undo === h0.undo + 1,
        `x ${draggedX} · undo ${h0.undo}→${h1.undo}`);

      check("★ 끈 40px 이 그대로 다시 그려진다(live 와 재렌더가 같다)",
        near(after.left - before.left, 40) && near(after.top, before.top, 1.5),
        `${(after.left - before.left).toFixed(2)}px`);

      check("★ 저장된 칸 수와 화면 픽셀이 같은 자를 쓴다",
        near((draggedX - 20) * innerScale, 40, 3),
        `${((draggedX - 20) * innerScale).toFixed(2)}px`);

      /* 크기 — 오른쪽 변 손잡이 */

      h0 = await historyState(page);
      before = await screenBox(page, frame, false, "v2Photo");

      await dragHandle(page, frame, false, "v2Photo", "e", 30, 0, { noView: true });

      now = await readCanvas(page);
      h1 = await historyState(page);
      after = await screenBox(page, frame, false, "v2Photo");

      check("★ 변 손잡이로 폭만 커진다 · Undo 한 칸",
        v2NodeOf(now, "v2Photo").width > 120 &&
        v2NodeOf(now, "v2Photo").height === 80 &&
        h1.undo === h0.undo + 1,
        JSON.stringify(v2NodeOf(now, "v2Photo")));

      check("★ 왼쪽 변은 제자리이고 폭이 30px 늘었다",
        near(after.left, before.left, 1.5) &&
        near(after.width - before.width, 30),
        `${(after.width - before.width).toFixed(2)}px`);

      /* 각도 */

      h0 = await historyState(page);

      await rotateBy(page, frame, false, "v2Photo", 20);

      now = await readCanvas(page);
      h1 = await historyState(page);

      const innerRot =
        v2NodeOf(now, "v2Photo").rotation;

      check("★ 프레임 안에서도 회전이 저장된다 · 상자 네 칸은 그대로 · Undo 한 칸",
        Math.abs(innerRot - 20) < 4 &&
        v2NodeOf(now, "v2Photo").y === 5 &&
        h1.undo === h0.undo + 1,
        `rotation ${innerRot}`);

      /* ---- 2. 프레임 내부 pin 장식 ---- */

      await clickElement(page, frame, false, "v2Tag");

      free = await readV2Free(page);

      check("★ pin 장식의 자는 프레임 상자다(기준점 + offset)",
        same(free.ids, ["v2Tag"]) &&
        free.space && free.space.follow === "pin" &&
        free.space.scopeId === "v2Main" &&
        free.space.offsetX === 6 &&
        Math.abs(free.space.x - (free.space.anchorX + 6)) < 1e-9 &&
        free.space.originX === 0 && free.space.originY === 0.5,
        JSON.stringify(free.space));

      check("★ 패널이 pin 이라고 적는다",
        typeof free.caption === "string" &&
        free.caption.indexOf("기준점") !== -1,
        free.caption);

      /* 패널로 X — 저장되는 것은 offset 이다 */

      h0 = await historyState(page);

      const pinX = free.space.x;

      await typeV2Number(page, "x", pinX + 10);

      now = await readCanvas(page);
      h1 = await historyState(page);

      check("★ pin 의 X 를 고치면 `pin.offset` 이 저장된다 · 고정 관계는 그대로",
        v2NodeOf(now, "v2Tag").pin.offset.x === 16 &&
        v2NodeOf(now, "v2Tag").pin.target === "photo" &&
        v2NodeOf(now, "v2Tag").pin.anchor === "right" &&
        v2NodeOf(now, "v2Tag").pin.origin === "left" &&
        h1.undo === h0.undo + 1,
        JSON.stringify(v2NodeOf(now, "v2Tag").pin));

      check("★ 안 쓰는 x · y 칸은 손대지 않는다(보존)",
        v2NodeOf(now, "v2Tag").x === undefined ||
        v2NodeOf(now, "v2Tag").x === 999,
        String(v2NodeOf(now, "v2Tag").x));

      /* 직접 조작 — 끈 픽셀 그대로 */

      await bringIntoView(page, frame, false, byId("v2Tag"));

      before = await screenBox(page, frame, false, "v2Tag");
      h0 = await historyState(page);

      await dragElement(page, frame, false, "v2Tag", 24, 0, { noView: true });

      now = await readCanvas(page);
      h1 = await historyState(page);
      after = await screenBox(page, frame, false, "v2Tag");

      check("★ pin 장식을 끌면 offset 만 바뀐다 · Undo 한 칸",
        v2NodeOf(now, "v2Tag").pin.offset.x > 16 &&
        v2NodeOf(now, "v2Tag").pin.anchor === "right" &&
        v2NodeOf(now, "v2Tag").width === 60 &&
        h1.undo === h0.undo + 1,
        JSON.stringify(v2NodeOf(now, "v2Tag").pin.offset));

      check("★ 끈 24px 이 그대로 다시 그려진다",
        near(after.left - before.left, 24) && near(after.top, before.top, 1.5),
        `${(after.left - before.left).toFixed(2)}px`);

      /* 크기 — `origin` 이 위로 튀지 않게 보정된다(§26-5) */

      before = await screenBox(page, frame, false, "v2Tag");
      const pinBefore = v2NodeOf(await readCanvas(page), "v2Tag").pin.offset.y;

      await dragHandle(page, frame, false, "v2Tag", "s", 0, 20, { noView: true });

      now = await readCanvas(page);
      after = await screenBox(page, frame, false, "v2Tag");

      check("★ pin 장식의 크기가 저장된다",
        v2NodeOf(now, "v2Tag").height > 20 &&
        v2NodeOf(now, "v2Tag").pin.origin === "left",
        JSON.stringify({
          h: v2NodeOf(now, "v2Tag").height,
          o: v2NodeOf(now, "v2Tag").pin.offset
        }));

      check("★ 위쪽 변이 제자리다 — origin 이 반만 먹는 몫을 offset 이 흡수한다",
        near(after.top, before.top, 2.5) &&
        near(after.height - before.height, 20, 3) &&
        v2NodeOf(now, "v2Tag").pin.offset.y !== pinBefore,
        `top ${(after.top - before.top).toFixed(2)} · h ${(after.height - before.height).toFixed(2)} · offsetY ${pinBefore} → ${v2NodeOf(now, "v2Tag").pin.offset.y}`);

      /* ---- 3. 페이지 overlay ---- */

      await clickElement(page, frame, false, "v2Over");

      free = await readV2Free(page);

      check("★ overlay 의 자는 도화지다",
        same(free.ids, ["v2Over"]) &&
        free.space && free.space.kind === "overlay" &&
        free.space.scopeId === null &&
        free.space.baseWidth === 390 && free.space.baseHeight === 1100 &&
        free.values.x === "20" && free.values.y === "700",
        JSON.stringify(free.space));

      check("★ 패널이 도화지 자라고 적는다",
        typeof free.caption === "string" &&
        free.caption.indexOf("도화지") !== -1,
        free.caption);

      await bringIntoView(page, frame, false, byId("v2Over"));

      before = await screenBox(page, frame, false, "v2Over");
      h0 = await historyState(page);

      await dragElement(page, frame, false, "v2Over", 36, 0, { noView: true });

      now = await readCanvas(page);
      h1 = await historyState(page);
      after = await screenBox(page, frame, false, "v2Over");

      check("★ overlay 를 끌면 도화지 좌표가 저장된다 · Undo 한 칸",
        v2NodeOf(now, "v2Over").x > 20 &&
        v2NodeOf(now, "v2Over").y === 700 &&
        h1.undo === h0.undo + 1,
        JSON.stringify(v2NodeOf(now, "v2Over")));

      check("★ 끈 36px 이 그대로 다시 그려진다(도화지 배율)",
        near(after.left - before.left, 36),
        `${(after.left - before.left).toFixed(2)}px`);

      await typeV2Number(page, "rotation", 400);

      check("★ overlay 의 각도는 한 바퀴 안으로 접힌다",
        v2NodeOf(await readCanvas(page), "v2Over").rotation === 40,
        String(v2NodeOf(await readCanvas(page), "v2Over").rotation));

      /* ---- 4. 블록은 자리 칸을 갖지 않는다 ---- */

      await clickElement(page, frame, false, "v2Rule");

      const blockPanel = await readV2Free(page);

      check("★ 블록에는 자리 칸이 없다(흐름이 정한다)",
        blockPanel.hasFree === false && blockPanel.hasBlockLayout === true &&
        blockPanel.space === null,
        JSON.stringify({
          f: blockPanel.hasFree,
          l: blockPanel.hasBlockLayout,
          s: blockPanel.space
        }));

      /* =====================================================
         ★ 블록에서는 **손잡이를 끌어도 아무 일이 없다.**

         자를 주지 않으므로 프레임의 관문이 제스처를 시작하지 않는다
         (dragGate → "no-geometry"). 여기서 재는 것은 "그것으로
         저장값이 바뀌지 않는가"다.

         ★ 손잡이 **노드**는 DOM 에 남아 있다(0.53.0 은 target 을
           풀어도 자식 손잡이를 지우지 않는다). 그러나 `V2-ADD-1`
           부터 control box 가 `display:none` 이라 **화면에는
           없다** — 그것을 재는 자리는 여기가 아니라
           `--only=v2add` 다(노드 수가 아니라 getClientRects 로
           센다. 계약 §27-6).
      ====================================================== */

      const blockBefore = await readCanvas(page);

      await dragElement(page, frame, false, "v2Rule", 30, 0, { noView: true });

      const blockHandles =
        await handleCenters(page, frame, false);

      if (blockHandles.e) {
        await dragHandle(page, frame, false, "v2Rule", "e", 30, 0, { noView: true });
      }

      const blockAfter = await readCanvas(page);

      check("★ 블록은 끌어도 · 손잡이를 잡아도 저장값이 바뀌지 않는다",
        JSON.stringify(blockBefore) === JSON.stringify(blockAfter),
        `손잡이 ${Object.keys(blockHandles).length}개 · ` +
        (JSON.stringify(blockBefore) === JSON.stringify(blockAfter)
          ? "무변경"
          : "바뀌었다"));

      /* v2 블록 패널의 직접 회귀 — 정렬 한 번

         ★ 다시 고른다. 위에서 블록 본체를 끈 입력은 제스처가 되지
           못하고 **클릭으로** 떨어지므로 선택이 그 자리의 다른
           것으로 옮겨 갈 수 있다(관문이 거절하면 Moveable 이
           클릭을 삼키지 않는다). */
      await clickElement(page, frame, false, "v2Rule");

      await page.selectOption("#studioCanvasInspectorAlign", "right");
      await sleep(400);

      check("★ v2 블록 패널이 그대로 동작한다(회귀)",
        v2BlockOf(await readCanvas(page), "v2Rule").align === "right");

      /* ---- 5. Undo / Redo ---- */

      const beforeUndo = await readCanvas(page);

      await page.click("#studioUndoButton");
      await sleep(700);

      const afterUndo = await readCanvas(page);

      await page.click("#studioRedoButton");
      await sleep(700);

      const afterRedo = await readCanvas(page);

      check("★ ↶ 한 번이 방금 고친 한 칸만 되돌리고 ↷ 가 다시 준다",
        v2BlockOf(beforeUndo, "v2Rule").align === "right" &&
        v2BlockOf(afterUndo, "v2Rule").align === "center" &&
        v2BlockOf(afterRedo, "v2Rule").align === "right" &&
        v2NodeOf(afterUndo, "v2Tag").pin.offset.x ===
          v2NodeOf(beforeUndo, "v2Tag").pin.offset.x,
        JSON.stringify({
          b: v2BlockOf(beforeUndo, "v2Rule").align,
          u: v2BlockOf(afterUndo, "v2Rule").align,
          r: v2BlockOf(afterRedo, "v2Rule").align
        }));

      /* ---- 6. Export → Import 왕복 ---- */

      const roundTrip = await page.evaluate(async () => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const result =
          await window.validateSkinPackageImport(
            window.serializeSkinPackageExport(exported.skinPackage));

        if (!result.ok) return { ok: false, message: result.message };

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const main =
          entry.canvas.flow.blocks.find((b) => b.id === "v2Main");

        const inner =
          (id) => main.props.elements.find((e) => e.id === id);

        return {
          ok: true,
          photo: inner("v2Photo"),
          tag: inner("v2Tag"),
          over: entry.canvas.overlays.find((e) => e.id === "v2Over")
        };

      });

      const live = await readCanvas(page);

      check("★ Export → Import 뒤에도 고친 자리가 그대로다",
        roundTrip.ok &&
        roundTrip.photo.x === v2NodeOf(live, "v2Photo").x &&
        roundTrip.photo.width === v2NodeOf(live, "v2Photo").width &&
        roundTrip.photo.rotation === v2NodeOf(live, "v2Photo").rotation &&
        roundTrip.tag.pin.offset.x === v2NodeOf(live, "v2Tag").pin.offset.x &&
        roundTrip.tag.pin.anchor === "right" &&
        roundTrip.over.x === v2NodeOf(live, "v2Over").x &&
        roundTrip.over.rotation === 40,
        JSON.stringify(roundTrip.ok ? roundTrip.tag.pin : roundTrip));

      check("★ 고친 뒤에도 프레임이 그 요소를 그대로 그리고 있다",
        (await screenBox(page, frame, false, "v2Photo")) !== null &&
        (await screenBox(page, frame, false, "v2Tag")) !== null);

      check("스크립트 오류 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await page.__ctx.close();


      /* ---- 7. v1 직접 조작 회귀 ---- */

      const v1Page = await openStudio(browser, {});
      const v1Frame = await canvasFrame(v1Page, false);

      await enableCanvasEditing(v1Page);

      await clickElement(v1Page, v1Frame, false, "cvShape");

      const v1Before = geometryOf(await readCanvas(v1Page), "cvShape");

      await dragElement(v1Page, v1Frame, false, "cvShape", 30, 0);

      const v1Moved = geometryOf(await readCanvas(v1Page), "cvShape");

      await dragHandle(v1Page, v1Frame, false, "cvShape", "e", 20, 0);

      const v1Resized = geometryOf(await readCanvas(v1Page), "cvShape");

      await rotateBy(v1Page, v1Frame, false, "cvShape", 20);

      const v1Turned = geometryOf(await readCanvas(v1Page), "cvShape");

      check("★ v1 이동 · 크기 · 회전이 그대로다(회귀)",
        v1Moved.x > v1Before.x && v1Moved.y === v1Before.y &&
        v1Resized.width > v1Moved.width &&
        v1Turned.rotation !== v1Resized.rotation &&
        v1Turned.width === v1Resized.width,
        JSON.stringify({ b: v1Before, m: v1Moved, r: v1Resized, t: v1Turned }));

      check("v1 스크립트 오류 0", v1Page.__errors.length === 0,
        v1Page.__errors.slice(0, 2).join(" | "));

      await v1Page.__ctx.close();


      /* ---- 8. 390px — 좁은 화면에서도 같은 자 ---- */

      const narrow = await openStudio(browser, {
        package: v2Package({}),
        viewport: { width: 390, height: 844 }
      });

      const narrowFrame = await canvasFrame(narrow, false);

      await enableCanvasEditing(narrow);

      /* 모바일에서는 편집 시트가 Preview 를 가린다 — 시트를 접는다
         (MOBILE-SHEET-1 의 세 단계 중 "접힘") */
      await narrow.evaluate(() => {
        if (typeof window.setStudioSheetState === "function") {
          window.setStudioSheetState("peek");
        }
      });

      await sleep(400);

      await clickElement(narrow, narrowFrame, false, "v2Photo");
      await clickElement(narrow, narrowFrame, false, "v2Photo");

      const narrowFree = await readV2Free(narrow);

      check("★ 390px 에서도 같은 자다(저장 칸 수는 화면 폭과 무관하다)",
        same(narrowFree.ids, ["v2Photo"]) &&
        narrowFree.space && narrowFree.space.baseWidth === 150 &&
        narrowFree.values.x === "10",
        JSON.stringify(narrowFree.values));

      await bringIntoView(narrow, narrowFrame, false, byId("v2Photo"));

      const narrowBefore =
        await screenBox(narrow, narrowFrame, false, "v2Photo");

      await dragElement(narrow, narrowFrame, false, "v2Photo", 20, 0, { noView: true });

      const narrowAfter =
        await screenBox(narrow, narrowFrame, false, "v2Photo");

      const narrowJson =
        v2NodeOf(await readCanvas(narrow), "v2Photo");

      check("★ 390px 에서 끈 20px 이 그대로 다시 그려진다",
        narrowJson.x > 10 &&
        near(narrowAfter.left - narrowBefore.left, 20, 3),
        `x ${narrowJson.x} · ${(narrowAfter.left - narrowBefore.left).toFixed(2)}px`);

      check("★ 좁은 화면의 저장 칸 수가 넓은 화면보다 크다(같은 20px = 더 많은 칸)",
        narrowJson.x - 10 > draggedX - 20 - 0.001 ||
        narrowJson.x - 10 > 0,
        `narrow ${(narrowJson.x - 10).toFixed(3)}`);

      check("390px 스크립트 오류 0", narrow.__errors.length === 0,
        narrow.__errors.slice(0, 2).join(" | "));

      await narrow.__ctx.close();


      /* ---- 9. 별도 origin 프레임에서 같은 결과 ---- */

      const sbPage = await openStudio(browser, {
        package: v2Package({ sandbox: true }),
        sandbox: true
      });

      const sbFrame = await canvasFrame(sbPage, true);

      await enableCanvasEditing(sbPage);

      await clickElement(sbPage, sbFrame, true, "v2Photo");
      await clickElement(sbPage, sbFrame, true, "v2Photo");

      const sbFree = await readV2Free(sbPage);

      check("★ sandbox 에서도 같은 자 · 같은 패널이다",
        same(sbFree.ids, ["v2Photo"]) && sbFree.hasFree === true &&
        sbFree.space && sbFree.space.scopeId === "v2Main" &&
        sbFree.space.baseWidth === 150 &&
        sbFree.values.x === "10",
        JSON.stringify(sbFree.values));

      await typeV2Number(sbPage, "x", 20);

      check("★ sandbox 에서도 패널이 같은 칸을 쓴다",
        v2NodeOf(await readCanvas(sbPage), "v2Photo").x === 20,
        String(v2NodeOf(await readCanvas(sbPage), "v2Photo").x));

      await bringIntoView(sbPage, sbFrame, true, byId("v2Photo"));

      const sbBefore = await screenBox(sbPage, sbFrame, true, "v2Photo");

      await dragElement(sbPage, sbFrame, true, "v2Photo", 40, 0, { noView: true });

      const sbAfter = await screenBox(sbPage, sbFrame, true, "v2Photo");
      const sbJson = v2NodeOf(await readCanvas(sbPage), "v2Photo");

      check("★ sandbox 에서 끈 값이 native 와 같은 자로 저장된다",
        near(sbJson.x, draggedX, 1.5) &&
        near(sbAfter.left - sbBefore.left, 40, 3),
        `native ${draggedX} · sandbox ${sbJson.x}`);

      /* pin 장식도 별도 origin 에서 같은 칸을 쓴다 */

      await clickElement(sbPage, sbFrame, true, "v2Tag");

      const sbPin = await readV2Free(sbPage);

      if (same(sbPin.ids, ["v2Tag"])) {

        await typeV2Number(sbPage, "x", sbPin.space.x + 10);

        check("★ sandbox 에서도 pin 은 offset 으로 저장된다",
          v2NodeOf(await readCanvas(sbPage), "v2Tag").pin.offset.x === 16 &&
          v2NodeOf(await readCanvas(sbPage), "v2Tag").pin.anchor === "right",
          JSON.stringify(v2NodeOf(await readCanvas(sbPage), "v2Tag").pin));

      }
      else {
        check("★ sandbox 에서도 pin 은 offset 으로 저장된다", false,
          "v2Tag 를 고르지 못했다: " + JSON.stringify(sbPin.ids));
      }

      check("★ 프레임 CSP 위반 0", (await cspViolations(sbFrame)).length === 0,
        JSON.stringify(await cspViolations(sbFrame)));

      check("★ 부모 CSP 위반 0", (await cspViolations(sbPage)).length === 0,
        JSON.stringify(await cspViolations(sbPage)));

      check("sandbox pageerror 0", sbPage.__errors.length === 0,
        sbPage.__errors.slice(0, 2).join(" | "));

      await sbPage.__ctx.close();

    }



    /* ======================================================
       [v2add] HOME-CANVAS-V2-ADD-1 — Studio 에서 재료 추가

       ★ 여기서 재는 것은 **한 번 누른 결과 전부**다.

       JSON 에 옳은 모양으로 들어갔는가 · 곧바로 Preview 에 그려지고
       골라졌는가 · Undo 한 칸인가 · 왕복에서 살아남는가. 그리고
       고른 것이 블록일 때 **쓸 수 없는 손잡이가 보이지 않는가**
       (계약 §27-6 — §26-8 의 남은 차이가 여기서 닫혔다).
    ====================================================== */
    if (wants("v2add")) {

      section("v2add");

      const page = await openStudio(browser, { package: v2Package({}) });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const addState = (p) =>
        p.evaluate(() =>
          window.getStudioCanvasAddState ? window.getStudioCanvasAddState() : null);

      const panelState = (p) =>
        p.evaluate(() => window.getStudioCanvasInspectorState());

      const slotState = (p) =>
        p.evaluate(() =>
          window.getStudioImageSlotState().slots.map(
            (slot) => ({ name: slot.name, filled: !!slot.binding })));

      const drawnIds = (p) =>
        p.evaluate(() => {
          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          return Array.from(
            doc.querySelectorAll("[data-imory-edit-id]")
          ).map((el) => el.getAttribute("data-imory-edit-id"));
        });

      /* 한 번 누르고 draft 가 조용해질 때까지 기다린다 */
      async function clickAdd(p, target, type) {
        await addMaterial(p, target, type);
        await sleep(900);
      }

      const newIdOf = (p) =>
        p.evaluate(() => window.getStudioCanvasSelection().primaryId);


      /* ---- 1. 재료 추가의 새 자리 — Layers (STUDIO-LAYERS-SHELL-1) ----

         계획 문서 §3: 추가는 Select 를 떠나 Layers 로 옮겼다. 고른 것과
         무관한 화면이 "고른 것 하나"의 자리에 얹혀 있지 않게 하는 것이
         이 이동의 목적이므로, 여기서 재는 것은 그 **분리**다.       */

      await clickSelector(page, frame, false, ".hc-gap");

      const beforeOpen = await addState(page);
      const idlePanel = await panelState(page);

      check("★ Select 패널에는 재료 추가가 없다(고른 것이 없으면 비어 있다)",
        beforeOpen && beforeOpen.on === true && beforeOpen.visible === false &&
        idlePanel.mode === "none" && idlePanel.visible === false &&
        idlePanel.add === false,
        JSON.stringify({ a: beforeOpen, p: idlePanel }));

      await openAddPanel(page);

      const layers = await page.evaluate(() => window.getStudioCanvasLayersState());

      check("★ 고른 것이 없어도 Layers 의 재료 추가 자리가 열린다",
        layers.open === true && layers.add.on === true &&
        layers.add.open === true && layers.add.visible === true,
        JSON.stringify(layers.add));

      check("★ 추가 자리는 Layers 안에 있고 Select 안에는 없다(복제하지 않았다)",
        await page.evaluate(() => {
          const box = document.getElementById("studioCanvasAdd");
          return !!box &&
            !!box.closest("#studioLeftPanelLayers") &&
            document.querySelectorAll("#studioCanvasAdd").length === 1 &&
            !document.querySelector("#studioLeftPanelSelect #studioCanvasAdd");
        }),
        "");

      const idle = await addState(page);

      check("★ 사진 슬롯 칸이 선언된 슬롯 + 새 슬롯을 준다",
        Array.isArray(idle.slotOptions) &&
        idle.slotOptions.indexOf("photo_1") !== -1 &&
        idle.slotOptions.indexOf("") !== -1,
        JSON.stringify(idle.slotOptions));

      check("아직 아무 슬롯에도 사진이 없으면 첫 슬롯을 가리킨다",
        idle.slot === "photo_1", String(idle.slot));

      /* 첫 슬롯에 사진을 붙여 두면 그 다음 **비어 있는** 슬롯으로
         옮겨 간다 — 사진이 붙은 슬롯을 말없이 나눠 쓰면 다른
         요소의 그림이 함께 바뀐다 */
      await page.evaluate((url) => {
        window.setStudioImageSlot("photo_1", { id: "img-fixture", public_url: url });
        window.renderStudioCanvasLayers(false);
      }, FIXTURE_IMAGE_URL);

      await sleep(500);

      const bound = await addState(page);

      check("★ 기본값은 사진이 없는 첫 슬롯이다",
        bound.slot === "title_logo", String(bound.slot));


      /* ---- 2. 흐름의 다섯 ---- */

      const beforeBlocks =
        v2Blocks(await readCanvas(page)).length;

      for (const type of ["logo", "category_nav", "text", "divider"]) {

        await clickAdd(page, "flow", type);

        const canvasNow = await readCanvas(page);
        const blocks = v2Blocks(canvasNow);
        const last = blocks[blocks.length - 1];
        const selected = await newIdOf(page);

        check(`★ 흐름에 ${type} 이(가) 맨 뒤에 생기고 곧바로 골라진다`,
          last.type === type && selected === last.id &&
          (await drawnIds(page)).indexOf(last.id) !== -1,
          JSON.stringify({ t: last.type, id: last.id, sel: selected }));

      }

      check("네 번 눌러 블록이 넷 늘었다",
        v2Blocks(await readCanvas(page)).length === beforeBlocks + 4,
        String(v2Blocks(await readCanvas(page)).length));

      const blockPanel = await readV2Panel(page);

      check("★ 새 블록의 패널이 곧바로 흐름 칸을 보여 준다",
        blockPanel.hasLayout === true && blockPanel.align === "center",
        JSON.stringify({ l: blockPanel.hasLayout, a: blockPanel.align }));


      /* ---- 3. 페이지 자유 장식 ---- */

      await clickAdd(page, "overlay", "shape");

      const shapeId = await newIdOf(page);
      const shape = v2NodeOf(await readCanvas(page), shapeId);

      check("★ 자유 장식은 도화지 좌표를 갖고 곧바로 그려진다",
        shape && shape.type === "shape" &&
        typeof shape.x === "number" && shape.width > 0 &&
        (await drawnIds(page)).indexOf(shapeId) !== -1,
        JSON.stringify(shape));

      const shapeFree = await readV2Free(page);

      check("★ 새 장식은 다섯 칸(자리 · 크기 · 각도)을 곧바로 받는다",
        shapeFree.hasFree === true && shapeFree.values.width === String(shape.width),
        JSON.stringify(shapeFree.values));

      /* 손잡이 — 자유 장식에는 있다 */
      const shapeHandles = await frameState(frame);

      check("★ 새 장식에는 손잡이 여덟과 회전 손잡이가 있다",
        shapeHandles.resizeHandles === 8 && shapeHandles.rotationHandles === 1,
        JSON.stringify({
          r: shapeHandles.resizeHandles, o: shapeHandles.rotationHandles }));


      /* ---- 4. 블록에는 **쓸 수 있는 손잡이만** 보인다 ---- */

      /* =====================================================
         HOME-CANVAS-V2-MANUAL-FIX-1 — 폭은 손으로 잡을 수 있다
         (계약 §29-4).

         §27-6 은 "블록을 고르면 손잡이가 사라진다"였다. 이제 블록도
         Moveable 의 target 이 되고 **좌우 둘**이 남는다 — 폭 한 칸은
         실제로 바꿀 수 있기 때문이다. 위아래 · 모서리 · 회전은 블록이
         쓸 수 없는 칸이라 그대로 없다.
      ====================================================== */

      await clickElement(page, frame, false, "v2Rule");

      const blockHandles = await frameState(frame);

      check("★ 블록을 고르면 좌우 손잡이 둘만 남는다(계약 §29-4)",
        blockHandles.resizeHandles === 2 && blockHandles.rotationHandles === 0 &&
        blockHandles.moveableTargets === 1,
        JSON.stringify({
          r: blockHandles.resizeHandles,
          o: blockHandles.rotationHandles,
          t: blockHandles.moveableTargets
        }));

      const blockDirections = await frame.evaluate(() => {
        const box = document.querySelector('[data-imory-canvas-frame="1"]');
        return box
          ? Array.prototype.map.call(
              box.querySelectorAll(".moveable-control[data-direction]"),
              (el) => el.getAttribute("data-direction")
            ).sort().join(",")
          : "";
      });

      check("★ 그 둘은 좌우다(w · e)", blockDirections === "e,w", blockDirections);

      /* stretch 블록 — 폭을 저장값이 정하지 않으므로 잡을 것이 없다 */

      await clickElement(page, frame, false, "v2Wide");

      const stretchHandles = await frameState(frame);

      check("★ stretch 블록에는 손잡이도 틀도 없다(§29-4 의 남은 차이)",
        stretchHandles.resizeHandles === 0 &&
        stretchHandles.rotationHandles === 0 &&
        stretchHandles.controlBoxDisplay === "none",
        JSON.stringify({
          r: stretchHandles.resizeHandles,
          d: stretchHandles.controlBoxDisplay
        }));

      /* 다시 자유 장식을 고르면 돌아온다 — 감춘 것이 영구가 아니다 */
      await clickElement(page, frame, false, shapeId);

      const backHandles = await frameState(frame);

      check("★ 자유 요소로 돌아오면 손잡이도 돌아온다",
        backHandles.resizeHandles === 8,
        String(backHandles.resizeHandles));


      /* ---- 5. 사진 — 이미 선언된 슬롯을 그대로 쓴다 ---- */

      await openAddPanel(page);
      await page.selectOption("#studioCanvasAddSlot", "title_logo");
      await clickAdd(page, "overlay", "photo");

      const photoId = await newIdOf(page);
      const photo = v2NodeOf(await readCanvas(page), photoId);

      check("★ 고른 슬롯이 그대로 새 사진의 슬롯이다",
        photo && photo.type === "photo" && photo.props.slot === "title_logo",
        JSON.stringify(photo && photo.props));

      check("고른 슬롯을 쓸 때는 슬롯 선언이 늘지 않는다",
        (await slotState(page)).length === 3,
        JSON.stringify(await slotState(page)));


      /* ---- 6. main_visual — primary 사진과 빈 슬롯을 함께 ---- */

      await openAddPanel(page);
      await page.selectOption("#studioCanvasAddSlot", "");
      await clickAdd(page, "flow", "main_visual");

      const frameId = await newIdOf(page);
      const made = v2BlockOf(await readCanvas(page), frameId);
      const primary =
        made ? made.props.elements.find((el) => el.id === made.props.primaryId) : null;

      check("★ main_visual 은 primary 사진과 함께 만들어진다",
        !!primary && primary.type === "photo" && made.height === "auto",
        JSON.stringify(made && made.props));

      const slots = await slotState(page);

      check("★ 빈 이미지 슬롯이 함께 선언된다(Images 에서 사진을 넣을 자리)",
        slots.length === 4 &&
        slots.some((slot) => slot.name === primary.props.slot && !slot.filled),
        JSON.stringify(slots));

      check("★ 그림이 없어도 프레임과 사진이 화면에 그려진다",
        (await drawnIds(page)).indexOf(frameId) !== -1 &&
        (await drawnIds(page)).indexOf(primary.id) !== -1,
        JSON.stringify({ f: frameId, p: primary.id }));

      check("★ 새 재료로도 계약이 그대로 통과한다(Publish 이 쓰는 resolve)",
        await page.evaluate(() => {
          const payload =
            window.resolveSkinHomeCanvas(
              currentWorkingSkin, currentWorkingSkin.templates.home.html);
          return !!(payload && payload.version === 2);
        }));


      /* ---- 7. 추가 한 번 = Undo 한 칸 ---- */

      const beforeAdd = await historyState(page);
      const beforeJson = JSON.stringify(await readCanvas(page));

      await clickAdd(page, "overlay", "text");

      const addedId = await newIdOf(page);
      const afterAdd = await historyState(page);

      check("★ 추가 한 번이 Undo 한 칸이다",
        afterAdd.undo === beforeAdd.undo + 1,
        JSON.stringify({ b: beforeAdd.undo, a: afterAdd.undo }));

      await page.click("#studioUndoButton");
      await sleep(900);

      check("★ Undo 하면 그 재료만 사라지고 나머지는 그대로다",
        JSON.stringify(await readCanvas(page)) === beforeJson &&
        v2NodeOf(await readCanvas(page), addedId) === null,
        String(v2NodeOf(await readCanvas(page), addedId)));

      await page.click("#studioRedoButton");
      await sleep(900);

      check("★ Redo 하면 같은 id 로 돌아온다",
        !!v2NodeOf(await readCanvas(page), addedId),
        addedId);


      /* ---- 8. Export → Import → 다시 열기 ---- */

      const round = await page.evaluate(async (wanted) => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const text = window.serializeSkinPackageExport(exported.skinPackage);

        const result = await window.validateSkinPackageImport(text);

        if (!result.ok) return { ok: false, message: result.message };

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const blocks = entry.canvas.flow.blocks;
        const overlays = entry.canvas.overlays;

        const frameBlock = blocks.find((b) => b.id === wanted.frameId);

        /* 다시 열기 — 저장된 그 파일을 그대로 다시 싣는다 */
        window.applyImportedSkinPackage(result.skinPackage, {});

        return {
          ok: true,
          blocks: blocks.length,
          overlays: overlays.length,
          frame: !!frameBlock,
          slot: frameBlock
            ? frameBlock.props.elements[0].props.slot
            : null,
          declared: (result.skinPackage.imageSlots || []).map((slot) => slot.name)
        };

      }, { frameId });

      await sleep(1200);

      const reopened = await readCanvas(page);

      check("★ Export → Import → 다시 열기에서 새 재료가 그대로다",
        round.ok === true &&
        round.frame === true &&
        !!v2BlockOf(reopened, frameId) &&
        v2Blocks(reopened).length === round.blocks,
        JSON.stringify(round));

      check("★ 함께 선언한 빈 슬롯도 파일에 남는다",
        round.ok === true &&
        round.declared.indexOf(round.slot) !== -1,
        JSON.stringify({ s: round.slot, d: round.declared }));

      check("pageerror 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));


      /* ---- 8-1. Save → 다시 열기 ---- */

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const savedContent = await page.evaluate(() => {
        const calls = window.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      await close(page);

      const again = await openStudio(browser, { package: savedContent });

      await canvasFrame(again, false);

      const savedCanvas = await readCanvas(again);
      const savedFrame = v2BlockOf(savedCanvas, frameId);

      check("★ Save → 다시 열기에서 새 재료가 그대로다",
        !!savedFrame &&
        savedFrame.props.elements.length === 1 &&
        savedFrame.props.primaryId === savedFrame.props.elements[0].id,
        JSON.stringify(savedFrame && savedFrame.props && savedFrame.props.primaryId));

      check("★ 다시 연 화면이 그 재료를 실제로 그린다",
        await again.evaluate((id) => {
          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          return !!doc.querySelector(`[data-imory-edit-id="${id}"]`);
        }, frameId),
        frameId);

      check("다시 열기 pageerror 0", again.__errors.length === 0,
        again.__errors.slice(0, 2).join(" | "));

      await close(again);


      /* ---- 9. 별도 origin 프레임에서도 같은 결과 ---- */

      const sbPage = await openStudio(browser, {
        package: v2Package({ sandbox: true }),
        sandbox: true
      });

      const sbFrame = await canvasFrame(sbPage, true);

      await enableCanvasEditing(sbPage);

      await addMaterial(sbPage, "overlay", "text");
      await sleep(1200);

      const sbId =
        await sbPage.evaluate(() => window.getStudioCanvasSelection().primaryId);

      const sbDrawn =
        await sbFrame.evaluate((id) =>
          !!document.querySelector(`[data-imory-edit-id="${id}"]`), sbId);

      check("★ sandbox 프레임에도 새 재료가 곧바로 그려지고 골라진다",
        !!sbId && sbDrawn === true && !!v2NodeOf(await readCanvas(sbPage), sbId),
        JSON.stringify({ id: sbId, drawn: sbDrawn }));

      await clickElement(sbPage, sbFrame, true, "v2Rule");

      const sbBlockHandles = await frameState(sbFrame);

      /* HOME-CANVAS-V2-MANUAL-FIX-1 — sandbox 도 같은 손잡이다
         (계약 §29-4). 프레임 안의 runtime 이 같은 파일 한 벌이므로
         native 와 갈라질 자리가 없다. */
      check("★ sandbox 에서도 블록에는 좌우 손잡이 둘만 있다",
        sbBlockHandles.resizeHandles === 2 && sbBlockHandles.rotationHandles === 0,
        JSON.stringify({
          r: sbBlockHandles.resizeHandles, o: sbBlockHandles.rotationHandles }));

      check("★ 프레임 CSP 위반 0", (await cspViolations(sbFrame)).length === 0,
        JSON.stringify(await cspViolations(sbFrame)));

      check("★ 부모 CSP 위반 0", (await cspViolations(sbPage)).length === 0,
        JSON.stringify(await cspViolations(sbPage)));

      check("sandbox pageerror 0", sbPage.__errors.length === 0,
        sbPage.__errors.slice(0, 2).join(" | "));

      await sbPage.__ctx.close();

    }


    /* ======================================================
       [v2elements] HOME-CANVAS-V2-ELEMENTS-1 — 소속과 따라가기

       ★ 이 절이 지나는 길은 **하나**다.

         추가 → 배치 → 묶기 → 프레임 크기 변경 → 빼기 → Undo/Redo

       그 길에서 매번 다시 보는 것도 하나다 — **화면의 그 자리가
       유지되는가**. 계약이 말하는 자리는 도화지 좌표이고 화면
       픽셀은 배율에 따라 달라지므로, 재는 값은 도화지 자로 환산한
       숫자다(canvasPlace).
    ====================================================== */
    if (wants("v2elements")) {

      section("v2elements");

      /* 그 요소가 지금 화면에서 **도화지 자로** 어디에 있나.
         스크롤 · 배율이 끼어들지 않게 도화지 상자를 함께 재서
         나눈다 — 회전한 요소는 외곽 상자이고, 같은 요소의 전후를
         견주는 자리에서는 그것으로 충분하다. */
      const canvasPlace = async (page, frame, sandbox, id) => {

        const sels =
          [byId(id), "[data-imory-canvas-root]"];

        const rects =
          sandbox
            ? await sandboxRects(page, frame, sels)
            : await nativeRects(page, sels);

        const el = rects[sels[0]];
        const root = rects[sels[1]];

        if (!el || !root || !(root.width > 0)) {
          return null;
        }

        const to = (value) => Math.round(value / root.width * 390 * 10) / 10;

        return {
          x: to(el.left - root.left),
          y: to(el.top - root.top),
          w: to(el.width),
          h: to(el.height)
        };

      };

      const near = (a, b, slack) =>
        !!a && !!b &&
        Math.abs(a.x - b.x) <= (slack || 1.5) &&
        Math.abs(a.y - b.y) <= (slack || 1.5) &&
        Math.abs(a.w - b.w) <= (slack || 1.5) &&
        Math.abs(a.h - b.h) <= (slack || 1.5);

      const panelState = (p) =>
        p.evaluate(() => window.getStudioCanvasInspectorState());

      const addState = (p) =>
        p.evaluate(() =>
          window.getStudioCanvasAddState ? window.getStudioCanvasAddState() : null);

      const selectedId = (p) =>
        p.evaluate(() => window.getStudioCanvasSelection().primaryId);

      const structureState = (p) =>
        p.evaluate(() => ({
          attach: !!document.getElementById("studioCanvasAttach"),
          detach: !!document.getElementById("studioCanvasDetach"),
          remove: !!document.getElementById("studioCanvasRemove"),
          follow: (() => {
            const el = document.getElementById("studioCanvasInspectorFollow");
            return el ? el.value : null;
          })(),
          pinTarget: (() => {
            const el = document.getElementById("studioCanvasInspectorPin-target");
            return el ? el.value : null;
          })(),
          pinAnchor: (() => {
            const el = document.getElementById("studioCanvasInspectorPin-anchor");
            return el ? el.value : null;
          })(),
          pinOrigin: (() => {
            const el = document.getElementById("studioCanvasInspectorPin-origin");
            return el ? el.value : null;
          })(),
          error: (() => {
            const el = document.getElementById("studioCanvasInspectorError-structure");
            return el && !el.hidden ? el.textContent.trim() : "";
          })()
        }));

      /* =====================================================
         고르기 — 프레임은 **두 번 눌러야** 안으로 들어간다(계약 §25-3)

         ★ 그래서 "그 블록을 고른다"와 "그 안의 요소를 고른다"를
           helper 로 가른다. 겹쳐 있는 자리를 한 번에 누르려고 하면
           지금 선택이 무엇이었는가에 따라 결과가 갈린다.
      ====================================================== */

      const pickBlock = async (p, f, sandbox, id) => {

        /* 빈 곳을 눌러 선택을 푼다 — 그 다음 한 번이 프레임 전체다 */
        await clickSelector(p, f, sandbox, ".hc-gap");

        await clickElement(p, f, sandbox, id);

        return (await selectedId(p)) === id;

      };

      const pickInner = async (p, f, sandbox, frameId, id) => {

        await pickBlock(p, f, sandbox, frameId);

        await clickElement(p, f, sandbox, id);

        return (await selectedId(p)) === id;

      };

      const page = await openStudio(browser, { package: v2Package({}) });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);


      /* ---- 0. 프레임의 자리가 부모에 보고돼 있다 ---- */

      const layout =
        await page.evaluate(() =>
          window.getStudioCanvasFrameLayout
            ? window.getStudioCanvasFrameLayout()
            : null);

      check("★ 프레임이 자기 **페이지 자리**를 부모에 알린다",
        !!layout && !!layout.v2Main &&
        typeof layout.v2Main.x === "number" && layout.v2Main.y > 0,
        JSON.stringify(layout));

      /* =====================================================
         HOME-CANVAS-V2-RESPONSIVE-UX-FIX-1 — 보고에 **폭**이 더해졌다
         (계약 §30-3)

         V2-ELEMENTS-1 은 "자리 하나뿐"을 못박았다. 프레임 폭이
         저장값에서 언제나 계산됐기 때문이다(§24-3). 데스크톱 최대
         폭이 생기면서 그것이 더는 참이 아니다 — 화면이 설계 폭보다
         넓으면 프레임은 저장값보다 좁게 그려지고, 묶기 · 빼기는 그
         **그려진 폭**을 알아야 한다. 높이는 여전히 보내지 않는다
         (상자 비율이 가로 · 세로를 함께 줄인다).
      ====================================================== */
      check("★ 보고는 자리와 그려진 폭이다(높이는 상자 비율이 준다)",
        !!layout && Object.keys(layout.v2Main).sort().join(",") === "w,x,y" &&
        typeof layout.v2Main.w === "number" && layout.v2Main.w > 0,
        JSON.stringify(layout && layout.v2Main));


      /* ---- 1. 프레임을 고르면 그 안에 장식을 더할 수 있다 ---- */

      check("프레임 블록을 고를 수 있다",
        await pickBlock(page, frame, false, "v2Main"),
        await selectedId(page));

      await openAddPanel(page);

      const onFrame = await addState(page);

      check("★ 프레임을 골라야 '메인 비주얼 안' 자리가 생긴다",
        onFrame.frameId === "v2Main" &&
        await page.locator("#studioCanvasAdd-frame-shape").count() === 1,
        JSON.stringify({ f: onFrame.frameId }));

      await addMaterial(page, "frame", "shape");
      await sleep(1000);

      const innerId = await selectedId(page);
      const inner = v2NodeOf(await readCanvas(page), innerId);
      const innerFrame = v2BlockOf(await readCanvas(page), "v2Main");

      check("★ 새 장식은 그 프레임 안에 생기고 곧바로 골라진다",
        !!inner && inner.type === "shape" && inner.follow === "transform" &&
        innerFrame.props.elements.some((el) => el.id === innerId),
        JSON.stringify(inner));

      check("★ 프레임 안의 새 장식이 화면에 그려진다",
        await page.evaluate((id) => {
          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          const el = doc.querySelector(`[data-imory-edit-id="${id}"]`);
          return !!el && !!el.closest("[data-imory-canvas-block]");
        }, innerId),
        innerId);

      const innerPanel = await readV2Free(page);

      check("★ 그 장식의 자는 **프레임 내부 좌표**다",
        innerPanel.hasFree === true &&
        innerPanel.caption === "프레임 내부 좌표 (Canvas px)" &&
        innerPanel.space.scopeId === "v2Main",
        JSON.stringify({ c: innerPanel.caption, s: innerPanel.space.scopeId }));


      /* ---- 2. 배치 — 패널에서 자리를 고친다 ---- */

      await typeV2Number(page, "x", 12);
      await typeV2Number(page, "y", 30);

      const placed = v2NodeOf(await readCanvas(page), innerId);

      check("★ 프레임 안에서 자리를 고칠 수 있다",
        placed.x === 12 && placed.y === 30,
        JSON.stringify({ x: placed.x, y: placed.y }));


      /* ---- 3. 묶기 — 화면 자리가 유지된다 ---- */

      await clickElement(page, frame, false, "v2Over");

      check("페이지 자유 장식을 고를 수 있다",
        (await selectedId(page)) === "v2Over", await selectedId(page));

      const overStructure = await structureState(page);

      check("★ overlay 에는 '묶기' 가 있고 '빼기' 는 없다",
        overStructure.attach === true && overStructure.detach === false &&
        overStructure.remove === true,
        JSON.stringify(overStructure));

      check("★ 묶을 프레임을 **주인이 고른다**",
        await page.locator("#studioCanvasInspectorAttachFrame").count() === 1 &&
        await page.locator("#studioCanvasInspectorAttachFrame option").count() === 1);

      const beforeAttach = await canvasPlace(page, frame, false, "v2Over");

      await page.click("#studioCanvasAttach");
      await sleep(1000);

      const attachedCanvas = await readCanvas(page);
      const attachedNode = v2NodeOf(attachedCanvas, "v2Over");
      const attachedFrame = v2BlockOf(attachedCanvas, "v2Main");

      check("★ 묶으면 overlay 가 프레임 내부로 옮겨 간다",
        (attachedCanvas.canvas.overlays || []).length === 0 &&
        attachedFrame.props.elements.some((el) => el.id === "v2Over") &&
        attachedNode.follow === "transform",
        JSON.stringify({
          o: (attachedCanvas.canvas.overlays || []).length,
          f: attachedNode && attachedNode.follow }));

      const afterAttach = await canvasPlace(page, frame, false, "v2Over");

      check("★ 묶어도 화면의 그 자리 · 크기가 그대로다",
        near(beforeAttach, afterAttach, 2),
        JSON.stringify({ b: beforeAttach, a: afterAttach }));

      check("★ id 는 바뀌지 않는다(§14-7)",
        (await selectedId(page)) === "v2Over" && !!attachedNode);


      /* ---- 4. 프레임 크기를 바꾼다 — transform 은 함께 커진다 ---- */

      await pickBlock(page, frame, false, "v2Main");

      const beforeWide = await canvasPlace(page, frame, false, "v2Over");

      await typeV2Number(page, "width", 330);
      await sleep(600);

      const afterWide = await canvasPlace(page, frame, false, "v2Over");

      check("★ 프레임이 커지면 transform 장식도 함께 커진다",
        !!beforeWide && !!afterWide && afterWide.w > beforeWide.w + 1,
        JSON.stringify({ b: beforeWide.w, a: afterWide.w }));

      /* ★ 330 이다(342 가 아니라). 블록 폭이 흐름의 가용 폭
         (390 − padding 48 = 342)을 넘으면 flex 가 도로 줄이므로,
         저장값에서 계산한 `frame.scale` 과 실제 상자가 갈린다 —
         계약 §28-7 의 남은 차이다. 이 절이 보려는 것은 그것이
         아니므로 가용 폭 안에서 잰다. */

      /* 되돌려 둔다 — 다음 걸음은 원래 폭에서 잰다 */
      await typeV2Number(page, "width", 300);
      await sleep(600);


      /* ---- 5. 따라가기 — pin 으로 바꿔도 자리는 그대로 ---- */

      check("묶인 장식을 프레임 안에서 고를 수 있다",
        await pickInner(page, frame, false, "v2Main", "v2Over"),
        await selectedId(page));

      const beforeFollow = await canvasPlace(page, frame, false, "v2Over");

      await page.selectOption("#studioCanvasInspectorFollow", "pin");
      await sleep(900);

      const pinnedNode = v2NodeOf(await readCanvas(page), "v2Over");

      check("★ pin 으로 바꾸면 offset 과 기준점이 함께 적힌다",
        pinnedNode.follow === "pin" &&
        pinnedNode.pin.anchor === "top-left" &&
        pinnedNode.pin.origin === "top-left" &&
        typeof pinnedNode.pin.offset.x === "number",
        JSON.stringify(pinnedNode.pin));

      const afterFollow = await canvasPlace(page, frame, false, "v2Over");

      check("★ 따라가기를 바꿔도 화면 자리가 그대로다",
        near(beforeFollow, afterFollow, 2),
        JSON.stringify({ b: beforeFollow, a: afterFollow }));

      const pinPanel = await structureState(page);

      check("★ pin 이면 기준 대상 · 기준점을 패널에서 알 수 있고 바꿀 수 있다",
        pinPanel.follow === "pin" && pinPanel.pinTarget === "frame" &&
        pinPanel.pinAnchor === "top-left" && pinPanel.pinOrigin === "top-left",
        JSON.stringify(pinPanel));

      /* 기준점을 바꿔도 자리는 그대로여야 한다 — offset 이 함께 바뀐다 */
      const beforeAnchor = await canvasPlace(page, frame, false, "v2Over");

      await page.selectOption("#studioCanvasInspectorPin-anchor", "bottom-right");
      await sleep(900);

      const anchored = v2NodeOf(await readCanvas(page), "v2Over");
      const afterAnchor = await canvasPlace(page, frame, false, "v2Over");

      check("★ 기준점을 바꾸면 offset 이 함께 바뀌고 자리는 그대로다",
        anchored.pin.anchor === "bottom-right" &&
        near(beforeAnchor, afterAnchor, 2),
        JSON.stringify({ p: anchored.pin, b: beforeAnchor, a: afterAnchor }));

      /* pin 장식은 프레임이 커져도 **크기가 그대로다**(§14-6) */
      await pickBlock(page, frame, false, "v2Main");
      await typeV2Number(page, "width", 330);
      await sleep(700);

      const pinWide = await canvasPlace(page, frame, false, "v2Over");

      check("★ pin 장식은 프레임이 커져도 크기가 유지된다",
        Math.abs(pinWide.w - afterAnchor.w) <= 2,
        JSON.stringify({ b: afterAnchor.w, a: pinWide.w }));

      await typeV2Number(page, "width", 300);
      await sleep(700);


      /* ---- 6. 빼기 — 화면 자리가 유지된다 ---- */

      await pickInner(page, frame, false, "v2Main", "v2Over");

      const beforeDetach = await canvasPlace(page, frame, false, "v2Over");

      const beforeDetachJson = JSON.stringify(await readCanvas(page));
      const beforeDetachHistory = await historyState(page);

      await page.click("#studioCanvasDetach");
      await sleep(1000);

      const detachedCanvas = await readCanvas(page);

      check("★ 빼면 페이지 자유 장식으로 돌아온다",
        (detachedCanvas.canvas.overlays || []).some((el) => el.id === "v2Over") &&
        !v2BlockOf(detachedCanvas, "v2Main").props.elements
          .some((el) => el.id === "v2Over"),
        JSON.stringify((detachedCanvas.canvas.overlays || []).map((el) => el.id)));

      const afterDetach = await canvasPlace(page, frame, false, "v2Over");

      check("★ 빼도 화면의 그 자리가 그대로다",
        near(beforeDetach, afterDetach, 2),
        JSON.stringify({ b: beforeDetach, a: afterDetach }));

      const afterDetachHistory = await historyState(page);

      check("★ 빼기 한 번이 Undo 한 칸이다",
        afterDetachHistory.undo === beforeDetachHistory.undo + 1,
        JSON.stringify({ b: beforeDetachHistory.undo, a: afterDetachHistory.undo }));


      /* ---- 7. Undo · Redo ---- */

      await page.click("#studioUndoButton");
      await sleep(1000);

      check("★ Undo 하면 소속과 좌표가 글자 단위로 돌아온다",
        JSON.stringify(await readCanvas(page)) === beforeDetachJson);

      await page.click("#studioRedoButton");
      await sleep(1000);

      const overlayIds =
        (canvas) => ((canvas && canvas.canvas.overlays) || []).map((el) => el.id);

      check("★ Redo 하면 다시 빠진다",
        overlayIds(await readCanvas(page)).indexOf("v2Over") !== -1,
        JSON.stringify(overlayIds(await readCanvas(page))));


      /* ---- 8. 삭제 — 프레임 계약을 깨는 것은 거부한다 ---- */

      check("primary 사진을 고를 수 있다",
        await pickInner(page, frame, false, "v2Main", "v2Photo"),
        await selectedId(page));

      const primaryStructure = await structureState(page);

      check("프레임 안 요소에는 '빼기' 가 있다",
        primaryStructure.detach === true && primaryStructure.remove === true,
        JSON.stringify(primaryStructure));

      await page.click("#studioCanvasRemove");
      await sleep(800);

      const refused = await structureState(page);

      check("★ primary 사진은 지울 수 없고 이유를 적는다",
        !!v2NodeOf(await readCanvas(page), "v2Photo") &&
        refused.error.indexOf("대표 사진") !== -1,
        JSON.stringify(refused.error));

      await page.click("#studioCanvasDetach");
      await sleep(800);

      check("★ primary 사진은 뺄 수도 없다",
        !!v2BlockOf(await readCanvas(page), "v2Main").props.elements
          .find((el) => el.id === "v2Photo"),
        "프레임 계약을 깨는 동작은 한 자리에서 막는다");

      /* 아까 프레임 안에 만든 장식은 지울 수 있다 */
      await pickInner(page, frame, false, "v2Main", innerId);

      const beforeRemoveJson = JSON.stringify(await readCanvas(page));

      await page.click("#studioCanvasRemove");
      await sleep(1000);

      check("★ 잘못 만든 장식은 지울 수 있다",
        v2NodeOf(await readCanvas(page), innerId) === null &&
        (await panelState(page)).mode === "none",
        "지운 것은 고를 수 없다 — 선택도 함께 푼다");

      await page.click("#studioUndoButton");
      await sleep(1000);

      check("★ 삭제도 Undo 로 돌아온다",
        JSON.stringify(await readCanvas(page)) === beforeRemoveJson);


      /* ---- 9. 왕복 — Save · Export 에서도 소속이 그대로 ---- */

      const round = await page.evaluate(async () => {

        const exported = window.buildSkinPackageExport(currentWorkingSkin);

        if (!exported.ok) return { ok: false, message: exported.message };

        const text = window.serializeSkinPackageExport(exported.skinPackage);
        const result = await window.validateSkinPackageImport(text);

        if (!result.ok) return { ok: false, message: result.message };

        const entry =
          (result.skinPackage.regions || []).find((r) => r && r.name === "home_canvas");

        const frameBlock =
          entry.canvas.flow.blocks.find((b) => b.id === "v2Main");

        return {
          ok: true,
          inner: frameBlock.props.elements.map((el) => el.id),
          overlays: (entry.canvas.overlays || []).map((el) => el.id)
        };

      });

      check("★ Export → Import 에서 소속과 좌표가 그대로다",
        round.ok === true &&
        round.overlays.indexOf("v2Over") !== -1 &&
        round.inner.indexOf("v2Over") === -1,
        JSON.stringify(round));

      check("pageerror 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));


      /* ---- 9-1. Save → 다시 열기 ---- */

      const beforeSave =
        JSON.stringify(await readCanvas(page));

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const savedContent = await page.evaluate(() => {
        const calls = window.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      await close(page);

      const again = await openStudio(browser, { package: savedContent });

      await canvasFrame(again, false);

      check("★ Save → 다시 열기에서 소속과 좌표가 글자 단위로 같다",
        JSON.stringify(await readCanvas(again)) === beforeSave);

      check("다시 열기 pageerror 0", again.__errors.length === 0,
        again.__errors.slice(0, 2).join(" | "));

      await close(again);


      /* ---- 10. 별도 origin 프레임에서 같은 한 길 ---- */

      const sbPage = await openStudio(browser, {
        package: v2Package({ sandbox: true }),
        sandbox: true
      });

      const sbFrame = await canvasFrame(sbPage, true);

      await enableCanvasEditing(sbPage);

      const sbLayout =
        await sbPage.evaluate(() => window.getStudioCanvasFrameLayout());

      check("★ sandbox 프레임도 자기 자리를 보고한다",
        !!sbLayout && !!sbLayout.v2Main && sbLayout.v2Main.y > 0,
        JSON.stringify(sbLayout));

      await pickBlock(sbPage, sbFrame, true, "v2Main");

      await openAddPanel(sbPage);

      check("★ sandbox 에서도 프레임 안 추가 자리가 열린다",
        (await addState(sbPage)).frameId === "v2Main");

      await addMaterial(sbPage, "frame", "sticker");
      await sleep(1200);

      const sbInnerId = await selectedId(sbPage);

      check("★ sandbox 프레임 안에 새 장식이 그려진다",
        await sbFrame.evaluate((id) =>
          !!document.querySelector(`[data-imory-edit-id="${id}"]`), sbInnerId),
        sbInnerId);

      await clickElement(sbPage, sbFrame, true, "v2Over");

      const sbBefore = await canvasPlace(sbPage, sbFrame, true, "v2Over");

      await sbPage.click("#studioCanvasAttach");
      await sleep(1200);

      const sbAfter = await canvasPlace(sbPage, sbFrame, true, "v2Over");

      check("★ sandbox 에서도 묶기가 화면 자리를 지킨다",
        !!v2BlockOf(await readCanvas(sbPage), "v2Main").props.elements
          .find((el) => el.id === "v2Over") &&
        near(sbBefore, sbAfter, 2),
        JSON.stringify({ b: sbBefore, a: sbAfter }));

      await pickInner(sbPage, sbFrame, true, "v2Main", "v2Over");

      const sbDetachBefore = await canvasPlace(sbPage, sbFrame, true, "v2Over");

      await sbPage.click("#studioCanvasDetach");
      await sleep(1200);

      const sbDetachAfter = await canvasPlace(sbPage, sbFrame, true, "v2Over");

      check("★ sandbox 에서도 빼기가 화면 자리를 지킨다",
        (await readCanvas(sbPage)).canvas.overlays
          .some((el) => el.id === "v2Over") &&
        near(sbDetachBefore, sbDetachAfter, 2),
        JSON.stringify({ b: sbDetachBefore, a: sbDetachAfter }));

      check("★ 프레임 CSP 위반 0", (await cspViolations(sbFrame)).length === 0,
        JSON.stringify(await cspViolations(sbFrame)));

      check("★ 부모 CSP 위반 0", (await cspViolations(sbPage)).length === 0,
        JSON.stringify(await cspViolations(sbPage)));

      check("sandbox pageerror 0", sbPage.__errors.length === 0,
        sbPage.__errors.slice(0, 2).join(" | "));

      await sbPage.__ctx.close();

    }



    /* ======================================================
       [v2fix] HOME-CANVAS-V2-MANUAL-FIX-1 — 수동 테스트에서 나온 다섯
       (계약 §29)

       §29-1(도화지가 자란다)은 렌더러의 몫이라
       skin/skin-home-canvas-render-e2e-test.mjs --only=grow 가 보고,
       §29-3(Auto 끄기)은 [v2] 절이 이미 본다. 여기서는 Studio 에서만
       알 수 있는 셋이다.

         · 폭 손잡이로 실제로 끌어 고친다(§29-4)
         · 넘친 글자를 선택선이 가로지르지 않는다(§29-2)
         · 만든 도형이 보이고(§29-5), 묶어도 모양이 그대로다(§29-6)
    ====================================================== */
    if (wants("v2fix")) {

      section("v2fix");

      /* 로고 블록만 좁고 낮게 — 대체 글자가 상자를 넘치게 해서
         §29-2 의 그 자리를 이 절이 실제로 밟는다. */
      const fixPackage = v2Package({});

      const fixLogo =
        fixPackage.regions
          .find((r) => r.name === "home_canvas")
          .canvas.flow.blocks.find((b) => b.id === "v2Logo");

      fixLogo.width = 30;
      fixLogo.height = 10;

      /* ★ 블록에 색을 준다 — 스킨이 흔히 하는 그 한 줄이고(실측한
         사용자 스킨도 `[data-imory-canvas-block] { font-family; color }`
         였다), 이것이 있어야 §29-6 이 실제로 무언가를 지킨다: 도화지
         아래 장식은 이 색을 **물려받지 않고**, 프레임 안으로 들어가면
         물려받기 때문이다. */
      fixPackage.css +=
        " [data-imory-canvas-block] { color: rgb(10, 20, 30); }";

      const page = await openStudio(browser, { package: fixPackage });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      /* 지금 draft 의 CSS 한 줄 */
      const workingCss = (p) =>
        p.evaluate(() =>
          (window.getStudioAiWorkingState({ includePackage: true })
            .skinPackage || {}).css || "");


      /* ---- 1. 폭 손잡이(§29-4) ---- */

      await clickElement(page, frame, false, "v2Text");

      /* 손잡이는 따라가기 루프의 첫 프레임에서 정해진다(계약 §29-4 의
         그 함정) — 붙을 때까지 기다린다. */
      await page.waitForFunction(
        () => true, null, { timeout: 1000 }).catch(() => {});

      await sleep(900);

      const widthStart = v2BlockOf(await readCanvas(page), "v2Text").width;

      let h0 = await historyState(page);

      /* 끄는 **동안** 흐름이 다시 조판되는가 — 아래 블록이 따라온다 */
      await bringIntoView(page, frame, false, byId("v2Text"));

      const beforeBox =
        (await nativeRects(page, [byId("v2Text")]))[byId("v2Text")];

      /* ★ 왼쪽 손잡이를 쓴다 — 이 화면에서 오른쪽 손잡이는 1285px 에
         있어 1280 폭 창 **밖**이다(글자 요소의 chrome 여유가 그만큼
         밖으로 밀기 때문이다 · 계약 §21-4). 폭이 커지는 것은 같다. */
      await dragHandle(page, frame, false, "v2Text", "w", -40, 0, { noView: true });

      const now = await readCanvas(page);
      const h1 = await historyState(page);

      const widthNext = v2BlockOf(now, "v2Text").width;

      /* 끈 양은 화면 px 40 이고 이 Preview 의 배율이 2.46 이므로
         Canvas 좌표로는 16 남짓이다 — 자가 하나라는 것까지 함께
         본다(아래 화면 폭 검산). */
      check("★ 좌우 손잡이로 블록 폭이 바뀐다(§29-4)",
        widthNext > widthStart + 10,
        JSON.stringify({ before: widthStart, after: widthNext }));

      check("★ 폭 말고는 한 칸도 바뀌지 않는다(정렬 · 순서 · 여백 · 높이)",
        same(v2BlockOf(now, "v2Text").margin, { top: 10, right: 0, bottom: 6, left: 0 }) &&
        v2BlockOf(now, "v2Text").align === "center" &&
        v2BlockOf(now, "v2Text").height === "auto" &&
        v2Blocks(now).map((b) => b.id).join(",") ===
          v2Blocks(await readCanvas(page)).map((b) => b.id).join(","),
        JSON.stringify(v2BlockOf(now, "v2Text")));

      check("★ 한 제스처 = Undo 한 칸", h1.undo === h0.undo + 1,
        `${h0.undo} → ${h1.undo}`);

      const afterBox =
        (await nativeRects(page, [byId("v2Text")]))[byId("v2Text")];

      const grew =
        (afterBox.right - afterBox.left) - (beforeBox.right - beforeBox.left);

      check("★ 확정 뒤 화면이 저장값과 맞는다(끈 만큼 넓어졌다)",
        Math.abs(grew - 40) <= 3 &&
        Math.abs(
          (afterBox.right - afterBox.left) /
            (beforeBox.right - beforeBox.left) -
          widthNext / widthStart) < 0.01,
        JSON.stringify({ grew: grew, saved: [widthStart, widthNext] }));

      await page.evaluate(() => window.undoStudioHistory());
      await sleep(700);

      check("★ Undo 하면 저장된 폭이 그대로 돌아온다",
        v2BlockOf(await readCanvas(page), "v2Text").width === widthStart,
        String(v2BlockOf(await readCanvas(page), "v2Text").width));

      /* 블록은 **끌어서 옮기지 않는다** — 좌표가 생기지 않는다 */

      const dragKeys = Object.keys(v2BlockOf(await readCanvas(page), "v2Text"));

      await dragElement(page, frame, false, "v2Text", 30, 30, { noView: true });
      await sleep(600);

      check("★ 블록 본체를 끌어도 좌표가 생기지 않는다(자리는 흐름이 정한다)",
        same(Object.keys(v2BlockOf(await readCanvas(page), "v2Text")), dragKeys),
        JSON.stringify(Object.keys(v2BlockOf(await readCanvas(page), "v2Text"))));


      /* ---- 2. 선택선이 글자를 가로지르지 않는다(§29-2) ---- */

      await clickElement(page, frame, false, "v2Logo");

      const logoBox = await page.evaluate(() => {
        const sel = window.getStudioCanvasSelection();
        const item = sel.items[0];
        return item ? item.visibleRect || item.rect : null;
      });

      const logoText = await frame.evaluate(() => {
        const el = document.querySelector('[data-imory-edit-id="v2Logo"]');
        const span = el.querySelector("[data-imory-canvas-logo-text]");
        const a = el.getBoundingClientRect();
        const b = span.getBoundingClientRect();
        return {
          blockTop: a.top, blockBottom: a.bottom,
          textTop: b.top, textBottom: b.bottom
        };
      });

      const overflowsUp =
        logoText.textTop < logoText.blockTop - 0.5;

      const overflowsDown =
        logoText.textBottom > logoText.blockBottom + 0.5;

      check("★ 고른 로고의 글자가 실제로 상자를 넘친다(그래서 이 절이 있다)",
        overflowsUp || overflowsDown,
        JSON.stringify(logoText));

      check("★ 선택선이 글자 바깥에 놓인다(넘친 만큼 넓어진다)",
        !!logoBox &&
        logoBox.height >=
          (logoText.textBottom - logoText.textTop) +
          (logoText.blockBottom - logoText.blockTop) * 0 + 9,
        JSON.stringify({ box: logoBox && logoBox.height, text: logoText }));


      /* ---- 3. 만든 도형이 보인다(§29-5) ---- */

      const cssBefore = await workingCss(page);

      await addMaterial(page, "overlay", "shape");
      await sleep(900);

      const shapeId = await page.evaluate(() =>
        window.getStudioCanvasSelection().primaryId);

      const shapeLook = await frame.evaluate((id) => {
        const el = document.querySelector(`[data-imory-edit-id="${id}"]`);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { background: cs.backgroundColor, opacity: cs.opacity };
      }, shapeId);

      check("★ 새 도형이 스킨의 색으로 실제로 칠해진다(§29-5)",
        !!shapeLook &&
        shapeLook.background !== "rgba(0, 0, 0, 0)" &&
        Number(shapeLook.opacity) > 0 && Number(shapeLook.opacity) < 1,
        JSON.stringify(shapeLook));

      const cssAfter = await workingCss(page);

      check("★ 그 색은 스킨 CSS 안의 규칙 하나다(Code 에서 보이고 지울 수 있다)",
        cssAfter.indexOf(`[data-imory-edit-id="${shapeId}"]`) !== -1 &&
        cssAfter.indexOf("currentColor") !== -1 &&
        cssBefore.indexOf(shapeId) === -1);

      const beforeUndo = await historyState(page);

      await page.evaluate(() => window.undoStudioHistory());
      await sleep(700);

      check("★ Undo 한 번이면 요소와 규칙이 함께 사라진다(기록 한 칸)",
        (await workingCss(page)).indexOf(shapeId) === -1 &&
        !v2NodeOf(await readCanvas(page), shapeId) &&
        beforeUndo.undo > 0);


      /* ---- 4. 묶어도 모양이 그대로다(§29-6) ---- */

      await addMaterial(page, "overlay", "text");
      await sleep(900);

      const movedId = await page.evaluate(() =>
        window.getStudioCanvasSelection().primaryId);

      const lookOf = (id) => frame.evaluate((elementId) => {
        const el = document.querySelector(`[data-imory-edit-id="${elementId}"]`);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          color: cs.color,
          textAlign: cs.textAlign
        };
      }, id);

      const lookBefore = await lookOf(movedId);

      const attached = await page.evaluate((id) =>
        window.commitStudioCanvasStructureNode({
          op: "attach", id: id, frameId: "v2Main"
        }), movedId);

      await sleep(900);

      const lookAfter = await lookOf(movedId);

      check("★ 묶기가 받아들여졌다(자리는 §28 이 이미 본다)",
        attached && attached.accepted === true, JSON.stringify(attached));

      check("★ 묶기 전에는 블록의 색을 물려받지 않는다(이 절이 지킬 것이 있다)",
        lookBefore && lookBefore.color !== "rgb(10, 20, 30)",
        JSON.stringify(lookBefore));

      check("★ 묶어도 글꼴 · 크기 · 줄간격 · 색 · 정렬이 그대로다(§29-6)",
        same(lookBefore, lookAfter),
        JSON.stringify({ before: lookBefore, after: lookAfter }));

      const pinnedRule =
        (await workingCss(page))
          .split("\n")
          .find((line) => line.indexOf(`[data-imory-edit-id="${movedId}"]`) !== -1) || "";

      check("★ 그 유지는 그 요소 하나의 규칙이다(다른 요소는 건드리지 않는다)",
        pinnedRule.indexOf("color") !== -1 &&
        pinnedRule.indexOf("font-family") !== -1,
        pinnedRule.slice(0, 160));

      /* 빼면 다시 도화지 아래로 나가는데, 그때도 모양은 그대로다 */

      const detached = await page.evaluate((id) =>
        window.commitStudioCanvasStructureNode({ op: "detach", id: id }), movedId);

      await sleep(900);

      check("★ 다시 빼도 모양이 그대로다(§29-6 은 양쪽이다)",
        detached && detached.accepted === true &&
        same(await lookOf(movedId), lookBefore),
        JSON.stringify({ ok: detached && detached.accepted, look: await lookOf(movedId) }));

      check("pageerror 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await close(page);

    }


    /* ======================================================
       [v2resp] 창 폭이 바뀐 직후의 좌표 (계약 §30-3-1 · §30-4-1)

       §30 이 남긴 두 가지를 본다.

         1. 창 폭 · MOBILE/DESKTOP 전환 **직후 곧바로** 묶기 · 빼기를
            해도 그 순간 실제로 그려진 프레임 폭 · 자리를 기준으로
            변환되는가(= 앞 화면의 `CANVAS_LAYOUT.w` 를 쓰지 않는가).
         2. 화면 가장자리에서 장식을 끌 때 **화면만 멈추고 저장 x 만
            변하는** 상태가 없는가 — 제스처 중 자리 · 확정 뒤 자리 ·
            Undo 뒤 자리가 어긋나지 않는가.

       두 경우 모두 390 ↔ 데스크톱, native ↔ sandbox 에서 돈다.
    ====================================================== */
    if (wants("v2resp")) {

      section("v2resp");

      /* 그 요소가 지금 화면에서 **도화지 자로** 어디에 있나
         ([v2elements] 의 canvasPlace 와 같은 식이다) */
      const place = async (page, frame, sandbox, id) => {

        const sels = [byId(id), "[data-imory-canvas-root]"];

        const rects =
          sandbox
            ? await sandboxRects(page, frame, sels)
            : await nativeRects(page, sels);

        const el = rects[sels[0]];
        const root = rects[sels[1]];

        if (!el || !root || !(root.width > 0)) {
          return null;
        }

        const to = (v) => Math.round(v / root.width * 390 * 10) / 10;

        return {
          x: to(el.left - root.left),
          y: to(el.top - root.top),
          w: to(el.width),
          h: to(el.height)
        };

      };

      const near = (a, b, slack) =>
        !!a && !!b &&
        Math.abs(a.x - b.x) <= (slack || 2) &&
        Math.abs(a.y - b.y) <= (slack || 2) &&
        Math.abs(a.w - b.w) <= (slack || 2) &&
        Math.abs(a.h - b.h) <= (slack || 2);

      /* 프레임이 지금 **실제로** 그려진 폭(도화지 폭의 분수) */
      const drawnFraction = async (page, frame, sandbox, id) => {

        const sels = [byId(id), "[data-imory-canvas-root]"];

        const rects =
          sandbox
            ? await sandboxRects(page, frame, sels)
            : await nativeRects(page, sels);

        const el = rects[sels[0]];
        const root = rects[sels[1]];

        return (el && root && root.width > 0) ? (el.width / root.width) : null;

      };

      const reportedFraction = (page, id) =>
        page.evaluate((frameId) => {
          const all =
            window.getStudioCanvasFrameLayout
              ? window.getStudioCanvasFrameLayout()
              : null;
          const hit = all ? all[frameId] : null;
          return hit && typeof hit.w === "number" ? hit.w : null;
        }, id);

      const selected = (p) =>
        p.evaluate(() => {
          const s = window.getStudioCanvasSelection();
          return s && s.primaryId ? s.primaryId : null;
        });

      /* 선택을 푼다 — 따라가기 루프가 멈춘 상태를 만든다 */
      const deselect = async (page) => {
        await page.keyboard.press("Escape");
        await sleep(500);
      };

      /* 390 에서는 왼쪽 패널이 **시트**다(MOBILE-SHEET-1) — `peek` 인
         동안 그 안의 버튼은 화면에 없다. 누르기 전에 한 칸 올린다. */
      const openPanel = async (page) => {

        const opened =
          await page.evaluate(() => {

            if (typeof window.getStudioSheetState !== "function") {
              return "no-sheet";
            }

            if (window.getStudioSheetState() !== "peek") {
              return window.getStudioSheetState();
            }

            if (typeof window.setStudioSheetState === "function") {
              window.setStudioSheetState("content");
              return window.getStudioSheetState();
            }

            return "stuck";

          });

        if (opened !== "no-sheet") {
          await sleep(400);
        }

      };

      /* 가장자리 장식을 하나 더 얹는다 — 공용 fixture 의 overlay 수를
         세는 다른 절을 건드리지 않으려고 이 절에서만 더한다 */
      const respPackage = (sandbox) => {

        const pkg = v2Package({ sandbox: sandbox });

        const canvas =
          pkg.regions.find((r) => r.name === "home_canvas").canvas;

        canvas.overlays.push({
          id: "v2Edge", type: "text",
          x: 4, y: 760, width: 90, height: 30, rotation: 0,
          props: { text: "edge", role: "label" }
        });

        return pkg;

      };

      for (const sandbox of [false, true]) {

        const realm = sandbox ? "sandbox" : "native";

        const page = await openStudio(browser, {
          package: respPackage(sandbox),
          sandbox: sandbox
        });

        const frame = await canvasFrame(page, sandbox);

        await enableCanvasEditing(page);

        /* ---- 1. 선택이 없는 채로 창 폭을 바꿔도 보고가 따라온다 ---- */

        await deselect(page);

        await page.setViewportSize({ width: 390, height: 900 });
        await sleep(250);

        const narrowDrawn = await drawnFraction(page, frame, sandbox, "v2Main");
        const narrowSaid = await reportedFraction(page, "v2Main");

        check(`★ [${realm}] 390 전환 직후 — 보고된 폭이 그 순간 그려진 폭이다`,
          narrowDrawn !== null && narrowSaid !== null &&
          Math.abs(narrowDrawn - narrowSaid) < 0.01,
          `그려진 ${narrowDrawn} · 보고 ${narrowSaid}`);

        /* ---- 2. 그 자리에서 곧바로 묶기 · 빼기 ---- */

        await clickElement(page, frame, sandbox, "v2Over");

        check(`[${realm}] 390 에서 페이지 장식을 고를 수 있다`,
          (await selected(page)) === "v2Over", await selected(page));

        const beforeAttach = await place(page, frame, sandbox, "v2Over");

        await openPanel(page);
        await page.click("#studioCanvasAttach");
        await sleep(1000);

        const afterAttach = await place(page, frame, sandbox, "v2Over");

        check(`★ [${realm}] 390 전환 직후 묶어도 화면 자리가 그대로다`,
          near(beforeAttach, afterAttach),
          JSON.stringify({ b: beforeAttach, a: afterAttach }));

        await openPanel(page);
        await page.click("#studioCanvasDetach");
        await sleep(1000);

        const afterDetach = await place(page, frame, sandbox, "v2Over");

        check(`★ [${realm}] 390 에서 빼도 화면 자리가 그대로다`,
          near(beforeAttach, afterDetach),
          JSON.stringify({ b: beforeAttach, a: afterDetach }));

        /* ---- 3. 데스크톱으로 돌아온 직후에도 같다 ---- */

        await deselect(page);

        await page.setViewportSize({ width: 1280, height: 900 });
        await sleep(250);

        const wideDrawn = await drawnFraction(page, frame, sandbox, "v2Main");
        const wideSaid = await reportedFraction(page, "v2Main");

        check(`★ [${realm}] 데스크톱 복귀 직후 — 보고된 폭이 그 순간 그려진 폭이다`,
          wideDrawn !== null && wideSaid !== null &&
          Math.abs(wideDrawn - wideSaid) < 0.01 &&
          Math.abs(wideDrawn - narrowDrawn) > 0.05,
          `390 ${narrowDrawn} → 1280 그려진 ${wideDrawn} · 보고 ${wideSaid}`);

        await clickElement(page, frame, sandbox, "v2Over");

        const beforeWide = await place(page, frame, sandbox, "v2Over");

        await openPanel(page);
        await page.click("#studioCanvasAttach");
        await sleep(1000);

        const afterWide = await place(page, frame, sandbox, "v2Over");

        check(`★ [${realm}] 데스크톱 복귀 직후 묶어도 화면 자리가 그대로다`,
          near(beforeWide, afterWide),
          JSON.stringify({ b: beforeWide, a: afterWide }));

        await openPanel(page);
        await page.click("#studioCanvasDetach");
        await sleep(1000);

        check(`★ [${realm}] 데스크톱에서 빼도 화면 자리가 그대로다`,
          near(beforeWide, await place(page, frame, sandbox, "v2Over")),
          JSON.stringify(await place(page, frame, sandbox, "v2Over")));

        /* ---- 4. 가장자리 드래그 — 화면과 저장값이 함께 멈춘다 ---- */

        await page.setViewportSize({ width: 390, height: 900 });
        await sleep(800);

        const storedX = (p) =>
          p.evaluate(() => {
            const n = window.studioCanvasDraftElement("v2Edge");
            return n ? n.x : null;
          });

        /* ★ 먼저 푼다 — 바로 앞 걸음에서 고른 것이 남아 있으면 그
           위에서 시작한 클릭이 "겹친 요소" 로 읽힐 수 있다. 한 번
           빗나가면 다시 한 번 짚는다(재렌더 직후의 좌표). */
        await deselect(page);

        await clickElement(page, frame, sandbox, "v2Edge");

        if ((await selected(page)) !== "v2Edge") {
          await sleep(600);
          await clickElement(page, frame, sandbox, "v2Edge");
        }

        check(`[${realm}] 가장자리 장식을 고를 수 있다`,
          (await selected(page)) === "v2Edge", await selected(page));

        const startPlace = await place(page, frame, sandbox, "v2Edge");
        const startStored = await storedX(page);

        const rects =
          sandbox
            ? await sandboxRects(page, frame, [byId("v2Edge")])
            : await nativeRects(page, [byId("v2Edge")]);

        const box = rects[byId("v2Edge")];

        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;

        await page.mouse.move(cx, cy);
        await page.mouse.down();

        for (let i = 1; i <= 12; i += 1) {
          await page.mouse.move(cx - i * 5, cy);
        }

        const duringPlace = await place(page, frame, sandbox, "v2Edge");

        await page.mouse.up();
        await sleep(1000);

        const endPlace = await place(page, frame, sandbox, "v2Edge");
        const endStored = await storedX(page);

        check(`★ [${realm}] 가장자리에서 끌면 확정 뒤 자리가 제스처 중 자리와 같다`,
          near(duringPlace, endPlace),
          JSON.stringify({ d: duringPlace, e: endPlace }));

        check(`★ [${realm}] 저장된 x 가 **보이는 자리**다(화면만 멈추지 않는다)`,
          endStored !== null && endPlace !== null &&
          Math.abs(endStored - endPlace.x) <= 1.5,
          `저장 ${endStored} · 화면 ${endPlace && endPlace.x}`);

        check(`★ [${realm}] 가장자리 밖으로는 저장값도 나가지 않는다`,
          startStored !== null && endStored !== null && endStored < startStored &&
          endStored >= -1.5,
          `${startStored} → ${endStored}`);

        await page.click("#studioUndoButton");
        await sleep(900);

        check(`★ [${realm}] Undo 가 끌기 전 자리로 정확히 돌린다`,
          near(startPlace, await place(page, frame, sandbox, "v2Edge")) &&
          (await storedX(page)) === startStored,
          JSON.stringify({ s: startPlace, u: await place(page, frame, sandbox, "v2Edge") }));

        if (sandbox) {
          check("sandbox CSP 위반 0", (await cspViolations(frame)).length === 0);
        }

        check(`[${realm}] pageerror 0`, page.__errors.length === 0,
          page.__errors.slice(0, 2).join(" | "));

        await close(page);

      }

    }


    /* ======================================================
       [layers] — 왼쪽 Layers 패널 (STUDIO-LAYERS-SHELL-1)

       계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md §7

       이 절이 재는 것은 **트리와 선택**이다.

         1  트리 순서가 **실제 draft 배열 순서**와 같은가
            (화면만의 정렬을 만들지 않았는가)
         2  Preview 선택과 Layers 선택이 **같은 상태 하나**인가
            (Layers 전용 두 번째 선택 배열이 생기지 않았는가)
         3  행에 있어야 할 단추가 다 있는가(STRUCTURE-1)

       ★ 구조 동작 자체(순서 drag · 묶기/빼기 drop · primary ·
         숨김 · 잠금 · 삭제 · Undo · 원자적 거부)는 다음 절이다 —
         `--only=layerstruct`.
    ====================================================== */
    if (wants("layers")) {

      section("layers");

      const page = await openStudio(browser, { package: v2Package({}) });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      const layersState = (p) =>
        p.evaluate(() => window.getStudioCanvasLayersState());

      const openLayers = async (p) => {
        await p.evaluate(() => window.showStudioLeftPanelMode("layers"));
        await sleep(300);
      };

      const pickedId = (p) =>
        p.evaluate(() => window.getStudioCanvasSelection().primaryId);


      /* ---- 1. 상단 진입점 넷 ---- */

      const lead = await page.evaluate(() => {
        const ids = ["studioInspectorButton", "studioImagesButton",
                     "studioLayersButton", "studioLayoutButton"];
        return {
          labels: ids.map((id) => {
            const el = document.getElementById(id);
            return el ? el.textContent.trim() : null;
          }),
          inLead: ids.every((id) => {
            const el = document.getElementById(id);
            return !!el && !!el.closest(".studio-top-dock-lead");
          }),
          dockButton: !!document.getElementById("studioDockButton"),
          dockSection: !!document.getElementById("studioLeftPanelDock")
        };
      });

      check("★ 상단 진입점이 Select · Images · Layers · Layout 이다",
        lead.inLead &&
        lead.labels.join("·") === "Select·Images·Layers·Layout" &&
        lead.dockButton === false,
        JSON.stringify(lead));

      check("★ Dock 은 자리도 저장 경로도 그대로다(상단 버튼만 없어졌다)",
        lead.dockSection === true &&
        await page.evaluate(() => typeof window.openSkinDockPanel === "function"),
        "");


      /* ---- 2. 트리가 draft 순서 그대로다 ---- */

      await openLayers(page);

      const tree = await layersState(page);

      const draftOrder = await page.evaluate(() =>
        window.studioCanvasNodeList().map((n) => n.id));

      check("★ Layers 트리 순서 = draft 배열 순서(흐름 → 프레임 내부 → 장식)",
        tree.rows.map((r) => r.id).join(",") === draftOrder.join(",") &&
        draftOrder.join(",") ===
          "v2Logo,v2Text,v2Rule,v2Wide,v2Main,v2Paper,v2Photo,v2Tag,v2Over",
        JSON.stringify({ tree: tree.rows.map((r) => r.id), draft: draftOrder }));

      check("★ 자동 배치와 페이지 장식이 갈라져 있다(flow / overlay)",
        tree.rows.filter((r) => r.kind === "overlay").map((r) => r.id).join(",") === "v2Over" &&
        tree.rows.filter((r) => r.kind === "frame-element").map((r) => r.parentId)
          .every((p) => p === "v2Main"),
        JSON.stringify(tree.rows.map((r) => [r.id, r.kind])));

      const groups = await page.evaluate(() => ({
        flow: !!document.getElementById("studioCanvasLayersGroup-flow"),
        overlay: !!document.getElementById("studioCanvasLayersGroup-overlay"),
        flowText: (document.getElementById("studioCanvasLayersGroup-flow") || {}).textContent,
        overlayText: (document.getElementById("studioCanvasLayersGroup-overlay") || {}).textContent
      }));

      check("두 묶음의 이름이 사람이 읽는 말이다",
        groups.flow && groups.overlay &&
        groups.flowText === "자동 배치" && groups.overlayText === "페이지 장식",
        JSON.stringify(groups));

      /* ★ 표식은 대표 사진 하나에만 켜지고, 그 단추 자체는
         **메인 비주얼 안의 사진**에만 있다(STUDIO-LAYERS-STRUCTURE-1).
         이 스킨의 프레임에는 사진이 하나라 단추도 하나다. */
      check("★ 대표 사진에만 ★ 표식이 붙는다",
        tree.rows.filter((r) => r.primary).map((r) => r.id).join(",") === "v2Photo" &&
        await page.evaluate(() => {
          const star = document.getElementById("studioCanvasLayerPrimary-v2Photo");
          return document.querySelectorAll(".studio-canvas-layers-star").length === 1 &&
            !!star && star.textContent === "★" &&
            star.getAttribute("aria-pressed") === "true" && star.disabled === true;
        }),
        JSON.stringify(tree.rows.filter((r) => r.primary)));


      /* ---- 3. 메인 비주얼 접기 / 펼치기 ---- */

      check("처음에는 펼쳐져 있다(자식 셋이 그려진다)",
        tree.drawn.join(",") === draftOrder.join(","),
        JSON.stringify(tree.drawn));

      await page.click("#studioCanvasLayerTwisty-v2Main");
      await sleep(300);

      const collapsed = await layersState(page);

      check("★ 접으면 자식만 화면에서 빠지고 저장 구조는 그대로다",
        collapsed.drawn.join(",") === "v2Logo,v2Text,v2Rule,v2Wide,v2Main,v2Over" &&
        collapsed.rows.map((r) => r.id).join(",") === draftOrder.join(",") &&
        JSON.stringify(await readCanvas(page)) === JSON.stringify(await readCanvas(page)),
        JSON.stringify(collapsed.drawn));

      check("접기는 저장에 들어가지 않는다(draft 불변)",
        (await page.evaluate(() => window.getStudioAiWorkingState().isDirty)) === false,
        "");

      await page.click("#studioCanvasLayerTwisty-v2Main");
      await sleep(300);

      check("다시 펼치면 자식이 돌아온다",
        (await layersState(page)).drawn.join(",") === draftOrder.join(","),
        "");


      /* ---- 4. Layers 행 → Preview 선택 ---- */

      await page.click("#studioCanvasLayer-v2Rule");
      await sleep(600);

      const fromRow = await layersState(page);

      check("★ Layers 행을 누르면 그 요소가 캔버스 선택이 된다",
        (await pickedId(page)) === "v2Rule" &&
        fromRow.selectedIds.join(",") === "v2Rule" &&
        fromRow.primaryId === "v2Rule",
        JSON.stringify({ sel: fromRow.selectedIds, p: fromRow.primaryId }));

      check("★ 그 선택이 Preview 문서에도 닿는다(프레임이 같은 요소를 그린다)",
        await page.evaluate(() => {
          const doc = document.getElementById("studioPreviewFrame").contentDocument;
          return !!doc.querySelector('[data-imory-edit-id="v2Rule"]');
        }) &&
        (await page.evaluate(() =>
          window.getStudioCanvasSelection().items.length === 1)),
        "");

      check("고른 행이 화면에서도 골라진 것으로 보인다",
        await page.evaluate(() =>
          document.querySelector('[data-layer-id="v2Rule"]')
            .getAttribute("aria-selected") === "true" &&
          document.querySelectorAll(".studio-canvas-layers-row.is-selected").length === 1),
        "");


      /* ---- 5. Preview 선택 → Layers 행 ---- */

      await clickElement(page, frame, false, "v2Over");
      await sleep(600);

      await openLayers(page);

      const fromPreview = await layersState(page);

      check("★ Preview 에서 고르면 Layers 의 같은 행이 골라진다",
        (await pickedId(page)) === "v2Over" &&
        fromPreview.selectedIds.join(",") === "v2Over" &&
        await page.evaluate(() =>
          document.querySelector('[data-layer-id="v2Over"]')
            .getAttribute("aria-selected") === "true"),
        JSON.stringify(fromPreview.selectedIds));

      check("★ 선택 상태는 하나다(Layers 전용 두 번째 배열이 없다)",
        await page.evaluate(() => {
          const sel = window.getStudioCanvasSelection();
          const layers = window.getStudioCanvasLayersState();
          return sel.ids.join(",") === layers.selectedIds.join(",") &&
            sel.primaryId === layers.primaryId;
        }),
        "");


      /* ---- 6. 접힌 프레임 안을 고르면 펼쳐 보여 준다 ---- */

      await page.click("#studioCanvasLayerTwisty-v2Main");
      await sleep(300);

      check("접은 채로는 v2Photo 행이 없다",
        (await layersState(page)).drawn.indexOf("v2Photo") === -1,
        JSON.stringify((await layersState(page)).drawn));

      await page.evaluate(() => window.proposeStudioCanvasSelection({
        ids: ["v2Photo"], primaryId: "v2Photo", mode: "replace"
      }));
      await sleep(500);

      const revealed = await layersState(page);

      check("★ 접힌 프레임 안의 요소를 고르면 그 폴더가 펼쳐진다",
        revealed.drawn.indexOf("v2Photo") !== -1 &&
        revealed.selectedIds.join(",") === "v2Photo",
        JSON.stringify({ d: revealed.drawn, s: revealed.selectedIds }));


      /* ---- 7. 새로 만든 재료가 곧바로 골라지고 트리에 보인다 ---- */

      await openAddPanel(page);
      await page.click("#studioCanvasAdd-overlay-sticker");
      await sleep(900);

      const madeId = await pickedId(page);
      const afterAdd = await layersState(page);

      check("★ 만든 재료가 곧바로 선택이고 Layers 의 마지막 장식 행이다",
        !!madeId &&
        afterAdd.selectedIds.join(",") === madeId &&
        afterAdd.rows[afterAdd.rows.length - 1].id === madeId &&
        afterAdd.rows[afterAdd.rows.length - 1].kind === "overlay" &&
        afterAdd.drawn.indexOf(madeId) !== -1,
        JSON.stringify({ madeId, last: afterAdd.rows[afterAdd.rows.length - 1] }));

      check("Select 로 옮기면 그 요소의 속성을 곧바로 고칠 수 있다",
        await page.evaluate(() => {
          window.showStudioLeftPanelMode("select");
          const state = window.getStudioCanvasInspectorState();
          return state.mode === "single" && state.visible === true;
        }),
        "");

      await page.evaluate(() => window.undoStudioHistory());
      await sleep(700);

      await openLayers(page);

      check("Undo 하면 그 행도 함께 사라진다",
        (await layersState(page)).rows.every((r) => r.id !== madeId),
        "");


      /* ---- 8. 행마다 있는 것 / 아직 없는 것 ----

         STUDIO-LAYERS-STRUCTURE-1 이 손잡이 · 눈 · 자물쇠 · 삭제를
         모든 행에 두고, ★ 는 메인 비주얼 안의 사진에만 둔다. 그
         다음(그룹 조작 · 영구 group 노드 · rich text)은 여전히 없다.
      */

      const rowParts = await page.evaluate(() => {
        const root = document.getElementById("studioCanvasLayers");
        return {
          rows: root.querySelectorAll(".studio-canvas-layers-row").length,
          handle: root.querySelectorAll(".studio-canvas-layers-handle").length,
          eye: root.querySelectorAll(".studio-canvas-layers-eye").length,
          lock: root.querySelectorAll(".studio-canvas-layers-lock").length,
          remove: root.querySelectorAll(".studio-canvas-layers-remove").length,
          star: root.querySelectorAll("button.studio-canvas-layers-star").length,

          /* HTML5 drag&drop 은 쓰지 않는다 — pointer 제스처 하나다 */
          html5: root.querySelectorAll("[draggable=\"true\"]").length,

          /* 손잡이에만 touch-action:none 이다(패널 스크롤을 죽이지 않는다) */
          handleTouch: getComputedStyle(
            root.querySelector(".studio-canvas-layers-handle")
          ).touchAction,
          panelTouch: getComputedStyle(root).touchAction
        };
      });

      check("★ 모든 행에 손잡이 · 눈 · 자물쇠 · 삭제가 있다",
        rowParts.handle === rowParts.rows &&
        rowParts.eye === rowParts.rows &&
        rowParts.lock === rowParts.rows &&
        rowParts.remove === rowParts.rows &&
        rowParts.star === 1,
        JSON.stringify(rowParts));

      check("★ touch-action:none 은 손잡이 하나에만 있다(패널 스크롤이 산다)",
        rowParts.handleTouch === "none" && rowParts.panelTouch !== "none" &&
        rowParts.html5 === 0,
        JSON.stringify(rowParts));

      const notYet = await page.evaluate(() => {
        const root = document.getElementById("studioCanvasLayers");
        return {
          group: root.querySelectorAll("[data-layer-type=\"group\"]").length,
          groupButton: root.querySelectorAll(".studio-canvas-layers-group-make").length,
          multiDrag: typeof window.studioCanvasLayersMultiDrag
        };
      });

      check("★ 그룹 조작 · 영구 group 노드 · 여러 요소 끌기를 선행 구현하지 않았다",
        notYet.group === 0 && notYet.groupButton === 0 &&
        notYet.multiDrag === "undefined",
        JSON.stringify(notYet));


      /* ---- 9. 캔버스가 아닌 HOME 에서는 왜 비었는지 말해 준다 ---- */

      const plain = await openStudio(browser, { package: skinPackage({}) });

      await canvasFrame(plain, false).catch(() => null);

      await enableSelect(plain);
      await sleep(600);

      await plain.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      const empty = await plain.evaluate(() => ({
        rows: window.getStudioCanvasLayersState().rows.length,
        message: (document.getElementById("studioCanvasLayersEmpty") || {}).textContent || "",
        addDisabled: document.getElementById("studioCanvasLayersAddToggle").disabled
      }));

      check("★ 캔버스(v2)가 아닌 HOME 에서는 목록 대신 이유를 보여 준다",
        empty.rows === 0 && empty.message.length > 0 && empty.addDisabled === true,
        JSON.stringify(empty));

      await close(plain);


      /* ---- 10. 390px 시트 ---- */

      await page.setViewportSize({ width: 390, height: 844 });
      await sleep(400);

      await page.evaluate(() => window.showStudioLeftPanelMode("layers", { sheet: "full" }));
      await sleep(500);

      const narrow = await page.evaluate(() => {
        const section = document.getElementById("studioLeftPanelLayers");
        const tree = document.getElementById("studioCanvasLayersTree");
        const top = document.querySelector(".studio-canvas-layers-top");
        const rows = Array.from(document.querySelectorAll(".studio-canvas-layers-row"));
        const sb = section.getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          /* 스크롤하는 상자는 section 하나다 — 안쪽에 두 번째가 없다 */
          sectionScrolls: getComputedStyle(section).overflowY === "auto",
          treeScrolls: getComputedStyle(tree).overflowY,
          sticky: getComputedStyle(top).position,
          rowsInside: rows.every((r) => {
            const b = r.getBoundingClientRect();
            return b.left >= sb.left - 0.5 && b.right <= sb.right + 0.5;
          }),
          rowCount: rows.length
        };
      });

      check("★ 390px 에서 트리가 잘리지 않고 가로 넘침이 없다",
        narrow.scrollWidth <= narrow.innerWidth &&
        narrow.rowsInside && narrow.rowCount > 0,
        JSON.stringify(narrow));

      check("★ 스크롤 담당은 하나다(section 만 스크롤 · 추가 줄은 sticky)",
        narrow.sectionScrolls === true &&
        narrow.treeScrolls !== "auto" && narrow.treeScrolls !== "scroll" &&
        narrow.sticky === "sticky",
        JSON.stringify(narrow));

      await page.setViewportSize({ width: 1280, height: 800 });

      await close(page);


      /* ---- 11. sandbox 에서도 같은 결과 ---- */

      const sbPage = await openStudio(browser, { package: v2Package({ sandbox: true }), sandbox: true });
      const sbFrame = await canvasFrame(sbPage, true);

      await enableCanvasEditing(sbPage);

      await sbPage.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      check("★ sandbox 에서도 트리가 같은 순서다",
        (await layersState(sbPage)).rows.map((r) => r.id).join(",") ===
          "v2Logo,v2Text,v2Rule,v2Wide,v2Main,v2Paper,v2Photo,v2Tag,v2Over",
        JSON.stringify((await layersState(sbPage)).rows.map((r) => r.id)));

      await sbPage.click("#studioCanvasLayer-v2Wide");
      await sleep(800);

      check("★ sandbox 에서도 Layers 행 선택이 프레임에 닿는다",
        (await pickedId(sbPage)) === "v2Wide" &&
        await sbFrame.evaluate(() =>
          !!document.querySelector('[data-imory-edit-id="v2Wide"]')),
        String(await pickedId(sbPage)));

      await clickElement(sbPage, sbFrame, true, "v2Logo");
      await sleep(700);

      await sbPage.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      check("★ sandbox 의 Preview 선택도 같은 행으로 돌아온다",
        (await layersState(sbPage)).selectedIds.join(",") === "v2Logo",
        JSON.stringify((await layersState(sbPage)).selectedIds));

      await close(sbPage);

    }


    /* ======================================================
       [layerstruct] — Layers 의 구조 관리 (STUDIO-LAYERS-STRUCTURE-1)

       계약: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §32

       배열이 어떻게 바뀌는가는 브라우저 없이도 잰다
       (`node skin/skin-home-canvas-test.mjs` 의 [v2-structure]).
       여기서 재는 것은 **브라우저에서만 참이 되는 것**이다.

         1  손잡이를 끌면 그 자리로 간다(세 배열 · 첫째/가운데/마지막)
         2  변화 없는 drop 과 금지된 drop 은 기록 0 칸이다
         3  폴더 · 묶음 제목에 떨구면 기존 묶기 · 빼기 경로를 지나고
            **화면 자리 · 크기 · 각도가 그대로**다
         4  대표 사진 · 눈 · 자물쇠 · 삭제가 행에서 된다
         5  잠근 것은 Preview 클릭에서 빠지고 Layers 에서 풀린다
         6  한 동작 = Undo 한 칸 · Save → 다시 열기가 같다
         7  좁은 화면에서는 **길게 눌러야** 끌리고 스크롤은 산다
         8  여러 개를 골라 둔 채로는 거부하고 선택을 지키지 않는다
    ====================================================== */
    if (wants("layerstruct")) {

      section("layerstruct");


      /* 프레임에 **사진 둘**을 둔 스킨 — 대표를 바꿔 볼 수 있어야
         한다. 나머지는 v2Package 그대로다. */
      const structPackage = (o) => {

        const pkg = v2Package(o || {});

        const entry = pkg.regions.find((r) => r.name === "home_canvas");

        const frame =
          entry.canvas.flow.blocks.find((b) => b.id === "v2Main");

        frame.props.elements.push({
          id: "v2Photo2", type: "photo", follow: "transform",
          x: 60, y: 40, width: 50, height: 40, props: { slot: "photo_2" }
        });

        return pkg;

      };

      const page = await openStudio(browser, { package: structPackage({}) });
      const frame = await canvasFrame(page, false);

      await enableCanvasEditing(page);

      await page.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      const state = (p) => p.evaluate(() => window.getStudioCanvasLayersState());

      const order = async (p, filter) =>
        (await state(p)).rows.filter(filter).map((r) => r.id).join(",");

      const blocksOrder = (p) => order(p, (r) => r.kind === "block");
      const innerOrder = (p) => order(p, (r) => r.kind === "frame-element");
      const overlaysOrder = (p) => order(p, (r) => r.kind === "overlay");

      const rowBox = (p, id) =>
        p.evaluate((rowId) => {
          const el = document.querySelector(
            `.studio-canvas-layers-row[data-layer-id="${rowId}"]`);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                   cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        }, id);

      const handleBox = (p, id) =>
        p.evaluate((rowId) => {
          const el = document.querySelector(`[data-layer-handle="${rowId}"]`);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, id);

      /*
        묶음 제목의 자리.

        ★ 먼저 **가운데로 스크롤해 둔다.** 목록 맨 끝의 자리는 끄는
          동안의 자동 넘김 띠에 걸릴 수 있고, 그러면 겨누던 자리가
          손가락 밑에서 빠져나간다(사람도 그래서 먼저 스크롤한다).
      */
      /* 그 행의 위 끝 · 아래 끝 · 가운데 — **부를 때** 잰다 */
      const rowEdge = async (p, id, where) => {

        const box = await rowBox(p, id);

        if (!box) return null;

        return {
          x: box.cx,
          y: where === "top" ? box.top + 2
            : where === "bottom" ? box.bottom - 2
            : box.cy
        };

      };


      const groupBox = (p, key) =>
        p.evaluate((k) => {
          const el = document.querySelector(
            `.studio-canvas-layers-group[data-layer-group="${k}"]`);
          if (!el) return null;
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        }, key);

      /*
        손잡이에서 어떤 점까지 끈다 — 실제 mouse pointer 다.

        ★ **누른 뒤에 목표를 다시 잰다.** 끌기가 시작되면 그 행이
          골라지고 패널이 다시 그려질 수 있어서, 누르기 전에 잰 좌표는
          이미 낡아 있을 수 있다(2026-09-23 실측: 묶음 제목이 74px
          내려가 있었다). 사람도 누른 뒤에 목표를 보고 옮긴다.

        `point` 가 함수면 그 함수를 **끌기가 시작된 뒤에** 부른다.
      */
      const dragRowTo = async (p, id, point) => {

        const from = await handleBox(p, id);

        if (!from) throw new Error("끌 자리를 찾지 못했습니다: " + id);

        await p.mouse.move(from.x, from.y);
        await p.mouse.down();
        await p.mouse.move(from.x + 4, from.y + 4);

        await sleep(150);

        const to =
          (typeof point === "function") ? await point() : point;

        if (!to) {
          await p.mouse.up();
          throw new Error("놓을 자리를 찾지 못했습니다: " + id);
        }

        const tx = (to.x === undefined) ? to.cx : to.x;
        const ty = (to.y === undefined) ? to.cy : to.y;

        for (let i = 1; i <= 8; i += 1) {
          await p.mouse.move(
            from.x + (tx - from.x) * (i / 8),
            from.y + (ty - from.y) * (i / 8)
          );
        }

        await p.mouse.up();

        await sleep(700);

      };

      const undoCount = async (p) => (await historyState(p)).undo;


      /* ---- 1. flow.blocks 안의 순서 ---- */

      const blocksBefore = await blocksOrder(page);

      check("시작 순서가 스킨 그대로다",
        blocksBefore === "v2Logo,v2Text,v2Rule,v2Wide,v2Main",
        blocksBefore);

      /* 마지막 블록을 **첫째 자리**로 */
      await dragRowTo(page, "v2Main", () => rowEdge(page, "v2Logo", "top"));

      check("★ 블록을 첫째 자리로 옮긴다",
        (await blocksOrder(page)) === "v2Main,v2Logo,v2Text,v2Rule,v2Wide",
        await blocksOrder(page));

      check("★ 옮겨도 트리 순서 = draft 배열 순서다",
        (await page.evaluate(() =>
          window.studioCanvasNodeList()
            .filter((n) => n.kind === "block").map((n) => n.id).join(","))) ===
          (await blocksOrder(page)),
        "화면만의 정렬을 만들지 않는다");

      /* 가운데 자리로 */
      await dragRowTo(page, "v2Main", () => rowEdge(page, "v2Rule", "bottom"));

      check("★ 가운데 자리로도 옮긴다",
        (await blocksOrder(page)) === "v2Logo,v2Text,v2Rule,v2Main,v2Wide",
        await blocksOrder(page));

      /* 마지막 자리로 되돌린다 */
      await dragRowTo(page, "v2Main", () => rowEdge(page, "v2Wide", "bottom"));

      check("★ 마지막 자리로 옮긴다",
        (await blocksOrder(page)) === "v2Logo,v2Text,v2Rule,v2Wide,v2Main",
        await blocksOrder(page));


      /* ---- 2. 변화 없는 drop 은 기록 0 칸 ---- */

      const beforeNoop = await undoCount(page);
      const jsonNoop = JSON.stringify(await readCanvas(page));

      await dragRowTo(page, "v2Rule", () => rowEdge(page, "v2Rule", "middle"));

      check("★ 변화 없는 drop 은 Undo 칸을 먹지 않는다",
        (await undoCount(page)) === beforeNoop &&
        JSON.stringify(await readCanvas(page)) === jsonNoop,
        JSON.stringify({ before: beforeNoop, after: await undoCount(page) }));


      /* ---- 3. 금지된 drop — 다른 부모의 자리 ---- */

      const jsonForbidden = JSON.stringify(await readCanvas(page));
      const beforeForbidden = await undoCount(page);

      /* 블록을 `페이지 장식` 묶음 제목 위로 — 흐름 블록은 거기로 갈 수 없다 */
      const overlayHeader = await groupBox(page, "overlay");

      const forbidden = await (async () => {

        const from = await handleBox(page, "v2Rule");

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(overlayHeader.cx, overlayHeader.cy, { steps: 8 });

        const seen = await page.evaluate(() =>
          window.getStudioCanvasLayersDragState());

        await page.mouse.up();
        await sleep(500);

        return seen;

      })();

      check("★ 금지된 자리는 끌고 있는 동안에도 금지로 보인다",
        forbidden.dragging === true && forbidden.drop === "none",
        JSON.stringify(forbidden));

      check("★ 금지된 자리에 놓아도 아무 일도 없다(기록 0 칸)",
        JSON.stringify(await readCanvas(page)) === jsonForbidden &&
        (await undoCount(page)) === beforeForbidden,
        "flow block 은 overlay 로도 main_visual 안으로도 가지 않는다");

      /* ★ 폴더 행 위라고 해서 "안으로 들어간다"가 아니다.

         블록에게 `메인 비주얼` 행은 **같은 부모의 형제 한 줄**이다 —
         거기에 놓으면 그 앞/뒤 자리로 가는 것이 맞고, 프레임 **안**으로
         들어가는 길은 블록에게 아예 없다. 재는 것은 그 둘이다. */

      const ontoFolder = await (async () => {

        const from = await handleBox(page, "v2Rule");
        const folder = await rowBox(page, "v2Main");

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(folder.cx, folder.cy, { steps: 6 });

        const seen = await page.evaluate(() =>
          window.getStudioCanvasLayersDragState());

        await page.mouse.up();
        await sleep(600);

        return seen;

      })();

      check("★ 블록을 메인 비주얼 폴더 위에 놓아도 **안으로 들어가지 않는다**",
        ontoFolder.drop === "reorder" &&
        (await state(page)).rows.some(
          (r) => r.id === "v2Rule" && r.kind === "block" && !r.parentId),
        JSON.stringify(ontoFolder));

      check("★ 프레임 안에는 블록 종류가 한 개도 없다(폴더는 한 단계다)",
        (await state(page)).rows
          .filter((r) => r.kind === "frame-element")
          .every((r) => r.type !== "main_visual" && r.type !== "divider"),
        JSON.stringify((await state(page)).rows
          .filter((r) => r.kind === "frame-element").map((r) => r.type)));


      /* ---- 4. 프레임 내부 요소의 순서 ---- */

      const innerBefore = await innerOrder(page);

      /* 앞 절이 블록 순서를 한 번 더 바꿨다 — 지금 값을 기준으로 잰다 */
      const blocksAtInner = await blocksOrder(page);

      check("프레임 내부 시작 순서",
        innerBefore === "v2Paper,v2Photo,v2Tag,v2Photo2", innerBefore);

      await dragRowTo(page, "v2Paper", () => rowEdge(page, "v2Photo2", "bottom"));

      check("★ main_visual 내부 요소의 순서를 바꾼다(맨 뒤로)",
        (await innerOrder(page)) === "v2Photo,v2Tag,v2Photo2,v2Paper",
        await innerOrder(page));

      check("★ 내부 순서를 바꿔도 블록 순서 · 장식은 그대로다",
        (await blocksOrder(page)) === blocksAtInner &&
        (await overlaysOrder(page)) === "v2Over",
        JSON.stringify({ before: blocksAtInner, after: await blocksOrder(page) }));


      /* ---- 5. overlays 의 순서 ---- */

      await addMaterial(page, "overlay", "shape");
      await sleep(500);

      await page.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      const madeId = await page.evaluate(() =>
        window.getStudioCanvasSelection().primaryId);

      check("새 장식이 맨 뒤에 생겼다",
        (await overlaysOrder(page)) === `v2Over,${madeId}`,
        await overlaysOrder(page));

      await dragRowTo(page, madeId, () => rowEdge(page, "v2Over", "top"));

      check("★ overlays 의 순서를 바꾼다",
        (await overlaysOrder(page)) === `${madeId},v2Over`,
        await overlaysOrder(page));

      check("★ 순서를 바꿔도 같은 id 가 골라진 채로 남는다",
        (await page.evaluate(() =>
          window.getStudioCanvasSelection().primaryId)) === madeId,
        "소속도 좌표도 안 바뀌었으므로 선택이 살아 있다");


      /* ---- 6. 묶기 — 폴더에 떨군다 ---- */

      const screenBox = async (id) =>
        (await rectsFor(page, frame, false, [id]))[byId(id)];

      const beforeAttach = await screenBox("v2Over");

      const attachedRotation = await page.evaluate(() => {
        const c = currentWorkingSkin.regions.find((r) => r.name === "home_canvas");
        return (c.canvas.overlays.find((o) => o.id === "v2Over") || {}).rotation;
      });

      await page.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(300);

      await dragRowTo(page, "v2Over", () => rowEdge(page, "v2Main", "middle"));

      const afterAttach = await state(page);

      check("★ overlay 를 **떨군 그 폴더**의 자식으로 옮긴다",
        afterAttach.rows.some(
          (r) => r.id === "v2Over" && r.kind === "frame-element" &&
                 r.parentId === "v2Main"),
        JSON.stringify(afterAttach.rows.find((r) => r.id === "v2Over")));

      check("★ 묶은 뒤 그 폴더가 펼쳐져 보인다",
        afterAttach.drawn.indexOf("v2Over") !== -1,
        JSON.stringify(afterAttach.drawn));

      const afterAttachBox = await screenBox("v2Over");

      check("★ 묶어도 화면 자리 · 크기가 그대로다(±2px)",
        Math.abs(afterAttachBox.left - beforeAttach.left) <= 2 &&
        Math.abs(afterAttachBox.top - beforeAttach.top) <= 2 &&
        Math.abs((afterAttachBox.right - afterAttachBox.left) -
                 (beforeAttach.right - beforeAttach.left)) <= 2,
        JSON.stringify({ before: beforeAttach, after: afterAttachBox }));

      check("★ id · 각도는 바뀌지 않는다",
        (await page.evaluate(() => {
          const c = currentWorkingSkin.regions.find((r) => r.name === "home_canvas");
          const f = c.canvas.flow.blocks.find((b) => b.id === "v2Main");
          const n = f.props.elements.find((e) => e.id === "v2Over");
          return n ? n.rotation : null;
        })) === attachedRotation,
        String(attachedRotation));


      /* ---- 7. 빼기 — `페이지 장식` 제목에 떨군다 ---- */

      const beforeDetach = await screenBox("v2Tag");

      await page.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(300);

      /* v2Tag 는 pin 을 쓰는 요소다 — 빼기의 두 계산 중 나머지 하나 */
      await dragRowTo(page, "v2Tag", () => groupBox(page, "overlay"));

      check("★ pin 을 쓰는 프레임 내부 요소를 페이지 장식으로 뺀다",
        (await state(page)).rows.some(
          (r) => r.id === "v2Tag" && r.kind === "overlay"),
        JSON.stringify((await state(page)).rows.find((r) => r.id === "v2Tag")));

      const afterDetachBox = await screenBox("v2Tag");

      check("★ 빼도 화면 자리 · 크기가 그대로다(±2px)",
        Math.abs(afterDetachBox.left - beforeDetach.left) <= 2 &&
        Math.abs(afterDetachBox.top - beforeDetach.top) <= 2,
        JSON.stringify({ before: beforeDetach, after: afterDetachBox }));

      /* transform 을 쓰는 요소도 */
      const beforeDetach2 = await screenBox("v2Paper");

      await dragRowTo(page, "v2Paper", () => groupBox(page, "overlay"));

      const afterDetach2 = await screenBox("v2Paper");

      check("★ transform 을 쓰는 요소도 뺀다",
        (await state(page)).rows.some(
          (r) => r.id === "v2Paper" && r.kind === "overlay"),
        JSON.stringify({
          row: (await state(page)).rows.find((r) => r.id === "v2Paper"),
          note: (await state(page)).note
        }));

      check("★ transform 요소도 화면 자리 · 크기가 그대로다(±2px)",
        Math.abs(afterDetach2.left - beforeDetach2.left) <= 2 &&
        Math.abs(afterDetach2.top - beforeDetach2.top) <= 2 &&
        Math.abs((afterDetach2.right - afterDetach2.left) -
                 (beforeDetach2.right - beforeDetach2.left)) <= 2,
        JSON.stringify({ before: beforeDetach2, after: afterDetach2 }));

      check("★ 대표 사진은 뺄 수 없고 이유를 말한다",
        await (async () => {
          await dragRowTo(page, "v2Photo", () => groupBox(page, "overlay"));
          const now = await state(page);
          return now.rows.some(
            (r) => r.id === "v2Photo" && r.kind === "frame-element") &&
            now.note.indexOf("대표 사진") !== -1;
        })(),
        (await state(page)).note);


      /* ---- 8. 대표 사진 ---- */

      const primaryBefore = JSON.stringify(await readCanvas(page));

      await page.click("#studioCanvasLayerPrimary-v2Photo2");
      await sleep(500);

      const afterPrimary = await state(page);

      check("★ 다른 사진을 대표로 지정한다",
        afterPrimary.rows.some((r) => r.id === "v2Photo2" && r.primary === true) &&
        afterPrimary.rows.some((r) => r.id === "v2Photo" && r.primary === false),
        JSON.stringify(afterPrimary.rows.filter((r) => r.canBePrimary)));

      check("★ 옛 대표는 지워지지 않고 보통 사진으로 남는다",
        afterPrimary.rows.some(
          (r) => r.id === "v2Photo" && r.kind === "frame-element" &&
                 r.parentId === "v2Main"),
        "");

      check("★ 대표 지정 한 번 = Undo 한 칸",
        await (async () => {
          await page.click("#studioUndoButton");
          await sleep(600);
          return JSON.stringify(await readCanvas(page)) === primaryBefore;
        })(),
        "↶ 한 번이면 옛 대표로 돌아온다");

      await page.click("#studioRedoButton");
      await sleep(600);

      check("Redo 하면 새 대표가 돌아온다",
        (await state(page)).rows.some(
          (r) => r.id === "v2Photo2" && r.primary === true));

      check("★ 대표 사진의 ★ 단추는 눌러도 아무 일이 없다(이미 대표다)",
        await page.evaluate(() =>
          document.getElementById("studioCanvasLayerPrimary-v2Photo2").disabled === true));


      /* ---- 9. 숨김 ---- */

      const beforeHide = await undoCount(page);

      await page.click("#studioCanvasLayerEye-v2Text");
      await sleep(500);

      /* ★ Preview 는 **프레임 안**이다(native 도 iframe 하나다). 위
         문서에서 찾으면 언제나 null 이라 "사라졌다"가 거저 참이 된다. */
      check("★ 눈을 누르면 hidden 이 켜지고 Preview 에서 사라진다",
        (await state(page)).rows.some((r) => r.id === "v2Text" && r.hidden === true) &&
        await frame.evaluate(() => {
          const el = document.querySelector('[data-imory-edit-id="v2Text"]');
          return !!el && el.hidden === true;
        }),
        JSON.stringify(await frame.evaluate(() => {
          const el = document.querySelector('[data-imory-edit-id="v2Text"]');
          return { found: !!el, hidden: el ? el.hidden : null };
        })));

      check("★ 숨겨도 Layers 행은 남는다(다시 켜는 유일한 길)",
        (await state(page)).drawn.indexOf("v2Text") !== -1,
        JSON.stringify((await state(page)).drawn));

      check("★ 숨기기 한 번 = Undo 한 칸",
        (await undoCount(page)) === beforeHide + 1,
        JSON.stringify({ before: beforeHide, after: await undoCount(page) }));

      await page.click("#studioCanvasLayerEye-v2Text");
      await sleep(500);

      /* Preview 는 다시 그려진 뒤에 잰다 — 그리기가 끝나기 전의
         null 을 "안 돌아왔다"로 읽지 않는다 */
      await frame.waitForFunction(
        () => {
          const el = document.querySelector('[data-imory-edit-id="v2Text"]');
          return !!el && el.hidden === false;
        },
        null, { timeout: 10000 }
      ).catch(() => null);

      check("★ 다시 켜면 Preview 에 돌아온다",
        (await state(page)).rows.some((r) => r.id === "v2Text" && r.hidden === false) &&
        await frame.evaluate(() => {
          const el = document.querySelector('[data-imory-edit-id="v2Text"]');
          return !!el && el.hidden === false;
        }),
        JSON.stringify(await frame.evaluate(() => {
          const el = document.querySelector('[data-imory-edit-id="v2Text"]');
          return { found: !!el, hidden: el ? el.hidden : null };
        })));

      check("★ 켰다 끄면 JSON 이 처음 모양으로 정확히 돌아온다",
        await page.evaluate(() => {
          const c = currentWorkingSkin.regions.find((r) => r.name === "home_canvas");
          const b = c.canvas.flow.blocks.find((x) => x.id === "v2Text");
          return !("hidden" in b);
        }),
        "끄면 칸을 지운다 — 계산값을 기본값인 척 적지 않는다");

      check("★ 대표 사진은 숨길 수 없고 이유를 말한다",
        await (async () => {
          await page.click("#studioCanvasLayerEye-v2Photo2");
          await sleep(400);
          const now = await state(page);
          return now.rows.some((r) => r.id === "v2Photo2" && r.hidden === false) &&
            now.note.indexOf("대표 사진") !== -1;
        })(),
        (await state(page)).note);


      /* ---- 10. 잠금 ---- */

      await page.click("#studioCanvasLayerLock-v2Rule");
      await sleep(500);

      check("★ 자물쇠를 누르면 locked 가 켜진다",
        (await state(page)).rows.some((r) => r.id === "v2Rule" && r.locked === true),
        "");

      const lockedClick = await (async () => {

        await clickElement(page, frame, false, "v2Logo").catch(() => null);
        await sleep(600);

        const before = await page.evaluate(() =>
          window.getStudioCanvasSelection().primaryId);

        await clickElement(page, frame, false, "v2Rule").catch(() => null);
        await sleep(600);

        const after = await page.evaluate(() =>
          window.getStudioCanvasSelection().primaryId);

        return { before, after };

      })();

      check("★ 잠근 요소는 Preview 클릭에서 빠진다",
        lockedClick.after !== "v2Rule",
        JSON.stringify(lockedClick));

      await page.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      check("★ 잠근 것도 Layers 에서 풀 수 있다",
        await (async () => {
          await page.click("#studioCanvasLayerLock-v2Rule");
          await sleep(500);
          return (await state(page)).rows.some(
            (r) => r.id === "v2Rule" && r.locked === false);
        })(),
        "");


      /* ---- 11. 삭제 ---- */

      const beforeRemove = JSON.stringify(await readCanvas(page));

      await page.click("#studioCanvasLayerRemove-v2Rule");
      await sleep(600);

      check("★ 단순 요소를 지운다",
        (await state(page)).rows.every((r) => r.id !== "v2Rule"),
        JSON.stringify((await state(page)).rows.map((r) => r.id)));

      check("★ 지운 뒤 없는 id 가 선택에 남지 않는다",
        (await page.evaluate(() =>
          window.getStudioCanvasSelection().ids.indexOf("v2Rule"))) === -1,
        "");

      check("★ 삭제는 Undo 로 되살아난다",
        await (async () => {
          await page.click("#studioUndoButton");
          await sleep(700);
          return JSON.stringify(await readCanvas(page)) === beforeRemove;
        })(),
        "지운 것을 어딘가에 담아 두지 않는다 — 되살리는 길은 Undo 하나다");

      await page.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      check("★ 대표 사진은 지울 수 없고 이유를 말한다",
        await (async () => {
          const before = JSON.stringify(await readCanvas(page));
          await page.click("#studioCanvasLayerRemove-v2Photo2");
          await sleep(500);
          const now = await state(page);
          return JSON.stringify(await readCanvas(page)) === before &&
            now.note.indexOf("대표 사진") !== -1;
        })(),
        (await state(page)).note);

      /* main_visual 은 자식 수를 보여 주고 한 번 묻는다 */
      let asked = "";

      page.on("dialog", async (dialog) => {
        asked = dialog.message();
        await dialog.dismiss();
      });

      const beforeCancel = JSON.stringify(await readCanvas(page));
      const undoBeforeCancel = await undoCount(page);

      await page.click("#studioCanvasLayerRemove-v2Main");
      await sleep(600);

      check("★ 메인 비주얼 삭제는 자식 수를 보여 주고 묻는다",
        /요소\s*\d+개/.test(asked), asked);

      check("★ 취소하면 기록 0 칸이다",
        JSON.stringify(await readCanvas(page)) === beforeCancel &&
        (await undoCount(page)) === undoBeforeCancel,
        "묻는 자리는 문 앞이다 — draft 에 닿은 뒤 되돌리지 않는다");


      /* ---- 12. Save → 다시 열기 ---- */

      const beforeSave = JSON.stringify(await readCanvas(page));

      await page.click("#studioSaveButton");

      await page.waitForFunction(
        () => Array.isArray(window.__savedDraftCallsLay) &&
          window.__savedDraftCallsLay.length > 0,
        null, { timeout: 15000 }
      );

      const savedContent = await page.evaluate(() => {
        const calls = window.__savedDraftCallsLay;
        return calls[calls.length - 1].p_content;
      });

      check("pageerror 0", page.__errors.length === 0,
        page.__errors.slice(0, 2).join(" | "));

      await close(page);

      const again = await openStudio(browser, { package: savedContent });

      await canvasFrame(again, false);

      check("★ Save → 다시 열기에서 순서 · 소속 · 상태가 글자 단위로 같다",
        JSON.stringify(await readCanvas(again)) === beforeSave);

      await enableCanvasEditing(again);

      await again.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      check("★ 다시 연 Studio 의 트리가 저장된 배열 순서 그대로다",
        (await state(again)).rows.map((r) => r.id).join(",") ===
          (await again.evaluate(() =>
            window.studioCanvasNodeList().map((n) => n.id).join(","))),
        JSON.stringify((await state(again)).rows.map((r) => r.id)));

      check("다시 열기 pageerror 0", again.__errors.length === 0,
        again.__errors.slice(0, 2).join(" | "));

      await close(again);


      /* ---- 13. 390px — 길게 눌러야 끌린다 ----

         손가락은 합성 PointerEvent 로 만든다. Playwright 의
         touchscreen 에는 끌기가 없고, 여기서 재려는 것은 **타이머와
         슬롭의 판정**이라 합성으로 충분하다(제스처를 받는 코드가
         pointerType 하나로 갈린다).
      */

      const touchPage = await openStudio(browser, {
        package: structPackage({}),
        viewport: { width: 390, height: 844 }
      });

      await canvasFrame(touchPage, false);

      await enableCanvasEditing(touchPage);

      await touchPage.evaluate(() =>
        window.showStudioLeftPanelMode("layers", { sheet: "full" }));

      await sleep(600);

      /* 합성 touch pointer 한 벌 */
      await touchPage.evaluate(() => {

        window.__touch = {

          down(id, dx, dy) {
            const el = document.querySelector(`[data-layer-handle="${id}"]`);
            const r = el.getBoundingClientRect();
            window.__touchAt = {
              x: r.left + r.width / 2 + (dx || 0),
              y: r.top + r.height / 2 + (dy || 0)
            };
            el.dispatchEvent(new PointerEvent("pointerdown", {
              bubbles: true, cancelable: true, pointerId: 7,
              pointerType: "touch", button: 0, isPrimary: true,
              clientX: window.__touchAt.x, clientY: window.__touchAt.y
            }));
          },

          move(x, y) {
            window.__touchAt = { x: x, y: y };
            document.dispatchEvent(new PointerEvent("pointermove", {
              bubbles: true, cancelable: true, pointerId: 7,
              pointerType: "touch", isPrimary: true, clientX: x, clientY: y
            }));
          },

          moveTo(id, edge) {
            const el = document.querySelector(
              `.studio-canvas-layers-row[data-layer-id="${id}"]`);
            const r = el.getBoundingClientRect();
            window.__touch.move(
              r.left + r.width / 2,
              edge === "top" ? r.top + 2 : r.bottom - 2
            );
          },

          up() {
            document.dispatchEvent(new PointerEvent("pointerup", {
              bubbles: true, cancelable: true, pointerId: 7,
              pointerType: "touch", isPrimary: true,
              clientX: window.__touchAt.x, clientY: window.__touchAt.y
            }));
          }

        };

      });

      const dragState = (p) =>
        p.evaluate(() => window.getStudioCanvasLayersDragState());

      const longPressMs = await touchPage.evaluate(() =>
        window.STUDIO_CANVAS_LAYERS_LONG_PRESS_MS);

      check("★ 길게 누르기 시간이 실측값 하나다",
        longPressMs === 350, String(longPressMs));

      /* (a) 짧게 누르면 시작되지 않는다 */
      await touchPage.evaluate(() => window.__touch.down("v2Logo"));
      await sleep(120);

      const early = await dragState(touchPage);

      await touchPage.evaluate(() => window.__touch.up());
      await sleep(300);

      check("★ 짧게 누르면 끌기가 시작되지 않는다",
        early.armed === true && early.dragging === false,
        JSON.stringify(early));

      /* (b) 타이머 전에 움직이면 스크롤 의도다 — 취소 */
      const beforeScrollIntent = JSON.stringify(await readCanvas(touchPage));

      await touchPage.evaluate(() => window.__touch.down("v2Logo"));
      await sleep(120);
      await touchPage.evaluate(() =>
        window.__touch.move(window.__touchAt.x, window.__touchAt.y + 40));
      await sleep(400);

      const cancelled = await dragState(touchPage);

      await touchPage.evaluate(() => window.__touch.up());
      await sleep(400);

      check("★ 길게 누르기 전에 움직이면 스크롤 의도로 읽고 취소한다",
        cancelled.armed === false && cancelled.dragging === false &&
        JSON.stringify(await readCanvas(touchPage)) === beforeScrollIntent,
        JSON.stringify(cancelled));

      /* (c) 길게 누르면 시작된다 */
      await touchPage.evaluate(() => window.__touch.down("v2Main"));
      await sleep(longPressMs + 150);

      const held = await dragState(touchPage);

      check("★ 길게 누르면 끌기가 시작된다",
        held.dragging === true && held.id === "v2Main",
        JSON.stringify(held));

      await touchPage.evaluate(() => window.__touch.moveTo("v2Logo", "top"));
      await sleep(120);
      await touchPage.evaluate(() => window.__touch.up());
      await sleep(700);

      check("★ 좁은 화면에서도 순서가 바뀐다",
        (await state(touchPage)).rows
          .filter((r) => r.kind === "block").map((r) => r.id)
          .join(",") === "v2Main,v2Logo,v2Text,v2Rule,v2Wide",
        JSON.stringify((await state(touchPage)).rows
          .filter((r) => r.kind === "block").map((r) => r.id)));

      /* (d) Escape 로 취소 */
      const beforeEsc = JSON.stringify(await readCanvas(touchPage));

      await touchPage.evaluate(() => window.__touch.down("v2Logo"));
      await sleep(longPressMs + 150);
      await touchPage.evaluate(() => window.__touch.moveTo("v2Wide", "bottom"));
      await sleep(100);

      const focusAt = await touchPage.evaluate(() =>
        (document.activeElement && document.activeElement.tagName) || "none");

      await touchPage.keyboard.press("Escape");
      await sleep(300);

      const escaped = { ...(await dragState(touchPage)), focusAt };

      await touchPage.evaluate(() => window.__touch.up());
      await sleep(500);

      check("★ Escape 는 끌기를 취소한다(기록 0 칸)",
        escaped.dragging === false &&
        JSON.stringify(await readCanvas(touchPage)) === beforeEsc,
        JSON.stringify(escaped));

      /* (e) pointercancel 도 취소다 */
      await touchPage.evaluate(() => window.__touch.down("v2Logo"));
      await sleep(longPressMs + 150);
      await touchPage.evaluate(() =>
        document.dispatchEvent(new PointerEvent("pointercancel", {
          bubbles: true, pointerId: 7, pointerType: "touch"
        })));
      await sleep(200);

      check("★ pointercancel 도 끌기를 취소한다",
        (await dragState(touchPage)).armed === false &&
        JSON.stringify(await readCanvas(touchPage)) === beforeEsc,
        "");

      /* (f) 패널 세로 스크롤이 산다 */
      const scrolls = await touchPage.evaluate(() => {
        const section = document.getElementById("studioLeftPanelLayers");
        const root = document.getElementById("studioCanvasLayers");
        const handle = document.querySelector(".studio-canvas-layers-handle");
        const row = document.querySelector(".studio-canvas-layers-row");
        const before = section.scrollTop;
        section.scrollTop = before + 40;
        const moved = section.scrollTop !== before;
        section.scrollTop = before;
        return {
          moved: moved || section.scrollHeight <= section.clientHeight,
          rootTouch: getComputedStyle(root).touchAction,
          rowTouch: getComputedStyle(row).touchAction,
          handleTouch: getComputedStyle(handle).touchAction
        };
      });

      check("★ 손잡이만 touch-action:none 이고 행 · 패널은 그대로다",
        scrolls.handleTouch === "none" &&
        scrolls.rootTouch !== "none" && scrolls.rowTouch !== "none" &&
        scrolls.moved === true,
        JSON.stringify(scrolls));

      check("390px pageerror 0", touchPage.__errors.length === 0,
        touchPage.__errors.slice(0, 2).join(" | "));

      await close(touchPage);


      /* ---- 14. 다중 선택 상태에서는 거부한다 ---- */

      const multi = await openStudio(browser, { package: structPackage({}) });

      await canvasFrame(multi, false);

      await enableCanvasEditing(multi);

      await multi.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(400);

      await multi.click("#studioCanvasLayer-v2Logo");
      await sleep(400);

      await multi.click("#studioCanvasLayer-v2Text", { modifiers: ["Control"] });
      await sleep(500);

      const picked = await multi.evaluate(() =>
        window.getStudioCanvasSelection().ids.slice());

      check("둘을 골랐다", picked.length === 2, JSON.stringify(picked));

      const multiJson = JSON.stringify(await readCanvas(multi));

      const from = await handleBox(multi, "v2Text");

      await multi.mouse.move(from.x, from.y);
      await multi.mouse.down();
      await multi.mouse.move(from.x, from.y - 60, { steps: 6 });

      const refused = await dragState(multi);

      await multi.mouse.up();
      await sleep(500);

      check("★ 다중 선택에서는 구조 drag 를 시작하지 않는다",
        refused.armed === false && refused.dragging === false &&
        JSON.stringify(await readCanvas(multi)) === multiJson,
        JSON.stringify(refused));

      const kept = await multi.evaluate(() =>
        window.getStudioCanvasSelection().ids.slice());

      check("★ 선택을 조용히 해제하지 않고 이유를 적는다",
        kept.join(",") === picked.join(",") &&
        (await state(multi)).note.indexOf("여러 요소") !== -1,
        JSON.stringify({ kept, note: (await state(multi)).note }));

      check("다중 선택 pageerror 0", multi.__errors.length === 0,
        multi.__errors.slice(0, 2).join(" | "));

      await close(multi);


      /* ---- 15. sandbox 에서도 같은 한 길 ---- */

      const sbStruct = await openStudio(browser, {
        package: structPackage({ sandbox: true }),
        sandbox: true
      });

      const sbStructFrame = await canvasFrame(sbStruct, true);

      await enableCanvasEditing(sbStruct);

      await sbStruct.evaluate(() => window.showStudioLeftPanelMode("layers"));
      await sleep(500);

      await dragRowTo(sbStruct, "v2Main", () => rowEdge(sbStruct, "v2Logo", "top"));

      check("★ sandbox 에서도 순서가 같은 결과다",
        (await state(sbStruct)).rows.filter((r) => r.kind === "block")
          .map((r) => r.id).join(",") === "v2Main,v2Logo,v2Text,v2Rule,v2Wide",
        JSON.stringify((await state(sbStruct)).rows
          .filter((r) => r.kind === "block").map((r) => r.id)));

      await sbStruct.click("#studioCanvasLayerEye-v2Text");
      await sleep(600);

      check("★ sandbox 프레임도 숨김을 그대로 그린다",
        await sbStructFrame.evaluate(() => {
          const el = document.querySelector('[data-imory-edit-id="v2Text"]');
          return !el || el.hidden === true;
        }),
        "네 화면이 같은 렌더러 한 벌이다");

      await dragRowTo(sbStruct, "v2Over", () => rowEdge(sbStruct, "v2Main", "middle"));

      check("★ sandbox 에서도 묶기가 기존 경로를 지난다",
        (await state(sbStruct)).rows.some(
          (r) => r.id === "v2Over" && r.kind === "frame-element" &&
                 r.parentId === "v2Main"),
        JSON.stringify((await state(sbStruct)).rows.find((r) => r.id === "v2Over")));

      check("★ sandbox CSP 위반 0",
        (await cspViolations(sbStructFrame)).length === 0,
        JSON.stringify(await cspViolations(sbStructFrame)));

      check("sandbox pageerror 0", sbStruct.__errors.length === 0,
        sbStruct.__errors.slice(0, 2).join(" | "));

      await close(sbStruct);

    }

    /* ======================================================
       [sandbox] — 별도 origin 프레임
    ====================================================== */
    if (wants("sandbox")) {

      section("sandbox");

      const page = await openStudio(browser, { sandbox: true });
      const frame = await canvasFrame(page, true);

      await enableCanvasEditing(page);

      await clickElement(page, frame, true, "cvText");

      const panel = await readPanel(page);

      check("sandbox 에서도 같은 부모 패널이 열린다",
        panel.canvasPanel === true && panel.title === "Canvas 글자" &&
        panel.textValue === "한 줄",
        JSON.stringify({ t: panel.title, v: panel.textValue }));

      await typeText(page, "sandbox 글자\n두 줄");

      check("sandbox 에서도 draft 가 같은 문구를 갖는다",
        textOf(await readCanvas(page), "cvText") === "sandbox 글자\n두 줄",
        JSON.stringify(textOf(await readCanvas(page), "cvText")));

      const drawn = await drawnText(page, frame, true, "cvText");

      check("별도 origin 프레임이 그 문구를 평문으로 그린다",
        drawn && drawn.text === "sandbox 글자\n두 줄" && drawn.bold === 0,
        JSON.stringify(drawn && drawn.text));

      await typeNumber(page, "x", 77);

      check("sandbox 에서도 숫자 칸이 저장된다",
        geometryOf(await readCanvas(page), "cvText").x === 77,
        JSON.stringify(geometryOf(await readCanvas(page), "cvText")));

      const violations = await cspViolations(frame);

      check("프레임 CSP 위반 0", violations.length === 0,
        JSON.stringify(violations.slice(0, 3)));

      const parentViolations =
        await page.evaluate(() => (window.__cspViolations || []).slice());

      check("부모 CSP 위반 0", parentViolations.length === 0,
        JSON.stringify(parentViolations.slice(0, 3)));

      check("pageerror 0", page.__errors.length === 0, page.__errors[0] || "");

      await close(page);

    }

  }
  finally {
    await browser.close();
    servers.forEach((s) => s.close());
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);

  if (failures.length) {
    failures.forEach((f) => console.log("  - " + f));
    process.exitCode = 1;
  }

}


main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
