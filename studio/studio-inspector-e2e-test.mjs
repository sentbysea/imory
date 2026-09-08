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
     Q. AI Assistant 기능 회귀 없음(패널 열기/선택 chip)
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


async function selectInPreview(page, selector) {

  await previewClick(page, selector);

  await page.waitForFunction(
    () => window.getStudioInspectorState().selection !== null,
    null,
    { timeout: 4000 }
  );

}


async function openDirectEdit(page) {

  const open = await page.evaluate(() => window.getStudioInspectorState().editingOpen);

  if (!open) {
    await page.click("#studioInspectorDirectButton");
  }

  await page.waitForFunction(() => window.getStudioInspectorState().editingOpen === true);

}


function controlSelector(control) {
  return `#studioInspectorFields [data-inspector-control="${control}"]`;
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

  await page.fill(controlSelector("text"), "최근 기록");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("text"));

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

  await page.fill(controlSelector("text"), "카테고리로");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("text"));

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

  await page.fill(controlSelector("text"), "저장 확인");
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new Event("change", { bubbles: true }));
  }, controlSelector("text"));

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

  const aiState = await page.evaluate(() => {
    const chip = document.getElementById("studioInspectorAiChip");
    return {
      panelOpen: window.getStudioAiPanelLayoutState().open,
      chipText: chip ? chip.textContent : null,
      chipHidden: chip ? chip.hidden : null,
      toast: document.getElementById("studioToast").textContent,
      selection: window.getStudioInspectorSelection()
    };
  });

  record(
    "Q1. 'AI 수정' — AI 패널이 열리고 선택 요소가 chip으로 표시되며 다음 단계 안내가 뜬다",
    aiState.panelOpen === true &&
      aiState.chipHidden === false &&
      /HOME/.test(aiState.chipText) &&
      /다음 단계/.test(aiState.toast) &&
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
    "Q3. AI 수정 버튼은 이번 Phase에서 OpenAI를 부르지 않는다",
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
