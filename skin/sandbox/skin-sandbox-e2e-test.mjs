/* =========================================================
   SKIN SANDBOX — E2E (SANDBOX-0 격리 + SANDBOX-1 HOME 렌더)

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
     [isolate]   parent DOM · parent localStorage · fetch · supabase 전역
     [mobile]    390px 가로 넘침
     [regress]   메인 origin의 기존 응답이 그대로인가

   SANDBOX-1에서 더해진 것
     [render]    READY -> ACK -> RENDER_HOME -> RENDERED 왕복,
                 native 렌더와 **같은 innerHTML 구조**,
                 HOME의 공개 데이터(제목·프로필·카테고리·최근 글·
                 발췌 카드)가 실제로 프레임에 그려지는가
     [payload]   wire 위의 data에 금지 필드가 하나도 없는가
                 (프레임 realm에서 도착한 값을 직접 읽는다)
     [height]    콘텐츠 길이에 iframe 높이가 따라오는가,
                 프레임 안에 스크롤 막대가 없는가
     [fallback]  renderMode 없음 / origin 없음 / READY timeout
     [home]      **진짜 index.html** 로 공개 HOME 경로를 탄다 —
                 renderMode 없음/플래그 OFF 는 오늘과 같고,
                 sandbox 는 #themeMount 안 cross-origin iframe 이며,
                 프레임이 안 뜨면 같은 스킨을 native 로 그린다
     [package]   Import -> Export -> Import 왕복에서 renderMode 보존,
                 모르는 renderMode는 reason:"render-mode"로 거부

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
     node skin/sandbox/skin-sandbox-e2e-test.mjs --only=render
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


/* =========================================================
   staticResponse — Cloudflare Pages의 정적 서빙을 흉내낸다

   ★ HTML URL handling (2026-09-15 배포 실측)
   Pages는 `/foo.html` 요청을 **308로 `/foo`에 리다이렉트**한다:

     GET https://imory.me/admin/index.html -> 308, Location: /admin/

   처음에는 이 테스트 서버가 `.html` 파일을 그대로 200으로 줬고,
   그래서 "frame 문서만 배포에서 404"를 로컬에서 못 잡았다
   (handleSandboxHost가 308을 404로 접고 있었다). 배포 동작을
   흉내내야 그 계열의 버그가 로컬에서 잡힌다.
========================================================== */

function staticResponse(pathname, search) {

  let rel = decodeURIComponent(pathname);


  /*
    /foo/index.html -> 308 /foo/   ·   /foo.html -> 308 /foo
    질의 문자열은 **그대로 옮겨진다** — 실측:
      GET /admin/index.html?cb=1789460368
        -> 308, Location: /admin/?cb=1789460368
    (이걸 빼먹으면 ?sandboxSkin=1 같은 플래그가 리다이렉트에서
     증발해서, 실제로는 나지 않는 실패가 테스트에서만 난다.)
  */

  const query =
    search || "";

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

  /* 확장자 없는 주소로 오면 .html 파일을 찾아 준다(Pages와 같다) */

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
        next: async () => staticResponse(url.pathname, url.search)
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

/*
  Pages가 `.html` 주소를 308로 보내므로, 상태만 재는 절에서는
  리다이렉트를 한 번 따라가 준다(브라우저·크롤러가 하는 대로).
  `follow: false`를 주면 리다이렉트 그 자체를 본다.
*/

async function rawRequestFollow(port, pathname, hostHeader, method = "GET") {

  const first =
    await rawRequest(port, pathname, hostHeader, method);

  if (first.status < 300 || first.status >= 400 || !first.headers.location) {
    return first;
  }

  const next =
    await rawRequest(port, first.headers.location, hostHeader, method);

  return { ...next, redirectedFrom: first.status };

}


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
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame");

  check("[host] sandbox origin 의 frame 문서가 200",
    frameOnSandbox.status === 200,
    String(frameOnSandbox.status));

  check("[host] 그 응답이 SANDBOX FRAME 문서다",
    frameOnSandbox.body.includes("sandboxFrameRoot"));


  /*
    ★ Pages의 HTML URL handling. `.html` 주소는 308로 정본 주소에
    보내지고, 따라가면 200이 나와야 한다. 배포 1차에서 이 308을
    404로 접는 바람에 프레임만 안 열렸다.
  */

  const frameHtmlOnSandbox =
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame.html");

  check("[host] ★ .html 주소는 308로 정본 주소에 보낸다 (404로 접지 않는다)",
    frameHtmlOnSandbox.status === 308 &&
    frameHtmlOnSandbox.headers.location === "/skin/sandbox/frame",
    `${frameHtmlOnSandbox.status} -> ${frameHtmlOnSandbox.headers.location || "(없음)"}`);

  const frameHtmlFollowed =
    await rawRequestFollow(SANDBOX_PORT, "/skin/sandbox/frame.html");

  check("[host] 그 308을 따라가면 프레임 문서가 나온다",
    frameHtmlFollowed.status === 200 &&
    frameHtmlFollowed.body.includes("sandboxFrameRoot"));


  const frameOnMain =
    await rawRequestFollow(PARENT_PORT, "/skin/sandbox/frame.html");

  check("[host] ★ 메인 origin 의 /skin/sandbox/frame.html 이 404",
    frameOnMain.status === 404,
    `${frameOnMain.status} (이 분기가 없으면 SPA fallback 때문에 200 index.html 이다 — 2026-09-15 실측)`);

  const frameCanonicalOnMain =
    await rawRequestFollow(PARENT_PORT, "/skin/sandbox/frame");

  check("[host] ★ 메인 origin 의 확장자 없는 /skin/sandbox/frame 도 404",
    frameCanonicalOnMain.status === 404,
    `${frameCanonicalOnMain.status} — 한쪽만 막으면 그쪽으로 프레임이 부모 origin 에 열린다`);


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

  /*
    ★ SANDBOX-1에서 바뀐 곳. SANDBOX-0에서는 이 경로가 404였다
    (그때는 빈 프레임이라 렌더러가 필요 없었다). 지금은 공개 화면과
    **같은 렌더러**를 프레임 안에서 쓰므로 200이어야 한다.
    대신 바로 아래에서 앱/인증/Studio/다른 skin 파일이 여전히
    404라는 것을 확인한다 — allowlist가 느슨해진 것이 아니라
    정확히 렌더러 사슬만 늘어난 것이다.
  */

  const renderOnSandbox =
    await rawRequest(SANDBOX_PORT, "/skin/skin-render.js");

  check("[host] ★ SANDBOX-1: sandbox origin 에서 렌더러는 200",
    renderOnSandbox.status === 200,
    String(renderOnSandbox.status));

  for (const allowed of [
    "/skin/skin-css-validate.js",
    "/skin/skin-sanitize.js",
    "/core/content-width.js",
    "/core/content-width.css"
  ]) {

    const res = await rawRequest(SANDBOX_PORT, allowed);

    check(`[host] 렌더러가 끌어오는 ${allowed} 도 200`,
      res.status === 200, String(res.status));

  }

  for (const denied of [
    "/skin/skin-home.js",
    "/skin/skin-context.js",
    "/skin/skin-template.js",
    "/skin/skin-link-nav.js",
    "/studio/studio-preview.js",
    "/admin/admin.js",
    "/auth/",
    "/skin/test-skins/imory-sandbox-home-v1.json"
  ]) {

    const res = await rawRequestFollow(SANDBOX_PORT, denied);

    check(`[host] ★ sandbox origin 에서 ${denied} 는 여전히 404`,
      res.status === 404, String(res.status));

  }


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
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame", null, "POST");

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
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame");

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
  check("[csp] ★ script-src 에 unsafe-inline / unsafe-eval 이 없다",
    csp.indexOf("unsafe-inline") === -1 && csp.indexOf("unsafe-eval") === -1);


  /* =====================================================
     SANDBOX-1에서 넓어진 세 칸. 실제 응답 헤더로 확인한다 —
     buildSandboxCsp()를 다시 부르는 것이 아니라 **배포되는 그
     함수가 실제로 내보낸 헤더**를 본다.
  ====================================================== */

  const scriptSrc =
    csp.split("; ").find(d => d.indexOf("script-src ") === 0) || "";

  check("[csp] ★ script-src 의 바깥 출처는 CSS 파서 파일 하나뿐이다",
    (scriptSrc.match(/https?:\/\//g) || []).length === 1 &&
    scriptSrc.indexOf("@eslint/css-tree@") !== -1 &&
    scriptSrc.endsWith(".js"),
    scriptSrc);

  const imgSrc =
    csp.split("; ").find(d => d.indexOf("img-src ") === 0) || "";

  check("[csp] ★ img-src 가 https: 전체를 열지 않는다",
    imgSrc.indexOf("https:") !== imgSrc.length - "https:".length &&
    !/(^|\s)https:(\s|$)/.test(imgSrc) &&
    imgSrc.indexOf("data:") !== -1,
    imgSrc);

  const fontSrc =
    csp.split("; ").find(d => d.indexOf("font-src ") === 0) || "";

  check("[csp] ★ font-src 도 https: 전체를 열지 않는다",
    !/(^|\s)https:(\s|$)/.test(fontSrc), fontSrc);

  check("[csp] ★ style-src 는 self + nonce (unsafe-inline 아님)",
    /style-src 'self' 'nonce-[A-Za-z0-9_-]+'/.test(csp), csp);

  const nonceMatch =
    csp.match(/'nonce-([A-Za-z0-9_-]+)'/);

  check("[csp] nonce 가 헤더에 있다", Boolean(nonceMatch));

  check("[csp] 같은 nonce 가 문서의 인라인 블록에 들어갔다",
    Boolean(nonceMatch) &&
    first.body.includes(`<script nonce="${nonceMatch[1]}">`) &&
    first.body.includes(`<style nonce="${nonceMatch[1]}">`));

  /*
    import map은 문서에 글자로 적혀 있지 않다 — document.write로
    만들어진다. 그 태그가 nonce를 받는지는 런타임에서만 보인다:
    못 받으면 CSP가 막고, 그러면 정적 import가 ?v= 없이 나가거나
    아예 실패해서 [render] 절이 통째로 실패한다.
  */

  check("[csp] 문서에 importmap 이 글자로 적혀 있지 않다 (런타임 생성)",
    first.body.indexOf("type=\"importmap\"") === -1);

  check("[csp] frame 문서는 캐시되지 않는다 (nonce 가 매번 바뀐다)",
    (first.headers["cache-control"] || "").includes("no-store"),
    first.headers["cache-control"]);

  const second =
    await rawRequest(SANDBOX_PORT, "/skin/sandbox/frame");

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

  /*
    ★ SANDBOX-1에서 바뀐 곳. SANDBOX-0의 프레임은 진단 문구
    ("SANDBOX FRAME READY")를 화면에 찍었다. 이제 그 자리는 스킨이
    그려질 **렌더 컨테이너**라 처음에는 비어 있어야 한다 —
    렌더 전에 사용자에게 보일 문구가 있으면 그것이 스킨 위에
    깜빡인다. 준비 상태는 텍스트가 아니라 속성으로 남긴다.
  */

  await frame.waitForFunction(
    () => document.getElementById("sandboxFrameRoot")
      .getAttribute("data-imory-sandbox-state") !== null,
    null,
    { timeout: 5000 }
  );

  check("[ready] ★ 렌더 컨테이너는 상태 속성으로만 말한다 (문구 없음)",
    ["ready", "rendered"].indexOf(
      await frame.evaluate(
        () => document.getElementById("sandboxFrameRoot")
          .getAttribute("data-imory-sandbox-state")
      )
    ) !== -1);

  check("[ready] 오류 문구는 숨어 있다",
    (await frame.evaluate(
      () => document.getElementById("sandboxFrameNotice")
        .getAttribute("data-visible")
    )) === null);

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

  check("[reject] 거부해도 화면이 그대로다 (프로빙 신호 없음)",
    (await frame.evaluate(
      () => document.getElementById("sandboxFrameRoot")
        .getAttribute("data-imory-sandbox-state")
    )) === "rendered" &&
    (await frame.evaluate(
      () => document.getElementById("sandboxFrameNotice")
        .getAttribute("data-visible")
    )) === null);

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

  const index = await rawRequestFollow(PARENT_PORT, "/index.html");

  check("[regress] /index.html 이 그대로 200 HTML",
    index.status === 200 &&
    (index.headers["content-type"] || "").includes("text/html"),
    String(index.status));

  const spa = await rawRequestFollow(PARENT_PORT, "/someslug/post/123");

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

    /*
      Pages는 `.html` 주소를 308로 확장자 없는 주소에 보낸다.
      사용자가 보는 것은 그 끝의 문서이므로 따라가서 잰다.
    */

    const res = await rawRequestFollow(PARENT_PORT, pathname);

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
    await call("imory.me", "/skin/sandbox/frame", DEPLOYED_ENV);

  check("[env] 배포 env 로 imory.me 의 frame 문서가 404",
    deployedFrameOnMain.status === 404, String(deployedFrameOnMain.status));

  const deployedFrame =
    await call("skin-frame.imory.me", "/skin/sandbox/frame", DEPLOYED_ENV);

  check("[env] 배포 env 로 skin-frame.imory.me 의 frame 문서가 200 + CSP",
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
   SANDBOX-1 — HOME 렌더

   [render]   READY -> ACK -> RENDER_HOME -> RENDERED 왕복과
              그 결과가 native 렌더와 같은 구조인가
   [payload]  실제로 건너간 data 에 금지 필드가 없는가
   [height]   콘텐츠 길이에 iframe 높이가 따라오는가
   [fallback] 폴백 세 경우
   [package]  renderMode 의 Import/Export 왕복
========================================================== */

const RENDER_QUERY =
  ON_QUERY + "&native=1";


/* 프레임 안에 스킨이 실제로 그려질 때까지 */

async function waitForSandboxRender(page) {

  const frame =
    page.frames().find(f => f.url().startsWith(SANDBOX_ORIGIN));

  if (!frame) {
    return null;
  }

  await frame.waitForFunction(
    () => document.getElementById("sandboxFrameRoot")
      .getAttribute("data-imory-sandbox-state") === "rendered",
    null,
    { timeout: 15000 }
  );

  return frame;

}


/*
  비교용 정규화 — 두 화면이 **설계상** 다르게 찍는 것만 지운다.

    · imory-skin-root-i<N>  인스턴스 scope class
      renderSkin() 호출마다 올라가는 번호다. 같은 문서에 두 스킨이
      동시에 떠도 CSS 가 서로 덮지 않게 하는 장치라(skin-render.js),
      두 화면에서 같을 수가 없다.
    · keyframes namespace i<N>-  같은 이유.
    · <style nonce="">  sandbox 프레임의 style 요소만 nonce 를 받는다
      (CSP style-src 가 nonce 만 허용하므로). 브라우저는 nonce 속성의
      **값을 감추므로** 직렬화하면 빈 문자열로 남는다 — 그래서 속성
      자체를 지운다. 실제로 nonce 가 들어갔는지는 아래에서 IDL 값으로
      따로 확인한다.

  이 셋을 빼면 두 화면의 outerHTML 은 **글자 단위로** 같아야 한다.
*/

const NORMALIZE_SKIN_HTML =
  '(html) => html' +
  '.replace(/imory-skin-root-i\\d+/g, "imory-skin-root-iX")' +
  '.replace(/\\bi\\d+-/g, "iX-")' +
  '.replace(/ nonce="[^"]*"/g, "")';


function readSkinRootHtml(selector) {

  return '(() => {' +
    '  const norm = ' + NORMALIZE_SKIN_HTML + ';' +
    '  const root = document.querySelector("' + selector + '");' +
    '  return root ? norm(root.outerHTML) : "";' +
    '})()';

}


async function openRenderHarness(browser, query, viewport) {

  const ctx = await browser.newContext({
    viewport: viewport || { width: 900, height: 900 }
  });

  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(PARENT_ORIGIN + HARNESS_PATH + query, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.__sandboxHarnessResult !== undefined,
    null,
    { timeout: 20000 }
  );

  return { ctx, page, consoleErrors };

}


async function runRender(browser) {

  console.log("\n[render] HOME 렌더 (READY -> ACK -> RENDER_HOME -> RENDERED)");

  const { ctx, page, consoleErrors } =
    await openRenderHarness(browser, RENDER_QUERY);

  check("[render] mount 가 성공했다",
    (await page.evaluate(() => window.__sandboxHarnessResult.ok)) === true,
    await page.evaluate(() => window.__sandboxHarnessResult.reason || ""));

  const frame = await waitForSandboxRender(page);

  check("[render] ★ 프레임이 렌더를 끝냈다 (RENDERED 왕복 성립)", Boolean(frame));

  if (!frame) {
    await ctx.close();
    return null;
  }


  /* --- 공개 데이터가 실제로 그려졌는가 ------------------ */

  const frameText =
    await frame.locator("#sandboxFrameRoot").innerText();

  const expectations = [
    ["블로그 제목", "SANDBOX DEMO"],
    ["프로필 닉네임", "주인장"],
    ["프로필 소개", "작은 소개"],
    ["카테고리 이름", "TXT"],
    ["갤러리 카테고리", "PIC"],
    ["최근 글 제목", "첫 번째 글"],
    ["최근 글 날짜", "2026.09.01"],
    ["발췌 카드", "밑줄 그은 문장 하나"],
    ["발췌 메모", "여기에 메모"],
    ["발췌 원문 위치", "TXT > 2002 > 첫 번째 글"]
  ];

  for (const [label, needle] of expectations) {
    check("[render] ★ HOME 의 " + label + " 이(가) 프레임에 그려졌다",
      frameText.includes(needle), needle);
  }


  /* --- CSS 가 실제로 적용됐는가 -------------------------- */

  const titleSize =
    await frame.evaluate(
      () => getComputedStyle(document.querySelector(".sb-title")).fontSize
    );

  check("[render] ★ 스킨 CSS 가 적용됐다 (동적 style 이 CSP 에 막히지 않았다)",
    titleSize === "22px", titleSize);

  const navBorder =
    await frame.evaluate(
      () => getComputedStyle(
        document.querySelector('.sb-nav-link[data-kind="gallery"]')
      ).borderTopStyle
    );

  check("[render] ★ data-imory-kind 가 CSS 로 이어진다 (재료 일치)",
    navBorder === "dashed", navBorder);

  const cardColor =
    await frame.evaluate(
      () => document.querySelector(".sb-hl-card").style.getPropertyValue("--imory-color")
    );

  check("[render] ★ data-imory-color 가 CSS 변수로 들어갔다 (CSSOM 쓰기는 CSP 대상 아님)",
    cardColor.trim() === "#f6e0c8", cardColor);

  const widthContract =
    await frame.evaluate(
      () => Boolean(document.querySelector('link[href*="content-width.css"]'))
    );

  check("[render] 폭 계약 stylesheet 가 프레임에도 걸린다", widthContract);

  /*
    ★ 스킨 CSS 가 적용된 것이 'unsafe-inline' 덕분이 아니라 **nonce**
    덕분이라는 증거. renderSkin()의 styleNonce 인자가 실제로 그
    요소에 닿았는지 IDL 값으로 본다(속성 값은 브라우저가 감춘다).
  */

  const styleNonce =
    await frame.evaluate(
      () => document.querySelector("#sandboxFrameRoot .imory-skin-root style").nonce || ""
    );

  check("[render] ★ 스킨 style 요소가 프레임의 nonce 를 받았다",
    styleNonce.length > 10, styleNonce ? "(있음)" : "(없음)");

  const nativeStyleNonce =
    await page.evaluate(
      () => document.querySelector("#nativeMount .imory-skin-root style").nonce || ""
    );

  check("[render] ★ native 렌더는 nonce 를 받지 않는다 (기존 호출자 무변경)",
    nativeStyleNonce === "", nativeStyleNonce);


  /* --- native 와 같은 구조인가 --------------------------- */

  const nativeHtml =
    await page.evaluate(readSkinRootHtml("#nativeMount .imory-skin-root"));

  const sandboxHtml =
    await frame.evaluate(readSkinRootHtml("#sandboxFrameRoot .imory-skin-root"));

  check("[render] native 쪽도 같은 스킨을 그렸다", nativeHtml.length > 100);

  check("[render] ★ native 와 sandbox 의 innerHTML 구조가 같다",
    nativeHtml === sandboxHtml,
    nativeHtml === sandboxHtml
      ? ""
      : (() => {
          let i = 0;
          while (i < nativeHtml.length && nativeHtml[i] === sandboxHtml[i]) i += 1;
          return "첫 차이 " + i + "자 부근: native [" +
            nativeHtml.slice(i - 40, i + 40) + "] / sandbox [" +
            sandboxHtml.slice(i - 40, i + 40) + "]";
        })());


  const nativeWidth =
    await page.evaluate(
      () => Math.round(
        document.querySelector("#nativeMount .imory-skin-root").getBoundingClientRect().width
      )
    );

  const sandboxWidth =
    await frame.evaluate(
      () => Math.round(
        document.querySelector("#sandboxFrameRoot .imory-skin-root").getBoundingClientRect().width
      )
    );

  check("[render] ★ 스킨 프레임의 폭이 두 화면에서 같다",
    Math.abs(nativeWidth - sandboxWidth) <= 1,
    "native " + nativeWidth + " / sandbox " + sandboxWidth);


  /* --- 저자 JS 는 실행되지 않는다 ------------------------ */

  check("[render] ★ 스킨이 그린 DOM 에 script 요소가 없다",
    (await frame.evaluate(
      () => document.querySelectorAll("#sandboxFrameRoot script").length
    )) === 0);

  check("[render] CSP 위반 콘솔 오류가 없다",
    !consoleErrors.some(t => /Content Security Policy/i.test(t)),
    consoleErrors.filter(t => /Content Security Policy/i.test(t)).join(" | "));


  /* --- 링크는 이번 라운드에서 비활성 ---------------------- */

  const urlBefore = page.url();

  await frame.locator(".sb-recent-link").first().click();
  await page.waitForTimeout(300);

  check("[render] ★ 프레임 안의 링크는 눌러도 아무 일이 없다 (네비게이션은 SANDBOX-2)",
    page.url() === urlBefore &&
    Boolean(page.frames().find(f => f.url().startsWith(SANDBOX_ORIGIN))),
    page.url());

  return { ctx, page, frame };

}


/* =========================================================
   [payload] 실제로 건너간 data
========================================================== */

async function runPayload(browser) {

  console.log("\n[payload] wire 위의 data");

  const { ctx, page } =
    await openRenderHarness(browser, RENDER_QUERY);

  const frame = await waitForSandboxRender(page);

  if (!frame) {
    check("[payload] 프레임이 렌더를 끝냈다", false);
    await ctx.close();
    return;
  }


  /*
    ★ 프레임 realm 안에서 **실제로 도착한 값**을 읽는다. 부모의
    투영 결과를 믿는 것이 아니라 wire 를 직접 본다.
  */

  const received =
    await frame.evaluate(
      () => JSON.stringify(window.__imorySandboxLastReceived || null)
    );

  check("[payload] 프레임이 data 를 받았다",
    Boolean(received) && received !== "null");

  const receivedKeys =
    await frame.evaluate(
      () => Object.keys(window.__imorySandboxLastReceived || {}).sort().join(",")
    );

  /*
    SANDBOX-2 에서 셋이 늘었다: category / post(그 페이지가 아니면
    null 이지만 키는 언제나 있다 — skin-sandbox-context.js 의
    최상위 키 집합이 고정이어야 "정확히 이 집합인가"를 물을 수
    있다)와 nav(부모가 발급한 navId 표).
  */

  check("[payload] ★ 도착한 최상위 키가 계약 그대로다",
    receivedKeys === [
      "banners", "category", "contract", "home", "images", "nav",
      "navigation", "page", "pageType", "post", "profile", "site", "viewer"
    ].join(","),
    receivedKeys);


  const forbidden = [
    ["사용자 UUID", "11111111-2222-3333-4444-555555555555"],
    ["access token", "eyJhbGciOi.FAKE.TOKEN"],
    ["refresh token", "FAKE-REFRESH"],
    ["이메일", "owner@example.com"],
    ["비밀글 본문", "비밀글 본문 원문"],
    ["skin row id", "skin-row-id"],
    ["version row id", "version-row-id"],
    ["관리자 링크", "/demo/admin"],
    ["작성 링크", "write=1"]
  ];

  for (const [label, needle] of forbidden) {
    check("[payload] ★ " + label + " 이(가) 프레임에 도착하지 않았다",
      received.indexOf(needle) === -1);
  }

  check("[payload] ★ viewer 는 방문자 값으로 고정돼 있다",
    (await frame.evaluate(
      () => JSON.stringify(window.__imorySandboxLastReceived.viewer)
    )) === JSON.stringify({
      isOwner: false, writeHref: null, adminHref: null, manageHref: null,
      toolsHref: null, highlightHref: null,
      canManageHighlights: false, canManageMemos: false
    }));

  check("[payload] ★ 함수가 하나도 도착하지 않았다",
    (await frame.evaluate(() => {
      const walk = (v, depth) => {
        if (typeof v === "function") return false;
        if (depth > 6 || v === null || typeof v !== "object") return true;
        return Object.values(v).every(x => walk(x, depth + 1));
      };
      return walk(window.__imorySandboxLastReceived, 0);
    })) === true);

  const projectedOnParent =
    await page.evaluate(() => JSON.stringify(window.__sandboxProjected));

  check("[payload] 부모가 고른 것과 프레임에 도착한 것이 같다",
    projectedOnParent === received);

  await ctx.close();

}


/* =========================================================
   [height] 높이와 이중 스크롤
========================================================== */

async function runHeight(browser) {

  console.log("\n[height] 높이 반영 · 이중 스크롤 없음");

  async function measure(query, viewport) {

    const { ctx, page } =
      await openRenderHarness(browser, query, viewport);

    const frame = await waitForSandboxRender(page);

    /* 높이 메시지가 한 바퀴 더 돌 시간 */
    await page.waitForTimeout(400);

    const iframeHeight =
      await page.evaluate(() => {
        const el = document.querySelector("iframe.imory-skin-sandbox-frame");
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
      });

    const contentHeight =
      frame
        ? await frame.evaluate(() => Math.round(
            document.querySelector("#sandboxFrameRoot .imory-skin-root")
              .getBoundingClientRect().height
          ))
        : 0;

    const frameScroll =
      frame
        ? await frame.evaluate(() => ({
            y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
            x: document.documentElement.scrollWidth - document.documentElement.clientWidth
          }))
        : { y: 0, x: 0 };

    return { ctx, page, frame, iframeHeight, contentHeight, frameScroll };

  }


  const short =
    await measure(RENDER_QUERY, { width: 900, height: 900 });

  check("[height] ★ iframe 높이가 콘텐츠 높이를 따라간다 (짧은 글)",
    Math.abs(short.iframeHeight - short.contentHeight) <= 4,
    "iframe " + short.iframeHeight + " / content " + short.contentHeight);

  check("[height] iframe 이 초기 고정값(120px)에 머물지 않는다",
    short.iframeHeight !== 120, String(short.iframeHeight));

  check("[height] ★ 프레임 안에 세로 스크롤이 없다 (이중 스크롤 금지)",
    short.frameScroll.y <= 1, String(short.frameScroll.y));

  await short.ctx.close();


  const tall =
    await measure(RENDER_QUERY + "&tall=1", { width: 900, height: 900 });

  check("[height] ★ 콘텐츠가 길어지면 iframe 도 함께 길어진다",
    tall.iframeHeight > 1500 &&
    Math.abs(tall.iframeHeight - tall.contentHeight) <= 4,
    "iframe " + tall.iframeHeight + " / content " + tall.contentHeight);

  check("[height] 긴 콘텐츠에서도 프레임 안에 세로 스크롤이 없다",
    tall.frameScroll.y <= 1, String(tall.frameScroll.y));

  check("[height] 긴 콘텐츠에서도 가로 넘침이 없다",
    tall.frameScroll.x <= 0, String(tall.frameScroll.x));


  /*
    ★ 무한 높이 루프가 없는가 — 잠깐 기다린 뒤 값이 더 이상
    움직이지 않아야 한다. 진동하면 여기서 다른 값이 나온다.
  */

  const settled1 =
    await tall.page.evaluate(() =>
      document.querySelector("iframe.imory-skin-sandbox-frame").style.height);

  await tall.page.waitForTimeout(700);

  const settled2 =
    await tall.page.evaluate(() =>
      document.querySelector("iframe.imory-skin-sandbox-frame").style.height);

  check("[height] ★ 높이가 진동하지 않고 한 값에 멈춘다",
    settled1 === settled2, settled1 + " -> " + settled2);

  await tall.ctx.close();


  const mobile =
    await measure(RENDER_QUERY, { width: 390, height: 780 });

  check("[height] 390px 에서도 높이가 맞는다",
    Math.abs(mobile.iframeHeight - mobile.contentHeight) <= 4,
    "iframe " + mobile.iframeHeight + " / content " + mobile.contentHeight);

  check("[height] ★ 390px 에서 프레임 가로 넘침 0",
    mobile.frameScroll.x <= 0, String(mobile.frameScroll.x));

  const parentOverflow =
    await mobile.page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);

  check("[height] ★ 390px 에서 부모 가로 넘침 0",
    parentOverflow <= 0, String(parentOverflow));

  await mobile.ctx.close();

}


/* =========================================================
   [fallback] 폴백
========================================================== */

async function runFallback(browser) {

  console.log("\n[fallback] 폴백 경로");


  /* --- renderMode 가 없으면 sandbox 경로를 타지 않는다 --- */

  {
    const { ctx, page } =
      await openRenderHarness(browser, RENDER_QUERY + "&renderMode=native");

    check("[fallback] ★ renderMode 가 없으면 native 로 판정된다",
      (await page.evaluate(() => window.__sandboxHarnessResult.reason)) === "not-sandbox");

    check("[fallback] ★ 그때 문서에 iframe 이 하나도 없다",
      (await page.locator("iframe").count()) === 0);

    check("[fallback] 그래도 native 렌더는 그대로 나온다",
      (await page.locator("#nativeMount .imory-skin-root").count()) === 1);

    await ctx.close();
  }


  /* --- frame origin 이 없으면 --- */

  {
    const { ctx, page } =
      await openRenderHarness(browser, "?sandboxSkin=1&native=1");

    check("[fallback] ★ frame origin 이 없으면 iframe 을 만들지 않는다",
      (await page.evaluate(() => window.__sandboxHarnessResult.reason)) === "no-origin" &&
      (await page.locator("iframe").count()) === 0);

    await ctx.close();
  }


  /* --- READY 가 오지 않으면 (프레임 문서를 끊는다) --- */

  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();

    /*
      프레임 문서만 끊는다. origin 은 살아 있고 iframe 도 만들어지지만
      READY 가 영영 오지 않는다 — 부모가 timeout 으로 폴백해야 한다.
    */

    await page.route(
      SANDBOX_ORIGIN + "/skin/sandbox/frame*",
      route => route.abort()
    );

    await page.goto(PARENT_ORIGIN + HARNESS_PATH + RENDER_QUERY, { waitUntil: "load" });

    await page.waitForFunction(
      () => window.__sandboxHarnessResult !== undefined,
      null,
      { timeout: 30000 }
    );

    check("[fallback] ★ READY 가 안 오면 timeout 으로 끝난다",
      (await page.evaluate(() => window.__sandboxHarnessResult.reason)) === "timeout",
      await page.evaluate(() => window.__sandboxHarnessResult.reason));

    check("[fallback] ★ 그때 만들었던 iframe 을 치운다 (백지를 남기지 않는다)",
      (await page.locator("iframe.imory-skin-sandbox-frame").count()) === 0);

    check("[fallback] 다시 시도하지 않는다 (iframe 총 0개)",
      (await page.locator("iframe").count()) === 0);

    await ctx.close();
  }

}


/* =========================================================
   [package] renderMode 의 Import / Export 왕복

   실제 skin/skin-package-import.js · skin-package-export.js 를
   브라우저에서 돌린다(둘 다 classic script + DOM sanitizer 의존).
========================================================== */

async function runPackage(browser) {

  console.log("\n[package] renderMode Import/Export 왕복");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(
    PARENT_ORIGIN + "/skin/sandbox/skin-sandbox-package-test.html",
    { waitUntil: "load" }
  );

  await page.waitForFunction(
    () => window.__packageRoundtripResult !== undefined,
    null,
    { timeout: 20000 }
  );

  const r =
    await page.evaluate(() => window.__packageRoundtripResult);

  check("[package] fixture 스킨이 Import 를 통과한다",
    Boolean(r.imported) && r.imported.ok === true,
    r.imported ? (r.imported.message || "") : "(없음)");

  check("[package] ★ Import 결과에 renderMode 가 살아 있다",
    Boolean(r.imported) && r.imported.renderMode === "sandbox",
    r.imported ? String(r.imported.renderMode) : "");

  check("[package] ★ Export 가 renderMode 를 파일에 싣는다",
    Boolean(r.exported) && r.exported.renderMode === "sandbox",
    r.exported ? String(r.exported.renderMode) : "");

  check("[package] ★ Import -> Export -> Import 왕복에서 값이 그대로다",
    Boolean(r.reimported) && r.reimported.ok === true &&
    r.reimported.renderMode === "sandbox",
    r.reimported ? String(r.reimported.renderMode) : "");

  check("[package] ★ 왕복 뒤에도 templates 와 css 가 같다",
    r.roundtripSame === true, r.roundtripDiff || "");

  check("[package] renderMode 가 없는 스킨은 결과에도 키가 없다",
    Boolean(r.nativeImport) && r.nativeImport.ok === true &&
    r.nativeImport.hasRenderModeKey === false);

  check("[package] renderMode:'native' 를 적은 파일은 그 값이 보존된다",
    Boolean(r.explicitNative) && r.explicitNative.ok === true &&
    r.explicitNative.renderMode === "native");

  check('[package] ★ 모르는 renderMode 는 reason:"render-mode" 로 거부된다',
    Boolean(r.weird) && r.weird.ok === false && r.weird.reason === "render-mode",
    r.weird ? r.weird.ok + " / " + r.weird.reason : "");

  check("[package] ★ 문자열이 아닌 renderMode 도 거부된다",
    Array.isArray(r.nonString) &&
    r.nonString.length > 0 &&
    r.nonString.every(x => x.ok === false && x.reason === "render-mode"),
    JSON.stringify(r.nonString));

  check("[package] ★ 모르는 renderMode 는 Export 에도 실리지 않는다",
    r.weirdExportHasKey === false);

  await ctx.close();

}



/* =========================================================
   [home] 공개 HOME 경로 — 하네스가 아니라 **진짜 index.html**

   위 [render] 절은 host 모듈을 직접 불러 확인한다. 이 절은 그
   위층, 즉 실제 공개 진입점이 sandbox 경로로 이어지는지를 본다:

     index.html initHomeRenderer()
       -> tryRenderPublishedSkinHome(ownerId)
       -> skin/skin-home.js renderPublishedSkinHome()
            get_published_skin RPC -> resolveSkinTemplate
            -> buildSkinContext -> resolveSkinRenderMode
            -> mountSandboxSkin()

   Supabase 응답만 mock 하고 HTML/CSS/JS 는 저장소의 실제 파일을
   그대로 쓴다(다른 skin e2e 와 같은 방식).
========================================================== */

const HOME_SLUG = "testuser";
const HOME_OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const HOME_DB = {
  profiles: [{
    user_id: HOME_OWNER_ID, slug: HOME_SLUG, home_mode: "customize",
    nickname: "주인장", bio: "작은 소개"
  }],
  site_settings: [
    { user_id: HOME_OWNER_ID, key: "blog_title", value: "SANDBOX DEMO" },
    { user_id: HOME_OWNER_ID, key: "favicon_url", value: "" }
  ],
  categories: [
    { id: 1, user_id: HOME_OWNER_ID, name: "TXT", type: "post", sort_order: 1 },
    { id: 2, user_id: HOME_OWNER_ID, name: "PIC", type: "gallery", sort_order: 2 }
  ],
  posts: [
    { id: 101, user_id: HOME_OWNER_ID, category_id: 1, title: "첫 번째 글",
      content_type: "text", visibility: "public",
      created_at: "2026-09-01T02:00:00Z", quote_preset_id: null },

    /*
      SANDBOX-2 — 이동 검증용 두 번째 글. 같은 카테고리에 있어서
      CATEGORY 목록에 둘이 나오고, 그중 하나를 눌러 POST 로
      들어간 뒤 다시 카테고리로 돌아오는 길을 잰다.
    */
    { id: 102, user_id: HOME_OWNER_ID, category_id: 1, title: "두 번째 글",
      content_type: "text", visibility: "public",
      created_at: "2026-09-02T02:00:00Z", quote_preset_id: null },

    /*
      비밀글 — sandbox 경로를 타지 않는다는 것(기존 native viewer 로
      폴백)을 이 글로 확인한다.
    */
    { id: 103, user_id: HOME_OWNER_ID, category_id: 1, title: "잠긴 글",
      content_type: "text", visibility: "secret",
      created_at: "2026-09-03T02:00:00Z", quote_preset_id: null }
  ],
  post_contents: [
    { post_id: 101, content: "<p>첫 번째 글의 본문이다.</p>" },
    { post_id: 102, content: "<p>두 번째 글의 본문이다.</p>" },
    { post_id: 103, content: "<p>비밀 본문</p>" }
  ],
  post_folders: [],
  post_gallery_images: [],
  post_covers: [],
  post_highlights: [],
  banners: [],
  quote_presets: []
};

const HOME_RESERVED_PARAMS =
  new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function homeQueryTable(table, params) {

  let rows = (HOME_DB[table] || []).map(r => ({ ...r }));

  for (const [key, raw] of params.entries()) {
    if (HOME_RESERVED_PARAMS.has(key)) continue;
    const m = /^(eq|neq|in|gt|gte|lt|lte)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
      rows = rows.filter(r => list.includes(String(r[key])));
      continue;
    }
    rows = rows.filter(r => {
      const cur = r[key];
      if (op === "eq") return String(cur) === val;
      if (op === "neq") return String(cur) !== val;
      return true;
    });
  }

  const limit = params.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));

  const select = params.get("select");
  if (select && select !== "*") {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }

  return rows;

}


async function installHomeSupabaseMock(page, skinPackage) {

  await page.route("https://" + SUPABASE_HOST + "/**", async route => {

    const req = route.request();
    const url = new URL(req.url());

    /*
      ★ preflight 응답에 허용 메서드를 명시한다.

      WebKit 은 Access-Control-Allow-Methods 가 없는 preflight 를
      간헐적으로 거절한다("due to access control checks") — chromium
      은 넘어가므로 두 브라우저에서 결과가 갈렸다. mock 의 문제이지
      제품 코드의 문제가 아니라, 여기서 헤더를 채워 재현을 없앤다.
    */

    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS,HEAD",
      "access-control-expose-headers": "*",
      "access-control-max-age": "600"
    };

    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers });
    }

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 401, headers, contentType: "application/json",
        body: JSON.stringify({ message: "no session" })
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/get_published_skin")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({
          skin: skinPackage,
          schemaVersion: skinPackage.schemaVersion,
          imageSlotValues: {}
        })
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json", body: "null"
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const rows = homeQueryTable(
        url.pathname.slice("/rest/v1/".length), url.searchParams
      );
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (single && rows.length === 0) {
        return route.fulfill({
          status: 406, headers, contentType: "application/json",
          body: JSON.stringify({ code: "PGRST116", message: "0 rows" })
        });
      }
      return route.fulfill({
        status: 200, headers,
        contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
        body: JSON.stringify(single ? rows[0] : rows)
      });
    }

    return route.fulfill({ status: 404, headers, body: "{}" });

  });

  /* 외부 잡음 차단 — supabase-js 번들(cdn.jsdelivr.net/npm)은 통과시킨다 */

  for (const pattern of [
    "https://fonts.googleapis.com/**",
    "https://fonts.gstatic.com/**",
    "https://cdn.jsdelivr.net/gh/**",
    "https://unpkg.com/**"
  ]) {
    await page.route(pattern, r => r.abort());
  }

}


async function openPublicHome(browser, skinPackage, query) {

  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const page = await ctx.newPage();

  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(String(err && err.message || err)));

  await installHomeSupabaseMock(page, skinPackage);

  await page.goto(
    PARENT_ORIGIN + "/" + HOME_SLUG + "/" + (query || ""),
    { waitUntil: "load" }
  );

  return { ctx, page, pageErrors };

}


/* =========================================================
   openPublicPath(browser, skinPackage, subPath, options)

   SANDBOX-2 — 이동이 생기면서 주소가 바뀐다. 그래서 dev opt-in 을
   **쿼리가 아니라 localStorage 로** 건다(그러지 않으면 두 번째
   화면부터 플래그가 꺼져 native 로 떨어진다 —
   skin/sandbox/skin-sandbox-config.js 의 dev 저장소 키 주석).
   production 은 이 분기를 타지 않는다(hostname + slug allowlist).
========================================================== */

async function openPublicPath(browser, skinPackage, subPath, options) {

  const opts = options || {};

  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 900, height: 900 }
  });

  const page = await ctx.newPage();

  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(String(err && err.message || err)));

  await page.addInitScript(
    ([origin, sandboxEnabled]) => {
      try {
        if (sandboxEnabled) {
          localStorage.setItem("imory.sandboxSkin", "1");
          localStorage.setItem("imory.sandboxSkinOrigin", origin);
        }
      } catch (err) { /* 저장소가 막혀 있으면 플래그 없이 돈다 */ }
    },
    [SANDBOX_ORIGIN, opts.sandbox !== false]
  );

  await installHomeSupabaseMock(page, skinPackage);

  await page.goto(
    PARENT_ORIGIN + "/" + HOME_SLUG + (subPath || "/"),
    { waitUntil: "load" }
  );

  return { ctx, page, pageErrors };

}


/*
  "지금 **보이는** 화면을 그리고 있는 sandbox 프레임" 하나를 기다린다.

  ★ 보이는 것만 센다. 화면을 옮겨도 이전 화면의 컨테이너(#postList /
  #postSkinContainer)는 hidden 으로 남아 있을 뿐 비워지지 않는다 —
  native 스킨도 똑같이 옛 DOM 을 그 자리에 두고 다음 진입에서
  덮어쓴다. 그래서 "떠 있는 프레임" 만으로 찾으면 옛 화면의
  프레임을 집어 와서 테스트가 한 박자 이르게 통과한다.
*/

async function waitForSandboxPage(page, pageType, timeout) {

  const deadline = Date.now() + (timeout || 20000);

  while (Date.now() < deadline) {

    const elements =
      await page.$$("iframe.imory-skin-sandbox-frame");

    for (const element of elements) {

      try {

        if (!(await element.isVisible())) continue;

        const frame = await element.contentFrame();

        if (!frame || !frame.url().startsWith(SANDBOX_ORIGIN)) continue;

        const type = await frame.evaluate(() => {
          const root = document.getElementById("sandboxFrameRoot");
          return root &&
            root.getAttribute("data-imory-sandbox-state") === "rendered"
            ? root.getAttribute("data-imory-sandbox-page")
            : null;
        });

        if (type && (!pageType || type === pageType)) return frame;

      } catch (err) { /* 그 사이 프레임이 사라졌다 — 다음 바퀴에 */ }

    }

    await page.waitForTimeout(100);

  }

  return null;

}


async function runHome(browser) {

  console.log("\n[home] 공개 HOME 경로 (실제 index.html)");

  const sandboxPkg =
    JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "skin", "test-skins", "imory-sandbox-home-v1.json"),
        "utf8"
      )
    );

  const nativePkg =
    JSON.parse(JSON.stringify(sandboxPkg));

  delete nativePkg.renderMode;


  /* --- 1. renderMode 없는 스킨: 오늘과 같은 경로 ---------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicHome(browser, nativePkg, ON_QUERY);

    await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 20000 });

    check("[home] ★ renderMode 없는 스킨은 같은 문서에 그려진다 (오늘과 동일)",
      (await page.locator("#themeMount .imory-skin-root").count()) === 1);

    check("[home] ★ 그때 문서에 sandbox iframe 이 하나도 없다",
      (await page.locator("iframe.imory-skin-sandbox-frame").count()) === 0);

    check("[home] 공개 mount 계약(.theme-mount--skin)이 붙는다",
      (await page.locator("#themeMount.theme-mount--skin").count()) === 1);

    check("[home] 페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

    await ctx.close();
  }


  /* --- 2. sandbox 스킨 + 플래그 OFF: native 로 그린다 ----- */

  {
    const { ctx, page, pageErrors } =
      await openPublicHome(browser, sandboxPkg, "");

    await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 20000 });

    check("[home] ★ 플래그가 꺼져 있으면 sandbox 스킨도 native 로 그린다",
      (await page.locator("#themeMount .imory-skin-root").count()) === 1 &&
      (await page.locator("iframe.imory-skin-sandbox-frame").count()) === 0);

    check("[home] ★ 즉 배포에 이 코드가 있어도 공개 화면이 바뀌지 않는다",
      (await page.locator("#themeMount.theme-mount--skin").count()) === 1);

    check("[home] 페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

    await ctx.close();
  }


  /* --- 3. sandbox 스킨 + 플래그 ON: 프레임에 그린다 ------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicHome(browser, sandboxPkg, ON_QUERY);

    await page.waitForSelector("iframe.imory-skin-sandbox-frame", { timeout: 20000 });

    check("[home] ★ sandbox 스킨은 #themeMount 안에 cross-origin iframe 으로 뜬다",
      (await page.locator("#themeMount iframe.imory-skin-sandbox-frame").count()) === 1);

    check("[home] 그 iframe 의 src 가 frame origin 이다",
      ((await page.locator("iframe.imory-skin-sandbox-frame").getAttribute("src")) || "")
        .startsWith(SANDBOX_ORIGIN));

    check("[home] ★ 같은 문서에는 스킨이 그려지지 않는다 (중복 렌더 없음)",
      (await page.locator("#themeMount > .imory-skin-root").count()) === 0);

    const frame = await waitForSandboxRender(page);

    check("[home] ★ 프레임이 렌더를 끝냈다", Boolean(frame));

    if (frame) {

      const text =
        await frame.locator("#sandboxFrameRoot").innerText();

      check("[home] ★ 실제 DB(mock) 의 블로그 제목이 프레임에 그려졌다",
        text.includes("SANDBOX DEMO"), text.slice(0, 60));

      check("[home] ★ 실제 카테고리 이름이 프레임에 그려졌다",
        text.includes("TXT") && text.includes("PIC"));

      check("[home] ★ 실제 글 제목이 프레임에 그려졌다",
        text.includes("첫 번째 글"));

      check("[home] ★ 프레임에 supabase 전역이 없다",
        (await frame.evaluate(() => typeof window.supabase)) === "undefined" &&
        (await frame.evaluate(() => typeof window.supabaseClient)) === "undefined");

      check("[home] ★ 프레임 localStorage 에 Imory 세션 키가 없다",
        (await frame.evaluate(() => {
          try { return Object.keys(localStorage).length; }
          catch (err) { return -1; }
        })) <= 0);

    }

    check("[home] 공개 mount 계약(.theme-mount--skin)이 그대로 붙는다",
      (await page.locator("#themeMount.theme-mount--skin").count()) === 1);

    check("[home] 부모 문서에 가로 넘침이 없다",
      (await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

    check("[home] 페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

    await ctx.close();
  }


  /* --- 4. 프레임이 안 뜨면 같은 스킨을 native 로 --------- */

  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();

    const pageErrors = [];
    page.on("pageerror", err => pageErrors.push(String(err && err.message || err)));

    await installHomeSupabaseMock(page, sandboxPkg);

    await page.route(
      SANDBOX_ORIGIN + "/skin/sandbox/frame*",
      route => route.abort()
    );

    await page.goto(
      PARENT_ORIGIN + "/" + HOME_SLUG + "/" + ON_QUERY,
      { waitUntil: "load" }
    );

    await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 30000 });

    check("[home] ★ 프레임이 안 뜨면 같은 스킨을 native 로 그린다 (백지 아님)",
      (await page.locator("#themeMount .imory-skin-root").count()) === 1);

    check("[home] ★ 그때 iframe 을 남기지 않는다",
      (await page.locator("iframe.imory-skin-sandbox-frame").count()) === 0);

    check("[home] ★ 폴백 화면에도 실제 데이터가 들어 있다",
      (await page.locator("#themeMount .imory-skin-root").innerText())
        .includes("SANDBOX DEMO"));

    check("[home] 페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

    await ctx.close();
  }

}


/* =========================================================
   [pages] SANDBOX-2 — CATEGORY / POST 도 프레임에서 그려진다

   HOME 과 같은 문서(진짜 index.html)를 쓰되 주소만 다르게 들어간다.
   supabase 만 mock 이고 라우팅·Context 조립·본문 서식은 전부
   저장소의 실제 코드다.
========================================================== */

function readSandboxPkg() {

  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "skin", "test-skins", "imory-sandbox-home-v1.json"),
      "utf8"
    )
  );

}


async function runPages(browser) {

  console.log("\n[pages] CATEGORY / POST 렌더");

  const sandboxPkg = readSandboxPkg();


  /* --- CATEGORY ---------------------------------------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/category/1");

    const frame = await waitForSandboxPage(page, "category");

    check("[pages] ★ CATEGORY 가 별도 origin 프레임에서 그려진다",
      Boolean(frame));

    if (frame) {

      const text = await frame.locator("#sandboxFrameRoot").innerText();

      check("[pages] ★ 카테고리 이름이 프레임에 그려졌다",
        text.includes("TXT"), text.slice(0, 80));

      check("[pages] ★ 그 카테고리의 글 목록이 그려졌다",
        text.includes("첫 번째 글") && text.includes("두 번째 글"));

      /*
        비밀글은 목록에서 제목 앞에 자물쇠가 붙는다(기존 계약 —
        skin/skin-context.js maskSkinPostTitle). 여기서 보는 것은
        그 계약이 프레임에서도 같다는 것과, **본문은 어디에도
        없다**는 것이다.
      */

      check("[pages] ★ 비밀글은 자물쇠가 붙은 제목으로 온다",
        text.includes("🔒 잠긴 글"), text.slice(0, 160));

      check("[pages] ★ 비밀 본문은 프레임에 도착하지 않았다",
        (await frame.evaluate(() =>
          JSON.stringify(window.__imorySandboxLastReceived || {})))
          .indexOf("비밀 본문") === -1);

      check("[pages] ★ 프레임에 supabase 전역이 없다",
        (await frame.evaluate(() => typeof window.supabaseClient)) === "undefined");

      check("[pages] ★ 도착한 data 의 post/home namespace 는 null 이다",
        (await frame.evaluate(() => {
          const d = window.__imorySandboxLastReceived || {};
          return d.pageType === "category" && d.home === null && d.post === null;
        })) === true);

    }

    check("[pages] ★ 같은 문서에 스킨이 중복으로 그려지지 않는다",
      (await page.locator("#postList > .imory-skin-root").count()) === 0);

    check("[pages] 부모 문서에 가로 넘침이 없다",
      (await page.evaluate(() =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth)) <= 0);

    check("[pages] 페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

    await ctx.close();
  }


  /* --- POST (본문은 별도 메시지로) ---------------------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/post/101");

    const frame = await waitForSandboxPage(page, "post");

    check("[pages] ★ POST 가 별도 origin 프레임에서 그려진다",
      Boolean(frame));

    if (frame) {

      check("[pages] ★ 글 제목이 프레임에 그려졌다",
        (await frame.locator("#sandboxFrameRoot").innerText()).includes("첫 번째 글"));

      /* 본문은 IMORY_POST_BODY 로 나중에 온다 */

      await frame.waitForFunction(
        () => (document.querySelector('[data-imory-region="post-body"]')
          || { textContent: "" }).textContent.trim().length > 0,
        null,
        { timeout: 15000 }
      ).catch(() => {});

      const bodyText =
        await frame.locator('[data-imory-region="post-body"]').innerText();

      check("[pages] ★ 본문이 post-body region 에 들어왔다",
        bodyText.includes("첫 번째 글의 본문"), bodyText.slice(0, 80));

      check("[pages] ★ 본문은 Context 가 아니라 별도 메시지로 왔다",
        (await frame.evaluate(() =>
          JSON.stringify(window.__imorySandboxLastReceived || {})))
          .indexOf("본문이다") === -1);

    }

    check("[pages] 페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

    await ctx.close();
  }


  /* --- 비밀글은 sandbox 를 쓰지 않는다 ------------------ */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/post/103");

    await page.waitForTimeout(3000);

    /*
      ★ #themeMount 의 HOME 프레임은 그대로 있다 — 공개 홈이 먼저
      그려지고 그 위로 글이 열리는 것은 native 와 같다. 여기서
      보는 것은 "**글 자리**에 프레임이 생기지 않았는가"다.
    */

    check("[pages] ★ 비밀글 POST 는 글 자리에 sandbox 프레임을 만들지 않는다 (native 폴백)",
      (await page.locator("#postSkinContainer iframe.imory-skin-sandbox-frame").count()) === 0 &&
      (await waitForSandboxPage(page, "post", 3000)) === null);

    check("[pages] ★ 그때 비밀 본문이 문서 어디에도 없다",
      (await page.content()).indexOf("비밀 본문") === -1);

    check("[pages] 페이지 오류 없음", pageErrors.length === 0, pageErrors.join(" | "));

    await ctx.close();
  }


  /* --- renderMode 없는 스킨의 CATEGORY/POST 회귀 -------- */

  {
    const nativePkg = readSandboxPkg();
    delete nativePkg.renderMode;

    for (const [sub, needle] of [["/category/1", "TXT"], ["/post/101", "첫 번째 글"]]) {

      const { ctx, page, pageErrors } =
        await openPublicPath(browser, nativePkg, sub);

      /*
        HOME 스킨도 #themeMount 에 함께 떠 있으므로(native 와 같다)
        이 화면이 그려지는 자리로 좁혀서 본다.
      */

      const host =
        sub.startsWith("/post") ? "#postSkinContainer" : "#postList";

      await page.waitForSelector(host + " .imory-skin-root", { timeout: 20000 });

      check(`[pages] ★ native 회귀 — ${sub} 는 같은 문서에 그려진다`,
        (await page.locator("iframe.imory-skin-sandbox-frame").count()) === 0 &&
        (await page.locator(host + " .imory-skin-root").first().innerText())
          .includes(needle));

      check(`[pages] native 회귀 — ${sub} 페이지 오류 없음`,
        pageErrors.length === 0, pageErrors.join(" | "));

      await ctx.close();

    }
  }

}


/* =========================================================
   [nav] SANDBOX-2 — 프레임 안 링크가 실제로 눌린다

   여기서 보는 것은 "부모가 화면을 바꿨는가"와 "주소가 따라왔는가"
   둘이다. 프레임은 주소를 보내지 않고 정수 하나만 올리며, 그
   정수를 route 로 바꾸는 표는 부모에만 있다.
========================================================== */

/*
  ★ mock 의 소음 한 가지를 걸러 낸다.

  화면을 빠르게 옮기면 직전 화면이 띄워 둔 supabase 조회가 이동
  도중에 끊긴다. WebKit 은 그 중단을 "due to access control checks"
  라는 CORS 오류로 보고한다(chromium 은 조용히 넘어간다). 실제
  배포에서는 Playwright route 가 없으므로 이 모양이 나지 않는다 —
  판정 대상이 아니라 하네스의 소음이다.

  그 밖의 오류는 전부 그대로 실패로 센다.
*/

function realPageErrors(list) {

  return list.filter(
    (message) =>
      !(message.includes(SUPABASE_HOST) &&
        message.includes("access control checks"))
  );

}


async function runNav(browser) {

  console.log("\n[nav] 프레임 안 링크 · 뒤로가기 · 위조 거부");

  const sandboxPkg = readSandboxPkg();


  /* --- HOME -> CATEGORY -> POST -> CATEGORY ------------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/");

    let frame = await waitForSandboxPage(page, "home");

    check("[nav] HOME 이 프레임에 떴다", Boolean(frame));

    if (frame) {

      await frame.locator(".sb-nav-link", { hasText: "TXT" }).first().click();

      frame = await waitForSandboxPage(page, "category");

      check("[nav] ★ HOME 의 카테고리 링크로 CATEGORY 가 열린다",
        Boolean(frame));

      await page.waitForURL(
        `**/${HOME_SLUG}/category/1`, { timeout: 10000 }
      ).catch(() => {});

      check("[nav] ★ 주소도 그 카테고리로 바뀌었다",
        new URL(page.url()).pathname === `/${HOME_SLUG}/category/1`,
        page.url());

    }

    if (frame) {

      await frame.locator(".sb-recent-link", { hasText: "두 번째 글" })
        .first().click();

      frame = await waitForSandboxPage(page, "post");

      check("[nav] ★ CATEGORY 의 글 링크로 POST 가 열린다", Boolean(frame));

      await page.waitForURL(
        `**/${HOME_SLUG}/post/102`, { timeout: 10000 }
      ).catch(() => {});

      check("[nav] ★ 주소도 그 글로 바뀌었다",
        new URL(page.url()).pathname === `/${HOME_SLUG}/post/102`,
        page.url());

    }

    if (frame) {

      await frame.locator(".sb-back").first().click();

      frame = await waitForSandboxPage(page, "category");

      check("[nav] ★ POST 에서 카테고리로 돌아간다", Boolean(frame));

      /*
        주소는 라우터가 화면을 그린 **뒤**에 정리한다(기존 동작).
        그래서 프레임 렌더만 보고 바로 주소를 재면 한 박자 이르다.
      */

      await page.waitForURL(
        `**/${HOME_SLUG}/category/1`, { timeout: 10000 }
      ).catch(() => {});

      check("[nav] 그때 주소도 카테고리다",
        new URL(page.url()).pathname === `/${HOME_SLUG}/category/1`,
        page.url());

    }


    /* --- 뒤로가기 / 앞으로가기 ------------------------- */

    await page.goBack({ waitUntil: "load" }).catch(() => {});

    await page.waitForURL(
      `**/${HOME_SLUG}/post/102`, { timeout: 10000 }
    ).catch(() => {});

    check("[nav] ★ 뒤로가기로 글 주소로 돌아온다",
      new URL(page.url()).pathname === `/${HOME_SLUG}/post/102`,
      page.url());

    check("[nav] 그 화면이 프레임에 다시 그려진다",
      Boolean(await waitForSandboxPage(page, "post")));

    await page.goForward({ waitUntil: "load" }).catch(() => {});

    await page.waitForURL(
      `**/${HOME_SLUG}/category/1`, { timeout: 10000 }
    ).catch(() => {});

    check("[nav] ★ 앞으로가기로 카테고리 주소로 돌아온다",
      new URL(page.url()).pathname === `/${HOME_SLUG}/category/1`,
      page.url());

    check("[nav] 그 화면도 프레임에 다시 그려진다",
      Boolean(await waitForSandboxPage(page, "category")));

    /*
      ★ "화면당 하나" — 한 컨테이너에 프레임이 둘 생기지 않는다.

      문서 전체의 개수를 세지 않는 이유: HOME 스킨은 #themeMount 에
      계속 mount 된 채 남는다(native 와 같다). 그래서 글을 보는 동안
      살아 있는 프레임은 HOME 것과 지금 화면 것 둘이 정상이다.
      중복 렌더는 "같은 자리에 둘"로 나타난다.
    */

    const framePlacement =
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("iframe.imory-skin-sandbox-frame"))
          .map(el => {
            const parent = el.parentElement;
            return ((parent && parent.id) || "?") +
              (parent && parent.offsetParent === null && parent.id !== "themeMount"
                ? "(hidden)" : "");
          })
      );

    const byParent =
      framePlacement.reduce((acc, id) => {
        acc[id] = (acc[id] || 0) + 1;
        return acc;
      }, {});

    check("[nav] ★ 한 컨테이너에 프레임이 둘 생기지 않는다 (중복 렌더 없음)",
      Object.values(byParent).every(n => n === 1),
      JSON.stringify(byParent));

    /*
      ★ 지금 **보이는** 프레임은 하나뿐이다.

      옛 화면의 컨테이너는 hidden 으로 남는다(native 스킨도 옛 DOM 을
      그 자리에 두고 다음 진입에서 덮어쓴다 — 같은 동작이다).
      그러니 "문서에 프레임이 몇 개인가"가 아니라 "보이는 것이
      하나인가"를 본다.
    */

    check("[nav] ★ 지금 보이는 sandbox 프레임은 하나뿐이다",
      (await page.evaluate(() =>
        Array.from(document.querySelectorAll("iframe.imory-skin-sandbox-frame"))
          .filter(el => el.offsetParent !== null || el.id === "themeMount")
          .filter(el => el.closest("#themeMount") === null)
          .length)) <= 1,
      JSON.stringify(framePlacement));

    check("[nav] 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* --- 직접 접속 / 새로고침 ---------------------------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/post/101");

    check("[nav] ★ POST 주소로 직접 들어와도 프레임이 뜬다",
      Boolean(await waitForSandboxPage(page, "post")));

    await page.reload({ waitUntil: "load" });

    check("[nav] ★ 새로고침해도 같은 화면이다",
      Boolean(await waitForSandboxPage(page, "post")) &&
      new URL(page.url()).pathname === `/${HOME_SLUG}/post/101`);

    check("[nav] 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* --- 모바일 터치 ------------------------------------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/", {
        viewport: { width: 390, height: 780 }
      });

    const frame = await waitForSandboxPage(page, "home");

    check("[nav] 390px 에서도 HOME 이 뜬다", Boolean(frame));

    if (frame) {

      await frame.locator(".sb-nav-link", { hasText: "TXT" }).first()
        .dispatchEvent("click");

      check("[nav] ★ 모바일에서도 링크가 눌린다",
        Boolean(await waitForSandboxPage(page, "category")));

    }

    check("[nav] 390px 가로 넘침 없음",
      (await page.evaluate(() =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth)) <= 0);

    check("[nav] 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* --- 위조 거부 --------------------------------------- */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/");

    const frame = await waitForSandboxPage(page, "home");

    check("[nav] 위조 검증 — HOME 이 떴다", Boolean(frame));

    if (frame) {

      /*
        ★ 프레임 realm 안에서 직접 쏜다. origin/source 는 진짜지만
        내용이 계약과 다른 메시지들 — 부모가 화면을 바꾸면 안 된다.
      */

      const before = page.url();

      await frame.evaluate((parentOrigin) => {

        const send = (payload) =>
          window.parent.postMessage(
            { imory: 1, type: "IMORY_NAVIGATE", seq: 9, payload },
            parentOrigin
          );

        /* 표에 없는 id */
        send({ contract: 1, renderSeq: 1, navId: 987654 });

        /* href 를 끼워 보낸다 — 알려지지 않은 키라 봉투에서 거부 */
        send({ contract: 1, renderSeq: 1, navId: 1, href: "/admin" });

        /* 옛 화면의 renderSeq */
        send({ contract: 1, renderSeq: 99, navId: 1 });

        /* contract 불일치 */
        send({ contract: 2, renderSeq: 1, navId: 1 });

        /* 봉투 위조 */
        window.parent.postMessage(
          { imory: 2, type: "IMORY_NAVIGATE", seq: 1,
            payload: { contract: 1, renderSeq: 1, navId: 1 } },
          parentOrigin
        );

        /* 모르는 type */
        window.parent.postMessage(
          { imory: 1, type: "IMORY_EVAL", seq: 1, payload: { contract: 1 } },
          parentOrigin
        );

      }, PARENT_ORIGIN);

      await page.waitForTimeout(1200);

      check("[nav] ★ 위조/불일치 메시지로는 화면이 바뀌지 않는다",
        page.url() === before, page.url());

      check("[nav] ★ 그때도 HOME 프레임이 그대로 살아 있다",
        Boolean(await waitForSandboxPage(page, "home", 3000)));

    }


    /*
      ★ 다른 origin 이 부모에게 같은 메시지를 보내도 소용없다.
      부모는 event.origin 과 event.source 를 둘 다 본다 — 여기서는
      부모 자신의 window 에서 쏘므로 origin 이 프레임 origin 이
      아니고, source 도 iframe.contentWindow 가 아니다.
    */

    {
      const before = page.url();

      await page.evaluate(() => {
        for (let id = 1; id <= 20; id += 1) {
          window.postMessage(
            { imory: 1, type: "IMORY_NAVIGATE", seq: 1,
              payload: { contract: 1, renderSeq: 1, navId: id } },
            window.location.origin
          );
        }
      });

      await page.waitForTimeout(800);

      check("[nav] ★ 부모 자신이 쏜 메시지도 거부된다 (origin/source)",
        page.url() === before, page.url());
    }

    check("[nav] 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
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
    `SKIN SANDBOX E2E (SANDBOX-0 + SANDBOX-1) — ${BROWSER}\n` +
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

    /* --- SANDBOX-1 --- */

    if (shouldRun("render")) {
      const r = await runRender(browser);
      if (r) await r.ctx.close();
    }

    if (shouldRun("payload")) await runPayload(browser);
    if (shouldRun("height")) await runHeight(browser);
    if (shouldRun("fallback")) await runFallback(browser);
    if (shouldRun("package")) await runPackage(browser);
    if (shouldRun("home")) await runHome(browser);

    /* --- SANDBOX-2 --- */

    if (shouldRun("pages")) await runPages(browser);
    if (shouldRun("nav")) await runNav(browser);

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
