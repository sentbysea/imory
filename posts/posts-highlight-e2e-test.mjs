/* =========================================================
   HIGHLIGHT-1 — 글 뷰어 도구 · 하이라이트 · 메모 E2E 테스트

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md

   skin/skin-banner-page-e2e-test.mjs와 같은 방식/같은 규약이다 —
   저장소의 실제 index.html + posts.html + 실제 CSS/JS를 정적으로
   서빙하고, Supabase 응답과 로그인 상태만 mock한다. 하이라이트
   저장소(post_highlights)는 이 파일 안의 **가변 배열**이라 저장 →
   새로고침 → 유지까지 실제 왕복으로 확인할 수 있다.

   RPC mock은 실제 SQL과 같은 판정을 한다(겹침·같은 범위 재선택·
   소유권). SQL 자체의 판정은 PGlite 하네스가 따로 검증한다 —
   여기서는 "화면이 그 결과에 맞게 움직이는가"를 본다.

   실행 방법
     node posts/posts-highlight-e2e-test.mjs
     node posts/posts-highlight-e2e-test.mjs --browser=webkit
     node posts/posts-highlight-e2e-test.mjs --only=menu
     node posts/posts-highlight-e2e-test.mjs --only=entry
     node posts/posts-highlight-e2e-test.mjs --only=state
     node posts/posts-highlight-e2e-test.mjs --keep-shots

   구역
     menu       글 뷰어 ⋮ 도구 메뉴
     highlight  하이라이팅 모드 · 저장 · 겹침
     memo       말풍선 · 메모 팝업
     memos      메모 카테고리 화면
     entry      메모 화면으로 가는 기본 진입점(플랫폼 칩)
     state      원문 위치 확인 3상태 · 조회 실패 처리
     protect    보호된 원문의 발췌문 — 차단 **과** 정상 해제
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8952;
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
const ONLY = argOf("only", "");
const KEEP_SHOTS = args.includes("--keep-shots");
const SHOT_DIR = path.join(os.tmpdir(), "imory-highlight-e2e-shots");

const wants = (section) => !ONLY || ONLY === section;


/* =========================================================
   playwright 찾기 (다른 e2e 파일과 같은 전략)
========================================================== */

async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(
    process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx"
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
  candidates.push(path.join(
    os.tmpdir(), "claude", "c--Users-user-Downloads-imory"
  ));
  if (process.env.IMORY_PLAYWRIGHT_MODULES) {
    candidates.push(process.env.IMORY_PLAYWRIGHT_MODULES);
  }

  const found = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    found.push({ entry });
  }

  const tried = [];
  for (const { entry } of found) {
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
    `시도: ${tried.join(" | ") || "설치를 찾지 못함"}\n` +
    `IMORY_PLAYWRIGHT_MODULES=<node_modules 경로> 로 위치를 알려줄 수 있습니다.`
  );
}


/* =========================================================
   정적 서버
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
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
   fixture

   본문은 인라인 서식(<em>)이 섞인 두 문단이다 — "여러 문단·여러
   줄·인라인 서식을 걸친 선택이 원본 서식을 훼손하지 않는가"를
   실제로 볼 수 있어야 한다(요구사항 4).
========================================================== */

const POST_BODY =
  "첫 문장입니다. 두 번째 문장입니다.\n\n" +
  "다음 문단의 첫 문장입니다. 반복되는 문장입니다. 그리고 반복되는 문장입니다.";

const SKIN_PACKAGE = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "skin", "test-skins", "imory-quiet-frame-v2.json"),
    "utf8"
  )
);

function makeDb() {
  return {
    profiles: [{
      user_id: OWNER_ID, slug: SLUG, home_mode: "customize",
      nickname: "테스트 사용자", bio: "E2E"
    }],
    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "IMORY E2E" },
      { user_id: OWNER_ID, key: "favicon_url", value: "" }
    ],
    categories: [
      { id: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1 }
    ],
    posts: [
      { id: 101, user_id: OWNER_ID, category_id: 1, title: "첫 번째 글", content_type: "text", visibility: "public", created_at: "2026-09-01T02:00:00Z", updated_at: "2026-09-01T02:00:00Z", quote_preset_id: null }
    ],
    post_contents: [
      { post_id: 101, content: POST_BODY, ooc_content: null }
    ],
    post_highlights: [],
    memo_folder_settings: [],
    banners: [],
    quote_presets: [],
    skins: [{ id: 1, user_id: OWNER_ID, is_active: true }]
  };
}

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function queryTable(DB, table, params) {
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

  return rows;
}


/* post_highlights + posts embed (memo 화면 · 글 화면이 쓰는 모양)

   opts.noPostUpdatedAt
     posts.updated_at 의 SELECT 권한이 아직 없는 배포를 흉내 낸다
     (20260913110000 migration 이전). 실제 PostgREST 는 그 컬럼을
     요청하면 42501 로 쿼리 전체를 거절하므로 여기서도 그렇게 한다 —
     프론트가 "그 컬럼만 빼고 다시 물어보기"로 살아남는지 본다. */

function queryHighlightsWithPosts(DB, params, opts = {}) {
  const select = params.get("select") || "";
  const wantsPosts = select.includes("posts");
  const wantsPostUpdatedAt = /posts!inner\s*\(([^)]*)\)/.test(select)
    ? /updated_at/.test(/posts!inner\s*\(([^)]*)\)/.exec(select)[1])
    : false;

  if (wantsPostUpdatedAt && opts.noPostUpdatedAt) {
    return { error: { code: "42501", message: "permission denied for column updated_at" } };
  }

  let rows = queryTable(DB, "post_highlights", params);

  if (!wantsPosts) return rows;

  return rows
    .map(row => {
      const post = DB.posts.find(p => String(p.id) === String(row.post_id));
      if (!post) return null;
      const embedded = {
        id: post.id,
        title: post.title,
        category_id: post.category_id,
        visibility: post.visibility
      };
      /* PostgREST 는 요청한 컬럼만 돌려준다 */
      if (wantsPostUpdatedAt) embedded.updated_at = post.updated_at ?? null;
      return { ...row, posts: embedded };
    })
    .filter(Boolean);
}


/* =========================================================
   Supabase mock
========================================================== */

async function installSupabaseMock(page, DB, opts = {}) {
  const { skin = SKIN_PACKAGE } = opts;

  const calls = opts.calls || [];

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

    const json = (body, status = 200) => route.fulfill({
      status, headers, contentType: "application/json",
      body: JSON.stringify(body)
    });

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      const a = JSON.parse(req.postData() || "{}");
      calls.push({ fn, args: a });

      if (fn === "get_published_skin") {
        return json({ skin, schemaVersion: skin.schemaVersion, imageSlotValues: {} });
      }

      if (fn === "get_own_post_content") {
        const post = DB.posts.find(p => String(p.id) === String(a.p_post_id));
        const owned = post && opts.signedInAs && post.user_id === opts.signedInAs;
        const row = owned ? DB.post_contents.find(c => String(c.post_id) === String(post.id)) : null;
        const rows = row ? [{ content: row.content ?? null, ooc_content: row.ooc_content ?? null }] : [];
        const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
        if (single && rows.length === 0) {
          return json({ code: "PGRST116", message: "0 rows" }, 406);
        }
        return route.fulfill({
          status: 200, headers,
          contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
          body: JSON.stringify(single ? rows[0] : rows)
        });
      }

      /* ---- 소유자 전용 쓰기: 실제 SQL과 같은 판정 ---- */

      const requireOwner = (postId) => {
        const post = DB.posts.find(p => String(p.id) === String(postId));
        return post && opts.signedInAs && post.user_id === opts.signedInAs;
      };

      if (fn === "save_own_post_highlight") {
        if (!requireOwner(a.p_post_id)) {
          return json({ code: "42501", message: "not the owner" }, 403);
        }

        const start = Number(a.p_text_start);
        const end = start + String(a.p_excerpt).length;

        const same = DB.post_highlights.find(
          h => String(h.post_id) === String(a.p_post_id) &&
               h.text_start === start &&
               h.excerpt === a.p_excerpt
        );

        if (same) {
          same.color = String(a.p_color).toLowerCase();
          return json([{ id: same.id, status: "recolored" }]);
        }

        const overlap = DB.post_highlights.some(
          h => String(h.post_id) === String(a.p_post_id) &&
               h.text_start < end &&
               (h.text_start + h.excerpt.length) > start
        );

        if (overlap) {
          return json({ code: "23505", message: "highlight_overlap" }, 409);
        }

        const row = {
          id: `hl-${DB.post_highlights.length + 1}`,
          post_id: Number(a.p_post_id),
          user_id: OWNER_ID,
          color: String(a.p_color).toLowerCase(),
          excerpt: a.p_excerpt,
          prefix: a.p_prefix || "",
          suffix: a.p_suffix || "",
          text_start: start,
          note: a.p_note || null,
          created_at: new Date(Date.now() + DB.post_highlights.length * 1000).toISOString(),
          updated_at: new Date().toISOString()
        };
        DB.post_highlights.push(row);
        return json([{ id: row.id, status: "created" }]);
      }

      if (fn === "update_own_post_highlight_note") {
        const row = DB.post_highlights.find(h => h.id === a.p_id);
        if (!row || !requireOwner(row.post_id)) {
          return json({ code: "42501", message: "not found" }, 403);
        }
        const note = String(a.p_note ?? "").trim();
        row.note = note || null;
        return json(null);
      }

      if (fn === "update_own_post_highlight_color") {
        const row = DB.post_highlights.find(h => h.id === a.p_id);
        if (!row || !requireOwner(row.post_id)) {
          return json({ code: "42501", message: "not found" }, 403);
        }
        row.color = String(a.p_color).toLowerCase();
        return json(null);
      }

      if (fn === "delete_own_post_highlight") {
        const index = DB.post_highlights.findIndex(h => h.id === a.p_id);
        if (index === -1 || !requireOwner(DB.post_highlights[index].post_id)) {
          return json({ code: "42501", message: "not found" }, 403);
        }
        DB.post_highlights.splice(index, 1);
        return json(null);
      }

      /* ---- 비밀글: 원문과 같은 문(같은 비밀번호 판정) ---- */

      if (fn === "get_secret_post_content") {
        const post = DB.posts.find(p => String(p.id) === String(a.p_post_id));
        if (!post || post.visibility !== "secret" ||
            String(a.p_password) !== String(post.secret_password || "")) {
          return json([]);
        }
        const row = DB.post_contents.find(c => String(c.post_id) === String(post.id));
        return json([{ content: row ? row.content : "" }]);
      }

      /*
        실제 SQL과 같은 구조다 — 비밀번호를 직접 대조하지 않고
        get_secret_post_content 가 행을 돌려주는지만 본다.
      */
      if (fn === "get_secret_post_highlights") {
        const post = DB.posts.find(p => String(p.id) === String(a.p_post_id));
        if (!post || post.visibility !== "secret" ||
            String(a.p_password) !== String(post.secret_password || "")) {
          return json([]);
        }
        return json(
          DB.post_highlights
            .filter(h => String(h.post_id) === String(post.id))
            .sort((x, y) => x.text_start - y.text_start)
            .map(h => ({
              id: h.id, post_id: h.post_id, color: h.color, excerpt: h.excerpt,
              prefix: h.prefix, suffix: h.suffix, text_start: h.text_start,
              note: h.note, created_at: h.created_at, updated_at: h.updated_at
            }))
        );
      }

      return json(null);
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);

      /*
        방문자에게는 공개 글의 하이라이트만 간다 — 실제 RLS와 같은
        경계를 mock에서도 강제한다(비밀글이 섞이면 테스트가 실제
        배포보다 느슨해진다).
      */
      /*
        하이라이트 조회가 실패하는 배포/순간을 흉내 낸다 —
        migration 미적용, 일시적 장애 등. 화면이 그것을 "저장된
        항목 없음"으로 표시하지 않는지 보기 위한 스위치다.
      */
      if (table === "post_highlights" && opts.failHighlightSelect) {
        return json({ code: "42P01", message: "relation does not exist" }, 500);
      }

      let rows;

      if (table === "post_highlights") {
        const result = queryHighlightsWithPosts(DB, url.searchParams, opts);
        if (result && result.error) {
          return json(result.error, 403);
        }
        rows = result.filter(row => {
          const post = DB.posts.find(p => String(p.id) === String(row.post_id));
          return post && (post.visibility === "public" || post.user_id === opts.signedInAs);
        });
      } else {
        rows = queryTable(DB, table, url.searchParams);
      }

      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (single && rows.length === 0) {
        return json({ code: "PGRST116", message: "0 rows" }, 406);
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
          const original = value.createClient.bind(value);
          value.createClient = (...clientArgs) => {
            const client = original(...clientArgs);
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

const BASE = `http://localhost:${PORT}`;

async function withPage(viewport, opts, fn) {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  if (opts.signedInAs) await installSignedInUser(page, opts.signedInAs);
  await installSupabaseMock(page, opts.db, opts);
  try {
    return await fn(page, { errors });
  } finally {
    await browser.close();
  }
}

async function gotoPost(page) {
  await page.goto(`${BASE}/${SLUG}/post/101`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const host = document.querySelector('[data-imory-region="post-body"]');
      return host && host.textContent.includes("첫 문장입니다");
    },
    null,
    { timeout: 20000 }
  );
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  if (!KEEP_SHOTS) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}


/* 본문 평문에서 [from, to) 구간을 실제로 선택한다 — 사람이 드래그한
   결과와 같은 Selection 상태를 만든다. */

const SELECT_RANGE = `(from, to) => {
  const root = document.querySelector('[data-imory-region="post-body"]');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest('.post-detail-ooc, button, [data-post-hl-ui]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const entries = [];
  let text = "";
  let node = walker.nextNode();
  while (node) {
    entries.push({ node, start: text.length, end: text.length + node.nodeValue.length });
    text += node.nodeValue;
    node = walker.nextNode();
  }
  const pointAt = (pos, atEnd) => {
    for (const e of entries) {
      if (atEnd ? (pos > e.start && pos <= e.end) : (pos >= e.start && pos < e.end)) {
        return { node: e.node, offset: pos - e.start };
      }
    }
    return null;
  };
  const a = pointAt(from, false);
  const b = pointAt(to, true);
  if (!a || !b) return { ok: false, text };
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return { ok: true, selected: sel.toString(), plain: text };
}`;

async function selectRange(page, from, to) {
  return page.evaluate(
    ([f, t, fnSource]) => (new Function("return " + fnSource))()(f, t),
    [from, to, SELECT_RANGE]
  );
}

async function pickFirstColor(page) {
  await page.waitForSelector(".imory-color-menu:not([hidden]) .imory-color-menu-swatch", { timeout: 5000 });
  await page.locator(".imory-color-menu .imory-color-menu-swatch").first().click();
  await page.waitForTimeout(500);
}


/* =========================================================
   [menu] 도구 메뉴 — 주인장/방문자 차이 · 글자 크기 · 링크 복사
========================================================== */

async function testToolsMenu() {
  console.log("\n[menu] 글 뷰어 도구 메뉴");

  const db = makeDb();

  await withPage({ width: 390, height: 844 }, { db, signedInAs: OWNER_ID }, async (page, { errors }) => {
    await gotoPost(page);

    const buttonVisible = await page.locator("#postToolsButton").isVisible();
    check("[menu] 주인장에게 ⋮ 버튼", buttonVisible);

    await page.locator("#postToolsButton").click();
    await page.waitForSelector(".imory-popover:not([hidden])", { timeout: 5000 });

    const items = await page.locator(".imory-popover-item-label").allTextContents();
    check("[menu] 주인장 메뉴 = 하이라이팅/링크 복사/글 수정",
      items.includes("하이라이팅 모드") && items.includes("글 링크 복사") && items.includes("글 수정"),
      items.join(" | "));

    const hasFontRow = await page.locator(".imory-popover-row-label").first().textContent();
    check("[menu] 글자 크기 줄", (hasFontRow || "").includes("글자 크기"));

    /* 화면 너비를 넘지 않는다 */
    const box = await page.locator(".imory-popover").boundingBox();
    check("[menu] 모바일에서 화면 밖으로 나가지 않음",
      box && box.x >= 0 && box.x + box.width <= 390,
      box ? `x=${box.x.toFixed(0)} w=${box.width.toFixed(0)}` : "no box");

    /* 글자 크기 — 본문 그릇의 실제 font-size가 커진다 */
    const before = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-imory-region="post-body"]')).fontSize
    );
    await page.locator(".imory-popover-step").nth(1).click();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-imory-region="post-body"]')).fontSize
    );
    check("[menu] + 로 본문 글자가 커진다",
      parseFloat(after) > parseFloat(before),
      `${before} -> ${after}`);

    /* 원본 본문 글자는 그대로다 */
    const bodyText = await page.evaluate(() =>
      document.querySelector('[data-imory-region="post-body"]').textContent
    );
    check("[menu] 본문 내용은 그대로", bodyText.includes("첫 문장입니다"));

    /* Escape로 닫힌다 */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const closed = await page.locator(".imory-popover").isHidden();
    check("[menu] Escape로 닫힌다", closed);

    /* 링크 복사 — 클립보드 권한 없이도 값 자체를 확인한다 */
    const canonical = await page.evaluate(() => buildCanonicalPostUrl(101));
    check("[menu] 글 링크는 쿼리 없는 정식 주소",
      canonical === `${BASE}/${SLUG}/post/101`,
      canonical);

    check("[menu] 콘솔 오류 없음", errors.length === 0, errors.join(" | "));

    await shot(page, "menu-owner");
  });

  await withPage({ width: 390, height: 844 }, { db: makeDb(), signedInAs: null }, async (page) => {
    await gotoPost(page);

    await page.locator("#postToolsButton").click();
    await page.waitForSelector(".imory-popover:not([hidden])", { timeout: 5000 });

    const items = await page.locator(".imory-popover-item-label").allTextContents();
    check("[menu] 방문자 메뉴에는 링크 복사만",
      items.includes("글 링크 복사") &&
      !items.includes("하이라이팅 모드") &&
      !items.includes("글 수정"),
      items.join(" | "));
  });
}


/* =========================================================
   [highlight] 하이라이팅 모드 · 저장 · 겹침 · 새로고침 유지
========================================================== */

async function testHighlighting() {
  console.log("\n[highlight] 하이라이팅");

  const db = makeDb();

  await withPage({ width: 1280, height: 900 }, { db, signedInAs: OWNER_ID }, async (page, { errors }) => {
    await gotoPost(page);

    await page.locator("#postToolsButton").click();
    await page.locator(".imory-popover-item", { hasText: "하이라이팅 모드" }).click();
    await page.waitForSelector(".post-highlight-mode-bar", { timeout: 5000 });

    check("[highlight] 모드 표시와 완료 버튼",
      await page.locator(".post-highlight-mode-done").isVisible());

    /* 본문 레이아웃이 유지된다 */
    const bodyStillThere = await page.evaluate(() =>
      document.querySelector('[data-imory-region="post-body"]').textContent.includes("두 번째 문장")
    );
    check("[highlight] 모드에서도 본문 그대로", bodyStillThere);

    /* --- 선택 → 색 → 저장 --- */

    const sel = await selectRange(page, 0, 7);
    check("[highlight] 범위 선택", sel.ok && sel.selected === "첫 문장입니다", JSON.stringify(sel.selected));

    await pickFirstColor(page);

    check("[highlight] 저장됨(1건)", db.post_highlights.length === 1,
      JSON.stringify(db.post_highlights.map(h => h.excerpt)));

    const saved = db.post_highlights[0];
    check("[highlight] 발췌문/위치 저장", saved && saved.excerpt === "첫 문장입니다" && saved.text_start === 0,
      saved ? `${saved.excerpt}@${saved.text_start}` : "none");
    check("[highlight] 앞뒤 문맥 저장", saved && saved.suffix.length > 0, saved?.suffix);

    const painted = await page.locator(".post-highlight").count();
    check("[highlight] 화면에 칠해짐", painted >= 1, `spans=${painted}`);

    /* --- 같은 범위 재선택 → 색만 변경 --- */

    await selectRange(page, 0, 7);
    await pickFirstColor(page);
    await page.waitForTimeout(300);

    /* 첫 번째와 다른 색을 고르기 위해 두 번째 스와치를 쓴다 */
    await selectRange(page, 0, 7);
    await page.waitForSelector(".imory-color-menu:not([hidden])", { timeout: 5000 });
    await page.locator(".imory-color-menu .imory-color-menu-swatch").nth(2).click();
    await page.waitForTimeout(500);

    check("[highlight] 같은 범위 재선택은 중복 카드를 만들지 않는다",
      db.post_highlights.length === 1, `n=${db.post_highlights.length}`);

    /* --- 부분 겹침 → 거절 --- */

    await selectRange(page, 3, 12);
    await pickFirstColor(page);
    await page.waitForTimeout(400);

    check("[highlight] 부분 겹침은 저장되지 않는다",
      db.post_highlights.length === 1, `n=${db.post_highlights.length}`);

    const toast = await page.locator(".post-viewer-toast.is-visible").textContent().catch(() => "");
    check("[highlight] 겹침을 알린다", (toast || "").includes("겹칩니다"), toast);

    /* --- 떨어진 범위 → 별도 항목 --- */

    await page.waitForTimeout(2400);
    await selectRange(page, 9, 18);
    await pickFirstColor(page);

    check("[highlight] 떨어진 범위는 별도 항목",
      db.post_highlights.length === 2, `n=${db.post_highlights.length}`);

    /* --- 완료 --- */

    await page.locator(".post-highlight-mode-done").click();
    await page.waitForTimeout(200);
    check("[highlight] 완료하면 모드 표시가 사라진다",
      await page.locator(".post-highlight-mode-bar").count() === 0);
    check("[highlight] 완료해도 표시는 남는다",
      await page.locator(".post-highlight").count() >= 2);

    /* --- 새로고침 후에도 유지 --- */

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelectorAll(".post-highlight").length >= 2,
      null, { timeout: 20000 }
    );
    check("[highlight] 새로고침 후에도 유지", true);

    /* --- 원본 서식 훼손 없음 --- */

    const plain = await page.evaluate(() =>
      document.querySelector('[data-imory-region="post-body"]').textContent.replace(/\s+/g, " ").trim()
    );
    check("[highlight] 본문 글자가 달라지지 않는다",
      plain.includes("첫 문장입니다") && plain.includes("반복되는 문장입니다"), plain.slice(0, 40));

    check("[highlight] 콘솔 오류 없음", errors.length === 0, errors.join(" | "));

    await shot(page, "highlight");
  });
}


/* =========================================================
   [memo] 말풍선 · 메모 저장 · 메모 삭제와 하이라이트 삭제의 차이
========================================================== */

async function testMemo() {
  console.log("\n[memo] 메모");

  const db = makeDb();
  db.post_highlights.push({
    id: "hl-1", post_id: 101, user_id: OWNER_ID, color: "#f6e0c8",
    excerpt: "첫 문장입니다", prefix: "", suffix: ". 두 번째",
    text_start: 0, note: null,
    created_at: "2026-09-05T01:00:00Z", updated_at: "2026-09-05T01:00:00Z"
  });

  await withPage({ width: 1280, height: 900 }, { db, signedInAs: OWNER_ID }, async (page, { errors }) => {
    await gotoPost(page);

    await page.waitForSelector(".post-highlight", { timeout: 10000 });

    /* 읽기 상태에서 메모 없는 하이라이트는 아무것도 열지 않는다 */
    await page.locator(".post-highlight").first().click();
    await page.waitForTimeout(250);
    check("[memo] 읽기 상태 · 메모 없으면 말풍선 없음",
      await page.locator(".imory-popover").isHidden());

    /* 하이라이팅 모드에서 누르면 메모/삭제 */
    await page.locator("#postToolsButton").click();
    await page.locator(".imory-popover-item", { hasText: "하이라이팅 모드" }).click();
    await page.waitForSelector(".post-highlight-mode-bar");

    await page.locator(".post-highlight").first().click();
    await page.waitForSelector(".imory-popover:not([hidden])", { timeout: 5000 });

    const bubbleItems = await page.locator(".imory-popover-item-label").allTextContents();
    check("[memo] 말풍선에 메모/삭제",
      bubbleItems.includes("메모") && bubbleItems.includes("삭제"), bubbleItems.join(" | "));

    /* 말풍선 자리 — 누른 문장 근처 */
    const spanBox = await page.locator(".post-highlight").first().boundingBox();
    const popBox = await page.locator(".imory-popover").boundingBox();
    check("[memo] 말풍선이 그 문장 가까이에 선다",
      popBox && spanBox && Math.abs((popBox.y + popBox.height) - spanBox.y) < 200,
      `span.y=${spanBox?.y.toFixed(0)} pop.y=${popBox?.y.toFixed(0)}`);

    /* 메모 작성 */
    await page.locator(".imory-popover-item", { hasText: "메모" }).first().click();
    await page.waitForSelector(".post-memo-popup-field", { timeout: 5000 });

    const excerptShown = await page.locator(".post-memo-popup-excerpt").textContent();
    check("[memo] 팝업 위쪽에 발췌문", (excerptShown || "").includes("첫 문장입니다"), excerptShown);

    await page.locator(".post-memo-popup-field").fill("여기에 메모를 씁니다");
    await page.locator(".post-memo-popup-save").click();
    await page.waitForTimeout(600);

    check("[memo] 메모가 저장된다", db.post_highlights[0].note === "여기에 메모를 씁니다",
      String(db.post_highlights[0].note));

    check("[memo] 팝업이 닫힌다", await page.locator(".post-memo-popup").count() === 0);

    /* 메모가 생기면 읽기 상태에서 읽을 수 있다 */
    await page.locator(".post-highlight-mode-done").click();
    await page.waitForTimeout(200);
    await page.locator(".post-highlight").first().click();
    await page.waitForSelector(".imory-popover-note", { timeout: 5000 });
    const noteText = await page.locator(".imory-popover-note").textContent();
    check("[memo] 읽기 상태에서 메모를 읽는다", (noteText || "").includes("여기에 메모를"), noteText);

    const editToolsInReading = await page.locator(".imory-popover-item").count();
    check("[memo] 읽기 상태 말풍선에는 편집 도구가 없다", editToolsInReading === 0);

    check("[memo] 콘솔 오류 없음", errors.length === 0, errors.join(" | "));
    await shot(page, "memo");
  });

  /* 방문자: 메모는 읽히지만 편집 도구는 없다 */

  await withPage({ width: 1280, height: 900 }, { db, signedInAs: null }, async (page) => {
    await gotoPost(page);
    await page.waitForSelector(".post-highlight", { timeout: 10000 });

    await page.locator(".post-highlight").first().click();
    await page.waitForSelector(".imory-popover-note", { timeout: 5000 });
    check("[memo] 방문자도 공개 글의 메모를 읽는다",
      (await page.locator(".imory-popover-note").textContent() || "").includes("여기에 메모를"));

    await page.keyboard.press("Escape");
    await page.locator("#postToolsButton").click();
    await page.waitForSelector(".imory-popover:not([hidden])");
    const items = await page.locator(".imory-popover-item-label").allTextContents();
    check("[memo] 방문자에게 하이라이팅 모드가 없다", !items.includes("하이라이팅 모드"), items.join(" | "));
  });
}


/* =========================================================
   [memos] 메모 카테고리
========================================================== */

async function testMemoScreen() {
  console.log("\n[memos] 메모 카테고리");

  const db = makeDb();
  db.post_highlights.push(
    {
      id: "hl-1", post_id: 101, user_id: OWNER_ID, color: "#f6e0c8",
      excerpt: "첫 문장입니다", prefix: "", suffix: ".", text_start: 0,
      note: "메모가 있는 카드",
      created_at: "2026-09-05T01:00:00Z", updated_at: "2026-09-05T01:00:00Z"
    },
    {
      id: "hl-2", post_id: 101, user_id: OWNER_ID, color: "#cfe0f0",
      excerpt: "두 번째 문장입니다", prefix: ". ", suffix: "", text_start: 9,
      note: null,
      created_at: "2026-09-06T01:00:00Z", updated_at: "2026-09-06T01:00:00Z"
    }
  );

  await withPage({ width: 390, height: 844 }, { db, signedInAs: OWNER_ID }, async (page, { errors }) => {
    await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memo-card", { timeout: 20000 });

    const cards = await page.locator(".memo-card").count();
    check("[memos] 카드 목록", cards === 2, `n=${cards}`);

    const firstExcerpt = await page.locator(".memo-card-excerpt").first().textContent();
    check("[memos] 최신순 정렬", (firstExcerpt || "").includes("두 번째 문장"), firstExcerpt);

    const notes = await page.locator(".memo-card-note:visible").count();
    check("[memos] 메모가 있는 카드에만 메모 영역", notes === 1, `n=${notes}`);

    const missing = await page.locator(".memo-card-missing:visible").count();
    check("[memos] 위치를 확인한 적이 없으면 '찾을 수 없음'을 붙이지 않는다",
      missing === 0, `n=${missing}`);

    const meta = await page.locator(".memo-card-meta").first().textContent();
    check("[memos] 원본 글 제목과 카테고리명",
      (meta || "").includes("첫 번째 글") && (meta || "").includes("일기"), meta);

    const ownerMenus = await page.locator(".memo-card-menu").count();
    check("[memos] 주인장에게 카드 ⋮", ownerMenus === 2, `n=${ownerMenus}`);

    /* 가로 넘침 없음 */
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    check("[memos] 모바일 가로 넘침 없음", overflow <= 1, `overflow=${overflow}`);

    /* 메모 삭제 vs 하이라이트 삭제 */
    page.on("dialog", d => d.accept());

    await page.locator(".memo-card-menu").nth(1).click();
    await page.waitForSelector(".imory-popover:not([hidden])");
    const cardItems = await page.locator(".imory-popover-item-label").allTextContents();
    check("[memos] 메모 있는 카드 메뉴 = 수정/메모 삭제/하이라이트 삭제",
      cardItems.includes("메모 수정") && cardItems.includes("메모 삭제") && cardItems.includes("하이라이트 삭제"),
      cardItems.join(" | "));

    await page.locator(".imory-popover-item", { hasText: "메모 삭제" }).click();
    await page.waitForTimeout(800);

    check("[memos] 메모 삭제는 카드를 남긴다",
      db.post_highlights.length === 2 && db.post_highlights.find(h => h.id === "hl-1").note === null,
      `n=${db.post_highlights.length}`);

    await page.waitForSelector(".memo-card", { timeout: 10000 });
    await page.locator(".memo-card-menu").nth(1).click();
    await page.waitForSelector(".imory-popover:not([hidden])");
    await page.locator(".imory-popover-item", { hasText: "하이라이트 삭제" }).click();
    await page.waitForTimeout(900);

    check("[memos] 하이라이트 삭제는 카드를 지운다",
      db.post_highlights.length === 1, `n=${db.post_highlights.length}`);

    /* 폴더별 보기 */
    await page.goto(`${BASE}/${SLUG}/memos?view=folders`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memo-folder-card", { timeout: 20000 });
    const folderName = await page.locator(".memo-folder-card .memo-folder-name:visible").first().textContent();
    const folderCount = await page.locator(".memo-folder-count:visible").first().textContent();
    check("[memos] 폴더별 보기 = 원본 카테고리", (folderName || "").includes("일기"), folderName);
    check("[memos] 열람 가능한 개수", (folderCount || "").includes("1개"), folderCount);

    check("[memos] 콘솔 오류 없음", errors.length === 0, errors.join(" | "));
    await shot(page, "memos");
  });

  /* 방문자에게는 편집 도구가 없다 */

  await withPage({ width: 390, height: 844 }, { db, signedInAs: null }, async (page) => {
    await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memo-card", { timeout: 20000 });
    check("[memos] 방문자에게 카드 ⋮ 없음",
      await page.locator(".memo-card-menu").count() === 0);
  });
}


/* =========================================================
   [protect] 비밀글/비공개 글의 발췌문이 방문자에게 가지 않는다
========================================================== */

async function testProtection() {
  console.log("\n[protect] 접근 경계");

  const db = makeDb();
  db.posts.push({
    id: 102, user_id: OWNER_ID, category_id: 1, title: "비밀 글",
    content_type: "text", visibility: "secret",
    created_at: "2026-09-03T02:00:00Z", quote_preset_id: null
  });
  db.post_highlights.push({
    id: "hl-secret", post_id: 102, user_id: OWNER_ID, color: "#ff0000",
    excerpt: "비밀 발췌문입니다", prefix: "", suffix: "", text_start: 0,
    note: "비밀 메모",
    created_at: "2026-09-07T01:00:00Z", updated_at: "2026-09-07T01:00:00Z"
  });

  await withPage({ width: 1280, height: 900 }, { db, signedInAs: null }, async (page) => {
    const bodies = [];
    page.on("response", async (res) => {
      if (!res.url().includes("post_highlights")) return;
      try { bodies.push(await res.text()); } catch { /* 무시 */ }
    });

    await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const dom = await page.content();
    check("[protect] 비밀글 발췌문이 DOM에 없다", !dom.includes("비밀 발췌문입니다"));
    check("[protect] 비밀 메모가 DOM에 없다", !dom.includes("비밀 메모"));
    check("[protect] 응답에도 없다",
      bodies.every(b => !b.includes("비밀 발췌문입니다")),
      `responses=${bodies.length}`);
  });

  await withPage({ width: 1280, height: 900 }, { db, signedInAs: OWNER_ID }, async (page) => {
    await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memo-card", { timeout: 20000 });
    const text = await page.locator(".memo-card-list").textContent();
    check("[protect] 같은 순간 주인장에게는 보인다",
      (text || "").includes("비밀 발췌문입니다"));
  });


  /* =========================================================
     차단만 확인하면 반쪽이다 — **정상 해제한 방문자**가 허용된
     발췌문·메모를 읽을 수 있어야 기능이 성립한다.

     해제 경로는 기존 그대로다: 비밀번호 폼 → get_secret_post_content.
     하이라이트는 그 통과 여부를 다시 쓰는 RPC 하나로만 온다
     (get_secret_post_highlights) — 이 테스트가 그 두 경로를 함께
     지나간다.
  ========================================================== */

  {
    const unlockDb = makeDb();

    unlockDb.posts.push({
      id: 103, user_id: OWNER_ID, category_id: 1, title: "잠긴 글",
      content_type: "text", visibility: "secret", secret_password: "letmein",
      created_at: "2026-09-04T02:00:00Z", updated_at: "2026-09-04T02:00:00Z",
      quote_preset_id: null
    });

    unlockDb.post_contents.push({
      post_id: 103,
      content: "잠긴 본문의 첫 문장입니다. 두 번째 문장입니다.",
      ooc_content: null
    });

    unlockDb.post_highlights.push({
      id: "hl-unlock", post_id: 103, user_id: OWNER_ID, color: "#f6e0c8",
      excerpt: "잠긴 본문의 첫 문장입니다", prefix: "", suffix: ". 두 번째",
      text_start: 0, note: "해제하면 읽히는 메모",
      created_at: "2026-09-07T03:00:00Z", updated_at: "2026-09-07T03:00:00Z"
    });

    await withPage({ width: 1280, height: 900 }, { db: unlockDb, signedInAs: null }, async (page) => {
      await page.goto(`${BASE}/${SLUG}/post/103`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#postSecretGateInput", { timeout: 20000 });

      /* --- 틀린 비밀번호로는 아무것도 오지 않는다 --- */

      await page.fill("#postSecretGateInput", "nope");
      await page.click("#postSecretGateSubmit");
      await page.waitForTimeout(900);

      check("[protect] 오답이면 본문이 열리지 않는다",
        !(await page.locator("body").innerText()).includes("잠긴 본문의 첫 문장"));

      check("[protect] 오답 상태에서 발췌문도 메모도 없다",
        !(await page.content()).includes("해제하면 읽히는 메모"));

      /* --- 정답 --- */

      await page.fill("#postSecretGateInput", "letmein");
      await page.click("#postSecretGateSubmit");
      await page.waitForFunction(
        () => document.body.innerText.includes("잠긴 본문의 첫 문장"),
        null,
        { timeout: 20000 }
      );
      await page.waitForTimeout(900);

      const spans = await page.locator(".post-highlight").count();
      check("[protect] ★ 정상 해제한 방문자는 발췌문 표시를 본다",
        spans === 1, `spans=${spans}`);

      await page.locator(".post-highlight").first().click();
      await page.waitForTimeout(500);

      const bubble = await page.locator(".imory-popover").innerText();
      check("[protect] ★ 그 메모도 읽을 수 있다",
        bubble.includes("해제하면 읽히는 메모"), bubble.slice(0, 60));

      check("[protect] 방문자에게는 편집 도구가 없다",
        !bubble.includes("삭제"), bubble.slice(0, 60));
    });
  }
}


/* =========================================================
   [entry] 메모 화면으로 가는 기본 진입점

   기존 스킨은 navigation.memos를 그리지 않는다. 그때만 플랫폼이
   작은 칩을 얹고, 스킨이 이미 그렸거나 사용자가 껐으면 얹지 않는다
   (skin/skin-memo-entry.js).
========================================================== */

const MEMO_ENTRY = "#imoryPlatformMemoEntry";

async function testMemoEntry() {
  console.log("\n[entry] 메모 진입점");

  /* --- 1) 메모 링크가 없는 스킨: HOME에 칩이 나온다 --- */

  await withPage({ width: 1280, height: 900 }, { db: makeDb(), signedInAs: null }, async (page) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(MEMO_ENTRY, { timeout: 20000 });

    const href = await page.locator(MEMO_ENTRY).getAttribute("href");
    check("[entry] 스킨에 메모 링크가 없으면 플랫폼이 칩을 얹는다",
      href === `/${SLUG}/memos`, href);

    /* 문서 전체 리로드가 아니라 기존 SPA 라우터를 탄다 */
    await page.evaluate(() => { window.__imoryNoReload = true; });
    await page.locator(MEMO_ENTRY).click();
    await page.waitForFunction(
      () => location.pathname.endsWith("/memos"),
      null,
      { timeout: 20000 }
    );
    await page.waitForTimeout(1200);

    check("[entry] ★ 기존 SPA 라우터로 간다(문서를 새로 받지 않는다)",
      (await page.evaluate(() => window.__imoryNoReload === true)) === true);

    check("[entry] 메모 화면이 열린다",
      (await page.locator(".memo-screen").count()) === 1);

    check("[entry] 메모 화면에서는 칩이 사라진다",
      (await page.locator(MEMO_ENTRY).count()) === 0);

    await page.goBack();
    await page.waitForTimeout(1500);
    check("[entry] HOME으로 돌아오면 다시 나온다",
      (await page.locator(MEMO_ENTRY).count()) === 1);
  });


  /* --- 2) 사용자가 껐으면 나오지 않는다 --- */

  {
    const db = makeDb();
    db.site_settings.push({ user_id: OWNER_ID, key: "hide_memo_entry", value: "on" });

    await withPage({ width: 1280, height: 900 }, { db, signedInAs: null }, async (page) => {
      await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      check("[entry] ★ Settings에서 껐으면 얹지 않는다",
        (await page.locator(MEMO_ENTRY).count()) === 0);
    });
  }


  /* --- 3) 스킨이 자기 메모 링크를 그렸으면 중복 표시하지 않는다 --- */

  {
    const skin = JSON.parse(JSON.stringify(SKIN_PACKAGE));
    skin.templates.home.html +=
      `<a class="skin-own-memos" data-imory-href="navigation.memos.href" data-imory-bind="navigation.memos.name"></a>`;

    await withPage({ width: 1280, height: 900 }, { db: makeDb(), signedInAs: null, skin }, async (page) => {
      await page.waitForTimeout(0);
      await page.goto(`${BASE}/${SLUG}/`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".skin-own-memos", { timeout: 20000 });
      await page.waitForTimeout(1000);

      check("[entry] 스킨이 그린 메모 링크가 실제로 있다",
        (await page.locator(".skin-own-memos").getAttribute("href")) === `/${SLUG}/memos`);

      check("[entry] ★ 스킨이 그렸으면 플랫폼 칩은 얹지 않는다(중복 없음)",
        (await page.locator(MEMO_ENTRY).count()) === 0);
    });
  }


  /* --- 4) 글 읽기 화면에서도 닿고, 모바일에서 넘치지 않는다 --- */

  await withPage({ width: 390, height: 780 }, { db: makeDb(), signedInAs: null }, async (page) => {
    await gotoPost(page);
    await page.waitForTimeout(600);

    check("[entry] 글 읽기 화면에도 있다",
      (await page.locator(MEMO_ENTRY).count()) === 1);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    check("[entry] 모바일에서 가로로 넘치지 않는다", overflow <= 1, `overflow=${overflow}`);
  });
}


/* =========================================================
   [state] 원문 위치 확인 — 세 가지 상태

     unknown  아직 확인하지 않음(다른 기기 / 확인 뒤 본문 수정)
     found    마지막 확인에서 찾았다
     missing  마지막 확인에서 찾지 못했다

   그리고 "조회 실패"를 "저장된 항목 없음"으로 표시하지 않는다.
========================================================== */

const MISSING_LABEL = ".memo-card-missing:visible";
const UNCHECKED_LABEL = ".memo-card-unchecked:visible";

function seedTwoHighlights(db) {
  db.post_highlights.push({
    id: "hl-found", post_id: 101, user_id: OWNER_ID, color: "#f6e0c8",
    excerpt: "첫 문장입니다", prefix: "", suffix: ". 두 번째 문장입니다.", text_start: 0,
    note: "찾히는 카드",
    created_at: "2026-09-07T01:00:00Z", updated_at: "2026-09-07T01:00:00Z"
  });
  db.post_highlights.push({
    id: "hl-gone", post_id: 101, user_id: OWNER_ID, color: "#d8ecf3",
    excerpt: "지금은 본문에 없는 문장", prefix: "", suffix: "", text_start: 400,
    note: "사라진 카드",
    created_at: "2026-09-07T02:00:00Z", updated_at: "2026-09-07T02:00:00Z"
  });
}

async function testPlacementState() {
  console.log("\n[state] 원문 위치 확인 상태");

  /* --- 1) 한 번도 열어 본 적 없는 기기: 전부 "확인 전" --- */

  {
    const db = makeDb();
    seedTwoHighlights(db);

    await withPage({ width: 1280, height: 900 }, { db, signedInAs: OWNER_ID }, async (page) => {
      await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".memo-card", { timeout: 20000 });
      await page.waitForTimeout(500);

      const missing = await page.locator(MISSING_LABEL).count();
      const unchecked = await page.locator(UNCHECKED_LABEL).count();

      check("[state] 확인 전에는 '찾을 수 없음'을 붙이지 않는다",
        missing === 0, `n=${missing}`);

      check("[state] ★ 대신 '확인 전'이라고 말한다(모른다 ≠ 정상)",
        unchecked === 2, `n=${unchecked}`);
    });
  }


  /* --- 2) 글을 열면 그 자리에서 판정된다 → found / missing --- */

  {
    const db = makeDb();
    seedTwoHighlights(db);

    await withPage({ width: 1280, height: 900 }, { db, signedInAs: OWNER_ID }, async (page) => {
      await gotoPost(page);
      await page.waitForTimeout(900);

      const stored = await page.evaluate(() =>
        window.localStorage.getItem("imory-highlight-placement")
      );
      const parsed = JSON.parse(stored || "{}");

      check("[state] 글을 열면 그 글의 판정이 기록된다",
        Array.isArray(parsed["101"]?.f) && Array.isArray(parsed["101"]?.m),
        stored);

      check("[state] 찾은 것은 f, 못 찾은 것은 m",
        parsed["101"]?.f?.includes("hl-found") === true &&
        parsed["101"]?.m?.includes("hl-gone") === true,
        JSON.stringify(parsed["101"]));

      check("[state] ★ 기록에 그때의 글 수정 시각이 함께 남는다",
        Boolean(parsed["101"]?.v), String(parsed["101"]?.v));

      await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".memo-card", { timeout: 20000 });
      await page.waitForTimeout(500);

      const missing = await page.locator(MISSING_LABEL).count();
      const unchecked = await page.locator(UNCHECKED_LABEL).count();

      check("[state] 못 찾은 카드 하나만 '찾을 수 없음'", missing === 1, `n=${missing}`);
      check("[state] 찾은 카드에는 아무 표시도 없다", unchecked === 0, `n=${unchecked}`);
    });
  }


  /* --- 3) 그 뒤 원문을 고치면 예전 판정은 현재 상태가 아니다 --- */

  {
    const db = makeDb();
    seedTwoHighlights(db);

    await withPage({ width: 1280, height: 900 }, { db, signedInAs: OWNER_ID }, async (page) => {
      await gotoPost(page);
      await page.waitForTimeout(900);

      /* 주인장이 본문을 고쳤다 — updated_at이 올라간다 */
      db.posts[0].updated_at = "2027-01-01T00:00:00Z";

      await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".memo-card", { timeout: 20000 });
      await page.waitForTimeout(500);

      const missing = await page.locator(MISSING_LABEL).count();
      const unchecked = await page.locator(UNCHECKED_LABEL).count();

      check("[state] ★ 본문을 고치면 예전 '찾을 수 없음'이 남지 않는다",
        missing === 0, `n=${missing}`);

      check("[state] ★ 두 장 모두 '확인 전'으로 돌아간다",
        unchecked === 2, `n=${unchecked}`);
    });
  }


  /* --- 4) updated_at SELECT 권한이 없는 배포에서도 목록은 나온다 --- */

  {
    const db = makeDb();
    seedTwoHighlights(db);

    await withPage(
      { width: 1280, height: 900 },
      { db, signedInAs: OWNER_ID, noPostUpdatedAt: true },
      async (page) => {
        await page.goto(`${BASE}/${SLUG}/memos`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".memo-card", { timeout: 20000 });
        await page.waitForTimeout(500);

        const cards = await page.locator(".memo-card").count();
        check("[state] ★ migration 이전 배포에서도 카드는 전부 보인다",
          cards === 2, `n=${cards}`);
      }
    );
  }


  /* --- 5) 조회 실패를 "없음"으로 표시하지 않는다 --- */

  {
    const db = makeDb();
    seedTwoHighlights(db);

    await withPage(
      { width: 1280, height: 900 },
      { db, signedInAs: null, failHighlightSelect: true },
      async (page) => {
        await gotoPost(page);
        await page.waitForTimeout(1000);

        const bodyText = await page.locator("body").innerText();

        check("[state] 방문자: 글은 그대로 열린다",
          bodyText.includes("첫 문장입니다"));

        check("[state] ★ 방문자에게 DB 오류를 노출하지 않는다",
          !/PGRST|permission denied|does not exist|하이라이트를 불러오지 못/i.test(bodyText),
          bodyText.slice(0, 80));
      }
    );

    const ownerOpts = { db, signedInAs: OWNER_ID, failHighlightSelect: true };

    await withPage({ width: 1280, height: 900 }, ownerOpts, async (page) => {
      await gotoPost(page);
      await page.waitForTimeout(1000);

      await page.locator("#postToolsButton").click();
      await page.waitForSelector(".imory-popover:not([hidden])", { timeout: 5000 });
      await page.locator(".imory-popover-item-label", { hasText: "하이라이팅 모드" }).click();
      await page.waitForTimeout(600);

      const toast = await page.locator("#postViewerToast").innerText();

      check("[state] ★ 주인장에게는 '지금은 쓸 수 없다'를 알린다",
        toast.includes("불러오지 못해"), toast);

      check("[state] ★ 다시 시도할 방법을 준다",
        (await page.locator(".post-viewer-toast-action").count()) === 1);

      check("[state] 모드가 열리지 않는다",
        (await page.locator(".post-highlight-mode-bar").count()) === 0);

      /* 조회가 되게 바꾼 뒤 '다시 시도' */
      ownerOpts.failHighlightSelect = false;

      await page.locator(".post-viewer-toast-action").click();
      await page.waitForTimeout(1200);

      check("[state] ★ 다시 시도하면 모드가 열린다",
        (await page.locator(".post-highlight-mode-bar").count()) === 1);

      check("[state] 다시 시도 뒤에는 하이라이트도 칠해진다",
        (await page.locator(".post-highlight").count()) === 1,
        `n=${await page.locator(".post-highlight").count()}`);
    });
  }
}


/* =========================================================
   RUN
========================================================== */

(async () => {
  playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  console.log(`HIGHLIGHT-1 E2E — ${BROWSER} — http://localhost:${PORT}`);

  try {
    if (wants("menu")) await testToolsMenu();
    if (wants("highlight")) await testHighlighting();
    if (wants("memo")) await testMemo();
    if (wants("memos")) await testMemoScreen();
    if (wants("entry")) await testMemoEntry();
    if (wants("state")) await testPlacementState();
    if (wants("protect")) await testProtection();
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("실패:\n  - " + failures.join("\n  - "));
  }
  process.exit(failed ? 1 : 0);
})();
