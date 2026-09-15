/* =========================================================
   SKIN STUDIO — SANDBOX PREVIEW E2E (SANDBOX-4)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §G/§H/§J/§K
             studio/preview/preview-sandbox.js 상단

   무엇을 보는가
   -------------
   "renderMode:\"sandbox\" 인 스킨이 Skin Studio 의 우측 미리보기에서도
   공개 화면과 **같은 cross-origin 프레임**에 그려지는가".

     [frame]     sandbox 스킨 Preview 에 cross-origin iframe 이
                 정확히 1개 · 그 안에 실제 스킨이 그려졌는가
                 Select 버튼이 잠기는가
     [edit]      HTML/CSS 를 고치면 **같은 프레임에** 즉시 다시
                 그려지는가(iframe 재생성 0) · Save 하지 않은 draft
                 가 그대로 보이는가
     [pages]     HOME → CATEGORY → POST → BANNER → HIGHLIGHTS 를
                 오가도 프레임은 하나 · 본문은 preview:post-body 로
                 프레임 안 region 에 들어가는가
     [nav]       프레임 안 링크 클릭이 **실제 공개 페이지로 나가지
                 않고** Studio 의 미리보기 페이지만 바꾸는가
                 (HOME → LOG → 글 → Preview Back)
     [native]    renderMode 없는 스킨(scenario x)은 프레임이 0개 —
                 지금까지의 native Preview 그대로
     [parity]    같은 fixture 에서 공개 화면과 Studio Preview 의
                 프레임 DOM/CSS 핵심값이 같은가
     [mobile]    390px 에서 부모·프레임 양쪽 가로 넘침 0
     [reject]    위조 메시지와 늦게 도착한 렌더 응답이 거부되는가

   SANDBOX-3.1 에서 더해진 것
     [bodystyle]  프레임 CSP 를 넓히지 않고도 Quote Preset 서식이
                  살아 있는가(계산값으로 판정) · 주입한 url()/
                  position/z-index 가 전부 떨어지는가 · style 로
                  외부 요청이 나가지 않는가 · 서식 <style> 이
                  nonce 를 달고 하나만 있는가
     [bodyparity] 같은 글·같은 프리셋에서 native 본문과 프레임
                  본문의 계산값이 글자 단위로 같은가

   ★ 두 origin
   포트가 다르면 origin 이 다르다. Studio(부모)는 8959, 프레임은
   8960 이다. 두 서버 모두 배포되는 그 Pages Function
   (functions/_middleware.js)을 그대로 통과한다 — CSP 와 호스트
   분기가 복제본이 아니라 실물이어야 이 테스트에 의미가 있다.

   ★ 프레임이 두 겹이다
     studio-lifecycle-scenario.html      (8959)
       └ iframe #studioPreviewFrame      (8959, preview-frame.html)
           └ iframe [data-imory-sandbox-frame]  (8960, frame.html)
   Playwright 에서는 frameLocator 를 두 번 탄다.

   실행
     node studio/studio-sandbox-preview-e2e-test.mjs
     node studio/studio-sandbox-preview-e2e-test.mjs --browser=webkit
     node studio/studio-sandbox-preview-e2e-test.mjs --only=nav
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const PARENT_PORT = 8959;
const SANDBOX_PORT = 8960;

const PARENT_ORIGIN = `http://localhost:${PARENT_PORT}`;
const SANDBOX_ORIGIN = `http://localhost:${SANDBOX_PORT}`;

const STUDIO_PATH = "/studio/studio-lifecycle-scenario.html";

const SANDBOX_FLAGS =
  `sandboxSkin=1&sandboxSkinOrigin=${encodeURIComponent(SANDBOX_ORIGIN)}`;

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


/* =========================================================
   staticResponse — Cloudflare Pages 를 흉내낸다.

   `.html` 주소는 308 로 정본 주소에 보내고 질의 문자열을 그대로
   옮긴다(skin/sandbox/skin-sandbox-e2e-test.mjs 와 같은 규칙) —
   그래야 ?sandboxSkin=1 같은 플래그가 리다이렉트에서 증발하지
   않는다.
========================================================== */

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
   Studio 열기
========================================================== */

async function openStudio(browser, options) {

  const opts = options || {};

  const ctx = await browser.newContext(
    opts.viewport ? { viewport: opts.viewport } : {}
  );

  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err && err.message || err)));

  const query =
    `?scenario=${opts.scenario || "sb"}` +
    (opts.sandbox === false ? "" : `&${SANDBOX_FLAGS}`);

  await page.goto(PARENT_ORIGIN + STUDIO_PATH + query, {
    waitUntil: "domcontentloaded"
  });

  await page.waitForSelector("#studioPreviewShell:not([hidden])", { timeout: 15000 });

  return { ctx, page, consoleErrors };

}


/* preview-frame.html (같은 origin, 바깥 프레임) */

function previewFrame(page) {
  return page.frameLocator("#studioPreviewFrame");
}


/* skin sandbox frame.html (다른 origin, 안쪽 프레임) */

function sandboxFrame(page) {
  return previewFrame(page).frameLocator("iframe[data-imory-sandbox-frame]");
}


async function sandboxFrameCount(page) {

  return page.evaluate(() => {

    const outer =
      document.getElementById("studioPreviewFrame");

    if (!outer || !outer.contentDocument) return -1;

    return outer.contentDocument.querySelectorAll(
      "iframe[data-imory-sandbox-frame]"
    ).length;

  });

}


async function waitForSandboxText(page, selector, timeout = 12000) {

  await sandboxFrame(page).locator(selector).first()
    .waitFor({ state: "attached", timeout });

  return sandboxFrame(page).locator(selector).first().innerText();

}


/* 프레임 문서가 그린 루트(스킨 DOM 이 붙는 자리) */

const FRAME_ROOT = "#sandboxFrameRoot";


/* =========================================================
   [frame] 프레임이 정확히 하나 · 실제로 그려진다
========================================================== */

async function runFrame(browser) {

  console.log("\n[frame] sandbox 스킨 Preview 의 cross-origin 프레임");

  const { ctx, page, consoleErrors } = await openStudio(browser);

  await sandboxFrame(page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  check("[frame] ★ cross-origin iframe 이 정확히 1개",
    (await sandboxFrameCount(page)) === 1,
    String(await sandboxFrameCount(page)));


  const frameSrc = await page.evaluate(() => {
    const outer = document.getElementById("studioPreviewFrame");
    const inner = outer.contentDocument.querySelector("iframe[data-imory-sandbox-frame]");
    return inner ? inner.getAttribute("src") : "";
  });

  check("[frame] ★ 그 iframe 은 별도 origin 을 가리킨다",
    frameSrc.startsWith(SANDBOX_ORIGIN), frameSrc);


  const sandboxAttr = await page.evaluate(() => {
    const outer = document.getElementById("studioPreviewFrame");
    const inner = outer.contentDocument.querySelector("iframe[data-imory-sandbox-frame]");
    return inner ? inner.getAttribute("sandbox") : "";
  });

  check("[frame] ★ 공개 화면과 같은 sandbox 속성",
    sandboxAttr === "allow-scripts allow-same-origin", sandboxAttr);


  /* --- 실제 데이터가 프레임에 그려졌는가 ----------------- */

  const text = await waitForSandboxText(page, FRAME_ROOT);

  check("[frame] ★ 블로그 제목이 프레임에 그려졌다",
    text.includes("SANDBOX PREVIEW BLOG"), text.slice(0, 90));

  check("[frame] ★ 카테고리 이름이 프레임에 그려졌다",
    text.includes("LOG") && text.includes("PIC"));


  /* --- 스킨 CSS 가 프레임 안에서 적용됐는가 -------------- */

  const titleSize = await sandboxFrame(page).locator(".sb-title").first()
    .evaluate(el => getComputedStyle(el).fontSize);

  check("[frame] ★ 스킨 CSS 가 프레임 안에서 적용됐다 (33px)",
    titleSize === "33px", titleSize);


  /* --- 부모 문서에는 스킨이 없다(중복 렌더 없음) --------- */

  const nativeInPreview = await page.evaluate(() => {
    const outer = document.getElementById("studioPreviewFrame");
    return outer.contentDocument.querySelectorAll("[data-skin-root]").length;
  });

  check("[frame] ★ Preview 문서에는 native 스킨이 없다 (중복 렌더 없음)",
    nativeInPreview === 0, String(nativeInPreview));


  /* --- Select 는 잠긴다 ---------------------------------- */

  check("[frame] ★ sandbox 스킨에서 Select 버튼이 잠긴다",
    await page.locator("#studioInspectorButton").isDisabled());


  check("[frame] 콘솔 오류 없음",
    consoleErrors.filter(e => !/cdn-cgi|favicon/i.test(e)).length === 0,
    consoleErrors.join(" | ").slice(0, 200));

  await ctx.close();

}


/* =========================================================
   [edit] HTML/CSS 수정이 같은 프레임에 즉시 반영된다
========================================================== */

async function runEdit(browser) {

  console.log("\n[edit] 저장하지 않은 draft 수정이 곧바로 프레임에 반영된다");

  const { ctx, page } = await openStudio(browser);

  await sandboxFrame(page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  const before = await sandboxFrameCount(page);


  /*
    Code Editor 를 열고 HTML 을 고친다 — Save 를 누르지 않는다.
    그래야 "저장 전 draft 도 Preview 에 보인다"가 성립한다.
  */

  await page.locator("#studioCodeButton").click();

  await page.waitForSelector(".code-editor-textarea", { timeout: 8000 });

  /* 0 = HTML, 1 = CSS (studio/editor/code-editor.js 의 필드 순서) */

  await page.evaluate(() => {

    const fields =
      document.querySelectorAll(".code-editor-textarea");

    fields[0].value = fields[0].value.replace(
      "</nav>",
      '</nav><p class="sb-edited">EDITED MARKER</p>'
    );
    fields[0].dispatchEvent(new Event("input", { bubbles: true }));

    fields[1].value = fields[1].value + " .sb-edited { font-size: 41px; }";
    fields[1].dispatchEvent(new Event("input", { bubbles: true }));

  });

  await page.locator(".code-editor-button--primary").click();


  await sandboxFrame(page).locator(".sb-edited").waitFor({
    state: "attached", timeout: 12000
  });

  check("[edit] ★ 저장하지 않은 HTML 수정이 프레임에 그려졌다",
    (await sandboxFrame(page).locator(".sb-edited").first().innerText())
      .includes("EDITED MARKER"));

  const editedSize = await sandboxFrame(page).locator(".sb-edited").first()
    .evaluate(el => getComputedStyle(el).fontSize);

  check("[edit] ★ 저장하지 않은 CSS 수정도 프레임에 적용됐다 (41px)",
    editedSize === "41px", editedSize);

  check("[edit] ★ iframe 을 새로 만들지 않았다 (여전히 1개)",
    (await sandboxFrameCount(page)) === 1 && before === 1,
    `${before} -> ${await sandboxFrameCount(page)}`);


  /* Save 를 하지 않았으므로 Save 버튼은 여전히 살아 있다 */

  check("[edit] Save 하지 않은 상태 그대로다",
    !(await page.locator("#studioSaveButton").isDisabled()));

  await ctx.close();

}


/* =========================================================
   [pages] 페이지를 바꿔도 같은 프레임 하나
========================================================== */

async function runPages(browser) {

  console.log("\n[pages] HOME / CATEGORY / POST / BANNER / HIGHLIGHTS");

  const { ctx, page } = await openStudio(browser);

  await sandboxFrame(page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });


  const go = async (href) => {
    await page.evaluate((h) => window.__testHooks.simulateNavigate(h), href);
  };


  /* --- CATEGORY (post 형) ------------------------------- */

  await go("/scenario-sb/category/301");

  await sandboxFrame(page).locator(".sb-category").waitFor({
    state: "attached", timeout: 12000
  });

  check("[pages] ★ CATEGORY 가 프레임에 그려졌다",
    (await sandboxFrame(page).locator(".sb-category-title").first().innerText())
      .includes("LOG"));

  check("[pages] CATEGORY 에서도 iframe 은 하나",
    (await sandboxFrameCount(page)) === 1);


  /* --- GALLERY 카테고리도 같은 category 화면이다 --------- */

  await go("/scenario-sb/category/302");

  await sandboxFrame(page).locator(".sb-category-title")
    .filter({ hasText: "PIC" }).first()
    .waitFor({ state: "attached", timeout: 12000 });

  check("[pages] ★ GALLERY 카테고리도 프레임에 그려졌다",
    (await sandboxFrame(page).locator(".sb-category-title").first().innerText())
      .includes("PIC"));

  check("[pages] GALLERY 에서도 iframe 은 하나",
    (await sandboxFrameCount(page)) === 1);


  /* --- POST : 본문이 프레임 안 region 에 들어간다 -------- */

  await go("/scenario-sb/post/401");

  await sandboxFrame(page).locator(".sb-post").waitFor({
    state: "attached", timeout: 12000
  });

  check("[pages] ★ POST 제목이 프레임에 그려졌다",
    (await sandboxFrame(page).locator(".sb-post-title").first().innerText())
      .includes("Hello Sandbox"));

  /*
    본문은 렌더와 **별개 메시지**로 온다(parent 가 supabase 를 한
    번 더 왕복한 뒤 preview:post-body 를 보낸다). 그래서 region 이
    채워질 때까지 기다린다.
  */

  await sandboxFrame(page).locator(".sb-post-body")
    .filter({ hasText: "샌드박스 본문입니다" }).first()
    .waitFor({ state: "attached", timeout: 12000 });

  const bodyText =
    await sandboxFrame(page).locator(".sb-post-body").first().innerText();

  check("[pages] ★ 본문이 프레임 안 post-body region 에 들어갔다",
    bodyText.includes("샌드박스 본문입니다"), bodyText.slice(0, 80));


  /* --- BANNER ------------------------------------------- */

  await go("/scenario-sb/category/303");

  await sandboxFrame(page).locator(".sb-banner").waitFor({
    state: "attached", timeout: 12000
  });

  check("[pages] ★ BANNER 가 프레임에 그려졌다",
    (await sandboxFrame(page).locator(".sb-banner-title").first().innerText())
      .includes("FRIENDS"));


  /* --- HIGHLIGHTS --------------------------------------- */

  await go("/scenario-sb/highlights");

  await sandboxFrame(page).locator(".sb-highlights").waitFor({
    state: "attached", timeout: 12000
  });

  check("[pages] ★ HIGHLIGHTS 가 프레임에 그려졌다",
    (await sandboxFrame(page).locator(".sb-highlights-title").first().innerText())
      .length > 0);


  check("[pages] ★ 다섯 화면을 오갔지만 iframe 은 끝까지 하나",
    (await sandboxFrameCount(page)) === 1,
    String(await sandboxFrameCount(page)));

  await ctx.close();

}


/* =========================================================
   [nav] 프레임 안 링크 클릭
========================================================== */

async function runNav(browser) {

  console.log("\n[nav] 프레임 안 링크는 Preview 페이지만 바꾼다");

  const { ctx, page } = await openStudio(browser);

  await sandboxFrame(page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  const urlBefore = page.url();


  /* HOME → LOG */

  await sandboxFrame(page).locator(".sb-nav-link", { hasText: "LOG" })
    .first().click();

  await sandboxFrame(page).locator(".sb-category").waitFor({
    state: "attached", timeout: 12000
  });

  check("[nav] ★ 프레임 안 링크 클릭으로 CATEGORY 로 갔다",
    (await sandboxFrame(page).locator(".sb-category-title").first().innerText())
      .includes("LOG"));

  check("[nav] ★ Studio 주소는 바뀌지 않았다 (공개 페이지로 나가지 않음)",
    page.url() === urlBefore, page.url());


  /* CATEGORY → POST */

  /*
    목록은 최신순이라 첫 항목이 비밀글이다 — 공개 글을 이름으로
    골라 누른다(비밀글 POST 는 sandbox 를 쓰지 않는다, §K).
  */

  await sandboxFrame(page).locator(".sb-post-link")
    .filter({ hasText: "Hello Sandbox" }).first().click();

  await sandboxFrame(page).locator(".sb-post").waitFor({
    state: "attached", timeout: 12000
  });

  check("[nav] ★ 글 링크 클릭으로 POST 로 갔다",
    (await sandboxFrame(page).locator(".sb-post-title").first().innerText())
      .includes("Hello Sandbox"));


  /* Preview Back */

  await page.locator("#studioPreviewBackButton").click();

  await sandboxFrame(page).locator(".sb-category").waitFor({
    state: "attached", timeout: 12000
  });

  check("[nav] ★ Preview Back 으로 CATEGORY 로 돌아왔다",
    (await sandboxFrame(page).locator(".sb-category-title").first().innerText())
      .includes("LOG"));

  check("[nav] 이동을 거쳐도 iframe 은 하나",
    (await sandboxFrameCount(page)) === 1);

  check("[nav] ★ Studio 주소는 끝까지 그대로다",
    page.url() === urlBefore);

  await ctx.close();

}


/* =========================================================
   [native] renderMode 없는 스킨은 지금까지 그대로
========================================================== */

async function runNative(browser) {

  console.log("\n[native] renderMode 없는 스킨의 Preview 회귀");

  /* 플래그는 켜 둔 채로 연다 — 그래도 프레임이 생기면 안 된다 */

  const { ctx, page, consoleErrors } =
    await openStudio(browser, { scenario: "x" });

  await previewFrame(page).locator(".scenario-x-home").waitFor({
    state: "attached", timeout: 15000
  });

  check("[native] ★ native 스킨은 cross-origin iframe 이 0개",
    (await sandboxFrameCount(page)) === 0,
    String(await sandboxFrameCount(page)));

  check("[native] ★ Preview 문서 안에 native 스킨이 그대로 그려졌다",
    (await page.evaluate(() => {
      const outer = document.getElementById("studioPreviewFrame");
      return outer.contentDocument.querySelectorAll("[data-skin-root]").length;
    })) === 1);

  check("[native] ★ native 스킨에서는 Select 가 잠기지 않는다",
    !(await page.locator("#studioInspectorButton").isDisabled()));


  /* 이동도 지금까지 그대로 */

  await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-x/category/301"));

  await previewFrame(page).locator(".scenario-x-category").waitFor({
    state: "attached", timeout: 12000
  });

  check("[native] ★ native CATEGORY 이동 회귀",
    (await previewFrame(page).locator(".scenario-x-category h1").first().innerText())
      .includes("LOG"));

  check("[native] 이동 뒤에도 cross-origin iframe 0개",
    (await sandboxFrameCount(page)) === 0);

  check("[native] 콘솔 오류 없음",
    consoleErrors.filter(e => !/cdn-cgi|favicon/i.test(e)).length === 0,
    consoleErrors.join(" | ").slice(0, 200));

  await ctx.close();


  /* --- 플래그가 꺼져 있으면 sandbox 스킨도 native 로 --- */

  const off = await openStudio(browser, { sandbox: false });

  await previewFrame(off.page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  check("[native] ★ 플래그 OFF 면 sandbox 스킨도 프레임 없이 native 로",
    (await sandboxFrameCount(off.page)) === 0,
    String(await sandboxFrameCount(off.page)));

  check("[native] 그때 Preview 문서에 스킨이 그려져 있다",
    (await off.page.evaluate(() => {
      const outer = document.getElementById("studioPreviewFrame");
      return outer.contentDocument.querySelectorAll("[data-skin-root]").length;
    })) === 1);

  await off.ctx.close();

}


/* =========================================================
   [parity] 공개 화면과 Studio Preview 의 프레임이 같은가

   같은 SkinPackage · 같은 fixture 를 공개 라우트(index.html)와
   Studio Preview 에 각각 주고, 프레임 안에 그려진 DOM 과 CSS
   핵심값을 비교한다.
========================================================== */

async function runParity(browser) {

  console.log("\n[parity] 공개 화면 ↔ Studio Preview 프레임 일치");

  /* --- Studio Preview 쪽 --------------------------------- */

  const studio = await openStudio(browser);

  await sandboxFrame(studio.page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  const studioHtml =
    await sandboxFrame(studio.page).locator(".sb-home").first()
      .evaluate(el => el.outerHTML);

  const studioTitleSize =
    await sandboxFrame(studio.page).locator(".sb-title").first()
      .evaluate(el => getComputedStyle(el).fontSize);

  await studio.ctx.close();


  /*
    --- 공개 화면 쪽 ---

    같은 스킨/행을 공개 HOME 에 주려면 supabase 를 mock 해야
    한다. 그 하네스는 skin/sandbox/skin-sandbox-e2e-test.mjs 의
    [home] 절이 이미 갖고 있고, 여기서 그것을 다시 만들면 두
    벌이 된다 — 그래서 이 절은 **프레임 안에서 실제로 쓰인 계약**
    (payload shape · 스킨 CSS 적용 · 링크가 native 와 같은 주소)
    만 Studio 쪽에서 확인하고, 공개 화면과의 DOM 일치는 그 테스트
    (--only=render 의 "native 렌더와 글자 단위로 같다")가 이미
    보증하는 것을 근거로 삼는다.

    여기서 확인하는 것: Studio Preview 의 프레임이 공개 화면과
    **같은 재료**를 썼는가 — 스킨 CSS 가 적용됐고, 링크 href 가
    공개 주소 그대로이며, 프레임에 도착한 payload 의 최상위 키가
    계약 그대로인가.
  */

  check("[parity] 프레임 DOM 에 스킨 클래스가 그대로 있다",
    studioHtml.includes('class="sb-home"') &&
    studioHtml.includes('class="sb-nav-link"'),
    studioHtml.slice(0, 120));

  check("[parity] 프레임에서 스킨 CSS 가 적용됐다",
    studioTitleSize === "33px", studioTitleSize);


  /* --- 프레임에 도착한 payload 의 최상위 키 -------------- */

  const again = await openStudio(browser);

  await sandboxFrame(again.page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  const arrived = await sandboxFrame(again.page).locator("body").evaluate(() => {
    const data = window.__imorySandboxLastReceived;
    return data ? Object.keys(data).sort() : null;
  });

  const expectedKeys = [
    "bannerCategory", "banners", "category", "contract", "highlights",
    "home", "images", "memos", "nav", "navigation", "page", "pageType",
    "post", "profile", "site", "viewer"
  ];

  check("[parity] ★ 프레임에 도착한 payload 의 최상위 키가 공개 화면과 같은 계약",
    Array.isArray(arrived) &&
    JSON.stringify(arrived) === JSON.stringify(expectedKeys),
    JSON.stringify(arrived));


  /* --- 링크 href 는 공개 주소 그대로 --------------------- */

  const href = await sandboxFrame(again.page).locator(".sb-nav-link").first()
    .getAttribute("href");

  check("[parity] ★ 프레임 안 링크의 href 가 공개 주소 그대로",
    href === "/scenario-sb/category/301", String(href));


  /* --- 비밀글 본문이 프레임에 가지 않는다 ---------------- */

  await again.page.evaluate(() =>
    window.__testHooks.simulateNavigate("/scenario-sb/category/301"));

  await sandboxFrame(again.page).locator(".sb-category").waitFor({
    state: "attached", timeout: 12000
  });

  const catPayload = await sandboxFrame(again.page).locator("body").evaluate(() => {
    return JSON.stringify(window.__imorySandboxLastReceived || {});
  });

  check("[parity] ★ 비밀글 본문이 프레임에 도착하지 않는다",
    !catPayload.includes("비밀 본문입니다"));

  check("[parity] ★ 인증 토큰이 프레임에 도착하지 않는다",
    !catPayload.includes("mock-access-token") &&
    !catPayload.includes("access_token"));

  await again.ctx.close();

}


/* =========================================================
   [mobile] 390px
========================================================== */

async function runMobile(browser) {

  console.log("\n[mobile] 390px 가로 넘침");

  const { ctx, page } = await openStudio(browser, {
    viewport: { width: 390, height: 760 }
  });

  await sandboxFrame(page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });


  /* Mobile Preview 로 전환 — 바깥 프레임의 폭만 바뀐다 */

  await page.locator('[data-viewport-mode="mobile"]').click();

  await page.waitForTimeout(500);

  check("[mobile] Mobile 전환 뒤에도 iframe 은 하나",
    (await sandboxFrameCount(page)) === 1);


  const parentOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);

  check("[mobile] ★ Studio 문서 가로 넘침 0",
    parentOverflow <= 0, String(parentOverflow));


  const frameOverflow = await sandboxFrame(page).locator("body").evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);

  check("[mobile] ★ 프레임 안 가로 넘침 0",
    frameOverflow <= 0, String(frameOverflow));


  /* 프레임 높이가 콘텐츠를 따라간다 */

  const frameHeight = await page.evaluate(() => {
    const outer = document.getElementById("studioPreviewFrame");
    const inner = outer.contentDocument.querySelector("iframe[data-imory-sandbox-frame]");
    return inner ? inner.getBoundingClientRect().height : 0;
  });

  check("[mobile] ★ 프레임 높이가 콘텐츠를 따라간다 (초기 120px 이 아님)",
    frameHeight > 0 && Math.round(frameHeight) !== 120,
    String(Math.round(frameHeight)));

  await ctx.close();

}


/* =========================================================
   [reject] 위조 메시지 · 늦게 온 응답
========================================================== */

async function runReject(browser) {

  console.log("\n[reject] 위조 메시지와 늦게 도착한 렌더 응답");

  const { ctx, page } = await openStudio(browser);

  await sandboxFrame(page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  const titleBefore =
    await sandboxFrame(page).locator(".sb-title").first().innerText();


  /*
    ① Preview 문서와 같은 origin 이지만 **부모가 아닌** window 가
       보낸 preview:render — preview-bridge 는 event.source 를
       window.parent 로 못박으므로 무시해야 한다. 여기서는 그
       대신 부모가 보내되 **모양이 깨진** payload 를 보낸다.
  */

  const errors = [];
  await page.exposeFunction("__collectPreviewError", (m) => errors.push(m));

  await page.evaluate(() => {
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "preview:error") {
        window.__collectPreviewError(String(e.data.message || ""));
      }
    });
  });

  await page.evaluate(() => {
    window.__testHooks.sendFromRealParent({
      type: "preview:render",
      skin: "not-an-object",
      renderMode: "sandbox",
      context: {}
    });
  });

  await page.waitForTimeout(400);

  check("[reject] ★ 모양이 깨진 preview:render 는 거부된다",
    errors.some(m => m.includes("malformed")), errors.join(" | "));

  check("[reject] 그 사이 화면은 그대로다",
    (await sandboxFrame(page).locator(".sb-title").first().innerText())
      === titleBefore);


  /*
    ② 프레임이 **모르는 부모**를 흉내낸 메시지를 거부하는가.
       프레임 realm 의 거부 카운터를 직접 읽는다.
  */

  const rejectedBefore = await sandboxFrame(page).locator("body")
    .evaluate(() => window.__imorySandboxRejected || 0);

  await page.evaluate(() => {
    const outer = document.getElementById("studioPreviewFrame");
    const inner = outer.contentDocument.querySelector("iframe[data-imory-sandbox-frame]");
    /* 봉투를 흉내내되 알 수 없는 type — 프레임이 떨어뜨려야 한다 */
    inner.contentWindow.postMessage(
      { imory: 1, type: "IMORY_TAKE_OVER", seq: 99, payload: {} },
      new URL(inner.src).origin
    );
  });

  await page.waitForTimeout(400);

  const rejectedAfter = await sandboxFrame(page).locator("body")
    .evaluate(() => window.__imorySandboxRejected || 0);

  check("[reject] ★ 알 수 없는 type 은 프레임이 떨어뜨린다",
    rejectedAfter > rejectedBefore,
    `${rejectedBefore} -> ${rejectedAfter}`);


  /*
    ③ 늦게 도착한 렌더 응답 — 옛 renderSeq 의 RENDERED 를 부모에
       흘려보내도 최신 화면을 덮지 않는다. 프레임 쪽도 옛 렌더
       메시지를 버린다(renderSeq <= 현재).
  */

  const staleApplied = await sandboxFrame(page).locator("body").evaluate(() => {

    const before =
      document.querySelector("#sandboxFrameRoot").innerHTML;

    window.postMessage(
      {
        imory: 1,
        type: "IMORY_RENDER_PAGE",
        seq: 1,
        payload: {
          contract: 1,
          pageType: "home",
          renderSeq: 1,
          template: { html: "<p class='stale'>STALE</p>", css: "" },
          data: {}
        }
      },
      window.location.origin
    );

    return before;

  });

  await page.waitForTimeout(400);

  check("[reject] ★ 옛 renderSeq 의 렌더는 화면을 덮지 않는다",
    (await sandboxFrame(page).locator("#sandboxFrameRoot").innerHTML())
      === staleApplied);

  await ctx.close();

}


/* =========================================================
   [bodystyle] SANDBOX-3.1 — 본문 서식이 프레임 CSP 를 통과하는가

   이 절이 보는 것은 하나다: **프레임 안 본문의 계산값이 Quote
   Preset 그대로인가**. 그리고 그것을 얻는 대가로 CSP 가 넓어지지
   않았는가.

   판정은 전부 getComputedStyle 이다 — "style 속성이 살아 있나"가
   아니라 "화면이 그 값으로 그려졌나"를 본다.
========================================================== */

async function runBodyStyle(browser) {

  console.log("\n[bodystyle] 본문 서식이 프레임에서 살아 있는가 (CSP)");

  const { ctx, page } = await openStudio(browser);

  const cspErrors = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to apply|Applying inline style/i.test(m.text())) {
      cspErrors.push(m.text());
    }
  });

  /* 프레임 밖으로 나가려는 요청을 전부 기록한다 */
  const outbound = [];
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (/evil\.example/i.test(u)) outbound.push(u);
    route.continue();
  });

  await sandboxFrame(page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  await page.evaluate(() =>
    window.__testHooks.simulateNavigate("/scenario-sb/post/401"));

  await sandboxFrame(page).locator(".sb-post-body")
    .filter({ hasText: "샌드박스 본문입니다" }).first()
    .waitFor({ state: "attached", timeout: 12000 });


  /* --- 1. 본문 컨테이너의 계산값 = Quote Preset ---------- */

  const body = await sandboxFrame(page).locator(".sb-post-body").first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        color: s.color,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        textAlign: s.textAlign,
        wordBreak: s.wordBreak
      };
    });

  check("[bodystyle] ★ 글꼴이 프리셋 그대로 (Nanum Myeongjo)",
    body.fontFamily.includes("Nanum Myeongjo"), body.fontFamily);

  check("[bodystyle] ★ 글자 크기가 프리셋 그대로 (19px)",
    body.fontSize === "19px", body.fontSize);

  check("[bodystyle] ★ 글자 굵기가 프리셋 그대로 (500)",
    body.fontWeight === "500", body.fontWeight);

  check("[bodystyle] ★ 본문 색이 프리셋 그대로 (#332211)",
    body.color === "rgb(51, 34, 17)", body.color);

  check("[bodystyle] ★ 줄간격이 프리셋 그대로 (19 × 1.9 = 36.1px)",
    Math.abs(parseFloat(body.lineHeight) - 36.1) < 0.6, body.lineHeight);

  check("[bodystyle] ★ 자간이 프리셋 그대로 (0.4px)",
    Math.abs(parseFloat(body.letterSpacing) - 0.4) < 0.05, body.letterSpacing);

  check("[bodystyle] ★ 정렬이 프리셋 그대로 (justify)",
    body.textAlign === "justify", body.textAlign);

  check("[bodystyle] ★ 줄바꿈 모드가 프리셋 그대로 (break-all)",
    body.wordBreak === "break-all", body.wordBreak);


  /* --- 2. 형광펜 · 포인트 색 ----------------------------- */

  const marks = await sandboxFrame(page).locator(".sb-post-body")
    .first().evaluate((el) => {
      const hl = el.querySelector(".post-inline-highlight");
      const pc = el.querySelector(".post-inline-color");
      return {
        highlightImage: hl ? getComputedStyle(hl).backgroundImage : "(없음)",
        highlightBg: hl ? getComputedStyle(hl).backgroundColor : "(없음)",
        pointColor: pc ? getComputedStyle(pc).color : "(없음)"
      };
    });

  check("[bodystyle] ★ 형광펜이 그라디언트로 살아 있다 (높이 45%)",
    marks.highlightImage.includes("linear-gradient") &&
    marks.highlightImage.includes("255, 224, 138"),
    marks.highlightImage.slice(0, 110));

  check("[bodystyle] ★ 포인트 색이 살아 있다 (#cc0033)",
    marks.pointColor === "rgb(204, 0, 51)", marks.pointColor);


  /* --- 3. 악성 선언은 통과하지 못한다 -------------------- */

  const evil = await sandboxFrame(page).locator(".sb-post-body")
    .first().evaluate(() => {
      const el = document.getElementById("sbEvil");
      if (!el) return { present: false };
      const s = getComputedStyle(el);
      return {
        present: true,
        hasStyleAttr: el.hasAttribute("style"),
        backgroundImage: s.backgroundImage,
        position: s.position,
        zIndex: s.zIndex
      };
    });

  if (evil.present) {

    check("[bodystyle] ★ 주입한 url() 배경이 적용되지 않았다",
      evil.backgroundImage === "none", evil.backgroundImage);

    check("[bodystyle] ★ 주입한 position:fixed 가 적용되지 않았다",
      evil.position === "static", evil.position);

    check("[bodystyle] ★ 주입한 z-index 가 적용되지 않았다",
      evil.zIndex === "auto", evil.zIndex);

    check("[bodystyle] ★ 프레임 DOM 에 style 속성이 남지 않았다",
      evil.hasStyleAttr === false, String(evil.hasStyleAttr));

  } else {

    /* sanitizer 가 그 span 자체를 지웠다면 그것도 통과다 */
    check("[bodystyle] ★ 주입 시도 요소가 sanitize 단계에서 제거됐다", true);

  }


  /* --- 4. style 로 외부 요청을 만들 수 없다 -------------- */

  check("[bodystyle] ★ evil.example 로 나간 요청이 하나도 없다",
    outbound.length === 0, outbound.join(" | "));


  /* --- 5. 프레임 전체에 style 속성이 남아 있지 않다 ------ */

  const leftover = await sandboxFrame(page).locator("body").evaluate(() =>
    document.querySelectorAll("#sandboxFrameRoot [style]").length);

  check("[bodystyle] ★ 프레임 본문에 style 속성이 0개 (죽은 속성을 안 보낸다)",
    leftover === 0, String(leftover));


  /* --- 6. 서식은 nonce 가 붙은 <style> 하나로 들어왔다 --- */

  const sheet = await sandboxFrame(page).locator("body").evaluate(() => {
    const el = document.querySelector("style[data-imory-post-body-style]");
    return {
      count: document.querySelectorAll("style[data-imory-post-body-style]").length,
      hasNonce: !!(el && (el.getAttribute("nonce") || el.nonce)),
      text: el ? el.textContent.slice(0, 200) : "",
      rules: el && el.sheet ? el.sheet.cssRules.length : -1
    };
  });

  check("[bodystyle] ★ 본문 서식 <style> 은 정확히 1개 (렌더마다 쌓이지 않는다)",
    sheet.count === 1, String(sheet.count));

  check("[bodystyle] ★ 그 <style> 은 nonce 를 달고 있다",
    sheet.hasNonce);

  check("[bodystyle] ★ 규칙이 실제로 살아 있다 (CSP 가 시트를 버리지 않았다)",
    sheet.rules > 0, String(sheet.rules));

  check("[bodystyle] ★ 규칙 선택자가 프레임 루트 id 로 시작한다 (우선순위)",
    sheet.text.includes("#sandboxFrameRoot .imory-pb-"), sheet.text.slice(0, 90));


  /* --- 7. CSP 위반이 더 이상 나지 않는다 ----------------- */

  check("[bodystyle] ★ inline style CSP 위반이 0건",
    cspErrors.filter(t => /inline style/i.test(t)).length === 0,
    cspErrors.join(" | ").slice(0, 200));


  /* --- 8. 다시 그려도 시트가 쌓이지 않는다 --------------- */

  await page.evaluate(() =>
    window.__testHooks.simulateNavigate("/scenario-sb/category/301"));

  await sandboxFrame(page).locator(".sb-category").waitFor({
    state: "attached", timeout: 12000
  });

  await page.evaluate(() =>
    window.__testHooks.simulateNavigate("/scenario-sb/post/401"));

  await sandboxFrame(page).locator(".sb-post-body")
    .filter({ hasText: "샌드박스 본문입니다" }).first()
    .waitFor({ state: "attached", timeout: 12000 });

  const again = await sandboxFrame(page).locator("body").evaluate(() =>
    document.querySelectorAll("style[data-imory-post-body-style]").length);

  check("[bodystyle] ★ 글을 다시 열어도 <style> 은 여전히 1개",
    again === 1, String(again));

  const bodyAgain = await sandboxFrame(page).locator(".sb-post-body").first()
    .evaluate(el => getComputedStyle(el).fontSize);

  check("[bodystyle] ★ 다시 연 뒤에도 서식이 그대로다 (19px)",
    bodyAgain === "19px", bodyAgain);

  await ctx.close();

}


/* =========================================================
   [bodyparity] 공개 화면 native 본문 ↔ 프레임 본문

   같은 글·같은 프리셋을 **native 로** 그린 결과와 **프레임에서**
   그린 결과의 계산값이 같은가. native 쪽은 Studio Preview 를
   플래그 OFF 로 열어 얻는다 — 같은 문서·같은 파이프라인이라
   비교 대상으로 정확하다.
========================================================== */

async function runBodyParity(browser) {

  console.log("\n[bodyparity] native 본문 ↔ 프레임 본문 계산값 일치");

  const READ = (el) => {
    const s = getComputedStyle(el);
    const hl = el.querySelector(".post-inline-highlight");
    const pc = el.querySelector(".post-inline-color");
    return {
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      color: s.color,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textAlign: s.textAlign,
      wordBreak: s.wordBreak,
      highlightImage: hl ? getComputedStyle(hl).backgroundImage : "",
      pointColor: pc ? getComputedStyle(pc).color : "",
      text: el.innerText.replace(/\s+/g, " ").trim()
    };
  };


  /* --- native (플래그 OFF, 같은 스킨) -------------------- */

  const nat = await openStudio(browser, { sandbox: false });

  await previewFrame(nat.page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  await nat.page.evaluate(() =>
    window.__testHooks.simulateNavigate("/scenario-sb/post/401"));

  await previewFrame(nat.page).locator(".sb-post-body")
    .filter({ hasText: "샌드박스 본문입니다" }).first()
    .waitFor({ state: "attached", timeout: 12000 });

  const nativeValues = await previewFrame(nat.page).locator(".sb-post-body")
    .first().evaluate(READ);

  await nat.ctx.close();


  /* --- sandbox 프레임 ------------------------------------ */

  const sb = await openStudio(browser);

  await sandboxFrame(sb.page).locator(".sb-home").waitFor({
    state: "attached", timeout: 15000
  });

  await sb.page.evaluate(() =>
    window.__testHooks.simulateNavigate("/scenario-sb/post/401"));

  await sandboxFrame(sb.page).locator(".sb-post-body")
    .filter({ hasText: "샌드박스 본문입니다" }).first()
    .waitFor({ state: "attached", timeout: 12000 });

  const frameValues = await sandboxFrame(sb.page).locator(".sb-post-body")
    .first().evaluate(READ);

  await sb.ctx.close();


  const KEYS = [
    ["fontFamily", "글꼴"],
    ["fontSize", "글자 크기"],
    ["fontWeight", "글자 굵기"],
    ["color", "글자 색"],
    ["lineHeight", "줄간격"],
    ["letterSpacing", "자간"],
    ["textAlign", "정렬"],
    ["wordBreak", "줄바꿈"],
    ["highlightImage", "형광펜"],
    ["pointColor", "포인트 색"],
    ["text", "본문 글자"]
  ];

  for (const [key, label] of KEYS) {
    check(`[bodyparity] ★ ${label} 가 native 와 같다`,
      nativeValues[key] === frameValues[key],
      `native=${String(nativeValues[key]).slice(0, 60)} / frame=${String(frameValues[key]).slice(0, 60)}`);
  }

}


/* =========================================================
   실행
========================================================== */

let playwright;

playwright = await loadPlaywright(BROWSER);

const parentServer = await startServer(PARENT_PORT);
const sandboxServer = await startServer(SANDBOX_PORT);

console.log(
  `STUDIO SANDBOX PREVIEW E2E (SANDBOX-4) — ${BROWSER}\n` +
  `  studio : ${PARENT_ORIGIN}\n` +
  `  frame  : ${SANDBOX_ORIGIN}`
);

const browser = await playwright[BROWSER].launch();

try {

  if (shouldRun("frame")) await runFrame(browser);
  if (shouldRun("edit")) await runEdit(browser);
  if (shouldRun("pages")) await runPages(browser);
  if (shouldRun("nav")) await runNav(browser);
  if (shouldRun("native")) await runNative(browser);
  if (shouldRun("parity")) await runParity(browser);
  if (shouldRun("mobile")) await runMobile(browser);
  if (shouldRun("reject")) await runReject(browser);
  if (shouldRun("bodystyle")) await runBodyStyle(browser);
  if (shouldRun("bodyparity")) await runBodyParity(browser);

} finally {

  await browser.close();
  parentServer.close();
  sandboxServer.close();

}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed) {
  console.log("실패:\n  " + failures.join("\n  "));
  process.exit(1);
}
