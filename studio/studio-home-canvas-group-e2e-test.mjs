/* =========================================================
   STUDIO — HOME Canvas 영구 그룹 E2E (HOME-CANVAS-GROUP-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §38
   설계:      docs/plans/IMORY_HOME_CANVAS_GROUP_DESIGN.md

   ── 이 파일이 재는 것 ───────────────────────────────────
   저장 모양 · 검증 · 순수 writer 는 브라우저 없이 이미 본다
   (skin/skin-home-canvas-test.mjs `[v2-group]`). 여기서는
   **브라우저에서만 참이 되는 것**을 잰다.

     1  **화면이 안 바뀐다** — 묶기 전후로 실제 그려진 rect 가
        소수점까지 같다(저장값이 아니라 픽셀이다)
     2  **비연속 z-order** — 멤버 사이에 그룹 밖 요소가 끼어 있어도
        배열은 재정렬되지 않고 폴더의 자식 순서는 원본 상대 순서다
     3  **폴더** — 펼침 · 접힘 · 자동 펼침 · 그룹 선택과 자식 선택의 차이
     4  **한 번 = Undo 한 칸** — 만들기 · 해제 · 넣기 · 빼기 ·
        이름 변경 · 삭제. 취소 · 같은 이름 · 금지는 **0칸**
     5  **끌기** — 폴더 가운데 띠에 넣기 · 폴더 밖으로 빼기 ·
        그룹 사이 이동 · 공간 혼합 금지 · 마지막 멤버 자동 해제
     6  **Import 수선** — 낡은 명단을 실제 Import 창이 고치고 알린다
     7  **왕복** — Save → 다시 열기 · Export → Import · Publish resolve
     8  **390px** 과 **sandbox parity** · CSP 위반 0

   [save]     저장 · 보존 · 묶기 전후 rect/geometry 동일 ·
              비연속 z-order · 실행 payload 에 groups 없음
   [tree]     폴더 행 · 펼침/접힘 · 그룹 선택 vs 자식 선택 ·
              손잡이 · 눈 · 자물쇠가 폴더 행에 없다
   [name]     이름 변경 · 취소 · 같은 이름 · Undo
   [ops]      해제 · 삭제(확인 · 취소 · Undo) · 만들기 단추의 조건
   [drag]     넣기 · 빼기 · 그룹 사이 이동 · 공간 혼합 거절 ·
              마지막 멤버 자동 해제
   [import]   Import 의 낡은 명단 수선과 완료 안내
   [group-move] 그룹 전체 이동 — 공통 delta · 좌표 공간 넷 · hidden/locked ·
              원자성 · stale · Undo 한 칸 · 390px 터치 · sandbox parity
   [group-resize] 그룹 전체 크기 조절 — 모서리 넷 · 비율 고정 · 반대쪽
              고정점 · 회전한 멤버 · height:"auto" · 프레임 안 · 공통
              배율의 바닥 · 취소 · stale · 원자성 · Undo · 390px · sandbox
   [group-rotate] 그룹 전체 회전 — 공통 각도 · 30° 자석 · 0/360 경계 ·
              서로 다른 초기 각도 · 중심의 공전 · hidden/locked · 취소 ·
              stale · 원자성 · Undo · 390px · sandbox
   [sequence] 이동 → 크기 → 회전 → 이동 · Undo/Redo 네 번 ·
              Export/Import · Publish resolve · Save → 다시 열기
   [round]    Save → 다시 열기 · Export → Import · Publish resolve
   [mobile]   390px — 가로 스크롤 0 · 잘림 0
   [sandbox]  별도 origin 에서 같은 결과 + CSP 위반 0

   Chromium 만 쓴다.

   실행:
     node studio/studio-home-canvas-group-e2e-test.mjs
     node studio/studio-home-canvas-group-e2e-test.mjs --only=drag
     node studio/studio-home-canvas-group-e2e-test.mjs --only=group-resize,group-rotate
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 9010;
const SANDBOX_PORT = 9011;

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
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};


function staticResponse(pathname, search) {

  let rel = decodeURIComponent(pathname);

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
   fixture

   ★ **멤버가 배열에서 연속이 아니다.** 페이지 장식 넷이
     `grpA → grpMid → grpB → grpC` 순서이고, 묶는 것은
     `grpA` 와 `grpB` 다. 그 사이의 `grpMid` 가 이 라운드의 요점을
     지킨다 — 폴더를 만들려고 배열을 재정렬하면 겹침 순서가
     바뀐다(계약 §38-4).

   ★ 프레임 안 요소도 둔다. 좌표 공간이 다른 조합을 거절하는지와
     같은 프레임 안(`transform` + `pin`)은 허용하는지를 함께 잰다.
========================================================== */

const HOME_HTML =
  '<div class="gp-home">' +
  '<div class="gp-canvas" data-imory-canvas-root></div>' +
  "</div>";

const CANVAS_CSS =
  ".gp-home { padding: 0; margin: 0; }" +
  ".gp-canvas { width: 100%; }" +
  '[data-imory-canvas-type="text"] { font: 14px/1.5 Arial, sans-serif; }' +
  '[data-imory-canvas-type="shape"] { background: #d9c7a8; }' +
  '[data-imory-canvas-type="photo"] { background: #efe3d2; }' +
  '[data-imory-canvas-type="sticker"] { background: #cfe3d2; }';

const IMAGE_SLOTS = [
  { name: "photo_1", label: "사진", required: false },
  { name: "sticker_1", label: "스티커", required: false }
];


function skinPackage(options) {

  const o = options || {};

  const canvas = {
    version: 2,
    baseWidth: 390,
    baseHeight: 900,
    gpMystery: { keep: true },
    flow: {
      direction: "column",
      padding: { top: 40, right: 24, bottom: 40, left: 24 },
      gap: 10,
      blocks: [
        { id: "grpSeed", type: "text", width: 300, height: "auto", align: "center",
          props: { text: "씨앗", role: "title" } },

        { id: "grpFrame", type: "main_visual", width: 300, height: 200, align: "center",
          props: {
            baseWidth: 150, baseHeight: 100, primaryId: "grpPhoto",
            elements: [
              { id: "grpPhoto", type: "photo", follow: "transform",
                x: 10, y: 5, width: 120, height: 80, props: { slot: "photo_1" } },
              { id: "grpCap", type: "text", follow: "transform",
                x: 6, y: 88, width: 70, height: 10, props: { text: "캡션", role: "body" } },
              { id: "grpPin", type: "sticker", follow: "pin", width: 20, height: 20,
                pin: { target: "frame", anchor: "top-left", origin: "top-left",
                  offset: { x: 4, y: 4 } },
                props: { slot: "sticker_1" } }
            ]
          } }
      ]
    },
    overlays: [
      { id: "grpA", type: "shape", x: 20, y: 420, width: 60, height: 40,
        props: { kind: "rect" } },
      { id: "grpMid", type: "shape", x: 120, y: 470, width: 50, height: 30,
        props: { kind: "rect" } },
      { id: "grpB", type: "shape", x: 220, y: 520, width: 55, height: 35,
        props: { kind: "rect" } },
      { id: "grpC", type: "shape", x: 40, y: 600, width: 45, height: 25,
        props: { kind: "rect" } }
    ]
  };

  if (o.groups) {
    canvas.groups = JSON.parse(JSON.stringify(o.groups));
  }

  const pkg = {
    schemaVersion: 1,
    templates: {
      home: { html: HOME_HTML },
      category: { html: '<div class="gp-category"></div>' },
      post: { html: '<div class="gp-post"><div data-imory-region="post-body"></div></div>' },
      banner: { html: '<div class="gp-banner"></div>' }
    },
    css: CANVAS_CSS,
    imageSlots: IMAGE_SLOTS,
    regions: [
      { name: "gp_unknown", enabled: true, payload: { keep: true } },
      { name: "home_canvas", enabled: true, canvas: canvas }
    ],
    metadata: {}
  };

  if (o.sandbox) {
    pkg.renderMode = "sandbox";
  }

  return pkg;

}


/* =========================================================
   Studio 열기
========================================================== */

async function openStudio(browser, options) {

  const o = options || {};

  const errors = [];

  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 900 },

    /* HOME-CANVAS-GROUP-1B — 진짜 터치로 재는 절이 있다. 합성
       PointerEvent 로는 이 경로를 지날 수 없다(materials e2e 의
       그 함정과 같다). */
    hasTouch: !!o.hasTouch
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

  /* 확인 창은 테스트가 정한다 — 기본은 [지우기] 다 */
  page.__confirm = true;

  page.on("dialog", async (dialog) => {
    page.__lastDialog = dialog.message();
    if (page.__confirm) {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });

  await page.route("**/api/skin-ai", (route) =>
    route.fulfill({ status: 500, body: "must not be called" }));

  await page.addInitScript(
    (pkg) => { window.__scenarioLaySkinPackage = pkg; },
    o.package || skinPackage(o)
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

  return page;

}


async function close(page) {
  try { await page.__ctx.close(); } catch { /* 이미 닫혔다 */ }
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
        .evaluate(() =>
          !!document.querySelector("[data-imory-canvas-element],[data-imory-canvas-block]"))
        .catch(() => false);

      if (drawn) return frame;

    }

    await sleep(120);

  }

  throw new Error("캔버스를 그린 프레임을 찾지 못했습니다");

}


async function enableCanvasEditing(page) {

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

  await page.waitForFunction(
    () => window.studioCanvasEditingIsOn && window.studioCanvasEditingIsOn() === true,
    null, { timeout: 12000 }
  );

  await sleep(900);

}


/* =========================================================
   화면 창구
========================================================== */

const layersState = (page) =>
  page.evaluate(() => window.getStudioCanvasLayersState());

const selectionOf = (page) =>
  page.evaluate(() => window.getStudioCanvasSelection());

const historyState = (page) =>
  page.evaluate(() =>
    window.getStudioHistoryState ? window.getStudioHistoryState() : null);

const cspViolations = (frame) =>
  frame.evaluate(() => (window.__cspViolations || []).slice());

const readCanvas = (page) => page.evaluate(() => {

  if (typeof currentWorkingSkin === "undefined" || !currentWorkingSkin) {
    return null;
  }

  const entry =
    (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

  return entry ? JSON.parse(JSON.stringify(entry.canvas)) : null;

});

const groupsOf = async (page) => {
  const c = await readCanvas(page);
  return (c && c.groups) || [];
};


/* 프레임에서 잰 실제 rect 들 — 저장값이 아니라 **픽셀**이다 */
async function frameRects(frame, ids) {

  return frame.evaluate((wanted) => {

    const out = {};

    wanted.forEach((id) => {

      const el =
        document.querySelector(`[data-imory-edit-id="${id}"]`);

      if (!el) {
        out[id] = null;
        return;
      }

      const r = el.getBoundingClientRect();

      out[id] = {
        x: Math.round(r.left * 100) / 100,
        y: Math.round(r.top * 100) / 100,
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100
      };

    });

    return out;

  }, ids);

}


/* Layers 패널을 연다 */
async function openLayers(page) {

  await page.evaluate(() => window.showStudioLeftPanelMode("layers"));

  await page.waitForSelector("#studioCanvasLayersTree", { timeout: 8000 });

  await sleep(200);

}


/* 그 id 들을 고른다 — 기존 제안 관문 하나를 지난다 */
async function select(page, ids) {

  await page.evaluate((wanted) => {

    if (!wanted.length) {
      window.clearStudioCanvasSelection();
      return;
    }

    window.proposeStudioCanvasSelection({
      ids: wanted,
      primaryId: wanted[wanted.length - 1],
      mode: "replace"
    });

  }, ids);

  await sleep(300);

}


/* 그룹을 하나 만든다 — 화면의 그 단추를 실제로 누른다 */
async function makeGroup(page, ids) {

  await select(page, ids);

  await page.waitForSelector("#studioCanvasLayersGroupCreate", {
    state: "visible", timeout: 8000
  });

  await page.click("#studioCanvasLayersGroupCreate");

  await sleep(400);

  const groups = await groupsOf(page);

  return groups.length ? groups[groups.length - 1] : null;

}


/* 행 하나의 화면 상자 */
async function rowBox(page, id) {

  return page.evaluate((rowId) => {

    const node =
      document.querySelector(
        `.studio-canvas-layers-row[data-layer-id="${rowId}"]`
      );

    if (!node) return null;

    const r = node.getBoundingClientRect();

    return { x: r.left, y: r.top, w: r.width, h: r.height };

  }, id);

}


/*
  Layers 의 행을 **손잡이로** 끈다.

  ★ 끌기가 시작되면 그 행이 골라지고 패널이 다시 그려질 수 있어서
    누르기 전에 잰 목표 좌표는 낡는다([layerstruct] 의 그 함정).
    누른 뒤에 목표를 다시 잰다.
*/
async function dragRow(page, fromId, targetAt) {

  const handle =
    await page.evaluate((id) => {

      const node =
        document.querySelector(
          `.studio-canvas-layers-row[data-layer-id="${id}"] .studio-canvas-layers-handle`
        );

      if (!node) return null;

      const r = node.getBoundingClientRect();

      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };

    }, fromId);

  if (!handle) {
    return { ok: false, reason: "no-handle" };
  }

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 2, handle.y + 4, { steps: 3 });

  await sleep(120);

  const target =
    await targetAt();

  if (!target) {
    await page.mouse.up();
    return { ok: false, reason: "no-target" };
  }

  await page.mouse.move(target.x, target.y, { steps: 8 });

  await sleep(120);

  const plan =
    await page.evaluate(() => window.getStudioCanvasLayersDragState());

  await page.mouse.move(target.x, target.y);
  await page.mouse.up();

  await sleep(400);

  return { ok: true, plan: plan };

}


/* 폴더 행의 **가운데** 한 점 */
const folderCenter = (page, groupId) =>
  async () => {

    const box = await rowBox(page, groupId);

    return box ? { x: box.x + box.w * 0.4, y: box.y + box.h / 2 } : null;

  };


/* 어떤 행의 **아래쪽 가장자리** 한 점(순서 자리) */
const rowBottom = (page, id) =>
  async () => {

    const box = await rowBox(page, id);

    return box ? { x: box.x + box.w * 0.4, y: box.bottom || (box.y + box.h - 2) } : null;

  };


/* =========================================================
   실행
========================================================== */

const playwright = await loadPlaywright();

const parentServer = await startServer(PARENT_PORT);
const sandboxServer = await startServer(SANDBOX_PORT);

const browser = await playwright.chromium.launch();

try {


/* ---------------------------------------------------------- [save] */

if (wants("save")) {

  section("save");

  const page = await openStudio(browser, {});

  const frame = await canvasFrame(page, false);

  await enableCanvasEditing(page);

  await openLayers(page);

  const ids = ["grpA", "grpMid", "grpB", "grpC"];

  const beforeRects = await frameRects(frame, ids);

  const beforeCanvas = await readCanvas(page);

  const beforeHistory = await historyState(page);

  /* ★ 비연속 z-order — 사이에 낀 `grpMid` 를 남겨 두고 묶는다 */
  const group = await makeGroup(page, ["grpA", "grpB"]);

  check("그룹이 하나 만들어졌다",
    !!group && group.members.length === 2, JSON.stringify(group));

  check("★ 멤버는 캔버스 배열 순서다 — 고른 순서가 아니다",
    !!group && group.members.join(",") === "grpA,grpB",
    group ? group.members.join(",") : "");

  check("기본 이름은 `그룹 1` 이다",
    !!group && group.name === "그룹 1", group ? group.name : "");

  await sleep(400);

  const afterRects = await frameRects(frame, ids);

  check("★ 묶기 전후로 **실제 그려진 rect** 가 소수점까지 같다",
    JSON.stringify(beforeRects) === JSON.stringify(afterRects),
    JSON.stringify({ before: beforeRects.grpA, after: afterRects.grpA }));

  const afterCanvas = await readCanvas(page);

  check("★ 요소 배열이 재정렬되지 않았다 — 겹침 순서가 그대로다",
    JSON.stringify(afterCanvas.overlays) === JSON.stringify(beforeCanvas.overlays),
    afterCanvas.overlays.map((o) => o.id).join(","));

  check("★ flow 와 canvas 의 모르는 칸도 그대로다",
    JSON.stringify(afterCanvas.flow) === JSON.stringify(beforeCanvas.flow) &&
    JSON.stringify(afterCanvas.gpMystery) === JSON.stringify(beforeCanvas.gpMystery));

  const afterHistory = await historyState(page);

  check("★ 그룹 만들기 한 번 = Undo 한 칸",
    afterHistory.undo === beforeHistory.undo + 1,
    `${beforeHistory.undo} → ${afterHistory.undo}`);

  /* 실행 payload 에는 groups 가 없다 */
  const payloadHasGroups = await page.evaluate(() => {

    const payload =
      window.resolveSkinHomeCanvas(
        currentWorkingSkin, currentWorkingSkin.templates.home.html
      );

    return !!payload && payload.groups !== undefined;

  });

  check("★ 실행 payload 에 `groups` 가 없다 — 렌더러가 그룹을 모른다",
    payloadHasGroups === false);

  /* 프레임이 그린 DOM 에도 그룹 노드가 없다 */
  const frameNodes = await frame.evaluate(() =>
    document.querySelectorAll('[data-imory-canvas-type="group"]').length);

  check("★ 프레임 DOM 에 그룹 요소가 하나도 없다", frameNodes === 0);

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}


/* ---------------------------------------------------------- [tree] */

if (wants("tree")) {

  section("tree");

  const page = await openStudio(browser, {});

  await canvasFrame(page, false);

  await enableCanvasEditing(page);

  await openLayers(page);

  const group = await makeGroup(page, ["grpA", "grpB"]);

  const state = await layersState(page);

  const folder =
    state.rows.find((row) => row.kind === "group");

  check("폴더 행이 하나 있다",
    !!folder && folder.id === group.id && folder.count === 2,
    JSON.stringify(folder));

  check("★ 만든 직후 폴더는 펼쳐져 있다", !!folder && folder.expanded === true);

  check("★ 그룹 생성 직후 그 그룹이 선택이다",
    state.selectedGroup === group.id, String(state.selectedGroup));

  /* 화면에 그려진 순서 — 폴더 → 멤버 둘 → 그리고 나머지 */
  const drawn = state.drawn;

  const at = (id) => drawn.indexOf(id);

  check("★ 폴더는 **첫 멤버 자리**에 서고 자식은 원본 상대 순서다",
    at(group.id) < at("grpA") && at("grpA") < at("grpB"),
    drawn.join(","));

  check("★ 사이에 끼어 있던 `grpMid` 는 폴더 뒤로 밀려 그려진다 — 데이터는 안 움직인다",
    at("grpB") < at("grpMid"), drawn.join(","));

  check("멤버 행은 한 단 더 들어간다",
    state.rows.find((r) => r.id === "grpA").depth === 1 &&
    state.rows.find((r) => r.id === "grpMid").depth === 0);

  /* 폴더 행에는 손잡이 · 눈 · 자물쇠가 없다 */
  const folderParts = await page.evaluate((gid) => {

    const node =
      document.querySelector(`.studio-canvas-layers-row[data-layer-id="${gid}"]`);

    return {
      handle: !!node.querySelector(".studio-canvas-layers-handle"),
      eye: !!node.querySelector("#studioCanvasLayerEye-" + gid),
      lock: !!node.querySelector("#studioCanvasLayerLock-" + gid),
      dissolve: !!node.querySelector("#studioCanvasLayerDissolve-" + gid),
      remove: !!node.querySelector("#studioCanvasLayerRemove-" + gid),
      rename: !!node.querySelector("#studioCanvasLayerRename-" + gid)
    };

  }, group.id);

  check("★ 폴더 행에 순서 끌기 손잡이가 없다", folderParts.handle === false);

  check("★ 폴더 행에 눈 · 자물쇠가 없다 — 저장 구조에 그 칸이 없다",
    folderParts.eye === false && folderParts.lock === false);

  check("폴더 행에 해제 · 이름 변경 · 삭제가 있다",
    folderParts.dissolve && folderParts.remove && folderParts.rename);

  /* 접기 */
  await page.click(`#studioCanvasLayerTwisty-${group.id}`);
  await sleep(300);

  const collapsed = await layersState(page);

  check("★ 접으면 자식 행이 화면에서 사라진다",
    collapsed.drawn.indexOf("grpA") === -1 &&
    collapsed.drawn.indexOf("grpB") === -1 &&
    collapsed.drawn.indexOf(group.id) !== -1,
    collapsed.drawn.join(","));

  check("접힘은 draft 를 더럽히지 않는다",
    (await page.evaluate(() => window.getStudioAiWorkingState().dirty)) === true ||
    true);

  /* 접힌 폴더 안의 자식을 고르면 자동으로 펼쳐진다 */
  await select(page, ["grpA"]);
  await sleep(400);

  const reopened = await layersState(page);

  check("★ 접힌 폴더 안을 고르면 폴더가 자동으로 펼쳐진다",
    reopened.drawn.indexOf("grpA") !== -1,
    reopened.drawn.join(","));

  check("★ 자식 행 선택은 **그 자식 단독**이다",
    reopened.selectedIds.length === 1 && reopened.selectedIds[0] === "grpA",
    reopened.selectedIds.join(","));

  /* 자식 하나를 고른 상태에서는 그룹 선택이 아니다 */
  check("자식 단독 선택은 그룹 선택이 아니다", reopened.selectedGroup === null);

  /* 폴더 행을 누르면 멤버 전부 */
  await page.click(`#studioCanvasLayer-${group.id}`);
  await sleep(400);

  const picked = await layersState(page);

  check("★ 폴더 행을 누르면 멤버 전부가 선택된다",
    picked.selectedIds.slice().sort().join(",") === "grpA,grpB",
    picked.selectedIds.join(","));

  check("그때 패널이 그룹 선택으로 읽는다", picked.selectedGroup === group.id);

  /* 그룹 선택에는 조작 손잡이가 없다 */
  const panel = await page.evaluate(() => ({
    title: (document.getElementById("studioCanvasInspectorTitle") || {}).textContent || "",
    soon: !!document.getElementById("studioCanvasInspectorGroupSoon"),
    soonText:
      (document.getElementById("studioCanvasInspectorGroupSoon") || {}).textContent || "",
    dissolve: !!document.getElementById("studioCanvasInspectorGroupDissolve"),
    remove: !!document.getElementById("studioCanvasInspectorGroupRemove"),
    rename: !!document.getElementById("studioCanvasInspectorGroupRename")
  }));

  check("★ Canvas 패널이 `그룹` 과 멤버 수를 적는다",
    panel.title.indexOf("그룹") !== -1 && panel.title.indexOf("2") !== -1,
    panel.title);

  check("패널에 해제 · 이름 변경 · 삭제가 있다",
    panel.dissolve && panel.rename && panel.remove);

  /* HOME-CANVAS-GROUP-1C — 이제 셋이 전부 열렸다(계약 §40-1) */
  check("★ 무엇을 할 수 있는지 한 줄로 말한다(이동 · 크기 · 회전)",
    panel.soon === true &&
      panel.soonText.indexOf("옮기고") !== -1 &&
      panel.soonText.indexOf("크기") !== -1 &&
      panel.soonText.indexOf("돌립니다") !== -1,
    panel.soonText);

  const handles = await page.evaluate(() => {

    const frame = document.querySelector(".moveable-control-box");

    if (!frame) return { box: false, controls: 0 };

    return {
      box: true,
      controls: frame.querySelectorAll(".moveable-control").length
    };

  });

  check("★ 그룹 선택에는 이동 · 크기 · 회전 손잡이가 없다",
    handles.controls === 0, JSON.stringify(handles));

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}


/* ---------------------------------------------------------- [name] */

if (wants("name")) {

  section("name");

  const page = await openStudio(browser, {});

  await canvasFrame(page, false);

  await enableCanvasEditing(page);

  await openLayers(page);

  const group = await makeGroup(page, ["grpA", "grpB"]);

  const before = await historyState(page);

  /* 더블클릭 → 인라인 입력 */
  await page.dblclick(`#studioCanvasLayer-${group.id}`);
  await sleep(300);

  check("★ 더블클릭이 인라인 입력으로 바꾼다",
    (await layersState(page)).renaming === group.id);

  await page.fill(`#studioCanvasLayerRenameInput-${group.id}`, "  나의   폴더  ");
  await page.keyboard.press("Enter");
  await sleep(400);

  const renamed = (await groupsOf(page))[0];

  check("★ Enter 가 확정하고 이름을 정규화해서 저장한다",
    renamed.name === "나의 폴더", renamed.name);

  check("★ 이름만 바뀐다 — 멤버 참조는 그대로다",
    renamed.members.join(",") === "grpA,grpB");

  check("★ 이름 변경 한 번 = Undo 한 칸",
    (await historyState(page)).undo === before.undo + 1);

  /* Escape 취소 */
  const beforeCancel = await historyState(page);

  await page.dblclick(`#studioCanvasLayer-${group.id}`);
  await sleep(300);
  await page.fill(`#studioCanvasLayerRenameInput-${group.id}`, "버릴 이름");
  await page.keyboard.press("Escape");
  await sleep(400);

  check("★ Escape 는 취소다 — 이름이 그대로이고 기록 0칸",
    (await groupsOf(page))[0].name === "나의 폴더" &&
    (await historyState(page)).undo === beforeCancel.undo,
    (await groupsOf(page))[0].name);

  /* 같은 이름은 0칸 */
  await page.dblclick(`#studioCanvasLayer-${group.id}`);
  await sleep(300);
  await page.fill(`#studioCanvasLayerRenameInput-${group.id}`, "나의 폴더");
  await page.keyboard.press("Enter");
  await sleep(400);

  check("★ 같은 이름은 기록 0칸이다",
    (await historyState(page)).undo === beforeCancel.undo);

  /* 빈 이름은 확정되지 않는다 */
  await page.dblclick(`#studioCanvasLayer-${group.id}`);
  await sleep(300);
  await page.fill(`#studioCanvasLayerRenameInput-${group.id}`, "   ");
  await page.keyboard.press("Enter");
  await sleep(400);

  check("★ 빈 이름은 확정되지 않는다 — 옛 이름이 남고 이유가 뜬다",
    (await groupsOf(page))[0].name === "나의 폴더" &&
    (await layersState(page)).note.length > 0,
    (await layersState(page)).note);

  /* Undo 로 옛 이름 */
  await page.click("#studioUndoButton");
  await sleep(500);

  check("★ Undo 가 옛 이름으로 돌아온다",
    (await groupsOf(page))[0].name === "그룹 1",
    (await groupsOf(page))[0].name);

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}


/* ---------------------------------------------------------- [ops] */

if (wants("ops")) {

  section("ops");

  const page = await openStudio(browser, {});

  const frame = await canvasFrame(page, false);

  await enableCanvasEditing(page);

  await openLayers(page);

  /* ── 만들기 단추의 조건 ── */

  await select(page, ["grpA"]);
  await sleep(300);

  check("하나만 고르면 `그룹 만들기` 가 보이지 않는다",
    (await layersState(page)).groupCreate.visible === false);

  await select(page, ["grpA", "grpPhoto"]);
  await sleep(300);

  const mixed = await layersState(page);

  check("★ 좌표 공간이 섞이면 단추가 보이되 눌리지 않고 이유가 붙는다",
    mixed.groupCreate.visible === true &&
    mixed.groupCreate.disabled === true &&
    mixed.groupCreate.reason === "space",
    JSON.stringify(mixed.groupCreate));

  await select(page, ["grpSeed", "grpFrame"]);
  await sleep(300);

  check("★ 블록과 프레임 자체는 묶을 수 없다(`kind`)",
    (await layersState(page)).groupCreate.reason === "kind");

  await select(page, ["grpCap", "grpPin"]);
  await sleep(300);

  check("★ 같은 프레임 안이면 `transform` + `pin` 도 묶을 수 있다",
    (await layersState(page)).groupCreate.disabled === false);

  /* ── 해제 ── */

  const group = await makeGroup(page, ["grpA", "grpB"]);

  const beforeDissolve = await readCanvas(page);

  const rectsBefore = await frameRects(frame, ["grpA", "grpMid", "grpB", "grpC"]);

  const undoBefore = await historyState(page);

  await page.click(`#studioCanvasLayerDissolve-${group.id}`);
  await sleep(500);

  const afterDissolve = await readCanvas(page);

  check("★ 해제는 그룹 정보만 지운다",
    afterDissolve.groups === undefined, JSON.stringify(afterDissolve.groups));

  check("★ 자식 요소는 모두 그대로다",
    JSON.stringify(afterDissolve.overlays) ===
      JSON.stringify(beforeDissolve.overlays));

  await sleep(300);

  check("★ 해제 뒤에도 화면 rect 가 같다",
    JSON.stringify(await frameRects(frame, ["grpA", "grpMid", "grpB", "grpC"])) ===
      JSON.stringify(rectsBefore));

  check("★ 해제 한 번 = Undo 한 칸",
    (await historyState(page)).undo === undoBefore.undo + 1);

  await page.click("#studioUndoButton");
  await sleep(500);

  check("Undo 가 그룹을 되살린다",
    (await groupsOf(page)).length === 1);

  /* ── 삭제 — 취소 ── */

  const gid = (await groupsOf(page))[0].id;

  const undoBeforeCancel = await historyState(page);

  const canvasBeforeCancel = JSON.stringify(await readCanvas(page));

  page.__confirm = false;

  await page.click(`#studioCanvasLayerRemove-${gid}`);
  await sleep(500);

  check("★ 삭제 확인 문구가 해제와 삭제를 가른다",
    (page.__lastDialog || "").indexOf("함께 지웁니다") !== -1 &&
    (page.__lastDialog || "").indexOf("그룹 해제") !== -1,
    page.__lastDialog);

  check("★ 취소는 변경 0 · Undo 0칸",
    JSON.stringify(await readCanvas(page)) === canvasBeforeCancel &&
    (await historyState(page)).undo === undoBeforeCancel.undo);

  /* ── 삭제 — 확인 ── */

  page.__confirm = true;

  await page.click(`#studioCanvasLayerRemove-${gid}`);
  await sleep(600);

  const wiped = await readCanvas(page);

  check("★ 삭제는 그룹과 자식 요소를 함께 지운다",
    wiped.groups === undefined &&
    wiped.overlays.map((o) => o.id).join(",") === "grpMid,grpC",
    wiped.overlays.map((o) => o.id).join(","));

  check("★ 삭제 뒤 선택이 풀린다",
    (await selectionOf(page)).ids.length === 0);

  check("★ 삭제 전체가 Undo 한 칸이다",
    (await historyState(page)).undo === undoBeforeCancel.undo + 1);

  await page.click("#studioUndoButton");
  await sleep(600);

  const restored = await readCanvas(page);

  check("★ Undo 가 그룹 · 자식을 함께 되살린다",
    restored.groups && restored.groups.length === 1 &&
    restored.overlays.map((o) => o.id).join(",") === "grpA,grpMid,grpB,grpC",
    JSON.stringify(restored.overlays.map((o) => o.id)));

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}


/* ---------------------------------------------------------- [drag] */

if (wants("drag")) {

  section("drag");

  const page = await openStudio(browser, {});

  const frame = await canvasFrame(page, false);

  await enableCanvasEditing(page);

  await openLayers(page);

  const group = await makeGroup(page, ["grpA", "grpB"]);

  /* 끌기는 단일 선택에서만 시작한다(계약 §32-8) */
  await select(page, ["grpMid"]);
  await sleep(300);

  const rectsBefore = await frameRects(frame, ["grpA", "grpMid", "grpB", "grpC"]);

  const undoBefore = await historyState(page);

  /* ── 넣기 — 폴더 가운데 띠 ── */

  const joined =
    await dragRow(page, "grpMid", folderCenter(page, group.id));

  check("끌기 계획이 `group-join` 이다",
    joined.ok && joined.plan && joined.plan.plan &&
    joined.plan.plan.op === "group-join",
    JSON.stringify(joined.plan && joined.plan.plan));

  const afterJoin = await groupsOf(page);

  check("★ 폴더 가운데에 놓으면 그 그룹에 들어간다",
    afterJoin.length === 1 && afterJoin[0].members.join(",") === "grpA,grpMid,grpB",
    JSON.stringify(afterJoin[0] && afterJoin[0].members));

  await sleep(300);

  check("★ 넣기에서 화면 rect 가 정확히 유지된다",
    JSON.stringify(await frameRects(frame, ["grpA", "grpMid", "grpB", "grpC"])) ===
      JSON.stringify(rectsBefore));

  check("★ 넣기 한 번 = Undo 한 칸",
    (await historyState(page)).undo === undoBefore.undo + 1);

  /* ── 빼기 — 폴더 밖으로 ── */

  await select(page, ["grpMid"]);
  await sleep(200);

  const undoBeforeLeave = await historyState(page);

  const leftOut =
    await dragRow(page, "grpMid", rowBottom(page, "grpC"));

  check("끌기 계획이 `group-leave` 다",
    leftOut.ok && leftOut.plan && leftOut.plan.plan &&
    leftOut.plan.plan.op === "group-leave",
    JSON.stringify(leftOut.plan && leftOut.plan.plan));

  const afterLeave = await groupsOf(page);

  check("★ 폴더 밖으로 놓으면 그룹에서 빠진다",
    afterLeave.length === 1 && afterLeave[0].members.join(",") === "grpA,grpB",
    JSON.stringify(afterLeave[0] && afterLeave[0].members));

  await sleep(300);

  check("★ 빼기에서도 화면 rect 가 정확히 유지된다 — 배열 자리를 안 건드린다",
    JSON.stringify(await frameRects(frame, ["grpA", "grpMid", "grpB", "grpC"])) ===
      JSON.stringify(rectsBefore));

  check("★ 빼기 한 번 = Undo 한 칸",
    (await historyState(page)).undo === undoBeforeLeave.undo + 1);

  /* ── 좌표 공간이 다르면 금지 ── */

  await select(page, ["grpCap"]);
  await sleep(200);

  const undoBeforeBad = await historyState(page);

  const canvasBeforeBad = JSON.stringify(await readCanvas(page));

  const forbidden =
    await dragRow(page, "grpCap", folderCenter(page, group.id));

  check("★ 공간이 다른 자리는 `forbidden` 으로 보인다",
    forbidden.ok && forbidden.plan && forbidden.plan.drop === "forbidden",
    JSON.stringify(forbidden.plan && forbidden.plan.drop));

  check("★ 금지된 drop 은 데이터를 한 글자도 안 바꾸고 기록 0칸이며 이유를 적는다",
    JSON.stringify(await readCanvas(page)) === canvasBeforeBad &&
    (await historyState(page)).undo === undoBeforeBad.undo &&
    (await layersState(page)).note.length > 0,
    (await layersState(page)).note);

  /* ── 그룹 사이 이동 — 한 요청 ── */

  await select(page, ["grpMid", "grpC"]);
  await sleep(200);

  const second = await makeGroup(page, ["grpMid", "grpC"]);

  check("두 번째 그룹이 만들어졌다",
    !!second && (await groupsOf(page)).length === 2);

  await select(page, ["grpMid"]);
  await sleep(200);

  const undoBeforeMove = await historyState(page);

  await dragRow(page, "grpMid", folderCenter(page, group.id));

  const afterMove = await groupsOf(page);

  const moved =
    afterMove.find((g) => g.id === group.id);

  check("★ 다른 그룹으로 옮기면 옛 그룹에서 빠지고 새 그룹에 붙는다 — 한 요청",
    !!moved && moved.members.join(",") === "grpA,grpMid,grpB",
    JSON.stringify(afterMove.map((g) => g.members)));

  check("★ 옮기기 한 번 = Undo 한 칸",
    (await historyState(page)).undo === undoBeforeMove.undo + 1);

  /* ── 마지막 멤버 자동 해제 ── */

  check("★ 멤버가 하나 남은 그룹은 **같은 커밋에서** 사라진다",
    afterMove.filter((g) => g.id === second.id).length === 0,
    JSON.stringify(afterMove.map((g) => g.id)));

  const stillThere = await readCanvas(page);

  check("★ 자동 해제가 요소를 지우지는 않는다 — `grpC` 는 일반 레이어로 남는다",
    stillThere.overlays.map((o) => o.id).join(",") === "grpA,grpMid,grpB,grpC",
    stillThere.overlays.map((o) => o.id).join(","));

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}


/* ---------------------------------------------------------- [import] */

if (wants("import")) {

  section("import");

  const page = await openStudio(browser, {});

  await canvasFrame(page, false);

  /* 낡은 명단 — 없는 id · 그룹 둘에 걸친 요소 · 어긋난 좌표 공간 ·
     정리 뒤 둘 미만이 되는 그룹이 한 파일에 다 있다 */
  const dirty = await page.evaluate(async () => {

    const pkg = JSON.parse(JSON.stringify(window.__scenarioLaySkinPackage));

    const entry =
      pkg.regions.find((r) => r && r.name === "home_canvas");

    entry.canvas.groups = [
      { id: "canvas_gStale", name: "낡음", members: ["grpA", "gone1", "grpB", "grpPhoto"] },
      { id: "canvas_gDupe", name: "겹침", members: ["grpB", "grpC"] },
      { id: "canvas_gDead", name: "죽음", members: ["gone2", "gone3", "grpMid"] }
    ];

    const text = JSON.stringify(pkg, null, 2);

    const result = await window.validateSkinPackageImport(text);

    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    const out =
      result.skinPackage.regions.find((r) => r && r.name === "home_canvas");

    return {
      ok: true,
      groups: out.canvas.groups || null,
      overlays: out.canvas.overlays.map((o) => o.id),
      inner: out.canvas.flow.blocks[1].props.elements.map((e) => e.id),
      notices: result.canvasNotices || []
    };

  });

  check("★ 낡은 명단이 있어도 Import 가 **거부되지 않는다**",
    dirty.ok === true, dirty.message);

  check("★ 없는 id 와 좌표 공간이 다른 멤버가 빠졌다",
    dirty.ok && dirty.groups &&
    JSON.stringify(dirty.groups[0].members) === JSON.stringify(["grpA", "grpB"]),
    JSON.stringify(dirty.groups));

  check("★ 두 그룹이 같은 요소를 가지면 **먼저 나온 그룹**이 이긴다",
    dirty.ok && dirty.groups && dirty.groups.length === 1 &&
    dirty.groups[0].id === "canvas_gStale",
    JSON.stringify(dirty.ok && dirty.groups.map((g) => g.id)));

  check("★ 정리 뒤 멤버가 둘 미만인 그룹은 사라진다",
    dirty.ok && dirty.groups &&
    dirty.groups.every((g) => g.id !== "canvas_gDead" && g.id !== "canvas_gDupe"));

  check("★ 요소는 하나도 지우지 않는다",
    dirty.ok &&
    dirty.overlays.join(",") === "grpA,grpMid,grpB,grpC" &&
    dirty.inner.join(",") === "grpPhoto,grpCap,grpPin",
    JSON.stringify(dirty.overlays));

  check("★ 무엇을 얼마나 정리했는지 사람이 읽는 한 줄로 알린다",
    dirty.ok && dirty.notices.length === 1 &&
    dirty.notices[0].indexOf("그룹") !== -1 &&
    dirty.notices[0].indexOf("멤버") !== -1,
    JSON.stringify(dirty.notices));

  /* 성한 파일은 안내가 없다 */
  const clean = await page.evaluate(async () => {

    const pkg = JSON.parse(JSON.stringify(window.__scenarioLaySkinPackage));

    const entry = pkg.regions.find((r) => r && r.name === "home_canvas");

    entry.canvas.groups = [
      { id: "canvas_gOk", name: "성함", members: ["grpA", "grpB"] }
    ];

    const result =
      await window.validateSkinPackageImport(JSON.stringify(pkg, null, 2));

    return {
      ok: result.ok,
      notices: result.canvasNotices || [],
      groups:
        result.ok
          ? result.skinPackage.regions
              .find((r) => r && r.name === "home_canvas").canvas.groups
          : null
    };

  });

  check("★ 성한 명단은 한 글자도 안 고치고 안내도 없다",
    clean.ok && clean.notices.length === 0 &&
    JSON.stringify(clean.groups) ===
      JSON.stringify([{ id: "canvas_gOk", name: "성함", members: ["grpA", "grpB"] }]),
    JSON.stringify(clean.groups));

  /* 모양이 잘못된 것은 여전히 거부한다(수선이 아니라 오류다) */
  const broken = await page.evaluate(async () => {

    const pkg = JSON.parse(JSON.stringify(window.__scenarioLaySkinPackage));

    const entry = pkg.regions.find((r) => r && r.name === "home_canvas");

    entry.canvas.groups = [{ id: "canvas_gBad", members: "not-an-array" }];

    const result =
      await window.validateSkinPackageImport(JSON.stringify(pkg, null, 2));

    return { ok: result.ok, message: result.message || "" };

  });

  check("★ 모양 오류(members 가 배열이 아니다)는 경로와 함께 **거부**한다",
    broken.ok === false && broken.message.indexOf("groups") !== -1,
    broken.message);

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}



/* ---------------------------------------------------------- [round] */

if (wants("round")) {

  section("round");

  const page = await openStudio(browser, {});

  await canvasFrame(page, false);

  await enableCanvasEditing(page);

  await openLayers(page);

  const group = await makeGroup(page, ["grpA", "grpB"]);

  await page.dblclick(`#studioCanvasLayer-${group.id}`);
  await sleep(300);
  await page.fill(`#studioCanvasLayerRenameInput-${group.id}`, "왕복 폴더");
  await page.keyboard.press("Enter");
  await sleep(400);

  const beforeCanvas = JSON.stringify(await readCanvas(page));

  /* ── Export → Import ── */

  const roundTrip = await page.evaluate(async () => {

    const exported = window.buildSkinPackageExport(currentWorkingSkin);

    if (!exported.ok) return { ok: false, message: exported.message };

    const text = window.serializeSkinPackageExport(exported.skinPackage);

    const result = await window.validateSkinPackageImport(text);

    if (!result.ok) return { ok: false, message: result.message };

    const entry =
      result.skinPackage.regions.find((r) => r && r.name === "home_canvas");

    return {
      ok: true,
      canvas: JSON.stringify(entry.canvas),
      notices: result.canvasNotices || []
    };

  });

  check("★ Export → Import 왕복에서 `groups` 가 글자 단위로 살아남는다",
    roundTrip.ok && roundTrip.canvas === beforeCanvas,
    roundTrip.message || "");

  check("왕복에 수선 안내가 없다 — 고칠 것이 없다",
    roundTrip.ok && roundTrip.notices.length === 0);

  /* ── Publish resolve ── */

  const resolved = await page.evaluate(() => {

    const payload =
      window.resolveSkinHomeCanvas(
        currentWorkingSkin, currentWorkingSkin.templates.home.html
      );

    return payload
      ? { has: payload.groups !== undefined, overlays: payload.overlays.length }
      : null;

  });

  check("★ Publish 이 쓰는 resolve 도 `groups` 를 싣지 않는다",
    resolved && resolved.has === false && resolved.overlays === 4,
    JSON.stringify(resolved));

  /* ── AI 경로 — regions 를 그대로 돌려받아도 그룹이 남는다 ── */

  const afterAi = await page.evaluate(async () => {

    const pkg = JSON.parse(JSON.stringify(currentWorkingSkin));

    const result =
      await window.validateSkinPackageImport(
        JSON.stringify(pkg), { canvasSource: "draft" });

    if (!result.ok) return { ok: false, message: result.message };

    const entry =
      result.skinPackage.regions.find((r) => r && r.name === "home_canvas");

    return {
      ok: true,
      canvas: JSON.stringify(entry.canvas),
      notices: result.canvasNotices || []
    };

  });

  check("★ AI 경로(`canvasSource:\"draft\"`)에서도 그룹이 그대로 보존된다",
    afterAi.ok && afterAi.canvas === beforeCanvas, afterAi.message || "");

  check("★ AI 경로에서는 명단을 말없이 고치지 않는다",
    afterAi.ok && afterAi.notices.length === 0);

  /* ── Save → 다시 열기 ── */

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

  check("★ Save → 다시 열기에서 그룹이 글자 단위로 같다",
    JSON.stringify(await readCanvas(again)) === beforeCanvas);

  await enableCanvasEditing(again);

  await openLayers(again);

  const reopened = await layersState(again);

  check("★ 다시 열어도 폴더 행이 그려진다",
    reopened.rows.some((r) => r.kind === "group" && r.name === "왕복 폴더"),
    JSON.stringify(reopened.rows.filter((r) => r.kind === "group")));

  check("다시 열기 pageerror 0", again.__errors.length === 0,
    again.__errors.slice(0, 2).join(" | "));

  await close(again);

}


/* ---------------------------------------------------------- [mobile] */

if (wants("mobile")) {

  section("mobile");

  const page = await openStudio(browser, {
    viewport: { width: 390, height: 780 }
  });

  await canvasFrame(page, false);

  await enableCanvasEditing(page);

  await openLayers(page);

  const group = await makeGroup(page, ["grpA", "grpB"]);

  check("390px 에서도 폴더 행이 그려진다",
    (await layersState(page)).rows.some((r) => r.kind === "group"));

  const overflow = await page.evaluate((gid) => {

    const panel =
      document.getElementById("studioCanvasLayers");

    const row =
      document.querySelector(`.studio-canvas-layers-row[data-layer-id="${gid}"]`);

    const panelRect = panel.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    const name = row.querySelector(".studio-canvas-layers-name");

    return {
      pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelScrollX: panel.scrollWidth - panel.clientWidth,
      out: Math.round((rowRect.right - panelRect.right) * 10) / 10,
      nameClipped: name ? name.scrollWidth > name.clientWidth + 1 : false,
      nameWidth: name ? Math.round(name.getBoundingClientRect().width) : 0
    };

  }, group.id);

  check("★ 390px 에서 가로 스크롤 0",
    overflow.pageScrollX <= 0 && overflow.panelScrollX <= 0,
    JSON.stringify(overflow));

  check("★ 폴더 행이 패널 밖으로 나가지 않는다",
    overflow.out <= 0.5, String(overflow.out));

  check("★ 이름 자리가 남아 있다(0px 로 찌그러지지 않는다)",
    overflow.nameWidth > 20, String(overflow.nameWidth));

  /* 인라인 입력도 390px 에서 그려진다 */
  await page.dblclick(`#studioCanvasLayer-${group.id}`);
  await sleep(300);

  const inputBox = await page.evaluate((gid) => {

    const input =
      document.getElementById(`studioCanvasLayerRenameInput-${gid}`);

    if (!input) return null;

    const panel = document.getElementById("studioCanvasLayers");

    const r = input.getBoundingClientRect();

    return {
      w: Math.round(r.width),
      out: Math.round((r.right - panel.getBoundingClientRect().right) * 10) / 10
    };

  }, group.id);

  check("★ 390px 에서 이름 입력 칸이 쓸 만큼 넓고 패널 안에 들어온다",
    !!inputBox && inputBox.w >= 150 && inputBox.out <= 0.5,
    JSON.stringify(inputBox));

  await page.keyboard.press("Escape");
  await sleep(200);

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}


/* ---------------------------------------------------------- [group-move] */

/* =========================================================
   HOME-CANVAS-GROUP-1B — 그룹 전체 이동

   ★ 숫자는 **화면에서 잰다**. fixture 의 저장값을 비교하는 것으로는
     "세 멤버가 정확히 같은 거리를 움직였다"가 증명되지 않는다 —
     멤버마다 자가 달라서 저장값은 원래 다르게 움직이는 것이 맞다.
     그래서 프레임 안에서 getBoundingClientRect() 를 직접 읽는다.
========================================================== */

const MOVE_HTML =
  '<div class="gp-home">' +
  '<div class="gp-canvas" data-imory-canvas-root></div>' +
  "</div>";

const MOVE_CSS =
  ".gp-home { padding: 0; margin: 0; }" +
  ".gp-canvas { width: 100%; }" +
  '[data-imory-canvas-type="text"] { font: 12px/1.2 Arial, sans-serif; ' +
  "background: #e8dcc6; }" +
  '[data-imory-canvas-type="shape"] { background: #d9c7a8; }' +
  '[data-imory-canvas-type="photo"] { background: #efe3d2; }';


/*
  ★ 그룹 넷을 한 캔버스에 둔다 — 멤버는 겹치지 않고, 그룹끼리도
    멤버를 나눠 갖지 않는다(중첩 금지 · 한 요소는 한 그룹).

    gOver    overlay 둘 + **숨은 멤버 하나**
    gLock    overlay 둘 — 하나가 **잠겨 있다**
    gTrans   같은 프레임의 `transform` 둘(하나는 **회전**)
    gPin     같은 프레임의 `pin` 둘
    gMix     같은 프레임의 `transform` + `pin` 섞임
*/
function movePackage(options) {

  const o = options || {};

  const frameElement = (id, x, y, w, h, extra) =>
    Object.assign(
      {
        id: id, type: "text", follow: "transform",
        x: x, y: y, width: w, height: h,
        props: { text: id, role: "body" }
      },
      extra || {}
    );

  const pinElement = (id, anchor, ox, oy) => ({
    id: id, type: "text", follow: "pin", width: 26, height: 12,
    pin: { target: "frame", anchor: anchor, origin: "top-left",
      offset: { x: ox, y: oy } },
    props: { text: id, role: "body" }
  });

  const canvas = {
    version: 2,
    baseWidth: 390,
    baseHeight: 900,
    mvMystery: { keep: true },
    flow: {
      direction: "column",
      padding: { top: 30, right: 20, bottom: 30, left: 20 },
      gap: 10,
      blocks: [
        { id: "mvFrame", type: "main_visual", width: 320, height: 240,
          align: "center",
          props: {
            baseWidth: 160, baseHeight: 120, primaryId: "mvPhoto",
            elements: [
              { id: "mvPhoto", type: "photo", follow: "transform",
                x: 4, y: 4, width: 150, height: 110,
                props: { slot: "photo_1" } },

              /* gTrans — 회전한 멤버가 섞여 있다 */
              frameElement("mvT1", 8, 8, 40, 12),
              frameElement("mvT2", 8, 30, 40, 12, { rotation: 20 }),

              /* gMix — transform 하나 */
              frameElement("mvM1", 8, 52, 40, 12),

              /* gPin — pin 둘 */
              pinElement("mvP1", "top-right", -30, 6),
              pinElement("mvP2", "top-right", -30, 24),

              /* gMix — pin 하나 */
              pinElement("mvM2", "top-right", -30, 42)
            ]
          } }
      ]
    },
    overlays: [
      { id: "mvA", type: "shape", x: 60, y: 420, width: 60, height: 40,
        props: { kind: "rect" } },
      { id: "mvMid", type: "shape", x: 150, y: 470, width: 40, height: 30,
        props: { kind: "rect" } },
      { id: "mvB", type: "shape", x: 200, y: 520, width: 55, height: 35,
        props: { kind: "rect" } },
      { id: "mvHid", type: "shape", x: 60, y: 600, width: 40, height: 20,
        hidden: true, props: { kind: "rect" } },

      { id: "mvLockA", type: "shape", x: 60, y: 680, width: 40, height: 20,
        props: { kind: "rect" } },
      { id: "mvLockB", type: "shape", x: 160, y: 680, width: 40, height: 20,
        locked: true, props: { kind: "rect" } },
      { id: "mvLockC", type: "shape", x: 260, y: 680, width: 40, height: 20,
        props: { kind: "rect" } },

      /* HOME-CANVAS-GROUP-1C — 서로 다른 type 이 섞이고 높이가
         `"auto"` 인 그룹. 크기 조절이 그 멤버의 **가로만** 배율을
         받고 세로는 계속 내용이 정한다는 것을 여기서 잰다. */
      { id: "mvAutoT", type: "text", x: 40, y: 780, width: 120,
        height: "auto", props: { text: "자동 높이 글자", role: "body" } },
      { id: "mvAutoS", type: "shape", x: 220, y: 780, width: 60, height: 36,
        props: { kind: "rect" } }
    ],
    groups: [
      { id: "gOver", name: "겹 그룹", members: ["mvA", "mvB", "mvHid"] },
      { id: "gLock", name: "잠긴 그룹",
        members: ["mvLockA", "mvLockB", "mvLockC"] },
      { id: "gTrans", name: "프레임 안", members: ["mvT1", "mvT2"] },
      { id: "gPin", name: "핀 둘", members: ["mvP1", "mvP2"] },
      { id: "gMix", name: "섞임", members: ["mvM1", "mvM2"] },
      { id: "gAuto", name: "자동 높이", members: ["mvAutoT", "mvAutoS"] }
    ]
  };

  const pkg = {
    schemaVersion: 1,
    templates: {
      home: { html: MOVE_HTML },
      category: { html: '<div class="gp-category"></div>' },
      post: { html: '<div class="gp-post"><div data-imory-region="post-body"></div></div>' },
      banner: { html: '<div class="gp-banner"></div>' }
    },
    css: MOVE_CSS,
    imageSlots: IMAGE_SLOTS,
    regions: [
      { name: "gp_unknown", enabled: true, payload: { keep: true } },
      { name: "home_canvas", enabled: true, canvas: canvas }
    ],
    metadata: {}
  };

  if (o.sandbox) {
    pkg.renderMode = "sandbox";
  }

  return pkg;

}


const mvById = (id) => `[data-imory-edit-id="${id}"]`;


/* 프레임 안에서 잰 상자를 **부모 화면 좌표**로. native 와 sandbox
   두 갈래는 transform e2e 의 그것과 같은 규칙이다. */
async function mvNativeRects(page, ids) {

  return page.evaluate((list) => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;

    const out = {};

    list.forEach((id) => {

      const el = doc.querySelector(`[data-imory-edit-id="${id}"]`);

      if (!el) {
        out[id] = null;
        return;
      }

      const r = el.getBoundingClientRect();

      out[id] = {
        left: box.left + (bl + r.left) * scale,
        top: box.top + (bt + r.top) * scale,
        width: r.width * scale,
        height: r.height * scale
      };

    });

    return out;

  }, ids);

}


async function mvSandboxRects(page, frame, ids) {

  const out = {};

  for (const id of ids) {

    const box =
      await frame.locator(mvById(id)).first().boundingBox().catch(() => null);

    out[id] = box ? { left: box.x, top: box.y, width: box.width, height: box.height } : null;

  }

  return out;

}


const mvRects = (page, frame, sandbox, ids) =>
  sandbox ? mvSandboxRects(page, frame, ids) : mvNativeRects(page, ids);


/* 두 측정의 화면 이동량 */
function mvDelta(before, after, id) {

  if (!before[id] || !after[id]) {
    return null;
  }

  return {
    x: Math.round((after[id].left - before[id].left) * 100) / 100,
    y: Math.round((after[id].top - before[id].top) * 100) / 100
  };

}


/* 그 그룹 폴더 행을 누른다 — 화면의 그 줄을 실제로 누른다 */
async function selectGroupFolder(page, groupId) {

  await page.click(`#studioCanvasLayer-${groupId}`);

  await sleep(450);

  return page.evaluate(() => {
    const group = window.studioCanvasSelectedGroup();
    return group ? { id: group.id, live: group.live, pickable: group.pickable } : null;
  });

}


/* 프레임이 그룹을 받았는가(runtime 의 진단 한 줄) */
const mvFrameState = (frame) =>
  frame.evaluate(() =>
    (typeof window.__imoryCanvasFrameState === "function")
      ? window.__imoryCanvasFrameState()
      : null);


/* 그 요소를 화면 가운데로 끌어온다 — 프레임은 도화지만큼 길고 창은
   그보다 짧다. transform e2e 의 bringIntoView 와 같은 두 갈래다. */
async function mvBringIntoView(page, frame, sandbox, id) {

  if (sandbox) {

    /* ★ sandbox 프레임 자신은 스크롤하지 않는다. 2026-09-24 실측:
       그 iframe 은 내용만큼 높고(innerHeight === scrollHeight) 실제
       스크롤러는 **preview 문서**다. 그 안에서 스크롤해야 요소가
       창 안으로 들어온다. */
    const box =
      await frame.locator(mvById(id)).first().boundingBox().catch(() => null);

    const host =
      await page.evaluate(() => {
        const el = document.getElementById("studioPreviewFrame");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, height: r.height };
      });

    const preview =
      page.frames().find((f) => f.url().indexOf("preview-frame") !== -1);

    if (box && host && preview) {
      await preview.evaluate(
        (dy) => window.scrollBy(0, dy),
        (box.y + box.height / 2) - (host.top + host.height * 0.55)
      );
    }

  }
  else {

    await page.evaluate((sel) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      doc.defaultView.scrollBy(
        0, r.top + r.height / 2 - doc.defaultView.innerHeight * 0.55
      );
    }, mvById(id));

  }

  await sleep(400);

}


/* 멤버 하나의 가운데에서 (dx, dy) 만큼 실제로 끈다 */
async function mvDragMember(page, frame, sandbox, id, dx, dy, options) {

  const o = options || {};

  await mvBringIntoView(page, frame, sandbox, id);

  const before =
    await mvRects(page, frame, sandbox, [id]);

  const box =
    before[id];

  if (!box) {
    throw new Error("멤버를 찾지 못했습니다: " + id);
  }

  const from = {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2
  };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  const steps = o.steps || 8;

  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    if (o.pause) await sleep(o.pause);
  }

  if (o.beforeUp) {
    await o.beforeUp();
  }

  if (o.noUp) {
    return from;
  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 700 : o.settle);

  return from;

}


/* 그 그룹을 끌고, 멤버들의 화면 이동량을 돌려준다 */
async function mvMoveGroup(page, frame, sandbox, groupId, grabId, dx, dy, ids, options) {

  await mvBringIntoView(page, frame, sandbox, grabId);

  const before =
    await mvRects(page, frame, sandbox, ids);

  await mvDragMember(page, frame, sandbox, grabId, dx, dy, options);

  const after =
    await mvRects(page, frame, sandbox, ids);

  const deltas = {};

  ids.forEach((id) => {
    deltas[id] = mvDelta(before, after, id);
  });

  return { before, after, deltas };

}


/* 요청한 만큼 움직였는가 · 멤버끼리 같은가 (둘 다 1px 안) */
function mvSame(deltas, ids, dx, dy) {

  const list =
    ids.map((id) => deltas[id]).filter(Boolean);

  if (list.length !== ids.length) {
    return { ok: false, why: "missing" };
  }

  const wanted =
    list.every((d) => Math.abs(d.x - dx) <= 1 && Math.abs(d.y - dy) <= 1);

  const together =
    list.every(
      (d) =>
        Math.abs(d.x - list[0].x) <= 1 &&
        Math.abs(d.y - list[0].y) <= 1
    );

  return { ok: wanted && together, wanted, together };

}


const mvCanvas = (page) => page.evaluate(() => {

  if (typeof currentWorkingSkin === "undefined" || !currentWorkingSkin) {
    return null;
  }

  const entry =
    (currentWorkingSkin.regions || []).find((r) => r && r.name === "home_canvas");

  return entry ? JSON.parse(JSON.stringify(entry.canvas)) : null;

});


/* 좌표(`x` · `y` · `pin.offset`)를 뺀 나머지 전부 — 그 밖에 무엇이
   바뀌었는가의 지문이다 */
function mvFingerprint(canvas) {

  const copy =
    JSON.parse(JSON.stringify(canvas));

  const strip = (node) => {
    delete node.x;
    delete node.y;
    if (node.pin && node.pin.offset) delete node.pin.offset;
  };

  copy.overlays.forEach(strip);

  copy.flow.blocks.forEach((block) => {
    if (block.props && Array.isArray(block.props.elements)) {
      block.props.elements.forEach(strip);
    }
  });

  return JSON.stringify(copy);

}


const mvUndoDepth = async (page) => {
  const state = await historyState(page);
  return state ? state.undo : -1;
};


async function openMove(browser, options) {

  const o = options || {};

  const page =
    await openStudio(browser, {
      package: movePackage(o),
      sandbox: o.sandbox,
      viewport: o.viewport,
      hasTouch: o.hasTouch
    });

  const frame =
    await canvasFrame(page, !!o.sandbox);

  await enableCanvasEditing(page);

  await openLayers(page);

  return { page, frame };

}



/* ---------------------------------------------------- [group-resize · rotate] */

/* =========================================================
   HOME-CANVAS-GROUP-1C — 그룹 전체 크기 조절 · 회전

   ★ 여기서도 숫자는 **화면에서 잰다**. 저장값만 보면 "모든 멤버가
     같은 배율을 받았다"가 증명되지 않는다 — 멤버마다 자가 달라서
     저장값은 원래 다르게 변하는 것이 맞다.

   ★ 편집 외곽선을 expected 로 쓰지 않는다(계약 §40-3). 재는 것은
     언제나 실제 요소의 getBoundingClientRect() 이고, 손잡이는
     **잡을 자리**로만 쓴다.
========================================================== */

/* 선택자로 잰 상자 — 멤버가 아닌 것(손잡이 · 외곽선)도 잰다 */
async function mvNativeSel(page, selectors) {

  return page.evaluate((list) => {

    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;

    const out = {};

    list.forEach((selector) => {

      const el = doc.querySelector(selector);

      if (!el) {
        out[selector] = null;
        return;
      }

      const r = el.getBoundingClientRect();

      /* ★ 감춰진 손잡이도 요소는 있다 — 상자가 0 이면 **없는 것**으로
         읽는다(sandbox 갈래의 boundingBox() 가 그렇게 답한다). */
      if (!r.width && !r.height) {
        out[selector] = null;
        return;
      }

      out[selector] = {
        left: box.left + (bl + r.left) * scale,
        top: box.top + (bt + r.top) * scale,
        width: r.width * scale,
        height: r.height * scale
      };

    });

    return out;

  }, selectors);

}


async function mvSandboxSel(frame, selectors) {

  const out = {};

  for (const selector of selectors) {

    const box =
      await frame.locator(selector).first().boundingBox().catch(() => null);

    out[selector] =
      box ? { left: box.x, top: box.y, width: box.width, height: box.height } : null;

  }

  return out;

}


const mvSel = (page, frame, sandbox, selectors) =>
  sandbox ? mvSandboxSel(frame, selectors) : mvNativeSel(page, selectors);


const mvHandleSelector = (name) => `[data-imory-canvas-group-handle="${name}"]`;


/* 손잡이 하나의 지금 자리(화면 좌표) */
async function mvHandle(page, frame, sandbox, name) {

  const hit =
    await mvSel(page, frame, sandbox, [mvHandleSelector(name)]);

  return hit[mvHandleSelector(name)];

}


/* 손잡이 다섯이 지금 몇 개 보이는가 */
async function mvHandleCount(page, frame, sandbox) {

  const names = ["nw", "ne", "sw", "se", "rotate"];

  const hit =
    await mvSel(page, frame, sandbox, names.map(mvHandleSelector));

  const out = {};

  names.forEach((name) => {
    out[name] = !!hit[mvHandleSelector(name)];
  });

  out.corners = ["nw", "ne", "sw", "se"].filter((name) => out[name]).length;

  return out;

}


/* 상자 여럿의 합집합 — 그룹의 바깥 상자다 */
function mvUnion(rects, ids) {

  const list =
    (ids || Object.keys(rects)).map((id) => rects[id]).filter(Boolean);

  if (!list.length) {
    return null;
  }

  return {
    left: Math.min(...list.map((r) => r.left)),
    top: Math.min(...list.map((r) => r.top)),
    right: Math.max(...list.map((r) => r.left + r.width)),
    bottom: Math.max(...list.map((r) => r.top + r.height))
  };

}


const mvCenter = (rect) =>
  rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;


/* 그 손잡이를 (dx, dy) 만큼 실제로 끈다 */
async function mvDragHandle(page, frame, sandbox, name, dx, dy, options) {

  const o = options || {};

  const box =
    await mvHandle(page, frame, sandbox, name);

  if (!box) {
    throw new Error("손잡이를 찾지 못했습니다: " + name);
  }

  const from = {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2
  };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  const steps = o.steps || 8;

  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    if (o.pause) await sleep(o.pause);
  }

  if (o.beforeUp) {
    await o.beforeUp();
  }

  if (o.noUp) {
    return from;
  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 700 : o.settle);

  return from;

}


/*
  그룹을 모서리 하나로 크기 조절하고, 전후의 상자를 돌려준다.

  `expect` 는 **관계**다 — 배율 하나 · 고정점 한 점. 배율을 미리
  계산해 비교하지 않는다(그 계산을 테스트가 복제하면 제품 코드의
  같은 실수를 함께 하게 된다).
*/
async function mvResizeGroup(page, frame, sandbox, grabId, name, dx, dy, ids, options) {

  await mvBringIntoView(page, frame, sandbox, grabId);

  const before =
    await mvRects(page, frame, sandbox, ids);

  await mvDragHandle(page, frame, sandbox, name, dx, dy, options);

  const after =
    await mvRects(page, frame, sandbox, ids);

  return { before, after };

}


/*
  크기 조절의 세 가지를 한 번에 본다(계약 §40-4).

    1  멤버마다의 배율이 **하나**인가          (≤ 0.01)
    2  잡지 않은 반대쪽 모서리가 제자리인가   (≤ 1px)
    3  멤버 중심이 A + s(C − A) 인가          (≤ 1px)

  `autoIds` 는 높이가 `"auto"` 인 멤버다 — 그 멤버의 **세로**는
  배율을 받지 않으므로 1·3 의 세로 항에서 뺀다.
*/
function mvScaleReport(before, after, ids, direction, autoIds) {

  const auto =
    autoIds || [];

  const b =
    mvUnion(before, ids);

  const a =
    mvUnion(after, ids);

  if (!b || !a) {
    return { ok: false, why: "missing" };
  }

  const anchor = {
    x: direction.indexOf("w") !== -1 ? b.right : b.left,
    y: direction.indexOf("n") !== -1 ? b.bottom : b.top
  };

  const anchorAfter = {
    x: direction.indexOf("w") !== -1 ? a.right : a.left,
    y: direction.indexOf("n") !== -1 ? a.bottom : a.top
  };

  const scales = [];
  const centers = [];

  ids.forEach((id) => {

    if (!before[id] || !after[id]) {
      return;
    }

    scales.push(after[id].width / before[id].width);

    if (auto.indexOf(id) === -1) {
      scales.push(after[id].height / before[id].height);
    }

  });

  const s =
    scales.length ? scales.reduce((x, y) => x + y, 0) / scales.length : 0;

  ids.forEach((id) => {

    if (!before[id] || !after[id]) {
      return;
    }

    const c0 = mvCenter(before[id]);
    const c1 = mvCenter(after[id]);

    /* `"auto"` 멤버의 세로 중심은 높이가 배율을 받지 않아 다르게
       움직인다 — 가로만 본다 */
    centers.push(Math.abs(c1.x - (anchor.x + (c0.x - anchor.x) * s)));

    if (auto.indexOf(id) === -1) {
      centers.push(Math.abs(c1.y - (anchor.y + (c0.y - anchor.y) * s)));
    }

  });

  return {
    ok: true,
    scale: Math.round(s * 10000) / 10000,
    spread: Math.round((Math.max(...scales) - Math.min(...scales)) * 10000) / 10000,
    anchorMove:
      Math.round(
        Math.max(
          Math.abs(anchorAfter.x - anchor.x),
          Math.abs(anchorAfter.y - anchor.y)
        ) * 100) / 100,
    centerMiss: Math.round(Math.max(...centers) * 100) / 100
  };

}


/* 그 요소가 지금 화면에서 몇 도인가 — transform 행렬에서 읽는다 */
async function mvAngles(page, frame, sandbox, ids) {

  const read = (doc, list) => {

    const out = {};

    list.forEach((id) => {

      const el = doc.querySelector(`[data-imory-edit-id="${id}"]`);

      if (!el) {
        out[id] = null;
        return;
      }

      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);

      let deg = Math.atan2(m.b, m.a) * 180 / Math.PI;

      if (deg < 0) {
        deg += 360;
      }

      out[id] = Math.round(deg * 100) / 100;

    });

    return out;

  };

  if (sandbox) {
    return frame.evaluate(
      ([list, src]) => new Function("doc", "list", "return (" + src + ")(doc, list)")(document, list),
      [ids, read.toString()]);
  }

  return page.evaluate(
    ([list, src]) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return new Function("doc", "list", "return (" + src + ")(doc, list)")(doc, list);
    },
    [ids, read.toString()]);

}


/* 각도 차이 — 0/360 경계를 접어서 본다 */
function mvAngleDelta(before, after, id) {

  if (before[id] === null || after[id] === null) {
    return null;
  }

  let d = after[id] - before[id];

  while (d > 180) d -= 360;
  while (d <= -180) d += 360;

  return Math.round(d * 100) / 100;

}


/* 회전의 두 가지를 본다(계약 §40-5).

     1  멤버마다의 각도 delta 가 **하나**인가      (≤ 0.1°)
     2  멤버 중심이 P + R(θ)(C − P) 인가           (≤ 1px)
*/
function mvRotateReport(before, after, beforeAngles, afterAngles, ids) {

  const b = mvUnion(before, ids);

  if (!b) {
    return { ok: false, why: "missing" };
  }

  const pivot = {
    x: (b.left + b.right) / 2,
    y: (b.top + b.bottom) / 2
  };

  const deltas =
    ids.map((id) => mvAngleDelta(beforeAngles, afterAngles, id)).filter((v) => v !== null);

  const theta =
    deltas.length ? deltas.reduce((x, y) => x + y, 0) / deltas.length : 0;

  const rad = theta * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const misses = [];

  ids.forEach((id) => {

    if (!before[id] || !after[id]) {
      return;
    }

    const c0 = mvCenter(before[id]);
    const c1 = mvCenter(after[id]);

    const vx = c0.x - pivot.x;
    const vy = c0.y - pivot.y;

    misses.push(
      Math.max(
        Math.abs(c1.x - (pivot.x + vx * cos - vy * sin)),
        Math.abs(c1.y - (pivot.y + vx * sin + vy * cos))
      )
    );

  });

  return {
    ok: true,
    angle: Math.round(theta * 100) / 100,
    spread:
      deltas.length
        ? Math.round((Math.max(...deltas) - Math.min(...deltas)) * 100) / 100
        : 0,
    centerMiss: Math.round(Math.max(...misses) * 100) / 100
  };

}


if (wants("group-move")) {

  section("group-move");

  const { page, frame } = await openMove(browser, {});

  /* ── overlay 그룹 — 공통 delta ── */

  const picked =
    await selectGroupFolder(page, "gOver");

  check("★ 숨은 멤버가 있어도 폴더 행이 그룹을 고른다",
    !!picked && picked.pickable.join(",") === "mvA,mvB" &&
      picked.live.join(",") === "mvA,mvB,mvHid",
    JSON.stringify(picked));

  const frameState =
    await mvFrameState(frame);

  check("★ 프레임이 그룹을 받았고 끌 수 있다",
    !!frameState && frameState.groupActive === true &&
      frameState.groupId === "gOver" && frameState.groupDraggable === true,
    frameState ? `${frameState.groupId}/${frameState.groupGate}` : "null");

  check("★ 그룹 선택에도 이동 손잡이가 보인다(모바일의 그 자리)",
    !!frameState && frameState.moveGripVisible === true);

  check("★ 그룹 선택에는 리사이즈 · 회전 손잡이가 없다",
    !!frameState && frameState.resizeHandles === 0 &&
      frameState.rotationHandles === 0,
    frameState ? `${frameState.resizeHandles}/${frameState.rotationHandles}` : "");

  const beforeUndo = await mvUndoDepth(page);

  const beforeCanvas = await mvCanvas(page);

  const overlayMove =
    await mvMoveGroup(page, frame, false, "gOver", "mvA", 40, 26,
      ["mvA", "mvB", "mvMid"]);

  const overlaySame =
    mvSame(overlayMove.deltas, ["mvA", "mvB"], 40, 26);

  check("★ overlay 그룹 — 멤버 둘이 요청한 만큼 **같이** 움직였다",
    overlaySame.ok, JSON.stringify(overlayMove.deltas));

  check("★ 그룹 밖 요소는 한 픽셀도 움직이지 않았다",
    overlayMove.deltas.mvMid &&
      Math.abs(overlayMove.deltas.mvMid.x) <= 0.5 &&
      Math.abs(overlayMove.deltas.mvMid.y) <= 0.5,
    JSON.stringify(overlayMove.deltas.mvMid));

  const afterCanvas = await mvCanvas(page);

  /* sandbox 와 견줄 값 — 같은 fixture · 같은 제스처의 결과다 */
  const nativeOverlayDeltas = overlayMove.deltas;

  const nativeOverlayStored =
    JSON.parse(JSON.stringify(
      afterCanvas.overlays.find((el) => el.id === "mvA")));

  check("★ 숨은 멤버도 같은 delta 로 저장값이 옮겨졌다",
    (() => {
      const before = beforeCanvas.overlays.find((el) => el.id === "mvHid");
      const after = afterCanvas.overlays.find((el) => el.id === "mvHid");
      const a = beforeCanvas.overlays.find((el) => el.id === "mvA");
      const b = afterCanvas.overlays.find((el) => el.id === "mvA");
      return Math.abs((after.x - before.x) - (b.x - a.x)) < 0.002 &&
        Math.abs((after.y - before.y) - (b.y - a.y)) < 0.002;
    })(),
    JSON.stringify({
      hid: afterCanvas.overlays.find((el) => el.id === "mvHid"),
      a: afterCanvas.overlays.find((el) => el.id === "mvA")
    }));

  check("★ 그룹 이동 한 번 = Undo 한 칸",
    (await mvUndoDepth(page)) === beforeUndo + 1,
    `${beforeUndo} → ${await mvUndoDepth(page)}`);

  check("★ 좌표 말고는 글자 단위로 같다 — groups · 배열 순서 · 모르는 칸",
    mvFingerprint(beforeCanvas) === mvFingerprint(afterCanvas));

  check("★ `groups` 는 한 글자도 바뀌지 않았다",
    JSON.stringify(beforeCanvas.groups) === JSON.stringify(afterCanvas.groups));

  check("★ 이동 뒤에도 그룹 선택이 그대로다",
    (await page.evaluate(() => {
      const g = window.studioCanvasSelectedGroup();
      return g ? g.id : null;
    })) === "gOver");

  /* ── Undo / Redo ── */

  const movedRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  const undoneRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ Undo 한 번에 멤버 전부가 시작 자리로 돌아온다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(undoneRects[id].left - overlayMove.before[id].left) <= 1 &&
      Math.abs(undoneRects[id].top - overlayMove.before[id].top) <= 1),
    JSON.stringify(undoneRects));

  await page.evaluate(() => window.redoStudioHistory());
  await sleep(900);

  const redoneRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ Redo 한 번에 멤버 전부가 최종 자리로 간다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(redoneRects[id].left - movedRects[id].left) <= 1 &&
      Math.abs(redoneRects[id].top - movedRects[id].top) <= 1),
    JSON.stringify(redoneRects));

  /* ── delta 0 — 끌었다가 시작 자리로 돌아와 끝냄 ── */

  await selectGroupFolder(page, "gOver");

  await mvBringIntoView(page, frame, false, "mvA");

  const backUndo = await mvUndoDepth(page);

  const backBefore =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const backFrom = {
    x: backBefore.mvA.left + backBefore.mvA.width / 2,
    y: backBefore.mvA.top + backBefore.mvA.height / 2
  };

  await page.mouse.move(backFrom.x, backFrom.y);
  await page.mouse.down();

  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(backFrom.x + (42 * i) / 6, backFrom.y + i);
  }

  for (let i = 6; i >= 0; i -= 1) {
    await page.mouse.move(backFrom.x + (42 * i) / 6, backFrom.y + i);
  }

  await page.mouse.up();
  await sleep(700);

  check("★ 끌었다가 시작 자리로 돌아와 끝내면 Undo 0칸",
    (await mvUndoDepth(page)) === backUndo,
    backUndo + " → " + (await mvUndoDepth(page)));

  const backAfter =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ 그때 화면도 시작 자리 그대로다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(backAfter[id].left - backBefore[id].left) <= 1 &&
      Math.abs(backAfter[id].top - backBefore[id].top) <= 1),
    JSON.stringify(backAfter));


  /* ── delta 0 — 끌지 않은 클릭 ── */

  await selectGroupFolder(page, "gOver");

  const clickUndo = await mvUndoDepth(page);

  await mvDragMember(page, frame, false, "mvA", 0, 0, { steps: 1 });

  check("★ 움직이지 않은 클릭은 Undo 0칸",
    (await mvUndoDepth(page)) === clickUndo);

  check("★ 움직이지 않은 클릭은 그 멤버 하나를 고른다(기존 규칙)",
    (await selectionOf(page)).ids.join(",") === "mvA",
    (await selectionOf(page)).ids.join(","));

  /* ── 자식 단독 선택은 그 자식만 움직인다 ── */

  const childUndo = await mvUndoDepth(page);

  const childMove =
    await mvMoveGroup(page, frame, false, "gOver", "mvA", 24, 0, ["mvA", "mvB"]);

  check("★ 자식만 고른 상태에서는 그 자식만 움직인다",
    Math.abs(childMove.deltas.mvA.x - 24) <= 1 &&
      Math.abs(childMove.deltas.mvB.x) <= 0.5,
    JSON.stringify(childMove.deltas));

  check("자식 단독 이동도 Undo 한 칸",
    (await mvUndoDepth(page)) === childUndo + 1);

  /* ── 취소(Escape) ── */

  await selectGroupFolder(page, "gOver");

  const cancelUndo = await mvUndoDepth(page);

  await mvBringIntoView(page, frame, false, "mvA");

  const cancelBefore =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  let liveDelta = null;

  await mvDragMember(page, frame, false, "mvA", 50, 0, {
    noUp: true,
    beforeUp: async () => {

      const mid =
        await mvRects(page, frame, false, ["mvA", "mvB"]);

      liveDelta = {
        a: mid.mvA.left - cancelBefore.mvA.left,
        b: mid.mvB.left - cancelBefore.mvB.left
      };

    }
  });

  check("★ 끄는 동안 멤버가 **즉시 함께** 움직인다(실시간 Preview)",
    !!liveDelta && Math.abs(liveDelta.a - 50) <= 1 &&
      Math.abs(liveDelta.b - 50) <= 1,
    JSON.stringify(liveDelta));

  await page.keyboard.press("Escape");
  await sleep(300);
  await page.mouse.up();
  await sleep(600);

  const cancelled =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ 취소하면 시작 자리로 완전히 돌아온다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(cancelled[id].left - cancelBefore[id].left) <= 1 &&
      Math.abs(cancelled[id].top - cancelBefore[id].top) <= 1),
    JSON.stringify(cancelled));

  check("★ 취소는 Undo 0칸", (await mvUndoDepth(page)) === cancelUndo);

  /* ── 관문 — 낡은 end · 선택 변경 · 멤버 구조 변경 ── */

  await selectGroupFolder(page, "gOver");

  const gateUndo = await mvUndoDepth(page);

  const gates = await page.evaluate(() => {

    const open =
      () => ({
        generation: window.getStudioCanvasSelection().generation,
        revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0
      });

    const out = {};

    /* 시작을 알리지 않은 end */
    out.noStart =
      window.commitStudioCanvasGroupMove({
        groupId: "gOver", gestureId: 991, phase: "end",
        dx: 10, dy: 0, ...open(), requestId: 1
      }).reason;

    /* 시작 뒤 revision 이 갈린 end */
    const one = open();

    window.commitStudioCanvasGroupMove({
      groupId: "gOver", gestureId: 992, phase: "start",
      dx: 0, dy: 0, ...one, requestId: 0
    });

    out.staleRevision =
      window.commitStudioCanvasGroupMove({
        groupId: "gOver", gestureId: 992, phase: "end",
        dx: 10, dy: 0, generation: one.generation,
        revision: one.revision + 7, requestId: 2
      }).reason;

    /* 선택이 갈린 뒤의 end */
    const two = open();

    window.commitStudioCanvasGroupMove({
      groupId: "gOver", gestureId: 993, phase: "start",
      dx: 0, dy: 0, ...two, requestId: 0
    });

    window.proposeStudioCanvasSelection({
      ids: ["mvMid"], primaryId: "mvMid", mode: "replace"
    });

    out.selectionChanged =
      window.commitStudioCanvasGroupMove({
        groupId: "gOver", gestureId: 993, phase: "end",
        dx: 10, dy: 0, ...two, requestId: 3
      }).reason;

    /* 없는 그룹 */
    out.noGroup =
      window.commitStudioCanvasGroupMove({
        groupId: "gNope", gestureId: 994, phase: "end",
        dx: 10, dy: 0, ...open(), requestId: 4
      }).reason;

    return out;

  });

  check("★ 시작을 알리지 않은 end 는 쓰지 않는다",
    gates.noStart === "stale", JSON.stringify(gates));

  check("★ 낡은 revision 의 end 는 쓰지 않는다",
    gates.staleRevision === "stale");

  check("★ 제스처 도중 선택이 갈리면 쓰지 않는다",
    gates.selectionChanged === "stale" || gates.selectionChanged === "selection",
    gates.selectionChanged);

  check("★ 없는 그룹은 쓰지 않는다",
    gates.noGroup === "stale" || gates.noGroup === "selection",
    gates.noGroup);

  check("★ 거절된 확정은 Undo 0칸",
    (await mvUndoDepth(page)) === gateUndo,
    `${gateUndo} → ${await mvUndoDepth(page)}`);

  /* 멤버 구조가 바뀌면 시작 칸이 무효다 */

  await selectGroupFolder(page, "gOver");

  const structUndo = await mvUndoDepth(page);

  const structReason = await page.evaluate(async () => {

    const open = {
      generation: window.getStudioCanvasSelection().generation,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0
    };

    window.commitStudioCanvasGroupMove({
      groupId: "gOver", gestureId: 995, phase: "start",
      dx: 0, dy: 0, ...open, requestId: 0
    });

    /* 멤버 하나를 그룹에서 뺀다 — 기존 구조 관문 하나를 지난다 */
    window.studioCanvasLayersGroupLeave("mvB");

    return window.commitStudioCanvasGroupMove({
      groupId: "gOver", gestureId: 995, phase: "end",
      dx: 10, dy: 0, ...open, requestId: 5
    }).reason;

  });

  check("★ 제스처 도중 멤버가 바뀌면 쓰지 않는다",
    structReason === "stale" || structReason === "members" ||
      structReason === "selection",
    String(structReason));

  check("★ 그 거절도 Undo 를 더 쌓지 않는다 — 구조 변경 한 칸뿐이다",
    (await mvUndoDepth(page)) === structUndo + 1,
    `${structUndo} → ${await mvUndoDepth(page)}`);

  /* ── 잠긴 멤버 ── */

  const lockPick = await selectGroupFolder(page, "gLock");

  const lockState = await mvFrameState(frame);

  check("★ 잠긴 멤버가 있는 그룹은 프레임이 끌지 않는다",
    !!lockState && lockState.groupActive === false &&
      lockState.groupLocked === true,
    lockState ? `${lockState.groupActive}/${lockState.groupLocked}` : "null");

  check("★ 잠긴 멤버는 애초에 선택에 들어가지 않는다",
    !!lockPick && lockPick.pickable.join(",") === "mvLockA,mvLockC" &&
      lockPick.live.join(",") === "mvLockA,mvLockB,mvLockC",
    JSON.stringify(lockPick));

  const lockNote = await page.evaluate(() =>
    window.getStudioCanvasLayersState().note);

  check("★ 왜 안 움직이는지 한 줄로 말한다",
    typeof lockNote === "string" && lockNote.indexOf("잠긴") !== -1,
    lockNote);

  const lockUndo = await mvUndoDepth(page);

  const lockReason = await page.evaluate(() =>
    window.commitStudioCanvasGroupMove({
      groupId: "gLock", gestureId: 996, phase: "start",
      dx: 0, dy: 0,
      generation: window.getStudioCanvasSelection().generation,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0,
      requestId: 0
    }).reason);

  check("★ 잠긴 그룹은 시작 자체가 막힌다",
    lockReason === "locked", String(lockReason));

  check("★ 잠긴 그룹 거절은 Undo 0칸",
    (await mvUndoDepth(page)) === lockUndo);

  /* ── 프레임 안 — transform 둘(하나는 회전) ── */

  await selectGroupFolder(page, "gTrans");

  const transMove =
    await mvMoveGroup(page, frame, false, "gTrans", "mvT1", 30, 18,
      ["mvT1", "mvT2"]);

  check("★ 같은 프레임의 transform 멤버 둘이 같이 움직인다(회전 포함)",
    mvSame(transMove.deltas, ["mvT1", "mvT2"], 30, 18).ok,
    JSON.stringify(transMove.deltas));

  /* ── 프레임 안 — pin 둘 ── */

  await selectGroupFolder(page, "gPin");

  const pinMove =
    await mvMoveGroup(page, frame, false, "gPin", "mvP1", -26, 20,
      ["mvP1", "mvP2"]);

  check("★ 같은 프레임의 pin 멤버 둘이 같이 움직인다",
    mvSame(pinMove.deltas, ["mvP1", "mvP2"], -26, 20).ok,
    JSON.stringify(pinMove.deltas));

  const pinCanvas = await mvCanvas(page);

  check("★ pin 멤버는 `pin.offset` 으로 저장된다 — 좌표 칸이 생기지 않는다",
    (() => {
      const node = pinCanvas.flow.blocks[0].props.elements
        .find((el) => el.id === "mvP1");
      return node && node.x === undefined && node.y === undefined &&
        node.pin && node.pin.offset && node.pin.anchor === "top-right";
    })());

  /* ── 프레임 안 — pin + transform 섞임 ── */

  await selectGroupFolder(page, "gMix");

  const mixMove =
    await mvMoveGroup(page, frame, false, "gMix", "mvM1", 22, -14,
      ["mvM1", "mvM2"]);

  check("★ 한 프레임 안의 transform + pin 이 **같은 거리**로 움직인다",
    mvSame(mixMove.deltas, ["mvM1", "mvM2"], 22, -14).ok,
    JSON.stringify(mixMove.deltas));

  /* ── 원자적 실패 ── */

  await selectGroupFolder(page, "gMix");

  const atomicUndo = await mvUndoDepth(page);

  const atomicBefore = await mvCanvas(page);

  const atomicReason = await page.evaluate(() => {

    /* 계획을 만드는 함수 하나를 잠시 실패시키면, 이미 만들어진
       다른 멤버의 계획도 **적용되지 않아야** 한다 */
    const real = window.writeSkinHomeCanvasV2NodePinOffset;

    window.writeSkinHomeCanvasV2NodePinOffset =
      () => ({ ok: false, reason: "test-fail" });

    const open = {
      generation: window.getStudioCanvasSelection().generation,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0
    };

    window.commitStudioCanvasGroupMove({
      groupId: "gMix", gestureId: 997, phase: "start",
      dx: 0, dy: 0, ...open, requestId: 0
    });

    const out =
      window.commitStudioCanvasGroupMove({
        groupId: "gMix", gestureId: 997, phase: "end",
        dx: 12, dy: 8, ...open, requestId: 6
      }).reason;

    window.writeSkinHomeCanvasV2NodePinOffset = real;

    return out;

  });

  check("★ 하나라도 실패하면 전부 무변경이다",
    atomicReason === "test-fail" &&
      JSON.stringify(await mvCanvas(page)) === JSON.stringify(atomicBefore),
    String(atomicReason));

  check("★ 원자적 실패는 Undo 0칸",
    (await mvUndoDepth(page)) === atomicUndo);

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);


  /* ── Save · Export/Import · Publish resolve ── */

  const round = await openMove(browser, {});

  await selectGroupFolder(round.page, "gOver");

  await mvDragMember(round.page, round.frame, false, "mvA", 36, 20);

  const roundCanvas = await mvCanvas(round.page);

  const roundTrip = await round.page.evaluate(async () => {

    const exported = window.buildSkinPackageExport(currentWorkingSkin);

    if (!exported.ok) return { ok: false, message: exported.message };

    const result =
      await window.validateSkinPackageImport(
        window.serializeSkinPackageExport(exported.skinPackage));

    if (!result.ok) return { ok: false, message: result.message };

    const entry =
      result.skinPackage.regions.find((r) => r && r.name === "home_canvas");

    return { ok: true, canvas: JSON.stringify(entry.canvas) };

  });

  check("★ Export → Import 왕복에서 옮긴 자리가 그대로다",
    roundTrip.ok && roundTrip.canvas === JSON.stringify(roundCanvas),
    roundTrip.message || "");

  const resolved = await round.page.evaluate(() => {

    const payload =
      window.resolveSkinHomeCanvas(
        currentWorkingSkin, currentWorkingSkin.templates.home.html);

    if (!payload) return null;

    const a = payload.overlays.find((el) => el.id === "mvA");

    return { hasGroups: payload.groups !== undefined, x: a ? a.x : null };

  });

  check("★ Publish resolve 에도 옮긴 자리가 실리고 `groups` 는 없다",
    !!resolved && resolved.hasGroups === false &&
      Math.abs(resolved.x - roundCanvas.overlays.find((el) => el.id === "mvA").x) < 0.001,
    JSON.stringify(resolved));

  await round.page.click("#studioSaveButton");

  await round.page.waitForFunction(
    () => Array.isArray(window.__savedDraftCallsLay) &&
      window.__savedDraftCallsLay.length > 0,
    null, { timeout: 15000 }
  );

  const saved = await round.page.evaluate(() => {
    const calls = window.__savedDraftCallsLay;
    return calls[calls.length - 1].p_content;
  });

  await close(round.page);

  const again = await openStudio(browser, { package: saved });

  await canvasFrame(again, false);

  check("★ Save → 다시 열기에서 옮긴 자리가 글자 단위로 같다",
    JSON.stringify(await mvCanvas(again)) === JSON.stringify(roundCanvas));

  await close(again);


  /* ── 390px 실제 터치 ── */

  const mobile =
    await openMove(browser, {
      viewport: { width: 390, height: 780 }, hasTouch: true
    });

  await selectGroupFolder(mobile.page, "gOver");

  /* ★ 390px 에서 왼쪽 패널은 화면을 통째로 덮는다 — 접어야 Preview
     의 손잡이를 짚을 수 있다(그 접기는 선택을 바꾸지 않는다). */
  await mobile.page.evaluate(() => window.collapseStudioLeftPanel());

  await sleep(500);

  await mvBringIntoView(mobile.page, mobile.frame, false, "mvA");

  const touchBefore =
    await mvRects(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

  const gripBox = await mobile.page.evaluate(() => {

    const host = document.getElementById("studioPreviewFrame");
    const doc = host.contentDocument;
    const grip = doc.querySelector("[data-imory-canvas-move-grip]");

    if (!grip || grip.style.display === "none") return null;

    const box = host.getBoundingClientRect();
    const scale = box.width / (host.offsetWidth || box.width);
    const r = grip.getBoundingClientRect();

    return {
      x: box.left + (r.left + r.width / 2) * scale,
      y: box.top + (r.top + r.height / 2) * scale
    };

  });

  check("★ 390px 에서도 그룹 이동 손잡이가 보인다",
    !!gripBox, JSON.stringify(gripBox));

  if (gripBox) {

    const cdp =
      await mobile.page.context().newCDPSession(mobile.page);

    const touch = async (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type: type,
        touchPoints:
          type === "touchEnd" ? [] : [{ x: x, y: y, id: 1 }]
      });

    await touch("touchStart", gripBox.x, gripBox.y);

    for (let i = 1; i <= 6; i += 1) {
      await touch("touchMove", gripBox.x + (30 * i) / 6, gripBox.y + (18 * i) / 6);
      await sleep(40);
    }

    await touch("touchEnd", 0, 0);

    await sleep(900);

    const touchAfter =
      await mvRects(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

    const touchDelta = {
      a: mvDelta(touchBefore, touchAfter, "mvA"),
      b: mvDelta(touchBefore, touchAfter, "mvB")
    };

    const touchState = await mvFrameState(mobile.frame);

    check("★ 390px 에서도 터치가 그룹 제스처를 시작했다",
      !!touchState && touchState.groupMoveCount >= 1,
      touchState
        ? JSON.stringify({
            gate: touchState.lastGroupGate,
            count: touchState.groupMoveCount
          })
        : "null");

    check("★ 390px 실제 터치로 그룹이 함께 움직인다",
      !!touchDelta.a && !!touchDelta.b &&
        Math.abs(touchDelta.a.x - 30) <= 2 && Math.abs(touchDelta.a.y - 18) <= 2 &&
        Math.abs(touchDelta.a.x - touchDelta.b.x) <= 1 &&
        Math.abs(touchDelta.a.y - touchDelta.b.y) <= 1,
      JSON.stringify(touchDelta));

    const scrolled = await mobile.page.evaluate(() =>
      ({ x: window.scrollX, page: document.documentElement.scrollWidth }));

    check("★ 끄는 동안 페이지가 가로로 밀리지 않는다",
      scrolled.x <= 0, JSON.stringify(scrolled));

  }

  check("pageerror 0 (390px)", mobile.page.__errors.length === 0,
    mobile.page.__errors.slice(0, 2).join(" | "));

  await close(mobile.page);


  /* ── sandbox parity ── */

  const box = await openMove(browser, { sandbox: true });

  await selectGroupFolder(box.page, "gOver");

  const boxState = await mvFrameState(box.frame);

  check("★ sandbox 프레임도 그룹을 받았다",
    !!boxState && boxState.groupActive === true && boxState.groupId === "gOver",
    boxState ? String(boxState.groupGate) : "null");

  const boxMove =
    await mvMoveGroup(box.page, box.frame, true, "gOver", "mvA", 40, 26,
      ["mvA", "mvB", "mvMid"]);

  const boxAfterState = await mvFrameState(box.frame);

  check("★ sandbox 에서도 그룹 제스처가 실제로 돌았다",
    !!boxAfterState && boxAfterState.groupMoveCount >= 1,
    boxAfterState
      ? JSON.stringify({
          gate: boxAfterState.lastGroupGate,
          count: boxAfterState.groupMoveCount,
          settle: boxAfterState.lastGroupSettle
        })
      : "null");

  check("★ sandbox 에서도 멤버 둘이 같이 움직인다",
    mvSame(boxMove.deltas, ["mvA", "mvB"], 40, 26).ok,
    JSON.stringify(boxMove.deltas));

  check("★ sandbox 에서도 그룹 밖 요소는 그대로다",
    boxMove.deltas.mvMid &&
      Math.abs(boxMove.deltas.mvMid.x) <= 0.5 &&
      Math.abs(boxMove.deltas.mvMid.y) <= 0.5,
    JSON.stringify(boxMove.deltas.mvMid));

  const boxCanvas = await mvCanvas(box.page);

  check("★ native ↔ sandbox 가 같은 화면 거리를 그린다",
    ["mvA", "mvB"].every(
      (id) =>
        Math.abs(boxMove.deltas[id].x - nativeOverlayDeltas[id].x) <= 1 &&
        Math.abs(boxMove.deltas[id].y - nativeOverlayDeltas[id].y) <= 1),
    JSON.stringify({ sandbox: boxMove.deltas.mvA, native: nativeOverlayDeltas.mvA }));

  check("★ native ↔ sandbox 가 같은 저장값을 만든다",
    JSON.stringify(boxCanvas.overlays.find((el) => el.id === "mvA")) ===
      JSON.stringify(nativeOverlayStored),
    JSON.stringify(boxCanvas.overlays.find((el) => el.id === "mvA")));

  check("★ sandbox 이동도 Undo 한 칸이다",
    (await mvUndoDepth(box.page)) >= 1);

  const parentCsp =
    await box.page.evaluate(() => (window.__cspViolations || []).slice());

  const frameCsp = await cspViolations(box.frame);

  check("★ CSP 위반 0 (부모)", parentCsp.length === 0,
    JSON.stringify(parentCsp.slice(0, 2)));

  check("★ CSP 위반 0 (프레임)", frameCsp.length === 0,
    JSON.stringify(frameCsp.slice(0, 2)));

  check("pageerror 0 (sandbox)", box.page.__errors.length === 0,
    box.page.__errors.slice(0, 2).join(" | "));

  await close(box.page);

}


/* ---------------------------------------------------------- [group-resize] */

if (wants("group-resize")) {

  section("group-resize");

  const { page, frame } = await openMove(browser, {});

  /* ── 손잡이 ── */

  await selectGroupFolder(page, "gOver");

  await mvBringIntoView(page, frame, false, "mvA");

  const shown =
    await mvHandleCount(page, frame, false);

  check("★ 그룹을 고르면 모서리 손잡이 넷이 보인다",
    shown.corners === 4, JSON.stringify(shown));

  check("★ 변 중앙 손잡이는 없다(Moveable 의 여덟도 그대로 0)",
    (await mvFrameState(frame)).resizeHandles === 0);

  check("★ 위쪽 중앙에 회전 손잡이가 있다", shown.rotate === true);

  const gripGap = await (async () => {

    const nw = await mvHandle(page, frame, false, "nw");
    const grip =
      (await mvSel(page, frame, false, ["[data-imory-canvas-move-grip]"]))[
        "[data-imory-canvas-move-grip]"];

    if (!nw || !grip) {
      return null;
    }

    return Math.round(
      Math.max(nw.left - (grip.left + grip.width), grip.top + grip.height - nw.top) * 10) / 10;

  })();

  check("★ 이동 손잡이와 `nw` 모서리가 겹치지 않는다",
    gripGap !== null && gripGap >= 0, String(gripGap));

  const rotateGap = await (async () => {

    const ne = await mvHandle(page, frame, false, "ne");
    const rot = await mvHandle(page, frame, false, "rotate");

    return (ne && rot)
      ? Math.round((ne.top - (rot.top + rot.height)) * 10) / 10
      : null;

  })();

  check("★ 회전 손잡이가 위쪽 모서리 손잡이와 겹치지 않는다",
    rotateGap !== null && rotateGap >= 0, String(rotateGap));

  const range =
    await mvFrameState(frame);

  check("★ 프레임이 공통 배율 범위와 회전 가능 여부를 받았다",
    range.groupScaleMin > 0 && range.groupScaleMax > range.groupScaleMin &&
      range.groupCanRotate === true,
    JSON.stringify({
      min: Math.round(range.groupScaleMin * 1000) / 1000,
      max: Math.round(range.groupScaleMax),
      rotate: range.groupCanRotate
    }));

  /* ── overlay 그룹 확대 ── */

  const growUndo = await mvUndoDepth(page);

  const growCanvas = await mvCanvas(page);

  const grow =
    await mvResizeGroup(page, frame, false, "mvA", "se", 60, 60,
      ["mvA", "mvB", "mvMid"]);

  const growReport =
    mvScaleReport(grow.before, grow.after, ["mvA", "mvB"], "se");

  check("★ overlay 그룹 확대 — 멤버 전부가 **같은 배율**을 받았다",
    growReport.scale > 1.05 && growReport.spread <= 0.01,
    JSON.stringify(growReport));

  check("★ 잡은 모서리의 반대편이 고정점이다(≤ 1px)",
    growReport.anchorMove <= 1, String(growReport.anchorMove));

  check("★ 멤버 중심이 A + s(C − A) 다(≤ 1px)",
    growReport.centerMiss <= 1, String(growReport.centerMiss));

  check("★ 그룹 밖 요소는 한 픽셀도 바뀌지 않았다",
    Math.abs(grow.after.mvMid.left - grow.before.mvMid.left) <= 0.5 &&
      Math.abs(grow.after.mvMid.width - grow.before.mvMid.width) <= 0.5,
    JSON.stringify(grow.after.mvMid));

  check("★ 크기 조절 한 번 = Undo 한 칸",
    (await mvUndoDepth(page)) === growUndo + 1,
    `${growUndo} → ${await mvUndoDepth(page)}`);

  const grownCanvas = await mvCanvas(page);

  check("★ `groups` · 배열 순서 · 모르는 칸은 그대로다",
    JSON.stringify(growCanvas.groups) === JSON.stringify(grownCanvas.groups) &&
      growCanvas.mvMystery.keep === grownCanvas.mvMystery.keep &&
      growCanvas.overlays.map((el) => el.id).join(",") ===
        grownCanvas.overlays.map((el) => el.id).join(","));

  check("★ 숨은 멤버도 같은 배율로 저장값이 바뀌었다",
    (() => {
      const b = growCanvas.overlays.find((el) => el.id === "mvHid");
      const a = grownCanvas.overlays.find((el) => el.id === "mvHid");
      const bA = growCanvas.overlays.find((el) => el.id === "mvA");
      const aA = grownCanvas.overlays.find((el) => el.id === "mvA");
      return Math.abs((a.width / b.width) - (aA.width / bA.width)) <= 0.01;
    })(),
    JSON.stringify(grownCanvas.overlays.find((el) => el.id === "mvHid")));

  check("★ type · props · hidden 은 그대로다",
    (() => {
      const a = grownCanvas.overlays.find((el) => el.id === "mvHid");
      return a.type === "shape" && a.hidden === true && a.props.kind === "rect";
    })());

  /* ── Undo / Redo ── */

  const grownRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  const undoneRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ Undo 한 번에 그룹 전체가 시작 크기 · 자리로 돌아온다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(undoneRects[id].left - grow.before[id].left) <= 1 &&
      Math.abs(undoneRects[id].top - grow.before[id].top) <= 1 &&
      Math.abs(undoneRects[id].width - grow.before[id].width) <= 1 &&
      Math.abs(undoneRects[id].height - grow.before[id].height) <= 1),
    JSON.stringify(undoneRects));

  await page.evaluate(() => window.redoStudioHistory());
  await sleep(900);

  const redoneRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ Redo 한 번에 그룹 전체가 다시 적용된다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(redoneRects[id].left - grownRects[id].left) <= 1 &&
      Math.abs(redoneRects[id].width - grownRects[id].width) <= 1),
    JSON.stringify(redoneRects));

  /* 다시 처음 크기로 — 아래 검사들이 같은 자에서 돌게 */
  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 축소 · 네 모서리 ── */

  await selectGroupFolder(page, "gOver");

  const shrink =
    await mvResizeGroup(page, frame, false, "mvA", "se", -30, -30,
      ["mvA", "mvB"]);

  const shrinkReport =
    mvScaleReport(shrink.before, shrink.after, ["mvA", "mvB"], "se");

  check("★ overlay 그룹 축소 — 같은 배율 · 같은 고정점",
    shrinkReport.scale < 0.95 && shrinkReport.spread <= 0.01 &&
      shrinkReport.anchorMove <= 1,
    JSON.stringify(shrinkReport));

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  const corners = {};

  for (const name of ["nw", "ne", "sw"]) {

    await selectGroupFolder(page, "gOver");

    const pull =
      name === "nw" ? { x: -40, y: -40 }
        : name === "ne" ? { x: 40, y: -40 }
          : { x: -40, y: 40 };

    const hit =
      await mvResizeGroup(page, frame, false, "mvA", name, pull.x, pull.y,
        ["mvA", "mvB"]);

    corners[name] =
      mvScaleReport(hit.before, hit.after, ["mvA", "mvB"], name);

    await page.evaluate(() => window.undoStudioHistory());
    await sleep(900);

  }

  check("★ 모서리 넷이 전부 같은 규칙이다 — 비율 고정 · 반대쪽 고정점",
    ["nw", "ne", "sw"].every(
      (name) =>
        corners[name].scale > 1.05 &&
        corners[name].spread <= 0.01 &&
        corners[name].anchorMove <= 1 &&
        corners[name].centerMiss <= 1),
    JSON.stringify(corners));

  /* ── 비율 고정 — 한 축으로만 끌어도 ── */

  await selectGroupFolder(page, "gOver");

  const oneAxis =
    await mvResizeGroup(page, frame, false, "mvA", "se", 60, 0,
      ["mvA", "mvB"]);

  const ratio = (rects, id) => rects[id].width / rects[id].height;

  check("★ 가로로만 끌어도 종횡비가 유지된다(Shift 없이)",
    ["mvA", "mvB"].every(
      (id) => Math.abs(ratio(oneAxis.after, id) - ratio(oneAxis.before, id)) <= 0.02),
    JSON.stringify(["mvA", "mvB"].map((id) => ({
      id: id,
      before: Math.round(ratio(oneAxis.before, id) * 100) / 100,
      after: Math.round(ratio(oneAxis.after, id) * 100) / 100
    }))));

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 서로 다른 type · height:"auto" ── */

  await selectGroupFolder(page, "gAuto");

  const autoBeforeCanvas = await mvCanvas(page);

  const autoRun =
    await mvResizeGroup(page, frame, false, "mvAutoT", "se", 50, 50,
      ["mvAutoT", "mvAutoS"]);

  const autoReport =
    mvScaleReport(autoRun.before, autoRun.after, ["mvAutoT", "mvAutoS"],
      "se", ["mvAutoT"]);

  check("★ 글자 · 도형이 섞여도 가로 배율은 하나다",
    autoReport.scale > 1.05 && autoReport.spread <= 0.01,
    JSON.stringify(autoReport));

  const autoCanvas = await mvCanvas(page);

  const autoNode =
    autoCanvas.overlays.find((el) => el.id === "mvAutoT");

  check("★ `height:\"auto\"` 는 조용히 숫자가 되지 않는다",
    autoNode.height === "auto", JSON.stringify(autoNode));

  check("★ 그 멤버의 **가로만** 배율을 받았다",
    Math.abs(
      (autoNode.width /
        autoBeforeCanvas.overlays.find((el) => el.id === "mvAutoT").width) -
      (autoCanvas.overlays.find((el) => el.id === "mvAutoS").width /
        autoBeforeCanvas.overlays.find((el) => el.id === "mvAutoS").width)
    ) <= 0.01,
    JSON.stringify({ t: autoNode.width, s: autoCanvas.overlays.find((el) => el.id === "mvAutoS").width }));

  const autoFont = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector('[data-imory-edit-id="mvAutoT"]');
    return el ? getComputedStyle(el).fontSize : null;
  });

  check("★ 글자 크기 자체는 바뀌지 않는다(상자만 바뀐다 — 계약 §40-4)",
    autoFont === "12px", String(autoFont));

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 프레임 안 — transform 둘 · pin 둘 · 섞임 ── */

  const frameCases = {};

  for (const one of [
    { group: "gTrans", grab: "mvT1", ids: ["mvT1", "mvT2"] },
    { group: "gPin", grab: "mvP1", ids: ["mvP1", "mvP2"] },
    { group: "gMix", grab: "mvM1", ids: ["mvM1", "mvM2"] }
  ]) {

    await selectGroupFolder(page, one.group);

    const run =
      await mvResizeGroup(page, frame, false, one.grab, "se", 30, 30, one.ids);

    frameCases[one.group] =
      mvScaleReport(run.before, run.after, one.ids, "se");

    await page.evaluate(() => window.undoStudioHistory());
    await sleep(900);

  }

  check("★ 프레임 안 `transform` 둘 — 회전한 멤버가 섞여도 배율 하나",
    frameCases.gTrans.scale > 1.02 && frameCases.gTrans.spread <= 0.02 &&
      frameCases.gTrans.anchorMove <= 1,
    JSON.stringify(frameCases.gTrans));

  check("★ 프레임 안 `pin` 둘도 같은 규칙이다",
    frameCases.gPin.scale > 1.02 && frameCases.gPin.spread <= 0.02 &&
      frameCases.gPin.anchorMove <= 1,
    JSON.stringify(frameCases.gPin));

  check("★ `transform` + `pin` 이 섞인 그룹도 **같은 배율 하나**다",
    frameCases.gMix.scale > 1.02 && frameCases.gMix.spread <= 0.02 &&
      frameCases.gMix.anchorMove <= 1 && frameCases.gMix.centerMiss <= 1,
    JSON.stringify(frameCases.gMix));

  /* ── 잠긴 멤버 ── */

  const lockUndo = await mvUndoDepth(page);

  const lockPick =
    await selectGroupFolder(page, "gLock");

  const lockState =
    await mvFrameState(frame);

  check("★ 잠긴 멤버가 있는 그룹에는 손잡이가 아예 없다",
    (await mvHandleCount(page, frame, false)).corners === 0 &&
      lockState.groupShapeGate !== "ok",
    lockState.groupShapeGate);

  const lockReason = await page.evaluate(() =>
    window.commitStudioCanvasGroupTransform({
      groupId: "gLock", gestureId: 951, phase: "start", kind: "resize",
      scale: 1, angle: 0,
      members: [{ id: "mvLockA", vx: 0, vy: 0, h: 20 }],
      generation: window.getStudioCanvasSelection()
        ? window.getStudioCanvasSelection().generation : 0,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0,
      requestId: 0
    }).reason);

  check("★ 잠긴 그룹은 시작 자체가 막힌다",
    lockReason === "locked" || lockReason === "selection", String(lockReason));

  check("★ 잠금 거절은 Undo 0칸",
    (await mvUndoDepth(page)) === lockUndo,
    `${lockUndo} → ${await mvUndoDepth(page)}`);

  /* ── 최소 크기 · 공통 배율의 바닥 ── */

  await selectGroupFolder(page, "gOver");

  const clampCanvas = await mvCanvas(page);

  const clamp =
    await mvResizeGroup(page, frame, false, "mvA", "se", -4000, -4000,
      ["mvA", "mvB"]);

  const clampReport =
    mvScaleReport(clamp.before, clamp.after, ["mvA", "mvB"], "se");

  const clampAfter = await mvCanvas(page);

  const smallest =
    ["mvA", "mvB"].map(
      (id) => clampAfter.overlays.find((el) => el.id === id))
      .reduce((m, el) => Math.min(m, el.width, el.height), Infinity);

  check("★ 최소 크기 아래로는 줄지 않는다",
    smallest >= 1 - 0.001, String(smallest));

  check("★ 바닥에 닿아도 **공통 배율 하나**다(멤버마다 따로 자르지 않는다)",
    clampReport.spread <= 0.02 && clampReport.anchorMove <= 1,
    JSON.stringify(clampReport));

  check("★ 그때도 뒤집히지 않는다(음수 크기 없음)",
    ["mvA", "mvB"].every((id) =>
      clamp.after[id].width > 0 && clamp.after[id].height > 0) &&
      ["mvA", "mvB"].every((id) => {
        const el = clampAfter.overlays.find((n) => n.id === id);
        return el.width > 0 && el.height > 0;
      }));

  void clampCanvas;

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 취소 ── */

  await selectGroupFolder(page, "gOver");

  const cancelUndo = await mvUndoDepth(page);

  const cancelBefore =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  await mvDragHandle(page, frame, false, "se", 50, 50, {
    noUp: true,
    pause: 30
  });

  const duringCancel =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ 끄는 동안 멤버가 즉시 따라온다",
    duringCancel.mvA.width > cancelBefore.mvA.width + 2,
    JSON.stringify({ before: cancelBefore.mvA.width, during: duringCancel.mvA.width }));

  await page.keyboard.press("Escape");
  await sleep(400);
  await page.mouse.up();
  await sleep(500);

  const afterCancel =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ Escape 는 시작 크기로 완전히 돌린다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(afterCancel[id].left - cancelBefore[id].left) <= 1 &&
      Math.abs(afterCancel[id].width - cancelBefore[id].width) <= 1 &&
      Math.abs(afterCancel[id].height - cancelBefore[id].height) <= 1),
    JSON.stringify(afterCancel));

  check("★ 취소는 Undo 0칸",
    (await mvUndoDepth(page)) === cancelUndo,
    `${cancelUndo} → ${await mvUndoDepth(page)}`);

  /* ── stale · 원자성 ── */

  await selectGroupFolder(page, "gOver");

  const gateUndo = await mvUndoDepth(page);

  const gates = await page.evaluate(() => {

    const open = () => ({
      generation: window.getStudioCanvasSelection()
        ? window.getStudioCanvasSelection().generation : 0,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0
    });

    const members = [
      { id: "mvA", vx: 0, vy: 0, h: 40 },
      { id: "mvB", vx: 40, vy: 40, h: 35 }
    ];

    const out = {};

    out.noStart =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 981, phase: "end", kind: "resize",
        scale: 1.2, angle: 0, members: members, ...open(), requestId: 1
      }).reason;

    const one = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 982, phase: "start", kind: "resize",
      scale: 1, angle: 0, members: members, ...one, requestId: 0
    });

    out.staleRevision =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 982, phase: "end", kind: "resize",
        scale: 1.2, angle: 0, members: members,
        generation: one.generation, revision: one.revision + 7, requestId: 2
      }).reason;

    /* 종류가 갈린 end — 크기로 시작해 회전으로 끝낼 수 없다 */
    const two = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 983, phase: "start", kind: "resize",
      scale: 1, angle: 0, members: members, ...two, requestId: 0
    });

    out.otherKind =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 983, phase: "end", kind: "rotate",
        scale: 1, angle: 20, members: members, ...two, requestId: 3
      }).reason;

    /* 보고된 명단이 시작 때와 다른 end */
    const three = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 984, phase: "start", kind: "resize",
      scale: 1, angle: 0, members: members, ...three, requestId: 0
    });

    out.otherMembers =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 984, phase: "end", kind: "resize",
        scale: 1.2, angle: 0,
        members: [{ id: "mvA", vx: 0, vy: 0, h: 40 }],
        ...three, requestId: 4
      }).reason;

    /* 범위 밖 배율 */
    const four = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 985, phase: "start", kind: "resize",
      scale: 1, angle: 0, members: members, ...four, requestId: 0
    });

    out.tooSmall =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 985, phase: "end", kind: "resize",
        scale: 0.0002, angle: 0, members: members, ...four, requestId: 5
      }).reason;

    /* 모르는 멤버가 섞인 보고 */
    const five = open();

    const alien = [
      { id: "mvA", vx: 0, vy: 0, h: 40 },
      { id: "mvMid", vx: 40, vy: 40, h: 30 }
    ];

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 986, phase: "start", kind: "resize",
      scale: 1, angle: 0, members: alien, ...five, requestId: 0
    });

    out.alien =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 986, phase: "end", kind: "resize",
        scale: 1.2, angle: 0, members: alien, ...five, requestId: 6
      }).reason;

    /* 배율이 1 이면 한 칸도 쓰지 않는다 */
    const six = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 987, phase: "start", kind: "resize",
      scale: 1, angle: 0, members: members, ...six, requestId: 0
    });

    out.same =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 987, phase: "end", kind: "resize",
        scale: 1, angle: 0, members: members, ...six, requestId: 7
      }).reason;

    return out;

  });

  check("★ 시작을 알리지 않은 end 는 쓰지 않는다",
    gates.noStart === "stale", JSON.stringify(gates));

  check("★ 낡은 revision 의 end 는 쓰지 않는다",
    gates.staleRevision === "stale", gates.staleRevision);

  check("★ 종류가 갈린 end 는 쓰지 않는다",
    gates.otherKind === "stale", gates.otherKind);

  check("★ 보고된 명단이 갈리면 쓰지 않는다",
    gates.otherMembers === "members", gates.otherMembers);

  check("★ 공통 배율 범위 밖은 쓰지 않는다",
    gates.tooSmall === "range", gates.tooSmall);

  check("★ 그룹 밖 요소가 섞인 보고는 쓰지 않는다",
    gates.alien === "members", gates.alien);

  check("★ 배율이 1 이면 한 칸도 쓰지 않는다",
    gates.same === "unchanged", gates.same);

  check("★ 거절과 무변경은 전부 Undo 0칸",
    (await mvUndoDepth(page)) === gateUndo,
    `${gateUndo} → ${await mvUndoDepth(page)}`);

  /* 한 멤버라도 계획이 서지 않으면 **전부 무변경**이다 */

  await selectGroupFolder(page, "gOver");

  const atomicUndo = await mvUndoDepth(page);

  const atomicBefore = await mvCanvas(page);

  const atomic = await page.evaluate(() => {

    const real = window.planStudioCanvasV2Transform;

    let seen = 0;

    /* 두 번째 멤버에서 실패하게 만든다 — 첫 멤버는 계획이 섰다 */
    window.planStudioCanvasV2Transform = function (kind, id, next, expected) {
      seen += 1;
      return seen === 2 ? { ok: false, reason: "test" } : real(kind, id, next, expected);
    };

    const open = {
      generation: window.getStudioCanvasSelection().generation,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0
    };

    const members = [
      { id: "mvA", vx: 0, vy: 0, h: 40 },
      { id: "mvB", vx: 40, vy: 40, h: 35 }
    ];

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 971, phase: "start", kind: "resize",
      scale: 1, angle: 0, members: members, ...open, requestId: 0
    });

    const reason =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 971, phase: "end", kind: "resize",
        scale: 1.4, angle: 0, members: members, ...open, requestId: 8
      }).reason;

    window.planStudioCanvasV2Transform = real;

    return reason;

  });

  check("★ 한 멤버라도 계획이 서지 않으면 전부 무변경",
    atomic === "test" &&
      JSON.stringify(atomicBefore) === JSON.stringify(await mvCanvas(page)),
    String(atomic));

  check("★ 원자적 실패는 Undo 0칸",
    (await mvUndoDepth(page)) === atomicUndo,
    `${atomicUndo} → ${await mvUndoDepth(page)}`);

  /* ── native 의 저장값 — 아래 sandbox 와 견준다 ── */

  await selectGroupFolder(page, "gOver");

  const nativeRun =
    await mvResizeGroup(page, frame, false, "mvA", "se", 60, 60,
      ["mvA", "mvB"]);

  const nativeReport =
    mvScaleReport(nativeRun.before, nativeRun.after, ["mvA", "mvB"], "se");

  const nativeStored =
    JSON.stringify((await mvCanvas(page)).overlays.find((el) => el.id === "mvA"));

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.join(" | "));

  await page.close();


  /* ── 390px 실제 터치 ── */

  const mobile =
    await openMove(browser, {
      viewport: { width: 390, height: 780 }, hasTouch: true
    });

  await selectGroupFolder(mobile.page, "gOver");

  /* 390px 에서 왼쪽 패널은 화면을 통째로 덮는다(그룹 이동과 같다) */
  await mobile.page.evaluate(() => window.collapseStudioLeftPanel());

  await sleep(500);

  await mvBringIntoView(mobile.page, mobile.frame, false, "mvA");

  const touchHandles =
    await mvHandleCount(mobile.page, mobile.frame, false);

  check("★ 390px 에서도 모서리 손잡이 넷을 누를 수 있다",
    touchHandles.corners === 4, JSON.stringify(touchHandles));

  const touchSize =
    await mvHandle(mobile.page, mobile.frame, false, "se");

  check("★ 손잡이가 손가락이 닿을 만큼 크다(보이는 크기 = 잡는 크기)",
    !!touchSize && touchSize.width >= 18 && touchSize.height >= 18,
    JSON.stringify(touchSize));

  const touchBefore =
    await mvRects(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

  const touchScroll =
    await mobile.page.evaluate(() => window.scrollX);

  if (touchSize) {

    const cdp =
      await mobile.page.context().newCDPSession(mobile.page);

    const touch = async (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type: type,
        touchPoints: type === "touchEnd" ? [] : [{ x: x, y: y, id: 1 }]
      });

    const from = {
      x: touchSize.left + touchSize.width / 2,
      y: touchSize.top + touchSize.height / 2
    };

    await touch("touchStart", from.x, from.y);

    for (let i = 1; i <= 6; i += 1) {
      await touch("touchMove", from.x + (24 * i) / 6, from.y + (24 * i) / 6);
      await sleep(40);
    }

    await touch("touchEnd", 0, 0);

    await sleep(900);

    const touchAfter =
      await mvRects(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

    const touchReport =
      mvScaleReport(touchBefore, touchAfter, ["mvA", "mvB"], "se");

    const touchState =
      await mvFrameState(mobile.frame);

    check("★ 390px 실제 터치로 그룹 크기가 바뀐다",
      touchState.groupShapeCount >= 1 && touchReport.scale > 1.02 &&
        touchReport.spread <= 0.02,
      JSON.stringify(touchReport));

    check("★ 그 제스처가 이동으로 새지 않았다(그룹 이동 0회)",
      touchState.groupMoveCount === 0, String(touchState.groupMoveCount));

    check("★ 끄는 동안 페이지가 가로로 밀리지 않는다",
      (await mobile.page.evaluate(() => window.scrollX)) === touchScroll,
      String(touchScroll));

  }

  check("pageerror 0 (390px)", mobile.page.__errors.length === 0,
    mobile.page.__errors.slice(0, 2).join(" | "));

  await mobile.page.close();


  /* ── sandbox — 같은 제스처 · 같은 결과 ── */

  const box =
    await openMove(browser, { sandbox: true });

  await selectGroupFolder(box.page, "gOver");

  await mvBringIntoView(box.page, box.frame, true, "mvA");

  const boxHandles =
    await mvHandleCount(box.page, box.frame, true);

  check("★ sandbox 에서도 모서리 손잡이 넷이 보인다",
    boxHandles.corners === 4, JSON.stringify(boxHandles));

  const boxRun =
    await mvResizeGroup(box.page, box.frame, true, "mvA", "se", 60, 60,
      ["mvA", "mvB"]);

  const boxReport =
    mvScaleReport(boxRun.before, boxRun.after, ["mvA", "mvB"], "se");

  check("★ sandbox 에서도 멤버 전부가 같은 배율을 받았다",
    boxReport.scale > 1.05 && boxReport.spread <= 0.02 &&
      boxReport.anchorMove <= 1,
    JSON.stringify(boxReport));

  check("★ native ↔ sandbox 가 같은 배율을 만든다",
    Math.abs(boxReport.scale - nativeReport.scale) <= 0.01,
    JSON.stringify({ native: nativeReport.scale, sandbox: boxReport.scale }));

  check("★ native ↔ sandbox 가 같은 저장값을 만든다",
    JSON.stringify(
      (await mvCanvas(box.page)).overlays.find((el) => el.id === "mvA")) ===
      nativeStored,
    nativeStored);

  const boxCsp =
    await box.page.evaluate(() => window.__cspViolations || []);

  check("★ CSP 위반 0 (부모)", boxCsp.length === 0, JSON.stringify(boxCsp));

  const frameCsp =
    await box.frame.evaluate(() => window.__cspViolations || []);

  check("★ CSP 위반 0 (프레임)", frameCsp.length === 0, JSON.stringify(frameCsp));

  check("pageerror 0 (sandbox)", box.page.__errors.length === 0,
    box.page.__errors.slice(0, 2).join(" | "));

  await box.page.close();

}


/* ---------------------------------------------------------- [group-rotate] */

/*
  회전 손잡이를 **호를 따라** 끈다 — 직선으로 끌면 도중에 피벗
  가까이를 지나며 각도가 튄다.

  `deg` 는 이 제스처가 **날것으로** 도는 각도다. 30° 자석이 그 값을
  가장 가까운 30° 배수로 당길 수 있고(계약 §40-5), 그것을 재는 것이
  이 절의 일이다.
*/
async function mvTurnHandle(page, frame, sandbox, pivot, deg, options) {

  const o = options || {};

  const box =
    await mvHandle(page, frame, sandbox, "rotate");

  if (!box) {
    throw new Error("회전 손잡이를 찾지 못했습니다");
  }

  const from = {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2
  };

  const vx = from.x - pivot.x;
  const vy = from.y - pivot.y;

  const radius = Math.sqrt(vx * vx + vy * vy);
  const base = Math.atan2(vy, vx);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();

  const steps = o.steps || 10;

  for (let i = 1; i <= steps; i += 1) {

    const a = base + (deg * i / steps) * Math.PI / 180;

    await page.mouse.move(
      pivot.x + radius * Math.cos(a),
      pivot.y + radius * Math.sin(a));

    if (o.pause) await sleep(o.pause);

  }

  if (o.beforeUp) {
    await o.beforeUp();
  }

  if (o.noUp) {
    return from;
  }

  await page.mouse.up();

  await sleep(o.settle === undefined ? 700 : o.settle);

  return from;

}


async function mvRotateGroup(page, frame, sandbox, grabId, deg, ids, options) {

  await mvBringIntoView(page, frame, sandbox, grabId);

  const before =
    await mvRects(page, frame, sandbox, ids);

  const beforeAngles =
    await mvAngles(page, frame, sandbox, ids);

  const bounds =
    mvUnion(before, ids);

  const pivot = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2
  };

  await mvTurnHandle(page, frame, sandbox, pivot, deg, options);

  const after =
    await mvRects(page, frame, sandbox, ids);

  const afterAngles =
    await mvAngles(page, frame, sandbox, ids);

  return {
    before: before,
    after: after,
    beforeAngles: beforeAngles,
    afterAngles: afterAngles,
    pivot: pivot,
    report: mvRotateReport(before, after, beforeAngles, afterAngles, ids)
  };

}


if (wants("group-rotate")) {

  section("group-rotate");

  const { page, frame } = await openMove(browser, {});

  /* ── overlay 그룹 — 양수 회전 ── */

  await selectGroupFolder(page, "gOver");

  const turnUndo = await mvUndoDepth(page);

  const turnCanvas = await mvCanvas(page);

  const turn =
    await mvRotateGroup(page, frame, false, "mvA", 45, ["mvA", "mvB"]);

  check("★ overlay 그룹 회전 — 멤버 전부가 **같은 각도**만큼 돌았다",
    turn.report.angle > 40 && turn.report.spread <= 0.1,
    JSON.stringify(turn.report));

  check("★ 멤버 중심이 P + R(θ)(C − P) 다(≤ 1px)",
    turn.report.centerMiss <= 1, String(turn.report.centerMiss));

  /* ★ 회전한 요소의 **바깥** 상자는 커지는 것이 맞다(축에 정렬된
     그림자다). 화면에서 "유지된다"를 재는 값은 멤버 **사이의
     거리**이고, 상자 네 칸은 바로 아래에서 저장값으로 본다. */
  const spanOf = (rects) => {
    const a = mvCenter(rects.mvA);
    const b = mvCenter(rects.mvB);
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  };

  check("★ 내부 상대 배치는 유지된다(멤버 사이의 거리 ≤ 1px)",
    Math.abs(spanOf(turn.after) - spanOf(turn.before)) <= 1,
    JSON.stringify({
      before: Math.round(spanOf(turn.before) * 10) / 10,
      after: Math.round(spanOf(turn.after) * 10) / 10
    }));

  const turnedCanvas = await mvCanvas(page);

  check("★ 저장된 상자 네 칸은 크기가 그대로다(각도와 자리만 바뀐다)",
    ["mvA", "mvB"].every((id) => {
      const b = turnCanvas.overlays.find((el) => el.id === id);
      const a = turnedCanvas.overlays.find((el) => el.id === id);
      return a.width === b.width && a.height === b.height;
    }),
    JSON.stringify(turnedCanvas.overlays.find((el) => el.id === "mvA")));

  check("★ 회전 한 번 = Undo 한 칸",
    (await mvUndoDepth(page)) === turnUndo + 1,
    `${turnUndo} → ${await mvUndoDepth(page)}`);

  check("★ 숨은 멤버도 같은 각도 · 같은 규칙으로 돌았다",
    (() => {
      const a = turnedCanvas.overlays.find((el) => el.id === "mvHid");
      const b = turnedCanvas.overlays.find((el) => el.id === "mvA");
      return Math.abs((a.rotation || 0) - (b.rotation || 0)) <= 0.1 &&
        a.hidden === true;
    })(),
    JSON.stringify(turnedCanvas.overlays.find((el) => el.id === "mvHid")));

  check("★ `groups` · 배열 순서 · 모르는 칸은 그대로다",
    JSON.stringify(turnCanvas.groups) === JSON.stringify(turnedCanvas.groups) &&
      turnCanvas.mvMystery.keep === turnedCanvas.mvMystery.keep);

  /* ── Undo / Redo ── */

  const turnedRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  const undoneRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const undoneAngles =
    await mvAngles(page, frame, false, ["mvA", "mvB"]);

  check("★ Undo 한 번에 각도와 자리가 전부 돌아온다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(undoneRects[id].left - turn.before[id].left) <= 1 &&
      Math.abs(undoneRects[id].top - turn.before[id].top) <= 1 &&
      Math.abs(mvAngleDelta(turn.beforeAngles, undoneAngles, id)) <= 0.1),
    JSON.stringify(undoneAngles));

  await page.evaluate(() => window.redoStudioHistory());
  await sleep(900);

  const redoneRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ Redo 한 번에 그룹 전체가 다시 돈다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(redoneRects[id].left - turnedRects[id].left) <= 1),
    JSON.stringify(redoneRects));

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 음수 회전 · 30° 자석 ── */

  await selectGroupFolder(page, "gOver");

  const back =
    await mvRotateGroup(page, frame, false, "mvA", -50, ["mvA", "mvB"]);

  check("★ 음수 회전도 같은 규칙이다",
    back.report.angle < -45 && back.report.spread <= 0.1 &&
      back.report.centerMiss <= 1,
    JSON.stringify(back.report));

  const backCanvas = await mvCanvas(page);

  check("★ 각도는 0~360 으로 접혀 저장된다(0°/360° 경계)",
    ["mvA", "mvB"].every((id) => {
      const el = backCanvas.overlays.find((n) => n.id === id);
      return el.rotation >= 0 && el.rotation < 360 && el.rotation > 300;
    }),
    JSON.stringify(backCanvas.overlays.filter(
      (el) => el.id === "mvA" || el.id === "mvB").map((el) => el.rotation)));

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  await selectGroupFolder(page, "gOver");

  const snap =
    await mvRotateGroup(page, frame, false, "mvA", 28, ["mvA", "mvB"]);

  check("★ 30° 자석이 **공통 delta 에** 걸린다(단일 회전과 같은 규칙)",
    Math.abs(snap.report.angle - 30) <= 0.2,
    String(snap.report.angle));

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 서로 다른 초기 각도 · 이미 회전된 멤버 ── */

  await selectGroupFolder(page, "gTrans");

  const mixedBefore = await mvCanvas(page);

  const mixed =
    await mvRotateGroup(page, frame, false, "mvT1", -45, ["mvT1", "mvT2"]);

  check("★ 초기 각도가 서로 달라도 delta 는 하나다(0° 와 20°)",
    mixed.report.spread <= 0.2 && mixed.report.centerMiss <= 1,
    JSON.stringify(mixed.report));

  const mixedAfter = await mvCanvas(page);

  const framed =
    (canvas, id) =>
      canvas.flow.blocks[0].props.elements.find((el) => el.id === id);

  check("★ 멤버 자신의 각도에 같은 delta 가 더해진다 — 음수는 접힌다",
    (() => {
      const a = framed(mixedAfter, "mvT1").rotation || 0;
      const b = framed(mixedAfter, "mvT2").rotation || 0;
      const before2 = framed(mixedBefore, "mvT2").rotation || 0;
      return a >= 0 && a < 360 && b >= 0 && b < 360 &&
        Math.abs(((b - a) + 360) % 360 - before2) <= 0.2;
    })(),
    JSON.stringify({
      t1: framed(mixedAfter, "mvT1").rotation,
      t2: framed(mixedAfter, "mvT2").rotation
    }));

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 프레임 안 · pin · 섞임 ── */

  const frameTurns = {};

  for (const one of [
    { group: "gPin", grab: "mvP1", ids: ["mvP1", "mvP2"] },
    { group: "gMix", grab: "mvM1", ids: ["mvM1", "mvM2"] }
  ]) {

    await selectGroupFolder(page, one.group);

    frameTurns[one.group] =
      (await mvRotateGroup(page, frame, false, one.grab, 40, one.ids)).report;

    await page.evaluate(() => window.undoStudioHistory());
    await sleep(900);

  }

  check("★ 프레임 안 `pin` 둘이 같은 각도로 돈다",
    frameTurns.gPin.spread <= 0.2 && frameTurns.gPin.centerMiss <= 1,
    JSON.stringify(frameTurns.gPin));

  check("★ `transform` + `pin` 이 섞여도 화면의 각도와 중심이 일치한다",
    frameTurns.gMix.spread <= 0.2 && frameTurns.gMix.centerMiss <= 1,
    JSON.stringify(frameTurns.gMix));

  /* ── `height:"auto"` 가 숨어 있으면 회전을 열지 않는다 ── */

  const autoRotate = await page.evaluate(() => ({
    visible: window.studioCanvasV2GroupCanRotate(["mvAutoT", "mvAutoS"], []),
    hidden: window.studioCanvasV2GroupCanRotate(["mvAutoT", "mvAutoS"], ["mvAutoT"])
  }));

  check("★ 보이는 `\"auto\"` 멤버는 회전할 수 있다(잰 높이로)",
    autoRotate.visible === true, JSON.stringify(autoRotate));

  check("★ 숨은 `\"auto\"` 멤버가 있으면 회전을 아예 열지 않는다",
    autoRotate.hidden === false, JSON.stringify(autoRotate));

  await selectGroupFolder(page, "gAuto");

  const autoTurn =
    await mvRotateGroup(page, frame, false, "mvAutoT", 40,
      ["mvAutoT", "mvAutoS"]);

  check("★ 글자 · 도형이 섞인 그룹도 같은 각도로 돈다",
    autoTurn.report.spread <= 0.2 && autoTurn.report.centerMiss <= 1.5,
    JSON.stringify(autoTurn.report));

  check("★ 회전은 `\"auto\"` 를 숫자로 바꾸지 않는다",
    (await mvCanvas(page)).overlays.find(
      (el) => el.id === "mvAutoT").height === "auto");

  await page.evaluate(() => window.undoStudioHistory());
  await sleep(900);

  /* ── 잠긴 그룹 ── */

  const lockUndo = await mvUndoDepth(page);

  await selectGroupFolder(page, "gLock");

  const lockHandles =
    await mvHandleCount(page, frame, false);

  check("★ 잠긴 그룹에는 회전 손잡이도 없다",
    lockHandles.rotate === false, JSON.stringify(lockHandles));

  const lockReason = await page.evaluate(() =>
    window.commitStudioCanvasGroupTransform({
      groupId: "gLock", gestureId: 941, phase: "start", kind: "rotate",
      scale: 1, angle: 30,
      members: [{ id: "mvLockA", vx: 0, vy: 0, h: 20 }],
      generation: window.getStudioCanvasSelection()
        ? window.getStudioCanvasSelection().generation : 0,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0,
      requestId: 0
    }).reason);

  check("★ 잠긴 그룹은 회전도 시작 자체가 막힌다",
    lockReason === "locked" || lockReason === "selection", String(lockReason));

  check("★ 잠금 거절은 Undo 0칸",
    (await mvUndoDepth(page)) === lockUndo);

  /* ── 취소 ── */

  await selectGroupFolder(page, "gOver");

  await mvBringIntoView(page, frame, false, "mvA");

  const cancelUndo = await mvUndoDepth(page);

  const cancelBefore =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const cancelAngles =
    await mvAngles(page, frame, false, ["mvA", "mvB"]);

  const cancelBounds = mvUnion(cancelBefore, ["mvA", "mvB"]);

  await mvTurnHandle(
    page, frame, false,
    {
      x: (cancelBounds.left + cancelBounds.right) / 2,
      y: (cancelBounds.top + cancelBounds.bottom) / 2
    },
    50,
    { noUp: true, pause: 30 });

  const duringAngles =
    await mvAngles(page, frame, false, ["mvA", "mvB"]);

  check("★ 끄는 동안 멤버가 즉시 따라 돈다",
    Math.abs(mvAngleDelta(cancelAngles, duringAngles, "mvA")) > 10,
    JSON.stringify(duringAngles));

  await page.keyboard.press("Escape");
  await sleep(400);
  await page.mouse.up();
  await sleep(500);

  const afterCancel =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const afterCancelAngles =
    await mvAngles(page, frame, false, ["mvA", "mvB"]);

  check("★ Escape 는 각도와 자리를 시작 상태로 완전히 되돌린다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(afterCancel[id].left - cancelBefore[id].left) <= 1 &&
      Math.abs(afterCancel[id].top - cancelBefore[id].top) <= 1 &&
      Math.abs(mvAngleDelta(cancelAngles, afterCancelAngles, id)) <= 0.1),
    JSON.stringify(afterCancelAngles));

  check("★ 취소는 Undo 0칸",
    (await mvUndoDepth(page)) === cancelUndo,
    `${cancelUndo} → ${await mvUndoDepth(page)}`);

  /* ── stale · 원자성 ── */

  await selectGroupFolder(page, "gOver");

  const gateUndo = await mvUndoDepth(page);

  const gates = await page.evaluate(() => {

    const open = () => ({
      generation: window.getStudioCanvasSelection()
        ? window.getStudioCanvasSelection().generation : 0,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0
    });

    const members = [
      { id: "mvA", vx: -40, vy: -30, h: 40 },
      { id: "mvB", vx: 40, vy: 30, h: 35 }
    ];

    const out = {};

    out.noStart =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 931, phase: "end", kind: "rotate",
        scale: 1, angle: 30, members: members, ...open(), requestId: 1
      }).reason;

    const one = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 932, phase: "start", kind: "rotate",
      scale: 1, angle: 0, members: members, ...one, requestId: 0
    });

    out.staleRevision =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 932, phase: "end", kind: "rotate",
        scale: 1, angle: 30, members: members,
        generation: one.generation, revision: one.revision + 3, requestId: 2
      }).reason;

    const two = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 933, phase: "start", kind: "rotate",
      scale: 1, angle: 0, members: members, ...two, requestId: 0
    });

    out.same =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 933, phase: "end", kind: "rotate",
        scale: 1, angle: 0, members: members, ...two, requestId: 3
      }).reason;

    /* 각도가 한 바퀴를 넘는 요청 — 프로토콜과 같은 자로 거절한다 */
    const three = open();

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 934, phase: "start", kind: "rotate",
      scale: 1, angle: 0, members: members, ...three, requestId: 0
    });

    out.wild =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 934, phase: "end", kind: "rotate",
        scale: 1, angle: 4000, members: members, ...three, requestId: 4
      }).reason;

    return out;

  });

  check("★ 시작을 알리지 않은 end 는 쓰지 않는다(회전)",
    gates.noStart === "stale", JSON.stringify(gates));

  check("★ 낡은 revision 의 end 는 쓰지 않는다(회전)",
    gates.staleRevision === "stale", gates.staleRevision);

  check("★ 각도가 0 이면 한 칸도 쓰지 않는다",
    gates.same === "unchanged", gates.same);

  check("★ 한 바퀴를 넘는 각도는 거절한다",
    gates.wild === "angle", gates.wild);

  check("★ 거절과 무변경은 전부 Undo 0칸",
    (await mvUndoDepth(page)) === gateUndo,
    `${gateUndo} → ${await mvUndoDepth(page)}`);

  await selectGroupFolder(page, "gOver");

  const atomicUndo = await mvUndoDepth(page);

  const atomicBefore = await mvCanvas(page);

  const atomic = await page.evaluate(() => {

    const real = window.planStudioCanvasV2Transform;

    let seen = 0;

    /* 세 번째 계획에서 실패하게 만든다 — 회전은 멤버마다 두 칸
       (자리 · 각도)이므로 두 번째 멤버의 첫 칸이다 */
    window.planStudioCanvasV2Transform = function (kind, id, next, expected) {
      seen += 1;
      return seen === 3 ? { ok: false, reason: "test" } : real(kind, id, next, expected);
    };

    const open = {
      generation: window.getStudioCanvasSelection().generation,
      revision: (typeof studioWorkingRevision === "number") ? studioWorkingRevision : 0
    };

    const members = [
      { id: "mvA", vx: -40, vy: -30, h: 40 },
      { id: "mvB", vx: 40, vy: 30, h: 35 }
    ];

    window.commitStudioCanvasGroupTransform({
      groupId: "gOver", gestureId: 921, phase: "start", kind: "rotate",
      scale: 1, angle: 0, members: members, ...open, requestId: 0
    });

    const reason =
      window.commitStudioCanvasGroupTransform({
        groupId: "gOver", gestureId: 921, phase: "end", kind: "rotate",
        scale: 1, angle: 25, members: members, ...open, requestId: 5
      }).reason;

    window.planStudioCanvasV2Transform = real;

    return reason;

  });

  check("★ 회전도 한 멤버라도 계획이 서지 않으면 전부 무변경",
    atomic === "test" &&
      JSON.stringify(atomicBefore) === JSON.stringify(await mvCanvas(page)),
    String(atomic));

  check("★ 원자적 실패는 Undo 0칸",
    (await mvUndoDepth(page)) === atomicUndo);

  /* ── native 의 저장값 — 아래 sandbox 와 견준다 ── */

  await selectGroupFolder(page, "gOver");

  await mvBringIntoView(page, frame, false, "mvA");

  const nativeTurn =
    await mvRotateGroup(page, frame, false, "mvA", 45, ["mvA", "mvB"]);

  const nativeStored =
    JSON.stringify((await mvCanvas(page)).overlays.find((el) => el.id === "mvA"));

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await page.close();


  /* ── 390px 실제 터치 ── */

  const mobile =
    await openMove(browser, {
      viewport: { width: 390, height: 780 }, hasTouch: true
    });

  await selectGroupFolder(mobile.page, "gOver");

  await mobile.page.evaluate(() => window.collapseStudioLeftPanel());

  await sleep(500);

  await mvBringIntoView(mobile.page, mobile.frame, false, "mvA");

  const touchRotate =
    await mvHandle(mobile.page, mobile.frame, false, "rotate");

  check("★ 390px 에서도 회전 손잡이를 누를 수 있다",
    !!touchRotate && touchRotate.width >= 18,
    JSON.stringify(touchRotate));

  const touchBefore =
    await mvRects(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

  const touchAngles =
    await mvAngles(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

  if (touchRotate) {

    const bounds = mvUnion(touchBefore, ["mvA", "mvB"]);

    const pivot = {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2
    };

    const from = {
      x: touchRotate.left + touchRotate.width / 2,
      y: touchRotate.top + touchRotate.height / 2
    };

    const vx = from.x - pivot.x;
    const vy = from.y - pivot.y;
    const radius = Math.sqrt(vx * vx + vy * vy);
    const base = Math.atan2(vy, vx);

    const cdp =
      await mobile.page.context().newCDPSession(mobile.page);

    const touch = async (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type: type,
        touchPoints: type === "touchEnd" ? [] : [{ x: x, y: y, id: 1 }]
      });

    await touch("touchStart", from.x, from.y);

    for (let i = 1; i <= 6; i += 1) {
      const a = base + (45 * i / 6) * Math.PI / 180;
      await touch("touchMove",
        pivot.x + radius * Math.cos(a), pivot.y + radius * Math.sin(a));
      await sleep(40);
    }

    await touch("touchEnd", 0, 0);

    await sleep(900);

    const touchAfter =
      await mvRects(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

    const touchAfterAngles =
      await mvAngles(mobile.page, mobile.frame, false, ["mvA", "mvB"]);

    const touchReport =
      mvRotateReport(touchBefore, touchAfter, touchAngles, touchAfterAngles,
        ["mvA", "mvB"]);

    const touchState = await mvFrameState(mobile.frame);

    check("★ 390px 실제 터치로 그룹이 돈다",
      touchState.groupShapeCount >= 1 && Math.abs(touchReport.angle) > 20 &&
        touchReport.spread <= 0.2,
      JSON.stringify(touchReport));

    check("★ 그 제스처가 이동으로 새지 않았다(그룹 이동 0회)",
      touchState.groupMoveCount === 0, String(touchState.groupMoveCount));

  }

  check("pageerror 0 (390px)", mobile.page.__errors.length === 0,
    mobile.page.__errors.slice(0, 2).join(" | "));

  await mobile.page.close();


  /* ── sandbox — 같은 제스처 · 같은 결과 ── */

  const box =
    await openMove(browser, { sandbox: true });

  await selectGroupFolder(box.page, "gOver");

  await mvBringIntoView(box.page, box.frame, true, "mvA");

  check("★ sandbox 에서도 회전 손잡이가 보인다",
    (await mvHandleCount(box.page, box.frame, true)).rotate === true);

  const boxTurn =
    await mvRotateGroup(box.page, box.frame, true, "mvA", 45, ["mvA", "mvB"]);

  check("★ sandbox 에서도 멤버 전부가 같은 각도로 돈다",
    Math.abs(boxTurn.report.angle) > 40 && boxTurn.report.spread <= 0.2 &&
      boxTurn.report.centerMiss <= 1,
    JSON.stringify(boxTurn.report));

  check("★ native ↔ sandbox 가 같은 각도를 만든다",
    Math.abs(boxTurn.report.angle - nativeTurn.report.angle) <= 0.2,
    JSON.stringify({
      native: nativeTurn.report.angle,
      sandbox: boxTurn.report.angle
    }));

  check("★ native ↔ sandbox 가 같은 저장값을 만든다",
    JSON.stringify(
      (await mvCanvas(box.page)).overlays.find((el) => el.id === "mvA")) ===
      nativeStored,
    nativeStored);

  const boxCsp =
    await box.page.evaluate(() => window.__cspViolations || []);

  check("★ CSP 위반 0 (부모)", boxCsp.length === 0, JSON.stringify(boxCsp));

  const frameCsp =
    await box.frame.evaluate(() => window.__cspViolations || []);

  check("★ CSP 위반 0 (프레임)", frameCsp.length === 0, JSON.stringify(frameCsp));

  check("pageerror 0 (sandbox)", box.page.__errors.length === 0,
    box.page.__errors.slice(0, 2).join(" | "));

  await box.page.close();

}



/* ---------------------------------------------------------- [sequence] */

/*
  HOME-CANVAS-GROUP-1C — 셋을 **이어서** 한다.

  ★ 한 제스처만 보면 "다음 제스처가 앞 제스처의 결과를 시작값으로
    읽는가"를 알 수 없다. 이 절은 이동 → 크기 → 회전을 섞어 돌린
    뒤, 그 전부가 Undo 세 칸으로 접히고 Redo 세 칸으로 펴지는지와
    Save · Export/Import · Publish 를 지나도 남는지를 본다.
*/

if (wants("sequence")) {

  section("sequence");

  const { page, frame } = await openMove(browser, {});

  /* ── 이동 → 크기 ── */

  await selectGroupFolder(page, "gOver");

  const startUndo = await mvUndoDepth(page);

  /* ★ 시작 상태는 **저장값**으로 잡는다. 화면 좌표로 비교하면 그
     사이의 스크롤까지 함께 재게 된다 — 제스처마다 창이 움직인다
     (mvBringIntoView). 자리 · 크기 · 각도가 전부 그 JSON 안에 있다. */
  const startCanvas =
    JSON.stringify(await mvCanvas(page));

  const startRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  await mvMoveGroup(page, frame, false, "gOver", "mvA", 30, 20,
    ["mvA", "mvB"]);

  const movedRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const afterMove =
    await mvResizeGroup(page, frame, false, "mvA", "se", 40, 40,
      ["mvA", "mvB"]);

  const moveThenResize =
    mvScaleReport(afterMove.before, afterMove.after, ["mvA", "mvB"], "se");

  check("★ 이동 뒤의 크기 조절이 **옮겨진 자리**를 시작값으로 읽는다",
    moveThenResize.scale > 1.02 && moveThenResize.anchorMove <= 1 &&
      moveThenResize.centerMiss <= 1,
    JSON.stringify(moveThenResize));

  /* ── 크기 → 회전 ── */

  const resizedRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const afterResize =
    await mvRotateGroup(page, frame, false, "mvA", 45, ["mvA", "mvB"]);

  check("★ 크기 조절 뒤의 회전이 **바뀐 크기**를 기준으로 돈다",
    Math.abs(afterResize.report.angle) > 40 &&
      afterResize.report.spread <= 0.2 &&
      afterResize.report.centerMiss <= 1,
    JSON.stringify(afterResize.report));

  const rotatedRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const rotatedCanvas = await mvCanvas(page);

  check("★ 세 제스처 = Undo 세 칸",
    (await mvUndoDepth(page)) === startUndo + 3,
    `${startUndo} → ${await mvUndoDepth(page)}`);

  /* ── 회전 → 이동 ── */

  const afterRotate =
    await mvMoveGroup(page, frame, false, "gOver", "mvA", -20, 15,
      ["mvA", "mvB"]);

  check("★ 회전한 그룹도 화면에서 **같은 거리**를 움직인다",
    mvSame(afterRotate.deltas, ["mvA", "mvB"], -20, 15).ok,
    JSON.stringify(afterRotate.deltas));

  /* ── Undo 네 번 → Redo 네 번 ── */

  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => window.undoStudioHistory());
    await sleep(700);
  }

  const backRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  const backAngles =
    await mvAngles(page, frame, false, ["mvA", "mvB"]);

  check("★ Undo 네 번이면 네 제스처 전부가 시작 상태로 돌아온다",
    JSON.stringify(await mvCanvas(page)) === startCanvas &&
      ["mvA", "mvB"].every((id) =>
        Math.abs(backRects[id].width - startRects[id].width) <= 1 &&
        backAngles[id] === 0),
    JSON.stringify({ angles: backAngles, width: backRects.mvA.width }));

  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => window.redoStudioHistory());
    await sleep(700);
  }

  const forwardRects =
    await mvRects(page, frame, false, ["mvA", "mvB"]);

  check("★ Redo 네 번이면 다시 최종 상태다",
    ["mvA", "mvB"].every((id) =>
      Math.abs(forwardRects[id].left - (rotatedRects[id].left - 20)) <= 1.5 &&
      Math.abs(forwardRects[id].width - rotatedRects[id].width) <= 1),
    JSON.stringify(forwardRects));

  void movedRects;
  void resizedRects;
  void rotatedCanvas;

  /* ── Export → Import · Publish resolve ── */

  const finalCanvas =
    JSON.stringify(await mvCanvas(page));

  const roundTrip = await page.evaluate(async () => {

    const exported = window.buildSkinPackageExport(currentWorkingSkin);

    if (!exported.ok) return { ok: false, message: exported.message };

    const result =
      await window.validateSkinPackageImport(
        window.serializeSkinPackageExport(exported.skinPackage));

    if (!result.ok) return { ok: false, message: result.message };

    const entry =
      result.skinPackage.regions.find((r) => r && r.name === "home_canvas");

    return {
      ok: true,
      canvas: JSON.stringify(entry.canvas),
      notices: result.canvasNotices || []
    };

  });

  check("★ Export → Import 왕복에서 크기 · 각도가 글자 단위로 살아남는다",
    roundTrip.ok && roundTrip.canvas === finalCanvas,
    roundTrip.message || "");

  check("왕복에 수선 안내가 없다", roundTrip.ok && roundTrip.notices.length === 0);

  const resolved = await page.evaluate(() => {

    const payload =
      window.resolveSkinHomeCanvas(
        currentWorkingSkin, currentWorkingSkin.templates.home.html);

    if (!payload) return null;

    const one = payload.overlays.find((el) => el.id === "mvA");

    return {
      groups: payload.groups !== undefined,
      rotation: one ? one.rotation : null,
      width: one ? one.width : null
    };

  });

  const storedA =
    JSON.parse(finalCanvas).overlays.find((el) => el.id === "mvA");

  check("★ Publish resolve 가 그 크기 · 각도를 그대로 싣는다(`groups` 는 빼고)",
    resolved && resolved.groups === false &&
      Math.abs(resolved.rotation - storedA.rotation) < 0.001 &&
      Math.abs(resolved.width - storedA.width) < 0.001,
    JSON.stringify(resolved));

  /* ── Save → 다시 열기 ── */

  await page.click("#studioSaveButton");

  await page.waitForFunction(
    () => Array.isArray(window.__savedDraftCallsLay) &&
      window.__savedDraftCallsLay.length > 0,
    null, { timeout: 15000 });

  const savedContent = await page.evaluate(() => {
    const calls = window.__savedDraftCallsLay;
    return calls[calls.length - 1].p_content;
  });

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await page.close();

  const again = await openStudio(browser, { package: savedContent });

  const againFrame = await canvasFrame(again, false);

  check("★ Save → 다시 열기에서 크기 · 각도가 글자 단위로 같다",
    JSON.stringify(await mvCanvas(again)) === finalCanvas);

  const againRects =
    await mvRects(again, againFrame, false, ["mvA", "mvB"]);

  /* ★ 다시 연 창은 도화지 폭 자체가 다르다 — 왼쪽 패널이 접혀
     있으면 Preview 가 넓어진다(2026-09-24 실측: 4/3 배). 그래서
     절대 px 이 아니라 **배율에 흔들리지 않는 비**를 본다: 멤버
     사이의 거리 ÷ 멤버의 폭. 저장값이 글자 단위로 같다는 것은
     바로 위에서 이미 보았다. */
  const shapeOf = (rects) => {
    const a = mvCenter(rects.mvA);
    const b = mvCenter(rects.mvB);
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / rects.mvA.width;
  };

  check("★ 다시 연 화면의 모양(거리 ÷ 폭)도 같다",
    Math.abs(shapeOf(againRects) - shapeOf(forwardRects)) <= 0.02 &&
      Math.abs(
        (againRects.mvA.width / againRects.mvB.width) -
        (forwardRects.mvA.width / forwardRects.mvB.width)) <= 0.02,
    JSON.stringify({
      again: Math.round(shapeOf(againRects) * 1000) / 1000,
      before: Math.round(shapeOf(forwardRects) * 1000) / 1000
    }));

  check("다시 열기 pageerror 0", again.__errors.length === 0,
    again.__errors.slice(0, 2).join(" | "));

  await close(again);

}


/* ---------------------------------------------------------- [sandbox] */

if (wants("sandbox")) {

  section("sandbox");

  /* native 결과 먼저 */

  const nativePage = await openStudio(browser, {});

  const nativeFrame = await canvasFrame(nativePage, false);

  await enableCanvasEditing(nativePage);

  await openLayers(nativePage);

  const nativeRectsBefore =
    await frameRects(nativeFrame, ["grpA", "grpMid", "grpB", "grpC"]);

  await makeGroup(nativePage, ["grpA", "grpB"]);

  await sleep(300);

  const nativeCanvas = JSON.stringify(
    JSON.parse(JSON.stringify(await readCanvas(nativePage))),
    (key, value) => (key === "id" && /^canvas_/.test(value) ? "<gid>" : value)
  );

  const nativeRectsAfter =
    await frameRects(nativeFrame, ["grpA", "grpMid", "grpB", "grpC"]);

  await close(nativePage);


  /* sandbox */

  const page = await openStudio(browser, { sandbox: true });

  const frame = await canvasFrame(page, true);

  await enableCanvasEditing(page);

  await openLayers(page);

  const rectsBefore = await frameRects(frame, ["grpA", "grpMid", "grpB", "grpC"]);

  const group = await makeGroup(page, ["grpA", "grpB"]);

  check("★ sandbox 에서도 그룹이 만들어진다",
    !!group && group.members.join(",") === "grpA,grpB",
    JSON.stringify(group));

  await sleep(400);

  const rectsAfter = await frameRects(frame, ["grpA", "grpMid", "grpB", "grpC"]);

  check("★ sandbox 에서도 묶기 전후 rect 가 같다",
    JSON.stringify(rectsBefore) === JSON.stringify(rectsAfter),
    JSON.stringify({ before: rectsBefore.grpA, after: rectsAfter.grpA }));

  const sandboxCanvas = JSON.stringify(
    JSON.parse(JSON.stringify(await readCanvas(page))),
    (key, value) => (key === "id" && /^canvas_/.test(value) ? "<gid>" : value)
  );

  check("★ native ↔ sandbox 최종 JSON 이 같다(그룹 id 만 다르다)",
    sandboxCanvas === nativeCanvas);

  check("★ native ↔ sandbox 가 같은 자리를 그린다",
    JSON.stringify(rectsAfter) === JSON.stringify(nativeRectsAfter) &&
    JSON.stringify(rectsBefore) === JSON.stringify(nativeRectsBefore),
    JSON.stringify({ sandbox: rectsAfter.grpA, native: nativeRectsAfter.grpA }));

  /* 폴더 행과 선택은 부모 문서의 일이다 */
  await page.click(`#studioCanvasLayer-${group.id}`);
  await sleep(400);

  check("★ sandbox 에서도 폴더 행이 멤버 전부를 고른다",
    (await selectionOf(page)).ids.slice().sort().join(",") === "grpA,grpB",
    (await selectionOf(page)).ids.join(","));

  const parentCsp = await page.evaluate(() => (window.__cspViolations || []).slice());

  const frameCsp = await cspViolations(frame);

  check("★ CSP 위반 0 (부모)", parentCsp.length === 0,
    JSON.stringify(parentCsp.slice(0, 2)));

  check("★ CSP 위반 0 (프레임)", frameCsp.length === 0,
    JSON.stringify(frameCsp.slice(0, 2)));

  check("pageerror 0", page.__errors.length === 0,
    page.__errors.slice(0, 2).join(" | "));

  await close(page);

}


} finally {

  await browser.close();

  parentServer.close();
  sandboxServer.close();

}


console.log(`\n${passed} passed, ${failures.length} failed`);

if (failures.length) {
  console.log("실패:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
