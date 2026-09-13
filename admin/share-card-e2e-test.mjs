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

/* IMORY_SHARE_SHOT=<디렉터리> — 눈으로 볼 스크린샷을 남긴다 */
const SHOT_DIR = process.env.IMORY_SHARE_SHOT || "";

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
        id: 14, user_id: OWNER_ID, category_id: 1, folder_id: null,
        title: "여름의 리허설",
        visibility: "public", content_type: "post", share_label_seq: 34,
        created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-11T00:00:00Z"
      }
    ],

    post_folders: overrides.post_folders || [],

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
  const m = /^(eq|in|is|neq|lte|gte|lt|gt)\.(.*)$/s.exec(raw);
  if (!m) return true;
  const [, op, val] = m;
  const cur = row[key];
  if (op === "lte") return String(cur) <= val;
  if (op === "gte") return String(cur) >= val;
  if (op === "lt") return String(cur) < val;
  if (op === "gt") return String(cur) > val;
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
    settingsWriteFails = false,
    missingShareLabelSeq = false
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

      /* migration 이 아직 없는 배포 */
      if (
        missingShareLabelSeq &&
        (url.searchParams.get("select") || "").includes("share_label_seq")
      ) {
        return route.fulfill({
          status: 400, headers, contentType: "application/json",
          body: JSON.stringify({
            code: "42703",
            message: "column posts.share_label_seq does not exist"
          })
        });
      }

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
  rendererEnabled: true,

  /*
    posts.share_label_seq migration 이 아직 적용되지 않은 배포를
    흉내 낸다 — 그 컬럼을 고른 select 는 PostgREST 가 통째로
    400 으로 거절한다.
  */
  missingShareLabelSeq: false
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

  if (
    serverFixture.missingShareLabelSeq &&
    (search.get("select") || "").includes("share_label_seq")
  ) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      code: "42703",
      message: 'column posts.share_label_seq does not exist'
    }));
    return;
  }

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

  check(
    "[settings] ★ 예전 BLACK / WHITE 버튼은 없고 네모 컬러 피커가 있다",
    await page.evaluate(() => {
      const picker = document.getElementById("shareCardOverlayColor");
      return !document.getElementById("shareCardOverlayBlackButton") &&
        !document.getElementById("shareCardOverlayWhiteButton") &&
        !!picker && picker.type === "color" &&
        picker.classList.contains("quote-color-input");
    })
  );

  check(
    "[settings] ★ PREVIEW 가 기본 사진 · 오버레이 · 폰트보다 **위에** 있다",
    await page.evaluate(() => {
      const order = (id) => {
        const node = document.getElementById(id);
        return node ? node.getBoundingClientRect().top : -1;
      };
      const preview = order("shareCardPreviewBox");
      return preview > 0 &&
        preview < order("shareCardPhotoEditButton") &&
        preview < order("shareCardOverlayColor") &&
        preview < order("shareCardFontSelect") &&
        preview < order("shareCardLabelInput");
    })
  );

  await page.evaluate(() => {
    const set = (id, value, type) => {
      const node = document.getElementById(id);
      node.value = value;
      node.dispatchEvent(new Event(type || "input", { bubbles: true }));
    };
    set("shareCardOverlayColor", "#2b1a55");
    set("shareCardOverlayStrength", "30");
    set("shareCardTitleSize", "58");
    set("shareCardLabelInput", "SUMMER 2028");
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
    savedValue.overlay_color === "#2b1a55" &&
    savedValue.overlay_strength === 30 &&
    savedValue.font === "nanum-myeongjo" &&
    savedValue.title_size === 58 &&
    savedValue.card_label === "SUMMER 2028" &&
    typeof savedValue.image_url === "string" &&
    savedValue.image_url.includes("user-share-cards"),
    savedRow && savedRow.value
  );

  check(
    "[settings] ★ frame 은 기본값 none 으로 저장된다(나중에 늘어날 자리)",
    !!savedValue && savedValue.frame === "none",
    savedValue && String(savedValue.frame)
  );

  check(
    "[settings] 사진 위치가 함께 저장된다(기본 가운데)",
    !!savedValue &&
    savedValue.image_position_x === 50 &&
    savedValue.image_position_y === 50
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
    color: document.getElementById("shareCardOverlayColor").value,
    strength: document.getElementById("shareCardOverlayStrength").value,
    font: document.getElementById("shareCardFontSelect").value,
    titleSize: document.getElementById("shareCardTitleSize").value,
    label: document.getElementById("shareCardLabelInput").value,
    editEnabled: !document.getElementById("shareCardPhotoEditButton").disabled,
    removeEnabled: !document.getElementById("shareCardPhotoRemoveButton").disabled
  }));

  check(
    "[settings] ★ 새로고침 뒤에도 오버레이 색 · 강도 · 폰트 · 제목 크기 · 라벨이 그대로다",
    restored.color === "#2b1a55" && restored.strength === "30" &&
    restored.font === "nanum-myeongjo" && restored.titleSize === "58" &&
    restored.label === "SUMMER 2028",
    JSON.stringify(restored)
  );

  check(
    "[settings] 저장된 기본 사진이 있으면 edit · remove 를 쓸 수 있다",
    restored.editEnabled && restored.removeEnabled
  );

  const previewBackground = await (await cardFrame(reopened.page)).evaluate(
    () => getComputedStyle(document.getElementById("shareCardBackground")).backgroundImage
  );

  check(
    "[settings] 저장된 기본 사진이 미리보기 배경에 깔린다",
    previewBackground.includes("user-share-cards"),
    previewBackground.slice(0, 80)
  );

  await reopened.ctx.close();


  /* ---- 기본 사진이 없으면 edit · remove 를 쓸 수 없다 ---- */

  const bare = await openSettings(browser, { db: makeDb() });
  await openShareCard(bare.page);

  check(
    "[settings] ★ 기본 사진이 없으면 edit · remove 가 잠겨 있다",
    await bare.page.evaluate(() =>
      document.getElementById("shareCardPhotoEditButton").disabled === true &&
      document.getElementById("shareCardPhotoRemoveButton").disabled === true
    )
  );

  check(
    "[settings] 예전 작은 썸네일 상자는 없다",
    await bare.page.evaluate(() =>
      !document.getElementById("shareCardPhotoPreview") &&
      !document.getElementById("shareCardPhotoEmpty")
    )
  );

  await bare.ctx.close();


  /* ---- share_label_seq migration 이 없는 배포에서도 화면이 뜬다 ---- */

  const legacy = await openSettings(browser, {
    db: makeDb(),
    missingShareLabelSeq: true
  });

  await openShareCard(legacy.page);

  const legacyFrame = await cardFrame(legacy.page);

  check(
    "[settings] ★ share_label_seq 컬럼이 없는 배포에서도 미리보기가 뜬다(번호만 빠진다)",
    (await legacyFrame.textContent("#shareCardTitle") || "").includes("여름의 리허설") &&
    (await legacyFrame.textContent("#shareCardLabel") || "").trim() === "기록",
    await legacyFrame.textContent("#shareCardLabel")
  );

  await legacy.ctx.close();
}


/* =========================================================
   2. card — 카드 레이아웃 실측 (요구사항 §2)
========================================================== */

async function runCard(browser) {
  console.log("\n[card] 카드 레이아웃 · 데드존 · 배경 우선순위");

  /* 대표 이미지가 있는 공개 글 + 아주 긴 제목 */
  const db = makeDb({
    posts: [{
      id: 14, user_id: OWNER_ID, category_id: 1, folder_id: null,
      title: "여름의 리허설 그리고 아주 길어서 두 줄을 넘기고도 남는 제목 " +
             "한참 더 이어지는 문장 그리고 또 더",
      visibility: "public", content_type: "post", share_label_seq: 34,
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
    const domain = document.getElementById("shareCardDomain");
    const label = document.getElementById("shareCardLabel");

    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };

    const titleStyle = getComputedStyle(title);

    return {
      card: rect(card),
      title: rect(title),
      domain: rect(domain),
      label: rect(label),
      lineHeight: parseFloat(titleStyle.lineHeight),
      titleColor: titleStyle.color,
      bodyText: document.body.innerText.replace(/\s+/g, " ").trim(),
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
    geometry.title.bottom, geometry.domain.bottom
  );

  check(
    "[card] ★ 제목·도메인의 바닥 기준선이 캔버스 바닥에서 110~120px 위다",
    628 - lowest >= 110 && 628 - lowest <= 120,
    `바닥에서 ${(628 - lowest).toFixed(1)}px`
  );

  check(
    "[card] ★ X 검은 링크 바(바닥 100px) 안에는 아무 글자도 없다",
    628 - lowest >= 100,
    `바닥에서 ${(628 - lowest).toFixed(1)}px`
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

  /* ---- §2 카드 안에서 걷어낸 글자들 ---- */

  check(
    "[card] ★ 좌하단 카테고리 라벨(TXT 자리)이 카드에서 사라졌다",
    await frame.evaluate(() => !document.getElementById("shareCardCategory"))
  );

  check(
    "[card] ★ 제목 아래 `@slug · 카테고리` 메타 줄이 사라졌다",
    await frame.evaluate(() => !document.getElementById("shareCardMeta")) &&
    !geometry.bodyText.includes("@") &&
    !geometry.bodyText.includes(`@${OWNER_SLUG}`),
    geometry.bodyText.slice(0, 120)
  );

  check(
    "[card] ★ 카드에 남는 글자는 제목 · 라벨 · 도메인 셋뿐이다",
    await frame.evaluate(() => {
      const expected = [
        document.getElementById("shareCardTitle"),
        document.getElementById("shareCardLabel"),
        document.getElementById("shareCardDomain")
      ];
      const withText = [...document.querySelectorAll(".share-card *")]
        .filter(node => node.children.length === 0 && (node.textContent || "").trim());
      return withText.length === expected.length &&
        withText.every(node => expected.includes(node));
    })
  );

  check(
    "[card] ★ 자동 라벨이 `카테고리 · 세 자리 번호` 다",
    (await frame.textContent("#shareCardLabel") || "").trim() === "기록 · 034",
    (await frame.textContent("#shareCardLabel") || "").trim()
  );

  check(
    "[card] 우하단은 도메인이다",
    (await frame.textContent("#shareCardDomain") || "").trim().length > 0
  );

  check(
    "[card] ★ 배경이 글 대표 이미지 프록시(/api/post-cover)다",
    geometry.background.includes("/api/post-cover?post=14"),
    geometry.background.slice(0, 80)
  );


  /* ---- 카드 라벨: 사용자가 적으면 그 문구, 비우면 자동 ---- */

  await page.evaluate(() => {
    const node = document.getElementById("shareCardLabelInput");
    node.value = "ARCHIVE";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  check(
    "[card] ★ CARD LABEL 에 적은 문구가 우상단에 그대로 나온다",
    (await frame.textContent("#shareCardLabel") || "").trim() === "ARCHIVE"
  );

  await page.evaluate(() => {
    const node = document.getElementById("shareCardLabelInput");
    node.value = "";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  check(
    "[card] ★ 비우면 자동 라벨로 돌아간다",
    (await frame.textContent("#shareCardLabel") || "").trim() === "기록 · 034"
  );


  /* ---- 제목 크기 ---- */

  await page.evaluate(() => {
    const node = document.getElementById("shareCardTitleSize");
    node.value = "64";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  const bigTitle = await frame.evaluate(() => {
    const title = document.getElementById("shareCardTitle");
    const rect = title.getBoundingClientRect();
    return {
      size: parseFloat(getComputedStyle(title).fontSize),
      bottom: rect.bottom,
      top: rect.top
    };
  });

  check(
    "[card] ★ 제목 크기를 바꾸면 제목만 커지고 기준선은 그대로다",
    Math.abs(bigTitle.size - 64) < 0.5 &&
    Math.abs(bigTitle.bottom - geometry.title.bottom) < 0.5 &&
    628 - bigTitle.bottom >= 110,
    `${bigTitle.size}px bottom=${bigTitle.bottom.toFixed(1)}`
  );

  check(
    "[card] 커진 제목도 라벨(top 40)을 침범하지 않는다",
    bigTitle.top > geometry.label.bottom,
    `title.top=${bigTitle.top.toFixed(1)} label.bottom=${geometry.label.bottom.toFixed(1)}`
  );

  await page.evaluate(() => {
    const node = document.getElementById("shareCardTitleSize");
    node.value = "400";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(400);

  const clamped = await page.evaluate(
    () => document.getElementById("shareCardTitleSize").value
  );

  check(
    "[card] ★ 제목 크기가 레이아웃이 깨지지 않는 범위로 잘린다",
    clamped === "72",
    clamped
  );

  await page.evaluate(() => {
    const node = document.getElementById("shareCardTitleSize");
    node.value = "46";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(200);

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

  /* ---- 오버레이 색의 밝기가 글자색을 정한다 ---- */

  const setOverlayColor = async (value) => {
    await page.evaluate((color) => {
      const node = document.getElementById("shareCardOverlayColor");
      node.value = color;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await page.waitForTimeout(350);
    return frame.evaluate(() => ({
      title: getComputedStyle(document.getElementById("shareCardTitle")).color,
      sub: getComputedStyle(document.getElementById("shareCardDomain")).color,
      rgb: getComputedStyle(document.documentElement)
        .getPropertyValue("--share-card-rgb").trim()
    }));
  };

  const lightOverlay = await setOverlayColor("#f7f3ea");

  check(
    "[card] ★ 밝은 오버레이에서는 글자가 짙은 회색이고 순검정이 아니다",
    lightOverlay.title === "rgb(51, 51, 51)" && lightOverlay.sub === "rgb(85, 85, 85)",
    JSON.stringify(lightOverlay)
  );

  check(
    "[card] 고른 색이 그대로 오버레이에 들어간다",
    lightOverlay.rgb === "247, 243, 234",
    lightOverlay.rgb
  );

  const darkOverlay = await setOverlayColor("#2b1a55");

  check(
    "[card] ★ 어두운 오버레이에서는 글자가 흰색 계열이다",
    darkOverlay.title === "rgb(255, 255, 255)",
    darkOverlay.title
  );

  check(
    "[card] 고른 색이 그대로 오버레이에 들어간다(어두운 쪽)",
    darkOverlay.rgb === "43, 26, 85",
    darkOverlay.rgb
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
        overlay_color: "#000000",
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


  /* ---- 폴더 안의 글이면 자동 라벨이 폴더 이름을 쓴다 ---- */

  const db4 = makeDb({
    posts: [{
      id: 21, user_id: OWNER_ID, category_id: 1, folder_id: 7,
      title: "여름의 리허설",
      visibility: "public", content_type: "post", share_label_seq: 3,
      created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-11T00:00:00Z"
    }],
    post_folders: [
      { id: 7, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "MUSIC" }
    ],
    post_contents: []
  });

  const fourth = await openSettings(browser, { db: db4 });
  await openShareCard(fourth.page);

  const frame4 = await cardFrame(fourth.page);

  check(
    "[card] ★ 폴더 안의 글은 가장 안쪽 이름(폴더)을 라벨에 쓴다",
    (await frame4.textContent("#shareCardLabel") || "").trim() === "MUSIC · 003",
    (await frame4.textContent("#shareCardLabel") || "").trim()
  );

  await fourth.ctx.close();
}


/* =========================================================
   2-2. crop — 기본 사진 위치 조정 모달

   모달의 object-position 과 카드의 background-position 이 **같은
   값**이어야 한다(요구 §1-C). 여기서는 화면 쪽 일치를 재고,
   서버 PNG 와의 일치는 [image] 절에서 렌더러에 넘어간 HTML 로
   확인한다.
========================================================== */

async function runCrop(browser) {
  console.log("\n[crop] 기본 사진 위치 조정");

  const cardImageUrl =
    `https://${SUPABASE_HOST}/storage/v1/object/public/user-share-cards/${OWNER_ID}/default`;

  const db = makeDb({
    post_covers: [{ post_id: 14, mime_type: "image/png" }],
    settings: [{
      user_id: OWNER_ID,
      key: "share_card",
      value: JSON.stringify({
        image_url: cardImageUrl,
        overlay_color: "#000000",
        overlay_strength: 55,
        font: "pretendard",
        version: "1757800000000"
      })
    }]
  });

  const requests = [];

  const { ctx, page } = await openSettings(browser, {
    db,
    recorder: requests,
    storageObjects: new Set([`user-share-cards/${OWNER_ID}/default`])
  });

  await openShareCard(page);

  check(
    "[crop] 기본 사진이 있으면 edit 을 누를 수 있다",
    await page.evaluate(() =>
      document.getElementById("shareCardPhotoEditButton").disabled === false
    )
  );

  await page.click("#shareCardPhotoEditButton");
  await page.waitForTimeout(400);

  const dialog = await page.evaluate(() => {
    const overlay = document.getElementById("shareCardCropOverlay");
    const frame = document.getElementById("shareCardCropFrame");
    const rect = frame.getBoundingClientRect();
    return {
      open: overlay.hidden === false,
      ratio: rect.width / rect.height,
      objectFit: getComputedStyle(document.getElementById("shareCardCropImage")).objectFit,
      touchAction: getComputedStyle(frame).touchAction,
      src: document.getElementById("shareCardCropImage").getAttribute("src") || ""
    };
  });

  check(
    "[crop] ★ 모달 안 프레임이 정확히 1200 : 628 비율이다",
    dialog.open && Math.abs(dialog.ratio - 1200 / 628) < 0.02,
    `${dialog.ratio.toFixed(3)}`
  );

  check(
    "[crop] 프레임이 카드와 같은 규칙(cover)으로 사진을 담는다",
    dialog.objectFit === "cover"
  );

  check(
    "[crop] ★ 터치 드래그가 화면 스크롤로 가로채이지 않는다(touch-action: none)",
    dialog.touchAction === "none",
    dialog.touchAction
  );

  check(
    "[crop] 편집 대상은 기본 카드 사진이다",
    dialog.src.includes("user-share-cards")
  );

  check(
    "[crop] ★ 편집하는 동안 미리보기가 기본 사진으로 바뀐다(대표 이미지가 있어도)",
    (await (await cardFrame(page)).evaluate(
      () => getComputedStyle(document.getElementById("shareCardBackground")).backgroundImage
    )).includes("user-share-cards")
  );

  /*
    사진이 가로로 긴 상황을 만들어(프레임보다 넓게) 드래그가
    실제로 구도를 옮기는지 본다. mock 이 돌려주는 1×1 PNG 로는
    넘치는 폭이 0이라 움직일 수 없으므로, 자연 크기를 직접
    지정한 <img> 로 바꿔 끼운다.
  */

  const drag = await page.evaluate(async () => {
    const image = document.getElementById("shareCardCropImage");
    const frame = document.getElementById("shareCardCropFrame");

    /* 3000 × 628 비율의 아주 넓은 그림 — 가로로만 넘친다 */
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 628;
    const ctx2d = canvas.getContext("2d");
    ctx2d.fillStyle = "#c0d8ee";
    ctx2d.fillRect(0, 0, 3000, 628);

    await new Promise((resolve) => {
      image.onload = resolve;
      image.src = canvas.toDataURL("image/png");
    });

    const rect = frame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const fire = (type, x, y) => {
      frame.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: "touch", bubbles: true, cancelable: true,
        clientX: x, clientY: y
      }));
    };

    fire("pointerdown", cx, cy);
    fire("pointermove", cx - rect.width * 0.25, cy);
    fire("pointerup", cx - rect.width * 0.25, cy);

    return {
      objectPosition: image.style.objectPosition,
      overflowX: image.naturalWidth * (rect.height / image.naturalHeight) - rect.width
    };
  });

  check(
    "[crop] ★ 끄는 대로 구도가 움직인다(오른쪽 → 왼쪽으로 끌면 오른쪽이 보인다)",
    /^(\d+)% 50%$/.test(drag.objectPosition) &&
    Number(drag.objectPosition.split("%")[0]) > 50,
    `${drag.objectPosition} (넘침 ${drag.overflowX.toFixed(1)}px)`
  );

  const dragged = Number(drag.objectPosition.split("%")[0]);

  /* ---- 모달 save → 카드에 그대로 반영 ---- */

  await page.click("#shareCardCropSaveButton");
  await page.waitForTimeout(500);

  const cardPosition = await (await cardFrame(page)).evaluate(
    () => getComputedStyle(document.getElementById("shareCardBackground")).backgroundPosition
  );

  check(
    "[crop] ★ 모달의 위치와 카드 배경의 위치가 같다",
    cardPosition.startsWith(`${dragged}%`),
    `모달 ${dragged}% / 카드 ${cardPosition}`
  );

  check(
    "[crop] 모달이 닫히고 미리보기는 기본 사진으로 남는다(결과를 보라고)",
    await page.evaluate(() =>
      document.getElementById("shareCardCropOverlay").hidden === true &&
      document.getElementById("shareCardPreviewDefaultToggle").checked === true
    )
  );

  check(
    "[crop] ★ 모달 save 만으로는 서버에 쓰지 않는다(설정 save 에서만)",
    requests.filter(
      r => r.method === "POST" && r.path.includes("/rest/v1/site_settings")
    ).length === 0
  );

  /* ---- 다시 열어 끌었다가 cancel 하면 되돌아간다 ---- */

  await page.click("#shareCardPhotoEditButton");
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const frame = document.getElementById("shareCardCropFrame");
    const rect = frame.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;
    const fire = (type, x) => {
      frame.dispatchEvent(new PointerEvent(type, {
        pointerId: 3, pointerType: "mouse", bubbles: true, cancelable: true,
        clientX: x, clientY: cy
      }));
    };
    fire("pointerdown", rect.left + rect.width / 2);
    fire("pointermove", rect.left + rect.width);
    fire("pointerup", rect.left + rect.width);
  });

  await page.click("#shareCardCropCancelButton");
  await page.waitForTimeout(400);

  const afterCancel = await (await cardFrame(page)).evaluate(
    () => getComputedStyle(document.getElementById("shareCardBackground")).backgroundPosition
  );

  check(
    "[crop] ★ cancel 은 끌던 구도를 버린다(직전에 save 한 자리로 돌아온다)",
    afterCancel.startsWith(`${dragged}%`),
    afterCancel
  );

  /* ---- 설정 save 로 저장된다 ---- */

  await page.click("#shareCardSaveButton");
  await page.waitForTimeout(900);

  const savedRow = db.site_settings.find(s => s.key === "share_card");
  let savedValue = null;
  try { savedValue = JSON.parse(savedRow ? savedRow.value : "null"); } catch { /* noop */ }

  check(
    "[crop] ★ image_position_x / y 로 저장된다",
    !!savedValue &&
    savedValue.image_position_x === dragged &&
    savedValue.image_position_y === 50,
    savedRow && savedRow.value
  );

  await ctx.close();
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

    /*
      요구 §1-D/E — 오버레이(색+강도)와 폰트(폰트+제목 크기)는
      한 줄이다. 모바일에서도 같은 줄에 들어가야 한다.
    */

    const rows = await page.evaluate(() => {
      /* 높이가 서로 달라도 "같은 줄"이면 세로로 겹친다 */
      const sameLine = (a, b) => {
        const ra = document.getElementById(a).getBoundingClientRect();
        const rb = document.getElementById(b).getBoundingClientRect();
        return ra.top < rb.bottom && rb.top < ra.bottom;
      };

      return {
        overlaySameLine:
          sameLine("shareCardOverlayColor", "shareCardOverlayStrength") &&
          sameLine("shareCardOverlayStrength", "shareCardOverlayStrengthValue"),
        fontSameLine:
          sameLine("shareCardFontSelect", "shareCardTitleSize"),
        panelOverflow:
          document.getElementById("shareCardSettingsPanel").scrollWidth >
            document.getElementById("shareCardSettingsPanel").clientWidth
      };
    });

    check(
      `[preview/${viewport.name}] ★ 오버레이 색 + 강도가 한 줄이다`,
      rows.overlaySameLine
    );

    check(
      `[preview/${viewport.name}] ★ 폰트 + 제목 크기가 한 줄이다`,
      rows.fontSameLine
    );

    check(
      `[preview/${viewport.name}] 설정 패널이 가로로 넘치지 않는다`,
      rows.panelOverflow === false
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
   3-2. shots — 눈으로 볼 그림 (IMORY_SHARE_SHOT=<디렉터리>)

   판정하지 않는다. 모바일 설정 화면과 실제 1200 × 628 카드를
   PNG 로 남긴다 — 리뷰에 붙이는 용도다.
========================================================== */

async function runShots(browser, outDir) {
  console.log(`\n[shots] ${outDir}`);

  fs.mkdirSync(outDir, { recursive: true });

  const cardImageUrl =
    `https://${SUPABASE_HOST}/storage/v1/object/public/user-share-cards/${OWNER_ID}/default`;

  const db = makeDb({
    settings: [{
      user_id: OWNER_ID,
      key: "share_card",
      value: JSON.stringify({
        image_url: cardImageUrl,
        image_position_x: 62,
        image_position_y: 38,
        overlay_color: "#241a33",
        overlay_strength: 58,
        font: "pretendard",
        title_size: 52,
        card_label: "",
        frame: "none",
        version: "1757800000000"
      })
    }]
  });

  /* ---- 모바일 설정 화면 ---- */

  for (const shot of [
    { name: "settings-mobile", width: 390, height: 1200 },
    { name: "settings-desktop", width: 1280, height: 1000 }
  ]) {
    const { ctx, page } = await openSettings(browser, {
      db,
      viewport: { width: shot.width, height: shot.height },
      storageObjects: new Set([`user-share-cards/${OWNER_ID}/default`])
    });

    await openShareCard(page);
    await page.waitForTimeout(900);

    await page.screenshot({
      path: path.join(outDir, `${shot.name}.png`),
      fullPage: true
    });

    /* 사진 위치 조정 모달도 한 장 */
    if (shot.name === "settings-mobile") {
      await page.click("#shareCardPhotoEditButton");
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, "crop-modal-mobile.png") });
      await page.click("#shareCardCropCancelButton");
    }

    console.log(`  saved ${shot.name}.png`);
    await ctx.close();
  }

  /* ---- 실제 1200 × 628 카드 ---- */

  const cardCtx = await browser.newContext({ viewport: { width: 1200, height: 628 } });
  const cardPage = await cardCtx.newPage();

  await cardPage.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("user-share-cards") || url.includes("example.test")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
    }
    if (/^https?:/.test(url) && !url.startsWith(`http://localhost:${PORT}`)) {
      return route.abort();
    }
    return route.continue();
  });

  for (const variant of [
    { name: "card-auto-label", label: "기록 · 034", color: "#241a33", size: 52 },
    { name: "card-custom-label", label: "SUMMER 2028", color: "#f2ece1", size: 46 }
  ]) {
    const html = shareCard.buildShareCardHtml({
      card: shareCard.normalizeShareCardSettings(JSON.stringify({
        image_url: cardImageUrl,
        image_position_x: 62,
        image_position_y: 38,
        overlay_color: variant.color,
        overlay_strength: 58,
        font: "pretendard",
        title_size: variant.size
      })),
      backgroundUrl: cardImageUrl,
      title: "여름의 리허설, 그리고 아무도 모르는 두 번째 악장",
      label: variant.label,
      domain: "imory.me"
    });

    await cardPage.setContent(html, { waitUntil: "domcontentloaded" });
    await cardPage.waitForTimeout(400);
    await cardPage.screenshot({ path: path.join(outDir, `${variant.name}.png`) });
    console.log(`  saved ${variant.name}.png`);
  }

  await cardCtx.close();
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
    "[meta] ★ og:title 은 실제 글 제목이다",
    metaOf(page.html, "og:title") === "여름의 리허설",
    metaOf(page.html, "og:title")
  );

  check(
    "[meta] ★ twitter:title 은 블로그 제목만이다(X 검은 링크 바)",
    metaOf(page.html, "twitter:title") === "테스트 블로그",
    metaOf(page.html, "twitter:title")
  );

  check(
    "[meta] ★ twitter:title 에 글 제목 · slug · 카테고리 · 구분자가 없다",
    (() => {
      const value = metaOf(page.html, "twitter:title") || "";
      return !value.includes("여름의 리허설") &&
        !value.includes(OWNER_SLUG) &&
        !value.includes("기록") &&
        !value.includes("|");
    })(),
    metaOf(page.html, "twitter:title")
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


  /* ---- 블로그 제목이 비어 있으면 imory.me ---- */

  const untitled = makeDb({
    post_covers: [{ post_id: 14, mime_type: "image/png" }]
  });

  untitled.site_settings = untitled.site_settings.filter(s => s.key !== "blog_title");

  serverFixture.db = untitled;

  const noTitle = await requestPage(`/${OWNER_SLUG}/post/14`);

  check(
    "[meta] ★ 사이트 제목이 비어 있으면 twitter:title 은 imory.me 다",
    metaOf(noTitle.html, "twitter:title") === "imory.me",
    metaOf(noTitle.html, "twitter:title")
  );

  check(
    "[meta] 그때도 og:title 은 글 제목 그대로다",
    metaOf(noTitle.html, "og:title") === "여름의 리허설",
    metaOf(noTitle.html, "og:title")
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
        image_position_x: 18,
        image_position_y: 72,
        overlay_color: "#f7f3ea",
        overlay_strength: 42,
        font: "nanum-myeongjo",
        title_size: 58,
        card_label: "",
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
    render.html.includes('data-overlay="light"') &&
    render.html.includes('data-font="nanum-myeongjo"') &&
    render.html.includes('data-frame="none"') &&
    render.html.includes("--share-card-alpha:0.420") &&
    render.html.includes("--share-card-title-size:58px"),
    render && render.html.slice(0, 320)
  );

  check(
    "[image] ★ 고른 오버레이 색과 그 밝기에 맞춘 글자색이 문서에 박혀 있다",
    !!render &&
    render.html.includes("--share-card-rgb:247, 243, 234") &&
    render.html.includes("--share-card-title:#333333")
  );

  check(
    "[image] ★ 자동 라벨이 카드에 들어간다(카테고리 · 세 자리)",
    !!render && render.html.includes(">기록 · 034<"),
    render && (render.html.match(/shareCardLabel">([^<]*)</) || [])[1]
  );

  check(
    "[image] ★ 카드 HTML 에 slug · 카테고리 메타 줄이 더는 없다",
    !!render &&
    !render.html.includes("shareCardMeta") &&
    !render.html.includes("shareCardCategory") &&
    !render.html.includes(`@${OWNER_SLUG}`)
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

  /*
    요구 §1-C — 설정 미리보기와 실제 PNG 렌더러가 같은 crop 값을
    쓴다. 두 화면이 같은 함수(shareCardBackgroundPosition)를 거치는지
    직접 확인한다.
  */

  check(
    "[image] ★ 기본 사진의 위치(image_position_x/y)가 렌더 문서에 그대로 들어간다",
    serverFixture.renders[0].html.includes("--share-card-bg-position:18% 72%"),
    (serverFixture.renders[0].html.match(/--share-card-bg-position:[^;"]*/) || [])[0]
  );

  check(
    "[image] ★ 그 값은 설정 화면이 쓰는 것과 같은 함수에서 나온다",
    shareCard.shareCardBackgroundPosition(
      shareCard.normalizeShareCardSettings(
        serverFixture.db.site_settings.find(s => s.key === "share_card").value
      ),
      "https://example.test/card.png"
    ) === "18% 72%"
  );

  check(
    "[image] ★ 글 대표 이미지에는 기본 사진의 위치를 쓰지 않는다(가운데)",
    render.html.includes("--share-card-bg-position:50% 50%"),
    (render.html.match(/--share-card-bg-position:[^;"]*/) || [])[0]
  );

  /* ---- 사용자가 적은 카드 라벨이 자동 라벨을 이긴다 ---- */

  serverFixture.db = makeDb({
    settings: [{
      user_id: OWNER_ID,
      key: "share_card",
      value: JSON.stringify({
        overlay_color: "#000000",
        overlay_strength: 55,
        card_label: "LOG 034",
        version: "1757800000000"
      })
    }]
  });

  serverFixture.renders = [];

  await requestOgImage("?post=14&v=label1");

  check(
    "[image] ★ CARD LABEL 이 있으면 그 문구가 카드에 들어간다",
    serverFixture.renders[0].html.includes(">LOG 034<") &&
    !serverFixture.renders[0].html.includes("기록 · 034")
  );


  /* ---- 라벨이 비면 카드에 라벨 요소가 비어 있다 ---- */

  check(
    "[image] ★ 이름도 번호도 없으면 라벨은 빈 문자열이다",
    shareCard.resolveShareCardLabel("", "", 0) === "" &&
    shareCard.resolveShareCardLabel(null, null, null) === ""
  );

  const emptyLabelHtml = shareCard.buildShareCardHtml({
    card: shareCard.normalizeShareCardSettings(null),
    backgroundUrl: "",
    title: "여름의 리허설",
    label: "",
    domain: "imory.me"
  });

  check(
    "[image] ★ 빈 라벨은 카드에 글자로도 자리로도 나오지 않는다",
    emptyLabelHtml.includes('id="shareCardLabel"></div>') &&
    /\.share-card-label:empty\s*\{\s*display:\s*none/.test(emptyLabelHtml),
    (emptyLabelHtml.match(/shareCardLabel">([^<]*)</) || [])[1]
  );


  /* ---- share_label_seq 컬럼이 없는 배포 ---- */

  serverFixture.db = makeDb();
  serverFixture.renders = [];
  serverFixture.missingShareLabelSeq = true;

  const legacyColumn = await requestOgImage("?post=14&v=legacy1");

  check(
    "[image] ★ share_label_seq 컬럼이 없어도 카드는 그려진다(번호는 그때 센다)",
    legacyColumn.status === 200 &&
    serverFixture.renders.length === 1 &&
    serverFixture.renders[0].html.includes("여름의 리허설"),
    String(legacyColumn.status)
  );

  serverFixture.missingShareLabelSeq = false;


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
    shouldRun("settings") || shouldRun("card") ||
    shouldRun("crop") || shouldRun("preview") || Boolean(SHOT_DIR);

  let browser = null;

  try {

    if (needsBrowser) {
      const playwright = await loadPlaywright(BROWSER);
      browser = await playwright[BROWSER].launch();
    }

    if (shouldRun("settings")) await runSettings(browser);
    if (shouldRun("card")) await runCard(browser);
    if (shouldRun("crop")) await runCrop(browser);
    if (shouldRun("preview")) await runPreview(browser);
    if (shouldRun("meta")) await runMeta();
    if (shouldRun("image")) await runImage();
    if (shouldRun("cache")) await runCache();
    if (SHOT_DIR) await runShots(browser, SHOT_DIR);

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
