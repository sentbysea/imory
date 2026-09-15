/* =========================================================
   SKIN SANDBOX — E2E (SANDBOX-0: 빈 프레임 + origin 격리)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §E SANDBOX-0 / §D-4

   무엇을 보는가
   -------------
   "별도 origin의 iframe과 postMessage 왕복이 실제 환경에서
   가능한가"를 실제 브라우저로 판정한다.

     [host]      메인 origin에서 frame.html이 404인가
                 sandbox origin에서 앱이 뜨지 않는가
                 예상하지 않은 Host 헤더가 거부되는가
     [csp]       실제 응답 헤더의 CSP 전문과 nonce
     [flag]      플래그 OFF면 iframe이 아예 생기지 않는가
     [ready]     READY -> ACK 왕복
     [reject]    위조 origin / 다른 source / 알 수 없는 type
     [isolate]   parent DOM · parent localStorage · fetch
     [mobile]    390px 가로 넘침
     [regress]   메인 origin의 기존 응답이 그대로인가

   ★ 두 origin을 어떻게 만드는가
   포트가 다르면 origin이 다르다(같은 localhost라도). 부모는 8957,
   frame은 8958이다. 두 서버 모두 요청을 **배포되는 그 Pages
   Function**(functions/_middleware.js)에 그대로 통과시킨다 —
   호스트 분기와 CSP가 테스트용 복제본이 아니라 실물이어야
   "메인 origin에서 frame.html이 404"가 보안 장치로서 의미가 있다.

   실행
     node skin/sandbox/skin-sandbox-e2e-test.mjs
     node skin/sandbox/skin-sandbox-e2e-test.mjs --browser=webkit
     node skin/sandbox/skin-sandbox-e2e-test.mjs --only=host
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const PARENT_PORT = 8957;
const SANDBOX_PORT = 8958;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const HARNESS_PATH = "/skin/skin-sandbox-test.html";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const shouldRun = (name) => !ONLY || ONLY === name;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}


/* =========================================================
   배포되는 그 함수 그대로
========================================================== */

const middleware = await import(
  pathToFileURL(path.join(ROOT, "functions", "_middleware.js")).href
);


/* =========================================================
   playwright 찾기 — 다른 e2e와 같은 전략
========================================================== */

async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(
    process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx"
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
  if (process.env.IMORY_PLAYWRIGHT_MODULES) {
    candidates.push(process.env.IMORY_PLAYWRIGHT_MODULES);
  }

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
    } catch {
      /* 다음 후보 */
    }
  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다. ` +
    `\`npx playwright install ${browserName}\`을 먼저 실행하세요.`
  );
}


/* =========================================================
   서버 — 저장소 파일 + 배포와 같은 Pages Function

   env는 배포에서 Cloudflare 대시보드가 주는 값을 흉내낸다.
   로컬에서는 hostname이 같으므로(localhost) 포트까지 포함한
   host로 sandbox origin을 지정한다 — classifyImoryHost()가
   url.host(host:port)를 보는 이유다.
========================================================== */

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
  ".png": "image/png",
  ".svg": "image/svg+xml"
};


/*
  "같은 origin의 다른 window"를 만들기 위한 테스트 전용 문서.
  공격자가 sandbox origin(또는 메인 origin)에 자기 문서를 하나
  올려 둔 상황을 대신한다 — allowlist 바깥이므로 middleware보다
  먼저 가로챈다(실제 배포에는 이런 문서가 없다).
*/

const PROBE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body><script>
  window.parent.postMessage(
    { imory: 1, type: "IMORY_FRAME_READY", seq: 1, payload: { contract: 1 } },
    "${PARENT_ORIGIN}"
  );
<\/script></body></html>`;


function staticResponse(pathname) {

  let rel = decodeURIComponent(pathname);
  if (rel.endsWith("/")) rel += "index.html";

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
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"));
  return new Response(indexHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
}


function startServer(port) {

  const server = http.createServer(async (req, res) => {

    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url, `http://${host}`);

    if (url.pathname === "/__probe") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(PROBE_HTML);
      return;
    }

    let response;

    try {
      response = await middleware.onRequest({
        request: new Request(url.toString(), { method: req.method }),
        env: FUNCTION_ENV,
        next: async () => staticResponse(url.pathname)
      });
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

  return new Promise(resolve => server.listen(port, () => resolve(server)));
}


/* =========================================================
   raw HTTP — Host 헤더를 직접 조작해서 재 본다
========================================================== */

function rawRequest(port, pathname, hostHeader, method = "GET") {

  return new Promise((resolve, reject) => {

    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method,
        /*
          기본 Host 는 브라우저가 보내는 것과 같게 맞춘다. 127.0.0.1로
          접속하더라도 Host 헤더가 origin 판정의 근거이기 때문이다 —
          Host 헤더를 갈아 끼우는 절이 바로 아래에 있다.
        */
        headers: { Host: hostHeader || `localhost:${port}` }
      },
      (res) => {
        let body = "";
        res.on("data", chunk => { body += chunk; });
        res.on("end", () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body
        }));
      }
    );

    req.on("error", reject);
    req.end();

  });

}


/* =========================================================
   [host] 호스트 분기 — 실제 응답으로 판정
========================================================== */

async function runHost() {

  console.log("\n[host] 호스트 분기 (실제 Pages Function)");

  const frameOnSandbox =
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame.html");

  check("[host] sandbox origin 의 frame.html 이 200",
    frameOnSandbox.status === 200,
    String(frameOnSandbox.status));

  check("[host] 그 응답이 SANDBOX FRAME 문서다",
    frameOnSandbox.body.includes("sandboxFrameRoot"));


  const frameOnMain =
    await rawRequest(PARENT_PORT, "/skin/sandbox/frame.html");

  check("[host] ★ 메인 origin 의 /skin/sandbox/frame.html 이 404",
    frameOnMain.status === 404,
    `${frameOnMain.status} (이 분기가 없으면 SPA fallback 때문에 200 index.html 이다 — 2026-09-15 실측)`);


  const appOnSandbox =
    await rawRequest(SANDBOX_PORT, "/");

  check("[host] ★ sandbox origin 의 / 가 404 (앱이 안 뜬다)",
    appOnSandbox.status === 404,
    String(appOnSandbox.status));

  const indexOnSandbox =
    await rawRequest(SANDBOX_PORT, "/index.html");

  check("[host] ★ sandbox origin 의 /index.html 도 404",
    indexOnSandbox.status === 404,
    String(indexOnSandbox.status));

  const supabaseOnSandbox =
    await rawRequest(SANDBOX_PORT, "/core/lib/supabase-client.js");

  check("[host] ★ sandbox origin 에서 supabase client 를 받을 수 없다",
    supabaseOnSandbox.status === 404,
    String(supabaseOnSandbox.status));

  const renderOnSandbox =
    await rawRequest(SANDBOX_PORT, "/skin/skin-render.js");

  check("[host] sandbox origin 에서 skin-render.js 도 아직 404 (SANDBOX-1 범위)",
    renderOnSandbox.status === 404,
    String(renderOnSandbox.status));


  const configOnSandbox =
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/skin-sandbox-config.js");

  check("[host] frame 이 쓰는 스크립트는 sandbox origin 에서 200",
    configOnSandbox.status === 200,
    String(configOnSandbox.status));

  check("[host] 그 자산에 nosniff 가 붙는다",
    (configOnSandbox.headers["x-content-type-options"] || "") === "nosniff");


  const configOnMain =
    await rawRequest(PARENT_PORT, "/skin/sandbox/skin-sandbox-config.js");

  check("[host] 부모(메인 origin)는 같은 스크립트를 계속 받는다",
    configOnMain.status === 200,
    "frame.html 만 막고 디렉터리 전체를 막지 않는다");


  const postToFrame =
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame.html", null, "POST");

  check("[host] sandbox origin 은 GET/HEAD 외 메서드를 거부한다",
    postToFrame.status === 404,
    String(postToFrame.status));


  const unknownHost =
    await rawRequest(PARENT_PORT, "/", "evil.example");

  check("[host] ★ 예상하지 않은 Host 헤더를 거부한다",
    unknownHost.status === 404,
    `Host: evil.example -> ${unknownHost.status}`);

  const unknownSubdomain =
    await rawRequest(PARENT_PORT, "/", "alice--skin.imory.me");

  check("[host] ★ 아직 설정되지 않은 slug 서브도메인도 거부한다",
    unknownSubdomain.status === 404,
    `-> ${unknownSubdomain.status}`);

}


/* =========================================================
   [csp] 실제 응답 헤더
========================================================== */

async function runCsp() {

  console.log("\n[csp] frame 문서의 CSP (실제 응답 헤더)");

  const first =
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame.html");

  const csp =
    first.headers["content-security-policy"] || "";

  console.log("\n  --- CSP 전문 ---");
  csp.split("; ").forEach(d => console.log("    " + d));
  console.log("  ----------------\n");

  const has = (d) => csp.split("; ").indexOf(d) !== -1;

  check("[csp] 헤더가 실제로 붙는다", csp.length > 0);
  check("[csp] default-src 'none'", has("default-src 'none'"));
  check("[csp] connect-src 'none'", has("connect-src 'none'"));
  check("[csp] object-src 'none'", has("object-src 'none'"));
  check("[csp] base-uri 'none'", has("base-uri 'none'"));
  check("[csp] form-action 'none'", has("form-action 'none'"));
  check("[csp] frame-ancestors 가 부모 origin 하나",
    has(`frame-ancestors ${PARENT_ORIGIN}`), csp);
  check("[csp] script-src 에 unsafe-inline / unsafe-eval 이 없다",
    csp.indexOf("unsafe-inline") === -1 && csp.indexOf("unsafe-eval") === -1);

  const nonceMatch =
    csp.match(/'nonce-([A-Za-z0-9_-]+)'/);

  check("[csp] nonce 가 헤더에 있다", Boolean(nonceMatch));

  check("[csp] 같은 nonce 가 문서의 인라인 블록에 들어갔다",
    Boolean(nonceMatch) &&
    first.body.includes(`<script nonce="${nonceMatch[1]}">`) &&
    first.body.includes(`<style nonce="${nonceMatch[1]}">`));

  check("[csp] frame 문서는 캐시되지 않는다 (nonce 가 매번 바뀐다)",
    (first.headers["cache-control"] || "").includes("no-store"),
    first.headers["cache-control"]);

  const second =
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame.html");

  const secondNonce =
    (second.headers["content-security-policy"] || "").match(/'nonce-([A-Za-z0-9_-]+)'/);

  check("[csp] 요청마다 nonce 가 다르다",
    Boolean(secondNonce) && secondNonce[1] !== nonceMatch[1]);

}


/* =========================================================
   브라우저 쪽
========================================================== */

let playwright;

async function openHarness(browser, query, viewport) {

  const ctx = await browser.newContext({
    viewport: viewport || { width: 900, height: 800 }
  });

  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(
    PARENT_ORIGIN + HARNESS_PATH + (query || ""),
    { waitUntil: "load" }
  );

  /* 하네스가 mount 를 끝낼 때까지 */
  await page.waitForFunction(
    () => window.__sandboxHarnessResult !== undefined,
    null,
    { timeout: 15000 }
  );

  return { ctx, page, consoleErrors };

}


const ON_QUERY =
  `?sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(SANDBOX_ORIGIN)}`;


/* =========================================================
   [flag] 플래그 OFF — iframe이 아예 생기지 않는다
========================================================== */

async function runFlag(browser) {

  console.log("\n[flag] 기능 플래그");

  const off = await openHarness(browser, "");

  check("[flag] ★ 기본(쿼리 없음)에서 mount 가 폴백한다",
    (await off.page.evaluate(() => window.__sandboxHarnessResult.reason)) === "disabled");

  check("[flag] ★ 문서에 iframe 이 하나도 없다",
    (await off.page.locator("iframe").count()) === 0);

  await off.ctx.close();


  const noOrigin = await openHarness(browser, "?sandboxSkin=1");

  check("[flag] 플래그만 켜고 frame origin 이 없으면 폴백한다",
    (await noOrigin.page.evaluate(() => window.__sandboxHarnessResult.reason)) === "no-origin");

  check("[flag] 그때도 iframe 이 생기지 않는다",
    (await noOrigin.page.locator("iframe").count()) === 0);

  await noOrigin.ctx.close();


  const sameOrigin = await openHarness(
    browser,
    `?sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(PARENT_ORIGIN)}`
  );

  check("[flag] ★ frame origin 이 부모와 같으면 만들지 않는다",
    (await sameOrigin.page.evaluate(() => window.__sandboxHarnessResult.reason)) === "no-origin",
    "same-origin + allow-same-origin 조합을 만들지 않는다");

  await sameOrigin.ctx.close();

}


/* =========================================================
   [ready] READY -> ACK 왕복
========================================================== */

async function runReady(browser) {

  console.log("\n[ready] READY -> ACK 왕복");

  const { ctx, page, consoleErrors } = await openHarness(browser, ON_QUERY);

  check("[ready] mount 가 성공했다",
    (await page.evaluate(() => window.__sandboxHarnessResult.ok)) === true,
    await page.evaluate(() => window.__sandboxHarnessResult.reason || ""));

  const iframe = page.locator("iframe.imory-skin-sandbox-frame");

  check("[ready] iframe 이 하나 생겼다",
    (await iframe.count()) === 1);

  check("[ready] ★ sandbox 속성이 allow-scripts allow-same-origin 둘뿐이다",
    (await iframe.getAttribute("sandbox")) === "allow-scripts allow-same-origin",
    String(await iframe.getAttribute("sandbox")));

  const sandboxAttr = (await iframe.getAttribute("sandbox")) || "";

  check("[ready] ★ allow-top-navigation / allow-popups / allow-forms / allow-modals 없음",
    !/allow-top-navigation|allow-popups|allow-forms|allow-modals|allow-downloads/.test(sandboxAttr));

  check("[ready] referrerpolicy=no-referrer",
    (await iframe.getAttribute("referrerpolicy")) === "no-referrer");

  check("[ready] scrolling=no (이중 스크롤 금지)",
    (await iframe.getAttribute("scrolling")) === "no");

  check("[ready] iframe src 가 sandbox origin 이다",
    ((await iframe.getAttribute("src")) || "").startsWith(SANDBOX_ORIGIN),
    String(await iframe.getAttribute("src")));

  check("[ready] iframe src 에 배포 버전이 붙는다",
    ((await iframe.getAttribute("src")) || "").includes("?v="),
    String(await iframe.getAttribute("src")));


  const frame =
    page.frames().find(f => f.url().startsWith(SANDBOX_ORIGIN));

  check("[ready] 프레임 문서가 로드됐다", Boolean(frame));

  const rootText =
    await frame.locator("#sandboxFrameRoot").textContent();

  check("[ready] ★ 화면에 SANDBOX FRAME READY 만 보인다",
    rootText.trim() === "SANDBOX FRAME READY",
    JSON.stringify(rootText));

  await frame.waitForFunction(
    () => document.getElementById("sandboxFrameRoot")
      .getAttribute("data-imory-ack") === "1",
    null,
    { timeout: 5000 }
  );

  check("[ready] ★ ACK 가 프레임에 도착했다 (왕복 성립)", true);

  check("[ready] CSP 위반 콘솔 오류가 없다",
    !consoleErrors.some(t => /Content Security Policy/i.test(t)),
    consoleErrors.filter(t => /Content Security Policy/i.test(t)).join(" | "));

  return { ctx, page, frame };

}


/* =========================================================
   [reject] 검증에 걸리는 메시지들
========================================================== */

async function runReject(browser) {

  console.log("\n[reject] 메시지 거부");

  const { ctx, page, frame } = await runReady(browser);


  /* --- 부모 쪽 --------------------------------------------- */

  await page.evaluate(() => { window.__sandboxHarnessErrors.length = 0; });

  /*
    ① 같은 origin(sandbox origin)의 **다른 window**. 공격자가
       sandbox origin에 문서 하나를 올려 둔 상황을 대신한다.
       origin은 통과하고 source에서 걸려야 한다.
  */

  await page.evaluate((origin) => {
    const probe = document.createElement("iframe");
    probe.id = "probeFrame";
    probe.src = origin + "/__probe";
    document.body.appendChild(probe);
  }, SANDBOX_ORIGIN);

  await page.waitForFunction(
    () => window.__sandboxHarnessErrors.length > 0,
    null,
    { timeout: 5000 }
  ).catch(() => {});

  const afterProbe =
    await page.evaluate(() => window.__sandboxHarnessErrors.slice());

  check("[reject] ★ 같은 origin 이지만 다른 source 는 거부된다",
    afterProbe.includes("bad-source"),
    afterProbe.join(", ") || "(아무 메시지도 안 옴)");


  /* ② 부모 origin(다른 origin)에서 온 READY */

  await page.evaluate(() => { window.__sandboxHarnessErrors.length = 0; });

  await page.evaluate(() => {
    const probe = document.createElement("iframe");
    probe.id = "sameOriginProbe";
    probe.src = "/__probe";
    document.body.appendChild(probe);
  });

  await page.waitForFunction(
    () => window.__sandboxHarnessErrors.length > 0,
    null,
    { timeout: 5000 }
  ).catch(() => {});

  const afterSameOrigin =
    await page.evaluate(() => window.__sandboxHarnessErrors.slice());

  check("[reject] ★ 위조 origin(부모 자신) 의 메시지는 거부된다",
    afterSameOrigin.includes("bad-origin"),
    afterSameOrigin.join(", ") || "(아무 메시지도 안 옴)");


  /* ③ 진짜 프레임이 보낸, 알 수 없는 type */

  await page.evaluate(() => { window.__sandboxHarnessErrors.length = 0; });

  await frame.evaluate((parentOrigin) => {
    window.parent.postMessage(
      { imory: 1, type: "IMORY_EVAL", seq: 2, payload: { contract: 1 } },
      parentOrigin
    );
  }, PARENT_ORIGIN);

  await page.waitForFunction(
    () => window.__sandboxHarnessErrors.length > 0,
    null,
    { timeout: 5000 }
  ).catch(() => {});

  check("[reject] ★ 알 수 없는 message type 은 거부된다",
    (await page.evaluate(() => window.__sandboxHarnessErrors.slice()))
      .includes("unknown-type"));


  /* ④ 진짜 프레임이 보낸, payload 에 모르는 키 */

  await page.evaluate(() => { window.__sandboxHarnessErrors.length = 0; });

  await frame.evaluate((parentOrigin) => {
    window.parent.postMessage(
      {
        imory: 1, type: "IMORY_FRAME_READY", seq: 3,
        payload: { contract: 1, html: "<img onerror=1>" }
      },
      parentOrigin
    );
  }, PARENT_ORIGIN);

  await page.waitForFunction(
    () => window.__sandboxHarnessErrors.length > 0,
    null,
    { timeout: 5000 }
  ).catch(() => {});

  check("[reject] ★ 모르는 payload 키가 있으면 거부된다",
    (await page.evaluate(() => window.__sandboxHarnessErrors.slice()))
      .includes("unknown-payload-key"));


  /* --- 프레임 쪽 ------------------------------------------- */

  const before =
    await frame.evaluate(() => window.__imorySandboxRejected || 0);

  await page.evaluate(() => {
    const f = document.querySelector("iframe.imory-skin-sandbox-frame");
    f.contentWindow.postMessage(
      { imory: 1, type: "IMORY_EVAL", seq: 9, payload: { contract: 1 } },
      new URL(f.src).origin
    );
  });

  await frame.waitForFunction(
    (n) => (window.__imorySandboxRejected || 0) > n,
    before,
    { timeout: 5000 }
  ).catch(() => {});

  check("[reject] 프레임도 알 수 없는 type 을 거부한다",
    (await frame.evaluate(() => window.__imorySandboxLastReason)) === "unknown-type",
    String(await frame.evaluate(() => window.__imorySandboxLastReason)));

  check("[reject] 거부해도 화면 문구는 그대로다 (프로빙 신호 없음)",
    (await frame.locator("#sandboxFrameRoot").textContent()).trim()
      === "SANDBOX FRAME READY");

  await ctx.close();

}


/* =========================================================
   [isolate] 격리 — 프레임이 못 하는 것들
========================================================== */

async function runIsolate(browser) {

  console.log("\n[isolate] 격리");

  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await ctx.newPage();

  /* 부모 origin 에 Imory 세션처럼 생긴 키를 심어 둔다 */
  await page.goto(PARENT_ORIGIN + HARNESS_PATH, { waitUntil: "load" });
  await page.evaluate(() => {
    localStorage.setItem(
      "sb-vtwcuvouyipohfonfukj-auth-token",
      JSON.stringify({ access_token: "SECRET-SESSION-TOKEN" })
    );
  });

  await page.goto(PARENT_ORIGIN + HARNESS_PATH + ON_QUERY, { waitUntil: "load" });
  await page.waitForFunction(() => window.__sandboxHarnessResult !== undefined,
    null, { timeout: 15000 });

  const frame =
    page.frames().find(f => f.url().startsWith(SANDBOX_ORIGIN));

  check("[isolate] 프레임이 떴다", Boolean(frame));


  const parentDom =
    await frame.evaluate(() => {
      try {
        const n = window.parent.document.body.childElementCount;
        return "READ:" + n;
      } catch (err) {
        return "THREW:" + (err && err.name);
      }
    });

  check("[isolate] ★ 프레임에서 parent DOM 접근이 막힌다",
    parentDom.startsWith("THREW:"),
    parentDom);


  const parentStorage =
    await frame.evaluate(() => {
      try {
        return "READ:" + String(window.parent.localStorage.length);
      } catch (err) {
        return "THREW:" + (err && err.name);
      }
    });

  check("[isolate] ★ 프레임에서 parent localStorage 접근이 막힌다",
    parentStorage.startsWith("THREW:"),
    parentStorage);


  const ownStorage =
    await frame.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        keys.push(localStorage.key(i));
      }
      return keys;
    });

  check("[isolate] ★ 프레임 자신의 localStorage 에 Imory 세션이 없다",
    ownStorage.length === 0,
    JSON.stringify(ownStorage));


  const fetchResult =
    await frame.evaluate(async (origin) => {
      try {
        await fetch(origin + "/skin/sandbox/skin-sandbox-config.js");
        return "OK";
      } catch (err) {
        return "THREW:" + (err && err.name);
      }
    }, SANDBOX_ORIGIN);

  check("[isolate] ★ 프레임 안에서 fetch() 가 CSP 로 막힌다",
    fetchResult.startsWith("THREW:"),
    fetchResult);


  const supabaseGlobals =
    await frame.evaluate(() => ({
      supabase: typeof window.supabase,
      client: typeof window.supabaseClient,
      renderSkin: typeof window.renderSkin
    }));

  check("[isolate] ★ 프레임에 supabase 전역이 없다",
    supabaseGlobals.supabase === "undefined" &&
    supabaseGlobals.client === "undefined",
    JSON.stringify(supabaseGlobals));

  await ctx.close();

}


/* =========================================================
   [mobile] 390px
========================================================== */

async function runMobile(browser) {

  console.log("\n[mobile] 390px");

  const { ctx, page } = await openHarness(
    browser, ON_QUERY, { width: 390, height: 780 }
  );

  const overflow =
    await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );

  check("[mobile] 부모 문서에 가로 넘침이 없다", overflow <= 0, String(overflow));

  const box =
    await page.locator("iframe.imory-skin-sandbox-frame").boundingBox();

  check("[mobile] iframe 이 390px 를 넘지 않는다",
    Boolean(box) && box.width <= 390, box ? String(box.width) : "(없음)");

  const frame =
    page.frames().find(f => f.url().startsWith(SANDBOX_ORIGIN));

  const frameOverflow =
    await frame.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );

  check("[mobile] 프레임 문서에도 가로 넘침이 없다",
    frameOverflow <= 0, String(frameOverflow));

  await ctx.close();

}


/* =========================================================
   [regress] 메인 origin 의 기존 응답이 그대로인가
========================================================== */

async function runRegress() {

  console.log("\n[regress] 메인 origin 회귀");

  const index = await rawRequest(PARENT_PORT, "/index.html");

  check("[regress] /index.html 이 그대로 200 HTML",
    index.status === 200 &&
    (index.headers["content-type"] || "").includes("text/html"),
    String(index.status));

  const spa = await rawRequest(PARENT_PORT, "/someslug/post/123");

  check("[regress] SPA fallback 경로가 그대로 200 HTML",
    spa.status === 200 &&
    (spa.headers["content-type"] || "").includes("text/html"),
    String(spa.status));

  const render = await rawRequest(PARENT_PORT, "/skin/skin-render.js");

  check("[regress] 기존 스킨 자산이 그대로 200",
    render.status === 200, String(render.status));

  check("[regress] 그 응답에 sandbox CSP 가 붙지 않는다",
    !render.headers["content-security-policy"]);

  const homeCss = await rawRequest(PARENT_PORT, "/home/home-base.css");

  check("[regress] 공개 홈 CSS 도 그대로 200",
    homeCss.status === 200, String(homeCss.status));


  /*
    ★ 실제 서비스 진입 문서들. 호스트 분기가 이것들을 건드리면
    사용자가 로그인도 초대도 관리도 못 한다 — 가장 먼저 깨지는
    자리이므로 경로별로 따로 잰다.
  */

  const entryDocuments = [
    ["메인 홈", "/"],
    ["사용자 홈(slug)", "/someslug"],
    ["사용자 카테고리", "/someslug/category/12"],
    ["관리 화면", "/admin/"],
    ["관리 화면 문서", "/admin/index.html"],
    ["로그인", "/auth/"],
    ["초대", "/invite/"],
    ["Studio", "/studio/"],
    ["Studio Preview 문서", "/studio/preview/preview-frame.html"]
  ];

  for (const [label, pathname] of entryDocuments) {

    const res = await rawRequest(PARENT_PORT, pathname);

    check(`[regress] ★ ${label} (${pathname}) 이 200 HTML`,
      res.status === 200 &&
      (res.headers["content-type"] || "").includes("text/html"),
      `${res.status} ${res.headers["content-type"] || ""}`);

    check(`[regress] ${label} 응답에 sandbox CSP 가 붙지 않는다`,
      !res.headers["content-security-policy"]);

  }


  /*
    사용자의 실제 구성: IMORY_EXTRA_HOSTS 없이 커스텀 도메인 둘.
    그 구성 그대로 메인이 살아 있는지 본다.
  */

  const withUserEnv =
    await rawRequest(PARENT_PORT, "/", "imory.me");

  check("[regress] ★ Host: imory.me 로 들어와도 200 (프로덕션 Host 그대로)",
    withUserEnv.status === 200, String(withUserEnv.status));

  const frameOnRealMain =
    await rawRequest(PARENT_PORT, "/skin/sandbox/frame.html", "imory.me");

  check("[regress] ★ Host: imory.me 의 frame.html 은 404",
    frameOnRealMain.status === 404, String(frameOnRealMain.status));

  const sandboxRealHost =
    await rawRequest(PARENT_PORT, "/skin/sandbox/frame.html", "skin-frame.imory.me");

  check("[regress] Host: skin-frame.imory.me 는 sandbox 로 분기한다",
    sandboxRealHost.status === 404,
    `${sandboxRealHost.status} — 이 서버의 env 는 localhost:${SANDBOX_PORT} 라 ` +
    `프로덕션 호스트는 unknown 이다(배포에서는 env 가 그 호스트를 가리킨다)`);

}


/* =========================================================
   [env] 배포 환경변수 그대로 — 메인이 죽을 수 있는가

   위 [regress] 는 이 테스트 서버의 env(로컬 포트)로 돈다.
   여기서는 **실제 배포에 들어간 값**과 그 오설정 변형들을
   미들웨어에 직접 먹여, 어떤 경우에도 imory.me 가 살아 있는지 본다.
========================================================== */

async function runEnv() {

  console.log("\n[env] 배포 환경변수 / 오설정");

  const staticHtml = fs.readFileSync(path.join(ROOT, "index.html"));

  const call = async (hostname, pathname, env) =>
    middleware.onRequest({
      request: new Request(`https://${hostname}${pathname}`, { method: "GET" }),
      env,
      next: async () => new Response(staticHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
    });

  /* 사용자가 실제로 넣은 값 */
  const DEPLOYED_ENV = {
    SANDBOX_SKIN_HOST: "skin-frame.imory.me",
    SANDBOX_SKIN_PARENT_ORIGINS: "https://imory.me"
  };

  const deployedMain = await call("imory.me", "/", DEPLOYED_ENV);

  check("[env] 배포 env 로 imory.me / 가 200",
    deployedMain.status === 200, String(deployedMain.status));

  const deployedFrameOnMain =
    await call("imory.me", "/skin/sandbox/frame.html", DEPLOYED_ENV);

  check("[env] 배포 env 로 imory.me 의 frame.html 이 404",
    deployedFrameOnMain.status === 404, String(deployedFrameOnMain.status));

  const deployedFrame =
    await call("skin-frame.imory.me", "/skin/sandbox/frame.html", DEPLOYED_ENV);

  check("[env] 배포 env 로 skin-frame.imory.me 의 frame.html 이 200 + CSP",
    deployedFrame.status === 200 &&
    Boolean(deployedFrame.headers.get("content-security-policy")),
    String(deployedFrame.status));

  check("[env] 그 CSP 의 frame-ancestors 가 https://imory.me",
    (deployedFrame.headers.get("content-security-policy") || "")
      .includes("frame-ancestors https://imory.me"));

  const deployedSandboxRoot =
    await call("skin-frame.imory.me", "/", DEPLOYED_ENV);

  check("[env] 배포 env 로 skin-frame.imory.me / 가 404",
    deployedSandboxRoot.status === 404, String(deployedSandboxRoot.status));


  /* --- 오설정 변형: 어떤 경우에도 메인은 200 --------------- */

  const badEnvs = [
    ["환경변수 전부 누락", {}],
    ["env 자체가 없음", undefined],
    ["빈 문자열", { SANDBOX_SKIN_HOST: "" }],
    ["공백만", { SANDBOX_SKIN_HOST: "   " }],
    ["오타난 호스트", { SANDBOX_SKIN_HOST: "skinframe.imory.me" }],
    ["★ 메인 호스트를 잘못 넣음", { SANDBOX_SKIN_HOST: "imory.me" }],
    ["★ 대문자 메인 호스트", { SANDBOX_SKIN_HOST: "IMORY.ME" }],
    ["부모 origin 만 누락", { SANDBOX_SKIN_HOST: "skin-frame.imory.me" }]
  ];

  for (const [label, env] of badEnvs) {

    const res = await call("imory.me", "/", env);

    check(`[env] ★ ${label} — imory.me 가 여전히 200`,
      res.status === 200, String(res.status));

  }

  for (const [label, env] of badEnvs) {

    const res = await call("imory.me", "/admin/index.html", env);

    check(`[env] ${label} — /admin/ 도 여전히 200`,
      res.status === 200, String(res.status));

  }

}


/* =========================================================
   RUN
========================================================== */

(async () => {

  playwright = await loadPlaywright(BROWSER);

  const parentServer = await startServer(PARENT_PORT);
  const sandboxServer = await startServer(SANDBOX_PORT);

  console.log(
    `SKIN SANDBOX E2E (SANDBOX-0) — ${BROWSER}\n` +
    `  parent : ${PARENT_ORIGIN}\n` +
    `  frame  : ${SANDBOX_ORIGIN}`
  );

  const browser = await playwright[BROWSER].launch();

  try {

    if (shouldRun("host")) await runHost();
    if (shouldRun("csp")) await runCsp();
    if (shouldRun("flag")) await runFlag(browser);

    if (shouldRun("ready")) {
      const r = await runReady(browser);
      await r.ctx.close();
    }

    if (shouldRun("reject")) await runReject(browser);
    if (shouldRun("isolate")) await runIsolate(browser);
    if (shouldRun("mobile")) await runMobile(browser);
    if (shouldRun("regress")) await runRegress();
    if (shouldRun("env")) await runEnv();

  } catch (err) {
    console.error("\n실행 중 오류:", err);
    failed += 1;
  } finally {
    await browser.close();
    parentServer.close();
    sandboxServer.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) console.log("실패:\n  - " + failures.join("\n  - "));
  process.exit(failed ? 1 : 0);

})();
