/* =========================================================
   IMPORT-CSS-IMAGE-1 — CSS Import 판정 · 오류 위치 · 부분 복구 ·
   이미지 슬롯 자동 정리 · AI 첨부 이미지 슬롯 E2E

   studio/studio-lifecycle-scenario.html?scenario=y(imageLibrary mock 이
   있는 시나리오)를 띄워 **저장소의 실제 파일**로 돈다 —
   skin/skin-css-validate.js(analyzeSkinCss) · skin/skin-package-images.js
   · skin/skin-package-import.js(runSkinPackageContentPipeline) ·
   studio/editor/import-editor.js · studio/editor/code-editor.js ·
   studio/ai/studio-ai-panel.js · studio/studio-preview.js.
   Supabase 는 in-memory mock, /api/skin-ai 는 고정 응답으로 가로챈다
   (모델이 첨부 자리표시자를 쓴 결과를 흉내 낸다), 내 이미지 업로드는
   window.skinImageLibrary.upload 를 바꿔 끼운다.

   절
     css      analyzeSkinCss 판정 — 첨부 스킨(FOREVER, MY FOE)의 실제
              오류 위치 · **브라우저가 읽은 CSSOM 이 원문과 잘라낸
              결과에서 똑같다**(선언 하나만 뺀 것이 브라우저 동작과
              같다는 증거) · 현대 CSS 통과 · 줄/열 · 선언만 제외 ·
              중괄호 차단 · 보안 차단(@import/javascript:/expression) ·
              허용 안 되는 주소(data:/http:/custom property/image-set)
     import   Import 창 — FOE 파일 Validate/Apply · 목록에 줄·열과 수정
              방법 · Apply 결과 = Validate 결과 · Preview 에 스킨 CSS 적용
              · Export → 다시 Import 왕복
     errors   Import 창 오류 — 중괄호 · @import · 오류 여러 개(첫 오류 +
              개수) · Apply 잠김
     code     Code 적용 — 같은 파이프라인(차단이면 모달 유지 + 위치,
              선언 하나면 빼고 적용) · HTML 의 images.* 로 슬롯 생성
     slots    슬롯 정규화 — 선언 누락 복구 · 중복 병합 · 이름 규칙 ·
              기존 슬롯 보존 · 첨부 자리표시자(첨부 없음 = 빈 슬롯
              안내) · 아이콘/data: 는 슬롯이 아니다 · Images 패널
     ai       AI 첨부 — 한 장 → 슬롯 하나 + 업로드 + 연결 + Preview 에
              보임 · crop/object-position 유지 · Images 패널에서 변경 ·
              Undo/Redo 한 칸 · 두 장 → 순서대로 · 업로드 실패 = 빈 슬롯
              + 스킨은 적용 · Export → Import 뒤 연결 유지

   실행
     node studio/studio-import-css-image-e2e-test.mjs
     node studio/studio-import-css-image-e2e-test.mjs --browser=webkit
     node studio/studio-import-css-image-e2e-test.mjs --only=ai
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
const PORT = 8973;
const SCENARIO_URL = (s) => `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=${s}`;

const FOE_PATH = path.join(ROOT, "skin", "test-skins", "imory-skin-forever-my-foe.json");
const FOE_TEXT = fs.readFileSync(FOE_PATH, "utf8");
const FOE = JSON.parse(FOE_TEXT);

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


/* =========================================================
   실제 PNG — 첨부/업로드 결과가 진짜로 디코드되는지 재려면 바이트가
   있어야 한다(로드 실패한 <img> 는 naturalWidth 0).
========================================================== */

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) { row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2]; }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const PORTRAIT_PNG = makePng(300, 400, [40, 120, 110]);   /* 3:4 */
const WIDE_PNG = makePng(320, 180, [180, 150, 90]);        /* 16:9 */


/* =========================================================
   정적 서버 · playwright
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
      res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream", "Cache-Control": "no-store" });
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
    for (const dir of fs.readdirSync(npxCache)) candidates.push(path.join(npxCache, dir, "node_modules"));
  }
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  candidates.push(path.join(ROOT, "node_modules"));
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try { const probe = await mod[browserName].launch(); await probe.close(); return mod; } catch { /* next */ }
  }
  throw new Error(`playwright ${browserName}을(를) 실행할 수 없습니다.`);
}


/* =========================================================
   페이지
========================================================== */

const PRE_EXISTING_CONSOLE_ERROR_PATTERN = /image library probe failed/;
const consoleErrors = [];

async function openStudio(context, scenario) {

  const page = await context.newPage();

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    if (PRE_EXISTING_CONSOLE_ERROR_PATTERN.test(msg.text())) return;
    /* 이미지 주소는 이 테스트가 route 로만 준다 — 슬롯 기본값 등은 404 가 날 수 있다 */
    if (/Failed to load resource/.test(msg.text())) return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  /* 업로드 결과 주소 · 시나리오의 기본 슬롯 이미지 — 진짜 바이트를 준다 */
  await page.route("https://example.com/**", (route) => {
    const url = route.request().url();
    const body = /wide/.test(url) ? WIDE_PNG : PORTRAIT_PNG;
    route.fulfill({ status: 200, contentType: "image/png", body });
  });

  await page.goto(SCENARIO_URL(scenario || "y"), { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true &&
      typeof window.analyzeSkinCss === "function",
    null,
    { timeout: 20000 }
  );

  await page.waitForSelector("#studioPreviewFrame");

  return page;

}

async function workingState(page) {
  return page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }));
}

async function openImportEditor(page) {
  await page.click("#studioImportButton");
  await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });
}

async function waitForImportClosed(page) {
  await page.waitForFunction(
    () => { const el = document.querySelector(".import-editor-overlay"); return el && el.hidden === true; },
    null,
    { timeout: 5000 }
  );
}

async function validateInImport(page, text) {
  await page.fill(".import-editor-textarea", text);
  await page.click(".import-editor-actions .import-editor-button:nth-child(2)");
  await page.waitForFunction(
    () => {
      const msg = document.querySelector(".import-editor-message");
      return msg && msg.textContent && msg.textContent !== "확인하는 중...";
    },
    null,
    { timeout: 15000 }
  );
  return page.evaluate(() => {
    const msg = document.querySelector(".import-editor-message");
    const report = document.querySelector(".import-editor-report");
    const apply = document.querySelector(".import-editor-button--primary");
    return {
      message: msg.textContent,
      isError: msg.classList.contains("import-editor-message--error"),
      applyDisabled: apply.disabled,
      reportHidden: report ? report.hidden : true,
      groups: report ? Array.from(report.querySelectorAll(".import-editor-report-group")).map((g) => ({
        kind: (g.className.match(/--(\w+)/) || [])[1],
        title: g.querySelector(".import-editor-report-group-title").textContent,
        items: Array.from(g.querySelectorAll(".import-editor-report-item")).map((li) => li.textContent)
      })) : []
    };
  });
}

async function applyImport(page) {
  await page.click(".import-editor-button--primary");
  await waitForImportClosed(page);
}

async function previewEval(page, fn, arg) {
  return page.evaluate(([source, a]) => {
    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame && frame.contentDocument;
    // eslint-disable-next-line no-new-func
    return new Function("doc", "arg", "win", source)(doc, a, frame && frame.contentWindow);
  }, [`return (${fn.toString()})(doc, arg, win);`, arg === undefined ? null : arg]);
}

async function waitPreview(page, selector, timeout = 10000) {
  await page.waitForFunction(
    (sel) => {
      const frame = document.getElementById("studioPreviewFrame");
      const doc = frame && frame.contentDocument;
      return !!(doc && doc.querySelector(sel));
    },
    selector,
    { timeout }
  );
}

function foeWith(changes) {
  const pkg = JSON.parse(FOE_TEXT);
  changes(pkg);
  return JSON.stringify(pkg);
}

/* 시나리오 y 의 working draft 를 바탕으로 한 작은 SkinPackage */
async function scenarioPackage(page) {
  const state = await workingState(page);
  return JSON.parse(JSON.stringify(state.skinPackage));
}


/* =========================================================
   [css] analyzeSkinCss 판정
========================================================== */

const MODERN_CSS = [
  ":root{--ink:#061b1c;--gap:clamp(12px,2vw,28px);--w:min(1180px,100%);--h:max(40vh,320px)}",
  ".hero{min-height:clamp(590px,77vh,780px);height:100dvh;min-block-size:100svh;width:var(--w);padding:calc(var(--gap) * 2) calc(100% - 90%)}",
  ".hero{background:linear-gradient(90deg,rgba(2,21,22,.55),rgba(2,25,26,.04) 37%),radial-gradient(circle at 20% 30%,#fff,transparent 60%),conic-gradient(from 90deg,red,blue),#0d5b5b}",
  ".hero img{object-fit:cover;object-position:center 29%;filter:saturate(.83) contrast(1.02) drop-shadow(0 3px 18px rgba(0,0,0,.35));aspect-ratio:3/4;inset:0}",
  ".glass{backdrop-filter:blur(8px) saturate(1.2);-webkit-backdrop-filter:blur(8px);transform:translate(-50%,-50%) rotate(-8deg) scale(1.02)}",
  ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));gap:var(--gap)}",
  ".row{display:flex;flex-wrap:wrap;gap:8px 12px;place-items:center}",
  ".star::before{content:\"✦\";position:absolute}.star::after{content:\"\";display:block}",
  "@keyframes drift{from{transform:translateY(0)}50%{opacity:.5}to{transform:translateY(-12px)}}",
  ".orbit{animation:drift 6s ease-in-out infinite alternate}",
  "@media (max-width:720px){.hero{min-height:calc(100vh - 78px)}.grid{grid-template-columns:1fr}}",
  "@media (prefers-reduced-motion:reduce){.orbit{animation:none}}",
  "@supports (backdrop-filter:blur(1px)){.glass{background:rgba(255,255,255,.4)}}",
  ".card:is(.a,.b):hover{box-shadow:14px 14px 0 rgba(7,47,48,.12)}"
].join("\n");

async function runCss(context) {

  const page = await openStudio(context, "y");

  try {

    const out = await page.evaluate(([foeCss, modern]) => {

      const a = window.analyzeSkinCss;
      const foe = a(foeCss, { mode: "strict" });

      /* 브라우저가 실제로 읽은 규칙 — 원문과 잘라낸 결과 */
      const rulesOf = (css) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        /* 스타일 규칙은 선언까지 통째로, @media 같은 묶음은 머리 + 안쪽 */
        const walk = (list) => Array.from(list).flatMap((rule) =>
          rule.type === 1 ? [rule.cssText] : (rule.cssRules ? [rule.cssText.split("{")[0]].concat(walk(rule.cssRules)) : [rule.cssText])
        );
        return walk(sheet.cssRules);
      };

      const rawRules = rulesOf(foeCss);
      const cleanRules = rulesOf(foe.css);

      const quoteRule = rawRules.find((text) => text.indexOf('[data-kind="quote"]::before') !== -1) || "";

      const modernReport = a(modern, { mode: "strict" });

      const lineCss = ".a { color: red; }\n.b {\n  width: 10px;\n  content: \"x;\n  height: 2px;\n}\n.c { color: blue; }";
      const lineReport = a(lineCss, { mode: "strict" });

      const onlyDecl = a(".a{color:red;;foo;height:1px}", { mode: "strict" });

      const brace = a(".a{color:red\n.b{color:blue}", { mode: "strict" });
      const stray = a(".a{color:red}}\n.b{color:blue}", { mode: "strict" });
      const paren = a(".a{width:calc(100% - (2px)}\n.b{color:red}", { mode: "strict" });

      const imp = a(".x{color:red}\n\n@import url(https://fonts.example/a.css);", { mode: "strict" });
      const impRepair = a(".x{color:red}\n\n@import url(https://fonts.example/a.css);", { mode: "repair" });
      const jsQuoted = a('.a{background:url("javascript:alert(1)")}', { mode: "strict" });
      const jsBare = a(".a{background:url(javascript:alert(1))}", { mode: "strict" });
      const expr = a(".a{width:expression(alert(1));color:red}", { mode: "strict" });
      const beh = a(".a{behavior:url(x.htc)}", { mode: "strict" });

      const dataUrl = a(".a{color:red;background:url(data:image/png;base64,AA) no-repeat;padding:1px}", { mode: "strict" });
      const customHttp = a(":root{--bg:url(http://x.example/a.png);--ok:1px}\n.a{background:var(--bg)}", { mode: "strict" });
      const imageSet = a('.a{color:red;background:image-set("http://q.example/a.png" 1x)}', { mode: "strict" });
      const https = a(".a{background:url(https://cdn.example/a.png) center/cover no-repeat}", { mode: "strict" });

      const protectedTwo = a("a, #postDetailContent, span.post-inline-font{color:red}\n.b{color:blue}", { mode: "strict" });

      const scoped = window.validateAndScopeSkinCss(foeCss, { namespace: "e2e" });

      return {
        foe: { ok: foe.ok, removed: foe.removed.map((i) => ({ line: i.line, column: i.column, code: i.code, snippet: i.snippet, hint: i.hint, category: i.category })), errors: foe.errors.length, formatted: foe.removed.map(window.formatSkinCssIssue) },
        rawCount: rawRules.length,
        sameRules: JSON.stringify(rawRules) === JSON.stringify(cleanRules),
        quoteRule,
        cleanedHasBad: foe.css.indexOf('content:"“”;') !== -1,
        cleanedDiff: foeCss.length - foe.css.length,
        modern: { ok: modernReport.ok, issues: modernReport.issues.length, unchanged: modernReport.css === modern },
        line: { ok: lineReport.ok, removed: lineReport.removed.map((i) => [i.line, i.column, i.code]), keepsHeight: lineReport.css.indexOf("height: 2px") !== -1, keepsWidth: lineReport.css.indexOf("width: 10px") !== -1 },
        onlyDecl: { ok: onlyDecl.ok, css: onlyDecl.css, removed: onlyDecl.removed.length },
        brace: { ok: brace.ok, css: brace.css, err: brace.errors.map((i) => [i.line, i.column, i.code]), summary: brace.summary },
        stray: { ok: stray.ok, err: stray.errors.map((i) => [i.line, i.column, i.code]) },
        paren: { ok: paren.ok, err: paren.errors.map((i) => i.code) },
        imp: { ok: imp.ok, err: imp.errors.map((i) => [i.line, i.column, i.category, i.code]), summary: imp.summary, repairOk: impRepair.ok, repairCss: impRepair.css },
        js: [jsQuoted.ok, jsBare.ok, jsQuoted.errors[0] && jsQuoted.errors[0].category, jsBare.errors[0] && jsBare.errors[0].category],
        expr: [expr.ok, beh.ok],
        dataUrl: { ok: dataUrl.ok, css: dataUrl.css },
        customHttp: { ok: customHttp.ok, css: customHttp.css },
        imageSet: { ok: imageSet.ok, css: imageSet.css },
        https: { ok: https.ok, issues: https.issues.length },
        protectedTwo: { ok: protectedTwo.ok, css: protectedTwo.css, removed: protectedTwo.removed.length },
        scoped: { ok: scoped.ok, length: scoped.css.length, hasScope: scoped.css.indexOf(".imory-skin-root-e2e .foe-hero") !== -1 }
      };

    }, [FOE.css, MODERN_CSS]);

    record(
      "C1. 첨부 FOE CSS 의 실제 원인 — 129행 11열 `content:\"“”;` 닫는 따옴표 없음, 그 선언 하나만 제외(차단 아님)",
      out.foe.ok && out.foe.errors === 0 && out.foe.removed.length === 1 &&
        out.foe.removed[0].line === 129 && out.foe.removed[0].column === 11 &&
        out.foe.removed[0].code === "unclosed-string" && out.foe.removed[0].category === "syntax" &&
        out.foe.removed[0].snippet.indexOf('content:"“”;') === 0,
      JSON.stringify(out.foe.removed)
    );

    record(
      "C2. 수정 예를 함께 준다 — `content:\"“”\";`",
      out.foe.removed[0] && out.foe.removed[0].hint.indexOf('content:"“”";') !== -1,
      out.foe.removed[0] && out.foe.removed[0].hint
    );

    record(
      "C3. ★ 브라우저(CSSOM)가 원문에서 읽은 규칙과 잘라낸 CSS 에서 읽은 규칙이 **똑같다** — 제외는 브라우저 동작과 같다",
      out.sameRules && out.rawCount > 100,
      `rules=${out.rawCount} · 원문의 그 규칙을 브라우저는 이렇게 읽었다: ${out.quoteRule}`
    );

    record(
      "C4. 브라우저도 그 선언(content + 다음 줄 position 까지)을 버렸다 — 이 규칙은 원래도 content/position 이 없다",
      out.quoteRule && out.quoteRule.indexOf("content") === -1 && out.quoteRule.indexOf("position") === -1 && out.quoteRule.indexOf("inset") !== -1,
      out.quoteRule
    );

    record(
      "C5. 잘라낸 CSS 에는 깨진 선언이 없다(저장/Export 에 다시 들어가지 않는다)",
      !out.cleanedHasBad && out.cleanedDiff > 0,
      `diff=${out.cleanedDiff}`
    );

    record(
      "C6. 현대 CSS(custom property · clamp/min/max · vh/svh/dvh · @media · @keyframes/animation · transform · 여러 gradient · filter/backdrop-filter · object-fit/position · grid/flex · aspect-ratio/inset · ::before/::after · @supports · :is)는 그대로 통과",
      out.modern.ok && out.modern.issues === 0 && out.modern.unchanged,
      JSON.stringify(out.modern)
    );

    record(
      "C7. 문법 오류의 줄·열 — 4행 12열(깨진 문자열이 시작하는 자리)의 선언만 제외, 앞뒤 선언은 남는다",
      out.line.ok && out.line.removed.length === 1 && out.line.removed[0][0] === 4 && out.line.removed[0][1] === 12 && out.line.keepsWidth,
      JSON.stringify(out.line)
    );

    record(
      "C8. 지원하지 않는 선언 하나(`foo`)만 빠지고 나머지는 그대로",
      out.onlyDecl.ok && out.onlyDecl.removed === 1 && out.onlyDecl.css.indexOf("color:red") !== -1 && out.onlyDecl.css.indexOf("height:1px") !== -1 && out.onlyDecl.css.indexOf("foo") === -1,
      out.onlyDecl.css
    );

    record(
      "C9. 중괄호가 깨지면 전체 차단 — 닫히지 않은 '{' (1행 3열) · 짝 없는 '}' · 괄호 안에서 끝난 블록",
      !out.brace.ok && out.brace.css === "" && out.brace.err[0][0] === 1 && out.brace.err[0][1] === 3 && out.brace.err[0][2] === "unclosed-brace" &&
        !out.stray.ok && out.stray.err[0][2] === "stray-close-brace" &&
        !out.paren.ok && out.paren.err[0] === "unclosed-bracket",
      out.brace.summary
    );

    record(
      "C10. @import 는 보안 정책 차단(3행 1열) — repair(렌더/저장)에서는 그 줄만 빠진다",
      !out.imp.ok && out.imp.err[0][0] === 3 && out.imp.err[0][1] === 1 && out.imp.err[0][2] === "security" && out.imp.err[0][3] === "import" &&
        out.imp.summary.indexOf("보안 정책 차단") !== -1 && out.imp.repairOk && out.imp.repairCss.indexOf("@import") === -1,
      out.imp.summary
    );

    record(
      "C11. javascript: 주소(따옴표 있음/없음) · expression() · behavior 는 차단",
      out.js[0] === false && out.js[1] === false && out.js[2] === "security" && out.js[3] === "security" && out.expr[0] === false && out.expr[1] === false,
      JSON.stringify(out.js)
    );

    record(
      "C12. 허용 안 되는 주소는 그 선언만 제외 — data: · custom property 안의 http: · image-set 문자열의 http:(예전에는 이 둘이 https 규칙을 우회했다)",
      out.dataUrl.ok && out.dataUrl.css === ".a{color:red;padding:1px}" &&
        out.customHttp.ok && out.customHttp.css.indexOf("--bg:") === -1 && out.customHttp.css.indexOf("--ok:1px") !== -1 &&
        out.imageSet.ok && out.imageSet.css === ".a{color:red;}",
      JSON.stringify([out.dataUrl.css, out.customHttp.css, out.imageSet.css])
    );

    record("C13. https url() 은 그대로 통과(기존 정책 유지)", out.https.ok && out.https.issues === 0);

    record(
      "C13b. 한 목록의 보호 선택자 둘을 빼도 남는 선택자로 목록을 다시 쓴다(쉼표가 남지 않는다)",
      out.protectedTwo.ok && out.protectedTwo.css === "a{color:red}\n.b{color:blue}" && out.protectedTwo.removed === 1,
      JSON.stringify(out.protectedTwo)
    );

    record(
      "C14. 렌더 경로(validateAndScopeSkinCss)도 같은 판정 — FOE CSS 가 빈 문자열이 아니라 스코프된 CSS 로 나온다",
      out.scoped.ok && out.scoped.length > 20000 && out.scoped.hasScope,
      JSON.stringify(out.scoped)
    );

  } finally {
    await page.close();
  }

}


/* =========================================================
   [import] Import 창 — FOE
========================================================== */

async function runImport(context) {

  const page = await openStudio(context, "y");

  try {

    await openImportEditor(page);

    const v = await validateInImport(page, FOE_TEXT);

    record(
      "I1. FOE 파일 Validate → 성공, Apply 열림, 'CSS에서 1곳을 빼고' 안내",
      !v.isError && !v.applyDisabled && v.message.indexOf("검증 성공") === 0 && v.message.indexOf("1곳") !== -1,
      v.message
    );

    const removedGroup = v.groups.find((g) => g.kind === "removed");

    record(
      "I2. 목록에 줄·열 · 분류 · 문제 구문 · 수정 방법이 보인다",
      !v.reportHidden && removedGroup && removedGroup.items.length === 1 &&
        removedGroup.items[0].indexOf("CSS 129행 11열 · 문법 오류") === 0 &&
        removedGroup.items[0].indexOf('content:"“”;') !== -1 &&
        removedGroup.items[0].indexOf('수정 방법: 따옴표를 닫아 주세요. 예: content:"“”";') !== -1,
      removedGroup && removedGroup.items[0]
    );

    const expectedCss = await page.evaluate((css) => window.analyzeSkinCss(css, { mode: "strict" }).css, FOE.css);

    await applyImport(page);

    const state = await workingState(page);

    record(
      "I3. Apply 결과 = Validate 결과 — working CSS 는 그 선언만 빠진 원문(나머지 글자 그대로)",
      state.skinPackage.css === expectedCss && state.skinPackage.css.indexOf('content:"“”;') === -1 &&
        state.skinPackage.css.indexOf("FOREVER, MY FOE — editorial Y2K skin") !== -1,
      `len ${FOE.css.length} -> ${state.skinPackage.css.length}`
    );

    record(
      "I4. 템플릿 · imageSlots(header) · metadata 는 보존",
      state.skinPackage.templates.home.html.indexOf('data-imory-src="images.header"') !== -1 &&
        JSON.stringify(state.skinPackage.imageSlots) === JSON.stringify(FOE.imageSlots) &&
        state.skinPackage.metadata.title === "FOREVER, MY FOE",
      JSON.stringify(state.skinPackage.imageSlots)
    );

    await waitPreview(page, ".foe-hero");

    const look = await previewEval(page, (doc, arg, win) => {
      const pageEl = doc.querySelector(".foe-page");
      const title = doc.querySelector(".foe-title-lockup h1");
      const hero = doc.querySelector(".foe-hero");
      return {
        bg: pageEl ? win.getComputedStyle(pageEl).backgroundColor : "",
        heroBg: hero ? win.getComputedStyle(hero).backgroundColor : "",
        titleFamily: title ? win.getComputedStyle(title).fontFamily : "",
        heroMinHeight: hero ? hero.getBoundingClientRect().height : 0
      };
    });

    record(
      "I5. Preview 가 FOE 디자인으로 그려진다(스킨 CSS 적용: 종이색 배경 · 청록 hero · Didot 제목)",
      look.bg === "rgb(247, 244, 236)" && look.heroBg === "rgb(7, 47, 48)" && /Didot|Bodoni|Georgia/.test(look.titleFamily) && look.heroMinHeight > 300,
      JSON.stringify(look)
    );

    /* Export → 다시 Import */
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.click("#studioExportButton");
    const download = await downloadPromise;
    const exported = fs.readFileSync(await download.path(), "utf8");
    const exportedPkg = JSON.parse(exported);

    record("I6. Export 파일의 CSS = working CSS(제외한 선언이 되살아나지 않는다)", exportedPkg.css === state.skinPackage.css);

    await openImportEditor(page);
    const v2 = await validateInImport(page, exported);

    record(
      "I7. Export 파일을 다시 Import → 제외할 것 0, 목록 없음, 슬롯 그대로",
      !v2.isError && v2.message.indexOf("1곳") === -1 && v2.reportHidden,
      v2.message
    );

    await applyImport(page);
    const state2 = await workingState(page);

    record(
      "I8. 왕복 뒤 CSS · imageSlots 가 글자 단위로 같다",
      state2.skinPackage.css === state.skinPackage.css && JSON.stringify(state2.skinPackage.imageSlots) === JSON.stringify(state.skinPackage.imageSlots)
    );

  } finally {
    await page.close();
  }

}


/* =========================================================
   [errors] Import 창 — 막히는 경우
========================================================== */

async function runErrors(context) {

  const page = await openStudio(context, "y");

  try {

    await openImportEditor(page);

    const broken = await validateInImport(page, foeWith((pkg) => {
      pkg.css = ".a{color:red}\n.b{\n  color:blue;\n" + pkg.css;
    }));

    record(
      "E1. 중괄호가 깨진 CSS → 'CSS 2행 3열 · 문법 오류: 여는 중괄호…' 로 막히고 Apply 잠김",
      broken.isError && broken.applyDisabled && broken.message.indexOf("CSS 2행 3열 · 문법 오류") !== -1 && broken.message.indexOf("Unexpected input") === -1,
      broken.message
    );

    const errGroup = broken.groups.find((g) => g.kind === "error");

    record(
      "E2. 목록에 오류 그룹과 수정 방법",
      errGroup && errGroup.items.length >= 1 && errGroup.items[0].indexOf("수정 방법:") !== -1,
      errGroup && errGroup.items[0]
    );

    const imp = await validateInImport(page, foeWith((pkg) => {
      pkg.css = pkg.css + "\n@import url(https://fonts.example/foe.css);";
    }));

    const importLine = FOE.css.split("\n").length + 1;

    record(
      `E3. @import → 'CSS ${importLine}행 1열 · 보안 정책 차단: @import는 …' 로 막힌다`,
      imp.isError && imp.applyDisabled && imp.message.indexOf(`CSS ${importLine}행 1열 · 보안 정책 차단: @import는`) !== -1,
      imp.message
    );

    const many = await validateInImport(page, foeWith((pkg) => {
      pkg.css = '@import url(https://fonts.example/a.css);\n.x{background:url("javascript:alert(1)")}\n' + pkg.css;
    }));

    const manyErr = many.groups.find((g) => g.kind === "error");
    const manyRemoved = many.groups.find((g) => g.kind === "removed");

    record(
      "E4. 오류가 여럿이면 첫 오류 + 전체 개수(메시지) · 목록에 전부 · 통과하면 뺄 것도 함께",
      many.isError && many.message.indexOf("(오류 2개 중 첫 번째)") !== -1 && many.message.indexOf("CSS 1행 1열") !== -1 &&
        manyErr && manyErr.items.length === 2 && manyRemoved && manyRemoved.items.length === 1,
      many.message
    );

    const good = await validateInImport(page, FOE_TEXT);

    record("E5. 고친 텍스트로 다시 Validate 하면 목록이 새 결과로 바뀐다", !good.isError && !good.groups.some((g) => g.kind === "error"));

  } finally {
    await page.close();
  }

}


/* =========================================================
   [code] Code 적용 — 같은 파이프라인
========================================================== */

async function openCodeEditor(page) {
  await page.click("#studioCodeButton");
  await page.waitForSelector(".code-editor-overlay:not([hidden])", { timeout: 8000 });
}

async function setCodeFields(page, fn) {
  await page.evaluate((source) => {
    const fields = document.querySelectorAll(".code-editor-textarea");
    // eslint-disable-next-line no-new-func
    new Function("fields", source)(fields);
    fields.forEach((f) => f.dispatchEvent(new Event("input", { bubbles: true })));
  }, `(${fn.toString()})(fields);`);
}

async function codeApply(page) {
  await page.click(".code-editor-button--primary");
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector(".code-editor-overlay");
      const msg = document.querySelector(".code-editor-message");
      return overlay.hidden || (msg && msg.textContent && msg.textContent !== "확인하는 중...");
    },
    null,
    { timeout: 15000 }
  );
  return page.evaluate(() => ({
    closed: document.querySelector(".code-editor-overlay").hidden,
    message: document.querySelector(".code-editor-message").textContent
  }));
}

async function runCode(context) {

  const page = await openStudio(context, "y");

  try {

    const before = await workingState(page);

    await openCodeEditor(page);
    await setCodeFields(page, (fields) => { fields[1].value = fields[1].value + "\n@import url(https://fonts.example/a.css);"; });

    const blocked = await codeApply(page);
    const afterBlocked = await workingState(page);
    const cssLines = before.skinPackage.css.split("\n").length;

    record(
      "K1. Code 적용도 같은 판정 — @import 면 모달이 열린 채 'CSS n행 1열 · 보안 정책 차단' + 수정 방법",
      !blocked.closed && blocked.message.indexOf(`CSS ${cssLines + 1}행 1열 · 보안 정책 차단`) !== -1 && blocked.message.indexOf("수정 방법:") !== -1 &&
        afterBlocked.skinPackage.css === before.skinPackage.css && afterBlocked.revision === before.revision,
      blocked.message.replace(/\n/g, " | ")
    );

    await setCodeFields(page, (fields) => {
      fields[1].value = fields[1].value.replace("\n@import url(https://fonts.example/a.css);", "") + "\n.y-home .y-heading::before{content:\"✦;\n  color:red;\n}\n.y-below{letter-spacing:.1em}";
    });

    const partial = await codeApply(page);
    const afterPartial = await workingState(page);
    const toast = await page.evaluate(() => document.getElementById("studioToast").textContent);

    record(
      "K2. 선언 하나의 문법 오류는 그 선언만 빼고 적용 · toast 로 알린다",
      partial.closed && afterPartial.skinPackage.css.indexOf('content:"✦;') === -1 && afterPartial.skinPackage.css.indexOf(".y-below{letter-spacing:.1em}") !== -1 &&
        toast.indexOf("CSS에서 1곳을 빼고 적용했습니다") !== -1,
      toast
    );

    await openCodeEditor(page);
    await setCodeFields(page, (fields) => {
      fields[0].value = fields[0].value.replace('<p class="y-below">', '<img class="y-extra-art" data-imory-src="images.extraArt" data-imory-if="images.extraArt" alt="추가 그림"><p class="y-below">');
    });

    const withSlot = await codeApply(page);
    const afterSlot = await workingState(page);
    const slot = afterSlot.skinPackage.imageSlots.find((s) => s.name === "extra_art");
    const toast2 = await page.evaluate(() => document.getElementById("studioToast").textContent);

    record(
      "K3. HTML 에 새로 쓴 images.extraArt → 저장 가능한 이름 extra_art 로 바뀌고 슬롯이 선언된다(기존 슬롯 보존)",
      withSlot.closed && slot && slot.label === "추가 그림" &&
        afterSlot.skinPackage.templates.home.html.indexOf('data-imory-src="images.extra_art"') !== -1 &&
        afterSlot.skinPackage.templates.home.html.indexOf("images.extraArt") === -1 &&
        ["profile", "cover"].every((n) => afterSlot.skinPackage.imageSlots.some((s) => s.name === n)),
      JSON.stringify(afterSlot.skinPackage.imageSlots) + " · " + toast2
    );

    record(
      "K4. 기존 슬롯 연결(profile/cover)은 그대로",
      afterSlot.imageSlotBindings.profile && afterSlot.imageSlotBindings.cover && !afterSlot.imageSlotBindings.extra_art,
      JSON.stringify(Object.keys(afterSlot.imageSlotBindings))
    );

  } finally {
    await page.close();
  }

}


/* =========================================================
   [slots] 슬롯 정규화 (Import 경로)
========================================================== */

async function runSlots(context) {

  const page = await openStudio(context, "y");

  try {

    const base = await scenarioPackage(page);

    const variant = (mutate) => {
      const pkg = JSON.parse(JSON.stringify(base));
      mutate(pkg);
      return JSON.stringify(pkg);
    };

    const run = (text) => page.evaluate(async (t) => {
      const r = await window.validateSkinPackageImport(t);
      return { ok: r.ok, message: r.message, slots: r.skinPackage && r.skinPackage.imageSlots, home: r.skinPackage && r.skinPackage.templates.home.html, category: r.skinPackage && r.skinPackage.templates.category.html, notices: r.notices || [], slotReport: r.slotReport };
    }, text);

    /* S1. 선언 누락 */
    const missing = await run(variant((pkg) => {
      pkg.templates.category.html = pkg.templates.category.html.replace("</div>", '<img class="y-cat-banner" data-imory-src="images.category_banner" alt="카테고리 배너"></div>');
    }));

    const created = missing.slots.find((s) => s.name === "category_banner");

    record(
      "S1. HTML 의 images.category_banner 에 선언이 없으면 슬롯을 만든다(label=alt) + 빈 슬롯 안내",
      missing.ok && created && created.label === "카테고리 배너" && created.required === false &&
        missing.notices.some((n) => n.indexOf("images.category_banner") !== -1) &&
        missing.notices.some((n) => n.indexOf("비어 있는 이미지 슬롯: category_banner") !== -1),
      JSON.stringify(missing.notices)
    );

    /* S2. 중복 병합 */
    const dup = await run(variant((pkg) => {
      pkg.imageSlots = [
        { name: "cover", label: "커버 이미지", required: false },
        { name: "profile", label: "프로필 사진", required: false, aspectRatioHint: "1:1" },
        { name: "cover", label: "다른 라벨", required: true, aspectRatioHint: "3:1" }
      ];
    }));

    const covers = dup.slots.filter((s) => s.name === "cover");

    record(
      "S2. 같은 이름 두 번 → 하나로(앞의 값 우선, 빈 칸만 채움, required 는 하나라도 true 면 true)",
      dup.ok && covers.length === 1 && covers[0].label === "커버 이미지" && covers[0].required === true && covers[0].aspectRatioHint === "3:1" &&
        dup.notices.some((n) => n.indexOf("하나로 합쳤습니다: cover") !== -1),
      JSON.stringify(dup.slots)
    );

    /* S3. 이름 규칙 */
    const camel = await run(variant((pkg) => {
      pkg.imageSlots = pkg.imageSlots.concat([{ name: "heroPhoto", label: "메인", required: true }]);
      pkg.templates.home.html = pkg.templates.home.html.replace('<p class="y-below">', '<img class="y-hero-2" data-imory-if="images.heroPhoto" data-imory-src="images.heroPhoto" alt="메인"><p class="y-below">');
    }));

    record(
      "S3. DB 이름 규칙(소문자_숫자)에 안 맞는 heroPhoto → 선언과 HTML 을 함께 hero_photo 로",
      camel.ok && camel.slots.some((s) => s.name === "hero_photo") && !camel.slots.some((s) => s.name === "heroPhoto") &&
        camel.home.indexOf('data-imory-src="images.hero_photo"') !== -1 && camel.home.indexOf('data-imory-if="images.hero_photo"') !== -1 && camel.home.indexOf("heroPhoto") === -1,
      JSON.stringify(camel.notices)
    );

    /* S4. 기존 슬롯 보존 */
    const same = await run(JSON.stringify(base));

    record(
      "S4. 고칠 것이 없으면 imageSlots · HTML 을 그대로 둔다(안내 없음)",
      same.ok && JSON.stringify(same.slots) === JSON.stringify(base.imageSlots) && same.notices.length === 0,
      JSON.stringify(same.slots)
    );

    /* S5. 첨부 자리표시자 — 독립 Import(첨부 없음) */
    const placeholder = await run(variant((pkg) => {
      pkg.templates.home.html = pkg.templates.home.html.replace('<p class="y-below">', '<figure class="y-visual"><img class="hero-photo" src="imory-attachment:1" alt="페어 메인 이미지"></figure><p class="y-below">');
    }));

    const heroSlot = placeholder.slots.find((s) => s.name === "hero_photo");

    record(
      "S5. JSON Import 의 첨부 자리표시자 → 슬롯 선언만 복구(hero_photo, 필수) · src 없이 data-imory-src/if · 빈 슬롯 안내",
      placeholder.ok && heroSlot && heroSlot.required === true && heroSlot.label === "페어 메인 이미지" &&
        placeholder.home.indexOf("imory-attachment") === -1 &&
        /<img[^>]*data-imory-src="images\.hero_photo"[^>]*>/.test(placeholder.home) &&
        placeholder.slotReport.missingAttachments.length === 1 &&
        placeholder.notices.some((n) => n.indexOf("비어 있는 이미지 슬롯: hero_photo") !== -1),
      JSON.stringify(placeholder.notices)
    );

    /* S6. 아이콘 · 장식 · data: 는 슬롯이 아니다 */
    const icons = await run(variant((pkg) => {
      pkg.templates.home.html = pkg.templates.home.html.replace('<p class="y-below">',
        '<img class="y-icon" src="https://example.com/icon.svg" alt="">' +
        '<img class="y-deco" src="data:image/png;base64,iVBORw0KGgo=" alt="">' +
        '<span class="y-star" aria-hidden="true">✦</span><p class="y-below">');
    }));

    record(
      "S6. 평범한 외부 아이콘 · data: 이미지 · 장식 글자는 슬롯으로 바꾸지 않는다(외부 그림을 복사하지도 않는다)",
      icons.ok && JSON.stringify(icons.slots) === JSON.stringify(base.imageSlots) &&
        icons.home.indexOf('src="https://example.com/icon.svg"') !== -1 && icons.home.indexOf("data:image") === -1,
      JSON.stringify(icons.slots)
    );

    /* S7. Import 창 + Images 패널 */
    await openImportEditor(page);
    const v = await validateInImport(page, variant((pkg) => {
      pkg.templates.home.html = pkg.templates.home.html.replace('<p class="y-below">', '<figure class="y-visual"><img class="hero-photo" src="imory-attachment:1" alt="페어 메인 이미지"></figure><p class="y-below">');
    }));
    const slotGroup = v.groups.find((g) => g.kind === "notice");

    record(
      "S7. Import 창에 빈 슬롯 안내가 보인다",
      !v.isError && slotGroup && slotGroup.items.some((t) => t.indexOf("비어 있는 이미지 슬롯: hero_photo") !== -1),
      slotGroup && JSON.stringify(slotGroup.items)
    );

    await applyImport(page);
    await openImagesPanel(page);
    await page.waitForSelector(".images-panel-slot", { timeout: 8000 });

    const panel = await page.evaluate(() => Array.from(document.querySelectorAll(".images-panel-slot")).map((li) => ({
      label: li.querySelector(".images-panel-slot-label").textContent,
      sub: li.querySelector(".images-panel-slot-sub").textContent,
      empty: !!li.querySelector(".images-panel-slot-thumb--empty")
    })));

    const heroRow = panel.find((row) => row.label === "페어 메인 이미지");

    record(
      "S8. Images 패널에 새 슬롯이 '비어 있음'으로 나오고 기존 슬롯은 연결 그대로",
      heroRow && heroRow.empty && heroRow.sub.indexOf("필수") !== -1 &&
        panel.some((row) => row.label !== "페어 메인 이미지" && !row.empty),
      JSON.stringify(panel)
    );

    record(
      "S8-b. STUDIO-LAYERS-MEDIA-1 — 슬롯 줄에 기술 이름(hero_photo)이 없다",
      panel.every((row) => row.sub.indexOf("hero_photo") === -1 && row.label.indexOf("hero_photo") === -1),
      JSON.stringify(panel)
    );

  } finally {
    await page.close();
  }

}


/* =========================================================
   [ai] AI 첨부 이미지 → 슬롯
========================================================== */

/* STUDIO-LAYERS-MEDIA-1 — 상단 Images 버튼이 없어졌다. 슬롯을 정하지
   않고 여는 길(목록 화면)로 연다. */
async function openImagesPanel(page) {
  await page.evaluate(() => {
    window.showStudioLeftPanelMode("layers");
    window.showStudioLeftPanelMode("images");
  });
  await page.waitForFunction(() => {
    const o = document.querySelector("#studioLeftPanelImages .images-panel-overlay");
    return !!o && !o.hidden;
  });
}


async function openAiPanel(page) {
  const isOpen = await page.evaluate(() => document.getElementById("studioAiDrawer").classList.contains("is-open"));
  if (!isOpen) await page.click("#studioAiToggleButton");
  await page.waitForFunction(() => document.getElementById("studioAiDrawer").classList.contains("is-open"));
}

async function installUploadMock(page, options) {
  await page.evaluate((opts) => {
    window.__aiUploads = [];
    window.skinImageLibrary.upload = async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      window.__aiUploads.push({ name: file.name, type: file.type, size: bytes.length, first: Array.from(bytes.slice(0, 4)) });
      if (opts && opts.fail) {
        throw new Error("mock upload failure");
      }
      const n = window.__aiUploads.length;
      return { id: "ai-img-" + n, public_url: "https://example.com/ai-upload-" + n + "-" + file.name };
    };
  }, options || null);
}

async function routeAi(page, buildPackage) {
  await page.unroute("**/api/skin-ai").catch(() => {});
  await page.route("**/api/skin-ai", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const pkg = buildPackage(body.skinPackage, body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, skinPackage: pkg, summary: "첨부한 사진으로 메인을 만들었어요." })
    });
  });
}

async function attach(page, files) {
  await page.setInputFiles("#studioAiDrawerAttachInput", files);
  await page.waitForFunction((n) => document.querySelectorAll(".studio-ai-drawer-thumb").length === n, files.length, { timeout: 5000 });
  await sleep(150);
}

async function sendAi(page, text) {
  await page.fill("#studioAiDrawerInput", text);
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(() => window.getStudioAiPanelDebugState().pending === false, null, { timeout: 15000 });
}

async function runAi(context) {

  const page = await openStudio(context, "y");

  try {

    await openAiPanel(page);
    await installUploadMock(page);

    const note = await page.evaluate(() => (document.querySelector(".studio-ai-drawer-attach-note") || {}).textContent || "");

    await routeAi(page, (current) => {
      const pkg = JSON.parse(JSON.stringify(current));
      pkg.templates.home.html = pkg.templates.home.html.replace(
        '<p class="y-below">',
        '<figure class="y-ai-hero"><img class="hero-photo" src="imory-attachment:1" alt="페어 메인 이미지"></figure><p class="y-below">'
      );
      pkg.css += "\n.y-ai-hero{position:relative;width:150px;height:200px;margin:0;overflow:hidden}\n.y-ai-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%}";
      return pkg;
    });

    await attach(page, [{ name: "pair.png", mimeType: "image/png", buffer: PORTRAIT_PNG }]);

    const beforeState = await workingState(page);

    await sendAi(page, "첨부한 사진을 메인 이미지로 넣어줘");

    const after = await workingState(page);
    const uploads = await page.evaluate(() => window.__aiUploads);
    const slot = after.skinPackage.imageSlots.find((s) => s.name === "hero_photo");
    const status = await page.evaluate(() => window.getStudioAiPanelDebugState().statusText || (document.querySelector(".studio-ai-drawer-status") || {}).textContent || "");

    record(
      "A0. 첨부 안내 문장이 '스킨 안에 넣은 이미지만 저장'으로 바뀌었다",
      note.indexOf("AI가 스킨 안에 넣은 이미지만") !== -1,
      note
    );

    record(
      "A1. 첨부 한 장 → 올린 것도 한 장(그 첨부의 PNG 바이트)",
      uploads.length === 1 && uploads[0].type === "image/png" && uploads[0].first.join(",") === "137,80,78,71" && uploads[0].size === PORTRAIT_PNG.length,
      JSON.stringify(uploads)
    );

    record(
      "A2. 슬롯 하나가 선언된다 — hero_photo · label=alt · 필수 · 비율 3:4(첨부 300×400)",
      slot && slot.label === "페어 메인 이미지" && slot.required === true && slot.aspectRatioHint === "3:4" &&
        after.skinPackage.imageSlots.length === beforeState.skinPackage.imageSlots.length + 1,
      JSON.stringify(slot)
    );

    record(
      "A3. HTML 은 data-imory-src/if=\"images.hero_photo\" 이고 자리표시자 src 가 없다",
      /<img class="hero-photo"[^>]*data-imory-src="images\.hero_photo"/.test(after.skinPackage.templates.home.html) &&
        after.skinPackage.templates.home.html.indexOf("imory-attachment") === -1,
      (after.skinPackage.templates.home.html.match(/<figure class="y-ai-hero">.*?<\/figure>/) || [""])[0]
    );

    record(
      "A4. 올린 이미지가 그 슬롯에 연결된다(기존 연결 유지)",
      after.imageSlotBindings.hero_photo && after.imageSlotBindings.hero_photo.imageId === "ai-img-1" &&
        after.imageSlotBindings.hero_photo.imageUrl === "https://example.com/ai-upload-1-pair.png" &&
        after.imageSlotBindings.profile && after.imageSlotBindings.cover,
      JSON.stringify(after.imageSlotBindings)
    );

    await waitPreview(page, ".y-ai-hero img");
    await page.waitForFunction(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const img = doc.querySelector(".y-ai-hero img");
      return img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 10000 });

    const shown = await previewEval(page, (doc, arg, win) => {
      const img = doc.querySelector(".y-ai-hero img");
      const style = win.getComputedStyle(img);
      return { src: img.getAttribute("src"), natural: [img.naturalWidth, img.naturalHeight], fit: style.objectFit, position: style.objectPosition };
    });

    record(
      "A5. ★ 생성 직후 Preview 에 첨부 사진이 보인다(실제로 디코드됨) · AI 가 쓴 object-fit/position 유지",
      shown.src === "https://example.com/ai-upload-1-pair.png" && shown.natural[0] === 300 && shown.natural[1] === 400 &&
        shown.fit === "cover" && shown.position === "50% 30%",
      JSON.stringify(shown)
    );

    record("A6. 상태 줄이 슬롯에 넣었다고 알린다", /슬롯에 넣었습니다/.test(status) || /슬롯에 넣었습니다/.test(await page.evaluate(() => document.getElementById("studioAiDrawer").textContent)), status);

    /* Images 패널에서 바꾸기 */
    await openImagesPanel(page);
    await page.waitForSelector(".images-panel-slot", { timeout: 8000 });

    const heroRow = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll(".images-panel-slot")).find((li) => li.querySelector(".images-panel-slot-label").textContent === "페어 메인 이미지");
      if (!row) return null;
      const img = row.querySelector(".images-panel-slot-thumb img");
      return { label: row.querySelector(".images-panel-slot-label").textContent, thumb: img ? img.getAttribute("src") : "" };
    });

    record(
      "A7. Images 패널에 그 슬롯이 사진과 함께 보인다",
      heroRow && heroRow.label === "페어 메인 이미지" && heroRow.thumb === "https://example.com/ai-upload-1-pair.png",
      JSON.stringify(heroRow)
    );

    await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll(".images-panel-slot")).find((li) => li.querySelector(".images-panel-slot-label").textContent === "페어 메인 이미지");
      row.querySelector(".images-panel-slot-pick").click();
    });
    await page.waitForSelector(".images-panel-grid-item, .images-panel-image", { timeout: 8000 }).catch(() => {});
    const changed = await page.evaluate(() => {
      const ok = window.setStudioImageSlot("hero_photo", { id: "img-cover", public_url: "https://example.com/cover.png" });
      return { ok, binding: window.getStudioAiWorkingState({ includePackage: true }).imageSlotBindings.hero_photo };
    });

    record(
      "A8. 생성된 슬롯도 다른 이미지로 바꿀 수 있다(Images 패널이 쓰는 setStudioImageSlot)",
      changed.ok && changed.binding && changed.binding.imageUrl === "https://example.com/cover.png",
      JSON.stringify(changed)
    );

    /* Undo: 이미지 변경 한 칸 + AI 적용 한 칸 */
    await page.click("#studioUndoButton");
    const undo1 = await workingState(page);
    await page.click("#studioUndoButton");
    const undo2 = await workingState(page);
    await page.click("#studioRedoButton");
    const redo1 = await workingState(page);

    record(
      "A9. ↶ 한 번 = 이미지 변경 취소, 한 번 더 = AI 적용(스킨+슬롯+연결)이 한 칸으로 사라짐, ↷ = 다시 연결까지",
      undo1.imageSlotBindings.hero_photo && undo1.imageSlotBindings.hero_photo.imageId === "ai-img-1" &&
        !undo2.skinPackage.imageSlots.some((s) => s.name === "hero_photo") && !undo2.imageSlotBindings.hero_photo &&
        undo2.skinPackage.templates.home.html === beforeState.skinPackage.templates.home.html &&
        redo1.imageSlotBindings.hero_photo && redo1.imageSlotBindings.hero_photo.imageId === "ai-img-1",
      JSON.stringify([Object.keys(undo1.imageSlotBindings), Object.keys(undo2.imageSlotBindings), Object.keys(redo1.imageSlotBindings)])
    );

    /* Export → Import 뒤에도 슬롯과 연결 */
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.click("#studioExportButton");
    const download = await downloadPromise;
    const exported = fs.readFileSync(await download.path(), "utf8");

    await openImportEditor(page);
    await validateInImport(page, exported);
    await applyImport(page);
    const reimported = await workingState(page);

    record(
      "A10. Export → 다시 Import 뒤에도 hero_photo 슬롯 · HTML 바인딩 · 이미지 연결이 남는다",
      reimported.skinPackage.imageSlots.some((s) => s.name === "hero_photo" && s.aspectRatioHint === "3:4") &&
        reimported.skinPackage.templates.home.html.indexOf('data-imory-src="images.hero_photo"') !== -1 &&
        reimported.imageSlotBindings.hero_photo && reimported.imageSlotBindings.hero_photo.imageId === "ai-img-1",
      JSON.stringify(reimported.imageSlotBindings.hero_photo)
    );

  } finally {
    await page.close();
  }

  /* 두 장 — 순서대로 */
  const page2 = await openStudio(context, "y");

  try {

    await openAiPanel(page2);
    await installUploadMock(page2);

    await routeAi(page2, (current) => {
      const pkg = JSON.parse(JSON.stringify(current));
      pkg.templates.home.html = pkg.templates.home.html.replace(
        '<p class="y-below">',
        '<div class="y-duo">' +
        '<img class="banner-strip" src="imory-attachment:2" alt="">' +
        '<img class="profile-avatar" src="imory-attachment:1" alt="">' +
        '</div><p class="y-below">'
      );
      return pkg;
    });

    await attach(page2, [
      { name: "first.png", mimeType: "image/png", buffer: PORTRAIT_PNG },
      { name: "wide.png", mimeType: "image/png", buffer: WIDE_PNG }
    ]);

    await sendAi(page2, "첫 번째 사진은 프로필로, 두 번째는 배너로 넣어줘");

    const state = await workingState(page2);
    const uploads = await page2.evaluate(() => window.__aiUploads.map((u) => u.name));
    const banner = state.skinPackage.imageSlots.find((s) => s.name === "banner_image");
    const profile = state.skinPackage.imageSlots.find((s) => s.name === "profile_image");

    record(
      "A11. 두 장 → 이미지 위치 순서대로 두 슬롯(배너 자리 = 2번 첨부, 프로필 자리 = 1번 첨부) · 비율 16:9 / 3:4",
      banner && profile && banner.aspectRatioHint === "16:9" && profile.aspectRatioHint === "3:4" &&
        state.imageSlotBindings.banner_image && /wide\.png$/.test(state.imageSlotBindings.banner_image.imageUrl) &&
        state.imageSlotBindings.profile_image && /first\.png$/.test(state.imageSlotBindings.profile_image.imageUrl) &&
        uploads.join(",") === "wide.png,first.png",
      JSON.stringify({ uploads, slots: state.skinPackage.imageSlots.map((s) => s.name), bindings: state.imageSlotBindings })
    );

  } finally {
    await page2.close();
  }

  /* 업로드 실패 — 스킨은 적용, 슬롯은 비어 있음 */
  const page3 = await openStudio(context, "y");

  try {

    await openAiPanel(page3);
    await installUploadMock(page3, { fail: true });

    await routeAi(page3, (current) => {
      const pkg = JSON.parse(JSON.stringify(current));
      pkg.templates.home.html = pkg.templates.home.html.replace('<p class="y-below">', '<img class="hero-photo" src="imory-attachment:1" alt="메인"><p class="y-below">');
      return pkg;
    });

    await attach(page3, [{ name: "pair.png", mimeType: "image/png", buffer: PORTRAIT_PNG }]);
    await sendAi(page3, "이 사진을 메인에 넣어줘");

    const state = await workingState(page3);
    const drawerText = await page3.evaluate(() => document.getElementById("studioAiDrawer").textContent);

    record(
      "A12. 업로드가 실패해도 스킨은 적용되고 슬롯은 비어 있으며 그 사실을 알린다",
      state.skinPackage.imageSlots.some((s) => s.name === "hero_photo") && !state.imageSlotBindings.hero_photo &&
        /슬롯이 비어 있습니다/.test(drawerText),
      JSON.stringify(Object.keys(state.imageSlotBindings))
    );

    /* 첨부를 넣으라고 하지 않은 응답 → 아무것도 올리지 않는다 */
    await routeAi(page3, (current) => {
      const pkg = JSON.parse(JSON.stringify(current));
      pkg.css += "\n.y-below{color:#123456}";
      return pkg;
    });
    await installUploadMock(page3);
    await sendAi(page3, "이 이미지 느낌으로 색만 바꿔줘");
    const uploads = await page3.evaluate(() => window.__aiUploads.length);

    record("A13. 모델이 첨부를 스킨에 넣지 않았으면 아무것도 올리지 않는다(참고 이미지 그대로)", uploads === 0, `uploads=${uploads}`);

  } finally {
    await page3.close();
  }

}


/* =========================================================
   main
========================================================== */

const server = await startServer();
const playwright = await loadPlaywright(BROWSER);
const browser = await playwright[BROWSER].launch();
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });

try {
  if (shouldRun("css")) await runCss(context);
  if (shouldRun("import")) await runImport(context);
  if (shouldRun("errors")) await runErrors(context);
  if (shouldRun("code")) await runCode(context);
  if (shouldRun("slots")) await runSlots(context);
  if (shouldRun("ai")) await runAi(context);

  record("Z1. 새로운 console/page 오류가 없다", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
} catch (err) {
  record("UNCAUGHT", false, String(err && err.stack || err));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
if (failed.length) {
  console.log("실패:\n" + failed.map((r) => "  - " + r.name).join("\n"));
  process.exitCode = 1;
}
