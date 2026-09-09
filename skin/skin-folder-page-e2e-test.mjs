/* =========================================================
   FOLDER-2 — Folder Route + Series Viewer E2E

   /:slug/category/:cid/folder/:fid 폴더 페이지가 published 화면과
   Studio Preview에서 같은 계약으로 동작하는지 확인한다.
   기준 문서: IMORY_FOLDER2_DESIGN.md.

   ★ 화면은 두 모드다(2026-09-09 UX 개정) — 주소의 ?series=1 하나로
     갈린다. 이 파일은 그 계약을 기준으로 쓴다.
     - 목록(기본): 하위 폴더 + direct 글의 제목/날짜만. **본문을 조회도
       렌더도 하지 않는다**(post_contents 요청 0건). 글을 누르면 평소의
       개별 POST 페이지로 간다.
     - 이어읽기(?series=1): 폴더 제목 하나 아래로 direct 글 본문만
       sort_order 순으로 이어진다. 글별 제목/헤더/문서 아이콘은 반복
       되지 않는다.
     - 두 모드는 '전체 이어읽기' / '목록 보기' action으로 오간다
       (Context의 folder.seriesHref / folder.listHref).

   1. published — folder-aware 스킨 v2(skin/test-skins/
      imory-finder-folders-v2.json, templates.folder 포함)로:
      - CATEGORY의 폴더 카드에 OPEN 링크(folderHref)가 direct 글이 있는
        폴더에만 그려진다(하위 폴더에만 글이 있는 폴더는 링크 없음).
      - OPEN → 폴더 페이지는 목록 모드: 제목 = 폴더 이름, direct 글만
        sort_order 순으로 제목/날짜/문서 아이콘, 하위 폴더 탐색 링크,
        breadcrumb/BACK, 소유자 EDIT. 본문 요청 없음.
      - '전체 이어읽기' → ?series=1: 각 글 본문이 region에 채워지고
        (하위 폴더 글은 재귀 포함 안 함) 제목은 반복되지 않는다.
        '목록 보기'로 기본 모드 복귀.
      - 소유자: secret/private 글도 이어읽기에서 본문이 바로 보인다.
      - 방문자: secret 글은 이어읽기에서 글별 비밀번호 폼, post_contents
        배치 요청에 secret id가 들어가지 않는다, 오답/정답 처리(RPC mock).
      - 방문자에게 보이는 direct 글이 없는 폴더 / 삭제된 폴더 / direct
        글이 없는 폴더 / templates.folder 없는 스킨 → 카테고리로 복귀
        (주소도 카테고리로).
      - 직접 접속(?series=1 포함), 뒤로가기 복귀, 모바일 가로 넘침 없음.
   2. preview — Studio scenario t에 같은 JSON을 실어 CATEGORY의 OPEN
      링크 → 폴더 페이지(목록) → ?series=1(본문), CODE 버튼 활성, 없는
      폴더는 overlay, templates.folder 없는 스킨은 unsupported overlay.

   skin/skin-folder-tree-e2e-test.mjs와 같은 규약(정적 서버 + Supabase
   네트워크만 mock + 저장소의 실제 파일). mock에는 RLS가 없으므로
   방문자에게는 private 글 행과 secret/private 글의 post_contents 행을
   mock 단계에서 빼서 2026-09-09 프로덕션 실측 결과를 흉내 낸다.

   ★ 실행 방법
     node skin/skin-folder-page-e2e-test.mjs
     node skin/skin-folder-page-e2e-test.mjs --browser=webkit
     node skin/skin-folder-page-e2e-test.mjs --only=published

   --only= 뒤에 쓸 수 있는 이름: published / preview
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8944;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";
const SECRET_PASSWORD = "1234";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const DEBUG = args.includes("--debug");

function shouldRun(name) {
  return !ONLY || ONLY === name;
}


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
   SkinPackage
========================================================== */

const readSkin = (name) =>
  JSON.parse(fs.readFileSync(path.join(HERE, "test-skins", name), "utf8"));

const FOLDER_SKIN_V2 = readSkin("imory-finder-folders-v2.json");

/* templates.folder만 뺀 같은 스킨 — 폴더 페이지가 없는 스킨의 동작
   (folderHref null → 링크 없음, 폴더 주소 → 카테고리) 확인용 */
const FOLDER_SKIN_NO_PAGE = (() => {
  const clone = JSON.parse(JSON.stringify(FOLDER_SKIN_V2));
  delete clone.templates.folder;
  return clone;
})();


/* =========================================================
   DB fixture

   Studio scenario t와 같은 배치에 "직속 글 없는 폴더" 한 쌍을 더했다.

     LOG(1)
       ├─ (글) 401 폴더 없는 글          sort 100
       ├─ 홍차(1)                         sort 200   direct: 404
       │    ├─ Sentinel AU(2)             sort 100   direct: 402
       │    │    ├─ 3단 폴더(3)           sort 100   direct: 403 secret
       │    │    └─ (글) 402 첫 만남      sort 200
       │    └─ (글) 404 홍차 노트         sort 300
       ├─ 빈 폴더(4)                      sort 300   ← 글 없음(잘림)
       ├─ 2002(5)                         sort 400   direct: 405
       ├─ 비공개 폴더(6)                  sort 450   direct: 407 private
       ├─ 껍데기(7)                       sort 475   direct 없음 → OPEN 없음
       │    └─ 속(8)                      sort 100   direct: 409
       └─ (글) 406 맨 아래 글             sort 500
     NOTE(2) — 폴더 없음: (글) 408 노트 하나
========================================================== */

function makeDb() {
  const folders = [
    { id: 1, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "홍차", depth: 1, sort_order: 200 },
    { id: 2, user_id: OWNER_ID, category_id: 1, parent_id: 1, name: "Sentinel AU", depth: 2, sort_order: 100 },
    { id: 3, user_id: OWNER_ID, category_id: 1, parent_id: 2, name: "3단 폴더", depth: 3, sort_order: 100 },
    { id: 4, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "빈 폴더", depth: 1, sort_order: 300 },
    { id: 5, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "2002", depth: 1, sort_order: 400 },
    { id: 6, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "비공개 폴더", depth: 1, sort_order: 450 },
    { id: 7, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "껍데기", depth: 1, sort_order: 475 },
    { id: 8, user_id: OWNER_ID, category_id: 1, parent_id: 7, name: "속", depth: 2, sort_order: 100 }
  ];

  const post = (id, title, created, visibility, folderId, sortOrder, categoryId = 1) => ({
    id, user_id: OWNER_ID, category_id: categoryId, title, content_type: "text",
    visibility, created_at: created, quote_preset_id: null,
    folder_id: folderId, sort_order: sortOrder
  });

  const posts = [
    post(401, "폴더 없는 글", "2026-01-05T02:00:00Z", "public", null, 100),
    post(402, "첫 만남", "2026-01-01T02:00:00Z", "public", 2, 200),
    post(403, "깊은 글", "2026-01-02T02:00:00Z", "secret", 3, 100),
    post(404, "홍차 노트", "2026-01-03T02:00:00Z", "public", 1, 300),
    post(405, "영도", "2026-01-04T02:00:00Z", "public", 5, 100),
    post(406, "맨 아래 글", "2025-12-31T02:00:00Z", "public", null, 500),
    post(407, "숨은 글", "2025-12-30T02:00:00Z", "private", 6, 100),
    post(408, "노트 하나", "2026-01-06T02:00:00Z", "public", null, 100, 2),
    post(409, "속의 글", "2025-12-29T02:00:00Z", "public", 8, 100)
  ];

  return {
    profiles: [{
      user_id: OWNER_ID, slug: SLUG, home_mode: "customize",
      nickname: "테스트 사용자", bio: "E2E 테스트 계정"
    }],
    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "IMORY E2E" },
      { user_id: OWNER_ID, key: "favicon_url", value: "" }
    ],
    categories: [
      { id: 1, user_id: OWNER_ID, name: "LOG", type: "post", sort_order: 1 },
      { id: 2, user_id: OWNER_ID, name: "NOTE", type: "post", sort_order: 2 }
    ],
    post_folders: folders,
    posts,
    post_contents: posts.map(p => ({ post_id: p.id, content: `${p.title} 본문입니다.` })),
    banners: [],
    quote_presets: [],
    skins: [{ id: 1, user_id: OWNER_ID, is_active: true }]
  };
}

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function queryTable(db, table, params) {
  let rows = (db[table] || []).map(r => ({ ...r }));

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    const m = /^(eq|neq|in|gt|gte|lt|lte|is)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
      rows = rows.filter(r => list.includes(String(r[key])));
      continue;
    }
    if (op === "is") {
      rows = rows.filter(r => (val === "null" ? r[key] === null || r[key] === undefined : String(r[key]) === val));
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

/*
  installSupabaseMock(page, { skin, db, signedInAs, log })

  log: 배열이면 /rest/v1/post_contents 요청의 search 문자열과
  get_secret_post_content 호출 body를 기록한다 — "방문자의 배치 요청에
  secret id가 없다"를 화면이 아니라 네트워크에서 확인하기 위해서다.
*/
async function installSupabaseMock(page, opts = {}) {
  const {
    skin = FOLDER_SKIN_V2,
    db = makeDb(),
    signedInAs = null,
    log = null
  } = opts;

  const isOwner = signedInAs === OWNER_ID;

  const hiddenPostIds = new Set(
    db.posts
      .filter(p => p.visibility !== "public")
      .map(p => String(p.id))
  );

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 401, headers, contentType: "application/json",
        body: JSON.stringify({ message: "no session" })
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);

      if (fn === "get_published_skin") {
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify({ skin, schemaVersion: skin.schemaVersion, imageSlotValues: {} })
        });
      }

      if (fn === "get_secret_post_content") {
        let body = {};
        try { body = JSON.parse(req.postData() || "{}"); } catch { body = {}; }
        if (log) log.push({ rpc: fn, postId: String(body.p_post_id), password: body.p_password });
        const row = db.post_contents.find(r => String(r.post_id) === String(body.p_post_id));
        if (body.p_password !== SECRET_PASSWORD || !row) {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify({ code: "P0001", message: "비밀번호가 일치하지 않습니다.", details: null, hint: null })
          });
        }
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify([{ content: row.content }])
        });
      }

      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: "null"
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      let rows = queryTable(db, table, url.searchParams);

      /* 실제 RLS 흉내(2026-09-09 프로덕션 실측):
         - posts: 비소유자에게 private 행이 오지 않는다.
         - post_contents: 비소유자에게 secret/private 글의 본문 행이 오지 않는다. */
      if (!isOwner && table === "posts") {
        rows = rows.filter(r => r.visibility !== "private");
      }
      if (!isOwner && table === "post_contents") {
        rows = rows.filter(r => !hiddenPostIds.has(String(r.post_id)));
      }
      if (log && table === "post_contents") {
        log.push({ table, search: url.search });
      }

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
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => {
    if (DEBUG) console.log(`[console:${msg.type()}] ${msg.text()}`);
  });
  if (opts.signedInAs) await installSignedInUser(page, opts.signedInAs);
  if (opts.initScript) await page.addInitScript(opts.initScript.fn, opts.initScript.arg);
  if (!opts.noSupabaseMock) await installSupabaseMock(page, opts);
  try {
    return await fn(page, { errors });
  } finally {
    await browser.close();
  }
}

const BASE = `http://localhost:${PORT}`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);


/* published 폴더 페이지 상태 읽기 — 두 모드 공용

   목록 모드(기본)와 이어읽기 모드(?series=1)를 한 리더로 읽는다.
   data-imory-if는 엘리먼트를 지우지 않고 hidden만 켜므로, 어느 쪽이
   "보이는가"는 hidden/[hidden] 조상으로 판정한다. */
const READ_FOLDER = `(() => {
  const root = document.querySelector("#postList .imory-skin-root");
  const head = root && root.querySelector(".finder-series-head");
  if (!head) return null;
  const vis = (el) => Boolean(el) && !el.hidden && !el.closest("[hidden]");
  const listMode = root.querySelector(".finder-folder-list-mode");
  const series = root.querySelector(".finder-series");

  const entries = Array.from(root.querySelectorAll(".finder-series-list .finder-folder-entry")).map((li) => {
    const a = li.querySelector(".finder-entry");
    const edit = li.querySelector(".finder-entry-edit");
    return {
      title: a.querySelector(".finder-entry-title").textContent,
      href: a.getAttribute("href"),
      date: a.querySelector(".finder-entry-date").textContent.trim(),
      doc: Boolean(a.querySelector(".finder-entry-doc")),
      lock: vis(a.querySelector(".finder-lock")),
      edit: vis(edit) ? edit.getAttribute("href") : null
    };
  });

  const bodies = Array.from(root.querySelectorAll(".finder-series-post")).map((a) => ({
    bodyText: a.querySelector(".finder-post-body").textContent.trim(),
    hasGate: Boolean(a.querySelector(".finder-post-body .post-secret-gate")),
    regionKey: a.querySelector(".finder-post-body").getAttribute("data-imory-region-key")
  }));

  const crumbs = Array.from(root.querySelectorAll(".finder-breadcrumb a")).filter(vis).map((a) => ({ text: a.textContent, href: a.getAttribute("href") }));
  const children = Array.from(root.querySelectorAll(".finder-series-child")).filter(vis).map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href") }));
  const actions = Array.from(root.querySelectorAll(".finder-actions a")).filter(vis).map((a) => ({ text: a.textContent, href: a.getAttribute("href") }));
  const foot = Array.from(root.querySelectorAll(".finder-series-foot a")).filter(vis).map((a) => a.getAttribute("href"));

  return {
    mode: vis(series) ? "series" : (vis(listMode) ? "list" : "none"),
    title: head.querySelector("h1").textContent,
    count: root.querySelector(".finder-count").textContent.trim(),
    entries, bodies, crumbs, children, actions,
    foot: foot[0] || null,

    /* 이어읽기 모드에 글별 제목/헤더/문서 아이콘이 반복되지 않는지 */
    seriesText: series ? series.textContent : "",
    seriesHeadings: series ? series.querySelectorAll("h1, h2, h3, .finder-series-post-title, .finder-series-post-head, .finder-entry-doc").length : -1,

    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    url: location.pathname + location.search
  };
})()`;

/* CATEGORY 화면의 OPEN 링크 */
const READ_OPEN_LINKS = `(() => {
  const root = document.querySelector("#postList .imory-skin-root");
  if (!root || !root.querySelector(".finder-tree")) return null;
  const vis = (el) => Boolean(el) && !el.hidden && !el.closest("[hidden]");
  const links = Array.from(root.querySelectorAll(".finder-folder-open")).filter(vis).map((a) => ({
    folder: (a.closest(".finder-folder-head") ? a.closest(".finder-folder-head").querySelector(".finder-folder-name") : a.closest(".finder-subfolder-name").querySelector("span:not(.finder-subfolder-mark)")).textContent,
    href: (a.getAttribute("href") || "").replace(/^\\/[^/]+\\//, "/")
  }));
  const hiddenOpen = Array.from(root.querySelectorAll(".finder-folder-open")).filter((a) => !vis(a)).length;
  return { links, hiddenOpen, text: root.textContent, url: location.pathname + location.search };
})()`;

/* 폴더 페이지(모드 무관)가 그려질 때까지 */
async function waitFolderPage(page) {
  await page.waitForSelector("#postList .imory-skin-root .finder-series-head", { timeout: 15000 });
  await page.waitForTimeout(300);
}

/* 목록/이어읽기 중 어느 쪽이 실제로 보이는지까지 기다린다 */
async function waitFolderMode(page, mode) {
  await page.waitForFunction((m) => {
    const root = document.querySelector("#postList .imory-skin-root");
    const series = root && root.querySelector(".finder-series");
    const list = root && root.querySelector(".finder-folder-list-mode");
    if (!series || !list) return false;
    const vis = (el) => !el.hidden && !el.closest("[hidden]");
    return m === "series" ? vis(series) : vis(list);
  }, mode, { timeout: 15000 });
  await page.waitForTimeout(300);
}

/* 이어읽기 모드의 본문이 채워질 때까지(secret gate도 "채워진" 것으로 본다) */
async function waitSeriesBodies(page) {
  await page.waitForFunction(() => {
    const bodies = Array.from(document.querySelectorAll("#postList .imory-skin-root .finder-series-post .finder-post-body"));
    return bodies.length > 0 && bodies.every((el) => el.textContent.trim().length > 0 || el.querySelector(".post-secret-gate"));
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(200);
}

async function clickFolderAction(page, text) {
  await page.evaluate((t) => {
    const a = Array.from(document.querySelectorAll("#postList .imory-skin-root .finder-actions a"))
      .filter((el) => !el.hidden && !el.closest("[hidden]"))
      .find((el) => el.textContent.includes(t));
    if (!a) throw new Error("folder action not found: " + t);
    a.click();
  }, text);
}

/* 목록 → 전체 이어읽기 */
async function enterSeries(page) {
  await clickFolderAction(page, "전체 이어읽기");
  await page.waitForFunction(() => location.search === "?series=1", null, { timeout: 10000 });
  await waitFolderMode(page, "series");
  await waitSeriesBodies(page);
}

/* 이어읽기 → 목록 보기 */
async function backToList(page) {
  await clickFolderAction(page, "목록 보기");
  await page.waitForFunction(() => location.search === "", null, { timeout: 10000 });
  await waitFolderMode(page, "list");
}

async function waitTree(page) {
  await page.waitForSelector("#postList .imory-skin-root .finder-tree", { timeout: 15000 });
  await page.waitForTimeout(250);
}

async function waitUrl(page, expected) {
  await page.waitForFunction(
    (e) => location.pathname === e,
    expected,
    { timeout: 10000 }
  ).catch(() => {});
}

/* 폴더 페이지가 아니라 카테고리로 복귀했는가 — 목록 모드에서도
   .finder-series는 (hidden으로) DOM에 남으므로 폴더 페이지의 존재는
   .finder-series-head로 판정한다. */
const NO_FOLDER_PAGE = `!document.querySelector("#postList .imory-skin-root .finder-series-head")`;


/* ---------------------------------------------------------
   1) published
--------------------------------------------------------- */

async function testPublishedOwner(vpName) {
  const viewport = VIEWPORTS[vpName];
  console.log(`\n[published · owner · ${vpName}]`);

  const log = [];

  await withPage(viewport, { signedInAs: OWNER_ID, log }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await waitTree(page);

    const open = await page.evaluate(READ_OPEN_LINKS);
    check("소유자 CATEGORY: direct 글이 있는 폴더에만 OPEN 링크(folderHref) — 6개, 껍데기(하위 폴더에만 글)는 링크 없음",
      open && same(open.links.map(l => l.folder).sort(), ["2002", "3단 폴더", "Sentinel AU", "비공개 폴더", "속", "홍차"].sort()) &&
      open.links.every(l => /^\/category\/1\/folder\/\d+$/.test(l.href)) &&
      open.hiddenOpen >= 1,
      JSON.stringify(open && open.links));

    check("OPEN 링크 주소는 /:slug/category/:cid/folder/:fid 모양(홍차=1, Sentinel AU=2)",
      open && open.links.find(l => l.folder === "홍차").href === "/category/1/folder/1" &&
      open.links.find(l => l.folder === "Sentinel AU").href === "/category/1/folder/2");

    /* OPEN → 폴더 페이지 (SPA) — 기본은 목록 모드 */
    const contentBefore = log.filter(e => e.table === "post_contents").length;

    await page.evaluate(() => {
      document.querySelector('#postList .imory-skin-root a.finder-folder-open[href$="/category/1/folder/1"]').click();
    });
    await waitFolderPage(page);
    await waitUrl(page, `/${SLUG}/category/1/folder/1`);
    await waitFolderMode(page, "list");

    const list = await page.evaluate(READ_FOLDER);
    check("폴더 진입 기본 = 목록 모드: 주소에 ?series=1 없음, 제목 = folder.name, direct 글만(홍차 노트) — 하위 폴더의 글은 없음",
      list && list.mode === "list" && list.url === `/${SLUG}/category/1/folder/1` &&
      list.title === "홍차" && same(list.entries.map(e => e.title), ["홍차 노트"]) && list.count.startsWith("1"),
      JSON.stringify(list && { mode: list.mode, url: list.url, title: list.title, entries: list.entries.map(e => e.title) }));

    check("목록 항목 = 문서 아이콘 + 제목 + 날짜, 링크는 개별 POST 페이지(/post/404)",
      list && list.entries[0].doc === true && list.entries[0].href === `/${SLUG}/post/404` &&
      /\d/.test(list.entries[0].date),
      JSON.stringify(list && list.entries));

    check("★ 목록 모드에서는 본문을 로드하지 않는다 — post_contents 요청 0건, 모든 region이 빈 채",
      log.filter(e => e.table === "post_contents").length === contentBefore &&
      list.bodies.length > 0 && list.bodies.every(b => b.bodyText === "" && !b.hasGate),
      JSON.stringify({ requests: log.filter(e => e.table === "post_contents"), bodies: list && list.bodies }));

    check("목록 모드 action: '전체 이어읽기'(?series=1) 있고 '목록 보기'는 없다",
      list && list.actions.some(a => a.text.includes("전체 이어읽기") && a.href === `/${SLUG}/category/1/folder/1?series=1`) &&
      !list.actions.some(a => a.text.includes("목록 보기")),
      JSON.stringify(list && list.actions));

    check("소유자: 목록 항목별 EDIT(editHref = ?edit=1) · 상단 EDIT(카테고리 ?manage=1) · BACK = 카테고리",
      list && list.entries[0].edit === `/${SLUG}/post/404?edit=1` &&
      list.actions.some(a => a.text === "EDIT" && a.href === `/${SLUG}/category/1?manage=1`) &&
      list.actions.some(a => a.text === "BACK" && a.href === `/${SLUG}/category/1`) &&
      list.foot === `/${SLUG}/category/1`,
      JSON.stringify(list && { edit: list.entries[0].edit, actions: list.actions, foot: list.foot }));

    check("하위 폴더 탐색: folder.children에 Sentinel AU 링크(direct 글 수 1)",
      list && list.children.length === 1 && /Sentinel AU/.test(list.children[0].text) && /1$/.test(list.children[0].text) &&
      list.children[0].href === `/${SLUG}/category/1/folder/2`,
      JSON.stringify(list && list.children));

    check("breadcrumb: HOME / LOG(카테고리) — 1단계 폴더라 조상 없음",
      list && same(list.crumbs.map(c => c.text), ["HOME", "LOG"]) && list.crumbs[1].href === `/${SLUG}/category/1`);

    check("목록 모드 가로 넘침 없음",
      list && list.scrollWidth <= list.innerWidth + 1, list && `scrollWidth=${list.scrollWidth} innerWidth=${list.innerWidth}`);

    check("플랫폼 mount 계약: post-container--skin-active + post-area--skin-active, legacy 헤더 숨김",
      await page.evaluate(() =>
        document.getElementById("postContainer").classList.contains("post-container--skin-active") &&
        document.getElementById("postArea").classList.contains("post-area--skin-active") &&
        getComputedStyle(document.querySelector("#postContainer .post-header")).display === "none"
      ));

    /* 전체 이어읽기 → Series Viewer */
    await enterSeries(page);

    const series = await page.evaluate(READ_FOLDER);
    check("'전체 이어읽기' → 주소 ?series=1, 이어읽기 모드로 바뀌고 목록은 사라진다",
      series && series.mode === "series" && series.url === `/${SLUG}/category/1/folder/1?series=1`,
      JSON.stringify(series && { mode: series.mode, url: series.url }));

    check("이어읽기: 본문이 그 글의 region(키=글 id)에 채워진다",
      series && series.bodies[0].regionKey === "404" && series.bodies[0].bodyText === "홍차 노트 본문입니다." && !series.bodies[0].hasGate,
      JSON.stringify(series && series.bodies));

    /* 폴더 제목은 위(.finder-series-head)에 한 번뿐이고, 이어지는
       영역에는 본문 말고는 아무 텍스트도 없다 — 제목/헤더/아이콘이
       글마다 반복되면 seriesText가 본문 이어붙임과 달라진다. */
    check("★ 이어읽기: 폴더 제목만 위에 있고 글별 제목/헤더/문서 아이콘은 반복되지 않는다",
      series && series.title === "홍차" && series.seriesHeadings === 0 &&
      series.seriesText.trim() === series.bodies.map(b => b.bodyText).join(""),
      JSON.stringify(series && { headings: series.seriesHeadings, text: series.seriesText.slice(0, 80) }));

    check("이어읽기에서 본문은 그 폴더의 direct 글만 — post_contents 요청은 404 하나뿐",
      same(log.filter(e => e.table === "post_contents").map(e => /404/.test(e.search)), [true]),
      JSON.stringify(log.filter(e => e.table === "post_contents")));

    check("이어읽기 모드 action: '목록 보기'(?series=1 없는 주소)로 돌아갈 수 있고 '전체 이어읽기'는 없다",
      series && series.actions.some(a => a.text.includes("목록 보기") && a.href === `/${SLUG}/category/1/folder/1`) &&
      !series.actions.some(a => a.text.includes("전체 이어읽기")),
      JSON.stringify(series && series.actions));

    check("이어읽기 가로 넘침 없음",
      series && series.scrollWidth <= series.innerWidth + 1, series && `scrollWidth=${series.scrollWidth} innerWidth=${series.innerWidth}`);

    /* 목록 보기 → 기본 모드 복귀 */
    await backToList(page);
    const relist = await page.evaluate(READ_FOLDER);
    check("'목록 보기' → 주소에서 ?series=1이 빠지고 목록 모드로 복귀",
      relist && relist.mode === "list" && relist.url === `/${SLUG}/category/1/folder/1` &&
      same(relist.entries.map(e => e.title), ["홍차 노트"]),
      JSON.stringify(relist && { mode: relist.mode, url: relist.url }));

    /* 목록의 글 클릭 → 개별 POST 페이지 */
    await page.evaluate(() => {
      document.querySelector("#postList .imory-skin-root .finder-series-list .finder-entry").click();
    });
    await page.waitForFunction(() => /\/post\/404$/.test(location.pathname), null, { timeout: 15000 });
    await page.waitForTimeout(300);
    check("목록에서 글을 누르면 기존 개별 POST 페이지로 이동한다",
      await page.evaluate(() => location.pathname) === `/${SLUG}/post/404`);

    await page.goBack();
    await waitFolderPage(page);
    await waitFolderMode(page, "list");
    check("글에서 뒤로가기: 목록 모드의 폴더 페이지로 돌아온다",
      (await page.evaluate(READ_FOLDER)).mode === "list" &&
      await page.evaluate(() => location.pathname + location.search) === `/${SLUG}/category/1/folder/1`);

    /* 하위 폴더로 */
    await page.evaluate(() => {
      document.querySelector('#postList .imory-skin-root a.finder-series-child[href$="/category/1/folder/2"]').click();
    });
    await page.waitForFunction(() => {
      const h1 = document.querySelector("#postList .imory-skin-root .finder-series-head h1");
      return Boolean(h1) && h1.textContent === "Sentinel AU";
    }, null, { timeout: 15000 });
    await waitFolderMode(page, "list");

    const sentinel = await page.evaluate(READ_FOLDER);
    check("2단계 폴더 페이지(Sentinel AU): 목록 모드, direct 글 첫 만남만, breadcrumb에 홍차 링크, BACK = 부모 폴더 페이지",
      sentinel && sentinel.mode === "list" && same(sentinel.entries.map(e => e.title), ["첫 만남"]) &&
      same(sentinel.crumbs.map(c => c.text), ["HOME", "LOG", "홍차"]) &&
      sentinel.crumbs[2].href === `/${SLUG}/category/1/folder/1` &&
      sentinel.foot === `/${SLUG}/category/1/folder/1` &&
      sentinel.children.length === 1 && /3단 폴더/.test(sentinel.children[0].text),
      JSON.stringify(sentinel && { mode: sentinel.mode, entries: sentinel.entries.map(e => e.title), crumbs: sentinel.crumbs, foot: sentinel.foot }));

    await enterSeries(page);
    const sentinelSeries = await page.evaluate(READ_FOLDER);
    check("Sentinel AU 이어읽기: direct 글 본문만 이어진다(하위 3단 폴더의 글은 없음)",
      sentinelSeries && sentinelSeries.bodies.length === 1 &&
      sentinelSeries.bodies[0].bodyText === "첫 만남 본문입니다." &&
      !sentinelSeries.seriesText.includes("깊은 글"),
      JSON.stringify(sentinelSeries && sentinelSeries.bodies));

    /* 뒤로가기 → 같은 폴더의 목록 모드 */
    await page.goBack();
    await waitFolderMode(page, "list");
    check("이어읽기에서 뒤로가기: 같은 폴더의 목록 모드로(주소도 ?series=1 없음)",
      await page.evaluate(() => location.pathname + location.search) === `/${SLUG}/category/1/folder/2`);

    /* 소유자: secret 글이 있는 폴더 — 직접 접속 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/3`, { waitUntil: "domcontentloaded" });
    await waitFolderPage(page);
    await waitFolderMode(page, "list");
    const deepList = await page.evaluate(READ_FOLDER);
    check("직접 접속 + 소유자: secret 글도 목록에 🔒 제목으로 보이고, 목록 단계에선 본문 없음",
      deepList && deepList.mode === "list" && same(deepList.entries.map(e => e.title), ["🔒 깊은 글"]) &&
      deepList.entries[0].lock === true && deepList.bodies.every(b => b.bodyText === "") &&
      same(deepList.crumbs.map(c => c.text), ["HOME", "LOG", "홍차", "Sentinel AU"]),
      JSON.stringify(deepList && deepList.entries));

    await enterSeries(page);
    const deep = await page.evaluate(READ_FOLDER);
    check("소유자 이어읽기: secret 글(깊은 글)은 폼 없이 본문이 바로 보인다",
      deep && deep.bodies[0].bodyText === "깊은 글 본문입니다." && !deep.bodies[0].hasGate,
      JSON.stringify(deep && deep.bodies));

    /* 직접 ?series=1 접속 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/6?series=1`, { waitUntil: "domcontentloaded" });
    await waitFolderPage(page);
    await waitFolderMode(page, "series");
    await waitSeriesBodies(page);
    const priv = await page.evaluate(READ_FOLDER);
    check("직접 ?series=1 접속: 곧바로 이어읽기 모드 — private 글만 든 폴더도 소유자에게는 본문이 보인다",
      priv && priv.mode === "series" && priv.url === `/${SLUG}/category/1/folder/6?series=1` &&
      priv.title === "비공개 폴더" && priv.bodies[0].bodyText === "숨은 글 본문입니다.",
      JSON.stringify(priv && { mode: priv.mode, url: priv.url, bodies: priv.bodies }));

    /* direct 글이 없는 폴더(껍데기) 주소 → 카테고리로 복귀 + 주소 정리 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/7`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    check("direct 글이 없는 폴더(껍데기) 주소로 직접 들어오면 카테고리로 복귀하고 주소도 카테고리",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/1` &&
      Boolean(await page.evaluate(READ_OPEN_LINKS)));

    check("?series=1이 붙어 있어도 없는 폴더면 카테고리로 복귀하고 쿼리도 사라진다",
      await (async () => {
        await page.goto(`${BASE}/${SLUG}/category/1/folder/7?series=1`, { waitUntil: "domcontentloaded" });
        await waitTree(page);
        return await page.evaluate(() => location.pathname + location.search);
      })() === `/${SLUG}/category/1`);

    check("소유자 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


async function testPublishedVisitor() {
  const viewport = VIEWPORTS["desktop-1280"];
  console.log("\n[published · visitor]");

  const log = [];

  await withPage(viewport, { log }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await waitTree(page);

    const open = await page.evaluate(READ_OPEN_LINKS);
    check("방문자 CATEGORY: 비공개 폴더(private 글뿐)는 잘리고 OPEN 링크 5개(홍차/Sentinel AU/3단 폴더/2002/속)",
      open && same(open.links.map(l => l.folder).sort(), ["2002", "3단 폴더", "Sentinel AU", "속", "홍차"].sort()) &&
      !open.text.includes("비공개 폴더") && !open.text.includes("숨은 글"),
      JSON.stringify(open && open.links));

    /* secret 글이 든 폴더 — 목록 모드에서는 본문도 폼도 없다 */
    await page.evaluate(() => {
      document.querySelector('#postList .imory-skin-root a.finder-folder-open[href$="/category/1/folder/3"]').click();
    });
    await waitFolderPage(page);
    await waitFolderMode(page, "list");

    const lockedList = await page.evaluate(READ_FOLDER);
    check("방문자 목록 모드: secret 글은 🔒 제목 + 자물쇠 표시만, 비밀번호 폼도 본문도 없고 EDIT도 없다",
      lockedList && lockedList.mode === "list" && same(lockedList.entries.map(e => e.title), ["🔒 깊은 글"]) &&
      lockedList.entries[0].lock === true && lockedList.entries[0].edit === null &&
      lockedList.bodies.every(b => b.bodyText === "" && !b.hasGate),
      JSON.stringify(lockedList && lockedList.entries));

    check("★ 방문자 목록 모드에서도 post_contents 요청은 0건",
      log.filter(e => e.table === "post_contents").length === 0,
      JSON.stringify(log.filter(e => e.table === "post_contents")));

    check("방문자: 상단 EDIT(manageHref) 없음, BACK과 '전체 이어읽기'만",
      lockedList && !lockedList.actions.some(a => a.text === "EDIT") &&
      lockedList.actions.some(a => a.text === "BACK") &&
      lockedList.actions.some(a => a.text.includes("전체 이어읽기")),
      JSON.stringify(lockedList && lockedList.actions));

    /* 전체 이어읽기 → 글별 비밀번호 폼 */
    await enterSeries(page);
    await page.waitForSelector("#postList .imory-skin-root .finder-post-body .post-secret-gate", { timeout: 10000 });

    const locked = await page.evaluate(READ_FOLDER);
    check("방문자 이어읽기: secret 글은 그 글의 region 안에 비밀번호 폼, 본문 없음",
      locked && locked.mode === "series" && locked.bodies[0].hasGate &&
      !locked.bodies[0].bodyText.includes("본문입니다"),
      JSON.stringify(locked && locked.bodies));

    const contentRequests = log.filter(e => e.table === "post_contents");
    check("네트워크: 방문자의 post_contents 배치 요청에 secret 글 id(403)가 들어가지 않는다(요청 자체가 없거나 다른 id만)",
      contentRequests.every(e => !/403/.test(e.search)),
      JSON.stringify(contentRequests));

    /* 오답 */
    await page.fill("#postList .post-secret-gate-input", "wrong");
    await page.click("#postList .post-secret-gate-button");
    await page.waitForFunction(() => {
      const m = document.querySelector("#postList .post-secret-gate-message");
      return Boolean(m) && m.textContent.length > 0;
    }, null, { timeout: 10000 });
    const wrongState = await page.evaluate(() => ({
      message: document.querySelector("#postList .post-secret-gate-message").textContent,
      gateStill: Boolean(document.querySelector("#postList .finder-post-body .post-secret-gate"))
    }));
    check("오답: get_secret_post_content RPC가 거절하고 폼이 남는다",
      wrongState.message === "비밀번호가 일치하지 않습니다." && wrongState.gateStill &&
      log.some(e => e.rpc === "get_secret_post_content" && e.postId === "403" && e.password === "wrong"),
      JSON.stringify(wrongState));

    /* 정답 */
    await page.fill("#postList .post-secret-gate-input", SECRET_PASSWORD);
    await page.click("#postList .post-secret-gate-button");
    await page.waitForFunction(() =>
      !document.querySelector("#postList .finder-post-body .post-secret-gate") &&
      /깊은 글 본문입니다/.test(document.querySelector("#postList .finder-post-body").textContent),
    null, { timeout: 10000 }).catch(() => {});
    const unlocked = await page.evaluate(READ_FOLDER);
    check("정답: 같은 RPC로 받은 본문이 그 글의 region에 그려지고 폼은 사라진다(글별 해제)",
      unlocked && !unlocked.bodies[0].hasGate && unlocked.bodies[0].bodyText === "깊은 글 본문입니다." &&
      log.some(e => e.rpc === "get_secret_post_content" && e.postId === "403" && e.password === SECRET_PASSWORD),
      JSON.stringify(unlocked && unlocked.bodies));

    check("해제 뒤에도 post_contents 배치 요청에 403은 여전히 없다(본문은 RPC로만 왔다)",
      log.filter(e => e.table === "post_contents").every(e => !/403/.test(e.search)));

    /* 방문자에게 보이는 direct 글이 없는 폴더(비공개 폴더) → 카테고리로 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/6`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    check("방문자: private 글뿐인 폴더 주소 → 카테고리로 복귀, 주소도 카테고리, 빈 폴더 페이지 없음",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/1` &&
      await page.evaluate(NO_FOLDER_PAGE));

    /* 삭제된(없는) 폴더 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/999`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    check("없는(삭제된) 폴더 주소 → 카테고리로 복귀 + 주소 정리",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/1`);

    /* 다른 카테고리의 폴더 id */
    await page.goto(`${BASE}/${SLUG}/category/2/folder/1`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    check("카테고리가 다른 폴더 주소(/category/2/folder/1) → 그 카테고리(NOTE)로 복귀",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/2` &&
      await page.evaluate(() => (document.querySelector("#postList .finder-content-head h1") || {}).textContent === "NOTE"));

    /* 직접 접속 정상 — 목록 모드 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/8`, { waitUntil: "domcontentloaded" });
    await waitFolderPage(page);
    await waitFolderMode(page, "list");
    const inner = await page.evaluate(READ_FOLDER);
    check("직접 접속: 껍데기 안의 '속' 폴더 페이지 — 목록 모드, breadcrumb에 껍데기 링크는 없고(열 수 없음) BACK은 카테고리",
      inner && inner.mode === "list" && same(inner.entries.map(e => e.title), ["속의 글"]) &&
      same(inner.crumbs.map(c => c.text), ["HOME", "LOG"]) && inner.foot === `/${SLUG}/category/1`,
      JSON.stringify(inner && { mode: inner.mode, crumbs: inner.crumbs, foot: inner.foot }));

    /* 직접 ?series=1 접속 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/8?series=1`, { waitUntil: "domcontentloaded" });
    await waitFolderPage(page);
    await waitFolderMode(page, "series");
    await waitSeriesBodies(page);
    const innerSeries = await page.evaluate(READ_FOLDER);
    check("방문자 직접 ?series=1 접속: 곧바로 이어읽기 모드로 본문이 이어진다",
      innerSeries && innerSeries.mode === "series" && innerSeries.url === `/${SLUG}/category/1/folder/8?series=1` &&
      innerSeries.bodies[0].bodyText === "속의 글 본문입니다." && innerSeries.seriesHeadings === 0,
      JSON.stringify(innerSeries && { mode: innerSeries.mode, url: innerSeries.url, bodies: innerSeries.bodies }));

    check("방문자 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


async function testPublishedNoFolderTemplate() {
  console.log("\n[published · templates.folder 없는 스킨]");

  await withPage(VIEWPORTS["desktop-1280"], { skin: FOLDER_SKIN_NO_PAGE, signedInAs: OWNER_ID }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    const open = await page.evaluate(READ_OPEN_LINKS);
    check("templates.folder가 없으면 folderHref가 전부 null → OPEN 링크가 하나도 그려지지 않는다(폴더 카드 자체는 그대로)",
      open && open.links.length === 0 && open.hiddenOpen > 0 && open.text.includes("홍차"),
      JSON.stringify(open && { links: open.links.length, hidden: open.hiddenOpen }));

    await page.goto(`${BASE}/${SLUG}/category/1/folder/1`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    check("templates.folder가 없는 스킨에서 폴더 주소로 직접 들어오면 카테고리로 복귀(폴백 Series Viewer 없음)",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/1` &&
      await page.evaluate(NO_FOLDER_PAGE));

    check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


async function testPublishedMobile() {
  console.log("\n[published · mobile-390]");

  await withPage(VIEWPORTS["mobile-390"], {}, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1/folder/1`, { waitUntil: "domcontentloaded" });
    await waitFolderPage(page);
    await waitFolderMode(page, "list");
    const l = await page.evaluate(READ_FOLDER);
    check("모바일: 폴더 페이지가 목록 모드로 그려지고 가로 넘침 없음",
      l && l.mode === "list" && same(l.entries.map(e => e.title), ["홍차 노트"]) && l.scrollWidth <= l.innerWidth + 1,
      l && `mode=${l.mode} scrollWidth=${l.scrollWidth} innerWidth=${l.innerWidth}`);

    await enterSeries(page);
    const s = await page.evaluate(READ_FOLDER);
    check("모바일: 전체 이어읽기로 넘어가도 본문이 채워지고 가로 넘침 없음",
      s && s.mode === "series" && s.bodies[0].bodyText === "홍차 노트 본문입니다." && s.scrollWidth <= s.innerWidth + 1,
      s && `mode=${s.mode} scrollWidth=${s.scrollWidth} innerWidth=${s.innerWidth}`);

    check("모바일 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   2) preview — Studio scenario t
--------------------------------------------------------- */

const SCENARIO_URL = `${BASE}/studio/studio-lifecycle-scenario.html?scenario=t`;

function previewHas(page, selector, timeoutMs = 10000) {
  return page.waitForFunction(
    (sel) => {
      const frame = document.getElementById("studioPreviewFrame");
      const doc = frame && frame.contentDocument;
      return Boolean(doc && doc.querySelector(sel));
    },
    selector,
    { timeout: timeoutMs }
  );
}

async function previewGoto(page, href, type) {
  await page.evaluate((h) => window.__testHooks.simulateNavigate(h), href);
  await page.waitForFunction(
    (t) => window.getCurrentPreviewLocation().type === t,
    type,
    { timeout: 10000 }
  );
}

const READ_PREVIEW_FOLDER = `(() => {
  const doc = document.getElementById("studioPreviewFrame").contentDocument;
  const root = doc && doc.querySelector(".imory-skin-root");
  const head = root && root.querySelector(".finder-series-head");
  if (!head) return null;
  const vis = (el) => Boolean(el) && !el.hidden && !el.closest("[hidden]");
  const listMode = root.querySelector(".finder-folder-list-mode");
  const series = root.querySelector(".finder-series");
  return {
    mode: vis(series) ? "series" : (vis(listMode) ? "list" : "none"),
    title: head.querySelector("h1").textContent,
    entries: Array.from(root.querySelectorAll(".finder-series-list .finder-entry")).map((a) => ({
      title: a.querySelector(".finder-entry-title").textContent,
      href: a.getAttribute("href")
    })),
    bodies: Array.from(root.querySelectorAll(".finder-series-post")).map((a) => ({
      bodyText: a.querySelector(".finder-post-body").textContent.trim(),
      regionKey: a.querySelector(".finder-post-body").getAttribute("data-imory-region-key")
    })),
    seriesHeadings: series ? series.querySelectorAll("h1, h2, h3, .finder-series-post-title, .finder-series-post-head, .finder-entry-doc").length : -1,
    actions: Array.from(root.querySelectorAll(".finder-actions a")).filter(vis).map((a) => ({ text: a.textContent, href: a.getAttribute("href") })),
    children: Array.from(root.querySelectorAll(".finder-series-child")).filter(vis).map((a) => a.getAttribute("href")),
    codeDisabled: document.getElementById("studioCodeButton").disabled,
    overlayHidden: document.getElementById("studioPreviewOverlay").hidden,
    location: window.getCurrentPreviewLocation()
  };
})()`;

/* Preview에서 폴더 페이지의 모드까지 기다린다 — 두 모드 모두
   location.type === "folder"라 previewGoto만으로는 구분되지 않는다. */
async function previewFolderMode(page, mode) {
  await page.waitForFunction((m) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const root = doc && doc.querySelector(".imory-skin-root");
    const series = root && root.querySelector(".finder-series");
    const list = root && root.querySelector(".finder-folder-list-mode");
    if (!series || !list) return false;
    const vis = (el) => !el.hidden && !el.closest("[hidden]");
    return m === "series" ? vis(series) : vis(list);
  }, mode, { timeout: 10000 });
  await page.waitForTimeout(250);
}

async function testPreview() {
  console.log("\n[preview · Studio scenario t]");

  await withPage(VIEWPORTS["desktop-1280"], {
    noSupabaseMock: true,
    initScript: {
      fn: (pkg) => { window.__scenarioFolderSkinPackage = pkg; },
      arg: FOLDER_SKIN_V2
    }
  }, async (page, { errors }) => {
    await page.goto(SCENARIO_URL, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
      null,
      { timeout: 15000 }
    );
    await previewHas(page, ".finder-page");

    await previewGoto(page, "/scenario-t/category/301", "category");
    await previewHas(page, ".finder-tree");
    await page.waitForTimeout(250);

    const openLinks = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return Array.from(doc.querySelectorAll(".finder-folder-open"))
        .filter((a) => !a.hidden && !a.closest("[hidden]"))
        .map((a) => a.getAttribute("href"));
    });
    check("Preview CATEGORY: OPEN 링크(folderHref)가 published와 같은 규칙으로 그려진다(scenario-t slug, 901/902/903/905/906)",
      same([...openLinks].sort(), [
        "/scenario-t/category/301/folder/901",
        "/scenario-t/category/301/folder/902",
        "/scenario-t/category/301/folder/903",
        "/scenario-t/category/301/folder/905",
        "/scenario-t/category/301/folder/906"
      ].sort()),
      JSON.stringify(openLinks));

    /* 폴더 페이지로 — 실제 링크 클릭과 같은 경로(preview:navigate) */
    await previewGoto(page, "/scenario-t/category/301/folder/901", "folder");
    await previewFolderMode(page, "list");

    const list = await page.evaluate(READ_PREVIEW_FOLDER);
    check("Preview FOLDER: 공개 화면과 같이 목록 모드가 기본 — 제목 홍차, direct 글(홍차 노트) 제목만, 본문은 채우지 않는다",
      list && list.mode === "list" && list.title === "홍차" &&
      same(list.entries.map(e => e.title), ["홍차 노트"]) &&
      list.bodies.every(b => b.bodyText === "") &&
      list.location.type === "folder" && list.location.folderId === "901" && list.overlayHidden,
      JSON.stringify(list && { mode: list.mode, entries: list.entries, bodies: list.bodies }));

    check("Preview FOLDER: 하위 폴더 링크(Sentinel AU=902), '전체 이어읽기' 링크(?series=1), CODE 버튼 활성",
      list && same(list.children, ["/scenario-t/category/301/folder/902"]) && list.codeDisabled === false &&
      list.actions.some(a => a.text.includes("전체 이어읽기") && a.href === "/scenario-t/category/301/folder/901?series=1"),
      JSON.stringify(list && { children: list.children, codeDisabled: list.codeDisabled, actions: list.actions }));

    /* 같은 폴더 재진입(같은 모드)은 no-op — 스택이 늘어나지 않는다 */
    await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-t/category/301/folder/901"));
    await page.waitForTimeout(250);

    /* 전체 이어읽기 */
    await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-t/category/301/folder/901?series=1"));
    await previewFolderMode(page, "series");
    await page.waitForFunction(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const body = doc && doc.querySelector(".finder-series-post .finder-post-body");
      return Boolean(body) && body.textContent.trim().length > 0;
    }, null, { timeout: 10000 }).catch(() => {});

    const series = await page.evaluate(READ_PREVIEW_FOLDER);
    check("Preview FOLDER ?series=1: 본문이 키가 맞는 region에 채워지고(preview:folder-bodies) 글별 제목/헤더는 반복되지 않는다",
      series && series.mode === "series" && series.bodies[0].regionKey === "404" &&
      series.bodies[0].bodyText === "본문 404." && series.seriesHeadings === 0 &&
      series.actions.some(a => a.text.includes("목록 보기") && a.href === "/scenario-t/category/301/folder/901"),
      JSON.stringify(series));

    /* Back: 이어읽기 → 목록 → 카테고리 */
    await page.click("#studioPreviewBackButton");
    await previewFolderMode(page, "list");
    check("Preview Back: 이어읽기 → 같은 폴더의 목록 모드(같은 주소 재클릭은 스택을 늘리지 않았다)",
      (await page.evaluate(() => window.getCurrentPreviewLocation())).folderId === "901");

    await page.click("#studioPreviewBackButton");
    await page.waitForFunction(() => window.getCurrentPreviewLocation().type === "category", null, { timeout: 10000 });
    await previewHas(page, ".finder-tree");
    check("Preview Back: 폴더 → 카테고리",
      (await page.evaluate(() => window.getCurrentPreviewLocation())).categoryId === "301");

    /* 잘린(빈) 폴더 → empty overlay */
    await previewGoto(page, "/scenario-t/category/301/folder/904", "folder");
    /* 로딩 overlay("불러오는 중")가 아니라 최종 empty 문구가 뜰 때까지 기다린다 */
    await page.waitForFunction(() => {
      const overlay = document.getElementById("studioPreviewOverlay");
      const text = document.querySelector("#studioPreviewOverlay .studio-preview-overlay-text").textContent;
      return overlay.hidden === false && !/불러오는 중/.test(text);
    }, null, { timeout: 10000 }).catch(() => {});
    const emptyOverlay = await page.evaluate(() => ({
      hidden: document.getElementById("studioPreviewOverlay").hidden,
      text: document.querySelector("#studioPreviewOverlay .studio-preview-overlay-text").textContent,
      backVisible: !document.getElementById("studioPreviewBackButton").hidden
    }));
    check("Preview: 보여줄 글이 없는 폴더(904)는 empty overlay('찾을 수 없거나 보여줄 글이 없습니다') + Back",
      emptyOverlay.hidden === false && /보여줄 글이 없습니다/.test(emptyOverlay.text) && emptyOverlay.backVisible,
      JSON.stringify(emptyOverlay));

    check("Preview 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });

  /* templates.folder 없는 스킨 — unsupported overlay */
  await withPage(VIEWPORTS["desktop-1280"], {
    noSupabaseMock: true,
    initScript: {
      fn: (pkg) => { window.__scenarioFolderSkinPackage = pkg; },
      arg: FOLDER_SKIN_NO_PAGE
    }
  }, async (page, { errors }) => {
    await page.goto(SCENARIO_URL, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
      null,
      { timeout: 15000 }
    );
    await previewHas(page, ".finder-page");

    await previewGoto(page, "/scenario-t/category/301", "category");
    await previewHas(page, ".finder-tree");
    await page.waitForTimeout(250);
    const openCount = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return Array.from(doc.querySelectorAll(".finder-folder-open")).filter((a) => !a.hidden && !a.closest("[hidden]")).length;
    });
    check("Preview(templates.folder 없음): OPEN 링크 0개", openCount === 0, `count=${openCount}`);

    await previewGoto(page, "/scenario-t/category/301/folder/901", "folder");
    await page.waitForFunction(() => document.getElementById("studioPreviewOverlay").hidden === false, null, { timeout: 10000 }).catch(() => {});
    const overlay = await page.evaluate(() => ({
      hidden: document.getElementById("studioPreviewOverlay").hidden,
      text: document.querySelector("#studioPreviewOverlay .studio-preview-overlay-text").textContent,
      codeDisabled: document.getElementById("studioCodeButton").disabled
    }));
    check("Preview(templates.folder 없음): 폴더 주소는 unsupported overlay('FOLDER 템플릿이 없습니다') + CODE 비활성",
      overlay.hidden === false && /FOLDER 템플릿/.test(overlay.text) && overlay.codeDisabled === true,
      JSON.stringify(overlay));

    check("Preview(no folder) 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   main
--------------------------------------------------------- */

(async () => {
  console.log(`\n=== FOLDER-2 Folder Route + Series Viewer E2E (${BROWSER}) ===`);

  playwright = await loadPlaywright(BROWSER);
  const server = await startServer();

  try {
    if (shouldRun("published")) {
      await testPublishedOwner("desktop-1280");
      await testPublishedVisitor();
      await testPublishedNoFolderTemplate();
      await testPublishedMobile();
    }
    if (shouldRun("preview")) await testPreview();
  } finally {
    server.close();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
