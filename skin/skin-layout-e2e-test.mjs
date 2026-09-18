/* =========================================================
   LAYOUT-1 — 배치 primitive E2E (렌더 · 좌표 · 모바일)

   기준 문서: IMORY_LAYOUT_PRIMITIVE_DESIGN.md

   ★ 재는 것은 **실제 좌표**다. "class 가 붙었다"가 아니라
   getBoundingClientRect() 로 어디에 그려졌는지를 본다 — 배치는
   눈에 보이는 결과가 전부이고, 속성만 확인하면 스타일시트가
   빠져도 통과한다.

   ★ 화면은 실제 renderSkin() 이 그린다
   (skin/skin-layout-render-harness.html). 공개 HOME/CATEGORY/POST ·
   sandbox 프레임 · Studio Preview 가 전부 그 함수 하나를 지나므로,
   여기서 맞으면 네 화면이 같은 계산을 쓴다. 그 네 화면의 **진입
   경로**(라우팅 · 프레임 · Supabase)는 이 파일의 범위가 아니다 —
   각 화면의 기존 e2e 가 본다.

   무엇을 보는가
   ------------
   [stack]   세로/가로 · 간격 · 순서
   [grid]    열 수 · span · 간격 · min(auto-fit)
   [free]    비율 좌표 · 겹침 · **어떤 폭에서도 컨테이너 밖으로
             나가지 않는다**
   [sidebar] 왼쪽/오른쪽 · 폭 · main 자식이 여럿일 때
   [panel]   담기만 한다 · 최대 폭 · 중첩
   [nest]    panel > sidebar > (stack | grid), panel > free > stack
   [repeat]  반복으로 생긴 항목도 자기 자리 값을 받는다
   [mobile]  390px 에서 열이 줄고 사이드바가 접히고 **가로 넘침 0**
   [save]    저장 경계(sanitize)를 지나도 배치 속성이 살아 있다
   [legacy]  배치 속성이 없는 스킨은 style 속성조차 생기지 않는다

   실행:
     node skin/skin-layout-e2e-test.mjs
     node skin/skin-layout-e2e-test.mjs --browser=webkit
     node skin/skin-layout-e2e-test.mjs --only=free
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8964;

const HARNESS_URL =
  `http://localhost:${PORT}/skin/skin-layout-render-harness.html`;

const args = process.argv.slice(2);

const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");


/* =========================================================
   playwright 찾기 (다른 e2e 와 같은 loader)
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

  const found = [];

  for (const base of candidates) {

    const entry = path.join(base, "playwright", "package.json");

    if (!fs.existsSync(entry)) continue;

    let version = "0.0.0";

    try {
      version = JSON.parse(fs.readFileSync(entry, "utf8")).version || "0.0.0";
    } catch { /* 못 읽으면 가장 낮게 */ }

    found.push({ entry, version });

  }

  const toParts = (v) => v.split(".").map(Number);

  found.sort((a, b) => {
    const [ax, ay, az] = toParts(a.version);
    const [bx, by, bz] = toParts(b.version);
    return (bx - ax) || (by - ay) || (bz - az);
  });

  const tried = [];

  for (const { entry, version } of found) {

    let mod;

    try {
      mod = createRequire(entry)("playwright");
    } catch {
      continue;
    }

    const type = mod[browserName];

    if (!type) continue;

    try {
      const probe = await type.launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(`${version}: ${String(err.message).split("\n")[0]}`);
    }

  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다.\n` +
    `시도한 설치:\n  - ${tried.join("\n  - ") || "없음"}\n` +
    `\`npx playwright install ${browserName}\`을 먼저 실행하세요.`
  );

}


/* =========================================================
   실제 저장소 서빙
========================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2"
};

function startServer() {

  const server = http.createServer((req, res) => {

    const url = new URL(req.url, "http://localhost");

    const abs = path.join(ROOT, decodeURIComponent(url.pathname));

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

  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));

}


/* =========================================================
   검사 도구
========================================================== */

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name, condition, detail) {

  if (condition) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);

}

function section(title) {
  console.log(`\n[${title}]`);
}

function wants(name) {
  return !ONLY || ONLY === name;
}

/* 소수점 반올림 차이를 흡수한다 — 배치 계산은 부동소수라 1px
   이내의 차이는 "같다"로 본다. 그보다 크면 진짜 어긋난 것이다. */
function near(a, b, tolerance = 1.2) {
  return Math.abs(a - b) <= tolerance;
}


/* 여러 요소의 사각형을 한 번에 가져온다 */
function rects(page, selectors) {

  return page.evaluate((list) => {

    const out = {};

    list.forEach((selector) => {

      const el = document.querySelector(selector);

      if (!el) {
        out[selector] = null;
        return;
      }

      const r = el.getBoundingClientRect();

      out[selector] = {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height
      };

    });

    return out;

  }, selectors);

}


async function run() {

  const server = await startServer();
  const playwright = await loadPlaywright(BROWSER);
  const browser = await playwright[BROWSER].launch();

  const consoleErrors = [];

  try {

    const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto(HARNESS_URL, { waitUntil: "load" });

    await page.waitForFunction(() => window.__layoutHarnessReady === true, null, { timeout: 20000 });

    /* 스타일시트가 실제로 붙었는지 먼저 본다 — 이것이 없으면 아래
       모든 좌표 검사가 "아무 배치도 안 된 흐름"을 재게 된다. */
    const stylesheetLinked =
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .some((link) => (link.getAttribute("href") || "").indexOf("skin-layout.css") !== -1)
      );

    check("[boot] renderSkin 이 배치 스타일시트를 걸었다", stylesheetLinked);


    /* =====================================================
       STACK
    ====================================================== */

    if (wants("stack")) {

      section("stack");

      const r = await rects(page, [
        ".lay-stack-col", ".lay-a", ".lay-b", ".lay-c",
        ".lay-stack-row", ".lay-r1", ".lay-r2", ".lay-r3"
      ]);

      check(
        "세로 stack 은 자식이 위아래로 이어진다",
        r[".lay-a"].bottom <= r[".lay-b"].top + 0.5 &&
        r[".lay-b"].bottom <= r[".lay-c"].top + 0.5,
        JSON.stringify(r[".lay-a"]) + " / " + JSON.stringify(r[".lay-b"])
      );

      check(
        "세로 stack 의 간격이 gap 그대로(12px)",
        near(r[".lay-b"].top - r[".lay-a"].bottom, 12) &&
        near(r[".lay-c"].top - r[".lay-b"].bottom, 12),
        String(r[".lay-b"].top - r[".lay-a"].bottom)
      );

      check(
        "세로 stack 의 자식은 순서대로다(A→B→C)",
        r[".lay-a"].top < r[".lay-b"].top && r[".lay-b"].top < r[".lay-c"].top
      );

      check(
        "가로 stack 은 자식이 한 줄에 나란히",
        near(r[".lay-r1"].top, r[".lay-r2"].top) &&
        near(r[".lay-r2"].top, r[".lay-r3"].top) &&
        r[".lay-r1"].right <= r[".lay-r2"].left + 0.5
      );

      check(
        "가로 stack 의 간격이 gap 그대로(8px)",
        near(r[".lay-r2"].left - r[".lay-r1"].right, 8),
        String(r[".lay-r2"].left - r[".lay-r1"].right)
      );

      /* 순서 변경은 HTML 의 형제 순서를 옮기는 일이다(Studio 의
         ↑↓ 와 AI 가 하는 것이 같다). 여기서는 그 결과가 화면에
         그대로 나오는지, 그리고 간격/정렬이 유지되는지를 본다. */
      await page.evaluate(() => {

        const swapped =
          window.__layoutHarness.layoutHtml.replace(
            '<p class="lay-a">A</p><p class="lay-b">B</p><p class="lay-c">C</p>',
            '<p class="lay-c">C</p><p class="lay-a">A</p><p class="lay-b">B</p>'
          );

        window.__layoutHarness.render(swapped);

      });

      const reordered = await rects(page, [".lay-a", ".lay-b", ".lay-c"]);

      check(
        "순서를 바꾸면 화면 순서도 바뀐다(C→A→B)",
        reordered[".lay-c"].top < reordered[".lay-a"].top &&
        reordered[".lay-a"].top < reordered[".lay-b"].top
      );

      check(
        "순서를 바꿔도 간격은 그대로(12px)",
        near(reordered[".lay-a"].top - reordered[".lay-c"].bottom, 12),
        String(reordered[".lay-a"].top - reordered[".lay-c"].bottom)
      );

      await page.evaluate(() => window.__layoutHarness.reset());

    }


    /* =====================================================
       GRID
    ====================================================== */

    if (wants("grid")) {

      section("grid");

      const r = await rects(page, [
        ".lay-grid", ".lay-g1", ".lay-g2", ".lay-g3", ".lay-g4",
        ".lay-grid-min", ".lay-m1", ".lay-m2", ".lay-m3"
      ]);

      /* 4열 · gap 10 · span 2 짜리 하나
         -> 첫 줄: [G1 G1][G2][G3], 둘째 줄: [G4] */
      const track =
        (r[".lay-grid"].width - 10 * 3) / 4;

      check(
        "열 수대로 나뉜다(4열)",
        near(r[".lay-g2"].width, track) && near(r[".lay-g3"].width, track),
        `track=${track} g2=${r[".lay-g2"].width}`
      );

      check(
        "span=2 인 항목이 두 칸을 차지한다",
        near(r[".lay-g1"].width, track * 2 + 10),
        `expected=${track * 2 + 10} got=${r[".lay-g1"].width}`
      );

      check(
        "열 간격이 gap 그대로(10px)",
        near(r[".lay-g2"].left - r[".lay-g1"].right, 10) &&
        near(r[".lay-g3"].left - r[".lay-g2"].right, 10)
      );

      check(
        "첫 줄에 세 항목이 들어가고 네 번째는 다음 줄로 내려간다",
        near(r[".lay-g1"].top, r[".lay-g2"].top) &&
        near(r[".lay-g2"].top, r[".lay-g3"].top) &&
        r[".lay-g4"].top > r[".lay-g3"].bottom
      );

      check(
        "줄 간격도 gap 그대로(10px)",
        near(r[".lay-g4"].top - r[".lay-g1"].bottom, 10),
        String(r[".lay-g4"].top - r[".lay-g1"].bottom)
      );

      /* min 을 준 격자는 열 수를 폭이 정한다 — 1100px 창에서
         200px 최소폭이면 columns="6" 을 적었어도 6열이 되지 않고
         들어갈 수 있는 만큼만 들어간다. */
      check(
        "min 을 주면 항목 폭이 최소 폭 이상이다",
        r[".lay-m1"].width >= 200 - 1,
        String(r[".lay-m1"].width)
      );

      check(
        "min 격자의 세 항목이 한 줄에 있다(1100px 에서)",
        near(r[".lay-m1"].top, r[".lay-m2"].top) &&
        near(r[".lay-m2"].top, r[".lay-m3"].top)
      );

      /* 3열로 바꾸면 그것만 달라진다(scope) */
      await page.evaluate(() => {
        window.__layoutHarness.render(
          window.__layoutHarness.layoutHtml.replace(
            'class="lay-grid" data-imory-layout="grid" data-imory-layout-columns="4"',
            'class="lay-grid" data-imory-layout="grid" data-imory-layout-columns="3"'
          )
        );
      });

      const three = await rects(page, [".lay-grid", ".lay-g1", ".lay-g2", ".lay-g3", ".lay-g4", ".lay-stack-col", ".lay-a"]);

      const track3 =
        (three[".lay-grid"].width - 10 * 2) / 3;

      check(
        "열 수만 바꾸면 그 격자만 달라진다",
        near(three[".lay-g2"].width, track3) &&
        three[".lay-g4"].top > three[".lay-g1"].bottom,
        `track3=${track3} g2=${three[".lay-g2"].width}`
      );

      check(
        "다른 배치는 건드려지지 않는다(stack 은 그대로)",
        near(three[".lay-a"].height, 20)
      );

      await page.evaluate(() => window.__layoutHarness.reset());

    }


    /* =====================================================
       FREE
    ====================================================== */

    if (wants("free")) {

      section("free");

      const r = await rects(page, [
        ".lay-free", ".lay-f-tl", ".lay-f-br", ".lay-f-mid", ".lay-f-top"
      ]);

      const box = r[".lay-free"];

      check(
        "free 컨테이너가 지정한 높이를 갖는다(300px)",
        near(box.height, 300),
        String(box.height)
      );

      check(
        "x=0,y=0 은 왼쪽 위에 딱 붙는다",
        near(r[".lay-f-tl"].left, box.left) && near(r[".lay-f-tl"].top, box.top),
        JSON.stringify(r[".lay-f-tl"])
      );

      check(
        "★ x=1,y=1 은 오른쪽 아래에 **안쪽으로** 딱 붙는다(밖으로 나가지 않는다)",
        near(r[".lay-f-br"].right, box.right) && near(r[".lay-f-br"].bottom, box.bottom),
        `box=${JSON.stringify(box)} br=${JSON.stringify(r[".lay-f-br"])}`
      );

      check(
        "x=0.5,y=0.5 는 가운데다",
        near(
          r[".lay-f-mid"].left + r[".lay-f-mid"].width / 2,
          box.left + box.width / 2
        ) &&
        near(
          r[".lay-f-mid"].top + r[".lay-f-mid"].height / 2,
          box.top + box.height / 2
        )
      );

      check(
        "width 는 컨테이너 폭의 비율이다(30%)",
        near(r[".lay-f-tl"].width, box.width * 0.3, 2),
        `${r[".lay-f-tl"].width} vs ${box.width * 0.3}`
      );

      check(
        "네 항목 모두 컨테이너 안에 있다",
        [".lay-f-tl", ".lay-f-br", ".lay-f-mid", ".lay-f-top"].every(
          (selector) =>
            r[selector].left >= box.left - 1 &&
            r[selector].right <= box.right + 1 &&
            r[selector].top >= box.top - 1 &&
            r[selector].bottom <= box.bottom + 1
        )
      );

      const stacking =
        await page.evaluate(() => {

          const top = document.querySelector(".lay-f-top");
          const br = document.querySelector(".lay-f-br");

          return {
            top: getComputedStyle(top).zIndex,
            br: getComputedStyle(br).zIndex,
            position: getComputedStyle(top).position
          };

        });

      check(
        "z 로 겹침 순서를 정한다",
        stacking.top === "5" && stacking.br === "0" && stacking.position === "absolute",
        JSON.stringify(stacking)
      );

      /* ★ 요구사항 6절의 핵심 — 창이 좁아져도 밖으로 날아가지 않는다.
         런타임 clamp 코드가 없는데도 그런 이유는 좌표가 비율이기
         때문이다. 세 폭에서 확인한다. */
      for (const width of [1100, 700, 390]) {

        await page.setViewportSize({ width, height: 900 });

        const moved = await rects(page, [".lay-free", ".lay-f-tl", ".lay-f-br", ".lay-f-mid"]);

        const nowBox = moved[".lay-free"];

        check(
          `[${width}px] 자유 배치 항목이 전부 컨테이너 안에 있다`,
          [".lay-f-tl", ".lay-f-br", ".lay-f-mid"].every(
            (selector) =>
              moved[selector].left >= nowBox.left - 1 &&
              moved[selector].right <= nowBox.right + 1
          ),
          `box=${JSON.stringify(nowBox)} br=${JSON.stringify(moved[".lay-f-br"])}`
        );

        check(
          `[${width}px] x=1 은 여전히 오른쪽 끝이다`,
          near(moved[".lay-f-br"].right, nowBox.right)
        );

      }

      await page.setViewportSize({ width: 1100, height: 900 });

      /* 좌표를 바꾸면 그대로 따라간다(= Direct Edit/AI 가 쓰는 길) */
      await page.evaluate(() => {
        window.__layoutHarness.render(
          window.__layoutHarness.layoutHtml.replace(
            'class="lay-f-tl" data-imory-item-x="0" data-imory-item-y="0"',
            'class="lay-f-tl" data-imory-item-x="0.25" data-imory-item-y="0.5"'
          )
        );
      });

      const moved = await rects(page, [".lay-free", ".lay-f-tl"]);

      const movedBox = moved[".lay-free"];

      check(
        "좌표를 바꾸면 그 자리로 간다(x=0.25)",
        near(
          moved[".lay-f-tl"].left,
          movedBox.left + 0.25 * (movedBox.width - moved[".lay-f-tl"].width),
          2
        ),
        `${moved[".lay-f-tl"].left} vs ${movedBox.left + 0.25 * (movedBox.width - moved[".lay-f-tl"].width)}`
      );

      await page.evaluate(() => window.__layoutHarness.reset());

    }


    /* =====================================================
       SIDEBAR
    ====================================================== */

    if (wants("sidebar")) {

      section("sidebar");

      const r = await rects(page, [
        ".lay-side-left", ".lay-sl-menu", ".lay-sl-main",
        ".lay-side-right", ".lay-sr-menu", ".lay-sr-main", ".lay-sr-main2"
      ]);

      check(
        "side=left 면 사이드바가 왼쪽이다",
        r[".lay-sl-menu"].left < r[".lay-sl-main"].left &&
        near(r[".lay-sl-menu"].top, r[".lay-sl-main"].top),
        JSON.stringify(r[".lay-sl-menu"]) + " / " + JSON.stringify(r[".lay-sl-main"])
      );

      check(
        "사이드바 폭이 지정한 값 그대로(180px)",
        near(r[".lay-sl-menu"].width, 180),
        String(r[".lay-sl-menu"].width)
      );

      check(
        "사이드바와 본문 사이가 gap 그대로(20px)",
        near(r[".lay-sl-main"].left - r[".lay-sl-menu"].right, 20),
        String(r[".lay-sl-main"].left - r[".lay-sl-menu"].right)
      );

      check(
        "본문이 남은 폭을 전부 쓴다",
        near(
          r[".lay-sl-main"].width,
          r[".lay-side-left"].width - 180 - 20
        ),
        String(r[".lay-sl-main"].width)
      );

      check(
        "side=right 면 사이드바가 오른쪽이다",
        r[".lay-sr-menu"].left > r[".lay-sr-main"].left &&
        near(r[".lay-sr-menu"].right, r[".lay-side-right"].right),
        JSON.stringify(r[".lay-sr-menu"])
      );

      check(
        "본문 자식이 여럿이면 본문 열에 차곡차곡 쌓인다",
        near(r[".lay-sr-main"].left, r[".lay-sr-main2"].left) &&
        r[".lay-sr-main2"].top >= r[".lay-sr-main"].bottom - 0.5
      );

      /* 그때 사이드바는 **첫 줄에만** 놓인다 — 계약 그대로다
         (skin/skin-layout.css SIDEBAR 주석: 명시 행이 없으면
         grid-row: 1/-1 이 1행을 뜻한다). 늘어나기를 바라면 본문을
         슬롯 하나로 묶으라고 감사가 알려 준다. */
      check(
        "본문이 여럿이면 사이드바는 첫 줄에 놓인다(계약 그대로)",
        near(r[".lay-sr-menu"].top, r[".lay-sr-main"].top) &&
        r[".lay-sr-menu"].bottom < r[".lay-sr-main2"].bottom,
        `menu=${JSON.stringify(r[".lay-sr-menu"])} main2=${JSON.stringify(r[".lay-sr-main2"])}`
      );

    }


    /* =====================================================
       PANEL · NESTING
    ====================================================== */

    if (wants("panel") || wants("nest")) {

      section("panel / nest");

      const r = await rects(page, [
        ".lay-page", ".lay-nest", ".lay-nest-side", ".lay-nest-main",
        ".lay-ns1", ".lay-ns2", ".lay-nm1", ".lay-nm2", ".lay-nm3",
        ".lay-nest2-free", ".lay-nest2-stack", ".lay-n2a", ".lay-n2b"
      ]);

      check(
        "panel 에 최대 폭을 주면 지켜진다(720px)",
        near(r[".lay-page"].width, 720),
        String(r[".lay-page"].width)
      );

      check(
        "panel 자체는 배치하지 않는다(자식이 블록 흐름 그대로)",
        r[".lay-nest"].width >= r[".lay-nest-side"].width
      );

      check(
        "중첩: panel > sidebar 의 사이드바가 왼쪽 120px",
        r[".lay-nest-side"].left < r[".lay-nest-main"].left &&
        near(r[".lay-nest-side"].width, 120),
        String(r[".lay-nest-side"].width)
      );

      check(
        "중첩: 그 사이드바 안쪽이 세로 stack 으로 그려진다",
        r[".lay-ns1"].bottom <= r[".lay-ns2"].top + 0.5 &&
        near(r[".lay-ns2"].top - r[".lay-ns1"].bottom, 6),
        String(r[".lay-ns2"].top - r[".lay-ns1"].bottom)
      );

      check(
        "중첩: 본문 안쪽이 3열 격자로 그려진다",
        near(r[".lay-nm1"].top, r[".lay-nm2"].top) &&
        near(r[".lay-nm2"].top, r[".lay-nm3"].top) &&
        near(r[".lay-nm2"].left - r[".lay-nm1"].right, 6)
      );

      check(
        "중첩: panel > free > stack — 자유 좌표와 안쪽 가로 배치가 함께 성립",
        near(r[".lay-nest2-stack"].right, r[".lay-nest2-free"].right) &&
        near(r[".lay-n2a"].top, r[".lay-n2b"].top) &&
        near(r[".lay-n2b"].left - r[".lay-n2a"].right, 4),
        `stack=${JSON.stringify(r[".lay-nest2-stack"])} free=${JSON.stringify(r[".lay-nest2-free"])}`
      );

    }


    /* =====================================================
       REPEAT — 반복 clone 도 자기 자리 값을 받는가
    ====================================================== */

    if (wants("repeat")) {

      section("repeat");

      const repeated =
        await page.evaluate(() => {

          const items =
            Array.from(document.querySelectorAll(".lay-rep"));

          return {
            count: items.length,
            titles: items.map((el) => el.textContent.trim()),
            columns: items.map((el) => getComputedStyle(el).gridColumnStart + "/" + getComputedStyle(el).gridColumnEnd),
            widths: items.map((el) => Math.round(el.getBoundingClientRect().width)),
            gridWidth: Math.round(document.querySelector(".lay-repeat-grid").getBoundingClientRect().width)
          };

        });

      check(
        "반복이 세 항목으로 펴졌다",
        repeated.count === 3 && repeated.titles.join(",") === "첫 글,둘째 글,셋째 글",
        JSON.stringify(repeated.titles)
      );

      check(
        "★ 반복으로 생긴 clone 도 자기 칸 값을 받는다(span=2 -> 한 줄 전체)",
        repeated.widths.every((width) => Math.abs(width - repeated.gridWidth) <= 2),
        JSON.stringify(repeated)
      );

    }


    /* =====================================================
       MOBILE — 390px
    ====================================================== */

    if (wants("mobile")) {

      section("mobile");

      await page.setViewportSize({ width: 390, height: 780 });

      const r = await rects(page, [
        ".lay-grid", ".lay-g1", ".lay-g2", ".lay-g3", ".lay-g4",
        ".lay-grid-min", ".lay-m1",
        ".lay-side-left", ".lay-sl-menu", ".lay-sl-main",
        ".lay-side-hide", ".lay-sh-menu", ".lay-sh-main",
        ".lay-free", ".lay-f-br"
      ]);

      check(
        "격자가 모바일 열 수로 줄어든다(4 -> 2)",
        near(r[".lay-g2"].width, (r[".lay-grid"].width - 10) / 2, 2),
        `${r[".lay-g2"].width} vs ${(r[".lay-grid"].width - 10) / 2}`
      );

      check(
        "★ span 이 남은 열 수보다 크면 한 줄을 통째로 쓴다(넘치지 않는다)",
        near(r[".lay-g1"].width, r[".lay-grid"].width, 2),
        `${r[".lay-g1"].width} vs ${r[".lay-grid"].width}`
      );

      check(
        "min 격자는 좁은 폭에서 한 열이 된다(최소 폭보다 화면이 좁을 때 넘치지 않는다)",
        r[".lay-m1"].width <= r[".lay-grid-min"].width + 1,
        String(r[".lay-m1"].width)
      );

      check(
        "★ 사이드바가 접히고 **본문이 위**다",
        r[".lay-sl-main"].top < r[".lay-sl-menu"].top &&
        near(r[".lay-sl-menu"].left, r[".lay-sl-main"].left),
        `main=${JSON.stringify(r[".lay-sl-main"])} menu=${JSON.stringify(r[".lay-sl-menu"])}`
      );

      check(
        "접힌 사이드바는 화면 폭을 넘지 않는다",
        r[".lay-sl-menu"].width <= r[".lay-side-left"].width + 1,
        String(r[".lay-sl-menu"].width)
      );

      check(
        "mobile=hide 면 좁은 화면에서 사이드바가 사라진다",
        r[".lay-sh-menu"] === null || r[".lay-sh-menu"].width === 0,
        JSON.stringify(r[".lay-sh-menu"])
      );

      check(
        "자유 배치 항목은 여전히 안쪽에 있다",
        r[".lay-f-br"].right <= r[".lay-free"].right + 1
      );

      const overflow =
        await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          widest: Array.from(document.querySelectorAll("#layoutMount *"))
            .map((el) => Math.round(el.getBoundingClientRect().right))
            .reduce((a, b) => Math.max(a, b), 0)
        }));

      check(
        "★ 390px 에서 가로 넘침 0",
        overflow.scrollWidth <= overflow.clientWidth + 1 &&
        overflow.widest <= overflow.clientWidth + 1,
        JSON.stringify(overflow)
      );

      await page.setViewportSize({ width: 1100, height: 900 });

    }


    /* =====================================================
       SAVE — 저장 경계를 지나도 배치가 살아 있는가
    ====================================================== */

    if (wants("save")) {

      section("save");

      const sanitized =
        await page.evaluate(() => window.__layoutHarness.sanitized);

      check(
        "배치 속성이 sanitize 를 살아서 지난다",
        sanitized.indexOf('data-imory-layout="grid"') !== -1 &&
        sanitized.indexOf('data-imory-layout-columns="4"') !== -1 &&
        sanitized.indexOf('data-imory-item-span="2"') !== -1 &&
        sanitized.indexOf('data-imory-item-x="1"') !== -1 &&
        sanitized.indexOf('data-imory-slot="sidebar"') !== -1
      );

      const dropped =
        await page.evaluate(() =>
          sanitizeSkinHTML(
            '<div data-imory-layout="masonry" data-imory-layout-columns="99" ' +
            'data-imory-layout-gap="8px" data-imory-item-x="2" ' +
            'data-imory-layout-hint="drop" data-imory-slot="aside">x</div>'
          )
        );

      check(
        "★ 범위 밖 · 모르는 값은 저장 경계에서 버려진다",
        dropped.indexOf("masonry") === -1 &&
        dropped.indexOf("columns") === -1 &&
        dropped.indexOf("gap") === -1 &&
        dropped.indexOf("item-x") === -1 &&
        dropped.indexOf("hint") === -1 &&
        dropped.indexOf("aside") === -1 &&
        dropped.indexOf("x</div>") !== -1,
        dropped
      );

      const kept =
        await page.evaluate(() =>
          sanitizeSkinHTML(
            '<div data-imory-layout="stack" data-imory-layout-gap="0" ' +
            'data-imory-item-x=".5" data-imory-layout-collapse="720">y</div>'
          )
        );

      check(
        "경계값(0 · .5 · 계단 위의 720)은 그대로 남는다",
        kept.indexOf('data-imory-layout-gap="0"') !== -1 &&
        kept.indexOf('data-imory-item-x=".5"') !== -1 &&
        kept.indexOf('data-imory-layout-collapse="720"') !== -1,
        kept
      );

    }


    /* =====================================================
       LEGACY — 배치를 쓰지 않는 스킨은 한 글자도 달라지지 않는다
    ====================================================== */

    if (wants("legacy")) {

      section("legacy");

      const legacy =
        await page.evaluate(() => {

          const mount = document.getElementById("legacyMount");

          return {
            html: mount.innerHTML,
            styled: Array.from(mount.querySelectorAll("*"))
              .filter((el) => el.tagName !== "STYLE" && el.hasAttribute("style"))
              .map((el) => el.className),
            display: getComputedStyle(mount.querySelector(".leg-list")).display,
            repeated: mount.querySelectorAll(".leg-rep").length
          };

        });

      check(
        "★ 배치 속성이 없으면 style 속성조차 생기지 않는다",
        legacy.styled.length === 0,
        JSON.stringify(legacy.styled)
      );

      check(
        "배치 속성이 없는 컨테이너는 블록 그대로다",
        legacy.display === "block",
        legacy.display
      );

      check(
        "기존 기능(반복/바인딩)은 그대로",
        legacy.repeated === 3 && legacy.html.indexOf("첫 글") !== -1
      );

    }


    section("console");

    const realErrors =
      consoleErrors.filter((text) => text.indexOf("favicon") === -1);

    check(
      "콘솔 오류 없음",
      realErrors.length === 0,
      realErrors.join("\n        ")
    );

  } finally {

    await browser.close();
    server.close();

  }

  console.log(
    `\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed` +
    (skipped ? `, ${skipped} skipped` : "") + "\n"
  );

  process.exit(failed === 0 ? 0 : 1);

}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
