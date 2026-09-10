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
     M. 바깥 상자가 잘라내는 프레임 — 테두리/드래그 판은 **보이는
        자리**에만 · 구도 이동이 포인터와 1:1 · 위치 슬라이더/방향
        버튼 · 여유 없는 축 안내 · 팝오버가 조작 중에 움직이지 않고
        손을 뗀 뒤 핸들을 덮지 않는다
     I. 저장 — Save → 재로드 / Export → Import 뒤에도 구도 유지
     J. 보존/보호 — src·슬롯·링크·edit id 유지, post-body 안 이미지는
        자르기 없음, 로드 실패 이미지는 이유를 안내하고 비활성
     K. 이미지 교체 — 원본 비율이 달라져도 빈틈이 생기지 않는다
     L. 모바일 — 자른 뒤에도 가로 넘침이 없다
     P. 자유 비율 — 네 변/모서리로 가로·세로를 따로 정한다. 사진은
        원본 비율 그대로이고(왜곡 없음) 줄일 때는 배율·위치가
        유지된다. 자유 ↔ 고정 전환에서 구도가 초기화되지 않고,
        삼등분 가이드선은 자르는 동안만 보인다. Escape/적용/Undo/
        초기화/Save·재로드/Export·Import
     Q. 자유 비율 핸들 좌표 — Desktop / AI 패널 / Mobile 축소 배율
     R. 슬라이더 — 너비·확대·위치가 같은 규칙(3px 막대·12px 흰 손잡이)
        을 쓰고, 방향키 조작·채움 비율·비활성 구분이 그대로다
     N. 전 과정 /api/skin-ai 호출 0회
     Z. 콘솔 에러 없음

   ★ 실행 방법
     node studio/studio-crop-e2e-test.mjs
     node studio/studio-crop-e2e-test.mjs --browser=webkit
     node studio/studio-crop-e2e-test.mjs --only=ratio

   --only= 뒤에 쓸 수 있는 이름:
     ratio / compose / temp / coexist / geometry / persist / guard /
     frame / free / freegeo / sliders
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


/* 자유 비율 핸들의 화면 좌표 — 없으면(고정 비율이면) null. */
async function cropHandleRects(page) {

  return page.evaluate(() => {

    const out = {};

    document.querySelectorAll("[data-inspector-crop-handle]").forEach((el) => {

      if (el.hidden) return;

      const r = el.getBoundingClientRect();
      const round = (n) => Math.round(n * 10) / 10;

      out[el.dataset.inspectorCropHandle] = {
        x: round(r.left + r.width / 2),
        y: round(r.top + r.height / 2),
        width: round(r.width),
        height: round(r.height)
      };

    });

    return out;

  });

}


/* 변/모서리 핸들 하나를 실제 포인터로 끈다. dx/dy는 **화면 px**이라
   Mobile 축소 배율까지 그대로 지난다. */
async function dragCropHandle(page, edge, dx, dy, options) {

  const start = await page.evaluate((name) => {

    const el = document.querySelector(`[data-inspector-crop-handle="${name}"]`);

    if (!el || el.hidden) return null;

    const r = el.getBoundingClientRect();

    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };

  }, edge);

  if (!start) {
    throw new Error(`자유 비율 핸들이 보이지 않습니다: ${edge}`);
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(start.x + (dx * step) / 4, start.y + (dy * step) / 4);
    await sleep(50);
  }

  if (options && options.escape) {
    await page.keyboard.press("Escape");
    await sleep(250);
    await page.mouse.up();
    await sleep(350);
    return start;
  }

  await page.mouse.up();
  await sleep(400);

  return start;

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


/* =========================================================
   실제로 **그려진 사진**의 사각형

   cropGeometry는 <img> 요소의 사각형까지만 본다. object-fit: cover는
   그 요소 안에서 사진을 한 번 더 자르므로, "사진이 늘어나거나
   찌그러지지 않았는가 / 배율이 그대로인가"는 여기서 원본 크기로
   되짚어야 잴 수 있다.
========================================================== */

async function drawnPhoto(page, selector) {

  return page.evaluate((sel) => {

    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const el = doc.querySelector(sel);

    if (!el) return null;

    const view = doc.defaultView;
    const style = view.getComputedStyle(el);
    const box = el.getBoundingClientRect();

    const nW = Number(el.naturalWidth) || 0;
    const nH = Number(el.naturalHeight) || 0;

    if (!nW || !nH) return null;

    const scale =
      style.objectFit === "cover"
        ? Math.max(box.width / nW, box.height / nH)
        : Math.min(box.width / nW, box.height / nH);

    const width = nW * scale;
    const height = nH * scale;

    const pos = String(style.objectPosition).trim().split(/\s+/).map(parseFloat);
    const px = (Number.isFinite(pos[0]) ? pos[0] : 50) / 100;
    const py = (Number.isFinite(pos[1]) ? pos[1] : px * 100) / 100;

    const r = (n) => Math.round(n * 100) / 100;

    return {
      width: r(width),
      height: r(height),
      left: r(box.left + (box.width - width) * px),
      top: r(box.top + (box.height - height) * py),
      ratio: r(width / height),
      naturalRatio: r(nW / nH)
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

/* 사진 위치는 "프레임을 덮는" 범위 안으로 눌린다 — 사진이 프레임보다
   큰 만큼(음수)과 0 사이다. 그 범위가 0이면 사진이 프레임에 꼭 맞아
   움직일 여유가 없다. */
const clampInside = (value, lowest) => Math.min(Math.max(value, lowest), 0);


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
   P. 자유 비율 — 네 변과 모서리로 프레임을 직접 정한다

   ★ 이 절이 반복해서 재는 것 세 가지
     1) 사진이 **원본 비율 그대로**인가 (drawnPhoto.ratio ===
        naturalRatio) — 프레임을 바꿔도 늘어나거나 찌그러지지 않는다
     2) 빈틈이 없는가 (coversFrame)
     3) 프레임을 줄일 때 **사진 배율·위치가 유지**되는가 — 줄인 것은
        보이는 범위이지 사진이 아니다

   ★ 좌우 핸들은 너비만, 상하 핸들은 높이만 바꾼다. 반대쪽 변이
     기준점이라 "잡은 쪽만 움직인다"로 보여야 한다.
========================================================== */

async function runFree(context) {

  const page = await openStudio(context, { viewport: { width: 1440, height: 900 } });
  await enableInspector(page);

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);
  await openCrop(page);

  /* --- P1. 자유를 고르기 전에는 변 핸들이 없다 --- */

  const fixedHandles = await cropHandleRects(page);

  const beforeFree = await cropGeometry(page, ".y-cover");

  await chooseCropRatio(page, "free");

  const freeHandles = await cropHandleRects(page);
  const afterFree = await cropGeometry(page, ".y-cover");

  record(
    "P1. '자유'를 고르면 화면은 그대로이고 변·모서리 핸들 8개가 나타난다(고정 비율에서는 하나도 없다)",
    Object.keys(fixedHandles).length === 0 &&
      Object.keys(freeHandles).length === 8 &&
      near(afterFree.frame.width, beforeFree.frame.width) &&
      near(afterFree.frame.height, beforeFree.frame.height),
    JSON.stringify({
      fixed: Object.keys(fixedHandles).length,
      free: Object.keys(freeHandles).sort(),
      frame: afterFree.frame
    })
  );

  /* 핸들이 실제로 프레임의 변 가운데/모서리에 앉아 있는가 */
  const surface = await cropSurfaceRect(page);

  record(
    "P1b. 핸들 좌표가 지금 프레임의 변 가운데·모서리와 정확히 맞는다",
    near(freeHandles.n.x, (surface.left + surface.right) / 2) &&
      near(freeHandles.n.y, surface.top) &&
      near(freeHandles.s.y, surface.bottom) &&
      near(freeHandles.w.x, surface.left) &&
      near(freeHandles.e.x, surface.right) &&
      near(freeHandles.nw.x, surface.left) && near(freeHandles.nw.y, surface.top) &&
      near(freeHandles.se.x, surface.right) && near(freeHandles.se.y, surface.bottom) &&
      /* 보이는 막대는 얇아도 **잡는 자리**는 넉넉하다 */
      freeHandles.n.height >= 18 && freeHandles.w.width >= 18,
    JSON.stringify({ surface, n: freeHandles.n, w: freeHandles.w, se: freeHandles.se })
  );

  /* --- P2. 아래 변 — 높이만 줄고, 사진은 제자리에 남는다 --- */

  const beforeBottom = await cropGeometry(page, ".y-cover");
  const photoBefore = await drawnPhoto(page, ".y-cover");

  await dragCropHandle(page, "s", 0, -30);

  const afterBottom = await cropGeometry(page, ".y-cover");
  const photoAfter = await drawnPhoto(page, ".y-cover");

  record(
    "P2. 아래 변을 끌면 **높이만** 줄고 너비는 그대로다 — 사진은 원본 비율 그대로이고 빈틈도 없다",
    near(afterBottom.frame.width, beforeBottom.frame.width) &&
      afterBottom.frame.height < beforeBottom.frame.height - 20 &&
      near(photoAfter.ratio, photoAfter.naturalRatio, 0.02) &&
      coversFrame(afterBottom),
    JSON.stringify({ before: beforeBottom.frame, after: afterBottom.frame, photo: photoAfter })
  );

  record(
    "P2b. 줄인 것은 보이는 범위다 — 사진의 배율과 화면 위 자리가 그대로다(위쪽 변이 기준점)",
    near(photoAfter.width, photoBefore.width, 2) &&
      near(photoAfter.height, photoBefore.height, 2) &&
      near(photoAfter.left, photoBefore.left, 2) &&
      near(photoAfter.top, photoBefore.top, 2),
    JSON.stringify({ before: photoBefore, after: photoAfter })
  );

  /* --- P3. 오른쪽 변 — 너비만 --- */

  const beforeRight = await cropGeometry(page, ".y-cover");

  await dragCropHandle(page, "e", -40, 0);

  const afterRight = await cropGeometry(page, ".y-cover");
  const photoRight = await drawnPhoto(page, ".y-cover");

  record(
    "P3. 오른쪽 변을 끌면 **너비만** 줄고 높이는 그대로다 — 왜곡도 빈틈도 없다",
    near(afterRight.frame.height, beforeRight.frame.height, 2) &&
      afterRight.frame.width < beforeRight.frame.width - 25 &&
      near(photoRight.ratio, photoRight.naturalRatio, 0.02) &&
      coversFrame(afterRight),
    JSON.stringify({ before: beforeRight.frame, after: afterRight.frame, photoRatio: photoRight.ratio })
  );

  /* --- P4. 모서리 — 가로·세로를 **따로** --- */

  const beforeCorner = await cropGeometry(page, ".y-cover");

  await dragCropHandle(page, "se", 60, 10);

  const afterCorner = await cropGeometry(page, ".y-cover");
  const photoCorner = await drawnPhoto(page, ".y-cover");

  const beforeCornerRatio = beforeCorner.frame.width / beforeCorner.frame.height;
  const afterCornerRatio = afterCorner.frame.width / afterCorner.frame.height;

  record(
    "P4. 모서리는 가로·세로를 각각 바꾼다(비율 유지가 아니다) — 그래도 사진은 원본 비율이고 빈틈이 없다",
    afterCorner.frame.width > beforeCorner.frame.width + 25 &&
      afterCorner.frame.height > beforeCorner.frame.height + 3 &&
      Math.abs(afterCornerRatio - beforeCornerRatio) > 0.15 &&
      near(photoCorner.ratio, photoCorner.naturalRatio, 0.02) &&
      coversFrame(afterCorner),
    JSON.stringify({
      before: beforeCorner.frame, after: afterCorner.frame,
      ratio: [Math.round(beforeCornerRatio * 100) / 100, Math.round(afterCornerRatio * 100) / 100]
    })
  );

  /* --- P5. 자유 비율에서도 확대와 구도 이동이 그대로 된다 --- */

  await setCropZoom(page, 180);

  const zoomed = await cropGeometry(page, ".y-cover");
  const zoomedDraft = (await inspectorState(page)).cropDraft;

  /* 변을 끄는 동안 위쪽 변이 기준점이었으므로 세로 구도는 지금 위
     끝(-1)에 붙어 있다 — 위로 끌어야(사진이 올라가야) 움직인다.
     가로는 오른쪽으로 끌면 값이 줄어든다(부호는 model 머리말 참고). */
  await dragCropSurface(page, 25, -18);

  const movedDraft = (await inspectorState(page)).cropDraft;
  const moved = await cropGeometry(page, ".y-cover");
  const movedPhoto = await drawnPhoto(page, ".y-cover");

  record(
    "P5. 자유 비율에서도 확대·상하좌우 구도 이동이 된다 — 여전히 빈틈이 없다",
    zoomedDraft.free === true &&
      near(zoomedDraft.zoom, 1.8, 0.02) &&
      coversFrame(zoomed) &&
      movedDraft.x < zoomedDraft.x && movedDraft.y > zoomedDraft.y &&
      coversFrame(moved) &&
      near(movedPhoto.ratio, movedPhoto.naturalRatio, 0.02),
    JSON.stringify({ zoom: zoomedDraft.zoom, before: [zoomedDraft.x, zoomedDraft.y], after: [movedDraft.x, movedDraft.y] })
  );

  /* --- P6. Escape — 끌기 시작 전 프레임으로만 되돌린다 --- */

  const beforeEscape = await cropGeometry(page, ".y-cover");

  await dragCropHandle(page, "n", 0, 35, { escape: true });

  const afterEscape = await cropGeometry(page, ".y-cover");
  const escapeState = await inspectorState(page);

  record(
    "P6. 변을 끄는 중 Escape — 끌기 시작 전 프레임으로 돌아가고 자르기 편집은 열린 채로 남는다",
    !!escapeState.cropDraft &&
      escapeState.cropSizing === false &&
      near(afterEscape.frame.width, beforeEscape.frame.width, 2) &&
      near(afterEscape.frame.height, beforeEscape.frame.height, 2),
    JSON.stringify({ before: beforeEscape.frame, after: afterEscape.frame })
  );

  /* --- P7. 자유 -> 고정 -> 자유 전환 --- */

  /* ★ zoom/x/y 숫자가 같다는 것은 구도가 보존됐다는 증거가 되지
     못한다 — 그 셋은 전부 **프레임에 대한 비율**이라, 프레임 높이가
     바뀌면 같은 숫자로도 화면의 사진이 함께 커지고 작아진다.
     그래서 여기서는 **실제로 그려진 사진**의 자리와 크기를 잰다. */

  const beforeSwitchPhoto = await drawnPhoto(page, ".y-cover");
  const beforeSwitchFrame = await cropGeometry(page, ".y-cover");

  await chooseCropRatio(page, "1:1");

  const squareState = (await inspectorState(page)).cropDraft;
  const squareFrame = await cropGeometry(page, ".y-cover");
  const squarePhoto = await drawnPhoto(page, ".y-cover");

  /* 1:1은 프레임을 크게 키우므로 사진이 덮지 못할 수 있다 —
     그때만, **덮는 데 필요한 최소 배율**만큼 커져야 한다. */
  const grew =
    squarePhoto.width / beforeSwitchPhoto.width;

  const coverNeeded =
    Math.max(
      1,
      squareFrame.frame.width / beforeSwitchPhoto.width,
      squareFrame.frame.height / beforeSwitchPhoto.height
    );

  record(
    "P7. 자유 → 고정(1:1) — 화면의 사진은 그대로 있고, 프레임을 덮는 데 필요한 최소 배율만 더해진다",
    squareState.free === false &&
      near(squareFrame.frame.height, squareFrame.frame.width, 2) &&
      near(squareFrame.frame.width, beforeSwitchFrame.frame.width, 2) &&
      /* 사진은 절대 작아지지 않고, 커졌다면 딱 덮을 만큼만 */
      grew >= 0.998 && near(grew, coverNeeded, 0.01) &&
      /* 기준점은 프레임 왼쪽 위 — 그 점을 축으로 커지고, 프레임을
         덮는 범위 안으로만 눌린다(빈틈이 생기지 않게) */
      near(squarePhoto.left - squareFrame.frame.left,
           clampInside((beforeSwitchPhoto.left - beforeSwitchFrame.frame.left) * grew,
                       squareFrame.frame.width - squarePhoto.width), 1.2) &&
      near(squarePhoto.top - squareFrame.frame.top,
           clampInside((beforeSwitchPhoto.top - beforeSwitchFrame.frame.top) * grew,
                       squareFrame.frame.height - squarePhoto.height), 1.2) &&
      near(squarePhoto.ratio, squarePhoto.naturalRatio, 0.02) &&
      coversFrame(squareFrame),
    JSON.stringify({
      photo: { before: beforeSwitchPhoto, after: squarePhoto },
      frame: { before: beforeSwitchFrame.frame, after: squareFrame.frame },
      grew: Math.round(grew * 10000) / 10000,
      coverNeeded: Math.round(coverNeeded * 10000) / 10000
    })
  );

  await chooseCropRatio(page, "free");

  const backToFree = (await inspectorState(page)).cropDraft;
  const backHandles = await cropHandleRects(page);
  const backPhoto = await drawnPhoto(page, ".y-cover");
  const backFrame = await cropGeometry(page, ".y-cover");

  record(
    "P7b. 고정 → 자유 — 비율만 풀릴 뿐이라 화면의 사진과 프레임이 한 픽셀도 움직이지 않고 핸들만 다시 나온다",
    backToFree.free === true &&
      Object.keys(backHandles).length === 8 &&
      near(backFrame.frame.width, squareFrame.frame.width, 0.6) &&
      near(backFrame.frame.height, squareFrame.frame.height, 0.6) &&
      near(backPhoto.left, squarePhoto.left, 0.6) &&
      near(backPhoto.top, squarePhoto.top, 0.6) &&
      near(backPhoto.width, squarePhoto.width, 0.6),
    JSON.stringify({ square: squarePhoto, free: backPhoto })
  );

  /* --- P8. 삼등분 가이드선 --- */

  const guideWhileCropping = await page.evaluate(() => {
    const el = document.getElementById("studioInspectorCropGuide");
    const surfaceEl = document.getElementById("studioInspectorCropSurface");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      visible: !surfaceEl.hidden && r.width > 0 && r.height > 0,
      matchesSurface:
        Math.round(r.width) === Math.round(surfaceEl.getBoundingClientRect().width)
    };
  });

  /* --- P9. 임시다 — 적용 전에는 SkinPackage가 한 글자도 바뀌지 않는다 --- */

  const packageBefore = await workingPackage(page);
  const draftBeforeApply = (await inspectorState(page)).cropDraft;

  await applyCrop(page);

  const packageAfter = await workingPackage(page);
  const applied = await cropGeometry(page, ".y-cover");
  const appliedPhoto = await drawnPhoto(page, ".y-cover");

  const guideAfterApply = await page.evaluate(() => {
    const surfaceEl = document.getElementById("studioInspectorCropSurface");
    return { surfaceHidden: surfaceEl.hidden };
  });

  record(
    "P8. 자르는 동안 삼등분 가이드선이 프레임 위에 보이고, 적용하면 판과 함께 사라진다",
    guideWhileCropping &&
      guideWhileCropping.visible &&
      guideWhileCropping.matchesSurface &&
      guideAfterApply.surfaceHidden === true,
    JSON.stringify({ cropping: guideWhileCropping, applied: guideAfterApply })
  );

  record(
    "P9. 적용 전에는 SkinPackage가 그대로이고, 적용하면 자유 비율 프레임이 확정된다",
    JSON.stringify(packageBefore) === JSON.stringify(packageBefore) &&
      packageBefore.css.indexOf(`aspect-ratio: ${draftBeforeApply.ratio}`) === -1 &&
      packageAfter.css.indexOf(`aspect-ratio: ${draftBeforeApply.ratio}`) !== -1 &&
      near(applied.frame.width, draftBeforeApply.frameWidth, 2) &&
      near(appliedPhoto.ratio, appliedPhoto.naturalRatio, 0.02) &&
      coversFrame(applied),
    JSON.stringify({ ratio: draftBeforeApply.ratio, frame: applied.frame })
  );

  /* --- P10. 적용 한 번 = Undo 한 번 --- */

  const beforeUndo = await cropGeometry(page, ".y-cover");

  await page.click("#studioInspectorUndoButton");
  await sleep(700);

  const afterUndo = await cropGeometry(page, ".y-cover");

  record(
    "P10. 자유 비율 적용 한 번 = 되돌리기 한 번 — 자르기 전 상태로 통째로 돌아간다",
    beforeUndo.cropped && !afterUndo.cropped && afterUndo.wrapperCount === 0,
    JSON.stringify({ before: beforeUndo.frame, after: afterUndo.frame, wrappers: afterUndo.wrapperCount })
  );

  /* --- P11. Save / 재로드 / Export → Import --- */

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "free");
  await dragCropHandle(page, "s", 0, -26);
  await dragCropHandle(page, "e", -34, 0);
  await setCropZoom(page, 150);
  await dragCropSurface(page, 14, 9);
  await applyCrop(page);

  const beforeSave = await cropGeometry(page, ".y-cover");

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

  const reopened = await openStudio(context, { seedPackage: savedContent });

  const afterReload = await cropGeometry(reopened, ".y-cover");

  record(
    "P11. Save → 재로드 — 자유 비율 프레임(가로·세로)과 구도가 그대로다",
    afterReload.cropped &&
      near(afterReload.frame.width, beforeSave.frame.width) &&
      near(afterReload.frame.height, beforeSave.frame.height) &&
      afterReload.objectPosition === beforeSave.objectPosition &&
      coversFrame(afterReload),
    JSON.stringify({ before: beforeSave.frame, after: afterReload.frame, position: afterReload.objectPosition })
  );

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

  const afterImport = await cropGeometry(reopened, ".y-cover");

  record(
    "P12. Export → Import 왕복 뒤에도 자유 비율과 구도가 살아난다",
    afterImport.cropped &&
      near(afterImport.frame.width, beforeSave.frame.width) &&
      near(afterImport.frame.height, beforeSave.frame.height) &&
      afterImport.objectPosition === beforeSave.objectPosition &&
      coversFrame(afterImport),
    JSON.stringify({ after: afterImport.frame, position: afterImport.objectPosition })
  );

  /* --- P13. 자르기 초기화 — 자유 비율도 깨끗이 풀린다 --- */

  await enableInspector(reopened);
  await selectInPreview(reopened, ".y-cover");
  await openDirectEdit(reopened);

  await reopened.click("#studioInspectorCropReset");
  await sleep(700);

  const afterReset = await cropGeometry(reopened, ".y-cover");

  record(
    "P13. 자르기 초기화 — 자유 비율로 자른 것도 래퍼째 풀린다",
    !afterReset.cropped && afterReset.wrapperCount === 0,
    JSON.stringify({ frame: afterReset.frame, wrappers: afterReset.wrapperCount })
  );

  await reopened.close();

}


/* =========================================================
   S. 잡은 변은 포인터를 1:1로, 반대쪽 변은 그 자리에

   ★ 왜 정렬마다 재는가
   프레임은 보통 흐름 안에 있고 **폭이 바뀌면 정렬 규칙이 자리를
   다시 정한다.** 가운데 정렬이면 폭을 10px 늘렸을 때 양쪽 변이
   5px씩 벌어지고(잡은 변은 손의 절반만 따라온다), 오른쪽 정렬이면
   오른쪽 변을 끌어도 왼쪽 변이 움직인다. 이동량을 2배로 키우는
   방식은 잡은 변만 맞추고 반대쪽은 여전히 흔들린다.

   그래서 왼쪽/가운데/오른쪽 정렬 **각각**에서 네 변과 모서리를
   전부 끌어 보고, 두 가지를 함께 잰다:

     잡은 변   포인터가 움직인 화면 px 그대로 움직였는가
     반대쪽 변 한 픽셀도 움직이지 않았는가

   ★ 화면 px로 잰다 — Mobile Preview의 축소 배율까지 그대로 지나야
     하므로(아래 S-mobile) 두 값을 같은 좌표계에서 비교한다.
========================================================== */

/* 잡은 변과 반대쪽 변 — 이 표가 곧 검사 내용이다.

   ★ 전부 프레임 **안쪽으로** 끈다. 오른쪽 정렬에서는 프레임의
     오른쪽 변이 창 끝에 붙어 있어 바깥으로 끌면 포인터가 창 밖으로
     나가고(그건 브라우저 한계이지 제품 동작이 아니다), 왼쪽 정렬은
     왼쪽 변이 그렇다. 안쪽 방향은 세 정렬 모두에서 항상 창 안이다.
   ★ 케이스마다 프레임을 원래 크기로 되돌리고 시작한다 — 여섯 번을
     이어서 줄이면 마지막에는 하한에 닿아 "제한 전"이 아니게 된다. */
const STUDIO_INSPECTOR_CROP_EDGE_CASES = [
  { edge: "e", dx: -40, dy: 0, moves: ["right"], holds: ["left", "top", "bottom"] },
  { edge: "w", dx: 34, dy: 0, moves: ["left"], holds: ["right", "top", "bottom"] },
  { edge: "s", dx: 0, dy: -26, moves: ["bottom"], holds: ["top", "left", "right"] },
  { edge: "n", dx: 0, dy: 18, moves: ["top"], holds: ["bottom", "left", "right"] },
  { edge: "se", dx: -30, dy: -22, moves: ["right", "bottom"], holds: ["left", "top"] },
  { edge: "nw", dx: 24, dy: 16, moves: ["left", "top"], holds: ["right", "bottom"] }
];


async function setCropAlignment(page, value) {

  await page.click(`[data-inspector-control="imageAlign"][data-inspector-value="${value}"]`);

  await sleep(600);

}


/* 프레임을 한 번 씌우고 정렬을 정한 뒤, 자유 비율로 다시 연다 */
async function openFreeCropWithAlignment(page, selector, alignment) {

  await selectInPreview(page, selector);
  await openDirectEdit(page);

  const geometry = await cropGeometry(page, selector);

  if (!geometry.cropped) {

    await openCrop(page);
    await chooseCropRatio(page, "current");
    await applyCrop(page);

    /* 확정은 스킨을 다시 렌더하므로 선택과 폼을 다시 잡는다 */
    await selectInPreview(page, selector);
    await openDirectEdit(page);

  }

  await setCropAlignment(page, alignment);

  await selectInPreview(page, selector);
  await openDirectEdit(page);

  await openCrop(page);
  await chooseCropRatio(page, "free");

}


/* 케이스 하나가 끝나면 취소하고 다시 연다 — 확정된 프레임(원래
   크기)에서 다시 시작한다. */
async function resetFreeCrop(page, selector) {

  await page.click("#studioInspectorCropCancel");
  await sleep(450);

  await selectInPreview(page, selector);
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "free");

}


/* ★ 오른쪽 정렬만 Mobile Preview에서 잰다
   fixture의 프레임 부모는 iframe 폭을 꽉 채우므로, 오른쪽 정렬이면
   프레임의 오른쪽 변이 **창의 오른쪽 끝 픽셀**에 붙는다. 그 자리의
   핸들은 절반이 창 밖이라 테스트 포인터가 누를 수 없다 — 브라우저
   한계이지 제품 동작이 아니다. Mobile Preview는 iframe(390px)이
   stage 가운데에 놓여 사방에 여백이 생기므로 같은 정렬을 그대로
   재면서 축소 배율까지 함께 지난다. */
const STUDIO_INSPECTOR_CROP_ALIGN_CASES = [
  { alignment: "left", mobile: false },
  { alignment: "center", mobile: false },
  { alignment: "right", mobile: true }
];


async function runFreeAlign(context) {

  for (const { alignment, mobile } of STUDIO_INSPECTOR_CROP_ALIGN_CASES) {

    const page = await openStudio(context, { viewport: { width: 1440, height: 900 } });
    await enableInspector(page);

    if (mobile) {
      await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
      await sleep(1100);
    }

    await openFreeCropWithAlignment(page, ".y-cover", alignment);

    /* 정렬이 실제로 걸렸는지 먼저 확인한다 — 안 걸렸으면 아래
       검사는 세 번 다 같은 상황을 재게 된다(빈 검사). */
    const placement = await page.evaluate(() => {
      const doc = document.getElementById("studioPreviewFrame").contentDocument;
      const frame = doc.querySelector(".y-cover").parentElement;
      const style = doc.defaultView.getComputedStyle(frame);
      const box = frame.getBoundingClientRect();
      const parent = frame.parentElement.getBoundingClientRect();
      const r = (n) => Math.round(n * 10) / 10;
      return {
        marginLeft: style.marginLeft,
        marginRight: style.marginRight,
        gapLeft: r(box.left - parent.left),
        gapRight: r(parent.right - box.right)
      };
    });

    record(
      `S0(${alignment}${mobile ? "·Mobile" : ""}). 프레임이 실제로 그 정렬로 놓여 있다`,
      alignment === "left"
        ? placement.gapLeft < 20 && placement.gapRight > 40
        : alignment === "right"
          ? placement.gapRight < 20 && placement.gapLeft > 40
          : Math.abs(placement.gapLeft - placement.gapRight) < 3 && placement.gapLeft > 20,
      JSON.stringify(placement)
    );

    for (const testCase of STUDIO_INSPECTOR_CROP_EDGE_CASES) {

      await resetFreeCrop(page, ".y-cover");

      const before = await previewRectOnScreen(page, ".y-cover");

      await dragCropHandle(page, testCase.edge, testCase.dx, testCase.dy);

      const after = await previewRectOnScreen(page, ".y-cover");
      const geometry = await cropGeometry(page, ".y-cover");
      const photo = await drawnPhoto(page, ".y-cover");

      /* 잡은 변은 포인터가 간 만큼 — 가로는 dx, 세로는 dy */
      const expected = {
        left: testCase.dx,
        right: testCase.dx,
        top: testCase.dy,
        bottom: testCase.dy
      };

      const moved =
        testCase.moves.every(side =>
          near(after[side] - before[side], expected[side], 2));

      const held =
        testCase.holds.every(side => near(after[side], before[side], 2));

      record(
        `S(${alignment}${mobile ? "·Mobile" : ""}) ${testCase.edge} — 잡은 변은 포인터만큼(${testCase.moves.join("/")}), 반대쪽은 제자리(${testCase.holds.join("/")})`,
        moved && held &&
          near(photo.ratio, photo.naturalRatio, 0.02) &&
          coversFrame(geometry),
        JSON.stringify({
          before, after,
          moved: testCase.moves.map(s => Math.round((after[s] - before[s]) * 10) / 10),
          held: testCase.holds.map(s => Math.round((after[s] - before[s]) * 10) / 10),
          pointer: [testCase.dx, testCase.dy]
        })
      );

    }

    await page.click("#studioInspectorCropCancel");
    await sleep(400);

    await page.close();

  }

}


/* --- S-mobile. 축소 배율에서도 같은 값 --- */

async function runFreeAlignMobile(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 720 } });
  await enableInspector(page);

  await openFreeCropWithAlignment(page, ".y-cover", "center");

  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await sleep(1100);

  const scale = (await previewRectOnScreen(page, ".y-cover")).scale;

  for (const testCase of STUDIO_INSPECTOR_CROP_EDGE_CASES.slice(0, 5)) {

    await resetFreeCrop(page, ".y-cover");

    const before = await previewRectOnScreen(page, ".y-cover");

    await dragCropHandle(page, testCase.edge, testCase.dx, testCase.dy);

    const after = await previewRectOnScreen(page, ".y-cover");
    const geometry = await cropGeometry(page, ".y-cover");

    const expected = {
      left: testCase.dx, right: testCase.dx,
      top: testCase.dy, bottom: testCase.dy
    };

    record(
      `S-mobile(${scale < 1 ? "축소" : "배율1"}) ${testCase.edge} — 축소된 Preview에서도 화면 px 그대로 움직이고 반대쪽은 제자리`,
      scale < 1 &&
        testCase.moves.every(side => near(after[side] - before[side], expected[side], 2)) &&
        testCase.holds.every(side => near(after[side], before[side], 2)) &&
        coversFrame(geometry),
      JSON.stringify({
        scale: Math.round(scale * 1000) / 1000,
        moved: testCase.moves.map(s => Math.round((after[s] - before[s]) * 10) / 10),
        held: testCase.holds.map(s => Math.round((after[s] - before[s]) * 10) / 10),
        pointer: [testCase.dx, testCase.dy]
      })
    );

  }

  /* --- 적용하면 임시 위치가 걷히고 스킨의 정렬 규칙이 자리를 정한다 --- */

  await page.click('#studioViewportToggle [data-viewport-mode="desktop"]');
  await sleep(900);

  const beforeApply = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const frame = doc.querySelector(".y-cover").parentElement;
    const box = frame.getBoundingClientRect();
    const parent = frame.parentElement.getBoundingClientRect();
    const r = (n) => Math.round(n * 10) / 10;
    return {
      translate: doc.defaultView.getComputedStyle(frame).translate,
      gapLeft: r(box.left - parent.left),
      gapRight: r(parent.right - box.right),
      width: r(box.width),
      height: r(box.height)
    };
  });

  await applyCrop(page);

  const afterApply = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    const frame = doc.querySelector(".y-cover").parentElement;
    const box = frame.getBoundingClientRect();
    const parent = frame.parentElement.getBoundingClientRect();
    const r = (n) => Math.round(n * 10) / 10;
    return {
      translate: doc.defaultView.getComputedStyle(frame).translate,
      gapLeft: r(box.left - parent.left),
      gapRight: r(parent.right - box.right),
      width: r(box.width),
      height: r(box.height)
    };
  });

  const savedCss = await page.evaluate(() =>
    window.getStudioAiWorkingState({ includePackage: true }).skinPackage.css);

  record(
    "S-apply. 적용하면 임시 위치가 걷히고 크기는 그대로인 채 가운데 정렬 규칙이 자리를 정한다",
    beforeApply.translate !== "none" &&
      afterApply.translate === "none" &&
      near(afterApply.width, beforeApply.width, 1.5) &&
      near(afterApply.height, beforeApply.height, 1.5) &&
      Math.abs(afterApply.gapLeft - afterApply.gapRight) < 3 &&
      /* 임시 위치는 저장 CSS에 한 글자도 가지 않는다 */
      savedCss.indexOf("translate") === -1,
    JSON.stringify({ before: beforeApply, after: afterApply })
  );

  await page.close();

}


/* =========================================================
   T. 확대 상한 — 값을 자르지 않고 프레임을 멈춘다
========================================================== */

async function runFreeLimit(context) {

  const page = await openStudio(context, { viewport: { width: 1440, height: 900 } });
  await enableInspector(page);

  await selectInPreview(page, ".y-cover");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "free");

  /* 확대를 상한 근처로 올려 둔다 — 이 상태에서 프레임을 더 줄이면
     사진 배율을 유지할 방법이 없어진다. */
  await setCropZoom(page, 300);

  const before = await cropGeometry(page, ".y-cover");
  const photoBefore = await drawnPhoto(page, ".y-cover");

  await dragCropHandle(page, "se", -200, -60);

  const after = await cropGeometry(page, ".y-cover");
  const photoAfter = await drawnPhoto(page, ".y-cover");
  const state = await inspectorState(page);

  const note = await page.evaluate(() => {
    const el = document.getElementById("studioInspectorCropLimitNote");
    return el ? { hidden: el.hidden, text: el.textContent } : null;
  });

  record(
    "T1. 확대 상한에 닿으면 핸들이 그 지점에서 멈춘다 — 요청한 크기(100x40)까지 가지 않는다",
    after.frame.height > 70 && after.frame.height < 80 &&
      after.frame.width > 200 && after.frame.width < 230 &&
      after.frame.height < before.frame.height - 20,
    JSON.stringify({ before: before.frame, after: after.frame, asked: { width: 100, height: 40 } })
  );

  record(
    "T2. 멈추는 대신 사진이 조용히 작아지지 않는다 — 배율과 구도가 그대로다",
    near(photoAfter.width, photoBefore.width, 2) &&
      near(photoAfter.height, photoBefore.height, 2) &&
      near(state.cropDraft.zoom, 4, 0.01) &&
      coversFrame(after),
    JSON.stringify({ before: photoBefore, after: photoAfter, zoom: state.cropDraft.zoom })
  );

  record(
    "T3. 왜 멈췄는지 안내가 뜬다",
    state.cropLimited === true && note && note.hidden === false && note.text.indexOf("400%") !== -1,
    JSON.stringify(note)
  );

  /* 다시 키우면 안내가 사라진다 */
  await dragCropHandle(page, "se", 40, 12);

  const relaxed = await inspectorState(page);

  const noteAfter = await page.evaluate(() => {
    const el = document.getElementById("studioInspectorCropLimitNote");
    return el ? el.hidden : null;
  });

  record(
    "T4. 다시 키우면 한계에서 벗어나 안내가 사라진다",
    relaxed.cropLimited === false && noteAfter === true,
    JSON.stringify({ limited: relaxed.cropLimited, hidden: noteAfter })
  );

  await page.click("#studioInspectorCropCancel");
  await sleep(400);

  await page.close();

}


/* =========================================================
   R. 슬라이더 — 너비 · 확대 · 위치 X/Y가 같은 규칙을 쓴다

   브라우저 기본 range를 버리고 직접 그렸으므로(studio-inspector.css
   슬라이더 절) "보기만 바꾸고 동작은 그대로"를 여기서 재 둔다:
   방향키로 값이 바뀌는가 · 채워진 구간이 값과 함께 움직이는가 ·
   포커스가 보이는가 · 비활성이 활성과 구분되는가.
========================================================== */

/* ::-webkit-slider-runnable-track / -thumb의 계산값은 두 엔진 모두
   getComputedStyle로 돌려주지 않는다(요청해도 요소 자신의 값이
   나온다). 그래서 여기서는 **요소 자신에서 확인할 수 있는 것**만
   잰다 — 기본 모양을 껐는가(appearance), 조작 영역 높이, 색 토큰,
   채움 비율, 값. 3px 막대와 12px 흰 손잡이가 실제로 그렇게
   그려지는지는 두 엔진의 스크린샷으로 확인했다(문서 9절). */
async function rangeState(page, id) {

  return page.evaluate((elementId) => {

    const el = document.getElementById(elementId);

    if (!el) return null;

    const style = window.getComputedStyle(el);

    return {
      value: Number(el.value),
      disabled: el.disabled,
      fill: el.style.getPropertyValue("--imory-range-fill"),
      progress: style.getPropertyValue("--imory-range-progress").trim(),
      trackColor: style.getPropertyValue("--imory-range-track").trim(),
      thumbBorder: style.getPropertyValue("--imory-range-thumb-border").trim(),
      appearance: style.getPropertyValue("-webkit-appearance") || style.appearance,
      height: style.height,
      /* 조작 영역 — 얇게 만든 것은 막대뿐이어야 한다 */
      hitHeight: Math.round(el.getBoundingClientRect().height),
      focused: document.activeElement === el
    };

  }, id);

}


async function runSliders(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);

  const width = await rangeState(page, "studioInspectorSizeRange");

  record(
    "R1. 너비 슬라이더 — 브라우저 기본 모양을 끄고 우리 토큰을 쓰며, 조작 영역은 얇아지지 않았다",
    width &&
      width.appearance === "none" &&
      width.hitHeight >= 18 &&
      width.progress === "#aaaaaa" &&
      width.trackColor === "#dddddd" &&
      width.thumbBorder === "#cccccc" &&
      /%$/.test(width.fill),
    JSON.stringify(width)
  );

  await openCrop(page);
  await chooseCropRatio(page, "16:9");
  await setCropZoom(page, 200);

  /* --- R2. 키보드 --- */

  await page.focus("#studioInspectorCropZoom");

  const beforeKey = await rangeState(page, "studioInspectorCropZoom");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await sleep(500);

  const afterKey = await rangeState(page, "studioInspectorCropZoom");
  const keyDraft = (await inspectorState(page)).cropDraft;

  record(
    "R2. 확대 슬라이더 — 방향키로 값이 움직이고 채워진 구간과 실제 자르기 값이 함께 따라온다",
    beforeKey.focused &&
      afterKey.value === beforeKey.value + 3 &&
      afterKey.fill !== beforeKey.fill &&
      near(keyDraft.zoom, afterKey.value / 100, 0.005),
    JSON.stringify({ before: beforeKey.value, after: afterKey.value, fill: [beforeKey.fill, afterKey.fill], zoom: keyDraft.zoom })
  );

  /* --- R3. 채워진 구간이 값과 비례한다 --- */

  await setCropZoom(page, 250);

  const half = await rangeState(page, "studioInspectorCropZoom");

  record(
    "R3. 채워진 구간이 값 그대로다 — 100~400 범위의 250이면 딱 절반",
    near(parseFloat(half.fill), 50, 0.6),
    JSON.stringify({ value: half.value, fill: half.fill })
  );

  /* --- R4. 비활성 --- */

  /* 정사각형 원본(40x40)을 16:9 프레임에 확대 1.0으로 넣으면 cover가
     좌우는 딱 맞추고 위아래로만 잘라낸다 — 가로 축은 움직일 여유가
     0이라 비활성, 세로 축은 활성이다(M4와 같은 상황). */
  await setCropZoom(page, 100);
  await chooseCropRatio(page, "16:9");

  const disabledAxis = await rangeState(page, "studioInspectorCropPosition-x");
  const enabledAxis = await rangeState(page, "studioInspectorCropPosition-y");

  record(
    "R4. 비활성 슬라이더도 같은 얇은 회색 형태로 남되 색이 한 단계 옅어 활성과 구분된다",
    disabledAxis.disabled === true &&
      enabledAxis.disabled === false &&
      disabledAxis.appearance === "none" &&
      disabledAxis.hitHeight === enabledAxis.hitHeight &&
      disabledAxis.progress !== enabledAxis.progress &&
      disabledAxis.trackColor !== enabledAxis.trackColor &&
      disabledAxis.thumbBorder !== enabledAxis.thumbBorder,
    JSON.stringify({ enabled: enabledAxis, disabled: disabledAxis })
  );

  await cancelCropIfOpen(page);

  await page.close();

}


async function cancelCropIfOpen(page) {

  if (await page.evaluate(() => !!window.getStudioInspectorState().cropDraft)) {
    await page.click("#studioInspectorCropCancel");
    await sleep(400);
  }

}


/* =========================================================
   Q. 자유 비율 핸들 좌표 — Mobile 축소 배율 · AI 패널
========================================================== */

async function runFreeGeometry(context) {

  const page = await openStudio(context, { viewport: { width: 1280, height: 800 } });
  await enableInspector(page);

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "free");

  const desktopHandles = await cropHandleRects(page);
  const desktopFrame = await previewRectOnScreen(page, ".y-avatar");

  record(
    "Q1. Desktop — 핸들이 프레임의 네 변·모서리와 정확히 겹친다",
    near(desktopHandles.w.x, desktopFrame.left) &&
      near(desktopHandles.e.x, desktopFrame.right) &&
      near(desktopHandles.n.y, desktopFrame.top) &&
      near(desktopHandles.s.y, desktopFrame.bottom),
    JSON.stringify({ handles: desktopHandles, frame: desktopFrame })
  );

  await page.click("#studioAiToggleButton");
  await sleep(900);

  const panelHandles = await cropHandleRects(page);
  const panelFrame = await previewRectOnScreen(page, ".y-avatar");

  record(
    "Q2. AI 패널을 열어 Preview가 좁아져도 핸들이 프레임을 따라간다",
    near(panelHandles.w.x, panelFrame.left) &&
      near(panelHandles.e.x, panelFrame.right) &&
      near(panelHandles.s.y, panelFrame.bottom),
    JSON.stringify({ handles: { w: panelHandles.w, e: panelHandles.e }, frame: panelFrame })
  );

  await page.click("#studioAiToggleButton");
  await sleep(900);

  await page.click('#studioViewportToggle [data-viewport-mode="mobile"]');
  await sleep(900);

  const mobileHandles = await cropHandleRects(page);
  const mobileFrame = await previewRectOnScreen(page, ".y-avatar");

  record(
    "Q3. Mobile Preview — 축소 배율까지 반영해 핸들 좌표가 맞는다",
    mobileFrame.scale < 1 &&
      near(mobileHandles.w.x, mobileFrame.left) &&
      near(mobileHandles.e.x, mobileFrame.right) &&
      near(mobileHandles.n.y, mobileFrame.top) &&
      near(mobileHandles.s.y, mobileFrame.bottom),
    JSON.stringify({ handles: mobileHandles, frame: mobileFrame })
  );

  /* 축소된 화면에서 끌어도 화면 위 이동량이 그대로 프레임에 반영되는가 */
  const beforeDrag = await previewRectOnScreen(page, ".y-avatar");

  await dragCropHandle(page, "e", -30, 0);

  const afterDrag = await previewRectOnScreen(page, ".y-avatar");
  const afterGeometry = await cropGeometry(page, ".y-avatar");

  record(
    "Q4. 축소된 Preview에서도 화면 위 이동량이 1:1로 반영된다(왼쪽 변은 그 자리)",
    near(afterDrag.left, beforeDrag.left, 2) &&
      near(afterDrag.right - beforeDrag.right, -30, 4) &&
      coversFrame(afterGeometry),
    JSON.stringify({ before: beforeDrag, after: afterDrag })
  );

  await applyCrop(page);

  const overflow = await page.evaluate(() => {
    const doc = document.getElementById("studioPreviewFrame").contentDocument;
    return {
      docWidth: doc.documentElement.clientWidth,
      scrollWidth: doc.documentElement.scrollWidth,
      bodyScrollWidth: doc.body.scrollWidth
    };
  });

  record(
    "Q5. 자유 비율로 자른 뒤에도 모바일 가로 넘침이 없다",
    overflow.scrollWidth <= overflow.docWidth + 1 &&
      overflow.bodyScrollWidth <= overflow.docWidth + 1,
    JSON.stringify(overflow)
  );

  await page.close();

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
   M. 프레임 좌표 · 팝오버 자리 · 구도 이동 기어비
      (자르기 프레임/팝오버 좌표 라운드)

   fixture .y-hero-box는 **스스로 16:9 높이를 못 박고 자식을
   overflow:hidden으로 잘라내는 바깥 상자**다(실제 사용자 스킨의
   헤더가 이 모양이다). 그 안에서 프레임을 1:1로 키우면 아랫부분은
   화면에 그려지지 않는다 — 그때 선택 테두리와 드래그 판이 어디에
   그려지는지, 그리고 손이 슬라이더를 잡고 있는 동안 팝오버가
   가만히 있는지를 잰다.
========================================================== */

async function runFrame(context) {

  const page = await openStudio(context);
  await enableInspector(page);

  /* --- M1. 조상이 잘라내면 테두리·드래그 판은 "보이는 자리"까지만 --- */

  await selectInPreview(page, ".y-hero");
  await openDirectEdit(page);
  await openCrop(page);
  await chooseCropRatio(page, "1:1");

  const clipped = await page.evaluate(() => {

    const r = (n) => Math.round(n * 100) / 100;

    const box = (id) => {
      const el = document.getElementById(id);
      if (!el || el.hidden) return null;
      const b = el.getBoundingClientRect();
      return { left: r(b.left), top: r(b.top), right: r(b.right), bottom: r(b.bottom), width: r(b.width), height: r(b.height) };
    };

    const frameEl = document.getElementById("studioPreviewFrame");
    const fb = frameEl.getBoundingClientRect();
    const scale = fb.width / (frameEl.offsetWidth || fb.width);
    const doc = frameEl.contentDocument;

    const img = doc.querySelector(".y-hero");
    const wrap = img.parentElement;
    const outer = doc.querySelector(".y-hero-box");

    const map = (el) => {
      const b = el.getBoundingClientRect();
      return { left: r(fb.left + b.left * scale), top: r(fb.top + b.top * scale), right: r(fb.left + b.right * scale), bottom: r(fb.top + b.bottom * scale) };
    };

    return {
      layoutFrame: map(wrap),
      outerBox: map(outer),
      belowTop: r(fb.top + doc.querySelector(".y-below").getBoundingClientRect().top * scale),
      selectBox: box("studioInspectorSelectBox"),
      cropSurface: box("studioInspectorCropSurface"),
      popover: box("studioInspectorPopover"),
      note: (document.getElementById("studioInspectorCropClipped") || {}).textContent || null
    };

  });

  record(
    "M1. 조상이 잘라내는 프레임 — 선택 테두리와 드래그 판이 **보이는 자리**에만 그려진다(아래 문단을 침범하지 않는다)",
    clipped.cropSurface &&
      near(clipped.cropSurface.bottom, clipped.outerBox.bottom, 1.5) &&
      clipped.cropSurface.bottom < clipped.layoutFrame.bottom - 2 &&
      clipped.cropSurface.bottom <= clipped.belowTop + 0.5 &&
      near(clipped.selectBox.bottom, clipped.cropSurface.bottom, 1.5),
    JSON.stringify({
      surfaceBottom: clipped.cropSurface && clipped.cropSurface.bottom,
      layoutBottom: clipped.layoutFrame.bottom,
      outerBottom: clipped.outerBox.bottom,
      belowTop: clipped.belowTop
    })
  );

  record(
    "M1b. 바깥 상자가 잘라내고 있다는 사실을 자르기 폼이 안내한다",
    !!clipped.note && clipped.note.indexOf("바깥 상자") !== -1,
    String(clipped.note)
  );

  record(
    "M1c. 자르는 동안 팝오버가 드래그 판을 덮지 않는다",
    clipped.popover &&
      (clipped.popover.left >= clipped.cropSurface.right - 1 ||
       clipped.popover.right <= clipped.cropSurface.left + 1 ||
       clipped.popover.top >= clipped.cropSurface.bottom - 1 ||
       clipped.popover.bottom <= clipped.cropSurface.top + 1),
    JSON.stringify({ popover: clipped.popover, surface: clipped.cropSurface })
  );

  /* --- M2. 구도 이동 기어비 — 포인터가 움직인 만큼 사진이 따라온다 ---

     확대 2.0에서 세로로 움직일 수 있는 거리는 (2-1) * 프레임높이다.
     40px을 끌면 사진도 40px 움직여야 한다(예전에는 프레임 높이로
     나누고 있어서 그 절반만 따라왔다). */

  await chooseCropRatio(page, "current");
  await setCropZoom(page, 200);

  const before = await inspectorState(page);

  const frameHeight =
    before.selection.rect.height;

  const beforeDraft = before.cropDraft;

  await dragCropSurface(page, 0, -40);

  const afterDraft = (await inspectorState(page)).cropDraft;

  /* travel(px) = (zoom-1)*frameHeight + cover가 잘라낸 몫.
     이 fixture는 원본 80x20을 16:9 프레임에 넣으므로 세로 cover 몫은
     0이다 — travel은 프레임 높이 그대로다. */
  const movedPx =
    (beforeDraft.y - afterDraft.y) / 2 * frameHeight;

  record(
    "M2. 확대한 사진을 세로로 40px 끌면 사진도 40px 움직인다(포인터와 1:1)",
    afterDraft.y > beforeDraft.y && Math.abs(movedPx + 40) <= 6,
    JSON.stringify({ y: [beforeDraft.y, afterDraft.y], frameHeight, movedPx: Math.round(movedPx * 10) / 10 })
  );

  /* --- M3. 위치 슬라이더 / 방향 버튼 --- */

  const stepBefore = (await inspectorState(page)).cropDraft;

  await page.click("#studioInspectorCropStep-y-forward");
  await sleep(400);

  const stepAfter = (await inspectorState(page)).cropDraft;

  record(
    "M3. 사진을 잡지 않고 방향 버튼만으로도 상하 구도를 옮길 수 있다",
    stepAfter.y > stepBefore.y,
    JSON.stringify({ y: [stepBefore.y, stepAfter.y] })
  );

  await page.evaluate(() => {
    const range = document.getElementById("studioInspectorCropPosition-y");
    range.value = "-70";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await sleep(400);

  const sliderGeometry = await cropGeometry(page, ".y-hero");

  record(
    "M3b. 세로 위치 슬라이더가 값 그대로 반영되고 빈틈이 생기지 않는다",
    near((await inspectorState(page)).cropDraft.y, -0.7, 0.02) && coversFrame(sliderGeometry),
    JSON.stringify({ frame: sliderGeometry.frame, image: sliderGeometry.image })
  );

  /* --- M4. 여유가 없는 축은 비활성 + 이유 안내 --- */

  await setCropZoom(page, 100);
  await chooseCropRatio(page, "current");

  const noSlack = await page.evaluate(() => ({
    hint: (document.getElementById("studioInspectorCropHint") || {}).textContent || "",
    yDisabled: document.getElementById("studioInspectorCropPosition-y").disabled,
    xDisabled: document.getElementById("studioInspectorCropPosition-x").disabled
  }));

  record(
    "M4. 확대 1.0에서 움직일 여유가 없는 축은 비활성이고, '확대하면' 이유를 안내한다",
    noSlack.yDisabled === true && noSlack.hint.indexOf("확대") !== -1,
    JSON.stringify(noSlack)
  );

  await page.evaluate(() => {
    const cancel = document.getElementById("studioInspectorCropCancel");
    if (cancel) cancel.click();
  });

  await sleep(400);

  /* --- M5. 손이 슬라이더를 잡고 있는 동안 팝오버가 움직이지 않는다 --- */

  await selectInPreview(page, ".y-avatar");
  await openDirectEdit(page);

  const popoverStart = await popoverBox(page);

  const duringDrag = [];

  for (const width of [180, 240, 300, 200, 140]) {

    await page.evaluate((value) => {
      const range = document.getElementById("studioInspectorSizeRange");
      range.value = String(value);
      range.dispatchEvent(new Event("input", { bubbles: true }));
    }, width);

    await sleep(160);

    duringDrag.push(await popoverBox(page));

  }

  record(
    "M5. 너비 슬라이더를 끄는 동안 팝오버가 한 번도 움직이지 않는다(손이 잡은 슬라이더가 도망가지 않는다)",
    duringDrag.every(p => p && near(p.left, popoverStart.left, 1) && near(p.top, popoverStart.top, 1)),
    JSON.stringify({ start: popoverStart, during: duringDrag.map(p => p && [p.left, p.top]) })
  );

  /* 손을 뗀 뒤에는 이미지와 모서리 핸들을 덮고 있으면 안 된다 */

  await page.evaluate(() => {
    const range = document.getElementById("studioInspectorSizeRange");
    range.value = "320";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await sleep(700);

  const released = await page.evaluate(() => {

    const r = (n) => Math.round(n * 100) / 100;

    const popover = document.getElementById("studioInspectorPopover").getBoundingClientRect();

    const covered =
      ["nw", "ne", "sw", "se"].filter((corner) => {

        const el = document.getElementById("studioInspectorHandle-" + corner);

        if (!el || el.hidden) return false;

        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 2;

        return x >= popover.left && x <= popover.right && y >= popover.top && y <= popover.bottom;

      });

    return {
      covered,
      popover: { left: r(popover.left), top: r(popover.top), right: r(popover.right), bottom: r(popover.bottom) }
    };

  });

  record(
    "M5b. 손을 뗀 뒤에는 팝오버가 모서리 핸들을 덮지 않는다(덮고 있으면 자리를 다시 고른다)",
    released.covered.length === 0,
    JSON.stringify(released)
  );

  await page.close();

}


/* 팝오버의 지금 자리 */
async function popoverBox(page) {

  return page.evaluate(() => {

    const el = document.getElementById("studioInspectorPopover");

    if (!el || el.hidden) return null;

    const b = el.getBoundingClientRect();
    const r = (n) => Math.round(n * 100) / 100;

    return { left: r(b.left), top: r(b.top), width: r(b.width), height: r(b.height) };

  });

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
    if (shouldRun("frame")) await runFrame(context);
    if (shouldRun("free")) await runFree(context);
    if (shouldRun("freegeo")) await runFreeGeometry(context);
    if (shouldRun("freealign")) await runFreeAlign(context);
    if (shouldRun("freealign")) await runFreeAlignMobile(context);
    if (shouldRun("freelimit")) await runFreeLimit(context);
    if (shouldRun("sliders")) await runSliders(context);

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
