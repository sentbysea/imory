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

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
};

async function openQuotePanel(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[opts.viewport || "desktop"]
  });
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
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[opts.viewport || "desktop"]
  });
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

  const undoBefore = await page.evaluate(() => editorUndoStack.length);

  await page.click("#postEditorCustomControl");
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

  await page.click("#postEditorCustomControl");
  await page.waitForSelector(".imory-color-picker", { state: "visible" });

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

  await page.click("#postEditorCustomControl");
  await page.waitForSelector(".imory-color-picker", { state: "visible" });

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
  await page.click("#postEditorCustomControl");
  await page.waitForSelector(".imory-color-picker", { state: "visible" });
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

  check(
    "[rule] 옵션을 켜면 대사 문단에만 자동으로 붙는다",
    autoBoxes.length === 1 &&
    autoBoxes[0].text.startsWith('"대사') &&
    autoBoxes[0].width === "5px" &&
    autoBoxes[0].color === "rgb(102, 170, 136)",
    JSON.stringify(autoBoxes)
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
    const s = getComputedStyle(source);
    return {
      width: s.borderLeftWidth,
      color: s.borderLeftColor,
      padding: s.paddingLeft
    };
  });

  check(
    "[rule] 출처에도 강조선을 켜고 색을 바꿀 수 있다",
    sourceRule.width === "4px" &&
    sourceRule.color === "rgb(119, 136, 238)" &&
    sourceRule.padding === "12px",
    JSON.stringify(sourceRule)
  );

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
    "[background] 프리뷰 위에 상시 버튼이 없다(진입점은 바깥의 버튼 하나)",
    await page.evaluate(() => {
      const pageEl = VISIBLE_PAGE_FN();
      return pageEl.querySelectorAll("button").length === 0 &&
        document.getElementById("postEditorPreviewBackgroundPanel").hidden === true;
    })
  );

  /*
    ★ 상자는 끌 때마다 다시 잰다 — background 패널을 펼치면 그
    높이만큼 프리뷰가 아래로 밀려서, 미리 재둔 좌표는 페이지
    바깥을 가리키게 된다.
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

  await page.click("#postEditorPreviewBackgroundToggle");
  await page.waitForTimeout(150);
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

  const legacy = await page.evaluate(() => {
    const old = {
      bodySize: 15,
      paragraphSpacing: 0,
      legacyUnknown: "그대로"
    };

    applyQuoteSettings(old);
    const collected = collectQuoteSettings();

    return {
      highlightHeight: collected.highlightHeight,
      dialogueRuleEnabled: collected.dialogueRuleEnabled,
      sourceRuleEnabled: collected.sourceRuleEnabled,
      backgroundImageUrl: collected.backgroundImageUrl,
      backgroundOverlayOpacity: collected.backgroundOverlayOpacity,
      unknown: collected.legacyUnknown
    };
  });

  check(
    "[preset] 값이 없던 옛 프리셋은 예전과 같은 외형으로 읽힌다",
    legacy.highlightHeight === 100 &&
    legacy.dialogueRuleEnabled === false &&
    legacy.sourceRuleEnabled === false &&
    legacy.backgroundImageUrl === "" &&
    legacy.backgroundOverlayOpacity === 0,
    JSON.stringify(legacy)
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

  /* ---- (4) 슬라이더가 실제로 값을 바꾼다 ---- */

  await page.evaluate(() => {
    const input = document.getElementById("quoteHighlightHeight");
    input.value = "70";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  check(
    "[preset] 높이 슬라이더가 수집값과 표시에 함께 반영된다",
    await page.evaluate(() =>
      collectQuoteSettings().highlightHeight === 70 &&
      document.getElementById("quoteHighlightHeightValue").textContent === "70%" &&
      document.getElementById("quoteHighlightHeight")
        .style.getPropertyValue("--imory-range-fill") !== "")
  );

  check(
    "[preset] 슬라이더가 공용 컴포넌트(.imory-range)를 쓴다",
    await page.evaluate(() =>
      Array.from(document.querySelectorAll(".quote-controls input[type=range]"))
        .every(n => n.classList.contains("imory-range")) &&
      document.querySelectorAll(".quote-controls input[type=range]").length >= 6)
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
  }

  return result;
};


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

    return page.evaluate(CAPTURE_AND_MEASURE, {
      countMixed: true,
      colors: {
        red: { rgb: [255, 0, 0], tolerance: 30 },
        blue: { rgb: [0, 0, 255], tolerance: 30 },
        white: { rgb: [255, 255, 255], tolerance: 6 }
      }
    });
  };

  const sharp = await measureBlur(0);
  const blurry = await measureBlur(24);

  check(
    "[export] 흐림이 저장 이미지에도 실제로 적용된다(html2canvas는 CSS filter를 못 읽는다)",
    blurry.mixed > sharp.mixed * 5 && blurry.mixed > 2000,
    JSON.stringify({sharp:{mixed:sharp.mixed,counts:sharp.counts},blurry:{mixed:blurry.mixed,counts:blurry.counts}})
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
    panelHidden:
      document.getElementById("postEditorPreviewBackgroundPanel").hidden,
    focus: previewBackgroundFocusX,
    zoom: mobilePreviewZoom,
    panX: mobilePreviewPanX
  }));

  check(
    "[mobile] 평소에는 터치가 배경을 움직이지 않고 기존 제스처도 그대로다",
    idle.moveClass === false &&
    idle.panelHidden === true &&
    idle.focus === beforeIdleDrag.focus &&
    idle.zoom === beforeIdleDrag.zoom,
    JSON.stringify(idle)
  );

  /* 조정 모드로 들어가 터치로 끌어본다 */

  await page.click("#postEditorPreviewBackgroundToggle");
  await page.waitForTimeout(150);
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
      message => !/setPointerCapture/.test(message)
    );

  check("[mobile] 오류 없음", realErrors.length === 0, realErrors.join(" | "));
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
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n결과: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
})();
