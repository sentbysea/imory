/* =========================================================
   Skin Studio 파일 UX — Export / Import 파일 선택 / drag & drop E2E

   studio/studio-lifecycle-scenario.html?scenario=y(HOME/CATEGORY/
   POST 3종 + imageSlots 2개 + save_skin_draft_version mock)를
   실제 URL로 띄워 studio-preview.js / editor/import-editor.js /
   skin/skin-package-export.js / skin/skin-package-import.js를
   저장소의 실제 파일 그대로 구동한다. Supabase는 in-memory mock.

   검사 범위
     export    Export 버튼 활성화 · 실제 브라우저 다운로드 · 파일
               이름 · allowlist 필드만 있고 DB 전용 키가 없다 ·
               working draft와 내용 일치 · dirty가 되지 않는다
     roundtrip 내려받은 파일을 "JSON 파일 선택"으로 다시 Import →
               자동 검증 → Apply → working SkinPackage가 export한
               JSON과 구조 동일 · 다시 Export하면 바이트 동일 ·
               Preview가 그 스킨으로 그려진다 · Save가 그 내용을
               RPC로 보낸다
     dragdrop  modal 위 dragenter 강조 · .json drop → textarea +
               자동 검증 · 비-json drop은 거부하고 textarea 보존 ·
               modal 밖(overlay) drop은 아무 일도 없고 페이지도
               떠나지 않는다
     paste     기존 붙여넣기 경로 회귀 — Validate → Apply,
               다시 편집하면 Apply 잠김
     legacy    templates 없는 legacy HOME-only draft(scenario a)는
               내보내되 missingTemplates를 toast로 알린다

   ★ 실행 방법
     node studio/studio-file-ux-e2e-test.mjs
     node studio/studio-file-ux-e2e-test.mjs --browser=webkit
     node studio/studio-file-ux-e2e-test.mjs --only=roundtrip
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8943;
const SCENARIO_URL = (s) => `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=${s}`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const shouldRun = (name) => !ONLY || ONLY === name;

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `\n        ${detail}` : ""}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const EXPORT_KEYS = ["schemaVersion", "templates", "css", "imageSlots", "regions", "metadata"];
const DB_ONLY_KEYS = ["id", "user_id", "created_at", "updated_at", "version_id", "skin_id", "owner_id"];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}


/* =========================================================
   정적 서버 — 저장소의 실제 파일을 그대로 서빙한다
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

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx");
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
   페이지 열기
========================================================== */

const PRE_EXISTING_CONSOLE_ERROR_PATTERN = /image library probe failed/;

const consoleErrors = [];

async function openStudio(context, scenario) {

  const page = await context.newPage();

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    if (PRE_EXISTING_CONSOLE_ERROR_PATTERN.test(msg.text())) return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  await page.goto(SCENARIO_URL(scenario || "y"), { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  await page.waitForSelector("#studioPreviewFrame");

  return page;

}


async function workingPackage(page) {
  return page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage);
}

async function workingIsDirty(page) {
  return page.evaluate(() => window.getStudioAiWorkingState().isDirty);
}


/*
  Export 버튼을 눌러 실제 브라우저 다운로드를 받아 파일 내용과
  제안 파일 이름을 돌려준다 — 페이지 코드가 만든 Blob URL을 그대로
  타는 진짜 다운로드 경로다.
*/
async function exportViaButton(page) {
  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.click("#studioExportButton");
  const download = await downloadPromise;
  const filePath = await download.path();
  return {
    filename: download.suggestedFilename(),
    text: fs.readFileSync(filePath, "utf8")
  };
}


async function openImportEditor(page) {
  await page.click("#studioImportButton");
  await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });
}

/* overlay는 항상 DOM에 있고 hidden 속성만 바뀐다 — visible 대기가 아니라 속성으로 본다 */
async function waitForImportClosed(page) {
  await page.waitForFunction(
    () => { const el = document.querySelector(".import-editor-overlay"); return el && el.hidden === true; },
    null,
    { timeout: 5000 }
  );
}

async function importMessage(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".import-editor-message");
    return {
      text: el ? el.textContent : "",
      isError: !!(el && el.classList.contains("import-editor-message--error"))
    };
  });
}

async function waitForImportValidated(page) {
  await page.waitForFunction(
    () => {
      const msg = document.querySelector(".import-editor-message");
      const apply = document.querySelector(".import-editor-button--primary");
      return msg && msg.textContent.includes("검증 성공") && apply && !apply.disabled;
    },
    null,
    { timeout: 10000 }
  );
}

/*
  브라우저 안에서 DataTransfer + File을 만들어 drag 이벤트를 보낸다 —
  페이지 코드가 보는 event.dataTransfer(types / files)는 진짜 OS
  drag와 같다. 반환값은 drop의 defaultPrevented.
*/
async function dropFileOn(page, selector, file, options) {
  return page.evaluate(([sel, f, opts]) => {

    const target = document.querySelector(sel);
    if (!target) throw new Error("drop target not found: " + sel);

    const dt = new DataTransfer();
    if (f) {
      dt.items.add(new File([f.content], f.name, { type: f.type }));
    } else if (opts && opts.text) {
      dt.setData("text/plain", opts.text);
    }

    const fire = (name) => {
      const ev = new DragEvent(name, { dataTransfer: dt, bubbles: true, cancelable: true });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };

    fire("dragenter");
    fire("dragover");

    const modal = document.querySelector(".import-editor-modal");
    const highlightedDuringDrag = !!(modal && modal.classList.contains("import-editor-modal--dragover"));

    if (opts && opts.leaveOnly) {
      fire("dragleave");
      return {
        highlightedDuringDrag,
        highlightedAfter: !!(modal && modal.classList.contains("import-editor-modal--dragover"))
      };
    }

    const prevented = fire("drop");

    return {
      prevented,
      highlightedDuringDrag,
      highlightedAfter: !!(modal && modal.classList.contains("import-editor-modal--dragover"))
    };

  }, [selector, file || null, options || null]);
}


/* =========================================================
   A. export
========================================================== */

async function runExport(context) {

  const page = await openStudio(context, "y");

  try {

    const enabled = await page.$eval("#studioExportButton", el => !el.disabled);
    record("E1. working draft가 있으면 Export 버튼이 활성화된다", enabled);

    const before = await workingPackage(page);
    const dirtyBefore = await workingIsDirty(page);

    const { filename, text } = await exportViaButton(page);

    record(
      "E2. Export 클릭 → 실제 브라우저 다운로드(.json, imory-skin-<날짜>)",
      /^imory-skin-(.+-)?\d{8}\.json$/.test(filename),
      filename
    );

    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* 아래에서 실패 처리 */ }

    record("E3. 내려받은 파일이 JSON으로 파싱된다 + 마지막 개행", !!parsed && text.endsWith("\n"));

    const topKeys = parsed ? Object.keys(parsed) : [];
    record(
      "E4. 최상위 키가 SkinPackage 계약 필드만이다(schemaVersion/templates/css/imageSlots/regions/metadata)",
      deepEqual([...topKeys].sort(), [...EXPORT_KEYS].sort()),
      topKeys.join(",")
    );

    const leakedDbKeys = DB_ONLY_KEYS.filter(k => parsed && Object.prototype.hasOwnProperty.call(parsed, k));
    record("E5. DB 전용 키(id/user_id/created_at/…)가 없다", leakedDbKeys.length === 0, leakedDbKeys.join(","));

    const templateKeys = parsed ? Object.keys(parsed.templates) : [];
    const templateShapeOk = parsed && templateKeys.every(k => {
      const t = parsed.templates[k];
      const keys = Object.keys(t);
      return typeof t.html === "string" && keys.every(x => x === "html" || x === "css");
    });
    record(
      "E6. templates.<page>는 html(+css)만 갖는다",
      deepEqual([...templateKeys].sort(), ["category", "home", "post"]) && templateShapeOk,
      templateKeys.join(",")
    );

    record(
      "E7. 내보낸 내용이 working draft와 같다(html/css/imageSlots/regions/metadata)",
      parsed &&
      parsed.templates.home.html === before.templates.home.html &&
      parsed.templates.category.html === before.templates.category.html &&
      parsed.templates.post.html === before.templates.post.html &&
      parsed.css === before.css &&
      deepEqual(parsed.imageSlots, before.imageSlots) &&
      deepEqual(parsed.regions, before.regions) &&
      deepEqual(parsed.metadata, before.metadata)
    );

    const builtInPage = await page.evaluate(
      () => window.buildSkinPackageExport(window.getStudioAiWorkingState({ includePackage: true }).skinPackage)
    );
    record(
      "E8. 파일 내용 == buildSkinPackageExport(working).skinPackage (다운로드 경로가 변환 결과를 그대로 쓴다)",
      builtInPage.ok && deepEqual(builtInPage.skinPackage, parsed) && builtInPage.missingTemplates.length === 0
    );

    const after = await workingPackage(page);
    const dirtyAfter = await workingIsDirty(page);
    record(
      "E9. Export는 읽기 전용 — working draft와 dirty가 바뀌지 않는다",
      deepEqual(before, after) && dirtyBefore === dirtyAfter,
      `dirty ${dirtyBefore} → ${dirtyAfter}`
    );

    const toast = await page.evaluate(() => {
      const el = document.getElementById("studioToast");
      return el ? el.textContent : "";
    });
    record("E10. 성공 toast에 파일 이름이 보인다", toast.includes(filename), toast);

    /* DB 전용 값이 content 안에 섞여 있어도 파일에 실리지 않는다 —
       순수 변환 함수를 페이지 안에서 직접 검증한다. */
    const contaminated = await page.evaluate(() => {
      const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
      pkg.id = "row-1";
      pkg.user_id = "user-y";
      pkg.created_at = "2026-01-01T00:00:00Z";
      pkg.version_id = "draft-y1";
      pkg.templates.home.owner_id = "user-y";
      pkg.templates.home.created_at = "x";
      return window.buildSkinPackageExport(pkg);
    });
    const contaminatedKeys = Object.keys(contaminated.skinPackage);
    record(
      "E11. content에 DB 컬럼이 섞여 있어도 allowlist 밖 키는 내보내지 않는다(최상위/템플릿 모두)",
      contaminated.ok &&
      deepEqual([...contaminatedKeys].sort(), [...EXPORT_KEYS].sort()) &&
      deepEqual(Object.keys(contaminated.skinPackage.templates.home), ["html"]),
      contaminatedKeys.join(",")
    );

  } finally {
    await page.close();
  }

}


/* =========================================================
   B. roundtrip — export → 파일 선택 Import → 구조 동일
========================================================== */

async function runRoundtrip(context) {

  const page = await openStudio(context, "y");

  try {

    const original = await workingPackage(page);
    const first = await exportViaButton(page);
    const exported = JSON.parse(first.text);

    await openImportEditor(page);

    /* 붙여넣기 없이 파일 선택만으로 — hidden input에 파일을 넣는다 */
    await page.setInputFiles(".import-editor-file-input", {
      name: first.filename,
      mimeType: "application/json",
      buffer: Buffer.from(first.text, "utf8")
    });

    await waitForImportValidated(page);

    const textareaValue = await page.$eval(".import-editor-textarea", el => el.value);
    record("R1. 파일 선택 → textarea에 파일 내용 그대로 + 자동 검증 성공 + Apply 활성화", textareaValue === first.text);

    await page.click(".import-editor-button--primary");
    await waitForImportClosed(page);

    const reimported = await workingPackage(page);

    record(
      "R2. Import 후 working SkinPackage가 export한 JSON과 구조 동일(deep equal)",
      deepEqual(reimported, exported),
      deepEqual(reimported, exported) ? "" : JSON.stringify(reimported).slice(0, 300)
    );

    record(
      "R3. 원본 working draft와도 템플릿/css/imageSlots가 동일(왕복 손실 없음)",
      reimported.templates.home.html === original.templates.home.html &&
      reimported.templates.category.html === original.templates.category.html &&
      reimported.templates.post.html === original.templates.post.html &&
      reimported.css === original.css &&
      deepEqual(reimported.imageSlots, original.imageSlots) &&
      deepEqual(reimported.metadata, original.metadata)
    );

    const second = await exportViaButton(page);
    record("R4. 다시 Export하면 파일 내용이 바이트 단위로 같다(멱등)", second.text === first.text);

    const dirty = await workingIsDirty(page);
    record("R5. Import 후 dirty=true(기존 Import 계약 유지)", dirty === true);

    const homeMarker = await page.frameLocator("#studioPreviewFrame").locator(".y-home .y-heading").count();
    record("R6. Preview가 Import된 스킨의 HOME을 그린다", homeMarker === 1);

    /* Save — 기존 저장 경로 회귀 */
    await page.click("#studioSaveButton");
    await page.waitForFunction(
      () => Array.isArray(window.__savedDraftCallsY) && window.__savedDraftCallsY.length === 1,
      null,
      { timeout: 10000 }
    );
    const saved = await page.evaluate(() => window.__savedDraftCallsY[0].p_content);
    record(
      "R7. Save가 Import된 내용을 RPC로 보낸다(templates/css/imageSlots 동일)",
      saved &&
      saved.templates.home.html === exported.templates.home.html &&
      saved.templates.category.html === exported.templates.category.html &&
      saved.templates.post.html === exported.templates.post.html &&
      saved.css === exported.css &&
      deepEqual(saved.imageSlots, exported.imageSlots)
    );

    await page.waitForFunction(
      () => window.getStudioAiWorkingState().isDirty === false,
      null,
      { timeout: 10000 }
    );
    record("R8. Save 후 dirty=false", true);

    /* 저장소 fixture(실제 스킨 JSON)도 파일 선택으로 들어간다 */
    const fixturePath = path.join(ROOT, "skin", "test-skins", "imory-quiet-frame-v4.json");
    const fixtureText = fs.readFileSync(fixturePath, "utf8");
    const fixture = JSON.parse(fixtureText);

    await openImportEditor(page);
    await page.setInputFiles(".import-editor-file-input", {
      name: "imory-quiet-frame-v4.json",
      mimeType: "application/json",
      buffer: Buffer.from(fixtureText, "utf8")
    });
    await waitForImportValidated(page);
    await page.click(".import-editor-button--primary");
    await waitForImportClosed(page);

    const afterFixture = await workingPackage(page);
    const fixtureExport = await exportViaButton(page);
    const fixtureExported = JSON.parse(fixtureExport.text);

    record(
      "R9. 저장소 스킨 파일(quiet-frame v4, banner 포함) 파일 Import → Export가 같은 templates(4종)/css/metadata를 낸다",
      deepEqual(Object.keys(afterFixture.templates).sort(), ["banner", "category", "home", "post"]) &&
      deepEqual(Object.keys(fixtureExported.templates).sort(), ["banner", "category", "home", "post"]) &&
      fixtureExported.css === fixture.css &&
      deepEqual(fixtureExported.metadata, fixture.metadata) &&
      deepEqual(fixtureExported.imageSlots, fixture.imageSlots),
      /^imory-skin-imory-quiet-frame-v4-\d{8}\.json$/.test(fixtureExport.filename) ? "" : fixtureExport.filename
    );

    record(
      "R10. metadata.title이 있으면 파일 이름에 slug가 들어간다",
      /^imory-skin-imory-quiet-frame-v4-\d{8}\.json$/.test(fixtureExport.filename),
      fixtureExport.filename
    );

  } finally {
    await page.close();
  }

}


/* =========================================================
   C. dragdrop — Import modal
========================================================== */

async function runDragDrop(context) {

  const page = await openStudio(context, "y");

  try {

    const exportedText = (await exportViaButton(page)).text;
    const exported = JSON.parse(exportedText);

    await openImportEditor(page);

    const urlBefore = page.url();

    /* dragenter/leave — 강조만 붙었다 떨어진다 */
    const leave = await dropFileOn(page, ".import-editor-modal",
      { name: "skin.json", type: "application/json", content: exportedText },
      { leaveOnly: true });
    record(
      "D1. 파일을 modal 위로 끌면 강조(--dragover)가 붙고, 벗어나면 떨어진다",
      leave.highlightedDuringDrag === true && leave.highlightedAfter === false,
      JSON.stringify(leave)
    );

    /* 미리 붙여넣은 내용이 있는 상태 — 잘못된 drop이 그것을 지우지 않아야 한다 */
    await page.fill(".import-editor-textarea", "{ \"draft\": true }");

    const badDrop = await dropFileOn(page, ".import-editor-textarea",
      { name: "notes.txt", type: "text/plain", content: "hello" });
    const afterBad = await importMessage(page);
    const textareaAfterBad = await page.$eval(".import-editor-textarea", el => el.value);
    record(
      "D2. .json이 아닌 파일 drop은 거부 메시지만 보이고 textarea 내용은 그대로다(기본 동작도 막는다)",
      badDrop.prevented === true &&
      afterBad.isError === true && afterBad.text.includes(".json 파일만") &&
      textareaAfterBad === "{ \"draft\": true }" &&
      badDrop.highlightedAfter === false,
      JSON.stringify({ badDrop, afterBad })
    );

    /* 텍스트만 있는 drag는 가로채지 않는다(브라우저 기본 동작) */
    const textDrop = await dropFileOn(page, ".import-editor-textarea", null, { text: "plain text" });
    record("D3. 파일 없는 텍스트 drop은 가로채지 않는다", textDrop.prevented === false, JSON.stringify(textDrop));

    /* 진짜 .json drop — textarea(자식) 위에 놓아도 modal이 받는다 */
    const goodDrop = await dropFileOn(page, ".import-editor-textarea",
      { name: "skin.json", type: "application/json", content: exportedText });
    await waitForImportValidated(page);
    const textareaAfterGood = await page.$eval(".import-editor-textarea", el => el.value);
    record(
      "D4. .json drop → textarea에 파일 내용 + 자동 검증 성공 + Apply 활성화, 강조 해제",
      goodDrop.prevented === true && textareaAfterGood === exportedText && goodDrop.highlightedAfter === false,
      JSON.stringify(goodDrop)
    );

    /* 확장자만 .json이고 type이 비어 있는 파일(Windows 등)도 받는다 */
    const noTypeDrop = await dropFileOn(page, ".import-editor-modal",
      { name: "skin2.json", type: "", content: exportedText });
    await waitForImportValidated(page);
    record("D5. MIME type이 비어 있어도 확장자가 .json이면 받는다", noTypeDrop.prevented === true);

    /* modal 밖(overlay) drop — 아무 일도 없고 페이지도 안 떠난다 */
    await page.fill(".import-editor-textarea", "outside-test");
    const outside = await dropFileOn(page, ".import-editor-overlay",
      { name: "skin.json", type: "application/json", content: exportedText });
    await sleep(200);
    const textareaAfterOutside = await page.$eval(".import-editor-textarea", el => el.value);
    record(
      "D6. modal 밖(overlay)에 놓으면 기본 동작만 막고(페이지 이동 없음) 내용은 바뀌지 않는다",
      outside.prevented === true && textareaAfterOutside === "outside-test" && page.url() === urlBefore,
      JSON.stringify(outside)
    );

    const stillOpen = await page.$eval(".import-editor-overlay", el => !el.hidden);
    record("D7. drop 과정 내내 modal이 열려 있다", stillOpen);

    /* 다시 유효 drop 후 Apply까지 — drop 경로도 붙여넣기와 같은 Apply를 탄다 */
    await dropFileOn(page, ".import-editor-modal",
      { name: "skin.json", type: "application/json", content: exportedText });
    await waitForImportValidated(page);
    await page.click(".import-editor-button--primary");
    await waitForImportClosed(page);
    const applied = await workingPackage(page);
    record("D8. drop으로 들어온 JSON도 Apply to Draft로 working draft에 반영된다", deepEqual(applied, exported));

    /* 큰 파일 상한 */
    await openImportEditor(page);
    const huge = await page.evaluate(() => {
      const target = document.querySelector(".import-editor-modal");
      const dt = new DataTransfer();
      /* 실제 바이트를 만들지 않고 size만 크게 — File 생성자에 6MB Blob */
      dt.items.add(new File([new Uint8Array(6 * 1024 * 1024)], "huge.json", { type: "application/json" }));
      const ev = new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    await sleep(100);
    const hugeMsg = await importMessage(page);
    record("D9. 5MB를 넘는 파일은 읽지 않고 거부한다", huge === true && hugeMsg.isError && hugeMsg.text.includes("너무 큽니다"), hugeMsg.text);

    await page.click(".import-editor-close");
    await waitForImportClosed(page);

  } finally {
    await page.close();
  }

}


/* =========================================================
   D. paste — 기존 붙여넣기 경로 회귀
========================================================== */

const PASTE_PACKAGE = {
  schemaVersion: 1,
  templates: {
    home: { html: '<div class="fileux-home"><h1 data-imory-bind="site.title"></h1></div>' },
    category: { html: '<div class="fileux-category"><h1 data-imory-bind="category.name"></h1></div>' },
    post: { html: '<div class="fileux-post"><div data-imory-region="post-body"></div></div>' }
  },
  css: ".fileux-home { color: navy; }",
  imageSlots: [],
  regions: [],
  metadata: { title: "File UX paste fixture" }
};

async function runPaste(context) {

  const page = await openStudio(context, "y");

  try {

    await openImportEditor(page);

    const fileRowVisible = await page.$eval(".import-editor-file-pick", el => !el.hidden && el.textContent.includes("JSON 파일 선택"));
    record("P1. 붙여넣기 textarea 위에 '파일 선택' 입구가 함께 보인다", fileRowVisible);

    await page.fill(".import-editor-textarea", JSON.stringify(PASTE_PACKAGE));

    const applyDisabledBeforeValidate = await page.$eval(".import-editor-button--primary", el => el.disabled);
    record("P2. 붙여넣기만으로는 Apply가 잠겨 있다(검증 필수)", applyDisabledBeforeValidate === true);

    await page.click(".import-editor-actions .import-editor-button:nth-of-type(2)");
    await waitForImportValidated(page);
    record("P3. Validate → 검증 성공 + Apply 활성화", true);

    /* 다시 편집하면 Apply 잠김 */
    await page.type(".import-editor-textarea", " ");
    const applyDisabledAfterEdit = await page.$eval(".import-editor-button--primary", el => el.disabled);
    record("P4. 검증 뒤 textarea를 고치면 Apply가 다시 잠긴다", applyDisabledAfterEdit === true);

    await page.click(".import-editor-actions .import-editor-button:nth-of-type(2)");
    await waitForImportValidated(page);
    await page.click(".import-editor-button--primary");
    await waitForImportClosed(page);

    const applied = await workingPackage(page);
    record("P5. 붙여넣기 Import → Apply가 working draft에 반영된다", deepEqual(applied, PASTE_PACKAGE));

    await page.frameLocator("#studioPreviewFrame").locator(".fileux-home").waitFor({ timeout: 10000 });
    record("P6. Preview가 붙여넣기로 Import된 HOME을 그린다", true);

    const exp = await exportViaButton(page);
    record(
      "P7. 붙여넣기로 들어온 SkinPackage를 Export하면 같은 구조가 나온다",
      deepEqual(JSON.parse(exp.text), PASTE_PACKAGE) && /^imory-skin-file-ux-paste-fixture-\d{8}\.json$/.test(exp.filename),
      exp.filename
    );

  } finally {
    await page.close();
  }

}


/* =========================================================
   E. legacy — templates 없는 HOME-only draft(scenario a)
========================================================== */

async function runLegacy(context) {

  const page = await openStudio(context, "a");

  try {

    const working = await workingPackage(page);
    record("L0. (전제) scenario a는 templates가 없는 legacy draft다", !working.templates && typeof working.html === "string");

    const { filename, text } = await exportViaButton(page);
    const parsed = JSON.parse(text);

    record(
      "L1. legacy html이 templates.home.html로 내보내진다 + 최상위 html 키는 없다",
      parsed.templates && parsed.templates.home && parsed.templates.home.html === working.html &&
      !Object.prototype.hasOwnProperty.call(parsed, "html") &&
      deepEqual(Object.keys(parsed).sort(), [...EXPORT_KEYS].sort()),
      filename
    );

    const toast = await page.evaluate(() => document.getElementById("studioToast").textContent);
    record(
      "L2. toast가 다시 Import하려면 category/post를 채워야 한다고 알린다",
      toast.includes(filename) && toast.includes("templates.category/post"),
      toast
    );

    /* 그대로 Import하면 기존 required-template 검증이 막는다(계약 유지) */
    await openImportEditor(page);
    await page.setInputFiles(".import-editor-file-input", {
      name: filename, mimeType: "application/json", buffer: Buffer.from(text, "utf8")
    });
    await page.waitForFunction(
      () => {
        const msg = document.querySelector(".import-editor-message");
        return msg && msg.classList.contains("import-editor-message--error");
      },
      null,
      { timeout: 10000 }
    );
    const msg = await importMessage(page);
    record("L3. 그대로 다시 Import하면 templates.category.html 필요 검증에 걸린다", msg.text.includes("templates.category.html"), msg.text);

    await page.click(".import-editor-close");

  } finally {
    await page.close();
  }

}


/* =========================================================
   main
========================================================== */

const server = await startServer();
const playwright = await loadPlaywright(BROWSER);
const browser = await playwright[BROWSER].launch();
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });

console.log(`\n=== SKIN STUDIO FILE UX E2E (${BROWSER}) ===`);

try {

  if (shouldRun("export")) await runExport(context);
  if (shouldRun("roundtrip")) await runRoundtrip(context);
  if (shouldRun("dragdrop")) await runDragDrop(context);
  if (shouldRun("paste")) await runPaste(context);
  if (shouldRun("legacy")) await runLegacy(context);

} finally {

  await context.close();
  await browser.close();
  server.close();

}

record(
  "Z1. 새로운 console/page 오류가 없다",
  consoleErrors.length === 0,
  consoleErrors.join("\n        ")
);

const passed = results.filter(r => r.pass).length;

console.log(`\n=== ${passed}/${results.length} PASS ===`);

if (passed !== results.length) {
  process.exitCode = 1;
}
