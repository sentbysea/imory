/* =========================================================
   SKIN IMAGE LIBRARY v0.1 — Studio E2E 테스트

   실제 studio/index.html + studio-preview.js + images-panel.js +
   preview iframe을 띄우고, Supabase(REST/RPC/Storage) 호출만
   mock한다. 이 머신에는 로컬 Postgres/Docker/psql이 없어
   migration을 실제 DB에 적용해 검증할 수 없으므로, mock은
   supabase/migrations/20260907100000_create_skin_image_library.sql
   이 정의한 계약(무엇을 받고 무엇을 돌려주는가)을 그대로 흉내 내고
   **SQL 자체는 DB 미검증 항목으로 남긴다** — SKIN_IMAGE_LIBRARY_PLAN.md
   와 최종 보고의 "미검증 항목"을 참고할 것.

   그래서 이 테스트가 실제로 증명하는 것과 못 하는 것을 분명히 한다:

     증명함  — 프런트가 어떤 파라미터로 무엇을 호출하는지,
               Preview/패널/dirty/Save/Publish 상태 전이,
               migration 미적용 배포에서의 폴백 동작
     증명 못함 — SQL 함수 본문/RLS/GRANT/제약이 실제 Postgres에서
               의도대로 동작하는지

   실행:
     node studio/images/skin-image-library-e2e-test.mjs
     node studio/images/skin-image-library-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PORT = 8935;
const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const SKIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const DRAFT_V1 = "11111111-1111-1111-1111-111111111111";
const PUBLISHED_V0 = "00000000-0000-0000-0000-000000000000";
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const args = process.argv.slice(2);
const BROWSER =
  (args.find(a => a.startsWith("--browser=")) || "--browser=chromium").split("=")[1];


/* ---------------------------------------------------------
   playwright (요청한 브라우저가 실제로 뜨는 설치만 고른다)
--------------------------------------------------------- */

async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const dir of fs.readdirSync(npxCache)) {
      candidates.push(path.join(npxCache, dir, "node_modules"));
    }
  }
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  candidates.push(path.join(ROOT, "node_modules"));

  const found = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let version = "0.0.0";
    try { version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0"; } catch {}
    found.push({ entry, version });
  }
  const parts = v => v.split(".").map(Number);
  found.sort((a, b) => {
    const [ax, ay, az] = parts(a.version), [bx, by, bz] = parts(b.version);
    return (bx - ax) || (by - ay) || (bz - az);
  });

  const tried = [];
  for (const { entry, version } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }
  }
  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다.\n  - ${tried.join("\n  - ") || "설치 없음"}`
  );
}


/* ---------------------------------------------------------
   정적 서버
--------------------------------------------------------- */

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg"
};

function startServer() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
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
  return new Promise(r => server.listen(PORT, () => r(server)));
}


/* ---------------------------------------------------------
   Skin Package — imageSlots 두 개를 선언한 최소 멀티페이지 Skin
--------------------------------------------------------- */

const SKIN_CONTENT = {
  schemaVersion: 1,
  templates: {
    home: {
      html:
        '<div class="t-page">' +
        '<img class="t-avatar" data-imory-src="profile.avatarUrl" alt="">' +
        '<img class="t-cover" data-imory-src="images.cover" alt="">' +
        '<h1 data-imory-bind="site.title"></h1>' +
        '<ul><li data-imory-repeat="navigation.postCategories">' +
        '<a data-imory-href="item.href" data-imory-bind="item.name"></a></li></ul>' +
        "</div>"
    },
    category: {
      html: '<div class="t-page"><h1 data-imory-bind="category.name"></h1></div>'
    },
    post: {
      html:
        '<div class="t-page"><h1 data-imory-bind="post.title"></h1>' +
        '<div data-imory-region="post-body"></div></div>'
    }
  },
  css: ".t-page { padding: 20px; } .t-avatar, .t-cover { width: 60px; height: 60px; }",
  imageSlots: [
    { name: "profile", label: "프로필 사진", required: false, aspectRatioHint: "1:1" },
    { name: "cover", label: "커버 이미지", required: false }
  ],
  regions: [],
  metadata: { title: "Image Library Test Skin" }
};


/* ---------------------------------------------------------
   Supabase mock — migration 계약을 그대로 흉내 낸다
--------------------------------------------------------- */

function createMockBackend(options = {}) {

  const libraryReady = options.libraryReady !== false;

  const state = {
    images: [],
    /* versionId -> { slotName: imageId } */
    versionSlots: { [DRAFT_V1]: {}, [PUBLISHED_V0]: {} },
    versions: {
      [PUBLISHED_V0]: { content: SKIN_CONTENT, schema_version: 1 },
      [DRAFT_V1]: { content: SKIN_CONTENT, schema_version: 1 }
    },
    skin: {
      id: SKIN_ID,
      user_id: OWNER_ID,
      current_draft_version_id: DRAFT_V1,
      current_published_version_id: PUBLISHED_V0
    },
    /* Image Library 도입 이전에 시드된 옛 슬롯 값 */
    legacySlotValues: options.seedLegacySlotValues || [],
    calls: [],
    uploads: []
  };

  if (options.seedImages) state.images.push(...options.seedImages);
  if (options.seedVersionSlots) Object.assign(state.versionSlots, options.seedVersionSlots);

  let nextVersionSeq = 2;

  function rpc(name, body) {
    state.calls.push({ name, body });

    if (name === "create_skin_image") {
      if (!body.p_storage_path.startsWith(`${OWNER_ID}/`)) {
        return { status: 400, body: { message: "storage path must live under the caller own folder" } };
      }
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(body.p_mime_type)) {
        return { status: 400, body: { message: `unsupported image type: ${body.p_mime_type}` } };
      }
      if (body.p_byte_size <= 0 || body.p_byte_size > 5242880) {
        return { status: 400, body: { message: "image must be between 1 byte and 5 MB" } };
      }
      if (state.images.length >= 100) {
        return { status: 400, body: { message: "image library is full (max 100 images)" } };
      }
      const row = {
        id: `img-${state.images.length + 1}`,
        user_id: OWNER_ID,
        storage_path: body.p_storage_path,
        public_url: body.p_public_url,
        original_name: body.p_original_name,
        mime_type: body.p_mime_type,
        byte_size: body.p_byte_size,
        created_at: new Date().toISOString()
      };
      state.images.unshift(row);
      return { status: 200, body: row };
    }

    if (name === "delete_skin_image") {
      const refs = Object.values(state.versionSlots)
        .reduce((n, slots) => n + Object.values(slots).filter(id => id === body.p_image_id).length, 0);
      if (refs > 0) {
        return {
          status: 400,
          body: { message: `this image is still used by ${refs} saved skin version(s)` }
        };
      }
      const idx = state.images.findIndex(i => i.id === body.p_image_id);
      if (idx < 0) return { status: 400, body: { message: "image not found or not owned by caller" } };
      const [removed] = state.images.splice(idx, 1);
      return { status: 200, body: removed.storage_path };
    }

    if (name === "save_skin_draft_version" || name === "save_skin_draft_version_with_image_slots") {
      const newId = `version-${nextVersionSeq++}`;
      state.versions[newId] = {
        content: body.p_content,
        schema_version: body.p_schema_version
      };

      const bindings = {};

      if (name === "save_skin_draft_version_with_image_slots") {
        /* migration과 동일한 두 겹 필터: 선언된 슬롯 + 내 이미지 */
        const declared = new Set(
          (Array.isArray(body.p_content.imageSlots) ? body.p_content.imageSlots : [])
            .map(s => s && s.name)
            .filter(Boolean)
        );
        Object.entries(body.p_image_slots || {}).forEach(([slot, imageId]) => {
          if (!declared.has(slot)) return;
          if (!state.images.some(i => i.id === imageId)) return;
          bindings[slot] = imageId;
        });
      }

      state.versionSlots[newId] = bindings;
      state.skin.current_draft_version_id = newId;
      return { status: 200, body: newId };
    }

    if (name === "publish_skin") {
      state.skin.current_published_version_id = state.skin.current_draft_version_id;
      return { status: 200, body: null };
    }

    if (name === "get_published_skin") {
      const versionId = state.skin.current_published_version_id;
      const version = state.versions[versionId];
      if (!version) return { status: 200, body: null };
      const values = {};
      Object.entries(state.versionSlots[versionId] || {}).forEach(([slot, imageId]) => {
        const img = state.images.find(i => i.id === imageId);
        if (img) values[slot] = img.public_url;
      });

      /*
        migration의 폴백 조건을 그대로 흉내 낸다 — "지금 0건이면"이
        아니라 "이 skin이 새 모델을 한 번도 쓴 적이 없으면"만 옛
        skin_image_slot_values로 폴백한다.
      */
      const everUsedNewModel = Object.values(state.versionSlots)
        .some(slots => Object.keys(slots).length > 0);

      if (!everUsedNewModel) {
        state.legacySlotValues.forEach(row => { values[row.slot_name] = row.image_url; });
      }
      return {
        status: 200,
        body: { skin: version.content, schemaVersion: version.schema_version, imageSlotValues: values }
      };
    }

    return { status: 200, body: null };
  }

  function rest(pathname, params) {
    const table = pathname.slice("/rest/v1/".length);

    if (table === "skin_images") {
      if (!libraryReady) {
        return {
          status: 404,
          body: { code: "42P01", message: 'relation "public.skin_images" does not exist' }
        };
      }
      return { status: 200, body: state.images };
    }

    if (table === "skin_version_image_slots") {
      if (!libraryReady) {
        return { status: 404, body: { code: "42P01", message: "does not exist" } };
      }

      /*
        hasAnyBinding()의 embedded resource 필터
        (?skin_versions.skin_id=eq.<id>) — 이 skin에 속한 어떤
        버전에든 연결이 있으면 1건이라도 돌려준다.
      */
      const skinFilter = params.get("skin_versions.skin_id");
      if (skinFilter) {
        const any = Object.values(state.versionSlots)
          .some(slots => Object.keys(slots).length > 0);
        return { status: 200, body: any ? [{ version_id: DRAFT_V1 }] : [] };
      }

      const eq = params.get("version_id") || "";
      const versionId = eq.startsWith("eq.") ? eq.slice(3) : eq;
      const rows = Object.entries(state.versionSlots[versionId] || {}).map(([slot, imageId]) => {
        const img = state.images.find(i => i.id === imageId);
        return { slot_name: slot, image_id: imageId, skin_images: img ? { public_url: img.public_url } : null };
      });
      return { status: 200, body: rows };
    }

    if (table === "skins") return { status: 200, body: [state.skin] };

    if (table === "skin_versions") {
      const eq = params.get("id") || "";
      const id = eq.startsWith("eq.") ? eq.slice(3) : eq;
      const v = state.versions[id];
      return { status: 200, body: v ? [{ content: v.content }] : [] };
    }

    if (table === "skin_image_slot_values") {
      return { status: 200, body: state.legacySlotValues };
    }

    if (table === "profiles") {
      return {
        status: 200,
        body: [{ user_id: OWNER_ID, slug: "testuser", nickname: "테스트", bio: "bio", home_mode: "customize" }]
      };
    }

    if (table === "site_settings") {
      return { status: 200, body: [{ user_id: OWNER_ID, key: "blog_title", value: "IMAGE LIB TEST" }] };
    }

    if (table === "categories") {
      return { status: 200, body: [{ id: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1 }] };
    }

    if (table === "posts" || table === "banners" || table === "post_contents") {
      return { status: 200, body: [] };
    }

    return { status: 200, body: [] };
  }

  return { state, rpc, rest, libraryReady };
}


async function installMock(page, backend) {

  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*"
  };

  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({
          id: OWNER_ID, aud: "authenticated", role: "authenticated",
          email: "test@example.com", app_metadata: {}, user_metadata: {},
          created_at: "2026-01-01T00:00:00Z"
        })
      });
    }

    if (url.pathname.startsWith("/storage/v1/object/skin-images/")) {
      const objectPath = url.pathname.slice("/storage/v1/object/skin-images/".length);
      backend.state.uploads.push({ objectPath, method: req.method() });
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({ Key: `skin-images/${objectPath}` })
      });
    }

    if (url.pathname === "/storage/v1/object/skin-images") {
      /* remove() */
      return route.fulfill({ status: 200, headers, contentType: "application/json", body: "[]" });
    }

    if (url.pathname.startsWith("/storage/v1/object/public/")) {
      /* 1x1 투명 PNG */
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

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const result = backend.rpc(
        url.pathname.slice("/rest/v1/rpc/".length),
        JSON.parse(req.postData() || "{}")
      );
      return route.fulfill({
        status: result.status, headers, contentType: "application/json",
        body: JSON.stringify(result.body)
      });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const result = backend.rest(url.pathname, url.searchParams);
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      const body = single
        ? (Array.isArray(result.body) ? (result.body[0] ?? null) : result.body)
        : result.body;
      return route.fulfill({
        status: result.status, headers,
        contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
        body: JSON.stringify(body)
      });
    }

    return route.fulfill({ status: 404, headers, body: "{}" });
  });

  for (const p of [
    "https://fonts.googleapis.com/**",
    "https://fonts.gstatic.com/**",
    "https://cdn.jsdelivr.net/gh/**"
  ]) {
    await page.route(p, r => r.abort());
  }
}


/* ---------------------------------------------------------
   러너
--------------------------------------------------------- */

let passed = 0, failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/*
  Studio는 로그인한 소유자 전용 화면이라 supabase-js가 세션을 갖고
  있어야 getUser()가 서버까지 간다(세션이 없으면 요청 없이 곧장
  AuthSessionMissingError). 그래서 supabase-js가 쓰는 localStorage
  키에 만료가 한참 남은 세션을 미리 심어 둔다 — 토큰 값 자체는
  mock이 검사하지 않는다.
*/

const MOCK_USER = {
  id: OWNER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z"
};

const MOCK_SESSION = {
  access_token: "mock-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  refresh_token: "mock-refresh-token",
  user: MOCK_USER
};

/* =========================================================
   launchBrowser — spawn 재시도

   이 머신의 webkit 빌드는 간헐적으로 spawn EPERM을 낸다(같은
   실행 파일이 바로 다음 시도에서는 정상적으로 뜬다) — 제품 결함이
   아니라 환경 문제이므로, 브라우저를 띄우는 지점에서만 짧게
   재시도한다. 재시도해도 안 되면 그대로 실패시켜서 "환경 때문에
   못 돌렸다"는 사실이 조용히 묻히지 않게 한다.
========================================================== */

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


async function openStudio(playwright, backend) {
  const browser = await launchBrowser(playwright, BROWSER);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  await context.addInitScript(
    ([key, session]) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(session));
      } catch { /* private mode 등 — 그러면 테스트가 자연히 실패한다 */ }
    },
    [`sb-${SUPABASE_HOST.split(".")[0]}-auth-token`, MOCK_SESSION]
  );

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  /* IMORY_DEBUG=1로 실행하면 브라우저 콘솔/실패 요청을 그대로 흘려준다 */
  if (process.env.IMORY_DEBUG) {
    page.on("console", (m) => console.log("  [console]", m.type(), m.text()));
    page.on("requestfailed", (r) => console.log("  [reqfail]", r.url()));
  }
  await installMock(page, backend);
  await page.goto(`http://localhost:${PORT}/studio/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#studioImagesButton:not([disabled])", { timeout: 20000, state: "attached" });
  return { browser, page, errors };
}

async function attachFile(page, name, bytes, mime) {
  await page.setInputFiles(".images-panel-overlay input[type=file]", {
    name, mimeType: mime, buffer: bytes
  });
}


/* ---------------------------------------------------------
   1) 패널 기본 동작 — 슬롯 표시 / 업로드 / 연결 / Preview 반영
--------------------------------------------------------- */

async function testPanelFlow(playwright) {
  console.log("\n[panel] 슬롯 표시 → 업로드 → 연결 → Preview 반영 → 비우기");
  const backend = createMockBackend();
  const { browser, page, errors } = await openStudio(playwright, backend);

  try {
    await page.click("#studioTopDockHandle");
    await page.click("#studioImagesButton");
    await page.waitForSelector(".images-panel-slot", { timeout: 10000 });

    const slotNames = await page.$$eval(
      ".images-panel-slot-label",
      els => els.map(e => e.textContent)
    );
    check("[panel] 선언된 슬롯이 모두 보임",
      slotNames.length === 2 && slotNames.includes("프로필 사진") && slotNames.includes("커버 이미지"),
      JSON.stringify(slotNames));

    /* 업로드 */
    await attachFile(page, "hello.png", PNG_BYTES, "image/png");
    await page.waitForSelector(".images-panel-card", { timeout: 10000 });

    const uploadPath = backend.state.uploads[0]?.objectPath || "";
    check("[panel] 업로드 경로가 {user_id}/{uuid}.{ext} 형태(고정 경로 덮어쓰기 아님)",
      uploadPath.startsWith(`${OWNER_ID}/`) && /\/[0-9a-z-]{8,}\.png$/.test(uploadPath),
      uploadPath);

    check("[panel] create_skin_image RPC가 MIME/크기와 함께 호출됨",
      backend.state.calls.some(c =>
        c.name === "create_skin_image" &&
        c.body.p_mime_type === "image/png" &&
        c.body.p_byte_size === PNG_BYTES.length),
      JSON.stringify(backend.state.calls.filter(c => c.name === "create_skin_image").map(c => c.body)));

    /* 연결 — 첫 슬롯(profile)이 기본 선택 */
    await page.click(".images-panel-card-attach");
    await page.waitForTimeout(400);

    const previewAvatarSrc = await page.frameLocator("#studioPreviewFrame")
      .locator(".t-avatar").getAttribute("src");

    check("[panel] Preview(HOME)의 profile.avatarUrl이 즉시 갱신됨",
      !!previewAvatarSrc && previewAvatarSrc.includes("/skin-images/"),
      String(previewAvatarSrc));

    const saveDisabled = await page.getAttribute("#studioSaveButton", "disabled");
    check("[panel] 슬롯 연결이 dirty로 잡혀 Save가 활성화됨", saveDisabled === null,
      `disabled=${saveDisabled}`);

    /* 두 번째 슬롯(cover)도 같은 이미지로 연결 */
    await page.click(".images-panel-slot:nth-child(2) .images-panel-slot-pick");
    await page.click(".images-panel-card-attach");
    await page.waitForTimeout(400);

    const coverSrc = await page.frameLocator("#studioPreviewFrame")
      .locator(".t-cover").getAttribute("src");
    check("[panel] Preview의 images.<slotName>도 즉시 갱신됨",
      !!coverSrc && coverSrc.includes("/skin-images/"), String(coverSrc));

    /* 비우기 */
    await page.click(".images-panel-slot:nth-child(2) .images-panel-slot-clear");
    await page.waitForTimeout(400);
    const clearedCover = await page.frameLocator("#studioPreviewFrame")
      .locator(".t-cover").getAttribute("src");
    check("[panel] 비우기가 Preview에 즉시 반영됨", !clearedCover, String(clearedCover));

    check("[panel] 콘솔 에러 없음", errors.length === 0, errors.join(" | "));

  } finally {
    await browser.close();
  }
}


/* ---------------------------------------------------------
   2) Draft/Publish 분리 — Save가 공개본을 바꾸지 않는가
--------------------------------------------------------- */

async function testDraftPublishSeparation(playwright) {
  console.log("\n[draft/publish] Save는 공개본을 바꾸지 않고 Publish만 바꾼다");
  const backend = createMockBackend();
  const { browser, page, errors } = await openStudio(playwright, backend);

  try {
    await page.click("#studioTopDockHandle");
    await page.click("#studioImagesButton");
    await page.waitForSelector(".images-panel-slot", { timeout: 10000 });
    await attachFile(page, "a.png", PNG_BYTES, "image/png");
    await page.waitForSelector(".images-panel-card", { timeout: 10000 });
    await page.click(".images-panel-card-attach");
    await page.waitForTimeout(300);
    await page.click(".images-panel-done-button");

    const publishedBeforeSave = backend.rpc("get_published_skin", {}).body;
    check("[draft/publish] 업로드+슬롯 연결만으로는 공개본이 그대로",
      Object.keys(publishedBeforeSave.imageSlotValues).length === 0,
      JSON.stringify(publishedBeforeSave.imageSlotValues));

    /* Save */
    await page.click("#studioSaveButton");
    await page.waitForTimeout(1200);

    const saveCall = backend.state.calls
      .filter(c => c.name === "save_skin_draft_version_with_image_slots").pop();

    check("[draft/publish] Save가 이미지 슬롯 포함 RPC를 호출",
      !!saveCall && !!saveCall.body.p_image_slots.profile,
      JSON.stringify(saveCall && saveCall.body.p_image_slots));

    const publishedAfterSave = backend.rpc("get_published_skin", {}).body;
    check("[draft/publish] Save 후에도 공개본은 그대로",
      Object.keys(publishedAfterSave.imageSlotValues).length === 0,
      JSON.stringify(publishedAfterSave.imageSlotValues));

    /* Publish */
    await page.click("#studioPublishButton");
    await page.waitForSelector(".studio-confirm-overlay:not([hidden])", { timeout: 10000 })
      .catch(() => {});
    const confirmButton = await page.$(".studio-confirm-button--primary");
    if (confirmButton) await confirmButton.click();
    await page.waitForTimeout(1200);

    const publishedAfter = backend.rpc("get_published_skin", {}).body;
    check("[draft/publish] Publish 후에는 그 버전의 연결이 공개됨",
      !!publishedAfter.imageSlotValues.profile &&
      publishedAfter.imageSlotValues.profile.includes("/skin-images/"),
      JSON.stringify(publishedAfter.imageSlotValues));

    check("[draft/publish] 콘솔 에러 없음", errors.length === 0, errors.join(" | "));

  } finally {
    await browser.close();
  }
}


/* ---------------------------------------------------------
   3) 저장 후 재접속 — draft 연결 복원
--------------------------------------------------------- */

async function testReloadRestoresDraftBindings(playwright) {
  console.log("\n[restore] 저장 후 재접속 시 draft 이미지 연결이 복원된다");
  const backend = createMockBackend({
    seedImages: [{
      id: "img-seed", user_id: OWNER_ID,
      storage_path: `${OWNER_ID}/seed.png`,
      public_url: `https://${SUPABASE_HOST}/storage/v1/object/public/skin-images/${OWNER_ID}/seed.png`,
      original_name: "seed.png", mime_type: "image/png", byte_size: 100,
      created_at: "2026-09-01T00:00:00Z"
    }],
    seedVersionSlots: { [DRAFT_V1]: { profile: "img-seed" } }
  });

  const { browser, page, errors } = await openStudio(playwright, backend);

  try {
    await page.waitForTimeout(800);

    const avatarSrc = await page.frameLocator("#studioPreviewFrame")
      .locator(".t-avatar").getAttribute("src");

    check("[restore] mount 시 draft 버전의 연결이 Preview에 반영됨",
      !!avatarSrc && avatarSrc.includes("seed.png"), String(avatarSrc));

    await page.click("#studioTopDockHandle");
    await page.click("#studioImagesButton");
    await page.waitForSelector(".images-panel-slot", { timeout: 10000 });

    const thumbCount = await page.$$eval(
      ".images-panel-slot-thumb img", els => els.length
    );
    check("[restore] 패널이 복원된 연결을 썸네일로 보여줌", thumbCount === 1, `thumbs=${thumbCount}`);

    const saveDisabled = await page.getAttribute("#studioSaveButton", "disabled");
    check("[restore] 복원 직후에는 dirty가 아니다", saveDisabled !== null, `disabled=${saveDisabled}`);

    check("[restore] 콘솔 에러 없음", errors.length === 0, errors.join(" | "));

  } finally {
    await browser.close();
  }
}


/* ---------------------------------------------------------
   4) 검증 / 실패 표시 / 사용 중 이미지 삭제 방지
--------------------------------------------------------- */

async function testValidationAndDeletionGuard(playwright) {
  console.log("\n[guard] 형식·크기 제한 / 업로드 실패 표시 / 사용 중 이미지 삭제 방지");
  const backend = createMockBackend();
  const { browser, page, errors } = await openStudio(playwright, backend);

  try {
    await page.click("#studioTopDockHandle");
    await page.click("#studioImagesButton");
    await page.waitForSelector(".images-panel-slot", { timeout: 10000 });

    /* 허용되지 않는 형식 */
    await attachFile(page, "evil.svg", Buffer.from("<svg/>"), "image/svg+xml");
    await page.waitForTimeout(300);
    let message = await page.textContent(".images-panel-message");
    check("[guard] SVG 등 허용되지 않는 형식은 거절되고 사유가 보인다",
      /PNG/.test(message || ""), String(message));
    check("[guard] 거절된 파일은 업로드 요청 자체가 없다",
      backend.state.uploads.length === 0, `uploads=${backend.state.uploads.length}`);

    /* 크기 초과 */
    await attachFile(page, "big.png", Buffer.alloc(6 * 1024 * 1024, 1), "image/png");
    await page.waitForTimeout(300);
    message = await page.textContent(".images-panel-message");
    check("[guard] 5MB 초과 파일은 거절되고 사유가 보인다",
      /너무 커/.test(message || ""), String(message));

    /* 정상 업로드 후 연결 → 삭제 버튼 비활성 */
    await attachFile(page, "ok.png", PNG_BYTES, "image/png");
    await page.waitForSelector(".images-panel-card", { timeout: 10000 });
    await page.click(".images-panel-card-attach");
    await page.waitForTimeout(300);

    const deleteDisabled = await page.getAttribute(".images-panel-card-delete", "disabled");
    check("[guard] 지금 슬롯에 연결된 이미지는 삭제 버튼이 막힌다",
      deleteDisabled !== null, `disabled=${deleteDisabled}`);

    /* 저장된 버전이 참조하는 이미지 — RPC가 거절하고 그 사유가 보인다 */
    await page.click(".images-panel-slot .images-panel-slot-clear");
    await page.waitForTimeout(200);
    backend.state.versionSlots[PUBLISHED_V0] = { profile: "img-1" };

    await page.click(".images-panel-card-delete");
    await page.waitForTimeout(600);
    message = await page.textContent(".images-panel-message");
    check("[guard] 과거 버전이 참조하는 이미지는 삭제되지 않고 사유가 보인다",
      /still used/.test(message || "") && backend.state.images.length === 1,
      `${message} / images=${backend.state.images.length}`);

    check("[guard] 콘솔 에러 없음", errors.length === 0, errors.join(" | "));

  } finally {
    await browser.close();
  }
}


/* ---------------------------------------------------------
   5) migration 미적용 배포 — 기존 기능 유지 + 준비 안내
--------------------------------------------------------- */

async function testLibraryNotReady(playwright) {
  console.log("\n[not-ready] migration 미적용 시 기존 기능 유지 + 준비 안내");
  const backend = createMockBackend({ libraryReady: false });
  const { browser, page, errors } = await openStudio(playwright, backend);

  try {
    await page.click("#studioTopDockHandle");
    await page.click("#studioImagesButton");
    await page.waitForTimeout(500);

    const notice = await page.textContent(".images-panel-notice");
    const bodyHidden = await page.getAttribute(".images-panel-body", "hidden");

    check("[not-ready] 준비 안내가 보이고 슬롯/그리드는 감춰진다",
      /준비되지 않/.test(notice || "") && bodyHidden !== null,
      `${notice} / bodyHidden=${bodyHidden}`);

    await page.click(".images-panel-done-button");

    /* 기존 Save 경로가 그대로 동작해야 한다 — Code Editor 없이
       dirty를 만들 방법이 없으므로 Import로 만든다 */
    await page.click("#studioImportButton");
    await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 10000 });
    await page.fill(".import-editor-overlay textarea", JSON.stringify(SKIN_CONTENT));
    await page.click(".import-editor-overlay .import-editor-button:nth-of-type(2)");
    await page.waitForTimeout(600);
    await page.click(".import-editor-button--primary");
    await page.waitForTimeout(600);

    await page.click("#studioSaveButton");
    await page.waitForTimeout(1500);

    const usedLegacy = backend.state.calls.some(c => c.name === "save_skin_draft_version");
    const usedNew = backend.state.calls.some(c => c.name === "save_skin_draft_version_with_image_slots");

    check("[not-ready] Save가 기존 RPC로 그대로 동작한다",
      usedLegacy && !usedNew, `legacy=${usedLegacy} new=${usedNew}`);

    check("[not-ready] 콘솔 에러 없음", errors.length === 0, errors.join(" | "));

  } finally {
    await browser.close();
  }
}


/* ---------------------------------------------------------
   6) Import로 슬롯 선언이 바뀌면 사라진 슬롯 연결을 버린다
--------------------------------------------------------- */

async function testImportPrunesSlots(playwright) {
  console.log("\n[import] 선언에서 사라진 슬롯의 연결은 버려진다");
  const backend = createMockBackend();
  const { browser, page, errors } = await openStudio(playwright, backend);

  try {
    await page.click("#studioTopDockHandle");
    await page.click("#studioImagesButton");
    await page.waitForSelector(".images-panel-slot", { timeout: 10000 });
    await attachFile(page, "a.png", PNG_BYTES, "image/png");
    await page.waitForSelector(".images-panel-card", { timeout: 10000 });

    /* profile + cover 둘 다 연결 */
    await page.click(".images-panel-card-attach");
    await page.waitForTimeout(200);
    await page.click(".images-panel-slot:nth-child(2) .images-panel-slot-pick");
    await page.click(".images-panel-card-attach");
    await page.waitForTimeout(200);
    await page.click(".images-panel-done-button");

    /* cover 선언이 사라진 SkinPackage를 Import */
    const reduced = {
      ...SKIN_CONTENT,
      imageSlots: [{ name: "profile", label: "프로필 사진", required: false }]
    };

    await page.click("#studioImportButton");
    await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 10000 });
    await page.fill(".import-editor-overlay textarea", JSON.stringify(reduced));
    await page.click(".import-editor-overlay .import-editor-button:nth-of-type(2)");
    await page.waitForTimeout(600);
    await page.click(".import-editor-button--primary");
    await page.waitForTimeout(800);

    await page.click("#studioSaveButton");
    await page.waitForTimeout(1500);

    const saveCall = backend.state.calls
      .filter(c => c.name === "save_skin_draft_version_with_image_slots").pop();

    check("[import] 남아 있는 슬롯의 연결만 저장된다",
      !!saveCall &&
      !!saveCall.body.p_image_slots.profile &&
      !("cover" in saveCall.body.p_image_slots),
      JSON.stringify(saveCall && saveCall.body.p_image_slots));

    check("[import] 콘솔 에러 없음", errors.length === 0, errors.join(" | "));

  } finally {
    await browser.close();
  }
}


/* ---------------------------------------------------------
   7) 슬롯을 전부 비워 저장해도 옛 legacy 이미지가 되살아나지 않는다

   폴백 조건을 "지금 연결이 0건이면"으로 두면, 사용자가 슬롯을 전부
   비운 순간 옛 skin_image_slot_values 값이 draft Preview와 공개
   화면에 다시 나타난다. 조건이 "이 skin이 새 모델을 한 번도 쓴 적이
   없으면"으로 바뀌었는지 확인한다.
--------------------------------------------------------- */

async function testClearedSlotsDoNotRestoreLegacy(playwright) {
  console.log("\n[legacy] 슬롯 전부 비움 → 옛 이미지가 되살아나지 않는다");

  const LEGACY_URL =
    `https://${SUPABASE_HOST}/storage/v1/object/public/user-avatars/legacy.png`;

  const backend = createMockBackend({
    seedLegacySlotValues: [{ slot_name: "profile", image_url: LEGACY_URL }]
  });

  /* 사전 확인: 새 모델을 쓴 적 없는 skin은 지금까지대로 legacy로 폴백한다 */
  const before = backend.rpc("get_published_skin", {}).body;
  check("[legacy] 도입 이전 상태에서는 기존 값으로 폴백한다(하위 호환)",
    before.imageSlotValues.profile === LEGACY_URL,
    JSON.stringify(before.imageSlotValues));

  const { browser, page, errors } = await openStudio(playwright, backend);

  try {
    /* 새 모델로 한 번 연결하고 저장 → 발행 */
    await page.click("#studioTopDockHandle");
    await page.click("#studioImagesButton");
    await page.waitForSelector(".images-panel-slot", { timeout: 10000 });
    await attachFile(page, "new.png", PNG_BYTES, "image/png");
    await page.waitForSelector(".images-panel-card", { timeout: 10000 });
    await page.click(".images-panel-card-attach");
    await page.waitForTimeout(300);
    await page.click(".images-panel-done-button");

    await page.click("#studioSaveButton");
    await page.waitForTimeout(1200);
    await page.click("#studioPublishButton");
    await page.waitForSelector(".studio-confirm-overlay:not([hidden])", { timeout: 10000 })
      .catch(() => {});
    const confirm1 = await page.$(".studio-confirm-button--primary");
    if (confirm1) await confirm1.click();
    await page.waitForTimeout(1200);

    const afterBind = backend.rpc("get_published_skin", {}).body;
    check("[legacy] 새 연결이 legacy 값을 대신한다",
      afterBind.imageSlotValues.profile &&
      afterBind.imageSlotValues.profile.includes("/skin-images/"),
      JSON.stringify(afterBind.imageSlotValues));

    /* 이제 슬롯을 전부 비우고 저장 → 발행 */
    await page.click("#studioImagesButton");
    await page.waitForSelector(".images-panel-slot", { timeout: 10000 });
    await page.click(".images-panel-slot .images-panel-slot-clear");
    await page.waitForTimeout(300);
    await page.click(".images-panel-done-button");

    await page.click("#studioSaveButton");
    await page.waitForTimeout(1200);
    await page.click("#studioPublishButton");
    await page.waitForSelector(".studio-confirm-overlay:not([hidden])", { timeout: 10000 })
      .catch(() => {});
    const confirm2 = await page.$(".studio-confirm-button--primary");
    if (confirm2) await confirm2.click();
    await page.waitForTimeout(1200);

    const afterClear = backend.rpc("get_published_skin", {}).body;
    check("[legacy] 전부 비우고 발행하면 공개본도 비어 있다(legacy 부활 없음)",
      Object.keys(afterClear.imageSlotValues).length === 0,
      JSON.stringify(afterClear.imageSlotValues));

    check("[legacy] 콘솔 에러 없음", errors.length === 0, errors.join(" | "));

  } finally {
    await browser.close();
  }

  /* 재접속했을 때 Studio Preview도 legacy를 되살리지 않아야 한다 */
  const reopened = await openStudio(playwright, backend);

  try {
    await reopened.page.waitForTimeout(900);

    const avatarSrc = await reopened.page.frameLocator("#studioPreviewFrame")
      .locator(".t-avatar").getAttribute("src");

    check("[legacy] 재접속 Preview도 legacy를 되살리지 않는다",
      !avatarSrc, String(avatarSrc));

  } finally {
    await reopened.browser.close();
  }
}


/* ---------------------------------------------------------
   main
--------------------------------------------------------- */

const server = await startServer();
const playwright = await loadPlaywright(BROWSER);

console.log(`\n=== SKIN IMAGE LIBRARY E2E (${BROWSER}) ===`);
console.log("※ Supabase 호출은 mock. migration SQL 자체는 이 테스트로 검증되지 않는다.");

try {
  await testPanelFlow(playwright);
  await testDraftPublishSeparation(playwright);
  await testReloadRestoresDraftBindings(playwright);
  await testValidationAndDeletionGuard(playwright);
  await testLibraryNotReady(playwright);
  await testImportPrunesSlots(playwright);
  await testClearedSlotsDoNotRestoreLegacy(playwright);
} finally {
  server.close();
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) console.log("실패 항목:\n  - " + failures.join("\n  - "));

process.exit(failed ? 1 : 0);
