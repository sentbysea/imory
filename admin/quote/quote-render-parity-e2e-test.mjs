/* =========================================================
   QUOTE PRESET ↔ 에디터 PREVIEW 렌더 일치 E2E

   기준 문서: IMORY_QUOTE_PRESET_RENDER_AUDIT.md

   저장소의 실제 admin/index.html · index.html · 실제 CSS/JS를
   그대로 띄우고 Supabase 네트워크만 mock한다(다른 e2e와 같은
   규약). 두 화면을 **같은 콘텐츠 · 같은 settings · 같은 출력
   조건**으로 그려 놓고 좌표를 재서 비교한다.

   확인 범위

     paragraph  문단 간격이 프리셋의 paragraphSpacing을 실제로
                따르는가. 일반 줄바꿈 / 문단 구분 / 의도적인
                연속 빈 줄 / PAGE break를 구분하는가. 인라인
                서식(굵게·기울임·형광펜·강조색)과 사진 앞뒤
                문단이 보존되는가.
     parity     두 미리보기의 본문 폭 · 줄바꿈 위치 · 문단 간격 ·
                제목/출처 자리 · 페이지 수가 같은가(Desktop /
                Mobile 에뮬레이션).
     legacy     설정이 일부 빠진 옛 프리셋: 열기 → 저장 → 다시
                열기에서 값이 바뀌지 않는가. 알 수 없는 필드와
                명시적 0이 살아남는가.
     export     고정 비율 · auto · uniform export의 실제 픽셀
                크기와, 출력 너비를 바꿔도 줄바꿈/페이지 수가
                그대로인지.
     published  발행된 글 본문(공용 함수를 쓰는 쪽)의 문단 간격.
     uniform    uniform이 auto와 **같은 분할**을 쓰는가(페이지
                수 · 각 장의 글자 · 사진 자리), 가장 높은
                페이지의 높이로 통일되는가, 짧아지면 줄어드는가,
                본문이 제목·출처를 뺀 영역의 가운데에 오는가.
     options    출력 조건 UI(uniform/auto/custom · 출력 너비)의
                초기값과 상태 보존 — 프리셋의 고정 비율이
                custom으로 오는가, 접었다 펴도 유지되는가, 다른
                글로 가면 새로 시작하는가, gallery 숨김 유지.
     cache      이번 라운드의 공용 렌더러/스타일이 두 문서에서
                같은 배포 버전으로 한 번씩 요청되는가(실제 요청
                URL).
     labels     Quote Preset의 한국어 라벨 — 큰 탭·구역 제목은 영어,
                그 아래 설정명·선택값·동작 버튼은 한국어, 잘림/가로
                넘침 없음(모바일은 탭마다), 저장값(enum·키) 불변.
     panel      Preview 여닫기 버튼(일반 흐름의 고스트 버튼 ·
                데스크톱/모바일 공통 · aria-expanded/controls ·
                라벨)과 패널 정리(중복 제목·닫기 × 없음 · 세로
                정렬과 상세 비율이 custom에서만 보임 · 접은 채로
                export).

   ★ 실행
     node admin/quote/quote-render-parity-e2e-test.mjs
     node admin/quote/quote-render-parity-e2e-test.mjs --only=parity
     node admin/quote/quote-render-parity-e2e-test.mjs --only=uniform
     node admin/quote/quote-render-parity-e2e-test.mjs --browser=webkit

   ★ 웹폰트(Pretendard / Nanum Myeongjo)는 다른 e2e와 마찬가지로
   막는다. 두 화면이 **같은 대체 폰트**를 쓰므로 일치 판정에는
   영향이 없다(절대 글자 폭은 production과 다를 수 있다).
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PORT = 8950;
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
   1. paragraph — 문단 간격의 기준
========================================================== */

async function runParagraph(browser) {
  console.log("\n[paragraph] 문단 간격이 paragraphSpacing을 따르는가");

  const { ctx, page, errors } = await openPostEditor(browser);

  const lineStep = BASE_SETTINGS.bodySize * BASE_SETTINGS.lineHeight;

  /* -------------------------------------------------------
     (1) 0 · 여러 양수 값
  -------------------------------------------------------- */
  for (const spacing of [0, 7, 14, 28, 40]) {
    await renderEditorPreview(page, {
      html: "첫 번째 문단입니다.<br><br>두 번째 문단입니다.",
      settings: { ...BASE_SETTINGS, ratio: "auto", paragraphSpacing: spacing },
      title: ""
    });

    const { pages } = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");
    const gap = pages[0].gaps[0];

    check(
      `[paragraph ${spacing}] 문단 사이가 (줄 높이 + ${spacing})이다`,
      near(gap, lineStep + spacing, 1.2),
      `실측 ${gap}px / 기대 ${(lineStep + spacing).toFixed(1)}px`
    );

    check(
      `[paragraph ${spacing}] 간격 블록의 높이가 설정값 그대로다`,
      pages[0].paragraphGaps.length === 1 &&
      near(pages[0].paragraphGaps[0], spacing, 0.6),
      JSON.stringify(pages[0].paragraphGaps)
    );
  }

  /* -------------------------------------------------------
     (2) 일반 줄바꿈 / 문단 구분 / 연속 빈 줄
  -------------------------------------------------------- */
  {
    await renderEditorPreview(page, {
      html: "한 줄<br>다음 줄<br><br>새 문단<br><br><br>빈 줄 하나 더",
      settings: { ...BASE_SETTINGS, ratio: "auto", paragraphSpacing: 14 },
      title: ""
    });

    const { pages } = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");
    const g = pages[0].gaps;

    check(
      "[paragraph kinds] 일반 줄바꿈은 줄 높이 그대로다",
      near(g[0], lineStep, 1.2),
      `${g[0]}px / ${lineStep}px`
    );

    check(
      "[paragraph kinds] 문단 구분은 줄 높이 + 14다",
      near(g[1], lineStep + 14, 1.2),
      `${g[1]}px / ${(lineStep + 14).toFixed(1)}px`
    );

    check(
      "[paragraph kinds] 연속 빈 줄은 문단 간격 + 빈 줄 하나로 남는다",
      near(g[2], lineStep * 2 + 14, 1.6),
      `${g[2]}px / ${(lineStep * 2 + 14).toFixed(1)}px`
    );

    check(
      "[paragraph kinds] 남은 <br>이 지워지지 않는다",
      pages[0].brCount === 2 && pages[0].paragraphGaps.length === 2,
      `br ${pages[0].brCount} / gap ${pages[0].paragraphGaps.length}`
    );
  }

  /* -------------------------------------------------------
     (3) PAGE break는 그대로 장을 나눈다
  -------------------------------------------------------- */
  {
    await renderEditorPreview(page, {
      html:
        "앞장 글<br><br>" +
        '<div class="post-editor-page-break" data-page-break="true" contenteditable="false">PAGE BREAK</div>' +
        "뒷장 글",
      settings: { ...BASE_SETTINGS, ratio: "auto", paragraphSpacing: 14 },
      title: ""
    });

    const geometry = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

    check(
      "[paragraph pagebreak] PAGE break는 여전히 장을 나눈다",
      geometry.pageCount === 2,
      `${geometry.pageCount}장`
    );

    /* 첫 글자가 본문 첫 줄 안에 있어야 한다 — 빈 줄이나 문단
       간격 블록이 앞에 끼면 한 줄 이상 밀린다. 글자 rect는 줄
       상자보다 작아서 몇 px 아래에서 시작하므로 줄 높이의 70%를
       경계로 본다. */
    check(
      "[paragraph pagebreak] 새 장이 빈 줄/간격으로 시작하지 않는다",
      geometry.pages[1].lines[0]?.text === "뒷장 글" &&
      geometry.pages[1].lines[0].top - geometry.pages[1].bodyTop <
        lineStep * 0.7 &&
      geometry.pages[1].paragraphGaps.length === 0,
      `${JSON.stringify(geometry.pages[1].lineTexts)} ` +
      `top ${geometry.pages[1].lines[0]?.top} / body ${geometry.pages[1].bodyTop}`
    );
  }

  /* -------------------------------------------------------
     (4) 인라인 서식 · 사진 앞뒤 문단
  -------------------------------------------------------- */
  {
    await renderEditorPreview(page, {
      html:
        "<b>굵게</b>와 <i>기울임</i>이 있는 문단<br><br>" +
        '<span class="post-inline-highlight" data-highlight="#f4dce6" style="background-color: #f4dce6;">형광펜</span>' +
        '과 <span class="post-inline-color" data-point-color="#5c7cfa" style="color: #5c7cfa;">강조색</span>' +
        "<br><br>*지문이다*<br><br>\"대사다\"",
      settings: { ...BASE_SETTINGS, ratio: "auto", paragraphSpacing: 20 },
      title: ""
    });

    const { pages } = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

    check(
      "[paragraph inline] 굵게/기울임/형광펜/강조색이 그대로 남는다",
      pages[0].boldCount === 1 && pages[0].italicCount === 1 &&
      pages[0].highlightCount === 1 && pages[0].pointCount === 1,
      JSON.stringify({
        b: pages[0].boldCount, i: pages[0].italicCount,
        hl: pages[0].highlightCount, pc: pages[0].pointCount
      })
    );

    check(
      "[paragraph inline] 지문/대사도 그대로 처리된다",
      pages[0].actionCount >= 1 && pages[0].dialogueCount >= 1,
      JSON.stringify({ action: pages[0].actionCount, dialogue: pages[0].dialogueCount })
    );

    check(
      "[paragraph inline] 문단 간격 블록이 문단 수만큼 생긴다",
      pages[0].paragraphGaps.length === 3 &&
      pages[0].paragraphGaps.every(h => near(h, 20, 0.6)),
      JSON.stringify(pages[0].paragraphGaps)
    );
  }

  {
    /* 사진 앞뒤 문단 — 사진을 쪼개지 않고, 앞뒤 간격도 유지 */
    await renderEditorPreview(page, {
      html:
        "사진 앞 문단<br><br>" +
        '<img data-imory-image="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" ' +
        'src="/api/post-cover?image=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" alt="">' +
        "<br><br>사진 뒤 문단",
      settings: { ...BASE_SETTINGS, ratio: "auto", paragraphSpacing: 18 },
      title: ""
    });

    const { pages } = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

    check(
      "[paragraph image] 사진 앞뒤 문단이 모두 남는다",
      pages[0].lineTexts.join(" ").includes("사진 앞 문단") &&
      pages[0].lineTexts.join(" ").includes("사진 뒤 문단"),
      JSON.stringify(pages[0].lineTexts)
    );

    check(
      "[paragraph image] 사진 앞뒤 문단 경계가 간격 블록으로 남는다",
      pages[0].paragraphGaps.length === 2,
      JSON.stringify(pages[0].paragraphGaps)
    );
  }

  /* -------------------------------------------------------
     (5) 고치기 전과의 차이

     예전 렌더는 <br>에 height가 안 먹어서 문단 사이가 설정과
     무관하게 **줄 높이 두 개**로 고정이었다(감사 §2.3). 지금
     코드에 paragraphSpacing = 줄 높이를 넣으면 그 옛 간격
     (줄 높이 × 2)이 그대로 재현되므로, 같은 본문으로 두 값을
     돌려 보면 "간격과 페이지 수가 실제로 얼마나 달라지는가"를
     잴 수 있다.
  -------------------------------------------------------- */
  {
    const lines = [];
    for (let i = 0; i < 8; i += 1) {
      lines.push(
        `${i + 1}번째 문단이다. 창가 자리에 앉은 그는 오래 식은 커피를 ` +
        "앞에 두고 창밖을 오래도록 바라보고 있었다."
      );
      lines.push("");
    }
    const html = lines.join("<br>").replace(/<br>$/, "");

    const measure = async (spacing) => {
      await renderEditorPreview(page, {
        html,
        settings: {
          ...BASE_SETTINGS, ratio: "4:5", paragraphSpacing: spacing
        },
        title: ""
      });
      const g = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");
      return {
        pageCount: g.pageCount,
        gap: g.pages[0].gaps.find(value => value > lineStep + 0.5) || null,
        firstPageLines: g.pages[0].lines.length
      };
    };

    const before = await measure(lineStep);
    const after = await measure(14);

    check(
      "[paragraph before/after] 옛 간격(줄 높이 두 개)이 재현된다",
      near(before.gap, lineStep * 2, 1.2),
      `${before.gap}px / ${(lineStep * 2).toFixed(1)}px`
    );

    check(
      "[paragraph before/after] 설정값(14)으로 간격이 줄어든다",
      near(after.gap, lineStep + 14, 1.2),
      `${before.gap}px → ${after.gap}px`
    );

    check(
      "[paragraph before/after] 한 장에 더 들어가고 페이지 수가 줄어든다",
      after.firstPageLines > before.firstPageLines &&
      after.pageCount <= before.pageCount,
      `1장 줄 수 ${before.firstPageLines} → ${after.firstPageLines} · ` +
      `페이지 ${before.pageCount}장 → ${after.pageCount}장`
    );
  }

  check("[paragraph] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   2. parity — 두 미리보기 일치
========================================================== */

async function runParity(browser) {
  console.log("\n[parity] Quote Preset 미리보기 ↔ 에디터 PREVIEW");

  for (const viewport of ["desktop", "mobile"]) {
    for (const ratio of ["4:5", "auto"]) {
      const settings = { ...BASE_SETTINGS, ratio };

      const editor = await openPostEditor(browser, { viewport });
      await renderEditorPreview(editor.page, {
        html: SAMPLE_HTML, settings, title: "발췌 테스트"
      });
      const editorGeometry =
        await editor.page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

      const quote = await openQuotePanel(browser, { viewport });
      await renderQuotePreview(quote.page, {
        sample: SAMPLE_TEXT, settings, title: "발췌 테스트"
      });
      const quoteGeometry =
        await quote.page.evaluate(READ_GEOMETRY, "#quotePreviewCanvas");

      const tag = `${viewport} ${ratio}`;
      const e0 = editorGeometry.pages[0];
      const q0 = quoteGeometry.pages[0];

      check(
        `[parity ${tag}] 본문 가용 너비가 같다`,
        e0.bodyWidth === q0.bodyWidth,
        `editor ${e0.bodyWidth} / quote ${q0.bodyWidth}`
      );

      check(
        `[parity ${tag}] 페이지 높이가 같다`,
        near(e0.offsetHeight, q0.offsetHeight, 1),
        `editor ${e0.offsetHeight} / quote ${q0.offsetHeight}`
      );

      check(
        `[parity ${tag}] 줄바꿈 위치가 글자 단위로 같다`,
        JSON.stringify(e0.lineTexts) === JSON.stringify(q0.lineTexts),
        `editor ${JSON.stringify(e0.lineTexts.slice(0, 3))} / ` +
        `quote ${JSON.stringify(q0.lineTexts.slice(0, 3))}`
      );

      check(
        `[parity ${tag}] 문단 간격이 같다`,
        JSON.stringify(e0.paragraphGaps) === JSON.stringify(q0.paragraphGaps) &&
        e0.paragraphGaps.length > 0,
        `editor ${JSON.stringify(e0.paragraphGaps)} / quote ${JSON.stringify(q0.paragraphGaps)}`
      );

      check(
        `[parity ${tag}] 본문 시작 y가 같다`,
        near(e0.bodyTop, q0.bodyTop, 0.6),
        `editor ${e0.bodyTop} / quote ${q0.bodyTop}`
      );

      check(
        `[parity ${tag}] 출처 자리가 같다`,
        near(e0.sourceTop, q0.sourceTop, 0.6) &&
        e0.sourceText === q0.sourceText,
        `editor ${e0.sourceTop} / quote ${q0.sourceTop}`
      );

      check(
        `[parity ${tag}] 페이지 수가 같다`,
        editorGeometry.pageCount === quoteGeometry.pageCount,
        `editor ${editorGeometry.pageCount} / quote ${quoteGeometry.pageCount}`
      );

      check(
        `[parity ${tag}] 어느 쪽도 내용을 잘라내지 않는다`,
        editorGeometry.pages.every(p => !p.overflowing) &&
        quoteGeometry.pages.every(p => !p.overflowing)
      );

      /* 눈으로 볼 화면이 필요하면 IMORY_QUOTE_SHOT=<디렉터리> */
      if (process.env.IMORY_QUOTE_SHOT) {
        fs.mkdirSync(process.env.IMORY_QUOTE_SHOT, { recursive: true });
        await quote.page.screenshot({
          path: path.join(
            process.env.IMORY_QUOTE_SHOT,
            `quote-${viewport}-${ratio.replace(":", "x")}.png`
          ),
          fullPage: viewport === "desktop"
        });
        await editor.page.screenshot({
          path: path.join(
            process.env.IMORY_QUOTE_SHOT,
            `editor-${viewport}-${ratio.replace(":", "x")}.png`
          )
        });
      }

      if (quoteGeometry.pageCount > 1) {
        const pagination = await quote.page.evaluate(() => ({
          hidden: document.getElementById("quotePreviewPagination").hidden,
          label: document.getElementById("quotePreviewPageIndicator").textContent.trim()
        }));
        check(
          `[parity ${tag}] 넘친 샘플은 페이지 이동으로 볼 수 있다`,
          pagination.hidden === false && /^1 \/ \d+$/.test(pagination.label),
          JSON.stringify(pagination)
        );
      }

      check(
        `[parity ${tag}] 오류 없음`,
        editor.errors.length === 0 && quote.errors.length === 0,
        [...editor.errors, ...quote.errors].join(" | ")
      );

      await editor.ctx.close();
      await quote.ctx.close();
    }
  }

  /* 제목을 켠 경우도 한 번 — 제목 자리와 본문 시작이 같은지 */
  {
    const settings = {
      ...BASE_SETTINGS, ratio: "4:5", titleEnabled: true, titleSpacing: 28
    };

    const editor = await openPostEditor(browser);
    await renderEditorPreview(editor.page, {
      html: SAMPLE_HTML, settings, title: "비 오는 날"
    });
    const e = await editor.page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

    const quote = await openQuotePanel(browser);
    await renderQuotePreview(quote.page, {
      sample: SAMPLE_TEXT, settings, title: "비 오는 날"
    });
    const q = await quote.page.evaluate(READ_GEOMETRY, "#quotePreviewCanvas");

    check(
      "[parity title] 제목 자리가 같다",
      near(e.pages[0].titleTop, q.pages[0].titleTop, 0.6),
      `editor ${e.pages[0].titleTop} / quote ${q.pages[0].titleTop}`
    );

    check(
      "[parity title] 제목 아래 본문 시작이 같다",
      near(e.pages[0].bodyTop, q.pages[0].bodyTop, 0.6),
      `editor ${e.pages[0].bodyTop} / quote ${q.pages[0].bodyTop}`
    );

    check(
      "[parity title] 이어지는 장에는 제목이 없다",
      e.pageCount > 1
        ? e.pages[1].titleTop === null && q.pages[1].titleTop === null
        : true,
      `${e.pageCount}장`
    );

    await editor.ctx.close();
    await quote.ctx.close();
  }

  /* -------------------------------------------------------
     넘치는 샘플 — 잘라내지 않고 장을 나누고, 프리셋 미리보기도
     그 장을 실제로 넘겨볼 수 있어야 한다.
  -------------------------------------------------------- */
  {
    const settings = { ...BASE_SETTINGS, ratio: "4:5" };
    const longLines = [];
    for (let i = 0; i < 8; i += 1) {
      longLines.push(
        `${i + 1}번째 문단이다. 창가 자리에 앉은 그는 오래 식은 커피를 ` +
        "앞에 두고 창밖을 오래도록 바라보고 있었다."
      );
      longLines.push("");
    }
    const longText = longLines.join("\n").replace(/\n$/, "");
    const longHtml = longLines.join("<br>").replace(/<br>$/, "");

    const editor = await openPostEditor(browser);
    await renderEditorPreview(editor.page, {
      html: longHtml, settings, title: "긴 샘플"
    });
    const e = await editor.page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

    const quote = await openQuotePanel(browser);
    await renderQuotePreview(quote.page, {
      sample: longText, settings, title: "긴 샘플"
    });
    const q = await quote.page.evaluate(READ_GEOMETRY, "#quotePreviewCanvas");

    check(
      "[parity overflow] 두 화면이 같은 수의 장으로 나뉜다",
      e.pageCount === q.pageCount && e.pageCount > 1,
      `editor ${e.pageCount} / quote ${q.pageCount}`
    );

    check(
      "[parity overflow] 장마다 들어간 줄이 같다",
      JSON.stringify(e.pages.map(p => p.lineTexts)) ===
      JSON.stringify(q.pages.map(p => p.lineTexts)),
      `editor ${e.pages.map(p => p.lines.length).join("/")} · ` +
      `quote ${q.pages.map(p => p.lines.length).join("/")}`
    );

    check(
      "[parity overflow] 프리셋 미리보기가 내용을 잘라내지 않는다",
      q.pages.every(p => !p.overflowing)
    );

    const nav = await quote.page.evaluate(() => {
      const label = () =>
        document.getElementById("quotePreviewPageIndicator").textContent.trim();
      const before = label();
      document.getElementById("quotePreviewNext").click();
      const after = label();
      const visible = Array.from(
        document.querySelectorAll("#quotePreviewCanvas .post-editor-preview-page")
      ).filter(node => !node.hidden).length;
      return { before, after, visible };
    });

    check(
      "[parity overflow] 다음 장으로 넘길 수 있다",
      nav.before === `1 / ${q.pageCount}` &&
      nav.after === `2 / ${q.pageCount}` &&
      nav.visible === 1,
      JSON.stringify(nav)
    );

    await editor.ctx.close();
    await quote.ctx.close();
  }

  /* -------------------------------------------------------
     표시 배율 — 레이아웃은 이미 같으므로, 남은 것은 "같은 표시
     너비에서 나란히 볼 수 있는가"뿐이다. 축소는 contain이어야
     하고(비율 왜곡·세로 잘림 없음), 모바일에서 두 화면의 배율이
     크게 벌어지면 안 된다.
  -------------------------------------------------------- */
  {
    const settings = { ...BASE_SETTINGS, ratio: "4:5" };

    const editor = await openPostEditor(browser, { viewport: "mobile" });
    await renderEditorPreview(editor.page, {
      html: SAMPLE_HTML, settings, title: "발췌 테스트"
    });
    const editorScale = await editor.page.evaluate(() => {
      const host = document.getElementById("postEditorPreviewPages");
      const page = host.querySelector(".post-editor-preview-page:not([hidden])");
      return {
        displayWidth: page.getBoundingClientRect().width,
        displayHeight: page.getBoundingClientRect().height,
        layoutWidth: page.offsetWidth,
        layoutHeight: page.offsetHeight
      };
    });

    const quote = await openQuotePanel(browser, { viewport: "mobile" });
    await renderQuotePreview(quote.page, {
      sample: SAMPLE_TEXT, settings, title: "발췌 테스트"
    });
    const quoteScale = await quote.page.evaluate(() => {
      const page = document.querySelector(
        "#quotePreviewCanvas .post-editor-preview-page:not([hidden])"
      );
      const stage = document.getElementById("quotePreviewStage");
      return {
        displayWidth: page.getBoundingClientRect().width,
        displayHeight: page.getBoundingClientRect().height,
        layoutWidth: page.offsetWidth,
        layoutHeight: page.offsetHeight,
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight
      };
    });

    const aspect = (v) => v.displayWidth / v.displayHeight;

    check(
      "[parity scale] 프리셋 미리보기의 축소가 비율을 왜곡하지 않는다",
      near(
        aspect(quoteScale),
        quoteScale.layoutWidth / quoteScale.layoutHeight,
        0.01
      ),
      `${quoteScale.displayWidth.toFixed(1)}×${quoteScale.displayHeight.toFixed(1)}`
    );

    check(
      "[parity scale] 캔버스 전체가 대지 안에 들어간다(세로를 잘라내지 않는다)",
      quoteScale.displayWidth <= quoteScale.stageWidth + 1 &&
      quoteScale.displayHeight <= quoteScale.stageHeight + 1,
      `${quoteScale.displayWidth.toFixed(1)}×${quoteScale.displayHeight.toFixed(1)} / ` +
      `stage ${quoteScale.stageWidth}×${quoteScale.stageHeight}`
    );

    check(
      "[parity scale] 모바일에서 두 화면을 비슷한 크기로 나란히 볼 수 있다",
      quoteScale.displayWidth >= editorScale.displayWidth * 0.75,
      `quote ${quoteScale.displayWidth.toFixed(1)}px / ` +
      `editor ${editorScale.displayWidth.toFixed(1)}px`
    );

    await editor.ctx.close();
    await quote.ctx.close();
  }
}


/* =========================================================
   3. legacy — 설정이 일부 빠진 프리셋 왕복
========================================================== */

async function runLegacy(browser) {
  console.log("\n[legacy] 설정이 빠진 옛 프리셋: 열기 → 저장 → 다시 열기");

  /* 일부러 비운 필드 + 이 화면이 모르는 필드 + 명시적 0 */
  const LEGACY = {
    ratio: "4:5",
    bodySize: 15,
    paragraphSpacing: 0,
    padding: 0,
    letterSpacing: 0,
    sourceText: "@legacy",
    futureField: { keepMe: true },
    legacyUnknown: "그대로 남아야 한다"
  };

  const db = makeDb({
    quote_presets: [{
      id: 7, user_id: OWNER_ID, name: "Legacy", is_active: true,
      settings: { ...LEGACY }
    }]
  });

  const requests = [];
  const { ctx, page, errors } = await openQuotePanel(browser, { db, recorder: requests });

  await page.waitForTimeout(600);

  const opened = await page.evaluate(() => ({
    bodySize: document.getElementById("quoteFontSize").value,
    paragraphSpacing: document.getElementById("quoteParagraphSpacing").value,
    padding: document.getElementById("quotePadding").value,
    lineHeight: document.getElementById("quoteLineHeight").value,
    bodyColor: document.getElementById("quoteTextColor").value,
    bodyWeight: document.getElementById("quoteBodyWeight").value,
    collected: collectQuoteSettings()
  }));

  check(
    "[legacy] 명시적으로 저장된 0이 기본값으로 되살아나지 않는다",
    opened.paragraphSpacing === "0" && opened.padding === "0",
    JSON.stringify({
      paragraphSpacing: opened.paragraphSpacing, padding: opened.padding
    })
  );

  check(
    "[legacy] 저장돼 있던 값은 그대로 보인다",
    opened.bodySize === "15",
    opened.bodySize
  );

  check(
    "[legacy] 빠진 값은 공용 정규화 기본값으로 채워진다",
    opened.lineHeight === "1.9" &&
    opened.bodyColor === "#555555" &&
    opened.bodyWeight === "400",
    JSON.stringify({
      lineHeight: opened.lineHeight,
      bodyColor: opened.bodyColor,
      bodyWeight: opened.bodyWeight
    })
  );

  check(
    "[legacy] 폼에 채운 값을 그대로 다시 수집한다(왕복이 값을 바꾸지 않는다)",
    opened.collected.paragraphSpacing === 0 &&
    opened.collected.padding === 0 &&
    opened.collected.bodySize === 15 &&
    opened.collected.lineHeight === 1.9 &&
    opened.collected.bodyColor === "#555555" &&
    opened.collected.bodyWeight === "400",
    JSON.stringify({
      paragraphSpacing: opened.collected.paragraphSpacing,
      padding: opened.collected.padding,
      bodySize: opened.collected.bodySize,
      lineHeight: opened.collected.lineHeight
    })
  );

  check(
    "[legacy] 알 수 없는 필드가 보존된다",
    opened.collected.legacyUnknown === "그대로 남아야 한다" &&
    opened.collected.futureField?.keepMe === true,
    JSON.stringify({
      legacyUnknown: opened.collected.legacyUnknown,
      futureField: opened.collected.futureField
    })
  );

  /*
    출력 조건(비율 · 내보내기 너비)을 고치는 자리는 이 화면
    하나뿐이다 — 입력칸이 실제로 보여야 한다. 서식 입력도
    그대로 보여야 한다.
  */
  const canvasUi = await page.evaluate(() => {
    const visible = (id) => {
      const node = document.getElementById(id);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    return {
      outputExists: Boolean(document.getElementById("quoteCanvasOutput")),
      ratioButtons: visible("quoteRatioButtons"),
      exportWidth: visible("quoteWidth"),
      ratioWidthField: visible("quoteRatioWidth"),
      modes: Array.from(
        document.querySelectorAll("#quoteRatioButtons .quote-ratio-button")
      ).map(button => button.dataset.ratio),
      pressed: Array.from(
        document.querySelectorAll("#quoteRatioButtons .quote-ratio-button")
      ).filter(button => button.classList.contains("active"))
        .map(button => button.dataset.ratio),
      background: visible("quoteBackground"),
      padding: visible("quotePadding"),
      /* BODY 아코디언은 접혀 있을 수 있다 — 존재만 본다 */
      paragraphExists: Boolean(
        document.getElementById("quoteParagraphSpacing")
      )
    };
  });

  check(
    "[legacy] Quote Preset의 CANVAS에서 비율·내보내기 너비를 고칠 수 있다",
    canvasUi.outputExists === true &&
    canvasUi.ratioButtons === true &&
    canvasUi.exportWidth === true,
    JSON.stringify(canvasUi)
  );

  check(
    "[legacy] 비율 옵션이 uniform / auto / custom 셋이다",
    JSON.stringify(canvasUi.modes) ===
      JSON.stringify(["uniform", "auto", "custom"]),
    JSON.stringify(canvasUi.modes)
  );

  check(
    "[legacy] 옛 고정 비율(4:5)은 custom으로 눌리고 상세 비율이 보인다",
    JSON.stringify(canvasUi.pressed) === JSON.stringify(["custom"]) &&
    canvasUi.ratioWidthField === true,
    JSON.stringify(canvasUi)
  );

  check(
    "[legacy] 서식 입력(배경·여백·문단 간격)은 그대로 남아 있다",
    canvasUi.background === true &&
    canvasUi.padding === true &&
    canvasUi.paragraphExists === true,
    JSON.stringify(canvasUi)
  );

  /*
    ★ 옛 고정 비율은 **custom + 가로 비/세로 비**로 들어온다.
    문자열은 바뀌지만 그리는 캔버스는 같다 — 값이 사라지거나
    다른 비율이 되면 안 된다.
  */
  check(
    "[legacy] 옛 고정 비율(4:5)이 custom 4:5로 손실 없이 들어온다",
    opened.collected.ratio === "custom" &&
    Number(opened.collected.ratioWidth) === 4 &&
    Number(opened.collected.ratioHeight) === 5 &&
    Number(opened.collected.exportWidth) > 0,
    JSON.stringify({
      ratio: opened.collected.ratio,
      ratioWidth: opened.collected.ratioWidth,
      ratioHeight: opened.collected.ratioHeight,
      exportWidth: opened.collected.exportWidth
    })
  );

  /* 실제로 저장 → DB에 들어간 값을 다시 열기 */
  await page.click("#quoteSaveButton");
  await page.waitForTimeout(900);

  const saved = db.quote_presets.find(p => p.id === 7)?.settings || {};

  check(
    "[legacy] 저장된 값이 폼에 보이던 값과 같다",
    saved.paragraphSpacing === 0 && saved.padding === 0 &&
    saved.bodySize === 15 && saved.lineHeight === 1.9,
    JSON.stringify({
      paragraphSpacing: saved.paragraphSpacing, padding: saved.padding,
      bodySize: saved.bodySize, lineHeight: saved.lineHeight
    })
  );

  check(
    "[legacy] 저장이 알 수 없는 필드를 지우지 않는다",
    saved.legacyUnknown === "그대로 남아야 한다" &&
    saved.futureField?.keepMe === true,
    JSON.stringify({ legacyUnknown: saved.legacyUnknown, futureField: saved.futureField })
  );

  const reopened = await page.evaluate((settings) => {
    applyQuoteSettings(settings);
    return collectQuoteSettings();
  }, saved);

  check(
    "[legacy] 다시 열어 수집해도 값이 또 바뀌지 않는다",
    JSON.stringify(reopened) === JSON.stringify(saved),
    Object.keys(reopened)
      .filter(k => JSON.stringify(reopened[k]) !== JSON.stringify(saved[k]))
      .join(", ") || "차이 없음"
  );

  check("[legacy] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   4. export — 출력 픽셀 크기
========================================================== */

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function collectExportedPngs(page, options = {}) {
  const files = [];
  page.on("download", async (download) => {
    const target = path.join(
      os.tmpdir(),
      `imory-parity-${Date.now()}-${files.length}.png`
    );
    await download.saveAs(target);
    files.push(fs.readFileSync(target));
    fs.unlinkSync(target);
  });

  /*
    발췌가 접혀 있으면 export 버튼 자체가 숨는다(2026-09-12).
    그 상태에서도 캡처 경로가 살아 있는지 보려면 버튼을 누르는
    대신 같은 핸들러를 직접 부른다 —
    forceOpenSectionIfNeeded가 여전히 도는지 확인하는 절.
  */
  if (options.viaHandler) {
    await page.evaluate(() => exportEditorPreviewAsImages());
  } else {
    await page.click("#postEditorExportButton");
  }
  await page.waitForFunction(() => {
    const message = document.getElementById("postEditorMessage")?.textContent || "";
    return /saved|실패|없습니다|불러오지/.test(message);
  }, null, { timeout: 60000 });
  await page.waitForTimeout(900);

  return files.map(buffer => pngSize(buffer));
}

async function runExport(browser) {
  console.log("\n[export] 고정 비율 export의 실제 픽셀 크기");

  const cases = [
    { ratio: "4:5", exportWidth: 1200, expect: { width: 1200, height: 1500 } },
    { ratio: "1:1", exportWidth: 1080, expect: { width: 1080, height: 1080 } },
    { ratio: "4:5", exportWidth: 1080, expect: { width: 1080, height: 1350 } },
    { ratio: "4:6", exportWidth: 1000, expect: { width: 1000, height: 1500 } }
  ];

  const { ctx, page, errors } = await openPostEditor(browser);

  for (const item of cases) {
    await renderEditorPreview(page, {
      html: "짧은 글 한 줄.",
      settings: {
        ...BASE_SETTINGS,
        ratio: item.ratio,
        exportWidth: item.exportWidth
      },
      title: ""
    });

    const sizes = await collectExportedPngs(page);

    check(
      `[export ${item.ratio} @${item.exportWidth}] PNG 크기가 기대값과 정확히 같다`,
      sizes.length === 1 &&
      sizes[0].width === item.expect.width &&
      sizes[0].height === item.expect.height,
      sizes.map(s => `${s.width}×${s.height}`).join(", ") || "없음"
    );
  }

  /* -------------------------------------------------------
     출력 너비를 Preview에서 바꿔도 줄바꿈·페이지 수는 그대로,
     PNG 픽셀만 커진다
  -------------------------------------------------------- */
  {
    const settings = { ...BASE_SETTINGS, ratio: "4:5", exportWidth: 1080 };

    await renderEditorPreview(page, {
      html: SAMPLE_HTML, settings, title: ""
    });
    const before = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

    await renderEditorPreview(page, {
      html: SAMPLE_HTML, settings, title: "", exportWidth: 1600
    });
    const after = await page.evaluate(READ_GEOMETRY, "#postEditorPreviewPages");

    check(
      "[export width] 출력 너비만 바꾸면 줄바꿈과 페이지 수가 그대로다",
      before.pageCount === after.pageCount &&
      JSON.stringify(before.pages.map(p => p.lineTexts)) ===
        JSON.stringify(after.pages.map(p => p.lineTexts)),
      `${before.pageCount}장 → ${after.pageCount}장`
    );

    const sizes = await collectExportedPngs(page);

    check(
      "[export width] PNG는 고른 출력 너비로 나온다",
      sizes.length === before.pageCount &&
      sizes.every(s => s.width === 1600 && s.height === 2000),
      sizes.map(s => `${s.width}×${s.height}`).join(", ") || "없음"
    );
  }

  /* -------------------------------------------------------
     uniform / auto의 실제 PNG 픽셀 — 레이아웃 높이 × 배율
  -------------------------------------------------------- */
  {
    const settings = { ...BASE_SETTINGS, ratio: "auto", exportWidth: 1040 };

    for (const mode of ["auto", "uniform"]) {
      await renderEditorPreview(page, {
        html: THREE_PAGE_HTML, settings, title: "", mode
      });

      const layout = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");
      const scale = 1040 / 520;
      const expected = layout.map(p => Math.round(p.height * scale));

      check(
        `[export ${mode}] 페이지 높이가 정수 CSS 픽셀로 확정돼 있다`,
        layout.every(p =>
          Number.isInteger(p.height) &&
          p.definiteAttr !== null &&
          Number(p.definiteAttr) === p.height),
        layout.map(p => `${p.height}/${p.definiteAttr}`).join(" ")
      );

      const sizes = await collectExportedPngs(page);

      check(
        `[export ${mode}] 장 수만큼 PNG가 나온다`,
        sizes.length === layout.length,
        `${sizes.length} / ${layout.length}`
      );

      /*
        ★ auto도 uniform과 똑같이 **정확히** 같아야 한다.

        예전에는 auto만 +4px까지 봐주고 있었다. 페이지 높이가
        소수(278.1875)여서 offsetHeight는 278로 반올림하고
        html2canvas는 279로 올림해, 2배 출력에서 2px이 벌어졌기
        때문이다(IMORY_QUOTE_PRESET_RENDER_AUDIT.md §12).
        이제 나누기가 끝난 뒤 페이지 높이를 정수로 확정하므로
        (applyDefinitePostPageHeights) 두 값이 갈릴 자리가 없다 —
        허용 오차를 넓히는 대신 없앴다.
      */
      check(
        `[export ${mode}] 각 PNG의 픽셀 크기가 레이아웃 높이 × 배율과 정확히 같다`,
        sizes.every((s, i) =>
          s.width === 1040 &&
          s.height === expected[i]),
        `${sizes.map(s => `${s.width}×${s.height}`).join(", ")} / 기대 ${
          expected.join(", ")}`
      );

      if (mode === "uniform") {
        check(
          "[export uniform] 모든 PNG의 높이가 같다",
          new Set(sizes.map(s => s.height)).size === 1,
          sizes.map(s => s.height).join(" / ")
        );
      }
    }
  }

  check("[export] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   5. published — 발행된 글 본문
========================================================== */

async function runPublished(browser) {
  console.log("\n[published] 발행된 글 본문의 문단 간격");

  const { ctx, page, errors } = await openPostEditor(browser);

  const measured = await page.evaluate((settings) => {
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.width = "520px";
    document.body.appendChild(host);

    const read = (spacing) => {
      renderStyledPostContentInto(
        host,
        "첫 문단<br><br>둘째 문단",
        { ...settings, paragraphSpacing: spacing }
      );
      const gaps = Array.from(host.querySelectorAll(".post-body-paragraph-gap"))
        .map(node => node.getBoundingClientRect().height);
      return { height: host.offsetHeight, gaps };
    };

    const result = {
      zero: read(0),
      fourteen: read(14),
      forty: read(40),
      lineStep: settings.bodySize * settings.lineHeight
    };

    host.remove();
    return result;
  }, BASE_SETTINGS);

  check(
    "[published] 발행 본문도 paragraphSpacing을 따른다",
    near(measured.zero.gaps[0], 0, 0.6) &&
    near(measured.fourteen.gaps[0], 14, 0.6) &&
    near(measured.forty.gaps[0], 40, 0.6),
    JSON.stringify({
      zero: measured.zero.gaps, fourteen: measured.fourteen.gaps,
      forty: measured.forty.gaps
    })
  );

  check(
    "[published] 간격이 커지면 본문 전체 높이도 그만큼 커진다",
    near(
      measured.forty.height - measured.zero.height,
      40,
      1.5
    ),
    `${measured.zero.height} → ${measured.forty.height}`
  );

  check(
    "[published] 두 문단은 (줄 높이 + 간격)만큼 떨어져 있다",
    near(
      measured.fourteen.height,
      measured.lineStep * 2 + 14,
      2
    ),
    `${measured.fourteen.height}px / 기대 ${(measured.lineStep * 2 + 14).toFixed(1)}px`
  );

  check("[published] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   6. uniform — auto와 같은 분할 + 같은 높이

   ★ 무엇을 확인하는가

     (1) 페이지 수와 각 장의 내용(텍스트 · 사진 순서)이 auto와
         **정확히** 같다. uniform이 다시 나누거나 본문을 페이지
         사이로 옮기지 않는다.
     (2) 필요한 높이가 서로 다른 3장 이상에서 모든 페이지가
         가장 높은 페이지의 높이가 된다.
     (3) 내용이 짧아지면 통일 높이도 줄어든다(이전의 큰 높이가
         남지 않는다).
     (4) 본문이 제목·출처를 뺀 영역에서 세로 가운데에 온다.
========================================================== */

const UNIFORM_READ = (hostSelector) => {
  const host = document.querySelector(hostSelector);
  const pages = Array.from(host.querySelectorAll(".post-editor-preview-page"));
  const wasHidden = pages.map(node => node.hidden);
  const previousTransform = host.style.transform;
  host.style.transform = "none";
  pages.forEach(node => { node.hidden = false; });

  const read = pages.map((node) => {
    const rect = node.getBoundingClientRect();
    const content = node.querySelector(".post-editor-preview-content");
    const title = node.querySelector(".post-editor-preview-title");
    const source = node.querySelector(".post-editor-preview-source");
    const bodyArea = node.querySelector(".post-editor-preview-body-area");
    const contentRect = content.getBoundingClientRect();
    const bodyAreaRect = bodyArea ? bodyArea.getBoundingClientRect() : null;

    /* 본문 묶음이 실제로 차지한 자리(제목 아래 ~ 출처 위) */
    const titleRect =
      title && !title.hidden ? title.getBoundingClientRect() : null;
    const sourceRect =
      source && !source.hidden ? source.getBoundingClientRect() : null;

    return {
      height: node.offsetHeight,
      inlineHeight: node.style.height,
      uniformAttr: node.dataset.uniformHeight || null,
      definiteAttr: node.dataset.definiteHeight || null,
      text: (content.textContent || "").replace(/\s+/g, " ").trim(),
      imageSources: Array.from(
        content.querySelectorAll(
          "img, .post-editor-preview-image-missing"
        )
      ).map(img => (img.getAttribute("data-imory-image") || img.className)),
      imageCount: content.querySelectorAll("img").length,
      /* 본문 묶음 안에서 본문 위/아래로 남은 공간 */
      padTop: bodyAreaRect
        ? Math.round((contentRect.top - bodyAreaRect.top) * 100) / 100
        : null,
      padBottom: bodyAreaRect
        ? Math.round((bodyAreaRect.bottom - contentRect.bottom) * 100) / 100
        : null,
      nodeKinds: Array.from(content.childNodes).map(n =>
        n.nodeType === 1 ? n.nodeName.toLowerCase() : "#text"),
      bodyTop: Math.round((contentRect.top - rect.top) * 100) / 100,
      bodyBottom: Math.round((rect.bottom - contentRect.bottom) * 100) / 100,
      hasBodyArea: Boolean(bodyArea),
      titleBottom: titleRect
        ? Math.round((titleRect.bottom - rect.top) * 100) / 100
        : null,
      sourceTop: sourceRect
        ? Math.round((sourceRect.top - rect.top) * 100) / 100
        : null,
      sourceBottom: sourceRect
        ? Math.round((rect.bottom - sourceRect.bottom) * 100) / 100
        : null
    };
  });

  pages.forEach((node, index) => { node.hidden = wasHidden[index]; });
  host.style.transform = previousTransform;
  return read;
};


/* PAGE break 3개로 "필요 높이가 서로 다른" 4장을 만든다 */
const THREE_PAGE_HTML = [
  "짧은 장.",
  '<div class="post-editor-page-break"></div>',
  "두 번째 장입니다. 이 장은 문단이 여러 개라서 첫 장보다 확실히 높다.",
  "<br><br>",
  "두 번째 문단.",
  "<br><br>",
  "세 번째 문단.",
  '<div class="post-editor-page-break"></div>',
  "세 번째 장은 한 줄."
].join("");


async function runUniform(browser) {
  console.log("\n[uniform] auto와 같은 분할 · 같은 높이");

  const { ctx, page, errors } = await openPostEditor(browser);

  const settings = { ...BASE_SETTINGS, ratio: "auto" };

  /* -------------------------------------------------------
     (1) 분할 결과가 auto와 완전히 같다
  -------------------------------------------------------- */
  await renderEditorPreview(page, {
    html: THREE_PAGE_HTML, settings, title: "", mode: "auto"
  });
  const auto = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

  await renderEditorPreview(page, {
    html: THREE_PAGE_HTML, settings, title: "", mode: "uniform"
  });
  const uniform = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

  check(
    "[uniform] 페이지 수가 auto와 같다",
    auto.length === uniform.length && auto.length === 3,
    `auto ${auto.length} / uniform ${uniform.length}`
  );

  check(
    "[uniform] 각 장의 본문 글자가 auto와 한 글자도 다르지 않다",
    auto.every((p, i) => p.text === uniform[i]?.text),
    auto.map((p, i) => `${i}: ${p.text === uniform[i]?.text ? "=" : "≠"}`).join(" ")
  );

  check(
    "[uniform] 각 장의 노드 구성(사진·줄바꿈 포함 순서)이 같다",
    auto.every((p, i) =>
      JSON.stringify(p.nodeKinds) === JSON.stringify(uniform[i]?.nodeKinds)),
    JSON.stringify(uniform.map(p => p.nodeKinds.length))
  );

  /* -------------------------------------------------------
     (2) 서로 다른 자연 높이 → 최대값으로 통일
  -------------------------------------------------------- */
  const naturalHeights = auto.map(p => p.height);
  const maxNatural = Math.max(...naturalHeights);

  check(
    "[uniform] auto는 페이지마다 높이가 다르다(검증용 fixture 확인)",
    new Set(naturalHeights).size >= 2 && naturalHeights.length >= 3,
    naturalHeights.join(" / ")
  );

  check(
    "[uniform] 모든 페이지가 가장 높은 페이지의 높이로 통일된다",
    uniform.every(p => Math.abs(p.height - maxNatural) <= 1),
    `uniform ${uniform.map(p => p.height).join(" / ")} / 최대 자연 높이 ${maxNatural}`
  );

  check(
    "[uniform] 통일 높이가 인라인 height로 박힌다(캡처가 그대로 쓴다)",
    uniform.every(p => p.inlineHeight.endsWith("px") && p.uniformAttr),
    uniform.map(p => `${p.inlineHeight}/${p.uniformAttr}`).join(" ")
  );

  /* -------------------------------------------------------
     (3) 본문이 제목·출처를 뺀 영역에서 세로 가운데
  -------------------------------------------------------- */
  {
    const shortest = uniform[
      naturalHeights.indexOf(Math.min(...naturalHeights))
    ];

    check(
      "[uniform] 본문 묶음(body-area)이 만들어진다",
      uniform.every(p => p.hasBodyArea),
      JSON.stringify(uniform.map(p => p.hasBodyArea))
    );

    check(
      "[uniform] 짧은 장은 늘어난 공간을 본문 묶음이 받는다",
      shortest.padTop + shortest.padBottom > 0,
      `위 ${shortest.padTop} / 아래 ${shortest.padBottom}`
    );

    /* 출처는 묶음 바깥이므로 늘어난 높이만큼 바닥에 남는다 */
    check(
      "[uniform] 출처는 늘어난 페이지의 맨 아래에 남는다",
      uniform.every(p =>
        p.sourceBottom !== null && Math.abs(p.sourceBottom - 60) <= 1),
      uniform.map(p => p.sourceBottom).join(" / ")
    );

    /*
      ★ 늘어난 공간을 어디로 밀지는 **고른 세로 정렬**이 정한다
      (2026-09-12 이전에는 center로 못박혀 있었다). 여기 fixture는
      프리셋 verticalAlign이 "top"이므로 남는 공간이 전부 아래에
      있어야 한다.
    */
    check(
      "[uniform] 프리셋이 top이면 남는 공간이 전부 아래로 간다",
      uniform.every(p => p.padTop <= 1),
      uniform.map(p => `${p.padTop}/${p.padBottom}`).join(" · ")
    );
  }

  /* -------------------------------------------------------
     (3-1) 세로 정렬을 고르면 그대로 그려진다 (uniform 전용)
  -------------------------------------------------------- */
  {
    const byAlign = {};

    for (const align of ["top", "center", "bottom"]) {
      await renderEditorPreview(page, {
        html: THREE_PAGE_HTML, settings, title: "", mode: "uniform", align
      });

      const pages = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");
      const shortest = pages[
        pages.map(p => p.padTop + p.padBottom)
          .indexOf(Math.max(...pages.map(p => p.padTop + p.padBottom)))
      ];

      byAlign[align] = {
        padTop: shortest.padTop,
        padBottom: shortest.padBottom,
        height: shortest.height
      };
    }

    check(
      "[uniform align] top이면 남는 공간이 아래로 간다",
      byAlign.top.padTop <= 1 && byAlign.top.padBottom > 1,
      JSON.stringify(byAlign.top)
    );

    check(
      "[uniform align] center면 위아래로 반씩 나뉜다",
      Math.abs(byAlign.center.padTop - byAlign.center.padBottom) <= 1 &&
      byAlign.center.padTop > 1,
      JSON.stringify(byAlign.center)
    );

    check(
      "[uniform align] bottom이면 남는 공간이 위로 간다",
      byAlign.bottom.padBottom <= 1 && byAlign.bottom.padTop > 1,
      JSON.stringify(byAlign.bottom)
    );

    check(
      "[uniform align] 정렬을 바꿔도 페이지 높이는 그대로다",
      byAlign.top.height === byAlign.center.height &&
      byAlign.center.height === byAlign.bottom.height,
      [byAlign.top.height, byAlign.center.height, byAlign.bottom.height].join(" / ")
    );
  }

  /* -------------------------------------------------------
     (3-2) 세로 정렬 컨트롤은 auto에서만 숨는다
  -------------------------------------------------------- */
  {
    const rowShown = {};

    for (const mode of ["uniform", "auto", "custom"]) {
      await renderEditorPreview(page, {
        html: "짧은 글.", settings, title: "", mode
      });

      rowShown[mode] = await page.evaluate(() =>
        !document.getElementById("postEditorPreviewAlignRow").hidden);
    }

    check(
      "[uniform align] 세로 정렬 컨트롤이 uniform·custom에서 보이고 auto에서만 숨는다",
      rowShown.uniform === true &&
      rowShown.custom === true &&
      rowShown.auto === false,
      JSON.stringify(rowShown)
    );
  }

  /* -------------------------------------------------------
     (4) 내용이 짧아지면 통일 높이도 줄어든다
  -------------------------------------------------------- */
  {
    await renderEditorPreview(page, {
      html: "한 줄.<div class=\"post-editor-page-break\"></div>또 한 줄.",
      settings, title: "", mode: "uniform"
    });
    const shorter = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    check(
      "[uniform] 모든 페이지가 짧아지면 통일 높이도 줄어든다",
      shorter.length === 2 &&
      shorter.every(p => p.height < maxNatural) &&
      new Set(shorter.map(p => p.height)).size === 1,
      `${shorter.map(p => p.height).join(" / ")} (이전 ${maxNatural})`
    );
  }

  /* -------------------------------------------------------
     (5) 빈 본문 · 한 페이지
  -------------------------------------------------------- */
  {
    await renderEditorPreview(page, {
      html: "", settings, title: "", mode: "uniform"
    });
    const empty = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    check(
      "[uniform] 빈 본문도 한 장만, 높이가 유한하다",
      empty.length === 1 && empty[0].height > 0,
      `${empty.length}장 / ${empty[0]?.height}px`
    );

    await renderEditorPreview(page, {
      html: "한 장짜리 글.", settings, title: "", mode: "uniform"
    });
    const single = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    const autoSingle = await (async () => {
      await renderEditorPreview(page, {
        html: "한 장짜리 글.", settings, title: "", mode: "auto"
      });
      return page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");
    })();

    check(
      "[uniform] 한 장뿐이면 auto와 높이도 같다(여분 높이를 만들지 않는다)",
      single.length === 1 && autoSingle.length === 1 &&
      Math.abs(single[0].height - autoSingle[0].height) <= 1,
      `uniform ${single[0]?.height} / auto ${autoSingle[0]?.height}`
    );
  }

  /* -------------------------------------------------------
     (6) 제목/출처 표시 전환 · 프리셋 변경 후 재계산
  -------------------------------------------------------- */
  {
    await renderEditorPreview(page, {
      html: THREE_PAGE_HTML, settings, title: "제목 있음", mode: "uniform"
    });

    const withoutTitle =
      await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    await page.evaluate(async () => {
      previewTitleVisible = true;
      syncPreviewVisibilityToggleButtons();
      await updateEditorPreview({ preserveView: true });
    });
    await page.waitForTimeout(350);

    const withTitle =
      await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    check(
      "[uniform] 제목을 켜면 통일 높이가 다시 계산된다",
      withTitle.every(p => p.height === withTitle[0].height) &&
      withTitle[0].height >= withoutTitle[0].height,
      `${withoutTitle[0].height} → ${withTitle[0].height}`
    );

    /* 출처 끄기 */
    await page.evaluate(async () => {
      previewSourceVisible = false;
      syncPreviewVisibilityToggleButtons();
      await updateEditorPreview({ preserveView: true });
    });
    await page.waitForTimeout(350);

    const withoutSource =
      await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    check(
      "[uniform] 출처를 끄면 통일 높이가 줄어든다(이전 높이가 남지 않는다)",
      withoutSource.every(p => p.height === withoutSource[0].height) &&
      withoutSource[0].height < withTitle[0].height,
      `${withTitle[0].height} → ${withoutSource[0].height}`
    );

    /* 프리셋 변경(글자 크기) — 다시 재서 통일 */
    await renderEditorPreview(page, {
      html: THREE_PAGE_HTML,
      settings: { ...settings, bodySize: 28, lineHeight: 2.2 },
      title: "", mode: "uniform"
    });
    const bigger = await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    check(
      "[uniform] 프리셋을 바꾸면 통일 높이가 새 서식으로 다시 계산된다",
      bigger.every(p => p.height === bigger[0].height) &&
      bigger[0].height > maxNatural,
      `${maxNatural} → ${bigger[0].height}`
    );
  }

  /* -------------------------------------------------------
     (7) 긴 사진 — 사진이 든 본문에서도 분할이 auto와 같다
  -------------------------------------------------------- */
  {
    /*
      실제 본문 사진과 같은 경로로 그리게 한다 — 굳힌 raster
      캐시에 미리 넣어 두면 preparePostBodyImagesForPreview가
      네트워크를 타지 않고 그대로 쓴다(posts-preview-images.js).
    */
    const imageId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const tallImage =
      "data:image/svg+xml;base64," +
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="1400">' +
        '<rect width="300" height="1400" fill="#ccddee"/></svg>'
      ).toString("base64");

    await page.evaluate((input) => {
      postPreviewImageRaster.set(input.imageId, {
        dataUrl: input.dataUrl, width: 300, height: 1400
      });
    }, { imageId, dataUrl: tallImage });

    const html =
      "사진 앞 문단.<br><br>" +
      `<img data-imory-image="${imageId}" src="${tallImage}">` +
      "<br><br>사진 뒤 문단.";

    await renderEditorPreview(page, {
      html, settings, title: "", mode: "auto"
    });
    const autoImage =
      await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    await renderEditorPreview(page, {
      html, settings, title: "", mode: "uniform"
    });
    const uniformImage =
      await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    check(
      "[uniform] 긴 사진이 든 글도 auto와 같은 장 수로 나뉜다",
      autoImage.length === uniformImage.length,
      `auto ${autoImage.length} / uniform ${uniformImage.length}`
    );

    check(
      "[uniform] 사진이 실제 <img>로 그려졌다(자리표시자가 아니다)",
      uniformImage.reduce((sum, p) => sum + p.imageCount, 0) === 1,
      JSON.stringify(uniformImage.map(p => p.imageSources))
    );

    check(
      "[uniform] 사진이 같은 장, 같은 순서로 들어간다",
      autoImage.every((p, i) =>
        JSON.stringify(p.imageSources) ===
        JSON.stringify(uniformImage[i]?.imageSources)),
      JSON.stringify(uniformImage.map(p => p.imageSources))
    );

    check(
      "[uniform] 사진이 든 장도 같은 높이로 통일된다",
      new Set(uniformImage.map(p => p.height)).size === 1,
      uniformImage.map(p => p.height).join(" / ")
    );

    /* 사진 삭제 후 재계산 */
    await renderEditorPreview(page, {
      html: "사진 앞 문단.<br><br>사진 뒤 문단.",
      settings, title: "", mode: "uniform"
    });
    const removed =
      await page.evaluate(UNIFORM_READ, "#postEditorPreviewPages");

    check(
      "[uniform] 사진을 지우면 통일 높이가 그만큼 줄어든다",
      removed.length === 1 &&
      removed[0].height < Math.max(...uniformImage.map(p => p.height)),
      `${Math.max(...uniformImage.map(p => p.height))} → ${removed[0]?.height}`
    );
  }

  check("[uniform] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();
}


/* =========================================================
   7. options — 출력 조건 UI의 상태 보존

   uniform / auto / custom 세 옵션이 항상 보이는가, 프리셋의
   canvas 값이 초기값으로 오는가(고정 비율 → custom), 접었다
   펴도 유지되는가, 다른 글로 가면 새로 시작하는가.
========================================================== */

async function runOptions(browser) {
  console.log("\n[options] 출력 조건 UI의 초기값과 상태 보존");

  const { ctx, page, errors } = await openPostEditor(browser);

  /* -------------------------------------------------------
     (1) 세 옵션이 항상 보인다 — 펼치는 단계 없음
  -------------------------------------------------------- */
  const controls = await page.evaluate(() => {
    const host = document.getElementById("postEditorPreviewRatioControls");
    return {
      exists: Boolean(host),
      hidden: host?.hidden ?? null,
      trigger: Boolean(document.getElementById("postEditorPreviewRatioTrigger")),
      order: Array.from(
        host?.querySelectorAll(".post-editor-preview-ratio-button") || []
      ).map(button => button.dataset.ratio),
      exportWidthInput: Boolean(
        document.getElementById("postEditorPreviewExportWidth")
      ),
      exportSizeReadout: Boolean(
        document.getElementById("postEditorPreviewExportSize")
      )
    };
  });

  check(
    "[options] uniform / auto / custom 이 이 순서로 상시 표시된다",
    controls.exists && controls.hidden === false &&
    JSON.stringify(controls.order) ===
      JSON.stringify(["uniform", "auto", "custom"]),
    JSON.stringify(controls)
  );

  check(
    "[options] ratio 펼치기 버튼이 없어졌다",
    controls.trigger === false
  );

  /*
    ★ 가로 픽셀은 Quote Preset에서만 고친다(사용자 결정,
    2026-09-12). 여기에는 결과 크기를 보여주는 읽기 전용
    표시만 남는다.
  */
  check(
    "[options] 출력 너비 입력이 Preview에서 없어졌다",
    controls.exportWidthInput === false,
    JSON.stringify(controls)
  );

  check(
    "[options] 대신 저장될 픽셀 크기 표시는 남아 있다",
    controls.exportSizeReadout === true
  );

  /* -------------------------------------------------------
     (2) 프리셋의 고정 비율이 custom의 값으로 온다
  -------------------------------------------------------- */
  await renderEditorPreview(page, {
    html: "짧은 글.",
    settings: { ...BASE_SETTINGS, ratio: "9:16", exportWidth: 1440 },
    title: ""
  });

  const fromPreset = await page.evaluate(() => ({
    pressed: Array.from(
      document.querySelectorAll(".post-editor-preview-ratio-button")
    ).filter(b => b.getAttribute("aria-pressed") === "true")
      .map(b => b.dataset.ratio),
    customHidden:
      document.getElementById("postEditorPreviewRatioCustomInputs").hidden,
    width: document.getElementById("postEditorPreviewRatioCustomWidth").value,
    height: document.getElementById("postEditorPreviewRatioCustomHeight").value,
    exportWidth: getPostPreviewExportWidth(postStyleSettings),
    exportSize:
      document.getElementById("postEditorPreviewExportSize").textContent.trim(),
    ratio: getPostPreviewRatio(postStyleSettings),
    pageHeight:
      document.querySelector("#postEditorPreviewPages .post-editor-preview-page")
        ?.offsetHeight
  }));

  check(
    "[options] 프리셋의 고정 비율(9:16)이 custom + 9:16으로 온다",
    JSON.stringify(fromPreset.pressed) === JSON.stringify(["custom"]) &&
    fromPreset.customHidden === false &&
    fromPreset.width === "9" && fromPreset.height === "16",
    JSON.stringify(fromPreset)
  );

  check(
    "[options] 그 비율로 실제 캔버스가 그려진다(손실 없이 대응)",
    Math.abs(fromPreset.pageHeight - Math.round(520 * 16 / 9)) <= 1,
    `${fromPreset.pageHeight}px / 기대 ${Math.round(520 * 16 / 9)}px`
  );

  check(
    "[options] 출력 너비는 프리셋의 exportWidth를 그대로 쓴다",
    fromPreset.exportWidth === 1440 &&
    fromPreset.exportSize.startsWith("1440"),
    JSON.stringify({
      exportWidth: fromPreset.exportWidth, exportSize: fromPreset.exportSize
    })
  );

  /* AUTO로 저장된 프리셋 */
  await renderEditorPreview(page, {
    html: "짧은 글.",
    settings: { ...BASE_SETTINGS, ratio: "auto" },
    title: ""
  });

  const autoPreset = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".post-editor-preview-ratio-button"))
      .filter(b => b.getAttribute("aria-pressed") === "true")
      .map(b => b.dataset.ratio));

  check(
    "[options] AUTO로 저장된 프리셋은 auto로 온다(uniform으로 강제하지 않는다)",
    JSON.stringify(autoPreset) === JSON.stringify(["auto"]),
    JSON.stringify(autoPreset)
  );

  /* -------------------------------------------------------
     (3) 접었다 펴도 고른 값이 유지된다
  -------------------------------------------------------- */
  await page.evaluate(async () => {
    document.querySelector('[data-ratio="uniform"]').click();
    await new Promise(r => setTimeout(r, 200));
    previewVerticalAlign = "center";
    previewBodyAlign = "center";
    previewTitleVisible = false;
    syncPreviewVisibilityToggleButtons();
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    closeEditorPreview();
    openEditorPreview();
  });
  await page.waitForTimeout(600);

  const afterReopen = await page.evaluate(() => ({
    pressed: Array.from(
      document.querySelectorAll(".post-editor-preview-ratio-button")
    ).filter(b => b.getAttribute("aria-pressed") === "true")
      .map(b => b.dataset.ratio),
    align: previewVerticalAlign,
    bodyAlign: previewBodyAlign,
    titleVisible: previewTitleVisible,
    state: previewRatioMode
  }));

  check(
    "[options] 접었다 펴도 비율·정렬·제목 표시가 그대로다",
    JSON.stringify(afterReopen.pressed) === JSON.stringify(["uniform"]) &&
    afterReopen.align === "center" &&
    afterReopen.bodyAlign === "center" &&
    afterReopen.titleVisible === false,
    JSON.stringify(afterReopen)
  );

  /* -------------------------------------------------------
     (4) 다른 글(새 편집 세션)로 가면 새로 시작한다
  -------------------------------------------------------- */
  await page.evaluate(async () => {
    postStyleSettings = { ratio: "4:5", ratioWidth: 4, ratioHeight: 5,
      exportWidth: 1080 };
    await prepareEditorUI();
  });
  await page.waitForTimeout(600);

  const afterNewSession = await page.evaluate(() => ({
    mode: previewRatioMode,
    exportWidth: previewExportWidth,
    align: previewVerticalAlign,
    titleVisible: previewTitleVisible,
    pressed: Array.from(
      document.querySelectorAll(".post-editor-preview-ratio-button")
    ).filter(b => b.getAttribute("aria-pressed") === "true")
      .map(b => b.dataset.ratio)
  }));

  check(
    "[options] 새 편집 세션에서는 이전 글의 임시 설정이 남지 않는다",
    afterNewSession.mode === null &&
    afterNewSession.exportWidth === null &&
    afterNewSession.align === null,
    JSON.stringify(afterNewSession)
  );

  /* -------------------------------------------------------
     (5) gallery에서는 발췌 UI가 여전히 숨는다
  -------------------------------------------------------- */
  const galleryHidden = await page.evaluate(() => {
    const before = document.getElementById("postEditorPreviewToggle").hidden;
    const original = window.isGalleryEditor;
    window.isGalleryEditor = () => true;
    syncEditorExcerptControls();
    const hidden = document.getElementById("postEditorPreviewToggle").hidden;
    const exportHidden = document.getElementById("postEditorExportButton").hidden;
    window.isGalleryEditor = original;
    syncEditorExcerptControls();
    return { before, hidden, exportHidden,
      after: document.getElementById("postEditorPreviewToggle").hidden };
  });

  check(
    "[options] gallery에서는 PREVIEW/내보내기 버튼이 숨는다(유지)",
    galleryHidden.hidden === true && galleryHidden.exportHidden === true &&
    galleryHidden.after === false,
    JSON.stringify(galleryHidden)
  );

  /* 눈으로 볼 화면이 필요하면 IMORY_QUOTE_SHOT=<디렉터리> */
  if (process.env.IMORY_QUOTE_SHOT) {
    fs.mkdirSync(process.env.IMORY_QUOTE_SHOT, { recursive: true });
    await page.locator("#postEditorPreviewSheet").screenshot({
      path: path.join(process.env.IMORY_QUOTE_SHOT, "preview-controls.png")
    });
  }

  check("[options] 오류 없음", errors.length === 0, errors.join(" | "));
  await ctx.close();

  /* -------------------------------------------------------
     (6) 모바일 — 새 입력칸이 늘어나도 가로로 넘치지 않는다
  -------------------------------------------------------- */
  {
    const mobile = await openPostEditor(browser, { viewport: "mobile" });

    const overflow = await mobile.page.evaluate(() => {
      const row = document.getElementById("postEditorPreviewRatioControls");
      const sheet = document.getElementById("postEditorPreviewSheet");
      const rowRect = row.getBoundingClientRect();
      const sheetRect = sheet.getBoundingClientRect();
      return {
        rowRight: Math.round(rowRect.right),
        sheetRight: Math.round(sheetRect.right),
        docScroll: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        exportSizeVisible: Boolean(
          document.getElementById("postEditorPreviewExportSize")
            ?.getBoundingClientRect().width
        )
      };
    });

    check(
      "[options mobile] 출력 조건 줄이 패널 밖으로 넘치지 않는다",
      overflow.rowRight <= overflow.sheetRight + 1 &&
      overflow.docScroll <= overflow.viewport + 1 &&
      overflow.exportSizeVisible,
      JSON.stringify(overflow)
    );

    check(
      "[options mobile] 오류 없음",
      mobile.errors.length === 0,
      mobile.errors.join(" | ")
    );

    await mobile.ctx.close();
  }
}


/* =========================================================
   8. cache — 실제 요청 URL

   이번 라운드의 공용 렌더러/스타일이 두 문서에서 **같은 배포
   버전**으로 로드되는가. 고정 URL(버전 없음)이 남아 있으면
   CDN의 4시간 캐시 동안 "새 JS + 옛 CSS"가 만들어진다
   (core/lib/build-version.js 상단 주석).
========================================================== */

async function runCache(browser) {
  console.log("\n[cache] 공용 렌더러/스타일의 실제 요청 URL");

  const buildVersion = fs
    .readFileSync(path.join(ROOT, "core", "lib", "build-version.js"), "utf8")
    .match(/APP_BUILD_VERSION\s*=\s*"([^"]+)"/)?.[1];

  check(
    "[cache] APP_BUILD_VERSION을 읽었다",
    Boolean(buildVersion),
    buildVersion
  );

  const SHARED = [
    "/posts/posts-page-canvas.css",
    "/posts/style/posts-body-layout.js",
    "/posts/preview/posts-page-layout.js"
  ];

  /*
    ★ 관리 화면 안에는 Studio/customize가 iframe으로 들어온다.
    iframe은 독립된 문서라 자기 몫을 따로 받는 것이 정상이다 —
    "이 문서가 몇 번 받는가"를 보려면 main frame 요청만 센다.
    (iframe까지 합쳐서 같은 파일을 두 번 받는지는 allRequests로
    따로 본다 — 같은 URL이면 브라우저 캐시 항목이 하나다.)
  */

  /* --- 관리 화면 --- */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    const requests = [];
    const allRequests = [];
    page.on("request", r => {
      allRequests.push(r.url());
      if (r.frame() === page.mainFrame()) requests.push(r.url());
    });
    await installSignedInUser(page);
    await installSupabaseMock(page, {});
    await page.goto(`http://localhost:${PORT}/admin/`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForSelector("#openQuoteButton", { state: "visible", timeout: 20000 });
    await page.click("#openQuoteButton");
    await page.waitForSelector("#quotePreviewCanvas .post-editor-preview-page", {
      timeout: 20000
    });
    await page.waitForTimeout(400);

    const paths = requests
      .filter(url => url.startsWith(`http://localhost:${PORT}`))
      .map(url => url.slice(`http://localhost:${PORT}`.length));

    if (VERBOSE) console.log(JSON.stringify(paths, null, 1));

    const canvasCss = paths.filter(p => p.startsWith("/posts/posts-page-canvas.css"));
    const quoteCss = paths.filter(p => p.startsWith("/admin/admin-quote.css"));
    const versionJs = paths.filter(p => p.startsWith("/core/lib/build-version.js"));

    check(
      "[cache admin] 공용 페이지 CSS가 ?v=APP_BUILD_VERSION으로 요청된다",
      canvasCss.length === 1 &&
      canvasCss[0] === `/posts/posts-page-canvas.css?v=${buildVersion}`,
      canvasCss.join(", ") || "요청 없음"
    );

    check(
      "[cache admin] admin-quote.css도 같은 배포 버전이다",
      quoteCss.length === 1 &&
      quoteCss[0] === `/admin/admin-quote.css?v=${buildVersion}`,
      quoteCss.join(", ") || "요청 없음"
    );

    check(
      "[cache admin] build-version.js만 ?t= 로 받는다",
      versionJs.length === 1 && /\?t=\d+$/.test(versionJs[0]),
      versionJs.join(", ") || "요청 없음"
    );

    check(
      "[cache admin] 버전 없는 고정 URL 요청이 하나도 없다",
      SHARED.every(file => !paths.includes(file)),
      SHARED.filter(file => paths.includes(file)).join(", ") || "없음"
    );

    check(
      "[cache admin] 같은 공용 파일을 두 번 받지 않는다",
      SHARED.every(file =>
        paths.filter(p => p.split("?")[0] === file).length <= 1),
      SHARED.map(file =>
        `${file}=${paths.filter(p => p.split("?")[0] === file).length}`).join(" ")
    );

    /*
      iframe(Studio)까지 합쳐도 URL이 갈리면 안 된다 — 같은
      파일을 서로 다른 쿼리로 두 번 받으면 캐시 항목이 둘이 되고
      버전이 갈릴 수 있다.
    */

    const allPaths = allRequests
      .filter(url => url.startsWith(`http://localhost:${PORT}`))
      .map(url => url.slice(`http://localhost:${PORT}`.length));

    const sharedJsUrls = new Set(
      allPaths.filter(p =>
        p.split("?")[0] === "/posts/style/posts-body-layout.js")
    );

    check(
      "[cache admin] iframe(Studio)까지 합쳐도 공용 렌더러 URL이 하나다",
      sharedJsUrls.size === 1 &&
      [...sharedJsUrls][0] ===
        `/posts/style/posts-body-layout.js?v=${buildVersion}`,
      [...sharedJsUrls].join(", ") || "요청 없음"
    );

    await ctx.close();
  }

  /* --- 글쓰기 화면 --- */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    const requests = [];
    page.on("request", r => {
      if (r.frame() === page.mainFrame()) requests.push(r.url());
    });
    await installSignedInUser(page);
    await installSupabaseMock(page, {});
    await page.goto(`http://localhost:${PORT}/${SLUG}/category/1?write=1`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 20000 });
    await page.waitForTimeout(600);

    const paths = requests
      .filter(url => url.startsWith(`http://localhost:${PORT}`))
      .map(url => url.slice(`http://localhost:${PORT}`.length));

    const canvasCss = paths.filter(p => p.startsWith("/posts/posts-page-canvas.css"));

    check(
      "[cache editor] 같은 공용 CSS를 관리 화면과 같은 URL로 요청한다",
      canvasCss.length === 1 &&
      canvasCss[0] === `/posts/posts-page-canvas.css?v=${buildVersion}`,
      canvasCss.join(", ") || "요청 없음"
    );

    check(
      "[cache editor] 공용 렌더러 JS가 버전 없이 요청되지 않는다",
      SHARED.every(file => !paths.includes(file)),
      SHARED.filter(file => paths.includes(file)).join(", ") || "없음"
    );

    check(
      "[cache editor] 공용 렌더러 JS를 한 번씩만 받는다",
      SHARED.slice(1).every(file =>
        paths.filter(p => p.split("?")[0] === file).length === 1),
      SHARED.slice(1).map(file =>
        `${file}=${paths.filter(p => p.split("?")[0] === file).length}`).join(" ")
    );

    await ctx.close();
  }
}



/* =========================================================
   9. panel — Preview 여닫기 버튼과 패널 정리

   ★ 무엇을 확인하는가

     (1) 여닫기 버튼이 부유(sticky/fixed)가 아니라 일반 문서
         흐름에 있고, 그림자·큰 둥근 모서리를 쓰지 않으며
         에디터의 다른 버튼과 같은 선·색이다.
     (2) 데스크톱·모바일이 **같은 버튼 하나**로 펼치고 접는다.
         라벨은 발췌 ▾ / 발췌 접기 ▴이고, 버튼은 가운데 정렬이다.
         export/copy는 펼쳐져 있을 때만 보인다.
     (3) aria-expanded가 실제 상태와 같고, aria-controls가
         실제로 열리는 요소를 가리킨다.
     (4) 패널 안에 중복 "PREVIEW" 문구와 닫기 ×가 없다.
     (5) 세로 정렬은 custom에서만, 상세 비율도 custom에서만
         **실제로** 보인다(hidden 속성뿐 아니라 그려진 크기로).
     (6) 접은 채로 export를 눌러도 장 수·픽셀 크기가 펼친
         상태와 같고, 끝나면 다시 접힌 채로 남는다.
========================================================== */

const PANEL_READ = () => {
  const toggle = document.getElementById("postEditorPreviewToggle");
  const section = document.getElementById("postEditorPreviewSection");
  const cs = getComputedStyle(toggle);
  const rect = toggle.getBoundingClientRect();

  const shown = (id) => {
    const node = document.getElementById(id);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  return {
    label: (toggle.textContent || "").replace(/\s+/g, " ").trim(),
    ariaExpanded: toggle.getAttribute("aria-expanded"),
    ariaControls: toggle.getAttribute("aria-controls"),
    controlsResolves: Boolean(
      document.getElementById(toggle.getAttribute("aria-controls"))
    ),
    open: section.classList.contains("is-open"),
    sectionDisplay: getComputedStyle(section).display,
    sectionAriaHidden: section.getAttribute("aria-hidden"),
    position: cs.position,
    borderRadius: cs.borderRadius,
    boxShadow: cs.boxShadow,
    backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || "none",
    borderColor: cs.borderTopColor,
    toggleTop: Math.round(rect.top),
    headerCount: document.querySelectorAll(".post-editor-preview-header").length,
    labelCount: document.querySelectorAll(".post-editor-preview-label").length,
    closeCount: document.querySelectorAll(".post-editor-preview-close").length,
    backdropCount:
      document.querySelectorAll(".post-editor-preview-backdrop").length,
    alignShown: shown("postEditorPreviewAlignRow"),
    customShown: shown("postEditorPreviewRatioCustomInputs"),
    sizeShown: shown("postEditorPreviewExportSize"),
    exportShown: shown("postEditorExportButton"),
    copyShown: shown("postEditorCopyButton"),
    cancelShown: shown("postEditorCancelButton"),
    saveShown: shown("postEditorSaveButton"),
    /* 버튼이 가운데 정렬인지 — 좌우 여백이 같은가 */
    toggleLeftGap: Math.round(
      rect.left -
      toggle.parentElement.getBoundingClientRect().left
    ),
    toggleRightGap: Math.round(
      toggle.parentElement.getBoundingClientRect().right -
      rect.right
    ),
    docScroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  };
};


async function runPanel(browser) {
  console.log("\n[panel] Preview 여닫기 버튼과 패널 정리");

  /* -------------------------------------------------------
     (1)(2)(3)(4) 데스크톱 — 기본 펼침, 접기/펼치기
  -------------------------------------------------------- */
  {
    const { ctx, page, errors } = await openPostEditor(browser);

    await renderEditorPreview(page, {
      html: SAMPLE_HTML, settings: BASE_SETTINGS, title: "제목"
    });

    const opened = await page.evaluate(PANEL_READ);

    check(
      "[panel desktop] 들어오면 펼쳐져 있다(예전과 같다)",
      opened.open === true && opened.sectionDisplay !== "none",
      JSON.stringify({
        open: opened.open, display: opened.sectionDisplay
      })
    );

    check(
      "[panel desktop] 버튼이 일반 문서 흐름에 있다(sticky/fixed 아님)",
      opened.position === "static",
      opened.position
    );

    check(
      "[panel desktop] 그림자·알약 모양·backdrop-filter를 쓰지 않는다",
      opened.boxShadow === "none" &&
      opened.borderRadius === "0px" &&
      (opened.backdropFilter === "none" || opened.backdropFilter === ""),
      JSON.stringify({
        shadow: opened.boxShadow, radius: opened.borderRadius,
        backdrop: opened.backdropFilter
      })
    );

    const actionBorder = await page.evaluate(() =>
      getComputedStyle(
        document.getElementById("postEditorCancelButton")
      ).borderTopColor
    );

    check(
      "[panel desktop] 선 색이 에디터의 다른 버튼과 같다",
      opened.borderColor === actionBorder,
      `${opened.borderColor} / ${actionBorder}`
    );

    check(
      "[panel desktop] 펼침 라벨이 '발췌 접기 ▴'다",
      opened.label === "발췌 접기 ▴",
      opened.label
    );

    check(
      "[panel desktop] aria-expanded가 실제 상태와 같고 aria-controls가 실재한다",
      opened.ariaExpanded === "true" &&
      opened.ariaControls === "postEditorPreviewSection" &&
      opened.controlsResolves === true,
      JSON.stringify({
        expanded: opened.ariaExpanded, controls: opened.ariaControls
      })
    );

    check(
      "[panel desktop] 패널 안에 중복 PREVIEW 문구와 닫기 ×가 없다",
      opened.headerCount === 0 &&
      opened.labelCount === 0 &&
      opened.closeCount === 0 &&
      opened.backdropCount === 0,
      JSON.stringify({
        header: opened.headerCount, label: opened.labelCount,
        close: opened.closeCount, backdrop: opened.backdropCount
      })
    );

    /* 접기 */
    await page.click("#postEditorPreviewToggle");
    await page.waitForTimeout(250);

    const closed = await page.evaluate(PANEL_READ);

    check(
      "[panel desktop] 같은 버튼으로 접힌다",
      closed.open === false &&
      closed.sectionDisplay === "none" &&
      closed.ariaExpanded === "false" &&
      closed.sectionAriaHidden === "true",
      JSON.stringify({
        open: closed.open, display: closed.sectionDisplay,
        expanded: closed.ariaExpanded, hidden: closed.sectionAriaHidden
      })
    );

    check(
      "[panel desktop] 접힘 라벨이 '발췌 ▾'다",
      closed.label === "발췌 ▾",
      closed.label
    );

    /*
      ★ export/copy는 발췌가 펼쳐져 있을 때만 보인다.
      무엇이 저장될지 못 본 채 누르는 버튼을 남기지 않는다.
    */
    check(
      "[panel desktop] 접으면 export/copy가 함께 숨는다",
      closed.exportShown === false && closed.copyShown === false,
      JSON.stringify({ export: closed.exportShown, copy: closed.copyShown })
    );

    check(
      "[panel desktop] 펼쳐져 있을 때는 export/copy가 보인다",
      opened.exportShown === true && opened.copyShown === true,
      JSON.stringify({ export: opened.exportShown, copy: opened.copyShown })
    );

    check(
      "[panel desktop] cancel/save는 접든 펴든 그대로 보인다",
      closed.cancelShown === true && closed.saveShown === true,
      JSON.stringify({ cancel: closed.cancelShown, save: closed.saveShown })
    );

    /* 다시 펼치고, 출력 조건을 고른 뒤, 접었다 편다 */
    await page.click("#postEditorPreviewToggle");
    await page.waitForTimeout(350);

    await page.click("[data-ratio='uniform']");
    await page.click("#postEditorPreviewTitleToggle");
    await page.click("#postEditorPreviewSourceToggle");
    await page.waitForTimeout(400);

    /*
      ★ 접기 **직전**의 값을 그대로 들고 있다가 편 뒤와 비교한다.
      "제목이 켜졌다/꺼졌다" 같은 방향을 미리 정해 두면 프리셋의
      기본값이 바뀔 때 테스트가 엉뚱하게 깨진다 — 확인하려는 것은
      값의 방향이 아니라 **접었다 펴도 그대로인가**다.
    */

    const READ_SESSION = () => ({
      pressed: Array.from(document.querySelectorAll("[data-ratio]"))
        .filter(b => b.getAttribute("aria-pressed") === "true")
        .map(b => b.dataset.ratio),
      exportSize: document.getElementById("postEditorPreviewExportSize")
        .textContent.trim(),
      titlePressed: document.getElementById("postEditorPreviewTitleToggle")
        .getAttribute("aria-pressed"),
      sourcePressed: document.getElementById("postEditorPreviewSourceToggle")
        .getAttribute("aria-pressed"),
      bodyAlign: document.getElementById("postEditorPreviewBodyAlignSelect").value,
      open: document.getElementById("postEditorPreviewSection")
        .classList.contains("is-open")
    });

    const beforeCollapse = await page.evaluate(READ_SESSION);

    await page.click("#postEditorPreviewToggle");
    await page.waitForTimeout(250);
    await page.click("#postEditorPreviewToggle");
    await page.waitForTimeout(400);

    const kept = await page.evaluate(READ_SESSION);

    check(
      "[panel desktop] 접었다 펴도 비율·정렬·제목·출처가 그대로다",
      kept.open === true &&
      JSON.stringify(kept.pressed) === JSON.stringify(["uniform"]) &&
      JSON.stringify({ ...kept, open: null }) ===
        JSON.stringify({ ...beforeCollapse, open: null }),
      `접기 전 ${JSON.stringify(beforeCollapse)} / 편 뒤 ${JSON.stringify(kept)}`
    );

    /* (5) custom에서만 보이는 컨트롤 */
    const byMode = {};
    for (const mode of ["custom", "auto", "uniform"]) {
      await page.click(`[data-ratio='${mode}']`);
      await page.waitForTimeout(300);
      byMode[mode] = await page.evaluate(PANEL_READ);
    }

    check(
      "[panel desktop] 세로 정렬은 auto에서만 숨는다(uniform은 고를 수 있다)",
      byMode.custom.alignShown === true &&
      byMode.auto.alignShown === false &&
      byMode.uniform.alignShown === true,
      JSON.stringify({
        custom: byMode.custom.alignShown,
        auto: byMode.auto.alignShown,
        uniform: byMode.uniform.alignShown
      })
    );

    check(
      "[panel desktop] 상세 비율도 custom에서만 실제로 보인다",
      byMode.custom.customShown === true &&
      byMode.auto.customShown === false &&
      byMode.uniform.customShown === false,
      JSON.stringify({
        custom: byMode.custom.customShown,
        auto: byMode.auto.customShown,
        uniform: byMode.uniform.customShown
      })
    );

    check(
      "[panel desktop] 저장될 픽셀 크기 표시는 세 옵션에서 모두 보인다",
      ["custom", "auto", "uniform"].every(m => byMode[m].sizeShown === true),
      JSON.stringify(
        Object.fromEntries(
          Object.entries(byMode).map(([k, v]) => [k, v.sizeShown])
        )
      )
    );

    check(
      "[panel desktop] 발췌 버튼이 가운데 정렬이다",
      Math.abs(byMode.custom.toggleLeftGap - byMode.custom.toggleRightGap) <= 2,
      `왼쪽 ${byMode.custom.toggleLeftGap} / 오른쪽 ${byMode.custom.toggleRightGap}`
    );

    check("[panel desktop] 오류 없음", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* -------------------------------------------------------
     (6) 접은 채로 export — 펼친 상태와 결과가 같다
  -------------------------------------------------------- */
  {
    const { ctx, page, errors } = await openPostEditor(browser);

    const settings = { ...BASE_SETTINGS, ratio: "4:5", exportWidth: 1080 };

    await renderEditorPreview(page, {
      html: THREE_PAGE_HTML, settings, title: ""
    });

    const openSizes = await collectExportedPngs(page);

    await page.click("#postEditorPreviewToggle");
    await page.waitForTimeout(300);

    const beforeExport = await page.evaluate(PANEL_READ);

    const closedSizes = await collectExportedPngs(page, { viaHandler: true });

    const afterExport = await page.evaluate(PANEL_READ);

    check(
      "[panel export] 접힌 상태에서 불렀다(버튼은 숨어 있다)",
      beforeExport.open === false &&
      beforeExport.sectionDisplay === "none" &&
      beforeExport.exportShown === false,
      JSON.stringify({
        open: beforeExport.open, display: beforeExport.sectionDisplay,
        exportShown: beforeExport.exportShown
      })
    );

    check(
      "[panel export] 접힌 채로도 장 수와 픽셀 크기가 펼친 상태와 같다",
      closedSizes.length === openSizes.length &&
      closedSizes.length > 1 &&
      closedSizes.every((s, i) =>
        s.width === openSizes[i].width && s.height === openSizes[i].height),
      `접힘 ${closedSizes.map(s => `${s.width}×${s.height}`).join(", ")} / 펼침 ${
        openSizes.map(s => `${s.width}×${s.height}`).join(", ")}`
    );

    check(
      "[panel export] export가 끝나면 다시 접힌 채로 남는다",
      afterExport.open === false &&
      afterExport.sectionDisplay === "none" &&
      afterExport.ariaExpanded === "false",
      JSON.stringify({
        open: afterExport.open, display: afterExport.sectionDisplay
      })
    );

    check("[panel export] 오류 없음", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* -------------------------------------------------------
     (7) 모바일 — 같은 버튼, 기본은 접힘
  -------------------------------------------------------- */
  {
    const ctxMobile = await browser.newContext({ viewport: VIEWPORTS.mobile });
    const page = await ctxMobile.newPage();
    const errors = [];
    page.on("pageerror", err => errors.push(String(err.message)));

    await installSignedInUser(page);
    await installSupabaseMock(page);
    await page.goto(
      `http://localhost:${PORT}/${SLUG}/category/1?write=1`,
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 20000 });
    await page.waitForTimeout(500);

    const initial = await page.evaluate(PANEL_READ);

    check(
      "[panel mobile] 기본은 접힘이고 라벨이 '발췌 ▾'다(예전과 같다)",
      initial.open === false &&
      initial.sectionDisplay === "none" &&
      initial.label === "발췌 ▾" &&
      initial.ariaExpanded === "false",
      JSON.stringify({
        open: initial.open, label: initial.label
      })
    );

    check(
      "[panel mobile] 버튼이 부유하지 않는다(데스크톱과 같은 모양)",
      initial.position === "static" &&
      initial.boxShadow === "none" &&
      initial.borderRadius === "0px",
      JSON.stringify({
        position: initial.position, shadow: initial.boxShadow,
        radius: initial.borderRadius
      })
    );

    await page.click("#postEditorPreviewToggle");
    await page.waitForTimeout(700);

    const mobileOpen = await page.evaluate(PANEL_READ);

    check(
      "[panel mobile] 같은 버튼으로 펼쳐진다",
      mobileOpen.open === true &&
      mobileOpen.label === "발췌 접기 ▴" &&
      mobileOpen.ariaExpanded === "true",
      JSON.stringify({
        open: mobileOpen.open, label: mobileOpen.label
      })
    );

    check(
      "[panel mobile] 버튼이 가운데 정렬이다",
      Math.abs(mobileOpen.toggleLeftGap - mobileOpen.toggleRightGap) <= 2,
      `왼쪽 ${mobileOpen.toggleLeftGap} / 오른쪽 ${mobileOpen.toggleRightGap}`
    );

    check(
      "[panel mobile] 접혀 있을 때는 export/copy가 숨는다",
      initial.exportShown === false &&
      initial.copyShown === false &&
      mobileOpen.exportShown === true &&
      mobileOpen.copyShown === true,
      JSON.stringify({
        closed: [initial.exportShown, initial.copyShown],
        open: [mobileOpen.exportShown, mobileOpen.copyShown]
      })
    );

    check(
      "[panel mobile] 한국어 라벨이 가로로 넘치지 않는다",
      mobileOpen.docScroll <= mobileOpen.viewport + 1,
      `${mobileOpen.docScroll} / ${mobileOpen.viewport}`
    );

    /* 핀치 확대·이동이 그대로 있는지 — stage 제스처 핸들러 */
    const gesture = await page.evaluate(() => ({
      hasPinch: typeof handlePreviewStagePointerDown === "function" &&
        typeof handlePreviewStagePointerMove === "function",
      touchAction: getComputedStyle(
        document.getElementById("postEditorPreviewStage")
      ).touchAction,
      zoomBefore: mobilePreviewZoom
    }));

    check(
      "[panel mobile] 핀치 확대·이동 경로가 그대로 있다",
      gesture.hasPinch === true && gesture.touchAction === "none",
      JSON.stringify(gesture)
    );

    check("[panel mobile] 오류 없음", errors.length === 0, errors.join(" | "));
    await ctxMobile.close();
  }
}



/* =========================================================
   10. labels — Quote Preset 한국어 라벨

   ★ 무엇을 확인하는가

     (1) 큰 탭(CONTENT / CANVAS / TITLE·SOURCE / BODY / PRESET)과
         **헤더 행 전체**가 영어 그대로다 — 왼쪽 구역 제목뿐 아니라
         오른쪽 보조 문구(preview text · image · font · typography ·
         text · footer · save)와 화면 헤더의 부제(image style)까지
         한 쌍으로 본다.
     (2) 구역을 펼쳤을 때 나오는 설정명 · 선택값 · 동작 버튼은
         전부 한국어다.
     (3) 어느 화면에서도 잘리거나(scrollWidth > 보이는 폭) 가로로
         넘치지 않는다 — 모바일은 탭마다 본다.
     (4) 번역이 저장값을 건드리지 않는다: 폼을 채워 수집한
         settings의 **모든 값**이 예전과 같은 내부 키/enum이다.
     (5) 글꼴 이름과 서식 기호(*text* · "text")는 그대로다.
========================================================== */

const LABEL_AUDIT = () => {
  const scope = document.querySelector(".quote-controls");

  const visible = (n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  const nodes = Array.from(scope.querySelectorAll(
    "label, .quote-setting-label, option, button," +
    " .quote-accordion-title, small"
  )).filter(visible);

  const clipped = nodes
    .filter(n => {
      const r = n.getBoundingClientRect();
      return n.scrollWidth > Math.ceil(r.width) + 1 ||
             n.scrollHeight > Math.ceil(r.height) + 1;
    })
    .map(n => (n.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24));

  return {
    checked: nodes.length,
    clipped,
    panelOverflow: scope.scrollWidth > scope.clientWidth + 1,
    docOverflow:
      document.documentElement.scrollWidth > window.innerWidth + 1
  };
};


async function runLabels(browser) {
  console.log("\n[labels] Quote Preset 한국어 라벨");

  const OPEN_ALL = () => {
    document.querySelectorAll(".quote-accordion").forEach(node => {
      node.classList.add("is-open");
      const content = node.querySelector(".quote-accordion-content");
      if (content) content.hidden = false;
    });
    const compat = document.getElementById("quoteCanvasOutputCompat");
    if (compat) compat.hidden = false;
  };

  /* -------------------------------------------------------
     (1)(2) 데스크톱 — 무엇이 영어로 남고 무엇이 한국어인가
  -------------------------------------------------------- */
  {
    const { ctx, page, errors } = await openQuotePanel(browser);
    await page.evaluate(OPEN_ALL);
    await page.waitForTimeout(400);

    const texts = await page.evaluate(() => {
      const t = (n) => (n.textContent || "").replace(/\s+/g, " ").trim();
      return {
        tabs: Array.from(
          document.querySelectorAll(".quote-mobile-tab")
        ).map(t),
        sections: Array.from(
          document.querySelectorAll(".quote-accordion-title")
        ).map(t),
        /*
          헤더 행의 오른쪽 보조 문구.

          ★ 지문/대사가 BODY 안의 작은 그리드에서 **독립 섹션**
          (NARRATION / DIALOGUE)으로 나왔다. 그 둘의 보조 문구는
          서식 기호(*text* · "text")이고, 이제 헤더 행에 있다 —
          기호도 영어 취급이므로 이 목록에 그대로 들어온다.
        */
        sectionCaptions: Array.from(
          document.querySelectorAll(".quote-accordion-toggle small")
        ).map(t),
        screenSubtitle: t(document.querySelector(".view-heading p")),
        labels: Array.from(
          document.querySelectorAll(".quote-controls label")
        ).map(t),
        settingLabels: Array.from(
          document.querySelectorAll(".quote-controls .quote-setting-label")
        ).map(t),
        options: Array.from(
          document.querySelectorAll(".quote-controls option")
        ).map(t),
        presetButtons: [
          t(document.getElementById("quoteNewButton")),
          t(document.getElementById("quoteSaveButton"))
        ],
        ratioButtons: Array.from(
          document.querySelectorAll(".quote-ratio-button")
        ).map(t),
        /*
          서식 기호는 NARRATION / DIALOGUE 섹션 헤더의 보조 문구다
          (예전에는 BODY 안 .quote-special-heading small).
        */
        syntaxHints: Array.from(
          document.querySelectorAll(".quote-accordion")
        )
          .filter(section => {

            const title =
              t(section.querySelector(".quote-accordion-title"));


            return title === "NARRATION" ||
              title === "DIALOGUE";

          })
          .map(section =>
            t(section.querySelector(".quote-accordion-toggle small"))
          )
      };
    });

    check(
      "[labels] 큰 탭 다섯 개는 영어 그대로다",
      JSON.stringify(texts.tabs) === JSON.stringify(
        ["CONTENT", "CANVAS", "TITLE·SOURCE", "BODY", "PRESET"]
      ),
      texts.tabs.join(" / ")
    );

    check(
      "[labels] 구역 제목도 영어 그대로다",
      texts.sections.every(s => !/[가-힣]/.test(s)) &&
      texts.sections.length >= 6,
      texts.sections.join(" / ")
    );

    /*
      ★ 헤더 행은 왼쪽 제목과 오른쪽 보조 문구가 한 쌍이다.
      한쪽만 한국어가 되면 같은 줄 안에서 언어가 갈린다.
    */
    check(
      "[labels] 헤더 행의 오른쪽 보조 문구도 영어 그대로다",
      JSON.stringify(texts.sectionCaptions) === JSON.stringify(
        ["preview text", "image", "font", "typography", "text",
         "*text*", "\"text\"", "footer", "save"]
      ),
      texts.sectionCaptions.join(" / ")
    );

    check(
      "[labels] 화면 헤더의 부제도 영어 그대로다",
      texts.screenSubtitle === "image style",
      texts.screenSubtitle
    );

    const korean = (list) => list.filter(s => /[가-힣]/.test(s));
    const notKorean = (list) => list.filter(s => !/[가-힣]/.test(s));

    check(
      "[labels] 설정명(label)이 전부 한국어다",
      texts.labels.length >= 40 &&
      notKorean(texts.labels).length === 0,
      `${korean(texts.labels).length}/${texts.labels.length} · 남은 영어: ${
        notKorean(texts.labels).join(", ") || "없음"}`
    );

    check(
      "[labels] SAVED PRESETS 같은 설정명도 한국어다",
      notKorean(texts.settingLabels).length === 0,
      texts.settingLabels.join(" / ")
    );

    /*
      선택값 중 글꼴 이름(Pretendard)만 영어로 남는다 — 고유명사라
      번역하지 않는다(요구사항).
    */
    check(
      "[labels] 선택값도 한국어다(글꼴 이름만 예외)",
      notKorean(texts.options).every(s => s === "Pretendard"),
      `남은 영어: ${notKorean(texts.options).join(", ") || "없음"}`
    );

    check(
      "[labels] 프리셋 동작 버튼이 한국어다",
      JSON.stringify(texts.presetButtons) ===
        JSON.stringify(["새로 만들기", "덮어쓰기"]),
      texts.presetButtons.join(" / ")
    );

    /*
      ★ 비율 옵션은 Preview와 같은 셋(uniform / auto / custom)이다.
      화면에 보이는 글자만 한국어이고 data-ratio 값은 그대로다
      (저장되는 enum — [legacy] 절에서 확인).
    */
    check(
      "[labels] 비율 버튼 셋이 한국어다",
      JSON.stringify(texts.ratioButtons) ===
        JSON.stringify(["같은 높이", "자동 높이", "직접 입력"]),
      texts.ratioButtons.join(" / ")
    );

    check(
      "[labels] 서식 기호(*text* · \"text\")는 그대로다",
      JSON.stringify(texts.syntaxHints) ===
        JSON.stringify(["*text*", "\"text\""]),
      texts.syntaxHints.join(" / ")
    );

    const audit = await page.evaluate(LABEL_AUDIT);

    check(
      "[labels desktop] 잘림·가로 넘침이 없다",
      audit.clipped.length === 0 &&
      audit.panelOverflow === false &&
      audit.docOverflow === false &&
      audit.checked > 60,
      JSON.stringify(audit)
    );

    check("[labels] 오류 없음", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* -------------------------------------------------------
     (3) 모바일 — 탭마다
  -------------------------------------------------------- */
  {
    const { ctx, page, errors } =
      await openQuotePanel(browser, { viewport: "mobile" });

    for (const tab of ["content", "canvas", "title-source", "body", "preset"]) {
      await page.click(`[data-quote-mobile-tab-target="${tab}"]`);
      await page.waitForTimeout(300);
      await page.evaluate(OPEN_ALL);
      await page.waitForTimeout(250);

      const audit = await page.evaluate(LABEL_AUDIT);

      check(
        `[labels mobile ${tab}] 잘림·겹침·가로 넘침이 없다`,
        audit.clipped.length === 0 &&
        audit.panelOverflow === false &&
        audit.docOverflow === false &&
        audit.checked > 0,
        JSON.stringify(audit)
      );
    }

    check("[labels mobile] 오류 없음", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* -------------------------------------------------------
     (4) 저장값 — 번역이 내부 키/enum을 건드리지 않는다
  -------------------------------------------------------- */
  {
    const { ctx, page, errors } = await openQuotePanel(browser);

    /*
      ★ ratio만은 옛 고정 비율("4:5")이 custom + 가로 비/세로 비로
      **의도적으로** 바뀐다(손실 없는 대응 — [legacy] 절에서 값이
      보존되는지 따로 확인한다). 나머지 키는 한 글자도 달라지면
      안 된다.
    */
    const roundTrip = await page.evaluate((source) => {
      applyQuoteSettings(source);
      const collected = collectQuoteSettings();
      const differs = Object.keys(source).filter(
        key =>
          key !== "ratio" &&
          JSON.stringify(collected[key]) !== JSON.stringify(source[key])
      );
      return { collected, differs };
    }, BASE_SETTINGS);

    check(
      "[labels] 폼을 채웠다 다시 수집해도 저장값이 그대로다(enum·키 불변)",
      roundTrip.differs.length === 0,
      roundTrip.differs.length
        ? roundTrip.differs.map(
            k => `${k}: ${JSON.stringify(roundTrip.collected[k])}`
          ).join(", ")
        : "전부 일치"
    );

    check(
      "[labels] 옛 고정 비율은 custom + 같은 비율로만 바뀐다",
      roundTrip.collected.ratio === "custom" &&
      Number(roundTrip.collected.ratioWidth) === 4 &&
      Number(roundTrip.collected.ratioHeight) === 5,
      JSON.stringify({
        ratio: roundTrip.collected.ratio,
        ratioWidth: roundTrip.collected.ratioWidth,
        ratioHeight: roundTrip.collected.ratioHeight
      })
    );

    check(
      "[labels] 굵기·정렬·줄바꿈 값이 여전히 내부 값이다",
      roundTrip.collected.bodyWeight === "500" &&
      roundTrip.collected.bodyAlign === "left" &&
      roundTrip.collected.verticalAlign === "top" &&
      roundTrip.collected.lineBreak === "keep" &&
      roundTrip.collected.bodyFont === "pretendard",
      JSON.stringify({
        weight: roundTrip.collected.bodyWeight,
        align: roundTrip.collected.bodyAlign,
        vertical: roundTrip.collected.verticalAlign,
        lineBreak: roundTrip.collected.lineBreak,
        font: roundTrip.collected.bodyFont
      })
    );

    check("[labels] 저장값 오류 없음", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
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
    if (shouldRun("paragraph")) await runParagraph(browser);
    if (shouldRun("parity")) await runParity(browser);
    if (shouldRun("legacy")) await runLegacy(browser);
    if (shouldRun("export")) await runExport(browser);
    if (shouldRun("published")) await runPublished(browser);
    if (shouldRun("uniform")) await runUniform(browser);
    if (shouldRun("options")) await runOptions(browser);
    if (shouldRun("cache")) await runCache(browser);
    if (shouldRun("panel")) await runPanel(browser);
    if (shouldRun("labels")) await runLabels(browser);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n결과: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
})();
