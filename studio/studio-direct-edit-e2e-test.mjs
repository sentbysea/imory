/* =========================================================
   SELECT MODE 직접 편집(텍스트 내용 / 이미지 크기) E2E

   AI를 부르지 않고 끝내는 두 가지 — "문구 고치기"와 "이미지 크기
   바꾸기" — 를 사용자 동작 그대로 확인한다. /api/skin-ai는 가로채
   호출 횟수만 세고 전부 실패시킨다(한 번이라도 나가면 FAIL).

   저장소의 실제 파일(studio/inspector/*, studio/preview/*,
   skin/*)을 그대로 서빙하고 Supabase만 in-memory mock으로 바꾼다
   (studio/studio-lifecycle-scenario.html?scenario=y). 그 하네스의
   Top Dock은 이제 실제 Studio와 같은 버튼 구성이다
   (Code / Import / Export / Images / Save / Publish + AI Assistant)
   — Images 하나가 빠진 좁은 바에서 좌표를 재지 않기 위해서다.

   검사 범위
     A. 텍스트 — 여러 줄 + 한글(IME) 입력 → 적용 → Undo
     B. 텍스트 — 취소하면 원래 문구로 돌아가고 임시 상태가 남지 않음
     C. 바인딩 텍스트 — 입력칸 대신 안내, 연결(data-imory-bind) 유지
     D. 이미지 — 숫자 입력 / 슬라이더 / 모서리 드래그 결과가 일치
     E. 이미지 — 정사각형(프로필)·가로형(헤더) 비율 유지, object-fit 보존
     F. 드래그 — Escape 취소 / 포인터 이탈 / 선택 변경 뒤 임시 상태 정리
     G. 좌표 — Desktop/Mobile, AI 패널 열림/닫힘에서 핸들 위치 일치
     H. 모바일 — 크기 조절 후에도 가로 넘침 없음
     I. 저장 — Save → 그 content로 다시 열기 / Export → Import 유지
     J. 슬롯 없는 정적 이미지도 크기 조절 가능, 슬롯 연결은 보존
     K. Undo — 슬라이더/드래그 한 번은 Undo 한 번으로 복원
     N. 전 과정 /api/skin-ai 호출 0회
     Z. 콘솔 에러 없음

   ★ 실행 방법
     node studio/studio-direct-edit-e2e-test.mjs
     node studio/studio-direct-edit-e2e-test.mjs --browser=webkit
     node studio/studio-direct-edit-e2e-test.mjs --only=text

   --only= 뒤에 쓸 수 있는 이름:
     text / image / drag / geometry / persist
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8945;
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


let aiCallCount = 0;

const consoleErrors = [];


/*
  fixture의 이미지(https://example.com/*.png)에 진짜 바이트를 준다.

  꼭 필요하다 — 로드에 실패한 <img>는 브라우저가 "alt 텍스트를 담은
  일반 인라인 요소"로 취급해서 CSS width/height가 아예 먹지 않는다
  (실측 120x120 대신 alt 글자 크기인 64x21이 나온다). 크기·비율을
  재는 테스트에서 그 상태를 기준으로 삼으면 아무 의미가 없다.
  1x1 투명 PNG면 충분하다 — 상자 크기는 스킨 CSS가 정하고, 이번
  기능도 자연 크기가 아니라 "화면에 보이는 크기"를 쓰기 때문이다.
*/
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);


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

  await page.route("https://example.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: ONE_PIXEL_PNG });
  });

  /* Save 후 "다시 열기"를 흉내 낼 때는 저장된 content를 fixture에
     심어 준다(scenario y의 window.__scenarioYSkinPackage 분기). */
  if (options && options.seedPackage) {
    await page.addInitScript(
      (pkg) => { window.__scenarioYSkinPackage = pkg; },
      options.seedPackage
    );
  }

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

  await previewHas(page, "[data-imory-edit-id]");

}


/*
  Preview 안 요소를 고른다. 선택자는 항상 ".클래스" 하나다.

  "선택이 null이 아니다"로 기다리면 안 된다 — 앞 단계에서 이미 무언가
  고른 상태라면 그 조건은 처음부터 참이라, 새 클릭이 아직 도착하지도
  않았는데 다음 단계로 넘어간다(WebKit에서 실제로 그랬다). **그 요소가**
  선택될 때까지 기다린다.
*/
async function selectInPreview(page, selector) {

  const className =
    selector.replace(/^\./, "");

  await page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    if (!el) throw new Error("preview element not found: " + sel);
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, selector);

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
  "직접 수정"을 펼친다.

  한 번 눌러서 안 열리면 다시 누른다 — 선택 직후에 iframe에서 뒤늦게
  올라온 select 메시지 하나가 폼을 다시 접을 수 있기 때문이다(새
  요소를 고르면 폼은 접힌 상태로 시작한다는 규칙 그대로다). 사람이
  쓸 때는 그 사이가 워낙 짧아 겪을 일이 없지만, 스크립트는 선택하자
  마자 누르므로 WebKit에서 가끔 그 틈에 들어간다.
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


/*
  px 입력칸에 값을 넣고 확정한다.

  page.fill 대신 한 번의 evaluate로 값 + input + change를 함께
  보낸다 — 이 폼은 편집이 확정될 때마다 통째로 다시 그려지므로,
  Playwright가 "요소를 찾고 → 포커스하고 → 타이핑"하는 사이에
  그 입력칸이 교체될 수 있다(WebKit에서 실제로 그렇다). 사용자가
  겪는 동작은 같다: 값이 바뀌고(input) 확정된다(change).
*/
async function setInspectorSizeNumber(page, value) {

  await page.evaluate((next) => {
    const input = document.getElementById("studioInspectorSizeNumber");
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);

}


function workingPackage(page) {
  return page.evaluate(() =>
    window.getStudioAiWorkingState({ includePackage: true }).skinPackage
  );
}


function workingCss(page) {
  return page.evaluate(() =>
    window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css || ""
  );
}


/* Preview 안 요소의 실제 상자 — 크기/비율 검증의 유일한 근거다.
   (CSS 문자열이 아니라 "화면에 실제로 그려진 값"을 본다.) */
async function previewBox(page, selector) {
  return page.evaluate((sel) => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const computed = doc.defaultView.getComputedStyle(el);
    return {
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      objectFit: computed.objectFit,
      whiteSpace: computed.whiteSpace,
      maxWidth: computed.maxWidth,
      src: el.getAttribute("src"),
      /* 임시 미리보기가 남았는지는 "선언이 하나라도 있는가"로 본다 —
         선언이 0개인 style="" 는 화면에 아무 영향이 없다. */
      inlineDeclarations: el.style.length
    };
  }, selector);
}


function inspectorState(page) {
  return page.evaluate(() => window.getStudioInspectorState());
}


/* 핸들의 화면 좌표(중심). overlay가 Preview의 축소 배율/스크롤/
   패널 폭을 제대로 반영하는지 재는 기준점이다. */
async function handleCenters(page) {
  return page.evaluate(() => {
    const out = {};
    ["nw", "ne", "sw", "se"].forEach((corner) => {
      const el = document.getElementById(`studioInspectorHandle-${corner}`);
      if (!el || el.hidden) { out[corner] = null; return; }
      const r = el.getBoundingClientRect();
      out[corner] = {
        x: Math.round((r.left + r.width / 2) * 10) / 10,
        y: Math.round((r.top + r.height / 2) * 10) / 10
      };
    });
    return out;
  });
}


/* Preview 안 요소의 화면 좌표(부모 문서 기준) — 핸들이 정말 그
   요소의 모서리 위에 있는지 비교할 대상이다. */
async function previewRectOnScreen(page, selector) {
  return page.evaluate((sel) => {
    const frameEl = document.getElementById("studioPreviewFrame");
    const doc = frameEl.contentDocument;
    const el = doc.querySelector(sel);
    if (!el) return null;
    const box = frameEl.getBoundingClientRect();
    const scale = box.width / (frameEl.offsetWidth || box.width || 1);
    const style = window.getComputedStyle(frameEl);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const rect = el.getBoundingClientRect();
    const left = box.left + (borderLeft + rect.left) * scale;
    const top = box.top + (borderTop + rect.top) * scale;
    return {
      left: Math.round(left * 10) / 10,
      top: Math.round(top * 10) / 10,
      right: Math.round((left + rect.width * scale) * 10) / 10,
      bottom: Math.round((top + rect.height * scale) * 10) / 10,
      scale
    };
  }, selector);
}


const near = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;


/* =========================================================
   A~C. 텍스트 내용
========================================================== */

async function runText(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  await selectInPreview(page, ".y-heading");
  await openDirectEdit(page);

  /* --- 폼 순서: 텍스트 내용이 스타일 옵션보다 먼저다 --- */

  const order = await page.evaluate(() => {
    const fields = document.getElementById("studioInspectorFields");
    const nodes = Array.from(fields.querySelectorAll("[data-inspector-control]"));
    return {
      first: nodes[0] ? nodes[0].dataset.inspectorControl : null,
      isTextarea: nodes[0] ? nodes[0].tagName.toLowerCase() : null,
      hasApply: !!document.getElementById("studioInspectorTextApply"),
      hasCancel: !!document.getElementById("studioInspectorTextCancel"),
      value: document.getElementById("studioInspectorTextInput")?.value
    };
  });

  record(
    "A1. '텍스트 내용'이 맨 위에 여러 줄 입력칸(textarea)으로 나오고 기존 문구가 채워져 있다",
    order.first === "text" &&
      order.isTextarea === "textarea" &&
      order.hasApply === true &&
      order.hasCancel === true &&
      order.value === "Recent Notes",
    JSON.stringify(order)
  );

  /* --- 한글 IME 입력: 조합 중에는 확정되지 않는다 --- */

  await page.click("#studioInspectorTextInput");

  const composing = await page.evaluate(() => {
    const input = document.getElementById("studioInspectorTextInput");
    input.value = "";
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    /* 조합 중 — 브라우저가 실제로 보내는 순서(입력 이벤트가 조합
       문자열을 실어 온다)를 그대로 흉내 낸다 */
    input.value = "ㅊ";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "ㅊ", isComposing: true }));
    input.value = "최";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "최", isComposing: true }));
    return {
      composing: window.getStudioInspectorState().composing,
      dirty: window.getStudioAiWorkingState().isDirty
    };
  });

  await page.evaluate(() => {
    const input = document.getElementById("studioInspectorTextInput");
    input.value = "최근 기록";
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "최근 기록" }));
  });

  await sleep(200);

  const afterCompose = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      focusedId: document.activeElement ? document.activeElement.id : null,
      inputValue: document.getElementById("studioInspectorTextInput").value,
      previewText: doc.querySelector(".y-heading").textContent,
      state: window.getStudioInspectorState(),
      dirty: window.getStudioAiWorkingState().isDirty
    };
  });

  record(
    "A2. 한글 조합 중에는 아무 것도 확정되지 않고, 조합이 끝나면 Preview에만 미리 보인다(포커스/입력값 유지)",
    composing.composing === true &&
      composing.dirty === false &&
      afterCompose.focusedId === "studioInspectorTextInput" &&
      afterCompose.inputValue === "최근 기록" &&
      afterCompose.previewText === "최근 기록" &&
      afterCompose.dirty === false &&
      afterCompose.state.textDraft === "최근 기록",
    JSON.stringify({ composing, afterCompose: { ...afterCompose, state: undefined } })
  );

  /* --- 여러 줄 입력 + 적용 --- */

  const multiline = "첫 줄입니다\n둘째 줄입니다";

  await page.fill("#studioInspectorTextInput", multiline);

  const beforeApply = await page.evaluate(() => ({
    dirty: window.getStudioAiWorkingState().isDirty,
    hasUndo: window.getStudioInspectorState().hasUndo
  }));

  await page.click("#studioInspectorTextApply");

  await page.waitForFunction(
    () => window.getStudioAiWorkingState().isDirty === true,
    null,
    { timeout: 6000 }
  );

  await sleep(400);

  const box = await previewBox(page, ".y-heading");
  const pkg = await workingPackage(page);
  const applied = await inspectorState(page);

  record(
    "A3. 여러 줄 입력을 '적용'하면 한 번의 편집으로 확정되고, 줄바꿈이 화면에 남는다",
    beforeApply.dirty === false &&
      pkg.templates.home.html.includes("첫 줄입니다\n둘째 줄입니다") &&
      box.whiteSpace === "pre-wrap" &&
      applied.textDraft === null &&
      applied.hasUndo === true,
    JSON.stringify({ beforeApply, whiteSpace: box.whiteSpace, applied: { textDraft: applied.textDraft, hasUndo: applied.hasUndo } })
  );

  /* HTML로 해석되지 않는다 */

  await page.fill("#studioInspectorTextInput", "<b>굵게</b> & <i>기울임</i>");
  await page.click("#studioInspectorTextApply");
  await sleep(400);

  const escaped = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-heading");
    const pkgHtml = window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html;
    return {
      childElements: el.children.length,
      text: el.textContent,
      templateHasTag: /<b>굵게<\/b>/.test(pkgHtml)
    };
  });

  record(
    "A4. 입력은 HTML이 아니라 텍스트로 들어간다(<b>가 태그가 되지 않는다)",
    escaped.childElements === 0 &&
      escaped.text === "<b>굵게</b> & <i>기울임</i>" &&
      escaped.templateHasTag === false,
    JSON.stringify(escaped)
  );

  /* --- Undo --- */

  await page.click("#studioInspectorUndoButton");
  await sleep(500);

  const afterUndo = await previewBox(page, ".y-heading");
  const undoText = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return doc.querySelector(".y-heading").textContent;
  });

  record(
    "A5. Undo 한 번이 마지막 텍스트 편집 하나만 되돌린다(그 앞의 여러 줄 편집은 남는다)",
    undoText === multiline && afterUndo.whiteSpace === "pre-wrap",
    JSON.stringify({ undoText, whiteSpace: afterUndo.whiteSpace })
  );

  /* --- B. 취소 --- */

  await page.fill("#studioInspectorTextInput", "취소될 문구");
  await sleep(200);

  const duringCancelPreview = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return doc.querySelector(".y-heading").textContent;
  });

  await page.click("#studioInspectorTextCancel");
  await sleep(300);

  const afterCancel = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      previewText: doc.querySelector(".y-heading").textContent,
      inputValue: document.getElementById("studioInspectorTextInput").value,
      draft: window.getStudioInspectorState().textDraft,
      html: window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html
    };
  });

  record(
    "B. 취소하면 미리보기와 입력칸이 모두 원래 문구로 돌아가고, 임시 변경이 남지 않는다",
    duringCancelPreview === "취소될 문구" &&
      afterCancel.previewText === multiline &&
      afterCancel.inputValue === multiline &&
      afterCancel.draft === null &&
      afterCancel.html.includes("취소될 문구") === false,
    JSON.stringify({ duringCancelPreview, previewText: afterCancel.previewText, draft: afterCancel.draft })
  );

  /* 선택을 옮겨도 임시 상태가 따라오지 않는다 */

  await page.fill("#studioInspectorTextInput", "옮기기 전 입력");
  await sleep(200);

  await selectInPreview(page, ".y-box-text");
  await sleep(300);

  const afterMove = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      heading: doc.querySelector(".y-heading").textContent,
      draft: window.getStudioInspectorState().textDraft
    };
  });

  record(
    "B2. 다른 요소를 고르면 입력하던 임시 문구가 사라지고 원래 화면으로 돌아간다",
    afterMove.heading === multiline && afterMove.draft === null,
    JSON.stringify(afterMove)
  );

  /* --- C. 바인딩 텍스트 --- */

  await selectInPreview(page, ".y-nickname");
  await openDirectEdit(page);

  const bound = await page.evaluate(() => {
    const fields = document.getElementById("studioInspectorFields");
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const pkgHtml = window.getStudioAiWorkingState({ includePackage: true }).skinPackage.templates.home.html;
    return {
      hasTextarea: !!document.getElementById("studioInspectorTextInput"),
      note: document.getElementById("studioInspectorBindNote")?.textContent || null,
      controls: Array.from(fields.querySelectorAll("[data-inspector-control]")).map(el => el.dataset.inspectorControl),
      rendered: doc.querySelector(".y-nickname").textContent,
      bindKept: /class="y-nickname" data-imory-bind="profile.nickname"/.test(pkgHtml)
    };
  });

  record(
    "C. 데이터 연결 텍스트(profile.nickname) — 입력칸 대신 짧은 안내가 뜨고 연결이 그대로다",
    bound.hasTextarea === false &&
      /Settings/.test(bound.note || "") &&
      bound.controls[0] === "textBinding" &&
      bound.rendered === "Scenario Y" &&
      bound.bindKept === true,
    JSON.stringify(bound)
  );

  /* 스타일은 여전히 바꿀 수 있다(내용만 잠긴다) */

  await page.fill('#studioInspectorFields [data-inspector-control="fontSize"]', "22");
  await page.evaluate(() => {
    document.querySelector('#studioInspectorFields [data-inspector-control="fontSize"]')
      .dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(500);

  const boundStyled = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-nickname");
    return {
      fontSize: doc.defaultView.getComputedStyle(el).fontSize,
      text: el.textContent
    };
  });

  record(
    "C2. 바인딩 텍스트도 스타일은 바꿀 수 있고, 값은 여전히 Settings에서 온 것이 보인다",
    boundStyled.fontSize === "22px" && boundStyled.text === "Scenario Y",
    JSON.stringify(boundStyled)
  );

  await page.close();

}


/* =========================================================
   D, E, J, K. 이미지 크기 — 숫자 / 슬라이더 / 비율 / 슬롯
========================================================== */

async function runImage(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  /* --- 정사각형 프로필 사진 --- */

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);

  const initial = await page.evaluate(() => ({
    range: document.getElementById("studioInspectorSizeRange")?.value,
    number: document.getElementById("studioInspectorSizeNumber")?.value,
    max: document.getElementById("studioInspectorSizeRange")?.max,
    metrics: window.getStudioInspectorState().metrics
  }));

  const beforeAvatar = await previewBox(page, ".y-avatar");

  record(
    "D1. 이미지를 고르면 '너비' 슬라이더와 px 입력칸이 화면에 보이는 크기(120px)로 채워진다",
    initial.range === "120" &&
      initial.number === "120" &&
      Math.round(beforeAvatar.width) === 120 &&
      Number(initial.max) > 120,
    JSON.stringify({ initial, beforeAvatar })
  );

  /* 숫자 입력 */

  await setInspectorSizeNumber(page, 180);

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-avatar");
      return el && Math.round(el.getBoundingClientRect().width) === 180;
    },
    null,
    { timeout: 6000 }
  );

  const afterNumber = await previewBox(page, ".y-avatar");
  const rangeSynced = await page.evaluate(() => document.getElementById("studioInspectorSizeRange").value);

  record(
    "D2. px 입력으로 바꾸면 Preview와 슬라이더가 함께 따라오고, 정사각형 비율(1:1)과 object-fit이 유지된다",
    Math.round(afterNumber.width) === 180 &&
      Math.round(afterNumber.height) === 180 &&
      afterNumber.objectFit === "cover" &&
      rangeSynced === "180",
    JSON.stringify({ afterNumber, rangeSynced })
  );

  /* 슬라이더 — input(미리보기)과 change(확정)를 나눠 확인한다 */

  const undoCountBefore = await page.evaluate(() => window.getStudioInspectorState().hasUndo);

  await page.evaluate(() => {
    const range = document.getElementById("studioInspectorSizeRange");
    range.value = "150";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await sleep(300);

  const duringSlider = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-avatar");
    return {
      previewWidth: Math.round(el.getBoundingClientRect().width),
      number: document.getElementById("studioInspectorSizeNumber").value,
      css: window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css
    };
  });

  await page.evaluate(() => {
    document.getElementById("studioInspectorSizeRange")
      .dispatchEvent(new Event("change", { bubbles: true }));
  });

  await sleep(500);

  const afterSlider = await previewBox(page, ".y-avatar");
  const cssAfterSlider = await workingCss(page);

  record(
    "D3. 슬라이더는 끄는 동안 미리보기만 하고(SkinPackage 그대로), 손을 뗄 때 한 번만 확정된다",
    duringSlider.previewWidth === 150 &&
      duringSlider.number === "150" &&
      /width: 180px/.test(duringSlider.css) &&
      Math.round(afterSlider.width) === 150 &&
      Math.round(afterSlider.height) === 150 &&
      /width: 150px/.test(cssAfterSlider),
    JSON.stringify({ duringSlider: { ...duringSlider, css: undefined }, afterSlider })
  );

  /* --- K. Undo 한 번 --- */

  await page.click("#studioInspectorUndoButton");
  await sleep(500);

  const afterUndo = await previewBox(page, ".y-avatar");

  record(
    "K. 슬라이더 조작 한 번은 Undo 한 번으로 직전 크기(180px)로 돌아간다",
    undoCountBefore === true && Math.round(afterUndo.width) === 180,
    JSON.stringify(afterUndo)
  );

  /* --- 초기화(기본) --- */

  await page.click("#studioInspectorSizeReset");
  await sleep(500);

  const afterReset = await previewBox(page, ".y-avatar");
  const cssAfterReset = await workingCss(page);

  record(
    "D4. '기본'을 누르면 이번에 넣은 크기 설정이 규칙에서 빠지고 스킨 CSS 크기(120px)로 돌아간다",
    Math.round(afterReset.width) === 120 &&
      Math.round(afterReset.height) === 120 &&
      /aspect-ratio/.test(cssAfterReset) === false &&
      /max-width: 100%/.test(cssAfterReset) === false,
    JSON.stringify({ afterReset, cssTail: cssAfterReset.slice(-140) })
  );

  /* --- E. 가로형 헤더 이미지 --- */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);

  await setInspectorSizeNumber(page, 150);

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-cover");
      return el && Math.round(el.getBoundingClientRect().width) === 150;
    },
    null,
    { timeout: 6000 }
  );

  const cover = await previewBox(page, ".y-cover");
  const avatarUntouched = await previewBox(page, ".y-avatar");

  record(
    "E. 가로형 헤더 이미지(300x100)는 3:1 비율 그대로 줄고, 다른 이미지에는 영향이 없다",
    Math.round(cover.width) === 150 &&
      Math.round(cover.height) === 50 &&
      cover.objectFit === "cover" &&
      Math.round(avatarUntouched.width) === 120,
    JSON.stringify({ cover, avatarUntouched })
  );

  /* 이미지 URL / 슬롯 연결은 그대로다 */

  const slotKept = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const pkg = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    return {
      coverSrcAttr: /class="y-cover" data-imory-src="images.cover"/.test(pkg.templates.home.html),
      avatarSrcAttr: /class="y-avatar" data-imory-src="profile.avatarUrl"/.test(pkg.templates.home.html),
      renderedCover: doc.querySelector(".y-cover").getAttribute("src"),
      renderedAvatar: doc.querySelector(".y-avatar").getAttribute("src"),
      slots: pkg.imageSlots.map(s => s.name)
    };
  });

  record(
    "D5. 크기를 바꿔도 이미지 URL·슬롯·Settings 연결은 하나도 바뀌지 않는다",
    slotKept.coverSrcAttr === true &&
      slotKept.avatarSrcAttr === true &&
      slotKept.renderedCover === "https://example.com/cover.png" &&
      slotKept.renderedAvatar === "https://example.com/profile.png" &&
      slotKept.slots.join(",") === "profile,cover",
    JSON.stringify(slotKept)
  );

  /* --- J. 슬롯 없는 정적 이미지 --- */

  await selectInPreview(page, ".y-static-image");
  await openDirectEdit(page);

  const staticControls = await page.evaluate(() => ({
    selection: window.getStudioInspectorSelection(),
    hasSlider: !!document.getElementById("studioInspectorSizeRange"),
    changeDisabled: document.getElementById("studioInspectorImageChange")?.disabled
  }));

  await setInspectorSizeNumber(page, 100);

  await page.waitForFunction(
    () => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const el = doc.querySelector(".y-static-image");
      return el && Math.round(el.getBoundingClientRect().width) === 100;
    },
    null,
    { timeout: 6000 }
  );

  const staticBox = await previewBox(page, ".y-static-image");

  record(
    "J. imageSlot이 없는 정적 이미지도 크기 조절은 되고(200x80 → 100x40), src는 그대로다",
    staticControls.selection.imageSlot === null &&
      staticControls.hasSlider === true &&
      Math.round(staticBox.width) === 100 &&
      Math.round(staticBox.height) === 40 &&
      staticBox.src === "https://example.com/static.png",
    JSON.stringify({ staticControls: { ...staticControls, selection: undefined }, staticBox })
  );

  await page.close();

}


/* =========================================================
   D6, F. 모서리 드래그
========================================================== */

/* 실제 포인터로 끈다 — Studio overlay의 핸들은 부모 문서 요소라
   page.mouse가 그대로 닿는다(iframe 안이 아니다). */
async function dragHandle(page, corner, dx, dy, options) {

  const start = await page.evaluate((c) => {
    const el = document.getElementById(`studioInspectorHandle-${c}`);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, corner);

  if (!start) {
    throw new Error(`handle not visible: ${corner}`);
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  /* 여러 번 나눠 움직인다 — 한 번에 점프시키면 pointermove가 한 번만
     오므로 "드래그 중" 상태를 관찰할 수 없다. */
  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(start.x + (dx * step) / 4, start.y + (dy * step) / 4);
    await sleep(40);
  }

  if (options && options.beforeRelease) {
    await options.beforeRelease();
  }

  if (options && options.escape) {
    await page.keyboard.press("Escape");
    await sleep(150);
    await page.mouse.up();
    return start;
  }

  await page.mouse.up();

  return start;

}


async function runDrag(context) {

  const page = await openStudio(context, { viewport: { width: 1440, height: 900 } });
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);

  await sleep(300);

  const handlesShown = await handleCenters(page);
  const avatarOnScreen = await previewRectOnScreen(page, ".y-avatar");

  record(
    "D6-1. 이미지를 고르면 네 모서리에 핸들이 그 요소의 모서리 위에 그려진다",
    handlesShown.nw && handlesShown.se &&
      near(handlesShown.nw.x, avatarOnScreen.left) &&
      near(handlesShown.nw.y, avatarOnScreen.top) &&
      near(handlesShown.se.x, avatarOnScreen.right) &&
      near(handlesShown.se.y, avatarOnScreen.bottom),
    JSON.stringify({ handlesShown, avatarOnScreen })
  );

  /* --- 오른쪽 아래 모서리를 +60px 끈다(기준: 왼쪽 위 모서리) --- */

  let duringDrag = null;

  await dragHandle(page, "se", 60, 60, {
    beforeRelease: async () => {
      duringDrag = await page.evaluate(() => {
        const doc = document.getElementById("studioPreviewFrame").contentDocument;
        return {
          dragging: window.getStudioInspectorState().dragging,
          previewWidth: Math.round(doc.querySelector(".y-avatar").getBoundingClientRect().width),
          number: document.getElementById("studioInspectorSizeNumber").value,
          range: document.getElementById("studioInspectorSizeRange").value,
          dirty: window.getStudioAiWorkingState().isDirty
        };
      });
    }
  });

  await sleep(600);

  const afterDrag = await previewBox(page, ".y-avatar");
  const afterDragInputs = await page.evaluate(() => ({
    number: document.getElementById("studioInspectorSizeNumber").value,
    range: document.getElementById("studioInspectorSizeRange").value,
    dirty: window.getStudioAiWorkingState().isDirty,
    dragging: window.getStudioInspectorState().dragging
  }));

  record(
    "D6-2. 모서리를 끌면 반대쪽 모서리를 기준으로 커지고, 숫자/슬라이더가 함께 움직인다(끄는 동안은 확정되지 않음)",
    duringDrag &&
      duringDrag.dragging === true &&
      duringDrag.dirty === false &&
      duringDrag.previewWidth === Number(duringDrag.number) &&
      duringDrag.number === duringDrag.range &&
      Math.round(afterDrag.width) === 180 &&
      Math.round(afterDrag.height) === 180 &&
      afterDragInputs.number === "180" &&
      afterDragInputs.dirty === true &&
      afterDragInputs.dragging === false,
    JSON.stringify({ duringDrag, afterDrag, afterDragInputs })
  );

  /* --- 숫자·슬라이더·드래그 결과가 같은 값을 만든다 --- */

  const cssAfterDrag = await workingCss(page);

  record(
    "D. 드래그가 만든 규칙은 숫자/슬라이더가 만드는 것과 같은 모양이다(width + height:auto + aspect-ratio + max-width)",
    /width: 180px/.test(cssAfterDrag) &&
      /height: auto/.test(cssAfterDrag) &&
      /aspect-ratio: 1/.test(cssAfterDrag) &&
      /max-width: 100%/.test(cssAfterDrag),
    cssAfterDrag.slice(-200)
  );

  /* --- 왼쪽 위 모서리 드래그 — 반대쪽(오른쪽 아래) 기준 --- */

  await dragHandle(page, "nw", -40, -40);
  await sleep(600);

  const afterNw = await previewBox(page, ".y-avatar");

  record(
    "D6-3. 왼쪽 위 모서리를 바깥으로 끌면(반대쪽 모서리 기준) 크기가 커진다",
    Math.round(afterNw.width) === 220 && Math.round(afterNw.height) === 220,
    JSON.stringify(afterNw)
  );

  /* --- F1. Escape 취소 --- */

  const beforeEscape = await previewBox(page, ".y-avatar");
  const cssBeforeEscape = await workingCss(page);

  await dragHandle(page, "se", 80, 80, { escape: true });
  await sleep(500);

  const afterEscape = await previewBox(page, ".y-avatar");
  const cssAfterEscape = await workingCss(page);
  const escapeState = await inspectorState(page);

  record(
    "F1. 드래그 중 Escape — 시작 전 크기로 되돌아가고 선택은 유지되며 편집 이력도 생기지 않는다",
    Math.round(afterEscape.width) === Math.round(beforeEscape.width) &&
      cssAfterEscape === cssBeforeEscape &&
      escapeState.dragging === false &&
      escapeState.selection !== null &&
      afterEscape.inlineDeclarations === 0,
    JSON.stringify({
      before: beforeEscape.width,
      after: afterEscape.width,
      dragging: escapeState.dragging,
      hasSelection: escapeState.selection !== null,
      cssSame: cssAfterEscape === cssBeforeEscape,
      inlineDeclarations: afterEscape.inlineDeclarations
    })
  );

  /* --- F2. 포인터가 Preview 밖으로 나가도 드래그가 이어지고, 손을 떼면 끝난다 --- */

  const startSe = await page.evaluate(() => {
    const el = document.getElementById("studioInspectorHandle-se");
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  await page.mouse.move(startSe.x, startSe.y);
  await page.mouse.down();

  /* Top Dock 위(= Preview 밖)를 지나 창 가장자리까지 끌고 간다 */
  await page.mouse.move(startSe.x + 40, 4);
  await sleep(60);
  await page.mouse.move(4, 4);
  await sleep(60);

  const outsideDragging = await page.evaluate(() => window.getStudioInspectorState().dragging);

  await page.mouse.move(startSe.x - 60, startSe.y - 60);
  await sleep(60);
  await page.mouse.up();
  await sleep(500);

  const afterOutside = await inspectorState(page);
  const afterOutsideBox = await previewBox(page, ".y-avatar");

  record(
    "F2. 포인터가 이미지/Preview 밖으로 나가도 드래그가 끊기지 않고, 손을 떼면 붙잡힌 상태가 남지 않는다",
    outsideDragging === true &&
      afterOutside.dragging === false &&
      Math.round(afterOutsideBox.width) < 220 &&
      afterOutsideBox.inlineDeclarations === 0,
    JSON.stringify({ outsideDragging, dragging: afterOutside.dragging, width: afterOutsideBox.width })
  );

  /* --- F3. 크기가 그대로면 편집 이력을 만들지 않는다 --- */

  const cssBeforeNoop = await workingCss(page);

  await dragHandle(page, "se", 0, 0);
  await sleep(400);

  const cssAfterNoop = await workingCss(page);

  record(
    "F3. 실제 크기가 변하지 않은 드래그는 아무 것도 확정하지 않는다",
    cssAfterNoop === cssBeforeNoop,
    `same=${cssAfterNoop === cssBeforeNoop}`
  );

  /* --- F4. 선택을 바꾸면 핸들과 임시 상태가 정리된다 --- */

  await selectInPreview(page, ".y-heading");
  await sleep(400);

  const afterSelectText = await handleCenters(page);
  const textState = await inspectorState(page);

  record(
    "F4. 이미지가 아닌 요소를 고르면 핸들이 사라지고 임시 상태도 남지 않는다",
    Object.values(afterSelectText).every(v => v === null) &&
      textState.resizable === false &&
      textState.dragging === false,
    JSON.stringify({ handles: afterSelectText, resizable: textState.resizable })
  );

  await page.close();

}


/* =========================================================
   G, H. 좌표(Desktop/Mobile · AI 패널) / 모바일 가로 넘침
========================================================== */

async function runGeometry(context) {

  /* 세로가 짧은 창을 쓴다 — Mobile Preview(390x844)가 stage에 들어가지
     않아 실제로 scale()로 줄어드는 상황을 만들기 위해서다(축소 배율이
     1이면 "배율을 반영하는가"를 검증할 수 없다). */
  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await sleep(300);

  const desktopFrame = await page.evaluate(
    () => document.getElementById("studioPreviewFrame").getBoundingClientRect().width
  );

  const desktop = await handleCenters(page);
  const desktopRect = await previewRectOnScreen(page, ".y-avatar");

  record(
    "G0. Desktop Preview — 핸들이 이미지 모서리와 일치한다",
    desktop.nw && desktop.se &&
      near(desktop.nw.x, desktopRect.left) &&
      near(desktop.nw.y, desktopRect.top) &&
      near(desktop.se.x, desktopRect.right) &&
      near(desktop.se.y, desktopRect.bottom),
    JSON.stringify({ desktop, desktopRect })
  );

  /* --- AI 패널을 연다(Preview 폭이 줄어든다) --- */

  await page.click("#studioAiToggleButton");
  await sleep(800);

  const panelFrame = await page.evaluate(
    () => document.getElementById("studioPreviewFrame").getBoundingClientRect().width
  );

  const withPanel = await handleCenters(page);
  const withPanelRect = await previewRectOnScreen(page, ".y-avatar");

  record(
    "G1. AI 패널을 열어 Preview 폭이 줄어도 핸들이 이미지 모서리 위에 그대로 있다",
    panelFrame < desktopFrame - 1 &&
      withPanel.se &&
      near(withPanel.se.x, withPanelRect.right) &&
      near(withPanel.se.y, withPanelRect.bottom) &&
      near(withPanel.nw.x, withPanelRect.left),
    JSON.stringify({ desktopFrame, panelFrame, withPanel: withPanel.se, rect: withPanelRect })
  );

  await page.click("#studioAiToggleButton");
  await sleep(800);

  /* --- Mobile Preview(축소 배율) --- */

  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await sleep(900);

  await selectInPreview(page, ".y-avatar");
  await sleep(400);

  const mobile = await handleCenters(page);
  const mobileRect = await previewRectOnScreen(page, ".y-avatar");

  record(
    "G2. Mobile Preview의 축소 배율까지 반영해 핸들 좌표가 맞는다",
    mobile.nw && mobile.se &&
      mobileRect.scale < 1 &&
      near(mobile.nw.x, mobileRect.left) &&
      near(mobile.nw.y, mobileRect.top) &&
      near(mobile.se.x, mobileRect.right) &&
      near(mobile.se.y, mobileRect.bottom),
    JSON.stringify({ mobile, mobileRect })
  );

  /* Mobile에서는 프레임이 stage 가운데 있으므로, 패널을 열면 요소의
     화면 좌표 자체가 옆으로 밀린다 — 핸들도 같이 밀려야 한다. */

  await page.click("#studioAiToggleButton");
  await sleep(800);

  const mobilePanel = await handleCenters(page);
  const mobilePanelRect = await previewRectOnScreen(page, ".y-avatar");

  record(
    "G2b. Mobile + AI 패널 — 프레임이 옆으로 밀려도 핸들이 따라간다",
    Math.abs(mobilePanelRect.left - mobileRect.left) > 1 &&
      mobilePanel.nw &&
      near(mobilePanel.nw.x, mobilePanelRect.left) &&
      near(mobilePanel.se.x, mobilePanelRect.right),
    JSON.stringify({ before: mobileRect.left, after: mobilePanelRect.left, handle: mobilePanel.nw })
  );

  await page.click("#studioAiToggleButton");
  await sleep(800);

  /* --- 드래그 이동량도 축소 배율을 반영한다 --- */

  await openDirectEdit(page);
  await sleep(200);

  const beforeMobileDrag = await previewBox(page, ".y-avatar");
  const dragRect = await previewRectOnScreen(page, ".y-avatar");

  await dragHandle(page, "se", 40, 40);
  await sleep(700);

  const afterMobileDrag = await previewBox(page, ".y-avatar");

  /* 화면에서 40px를 끌었으므로 iframe 안에서는 40/scale 만큼 커져야
     한다(가로·세로 두 축이 같은 값을 요구하므로 평균도 같다). */
  const expected =
    Math.round(beforeMobileDrag.width + 40 / dragRect.scale);

  record(
    "G3. 축소된 Preview에서도 포인터 이동량이 iframe 안 px로 정확히 환산된다",
    dragRect.scale < 1 &&
      Math.abs(afterMobileDrag.width - expected) <= 3,
    JSON.stringify({ before: beforeMobileDrag.width, after: afterMobileDrag.width, expected, scale: dragRect.scale })
  );

  /* --- H. 모바일 가로 넘침 --- */

  const sliderMax = await page.evaluate(() => Number(document.getElementById("studioInspectorSizeRange").max));

  await setInspectorSizeNumber(page, 9999);

  await sleep(700);

  const overflow = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-avatar");
    return {
      imageWidth: Math.round(el.getBoundingClientRect().width),
      docWidth: doc.documentElement.clientWidth,
      scrollWidth: doc.documentElement.scrollWidth,
      bodyScrollWidth: doc.body.scrollWidth,
      maxWidth: doc.defaultView.getComputedStyle(el).maxWidth
    };
  });

  record(
    "H. 슬라이더 상한이 부모 폭으로 눌리고, 큰 값을 넣어도 모바일에서 가로 넘침이 생기지 않는다",
    sliderMax <= 400 &&
      overflow.imageWidth <= overflow.docWidth &&
      overflow.scrollWidth <= overflow.docWidth + 1 &&
      overflow.bodyScrollWidth <= overflow.docWidth + 1 &&
      overflow.maxWidth === "100%",
    JSON.stringify({ sliderMax, overflow })
  );

  await page.close();

}


/* =========================================================
   I. 저장 — Save / 다시 열기 / Export → Import
========================================================== */

async function runPersist(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  /* 텍스트(여러 줄) + 이미지 크기, 둘 다 확정한다 */

  await selectInPreview(page, ".y-heading");
  await openDirectEdit(page);
  await page.fill("#studioInspectorTextInput", "기록\n두 번째 줄");
  await page.click("#studioInspectorTextApply");
  await sleep(500);

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);
  await setInspectorSizeNumber(page, 210);
  await sleep(600);

  const beforeSave = {
    heading: await previewBox(page, ".y-heading"),
    cover: await previewBox(page, ".y-cover")
  };

  await page.click("#studioSaveButton");

  await page.waitForFunction(
    () => window.getStudioAiWorkingState().isDirty === false,
    null,
    { timeout: 8000 }
  );

  const savedContent = await page.evaluate(() => {
    const calls = window.__savedDraftCallsY || [];
    return calls.length ? calls[calls.length - 1].p_content : null;
  });

  record(
    "I1. Save — 확정된 결과(줄바꿈 텍스트 + 크기 규칙)가 그대로 draft로 저장된다",
    !!savedContent &&
      savedContent.templates.home.html.includes("기록\n두 번째 줄") &&
      /white-space: pre-wrap/.test(savedContent.css) &&
      /width: 210px/.test(savedContent.css) &&
      /aspect-ratio: 3/.test(savedContent.css),
    JSON.stringify({ cssTail: (savedContent?.css || "").slice(-220) })
  );

  const exported = await (async () => {
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.click("#studioExportButton");
    const download = await downloadPromise;
    return {
      filename: download.suggestedFilename(),
      text: fs.readFileSync(await download.path(), "utf8")
    };
  })();

  await page.close();

  /* --- 저장된 content로 Studio를 다시 연다(= Save 후 재로드) --- */

  const reopened = await openStudio(context, { seedPackage: savedContent });

  const afterReload = {
    heading: await previewBox(reopened, ".y-heading"),
    cover: await previewBox(reopened, ".y-cover"),
    text: await reopened.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return doc.querySelector(".y-heading").textContent;
    })
  };

  record(
    "I2. 저장된 draft로 다시 열어도 줄바꿈과 이미지 크기(비율 포함)가 그대로다",
    afterReload.text === "기록\n두 번째 줄" &&
      afterReload.heading.whiteSpace === "pre-wrap" &&
      Math.round(afterReload.cover.width) === Math.round(beforeSave.cover.width) &&
      Math.round(afterReload.cover.height) === Math.round(beforeSave.cover.height),
    JSON.stringify({ afterReload, beforeSave })
  );

  /* --- Export → Import 왕복 --- */

  await reopened.click("#studioImportButton");
  await reopened.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });

  await reopened.setInputFiles(".import-editor-file-input", {
    name: exported.filename,
    mimeType: "application/json",
    buffer: Buffer.from(exported.text, "utf8")
  });

  await reopened.waitForFunction(
    () => {
      const msg = document.querySelector(".import-editor-message");
      const apply = document.querySelector(".import-editor-button--primary");
      return msg && msg.textContent.includes("검증 성공") && apply && !apply.disabled;
    },
    null,
    { timeout: 10000 }
  );

  await reopened.click(".import-editor-button--primary");

  await reopened.waitForFunction(
    () => { const el = document.querySelector(".import-editor-overlay"); return el && el.hidden === true; },
    null,
    { timeout: 5000 }
  );

  await sleep(700);

  const afterImport = {
    heading: await previewBox(reopened, ".y-heading"),
    cover: await previewBox(reopened, ".y-cover"),
    text: await reopened.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      return doc.querySelector(".y-heading").textContent;
    })
  };

  record(
    "I3. Export한 .json을 다시 Import해도 텍스트/크기 편집 결과가 그대로 살아난다",
    afterImport.text === "기록\n두 번째 줄" &&
      afterImport.heading.whiteSpace === "pre-wrap" &&
      Math.round(afterImport.cover.width) === Math.round(beforeSave.cover.width) &&
      Math.round(afterImport.cover.height) === Math.round(beforeSave.cover.height),
    JSON.stringify(afterImport)
  );

  /* 다시 켠 Inspector가 그 값을 그대로 폼에 채운다 */

  await enableInspector(reopened);
  await selectInPreview(reopened, ".y-cover");
  await openDirectEdit(reopened);

  const reopenedControl = await reopened.evaluate(() => ({
    number: document.getElementById("studioInspectorSizeNumber")?.value,
    range: document.getElementById("studioInspectorSizeRange")?.value
  }));

  record(
    "I4. 다시 연 Studio에서 그 이미지를 고르면 저장된 너비가 컨트롤에 그대로 채워진다",
    reopenedControl.number === "210" && reopenedControl.range === "210",
    JSON.stringify(reopenedControl)
  );

  await reopened.close();

}


/* =========================================================
   실행
========================================================== */

(async () => {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });

  try {

    if (shouldRun("text")) await runText(context);
    if (shouldRun("image")) await runImage(context);
    if (shouldRun("drag")) await runDrag(context);
    if (shouldRun("geometry")) await runGeometry(context);
    if (shouldRun("persist")) await runPersist(context);

    record(
      "N. 직접 편집 전 과정에서 /api/skin-ai 호출 0회",
      aiCallCount === 0,
      `calls=${aiCallCount}`
    );

    record(
      "Z. 콘솔 에러 없음",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 5).join("\n        ")
    );

  } catch (err) {

    record("실행 중 예외", false, String(err && err.stack ? err.stack : err));

  } finally {

    await context.close();
    await browser.close();
    server.close();

  }

  const passed = results.filter(r => r.pass).length;

  console.log(`\n${passed}/${results.length} PASS`);

  process.exit(passed === results.length ? 0 : 1);

})();
