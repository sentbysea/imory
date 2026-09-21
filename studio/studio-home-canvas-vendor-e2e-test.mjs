/* =========================================================
   HOME CANVAS VENDOR — 고정한 UMD 둘과 지연 로더 (HOME-CANVAS-VENDOR-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §13
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN) §8-1
   보관 규칙: studio/vendor/home-canvas/README.md

   이 라운드는 라이브러리를 Canvas 요소에 **연결하지 않는다.** 그래서
   여기서 재는 것은 셋뿐이다 — 파일이 원본 그대로인가, 로더가 한 번만
   받는가, 그리고 **Spike 가 알아낸 cspNonce 판정이 아직 사실인가.**

   [files]   저장한 두 파일의 크기 · SHA-256 이 README 표와 같고,
             MIT 배너와 라이선스 전문이 살아 있다
   [loader]  요청은 UMD 당 한 번 · 동시 호출은 같은 Promise ·
             ?v=APP_BUILD_VERSION · 두 생성자 · 실패한 파일을 짚는 오류
   [nonce]   **실제 sandbox CSP** 아래 대조군 넷
   [paths]   sandbox origin allowlist — 두 경로만 200, 이웃은 404
   [public]  공개 진입 · 공개 sandbox 프레임 · Studio 를 열기만 했을 때
             vendor 요청 0

   ★ 기존 정적 Canvas Renderer 가 vendor 없이 그대로인지는 여기가
     아니라 skin/skin-home-canvas-render-e2e-test.mjs 와
     skin/skin-home-canvas-sandbox-e2e-test.mjs 가 본다(로드맵 §9).

   ★ [nonce] 하네스는 sandbox origin 이 아니라 **메인 서버**에서
     나간다. 대신 CSP 문자열을 배포되는 그 함수
     (core/lib/skin-sandbox-server.js buildSandboxCsp)로 만들어 붙인다 —
     정책은 실물 그대로이고, 시험용 문서를 운영 allowlist 에 올리지
     않는다. allowlist 자체는 [paths] 가 진짜 origin 에서 잰다.

   실행:
     node studio/studio-home-canvas-vendor-e2e-test.mjs
     node studio/studio-home-canvas-vendor-e2e-test.mjs --only=nonce
========================================================== */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const MAIN_PORT = 8986;
const SANDBOX_PORT = 8987;

const MAIN_ORIGIN = `http://localhost:${MAIN_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const VENDOR_DIR = path.join(ROOT, "studio", "vendor", "home-canvas");
const VENDOR_README = path.join(VENDOR_DIR, "README.md");

const MOVEABLE_PATH = "/studio/vendor/home-canvas/moveable-0.53.0.min.js";
const SELECTO_PATH = "/studio/vendor/home-canvas/selecto-1.26.3.min.js";

/* 시험용 문서 — 저장소 파일이 아니다(서버가 만들어 준다) */
const LOADER_HARNESS = "/__home-canvas-vendor-loader__";
const NONCE_HARNESS = "/__home-canvas-vendor-nonce__";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const wants = (name) => !ONLY || ONLY.split(",").map((n) => n.trim()).includes(name);
const section = (name) => console.log(`\n[${name}]`);

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


/* 배포되는 그 함수 그대로 — CSP 문자열도 allowlist 도 복사해 적지 않는다 */
const middleware = await import(
  pathToFileURL(path.join(ROOT, "functions", "_middleware.js")).href
);

const sandboxServer = await import(
  pathToFileURL(path.join(ROOT, "core", "lib", "skin-sandbox-server.js")).href
);


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
    try { version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0"; } catch { /* 낮게 */ }
    found.push({ entry, version });
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  const tried = [];
  for (const { entry, version } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }
  throw new Error(`playwright ${browserName} 를 실행할 수 없습니다.\n  - ${tried.join("\n  - ") || "없음"}`);
}


/* =========================================================
   서버 — 저장소 파일 + 배포와 같은 Pages Function
   (skin/skin-home-canvas-sandbox-e2e-test.mjs 와 같은 규약)
========================================================== */

const FUNCTION_ENV = {
  SANDBOX_SKIN_HOST: `localhost:${SANDBOX_PORT}`,
  SANDBOX_SKIN_PARENT_ORIGINS: MAIN_ORIGIN
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};


/* ---------------------------------------------------------
   시험용 문서 둘
--------------------------------------------------------- */

const LOADER_HARNESS_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>vendor loader harness</title></head>
<body>
<script src="/core/lib/build-version.js?t=${Date.now()}"><\/script>
<script src="/studio/studio-home-canvas-vendor.js"><\/script>
<\/body><\/html>`;


/* 실제 sandbox CSP 아래에서 두 라이브러리를 세운다.

   대조군은 주소의 mode 하나로 고른다:
     both · moveableOnly · selectoOnly · neither

   ★ 귀속을 무엇으로 판정하는가
     두 라이브러리는 @daybrush 의 styled 로 <style data-styled-id="…">
     를 만들어 붙인다. CSP 가 막아도 **요소는 DOM 에 남고** 그
     styleSheet 만 null 이 된다 — 그래서 "어느 라이브러리의 style 이
     막혔는가"를 셈이 아니라 그 요소 하나하나로 가른다. */
function nonceHarnessHtml(nonce, mode) {

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>vendor nonce harness</title>
<style nonce="${nonce}">
  html, body { margin: 0; }
  #stage { position: relative; width: 420px; height: 320px; }
  .target { position: absolute; width: 90px; height: 70px; background: #ddd; }
  #t1 { left: 30px; top: 30px; }
  #t2 { left: 230px; top: 180px; }
</style></head>
<body>
<div id="stage"><div class="target" id="t1"></div><div class="target" id="t2"></div></div>

<script nonce="${nonce}">
  window.__mode = ${JSON.stringify(mode)};
  window.__nonce = ${JSON.stringify(nonce)};
  window.__violations = [];
  document.addEventListener(
    "securitypolicyviolation",
    function (e) {
      var t = e.target;
      window.__violations.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blockedURI: e.blockedURI,
        tag: t && t.tagName ? t.tagName : null,
        styledId: (t && t.getAttribute) ? t.getAttribute("data-styled-id") : null
      });
    }
  );
<\/script>

<script src="/core/lib/build-version.js?t=${Date.now()}"><\/script>
<script src="/studio/studio-home-canvas-vendor.js"><\/script>

<script nonce="${nonce}">
  function styledSnapshot() {
    return Array.prototype.map.call(
      document.querySelectorAll("style[data-styled-id]"),
      function (el) {
        return {
          id: el.getAttribute("data-styled-id"),
          applied: !!el.sheet,
          text: (el.textContent || "").slice(0, 4000)
        };
      }
    );
  }

  window.__ready = ensureHomeCanvasEditorVendors().then(function (v) {

    var mode = window.__mode;
    var n = window.__nonce;

    var before = styledSnapshot().length;

    window.__moveable = new v.Moveable(
      document.getElementById("stage"),
      {
        target: document.getElementById("t1"),
        draggable: true,
        resizable: true,
        rotatable: true,
        cspNonce: (mode === "both" || mode === "moveableOnly") ? n : ""
      }
    );

    var afterMoveable = styledSnapshot();

    window.__selecto = new v.Selecto({
      container: document.getElementById("stage"),
      rootContainer: document.body,
      selectableTargets: [".target"],
      selectByClick: true,
      selectFromInside: true,
      cspNonce: (mode === "both" || mode === "selectoOnly") ? n : ""
    });

    var afterSelecto = styledSnapshot();

    /* 두 구간에서 새로 생긴 style 을 각 라이브러리에 귀속시킨다 */
    window.__styled = {
      moveable: afterMoveable.slice(before),
      selecto: afterSelecto.slice(afterMoveable.length),
      all: afterSelecto
    };

    window.__moveable.on("drag", function (e) {
      e.target.style.transform = e.transform;
    });

    return true;

  }).catch(function (err) {
    window.__loadError = String(err && err.message || err);
    return false;
  });
<\/script>
<\/body><\/html>`;

}


function syntheticResponse(url) {

  if (url.pathname === LOADER_HARNESS) {
    return new Response(LOADER_HARNESS_HTML, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  if (url.pathname === NONCE_HARNESS) {

    const nonce = sandboxServer.createSandboxNonce();

    /* ★ 배포되는 그 CSP 를 그대로 만든다 — 문자열을 여기에 옮겨
       적으면 운영 정책이 바뀌어도 이 테스트는 옛 정책을 계속
       통과시킨다. */
    const csp = sandboxServer.buildSandboxCsp(
      nonce,
      sandboxServer.resolveSandboxServerConfig(FUNCTION_ENV)
    );

    return new Response(
      nonceHarnessHtml(nonce, url.searchParams.get("mode") || "both"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": csp
        }
      }
    );

  }

  return null;

}


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
        "Cache-Control": "no-store"
      }
    });
  }

  /* _redirects 의 SPA fallback: /* /index.html 200 */
  return new Response(fs.readFileSync(path.join(ROOT, "index.html")), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });

}


function startServer(port) {

  const httpServer = http.createServer(async (req, res) => {

    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url, `http://${host}`);

    let response;

    try {

      const synthetic = syntheticResponse(url);

      if (synthetic && port === MAIN_PORT) {

        /* 시험용 문서는 Pages Function 을 거치지 않는다 —
           메인 origin 에는 아무 헤더도 붙지 않기 때문이다. */
        response = synthetic;

      } else {

        response = await middleware.onRequest({
          request: new Request(url.toString(), { method: req.method }),
          env: FUNCTION_ENV,
          next: async () => staticResponse(url.pathname, url.search)
        });

      }

    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(err && err.stack || err));
      return;
    }

    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });

    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);

  });

  return new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer)));

}


/* =========================================================
   [files] — 저장한 바이트가 원본 그대로인가
========================================================== */

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");


/* README 의 표를 **읽어서** 대조한다 — 기대값을 테스트에 또 적으면
   두 곳이 어긋나도 둘 다 초록이 된다. */
function readmeRows() {

  const text = fs.readFileSync(VENDOR_README, "utf8");
  const rows = new Map();

  text.split(/\r?\n/).forEach((line) => {

    if (line.indexOf("|") !== 0) return;

    const cells = line.split("|").map((c) => c.trim());
    const nameCell = cells[1] || "";
    const hit = nameCell.match(/`([^`]+)`/);
    if (!hit) return;

    const bytesCell = cells.find((c) => /^[\d,]+$/.test(c));
    const hashCell = (cells.find((c) => /^`[0-9a-f]{64}`$/.test(c)) || "").replace(/`/g, "");
    if (!bytesCell || !hashCell) return;

    rows.set(hit[1], {
      bytes: Number(bytesCell.replace(/,/g, "")),
      sha256: hashCell
    });

  });

  return rows;

}


function runFilesSection() {

  section("files");

  const rows = readmeRows();

  const expected = [
    "moveable-0.53.0.min.js",
    "selecto-1.26.3.min.js",
    "licenses/moveable-MIT.txt",
    "licenses/selecto-MIT.txt"
  ];

  check("[files] README 표가 네 파일을 전부 적는다",
    expected.every((rel) => rows.has(rel)),
    `적힌 것: ${[...rows.keys()].join(", ") || "없음"}`);

  expected.forEach((rel) => {

    const abs = path.join(VENDOR_DIR, rel);
    const row = rows.get(rel);

    if (!fs.existsSync(abs) || !row) {
      check(`[files] ${rel} 가 저장돼 있고 README 에 행이 있다`, false);
      return;
    }

    const buf = fs.readFileSync(abs);

    check(`[files] ${rel} 의 크기가 README 와 같다`,
      buf.length === row.bytes,
      `실제 ${buf.length} · README ${row.bytes}`);

    check(`[files] ${rel} 의 SHA-256 이 README 와 같다`,
      sha256(buf) === row.sha256,
      sha256(buf).slice(0, 16) + "…");

    check(`[files] ${rel} 에 CRLF 가 없다(바이트 그대로)`,
      buf.indexOf("\r\n") === -1,
      "core.autocrlf=true 환경 — .gitattributes 가 -text 로 막는다");

  });

  /* 재가공하지 않았다는 증거 — 원본 배너 */
  [
    ["moveable-0.53.0.min.js", "moveable", "0.53.0", "2019 Daybrush"],
    ["selecto-1.26.3.min.js", "selecto", "1.26.3", "2020 Daybrush"]
  ].forEach(([rel, name, version, copyright]) => {

    const head = fs.readFileSync(path.join(VENDOR_DIR, rel), "utf8").slice(0, 400);

    check(`[files] ${rel} 의 원본 MIT 배너가 살아 있다`,
      head.includes(copyright) &&
      head.includes(`name: ${name}`) &&
      head.includes("license: MIT") &&
      head.includes(`version: ${version}`),
      "첫 줄 저작권 · 이름 · 라이선스 · 버전");

  });

  [
    ["licenses/moveable-MIT.txt", "2019 Daybrush"],
    ["licenses/selecto-MIT.txt", "2020 Daybrush"]
  ].forEach(([rel, copyright]) => {

    const text = fs.readFileSync(path.join(VENDOR_DIR, rel), "utf8");

    check(`[files] ${rel} 가 MIT 전문이다`,
      text.startsWith("MIT License") &&
      text.includes(copyright) &&
      text.includes("WITHOUT WARRANTY OF ANY KIND"));

  });

  /* 넣지 않기로 한 것들 */
  const stored = fs.readdirSync(VENDOR_DIR).sort();

  check("[files] .map · ESM · package.json 을 넣지 않았다",
    !stored.some((n) => /\.map$/.test(n) || /esm/.test(n) || n === "package.json"),
    stored.join(" · "));

  check("[files] UMD 둘 · 라이선스 폴더 · README · .gitattributes 뿐이다",
    stored.join(",") === [
      ".gitattributes", "README.md", "licenses",
      "moveable-0.53.0.min.js", "selecto-1.26.3.min.js"
    ].join(","),
    stored.join(" · "));

  const attrs = fs.readFileSync(path.join(VENDOR_DIR, ".gitattributes"), "utf8");

  check("[files] .gitattributes 가 줄끝 변환을 막는다",
    /\*\.min\.js\s+-text/.test(attrs) && /licenses\/\*\.txt\s+-text/.test(attrs),
    "없으면 fresh clone 의 바이트가 달라져 위 해시가 틀어진다");

  /* UMD 전역 이름은 추측이 아니라 파일에서 읽은 값이다 */
  [
    ["moveable-0.53.0.min.js", "Moveable"],
    ["selecto-1.26.3.min.js", "Selecto"]
  ].forEach(([rel, global]) => {

    const text = fs.readFileSync(path.join(VENDOR_DIR, rel), "utf8");

    check(`[files] ${rel} 의 UMD 전역이 ${global} 이다`,
      new RegExp(`self\\)\\.${global}=`).test(text),
      "로더가 이 이름으로 확인한다");

  });

}


/* =========================================================
   페이지 헬퍼
========================================================== */

function watchVendorRequests(page) {

  const seen = [];

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/studio/vendor/home-canvas/")) seen.push(url);
  });

  return seen;

}


function watchConsoleErrors(page) {

  const seen = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") seen.push(msg.text());
  });
  page.on("pageerror", (err) => seen.push(String(err && err.message || err)));

  return seen;

}


/* =========================================================
   [loader]
========================================================== */

async function runLoaderSection(browser) {

  section("loader");

  const buildVersion =
    (fs.readFileSync(path.join(ROOT, "core", "lib", "build-version.js"), "utf8")
      .match(/APP_BUILD_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "";

  check("[loader] APP_BUILD_VERSION 을 읽었다", !!buildVersion, buildVersion);

  /* --- 1) 문서를 열기만 해서는 UMD 를 받지 않는다 --------- */
  {
    const page = await browser.newPage();
    const vendorReqs = watchVendorRequests(page);
    await page.goto(MAIN_ORIGIN + LOADER_HARNESS, { waitUntil: "networkidle" });

    check("[loader] 로더를 읽기만 하면 vendor 요청 0",
      vendorReqs.length === 0,
      vendorReqs.join(" · ") || "요청 없음");

    check("[loader] 전역 두 개가 준비돼 있다",
      await page.evaluate(() =>
        typeof window.ensureHomeCanvasEditorVendors === "function" &&
        typeof window.homeCanvasVendorManifest === "function"));

    check("[loader] manifest 가 버전 고정 경로를 적는다",
      JSON.stringify(
        (await page.evaluate(() => window.homeCanvasVendorManifest()))
          .map((e) => [e.key, e.version, e.path])
      ) === JSON.stringify([
        ["Moveable", "0.53.0", MOVEABLE_PATH],
        ["Selecto", "1.26.3", SELECTO_PATH]
      ]));

    /* --- 2) 동시 호출이 같은 Promise · 요청은 UMD 당 한 번 --- */
    const same = await page.evaluate(() => {
      const a = window.ensureHomeCanvasEditorVendors();
      const b = window.ensureHomeCanvasEditorVendors();
      window.__first = a;
      return a === b;
    });

    check("[loader] 동시 호출이 같은 Promise 를 돌려준다", same === true);

    const result = await page.evaluate(async () => {
      const v = await window.ensureHomeCanvasEditorVendors();
      return {
        moveable: typeof v.Moveable,
        selecto: typeof v.Selecto,
        globalMoveable: typeof window.Moveable,
        globalSelecto: typeof window.Selecto
      };
    });

    check("[loader] 두 constructor 를 돌려준다",
      result.moveable === "function" && result.selecto === "function",
      `Moveable=${result.moveable} · Selecto=${result.selecto}`);

    check("[loader] UMD 전역도 그 이름으로 생겼다",
      result.globalMoveable === "function" && result.globalSelecto === "function");

    check("[loader] 요청이 UMD 당 정확히 한 번",
      vendorReqs.length === 2,
      vendorReqs.length + "건");

    check("[loader] 주소에 ?v=APP_BUILD_VERSION 이 붙는다",
      vendorReqs.every((u) => u.includes(`?v=${encodeURIComponent(buildVersion)}`)),
      vendorReqs.map((u) => u.replace(MAIN_ORIGIN, "")).join(" · "));

    check("[loader] 받은 주소가 고정한 두 경로뿐이다",
      vendorReqs.every((u) =>
        u.startsWith(MAIN_ORIGIN + MOVEABLE_PATH + "?") ||
        u.startsWith(MAIN_ORIGIN + SELECTO_PATH + "?")));

    /* --- 3) 세 번 더 불러도 새 요청 0 ---------------------- */
    const again = await page.evaluate(async () => {
      const a = window.ensureHomeCanvasEditorVendors();
      await window.ensureHomeCanvasEditorVendors();
      await window.ensureHomeCanvasEditorVendors();
      return a === window.__first;
    });

    check("[loader] 다시 불러도 같은 Promise 이고 새 요청 0",
      again === true && vendorReqs.length === 2,
      vendorReqs.length + "건");

    /* --- 4) 로더가 <script> 둘만 만들었다 ------------------ */
    check("[loader] 문서에 고정 URL vendor <script> 가 없다",
      await page.evaluate(() =>
        Array.prototype.filter.call(
          document.querySelectorAll("script[src]"),
          (s) => s.getAttribute("src").includes("/studio/vendor/home-canvas/")
        ).every((s) => s.getAttribute("src").includes("?v="))));

    await page.close();
  }

  /* --- 5) 실패한 파일을 짚는 오류 ------------------------- */
  for (const [label, blocked] of [
    ["Moveable", MOVEABLE_PATH],
    ["Selecto", SELECTO_PATH]
  ]) {

    const page = await browser.newPage();
    await page.route("**" + blocked + "*", (route) => route.abort());
    await page.goto(MAIN_ORIGIN + LOADER_HARNESS, { waitUntil: "networkidle" });

    const message = await page.evaluate(async () => {
      try {
        await window.ensureHomeCanvasEditorVendors();
        return null;
      } catch (err) {
        return String(err && err.message || err);
      }
    });

    check(`[loader] ${label} 가 안 오면 그 파일을 짚는 오류로 거절한다`,
      typeof message === "string" && message.includes(blocked),
      message ? message.slice(0, 120) : "거절하지 않았다");

    /* 실패는 표에 남기지 않는다 — 다시 시도할 수 있어야 한다 */
    const retried = await page.evaluate(async () => {
      try {
        const v = await window.ensureHomeCanvasEditorVendors();
        return typeof v.Moveable === "function" && typeof v.Selecto === "function";
      } catch (err) {
        return "again: " + String(err && err.message || err);
      }
    });

    check(`[loader] ${label} 실패 뒤에도 다시 시도할 수 있다`,
      retried === "again: " + message || retried === true,
      typeof retried === "string" ? retried.slice(0, 90) : "성공");

    await page.close();

  }

}


/* =========================================================
   [nonce] — Spike 판정의 회귀 고정
========================================================== */

const NONCE_MODES = [
  {
    mode: "both",
    moveableNonce: true,
    selectoNonce: true,
    expect: "위반 0 · Moveable 핸들 정상 · Selecto 영역 정상"
  },
  {
    mode: "moveableOnly",
    moveableNonce: true,
    selectoNonce: false,
    expect: "Selecto 귀속 위반 1"
  },
  {
    mode: "selectoOnly",
    moveableNonce: false,
    selectoNonce: true,
    expect: "Moveable 귀속 위반 1 · 핸들 붕괴"
  },
  {
    mode: "neither",
    moveableNonce: false,
    selectoNonce: false,
    expect: "두 라이브러리 귀속 위반"
  }
];


async function runNonceSection(browser) {

  section("nonce");

  /* 정책이 실물인지 먼저 못박는다 */
  const probe = await fetch(MAIN_ORIGIN + NONCE_HARNESS + "?mode=both");
  const csp = probe.headers.get("content-security-policy") || "";

  check("[nonce] 하네스가 실제 sandbox CSP 로 나간다",
    /style-src 'self' 'nonce-[A-Za-z0-9_-]+'/.test(csp) &&
    !csp.includes("unsafe-inline") &&
    !csp.includes("unsafe-eval"),
    csp.split("; ").find((d) => d.startsWith("style-src")));

  for (const spec of NONCE_MODES) {

    const page = await browser.newPage();
    const consoleErrors = watchConsoleErrors(page);

    await page.goto(
      MAIN_ORIGIN + NONCE_HARNESS + "?mode=" + spec.mode,
      { waitUntil: "networkidle" }
    );

    const ok = await page.evaluate(() => window.__ready);

    check(`[nonce/${spec.mode}] 두 UMD 가 로드되고 인스턴스가 섰다`,
      ok === true,
      await page.evaluate(() => window.__loadError || "") || undefined);

    const report = await page.evaluate(() => {

      const control = document.querySelector(".moveable-control");
      const controlRect = control ? control.getBoundingClientRect() : null;

      const area = document.querySelector(".selecto-selection");
      const areaStyle = area ? getComputedStyle(area) : null;

      return {
        violations: window.__violations,
        styled: window.__styled,
        hasControl: !!control,
        controlWidth: controlRect ? controlRect.width : null,
        controlHeight: controlRect ? controlRect.height : null,
        hasArea: !!area,
        areaPosition: areaStyle ? areaStyle.position : null,
        areaBorder: areaStyle ? areaStyle.borderTopWidth : null,
        areaBackground: areaStyle ? areaStyle.backgroundColor : null
      };

    });

    const styleViolations =
      report.violations.filter((v) => String(v.directive).startsWith("style-src"));

    const moveableApplied =
      report.styled.moveable.length > 0 &&
      report.styled.moveable.every((s) => s.applied);

    const selectoApplied =
      report.styled.selecto.length > 0 &&
      report.styled.selecto.every((s) => s.applied);

    check(`[nonce/${spec.mode}] Moveable 의 style 적용 = ${spec.moveableNonce}`,
      moveableApplied === spec.moveableNonce,
      report.styled.moveable.map((s) => `${s.id}:${s.applied}`).join(" · ") || "style 없음");

    check(`[nonce/${spec.mode}] Selecto 의 style 적용 = ${spec.selectoNonce}`,
      selectoApplied === spec.selectoNonce,
      report.styled.selecto.map((s) => `${s.id}:${s.applied}`).join(" · ") || "style 없음");

    /* 몇 건인지보다 **어느 라이브러리가 막혔는지**가 계약이다 */
    const blockedLibs = [
      spec.moveableNonce ? null : "Moveable",
      spec.selectoNonce ? null : "Selecto"
    ].filter(Boolean);

    check(`[nonce/${spec.mode}] style-src 위반 수 = 막힌 라이브러리 수(${blockedLibs.length})`,
      styleViolations.length === blockedLibs.length,
      `${styleViolations.length}건 · 기대 ${spec.expect}`);

    if (spec.mode === "both") {

      check("[nonce/both] ★ securitypolicyviolation 0건",
        report.violations.length === 0,
        JSON.stringify(report.violations).slice(0, 160));

      check("[nonce/both] ★ 콘솔 CSP 오류 0건",
        consoleErrors.filter((t) => /Content Security Policy|CSP/i.test(t)).length === 0,
        consoleErrors.slice(0, 2).join(" | ") || "오류 없음");

      check("[nonce/both] ★ Moveable 핸들의 실제 크기가 0 이 아니다",
        report.hasControl &&
        report.controlWidth > 0 &&
        report.controlHeight > 0,
        `${report.controlWidth}×${report.controlHeight}`);

      check("[nonce/both] ★ Selecto 선택 영역에 position·border·background 적용",
        report.hasArea &&
        report.areaPosition === "fixed" &&
        report.areaBorder !== "0px" &&
        report.areaBackground !== "rgba(0, 0, 0, 0)",
        `${report.areaPosition} · ${report.areaBorder} · ${report.areaBackground}`);

      /* 드래그 가능한 최소 동작 */
      const box = await page.locator("#t1").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
      await page.mouse.up();

      const moved = await page.locator("#t1").boundingBox();

      check("[nonce/both] ★ 드래그 가능한 최소 동작이 남아 있다",
        Math.abs((moved.x - box.x) - 60) <= 2 &&
        Math.abs((moved.y - box.y) - 40) <= 2,
        `Δ ${Math.round(moved.x - box.x)} · ${Math.round(moved.y - box.y)} (기대 60 · 40)`);

    }

    if (spec.mode === "selectoOnly") {

      check("[nonce/selectoOnly] ★ Moveable 핸들이 붕괴한다(크기 0)",
        !report.hasControl || report.controlHeight === 0,
        report.hasControl
          ? `${report.controlWidth}×${report.controlHeight}`
          : "핸들 요소 없음");

    }

    await page.close();

  }

  console.log(
    "  NOTE  Moveable 0.53.0 의 cspNonce 는 작동하지만 **deprecated** 다 " +
    "(react-moveable 0.56.0 types.d.ts 의 @deprecated). 버전을 올리면 " +
    "조용히 사라질 수 있어 이 절이 버전 고정을 지킨다."
  );

}


/* =========================================================
   [paths] — sandbox origin allowlist
========================================================== */

async function runPathsSection() {

  section("paths");

  const get = async (origin, p) => {
    const res = await fetch(origin + p);
    const body = await res.text();
    return {
      status: res.status,
      type: res.headers.get("content-type") || "",
      body
    };
  };

  const isJs = (r) => /javascript|ecmascript/i.test(r.type);
  const isSpaHtml = (r) => /<html/i.test(r.body.slice(0, 500));

  for (const [label, p, banner] of [
    ["moveable", MOVEABLE_PATH, "name: moveable"],
    ["selecto", SELECTO_PATH, "name: selecto"]
  ]) {

    const plain = await get(SANDBOX_ORIGIN, p);

    check(`[paths] ${label} 가 sandbox origin 에서 200`,
      plain.status === 200, String(plain.status));

    check(`[paths] ${label} 의 Content-Type 이 JavaScript`,
      isJs(plain), plain.type);

    check(`[paths] ${label} 가 SPA fallback HTML 이 아니다`,
      !isSpaHtml(plain) && plain.body.includes(banner),
      "원본 배너 확인");

    const versioned = await get(SANDBOX_ORIGIN, p + "?v=2026-01-01-1");

    check(`[paths] ${label} 는 ?v= 가 붙어도 같다`,
      versioned.status === 200 &&
      isJs(versioned) &&
      versioned.body.length === plain.body.length,
      "allowlist 는 pathname 만 본다");

    const onMain = await get(MAIN_ORIGIN, p);

    check(`[paths] ${label} 는 메인 origin 에서도 그대로 200 JS`,
      onMain.status === 200 && isJs(onMain) && !isSpaHtml(onMain),
      "Studio 가 읽는 주소 — 회귀 0");

  }

  /* =======================================================
     HOME-CANVAS-SELECT-1B-1 — 로더가 allowlist 에 올라왔다.

     VENDOR-1 에서는 "부르는 곳이 없다"가 사실이었으므로 이 경로가
     404 인 것을 여기서 못박았다. 이제 프레임 안 runtime 이 이
     파일 하나를 실제로 부르므로(계약 §15) **열려야** 하고, 그
     사실을 같은 자리에서 다시 못박는다 — 늘어난 것은 정확히 이
     한 파일이지 /studio/ 디렉터리가 아니다.
  ======================================================= */

  const LOADER_PATH =
    "/studio/studio-home-canvas-vendor.js";

  {
    const res = await get(SANDBOX_ORIGIN, LOADER_PATH);

    check("[paths] ★ 로더 한 파일은 sandbox origin 에서 200 JS",
      res.status === 200 && isJs(res) && !isSpaHtml(res),
      `${res.status} ${res.type}`);
  }

  /* 이웃 경로는 열리지 않는다 */
  for (const [label, p] of [
    ["잘못된 버전", "/studio/vendor/home-canvas/moveable-0.53.1.min.js"],
    ["같은 폴더의 README", "/studio/vendor/home-canvas/README.md"],
    ["라이선스 파일", "/studio/vendor/home-canvas/licenses/moveable-MIT.txt"],
    ["다른 Studio 파일", "/studio/studio-preview.js"],
    ["Studio Inspector", "/studio/inspector/studio-canvas-selection.js"],
    ["vendor 디렉터리", "/studio/vendor/home-canvas/"]
  ]) {

    const res = await get(SANDBOX_ORIGIN, p);

    check(`[paths] ★ ${label} 은 sandbox origin 에서 404`,
      res.status === 404,
      `${res.status} ${res.type}`);

  }

  check("[paths] allowlist 판정 함수도 vendor 둘 + 로더 하나만 통과시킨다",
    sandboxServer.isSandboxAllowedPath(MOVEABLE_PATH) === true &&
    sandboxServer.isSandboxAllowedPath(SELECTO_PATH) === true &&
    sandboxServer.isSandboxAllowedPath(LOADER_PATH) === true &&
    sandboxServer.isSandboxAllowedPath("/studio/studio-preview.js") === false &&
    sandboxServer.isSandboxAllowedPath("/studio/vendor/home-canvas/README.md") === false,
    "늘어난 것은 로더 한 파일뿐이고 나머지 Studio 는 계속 404 다");

}


/* =========================================================
   [public] — 공개 화면의 전송 비용 증가 0
========================================================== */

async function runPublicSection(browser) {

  section("public");

  const cases = [
    ["공개 진입(index.html)", MAIN_ORIGIN + "/", false],
    ["공개 sandbox 프레임", SANDBOX_ORIGIN + "/skin/sandbox/frame", false],
    ["Studio 를 열기만 함", MAIN_ORIGIN + "/studio/studio-lifecycle-scenario.html?scenario=lay", true]
  ];

  for (const [label, url, expectLoader] of cases) {

    const page = await browser.newPage();
    const vendorReqs = watchVendorRequests(page);

    const loaderReqs = [];
    page.on("request", (req) => {
      if (req.url().includes("/studio/studio-home-canvas-vendor.js")) {
        loaderReqs.push(req.url());
      }
    });

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    check(`[public] ${label} — vendor UMD 요청 0`,
      vendorReqs.length === 0,
      vendorReqs.map((u) => u.replace(/^https?:\/\/[^/]+/, "")).join(" · ") || "요청 없음");

    if (expectLoader) {

      /* 시험 문서는 ?v= 없이 읽는다(진입 문서가 아니다 — 거기서는
         loadVersionedScripts 가 붙인다. 바로 아래에서 확인한다). */
      check("[public] Studio 는 로더 한 파일만 읽는다",
        loaderReqs.length === 1,
        loaderReqs.join(" · ") || "로더를 안 읽었다");

      check("[public] Studio 에서 전역이 준비돼 있다(부르지는 않았다)",
        await page.evaluate(() =>
          typeof window.ensureHomeCanvasEditorVendors === "function" &&
          typeof window.Moveable === "undefined" &&
          typeof window.Selecto === "undefined"));

    }

    await page.close();

  }

  /* --- 진입 문서는 loadVersionedScripts 로 읽어야 한다 ---- */
  {
    const entry = fs.readFileSync(path.join(ROOT, "studio", "index.html"), "utf8");

    check("[public] studio/index.html 이 로더를 loadVersionedScripts 로 읽는다",
      entry.includes('"./studio-home-canvas-vendor.js"'),
      "?v=APP_BUILD_VERSION 이 붙는 유일한 길이다(CLAUDE.md §4)");

    check("[public] ★ 어떤 HTML 에도 고정 URL vendor <script> 가 없다",
      [
        "index.html",
        "studio/index.html",
        "studio/studio-lifecycle-scenario.html",
        "studio/preview/preview-frame.html",
        "skin/sandbox/frame.html"
      ].every((rel) =>
        !fs.readFileSync(path.join(ROOT, rel), "utf8")
          .includes("vendor/home-canvas/")),
      "UMD 둘은 로더를 부른 뒤에만 온다");
  }

}


/* =========================================================
   실행
========================================================== */

const servers = [];

try {

  if (wants("files")) runFilesSection();

  const needsBrowser =
    wants("loader") || wants("nonce") || wants("public");

  if (needsBrowser || wants("paths")) {
    servers.push(await startServer(MAIN_PORT));
    servers.push(await startServer(SANDBOX_PORT));
  }

  if (wants("paths")) await runPathsSection();

  if (needsBrowser) {

    const playwright = await loadPlaywright(BROWSER);
    const browser = await playwright[BROWSER].launch();

    try {
      if (wants("loader")) await runLoaderSection(browser);
      if (wants("nonce")) await runNonceSection(browser);
      if (wants("public")) await runPublicSection(browser);
    } finally {
      await browser.close();
    }

  }

} finally {

  servers.forEach((s) => s.close());

}

console.log(`\n통과 ${passed} · 실패 ${failures.length}`);

if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
