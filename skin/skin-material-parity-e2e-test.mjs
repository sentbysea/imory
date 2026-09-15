/* =========================================================
   Skin / Studio / Public 재료 일치 — E2E

   같은 SkinPackage + 같은 행을 공개 화면과 Studio Preview 양쪽에
   주고 두 화면이 **같은 재료로 같은 그림**을 그리는지 본다. 이
   라운드가 고친 다섯 가지가 그대로 절(section)이 된다:

   1. sidebar  — 사용자가 이름 붙인 HIGHLIGHT 카테고리(MEMOS)를
      포함한 메뉴 항목·이름·href 가 공개 화면과 Studio HOME 에서
      한 글자도 다르지 않다.
   2. icons    — 메뉴 아이콘이 순서가 아니라 **종류**(item.iconKind ->
      data-kind)로 정해진다. 카테고리 순서를 뒤집어도 각 이름에
      붙은 종류가 그대로다.
   3. roots    — 폴더 3개 + 루트 글 "Prompt" 카테고리에서 페이지네이션을
      켜든 끄든 루트 글이 **정확히 한 번** 나온다. category.posts 를
      그리지 않는 스킨에서는 플랫폼이 페이지 나누기를 켜지 않아
      루트 글이 사라지지 않는다.
   4. highlights — 하이라이트 화면이 실제 카드로 그려지고, 카드
      강조선이 그 하이라이트의 색이며, 원문 위치가 "TXT > 2002 > 1"
      이다. Studio 에서도 같은 화면으로 들어간다.
   4-2. homehighlight — HOME 의 하이라이트 자리가 "보기" 버튼이 아니라
      **실제 발췌 카드 한 장**으로 그려지고(home.highlights.featured),
      그 카드가 하이라이트 화면의 카드와 같은 재료다. 하이라이트가
      하나도 없으면 공개는 자리를 접고 Studio 는 샘플을 보여준다.
   5. legacy   — templates.memos / navigation.memos / memo-tools 만
      쓰는 옛 스킨이 그대로 렌더된다.

   그리고 두 화면 모두 390px 에서 가로 넘침이 없다.

   규약은 skin/skin-folder-tree-e2e-test.mjs 와 같다 — 정적 서버 +
   Supabase 네트워크만 mock + 저장소의 실제 파일. Studio 쪽은
   studio/studio-lifecycle-scenario.html?scenario=k 에 **같은 JSON 과
   같은 행**을 addInitScript 로 실어 준다.

   ★ 실행 방법
     node skin/skin-material-parity-e2e-test.mjs
     node skin/skin-material-parity-e2e-test.mjs --browser=webkit
     node skin/skin-material-parity-e2e-test.mjs --only=roots

   --only= 뒤에 쓸 수 있는 이름(쉼표로 여러 개 가능):
     sidebar / icons / roots / highlights / homehighlight / legacy / audit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8956;
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

const ONLY_NAMES = ONLY ? ONLY.split(",").map(n => n.trim()).filter(Boolean) : [];
const shouldRun = (name) => ONLY_NAMES.length === 0 || ONLY_NAMES.includes(name);


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

const PARITY_SKIN = readSkin("imory-material-parity-v1.json");
const LEGACY_MEMOS_SKIN = readSkin("imory-material-parity-legacy-memos.json");

/*
  같은 스킨에서 **루트 글 목록만** 뺀 변형. 폴더 트리만 그리는 스킨이
  실제로 어떻게 되는지를 보기 위한 것이다 — 플랫폼은 이런 스킨에서는
  페이지 나누기를 켜지 않아야 하고(그러면 트리에 루트 글이 남는다),
  그래서 "Prompt"가 사라지지 않아야 한다.
*/
const TREE_ONLY_SKIN = (() => {
  const clone = JSON.parse(JSON.stringify(PARITY_SKIN));
  const before = clone.templates.category.html;
  const after = before.replace(
    /<ul class="mp-posts"[\s\S]*?<\/ul><\/div>/,
    "</div>"
  );
  if (after === before) {
    throw new Error("TREE_ONLY_SKIN: category.posts 블록을 찾지 못했습니다 — 픽스처와 스킨이 어긋났습니다.");
  }
  clone.templates.category.html = after;
  clone.metadata = { ...clone.metadata, title: "Material Parity — tree only" };
  return clone;
})();


/* =========================================================
   DB fixture — 공개 화면과 Studio scenario k가 같은 값을 쓴다.

     TXT(1, post)      ─ 2002(f1) ─ (글) "1"
                       ─ 2003(f2) ─ (글) "2"
                       ─ 2004(f3) ─ (글) "3"
                       └ (글) "Prompt"          ← 폴더에 들어 있지 않은 루트 글
     IMG(2, gallery)   ─ (글) "사진 한 장"
     MEMOS(3, highlight)  ← 사용자가 이름 붙인 하이라이트 카테고리
     BANNER(4, banner)

   하이라이트 한 장은 TXT > 2002 > 1 에서 딴 것이다.
========================================================== */

function makeTables({ ownerId, slug, paginate }) {

  const post = (id, title, created, categoryId, folderId, sortOrder) => ({
    id, user_id: ownerId, category_id: categoryId, title,
    content_type: "text", visibility: "public", created_at: created,
    quote_preset_id: null, folder_id: folderId, sort_order: sortOrder,
    updated_at: created
  });

  const posts = [
    post(601, "Prompt", "2026-03-05T02:00:00Z", 1, null, 400),
    post(602, "1", "2026-03-01T02:00:00Z", 1, 1, 100),
    post(603, "2", "2026-03-02T02:00:00Z", 1, 2, 100),
    post(604, "3", "2026-03-03T02:00:00Z", 1, 3, 100),
    post(605, "사진 한 장", "2026-03-04T02:00:00Z", 2, null, 100)
  ];

  const categoryRow = (id, name, type, sortOrder, extra) => ({
    id, user_id: ownerId, name, type, sort_order: sortOrder,
    list_style: "list", page_size: 12,
    secret_cover_mode: "lock", secret_cover_path: null,
    pagination_style: "number", pagination_window_size: 5,
    paginate_posts: false,
    ...extra
  });

  return {
    profiles: [{
      user_id: ownerId, slug, home_mode: "customize",
      nickname: "테스트 사용자", bio: "재료 일치 E2E"
    }],
    site_settings: [
      { user_id: ownerId, key: "blog_title", value: "IMORY PARITY" },
      { user_id: ownerId, key: "favicon_url", value: "" }
    ],
    categories: [
      categoryRow(1, "TXT", "post", 1, { paginate_posts: paginate === true }),
      categoryRow(2, "IMG", "gallery", 2, { list_style: "gallery" }),
      categoryRow(3, "MEMOS", "highlight", 3, {}),
      categoryRow(4, "BANNER", "banner", 4, {})
    ],
    post_folders: [
      { id: 1, user_id: ownerId, category_id: 1, parent_id: null, name: "2002", depth: 1, sort_order: 100 },
      { id: 2, user_id: ownerId, category_id: 1, parent_id: null, name: "2003", depth: 1, sort_order: 200 },
      { id: 3, user_id: ownerId, category_id: 1, parent_id: null, name: "2004", depth: 1, sort_order: 300 }
    ],
    posts,
    post_contents: posts.map(p => ({ post_id: p.id, content: `${p.title} 본문입니다.` })),
    post_covers: [],
    /*
      post_highlights 행에 embed된 posts 객체를 그대로 담는다 —
      실제 조회가 `posts!inner(...)`로 한 번에 받아 오는 모양과 같다
      (posts/view/posts-view-highlight-store.js).
    */
    post_highlights: [
      {
        id: "h1", user_id: ownerId, post_id: 602,
        color: "#f2c6d2",
        excerpt: "읽는 속도가 저절로 느려지는 자리가 있다.",
        prefix: "", suffix: "", text_start: 0,
        note: "여기가 이 글의 가운데다.",
        created_at: "2026-03-06T02:00:00Z",
        updated_at: "2026-03-06T02:00:00Z",
        posts: {
          id: 602, title: "1", category_id: 1, folder_id: 1,
          visibility: "public", updated_at: "2026-03-01T02:00:00Z"
        }
      }
    ],
    highlight_folder_settings: [],
    banners: [],
    quote_presets: []
    /*
      skins / skin_versions 는 일부러 없다 — 공개 화면은 스킨을
      get_published_skin RPC 로만 받고, Studio scenario k 는 자기
      draft row 를 따로 얹는다(studio/studio-lifecycle-scenario.html).
      여기에 두면 Object.assign 이 그 row 를 덮어써서 Studio 가
      draft 를 못 찾는다.
    */
  };
}

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function queryTable(db, table, params) {
  let rows = (db[table] || []).map(r => ({ ...r }));

  /*
    PUBLIC-NUMBER-1: 공개 주소의 번호(categories.public_no /
    posts.public_no)를 이 mock 이 대신 채운다. 실제 DB 에서는 트리거가
    블로그마다 1 부터 매기지만, 여기서는 **id 와 같은 값**을 준다 —
    그래야 이 파일이 원래 확인하던 주소(/post/101 …)가 그대로 유지되고,
    검사의 초점이 번호 체계 변경에 가려지지 않는다. 번호와 id 가
    **다를 때** 어떻게 동작하는지는 skin/skin-public-number-e2e-test.mjs
    가 따로 본다(거기서는 일부러 다른 값을 준다).
  */
  if (table === "posts" || table === "categories") {
    rows = rows.map(row => (
      row && row.public_no === undefined && row.id !== undefined
        ? { ...row, public_no: row.id }
        : row
    ));
  }

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    const m = /^(eq|neq|in|gt|gte|lt|lte|is|not)\.(.*)$/s.exec(raw);
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
    if (op === "not") {
      /* not.is.null */
      rows = rows.filter(r => !(r[key] === null || r[key] === undefined));
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
  /* embed(`posts!inner(...)`)가 섞인 select는 컬럼을 잘라내지 않는다 —
     행이 이미 embed된 객체를 들고 있다. */
  if (select && select !== "*" && !select.includes("(")) {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }

  return rows;
}

async function installSupabaseMock(page, opts = {}) {
  const {
    skin = PARITY_SKIN,
    db = makeTables({ ownerId: OWNER_ID, slug: SLUG, paginate: false }),
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
    "https://cdn.jsdelivr.net/gh/**",
    "https://unpkg.com/**"
  ]) {
    await page.route(pattern, r => r.abort());
  }
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
   두 화면에서 같은 함수로 읽는 판독기

   href 의 slug 부분은 떼어 낸다(공개는 /testuser/, Preview 는
   /scenario-k/). 순서·이름·종류·주소가 비교 대상이다.
========================================================== */

const NAV_FN = `function (root) {
  if (!root) return null;
  const hiddenUp = (el) => {
    for (let cur = el; cur && cur !== root.parentElement; cur = cur.parentElement) {
      if (cur.hidden) return true;
    }
    return false;
  };
  return Array.from(root.querySelectorAll(".mp-nav-link, .mp-home"))
    .filter((a) => !hiddenUp(a))
    .map((a) => ({
      name: a.textContent,
      kind: a.getAttribute("data-kind"),
      href: (a.getAttribute("href") || "").replace(/^\\/[^/]+/, ""),
      iconWidth: getComputedStyle(a, "::before").width
    }));
}`;

const VISIBLE_POST_LINKS_FN = `function (root) {
  if (!root) return null;
  const hiddenUp = (el) => {
    for (let cur = el; cur && cur !== root.parentElement; cur = cur.parentElement) {
      if (cur.hidden) return true;
    }
    return false;
  };
  return Array.from(root.querySelectorAll('a[href*="/post/"]'))
    .filter((a) => !hiddenUp(a))
    .map((a) => ({
      title: a.textContent,
      href: (a.getAttribute("href") || "").replace(/^\\/[^/]+/, ""),
      where: a.className
    }));
}`;

const HIGHLIGHT_CARDS_FN = `function (root) {
  if (!root) return null;
  const hiddenUp = (el) => {
    for (let cur = el; cur && cur !== root.parentElement; cur = cur.parentElement) {
      if (cur.hidden) return true;
    }
    return false;
  };
  return Array.from(root.querySelectorAll(".mp-hl-card"))
    .filter((el) => !hiddenUp(el))
    .map((el) => {
      const style = getComputedStyle(el);
      const source = Array.from(el.querySelectorAll(".mp-hl-source")).filter((s) => !hiddenUp(s))[0];
      return {
        excerpt: (el.querySelector(".mp-hl-excerpt") || {}).textContent || "",
        note: (() => {
          const n = el.querySelector(".mp-hl-note");
          return n && !hiddenUp(n) ? n.textContent : null;
        })(),
        date: (el.querySelector(".mp-hl-date") || {}).textContent || "",
        colorVar: style.getPropertyValue("--imory-color").trim(),
        accent: style.borderLeftColor,
        sourceLabel: source ? source.textContent : null,
        sourceHref: source ? (source.getAttribute("href") || "").replace(/^\\/[^/]+/, "") : null,
        hasToolsSlot: Boolean(el.querySelector('[data-imory-region="highlight-tools"]'))
      };
    });
}`;

const readPublished = (page, fn, selector) =>
  page.evaluate(`(${fn})(document.querySelector("${selector} .imory-skin-root"))`);

const readPreview = (page, fn) =>
  page.evaluate(`(${fn})(document.getElementById("studioPreviewFrame").contentDocument.querySelector(".imory-skin-root"))`);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);


/* =========================================================
   Studio Preview 헬퍼 (folder-tree e2e와 같은 규약)
========================================================== */

const SCENARIO_URL = `${BASE}/studio/studio-lifecycle-scenario.html?scenario=k`;

function previewHas(page, selector, timeoutMs = 30000) {
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
    { timeout: 30000 }
  );
}

function studioOptions(skin, paginate) {
  return {
    noSupabaseMock: true,
    initScript: {
      fn: (payload) => {
        window.__scenarioParitySkinPackage = payload.skin;
        window.__scenarioParityTables = payload.tables;
      },
      arg: {
        skin,
        tables: makeTables({ ownerId: "user-k", slug: "scenario-k", paginate })
      }
    }
  };
}

async function openStudio(page) {
  await page.goto(SCENARIO_URL, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 30000 }
  );
  await previewHas(page, ".mp-page");
}


/* ---------------------------------------------------------
   1) sidebar — 공개 HOME 과 Studio HOME 의 메뉴가 같다
--------------------------------------------------------- */

const EXPECTED_NAV = [
  /* HOME 링크의 href 는 사이트 루트라 slug 를 떼면 빈 문자열이 된다 */
  { name: "IMORY PARITY", kind: "home", href: "" },
  { name: "TXT", kind: "document", href: "/category/1" },
  { name: "IMG", kind: "image", href: "/category/2" },
  { name: "MEMOS", kind: "quote", href: "/highlights" },
  { name: "BANNER", kind: "link", href: "/category/4" }
];

const stripIconWidth = (nav) =>
  (nav || []).map(({ name, kind, href }) => ({ name, kind, href }));

async function testSidebar() {
  console.log("\n[sidebar · 공개 HOME vs Studio HOME]");

  let publicNav = null;

  await withPage(VIEWPORTS["desktop-1280"], {}, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "load" });
    await page.waitForSelector("#themeMount .imory-skin-root .mp-nav", { timeout: 20000 });

    publicNav = await readPublished(page, NAV_FN, "#themeMount");

    check("공개 HOME: 메뉴에 HOME + 카테고리 4종이 그대로 나온다",
      same(stripIconWidth(publicNav), EXPECTED_NAV), JSON.stringify(publicNav));

    check("공개 HOME: 사용자가 이름 붙인 HIGHLIGHT 카테고리가 MEMOS 로 보인다",
      (publicNav || []).some(i => i.name === "MEMOS" && i.href === "/highlights"),
      JSON.stringify(publicNav));

    check("공개 HOME 렌더 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });

  await withPage(VIEWPORTS["desktop-1280"], studioOptions(PARITY_SKIN, false), async (page, { errors }) => {
    await openStudio(page);
    await previewHas(page, ".mp-nav");

    const studioNav = await readPreview(page, NAV_FN);

    check("Studio HOME: 공개 화면과 **같은** 메뉴(항목·이름·종류·href)",
      same(stripIconWidth(studioNav), stripIconWidth(publicNav)),
      JSON.stringify(studioNav));

    check("Studio HOME: MEMOS 가 빠지지 않는다",
      (studioNav || []).some(i => i.name === "MEMOS"), JSON.stringify(studioNav));

    check("Studio 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   2) icons — 아이콘은 순서가 아니라 종류로 정해진다
--------------------------------------------------------- */

async function testIcons() {
  console.log("\n[icons · 종류 기반 아이콘]");

  await withPage(VIEWPORTS["desktop-1280"], {}, async (page) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "load" });
    await page.waitForSelector("#themeMount .imory-skin-root .mp-nav", { timeout: 20000 });

    const nav = await readPublished(page, NAV_FN, "#themeMount");
    const byName = Object.fromEntries((nav || []).map(i => [i.name, i]));

    check("네 종류가 각각 다른 data-kind 를 받는다",
      byName.TXT?.kind === "document" &&
      byName.IMG?.kind === "image" &&
      byName.MEMOS?.kind === "quote" &&
      byName.BANNER?.kind === "link",
      JSON.stringify(nav));

    const widths = new Set((nav || []).filter(i => i.kind !== "home").map(i => i.iconWidth));
    check("스킨 CSS가 [data-kind] 로 아이콘 모양을 실제로 다르게 그린다",
      widths.size >= 3, JSON.stringify([...widths]));

    check("아이콘에 문자 glyph 를 쓰지 않는다(텍스트는 이름뿐)",
      (nav || []).every(i => !/[▤◉▰📁]/.test(i.name)), JSON.stringify(nav.map(i => i.name)));
  });

  /* 카테고리 순서를 뒤집어도 이름에 붙은 종류는 그대로다 */
  const reversed = makeTables({ ownerId: OWNER_ID, slug: SLUG, paginate: false });
  reversed.categories = reversed.categories
    .slice()
    .reverse()
    .map((c, index) => ({ ...c, sort_order: index + 1 }));

  await withPage(VIEWPORTS["desktop-1280"], { db: reversed }, async (page) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "load" });
    await page.waitForSelector("#themeMount .imory-skin-root .mp-nav", { timeout: 20000 });

    const nav = await readPublished(page, NAV_FN, "#themeMount");
    const byName = Object.fromEntries((nav || []).map(i => [i.name, i]));

    check("순서를 뒤집어도 종류가 그대로다(nth-child 의존이었다면 어긋난다)",
      byName.TXT?.kind === "document" &&
      byName.IMG?.kind === "image" &&
      byName.MEMOS?.kind === "quote" &&
      byName.BANNER?.kind === "link",
      JSON.stringify(nav.map(i => `${i.name}:${i.kind}`)));

    const order = (nav || []).filter(i => i.kind !== "home").map(i => i.name);
    check("메뉴 순서 자체는 사용자가 정한 순서를 따른다",
      same(order, ["BANNER", "MEMOS", "IMG", "TXT"]), JSON.stringify(order));
  });
}


/* ---------------------------------------------------------
   3) roots — 루트 글 "Prompt" 는 언제나 정확히 한 번
--------------------------------------------------------- */

const promptLinks = (links) =>
  (links || []).filter(l => l.href === "/post/601");

async function readPublishedCategory(page, paginate, skin) {
  await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "load" });
  await page.waitForSelector("#postList .imory-skin-root .mp-category-name", { timeout: 20000 });
  await page.waitForTimeout(250);
  return readPublished(page, VISIBLE_POST_LINKS_FN, "#postList");
}

async function testRoots() {
  console.log("\n[roots · 폴더 3개 + 루트 글 Prompt]");

  for (const paginate of [false, true]) {

    const db = makeTables({ ownerId: OWNER_ID, slug: SLUG, paginate });

    await withPage(VIEWPORTS["desktop-1280"], { db }, async (page, { errors }) => {
      const links = await readPublishedCategory(page, paginate, PARITY_SKIN);

      check(`공개 CATEGORY(페이지네이션 ${paginate ? "ON" : "OFF"}): 루트 글 Prompt 가 정확히 한 번`,
        promptLinks(links).length === 1,
        JSON.stringify(links));

      check(`공개 CATEGORY(페이지네이션 ${paginate ? "ON" : "OFF"}): 폴더 안 글 3개도 한 번씩`,
        ["/post/602", "/post/603", "/post/604"].every(
          href => (links || []).filter(l => l.href === href).length === 1
        ),
        JSON.stringify((links || []).map(l => l.href)));

      const folderNames = await page.evaluate(() => {
        const root = document.querySelector("#postList .imory-skin-root");
        return Array.from(root.querySelectorAll(".mp-folder-name"))
          .filter(el => !el.hidden)
          .map(el => el.textContent);
      });

      check(`공개 CATEGORY(페이지네이션 ${paginate ? "ON" : "OFF"}): 폴더 3개가 보인다`,
        same(folderNames, ["2002", "2003", "2004"]), JSON.stringify(folderNames));

      check(`공개 CATEGORY(페이지네이션 ${paginate ? "ON" : "OFF"}) 렌더 중 오류 없음`,
        errors.length === 0, errors.join(" | "));
    });

    await withPage(VIEWPORTS["desktop-1280"], studioOptions(PARITY_SKIN, paginate), async (page) => {
      await openStudio(page);
      await previewGoto(page, "/scenario-k/category/1", "category");
      await previewHas(page, ".mp-category-name");
      await page.waitForTimeout(300);

      const links = await readPreview(page, VISIBLE_POST_LINKS_FN);

      check(`Studio CATEGORY(페이지네이션 ${paginate ? "ON" : "OFF"}): 루트 글 Prompt 가 정확히 한 번`,
        promptLinks(links).length === 1, JSON.stringify(links));
    });

  }

  /* category.posts 를 아예 그리지 않는 스킨 — 플랫폼이 페이지 나누기를
     켜지 않으므로 루트 글이 트리에 남는다. */
  await withPage(
    VIEWPORTS["desktop-1280"],
    { db: makeTables({ ownerId: OWNER_ID, slug: SLUG, paginate: true }), skin: TREE_ONLY_SKIN },
    async (page) => {
      const links = await readPublishedCategory(page, true, TREE_ONLY_SKIN);

      check("category.posts 를 안 그리는 스킨에서도 루트 글이 사라지지 않는다(페이지 나누기를 켜지 않는다)",
        promptLinks(links).length === 1, JSON.stringify(links));
    }
  );
}


/* ---------------------------------------------------------
   4) highlights — 실제 카드 · 색 · 원문 위치
--------------------------------------------------------- */

async function testHighlights() {
  console.log("\n[highlights · 카드 · 색 · TXT > 2002 > 1]");

  await withPage(VIEWPORTS["desktop-1280"], {}, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/highlights`, { waitUntil: "load" });
    await page.waitForSelector("#postList .imory-skin-root .mp-hl-card", { timeout: 20000 });

    const cards = await readPublished(page, HIGHLIGHT_CARDS_FN, "#postList");

    check("공개 하이라이트: 카드가 실제로 한 장 그려진다",
      (cards || []).length === 1, JSON.stringify(cards));

    check("공개 하이라이트: 원문 위치가 카테고리 > 폴더 > 글 제목이다",
      cards?.[0]?.sourceLabel === "TXT > 2002 > 1", JSON.stringify(cards?.[0]));

    check("공개 하이라이트: 원문 위치가 그 글로 가는 링크다",
      cards?.[0]?.sourceHref === "/post/602", JSON.stringify(cards?.[0]));

    check("공개 하이라이트: 카드 강조선이 그 하이라이트의 색이다",
      cards?.[0]?.colorVar === "#f2c6d2" &&
      cards?.[0]?.accent === "rgb(242, 198, 210)",
      JSON.stringify(cards?.[0]));

    check("공개 하이라이트: 날짜가 <time> 안에서 실제로 나온다",
      Boolean(cards?.[0]?.date), JSON.stringify(cards?.[0]?.date));

    check("공개 하이라이트: 메모와 highlight-tools 자리가 있다",
      cards?.[0]?.note === "여기가 이 글의 가운데다." && cards?.[0]?.hasToolsSlot === true,
      JSON.stringify(cards?.[0]));

    check("공개 하이라이트 렌더 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });

  await withPage(VIEWPORTS["desktop-1280"], studioOptions(PARITY_SKIN, false), async (page) => {
    await openStudio(page);

    /* 메뉴의 MEMOS 링크를 눌러 들어간다 — 스킨이 그린 그 링크다. */
    const href = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const link = Array.from(doc.querySelectorAll(".mp-nav-link"))
        .find(a => a.textContent === "MEMOS");
      return link ? link.getAttribute("href") : null;
    });

    check("Studio HOME 메뉴에 하이라이트 링크가 있다", href === "/scenario-k/highlights", String(href));

    await previewGoto(page, href, "highlights");
    await previewHas(page, ".mp-hl-card");
    await page.waitForTimeout(300);

    const cards = await readPreview(page, HIGHLIGHT_CARDS_FN);

    check("Studio 하이라이트: 링크/버튼이 아니라 실제 카드가 나온다",
      (cards || []).length === 1, JSON.stringify(cards));

    check("Studio 하이라이트: 공개 화면과 같은 원문 위치와 색",
      cards?.[0]?.sourceLabel === "TXT > 2002 > 1" && cards?.[0]?.colorVar === "#f2c6d2",
      JSON.stringify(cards?.[0]));
  });

  /* 390px — 두 화면 모두 가로 넘침 0 */
  await withPage(VIEWPORTS["mobile-390"], {}, async (page) => {
    await page.goto(`${BASE}/${SLUG}/highlights`, { waitUntil: "load" });
    await page.waitForSelector("#postList .imory-skin-root .mp-hl-card", { timeout: 20000 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    check("390px 공개 하이라이트: 가로 넘침 0",
      overflow.scrollWidth <= overflow.innerWidth + 1, JSON.stringify(overflow));
  });

  await withPage(VIEWPORTS["mobile-390"], {}, async (page) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "load" });
    await page.waitForSelector("#postList .imory-skin-root .mp-category-name", { timeout: 20000 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    check("390px 공개 CATEGORY: 가로 넘침 0",
      overflow.scrollWidth <= overflow.innerWidth + 1, JSON.stringify(overflow));
  });
}


/* ---------------------------------------------------------
   4-2) homehighlight — HOME 의 발췌 카드 자리(home.highlights)

   "하이라이트 보기" 버튼 하나로 퉁치던 자리에, 실제 발췌문 한 장이
   공개 화면과 Studio 에서 **같은 재료로 같은 모양으로** 나오는가.
   카드 조립은 하이라이트 화면과 같은 함수가 한다
   (skin/skin-context.js createSkinHighlightCardBuilder).
--------------------------------------------------------- */

const HOME_HIGHLIGHT_FN = `function (root) {
  if (!root) return null;
  const hiddenUp = (el) => {
    for (let cur = el; cur && cur !== root.parentElement; cur = cur.parentElement) {
      if (cur.hidden) return true;
    }
    return false;
  };
  return Array.from(root.querySelectorAll(".mp-home-hl-card"))
    .filter((el) => !hiddenUp(el))
    .map((el) => {
      const style = getComputedStyle(el);
      const source = Array.from(el.querySelectorAll(".mp-home-hl-source")).filter((s) => !hiddenUp(s))[0];
      return {
        excerpt: (el.querySelector(".mp-home-hl-excerpt") || {}).textContent || "",
        note: (() => {
          const n = el.querySelector(".mp-home-hl-note");
          return n && !hiddenUp(n) ? n.textContent : null;
        })(),
        colorVar: style.getPropertyValue("--imory-color").trim(),
        accent: style.borderLeftColor,
        sourceLabel: source ? source.textContent : null,
        sourceHref: source ? (source.getAttribute("href") || "").replace(/^\\/[^/]+/, "") : null,
        hasToolsSlot: Boolean(el.querySelector('[data-imory-region="highlight-tools"]'))
      };
    });
}`;

async function testHomeHighlight() {
  console.log("\n[homehighlight · HOME 의 발췌 카드]");

  let publicCards = null;

  await withPage(VIEWPORTS["desktop-1280"], {}, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "load" });
    await page.waitForSelector("#themeMount .imory-skin-root .mp-home-hl-card", { timeout: 20000 });

    publicCards = await readPublished(page, HOME_HIGHLIGHT_FN, "#themeMount");

    check("공개 HOME: 발췌 카드가 **한 장만** 그려진다(featured)",
      (publicCards || []).length === 1, JSON.stringify(publicCards));

    check("공개 HOME: 하이라이트 화면과 같은 발췌문이다",
      publicCards?.[0]?.excerpt === "읽는 속도가 저절로 느려지는 자리가 있다.",
      JSON.stringify(publicCards?.[0]));

    check("공개 HOME: 원문 위치가 TXT > 2002 > 1 이고 그 글로 간다",
      publicCards?.[0]?.sourceLabel === "TXT > 2002 > 1" &&
      publicCards?.[0]?.sourceHref === "/post/602",
      JSON.stringify(publicCards?.[0]));

    check("공개 HOME: 강조선이 그 하이라이트의 색이다",
      publicCards?.[0]?.colorVar === "#f2c6d2" &&
      publicCards?.[0]?.accent === "rgb(242, 198, 210)",
      JSON.stringify(publicCards?.[0]));

    check("공개 HOME: 메모도 함께 나온다",
      publicCards?.[0]?.note === "여기가 이 글의 가운데다.",
      JSON.stringify(publicCards?.[0]));

    check("공개 HOME: highlight-tools 슬롯은 HOME 에 만들지 않는다",
      publicCards?.[0]?.hasToolsSlot === false, JSON.stringify(publicCards?.[0]));

    check("공개 HOME 렌더 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });

  await withPage(VIEWPORTS["desktop-1280"], studioOptions(PARITY_SKIN, false), async (page, { errors }) => {
    await openStudio(page);
    await previewHas(page, ".mp-home-hl-card");

    const studioCards = await readPreview(page, HOME_HIGHLIGHT_FN);

    check("Studio HOME: 공개 화면과 **같은** 발췌 카드",
      same(studioCards, publicCards), JSON.stringify(studioCards));

    check("Studio 흐름 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });

  /* 하이라이트가 하나도 없는 계정 — 공개는 자리를 접고, Studio 는
     샘플을 끼워 편집자가 카드 모양을 볼 수 있게 한다. */

  const empty = makeTables({ ownerId: OWNER_ID, slug: SLUG, paginate: false });
  empty.post_highlights = [];

  await withPage(VIEWPORTS["desktop-1280"], { db: empty }, async (page) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "load" });
    await page.waitForSelector("#themeMount .imory-skin-root .mp-recent", { timeout: 20000 });

    const cards = await readPublished(page, HOME_HIGHLIGHT_FN, "#themeMount");

    check("하이라이트가 없으면 공개 HOME 의 그 자리는 통째로 접힌다",
      (cards || []).length === 0, JSON.stringify(cards));
  });

  const emptyStudio = studioOptions(PARITY_SKIN, false);
  emptyStudio.initScript.arg.tables.post_highlights = [];

  await withPage(VIEWPORTS["desktop-1280"], emptyStudio, async (page) => {
    await openStudio(page);
    await previewHas(page, ".mp-home-hl-card");

    const cards = await readPreview(page, HOME_HIGHLIGHT_FN);

    check("하이라이트가 없어도 Studio 는 샘플 카드 한 장으로 자리를 보여준다",
      (cards || []).length === 1 && Boolean(cards?.[0]?.excerpt),
      JSON.stringify(cards));
  });

  await withPage(VIEWPORTS["mobile-390"], {}, async (page) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "load" });
    await page.waitForSelector("#themeMount .imory-skin-root .mp-home-hl-card", { timeout: 20000 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    check("390px 공개 HOME(발췌 카드 포함): 가로 넘침 0",
      overflow.scrollWidth <= overflow.innerWidth + 1, JSON.stringify(overflow));
  });
}


/* ---------------------------------------------------------
   5) legacy — templates.memos / navigation.memos / memo-tools
--------------------------------------------------------- */

async function testLegacy() {
  console.log("\n[legacy · memos alias 회귀]");

  await withPage(VIEWPORTS["desktop-1280"], { skin: LEGACY_MEMOS_SKIN }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "load" });
    await page.waitForSelector("#themeMount .imory-skin-root .lm-nav", { timeout: 20000 });

    const nav = await page.evaluate(() => {
      const root = document.querySelector("#themeMount .imory-skin-root");
      return Array.from(root.querySelectorAll(".lm-nav-link")).map(a => ({
        name: a.textContent,
        href: (a.getAttribute("href") || "").replace(/^\/[^/]+/, "")
      }));
    });

    check("legacy HOME: navigation.categories 가 그대로 나온다(MEMOS 포함)",
      nav.some(i => i.name === "MEMOS" && i.href === "/highlights") && nav.length === 4,
      JSON.stringify(nav));

    const standaloneHidden = await page.evaluate(() => {
      const el = document.querySelector("#themeMount .imory-skin-root .lm-nav-item--memos");
      return el ? el.hidden : null;
    });

    check("legacy HOME: navigation.memos.showStandaloneLink 가 alias 로 동작한다(중복 링크 없음)",
      standaloneHidden === true, String(standaloneHidden));

    check("legacy HOME 렌더 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });

  await withPage(VIEWPORTS["desktop-1280"], { skin: LEGACY_MEMOS_SKIN }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/highlights`, { waitUntil: "load" });
    await page.waitForSelector("#postList .imory-skin-root .lm-memo-card", { timeout: 20000 });

    const card = await page.evaluate(() => {
      const root = document.querySelector("#postList .imory-skin-root");
      const el = root.querySelector(".lm-memo-card");
      return {
        excerpt: (el.querySelector(".lm-memo-excerpt") || {}).textContent || "",
        postTitle: (el.querySelector(".lm-memo-post") || {}).textContent || "",
        hasToolsSlot: Boolean(el.querySelector('[data-imory-region="memo-tools"]'))
      };
    });

    check("legacy 하이라이트: templates.memos 로 카드가 그려진다",
      card.excerpt === "읽는 속도가 저절로 느려지는 자리가 있다." && card.postTitle === "1",
      JSON.stringify(card));

    check("legacy 하이라이트: 옛 이름 memo-tools 자리가 그대로 남는다",
      card.hasToolsSlot === true, JSON.stringify(card));

    check("legacy 하이라이트 렌더 중 페이지 오류 없음", errors.length === 0, errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   6) audit — "저장은 되지만 조용히 잘못 나오는" 조합의 경고

   실제 Import 검증 함수(window.validateSkinPackageImport)를 Studio
   문서 안에서 그대로 부른다 — 경고는 그 결과의 warnings[]로 나오고,
   Save 경로도 같은 함수(auditSkinPackageMaterials)를 쓴다.
--------------------------------------------------------- */

async function testAudit() {
  console.log("\n[audit · SkinPackage 감사 경고]");

  await withPage(VIEWPORTS["desktop-1280"], studioOptions(PARITY_SKIN, false), async (page) => {
    await openStudio(page);

    const run = (pkg) =>
      page.evaluate(
        async (json) => {
          const result = await window.validateSkinPackageImport(json);
          return {
            ok: result.ok,
            reason: result.reason || null,
            warnings: result.warnings || []
          };
        },
        JSON.stringify(pkg)
      );

    /* 깨끗한 패키지 — 경고 없음 */
    const clean = await run(PARITY_SKIN);
    check("제대로 만든 패키지에는 경고가 붙지 않는다",
      clean.ok === true && clean.warnings.length === 0, JSON.stringify(clean));

    /* supports만 선언하고 template을 빼먹음 */
    const claimsOnly = JSON.parse(JSON.stringify(PARITY_SKIN));
    delete claimsOnly.templates.highlights;
    const claimsResult = await run(claimsOnly);
    check("supports.highlights=true인데 templates.highlights가 없으면 경고(거부는 아님)",
      claimsResult.ok === true &&
      claimsResult.warnings.some(w => w.includes("templates.highlights")),
      JSON.stringify(claimsResult));

    /* 페이지 링크는 그리는데 category.posts는 안 그림 */
    const treeOnlyResult = await run(TREE_ONLY_SKIN);
    check("category.pagination만 그리고 category.posts를 안 그리면 경고",
      treeOnlyResult.ok === true &&
      treeOnlyResult.warnings.some(w => w.includes("category.posts")),
      JSON.stringify(treeOnlyResult));

    /* 카테고리 메뉴를 순서로 꾸미는 CSS */
    const orderIcons = JSON.parse(JSON.stringify(PARITY_SKIN));
    orderIcons.css += "\n.mp-nav-item:nth-child(2) .mp-nav-link::before { width: 20px; }";
    const orderResult = await run(orderIcons);
    check("카테고리 메뉴에 걸린 nth-child 규칙을 경고한다",
      orderResult.ok === true &&
      orderResult.warnings.some(w => w.includes("순서에 묶여")),
      JSON.stringify(orderResult));

    /* Studio 전용 샘플 문구를 template에 박아 둠 */
    const sampleText = await page.evaluate(
      () => (window.STUDIO_HIGHLIGHT_SAMPLE_TEXTS || [])[0] || ""
    );
    check("Preview 샘플 문구 목록이 Preview 쪽에서 공개된다(감사가 읽는 원본)",
      Boolean(sampleText), sampleText);

    const leaked = JSON.parse(JSON.stringify(PARITY_SKIN));
    leaked.templates.highlights.html =
      leaked.templates.highlights.html.replace(
        "</main>",
        `<p>${sampleText}</p></main>`
      );
    const leakedResult = await run(leaked);
    check("Studio 전용 샘플 문구가 template에 박혀 있으면 경고",
      leakedResult.ok === true &&
      leakedResult.warnings.some(w => w.includes("샘플 문구")),
      JSON.stringify(leakedResult));
  });
}


/* =========================================================
   main
========================================================== */

async function main() {
  playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  console.log(`서버: ${BASE} (browser=${BROWSER}${ONLY ? `, only=${ONLY}` : ""})`);

  try {
    if (shouldRun("sidebar")) await testSidebar();
    if (shouldRun("icons")) await testIcons();
    if (shouldRun("roots")) await testRoots();
    if (shouldRun("highlights")) await testHighlights();
    if (shouldRun("homehighlight")) await testHomeHighlight();
    if (shouldRun("legacy")) await testLegacy();
    if (shouldRun("audit")) await testAudit();
  } finally {
    server.close();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
