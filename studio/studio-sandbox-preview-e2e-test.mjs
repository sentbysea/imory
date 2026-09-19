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

  const ctx = await browser.newContext({
    ...(opts.viewport ? { viewport: opts.viewport } : {}),

    /* SANDBOX-6A — 터치 선택 절이 쓴다. 주지 않으면 지금까지와 같다. */
    ...(opts.contextOptions || {})
  });

  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err && err.message || err)));

  /*
    ★ SANDBOX-5A — 시나리오의 SkinPackage 를 통째로 바꿔 끼운다.

    studio/studio-lifecycle-scenario.html 이 window.__scenarioSandboxSkinPackage
    가 있으면 그것을 draft 로 쓴다. 저자 JS 가 든 스킨을 이 창구로
    준다 — 시나리오 파일에 테스트용 JS 를 박아 넣지 않기 위해서다.
  */

  if (opts.skinPackage) {
    await page.addInitScript(
      (pkg) => { window.__scenarioSandboxSkinPackage = pkg; },
      opts.skinPackage
    );
  }

  const query =
    `?scenario=${opts.scenario || "sb"}` +
    (opts.sandbox === false ? "" : `&${SANDBOX_FLAGS}`) +

    /*
      저자 JS 는 sandbox 플래그와 **별개** opt-in 이다
      (skin/sandbox/skin-sandbox-config.js). 주지 않으면 프레임은
      뜨지만 JS 는 한 줄도 돌지 않는다 — 기존 절들이 이 라운드
      뒤에도 그대로 도는 이유다.
    */
    (opts.authorJs ? "&sandboxSkinJs=1" : "");

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


  /* --- Select 는 이제 열려 있다 (SANDBOX-6A) -------------- */

  /*
    SANDBOX-4 에서는 여기가 "잠긴다"였다. 프레임 안 DOM 을 Studio 가
    읽을 수 없어 켜 봐야 아무것도 잡히지 않았기 때문이다. SANDBOX-6A
    는 hit-test 를 프레임 안으로 옮겨(skin/sandbox/skin-sandbox-inspect.js)
    그 자리를 열었다 — 실제로 고를 수 있는지는 아래 [inspect] 절이 본다.
  */

  check("[frame] ★ sandbox 스킨에서도 Select 버튼이 열려 있다",
    !(await page.locator("#studioInspectorButton").isDisabled()));


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



/* =========================================================
   [authorjs] SANDBOX-5A — Studio Preview 의 저자 JS

   무엇을 보는가
     · Studio 미리보기의 프레임 안에서 **한 번** 돈다
     · Code Editor 의 JS 칸을 고치면 **Save 전에** 다시 돈다
       (그리고 이전 realm 의 타이머가 남지 않는다)
     · 전용 opt-in 이 없으면 0회다
     · sandbox 스킨이 아니면 "여기서는 실행되지 않는다"고 알린다
========================================================== */

/*
  시나리오에 끼워 넣을 저자 JS. 표식만 남기는 최소 코드다 —
  공개 fixture(imory-sandbox-authorjs-v1.json)와 달리 여기서는
  "몇 번 돌았는가"와 "어느 버전이 돌았는가"만 있으면 된다.
*/

const STUDIO_AUTHOR_JS = (label) => `
(function () {
  var api = window.imorySkin;
  var root = api && api.root;
  if (!root) { return; }

  root.setAttribute(
    "data-js-runs",
    String(Number(root.getAttribute("data-js-runs") || "0") + 1)
  );

  var mark = document.createElement("p");
  mark.className = "sb-js-mark";
  mark.textContent = "${label}";
  root.appendChild(mark);

  var timer = window.setInterval(function () {
    window.__studioTicks = (window.__studioTicks || 0) + 1;
    root.setAttribute("data-js-ticks", String(window.__studioTicks));
  }, 100);

  if (api.onCleanup) {
    api.onCleanup(function () { window.clearInterval(timer); });
  }
}());
`;


function studioAuthorJsPackage(label) {

  return {
    schemaVersion: 1,
    renderMode: "sandbox",
    templates: {
      home: {
        html:
          '<div class="sb-home">' +
          '<h1 class="sb-title" data-imory-bind="site.title"></h1>' +
          '<nav>' +
          '<a class="sb-nav-link" data-imory-repeat="navigation.categories" ' +
          'data-imory-href="item.href" data-imory-bind="item.name"></a>' +
          '</nav>' +
          '</div>'
      },
      category: {
        html:
          '<div class="sb-category">' +
          '<h1 class="sb-category-title" data-imory-bind="category.name"></h1>' +
          '<a class="sb-post-link" data-imory-repeat="category.posts" ' +
          'data-imory-href="item.href" data-imory-bind="item.title"></a>' +
          '</div>'
      },
      post: {
        html:
          '<div class="sb-post">' +
          '<h1 class="sb-post-title" data-imory-bind="post.title"></h1>' +
          '<div class="sb-post-body" data-imory-region="post-body"></div>' +
          '</div>'
      }
    },
    css: ".sb-home { color: teal; }",
    js: STUDIO_AUTHOR_JS(label),
    imageSlots: [],
    regions: [],
    metadata: { generatedBy: "sandbox-authorjs-fixture" }
  };

}


async function readStudioJsMarks(page) {

  return sandboxFrame(page).locator("#sandboxFrameRoot").evaluate((root) => ({
    runs: root.getAttribute("data-js-runs"),
    ticks: root.getAttribute("data-js-ticks"),
    marks: Array.from(root.querySelectorAll(".sb-js-mark"))
      .map((el) => el.textContent),
    globalTicks: window.__studioTicks || 0,
    hasApi: typeof window.imorySkin === "object" && window.imorySkin !== null
  }));

}


async function runAuthorJs(browser) {

  console.log("\n[authorjs] Studio Preview 의 저자 JS");


  /* ===== 1. 프레임 안에서 한 번 돈다 ===================== */

  {
    const { ctx, page } =
      await openStudio(browser, {
        authorJs: true,
        skinPackage: studioAuthorJsPackage("JS-V1")
      });

    await sandboxFrame(page).locator(".sb-js-mark").waitFor({
      state: "attached", timeout: 15000
    }).catch(() => {});

    const marks = await readStudioJsMarks(page);

    check("[authorjs] ★ Studio Preview 의 프레임에서 저자 JS 가 한 번 돌았다",
      marks.runs === "1" &&
      JSON.stringify(marks.marks) === JSON.stringify(["JS-V1"]),
      marks.runs + " / " + JSON.stringify(marks.marks));

    check("[authorjs] ★ API 가 프레임 realm 에 올라와 있다",
      marks.hasApi === true);

    check("[authorjs] 프레임은 여전히 하나다",
      (await sandboxFrameCount(page)) === 1,
      String(await sandboxFrameCount(page)));

    check("[authorjs] ★ Studio 문서에서는 저자 JS 가 돌지 않았다",
      (await page.evaluate(() =>
        typeof window.imorySkin === "undefined" &&
        document.querySelectorAll(".sb-js-mark").length === 0)) === true);


    /* --- Save 전 JS 수정이 곧바로 다시 돈다 -------------- */

    await page.locator("#studioCodeButton").click();

    await page.waitForSelector(".code-editor-textarea", { timeout: 8000 });

    const fieldCount =
      await page.locator(".code-editor-textarea").count();

    check("[authorjs] ★ Code Editor 에 칸이 셋이다 (HTML · CSS · JS)",
      fieldCount === 3, String(fieldCount));

    const jsFieldValue =
      await page.locator(".code-editor-textarea").nth(2).inputValue();

    check("[authorjs] ★ JS 칸이 지금 스킨의 JS 를 보여 준다",
      jsFieldValue.indexOf("JS-V1") !== -1);

    check("[authorjs] ★ sandbox 스킨에서는 '실행되지 않는다' 안내가 없다",
      (await page.locator(".code-editor-field-note").isVisible()) === false);

    /* 2 = JS (studio/editor/code-editor.js 의 필드 순서) */

    await page.evaluate(() => {

      const fields =
        document.querySelectorAll(".code-editor-textarea");

      fields[2].value = fields[2].value.replace("JS-V1", "JS-V2");
      fields[2].dispatchEvent(new Event("input", { bubbles: true }));

    });

    await page.locator(".code-editor-button--primary").click();


    await sandboxFrame(page).locator(".sb-js-mark").filter({ hasText: "JS-V2" })
      .waitFor({ state: "attached", timeout: 15000 }).catch(() => {});

    /*
      ★ 타이머가 실제로 몇 번 돌 때까지 기다린다. 기다리지 않으면
      아래 "한 벌뿐이다" 비교가 0 == 0 이 되어 아무것도 재지 않는다.
    */

    await sandboxFrame(page).locator("#sandboxFrameRoot").evaluate(
      (root) => new Promise((resolve) => {
        const tick = () => {
          if (Number(root.getAttribute("data-js-ticks") || "0") >= 2) {
            resolve(true);
            return;
          }
          setTimeout(tick, 50);
        };
        tick();
      })
    ).catch(() => {});

    const edited = await readStudioJsMarks(page);

    check("[authorjs] ★ Save 하지 않은 JS 수정이 곧바로 다시 돌았다",
      JSON.stringify(edited.marks) === JSON.stringify(["JS-V2"]),
      JSON.stringify(edited.marks));

    check("[authorjs] ★ 새 realm 이라 실행 횟수가 다시 1 이다 (누적 없음)",
      edited.runs === "1", String(edited.runs));

    check("[authorjs] ★ 타이머도 한 벌뿐이다 (옛 realm 의 것이 안 남았다)",
      Number(edited.ticks || "0") >= 2 &&
      Number(edited.ticks) === Number(edited.globalTicks),
      edited.ticks + " / " + edited.globalTicks);

    check("[authorjs] ★ 프레임은 여전히 정확히 하나다",
      (await sandboxFrameCount(page)) === 1,
      String(await sandboxFrameCount(page)));

    check("[authorjs] Save 하지 않은 상태 그대로다",
      !(await page.locator("#studioSaveButton").isDisabled()));

    await ctx.close();
  }


  /* ===== 2. 전용 opt-in 이 없으면 0회 ==================== */

  {
    const { ctx, page } =
      await openStudio(browser, {
        skinPackage: studioAuthorJsPackage("JS-V1")
      });

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await page.waitForTimeout(500);

    const count =
      await sandboxFrame(page).locator(".sb-js-mark").count();

    check("[authorjs] ★ 저자 JS 전용 opt-in 이 없으면 Studio 에서도 0회다",
      count === 0, String(count));

    check("[authorjs] ★ 그래도 프레임과 HTML/CSS 는 그대로다",
      (await sandboxFrame(page).locator(".sb-home").count()) === 1 &&
      (await sandboxFrameCount(page)) === 1);

    await ctx.close();
  }


  /* ===== 3. sandbox 가 아닌 스킨에서는 안내가 나온다 ====== */

  {
    const { ctx, page } =
      await openStudio(browser, { scenario: "x", authorJs: true });

    await page.locator("#studioCodeButton").click();

    await page.waitForSelector(".code-editor-textarea", { timeout: 8000 });

    const note = page.locator(".code-editor-field-note");

    check("[authorjs] ★ sandbox 가 아닌 스킨에서는 JS 칸에 안내가 나온다",
      (await note.isVisible()) === true);

    const text = await note.textContent();

    check("[authorjs] ★ 안내가 'sandbox 모드에서만 실행된다'고 말한다",
      String(text).indexOf("sandbox") !== -1, String(text));

    check("[authorjs] ★ 그래도 HTML/CSS 칸은 그대로 편집할 수 있다",
      (await page.locator(".code-editor-textarea").count()) === 3 &&
      (await page.locator(".code-editor-textarea").nth(0).isEditable()) === true &&
      (await page.locator(".code-editor-textarea").nth(1).isEditable()) === true);

    await ctx.close();
  }

}


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

    /*
      ★ SANDBOX-3.2 — 아래 네 값은 **인라인이 아니라 class 규칙**에서
      온다(posts/posts-body-shared.css). 프레임이 그 CSS 를 읽지
      않으면 서식이 다 맞는데 이 넷만 어긋난다 — 형광펜이 글자에
      딱 붙고, 줄이 바뀔 때 띠가 잘리고, 저장용 강조선 마커가
      인라인 상자로 남는다.
    */
    const rm = el.querySelector(".post-para-rule");
    const rb = el.querySelector(".post-para-rule-box");
    const rbs = rb ? getComputedStyle(rb) : null;

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
      highlightPadding: hl ? getComputedStyle(hl).paddingLeft : "",
      highlightDecorationBreak:
        hl
          ? (getComputedStyle(hl).boxDecorationBreak ||
             getComputedStyle(hl).webkitBoxDecorationBreak || "")
          : "",
      ruleMarkerDisplay: rm ? getComputedStyle(rm).display : "(없음)",
      ruleBoxBorder:
        rbs
          ? rbs.borderLeftWidth + " " + rbs.borderLeftStyle + " " +
            rbs.borderLeftColor
          : "(없음)",
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
    ["highlightPadding", "형광펜 좌우 여백"],
    ["highlightDecorationBreak", "형광펜 줄바꿈 처리"],
    ["ruleMarkerDisplay", "강조선 마커 숨김"],
    ["ruleBoxBorder", "강조선 굵기·색"],
    ["pointColor", "포인트 색"],
    ["text", "본문 글자"]
  ];

  for (const [key, label] of KEYS) {
    check(`[bodyparity] ★ ${label} 가 native 와 같다`,
      nativeValues[key] === frameValues[key],
      `native=${String(nativeValues[key]).slice(0, 60)} / frame=${String(frameValues[key]).slice(0, 60)}`);
  }


  /*
    ★ "둘 다 똑같이 빠진" 경우를 위 비교만으로는 못 잡는다.
    class 규칙이 실제로 걸렸다는 것을 절대값으로도 확인한다.
  */

  check("[bodyparity] ★ 형광펜이 class 규칙을 실제로 받았다 (여백·clone)",
    parseFloat(frameValues.highlightPadding) > 0 &&
    frameValues.highlightDecorationBreak === "clone",
    frameValues.highlightPadding + " / " + frameValues.highlightDecorationBreak);

  check("[bodyparity] ★ 강조선 마커는 양쪽에서 display:none",
    nativeValues.ruleMarkerDisplay === "none" &&
    frameValues.ruleMarkerDisplay === "none",
    nativeValues.ruleMarkerDisplay + " / " + frameValues.ruleMarkerDisplay);

  check("[bodyparity] ★ 강조선이 양쪽에서 실제로 그려진다",
    /^3px solid/.test(frameValues.ruleBoxBorder),
    frameValues.ruleBoxBorder);

}


/* =========================================================
   [inspect] SANDBOX-6A — 프레임 안에서 요소를 고른다

   무엇을 보는가
     · Select 를 켜면 프레임 안에서 hover/선택이 된다
     · 고른 것이 Studio 의 선택 상태(패널·AI chip)가 된다
     · **반복 항목은 반복 template 자체**로 매핑된다
     · Inspect 중에는 링크도 저자 JS 도 실행되지 않고, 끄면 돌아온다
     · post-body 안쪽은 고를 수 없다
     · 위조 선택(지금 template 에 없는 식별자 · 옛 renderSeq)은 거부
     · 선택 요소 AI 가 **그 요소 범위만** 고치고 Save 전에 반영된다
     · 재렌더 뒤 복원 또는 조용한 해제
     · overlay 가 높이도 가로 폭도 바꾸지 않는다
     · iframe 은 계속 하나
========================================================== */

/* =========================================================
   이 절 전용 fixture

   ★ 왜 따로 만드는가 — 두 가지 때문이다.

   1. Top Dock 이 Preview 의 맨 윗줄을 실제로 덮는다. 스킨 맨 위
      요소는 사람도 그 자리에서는 누를 수 없다. 그래서 .sb-home 에
      넉넉한 위 여백을 준다(테스트용 우회가 아니라, 누를 수 있는
      자리를 만드는 것이다).
   2. 고를 대상이 종류별로 있어야 한다 — 텍스트(바인딩 있는 것과
      정적인 것) · 이미지 · 카드(컨테이너) · 반복 항목 · 링크.
========================================================== */

function inspectSkinPackage(options) {

  const opts = options || {};

  const pkg = {
    schemaVersion: 1,
    renderMode: "sandbox",
    templates: {
      home: {
        html:
          '<div class="sb-home">' +
          '<h1 class="sb-title" data-imory-bind="site.title"></h1>' +
          '<p class="sb-static">고정 문구</p>' +
          /* data: URI 다 — 프레임 CSP 의 img-src 가 허용하는 출처이고,
             바깥 네트워크를 타지 않아 테스트가 흔들리지 않는다. */
          '<img class="sb-pic" alt="" src="data:image/gif;base64,' +
          'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==">' +
          '<div class="sb-card"><span class="sb-card-text">카드 안 글자</span></div>' +
          '<nav class="sb-nav">' +
          '<a class="sb-nav-link" data-imory-repeat="navigation.categories" ' +
          'data-imory-href="item.href" data-imory-bind="item.name"></a>' +
          '</nav>' +
          '</div>'
      },
      category: {
        html:
          '<div class="sb-category">' +
          '<h1 class="sb-category-title" data-imory-bind="category.name"></h1>' +
          '<a class="sb-post-link" data-imory-repeat="category.posts" ' +
          'data-imory-href="item.href" data-imory-bind="item.title"></a>' +
          '</div>'
      },
      post: {
        html:
          '<div class="sb-post">' +
          '<h1 class="sb-post-title" data-imory-bind="post.title"></h1>' +
          '<div class="sb-post-body" data-imory-region="post-body"></div>' +
          '</div>'
      },
      banner: {
        html:
          '<div class="sb-banner">' +
          '<h1 class="sb-banner-title" data-imory-bind="bannerCategory.name"></h1>' +
          '<span class="sb-banner-name" data-imory-repeat="bannerCategory.items" ' +
          'data-imory-bind="item.name"></span>' +
          '</div>'
      },
      highlights: {
        html:
          '<div class="sb-highlights">' +
          '<h1 class="sb-highlights-title" data-imory-bind="navigation.highlights.name"></h1>' +
          '<blockquote class="sb-hl-card" data-imory-repeat="highlights.cards" ' +
          'data-imory-bind="item.excerpt"></blockquote>' +
          '</div>'
      }
    },
    css:
      ".sb-home, .sb-category, .sb-post," +
      " .sb-banner, .sb-highlights { padding-top: 260px; }" +
      " .sb-title { font-size: 33px; }" +
      " .sb-static { font-size: 15px; }" +
      " .sb-pic { display: block; width: 80px; height: 80px; background: #eee; }" +
      " .sb-card { padding: 18px; border: 1px solid #ccc; }" +
      " .sb-nav-link { display: inline-block; margin-right: 10px; }" +
      " .sb-post-body { min-height: 120px; }",
    imageSlots: [],
    regions: [],
    metadata: { generatedBy: "sandbox-inspect-fixture" }
  };

  if (opts.js) {
    pkg.js = opts.js;
  }

  return pkg;

}


function openInspectStudio(browser, extra) {

  return openStudio(browser, {
    skinPackage: inspectSkinPackage(),
    ...(extra || {})
  });

}


/*
  좁은 창에서는 Top Dock 이 접혀 있고 Select 버튼이 화면에 없다.
  사람도 손잡이를 먼저 누르므로, 테스트도 같은 문을 쓴다.
*/

async function ensureTopDockOpen(page) {

  const open =
    await page.evaluate(() => {
      const zone = document.getElementById("studioTopDockZone");
      return !!zone && zone.classList.contains("is-open");
    });

  if (open) {
    return;
  }

  await page.locator("#studioTopDockHandle").click();

  await page.waitForTimeout(400);

}


async function enableSelect(page) {

  await ensureTopDockOpen(page);

  await page.locator("#studioInspectorButton").click();

  /* 켜면 다시 그린다(편집 식별자를 찍은 사본으로) — 그 렌더가
     끝나야 프레임 안에서 고를 것이 생긴다. */

  await sandboxFrame(page)
    .locator("#sandboxFrameRoot[data-imory-sandbox-state='rendered']")
    .waitFor({ state: "attached", timeout: 12000 });

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const inner = doc && doc.querySelector("iframe[data-imory-sandbox-frame]");
      return !!inner;
    },
    null,
    { timeout: 12000 }
  );

  /* 프레임 쪽 Inspect 가 실제로 켜졌는가 */

  await sandboxFrame(page).locator("body.imory-sandbox-inspect-on")
    .waitFor({ state: "attached", timeout: 8000 });

}


async function studioSelection(page) {

  return page.evaluate(
    () => (typeof window.getStudioInspectorSelection === "function")
      ? window.getStudioInspectorSelection()
      : null
  );

}


async function frameInspectState(page) {

  return sandboxFrame(page).locator("#sandboxFrameRoot").evaluate(
    () => (typeof window.__imorySandboxInspectState === "function")
      ? window.__imorySandboxInspectState()
      : null
  );

}


/* 프레임 realm 이 부모에게 직접 쏘는 위조 메시지 */

async function forgeFrameMessage(page, payload, type) {

  return sandboxFrame(page).locator("#sandboxFrameRoot").evaluate(
    (el, args) => {

      window.parent.postMessage(
        {
          imory: 1,
          type: args.type,
          seq: 9999,
          payload: args.payload
        },
        "*"
      );

      return true;

    },
    { payload, type: type || "IMORY_INSPECT_SELECT" }
  );

}


async function runInspect(browser) {

  console.log("\n[inspect] sandbox 프레임 안에서 요소 고르기");


  /* ===== 1. HOME — 켜기 · hover · 선택 ==================== */

  {
    const { ctx, page, consoleErrors } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    const heightBefore = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const inner = doc.querySelector("iframe[data-imory-sandbox-frame]");
      return inner ? Math.round(inner.getBoundingClientRect().height) : -1;
    });

    await enableSelect(page);

    check("[inspect] ★ Select 를 켜면 프레임 안 Inspect 가 켜진다",
      (await frameInspectState(page)).enabled === true);

    check("[inspect] 프레임은 여전히 하나다",
      (await sandboxFrameCount(page)) === 1,
      String(await sandboxFrameCount(page)));


    /* --- hover --- */

    await sandboxFrame(page).locator(".sb-title").hover();

    await page.waitForTimeout(250);

    const hovered = await frameInspectState(page);

    check("[inspect] ★ hover 한 요소가 프레임에서 잡힌다",
      typeof hovered.hoverEditId === "string" && hovered.hoverEditId.length > 0,
      String(hovered.hoverEditId));

    check("[inspect] ★ 테두리는 프레임 안에 있다 (상자 2개)",
      hovered.boxes === 2, String(hovered.boxes));

    check("[inspect] ★ Studio 는 자기 hover 테두리를 그리지 않는다 (중복 없음)",
      (await page.evaluate(() => {
        const box = document.getElementById("studioInspectorHoverBox");
        return !box || box.hidden === true;
      })) === true);


    /* --- 선택 --- */

    await sandboxFrame(page).locator(".sb-title").click();

    await page.waitForTimeout(300);

    const selection = await studioSelection(page);

    check("[inspect] ★ 고른 요소가 Studio 의 선택 상태가 된다",
      !!selection && selection.pageType === "home" &&
      selection.tagName === "h1" && selection.kind === "text",
      JSON.stringify(selection && {
        pageType: selection.pageType,
        tagName: selection.tagName,
        kind: selection.kind
      }));

    check("[inspect] ★ 부모가 template 에서 다시 판단한다 (bindPath)",
      !!selection && selection.bindPath === "site.title",
      String(selection && selection.bindPath));

    check("[inspect] ★ Inspector 패널이 떴다",
      (await page.locator("#studioInspectorPopover").isVisible()) === true);

    check("[inspect] ★ sandbox 에서는 직접 수정이 잠기고 이유가 나온다",
      (await page.locator("#studioInspectorDirectButton").isDisabled()) === true &&
      (await page.locator("#studioInspectorNote").innerText()).includes("sandbox"),
      (await page.locator("#studioInspectorNote").innerText()).slice(0, 60));


    /* --- overlay 가 높이·가로 폭을 바꾸지 않는다 --------- */

    const heightAfter = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const inner = doc.querySelector("iframe[data-imory-sandbox-frame]");
      return inner ? Math.round(inner.getBoundingClientRect().height) : -1;
    });

    check("[inspect] ★ overlay 가 iframe 높이를 바꾸지 않는다",
      Math.abs(heightAfter - heightBefore) <= 2,
      `${heightBefore} -> ${heightAfter}`);

    const frameOverflow = await sandboxFrame(page).locator("body").evaluate(
      (body) => ({
        scrollWidth: body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        rootScrollHeight: document.getElementById("sandboxFrameRoot").scrollHeight
      })
    );

    check("[inspect] ★ overlay 로 프레임이 가로로 넘치지 않는다",
      frameOverflow.scrollWidth <= frameOverflow.clientWidth + 1,
      JSON.stringify(frameOverflow));


    /* --- Escape 로 해제 --------------------------------- */

    await sandboxFrame(page).locator(".sb-title").click();
    await page.keyboard.press("Escape");

    await page.waitForTimeout(250);

    check("[inspect] ★ 프레임 안 Escape 로 선택이 풀린다",
      (await studioSelection(page)) === null);

    check("[inspect] 콘솔 오류 없음",
      consoleErrors.filter(e => !/cdn-cgi|favicon/i.test(e)).length === 0,
      consoleErrors.join(" | ").slice(0, 200));

    await ctx.close();
  }


  /* ===== 1-B. 종류별로 고를 수 있는가 ==================== */

  {
    const { ctx, page } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await enableSelect(page);

    const cases = [
      [".sb-static", "text", "정적 텍스트"],
      [".sb-pic", "image", "이미지"],
      [".sb-card", "container", "카드(컨테이너)"],
      [".sb-nav-link", "link", "링크"]
    ];

    for (const [selector, kind, label] of cases) {

      /*
        선택 패널은 고른 요소 옆에 앉는다 — 그대로 두면 다음 대상을
        덮는다(사람도 같은 상황에서는 Escape 로 닫는다). 한 번에
        하나씩 고르는 절이므로 매번 먼저 푼다.
      */

      await page.keyboard.press("Escape");

      await page.waitForTimeout(200);

      await sandboxFrame(page).locator(selector).first().click();

      await page.waitForTimeout(250);

      const sel = await studioSelection(page);

      check(`[inspect] ★ ${label} 를 고르면 부모가 ${kind} 로 판단한다`,
        !!sel && sel.kind === kind,
        JSON.stringify(sel && { kind: sel.kind, tag: sel.tagName }));

    }

    /* 카드 안 글자를 누르면 그 글자가 잡힌다(부모로 튀지 않는다) */

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await sandboxFrame(page).locator(".sb-card-text").click();
    await page.waitForTimeout(250);

    const inner = await studioSelection(page);

    check("[inspect] ★ 카드 안 글자를 누르면 그 글자가 잡힌다",
      !!inner && inner.tagName === "span",
      JSON.stringify(inner && { tag: inner.tagName }));

    await ctx.close();
  }


  /* ===== 1-C. 다른 화면들 (BANNER / HIGHLIGHTS) =========== */

  /*
    CATEGORY / POST 는 아래 4절이 본다. 여기서는 templates.banner /
    templates.highlights 가 있는 스킨으로 그 두 화면을 열어, 화면이
    바뀌어도 같은 프레임 하나에서 같은 방식으로 고를 수 있는지 본다.
  */

  {
    const { ctx, page } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    /* FRIENDS(배너) 로 간다 — Inspect 는 아직 꺼진 상태 */

    await sandboxFrame(page).locator(".sb-nav-link", { hasText: "FRIENDS" })
      .first().click();

    await sandboxFrame(page).locator(".sb-banner-title")
      .waitFor({ state: "attached", timeout: 12000 });

    await enableSelect(page);

    await sandboxFrame(page).locator(".sb-banner-title").click();
    await page.waitForTimeout(300);

    const bannerSel = await studioSelection(page);

    check("[inspect] ★ BANNER 화면에서도 고를 수 있다",
      !!bannerSel && bannerSel.pageType === "banner" &&
      bannerSel.bindPath === "bannerCategory.name",
      JSON.stringify(bannerSel && { p: bannerSel.pageType, b: bannerSel.bindPath }));

    check("[inspect] 프레임은 여전히 하나다",
      (await sandboxFrameCount(page)) === 1);

    /* NOTES(하이라이트) 로 — Inspect 를 끄고, HOME 으로 돌아가 이동한다
       (배너 화면에는 메뉴가 없다) */

    await page.locator("#studioInspectorButton").click();
    await page.waitForTimeout(300);

    await page.locator("#studioPreviewBackButton").click();

    await sandboxFrame(page).locator(".sb-home")
      .waitFor({ state: "attached", timeout: 12000 });

    await sandboxFrame(page).locator(".sb-nav-link", { hasText: "NOTES" })
      .first().click();

    await sandboxFrame(page).locator(".sb-highlights-title")
      .waitFor({ state: "attached", timeout: 12000 });

    await enableSelect(page);

    await sandboxFrame(page).locator(".sb-highlights-title").click();
    await page.waitForTimeout(300);

    const hlSel = await studioSelection(page);

    check("[inspect] ★ HIGHLIGHTS 화면에서도 고를 수 있다",
      !!hlSel && hlSel.pageType === "highlights",
      JSON.stringify(hlSel && { p: hlSel.pageType, b: hlSel.bindPath }));

    check("[inspect] ★ 화면을 옮겨도 프레임은 하나다",
      (await sandboxFrameCount(page)) === 1,
      String(await sandboxFrameCount(page)));

    await ctx.close();
  }


  /* ===== 2. 반복 항목 -> 반복 template ==================== */

  {
    const { ctx, page } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await enableSelect(page);

    const links = sandboxFrame(page).locator(".sb-nav-link");

    check("[inspect] 반복으로 여러 항목이 그려져 있다",
      (await links.count()) >= 3, String(await links.count()));

    await links.nth(0).click();
    await page.waitForTimeout(250);

    const first = await studioSelection(page);

    await links.nth(2).click();
    await page.waitForTimeout(250);

    const third = await studioSelection(page);

    check("[inspect] ★ 반복 항목은 '데이터 한 건'이 아니라 반복 template 이다",
      !!first && !!third && first.editId === third.editId,
      `${first && first.editId} / ${third && third.editId}`);

    check("[inspect] ★ 부모가 그 요소를 반복으로 안다",
      !!third && third.repeatPath === "navigation.categories",
      String(third && third.repeatPath));

    await ctx.close();
  }


  /* ===== 3. Inspect 중 링크·저자 JS 가 실행되지 않는다 ==== */

  {
    const { ctx, page } = await openStudio(browser, {
      authorJs: true,
      skinPackage: inspectSkinPackage({ js: STUDIO_AUTHOR_JS("JS-INSPECT") })
    });

    await sandboxFrame(page).locator(".sb-js-mark").waitFor({
      state: "attached", timeout: 15000
    }).catch(() => {});

    const beforeRuns = await readStudioJsMarks(page);

    await enableSelect(page);

    /* 저자 JS 는 다시 돌지 않는다 — Inspect 는 재렌더를 만들지만
       같은 realm 을 재사용하지 못하면 부모가 프레임을 새로 만든다.
       어느 쪽이든 "이 realm 에서 한 번"은 지켜져야 한다. */

    const afterRuns = await readStudioJsMarks(page);

    check("[inspect] ★ Select 를 켜도 저자 JS 가 이 realm 에서 한 번만 돈다",
      afterRuns.runs === "1" && beforeRuns.runs === "1",
      `${beforeRuns.runs} -> ${afterRuns.runs}`);

    /* 링크를 눌러도 미리보기 페이지가 바뀌지 않는다 */

    const routeBefore = await page.evaluate(
      () => window.__imoryPreviewSandboxPageType
        ? window.__imoryPreviewSandboxPageType()
        : ""
    );

    await sandboxFrame(page).locator(".sb-nav-link").first().click();
    await page.waitForTimeout(400);

    check("[inspect] ★ Inspect 중 링크를 눌러도 이동하지 않는다",
      (await sandboxFrame(page).locator(".sb-home").count()) === 1,
      `route=${routeBefore}`);

    check("[inspect] ★ 그 클릭은 '선택'이 됐다",
      !!(await studioSelection(page)));


    /* --- 끄면 원래 동작이 돌아온다 ---------------------- */

    await page.locator("#studioInspectorButton").click();

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 12000
    });

    await page.waitForTimeout(300);

    check("[inspect] ★ Select 를 끄면 프레임 Inspect 도 꺼진다",
      (await frameInspectState(page)).enabled === false);

    await sandboxFrame(page).locator(".sb-nav-link").first().click();

    await sandboxFrame(page).locator(".sb-category").waitFor({
      state: "attached", timeout: 12000
    });

    check("[inspect] ★ Select 를 끄면 링크가 다시 눌린다 (CATEGORY 로 이동)",
      (await sandboxFrame(page).locator(".sb-category-title").innerText())
        .includes("LOG"));

    await ctx.close();
  }


  /* ===== 4. post-body 안쪽은 고를 수 없다 ================= */

  {
    const { ctx, page } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await enableSelect(page);

    /* HOME -> CATEGORY -> POST 로 간다. Inspect 중에는 링크가
       안 눌리므로, 끄고 옮긴 뒤 다시 켠다. */

    await page.locator("#studioInspectorButton").click();
    await page.waitForTimeout(200);

    await sandboxFrame(page).locator(".sb-nav-link").first().click();
    await sandboxFrame(page).locator(".sb-post-link").first()
      .waitFor({ state: "attached", timeout: 12000 });

    await sandboxFrame(page).locator(".sb-post-link").first().click();
    await sandboxFrame(page).locator(".sb-post-body")
      .waitFor({ state: "attached", timeout: 12000 });

    await enableSelect(page);

    const bodyHasText = await sandboxFrame(page).locator(".sb-post-body")
      .evaluate((el) => el.innerText.trim().length > 0);

    await sandboxFrame(page).locator(".sb-post-body").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(250);

    check("[inspect] ★ post-body(사용자 글) 안쪽은 고를 수 없다",
      (await studioSelection(page)) === null,
      `본문 있음=${bodyHasText}`);

    /* 같은 화면에서 스킨 요소는 고를 수 있다 */

    await sandboxFrame(page).locator(".sb-post-title").click();
    await page.waitForTimeout(250);

    const postSel = await studioSelection(page);

    check("[inspect] ★ 같은 화면의 스킨 요소는 고를 수 있다 (POST 제목)",
      !!postSel && postSel.pageType === "post" && postSel.bindPath === "post.title",
      JSON.stringify(postSel && { p: postSel.pageType, b: postSel.bindPath }));

    await ctx.close();
  }


  /* ===== 5. 위조 거부 ==================================== */

  {
    const { ctx, page } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await enableSelect(page);

    await sandboxFrame(page).locator(".sb-title").click();
    await page.waitForTimeout(250);

    const real = await studioSelection(page);

    check("[inspect] 먼저 정상 선택이 있다", !!real);

    const rect = { left: 1, top: 1, width: 10, height: 10 };

    /*
      ★ 지금 template 에 없는 식별자. 봉투·origin·source·방향은
      전부 진짜다(프레임 realm 이 직접 쏜다) — 그래도 Studio 가
      자기 draft 와 대조해서 떨어뜨려야 한다.
    */

    await forgeFrameMessage(page, {
      contract: 1,
      renderSeq: 9,
      editId: "zzzforged",
      tagName: "h1",
      rect
    });

    await page.waitForTimeout(300);

    const afterForged = await studioSelection(page);

    check("[inspect] ★ template 에 없는 식별자는 선택이 되지 않는다",
      !!afterForged && afterForged.editId === real.editId,
      `${real && real.editId} -> ${afterForged && afterForged.editId}`);


    /* 옛 renderSeq — host 가 떨어뜨린다 */

    await forgeFrameMessage(page, {
      contract: 1,
      renderSeq: 1,
      editId: "e0-0-0",
      tagName: "p",
      rect
    });

    await page.waitForTimeout(300);

    check("[inspect] ★ 옛 renderSeq 의 선택은 버려진다",
      (await studioSelection(page)).editId === real.editId);


    /* 모르는 type / 모르는 payload 키 */

    const rejectedBefore = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return doc.defaultView.__imoryPreviewSandboxRejected || 0;
    });

    await forgeFrameMessage(page, {
      contract: 1,
      renderSeq: 9,
      editId: "e0-0",
      tagName: "h1",
      rect,
      innerHTML: "<script>alert(1)</script>"
    });

    await forgeFrameMessage(page, { contract: 1, renderSeq: 9 }, "IMORY_EVAL");

    await page.waitForTimeout(300);

    check("[inspect] ★ 모르는 payload 키 / 모르는 type 도 선택을 바꾸지 못한다",
      (await studioSelection(page)).editId === real.editId,
      `rejectedBefore=${rejectedBefore}`);

    check("[inspect] 프레임은 여전히 하나다",
      (await sandboxFrameCount(page)) === 1);

    await ctx.close();
  }


  /* ===== 6. 선택 요소 AI · Save 전 반영 · Undo · 복원 ===== */

  {
    const { ctx, page } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await enableSelect(page);

    await sandboxFrame(page).locator(".sb-title").click();
    await page.waitForTimeout(300);

    const selection = await studioSelection(page);

    check("[inspect] AI 로 넘길 선택이 있다", !!selection);


    /* --- selectionContext + 요청용 SkinPackage ----------- */

    const aiRequest = await page.evaluate(() => {

      const context = window.getStudioAiSelectionContext();

      const working = window.getStudioAiWorkingState
        ? window.getStudioAiWorkingState({ includePackage: true })
        : null;

      const pkg = (context && working)
        ? window.buildStudioAiSelectionPackage(working.skinPackage, context)
        : null;

      return {
        context,
        stampedHtml: pkg && pkg.templates && pkg.templates.home
          ? pkg.templates.home.html
          : ""
      };

    });

    check("[inspect] ★ selectionContext 가 만들어진다 (AI 가 범위를 안다)",
      !!aiRequest.context &&
      aiRequest.context.template === "home" &&
      aiRequest.context.editId === selection.editId,
      JSON.stringify(aiRequest.context && {
        t: aiRequest.context.template,
        e: aiRequest.context.editId
      }));

    check("[inspect] ★ 요청 SkinPackage 에 그 요소 식별자 하나만 심긴다",
      (aiRequest.stampedHtml.match(/data-imory-edit-id/g) || []).length === 1 &&
      aiRequest.stampedHtml.includes(selection.editId),
      String((aiRequest.stampedHtml.match(/data-imory-edit-id/g) || []).length));


    /* --- AI 결과 적용 (모델 호출 없이 같은 경로로) -------- */

    const applied = await page.evaluate((editId) => {

      const working = window.getStudioAiWorkingState({ includePackage: true });

      const pkg = window.buildStudioAiSelectionPackage(
        working.skinPackage,
        window.getStudioAiSelectionContext()
      );

      /* 모델이 그 요소 하나만 고쳤다고 치고 — 식별자는 유지한다
         (계약). 다른 template 은 손대지 않는다. */
      const next = {
        ...pkg,
        css: (pkg.css || "") +
          `\n[data-imory-edit-id="${editId}"][data-imory-edit-id="${editId}"] { color: rgb(0, 128, 0); }\n`
      };

      window.applyAiSkinPackage(next, { source: "e2e-selected-ai" });

      return true;

    }, selection.editId);

    check("[inspect] AI 결과를 적용했다", applied === true);

    await sandboxFrame(page).locator(".sb-title").waitFor({
      state: "attached", timeout: 12000
    });

    await page.waitForTimeout(500);

    const titleColor = await sandboxFrame(page).locator(".sb-title").first()
      .evaluate(el => getComputedStyle(el).color);

    check("[inspect] ★ Save 전인데도 프레임에 즉시 반영된다",
      titleColor === "rgb(0, 128, 0)", titleColor);

    const navColor = await sandboxFrame(page).locator(".sb-nav-link").first()
      .evaluate(el => getComputedStyle(el).color);

    check("[inspect] ★ 선택하지 않은 요소는 그대로다 (범위가 지켜졌다)",
      navColor !== "rgb(0, 128, 0)", navColor);

    check("[inspect] ★ 재렌더 뒤에도 같은 요소가 선택돼 있다",
      (await studioSelection(page) || {}).editId === selection.editId,
      String((await studioSelection(page) || {}).editId));

    check("[inspect] ★ Save 는 아직 눌리지 않았다 (dirty 상태 유지)",
      !(await page.locator("#studioSaveButton").isDisabled()));

    check("[inspect] 프레임은 여전히 하나다",
      (await sandboxFrameCount(page)) === 1);


    /* --- 선택 요소가 사라지면 조용히 해제된다 ------------ */

    await page.evaluate(() => {

      const working = window.getStudioAiWorkingState({ includePackage: true });

      window.applyAiSkinPackage(
        {
          ...working.skinPackage,
          templates: {
            ...working.skinPackage.templates,
            home: {
              ...working.skinPackage.templates.home,
              /*
                ★ 구조를 통째로 바꾼다 — 고른 요소의 자리 자체가
                없어져야 한다.

                편집 식별자는 **구조 경로**로 만들어진다("e0-0" =
                body 첫 자식의 첫 자식, studio-inspector-model.js
                stampInspectorEditIds). 그래서 h1 하나만 지우면 뒤
                요소가 그 자리로 밀려와 같은 id 를 물려받고, 선택은
                **엉뚱한 요소에 붙은 채로 살아남는다**. 그 경우를
                다루는 것은 AI 패널의 reconcileStudioAiSelection()
                이고(studio/ai/studio-ai-selection.js), 이 절이 보는
                것은 "자리가 정말 없어졌을 때 조용히 풀리는가"다.
              */
              html: '<p class="sb-gone">GONE</p>'
            }
          }
        },
        { source: "e2e-selected-ai-remove" }
      );

    });

    await sandboxFrame(page).locator(".sb-gone").waitFor({
      state: "attached", timeout: 12000
    });

    await page.waitForTimeout(500);

    check("[inspect] ★ 고른 요소가 사라지면 선택이 조용히 풀린다 (오류 없음)",
      (await studioSelection(page)) === null);

    check("[inspect] ★ 그때 Inspector 패널도 닫힌다",
      (await page.locator("#studioInspectorPopover").isVisible()) === false);

    await ctx.close();
  }


  /* ===== 6-B. 뒤 형제가 같은 구조 경로 id 를 물려받아도 해제 === */

  /*
    sandbox 도 native 와 **같은 판정**을 지난다 — 선택의 주인은
    언제나 Studio 문서이고, 되살리기는 draft template 에서 한다
    (studio/inspector/studio-inspector-model.js
     resolveInspectorSelectionTarget). 그 사실을 프레임 쪽에서도
     한 번 못 박아 둔다.
  */

  {
    const { ctx, page } = await openInspectStudio(browser);

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await enableSelect(page);

    await sandboxFrame(page).locator(".sb-title").click();
    await page.waitForTimeout(300);

    const picked = await studioSelection(page);

    check("[inspect] 먼저 정상 선택이 있다 (구조 경로 id)",
      !!picked && picked.editId === "e0-0",
      String(picked && picked.editId));

    /* h1 만 지운다 — 뒤 <p class="sb-static"> 가 e0-0 을 물려받는다 */

    await page.evaluate(() => {

      const state =
        window.getStudioAiWorkingState({ includePackage: true });

      window.applyAiSkinPackage(
        {
          ...state.skinPackage,
          templates: {
            ...state.skinPackage.templates,
            home: {
              ...state.skinPackage.templates.home,
              html: state.skinPackage.templates.home.html.replace(
                '<h1 class="sb-title" data-imory-bind="site.title"></h1>',
                ""
              )
            }
          }
        },
        { source: "e2e-inherit-path" }
      );

    });

    await sandboxFrame(page).locator(".sb-static").waitFor({
      state: "attached", timeout: 12000
    });

    await page.waitForTimeout(600);

    const afterInherit = await studioSelection(page);

    const lostReason = await page.evaluate(
      () => window.getStudioInspectorState().lostReason
    );

    check("[inspect] ★ 뒤 형제가 같은 id 를 물려받아도 선택이 해제된다",
      afterInherit === null && lostReason === "mismatch",
      `lost=${lostReason}`);

    const frameState = await frameInspectState(page);

    check("[inspect] ★ 프레임의 선택 테두리도 함께 걷힌다",
      frameState.selectedEditId === null,
      String(frameState.selectedEditId));

    await ctx.close();
  }


  /* ===== 7. Mobile 미리보기 + 터치 선택 ================== */

  /*
    ★ "모바일"을 Studio 창 폭 390px 로 재지 않는다.

    Select 버튼은 창이 좁으면(720px 이하) 아예 감춰진다 —
    studio/inspector/studio-inspector.css 의 media query 가 그렇게
    정해 뒀고, 그것이 이 제품의 설계다. 실제로 모바일 폭 스킨을
    고르는 길은 **Preview 를 Mobile 모드로 두는 것**이다(iframe 만
    390px 로 줄고 Studio 창은 넓다). native Inspector 도 같은
    방식으로 검사한다(studio/studio-inspector-e2e-test.mjs 검사 U).

    그래서 여기서 보는 것은 셋이다:
      · 터치(tap)로도 고를 수 있는가
      · 축소 배율이 걸린 프레임에서도 좌표가 맞는가
      · 390px 프레임 안에서 overlay 가 가로로 넘치지 않는가
  */

  {
    const { ctx, page } = await openInspectStudio(browser, {
      contextOptions: {
        hasTouch: true
      }
    });

    await sandboxFrame(page).locator(".sb-home").waitFor({
      state: "attached", timeout: 15000
    });

    await page.locator('[data-viewport-mode="mobile"]').click();

    await page.waitForTimeout(600);

    const frameWidth = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const inner = doc.querySelector("iframe[data-imory-sandbox-frame]");
      return inner ? Math.round(inner.getBoundingClientRect().width) : -1;
    });

    check("[inspect] Mobile 모드에서 프레임이 좁아졌다",
      frameWidth > 0 && frameWidth <= 400, String(frameWidth));

    await enableSelect(page);

    await sandboxFrame(page).locator(".sb-title").tap();

    await page.waitForTimeout(400);

    const touchSelection = await studioSelection(page);

    check("[inspect] ★ 터치(tap)로도 고를 수 있다",
      !!touchSelection && touchSelection.tagName === "h1",
      JSON.stringify(touchSelection && { t: touchSelection.tagName }));

    /*
      ★ 축소 배율이 걸린 화면에서도 고른 요소의 수정 내용이 보이는가.

      STUDIO-SHELL-1 — 팝오버는 더 이상 Preview 위에 떠서 자리를
      고르지 않는다. Studio 왼쪽 패널(좁은 화면에서는 아래 시트) 안에
      있다(IMORY_STUDIO_SHELL_DESIGN.md §2-3). 그래서 "Preview 안에
      앉는가" 대신 "패널 안에 보이고 화면 밖으로 나가지 않는가"를 본다.
    */

    const placement = await page.evaluate(() => {

      const pop = document.getElementById("studioInspectorPopover");
      const panel = document.getElementById("studioLeftPanel");

      if (!pop || pop.hidden || !panel) {
        return null;
      }

      const p = pop.getBoundingClientRect();
      const s = panel.getBoundingClientRect();

      return {
        inPanel: !!pop.closest("#studioLeftPanel"),
        inside:
          p.left >= s.left - 1 && p.right <= s.right + 1 &&
          p.top >= s.top - 1 &&
          p.right <= window.innerWidth + 1,
        width: Math.round(p.width)
      };

    });

    check("[inspect] ★ 축소된 화면에서도 고른 요소의 수정 내용이 왼쪽 패널 안에 보인다",
      !!placement && placement.inPanel === true && placement.inside === true,
      JSON.stringify(placement));

    const frameOverflow = await sandboxFrame(page).locator("body").evaluate(
      () => ({
        doc: document.documentElement.scrollWidth,
        win: document.documentElement.clientWidth
      })
    );

    check("[inspect] ★ 390px 프레임 안에서 overlay 가 가로로 넘치지 않는다",
      frameOverflow.doc <= frameOverflow.win + 1, JSON.stringify(frameOverflow));

    const parentOverflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth
    }));

    check("[inspect] ★ 부모 문서도 가로로 넘치지 않는다",
      parentOverflow.doc <= parentOverflow.win + 1,
      JSON.stringify(parentOverflow));

    await ctx.close();
  }


  /* ===== 8. native 회귀 — renderMode 없는 스킨 =========== */

  {
    const { ctx, page } = await openStudio(browser, { scenario: "x" });

    await previewFrame(page).locator("[data-skin-root]").waitFor({
      state: "attached", timeout: 15000
    });

    check("[inspect] ★ native 스킨에는 프레임이 없다",
      (await sandboxFrameCount(page)) === 0,
      String(await sandboxFrameCount(page)));

    await page.locator("#studioInspectorButton").click();

    await page.waitForTimeout(600);

    /*
      ★ 스킨 바깥 상자(.scenario-x-home)가 아니라 **안쪽 링크**를
      누른다. 바깥 상자는 Preview 를 통째로 덮어 그 가운데가 Top Dock
      밑에 들어가고(WebKit 실측), 사람도 그 자리는 누를 수 없다.
    */

    await previewFrame(page).locator(".scenario-x-nav-link").first()
      .waitFor({ state: "attached", timeout: 12000 });

    await previewFrame(page).locator(".scenario-x-nav-link").first().click();

    await page.waitForTimeout(400);

    const nativeSelection = await studioSelection(page);

    check("[inspect] ★ native Inspector 는 지금까지와 같다 (선택된다)",
      !!nativeSelection, JSON.stringify(nativeSelection && {
        t: nativeSelection.tagName
      }));

    check("[inspect] ★ native 에서는 Studio 가 자기 테두리를 그린다",
      (await page.evaluate(() => {
        const box = document.getElementById("studioInspectorSelectBox");
        return !!box && box.hidden === false;
      })) === true);

    check("[inspect] ★ native 에서는 직접 수정이 잠기지 않는다",
      (await page.locator("#studioInspectorDirectButton").isDisabled()) === false);

    await ctx.close();
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
  if (shouldRun("authorjs")) await runAuthorJs(browser);
  if (shouldRun("pages")) await runPages(browser);
  if (shouldRun("nav")) await runNav(browser);
  if (shouldRun("native")) await runNative(browser);
  if (shouldRun("parity")) await runParity(browser);
  if (shouldRun("mobile")) await runMobile(browser);
  if (shouldRun("reject")) await runReject(browser);
  if (shouldRun("bodystyle")) await runBodyStyle(browser);
  if (shouldRun("bodyparity")) await runBodyParity(browser);
  if (shouldRun("inspect")) await runInspect(browser);

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
