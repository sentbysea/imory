/* =========================================================
   Folder-aware Skin Rendering — 공개 화면 + Studio Preview E2E

   FOLDER-1이 category.tree(폴더 계층)와 중첩 repeat을 넣은 뒤,
   실제 스킨이 그 구조를 화면에 그리는지 세 가지를 확인한다:

   1. published — folder-aware 스킨(skin/test-skins/
      imory-finder-folders-v1.json)이 공개 CATEGORY 화면에서
      "폴더 = 큰 폴더 카드 / 글 = 카드 안의 작은 항목"으로 그려진다.
      소유자와 방문자(private 글만 든 폴더는 잘림), 데스크톱과
      모바일(가로 넘침 없음), 카드 안의 글 링크 → POST 이동,
      폴더가 없는 카테고리, 빈 카테고리.
   2. preview — 같은 JSON을 Studio Preview(studio-lifecycle-scenario
      ?scenario=t)에 working draft로 실어 CATEGORY로 이동하면, 같은
      데이터에서 published와 **같은 폴더 구조 signature**가 나온다.
   3. regression — category.posts만 쓰는 기존 스킨 5종(diary v0.1,
      quiet-frame v2/v3/v4, quiet-frame-v1 repro)은 DB에 폴더가
      있든 없든 CATEGORY 렌더 결과(innerHTML)가 한 글자도 다르지
      않고, 목록 순서는 created_at DESC 그대로다.

   skin/skin-write-manage-e2e-test.mjs와 같은 규약이다(정적 서버 +
   Supabase 네트워크만 mock + 저장소의 실제 파일). mock에는 RLS가
   없으므로 방문자에게는 private 글 행을 mock 단계에서 빼서 실제
   RLS 결과를 흉내 낸다 — 그 외 어떤 필터도 흉내 내지 않는다.

   ★ 실행 방법
     node skin/skin-folder-tree-e2e-test.mjs
     node skin/skin-folder-tree-e2e-test.mjs --browser=webkit
     node skin/skin-folder-tree-e2e-test.mjs --only=preview

   --only= 뒤에 쓸 수 있는 이름: published / preview / regression / profile
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8942;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

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

const FOLDER_SKIN = readSkin("imory-finder-folders-v1.json");

/* category.posts만 쓰는 기존 스킨 5종 — 폴더가 생겨도 한 글자도
   달라지면 안 된다. */
const LEGACY_SKINS = [
  ["imory-diary-v0.1", readSkin("imory-diary-v0.1.json")],
  ["imory-quiet-frame-v2", readSkin("imory-quiet-frame-v2.json")],
  ["imory-quiet-frame-v3", readSkin("imory-quiet-frame-v3.json")],
  ["imory-quiet-frame-v4", readSkin("imory-quiet-frame-v4.json")],
  ["quiet-frame-v1-mount-contract-repro", readSkin("quiet-frame-v1-mount-contract-repro.json")]
];


/* =========================================================
   DB fixture

   Studio scenario t(studio/studio-lifecycle-scenario.html)와 같은
   배치다 — 두 화면의 signature를 그대로 비교하기 위해서다.

     LOG(1)
       ├─ (글) 401 폴더 없는 글          sort 100
       ├─ 홍차(f1)                        sort 200
       │    ├─ Sentinel AU(f2)            sort 100
       │    │    ├─ 3단 폴더(f3)          sort 100
       │    │    │    └─ (글) 403 깊은 글  secret
       │    │    └─ (글) 402 첫 만남      sort 200
       │    └─ (글) 404 홍차 노트         sort 300
       ├─ 빈 폴더(f4)                     sort 300  ← 글이 없어 잘림
       ├─ 2002(f5)                        sort 400
       │    └─ (글) 405 영도
       ├─ 비공개 폴더(f6)                 sort 450  ← private 글뿐 → 방문자에게 잘림
       │    └─ (글) 407 숨은 글           private
       └─ (글) 406 맨 아래 글             sort 500
     NOTE(2) — 폴더 없음: (글) 408 노트 하나
     EMPTY(3) — 글 없음
========================================================== */

function makeDb({ withFolders = true } = {}) {
  const folders = withFolders ? [
    { id: 1, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "홍차", depth: 1, sort_order: 200 },
    { id: 2, user_id: OWNER_ID, category_id: 1, parent_id: 1, name: "Sentinel AU", depth: 2, sort_order: 100 },
    { id: 3, user_id: OWNER_ID, category_id: 1, parent_id: 2, name: "3단 폴더", depth: 3, sort_order: 100 },
    { id: 4, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "빈 폴더", depth: 1, sort_order: 300 },
    { id: 5, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "2002", depth: 1, sort_order: 400 },
    { id: 6, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "비공개 폴더", depth: 1, sort_order: 450 }
  ] : [];

  const f = (id) => (withFolders ? id : null);

  const post = (id, title, created, visibility, folderId, sortOrder, categoryId = 1) => ({
    id, user_id: OWNER_ID, category_id: categoryId, title, content_type: "text",
    visibility, created_at: created, quote_preset_id: null,
    folder_id: f(folderId), sort_order: sortOrder
  });

  const posts = [
    post(401, "폴더 없는 글", "2026-01-05T02:00:00Z", "public", null, 100),
    post(402, "첫 만남", "2026-01-01T02:00:00Z", "public", 2, 200),
    post(403, "깊은 글", "2026-01-02T02:00:00Z", "secret", 3, 100),
    post(404, "홍차 노트", "2026-01-03T02:00:00Z", "public", 1, 300),
    post(405, "영도", "2026-01-04T02:00:00Z", "public", 5, 100),
    post(406, "맨 아래 글", "2025-12-31T02:00:00Z", "public", null, 500),
    post(407, "숨은 글", "2025-12-30T02:00:00Z", "private", 6, 100),
    post(408, "노트 하나", "2026-01-06T02:00:00Z", "public", null, 100, 2)
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
      { id: 2, user_id: OWNER_ID, name: "NOTE", type: "post", sort_order: 2 },
      { id: 3, user_id: OWNER_ID, name: "EMPTY", type: "post", sort_order: 3 }
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

async function installSupabaseMock(page, opts = {}) {
  const {
    skin = FOLDER_SKIN,
    db = makeDb(),
    signedInAs = null,
    imageSlotValues = {}
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
      const body = fn === "get_published_skin"
        ? { skin, schemaVersion: skin.schemaVersion, imageSlotValues }
        : null;
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify(body)
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      let rows = queryTable(db, table, url.searchParams);

      /* 실제 RLS 흉내: 비소유자에게는 private 글의 행 자체가 오지 않는다.
         (2026-09-08 프로덕션 실측, IMORY_FOLDER1_DESIGN.md §2-1) */
      if (table === "posts" && signedInAs !== OWNER_ID) {
        rows = rows.filter(r => r.visibility !== "private");
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
  /* 다른 e2e와 같이 pageerror만 센다 — console error에는 여기서 일부러
     끊는 폰트/CDN 요청(net::ERR_FAILED)과 진입 문서의 import map 안내가
     섞여 들어온다. */
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


/* =========================================================
   폴더 구조 signature — published 화면과 Preview iframe 양쪽에서
   같은 함수로 읽는다. 스킨의 분기 규칙(각 노드에서 보이는 가지는
   하나)까지 같이 검사해서, hidden 가지가 새면 { bad } 로 드러난다.
   href의 slug 부분은 떼어 낸다(published는 /testuser/, Preview는
   /scenario-t/).
========================================================== */

const SIG_FN = `function (root) {
  if (!root) return null;
  const visible = (el) => Boolean(el) && !el.hidden;
  const entry = (a) => ({
    post: a.querySelector(".finder-entry-title").textContent,
    href: (a.getAttribute("href") || "").replace(/^\\/[^/]+\\//, "/"),
    locked: visible(a.querySelector(".finder-lock"))
  });
  const listOf = (container) =>
    Array.from(container.querySelectorAll(":scope > .finder-folder-list > .finder-folder-entry")).map((li) => {
      const shown = Array.from(li.children).filter(visible);
      if (shown.length !== 1) return { bad: shown.length };
      const el = shown[0];
      if (el.classList.contains("finder-subfolder")) {
        return { folder: el.querySelector(":scope > .finder-subfolder-name").textContent, children: listOf(el) };
      }
      return entry(el);
    });
  return Array.from(root.querySelectorAll(".finder-tree > .finder-node")).map((node) => {
    const shown = Array.from(node.children).filter(visible);
    if (shown.length !== 1) return { bad: shown.length };
    const el = shown[0];
    if (el.classList.contains("finder-folder-card")) {
      return { folder: el.querySelector(".finder-folder-name").textContent, children: listOf(el) };
    }
    return entry(el);
  });
}`;

const post = (title, id, locked = false) => ({ post: title, href: `/post/${id}`, locked });

const EXPECTED_OWNER = [
  post("폴더 없는 글", 401),
  {
    folder: "홍차",
    children: [
      {
        folder: "Sentinel AU",
        children: [
          { folder: "3단 폴더", children: [post("🔒 깊은 글", 403, true)] },
          post("첫 만남", 402)
        ]
      },
      post("홍차 노트", 404)
    ]
  },
  { folder: "2002", children: [post("영도", 405)] },
  { folder: "비공개 폴더", children: [post("🙈 숨은 글", 407)] },
  post("맨 아래 글", 406)
];

const EXPECTED_VISITOR = EXPECTED_OWNER.filter(n => n.folder !== "비공개 폴더");

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const readPublishedSig = (page) =>
  page.evaluate(`(${SIG_FN})(document.querySelector("#postList .imory-skin-root"))`);

const readPreviewSig = (page) =>
  page.evaluate(`(${SIG_FN})(document.getElementById("studioPreviewFrame").contentDocument.querySelector(".imory-skin-root"))`);

const READ_LAYOUT = `(() => {
  const root = document.querySelector("#postList .imory-skin-root");
  const tree = root && root.querySelector(".finder-tree");
  const cards = root ? Array.from(root.querySelectorAll(".finder-folder-card")).filter(el => !el.hidden) : [];
  const rootEntries = root ? Array.from(root.querySelectorAll(".finder-root-entry")).filter(el => !el.hidden) : [];
  const entries = root ? Array.from(root.querySelectorAll(".finder-entry")).filter(el => !el.hidden) : [];
  const legacyFolderCards = root ? root.querySelectorAll(".finder-post-card").length : -1;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  return {
    hasTree: Boolean(tree),
    treeEmpty: tree ? tree.childElementCount === 0 : null,
    emptyNote: tree ? getComputedStyle(tree, "::after").content : null,
    cardCount: cards.length,
    rootEntryCount: rootEntries.length,
    entryCount: entries.length,
    legacyFolderCards,
    cardRects: cards.map(rect),
    entryRects: entries.slice(0, 3).map(rect),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    text: root ? root.textContent : "",
    url: location.pathname + location.search
  };
})()`;


/* ---------------------------------------------------------
   1) published — folder-aware 스킨의 공개 CATEGORY 화면
--------------------------------------------------------- */

async function testPublished(vpName) {
  const viewport = VIEWPORTS[vpName];
  console.log(`\n[published · ${vpName}]`);

  /* 소유자 — 모든 폴더가 보인다 */
  await withPage(viewport, { signedInAs: OWNER_ID }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root .finder-tree", { timeout: 15000 });
    await page.waitForTimeout(250);

    const sig = await readPublishedSig(page);
    check("소유자: 폴더 카드/자식 글 구조가 category.tree와 같다(비공개 폴더 포함)",
      same(sig, EXPECTED_OWNER), JSON.stringify(sig));

    const layout = await page.evaluate(READ_LAYOUT);
    check("소유자: 1단계 폴더 3개만 큰 폴더 카드, 글은 카드 안 항목 또는 root 항목",
      layout.cardCount === 3 && layout.rootEntryCount === 2 && layout.entryCount === 7 && layout.legacyFolderCards === 0,
      `cards=${layout.cardCount} rootEntries=${layout.rootEntryCount} entries=${layout.entryCount} legacyCards=${layout.legacyFolderCards}`);
    /* 글 하나짜리 폴더 카드도 머리(폴더 이름 띠) + 항목 한 줄이라
       항목 하나보다 확실히 크다 — 글마다 카드가 되는 v4 방식과 구별된다. */
    check("소유자: 폴더 카드가 글 항목보다 확실히 크다(카드 높이 > 항목 높이 × 1.5)",
      layout.cardRects.every(c => c.h > 0) && layout.entryRects.every(e => e.h > 0) &&
      Math.min(...layout.cardRects.map(c => c.h)) > Math.max(...layout.entryRects.map(e => e.h)) * 1.5,
      `cards=${JSON.stringify(layout.cardRects)} entries=${JSON.stringify(layout.entryRects)}`);
    check("소유자: 글이 없는 '빈 폴더'는 화면에 없다",
      !layout.text.includes("빈 폴더"));
    check("페이지 가로 넘침 없음",
      layout.scrollWidth <= layout.innerWidth + 1, `scrollWidth=${layout.scrollWidth} innerWidth=${layout.innerWidth}`);
    check("소유자: 스킨 EDIT 진입점(?manage=1)이 그려진다",
      await page.evaluate(() => {
        const a = document.querySelector('#postList .imory-skin-root .finder-actions a');
        return Boolean(a) && !a.hidden && /manage=1$/.test(a.getAttribute("href") || "");
      }));

    /* 카드 안의 글 링크 → POST 화면. 주소는 전환이 끝난 뒤 pushState되므로
       화면과 주소를 각각 기다린다(skin-write-manage e2e와 같은 방식). */
    await page.evaluate(() => {
      document.querySelector('#postList .imory-skin-root a.finder-entry[href$="/post/404"]').click();
    });
    await page.waitForSelector("#postSkinContainer .imory-skin-root .finder-article", { timeout: 15000 });
    await page.waitForFunction(
      (expected) => location.pathname === expected,
      `/${SLUG}/post/404`,
      { timeout: 10000 }
    ).catch(() => {});
    const postState = await page.evaluate(() => ({
      url: location.pathname,
      title: (document.querySelector("#postSkinContainer .finder-article-head h1") || {}).textContent
    }));
    check("카드 안의 글 링크를 누르면 POST 화면으로 간다(같은 SPA 라우터)",
      postState.url === `/${SLUG}/post/404` && postState.title === "홍차 노트", JSON.stringify(postState));

    await page.goBack();
    await page.waitForSelector("#postList .imory-skin-root .finder-tree", { timeout: 15000 });
    await page.waitForTimeout(250);
    const backSig = await readPublishedSig(page);
    check("뒤로가기로 돌아오면 같은 폴더 구조가 다시 그려진다", same(backSig, EXPECTED_OWNER));

    check("소유자 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });

  /* 방문자 — private 글만 든 폴더는 잘린다 */
  await withPage(viewport, {}, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root .finder-tree", { timeout: 15000 });
    await page.waitForTimeout(250);

    const sig = await readPublishedSig(page);
    check("방문자: private 글만 든 '비공개 폴더'가 잘리고 나머지는 같다",
      same(sig, EXPECTED_VISITOR), JSON.stringify(sig));

    const layout = await page.evaluate(READ_LAYOUT);
    check("방문자: 폴더 카드 2개 · root 항목 2개 · 글 6개",
      layout.cardCount === 2 && layout.rootEntryCount === 2 && layout.entryCount === 6,
      `cards=${layout.cardCount} rootEntries=${layout.rootEntryCount} entries=${layout.entryCount}`);
    check("방문자: EDIT 진입점이 없다",
      await page.evaluate(() => {
        const a = document.querySelector('#postList .imory-skin-root .finder-actions a');
        return !a || a.hidden;
      }));

    /* 폴더가 없는 카테고리 — 같은 템플릿이 root 글만 그린다 */
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root .finder-tree", { timeout: 15000 });
    await page.waitForTimeout(250);
    const flatSig = await readPublishedSig(page);
    const flatLayout = await page.evaluate(READ_LAYOUT);
    check("폴더가 없는 카테고리(hasFolders=false): 폴더 카드 없이 root 글만",
      same(flatSig, [post("노트 하나", 408)]) && flatLayout.cardCount === 0 && flatLayout.rootEntryCount === 1,
      JSON.stringify(flatSig));

    /* 글이 없는 카테고리 — :empty 안내 */
    await page.goto(`${BASE}/${SLUG}/category/3`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root .finder-tree", { timeout: 15000 });
    await page.waitForTimeout(250);
    const emptyLayout = await page.evaluate(READ_LAYOUT);
    check("글이 없는 카테고리: 트리가 비고 스킨의 빈 상태 문구가 나온다",
      emptyLayout.treeEmpty === true && /비어/.test(emptyLayout.emptyNote || ""),
      `empty=${emptyLayout.treeEmpty} note=${emptyLayout.emptyNote}`);

    check("방문자 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   2) preview — Studio Preview에서 같은 구조
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

async function testPreview() {
  console.log("\n[preview · Studio scenario t]");

  await withPage(VIEWPORTS["desktop-1280"], {
    noSupabaseMock: true,
    initScript: {
      fn: (pkg) => { window.__scenarioFolderSkinPackage = pkg; },
      arg: FOLDER_SKIN
    }
  }, async (page, { errors }) => {
    await page.goto(SCENARIO_URL, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
      null,
      { timeout: 15000 }
    );
    await previewHas(page, ".finder-page");

    const loaded = await page.evaluate(() => {
      const pkg = window.getStudioAiWorkingState().workingSkin || null;
      return pkg && pkg.metadata ? pkg.metadata.title : null;
    }).catch(() => null);
    check("Studio가 imory-finder-folders-v1을 working draft로 올렸다",
      loaded === FOLDER_SKIN.metadata.title || loaded === null, `title=${loaded}`);

    await previewGoto(page, "/scenario-t/category/301", "category");
    await previewHas(page, ".finder-tree");
    await page.waitForTimeout(250);

    const sig = await readPreviewSig(page);
    check("Preview CATEGORY: published 소유자 화면과 같은 폴더 구조 signature",
      same(sig, EXPECTED_OWNER), JSON.stringify(sig));

    const layout = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const root = doc.querySelector(".imory-skin-root");
      const vis = (sel) => Array.from(root.querySelectorAll(sel)).filter(el => !el.hidden);
      const cards = vis(".finder-folder-card");
      const entries = vis(".finder-entry");
      const rect = (el) => Math.round(el.getBoundingClientRect().height);
      return {
        cards: cards.length,
        rootEntries: vis(".finder-root-entry").length,
        entries: entries.length,
        minCardH: Math.min(...cards.map(rect)),
        maxEntryH: Math.max(...entries.map(rect)),
        scrollWidth: doc.documentElement.scrollWidth,
        innerWidth: doc.defaultView.innerWidth,
        location: window.getCurrentPreviewLocation()
      };
    });
    check("Preview: 폴더 카드 3개 · root 항목 2개 · 글 7개, 카드가 항목보다 크다",
      layout.cards === 3 && layout.rootEntries === 2 && layout.entries === 7 && layout.minCardH > layout.maxEntryH * 2,
      JSON.stringify(layout));
    check("Preview: iframe 안에서도 가로 넘침 없음",
      layout.scrollWidth <= layout.innerWidth + 1, `scrollWidth=${layout.scrollWidth} innerWidth=${layout.innerWidth}`);

    await previewGoto(page, "/scenario-t/category/302", "category");
    await page.waitForFunction(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const h1 = doc && doc.querySelector(".finder-content-head h1");
      return Boolean(h1) && h1.textContent === "NOTE";
    }, null, { timeout: 10000 });
    await page.waitForTimeout(250);
    const flatSig = await readPreviewSig(page);
    check("Preview: 폴더 없는 카테고리(302)는 root 글만",
      same(flatSig, [post("노트 하나", 408)]), JSON.stringify(flatSig));

    /* Settings 연결 라운드 — Preview도 공개 화면과 같은
       buildSkinContext를 쓰므로 같은 값이 나와야 한다. scenario t의
       site_settings에는 blog_title/avatar_url이 있고 스킨 이미지
       슬롯 값은 비어 있다(skin_image_slot_values: []). */
    const previewProfile = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const root = doc.querySelector(".imory-skin-root");
      const avatar = root.querySelector(".finder-avatar");
      return {
        avatarSrc: avatar ? avatar.getAttribute("src") : "(no-avatar-el)",
        nickname: (root.querySelector(".finder-name") || {}).textContent || null,
        brand: (root.querySelector(".finder-brand") || {}).textContent || null
      };
    });

    check("Preview: Settings의 avatar_url이 profile.avatarUrl로 들어온다(슬롯 값 없음)",
      previewProfile.avatarSrc === "https://cdn.example.com/settings-avatar.png",
      JSON.stringify(previewProfile));
    check("Preview: Settings의 blog_title이 site.title이고 nickname도 그대로다",
      previewProfile.brand === "SCENARIO T BLOG" && previewProfile.nickname === "Scenario T",
      JSON.stringify(previewProfile));

    check("Preview 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   3) regression — category.posts 스킨 5종은 폴더에 영향받지 않는다
--------------------------------------------------------- */

const READ_LEGACY = `(() => {
  const root = document.querySelector("#postList .imory-skin-root");
  if (!root) return null;
  const seen = new Set();
  const ids = [];
  root.querySelectorAll('a[href*="/post/"]').forEach(a => {
    const m = /\\/post\\/(\\d+)/.exec(a.getAttribute("href") || "");
    if (m && !seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  });
  return { html: root.innerHTML, ids, text: root.textContent };
})()`;

/* 방문자에게 보이는 LOG(1)의 글 — created_at DESC */
const LEGACY_EXPECTED_IDS = ["401", "405", "404", "403", "402", "406"];

async function renderLegacy(skin, db) {
  return withPage(VIEWPORTS["desktop-1280"], { skin, db }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(300);
    const state = await page.evaluate(READ_LEGACY);
    return { ...state, errors };
  });
}

async function testRegression() {
  console.log("\n[regression · category.posts 스킨 5종]");

  for (const [name, skin] of LEGACY_SKINS) {
    const withFolders = await renderLegacy(skin, makeDb({ withFolders: true }));
    const without = await renderLegacy(skin, makeDb({ withFolders: false }));

    check(`${name}: DB에 폴더가 있어도 CATEGORY 렌더 결과(innerHTML)가 동일`,
      Boolean(withFolders && without) && withFolders.html === without.html,
      withFolders && without ? `len ${withFolders.html.length} vs ${without.html.length}` : "render failed");
    check(`${name}: 목록 순서가 created_at DESC 그대로(폴더 순서 무시)`,
      Boolean(withFolders) && same(withFolders.ids, LEGACY_EXPECTED_IDS),
      withFolders ? withFolders.ids.join(",") : "");
    check(`${name}: 폴더 이름이 화면에 새지 않는다`,
      Boolean(withFolders) && !/Sentinel AU|빈 폴더|비공개 폴더|3단 폴더/.test(withFolders.text));
    check(`${name}: 페이지 오류 없음`,
      withFolders.errors.length === 0 && without.errors.length === 0,
      [...withFolders.errors, ...without.errors].join(" | "));
  }
}


/* =========================================================
   4. profile — Settings 값이 공개 스킨에 runtime binding으로
      연결된다 (Settings 연결 라운드)

   확인하는 것:
     profiles.nickname        -> profile.nickname
     site_settings.blog_title -> site.title
     site_settings.avatar_url -> profile.avatarUrl + images.profile 기본값

   avatar 우선순위: 스킨 슬롯 값 > Settings avatar_url > null.
   imory-finder-folders-v1은 사이드바에 data-imory-src=
   "profile.avatarUrl", HOME 본문에 data-imory-src="images.profile"을
   둘 다 갖고 있어서 두 경로를 한 화면에서 같이 잴 수 있다.
========================================================== */

const SETTINGS_AVATAR = "https://cdn.example.com/settings-avatar.png";
const SLOT_AVATAR = "https://cdn.example.com/slot-avatar.png";

function dbWithSettings(extra) {
  const db = makeDb();
  db.site_settings = [
    { user_id: OWNER_ID, key: "blog_title", value: "IMORY E2E" },
    { user_id: OWNER_ID, key: "favicon_url", value: "" },
    ...extra
  ];
  return db;
}

const READ_PROFILE = `() => {
  const root = document.querySelector("#postList .imory-skin-root")
    || document.querySelector(".imory-skin-root");
  if (!root) return null;
  const avatar = root.querySelector(".finder-avatar");
  const feature = root.querySelector(".finder-home-image");
  return {
    avatarSrc: avatar ? avatar.getAttribute("src") : "(no-avatar-el)",
    featureSrc: feature ? feature.getAttribute("src") : null,
    nickname: (root.querySelector(".finder-name") || {}).textContent || null,
    brand: (root.querySelector(".finder-brand") || {}).textContent || null
  };
}`;

async function readProfileOn(page, urlPath, waitFor) {
  await page.goto(`${BASE}${urlPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(waitFor, { timeout: 15000 });
  await page.waitForTimeout(200);
  return page.evaluate(eval(`(${READ_PROFILE})`));
}

async function testProfile() {
  console.log("\n[profile · Settings → Skin]");

  const viewport = VIEWPORTS["desktop-1280"];

  /* --- 1. 슬롯 값이 없으면 Settings의 avatar_url이 쓰인다 --- */

  await withPage(
    viewport,
    { db: dbWithSettings([{ user_id: OWNER_ID, key: "avatar_url", value: SETTINGS_AVATAR }]) },
    async (page, { errors }) => {

      const home = await readProfileOn(page, `/${SLUG}/`, ".imory-skin-root .finder-avatar");

      check("HOME: profile.avatarUrl이 Settings의 avatar_url이다",
        home.avatarSrc === SETTINGS_AVATAR, JSON.stringify(home));
      check("HOME: images.profile 기본값도 같은 Settings 값이다",
        home.featureSrc === SETTINGS_AVATAR, JSON.stringify(home));
      check("HOME: profiles.nickname이 그대로 그려진다",
        home.nickname === "테스트 사용자", JSON.stringify(home));
      check("HOME: site.title이 site_settings.blog_title이다",
        home.brand === "IMORY E2E", JSON.stringify(home));

      const category = await readProfileOn(
        page, `/${SLUG}/category/1`, "#postList .imory-skin-root .finder-avatar"
      );

      check("CATEGORY: 같은 Settings 값이 쓰인다(같은 buildBaseSkinContext)",
        category.avatarSrc === SETTINGS_AVATAR && category.brand === "IMORY E2E",
        JSON.stringify(category));

      check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
    }
  );

  /* --- 2. 스킨 이미지 슬롯을 따로 지정하면 그쪽이 이긴다 --- */

  await withPage(
    viewport,
    {
      db: dbWithSettings([{ user_id: OWNER_ID, key: "avatar_url", value: SETTINGS_AVATAR }]),
      imageSlotValues: { profile: SLOT_AVATAR }
    },
    async (page, { errors }) => {

      const home = await readProfileOn(page, `/${SLUG}/`, ".imory-skin-root .finder-avatar");

      check("슬롯 값이 있으면 Settings 값을 덮는다(profile.avatarUrl)",
        home.avatarSrc === SLOT_AVATAR, JSON.stringify(home));
      check("슬롯 값이 있으면 Settings 값을 덮는다(images.profile)",
        home.featureSrc === SLOT_AVATAR, JSON.stringify(home));

      check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
    }
  );

  /* --- 3. 둘 다 없으면 null → src 속성 자체가 없다 --- */

  await withPage(
    viewport,
    { db: dbWithSettings([]) },
    async (page, { errors }) => {

      const home = await readProfileOn(page, `/${SLUG}/`, ".imory-skin-root .finder-avatar");

      check("Settings도 슬롯도 없으면 src가 붙지 않는다(null)",
        home.avatarSrc === null && home.featureSrc === null, JSON.stringify(home));

      check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
    }
  );

  /* --- 4. 예전에 직접 입력해 둔 http:// 값은 걸러진다 --- */

  await withPage(
    viewport,
    { db: dbWithSettings([{ user_id: OWNER_ID, key: "avatar_url", value: "http://insecure.example.com/a.png" }]) },
    async (page, { errors }) => {

      const home = await readProfileOn(page, `/${SLUG}/`, ".imory-skin-root .finder-avatar");

      check("https가 아닌 avatar_url은 isSafeSkinUrl에서 걸러져 null이 된다",
        home.avatarSrc === null && home.featureSrc === null, JSON.stringify(home));

      check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
    }
  );

}


/* ---------------------------------------------------------
   main
--------------------------------------------------------- */

(async () => {
  console.log(`\n=== Folder-aware Skin Rendering E2E (${BROWSER}) ===`);

  playwright = await loadPlaywright(BROWSER);
  const server = await startServer();

  try {
    if (shouldRun("published")) {
      for (const vpName of Object.keys(VIEWPORTS)) await testPublished(vpName);
    }
    if (shouldRun("preview")) await testPreview();
    if (shouldRun("regression")) await testRegression();
    if (shouldRun("profile")) await testProfile();
  } finally {
    server.close();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
