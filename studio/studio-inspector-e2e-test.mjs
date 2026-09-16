/* =========================================================
   PHASE AI-6A — Element Inspector + Direct Edit E2E

   ★ OpenAI를 한 번도 부르지 않는다. 이 Phase의 Direct Edit은
   설계상 네트워크를 전혀 타지 않으므로, 이 파일은 /api/skin-ai를
   가로채 **호출 횟수만 세고** 실제 요청은 전부 실패시킨다 —
   호출이 한 번이라도 나가면 그 자체가 FAIL이다(검사 N).

   저장소의 실제 HTML/CSS/JS를 그대로 서빙하고, Supabase만
   studio/studio-lifecycle-scenario.html의 in-memory mock으로
   바꾼다(?scenario=y — PHASE AI-6A 전용 fixture, 요구사항 16절의
   대표 요소 여덟 가지를 담고 있다).

   검사 범위(요구사항 17절)
     A. Inspector OFF -> 기존 Preview click navigation 정상
     B. Inspector ON  -> hover outline 표시
     C. Inspector ON  -> click selection, navigation 차단
     D. Escape -> selection 해제(모드는 유지)
     E. static text -> 내용 변경 -> Preview 즉시 반영
     F. runtime-bound text -> binding 보존(내용 수정 옵션 없음)
     G. text font-size/color/align 직접 수정
     H. imageSlot image -> 기존 slot image 교체(제거)
     I. 다른 imageSlot 침범 없음
     J. image remove가 허용되는 slot에서만 동작(required 보호)
     K. link text 변경
     L. runtime owner/admin href 보호
     M. container background/border/radius 변경
     N. Direct Edit 과정 OpenAI endpoint 호출 0회
     O. dirty=true / Save 활성
     P. Save / Publish 회귀 없음
     Q. AI Assistant 기능 회귀 없음(패널 열기/선택 chip/포커스)
     R. 참고 이미지 UI 회귀 없음
     S. HOME/CATEGORY/POST route 유지
     T. selector/identity가 재렌더 후에도 같은 요소를 가리킴
     U. mobile preview에서도 inspector overlay가 심하게 깨지지 않음
     V. protected POST region 훼손 불가

   ★ 실행 방법
     node studio/studio-inspector-e2e-test.mjs
     node studio/studio-inspector-e2e-test.mjs --browser=webkit
     node studio/studio-inspector-e2e-test.mjs --only=text

   --only= 뒤에 쓸 수 있는 이름:
     mode / text / image / link / container / state / ai /
     route / mobile / protected
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8939;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=y`;

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
   /api/skin-ai — 이번 Phase에서는 **절대** 불려선 안 된다
========================================================== */

let aiCallCount = 0;

const consoleErrors = [];

async function openStudio(context, options) {

  const page = await context.newPage();

  if (options && options.viewport) {
    await page.setViewportSize(options.viewport);
  }

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  await page.route("**/api/skin-ai", async (route) => {
    aiCallCount += 1;
    await route.fulfill({ status: 500, contentType: "text/plain", body: "must not be called" });
  });

  /*
    fixture 이미지(https://example.com/*.png)에 실제 바이트를 준다.
    이 파일의 검사는 src 속성과 슬롯 상태만 보므로 결과는 달라지지
    않지만, 로드 실패가 WebKit에서는 콘솔 오류로 올라와 마지막 검사
    Z를 깨뜨린다(Chromium은 올리지 않는다). 1x1 투명 PNG면 충분하다.
  */
  await page.route("https://example.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      )
    });
  });

  await page.goto(SCENARIO_URL, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  await previewHas(page, ".y-home");

  return page;

}


function previewHas(page, selector, timeoutMs = 8000) {
  return page.waitForFunction(
    (sel) => {
      const frame = document.getElementById("studioPreviewFrame");
      const doc = frame && frame.contentDocument;
      return !!(doc && doc.querySelector(sel));
    },
    selector,
    { timeout: timeoutMs }
  );
}


async function enableInspector(page) {

  const enabled = await page.evaluate(() => window.getStudioInspectorState().enabled);

  if (!enabled) {
    await page.click("#studioInspectorButton");
  }

  await page.waitForFunction(() => window.getStudioInspectorState().enabled === true);

  /* 임시 id가 실제로 Preview DOM에 도착할 때까지 기다린다. */
  await previewHas(page, "[data-imory-edit-id]");

}


/*
  Preview 안에서 진짜 이벤트를 dispatch한다 — 요소가 Top Dock 띠에
  가려 실제 마우스로는 못 누르는 자리에 있을 수 있어서다(기존
  studio-ai-panel-layout-e2e-test.mjs D3과 같은 방식).
*/
async function previewPointer(page, selector) {
  return page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    if (!el) return null;
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    return true;
  }, selector);
}


async function previewClick(page, selector) {
  return page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    if (!el) return null;
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    el.dispatchEvent(click);
    return { prevented: click.defaultPrevented };
  }, selector);
}


/*
  선택자는 이 파일에서 항상 ".클래스" 하나다.

  "선택이 null이 아니다"로 기다리면 안 된다 — 앞 단계에서 이미 무언가
  고른 상태면 그 조건이 처음부터 참이라, 새 클릭이 도착하기도 전에
  다음 단계로 넘어간다. Chromium에서는 우연히 맞아떨어졌지만 WebKit
  에서는 그 자리에서 옛 선택의 폼을 읽어 검사가 무너졌다(J/J2).
  **그 요소가** 선택될 때까지 기다린다.
*/
async function selectInPreview(page, selector) {

  const className =
    selector.replace(/^\./, "");

  await previewClick(page, selector);

  await page.waitForFunction(
    (name) => {
      const selection = window.getStudioInspectorSelection();
      return !!selection && selection.classNames.indexOf(name) !== -1;
    },
    className,
    { timeout: 6000 }
  );

}


/*
  한 번 눌러서 안 열리면 다시 누른다 — 선택 직후에 iframe에서 뒤늦게
  올라온 select 메시지 하나가 폼을 다시 접을 수 있다(새 요소를 고르면
  폼은 접힌 상태로 시작한다는 규칙 그대로다). 사람이 쓸 때는 그 사이가
  워낙 짧아 겪을 일이 없지만, 스크립트는 고르자마자 누른다.
*/
async function openDirectEdit(page) {

  for (let attempt = 0; attempt < 3; attempt += 1) {

    const open = await page.evaluate(() => window.getStudioInspectorState().editingOpen);

    if (open) {
      return;
    }

    await page.click("#studioInspectorDirectButton");

    const opened = await page
      .waitForFunction(
        () => window.getStudioInspectorState().editingOpen === true,
        null,
        { timeout: 2000 }
      )
      .then(() => true, () => false);

    if (opened) {
      return;
    }

    await sleep(300);

  }

  throw new Error("직접 수정 폼이 열리지 않았습니다");

}


function controlSelector(control) {
  return `#studioInspectorFields [data-inspector-control="${control}"]`;
}


/* 텍스트 내용은 이제 한 줄 input의 change 하나로 확정되지 않는다 —
   textarea에 쓰는 동안은 미리보기일 뿐이고 "적용"이 확정이다
   (Select mode 직접 편집 라운드). 이 파일의 기존 검사들은 "확정된
   결과"를 보므로, 그 두 단계를 여기 한 곳에 모아 둔다. */
async function applyInspectorText(page, value) {

  await page.fill(controlSelector("text"), value);

  await page.click("#studioInspectorTextApply");

}


async function listControls(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#studioInspectorFields [data-inspector-control]"))
      .map(el => el.dataset.inspectorControl)
  );
}


function workingHtml(page, pageType = "home") {
  return page.evaluate((type) => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    return (pkg.templates && pkg.templates[type] && pkg.templates[type].html) || pkg.html || "";
  }, pageType);
}


function workingCss(page) {
  return page.evaluate(() =>
    window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css || ""
  );
}


/* =========================================================
   A~D. Inspector mode / hover / selection / Escape
========================================================== */

async function runMode(context) {

  const page = await openStudio(context);

  /* --- A. Inspector OFF -> 링크 클릭이 그대로 CATEGORY로 이동 --- */

  const offClick = await previewClick(page, ".y-link");

  await page.waitForFunction(
    () => window.getCurrentPreviewLocation().type === "category",
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const afterOff = await page.evaluate(() => window.getCurrentPreviewLocation());

  record(
    "A. Inspector OFF — Preview 링크 클릭이 기존대로 CATEGORY로 이동한다",
    afterOff.type === "category" && afterOff.categoryId === "301",
    `click=${JSON.stringify(offClick)} location=${JSON.stringify(afterOff)}`
  );

  /* HOME으로 되돌린다 */
  await page.click("#studioPreviewBackButton");
  await previewHas(page, ".y-home");

  /* --- B. Inspector ON -> hover outline --- */

  await enableInspector(page);

  const stampedCount = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return doc.querySelectorAll("[data-imory-edit-id]").length;
  });

  await previewPointer(page, ".y-heading");

  await page.waitForFunction(
    () => window.getStudioInspectorState().hover !== null,
    null,
    { timeout: 4000 }
  ).then(() => true, () => false);

  const hoverBox = await page.evaluate(() => {
    const box = document.getElementById("studioInspectorHoverBox");
    const frame = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    return {
      hidden: box.hidden,
      inside:
        rect.left >= frame.left - 1 &&
        rect.top >= frame.top - 1 &&
        rect.right <= frame.right + 1 &&
        rect.bottom <= frame.bottom + 1,
      width: rect.width,
      height: rect.height
    };
  });

  record(
    "B. Inspector ON — hover한 요소 위에 outline이 Preview 안쪽에 그려진다",
    stampedCount > 5 && hoverBox.hidden === false && hoverBox.inside && hoverBox.width > 0 && hoverBox.height > 0,
    `stamped=${stampedCount} hoverBox=${JSON.stringify(hoverBox)}`
  );

  /* Inspector가 스킨 DOM에 클래스/스타일을 붙이지 않는다 */
  const skinDomUntouched = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-heading");
    return {
      className: el.getAttribute("class"),
      hasStyle: el.hasAttribute("style")
    };
  });

  record(
    "B2. hover/선택 표시가 스킨 DOM(class/style)을 전혀 건드리지 않는다",
    skinDomUntouched.className === "y-heading" && skinDomUntouched.hasStyle === false,
    JSON.stringify(skinDomUntouched)
  );

  /* --- C. Inspector ON -> 클릭이 selection이고 navigation은 차단 --- */

  const onClick = await previewClick(page, ".y-link");

  await page.waitForFunction(
    () => window.getStudioInspectorState().selection !== null,
    null,
    { timeout: 4000 }
  );

  await sleep(400);

  const afterOn = await page.evaluate(() => ({
    location: window.getCurrentPreviewLocation(),
    selection: window.getStudioInspectorSelection(),
    popoverVisible: !document.getElementById("studioInspectorPopover").hidden
  }));

  record(
    "C. Inspector ON — 링크를 클릭해도 이동하지 않고 그 요소가 선택된다",
    onClick.prevented === true &&
      afterOn.location.type === "home" &&
      afterOn.selection &&
      afterOn.selection.kind === "link" &&
      afterOn.popoverVisible === true,
    `click=${JSON.stringify(onClick)} after=${JSON.stringify(afterOn)}`
  );

  /* --- D. Escape -> selection만 해제, 모드는 유지 --- */

  await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  await page.waitForFunction(
    () => window.getStudioInspectorState().selection === null,
    null,
    { timeout: 4000 }
  ).then(() => true, () => false);

  const afterEscape = await page.evaluate(() => ({
    state: window.getStudioInspectorState(),
    popoverVisible: !document.getElementById("studioInspectorPopover").hidden
  }));

  record(
    "D. Escape — 선택만 풀리고 Inspector mode는 유지된다",
    afterEscape.state.selection === null &&
      afterEscape.state.enabled === true &&
      afterEscape.popoverVisible === false,
    JSON.stringify(afterEscape)
  );

  /* --- Inspector를 끄면 Preview가 원래대로 돌아온다 --- */

  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);
  await sleep(500);

  const afterDisable = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      stamped: doc.querySelectorAll("[data-imory-edit-id]").length,
      layerHidden: document.getElementById("studioInspectorLayer").hidden,
      dirty: window.getStudioAiWorkingState().isDirty
    };
  });

  record(
    "D2. Inspector를 끄면 임시 id가 Preview에서 사라지고 dirty도 오르지 않는다",
    afterDisable.stamped === 0 &&
      afterDisable.layerHidden === true &&
      afterDisable.dirty === false,
    JSON.stringify(afterDisable)
  );

  const offAgain = await previewClick(page, ".y-link");

  await page.waitForFunction(
    () => window.getCurrentPreviewLocation().type === "category",
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const afterOffAgain = await page.evaluate(() => window.getCurrentPreviewLocation());

  record(
    "D3. Inspector를 끈 뒤 Preview 클릭 navigation이 그대로 돌아온다",
    afterOffAgain.type === "category",
    `click=${JSON.stringify(offAgain)} location=${JSON.stringify(afterOffAgain)}`
  );

  await page.close();

}


/* =========================================================
   E~G, T. 텍스트 직접 수정 / 바인딩 보호 / identity
========================================================== */

async function runText(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  /* --- E. static heading 내용 변경 --- */

  await selectInPreview(page, ".y-heading");
  await openDirectEdit(page);

  const headingControls = await listControls(page);

  await applyInspectorText(page, "최근 기록");

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-heading");
      return el && el.textContent === "최근 기록";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const afterText = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      previewText: doc.querySelector(".y-heading")?.textContent,
      dirty: window.getStudioAiWorkingState().isDirty,
      saveDisabled: document.getElementById("studioSaveButton").disabled
    };
  });

  const htmlAfterText = await workingHtml(page);

  record(
    "E. static text — 내용을 바꾸면 Preview에 즉시 반영되고 SkinPackage에도 남는다",
    afterText.previewText === "최근 기록" &&
      htmlAfterText.includes("최근 기록") &&
      headingControls.includes("text"),
    `controls=${JSON.stringify(headingControls)} after=${JSON.stringify(afterText)}`
  );

  record(
    "O. 직접 수정 후 dirty=true / Save 버튼 활성",
    afterText.dirty === true && afterText.saveDisabled === false,
    JSON.stringify(afterText)
  );

  /* --- T. identity: 승격된 id 하나만 HTML에 남고, 그 id가 그 요소를 가리킨다 --- */

  const identity = await page.evaluate(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    const doc = new DOMParser().parseFromString(pkg.templates.home.html, "text/html");
    const stamped = Array.from(doc.querySelectorAll("[data-imory-edit-id]"));
    return {
      count: stamped.length,
      tag: stamped[0] ? stamped[0].tagName.toLowerCase() : null,
      cls: stamped[0] ? stamped[0].getAttribute("class") : null,
      id: stamped[0] ? stamped[0].getAttribute("data-imory-edit-id") : null,
      selectionId: window.getStudioInspectorState().selection.editId
    };
  });

  record(
    "T. 편집한 요소에만 안정 식별자가 남고, 재렌더 후에도 선택이 같은 요소를 가리킨다",
    identity.count === 1 &&
      identity.tag === "h1" &&
      identity.cls === "y-heading" &&
      identity.id === identity.selectionId,
    JSON.stringify(identity)
  );

  /* --- G. font-size / color / align --- */

  await page.fill(controlSelector("fontSize"), "28");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("fontSize"));

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-heading");
      return el && doc.defaultView.getComputedStyle(el).fontSize === "28px";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  await page.click(`#studioInspectorFields [data-inspector-control="align"][data-inspector-value="center"]`);

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-heading");
      return el && doc.defaultView.getComputedStyle(el).textAlign === "center";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const styleResult = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-heading");
    const computed = doc.defaultView.getComputedStyle(el);
    return { fontSize: computed.fontSize, textAlign: computed.textAlign };
  });

  const cssAfterStyle = await workingCss(page);

  record(
    "G. 텍스트 글자 크기/정렬 직접 수정이 스킨 CSS(.y-home .y-heading)를 이기고 실제로 적용된다",
    styleResult.fontSize === "28px" &&
      styleResult.textAlign === "center" &&
      /\[data-imory-edit-id="[^"]+"\]\[data-imory-edit-id="[^"]+"\]/.test(cssAfterStyle) &&
      !/style=/.test(await workingHtml(page)),
    `computed=${JSON.stringify(styleResult)} cssTail=${JSON.stringify(cssAfterStyle.slice(-160))}`
  );

  /* --- Direct Edit 1-step undo --- */

  const undoVisible = await page.evaluate(
    () => !document.getElementById("studioInspectorUndoButton").hidden
  );

  await page.click("#studioInspectorUndoButton");

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-heading");
      return el && doc.defaultView.getComputedStyle(el).textAlign !== "center";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const afterUndo = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-heading");
    return {
      textAlign: doc.defaultView.getComputedStyle(el).textAlign,
      fontSize: doc.defaultView.getComputedStyle(el).fontSize,
      text: el.textContent
    };
  });

  record(
    "G2. Direct Edit 1-step undo — 마지막 한 번만 되돌리고 그 앞 수정은 남는다",
    undoVisible === true &&
      afterUndo.textAlign !== "center" &&
      afterUndo.fontSize === "28px" &&
      afterUndo.text === "최근 기록",
    JSON.stringify(afterUndo)
  );

  /* --- F. runtime-bound text — 내용 수정 불가, 바인딩 보존 --- */

  await selectInPreview(page, ".y-post-title");
  await openDirectEdit(page);

  const boundControls = await listControls(page);

  const boundInfo = await page.evaluate(() => ({
    selection: window.getStudioInspectorSelection(),
    note: document.getElementById("studioInspectorNote").textContent
  }));

  /* 스타일은 바꿀 수 있어야 한다(내용만 잠긴다) */
  await page.fill(controlSelector("fontSize"), "19");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("fontSize"));

  await sleep(700);

  const boundAfter = await page.evaluate(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    const doc = new DOMParser().parseFromString(pkg.templates.home.html, "text/html");
    const el = doc.querySelector(".y-post-title");
    const previewDoc = document.getElementById("studioPreviewFrame").contentDocument;
    const rendered = previewDoc.querySelector(".y-post-title");
    return {
      bind: el ? el.getAttribute("data-imory-bind") : null,
      templateText: el ? el.textContent : null,
      renderedText: rendered ? rendered.textContent : null,
      fontSize: rendered ? previewDoc.defaultView.getComputedStyle(rendered).fontSize : null
    };
  });

  record(
    "F. runtime-bound text — 내용 수정 옵션이 아예 없고 data-imory-bind가 그대로 보존된다",
    !boundControls.includes("text") &&
      boundInfo.selection.bindPath === "item.title" &&
      /item\.title/.test(boundInfo.note) &&
      boundAfter.bind === "item.title" &&
      boundAfter.templateText === "" &&
      boundAfter.renderedText === "Hello World" &&
      boundAfter.fontSize === "19px",
    `controls=${JSON.stringify(boundControls)} after=${JSON.stringify(boundAfter)}`
  );

  await page.close();

}


/* =========================================================
   H~J. imageSlot
========================================================== */

async function runImage(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);

  const avatarSelection = await page.evaluate(() => window.getStudioInspectorSelection());

  const avatarButtons = await page.evaluate(() => ({
    change: document.getElementById("studioInspectorImageChange")?.disabled,
    clear: document.getElementById("studioInspectorImageClear")?.disabled,
    label: document.querySelector("#studioInspectorFields .studio-inspector-row-label")?.textContent
  }));

  record(
    "H1. imageSlot 이미지 — 연결된 슬롯(profile)을 정확히 인식하고 변경/제거 옵션을 준다",
    avatarSelection.kind === "image" &&
      avatarSelection.imageSlot === "profile" &&
      avatarButtons.change === false &&
      avatarButtons.clear === false,
    `selection=${JSON.stringify(avatarSelection)} buttons=${JSON.stringify(avatarButtons)}`
  );

  const beforeImages = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      avatar: doc.querySelector(".y-avatar")?.getAttribute("src") || null,
      cover: doc.querySelector(".y-cover")?.getAttribute("src") || null
    };
  });

  await page.click("#studioInspectorImageClear");

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-avatar");
      return el && !el.hasAttribute("src");
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const afterClear = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      avatar: doc.querySelector(".y-avatar")?.getAttribute("src") || null,
      cover: doc.querySelector(".y-cover")?.getAttribute("src") || null,
      dirty: window.getStudioAiWorkingState().isDirty
    };
  });

  record(
    "H/J. 허용된 슬롯의 이미지만 비워진다(dirty도 함께 오른다)",
    beforeImages.avatar && beforeImages.cover &&
      afterClear.avatar === null &&
      afterClear.dirty === true,
    `before=${JSON.stringify(beforeImages)} after=${JSON.stringify(afterClear)}`
  );

  record(
    "I. 다른 imageSlot(cover)은 그대로 남는다",
    afterClear.cover === beforeImages.cover,
    `before=${beforeImages.cover} after=${afterClear.cover}`
  );

  /* --- J. required 슬롯은 제거 불가 --- */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);

  const coverButtons = await page.evaluate(() => ({
    selection: window.getStudioInspectorSelection(),
    change: document.getElementById("studioInspectorImageChange")?.disabled,
    clear: document.getElementById("studioInspectorImageClear")?.disabled
  }));

  record(
    "J. required 슬롯(cover)은 '이미지 제거'가 비활성이다",
    coverButtons.selection.imageSlot === "cover" &&
      coverButtons.change === false &&
      coverButtons.clear === true,
    JSON.stringify(coverButtons)
  );

  /* --- 슬롯이 아닌 이미지(반복 항목 데이터)에는 교체 옵션이 없다 --- */

  const imageControls = await listControls(page);

  record(
    "J2. 이미지에는 크기/모양/정렬만 제공되고 텍스트/링크 옵션은 없다",
    imageControls.includes("size") &&
      imageControls.includes("shape") &&
      imageControls.includes("imageAlign") &&
      !imageControls.includes("text") &&
      !imageControls.includes("href"),
    JSON.stringify(imageControls)
  );

  await page.close();

}


/* =========================================================
   K, L. 링크 / owner-admin 보호
========================================================== */

async function runLink(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  /* --- K. 정적 링크: 표시 텍스트 + 주소 --- */

  await selectInPreview(page, ".y-link");
  await openDirectEdit(page);

  const linkControls = await listControls(page);

  await applyInspectorText(page, "카테고리로");

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-link");
      return el && el.textContent === "카테고리로";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const linkAfterText = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-link");
    return { text: el.textContent, href: el.getAttribute("href") };
  });

  record(
    "K. 링크 — 표시 텍스트를 바꿔도 주소는 그대로다",
    linkControls.includes("text") &&
      linkControls.includes("href") &&
      linkAfterText.text === "카테고리로" &&
      linkAfterText.href === "/scenario-y/category/301",
    `controls=${JSON.stringify(linkControls)} after=${JSON.stringify(linkAfterText)}`
  );

  /* 안전하지 않은 주소는 거부된다 */

  await page.fill(controlSelector("href"), "javascript:alert(1)");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("href"));

  await sleep(500);

  const unsafeResult = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      href: doc.querySelector(".y-link").getAttribute("href"),
      toast: document.getElementById("studioToast").textContent,
      toastHidden: document.getElementById("studioToast").hidden
    };
  });

  record(
    "K2. 안전하지 않은 주소(javascript:)는 반영되지 않고 안내만 뜬다",
    unsafeResult.href === "/scenario-y/category/301" &&
      unsafeResult.toastHidden === false &&
      unsafeResult.toast.includes("https"),
    JSON.stringify(unsafeResult)
  );

  /* --- L. owner/admin runtime binding 링크 보호 --- */

  await selectInPreview(page, ".y-owner-link");
  await openDirectEdit(page);

  const ownerControls = await listControls(page);

  const ownerInfo = await page.evaluate(() => ({
    selection: window.getStudioInspectorSelection(),
    note: document.getElementById("studioInspectorNote").textContent
  }));

  /* 색만 바꿔 보고 바인딩이 살아 있는지 확인한다 */
  await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    input.value = "#112233";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("color"));

  await sleep(700);

  const ownerAfter = await page.evaluate(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    const doc = new DOMParser().parseFromString(pkg.templates.home.html, "text/html");
    const el = doc.querySelector(".y-owner-link");
    const previewDoc = document.getElementById("studioPreviewFrame").contentDocument;
    const rendered = previewDoc.querySelector(".y-owner-link");
    return {
      hrefBinding: el ? el.getAttribute("data-imory-href") : null,
      ifBinding: el ? el.getAttribute("data-imory-if") : null,
      staticHref: el ? el.getAttribute("href") : null,
      renderedHref: rendered ? rendered.getAttribute("href") : null,
      color: rendered ? previewDoc.defaultView.getComputedStyle(rendered).color : null
    };
  });

  record(
    "L. owner/admin 링크 — 주소 입력칸 자체가 없고 runtime binding이 그대로 살아 있다",
    !ownerControls.includes("href") &&
      ownerInfo.selection.hrefPath === "viewer.adminHref" &&
      /관리자용/.test(ownerInfo.note) &&
      ownerAfter.hrefBinding === "viewer.adminHref" &&
      ownerAfter.ifBinding === "viewer.isOwner" &&
      ownerAfter.staticHref === null &&
      typeof ownerAfter.renderedHref === "string" &&
      ownerAfter.renderedHref.length > 0 &&
      ownerAfter.color === "rgb(17, 34, 51)",
    `controls=${JSON.stringify(ownerControls)} after=${JSON.stringify(ownerAfter)}`
  );

  await page.close();

}


/* =========================================================
   M. 컨테이너
========================================================== */

async function runContainer(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  await selectInPreview(page, ".y-box");
  await openDirectEdit(page);

  const controls = await listControls(page);

  await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    input.value = "#eef2ff";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("background"));

  await sleep(600);

  await page.fill(controlSelector("borderWidth"), "2");
  await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("borderWidth"));

  await sleep(600);

  await page.fill(controlSelector("radius"), "10");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("radius"));

  await sleep(600);

  await page.fill(controlSelector("padding"), "18");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("padding"));

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-box");
      return el && doc.defaultView.getComputedStyle(el).paddingTop === "18px";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const computed = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-box");
    const style = doc.defaultView.getComputedStyle(el);
    return {
      background: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      borderRadius: style.borderTopLeftRadius,
      padding: style.paddingTop
    };
  });

  record(
    "M. 컨테이너 — 배경/테두리/모서리/여백 직접 수정이 모두 적용된다",
    controls.includes("background") &&
      controls.includes("borderWidth") &&
      controls.includes("borderColor") &&
      controls.includes("radius") &&
      controls.includes("padding") &&
      computed.background === "rgb(238, 242, 255)" &&
      computed.borderTopWidth === "2px" &&
      computed.borderRadius === "10px" &&
      computed.padding === "18px",
    `controls=${JSON.stringify(controls)} computed=${JSON.stringify(computed)}`
  );

  /* "기본"으로 되돌리면 규칙에서 그 속성만 빠진다 */

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#studioInspectorFields .studio-inspector-row"));
    const row = rows.find(r => r.querySelector('[data-inspector-control="padding"]'));
    row.querySelector(".studio-inspector-clear").click();
  });

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-box");
      return el && doc.defaultView.getComputedStyle(el).paddingTop === "4px";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const afterClear = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const style = doc.defaultView.getComputedStyle(doc.querySelector(".y-box"));
    return { padding: style.paddingTop, background: style.backgroundColor };
  });

  record(
    "M2. '기본'을 누르면 그 속성만 규칙에서 빠지고 나머지는 남는다",
    afterClear.padding === "4px" && afterClear.background === "rgb(238, 242, 255)",
    JSON.stringify(afterClear)
  );

  await page.close();

}


/* =========================================================
   N, O, P. AI 호출 0회 / dirty / Save · Publish
========================================================== */

async function runState(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  const callsBefore = aiCallCount;

  await selectInPreview(page, ".y-heading");
  await openDirectEdit(page);

  await applyInspectorText(page, "저장 확인");

  await page.waitForFunction(
    () => window.getStudioAiWorkingState().isDirty === true,
    null,
    { timeout: 6000 }
  );

  /* --- P. Save --- */

  await page.click("#studioSaveButton");

  await page.waitForFunction(
    () => window.getStudioAiWorkingState().isDirty === false,
    null,
    { timeout: 8000 }
  ).then(() => true, () => false);

  const saved = await page.evaluate(() => {
    const calls = window.__savedDraftCallsY || [];
    const last = calls[calls.length - 1];
    return {
      count: calls.length,
      html: last ? (last.p_content.templates.home.html || "") : "",
      css: last ? (last.p_content.css || "") : "",
      publishDisabled: document.getElementById("studioPublishButton").disabled
    };
  });

  record(
    "P1. Save — 직접 수정 결과가 그대로 draft로 저장되고 식별자/규칙이 살아남는다",
    saved.count === 1 &&
      saved.html.includes("저장 확인") &&
      saved.html.includes("data-imory-edit-id") &&
      saved.publishDisabled === false,
    `count=${saved.count} publishDisabled=${saved.publishDisabled}`
  );

  /* --- P. Publish --- */

  await page.click("#studioPublishButton");
  await page.waitForSelector(".studio-confirm-button--primary", { state: "visible" });
  await page.click(".studio-confirm-button--primary");

  await page.waitForFunction(
    () => document.getElementById("studioPublishButton").textContent.trim() === "Published",
    null,
    { timeout: 8000 }
  ).then(() => true, () => false);

  const published = await page.evaluate(() => ({
    label: document.getElementById("studioPublishButton").textContent.trim(),
    row: window.__testHooks.getSkinRow()
  }));

  record(
    "P2. Publish — 직접 수정 뒤에도 발행 경로가 그대로 동작한다",
    published.label === "Published" &&
      published.row.current_published_version_id === published.row.current_draft_version_id,
    JSON.stringify(published)
  );

  record(
    "N. Direct Edit / Save / Publish 전 과정에서 /api/skin-ai 호출 0회",
    aiCallCount === callsBefore,
    `before=${callsBefore} after=${aiCallCount}`
  );

  await page.close();

}


/* =========================================================
   Q, R. AI Assistant 회귀
========================================================== */

async function runAi(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  await selectInPreview(page, ".y-heading");

  await page.click("#studioInspectorAiButton");

  await page.waitForFunction(
    () => window.getStudioAiPanelLayoutState().open === true,
    null,
    { timeout: 4000 }
  ).then(() => true, () => false);

  /*
    PHASE AI-6B에서 chip의 주인이 studio/ai/studio-ai-selection.js로
    옮겨졌다(#studioAiSelectionChip). "다음 단계에서 지원됩니다"
    toast도 사라졌다 — 이제 실제로 지원된다. 선택 요소 AI 수정
    자체의 검사는 studio/studio-selected-ai-e2e-test.mjs가 한다.
  */
  const aiState = await page.evaluate(() => {
    const chip = document.getElementById("studioAiSelectionChip");
    return {
      panelOpen: window.getStudioAiPanelLayoutState().open,
      chipText: chip ? chip.textContent : null,
      chipHidden: chip ? chip.hidden : null,
      focused: document.activeElement && document.activeElement.id,
      selection: window.getStudioInspectorSelection()
    };
  });

  record(
    "Q1. 'AI 수정' — AI 패널이 열리고 선택 요소가 chip으로 표시되며 입력칸에 포커스가 간다",
    aiState.panelOpen === true &&
      aiState.chipHidden === false &&
      /HOME/.test(aiState.chipText) &&
      aiState.focused === "studioAiDrawerInput" &&
      aiState.selection.editId,
    JSON.stringify(aiState)
  );

  /* --- Q2. AI 패널 자체(입력/전송 버튼)와 R. 참고 이미지 UI가 그대로 --- */

  await page.fill("#studioAiDrawerInput", "여백을 넓혀줘");

  const panelIntact = await page.evaluate(() => ({
    sendDisabled: document.getElementById("studioAiDrawerSend").disabled,
    hasAttachInput: !!document.querySelector('#studioAiPanelBody input[type="file"]'),
    attachControls: document.querySelectorAll("#studioAiPanelBody button").length
  }));

  record(
    "Q2/R. AI 패널의 입력/전송/참고 이미지 UI가 Inspector와 무관하게 그대로다",
    panelIntact.sendDisabled === false &&
      panelIntact.hasAttachInput === true &&
      panelIntact.attachControls > 0,
    JSON.stringify(panelIntact)
  );

  record(
    "Q3. AI 수정 버튼을 누른 것만으로는 OpenAI를 부르지 않는다(요구사항 1절)",
    aiCallCount === 0,
    `aiCallCount=${aiCallCount}`
  );

  await page.close();

}


/* =========================================================
   S, V. route 유지 / protected POST region
========================================================== */

async function runRoute(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  /* HOME -> CATEGORY (Inspector를 잠깐 끄고 이동한 뒤 다시 켠다 —
     Inspector 중에는 링크가 selection이므로) */

  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);

  await previewClick(page, ".y-link");
  await page.waitForFunction(
    () => window.getCurrentPreviewLocation().type === "category",
    null,
    { timeout: 6000 }
  );
  await previewHas(page, ".y-category");

  await enableInspector(page);

  await selectInPreview(page, ".y-category-title");
  await openDirectEdit(page);

  await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    input.value = "#884400";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("color"));

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-category-title");
      return el && doc.defaultView.getComputedStyle(el).color === "rgb(136, 68, 0)";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const categoryState = await page.evaluate(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    return {
      location: window.getCurrentPreviewLocation(),
      categoryHtmlHasId: /data-imory-edit-id/.test(pkg.templates.category.html),
      homeHtmlHasId: /data-imory-edit-id/.test(pkg.templates.home.html),
      postHtml: pkg.templates.post.html
    };
  });

  record(
    "S1. CATEGORY에서 고친 것은 CATEGORY template에만 쓰이고 화면도 CATEGORY에 남는다",
    categoryState.location.type === "category" &&
      categoryState.categoryHtmlHasId === true &&
      categoryState.homeHtmlHasId === false,
    JSON.stringify({ ...categoryState, postHtml: undefined })
  );

  /* CATEGORY -> POST */

  await page.click("#studioInspectorButton");
  await page.waitForFunction(() => window.getStudioInspectorState().enabled === false);

  await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-y/post/401"));

  await page.waitForFunction(
    () => window.getCurrentPreviewLocation().type === "post",
    null,
    { timeout: 8000 }
  );
  await previewHas(page, ".y-post");

  await enableInspector(page);

  /* --- V. protected POST region --- */

  await selectInPreview(page, ".y-post-body");
  await openDirectEdit(page);

  const protectedInfo = await page.evaluate(() => ({
    selection: window.getStudioInspectorSelection(),
    note: document.getElementById("studioInspectorNote").textContent,
    controls: Array.from(
      document.querySelectorAll("#studioInspectorFields [data-inspector-control]")
    ).map(el => el.dataset.inspectorControl),
    emptyText: document.querySelector("#studioInspectorFields .studio-inspector-empty")?.textContent || null
  }));

  const postHtmlAfter = await workingHtml(page, "post");

  record(
    "V. protected POST region — 직접 수정 옵션이 하나도 없고 region 선언이 그대로다",
    protectedInfo.selection.isProtectedRegion === true &&
      protectedInfo.selection.region === "post-body" &&
      protectedInfo.controls.length === 0 &&
      /보호 영역/.test(protectedInfo.note) &&
      protectedInfo.emptyText !== null &&
      postHtmlAfter.includes('data-imory-region="post-body"'),
    JSON.stringify(protectedInfo)
  );

  /* POST의 다른 요소는 정상적으로 고칠 수 있고, region은 그대로 남는다 */

  await selectInPreview(page, ".y-article-title");
  await openDirectEdit(page);

  await page.fill(controlSelector("fontSize"), "31");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("fontSize"));

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-article-title");
      return el && doc.defaultView.getComputedStyle(el).fontSize === "31px";
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const postAfter = await page.evaluate(() => {
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      location: window.getCurrentPreviewLocation(),
      hasRegion: /data-imory-region="post-body"/.test(pkg.templates.post.html),
      overlayHidden: document.getElementById("studioPreviewOverlay").hidden,
      renderedRegion: !!doc.querySelector('[data-imory-region="post-body"]')
    };
  });

  record(
    "S2/V2. POST에서 다른 요소를 고쳐도 post-body region이 살아 있고 화면도 POST에 남는다",
    postAfter.location.type === "post" &&
      postAfter.hasRegion === true &&
      postAfter.overlayHidden === true &&
      postAfter.renderedRegion === true,
    JSON.stringify(postAfter)
  );

  await page.close();

}


/* =========================================================
   U. mobile preview
========================================================== */

async function runMobile(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });

  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await sleep(600);

  await enableInspector(page);

  await selectInPreview(page, ".y-heading");

  await sleep(400);

  const geometry = await page.evaluate(() => {

    const frame = document.getElementById("studioPreviewFrame").getBoundingClientRect();
    const stage = document.getElementById("studioPreviewStage").getBoundingClientRect();
    const box = document.getElementById("studioInspectorSelectBox").getBoundingClientRect();
    const popover = document.getElementById("studioInspectorPopover").getBoundingClientRect();

    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const inner = doc.querySelector(".y-heading").getBoundingClientRect();

    const scale = frame.width / document.getElementById("studioPreviewFrame").offsetWidth;

    return {
      scale,
      boxInsideFrame:
        box.left >= frame.left - 1 &&
        box.top >= frame.top - 1 &&
        box.right <= frame.right + 1 &&
        box.bottom <= frame.bottom + 1,
      widthMatchesScaled: Math.abs(box.width - inner.width * scale) <= 2,
      popoverInsideStage:
        popover.left >= stage.left - 1 &&
        popover.right <= stage.right + 1 &&
        popover.top >= stage.top - 1 &&
        popover.bottom <= stage.bottom + 1,
      documentOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };

  });

  record(
    "U. Mobile Preview — 축소 배율까지 반영해 테두리가 그려지고 팝오버가 stage 안에 머문다",
    geometry.scale > 0 &&
      geometry.boxInsideFrame &&
      geometry.widthMatchesScaled &&
      geometry.popoverInsideStage &&
      geometry.documentOverflow,
    JSON.stringify(geometry)
  );

  await page.close();

}


/* =========================================================
   V. 선택 복원의 근거 — 구조 경로 id 만으로는 되살리지 않는다
      (SANDBOX-6A 후속, 2026-09-17)

   임시 식별자는 구조 경로다("e0-0" = body 첫 자식의 첫 자식).
   그래서 고른 요소가 사라지거나 앞쪽이 바뀌면 **뒤 형제가 그
   자리로 밀려와 같은 id 를 물려받는다.** id 만 보고 되살리면
   엉뚱한 요소가 선택된 채로 남고, 그 상태에서 AI 수정을 보내면
   사용자가 보지도 않은 요소가 바뀐다.

   ★ draft 를 바꾸는 방법으로 applyAiSkinPackage() 를 쓴다 —
     Import/AI 가 실제로 지나는 그 경로다(전용 우회가 아니다).
     그 안에서 bumpStudioWorkingRevision() 이 돌고, 거기서
     reconcileStudioInspectorSelection() 이 불린다.
========================================================== */

/* 지금 draft 의 HOME html 을 바꾼 새 SkinPackage 를 적용한다 */
async function applyHomeHtml(page, transform) {

  return page.evaluate((fnSource) => {

    const state =
      window.getStudioAiWorkingState({ includePackage: true });

    const html =
      state.skinPackage.templates.home.html;

    /* eslint-disable no-new-func */
    const next =
      new Function("html", `return (${fnSource})(html);`)(html);

    const applied =
      window.applyAiSkinPackage(
        {
          ...state.skinPackage,
          templates: {
            ...state.skinPackage.templates,
            home: { ...state.skinPackage.templates.home, html: next }
          }
        },
        { source: "e2e-identity" }
      );

    return { ok: applied.ok, reason: applied.reason || "" };

  }, transform.toString());

}


/* =========================================================
   완전히 같은 형제를 고른다 (V7~V8)

   selectInPreview() 는 ".클래스" 하나만 받고 "그 클래스가 선택됐다"
   로 기다린다 — 형제가 똑같으면 그 조건으로는 **몇 번째를 골랐는지**
   를 확인할 수 없다. 그래서 여기서는 구조 선택자로 누르고, 고른 뒤
   draft 에서 그 id 가 정말 그 자리인지 editId 로 되짚는다.
========================================================== */
async function selectNthTwin(page, nth, expectedCount) {

  /* 방금 적용한 HTML 이 Preview 에 실제로 그려질 때까지 기다린다 —
     WebKit 은 여기서 한 박자 늦고, 그 사이에 누르면 아무 것도
     고르지 못한다. */
  await page.waitForFunction(
    (count) => {
      const doc =
        document.getElementById("studioPreviewFrame").contentDocument;
      return (
        !!doc &&
        doc.querySelectorAll(".y-twins .y-twin").length === count
      );
    },
    expectedCount,
    { timeout: 8000 }
  );

  await previewClick(page, `.y-twins .y-twin:nth-child(${nth})`);

  await page.waitForFunction(
    () => {
      const selection = window.getStudioInspectorSelection();
      return !!selection && selection.classNames.indexOf("y-twin") !== -1;
    },
    null,
    { timeout: 6000 }
  );

  /* 지금 고른 것이 정말 nth 번째인가 — preview DOM 에서 확인한다 */
  return page.evaluate((index) => {

    const doc =
      document.getElementById("studioPreviewFrame").contentDocument;

    const twins =
      Array.from(doc.querySelectorAll(".y-twins .y-twin"));

    const selection =
      window.getStudioInspectorSelection();

    return {
      editId: selection && selection.editId,
      isNth:
        !!twins[index - 1] &&
        twins[index - 1].getAttribute("data-imory-edit-id") ===
          (selection && selection.editId)
    };

  }, nth);

}


async function selectionAfter(page) {

  await sleep(500);

  return page.evaluate(() => {

    const state =
      window.getStudioInspectorState();

    return {
      selection: window.getStudioInspectorSelection(),
      raw: state.selection,
      lostReason: state.lostReason
    };

  });

}


async function runIdentity(context) {

  /* --- V1. 고른 요소를 지우면 해제된다 ----------------- */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-heading");

    const picked = await page.evaluate(() => window.getStudioInspectorSelection());

    /* h1 을 통째로 지운다 — 뒤 <img class="y-avatar"> 가 그 자리로
       밀려와 같은 구조 경로 id 를 물려받는다. */
    await applyHomeHtml(page, (html) =>
      html.replace('<h1 class="y-heading">Recent Notes</h1>', "")
    );

    const after = await selectionAfter(page);

    record(
      "V1. 고른 요소를 지우면 — 뒤 형제가 같은 id 를 물려받아도 선택이 해제된다",
      after.selection === null && after.raw === null &&
        after.lostReason === "mismatch",
      `editId=${picked && picked.editId} lost=${after.lostReason}`
    );

    record(
      "V1b. 그때 Inspector 팝오버도 닫힌다",
      (await page.evaluate(
        () => document.getElementById("studioInspectorPopover").hidden
      )) === true
    );

    await page.close();
  }


  /* --- V2. 앞 형제를 새로 넣으면 해제된다 -------------- */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-box");

    await applyHomeHtml(page, (html) =>
      html.replace('<div class="y-home">', '<div class="y-home"><p class="y-inserted">새 줄</p>')
    );

    const after = await selectionAfter(page);

    record(
      "V2. 앞에 형제를 끼워 넣어 경로가 한 칸씩 밀리면 선택이 해제된다",
      after.selection === null && after.lostReason === "mismatch",
      `lost=${after.lostReason}`
    );

    await page.close();
  }


  /* --- V3. 앞 형제를 지우면 해제된다 ------------------- */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-box");

    await applyHomeHtml(page, (html) =>
      html.replace('<a class="y-link" href="/scenario-y/category/301">카테고리 보기</a>', "")
    );

    const after = await selectionAfter(page);

    record(
      "V3. 앞 형제를 지워 경로가 당겨져도 선택이 해제된다",
      after.selection === null && after.lostReason === "mismatch",
      `lost=${after.lostReason}`
    );

    await page.close();
  }


  /* --- V4. 순서를 바꾸면 해제된다 ---------------------- */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-heading");

    /* h1 과 그 뒤 두 <img> 의 순서를 뒤집는다 */
    await applyHomeHtml(page, (html) =>
      html.replace(
        '<h1 class="y-heading">Recent Notes</h1>' +
        '<img class="y-avatar" data-imory-src="profile.avatarUrl" alt="프로필">',
        '<img class="y-avatar" data-imory-src="profile.avatarUrl" alt="프로필">' +
        '<h1 class="y-heading">Recent Notes</h1>'
      )
    );

    const after = await selectionAfter(page);

    record(
      "V4. 순서가 바뀌어 다른 요소가 그 자리에 오면 선택이 해제된다",
      after.selection === null && after.lostReason === "mismatch",
      `lost=${after.lostReason}`
    );

    await page.close();
  }


  /* --- V5. 과잉 해제 방지 — 그 요소가 그대로면 유지된다 - */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-heading");

    const picked = await page.evaluate(() => window.getStudioInspectorSelection());

    /* HTML 은 한 글자도 건드리지 않고 CSS 만 바꾼다 */
    await page.evaluate(() => {

      const state =
        window.getStudioAiWorkingState({ includePackage: true });

      window.applyAiSkinPackage(
        { ...state.skinPackage, css: state.skinPackage.css + "\n.y-home { opacity: 0.99; }\n" },
        { source: "e2e-identity-css" }
      );

    });

    const after = await selectionAfter(page);

    record(
      "V5. 그 요소가 그대로면 재렌더 뒤에도 선택이 유지된다 (과잉 해제 없음)",
      !!after.selection && after.selection.editId === picked.editId,
      `${picked.editId} -> ${after.selection && after.selection.editId}`
    );

    await page.close();
  }


  /* --- V6. 승격된 id 는 자리가 바뀌어도 그 요소를 따라간다 - */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-heading");
    await openDirectEdit(page);

    /* 한 번 직접 수정하면 그 id 가 SkinPackage HTML 에 글자로
       남는다(승격) — 그 뒤로는 구조 경로가 아니라 그 id 자체가
       근거다. */
    await applyInspectorText(page, "승격된 제목");

    const picked = await page.evaluate(() => window.getStudioInspectorSelection());

    const promoted = await page.evaluate(() =>
      window.getStudioAiWorkingState({ includePackage: true })
        .skinPackage.templates.home.html.includes("data-imory-edit-id")
    );

    /* 이제 앞에 형제를 끼워 넣어 구조 경로를 통째로 밀어 버린다 */
    await applyHomeHtml(page, (html) =>
      html.replace('<div class="y-home">', '<div class="y-home"><p class="y-inserted">새 줄</p>')
    );

    const after = await selectionAfter(page);

    record(
      "V6. 승격된 id 는 앞에 형제가 끼어들어도 그 요소를 그대로 가리킨다",
      promoted === true &&
        !!after.selection &&
        after.selection.editId === picked.editId &&
        after.selection.text === "승격된 제목",
      `promoted=${promoted} text=${after.selection && after.selection.text}`
    );

    await page.close();
  }


  /* =======================================================
     V7~V10. 완전히 같은 형제 (2026-09-17 보완)

     V1~V6 은 "자리를 물려받은 요소가 **다르게 생겼다**"에 기대고
     있었다. 목록 카드처럼 형제가 서로 똑같으면 그 기대가 무너진다 —
     지문(태그·클래스·속성·자식 수·제 텍스트)이 셋 다 같으므로
     하나를 지워도 "그 요소 맞다"가 나온다.

     여기서는 일부러 똑같은 형제 셋을 만들어 두고, 그중 하나를
     지우거나 순서를 바꾼다. 기대는 "다른 형제로 넘어가지 않는다"
     이고, 확정할 수 없으면 해제다
     (studio-inspector-model.js inspectorSelectionSignature).
  ======================================================== */

  /* --- V7. 완전히 같은 형제 중 앞의 것을 지우면 해제된다 --- */

  {
    const page = await openStudio(context);
    await enableInspector(page);

    /* 셋은 글자 단위로 똑같다 */
    await applyHomeHtml(page, (html) =>
      html.replace(
        '<p class="y-below">아래 문단</p>',
        '<ul class="y-twins">' +
        '<li class="y-twin"><span class="y-twin-in">쌍둥이</span></li>' +
        '<li class="y-twin"><span class="y-twin-in">쌍둥이</span></li>' +
        '<li class="y-twin"><span class="y-twin-in">쌍둥이</span></li>' +
        '</ul><p class="y-below">아래 문단</p>'
      )
    );

    const picked = await selectNthTwin(page, 2, 3);

    /* 첫째만 지운다 — 셋째가 가운데의 구조 경로 id 를 물려받고,
       지문까지 똑같다. */
    await applyHomeHtml(page, (html) =>
      html.replace(
        '<li class="y-twin"><span class="y-twin-in">쌍둥이</span></li>',
        ""
      )
    );

    const after = await selectionAfter(page);

    const twinsLeft = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return doc.querySelectorAll(".y-twins .y-twin").length;
    });

    record(
      "V7. ★ 똑같은 형제 중 하나를 지우면 — 지문이 같아도 선택이 다른 형제로 넘어가지 않고 해제된다",
      picked.isNth === true &&
        twinsLeft === 2 &&
        after.selection === null &&
        after.raw === null &&
        after.lostReason === "mismatch",
      `editId=${picked && picked.editId} nth=${picked.isNth} twins=${twinsLeft} lost=${after.lostReason}`
    );

    await page.close();
  }


  /* --- V8. 겉이 같고 속이 다른 형제의 순서를 바꾸면 해제된다 --- */

  {
    const page = await openStudio(context);
    await enableInspector(page);

    /* 두 형제의 지문(태그·클래스·자식 수·제 텍스트)은 같고
       **안쪽 글자만** 다르다 — 순서를 바꾸면 자리는 그대로이므로
       subtree 를 보지 않으면 갈리지 않는다. */
    await applyHomeHtml(page, (html) =>
      html.replace(
        '<p class="y-below">아래 문단</p>',
        '<ul class="y-twins">' +
        '<li class="y-twin"><span class="y-twin-in">A</span></li>' +
        '<li class="y-twin"><span class="y-twin-in">B</span></li>' +
        '</ul><p class="y-below">아래 문단</p>'
      )
    );

    const picked = await selectNthTwin(page, 1, 2);

    await applyHomeHtml(page, (html) =>
      html.replace(
        '<li class="y-twin"><span class="y-twin-in">A</span></li>' +
        '<li class="y-twin"><span class="y-twin-in">B</span></li>',
        '<li class="y-twin"><span class="y-twin-in">B</span></li>' +
        '<li class="y-twin"><span class="y-twin-in">A</span></li>'
      )
    );

    const after = await selectionAfter(page);

    const order = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return Array.from(doc.querySelectorAll(".y-twins .y-twin-in"))
        .map((el) => el.textContent.trim())
        .join("");
    });

    record(
      "V8. ★ 겉만 같은 형제의 순서가 바뀌면(속이 다르다) 선택이 해제된다",
      picked.isNth === true &&
        order === "BA" &&
        after.selection === null &&
        after.lostReason === "mismatch",
      `editId=${picked && picked.editId} nth=${picked.isNth} order=${order} lost=${after.lostReason}`
    );

    await page.close();
  }


  /* --- V9. 승격된 id 가 복제되면 되살리지 않는다 ------------ */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-heading");
    await openDirectEdit(page);

    await applyInspectorText(page, "승격된 제목");

    const picked = await page.evaluate(() => window.getStudioInspectorSelection());

    /* Code Editor 복붙 · AI 가 노드를 통째로 베낀 경우와 같은 결과 —
       같은 id 를 단 요소가 둘이 된다. 그때 querySelector 가 돌려주는
       첫 번째가 사용자가 고른 그 요소라는 보장이 없다. */
    const duplicated = await applyHomeHtml(page, (html) => {

      const found =
        html.match(/<h1[^>]*data-imory-edit-id="[^"]*"[^>]*>[^<]*<\/h1>/);

      return found ? html.replace(found[0], found[0] + found[0]) : html;

    });

    const after = await selectionAfter(page);

    const copies = await page.evaluate((editId) => {
      const html =
        window.getStudioAiWorkingState({ includePackage: true })
          .skinPackage.templates.home.html;
      return html.split(`data-imory-edit-id="${editId}"`).length - 1;
    }, picked.editId);

    record(
      "V9. ★ 승격된 id 라도 HTML 안에 둘이면 되살리지 않는다 (ambiguous)",
      duplicated.ok === true &&
        copies === 2 &&
        after.selection === null &&
        after.lostReason === "ambiguous",
      `copies=${copies} lost=${after.lostReason}`
    );

    await page.close();
  }


  /* --- V10. 과잉 해제 방지 — 남의 글자만 바뀌면 유지된다 ---- */

  {
    const page = await openStudio(context);
    await enableInspector(page);
    await selectInPreview(page, ".y-heading");

    const picked = await page.evaluate(() => window.getStudioInspectorSelection());

    /* 고른 요소도, 그 자리도, 그 속도 그대로다 — 형제의 글자만
       바뀌었다. 이런 변경까지 해제하면 쓸 수 없는 도구가 된다. */
    await applyHomeHtml(page, (html) =>
      html.replace("아래 문단", "아래 문단 (고침)")
    );

    const after = await selectionAfter(page);

    record(
      "V10. 관계없는 형제의 글자만 바뀌면 선택이 유지된다 (과잉 해제 없음)",
      !!after.selection && after.selection.editId === picked.editId,
      `${picked.editId} -> ${after.selection && after.selection.editId}`
    );

    await page.close();
  }

}


/* =========================================================
   W. 좁은 Studio 창(390px)에서의 Select 진입 (2026-09-17)

   예전에는 720px 이하에서 Select 버튼을 감췄다. 그래서 모바일
   에서는 Select 도, 그 뒤의 선택 요소 AI 도 길이 없었다. 지금은
   Top Dock 이 여러 줄로 접히므로 감추지 않는다
   (studio/inspector/studio-inspector.css 의 같은 media query 주석).

   여기서 보는 것: 버튼이 실제로 눌리는 자리에 있고, **터치**로
   고를 수 있고, 선택을 풀 수 있고, AI 패널로 이어지는가. 그리고
   그 폭에서 가로 넘침이 생기지 않는가.
========================================================== */

async function runNarrow(context) {

  const page = await openStudio(context, { viewport: { width: 390, height: 780 } });

  const dock = await page.evaluate(() => {

    const button =
      document.getElementById("studioInspectorButton");

    const rect =
      button.getBoundingClientRect();

    return {
      display: getComputedStyle(button).display,
      inViewport:
        rect.left >= 0 && rect.right <= window.innerWidth + 1 &&
        rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
      height: Math.round(rect.height),
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };

  });

  record(
    "W1. 390px 에서도 Select 버튼이 화면 안에 있다",
    dock.display !== "none" && dock.inViewport === true && dock.overflow === true,
    JSON.stringify(dock)
  );

  await enableInspector(page);

  /* --- 터치로 고른다 --------------------------------- */

  const tapped = await page.evaluate(() => {

    const doc =
      document.getElementById("studioPreviewFrame").contentDocument;

    const el =
      doc.querySelector(".y-heading");

    if (!el) {
      return false;
    }

    /*
      손가락과 같은 순서로 보낸다 — pointerdown(touch) 뒤에 click.
      Inspector 는 pointerdown 에서 고르고 click 은 삼킨다.
    */
    el.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true, button: 0
    }));

    el.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true, button: 0
    }));

    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    return true;

  });

  await page.waitForFunction(
    () => {
      const s = window.getStudioInspectorSelection();
      return !!s && s.classNames.indexOf("y-heading") !== -1;
    },
    null,
    { timeout: 6000 }
  ).then(() => true, () => false);

  const touchSelection = await page.evaluate(() => window.getStudioInspectorSelection());

  record(
    "W2. 390px 에서 터치(pointerdown)로 요소를 고를 수 있다",
    tapped === true &&
      !!touchSelection &&
      touchSelection.classNames.indexOf("y-heading") !== -1,
    JSON.stringify(touchSelection && { tag: touchSelection.tagName })
  );

  const panelFits = await page.evaluate(() => {

    const popover =
      document.getElementById("studioInspectorPopover");

    const rect =
      popover.getBoundingClientRect();

    return {
      hidden: popover.hidden,
      inViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1,
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };

  });

  record(
    "W3. 선택 패널이 390px 안에 들어오고 가로 넘침이 없다",
    panelFits.hidden === false &&
      panelFits.inViewport === true &&
      panelFits.overflow === true,
    JSON.stringify(panelFits)
  );

  /* --- AI 패널로 이어진다 ----------------------------- */

  await page.click("#studioInspectorAiButton");

  await sleep(400);

  const aiLinked = await page.evaluate(() => {

    const chip =
      document.getElementById("studioAiSelectionChip");

    return {
      panelOpen: window.getStudioAiPanelDebugState
        ? window.getStudioAiPanelDebugState().open
        : null,
      chipHidden: chip ? chip.hidden : null,
      hasContext: !!(window.getStudioAiSelectionContext &&
        window.getStudioAiSelectionContext()),
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };

  });

  record(
    "W4. 390px 에서도 고른 요소가 AI 패널로 이어진다 (chip + selectionContext)",
    aiLinked.chipHidden === false &&
      aiLinked.hasContext === true &&
      aiLinked.overflow === true,
    JSON.stringify(aiLinked)
  );

  /* --- 직접 편집은 여전히 열린다(native 이므로) -------- */

  record(
    "W5. native Preview 이므로 직접 수정은 그대로 열려 있다",
    (await page.evaluate(
      () => document.getElementById("studioInspectorDirectButton").disabled
    )) === false
  );

  /* --- 선택 종료 -------------------------------------- */

  await page.keyboard.press("Escape");

  await sleep(300);

  record(
    "W6. 390px 에서 선택을 풀 수 있다 (Escape)",
    (await page.evaluate(() => window.getStudioInspectorSelection())) === null &&
      (await page.evaluate(
        () => document.getElementById("studioInspectorPopover").hidden
      )) === true
  );

  /* --- Select 모드 종료 ------------------------------- */

  await page.click("#studioInspectorButton");

  await page.waitForFunction(
    () => window.getStudioInspectorState().enabled === false,
    null,
    { timeout: 6000 }
  );

  record(
    "W7. 390px 에서 Select 모드를 끌 수 있다",
    (await page.evaluate(() => window.getStudioInspectorState().enabled)) === false
  );

  await page.close();

}


/* =========================================================
   실행
========================================================== */

async function main() {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {

    if (shouldRun("mode")) await runMode(context);
    if (shouldRun("text")) await runText(context);
    if (shouldRun("image")) await runImage(context);
    if (shouldRun("link")) await runLink(context);
    if (shouldRun("container")) await runContainer(context);
    if (shouldRun("state")) await runState(context);
    if (shouldRun("ai")) await runAi(context);
    if (shouldRun("route")) await runRoute(context);
    if (shouldRun("mobile")) await runMobile(context);
    if (shouldRun("identity")) await runIdentity(context);
    if (shouldRun("narrow")) await runNarrow(context);

    record(
      "Z. 콘솔 에러 없음",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 6).join("\n        ")
    );

  } finally {

    await context.close();
    await browser.close();
    server.close();

  }

  const failed = results.filter(r => !r.pass);

  console.log(`\n${results.length - failed.length}/${results.length} PASS`);

  if (failed.length) {
    console.log("\nFAILED:");
    failed.forEach(f => console.log(` - ${f.name}`));
    process.exitCode = 1;
  }

}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
