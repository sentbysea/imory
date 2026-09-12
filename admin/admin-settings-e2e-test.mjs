/* =========================================================
   ADMIN SETTINGS E2E — 이미지 설정 · ETC 보호 설정 · 탭 유지

   저장소의 실제 admin/index.html과 admin/**.js를 그대로 띄우고
   Supabase 네트워크만 mock한다(다른 e2e와 같은 규약).

   확인 범위(2026-09-11에 고친 것들):

     image   FAVICON / CURSOR — URL 입력 칸이 없고, 이미지를 고르면
             **매번 새 경로**에 올라가며(예전엔 고정 경로 덮어쓰기라
             바꿔도 옛 이미지가 그대로 보였다), save를 눌러야
             site_settings에 반영되고 그때 예전 파일이 지워진다.
             remove도 같은 규칙.
     etc     Settings > HOME > ETC 보호 설정 3개 — 불러오기/저장
     tab     설정 안쪽 탭이 화면 복귀(restoreAdminView) 뒤에도
             그대로인가 — 예전에는 무조건 PROFILE로 튀었다.

   ★ 실행
     node admin/admin-settings-e2e-test.mjs
     node admin/admin-settings-e2e-test.mjs --only=image
     node admin/admin-settings-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8949;
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
   저장소를 그대로 서빙
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

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   DB fixture + PostgREST mock (이 화면이 실제로 쓰는 만큼만)
========================================================== */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function makeDb(overrides = {}) {
  return {
    profiles: [{
      user_id: OWNER_ID, slug: "testuser", nickname: "테스트", bio: "", home_mode: "customize"
    }],
    site_settings: [
      { user_id: OWNER_ID, key: "blog_title", value: "IMORY ADMIN E2E" },
      ...(overrides.settings || [])
    ],
    categories: [{
      id: 1, user_id: OWNER_ID, name: "PHOTO", type: "post", sort_order: 1, slug: "photo",
      list_style: "list", page_size: 12, secret_cover_mode: "lock", secret_cover_path: null
    }],
    posts: [],
    banners: []
  };
}

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
  const select = params.get("select");
  if (select && select !== "*") {
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }
  return rows;
}


async function installSupabaseMock(page, opts = {}) {
  const {
    db = makeDb(),
    recorder = null,
    storageObjects = new Set(),
    settingsWriteFails = false
  } = opts;

  installSupabaseMock.lastDb = db;
  installSupabaseMock.lastStorage = storageObjects;

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
        body: req.postData() || "",
        bodyBuffer:
          typeof req.postDataBuffer === "function" ? req.postDataBuffer() : null
      });
    }

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    /* ---- Auth ---- */
    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({ user: { id: OWNER_ID, email: "owner@example.com" } })
      });
    }

    /* ---- Storage ---- */
    if (url.pathname.startsWith("/storage/v1/object/")) {

      const publicPrefix = "/storage/v1/object/public/";

      if (url.pathname.startsWith(publicPrefix)) {
        const key = decodeURIComponent(url.pathname.slice(publicPrefix.length))
          .split("?")[0];
        if (!storageObjects.has(key)) {
          return route.fulfill({
            status: 400, headers, contentType: "application/json",
            body: JSON.stringify({ statusCode: "404", error: "not_found" })
          });
        }
        return route.fulfill({
          status: 200, headers, contentType: "image/png", body: PNG_1X1
        });
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

      return route.fulfill({
        status: 200, headers, contentType: "application/json", body: "{}"
      });
    }

    /* ---- PostgREST ---- */
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({
        status: 200, headers, contentType: "application/json", body: "null"
      });
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

        /* upsert를 실제로 반영한다 — 저장 뒤 다시 읽는 흐름이 있다 */
        if (table === "site_settings") {
          let rows = [];
          try { rows = JSON.parse(req.postData() || "[]"); } catch { /* noop */ }
          (Array.isArray(rows) ? rows : [rows]).forEach((row) => {
            const found = db.site_settings.find(
              s => s.user_id === row.user_id && s.key === row.key
            );
            if (found) found.value = row.value;
            else db.site_settings.push({ ...row });
          });
        }

        return route.fulfill({
          status: 201, headers, contentType: "application/json", body: "[]"
        });
      }

      if (req.method() === "DELETE") {
        return route.fulfill({ status: 204, headers, body: "" });
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
  }, { id: OWNER_ID, token: OWNER_TOKEN });
}


/* =========================================================
   화면 열기
========================================================== */

async function openSettings(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await installSignedInUser(page);
  await installSupabaseMock(page, opts);

  await page.goto(`http://localhost:${PORT}/admin/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#openSettingsButton", { state: "visible", timeout: 20000 });
  await page.click("#openSettingsButton");
  await page.waitForTimeout(900);

  return { ctx, page };
}


async function openTab(page, label) {
  await page.evaluate((name) => {
    const tab = Array.from(document.querySelectorAll(".settings-tab"))
      .find(el => (el.textContent || "").trim() === name);
    if (tab) tab.click();
  }, label);
  await page.waitForTimeout(500);
}


const TEST_PNG = PNG_1X1;

async function attach(page, inputId) {
  await page.setInputFiles(`#${inputId}`, {
    name: "icon.png",
    mimeType: "image/png",
    buffer: TEST_PNG
  });
  await page.waitForTimeout(600);
}


/* =========================================================
   1. image — FAVICON / CURSOR
========================================================== */

async function runImage(browser) {
  console.log("\n[image] FAVICON / CURSOR");

  for (const target of [
    {
      name: "favicon",
      key: "favicon_url",
      bucket: "user-favicons",
      fileInput: "faviconFileInput",
      preview: "faviconPreview",
      remove: "faviconRemoveButton",
      save: "faviconSaveButton",
      saveMessage: "faviconSaveMessage"
    },
    {
      name: "cursor",
      key: "cursor_url",
      bucket: "user-cursors",
      fileInput: "cursorFileInput",
      preview: "cursorPreview",
      remove: "cursorRemoveButton",
      save: "cursorSaveButton",
      saveMessage: "cursorSaveMessage"
    }
  ]) {

    /* 예전 값이 이미 저장돼 있는 상태에서 시작한다 */
    const previousPath = `${OWNER_ID}/old-${target.name}`;
    const previousUrl =
      `https://${SUPABASE_HOST}/storage/v1/object/public/${target.bucket}/${previousPath}`;

    const db = makeDb({
      settings: [{ user_id: OWNER_ID, key: target.key, value: previousUrl }]
    });

    const storage = new Set([`${target.bucket}/${previousPath}`]);
    const requests = [];

    const { ctx, page } = await openSettings(browser, { db, recorder: requests, storageObjects: storage });

    await openTab(page, "HOME");

    check(
      `[${target.name}] URL 입력 칸이 없다`,
      await page.evaluate((id) => !document.getElementById(id),
        target.name === "favicon" ? "faviconUrlInput" : "cursorUrlInput")
    );

    check(
      `[${target.name}] 저장된 이미지가 미리보기에 뜬다`,
      await page.evaluate((id) => {
        const img = document.getElementById(id);
        return !!img && !img.hidden && (img.getAttribute("src") || "").includes("old-");
      }, target.preview)
    );

    const before = requests.length;

    await attach(page, target.fileInput);

    const uploads = requests.slice(before).filter(
      r => r.method === "POST" && r.path.includes(`/storage/v1/object/${target.bucket}/`)
    );

    check(
      `[${target.name}] ★ 고른 즉시 **새 경로**에 올라간다(덮어쓰기가 아니다)`,
      uploads.length === 1 && !uploads[0].path.includes("old-"),
      uploads.map(u => u.path).join(", ") || "업로드 없음"
    );

    const newPath = uploads.length
      ? uploads[0].path.slice(`/storage/v1/object/${target.bucket}/`.length)
      : "";

    check(
      `[${target.name}] 미리보기가 방금 올린 새 주소를 가리킨다`,
      await page.evaluate(({ id, needle }) => {
        const img = document.getElementById(id);
        return !!img && (img.getAttribute("src") || "").includes(needle);
      }, { id: target.preview, needle: newPath }),
      newPath
    );

    check(
      `[${target.name}] save 전에는 site_settings를 건드리지 않는다`,
      !requests.slice(before).some(
        r => r.method === "POST" && r.path.includes("/rest/v1/site_settings")
      )
    );

    check(
      `[${target.name}] save 전에는 예전 파일이 그대로 있다`,
      storage.has(`${target.bucket}/${previousPath}`)
    );

    await page.click(`#${target.save}`);
    await page.waitForTimeout(900);

    const saved = db.site_settings.find(s => s.key === target.key);

    check(
      `[${target.name}] ★ 저장하면 주소가 **새 주소로 바뀐다**(캐시가 끼어들 자리가 없다)`,
      !!saved && saved.value.includes(newPath) && !saved.value.includes("old-"),
      saved ? saved.value : "(값 없음)"
    );

    check(
      `[${target.name}] 저장이 끝난 뒤에 예전 파일을 지운다`,
      !storage.has(`${target.bucket}/${previousPath}`) &&
      storage.has(`${target.bucket}/${newPath}`)
    );

    check(
      `[${target.name}] 저장 완료 안내가 뜬다`,
      (await page.textContent(`#${target.saveMessage}`) || "").includes("saved")
    );

    /* ---- remove ---- */
    await page.click(`#${target.remove}`);
    await page.waitForTimeout(300);

    check(
      `[${target.name}] remove는 저장 전에는 값을 지우지 않는다`,
      db.site_settings.find(s => s.key === target.key).value.includes(newPath)
    );

    await page.click(`#${target.save}`);
    await page.waitForTimeout(900);

    check(
      `[${target.name}] remove 후 저장하면 값이 비고 파일도 지워진다`,
      db.site_settings.find(s => s.key === target.key).value === "" &&
      !storage.has(`${target.bucket}/${newPath}`)
    );

    check(
      `[${target.name}] 미리보기가 빈 자리로 돌아간다`,
      await page.evaluate((id) => {
        const img = document.getElementById(id);
        return !!img && img.hidden;
      }, target.preview)
    );

    await ctx.close();
  }


  /* 저장 실패 — 방금 올린 파일을 남겨 재시도할 수 있다 */
  {
    const db = makeDb();
    const storage = new Set();
    const { ctx, page } = await openSettings(browser, {
      db,
      storageObjects: storage,
      settingsWriteFails: true
    });

    await openTab(page, "HOME");
    await attach(page, "faviconFileInput");

    await page.click("#faviconSaveButton");
    await page.waitForTimeout(900);

    check(
      "[favicon] 저장이 실패하면 안내가 뜬다",
      (await page.textContent("#faviconSaveMessage") || "").includes("실패")
    );

    check(
      "[favicon] 저장이 실패해도 올린 파일은 남는다(다시 save 가능)",
      storage.size === 1
    );

    check(
      "[favicon] 저장이 실패하면 site_settings 값도 그대로다",
      !db.site_settings.some(s => s.key === "favicon_url")
    );

    await ctx.close();
  }
}


/* =========================================================
   2. etc — HOME > ETC 보호 설정
========================================================== */

async function runEtc(browser) {
  console.log("\n[etc] HOME > ETC 보호 설정");

  const db = makeDb({
    settings: [
      { user_id: OWNER_ID, key: "block_text_copy", value: "on" },
      { user_id: OWNER_ID, key: "block_context_menu", value: "off" },
      { user_id: OWNER_ID, key: "strip_image_exif", value: "off" }
    ]
  });

  const { ctx, page } = await openSettings(browser, { db });

  await openTab(page, "HOME");

  const state = await page.evaluate(() => ({
    exif: document.getElementById("stripImageExifToggle")?.checked,
    menu: document.getElementById("blockContextMenuToggle")?.checked,
    copy: document.getElementById("blockTextCopyToggle")?.checked
  }));

  check(
    "[etc] 저장된 값이 체크박스에 반영된다",
    state.copy === true && state.menu === false && state.exif === false,
    JSON.stringify(state)
  );

  await page.click("#stripImageExifToggle");
  await page.click("#blockTextCopyToggle");

  await page.click("#etcSaveButton");
  await page.waitForTimeout(900);

  const saved = Object.fromEntries(
    db.site_settings
      .filter(s => ["strip_image_exif", "block_context_menu", "block_text_copy"].includes(s.key))
      .map(s => [s.key, s.value])
  );

  check(
    "[etc] 켠 것은 on, 끈 것은 off로 저장된다",
    saved.strip_image_exif === "on" &&
    saved.block_text_copy === "off" &&
    saved.block_context_menu === "off",
    JSON.stringify(saved)
  );

  check(
    "[etc] 저장 완료 안내가 뜬다",
    (await page.textContent("#etcSaveMessage") || "").includes("saved")
  );

  await ctx.close();
}


/* =========================================================
   3. tab — 화면 복귀 뒤에도 보던 탭 그대로

   onAuthStateChange(토큰 갱신 / 다른 앱에서 돌아옴)가 부르는 것이
   restoreAdminView()다 — 그 경로를 그대로 부른다.
========================================================== */

async function runTab(browser) {
  console.log("\n[tab] 설정 안쪽 탭 유지");

  const { ctx, page } = await openSettings(browser);

  const activeTab = () =>
    page.evaluate(() => {
      const active = document.querySelector(".settings-tab.active");
      return active ? (active.textContent || "").trim() : null;
    });

  check(
    "[tab] 처음에는 PROFILE이다",
    (await activeTab()) === "PROFILE"
  );

  await openTab(page, "CATEGORY");

  check(
    "[tab] 탭을 누르면 그 탭이 열린다",
    (await activeTab()) === "CATEGORY"
  );

  /* 다른 앱에 갔다 돌아온 것과 같은 경로 */
  await page.evaluate(() => restoreAdminView());
  await page.waitForTimeout(400);

  check(
    "[tab] ★ 화면이 복귀해도 보던 탭 그대로다",
    (await activeTab()) === "CATEGORY",
    String(await activeTab())
  );

  check(
    "[tab] 그 탭의 내용이 실제로 보인다",
    await page.evaluate(() => {
      const panel = document.getElementById("categorySettingsPanel");
      return !!panel && !panel.hidden;
    })
  );

  await openTab(page, "HOME");
  await page.evaluate(() => restoreAdminView());
  await page.waitForTimeout(400);

  check(
    "[tab] 다른 탭에서도 마찬가지다",
    (await activeTab()) === "HOME"
  );

  await ctx.close();
}

async function runCategory(browser) {
  const requests = [];
  const db = makeDb();
  const { ctx, page } = await openSettings(browser, { db, recorder: requests });
  await openTab(page, 'CATEGORY');
  const select = page.locator('.category-type-select').first();
  check('[category] 종류 post/gallery/banner 제공', (await select.locator('option').evaluateAll(nodes => nodes.map(n => n.value))).join(',') === 'post,gallery,banner');
  await select.selectOption('gallery');
  check('[category] 별도 표시 선택 제거', await page.locator('.category-display-row option[value="list"]').count() === 0 && await page.locator('.category-display-row option[value="gallery"]').count() === 0);
  await page.click('#categorySaveButton');
  await page.waitForTimeout(800);
  const updates = requests.filter(r => r.method === 'PATCH' && r.path.includes('/rest/v1/categories'))
    .map(r => JSON.parse(r.body || '{}'));
  check('[category] gallery 타입과 호환 mirror 저장', updates.some(row => row.type === 'gallery' && row.list_style === 'gallery'));
  await ctx.close();
}


/* =========================================================
   MAIN
========================================================== */

(async () => {

  const server = await startServer();
  console.log(`정적 서버: http://localhost:${PORT}`);

  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  try {

    if (shouldRun("image")) await runImage(browser);
    if (shouldRun("etc")) await runEtc(browser);
    if (shouldRun("tab")) await runTab(browser);
    if (shouldRun("category")) await runCategory(browser);

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
