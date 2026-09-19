/* =========================================================
   BOTTOM-DOCK-1 — 화면 아래 dock E2E

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md

   ★ 하네스가 아니라 **진짜 index.html** 로 공개 화면을 연다.
   supabase 응답만 mock 하고 HTML/CSS/JS 는 저장소의 실제 파일을
   서빙한다 — dock 이 여섯 진입 모듈 · 전환 · 플랫폼 CSS 와 실제로
   맞물려 있는지는 그렇게만 확인된다.

   무엇을 보는가
   ------------
   [render]   설정대로 항목이 그려지고 주소는 플랫폼이 만든 것이다
   [position] auto 가 실측으로 정해지고, 명시 설정이 그것을 이긴다
   [padding]  fixed dock 이 본문 끝을 가리지 않는다
   [collapse] 접기/펼치기 · 트리거는 항상 남는다 · 화면을 옮겨도 유지
   [actions]  open 패널 토글 · 맨 위로 · navigate 는 기존 라우터로
   [screens]  ★ 어느 화면에서도 dock 은 문서 전체에 정확히 하나
   [owner]    주인장 전용 항목이 방문자 DOM 에 아예 없다
   [skin]     스킨이 그린 templates.dock 과 bottom-dock region
   [mobile]   390px 가로 넘침 0 · 터치 영역
   [none]     dock 이 없는 스킨은 한 줄도 달라지지 않는다(회귀)

   실행:
     node skin/skin-bottom-dock-e2e-test.mjs
     node skin/skin-bottom-dock-e2e-test.mjs --browser=webkit
     node skin/skin-bottom-dock-e2e-test.mjs --only=collapse
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8962;
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const SLUG = "dockblog";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_ID = "99999999-8888-7777-6666-555555555555";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");


/* =========================================================
   playwright 찾기 (다른 e2e 와 같은 loader)
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
   스킨

   dock 을 **직접 그리지 않는다** — templates.dock 이 없으므로
   플랫폼 기본 template 이 쓰인다. "스킨을 한 글자도 고치지 않아도
   dock 이 붙는다"가 이 계약의 출발점이라 그 경로를 기본으로 본다.
   스킨이 자기 dock 을 그리는 경우는 [skin] 절에서 따로 본다.

   ★ 화면이 한 뷰포트에 들어가야 auto 가 fixed 로 판정된다 —
   HOME 은 짧게, CATEGORY 는 길게 만든다(아래 DB 의 글 개수).
========================================================== */

const BASE_TEMPLATES = {
  home: {
    html:
      '<div class="bd-page bd-home">' +
      '<h1 class="bd-title" data-imory-bind="site.title"></h1>' +
      '<ul class="bd-cats"><li data-imory-repeat="navigation.categories">' +
      '<a class="bd-cat" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
      '</li></ul>' +
      '</div>'
  },
  category: {
    html:
      '<div class="bd-page bd-category">' +
      '<a class="bd-home-link" data-imory-href="navigation.home.href">HOME</a>' +
      '<h1 class="bd-title" data-imory-bind="category.name"></h1>' +
      '<ol class="bd-list"><li data-imory-repeat="category.posts">' +
      '<a class="bd-post" data-imory-href="item.href" data-imory-bind="item.title"></a>' +
      '</li></ol>' +
      '</div>'
  },
  post: {
    html:
      '<div class="bd-page bd-post">' +
      '<h1 class="bd-title" data-imory-bind="post.title"></h1>' +
      '<div class="bd-body" data-imory-region="post-body"></div>' +
      '</div>'
  }
};

const BASE_CSS =
  ".bd-page{max-width:640px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;}" +
  ".bd-title{font-size:20px;margin:0 0 12px;}" +
  ".bd-cats,.bd-list{list-style:none;margin:0;padding:0;}" +
  ".bd-cat,.bd-post,.bd-home-link{display:block;padding:6px 0;color:#222;}" +
  ".bd-list li{min-height:90px;}" +
  "[hidden]{display:none;}";

const DOCK_CONFIG = {
  visible: true,
  position: "auto",
  collapsible: true,
  defaultState: "expanded",
  transition: "fade",
  trigger: { type: "emoji", value: "♡", label: "메뉴 열기" },
  items: [
    { id: "home", label: "home", visual: { type: "icon", value: "home" }, action: { type: "navigate", target: "home" } },
    { id: "diary", label: "diary", visual: { type: "emoji", value: "📓" }, action: { type: "navigate", target: "category:7" } },
    { id: "pair", label: "pair", visual: { type: "emoji", value: "♡" }, action: { type: "open", target: "panel:pair" } },
    { id: "top", label: "top", visual: { type: "text", value: "↑" }, action: { type: "action", target: "top" } },
    { id: "write", label: "write", audience: "owner", visual: { type: "icon", value: "write" }, action: { type: "action", target: "write" } }
  ]
};

function skinWith(overrides = {}) {
  return {
    schemaVersion: 1,
    templates: { ...BASE_TEMPLATES, ...(overrides.templates || {}) },
    css: overrides.css || BASE_CSS,
    bottomDock: overrides.bottomDock === null
      ? undefined
      : { ...DOCK_CONFIG, ...(overrides.bottomDock || {}) },
    imageSlots: [],
    regions: [],
    metadata: { title: "Bottom Dock Probe" }
  };
}

const SKIN_DEFAULT = skinWith();

const SKIN_NO_DOCK = (() => {
  const s = skinWith({ bottomDock: null });
  delete s.bottomDock;
  return s;
})();

/* 스킨이 자기 dock 을 그린 경우 — bottom-dock region 도 함께 */
const SKIN_OWN_DOCK = skinWith({
  bottomDock: { position: "static", collapsible: true },
  templates: {
    home: {
      html:
        '<div class="bd-page bd-home">' +
        '<h1 class="bd-title" data-imory-bind="site.title"></h1>' +
        '<ul class="bd-cats"><li data-imory-repeat="navigation.categories">' +
        '<a class="bd-cat" data-imory-href="item.href" data-imory-bind="item.name"></a>' +
        '</li></ul>' +
        '<div class="bd-dock-slot" data-imory-region="bottom-dock"></div>' +
        '</div>'
    },
    dock: {
      html:
        '<nav class="my-dock">' +
        '<span class="my-trigger" data-imory-dock="trigger" data-imory-bind="dock.trigger.text"></span>' +
        '<ul class="my-items" data-imory-dock="items">' +
        '<li class="my-item" data-imory-repeat="dock.items">' +
        '<a class="my-link" data-imory-href="item.href" data-imory-bind="item.label"></a>' +
        '</li>' +
        '</ul>' +
        '<div class="my-panel"><p>PAIR PANEL</p></div>' +
        '</nav>'
    }
  },
  /*
    ★ 상태 속성은 **`:root[...]` 로 받는다**.

    스킨 CSS 는 저장/렌더 시점에 인스턴스 scope class 가 앞에 붙는다
    (skin/skin-css-validate.js scopeSkinCssSelector). 그냥
    `[data-imory-dock-open="pair"] .my-panel` 이라고 쓰면
    `.imory-skin-root-iN [data-...] .my-panel` 이 되어 **자기 루트
    자신**은 매치되지 않는다. `:root` 로 시작하면 그 자리에 scope
    class 가 들어가므로(PHASE 1H 의 data-imory-post-focus 와 같은
    형태) 루트에 찍힌 상태를 받을 수 있다.
  */
  css:
    BASE_CSS +
    ".my-dock{display:flex;gap:12px;align-items:center;}" +
    ".my-items{display:flex;gap:10px;list-style:none;margin:0;padding:0;}" +
    ".my-panel{display:none;}" +
    ":root[data-imory-dock-open='pair'] .my-panel{display:block;}"
});


/* =========================================================
   데이터
========================================================== */

const DB = {
  profiles: [
    { user_id: OWNER_ID, slug: SLUG, home_mode: "customize", nickname: "도크", bio: "" }
  ],
  site_settings: [
    { user_id: OWNER_ID, key: "blog_title", value: "DOCK BLOG" }
  ],
  categories: [
    { id: 7, public_no: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1 }
  ],
  post_folders: [],
  posts: Array.from({ length: 12 }, (_, i) => ({
    id: 100 + i,
    public_no: i + 1,
    user_id: OWNER_ID,
    category_id: 7,
    folder_id: null,
    title: `글 ${i + 1}`,
    content_type: "text",
    visibility: "public",
    created_at: `2026-09-${String(i + 1).padStart(2, "0")}T02:00:00Z`,
    updated_at: `2026-09-${String(i + 1).padStart(2, "0")}T02:00:00Z`,
    quote_preset_id: null,
    sort_order: (i + 1) * 100
  })),
  post_contents: Array.from({ length: 12 }, (_, i) => ({
    post_id: 100 + i,
    content: `본문 ${i + 1}`,
    ooc_content: null
  })),
  banners: [],
  post_highlights: [],
  post_gallery_images: [],
  quote_presets: []
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

async function installSupabaseMock(page, opts = {}) {
  const skin = opts.skin || SKIN_DEFAULT;

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
        const body = JSON.parse(req.postData() || "{}");
        const found = body.p_user_id === OWNER_ID
          ? { skin, schemaVersion: skin.schemaVersion, imageSlotValues: {} }
          : null;
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify(found)
        });
      }

      if (fn === "get_own_post_content") {
        const a = JSON.parse(req.postData() || "{}");
        const post = DB.posts.find(p => String(p.id) === String(a.p_post_id));
        const owned = post && opts.signedInAs && post.user_id === opts.signedInAs;
        const row = owned ? DB.post_contents.find(c => String(c.post_id) === String(post.id)) : null;
        const rows = row ? [{ content: row.content, ooc_content: row.ooc_content }] : [];
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

      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: "null"
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


/* 로그인 상태 mock — skin-banner-page-e2e-test.mjs 와 같은 방법 */

async function installSignedInUser(page, userId) {
  await page.addInitScript((id) => {
    let stored;
    Object.defineProperty(window, "supabase", {
      configurable: true,
      get() { return stored; },
      set(value) {
        if (value && typeof value.createClient === "function" && !value.__imoryPatched) {
          const original = value.createClient.bind(value);
          value.createClient = (...a) => {
            const client = original(...a);
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
  if (ONLY && ONLY !== name) return false;
  console.log(`\n[${name}]`);
  return true;
};

async function gotoAndSettle(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelector(".imory-skin-root") !== null,
    null,
    { timeout: 8000 }
  ).catch(() => {});
  await page.waitForTimeout(450);
}

/* dock 하나의 상태를 통째로 읽는다 */

async function readDock(page) {
  return page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll("[data-imory-dock-position]"));
    if (roots.length !== 1) {
      return { count: roots.length };
    }
    const root = roots[0];
    const items = Array.from(root.querySelectorAll("[data-imory-dock-item]"));
    const itemsBox = root.querySelector('[data-imory-dock="items"]');
    const trigger = root.querySelector('[data-imory-dock="trigger"]');
    const rect = root.getBoundingClientRect();
    const cs = getComputedStyle(root);

    return {
      count: 1,
      position: root.getAttribute("data-imory-dock-position"),

      /*
        fixed 는 **플랫폼이 만든 자리**가 고정된다(dock 루트가 아니라).
        그래야 safe area 여백과 pointer-events 를 한 겹에서 다룰 수
        있다 — skin/skin-bottom-dock.css. 그래서 실제로 적용된
        CSS position 은 그 자리에서 읽는다.
      */
      cssPosition: (
        root.closest("#imoryBottomDockFixed")
          ? getComputedStyle(root.closest("#imoryBottomDockFixed")).position
          : cs.position
      ),
      state: root.getAttribute("data-imory-dock-state"),
      transition: root.getAttribute("data-imory-dock-transition"),
      open: root.getAttribute("data-imory-dock-open"),
      inFixedHost: !!root.closest("#imoryBottomDockFixed"),
      inFlowHost: !!root.closest(".imory-dock-flow"),
      inRegion: !!root.closest('[data-imory-region="bottom-dock"]'),
      ids: items.map(el => el.getAttribute("data-imory-dock-item")),
      hrefs: items.map(el => {
        const a = el.tagName === "A" ? el : el.querySelector("a[href]");
        return a ? a.getAttribute("href") : null;
      }),
      labels: items.map(el => el.textContent.replace(/\s+/g, " ").trim()),
      itemsHidden: itemsBox ? itemsBox.hidden : null,
      itemsOpacity: itemsBox ? getComputedStyle(itemsBox).opacity : null,
      triggerVisible: trigger
        ? (trigger.getBoundingClientRect().height > 0)
        : false,
      triggerExpanded: trigger ? trigger.getAttribute("aria-expanded") : null,
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      viewportH: window.innerHeight,
      htmlHasDockClass: document.documentElement.classList.contains("imory-has-bottom-dock"),
      heightVar: document.documentElement.style.getPropertyValue("--imory-bottom-dock-height")
    };
  });
}

async function clickDockItem(page, id) {
  await page.evaluate((itemId) => {
    const el = document.querySelector(`[data-imory-dock-item="${itemId}"]`);
    if (el) el.click();
  }, id);
  await page.waitForTimeout(350);
}


/* =========================================================
   실행
========================================================== */

async function run() {
  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();

  const base = `http://localhost:${PORT}`;

  const newPage = async (browserCtxOpts, mockOpts = {}) => {
    const ctx = await browser.newContext(browserCtxOpts);
    const page = await ctx.newPage();
    if (mockOpts.signedInAs) await installSignedInUser(page, mockOpts.signedInAs);
    await installSupabaseMock(page, mockOpts);
    return { ctx, page };
  };

  const desktop = { viewport: { width: 1280, height: 900 } };
  const mobile = { viewport: { width: 390, height: 780 } };

  try {

    /* ------------------------------------------------- */

    if (section("render")) {

      const { ctx, page } = await newPage(desktop);
      await gotoAndSettle(page, `${base}/${SLUG}`);

      const dock = await readDock(page);

      check("문서에 dock 이 정확히 하나", dock.count === 1, String(dock.count));

      check(
        "★ 방문자에게는 주인장 전용 항목(write)이 없다",
        dock.ids && dock.ids.join(",") === "home,diary,pair,top",
        dock.ids && dock.ids.join(",")
      );

      check(
        "주소는 플랫폼이 만든 것이다(스킨이 카테고리 id 를 모른다)",
        /^\/dockblog\/?$/.test(dock.hrefs[0]) && dock.hrefs[1] === `/${SLUG}/category/1`,
        dock.hrefs.join(" ")
      );

      check(
        "주소가 없는 동작 항목에는 href 가 붙지 않는다",
        dock.hrefs[2] === null && dock.hrefs[3] === null,
        dock.hrefs.join(" ")
      );

      check("라벨이 그려진다", dock.labels.join(" ").includes("home"), dock.labels.join(" "));
      check("전환 종류가 속성으로 나간다", dock.transition === "fade", dock.transition);

      const stamped = await page.evaluate(() => {
        const el = document.querySelector('[data-imory-dock-item="pair"]');
        return {
          role: el.getAttribute("role"),
          tabindex: el.getAttribute("tabindex"),
          aria: el.getAttribute("aria-label")
        };
      });

      check(
        "주소 없는 항목도 키보드로 쓸 수 있다(플랫폼이 얹는다)",
        stamped.role === "button" && stamped.tabindex === "0",
        JSON.stringify(stamped)
      );

      check(
        "스킨 HTML 은 플랫폼 상태 속성을 적을 수 없다(런타임에만 찍힌다)",
        !(await page.content()).includes("data-imory-dock-position=\\\"")
      );

      await ctx.close();
    }


    /* ------------------------------------------------- */

    if (section("position")) {

      const { ctx, page } = await newPage(desktop);

      /* HOME 은 짧다 → auto = fixed */
      await gotoAndSettle(page, `${base}/${SLUG}`);
      const home = await readDock(page);

      check(
        "★ 한 화면에 들어오는 HOME 에서 auto 는 fixed 를 고른다",
        home.position === "fixed" && home.cssPosition === "fixed",
        `${home.position}/${home.cssPosition}`
      );

      check("fixed dock 은 플랫폼이 만든 자리에 있다", home.inFixedHost === true);

      check(
        "fixed dock 은 화면 아래에 붙어 있다",
        Math.abs(home.bottom - home.viewportH) <= 2,
        `${home.bottom} vs ${home.viewportH}`
      );

      /* CATEGORY 는 글 12개라 스크롤이 생긴다 → auto = sticky */
      await page.evaluate((slug) => {
        document.querySelector(`.bd-cat[href="/${slug}/category/1"]`).click();
      }, SLUG);
      await page.waitForTimeout(900);

      const cat = await readDock(page);

      check(
        "★ 스크롤이 있는 CATEGORY 에서 auto 는 sticky 를 고른다",
        cat.position === "sticky" && cat.cssPosition === "sticky",
        `${cat.position}/${cat.cssPosition}`
      );

      check("sticky dock 은 흐름 자리에 있다", cat.inFlowHost === true || cat.inRegion === true);

      await ctx.close();


      /* 명시 설정이 auto 판단을 이긴다 */
      for (const [mode, expectCss] of [["static", "static"], ["fixed", "fixed"], ["sticky", "sticky"]]) {

        const skin = skinWith({ bottomDock: { position: mode } });
        const { ctx: c2, page: p2 } = await newPage(desktop, { skin });

        await gotoAndSettle(p2, `${base}/${SLUG}`);
        const d = await readDock(p2);

        check(
          `명시한 position="${mode}" 이 auto 판단보다 우선한다`,
          d.position === mode && d.cssPosition === expectCss,
          `${d.position}/${d.cssPosition}`
        );

        await c2.close();
      }
    }


    /* ------------------------------------------------- */

    if (section("padding")) {

      const { ctx, page } = await newPage(desktop);
      await gotoAndSettle(page, `${base}/${SLUG}`);

      const dock = await readDock(page);

      check("fixed dock 이면 문서에 여백 표식이 붙는다", dock.htmlHasDockClass === true);
      check(
        "dock 높이를 실측해 CSS 변수로 넘긴다",
        /^\d+px$/.test(dock.heightVar) && parseInt(dock.heightVar, 10) > 0,
        dock.heightVar
      );

      const padding = await page.evaluate(() => {
        const mount = document.getElementById("themeMount");
        return mount ? getComputedStyle(mount).paddingBottom : "";
      });

      check(
        "★ 스크롤 담당 요소 아래에 dock 높이만큼 자리가 생긴다",
        parseInt(padding, 10) >= parseInt(dock.heightVar, 10),
        `${padding} >= ${dock.heightVar}`
      );

      /* static dock 에는 그 여백이 필요 없다 */
      await ctx.close();

      const { ctx: c2, page: p2 } = await newPage(desktop, {
        skin: skinWith({ bottomDock: { position: "static" } })
      });
      await gotoAndSettle(p2, `${base}/${SLUG}`);

      const d2 = await readDock(p2);

      check("흐름 dock 에는 그 여백이 붙지 않는다", d2.htmlHasDockClass === false);

      await c2.close();
    }


    /* ------------------------------------------------- */

    if (section("collapse")) {

      const { ctx, page } = await newPage(desktop);
      await gotoAndSettle(page, `${base}/${SLUG}`);

      let dock = await readDock(page);

      check("기본은 펼친 상태", dock.state === "expanded" && dock.itemsHidden === false);
      check("트리거가 보인다", dock.triggerVisible === true);
      check("트리거는 상태를 읽히게 알린다", dock.triggerExpanded === "true", String(dock.triggerExpanded));

      await page.evaluate(() => {
        document.querySelector('[data-imory-dock="trigger"]').click();
      });
      await page.waitForTimeout(400);

      dock = await readDock(page);

      check("★ 눌러서 접힌다", dock.state === "collapsed");
      check("접히면 항목 덩어리가 사라진다", dock.itemsHidden === true, String(dock.itemsHidden));
      check("★ 접혀도 트리거는 남는다(다시 펼 수단)", dock.triggerVisible === true);
      check("트리거 상태도 바뀐다", dock.triggerExpanded === "false");

      /* 화면을 옮겨도 이 세션의 선택은 유지된다 */
      await page.evaluate((slug) => {
        const el = document.querySelector(`#themeMount .bd-cat[href="/${slug}/category/1"]`);
        if (el) el.click();
      }, SLUG);
      await page.waitForTimeout(900);

      dock = await readDock(page);

      check(
        "★ 화면을 옮겨도 접은 상태가 유지된다",
        dock.count === 1 && dock.state === "collapsed",
        `${dock.count}/${dock.state}`
      );

      await page.evaluate(() => {
        document.querySelector('[data-imory-dock="trigger"]').click();
      });
      await page.waitForTimeout(400);

      dock = await readDock(page);

      check("다시 펼쳐진다", dock.state === "expanded" && dock.itemsHidden === false);

      /* 새로고침하면 스킨이 정한 기본 상태로 돌아간다 */
      await gotoAndSettle(page, `${base}/${SLUG}`);
      dock = await readDock(page);

      check("새로고침하면 스킨이 정한 기본 상태", dock.state === "expanded");

      await ctx.close();


      /* defaultState: collapsed */
      const { ctx: c2, page: p2 } = await newPage(desktop, {
        skin: skinWith({ bottomDock: { defaultState: "collapsed" } })
      });
      await gotoAndSettle(p2, `${base}/${SLUG}`);

      const d2 = await readDock(p2);

      check("defaultState:collapsed 면 접힌 채로 시작한다", d2.state === "collapsed");
      check("그때도 트리거는 보인다", d2.triggerVisible === true);

      await c2.close();


      /* collapsible:false — 접을 수 없다 */
      const { ctx: c3, page: p3 } = await newPage(desktop, {
        skin: skinWith({ bottomDock: { collapsible: false } })
      });
      await gotoAndSettle(p3, `${base}/${SLUG}`);

      const d3 = await readDock(p3);

      check("collapsible:false 면 트리거가 없다", d3.triggerVisible === false);
      check("그때는 언제나 펼친 상태", d3.state === "expanded");

      await c3.close();
    }


    /* ------------------------------------------------- */

    if (section("actions")) {

      const { ctx, page } = await newPage(desktop);
      await gotoAndSettle(page, `${base}/${SLUG}`);

      await clickDockItem(page, "pair");

      let dock = await readDock(page);

      check("★ open 항목은 dock 에 패널 상태를 남긴다", dock.open === "pair", String(dock.open));

      await clickDockItem(page, "pair");
      dock = await readDock(page);

      check("한 번 더 누르면 닫힌다", dock.open === null, String(dock.open));

      /* navigate — 기존 SPA 라우터로 나간다(문서를 다시 읽지 않는다) */
      await page.evaluate(() => { window.__imoryDidReload = true; });

      await clickDockItem(page, "diary");
      await page.waitForTimeout(900);

      const after = await page.evaluate(() => ({
        url: location.pathname,
        stillSame: window.__imoryDidReload === true
      }));

      check(
        "★ dock 의 navigate 는 기존 SPA 라우터를 탄다(전체 새로고침 없음)",
        after.url === `/${SLUG}/category/1` && after.stillSame === true,
        JSON.stringify(after)
      );

      /* top — 스크롤 담당 요소를 맨 위로 */
      await page.evaluate(() => {
        const area = document.getElementById("postArea");
        if (area) area.scrollTop = 400;
      });
      await page.waitForTimeout(150);

      await clickDockItem(page, "top");
      await page.waitForTimeout(700);

      const scrollTop = await page.evaluate(() => {
        const area = document.getElementById("postArea");
        return area ? Math.round(area.scrollTop) : -1;
      });

      check("맨 위로 항목이 실제로 올린다", scrollTop <= 4, String(scrollTop));

      await ctx.close();
    }


    /* ------------------------------------------------- */

    if (section("screens")) {

      const { ctx, page } = await newPage(desktop);

      const countDocks = () => page.evaluate(
        () => document.querySelectorAll("[data-imory-dock-position]").length
      );

      await gotoAndSettle(page, `${base}/${SLUG}`);
      check("HOME — dock 하나", (await countDocks()) === 1);

      await page.evaluate((slug) => {
        document.querySelector(`#themeMount .bd-cat[href="/${slug}/category/1"]`).click();
      }, SLUG);
      await page.waitForTimeout(900);
      check("CATEGORY — 여전히 하나(옛 dock 이 남지 않는다)", (await countDocks()) === 1);

      await page.evaluate(() => {
        const area = document.getElementById("postArea");
        const link = area.querySelector(".bd-post");
        if (link) link.click();
      });
      await page.waitForTimeout(1100);
      check("POST — 여전히 하나", (await countDocks()) === 1);

      await page.goBack();
      await page.waitForTimeout(900);
      check("뒤로가기 — 여전히 하나", (await countDocks()) === 1);

      await page.goBack();
      await page.waitForTimeout(900);
      check(
        "★ HOME 복귀 — HOME 의 dock 이 다시 그려지고 하나뿐이다",
        (await countDocks()) === 1,
        String(await countDocks())
      );

      /* 직접 접속 · 새로고침 */
      await gotoAndSettle(page, `${base}/${SLUG}/category/1`);
      check("CATEGORY 직접 접속 — 하나", (await countDocks()) === 1);

      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(900);
      check("새로고침 — 하나", (await countDocks()) === 1);

      await ctx.close();
    }


    /* ------------------------------------------------- */

    if (section("owner")) {

      const { ctx, page } = await newPage(desktop, { signedInAs: OWNER_ID });
      await gotoAndSettle(page, `${base}/${SLUG}`);

      const dock = await readDock(page);

      check(
        "★ 주인장에게는 주인장 전용 항목이 있다",
        dock.ids && dock.ids.includes("write"),
        dock.ids && dock.ids.join(",")
      );

      check(
        "그 항목의 주소는 Context 가 만든 작성 주소다",
        (dock.hrefs[dock.ids.indexOf("write")] || "").includes("write=1"),
        dock.hrefs.join(" ")
      );

      await ctx.close();


      /* 다른 사람으로 로그인해도 방문자다 */
      const { ctx: c2, page: p2 } = await newPage(desktop, { signedInAs: OTHER_ID });
      await gotoAndSettle(p2, `${base}/${SLUG}`);

      const d2 = await readDock(p2);

      check(
        "다른 사용자에게는 주인장 항목이 없다",
        d2.ids && !d2.ids.includes("write"),
        d2.ids && d2.ids.join(",")
      );

      check(
        "★ 응답과 DOM 어디에도 주인장 전용 주소가 없다",
        !(await p2.content()).includes("write=1")
      );

      await c2.close();
    }


    /* ------------------------------------------------- */

    if (section("skin")) {

      const { ctx, page } = await newPage(desktop, { skin: SKIN_OWN_DOCK });
      await gotoAndSettle(page, `${base}/${SLUG}`);

      const dock = await readDock(page);

      const own = await page.evaluate(() => ({
        hasMyDock: !!document.querySelector(".my-dock"),
        hasDefault: !!document.querySelector(".imory-dock-items"),
        panelShown: (() => {
          const p = document.querySelector(".my-panel");
          return p ? getComputedStyle(p).display !== "none" : null;
        })()
      }));

      check("★ 스킨이 그린 dock 이 쓰인다", own.hasMyDock === true);
      check("플랫폼 기본 template 은 쓰이지 않는다", own.hasDefault === false);

      check(
        "★ 스킨이 그린 bottom-dock region 자리에 들어간다",
        dock.inRegion === true,
        `region=${dock.inRegion} flow=${dock.inFlowHost}`
      );

      check("스킨의 dock 도 항목 표식을 받는다", dock.ids.length === 4, dock.ids.join(","));
      check("스킨의 트리거가 인식된다", dock.triggerVisible === true);

      check("패널은 닫혀 있다", own.panelShown === false);

      await clickDockItem(page, "pair");

      const opened = await page.evaluate(() => {
        const p = document.querySelector(".my-panel");
        return p ? getComputedStyle(p).display !== "none" : null;
      });

      check(
        "★ 패널 모양은 스킨 CSS 가 정한다(플랫폼은 상태만 바꾼다)",
        opened === true
      );

      await ctx.close();


      /*
        ★ fixed dock 에서도 같은 CSS 가 동작하는가.

        fixed 일 때 dock 루트는 document.body 의 플랫폼 자리에 있어
        스킨 루트의 **자손이 아니다**. 그래서 상태 속성을 그냥
        `[data-imory-dock-open]` 으로 받으면(= scope class 가 앞에
        붙어 자손을 요구하면) region 에 놓였을 때만 우연히 동작하고
        fixed 에서는 조용히 안 먹는다. `:root[...]` 형태가 맞다는
        것을 여기서 못박는다.
      */

      const fixedOwnDock =
        JSON.parse(JSON.stringify(SKIN_OWN_DOCK));

      fixedOwnDock.bottomDock.position = "fixed";

      /* region 을 지워 플랫폼 자리(body)로 가게 한다 */
      fixedOwnDock.templates.home.html =
        fixedOwnDock.templates.home.html.replace(
          '<div class="bd-dock-slot" data-imory-region="bottom-dock"></div>',
          ""
        );

      const { ctx: cf, page: pf } = await newPage(desktop, { skin: fixedOwnDock });

      await gotoAndSettle(pf, `${base}/${SLUG}`);

      const fixedDock = await readDock(pf);

      check(
        "fixed 로 놓였다(전제)",
        fixedDock.inFixedHost === true && fixedDock.inRegion === false,
        JSON.stringify({ fixed: fixedDock.inFixedHost, region: fixedDock.inRegion })
      );

      await clickDockItem(pf, "pair");

      check(
        "★ 스킨 루트 밖(body)에 떠 있는 fixed dock 에서도 패널 CSS 가 먹는다",
        await pf.evaluate(() => {
          const p = document.querySelector(".my-panel");
          return p ? getComputedStyle(p).display !== "none" : null;
        })
      );

      await cf.close();


      /*
        region + auto 조합 — auto 는 화면이 드러난 뒤 자리를 다시
        정하면서 dock 루트를 **옮긴다**. 그 뒤 화면을 옮길 때
        옛 루트가 스킨의 region 안에 남지 않는가.
      */

      const autoRegionSkin =
        JSON.parse(JSON.stringify(SKIN_OWN_DOCK));

      autoRegionSkin.bottomDock.position = "auto";

      /* CATEGORY 에도 같은 자리를 그려 둔다 */
      autoRegionSkin.templates.category = {
        html:
          BASE_TEMPLATES.category.html.replace(
            "</div>",
            '<div class="bd-dock-slot" data-imory-region="bottom-dock"></div></div>'
          )
      };

      const { ctx: c2, page: p2 } = await newPage(desktop, { skin: autoRegionSkin });

      await gotoAndSettle(p2, `${base}/${SLUG}`);

      const countDocks2 = () => p2.evaluate(
        () => document.querySelectorAll("[data-imory-dock-position]").length
      );

      check("region + auto — HOME 에 dock 하나", (await countDocks2()) === 1);

      await p2.evaluate((slug) => {
        document.querySelector(`#themeMount .bd-cat[href="/${slug}/category/1"]`).click();
      }, SLUG);
      await p2.waitForTimeout(1200);

      check(
        "★ region 안으로 옮겨 간 dock 도 화면을 떠날 때 없어진다",
        (await countDocks2()) === 1,
        String(await countDocks2())
      );

      await p2.goBack();
      await p2.waitForTimeout(1000);

      check("HOME 복귀에도 하나", (await countDocks2()) === 1, String(await countDocks2()));

      await c2.close();
    }


    /* ------------------------------------------------- */

    if (section("mobile")) {

      const { ctx, page } = await newPage(mobile);
      await gotoAndSettle(page, `${base}/${SLUG}`);

      const dock = await readDock(page);

      check("모바일에도 dock 이 하나", dock.count === 1);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );

      check("390px 가로 넘침 없음", overflow <= 0, String(overflow));

      const hit = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll("[data-imory-dock-item]"));
        return els.map(el => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height)];
        });
      });

      check(
        "★ 모든 항목의 터치 영역이 44px 이상",
        hit.every(([w, h]) => w >= 44 && h >= 44),
        JSON.stringify(hit)
      );

      const dockWidth = await page.evaluate(() => {
        const root = document.querySelector("[data-imory-dock-position]");
        return Math.round(root.getBoundingClientRect().width);
      });

      check("dock 이 뷰포트보다 넓지 않다", dockWidth <= 390, String(dockWidth));

      await ctx.close();
    }


    /* ------------------------------------------------- */

    if (section("none")) {

      const { ctx, page } = await newPage(desktop, { skin: SKIN_NO_DOCK });
      await gotoAndSettle(page, `${base}/${SLUG}`);

      const count = await page.evaluate(
        () => document.querySelectorAll("[data-imory-dock-position]").length
      );

      check("★ dock 설정이 없는 스킨에는 dock 이 없다", count === 0, String(count));

      check(
        "플랫폼이 만든 자리도 생기지 않는다",
        await page.evaluate(() => !document.getElementById("imoryBottomDockFixed"))
      );

      check(
        "문서에 여백 표식도 붙지 않는다",
        await page.evaluate(
          () => !document.documentElement.classList.contains("imory-has-bottom-dock")
        )
      );

      check(
        "스킨 화면 자체는 그대로 그려진다(회귀)",
        await page.evaluate(() => !!document.querySelector(".bd-home .bd-title"))
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
