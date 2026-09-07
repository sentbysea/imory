/* =========================================================
   BANNER 페이지 스킨 + 소유자 링크 — 공개 화면 E2E 테스트 (PHASE 1E)

   목적: "배너 화면만 legacy로 남아 HOME/CATEGORY/POST와 프레임이
   다르다"와 "스킨에는 글쓰기/관리 진입점이 없다" 두 가지를,
   단순화한 상자가 아니라 실제 index.html + posts.html + 실제 CSS +
   실제 SkinPackage(skin/test-skins/imory-quiet-frame-v2.json)로
   검증한다.

   skin/skin-published-frame-e2e-test.mjs와 같은 방식/같은 규약을
   따른다(정적 서버 + Supabase 네트워크만 mock + 실제 저장소 파일).
   그 파일이 HOME/CATEGORY/POST를 담당하므로 여기서는 겹치는
   검증을 반복하지 않고 BANNER와 viewer(WRITE/ADMIN), 그리고 네
   화면의 소유자 진입 계약(PHASE 1E 후속: CATEGORY/POST의 관리
   진입과 스킨 복귀)에 집중한다.

   ★ 무엇을 mock하는가
   Supabase REST/RPC 응답과, 로그인 상태(supabase-js 클라이언트의
   auth.getSession/getUser)뿐이다. HTML/CSS/JS는 저장소의 실제
   파일을 그대로 정적 서빙한다. 배너 이미지는 실제 픽셀 크기를
   재야 하므로 작은 PNG를 라우트로 만들어 준다.

   ★ 실행 방법
     node skin/skin-banner-page-e2e-test.mjs
     node skin/skin-banner-page-e2e-test.mjs --browser=webkit
     node skin/skin-banner-page-e2e-test.mjs --keep-shots
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
const PORT = 8935;
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
const KEEP_SHOTS = args.includes("--keep-shots");
const SHOT_DIR = path.join(os.tmpdir(), "imory-banner-e2e-shots");


/* =========================================================
   playwright 찾기 — skin-published-frame-e2e-test.mjs와 동일한
   전략(설치된 여러 버전 중 실제로 spawn되는 것을 고른다).
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
   실제 저장소를 그대로 서빙 (_redirects의 SPA fallback 포함)
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
   SkinPackage — 이번 작업의 산출물 그대로(templates.banner 포함).
   BANNER_LESS_SKIN은 같은 파일에서 banner만 떼어낸 것으로,
   "배너 template이 없는 기존 스킨은 legacy 배너로 폴백"을
   같은 조건에서 대조 검증하기 위한 대조군이다.
========================================================== */

const SKIN_PACKAGE = JSON.parse(
  fs.readFileSync(
    path.join(HERE, "test-skins", "imory-quiet-frame-v2.json"),
    "utf8"
  )
);

const BANNER_LESS_SKIN = {
  ...SKIN_PACKAGE,
  templates: {
    home: SKIN_PACKAGE.templates.home,
    category: SKIN_PACKAGE.templates.category,
    post: SKIN_PACKAGE.templates.post
  }
};

/* HOME template만 가진 스킨 — CATEGORY/POST/BANNER 전부 legacy로
   폴백해야 한다("템플릿 없는 기존 스킨" 대조군). */
const HOME_ONLY_SKIN = {
  ...SKIN_PACKAGE,
  templates: {
    home: SKIN_PACKAGE.templates.home
  }
};

/* 40x12 PNG — 프레임(수백 px)보다 훨씬 작아서 "작은 배너를 강제로
   확대하지 않는다"와 "원본 비율을 유지한다"를 실제 픽셀로 확인할 수
   있다. 외부 자산을 저장소에 추가하지 않으려고 여기서 직접
   인코딩한다(zlib만 사용, 의존 패키지 없음). */

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
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 2;   /* color type: truecolor */
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; /* filter: none */
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

const SMALL_PNG_WIDTH = 40;
const SMALL_PNG_HEIGHT = 12;
const SMALL_PNG = makePng(SMALL_PNG_WIDTH, SMALL_PNG_HEIGHT, [180, 190, 200]);

const DB = {
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
    { id: 2, user_id: OWNER_ID, name: "링크", type: "banner", sort_order: 2 },
    { id: 3, user_id: OWNER_ID, name: "빈배너", type: "banner", sort_order: 3 }
  ],
  posts: [
    { id: 101, user_id: OWNER_ID, category_id: 1, title: "첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", quote_preset_id: null },
    { id: 102, user_id: OWNER_ID, category_id: 1, title: "비밀 글", content_type: "text", visibility: "secret", created_at: "2026-09-02T02:00:00Z", quote_preset_id: null }
  ],
  post_contents: [
    { post_id: 101, content: "첫 번째 글 본문입니다." }
  ],
  banners: [
    { id: 1, user_id: OWNER_ID, category_id: 2, name: "작은 배너", url: "https://friend.example/", image_url: "https://img.example/small.png", image_path: null, sort_order: 1 },
    { id: 2, user_id: OWNER_ID, category_id: 2, name: "위험한 배너", url: "javascript:alert(1)", image_url: "https://img.example/small.png", image_path: null, sort_order: 2 }
  ],
  quote_presets: [],
  /* 이 계정은 실제로 published Skin이 있는 상태다 — 이 row가 없으면
     home/home-skin-prompt.js가 소유자에게 "꾸미기 유도" 오버레이를 띄워
     실제 사용 상황과 다른 화면이 된다. */
  skins: [
    { id: 1, user_id: OWNER_ID, is_active: true }
  ]
};

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function queryTable(table, params) {
  let rows = (DB[table] || []).map(r => ({ ...r }));

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
  const { skin = SKIN_PACKAGE, failWhen = null } = opts;

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (failWhen && failWhen(url.pathname + url.search)) {
      return route.fulfill({
        status: 500, headers, contentType: "application/json",
        body: JSON.stringify({ message: "mock failure", code: "MOCKFAIL" })
      });
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

  await page.route("https://img.example/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: SMALL_PNG })
  );

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
   로그인 상태 mock

   supabase-js의 세션 저장 포맷(localStorage 키/인코딩)은 버전마다
   달라질 수 있으므로 그 내부 구조에 의존하지 않는다 — CDN 번들이
   window.supabase에 대입되는 순간을 가로채 createClient를 감싸고,
   만들어진 클라이언트의 auth.getSession/getUser만 고정 값으로
   바꾼다. 제품 코드는 두 함수 중 하나만 쓰므로(skin-context.js는
   getSession, posts-state.js의 getSignedInUser는 getUser) 둘 다
   같은 사용자로 맞춰 실제 로그인 상태와 동일하게 만든다.
========================================================== */

async function installSignedInUser(page, userId) {
  await page.addInitScript((id) => {
    let stored;
    Object.defineProperty(window, "supabase", {
      configurable: true,
      get() {
        return stored;
      },
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
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function sameFrame(a, b) {
  return a && b &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5;
}

const VIEWPORTS = {
  "mobile-390": { width: 390, height: 844 },
  "desktop-1280": { width: 1280, height: 900 }
};

let playwright;

async function launchBrowser(playwright, browserName) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await playwright[browserName].launch();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  throw lastError;
}

async function withPage(viewport, opts, fn) {
  const browser = await launchBrowser(playwright, BROWSER);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  let reloads = -1;
  page.on("load", () => { reloads++; });
  if (opts.signedInAs) {
    await installSignedInUser(page, opts.signedInAs);
  }
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

async function shot(page, name) {
  if (!KEEP_SHOTS) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}


/* 화면에 실제로 보이는 Skin 인스턴스의 최외곽 테두리 요소를 잰다
   (skin-published-frame-e2e-test.mjs의 MEASURE와 같은 원칙 —
   특정 클래스명이 아니라 "테두리를 가진 첫 요소"). */
const MEASURE = `(() => {
  function box(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: +r.x.toFixed(1), y: +r.y.toFixed(1),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      padding: cs.padding
    };
  }

  const area = document.getElementById("postArea");
  const areaOpen = Boolean(area) && !area.hidden;
  const scope = areaOpen ? area : document.getElementById("themeMount");

  let root = null;
  if (scope) {
    for (const el of scope.querySelectorAll(".imory-skin-root")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { root = el; break; }
    }
  }

  let frame = null;
  if (root) {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0) {
        frame = el;
        break;
      }
    }
  }

  return {
    screen: areaOpen
      ? (document.getElementById("postSkinContainer") &&
         !document.getElementById("postSkinContainer").hidden ? "post" : "category")
      : "home",
    hasSkin: Boolean(root),
    frame: box(frame),
    postArea: box(area),
    postAreaClasses: area ? area.className : null,
    postContainerClasses: document.getElementById("postContainer")
      ? document.getElementById("postContainer").className : null,
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  };
})()`;


/* ---------------------------------------------------------
   1) HOME → BANNER: 같은 프레임, legacy 헤더/여백 중복 없음
--------------------------------------------------------- */

async function testBannerFrame(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] HOME → BANNER 프레임 일치`);

  await withPage(vp, {}, async (page, ctx) => {
    await gotoHome(page);
    const home = await page.evaluate(MEASURE);
    await shot(page, `${vpName}-home`);

    await page.click('#themeMount a[href$="/category/2"]');
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(600);
    const banner = await page.evaluate(MEASURE);
    await shot(page, `${vpName}-banner`);

    check(`[${vpName}] BANNER가 Skin으로 렌더됨`,
      banner.hasSkin, `hasSkin=${banner.hasSkin}`);

    check(`[${vpName}] BANNER 프레임이 HOME과 동일 좌표/폭`,
      sameFrame(home.frame, banner.frame),
      `home=${JSON.stringify(home.frame && [home.frame.x, home.frame.y, home.frame.w])} ` +
      `banner=${JSON.stringify(banner.frame && [banner.frame.x, banner.frame.y, banner.frame.w])}`);

    check(`[${vpName}] legacy 헤더/외곽 여백이 중복되지 않음(mount contract 클래스)`,
      banner.postArea && banner.postArea.padding === "0px" &&
      banner.postContainerClasses.includes("post-container--skin-active") &&
      banner.postAreaClasses.includes("post-area--skin-active"),
      `padding=${banner.postArea && banner.postArea.padding} container="${banner.postContainerClasses}"`);

    const legacyUi = await page.evaluate(() => {
      const grid = document.getElementById("bannerGrid");
      const toggle = document.getElementById("bannerEditToggleButton");
      const list = document.getElementById("postList");
      return {
        gridHidden: !grid || grid.hidden,
        toggleHidden: !toggle || toggle.hidden,
        listVisible: Boolean(list) && !list.hidden,
        header: document.querySelector(".post-header")
          ? getComputedStyle(document.querySelector(".post-header")).display
          : "none"
      };
    });

    check(`[${vpName}] legacy 배너 그리드/편집 토글이 감춰지고 Skin만 보임`,
      legacyUi.gridHidden && legacyUi.toggleHidden && legacyUi.listVisible &&
      legacyUi.header === "none",
      JSON.stringify(legacyUi));

    check(`[${vpName}] 가로 넘침 없음`,
      banner.docScrollWidth <= banner.innerWidth + 1,
      `scrollWidth=${banner.docScrollWidth} innerWidth=${banner.innerWidth}`);

    check(`[${vpName}] BANNER 이동이 문서 전체 재로드를 일으키지 않음`,
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    /* 뒤로가기 → HOME */
    await page.goBack();
    await page.waitForTimeout(1000);
    const back = await page.evaluate(MEASURE);

    check(`[${vpName}] BANNER에서 뒤로가기 → HOME 프레임 복원`,
      back.screen === "home" && sameFrame(home.frame, back.frame),
      `screen=${back.screen}`);

    check(`[${vpName}] 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   2) 배너 항목 — 세로 목록 / 원본 비율 / 확대 금지 / 안전하지 않은 링크
--------------------------------------------------------- */

async function testBannerItems(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 배너 항목(세로 목록/비율/URL 안전)`);

  await withPage(vp, {}, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll(".quiet-banner-image")].every(i => i.complete),
      null,
      { timeout: 15000 }
    );
    await page.waitForTimeout(300);

    const items = await page.evaluate(() =>
      [...document.querySelectorAll(".quiet-banner-item")].map(li => {
        const link = li.querySelector("a");
        const img = li.querySelector("img");
        const name = li.querySelector(".quiet-banner-name");
        const r = li.getBoundingClientRect();
        return {
          href: link ? link.getAttribute("href") : null,
          name: name ? name.textContent : null,
          imgHidden: img ? img.hidden : null,
          naturalW: img ? img.naturalWidth : null,
          renderedW: img ? +img.getBoundingClientRect().width.toFixed(1) : null,
          renderedH: img ? +img.getBoundingClientRect().height.toFixed(1) : null,
          top: +r.top.toFixed(1),
          left: +r.left.toFixed(1)
        };
      })
    );

    check(`[${vpName}] 직접 URL 접속으로도 배너 2개가 Skin으로 렌더됨`,
      items.length === 2, `count=${items.length}`);

    check(`[${vpName}] 세로 목록(두 항목의 left는 같고 top은 아래로 내려감)`,
      items.length === 2 && items[0].left === items[1].left && items[1].top > items[0].top,
      JSON.stringify(items.map(i => [i.left, i.top])));

    check(`[${vpName}] 안전한 https 배너는 링크가 살아 있음`,
      items[0].href === "https://friend.example/", `href=${items[0].href}`);

    check(`[${vpName}] javascript: 배너는 href 자체가 없어 아무 데도 이동하지 않음(이름은 남음)`,
      items[1].href === null && items[1].name === "위험한 배너",
      `href=${items[1].href} name=${items[1].name}`);

    /* 렌더 크기에는 스킨이 준 1px 테두리가 양쪽으로 포함된다
       (.quiet-page *에 box-sizing: border-box) — 실제 이미지 픽셀
       크기는 그 2px를 뺀 값이다. */
    const contentW = items[0].renderedW - 2;
    const contentH = items[0].renderedH - 2;

    check(`[${vpName}] 작은 배너를 확대하지 않음(렌더된 이미지 폭 === 원본 폭 ${SMALL_PNG_WIDTH}px)`,
      items[0].naturalW === SMALL_PNG_WIDTH && contentW === SMALL_PNG_WIDTH,
      `natural=${items[0].naturalW} rendered=${items[0].renderedW}(content ${contentW})`);

    check(`[${vpName}] 원본 비율 유지(${SMALL_PNG_WIDTH}x${SMALL_PNG_HEIGHT})`,
      contentH === SMALL_PNG_HEIGHT, `h=${items[0].renderedH}(content ${contentH})`);

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      area: document.getElementById("postArea").scrollWidth,
      areaClient: document.getElementById("postArea").clientWidth
    }));

    check(`[${vpName}] 배너 목록이 가로로 넘치지 않음`,
      overflow.doc <= overflow.inner + 1 && overflow.area <= overflow.areaClient + 1,
      JSON.stringify(overflow));

    check(`[${vpName}] 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   3) 빈 배너 카테고리 / 조회 실패 / 배너 template 없는 기존 스킨
--------------------------------------------------------- */

async function testBannerEdgeCases(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 빈 목록 / 조회 실패 / 기존 스킨 폴백`);

  /* 빈 배너 카테고리 — Skin이 자기 CSS로 안내 문구를 보여준다 */
  await withPage(vp, {}, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/3`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(400);

    /* HOME Skin이 #themeMount에 그대로 남아 있으므로 반드시 #postList
       안(지금 열린 화면)으로 범위를 좁혀서 읽는다. */
    const empty = await page.evaluate(() => {
      const list = document.querySelector("#postList .quiet-banner-list");
      const eyebrow = document.querySelector("#postList .quiet-eyebrow");
      return {
        exists: Boolean(list),
        children: list ? list.children.length : -1,
        note: list ? getComputedStyle(list, "::after").content : null,
        eyebrow: eyebrow ? eyebrow.textContent : null
      };
    });

    check(`[${vpName}] 빈 배너 카테고리도 Skin 프레임 안에서 열리고 카테고리 이름이 나온다`,
      empty.exists && empty.children === 0 && empty.eyebrow === "빈배너",
      JSON.stringify(empty));

    check(`[${vpName}] 빈 목록 안내 문구가 표시됨`,
      typeof empty.note === "string" && empty.note.includes("등록된 배너가 없습니다"),
      `note=${empty.note}`);

    check(`[${vpName}] 빈 목록에서 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* 카테고리 단건 조회 실패 → context null → legacy 배너로 폴백 */
  await withPage(vp, {
    failWhen: p => p.startsWith("/rest/v1/categories") && p.includes("id=eq.2")
  }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(900);

    const state = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      return {
        skinInList: Boolean(document.querySelector("#postList .imory-skin-root")),
        areaClasses: area.className,
        containerClasses: document.getElementById("postContainer").className,
        bodyText: document.body.innerText.slice(0, 200)
      };
    });

    check(`[${vpName}] 배너 조회 실패 시 Skin을 억지로 그리지 않고 legacy로 폴백`,
      !state.skinInList &&
      !state.areaClasses.includes("post-area--skin-active") &&
      !state.containerClasses.includes("post-container--skin-active"),
      JSON.stringify(state).slice(0, 220));

    check(`[${vpName}] 실패 경로에서도 페이지가 죽지 않음(콘솔 예외 없음)`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* templates.banner가 없는 기존 스킨 → legacy 배너 화면 */
  await withPage(vp, { skin: BANNER_LESS_SKIN }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(900);

    const state = await page.evaluate(() => {
      const grid = document.getElementById("bannerGrid");
      const area = document.getElementById("postArea");
      return {
        gridVisible: Boolean(grid) && !grid.hidden,
        cards: document.querySelectorAll(".banner-card").length,
        skinInList: Boolean(document.querySelector("#postList .imory-skin-root")),
        areaClasses: area.className,
        title: (document.getElementById("postPageTitle") || {}).textContent
      };
    });

    check(`[${vpName}] 배너 template 없는 기존 스킨은 legacy 배너 화면으로 폴백`,
      state.gridVisible && state.cards === 2 && !state.skinInList &&
      !state.areaClasses.includes("post-area--skin-active") &&
      state.title === "링크",
      JSON.stringify(state));

    check(`[${vpName}] 폴백 경로에서 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   4) WRITE / ADMIN — 소유자에게만 보이고 실제로 진입된다
--------------------------------------------------------- */

async function testOwnerLinks(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] WRITE / ADMIN 노출 및 진입`);

  const readOwnerLinks = () => `(() => {
    const wrap = document.querySelector(".quiet-owner-links");
    const links = [...document.querySelectorAll(".quiet-owner-link")];
    return {
      exists: Boolean(wrap),
      visible: Boolean(wrap) && !wrap.hidden && getComputedStyle(wrap).display !== "none",
      hrefs: links.map(a => a.getAttribute("href")),
      texts: links.map(a => a.textContent)
    };
  })()`;

  /* 로그아웃 방문자 */
  await withPage(vp, {}, async page => {
    await gotoHome(page);
    const links = await page.evaluate(readOwnerLinks());

    check(`[${vpName}] 로그아웃 방문자에게는 WRITE/ADMIN이 보이지 않음`,
      links.exists && !links.visible && links.hrefs.every(h => h === null),
      JSON.stringify(links));
  });

  /* 다른 계정으로 로그인한 방문자 */
  await withPage(vp, { signedInAs: OTHER_USER_ID }, async page => {
    await gotoHome(page);
    const links = await page.evaluate(readOwnerLinks());

    check(`[${vpName}] 다른 계정 방문자에게도 WRITE/ADMIN이 보이지 않음`,
      links.exists && !links.visible && links.hrefs.every(h => h === null),
      JSON.stringify(links));

    const banner = await page.evaluate(() => Boolean(document.querySelector("#themeMount .imory-skin-root")));
    check(`[${vpName}] 다른 계정 방문자에게도 HOME Skin 자체는 정상 표시`, banner);
  });

  /* 소유자 본인 */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await gotoHome(page);
    await shot(page, `${vpName}-owner-home`);
    const links = await page.evaluate(readOwnerLinks());

    check(`[${vpName}] 소유자에게만 WRITE/ADMIN이 보임`,
      links.visible && links.texts.join("/") === "WRITE/ADMIN",
      JSON.stringify(links));

    check(`[${vpName}] 링크 주소가 하드코딩이 아니라 실제 경로로 채워짐(WRITE는 작성 진입 URL)`,
      links.hrefs[0] === `/${SLUG}/category/1?write=1` && links.hrefs[1] === "/admin/",
      JSON.stringify(links.hrefs));

    /* WRITE 클릭 → 옛 LOG 목록을 거치지 않고 곧장 작성 폼 */
    await page.click(".quiet-owner-link[href$='?write=1']");
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(500);

    const writeScreen = await page.evaluate(() => {
      const editor = document.getElementById("postEditor");
      const title = document.getElementById("postEditorTitle");
      const container = document.getElementById("postContainer");
      const header = document.querySelector(".post-header");
      return {
        url: location.pathname,
        search: location.search,
        editorVisible: Boolean(editor) && !editor.hidden &&
          getComputedStyle(editor).display !== "none",
        editorMode: document.body.classList.contains("post-editor-mode"),
        titleEditable: Boolean(title) && !title.disabled && !title.readOnly,
        legacyList: Boolean(document.querySelector("#postList .post-list-item")),
        listVisible: Boolean(document.getElementById("postList")) &&
          !document.getElementById("postList").hidden,
        skinInList: Boolean(document.querySelector("#postList .imory-skin-root")),
        skinActive: container.className.includes("post-container--skin-active"),
        ownerTools: container.className.includes("post-container--owner-tools"),
        headerPosition: header ? getComputedStyle(header).position : null,
        categoryValue: document.getElementById("postEditorCategory")
          ? document.getElementById("postEditorCategory").value : null
      };
    });

    check(`[${vpName}] WRITE는 옛 LOG 목록 없이 곧장 작성 폼을 연다`,
      writeScreen.editorVisible && writeScreen.editorMode && writeScreen.titleEditable &&
      !writeScreen.legacyList && !writeScreen.listVisible && !writeScreen.skinInList,
      JSON.stringify(writeScreen));

    check(`[${vpName}] WRITE 주소가 작성 화면과 일치한다(?write=1)`,
      writeScreen.url === `/${SLUG}/category/1` && writeScreen.search === "?write=1",
      JSON.stringify(writeScreen));

    check(`[${vpName}] 작성 폼은 스킨 mount contract를 벗고 legacy 프레임을 되찾는다`,
      !writeScreen.skinActive && !writeScreen.ownerTools &&
      writeScreen.headerPosition === "relative",
      JSON.stringify(writeScreen));

    check(`[${vpName}] 작성 폼의 카테고리가 WRITE가 정한 카테고리로 채워져 있다`,
      writeScreen.categoryValue === "1", String(writeScreen.categoryValue));

    check(`[${vpName}] WRITE 이동이 문서 전체 재로드를 일으키지 않음`,
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    await page.fill("#postEditorTitle", "WRITE 흐름 확인용 제목");

    const typed = await page.evaluate(() =>
      document.getElementById("postEditorTitle").value);

    check(`[${vpName}] 작성 폼에 실제로 입력할 수 있다`,
      typed === "WRITE 흐름 확인용 제목", `value="${typed}"`);

    check(`[${vpName}] 소유자 경로 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* ADMIN 링크는 관리 화면으로 실제 문서 이동한다(SPA 라우트가 아님) */
  await withPage(vp, { signedInAs: OWNER_ID }, async page => {
    await gotoHome(page);
    await page.click(".quiet-owner-link[href='/admin/']");
    await page.waitForURL("**/admin/", { timeout: 15000 });

    check(`[${vpName}] ADMIN 링크가 실제 관리 화면 주소로 이동`,
      new URL(page.url()).pathname === "/admin/", page.url());
  });
}


/* ---------------------------------------------------------
   4-b) 소유자의 BANNER 화면 (PHASE 1E)

   소유자도 방문자와 같은 배너 스킨을 본다. 배너 추가/수정은
   목록을 legacy로 되돌리지 않고 플랫폼이 소유한 진입점
   (+ 버튼 / EDIT 토글)에서 시작한다.
--------------------------------------------------------- */

const READ_BANNER_SCREEN = `(() => {
  const grid = document.getElementById("bannerGrid");
  const toggle = document.getElementById("bannerEditToggleButton");
  const add = document.getElementById("postAddButton");
  const editor = document.getElementById("bannerEditor");
  const list = document.getElementById("postList");
  const area = document.getElementById("postArea");
  return {
    skinItems: document.querySelectorAll("#postList .quiet-banner-item").length,
    skinVisible: Boolean(list) && !list.hidden,
    gridVisible: Boolean(grid) && !grid.hidden,
    gridCards: document.querySelectorAll("#bannerGrid .banner-card").length,
    editorVisible: Boolean(editor) && !editor.hidden,
    toggleVisible: Boolean(toggle) && !toggle.hidden,
    addVisible: Boolean(add) && !add.hidden,
    skinActive: area.className.includes("post-area--skin-active")
  };
})()`;

async function testOwnerBannerScreen(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 소유자의 BANNER 화면`);

  /* --- 소유자 --- */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(500);

    const initial = await page.evaluate(READ_BANNER_SCREEN);
    await shot(page, `${vpName}-owner-banner`);

    check(`[${vpName}] 소유자도 배너 목록을 Skin으로 본다(legacy 그리드 아님)`,
      initial.skinItems === 2 && initial.skinVisible && !initial.gridVisible && initial.skinActive,
      JSON.stringify(initial));

    check(`[${vpName}] 소유자 전용 진입점(+ / EDIT)이 Skin 위에 그대로 남아 있다`,
      initial.addVisible && initial.toggleVisible,
      JSON.stringify(initial));

    /* EDIT 토글 -> 관리 화면(순서/삭제/수정) */
    await page.click("#bannerEditToggleButton");
    await page.waitForTimeout(1000);

    const manage = await page.evaluate(READ_BANNER_SCREEN);

    check(`[${vpName}] EDIT를 누르면 관리 그리드가 열리고 실제 배너 카드가 들어 있다`,
      manage.gridVisible && manage.gridCards === 2 && !manage.skinVisible,
      JSON.stringify(manage));

    const controls = await page.evaluate(() => {
      const first = document.querySelector("#bannerGrid .banner-card");
      return {
        controlCount: document.querySelectorAll("#bannerGrid .banner-card-control").length,
        firstIsDiv: first ? first.tagName === "DIV" : null
      };
    });

    check(`[${vpName}] 관리 그리드에 순서/삭제 컨트롤이 있고 카드가 외부 링크가 아니다`,
      controls.controlCount === 6 && controls.firstIsDiv === true,
      JSON.stringify(controls));

    /* EDIT 다시 눌러 끄면 Skin 목록으로 복귀 */
    await page.click("#bannerEditToggleButton");
    await page.waitForTimeout(1500);

    const backToSkin = await page.evaluate(READ_BANNER_SCREEN);

    check(`[${vpName}] EDIT를 끄면 다시 Skin 목록으로 돌아온다(legacy로 굳지 않는다)`,
      backToSkin.skinItems === 2 && backToSkin.skinVisible &&
      !backToSkin.gridVisible && backToSkin.skinActive,
      JSON.stringify(backToSkin));

    /* + -> 배너 추가 폼 */
    await page.click("#postAddButton");
    await page.waitForTimeout(700);

    const form = await page.evaluate(() => {
      const editor = document.getElementById("bannerEditor");
      const heading = document.getElementById("bannerEditorHeading");
      const list = document.getElementById("postList");
      return {
        editorVisible: Boolean(editor) && !editor.hidden,
        heading: heading ? heading.textContent.trim() : null,
        skinVisible: Boolean(list) && !list.hidden
      };
    });

    check(`[${vpName}] + 를 누르면 기존 배너 추가 폼이 열리고 목록과 겹치지 않는다`,
      form.editorVisible && form.heading === "ADD BANNER" && !form.skinVisible,
      JSON.stringify(form));

    /* 폼 닫기 -> Skin 목록 복귀 */
    await page.click("#bannerEditorCancel");
    await page.waitForTimeout(1500);

    const afterCancel = await page.evaluate(READ_BANNER_SCREEN);

    check(`[${vpName}] 폼을 닫으면 Skin 목록으로 되돌아온다`,
      afterCancel.skinItems === 2 && afterCancel.skinVisible &&
      !afterCancel.editorVisible && !afterCancel.gridVisible,
      JSON.stringify(afterCancel));

    check(`[${vpName}] 소유자 배너 경로 전체에서 문서 재로드 없음`,
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    check(`[${vpName}] 소유자 배너 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 다른 계정으로 로그인한 방문자: 관리 진입점이 없어야 한다 --- */
  await withPage(vp, { signedInAs: OTHER_USER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(600);

    const visitor = await page.evaluate(READ_BANNER_SCREEN);

    check(`[${vpName}] 다른 계정 방문자: 배너는 Skin으로 보이지만 + / EDIT는 없다`,
      visitor.skinItems === 2 && !visitor.addVisible && !visitor.toggleVisible,
      JSON.stringify(visitor));

    /* post형 카테고리에서도 작성 진입점이 없어야 한다 */
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(600);

    const visitorPostCategory = await page.evaluate(() => {
      const add = document.getElementById("postAddButton");
      const editToggle = document.getElementById("postListEditToggleButton");
      return {
        addVisible: Boolean(add) && !add.hidden,
        editVisible: Boolean(editToggle) && !editToggle.hidden
      };
    });

    check(`[${vpName}] 다른 계정 방문자: post형 카테고리에도 글쓰기/편집 진입점이 없다`,
      !visitorPostCategory.addVisible && !visitorPostCategory.editVisible,
      JSON.stringify(visitorPostCategory));

    check(`[${vpName}] 비소유자 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 배너 template이 없는 스킨에서는 소유자가 기존 legacy 화면 --- */
  await withPage(vp, { skin: BANNER_LESS_SKIN, signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(1000);

    const legacy = await page.evaluate(READ_BANNER_SCREEN);

    check(`[${vpName}] 배너 template이 없으면 소유자도 기존 legacy 배너 화면 그대로(+ / EDIT 포함)`,
      legacy.gridVisible && legacy.gridCards === 2 && legacy.skinItems === 0 &&
      legacy.addVisible && legacy.toggleVisible && !legacy.skinActive,
      JSON.stringify(legacy));

    check(`[${vpName}] legacy 폴백 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   4-c) 소유자의 post형 CATEGORY 화면 (PHASE 1E 후속)

   소유자도 일반 카테고리 링크로 들어가면 방문자와 같은 CATEGORY
   스킨을 본다. 기존 관리 화면(추가 / 선택 삭제)은 명시적으로
   골랐을 때만 열리고, 닫으면 다시 스킨으로 돌아온다.
--------------------------------------------------------- */

const READ_CATEGORY_SCREEN = `(() => {
  const list = document.getElementById("postList");
  const area = document.getElementById("postArea");
  const container = document.getElementById("postContainer");
  const header = document.querySelector(".post-header");
  const add = document.getElementById("postAddButton");
  const editToggle = document.getElementById("postListEditToggleButton");
  const selectBar = document.getElementById("postListSelectBar");
  return {
    skinItems: document.querySelectorAll("#postList .quiet-post-item").length,
    legacyItems: document.querySelectorAll("#postList .post-list-item").length,
    listVisible: Boolean(list) && !list.hidden,
    skinActive: area.className.includes("post-area--skin-active"),
    ownerTools: container.className.includes("post-container--owner-tools"),
    headerDisplay: header ? getComputedStyle(header).display : null,
    headerPosition: header ? getComputedStyle(header).position : null,
    titleDisplay: document.querySelector(".post-page-title")
      ? getComputedStyle(document.querySelector(".post-page-title")).display : null,
    addVisible: Boolean(add) && !add.hidden,
    editVisible: Boolean(editToggle) && !editToggle.hidden,
    selectBarVisible: Boolean(selectBar) && !selectBar.hidden,
    areaPadding: getComputedStyle(area).padding
  };
})()`;

async function testOwnerCategoryScreen(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 소유자의 CATEGORY 화면`);

  /* --- 소유자: 일반 카테고리 링크 --- */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await gotoHome(page);
    const home = await page.evaluate(MEASURE);

    /* 스킨 메뉴의 평범한 카테고리 링크(?manage 없음) */
    await page.click('#themeMount .quiet-link-list a[href$="/category/1"]');
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(600);

    const skinView = await page.evaluate(READ_CATEGORY_SCREEN);
    const skinFrame = await page.evaluate(MEASURE);
    await shot(page, `${vpName}-owner-category`);

    check(`[${vpName}] 소유자도 일반 카테고리 링크로 들어가면 CATEGORY 스킨을 본다`,
      skinView.skinItems === 2 && skinView.legacyItems === 0 && skinView.skinActive,
      JSON.stringify(skinView));

    check(`[${vpName}] 소유자 CATEGORY 스킨 프레임이 HOME과 동일 좌표/폭`,
      sameFrame(home.frame, skinFrame.frame),
      `home=${JSON.stringify(home.frame && [home.frame.x, home.frame.y, home.frame.w])} ` +
      `category=${JSON.stringify(skinFrame.frame && [skinFrame.frame.x, skinFrame.frame.y, skinFrame.frame.w])}`);

    check(`[${vpName}] 스킨 상태에서 legacy 헤더 제목은 숨고 도구만 떠 있다`,
      skinView.ownerTools && skinView.headerPosition === "fixed" &&
      skinView.titleDisplay === "none" && skinView.areaPadding === "0px",
      JSON.stringify(skinView));

    check(`[${vpName}] 소유자 전용 진입점(+ / edit)이 스킨 위에 남아 있다`,
      skinView.addVisible && skinView.editVisible && !skinView.selectBarVisible,
      JSON.stringify(skinView));

    check(`[${vpName}] URL에는 관리 쿼리가 붙지 않는다(탐색과 관리 진입 구분)`,
      await page.evaluate(() => location.pathname + location.search) === `/${SLUG}/category/1`,
      await page.evaluate(() => location.pathname + location.search));

    /* edit → 기존 관리 화면 */
    await page.click("#postListEditToggleButton");
    await page.waitForTimeout(700);

    const manage = await page.evaluate(READ_CATEGORY_SCREEN);

    check(`[${vpName}] edit를 누르면 기존 관리 화면(선택 삭제 목록 + 선택 바)이 열린다`,
      manage.legacyItems === 2 && manage.skinItems === 0 &&
      manage.selectBarVisible && !manage.skinActive && !manage.ownerTools,
      JSON.stringify(manage));

    check(`[${vpName}] 관리 화면에서는 legacy 헤더/여백이 원래대로 돌아온다`,
      manage.headerPosition === "relative" && manage.titleDisplay !== "none" &&
      manage.areaPadding !== "0px",
      JSON.stringify(manage));

    const selectable = await page.evaluate(() => {
      const first = document.querySelector("#postList .post-list-item");
      return {
        isDiv: first ? first.tagName === "DIV" : null,
        hasCheckbox: Boolean(document.querySelector("#postList .post-list-check, #postList input[type=checkbox], #postList .post-list-select"))
      };
    });

    check(`[${vpName}] 관리 화면 항목이 선택 가능한 형태로 바뀐다(기능 삭제 없음)`,
      selectable.isDiv === true, JSON.stringify(selectable));

    /* edit 다시 → 스킨 복귀 */
    await page.click("#postListEditToggleButton");
    await page.waitForTimeout(1200);

    const backToSkin = await page.evaluate(READ_CATEGORY_SCREEN);

    check(`[${vpName}] 관리 화면을 닫으면 해당 카테고리 스킨으로 돌아온다`,
      backToSkin.skinItems === 2 && backToSkin.legacyItems === 0 &&
      backToSkin.skinActive && backToSkin.ownerTools && !backToSkin.selectBarVisible,
      JSON.stringify(backToSkin));

    /* 스킨 위의 + → 바로 작성 폼 */
    await page.click("#postAddButton");
    await page.waitForTimeout(800);

    const editor = await page.evaluate(() => {
      const el = document.getElementById("postEditor");
      const title = document.getElementById("postEditorTitle");
      return {
        editorVisible: Boolean(el) && !el.hidden,
        editorMode: document.body.classList.contains("post-editor-mode"),
        titleEditable: Boolean(title) && !title.disabled && !title.readOnly
      };
    });

    check(`[${vpName}] 스킨 위의 + 는 곧바로 기존 글 작성 폼을 연다`,
      editor.editorVisible && editor.editorMode && editor.titleEditable,
      JSON.stringify(editor));

    await page.fill("#postEditorTitle", "스킨에서 바로 쓴 글");

    check(`[${vpName}] 그 작성 폼에 실제로 입력할 수 있다`,
      await page.evaluate(() => document.getElementById("postEditorTitle").value) === "스킨에서 바로 쓴 글");

    check(`[${vpName}] 소유자 CATEGORY 경로 전체에서 문서 재로드 없음`,
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    check(`[${vpName}] 소유자 CATEGORY 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 관리 진입 URL 직접 접속 --- */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1?manage=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(1000);

    const direct = await page.evaluate(READ_CATEGORY_SCREEN);

    check(`[${vpName}] 소유자가 ?manage=1로 직접 들어오면 기존 관리 화면이 열린다`,
      direct.legacyItems === 2 && direct.skinItems === 0 && !direct.skinActive &&
      direct.addVisible && direct.editVisible,
      JSON.stringify(direct));

    check(`[${vpName}] 관리 진입 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 비소유자가 같은 관리 URL로 들어오면 그냥 스킨 --- */
  await withPage(vp, { signedInAs: OTHER_USER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1?manage=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(1000);

    const visitor = await page.evaluate(READ_CATEGORY_SCREEN);

    check(`[${vpName}] 다른 계정이 ?manage=1로 들어와도 관리 화면이 열리지 않고 스킨만 보인다`,
      visitor.skinItems === 2 && visitor.legacyItems === 0 && visitor.skinActive &&
      !visitor.ownerTools && !visitor.addVisible && !visitor.editVisible,
      JSON.stringify(visitor));

    check(`[${vpName}] 비소유자 관리 URL 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 로그아웃 방문자도 평소대로 스킨 --- */
  await withPage(vp, {}, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(500);

    const anon = await page.evaluate(READ_CATEGORY_SCREEN);

    check(`[${vpName}] 로그아웃 방문자: CATEGORY 스킨 + 도구 없음`,
      anon.skinItems === 2 && anon.skinActive && !anon.ownerTools &&
      !anon.addVisible && !anon.editVisible,
      JSON.stringify(anon));

    check(`[${vpName}] 방문자 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- CATEGORY template이 없는 스킨: 소유자도 방문자도 기존 legacy --- */
  await withPage(vp, { skin: HOME_ONLY_SKIN, signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(1000);

    const legacy = await page.evaluate(READ_CATEGORY_SCREEN);

    check(`[${vpName}] CATEGORY template이 없으면 소유자도 기존 legacy 목록 그대로`,
      legacy.legacyItems === 2 && legacy.skinItems === 0 && !legacy.skinActive &&
      !legacy.ownerTools && legacy.addVisible && legacy.editVisible &&
      legacy.headerPosition === "relative",
      JSON.stringify(legacy));

    check(`[${vpName}] legacy CATEGORY 폴백 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   4-d) 소유자의 POST 상세 화면 (PHASE 1E 후속)

   소유자도 일반 글 링크로 들어가면 방문자와 같은 POST 스킨으로
   읽는다. 수정/삭제는 스킨 위에 떠 있는 관리 토글로 기존 화면을
   명시적으로 열어야 하고, 편집을 끝내면(취소/저장) 다시 POST
   스킨으로 돌아온다.
--------------------------------------------------------- */

const READ_POST_SCREEN = `(() => {
  const skinBox = document.getElementById("postSkinContainer");
  const detail = document.getElementById("postDetail");
  const actions = document.getElementById("postDetailActions");
  const manage = document.getElementById("postManageToggleButton");
  const editor = document.getElementById("postEditor");
  const gate = document.getElementById("postSecretGate");
  const container = document.getElementById("postContainer");
  const area = document.getElementById("postArea");
  const header = document.querySelector(".post-header");
  const body = document.querySelector(".quiet-post-body");
  const title = document.querySelector(".quiet-article-title");
  return {
    skinVisible: Boolean(skinBox) && !skinBox.hidden,
    skinTitle: title ? title.textContent : null,
    skinBody: body ? body.innerText.trim() : null,
    legacyVisible: Boolean(detail) && !detail.hidden,
    legacyBody: document.getElementById("postDetailContent")
      ? document.getElementById("postDetailContent").innerText.trim() : null,
    actionsVisible: Boolean(actions) && !actions.hidden,
    manageVisible: Boolean(manage) && !manage.hidden,
    managePressed: manage ? manage.getAttribute("aria-pressed") : null,
    editorVisible: Boolean(editor) && !editor.hidden,
    gateVisible: Boolean(gate) && !gate.hidden,
    gateInSkin: Boolean(gate) && Boolean(skinBox) && skinBox.contains(gate),
    ownerTools: container.className.includes("post-container--owner-tools"),
    skinActive: area.className.includes("post-area--skin-active"),
    headerPosition: header ? getComputedStyle(header).position : null,
    titleDisplay: document.querySelector(".post-page-title")
      ? getComputedStyle(document.querySelector(".post-page-title")).display : null,
    url: location.pathname + location.search
  };
})()`;

async function testOwnerPostScreen(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 소유자의 POST 상세 화면`);

  /* --- 소유자: 일반 글 링크 → 스킨으로 읽기 → edit → 수정 폼 --- */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await gotoHome(page);
    const home = await page.evaluate(MEASURE);

    await page.click('#themeMount .quiet-link-list a[href$="/category/1"]');
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.click('#postList a[href$="/post/101"]');
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(600);

    const reading = await page.evaluate(READ_POST_SCREEN);
    const readingFrame = await page.evaluate(MEASURE);
    await shot(page, `${vpName}-owner-post`);

    check(`[${vpName}] 소유자도 일반 글 링크로 들어가면 POST 스킨으로 읽는다`,
      reading.skinVisible && !reading.legacyVisible &&
      (reading.skinBody || "").includes("첫 번째 글 본문") &&
      reading.skinTitle === "첫 번째 글",
      JSON.stringify(reading));

    check(`[${vpName}] 소유자 POST 스킨 프레임이 HOME과 동일 좌표/폭`,
      sameFrame(home.frame, readingFrame.frame),
      `home=${JSON.stringify(home.frame && [home.frame.x, home.frame.y, home.frame.w])} ` +
      `post=${JSON.stringify(readingFrame.frame && [readingFrame.frame.x, readingFrame.frame.y, readingFrame.frame.w])}`);

    check(`[${vpName}] 스킨 위에는 수정 진입점만 떠 있고 legacy 제목/수정 버튼은 없다`,
      reading.manageVisible && reading.managePressed === "false" &&
      reading.ownerTools && reading.headerPosition === "fixed" &&
      reading.titleDisplay === "none" && !reading.actionsVisible,
      JSON.stringify(reading));

    check(`[${vpName}] 읽기 주소에는 관리/수정 쿼리가 붙지 않는다`,
      reading.url === `/${SLUG}/post/101`, reading.url);

    const readingScroll = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      area.scrollTop = 120;
      return area.scrollTop;
    });

    /* 스킨 위의 edit → 옛 상세 화면 없이 곧장 수정 폼 */
    await page.click("#postManageToggleButton");
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(500);

    const editor = await page.evaluate(() => {
      const container = document.getElementById("postContainer");
      const del = document.getElementById("postEditorDeleteButton");
      return {
        editorVisible: !document.getElementById("postEditor").hidden,
        legacyVisible: !document.getElementById("postDetail").hidden,
        actionsVisible: !document.getElementById("postDetailActions").hidden,
        title: document.getElementById("postEditorTitle").value,
        editable: !document.getElementById("postEditorTitle").disabled,
        deleteVisible: Boolean(del) && !del.hidden,
        skinActive: container.className.includes("post-container--skin-active"),
        ownerTools: container.className.includes("post-container--owner-tools"),
        url: location.pathname + location.search
      };
    });

    check(`[${vpName}] 스킨 POST의 edit는 옛 상세 화면 없이 곧장 수정 폼을 연다`,
      editor.editorVisible && !editor.legacyVisible && !editor.actionsVisible &&
      editor.title === "첫 번째 글" && editor.editable,
      JSON.stringify(editor));

    check(`[${vpName}] 수정 폼 주소가 화면과 일치한다(?edit=1)`,
      editor.url === `/${SLUG}/post/101?edit=1`, editor.url);

    check(`[${vpName}] 수정 폼에는 삭제 버튼이 있고 스킨 mount contract는 벗겨져 있다`,
      editor.deleteVisible && !editor.skinActive && !editor.ownerTools,
      JSON.stringify(editor));

    /* 취소 → 진입 전 스킨 화면 + 스크롤 위치 */
    await page.click("#postEditorCancelButton");
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const cancelled = await page.evaluate(READ_POST_SCREEN);
    const cancelledScroll = await page.evaluate(() =>
      document.getElementById("postArea").scrollTop);

    check(`[${vpName}] 수정을 취소하면 POST 스킨으로 돌아온다`,
      cancelled.skinVisible && !cancelled.legacyVisible && !cancelled.editorVisible &&
      (cancelled.skinBody || "").includes("첫 번째 글 본문") &&
      cancelled.manageVisible && cancelled.ownerTools,
      JSON.stringify(cancelled));

    check(`[${vpName}] 취소 후 주소에 ?edit=1이 남지 않는다`,
      cancelled.url === `/${SLUG}/post/101`, cancelled.url);

    check(`[${vpName}] 취소하면 진입 전 스크롤 위치로 돌아온다`,
      Math.abs(cancelledScroll - readingScroll) <= 2,
      `before=${readingScroll} after=${cancelledScroll}`);

    /* 다시 수정 → 저장 → POST 스킨 복귀 */
    await page.click("#postManageToggleButton");
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.fill("#postEditorTitle", "스킨에서 고친 제목");
    await page.click("#postEditorSaveButton");
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const saved = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] 저장을 마쳐도 POST 스킨으로 돌아온다`,
      saved.skinVisible && !saved.legacyVisible && !saved.editorVisible &&
      saved.manageVisible && saved.ownerTools,
      JSON.stringify(saved));

    check(`[${vpName}] 저장 후 주소도 그 글의 읽기 주소로 정리된다`,
      saved.url === `/${SLUG}/post/101`, saved.url);

    check(`[${vpName}] 소유자 POST 경로 전체에서 문서 재로드 없음`,
      ctx.reloadCount() === 0, `reloads=${ctx.reloadCount()}`);

    check(`[${vpName}] 소유자 POST 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 수정 진입 URL 직접 접속 / 새로고침 --- */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/post/101?edit=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(900);

    const direct = await page.evaluate(() => ({
      editorVisible: !document.getElementById("postEditor").hidden,
      legacyVisible: !document.getElementById("postDetail").hidden,
      title: document.getElementById("postEditorTitle").value,
      url: location.pathname + location.search
    }));

    check(`[${vpName}] 소유자가 ?edit=1로 직접 들어오면 곧장 그 글의 수정 폼이 열린다`,
      direct.editorVisible && !direct.legacyVisible && direct.title === "첫 번째 글" &&
      direct.url === `/${SLUG}/post/101?edit=1`,
      JSON.stringify(direct));

    /* 직접 접속에는 돌아갈 진입 전 화면이 없다 — 그 글의 읽기 화면으로 */
    await page.click("#postEditorCancelButton");
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const backFromDirect = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] 직접 접속한 수정 폼을 취소하면 그 글의 스킨으로 가고 주소도 정리된다`,
      backFromDirect.skinVisible && !backFromDirect.editorVisible &&
      backFromDirect.url === `/${SLUG}/post/101`,
      JSON.stringify(backFromDirect));

    check(`[${vpName}] 수정 진입 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 비소유자가 같은 수정/관리 URL로 들어오면 그냥 스킨 --- */
  await withPage(vp, { signedInAs: OTHER_USER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/post/101?edit=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const visitor = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] 다른 계정이 ?edit=1로 들어와도 수정 폼이 열리지 않고 주소가 정리된다`,
      visitor.skinVisible && !visitor.legacyVisible && !visitor.editorVisible &&
      !visitor.manageVisible && !visitor.ownerTools && !visitor.actionsVisible &&
      visitor.url === `/${SLUG}/post/101`,
      JSON.stringify(visitor));

    await page.goto(`${BASE}/${SLUG}/post/101?manage=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const legacyQuery = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] 옛 ?manage=1 주소는 그냥 읽기 화면으로 정리된다`,
      legacyQuery.skinVisible && !legacyQuery.legacyVisible &&
      legacyQuery.url === `/${SLUG}/post/101`,
      JSON.stringify(legacyQuery));

    check(`[${vpName}] 비소유자 POST 수정 URL 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 로그아웃 방문자: 공개글 스킨 / 비밀글 잠금 --- */
  await withPage(vp, {}, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/post/101`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(600);

    const anon = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] 로그아웃 방문자: POST 스킨 + 소유자 도구 없음`,
      anon.skinVisible && (anon.skinBody || "").includes("첫 번째 글 본문") &&
      !anon.manageVisible && !anon.ownerTools,
      JSON.stringify(anon));

    await page.goto(`${BASE}/${SLUG}/post/102`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(600);

    const secret = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] 방문자의 비밀글: 스킨 본문 자리에 비밀번호 확인 폼이 그대로 뜬다`,
      secret.skinVisible && secret.gateVisible && secret.gateInSkin &&
      !secret.manageVisible,
      JSON.stringify(secret));

    check(`[${vpName}] 방문자 POST 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- 소유자의 비밀글: 스킨 안에서 본문이 바로 보인다 --- */
  await withPage(vp, { signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/post/102`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const ownerSecret = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] 소유자의 비밀글: 잠금 없이 스킨 본문 자리에서 읽고, 관리 진입점이 남는다`,
      ownerSecret.skinVisible && !ownerSecret.gateVisible &&
      (ownerSecret.skinTitle || "").includes("비밀 글") &&
      ownerSecret.manageVisible && ownerSecret.ownerTools,
      JSON.stringify(ownerSecret));

    check(`[${vpName}] 소유자 비밀글 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });

  /* --- POST template이 없는 스킨: 소유자도 기존 legacy 상세 그대로 --- */
  await withPage(vp, { skin: HOME_ONLY_SKIN, signedInAs: OWNER_ID }, async (page, ctx) => {
    await page.goto(`${BASE}/${SLUG}/post/101`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postDetail:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(900);

    const legacy = await page.evaluate(READ_POST_SCREEN);

    check(`[${vpName}] POST template이 없으면 소유자도 기존 legacy 상세 그대로(수정/삭제 포함)`,
      legacy.legacyVisible && !legacy.skinVisible && legacy.actionsVisible &&
      (legacy.legacyBody || "").includes("첫 번째 글 본문") && !legacy.ownerTools,
      JSON.stringify(legacy));

    check(`[${vpName}] 돌아갈 스킨이 없으면 떠 있는 수정 진입점도 뜨지 않는다`,
      !legacy.manageVisible, JSON.stringify(legacy));

    check(`[${vpName}] legacy POST 폴백 경로 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   5) 날짜 표시 — HOME/CATEGORY는 item.publishedAtLabel,
      POST는 post.publishedAtLabel
--------------------------------------------------------- */

async function testDateLabels(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 날짜 표시(publishedAtLabel)`);

  await withPage(vp, {}, async (page, ctx) => {
    await gotoHome(page);

    const homeDates = await page.evaluate(() =>
      [...document.querySelectorAll("#themeMount .quiet-date")].map(d => d.textContent)
    );

    check(`[${vpName}] HOME 날짜가 'YYYY. MM. DD' 라벨(ISO 원문이 아님)`,
      homeDates.length === 2 && homeDates.every(d => /^\d{4}\. \d{2}\. \d{2}$/.test(d)),
      JSON.stringify(homeDates));

    await page.click('#themeMount a[href$="/category/1"]');
    await page.waitForSelector("#postList .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(400);

    const categoryDates = await page.evaluate(() =>
      [...document.querySelectorAll("#postList .quiet-date")].map(d => d.textContent)
    );

    check(`[${vpName}] CATEGORY 날짜도 라벨 형식`,
      categoryDates.length === 2 && categoryDates.every(d => /^\d{4}\. \d{2}\. \d{2}$/.test(d)),
      JSON.stringify(categoryDates));

    const secret = await page.evaluate(() =>
      [...document.querySelectorAll("#postList .quiet-lock")].filter(l => !l.hidden).length
    );

    check(`[${vpName}] 비밀글 표시(LOCK)가 정확히 1개`, secret === 1, `count=${secret}`);

    await page.click('#postList a[href$="/post/101"]');
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(700);

    const post = await page.evaluate(() => ({
      date: document.querySelector(".quiet-article-date")
        ? document.querySelector(".quiet-article-date").textContent : null,
      body: document.querySelector(".quiet-post-body")
        ? document.querySelector(".quiet-post-body").innerText.trim() : null
    }));

    check(`[${vpName}] POST 날짜도 라벨 형식`,
      /^\d{4}\. \d{2}\. \d{2}$/.test(post.date || ""), `date=${post.date}`);

    check(`[${vpName}] POST 본문이 여전히 표시됨(회귀 없음)`,
      Boolean(post.body) && post.body.includes("첫 번째 글 본문"), `body=${post.body}`);

    check(`[${vpName}] 날짜/본문 경로 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   main
========================================================== */

const server = await startServer();
playwright = await loadPlaywright(BROWSER);

console.log(`\n=== BANNER PAGE + OWNER LINKS E2E (${BROWSER}) ===`);

try {
  for (const vpName of Object.keys(VIEWPORTS)) {
    await testBannerFrame(vpName);
    await testBannerItems(vpName);
    await testBannerEdgeCases(vpName);
    await testOwnerLinks(vpName);
    await testOwnerBannerScreen(vpName);
    await testOwnerCategoryScreen(vpName);
    await testOwnerPostScreen(vpName);
    await testDateLabels(vpName);
  }
} finally {
  server.close();
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) {
  console.log("실패 항목:\n  - " + failures.join("\n  - "));
  process.exitCode = 1;
}
