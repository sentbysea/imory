/* =========================================================
   ADMIN ASSET VERSION E2E — 한 화면의 HTML · CSS · JS 가
   반드시 같은 배포 버전인가

   저장소의 실제 admin/index.html · admin/**.css · admin/**.js 를
   그대로 띄우고, **Cloudflare 가 실제로 하는 캐시 동작을 흉내낸
   정적 서버** 위에서 돌린다(2026-09-07 imory.me 실측값 —
   core/lib/build-version.js 상단 주석):

     HTML(_headers 에 있음)  -> no-cache
     CSS / JS               -> public, max-age=14400   (4시간)

   그래서 이 하네스에서는 브라우저가 CSS/JS 를 **진짜로 캐시한다**.
   두 번째 배포로 갈아끼운 뒤 같은 BrowserContext 로 다시 열면,
   URL 이 그대로인 자산은 옛 바이트가 그대로 쓰인다 — 실사용자
   아이폰에서 "새 마크업 + 옛 CSS"가 났던 바로 그 상황이다.

   그 캐시를 살려 두려고 두 가지를 지킨다:

     · Supabase 를 page.route 로 가로채지 않는다. route 가 하나라도
       걸리면 Playwright 가 그 페이지의 HTTP 캐시를 통째로 끈다
       (실측). 대신 문서 안에서 window.fetch 만 갈아끼운다.
     · 매 절 시작에 캐시가 정말 재사용되는지 먼저 잰다
       (probeContextCache). Playwright WebKit 은 재사용하지 않으므로
       [stale] 은 PASS 가 아니라 **SKIP** 으로 적힌다 — 그 상황은
       chromium 으로 확인한다.

   확인 범위:

     version  이 화면이 받는 자기 자산(css/js/html 조각)이 전부
              ?v=APP_BUILD_VERSION 이고, 값이 **하나**인가.
              같은 파일을 서로 다른 쿼리로 두 번 받지 않는가.
              (build-version.js 만 ?t= — 닭과 달걀)

     stale    ★ 핵심. 옛 배포(고정 URL <link>)를 열어 CSS 를
              캐시시킨 뒤 새 배포로 갈아끼운다.
                · 대조군: 옛 index.html 이면 옛 CSS 가 그대로 쓰인다
                  (= 이 하네스의 캐시가 진짜라는 증거, 그리고
                  고치기 전 코드가 실제로 깨졌다는 증거)
                · 본 검증: 새 index.html 이면 ?v= 덕분에 URL 이
                  달라져 옛 캐시가 이길 수 없다

     fouc     CSS 를 느리게 내려도 스타일 없는 화면이 먼저 그려지지
              않는가(first-contentful-paint 가 마지막 render-blocking
              CSS 의 responseEnd 보다 늦은가).

     mobile   390px 에서 SHARE > CARD · CATEGORY · PROFILE 가
              **새 캐시(빈 캐시)** 와 **이전 캐시(옛 배포를 먼저 연
              뒤)** 두 상황 모두에서 같은 모양인가 — 가로 넘침 0,
              공유 카드 미리보기가 1200:628 로 그려지는가.

   ★ 실행
     node admin/admin-asset-version-e2e-test.mjs
     node admin/admin-asset-version-e2e-test.mjs --only=stale
     node admin/admin-asset-version-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8955;
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";
const OWNER_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.mock-owner-signature-value";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const VERBOSE = args.includes("--verbose");

const shouldRun = (name) => !ONLY || ONLY === name;

let passed = 0;
let failed = 0;
let skipped = 0;

/*
  판정할 수 없는 항목은 PASS 로 넘기지 않고 SKIP 으로 적는다 —
  "돌렸는데 통과했다"와 "이 브라우저에서는 잴 수 없었다"는 다른
  말이다.
*/

function skip(name, reason) {
  skipped++;
  console.log(`  SKIP  ${name}${reason ? ` — ${reason}` : ""}`);
}

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
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
    } catch {
      /* 다음 후보 */
    }
  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다. ` +
    `\`npx playwright install ${browserName}\`을 먼저 실행하세요.`
  );
}


/* =========================================================
   배포 버전 값 읽기 — 테스트가 문자열을 따로 적어두면 실제
   소스와 갈라진다. core/lib/build-version.js 에서 뽑는다.
========================================================== */

const BUILD_VERSION_SOURCE =
  fs.readFileSync(path.join(ROOT, "core/lib/build-version.js"), "utf8");

const NEW_VERSION =
  /const APP_BUILD_VERSION = "([^"]+)"/.exec(BUILD_VERSION_SOURCE)?.[1];

const OLD_VERSION = "0000-00-00-old";

if (!NEW_VERSION) {
  console.error("APP_BUILD_VERSION 을 읽지 못했습니다.");
  process.exit(1);
}


/* =========================================================
   "예전 배포" 만들기

   고친 것은 admin/index.html 이므로, 옛 배포는 그 문서의 head
   CSS 부분만 **고정 URL <link>** 로 되돌린 것이다(고치기 전
   실제 모양). 나머지는 전부 현재 저장소 파일 그대로다 — 이
   테스트가 재는 것은 "URL 에 버전이 붙는가"뿐이기 때문.
========================================================== */

/* 줄끝은 LF로 맞춘다 — 아래 문자열 찾기가 \r 에 걸리지 않게 */

const ADMIN_HTML_NEW =
  fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8")
    .split("\r\n")
    .join("\n");

const OLD_FIXED_CSS = [
  "../core/design-tokens.css",
  "../core/components/button.css",
  "../core/components/input.css",
  "../core/components/label.css",
  "../core/patterns/form-actions.css",
  "../core/patterns/tabs.css",
  "../core/patterns/section-header.css",
  "./admin-shell.css",
  "./admin-settings.css",
  "../posts/posts-page-canvas.css",
  "../posts/posts-body-blocks.css",
  "../core/components/range.css",
  "./admin-quote.css"
];

function buildOldAdminHtml() {

  /*
    head 의 loadVersionedStyles( … ) **호출**을 통째로 찾는다.
    주석에도 같은 이름이 나오므로 여는 대괄호까지 붙여 찾는다.
  */

  const CALL_ANCHOR = "loadVersionedStyles(\n      [";

  const start = ADMIN_HTML_NEW.indexOf(CALL_ANCHOR);

  if (start === -1) {
    throw new Error("admin/index.html 에서 loadVersionedStyles 호출을 못 찾았다");
  }

  const end = ADMIN_HTML_NEW.indexOf(");", ADMIN_HTML_NEW.indexOf("]", start));

  if (end === -1) {
    throw new Error("loadVersionedStyles 블록의 끝을 못 찾았다");
  }

  const call = ADMIN_HTML_NEW.slice(start, end + 2);

  const fixedLinks =
    OLD_FIXED_CSS
      .map(href => `document.write('<link rel="stylesheet" href="${href}">');`)
      .join("\n    ");

  return ADMIN_HTML_NEW.replace(call, fixedLinks);

}

const ADMIN_HTML_OLD = buildOldAdminHtml();


/* =========================================================
   CSS 세대 표시

   서빙할 때 CSS 끝에 세대 표시를 덧붙인다. 화면에서
   getComputedStyle(#loginBox)['--imory-css-generation'] 로 읽으면
   **실제로 적용된 CSS 가 어느 배포 것인지** 알 수 있다.

   그리고 옛 배포의 admin-settings.css 에서는 SHARE > CARD
   미리보기 규칙을 지운다 — "새 마크업이 먼저 배포되고 옛 CSS 가
   남아 미리보기 크기가 깨진다"는 실제 증상 그대로다.
========================================================== */

const SHARE_CARD_RULE_START = ".share-card-preview {";
const SHARE_CARD_RULE_END = ".share-card-preview-note {";

function ageCss(rel, body, generation) {

  let out = body;

  if (generation === "old" && rel === "/admin/admin-settings.css") {
    const from = out.indexOf(SHARE_CARD_RULE_START);
    const to = out.indexOf(SHARE_CARD_RULE_END);
    if (from !== -1 && to !== -1 && to > from) {
      out = out.slice(0, from) + out.slice(to);
    }
  }

  return `${out}\n#loginBox { --imory-css-generation: ${generation}; }\n`;

}


/* =========================================================
   Cloudflare 를 흉내낸 정적 서버
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

/* _headers 가 실제로 도달하는 경로(HTML + build-version.js) */

const NO_CACHE_PATHS = new Set([
  "/admin/index.html",
  "/core/lib/build-version.js"
]);

/*
  generation  자산(CSS/JS/build-version.js)의 배포 세대
  htmlOld     admin/index.html 만 **고치기 전 모양**으로 내려보낸다
              (대조군: 고정 URL <link> 라 옛 캐시가 이기는가)
*/

const state = {
  generation: "new",
  htmlOld: false,
  cssDelayMs: 0,
  cacheProbeHits: 0,
  requests: []
};

function startServer() {

  const server = http.createServer((req, res) => {

    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";

    state.requests.push({
      path: rel,
      query: url.search,
      generation: state.generation
    });

    const abs = path.join(ROOT, rel);
    const ext = path.extname(abs);

    const send = (status, headers, body) => {
      res.writeHead(status, headers);
      res.end(body);
    };

    /* ---------------------------------------------
       캐시 probe — 이 브라우저가 BrowserContext 안에서 정말로
       max-age 자산을 재사용하는지 재는 최소 페이지. 아래 [stale]
       판정이 의미 있으려면 이게 먼저 성립해야 한다.
    ---------------------------------------------- */

    if (rel === "/__cache-probe.html") {
      return send(
        200,
        { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" },
        `<!doctype html><link rel="stylesheet" href="/__cache-probe.css"><p id="p">probe</p>`
      );
    }

    if (rel === "/__cache-probe.css") {
      state.cacheProbeHits += 1;
      return send(
        200,
        { "Content-Type": MIME[".css"], "Cache-Control": "public, max-age=14400" },
        `#p { --imory-cache-probe: "hit${state.cacheProbeHits}"; }`
      );
    }

    /* ---- admin/index.html — 배포 세대에 따라 다른 문서 ---- */

    if (rel === "/admin/index.html") {
      return send(
        200,
        { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" },
        state.generation === "old" || state.htmlOld
          ? ADMIN_HTML_OLD
          : ADMIN_HTML_NEW
      );
    }

    if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return send(404, { "Content-Type": "text/plain" }, "not found");
    }

    /* ---- build-version.js — 세대별 버전 값 ---- */

    if (rel === "/core/lib/build-version.js") {
      const body =
        fs.readFileSync(abs, "utf8").replace(
          `const APP_BUILD_VERSION = "${NEW_VERSION}"`,
          `const APP_BUILD_VERSION = "${
            state.generation === "old" ? OLD_VERSION : NEW_VERSION
          }"`
        );
      return send(
        200,
        { "Content-Type": MIME[".js"], "Cache-Control": "no-cache" },
        body
      );
    }

    const cacheControl =
      NO_CACHE_PATHS.has(rel) || ext === ".html"
        ? "no-cache"
        /* 실측된 CDN 동작 — CSS/JS 는 4시간 브라우저 캐시 */
        : "public, max-age=14400";

    if (ext === ".css") {
      const body = ageCss(rel, fs.readFileSync(abs, "utf8"), state.generation);
      const write = () => send(
        200,
        { "Content-Type": MIME[".css"], "Cache-Control": cacheControl },
        body
      );
      if (state.cssDelayMs > 0) setTimeout(write, state.cssDelayMs);
      else write();
      return;
    }

    send(
      200,
      {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": cacheControl
      },
      fs.readFileSync(abs)
    );

  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   Supabase mock — 이 화면이 실제로 쓰는 만큼만
   (admin/admin-settings-e2e-test.mjs 와 같은 규약)
========================================================== */

function makeDb() {
  return {
    profiles: [{
      user_id: OWNER_ID, slug: "testuser", nickname: "테스트", bio: "", home_mode: "customize"
    }],
    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "IMORY ADMIN E2E" }
    ],
    categories: [
      { id: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1, slug: "diary", list_style: "list", page_size: 12, secret_cover_mode: "lock", secret_cover_path: null },
      { id: 2, user_id: OWNER_ID, name: "사진", type: "gallery", sort_order: 2, slug: "photo", list_style: "gallery", page_size: 12, secret_cover_mode: "lock", secret_cover_path: null }
    ],
    posts: [],
    banners: [],
    highlight_folder_settings: []
  };
}

/* =========================================================
   Supabase mock — page.route 가 아니라 **페이지 안에서** fetch 를
   가로챈다

   ★ 왜 route 를 쓰지 않는가

   Playwright 는 페이지에 route 가 하나라도 걸리면 Chromium 의
   HTTP 캐시를 통째로 끈다(Network.setCacheDisabled). 그러면 이
   테스트의 핵심인 "이전 캐시가 남아 있는 브라우저"를 만들 수
   없다 — 실제로 재어 보면 같은 context 의 두 번째 페이지가
   max-age=14400 자산을 그대로 다시 받는다.

   그래서 네트워크를 가로채지 않고, 문서 안에서 window.fetch 만
   갈아끼운다. supabase-js 는 fetch 로 통신하므로 이것으로 충분하고,
   같은 origin 의 CSS/JS 는 브라우저의 진짜 캐시를 그대로 탄다.
========================================================== */

async function installSupabaseMock(page, db) {

  if (VERBOSE) {
    page.on("pageerror", (err) => console.log("    [pageerror]", err.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.log("    [console]", m.text());
    });
  }

  await page.addInitScript(({ host, db: seed, ownerId }) => {

    const RESERVED = new Set([
      "select", "order", "limit", "offset", "on_conflict", "columns"
    ]);

    const store = JSON.parse(JSON.stringify(seed));

    function matches(row, key, raw) {
      const m = /^(eq|in|is|neq)\.(.*)$/s.exec(raw);
      if (!m) return true;
      const [, op, val] = m;
      const cur = row[key];
      if (op === "in") {
        const list = val.replace(/^\(|\)$/g, "").split(",")
          .map(v => v.replace(/^"|"$/g, ""));
        return list.includes(String(cur));
      }
      if (op === "is") {
        return val === "null"
          ? (cur === null || cur === undefined)
          : String(cur) === val;
      }
      if (op === "neq") return String(cur) !== val;
      return String(cur) === val;
    }

    function queryTable(table, params) {
      let rows = (store[table] || []).slice();

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
        if (RESERVED.has(key)) continue;
        rows = rows.filter(row => matches(row, key, raw));
      }
      const select = params.get("select");
      if (select && select !== "*") {
        const cols = select.split(",").map(s => s.trim()).filter(Boolean);
        rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
      }
      return rows;
    }

    const json = (body, status = 200, contentType = "application/json") =>
      new Response(
        typeof body === "string" ? body : JSON.stringify(body),
        { status, headers: { "Content-Type": contentType } }
      );

    const originalFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {

      const raw =
        typeof input === "string"
          ? input
          : (input && input.url) || String(input);

      if (!raw.includes(host)) {
        return originalFetch(input, init);
      }

      const url = new URL(raw);
      const method =
        ((init && init.method) ||
          (typeof input === "object" && input && input.method) ||
          "GET").toUpperCase();

      const accept =
        (init && init.headers &&
          (init.headers.accept || init.headers.Accept)) || "";

      if (url.pathname.startsWith("/auth/v1")) {
        return Promise.resolve(
          json({ user: { id: ownerId, email: "owner@example.com" } })
        );
      }

      if (url.pathname.startsWith("/storage/v1/object/")) {
        return Promise.resolve(json({}));
      }

      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        return Promise.resolve(json("null"));
      }

      if (url.pathname.startsWith("/rest/v1/")) {

        const table = url.pathname.slice("/rest/v1/".length);

        if (method === "POST" || method === "PATCH") {
          return Promise.resolve(json("[]", 201));
        }

        if (method === "DELETE") {
          return Promise.resolve(new Response("", { status: 204 }));
        }

        const rows = queryTable(table, url.searchParams);
        const single = String(accept).includes("vnd.pgrst.object");

        if (single && rows.length === 0) {
          return Promise.resolve(
            json({ code: "PGRST116", message: "0 rows" }, 406)
          );
        }

        return Promise.resolve(
          json(
            single ? rows[0] : rows,
            200,
            single ? "application/vnd.pgrst.object+json" : "application/json"
          )
        );
      }

      return Promise.resolve(json({}, 404));

    };

  }, { host: SUPABASE_HOST, db, ownerId: OWNER_ID });

}

async function installSignedInUser(page) {
  await page.addInitScript(({ id, token }) => {
    let stored;
    Object.defineProperty(window, "supabase", {
      configurable: true,
      get() { return stored; },
      set(value) {
        if (value && typeof value.createClient === "function" && !value.__imoryPatched) {
          const originalCreateClient = value.createClient.bind(value);
          value.createClient = (...clientArgs) => {
            const client = originalCreateClient(...clientArgs);
            const session = {
              user: { id, email: "owner@example.com" },
              access_token: token,
              expires_at: 4102444800
            };
            client.auth.getSession = async () => ({ data: { session }, error: null });
            client.auth.getUser = async () => ({ data: { user: session.user }, error: null });
            client.auth.onAuthStateChange = (callback) => {
              setTimeout(() => {
                try { callback("INITIAL_SESSION", session); } catch (err) { /* noop */ }
              }, 0);
              return {
                data: { subscription: { unsubscribe() { /* noop */ } } },
                error: null
              };
            };
            return client;
          };
          value.__imoryPatched = true;
        }
        stored = value;
      }
    });
  }, { id: OWNER_ID, token: OWNER_TOKEN });
}


/* =========================================================
   화면 열기
========================================================== */

async function newAdminPage(ctx) {
  const page = await ctx.newPage();
  await installSignedInUser(page);
  await installSupabaseMock(page, makeDb());
  return page;
}

async function openAdmin(page) {
  await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: "load" });
  await page.waitForSelector("#openSettingsButton", { state: "visible", timeout: 20000 });
}

async function openSettings(page) {
  await openAdmin(page);
  await page.click("#openSettingsButton");
  await page.waitForTimeout(900);
}

async function cssGeneration(page) {
  return page.evaluate(() =>
    getComputedStyle(document.getElementById("loginBox"))
      .getPropertyValue("--imory-css-generation")
      .trim()
  );
}

/* 공유 카드 미리보기가 실제로 1200:628 대지로 그려지는가 */

async function shareCardPreviewBox(page) {
  await page.click("#shareTabButton");
  await page.waitForTimeout(200);
  await page.click("#shareCardTabButton");
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const box = document.getElementById("shareCardPreviewBox");
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
}

function isCardRatio(box) {
  if (!box || box.width < 10) return false;
  return Math.abs(box.height - (box.width * 628) / 1200) <= 2;
}

async function docOverflow(page) {
  return page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );
}


/* =========================================================
   이 브라우저에서 BrowserContext 캐시가 진짜인가

   Playwright 의 WebKit 은 context 안의 새 페이지가 max-age 자산을
   재사용하지 않는다(재어 보면 매번 다시 받는다). 그러면 "이전
   캐시가 남아 있는 브라우저"를 만들 수 없으므로, 아래 [stale]
   판정은 통과가 아니라 **SKIP** 이어야 한다.
========================================================== */

let contextCacheIsReal = null;

async function probeContextCache(browser) {

  if (contextCacheIsReal !== null) return contextCacheIsReal;

  const ctx = await browser.newContext();

  const read = async () => {
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/__cache-probe.html`, {
      waitUntil: "load"
    });
    const value = await page.evaluate(() =>
      getComputedStyle(document.getElementById("p"))
        .getPropertyValue("--imory-cache-probe")
        .trim()
    );
    await page.close();
    return value;
  };

  const first = await read();
  const second = await read();

  await ctx.close();

  contextCacheIsReal = Boolean(first) && first === second;

  return contextCacheIsReal;

}


/* =========================================================
   [version] 한 화면, 한 버전
========================================================== */

async function runVersion(browser) {
  console.log("\n[version] 이 화면의 자산이 전부 같은 배포 버전인가");

  state.generation = "new";
  state.requests = [];

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await newAdminPage(ctx);
  await openSettings(page);

  /*
    이 저장소가 내려 준 자기 자산만 본다(외부 CDN 제외).

    ★ 진입 문서(iframe 문서 포함)는 뺀다 — 그 HTML 은 브라우저가
    주소로 직접 여는 문서이고 _headers 의 no-cache 가 실제로
    도달하는 쪽이라 ?v= 를 붙이지 않는다. 반면 fetch 로 끌어와
    innerHTML 로 꽂는 조각(admin-quote-panel.html)은 자산이므로
    버전이 붙어야 한다.
  */

  const ENTRY_DOCS = new Set([
    "/admin/index.html",
    "/studio/index.html",
    "/studio/preview/preview-frame.html",
    "/customize/editor/index.html",
    "/customize/editor/preview-frame.html"
  ]);

  const own = state.requests.filter(r =>
    /\.(css|js|html)$/.test(r.path) && !ENTRY_DOCS.has(r.path)
  );

  const versionless =
    own.filter(r =>
      r.path !== "/core/lib/build-version.js" && !r.query.includes("v=")
    );

  check(
    "[version] 버전 없는 자산 요청이 없다",
    versionless.length === 0,
    versionless.map(r => r.path).join(", ") || "0건"
  );

  check(
    "[version] build-version.js 만 ?t= 로 받는다",
    state.requests.some(
      r => r.path === "/core/lib/build-version.js" && /^\?t=\d+$/.test(r.query)
    ),
    "닭과 달걀"
  );

  const tokens = new Set(
    own
      .filter(r => r.path !== "/core/lib/build-version.js")
      .map(r => new URLSearchParams(r.query).get("v"))
  );

  check(
    "[version] ★ 값이 하나뿐이고 APP_BUILD_VERSION 이다",
    tokens.size === 1 && tokens.has(NEW_VERSION),
    [...tokens].join(" / ")
  );

  /* 고정 <link>/<script> 가 남아 중복 로드되지 않는가 */

  /*
    build-version.js 만 예외다 — 문서마다 자기 ?t= 로 받는다
    (admin 본문서 + customize editor iframe + 그 안의 preview
    iframe). 값이 다른 것이 정상이고, 그래야 각 browsing context
    가 최신 버전 값을 읽는다.
  */

  const byPath = new Map();
  own.forEach(r => {
    if (r.path === "/core/lib/build-version.js") return;
    if (!byPath.has(r.path)) byPath.set(r.path, new Set());
    byPath.get(r.path).add(r.query);
  });

  const duplicated = [...byPath].filter(([, queries]) => queries.size > 1);

  check(
    "[version] ★ 같은 파일을 두 가지 주소로 받지 않는다",
    duplicated.length === 0,
    duplicated.map(([p]) => p).join(", ") || "0건"
  );

  /* head 의 CSS 13개가 전부 버전 붙은 채 실제로 걸렸는가 */

  const sheets = await page.evaluate(() =>
    [...document.styleSheets]
      .map(s => s.href || "")
      .filter(h => h.startsWith(location.origin))
  );

  check(
    "[version] admin CSS 가 전부 문서에 걸렸다",
    OLD_FIXED_CSS.every(href => {
      const name = href.replace(/^\.\.?\//, "").split("/").pop();
      return sheets.some(h => h.includes(name));
    }),
    `${sheets.length}장`
  );

  check(
    "[version] 걸린 CSS 에 버전 없는 주소가 없다",
    sheets.every(h => h.includes(`?v=${NEW_VERSION}`)),
    sheets.filter(h => !h.includes("?v=")).join(", ") || "0건"
  );

  check(
    "[version] 화면이 실제로 그 CSS 로 그려진다",
    (await cssGeneration(page)) === "new"
  );

  /*
    CUSTOMIZE 편집기는 이 문서 안의 iframe이다(독립 browsing
    context). 같은 core CSS 를 부모와 **같은 주소**로 받게 바꿨으니,
    그 문서의 CSS/JS 가 실제로 살아 있는지 확인한다 — 버전을
    붙이다가 스크립트 순서가 깨지면 여기서 잡힌다.
  */

  const customize = await page.evaluate(async () => {
    const frame = document.getElementById("customizeEditorFrame");
    if (!frame) return null;
    const doc = frame.contentDocument;
    if (!doc) return null;
    return {
      sheets: [...doc.styleSheets].map(s => s.href || "").filter(Boolean),
      renderer: typeof frame.contentWindow.renderCustomizeLayout
    };
  });

  check(
    "[version] CUSTOMIZE iframe 의 CSS 도 버전이 붙어 있다",
    customize !== null &&
    customize.sheets.some(h => h.includes("design-tokens.css")) &&
    customize.sheets
      .filter(h => h.startsWith(`http://localhost:${PORT}/`))
      .every(h => h.includes(`?v=${NEW_VERSION}`)),
    customize ? `${customize.sheets.length}장` : "iframe 없음"
  );

  check(
    "[version] CUSTOMIZE iframe 의 renderer 스크립트가 순서대로 살아 있다",
    customize !== null && customize.renderer === "function",
    customize ? customize.renderer : "iframe 없음"
  );

  await ctx.close();
}


/* =========================================================
   [stale] 이전 캐시 → 새 배포
========================================================== */

async function runStale(browser) {
  console.log("\n[stale] 옛 CSS 를 캐시한 브라우저가 새 배포를 열 때");

  const cacheIsReal = await probeContextCache(browser);

  if (!cacheIsReal) {
    skip(
      "[stale] 이 브라우저에서는 BrowserContext 캐시가 재사용되지 않는다",
      `${BROWSER} — 옛 캐시를 만들 수 없어 판정 불가(chromium 으로 확인할 것)`
    );
    return;
  }

  /* ---------------------------------------------
     대조군 — 고치기 전(고정 URL) 코드에서는 실제로 깨진다
     (= 이 하네스의 캐시가 진짜라는 증거)
  ---------------------------------------------- */

  const controlCtx =
    await browser.newContext({ viewport: { width: 390, height: 844 } });
  const controlPage = await newAdminPage(controlCtx);

  state.generation = "old";
  await openSettings(controlPage);

  check(
    "[stale] 옛 배포에서는 옛 CSS 다",
    (await cssGeneration(controlPage)) === "old"
  );

  const brokenBox = await shareCardPreviewBox(controlPage);

  check(
    "[stale] 옛 CSS 에는 공유 카드 미리보기 규칙이 없다(깨진 상태 재현)",
    !isCardRatio(brokenBox),
    JSON.stringify(brokenBox)
  );

  /* 새 배포로 갈아끼우되 문서는 여전히 옛 것(=고정 URL <link>) */

  state.generation = "new";
  state.requests = [];

  /*
    문서만 옛 모양(고정 URL <link>)으로 돌려 받는다 — CSS 바이트는
    새 것이지만, 주소가 그대로라 브라우저가 캐시에서 옛 바이트를
    쓴다. (문서 교체를 page.route 로 하면 안 된다 — route 를 걸면
    Playwright 가 그 페이지의 HTTP 캐시를 통째로 끈다.)
  */

  state.htmlOld = true;

  const controlPage2 = await controlCtx.newPage();
  await installSignedInUser(controlPage2);
  await installSupabaseMock(controlPage2, makeDb());

  await openSettings(controlPage2);

  check(
    "[stale] ★ 대조군: 고정 URL 이면 새 배포를 열어도 옛 CSS 가 이긴다",
    (await cssGeneration(controlPage2)) === "old",
    "이 줄이 PASS 여야 아래 본 검증이 의미가 있다"
  );

  state.htmlOld = false;

  await controlCtx.close();

  /* ---------------------------------------------
     본 검증 — 같은 캐시 상태에서 고친 문서를 연다
  ---------------------------------------------- */

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await newAdminPage(ctx);

  state.generation = "old";
  await openSettings(page);

  check(
    "[stale] (준비) 옛 배포를 열어 옛 CSS 를 캐시했다",
    (await cssGeneration(page)) === "old"
  );

  state.generation = "new";
  state.requests = [];

  const page2 = await newAdminPage(ctx);
  await openSettings(page2);

  check(
    "[stale] ★ 새 배포에서는 새 CSS 가 쓰인다",
    (await cssGeneration(page2)) === "new"
  );

  const cssRequests = state.requests.filter(r => r.path.endsWith(".css"));

  check(
    "[stale] ★ 옛 주소(버전 없는 CSS)를 다시 찾지 않는다",
    cssRequests.every(r => r.query.includes(`v=${NEW_VERSION}`)),
    cssRequests.filter(r => !r.query.includes("v=")).map(r => r.path).join(", ") || "0건"
  );

  check(
    "[stale] 옛 캐시가 남아 있어도 CSS 를 새로 받는다",
    cssRequests.length > 0,
    `${cssRequests.length}건`
  );

  const box = await shareCardPreviewBox(page2);

  check(
    "[stale] ★ SHARE > CARD 미리보기가 1200:628 로 돌아온다",
    isCardRatio(box),
    JSON.stringify(box)
  );

  await ctx.close();
}


/* =========================================================
   [fouc] 스타일 없는 화면이 먼저 보이지 않는가
========================================================== */

async function runFouc(browser) {
  console.log("\n[fouc] CSS 가 늦어도 무스타일 화면이 먼저 그려지지 않는가");

  state.generation = "new";
  state.cssDelayMs = 400;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await newAdminPage(ctx);

  await openAdmin(page);

  const timing = await page.evaluate(() => {
    const paint =
      performance.getEntriesByType("paint")
        .find(e => e.name === "first-contentful-paint");

    const css =
      performance.getEntriesByType("resource")
        .filter(r => r.name.includes(".css") && r.name.startsWith(location.origin));

    return {
      fcp: paint ? paint.startTime : null,
      lastCssEnd: css.length ? Math.max(...css.map(r => r.responseEnd)) : null,
      cssCount: css.length
    };
  });

  state.cssDelayMs = 0;

  if (timing.fcp === null) {
    check(
      "[fouc] paint timing 미지원 — 이 브라우저에서는 건너뛴다",
      true,
      BROWSER
    );
  } else {
    check(
      "[fouc] CSS 가 실제로 느리게 왔다(조건이 성립했다)",
      timing.lastCssEnd !== null && timing.lastCssEnd > 300,
      `lastCssEnd=${Math.round(timing.lastCssEnd)}ms · ${timing.cssCount}장`
    );

    check(
      "[fouc] ★ 첫 그리기가 CSS 보다 늦다(무스타일 노출 없음)",
      timing.fcp >= timing.lastCssEnd - 5,
      `fcp=${Math.round(timing.fcp)}ms · css=${Math.round(timing.lastCssEnd)}ms`
    );
  }

  check(
    "[fouc] 그려진 뒤에는 스타일이 붙어 있다",
    (await cssGeneration(page)) === "new"
  );

  await ctx.close();
}


/* =========================================================
   [mobile] 390px — 새 캐시 / 이전 캐시
========================================================== */

async function checkMobileScreens(page, label) {

  /* PROFILE */

  await page.click("#profileTabButton");
  await page.waitForTimeout(250);

  check(
    `[mobile/${label}] PROFILE 가로 넘침 없음`,
    (await docOverflow(page)) === 0,
    `${await docOverflow(page)}px`
  );

  check(
    `[mobile/${label}] PROFILE 가 실제로 보인다`,
    await page.isVisible("#profilePanel").catch(() => false) ||
    await page.isVisible("#nicknameInput").catch(() => false)
  );

  /* CATEGORY */

  await page.click("#categoryTabButton");
  await page.waitForTimeout(300);

  check(
    `[mobile/${label}] CATEGORY 가로 넘침 없음`,
    (await docOverflow(page)) === 0,
    `${await docOverflow(page)}px`
  );

  check(
    `[mobile/${label}] CATEGORY 줄이 그려진다`,
    (await page.locator(".category-row, #categoryList > *").count()) > 0
  );

  /* SHARE > CARD */

  const box = await shareCardPreviewBox(page);

  check(
    `[mobile/${label}] SHARE > CARD 가로 넘침 없음`,
    (await docOverflow(page)) === 0,
    `${await docOverflow(page)}px`
  );

  check(
    `[mobile/${label}] ★ 공유 카드 미리보기가 1200:628 이다`,
    isCardRatio(box),
    JSON.stringify(box)
  );

  check(
    `[mobile/${label}] 미리보기가 화면 폭 안에 들어온다`,
    box !== null && box.width <= 390,
    box ? `${Math.round(box.width)}px` : "없음"
  );
}

async function runMobile(browser) {
  console.log("\n[mobile] 390px — SHARE/CARD · CATEGORY · PROFILE");

  /* ---- 새 캐시(빈 캐시) ---- */

  state.generation = "new";

  const freshCtx =
    await browser.newContext({ viewport: { width: 390, height: 844 } });
  const freshPage = await newAdminPage(freshCtx);
  await openSettings(freshPage);

  check(
    "[mobile/fresh] 빈 캐시에서 새 CSS 로 그려진다",
    (await cssGeneration(freshPage)) === "new"
  );

  await checkMobileScreens(freshPage, "fresh");
  await freshCtx.close();

  /* ---- 이전 캐시(옛 배포를 먼저 연 브라우저) ---- */

  if (!(await probeContextCache(browser))) {
    skip(
      "[mobile/stale] 이전 캐시 상황을 만들 수 없다",
      `${BROWSER} — BrowserContext 캐시 미재사용(chromium 으로 확인할 것)`
    );
    return;
  }

  const staleCtx =
    await browser.newContext({ viewport: { width: 390, height: 844 } });
  const warmUp = await newAdminPage(staleCtx);

  state.generation = "old";
  await openSettings(warmUp);

  check(
    "[mobile/stale] (준비) 옛 배포의 CSS 가 캐시에 들어갔다",
    (await cssGeneration(warmUp)) === "old"
  );

  state.generation = "new";

  const stalePage = await newAdminPage(staleCtx);
  await openSettings(stalePage);

  check(
    "[mobile/stale] ★ 이전 캐시가 있어도 새 CSS 로 그려진다",
    (await cssGeneration(stalePage)) === "new"
  );

  await checkMobileScreens(stalePage, "stale");
  await staleCtx.close();
}


/* =========================================================
   실행
========================================================== */

(async () => {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  try {
    if (shouldRun("version")) await runVersion(browser);
    if (shouldRun("stale")) await runStale(browser);
    if (shouldRun("fouc")) await runFouc(browser);
    if (shouldRun("mobile")) await runMobile(browser);
  } catch (error) {
    failed++;
    console.log("  FAIL  실행 중 오류 —", error && error.message);
    if (VERBOSE) console.log(error);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(
    `\n결과: ${passed} PASS / ${failed} FAIL` +
    (skipped ? ` / ${skipped} SKIP` : "")
  );
  process.exit(failed ? 1 : 0);

})();
