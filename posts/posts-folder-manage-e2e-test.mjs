/* =========================================================
   FOLDER-1 — CATEGORY 관리 화면(폴더 트리) E2E

   ?manage=1 관리 화면에서 폴더를 만들고, 이름을 바꾸고, 지우고,
   글/폴더를 끌어 옮기는 동선을 실제 화면에서 확인한다.

   skin/skin-write-manage-e2e-test.mjs와 같은 방식/같은 규약이다
   (정적 서버 + Supabase 네트워크만 mock + 저장소의 실제 파일).

   ★ 무엇을 mock하는가
   Supabase REST/RPC 응답과 로그인 상태뿐이다. 폴더 RPC 4종은 여기서
   JS로 흉내 내는데, 그 목적은 **화면과 요청 계약**을 보는 것이다:
   무엇을 어떤 인자로 부르는지, 실패했을 때 화면이 되돌아가는지.

   ★ DB 규칙(3단계 제한 / cycle 금지 / 삭제 시 자리 물려받기 /
     소유권 / backfill)은 여기서 검증하지 않는다. 그건 실제 PostgreSQL
     엔진에서 supabase/migrations의 SQL을 그대로 실행해 확인했고
     (54개 항목), 실제 Supabase 인스턴스용 절차는
     supabase/tests/20260908_post_folders_manual_test.sql에 있다.
     JS mock으로 SQL 의미를 다시 흉내 내면 "mock이 통과했다"는 것만
     증명하게 되므로 여기서는 하지 않는다.

   ★ SortableJS
   운영에서는 jsDelivr에서 고정 버전을 받는다. 테스트에서는 그 요청을
   가로채 로컬 캐시본으로 응답한다(첫 실행에만 네트워크 필요, 이후
   OS 임시 폴더에 캐시). 데스크톱 브라우저에서 SortableJS는 네이티브
   HTML5 drag를 쓰는데 Playwright의 마우스 API로는 그걸 일으킬 수
   없다 — 그래서 실제 포인터 drag는 **터치 컨텍스트**에서 검증한다
   (터치에서는 SortableJS가 fallback 경로를 쓰고, 그게 곧 모바일에서
   실사용자가 겪는 경로다).

   ★ 실행 방법
     node posts/posts-folder-manage-e2e-test.mjs
     node posts/posts-folder-manage-e2e-test.mjs --browser=webkit
     node posts/posts-folder-manage-e2e-test.mjs --only=drag

   --only= 뒤에 쓸 수 있는 이름: render / crud / guard / drag / rollback
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8941;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const SORTABLE_URL =
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

function shouldRun(name) {
  return !ONLY || ONLY === name;
}


/* =========================================================
   playwright 찾기 — 다른 e2e 파일과 동일 전략
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
   SortableJS 로컬 캐시
========================================================== */

async function loadSortableSource() {
  const cachePath = path.join(os.tmpdir(), "imory-sortablejs-1.15.6.js");

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf8");
  }

  const res = await fetch(SORTABLE_URL);

  if (!res.ok) {
    throw new Error(
      `SortableJS를 받지 못했습니다(${res.status}). ` +
      `첫 실행에는 네트워크가 필요합니다.`
    );
  }

  const source = await res.text();
  fs.writeFileSync(cachePath, source, "utf8");
  return source;
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


const SKIN_PACKAGE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "skin", "test-skins", "imory-quiet-frame-v4.json"), "utf8")
);


/* =========================================================
   DB fixture

   카테고리 1(일기) 안에:

     root
       ├─ (글) 102 두 번째 글      sort 100   ← created_at DESC로도 첫째
       ├─ (글) 101 첫 번째 글      sort 200
       └─ 폴더 홍차(11)            sort 300
             └─ 폴더 Sentinel(12)  sort 100   (depth 2)
                   └─ (글) 103     sort 100   (depth 3 폴더 안의 글)

   depth 3 폴더(13)를 하나 더 두어 "+ 버튼이 비활성"인 경우를 만든다.
========================================================== */

function makeDb() {
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
      { id: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1 },
      { id: 2, user_id: OWNER_ID, name: "링크", type: "banner", sort_order: 2 }
    ],
    posts: [
      { id: 101, user_id: OWNER_ID, category_id: 1, title: "첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", quote_preset_id: null, folder_id: null, sort_order: 200 },
      { id: 102, user_id: OWNER_ID, category_id: 1, title: "두 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-02T02:00:00Z", quote_preset_id: null, folder_id: null, sort_order: 100 },
      { id: 103, user_id: OWNER_ID, category_id: 1, title: "세 번째 글", content_type: "text", visibility: "public", created_at: "2026-08-30T02:00:00Z", quote_preset_id: null, folder_id: 12, sort_order: 100 }
    ],
    post_folders: [
      { id: 11, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "홍차", depth: 1, sort_order: 300 },
      { id: 12, user_id: OWNER_ID, category_id: 1, parent_id: 11, name: "Sentinel", depth: 2, sort_order: 100 },
      { id: 13, user_id: OWNER_ID, category_id: 1, parent_id: 12, name: "13세", depth: 3, sort_order: 200 }
    ],
    post_contents: [
      { post_id: 101, content: "첫 번째 글 본문입니다." },
      { post_id: 102, content: "두 번째 글 본문입니다." },
      { post_id: 103, content: "세 번째 글 본문입니다." }
    ],
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
    const m = /^(eq|neq|in|is|gt|gte|lt|lte)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
      rows = rows.filter(r => list.includes(String(r[key])));
      continue;
    }
    if (op === "is") {
      rows = rows.filter(r => (val === "null" ? r[key] == null : r[key] != null));
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

  const select = params.get("select");
  if (select && select !== "*") {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }

  return rows;
}


/* =========================================================
   폴더 RPC mock

   화면 동선을 돌리기에 충분한 만큼만 흉내 낸다. 컨테이너 안의
   순서는 클라이언트가 보낸 이웃(prev/next)을 기준으로 다시 매기고,
   그 결과를 move_tree_node의 반환값 형식으로 돌려준다.
========================================================== */

function containerRows(db, categoryId, folderId) {
  const fid = folderId == null ? null : Number(folderId);

  const folders = db.post_folders
    .filter(f => Number(f.category_id) === Number(categoryId) &&
      (f.parent_id == null ? null : Number(f.parent_id)) === fid)
    .map(f => ({ kind: "folder", id: String(f.id), row: f }));

  const posts = db.posts
    .filter(p => Number(p.category_id) === Number(categoryId) &&
      (p.folder_id == null ? null : Number(p.folder_id)) === fid)
    .map(p => ({ kind: "post", id: String(p.id), row: p }));

  return [...folders, ...posts].sort((a, b) => {
    if (a.row.sort_order !== b.row.sort_order) {
      return a.row.sort_order - b.row.sort_order;
    }
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });
}

function handleFolderRpc(db, fn, body, calls) {
  calls.push({ fn, body });

  if (fn === "create_post_folder") {
    const nextId = Math.max(0, ...db.post_folders.map(f => f.id)) + 1;
    const parent = body.p_parent_id == null
      ? null
      : db.post_folders.find(f => f.id === Number(body.p_parent_id));
    const depth = parent ? parent.depth + 1 : 1;
    if (depth > 3) {
      return { error: { message: "create_post_folder: maximum folder depth (3) reached" } };
    }
    const siblings = containerRows(db, body.p_category_id, body.p_parent_id);
    db.post_folders.push({
      id: nextId,
      user_id: OWNER_ID,
      category_id: Number(body.p_category_id),
      parent_id: body.p_parent_id == null ? null : Number(body.p_parent_id),
      name: body.p_name,
      depth,
      sort_order: (siblings.length ? Math.max(...siblings.map(s => s.row.sort_order)) : 0) + 100
    });
    return { data: nextId };
  }

  if (fn === "rename_post_folder") {
    const folder = db.post_folders.find(f => f.id === Number(body.p_folder_id));
    if (!folder) return { error: { message: "rename_post_folder: folder not found" } };
    folder.name = body.p_name;
    return { data: null };
  }

  if (fn === "delete_post_folder") {
    const folder = db.post_folders.find(f => f.id === Number(body.p_folder_id));
    if (!folder) return { error: { message: "delete_post_folder: folder not found" } };
    /* 자식은 삭제된 폴더의 자리를 물려받는다(실제 RPC와 같은 정책) */
    const slot = folder.sort_order;
    const children = containerRows(db, folder.category_id, folder.id);
    children.forEach((child, index) => {
      child.row.sort_order = slot + (index + 1);
      if (child.kind === "folder") {
        child.row.parent_id = folder.parent_id;
        child.row.depth = folder.depth;
      } else {
        child.row.folder_id = folder.parent_id;
      }
    });
    db.post_folders = db.post_folders.filter(f => f.id !== folder.id);
    return { data: null };
  }

  if (fn === "move_tree_node") {
    const target = body.p_target_folder_id == null ? null : Number(body.p_target_folder_id);

    const node = body.p_node_type === "folder"
      ? db.post_folders.find(f => f.id === Number(body.p_node_id))
      : db.posts.find(p => p.id === Number(body.p_node_id));

    if (!node) return { error: { message: "move_tree_node: node not found for this user" } };

    const categoryId = node.category_id;

    if (body.p_node_type === "folder") {
      node.parent_id = target;
    } else {
      node.folder_id = target;
    }

    /* prev/next 사이에 끼워 넣고 컨테이너를 100 간격으로 다시 매긴다 */
    const others = containerRows(db, categoryId, target)
      .filter(entry => !(entry.kind === body.p_node_type && entry.id === String(body.p_node_id)));

    const insertAt = body.p_prev_id == null
      ? 0
      : others.findIndex(e => e.kind === body.p_prev_type && e.id === String(body.p_prev_id)) + 1;

    const moved = { kind: body.p_node_type, id: String(body.p_node_id), row: node };
    others.splice(insertAt < 0 ? others.length : insertAt, 0, moved);

    others.forEach((entry, index) => {
      entry.row.sort_order = (index + 1) * 100;
    });

    return {
      data: others.map(entry => ({ kind: entry.kind, id: entry.id }))
    };
  }

  return { data: null };
}


async function installSupabaseMock(page, opts = {}) {
  const {
    skin = SKIN_PACKAGE,
    db = makeDb(),
    sortableSource = "",
    rpcCalls = [],
    failRpc = null
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

      let parsed = {};
      try {
        parsed = JSON.parse(req.postData() || "{}");
      } catch { /* 빈 body */ }

      if (failRpc && failRpc === fn) {
        rpcCalls.push({ fn, body: parsed, failed: true });
        return route.fulfill({
          status: 400, headers, contentType: "application/json",
          body: JSON.stringify({ code: "P0001", message: `${fn}: mock failure` })
        });
      }

      const result = handleFolderRpc(db, fn, parsed, rpcCalls);

      if (result.error) {
        return route.fulfill({
          status: 400, headers, contentType: "application/json",
          body: JSON.stringify({ code: "P0001", message: result.error.message })
        });
      }

      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify(result.data === undefined ? null : result.data)
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

  /* 운영과 같은 URL을 그대로 쓰되 응답만 로컬 캐시본으로 준다 */
  await page.route(SORTABLE_URL, route =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      headers: { "access-control-allow-origin": "*" },
      body: sortableSource
    }));

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

let playwright;
let SORTABLE_SOURCE = "";

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

async function withPage(opts, fn) {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: Boolean(opts.hasTouch),
    isMobile: Boolean(opts.hasTouch) && BROWSER === "chromium"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await installSignedInUser(page, opts.signedInAs || OWNER_ID);
  await installSupabaseMock(page, { ...opts, sortableSource: SORTABLE_SOURCE });

  /* 터치 입력은 CDP로만 실제 파이프라인을 탈 수 있다(chromium 전용) */
  const cdp = opts.hasTouch && BROWSER === "chromium"
    ? await context.newCDPSession(page)
    : null;

  try {
    return await fn(page, { errors, cdp });
  } finally {
    await browser.close();
  }
}

const BASE = `http://localhost:${PORT}`;

/* 관리 화면을 열고 트리가 그려질 때까지 기다린다 */
async function gotoManage(page) {
  await page.goto(`${BASE}/${SLUG}/category/1?manage=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#postList .folder-tree", { timeout: 20000 });
  await page.waitForTimeout(400);
}

/* 화면에 보이는 트리를 평평한 목록으로 읽는다 */
const READ_TREE = `(() => {
  const walk = (container, depth, out) => {
    for (const node of container.children) {
      if (!node.classList || !node.classList.contains("folder-node")) continue;
      const kind = node.dataset.nodeKind;
      const label = kind === "folder"
        ? node.querySelector(":scope > .folder-row > .folder-name").textContent
        : node.querySelector(":scope > .post-list-item > .post-list-title").textContent.trim();
      out.push({ kind, id: node.dataset.nodeId, depth, label });
      const child = node.querySelector(":scope > .folder-tree-container");
      if (child) walk(child, depth + 1, out);
    }
    return out;
  };
  const root = document.querySelector("#postList .folder-tree > .folder-tree-container");
  return root ? walk(root, 1, []) : null;
})()`;


/* =========================================================
   A. 렌더
========================================================== */

async function testRender() {
  console.log("\n[A] 관리 트리 렌더");

  await withPage({}, async (page, ctx) => {
    await gotoManage(page);

    const tree = await page.evaluate(READ_TREE);

    check("[A] 폴더 트리가 sort_order 순서로 계층까지 그려진다",
      JSON.stringify(tree) === JSON.stringify([
        { kind: "post", id: "102", depth: 1, label: "두 번째 글" },
        { kind: "post", id: "101", depth: 1, label: "첫 번째 글" },
        { kind: "folder", id: "11", depth: 1, label: "홍차" },
        { kind: "folder", id: "12", depth: 2, label: "Sentinel" },
        { kind: "post", id: "103", depth: 3, label: "세 번째 글" },
        { kind: "folder", id: "13", depth: 3, label: "13세" }
      ]),
      JSON.stringify(tree));

    const chrome = await page.evaluate(() => ({
      addButton: Boolean(document.querySelector("#postList .folder-tree-add-button")),
      handles: document.querySelectorAll("#postList .tree-drag-handle").length,
      checkboxes: document.querySelectorAll("#postList .post-list-item-checkbox").length,
      selectBar: !document.getElementById("postListSelectBar").hidden,
      containers: document.querySelectorAll("#postList .folder-tree-container").length
    }));

    check("[A] 기존 체크박스와 하단 선택삭제 바가 트리와 같은 화면에 있다(F-2)",
      chrome.checkboxes === 3 && chrome.selectBar === true,
      JSON.stringify(chrome));

    check("[A] 폴더/글 모두에 drag handle이 있고 컨테이너가 계층대로 생긴다",
      chrome.handles === 6 && chrome.containers === 4 && chrome.addButton,
      JSON.stringify(chrome));

    /* 체크 토글이 트리를 다시 그리지 않아야 한다(펼침 상태/스크롤 보존) */
    await page.click("#postList .folder-node[data-node-id='102'] .post-list-item-checkbox");
    await page.waitForTimeout(200);

    const afterCheck = await page.evaluate(() => ({
      count: document.getElementById("postListSelectCount").textContent,
      deleteEnabled: !document.getElementById("postListSelectDeleteButton").disabled,
      treeStillThere: Boolean(document.querySelector("#postList .folder-tree")),
      checked: document.querySelectorAll("#postList .post-list-item-checkbox:checked").length
    }));

    check("[A] 글을 체크하면 선택삭제 바만 갱신되고 트리는 그대로다",
      afterCheck.checked === 1 && afterCheck.deleteEnabled &&
      afterCheck.count.includes("1") && afterCheck.treeStillThere,
      JSON.stringify(afterCheck));

    /* 접기/펼치기 */
    await page.click("#postList .folder-node[data-node-id='11'] > .folder-row > .folder-toggle");
    await page.waitForTimeout(250);

    const collapsed = await page.evaluate(() => {
      const node = document.querySelector("#postList .folder-node[data-node-id='11']");
      const child = node.querySelector(":scope > .folder-tree-container");
      return {
        collapsed: node.classList.contains("folder-node--collapsed"),
        childHidden: child.hidden,
        expanded: node.querySelector(":scope > .folder-row > .folder-toggle").getAttribute("aria-expanded")
      };
    });

    check("[A] 폴더를 접으면 하위 컨테이너가 숨고 aria-expanded가 따라간다",
      collapsed.collapsed && collapsed.childHidden && collapsed.expanded === "false",
      JSON.stringify(collapsed));

    check("[A] 렌더 경로 콘솔 에러 없음", ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   B. 폴더 CRUD
========================================================== */

async function testCrud() {
  console.log("\n[B] 폴더 CRUD");

  const rpcCalls = [];
  const db = makeDb();

  await withPage({ db, rpcCalls }, async (page, ctx) => {
    await gotoManage(page);

    /* 1) root 폴더 만들기 */
    await page.evaluate(() => { window.prompt = () => "원수"; });
    await page.click("#postList .folder-tree-add-button");
    await page.waitForTimeout(600);

    const afterCreate = await page.evaluate(READ_TREE);

    check("[B] + folder로 root 폴더가 만들어지고 트리 끝에 붙는다",
      afterCreate.some(n => n.kind === "folder" && n.label === "원수" && n.depth === 1) &&
      afterCreate[afterCreate.length - 1].label === "원수",
      JSON.stringify(afterCreate.map(n => n.label)));

    const createCall = rpcCalls.find(c => c.fn === "create_post_folder");

    check("[B] create_post_folder 요청 계약(p_category_id/p_parent_id/p_name)",
      createCall &&
      Number(createCall.body.p_category_id) === 1 &&
      createCall.body.p_parent_id === null &&
      createCall.body.p_name === "원수",
      JSON.stringify(createCall && createCall.body));

    /* 2) 하위 폴더 만들기 */
    await page.evaluate(() => { window.prompt = () => "Noir"; });
    await page.click("#postList .folder-node[data-node-id='11'] > .folder-row .folder-action-button[aria-label='하위 폴더 추가']");
    await page.waitForTimeout(600);

    const afterChild = await page.evaluate(READ_TREE);

    check("[B] 폴더 행의 ＋로 하위 폴더가 만들어진다(depth 2)",
      afterChild.some(n => n.kind === "folder" && n.label === "Noir" && n.depth === 2),
      JSON.stringify(afterChild.map(n => `${n.depth}:${n.label}`)));

    const childCall = rpcCalls.filter(c => c.fn === "create_post_folder")[1];

    check("[B] 하위 폴더 요청은 p_parent_id를 실어 보낸다",
      childCall && Number(childCall.body.p_parent_id) === 11,
      JSON.stringify(childCall && childCall.body));

    /* 3) 이름 바꾸기 */
    await page.evaluate(() => { window.prompt = () => "홍차(수정)"; });
    await page.click("#postList .folder-node[data-node-id='11'] > .folder-row .folder-action-button[aria-label='폴더 이름 수정']");
    await page.waitForTimeout(600);

    const afterRename = await page.evaluate(READ_TREE);

    check("[B] 폴더 이름이 바뀌고 화면에 반영된다",
      afterRename.some(n => n.id === "11" && n.label === "홍차(수정)"),
      JSON.stringify(afterRename.map(n => n.label)));

    /* 4) 삭제 — 안의 글/폴더는 살아남아 그 자리로 올라온다 */
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click("#postList .folder-node[data-node-id='12'] > .folder-row .folder-action-button[aria-label='폴더 삭제']");
    await page.waitForTimeout(700);

    const afterDelete = await page.evaluate(READ_TREE);

    check("[B] 폴더를 지워도 안에 있던 글/폴더가 사라지지 않고 한 단계 올라온다",
      !afterDelete.some(n => n.kind === "folder" && n.id === "12") &&
      afterDelete.some(n => n.kind === "post" && n.id === "103" && n.depth === 2) &&
      afterDelete.some(n => n.kind === "folder" && n.id === "13" && n.depth === 2),
      JSON.stringify(afterDelete.map(n => `${n.kind}${n.id}@${n.depth}`)));

    const deleteCall = rpcCalls.find(c => c.fn === "delete_post_folder");

    check("[B] delete_post_folder 요청 계약(p_folder_id)",
      deleteCall && Number(deleteCall.body.p_folder_id) === 12,
      JSON.stringify(deleteCall && deleteCall.body));

    check("[B] CRUD 경로 콘솔 에러 없음", ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   C. 3단계 제한 / 놓을 수 없는 자리
========================================================== */

async function testGuard() {
  console.log("\n[C] 3단계 제한과 drop 금지 판정");

  await withPage({}, async (page, ctx) => {
    await gotoManage(page);

    const addButtons = await page.evaluate(() => {
      const read = id => {
        const btn = document.querySelector(
          `#postList .folder-node[data-node-id='${id}'] > .folder-row .folder-action-button[aria-label='하위 폴더 추가']`
        );
        return btn ? btn.disabled : null;
      };
      return { depth1: read(11), depth2: read(12), depth3: read(13) };
    });

    check("[C] depth 3 폴더에서는 하위 폴더 추가 버튼이 비활성이다",
      addButtons.depth1 === false && addButtons.depth2 === false && addButtons.depth3 === true,
      JSON.stringify(addButtons));

    /* onMove 판정을 실제 함수로 확인한다 — 데스크톱 네이티브 drag는
       Playwright 마우스로 일으킬 수 없으므로 판정 함수를 직접 부른다. */
    const verdicts = await page.evaluate(() => {
      const node = id => document.querySelector(`#postList .folder-node[data-node-id='${id}']`);
      const containerOf = id => id === null
        ? document.querySelector("#postList .folder-tree > .folder-tree-container")
        : node(id).querySelector(":scope > .folder-tree-container");

      return {
        selfDrop: canDropPostFolderNode({ dragged: node("11"), to: containerOf("11") }),
        descendantDrop: canDropPostFolderNode({ dragged: node("11"), to: containerOf("12") }),
        tooDeep: canDropPostFolderNode({ dragged: node("11"), to: containerOf("13") }),
        leafIntoDepth2: canDropPostFolderNode({ dragged: node("13"), to: containerOf("12") }),
        folderToRoot: canDropPostFolderNode({ dragged: node("12"), to: containerOf(null) }),
        postAnywhere: canDropPostFolderNode({ dragged: node("101"), to: containerOf("13") })
      };
    });

    check("[C] 자기 자신 안으로 놓을 수 없다",
      verdicts.selfDrop === false, JSON.stringify(verdicts));

    check("[C] 자기 자손 안으로 놓을 수 없다",
      verdicts.descendantDrop === false, JSON.stringify(verdicts));

    check("[C] 서브트리를 통째로 옮겨 4단계가 되는 자리에는 놓을 수 없다",
      verdicts.tooDeep === false, JSON.stringify(verdicts));

    check("[C] 결과가 3단계 이내면 놓을 수 있다",
      verdicts.leafIntoDepth2 === true && verdicts.folderToRoot === true,
      JSON.stringify(verdicts));

    check("[C] 글은 어느 깊이의 폴더에도 놓을 수 있다",
      verdicts.postAnywhere === true, JSON.stringify(verdicts));

    check("[C] 판정 경로 콘솔 에러 없음", ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   D. 실제 drag (터치)

   SortableJS는 터치에서 fallback 경로를 쓴다 — 모바일에서 실사용자가
   겪는 경로가 바로 이것이고, Playwright로 재현할 수 있는 유일한
   포인터 drag이기도 하다.
========================================================== */

/*
  실제 터치 입력을 넣는다.

  ★ 왜 JS로 TouchEvent를 만들어 dispatch하지 않는가
    SortableJS는 window.PointerEvent가 있으면 pointerdown/pointermove를
    듣는다. 손으로 만든 TouchEvent는 브라우저가 PointerEvent를 함께
    만들어 주지 않으므로 라이브러리가 아무 반응도 하지 않는다.
    CDP의 Input.dispatchTouchEvent는 브라우저 입력 파이프라인을 그대로
    타서 touch/pointer 이벤트가 모두 정상적으로 발생한다 — 실사용자의
    손가락과 같은 경로다.
*/

async function dragByTouch(cdp, page, fromSelector, toSelector, { steps = 14, offsetY = 0 } = {}) {
  const box = await page.locator(fromSelector).boundingBox();
  const target = await page.locator(toSelector).boundingBox();

  const sx = Math.round(box.x + box.width / 2);
  const sy = Math.round(box.y + box.height / 2);
  const tx = Math.round(target.x + target.width / 2);

  /*
    목적지 행의 한가운데까지만 가면 swapThreshold(0.65) + invertSwap
    때문에 자리바꿈 판정이 나지 않을 수 있다 — 목적지를 조금 넘겨서
    끌어야 실사용자가 하는 것과 같은 결과가 된다.
  */
  const ty = Math.round(target.y + target.height / 2 + offsetY);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: sx, y: sy, id: 1 }]
  });

  /* delay(180ms) + delayOnTouchOnly 를 넘겨야 drag가 시작된다 */
  await page.waitForTimeout(340);

  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: Math.round(sx + ((tx - sx) * i) / steps),
        y: Math.round(sy + ((ty - sy) * i) / steps),
        id: 1
      }]
    });
    await page.waitForTimeout(45);
  }

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });

  await page.waitForTimeout(800);
}

async function testDrag() {
  console.log("\n[D] 모바일 터치 drag");

  const rpcCalls = [];
  const db = makeDb();

  await withPage({
    db,
    rpcCalls,
    hasTouch: true,
    viewport: { width: 390, height: 844 }
  }, async (page, ctx) => {
    if (!ctx.cdp) {
      console.log("  SKIP  [D] 터치 drag는 chromium에서만 확인한다(CDP 터치 입력 필요)");
      return;
    }

    await gotoManage(page);

    const sortableReady = await page.evaluate(() => typeof window.Sortable !== "undefined");

    check("[D] 관리 화면에서 SortableJS가 실제로 로드된다(고정 버전 CDN)",
      sortableReady === true, String(sortableReady));

    const before = await page.evaluate(READ_TREE);

    /* root의 두 글 순서 바꾸기: 맨 위의 102를 101 아래로 끌어내린다 */
    await dragByTouch(
      ctx.cdp,
      page,
      "#postList .folder-node[data-node-id='102'] .tree-drag-handle",
      "#postList .folder-node[data-node-id='101'] .post-list-item",
      { offsetY: 20 }
    );

    const after = await page.evaluate(READ_TREE);
    const moveCall = rpcCalls.find(c => c.fn === "move_tree_node");

    check("[D] 터치로 글 순서를 바꾸면 화면 순서가 실제로 바뀐다",
      before[0].id === "102" && before[1].id === "101" &&
      after[0].id === "101" && after[1].id === "102",
      `before=${before.map(n => n.id).join(",")} after=${after.map(n => n.id).join(",")}`);

    check("[D] move_tree_node 요청 계약 — 좌표가 아니라 이웃으로 보낸다",
      moveCall &&
      moveCall.body.p_node_type === "post" &&
      Number(moveCall.body.p_node_id) === 102 &&
      moveCall.body.p_target_folder_id === null &&
      moveCall.body.p_prev_type === "post" &&
      Number(moveCall.body.p_prev_id) === 101 &&
      moveCall.body.p_next_type === "folder" &&
      Number(moveCall.body.p_next_id) === 11 &&
      !("p_sort_order" in moveCall.body),
      JSON.stringify(moveCall && moveCall.body));

    check("[D] 화면을 다시 그려도 바뀐 순서가 유지된다(로컬 상태가 서버와 맞춰짐)",
      await page.evaluate(() => {
        renderPostFolderTree();
        const first = document.querySelector("#postList .folder-tree > .folder-tree-container > .folder-node");
        return first.dataset.nodeId === "101";
      }),
      "");

    /* 폴더도 같은 방식으로 끌 수 있다 — 홍차(11)를 맨 위로 */
    await dragByTouch(
      ctx.cdp,
      page,
      "#postList .folder-node[data-node-id='11'] > .folder-row > .tree-drag-handle",
      "#postList .folder-node[data-node-id='101'] .post-list-item",
      { offsetY: -22 }
    );

    const afterFolder = await page.evaluate(READ_TREE);
    const folderMove = rpcCalls.filter(c => c.fn === "move_tree_node")[1];

    check("[D] 폴더도 터치로 순서를 바꿀 수 있다",
      afterFolder[0].kind === "folder" && afterFolder[0].id === "11",
      afterFolder.map(n => `${n.kind}${n.id}`).join(","));

    check("[D] 폴더 이동도 이웃 기반으로 보낸다(p_node_type=folder)",
      folderMove &&
      folderMove.body.p_node_type === "folder" &&
      Number(folderMove.body.p_node_id) === 11 &&
      folderMove.body.p_target_folder_id === null,
      JSON.stringify(folderMove && folderMove.body));

    /* 폴더가 옮겨지면 하위 구조가 딸려오고, 깊이 표시가 다시 계산돼야
       한다 — 낡은 채로 두면 다음 drop 판정이 틀린다. */
    const depths = await page.evaluate(() => {
      const read = id => {
        const node = document.querySelector(`#postList .folder-node[data-node-id='${id}']`);
        const child = node.querySelector(":scope > .folder-tree-container");
        return {
          subtreeHeight: node.dataset.subtreeHeight,
          containerDepth: child ? child.dataset.containerDepth : null
        };
      };
      return { f11: read("11"), f12: read("12"), f13: read("13") };
    });

    check("[D] 폴더 이동 후 컨테이너 깊이/서브트리 높이가 다시 계산된다",
      depths.f11.containerDepth === "1" &&
      depths.f12.containerDepth === "2" &&
      depths.f13.containerDepth === "3" &&
      depths.f11.subtreeHeight === "2",
      JSON.stringify(depths));

    check("[D] 하위 항목이 폴더를 따라 함께 옮겨진다",
      afterFolder[1].kind === "folder" && afterFolder[1].id === "12" &&
      afterFolder.find(n => n.id === "103").depth === 3,
      afterFolder.map(n => `${n.kind}${n.id}@${n.depth}`).join(","));

    check("[D] 터치 drag 경로 콘솔 에러 없음", ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   E. 저장 실패 → 화면 되돌리기
========================================================== */

async function testRollback() {
  console.log("\n[E] 저장 실패 시 롤백");

  const rpcCalls = [];
  const db = makeDb();

  await withPage({
    db,
    rpcCalls,
    failRpc: "move_tree_node",
    hasTouch: true,
    viewport: { width: 390, height: 844 }
  }, async (page, ctx) => {
    if (!ctx.cdp) {
      console.log("  SKIP  [E] 롤백은 터치 drag가 필요하므로 chromium에서만 확인한다");
      return;
    }

    await gotoManage(page);

    const before = await page.evaluate(READ_TREE);

    await dragByTouch(
      ctx.cdp,
      page,
      "#postList .folder-node[data-node-id='102'] .tree-drag-handle",
      "#postList .folder-node[data-node-id='101'] .post-list-item",
      { offsetY: 20 }
    );

    const after = await page.evaluate(READ_TREE);

    check("[E] 저장이 실패하면 화면이 원래 순서로 되돌아간다",
      JSON.stringify(before.map(n => n.id)) === JSON.stringify(after.map(n => n.id)),
      `before=${before.map(n => n.id).join(",")} after=${after.map(n => n.id).join(",")}`);

    const message = await page.evaluate(() => {
      const el = document.querySelector("#postList .folder-tree-message");
      return { text: el ? el.textContent : null, hidden: el ? el.hidden : null };
    });

    check("[E] 사용자에게 짧은 오류 문구가 보인다",
      message.hidden === false && /저장하지 못했습니다/.test(message.text || ""),
      JSON.stringify(message));

    check("[E] 실패한 이동은 서버 상태를 바꾸지 않는다",
      db.posts.find(p => p.id === 101).sort_order === 200 &&
      db.posts.find(p => p.id === 102).sort_order === 100,
      JSON.stringify(db.posts.map(p => `${p.id}:${p.sort_order}`)));

    check("[E] 롤백 경로 콘솔 에러 없음", ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   실행
========================================================== */

(async () => {
  console.log(`\n=== FOLDER-1 관리 트리 E2E (${BROWSER}) ===`);

  playwright = await loadPlaywright(BROWSER);
  SORTABLE_SOURCE = await loadSortableSource();
  const server = await startServer();

  try {
    if (shouldRun("render")) await testRender();
    if (shouldRun("crud")) await testCrud();
    if (shouldRun("guard")) await testGuard();
    if (shouldRun("drag")) await testDrag();
    if (shouldRun("rollback")) await testRollback();
  } finally {
    server.close();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
