/* =========================================================
   PUBLIC-NUMBER-1 — 공개 URL 번호 E2E 테스트

   기준 문서: IMORY_PUBLIC_NUMBER_DESIGN.md
   DB:        supabase/migrations/20260915100000_public_numbers_for_categories_and_posts.sql
   환전소:    core/lib/public-number.js

   ★ 이 파일이 다른 e2e 와 다른 점

   다른 e2e 의 mock 은 public_no 를 **id 와 같은 값**으로 준다
   (검사의 초점을 흐리지 않기 위해서다 — 각 파일의 queryTable 주석).
   여기서는 반대로 **일부러 다르게** 준다:

     블로그 alpha : 카테고리 id 7 · 12   -> 공개 번호 1 · 2
                    글       id 38 · 31  -> 공개 번호 1 · 2
     블로그 beta  : 카테고리 id 3 · 9    -> 공개 번호 1 · 2
                    글       id 5 · 6    -> 공개 번호 1 · 2

   그래서 화면에 id 가 한 번이라도 새면 곧바로 드러나고, 두 블로그가
   **같은 번호**를 갖는 상태에서 서로의 글이 열리지 않는지도 실제로
   확인된다.

   무엇을 보는가
   ------------
   [render]     HOME/CATEGORY 의 링크가 공개 번호다(id 가 아니다)
   [navigate]   클릭 → 화면과 주소가 함께 공개 번호로 간다
   [direct]     직접 접속 · 새로고침 · 뒤로/앞으로가기
   [isolation]  ★ 두 블로그의 /post/1 이 서로 다른 글이다
   [missing]    ★ 없는 번호는 남의 글로 넘어가지 않고 "없음"이다
   [folder]     /category/:public_no/folder/:id
   [mobile]     390px 에서 같은 주소

   실행:
     node skin/skin-public-number-e2e-test.mjs
     node skin/skin-public-number-e2e-test.mjs --browser=webkit
     node skin/skin-public-number-e2e-test.mjs --only=isolation

   playwright 는 이 저장소에 devDependency 가 없다 — 전역/npx 캐시에
   설치된 것을 찾아 쓴다(다른 e2e 와 같은 loader).
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8961;
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const SLUG_A = "alpha";
const SLUG_B = "beta";
const OWNER_A = "aaaaaaaa-1111-2222-3333-444444444444";
const OWNER_B = "bbbbbbbb-5555-6666-7777-888888888888";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");


/* =========================================================
   playwright 찾기 (skin-published-frame-e2e-test.mjs 와 동일)
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

  const found = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let version = "0.0.0";
    try {
      version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0";
    } catch { /* 못 읽으면 가장 낮게 */ }
    found.push({ entry, version });
  }

  const toParts = v => v.split(".").map(Number);
  found.sort((a, b) => {
    const [ax, ay, az] = toParts(a.version);
    const [bx, by, bz] = toParts(b.version);
    return (bx - ax) || (by - ay) || (bz - az);
  });

  const tried = [];
  for (const { entry, version } of found) {
    let mod;
    try {
      mod = createRequire(entry)("playwright");
    } catch {
      continue;
    }
    const type = mod[browserName];
    if (!type) continue;
    try {
      const probe = await type.launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다.\n` +
    `시도한 설치:\n  - ${tried.join("\n  - ") || "없음"}\n` +
    `\`npx playwright install ${browserName}\`을 먼저 실행하세요.`
  );
}


/* =========================================================
   실제 저장소 서빙 (_redirects 의 SPA fallback 포함)
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
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
   스킨 — 주소가 그대로 보이는 최소 템플릿

   디자인이 목적이 아니다. 카테고리 · 최근 글 · 폴더 링크를
   data-imory-href 로 그대로 그려서, 렌더된 href 가 공개 번호인지
   한눈에 확인할 수 있게만 한다.
========================================================== */

const SKIN_PACKAGE = {
  schemaVersion: 1,
  templates: {
    home: {
      html:
        '<div class="pn-page">' +
        '<h1 class="pn-title" data-imory-bind="site.title"></h1>' +
        '<ul class="pn-cats"><li data-imory-repeat="navigation.categories">' +
        '<a class="pn-cat" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
        '</li></ul>' +
        '<ol class="pn-recent"><li data-imory-repeat="home.recentPosts">' +
        '<a class="pn-post" data-imory-href="item.href" data-imory-bind="item.title"></a>' +
        '</li></ol>' +
        '</div>'
    },
    category: {
      html:
        '<div class="pn-page">' +
        '<a class="pn-home" data-imory-href="navigation.home.href">HOME</a>' +
        '<h1 class="pn-title" data-imory-bind="category.name"></h1>' +
        '<ol class="pn-list"><li data-imory-repeat="category.posts">' +
        '<a class="pn-post" data-imory-href="item.href" data-imory-bind="item.title"></a>' +
        '</li></ol>' +
        '<ul class="pn-tree"><li data-imory-repeat="category.tree">' +
        '<a class="pn-folder" data-imory-if="item.folderHref" ' +
        'data-imory-href="item.folderHref" data-imory-bind="item.name"></a>' +
        '</li></ul>' +
        '</div>'
    },
    post: {
      html:
        '<div class="pn-page">' +
        '<a class="pn-back" data-imory-if="post.categoryHref" ' +
        'data-imory-href="post.categoryHref" data-imory-bind="post.categoryName"></a>' +
        '<h1 class="pn-title" data-imory-bind="post.title"></h1>' +
        '<div class="pn-body" data-imory-region="post-body"></div>' +
        '</div>'
    },
    folder: {
      html:
        '<div class="pn-page">' +
        '<a class="pn-back" data-imory-href="folder.categoryHref" ' +
        'data-imory-bind="folder.categoryName"></a>' +
        '<h1 class="pn-title" data-imory-bind="folder.name"></h1>' +
        /*
          FOLDER-2: folder.posts 반복 **안에** post-body region 이
          있어야 폴더 페이지로 인정된다(skin/skin-folder.js). 없으면
          플랫폼이 카테고리로 되돌린다.
        */
        '<ol class="pn-list"><li data-imory-repeat="folder.posts">' +
        '<a class="pn-post" data-imory-href="item.href" data-imory-bind="item.title"></a>' +
        '<div class="pn-body" data-imory-region="post-body"></div>' +
        '</li></ol>' +
        '</div>'
    }
  },
  css:
    ".pn-page{max-width:640px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;}" +
    ".pn-title{font-size:20px;margin:0 0 12px;}" +
    ".pn-cats,.pn-recent,.pn-list,.pn-tree{list-style:none;margin:0 0 16px;padding:0;}" +
    ".pn-cat,.pn-post,.pn-folder,.pn-home,.pn-back{display:inline-block;padding:4px 0;color:#222;}" +
    "@media (max-width:480px){.pn-page{padding:16px;}}",
  imageSlots: [],
  regions: [],
  metadata: { title: "Public Number Probe" }
};


/* =========================================================
   데이터 — id 와 공개 번호를 **일부러 다르게**
========================================================== */

const DB = {
  profiles: [
    {
      user_id: OWNER_A, slug: SLUG_A, home_mode: "customize",
      nickname: "알파", bio: ""
    },
    {
      user_id: OWNER_B, slug: SLUG_B, home_mode: "customize",
      nickname: "베타", bio: ""
    }
  ],

  site_settings: [
    { user_id: OWNER_A, key: "blog_title", value: "ALPHA BLOG" },
    { user_id: OWNER_B, key: "blog_title", value: "BETA BLOG" }
  ],

  categories: [
    /* alpha — id 는 7·12 인데 공개 번호는 1·2 다 */
    { id: 7,  public_no: 1, user_id: OWNER_A, name: "A-일기", type: "post", sort_order: 1 },
    { id: 12, public_no: 2, user_id: OWNER_A, name: "A-링크", type: "post", sort_order: 2 },

    /* beta — id 는 3·9 인데 공개 번호는 다시 1·2 다 */
    { id: 3,  public_no: 1, user_id: OWNER_B, name: "B-메모", type: "post", sort_order: 1 },
    { id: 9,  public_no: 2, user_id: OWNER_B, name: "B-기록", type: "post", sort_order: 2 }
  ],

  post_folders: [
    { id: 44, user_id: OWNER_A, category_id: 7, parent_id: null, name: "A-폴더", depth: 1, sort_order: 100 }
  ],

  posts: [
    { id: 38, public_no: 1, user_id: OWNER_A, category_id: 7, folder_id: null, title: "알파의 첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", updated_at: "2026-09-01T02:00:00Z", quote_preset_id: null, sort_order: 100 },
    { id: 31, public_no: 2, user_id: OWNER_A, category_id: 7, folder_id: 44, title: "알파의 폴더 안 글", content_type: "text", visibility: "public", created_at: "2026-09-02T02:00:00Z", updated_at: "2026-09-02T02:00:00Z", quote_preset_id: null, sort_order: 200 },

    { id: 5, public_no: 1, user_id: OWNER_B, category_id: 3, folder_id: null, title: "베타의 첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-03T02:00:00Z", updated_at: "2026-09-03T02:00:00Z", quote_preset_id: null, sort_order: 100 },
    { id: 6, public_no: 2, user_id: OWNER_B, category_id: 3, folder_id: null, title: "베타의 두 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-04T02:00:00Z", updated_at: "2026-09-04T02:00:00Z", quote_preset_id: null, sort_order: 200 }
  ],

  post_contents: [
    { post_id: 38, content: "알파 첫 글 본문", ooc_content: null },
    { post_id: 31, content: "알파 폴더 글 본문", ooc_content: null },
    { post_id: 5,  content: "베타 첫 글 본문", ooc_content: null },
    { post_id: 6,  content: "베타 둘째 글 본문", ooc_content: null }
  ],

  banners: [],
  post_highlights: [],
  post_gallery_images: [],
  quote_presets: []
};

const RPC = {
  get_published_skin: (body) => {
    const userId = body && body.p_user_id;
    if (userId !== OWNER_A && userId !== OWNER_B) return null;
    return {
      skin: SKIN_PACKAGE,
      schemaVersion: SKIN_PACKAGE.schemaVersion,
      imageSlotValues: {}
    };
  }
};


/* =========================================================
   Supabase mock
========================================================== */

const RESERVED_PARAMS = new Set(
  ["select", "order", "limit", "offset", "on_conflict", "columns"]
);

function queryTable(table, params) {
  let rows = (DB[table] || []).map(r => ({ ...r }));

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    const m = /^(eq|neq|in|is|not|gt|gte|lt|lte)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;

    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
      rows = rows.filter(r => list.includes(String(r[key])));
      continue;
    }

    if (op === "is") {
      rows = rows.filter(r => (val === "null" ? r[key] === null || r[key] === undefined : true));
      continue;
    }

    if (op === "not") {
      /* not.is.null */
      rows = rows.filter(r => r[key] !== null && r[key] !== undefined);
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

  return rows;
}

async function installSupabaseMock(page) {
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
      const fn = RPC[url.pathname.slice("/rest/v1/rpc/".length)];
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify(fn ? fn(JSON.parse(req.postData() || "{}")) : null)
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const rows = queryTable(url.pathname.slice("/rest/v1/".length), url.searchParams);
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
   검사 도구
========================================================== */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const section = (name) => {
  console.log(`\n[${name}]`);
  return !ONLY || ONLY === name;
};

async function gotoAndSettle(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelector(".imory-skin-root") !== null,
    null,
    { timeout: 8000 }
  ).catch(() => {});
  await page.waitForTimeout(350);
}

/*
  ★ 화면이 바뀌어도 HOME 스킨은 #themeMount 에 mount 된 채 남는다
  (플랫폼 계약 — SKIN_SURFACE_AND_TRANSITION_CONTRACT.md). 그래서
  ".pn-post" 를 문서 전체에서 고르면 숨어 있는 HOME 의 링크까지
  걸린다. 지금 **보이는** 화면(= #postArea 가 열려 있으면 그 안,
  아니면 #themeMount) 안에서만 고른다.
*/

async function installScopeHelper(page) {
  await page.addInitScript(() => {
    window.__pnScope = () => {
      const area = document.getElementById("postArea");
      return (area && !area.hidden)
        ? area
        : document.getElementById("themeMount");
    };
  });
}

async function hrefs(page, selector) {
  return page.evaluate((sel) => {
    const scope = window.__pnScope();
    if (!scope) return [];
    return Array.from(scope.querySelectorAll(sel))
      .map(el => el.getAttribute("href"));
  }, selector);
}

async function clickIn(page, selector) {
  const handle = await page.evaluateHandle((sel) => {
    const scope = window.__pnScope();
    return scope ? scope.querySelector(sel) : null;
  }, selector);

  const el = handle.asElement();
  if (!el) throw new Error(`보이는 화면에 ${selector} 가 없다`);

  await el.click();
}

async function attrIn(page, selector, attr) {
  return page.evaluate(({ sel, a }) => {
    const scope = window.__pnScope();
    const el = scope ? scope.querySelector(sel) : null;
    return el ? el.getAttribute(a) : null;
  }, { sel: selector, a: attr });
}

/*
  화면 전환 직후에는 이전 화면의 스킨 DOM 이 잠깐 같은 컨테이너
  안에 함께 있을 수 있다(플랫폼이 교체하는 순간). 그래서 첫
  .pn-title 이 아니라 **실제로 그려져 있는**(크기가 0 이 아닌)
  것 중 마지막을 읽는다.
*/

async function visibleTitle(page) {
  return page.evaluate(() => {
    const area = document.getElementById("postArea");
    const scope = (area && !area.hidden) ? area : document.getElementById("themeMount");
    if (!scope) return "";

    const shown = Array.from(scope.querySelectorAll(".pn-title"))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

    const el = shown[shown.length - 1];
    return el ? el.textContent.trim() : "";
  });
}


/* =========================================================
   실행
========================================================== */

async function run() {
  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();

  const base = `http://localhost:${PORT}`;

  try {

    /* ---------------------------------------------------
       [render] 링크가 공개 번호다
    --------------------------------------------------- */

    if (section("render")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await installScopeHelper(page);
      await installSupabaseMock(page);

      await gotoAndSettle(page, `${base}/${SLUG_A}`);

      const catHrefs = await hrefs(page, ".pn-cat");
      const postHrefs = await hrefs(page, ".pn-post");

      check(
        "★ HOME 의 카테고리 링크가 공개 번호다(내부 id 7·12 가 아니다)",
        catHrefs.join(" ") === `/${SLUG_A}/category/1 /${SLUG_A}/category/2`,
        catHrefs.join(" ")
      );

      check(
        "★ HOME 의 최근 글 링크가 공개 번호다(내부 id 38·31 이 아니다)",
        postHrefs.every(h => /^\/alpha\/post\/[12]$/.test(h)) && postHrefs.length === 2,
        postHrefs.join(" ")
      );

      check(
        "문서 어디에도 내부 id 가 담긴 주소가 없다",
        !(await page.content()).includes(`/${SLUG_A}/post/38`) &&
        !(await page.content()).includes(`/${SLUG_A}/category/7`)
      );

      await gotoAndSettle(page, `${base}/${SLUG_B}`);

      const bCatHrefs = await hrefs(page, ".pn-cat");

      check(
        "★ 다른 블로그도 1 부터다(내부 id 3·9 가 아니다)",
        bCatHrefs.join(" ") === `/${SLUG_B}/category/1 /${SLUG_B}/category/2`,
        bCatHrefs.join(" ")
      );

      await ctx.close();

    }


    /* ---------------------------------------------------
       [navigate] HOME -> CATEGORY -> POST
    --------------------------------------------------- */

    if (section("navigate")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await installScopeHelper(page);
      await installSupabaseMock(page);

      await gotoAndSettle(page, `${base}/${SLUG_A}`);

      await clickIn(page, ".pn-cat");
      await page.waitForTimeout(600);

      check(
        "★ 카테고리로 이동하면 주소가 공개 번호다",
        new URL(page.url()).pathname === `/${SLUG_A}/category/1`,
        page.url()
      );

      check(
        "그 카테고리 화면이 실제로 열렸다",
        (await visibleTitle(page)) === "A-일기",
        await visibleTitle(page)
      );

      const listHrefs = await hrefs(page, ".pn-post");

      check(
        "카테고리 목록의 글 링크도 공개 번호다",
        listHrefs.every(h => /^\/alpha\/post\/[12]$/.test(h)) && listHrefs.length >= 1,
        listHrefs.join(" ")
      );

      await clickIn(page, ".pn-post");
      await page.waitForTimeout(700);

      check(
        "★ 글로 이동하면 주소가 공개 번호다",
        /^\/alpha\/post\/[12]$/.test(new URL(page.url()).pathname),
        page.url()
      );

      check(
        "그 글이 실제로 열렸다",
        (await visibleTitle(page)).startsWith("알파"),
        await visibleTitle(page)
      );

      const backHref = await attrIn(page, ".pn-back", "href");

      check(
        "글 화면의 카테고리 복귀 링크도 공개 번호다",
        backHref === `/${SLUG_A}/category/1`,
        String(backHref)
      );

      await page.goBack();
      await page.waitForTimeout(700);

      check(
        "뒤로가기가 그 카테고리로 돌아간다",
        new URL(page.url()).pathname === `/${SLUG_A}/category/1` &&
        (await visibleTitle(page)) === "A-일기",
        page.url() + " / " + await visibleTitle(page)
      );

      await page.goForward();
      await page.waitForTimeout(700);

      check(
        "앞으로가기가 그 글로 다시 간다",
        /^\/alpha\/post\/[12]$/.test(new URL(page.url()).pathname) &&
        (await visibleTitle(page)).startsWith("알파"),
        page.url() + " / " + await visibleTitle(page)
      );

      await ctx.close();

    }


    /* ---------------------------------------------------
       [direct] 직접 접속 · 새로고침
    --------------------------------------------------- */

    if (section("direct")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await installScopeHelper(page);
      await installSupabaseMock(page);

      await gotoAndSettle(page, `${base}/${SLUG_A}/post/1`);

      check(
        "★ 직접 접속한 /alpha/post/1 이 알파의 첫 글이다",
        (await visibleTitle(page)) === "알파의 첫 번째 글",
        await visibleTitle(page)
      );

      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(800);

      check(
        "새로고침해도 같은 글이다",
        (await visibleTitle(page)) === "알파의 첫 번째 글" &&
        new URL(page.url()).pathname === `/${SLUG_A}/post/1`,
        page.url() + " / " + await visibleTitle(page)
      );

      await gotoAndSettle(page, `${base}/${SLUG_A}/category/2`);

      check(
        "직접 접속한 /alpha/category/2 가 두 번째 카테고리다",
        (await visibleTitle(page)) === "A-링크",
        await visibleTitle(page)
      );

      await ctx.close();

    }


    /* ---------------------------------------------------
       [isolation] 같은 번호, 다른 블로그
    --------------------------------------------------- */

    if (section("isolation")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await installScopeHelper(page);
      await installSupabaseMock(page);

      await gotoAndSettle(page, `${base}/${SLUG_A}/post/1`);
      const titleA = await visibleTitle(page);

      await gotoAndSettle(page, `${base}/${SLUG_B}/post/1`);
      const titleB = await visibleTitle(page);

      check(
        "★ 같은 번호 /post/1 이 블로그마다 다른 글이다",
        titleA === "알파의 첫 번째 글" && titleB === "베타의 첫 번째 글",
        `${titleA} / ${titleB}`
      );

      await gotoAndSettle(page, `${base}/${SLUG_A}/category/1`);
      const catA = await visibleTitle(page);

      await gotoAndSettle(page, `${base}/${SLUG_B}/category/1`);
      const catB = await visibleTitle(page);

      check(
        "★ 같은 번호 /category/1 도 블로그마다 다른 카테고리다",
        catA === "A-일기" && catB === "B-메모",
        `${catA} / ${catB}`
      );

      check(
        "베타 화면에 알파의 글이 한 글자도 섞이지 않는다",
        !(await page.content()).includes("알파의")
      );

      await ctx.close();

    }


    /* ---------------------------------------------------
       [missing] 없는 번호
    --------------------------------------------------- */

    if (section("missing")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await installScopeHelper(page);
      await installSupabaseMock(page);

      /*
        HOME 스킨은 #themeMount 에 계속 mount 돼 있으므로 document.body
        전체를 보면 HOME 의 최근 글 제목까지 걸린다. 지금 열린 글
        화면(#postArea)만 본다.
      */

      const areaText = () => page.evaluate(() => {
        const area = document.getElementById("postArea");
        return (area && !area.hidden) ? area.innerText : "";
      });

      await gotoAndSettle(page, `${base}/${SLUG_A}/post/99`);
      await page.waitForTimeout(900);

      const body99 = await areaText();

      check(
        "★ 없는 번호는 남의 글로 넘어가지 않는다",
        !body99.includes("베타의") && !body99.includes("알파의"),
        body99.slice(0, 80).replace(/\s+/g, " ")
      );

      check(
        "없는 글이라는 것이 화면에 드러난다",
        body99.includes("post not found"),
        body99.slice(0, 120).replace(/\s+/g, " ")
      );

      /*
        ★ 예전 주소(내부 id)를 그대로 쳐도 다른 글이 열리면 안 된다.
        알파의 글 id 38 은 알파에 공개 번호 38 이 없으므로 "없음"이고,
        id 5(= 베타의 글)를 알파 주소에 붙여도 마찬가지다.
      */

      await gotoAndSettle(page, `${base}/${SLUG_A}/post/38`);
      await page.waitForTimeout(900);

      const bodyOld = await areaText();

      check(
        "★ 옛 global-id 주소(/alpha/post/38)는 이제 아무 글도 열지 않는다",
        !bodyOld.includes("알파의 첫 번째 글") && !bodyOld.includes("베타의"),
        bodyOld.slice(0, 80).replace(/\s+/g, " ")
      );

      await ctx.close();

    }


    /* ---------------------------------------------------
       [folder] 폴더 주소
    --------------------------------------------------- */

    if (section("folder")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await installScopeHelper(page);
      await installSupabaseMock(page);

      await gotoAndSettle(page, `${base}/${SLUG_A}/category/1`);

      const folderHref = await attrIn(page, ".pn-folder", "href");

      check(
        "★ 폴더 링크의 카테고리 자리가 공개 번호다(폴더 번호는 내부 id 그대로)",
        folderHref === `/${SLUG_A}/category/1/folder/44`,
        String(folderHref)
      );

      await clickIn(page, ".pn-folder");
      await page.waitForTimeout(800);

      check(
        "폴더 화면이 열리고 주소도 그대로다",
        new URL(page.url()).pathname === `/${SLUG_A}/category/1/folder/44` &&
        (await visibleTitle(page)) === "A-폴더",
        page.url() + " / " + await visibleTitle(page)
      );

      const folderPostHrefs = await hrefs(page, ".pn-post");

      check(
        "폴더 안 글 링크도 공개 번호다",
        folderPostHrefs.every(h => /^\/alpha\/post\/[12]$/.test(h)),
        folderPostHrefs.join(" ")
      );

      await ctx.close();

    }


    /* ---------------------------------------------------
       [mobile] 390px
    --------------------------------------------------- */

    if (section("mobile")) {

      const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
      const page = await ctx.newPage();
      await installScopeHelper(page);
      await installSupabaseMock(page);

      await gotoAndSettle(page, `${base}/${SLUG_A}`);

      const catHrefs = await hrefs(page, ".pn-cat");

      check(
        "모바일에서도 같은 공개 번호 주소다",
        catHrefs.join(" ") === `/${SLUG_A}/category/1 /${SLUG_A}/category/2`,
        catHrefs.join(" ")
      );

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );

      check(
        "390px 에서 가로 넘침 없음",
        overflow <= 0,
        String(overflow)
      );

      await ctx.close();

    }

  } finally {
    await browser.close();
    server.close();
  }
}

await run();

console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);

if (failures.length) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
