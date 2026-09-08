/* =========================================================
   작성·관리 동선 + CATEGORY EDIT + 모바일 POST 읽기 모드 — 공개 화면 E2E

   실사용자가 보고한 세 가지를 실제 화면에서 확인한다:
   1. WRITE를 누르면 옛 LOG 관리 목록이 먼저 나온다.
   2. 탐색/관리 전환 중 옛 로딩 화면이나 흰색 페이드가 남아 있다.
   3. 배너 이미지가 원본 크기대로 나와서 크기가 제각각이다.

   skin/skin-banner-page-e2e-test.mjs와 같은 방식/같은 규약이다
   (정적 서버 + Supabase 네트워크만 mock + 저장소의 실제 파일).
   그 파일이 BANNER/viewer 링크와 POST 수정 동선을 담당하므로,
   여기서는 겹치는 검증을 반복하지 않고 다음에 집중한다:

   - WRITE 진입 (카테고리 0개 / 1개 / 여러 개 — 고르는 중간 화면 없음)
   - 카테고리 + → 작성 폼, 취소 → 스킨 복귀 (스크롤 포함)
   - 목록 관리 패널 진입/종료 중 legacy 커튼·로딩 화면 미노출
   - 뒤로가기/앞으로가기/새로고침에서 화면과 주소 일치
   - 비소유자 차단
   - Quiet Frame v4의 배너 표시 폭(240px, 좁은 화면 축소, 비율 유지 — v3 그대로)

   PHASE 1H로 두 묶음이 더 붙었다:

   - CATEGORY의 INDEX 자리: 소유자에게 EDIT(?manage=1), 방문자에게 INDEX.
     스킨이 그 진입점을 그리면 플랫폼의 떠 있는 + / edit은 접히고,
     그리지 않는 기존 스킨(imory-diary-v0.1)에서는 그대로 남는다.
   - 모바일 POST 읽기 모드: 목록에서 글을 열면 사이드바가 접히고(전환을
     실제로 캡처한다), 직접 접속은 처음부터 접힌 상태, POST→POST는 다시
     펼치지 않고, 목록으로 돌아오면 사이드바와 스크롤이 복원된다.
     데스크톱은 그대로다.

   ★ 무엇을 mock하는가
   Supabase REST/RPC 응답과 로그인 상태뿐이다. HTML/CSS/JS는 저장소의
   실제 파일을 그대로 정적 서빙한다. 저장/삭제의 실제 DB 반영은 여기서
   검증하지 않는다(mock 응답이다) — 화면 전환과 주소만 본다.

   ★ 실행 방법
     node skin/skin-write-manage-e2e-test.mjs
     node skin/skin-write-manage-e2e-test.mjs --browser=webkit
     node skin/skin-write-manage-e2e-test.mjs --browser=webkit --only=post-focus

   --only= 뒤에 쓸 수 있는 이름: write / category-tools / history / slow /
   banner / edit-entry / post-focus
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8936;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_USER_ID = "99999999-8888-7777-6666-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");

/* --only=post-focus 처럼 묶음 하나만 돌린다 — 브라우저 호환성이 걸리는
   경로만 WebKit으로 한 번 더 볼 때 전체 스위트를 반복하지 않기 위해서다.
   생략하면 지금까지처럼 전부 돈다. */
const ONLY = argOf("only", "");

function shouldRun(name) {
  return !ONLY || ONLY === name;
}


/* =========================================================
   playwright 찾기 — skin-banner-page-e2e-test.mjs와 동일 전략
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

  const tried = [];
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
    } catch (err) {
      tried.push(String(err.message).split("\n")[0]);
    }
  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다.\n` +
    `시도: ${tried.join(" | ") || "설치 없음"}\n` +
    `\`npx playwright install ${browserName}\`을 먼저 실행하세요.`
  );
}


/* =========================================================
   실제 저장소를 그대로 서빙 (SPA fallback 포함)
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".glb": "model/gltf-binary"
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

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(fs.readFileSync(path.join(ROOT, "index.html")));
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   SkinPackage — 이번 작업의 산출물(v4)을 기본으로 쓴다.
   V2는 배너 크기 대조군, DIARY는 "소유자 진입점을 전혀 그리지 않는
   기존 스킨" 대조군이다(플랫폼 기본 도구가 그대로 남아야 한다).
========================================================== */

const SKIN_PACKAGE = JSON.parse(
  fs.readFileSync(path.join(HERE, "test-skins", "imory-quiet-frame-v4.json"), "utf8")
);

const V2_PACKAGE = JSON.parse(
  fs.readFileSync(path.join(HERE, "test-skins", "imory-quiet-frame-v2.json"), "utf8")
);

const DIARY_PACKAGE = JSON.parse(
  fs.readFileSync(path.join(HERE, "test-skins", "imory-diary-v0.1.json"), "utf8")
);


/* 배너 원본은 프레임보다 훨씬 넓은 가로 이미지 — "원본이 크면 줄어들고,
   비율은 그대로"를 실제 픽셀로 잰다. 작은 배너(40x12)는 v2 검증에서
   이미 다루므로 여기서는 큰 쪽만 본다. */

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  c = -1;
  for (let i = 0; i < buf.length; i++) c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      raw[p] = rgb[0];
      raw[p + 1] = rgb[1];
      raw[p + 2] = rgb[2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const WIDE_W = 800;
const WIDE_H = 200;
const WIDE_PNG = makePng(WIDE_W, WIDE_H, [180, 190, 200]);

const TALL_W = 120;
const TALL_H = 300;
const TALL_PNG = makePng(TALL_W, TALL_H, [200, 180, 190]);


/* =========================================================
   DB fixture

   categories에 POST 타입을 둘 두는 게 이 파일의 기본값이다 —
   "쓸 수 있는 카테고리가 여러 개"가 실사용자의 기본 상황이기
   때문이다. 여러 개여도 고르는 중간 화면 없이 첫 카테고리의 작성
   폼이 열리고, 다른 데 쓰려면 폼의 CATEGORY 드롭다운에서 바꾼다.
   하나뿐인 계정과 하나도 없는 계정은 아래에서 fixture를 갈아끼워
   따로 확인한다. banner 타입 카테고리("링크")를 함께 두는 이유는
   그 드롭다운에 섞이지 않는지 보기 위해서다.
========================================================== */

function makeDb({ postCategories = 2, withSecret = false, extraPosts = 0 } = {}) {
  const categories = [];
  if (postCategories >= 1) {
    categories.push({ id: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1 });
  }
  if (postCategories >= 2) {
    categories.push({ id: 3, user_id: OWNER_ID, name: "메모", type: "post", sort_order: 3 });
  }
  categories.push({ id: 2, user_id: OWNER_ID, name: "링크", type: "banner", sort_order: 2 });

  return {
    profiles: [{
      user_id: OWNER_ID, slug: SLUG, home_mode: "customize",
      nickname: "테스트 사용자", bio: "E2E 테스트 계정"
    }],
    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "IMORY E2E" },
      { user_id: OWNER_ID, key: "favicon_url", value: "" }
    ],
    categories,
    posts: [
      { id: 101, user_id: OWNER_ID, category_id: 1, title: "첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", quote_preset_id: null },
      { id: 102, user_id: OWNER_ID, category_id: 1, title: "두 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-02T02:00:00Z", quote_preset_id: null },
      ...(withSecret
        ? [{ id: 103, user_id: OWNER_ID, category_id: 1, title: "비밀 글", content_type: "text", visibility: "secret", created_at: "2026-09-03T02:00:00Z", quote_preset_id: null }]
        : [])
    ],
    post_contents: [
      { post_id: 101, content: "첫 번째 글 본문입니다." },
      { post_id: 102, content: "두 번째 글 본문입니다." },
      { post_id: 103, content: "비밀 글 본문입니다." }
    ],
    banners: [
      { id: 1, user_id: OWNER_ID, category_id: 2, name: "넓은 배너", url: "https://friend.example/", image_url: "https://img.example/wide.png", image_path: null, sort_order: 1 },
      { id: 2, user_id: OWNER_ID, category_id: 2, name: "세로 배너", url: "https://friend2.example/", image_url: "https://img.example/tall.png", image_path: null, sort_order: 2 }
    ],
    quote_presets: [],
    skins: [{ id: 1, user_id: OWNER_ID, is_active: true }]
  };
}

/* 목록 스크롤 복원을 재려면 목록이 실제로 스크롤될 만큼 길어야 한다 —
   글 두 개짜리 기본 fixture는 좁은 화면에서도 한 화면에 다 들어간다. */
function makeLongListDb(count = 16) {
  const db = makeDb();
  for (let i = 0; i < count; i++) {
    const id = 200 + i;
    db.posts.push({
      id, user_id: OWNER_ID, category_id: 1, title: `채우기 글 ${i + 1}`,
      content_type: "text", visibility: "public",
      created_at: `2026-08-${String(i + 1).padStart(2, "0")}T02:00:00Z`,
      quote_preset_id: null
    });
    db.post_contents.push({ post_id: id, content: `채우기 본문 ${i + 1}` });
  }
  return db;
}

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function queryTable(db, table, params) {
  let rows = (db[table] || []).map(r => ({ ...r }));

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
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
      if (op === "gt") return Number(cur) > Number(val);
      if (op === "gte") return Number(cur) >= Number(val);
      if (op === "lt") return Number(cur) < Number(val);
      return Number(cur) <= Number(val);
    });
  }

  const order = params.get("order");
  if (order) {
    for (const clause of order.split(",").reverse()) {
      const [col, ...rest] = clause.split(".");
      const desc = rest.includes("desc");
      rows.sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (desc ? -1 : 1)));
    }
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

async function installSupabaseMock(page, opts = {}) {
  const {
    skin = SKIN_PACKAGE,
    db = makeDb(),
    slowMs = 0,
    slowWhen = null
  } = opts;

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (slowMs && slowWhen && slowWhen(url.pathname + url.search)) {
      await new Promise(r => setTimeout(r, slowMs));
    }

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 401, headers, contentType: "application/json",
        body: JSON.stringify({ message: "no session" })
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      const body = fn === "get_published_skin"
        ? { skin, schemaVersion: skin.schemaVersion, imageSlotValues: {} }
        : null;
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify(body)
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const rows = queryTable(db, url.pathname.slice("/rest/v1/".length), url.searchParams);
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

  await page.route("https://img.example/wide.png", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: WIDE_PNG }));
  await page.route("https://img.example/tall.png", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: TALL_PNG }));

  for (const pattern of [
    "https://fonts.googleapis.com/**",
    "https://fonts.gstatic.com/**",
    "https://cdn.jsdelivr.net/gh/**",
    "https://unpkg.com/**"
  ]) {
    await page.route(pattern, r => r.abort());
  }
}

async function installSignedInUser(page, userId) {
  await page.addInitScript((id) => {
    let stored;
    Object.defineProperty(window, "supabase", {
      configurable: true,
      get() { return stored; },
      set(value) {
        if (value && typeof value.createClient === "function" && !value.__imoryPatched) {
          const originalCreateClient = value.createClient.bind(value);
          value.createClient = (...clientArgs) => {
            const client = originalCreateClient(...clientArgs);
            const session = { user: { id }, access_token: "mock", expires_at: 4102444800 };
            client.auth.getSession = async () => ({ data: { session }, error: null });
            client.auth.getUser = async () => ({ data: { user: session.user }, error: null });
            return client;
          };
          value.__imoryPatched = true;
        }
        stored = value;
      }
    });
  }, userId);
}


/* =========================================================
   러너
========================================================== */

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

const VIEWPORTS = {
  "mobile-390": { width: 390, height: 844 },
  "desktop-1280": { width: 1280, height: 900 }
};

let playwright;

async function launchBrowser() {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await playwright[BROWSER].launch();
    } catch (err) {
      lastError = err;
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  throw lastError;
}

async function withPage(viewport, opts, fn) {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ...(opts.reducedMotion ? { reducedMotion: "reduce" } : {})
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  let reloads = -1;
  page.on("load", () => { reloads++; });
  if (opts.signedInAs) await installSignedInUser(page, opts.signedInAs);
  await installSupabaseMock(page, opts);
  try {
    return await fn(page, { errors, reloadCount: () => reloads });
  } finally {
    await browser.close();
  }
}

const BASE = `http://localhost:${PORT}`;

const gotoHome = async page => {
  await page.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 15000 });
  await page.waitForTimeout(350);
};


/* 화면 상태 한 번에 읽기 — 특정 스킨 클래스가 아니라 플랫폼이
   소유한 id/클래스만 본다. */

const READ_SCREEN = `(() => {
  const el = id => document.getElementById(id);
  const visible = node => Boolean(node) && !node.hidden &&
    getComputedStyle(node).display !== "none";
  const container = el("postContainer");
  const area = el("postArea");
  const header = document.querySelector(".post-header");
  return {
    areaOpen: Boolean(area) && !area.hidden,
    areaOpacity: area ? getComputedStyle(area).opacity : null,
    editorVisible: visible(el("postEditor")),
    editorMode: document.body.classList.contains("post-editor-mode"),
    editorTitle: el("postEditorTitle") ? el("postEditorTitle").value : null,
    editorCategory: el("postEditorCategory") ? el("postEditorCategory").value : null,
    deleteVisible: visible(el("postEditorDeleteButton")),
    editorCategoryOptions: el("postEditorCategory")
      ? [...el("postEditorCategory").options].map(o => o.textContent.trim())
      : null,
    noticeVisible: visible(el("postComposeNotice")),
    noticeAdminVisible: visible(el("postComposeNoticeAdmin")),
    noticeHint: el("postComposeNoticeHint") ? el("postComposeNoticeHint").textContent : null,
    skinInList: Boolean(document.querySelector("#postList .imory-skin-root")),
    legacyItems: document.querySelectorAll("#postList .post-list-item").length,
    listVisible: visible(el("postList")),
    listText: el("postList") ? el("postList").textContent.trim() : "",
    detailVisible: visible(el("postDetail")),
    skinPostVisible: visible(el("postSkinContainer")),
    selectBarVisible: visible(el("postListSelectBar")),
    addVisible: visible(el("postAddButton")),
    listEditVisible: visible(el("postListEditToggleButton")),
    manageVisible: visible(el("postManageToggleButton")),
    pendingVisible: visible(el("postPendingIndicator")),
    skinActive: Boolean(container) && container.className.includes("post-container--skin-active"),
    ownerTools: Boolean(container) && container.className.includes("post-container--owner-tools"),
    headerPosition: header ? getComputedStyle(header).position : null,
    areaPadding: area ? getComputedStyle(area).padding : null,
    url: location.pathname + location.search
  };
})()`;


/* ---------------------------------------------------------
   1) WRITE 진입 — 카테고리 개수별
--------------------------------------------------------- */

async function testWriteEntry(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] WRITE 진입`);

  /* 카테고리 여러 개 → 고르는 화면 없이 곧장 작성 폼 */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await gotoHome(page);

    const href = await page.evaluate(() =>
      document.querySelector(".quiet-owner-link").getAttribute("href"));

    check(`[${vpName}] 카테고리가 여러 개면 WRITE는 HOME 작성 주소를 가리킨다`,
      href === `/${SLUG}?write=1`, String(href));

    await page.click(`.quiet-owner-link[href$="?write=1"]`);
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);

    const editor = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] WRITE → 고르는 화면 없이 첫 카테고리의 작성 폼이 열린다`,
      editor.editorVisible && editor.editorMode && editor.editorCategory === "1" &&
      !editor.noticeVisible && !editor.legacyItems && !editor.listVisible &&
      !editor.skinInList && !editor.deleteVisible,
      JSON.stringify(editor));

    check(`[${vpName}] 어느 카테고리에 쓸지는 폼의 CATEGORY 드롭다운이 담당한다`,
      (editor.editorCategoryOptions || []).join("/") === "일기/메모",
      JSON.stringify(editor.editorCategoryOptions));

    check(`[${vpName}] 작성 폼 주소가 그 카테고리를 가리킨다`,
      editor.url === `/${SLUG}/category/1?write=1`, editor.url);

    check(`[${vpName}] 작성 폼은 스킨 mount contract를 벗고 legacy 프레임을 쓴다`,
      !editor.skinActive && !editor.ownerTools,
      JSON.stringify(editor));

    /* 드롭다운으로 대상 카테고리를 바꾼다 — 이게 옛 선택 패널의 대체다 */
    await page.selectOption("#postEditorCategory", "3");
    await page.waitForTimeout(200);

    check(`[${vpName}] 드롭다운에서 다른 카테고리로 바꿀 수 있다`,
      await page.evaluate(() =>
        document.getElementById("postEditorCategory").value) === "3",
      "editorCategory");

    check(`[${vpName}] WRITE 흐름 전체에서 문서 재로드 없음`,
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    /* 취소 → 진입 전 HOME */
    await page.click("#postEditorCancelButton");
    await page.waitForTimeout(700);

    const back = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 취소하면 진입 전 HOME으로 돌아가고 주소도 정리된다`,
      !back.areaOpen && !back.editorVisible && back.url === `/${SLUG}`,
      JSON.stringify(back));

    check(`[${vpName}] WRITE 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 카테고리 하나 → 선택 없이 곧장 작성 폼 */
  await withPage(vp, { signedInAs: OWNER_ID, db: makeDb({ postCategories: 1 }) }, async (page, ctx) => {
    await gotoHome(page);

    const href = await page.evaluate(() =>
      document.querySelector(".quiet-owner-link").getAttribute("href"));

    check(`[${vpName}] 카테고리가 하나면 WRITE가 그 카테고리 작성 주소를 가리킨다`,
      href === `/${SLUG}/category/1?write=1`, String(href));

    await page.click(`.quiet-owner-link[href$="?write=1"]`);
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);

    const editor = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 카테고리가 하나면 고르는 단계 없이 바로 작성 폼`,
      editor.editorVisible && !editor.noticeVisible && editor.editorCategory === "1" &&
      editor.url === `/${SLUG}/category/1?write=1`,
      JSON.stringify(editor));

    check(`[${vpName}] 단일 카테고리 WRITE 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 카테고리 0개 → 안내 + 관리 진입점 */
  await withPage(vp, { signedInAs: OWNER_ID, db: makeDb({ postCategories: 0 }) }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`.quiet-owner-link[href$="?write=1"]`);
    await page.waitForSelector("#postComposeNotice:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);

    const empty = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 글 카테고리가 없으면 안내와 설정 진입점을 준다`,
      empty.noticeVisible && !empty.editorVisible &&
      empty.noticeAdminVisible && (empty.noticeHint || "").includes("카테고리"),
      JSON.stringify(empty));

    check(`[${vpName}] 카테고리 없음 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 비소유자 — 직접 주소로도 열리지 않는다 */
  await withPage(vp, { signedInAs: OTHER_USER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1?write=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(700);

    const visitor = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 다른 계정이 ?write=1로 들어와도 작성 폼이 열리지 않고 주소가 정리된다`,
      !visitor.editorVisible && !visitor.noticeVisible && visitor.skinInList &&
      !visitor.addVisible && visitor.url === `/${SLUG}/category/1`,
      JSON.stringify(visitor));

    check(`[${vpName}] 비소유자 작성 URL 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 로그아웃 방문자 — HOME ?write=1 */
  await withPage(vp, {}, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/?write=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(700);

    const anon = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 로그아웃 방문자의 ?write=1은 그냥 HOME이 되고 주소도 정리된다`,
      !anon.editorVisible && !anon.noticeVisible && !anon.areaOpen &&
      anon.url === `/${SLUG}`,
      JSON.stringify(anon));

    check(`[${vpName}] 로그아웃 작성 URL 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   2) CATEGORY + / 목록 관리 패널 — 전환 중 legacy 화면 미노출
--------------------------------------------------------- */

async function testCategoryTools(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] CATEGORY + / 목록 관리`);

  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(400);

    const scrollBefore = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      area.scrollTop = 90;
      return area.scrollTop;
    });

    /* PHASE 1H: 스킨이 자기 자리에 WRITE/EDIT을 그렸으므로 떠 있는
       플랫폼 도구(+ / edit)는 접혀 있어야 한다 — 같은 동작이 화면에
       두 번 나오지 않는다. */
    const folded = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 스킨이 진입점을 그렸으면 떠 있는 + / edit 도구가 접힌다`,
      !folded.addVisible && !folded.listEditVisible && !folded.ownerTools &&
      folded.skinInList,
      JSON.stringify(folded));

    /* 스킨의 WRITE → 그 카테고리의 작성 폼 */
    const categoryWriteHref = await page.evaluate(() => {
      const a = document.querySelector('#postList .quiet-owner-link[href*="write=1"]');
      return a ? a.getAttribute("href") : null;
    });

    check(`[${vpName}] CATEGORY 화면의 WRITE는 지금 보고 있는 카테고리를 가리킨다`,
      categoryWriteHref === `/${SLUG}/category/1?write=1`, String(categoryWriteHref));

    await page.click('#postList .quiet-owner-link[href*="write=1"]');
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);

    const editor = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 스킨 CATEGORY의 WRITE는 곧장 그 카테고리의 작성 폼을 연다`,
      editor.editorVisible && editor.editorCategory === "1" &&
      !editor.listVisible && !editor.detailVisible && !editor.skinPostVisible,
      JSON.stringify({ ...editor, listText: undefined }));

    check(`[${vpName}] WRITE로 연 작성 폼도 주소가 화면과 일치한다`,
      editor.url === `/${SLUG}/category/1?write=1`, editor.url);

    check(`[${vpName}] 작성 중에는 스킨용 소유자 도구가 남지 않는다`,
      !editor.ownerTools && editor.headerPosition === "relative",
      JSON.stringify(editor));

    /* 취소 → 스킨 CATEGORY + 스크롤 복원 */
    await page.click("#postEditorCancelButton");
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(700);

    const back = await page.evaluate(READ_SCREEN);
    const scrollAfter = await page.evaluate(() =>
      document.getElementById("postArea").scrollTop);

    check(`[${vpName}] 취소하면 그 카테고리 스킨으로 돌아오고 주소도 정리된다`,
      back.skinInList && !back.editorVisible && back.skinActive && !back.ownerTools &&
      back.url === `/${SLUG}/category/1`,
      JSON.stringify(back));

    check(`[${vpName}] 취소 후 스킨 프레임 여백이 그대로 유지된다`,
      back.areaPadding === "0px", String(back.areaPadding));

    check(`[${vpName}] 취소하면 진입 전 스크롤 위치로 돌아온다`,
      Math.abs(scrollAfter - scrollBefore) <= 2,
      `before=${scrollBefore} after=${scrollAfter}`);

    /* 스킨의 EDIT → 기존 목록 관리 화면.

       FOLDER-1부터 이 화면은 "폴더 트리 + 글 체크박스 + 하단 선택삭제
       바"가 한 화면에 있는 정리 화면이다(사용자 결정 F-2: 정리 모드와
       삭제 모드를 따로 만들지 않는다). 예전에는 여기서 읽기 목록이
       먼저 나오고 edit을 한 번 더 눌러야 선택삭제가 열렸는데, 스킨의
       manageHref가 이 주소를 가리키기 시작한 뒤로는 "관리하러 왔는데
       읽기 목록이 나온다"가 됐다.

       글 행은 트리 안에서도 기존 .post-list-item 클래스를 그대로 쓰므로
       legacyItems 계산(2개)은 예전과 같다. */
    await page.click('#postList .quiet-back-edit');
    await page.waitForTimeout(600);

    const managed = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 스킨의 EDIT은 기존 목록 관리 화면으로 들어간다`,
      managed.legacyItems === 2 && !managed.skinInList && !managed.skinActive &&
      managed.listEditVisible && managed.addVisible &&
      managed.url === `/${SLUG}/category/1?manage=1`,
      JSON.stringify(managed));

    check(`[${vpName}] 관리 화면은 들어가자마자 선택삭제 바와 함께 열린다(FOLDER-1)`,
      managed.selectBarVisible && managed.legacyItems === 2,
      JSON.stringify(managed));

    check(`[${vpName}] 관리 화면에 폴더 트리와 + folder 진입점이 있다(FOLDER-1)`,
      await page.evaluate(() => Boolean(
        document.querySelector("#postList .folder-tree") &&
        document.querySelector("#postList .folder-tree-add-button") &&
        document.querySelector("#postList .folder-tree-container") &&
        document.querySelectorAll("#postList .tree-drag-handle").length === 2
      )),
      await page.evaluate(() => document.getElementById("postList").className +
        " / handles=" + document.querySelectorAll("#postList .tree-drag-handle").length));

    await page.click("#postListEditToggleButton");
    await page.waitForTimeout(500);

    const unselected = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 관리 화면의 edit를 끄면 선택삭제가 닫히고 주소는 그대로 유지된다`,
      !unselected.selectBarVisible && unselected.legacyItems === 2 &&
      unselected.url === `/${SLUG}/category/1?manage=1`,
      JSON.stringify(unselected));

    await page.click("#postListEditToggleButton");
    await page.waitForTimeout(500);

    const manage = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] edit를 다시 켜면 선택삭제 패널이 예전 그대로 열린다`,
      manage.selectBarVisible && manage.legacyItems === 2 && !manage.skinInList,
      JSON.stringify(manage));

    /* 관리 화면에서 나가는 길은 주소 계약 그대로다 — ?manage=1은
       pushState로 쌓였으므로 뒤로가기가 그 카테고리 스킨으로 되돌린다. */
    await page.goBack();
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(700);

    const closed = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 관리 화면에서 뒤로가기하면 그 카테고리 스킨으로 돌아온다`,
      closed.skinInList && !closed.selectBarVisible && closed.skinActive &&
      !closed.addVisible && !closed.listEditVisible &&
      closed.url === `/${SLUG}/category/1`,
      JSON.stringify(closed));

    check(`[${vpName}] CATEGORY 도구 경로 전체에서 문서 재로드 없음`,
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    check(`[${vpName}] CATEGORY 도구 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* ?manage=1 직접 접속: 옛 로딩 화면("...") 없이 관리 패널이 열린다 */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    const seen = [];
    await page.goto(`${BASE}/${SLUG}/category/1?manage=1`, { waitUntil: "domcontentloaded" });

    /* 화면이 확정될 때까지 짧은 간격으로 실제 DOM을 훑어서
       "loading..." / "..." 같은 legacy 자리표시가 한 번이라도
       그려지는지 본다. */
    for (let i = 0; i < 40; i++) {
      seen.push(await page.evaluate(() => {
        const list = document.getElementById("postList");
        const title = document.querySelector(".post-page-title");
        return {
          list: list ? list.textContent.trim().slice(0, 40) : "",
          title: title ? title.textContent : ""
        };
      }));
      await page.waitForTimeout(60);
    }

    const sawLoading = seen.some(s => s.list.includes("loading...") || s.title === "...");
    const manage = await page.evaluate(READ_SCREEN);

    /* FOLDER-1: 직접 접속도 스킨 EDIT 경로와 같은 화면이어야 한다 —
       들어가자마자 정리 화면(트리 + 체크박스 + 선택삭제 바)이다. */
    check(`[${vpName}] ?manage=1 직접 접속에서 관리 패널이 열린다`,
      manage.selectBarVisible === true && manage.legacyItems === 2 &&
      manage.addVisible && manage.listEditVisible &&
      manage.url === `/${SLUG}/category/1?manage=1`,
      JSON.stringify(manage));

    check(`[${vpName}] 관리 진입 중 옛 로딩 자리표시("loading..."/"...")가 한 번도 안 나온다`,
      !sawLoading, JSON.stringify(seen.filter(s => s.list || s.title).slice(0, 4)));

    check(`[${vpName}] 관리 진입 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   3) 뒤로가기 / 앞으로가기 / 새로고침 — 화면과 주소 일치
--------------------------------------------------------- */

async function testHistory(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 뒤로가기 / 새로고침`);

  await withPage(vp, { signedInAs: OWNER_ID, db: makeDb({ postCategories: 1 }) }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.click('#postList .quiet-owner-link[href*="write=1"]');
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);

    await page.goBack();
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(600);

    const backed = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 작성 폼에서 뒤로가기 → 그 카테고리 스킨, 주소도 일치`,
      backed.skinInList && !backed.editorVisible &&
      backed.url === `/${SLUG}/category/1`,
      JSON.stringify(backed));

    await page.goForward();
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(500);

    const forwarded = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 앞으로가기 → 작성 폼이 다시 열리고 주소도 일치`,
      forwarded.editorVisible && forwarded.editorCategory === "1" &&
      forwarded.url === `/${SLUG}/category/1?write=1`,
      JSON.stringify(forwarded));

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const reloaded = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 새로고침해도 같은 작성 폼이 열린다(옛 목록을 거치지 않는다)`,
      reloaded.editorVisible && reloaded.editorCategory === "1" &&
      !reloaded.legacyItems && reloaded.url === `/${SLUG}/category/1?write=1`,
      JSON.stringify(reloaded));

    check(`[${vpName}] 히스토리 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   4) 느린 응답 / 연속 클릭
--------------------------------------------------------- */

async function testSlowAndRapid(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 느린 응답 / 연속 클릭`);

  /* 느린 카테고리 조회: 이전 화면(HOME 스킨)이 유지되고, 흰색 커튼
     대신 작은 대기 표시만 뜬다. */
  await withPage(vp, {
    signedInAs: OWNER_ID,
    slowMs: 1200,
    slowWhen: p => p.includes("/rest/v1/posts")
  }, async (page, ctx) => {
    await gotoHome(page);

    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForTimeout(600);

    const during = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      const home = document.querySelector("#themeMount .imory-skin-root");
      const pending = document.getElementById("postPendingIndicator");
      return {
        areaOpen: Boolean(area) && !area.hidden,
        homeStillVisible: Boolean(home) && home.getBoundingClientRect().height > 0,
        pendingVisible: Boolean(pending) && !pending.hidden,
        listText: document.getElementById("postList").textContent.trim()
      };
    });

    check(`[${vpName}] 느린 응답 중에는 이전 화면이 유지되고 작은 대기 표시만 뜬다`,
      !during.areaOpen && during.homeStillVisible && during.pendingVisible &&
      !during.listText.includes("loading..."),
      JSON.stringify(during));

    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(400);

    const after = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 응답이 도착하면 대기 표시가 사라지고 스킨이 그려진다`,
      after.skinInList && !after.pendingVisible,
      JSON.stringify(after));

    check(`[${vpName}] 느린 응답 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 연속 클릭: 늦게 도착한 응답이 최신 화면을 덮지 않는다 */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });

    await page.click(`#postList a[href$="/post/101"]`);
    await page.click(`#postList a[href$="/post/102"]`).catch(() => {});
    await page.waitForTimeout(1600);

    const final = await page.evaluate(() => ({
      url: location.pathname + location.search,
      title: document.querySelector(".quiet-article-title")
        ? document.querySelector(".quiet-article-title").textContent : null,
      body: document.querySelector(".quiet-post-body")
        ? document.querySelector(".quiet-post-body").innerText.trim() : null
    }));

    check(`[${vpName}] 연속 클릭 후 화면과 주소가 서로 맞는다(늦은 응답이 덮지 않는다)`,
      final.title && final.url.endsWith(final.title === "첫 번째 글" ? "/post/101" : "/post/102") &&
      (final.body || "").includes(final.title === "첫 번째 글" ? "첫 번째" : "두 번째"),
      JSON.stringify(final));

    check(`[${vpName}] 연속 클릭 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   5) Quiet Frame v4 배너 크기(v3에서 그대로 유지)
--------------------------------------------------------- */

const READ_BANNERS = `(() => {
  const list = document.querySelector(".quiet-banner-list");
  const imgs = [...document.querySelectorAll(".quiet-banner-image")];
  const items = [...document.querySelectorAll(".quiet-banner-item")];
  const rects = imgs.map(img => {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const bx = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const by = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return {
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      contentW: +parseFloat(cs.width).toFixed(1),
      contentH: +parseFloat(cs.height).toFixed(1),
      innerW: +(r.width - bx).toFixed(2),
      innerH: +(r.height - by).toFixed(2),
      objectFit: cs.objectFit,
      left: +r.left.toFixed(1)
    };
  });
  let gap = null;
  if (items.length >= 2) {
    const a = items[0].getBoundingClientRect();
    const b = items[1].getBoundingClientRect();
    gap = +(b.top - a.bottom).toFixed(1);
  }
  const main = document.querySelector(".quiet-main");
  return {
    count: imgs.length,
    rects,
    gap,
    listDisplay: list ? getComputedStyle(list).display : null,
    listDirection: list ? getComputedStyle(list).flexDirection : null,
    mainLeft: main ? +main.getBoundingClientRect().left.toFixed(1) : null,
    mainWidth: main ? +main.getBoundingClientRect().width.toFixed(1) : null,
    mainPaddingLeft: main ? parseFloat(getComputedStyle(main).paddingLeft) : null
  };
})()`;

async function testBannerSize(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] Quiet Frame v4 배너 크기`);

  await withPage(vp, {}, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .quiet-banner-image", { timeout: 15000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll(".quiet-banner-image")].every(i => i.complete),
      { timeout: 15000 });
    await page.waitForTimeout(300);

    const b = await page.evaluate(READ_BANNERS);

    const available = b.mainWidth - b.mainPaddingLeft * 2;
    const expected = Math.min(240, available);

    check(`[${vpName}] 배너 두 개가 모두 같은 표시 폭이다(원본 크기와 무관)`,
      b.count === 2 && Math.abs(b.rects[0].contentW - b.rects[1].contentW) < 0.5,
      JSON.stringify(b.rects.map(r => [r.naturalW, r.contentW])));

    check(`[${vpName}] 배너 표시 폭이 240px(좁으면 가용 폭 이내)이다`,
      Math.abs(b.rects[0].contentW - expected) <= 1,
      `expected=${expected} actual=${b.rects[0].contentW} available=${available.toFixed(1)}`);

    for (const [i, r] of b.rects.entries()) {
      const ratio = r.naturalW / r.naturalH;
      const shown = r.innerW / r.innerH;
      check(`[${vpName}] 배너 ${i + 1} 원본 비율 유지(자르거나 늘리지 않음)`,
        Math.abs(ratio - shown) / ratio < 0.01 && r.objectFit !== "cover",
        `natural=${r.naturalW}x${r.naturalH} (ratio ${ratio.toFixed(3)}) ` +
        `shown=${r.innerW}x${r.innerH} (ratio ${shown.toFixed(3)}) fit=${r.objectFit}`);
    }

    check(`[${vpName}] 배너 목록은 세로로 쌓이고 사이 간격이 12px이다`,
      b.listDisplay === "flex" && b.listDirection === "column" &&
      Math.abs(b.gap - 12) <= 0.5,
      `display=${b.listDisplay}/${b.listDirection} gap=${b.gap}`);

    check(`[${vpName}] 배너가 왼쪽 정렬이다(본문 시작선과 같은 x)`,
      Math.abs(b.rects[0].left - (b.mainLeft + b.mainPaddingLeft)) <= 1.5,
      `img.left=${b.rects[0].left} main.contentLeft=${(b.mainLeft + b.mainPaddingLeft).toFixed(1)}`);

    check(`[${vpName}] v4 배너 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* v2와의 대조 — v2는 원본 폭 그대로라 두 배너 폭이 다르다.
     저장된 사용자 스킨/v2 파일을 건드리지 않았음을 함께 확인한다. */
  await withPage(vp, { skin: V2_PACKAGE }, async page => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .quiet-banner-image", { timeout: 15000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll(".quiet-banner-image")].every(i => i.complete),
      { timeout: 15000 });
    await page.waitForTimeout(300);

    const b = await page.evaluate(READ_BANNERS);

    check(`[${vpName}] 대조군: v2는 예전 그대로(배너마다 폭이 다르다)`,
      b.count === 2 && Math.abs(b.rects[0].contentW - b.rects[1].contentW) > 1,
      JSON.stringify(b.rects.map(r => [r.naturalW, r.contentW])));
  });
}


/* ---------------------------------------------------------
   6) CATEGORY의 INDEX 자리 — 소유자 EDIT / 방문자 INDEX (PHASE 1H)

   "특정 스킨 클래스에 의존하지 않는다"는 제품 코드 쪽 원칙이고,
   여기서는 그 스킨이 의도대로 그렸는지를 보는 것이므로 v4의 클래스를
   직접 확인한다(기존 배너 크기 검증과 같은 성격).
--------------------------------------------------------- */

const READ_CATEGORY_HEAD = `(() => {
  const visible = node => Boolean(node) && !node.hidden &&
    getComputedStyle(node).display !== "none";
  const edit = document.querySelector("#postList .quiet-back-edit");
  const index = document.querySelector("#postList .quiet-back-index");
  return {
    editVisible: visible(edit),
    editHref: edit ? edit.getAttribute("href") : null,
    indexVisible: visible(index),
    indexHref: index ? index.getAttribute("href") : null
  };
})()`;

async function testCategoryEditEntry(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] CATEGORY INDEX → EDIT`);

  /* 소유자 */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(400);

    const head = await page.evaluate(READ_CATEGORY_HEAD);
    const screen = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 소유자에게는 INDEX 자리에 EDIT이 보이고 목록 관리를 가리킨다`,
      head.editVisible && !head.indexVisible &&
      head.editHref === `/${SLUG}/category/1?manage=1`,
      JSON.stringify(head));

    check(`[${vpName}] 소유자 화면에 떠 있는 중복 도구(+ / edit)가 남지 않는다`,
      !screen.addVisible && !screen.listEditVisible && !screen.ownerTools,
      JSON.stringify(screen));

    check(`[${vpName}] EDIT 표시 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 로그아웃 방문자 */
  await withPage(vp, {}, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(400);

    const head = await page.evaluate(READ_CATEGORY_HEAD);
    const screen = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 방문자에게는 INDEX 그대로다(EDIT 없음)`,
      !head.editVisible && head.indexVisible && head.indexHref === `/${SLUG}`,
      JSON.stringify(head));

    check(`[${vpName}] 방문자에게는 관리 도구가 전혀 없다`,
      !screen.addVisible && !screen.listEditVisible && !screen.ownerTools,
      JSON.stringify(screen));

    check(`[${vpName}] 방문자 CATEGORY 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 다른 계정이 EDIT 주소로 직접 들어와도 관리 화면이 열리지 않는다 */
  await withPage(vp, { signedInAs: OTHER_USER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1?manage=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(700);

    const screen = await page.evaluate(READ_SCREEN);
    const head = await page.evaluate(READ_CATEGORY_HEAD);

    check(`[${vpName}] 다른 계정의 ?manage=1은 평소 스킨 화면이 되고 주소도 정리된다`,
      screen.skinInList && !screen.selectBarVisible && !screen.addVisible &&
      !head.editVisible && head.indexVisible &&
      screen.url === `/${SLUG}/category/1`,
      JSON.stringify({ ...screen, listText: undefined }));

    check(`[${vpName}] 비소유자 관리 URL 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 진입점을 그리지 않는 기존 스킨 — 플랫폼 기본 도구가 그대로 남는다 */
  await withPage(vp, { signedInAs: OWNER_ID, skin: DIARY_PACKAGE }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(600);

    const screen = await page.evaluate(READ_SCREEN);

    check(`[${vpName}] 진입점이 없는 기존 스킨에서는 기본 관리 도구가 그대로 남는다`,
      screen.skinInList && screen.ownerTools &&
      screen.addVisible && screen.listEditVisible,
      JSON.stringify({ ...screen, listText: undefined }));

    check(`[${vpName}] 기존 스킨 fallback 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   7) 모바일 POST 읽기 모드 (PHASE 1H)

   플랫폼이 스킨 루트에 싣는 상태(data-imory-post-focus)와, 그 상태를
   받은 v4 CSS의 실제 결과(사이드바 높이)를 함께 본다.
--------------------------------------------------------- */

const READ_POST_FOCUS = `(() => {
  const visible = node => Boolean(node) && !node.hidden &&
    getComputedStyle(node).display !== "none";
  const root = document.querySelector("#postSkinContainer .imory-skin-root");
  const sidebar = document.querySelector("#postSkinContainer .quiet-sidebar");
  const area = document.getElementById("postArea");
  const body = document.querySelector("#postSkinContainer .quiet-post-body");
  return {
    focus: root ? root.getAttribute("data-imory-post-focus") : null,
    roots: document.querySelectorAll("#postSkinContainer .imory-skin-root").length,
    bodies: document.querySelectorAll("#postSkinContainer .quiet-post-body").length,
    bodyText: body ? body.innerText.trim() : null,
    sidebarHeight: sidebar ? +sidebar.getBoundingClientRect().height.toFixed(1) : null,
    topbarVisible: visible(document.querySelector("#postSkinContainer .quiet-topbar")),
    backLinkVisible: visible(document.querySelector("#postSkinContainer .quiet-post-nav a")),
    titleVisible: visible(document.querySelector("#postSkinContainer .quiet-article-title")),
    gateInSkin: Boolean(document.querySelector("#postSkinContainer #postSecretGate")),
    gateVisible: visible(document.getElementById("postSecretGate")),
    areaScroll: area ? Math.round(area.scrollTop) : null,
    url: location.pathname + location.search
  };
})()`;

async function sampleSidebarHeights(page, count = 22, everyMs = 40) {
  const heights = [];
  for (let i = 0; i < count; i++) {
    heights.push(await page.evaluate(() => {
      const sidebar = document.querySelector("#postSkinContainer .quiet-sidebar");
      return sidebar ? +sidebar.getBoundingClientRect().height.toFixed(1) : null;
    }));
    await page.waitForTimeout(everyMs);
  }
  return heights.filter(h => h !== null);
}

async function testMobilePostFocus() {
  const vp = VIEWPORTS["mobile-390"];
  console.log("\n[mobile-390] POST 읽기 모드");

  /* 목록 → POST: 전환이 실제로 재생되고, 돌아오면 복원된다 */
  await withPage(vp, { signedInAs: OWNER_ID, db: makeLongListDb() }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(400);

    /* 실제로 스크롤되는 목록인지 먼저 확인한다 — 스크롤이 0이면
       "복원됐다"는 검사가 아무것도 재지 않는다. */
    const listScroll = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      area.scrollTop = 200;
      return Math.round(area.scrollTop);
    });

    check("[mobile-390] (전제) 목록이 실제로 스크롤된다",
      listScroll > 50, `scrollTop=${listScroll}`);

    /* page.click()은 대상이 화면 밖이면 스스로 스크롤해 버려서 방금
       맞춘 위치가 바뀐다 — 목록 스크롤을 그대로 둔 채 링크만 누른다. */
    await page.evaluate(() => {
      document.querySelector('#postList a[href$="/post/101"]').click();
    });
    await page.waitForSelector("#postSkinContainer .quiet-article-title", { timeout: 15000 });

    const heights = await sampleSidebarHeights(page);
    const maxH = Math.max(...heights);
    const minH = Math.min(...heights);
    const sawMidway = heights.some(h => h > 4 && h < maxH - 4);

    check("[mobile-390] 글을 열면 사이드바가 접히는 전환이 실제로 재생된다",
      maxH > 40 && minH <= 2 && sawMidway,
      `max=${maxH} min=${minH} samples=${heights.slice(0, 8).join("/")}`);

    await page.waitForTimeout(400);
    const reading = await page.evaluate(READ_POST_FOCUS);

    check("[mobile-390] 접힌 뒤에도 작은 상단바와 목록 복귀 링크는 남는다",
      reading.focus === "on" && reading.sidebarHeight <= 2 &&
      reading.topbarVisible && reading.backLinkVisible && reading.titleVisible,
      JSON.stringify(reading));

    check("[mobile-390] 본문은 한 번만 mount된다(중복 없음)",
      reading.roots === 1 && reading.bodies === 1 &&
      (reading.bodyText || "").includes("첫 번째"),
      JSON.stringify(reading));

    /* 목록 복귀 */
    await page.click("#postSkinContainer .quiet-post-nav a");
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(700);

    const backToList = await page.evaluate(() => {
      const sidebar = document.querySelector("#postList .quiet-sidebar");
      const area = document.getElementById("postArea");
      return {
        sidebarHeight: sidebar ? +sidebar.getBoundingClientRect().height.toFixed(1) : null,
        areaScroll: Math.round(area.scrollTop),
        url: location.pathname + location.search
      };
    });

    check("[mobile-390] 목록으로 돌아오면 프로필·메뉴가 다시 보인다",
      backToList.sidebarHeight > 40 && backToList.url === `/${SLUG}/category/1`,
      JSON.stringify(backToList));

    check("[mobile-390] 목록으로 돌아오면 읽던 스크롤 위치가 복원된다",
      Math.abs(backToList.areaScroll - listScroll) <= 3,
      `before=${listScroll} after=${backToList.areaScroll}`);

    check("[mobile-390] 읽기 모드 경로 문서 재로드 없음",
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    check("[mobile-390] 읽기 모드 경로 콘솔 에러 없음",
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 직접 접속 — 처음부터 접힌 상태(전환 없음) */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/post/102`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer .quiet-article-title", { timeout: 15000 });

    const heights = await sampleSidebarHeights(page, 12);

    check("[mobile-390] POST 직접 접속은 처음부터 접힌 상태다(펼쳤다 접지 않는다)",
      heights.length > 0 && Math.max(...heights) <= 2,
      `samples=${heights.slice(0, 8).join("/")}`);

    /* POST → POST: 다시 펼치지 않는다 */
    await page.evaluate(() => openPostPage(101));
    await page.waitForTimeout(120);

    const next = await sampleSidebarHeights(page, 12);
    const settled = await page.evaluate(READ_POST_FOCUS);

    check("[mobile-390] POST → POST 이동은 다시 펼치지 않는다",
      Math.max(...next) <= 2 && settled.focus === "on" &&
      (settled.bodyText || "").includes("첫 번째"),
      `samples=${next.slice(0, 8).join("/")} ${JSON.stringify(settled)}`);

    check("[mobile-390] 직접 접속/연속 이동 경로 콘솔 에러 없음",
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 모션 감소 — 애니메이션 없이 최종 상태 */
  await withPage(vp, { signedInAs: OWNER_ID, reducedMotion: true }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.click(`#postList a[href$="/post/101"]`);
    await page.waitForSelector("#postSkinContainer .quiet-article-title", { timeout: 15000 });

    const heights = await sampleSidebarHeights(page, 12);

    check("[mobile-390] 모션 감소 환경에서는 전환 없이 최종 상태로 간다",
      heights.length > 0 && Math.max(...heights) <= 2,
      `samples=${heights.slice(0, 8).join("/")}`);

    check("[mobile-390] 모션 감소 경로 콘솔 에러 없음",
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 비밀글 — 게이트가 스킨 본문 자리에 한 번만 들어간다 */
  await withPage(vp, { db: makeDb({ withSecret: true }) }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/post/103`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer .quiet-article-title", { timeout: 15000 });
    await page.waitForTimeout(800);

    const secret = await page.evaluate(READ_POST_FOCUS);

    check("[mobile-390] 비밀글도 읽기 모드로 열리고 게이트가 스킨 본문 자리에 한 번만 들어간다",
      secret.focus === "on" && secret.sidebarHeight <= 2 &&
      secret.gateInSkin && secret.gateVisible &&
      secret.roots === 1 && secret.bodies === 1,
      JSON.stringify(secret));

    check("[mobile-390] 비밀글 경로 콘솔 에러 없음",
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 본문이 늦게 오는 경우 — 읽기 모드 진입과 본문 mount가 어긋나지 않는다 */
  await withPage(vp, {
    signedInAs: OWNER_ID,
    slowMs: 1000,
    slowWhen: pathAndSearch => pathAndSearch.includes("/rest/v1/post_contents")
  }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(300);

    await page.click(`#postList a[href$="/post/101"]`);
    await page.waitForSelector("#postSkinContainer .quiet-article-title", { timeout: 15000 });
    await page.waitForTimeout(1400);

    const after = await page.evaluate(READ_POST_FOCUS);

    check("[mobile-390] 본문이 늦게 와도 읽기 모드로 진입하고 본문이 한 번만 붙는다",
      after.focus === "on" && after.sidebarHeight <= 2 && after.roots === 1 &&
      after.bodies === 1 && (after.bodyText || "").includes("첫 번째"),
      JSON.stringify(after));

    check("[mobile-390] 느린 본문 경로 콘솔 에러 없음",
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   8) 데스크톱은 그대로 — 사이드바가 유지된다
--------------------------------------------------------- */

async function testDesktopPostSidebar() {
  const vp = VIEWPORTS["desktop-1280"];
  console.log("\n[desktop-1280] POST 사이드바 유지");

  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await gotoHome(page);
    await page.click(`#themeMount .quiet-link-list a[href$="/category/1"]`);
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.click(`#postList a[href$="/post/101"]`);
    await page.waitForSelector("#postSkinContainer .quiet-article-title", { timeout: 15000 });
    await page.waitForTimeout(800);

    const desktop = await page.evaluate(READ_POST_FOCUS);

    check("[desktop-1280] 데스크톱에서는 상태가 실려도 사이드바가 그대로 보인다",
      desktop.focus === "on" && desktop.sidebarHeight > 200 &&
      desktop.titleVisible && desktop.roots === 1 && desktop.bodies === 1,
      JSON.stringify(desktop));

    check("[desktop-1280] 데스크톱 POST 경로 콘솔 에러 없음",
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   실행
========================================================== */

(async () => {
  console.log(`\n=== WRITE / MANAGE / EDIT / POST 읽기 모드 E2E (${BROWSER}) ===`);

  playwright = await loadPlaywright(BROWSER);
  const server = await startServer();

  try {
    for (const vpName of Object.keys(VIEWPORTS)) {
      if (shouldRun("write")) await testWriteEntry(vpName);
      if (shouldRun("category-tools")) await testCategoryTools(vpName);
      if (shouldRun("history")) await testHistory(vpName);
      if (shouldRun("slow")) await testSlowAndRapid(vpName);
      if (shouldRun("banner")) await testBannerSize(vpName);
      if (shouldRun("edit-entry")) await testCategoryEditEntry(vpName);
    }

    if (shouldRun("post-focus")) await testMobilePostFocus();
    if (shouldRun("post-focus")) await testDesktopPostSidebar();
  } finally {
    server.close();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
