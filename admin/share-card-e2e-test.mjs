/* =========================================================
   SHARE CARD E2E — 설정 화면 · 카드 레이아웃 · 실제 OG 응답

   기준 문서: IMORY_SHARE_CARD_DESIGN.md

   저장소의 실제 admin/index.html · admin/**.js · core/lib/share-card.js
   를 그대로 띄우고, **배포되는 그 Pages Function 파일**
   (functions/_middleware.js · functions/api/og/post.js)을 node 에서
   그대로 import 해서 돌린다(skin/skin-gallery-e2e-test.mjs 의
   --only=access 와 같은 규약). Supabase 만 흉내 낸다.

   확인 범위

     settings  SETTINGS > SHARE 탭 이름 · 안쪽 BANNER/CARD 탭 ·
               기존 배너 기능이 그대로 있는가 · 카드 설정(사진 ·
               BLACK/WHITE · 강도 · 폰트) 저장과 재로드 유지 ·
               저장 전에는 서버에 아무것도 안 가는가 · version 갱신
     card      카드 레이아웃 실측 — 1200×628 · 바닥 100px 데드존 ·
               좌우 여백 48px 이상 · 긴 제목 2줄 · 고정 위치 ·
               BLACK/WHITE 글자색(순검정 아님) · 배경 우선순위
     preview   미리보기 대지가 데스크톱/모바일에서 1200:628 유지 ·
               슬라이더가 즉시 반영(문서 재생성 없이)
     meta      **서버 응답 HTML** 의 og/twitter meta — 공개 글의
               og:image·summary_large_image·1200×628, twitter:player
               없음, 비밀글/비공개 글의 제목·발췌·대표 이미지가
               응답에 없음, 글이 아닌 주소는 손대지 않음
     image     /api/og/post — 1200×628 PNG 반환(헤드리스 렌더러에
               넘긴 HTML 검사 포함) · 비밀글은 서비스 기본 카드 ·
               렌더러 설정이 없으면 기본 카드 · 버전은 실제 변경
               때만 달라짐
     cache     같은 post + v 재요청에 Browser Rendering 을 다시
               부르지 않는가 · immutable 응답 · **캐시가 권한
               검사를 건너뛰지 않는가**(비공개 전환 즉시 차단 +
               항목 삭제, 공개 전환 즉시 복구) · 기본 카드와 버전
               없는 주소는 담지 않는가 · caches 없는 런타임

   ★ 실행
     node admin/share-card-e2e-test.mjs
     node admin/share-card-e2e-test.mjs --only=meta      (브라우저 불필요)
     node admin/share-card-e2e-test.mjs --only=settings
     node admin/share-card-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8954;
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const OWNER_SLUG = "testuser";
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
   배포되는 그 파일 그대로
========================================================== */

const middleware = await import(
  pathToFileURL(path.join(ROOT, "functions", "_middleware.js")).href
);

const ogFunction = await import(
  pathToFileURL(path.join(ROOT, "functions", "api", "og", "post.js")).href
);

const shareCard = await import(
  pathToFileURL(path.join(ROOT, "core", "lib", "share-card.js")).href
);


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
   PNG 만들기/읽기 — 가짜 헤드리스 렌더러가 돌려줄 이미지
========================================================== */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function makePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

/* PNG 머리에서 실제 픽셀 크기를 읽는다 */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}


/* =========================================================
   DB fixture
========================================================== */

function makeDb(overrides = {}) {
  return {
    profiles: [{ user_id: OWNER_ID, slug: OWNER_SLUG, nickname: "테스트", bio: "", home_mode: "customize" }],

    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "테스트 블로그" },
      ...(overrides.settings || [])
    ],

    categories: overrides.categories || [
      {
        id: 1, user_id: OWNER_ID, name: "기록", type: "post", sort_order: 1, slug: "log",
        list_style: "list", page_size: 12, secret_cover_mode: "lock", secret_cover_path: null
      }
    ],

    posts: overrides.posts || [
      {
        id: 14, user_id: OWNER_ID, category_id: 1, title: "여름의 리허설",
        visibility: "public", content_type: "post",
        created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-11T00:00:00Z"
      }
    ],

    post_covers: overrides.post_covers || [],

    post_contents: overrides.post_contents || [
      { post_id: 14, content: "<p>무대 뒤에서 기다리는 동안 들리는 소리들.</p>" }
    ],

    banners: [],
    highlight_folder_settings: []
  };
}


/* =========================================================
   PostgREST 흉내 (브라우저 쪽 · admin 화면이 쓰는 만큼)
========================================================== */

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function matches(row, key, raw) {
  const m = /^(eq|in|is|neq)\.(.*)$/s.exec(raw);
  if (!m) return true;
  const [, op, val] = m;
  const cur = row[key];
  if (op === "in") {
    const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
    return list.includes(String(cur));
  }
  if (op === "is") return val === "null" ? (cur === null || cur === undefined) : String(cur) === val;
  if (op === "neq") return String(cur) !== val;
  return String(cur) === val;
}

function queryTable(db, table, params) {
  let rows = (db[table] || []).slice();
  for (const [key, raw] of params.entries()) {
    if (RESERVED.has(key)) continue;
    rows = rows.filter(row => matches(row, key, raw));
  }

  const order = params.get("order");
  if (order) {
    const [column, direction] = order.split(".");
    rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])));
    if ((direction || "").startsWith("desc")) rows.reverse();
  }

  const limit = Number(params.get("limit"));
  if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);

  const select = params.get("select");
  if (select && select !== "*") {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }
  return rows;
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function installSupabaseMock(page, opts = {}) {
  const {
    db = makeDb(),
    recorder = null,
    storageObjects = new Set(),
    settingsWriteFails = false
  } = opts;

  if (VERBOSE) {
    page.on("pageerror", (err) => console.log("    [pageerror]", err.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") {
        console.log("    [console]", m.type(), m.text());
      }
    });
  }

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (recorder) {
      recorder.push({ method: req.method(), path: url.pathname, body: req.postData() || "" });
    }

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({ user: { id: OWNER_ID, email: "owner@example.com" } })
      });
    }

    if (url.pathname.startsWith("/storage/v1/object/")) {
      const publicPrefix = "/storage/v1/object/public/";

      if (url.pathname.startsWith(publicPrefix)) {
        const key = decodeURIComponent(url.pathname.slice(publicPrefix.length)).split("?")[0];
        if (!storageObjects.has(key)) {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify({ statusCode: "404", error: "not_found" })
          });
        }
        return route.fulfill({ status: 200, headers, contentType: "image/png", body: PNG_1X1 });
      }

      if (req.method() === "DELETE") {
        let payload = {};
        try { payload = JSON.parse(req.postData() || "{}"); } catch { /* noop */ }
        const bucket = url.pathname.slice("/storage/v1/object/".length);
        (payload.prefixes || []).forEach(p => storageObjects.delete(`${bucket}/${p}`));
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify((payload.prefixes || []).map(name => ({ name })))
        });
      }

      if (req.method() === "POST") {
        const key = decodeURIComponent(url.pathname.slice("/storage/v1/object/".length));
        storageObjects.add(key);
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify({ Key: key })
        });
      }

      return route.fulfill({ status: 200, headers, contentType: "application/json", body: "{}" });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({ status: 200, headers, contentType: "application/json", body: "null" });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);

      if (req.method() === "POST" || req.method() === "PATCH") {
        if (settingsWriteFails && table === "site_settings") {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify({ code: "42501", message: "write refused (test)" })
          });
        }

        if (table === "site_settings") {
          let rows = [];
          try { rows = JSON.parse(req.postData() || "[]"); } catch { /* noop */ }
          (Array.isArray(rows) ? rows : [rows]).forEach((row) => {
            const found = db.site_settings.find(s => s.user_id === row.user_id && s.key === row.key);
            if (found) found.value = row.value;
            else db.site_settings.push({ ...row });
          });
        }

        return route.fulfill({ status: 201, headers, contentType: "application/json", body: "[]" });
      }

      if (req.method() === "DELETE") return route.fulfill({ status: 204, headers, body: "" });

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
   서버 — 저장소를 그대로 서빙 + 실제 Pages Function
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

/* 서버 쪽(Pages Function)이 보는 fixture — 절마다 갈아 끼운다 */
const serverFixture = {
  db: makeDb(),
  /* 헤드리스 렌더러에 넘어온 요청을 여기 담는다 */
  renders: [],
  /* 렌더러를 꺼 둘 수 있다(설정 없음 상황) */
  rendererEnabled: true
};

function readServerJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}


/*
  Pages Function 이 부르는 Supabase(anon). 브라우저 mock 과 달리
  **토큰을 보지 않는다** — 이 함수는 anon 키만 들고 가기 때문이다.
  그래서 anon 이 볼 수 있는 것만 돌려준다:

    · posts 는 public/secret 행을 준다(private 은 주지 않는다)
    · post_contents / post_covers 는 공개 글의 행만 준다
      (RLS 와 같은 판정)
*/
function serverRestQuery(table, params) {
  const db = serverFixture.db;

  if (table === "posts") {
    const visible = (db.posts || []).filter(p => p.visibility !== "private");
    return queryTable({ posts: visible }, "posts", params);
  }

  if (table === "post_contents") {
    const publicIds = new Set(
      (db.posts || []).filter(p => p.visibility === "public").map(p => String(p.id))
    );
    return queryTable(
      { post_contents: (db.post_contents || []).filter(r => publicIds.has(String(r.post_id))) },
      "post_contents",
      params
    );
  }

  if (table === "post_covers") {
    const publicIds = new Set(
      (db.posts || []).filter(p => p.visibility === "public").map(p => String(p.id))
    );
    return queryTable(
      { post_covers: (db.post_covers || []).filter(r => publicIds.has(String(r.post_id))) },
      "post_covers",
      params
    );
  }

  return queryTable(db, table, params);
}

const SERVER_SUPABASE_PREFIX = "/__supabase/rest/v1/";

function handleServerSupabase(req, res, rel, search) {
  const table = rel.slice(SERVER_SUPABASE_PREFIX.length);
  const rows = serverRestQuery(table, search);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(rows));
}


/* 가짜 Browser Rendering — 넘어온 HTML 을 기록하고 PNG 를 돌려준다 */
async function handleFakeRenderer(req, res) {
  const body = await readServerJsonBody(req);
  serverFixture.renders.push({
    html: body.html || "",
    viewport: body.viewport || null,
    authorization: req.headers["authorization"] || ""
  });

  if (!serverFixture.rendererEnabled) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, errors: [{ message: "disabled" }] }));
    return;
  }

  const png = makePng(
    (body.viewport && body.viewport.width) || 1200,
    (body.viewport && body.viewport.height) || 628
  );
  res.writeHead(200, { "Content-Type": "image/png", "Content-Length": String(png.length) });
  res.end(png);
}


function serverEnv(overrides = {}) {
  return {
    SUPABASE_URL: `http://localhost:${PORT}/__supabase`,
    SUPABASE_ANON_KEY: "anon-test-key",
    CF_BROWSER_RENDERING_ENDPOINT: `http://localhost:${PORT}/__render`,
    CF_BROWSER_RENDERING_TOKEN: "render-test-token",
    ...overrides
  };
}


/*
  배포와 같은 흐름: _middleware.onRequest(context) 가 next() 로
  정적 index.html(SPA fallback)을 받고, 글 주소면 meta 를 끼운다.
*/
async function requestPage(pathname, envOverrides = {}) {
  const request = new Request(`http://localhost:${PORT}${pathname}`, { method: "GET" });

  const staticHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  const response = await middleware.onRequest({
    request,
    env: serverEnv(envOverrides),
    next: async () =>
      new Response(staticHtml, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(staticHtml)),
          "ETag": '"static"',
          "Cache-Control": "no-cache"
        }
      })
  });

  return {
    status: response.status,
    headers: response.headers,
    html: await response.text()
  };
}

async function requestOgImage(query, envOverrides = {}) {
  const request = new Request(`http://localhost:${PORT}/api/og/post${query}`, { method: "GET" });

  const response = await ogFunction.onRequest({
    request,
    env: serverEnv(envOverrides)
  });

  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    cacheControl: response.headers.get("cache-control") || "",
    bytes: Buffer.from(await response.arrayBuffer())
  };
}


function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);

    if (rel === "/__render") {
      handleFakeRenderer(req, res).catch(() => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("render failed");
      });
      return;
    }

    if (rel.startsWith(SERVER_SUPABASE_PREFIX)) {
      handleServerSupabase(req, res, rel, url.searchParams);
      return;
    }

    /* 대표 이미지 프록시는 이 테스트의 대상이 아니다 — 있다고만 해 둔다 */
    if (rel === "/api/post-cover") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG_1X1);
      return;
    }

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

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   화면 열기
========================================================== */

async function openSettings(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 }
  });
  const page = await ctx.newPage();

  await installSignedInUser(page);
  await installSupabaseMock(page, opts);

  await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#openSettingsButton", { state: "visible", timeout: 20000 });
  await page.click("#openSettingsButton");
  await page.waitForTimeout(1200);

  return { ctx, page };
}

async function openShareCard(page) {
  await page.click("#shareTabButton");
  await page.waitForTimeout(200);
  await page.click("#shareCardTabButton");
  await page.waitForTimeout(700);
}

/* 미리보기 iframe 안의 문서 */
async function cardFrame(page) {
  await page.waitForFunction(() => {
    const frame = document.getElementById("shareCardPreviewFrame");
    return !!frame && !!frame.contentDocument &&
      !!frame.contentDocument.getElementById("shareCardTitle");
  }, null, { timeout: 20000 });

  return page.frames().find(f => {
    const name = f.name();
    return f !== page.mainFrame() && name !== undefined;
  }) || page.frames()[1];
}


/* =========================================================
   1. settings — 탭 구조 · 저장 · 재로드
========================================================== */

async function runSettings(browser) {
  console.log("\n[settings] SHARE > BANNER / CARD");

  const db = makeDb();
  const requests = [];
  const storage = new Set();

  const { ctx, page } = await openSettings(browser, {
    db, recorder: requests, storageObjects: storage
  });

  check(
    "[settings] 바깥 탭 이름이 SHARE 다",
    (await page.textContent("#shareTabButton") || "").trim() === "SHARE"
  );

  check(
    "[settings] 예전 BANNER 탭 버튼은 없다",
    await page.evaluate(() => !document.getElementById("bannerTabButton"))
  );

  await page.click("#shareTabButton");
  await page.waitForTimeout(300);

  check(
    "[settings] SHARE 를 열면 안쪽 BANNER 가 먼저 보인다",
    await page.evaluate(() => {
      const banner = document.getElementById("shareBannerInnerPanel");
      const card = document.getElementById("shareCardInnerPanel");
      return !!banner && !banner.hidden && !!card && card.hidden;
    })
  );

  check(
    "[settings] ★ 기존 배너 기능이 그대로 있다(미리보기·URL·고정주소·save)",
    await page.evaluate(() => {
      const exists = [
        "myBannerPreview", "myBannerPreviewEmpty", "myBannerFileInput",
        "myBannerUrlInput", "myBannerImageUrlDisplay",
        "myBannerCopyImageUrlButton", "myBannerSaveButton"
      ].every(id => !!document.getElementById(id));

      /* 실제로 보이는지 — 숨은 패널 안에 있으면 offsetParent 가 null 이다 */
      const visible = [
        "myBannerUrlInput", "myBannerImageUrlDisplay",
        "myBannerCopyImageUrlButton", "myBannerSaveButton"
      ].every(id => document.getElementById(id).offsetParent !== null);

      const changeLabel =
        document.querySelector('label[for="myBannerFileInput"]');

      return exists && visible && !!changeLabel && changeLabel.offsetParent !== null;
    })
  );

  await page.click("#shareCardTabButton");
  await page.waitForTimeout(700);

  check(
    "[settings] CARD 를 누르면 배너가 숨고 카드가 보인다",
    await page.evaluate(() => {
      const banner = document.getElementById("shareBannerInnerPanel");
      const card = document.getElementById("shareCardInnerPanel");
      return banner.hidden === true && card.hidden === false;
    })
  );

  /* ---- 저장 전에는 서버에 아무것도 안 간다 ---- */

  const beforeWrites = requests.filter(
    r => r.method === "POST" && r.path.includes("/rest/v1/site_settings")
  ).length;

  await page.click("#shareCardOverlayWhiteButton");
  await page.evaluate(() => {
    const slider = document.getElementById("shareCardOverlayStrength");
    slider.value = "30";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.selectOption("#shareCardFontSelect", "nanum-myeongjo");
  await page.waitForTimeout(400);

  check(
    "[settings] ★ 저장 전에는 site_settings 에 아무것도 쓰지 않는다",
    requests.filter(
      r => r.method === "POST" && r.path.includes("/rest/v1/site_settings")
    ).length === beforeWrites
  );

  check(
    "[settings] 강도 표시가 즉시 바뀐다",
    (await page.textContent("#shareCardOverlayStrengthValue") || "").trim() === "30%"
  );

  /* ---- 사진 고르기 = 새 경로 업로드 ---- */

  const beforeUpload = requests.length;

  await page.setInputFiles("#shareCardPhotoInput", {
    name: "card.png", mimeType: "image/png", buffer: PNG_1X1
  });
  await page.waitForTimeout(900);

  const uploads = requests.slice(beforeUpload).filter(
    r => r.method === "POST" && r.path.includes("/storage/v1/object/user-share-cards/")
  );

  check(
    "[settings] 사진을 고르면 user-share-cards 버킷의 새 경로에 올라간다",
    uploads.length === 1 && /user-share-cards\/[0-9a-f-]+\/[0-9a-z-]+$/i.test(uploads[0].path),
    uploads[0] && uploads[0].path
  );

  check(
    "[settings] 아직 저장 전이라는 안내가 뜬다",
    (await page.textContent("#shareCardUploadMessage") || "").includes("save")
  );

  /* ---- 저장 ---- */

  await page.click("#shareCardSaveButton");
  await page.waitForTimeout(900);

  check(
    "[settings] 저장 완료 안내가 뜬다",
    (await page.textContent("#shareCardSaveMessage") || "").includes("saved")
  );

  const savedRow = db.site_settings.find(s => s.key === "share_card");
  let savedValue = null;
  try { savedValue = JSON.parse(savedRow ? savedRow.value : "null"); } catch { /* noop */ }

  check(
    "[settings] ★ share_card 한 칸에 구조화된 JSON 으로 저장된다",
    !!savedValue &&
    savedValue.overlay === "white" &&
    savedValue.overlay_strength === 30 &&
    savedValue.font === "nanum-myeongjo" &&
    typeof savedValue.image_url === "string" &&
    savedValue.image_url.includes("user-share-cards"),
    savedRow && savedRow.value
  );

  check(
    "[settings] ★ 저장할 때 version 이 갱신된다(SNS 캐시 갱신용)",
    !!savedValue && /^[0-9]{10,}$/.test(String(savedValue.version)),
    savedValue && String(savedValue.version)
  );

  /* ---- 새로고침 뒤에도 유지 ---- */

  await ctx.close();

  const reopened = await openSettings(browser, { db, storageObjects: storage });
  await openShareCard(reopened.page);

  const restored = await reopened.page.evaluate(() => ({
    white: document.getElementById("shareCardOverlayWhiteButton").getAttribute("aria-pressed"),
    black: document.getElementById("shareCardOverlayBlackButton").getAttribute("aria-pressed"),
    strength: document.getElementById("shareCardOverlayStrength").value,
    font: document.getElementById("shareCardFontSelect").value,
    photo: !document.getElementById("shareCardPhotoPreview").hidden
  }));

  check(
    "[settings] ★ 새로고침 뒤에도 BLACK/WHITE · 강도 · 폰트가 그대로다",
    restored.white === "true" && restored.black === "false" &&
    restored.strength === "30" && restored.font === "nanum-myeongjo",
    JSON.stringify(restored)
  );

  check(
    "[settings] 저장된 기본 사진이 미리보기에 뜬다",
    restored.photo
  );

  await reopened.ctx.close();
}


/* =========================================================
   2. card — 카드 레이아웃 실측 (요구사항 §2)
========================================================== */

async function runCard(browser) {
  console.log("\n[card] 카드 레이아웃 · 데드존 · 배경 우선순위");

  /* 대표 이미지가 있는 공개 글 + 아주 긴 제목 */
  const db = makeDb({
    posts: [{
      id: 14, user_id: OWNER_ID, category_id: 1,
      title: "여름의 리허설 그리고 아주 길어서 두 줄을 넘기고도 남는 제목 " +
             "한참 더 이어지는 문장 그리고 또 더",
      visibility: "public", content_type: "post",
      created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-11T00:00:00Z"
    }],
    post_covers: [{ post_id: 14, mime_type: "image/png" }]
  });

  const { ctx, page } = await openSettings(browser, { db });
  await openShareCard(page);

  const frame = await cardFrame(page);

  const geometry = await frame.evaluate(() => {
    const card = document.getElementById("shareCard");
    const title = document.getElementById("shareCardTitle");
    const meta = document.getElementById("shareCardMeta");
    const domain = document.getElementById("shareCardDomain");
    const label = document.getElementById("shareCardLabel");
    const category = document.getElementById("shareCardCategory");

    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };

    const titleStyle = getComputedStyle(title);

    return {
      card: rect(card),
      title: rect(title),
      meta: rect(meta),
      domain: rect(domain),
      label: rect(label),
      category: rect(category),
      lineHeight: parseFloat(titleStyle.lineHeight),
      titleColor: titleStyle.color,
      background: getComputedStyle(document.getElementById("shareCardBackground")).backgroundImage
    };
  });

  check(
    "[card] 대지가 정확히 1200 × 628 이다",
    geometry.card.right - geometry.card.left === 1200 &&
    geometry.card.bottom - geometry.card.top === 628,
    `${geometry.card.right - geometry.card.left}x${geometry.card.bottom - geometry.card.top}`
  );

  const lowest = Math.max(
    geometry.title.bottom, geometry.meta.bottom, geometry.domain.bottom
  );

  check(
    "[card] ★ 제목·메타·도메인의 바닥 기준선이 캔버스 바닥에서 100px 이상 위다",
    628 - lowest >= 100,
    `바닥에서 ${(628 - lowest).toFixed(1)}px`
  );

  check(
    "[card] ★ 핵심 글자가 y = 350~525 범위에 있다",
    geometry.category.top >= 340 && lowest <= 528,
    `top=${geometry.category.top.toFixed(1)} bottom=${lowest.toFixed(1)}`
  );

  check(
    "[card] 좌우 여백이 48px 이상이다",
    geometry.title.left >= 48 && 1200 - geometry.domain.right >= 48 &&
    1200 - geometry.label.right >= 48,
    `left=${geometry.title.left} right=${1200 - geometry.domain.right}`
  );

  check(
    "[card] ★ 긴 제목이 정확히 2줄로 잘린다",
    geometry.title.height <= geometry.lineHeight * 2 + 1,
    `높이 ${geometry.title.height.toFixed(1)}px / 한 줄 ${geometry.lineHeight}px`
  );

  check(
    "[card] 우상단 라벨이 POST + 세 자리 번호다",
    /^POST 0*14$/.test((await frame.textContent("#shareCardLabel") || "").trim()),
    (await frame.textContent("#shareCardLabel") || "").trim()
  );

  check(
    "[card] ★ 배경이 글 대표 이미지 프록시(/api/post-cover)다",
    geometry.background.includes("/api/post-cover?post=14"),
    geometry.background.slice(0, 80)
  );

  /* ---- 사진 구도와 무관하게 제목 자리는 고정 ---- */

  const movedTitleTop = await frame.evaluate(() => {
    const background = document.getElementById("shareCardBackground");
    background.style.backgroundImage = "";
    background.style.backgroundPosition = "top left";
    return document.getElementById("shareCardTitle").getBoundingClientRect().top;
  });

  check(
    "[card] ★ 배경이 바뀌어도 제목 자리가 움직이지 않는다",
    Math.abs(movedTitleTop - geometry.title.top) < 0.5,
    `${geometry.title.top.toFixed(1)} → ${movedTitleTop.toFixed(1)}`
  );

  /* ---- WHITE 는 짙은 회색, 순검정 아님 ---- */

  await page.click("#shareCardOverlayWhiteButton");
  await page.waitForTimeout(400);

  const whiteColors = await frame.evaluate(() => ({
    title: getComputedStyle(document.getElementById("shareCardTitle")).color,
    meta: getComputedStyle(document.getElementById("shareCardMeta")).color
  }));

  check(
    "[card] ★ WHITE 오버레이의 글자는 짙은 회색이고 순검정이 아니다",
    whiteColors.title === "rgb(51, 51, 51)" && whiteColors.meta === "rgb(85, 85, 85)",
    JSON.stringify(whiteColors)
  );

  await page.click("#shareCardOverlayBlackButton");
  await page.waitForTimeout(400);

  const blackTitle = await frame.evaluate(
    () => getComputedStyle(document.getElementById("shareCardTitle")).color
  );

  check(
    "[card] BLACK 오버레이의 글자는 흰색 계열이다",
    blackTitle === "rgb(255, 255, 255)",
    blackTitle
  );

  await ctx.close();


  /* ---- 대표 이미지가 없으면 기본 카드 사진으로 ---- */

  const cardImageUrl =
    `https://${SUPABASE_HOST}/storage/v1/object/public/user-share-cards/${OWNER_ID}/default`;

  const db2 = makeDb({
    post_covers: [],
    settings: [{
      user_id: OWNER_ID,
      key: "share_card",
      value: JSON.stringify({
        image_url: cardImageUrl,
        overlay: "black",
        overlay_strength: 60,
        font: "pretendard",
        version: "1757800000000"
      })
    }]
  });

  const second = await openSettings(browser, {
    db: db2,
    storageObjects: new Set([`user-share-cards/${OWNER_ID}/default`])
  });

  await openShareCard(second.page);

  const frame2 = await cardFrame(second.page);

  const background2 = await frame2.evaluate(
    () => getComputedStyle(document.getElementById("shareCardBackground")).backgroundImage
  );

  check(
    "[card] ★ 글 대표 이미지가 없으면 기본 카드 사진을 쓴다",
    background2.includes("user-share-cards"),
    background2.slice(0, 90)
  );

  await second.ctx.close();


  /* ---- 공개 글이 하나도 없으면 placeholder ---- */

  const db3 = makeDb({ posts: [], post_contents: [] });
  const third = await openSettings(browser, { db: db3 });
  await openShareCard(third.page);

  const frame3 = await cardFrame(third.page);

  check(
    "[card] 공개 글이 없으면 안전한 예시 제목으로 보여준다",
    (await frame3.textContent("#shareCardTitle") || "").trim().length > 0 &&
    (await third.page.textContent("#shareCardPreviewNote") || "").includes("공개된 글이 없어")
  );

  await third.ctx.close();
}


/* =========================================================
   3. preview — 대지 비율 · 즉시 반영
========================================================== */

async function runPreview(browser) {
  console.log("\n[preview] 1200:628 유지 · 즉시 반영");

  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile", width: 390, height: 780 }
  ]) {

    const { ctx, page } = await openSettings(browser, {
      db: makeDb(),
      viewport: { width: viewport.width, height: viewport.height }
    });

    await openShareCard(page);
    await page.waitForTimeout(500);

    const box = await page.evaluate(() => {
      const node = document.getElementById("shareCardPreviewBox");
      const frame = document.getElementById("shareCardPreviewFrame");
      const rect = node.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        /* 테두리를 뺀 안쪽 폭 — 카드가 채워야 하는 크기 */
        innerWidth: node.clientWidth,
        frameWidth: frameRect.width,
        overflowX: document.documentElement.scrollWidth > window.innerWidth
      };
    });

    check(
      `[preview/${viewport.name}] 대지 비율이 1200:628 이다`,
      Math.abs(box.width / box.height - 1200 / 628) < 0.02,
      `${box.width.toFixed(1)} x ${box.height.toFixed(1)}`
    );

    check(
      `[preview/${viewport.name}] 카드가 대지 폭에 맞게 줄어든다`,
      Math.abs(box.frameWidth - box.innerWidth) < 1.5,
      `frame=${box.frameWidth.toFixed(1)} box=${box.innerWidth.toFixed(1)}`
    );

    check(
      `[preview/${viewport.name}] 가로 넘침이 없다`,
      box.overflowX === false
    );

    await ctx.close();
  }

  /* 슬라이더를 끌어도 문서를 다시 만들지 않는다(배경 재요청 없음) */

  const { ctx, page } = await openSettings(browser, { db: makeDb() });
  await openShareCard(page);

  const frame = await cardFrame(page);

  await frame.evaluate(() => { window.__imoryCardMarker = "kept"; });

  await page.evaluate(() => {
    const slider = document.getElementById("shareCardOverlayStrength");
    slider.value = "88";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(400);

  const after = await frame.evaluate(() => ({
    marker: window.__imoryCardMarker,
    alpha: document.documentElement.style.getPropertyValue("--share-card-alpha")
  }));

  check(
    "[preview] ★ 슬라이더는 문서를 다시 만들지 않고 즉시 반영된다",
    after.marker === "kept" && Math.abs(Number(after.alpha) - 0.88) < 0.01,
    JSON.stringify(after)
  );

  await ctx.close();
}


/* =========================================================
   4. meta — 서버 응답 HTML (브라우저 없이 돈다)
========================================================== */

/*
  속성 값은 HTML 이스케이프돼 있다(& → &amp;). 크롤러가 실제로 읽는
  값은 디코드한 쪽이므로 여기서도 되돌려 비교한다.
*/
function decodeAttribute(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function metaOf(html, key) {
  const property = new RegExp(
    `<meta\\s+property="${key}"\\s+content="([^"]*)"`, "i"
  ).exec(html);
  if (property) return decodeAttribute(property[1]);
  const name = new RegExp(
    `<meta\\s+name="${key}"\\s+content="([^"]*)"`, "i"
  ).exec(html);
  return name ? decodeAttribute(name[1]) : null;
}

async function runMeta() {
  console.log("\n[meta] 공개 글 주소의 서버 응답");

  serverFixture.db = makeDb({
    post_covers: [{ post_id: 14, mime_type: "image/png" }]
  });

  const page = await requestPage(`/${OWNER_SLUG}/post/14`);

  check(
    "[meta] 글 주소도 200 HTML 이다(SPA fallback 그대로)",
    page.status === 200 && page.html.includes("<title>imory</title>")
  );

  check(
    "[meta] ★ twitter:card = summary_large_image",
    metaOf(page.html, "twitter:card") === "summary_large_image"
  );

  check(
    "[meta] ★ og:image 가 크롤러가 받을 수 있는 절대 URL 이다",
    /^http:\/\/localhost:\d+\/api\/og\/post\?post=14&v=[a-z0-9]+$/.test(
      metaOf(page.html, "og:image") || ""
    ),
    metaOf(page.html, "og:image")
  );

  check(
    "[meta] og:image:width/height 가 1200 × 628 이다",
    metaOf(page.html, "og:image:width") === "1200" &&
    metaOf(page.html, "og:image:height") === "628"
  );

  check(
    "[meta] twitter:image 가 og:image 와 같다",
    metaOf(page.html, "twitter:image") === metaOf(page.html, "og:image")
  );

  check(
    "[meta] og:title / twitter:title 에 글 제목이 들어간다",
    (metaOf(page.html, "og:title") || "").includes("여름의 리허설") &&
    (metaOf(page.html, "twitter:title") || "").includes("여름의 리허설"),
    metaOf(page.html, "og:title")
  );

  check(
    "[meta] og:description 이 본문 발췌다(태그 없이)",
    (metaOf(page.html, "og:description") || "").includes("무대 뒤에서") &&
    !(metaOf(page.html, "og:description") || "").includes("<")
  );

  check(
    "[meta] og:url 이 그 글 주소다",
    (metaOf(page.html, "og:url") || "").endsWith(`/${OWNER_SLUG}/post/14`),
    metaOf(page.html, "og:url")
  );

  check(
    "[meta] ★ twitter:player / 영상 카드 meta 는 없다",
    !/twitter:player/i.test(page.html) &&
    !/og:video/i.test(page.html) &&
    !/twitter:card"\s+content="player/i.test(page.html)
  );

  check(
    "[meta] ★ og:title 이 한 번만 적힌다(기본 블록을 교체한다)",
    (page.html.match(/property="og:title"/g) || []).length === 1
  );

  check(
    "[meta] content-length / etag 를 남겨두지 않는다(본문을 고쳤으므로)",
    !page.headers.get("content-length") && !page.headers.get("etag")
  );


  /* ---- 비밀글 / 비공개 글 ---- */

  for (const visibility of ["secret", "private"]) {

    serverFixture.db = makeDb({
      posts: [{
        id: 14, user_id: OWNER_ID, category_id: 1, title: "숨겨둔 제목",
        visibility, content_type: "post",
        created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-11T00:00:00Z"
      }],
      post_covers: [{ post_id: 14, mime_type: "image/png" }],
      post_contents: [{ post_id: 14, content: "<p>아무도 못 읽을 본문</p>" }]
    });

    const hidden = await requestPage(`/${OWNER_SLUG}/post/14`);

    check(
      `[meta/${visibility}] ★ 제목이 응답 어디에도 없다`,
      !hidden.html.includes("숨겨둔 제목")
    );

    check(
      `[meta/${visibility}] ★ 본문 발췌가 응답 어디에도 없다`,
      !hidden.html.includes("아무도 못 읽을")
    );

    check(
      `[meta/${visibility}] ★ 대표 이미지 주소가 og:image 에 없다`,
      !(metaOf(hidden.html, "og:image") || "").includes("post-cover") &&
      (metaOf(hidden.html, "og:image") || "").includes("share-card-default.png"),
      metaOf(hidden.html, "og:image")
    );

    check(
      `[meta/${visibility}] 그래도 카드는 깨지지 않는다(기본 카드 + 블로그 제목)`,
      metaOf(hidden.html, "twitter:card") === "summary_large_image" &&
      metaOf(hidden.html, "og:title") === "테스트 블로그",
      metaOf(hidden.html, "og:title")
    );

  }


  /* ---- 다른 사람의 slug 에 남의 글 id ---- */

  serverFixture.db = makeDb();

  const mismatched = await requestPage("/otherblog/post/14");

  check(
    "[meta] slug 와 글 주인이 다르면 글 정보를 쓰지 않는다",
    !mismatched.html.includes("여름의 리허설") &&
    (metaOf(mismatched.html, "og:image") || "").includes("share-card-default.png")
  );


  /* ---- 글이 아닌 주소는 손대지 않는다 ---- */

  const home = await requestPage(`/${OWNER_SLUG}`);
  const category = await requestPage(`/${OWNER_SLUG}/category/1`);
  const staticHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  check(
    "[meta] 홈 · 카테고리 주소의 HTML 은 그대로다(사이트 기본 카드)",
    home.html === staticHtml && category.html === staticHtml
  );

  check(
    "[meta] 사이트 기본 카드도 summary_large_image 다",
    metaOf(staticHtml, "twitter:card") === "summary_large_image" &&
    (metaOf(staticHtml, "og:image") || "").includes("share-card-default.png")
  );
}


/* =========================================================
   5. image — /api/og/post (브라우저 없이 돈다)
========================================================== */

async function runImage() {
  console.log("\n[image] /api/og/post");

  serverFixture.db = makeDb({
    post_covers: [{ post_id: 14, mime_type: "image/png" }],
    settings: [{
      user_id: OWNER_ID,
      key: "share_card",
      value: JSON.stringify({
        image_url: "https://example.test/card.png",
        overlay: "white",
        overlay_strength: 42,
        font: "nanum-myeongjo",
        version: "1757800000000"
      })
    }]
  });

  serverFixture.renders = [];
  serverFixture.rendererEnabled = true;

  const image = await requestOgImage("?post=14&v=abc123");

  check(
    "[image] ★ 1200 × 628 PNG 를 돌려준다",
    image.status === 200 &&
    image.contentType === "image/png" &&
    JSON.stringify(pngSize(image.bytes)) === JSON.stringify({ width: 1200, height: 628 }),
    `${image.status} ${image.contentType} ${JSON.stringify(pngSize(image.bytes))}`
  );

  check(
    "[image] 버전이 붙은 주소는 길게 캐시된다",
    image.cacheControl.includes("immutable"),
    image.cacheControl
  );

  const render = serverFixture.renders[0];

  check(
    "[image] 헤드리스 렌더러를 1200 × 628 뷰포트로 부른다",
    !!render && render.viewport.width === 1200 && render.viewport.height === 628
  );

  check(
    "[image] 렌더러 토큰을 Authorization 으로 보낸다",
    !!render && render.authorization === "Bearer render-test-token"
  );

  check(
    "[image] ★ 렌더러에 넘긴 HTML 이 설정 화면과 같은 카드 문서다",
    !!render &&
    render.html.includes('id="shareCard"') &&
    render.html.includes("여름의 리허설") &&
    render.html.includes('data-overlay="white"') &&
    render.html.includes('data-font="nanum-myeongjo"') &&
    render.html.includes("--share-card-alpha:0.420")
  );

  check(
    "[image] ★ 배경은 대표 이미지 프록시 주소다(버킷/서명 URL 이 아니다)",
    !!render &&
    render.html.includes("/api/post-cover?post=14") &&
    !render.html.includes("storage/v1/object")
  );

  check(
    "[image] 카드 문서가 두 웹폰트를 모두 링크한다(고른 폰트가 확실히 로드된다)",
    !!render &&
    render.html.includes("pretendard.css") &&
    render.html.includes("Nanum+Myeongjo")
  );

  /* ---- 대표 이미지가 없으면 기본 카드 사진 ---- */

  serverFixture.db.post_covers = [];
  serverFixture.renders = [];

  await requestOgImage("?post=14&v=def456");

  check(
    "[image] ★ 대표 이미지가 없으면 기본 카드 사진을 배경으로 쓴다",
    serverFixture.renders[0].html.includes("https://example.test/card.png")
  );

  /* ---- 비밀글 ---- */

  serverFixture.db = makeDb({
    posts: [{
      id: 14, user_id: OWNER_ID, category_id: 1, title: "숨겨둔 제목",
      visibility: "secret", content_type: "post",
      created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-11T00:00:00Z"
    }],
    post_covers: [{ post_id: 14, mime_type: "image/png" }]
  });

  serverFixture.renders = [];

  const secret = await requestOgImage("?post=14&v=abc123");

  check(
    "[image] ★ 비밀글은 카드를 그리지 않는다(렌더러를 아예 부르지 않는다)",
    serverFixture.renders.length === 0
  );

  check(
    "[image] ★ 비밀글에는 서비스 기본 카드(1200 × 628)를 준다",
    secret.status === 200 &&
    secret.contentType === "image/png" &&
    JSON.stringify(pngSize(secret.bytes)) === JSON.stringify({ width: 1200, height: 628 }),
    `${secret.status} ${JSON.stringify(pngSize(secret.bytes))}`
  );

  /* ---- 렌더러 설정이 없을 때 ---- */

  serverFixture.db = makeDb();

  const unconfigured = await requestOgImage("?post=14&v=abc123", {
    CF_BROWSER_RENDERING_ENDPOINT: "",
    CF_BROWSER_RENDERING_TOKEN: "",
    CF_ACCOUNT_ID: ""
  });

  check(
    "[image] ★ 렌더러 설정이 없으면 기본 카드로 내려간다(깨진 이미지 없음)",
    unconfigured.status === 200 &&
    unconfigured.contentType === "image/png" &&
    JSON.stringify(pngSize(unconfigured.bytes)) ===
      JSON.stringify({ width: 1200, height: 628 })
  );

  check(
    "[image] 그때 캐시는 짧다(설정이 채워지면 곧 실제 카드가 된다)",
    unconfigured.cacheControl.includes("max-age=300"),
    unconfigured.cacheControl
  );

  /* ---- 렌더가 실패할 때 ---- */

  serverFixture.rendererEnabled = false;
  serverFixture.renders = [];

  const failed = await requestOgImage("?post=14&v=abc123");

  check(
    "[image] 렌더가 실패해도 기본 카드를 준다",
    failed.status === 200 && failed.contentType === "image/png"
  );

  serverFixture.rendererEnabled = true;

  /* ---- 잘못된 질의 ---- */

  const bad = await requestOgImage("?post=abc");

  check(
    "[image] 잘못된 글 id 는 400",
    bad.status === 400,
    String(bad.status)
  );


  /* ---- 버전은 실제 변경 때만 달라진다 ---- */

  const tokenA = ogFunction.shareCardVersionToken(["1", "", "2026-09-11T00:00:00Z", "0"]);
  const tokenB = ogFunction.shareCardVersionToken(["1", "", "2026-09-11T00:00:00Z", "0"]);
  const tokenC = ogFunction.shareCardVersionToken(["2", "", "2026-09-11T00:00:00Z", "0"]);
  const tokenD = ogFunction.shareCardVersionToken(["1", "", "2026-09-12T00:00:00Z", "0"]);
  const tokenE = ogFunction.shareCardVersionToken(["1", "", "2026-09-11T00:00:00Z", "1"]);

  check(
    "[image] ★ 같은 상태면 버전이 같다(매 요청 timestamp 를 붙이지 않는다)",
    tokenA === tokenB
  );

  check(
    "[image] ★ 카드 설정 · 글 수정 · 대표 이미지 유무가 바뀌면 버전이 달라진다",
    new Set([tokenA, tokenC, tokenD, tokenE]).size === 4
  );


  /* ---- 발췌에 HTML 이 새지 않는다 ---- */

  check(
    "[image] 본문 발췌는 태그와 엔티티를 지운다",
    shareCard.collapseShareCardText(
      ogFunction.shareCardExcerpt("<p>가<br>나</p><script>alert(1)</script>&amp;다")
    ) === "가 나 &다",
    ogFunction.shareCardExcerpt("<p>가<br>나</p><script>alert(1)</script>&amp;다")
  );
}


/* =========================================================
   6. cache — 같은 post + v 는 두 번 그리지 않는다 (브라우저 불필요)

   node 에는 Workers Cache API(`caches`)가 없다. Supabase 와
   Browser Rendering 을 흉내 내는 것과 같은 방식으로 이것도 최소
   구현을 끼운다 — 배포되는 코드는 그대로 두고 런타임만 채운다.
========================================================== */

function installCacheShim() {
  const store = new Map();

  globalThis.caches = {
    default: {
      async match(request) {
        const entry = store.get(request.url);
        if (!entry) return undefined;
        return new Response(entry.body, { status: 200, headers: entry.headers });
      },
      async put(request, response) {
        const body = Buffer.from(await response.arrayBuffer());
        store.set(request.url, {
          body,
          headers: Object.fromEntries(response.headers.entries())
        });
      },
      async delete(request) {
        return store.delete(request.url);
      }
    }
  };

  return {
    store,
    uninstall() { delete globalThis.caches; }
  };
}


async function runCache() {
  console.log("\n[cache] 같은 post + v 는 다시 렌더하지 않는다");

  const shim = installCacheShim();

  try {

    serverFixture.db = makeDb({
      post_covers: [{ post_id: 14, mime_type: "image/png" }]
    });
    serverFixture.renders = [];
    serverFixture.rendererEnabled = true;

    /* ---- 1) 첫 요청 — 렌더하고 캐시에 담는다 ---- */

    const first = await requestOgImage("?post=14&v=aaa111");

    check(
      "[cache] 첫 요청은 1200 × 628 PNG 를 그린다",
      first.status === 200 &&
      JSON.stringify(pngSize(first.bytes)) === JSON.stringify({ width: 1200, height: 628 }) &&
      serverFixture.renders.length === 1,
      `renders=${serverFixture.renders.length}`
    );

    check(
      "[cache] 응답이 immutable 로 나간다",
      first.cacheControl === "public, max-age=31536000, immutable",
      first.cacheControl
    );

    check(
      "[cache] 버전이 붙은 주소가 캐시에 담긴다",
      shim.store.size === 1 && [...shim.store.keys()][0].includes("v=aaa111"),
      [...shim.store.keys()].join(" ")
    );

    /* ---- 2) 같은 주소 재요청 — 렌더러를 다시 부르지 않는다 ---- */

    const second = await requestOgImage("?post=14&v=aaa111");

    check(
      "[cache] ★ 같은 post + v 재요청에 Browser Rendering 을 다시 부르지 않는다",
      serverFixture.renders.length === 1,
      `renders=${serverFixture.renders.length}`
    );

    check(
      "[cache] 그래도 같은 PNG 를 그대로 준다",
      second.status === 200 &&
      second.contentType === "image/png" &&
      second.bytes.equals(first.bytes) &&
      second.cacheControl === first.cacheControl
    );

    /* ---- 3) HEAD 도 캐시를 쓰고 본문을 싣지 않는다 ---- */

    const headRequest = new Request(
      `http://localhost:${PORT}/api/og/post?post=14&v=aaa111`,
      { method: "HEAD" }
    );

    const headResponse = await ogFunction.onRequest({
      request: headRequest,
      env: serverEnv()
    });

    const headBytes = Buffer.from(await headResponse.arrayBuffer());

    check(
      "[cache] HEAD 는 본문 없이 200 이고 렌더러를 부르지 않는다",
      headResponse.status === 200 &&
      headBytes.length === 0 &&
      headResponse.headers.get("content-type") === "image/png" &&
      serverFixture.renders.length === 1,
      `len=${headBytes.length} renders=${serverFixture.renders.length}`
    );

    /* ---- 4) 버전 없는 주소는 공유 캐시에 담지 않는다 ---- */

    const unversioned = await requestOgImage("?post=14");

    check(
      "[cache] ★ 버전 없는 주소는 캐시에 담지 않는다(내용이 나중에 달라질 수 있다)",
      shim.store.size === 1 && serverFixture.renders.length === 2,
      `store=${shim.store.size} renders=${serverFixture.renders.length}`
    );

    check(
      "[cache] 버전 없는 주소의 캐시는 짧다",
      unversioned.cacheControl === "public, max-age=300",
      unversioned.cacheControl
    );

    /* ---- 5) 비밀글로 바꾸면 캐시된 카드가 나가지 않는다 ---- */

    serverFixture.db.posts[0].visibility = "secret";

    const afterHide = await requestOgImage("?post=14&v=aaa111");

    check(
      "[cache] ★ 캐시에 있어도 비공개로 바뀌면 그 바이트를 내보내지 않는다",
      afterHide.cacheControl === "public, max-age=300" &&
      JSON.stringify(pngSize(afterHide.bytes)) ===
        JSON.stringify({ width: 1200, height: 628 }),
      afterHide.cacheControl
    );

    check(
      "[cache] ★ 그 캐시 항목을 지운다(권한 검사가 캐시보다 먼저다)",
      shim.store.size === 0,
      `store=${shim.store.size}`
    );

    check(
      "[cache] 비공개 판정에서는 렌더러를 부르지 않는다",
      serverFixture.renders.length === 2,
      `renders=${serverFixture.renders.length}`
    );

    /* ---- 6) 기본 카드로 내려간 응답도 담지 않는다 ---- */

    await requestOgImage("?post=14&v=bbb222");
    await requestOgImage("?post=14&v=bbb222");

    check(
      "[cache] ★ 기본 카드 응답은 캐시에 담지 않는다",
      shim.store.size === 0,
      `store=${shim.store.size}`
    );

    /* ---- 7) 다시 공개로 바꾸면 곧바로 실제 카드가 나온다 ---- */

    serverFixture.db.posts[0].visibility = "public";

    const afterShow = await requestOgImage("?post=14&v=bbb222");

    check(
      "[cache] ★ 다시 공개로 바꾸면 같은 주소에서 바로 실제 카드가 나온다",
      serverFixture.renders.length === 3 &&
      afterShow.cacheControl === "public, max-age=31536000, immutable" &&
      JSON.stringify(pngSize(afterShow.bytes)) ===
        JSON.stringify({ width: 1200, height: 628 }),
      `renders=${serverFixture.renders.length} ${afterShow.cacheControl}`
    );

    check(
      "[cache] 그 카드가 다시 캐시에 담긴다",
      shim.store.size === 1 && [...shim.store.keys()][0].includes("v=bbb222"),
      [...shim.store.keys()].join(" ")
    );

    /* ---- 8) 캐시가 없는 런타임에서도 동작한다 ---- */

    shim.uninstall();

    serverFixture.renders = [];

    const noCache = await requestOgImage("?post=14&v=aaa111");

    check(
      "[cache] caches 전역이 없어도(캐시 미지원) 정상 동작한다",
      noCache.status === 200 &&
      noCache.contentType === "image/png" &&
      serverFixture.renders.length === 1
    );

  } finally {

    if (globalThis.caches) shim.uninstall();

  }
}


/* =========================================================
   MAIN
========================================================== */

(async () => {

  const server = await startServer();
  console.log(`정적 서버: http://localhost:${PORT}`);

  const needsBrowser =
    shouldRun("settings") || shouldRun("card") || shouldRun("preview");

  let browser = null;

  try {

    if (needsBrowser) {
      const playwright = await loadPlaywright(BROWSER);
      browser = await playwright[BROWSER].launch();
    }

    if (shouldRun("settings")) await runSettings(browser);
    if (shouldRun("card")) await runCard(browser);
    if (shouldRun("preview")) await runPreview(browser);
    if (shouldRun("meta")) await runMeta();
    if (shouldRun("image")) await runImage();
    if (shouldRun("cache")) await runCache();

  } catch (err) {

    console.error("\n실행 중 오류:", err);
    failed += 1;

  } finally {

    if (browser) await browser.close();
    server.close();

  }

  console.log(`\n결과: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);

})();
