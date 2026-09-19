/* =========================================================
   DIRECT-UX-1 — 클릭하고 바로 고치는 Select

   기준 문서: IMORY_DIRECT_UX_DESIGN.md

   실제 Studio 와 같은 스크립트 구성의 시나리오 문서
   (studio/studio-lifecycle-scenario.html?scenario=dux)를 띄운다.
   supabase 만 in-memory mock 이고 HTML/CSS/JS 는 저장소의 실제 파일이다.

   ★ Preview 안의 클릭은 **진짜 포인터**다(page.mouse). 새 선택 규칙은
     "그 자리에 무엇이 겹쳐 있는가"를 보므로(elementsFromPoint) 좌표가
     없는 합성 이벤트로는 검사할 수 없다. 합성 이벤트는 예전 규칙을
     탄다 — 그 대조도 한 번 본다(priority P1b).

     priority  보이는 글자가 투명 덮개·래퍼보다 먼저 · 빈 곳 = 해제 ·
               바깥 영역 선택(크기가 같은 래퍼 건너뛰기, 맨 바깥에서 숨음) ·
               hover 이름표와 커서 표식
     names     의미 있는 이름(홈 이름 · 프로필 이미지 · 카테고리 메뉴 ·
               최근 글 목록 · 글 카드 · 배경 …)이 패널 · 이름표 · AI chip 에
               같은 문자열로 · 태그/클래스/경로/식별자 미노출
     overlap   겹친 요소 메뉴(후보 · 바깥 영역은 맨 아래 · 고르면 그 요소 ·
               Esc/바깥 클릭으로 닫힘 · 한 사슬이면 메뉴 없음)
     text      더블클릭 편집 · 입력 중 기록 0 · Ctrl/⌘+Enter 한 칸 ·
               Escape 취소(선택 유지) · 포커스 잃으면 적용 · 링크는 이동 0 ·
               바인딩 글자는 열리지 않음 · ↶ ↷ 가 글자 단위로 같다
     image     Quick Bar 이미지 변경 → Images 패널이 그 슬롯을 고른 채 ·
               연결 한 번 = 한 칸 · HTML 불변
     move      자유 배치 요소 본체 끌기 — 끄는 중 기록 0 · 놓으면 한 칸 ·
               끄는 동안 Preview 가 따라 움직인다 · 작은 흔들림은 클릭
     quickbar  앞으로/뒤로(겹침 순서 · 형제 순서) · 숨기기/보이기(Select
               에서는 흐리게, 끄면 사라짐) · AI로 수정(전송 0) · 빠른 제안
     fields    종류별 항목만 · 배치/전환 상세 칸 없음 · 움직임 효과 상태 줄
     preserve  숨긴 배치·전환 값 보존(글자색 → Save → 새로 열기 → Preview) ·
               AI→글자 · Code→이미지 · Import→이동 · 효과 요소의 내용 ·
               Desktop→Mobile
     status    저장 · 공개 상태 문구(저장 실패 · 공개 실패 포함)
     coach     처음 쓰는 사람 안내 세 걸음 · 막지 않음 · 다시 보기
     narrow    390px — 가로 넘침 0 · Quick Bar 는 시트 안 · 겹친 요소 메뉴는
               아래 시트 · 이름표가 화면 안 · 끌기/더블클릭

   실행:
     node studio/studio-direct-ux-e2e-test.mjs
     node studio/studio-direct-ux-e2e-test.mjs --only=text
     node studio/studio-direct-ux-e2e-test.mjs --browser=webkit
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8969;
const scenarioUrl = (extra) =>
  `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=dux${extra || ""}`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");
const shouldRun = (name) => !ONLY || ONLY === name;

const results = [];
const consoleErrors = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `\n        ${detail}` : ""}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MOD = process.platform === "darwin" ? "Meta" : "Control";


/* =========================================================
   정적 서버 · Playwright
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
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(String(err.message).split("\n")[0]);
    }
  }
  throw new Error(`playwright ${browserName} 을(를) 실행할 수 없습니다. ${tried.join(" | ")}`);
}


/* =========================================================
   공용 도구
========================================================== */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function openStudio(context, options) {

  const opts = options || {};

  const page = await context.newPage();
  await page.setViewportSize(opts.viewport || { width: 1280, height: 860 });

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    const text = msg.text();
    /* 저장/공개 실패 스위치를 켠 검사는 일부러 오류를 만든다 */
    if (/save (draft|failed)|publish (failed)|failed \(scenario\)/.test(text)) return;
    consoleErrors.push(`${page.url()} :: ${text}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  page.__aiCalls = 0;
  await page.route("**/api/skin-ai", async (route) => {
    page.__aiCalls += 1;
    if (typeof page.__aiHandler === "function") {
      await page.__aiHandler(route);
      return;
    }
    await route.fulfill({ status: 500, contentType: "text/plain", body: "not used" });
  });
  await page.route("https://example.com/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 })
  );

  if (opts.savedPackage) {
    await page.addInitScript((pkg) => {
      window.__scenarioDuxSkinPackage = pkg;
    }, opts.savedPackage);
  }

  if (opts.clearCoach !== false) {
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("__duxKeepCoach")) localStorage.removeItem("imory.studio.coach.v1");
      } catch (err) { /* */ }
    });
  }

  await page.goto(scenarioUrl(opts.coach ? "&coach=1" : ""), { waitUntil: "load" });
  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );
  await previewHas(page, ".dx-page");
  return page;
}

function previewHas(page, selector, timeoutMs = 8000) {
  return page.waitForFunction(
    (sel) => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return !!(doc && doc.querySelector(sel));
    },
    selector,
    { timeout: timeoutMs }
  );
}

async function enableSelect(page) {
  const on = await page.evaluate(() => window.getStudioInspectorState().enabled);
  if (!on) await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);
  await page.waitForFunction(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc && doc.querySelector(".dx-bio");
    return !!(el && el.getAttribute("data-imory-edit-id"));
  }, null, { timeout: 8000 });
  await sleep(150);
}

/* 390px 에서는 아래 시트가 Preview 아래쪽 절반을 덮는다 — 누를 요소를
   프레임 위쪽(이 비율 높이)으로 스크롤해 둔다. */
let pointAnchor = 0.5;

/* 프레임 안 요소의 한 점을 **이 문서** 좌표로(Mobile 축소 · 테두리 포함) */
async function pointIn(page, selector, fx = 0.5, fy = 0.5, index = 0) {
  return page.evaluate(([sel, fx, fy, index, anchor]) => {
    const frame = document.getElementById("studioPreviewFrame");
    const doc = frame.contentDocument;
    const el = doc.querySelectorAll(sel)[index];
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    if (anchor !== 0.5) {
      const before = el.getBoundingClientRect();
      doc.defaultView.scrollBy(0, before.top + before.height / 2 - doc.defaultView.innerHeight * anchor);
    }
    const r = el.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const scale = box.width / (frame.offsetWidth || box.width);
    const cs = getComputedStyle(frame);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    return {
      x: box.left + (bl + r.left + r.width * fx) * scale,
      y: box.top + (bt + r.top + r.height * fy) * scale
    };
  }, [selector, fx, fy, index, pointAnchor]);
}

/* 390px — 아래 시트가 Preview 아래쪽 절반을 덮는다(STUDIO-SHELL-1 의
   셸 설계). 짧은 페이지는 스크롤로 끌어올릴 수도 없으므로 사용자가 하듯
   시트를 접고 누른다. 고르면 시트는 다시 열린다. */
async function collapseSheetIfNarrow(page) {
  const state = await page.evaluate(() => window.getStudioShellState());
  if (state.narrow && state.leftPanelOpen) {
    await page.click("#studioLeftPanelCollapse");
    await page.waitForFunction(() => window.getStudioShellState().leftPanelOpen === false, null, { timeout: 3000 }).catch(() => {});
    await sleep(350);
  }
}

async function realClick(page, selector, fx, fy, index) {
  const p = await pointIn(page, selector, fx, fy, index);
  if (!p) throw new Error("no element: " + selector);
  await page.mouse.click(p.x, p.y);
  await sleep(120);
  return p;
}

async function realDblClick(page, selector, index = 0) {
  const p = await pointIn(page, selector, 0.5, 0.5, index);
  if (!p) throw new Error("no element: " + selector);
  await page.mouse.click(p.x, p.y);
  await sleep(150);
  await page.mouse.dblclick(p.x, p.y);
  await sleep(150);
  return p;
}

/* 좌표 없는 합성 클릭 — 예전 규칙(눌린 노드에서 가장 가까운 요소) */
async function legacySelect(page, selector, index = 0) {
  await page.evaluate(([sel, index]) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelectorAll(sel)[index];
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, [selector, index]);
  await page.waitForFunction(([sel, index]) => {
    const s = window.getStudioInspectorSelection();
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelectorAll(sel)[index];
    return !!(s && el && el.getAttribute("data-imory-edit-id") === s.editId);
  }, [selector, index], { timeout: 5000 });
  await sleep(80);
}

/* 지금 고른 요소의 class(프레임 안에서 같은 식별자를 가진 첫 요소) */
async function selectedClass(page) {
  return page.evaluate(() => {
    const s = window.getStudioInspectorSelection();
    if (!s) return null;
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(`[data-imory-edit-id="${s.editId}"]`);
    return el ? el.getAttribute("class") : "?";
  });
}

async function waitSelected(page, className, timeoutMs = 4000) {
  return page.waitForFunction((cls) => {
    const s = window.getStudioInspectorSelection();
    if (!s) return false;
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(`[data-imory-edit-id="${s.editId}"]`);
    return !!(el && el.classList.contains(cls));
  }, className, { timeout: timeoutMs }).then(() => true, () => false);
}

const draft = (page) => page.evaluate(() => {
  const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
  return { html: pkg.templates.home.html, css: pkg.css };
});

const history = (page) => page.evaluate(() => window.getStudioHistoryState());

const frameState = (page) => page.evaluate(() => {
  const win = document.getElementById("studioPreviewFrame").contentWindow;
  return win.previewInspectDirect ? win.previewInspectDirect.getState() : null;
});

const panelTexts = (page) => page.evaluate(() => ({
  title: document.getElementById("studioInspectorPopoverTitle")?.textContent || "",
  meta: document.getElementById("studioInspectorPopoverMeta")?.textContent || "",
  label: document.getElementById("studioInspectorSelectLabel")?.textContent || "",
  note: document.getElementById("studioInspectorNote")?.hidden ? "" : (document.getElementById("studioInspectorNote")?.textContent || ""),
  fields: Array.from(document.querySelectorAll("#studioInspectorFields .studio-inspector-row-label, #studioInspectorFields .studio-inspector-block-label, #studioInspectorFields .studio-inspector-section, #studioInspectorFields .studio-inspector-block-note")).map(el => el.textContent)
}));

const listControls = (page) => page.evaluate(() => Array.from(
  new Set(Array.from(document.querySelectorAll("#studioInspectorFields [data-inspector-control]")).map(el => el.dataset.inspectorControl))
));

/* 코드 이름이 새어 나왔는가 — 태그 · 클래스 · data-imory · 식별자 · 바인딩 경로 */
function leaksCode(text) {
  return /<|>|dx-|data-imory|\be\d+(-\d+)+\b|\b(site|profile|item|post|images|navigation|home|category)\.[A-Za-z]+/.test(text || "");
}

const noHorizontalOverflow = (page) => page.evaluate(() => {
  const el = document.scrollingElement || document.documentElement;
  return el.scrollWidth <= el.clientWidth + 1 && document.body.scrollWidth <= document.documentElement.clientWidth + 1;
});


/* =========================================================
   priority — 선택 우선순위 · 빈 곳 · 바깥 영역 · hover
========================================================== */

async function runPriority(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  /* P1. 투명 덮개(.dx-veil)가 위에 있어도 그 밑의 글자를 고른다 */
  await realClick(page, ".dx-bio");
  const p1 = await waitSelected(page, "dx-bio");
  record(
    "P1. 투명 덮개 밑의 글자를 누르면 래퍼(<header>)가 아니라 그 글자가 선택된다",
    p1,
    JSON.stringify({ selected: await selectedClass(page) })
  );

  /* P1b. 대조군 — 좌표 없는 합성 클릭은 예전 규칙(눌린 노드의 가장 가까운 요소) */
  await legacySelect(page, ".dx-veil").catch(() => {});
  const legacy = await selectedClass(page);
  record(
    "P1b. 대조군: 좌표가 없는 합성 클릭은 예전 규칙 그대로 — 눌린 투명 덮개 자체가 잡힌다(이번 라운드가 고친 증상)",
    legacy === "dx-veil",
    JSON.stringify({ legacy })
  );

  /* P2. 여백만 있는 래퍼(.dx-wrap)의 빈 곳 = 선택 해제 */
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await realClick(page, ".dx-wrap", 0.5, 0.06);
  const afterEmpty = await page.evaluate(() => window.getStudioInspectorSelection());
  record(
    "P2. 단순 래퍼의 빈 곳을 누르면 무엇도 고르지 않고 선택이 풀린다",
    afterEmpty === null,
    JSON.stringify({ afterEmpty: afterEmpty && afterEmpty.name })
  );

  /* P3. 페이지 전체 래퍼의 여백 = 빈 곳 */
  await realClick(page, ".dx-bio");
  await waitSelected(page, "dx-bio");
  await realClick(page, ".dx-page", 0.004, 0.5);
  record(
    "P3. 페이지 전체 래퍼(배경)의 여백도 일반 클릭의 대상이 아니다(선택 해제)",
    (await page.evaluate(() => window.getStudioInspectorSelection())) === null
  );

  /* P4. 격자(배치를 선언한 구성 요소)의 빈틈은 그 격자 */
  await realClick(page, ".dx-grid", 0.5, 0.5);
  const gridPicked = await waitSelected(page, "dx-grid");
  record("P4. 배치를 선언한 구성 요소(격자)의 빈틈을 누르면 그 격자가 선택된다", gridPicked,
    JSON.stringify({ selected: await selectedClass(page) }));

  /* P5. 바깥 영역 선택 — 한 칸씩, 맨 바깥에서는 버튼이 사라진다 */
  await realClick(page, ".dx-card-text");
  await waitSelected(page, "dx-card-text");
  const chain = [await selectedClass(page)];
  for (let i = 0; i < 6; i += 1) {
    const visible = await page.evaluate(() => !document.getElementById("studioInspectorOuterButton").hidden);
    if (!visible) break;
    const before = await page.evaluate(() => window.getStudioInspectorSelection().editId);
    await page.click("#studioInspectorOuterButton");
    await page.waitForFunction((b) => {
      const s = window.getStudioInspectorSelection();
      return s && s.editId !== b;
    }, before, { timeout: 3000 }).catch(() => {});
    chain.push(await selectedClass(page));
  }
  const outerHiddenAtTop = await page.evaluate(() => document.getElementById("studioInspectorOuterButton").hidden);
  record(
    "P5. '바깥 영역 선택'은 한 칸씩 올라가고(카드 → 격자 → 여백 래퍼 → 배경) 맨 바깥에서는 버튼이 없다",
    chain.join(">") === "dx-card-text>dx-card>dx-grid>dx-wrap>dx-page" && outerHiddenAtTop,
    JSON.stringify({ chain, outerHiddenAtTop })
  );

  /* P6. hover — 테두리 · 이름표 · 손가락 커서 표식 */
  await page.keyboard.press("Escape");
  const tp = await pointIn(page, ".dx-title");
  await page.mouse.move(tp.x - 30, tp.y - 30);
  await page.mouse.move(tp.x, tp.y, { steps: 4 });
  await sleep(250);
  const hover = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const label = document.getElementById("studioInspectorHoverLabel");
    const title = doc.querySelector(".dx-title");
    return {
      label: label && !label.hidden ? label.textContent : null,
      box: !document.getElementById("studioInspectorHoverBox").hidden,
      marked: title.hasAttribute("data-imory-inspector-hover"),
      cursor: doc.defaultView.getComputedStyle(title).cursor
    };
  });
  record(
    "P6. 올리면 얇은 테두리 · 의미 있는 이름표(홈 이름) · 손가락 커서",
    hover.label === "홈 이름" && hover.box && hover.marked && hover.cursor === "pointer",
    JSON.stringify(hover)
  );

  await page.close();

}


/* =========================================================
   names — 의미 있는 이름 · 코드 이름 미노출
========================================================== */

async function runNames(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  const expected = [
    [".dx-title", "홈 이름", "텍스트"],
    [".dx-avatar", "프로필 이미지", "이미지"],
    [".dx-bio", "텍스트", "텍스트"],
    [".dx-link", "링크", "링크"],
    [".dx-menu", "카테고리 메뉴", "영역"],
    [".dx-menu-item", "카테고리 메뉴 항목", "링크"],
    [".dx-recent", "최근 글 목록", "영역"],
    [".dx-recent-item", "글 카드", "영역"],
    [".dx-recent-link", "글 제목", "링크"],
    [".dx-page", "배경", "영역"]
  ];

  const seen = [];
  let allOk = true;
  const leaks = [];

  for (const [sel, name, kind] of expected) {
    await legacySelect(page, sel);
    const t = await panelTexts(page);
    const ok = t.title === name && t.label === name && t.meta === `${kind} · HOME`;
    if (!ok) allOk = false;
    seen.push({ sel, title: t.title, meta: t.meta, label: t.label });
    [t.title, t.meta, t.label, t.note, ...t.fields].forEach(text => { if (leaksCode(text)) leaks.push(text); });
  }

  record("N1. 스킨 계약(바인딩 · 반복 · 맨 바깥)에서 만든 이름이 패널 · Preview 이름표에 같은 문자열로", allOk, JSON.stringify(seen));
  record("N2. 패널 머리 · 이름표 · 안내 · 항목 이름에 태그/클래스/data-imory/식별자/바인딩 경로가 없다", leaks.length === 0, JSON.stringify(leaks));

  /* N3. AI chip 도 같은 이름 */
  await legacySelect(page, ".dx-avatar");
  await page.click("#studioAiButton, #studioInspectorAiButton");
  await page.waitForFunction(() => {
    const el = document.getElementById("studioAiSelectionChipLabel");
    return el && el.textContent.length > 0;
  }, null, { timeout: 4000 }).catch(() => {});
  const chip = await page.evaluate(() => document.getElementById("studioAiSelectionChipLabel")?.textContent || "");
  const ctx = await page.evaluate(() => window.getStudioAiSelectionContext());
  record(
    "N3. AI chip 과 selectionContext.label 도 같은 이름(HOME · 프로필 이미지)",
    chip === "선택됨: HOME · 프로필 이미지" && ctx && ctx.label === "HOME · 프로필 이미지",
    JSON.stringify({ chip, label: ctx && ctx.label })
  );

  await page.close();

}


/* =========================================================
   overlap — 겹친 요소 메뉴
========================================================== */

async function runOverlap(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  /* 겹친 제목 · 사진 · 배경 카드가 모두 있는 자리 */
  await realClick(page, ".dx-caption", 0.2, 0.5);
  const menu = await page.evaluate(() => {
    const m = document.getElementById("studioInspectorPickMenu");
    return {
      open: !!m && !m.hidden,
      title: m?.querySelector(".studio-inspector-pick-title")?.textContent,
      items: Array.from(m?.querySelectorAll(".studio-inspector-pick-item") || []).map(el => ({
        name: el.querySelector(".studio-inspector-pick-name").textContent,
        outer: el.classList.contains("is-outer")
      })),
      selection: window.getStudioInspectorSelection()
    };
  });
  const names = menu.items.map(i => i.name);
  record(
    "O1. 서로를 담지 않는 후보가 겹친 자리 — 고르지 않고 '무엇을 선택할까요?' 메뉴(텍스트 · 이미지 · 영역 …, 바깥 영역은 맨 아래)",
    menu.open && menu.title === "무엇을 선택할까요?" && menu.selection === null &&
      names[0] === "텍스트" && names.includes("이미지") && names.length >= 3 &&
      menu.items[menu.items.length - 1].outer === true && /^바깥 영역/.test(names[names.length - 1]) &&
      !names.some(leaksCode),
    JSON.stringify(menu)
  );

  /* O2. 이미지를 고른다 */
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll("#studioInspectorPickMenu .studio-inspector-pick-item"))
      .find(el => el.querySelector(".studio-inspector-pick-name").textContent === "이미지");
    item.click();
  });
  const pickedPhoto = await waitSelected(page, "dx-photo");
  const closed = await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden);
  record("O2. 메뉴에서 고른 요소(이미지)가 선택되고 메뉴는 닫힌다", pickedPhoto && closed);

  /* O3. 다시 열면 지금 선택이 표시된다 · Esc 로 닫혀도 선택은 그대로 */
  await realClick(page, ".dx-caption", 0.2, 0.5);
  const marked = await page.evaluate(() => Array.from(document.querySelectorAll("#studioInspectorPickMenu .studio-inspector-pick-item"))
    .filter(el => el.getAttribute("aria-current") === "true")
    .map(el => el.querySelector(".studio-inspector-pick-name").textContent));
  await page.keyboard.press("Escape");
  const afterEsc = await page.evaluate(() => ({
    open: !document.getElementById("studioInspectorPickMenu").hidden,
    sel: !!window.getStudioInspectorSelection()
  }));
  record(
    "O3. 다시 열면 지금 고른 요소에 '선택됨' 표시 · Esc 는 메뉴만 닫고 선택은 그대로",
    marked.length === 1 && marked[0] === "이미지" && !afterEsc.open && afterEsc.sel,
    JSON.stringify({ marked, afterEsc })
  );

  /* O4. 메뉴 밖을 누르면 닫힌다 */
  await realClick(page, ".dx-caption", 0.2, 0.5);
  await page.mouse.click(40, 500);
  await sleep(100);
  const afterOutside = await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden);
  record("O4. 메뉴 밖을 누르면 닫힌다", afterOutside === true);

  /* O5. 한 사슬(카드 안 글자)이면 묻지 않는다 */
  await realClick(page, ".dx-card-text");
  const noMenu = await page.evaluate(() => document.getElementById("studioInspectorPickMenu").hidden);
  record("O5. 겹침이 아니라 담김(카드 안 글자)이면 메뉴 없이 바로 그 글자를 고른다",
    noMenu && await waitSelected(page, "dx-card-text"));

  await page.close();

}


/* =========================================================
   text — 더블클릭 편집
========================================================== */

async function runText(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  const before = await draft(page);
  const h0 = await history(page);

  await realDblClick(page, ".dx-bio");
  await page.waitForFunction(() => {
    const win = document.getElementById("studioPreviewFrame").contentWindow;
    return win.previewInspectDirect && win.previewInspectDirect.getState().editing === true;
  }, null, { timeout: 3000 }).catch(() => {});
  await page.keyboard.press("End");
  await page.keyboard.type("!!");
  await sleep(150);
  const mid = {
    frame: await frameState(page),
    history: await history(page),
    textarea: await page.evaluate(() => document.getElementById("studioInspectorTextInput")?.value),
    draftSame: (await draft(page)).html === before.html
  };
  record(
    "T1. 더블클릭하면 그 자리에서 고친다 — 입력 중에는 기록 0 · draft 불변 · 패널 칸이 같은 문구로 따라온다",
    mid.frame && mid.frame.editing === true && mid.history.undo === h0.undo && mid.draftSame &&
      mid.textarea === "안녕하세요 소개 문구입니다!!",
    JSON.stringify(mid)
  );

  await page.keyboard.press(`${MOD}+Enter`);
  await page.waitForFunction(() =>
    window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html.includes("소개 문구입니다!!"),
    null, { timeout: 4000 }).catch(() => {});
  const committed = await draft(page);
  const h1 = await history(page);
  const selAfter = await selectedClass(page);
  record(
    "T2. Ctrl/⌘+Enter = 적용 — ↶ 정확히 한 칸 · 선택 유지 · Preview 에 반영",
    committed.html.includes("소개 문구입니다!!") && h1.undo === h0.undo + 1 && selAfter === "dx-bio" &&
      (await frameState(page)).editing === false,
    JSON.stringify({ h0, h1, selAfter })
  );

  /* T3. Escape = 취소, 선택은 그대로 */
  await realDblClick(page, ".dx-bio");
  await page.keyboard.press("End");
  await page.keyboard.type("XYZ");
  await page.keyboard.press("Escape");
  await sleep(200);
  const afterEsc = await page.evaluate(() => ({
    text: document.getElementById("studioPreviewFrame").contentDocument.querySelector(".dx-bio").textContent,
    sel: !!window.getStudioInspectorSelection()
  }));
  const h2 = await history(page);
  record(
    "T3. Escape = 취소 — 원래 문구로 돌아가고 기록 · draft 불변, 선택은 풀리지 않는다",
    afterEsc.text === "안녕하세요 소개 문구입니다!!" && afterEsc.sel && h2.undo === h1.undo &&
      (await draft(page)).html === committed.html,
    JSON.stringify({ afterEsc, h2 })
  );

  /* T4. 포커스를 잃으면 적용 */
  await realDblClick(page, ".dx-bio");
  await page.keyboard.press("End");
  await page.keyboard.type("?");
  await page.click("#studioInspectorPopoverTitle");
  await page.waitForFunction(() =>
    window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html.includes("소개 문구입니다!!?"),
    null, { timeout: 4000 }).then(() => true, () => false);
  const h3 = await history(page);
  record("T4. 포커스를 잃으면(패널을 누름) 안전하게 적용 — 한 칸", h3.undo === h2.undo + 1, JSON.stringify(h3));

  /* T5. ↶ ↷ 가 편집 전후와 글자 단위로 같다 · 선택 복원 */
  const afterT4 = await draft(page);
  await page.click("#studioUndoButton");
  await sleep(300);
  const undone = await draft(page);
  const selUndo = await selectedClass(page);
  await page.click("#studioRedoButton");
  await sleep(300);
  const redone = await draft(page);
  record(
    "T5. ↶ = 편집 직전, ↷ = 편집 직후(글자 단위) · 되돌린 뒤에도 그 글자가 선택된 채",
    undone.html === committed.html && redone.html === afterT4.html && selUndo === "dx-bio",
    JSON.stringify({ selUndo })
  );

  /* T6. 링크 글자 — 편집 중 이동 0 · 주소 불변 */
  let navigated = false;
  await page.exposeFunction("__duxNavSpy", () => { navigated = true; });
  await page.evaluate(() => {
    const orig = window.handlePreviewNavigateMessage;
    if (typeof orig === "function") {
      window.handlePreviewNavigateMessage = function () { window.__duxNavSpy(); return orig.apply(this, arguments); };
    }
  });
  await realDblClick(page, ".dx-link");
  await page.keyboard.press("End");
  await page.keyboard.type(" →");
  await realClick(page, ".dx-link", 0.2, 0.5).catch(() => {});
  await page.keyboard.press(`${MOD}+Enter`);
  await sleep(400);
  const linkHtml = (await draft(page)).html;
  const linkInfo = await page.evaluate(() => ({
    page: typeof currentPreviewPageType === "string" ? currentPreviewPageType : null
  }));
  record(
    "T6. 링크 글자를 고치는 동안 눌러도 페이지가 옮겨지지 않고, 주소는 그대로 · 문구만 바뀐다",
    !navigated && linkInfo.page === "home" && linkHtml.includes("카테고리 보기 →") &&
      linkHtml.includes('href="/scenario-dux/category/301"'),
    JSON.stringify({ navigated, linkInfo })
  );

  /* T7. 데이터가 채우는 글자(홈 이름)는 열리지 않는다 */
  await realDblClick(page, ".dx-title");
  const boundState = await frameState(page);
  record("T7. 데이터가 채우는 글자(홈 이름)는 더블클릭해도 편집이 열리지 않는다", boundState.editing === false,
    JSON.stringify(boundState));

  await page.close();

}


/* =========================================================
   image — 이미지 변경
========================================================== */

async function runImage(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  await legacySelect(page, ".dx-avatar");
  const before = await draft(page);
  const h0 = await history(page);

  const quick = await page.evaluate(() => {
    const b = document.getElementById("studioInspectorQuickImage");
    return { visible: !!b && !b.hidden && !document.getElementById("studioInspectorQuickBar").hidden };
  });
  await page.click("#studioInspectorQuickImage");
  await page.waitForFunction(() => window.getStudioShellState().leftPanelMode === "images", null, { timeout: 4000 });
  await page.waitForSelector(".images-panel-card-attach", { timeout: 6000 });
  const slotState = await page.evaluate(() => ({
    pressed: Array.from(document.querySelectorAll(".images-panel-slot-pick"))
      .filter(b => b.getAttribute("aria-pressed") === "true")
      .map(b => b.querySelector(".images-panel-slot-label").textContent),
    sel: !!window.getStudioInspectorSelection()
  }));
  record(
    "I1. 이미지를 고르고 Quick Bar '이미지 변경' → Images 패널이 그 이미지의 슬롯을 고른 채 열리고 선택은 유지",
    quick.visible && slotState.pressed.length === 1 && slotState.pressed[0] === "프로필 사진" && slotState.sel,
    JSON.stringify({ quick, slotState })
  );

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".images-panel-card"))
      .find(c => c.querySelector("img").src.includes("dux-b"));
    card.querySelector(".images-panel-card-attach").click();
  });
  await page.waitForFunction(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const img = doc.querySelector(".dx-avatar");
    return img && img.src.includes("dux-b");
  }, null, { timeout: 5000 }).catch(() => {});
  const after = await draft(page);
  const h1 = await history(page);
  record(
    "I2. 고른 이미지가 그 요소에 적용 — ↶ 한 칸 · 템플릿 HTML/CSS 는 한 글자도 안 바뀐다(배치·전환·크기 보존)",
    h1.undo === h0.undo + 1 && after.html === before.html && after.css === before.css,
    JSON.stringify({ h0, h1 })
  );

  await page.close();

}


/* =========================================================
   move — 자유 배치 요소 본체 끌기
========================================================== */

async function runMove(context, viewport, tag) {

  const page = await openStudio(context, { viewport });
  await enableSelect(page);

  if (viewport && viewport.width <= 720) {
    await page.click('#studioViewportToggle [data-viewport-mode="mobile"]').catch(() => {});
    await sleep(300);
  }

  await collapseSheetIfNarrow(page);
  await realClick(page, ".dx-note");
  await waitSelected(page, "dx-note");
  await collapseSheetIfNarrow(page);
  await page.waitForFunction(() => {
    const win = document.getElementById("studioPreviewFrame").contentWindow;
    return win.previewInspectDirect.getState().caps.movable === true;
  }, null, { timeout: 3000 }).catch(() => {});

  const h0 = await history(page);
  const p = await pointIn(page, ".dx-note");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(p.x - 8 * i, p.y - 4 * i);
    await sleep(16);
  }
  await sleep(120);
  const mid = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".dx-note");
    return {
      liveX: el.style.getPropertyValue("--imory-it-x"),
      dragging: document.getElementById("studioPreviewFrame").contentWindow.previewInspectDirect.getState().dragging,
      history: window.getStudioHistoryState().undo
    };
  });
  await page.mouse.up();
  await sleep(400);
  const h1 = await history(page);
  const html = (await draft(page)).html;
  const m = /class="dx-note"[^>]*/.exec(html) || [""];
  const x = Number((/data-imory-item-x="([^"]+)"/.exec(m[0]) || [])[1]);
  const y = Number((/data-imory-item-y="([^"]+)"/.exec(m[0]) || [])[1]);
  const overflow = await noHorizontalOverflow(page);
  record(
    `M1${tag}. 본체를 끌면 옮겨진다 — 끄는 동안 Preview 가 따라 움직이고 기록 0, 놓으면 ↶ 한 칸 · 선택 유지 · 가로 넘침 0`,
    mid.dragging === true && mid.liveX !== "" && Number(mid.liveX) < 1 && mid.history === h0.undo &&
      h1.undo === h0.undo + 1 && x < 1 && y < 1 && (await selectedClass(page)) === "dx-note" && overflow,
    JSON.stringify({ mid, h0, h1, x, y, overflow })
  );

  /* M2. ↶ = 제자리 */
  await page.click("#studioUndoButton", { timeout: 5000 }).catch(() => {});
  await sleep(300);
  const back = (await draft(page)).html;
  record(`M2${tag}. ↶ 하면 원래 자리(x=1, y=1)`, /class="dx-note"[^>]*data-imory-item-x="1"[^>]*data-imory-item-y="1"/.test(back));

  /* M3. 2px 흔들림은 끌기가 아니다(기록 0) */
  await collapseSheetIfNarrow(page);
  const h2 = await history(page);
  const p2 = await pointIn(page, ".dx-note");
  await page.mouse.move(p2.x, p2.y);
  await page.mouse.down();
  await page.mouse.move(p2.x + 2, p2.y + 1);
  await page.mouse.up();
  await sleep(300);
  record(`M3${tag}. 문턱(4px)보다 작은 흔들림은 클릭이다 — 기록 0`, (await history(page)).undo === h2.undo);

  await page.close();

}


/* =========================================================
   quickbar — 앞으로/뒤로 · 숨기기 · AI로 수정 · 빠른 제안
========================================================== */

async function runQuickbar(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  /* Q1. 자유 배치 — 겹침 순서 */
  await legacySelect(page, ".dx-caption");
  const bar = await page.evaluate(() => {
    const b = document.getElementById("studioInspectorQuickBar");
    const visible = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };
    const frame = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    const r = b.getBoundingClientRect();
    const box = document.getElementById("studioInspectorSelectBox").getBoundingClientRect();
    const overlapsBox = !(r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom);
    return {
      shown: !b.hidden,
      forward: visible("studioInspectorQuickForward"),
      backward: visible("studioInspectorQuickBackward"),
      hide: visible("studioInspectorQuickHide"),
      ai: visible("studioInspectorAiButton"),
      image: visible("studioInspectorQuickImage"),
      insideFrame: r.left >= frame.left - 1 && r.right <= frame.right + 1,
      overlapsBox,
      titles: Array.from(b.querySelectorAll("button")).filter(x => !x.hidden).map(x => x.title)
    };
  });
  record(
    "Q1. 선택 요소 옆 Quick Bar — 앞으로 · 뒤로 · 숨기기 · AI로 수정(이미지가 아니면 이미지 변경 없음) · tooltip · 프레임 안 · 선택을 가리지 않음",
    bar.shown && bar.forward && bar.backward && bar.hide && bar.ai && !bar.image && bar.insideFrame &&
      !bar.overlapsBox && bar.titles.every(Boolean),
    JSON.stringify(bar)
  );

  const h0 = await history(page);
  await page.click("#studioInspectorQuickForward");
  await sleep(300);
  const zUp = /class="dx-caption"[^>]*data-imory-item-z="3"/.test((await draft(page)).html);
  await page.click("#studioInspectorQuickBackward");
  await sleep(300);
  const zDown = /class="dx-caption"[^>]*data-imory-item-z="2"/.test((await draft(page)).html);
  record("Q2. 앞으로/뒤로 = 겹침 순서 ±1, 누를 때마다 ↶ 한 칸", zUp && zDown && (await history(page)).undo === h0.undo + 2);

  /* Q3. 숨기기 → Select 에서는 흐리게 · 끄면 사라짐 · 보이기 */
  await page.click("#studioInspectorQuickHide");
  await sleep(400);
  const hidden = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".dx-caption");
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    return {
      opacity: doc.defaultView.getComputedStyle(el).opacity,
      display: doc.defaultView.getComputedStyle(el).display,
      rule: /display: none/.test(pkg.css),
      label: document.querySelector("#studioInspectorQuickHide .studio-inspector-quick-text").textContent
    };
  });
  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);
  await sleep(300);
  const offDisplay = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return doc.defaultView.getComputedStyle(doc.querySelector(".dx-caption")).display;
  });
  record(
    "Q3. 숨기기 — 규칙 한 줄(display:none) · Select 중에는 흐리게 보여 다시 고를 수 있고 · Select 를 끄면(공개 화면처럼) 사라진다",
    hidden.rule && hidden.display !== "none" && Number(hidden.opacity) < 0.5 && hidden.label === "보이기" && offDisplay === "none",
    JSON.stringify({ hidden, offDisplay })
  );

  await enableSelect(page);
  await legacySelect(page, ".dx-caption");
  await page.click("#studioInspectorQuickHide");
  await sleep(400);
  const shown = await page.evaluate(() => ({
    rule: /display: none/.test(window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css),
    label: document.querySelector("#studioInspectorQuickHide .studio-inspector-quick-text").textContent
  }));
  record("Q4. 보이기 — display 줄만 지워진다", !shown.rule && shown.label === "숨기기", JSON.stringify(shown));

  /* Q5. 형제 순서(격자 안 카드) */
  await legacySelect(page, ".dx-card", 0);
  const orderBar = await page.evaluate(() => ({
    fwdDisabled: document.getElementById("studioInspectorQuickForward").disabled,
    bwdDisabled: document.getElementById("studioInspectorQuickBackward").disabled,
    fwdLabel: document.querySelector("#studioInspectorQuickForward .studio-inspector-quick-text").textContent
  }));
  const h1 = await history(page);
  await page.click("#studioInspectorQuickBackward");
  await sleep(400);
  const html = (await draft(page)).html;
  record(
    "Q5. 격자 안 요소의 앞으로/뒤로 = 형제 순서 한 칸(맨 앞이면 '순서 앞으로' 비활성) · ↶ 한 칸",
    orderBar.fwdDisabled && !orderBar.bwdDisabled && orderBar.fwdLabel === "순서 앞으로" &&
      html.indexOf("카드 둘") < html.indexOf("카드 하나") && (await history(page)).undo === h1.undo + 1,
    JSON.stringify(orderBar)
  );

  /* Q6. AI로 수정 — 패널을 열고 선택 유지, 전송 0 · 빠른 제안은 넣기만 */
  await legacySelect(page, ".dx-avatar");
  await page.click("#studioInspectorAiButton");
  await page.waitForFunction(() => window.isStudioAiPanelOpen && window.isStudioAiPanelOpen(), null, { timeout: 3000 });
  await page.waitForFunction(() => { const r = document.getElementById("studioAiSuggestions"); return r && !r.hidden; }, null, { timeout: 3000 }).catch(() => {});
  const sugg = await page.evaluate(() => Array.from(document.querySelectorAll("#studioAiSuggestions .studio-ai-suggestion")).map(b => b.textContent));
  await page.fill("#studioAiDrawerInput", "");
  await page.click("#studioAiSuggestions .studio-ai-suggestion");
  await sleep(200);
  const input = await page.inputValue("#studioAiDrawerInput");
  await page.fill("#studioAiDrawerInput", "조금 더");
  await page.click("#studioAiSuggestions .studio-ai-suggestion >> nth=1");
  const appended = await page.inputValue("#studioAiDrawerInput");
  record(
    "Q6. 'AI로 수정' → AI Assistant 가 열리고 선택 유지 · 이미지에 맞는 제안 ≤4 · 누르면 입력칸에 넣기만(기존 글 뒤에) · 전송 0",
    sugg.length > 0 && sugg.length <= 4 && sugg[0] === "원형으로 만들기" && input === "원형으로 만들기" &&
      appended === "조금 더 배경처럼 크게" && page.__aiCalls === 0 && !!(await page.evaluate(() => window.getStudioInspectorSelection())),
    JSON.stringify({ sugg, input, appended, aiCalls: page.__aiCalls })
  );

  await page.close();

}


/* =========================================================
   fields — 종류별 항목 · 숨긴 배치/전환 칸 · 움직임 효과 상태
========================================================== */

async function runFields(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  const LAYOUT_OR_TRANSITION = ["layout", "transition", "layoutItem"];
  const hasForbidden = async () => page.evaluate(() => {
    const text = document.getElementById("studioInspectorFields").textContent;
    return /배치 방식|열 수|간격|칸 최소 폭|접히는 폭|최대 폭|최소 높이|넘칠 때|교차 정렬|가로 위치|세로 위치|전환 효과|속도|방향|움직임\b/.test(text) ||
      !!document.querySelector("#studioInspectorFields select");
  });

  await legacySelect(page, ".dx-bio");
  const text = await listControls(page);
  const textClear = await page.evaluate(() => document.querySelectorAll("#studioInspectorFields .studio-inspector-clear").length);
  record(
    "F1. 텍스트 — 내용 · 글꼴 · 글자 크기 · 굵기 · 글자색 · 정렬 + 기타(표시 · 투명도), 값이 없는 칸에 '기본' 버튼이 줄지어 있지 않다",
    JSON.stringify(text) === JSON.stringify(["text", "fontFamily", "fontSize", "fontWeight", "color", "align", "hidden", "opacity", "opacityNumber"]) &&
      textClear === 0 && !(await hasForbidden()),
    JSON.stringify({ text, textClear })
  );

  await legacySelect(page, ".dx-avatar");
  const image = await listControls(page);
  const imageButtons = await page.evaluate(() => ({
    change: !!document.getElementById("studioInspectorImageChange"),
    crop: !!document.getElementById("studioInspectorCropOpen")
  }));
  record(
    "F2. 이미지 — 이미지 변경 · 너비 · 맞춤(공간 채우기/이미지 전체 보기) · 자르기 · 모서리 · 정렬 + 기타",
    imageButtons.change && imageButtons.crop &&
      ["size", "objectFit", "shape", "imageAlign", "hidden", "opacity"].every(c => image.includes(c)) &&
      !image.some(c => LAYOUT_OR_TRANSITION.includes(c)) && !(await hasForbidden()),
    JSON.stringify({ image, imageButtons })
  );
  const fitLabels = await page.evaluate(() => Array.from(document.querySelectorAll('[data-inspector-control="objectFit"]')).map(b => b.textContent));

  await legacySelect(page, ".dx-link");
  const link = await listControls(page);
  const linkLabels = (await panelTexts(page)).fields;
  record(
    "F3. 버튼·링크 — 표시 문구 · 이동할 곳 · 글자색 · 배경색 · 테두리 · 모서리 + 기타",
    JSON.stringify(link) === JSON.stringify(["text", "href", "color", "background", "borderWidth", "borderColor", "radius", "hidden", "opacity", "opacityNumber"]) &&
      linkLabels.includes("표시 문구") && linkLabels.includes("이동할 곳") &&
      JSON.stringify(fitLabels) === JSON.stringify(["공간 채우기", "이미지 전체 보기"]),
    JSON.stringify({ link, linkLabels, fitLabels })
  );

  /* F4. 격자 + 효과 — 배치/전환 칸 없음, 상태 한 줄 + 미리보기 */
  await legacySelect(page, ".dx-grid");
  const grid = await listControls(page);
  const motion = await page.evaluate(() => {
    const line = document.getElementById("studioInspectorMotion");
    return { visible: !!line && !line.hidden, text: line?.textContent || "", play: !!document.getElementById("studioInspectorMotionPlay") };
  });
  const before = await draft(page);
  const h0 = await history(page);
  await page.click("#studioInspectorMotionPlay");
  await sleep(300);
  record(
    "F4. 배치·효과가 있는 영역 — 배치/전환 상세 칸 없음 · '움직임 효과 적용됨 [미리보기]' · 미리보기는 draft/기록을 바꾸지 않는다",
    !grid.some(c => LAYOUT_OR_TRANSITION.includes(c)) && !(await hasForbidden()) &&
      motion.visible && /움직임 효과 적용됨/.test(motion.text) && motion.play &&
      (await draft(page)).html === before.html && (await history(page)).undo === h0.undo,
    JSON.stringify({ grid, motion })
  );

  /* F5. 효과가 없으면 상태 줄도 없다 · 자유 배치 좌표 숫자 칸 없음 */
  await legacySelect(page, ".dx-note");
  const note = await page.evaluate(() => ({
    motion: !document.getElementById("studioInspectorMotion").hidden,
    order: !!document.querySelector('#studioInspectorFields [data-inspector-control="order"]')
  }));
  record(
    "F5. 효과가 없는 요소에는 상태 줄이 없고 · 자유 배치 좌표 숫자 칸 대신 '앞뒤' 한 줄",
    !note.motion && note.order && !(await hasForbidden()),
    JSON.stringify(note)
  );

  await page.close();

}


/* =========================================================
   preserve — 숨긴 값 보존
========================================================== */

const GRID_ATTRS = [
  'data-imory-layout="grid"',
  'data-imory-layout-columns="2"',
  'data-imory-layout-gap="12"',
  'data-imory-transition="fade-slide"',
  'data-imory-transition-duration="400"'
];

function gridTag(html) {
  return (/<section class="dx-grid"[^>]*>/.exec(html) || [""])[0];
}

async function savedContent(page) {
  return page.evaluate(() => {
    const calls = window.__savedDraftCallsDux || [];
    return calls.length ? calls[calls.length - 1].p_content : null;
  });
}

async function save(page) {
  const n = await page.evaluate(() => (window.__savedDraftCallsDux || []).length);
  await page.click("#studioSaveButton");
  await page.waitForFunction((n) => (window.__savedDraftCallsDux || []).length > n, n, { timeout: 8000 });
  await page.waitForFunction(() => window.getStudioAiWorkingState().isDirty === false, null, { timeout: 8000 }).catch(() => {});
}

async function runPreserve(context) {

  const page = await openStudio(context);
  await enableSelect(page);

  /* V1. 격자 + 효과 요소의 글자색만 바꾼다 */
  await legacySelect(page, ".dx-grid");
  await page.evaluate(() => {
    const input = document.querySelector('#studioInspectorFields [data-inspector-control="color"]');
    input.value = "#123456";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(400);
  const d1 = await draft(page);
  const tag1 = gridTag(d1.html);
  record(
    "V1. 격자 + 움직임 효과 요소에서 글자색만 바꾸면 — 배치·효과 속성 다섯이 그대로 · CSS 에는 color 한 줄",
    GRID_ATTRS.every(a => tag1.includes(a)) && /color: #123456/.test(d1.css),
    tag1
  );

  /* V2. Save → 새로 열기 → Preview(Select 끔) */
  await save(page);
  const saved = await savedContent(page);
  const savedTag = gridTag(saved.templates.home.html);
  await page.close();

  const reopened = await openStudio(context, { savedPackage: saved });
  const view = await reopened.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const grid = doc.querySelector(".dx-grid");
    const cs = doc.defaultView.getComputedStyle(grid);
    return {
      columns: cs.gridTemplateColumns.split(" ").filter(Boolean).length,
      display: cs.display,
      color: cs.color,
      transition: grid.getAttribute("data-imory-transition"),
      duration: grid.getAttribute("data-imory-transition-duration")
    };
  });
  record(
    "V2. Save 한 content 그대로 새로 열어도 — 격자 2열 · 효과 속성 · 새 글자색이 Preview 에 그대로",
    GRID_ATTRS.every(a => savedTag.includes(a)) && view.display === "grid" && view.columns === 2 &&
      view.color === "rgb(18, 52, 86)" && view.transition === "fade-slide" && view.duration === "400",
    JSON.stringify({ savedTag, view })
  );

  /* V3. Desktop 에서 고친 것이 Mobile Preview 에도 */
  await reopened.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await sleep(500);
  const mobile = await reopened.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return doc.defaultView.getComputedStyle(doc.querySelector(".dx-grid")).color;
  });
  record("V3. Desktop 에서 고친 값이 Mobile Preview 에도 같다", mobile === "rgb(18, 52, 86)", mobile);
  await reopened.click('#studioViewportToggle [data-viewport-mode="desktop"]');
  await reopened.close();

  /* V4. AI 변경 → 직접 텍스트 수정 → Save */
  const ai = await openStudio(context);
  ai.__aiHandler = async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const pkg = body.skinPackage;
    pkg.css = `${pkg.css} .dx-ai-mark { color: rgb(1, 2, 3); }`;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, skinPackage: pkg, summary: "바꿨어요" }) });
  };
  await ai.click("#studioAiToggleButton");
  await ai.fill("#studioAiDrawerInput", "색을 바꿔 줘");
  await ai.click("#studioAiDrawerSend");
  await ai.waitForFunction(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css.includes(".dx-ai-mark"), null, { timeout: 10000 });
  await ai.click("#studioAiPanelCollapse").catch(() => {});
  await enableSelect(ai);
  await realDblClick(ai, ".dx-bio");
  await ai.keyboard.press("End");
  await ai.keyboard.type(" AI");
  await ai.keyboard.press(`${MOD}+Enter`);
  await ai.waitForFunction(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html.includes("문구입니다 AI"), null, { timeout: 4000 }).catch(() => {});
  await save(ai);
  const aiSaved = await savedContent(ai);
  record(
    "V4. AI 변경 → 더블클릭 글자 수정 → Save — 둘 다 저장되고 격자·효과 속성 그대로",
    aiSaved.css.includes(".dx-ai-mark") && aiSaved.templates.home.html.includes("문구입니다 AI") &&
      GRID_ATTRS.every(a => gridTag(aiSaved.templates.home.html).includes(a)),
    ""
  );
  await ai.close();

  /* V5. Code 변경 → 이미지 교체 → Save */
  const code = await openStudio(context);
  await code.click("#studioCodeButton");
  await code.waitForFunction(() => { const o = document.querySelector(".code-editor-overlay"); return !!o && !o.hidden; });
  const areas = await code.$$(".code-editor-textarea");
  await areas[1].fill((await areas[1].inputValue()) + " .dx-code-mark { color: rgb(4, 5, 6); }");
  await code.click(".code-editor-button--primary");
  await code.waitForFunction(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css.includes(".dx-code-mark"));
  await code.evaluate(() => { const o = document.querySelector(".code-editor-overlay"); if (o && !o.hidden) document.querySelector(".code-editor-close").click(); });
  await enableSelect(code);
  await legacySelect(code, ".dx-avatar");
  const codeHtml = (await draft(code)).html;
  await code.click("#studioInspectorQuickImage");
  await code.waitForSelector(".images-panel-card-attach", { timeout: 6000 });
  await code.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".images-panel-card")).find(c => c.querySelector("img").src.includes("dux-b"));
    card.querySelector(".images-panel-card-attach").click();
  });
  await sleep(300);
  await save(code);
  const codeSaved = await code.evaluate(() => {
    const calls = window.__savedDraftCallsDux || [];
    return calls[calls.length - 1];
  });
  record(
    "V5. Code 변경 → 이미지 교체 → Save — Code 의 CSS · 슬롯 연결(dux-b) 저장, 템플릿 HTML 은 Code 적용 결과 그대로",
    codeSaved.p_content.css.includes(".dx-code-mark") &&
      JSON.stringify(codeSaved.p_image_slots || codeSaved.p_slot_images || codeSaved).includes("img-dux-b") &&
      codeSaved.p_content.templates.home.html === codeHtml,
    JSON.stringify(Object.keys(codeSaved))
  );
  await code.close();

  /* V6. Import → 요소 이동 → Save */
  const imp = await openStudio(context);
  const importPkg = await imp.evaluate(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    pkg.css = `${pkg.css} .dx-import-mark { color: rgb(7, 8, 9); }`;
    return pkg;
  });
  await imp.click("#studioImportButton");
  await imp.waitForSelector(".import-editor-textarea");
  await imp.fill(".import-editor-textarea", JSON.stringify(importPkg));
  await imp.evaluate(() => Array.from(document.querySelectorAll(".import-editor-button")).find(b => b.textContent.trim() === "Validate").click());
  await imp.waitForFunction(() => { const a = Array.from(document.querySelectorAll(".import-editor-button")).find(b => b.textContent.trim() === "Apply to Draft"); return a && !a.disabled; }, null, { timeout: 6000 });
  await imp.evaluate(() => Array.from(document.querySelectorAll(".import-editor-button")).find(b => b.textContent.trim() === "Apply to Draft").click());
  await imp.waitForFunction(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css.includes(".dx-import-mark"));
  await previewHas(imp, ".dx-page");
  await enableSelect(imp);
  await realClick(imp, ".dx-note");
  await waitSelected(imp, "dx-note");
  await sleep(150);
  const np = await pointIn(imp, ".dx-note");
  await imp.mouse.move(np.x, np.y);
  await imp.mouse.down();
  for (let i = 1; i <= 8; i += 1) { await imp.mouse.move(np.x - 10 * i, np.y - 3 * i); await sleep(16); }
  await imp.mouse.up();
  await sleep(400);
  await save(imp);
  const impSaved = await savedContent(imp);
  const noteTag = (/<div class="dx-note"[^>]*>/.exec(impSaved.templates.home.html) || [""])[0];
  record(
    "V6. Import → 본체 끌어 옮기기 → Save — Import 의 CSS 와 새 좌표가 함께 저장, 격자·효과 속성 그대로",
    impSaved.css.includes(".dx-import-mark") && !/data-imory-item-x="1"/.test(noteTag) &&
      GRID_ATTRS.every(a => gridTag(impSaved.templates.home.html).includes(a)),
    noteTag
  );
  await imp.close();

  /* V7. 효과가 있는 요소의 내용만 수정 → 효과 유지 */
  const fx = await openStudio(context);
  await enableSelect(fx);
  await realDblClick(fx, ".dx-card-text", 1);
  await fx.keyboard.press("End");
  await fx.keyboard.type("!");
  await fx.keyboard.press(`${MOD}+Enter`);
  await fx.waitForFunction(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html.includes("카드 둘!"), null, { timeout: 4000 }).catch(() => {});
  const fxHtml = (await draft(fx)).html;
  record(
    "V7. 움직임 효과가 있는 요소의 내용만 고쳐도 효과 속성이 그대로",
    /data-imory-transition="fade"[^>]*>카드 둘!</.test(fxHtml) || /<p class="dx-card-text"[^>]*data-imory-transition="fade"[^>]*>카드 둘!</.test(fxHtml),
    (/<p class="dx-card-text"[^>]*>카드 둘!?</.exec(fxHtml) || [""])[0]
  );
  await fx.close();

}


/* =========================================================
   status — 저장 · 공개 상태
========================================================== */

async function runStatus(context) {

  const page = await openStudio(context);
  const status = () => page.evaluate(() => {
    const el = document.getElementById("studioSaveStatus");
    return el && !el.hidden ? { state: el.dataset.state, text: el.getAttribute("aria-label") } : null;
  });

  const s0 = await status();

  await enableSelect(page);
  await legacySelect(page, ".dx-grid");
  await page.evaluate(() => {
    const input = document.querySelector('#studioInspectorFields [data-inspector-control="color"]');
    input.value = "#224466";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(300);
  const s1 = await status();

  await save(page);
  const s2 = await status();

  await page.click("#studioPublishButton");
  await page.click(".studio-confirm-button--primary");
  await page.waitForFunction(() => document.getElementById("studioSaveStatus").dataset.state === "saved", null, { timeout: 6000 }).catch(() => {});
  const s3 = await status();

  record(
    "S1. 상태 문구 — 저장됐지만 아직 공개되지 않음 → 저장하지 않은 변경사항 → (Save) 저장됐지만 아직 공개되지 않음 → (Publish) 저장됨",
    s0 && s0.text === "저장됐지만 아직 공개되지 않음" &&
      s1 && s1.text === "저장하지 않은 변경사항" &&
      s2 && s2.text === "저장됐지만 아직 공개되지 않음" &&
      s3 && s3.text === "저장됨",
    JSON.stringify({ s0, s1, s2, s3 })
  );

  /* 저장 실패 */
  await page.evaluate(() => { window.__duxSaveFail = true; });
  await page.evaluate(() => {
    const input = document.querySelector('#studioInspectorFields [data-inspector-control="color"]');
    input.value = "#335577";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(300);
  await page.click("#studioSaveButton");
  await page.waitForFunction(() => document.getElementById("studioSaveStatus").dataset.state === "saveFailed", null, { timeout: 6000 }).catch(() => {});
  const s4 = await status();

  /* 공개 실패 */
  await page.evaluate(() => { window.__duxSaveFail = false; window.__duxPublishFail = true; });
  await save(page);
  await page.click("#studioPublishButton");
  await page.click(".studio-confirm-button--primary");
  await page.waitForFunction(() => document.getElementById("studioSaveStatus").dataset.state === "publishFailed", null, { timeout: 6000 }).catch(() => {});
  const s5 = await status();

  /* 보이는 글자(짧은/긴 문구 중 지금 폭에서 그려진 것)가 있어야 한다 */
  const visibleText = await page.evaluate(() => {
    const el = document.getElementById("studioSaveStatus");
    return Array.from(el.querySelectorAll(".studio-save-status-long, .studio-save-status-short"))
      .filter(span => getComputedStyle(span).display !== "none")
      .map(span => span.textContent)
      .join("");
  });
  record(
    "S2. 실패도 문구로 — 저장 실패 · 공개 실패(색만으로 가르지 않는다, 화면에 글자가 보인다)",
    s4 && s4.text === "저장 실패" && s5 && s5.text === "공개 실패" && visibleText === "공개 실패",
    JSON.stringify({ s4, s5, visibleText })
  );

  await page.close();

}


/* =========================================================
   coach — 처음 쓰는 사람 안내
========================================================== */

async function runCoach(context) {

  const page = await openStudio(context, { coach: true });
  await page.waitForFunction(() => window.getStudioCoachState && window.getStudioCoachState().open === true, null, { timeout: 5000 }).catch(() => {});
  const c0 = await page.evaluate(() => ({
    ...window.getStudioCoachState(),
    text: document.getElementById("studioCoachText").textContent,
    step: document.getElementById("studioCoachStep").textContent
  }));

  /* 안내가 떠 있어도 Preview 는 그대로 눌린다 */
  await enableSelect(page);
  await realClick(page, ".dx-bio");
  const clickWorks = await waitSelected(page, "dx-bio");

  await page.click("#studioCoachNext");
  const c1 = await page.evaluate(() => document.getElementById("studioCoachText").textContent);
  await page.click("#studioCoachNext");
  const c2 = await page.evaluate(() => {
    const bubble = document.getElementById("studioCoach").getBoundingClientRect();
    const ai = document.getElementById("studioAiToggleButton").getBoundingClientRect();
    return {
      text: document.getElementById("studioCoachText").textContent,
      next: document.getElementById("studioCoachNext").textContent,
      below: bubble.top >= ai.bottom - 1
    };
  });
  await page.click("#studioCoachNext");
  const c3 = await page.evaluate(() => window.getStudioCoachState());
  record(
    "C1. 처음 열면 세 걸음 — 눌러 보세요 → 끌고 모서리 → AI Assistant(그 버튼 밑) · 떠 있어도 Preview 선택이 막히지 않는다 · 끝나면 기록",
    c0.open && c0.step === "1 / 3" && c0.text === "화면에서 바꾸고 싶은 것을 눌러 보세요." && clickWorks &&
      c1 === "끌어서 옮기고 모서리를 잡아 크기를 바꿀 수 있어요." &&
      c2.text === "큰 변화는 AI Assistant에게 말해 주세요." && c2.next === "시작하기" && c2.below &&
      !c3.open && c3.done,
    JSON.stringify({ c0, clickWorks, c1, c2, c3 })
  );

  /* 다시 열면 뜨지 않는다 · 사용법 다시 보기 · 건너뛰기 */
  await page.evaluate(() => sessionStorage.setItem("__duxKeepCoach", "1"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true, null, { timeout: 15000 });
  await sleep(500);
  const again = await page.evaluate(() => window.getStudioCoachState());
  await page.click("#studioHelpButtonWide");
  const replay = await page.evaluate(() => window.getStudioCoachState());
  await page.click("#studioCoachSkip");
  const skipped = await page.evaluate(() => window.getStudioCoachState());
  record(
    "C2. 한 번 끝내면 다시 뜨지 않고 · '사용법 다시 보기'로 처음부터 · 건너뛰기로 닫힌다",
    !again.open && replay.open && replay.step === 0 && !skipped.open,
    JSON.stringify({ again, replay, skipped })
  );

  await page.close();

}


/* =========================================================
   narrow — 390px
========================================================== */

async function runNarrow(context) {

  pointAnchor = 0.2;

  const page = await openStudio(context, { viewport: { width: 390, height: 844 } });
  await enableSelect(page);

  await realClick(page, ".dx-bio");
  const picked = await waitSelected(page, "dx-bio");
  await sleep(300);
  const r1 = await page.evaluate(() => {
    const bar = document.getElementById("studioInspectorQuickBar");
    const label = document.getElementById("studioInspectorSelectLabel");
    const lr = label.getBoundingClientRect();
    return {
      docked: bar.parentElement && bar.parentElement.id === "studioInspectorQuickBarSlot",
      barVisible: !bar.hidden,
      labelInside: label.hidden || (lr.left >= 0 && lr.right <= document.documentElement.clientWidth + 1)
    };
  });
  record(
    "R1. 390px — 누르면 고르고 · Quick Bar 는 요소 위가 아니라 아래 시트 맨 위 · 이름표가 화면 안 · 가로 넘침 0",
    picked && r1.docked && r1.barVisible && r1.labelInside && await noHorizontalOverflow(page),
    JSON.stringify(r1)
  );

  /* 오른쪽 끝 요소(메모)를 골라도 이름표가 화면 밖으로 나가지 않는다 */
  await collapseSheetIfNarrow(page);
  await realClick(page, ".dx-note");
  await waitSelected(page, "dx-note");
  await sleep(200);
  const edge = await page.evaluate(() => {
    const label = document.getElementById("studioInspectorSelectLabel");
    const lr = label.getBoundingClientRect();
    return label.hidden || lr.right <= document.documentElement.clientWidth + 1;
  });
  record("R2. 390px — 오른쪽 끝 요소를 골라도 이름표는 화면 안 · 가로 넘침 0", edge && await noHorizontalOverflow(page));

  /* 겹친 요소 메뉴는 아래 시트 */
  await collapseSheetIfNarrow(page);
  await realClick(page, ".dx-caption", 0.2, 0.5);
  const sheet = await page.evaluate(() => {
    const m = document.getElementById("studioInspectorPickMenu");
    const r = m.getBoundingClientRect();
    return {
      open: !m.hidden,
      isSheet: m.classList.contains("is-sheet"),
      bottom: Math.round(r.bottom),
      vh: window.innerHeight,
      width: Math.round(r.width),
      vw: document.documentElement.clientWidth
    };
  });
  record(
    "R3. 390px — 겹친 요소 메뉴는 화면 아래에서 올라오는 시트(폭 전체 · 바닥에 붙음)",
    sheet.open && sheet.isSheet && Math.abs(sheet.bottom - sheet.vh) <= 2 && sheet.width <= sheet.vw + 1 && await noHorizontalOverflow(page),
    JSON.stringify(sheet)
  );
  await page.keyboard.press("Escape");

  /* 더블클릭 편집도 된다 */
  const h0 = await history(page);
  await realDblClick(page, ".dx-bio");
  await page.keyboard.press("End");
  await page.keyboard.type("~");
  await page.keyboard.press(`${MOD}+Enter`);
  await page.waitForFunction(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html.includes("문구입니다~"), null, { timeout: 4000 }).catch(() => {});
  record("R4. 390px — 더블클릭 편집과 Ctrl/⌘+Enter 적용(한 칸)", (await history(page)).undo === h0.undo + 1 && await noHorizontalOverflow(page));

  /* ··· 메뉴의 사용법 다시 보기 */
  await page.click("#studioMoreButton");
  const help = await page.evaluate(() => {
    const b = document.getElementById("studioHelpButton");
    const wide = document.getElementById("studioHelpButtonWide");
    return { visible: b.offsetParent !== null, text: b.textContent, wideHidden: wide.offsetParent === null };
  });
  record("R5. 390px — ··· 메뉴에 '사용법 다시 보기'", help.visible && help.text === "사용법 다시 보기" && help.wideHidden, JSON.stringify(help));

  await page.close();

  await runMove(context, { width: 390, height: 844 }, "-390");

  pointAnchor = 0.5;

}


/* =========================================================
   실행
========================================================== */

(async () => {

  const server = await startServer();
  console.log(`Static server: http://localhost:${PORT}`);

  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();
  const context = await browser.newContext();

  try {
    if (shouldRun("priority")) await runPriority(context);
    if (shouldRun("names")) await runNames(context);
    if (shouldRun("overlap")) await runOverlap(context);
    if (shouldRun("text")) await runText(context);
    if (shouldRun("image")) await runImage(context);
    if (shouldRun("move")) await runMove(context, null, "");
    if (shouldRun("quickbar")) await runQuickbar(context);
    if (shouldRun("fields")) await runFields(context);
    if (shouldRun("preserve")) await runPreserve(context);
    if (shouldRun("status")) await runStatus(context);
    if (shouldRun("coach")) await runCoach(context);
    if (shouldRun("narrow")) await runNarrow(context);
  } catch (err) {
    record("실행 중 예외", false, err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : String(err));
  }

  record("Z. console/page 오류가 없다", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" || "));

  await browser.close();
  server.close();

  const failed = results.filter(r => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
  process.exit(failed.length ? 1 : 0);

})();
