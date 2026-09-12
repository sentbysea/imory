/* =========================================================
   GALLERY-1 — 갤러리 표시 · 대표 이미지 · 페이지 이동 E2E

   기준 문서: IMORY_GALLERY1_DESIGN.md

   확인 범위(요구사항 7절 "관련 범위만"):

     published  공개 갤러리 렌더 — 데스크톱 3열 / 모바일 2열,
                정사각 썸네일, 사진 없음 대체 카드, 잠금 카드,
                소유자/방문자의 공개·비밀·비공개 글 표시와 개수,
                목록 렌더 중 본문 요청 0건, 모바일 가로 넘침 없음
     secret     비밀글 보호 — 방문자 응답/DOM/이미지 요청 어디에도
                비밀글의 실제 대표 이미지 주소가 없다.
                "지정 이미지" 모드에서는 공통 대체 이미지 + 잠금 유지
     paging     12개씩 페이지 이동 — 링크 클릭 / 직접 접속 / 뒤로가기 /
                글에 들어갔다 복귀 / 범위를 벗어난 페이지 / 빈 카테고리
     compat     기존 스킨·기존 카테고리 회귀 — 갤러리를 모르는 스킨은
                list_style=gallery여도 전체 목록을 그대로 받는다,
                목록 카테고리·폴더·이어읽기 그대로
     cover      글 작성/수정 폼의 대표 이미지 — 업로드·교체·제거,
                저장 실패 시 기존 값 보존, 취소 시 임시 파일 없음
     access     **파일 자체의 접근 경계** — 비공개 버킷 + 요청마다
                권한 확인(/api/post-cover). 공개→비밀/비공개 전환 뒤
                같은 주소 재요청, 소유자 미리보기, 다시 공개로 복귀,
                파일을 하나도 건드리지 않아도 차단되는지
     protect    블로그 보호 설정(Settings > HOME > ETC) — 이미지 EXIF
                제거, 우클릭 방지, 텍스트 복사 방지(주인장 제외)와
                그 설정 화면의 저장 payload
     preview    Studio Preview가 공개 화면과 같은 구조를 그린다

   skin/skin-folder-tree-e2e-test.mjs와 같은 규약이다(정적 서버 +
   Supabase 네트워크만 mock + 저장소의 실제 파일). mock에는 RLS가
   없으므로 아래 네 가지만 실제 정책을 흉내 낸다:
     1) 비소유자에게는 private 글 행이 오지 않는다(posts RLS)
     2) 비소유자에게는 public이 아닌 글의 post_covers 행이 오지 않는다
        (post_covers_public_read 정책)
     3) 'post-covers'는 **비공개 버킷**이라 /object/public/ 주소는
        무조건 404다
     4) /object/post-covers/<경로>는 요청 시점의 글 공개 상태와
        요청자를 본다(post_cover_object_is_readable + storage 정책)

   ★ /api/post-cover는 mock이 아니라 **실제 Pages Function**이다
   정적 서버가 functions/api/post-cover.js를 그대로 import해서
   돌린다(env.SUPABASE_URL만 이 서버의 /__supabase로 돌려놓는다).
   그래서 이 e2e가 재는 접근 경계는 배포되는 코드 그 자체다.

   ★ 실행 방법
     node skin/skin-gallery-e2e-test.mjs
     node skin/skin-gallery-e2e-test.mjs --browser=webkit
     node skin/skin-gallery-e2e-test.mjs --only=paging

   --only= 뒤에 쓸 수 있는 이름:
     published / secret / paging / compat / cover / access / protect / preview
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8948;
const SLUG = "testuser";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const POST_COVER_BUCKET = "post-covers";

/* 비공개 버킷이 된 뒤로 이 주소는 **항상 404**여야 한다 —
   "예전에 알던 주소"를 재현하는 데만 쓴다. */
const COVER_BASE =
  `https://${SUPABASE_HOST}/storage/v1/object/public/${POST_COVER_BUCKET}`;

/* 화면이 실제로 쓰는 주소(core/lib/post-cover-url.js) */
const coverUrl = (postId) => `/api/post-cover?post=${postId}`;
const categoryCoverUrl = (categoryId) => `/api/post-cover?category=${categoryId}`;

/* 소유자의 access token. 실제 JWT 모양이어야 한다 —
   core/lib/post-cover-url.js가 그 모양만 쿠키에 넣고,
   functions/api/post-cover.js도 같은 검사를 한다. */
const OWNER_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.mock-owner-signature-value";

/*
  Node 쪽(정적 서버 + Pages Function)이 보는 fixture. 브라우저의
  page.route mock과 **같은 객체**를 가리킨다 — installSupabaseMock이
  매번 여기에 등록한다. 절들은 순차 실행이라 하나면 충분하다.
*/
const serverFixture = {
  db: null,
  storage: null
};

/* CATEGORY/FOLDER 스킨은 #postList 안에 mount된다 — HOME 스킨(#themeMount)의
   .imory-skin-root과 구분해야 한다(posts/view/posts-view-list.js). */
const PAGE_ROOT = "#postList .imory-skin-root";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const DEBUG = args.includes("--debug");

/* --verbose: 페이지의 오류/경고를 그대로 흘려 준다(원인 추적용) */
const VERBOSE = args.includes("--verbose");

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
    "`npx playwright install " + browserName + "`을 먼저 실행하세요."
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

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);


/* 배포되는 그 파일 그대로 */
const postCoverFunction =
  await import(
    pathToFileURL(path.join(ROOT, "functions", "api", "post-cover.js")).href
  );


function serverRequestIsOwner(req) {
  return (req.headers["authorization"] || "") === `Bearer ${OWNER_TOKEN}`;
}


/*
  supabase/migrations/20260911100000_post_covers_private_access.sql의
  post_cover_object_is_readable()과 같은 술어다.
*/
function serverCoverObjectIsReadable(key, isOwner, tokens = "") {
  const db = serverFixture.db;
  if (!db) return false;

  const photo = (db.post_gallery_images || []).find(g => g.storage_path === key);
  if (photo) {
    const post = db.posts.find(p => p.id === photo.post_id);
    return !!post && (post.visibility === "public" || isOwner ||
      (post.visibility === "secret" && (db.gallery_read_tokens || []).some(t => t.post_id === post.id && tokens.split(',').includes(t.token))));
  }

  const cover = db.post_covers.find(c => c.__path === key);
  if (cover) {
    const post = db.posts.find(p => String(p.id) === String(cover.post_id));
    return !!post && (post.visibility === "public" || isOwner);
  }

  return db.categories.some(c => c.secret_cover_path === key);
}


function readServerJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
  });
}


/*
  Pages Function이 부르는 Supabase만 흉내 낸다 — 판정 규칙은 위
  두 함수(=migration의 SQL)와 같다.
*/
async function handleServerSupabase(req, res, rel) {
  const isOwner = serverRequestIsOwner(req);
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (rel === "/__supabase/rest/v1/rpc/get_gallery_image_object") {
    const body = await readServerJsonBody(req);
    const photo = (serverFixture.db?.post_gallery_images || []).find(g => g.id === body.p_image_id);
    return json(200, photo && serverCoverObjectIsReadable(photo.storage_path, isOwner, req.headers['x-imory-gallery-access'] || '')
      ? [{ storage_path: photo.storage_path, mime_type: photo.mime_type }] : []);
  }

  if (rel === "/__supabase/rest/v1/rpc/get_post_cover_object") {
    const body = await readServerJsonBody(req);
    const db = serverFixture.db;
    const cover = db && db.post_covers.find(
      c => String(c.post_id) === String(body.p_post_id)
    );
    const post = cover && db.posts.find(
      p => String(p.id) === String(cover.post_id)
    );
    const allowed = !!post && (post.visibility === "public" || isOwner);
    return json(200, allowed
      ? [{ storage_path: cover.__path, mime_type: cover.mime_type }]
      : []);
  }

  if (rel === "/__supabase/rest/v1/rpc/get_category_cover_object") {
    const body = await readServerJsonBody(req);
    const db = serverFixture.db;
    const category = db && db.categories.find(
      c => String(c.id) === String(body.p_category_id)
    );
    return json(200, category && category.secret_cover_path
      ? [{ storage_path: category.secret_cover_path, mime_type: null }]
      : []);
  }

  const OBJECT_PREFIX = `/__supabase/storage/v1/object/${POST_COVER_BUCKET}/`;

  if (rel.startsWith(OBJECT_PREFIX)) {
    const key = rel.slice(OBJECT_PREFIX.length);

    /* 정책이 먼저, 파일 존재는 그 다음 — 둘 다 404로 끝난다 */
    if (
      !serverCoverObjectIsReadable(key, isOwner, req.headers['x-imory-gallery-access'] || '') ||
      !(serverFixture.storage && serverFixture.storage.has(key))
    ) {
      return json(400, { statusCode: "404", error: "not_found" });
    }

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": String(PNG_1X1.length)
    });
    return res.end(PNG_1X1);
  }

  return json(404, {});
}


async function handlePostCoverFunction(req, res) {
  const request = new Request(
    `http://localhost:${PORT}${req.url}`,
    {
      method: req.method,
      headers: req.headers
    }
  );

  const response = await postCoverFunction.onRequest({
    request,
    env: {
      SUPABASE_URL: `http://localhost:${PORT}/__supabase`,
      SUPABASE_ANON_KEY: "anon-test-key"
    }
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  res.writeHead(
    response.status,
    Object.fromEntries(response.headers.entries())
  );

  res.end(response.status === 304 ? undefined : buffer);
}


function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);

    /* 실제 Pages Function — 배포와 같은 코드가 판정한다 */
    if (rel === "/api/post-cover") {
      handlePostCoverFunction(req, res).catch((err) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(err && err.message));
      });
      return;
    }

    if (rel.startsWith("/__supabase/")) {
      handleServerSupabase(req, res, rel).catch((err) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(err && err.message));
      });
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

const GALLERY_SKIN = readSkin("imory-gallery-grid-v1.json");

/* category.gallery를 전혀 쓰지 않는 기존 스킨 — list_style이
   gallery여도 전체 목록을 받아야 한다(하위 호환의 핵심). */
const LEGACY_SKIN = readSkin("imory-quiet-frame-v4.json");


/* =========================================================
   DB fixture

   category 1 "PHOTO"  gallery / page_size 12 / secret_cover_mode lock
     root 글 16개(소유자 기준):
       - public 14개 (그중 대표 이미지 있는 글 10개, 없는 글 4개)
       - secret  1개 (대표 이미지 **있음** — 절대 새어나가면 안 된다)
       - private 1개 (방문자에게는 행 자체가 오지 않는다)
     폴더 f1 "묶음" 안에 public 글 2개 → 카드 영역에는 나오지 않는다

     소유자: 16개 → 2페이지(12 + 4)
     방문자: 15개 → 2페이지(12 + 3)

   category 2 "PICKS" gallery / page_size 6 / secret_cover_mode image
     public 2 + secret 1

   category 3 "LOG"   목록(list, 기본) + 폴더 — 회귀 확인용
   category 4 "EMPTY" gallery, 글 없음
========================================================== */

/* 버킷 안 경로. 행에도 응답에도 나오지 않아야 하는 값이다 —
   [secret] 절이 이 문자열을 찾는다. */
const SECRET_COVER_PATH_C1 = `${OWNER_ID}/secret-c1.png`;
const SECRET_COVER_PATH_C2 = `${OWNER_ID}/secret-c2.png`;
const CATEGORY_SECRET_PATH = `${OWNER_ID}/category-secret/picks-lock.png`;

function makeDb(overrides = {}) {

  const post = (id, categoryId, title, createdAt, visibility, folderId, sortOrder) => ({
    id,
    user_id: OWNER_ID,
    category_id: categoryId,
    title,
    content_type: "richtext",
    visibility,
    created_at: createdAt,
    quote_preset_id: null,
    folder_id: folderId,
    sort_order: sortOrder
  });

  const posts = [];

  /* category 1 — 최신이 먼저 오도록 날짜를 내림차순으로 만든다.
     id 501이 가장 최신, 516이 가장 오래됐다. */
  const c1Titles = [];
  for (let i = 0; i < 14; i += 1) {
    const id = 501 + i;
    const day = String(28 - i).padStart(2, "0");
    posts.push(post(id, 1, `사진 ${i + 1}`, `2026-02-${day}T02:00:00Z`, "public", null, 100 * (i + 1)));
    c1Titles.push(`사진 ${i + 1}`);
  }

  /* secret / private은 목록 가운데에 오게 둔다 */
  posts.push(post(520, 1, "비밀 사진", "2026-02-20T09:00:00Z", "secret", null, 2000));
  posts.push(post(521, 1, "비공개 사진", "2026-02-19T09:00:00Z", "private", null, 2100));

  /* 폴더 안 글 — 카드 영역에는 나오지 않아야 한다 */
  posts.push(post(530, 1, "묶음 글 A", "2026-02-10T02:00:00Z", "public", 1, 100));
  posts.push(post(531, 1, "묶음 글 B", "2026-02-09T02:00:00Z", "public", 1, 200));

  /* category 2 */
  posts.push(post(601, 2, "픽 하나", "2026-03-03T02:00:00Z", "public", null, 100));
  posts.push(post(602, 2, "픽 둘", "2026-03-02T02:00:00Z", "public", null, 200));
  posts.push(post(603, 2, "픽 비밀", "2026-03-01T02:00:00Z", "secret", null, 300));

  /* category 3 — 목록 회귀 */
  posts.push(post(701, 3, "로그 하나", "2026-01-05T02:00:00Z", "public", null, 100));
  posts.push(post(702, 3, "로그 폴더 글", "2026-01-04T02:00:00Z", "public", 2, 100));

  /* 대표 이미지 — 사진 10개 + 비밀 글 1개(+ category 2) */
  const post_covers = [];
  for (let i = 0; i < 10; i += 1) {
    const id = 501 + i;
    post_covers.push({
      post_id: id,
      user_id: OWNER_ID,
      /* storage_path는 SELECT GRANT에 없어 화면에는 오지 않는다.
         정리 RPC가 "밀려난 이전 파일"로 돌려줄 때만 쓰이고,
         프록시가 버킷에서 꺼낼 때 쓴다. */
      __path: `${OWNER_ID}/cover-${id}.png`,
      mime_type: "image/png",
      byte_size: 1234
    });
  }
  post_covers.push({
    post_id: 520,
    user_id: OWNER_ID,
    __path: SECRET_COVER_PATH_C1,
    mime_type: "image/png",
    byte_size: 1234
  });
  post_covers.push({
    post_id: 601,
    user_id: OWNER_ID,
    __path: `${OWNER_ID}/cover-601.png`,
    mime_type: "image/png",
    byte_size: 1234
  });
  post_covers.push({
    post_id: 603,
    user_id: OWNER_ID,
    __path: SECRET_COVER_PATH_C2,
    mime_type: "image/png",
    byte_size: 1234
  });

  const categories = [
    {
      id: 1, user_id: OWNER_ID, name: "PHOTO", type: "post", sort_order: 1, slug: "photo",
      list_style: "gallery", page_size: 12,
      secret_cover_mode: "lock", secret_cover_path: null
    },
    {
      id: 2, user_id: OWNER_ID, name: "PICKS", type: "post", sort_order: 2, slug: "picks",
      list_style: "gallery", page_size: 6,
      secret_cover_mode: "image",
      secret_cover_path: CATEGORY_SECRET_PATH
    },
    {
      id: 3, user_id: OWNER_ID, name: "LOG", type: "post", sort_order: 3, slug: "log",
      list_style: "list", page_size: 12,
      secret_cover_mode: "lock", secret_cover_path: null
    },
    {
      id: 4, user_id: OWNER_ID, name: "EMPTY", type: "post", sort_order: 4, slug: "empty",
      list_style: "gallery", page_size: 12,
      secret_cover_mode: "lock", secret_cover_path: null
    }
  ];

  if (overrides.categoryPatch) {
    categories.forEach(row => overrides.categoryPatch(row));
  }

  return {
    profiles: [{
      user_id: OWNER_ID, slug: SLUG, home_mode: "customize",
      nickname: "테스트 사용자", bio: "E2E 테스트 계정"
    }],
    /*
      보호 설정(§13)은 **사이트 단위**라 여기 들어간다 —
      makeDb({ protection: { block_text_copy: true, ... } })
      (core/lib/content-protection.js).
    */
    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "IMORY GALLERY E2E" },
      { user_id: OWNER_ID, key: "favicon_url", value: "" },
      { user_id: OWNER_ID, key: "avatar_url", value: "" },
      ...Object.entries(overrides.protection || {}).map(([key, on]) => ({
        user_id: OWNER_ID,
        key,
        value: on ? "on" : "off"
      }))
    ],
    categories,
    post_folders: [
      { id: 1, user_id: OWNER_ID, category_id: 1, parent_id: null, name: "묶음", depth: 1, sort_order: 100 },
      { id: 2, user_id: OWNER_ID, category_id: 3, parent_id: null, name: "로그 폴더", depth: 1, sort_order: 100 }
    ],
    posts,
    post_covers,
    post_gallery_images: [],
    post_contents: posts.map(p => ({ post_id: p.id, content: `${p.title} 본문입니다.` })),
    banners: [],
    quote_presets: [],
    skins: [{ id: 1, user_id: OWNER_ID, is_active: true }],
    __c1Titles: c1Titles
  };

}


/* =========================================================
   PostgREST mock

   folder-tree e2e의 queryTable을 GALLERY-1이 실제로 쓰는 만큼만
   넓혔다: not.is / offset·limit(= supabase-js .range()) /
   count=exact(Content-Range) / 다중 order 키.
========================================================== */

const RESERVED_PARAMS =
  new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function matchesFilter(row, key, raw) {
  const m = /^(not\.)?(eq|neq|in|gt|gte|lt|lte|is)\.(.*)$/s.exec(raw);
  if (!m) return true;
  const [, negate, op, val] = m;

  const test = () => {
    const cur = row[key];
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
      return list.includes(String(cur));
    }
    if (op === "is") {
      return val === "null"
        ? (cur === null || cur === undefined)
        : String(cur) === val;
    }
    if (op === "eq") return String(cur) === val;
    if (op === "neq") return String(cur) !== val;
    if (op === "gt") return Number(cur) > Number(val);
    if (op === "gte") return Number(cur) >= Number(val);
    if (op === "lt") return Number(cur) < Number(val);
    return Number(cur) <= Number(val);
  };

  return negate ? !test() : test();
}

function queryTable(db, table, params) {
  let rows = (db[table] || []).map(r => ({ ...r }));

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    rows = rows.filter(r => matchesFilter(r, key, raw));
  }

  const order = params.get("order");
  if (order) {
    for (const clause of order.split(",").reverse()) {
      const [col, ...rest] = clause.split(".");
      const desc = rest.includes("desc");
      rows.sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (desc ? -1 : 1)));
    }
  }

  const total = rows.length;

  const offset = params.get("offset") ? Number(params.get("offset")) : 0;
  const limit = params.get("limit") ? Number(params.get("limit")) : null;

  let outOfRange = false;

  if (offset > 0 && offset >= total) {
    outOfRange = true;
  }

  rows = rows.slice(offset, limit === null ? undefined : offset + limit);

  const select = params.get("select");
  if (select && select !== "*") {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    /* 요청하지 않은 컬럼은 응답에 넣지 않는다 — 실제 PostgREST와 같다.
       "비밀글 원본 이미지 주소가 응답에 없다"를 재는 데 중요하다. */
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }

  return { rows, total, offset, outOfRange };
}


/* 컬럼이 실제로 존재하는지 — 42703(GALLERY-1 migration 이전 배포)
   재현용. columnsMissing에 들어 있는 이름을 select에 넣으면 실패한다. */
function selectHasMissingColumn(select, columnsMissing) {
  if (!select || !columnsMissing || !columnsMissing.length) return null;
  const cols = select.split(",").map(s => s.trim());
  return cols.find(c => columnsMissing.includes(c)) || null;
}


async function installSupabaseMock(page, opts = {}) {
  const {
    skin = GALLERY_SKIN,
    db = makeDb(),
    signedInAs = null,
    imageSlotValues = {},
    columnsMissing = [],
    missingTables = [],
    rpcOverrides = {},
    postWriteFails = false,
    recorder = null,

    /* db.post_covers의 __path에서 시작한다 — 실제로 존재하는 파일 집합 */
    storageObjects = new Set(
      [
        ...(opts.db || makeDb()).post_covers.map((c) => c.__path),
        ...(opts.db?.post_gallery_images || []).map(g => g.storage_path),
        ...(opts.db || makeDb()).categories.map((c) => c.secret_cover_path)
      ].filter(Boolean)
    )
  } = opts;

  /* 호출자가 전환 후 상태를 확인할 수 있게 돌려준다 */
  installSupabaseMock.lastStorageObjects = storageObjects;

  /*
    정적 서버(=/api/post-cover를 돌리는 실제 Pages Function)도 같은
    fixture를 봐야 한다 — 브라우저의 page.route mock과 **같은 객체**다.
  */
  serverFixture.db = db;
  serverFixture.storage = storageObjects;

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
      recorder.push({
        method: req.method(),
        path: url.pathname,
        search: url.search,
        body: req.postData() || "",

        /* 업로드 바이트를 문자열로 훑으면 깨진다 — EXIF 확인은
           원본 버퍼로 한다([protect] 절) */
        bodyBuffer:
          typeof req.postDataBuffer === "function"
            ? req.postDataBuffer()
            : null
      });
    }

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    /* ---- Storage ----

       실제 객체 집합(storageObjects)을 들고 있다. 'post-covers'는
       이제 **비공개 버킷**이라 두 가지를 흉내 낸다:

         /object/public/post-covers/...  파일이 있든 없든 404.
                                         (비공개 버킷에는 이 주소가
                                          아예 없다)
         /object/post-covers/...         storage 정책을 그대로 적용 —
                                         글이 지금 public이거나
                                         요청자가 소유자일 때만 200.

       그래서 이 절들에서 200/404는 "파일이 남아 있는가"가 아니라
       "지금 이 요청자가 받아도 되는가"의 문제다. */
    if (url.pathname.startsWith("/storage/v1/object/")) {

      const PUBLIC_PREFIX = "/storage/v1/object/public/" + POST_COVER_BUCKET + "/";

      if (url.pathname.startsWith("/storage/v1/object/public/")) {

        /* 비공개 버킷 — 공개 주소는 존재하지 않는다 */
        return route.fulfill({
          status: 400, headers, contentType: "application/json",
          body: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" })
        });
      }


      const OBJECT_PREFIX = "/storage/v1/object/" + POST_COVER_BUCKET + "/";

      if (req.method() === "GET" && url.pathname.startsWith(OBJECT_PREFIX)) {

        const key = decodeURIComponent(url.pathname.slice(OBJECT_PREFIX.length));

        const cover = db.post_covers.find(c => c.__path === key);
        const post = cover && db.posts.find(p => String(p.id) === String(cover.post_id));

        const readable =
          cover
            ? (!!post && (post.visibility === "public" || signedInAs === OWNER_ID))
            : db.categories.some(c => c.secret_cover_path === key);

        if (!readable || !storageObjects.has(key)) {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" })
          });
        }

        return route.fulfill({
          status: 200,
          headers,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64"
          )
        });
      }

      /* copy: POST /storage/v1/object/copy { bucketId, sourceKey, destinationKey } */
      if (url.pathname === "/storage/v1/object/copy") {
        let payload = {};
        try { payload = JSON.parse(req.postData() || "{}"); } catch { /* noop */ }
        if (payload.sourceKey && !storageObjects.has(payload.sourceKey)) {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" })
          });
        }
        if (payload.destinationKey) storageObjects.add(payload.destinationKey);
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify({ Key: payload.destinationKey || "" })
        });
      }

      /* remove: DELETE /storage/v1/object/<bucket> { prefixes: [...] } */
      if (req.method() === "DELETE") {
        let payload = {};
        try { payload = JSON.parse(req.postData() || "{}"); } catch { /* noop */ }
        (payload.prefixes || []).forEach((key) => storageObjects.delete(key));
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify((payload.prefixes || []).map((k) => ({ name: k })))
        });
      }

      /* upload: POST /storage/v1/object/<bucket>/<path> */
      if (req.method() === "POST") {
        const uploadPrefix = "/storage/v1/object/" + POST_COVER_BUCKET + "/";
        if (url.pathname.startsWith(uploadPrefix)) {
          storageObjects.add(decodeURIComponent(url.pathname.slice(uploadPrefix.length)));
        }
      }

      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({ Key: url.pathname })
      });

    }

    if (url.pathname.startsWith("/auth/v1")) {
      if (signedInAs) {
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify({ user: { id: signedInAs } })
        });
      }
      return route.fulfill({
        status: 401, headers, contentType: "application/json",
        body: JSON.stringify({ message: "no session" })
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);

      if (Object.prototype.hasOwnProperty.call(rpcOverrides, fn)) {
        const result = rpcOverrides[fn](JSON.parse(req.postData() || "{}"), db);
        if (result && result.__error) {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify(result.__error)
          });
        }
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify(result === undefined ? null : result)
        });
      }

      if (fn === "get_published_skin") {
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify({
            skin, schemaVersion: skin.schemaVersion, imageSlotValues
          })
        });
      }

      if (fn === "get_own_post_content") {
        const body = JSON.parse(req.postData() || "{}");
        const row = db.post_contents.find(c => String(c.post_id) === String(body.p_post_id));
        return route.fulfill({
          status: 200, headers,
          contentType: "application/vnd.pgrst.object+json",
          body: JSON.stringify(row ? { content: row.content, ooc_content: "" } : null)
        });
      }

      if (fn === "get_own_gallery_images") {
        const body = JSON.parse(req.postData() || "{}");
        return route.fulfill({ status: 200, headers, contentType: "application/json",
          body: JSON.stringify(db.post_gallery_images.filter(g => g.post_id === Number(body.p_post_id))) });
      }
      if (fn === "get_secret_post_content" || fn === "issue_gallery_read_token") {
        const body = JSON.parse(req.postData() || "{}");
        let result = null;
        if (body.p_password === "secret-pass") {
          if (fn === "get_secret_post_content") result = db.post_contents.find(c => c.post_id === Number(body.p_post_id));
          else {
            result = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
            db.gallery_read_tokens = [{ post_id: Number(body.p_post_id), token: result }];
          }
        }
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(result) });
      }
      if (fn === "save_own_gallery_images") {
        const body = JSON.parse(req.postData() || "{}");
        db.post_gallery_images = db.post_gallery_images.filter(g => g.post_id !== Number(body.p_post_id))
          .concat(body.p_images.map(g => ({ ...g, post_id: Number(body.p_post_id) })));
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: "[]" });
      }
      if (fn === "upsert_own_post_content") {
        const body = JSON.parse(req.postData() || "{}");
        const row = db.post_contents.find(c => c.post_id === Number(body.p_post_id));
        if (row) row.content = body.p_content;
        else db.post_contents.push({ post_id: Number(body.p_post_id), content: body.p_content });
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: "null" });
      }

      if (fn === "upsert_own_post_cover") {
        const body = JSON.parse(req.postData() || "{}");
        const existing = db.post_covers.find(c => String(c.post_id) === String(body.p_post_id));
        const previous = existing ? existing.__path || null : null;
        if (existing) {
          existing.__path = body.p_storage_path;
        } else {
          db.post_covers.push({
            post_id: Number(body.p_post_id),
            user_id: OWNER_ID,
            __path: body.p_storage_path,
            mime_type: body.p_mime_type,
            byte_size: body.p_byte_size
          });
        }
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify(previous)
        });
      }

      if (fn === "get_own_post_cover_paths") {
        const body = JSON.parse(req.postData() || "{}");
        const ids = (body.p_post_ids || []).map(String);
        const rows = db.post_covers
          .filter((c) => ids.includes(String(c.post_id)) && c.__path)
          .map((c) => c.__path);
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify(rows)
        });
      }

      /* rotate_own_post_cover는 철회됐다(2026-09-11) — DB에도 없다.
         혹시 호출되면 실제 PostgREST처럼 실패해야 한다. */
      if (fn === "rotate_own_post_cover") {
        return route.fulfill({
          status: 404, headers, contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST202",
            message: "Could not find the function public.rotate_own_post_cover"
          })
        });
      }

      if (fn === "delete_own_post_cover") {
        const body = JSON.parse(req.postData() || "{}");
        const index = db.post_covers.findIndex(c => String(c.post_id) === String(body.p_post_id));
        const previous = index >= 0 ? (db.post_covers[index].__path || null) : null;
        if (index >= 0) db.post_covers.splice(index, 1);
        return route.fulfill({
          status: 200, headers, contentType: "application/json",
          body: JSON.stringify(previous)
        });
      }

      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify(null)
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);

      if (missingTables.includes(table)) {
        return route.fulfill({
          status: 404, headers, contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST205",
            message: `Could not find the table 'public.${table}' in the schema cache`
          })
        });
      }

      /* 쓰기(글 저장) */
      if (req.method() === "POST" || req.method() === "PATCH") {
        if (postWriteFails) {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify({ code: "42501", message: "write refused (test)" })
          });
        }

        /* PATCH는 실제로 행을 고친다 — 공개 범위 전환처럼 "저장 뒤의
           상태"가 다음 화면에 영향을 주는 검사를 하려면 필요하다.
           (POST는 지금까지처럼 새 id만 돌려준다.) */
        if (req.method() === "PATCH") {
          let patch = {};
          try { patch = JSON.parse(req.postData() || "{}"); } catch { /* noop */ }
          (db[table] || []).forEach((row) => {
            for (const [key, raw] of url.searchParams.entries()) {
              if (RESERVED_PARAMS.has(key)) continue;
              if (!matchesFilter(row, key, raw)) return;
            }
            Object.assign(row, patch);
          });
        }

        const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
        const created = { id: 999 };
        if (req.method() === "POST" && table === "posts") {
          db.posts.push({ ...JSON.parse(req.postData() || "{}"), ...created,
            created_at: new Date().toISOString(), folder_id: null, sort_order: 100 });
        }
        return route.fulfill({
          status: 201, headers,
          contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
          body: JSON.stringify(single ? created : [created])
        });
      }

      /* 삭제 — posts를 실제로 지운다(대표 이미지 정리 검사에 필요) */
      if (req.method() === "DELETE") {
        const remaining = (db[table] || []).filter((row) => {
          for (const [key, raw] of url.searchParams.entries()) {
            if (RESERVED_PARAMS.has(key)) continue;
            if (!matchesFilter(row, key, raw)) return true;
          }
          return false;
        });
        const removedIds = (db[table] || [])
          .filter((row) => !remaining.includes(row))
          .map((row) => String(row.id));
        db[table] = remaining;

        /* posts 삭제는 post_covers로 cascade된다 */
        if (table === "posts") {
          db.post_covers =
            db.post_covers.filter((c) => !removedIds.includes(String(c.post_id)));
        }

        return route.fulfill({
          status: 204, headers, body: ""
        });
      }

      const select = url.searchParams.get("select");
      const missing = selectHasMissingColumn(select, columnsMissing);
      if (missing && table === "categories") {
        return route.fulfill({
          status: 400, headers, contentType: "application/json",
          body: JSON.stringify({
            code: "42703",
            message: `column categories.${missing} does not exist`
          })
        });
      }

      let source = db;

      /* 실제 RLS 흉내 (mock 전체에서 이 두 가지만 흉내 낸다) */
      if (signedInAs !== OWNER_ID) {
        source = {
          ...db,
          posts: db.posts.filter(r => r.visibility !== "private"),
          post_gallery_images: db.post_gallery_images.filter(g => db.posts.some(p => p.id === g.post_id && p.visibility === "public")),
          post_covers: db.post_covers.filter(c => {
            const p = db.posts.find(row => row.id === c.post_id);
            return p && p.visibility === "public";
          })
        };
      }

      const result = queryTable(source, table, url.searchParams);

      const wantsCount =
        (req.headers()["prefer"] || "").includes("count=exact");

      if (result.outOfRange) {
        return route.fulfill({
          status: 416,
          headers: { ...headers, "content-range": `*/${result.total}` },
          contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST103",
            details: `An offset of ${result.offset} was requested, but there are only ${result.total} rows.`,
            message: "Requested range not satisfiable"
          })
        });
      }

      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (single && result.rows.length === 0) {
        return route.fulfill({
          status: 406, headers, contentType: "application/json",
          body: JSON.stringify({ code: "PGRST116", message: "0 rows" })
        });
      }

      const responseHeaders = { ...headers };
      if (wantsCount) {
        const last = Math.max(result.offset, result.offset + result.rows.length - 1);
        responseHeaders["content-range"] =
          `${result.offset}-${last}/${result.total}`;
      }

      return route.fulfill({
        status: wantsCount ? 206 : 200,
        headers: responseHeaders,
        contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
        body: JSON.stringify(single ? result.rows[0] : result.rows)
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
            /* 실제 JWT 모양이어야 core/lib/post-cover-url.js가 쿠키에 넣는다 */
            const session = { user: { id }, access_token: token, expires_at: 4102444800 };
            client.auth.getSession = async () => ({ data: { session }, error: null });
            client.auth.getUser = async () => ({ data: { user: session.user }, error: null });

            /*
              실제 supabase-js의 onAuthStateChange는 저장된 세션이
              없으면 INITIAL_SESSION(null)을 던지고, 그러면 admin이
              showLogin()으로 화면을 도로 감춘다(위 getSession mock과
              엇갈린다). 하네스에서는 같은 세션을 그대로 흘려 준다.
            */
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
  }, { id: userId, token: OWNER_TOKEN });
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


async function openCategory(page, categoryId, { page: pageNumber = 1 } = {}) {
  const query = pageNumber > 1 ? `?page=${pageNumber}` : "";
  await page.goto(
    `http://localhost:${PORT}/${SLUG}/category/${categoryId}${query}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForSelector(PAGE_ROOT, { timeout: 15000 });
}


/* 화면에 실제로 보이는 카드만 읽는다 */
async function readGallery(page) {
  return page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    if (!root) return null;

    const cards = Array.from(root.querySelectorAll(".gg-card"))
      .filter(el => !el.hidden)
      .map(el => {
        const img = el.querySelector(".gg-thumb-img");
        const lock = el.querySelector(".gg-lock");
        return {
          title: (el.querySelector(".gg-card-title")?.textContent || "").trim(),
          href: el.querySelector(".gg-card-link")?.getAttribute("href") || null,
          imgSrc: img && !img.hidden ? img.getAttribute("src") : null,
          hasImg: !!(img && !img.hidden),
          locked: !!(lock && !lock.hidden)
        };
      });

    const pagerNav = root.querySelector(".gg-pager");

    /* 이동 영역 자체가 접혀 있으면 링크가 마크업에 남아 있어도
       화면에는 없는 것이다 — 눈에 보이는 것만 센다. */
    const pagerLinks =
      pagerNav && !pagerNav.hidden
        ? Array.from(pagerNav.querySelectorAll(".gg-pager-num"))
            .map(a => ({
              label: (a.textContent || "").trim(),
              href: a.getAttribute("href")
            }))
        : [];

    const currentSlot = Array.from(root.querySelectorAll(".gg-pager-slot"))
      .find(slot => {
        const dot = slot.querySelector(".gg-pager-dot");
        return dot && !dot.hidden;
      });

    const gallerySection = root.querySelector(".gg-gallery");
    const listSection = root.querySelector(".gg-listing");

    return {
      cards,
      pagerLinks,
      currentPageLabel:
        currentSlot
          ? (currentSlot.querySelector(".gg-pager-num")?.textContent || "").trim()
          : null,
      galleryVisible: !!(gallerySection && !gallerySection.hidden),
      listVisible: !!(listSection && !listSection.hidden),
      listTitles: Array.from(root.querySelectorAll(".gg-listing .gg-list-title"))
        .map(el => (el.textContent || "").trim()),
      emptyVisible: (() => {
        const empty = root.querySelector(".gg-empty");
        return !!(empty && !empty.hidden);
      })(),
      folderNames: Array.from(root.querySelectorAll(".gg-folder-name"))
        .filter(el => !el.closest(".gg-folder-card")?.hidden)
        .map(el => (el.textContent || "").trim()),
      html: root.innerHTML
    };
  }, PAGE_ROOT);
}


async function gridColumnCount(page) {
  return page.evaluate(() => {
    const grid = document.querySelector("#postList .imory-skin-root .gg-grid");
    if (!grid) return 0;
    return getComputedStyle(grid)
      .gridTemplateColumns
      .split(" ")
      .filter(Boolean)
      .length;
  });
}


async function hasHorizontalOverflow(page) {
  return page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1
  );
}


/* =========================================================
   1. published — 공개 갤러리 렌더
========================================================== */

async function runPublished(browser) {
  console.log("\n[published] 공개 갤러리 렌더");

  for (const [label, viewport] of Object.entries(VIEWPORTS)) {

    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    const requests = [];
    await installSupabaseMock(page, { recorder: requests });

    await openCategory(page, 1);

    const view = await readGallery(page);

    check(
      `[${label}] 갤러리 영역이 열리고 목록 영역은 접힌다`,
      view.galleryVisible && !view.listVisible
    );

    check(
      `[${label}] 첫 페이지에 12개 카드`,
      view.cards.length === 12,
      `${view.cards.length}개`
    );

    check(
      `[${label}] 열 수 = ${label.startsWith("mobile") ? 2 : 3}`,
      (await gridColumnCount(page)) === (label.startsWith("mobile") ? 2 : 3)
    );

    check(
      `[${label}] 폴더 안 글은 카드 영역에 없다`,
      !view.cards.some(c => c.title.includes("묶음 글"))
    );

    check(
      `[${label}] 폴더는 폴더 영역에 그대로 보인다`,
      view.folderNames.includes("묶음"),
      view.folderNames.join(", ") || "(없음)"
    );

    check(
      `[${label}] 사진 없는 글도 카드로 남는다(대체 카드)`,
      view.cards.some(c => !c.hasImg)
    );

    check(
      `[${label}] 사진 있는 글은 썸네일을 그린다`,
      view.cards.some(c => c.hasImg && (c.imgSrc || "").startsWith("/api/post-cover?post="))
    );

    check(
      `[${label}] 썸네일은 정사각으로 채워진다(왜곡 없음)`,
      await page.evaluate(() => {
        const img = document.querySelector("#postList .imory-skin-root .gg-thumb-img:not([hidden])");
        if (!img) return false;
        const box = img.closest(".gg-thumb").getBoundingClientRect();
        return (
          getComputedStyle(img).objectFit === "cover" &&
          Math.abs(box.width - box.height) <= 1
        );
      })
    );

    check(
      `[${label}] 목록을 그리는 동안 본문 요청 0건`,
      !requests.some(r =>
        r.path.includes("/rest/v1/post_contents") ||
        r.path.includes("get_own_post_content")
      ),
      requests
        .filter(r => r.path.includes("post_content"))
        .map(r => r.path)
        .join(", ") || "0건"
    );

    if (label.startsWith("mobile")) {
      check(
        `[${label}] 가로 넘침 없음`,
        !(await hasHorizontalOverflow(page))
      );
    }

    await context.close();

  }


  /* 소유자 / 방문자 — 개수와 표시 */

  for (const asOwner of [false, true]) {

    const context = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await context.newPage();

    if (asOwner) await installSignedInUser(page, OWNER_ID);
    await installSupabaseMock(page, { signedInAs: asOwner ? OWNER_ID : null });

    await openCategory(page, 1, { page: 2 });

    const view = await readGallery(page);

    /* 비공개 글은 소유자에게만 오고, 그만큼 소유자의 목록이 한 칸씩
       밀린다 — 1페이지에서 확인한다. */
    await openCategory(page, 1);
    const firstPageView = await readGallery(page);

    /* 소유자: 16개 → 2페이지(12+4) / 방문자: 15개 → 2페이지(12+3) */
    check(
      `[${asOwner ? "owner" : "visitor"}] 2페이지 카드 수`,
      view.cards.length === (asOwner ? 4 : 3),
      `${view.cards.length}개`
    );

    check(
      `[${asOwner ? "owner" : "visitor"}] 비공개 글은 ${asOwner ? "보인다" : "목록에도 개수에도 없다"}`,
      asOwner
        ? firstPageView.cards.some(c => c.title.includes("비공개 사진"))
        : (!view.html.includes("비공개 사진") && !firstPageView.html.includes("비공개 사진"))
    );

    check(
      `[${asOwner ? "owner" : "visitor"}] 페이지는 2개뿐`,
      view.pagerLinks.length === 2,
      view.pagerLinks.map(p => p.label).join(",")
    );

    await context.close();

  }


  /* 빈 카테고리 */

  const context = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
  const page = await context.newPage();
  await installSupabaseMock(page);

  await openCategory(page, 4);

  const emptyView = await readGallery(page);

  check(
    "[empty] 빈 카테고리는 카드 0개 + 빈 안내",
    emptyView.cards.length === 0 && emptyView.emptyVisible
  );

  check(
    "[empty] 페이지 이동 영역은 접힌다",
    emptyView.pagerLinks.length === 0
  );

  await context.close();
}


/* =========================================================
   2. secret — 비밀글 보호
========================================================== */

async function runSecret(browser) {
  console.log("\n[secret] 비밀글 대표 이미지 보호");

  /* 잠금 모드(카테고리 1) — 방문자 */
  {
    const context = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await context.newPage();

    const responses = [];
    const imageRequests = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes(SUPABASE_HOST) && url.includes("/rest/v1/")) {
        try {
          responses.push(await response.text());
        } catch { /* 본문 없음 */ }
      }
    });

    page.on("request", (request) => {
      if (request.resourceType() === "image") {
        imageRequests.push(request.url());
      }
    });

    await installSupabaseMock(page);

    await openCategory(page, 1);

    const view = await readGallery(page);

    const secretCard =
      view.cards.find(c => c.title.includes("비밀 사진"));

    check(
      "[lock] 비밀글도 목록에서 누락되지 않는다",
      !!secretCard
    );

    check(
      "[lock] 비밀글 카드는 잠금 표시를 단다",
      !!secretCard && secretCard.locked
    );

    check(
      "[lock] 잠금 모드에서는 이미지가 없는 대체 카드다",
      !!secretCard && !secretCard.hasImg
    );

    check(
      "[보안] 비밀글의 실제 대표 이미지 주소가 DOM에 없다",
      !view.html.includes("secret-c1.png")
    );

    check(
      "[보안] 비밀글의 실제 대표 이미지 주소가 네트워크 응답에 없다",
      !responses.some(body => body.includes("secret-c1.png")),
      `응답 ${responses.length}건 검사`
    );

    check(
      "[보안] 비밀글의 실제 대표 이미지를 요청하지 않는다",
      !imageRequests.some(url => url.includes("secret-c1.png")),
      `이미지 요청 ${imageRequests.length}건 검사`
    );

    await context.close();
  }


  /* 지정 이미지 모드(카테고리 2) — 방문자 + 소유자 */

  for (const asOwner of [false, true]) {

    const context = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await context.newPage();

    const responses = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes(SUPABASE_HOST) && url.includes("/rest/v1/")) {
        try { responses.push(await response.text()); } catch { /* noop */ }
      }
    });

    if (asOwner) await installSignedInUser(page, OWNER_ID);
    await installSupabaseMock(page, { signedInAs: asOwner ? OWNER_ID : null });

    await openCategory(page, 2);

    const view = await readGallery(page);
    const secretCard = view.cards.find(c => c.title.includes("픽 비밀"));

    check(
      `[image/${asOwner ? "owner" : "visitor"}] 지정 이미지를 대체로 쓴다`,
      !!secretCard &&
      secretCard.hasImg &&
      (secretCard.imgSrc || "") === categoryCoverUrl(2),
      secretCard ? String(secretCard.imgSrc) : "(카드 없음)"
    );

    check(
      `[image/${asOwner ? "owner" : "visitor"}] 지정 이미지에도 잠금 표시는 유지된다`,
      !!secretCard && secretCard.locked
    );

    check(
      `[image/${asOwner ? "owner" : "visitor"}] 실제 대표 이미지는 응답에도 DOM에도 없다`,
      !view.html.includes("secret-c2.png") &&
      !responses.some(body => body.includes("secret-c2.png"))
    );

    await context.close();

  }


  /* 지정 이미지 모드인데 이미지가 없으면 잠금 카드로 되돌아간다 */
  {
    const context = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await context.newPage();

    await installSupabaseMock(page, {
      db: makeDb({
        categoryPatch: (row) => {
          if (row.id === 2) row.secret_cover_path = null;
        }
      })
    });

    await openCategory(page, 2);

    const view = await readGallery(page);
    const secretCard = view.cards.find(c => c.title.includes("픽 비밀"));

    check(
      "[image] 지정 이미지가 비어 있으면 기본 잠금 카드로 되돌아간다",
      !!secretCard && !secretCard.hasImg && secretCard.locked
    );

    await context.close();
  }
}


/* =========================================================
   3. paging — 페이지 이동
========================================================== */

async function runPaging(browser) {
  console.log("\n[paging] 페이지 이동");

  const context = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
  const page = await context.newPage();
  await installSupabaseMock(page);

  await openCategory(page, 1);

  const firstPage = await readGallery(page);

  check(
    "1페이지 주소에는 ?page=가 붙지 않는다",
    !page.url().includes("page="),
    page.url()
  );

  check(
    "현재 페이지 표시가 1이다",
    firstPage.currentPageLabel === "1"
  );

  /* 2페이지 링크 클릭 */
  await page.click("#postList .imory-skin-root .gg-pager-slot:nth-child(2) .gg-pager-num");
  await page.waitForFunction(() => window.location.search.includes("page=2"), null, { timeout: 8000 });
  await page.waitForTimeout(400);

  const secondPage = await readGallery(page);

  check(
    "링크 클릭으로 2페이지 이동 — 주소에 ?page=2",
    page.url().includes("page=2"),
    page.url()
  );

  check(
    "2페이지의 글은 1페이지와 겹치지 않는다",
    secondPage.cards.every(c => !firstPage.cards.some(f => f.href === c.href)) &&
    secondPage.cards.length > 0
  );

  check(
    "2페이지 현재 표시",
    secondPage.currentPageLabel === "2"
  );

  /* 뒤로가기 → 1페이지 */
  await page.goBack();
  await page.waitForTimeout(600);

  const backView = await readGallery(page);

  check(
    "뒤로가기로 1페이지 복귀",
    !page.url().includes("page=") &&
    backView.cards.length === 12,
    `${page.url()} / ${backView.cards.length}개`
  );

  await context.close();


  /* 직접 접속 + 새로고침 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p);

    await openCategory(p, 1, { page: 2 });
    const direct = await readGallery(p);

    check(
      "?page=2 직접 접속 — 2페이지가 열린다",
      direct.currentPageLabel === "2" && direct.cards.length === 3,
      `${direct.cards.length}개`
    );

    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForSelector(PAGE_ROOT);
    await p.waitForTimeout(300);

    const reloaded = await readGallery(p);

    check(
      "새로고침해도 2페이지 유지",
      reloaded.currentPageLabel === "2" && p.url().includes("page=2")
    );

    await ctx.close();
  }


  /* 글에 들어갔다 뒤로 → 보던 페이지로 복귀 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p);

    await openCategory(p, 1, { page: 2 });
    await p.click("#postList .imory-skin-root .gg-card-link");
    await p.waitForFunction(() => window.location.pathname.includes("/post/"), null, { timeout: 8000 });

    await p.goBack();
    await p.waitForTimeout(700);

    const view = await readGallery(p);

    check(
      "글 → 뒤로 = 보던 갤러리 페이지로 복귀",
      p.url().includes("page=2") && view.currentPageLabel === "2",
      p.url()
    );

    await ctx.close();
  }


  /* 범위를 벗어난 페이지 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p);

    await openCategory(p, 1, { page: 99 });
    await p.waitForTimeout(500);

    const view = await readGallery(p);

    check(
      "?page=99 → 마지막 페이지로 맞추고 주소도 정정",
      view.currentPageLabel === "2" && p.url().includes("page=2"),
      `${p.url()} / 현재 ${view.currentPageLabel}`
    );

    await ctx.close();
  }


  /* 페이지당 개수가 바뀌면 유효한 페이지로 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();

    /* PICKS(카테고리 2, page_size 6)에는 3개뿐이라 항상 1페이지다 */
    await installSupabaseMock(p);

    await openCategory(p, 2, { page: 3 });
    await p.waitForTimeout(500);

    check(
      "페이지당 개수가 커서 한 페이지뿐이면 1페이지로 정정",
      !p.url().includes("page="),
      p.url()
    );

    await ctx.close();
  }


  /* 빈 카테고리에 ?page=2 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p);

    await openCategory(p, 4, { page: 2 });
    await p.waitForTimeout(500);

    const view = await readGallery(p);

    check(
      "빈 카테고리의 ?page=2는 빈 1페이지가 된다",
      view.cards.length === 0 && !p.url().includes("page="),
      p.url()
    );

    await ctx.close();
  }
}


/* =========================================================
   4. compat — 기존 스킨 / 기존 카테고리 회귀
========================================================== */

async function runCompat(browser) {
  console.log("\n[compat] 기존 스킨·카테고리 회귀");

  /* (1) 갤러리를 모르는 기존 스킨 — list_style=gallery인 카테고리에서도
         전체 목록을 그대로 받아야 한다. */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p, { skin: LEGACY_SKIN });

    await openCategory(p, 1);

    const titles = await p.evaluate(() =>
      Array.from(document.querySelectorAll("#postList .imory-skin-root a"))
        .map(a => (a.textContent || "").trim())
        .filter(Boolean)
    );

    const postLinks = await p.evaluate(() =>
      Array.from(document.querySelectorAll('#postList .imory-skin-root a[href*="/post/"]')).length
    );

    /* 방문자 기준: 폴더 안 글 2개까지 포함해 전부 17개
       (public 14 + secret 1 + 폴더 2) */
    check(
      "[legacy] 갤러리를 모르는 스킨은 전체 글을 그대로 받는다",
      postLinks === 17,
      `${postLinks}개 링크`
    );

    check(
      "[legacy] 폴더 안 글도 목록에 남아 있다",
      titles.some(t => t.includes("묶음 글 A"))
    );

    check(
      "[legacy] 주소에 ?page=가 생기지 않는다",
      !p.url().includes("page="),
      p.url()
    );

    await ctx.close();
  }


  /* (2) 갤러리를 아는 스킨이라도 목록 카테고리는 지금까지와 같다 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p);

    await openCategory(p, 3);

    const view = await readGallery(p);

    check(
      "[list] 목록 카테고리는 목록 영역을 그린다",
      view.listVisible && !view.galleryVisible
    );

    check(
      "[list] 목록에는 폴더 안 글까지 전부 들어 있다",
      view.listTitles.length === 2,
      view.listTitles.join(", ")
    );

    check(
      "[list] 폴더도 그대로 보인다",
      view.folderNames.includes("로그 폴더")
    );

    await ctx.close();
  }


  /* (3) 폴더 페이지(이어읽기 포함)가 그대로 동작한다 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p);

    await p.goto(
      `http://localhost:${PORT}/${SLUG}/category/3/folder/2`,
      { waitUntil: "domcontentloaded" }
    );
    await p.waitForSelector(PAGE_ROOT, { timeout: 15000 });
    await p.waitForTimeout(400);

    const folderTitles = await p.evaluate(() =>
      Array.from(document.querySelectorAll("#postList .imory-skin-root .gg-list-title"))
        .map(el => (el.textContent || "").trim())
    );

    check(
      "[folder] 폴더 페이지가 그 폴더의 글을 그린다",
      folderTitles.some(t => t.includes("로그 폴더 글")),
      folderTitles.join(", ") || "(없음)"
    );

    await p.goto(
      `http://localhost:${PORT}/${SLUG}/category/3/folder/2?series=1`,
      { waitUntil: "domcontentloaded" }
    );
    await p.waitForSelector(PAGE_ROOT, { timeout: 15000 });
    await p.waitForTimeout(600);

    const seriesBody = await p.evaluate(() => {
      const el = document.querySelector("#postList .imory-skin-root .gg-series .gg-post-body");
      return el ? (el.textContent || "").trim() : "";
    });

    check(
      "[folder] 이어읽기가 본문을 채운다",
      seriesBody.length > 0,
      seriesBody.slice(0, 30)
    );

    await ctx.close();
  }


  /* (4) migration 이전 배포 — 컬럼이 없어도 화면이 죽지 않는다 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSupabaseMock(p, {
      columnsMissing: [
        "list_style", "page_size", "secret_cover_mode", "secret_cover_url"
      ],
      missingTables: ["post_covers"]
    });

    await openCategory(p, 1);

    const view = await readGallery(p);

    check(
      "[pre-migration] 표시 설정 컬럼이 없으면 목록으로 그린다",
      view.listVisible && !view.galleryVisible
    );

    check(
      "[pre-migration] 목록에 글이 그대로 나온다",
      view.listTitles.length > 0,
      `${view.listTitles.length}개`
    );

    await ctx.close();
  }
}


/* =========================================================
   5. cover — 작성/수정 폼의 대표 이미지
========================================================== */

const TEST_IMAGE_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function attachCover(page) {
  await page.setInputFiles("#postEditorCoverFile", {
    name: "cover.png",
    mimeType: "image/png",
    buffer: TEST_IMAGE_BUFFER
  });
  await page.waitForTimeout(200);
}


async function openEditor(page, postId) {
  await page.goto(
    `http://localhost:${PORT}/${SLUG}/post/${postId}?edit=1`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(500);
}


async function runGalleryContent(browser) {
  console.log("\n[gallery2] independent category and photo content");
  for (const failFirst of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 850 } });
    const p = await ctx.newPage();
    await installSignedInUser(p, OWNER_ID);
    const db = makeDb(); db.categories[0].type = 'gallery';
    const requests = []; let attempts = 0;
    await installSupabaseMock(p, { db, signedInAs: OWNER_ID, recorder: requests,
      rpcOverrides: { save_own_gallery_images(body) {
        if (failFirst && attempts++ === 0) return { __error: { message: 'test save failure' } };
        db.post_gallery_images = body.p_images.map(g => ({ ...g, post_id: Number(body.p_post_id) }));
        return [];
      } } });
    await p.goto(`http://localhost:${PORT}/${SLUG}/category/1?write=1`);
    await p.locator('#postEditorGallery').waitFor({ state: 'visible' });
    await p.setInputFiles('#postEditorGalleryFiles', [{ name:'new.png',mimeType:'image/png',buffer:TEST_IMAGE_BUFFER }]);
    await p.click('#postEditorSaveButton');
    if (failFirst) {
      await p.waitForFunction(() => document.getElementById('postEditorMessage')?.textContent.includes('저장하지'));
      check('[gallery2 create failure] uploaded file rolled back', requests.some(r => r.method === 'DELETE' && r.path.includes('/storage/v1/object/post-covers')) && !db.post_gallery_images.length);
      await p.click('#postEditorSaveButton');
    }
    await p.waitForFunction(() => document.getElementById('postEditor').hidden);
    check(`[gallery2 create ${failFirst}] photo-only post saves with no cover`, db.post_gallery_images.length === 1 && db.posts.find(post => post.id === 999)?.title === 'Gallery' && !db.post_covers.some(c => c.post_id === 999));
    check(`[gallery2 create ${failFirst}] same ID on retry`, requests.filter(r => r.method === 'POST' && r.path === '/rest/v1/posts').length === 1);
    await ctx.close();
  }
  for (const [count, primary] of [[1, false], [3, false], [3, true]]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 850 } });
    const p = await ctx.newPage();
    await installSignedInUser(p, OWNER_ID);
    const db = makeDb();
    db.categories[0].type = "gallery";
    const skin = structuredClone(GALLERY_SKIN);
    delete skin.templates.category; // Exercise the new default fallback.
    const requests = [];
    await installSupabaseMock(p, { db, skin, signedInAs: OWNER_ID, recorder: requests });
    await openEditor(p, 501);
    check(`[gallery2 ${count}/${primary}] photo picker replaces cover`,
      await p.locator("#postEditorGallery").isVisible() && !await p.locator(".post-editor-cover-field").isVisible());
    await p.setInputFiles("#postEditorGalleryFiles", Array.from({ length: count }, (_, i) =>
      ({ name: `photo-${i}.png`, mimeType: "image/png", buffer: TEST_IMAGE_BUFFER })));
    if (primary) await p.locator("#postEditorGalleryPhotos > div").last().locator("button").first().click();
    await p.click("#postEditorSaveButton");
    await p.waitForFunction(() => document.getElementById("postEditor").hidden);
    check(`[gallery2 ${count}/${primary}] all photos saved once`, db.post_gallery_images.length === count &&
      requests.filter(r => r.method === "POST" && r.path.includes("/storage/v1/object/post-covers/")).length === count);
    check(`[gallery2 ${count}/${primary}] existing post cover retained`, db.post_covers.find(c => c.post_id === 501).__path.endsWith("cover-501.png"));
    await openCategory(p, 1);
    const images = await p.locator(".imory-default-gallery article").first().locator("img").evaluateAll(nodes => nodes.map(n => n.getAttribute("src")));
    const chosen = db.post_gallery_images[primary ? count - 1 : 0];
    check(`[gallery2 ${count}/${primary}] primary or first photo`, images[0] === `/api/post-cover?image=${chosen.id}`);
    check(`[gallery2 ${count}/${primary}] all photos visible`, images.length === count);
    const response = await p.request.get(`http://localhost:${PORT}/api/post-cover?image=${chosen.id}`);
    check(`[gallery2 ${count}/${primary}] actual image proxy serves bytes`, response.status() === 200);
    for (const width of [320, 375, 390, 1280]) {
      await p.setViewportSize({ width, height: 850 });
      await p.waitForTimeout(100);
      const layout = await p.locator('.gallery-cards').evaluate(grid => ({
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        fits: grid.scrollWidth <= grid.clientWidth + 1 && document.getElementById('postArea').scrollWidth <= innerWidth + 1
      }));
      check(`[gallery2 ${count}/${primary} ${width}] default grid responds without overflow`, layout.fits &&
        (width < 600 ? layout.columns >= 1 && layout.columns <= 2 : layout.columns >= 3), JSON.stringify(layout));
    }
    await openEditor(p, 501);
    check(`[gallery2 ${count}/${primary}] edit reload preserves photos`, await p.locator("#postEditorGalleryPhotos img").count() === count);
    if (primary) {
      db.posts.find(post => post.id === 501).visibility = 'secret';
      const visitor = await browser.newContext({ viewport: { width: 390, height: 850 } });
      const reader = await visitor.newPage();
      await installSupabaseMock(reader, { db, skin });
      await reader.goto(`http://localhost:${PORT}/${SLUG}/post/501`);
      await reader.waitForFunction(() => typeof requestSecretPostContent === 'function');
      const imageUrl = `http://localhost:${PORT}/api/post-cover?image=${chosen.id}`;
      check('[gallery2 secret] locked image returns 404', (await reader.request.get(imageUrl)).status() === 404);
      const unlocked = await reader.evaluate(() => requestSecretPostContent(501, 'secret-pass'));
      check('[gallery2 secret] password gate unlocks image bytes', unlocked.ok && (await reader.request.get(imageUrl)).status() === 200);
      db.posts.find(post => post.id === 501).visibility = 'private';
      check('[gallery2 secret] private transition revokes token access', (await reader.request.get(imageUrl)).status() === 404);
      await visitor.close();
    }
    await ctx.close();
  }
}

async function runContentWidth(browser) {
  console.log("\n[width] shared HTML width contract");
  const html = `<div style="width:1200px;min-width:1100px;padding:20px"><h2>HTML 폭 검증</h2>
    <p>${'https://example.com/' + 'longword'.repeat(80)}</p>
    <img width="1600" height="900" src="data:image/png;base64,${TEST_IMAGE_BUFFER.toString('base64')}">
    <div style="display:grid;grid-template-columns:900px 900px"><div>${'긴단어'.repeat(100)}</div><p>두 번째 열</p></div>
    <table style="width:1200px"><tbody><tr><td style="white-space:nowrap">${'table-data '.repeat(80)}</td><td>끝</td></tr></tbody></table>
    <pre><code>${'const long_code = 123456789; '.repeat(80)}</code></pre>
    <iframe width="1200" height="100" src="about:blank"></iframe></div>`;
  for (const width of [320,375,390,1280]) {
    for (const legacy of [false,true]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const p = await ctx.newPage();
      const db = makeDb();
      db.posts.find(post => post.id === 501).content_type = 'html';
      db.post_contents.find(post => post.post_id === 501).content = html;
      const skin = structuredClone(GALLERY_SKIN);
      if (legacy) delete skin.templates.post;
      await installSupabaseMock(p, { db, skin });
      await p.goto(`http://localhost:${PORT}/${SLUG}/post/501`);
      const selector = legacy ? '#postDetailContent' : '#postArea [data-imory-region="post-body"]';
      await p.locator(selector).waitFor({ state: 'visible' });
      await p.locator(`${selector} pre`).waitFor({ state: 'visible' });
      await p.waitForTimeout(300);
      const measure = await p.locator(selector).evaluate(root => {
        const area = document.getElementById('postArea');
        const rect = root.getBoundingClientRect();
        const pre = root.querySelector('pre'); const table = root.querySelector('table');
        return { width: rect.width, left: rect.left, right: rect.right,
          fits: area.scrollWidth <= area.clientWidth + 1 && root.scrollWidth <= root.clientWidth + 1,
          preScroll: pre.scrollWidth > pre.clientWidth && getComputedStyle(pre).overflowX === 'auto',
          tableScroll: table.scrollWidth > table.clientWidth && getComputedStyle(table).overflowX === 'auto',
          transform: getComputedStyle(root).transform };
      });
      check(`[width ${width} ${legacy?'legacy':'skin'}] content fits viewport`, measure.fits && measure.left >= -1 && measure.right <= width + 1, JSON.stringify(measure));
      check(`[width ${width} ${legacy?'legacy':'skin'}] table/code scroll locally`, measure.preScroll && measure.tableScroll);
      check(`[width ${width} ${legacy?'legacy':'skin'}] body text is not scaled`, measure.transform === 'none');
      if (!legacy) {
        const preview = await ctx.newPage();
        await preview.goto(`http://localhost:${PORT}/studio/preview/preview-frame.html`);
        const previewWidth = await preview.evaluate(async ({ skin, html }) => {
          const { renderSkin } = await import('/skin/skin-render.js');
          const host = document.createElement('main'); document.body.replaceChildren(host);
          renderSkin({ container: host, skin: { ...skin.templates.post, css: skin.templates.post.css || skin.css }, context: {}, mode: 'preview' });
          const root = host.querySelector('[data-imory-region="post-body"]');
          root.classList.add('is-html-content'); root.innerHTML = html;
          await new Promise(resolve => setTimeout(resolve, 150));
          return root.getBoundingClientRect().width;
        }, { skin, html });
        check(`[width ${width}] Studio renderer matches published body width`, Math.abs(previewWidth - measure.width) <= 1, `${previewWidth}/${measure.width}`);
      }
      await ctx.close();
    }
  }
}

async function runContracts(browser) {
  const page = await browser.newPage();
  for (const name of ['skin-render-security-test','skin-post-region-test','skin-generator-test','skin-package-normalize-test','../studio/studio-publish-test']) {
    await page.goto(`http://localhost:${PORT}/skin/${name}.html`);
    await page.waitForFunction(() => /FAIL\s+\d/.test(document.getElementById('summary')?.textContent || ''));
    const summary = await page.locator('#summary').textContent();
    const details = /FAIL\s+0\b/.test(summary) ? summary : summary + ' ' + await page.locator('.fail').allTextContents();
    check(`[contracts] ${name}`, /FAIL\s+0\b/.test(summary), details);
  }
  await page.close();
}

async function runCover(browser) {
  console.log("\n[cover] 글 대표 이미지");

  /* (1) 수정 폼이 기존 대표 이미지를 보여준다 → 교체는 저장 때 올라간다 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSignedInUser(p, OWNER_ID);

    const db = makeDb();
    const requests = [];
    await installSupabaseMock(p, { signedInAs: OWNER_ID, db, recorder: requests });

    await openEditor(p, 501);

    check(
      "[cover] 저장된 대표 이미지가 폼에 보인다",
      await p.evaluate(() => {
        const img = document.getElementById("postEditorCoverPreviewImage");
        return !!img && !img.hidden &&
          (img.getAttribute("src") || "").startsWith("/api/post-cover?post=501");
      })
    );

    const before = requests.length;

    await attachCover(p);

    check(
      "[cover] 파일을 고르기만 해서는 업로드가 일어나지 않는다",
      !requests.slice(before).some(r => r.path.includes("/storage/v1/object/post-covers")),
      requests.slice(before).map(r => r.path).join(", ") || "요청 없음"
    );

    check(
      "[cover] 고른 파일이 미리보기로 보인다",
      await p.evaluate(() => {
        const img = document.getElementById("postEditorCoverPreviewImage");
        return !!img && !img.hidden && (img.getAttribute("src") || "").startsWith("blob:");
      })
    );

    await p.click("#postEditorSaveButton");
    await p.waitForTimeout(1200);

    const uploads = requests.filter(r =>
      r.method === "POST" && r.path.includes("/storage/v1/object/post-covers/")
    );

    const removals = requests.filter(r =>
      r.method === "DELETE" && r.path.includes("/storage/v1/object/post-covers")
    );

    check(
      "[cover] 저장하면 새 경로에 업로드된다",
      uploads.length === 1 &&
      !uploads[0].path.includes("cover-501.png"),
      uploads.map(u => u.path).join(", ") || "없음"
    );

    const upsertIndex =
      requests.findIndex(r => r.path.includes("upsert_own_post_cover"));

    const removeIndex =
      requests.findIndex(r =>
        r.method === "DELETE" && r.path.includes("/storage/v1/object/post-covers")
      );

    check(
      "[cover] 등록이 끝난 뒤에 예전 파일을 지운다",
      upsertIndex >= 0 && removeIndex > upsertIndex && removals.length === 1,
      `업로드 ${uploads.length} / upsert #${upsertIndex} / 삭제 #${removeIndex}`
    );

    check(
      "[cover] 교체 후 대표 이미지가 새 파일을 가리킨다",
      !db.post_covers.find(c => c.post_id === 501).__path.includes("cover-501.png")
    );

    await ctx.close();
  }


  /* (2) 저장 실패 — 기존 값이 보존되고 새로 올린 파일만 정리된다 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSignedInUser(p, OWNER_ID);

    const db = makeDb();
    const requests = [];
    await installSupabaseMock(p, {
      signedInAs: OWNER_ID,
      db,
      recorder: requests,
      postWriteFails: true
    });

    await openEditor(p, 501);
    await attachCover(p);

    await p.click("#postEditorSaveButton");
    await p.waitForTimeout(1200);

    check(
      "[cover] 글 저장이 실패하면 폼에 남는다",
      await p.evaluate(() => {
        const editor = document.getElementById("postEditor");
        return !!editor && !editor.hidden;
      })
    );

    check(
      "[cover] 저장 실패 시 post_covers는 건드리지 않는다",
      !requests.some(r => r.path.includes("upsert_own_post_cover")),
      "upsert 호출 없음"
    );

    check(
      "[cover] 저장 실패 시 기존 대표 이미지는 그대로다",
      db.post_covers.find(c => c.post_id === 501).__path.includes("cover-501.png")
    );

    check(
      "[cover] 저장 실패 시 방금 올린 파일만 지운다(롤백)",
      requests.some(r =>
        r.method === "DELETE" && r.path.includes("/storage/v1/object/post-covers")
      )
    );

    await ctx.close();
  }


  /* (3) 제거 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSignedInUser(p, OWNER_ID);

    const db = makeDb();
    const requests = [];
    await installSupabaseMock(p, { signedInAs: OWNER_ID, db, recorder: requests });

    await openEditor(p, 501);

    await p.click("#postEditorCoverRemove");
    await p.waitForTimeout(200);

    check(
      "[cover] 제거를 누르면 미리보기가 비워진다",
      await p.evaluate(() => {
        const img = document.getElementById("postEditorCoverPreviewImage");
        return !!img && img.hidden;
      })
    );

    check(
      "[cover] 제거만으로는 DB를 건드리지 않는다",
      !requests.some(r => r.path.includes("delete_own_post_cover"))
    );

    await p.click("#postEditorSaveButton");
    await p.waitForTimeout(1200);

    check(
      "[cover] 저장하면 실제로 제거된다",
      requests.some(r => r.path.includes("delete_own_post_cover")) &&
      !db.post_covers.some(c => c.post_id === 501)
    );

    await ctx.close();
  }


  /* (4) 새 글 작성 취소 — 임시 파일이 남지 않는다 */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const p = await ctx.newPage();
    await installSignedInUser(p, OWNER_ID);

    const requests = [];
    await installSupabaseMock(p, { signedInAs: OWNER_ID, recorder: requests });

    await p.goto(
      `http://localhost:${PORT}/${SLUG}/category/1?write=1`,
      { waitUntil: "domcontentloaded" }
    );
    await p.waitForSelector("#postEditor:not([hidden])", { timeout: 15000 });
    await p.waitForTimeout(400);

    check(
      "[cover] 새 글 폼의 COVER는 비어 있다",
      await p.evaluate(() => {
        const img = document.getElementById("postEditorCoverPreviewImage");
        return !!img && img.hidden;
      })
    );

    await attachCover(p);

    p.once("dialog", d => d.accept());

    await p.click("#postEditorCancelButton");
    await p.waitForTimeout(800);

    check(
      "[cover] 작성을 취소하면 Storage에 아무것도 올라가 있지 않다",
      !requests.some(r =>
        r.method === "POST" && r.path.includes("/storage/v1/object/post-covers/")
      )
    );

    await ctx.close();
  }
}


/* =========================================================
   6. access — 대표 이미지 파일 자체의 접근 경계 (GALLERY-1 후속 2차)

   [secret] 절과 **다른 것**을 잰다:

     [secret] 절  — 목록 응답/DOM/이미지 요청에 파일 주소가 없다
     [access] 절  — 화면이 쓰는 주소로 **다시 요청**했을 때 지금도
                    받을 수 있는가

   지금 구조에서 두 번째의 답은 "그 순간의 글 공개 상태와 요청자에
   달렸다"이다. 대표 이미지는 비공개 버킷에 있고, 바이트는
   /api/post-cover 프록시로만 나가며, 그 프록시는 요청마다 DB에
   다시 묻는다(functions/api/post-cover.js).

   이 절이 도는 것은 **실제 Pages Function**이다 — 정적 서버가
   그 파일을 그대로 import해서 돌리고, 그 함수가 부르는 Supabase만
   migration의 SQL과 같은 규칙으로 흉내 낸다(파일 상단 참고).

   ★ 이 절이 확인하는 것

     1. 공개 글 → 비밀글: 같은 주소를 다시 요청하면 방문자에게 404.
        **파일은 하나도 건드리지 않았다**(Storage 객체 집합이 그대로).
        즉 정리에 실패해도 접근은 이미 끊겨 있다.
     2. 같은 순간 소유자는 자기 사진을 그대로 본다(쿠키로 본인 증명).
     3. 다시 공개로 바꾸면 방문자에게 다시 열린다.
     4. 비공개(private) 글도 같다.
     5. 버킷의 공개 주소는 아예 존재하지 않는다(항상 404).
     6. 글을 지우면 접근이 끊기고, 파일 정리도 순서대로 일어난다.
========================================================== */

/* 페이지 안에서 fetch한다 — 쿠키가 실려야 소유자 판정이 된다.
   (page.route는 이 요청을 가로채지 않는다: localhost 정적 서버로
   그대로 나가고, 거기서 실제 함수가 돈다.) */
async function fetchStatusInPage(page, url) {
  return page.evaluate(async (target) => {
    try {
      const res = await fetch(target, { cache: "no-store" });
      return res.status;
    } catch (err) {
      return -1;
    }
  }, url);
}


async function fetchHeadersInPage(page, url) {
  return page.evaluate(async (target) => {
    try {
      const res = await fetch(target, { cache: "no-store" });
      return {
        status: res.status,
        cacheControl: res.headers.get("cache-control"),
        etag: res.headers.get("etag"),
        contentType: res.headers.get("content-type")
      };
    } catch (err) {
      return { status: -1 };
    }
  }, url);
}


async function openEditorAsOwner(browser, db, recorder) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
  const page = await ctx.newPage();
  await installSignedInUser(page, OWNER_ID);
  await installSupabaseMock(page, { signedInAs: OWNER_ID, db, recorder });
  return { ctx, page };
}


/* 방문자(로그인하지 않은 사람)의 페이지. 같은 fixture를 본다. */
async function openVisitorPage(browser, db) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
  const page = await ctx.newPage();
  await installSupabaseMock(page, { db });
  await openCategory(page, 1);
  return { ctx, page };
}


/*
  수정 폼을 열어 공개 범위만 바꾸고 저장한다. 저장하면 폼이 닫히고
  글 읽기로 넘어가므로, 연속 전환은 매번 폼을 다시 연다.

  두 토글은 aria-pressed로 현재 상태를 말한다 — "지금 켜져 있으면
  끈다"로 목표 상태를 맞춘다(posts/posts.html).
*/
async function saveVisibilityAs(page, postId, mode) {
  await openEditor(page, postId);

  const pressed = async (selector) =>
    (await page.getAttribute(selector, "aria-pressed")) === "true";

  const wantSecret = mode === "secret";
  const wantPrivate = mode === "private";

  if (await pressed("#postEditorSecretToggle") !== wantSecret) {
    await page.click("#postEditorSecretToggle");
  }

  if (await pressed("#postEditorPrivateToggle") !== wantPrivate) {
    await page.click("#postEditorPrivateToggle");
  }

  if (wantSecret) {
    await page.fill("#postEditorSecretPassword", "1234");
  }

  await page.click("#postEditorSaveButton");
  await page.waitForTimeout(1200);
}


async function runAccess(browser) {
  console.log("\n[access] 대표 이미지 파일 접근 경계");

  const COVER_PATH_501 = `${OWNER_ID}/cover-501.png`;
  const COVER_URL_501 = coverUrl(501);
  const DIRECT_PUBLIC_URL = `${COVER_BASE}/${COVER_PATH_501}`;

  /* =======================================================
     (1) 공개 → 비밀 → 다시 공개.
         방문자와 소유자를 같은 fixture 위에서 번갈아 확인한다.
  ======================================================== */
  {
    const db = makeDb();
    const requests = [];

    const { ctx: ownerCtx, page: owner } = await openEditorAsOwner(browser, db, requests);

    const { ctx: visitorCtx, page: visitor } = await openVisitorPage(browser, db);

    check(
      "[access] 공개 글일 때 방문자가 대표 이미지를 받는다(전제)",
      (await fetchStatusInPage(visitor, COVER_URL_501)) === 200
    );

    const headers = await fetchHeadersInPage(visitor, COVER_URL_501);

    check(
      "[access] 응답은 재확인 없이 다시 쓰일 수 없다(no-cache + private)",
      String(headers.cacheControl || "").includes("no-cache") &&
      String(headers.cacheControl || "").includes("private"),
      String(headers.cacheControl)
    );

    check(
      "[access] 재확인이 싸게 끝나도록 ETag를 준다",
      typeof headers.etag === "string" && headers.etag.length > 2,
      String(headers.etag)
    );

    const storageBefore = new Set(installSupabaseMock.lastStorageObjects);

    /* ---- 비밀글로 전환 ---- */
    await saveVisibilityAs(owner, 501, "secret");

    check(
      "[access] 전환은 파일을 옮기거나 지우지 않는다",
      requests.every(r =>
        !(r.method === "DELETE" && r.path.includes("/storage/v1/object/post-covers")) &&
        r.path !== "/storage/v1/object/copy"
      ),
      requests.filter(r => r.path.includes("/storage/")).map(r => `${r.method} ${r.path}`).join(" | ") || "storage 요청 없음"
    );

    check(
      "[access] 파일은 그대로 남아 있다(정리 실패와 같은 상태)",
      db.post_covers.find(c => c.post_id === 501).__path === COVER_PATH_501 &&
      installSupabaseMock.lastStorageObjects.has(COVER_PATH_501) &&
      storageBefore.size === installSupabaseMock.lastStorageObjects.size
    );

    /* ★ 이 절의 핵심 */
    const visitorAfter = await fetchStatusInPage(visitor, COVER_URL_501);

    check(
      "[access] ★ 전환 뒤 방문자가 같은 주소로 다시 요청하면 열리지 않는다",
      visitorAfter === 404,
      `status=${visitorAfter}`
    );

    check(
      "[access] ★ 파일이 남아 있는데도 막힌다 — 정리 실패는 접근과 무관하다",
      installSupabaseMock.lastStorageObjects.has(COVER_PATH_501) && visitorAfter === 404
    );

    const ownerAfter = await fetchStatusInPage(owner, COVER_URL_501);

    check(
      "[access] ★ 같은 순간 소유자는 자기 사진을 그대로 본다",
      ownerAfter === 200,
      `status=${ownerAfter}`
    );

    /* ---- 다시 공개로 ---- */
    await saveVisibilityAs(owner, 501, "public");

    const visitorBack = await fetchStatusInPage(visitor, COVER_URL_501);

    check(
      "[access] ★ 다시 공개로 바꾸면 방문자에게 다시 열린다",
      visitorBack === 200,
      `status=${visitorBack}`
    );

    await visitorCtx.close();
    await ownerCtx.close();
  }


  /* =======================================================
     (2) 비공개(private) 글도 같다
  ======================================================== */
  {
    const db = makeDb();
    const { ctx: ownerCtx, page: owner } = await openEditorAsOwner(browser, db, []);

    const { ctx: visitorCtx, page: visitor } = await openVisitorPage(browser, db);

    await saveVisibilityAs(owner, 501, "private");

    const visitorStatus = await fetchStatusInPage(visitor, COVER_URL_501);
    const ownerStatus = await fetchStatusInPage(owner, COVER_URL_501);

    check(
      "[access] 비공개 글: 방문자는 못 받는다",
      visitorStatus === 404,
      `status=${visitorStatus}`
    );

    check(
      "[access] 비공개 글: 소유자는 받는다",
      ownerStatus === 200,
      `status=${ownerStatus}`
    );

    /*
      fetch가 아니라 **실제 <img>**로도 확인한다 — 소유자 증명이
      쿠키에 실려야 하고, <img>는 헤더를 실을 수 없기 때문이다.
      갤러리를 다시 열어 그 카드의 그림이 실제로 그려졌는지 본다.
    */

    await openCategory(owner, 1);
    await owner.waitForTimeout(1200);

    const drawn = await owner.evaluate(() => {
      const img = Array.from(document.querySelectorAll("#postList .gg-thumb-img"))
        .find(el => (el.getAttribute("src") || "").includes("post=501"));
      if (!img) return { found: false };
      return {
        found: true,
        complete: img.complete,
        width: img.naturalWidth
      };
    });

    check(
      "[access] ★ 소유자의 <img>도 실제로 그려진다(쿠키로 본인 증명)",
      drawn.found && drawn.complete && drawn.width > 0,
      JSON.stringify(drawn)
    );

    await visitorCtx.close();
    await ownerCtx.close();
  }


  /* =======================================================
     (3) 버킷의 공개 주소는 존재하지 않는다
  ======================================================== */
  {
    const db = makeDb();
    const { ctx, page } = await openVisitorPage(browser, db);

    const publicStatus = await fetchStatusInPage(page, DIRECT_PUBLIC_URL);

    check(
      "[access] 공개 글이어도 버킷의 /object/public/ 주소는 열리지 않는다",
      publicStatus !== 200,
      `status=${publicStatus}`
    );

    const view = await readGallery(page);

    check(
      "[access] 화면 어디에도 버킷 주소가 없다",
      !view.html.includes("/storage/v1/object/") &&
      !view.html.includes(COVER_PATH_501)
    );

    /* 없는 글 / 잘못된 질의 */
    check(
      "[access] 없는 글의 대표 이미지는 404다",
      (await fetchStatusInPage(page, coverUrl(99999))) === 404
    );

    check(
      "[access] post도 category도 없는 요청은 400이다",
      (await fetchStatusInPage(page, "/api/post-cover")) === 400
    );

    await ctx.close();
  }


  /* =======================================================
     (4) 카테고리 지정 이미지는 대체 이미지라 누구에게나 열린다
  ======================================================== */
  {
    const db = makeDb();
    const { ctx, page } = await openVisitorPage(browser, db);

    check(
      "[access] 카테고리 지정 이미지는 방문자도 받는다(대체 이미지)",
      (await fetchStatusInPage(page, categoryCoverUrl(2))) === 200
    );

    check(
      "[access] 지정 이미지가 없는 카테고리는 404다",
      (await fetchStatusInPage(page, categoryCoverUrl(1))) === 404
    );

    await ctx.close();
  }


  /* =======================================================
     (5) 글 삭제 — 접근이 끊기고, 파일 정리도 순서대로
  ======================================================== */
  {
    const db = makeDb();
    const requests = [];
    const { ctx, page } = await openEditorAsOwner(browser, db, requests);

    await openEditor(page, 501);

    page.once("dialog", d => d.accept());
    await page.click("#postEditorDeleteButton");
    await page.waitForTimeout(1500);

    check(
      "[access] 삭제는 지우기 전에 경로를 받고, 지운 뒤에 파일을 지운다",
      (() => {
        const pathsAt = requests.findIndex(r => r.path.includes("get_own_post_cover_paths"));
        const deleteAt = requests.findIndex(
          r => r.method === "DELETE" && r.path.includes("/rest/v1/posts")
        );
        const removeAt = requests.findIndex(
          r => r.method === "DELETE" && r.path.includes("/storage/v1/object/post-covers")
        );
        return pathsAt >= 0 && deleteAt > pathsAt && removeAt > deleteAt;
      })(),
      requests
        .filter(r => r.path.includes("post_cover") || r.method === "DELETE")
        .map(r => `${r.method} ${r.path}`)
        .join(" | ")
    );

    const statusAfterDelete = await fetchStatusInPage(page, COVER_URL_501);

    check(
      "[access] 글을 지우면 소유자에게도 더 이상 열리지 않는다",
      statusAfterDelete === 404,
      `status=${statusAfterDelete}`
    );

    await ctx.close();
  }


  /* =======================================================
     (6) 회전 RPC는 사라졌다 — 저장 경로가 부르지 않는다
  ======================================================== */
  {
    const db = makeDb();
    const requests = [];
    const { ctx, page } = await openEditorAsOwner(browser, db, requests);

    await saveVisibilityAs(page, 501, "secret");

    check(
      "[access] 공개 범위를 바꿔도 회전 RPC를 부르지 않는다(철회됨)",
      !requests.some(r => r.path.includes("rotate_own_post_cover"))
    );

    await ctx.close();
  }
}

/* =========================================================
   8. protect — 블로그 보호 설정 (EXIF 제거 · 우클릭 · 복사)

   기준 문서: IMORY_GALLERY1_DESIGN.md §13

   **사이트 단위** 설정이다(Settings > HOME > ETC). 값은
   site_settings의 key/value에 들어가고, 공개 화면에서는
   home/site-meta.js가 한 번 건다(core/lib/content-protection.js).

   세 가지를 각각 다른 층에서 잰다:

     화면      방문자에게는 우클릭/복사가 막히고 **주인장에게는
               막히지 않는가**. 카테고리·글 화면 모두.
     업로드    EXIF가 든 JPEG를 올리면 Storage로 나가는 바이트에
               EXIF가 없는가(꺼져 있으면 그대로 간다)
     설정 UI   Settings > HOME > ETC의 체크박스와 저장 payload

   가운데 것만 되돌릴 수 없는 처리다 — 앞의 것은 브라우저 기본
   동작을 막는 것이라 개발자 도구·소스 보기 앞에 무력하다는 사실을
   문서와 화면 안내에 그대로 적어 두었다.
========================================================== */

/*
  EXIF(APP1)를 실제로 담은 1x1 JPEG. canvas 재인코딩이 이 블록을
  통째로 버리는지 확인하는 데 쓴다.

  구조: SOI 다음에 APP1을 끼워 넣는다
    FFE1 <len> "Exif\0\0" <TIFF: II 2A00 0800.. IFD0 1개 항목>
  IFD0의 ImageDescription(0x010E)에 아래 마커 문자열을 넣는다.
*/

const EXIF_MARKER = "IMORY-EXIF-MARKER";

function buildJpegWithExif() {

  const base = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
    "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  );

  const description = Buffer.from(`${EXIF_MARKER}\0`, "latin1");   /* 18 bytes */

  const tiff = Buffer.alloc(26 + description.length);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(0x002A, 2);
  tiff.writeUInt32LE(8, 4);          /* IFD0 offset */
  tiff.writeUInt16LE(1, 8);          /* 항목 1개 */
  tiff.writeUInt16LE(0x010E, 10);    /* ImageDescription */
  tiff.writeUInt16LE(2, 12);         /* ASCII */
  tiff.writeUInt32LE(description.length, 14);
  tiff.writeUInt32LE(26, 18);        /* 값 offset */
  tiff.writeUInt32LE(0, 22);         /* 다음 IFD 없음 */
  description.copy(tiff, 26);

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);

  const app1 = Buffer.alloc(4 + payload.length);
  app1.writeUInt16BE(0xFFE1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);

  /* SOI(2바이트) 바로 뒤에 끼운다 */
  return Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)]);

}

const JPEG_WITH_EXIF = buildJpegWithExif();


async function attachCoverJpeg(page) {
  await page.setInputFiles("#postEditorCoverFile", {
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: JPEG_WITH_EXIF
  });
  await page.waitForTimeout(300);
}


function uploadedCoverBody(requests) {
  const upload = requests.find(r =>
    r.method === "POST" && r.path.includes("/storage/v1/object/post-covers/")
  );
  return upload ? (upload.bodyBuffer || Buffer.alloc(0)) : null;
}


/* 화면에서 이벤트를 실제로 발생시켜 기본 동작이 막혔는지 본다.
   (막는 쪽이 capture 단계의 preventDefault이므로 defaultPrevented로
   드러난다 — core/lib/content-protection.js) */
async function measureProtection(page) {
  return page.evaluate(() => {
    const target =
      document.querySelector("#postList") ||
      document.body;

    const fire = (type) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };

    return {
      contextMenuBlocked: fire("contextmenu"),
      copyBlocked: fire("copy"),
      userSelect: getComputedStyle(document.body).userSelect,
      bodyClass: document.body.classList.contains("imory-no-copy")
    };
  });
}


async function runProtect(browser) {
  console.log("\n[protect] 블로그 보호 설정");

  const protectedDb = () =>
    makeDb({
      protection: {
        block_context_menu: true,
        block_text_copy: true,
        strip_image_exif: true
      }
    });


  /* =======================================================
     (1) 방문자 — 막힌다 (목록 화면 / 글 화면)
  ======================================================== */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await ctx.newPage();

    await installSupabaseMock(page, { db: protectedDb() });
    await openCategory(page, 1);
    await page.waitForTimeout(700);

    const state = await measureProtection(page);

    check(
      "[protect] 방문자: 우클릭이 막힌다",
      state.contextMenuBlocked
    );

    check(
      "[protect] 방문자: 복사가 막힌다",
      state.copyBlocked
    );

    check(
      "[protect] 방문자: 본문 선택이 막힌다(user-select:none)",
      state.bodyClass && state.userSelect === "none",
      `${state.userSelect} / class=${state.bodyClass}`
    );

    /* 글 화면 — 카테고리가 아니라 사이트 단위라 그대로 유지된다 */
    await page.goto(
      `http://localhost:${PORT}/${SLUG}/post/501`,
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForTimeout(1200);

    const onPost = await measureProtection(page);

    check(
      "[protect] 글 화면에서도 막힌다(사이트 단위)",
      onPost.contextMenuBlocked && onPost.copyBlocked
    );

    await ctx.close();
  }


  /* =======================================================
     (2) 주인장 — 막히지 않는다
  ======================================================== */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await ctx.newPage();

    await installSignedInUser(page, OWNER_ID);
    await installSupabaseMock(page, { signedInAs: OWNER_ID, db: protectedDb() });
    await openCategory(page, 1);
    await page.waitForTimeout(1200);

    const state = await measureProtection(page);

    check(
      "[protect] ★ 주인장: 우클릭이 막히지 않는다",
      !state.contextMenuBlocked
    );

    check(
      "[protect] ★ 주인장: 복사가 막히지 않는다",
      !state.copyBlocked && !state.bodyClass
    );

    await ctx.close();
  }


  /* =======================================================
     (3) 설정이 없는 블로그 — 전부 꺼진 상태 그대로
  ======================================================== */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await ctx.newPage();

    await installSupabaseMock(page);

    await openCategory(page, 1);
    await page.waitForTimeout(700);

    const view = await readGallery(page);
    const state = await measureProtection(page);

    check(
      "[protect] 설정이 없으면 갤러리는 그대로 그려진다",
      view.cards.length === 12
    );

    check(
      "[protect] 설정이 없으면 보호는 전부 꺼진 상태다",
      !state.contextMenuBlocked && !state.copyBlocked
    );

    await ctx.close();
  }


  /* =======================================================
     (4) EXIF 제거 — 켜짐 / 꺼짐
  ======================================================== */
  {
    check(
      "[protect] 준비한 JPEG에 EXIF가 실제로 들어 있다(전제)",
      JPEG_WITH_EXIF.includes(Buffer.from("Exif")) &&
      JPEG_WITH_EXIF.includes(Buffer.from(EXIF_MARKER))
    );
  }

  for (const stripOn of [true, false]) {

    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await ctx.newPage();

    const db = makeDb({
      protection: {
        strip_image_exif: stripOn
      }
    });

    const requests = [];

    await installSignedInUser(page, OWNER_ID);
    await installSupabaseMock(page, { signedInAs: OWNER_ID, db, recorder: requests });

    await openEditor(page, 501);
    await attachCoverJpeg(page);

    await page.click("#postEditorSaveButton");
    await page.waitForTimeout(1500);

    const body = uploadedCoverBody(requests);

    check(
      `[protect] (${stripOn ? "켜짐" : "꺼짐"}) 사진이 올라간다`,
      !!body && body.length > 0,
      body ? `${body.length} bytes` : "업로드 없음"
    );

    if (stripOn) {

      check(
        "[protect] ★ EXIF 제거: 올라간 바이트에 EXIF가 없다",
        !!body &&
        !body.includes(Buffer.from("Exif")) &&
        !body.includes(Buffer.from(EXIF_MARKER))
      );

      check(
        "[protect] EXIF 제거: 그래도 등록은 정상이다",
        requests.some(r => r.path.includes("upsert_own_post_cover")) &&
        db.post_covers.find(c => c.post_id === 501).__path.endsWith(".jpg")
      );

    }

    else {

      check(
        "[protect] 꺼져 있으면 원본 그대로 올라간다(EXIF 포함)",
        !!body && body.includes(Buffer.from(EXIF_MARKER))
      );

    }

    await ctx.close();

  }


  /* =======================================================
     (5) Settings > HOME > ETC — 체크박스와 저장 payload
  ======================================================== */
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
    const page = await ctx.newPage();

    const db = makeDb();
    const requests = [];

    await installSignedInUser(page, OWNER_ID);
    await installSupabaseMock(page, { signedInAs: OWNER_ID, db, recorder: requests });

    await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: "domcontentloaded" });

    await page.waitForSelector("#openSettingsButton", { state: "visible", timeout: 20000 });

    await page.click("#openSettingsButton");
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll(".settings-tab"))
        .find(el => (el.textContent || "").trim() === "HOME");
      if (tab) tab.click();
    });
    await page.waitForTimeout(600);

    const etc = await page.evaluate(() => {
      const panel = document.getElementById("etcSettingsPanel");
      if (!panel) return null;
      const homePanel = document.getElementById("homeSettingsPanel");
      return {
        insideHome: !!(homePanel && homePanel.contains(panel)),
        visible: !panel.hidden && !!panel.offsetParent,
        titles: Array.from(panel.querySelectorAll(".etc-option-title"))
          .map(el => (el.textContent || "").trim()),
        /* HOME 탭의 마지막 그룹인가 */
        isLast: homePanel
          ? homePanel.querySelector(".settings-group:last-of-type") === panel
          : false
      };
    });

    check(
      "[protect] Settings > HOME > ETC가 맨 아래에 있다",
      !!etc && etc.insideHome && etc.visible && etc.isLast,
      etc ? JSON.stringify(etc) : "(패널 없음)"
    );

    check(
      "[protect] 보호 옵션 3개가 있다",
      !!etc &&
      etc.titles.join(",") === "이미지 EXIF 제거,우클릭 방지,텍스트 복사 방지",
      etc ? etc.titles.join(",") : "(없음)"
    );

    await page.evaluate(() => {
      ["stripImageExifToggle", "blockContextMenuToggle", "blockTextCopyToggle"]
        .forEach((id) => {
          const box = document.getElementById(id);
          if (box && !box.checked) box.click();
        });
    });

    const before = requests.length;

    await page.click("#etcSaveButton");
    await page.waitForTimeout(1200);

    const saved = requests
      .slice(before)
      .filter(r => r.method === "POST" && r.path.includes("/rest/v1/site_settings"))
      .map(r => { try { return JSON.parse(r.body || "[]"); } catch { return []; } })
      .flat();

    check(
      "[protect] 저장이 세 값을 한 번에 보낸다",
      saved.length === 3 &&
      saved.every(row => row.value === "on") &&
      ["strip_image_exif", "block_context_menu", "block_text_copy"]
        .every(key => saved.some(row => row.key === key)),
      JSON.stringify(saved)
    );

    await ctx.close();
  }
}


/* =========================================================
   6. preview — Studio Preview 일치
========================================================== */

/*
  Studio scenario harness가 쓰는 in-memory 테이블 shape으로 옮긴다 —
  published 검증과 **같은 행**을 쓰기 위해서다(scenario t와 같은 패턴).
  scenario mock에는 RLS가 없으므로 소유자 화면과 같아진다 → 아래에서
  published 쪽도 소유자로 재어 비교한다.
*/

function makeScenarioGalleryTables(db) {

  const toScenarioUser = (value) =>
    value === OWNER_ID ? "user-g" : value;

  const c1Posts =
    db.posts
      .filter(p => p.category_id === 1)
      .map(p => ({
        ...p,
        id: String(p.id),
        user_id: toScenarioUser(p.user_id),
        category_id: String(p.category_id),
        folder_id: p.folder_id === null ? null : String(p.folder_id)
      }));

  return {
    profiles: [{
      user_id: "user-g",
      nickname: "테스트 사용자",
      bio: "E2E 테스트 계정",
      slug: "scenario-g"
    }],
    site_settings: [
      { user_id: "user-g", key: "blog_title", value: "IMORY GALLERY E2E" }
    ],
    categories: db.categories.map(c => ({
      ...c,
      id: String(c.id),
      user_id: "user-g"
    })),
    post_folders: db.post_folders.map(f => ({
      ...f,
      id: String(f.id),
      user_id: "user-g",
      category_id: String(f.category_id),
      parent_id: f.parent_id === null ? null : String(f.parent_id)
    })),
    posts: c1Posts,
    post_covers: db.post_covers.map(c => ({
      ...c,
      post_id: String(c.post_id),
      user_id: "user-g"
    })),
    post_contents: db.post_contents.map(c => ({
      ...c,
      post_id: String(c.post_id)
    })),
    banners: []
  };

}


async function runPreview(browser) {
  console.log("\n[preview] Studio Preview 일치");

  const db = makeDb();

  /* 공개 화면(소유자)의 카드 구조를 먼저 재어 둔다 — scenario mock에는
     RLS가 없으므로 비교 대상은 소유자 화면이다. */
  const ctxPublic = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
  const pagePublic = await ctxPublic.newPage();
  await installSignedInUser(pagePublic, OWNER_ID);
  await installSupabaseMock(pagePublic, { signedInAs: OWNER_ID, db });
  await openCategory(pagePublic, 1);

  const publicView = await readGallery(pagePublic);
  await ctxPublic.close();

  const ctx = await browser.newContext({ viewport: VIEWPORTS["desktop-1280"] });
  const page = await ctx.newPage();

  await page.addInitScript(
    ({ skin, tables }) => {
      window.__scenarioGallerySkinPackage = skin;
      window.__scenarioGalleryTables = tables;
    },
    {
      skin: GALLERY_SKIN,
      tables: makeScenarioGalleryTables(db)
    }
  );

  await page.goto(
    `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=g`,
    { waitUntil: "domcontentloaded" }
  );

  await page.waitForTimeout(2500);

  /* Preview 안에서 PHOTO 카테고리로 이동 */
  const frame = page.frames().find(f => f.url().includes("preview-frame.html"));

  if (!frame) {
    check("[preview] preview iframe 없음", false);
    await ctx.close();
    return;
  }

  await frame.waitForSelector(".imory-skin-root", { timeout: 15000 });

  await frame.evaluate(() => {
    const link = Array.from(document.querySelectorAll(".gg-nav-item"))
      .find(a => (a.textContent || "").trim() === "PHOTO");
    if (link) link.click();
  });

  await page.waitForTimeout(1800);

  const previewCards = await frame.evaluate(() =>
    Array.from(document.querySelectorAll(".gg-card"))
      .filter(el => !el.hidden)
      .map(el => ({
        title: (el.querySelector(".gg-card-title")?.textContent || "").trim(),
        hasImg: (() => {
          const img = el.querySelector(".gg-thumb-img");
          return !!(img && !img.hidden);
        })()
      }))
  );

  check(
    "[preview] Preview도 갤러리 카드를 같은 개수로 그린다",
    previewCards.length === publicView.cards.length,
    `preview ${previewCards.length} / public ${publicView.cards.length}`
  );

  check(
    "[preview] 카드 제목 순서가 공개 화면과 같다",
    previewCards.map(c => c.title).join("|") ===
    publicView.cards.map(c => c.title).join("|")
  );

  check(
    "[preview] 사진 있음/없음 패턴이 공개 화면과 같다",
    previewCards.map(c => (c.hasImg ? "1" : "0")).join("") ===
    publicView.cards.map(c => (c.hasImg ? "1" : "0")).join("")
  );

  /* Preview 안에서 2페이지로 이동 */
  await frame.evaluate(() => {
    const slots = Array.from(document.querySelectorAll(".gg-pager-slot"));
    const second = slots[1]?.querySelector(".gg-pager-num");
    if (second) second.click();
  });

  await page.waitForTimeout(1800);

  const previewPage2 = await frame.evaluate(() =>
    Array.from(document.querySelectorAll(".gg-card")).filter(el => !el.hidden).length
  );

  check(
    "[preview] Preview 안에서도 페이지 이동이 동작한다",
    previewPage2 > 0 && previewPage2 < 12,
    `${previewPage2}개`
  );

  await ctx.close();
}


/* =========================================================
   shots — 화면 캡처 (검사 아님)

   기본 실행에는 포함되지 않는다. `--only=shots`로만 돈다.
     node skin/skin-gallery-e2e-test.mjs --only=shots --out=<디렉터리>
========================================================== */

async function runShots(browser) {

  const outDir = argOf("out", path.join(ROOT, "..", "gallery-shots"));

  fs.mkdirSync(outDir, { recursive: true });

  console.log("\n[shots] " + outDir);

  const shot = async (name, page, clip) => {
    const file = path.join(outDir, name + ".png");
    await page.screenshot(clip ? { path: file, clip } : { path: file, fullPage: false });
    console.log("  saved  " + name + ".png");
  };

  /* 1. 갤러리 데스크톱 / 모바일 */
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await installSupabaseMock(page);
    await openCategory(page, 1);
    await page.waitForTimeout(600);
    await shot("gallery-" + label, page);
    await ctx.close();
  }

  /* 2. 잠금/지정 이미지 카드 */
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS["desktop-1280"], deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    await installSupabaseMock(page);
    await openCategory(page, 2);
    await page.waitForTimeout(600);
    await shot("gallery-secret-image", page);
    await ctx.close();
  }

  /* 3. 빈 카테고리 */
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS["desktop-1280"], deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    await installSupabaseMock(page);
    await openCategory(page, 4);
    await page.waitForTimeout(600);
    await shot("gallery-empty", page);
    await ctx.close();
  }

  /* 4. 2페이지 + 페이지 이동 */
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS["desktop-1280"], deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    await installSupabaseMock(page);
    await openCategory(page, 1, { page: 2 });
    await page.waitForTimeout(600);
    await shot("gallery-page-2", page);
    await ctx.close();
  }

  /* 5. 목록 표시(같은 스킨, 같은 데이터) */
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS["desktop-1280"], deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    await installSupabaseMock(page);
    await openCategory(page, 3);
    await page.waitForTimeout(600);
    await shot("category-list-mode", page);
    await ctx.close();
  }

  /* 6. 작성/수정 폼의 COVER 칸 */
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS["desktop-1280"], deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    await installSignedInUser(page, OWNER_ID);
    await installSupabaseMock(page, { signedInAs: OWNER_ID });
    await openEditor(page, 501);
    const box = await page.evaluate(() => {
      const el = document.querySelector(".post-editor-cover-field");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 24), width: r.width + 32, height: r.height + 48 };
    });
    await shot("post-editor-cover", page, box || undefined);
    await ctx.close();
  }

  /* 7. Settings의 카테고리 표시 설정 줄 */
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS["desktop-1280"], deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    await installSignedInUser(page, OWNER_ID);
    await installSupabaseMock(page, { signedInAs: OWNER_ID });

    await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    /* 관리 메뉴는 접혀 있다 — SETTINGS 패널을 열고 CATEGORY 탭으로 간다 */
    await page.click("#openSettingsButton");
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll(".settings-tab"))
        .find(el => (el.textContent || "").trim() === "CATEGORY");
      if (tab) tab.click();
    });
    await page.waitForTimeout(900);

    await page.evaluate(() => {
      const list = document.getElementById("categoryList");
      if (list) list.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(400);

    const rect = await page.evaluate(() => {
      const el = document.getElementById("categoryList");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

    if (rect && rect.height > 40) {
      await shot("settings-category-display", page, {
        x: Math.max(0, rect.x - 20),
        y: Math.max(0, rect.y - 44),
        width: Math.min(rect.width + 40, 1240),
        height: Math.min(rect.height + 64, 860)
      });
    } else {
      /* 패널 애니메이션/레이아웃 때문에 자를 수 없으면 화면 전체를 찍는다 */
      await shot("settings-category-display", page);
    }

    await ctx.close();
  }

  console.log("  (검사 아님 — PASS/FAIL 없음)");

}


/* =========================================================
   MAIN
========================================================== */

(async () => {

  const server = await startServer();
  console.log(`정적 서버: http://localhost:${PORT}`);

  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch({ headless: !DEBUG });

  try {

    if (ONLY === "shots") {
      await runShots(browser);
    } else {

    if (shouldRun("gallery2")) await runGalleryContent(browser);
    if (shouldRun("contracts")) await runContracts(browser);
    if (shouldRun("width")) await runContentWidth(browser);
    if (shouldRun("published")) await runPublished(browser);
    if (shouldRun("secret")) await runSecret(browser);
    if (shouldRun("paging")) await runPaging(browser);
    if (shouldRun("compat")) await runCompat(browser);
    if (shouldRun("cover")) await runCover(browser);
    if (shouldRun("access")) await runAccess(browser);
    if (shouldRun("protect")) await runProtect(browser);
    if (shouldRun("preview")) await runPreview(browser);

    }

  } catch (err) {

    console.error("\n실행 중 오류:", err);
    failed += 1;

  } finally {

    await browser.close();
    server.close();

  }

  console.log(`\n결과: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);

})();
