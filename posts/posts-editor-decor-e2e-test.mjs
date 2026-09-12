/* =========================================================
   EDITOR 장식(형광펜 · 강조선 · 배경) E2E

   기준 문서
     posts/style/posts-body-decor.js        형광펜 높이 · 문단 강조선
     posts/style/posts-canvas-background.js 캔버스 배경 사진
     posts/editor/posts-color-picker.js     색 고르기 팝오버

   저장소의 실제 index.html · admin/index.html · 실제 CSS/JS를
   그대로 띄우고 Supabase 네트워크만 mock한다(다른 e2e와 같은
   규약). 하네스(정적 서버 · mock · 열기 헬퍼 · 공통 fixture)는
   admin/quote/quote-render-parity-e2e-test.mjs의 것과 같고 포트만
   다르다(8951).

   확인 범위

     picker      컬러피커를 끄는 내내 창이 열려 있는가, 본문 선택이
                 유지되는가, 실시간 미리보기가 되는가, Apply/Cancel/
                 Escape/바깥 클릭의 결과가 각각 맞는가, 드래그 전체가
                 undo 한 칸인가, redo가 되는가.
     highlight   이미 칠해진 구간을 다시 칠할 때 겹쳐 쌓이지 않는가
                 (전체·부분·여러 구간에 걸친 선택), 다른 서식이
                 보존되는가, 저장되는 HTML에 중첩이 남지 않는가,
                 이미 중첩된 옛 본문이 열 때 정리되는가.
     height      형광펜 높이를 바꿔도 글자 위치·줄바꿈·페이지 높이가
                 그대로인가, 100%는 예전과 같은 방식(배경색)인가,
                 모서리가 직각인가.
     rule        문단 강조선 — 일부만 선택해도 문단 전체, 여러 줄
                 문단에 한 줄로 이어짐, 대사 자동 적용과 개별 해제의
                 구분, 수동/자동이 겹쳐도 선은 하나, 개별 색이
                 프리셋 기본값을 이김, 저장 HTML에는 마커만.
     background  배경이 캔버스를 항상 빈틈없이 덮는가(가로·세로
                 사진 · 확대 1배/2배), 비율이 유지되는가, 중심이
                 범위를 벗어나지 않는가, 글자는 흐려지지 않는가,
                 여러 장에서 기본 구도 공통 + 개별 보정, Editor의
                 조정 모드에서만 드래그가 먹는가.
     preset      새 필드의 저장 → 다시 열기 왕복, 필드가 없는 옛
                 프리셋의 기본값(= 예전과 같은 외형).
     export      실제로 저장되는 PNG의 픽셀 — 배경·강조선이 들어가고,
                 형광펜 높이가 그대로이고, 흐림이 진짜로 구워지는가
                 (html2canvas는 CSS filter를 그리지 않는다).
     blocks      복사 상자 · 메모 · 구분선 — 삽입/편집/삭제/undo,
                 저장 HTML에 조작 UI가 없고 재편집에서 다시 붙는가,
                 복사되는 글자가 내용만이고 입력한 그대로인가,
                 공개 뷰어에는 복사 버튼이 발췌에는 없는가,
                 상자 안의 기호가 대사/지문으로 바뀌지 않는가,
                 페이지보다 긴 상자에서 내용이 유실되지 않는가.
     html        HTML 모드 — 감싼 코드 울타리만 벗기는가, 안쪽
                 백틱·따옴표가 남는가, 여러 번 그려도 더 깎이지
                 않는가, 디자인만 PNG로 저장되는가(OOC·제목·사이트
                 UI 제외), 실제 PNG의 크기·내용·잘림.
     mobile      조정 모드에서만 터치가 배경을 움직이고, 평소에는
                 기존 스크롤·핀치 제스처를 그대로 둔다.

   ★ 실행
     node posts/posts-editor-decor-e2e-test.mjs
     node posts/posts-editor-decor-e2e-test.mjs --only=rule
     node posts/posts-editor-decor-e2e-test.mjs --browser=webkit
========================================================== */


import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 이 파일은 posts/ 바로 아래에 있다 — 저장소 뿌리는 한 단계 위다. */
const ROOT = path.resolve(HERE, "..");
const PORT = 8951;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";
const OWNER_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.mock-owner-signature-value";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const VERBOSE = args.includes("--verbose");

const shouldRun = (name) => !ONLY || ONLY === name;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const near = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;


/* =========================================================
   playwright 찾기 — 다른 e2e와 동일 전략
========================================================== */

async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(
    process.env.LOCALAPPDATA || os.homedir(),
    "npm-cache",
    "_npx"
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
   저장소를 그대로 서빙
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
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

    /* _redirects의 /* /index.html 200 — 클라이언트 라우팅 */
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(path.join(ROOT, "index.html")).pipe(res);
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   DB fixture + PostgREST mock
========================================================== */

function makeDb(overrides = {}) {
  return {
    profiles: [{
      user_id: OWNER_ID, slug: SLUG, nickname: "테스트", bio: "",
      home_mode: "customize"
    }],
    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "IMORY QUOTE PARITY E2E" }
    ],
    categories: [{
      id: 1, user_id: OWNER_ID, name: "LOG", type: "post", sort_order: 1,
      slug: "log", list_style: "list", page_size: 12,
      secret_cover_mode: "lock", secret_cover_path: null
    }],
    posts: [{
      id: 501, user_id: OWNER_ID, category_id: 1, title: "발췌 테스트",
      content_type: "richtext", visibility: "public",
      created_at: "2026-02-01T02:00:00Z", quote_preset_id: null,
      folder_id: null, sort_order: 100
    }],
    post_contents: [{ post_id: 501, content: "본문", ooc_content: "" }],
    post_covers: [],
    quote_presets: overrides.quote_presets || [],
    banners: [],

    /*
      "아직 홈을 꾸미지 않았어요" 유도 오버레이가 화면을 덮어
      버튼 클릭을 가로채지 않게, 활성 스킨이 하나 있는 계정으로
      둔다(home/home-skin-prompt.js).
    */
    skins: [{ id: 1, user_id: OWNER_ID, is_active: true }]
  };
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function matches(row, key, raw) {
  const m = /^(eq|in|is|neq)\.(.*)$/s.exec(raw);
  if (!m) return true;
  const [, op, val] = m;
  const cur = row[key];
  if (op === "in") {
    const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
    return list.includes(String(cur));
  }
  if (op === "is") return val === "null" ? (cur === null || cur === undefined) : String(cur) === val;
  if (op === "neq") return String(cur) !== val;
  return String(cur) === val;
}

function queryTable(db, table, params) {
  let rows = (db[table] || []).slice();
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue;
    rows = rows.filter(row => matches(row, key, raw));
  }
  const select = params.get("select");
  if (select && select !== "*") {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }
  return rows;
}


async function installSupabaseMock(page, opts = {}) {
  const { db = makeDb(), recorder = null } = opts;

  installSupabaseMock.lastDb = db;

  if (VERBOSE) {
    page.on("pageerror", (err) => console.log("    [pageerror]", err.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.log("    [console]", m.text());
    });
  }

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (recorder) {
      recorder.push({
        method: req.method(), path: url.pathname, body: req.postData() || ""
      });
    }

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({ user: { id: OWNER_ID, email: "owner@example.com" } })
      });
    }

    if (url.pathname.startsWith("/storage/v1/")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json", body: "{}"
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);

      if (fn === "get_own_post_content") {
        const body = JSON.parse(req.postData() || "{}");
        const row = db.post_contents.find(c => String(c.post_id) === String(body.p_post_id));
        return route.fulfill({
          status: 200, headers, contentType: "application/vnd.pgrst.object+json",
          body: JSON.stringify(row ? { content: row.content, ooc_content: "" } : null)
        });
      }

      /* 스킨을 쓰지 않는 계정 — legacy 화면으로 떨어진다 */
      return route.fulfill({
        status: 200, headers, contentType: "application/json", body: "null"
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);

      if (req.method() === "POST" || req.method() === "PATCH") {
        let rows = [];
        try { rows = JSON.parse(req.postData() || "[]"); } catch { /* noop */ }
        const list = Array.isArray(rows) ? rows : [rows];

        if (table === "quote_presets") {
          list.forEach(row => {
            const id = row.id ||
              Number(url.searchParams.get("id")?.replace(/^eq\./, "")) ||
              db.quote_presets.length + 1;
            const found = db.quote_presets.find(p => String(p.id) === String(id));
            if (found) Object.assign(found, row, { id: found.id });
            else db.quote_presets.push({ id, is_active: false, ...row });
          });
          const last = db.quote_presets[db.quote_presets.length - 1];
          return route.fulfill({
            status: 201, headers,
            contentType: (req.headers()["accept"] || "").includes("vnd.pgrst.object")
              ? "application/vnd.pgrst.object+json"
              : "application/json",
            body: JSON.stringify(
              (req.headers()["accept"] || "").includes("vnd.pgrst.object")
                ? { id: last?.id }
                : [{ id: last?.id }]
            )
          });
        }

        return route.fulfill({
          status: 201, headers, contentType: "application/json", body: "[]"
        });
      }

      if (req.method() === "DELETE") {
        return route.fulfill({ status: 204, headers, body: "" });
      }

      const rows = queryTable(db, table, url.searchParams);
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

  for (const pattern of [
    "https://fonts.googleapis.com/**",
    "https://fonts.gstatic.com/**",
    "https://cdn.jsdelivr.net/gh/**"
  ]) {
    await page.route(pattern, r => r.abort());
  }
}


async function installSignedInUser(page) {
  await page.addInitScript(({ id, token }) => {
    let stored;
    Object.defineProperty(window, "supabase", {
      configurable: true,
      get() { return stored; },
      set(value) {
        if (value && typeof value.createClient === "function" && !value.__imoryPatched) {
          const originalCreateClient = value.createClient.bind(value);
          value.createClient = (...clientArgs) => {
            const client = originalCreateClient(...clientArgs);
            const session = {
              user: { id, email: "owner@example.com" },
              access_token: token,
              expires_at: 4102444800
            };
            client.auth.getSession = async () => ({ data: { session }, error: null });
            client.auth.getUser = async () => ({ data: { user: session.user }, error: null });
            client.auth.onAuthStateChange = (callback) => {
              setTimeout(() => {
                try { callback("INITIAL_SESSION", session); } catch { /* noop */ }
              }, 0);
              return {
                data: { subscription: { unsubscribe() { /* noop */ } } },
                error: null
              };
            };
            return client;
          };
          value.__imoryPatched = true;
        }
        stored = value;
      }
    });
  }, { id: OWNER_ID, token: OWNER_TOKEN });
}


/* =========================================================
   좌표 재기

   두 화면 모두 "520px로 레이아웃한 다음 통째로 scale()"이라,
   재는 동안만 그 표시 배율을 끈다 — 레이아웃 계산 결과만
   비교한다.
========================================================== */

const READ_GEOMETRY = (hostSelector) => {
  const host = document.querySelector(hostSelector);
  if (!host) return { error: "host 없음" };

  const previousTransform = host.style.transform;
  host.style.transform = "none";

  const pages = Array.from(host.querySelectorAll(".post-editor-preview-page"));
  const wasHidden = pages.map(node => node.hidden);
  pages.forEach(node => { node.hidden = false; });

  const readLines = (content, pageRect) => {
    const lines = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const push = (top, height, ch) => {
      const found = lines.find(line => Math.abs(line.top - top) < 2);
      if (found) {
        found.text += ch;
        found.height = Math.max(found.height, height);
        return;
      }
      lines.push({ top, height, text: ch });
    };
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue || "";
      for (let i = 0; i < value.length; i += 1) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.height <= 0) continue;
        push(
          Math.round((rect.top - pageRect.top) * 100) / 100,
          Math.round(rect.height * 100) / 100,
          value[i]
        );
      }
    }
    lines.sort((a, b) => a.top - b.top);
    return lines.map(line => ({
      top: line.top,
      height: line.height,
      text: line.text.replace(/\s+$/, "")
    }));
  };

  const read = pages.map((node) => {
    const pageRect = node.getBoundingClientRect();
    const content = node.querySelector(".post-editor-preview-content");
    const title = node.querySelector(".post-editor-preview-title");
    const source = node.querySelector(".post-editor-preview-source");
    const lines = readLines(content, pageRect);

    const offsetTop = (el) =>
      el && !el.hidden
        ? Math.round((el.getBoundingClientRect().top - pageRect.top) * 100) / 100
        : null;

    return {
      pageWidth: node.clientWidth,
      pageHeight: node.clientHeight,
      offsetHeight: node.offsetHeight,
      bodyWidth: content.clientWidth,
      bodyTop: Math.round(
        (content.getBoundingClientRect().top - pageRect.top) * 100
      ) / 100,
      titleTop: offsetTop(title),
      sourceTop: offsetTop(source),
      sourceText: source && !source.hidden ? source.textContent : null,
      lines,
      lineTexts: lines.map(l => l.text),
      gaps: lines.slice(1).map((line, index) =>
        Math.round((line.top - lines[index].top) * 100) / 100),
      gapCount: Math.max(0, lines.length - 1),
      overflowing: node.scrollHeight > node.clientHeight + 1,
      paragraphGaps: Array.from(
        content.querySelectorAll(".post-body-paragraph-gap")
      ).map(gap => Math.round(gap.getBoundingClientRect().height * 100) / 100),
      brCount: content.querySelectorAll("br").length,
      boldCount: content.querySelectorAll("b, strong").length,
      italicCount: content.querySelectorAll("i, em").length,
      highlightCount: content.querySelectorAll(".post-inline-highlight").length,
      pointCount: content.querySelectorAll(".post-inline-color").length,
      actionCount: content.querySelectorAll(".post-action").length,
      dialogueCount: content.querySelectorAll(".post-dialogue").length,
      imageCount: content.querySelectorAll("img").length
    };
  });

  pages.forEach((node, index) => { node.hidden = wasHidden[index]; });
  host.style.transform = previousTransform;

  return { pages: read, pageCount: pages.length };
};


/* =========================================================
   화면 열기
========================================================== */

/*
  ★ isMobile / hasTouch / deviceScaleFactor는 viewport 안이 아니라
  **context 옵션 최상위**에 놓아야 한다.

  예전에는 셋 다 viewport 객체 안에 들어 있었다. Playwright의
  viewport는 width/height만 읽으므로 나머지는 조용히 무시됐고,
  "mobile" 컨텍스트가 실은 터치가 없는 390px 창이었다. 그래서
  터치에서만 나는 버그(WebKit이 pointerdown preventDefault 뒤
  click을 만들지 않는 것 — posts/editor/posts-color-picker.js)를
  이 스위트가 잡지 못했다.
*/

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 900 } },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  }
};

/*
  webkit은 isMobile을 지원하지 않는다(Playwright 제한) — 터치와
  화면 크기는 그대로 두고 그 플래그만 뺀다.
*/
function contextOptions(name) {
  const base = VIEWPORTS[name || "desktop"];
  if (BROWSER === "webkit" && base.isMobile) {
    const { isMobile, ...rest } = base;
    return rest;
  }
  return base;
}

async function openQuotePanel(browser, opts = {}) {
  const ctx = await browser.newContext(
    contextOptions(opts.viewport)
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", err => errors.push(String(err.message)));

  await installSignedInUser(page);
  await installSupabaseMock(page, opts);

  await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#openQuoteButton", { state: "visible", timeout: 20000 });
  await page.click("#openQuoteButton");
  await page.waitForSelector("#quotePreviewCanvas .post-editor-preview-page", { timeout: 20000 });
  await page.waitForTimeout(400);

  return { ctx, page, errors, db: installSupabaseMock.lastDb };
}


async function openPostEditor(browser, opts = {}) {
  const ctx = await browser.newContext(
    contextOptions(opts.viewport)
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", err => errors.push(String(err.message)));

  await installSignedInUser(page);
  await installSupabaseMock(page, opts);

  await page.goto(
    `http://localhost:${PORT}/${SLUG}/category/1?write=1`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForSelector("#postEditor:not([hidden])", { timeout: 20000 });

  /*
    모바일에서는 PREVIEW 패널이 접혀 있다(display:none) — 접힌
    상태에서는 clientWidth가 0이라 좌표를 잴 수 없다. 실제
    사용자와 같은 방법(버튼)으로 연다.
  */
  if ((opts.viewport || "desktop") === "mobile") {
    await page.click("#postEditorPreviewToggle");
    await page.waitForTimeout(600);
  }

  await page.waitForTimeout(400);

  return { ctx, page, errors, db: installSupabaseMock.lastDb };
}


/*
  에디터 PREVIEW를 원하는 settings/본문으로 그린다. 실제
  updateEditorPreview()를 그대로 쓴다(세션 오버라이드는 건드리지
  않는다 — 프리셋 값을 그대로 따르는 상태).
*/
async function renderEditorPreview(page, { html, settings, title, mode, exportWidth, align }) {
  await page.evaluate(async (input) => {
    document.getElementById("postEditorTitle").value = input.title || "";
    document.getElementById("postEditorContent").innerHTML = input.html;
    postStyleSettings = input.settings;
    previewTitleVisible = input.settings.titleEnabled !== false;
    previewSourceVisible = input.settings.sourceEnabled !== false;
    previewVerticalAlign = input.align || null;
    previewBodyAlign = null;
    previewSourceSpacing = null;
    previewSourceBottomOffset = null;
    /* null = "아직 안 골랐다" — 프리셋의 canvas 값을 그대로 따른다 */
    previewRatioMode = input.mode || null;
    previewCustomRatioWidth = null;
    previewCustomRatioHeight = null;
    previewExportWidth = input.exportWidth ?? null;
    await updateEditorPreview();
  }, { html, settings, title, mode, exportWidth, align });
  await page.waitForTimeout(350);
}


/*
  Quote Preset 미리보기를 같은 settings/샘플로 그린다. 폼
  입력칸을 실제로 채워서 화면이 스스로 그리게 한다 — 저장될
  값과 그려지는 값이 같은지까지 이 경로로 확인된다.
*/
async function renderQuotePreview(page, { sample, settings, title }) {
  await page.evaluate((input) => {
    applyQuoteSettings(input.settings);
    document.getElementById("quoteTestTitle").value = input.title || "";
    document.getElementById("quoteTestBody").value = input.sample;
    updateQuotePreview();
  }, { sample, settings, title });
  await page.waitForTimeout(350);
}


/* =========================================================
   공통 fixture
========================================================== */

const BASE_SETTINGS = {
  ratio: "4:5",
  ratioWidth: 4,
  ratioHeight: 5,
  exportWidth: 1200,
  background: "#ffffff",
  padding: 0,
  verticalPadding: 60,
  horizontalPadding: 60,

  titleEnabled: false,
  titleColor: "#222222",
  titleSize: 24,
  titleWeight: "400",
  titleAlign: "left",
  titleLetterSpacing: 0,
  titleSpacing: 0,

  bodyFont: "pretendard",
  bodyColor: "#333333",
  highlightColor: "#f4dce6",
  pointColor: "#5c7cfa",
  bodySize: 16,
  bodyWeight: "500",
  lineHeight: 1.8,
  letterSpacing: 0,
  paragraphSpacing: 14,
  bodyAlign: "left",
  verticalAlign: "top",
  lineBreak: "keep",
  indent: 0,

  actionColor: "#888888",
  actionWeight: "400",
  actionItalic: false,
  dialogueColor: "#333333",
  dialogueWeight: "500",
  dialogueItalic: false,

  sourceText: "@hongcha",
  sourceEnabled: true,
  sourceColor: "#999999",
  sourceSize: 11,
  sourceWeight: "300",
  sourceAlign: "right",
  sourceSpacing: 0,
  sourceBottomOffset: 0
};

/* 같은 글을 두 입력 형식으로 — 왼쪽은 에디터가 만드는 HTML,
   오른쪽은 프리셋 샘플 문법. 렌더 결과가 같아야 한다. */
const SAMPLE_LINES = [
  "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 창밖을 바라보고 있었다.",
  "",
  "거리에는 늦은 오후의 햇빛이 비스듬히 내려앉았고, 지나가는 사람들의 그림자가 유리창 위로 길게 늘어졌다.",
  "",
  "그는 그 그림자들을 하나씩 세다가, 문득 손끝으로 테이블 위에 놓인 낡은 편지를 만지작거렸다."
];

const SAMPLE_TEXT = SAMPLE_LINES.join("\n");
const SAMPLE_HTML = SAMPLE_LINES.join("<br>").replace(/<br><br>/g, "<br><br>");


/* =========================================================
   이 파일 전용 fixture
========================================================== */

/*
  배경 사진은 data: URL로 준다 — 네트워크를 타지 않고 원본 크기가
  분명해서, "빈틈없이 덮는가"를 픽셀로 판정할 수 있다.
*/
function svgImage(width, height, fill) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" fill="${fill}"/></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}

const LANDSCAPE = svgImage(1200, 600, "#336699");

/*
  왼쪽 절반 빨강 · 오른쪽 절반 파랑. 흐림이 실제로 구워졌는지
  경계에서 "섞인 색"이 나오는지로 판정한다(단색 사진으로는
  흐림이 보이지 않는다).
*/
const TWO_TONE =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600">' +
    '<rect width="600" height="600" fill="#ff0000"/>' +
    '<rect x="600" width="600" height="600" fill="#0000ff"/></svg>',
    "utf8"
  ).toString("base64");
const PORTRAIT = svgImage(600, 1200, "#996633");

const DECOR_SETTINGS = {
  ...BASE_SETTINGS,
  bodyRuleColor: "#ee9fbd",
  bodyRuleWidth: 3,
  dialogueRuleEnabled: false,
  dialogueRuleColor: "#66aa88",
  dialogueRuleWidth: 5,
  sourceRuleEnabled: false,
  sourceRuleColor: "#7788ee",
  sourceRuleWidth: 4,
  highlightHeight: 100
};


/* =========================================================
   에디터 안의 글자 범위를 고른다
========================================================== */

const SELECT_IN_EDITOR = ({ start, end }) => {
  postEditorContent.focus();

  const walker =
    document.createTreeWalker(postEditorContent, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const range = document.createRange();
  let pos = 0;
  let startSet = false;

  for (const node of nodes) {
    const len = (node.nodeValue || "").length;
    if (!startSet && pos + len >= start) {
      range.setStart(node, Math.max(0, start - pos));
      startSet = true;
    }
    if (startSet && pos + len >= end) {
      range.setEnd(node, Math.max(0, end - pos));
      break;
    }
    pos += len;
  }

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  saveEditorSelection();

  return String(selection);
};

async function selectEditorRange(page, start, end) {
  return page.evaluate(SELECT_IN_EDITOR, { start, end });
}

/*
  본문 글자에서 needle을 찾아 그 자리에 캐럿을 둔다.
  (문단 경계 <br>은 글자가 아니므로 textContent 기준 위치다)
*/
async function caretAtText(page, needle) {
  return page.evaluate((text) => {
    const at = (postEditorContent.textContent || "").indexOf(text);
    return at;
  }, needle).then(at => caretInEditor(page, Math.max(0, at) + 1));
}

async function caretInEditor(page, at) {
  return page.evaluate((pos) => {
    postEditorContent.focus();

    const walker =
      document.createTreeWalker(postEditorContent, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    let seen = 0;
    for (const node of nodes) {
      const len = (node.nodeValue || "").length;
      if (seen + len >= pos) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, pos - seen));
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        captureEditorCaretBeforeToolbar();
        return true;
      }
      seen += len;
    }
    return false;
  }, at);
}


/* =========================================================
   색 고르기는 두 단계다 (요구사항 2)

     1단계  색 견본을 누르면 프리셋 색 목록(.imory-color-menu)
     2단계  목록 안의 직접 선택 → 컬러피커

   손가락 기기(native 모드)에서는 2단계의 직접 선택이 진짜
   <input type="color">이고, 그 밖에는 커스텀 팝오버를 여는
   버튼이다. 아래 두 헬퍼가 그 차이를 감춘다.
========================================================== */

async function openColorMenu(page, controlId, tap = false) {
  if (tap) await page.tap(`#${controlId}`);
  else await page.click(`#${controlId}`);
  await page.waitForSelector(".imory-color-menu", {
    state: "visible",
    timeout: 5000
  });
}


/* 목록을 거쳐 커스텀 팝오버까지 연다 */
async function openCustomPicker(page, controlId, tap = false) {
  await openColorMenu(page, controlId, tap);
  const button = ".imory-color-menu-custom-button";
  if (tap) await page.tap(button);
  else await page.click(button);
  await page.waitForSelector(".imory-color-picker", {
    state: "visible",
    timeout: 5000
  });
}


/* =========================================================
   페이지 안에서 쓰는 검사 도구

   openPostEditor/openQuotePanel가 열린 뒤 한 번 심는다(이 화면들은
   SPA라 문서가 다시 로드되지 않는다).
========================================================== */

async function installProbes(page) {
  await page.evaluate(() => {
    window.VISIBLE_PAGE_FN = () =>
      document.querySelector(
        "#postEditorPreviewPages .post-editor-preview-page:not([hidden])"
      ) ||
      document.querySelector(
        "#quotePreviewCanvas .post-editor-preview-page:not([hidden])"
      );

    window.SEGMENTS_FN = () =>
      Array.from(
        postEditorContent.querySelectorAll(".post-inline-highlight")
      ).map(node => ({
        color: node.dataset.highlight || "",
        text: node.textContent
      }));

    window.HAS_NESTED_HIGHLIGHT_FN = () =>
      Boolean(
        postEditorContent.querySelector(
          ".post-inline-highlight .post-inline-highlight"
        )
      );
  });
}



/* =========================================================
   1. picker — 컬러피커
========================================================== */

async function runPicker(browser) {
  console.log("\n[picker] 컬러피커 연속 조정 · 선택 유지 · Apply/Cancel · Undo/Redo");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  await page.evaluate((settings) => {
    postStyleSettings = settings;
    updatePresetHighlightSwatch();
    updatePresetPointColorSwatch();
    updatePresetRuleSwatch();
    postEditorContent.innerHTML =
      "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 있었다.";
    resetEditorUndoHistory();
  }, DECOR_SETTINGS);

  const selectedText = await selectEditorRange(page, 0, 10);

  /*
    ★ 선택이 있는 것만으로 selectionchange가 쉬지 않고 돌지 않는다.

    restoreEditorSelection()이 자리가 그대로여도 removeAllRanges +
    addRange를 하면 selectionchange가 뜨고, 그 핸들러가
    saveEditorSelection → updateEditorToolbarState →
    syncEditorRuleToggleState → editorParagraphRunsInSelection →
    다시 restoreEditorSelection으로 돌아온다. 편집창에 선택이
    하나라도 있으면 초당 1만 번 넘게 도는 고리였다(실측:
    300ms에 3,800여 회).

    화면에는 잘 드러나지 않지만 OS 색상 선택기는 그 문서에서
    열려 있을 수 없다 — 아이폰에서 기본 피커가 닫히던 원인
    후보다. 여기서 고리가 돌아오는지 상시 감시한다.
  */

  const idleSelectionNoise = await page.evaluate(async () => {
    let count = 0;
    const handler = () => { count += 1; };
    document.addEventListener("selectionchange", handler);
    await new Promise(resolve => setTimeout(resolve, 300));
    document.removeEventListener("selectionchange", handler);
    return count;
  });

  check(
    "[picker] 선택만 있고 가만히 두면 selectionchange가 돌지 않는다(무한 고리 회귀)",
    idleSelectionNoise <= 2,
    `300ms 동안 ${idleSelectionNoise}회`
  );

  const undoBefore = await page.evaluate(() => editorUndoStack.length);

  /* 1단계: 목록이 먼저 뜬다 */
  await openColorMenu(page, "postEditorCustomControl");

  check(
    "[picker] 견본을 누르면 프리셋 색 목록이 먼저 뜬다(요구사항 2)",
    await page.evaluate(() =>
      isImoryColorMenuOpen() === true &&
      isImoryColorPickerOpen() === false &&
      document.querySelectorAll(".imory-color-menu-swatch").length > 0)
  );

  check(
    "[picker] 목록을 여는 것만으로는 undo 기록이 생기지 않는다",
    await page.evaluate(() => editorUndoStack.length) === undoBefore,
    `${undoBefore} → ${await page.evaluate(() => editorUndoStack.length)}`
  );

  /* 2단계: 직접 선택 → 팝오버 */
  await page.click(".imory-color-menu-custom-button");
  await page.waitForSelector(".imory-color-picker", { state: "visible", timeout: 5000 });

  check(
    "[picker] 스와치를 누르면 팝오버가 열린다",
    await page.evaluate(() => isImoryColorPickerOpen() === true)
  );

  /* ---- 스펙트럼을 끄는 동안 창이 닫히지 않는다 ---- */

  const field = await page.locator(".imory-color-picker-field").boundingBox();

  await page.mouse.move(field.x + 8, field.y + 8);
  await page.mouse.down();

  const samples = [];
  for (const [dx, dy] of [[40, 20], [90, 45], [150, 80]]) {
    await page.mouse.move(field.x + dx, field.y + dy);
    await page.waitForTimeout(80);
    samples.push(await page.evaluate(() => ({
      open: isImoryColorPickerOpen(),
      color:
        postEditorContent.querySelector(".post-inline-highlight")
          ?.dataset.highlight || "",
      selection: String(window.getSelection()),
      undo: editorUndoStack.length
    })));
  }

  await page.mouse.up();
  await page.waitForTimeout(100);

  check(
    "[picker] 끄는 내내 창이 열려 있다",
    samples.every(s => s.open === true),
    samples.map(s => s.open).join(",")
  );

  check(
    "[picker] 색이 본문에 실시간으로 반영된다",
    new Set(samples.map(s => s.color)).size >= 2 &&
    samples.every(s => /^#[0-9a-f]{6}$/i.test(s.color)),
    samples.map(s => s.color).join(" → ")
  );

  check(
    "[picker] 원래 선택 범위가 그대로 유지된다",
    samples.every(s => s.selection === selectedText),
    `기준 "${selectedText}" / ${samples.map(s => `"${s.selection}"`).join(" ")}`
  );

  check(
    "[picker] 드래그 중 발생한 색 변경이 undo에 쌓이지 않는다",
    samples.every(s => s.undo === undoBefore + 1),
    `열기 전 ${undoBefore} / ${samples.map(s => s.undo).join(",")}`
  );

  /* ---- Apply ---- */

  const applied = samples[samples.length - 1].color;

  await page.click('.imory-color-picker [data-role="apply"]');
  await page.waitForTimeout(150);

  const afterApply = await page.evaluate(() => ({
    open: isImoryColorPickerOpen(),
    color:
      postEditorContent.querySelector(".post-inline-highlight")
        ?.dataset.highlight || "",
    undo: editorUndoStack.length,
    swatch:
      document.getElementById("postEditorCustomSwatch").style.background
  }));

  check(
    "[picker] Apply로 창이 닫히고 색이 확정된다",
    afterApply.open === false && afterApply.color === applied,
    JSON.stringify(afterApply)
  );

  check(
    "[picker] 확정된 한 번의 변경이 undo 한 칸이다",
    afterApply.undo === undoBefore + 1,
    `${undoBefore} → ${afterApply.undo}`
  );

  /* ---- Undo / Redo ---- */

  await page.click("#postEditorUndoButton");
  await page.waitForTimeout(200);

  const afterUndo = await page.evaluate(() => ({
    highlights: postEditorContent.querySelectorAll(".post-inline-highlight").length,
    redoDisabled: document.getElementById("postEditorRedoButton").disabled
  }));

  check(
    "[picker] Undo 한 번으로 그 변경 전체가 되돌아간다",
    afterUndo.highlights === 0,
    JSON.stringify(afterUndo)
  );

  check(
    "[picker] Undo 뒤에는 Redo를 누를 수 있다",
    afterUndo.redoDisabled === false
  );

  await page.click("#postEditorRedoButton");
  await page.waitForTimeout(200);

  check(
    "[picker] Redo로 그 변경이 다시 적용된다",
    await page.evaluate((color) =>
      postEditorContent.querySelector(".post-inline-highlight")
        ?.dataset.highlight === color, applied),
    applied
  );

  /* ---- Cancel(Escape) ---- */

  await selectEditorRange(page, 12, 20);

  const beforeCancel = await page.evaluate(() => ({
    html: postEditorContent.innerHTML,
    undo: editorUndoStack.length
  }));

  await openCustomPicker(page, "postEditorCustomControl");

  await page.mouse.move(field.x + 20, field.y + 100);
  await page.mouse.down();
  await page.mouse.move(field.x + 60, field.y + 30);
  await page.waitForTimeout(80);
  await page.mouse.up();

  const duringCancel = await page.evaluate(() =>
    postEditorContent.querySelectorAll(".post-inline-highlight").length);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  const afterCancel = await page.evaluate(() => ({
    open: isImoryColorPickerOpen(),
    html: postEditorContent.innerHTML,
    undo: editorUndoStack.length
  }));

  check(
    "[picker] Escape는 열기 전 상태로 정확히 되돌린다",
    afterCancel.open === false &&
    afterCancel.html === beforeCancel.html,
    `미리보기 중 형광펜 ${duringCancel}개 → 취소 후 복원 ${
      afterCancel.html === beforeCancel.html}`
  );

  check(
    "[picker] 취소는 undo 기록에 흔적을 남기지 않는다",
    afterCancel.undo === beforeCancel.undo,
    `${beforeCancel.undo} → ${afterCancel.undo}`
  );

  /* ---- 바깥 클릭 ---- */

  await selectEditorRange(page, 12, 20);

  const beforeOutside = await page.evaluate(() => postEditorContent.innerHTML);

  await openCustomPicker(page, "postEditorCustomControl");

  await page.mouse.move(field.x + 30, field.y + 90);
  await page.mouse.down();
  await page.mouse.move(field.x + 100, field.y + 20);
  await page.waitForTimeout(80);
  await page.mouse.up();

  await page.click("#postEditorTitle");
  await page.waitForTimeout(200);

  check(
    "[picker] 바깥 클릭도 Escape와 같다(의도치 않은 적용 없음)",
    await page.evaluate((html) => !isImoryColorPickerOpen() &&
      postEditorContent.innerHTML === html, beforeOutside)
  );

  /* ---- remove ---- */

  await selectEditorRange(page, 0, 10);
  await openCustomPicker(page, "postEditorCustomControl");
  await page.click('.imory-color-picker [data-role="remove"]');
  await page.waitForTimeout(200);

  const afterRemove = await page.evaluate(() => ({
    highlights: postEditorContent.querySelectorAll(".post-inline-highlight").length,
    text: postEditorContent.textContent,
    html: postEditorContent.innerHTML.slice(0, 200)
  }));

  check(
    "[picker] remove는 선택 범위의 그 서식만 걷어낸다",
    afterRemove.highlights === 0 &&
    afterRemove.text === "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 있었다.",
    JSON.stringify(afterRemove)
  );

  check("[picker] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();

  await runPickerTouch(browser);
  await runPickerNative(browser);
}


/* =========================================================
   1-1. picker — **손가락으로** 누르는 Apply / Cancel

   ★ 왜 따로 두는가 (실제 아이폰에서 나온 버그)

     팝오버 root의 pointerdown 핸들러가 preventDefault()를
     건다(본문 선택 유지). WebKit은 터치에서 그 preventDefault를
     "합성 마우스 이벤트를 만들지 말라"로 해석해서 뒤따르는
     click을 아예 만들지 않는다 — apply/cancel이 click만 듣고
     있었으므로 아이폰에서는 눌리지 않았고 창도 닫히지 않았다.
     chromium은 click을 만들기 때문에 마우스 기반 테스트로는
     드러나지 않았다.

     그래서 여기서는 반드시 page.tap()으로, hasTouch가 실제로
     켜진 컨텍스트에서 누른다.

   ★ 실행
     node posts/posts-editor-decor-e2e-test.mjs --only=picker --browser=webkit
========================================================== */

async function runPickerTouch(browser) {
  console.log("\n[picker/touch] 손가락으로 Apply · Cancel · 반복 열기");

  const { ctx, page, errors } = await openPostEditor(browser, {
    viewport: "mobile"
  });
  await installProbes(page);

  /*
    ★ 이 절은 **커스텀 팝오버**를 잰다.

    손가락 기기의 기본값은 이제 OS 기본 색상 선택기다
    (posts/editor/posts-color-picker.js). 커스텀 팝오버는 그
    대안으로 남아 있고 — 기본 피커를 못 여는 환경, 데스크톱,
    그리고 사용자가 명시적으로 고른 경우 — 여기서 그 대안이
    그대로 동작하는지 확인한다. 기본 피커 쪽은 아래
    [picker/native] 절이다.
  */
  await page.evaluate(() => {
    window.IMORY_COLOR_PICKER_MODE = "custom";
  });

  await page.evaluate((settings) => {
    postStyleSettings = settings;
    updatePresetHighlightSwatch();
    postEditorContent.innerHTML =
      "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 있었다.";
    resetEditorUndoHistory();
  }, DECOR_SETTINGS);

  /* 팝오버가 화면 폭을 다 먹지 않는다 */

  await selectEditorRange(page, 0, 10);
  await openCustomPicker(page, "postEditorCustomControl", true);

  const size = await page.evaluate(() => {
    const el = document.querySelector(".imory-color-picker");
    const r = el.getBoundingClientRect();
    return {
      width: Math.round(r.width),
      left: Math.round(r.left),
      right: Math.round(r.right),
      screen: window.innerWidth
    };
  });

  check(
    "[picker/touch] 팝오버가 화면 폭을 다 먹지 않는다",
    size.width <= 232 &&
    size.left >= 0 &&
    size.right <= size.screen,
    JSON.stringify(size)
  );

  /* ---- apply ---- */

  await page.evaluate(() => {
    /* 색을 하나 골라 둔다 — apply가 그 색으로 확정해야 한다 */
    setImoryColorPickerValue("#33aa77");
  });
  await page.waitForTimeout(120);

  await page.tap('.imory-color-picker [data-role="apply"]');
  await page.waitForTimeout(300);

  const afterApply = await page.evaluate(() => ({
    open: isImoryColorPickerOpen(),
    highlights: postEditorContent.querySelectorAll(
      ".post-inline-highlight"
    ).length,
    color: postEditorContent
      .querySelector(".post-inline-highlight")
      ?.getAttribute("data-highlight")
  }));

  check(
    "[picker/touch] apply를 손가락으로 누르면 확정되고 창이 닫힌다",
    afterApply.open === false &&
    afterApply.highlights === 1 &&
    afterApply.color === "#33aa77",
    JSON.stringify(afterApply)
  );

  /* ---- 다시 열고 cancel ---- */

  await selectEditorRange(page, 12, 20);
  await openCustomPicker(page, "postEditorCustomControl", true);

  check(
    "[picker/touch] 닫았다가 다시 열어도 정상으로 열린다",
    await page.evaluate(() => isImoryColorPickerOpen() === true)
  );

  await page.evaluate(() => {
    setImoryColorPickerValue("#112233");
  });
  await page.waitForTimeout(120);

  await page.tap('.imory-color-picker [data-role="cancel"]');
  await page.waitForTimeout(300);

  const afterCancel = await page.evaluate(() => ({
    open: isImoryColorPickerOpen(),
    /* apply로 만든 한 개만 남고, cancel한 쪽은 흔적이 없다 */
    highlights: Array.from(
      postEditorContent.querySelectorAll(".post-inline-highlight")
    ).map(n => n.getAttribute("data-highlight"))
  }));

  check(
    "[picker/touch] cancel을 손가락으로 누르면 복원되고 창이 닫힌다",
    afterCancel.open === false &&
    afterCancel.highlights.length === 1 &&
    afterCancel.highlights[0] === "#33aa77",
    JSON.stringify(afterCancel)
  );

  /* ---- 세 번째로 열고 닫기까지 반복해도 정상 ---- */

  await selectEditorRange(page, 22, 26);
  await openCustomPicker(page, "postEditorCustomControl", true);
  await page.tap('.imory-color-picker [data-role="cancel"]');
  await page.waitForTimeout(250);

  check(
    "[picker/touch] 열기 → 닫기를 반복해도 계속 동작한다",
    await page.evaluate(() => isImoryColorPickerOpen() === false)
  );

  check("[picker/touch] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   1-2. picker/native — 기본(OS) 색상 선택기 경로

   ★ 여기서 잴 수 있는 것과 없는 것

     못 재는 것: 아이폰이 실제로 색상 선택기 시트를 띄우는지,
     그 시트가 색을 조정하는 내내 열려 있는지. 그건 실기기
     확인 항목이다(브라우저 자동화로는 OS 창을 관측할 수 없다).

     재는 것: **시트가 닫히던 원인**이 사라졌는지. 원인은
     기본 피커가 아니라 우리 코드였다 — 색이 바뀔 때마다
     contenteditable을 다시 만들고 문서 선택을 갈아끼웠다.
     그래서 조정 중에

       - postEditorContent의 자식이 바뀌지 않는지(MutationObserver)
       - 문서 선택이 다시 설정되지 않는지(selectionchange)
       - 칠해진 span이 **같은 노드 그대로**인지

     를 직접 센다. 이 셋이 0/그대로면, 기본 피커가 닫힐 이유가
     우리 쪽에는 남아 있지 않다.

     undo가 정확히 한 칸인지도 여기서 함께 본다 — 기본 피커에는
     Cancel이 없어서 Undo 한 번이 그 자리를 대신하기 때문이다.

   ★ 실행
     node posts/posts-editor-decor-e2e-test.mjs --only=picker
========================================================== */

async function runPickerNative(browser) {
  console.log("\n[picker/native] 기본(OS) 색상 선택기 — 조정 중 본문·선택을 건드리지 않는다");

  const { ctx, page, errors } = await openPostEditor(browser, {
    viewport: "mobile"
  });
  await installProbes(page);

  /* ---- 어떤 경로가 기본값으로 잡히는가 ---- */

  const auto = await page.evaluate(() => ({
    mode: imoryColorPickerMode(),
    supported: imoryNativeColorPickerSupported(),
    touch: imoryTouchPrimaryDevice(),
    coarse: window.matchMedia("(pointer: coarse)").matches,
    maxTouchPoints: navigator.maxTouchPoints
  }));

  console.log(`  INFO  기본값 판정 — ${JSON.stringify(auto)}`);

  /*
    ★ 이 하네스에서 재현할 수 없는 것

    Playwright의 WebKit 빌드에는 <input type="color">가 없고
    (input.type이 "text"로 떨어진다) hasTouch를 켜도
    navigator.maxTouchPoints가 0이다. 즉 **실제 아이폰이 주는 값
    (supported=true, touch=true)을 이 환경에서는 만들 수 없다**.
    그래서 "아이폰에서 기본 피커가 선택된다"와 "그 칸을 누르면
    OS 창이 실제로 뜬다"는 여기서 확인할 수 없고 실기기 항목으로
    남는다. 아래 검사는 전부 **창이 열렸다고 가정했을 때의 이벤트
    순서**(input → change)를 그대로 만들어 본문이 어떻게 되는지를
    본다.

    판정 규칙 자체는 어느 환경에서나 검사할 수 있다 — 기본 피커는
    **쓸 수 있고 손가락이 주 입력일 때만** 고르고, 그 밖에는 전부
    커스텀 팝오버로 내려간다.
  */

  const expectedMode =
    auto.supported && auto.touch ? "native" : "custom";

  check(
    "[picker/native] 기본 피커는 쓸 수 있고 손가락이 주 입력일 때만 고른다(그 밖에는 커스텀 폴백)",
    auto.mode === expectedMode,
    `이 환경 기대 "${expectedMode}" / 실제 "${auto.mode}" — ${JSON.stringify(auto)}`
  );

  /*
    아래 동작 검사는 판정에 기대지 않고 경로를 명시적으로 고정한다 —
    이 절이 재는 것은 "기본 피커 경로가 어떻게 동작하는가"다.
  */
  await page.evaluate(() => {
    window.IMORY_COLOR_PICKER_MODE = "native";
  });

  await page.evaluate((settings) => {
    postStyleSettings = settings;
    updatePresetHighlightSwatch();
    updatePresetPointColorSwatch();
    updatePresetRuleSwatch();
    postEditorContent.innerHTML =
      "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 있었다.";
    resetEditorUndoHistory();
  }, DECOR_SETTINGS);

  const selectedText = await selectEditorRange(page, 0, 10);
  const undoBefore = await page.evaluate(() => editorUndoStack.length);

  /* ---- 1단계: 목록. 아직 아무것도 바뀌지 않았다 ---- */

  await openColorMenu(page, "postEditorCustomControl", true);

  const menu = await page.evaluate(() => {
    const input = document.querySelector("input.imory-color-menu-custom-input");
    const style = input ? getComputedStyle(input) : null;
    const rect = input ? input.getBoundingClientRect() : null;
    return {
      swatches: document.querySelectorAll(".imory-color-menu-swatch").length,
      hasInput: Boolean(input),
      inputType: input ? input.type : "",
      /* 숨기지 않는다 — 사용자의 손가락이 이 칸에 직접 닿아야 한다 */
      visible: style
        ? style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width >= 20 && rect.height >= 20
        : false,
      customOpen: isImoryColorPickerOpen(),
      undo: editorUndoStack.length,
      highlights: postEditorContent.querySelectorAll(".post-inline-highlight").length,
      selection: String(window.getSelection())
    };
  });

  check(
    "[picker/native] 견본을 누르면 프리셋 색 목록이 먼저 뜬다",
    menu.swatches > 0 && menu.customOpen === false,
    JSON.stringify(menu)
  );

  check(
    "[picker/native] 목록만 연 상태에서는 본문도 undo 기록도 그대로다",
    menu.undo === undoBefore && menu.highlights === 0,
    JSON.stringify(menu)
  );

  check(
    "[picker/native] 목록 단계에서 본문 선택이 유지된다",
    menu.selection === selectedText,
    `기준 "${selectedText}" / 실제 "${menu.selection}"`
  );

  /*
    ★ 이것이 "눌러도 아무것도 열리지 않던" 버그의 수정 지점이다.

    직접 선택은 코드가 대신 눌러 주는 숨은 칸이 아니라 **진짜
    보이는 <input type="color">**여야 한다. 사용자의 손가락이 그
    칸에 직접 닿아야 OS 창이 브라우저의 기본 동작으로 열린다.
  */

  check(
    "[picker/native] 직접 선택이 진짜 보이는 <input type=\"color\">다(숨은 칸을 코드로 누르지 않는다)",
    menu.hasInput === true &&
    menu.visible === true &&
    (auto.supported ? menu.inputType === "color" : menu.inputType === "text"),
    JSON.stringify(menu)
  );

  check(
    "[picker/native] 화면 밖에 숨겨 두던 옛 칸은 남아 있지 않다",
    await page.evaluate(() =>
      document.querySelectorAll(".imory-native-color-input").length === 0 &&
      typeof window.openImoryNativeColorPicker === "undefined")
  );

  /* ---- 2단계: 창이 열리기 직전 — 자리를 만든다(씨앗) ---- */

  const afterOpen = await page.evaluate(async () => {
    const input = document.querySelector("input.imory-color-menu-custom-input");
    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 120));
    const span = postEditorContent.querySelector(".post-inline-highlight");
    return {
      spanText: span ? span.textContent : "",
      color: span ? span.dataset.highlight : "",
      undo: editorUndoStack.length,
      customOpen: isImoryColorPickerOpen()
    };
  });

  check(
    "[picker/native] 선택이 살아 있는 동안 지금 색으로 자리를 만들어 둔다(씨앗)",
    afterOpen.spanText === selectedText &&
    /^#[0-9a-f]{6}$/i.test(afterOpen.color || ""),
    JSON.stringify(afterOpen)
  );

  check(
    "[picker/native] 여는 순간 undo는 정확히 한 칸만 쌓인다",
    afterOpen.undo === undoBefore + 1,
    `${undoBefore} → ${afterOpen.undo}`
  );

  check(
    "[picker/native] 기본 피커 경로에서는 커스텀 팝오버가 뜨지 않는다",
    afterOpen.customOpen === false,
    JSON.stringify(afterOpen)
  );

  /* ---- 조정 중: 본문도 선택도 건드리지 않는다 ---- */

  const live = await page.evaluate(async (colors) => {
    const input = document.querySelector("input.imory-color-menu-custom-input");
    const before = postEditorContent.querySelector(".post-inline-highlight");

    let childMutations = 0;
    let selectionChanges = 0;

    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === "childList") childMutations += 1;
      });
    });
    observer.observe(postEditorContent, {
      childList: true,
      subtree: true
    });

    const onSelectionChange = () => { selectionChanges += 1; };
    document.addEventListener("selectionchange", onSelectionChange);

    /*
      기준선 — 아무 것도 하지 않는 같은 길이의 시간. 이 화면은
      가만히 두어도 selectionchange가 뜨는지 먼저 본다.
    */
    await new Promise(resolve => setTimeout(resolve, 270));
    const idleSelectionChanges = selectionChanges;
    selectionChanges = 0;
    childMutations = 0;

    const seen = [];

    for (const color of colors) {
      input.value = color;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 90));
      const span = postEditorContent.querySelector(".post-inline-highlight");
      seen.push({
        color: span ? span.dataset.highlight : "",
        same: span === before,
        selection: String(window.getSelection()),
        undo: editorUndoStack.length
      });
    }

    await new Promise(resolve => setTimeout(resolve, 120));
    observer.disconnect();
    document.removeEventListener("selectionchange", onSelectionChange);

    return { seen, childMutations, selectionChanges, idleSelectionChanges };
  }, ["#8844aa", "#22bb66", "#ff9900"]);

  check(
    "[picker/native] 색이 본문에 실시간으로 반영된다",
    live.seen.map(s => s.color).join(",") === "#8844aa,#22bb66,#ff9900",
    live.seen.map(s => s.color).join(" → ")
  );

  check(
    "[picker/native] 조정 중 본문 노드를 다시 만들지 않는다(같은 span 그대로)",
    live.seen.every(s => s.same === true) && live.childMutations === 0,
    `childList 변경 ${live.childMutations}회 / 같은 노드 ${live.seen.map(s => s.same).join(",")}`
  );

  check(
    "[picker/native] 조정 중 문서 선택을 다시 설정하지 않는다(시트가 닫히던 원인)",
    live.selectionChanges === 0,
    `selectionchange ${live.selectionChanges}회 (가만히 둘 때 ${live.idleSelectionChanges}회)`
  );

  check(
    "[picker/native] 선택 범위가 그대로 남는다",
    live.seen.every(s => s.selection === selectedText),
    `기준 "${selectedText}" / ${live.seen.map(s => `"${s.selection}"`).join(" ")}`
  );

  check(
    "[picker/native] 조정 중 undo가 쌓이지 않는다",
    live.seen.every(s => s.undo === undoBefore + 1),
    live.seen.map(s => s.undo).join(",")
  );

  /* ---- 닫히며 확정 ---- */

  const afterChange = await page.evaluate(async () => {
    const input = document.querySelector("input.imory-color-menu-custom-input");
    input.value = "#ff9900";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      menuOpen: isImoryColorMenuOpen(),
      color: postEditorContent.querySelector(".post-inline-highlight")
        ?.dataset.highlight,
      undo: editorUndoStack.length,
      swatch: document.getElementById("postEditorCustomSwatch").style.background
    };
  });

  check(
    "[picker/native] 창이 닫히면 그 색으로 확정되고 목록도 함께 닫힌다",
    afterChange.menuOpen === false && afterChange.color === "#ff9900",
    JSON.stringify(afterChange)
  );

  check(
    "[picker/native] 조정 전체가 undo 한 칸이다",
    afterChange.undo === undoBefore + 1,
    `${undoBefore} → ${afterChange.undo}`
  );

  /* ---- Cancel이 없는 대신 Undo 한 번 ---- */

  await page.click("#postEditorUndoButton");
  await page.waitForTimeout(250);

  const afterUndo = await page.evaluate(() => ({
    highlights: postEditorContent.querySelectorAll(".post-inline-highlight").length,
    text: postEditorContent.textContent,
    undo: editorUndoStack.length
  }));

  check(
    "[picker/native] Undo 한 번으로 조정 전체가 되돌아간다(기본 피커에는 Cancel이 없다)",
    afterUndo.highlights === 0 && afterUndo.undo === undoBefore &&
    afterUndo.text === "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 있었다.",
    JSON.stringify(afterUndo)
  );

  /* ---- 목록에서 프리셋 색을 바로 고르는 길 ---- */

  await selectEditorRange(page, 0, 10);
  const beforePreset = await page.evaluate(() => editorUndoStack.length);

  await openColorMenu(page, "postEditorCustomControl", true);
  await page.tap(".imory-color-menu-swatch:nth-child(2)");
  await page.waitForTimeout(300);

  const afterPreset = await page.evaluate(() => ({
    menuOpen: isImoryColorMenuOpen(),
    color: postEditorContent.querySelector(".post-inline-highlight")
      ?.dataset.highlight,
    undo: editorUndoStack.length
  }));

  check(
    "[picker/native] 목록에서 고른 색은 그 자리에서 확정되고 undo 한 칸이다",
    afterPreset.menuOpen === false &&
    /^#[0-9a-f]{6}$/i.test(afterPreset.color || "") &&
    afterPreset.undo === beforePreset + 1,
    JSON.stringify(afterPreset)
  );

  /* ---- 기본 피커가 열리지 않으면 커스텀 팝오버로 잇는다 ---- */

  await page.click("#postEditorUndoButton");
  await page.waitForTimeout(200);
  await selectEditorRange(page, 0, 10);
  const beforeFallback = await page.evaluate(() => editorUndoStack.length);

  await openColorMenu(page, "postEditorCustomControl", true);

  /*
    창이 떴다면 이 칸이 포커스를 받거나 값이 바뀐다. 둘 다 없는
    채로 잠깐이 지나는 것이 "감지 가능한 실패"다.
  */
  await page.evaluate(() => {
    const input = document.querySelector("input.imory-color-menu-custom-input");
    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    postEditorContent.focus();
  });
  await page.waitForTimeout(1100);

  const fallback = await page.evaluate(() => ({
    customOpen: isImoryColorPickerOpen(),
    menuOpen: isImoryColorMenuOpen(),
    undo: editorUndoStack.length
  }));

  check(
    "[picker/native] 기본 피커가 열리지 않으면 아무 반응 없이 끝나지 않고 커스텀 팝오버로 잇는다",
    fallback.customOpen === true && fallback.menuOpen === false,
    JSON.stringify(fallback)
  );

  check(
    "[picker/native] 그 폴백에서도 undo는 한 칸뿐이다(씨앗을 두 번 찍지 않는다)",
    fallback.undo === beforeFallback + 1,
    `${beforeFallback} → ${fallback.undo}`
  );

  await page.click('.imory-color-picker [data-role="cancel"]');
  await page.waitForTimeout(250);

  check(
    "[picker/native] 그 폴백의 Cancel이 열기 전 상태로 되돌린다",
    await page.evaluate(() => editorUndoStack.length) === beforeFallback,
    `${beforeFallback} → ${await page.evaluate(() => editorUndoStack.length)}`
  );

  /* ---- 강조선도 같은 계약 ----

     강조선은 "선택이 걸치는 문단"을 매번 새로 찾는다. 기본 피커가
     열려 본문 선택이 사라진 뒤에도 조정이 이어져야 하고, 그때
     "커서를 두세요" 안내가 반복돼서는 안 된다. */

  await page.evaluate(() => {
    postEditorContent.innerHTML = "첫 문단입니다.";
    resetEditorUndoHistory();
  });

  await selectEditorRange(page, 0, 3);
  await openColorMenu(page, "postEditorRuleControl", true);

  const ruleLive = await page.evaluate(async (colors) => {
    const input = document.querySelector("input.imory-color-menu-custom-input");

    postEditorMessage.textContent = "";

    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 120));

    /* 기본 피커가 열리면 본문 선택이 사라진다 — 그 상황을 재현한다 */
    window.getSelection().removeAllRanges();

    const seen = [];
    const messages = [];

    for (const color of colors) {
      input.value = color;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 90));
      const mark = postEditorContent.querySelector("[data-rule]");
      seen.push(mark ? (mark.dataset.ruleColor || "") : "없음");
      const text = postEditorMessage.textContent.trim();
      if (text) messages.push(text);
    }

    return { seen, messages, marks: postEditorContent.querySelectorAll("[data-rule]").length };
  }, ["#112233", "#445566"]);

  check(
    "[picker/native] 강조선도 선택이 사라진 뒤에 색만 이어서 바뀐다",
    ruleLive.seen.join(",") === "#112233,#445566" && ruleLive.marks === 1,
    JSON.stringify(ruleLive)
  );

  check(
    "[picker/native] 강조선 조정 중 \"커서를 두세요\" 안내가 뜨지 않는다",
    ruleLive.messages.every(text => !text.includes("커서를 두세요")),
    JSON.stringify(ruleLive.messages)
  );

  check("[picker/native] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   2. highlight — 다시 칠해도 겹치지 않는다
========================================================== */

async function runHighlight(browser) {
  console.log("\n[highlight] 재적용이 중첩되지 않는다");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  const setup = async (html) => {
    await page.evaluate((input) => {
      postStyleSettings = input.settings;
      updatePresetHighlightSwatch();
      postEditorContent.innerHTML = input.html;
      resetEditorUndoHistory();
    }, { settings: DECOR_SETTINGS, html });
  };

  /* ---- (1) 전체를 칠한 뒤 가운데만 다른 색 ---- */

  await setup("창가 자리에 앉은 그는 커피를 앞에 두고 있었다.");

  await selectEditorRange(page, 0, 20);
  await page.evaluate(() => applyEditorHighlight("#ff0000", false));

  await selectEditorRange(page, 5, 10);
  await page.evaluate(() => applyEditorHighlight("#00ff00", false));

  const partial = await page.evaluate(() => ({
    nested: HAS_NESTED_HIGHLIGHT_FN(),
    segments: SEGMENTS_FN(),
    expected:
      "창가 자리에 앉은 그는 커피를 앞에 두고 있었다.".slice(0, 20)
  }));

  check(
    "[highlight] 형광펜 안에 형광펜이 생기지 않는다",
    partial.nested === false
  );

  check(
    "[highlight] 선택한 부분만 새 색, 양옆은 기존 색이 남는다",
    partial.segments.length === 3 &&
    partial.segments[0].color === "#ff0000" &&
    partial.segments[1].color === "#00ff00" &&
    partial.segments[2].color === "#ff0000" &&
    partial.segments.map(s => s.text).join("") === partial.expected,
    JSON.stringify(partial.segments)
  );

  /* ---- (2) 여러 하이라이트 + 일반 텍스트에 걸친 선택 ---- */

  await setup(
    '<span class="post-inline-highlight" data-highlight="#ff0000" ' +
    'style="background-color:#ff0000">가나다</span>라마바' +
    '<span class="post-inline-highlight" data-highlight="#0000ff" ' +
    'style="background-color:#0000ff">사아자</span>차카타'
  );

  await selectEditorRange(page, 0, 9);
  await page.evaluate(() => applyEditorHighlight("#123456", false));

  const across = await page.evaluate(() => ({
    nested: HAS_NESTED_HIGHLIGHT_FN(),
    segments: SEGMENTS_FN(),
    text: postEditorContent.textContent
  }));

  check(
    "[highlight] 여러 구간에 걸쳐 선택해도 새 색이 한 번만 적용된다",
    across.nested === false &&
    across.segments.filter(s => s.color === "#123456").length === 1 &&
    across.segments.find(s => s.color === "#123456")?.text === "가나다라마바사아자",
    JSON.stringify(across.segments)
  );

  check(
    "[highlight] 글자가 사라지거나 순서가 바뀌지 않는다",
    across.text === "가나다라마바사아자차카타",
    across.text
  );

  /* ---- (3) 다른 서식 보존 ---- */

  await setup(
    '<span class="post-inline-highlight" data-highlight="#ff0000" ' +
    'style="background-color:#ff0000">가<strong>나</strong>' +
    '<em>다</em><u>라</u>' +
    '<span class="post-inline-color" data-point-color="#5c7cfa" ' +
    'style="color:#5c7cfa">마</span>바</span>'
  );

  await selectEditorRange(page, 0, 6);
  await page.evaluate(() => applyEditorHighlight("#00aa00", false));

  const formats = await page.evaluate(() => ({
    nested: HAS_NESTED_HIGHLIGHT_FN(),
    strong: postEditorContent.querySelectorAll("strong").length,
    em: postEditorContent.querySelectorAll("em").length,
    u: postEditorContent.querySelectorAll("u").length,
    point: postEditorContent.querySelectorAll(".post-inline-color").length,
    color:
      postEditorContent.querySelector(".post-inline-highlight")
        ?.dataset.highlight,
    text: postEditorContent.textContent
  }));

  check(
    "[highlight] 굵게·기울임·밑줄·글자색이 보존된다",
    formats.strong === 1 && formats.em === 1 && formats.u === 1 &&
    formats.point === 1 && formats.color === "#00aa00" &&
    formats.text === "가나다라마바" && formats.nested === false,
    JSON.stringify(formats)
  );

  /* ---- (4) 저장되는 HTML / 이미 중첩된 옛 본문 ---- */

  const legacyNested = await page.evaluate(() => {
    const html =
      '<span class="post-inline-highlight" data-highlight="#ff0000" ' +
      'style="background-color:#ff0000">가나' +
      '<span class="post-inline-highlight" data-highlight="#00ff00" ' +
      'style="background-color:#00ff00">다라</span>마바</span>';

    const probe = document.createElement("div");
    probe.innerHTML = getPostContentAsSafeHTML(html);

    return {
      nested: Boolean(
        probe.querySelector(".post-inline-highlight .post-inline-highlight")
      ),
      segments: Array.from(
        probe.querySelectorAll(".post-inline-highlight")
      ).map(n => ({ color: n.dataset.highlight, text: n.textContent })),
      text: probe.textContent
    };
  });

  check(
    "[highlight] 이미 중첩된 옛 본문은 그릴 때 안쪽 색이 이기도록 펴진다",
    legacyNested.nested === false &&
    legacyNested.text === "가나다라마바" &&
    legacyNested.segments.length === 3 &&
    legacyNested.segments[1].color === "#00ff00",
    JSON.stringify(legacyNested.segments)
  );

  const savedHTML = await page.evaluate(() => getRichEditorHTML());

  check(
    "[highlight] 저장되는 HTML에도 중첩이 남지 않는다",
    !/post-inline-highlight[^>]*>[^<]*<span[^>]*post-inline-highlight/.test(savedHTML) &&
    savedHTML.includes("post-inline-highlight"),
    savedHTML.slice(0, 120)
  );

  /* ---- (5) Undo / Redo ---- */

  await setup("가나다라마바사");
  await selectEditorRange(page, 0, 7);
  await page.evaluate(() => applyEditorHighlight("#ff0000", false));
  await selectEditorRange(page, 2, 5);
  await page.evaluate(() => applyEditorHighlight("#00ff00", false));

  await page.click("#postEditorUndoButton");
  await page.waitForTimeout(150);

  const undone = await page.evaluate(() => SEGMENTS_FN());

  await page.click("#postEditorRedoButton");
  await page.waitForTimeout(150);

  const redone = await page.evaluate(() => SEGMENTS_FN());

  check(
    "[highlight] Undo/Redo가 색 변경 한 칸씩 움직인다",
    undone.length === 1 && undone[0].color === "#ff0000" &&
    redone.length === 3 && redone[1].color === "#00ff00",
    `${JSON.stringify(undone)} / ${JSON.stringify(redone)}`
  );

  check("[highlight] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   3. height — 형광펜 높이
========================================================== */

async function runHeight(browser) {
  console.log("\n[height] 형광펜 높이를 바꿔도 레이아웃이 흔들리지 않는다");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  const HTML =
    "창가 자리에 앉은 그는 " +
    '<span class="post-inline-highlight" data-highlight="#f4dce6" ' +
    'style="background-color:#f4dce6">오래 식은 커피를 앞에 두고 창밖을 ' +
    "바라보고 있었다</span>. 거리에는 늦은 오후의 햇빛이 비스듬히 " +
    "내려앉았고, 지나가는 사람들의 그림자가 유리창 위로 길게 늘어졌다.";

  const MEASURE = () => {
    const page = VISIBLE_PAGE_FN();
    const content = page.querySelector(".post-editor-preview-content");
    const span = content.querySelector(".post-inline-highlight");

    const range = document.createRange();
    range.selectNodeContents(content);

    const lines = Array.from(range.getClientRects()).map(r => ({
      top: Math.round(r.top * 100) / 100,
      left: Math.round(r.left * 100) / 100,
      width: Math.round(r.width * 100) / 100
    }));

    const styles = getComputedStyle(span);
    const rect = span.getBoundingClientRect();

    return {
      pageHeight: page.offsetHeight,
      contentHeight: Math.round(content.getBoundingClientRect().height * 100) / 100,
      lines,
      spanTop: Math.round(rect.top * 100) / 100,
      spanHeight: Math.round(rect.height * 100) / 100,
      backgroundImage: styles.backgroundImage,
      inlineBackgroundImage: span.style.backgroundImage,
      backgroundColor: styles.backgroundColor,
      borderRadius: styles.borderTopLeftRadius
    };
  };

  await renderEditorPreview(page, {
    html: HTML,
    settings: { ...DECOR_SETTINGS, highlightHeight: 100 },
    title: ""
  });

  const full = await page.evaluate(MEASURE);

  await renderEditorPreview(page, {
    html: HTML,
    settings: { ...DECOR_SETTINGS, highlightHeight: 40 },
    title: ""
  });

  const short = await page.evaluate(MEASURE);

  check(
    "[height] 글자 위치와 줄바꿈이 전혀 변하지 않는다",
    JSON.stringify(full.lines) === JSON.stringify(short.lines) &&
    full.lines.length >= 3,
    `${full.lines.length}줄 / 같음=${
      JSON.stringify(full.lines) === JSON.stringify(short.lines)}`
  );

  check(
    "[height] 본문 높이와 페이지 높이가 그대로다",
    full.contentHeight === short.contentHeight &&
    full.pageHeight === short.pageHeight,
    `${full.contentHeight}/${short.contentHeight} · ${full.pageHeight}/${short.pageHeight}`
  );

  check(
    "[height] 형광펜 상자 자체는 크기가 그대로다(칠하는 범위만 다르다)",
    near(full.spanTop, short.spanTop, 0.6) &&
    near(full.spanHeight, short.spanHeight, 0.6),
    `${full.spanTop}/${short.spanTop} · ${full.spanHeight}/${short.spanHeight}`
  );

  check(
    "[height] 100%는 예전 그대로 배경색으로 칠한다",
    full.backgroundImage === "none" &&
    full.backgroundColor !== "rgba(0, 0, 0, 0)",
    `${full.backgroundImage} / ${full.backgroundColor}`
  );

  check(
    "[height] 낮추면 아래쪽만 칠하는 그라디언트가 된다",
    short.backgroundImage.includes("linear-gradient") &&
    short.inlineBackgroundImage.includes("60%") &&
    short.backgroundColor === "rgba(0, 0, 0, 0)",
    short.inlineBackgroundImage.slice(0, 110)
  );

  check(
    "[height] 모서리는 직각이다",
    full.borderRadius === "0px" && short.borderRadius === "0px",
    `${full.borderRadius} / ${short.borderRadius}`
  );

  /* 여러 줄로 이어지는 형광펜도 줄마다 따로 칠한다 */
  check(
    "[height] 여러 줄 형광펜은 줄마다 자기 배경을 갖는다(box-decoration-break)",
    await page.evaluate(() => {
      const span = VISIBLE_PAGE_FN()
        .querySelector(".post-inline-highlight");
      return span.getClientRects().length >= 2 &&
        getComputedStyle(span).webkitBoxDecorationBreak === "clone";
    })
  );

  check("[height] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   4. rule — 문단 강조선
========================================================== */

async function runRule(browser) {
  console.log("\n[rule] 문단 강조선");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  const BODY =
    "첫째 문단입니다.<br><br>" +
    '"대사가 들어 있는 문단입니다."<br><br>' +
    "셋째 문단입니다. 이 문단은 길어서 두 줄 이상으로 이어지도록 " +
    "충분히 늘려 두었습니다. 줄이 바뀌어도 선은 끊기지 않아야 합니다.";

  const setup = async (settings) => {
    await page.evaluate((input) => {
      postStyleSettings = input.settings;
      updatePresetHighlightSwatch();
      updatePresetRuleSwatch();
      postEditorContent.innerHTML = input.html;
      resetEditorUndoHistory();
    }, { settings, html: BODY });
  };

  const RULE_BOXES = () =>
    Array.from(
      VISIBLE_PAGE_FN().querySelectorAll(".post-para-rule-box")
    ).map(node => {
      const s = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      return {
        text: node.textContent.replace(/\s+/g, " ").trim().slice(0, 12),
        width: s.borderLeftWidth,
        color: s.borderLeftColor,
        paddingLeft: s.paddingLeft,
        display: s.display,
        height: Math.round(r.height)
      };
    });

  /* ---- (1) 문단 일부만 선택해도 문단 전체 ---- */

  await setup(DECOR_SETTINGS);

  await selectEditorRange(page, 2, 4);
  await page.evaluate(() => toggleEditorParagraphRule());
  await page.waitForTimeout(200);

  const marked = await page.evaluate(() => ({
    html: getRichEditorHTML(),
    marks: postEditorContent.querySelectorAll(".post-para-rule").length,
    firstChildIsMark:
      postEditorContent.firstChild?.classList?.contains("post-para-rule") === true,
    bars: document.querySelectorAll(".post-editor-rule-bar").length
  }));

  check(
    "[rule] 문단 맨 앞에 마커 하나만 들어간다",
    marked.marks === 1 && marked.firstChildIsMark === true,
    JSON.stringify({ marks: marked.marks, first: marked.firstChildIsMark })
  );

  check(
    "[rule] 저장되는 HTML에는 마커만 있고 그리는 상자는 없다",
    marked.html.includes('class="post-para-rule"') &&
    marked.html.includes('data-rule="on"') &&
    !marked.html.includes("post-para-rule-box"),
    marked.html.slice(0, 110)
  );

  check(
    "[rule] 편집창에도 선이 보인다",
    marked.bars >= 1,
    `막대 ${marked.bars}개`
  );

  const html1 = await page.evaluate(() => getRichEditorHTML());

  await renderEditorPreview(page, {
    html: html1,
    settings: DECOR_SETTINGS,
    title: ""
  });

  const boxes1 = await page.evaluate(RULE_BOXES);

  check(
    "[rule] 발췌에는 문단 전체를 감싸는 상자가 하나 생긴다",
    boxes1.length === 1 &&
    boxes1[0].text.startsWith("첫째 문단") &&
    boxes1[0].display === "block",
    JSON.stringify(boxes1)
  );

  check(
    "[rule] 굵기·색·여백이 프리셋 값을 따른다",
    boxes1[0].width === "3px" &&
    boxes1[0].color === "rgb(238, 159, 189)" &&
    boxes1[0].paddingLeft === "12px",
    JSON.stringify(boxes1[0])
  );

  /* ---- (2) 여러 줄 문단 — 선이 끊기지 않는다 ---- */

  await setup(DECOR_SETTINGS);
  await caretAtText(page, "셋째 문단");
  await page.evaluate(() => toggleEditorParagraphRule());
  await page.waitForTimeout(150);

  const html2 = await page.evaluate(() => getRichEditorHTML());

  await renderEditorPreview(page, {
    html: html2, settings: DECOR_SETTINGS, title: ""
  });

  const boxes2 = await page.evaluate(RULE_BOXES);
  const lineHeight = Math.round(DECOR_SETTINGS.bodySize * DECOR_SETTINGS.lineHeight);

  check(
    "[rule] 여러 줄 문단에도 상자는 하나, 높이는 여러 줄만큼이다",
    boxes2.length === 1 && boxes2[0].height >= lineHeight * 2 - 2,
    `${JSON.stringify(boxes2)} (한 줄 ≈ ${lineHeight}px)`
  );

  /* ---- (3) 대사 자동 적용 ---- */

  const autoSettings = { ...DECOR_SETTINGS, dialogueRuleEnabled: true };

  await renderEditorPreview(page, {
    html: BODY, settings: autoSettings, title: ""
  });

  const autoBoxes = await page.evaluate(RULE_BOXES);

  /*
    ★ 대사 자동 강조선은 BODY의 색·굵기·거리를 쓴다 (요구사항 3).

    예전에는 dialogueRuleColor/Width/Gap 세 벌을 따로 갖고 있어서,
    같은 글 안에서 수동으로 그은 선과 대사에 자동으로 붙은 선이
    서로 다른 색·굵기로 나올 수 있었다. 고르는 자리를 BODY 하나로
    합쳤고, DIALOGUE에는 "자동 적용" 체크만 남는다.

    DECOR_SETTINGS에는 옛 dialogueRule* 값이 그대로 들어 있다
    (색 #66aa88 · 굵기 5px). 그 값이 **BODY를 이기지 않는다**는
    것까지 여기서 확인한다.
  */

  check(
    "[rule] 옵션을 켜면 대사 문단에만 자동으로 붙는다",
    autoBoxes.length === 1 &&
    autoBoxes[0].text.startsWith('"대사'),
    JSON.stringify(autoBoxes)
  );

  check(
    "[rule] 대사 자동 강조선이 BODY의 색·굵기·거리를 따른다(옛 dialogue 값이 이기지 않는다)",
    autoBoxes.length === 1 &&
    autoBoxes[0].width === "3px" &&
    autoBoxes[0].color === "rgb(238, 159, 189)" &&
    autoBoxes[0].paddingLeft === "12px",
    JSON.stringify(autoBoxes) +
      " / 옛 dialogue 값 " +
      JSON.stringify({
        color: DECOR_SETTINGS.dialogueRuleColor,
        width: DECOR_SETTINGS.dialogueRuleWidth
      })
  );

  await renderEditorPreview(page, {
    html: BODY, settings: DECOR_SETTINGS, title: ""
  });

  check(
    "[rule] 신규 옵션의 기본값은 꺼짐이라 기존 외형이 그대로다",
    (await page.evaluate(RULE_BOXES)).length === 0
  );

  /* ---- (4) 자동으로 붙은 선을 개별 해제하면 다시 안 생긴다 ---- */

  await page.evaluate((input) => {
    postStyleSettings = input.settings;
    postEditorContent.innerHTML = input.html;
    resetEditorUndoHistory();
  }, { settings: autoSettings, html: BODY });

  await caretAtText(page, "대사가 들어");
  await page.evaluate(() => toggleEditorParagraphRule());
  await page.waitForTimeout(150);

  const offHTML = await page.evaluate(() => getRichEditorHTML());

  await renderEditorPreview(page, {
    html: offHTML, settings: autoSettings, title: ""
  });

  check(
    "[rule] 해제한 대사 문단은 다음 렌더에서 다시 생기지 않는다",
    offHTML.includes('data-rule="off"') &&
    (await page.evaluate(RULE_BOXES)).length === 0,
    offHTML.slice(0, 110)
  );

  /* ---- (5) 수동 + 자동이 겹쳐도 선은 하나 ---- */

  const overlapHTML =
    '<span class="post-para-rule" data-rule="on"></span>' +
    '"대사가 들어 있는 문단입니다."';

  await renderEditorPreview(page, {
    html: overlapHTML, settings: autoSettings, title: ""
  });

  const overlap = await page.evaluate(RULE_BOXES);

  check(
    "[rule] 수동과 자동이 겹쳐도 선은 하나만 그려진다(수동이 이긴다)",
    overlap.length === 1 && overlap[0].width === "3px",
    JSON.stringify(overlap)
  );

  /* ---- (6) 개별 색이 프리셋 기본값을 이긴다 ---- */

  const colored =
    '<span class="post-para-rule" data-rule="on" data-rule-color="#112233"></span>' +
    "개별 색을 지정한 문단.<br><br>" +
    '<span class="post-para-rule" data-rule="on"></span>' +
    "기본값을 따르는 문단.";

  await renderEditorPreview(page, {
    html: colored, settings: DECOR_SETTINGS, title: ""
  });

  const twoColors = await page.evaluate(RULE_BOXES);

  check(
    "[rule] 개별 지정 색이 우선하고, 지정이 없으면 프리셋 값을 따른다",
    twoColors.length === 2 &&
    twoColors[0].color === "rgb(17, 34, 51)" &&
    twoColors[1].color === "rgb(238, 159, 189)",
    JSON.stringify(twoColors.map(b => b.color))
  );

  await renderEditorPreview(page, {
    html: colored,
    settings: { ...DECOR_SETTINGS, bodyRuleColor: "#aabbcc", bodyRuleWidth: 6 },
    title: ""
  });

  const changed = await page.evaluate(RULE_BOXES);

  check(
    "[rule] 프리셋 기본값을 바꾸면 개별 지정이 없는 쪽만 따라 바뀐다",
    changed[0].color === "rgb(17, 34, 51)" &&
    changed[1].color === "rgb(170, 187, 204)" &&
    changed[0].width === "6px",
    JSON.stringify(changed.map(b => [b.color, b.width]))
  );

  /* ---- (7) 하이라이트·글자색과 함께 쓸 수 있다 ---- */

  const mixed =
    '<span class="post-para-rule" data-rule="on"></span>' +
    '가나<span class="post-inline-highlight" data-highlight="#f4dce6" ' +
    'style="background-color:#f4dce6">다라</span>' +
    '<span class="post-inline-color" data-point-color="#5c7cfa" ' +
    'style="color:#5c7cfa">마바</span>';

  await renderEditorPreview(page, {
    html: mixed, settings: DECOR_SETTINGS, title: ""
  });

  check(
    "[rule] 형광펜·글자색과 함께 쓸 수 있다",
    await page.evaluate(() => {
      const box = VISIBLE_PAGE_FN().querySelector(".post-para-rule-box");
      return Boolean(box) &&
        box.querySelectorAll(".post-inline-highlight").length === 1 &&
        box.querySelectorAll(".post-inline-color").length === 1 &&
        box.textContent === "가나다라마바";
    })
  );

  /* ---- (8) 출처 강조선 ---- */

  await page.evaluate(() => {
    previewSourceRuleEnabled = true;
    previewSourceRuleColor = "#7788ee";
  });

  await renderEditorPreview(page, {
    html: BODY, settings: DECOR_SETTINGS, title: ""
  });

  const sourceRule = await page.evaluate(() => {
    const source = VISIBLE_PAGE_FN()
      .querySelector(".post-editor-preview-source");
    const box = source.querySelector(".post-source-rule-box");
    const bs = box ? getComputedStyle(box) : null;
    const outer = getComputedStyle(source);
    return {
      hasBox: Boolean(box),
      text: box?.textContent,
      width: bs?.borderLeftWidth,
      color: bs?.borderLeftColor,
      padding: bs?.paddingLeft,
      display: bs?.display,
      /* 바깥 블록에는 선이 남아 있으면 안 된다 */
      outerWidth: outer.borderLeftWidth,
      outerPadding: outer.paddingLeft
    };
  });

  check(
    "[rule] 출처에도 강조선을 켜고 색을 바꿀 수 있다",
    sourceRule.hasBox === true &&
    sourceRule.width === "4px" &&
    sourceRule.color === "rgb(119, 136, 238)" &&
    sourceRule.padding === "12px" &&
    sourceRule.display === "inline-block" &&
    sourceRule.outerWidth === "0px" &&
    sourceRule.outerPadding === "0px",
    JSON.stringify(sourceRule)
  );


  /* ---- (8-1) 선이 출처 글자를 따라간다 (요구사항 4) ----

     선을 절대좌표로 옮기는 방식이면 정렬을 바꿔도 선이 제자리에
     남는다. 그래서 세 정렬 각각에서 **선의 x좌표가 글자 묶음의
     왼쪽 끝**이고, 캔버스 왼쪽 끝이 아닌지를 잰다. */

  const sourceAlignGeometry = {};

  for (const align of ["left", "center", "right"]) {

    await page.evaluate(() => {
      previewSourceRuleEnabled = true;
      previewSourceRuleColor = "#7788ee";
    });

    await renderEditorPreview(page, {
      html: BODY,
      settings: { ...DECOR_SETTINGS, sourceAlign: align },
      title: ""
    });

    sourceAlignGeometry[align] = await page.evaluate(() => {
      const pageEl = VISIBLE_PAGE_FN();
      const source = pageEl.querySelector(".post-editor-preview-source");
      const box = source.querySelector(".post-source-rule-box");
      const content = pageEl.querySelector(".post-editor-preview-content");

      const boxRect = box.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();

      /*
        글자만의 자리 — 선(border)과 거리(padding)를 뺀 안쪽.
        선이 글자 바로 왼쪽에 붙어 있는지를 이걸로 판정한다.
      */
      const cs = getComputedStyle(box);
      const textLeft =
        boxRect.left +
        parseFloat(cs.borderLeftWidth) +
        parseFloat(cs.paddingLeft);

      return {
        boxLeft: Math.round(boxRect.left - contentRect.left),
        boxRight: Math.round(boxRect.right - contentRect.left),
        textLeft: Math.round(textLeft - contentRect.left),
        contentWidth: Math.round(contentRect.width),
        boxWidth: Math.round(boxRect.width),
        gap: Math.round(parseFloat(cs.paddingLeft)),
        border: Math.round(parseFloat(cs.borderLeftWidth))
      };
    });
  }

  check(
    "[rule] 출처 강조선이 왼쪽 정렬에서 글자 바로 왼쪽에 붙는다",
    sourceAlignGeometry.left.boxLeft <= 1 &&
    sourceAlignGeometry.left.textLeft ===
      sourceAlignGeometry.left.border + sourceAlignGeometry.left.gap,
    JSON.stringify(sourceAlignGeometry.left)
  );

  check(
    "[rule] 가운데 정렬이면 선도 글자 묶음과 함께 가운데로 온다",
    sourceAlignGeometry.center.boxLeft > 1 &&
    Math.abs(
      sourceAlignGeometry.center.boxLeft -
      (sourceAlignGeometry.center.contentWidth -
        sourceAlignGeometry.center.boxRight)
    ) <= 2,
    JSON.stringify(sourceAlignGeometry.center)
  );

  check(
    "[rule] 오른쪽 정렬이면 선이 본문 왼쪽 끝에 남지 않고 글자를 따라간다",
    sourceAlignGeometry.right.boxRight >=
      sourceAlignGeometry.right.contentWidth - 1 &&
    sourceAlignGeometry.right.boxLeft > 1 &&
    /* 선은 글자 오른쪽으로 옮겨 가지 않는다 — 여전히 왼쪽이다 */
    sourceAlignGeometry.right.textLeft >
      sourceAlignGeometry.right.boxLeft,
    JSON.stringify(sourceAlignGeometry.right)
  );


  /* ---- (8-2) 출처가 여러 줄이어도 선이 따라온다 ---- */

  const multiline = await page.evaluate(() => {
    const pageEl = VISIBLE_PAGE_FN();
    const source = pageEl.querySelector(".post-editor-preview-source");
    const box = source.querySelector(".post-source-rule-box");
    const content = pageEl.querySelector(".post-editor-preview-content");

    const oneLine = box.getBoundingClientRect().height;

    /* 실제로 여러 줄이 되게 긴 출처를 넣는다 */
    box.textContent =
      "@hongcha 아주 긴 출처 문구를 넣어서 여러 줄이 되게 만든다 " +
      "그리고 조금 더 이어 붙인다 계속 이어 붙인다 더 길게";

    const boxRect = box.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const cs = getComputedStyle(box);

    /*
      글자가 실제로 그려진 자리 — 선이 글자와 겹치지 않고, 선에서
      정해진 거리만큼 떨어져 있는지 본다.
    */
    const range = document.createRange();
    range.selectNodeContents(box);
    const textRect = range.getBoundingClientRect();

    return {
      oneLine: Math.round(oneLine),
      height: Math.round(boxRect.height),
      width: Math.round(boxRect.width),
      contentWidth: Math.round(contentRect.width),
      border: cs.borderLeftWidth,
      /* 선 오른쪽 끝 ~ 글자 왼쪽 끝 사이 거리 */
      gapToText: Math.round(
        textRect.left -
        (boxRect.left + parseFloat(cs.borderLeftWidth))
      )
    };
  });

  check(
    "[rule] 출처가 여러 줄이 되어도 선이 멀어지거나 글자와 겹치지 않는다",
    /* 진짜로 줄이 늘어났고 */
    multiline.height >= multiline.oneLine * 1.8 &&
    /* 상자가 캔버스를 넘지 않으며 */
    multiline.width <= multiline.contentWidth + 1 &&
    multiline.border === "4px" &&
    /*
      SOURCE에서 정한 거리(12px)를 그대로 지킨다. Range 사각형은
      첫 글자의 좌측 베어링만큼 안쪽으로 잡히므로 몇 px 여유를
      둔다 — 중요한 것은 "겹치지 않고, 정한 거리보다 좁지 않다".
    */
    multiline.gapToText >= 12 &&
    multiline.gapToText <= 18,
    JSON.stringify(multiline)
  );


  await page.evaluate(() => {
    previewSourceRuleEnabled = true;
    previewSourceRuleColor = "#7788ee";
  });

  await renderEditorPreview(page, {
    html: BODY, settings: DECOR_SETTINGS, title: ""
  });

  await page.evaluate(() => {
    previewSourceRuleEnabled = false;
    previewSourceRuleColor = null;
  });

  await renderEditorPreview(page, {
    html: BODY, settings: DECOR_SETTINGS, title: ""
  });

  check(
    "[rule] 출처 강조선을 끄면 흔적이 남지 않는다",
    await page.evaluate(() => {
      const s = getComputedStyle(
        VISIBLE_PAGE_FN().querySelector(".post-editor-preview-source")
      );
      return s.borderLeftWidth === "0px" && s.paddingLeft === "0px";
    })
  );

  /* ---- (9) 공개 뷰어(발행된 글 본문)도 같은 함수를 쓴다 ---- */

  const published = await page.evaluate((input) => {
    /*
      posts/view/posts-view-detail.js가 글을 그릴 때 쓰는 바로 그
      함수다 — 발췌/미리보기와 같은 코드인지 여기서 확인한다.
    */
    const host = document.createElement("div");

    renderStyledPostContentInto(
      host,
      input.html,
      input.settings
    );

    const box = host.querySelector(".post-para-rule-box");
    const span = host.querySelector(".post-inline-highlight");

    return {
      ruleWidth: box ? box.style.borderLeftWidth : null,
      ruleColor: box ? box.style.borderLeftColor : null,
      rulePadding: box ? box.style.paddingLeft : null,
      ruleText: box ? box.textContent.trim().slice(0, 8) : null,
      gradient: span
        ? span.style.backgroundImage.includes("linear-gradient")
        : null,
      markerHidden: Boolean(host.querySelector(".post-para-rule")),
      boxes: host.querySelectorAll(".post-para-rule-box").length
    };
  }, {
    html:
      '<span class="post-para-rule" data-rule="on"></span>' +
      '강조선 문단<span class="post-inline-highlight" data-highlight="#f4dce6" ' +
      'style="background-color:#f4dce6">형광펜</span>',
    settings: { ...DECOR_SETTINGS, highlightHeight: 40 }
  });

  check(
    "[rule] 발행된 글 본문(공개 뷰어)에도 같은 규칙으로 그려진다",
    published.boxes === 1 &&
    published.ruleWidth === "3px" &&
    published.rulePadding === "12px" &&
    published.ruleText.startsWith("강조선") &&
    published.gradient === true,
    JSON.stringify(published)
  );

  check("[rule] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   5. background — 캔버스 배경 사진
========================================================== */

async function runBackground(browser) {
  console.log("\n[background] 배경 사진 · 구도 · Editor 조작");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  const GEOMETRY = () => {
    const pageEl = VISIBLE_PAGE_FN();
    const wrap = pageEl.querySelector(".post-page-background");
    const img = pageEl.querySelector(".post-page-background-image");
    const overlay = pageEl.querySelector(".post-page-background-overlay");
    const content = pageEl.querySelector(".post-editor-preview-content");

    if (!img) {
      return null;
    }

    return {
      pageW: pageEl.offsetWidth,
      pageH: pageEl.offsetHeight,
      left: parseFloat(img.style.left),
      top: parseFloat(img.style.top),
      w: parseFloat(img.style.width),
      h: parseFloat(img.style.height),
      filter: img.style.filter,
      wrapOverflow: getComputedStyle(wrap).overflow,
      contentFilter: getComputedStyle(content).filter,
      contentZ: getComputedStyle(content).zIndex,
      contentPosition: getComputedStyle(content).position,
      wrapZ: getComputedStyle(wrap).zIndex,
      overlayOpacity: overlay.style.opacity,
      overlayColor: overlay.style.backgroundColor
    };
  };

  const draw = async (extra, pageView) => {
    await renderEditorPreview(page, {
      html: "창가 자리에 앉은 그는 커피를 앞에 두고 있었다.",
      settings: { ...DECOR_SETTINGS, ...extra },
      title: ""
    });
    await page.waitForTimeout(250);
    return page.evaluate(GEOMETRY);
  };

  const covers = (g) =>
    g.left <= 0.02 && g.top <= 0.02 &&
    g.left + g.w >= g.pageW - 0.02 &&
    g.top + g.h >= g.pageH - 0.02;

  /* ---- (1) 가로 사진 / 세로 사진, 배율 1배 ---- */

  const land = await draw({ backgroundImageUrl: LANDSCAPE });

  check(
    "[background] 가로 사진이 캔버스를 빈틈없이 덮는다",
    covers(land),
    JSON.stringify(land)
  );

  check(
    "[background] 원본 비율이 유지된다(찌그러뜨리지 않는다)",
    Math.abs(land.w / land.h - 1200 / 600) < 0.01,
    `${land.w} × ${land.h}`
  );

  const port = await draw({ backgroundImageUrl: PORTRAIT });

  check(
    "[background] 세로 사진도 빈틈없이 덮고 비율이 유지된다",
    covers(port) && Math.abs(port.w / port.h - 600 / 1200) < 0.01,
    JSON.stringify(port)
  );

  check(
    "[background] 100%는 '덮는 최소 크기'다(가로·세로 중 한쪽이 꼭 맞는다)",
    (Math.abs(land.h - land.pageH) < 0.5 || Math.abs(land.w - land.pageW) < 0.5) &&
    (Math.abs(port.h - port.pageH) < 0.5 || Math.abs(port.w - port.pageW) < 0.5),
    `가로 ${land.w}×${land.h} / 세로 ${port.w}×${port.h} / 캔버스 ${land.pageW}×${land.pageH}`
  );

  /* ---- (2) 확대 ---- */

  const zoom = await draw({
    backgroundImageUrl: LANDSCAPE,
    backgroundImageScale: 2
  });

  check(
    "[background] 확대해도 덮은 채로 정확히 2배가 된다",
    covers(zoom) &&
    Math.abs(zoom.w - land.w * 2) < 0.5 &&
    Math.abs(zoom.h - land.h * 2) < 0.5,
    `${land.w}→${zoom.w}`
  );

  /* ---- (3) 중심을 끝까지 밀어도 빈 공간이 없다 ---- */

  for (const [fx, fy] of [[0, 0], [1, 1], [-3, 4]]) {
    const edge = await draw({
      backgroundImageUrl: LANDSCAPE,
      backgroundImageScale: 1.6,
      backgroundImageFocusX: fx,
      backgroundImageFocusY: fy
    });

    check(
      `[background] 중심을 ${fx},${fy}로 줘도 빈 공간이 드러나지 않는다`,
      covers(edge),
      JSON.stringify(edge)
    );
  }

  /* ---- (4) 흐림 / 덮개 / 쌓임 순서 ---- */

  const blurred = await draw({
    backgroundImageUrl: LANDSCAPE,
    backgroundImageBlur: 12,
    backgroundOverlayColor: "#204060",
    backgroundOverlayOpacity: 0.4
  });

  check(
    "[background] 흐림은 사진에만 걸리고 글자는 흐려지지 않는다",
    blurred.filter === "blur(12px)" &&
    (blurred.contentFilter === "none" || blurred.contentFilter === ""),
    `img=${blurred.filter} / content=${blurred.contentFilter}`
  );

  check(
    "[background] 흐림 때문에 가장자리가 비지 않는다(여유만큼 더 덮고 잘라낸다)",
    covers(blurred) &&
    blurred.left <= -36 && blurred.top <= -36 &&
    blurred.wrapOverflow === "hidden",
    JSON.stringify({
      left: blurred.left, top: blurred.top, overflow: blurred.wrapOverflow
    })
  );

  check(
    "[background] 사진 위에 덮개, 그 위에 글자가 온다",
    blurred.overlayOpacity === "0.4" &&
    blurred.overlayColor === "rgb(32, 64, 96)" &&
    blurred.wrapZ === "0" &&
    blurred.contentZ === "1" &&
    blurred.contentPosition === "relative",
    JSON.stringify({
      opacity: blurred.overlayOpacity,
      wrapZ: blurred.wrapZ,
      contentZ: blurred.contentZ
    })
  );

  /* ---- (5) 캔버스 비율이 달라도 중심을 지킨다 ---- */

  /*
    ★ 확대 2배에서 본다. 1배(= 덮는 최소 크기)에서는 좌우로 남는
    여유가 거의 없어서 중심이 유효 범위로 잘리는 것이 정상이고
    (빈 공간을 막는 장치), 그건 아래 (3)에서 따로 확인한다.
  */

  const wide = await draw({
    backgroundImageUrl: LANDSCAPE,
    ratio: "custom", ratioWidth: 16, ratioHeight: 9,
    backgroundImageScale: 2,
    backgroundImageFocusX: 0.3, backgroundImageFocusY: 0.5
  });

  const tall = await draw({
    backgroundImageUrl: LANDSCAPE,
    ratio: "custom", ratioWidth: 9, ratioHeight: 16,
    backgroundImageScale: 2,
    backgroundImageFocusX: 0.3, backgroundImageFocusY: 0.5
  });

  const centreOf = (g) => ({
    x: (g.pageW / 2 - g.left) / g.w,
    y: (g.pageH / 2 - g.top) / g.h
  });

  const cWide = centreOf(wide);
  const cTall = centreOf(tall);

  check(
    "[background] 캔버스 비율이 달라져도 지정한 중심이 유지된다",
    covers(wide) && covers(tall) &&
    Math.abs(cWide.x - 0.3) < 0.001 &&
    Math.abs(cTall.x - 0.3) < 0.001,
    `16:9 → ${cWide.x.toFixed(3)} / 9:16 → ${cTall.x.toFixed(3)}`
  );

  /* ---- (6) 여러 장 — 기본 구도 공통 + 개별 보정 ---- */

  await page.evaluate(() => {
    previewBackgroundUrl = null;
    previewBackgroundFocusX = null;
    previewBackgroundFocusY = null;
    previewBackgroundPageFocus = {};
  });

  const TWO_PAGES =
    "첫째 장입니다." +
    '<div class="post-editor-page-break" data-page-break="true" ' +
    'contenteditable="false">PAGE BREAK</div>' +
    "둘째 장입니다.";

  await renderEditorPreview(page, {
    html: TWO_PAGES,
    settings: { ...DECOR_SETTINGS, backgroundImageUrl: LANDSCAPE },
    title: ""
  });
  await page.waitForTimeout(250);

  const bothPages = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll("#postEditorPreviewPages .post-editor-preview-page")
    ).map(p => {
      const img = p.querySelector(".post-page-background-image");
      return img ? parseFloat(img.style.left) : null;
    })
  );

  check(
    "[background] 여러 장이면 모든 장에 같은 기본 구도가 들어간다",
    bothPages.length === 2 &&
    bothPages.every(v => typeof v === "number") &&
    Math.abs(bothPages[0] - bothPages[1]) < 0.5,
    JSON.stringify(bothPages)
  );

  await page.evaluate(() => {
    previewBackgroundPageFocus = { "1": { focusX: 0.85, focusY: 0.5 } };
  });

  await renderEditorPreview(page, {
    html: TWO_PAGES,
    settings: { ...DECOR_SETTINGS, backgroundImageUrl: LANDSCAPE },
    title: ""
  });
  await page.waitForTimeout(250);

  const perPage = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll("#postEditorPreviewPages .post-editor-preview-page")
    ).map(p => parseFloat(
      p.querySelector(".post-page-background-image").style.left
    ))
  );

  check(
    "[background] 필요한 장만 개별 보정할 수 있다",
    Math.abs(perPage[0] - bothPages[0]) < 0.5 &&
    Math.abs(perPage[1] - bothPages[1]) > 1,
    JSON.stringify(perPage)
  );

  /* 본문이 줄어 한 장이 되면 없어진 장의 보정은 버린다 */

  await renderEditorPreview(page, {
    html: "한 장으로 줄었습니다.",
    settings: { ...DECOR_SETTINGS, backgroundImageUrl: LANDSCAPE },
    title: ""
  });
  await page.waitForTimeout(200);

  check(
    "[background] 장이 줄면 사라진 장의 보정값을 버린다",
    await page.evaluate(() =>
      Object.keys(previewBackgroundPageFocus).length === 0),
    await page.evaluate(() => JSON.stringify(previewBackgroundPageFocus))
  );

  /* ---- (7) Editor의 조작 UI — 조정 모드에서만 움직인다 ---- */

  await page.evaluate(() => {
    previewBackgroundUrl = null;
    previewBackgroundFocusX = null;
    previewBackgroundFocusY = null;
    previewBackgroundPageFocus = {};
    syncPreviewBackgroundControls();
  });

  await renderEditorPreview(page, {
    html: "창가 자리에 앉은 그는 커피를 앞에 두고 있었다.",
    settings: { ...DECOR_SETTINGS, backgroundImageUrl: LANDSCAPE },
    title: ""
  });
  await page.waitForTimeout(250);

  check(
    "[background] 프리뷰 위에 겹쳐 뜨는 버튼이 없다",
    await page.evaluate(() =>
      VISIBLE_PAGE_FN().querySelectorAll("button").length === 0)
  );

  check(
    "[background] 버튼 셋이 여닫는 단계 없이 바로 보인다 (요구사항 8)",
    await page.evaluate(() => {
      const ids = [
        "postEditorPreviewBackgroundPick",
        "postEditorPreviewBackgroundMove",
        "postEditorPreviewBackgroundReset"
      ];

      /* 예전의 여닫기 버튼과 패널은 아예 없다 */
      if (
        document.getElementById("postEditorPreviewBackgroundToggle") ||
        document.getElementById("postEditorPreviewBackgroundPanel")
      ) {
        return false;
      }

      return ids.every(id => {
        const el = document.getElementById(id);
        return el && el.offsetParent !== null;
      });
    })
  );

  check(
    "[background] 라벨이 change image / move / reset이다",
    await page.evaluate(() =>
      document.getElementById("postEditorPreviewBackgroundPick")
        .textContent.trim() === "change image" &&
      document.getElementById("postEditorPreviewBackgroundMove")
        .textContent.trim() === "move" &&
      document.getElementById("postEditorPreviewBackgroundReset")
        .textContent.trim() === "reset")
  );

  /*
    ★ 상자는 끌 때마다 다시 잰다 — 프리뷰 위치가 설정 줄의
    높이에 따라 달라질 수 있다.
  */
  const dragBackground = async () => {
    const pageBox = await page
      .locator("#postEditorPreviewPages .post-editor-preview-page:not([hidden])")
      .boundingBox();

    await page.mouse.move(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      pageBox.x + pageBox.width / 2 - 40,
      pageBox.y + pageBox.height / 2,
      { steps: 4 }
    );
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(200);
  };

  await dragBackground();

  check(
    "[background] 평소에는 드래그가 배경을 움직이지 않는다",
    await page.evaluate(() => previewBackgroundFocusX === null)
  );

  await page.click("#postEditorPreviewBackgroundMove");
  await page.waitForTimeout(150);

  check(
    "[background] 조정 모드가 켜진 것이 눈에 보인다",
    await page.evaluate(() =>
      document.getElementById("postEditorPreviewStage")
        .classList.contains("is-background-move") &&
      document.getElementById("postEditorPreviewBackgroundMove")
        .getAttribute("aria-pressed") === "true")
  );

  await dragBackground();

  const moved = await page.evaluate(() => previewBackgroundFocusX);

  check(
    "[background] 조정 모드에서는 드래그가 배경을 움직인다",
    typeof moved === "number" && moved > 0.5,
    String(moved)
  );

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  check(
    "[background] Escape로 조정 모드가 분명히 끝난다",
    await page.evaluate(() =>
      previewBackgroundMoveMode === false &&
      !document.getElementById("postEditorPreviewStage")
        .classList.contains("is-background-move"))
  );

  await page.click("#postEditorPreviewBackgroundReset");
  await page.waitForTimeout(250);

  check(
    "[background] 프리셋 기본 구도로 되돌릴 수 있다",
    await page.evaluate(() =>
      previewBackgroundFocusX === null &&
      previewBackgroundUrl === null &&
      Object.keys(previewBackgroundPageFocus).length === 0)
  );

  check(
    "[background] 조정용 테두리는 페이지가 아니라 무대에 있다(저장 이미지에 안 들어간다)",
    await page.evaluate(() => {
      const stage = document.getElementById("postEditorPreviewStage");
      const pageEl = VISIBLE_PAGE_FN();
      return !pageEl.contains(stage) && stage.contains(pageEl);
    })
  );

  check("[background] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   6. preset — 새 필드의 저장 · 기본값 · 관리 패널 미리보기
========================================================== */

async function runPreset(browser) {
  console.log("\n[preset] 새 설정의 저장 · 기본값 · 관리 패널");

  const { ctx, page, errors } = await openQuotePanel(browser);
  await installProbes(page);

  /* ---- (1) 새 필드가 폼 왕복에서 그대로 살아남는다 ---- */

  const roundTrip = await page.evaluate((input) => {
    applyQuoteSettings(input.settings);
    const collected = collectQuoteSettings();
    applyQuoteSettings(collected);
    const again = collectQuoteSettings();

    const keys = [
      "highlightHeight",
      "bodyRuleColor", "bodyRuleWidth",
      "dialogueRuleEnabled", "dialogueRuleColor", "dialogueRuleWidth",
      "sourceRuleEnabled", "sourceRuleColor", "sourceRuleWidth",
      "backgroundImageUrl", "backgroundImageScale",
      "backgroundImageFocusX", "backgroundImageFocusY",
      "backgroundImageBlur",
      "backgroundOverlayColor", "backgroundOverlayOpacity"
    ];

    const first = {};
    const second = {};
    keys.forEach(k => { first[k] = collected[k]; second[k] = again[k]; });

    return { first, second };
  }, {
    settings: {
      ...DECOR_SETTINGS,
      highlightHeight: 45,
      dialogueRuleEnabled: true,
      sourceRuleEnabled: true,
      backgroundImageUrl: LANDSCAPE,
      backgroundImageScale: 1.5,
      backgroundImageFocusX: 0.25,
      backgroundImageFocusY: 0.75,
      backgroundImageBlur: 8,
      backgroundOverlayColor: "#204060",
      backgroundOverlayOpacity: 0.35
    }
  });

  check(
    "[preset] 새 설정이 폼 왕복에서 값을 바꾸지 않는다",
    JSON.stringify(roundTrip.first) === JSON.stringify(roundTrip.second),
    JSON.stringify(roundTrip.first)
  );

  check(
    "[preset] 저장되는 값이 정규화된 형태 그대로다",
    roundTrip.first.highlightHeight === 45 &&
    roundTrip.first.dialogueRuleEnabled === true &&
    roundTrip.first.sourceRuleWidth === 4 &&
    Math.abs(roundTrip.first.backgroundImageScale - 1.5) < 0.001 &&
    Math.abs(roundTrip.first.backgroundOverlayOpacity - 0.35) < 0.001 &&
    roundTrip.first.backgroundImageUrl === LANDSCAPE &&
    Math.abs(roundTrip.first.backgroundImageFocusX - 0.25) < 0.001,
    JSON.stringify(roundTrip.first)
  );

  check(
    "[preset] 배경 주소로 임시 URL(blob:/data 미리보기)이 아니라 저장된 주소가 들어간다",
    !roundTrip.first.backgroundImageUrl.startsWith("blob:"),
    roundTrip.first.backgroundImageUrl.slice(0, 24)
  );

  /* ---- (2) 새 필드가 없는 옛 프리셋 ---- */

  const legacy = await page.evaluate((image) => {
    const old = {
      bodySize: 15,
      paragraphSpacing: 0,
      legacyUnknown: "그대로"
    };

    applyQuoteSettings(old);
    const collected = collectQuoteSettings();

    /*
      사진이 이미 있는데 덮개 값만 없는 옛 프리셋 — 여기서는
      0%가 그대로 보존돼야 한다(열기만 했는데 외형이 달라지면
      안 된다).
    */

    applyQuoteSettings({
      bodySize: 15,
      backgroundImageUrl: image
    });

    const withImage = collectQuoteSettings();

    /* 사용자가 일부러 0%로 저장해둔 프리셋 */

    applyQuoteSettings({
      backgroundImageUrl: image,
      backgroundOverlayOpacity: 0
    });

    const explicitZero = collectQuoteSettings();

    return {
      highlightHeight: collected.highlightHeight,
      dialogueRuleEnabled: collected.dialogueRuleEnabled,
      sourceRuleEnabled: collected.sourceRuleEnabled,
      backgroundImageUrl: collected.backgroundImageUrl,
      backgroundOverlayOpacity: collected.backgroundOverlayOpacity,
      fixedSize: collected.backgroundImageFixedSize,
      bodyRuleGap: collected.bodyRuleGap,
      dialogueRuleGap: collected.dialogueRuleGap,
      sourceRuleGap: collected.sourceRuleGap,
      withImageOverlay: withImage.backgroundOverlayOpacity,
      explicitZeroOverlay: explicitZero.backgroundOverlayOpacity,
      unknown: collected.legacyUnknown
    };
  }, LANDSCAPE);

  check(
    "[preset] 값이 없던 옛 프리셋은 예전과 같은 외형으로 읽힌다",
    legacy.highlightHeight === 100 &&
    legacy.dialogueRuleEnabled === false &&
    legacy.sourceRuleEnabled === false &&
    legacy.backgroundImageUrl === "" &&
    /*
      강조선 거리는 예전에 상수로 박혀 있던 12px로 읽힌다 —
      이 옵션이 생겨도 이미 발행된 글의 모양이 달라지지 않는다.
    */
    legacy.bodyRuleGap === 12 &&
    legacy.sourceRuleGap === 12 &&
    /*
      ★ 대사 강조선의 거리는 이제 고르는 자리가 없다 (요구사항 3).
      값이 원래 없던 프리셋에는 키를 만들지 않는다 — 기본값을 새로
      써넣으면 "안 쓰는 설정"이 전 프리셋으로 번진다. 렌더는 BODY
      값을 쓰므로 외형은 그대로다.
    */
    legacy.dialogueRuleGap === undefined &&
    /* 이미지 크기 고정은 옛 프리셋에서 저절로 켜지지 않는다 */
    legacy.fixedSize === false,
    JSON.stringify(legacy)
  );

  check(
    "[preset] 덮개 농도 — 사진이 있는 옛 프리셋은 0%가 보존되고, 사진이 없으면 50%로 시작한다",
    legacy.withImageOverlay === 0 &&
    legacy.explicitZeroOverlay === 0 &&
    legacy.backgroundOverlayOpacity === 0.5,
    JSON.stringify({
      withImage: legacy.withImageOverlay,
      explicitZero: legacy.explicitZeroOverlay,
      noImage: legacy.backgroundOverlayOpacity
    })
  );

  check(
    "[preset] 새 필드를 넣어도 알 수 없는 옛 필드는 보존된다",
    legacy.unknown === "그대로"
  );

  /* ---- (3) 관리 패널 미리보기도 같은 공용 함수를 쓴다 ---- */

  await page.evaluate((input) => {
    applyQuoteSettings(input.settings);
    document.getElementById("quoteTestBody").value =
      "> 강조선이 걸린 문단입니다.\n\n==형광펜==이 들어간 문단입니다.";
    updateQuotePreview();
  }, {
    settings: {
      ...DECOR_SETTINGS,
      highlightHeight: 40,
      backgroundImageUrl: LANDSCAPE
    }
  });

  await page.waitForTimeout(500);

  const adminRender = await page.evaluate(() => {
    const pageEl = document.querySelector(
      "#quotePreviewCanvas .post-editor-preview-page:not([hidden])"
    );
    const box = pageEl.querySelector(".post-para-rule-box");
    const span = pageEl.querySelector(".post-inline-highlight");
    const img = pageEl.querySelector(".post-page-background-image");

    return {
      rule: box ? getComputedStyle(box).borderLeftWidth : null,
      ruleText: box ? box.textContent.trim().slice(0, 6) : null,
      gradient: span
        ? getComputedStyle(span).backgroundImage.includes("linear-gradient")
        : null,
      radius: span ? getComputedStyle(span).borderTopLeftRadius : null,
      imgW: img ? parseFloat(img.style.width) : null,
      pageW: pageEl.offsetWidth,
      pageH: pageEl.offsetHeight,
      left: img ? parseFloat(img.style.left) : null,
      top: img ? parseFloat(img.style.top) : null,
      h: img ? parseFloat(img.style.height) : null
    };
  });

  check(
    "[preset] 관리 패널 미리보기에도 강조선이 같은 규칙으로 그려진다",
    adminRender.rule === "3px" && adminRender.ruleText.startsWith("강조선"),
    JSON.stringify(adminRender)
  );

  check(
    "[preset] 관리 패널 미리보기의 형광펜도 높이 설정과 직각 모서리를 따른다",
    adminRender.gradient === true && adminRender.radius === "0px",
    `${adminRender.gradient} / ${adminRender.radius}`
  );

  check(
    "[preset] 관리 패널 미리보기의 배경도 캔버스를 빈틈없이 덮는다",
    adminRender.left <= 0.02 && adminRender.top <= 0.02 &&
    adminRender.left + adminRender.imgW >= adminRender.pageW - 0.02 &&
    adminRender.top + adminRender.h >= adminRender.pageH - 0.02,
    JSON.stringify(adminRender)
  );

  /* ---- (4) 숫자 칸 / 슬라이더가 실제로 값을 바꾼다 ----

     형광펜 높이는 슬라이더에서 네모 숫자 칸으로 바뀌었다
     (요구사항 3) — 값을 따로 보여주던 요소는 없어졌고,
     칸 자체가 곧 표시다. */

  await page.evaluate(() => {
    const input = document.getElementById("quoteHighlightHeight");
    input.value = "70";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  check(
    "[preset] 형광펜 높이 숫자 칸이 수집값에 반영된다",
    await page.evaluate(() => {
      const input = document.getElementById("quoteHighlightHeight");
      return collectQuoteSettings().highlightHeight === 70 &&
        input.type === "number" &&
        input.value === "70" &&
        document.getElementById("quoteHighlightHeightValue") === null;
    })
  );

  check(
    "[preset] 남은 슬라이더는 공용 컴포넌트(.imory-range)를 쓴다",
    await page.evaluate(() =>
      Array.from(document.querySelectorAll(".quote-controls input[type=range]"))
        .every(n => n.classList.contains("imory-range")) &&
      document.querySelectorAll(".quote-controls input[type=range]").length >= 2)
  );

  /* ---- (5) 지문/대사가 독립 섹션으로 옮겨졌고 값은 그대로다 ---- */

  const sections = await page.evaluate(() => {
    const titles = Array.from(
      document.querySelectorAll(".quote-accordion-title")
    ).map(n => n.textContent.trim());

    const sectionOf = (id) => {
      const node = document.getElementById(id);
      const section = node?.closest(".quote-accordion");
      return section
        ? section.querySelector(".quote-accordion-title").textContent.trim()
        : null;
    };

    return {
      titles,
      action: sectionOf("quoteActionColor"),
      dialogue: sectionOf("quoteDialogueColor"),
      dialogueRule: sectionOf("quoteDialogueRuleEnabled"),
      sourceRule: sectionOf("quoteSourceRuleEnabled"),
      bodyRule: sectionOf("quoteBodyRuleColor"),
      /* BODY 섹션(글자색이 있는 그 섹션) 안에 지문/대사 설정이
         더 이상 없다 */
      nestedInBody: Boolean(
        document.getElementById("quoteTextColor")
          ?.closest(".quote-accordion")
          ?.querySelector("#quoteActionColor, #quoteDialogueColor")
      )
    };
  });

  check(
    "[preset] BODY / NARRATION / DIALOGUE / SOURCE가 각각 독립 섹션이다",
    sections.action === "NARRATION" &&
    sections.dialogue === "DIALOGUE" &&
    sections.dialogueRule === "DIALOGUE" &&
    sections.sourceRule === "SOURCE" &&
    sections.bodyRule === "BODY" &&
    sections.nestedInBody === false,
    JSON.stringify(sections)
  );

  check(
    "[preset] 지문/대사 값의 저장 키는 그대로다(actionColor · dialogueColor …)",
    await page.evaluate(() => {
      applyQuoteSettings({
        actionColor: "#111111", actionWeight: "600", actionItalic: true,
        dialogueColor: "#222222", dialogueWeight: "300", dialogueItalic: true
      });
      const c = collectQuoteSettings();
      return c.actionColor === "#111111" && c.actionWeight === "600" &&
        c.actionItalic === true && c.dialogueColor === "#222222" &&
        c.dialogueWeight === "300" && c.dialogueItalic === true;
    })
  );

  check("[preset] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}





/* =========================================================
   7. export — 저장되는 PNG의 실제 픽셀

   미리보기에서만 맞고 저장 이미지에서 틀어지는 일이 없어야
   한다(요구사항 9·10). 브라우저 안에서 실제 캡처를 돌려 나온
   PNG를 디코드하고 픽셀을 직접 센다.
========================================================== */

/*
  지금 보이는 페이지를 실제로 캡처해서 픽셀을 센다.

    counts[이름]  그 색에 가까운 픽셀 수
    boxes[이름]   그 색 픽셀들의 경계 상자
    mixed         빨강도 파랑도 아닌 중간색 픽셀 수(흐림 판정)
*/

const CAPTURE_AND_MEASURE = async (probe) => {
  const pageEl = VISIBLE_PAGE_FN();

  const blob = await captureVisiblePageAsBlob(
    pageEl,
    POST_PAGE_LAYOUT_WIDTH,
    getPostPreviewRatio(postStyleSettings || {})
  );

  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  const near = (i, rgb, tolerance) =>
    Math.abs(data[i] - rgb[0]) <= tolerance &&
    Math.abs(data[i + 1] - rgb[1]) <= tolerance &&
    Math.abs(data[i + 2] - rgb[2]) <= tolerance;

  const result = {
    width: canvas.width,
    height: canvas.height,
    corner: [data[0], data[1], data[2]],
    counts: {},
    boxes: {},
    mixed: 0
  };

  Object.entries(probe.colors || {}).forEach(([name, spec]) => {
    let count = 0;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const i = (y * canvas.width + x) * 4;
        if (!near(i, spec.rgb, spec.tolerance === undefined ? 24 : spec.tolerance)) continue;
        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    result.counts[name] = count;
    result.boxes[name] = count
      ? { minX, minY, maxX, maxY, height: maxY - minY + 1 }
      : null;
  });

  if (probe.countMixed) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 90) continue;
      if (r > 60 && r < 200 && b > 60 && b < 200) {
        result.mixed += 1;
      }
    }

    /*
      두 톤 사진의 경계가 몇 px에 걸쳐 섞여 있는가 — 폭 대비 비율.
      흐림이 셀수록 넓어진다. 미리보기 스크린샷에서도 **같은 규칙**
      으로 재서(measureTwoToneBand) 두 화면을 맞대어 본다. 글자를
      피해 아래쪽 한 줄에서 잰다.
    */
    const scanY = Math.round(canvas.height * 0.8);
    let first = -1;
    let last = -1;

    for (let x = 0; x < canvas.width; x += 1) {
      const i = (scanY * canvas.width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 90) continue;
      if (r > 60 && r < 200 && b > 60 && b < 200) {
        if (first < 0) first = x;
        last = x;
      }
    }

    result.band = first < 0 ? 0 : (last - first + 1) / canvas.width;
  }

  return result;
};


/* =========================================================
   PNG 디코드 — 미리보기 스크린샷을 픽셀로 읽는다

   화면의 CSS filter는 캔버스로 옮겨 담을 수 없다(그리는 순간
   필터가 빠진다). 그래서 미리보기 쪽은 Playwright가 찍은 PNG를
   Node에서 직접 푼다. skin/skin-gallery-e2e-test.mjs의 것과 같은
   디코더(8bit 논인터레이스).
========================================================== */

function decodePng(buffer) {
  let pos = 8;
  let width = 0, height = 0, depth = 0, colourType = 0;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const kind = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (kind === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colourType = data[9];
      if (data[12] !== 0) throw new Error("인터레이스 PNG는 지원하지 않습니다");
    }
    if (kind === "IDAT") idat.push(data);
    pos += 12 + length;
    if (kind === "IEND") break;
  }
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!channels || depth !== 8) {
    throw new Error(`지원하지 않는 PNG(type ${colourType}, depth ${depth})`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    const filter = raw[at];
    const line = Buffer.from(raw.subarray(at + 1, at + 1 + stride));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + left) & 0xff;
      else if (filter === 2) line[i] = (line[i] + up) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
    }
    line.copy(pixels, y * stride);
    previous = line;
  }
  return { width, height, channels, stride, pixels };
}


/* CAPTURE_AND_MEASURE의 band와 같은 규칙 — 폭 대비 비율 */
function measureTwoToneBand(png) {
  const scanY = Math.round(png.height * 0.8);
  let first = -1;
  let last = -1;

  for (let x = 0; x < png.width; x += 1) {
    const at = scanY * png.stride + x * png.channels;
    const r = png.pixels[at], g = png.pixels[at + 1], b = png.pixels[at + 2];
    if (g > 90) continue;
    if (r > 60 && r < 200 && b > 60 && b < 200) {
      if (first < 0) first = x;
      last = x;
    }
  }

  return first < 0 ? 0 : (last - first + 1) / png.width;
}


async function runExportPixels(browser) {
  console.log("\n[export] 저장되는 PNG의 실제 픽셀");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  /* ---- (1) 배경 사진과 강조선이 실제로 저장된다 ---- */

  await renderEditorPreview(page, {
    html:
      '<span class="post-para-rule" data-rule="on"></span>' +
      "강조선이 걸린 문단입니다.",
    settings: {
      ...DECOR_SETTINGS,
      bodyRuleColor: "#00ff00",
      bodyRuleWidth: 10,
      backgroundImageUrl: LANDSCAPE,
      backgroundOverlayOpacity: 0,
      sourceEnabled: false
    },
    title: ""
  });
  await page.waitForTimeout(400);

  const withBackground = await page.evaluate(CAPTURE_AND_MEASURE, {
    colors: {
      rule: { rgb: [0, 255, 0], tolerance: 40 },
      sky: { rgb: [0x33, 0x66, 0x99], tolerance: 16 }
    }
  });

  check(
    "[export] 배경 사진이 저장 이미지에 들어간다(귀퉁이까지)",
    withBackground.counts.sky > withBackground.width * 10 &&
    Math.abs(withBackground.corner[0] - 0x33) <= 16 &&
    Math.abs(withBackground.corner[2] - 0x99) <= 16,
    JSON.stringify({
      corner: withBackground.corner,
      sky: withBackground.counts.sky,
      size: [withBackground.width, withBackground.height]
    })
  );

  check(
    "[export] 강조선이 저장 이미지에 들어간다",
    withBackground.counts.rule > 200 &&
    withBackground.boxes.rule.minX < withBackground.width * 0.35,
    JSON.stringify({
      count: withBackground.counts.rule,
      box: withBackground.boxes.rule
    })
  );

  /* ---- (2) 형광펜 높이가 저장 이미지에도 그대로 ---- */

  const highlightHTML =
    '<span class="post-inline-highlight" data-highlight="#0000ff" ' +
    'style="background-color:#0000ff">형광펜</span>';

  const measureHighlight = async (highlightHeight) => {
    await renderEditorPreview(page, {
      html: highlightHTML,
      settings: {
        ...DECOR_SETTINGS,
        highlightHeight,
        background: "#ffffff",
        sourceEnabled: false
      },
      title: ""
    });
    await page.waitForTimeout(350);

    return page.evaluate(CAPTURE_AND_MEASURE, {
      colors: { ink: { rgb: [0, 0, 255], tolerance: 40 } }
    });
  };

  const fullBand = await measureHighlight(100);
  const shortBand = await measureHighlight(40);

  const bandRatio =
    shortBand.boxes.ink && fullBand.boxes.ink
      ? shortBand.boxes.ink.height / fullBand.boxes.ink.height
      : 0;

  check(
    "[export] 형광펜 높이가 저장 이미지에도 그대로 적용된다",
    bandRatio > 0.3 && bandRatio < 0.62,
    "100% → " + (fullBand.boxes.ink ? fullBand.boxes.ink.height : "?") +
    "px / 40% → " + (shortBand.boxes.ink ? shortBand.boxes.ink.height : "?") +
    "px (비 " + bandRatio.toFixed(2) + ")"
  );

  check(
    "[export] 낮아진 형광펜은 글자 아래쪽에 깔린다(아랫변이 같다)",
    Boolean(fullBand.boxes.ink) && Boolean(shortBand.boxes.ink) &&
    Math.abs(fullBand.boxes.ink.maxY - shortBand.boxes.ink.maxY) <= 4,
    (fullBand.boxes.ink ? fullBand.boxes.ink.maxY : "?") + " / " +
    (shortBand.boxes.ink ? shortBand.boxes.ink.maxY : "?")
  );

  /* ---- (3) 흐림이 실제로 구워진다 ---- */

  /*
    한 번 그린 뒤 **두 곳**을 잰다.

      shot     실제 export가 만든 PNG (브라우저 안에서 디코드)
      preview  화면에 보이는 미리보기를 그대로 찍은 PNG
               (CSS filter가 살아 있는 상태 — Playwright 스크린샷)

    "export가 성공했는가"가 아니라 "저장본이 미리보기와 같은가"를
    판정하려면 두 그림이 다 필요하다.
  */

  const measureBlur = async (blur) => {
    await renderEditorPreview(page, {
      html: "가",
      settings: {
        ...DECOR_SETTINGS,
        backgroundImageUrl: TWO_TONE,
        backgroundImageBlur: blur,
        backgroundOverlayOpacity: 0,
        titleEnabled: false,
        sourceEnabled: false
      },
      title: ""
    });
    await page.waitForTimeout(450);

    const previewShot = await page
      .locator("#postEditorPreviewPages .post-editor-preview-page:not([hidden])")
      .screenshot({ type: "png" });

    const shot = await page.evaluate(CAPTURE_AND_MEASURE, {
      countMixed: true,
      colors: {
        red: { rgb: [255, 0, 0], tolerance: 30 },
        blue: { rgb: [0, 0, 255], tolerance: 30 },
        white: { rgb: [255, 255, 255], tolerance: 6 }
      }
    });

    return {
      ...shot,
      /* 저장본과 미리보기의 경계 번짐 폭(캔버스 폭 대비 비율) */
      exportBand: shot.band,
      previewBand: measureTwoToneBand(decodePng(previewShot))
    };
  };

  /* ctx.filter가 실제로 먹는 환경인가 — 어느 경로를 시험했는지 남긴다 */

  /*
    ★ 대입하기 전의 typeof로 본다. WebKit은 ctx.filter가 없는데도
    대입은 받아주고(그냥 JS 프로퍼티가 붙는다) 읽으면 넣은 값이
    그대로 나온다 — 넣고 읽는 방식은 지원한다고 잘못 판정한다.
  */
  const nativeCanvasFilter = await page.evaluate(() =>
    typeof document.createElement("canvas").getContext("2d").filter === "string"
  );

  console.log(
    `  INFO  흐림 경로 — ctx.filter ${nativeCanvasFilter ? "있음(네이티브)" : "없음(픽셀 폴백)"}`
  );

  const sharp = await measureBlur(0);
  const blurry = await measureBlur(24);

  /*
    ★ 이 검사는 **모든 브라우저에서** 돈다 — WebKit도 예외가
    아니다.

    예전에는 WebKit에서 건너뛰었다. 흐림을 PNG에 굽는 길이 캔버스
    2D의 ctx.filter 하나뿐이었고(html2canvas가 CSS filter를 그리지
    않으므로), WebKit에는 그게 없어서(값을 넣어도 읽으면 undefined)
    제품 코드가 일부러 굽지 않았기 때문이다. 그런데 "export는
    성공하지만 저장본만 또렷한" 결과는 화면과 저장 결과가 다른
    것이므로 기능이 완성되지 않은 상태다.

    지금은 ctx.filter가 없으면 픽셀을 직접 흐리는 폴백으로 간다
    (posts/style/posts-canvas-background.js §5). 그래서 여기서도
    두 가지를 잰다.

      1. 흐림 전후의 **픽셀 차이** — 경계에서 섞인 색이 실제로
         생겼는가(단순히 export가 성공했는가가 아니다).
      2. **미리보기 대비** — 화면(CSS filter)에서 잰 번짐 폭과
         저장본에서 잰 번짐 폭이 같은가.
  */

  check(
    "[export] 흐림이 저장 이미지에도 실제로 적용된다(html2canvas는 CSS filter를 못 읽는다)",
    blurry.mixed > sharp.mixed * 5 && blurry.mixed > 2000,
    JSON.stringify({sharp:{mixed:sharp.mixed,counts:sharp.counts},blurry:{mixed:blurry.mixed,counts:blurry.counts}})
  );

  check(
    "[export] 흐림을 걸어도 배경 자체는 그대로 그려진다",
    sharp.counts.red > 1000 && sharp.counts.blue > 1000 &&
    blurry.counts.red > 1000 && blurry.counts.blue > 1000,
    JSON.stringify({ sharp: sharp.counts, blurry: blurry.counts })
  );

  /*
    미리보기 자체가 흐려져 있어야 비교가 성립한다 — 화면이 안
    흐린데 저장본만 흐리면 위 검사가 통과해도 뜻이 없다.
  */

  check(
    "[export] 미리보기 화면이 실제로 흐려져 있다(비교의 전제)",
    blurry.previewBand > sharp.previewBand * 3 &&
    blurry.previewBand > 0.03,
    `또렷 ${sharp.previewBand.toFixed(4)} / 흐림 ${blurry.previewBand.toFixed(4)}`
  );

  const bandGap =
    blurry.previewBand > 0
      ? Math.abs(blurry.exportBand - blurry.previewBand) / blurry.previewBand
      : 1;

  check(
    "[export] 저장 PNG의 번짐 폭이 미리보기와 같다(ctx.filter 없는 환경 포함)",
    blurry.exportBand > 0 && bandGap <= 0.25,
    `미리보기 ${blurry.previewBand.toFixed(4)} / 저장본 ${blurry.exportBand.toFixed(4)} ` +
    `(차이 ${(bandGap * 100).toFixed(1)}%, ctx.filter ${nativeCanvasFilter ? "있음" : "없음"})`
  );

  /*
    ★ 폴백 자체를 직접 재는 검사 — 어느 브라우저에서나 돈다.

    위 왕복 검사는 그 환경이 실제로 고른 경로만 지나간다. 여기서는
    blurCanvasPixelsInPlace()를 직접 불러서, 브라우저가 ctx.filter를
    갖고 있든 말든 **폴백 코드 자체**가 σ만큼 흐리는지 본다.

    판정 기준: 계단 경계를 σ의 가우시안으로 흐리면 "섞인 색" 띠의
    폭이 약 1.51σ가 된다(띠의 정의 r·b ∈ (60,200) → 표준정규의
    -0.787 ~ +0.723 구간). 200×100은 픽셀 예산 안이라 축소 없이
    도는 경로다.
  */

  const fallbackProbe = await page.evaluate(async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">' +
      '<rect width="100" height="100" fill="#ff0000"/>' +
      '<rect x="100" width="100" height="100" fill="#0000ff"/></svg>';

    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(svg);
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 200, 100);

    const sigma = 10;
    const applied = blurCanvasPixelsInPlace(canvas, ctx, sigma);

    const d = ctx.getImageData(0, 0, 200, 100).data;

    let mixed = 0;
    let first = -1;
    let last = -1;

    for (let x = 0; x < 200; x += 1) {
      const i = (50 * 200 + x) * 4;
      if (d[i] > 60 && d[i] < 200 && d[i + 2] > 60 && d[i + 2] < 200) {
        if (first < 0) first = x;
        last = x;
      }
    }

    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 60 && d[i] < 200 && d[i + 2] > 60 && d[i + 2] < 200) mixed += 1;
    }

    /* 가장자리는 CSS blur처럼 투명하게 잦아들어야 한다 */
    const edgeAlpha = d[(50 * 200 + 0) * 4 + 3];
    const middleAlpha = d[(50 * 200 + 100) * 4 + 3];

    return {
      applied,
      mixed,
      band: first < 0 ? 0 : last - first + 1,
      sigma,
      edgeAlpha,
      middleAlpha
    };
  });

  check(
    "[export] 픽셀 폴백이 σ만큼 흐린다(축소 없는 경로 · ctx.filter와 무관하게 직접 호출)",
    fallbackProbe.applied === true &&
    fallbackProbe.mixed > 1000 &&
    Math.abs(fallbackProbe.band - 1.51 * fallbackProbe.sigma) <= 4,
    JSON.stringify(fallbackProbe) + ` (기대 띠폭 ${(1.51 * fallbackProbe.sigma).toFixed(1)}px)`
  );

  check(
    "[export] 픽셀 폴백의 가장자리가 CSS blur처럼 투명하게 잦아든다(테두리 색 번짐 없음)",
    fallbackProbe.edgeAlpha < 200 && fallbackProbe.middleAlpha > 250,
    `가장자리 alpha ${fallbackProbe.edgeAlpha} / 가운데 alpha ${fallbackProbe.middleAlpha}`
  );

  /* ---- (4) 줄인 배경 — 저장된 PNG의 자리·크기가 프리뷰와 같다 ----

     요구사항 9의 마지막 항목. 사진을 캔버스보다 작게 줄였을 때
     드러난 바탕이 지정한 배경색으로 나오고, 사진이 그려진 자리와
     크기가 화면과 어긋나지 않는지 실제 픽셀로 확인한다. */

  await renderEditorPreview(page, {
    html: "짧은 본문.",
    settings: {
      ...DECOR_SETTINGS,
      ratio: "custom",
      ratioWidth: 1,
      ratioHeight: 1,
      background: "#ffff00",
      backgroundImageUrl: svgImage(600, 600, "#0000ff"),
      backgroundImageScale: 0.5,
      backgroundImageBlur: 0,
      backgroundOverlayOpacity: 0,
      bodyColor: "#ffff00",
      sourceEnabled: false,
      titleEnabled: false
    },
    title: "",
    mode: "custom"
  });
  await page.waitForTimeout(450);

  const onScreen = await page.evaluate(() => {
    const pageEl = VISIBLE_PAGE_FN();
    const img = pageEl.querySelector(".post-page-background-image");
    return {
      pageW: pageEl.offsetWidth,
      pageH: pageEl.offsetHeight,
      w: parseFloat(img.style.width),
      h: parseFloat(img.style.height),
      left: parseFloat(img.style.left),
      top: parseFloat(img.style.top)
    };
  });

  const shot = await page.evaluate(CAPTURE_AND_MEASURE, {
    colors: {
      photo: { rgb: [0, 0, 255], tolerance: 20 },
      paper: { rgb: [255, 255, 0], tolerance: 20 }
    }
  });

  /* 저장 배율 — 레이아웃 폭(520) 대비 실제 PNG 폭 */
  const pixelScale = shot.width / onScreen.pageW;

  const expected = {
    left: Math.round(onScreen.left * pixelScale),
    top: Math.round(onScreen.top * pixelScale),
    w: Math.round(onScreen.w * pixelScale),
    h: Math.round(onScreen.h * pixelScale)
  };

  const box = shot.boxes.photo;

  const tolerance = Math.max(3, Math.round(pixelScale * 2));

  check(
    "[export] 줄인 배경이 저장 PNG에서도 화면과 같은 자리·크기로 그려진다",
    Boolean(box) &&
    Math.abs(box.minX - expected.left) <= tolerance &&
    Math.abs(box.minY - expected.top) <= tolerance &&
    Math.abs((box.maxX - box.minX + 1) - expected.w) <= tolerance &&
    Math.abs((box.maxY - box.minY + 1) - expected.h) <= tolerance,
    JSON.stringify({ expected, box, pixelScale: Math.round(pixelScale * 100) / 100 })
  );

  check(
    "[export] 사진 밖으로 드러난 바탕이 지정한 배경색으로 저장된다",
    shot.counts.paper > shot.counts.photo * 0.5 &&
    /* 캔버스 모서리는 사진이 닿지 않는 자리 = 배경색 */
    Math.abs(shot.corner[0] - 255) <= 20 &&
    Math.abs(shot.corner[1] - 255) <= 20 &&
    Math.abs(shot.corner[2] - 0) <= 20,
    JSON.stringify({ counts: shot.counts, corner: shot.corner })
  );

  check("[export] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}




/* =========================================================
   8. mobile — 터치로 구도 조정 vs 평소 제스처

   조정 모드가 아닐 때는 모바일의 스크롤·핀치·본문 선택을 전혀
   건드리지 않아야 한다(요구사항 8·10).
========================================================== */

async function runMobileBackground(browser) {
  console.log("\n[mobile] 터치 위치 조정과 일반 제스처");

  const { ctx, page, errors } =
    await openPostEditor(browser, { viewport: "mobile" });
  await installProbes(page);

  await renderEditorPreview(page, {
    html: "창가 자리에 앉은 그는 커피를 앞에 두고 있었다.",
    settings: { ...DECOR_SETTINGS, backgroundImageUrl: LANDSCAPE },
    title: ""
  });
  await page.waitForTimeout(350);

  /*
    ★ touch-action으로는 판정하지 않는다.

    .post-editor-preview-stage는 모바일에서 **원래부터**
    touch-action:none이다(핀치 줌을 직접 처리하기 때문). 그래서
    "평소에 방해하지 않는가"는 실제로 배경이 움직였는지와, 기존
    핀치/이동 상태가 그대로인지로 본다.
  */

  const TOUCH_DRAG = () => {
    const target = VISIBLE_PAGE_FN();

    target.scrollIntoView({ block: "center" });

    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const send = (type, clientX, clientY) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        buttons: type === "pointerup" ? 0 : 1,
        clientX,
        clientY
      }));
    };

    send("pointerdown", x, y);
    send("pointermove", x - 30, y);
    send("pointermove", x - 60, y);
    send("pointerup", x - 60, y);
  };

  const beforeIdleDrag = await page.evaluate(() => ({
    focus: previewBackgroundFocusX,
    zoom: mobilePreviewZoom,
    panX: mobilePreviewPanX
  }));

  await page.evaluate((source) => {
    window.TOUCH_DRAG_FN = new Function("return (" + source + ")")();
  }, TOUCH_DRAG.toString());

  await page.evaluate(TOUCH_DRAG);
  await page.waitForTimeout(250);

  const idle = await page.evaluate(() => ({
    moveClass: document.getElementById("postEditorPreviewStage")
      .classList.contains("is-background-move"),
    focus: previewBackgroundFocusX,
    zoom: mobilePreviewZoom,
    panX: mobilePreviewPanX
  }));

  check(
    "[mobile] 평소에는 터치가 배경을 움직이지 않고 기존 제스처도 그대로다",
    idle.moveClass === false &&
    idle.focus === beforeIdleDrag.focus &&
    idle.zoom === beforeIdleDrag.zoom,
    JSON.stringify(idle)
  );

  /* 조정 모드로 들어가 터치로 끌어본다 */

  await page.click("#postEditorPreviewBackgroundMove");
  await page.waitForTimeout(200);

  check(
    "[mobile] 조정 모드가 켜진 것이 화면에 드러난다",
    await page.evaluate(() =>
      document.getElementById("postEditorPreviewStage")
        .classList.contains("is-background-move") === true &&
      previewBackgroundMoveMode === true)
  );

  await page.evaluate(TOUCH_DRAG);
  await page.waitForTimeout(250);

  const movedByTouch = await page.evaluate(() => previewBackgroundFocusX);

  check(
    "[mobile] 조정 모드에서 터치 드래그가 배경을 움직인다",
    typeof movedByTouch === "number" && movedByTouch > 0.5,
    String(movedByTouch)
  );

  await page.click("#postEditorPreviewBackgroundMove");
  await page.waitForTimeout(200);

  const afterOff = await page.evaluate(() => {
    const focus = previewBackgroundFocusX;
    TOUCH_DRAG_FN();
    return { before: focus, mode: previewBackgroundMoveMode };
  });

  await page.waitForTimeout(250);

  check(
    "[mobile] 조정 모드를 끄면 터치가 다시 배경을 건드리지 않는다",
    afterOff.mode === false &&
    await page.evaluate((before) =>
      previewBackgroundFocusX === before, afterOff.before),
    JSON.stringify(afterOff)
  );

  /*
    ★ 합성 PointerEvent가 남기는 잡음 하나는 걸러낸다.

    모바일 프리뷰의 기존 핀치/이동 코드(posts-preview-mobile.js)가
    setPointerCapture를 부르는데, 여기서 만든 포인터는 브라우저가
    실제로 추적하는 포인터가 아니라서 "그런 포인터 없음"으로 던진다.
    실기기의 진짜 터치에서는 생기지 않는 오류이고, 이번 라운드의
    코드가 낸 것도 아니다(우리 쪽 호출은 try/catch로 감싸 두었다).
  */

  const realErrors =
    errors.filter(
      message =>
        !/setPointerCapture/.test(message) &&
        /*
          WebKit이 같은 상황에서 내는 문구 — 여기서 만든 포인터는
          브라우저가 실제로 추적하는 포인터가 아니라서 캡처 대상을
          찾지 못한다. 실기기의 진짜 터치에서는 생기지 않는다.
        */
        !/object can not be found here/i.test(message)
    );

  check("[mobile] 오류 없음", realErrors.length === 0, realErrors.join(" | "));
  await ctx.close();
}




/* =========================================================
   9. fixed — 배경 크기 정책 (요구사항 2)

   확대 50~150% · 사진이 캔버스보다 작아도 됨 · 드러난 자리는
   배경색 · 흐림이 크기를 바꾸지 않음 · 이미지 크기 고정.
========================================================== */

/*
  가로 900 × 세로 600 사진. 캔버스(520px 폭)에서 cover 배율이
  분명하고, 세로가 늘어나면 cover가 커진다는 것을 재기 좋다.
*/
const FIXED_IMAGE = svgImage(900, 600, "#4477aa");

async function runFixedSize(browser) {
  console.log("\n[fixed] 확대 범위 · 축소 허용 · 이미지 크기 고정");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  /*
    같은 캔버스 너비(520)에서 높이만 다른 두 상태를 만든다.
    custom 비율을 바꿔서 페이지 높이를 바꾼다 — 본문 길이와
    무관하게 높이만 달라지는 가장 깨끗한 방법이다.
  */
  const GEOMETRY = () => {
    const pageEl = VISIBLE_PAGE_FN();
    const img = pageEl.querySelector(".post-page-background-image");
    const overlay = pageEl.querySelector(".post-page-background-overlay");
    if (!img) return null;
    return {
      pageW: pageEl.offsetWidth,
      pageH: pageEl.offsetHeight,
      w: parseFloat(img.style.width),
      h: parseFloat(img.style.height),
      left: parseFloat(img.style.left),
      top: parseFloat(img.style.top),
      overlayW: overlay ? parseFloat(overlay.style.width || "0") : 0,
      overlayH: overlay ? parseFloat(overlay.style.height || "0") : 0,
      overlayLeft: overlay ? parseFloat(overlay.style.left || "0") : 0,
      pageBg: getComputedStyle(pageEl).backgroundColor
    };
  };

  const render = async (extra) => {
    await renderEditorPreview(page, {
      html: "창가 자리에 앉은 그는 커피를 앞에 두고 있었다.",
      settings: {
        ...DECOR_SETTINGS,
        /* ratioWidth/ratioHeight가 실제로 쓰이려면 ratio가
           모드 문자열이어야 한다(getPresetPreviewRatioParts) */
        ratio: "custom",
        background: "#ffdd88",
        backgroundImageUrl: FIXED_IMAGE,
        backgroundImageScale: 1,
        backgroundImageFocusX: 0.5,
        backgroundImageFocusY: 0.5,
        backgroundImageBlur: 0,
        backgroundOverlayColor: "#000000",
        backgroundOverlayOpacity: 0.3,
        ...extra
      },
      title: "",
      mode: "custom"
    });
    await page.waitForTimeout(250);
    return page.evaluate(GEOMETRY);
  };

  /* ---- (1) 확대 범위 1~200% ---- */

  const range = await page.evaluate(() => ({
    min: POST_BACKGROUND_UI_MIN_SCALE,
    max: POST_BACKGROUND_UI_MAX_SCALE,
    /* 저장/렌더가 받아들이는 범위는 더 넓다(옛 값 보존) */
    clampVeryLow: clampPostBackgroundScale(0.005),
    clampLow: clampPostBackgroundScale(0.2),
    clampMid: clampPostBackgroundScale(0.5),
    clampLegacy: clampPostBackgroundScale(3),
    clampHigh: clampPostBackgroundScale(9)
  }));

  /*
    ★ 슬라이더를 1~200%로 넓혔다.

    저장/렌더가 받아들이는 범위는 슬라이더보다 넓어야 한다 —
    좁히면 예전 슬라이더(100~300%)로 저장해둔 프리셋이 **열기만
    해도** 깎인다. 아래끝도 같은 이유로 0.5에서 0.01로 내렸다:
    슬라이더가 1%까지 내려가는데 저장이 0.5에서 자르면 사용자가
    고른 값이 저장에서 사라진다.
  */

  check(
    "[fixed] 슬라이더 구간은 1~200%다",
    range.min === 1 && range.max === 200,
    JSON.stringify(range)
  );

  check(
    "[fixed] 저장값은 슬라이더보다 넓은 0.01~3에서 잘린다(슬라이더가 고른 값이 저장에서 깎이지 않는다)",
    range.clampVeryLow === 0.01 &&
    range.clampLow === 0.2 &&
    range.clampMid === 0.5 &&
    range.clampLegacy === 3 &&
    range.clampHigh === 3,
    JSON.stringify(range)
  );

  /* ---- (2) 100% = cover, 50% = 그 절반 ---- */

  const cover = await render({});

  check(
    "[fixed] 100%는 예전처럼 캔버스를 빈틈없이 덮는다",
    cover.w >= cover.pageW - 0.5 &&
    cover.h >= cover.pageH - 0.5 &&
    cover.left <= 0.5 && cover.top <= 0.5,
    JSON.stringify(cover)
  );

  const half = await render({ backgroundImageScale: 0.5 });

  check(
    "[fixed] 50%로 줄이면 사진이 캔버스보다 작아지고 비율은 유지된다",
    Math.abs(half.w - cover.w / 2) < 1 &&
    Math.abs(half.h - cover.h / 2) < 1 &&
    /* 원본 비율 900:600 = 1.5 */
    Math.abs(half.w / half.h - 1.5) < 0.01 &&
    half.w < half.pageW,
    JSON.stringify(half)
  );

  check(
    "[fixed] 줄여서 드러난 자리는 캔버스 배경색이 그대로 보인다",
    half.pageBg === "rgb(255, 221, 136)" &&
    /* 사진은 가운데 — 좌우가 같은 만큼 남는다 */
    Math.abs(half.left - (half.pageW - half.w) / 2) < 1,
    JSON.stringify({ bg: half.pageBg, left: half.left, w: half.w, pageW: half.pageW })
  );

  check(
    "[fixed] 덮개는 사진 위에만 깔리고 드러난 바탕을 덮지 않는다",
    Math.abs(half.overlayW - half.w) < 1 &&
    Math.abs(half.overlayH - half.h) < 1 &&
    Math.abs(half.overlayLeft - half.left) < 1,
    JSON.stringify({
      overlayW: half.overlayW, w: half.w,
      overlayLeft: half.overlayLeft, left: half.left
    })
  );

  const big = await render({ backgroundImageScale: 1.5 });

  check(
    "[fixed] 150%까지 키울 수 있다",
    Math.abs(big.w - cover.w * 1.5) < 1,
    JSON.stringify({ w: big.w, cover: cover.w })
  );

  /* ---- (3) 흐림이 사용자가 정한 크기를 키우지 않는다 ---- */

  const halfBlur = await render({
    backgroundImageScale: 0.5,
    backgroundImageBlur: 12
  });

  check(
    "[fixed] 줄여 놓은 사진은 흐림을 걸어도 커지지 않는다",
    Math.abs(halfBlur.w - half.w) < 0.5 &&
    Math.abs(halfBlur.h - half.h) < 0.5,
    JSON.stringify({ blur: halfBlur.w, plain: half.w })
  );

  const coverBlur = await render({ backgroundImageBlur: 12 });

  check(
    "[fixed] 덮고 있을 때는 예전처럼 여유만큼 더 덮어 테두리를 막는다",
    coverBlur.w > cover.w &&
    coverBlur.left < 0 && coverBlur.top < 0,
    JSON.stringify({ w: coverBlur.w, cover: cover.w, left: coverBlur.left })
  );

  /* ---- (4) 줄인 사진도 끌어서 옮길 수 있다 ---- */

  const dragged = await page.evaluate(() => {
    /* 유효 범위를 넘겨 요청해도 사진이 캔버스 밖으로 나가지 않는다 */
    const pageEl = VISIBLE_PAGE_FN();
    const box = pageEl.offsetWidth;
    const drawn = parseFloat(
      pageEl.querySelector(".post-page-background-image").style.width
    );
    const geo = computePostBackgroundGeometry({
      boxWidth: box,
      boxHeight: pageEl.offsetHeight,
      naturalWidth: 900,
      naturalHeight: 600,
      scale: 0.5,
      focusX: 0.05,
      focusY: 0.5
    });
    return { box, drawn, left: geo.left, width: geo.width, focusX: geo.focusX };
  });

  check(
    "[fixed] 줄인 사진도 끌 수 있고, 캔버스 밖으로는 나가지 않는다",
    dragged.focusX !== 0.5 &&
    dragged.left >= -0.5 &&
    dragged.left + dragged.width <= dragged.box + 0.5,
    JSON.stringify(dragged)
  );

  /* ---- (5) 이미지 크기 고정 — 높이가 달라져도 크기가 같다 ---- */

  const FIXED = {
    backgroundImageFixedSize: true,
    backgroundImageWidthRatio: 0.7
  };

  const shortPage = await render({
    ...FIXED,
    ratioWidth: 4,
    ratioHeight: 3
  });

  const tallPage = await render({
    ...FIXED,
    ratioWidth: 4,
    ratioHeight: 9
  });

  check(
    "[fixed] 고정하면 같은 너비에서 페이지 높이가 달라도 사진 크기가 같다",
    shortPage.pageW === tallPage.pageW &&
    tallPage.pageH > shortPage.pageH * 2 &&
    Math.abs(shortPage.w - tallPage.w) < 0.5 &&
    Math.abs(shortPage.h - tallPage.h) < 0.5,
    JSON.stringify({
      shortH: shortPage.pageH, tallH: tallPage.pageH,
      shortImg: shortPage.w, tallImg: tallPage.w
    })
  );

  check(
    "[fixed] 고정 크기는 캔버스 너비에 대한 비율 그대로다",
    Math.abs(shortPage.w - shortPage.pageW * 0.7) < 0.5,
    JSON.stringify({ w: shortPage.w, pageW: shortPage.pageW })
  );

  check(
    "[fixed] 고정 기본 위치는 가운데다",
    Math.abs(shortPage.left - (shortPage.pageW - shortPage.w) / 2) < 1 &&
    Math.abs(shortPage.top - (shortPage.pageH - shortPage.h) / 2) < 1,
    JSON.stringify(shortPage)
  );

  /* 끄면 예전처럼 페이지 높이를 따라 커진다 */

  const loose = await render({ ratioWidth: 4, ratioHeight: 9 });

  check(
    "[fixed] 끄면 예전처럼 페이지 크기에 맞춰 커진다",
    loose.w > tallPage.w &&
    loose.h >= loose.pageH - 0.5,
    JSON.stringify({ loose: loose.w, fixed: tallPage.w })
  );

  /* ---- (6) 첫 페이지 글 길이를 바꿔도 고정 크기가 그대로 ---- */

  const withShortBody = await page.evaluate(async (input) => {
    postStyleSettings = input.settings;
    document.getElementById("postEditorContent").innerHTML = "짧은 첫 줄.";
    previewRatioMode = "auto";
    await updateEditorPreview();
    const el = document.querySelector(
      "#postEditorPreviewPages .post-editor-preview-page:not([hidden]) " +
      ".post-page-background-image"
    );
    return { w: parseFloat(el.style.width) };
  }, {
    settings: {
      ...DECOR_SETTINGS,
      backgroundImageUrl: FIXED_IMAGE,
      backgroundImageScale: 1,
      ...FIXED
    }
  });

  await page.waitForTimeout(250);

  const withLongBody = await page.evaluate(async () => {
    document.getElementById("postEditorContent").innerHTML =
      new Array(14).fill(
        "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 창밖을 바라보고 있었다."
      ).join("<br><br>");
    await updateEditorPreview();
    const el = document.querySelector(
      "#postEditorPreviewPages .post-editor-preview-page:not([hidden]) " +
      ".post-page-background-image"
    );
    const pageEl = document.querySelector(
      "#postEditorPreviewPages .post-editor-preview-page:not([hidden])"
    );
    return { w: parseFloat(el.style.width), pageH: pageEl.offsetHeight };
  });

  await page.waitForTimeout(250);

  check(
    "[fixed] 첫 페이지 글이 길어져도 고정 이미지 크기는 그대로다",
    Math.abs(withShortBody.w - withLongBody.w) < 0.5,
    JSON.stringify({ short: withShortBody.w, long: withLongBody.w })
  );

  check("[fixed] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();

  await runFixedSizeAdmin(browser);
}


/*
  관리 패널 쪽 — 체크박스를 켜는 순간 지금 그려진 크기를 그대로
  기준으로 잡는가, 옛 확대 값이 슬라이더 때문에 깎이지 않는가.
*/
async function runFixedSizeAdmin(browser) {
  console.log("\n[fixed/admin] 크기 고정 켜기 · 옛 확대 값 호환");

  const { ctx, page, errors } = await openQuotePanel(browser);

  const drawnWidth = () => page.evaluate(() => {
    const el = document.querySelector(
      "#quotePreviewCanvas .post-editor-preview-page:not([hidden]) " +
      ".post-page-background-image"
    ) || document.querySelector(
      "#quotePreviewCanvas .post-page-background-image"
    );
    return el ? parseFloat(el.style.width) : null;
  });

  await page.evaluate((image) => {
    applyQuoteSettings({
      ...POST_STYLE_DEFAULTS,
      exportWidth: 1200,
      backgroundImageUrl: image,
      backgroundImageScale: 1.2,
      backgroundOverlayOpacity: 0.3
    });
  }, FIXED_IMAGE);
  await page.waitForTimeout(500);

  const before = await drawnWidth();

  await page.click("#quoteBackgroundFixedSize");
  await page.waitForTimeout(500);

  const after = await drawnWidth();

  check(
    "[fixed/admin] 고정을 켜는 순간 지금 크기가 유지된다",
    before !== null && after !== null &&
    Math.abs(before - after) < 1,
    JSON.stringify({ before, after })
  );

  const collected = await page.evaluate(() => {
    const s = collectQuoteSettings();
    return {
      fixed: s.backgroundImageFixedSize,
      ratio: s.backgroundImageWidthRatio,
      scale: s.backgroundImageScale
    };
  });

  check(
    "[fixed/admin] 켠 상태가 비율과 함께 저장된다",
    collected.fixed === true &&
    collected.ratio > 0 &&
    Math.abs(collected.scale - 1.2) < 0.001,
    JSON.stringify(collected)
  );

  /* ---- 옛 확대 값(150% 초과)이 열기만으로 깎이지 않는다 ---- */

  const legacyScale = await page.evaluate((image) => {
    applyQuoteSettings({
      ...POST_STYLE_DEFAULTS,
      backgroundImageUrl: image,
      backgroundImageScale: 2.4
    });

    const input = document.getElementById("quoteBackgroundScale");

    return {
      sliderMax: Number(input.max),
      sliderValue: Number(input.value),
      collected: collectQuoteSettings().backgroundImageScale
    };
  }, FIXED_IMAGE);
  await page.waitForTimeout(300);

  check(
    "[fixed/admin] 150%를 넘는 옛 확대 값이 열기만으로 깎이지 않는다",
    legacyScale.sliderValue === 240 &&
    legacyScale.sliderMax >= 240 &&
    Math.abs(legacyScale.collected - 2.4) < 0.001,
    JSON.stringify(legacyScale)
  );

  const normalScale = await page.evaluate((image) => {
    applyQuoteSettings({
      ...POST_STYLE_DEFAULTS,
      backgroundImageUrl: image,
      backgroundImageScale: 1
    });
    const input = document.getElementById("quoteBackgroundScale");
    return { min: Number(input.min), max: Number(input.max) };
  }, FIXED_IMAGE);

  check(
    "[fixed/admin] 보통 프리셋에서는 슬라이더가 1~200으로 돌아온다",
    normalScale.min === 1 && normalScale.max === 200,
    JSON.stringify(normalScale)
  );

  check("[fixed/admin] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   10. gap — 강조선과 글자 사이 거리 (요구사항 3)
========================================================== */

async function runRuleGap(browser) {
  console.log("\n[gap] 강조선 거리 — BODY · DIALOGUE · SOURCE");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  const measure = async (settings) => {
    await renderEditorPreview(page, {
      html:
        '<span class="post-para-rule" data-rule="on"></span>강조선 문단<br><br>' +
        '"대사 문단입니다."',
      settings,
      title: ""
    });
    await page.waitForTimeout(200);
    return page.evaluate(() => {
      const pageEl = VISIBLE_PAGE_FN();
      const boxes = Array.from(
        pageEl.querySelectorAll(".post-para-rule-box")
      ).map(b => ({
        pad: b.style.paddingLeft,
        width: b.style.borderLeftWidth,
        text: b.textContent.trim().slice(0, 6)
      }));
      const source = pageEl.querySelector(
        ".post-editor-preview-source .post-source-rule-box"
      );
      return {
        boxes,
        sourcePad: source?.style.paddingLeft,
        sourceWidth: source?.style.borderLeftWidth
      };
    });
  };

  const withGaps = await measure({
    ...DECOR_SETTINGS,
    bodyRuleGap: 30,
    dialogueRuleEnabled: true,
    dialogueRuleGap: 4,
    sourceRuleEnabled: true,
    sourceRuleGap: 24
  });

  /*
    ★ 거리는 두 벌이다 — BODY와 SOURCE (요구사항 3).

    예전에는 DIALOGUE도 자기 거리를 가졌다. 지금은 대사에 자동으로
    붙는 선도 BODY의 거리를 그대로 쓴다 — 위 measure()에 넘긴
    dialogueRuleGap: 4는 **무시돼야 한다**. SOURCE는 독립 유지.
  */

  check(
    "[gap] BODY와 SOURCE가 각자의 거리를 쓴다",
    withGaps.boxes.length === 2 &&
    withGaps.boxes.every(b => b.pad === "30px") &&
    withGaps.sourcePad === "24px",
    JSON.stringify(withGaps)
  );

  check(
    "[gap] 대사 자동 강조선은 BODY 거리를 따른다(옛 dialogueRuleGap이 이기지 않는다)",
    withGaps.boxes.every(b => b.pad !== "4px"),
    JSON.stringify(withGaps)
  );

  /* 값이 없으면 예전 상수(12px) */

  const noGaps = await measure({
    ...DECOR_SETTINGS,
    dialogueRuleEnabled: true,
    sourceRuleEnabled: true
  });

  check(
    "[gap] 값이 없는 옛 프리셋은 예전 그대로 12px이다",
    noGaps.boxes.every(b => b.pad === "12px") &&
    noGaps.sourcePad === "12px",
    JSON.stringify(noGaps)
  );

  /* 0도 유효한 값이고, 범위를 벗어나면 잘린다 */

  const zero = await measure({
    ...DECOR_SETTINGS,
    bodyRuleGap: 0,
    sourceRuleEnabled: true,
    sourceRuleGap: 999
  });

  check(
    "[gap] 0은 그대로 0이고, 범위 밖 값은 잘린다",
    zero.boxes[0].pad === "0px" &&
    zero.sourcePad === "80px",
    JSON.stringify(zero)
  );

  /* 발행 본문(공개 뷰어)도 같은 값을 쓴다 */

  const published = await page.evaluate((input) => {
    /* posts-view-detail.js가 글을 그릴 때 쓰는 바로 그 함수 */
    const host = document.createElement("div");
    renderStyledPostContentInto(host, input.html, input.settings);
    const box = host.querySelector(".post-para-rule-box");
    return box ? box.style.paddingLeft : null;
  }, {
    html:
      '<span class="post-para-rule" data-rule="on"></span>강조선 문단',
    settings: { ...DECOR_SETTINGS, bodyRuleGap: 30 }
  });

  check(
    "[gap] 발행 본문(공개 뷰어)에도 같은 거리가 들어간다",
    published === "30px",
    String(published)
  );

  check("[gap] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();

  await runNumberInputs(browser);
}


/*
  네모 숫자 칸 — 직접 입력 · 범위 처리 · 저장 → 다시 열기.

  슬라이더에서 숫자 칸으로 바꾼 값들이 대상이다(요구사항 1·3):
  형광펜 높이 · 강조선 굵기/거리 세 벌 · 덮개 농도.
*/
async function runNumberInputs(browser) {
  console.log("\n[numbers] 숫자 칸 직접 입력 · 범위 · 저장 왕복");

  const { ctx, page, errors } = await openQuotePanel(browser);

  const NUMBER_FIELDS = [
    ["quoteHighlightHeight", "highlightHeight"],
    ["quoteBodyRuleWidth", "bodyRuleWidth"],
    ["quoteBodyRuleGap", "bodyRuleGap"],
    /*
      ★ quoteDialogueRuleWidth / quoteDialogueRuleGap은 없앴다
      (요구사항 3) — DIALOGUE에서 고르는 것은 "강조선 자동 적용"
      체크 하나뿐이고, 생김새는 BODY를 따른다. 아래 [numbers/gone]
      에서 그 둘이 실제로 사라졌는지 확인한다.
    */
    ["quoteSourceRuleWidth", "sourceRuleWidth"],
    ["quoteSourceRuleGap", "sourceRuleGap"],
    ["quoteBackgroundOverlayOpacity", null]
  ];

  const shape = await page.evaluate((fields) =>
    fields.map(([id]) => {
      const el = document.getElementById(id);
      return {
        id,
        exists: Boolean(el),
        type: el?.type,
        inputmode: el?.getAttribute("inputmode"),
        min: el?.min,
        max: el?.max
      };
    }), NUMBER_FIELDS);

  check(
    "[numbers] 대상 설정이 모두 네모 숫자 칸(type=number)이다",
    shape.every(f => f.exists && f.type === "number" && f.inputmode === "numeric"),
    JSON.stringify(shape)
  );


  /*
    ★ DIALOGUE의 색·굵기·거리 칸은 없앴다 (요구사항 3).

    렌더는 BODY 값을 쓴다. 그런데 옛 프리셋에는 그 세 값이 이미
    저장돼 있으므로, 입력칸이 사라졌다고 해서 저장 때 기본값으로
    덮어써 버리면 **열고 저장하기만 해도 사용자의 값이 사라진다**.
    값은 상태 변수가 들고 있다가 그대로 되돌려보낸다
    (admin/quote/admin-quote-refs.js의 quoteLegacyDialogueRule).
  */

  const dialogueFields = await page.evaluate(() => ({
    color: Boolean(document.getElementById("quoteDialogueRuleColor")),
    width: Boolean(document.getElementById("quoteDialogueRuleWidth")),
    gap: Boolean(document.getElementById("quoteDialogueRuleGap")),
    enabled: Boolean(document.getElementById("quoteDialogueRuleEnabled"))
  }));

  check(
    "[numbers/gone] DIALOGUE에는 자동 적용 체크만 남고 색·굵기·거리 칸은 없다",
    dialogueFields.enabled === true &&
    dialogueFields.color === false &&
    dialogueFields.width === false &&
    dialogueFields.gap === false,
    JSON.stringify(dialogueFields)
  );

  const legacyDialogue = await page.evaluate(() => {
    /* 세 값을 가진 옛 프리셋을 연다 */
    applyQuoteSettings({
      dialogueRuleEnabled: true,
      dialogueRuleColor: "#66aa88",
      dialogueRuleWidth: 5,
      dialogueRuleGap: 7
    });
    const kept = collectQuoteSettings();

    /* 그 값이 한 번도 없던 프리셋은 계속 없는 채로 둔다 */
    applyQuoteSettings({ dialogueRuleEnabled: true });
    const fresh = collectQuoteSettings();

    return {
      keptColor: kept.dialogueRuleColor,
      keptWidth: kept.dialogueRuleWidth,
      keptGap: kept.dialogueRuleGap,
      freshColor: fresh.dialogueRuleColor,
      freshWidth: fresh.dialogueRuleWidth,
      freshGap: fresh.dialogueRuleGap
    };
  });

  check(
    "[numbers/gone] 옛 프리셋의 dialogueRule 값은 열고 저장해도 그대로 남는다",
    legacyDialogue.keptColor === "#66aa88" &&
    legacyDialogue.keptWidth === 5 &&
    legacyDialogue.keptGap === 7,
    JSON.stringify(legacyDialogue)
  );

  check(
    "[numbers/gone] 그 값이 없던 프리셋에는 새로 만들어 넣지 않는다",
    legacyDialogue.freshColor === undefined &&
    legacyDialogue.freshWidth === undefined &&
    legacyDialogue.freshGap === undefined,
    JSON.stringify(legacyDialogue)
  );

  /* ---- 직접 입력한 값이 그대로 수집된다 ---- */

  const typed = await page.evaluate(async (fields) => {
    const wanted = {
      quoteHighlightHeight: 55,
      quoteBodyRuleWidth: 7,
      quoteBodyRuleGap: 26,
      quoteSourceRuleWidth: 5,
      quoteSourceRuleGap: 18,
      quoteBackgroundOverlayOpacity: 40
    };

    Object.entries(wanted).forEach(([id, value]) => {
      const el = document.getElementById(id);
      el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const collected = collectQuoteSettings();

    return {
      highlightHeight: collected.highlightHeight,
      bodyRuleWidth: collected.bodyRuleWidth,
      bodyRuleGap: collected.bodyRuleGap,
      sourceRuleWidth: collected.sourceRuleWidth,
      sourceRuleGap: collected.sourceRuleGap,
      overlay: collected.backgroundOverlayOpacity
    };
  }, NUMBER_FIELDS);

  check(
    "[numbers] 직접 친 값이 그대로 저장값이 된다",
    typed.highlightHeight === 55 &&
    typed.bodyRuleWidth === 7 &&
    typed.bodyRuleGap === 26 &&
    typed.sourceRuleWidth === 5 &&
    typed.sourceRuleGap === 18 &&
    Math.abs(typed.overlay - 0.4) < 0.001,
    JSON.stringify(typed)
  );

  /* ---- 저장 → 다시 열기 왕복에서 값이 그대로 ---- */

  const roundTrip = await page.evaluate(() => {
    const saved = collectQuoteSettings();
    applyQuoteSettings(saved);
    const again = collectQuoteSettings();

    const keys = [
      "highlightHeight",
      "bodyRuleWidth", "bodyRuleGap",
      "sourceRuleWidth", "sourceRuleGap",
      "backgroundOverlayOpacity"
    ];

    const drift = keys.filter(k => saved[k] !== again[k]);

    return {
      drift,
      formValues: {
        gap: document.getElementById("quoteBodyRuleGap").value,
        height: document.getElementById("quoteHighlightHeight").value,
        overlay: document.getElementById("quoteBackgroundOverlayOpacity").value
      }
    };
  });

  check(
    "[numbers] 저장 → 다시 열기 왕복에서 값이 변하지 않는다",
    roundTrip.drift.length === 0 &&
    roundTrip.formValues.gap === "26" &&
    roundTrip.formValues.height === "55",
    JSON.stringify(roundTrip)
  );

  /* ---- 범위 밖 값은 그려질 때 잘린다 ---- */

  const outOfRange = await page.evaluate(() => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    set("quoteHighlightHeight", 999);
    set("quoteBodyRuleWidth", 99);
    set("quoteBodyRuleGap", -40);
    set("quoteBackgroundOverlayOpacity", 500);

    const s = collectQuoteSettings();

    return {
      /* 그리는 쪽에서 잘린다 — 저장값은 사용자가 친 그대로 둔다 */
      drawnHeight: resolvePostHighlightHeight(s),
      drawnWidth: normalizePostRuleWidth(
        s.bodyRuleWidth, POST_STYLE_DEFAULTS.bodyRuleWidth
      ),
      drawnGap: normalizePostRuleGap(
        s.bodyRuleGap, POST_STYLE_DEFAULTS.bodyRuleGap
      ),
      drawnOverlay: resolvePostBackgroundView(s, {}).overlayOpacity
    };
  });

  check(
    "[numbers] 범위를 벗어난 값은 그릴 때 안전한 값으로 잘린다",
    outOfRange.drawnHeight === 100 &&
    outOfRange.drawnWidth === 12 &&
    outOfRange.drawnGap === 0 &&
    outOfRange.drawnOverlay === 1,
    JSON.stringify(outOfRange)
  );

  check("[numbers] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   11. toolbar — 세 줄 배치와 취소선 (요구사항 5)
========================================================== */

async function runToolbar(browser) {
  console.log("\n[toolbar] 세 줄 배치 · 취소선");

  for (const viewport of ["desktop", "mobile"]) {

    const { ctx, page, errors } = await openPostEditor(browser, { viewport });

    const layout = await page.evaluate(() => {
      const toolbar = document.getElementById("postEditorToolbar");
      const lines = Array.from(
        toolbar.querySelectorAll(":scope > .post-editor-tool-line")
      );

      /*
        "정확히 세 줄"은 DOM이 아니라 **실제 y좌표**로 판정한다 —
        wrap이 일어나면 같은 줄 안에서 버튼이 아래로 떨어진다.
      */
      const rowsOf = (root) => {
        /*
          높이가 서로 다른 요소(라벨 9px, 버튼 17px, 색 견본 24px)가
          세로 가운데로 맞춰지므로 top은 같은 줄에서도 다르다.
          가운데 y를 반올림해 묶어서 "몇 줄인가"를 센다.
        */
        const centers = Array.from(
          root.querySelectorAll("button, select, .post-editor-tool-label")
        )
          .filter(n => n.offsetParent !== null)
          .map(n => {
            const r = n.getBoundingClientRect();
            return r.top + r.height / 2;
          });

        const rows = [];
        centers.forEach(c => {
          if (!rows.some(r => Math.abs(r - c) < 8)) rows.push(c);
        });
        return rows.length;
      };

      const order = (root) =>
        Array.from(
          root.querySelectorAll("button, select")
        )
          .filter(n => n.offsetParent !== null)
          .map(n => n.id || n.className);

      const toolbarRect = toolbar.getBoundingClientRect();

      return {
        lineCount: lines.length,
        rowsPerLine: lines.map(rowsOf),
        order: lines.map(order),
        /* undo/redo는 1행 오른쪽 끝에 붙는다 (요구사항 4) */
        undoRight: Math.round(
          lines[0].getBoundingClientRect().right -
          document.getElementById("postEditorRedoButton")
            .getBoundingClientRect().right
        ),
        /* 툴바가 화면 밖으로 넘지 않는다 */
        overflowsScreen: Math.round(toolbarRect.right) > window.innerWidth + 1,
        /* 버튼이 터치하기 어려울 만큼 작지 않다 */
        smallest: Math.min(
          ...Array.from(toolbar.querySelectorAll("button"))
            .filter(n => n.offsetParent !== null)
            .map(n => Math.round(n.getBoundingClientRect().height))
        )
      };
    });

    check(
      `[toolbar/${viewport}] 툴바가 정확히 세 줄이다`,
      layout.lineCount === 3 &&
      layout.rowsPerLine.every(rows => rows === 1),
      JSON.stringify({ lines: layout.lineCount, rows: layout.rowsPerLine })
    );

    /*
      ★ undo/redo가 1행 오른쪽으로 올라왔다 (요구사항 4).

      예전에는 이 둘만 쓰는 3행이 따로 있었다. 삽입 줄(3행)이
      생기면서 줄이 넷이 되는 대신, 1행에 남는 오른쪽 공간으로
      옮겼다.
    */

    check(
      `[toolbar/${viewport}] 1행이 page break · H · P · L · clear · undo · redo 순서다`,
      JSON.stringify(layout.order[0]) === JSON.stringify([
        "postEditorPageBreak",
        "postEditorCustomControl",
        "postEditorCustomPointControl",
        "postEditorRuleToggle",
        "postEditorRuleControl",
        "postEditorClearStyle",
        "postEditorUndoButton",
        "postEditorRedoButton"
      ]),
      JSON.stringify(layout.order[0])
    );

    check(
      `[toolbar/${viewport}] undo · redo가 1행 오른쪽 끝에 붙는다`,
      layout.undoRight <= 1,
      String(layout.undoRight)
    );

    check(
      `[toolbar/${viewport}] 2행이 B · I · U · S · photo · preset 순서다`,
      JSON.stringify(layout.order[1]) === JSON.stringify([
        "postEditorBoldToggle",
        "postEditorItalicToggle",
        "postEditorUnderlineToggle",
        "postEditorStrikeToggle",
        "postEditorImageButton",
        "postEditorPresetSelect"
      ]),
      JSON.stringify(layout.order[1])
    );

    /*
      ★ 3행은 블록 삽입이다 (요구사항 4·5·6·7) —
      copy box · memo · divider 드롭다운.
    */

    check(
      `[toolbar/${viewport}] 3행이 copy box · memo · divider 순서다`,
      JSON.stringify(layout.order[2]) === JSON.stringify([
        "postEditorInsertCopyBox",
        "postEditorInsertMemo",
        "postEditorInsertDivider"
      ]),
      JSON.stringify(layout.order[2])
    );

    /*
      ★ 세 행의 왼쪽 시작점이 같다 (요구사항 4).

      1행은 버튼(page break)으로, 2·3행은 라벨(FORMAT / INSERT)로
      시작한다. 버튼에만 있는 좌우 padding 때문에 예전에는 행마다
      첫 글자가 6px씩 어긋나 보였다.
    */

    const starts = await page.evaluate(() => {
      const toolbar = document.getElementById("postEditorToolbar");
      const base = toolbar.getBoundingClientRect().left;
      return Array.from(
        toolbar.querySelectorAll(".post-editor-tool-line")
      ).map(line =>
        Math.round(
          line.firstElementChild.getBoundingClientRect().left - base
        ));
    });

    check(
      `[toolbar/${viewport}] 세 행의 왼쪽 시작점이 같다`,
      new Set(starts).size === 1,
      JSON.stringify(starts)
    );


    check(
      `[toolbar/${viewport}] 화면 밖으로 넘지 않고 버튼이 지나치게 작지 않다`,
      layout.overflowsScreen === false &&
      layout.smallest >= 16,
      JSON.stringify({
        overflow: layout.overflowsScreen,
        smallest: layout.smallest
      })
    );

    /* 줄인 라벨의 뜻이 접근성 이름으로 남아 있다 */

    const labels = await page.evaluate(() => ({
      h: document.getElementById("postEditorCustomControl")
        .getAttribute("aria-label"),
      p: document.getElementById("postEditorCustomPointControl")
        .getAttribute("aria-label"),
      l: document.getElementById("postEditorRuleToggle")
        .getAttribute("aria-label"),
      lTitle: document.getElementById("postEditorRuleToggle").title,
      /* 중복 라벨(RULE/line, PHOTO/사진)은 사라졌다 */
      photoText: document.getElementById("postEditorImageButton")
        .textContent.trim(),
      ruleText: document.getElementById("postEditorRuleToggle")
        .textContent.trim(),
      labelTexts: Array.from(
        document.querySelectorAll(
          "#postEditorToolbar .post-editor-tool-label"
        )
      ).map(n => n.textContent.trim())
    }));

    check(
      `[toolbar/${viewport}] 줄인 라벨의 뜻이 접근성 이름과 툴팁에 남아 있다`,
      /형광펜/.test(labels.h) &&
      /강조색/.test(labels.p) &&
      /강조선/.test(labels.l) &&
      /Line/.test(labels.lTitle) &&
      labels.ruleText === "L" &&
      labels.photoText === "photo" &&
      labels.labelTexts.join(",") === "H,P,FORMAT,INSERT",
      JSON.stringify(labels)
    );

    check(`[toolbar/${viewport}] 오류 없음`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await runStrike(browser);
}


/*
  취소선 — 적용/해제, 다른 서식과 섞이기, undo/redo, 저장 왕복,
  공개 뷰어와 발췌.
*/
async function runStrike(browser) {
  console.log("\n[strike] 취소선");

  const { ctx, page, errors } = await openPostEditor(browser);
  await installProbes(page);

  await page.evaluate((settings) => {
    postStyleSettings = settings;
    postEditorContent.innerHTML = "창가 자리에 앉은 그는 커피를 앞에 두고 있었다.";
    resetEditorUndoHistory();
  }, DECOR_SETTINGS);

  await selectEditorRange(page, 0, 10);
  await page.click("#postEditorStrikeToggle");
  await page.waitForTimeout(200);

  const applied = await page.evaluate(() => ({
    html: postEditorContent.innerHTML,
    count: postEditorContent.querySelectorAll("s").length,
    text: postEditorContent.querySelector("s")?.textContent,
    pressed: document.getElementById("postEditorStrikeToggle")
      .getAttribute("aria-pressed")
  }));

  check(
    "[strike] 적용하면 <s>로 감싼다",
    applied.count === 1 && applied.text === "창가 자리에 앉은 ",
    JSON.stringify(applied)
  );

  /* 다른 서식과 섞기 */

  await page.evaluate(() => {
    const s = postEditorContent.querySelector("s");
    const range = document.createRange();
    range.selectNodeContents(s);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    savedEditorRange = range.cloneRange();
  });
  await page.click("#postEditorBoldToggle");
  await page.waitForTimeout(200);

  check(
    "[strike] 굵게와 함께 걸 수 있다",
    await page.evaluate(() =>
      postEditorContent.querySelectorAll("s").length === 1 &&
      postEditorContent.querySelectorAll("strong").length === 1),
    await page.evaluate(() => postEditorContent.innerHTML)
  );

  /* 저장 왕복 — sanitizer가 벗기지 않는다 */

  const roundTrip = await page.evaluate(() => {
    const saved = getRichEditorHTML();
    const host = document.createElement("div");
    host.innerHTML = getPostContentAsSafeHTML(saved);
    return {
      saved,
      safe: host.innerHTML,
      strikes: host.querySelectorAll("s").length
    };
  });

  check(
    "[strike] 저장/불러오기 왕복에서 사니타이저가 벗기지 않는다",
    roundTrip.strikes === 1 && /<s>/.test(roundTrip.safe),
    JSON.stringify(roundTrip).slice(0, 300)
  );

  /* 옛 태그(strike/del)도 s로 받아들인다 */

  const legacyTags = await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = getPostContentAsSafeHTML(
      "<strike>가</strike><del>나</del><s>다</s>"
    );
    return {
      s: host.querySelectorAll("s").length,
      strike: host.querySelectorAll("strike").length,
      del: host.querySelectorAll("del").length,
      text: host.textContent
    };
  });

  check(
    "[strike] 옛 <strike>/<del>도 <s>로 받아들인다",
    legacyTags.s === 3 &&
    legacyTags.strike === 0 &&
    legacyTags.del === 0 &&
    legacyTags.text === "가나다",
    JSON.stringify(legacyTags)
  );

  /* undo 한 번으로 되돌아간다 */

  const undone = await page.evaluate(() => {
    undoEditorChange();
    return postEditorContent.querySelectorAll("strong").length;
  });
  await page.waitForTimeout(150);

  check(
    "[strike] 다른 서식과 마찬가지로 undo/redo가 된다",
    undone === 0 &&
    await page.evaluate(() => {
      redoEditorChange();
      return postEditorContent.querySelectorAll("strong").length === 1;
    }),
    String(undone)
  );

  /* 해제 */

  await page.evaluate(() => {
    const s = postEditorContent.querySelector("s");
    const range = document.createRange();
    range.selectNodeContents(s);
    savedEditorRange = range.cloneRange();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.click("#postEditorStrikeToggle");
  await page.waitForTimeout(200);

  check(
    "[strike] 다시 누르면 해제된다",
    await page.evaluate(() =>
      postEditorContent.querySelectorAll("s").length === 0),
    await page.evaluate(() => postEditorContent.innerHTML)
  );

  /* 프리뷰(발췌)와 공개 뷰어에 그려진다 */

  await renderEditorPreview(page, {
    html: "앞 <s>지운 글</s> 뒤",
    settings: DECOR_SETTINGS,
    title: ""
  });

  const drawn = await page.evaluate(() => {
    const pageEl = VISIBLE_PAGE_FN();
    const s = pageEl.querySelector("s");
    return {
      found: Boolean(s),
      decoration: s ? getComputedStyle(s).textDecorationLine : null,
      text: s?.textContent
    };
  });

  check(
    "[strike] 발췌 프리뷰에 취소선이 그려진다",
    drawn.found === true &&
    /line-through/.test(drawn.decoration || "") &&
    drawn.text === "지운 글",
    JSON.stringify(drawn)
  );

  const inViewer = await page.evaluate((settings) => {
    const host = document.createElement("div");
    host.innerHTML = getPostContentAsSafeHTML("앞 <s>지운 글</s> 뒤");
    document.body.appendChild(host);
    applyPostBodyStyles(host, settings);
    const s = host.querySelector("s");
    const result = {
      found: Boolean(s),
      decoration: s ? getComputedStyle(s).textDecorationLine : null
    };
    host.remove();
    return result;
  }, DECOR_SETTINGS);

  check(
    "[strike] 공개 뷰어 본문에도 취소선이 그려진다",
    inViewer.found === true &&
    /line-through/.test(inViewer.decoration || ""),
    JSON.stringify(inViewer)
  );

  check("[strike] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   12. excerpt — 발췌 설정 정리 (요구사항 7·8)
========================================================== */

async function runExcerptPanel(browser) {
  console.log("\n[excerpt] 크기 모드 한 줄 · 크기 표시 자리 · 사진 교체");

  const { ctx, page, errors } = await openPostEditor(browser, {
    viewport: "mobile"
  });
  await installProbes(page);

  await renderEditorPreview(page, {
    html: "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 있었다.",
    settings: {
      ...DECOR_SETTINGS,
      exportWidth: 1200,
      backgroundImageUrl: FIXED_IMAGE,
      backgroundImageBlur: 8,
      backgroundOverlayColor: "#ffffff",
      backgroundOverlayOpacity: 0.6
    },
    title: "",
    mode: "auto"
  });
  await page.waitForTimeout(300);

  /* ---- (1) 발췌 설정에서 강조선 컬러피커가 사라졌다 ---- */

  check(
    "[excerpt] 발췌 설정 첫 줄의 강조선 색 견본이 없다",
    await page.evaluate(() =>
      document.getElementById("postEditorPreviewSourceRuleControl") === null &&
      document.getElementById("postEditorPreviewSourceRuleSwatch") === null &&
      /* rule 켜기/끄기 자체는 남는다 */
      Boolean(document.getElementById("postEditorPreviewSourceRuleToggle")))
  );

  check(
    "[excerpt] 본문 툴바의 H/P/L 색 견본은 그대로 남아 있다",
    await page.evaluate(() =>
      ["postEditorCustomControl",
       "postEditorCustomPointControl",
       "postEditorRuleControl"]
        .every(id => {
          const el = document.getElementById(id);
          return el && el.querySelector(".post-highlight-swatch");
        }))
  );

  /* ---- (2) 크기 모드가 한 줄: size uniform auto custom ---- */

  const sizeRow = await page.evaluate(() => {
    const controls = document.getElementById("postEditorPreviewRatioControls");
    const row = controls.closest(".post-editor-preview-row");
    const label = row.querySelector(".post-editor-preview-subrow-label");
    const buttons = Array.from(
      controls.querySelectorAll("button")
    ).map(b => b.textContent.trim());

    /* 높이가 달라 top은 어긋나므로 가운데 y로 묶는다 */
    const centers = [label, ...controls.querySelectorAll("button")]
      .map(n => {
        const r = n.getBoundingClientRect();
        return r.top + r.height / 2;
      });

    const rows = [];
    centers.forEach(c => {
      if (!rows.some(r => Math.abs(r - c) < 8)) rows.push(c);
    });

    return {
      label: label?.textContent.trim(),
      buttons,
      rows: rows.length
    };
  });

  check(
    "[excerpt] 크기 모드가 size · uniform · auto · custom 한 줄이다",
    sizeRow.label === "size" &&
    JSON.stringify(sizeRow.buttons) ===
      JSON.stringify(["uniform", "auto", "custom"]) &&
    sizeRow.rows === 1,
    JSON.stringify(sizeRow)
  );

  /* ---- (3) 크기 표시가 설정 밖, 대지 우측 위 ---- */

  const meta = await page.evaluate(() => {
    const label = document.getElementById("postEditorPreviewExportSize");
    const meta = label.closest(".post-editor-preview-stage-meta");
    const settings = document.querySelector(".post-editor-preview-settings");
    const stage = document.getElementById("postEditorPreviewStage");

    const metaRect = meta.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    return {
      text: label.textContent.trim(),
      insideSettings: Boolean(settings && settings.contains(label)),
      insideStage: stage.contains(label),
      aboveStage: Math.round(metaRect.bottom) <= Math.round(stageRect.top) + 1,
      rightAligned: Math.round(metaRect.right - label.getBoundingClientRect().right) <= 1
    };
  });

  check(
    "[excerpt] 크기 표시가 설정 안이 아니라 대지 우측 위 바깥에 있다",
    /^\d+ × \d+$/.test(meta.text) &&
    meta.insideSettings === false &&
    meta.insideStage === false &&
    meta.aboveStage === true &&
    meta.rightAligned === true,
    JSON.stringify(meta)
  );

  /* 페이지를 넘기면 그 페이지 크기로 갱신된다 */

  const perPage = await page.evaluate(async () => {
    document.getElementById("postEditorContent").innerHTML =
      "짧은 첫 장." +
      '<div class="post-editor-page-break" data-page-break="true" ' +
      'contenteditable="false">PAGE BREAK</div>' +
      new Array(10).fill(
        "창가 자리에 앉은 그는 오래 식은 커피를 앞에 두고 창밖을 바라보고 있었다."
      ).join("<br><br>");

    previewRatioMode = "auto";
    await updateEditorPreview();

    const label = document.getElementById("postEditorPreviewExportSize");
    const first = label.textContent.trim();

    showEditorPreviewPage(1);

    return {
      pages: editorPreviewPages.length,
      first,
      second: label.textContent.trim()
    };
  });
  await page.waitForTimeout(300);

  check(
    "[excerpt] 페이지를 넘기면 그 페이지 크기로 갱신된다",
    perPage.pages >= 2 &&
    perPage.first !== perPage.second &&
    /^\d+ × \d+$/.test(perPage.second),
    JSON.stringify(perPage)
  );

  /* ---- (4) 사진을 교체해도 프리셋의 덮개·흐림·크기 정책이 남는다 ---- */

  const beforeSwap = await page.evaluate(() => {
    const pageEl = document.querySelector(
      "#postEditorPreviewPages .post-editor-preview-page:not([hidden])"
    );
    const ov = pageEl.querySelector(".post-page-background-overlay");
    const im = pageEl.querySelector(".post-page-background-image");
    return {
      opacity: ov?.style.opacity,
      color: ov?.style.backgroundColor,
      filter: im?.style.filter
    };
  });

  await page.evaluate((url) => {
    window.uploadImoryQuoteBackground = async () => ({ ok: true, url });
  }, PORTRAIT);

  await page.setInputFiles("#postEditorPreviewBackgroundFile", {
    name: "x.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' " +
      "width='4' height='4'><rect width='4' height='4' fill='#123'/></svg>")
  });
  await page.waitForTimeout(900);

  const afterSwap = await page.evaluate(() => {
    const pageEl = document.querySelector(
      "#postEditorPreviewPages .post-editor-preview-page:not([hidden])"
    );
    const ov = pageEl.querySelector(".post-page-background-overlay");
    const im = pageEl.querySelector(".post-page-background-image");
    return {
      opacity: ov?.style.opacity,
      color: ov?.style.backgroundColor,
      filter: im?.style.filter,
      src: im?.getAttribute("src"),
      /* 프리셋 자체는 손대지 않는다 */
      presetUrl: postStyleSettings.backgroundImageUrl,
      presetOpacity: postStyleSettings.backgroundOverlayOpacity,
      /* 구도만 가운데로 초기화된다 */
      focusX: previewBackgroundFocusX,
      focusY: previewBackgroundFocusY
    };
  });

  check(
    "[excerpt] 사진을 교체해도 프리셋의 덮개·흐림이 그대로 남는다",
    afterSwap.src !== beforeSwap.src &&
    afterSwap.opacity === beforeSwap.opacity &&
    afterSwap.color === beforeSwap.color &&
    afterSwap.filter === beforeSwap.filter,
    JSON.stringify({ before: beforeSwap, after: afterSwap })
  );

  check(
    "[excerpt] 사진 교체가 프리셋을 고치지 않고 구도만 가운데로 되돌린다",
    afterSwap.presetUrl !== afterSwap.src &&
    afterSwap.presetOpacity === 0.6 &&
    afterSwap.focusX === 0.5 &&
    afterSwap.focusY === 0.5,
    JSON.stringify(afterSwap)
  );

  /* reset은 프리셋 기본값으로 되돌린다 */

  await page.click("#postEditorPreviewBackgroundReset");
  await page.waitForTimeout(500);

  check(
    "[excerpt] reset이 이번 발췌의 사진·위치 변경만 취소한다",
    await page.evaluate(() =>
      previewBackgroundUrl === null &&
      previewBackgroundFocusX === null &&
      previewBackgroundFocusY === null &&
      previewBackgroundMoveMode === false &&
      document.querySelector(
        "#postEditorPreviewPages .post-editor-preview-page:not([hidden]) " +
        ".post-page-background-image"
      ).getAttribute("src") === postStyleSettings.backgroundImageUrl)
  );

  check("[excerpt] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}



/* =========================================================
   blocks — 복사 상자 · 메모 · 구분선 (요구사항 5·6·7·8)

   기준 문서: posts/style/posts-body-blocks.js

   확인 범위
     삽입 · 편집 · 삭제 · undo/redo
     저장되는 HTML에 조작 UI가 없다
     재편집에서 조작 UI가 다시 붙는다
     복사되는 글자가 **내용만**이고 입력한 그대로다
     공개 뷰어에는 복사 버튼이, 발췌에는 없다
     상자 안의 따옴표·별표가 대사/지문으로 바뀌지 않는다
     긴 상자가 페이지를 넘겨도 내용이 유실되지 않는다
========================================================== */

/*
  ★ 사용자가 상자에 **치는** 글자다.

  편집창에서 <b>를 타이핑하면 그것은 태그가 아니라 글자이고,
  붙여넣기도 plain text 하나뿐이다(posts/editor/posts-richtext-events.js).
  그래서 본문 HTML에는 escape된 글자로 들어간다 — 아래 HTML fixture가
  &lt;b&gt;를 쓰는 이유다.
*/

const BLOCK_COPY_BODY =
  'const a = `tpl`;\n  두  칸  공백\n"따옴표" <b>태그</b>\n\n빈 줄 위';


/* 위 글자를 본문 HTML로 적은 것 — 줄바꿈은 <br>, 꺾쇠는 escape */

const BLOCK_COPY_BODY_HTML =
  BLOCK_COPY_BODY
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>");

const BLOCK_BODY_HTML = (copyBody) => [
  "첫 문단입니다. 상자 앞에 오는 평범한 글입니다.",
  "<br><br>",
  '<div class="post-copy-box">',
  '<div class="post-copy-box-title">프롬프트</div>',
  '<div class="post-copy-box-body">' + copyBody + "</div>",
  "</div>",
  "<br>",
  '<div class="post-memo">',
  '<div class="post-memo-title">메모</div>',
  '<div class="post-memo-body">본문 중간에 놓인 메모지입니다.<br>두 번째 줄.</div>',
  "</div>",
  "<br>",
  '<div class="post-divider" data-divider="dashed"></div>',
  "<br>",
  "상자 뒤에 오는 평범한 문단입니다.",
  '<br><br>"대사도 그대로 대사로 보여야 한다."'
].join("");


async function runBlocks(browser) {
  console.log("\n[blocks] 복사 상자 · 메모 · 구분선");

  const { ctx, page, errors } = await openPostEditor(browser, {
    viewport: "mobile"
  });

  await page.evaluate((settings) => {
    postStyleSettings = settings;
    postEditorContent.innerHTML = "머리말입니다";
    resetEditorUndoHistory();
  }, DECOR_SETTINGS);
  await page.waitForTimeout(200);

  /* ---- 삽입 ---- */

  await caretAtText(page, "머리말");
  await page.tap("#postEditorInsertCopyBox");
  await page.waitForTimeout(250);

  const inserted = await page.evaluate(() => ({
    boxes: postEditorContent.querySelectorAll(".post-copy-box").length,
    tools: postEditorContent.querySelectorAll(".post-block-tool").length,
    /* 커서가 부제목 칸으로 들어갔는가 */
    caretInTitle: Boolean(
      window.getSelection().anchorNode &&
      (window.getSelection().anchorNode.closest
        ? window.getSelection().anchorNode
        : window.getSelection().anchorNode.parentElement
      ).closest(".post-copy-box-title")
    ),
    undo: editorUndoStack.length
  }));

  check(
    "[blocks] copy box를 누르면 커서 자리에 상자가 들어가고 부제목으로 커서가 간다",
    inserted.boxes === 1 &&
    inserted.tools === 1 &&
    inserted.caretInTitle === true &&
    inserted.undo === 1,
    JSON.stringify(inserted)
  );

  /* ---- 다섯 가지 구분선 ---- */

  const kinds = ["solid", "dotted", "dashed", "double", "dots"];

  for (const kind of kinds) {
    await page.evaluate(() => {
      const range = document.createRange();
      range.setStart(postEditorContent, postEditorContent.childNodes.length);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      saveEditorSelection();
    });
    await page.selectOption("#postEditorInsertDivider", kind);
    await page.waitForTimeout(160);
  }

  const dividers = await page.evaluate(() =>
    Array.from(postEditorContent.querySelectorAll(".post-divider")).map(node => {
      const style = getComputedStyle(node);
      return {
        kind: node.dataset.divider,
        border: style.borderTopStyle,
        width: style.borderTopWidth,
        marginTop: style.marginTop,
        tool: Boolean(node.querySelector(".post-block-tool"))
      };
    }));

  check(
    "[blocks] 구분선 다섯 가지가 서로 다르게 그려진다",
    dividers.length === 5 &&
    dividers.map(d => d.kind).join(",") === kinds.join(",") &&
    dividers[0].border === "solid" &&
    dividers[1].border === "dotted" &&
    dividers[2].border === "dashed" &&
    dividers[3].border === "double" &&
    /* 가운데 점 세 개는 테두리가 아니라 글자로 그린다 */
    dividers[4].border === "none",
    JSON.stringify(dividers)
  );

  check(
    "[blocks] 구분선의 위아래 여백은 종류와 관계없이 같다",
    new Set(dividers.map(d => d.marginTop)).size === 1,
    JSON.stringify(dividers.map(d => d.marginTop))
  );

  check(
    "[blocks] 드롭다운은 넣은 뒤 안내 문구로 돌아온다(같은 종류를 연달아 넣을 수 있다)",
    (await page.inputValue("#postEditorInsertDivider")) === ""
  );

  /* ---- 종류 변경 · 삭제 · undo ---- */

  await page.selectOption(
    ".post-divider[data-divider='solid'] .post-block-tool-select",
    "dots"
  );
  await page.waitForTimeout(200);

  check(
    "[blocks] 넣은 뒤에도 구분선 종류를 바꿀 수 있다",
    (await page.evaluate(() =>
      postEditorContent.querySelector(".post-divider").dataset.divider)) === "dots"
  );

  const beforeDelete = await page.evaluate(() =>
    postEditorContent.querySelectorAll(".post-divider").length);

  await page.click(".post-divider .post-block-tool-button");
  await page.waitForTimeout(200);

  const afterDelete = await page.evaluate(() =>
    postEditorContent.querySelectorAll(".post-divider").length);

  await page.click("#postEditorUndoButton");
  await page.waitForTimeout(250);

  const afterUndo = await page.evaluate(() => ({
    dividers: postEditorContent.querySelectorAll(".post-divider").length,
    tools: postEditorContent.querySelectorAll(".post-block-tool").length
  }));

  check(
    "[blocks] 삭제와 undo가 기존 편집기와 같은 칸으로 동작한다",
    afterDelete === beforeDelete - 1 &&
    afterUndo.dividers === beforeDelete &&
    /* undo로 본문을 갈아끼워도 조작 UI가 다시 붙는다 */
    afterUndo.tools === afterUndo.dividers + 1,
    JSON.stringify({ beforeDelete, afterDelete, afterUndo })
  );

  /* ---- 저장 · 재편집 ---- */

  await page.evaluate((html) => {
    setRichEditorContent(html);
  }, BLOCK_BODY_HTML(BLOCK_COPY_BODY_HTML));
  await page.waitForTimeout(250);

  const saved = await page.evaluate(() => getRichEditorHTML());

  check(
    "[blocks] 저장되는 HTML에 조작 UI가 들어가지 않는다",
    !saved.includes("post-block-tool") &&
    !saved.includes("contenteditable") &&
    !saved.includes("post-copy-box-copy"),
    saved.slice(0, 200)
  );

  check(
    "[blocks] 저장 HTML은 왕복해도 그대로다",
    (await page.evaluate((html) => {
      setRichEditorContent(html);
      return getRichEditorHTML();
    }, saved)) === saved,
    saved.slice(0, 160)
  );

  check(
    "[blocks] 저장된 글을 다시 열면 조작 UI가 붙는다",
    (await page.evaluate(() =>
      postEditorContent.querySelectorAll(".post-block-tool").length)) === 3
  );

  const codeInBox = await page.evaluate(() => {
    const body = postEditorContent.querySelector(".post-copy-box-body");
    return {
      text: body.textContent.includes("<b>태그</b>"),
      tags: body.querySelectorAll("b, i, span").length
    };
  });

  check(
    "[blocks] 상자 안의 HTML 코드는 실행되지 않고 글자 그대로 보인다",
    codeInBox.text === true && codeInBox.tags === 0,
    JSON.stringify(codeInBox)
  );

  /*
    ★ 반대 방향도 확인한다.

    손으로 만든 HTML이나 옛 글에서 상자 안에 **진짜 태그**가 들어와
    있을 수 있다. 사니타이저는 그 껍데기를 벗기고 글자만 남긴다
    (posts/posts-sanitize.js의 sanitizeBlockTextInto) — 상자 안은
    "그대로 보여주고 그대로 복사할 글자"이므로, 서식이 살아나면
    화면과 복사되는 글자가 달라진다. 줄바꿈만 <br>로 남는다.
  */

  const rawTagInBox = await page.evaluate(() => {
    setRichEditorContent(
      '<div class="post-copy-box">' +
      '<div class="post-copy-box-title">t</div>' +
      '<div class="post-copy-box-body">앞<b>굵게</b><div>새 줄</div>뒤</div>' +
      "</div>"
    );
    const body = postEditorContent.querySelector(".post-copy-box-body");
    return {
      tags: body.querySelectorAll("b, div").length,
      text: postCopyBoxPlainText(
        postEditorContent.querySelector(".post-copy-box"))
    };
  });

  check(
    "[blocks] 상자 안에 들어온 진짜 태그는 껍데기가 벗겨지고 글자만 남는다",
    rawTagInBox.tags === 0 &&
    rawTagInBox.text === "앞굵게\n새 줄\n뒤",
    JSON.stringify(rawTagInBox)
  );

  await page.evaluate((html) => {
    setRichEditorContent(html);
  }, BLOCK_BODY_HTML(BLOCK_COPY_BODY_HTML));
  await page.waitForTimeout(200);

  /* ---- 복사되는 글자 ---- */

  const copied = await page.evaluate(async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderStyledPostContentInto(host, getRichEditorHTML(), postStyleSettings);

    const button = host.querySelector(".post-copy-box-copy");
    let text = null;
    navigator.clipboard.writeText = async (value) => { text = value; };
    button.click();
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      text,
      label: button.textContent,
      state: button.dataset.copyState
    };
  });

  check(
    "[blocks] 복사되는 것은 내용뿐이고 입력한 그대로다(백틱·연속 공백·따옴표·HTML 글자·빈 줄)",
    copied.text === BLOCK_COPY_BODY,
    JSON.stringify({ copied: copied.text, expected: BLOCK_COPY_BODY })
  );

  check(
    "[blocks] 부제목도 버튼 글자도 장식용 백틱도 복사되지 않는다",
    !copied.text.includes("프롬프트") &&
    !copied.text.includes("copy") &&
    !copied.text.startsWith("```") &&
    !copied.text.endsWith("```"),
    JSON.stringify(copied.text)
  );

  check(
    "[blocks] 복사에 성공하면 짧게 알린다",
    copied.label === "copied" && copied.state === "ok",
    JSON.stringify(copied)
  );

  const failed = await page.evaluate(async () => {
    const button = document.querySelector(".post-copy-box-copy");
    navigator.clipboard.writeText = async () => { throw new Error("denied"); };
    document.execCommand = () => false;
    button.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    return { label: button.textContent, state: button.dataset.copyState };
  });

  check(
    "[blocks] 실패했는데 성공으로 표시하지 않는다",
    failed.state === "failed" && failed.label !== "copied",
    JSON.stringify(failed)
  );

  /* ---- 공개 뷰어 ---- */

  const viewer = await page.evaluate((html) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderStyledPostContentInto(host, html, {
      ...postStyleSettings,
      dialogueRuleEnabled: true
    });
    return {
      copyButtons: host.querySelectorAll(".post-copy-box-copy").length,
      memoCopyButtons: host.querySelectorAll(".post-memo .post-copy-box-copy").length,
      tools: host.querySelectorAll(".post-block-tool").length,
      editable: host.querySelectorAll("[contenteditable]").length,
      dividers: host.querySelectorAll(".post-divider").length,
      dialogue: host.querySelectorAll(".post-dialogue").length,
      dialogueInBlock: host.querySelectorAll(
        ".post-copy-box .post-dialogue, .post-memo .post-dialogue"
      ).length,
      ruleAroundBlock: host.querySelectorAll(
        ".post-para-rule-box .post-copy-box, .post-para-rule-box .post-memo"
      ).length
    };
  }, BLOCK_BODY_HTML(BLOCK_COPY_BODY_HTML));

  check(
    "[blocks] 공개 뷰어에는 복사 버튼만 있고 편집·삭제 UI는 없다",
    viewer.copyButtons === 1 &&
    viewer.memoCopyButtons === 0 &&
    viewer.tools === 0 &&
    viewer.editable === 0,
    JSON.stringify(viewer)
  );

  check(
    "[blocks] 상자 안의 따옴표가 대사로 바뀌지 않고, 본문의 대사는 그대로 대사다",
    viewer.dialogueInBlock === 0 && viewer.dialogue === 1,
    JSON.stringify(viewer)
  );

  check(
    "[blocks] 문단 강조선이 상자를 감싸지 않는다",
    viewer.ruleAroundBlock === 0,
    JSON.stringify(viewer)
  );

  /* ---- 발췌 ---- */

  await page.evaluate((args) => {
    postStyleSettings = { ...args.settings, dialogueRuleEnabled: true };
    setRichEditorContent(args.html);
  }, {
    settings: DECOR_SETTINGS,
    html: BLOCK_BODY_HTML("짧은 내용<br>두 줄")
  });
  await page.evaluate(() => updateEditorPreview());
  await page.waitForTimeout(900);

  const excerpt = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll(
      "#postEditorPreviewPages .post-editor-preview-page"));
    return {
      pages: pages.length,
      boxes: document.querySelectorAll("#postEditorPreviewPages .post-copy-box").length,
      memos: document.querySelectorAll("#postEditorPreviewPages .post-memo").length,
      dividers: document.querySelectorAll("#postEditorPreviewPages .post-divider").length,
      copyButtons: document.querySelectorAll(
        "#postEditorPreviewPages .post-copy-box-copy").length,
      tools: document.querySelectorAll("#postEditorPreviewPages .post-block-tool").length,
      titleKept: pages.map(p => p.textContent).join("").includes("프롬프트"),
      overflowX: pages.some(p => p.scrollWidth > p.clientWidth + 1)
    };
  });

  check(
    "[blocks] 발췌에는 제목·내용·외형이 남고 조작 아이콘은 빠진다",
    excerpt.boxes === 1 &&
    excerpt.memos === 1 &&
    excerpt.dividers === 1 &&
    excerpt.titleKept === true &&
    excerpt.copyButtons === 0 &&
    excerpt.tools === 0,
    JSON.stringify(excerpt)
  );

  check(
    "[blocks] 발췌에서 상자가 가로로 넘치지 않는다",
    excerpt.overflowX === false,
    JSON.stringify(excerpt)
  );

  /* ---- 페이지보다 긴 상자 ---- */

  const longBody = Array.from(
    { length: 40 },
    (unused, index) => `${index + 1}번째 줄입니다. 상자가 한 장을 넘길 만큼 길어야 합니다.`
  );

  const startedAt = Date.now();

  await page.evaluate((html) => {
    setRichEditorContent(html);
  }, BLOCK_BODY_HTML(longBody.join("<br>")));
  await page.evaluate(() => updateEditorPreview());
  await page.waitForTimeout(2500);

  const elapsed = Date.now() - startedAt;

  const long = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll(
      "#postEditorPreviewPages .post-editor-preview-page"));
    const all = pages.map(p => p.textContent).join("");
    return {
      pages: pages.length,
      boxes: document.querySelectorAll("#postEditorPreviewPages .post-copy-box").length,
      first: all.includes("1번째 줄입니다"),
      last: all.includes("40번째 줄입니다"),
      after: all.includes("상자 뒤에 오는 평범한 문단입니다")
    };
  });

  check(
    "[blocks] 페이지보다 긴 상자도 쪼개지지 않고 내용이 유실되지 않는다",
    long.boxes === 1 && long.first && long.last && long.after,
    JSON.stringify(long)
  );

  check(
    "[blocks] 긴 상자에서 페이지 분할이 무한히 반복되지 않는다",
    long.pages >= 1 && long.pages <= 12 && elapsed < 20000,
    `${long.pages}장 / ${elapsed}ms`
  );

  /* ---- clear가 블록을 지우지 않는다 ---- */

  await page.evaluate((html) => {
    setRichEditorContent(html);
    resetEditorUndoHistory();
  }, BLOCK_BODY_HTML("짧은 내용"));
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    postEditorContent.focus();
    const range = document.createRange();
    range.selectNodeContents(postEditorContent);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    saveEditorSelection();
  });

  await page.click("#postEditorClearStyle");
  await page.waitForTimeout(300);

  const afterClear = await page.evaluate(() => ({
    boxes: postEditorContent.querySelectorAll(".post-copy-box").length,
    memos: postEditorContent.querySelectorAll(".post-memo").length,
    dividers: postEditorContent.querySelectorAll(".post-divider").length,
    body: postEditorContent.querySelector(".post-copy-box-body")?.textContent
  }));

  check(
    "[blocks] clear가 복사 박스·메모·구분선을 임의로 삭제하지 않는다",
    afterClear.boxes === 1 &&
    afterClear.memos === 1 &&
    afterClear.dividers === 1 &&
    afterClear.body === "짧은 내용",
    JSON.stringify(afterClear)
  );

  check("[blocks] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   html — 바깥 코드 울타리 제거 · 디자인 PNG (요구사항 9·10)

   기준 문서
     posts/posts-format.js          stripOuterHtmlCodeFence
     posts/export/posts-html-image.js  디자인 → PNG

   확인 범위
     감싼 울타리만 벗기고 안쪽 백틱·따옴표는 남는다
     저장된 글자는 고치지 않는다(렌더에서만 벗긴다)
     여러 번 그려도 더 깎이지 않는다
     HTML 모드에서 미리보기와 export가 살아난다
     저장되는 PNG에 OOC·제목·사이트 UI가 들어가지 않는다
     실제 PNG를 디코드해 크기와 내용(빈 이미지 아님)을 확인한다
========================================================== */

const HTML_DESIGN_INNER = [
  '<div style="background:#1b2333;padding:40px;color:#ffd24d;font-family:sans-serif">',
  '  <div style="font-size:11px;letter-spacing:3px;color:#9fb0c9">CONFIDENTIAL</div>',
  '  <h1 style="font-size:30px;margin:14px 0">&lt;ARCH&gt; 평가 보고서</h1>',
  '  <div style="height:3px;background:#ffd24d;margin:18px 0"></div>',
  '  <p style="color:#e6edf7;line-height:1.9">본 보고서는 `백틱`과 "따옴표"를 포함한다.</p>',
  '  <div style="background:#27314a;padding:18px;margin-top:18px;border-left:4px solid #ffd24d">',
  '    <b style="color:#fff">평가 개요</b>',
  '    <p style="color:#c9d6ea">두 요원은 극초기 불안정한 관계에서 시작하였다.</p>',
  "  </div>",
  "</div>"
].join("\n");

const HTML_DESIGN_FENCED = "```html\n" + HTML_DESIGN_INNER + "\n```";


async function runHtmlImage(browser) {
  console.log("\n[html] 바깥 코드 울타리 · 디자인 PNG");

  const { ctx, page, errors } = await openPostEditor(browser);

  /* ---- 울타리 벗기기 규칙 ---- */

  const fence = await page.evaluate(() => {
    const cases = {
      basic: "```html\n<div>hi</div>\n```",
      spaced: "\n\n  ```HTML  \n<div>hi</div>\n```  \n\n",
      noLang: "```\n<div>hi</div>\n```",
      tilde: "~~~html\n<div>hi</div>\n~~~",
      plain: "<div>hi</div>",
      innerBacktick: "<div>a `b` c</div>",
      innerFence: "```html\n<p>code: ```x``` 입니다</p>\n```",
      mismatched: "```html\n<div>hi</div>\n~~~",
      twoBlocks: "```html\n<div>a</div>\n```\n\n```html\n<div>b</div>\n```"
    };

    const out = {};
    Object.entries(cases).forEach(([key, value]) => {
      out[key] = stripOuterHtmlCodeFence(value);
      /* 같은 원본에서 두 번 벗겨도 결과가 같아야 한다 */
      out[key + "Stable"] =
        stripOuterHtmlCodeFence(value) === stripOuterHtmlCodeFence(value);
    });
    return out;
  });

  check(
    "[html] 감싼 울타리(언어 표기·앞뒤 공백 포함)만 벗긴다",
    fence.basic === "<div>hi</div>" &&
    fence.spaced === "<div>hi</div>" &&
    fence.noLang === "<div>hi</div>" &&
    fence.tilde === "<div>hi</div>",
    JSON.stringify(fence)
  );

  check(
    "[html] 울타리가 아닌 글은 손대지 않고, 안쪽 백틱·따옴표는 남는다",
    fence.plain === "<div>hi</div>" &&
    fence.innerBacktick === "<div>a `b` c</div>" &&
    fence.innerFence === "<p>code: ```x``` 입니다</p>",
    JSON.stringify(fence)
  );

  check(
    "[html] 짝이 맞지 않거나 블록이 둘 이상이면 벗기지 않는다(전역 치환이 아니다)",
    fence.mismatched.startsWith("```html") &&
    fence.twoBlocks.startsWith("```html") &&
    fence.twoBlocks.includes("<div>b</div>"),
    JSON.stringify(fence)
  );

  check(
    "[html] 같은 원본을 몇 번 그려도 더 깎이지 않는다",
    Object.keys(fence).filter(k => k.endsWith("Stable")).every(k => fence[k] === true),
    JSON.stringify(fence)
  );

  /* ---- 공개 화면 ---- */

  const viewer = await page.evaluate(async (html) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    await renderPostBodyInto(host, "html", html, null);
    return {
      hasFence: host.textContent.includes("```"),
      hasDesign: Boolean(host.querySelector("h1")),
      keepsBacktick: host.textContent.includes("`백틱`"),
      keepsQuotes: host.textContent.includes('"따옴표"')
    };
  }, HTML_DESIGN_FENCED);

  check(
    "[html] 공개 화면에서 바깥 울타리가 글자로 보이지 않는다",
    viewer.hasFence === false &&
    viewer.hasDesign === true &&
    viewer.keepsBacktick === true &&
    viewer.keepsQuotes === true,
    JSON.stringify(viewer)
  );

  /* ---- HTML 모드의 미리보기 ---- */

  await page.evaluate((html) => {
    postEditorTitle.value = "html test";
    postEditorOOC.value = "[OOC: 이 글은 저장되는 이미지에 들어가면 안 된다]";
    postEditorHtmlContent.value = html;
    setEditorContentMode("html");
  }, HTML_DESIGN_FENCED);
  await page.waitForTimeout(300);

  if (!(await page.evaluate(() => editorPreviewIsOpen()))) {
    await page.click("#postEditorPreviewToggle");
  }
  await page.waitForTimeout(700);

  const panel = await page.evaluate(() => {
    const stage = document.getElementById("postEditorHtmlPreviewStage");
    return {
      toggleVisible: postEditorPreviewToggle.hidden === false,
      exportVisible: postEditorExportButton.hidden === false,
      /* copy(발췌 이미지 복사)는 HTML 모드에 없다 */
      copyVisible: postEditorCopyButton.hidden === false,
      htmlPreviewVisible: document.getElementById("postEditorHtmlPreview").hidden === false,
      /* Quote Preset 발췌 대지와 설정은 숨는다 */
      quoteStage: getComputedStyle(
        document.getElementById("postEditorPreviewStage")).display,
      settings: getComputedStyle(
        document.querySelector(".post-editor-preview-visibility-controls")).display,
      hasFence: (stage?.textContent || "").includes("```"),
      hasDesign: Boolean(stage?.querySelector("h1")),
      /* 캡처 대상 안에 사이트 UI가 없다 */
      siteUi: stage
        ? stage.querySelectorAll(
            ".post-editor-button, .post-editor-toolbar, .post-detail-ooc").length
        : -1,
      oocText: (stage?.textContent || "").includes("OOC"),
      titleText: (stage?.textContent || "").includes("html test"),
      width: stage?.scrollWidth,
      height: stage?.scrollHeight
    };
  });

  check(
    "[html] HTML 모드에서도 발췌 여닫기와 export가 살아 있다(별도 사이트로 보내지 않는다)",
    panel.toggleVisible === true &&
    panel.exportVisible === true &&
    panel.htmlPreviewVisible === true,
    JSON.stringify(panel)
  );

  check(
    "[html] Quote Preset 발췌 대지와 설정은 HTML 모드에서 숨는다(디자인을 덮어쓰지 않는다)",
    panel.quoteStage === "none" &&
    panel.settings === "none" &&
    panel.copyVisible === false,
    JSON.stringify(panel)
  );

  check(
    "[html] 미리보기가 울타리 없이 디자인을 그린다",
    panel.hasFence === false &&
    panel.hasDesign === true &&
    panel.width > 0 &&
    panel.height > 0,
    JSON.stringify(panel)
  );

  check(
    "[html] 캡처 대상 안에 OOC·글 제목·사이트 UI가 없다",
    panel.siteUi === 0 &&
    panel.oocText === false &&
    panel.titleText === false,
    JSON.stringify(panel)
  );

  /* ---- 실제 PNG ---- */

  const shot = await page.evaluate(async () => {
    try {
      const result = await captureEditorHtmlAsBlob();
      const bytes = new Uint8Array(await result.blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      return {
        ok: true,
        width: result.width,
        height: result.height,
        failedImages: result.failedImages,
        capped: result.capped,
        base64: btoa(binary)
      };
    } catch (error) {
      return { ok: false, message: String(error.message) };
    }
  });

  check(
    "[html] 디자인이 PNG로 저장된다",
    shot.ok === true,
    shot.ok ? `${shot.width}×${shot.height}` : shot.message
  );

  if (shot.ok) {
    const png = decodePng(Buffer.from(shot.base64, "base64"));

    const pixel = (x, y) => {
      const at = y * png.stride + x * png.channels;
      return [png.pixels[at], png.pixels[at + 1], png.pixels[at + 2]];
    };

    /* 표시 크기가 아니라 레이아웃 크기 × 배율로 저장된다 */
    check(
      "[html] 모바일 축소 표시가 아니라 목표 해상도로 저장된다",
      png.width === 1200 && png.height === shot.height,
      `${png.width}×${png.height} (레이아웃 ${panel.width}×${panel.height})`
    );

    const colors = new Set();
    for (let y = 0; y < png.height; y += 13) {
      for (let x = 0; x < png.width; x += 13) {
        colors.add(pixel(x, y).join(","));
      }
    }

    check(
      "[html] 저장된 PNG가 빈 이미지가 아니다",
      colors.size > 3,
      `서로 다른 색 ${colors.size}가지`
    );

    /*
      맨 아랫줄이 디자인의 배경색이면 아래가 잘리지 않았다는 뜻이다
      (잘렸다면 캡처 배경인 흰색이 남는다).
    */
    const bottom = pixel(Math.floor(png.width / 2), png.height - 3);

    check(
      "[html] 스크롤 밖 부분까지 포함되고 아래가 잘리지 않는다",
      Math.abs(bottom[0] - 27) <= 6 &&
      Math.abs(bottom[1] - 35) <= 6 &&
      Math.abs(bottom[2] - 51) <= 6,
      `맨 아래 픽셀 ${bottom.join(",")} (디자인 배경 27,35,51)`
    );

    check(
      "[html] 누락 없이 저장됐다고만 말하지 않는다(못 읽은 이미지 수를 센다)",
      shot.failedImages === 0 && shot.capped === false,
      JSON.stringify({ failedImages: shot.failedImages, capped: shot.capped })
    );

    if (process.env.IMORY_HTML_SHOT) {
      const target = path.join(process.env.IMORY_HTML_SHOT, "html-design.png");
      fs.writeFileSync(target, Buffer.from(shot.base64, "base64"));
      console.log(`  INFO  저장된 PNG: ${target}`);
    }
  }

  /* ---- 빈 HTML은 실패 이유를 말한다 ---- */

  const empty = await page.evaluate(async () => {
    postEditorHtmlContent.value = "";
    renderEditorHtmlPreview();
    try {
      await captureEditorHtmlAsBlob();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: String(error.message) };
    }
  });

  check(
    "[html] 저장할 것이 없으면 조용히 성공하지 않고 이유를 말한다",
    empty.ok === false && empty.message.length > 0,
    JSON.stringify(empty)
  );

  /* ---- 저장된 글자는 고치지 않는다 ---- */

  check(
    "[html] 편집창의 HTML 칸에는 저장된 글자가 그대로 보인다(데이터를 덮어쓰지 않는다)",
    (await page.evaluate((html) => {
      postEditorHtmlContent.value = html;
      renderEditorHtmlPreview();
      return postEditorHtmlContent.value;
    }, HTML_DESIGN_FENCED)) === HTML_DESIGN_FENCED
  );

  check("[html] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   RUN
========================================================== */

(async () => {
  const server = await startServer();
  console.log(`정적 서버: http://localhost:${PORT}`);

  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  try {
    if (shouldRun("picker")) await runPicker(browser);
    if (shouldRun("highlight")) await runHighlight(browser);
    if (shouldRun("height")) await runHeight(browser);
    if (shouldRun("rule")) await runRule(browser);
    if (shouldRun("background")) await runBackground(browser);
    if (shouldRun("preset")) await runPreset(browser);
    if (shouldRun("export")) await runExportPixels(browser);
    if (shouldRun("mobile")) await runMobileBackground(browser);
    if (shouldRun("fixed")) await runFixedSize(browser);
    if (shouldRun("gap")) await runRuleGap(browser);
    if (shouldRun("toolbar")) await runToolbar(browser);
    if (shouldRun("excerpt")) await runExcerptPanel(browser);
    if (shouldRun("blocks")) await runBlocks(browser);
    if (shouldRun("html")) await runHtmlImage(browser);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n결과: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
})();
