/* =========================================================
   STUDIO PREVIEW — 메모 카드 도구 E2E (HIGHLIGHT-1 후속)

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §11-6 (해소)

   무엇을 보는가
   -------------
   Preview의 메모 화면에서 카드의 ⋮ 가 **자리만 차지하지 않는가**.
   메뉴가 열리고, 메모 팝업이 뜨고, 그 조작이 실제 데이터에는 닿지
   않으며, 주인장/방문자 차이를 눈으로 볼 수 있는가.

   왜 Preview 문서를 직접 띄우는가
   -------------------------------
   studio/preview/preview-frame.html은 독립된 문서다(iframe으로 쓰이지만
   그 자체로 완결된 browsing context). Studio 전체를 띄우지 않고 이
   문서 하나만 열어 실제 "preview:render" 메시지를 보내면, 검사 대상
   (preview-bridge.js + preview-memo-tools.js + 공개 화면과 **같은**
   posts-view-memo-card-tools.js)이 production과 정확히 같은 구성으로
   돈다. 부모는 자기 자신이다 — bridge의 origin/source 검증
   (event.source === window.parent)이 그대로 통과한다.

   ★ 저장이 일어나지 않는다는 것을 어떻게 보는가
   supabase 호스트로 나가는 요청을 전부 가로채 세고, 하나라도 있으면
   실패로 본다. "화면에 안내가 떴다"가 아니라 **네트워크가 조용한지**로
   판정한다.

   실행
     node studio/studio-memo-preview-e2e-test.mjs
     node studio/studio-memo-preview-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8953;
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");

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
   playwright 찾기 (다른 e2e와 같은 전략)
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
   정적 서버 — 저장소를 그대로
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

/*
  Preview 문서는 iframe으로 쓰이도록 만들어져 있다 — parent에게
  보내는 신호는 window.parent === window 이면 아예 나가지 않는다
  (preview-bridge.js의 postToParent). 그래서 production과 같은 모양,
  즉 **iframe 안에** 띄운다. 이 host는 Studio의 최소 대역이다:
  ready를 받고 render를 넣어 주는 것 말고는 아무것도 하지 않는다.
*/

const HOST_HTML = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>preview host</title>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh;display:block}</style>
</head><body>
<iframe id="previewFrame" src="/studio/preview/preview-frame.html"></iframe>
<script>
  window.__previewReady = false;
  window.__fromFrame = [];
  window.addEventListener("message", function (e) {
    if (!e.data || typeof e.data !== "object") return;
    window.__fromFrame.push(e.data.type);
    if (e.data.type === "preview:ready") window.__previewReady = true;
  });
  window.__render = function (skin, context) {
    document.getElementById("previewFrame").contentWindow.postMessage(
      { type: "preview:render", skin: skin, context: context },
      window.location.origin
    );
  };
<\/script>
</body></html>`;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);

    if (rel === "/__preview-host") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(HOST_HTML);
      return;
    }

    if (rel.endsWith("/")) rel += "index.html";
    const abs = path.join(ROOT, rel);

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

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   fixture — 스킨 제작자가 쓸 법한 메모 template 하나

   memo-tools region을 repeat 안에 둔다. 그 자리가 카드마다 하나씩
   생기고, 렌더러가 카드 id를 키로 찍는다.
========================================================== */

const MEMOS_TEMPLATE = {
  html:
    '<section class="memo-screen">' +
    '<div class="memo-card-list">' +
    '<article class="memo-card" data-imory-repeat="memos.cards">' +
    '<blockquote class="memo-card-excerpt" data-imory-bind="item.excerpt"></blockquote>' +
    '<p class="memo-card-note" data-imory-if="item.hasNote" data-imory-bind="item.note"></p>' +
    '<span data-imory-region="memo-tools"></span>' +
    '</article>' +
    '</div>' +
    '</section>',
  css: ".memo-card { padding: 8px; }"
};

function makeMemosContext(overrides = {}) {
  return {
    page: {
      type: "memos",
      isHome: false,
      isCategory: false,
      isPost: false,
      isMemos: true
    },
    site: { title: "PREVIEW E2E", language: "ko" },
    profile: { nickname: "미리보기", bio: null, avatarUrl: null },
    navigation: {
      home: { name: "PREVIEW E2E", href: "/preview/", enabled: true },
      categories: [],
      memos: { name: "MEMO", href: "/preview/memos", enabled: true }
    },
    banners: { items: [] },
    images: {},
    viewer: { isOwner: true },
    memos: {
      cards: [
        {
          id: "card-1",
          excerpt: "메모가 달린 카드입니다",
          note: "이미 적어 둔 메모",
          hasNote: true,
          color: "#f6e0c8",
          dateLabel: "2026. 09. 13",
          postTitle: "첫 번째 글",
          postHref: null,
          categoryName: "일기",
          placement: "unknown",
          isMissing: false,
          isPlacementUnknown: true,
          isPlaced: false
        },
        {
          id: "card-2",
          excerpt: "메모가 없는 카드입니다",
          note: "",
          hasNote: false,
          color: "#d8ecf3",
          dateLabel: "2026. 09. 12",
          postTitle: "두 번째 글",
          postHref: null,
          categoryName: "일기",
          placement: "unknown",
          isMissing: false,
          isPlacementUnknown: true,
          isPlaced: false
        }
      ],
      count: 2,
      showCards: true,
      isEmpty: false,
      hasError: false,
      canManage: true,
      view: { isAll: true, isFolders: false, isFolder: false },
      folders: [],
      ...overrides
    }
  };
}


/* =========================================================
   Preview 문서를 직접 띄운다
========================================================== */

const BASE = `http://localhost:${PORT}`;

let playwright;

async function openPreview(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: 1
  });
  const page = await ctx.newPage();

  /* 저장이 일어나면 여기 쌓인다 — 하나라도 있으면 실패다 */
  const supabaseCalls = [];
  await page.route(`https://${SUPABASE_HOST}/**`, route => {
    supabaseCalls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: "[]"
    });
  });

  for (const pattern of [
    "https://fonts.googleapis.com/**",
    "https://fonts.gstatic.com/**",
    /*
      /npm/ 은 막지 않는다 — skin-css-validate.js가 csstree를 정적
      import로 끌어오므로, 그걸 끊으면 preview-bridge 모듈 그래프
      전체가 평가되지 않는다(다른 스킨 e2e도 /gh/ 만 막는다).
    */
    "https://cdn.jsdelivr.net/gh/**"
  ]) {
    await page.route(pattern, r => r.abort());
  }

  const errors = [];
  page.on("pageerror", e => errors.push(e.message));

  if (process.env.IMORY_PREVIEW_DEBUG) {
    page.on("response", r => {
      if (r.status() >= 400) console.log("  [http]", r.status(), r.url());
    });
    page.on("console", m => console.log("  [console]", m.type(), m.text()));
    page.on("requestfailed", r =>
      console.log("  [failed]", r.url(), r.failure()?.errorText));
    page.on("pageerror", e => console.log("  [pageerror]", e.message));
    page.on("frameattached", f => console.log("  [frame]", f.url()));
  }

  await page.goto(`${BASE}/__preview-host`, { waitUntil: "domcontentloaded" });

  /* bridge(모듈)가 평가를 마치면 "preview:ready"를 보낸다 */
  await page.waitForFunction(
    () => window.__previewReady === true,
    null,
    { timeout: 20000 }
  );

  await page.evaluate(
    ([skin, context]) => window.__render(skin, context),
    [MEMOS_TEMPLATE, opts.context || makeMemosContext()]
  );

  const frame = page.frameLocator("#previewFrame");

  await frame.locator(".memo-card").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);

  return { ctx, page, frame, supabaseCalls, errors };
}


/* =========================================================
   1) ⋮ 가 실제로 열린다
========================================================== */

async function runTools(browser) {
  console.log("\n[preview] 메모 카드 ⋮");

  const { ctx, page, frame, supabaseCalls, errors } = await openPreview(browser);

  const menus = await frame.locator(".memo-card-menu").count();
  check("[preview] 카드마다 ⋮ 가 놓인다", menus === 2, `n=${menus}`);

  /* 자리만 차지하지 않는다 — 눌리고 메뉴가 뜬다 */

  await frame.locator(".memo-card-menu").first().click();
  await frame.locator(".imory-popover").first().waitFor({ timeout: 5000 });

  const items = await frame.locator(".imory-popover-item-label").allTextContents();
  check("[preview] ★ 눌러서 메뉴가 열린다(메모 있는 카드)",
    items.includes("메모 수정") &&
    items.includes("메모 삭제") &&
    items.includes("하이라이트 삭제"),
    items.join(" | "));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await frame.locator(".memo-card-menu").nth(1).click();
  await page.waitForTimeout(400);

  const items2 = await frame.locator(".imory-popover-item-label").allTextContents();
  check("[preview] 메모 없는 카드는 '메모 추가'",
    items2.includes("메모 추가") && !items2.includes("메모 삭제"),
    items2.join(" | "));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /* --- 메모 팝업 --- */

  await frame.locator(".memo-card-menu").first().click();
  await page.waitForTimeout(400);
  await frame.locator(".imory-popover-item-label", { hasText: "메모 수정" }).click();
  await frame.locator(".post-memo-popup").waitFor({ timeout: 5000 });

  check("[preview] ★ 메모 팝업이 실제 외형 그대로 뜬다",
    (await frame.locator(".post-memo-popup-excerpt").textContent() || "")
      .includes("메모가 달린 카드입니다"));

  check("[preview] 기존 메모가 채워져 있다",
    (await frame.locator(".post-memo-popup-field").inputValue()) === "이미 적어 둔 메모");

  check("[preview] ★ '저장되지 않는다'고 미리 말한다",
    (await frame.locator(".post-memo-popup-notice").textContent() || "")
      .includes("미리보기에서는 저장되지 않습니다"));

  await frame.locator(".post-memo-popup-field").fill("미리보기에서 고쳐 본 메모");
  await frame.locator(".post-memo-popup-save").click();
  await page.waitForTimeout(700);

  check("[preview] 저장을 누르면 팝업이 닫힌다",
    (await frame.locator(".post-memo-popup").count()) === 0);

  const toast = await frame.locator("#postViewerToast").innerText();
  check("[preview] ★ 저장되지 않았다고 알린다",
    toast.includes("미리보기에서는 저장되지 않습니다"), toast);

  check("[preview] ★★ supabase로 나간 요청이 하나도 없다",
    supabaseCalls.length === 0, supabaseCalls.join(" | "));

  check("[preview] 콘솔 오류 없음", errors.length === 0, errors.join(" | "));

  await ctx.close();
}


/* =========================================================
   2) 주인장 / 방문자
========================================================== */

async function runViewerModes(browser) {
  console.log("\n[preview] 주인장 / 방문자");

  const { ctx, page, frame, supabaseCalls } = await openPreview(browser);

  check("[preview] 미리보기 칩이 있다",
    (await frame.locator("#previewMemoViewerChip").count()) === 1);

  check("[preview] 기본은 주인장이다",
    (await frame.locator(".preview-memo-viewer-chip-option.is-active").textContent()) === "주인장");

  await frame.locator(".preview-memo-viewer-chip-option", { hasText: "방문자" }).click();
  await page.waitForTimeout(500);

  check("[preview] ★ 방문자로 바꾸면 ⋮ 가 사라진다",
    (await frame.locator(".memo-card-menu").count()) === 0);

  check("[preview] 카드 자체는 그대로다",
    (await frame.locator(".memo-card").count()) === 2);

  await frame.locator(".preview-memo-viewer-chip-option", { hasText: "주인장" }).click();
  await page.waitForTimeout(500);

  check("[preview] ★ 주인장으로 되돌리면 다시 나온다",
    (await frame.locator(".memo-card-menu").count()) === 2);

  /* 삭제도 화면 안에서만 끝난다 */

  page.on("dialog", d => d.accept());

  await frame.locator(".memo-card-menu").first().click();
  await page.waitForTimeout(400);
  await frame.locator(".imory-popover-item-label", { hasText: "하이라이트 삭제" }).click();
  await page.waitForTimeout(900);

  const toast = await frame.locator("#postViewerToast").innerText();
  check("[preview] ★ '하이라이트 삭제'도 저장되지 않는다고 알린다",
    toast.includes("미리보기에서는 저장되지 않습니다"), toast);

  check("[preview] ★★ 삭제에서도 supabase 요청이 없다",
    supabaseCalls.length === 0, supabaseCalls.join(" | "));

  await ctx.close();
}


/* =========================================================
   3) 메모 화면이 아니면 아무것도 얹지 않는다
========================================================== */

async function runOtherPage(browser) {
  console.log("\n[preview] 다른 화면");

  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await ctx.newPage();

  await page.route(`https://${SUPABASE_HOST}/**`, r => r.abort());
  await page.route("https://fonts.googleapis.com/**", r => r.abort());
  await page.route("https://fonts.gstatic.com/**", r => r.abort());

  await page.goto(`${BASE}/__preview-host`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__previewReady === true,
    null,
    { timeout: 20000 }
  );

  const homeContext = makeMemosContext();
  homeContext.page = { type: "home", isHome: true, isMemos: false };

  await page.evaluate(
    (context) => window.__render(
      { html: '<div class="home-marker">HOME</div>', css: "" },
      context
    ),
    homeContext
  );

  const frame = page.frameLocator("#previewFrame");

  await frame.locator(".home-marker").waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);

  check("[preview] HOME에서는 주인장/방문자 칩이 없다",
    (await frame.locator("#previewMemoViewerChip").count()) === 0);

  check("[preview] HOME에서는 기본 메모 진입점이 나온다",
    (await frame.locator("#imoryPlatformMemoEntry").count()) === 1);

  await ctx.close();
}


/* =========================================================
   RUN
========================================================== */

(async () => {
  playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  console.log(`STUDIO PREVIEW MEMO E2E — ${BROWSER} — ${BASE}`);

  const browser = await playwright[BROWSER].launch();

  try {
    await runTools(browser);
    await runViewerModes(browser);
    await runOtherPage(browser);
  } catch (err) {
    console.error("\n실행 중 오류:", err);
    failed += 1;
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) console.log("실패:\n  - " + failures.join("\n  - "));
  process.exit(failed ? 1 : 0);
})();
