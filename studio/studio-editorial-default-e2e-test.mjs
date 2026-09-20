/* =========================================================
   EDITORIAL-DEFAULT-SKIN-2 — Skin Studio 의 아이모리 기본 스킨 E2E

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md §7 · §8

   studio/studio-lifecycle-scenario.html 을 띄운다.
     ?scenario=b    스킨이 하나도 없는 새 사용자 — 첫 스킨 문답
     ?scenario=eds  기본 스킨(3단)이 draft 인 주인 — 사진은 이 테스트가
                    page.route 로 만드는 색 SVG(사용자 원화 없음)
     ?scenario=lay  설정을 읽지 않는 스킨(잠김 대조군)

   [first]   새 사용자의 첫 스킨 = 기본 스킨 · 문답의 단 구성/분위기가
             regions 로 · 빈 계정 HOME 이 빈 표지(Begin the first page.)
   [panel]   Layout 패널 아래 HOME 설정 넷 · 지금 값 · 개발자 낱말 없음
   [photos]  사진 구성 고르기 → draft · Preview · Undo/Redo 한 칸씩 · 같은
             값은 기록 0 · 사진을 넣으면 자동 구성이 따라간다
   [colors]  색 네 역할 → draft · Preview · 기록 한 칸 · 대비 경고 ·
             스킨 기본색으로
   [dday]    날짜를 고르면 켜진다 · 이름 · 끄면 날짜는 남는다
   [mobile]  모바일에서 좌우 영역 끄기 → Mobile Preview 에 여는 버튼 0
   [persist] Save payload(설정 · 런타임 흔적 0) → 그 content 로 다시 열기
   [lock]    설정을 읽지 않는 스킨 — 칸이 잠기고 이유가 나온다
   [narrow]  390px Studio — Layout 시트 · 가로 넘침 0

   실행:
     node studio/studio-editorial-default-e2e-test.mjs
     node studio/studio-editorial-default-e2e-test.mjs --browser=webkit
     node studio/studio-editorial-default-e2e-test.mjs --only=colors
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8980;
const SCENARIO = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const require = createRequire(import.meta.url);
const editorial = require(path.join(ROOT, "skin", "skin-default-editorial.js"));


async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const dir of fs.readdirSync(npxCache)) candidates.push(path.join(npxCache, dir, "node_modules"));
  }
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  candidates.push(path.join(ROOT, "node_modules"));
  const found = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let version = "0.0.0";
    try { version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0"; } catch { /* */ }
    found.push({ entry, version });
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  const tried = [];
  for (const { entry, version } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try { const probe = await mod[browserName].launch(); await probe.close(); return mod; }
    catch (err) { tried.push(`${version}: ${String(err.message).split("\n")[0]}`); }
  }
  throw new Error(`playwright ${browserName}: ${tried.join(" / ") || "없음"}`);
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2"
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
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/* 실행 때 만드는 색 사진 */
function photoSvg(n) {
  const colors = [["#2c3e70", "#9fb3d9"], ["#6b2f3a", "#e3b3a8"], ["#2f5b4a", "#b7dcc9"], ["#5a4a1f", "#e6d49a"]][(n - 1) % 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${colors[1]}"/><circle cx="300" cy="320" r="120" fill="${colors[0]}"/></svg>`;
}


let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const wants = (name) => !ONLY || ONLY === name;
const section = (name) => console.log(`\n[${name}]`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/* =========================================================
   Studio 열기 · 읽기
========================================================== */

async function openStudio(browser, options) {
  const opts = options || {};
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, acceptDownloads: true });
  await context.route("https://imory-test.invalid/**", (route) => {
    const n = Number((/photo-(\d)/.exec(route.request().url()) || [0, 1])[1]);
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: photoSvg(n) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));
  await page.route("**/api/skin-ai", (route) => route.fulfill({ status: 500, body: "must not be called" }));
  await page.addInitScript((init) => {
    if (init.pkg) window.__scenarioEdsSkinPackage = init.pkg;
    if (init.slots) window.__scenarioEdsSlots = init.slots;
    if (init.empty) window.__scenarioEdsEmpty = true;
  }, { pkg: opts.pkg || null, slots: opts.slots || null, empty: !!opts.empty });
  await page.goto(`${SCENARIO}?scenario=${opts.scenario || "eds"}`, { waitUntil: "load" });
  if (opts.scenario !== "b") {
    await page.waitForFunction(() => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true, null, { timeout: 20000 });
    await previewReady(page, opts.probe || "[data-imory-photos-layout]");
  }
  return { context, page, errors };
}

function previewReady(page, selector) {
  return page.waitForFunction((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return !!(doc && doc.querySelector(sel));
  }, selector, { timeout: 15000 });
}

function readPreview(page) {
  return page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const set = doc.querySelector('[data-imory-photos="set"]');
    const sheet = doc.querySelector(".ied-sheet");
    const dday = doc.querySelector(".ied-dday");
    const empty = doc.querySelector(".ied-empty-head");
    return {
      layout: set && set.getAttribute("data-imory-photos-layout"),
      filled: set && set.getAttribute("data-imory-photos-filled"),
      bg: sheet && doc.defaultView.getComputedStyle(sheet).backgroundColor,
      dday: dday && !dday.hidden ? doc.querySelector(".ied-dday-num").textContent : null,
      ddayLabel: dday && !dday.hidden ? doc.querySelector(".ied-dday-label").textContent : null,
      sides: sheet && sheet.getAttribute("data-imory-sides-layout"),
      on: sheet && sheet.getAttribute("data-imory-sides-on"),
      openers: Array.from(doc.querySelectorAll(".ied-main [data-imory-sides-open]")).filter((el) => doc.defaultView.getComputedStyle(el).display !== "none").length,
      emptyHead: empty && doc.defaultView.getComputedStyle(doc.querySelector(".ied-empty")).display !== "none" ? empty.textContent : null
    };
  });
}

function readStudio(page) {
  return page.evaluate(() => ({
    regions: JSON.parse(JSON.stringify(currentWorkingSkin.regions || [])),
    dirty: isStudioDirty,
    history: window.getStudioHistoryState(),
    panel: (() => {
      const root = document.querySelector("#studioLeftPanelLayout .studio-home-settings");
      if (!root) return null;
      return {
        text: root.textContent,
        photoChecked: (root.querySelector('.studio-home-photo-option[aria-checked="true"]') || {}).dataset?.value || null,
        photoDisabled: Array.from(root.querySelectorAll(".studio-home-photo-option")).every((b) => b.disabled),
        photoNote: root.querySelector(".studio-home-photo-note").textContent,
        colors: Object.fromEntries(Array.from(root.querySelectorAll(".studio-home-color-input")).map((i) => [i.dataset.role, i.value])),
        colorsDisabled: Array.from(root.querySelectorAll(".studio-home-color-input")).every((i) => i.disabled),
        warning: root.querySelector(".studio-home-warning").textContent,
        resetDisabled: root.querySelector(".studio-home-color-reset").disabled,
        ddayOn: root.querySelector(".studio-home-dday-on").checked,
        ddayDisabled: root.querySelector(".studio-home-dday-on").disabled,
        ddayDate: root.querySelector(".studio-home-dday-date").value,
        mobile: root.querySelector(".studio-home-mobile").checked,
        mobileDisabled: root.querySelector(".studio-home-mobile").disabled,
        status: root.querySelector(".studio-home-status").textContent
      };
    })()
  }));
}

const entry = (regions, name) => regions.find((e) => e && e.name === name) || null;

async function openLayout(page) {
  await page.click("#studioLayoutButton");
  await page.waitForSelector("#studioLeftPanelLayout .studio-home-settings", { timeout: 5000 });
  await sleep(150);
}

async function setColor(page, role, value) {
  await page.evaluate(([r, v]) => {
    const input = document.querySelector(`.studio-home-color-input[data-role="${r}"]`);
    input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, [role, value]);
  await sleep(350);
}

async function setField(page, selector, value) {
  await page.evaluate(([sel, v]) => {
    const input = document.querySelector(sel);
    input.value = v;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selector, value]);
  await sleep(350);
}

async function undo(page) { await page.click("#studioUndoButton"); await sleep(350); }
async function redo(page) { await page.click("#studioRedoButton"); await sleep(350); }


/* =========================================================
   [first]
========================================================== */

async function runFirst(browser) {
  section("first");
  const { context, page, errors } = await openStudio(browser, { scenario: "b" });
  await page.waitForSelector(".skin-questionnaire-submit-button", { timeout: 15000 });
  await page.click('.skin-q-option:has(input[value="three-column"])');
  await page.click('.skin-q-option:has(input[value="dark"])');
  await page.click(".skin-questionnaire-submit-button");
  await page.waitForFunction(() => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true, null, { timeout: 20000 });
  await previewReady(page, "[data-imory-photos-layout]");
  await sleep(300);

  const skin = await page.evaluate(() => JSON.parse(JSON.stringify(currentWorkingSkin)));
  check("첫 스킨 = 아이모리 기본 스킨", skin.metadata.generatedBy === editorial.IMORY_EDITORIAL_DEFAULT_ID ||
    skin.metadata.generatedBy === "imory-editorial-default-v2", skin.metadata.generatedBy);
  check("metadata 에 문답의 답이 없다", JSON.stringify(Object.keys(skin.metadata).sort()) === JSON.stringify(["generatedBy", "supports"]));
  check("3단 · 어두운 분위기 → regions(좌우 켜짐 · 어두운 네 색)",
    entry(skin.regions, "left_sidebar").enabled === true && entry(skin.regions, "right_sidebar").enabled === true &&
    JSON.stringify(entry(skin.regions, "theme_colors").colors) === JSON.stringify(editorial.IMORY_EDITORIAL_PALETTES.dark), JSON.stringify(skin.regions));

  const p = await readPreview(page);
  check("새 계정(글 · 카테고리 · 사진 없음) HOME — 빈 표지 · 사진 0 · 어두운 바탕",
    p.layout === "empty" && /first page/i.test(p.emptyHead || "") && p.bg === "rgb(17, 20, 28)", JSON.stringify(p));
  const noBroken = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return Array.from(doc.querySelectorAll("img")).filter((img) => img.getClientRects().length && !img.closest("[hidden]")).length;
  });
  check("빈 계정 — 보이는 이미지 0(깨진 이미지 · 회색 상자 없음)", noBroken === 0, `${noBroken}`);
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   [panel] · [photos] · [colors] · [dday] · [mobile]
========================================================== */

async function runPanel(browser) {
  section("panel");
  const { context, page, errors } = await openStudio(browser);
  await openLayout(page);
  const s = await readStudio(page);
  const defaults = editorial.IMORY_EDITORIAL_PALETTES.light;
  check("Layout 패널 아래에 HOME 설정 다섯(모바일 · HOME 사진 · HOME 제목 · 색 · D-day)",
    ["모바일", "HOME 사진", "HOME 제목", "색", "D-day"].every((t) => s.panel.text.includes(t)));
  check("1·2·3단 고르기도 같은 패널에 그대로", await page.evaluate(() => document.querySelectorAll("#studioLeftPanelLayout .studio-sides-option").length === 3));
  check("지금 값 — 사진 자동 · 채운 사진 1장 · 한 장", s.panel.photoChecked === "auto" && /1장/.test(s.panel.photoNote) && /한 장/.test(s.panel.photoNote), s.panel.photoNote);
  check("지금 값 — 색 칸 = 스킨 기본색", JSON.stringify(s.panel.colors) === JSON.stringify(defaults), JSON.stringify(s.panel.colors));
  check("지금 값 — 스킨 기본색이면 되돌리기 잠김 · D-day 꺼짐 · 모바일 켜짐", s.panel.resetDisabled && !s.panel.ddayOn && s.panel.mobile);
  check("개발자 낱말이 없다", !/regions|data-imory|custom property|theme_colors|home_photos|--imory/i.test(s.panel.text), s.panel.text.slice(0, 80));
  check("패널을 열기만 해서는 기록 · dirty 0", s.history.undo === 0 && s.dirty === false, JSON.stringify(s.history));
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function runPhotos(browser) {
  section("photos");
  const { context, page, errors } = await openStudio(browser);
  await openLayout(page);
  let p = await readPreview(page);
  check("사진 1장 · 자동 → 한 장", p.layout === "hero" && p.filled === "1");

  await page.click('.studio-home-photo-option[data-value="empty"]');
  await sleep(350);
  let s = await readStudio(page);
  p = await readPreview(page);
  check("'사진 없이' → draft · Preview(빈 표지) · 기록 한 칸 · dirty",
    entry(s.regions, "home_photos").layout === "empty" && p.layout === "empty" && s.history.undo === 1 && s.dirty, JSON.stringify({ p, h: s.history }));

  await page.click('.studio-home-photo-option[data-value="empty"]');
  await sleep(250);
  s = await readStudio(page);
  check("같은 값을 다시 고르면 기록 0", s.history.undo === 1);

  await undo(page);
  s = await readStudio(page);
  p = await readPreview(page);
  check("↶ → 설정 전(항목 없음 · 자동 · 한 장)", !entry(s.regions, "home_photos") && p.layout === "hero" && s.panel.photoChecked === "auto");
  await redo(page);
  p = await readPreview(page);
  check("↷ → 다시 사진 없이", p.layout === "empty");

  await page.click('.studio-home-photo-option[data-value="auto"]');
  await sleep(300);
  await page.evaluate(() => window.setStudioImageSlot("photo_2", { id: "img-eds-2", public_url: "https://imory-test.invalid/photo-2.svg" }));
  await sleep(500);
  p = await readPreview(page);
  s = await readStudio(page);
  check("사진을 하나 더 넣으면 자동 구성이 두 장으로 · 패널 문구도", p.layout === "pair" && p.filled === "2" && /2장/.test(s.panel.photoNote) && /두 장/.test(s.panel.photoNote), s.panel.photoNote);

  await page.click('.studio-home-photo-option[data-value="triptych"]');
  await sleep(350);
  p = await readPreview(page);
  s = await readStudio(page);
  check("두 장뿐인데 '세 장'을 고르면 두 장(채운 수까지만) · 설정은 그대로 남는다",
    p.layout === "pair" && entry(s.regions, "home_photos").layout === "triptych");

  await page.focus('.studio-home-photo-option[data-value="triptych"]');
  await page.keyboard.press("ArrowLeft");
  await sleep(350);
  s = await readStudio(page);
  check("방향키로 옆 선택지", entry(s.regions, "home_photos").layout === "pair");
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function runColors(browser) {
  section("colors");
  const { context, page, errors } = await openStudio(browser);
  await openLayout(page);
  const h0 = (await readStudio(page)).history.undo;

  await setColor(page, "background", "#fdf6ec");
  let s = await readStudio(page);
  let p = await readPreview(page);
  const colors = entry(s.regions, "theme_colors").colors;
  check("배경 하나를 바꾸면 네 색이 함께 적힌다(나머지는 지금 값)", colors.background === "#fdf6ec" && colors.text === "#1b2340" && colors.accent2 === "#8796b0", JSON.stringify(colors));
  check("Preview 에 곧바로 · 기록 한 칸", p.bg === "rgb(253, 246, 236)" && s.history.undo === h0 + 1, `${p.bg} ${JSON.stringify(s.history)}`);
  check("'스킨 기본색으로' 가 열린다", s.panel.resetDisabled === false);

  await setColor(page, "text", "#f4efe6");
  s = await readStudio(page);
  check("글자가 배경과 비슷하면 대비 경고", /대비/.test(s.panel.warning), s.panel.warning);

  await page.click(".studio-home-color-reset");
  await sleep(350);
  s = await readStudio(page);
  p = await readPreview(page);
  check("스킨 기본색으로 → 항목이 사라지고 Preview 흰 바탕 · 경고 없음", !entry(s.regions, "theme_colors") && p.bg === "rgb(255, 255, 255)" && !s.panel.warning, p.bg);

  await undo(page);
  p = await readPreview(page);
  check("↶ 한 번 → 바로 전 색", p.bg === "rgb(253, 246, 236)");
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function runDday(browser) {
  section("dday");
  const { context, page, errors } = await openStudio(browser);
  await openLayout(page);
  let p = await readPreview(page);
  check("처음에는 D-day 자리가 없다", p.dday === null);

  await setField(page, ".studio-home-dday-date", "2024-09-21");
  let s = await readStudio(page);
  p = await readPreview(page);
  check("날짜를 고르면 켜진다 · 오른쪽 영역에 날 수", s.panel.ddayOn && entry(s.regions, "dday").date === "2024-09-21" && /^\d[\d,]*$/.test(p.dday || ""), JSON.stringify(p));

  await setField(page, ".studio-home-dday-label", "since we met");
  p = await readPreview(page);
  check("이름", p.ddayLabel === "since we met");

  await page.click(".studio-home-dday-on");
  await sleep(350);
  s = await readStudio(page);
  p = await readPreview(page);
  check("끄면 자리가 접히고 날짜 · 이름은 남는다", p.dday === null && entry(s.regions, "dday").enabled === false &&
    entry(s.regions, "dday").date === "2024-09-21" && entry(s.regions, "dday").label === "since we met");
  await page.click(".studio-home-dday-on");
  await sleep(350);
  p = await readPreview(page);
  check("다시 켜면 그대로", p.ddayLabel === "since we met" && p.dday !== null);
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function runMobile(browser) {
  section("mobile");
  const { context, page, errors } = await openStudio(browser);
  await openLayout(page);
  await page.click('[data-viewport-mode="mobile"]');
  await sleep(700);
  let p = await readPreview(page);
  check("Mobile Preview · 3단 → 패널 · 여는 버튼 둘", p.sides === "drawer" && p.openers === 2, JSON.stringify(p));

  await page.click(".studio-home-mobile");
  await sleep(500);
  const s = await readStudio(page);
  p = await readPreview(page);
  check("모바일에서 끔 → 두 영역에 mobile:false · 여는 버튼 0 · 기록 한 칸",
    entry(s.regions, "left_sidebar").mobile === false && entry(s.regions, "right_sidebar").mobile === false &&
    p.openers === 0 && p.on === "" && s.history.undo === 1, JSON.stringify(p));
  check("안내 문구가 바뀐다", /가운데 HOME 만/.test(s.panel.text));

  await page.click('[data-viewport-mode="desktop"]');
  await sleep(700);
  p = await readPreview(page);
  check("Desktop Preview 에서는 칼럼 그대로", p.sides === "columns" && p.on === "left right");
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   [persist] · [lock] · [narrow]
========================================================== */

async function runPersist(browser) {
  section("persist");
  const { context, page, errors } = await openStudio(browser);
  await openLayout(page);
  await page.click('.studio-home-photo-option[data-value="empty"]');
  await sleep(300);
  await setColor(page, "accent", "#7a2e2e");
  await setField(page, ".studio-home-dday-date", "2025-01-01");
  await page.click(".studio-home-mobile");
  await sleep(300);

  await page.click("#studioSaveButton");
  await page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === false, null, { timeout: 10000 });
  const saved = await page.evaluate(() => { const c = window.__savedDraftCallsEds || []; return c.length ? c[c.length - 1].p_content : null; });
  check("Save payload — 설정 넷이 regions 에", !!saved && entry(saved.regions, "home_photos").layout === "empty" &&
    entry(saved.regions, "theme_colors").colors.accent === "#7a2e2e" && entry(saved.regions, "dday").date === "2025-01-01" &&
    entry(saved.regions, "right_sidebar").mobile === false, JSON.stringify(saved && saved.regions));
  check("Save payload — 런타임 흔적 0(사진 구성 · 좌우 영역 상태)",
    !/data-imory-photos-(layout|count|filled|state|position)|data-imory-sides-(layout|on|state|count)|imory-color-/.test(JSON.stringify(saved.templates)));
  await context.close();

  const again = await openStudio(browser, { pkg: saved });
  await openLayout(again.page);
  const s = await readStudio(again.page);
  const p = await readPreview(again.page);
  check("그 content 로 다시 열기 — Preview 와 패널이 같은 값",
    p.layout === "empty" && p.dday !== null && s.panel.photoChecked === "empty" && s.panel.colors.accent === "#7a2e2e" &&
    s.panel.ddayOn && s.panel.ddayDate === "2025-01-01" && s.panel.mobile === false && s.dirty === false, JSON.stringify({ p, panel: s.panel.colors }));
  check("오류 0", errors.length === 0 && again.errors.length === 0, errors.concat(again.errors).join(" | "));
  await again.context.close();
}

async function runLock(browser) {
  section("lock");
  const { context, page, errors } = await openStudio(browser, { scenario: "lay", probe: ".lay-home" });
  await openLayout(page);
  const s = await readStudio(page);
  check("설정을 읽지 않는 스킨 — 사진 · 색 · D-day · 모바일 칸이 잠긴다", s.panel.photoDisabled && s.panel.colorsDisabled && s.panel.ddayDisabled && s.panel.mobileDisabled);
  check("잠긴 이유가 보인다", /사진 구성 자리가 없어요/.test(s.panel.text) && /색 설정을 읽지 않아요/.test(s.panel.text) && /D-day 자리가 없어요/.test(s.panel.text) && /좌우 영역이 없어요/.test(s.panel.text));
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function runNarrow(browser) {
  section("narrow");
  const { context, page, errors } = await openStudio(browser, { viewport: { width: 390, height: 844 } });
  await page.evaluate(() => document.getElementById("studioLayoutButton").click());
  await page.waitForSelector("#studioLeftPanelLayout .studio-home-settings", { timeout: 5000 });
  await sleep(400);
  const m = await page.evaluate(() => {
    const root = document.querySelector("#studioLeftPanelLayout .studio-home-settings");
    const controls = Array.from(root.querySelectorAll("button, input, label.studio-home-check, label.studio-home-color"));
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflow: root.scrollWidth - root.clientWidth,
      small: controls.filter((c) => c.getClientRects().length && c.getBoundingClientRect().height < 30 && !c.classList.contains("studio-home-link") && c.type !== "checkbox").length
    };
  });
  check("390px — 가로 넘침 0(문서 · 패널)", m.overflow <= 0 && m.panelOverflow <= 0, JSON.stringify(m));
  check("390px — 손가락 크기(30px 이상)", m.small === 0, `${m.small}`);
  await page.evaluate(() => document.querySelector('.studio-home-photo-option[data-value="empty"]').click());
  await sleep(400);
  const p = await readPreview(page);
  check("390px — 시트에서 고른 값이 Preview 에", p.layout === "empty");
  check("오류 0", errors.length === 0, errors.join(" | "));
  await context.close();
}


/* =========================================================
   실행
========================================================== */

const server = await startServer();
let browser;

try {
  const playwright = await loadPlaywright(BROWSER);
  browser = await playwright[BROWSER].launch();
  console.log(`browser: ${BROWSER}`);

  if (wants("first")) await runFirst(browser);
  if (wants("panel")) await runPanel(browser);
  if (wants("photos")) await runPhotos(browser);
  if (wants("colors")) await runColors(browser);
  if (wants("dday")) await runDday(browser);
  if (wants("mobile")) await runMobile(browser);
  if (wants("persist")) await runPersist(browser);
  if (wants("lock")) await runLock(browser);
  if (wants("narrow")) await runNarrow(browser);

} catch (err) {
  failures.push(`실행 중 예외: ${err && err.stack || err}`);
  console.log(err);
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log("  - " + f));
  process.exitCode = 1;
}
