/* =========================================================
   FOLDER-2 — Folder Route + Series Viewer E2E

   /:slug/category/:cid/folder/:fid 폴더 페이지가 published 화면과
   Studio Preview에서 같은 계약으로 동작하는지 확인한다.
   기준 문서: IMORY_FOLDER2_DESIGN.md.

   1. published — folder-aware 스킨 v2(skin/test-skins/
      imory-finder-folders-v2.json, templates.folder 포함)로:
      - CATEGORY의 폴더 카드에 OPEN 링크(folderHref)가 direct 글이 있는
        폴더에만 그려진다(하위 폴더에만 글이 있는 폴더는 링크 없음).
      - OPEN → 폴더 페이지: 제목 = 폴더 이름, direct 글만 sort_order
        순으로, 각 글 본문이 region에 채워진다(하위 폴더 글은 재귀 포함
        안 함), 하위 폴더 탐색 링크, breadcrumb/BACK, 소유자 EDIT.
      - 소유자: secret/private 글도 본문이 바로 보인다.
      - 방문자: secret 글은 글별 비밀번호 폼, post_contents 배치 요청에
        secret id가 들어가지 않는다, 오답/정답 처리(RPC mock).
      - 방문자에게 보이는 direct 글이 없는 폴더 / 삭제된 폴더 / direct
        글이 없는 폴더 / templates.folder 없는 스킨 → 카테고리로 복귀
        (주소도 카테고리로).
      - 직접 접속, 뒤로가기 복귀, 모바일 가로 넘침 없음.
   2. preview — Studio scenario t에 같은 JSON을 실어 CATEGORY의 OPEN
      링크 → 폴더 페이지 → 같은 글/본문, CODE 버튼 활성, 없는 폴더는
      overlay, templates.folder 없는 스킨은 unsupported overlay.

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


/* published 폴더 페이지 상태 읽기 */
const READ_SERIES = `(() => {
  const root = document.querySelector("#postList .imory-skin-root");
  const series = root && root.querySelector(".finder-series");
  if (!series) return null;
  const vis = (el) => Boolean(el) && !el.hidden;
  const posts = Array.from(series.querySelectorAll(".finder-series-post")).map((a) => ({
    title: a.querySelector(".finder-series-post-title").textContent,
    edit: vis(a.querySelector(".finder-series-post-edit")) ? a.querySelector(".finder-series-post-edit").getAttribute("href") : null,
    bodyText: a.querySelector(".finder-post-body").textContent.trim(),
    hasGate: Boolean(a.querySelector(".finder-post-body .post-secret-gate")),
    regionKey: a.querySelector(".finder-post-body").getAttribute("data-imory-region-key")
  }));
  const crumbs = Array.from(root.querySelectorAll(".finder-breadcrumb a")).filter(vis).map((a) => ({ text: a.textContent, href: a.getAttribute("href") }));
  const children = Array.from(root.querySelectorAll(".finder-series-child")).filter(vis).map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href") }));
  const actions = Array.from(root.querySelectorAll(".finder-actions a")).filter(vis).map((a) => ({ text: a.textContent, href: a.getAttribute("href") }));
  return {
    title: root.querySelector(".finder-series-head h1").textContent,
    count: root.querySelector(".finder-count").textContent.trim(),
    posts, crumbs, children, actions,
    foot: (root.querySelector(".finder-series-foot a") || {}).getAttribute ? root.querySelector(".finder-series-foot a").getAttribute("href") : null,
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

async function waitSeries(page) {
  await page.waitForSelector("#postList .imory-skin-root .finder-series", { timeout: 15000 });
  await page.waitForTimeout(300);
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


/* ---------------------------------------------------------
   1) published
--------------------------------------------------------- */

async function testPublishedOwner(vpName) {
  const viewport = VIEWPORTS[vpName];
  console.log(`\n[published · owner · ${vpName}]`);

  await withPage(viewport, { signedInAs: OWNER_ID }, async (page, { errors }) => {
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

    /* OPEN → 폴더 페이지 (SPA) */
    await page.evaluate(() => {
      document.querySelector('#postList .imory-skin-root a.finder-folder-open[href$="/category/1/folder/1"]').click();
    });
    await waitSeries(page);
    await waitUrl(page, `/${SLUG}/category/1/folder/1`);

    const tea = await page.evaluate(READ_SERIES);
    check("홍차 폴더 페이지: 주소 /category/1/folder/1, 제목 = folder.name, direct 글만(홍차 노트) — 하위 폴더의 글(첫 만남/깊은 글)은 없음",
      tea && tea.url === `/${SLUG}/category/1/folder/1` && tea.title === "홍차" &&
      same(tea.posts.map(p => p.title), ["홍차 노트"]) && tea.count.startsWith("1"),
      JSON.stringify(tea && { url: tea.url, title: tea.title, posts: tea.posts.map(p => p.title) }));

    check("본문이 그 글의 region(키=글 id)에 채워진다",
      tea && tea.posts[0].regionKey === "404" && tea.posts[0].bodyText === "홍차 노트 본문입니다." && !tea.posts[0].hasGate,
      JSON.stringify(tea && tea.posts[0]));

    check("소유자: 글별 EDIT(editHref = ?edit=1) · 상단 EDIT(카테고리 ?manage=1) · BACK = 카테고리",
      tea && tea.posts[0].edit === `/${SLUG}/post/404?edit=1` &&
      tea.actions.some(a => a.text === "EDIT" && a.href === `/${SLUG}/category/1?manage=1`) &&
      tea.actions.some(a => a.text === "BACK" && a.href === `/${SLUG}/category/1`) &&
      tea.foot === `/${SLUG}/category/1`,
      JSON.stringify(tea && tea.actions));

    check("하위 폴더 탐색: folder.children에 Sentinel AU 링크(direct 글 수 1)",
      tea && tea.children.length === 1 && /Sentinel AU/.test(tea.children[0].text) && /1$/.test(tea.children[0].text) &&
      tea.children[0].href === `/${SLUG}/category/1/folder/2`,
      JSON.stringify(tea && tea.children));

    check("breadcrumb: HOME / LOG(카테고리) — 1단계 폴더라 조상 없음",
      tea && same(tea.crumbs.map(c => c.text), ["HOME", "LOG"]) && tea.crumbs[1].href === `/${SLUG}/category/1`);

    check("폴더 페이지 가로 넘침 없음",
      tea && tea.scrollWidth <= tea.innerWidth + 1, tea && `scrollWidth=${tea.scrollWidth} innerWidth=${tea.innerWidth}`);

    check("플랫폼 mount 계약: post-container--skin-active + post-area--skin-active, legacy 헤더 숨김",
      await page.evaluate(() =>
        document.getElementById("postContainer").classList.contains("post-container--skin-active") &&
        document.getElementById("postArea").classList.contains("post-area--skin-active") &&
        getComputedStyle(document.querySelector("#postContainer .post-header")).display === "none"
      ));

    /* 하위 폴더로 */
    await page.evaluate(() => {
      document.querySelector('#postList .imory-skin-root a.finder-series-child[href$="/category/1/folder/2"]').click();
    });
    await page.waitForFunction(() => {
      const h1 = document.querySelector("#postList .imory-skin-root .finder-series-head h1");
      return Boolean(h1) && h1.textContent === "Sentinel AU";
    }, null, { timeout: 15000 });
    await page.waitForTimeout(300);

    const sentinel = await page.evaluate(READ_SERIES);
    check("2단계 폴더 페이지(Sentinel AU): direct 글 첫 만남만, breadcrumb에 홍차 링크, BACK = 부모 폴더 페이지",
      sentinel && same(sentinel.posts.map(p => p.title), ["첫 만남"]) &&
      sentinel.posts[0].bodyText === "첫 만남 본문입니다." &&
      same(sentinel.crumbs.map(c => c.text), ["HOME", "LOG", "홍차"]) &&
      sentinel.crumbs[2].href === `/${SLUG}/category/1/folder/1` &&
      sentinel.foot === `/${SLUG}/category/1/folder/1` &&
      sentinel.children.length === 1 && /3단 폴더/.test(sentinel.children[0].text),
      JSON.stringify(sentinel && { posts: sentinel.posts.map(p => p.title), crumbs: sentinel.crumbs, foot: sentinel.foot }));

    /* 뒤로가기 → 홍차 폴더 페이지 복귀 */
    await page.goBack();
    await page.waitForFunction(() => {
      const h1 = document.querySelector("#postList .imory-skin-root .finder-series-head h1");
      return Boolean(h1) && h1.textContent === "홍차" && location.pathname.endsWith("/category/1/folder/1");
    }, null, { timeout: 15000 }).catch(() => {});
    const back = await page.evaluate(READ_SERIES);
    check("브라우저 뒤로가기: 주소와 화면이 함께 홍차 폴더 페이지로 돌아온다",
      back && back.url === `/${SLUG}/category/1/folder/1` && back.title === "홍차" && same(back.posts.map(p => p.title), ["홍차 노트"]),
      JSON.stringify(back && { url: back.url, title: back.title }));

    /* 한 번 더 뒤로가기 → 카테고리 */
    await page.goBack();
    await waitTree(page);
    check("뒤로가기 한 번 더: 카테고리 스킨으로(폴더 URL은 history에 하나만 쌓임)",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/1`);

    /* 소유자: secret/private 글이 있는 폴더 — 본문 바로 보임 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/3`, { waitUntil: "domcontentloaded" });
    await waitSeries(page);
    const deep = await page.evaluate(READ_SERIES);
    check("직접 접속 + 소유자: secret 글(깊은 글)은 폼 없이 본문이 바로 보이고 제목에 🔒",
      deep && deep.url === `/${SLUG}/category/1/folder/3` && same(deep.posts.map(p => p.title), ["🔒 깊은 글"]) &&
      deep.posts[0].bodyText === "깊은 글 본문입니다." && !deep.posts[0].hasGate &&
      same(deep.crumbs.map(c => c.text), ["HOME", "LOG", "홍차", "Sentinel AU"]),
      JSON.stringify(deep && deep.posts));

    await page.goto(`${BASE}/${SLUG}/category/1/folder/6`, { waitUntil: "domcontentloaded" });
    await waitSeries(page);
    const priv = await page.evaluate(READ_SERIES);
    check("소유자: private 글만 든 폴더도 열리고(🙈 숨은 글) 본문이 보인다",
      priv && same(priv.posts.map(p => p.title), ["🙈 숨은 글"]) && priv.posts[0].bodyText === "숨은 글 본문입니다.",
      JSON.stringify(priv && priv.posts));

    /* direct 글이 없는 폴더(껍데기) 주소 → 카테고리로 복귀 + 주소 정리 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/7`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    check("direct 글이 없는 폴더(껍데기) 주소로 직접 들어오면 카테고리로 복귀하고 주소도 카테고리",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/1` &&
      Boolean(await page.evaluate(READ_OPEN_LINKS)));

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

    /* secret 글이 든 폴더 — 글별 비밀번호 폼 */
    await page.evaluate(() => {
      document.querySelector('#postList .imory-skin-root a.finder-folder-open[href$="/category/1/folder/3"]').click();
    });
    await waitSeries(page);
    await page.waitForSelector("#postList .imory-skin-root .finder-post-body .post-secret-gate", { timeout: 10000 });

    const locked = await page.evaluate(READ_SERIES);
    check("방문자: secret 글(깊은 글)은 그 글의 region 안에 비밀번호 폼, 본문 없음, 글별 EDIT 없음",
      locked && same(locked.posts.map(p => p.title), ["🔒 깊은 글"]) && locked.posts[0].hasGate &&
      !locked.posts[0].bodyText.includes("본문입니다") && locked.posts[0].edit === null,
      JSON.stringify(locked && locked.posts));

    check("방문자: 상단 EDIT(manageHref) 없음, BACK만",
      locked && !locked.actions.some(a => a.text === "EDIT") && locked.actions.some(a => a.text === "BACK"));

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
    const unlocked = await page.evaluate(READ_SERIES);
    check("정답: 같은 RPC로 받은 본문이 그 글의 region에 그려지고 폼은 사라진다(글별 해제)",
      unlocked && !unlocked.posts[0].hasGate && unlocked.posts[0].bodyText === "깊은 글 본문입니다." &&
      log.some(e => e.rpc === "get_secret_post_content" && e.postId === "403" && e.password === SECRET_PASSWORD),
      JSON.stringify(unlocked && unlocked.posts));

    check("해제 뒤에도 post_contents 배치 요청에 403은 여전히 없다(본문은 RPC로만 왔다)",
      log.filter(e => e.table === "post_contents").every(e => !/403/.test(e.search)));

    /* 방문자에게 보이는 direct 글이 없는 폴더(비공개 폴더) → 카테고리로 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/6`, { waitUntil: "domcontentloaded" });
    await waitTree(page);
    check("방문자: private 글뿐인 폴더 주소 → 카테고리로 복귀, 주소도 카테고리, 빈 폴더 페이지 없음",
      await page.evaluate(() => location.pathname) === `/${SLUG}/category/1` &&
      await page.evaluate(() => !document.querySelector("#postList .finder-series")));

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

    /* 직접 접속 정상 */
    await page.goto(`${BASE}/${SLUG}/category/1/folder/8`, { waitUntil: "domcontentloaded" });
    await waitSeries(page);
    const inner = await page.evaluate(READ_SERIES);
    check("직접 접속: 껍데기 안의 '속' 폴더 페이지 — breadcrumb에 껍데기 링크는 없고(열 수 없음) BACK은 카테고리",
      inner && same(inner.posts.map(p => p.title), ["속의 글"]) && inner.posts[0].bodyText === "속의 글 본문입니다." &&
      same(inner.crumbs.map(c => c.text), ["HOME", "LOG"]) && inner.foot === `/${SLUG}/category/1`,
      JSON.stringify(inner && { crumbs: inner.crumbs, foot: inner.foot }));

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
      await page.evaluate(() => !document.querySelector("#postList .finder-series")));

    check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


async function testPublishedMobile() {
  console.log("\n[published · mobile-390]");

  await withPage(VIEWPORTS["mobile-390"], {}, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1/folder/1`, { waitUntil: "domcontentloaded" });
    await waitSeries(page);
    const s = await page.evaluate(READ_SERIES);
    check("모바일: 폴더 페이지가 그려지고 가로 넘침 없음",
      s && same(s.posts.map(p => p.title), ["홍차 노트"]) && s.scrollWidth <= s.innerWidth + 1,
      s && `scrollWidth=${s.scrollWidth} innerWidth=${s.innerWidth}`);
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

const READ_PREVIEW_SERIES = `(() => {
  const doc = document.getElementById("studioPreviewFrame").contentDocument;
  const root = doc && doc.querySelector(".imory-skin-root");
  const series = root && root.querySelector(".finder-series");
  if (!series) return null;
  return {
    title: root.querySelector(".finder-series-head h1").textContent,
    posts: Array.from(series.querySelectorAll(".finder-series-post")).map((a) => ({
      title: a.querySelector(".finder-series-post-title").textContent,
      bodyText: a.querySelector(".finder-post-body").textContent.trim(),
      regionKey: a.querySelector(".finder-post-body").getAttribute("data-imory-region-key")
    })),
    children: Array.from(root.querySelectorAll(".finder-series-child")).filter((a) => !a.hidden).map((a) => a.getAttribute("href")),
    codeDisabled: document.getElementById("studioCodeButton").disabled,
    overlayHidden: document.getElementById("studioPreviewOverlay").hidden,
    location: window.getCurrentPreviewLocation()
  };
})()`;

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
    await previewHas(page, ".finder-series");
    await page.waitForFunction(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const body = doc && doc.querySelector(".finder-series-post .finder-post-body");
      return Boolean(body) && body.textContent.trim().length > 0;
    }, null, { timeout: 10000 }).catch(() => {});

    const series = await page.evaluate(READ_PREVIEW_SERIES);
    check("Preview FOLDER: 같은 template/Context — 제목 홍차, direct 글(홍차 노트)만, 본문이 키가 맞는 region에 채워짐(preview:folder-bodies)",
      series && series.title === "홍차" && same(series.posts.map(p => p.title), ["홍차 노트"]) &&
      series.posts[0].regionKey === "404" && series.posts[0].bodyText === "본문 404." &&
      series.location.type === "folder" && series.location.folderId === "901" && series.overlayHidden,
      JSON.stringify(series));

    check("Preview FOLDER: 하위 폴더 링크(Sentinel AU=902), CODE 버튼이 templates.folder를 잡아 활성",
      series && same(series.children, ["/scenario-t/category/301/folder/902"]) && series.codeDisabled === false,
      JSON.stringify(series && { children: series.children, codeDisabled: series.codeDisabled }));

    /* 같은 폴더 재진입은 no-op(스택 안 늘어남) → Back 한 번에 카테고리 */
    await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-t/category/301/folder/901"));
    await page.click("#studioPreviewBackButton");
    await page.waitForFunction(() => window.getCurrentPreviewLocation().type === "category", null, { timeout: 10000 });
    await previewHas(page, ".finder-tree");
    check("Preview Back: 폴더 → 카테고리(같은 폴더 링크 재클릭은 스택을 늘리지 않음)",
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
