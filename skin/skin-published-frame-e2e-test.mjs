/* =========================================================
   PUBLISHED SKIN — 공개 화면 E2E 테스트 (PART 1)

   목적: "HOME은 정상인데 POST에 들어가면 스킨 프레임이 좁아지고
   위에 큰 빈 공간이 생긴다" / "흰색 배경이 페이드인한 뒤 다음
   화면으로 넘어간다" 두 실사용자 리포트를, 단순화한 테스트용
   상자가 아니라 실제 index.html + posts.html + 실제 CSS +
   실제 published SkinPackage로 검증한다.

   ★ 이 테스트가 대체하는 것
   skin/skin-frame-geometry-test.html은 #postArea/#themeMount를
   흉내 낸 빈 div의 x/y/width만 비교했다 — 마운트 지점이 0,0이어도
   그 안에서 Skin이 실제로 그리는 프레임이 HOME과 같은 자리인지는
   검증하지 못한다. 여기서는 실제 앱을 띄우고, Skin이 그린 DOM에서
   테두리를 가진 최외곽 요소(어떤 Skin이든 일반적으로 찾는다 —
   특정 클래스명에 의존하지 않는다)의 좌표를 HOME/CATEGORY/POST
   사이에서 비교한다.

   ★ 무엇을 mock하는가
   Supabase 네트워크 호출뿐이다(실계정 접근이 없으므로). HTML/CSS/
   JS는 저장소의 실제 파일을 그대로 정적 서빙한다(_redirects의 SPA
   fallback 포함).

   ★ 실행 방법
     node skin/skin-published-frame-e2e-test.mjs
     node skin/skin-published-frame-e2e-test.mjs --browser=webkit
     node skin/skin-published-frame-e2e-test.mjs --keep-shots

   playwright는 이 저장소에 devDependency가 없다(빌드 스텝 없는
   정적 사이트) — 전역/npx 캐시에 설치된 것을 찾아 쓴다. 없으면
   `npx playwright install chromium` 후 다시 실행한다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8934;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const KEEP_SHOTS = args.includes("--keep-shots");
const SHOT_DIR = path.join(os.tmpdir(), "imory-skin-e2e-shots");


/* =========================================================
   playwright 찾기
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

  /*
    같은 머신에 여러 버전이 흩어져 있을 수 있고(npx 캐시), 버전마다
    기대하는 브라우저 빌드 번호가 다르다 — 요청한 브라우저의 실행
    파일이 실제로 설치돼 있는 버전만 고른다(높은 버전 우선). 이
    확인을 생략하면 "playwright는 있는데 그 버전용 webkit만 없는"
    흔한 상태에서 launch가 곧장 실패한다.
  */

  const found = [];

  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let version = "0.0.0";
    try {
      version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0";
    } catch { /* 버전을 못 읽으면 가장 낮게 취급 */ }
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

    /*
      경로 존재만으로는 부족하다 — 설치는 돼 있는데 실제 spawn이
      막히는 조합(윈도우 EPERM 등)이 있어서, 한 번 실제로 띄워
      보고 성공한 버전만 쓴다.
    */

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
   Supabase mock (데이터만)

   Skin은 실사용자가 이 버그를 겪은 그 Skin을 그대로 쓴다
   (skin/test-skins/quiet-frame-v1-mount-contract-repro.json) —
   HOME/CATEGORY/POST 세 template을 모두 가지고, 자기 CSS로 바깥
   여백(padding)과 max-width와 1px 테두리 프레임을 직접 정하는
   Skin이라 "플랫폼이 그 바깥에 여백을 더하는가"를 그대로 드러낸다.
   제품 코드는 이 Skin의 클래스명(.quiet-*)에 전혀 의존하지 않고,
   아래 측정기도 테두리를 가진 요소를 일반적으로 찾는다.
========================================================== */

const SKIN_PACKAGE = JSON.parse(
  fs.readFileSync(
    path.join(HERE, "test-skins", "quiet-frame-v1-mount-contract-repro.json"),
    "utf8"
  )
);

const LONG_BODY = Array.from(
  { length: 40 },
  (_, i) => `본문 스크롤 확인용 ${i + 1}번째 문단입니다. 충분히 길어야 스크롤이 생깁니다.`
).join("\n\n");

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
    { id: 2, user_id: OWNER_ID, name: "링크", type: "banner", sort_order: 2 }
  ],
  posts: [
    { id: 101, user_id: OWNER_ID, category_id: 1, title: "첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", quote_preset_id: 7 },
    { id: 102, user_id: OWNER_ID, category_id: 1, title: "비밀 글", content_type: "text", visibility: "secret", created_at: "2026-09-02T02:00:00Z", quote_preset_id: null },
    { id: 103, user_id: OWNER_ID, category_id: 1, title: "아주 긴 글", content_type: "text", visibility: "public", created_at: "2026-09-03T02:00:00Z", quote_preset_id: null }
  ],
  post_contents: [
    { post_id: 101, content: "첫 번째 글 본문입니다.\n\n두 번째 문단." },
    { post_id: 103, content: LONG_BODY }
  ],
  banners: [
    { id: 1, user_id: OWNER_ID, category_id: 2, name: "배너 하나", url: "https://example.com", image_url: "", sort_order: 1 }
  ],
  quote_presets: [
    { id: 7, user_id: OWNER_ID, name: "테스트 프리셋", settings: {} }
  ]
};

const RPC = {
  get_published_skin: () => ({
    skin: SKIN_PACKAGE,
    schemaVersion: SKIN_PACKAGE.schemaVersion,
    imageSlotValues: {}
  })
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
  const { delayMs = 0, failWhen = null } = opts;

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (delayMs) await new Promise(r => setTimeout(r, delayMs));

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

  /* 외부 폰트/CDN 잡음 차단 (supabase-js 번들은 통과시킨다) */
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
   페이지 안에서 실행되는 측정기

   "지금 화면에 실제로 보이는" Skin 인스턴스를 고른다 — #postArea가
   열려 있으면 그 안, 아니면 #themeMount. 숨겨진(display:none) 이전
   화면의 잔재는 제외한다. Skin의 최외곽 테두리 요소는 특정
   클래스명이 아니라 "border를 가진 첫 요소"로 일반적으로 찾는다.
========================================================== */

const MEASURE = `(() => {
  function box(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
           (typeof el.className === "string" && el.className
             ? "." + el.className.trim().split(/\\s+/).join(".") : ""),
      x: +r.x.toFixed(1), y: +r.y.toFixed(1),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      padding: cs.padding, margin: cs.margin, maxWidth: cs.maxWidth,
      transform: cs.transform, overflowY: cs.overflowY, position: cs.position,
      opacity: cs.opacity, background: cs.backgroundColor
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

  const scrollers = [];
  let node = root ? root.parentElement : null;
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) {
      scrollers.push(Object.assign(box(node), { scrollTop: node.scrollTop }));
    }
    node = node.parentElement;
  }

  return {
    viewport: { w: innerWidth, h: innerHeight },
    screen: areaOpen
      ? (document.getElementById("postSkinContainer") &&
         !document.getElementById("postSkinContainer").hidden ? "post" : "category")
      : "home",
    scrollers,
    mount: box(root ? root.parentElement : null),
    root: box(root),
    frame: box(frame),
    postArea: box(area),
    postAreaHidden: area ? area.hidden : null,
    postAreaClasses: area ? area.className : null,
    postContainerClasses: document.getElementById("postContainer")
      ? document.getElementById("postContainer").className : null,
    bodyText: document.body.innerText.slice(0, 400)
  };
})()`;


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

async function withPage(viewport, mockOpts, fn) {
  const browser = await playwright[BROWSER].launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  let reloads = -1;
  page.on("load", () => { reloads++; });
  await installSupabaseMock(page, mockOpts);
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
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
}


/* ---------------------------------------------------------
   1) 프레임 기하 — HOME / CATEGORY / POST 가 완전히 동일한가
--------------------------------------------------------- */

async function testFrameGeometry(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 프레임 기하 (HOME → CATEGORY → POST → Back)`);

  await withPage(vp, {}, async (page, ctx) => {
    await gotoHome(page);
    const home = await page.evaluate(MEASURE);
    await shot(page, `${vpName}-home`);

    await page.click('#themeMount a[href$="/category/1"]');
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);
    const category = await page.evaluate(MEASURE);
    await shot(page, `${vpName}-category`);

    await page.click('#postList a[href$="/post/101"]');
    await page.waitForTimeout(1200);
    const post = await page.evaluate(MEASURE);
    await shot(page, `${vpName}-post`);

    check(`[${vpName}] HOME 진입 scrollTop=0`,
      home.scrollers.every(s => s.scrollTop === 0),
      JSON.stringify(home.scrollers.map(s => [s.sel, s.scrollTop])));

    check(`[${vpName}] CATEGORY 프레임이 HOME과 동일 좌표/폭`,
      sameFrame(home.frame, category.frame),
      `home=${JSON.stringify(home.frame && [home.frame.x, home.frame.y, home.frame.w])} ` +
      `category=${JSON.stringify(category.frame && [category.frame.x, category.frame.y, category.frame.w])}`);

    check(`[${vpName}] POST 프레임이 HOME과 동일 좌표/폭`,
      sameFrame(home.frame, post.frame),
      `home=${JSON.stringify(home.frame && [home.frame.x, home.frame.y, home.frame.w])} ` +
      `post=${JSON.stringify(post.frame && [post.frame.x, post.frame.y, post.frame.w])}`);

    check(`[${vpName}] POST 플랫폼 컨테이너가 여백/폭 제한을 더하지 않음`,
      post.postArea && post.postArea.padding === "0px" &&
      post.postContainerClasses.includes("post-container--skin-active"),
      `postArea.padding=${post.postArea && post.postArea.padding} postContainer="${post.postContainerClasses}"`);

    check(`[${vpName}] POST 스크롤 컨테이너가 정확히 하나(#postArea)`,
      post.scrollers.length === 1 && post.scrollers[0].sel.includes("postArea"),
      JSON.stringify(post.scrollers.map(s => s.sel)));

    check(`[${vpName}] Skin 링크가 문서 전체 재로드를 일으키지 않음`,
      ctx.reloadCount() === 0,
      `reloads=${ctx.reloadCount()}`);

    check(`[${vpName}] 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));

    /* Back → CATEGORY → HOME */
    await page.goBack();
    await page.waitForTimeout(1000);
    const backToCategory = await page.evaluate(MEASURE);
    check(`[${vpName}] Back 1회 → CATEGORY 프레임 복원`,
      backToCategory.screen === "category" && sameFrame(home.frame, backToCategory.frame),
      `screen=${backToCategory.screen} frame=${JSON.stringify(backToCategory.frame && [backToCategory.frame.x, backToCategory.frame.y, backToCategory.frame.w])}`);

    await page.goBack();
    await page.waitForTimeout(1000);
    const backToHome = await page.evaluate(MEASURE);
    check(`[${vpName}] Back 2회 → HOME 프레임 복원`,
      backToHome.screen === "home" && sameFrame(home.frame, backToHome.frame),
      `screen=${backToHome.screen} frame=${JSON.stringify(backToHome.frame && [backToHome.frame.x, backToHome.frame.y, backToHome.frame.w])}`);
  });
}


/* ---------------------------------------------------------
   1-b) 캐시 무효화 회귀 방지

   실사용자가 겪은 "POST 프레임만 좁고 아래로 밀림"의 실제 원인은
   레이아웃 규칙 자체가 아니라 "항상 최신인 JS + 최대 4시간 묵을 수
   있는 CSS" 조합이었다(core/lib/build-version.js 주석). 그래서
   프레임 좌표가 맞는지와 별개로, 이 저장소가 다시 그 상태로
   돌아가지 않는지를 직접 확인한다 — 공개 홈이 실제로 로드한
   스타일시트가 전부 버전 쿼리를 달고 있어야 한다.

   또한 옛 CSS를 강제로 물려서(= 실기기의 캐시 상태를 재현해서)
   그때 실제로 증상이 나타나는지도 확인한다 — 원인 규명이
   추측이 아니라 재현으로 뒷받침되게 한다.
--------------------------------------------------------- */

async function testCssCacheBusting(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] CSS 캐시 무효화`);

  await withPage(vp, {}, async page => {
    await gotoHome(page);

    const sheets = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(l => l.getAttribute("href"))
        .filter(h => h && !/^https?:/.test(h))
    );

    const unversioned = sheets.filter(h => !/\?v=/.test(h));

    check(`[${vpName}] 공개 홈 CSS가 전부 버전 쿼리를 가짐`,
      sheets.length > 0 && unversioned.length === 0,
      `총 ${sheets.length}개, 버전 없음: ${JSON.stringify(unversioned)}`);
  });
}

async function testStaleCssReproducesBug(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 옛 CSS 재현 대조군`);

  const staleCss = fs
    .readFileSync(path.join(ROOT, "posts", "posts-base.css"), "utf8")
    /* 이 한 규칙만 없앤다 = 실기기가 물고 있던 옛 posts-base.css */
    .replace(/#postArea\.post-area--skin-active\s*\{[^}]*\}/, "");

  await withPage(vp, {}, async page => {
    await page.route("**/posts/posts-base.css*", route =>
      route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body: staleCss })
    );

    await gotoHome(page);
    const home = await page.evaluate(MEASURE);

    await page.click('#themeMount a[href$="/post/101"]');
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);
    const post = await page.evaluate(MEASURE);

    /*
      옛 CSS에서는 .post-area의 legacy padding이 그대로 남아 프레임이
      아래로 밀린다. 폭까지 좁아지는지는 뷰포트에 달렸다 — 모바일
      390px에서는 Skin의 min(920px,100%)가 좌우 padding에 눌려 실제로
      좁아지고, 데스크톱 1280px에서는 920px 상한이 먼저 걸려 폭은
      그대로다. 그래서 공통 증상인 "아래로 밀림"만 단언한다.
    */

    check(`[${vpName}] 옛 CSS에서는 실제로 증상이 재현됨(대조군)`,
      !sameFrame(home.frame, post.frame) &&
      post.frame.y > home.frame.y &&
      post.frame.w <= home.frame.w,
      `home=${JSON.stringify([home.frame.x, home.frame.y, home.frame.w])} ` +
      `post=${JSON.stringify([post.frame.x, post.frame.y, post.frame.w])}`);
  });
}


/* ---------------------------------------------------------
   2) POST 직접 접속 / CATEGORY 직접 접속
--------------------------------------------------------- */

async function testDirectEntry(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 직접 접속(POST/CATEGORY)`);

  await withPage(vp, {}, async page => {
    await page.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#themeMount .imory-skin-root", { timeout: 15000 });
    await page.waitForTimeout(350);
    const home = await page.evaluate(MEASURE);

    await page.goto(`${BASE}/${SLUG}/post/101`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);
    const post = await page.evaluate(MEASURE);
    check(`[${vpName}] POST 직접 접속 프레임이 HOME과 동일`,
      sameFrame(home.frame, post.frame),
      `home=${JSON.stringify([home.frame.x, home.frame.y, home.frame.w])} post=${JSON.stringify([post.frame.x, post.frame.y, post.frame.w])}`);

    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(400);
    const category = await page.evaluate(MEASURE);
    check(`[${vpName}] CATEGORY 직접 접속 프레임이 HOME과 동일`,
      sameFrame(home.frame, category.frame),
      `category=${JSON.stringify([category.frame.x, category.frame.y, category.frame.w])}`);
  });
}


/* ---------------------------------------------------------
   3) 전환 중 흰 화면이 노출되지 않는가 (연속 캡처 + 픽셀 판정)

   느린 응답(400ms)을 걸고 클릭 직후부터 새 화면이 뜰 때까지 계속
   캡처해서, "직전 화면도 다음 화면도 아닌 빈 흰 화면" 프레임이
   한 장이라도 있는지 본다. 스피너를 늦게 띄우는 것만으로는 이
   검사를 통과할 수 없다 — 실제로 이전 화면이 계속 그려져 있어야
   한다.
--------------------------------------------------------- */

async function testNoWhiteFlash(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 전환 중 흰 화면 미노출 (연속 캡처)`);

  await withPage(vp, { delayMs: 400 }, async page => {
    await gotoHome(page);

    /* 기준: HOME 화면에 있는 "잉크" 픽셀 수 */
    const inkOf = async () => {
      const buf = await page.screenshot();
      /* PNG를 디코딩하지 않고도 "거의 단색 흰 화면"은 압축 크기로
         충분히 구분된다 — 빈 흰 화면은 압축률이 극단적으로 높다.
         기준값은 아래 homeInk 대비 상대 비교로만 쓴다. */
      return buf.length;
    };

    const homeInk = await inkOf();

    const nav = page.click('#themeMount a[href$="/post/103"]');

    const samples = [];
    for (let i = 0; i < 14; i++) {
      samples.push(await inkOf());
      await page.waitForTimeout(55);
    }
    await nav;
    await page.waitForTimeout(1200);
    const finalInk = await inkOf();

    const blankThreshold = Math.min(homeInk, finalInk) * 0.35;
    const blanks = samples.filter(s => s < blankThreshold);

    check(`[${vpName}] 전환 중 빈 흰 화면 프레임 없음`,
      blanks.length === 0,
      `home=${homeInk} final=${finalInk} threshold=${Math.round(blankThreshold)} ` +
      `samples=[${samples.join(",")}]`);

    const measured = await page.evaluate(MEASURE);
    check(`[${vpName}] 느린 응답에서도 최종 POST 화면 도달`,
      measured.screen === "post" && Boolean(measured.frame),
      `screen=${measured.screen}`);
  });
}


/* ---------------------------------------------------------
   4) 빠른 연속 이동 — 늦게 도착한 응답이 최신 화면을 덮지 않는가
--------------------------------------------------------- */

async function testRapidNavigation(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 빠른 연속 이동`);

  await withPage(vp, { delayMs: 250 }, async (page, ctx) => {
    await gotoHome(page);

    /* 세 글을 연달아 클릭 — 마지막(101)이 최종 화면이어야 한다 */
    await page.click('#themeMount a[href$="/post/103"]');
    await page.waitForTimeout(60);
    await page.click('#themeMount a[href$="/post/102"]').catch(() => {});
    await page.waitForTimeout(60);
    await page.click('#themeMount a[href$="/post/101"]').catch(() => {});
    await page.waitForTimeout(2500);

    const m = await page.evaluate(MEASURE);
    check(`[${vpName}] 빠른 연속 클릭 후 마지막 글이 화면에 남음`,
      m.screen === "post" && m.bodyText.includes("첫 번째 글"),
      `url=${page.url()} text="${m.bodyText.replace(/\s+/g, " ").slice(0, 80)}"`);

    check(`[${vpName}] 빠른 연속 이동 중 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));

    /* 즉시 Back */
    await page.goBack();
    await page.waitForTimeout(1500);
    const back = await page.evaluate(MEASURE);
    check(`[${vpName}] 연속 이동 직후 Back이 안전하게 처리됨`,
      Boolean(back.frame), `screen=${back.screen}`);
  });
}


/* ---------------------------------------------------------
   5) 요청 실패 — 오류와 복귀 경로가 보이는가
--------------------------------------------------------- */

async function testFailurePath(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 요청 실패 시 오류 + 복귀 경로`);

  await withPage(vp, {}, async page => {
    await gotoHome(page);

    /* HOME 렌더가 끝난 뒤부터 posts 조회만 실패시킨다 */
    await page.route(`https://${SUPABASE_HOST}/rest/v1/posts*`, route =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ message: "mock failure", code: "MOCKFAIL" })
      })
    );

    await page.click('#themeMount a[href$="/post/101"]');
    await page.waitForTimeout(2500);

    const visible = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      const back = document.getElementById("postBackButton");
      const rect = back ? back.getBoundingClientRect() : null;
      return {
        areaOpen: Boolean(area) && !area.hidden,
        text: document.body.innerText,
        backVisible: Boolean(rect) && rect.width > 0 && rect.height > 0
      };
    });

    check(`[${vpName}] 실패 시 오류 문구가 보임`,
      visible.areaOpen && visible.text.includes("post not found"),
      `areaOpen=${visible.areaOpen}`);

    check(`[${vpName}] 실패 시 뒤로가기 경로가 보임`,
      visible.backVisible, `backVisible=${visible.backVisible}`);
  });
}


/* ---------------------------------------------------------
   6) BANNER 왕복 — legacy 경로가 그대로 동작하는가
--------------------------------------------------------- */

async function testBannerRoundTrip(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] HOME → BANNER → HOME`);

  await withPage(vp, {}, async (page, ctx) => {
    await gotoHome(page);
    const home = await page.evaluate(MEASURE);

    await page.click('#themeMount a[href$="/category/2"]');
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(800);

    const banner = await page.evaluate(() => {
      const grid = document.getElementById("bannerGrid");
      const area = document.getElementById("postArea");
      return {
        gridVisible: Boolean(grid) && !grid.hidden,
        areaClasses: area ? area.className : null,
        containerClasses: document.getElementById("postContainer").className,
        title: (document.getElementById("postPageTitle") || {}).textContent
      };
    });

    check(`[${vpName}] BANNER는 legacy 레이아웃 유지(skin-active 클래스 없음)`,
      !banner.areaClasses.includes("post-area--skin-active") &&
      !banner.containerClasses.includes("post-container--skin-active"),
      `area="${banner.areaClasses}" container="${banner.containerClasses}"`);

    check(`[${vpName}] BANNER 화면이 실제로 열림`,
      banner.gridVisible && banner.title === "링크",
      `gridVisible=${banner.gridVisible} title="${banner.title}"`);

    await page.goBack();
    await page.waitForTimeout(1200);
    const back = await page.evaluate(MEASURE);
    check(`[${vpName}] BANNER에서 HOME 복귀 시 프레임 동일`,
      back.screen === "home" && sameFrame(home.frame, back.frame),
      `screen=${back.screen}`);

    check(`[${vpName}] BANNER 왕복 중 콘솔 에러 없음`,
      ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* ---------------------------------------------------------
   7) 본문 기능 유지 — 긴 글 스크롤 / Quote Preset / 비밀글
--------------------------------------------------------- */

async function testPostBodyBehaviour(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] 본문 스크롤 / Quote Preset / 비밀글`);

  await withPage(vp, {}, async page => {
    await gotoHome(page);

    /* 긴 글 — Skin의 post-body region 안에 본문이 들어가고 스크롤된다 */
    await page.click('#themeMount a[href$="/post/103"]');
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(600);

    const longPost = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      const region = document.querySelector('#postSkinContainer [data-imory-region="post-body"]');
      return {
        bodyInRegion: Boolean(region) && region.innerText.includes("40번째 문단"),
        scrollable: area.scrollHeight > area.clientHeight + 50
      };
    });

    check(`[${vpName}] 긴 본문이 Skin post-body region에 렌더됨`,
      longPost.bodyInRegion, `bodyInRegion=${longPost.bodyInRegion}`);

    await page.evaluate(() => {
      document.getElementById("postArea").scrollTop = 1200;
    });
    await page.waitForTimeout(200);
    const scrolled = await page.evaluate(() => document.getElementById("postArea").scrollTop);

    check(`[${vpName}] 긴 본문이 #postArea 안에서 스크롤됨`,
      longPost.scrollable && scrolled > 500, `scrollTop=${scrolled}`);

    /* Quote Preset 지정 글 */
    await page.goto(`${BASE}/${SLUG}/post/101`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(600);
    const preset = await page.evaluate(() => {
      const region = document.querySelector('#postSkinContainer [data-imory-region="post-body"]');
      return {
        hasBody: Boolean(region) && region.innerText.includes("첫 번째 글 본문"),
        childCount: region ? region.children.length : 0
      };
    });
    check(`[${vpName}] Quote Preset 글 본문이 그대로 렌더됨`,
      preset.hasBody, `childCount=${preset.childCount}`);

    /* 비밀글 — 게이트가 Skin post-body region 안에 나타난다 */
    await page.goto(`${BASE}/${SLUG}/post/102`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postSkinContainer:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(600);
    const secret = await page.evaluate(() => {
      const gate = document.getElementById("postSecretGate");
      const region = document.querySelector('#postSkinContainer [data-imory-region="post-body"]');
      const rect = gate ? gate.getBoundingClientRect() : null;
      return {
        insideRegion: Boolean(gate) && Boolean(region) && region.contains(gate),
        visible: Boolean(rect) && rect.width > 0 && rect.height > 0
      };
    });
    check(`[${vpName}] 비밀글 게이트가 Skin post-body region 안에 보임`,
      secret.insideRegion && secret.visible,
      `insideRegion=${secret.insideRegion} visible=${secret.visible}`);
  });
}


/* ---------------------------------------------------------
   8) published Skin이 없는 사이트 — legacy 경로 회귀 방지

   이번 변경은 "Skin 후보면 화면이 준비될 때까지 #postArea를 열지
   않는다"로 전환 순서를 바꿨다. published Skin이 아예 없는(=
   get_published_skin이 null) 사용자는 그 후보 판정에는 걸리지만
   결국 legacy로 폴백하므로, 목록/상세가 예전처럼 열리고 흰색
   커튼 연출도 그대로 남아 있어야 한다.
--------------------------------------------------------- */

async function testLegacyFallback(vpName) {
  const vp = VIEWPORTS[vpName];
  console.log(`\n[${vpName}] published Skin 없는 사이트(legacy 폴백)`);

  await withPage(vp, {}, async (page, ctx) => {
    await page.route(`https://${SUPABASE_HOST}/rest/v1/rpc/get_published_skin`, route =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "null"
      })
    );

    await page.goto(`${BASE}/${SLUG}/category/1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#postArea:not([hidden])", { timeout: 15000 });
    await page.waitForTimeout(900);

    const category = await page.evaluate(() => {
      const area = document.getElementById("postArea");
      const list = document.getElementById("postList");
      const header = document.querySelector(".post-header");
      const rect = header ? header.getBoundingClientRect() : null;
      return {
        areaClasses: area.className,
        areaPadding: getComputedStyle(area).padding,
        itemCount: list ? list.querySelectorAll(".post-list-item").length : 0,
        headerVisible: Boolean(rect) && rect.height > 0,
        title: (document.getElementById("postPageTitle") || {}).textContent
      };
    });

    check(`[${vpName}] legacy CATEGORY 목록이 그대로 열림`,
      category.itemCount === 3 && category.title === "일기",
      `items=${category.itemCount} title="${category.title}"`);

    check(`[${vpName}] legacy CATEGORY는 기존 여백/헤더 유지`,
      !category.areaClasses.includes("post-area--skin-active") &&
      category.areaPadding !== "0px" &&
      category.headerVisible,
      `classes="${category.areaClasses}" padding=${category.areaPadding} header=${category.headerVisible}`);

    await page.click(".post-list-item");
    await page.waitForTimeout(1200);

    const post = await page.evaluate(() => {
      const detail = document.getElementById("postDetail");
      return {
        detailVisible: Boolean(detail) && !detail.hidden,
        title: (document.getElementById("postDetailTitle") || {}).textContent,
        content: (document.getElementById("postDetailContent") || {}).innerText || ""
      };
    });

    check(`[${vpName}] legacy POST 상세가 그대로 열림`,
      post.detailVisible && post.content.includes("본문"),
      `visible=${post.detailVisible} title="${post.title}"`);

    check(`[${vpName}] legacy 경로 콘솔 에러 없음`, ctx.errors.length === 0, ctx.errors.join(" | "));
  });
}


/* =========================================================
   main
========================================================== */

const server = await startServer();
playwright = await loadPlaywright(BROWSER);

console.log(`\n=== PUBLISHED SKIN E2E (${BROWSER}) ===`);

try {
  for (const vpName of Object.keys(VIEWPORTS)) {
    await testFrameGeometry(vpName);
    await testCssCacheBusting(vpName);
    await testStaleCssReproducesBug(vpName);
    await testDirectEntry(vpName);
    await testNoWhiteFlash(vpName);
    await testRapidNavigation(vpName);
    await testFailurePath(vpName);
    await testBannerRoundTrip(vpName);
    await testPostBodyBehaviour(vpName);
    await testLegacyFallback(vpName);
  }
} finally {
  server.close();
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) {
  console.log("실패 항목:\n  - " + failures.join("\n  - "));
}
if (KEEP_SHOTS) console.log(`스크린샷: ${SHOT_DIR}`);

process.exit(failed ? 1 : 0);
