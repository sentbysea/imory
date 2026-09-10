/* =========================================================
   SELECT MODE 이미지 자르기 E2E

   "원본 파일은 그대로 두고 스킨에 보이는 범위와 구도만 바꾼다"를
   사용자 동작 그대로 확인한다. /api/skin-ai는 가로채 호출 횟수만
   세고 전부 실패시킨다(한 번이라도 나가면 FAIL).

   저장소의 실제 파일(studio/inspector/*, studio/preview/*,
   skin/*)을 그대로 서빙하고 Supabase만 in-memory mock으로 바꾼다
   (studio/studio-lifecycle-scenario.html?scenario=y).

   ★ "빈틈이 없다"의 정의 — 이 파일 전체가 이 한 줄을 반복해서 잰다.
     프레임(래퍼)의 사각형이 사진 상자의 사각형 **안에** 완전히
     들어가 있어야 한다(coversFrame). 프레임은 overflow:hidden이므로
     그 조건이 곧 "프레임 어디에도 사진이 없는 자리가 없다"다.

   검사 범위
     A. 정사각형 프로필 / 가로형 헤더 / 세로 사진 — 비율 바꾸기
        (프레임 **너비는 그대로**, 높이만 바뀐다) · 빈틈 없음
     B. 구도 — 확대 슬라이더 · 사진 드래그 · Escape 되돌리기
     C. 임시 — 적용 전에는 SkinPackage가 한 글자도 바뀌지 않는다
        취소 / 선택 변경 / Escape 뒤에 래퍼도 inline도 남지 않는다
     D. Undo — 적용 한 번 = 되돌리기 한 번
     E. 자르기 초기화 — 자르기만 풀리고 원래 표시 방식으로 돌아온다
     F. 크기 조절과 공존 — 자른 뒤 너비를 바꿔도 자르기가 유지되고,
        모서리 드래그도 프레임을 바꾼다(서로 덮어쓰지 않는다)
     G. 재선택 · 다시 자르기 — 래퍼가 중복으로 생기지 않는다
     H. 좌표 — Desktop/Mobile 축소 배율, AI 패널 열림에서 드래그
        판이 프레임과 정확히 겹친다
     I. 저장 — Save → 재로드 / Export → Import 뒤에도 구도 유지
     J. 보존/보호 — src·슬롯·링크·edit id 유지, post-body 안 이미지는
        자르기 없음, 로드 실패 이미지는 이유를 안내하고 비활성
     K. 이미지 교체 — 원본 비율이 달라져도 빈틈이 생기지 않는다
     L. 모바일 — 자른 뒤에도 가로 넘침이 없다
     N. 전 과정 /api/skin-ai 호출 0회
     Z. 콘솔 에러 없음

   ★ 실행 방법
     node studio/studio-crop-e2e-test.mjs
     node studio/studio-crop-e2e-test.mjs --browser=webkit
     node studio/studio-crop-e2e-test.mjs --only=ratio

   --only= 뒤에 쓸 수 있는 이름:
     ratio / compose / temp / coexist / geometry / persist / guard
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
const PORT = 8946;
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


/* =========================================================
   fixture 이미지 — **자연 크기가 서로 다른** 진짜 PNG를 준다

   자르기는 원본 비율을 CSS에 구워 넣지 않는(object-fit: cover에
   맡기는) 설계라, 그 설계가 실제로 성립하는지 보려면 원본 비율이
   서로 다른 이미지가 있어야 한다. 1x1 하나로만 재면 "원본이
   정사각형일 때만 맞는 코드"도 통과해 버린다.

   내용은 검사하지 않으므로 전부 검정색 RGB로 만든다.
========================================================== */

function makePng(width, height) {

  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(typed) : crc32(typed), 0);
    return Buffer.concat([length, typed, crc]);
  };

  /* node 24에는 zlib.crc32가 있지만, 없는 런타임에서도 돌게 둔다. */
  function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) {
        c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
      }
    }
    return (~c) >>> 0;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 2;   /* colour type: truecolour */

  const raw = Buffer.alloc((width * 3 + 1) * height);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);

}

/* 이름 → 자연 크기. 스킨 CSS가 정한 표시 크기와 일부러 어긋나게 둔다. */
const FIXTURE_IMAGES = {
  "profile.png": makePng(40, 40),
  "cover.png": makePng(80, 20),
  "static.png": makePng(20, 20),
  "portrait.png": makePng(20, 60),
  "swapped.png": makePng(60, 12)
};


async function openStudio(context, options) {

  const page = await context.newPage();

  if (options && options.viewport) {
    await page.setViewportSize(options.viewport);
  }

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    /* 일부러 실패시킨 이미지의 로드 오류는 이 검사의 대상이 아니다 —
       그게 바로 J1이 만들려는 상황이다. */
    if (options && options.failImage && msg.text().includes("Failed to load resource")) return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  await page.route("**/api/skin-ai", async (route) => {
    aiCallCount += 1;
    await route.fulfill({ status: 500, contentType: "text/plain", body: "must not be called" });
  });

  await page.route("https://example.com/**", async (route) => {

    const name =
      route.request().url().split("/").pop();

    /* 일부러 실패시키는 이미지 — "로드 실패면 자르기 비활성" 검사용 */
    if (options && options.failImage && name === options.failImage) {
      await route.abort("failed");
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: FIXTURE_IMAGES[name] || FIXTURE_IMAGES["static.png"]
    });

  });

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

  /* 좌표/실측이 한 번은 올라온 뒤에 컨트롤을 만진다 — metrics가
     없으면 자르기 버튼이 "아직 재지 못했어요"로 뜬다. */
  await page.waitForFunction(
    () => {
      const state = window.getStudioInspectorState();
      return !!(state.metrics && state.metrics.width > 0);
    },
    null,
    { timeout: 6000 }
  );

}


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


async function openCrop(page) {

  await page.click("#studioInspectorCropOpen");

  await page.waitForFunction(
    () => !!window.getStudioInspectorState().cropDraft,
    null,
    { timeout: 4000 }
  );

  await sleep(250);

}


async function chooseCropRatio(page, value) {

  await page.click(`[data-inspector-control="cropRatio"][data-inspector-value="${value}"]`);

  await sleep(400);

}


async function setCropZoom(page, percent) {

  await page.evaluate((next) => {
    const input = document.getElementById("studioInspectorCropZoom");
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, percent);

  await sleep(400);

}


async function applyCrop(page) {

  await page.click("#studioInspectorCropApply");

  await page.waitForFunction(
    () => !window.getStudioInspectorState().cropDraft,
    null,
    { timeout: 4000 }
  );

  await sleep(500);

}


/* 자르기 판을 끌어 사진 위치를 옮긴다. 실제 포인터 이벤트를 쓴다 —
   좌표 변환(축소 배율/패널 이동)까지 함께 확인하기 위해서다. */
async function dragCropSurface(page, dx, dy, options) {

  const start = await page.evaluate(() => {
    const el = document.getElementById("studioInspectorCropSurface");
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  if (!start) {
    throw new Error("자르기 드래그 판이 보이지 않습니다");
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(start.x + (dx * step) / 4, start.y + (dy * step) / 4);
    await sleep(45);
  }

  if (options && options.escape) {
    await page.keyboard.press("Escape");
    await sleep(200);
    await page.mouse.up();
    await sleep(300);
    return start;
  }

  await page.mouse.up();
  await sleep(350);

  return start;

}


/* =========================================================
   Preview 안의 자르기 상태 — 이 파일의 유일한 판정 근거

   CSS 문자열이 아니라 "실제로 그려진 사각형"을 본다. 프레임은
   래퍼가 있으면 래퍼, 없으면 이미지 자신이다(= 자르기 전에는
   프레임 == 이미지).
========================================================== */

async function cropGeometry(page, selector) {

  return page.evaluate((sel) => {

    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);

    if (!el) return null;

    const view = doc.defaultView;
    const parent = el.parentElement;

    const marker =
      parent
        ? view.getComputedStyle(parent).getPropertyValue("--imory-crop").trim()
        : "";

    const isFrame =
      !!marker && parent.children.length === 1;

    const frameEl = isFrame ? parent : el;

    const f = frameEl.getBoundingClientRect();
    const i = el.getBoundingClientRect();
    const imageStyle = view.getComputedStyle(el);
    const frameStyle = view.getComputedStyle(frameEl);

    const r = (n) => Math.round(n * 100) / 100;

    return {
      cropped: isFrame,
      marker,
      wrapperTag: isFrame ? frameEl.tagName.toLowerCase() : null,
      wrapperId: isFrame ? frameEl.getAttribute("data-imory-edit-id") : null,
      wrapperCount:
        el.closest("[data-skin-root]")
          ? Array.from(el.closest("[data-skin-root]").querySelectorAll("*"))
              .filter((node) =>
                view.getComputedStyle(node).getPropertyValue("--imory-crop").trim() &&
                node.children.length === 1 &&
                node.firstElementChild &&
                node.firstElementChild.tagName === "IMG")
              .length
          : 0,
      frame: { left: r(f.left), top: r(f.top), right: r(f.right), bottom: r(f.bottom), width: r(f.width), height: r(f.height) },
      image: { left: r(i.left), top: r(i.top), right: r(i.right), bottom: r(i.bottom), width: r(i.width), height: r(i.height) },
      objectFit: imageStyle.objectFit,
      objectPosition: imageStyle.objectPosition,
      frameOverflow: frameStyle.overflow,
      frameDisplay: frameStyle.display,
      src: el.getAttribute("src"),
      srcPath: el.getAttribute("data-imory-src"),
      editId: el.getAttribute("data-imory-edit-id"),
      inlineDeclarations: el.style.length,
      wrapperInlineDeclarations: isFrame ? frameEl.style.length : 0,
      insideLink: !!el.closest("a")
    };

  }, selector);

}


/* 프레임 어디에도 사진이 없는 자리가 없는가 */
function coversFrame(geometry) {

  if (!geometry) return false;

  const slack = 0.6;

  return (
    geometry.image.left <= geometry.frame.left + slack &&
    geometry.image.top <= geometry.frame.top + slack &&
    geometry.image.right >= geometry.frame.right - slack &&
    geometry.image.bottom >= geometry.frame.bottom - slack
  );

}


function workingPackage(page) {
  return page.evaluate(() =>
    window.getStudioAiWorkingState({ includePackage: true }).skinPackage
  );
}


function inspectorState(page) {
  return page.evaluate(() => window.getStudioInspectorState());
}


const near = (a, b, tolerance = 1.6) => Math.abs(a - b) <= tolerance;


/* =========================================================
   A. 비율 — 정사각형 / 가로형 / 세로 사진
========================================================== */

async function runRatio(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  /* --- A1. 정사각형 프로필(120x120) → 16:9 --- */

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);

  const beforeAvatar = await cropGeometry(page, ".y-avatar");

  await openCrop(page);
  await chooseCropRatio(page, "16:9");

  const previewAvatar = await cropGeometry(page, ".y-avatar");

  await applyCrop(page);

  const afterAvatar = await cropGeometry(page, ".y-avatar");

  record(
    "A1. 정사각형 프로필 — 16:9로 바꾸면 프레임 **너비는 그대로**이고 높이만 줄며, 빈틈이 없다",
    !beforeAvatar.cropped &&
      afterAvatar.cropped &&
      afterAvatar.wrapperTag === "span" &&
      near(afterAvatar.frame.width, beforeAvatar.frame.width) &&
      near(afterAvatar.frame.height, beforeAvatar.frame.width * 9 / 16, 2) &&
      afterAvatar.frameOverflow === "hidden" &&
      coversFrame(afterAvatar) &&
      coversFrame(previewAvatar),
    JSON.stringify({ before: beforeAvatar.frame, preview: previewAvatar.frame, after: afterAvatar.frame })
  );

  record(
    "A1b. 원본 파일·URL·슬롯 연결·선택 식별자가 그대로 남는다",
    afterAvatar.src === beforeAvatar.src &&
      afterAvatar.srcPath === "profile.avatarUrl" &&
      afterAvatar.editId === beforeAvatar.editId &&
      afterAvatar.objectFit === "cover",
    JSON.stringify({ src: afterAvatar.src, srcPath: afterAvatar.srcPath, editId: afterAvatar.editId })
  );

  /* --- A2. 가로형 헤더(300x100) → 1:1 --- */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);

  const beforeCover = await cropGeometry(page, ".y-cover");

  await openCrop(page);
  await chooseCropRatio(page, "1:1");
  await applyCrop(page);

  const afterCover = await cropGeometry(page, ".y-cover");

  record(
    "A2. 가로형 헤더 — 1:1로 바꾸면 정사각 프레임이 되고 사진이 프레임을 덮는다",
    afterCover.cropped &&
      near(afterCover.frame.width, beforeCover.frame.width) &&
      near(afterCover.frame.height, afterCover.frame.width, 2) &&
      coversFrame(afterCover),
    JSON.stringify({ before: beforeCover.frame, after: afterCover.frame })
  );

  /* --- A3. 세로 사진(90x160) → 4:3 --- */

  await selectInPreview(page, ".y-portrait");
  await openDirectEdit(page);

  const beforePortrait = await cropGeometry(page, ".y-portrait");

  await openCrop(page);
  await chooseCropRatio(page, "4:3");
  await applyCrop(page);

  const afterPortrait = await cropGeometry(page, ".y-portrait");

  record(
    "A3. 세로 사진 — 4:3으로 바꿔도 너비 기준으로 높이만 바뀌고 빈틈이 없다",
    afterPortrait.cropped &&
      near(afterPortrait.frame.width, beforePortrait.frame.width) &&
      near(afterPortrait.frame.height, beforePortrait.frame.width * 3 / 4, 2) &&
      coversFrame(afterPortrait),
    JSON.stringify({ before: beforePortrait.frame, after: afterPortrait.frame })
  );

  /* --- A4. "현재 비율"은 지금 보이는 프레임 비율 그대로 --- */

  await selectInPreview(page, ".y-static-image");
  await openDirectEdit(page);

  const beforeStatic = await cropGeometry(page, ".y-static-image");

  await openCrop(page);
  await chooseCropRatio(page, "current");
  await applyCrop(page);

  const afterStatic = await cropGeometry(page, ".y-static-image");

  record(
    "A4. '현재 비율' — 자르기를 걸어도 화면 크기가 그대로다(원본 비율과 다른 이미지에서도)",
    afterStatic.cropped &&
      near(afterStatic.frame.width, beforeStatic.frame.width) &&
      near(afterStatic.frame.height, beforeStatic.frame.height, 2) &&
      coversFrame(afterStatic),
    JSON.stringify({ before: beforeStatic.frame, after: afterStatic.frame })
  );

  await page.close();

}


/* =========================================================
   B. 구도 — 확대 · 드래그 · Escape
========================================================== */

async function runCompose(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "16:9");

  const framed = await cropGeometry(page, ".y-avatar");

  /* --- B1. 확대 --- */

  await setCropZoom(page, 200);

  const zoomed = await cropGeometry(page, ".y-avatar");

  record(
    "B1. 확대 200% — 사진 상자가 프레임의 두 배가 되고, 프레임 크기는 그대로다",
    near(zoomed.frame.width, framed.frame.width) &&
      near(zoomed.frame.height, framed.frame.height) &&
      near(zoomed.image.width, framed.frame.width * 2, 2) &&
      near(zoomed.image.height, framed.frame.height * 2, 2) &&
      coversFrame(zoomed),
    JSON.stringify({ frame: zoomed.frame, image: zoomed.image })
  );

  /* --- B2. 드래그 — 프레임 폭만큼 끌면 한쪽 끝까지 간다 --- */

  const zoomState = await inspectorState(page);

  await dragCropSurface(page, framed.frame.width, 0);

  const dragged = await cropGeometry(page, ".y-avatar");
  const draggedState = await inspectorState(page);

  record(
    "B2. 드래그 — 포인터를 오른쪽으로 끌면 사진이 따라오고(구도가 왼쪽 끝으로) 빈틈이 없다",
    zoomState.cropDraft.x === 0 &&
      draggedState.cropDraft.x < -0.9 &&
      near(dragged.image.left, dragged.frame.left, 1.2) &&
      coversFrame(dragged),
    JSON.stringify({ x: draggedState.cropDraft.x, frameLeft: dragged.frame.left, imageLeft: dragged.image.left })
  );

  /* --- B3. 반대로 끌어도 프레임 밖으로 빠지지 않는다(clamp) --- */

  await dragCropSurface(page, -framed.frame.width * 3, -framed.frame.height * 3);

  const clamped = await cropGeometry(page, ".y-avatar");
  const clampedState = await inspectorState(page);

  record(
    "B3. 아무리 끌어도 구도는 -1~+1로 눌리고 프레임에 빈틈이 생기지 않는다",
    clampedState.cropDraft.x <= 1 && clampedState.cropDraft.x >= 0.9 &&
      clampedState.cropDraft.y <= 1 && clampedState.cropDraft.y >= 0.9 &&
      coversFrame(clamped),
    JSON.stringify({ draft: clampedState.cropDraft, frame: clamped.frame, image: clamped.image })
  );

  /* --- B4. 드래그 중 Escape는 끌기 시작 전 구도로 --- */

  const beforeEscape = (await inspectorState(page)).cropDraft;

  await dragCropSurface(page, -80, 0, { escape: true });

  const afterEscape = await inspectorState(page);

  record(
    "B4. 드래그 중 Escape — 끌기 시작 전 구도로 돌아가고, 자르기 편집과 선택은 그대로 남는다",
    !!afterEscape.cropDraft &&
      afterEscape.cropDraft.x === beforeEscape.x &&
      afterEscape.cropDraft.y === beforeEscape.y &&
      afterEscape.cropDragging === false &&
      !!afterEscape.selection,
    JSON.stringify({ before: beforeEscape, after: afterEscape.cropDraft })
  );

  /* --- B5. 적용하면 그 구도가 CSS 규칙으로 확정된다 --- */

  const finalDraft = (await inspectorState(page)).cropDraft;

  await applyCrop(page);

  const applied = await cropGeometry(page, ".y-avatar");
  const pkg = await workingPackage(page);

  record(
    "B5. 적용 — 확대·구도가 CSS 규칙으로 확정되고 화면이 그대로 유지된다",
    applied.cropped &&
      applied.inlineDeclarations === 0 &&
      applied.wrapperInlineDeclarations === 0 &&
      /width: 200%/.test(pkg.css) &&
      /object-position:/.test(pkg.css) &&
      /--imory-crop/.test(pkg.css) &&
      coversFrame(applied),
    JSON.stringify({ draft: finalDraft, cssTail: pkg.css.slice(-300) })
  );

  await page.close();

}


/* =========================================================
   C/D. 임시 상태 · Undo
========================================================== */

async function runTemp(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  const original = await workingPackage(page);

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);

  const before = await cropGeometry(page, ".y-cover");

  await openCrop(page);
  await chooseCropRatio(page, "1:1");
  await setCropZoom(page, 180);

  const duringPreview = await cropGeometry(page, ".y-cover");
  const during = await workingPackage(page);

  record(
    "C1. 적용 전 — 화면은 바뀌지만 SkinPackage는 한 글자도 바뀌지 않는다",
    duringPreview.cropped &&
      duringPreview.wrapperInlineDeclarations > 0 &&
      during.css === original.css &&
      during.templates.home.html === original.templates.home.html &&
      (await page.evaluate(() => window.getStudioAiWorkingState().isDirty)) === false,
    JSON.stringify({ cssSame: during.css === original.css, htmlSame: during.templates.home.html === original.templates.home.html })
  );

  /* --- C2. 취소 --- */

  await page.click("#studioInspectorCropCancel");
  await sleep(500);

  const cancelled = await cropGeometry(page, ".y-cover");
  const cancelledState = await inspectorState(page);

  record(
    "C2. 취소 — 임시로 만든 프레임이 통째로 사라지고 원래 표시로 돌아온다",
    cancelled.cropped === false &&
      cancelled.inlineDeclarations === 0 &&
      near(cancelled.frame.width, before.frame.width) &&
      near(cancelled.frame.height, before.frame.height) &&
      cancelledState.cropDraft === null,
    JSON.stringify({ before: before.frame, cancelled: cancelled.frame })
  );

  /* --- C3. Escape로 닫기 --- */

  await openCrop(page);
  await chooseCropRatio(page, "1:1");

  await page.keyboard.press("Escape");
  await sleep(500);

  const escaped = await cropGeometry(page, ".y-cover");
  const escapedState = await inspectorState(page);

  record(
    "C3. Escape — 자르기 편집만 취소되고 선택과 Inspector mode는 그대로다",
    escaped.cropped === false &&
      escapedState.cropDraft === null &&
      !!escapedState.selection &&
      escapedState.enabled === true,
    JSON.stringify({ cropped: escaped.cropped, selection: !!escapedState.selection })
  );

  /* --- C4. 다른 요소를 고르면 임시 편집이 남지 않는다 --- */

  await openCrop(page);
  await setCropZoom(page, 260);

  await selectInPreview(page, ".y-heading");
  await sleep(400);

  const afterSwitch = await cropGeometry(page, ".y-cover");
  const afterSwitchState = await inspectorState(page);

  record(
    "C4. 선택을 옮기면 — 확정하지 않은 자르기는 흔적 없이 사라진다",
    afterSwitch.cropped === false &&
      afterSwitch.inlineDeclarations === 0 &&
      afterSwitchState.cropDraft === null,
    JSON.stringify({ cropped: afterSwitch.cropped, inline: afterSwitch.inlineDeclarations })
  );

  /* --- D. 적용 한 번 = Undo 한 번 --- */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "1:1");
  await setCropZoom(page, 150);
  await applyCrop(page);

  const applied = await cropGeometry(page, ".y-cover");
  const appliedPkg = await workingPackage(page);

  await page.click("#studioInspectorUndoButton");
  await sleep(700);

  const undone = await cropGeometry(page, ".y-cover");
  const undonePkg = await workingPackage(page);

  record(
    "D. 적용 한 번 = 되돌리기 한 번 — 래퍼도 CSS도 자르기 전으로 돌아간다",
    applied.cropped &&
      undone.cropped === false &&
      undone.wrapperCount === 0 &&
      undonePkg.css === original.css &&
      undonePkg.templates.home.html === original.templates.home.html &&
      appliedPkg.css !== original.css,
    JSON.stringify({ undoneCropped: undone.cropped, cssRestored: undonePkg.css === original.css })
  );

  await page.close();

}


/* =========================================================
   E/F/G. 초기화 · 크기 조절과 공존 · 래퍼 중복
========================================================== */

async function runCoexist(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  const original = await workingPackage(page);

  /* --- F1. 자르기 → 너비 조절 --- */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);

  const before = await cropGeometry(page, ".y-cover");

  await openCrop(page);
  await chooseCropRatio(page, "1:1");
  await applyCrop(page);

  const cropped = await cropGeometry(page, ".y-cover");

  await page.evaluate(() => {
    const input = document.getElementById("studioInspectorSizeNumber");
    input.value = "180";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await sleep(700);

  const resized = await cropGeometry(page, ".y-cover");

  record(
    "F1. 자른 뒤 너비를 바꾸면 — 프레임이 그 너비가 되고 자르기 비율/구도는 그대로다",
    resized.cropped &&
      near(resized.frame.width, 180) &&
      near(resized.frame.height, 180, 2) &&
      resized.wrapperCount === 1 &&
      coversFrame(resized),
    JSON.stringify({ cropped: cropped.frame, resized: resized.frame })
  );

  record(
    "F1b. 너비 컨트롤이 프레임 값을 읽어 온다(이미지 규칙과 프레임 규칙이 서로 덮어쓰지 않는다)",
    (await page.evaluate(() => document.getElementById("studioInspectorSizeNumber").value)) === "180",
    ""
  );

  /* --- F2. 모서리 드래그도 프레임을 바꾼다 --- */

  const handleStart = await page.evaluate(() => {
    const el = document.getElementById("studioInspectorHandle-se");
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  record(
    "F2a. 자른 이미지의 모서리 핸들은 프레임(보이는 사각형)의 모서리에 붙는다",
    !!handleStart &&
      near(handleStart.x, (await previewRectOnScreen(page, ".y-cover")).right, 2) &&
      near(handleStart.y, (await previewRectOnScreen(page, ".y-cover")).bottom, 2),
    JSON.stringify(handleStart)
  );

  await page.mouse.move(handleStart.x, handleStart.y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(handleStart.x + (40 * step) / 4, handleStart.y + (40 * step) / 4);
    await sleep(45);
  }
  await page.mouse.up();
  await sleep(700);

  const dragged = await cropGeometry(page, ".y-cover");

  record(
    "F2b. 모서리 드래그 — 프레임이 커지고 자르기는 그대로 유지된다",
    dragged.cropped &&
      dragged.frame.width > resized.frame.width + 20 &&
      near(dragged.frame.height, dragged.frame.width, 2) &&
      dragged.wrapperCount === 1 &&
      coversFrame(dragged),
    JSON.stringify({ resized: resized.frame, dragged: dragged.frame })
  );

  /* --- G. 다시 자르기 — 래퍼가 겹겹이 쌓이지 않는다 --- */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);

  const reopenLabel = await page.evaluate(() =>
    document.getElementById("studioInspectorCropOpen")?.textContent
  );

  await openCrop(page);

  const reopenedDraft = (await inspectorState(page)).cropDraft;

  await chooseCropRatio(page, "16:9");
  await applyCrop(page);

  const recropped = await cropGeometry(page, ".y-cover");
  const recroppedPkg = await workingPackage(page);

  record(
    "G. 다시 자르기 — 지금 값이 그대로 채워지고, 래퍼는 하나 그대로다(중복 생성 없음)",
    reopenLabel === "자르기 다시 하기" &&
      reopenedDraft && Math.abs(reopenedDraft.zoom - 1) < 0.001 &&
      recropped.cropped &&
      recropped.wrapperCount === 1 &&
      (recroppedPkg.templates.home.html.match(/-c"/g) || []).length === 1 &&
      near(recropped.frame.height, recropped.frame.width * 9 / 16, 2),
    JSON.stringify({ reopenLabel, reopenedDraft, wrapperCount: recropped.wrapperCount })
  );

  /* --- E. 자르기 초기화 --- */

  await page.click("#studioInspectorCropReset");
  await sleep(800);

  const reset = await cropGeometry(page, ".y-cover");
  const resetPkg = await workingPackage(page);

  record(
    "E1. 자르기 초기화 — 프레임이 사라지고 사용자가 정한 너비만 남는다",
    reset.cropped === false &&
      reset.wrapperCount === 0 &&
      !/--imory-crop/.test(resetPkg.css) &&
      !/-c"/.test(resetPkg.templates.home.html) &&
      reset.frame.width > 180,
    JSON.stringify({ cropped: reset.cropped, width: reset.frame.width, cssTail: resetPkg.css.slice(-200) })
  );

  /* --- E2. 너비를 손대지 않은 채 자르기만 걸었다가 풀면 원래 표시로 --- */

  await selectInPreview(page, ".y-portrait");
  await openDirectEdit(page);

  const portraitBefore = await cropGeometry(page, ".y-portrait");

  await openCrop(page);
  await chooseCropRatio(page, "1:1");
  await applyCrop(page);

  await page.click("#studioInspectorCropReset");
  await sleep(800);

  const portraitAfter = await cropGeometry(page, ".y-portrait");
  const portraitPkg = await workingPackage(page);

  record(
    "E2. 너비를 정한 적이 없으면 — 자르기를 풀었을 때 스킨 CSS의 원래 크기로 정확히 돌아간다",
    portraitAfter.cropped === false &&
      near(portraitAfter.frame.width, portraitBefore.frame.width) &&
      near(portraitAfter.frame.height, portraitBefore.frame.height) &&
      !/--imory-crop/.test(portraitPkg.css),
    JSON.stringify({ before: portraitBefore.frame, after: portraitAfter.frame })
  );

  record(
    "E3. 초기화해도 원본 파일/URL과 다른 요소들의 스킨 HTML은 그대로다",
    portraitAfter.src === portraitBefore.src &&
      portraitPkg.templates.home.html.includes('class="y-heading"') &&
      original.templates.home.html.includes('class="y-heading"'),
    ""
  );

  await page.close();

}


/* Preview 안 요소의 화면 좌표(부모 문서 기준) */
async function previewRectOnScreen(page, selector) {
  return page.evaluate((sel) => {
    const frameEl = document.getElementById("studioPreviewFrame");
    const doc = frameEl.contentDocument;
    const el = doc.querySelector(sel);
    if (!el) return null;
    const view = doc.defaultView;
    const parent = el.parentElement;
    const marker = parent ? view.getComputedStyle(parent).getPropertyValue("--imory-crop").trim() : "";
    const target = (marker && parent.children.length === 1) ? parent : el;
    const box = frameEl.getBoundingClientRect();
    const scale = box.width / (frameEl.offsetWidth || box.width || 1);
    const style = window.getComputedStyle(frameEl);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const rect = target.getBoundingClientRect();
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


async function cropSurfaceRect(page) {
  return page.evaluate(() => {
    const el = document.getElementById("studioInspectorCropSurface");
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    const round = (n) => Math.round(n * 10) / 10;
    return { left: round(r.left), top: round(r.top), right: round(r.right), bottom: round(r.bottom) };
  });
}


/* =========================================================
   H/L. 좌표 · 모바일
========================================================== */

async function runGeometry(context) {

  /* 세로가 짧은 창을 쓴다 — Mobile Preview(390x844)가 stage에 들어가지
     않아 실제로 scale()로 줄어드는 상황을 만들기 위해서다(축소 배율이
     1이면 "배율을 반영하는가"를 검증할 수 없다). */
  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "16:9");
  await setCropZoom(page, 200);

  /* --- H1. Desktop --- */

  const desktopSurface = await cropSurfaceRect(page);
  const desktopFrame = await previewRectOnScreen(page, ".y-avatar");

  record(
    "H1. 드래그 판이 프레임 사각형과 정확히 겹친다(Desktop)",
    desktopSurface &&
      near(desktopSurface.left, desktopFrame.left) &&
      near(desktopSurface.top, desktopFrame.top) &&
      near(desktopSurface.right, desktopFrame.right) &&
      near(desktopSurface.bottom, desktopFrame.bottom),
    JSON.stringify({ desktopSurface, desktopFrame })
  );

  /* --- H2. AI 패널을 열면 Preview가 좁아진다 --- */

  await page.click("#studioAiToggleButton");
  await sleep(900);

  const panelSurface = await cropSurfaceRect(page);
  const panelFrame = await previewRectOnScreen(page, ".y-avatar");

  record(
    "H2. AI 패널을 열어 Preview가 움직여도 드래그 판이 따라간다",
    panelSurface &&
      near(panelSurface.left, panelFrame.left) &&
      near(panelSurface.right, panelFrame.right) &&
      near(panelSurface.bottom, panelFrame.bottom),
    JSON.stringify({ panelSurface, panelFrame })
  );

  await page.click("#studioAiToggleButton");
  await sleep(900);

  /* --- H3. Mobile Preview(축소 배율) --- */

  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await sleep(900);

  const mobileSurface = await cropSurfaceRect(page);
  const mobileFrame = await previewRectOnScreen(page, ".y-avatar");

  record(
    "H3. Mobile Preview의 축소 배율까지 반영해 드래그 판 좌표가 맞는다",
    mobileSurface && mobileFrame.scale < 1 &&
      near(mobileSurface.left, mobileFrame.left) &&
      near(mobileSurface.top, mobileFrame.top) &&
      near(mobileSurface.right, mobileFrame.right) &&
      near(mobileSurface.bottom, mobileFrame.bottom),
    JSON.stringify({ mobileSurface, mobileFrame, scale: mobileFrame.scale })
  );

  /* --- H4. 축소된 Preview에서도 드래그 이동량이 정확히 환산된다 --- */

  const beforeDrag = (await inspectorState(page)).cropDraft;

  const frameOnScreenWidth =
    mobileFrame.right - mobileFrame.left;

  await dragCropSurface(page, frameOnScreenWidth / 2, 0);

  const afterDrag = (await inspectorState(page)).cropDraft;

  record(
    "H4. 축소된 Preview에서도 이동량이 정확히 환산된다 — 프레임 폭의 절반을 끌면 구도가 1.0(전체 범위 2의 절반)만큼 움직인다",
    beforeDrag.x === 0 && near(afterDrag.x, -1, 0.08),
    JSON.stringify({ before: beforeDrag.x, after: afterDrag.x, frameOnScreenWidth, scale: mobileFrame.scale })
  );

  await applyCrop(page);

  /* --- L. 모바일 가로 넘침 --- */

  const overflow = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-avatar");
    const frame = el.parentElement;
    return {
      frameWidth: Math.round(frame.getBoundingClientRect().width),
      docWidth: doc.documentElement.clientWidth,
      scrollWidth: doc.documentElement.scrollWidth,
      bodyScrollWidth: doc.body.scrollWidth,
      frameMaxWidth: doc.defaultView.getComputedStyle(frame).maxWidth,
      frameOverflow: doc.defaultView.getComputedStyle(frame).overflow
    };
  });

  record(
    "L. 자른 뒤에도 모바일에서 가로 넘침이 없다(프레임이 넘치는 부분을 잘라낸다)",
    overflow.scrollWidth <= overflow.docWidth + 1 &&
      overflow.bodyScrollWidth <= overflow.docWidth + 1 &&
      overflow.frameMaxWidth === "100%" &&
      overflow.frameOverflow === "hidden",
    JSON.stringify(overflow)
  );

  await page.close();

}


/* =========================================================
   I. 저장 — Save / 재로드 / Export → Import
========================================================== */

async function runPersist(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "16:9");
  await setCropZoom(page, 170);
  await dragCropSurface(page, 20, 10);
  await applyCrop(page);

  const beforeSave = await cropGeometry(page, ".y-avatar");

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
    "I1. Save — 확정된 자르기(프레임 규칙 + 사진 규칙 + 래퍼)가 그대로 draft로 저장된다",
    !!savedContent &&
      /--imory-crop/.test(savedContent.css) &&
      /overflow: hidden/.test(savedContent.css) &&
      /object-position:/.test(savedContent.css) &&
      /<span data-imory-edit-id="[^"]+-c"/.test(savedContent.templates.home.html),
    JSON.stringify({ cssTail: (savedContent?.css || "").slice(-300) })
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

  /* --- 저장된 content로 다시 연다 --- */

  const reopened = await openStudio(context, { seedPackage: savedContent });

  const afterReload = await cropGeometry(reopened, ".y-avatar");

  record(
    "I2. 저장된 draft로 다시 열어도 프레임 크기와 구도가 그대로다",
    afterReload.cropped &&
      near(afterReload.frame.width, beforeSave.frame.width) &&
      near(afterReload.frame.height, beforeSave.frame.height) &&
      afterReload.objectPosition === beforeSave.objectPosition &&
      near(afterReload.image.width, beforeSave.image.width, 2) &&
      coversFrame(afterReload),
    JSON.stringify({ before: beforeSave.frame, after: afterReload.frame, position: afterReload.objectPosition })
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

  await sleep(800);

  const afterImport = await cropGeometry(reopened, ".y-avatar");

  record(
    "I3. Export한 .json을 다시 Import해도 자르기 결과가 그대로 살아난다",
    afterImport.cropped &&
      near(afterImport.frame.width, beforeSave.frame.width) &&
      near(afterImport.frame.height, beforeSave.frame.height) &&
      afterImport.objectPosition === beforeSave.objectPosition &&
      coversFrame(afterImport),
    JSON.stringify({ after: afterImport.frame, position: afterImport.objectPosition })
  );

  /* --- 다시 연 Studio에서 그 이미지를 고르면 저장된 값이 폼에 --- */

  await enableInspector(reopened);
  await selectInPreview(reopened, ".y-avatar");
  await openDirectEdit(reopened);
  await openCrop(reopened);

  const reopenedDraft = (await inspectorState(reopened)).cropDraft;

  record(
    "I4. 다시 연 Studio에서 자르기를 열면 저장된 확대/구도가 그대로 채워진다",
    reopenedDraft &&
      near(reopenedDraft.zoom, 1.7, 0.02) &&
      reopenedDraft.x < 0 &&
      reopenedDraft.y < 0,
    JSON.stringify(reopenedDraft)
  );

  await reopened.close();

}


/* =========================================================
   J/K. 보호 · 이미지 교체
========================================================== */

async function runGuard(context) {

  /* --- J1. 로드에 실패한 이미지 --- */

  const failing = await openStudio(context, { failImage: "static.png" });
  await enableInspector(failing);

  await failing.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(".y-static-image");
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await failing.waitForFunction(
    () => {
      const selection = window.getStudioInspectorSelection();
      return !!selection && selection.classNames.indexOf("y-static-image") !== -1;
    },
    null,
    { timeout: 6000 }
  );

  await sleep(400);
  await openDirectEdit(failing);
  await sleep(300);

  const failNote = await failing.evaluate(() => ({
    note: document.getElementById("studioInspectorCropNote")?.textContent || "",
    hasOpenButton: !!document.getElementById("studioInspectorCropOpen"),
    loaded: window.getStudioInspectorState().metrics?.loaded
  }));

  record(
    "J1. 이미지를 불러오지 못하면 — 이유를 알려주고 자르기 버튼 자체를 내린다",
    failNote.loaded === false &&
      failNote.hasOpenButton === false &&
      failNote.note.includes("불러오지 못해"),
    JSON.stringify(failNote)
  );

  await failing.close();

  /* --- J2/J3/K --- */

  const page = await openStudio(context);
  await enableInspector(page);

  /* J2. 보호 영역(post-body) 안의 이미지는 자를 수 없다 */

  const protectedCapability = await page.evaluate(() => {

    const doc = new DOMParser().parseFromString(
      '<div data-imory-region="post-body"><img src="https://example.com/x.png"></div>' +
      '<img class="free" src="https://example.com/x.png">',
      "text/html"
    );

    const inside = window.describeInspectorElement(
      doc.body.querySelector("[data-imory-region] img"),
      { declaredSlotNames: [], requiredSlotNames: [] }
    );

    const free = window.describeInspectorElement(
      doc.body.querySelector(".free"),
      { declaredSlotNames: [], requiredSlotNames: [] }
    );

    return { inside: inside.capabilities.crop, free: free.capabilities.crop };

  });

  record(
    "J2. 글 본문 보호 영역 안의 이미지는 자르기 대상이 아니다(바깥 이미지는 가능)",
    protectedCapability.inside === false && protectedCapability.free === true,
    JSON.stringify(protectedCapability)
  );

  /* J3. 링크 안의 이미지 — 래퍼가 링크 안쪽에 들어가 클릭 범위가 유지된다 */

  await page.evaluate(() => {
    /* fixture에는 링크 안 이미지가 없으므로 Code Apply로 하나 만든다.
       (스킨 작성자가 흔히 쓰는 구조라 반드시 확인해야 한다) */
    const skin = window.getStudioAiWorkingState({ includePackage: true }).skinPackage;
    window.applyStudioDirectEdit(
      "home",
      skin.templates.home.html.replace(
        '<img class="y-cover"',
        '<a class="y-linked" href="/scenario-y/category/301"><img class="y-inlink" src="https://example.com/cover.png" alt="링크 이미지"></a><img class="y-cover"'
      ),
      skin.css + ' .y-inlink { width: 100px; height: 60px; }'
    );
  });

  await sleep(800);
  await previewHas(page, ".y-inlink");

  await selectInPreview(page, ".y-inlink");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "1:1");
  await applyCrop(page);

  const linked = await cropGeometry(page, ".y-inlink");
  const linkedPkg = await workingPackage(page);

  record(
    "J3. 링크 안의 이미지 — 래퍼가 <a> 안쪽에 들어가 링크 클릭 범위가 그대로다",
    linked.cropped &&
      linked.insideLink === true &&
      /<a class="y-linked"[^>]*><span data-imory-edit-id="[^"]+-c"><img/.test(linkedPkg.templates.home.html) &&
      coversFrame(linked),
    JSON.stringify({ insideLink: linked.insideLink, html: (linkedPkg.templates.home.html.match(/<a class="y-linked".{0,120}/) || [])[0] })
  );

  /* K. 이미지 교체 — 원본 비율이 달라져도 빈틈이 생기지 않는다 */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "1:1");
  await setCropZoom(page, 130);
  await applyCrop(page);

  const beforeSwap = await cropGeometry(page, ".y-cover");

  await page.evaluate(() => {
    /* 이미지 라이브러리가 넘겨주는 모양 그대로다(id / public_url) */
    window.setStudioImageSlot("cover", {
      id: "img-swapped",
      public_url: "https://example.com/swapped.png"
    });
  });

  await sleep(1000);

  const afterSwap = await cropGeometry(page, ".y-cover");

  record(
    "K. 원본 비율이 다른 이미지로 교체해도 — 프레임 크기·구도가 그대로이고 빈틈이 없다",
    afterSwap.cropped &&
      afterSwap.src !== beforeSwap.src &&
      near(afterSwap.frame.width, beforeSwap.frame.width) &&
      near(afterSwap.frame.height, beforeSwap.frame.height) &&
      afterSwap.objectFit === "cover" &&
      coversFrame(afterSwap),
    JSON.stringify({ before: beforeSwap.src, after: afterSwap.src, frame: afterSwap.frame, image: afterSwap.image })
  );

  /* 교체 뒤에도 다시 조작할 수 있다 */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "4:3");
  await applyCrop(page);

  const afterSwapRecrop = await cropGeometry(page, ".y-cover");

  record(
    "K2. 교체한 이미지도 다시 자를 수 있고 래퍼가 늘어나지 않는다(문서 전체 2개 = 링크 이미지 + 커버)",
    afterSwapRecrop.cropped &&
      afterSwapRecrop.wrapperCount === 2 &&
      near(afterSwapRecrop.frame.height, afterSwapRecrop.frame.width * 3 / 4, 2) &&
      coversFrame(afterSwapRecrop),
    JSON.stringify({ wrapperCount: afterSwapRecrop.wrapperCount, frame: afterSwapRecrop.frame })
  );

  await page.close();

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

    if (shouldRun("ratio")) await runRatio(context);
    if (shouldRun("compose")) await runCompose(context);
    if (shouldRun("temp")) await runTemp(context);
    if (shouldRun("coexist")) await runCoexist(context);
    if (shouldRun("geometry")) await runGeometry(context);
    if (shouldRun("persist")) await runPersist(context);
    if (shouldRun("guard")) await runGuard(context);

    record(
      "N. 자르기 전 과정에서 /api/skin-ai 호출 0회",
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
