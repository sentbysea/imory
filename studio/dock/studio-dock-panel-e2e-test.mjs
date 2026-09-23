/* =========================================================
   BOTTOM-DOCK-1 — Skin Studio 의 dock 설정 패널 E2E

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md §12

   studio/studio-lifecycle-scenario.html?scenario=y (production 과
   같은 스크립트 구성 + in-memory supabase mock)를 실제 URL 로 띄워
   studio/dock/dock-panel.js · studio-preview.js ·
   skin/skin-bottom-dock*.js 를 저장소의 실제 파일 그대로 구동한다.

   검사 범위
     open      dock 이 없는 스킨에서 버튼 → 기본 구성이 채워진다
     apply     적용 → fixed · collapsed 로 working draft 에 · Preview 는 열기 버튼만,
               누르면 펼쳐지고 아이콘이 실제 그림으로 보인다
     visual    표시 방식 넷 · 아이콘 고르기(토큰 안 보임) · placeholder 는 값이 아니다 ·
               방식별 안내 문구 · 입력한 값만 저장된다
     validate  빈 항목 추가 → 적용 전에 그 항목 아래 안내(내부 경로 없음) · blur 안내
     items     추가 · 삭제 · 순서(↑↓) · 동작 종류에 따라 칸이 바뀐다
     legacy    옛 asset/svg/스킨 고유 아이콘/패널/전환이 보존된다
     cancel    ★ 취소는 정말로 아무 일도 없다(draft 불변)
     remove    Dock 사용 안 함(설정 유지) · Dock 지우기(설정 키가 사라진다)
     click     ★ 펼친 Preview dock 의 항목을 누르면 설정 패널이 열린다
     export    Export → Import 왕복에 bottomDock 이 그대로 산다
     mobile    390px 에서 가로 넘침 0

   실행:
     node studio/dock/studio-dock-panel-e2e-test.mjs
     node studio/dock/studio-dock-panel-e2e-test.mjs --only=items
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PORT = 8963;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=y`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const shouldRun = (name) => !ONLY || ONLY === name;

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const section = (name) => {
  if (!shouldRun(name)) return false;
  console.log(`\n[${name}]`);
  return true;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));


/* =========================================================
   서버 · playwright
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

  const toParts = v => v.split(".").map(Number);
  found.sort((a, b) => {
    const [ax, ay, az] = toParts(a.version);
    const [bx, by, bz] = toParts(b.version);
    return (bx - ax) || (by - ay) || (bz - az);
  });

  for (const { entry } of found) {
    let mod;
    try { mod = createRequire(entry)("playwright"); } catch { continue; }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch { /* 다음 후보 */ }
  }

  throw new Error(`playwright ${browserName}을(를) 실행할 수 없습니다.`);
}


/* =========================================================
   페이지 도우미
========================================================== */

const consoleErrors = [];

/* 이미지 라이브러리 mock 이 원래 남기는 오류(다른 Studio e2e 와 동일) */
const PRE_EXISTING_CONSOLE_ERROR = /image library probe failed/;

/* scenario y fixture 의 가짜 이미지 주소(example.com) — WebKit 만 콘솔에 404 를 찍는다 */
const FIXTURE_IMAGE_404 = /@ https:\/\/example\.com\//;

async function openStudio(context) {

  const page = await context.newPage();

  page.on("console", msg => {
    if (msg.type() !== "error") return;
    if (PRE_EXISTING_CONSOLE_ERROR.test(msg.text())) return;
    const where = msg.location && msg.location() && msg.location().url;
    const line = where ? `${msg.text()} @ ${where}` : msg.text();
    if (FIXTURE_IMAGE_404.test(line)) return;
    consoleErrors.push(line);
  });

  page.on("pageerror", err => consoleErrors.push(err.message));

  await page.goto(SCENARIO_URL, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  await page.waitForSelector("#studioPreviewFrame");
  await sleep(700);

  return page;

}

const workingPackage = (page) =>
  page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }).skinPackage);

async function openDockPanel(page) {
  await page.evaluate(() => window.showStudioLeftPanelMode("dock"));
  await page.waitForSelector(".dock-panel-overlay--open", { timeout: 5000 });
}

async function applyDockPanel(page) {
  await page.click(".dock-panel-button--primary");
  await sleep(600);
}

async function panelMessage(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".dock-panel-message");
    return {
      text: el ? el.textContent.trim() : "",
      isError: !!(el && el.classList.contains("dock-panel-message--error"))
    };
  });
}

/* STUDIO-SHELL-1 — 설정 패널은 Studio 왼쪽 패널 안에 있다. 여닫기
   표식(--open)만 보면 패널이 다른 내용을 보여 주는 동안 숨은 채로
   "열렸다"가 된다 — 실제로 화면에 보이는지까지 본다. */
const panelIsOpen = (page) =>
  page.evaluate(() => {
    const el = document.querySelector(".dock-panel-overlay--open");
    if (!el || el.getClientRects().length === 0) return false;
    const panel = el.closest("#studioLeftPanel");
    return !panel || window.getComputedStyle(panel).visibility !== "hidden";
  });

/*
  scope — "trigger" 이면 열기 버튼 구역, 숫자면 그 번째 항목 카드.
  그 안에서 라벨이 labelText 인 줄의 컨트롤을 다룬다.
*/
const SCOPE_JS = `
  window.__dockScope = (scope) => scope === "trigger"
    ? document.querySelector(".dock-panel-trigger")
    : document.querySelectorAll(".dock-panel-item")[scope];
  window.__dockRow = (scope, label) => {
    const host = window.__dockScope(scope);
    if (!host) return null;
    return Array.from(host.querySelectorAll(".dock-panel-row"))
      .find(r => r.querySelector(".dock-panel-label")?.textContent === label) || null;
  };
`;

async function installScopeHelpers(page) {
  await page.evaluate(SCOPE_JS);
}

async function setSelect(page, scope, label, value) {
  await installScopeHelpers(page);
  await page.evaluate(({ scope, label, value }) => {
    const row = window.__dockRow(scope, label);
    const select = row && row.querySelector("select");
    if (!select) throw new Error(`"${label}" select 를 찾지 못했다(${scope})`);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { scope, label, value });
  await sleep(120);
}

/* 사람이 치듯 — 칸을 눌러 글자를 친다 */
async function typeInto(page, scope, label, text) {
  await installScopeHelpers(page);
  const handle = await page.evaluateHandle(({ scope, label }) => {
    const row = window.__dockRow(scope, label);
    return row && row.querySelector("input");
  }, { scope, label });
  const input = handle.asElement();
  if (!input) throw new Error(`"${label}" 입력 칸을 찾지 못했다(${scope})`);
  await input.click();
  await input.fill("");
  await input.type(text);
  await sleep(80);
}

async function blurActive(page) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await sleep(80);
}

async function pickIcon(page, scope, name) {
  await installScopeHelpers(page);
  await page.evaluate(({ scope, name }) => {
    const host = window.__dockScope(scope);
    const button = Array.from(host.querySelectorAll(".dock-panel-icon"))
      .find(b => b.getAttribute("aria-label") === name);
    if (!button) throw new Error(`아이콘 "${name}" 을 찾지 못했다`);
    button.click();
  }, { scope, name });
  await sleep(120);
}

async function readScope(page, scope) {
  await installScopeHelpers(page);
  return page.evaluate((scope) => {
    const host = window.__dockScope(scope);
    if (!host) return null;
    const labels = Array.from(host.querySelectorAll(".dock-panel-label")).map(el => el.textContent);
    const valueRow = window.__dockRow(scope, "표시");
    const input = valueRow ? valueRow.querySelector("input") : null;
    const error = host.querySelector(".dock-panel-error");
    const typeRow = window.__dockRow(scope, "표시 방식");
    return {
      labels,
      typeOptions: typeRow ? Array.from(typeRow.querySelectorAll("option")).map(o => o.textContent) : [],
      typeValue: typeRow ? typeRow.querySelector("select").value : null,
      hasInput: !!input,
      inputValue: input ? input.value : null,
      placeholder: input ? input.placeholder : null,
      hasPicker: !!(valueRow && valueRow.querySelector(".dock-panel-icons")),
      pickerText: valueRow && valueRow.querySelector(".dock-panel-icons")
        ? valueRow.querySelector(".dock-panel-icons").textContent.trim()
        : null,
      selectedIcon: (() => {
        const b = valueRow && valueRow.querySelector('.dock-panel-icon[aria-checked="true"]');
        return b ? b.getAttribute("aria-label") : null;
      })(),
      error: error && !error.hidden ? error.textContent.trim() : "",
      text: host.textContent
    };
  }, scope);
}

/* Preview iframe 안의 dock 상태 */
async function readPreviewDock(page) {
  const frame = page.frames().find(f => f.url().includes("preview-frame.html"));
  if (!frame) return { count: 0 };
  return frame.evaluate(() => {
    const roots = Array.from(document.querySelectorAll("[data-imory-dock-position]"));
    if (roots.length !== 1) return { count: roots.length };
    const root = roots[0];
    const itemsBox = root.querySelector('[data-imory-dock="items"]');
    const trigger = root.querySelector('[data-imory-dock="trigger"]');
    const icons = Array.from(root.querySelectorAll("[data-imory-dock-icon]"));
    return {
      count: 1,
      position: root.getAttribute("data-imory-dock-position"),
      state: root.getAttribute("data-imory-dock-state"),
      transition: root.getAttribute("data-imory-dock-transition"),
      ids: Array.from(root.querySelectorAll("[data-imory-dock-item]"))
        .map(el => el.getAttribute("data-imory-dock-item")),
      itemsHidden: itemsBox ? itemsBox.hidden : null,
      triggerVisible: !!(trigger && trigger.getBoundingClientRect().width > 0),
      triggerIcon: trigger && trigger.querySelector("[data-imory-dock-icon]")
        ? trigger.querySelector("[data-imory-dock-icon]").getAttribute("data-imory-dock-icon")
        : null,
      drawnIcons: icons.filter(el => {
        const cs = getComputedStyle(el);
        const mask = cs.maskImage || cs.webkitMaskImage || "";
        return mask.startsWith("url(") && el.getBoundingClientRect().width > 0;
      }).map(el => el.getAttribute("data-imory-dock-icon"))
    };
  });
}

async function clickPreviewTrigger(page) {
  const frame = page.frames().find(f => f.url().includes("preview-frame.html"));
  await frame.evaluate(() => document.querySelector('[data-imory-dock="trigger"]').click());
  await sleep(450);
}

const itemCount = (page) =>
  page.evaluate(() => document.querySelectorAll(".dock-panel-item").length);

/* 사용자에게 보이면 안 되는 개발자용 낱말. "전환"은 기능 이름(라이트/다크 전환)에
   쓰이므로 여기 두지 않는다 — 칸 이름은 open 절이 따로 본다. */
const DEVELOPER_WORDS =
  /position|defaultState|transition|easing|direction|token|토큰|SVG|이미지 슬롯|스킨 CSS|templates\.dock|data-kind|표식|처음 상태|효과|속도|움직임|bottomDock|\bitems\[|visual\.value/;


/* =========================================================
   실행
========================================================== */

async function run() {

  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();

  try {

    /* --------------------------------------------------- */

    if (section("open")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      check(
        "working draft 가 있으면 Dock 버튼이 눌린다",
        await page.evaluate(() => !document.getElementById("studioLayersButton").disabled)
      );

      check(
        "이 스킨에는 아직 dock 이 없다(전제)",
        (await workingPackage(page)).bottomDock === undefined
      );

      await openDockPanel(page);

      check("패널이 열린다", await panelIsOpen(page));

      check(
        "★ dock 이 없으면 기본 구성이 채워지고 그 사실을 알린다",
        (await panelMessage(page)).text.includes("기본 구성")
      );

      check("기본 항목이 3개다(모바일 권장 범위)", (await itemCount(page)) === 3, String(await itemCount(page)));

      check(
        "패널을 여는 것만으로는 draft 가 바뀌지 않는다",
        (await workingPackage(page)).bottomDock === undefined
      );

      const allLabels = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".dock-panel-label")).map(el => el.textContent)
      );

      check(
        "생김새를 고치는 칸은 없다(색/크기/글꼴)",
        !allLabels.some(t => /색|크기|글꼴|폰트/.test(t))
      );

      check(
        "★ 자리 · 처음 상태 · 전환 · 속도 · 움직임 · 방향 칸이 없다",
        !allLabels.some(t => /자리|처음 상태|접기|전환|속도|움직임|방향/.test(t)),
        allLabels.join(",")
      );

      const panelText = await page.evaluate(() => document.querySelector(".dock-panel-modal").textContent);

      check(
        "★ 패널 어디에도 개발자용 낱말이 없다(position·token·SVG·transition·표식 …)",
        !DEVELOPER_WORDS.test(panelText),
        (panelText.match(DEVELOPER_WORDS) || [""])[0]
      );

      check(
        "★ '독 열기 버튼' 구역이 있고 표시 방식 · 표시 두 칸이다",
        await page.evaluate(() =>
          Array.from(document.querySelectorAll(".dock-panel-section")).some(el => el.textContent === "독 열기 버튼")
        ) &&
        JSON.stringify((await readScope(page, "trigger")).labels) === JSON.stringify(["표시 방식", "표시"]),
        JSON.stringify((await readScope(page, "trigger")).labels)
      );

      const item = await readScope(page, 0);

      check(
        "★ 항목 카드는 라벨 · 표시 방식 · 표시 · 동작 · 이동할 곳 · 보이는 사람",
        JSON.stringify(item.labels) ===
          JSON.stringify(["라벨", "표시 방식", "표시", "동작", "이동할 곳", "보이는 사람"]),
        JSON.stringify(item.labels)
      );

      check(
        "★ 표시 방식은 아이콘 · 이모지 · 글자 · 이미지 주소 넷뿐",
        JSON.stringify(item.typeOptions) === JSON.stringify(["아이콘", "이모지", "글자", "이미지 주소"]),
        JSON.stringify(item.typeOptions)
      );

      check(
        "순서 변경(↑↓)과 삭제가 카드마다 있다",
        await page.evaluate(() => {
          const card = document.querySelectorAll(".dock-panel-item")[0];
          return !!card.querySelector('[aria-label="위로"]') &&
            !!card.querySelector('[aria-label="아래로"]') &&
            !!card.querySelector(".dock-panel-remove");
        })
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("apply")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      check("적용하면 패널이 닫힌다", !(await panelIsOpen(page)));

      const pkg = await workingPackage(page);

      check(
        "★ 자리는 언제나 화면 아래 고정 · 접힌 채로 시작 · 접기 켜짐",
        !!pkg.bottomDock &&
        pkg.bottomDock.items.length === 3 &&
        pkg.bottomDock.position === "fixed" &&
        pkg.bottomDock.defaultState === "collapsed" &&
        pkg.bottomDock.collapsible === true,
        JSON.stringify(pkg.bottomDock && {
          position: pkg.bottomDock.position,
          defaultState: pkg.bottomDock.defaultState,
          collapsible: pkg.bottomDock.collapsible
        })
      );

      check(
        "펼치고 접는 움직임은 공용 전환 primitive 의 값이다(사용자에게는 안 보인다)",
        pkg.bottomDock.transition && pkg.bottomDock.transition.type === "fade-slide",
        JSON.stringify(pkg.bottomDock.transition)
      );

      check(
        "dirty 가 되어 Save 가 활성화된다",
        await page.evaluate(() => !document.getElementById("studioSaveButton").disabled)
      );

      const dock = await readPreviewDock(page);

      check("★ Preview 에 dock 이 하나 그려진다", dock.count === 1, JSON.stringify(dock));

      check(
        "★ Preview 에서도 화면 아래 고정 · 접힌 채 · 열기 버튼만 보인다",
        dock.position === "fixed" && dock.state === "collapsed" &&
        dock.itemsHidden === true && dock.triggerVisible,
        JSON.stringify({ position: dock.position, state: dock.state, hidden: dock.itemsHidden })
      );

      check(
        "★ 열기 버튼의 아이콘을 아이모리가 그린다(기본 template)",
        dock.triggerIcon === "menu" && dock.drawnIcons.includes("menu"),
        JSON.stringify(dock.drawnIcons)
      );

      /* 열기 버튼은 Preview 에서도 실제로 펼친다 */
      await clickPreviewTrigger(page);

      const opened = await readPreviewDock(page);

      check(
        "★ Preview 의 열기 버튼을 누르면 펼쳐진다(설정 패널이 아니라)",
        opened.state === "expanded" && opened.itemsHidden === false && !(await panelIsOpen(page)),
        JSON.stringify({ state: opened.state, panel: await panelIsOpen(page) })
      );

      check(
        "항목이 설정 그대로다",
        (opened.ids || []).join(",") === "home,highlights,top",
        (opened.ids || []).join(",")
      );

      check(
        "★ 항목 아이콘(홈 · 인용 · 맨 위로)이 실제 그림으로 보인다",
        ["home", "quote", "top"].every(t => opened.drawnIcons.includes(t)),
        JSON.stringify(opened.drawnIcons)
      );

      await clickPreviewTrigger(page);

      check(
        "다시 누르면 접힌다",
        (await readPreviewDock(page)).state === "collapsed"
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("visual")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);

      /* 아이콘 — 입력 칸이 아니라 그림 고르기 */
      const iconScope = await readScope(page, 0);

      check("★ 아이콘 방식은 텍스트 칸이 아니라 고르기다", iconScope.hasPicker && !iconScope.hasInput);

      check(
        "★ 고르기에 내부 이름(home/quote …)이 글자로 보이지 않는다",
        iconScope.pickerText === "",
        JSON.stringify(iconScope.pickerText)
      );

      check("지금 값이 선택된 채로 보인다(홈)", iconScope.selectedIcon === "홈", iconScope.selectedIcon);

      check(
        "요청된 아이콘이 전부 고를 수 있다",
        await page.evaluate(() => {
          const names = Array.from(document.querySelectorAll(".dock-panel-item")[0]
            .querySelectorAll(".dock-panel-icon")).map(b => b.getAttribute("aria-label"));
          return ["홈", "폴더", "하트", "별", "사진", "책", "연필", "프로필", "메뉴"].every(n => names.includes(n));
        })
      );

      check(
        "고르기의 그림이 실제로 그려진다(마스크 그림 · 크기 있음)",
        await page.evaluate(() => {
          const glyphs = Array.from(document.querySelectorAll(".dock-panel-item")[0]
            .querySelectorAll(".dock-panel-icon-glyph"));
          return glyphs.length >= 9 && glyphs.every(g => {
            const cs = getComputedStyle(g);
            return (cs.maskImage || cs.webkitMaskImage || "").startsWith("url(") &&
              g.getBoundingClientRect().width > 8;
          });
        })
      );

      await pickIcon(page, 0, "하트");

      check("하트를 고르면 하트가 선택된다", (await readScope(page, 0)).selectedIcon === "하트");

      /* 이모지 — placeholder 는 값이 아니다 */
      await setSelect(page, 0, "표시 방식", "emoji");

      const emoji = await readScope(page, 0);

      check("★ 방식을 바꾸면 입력 칸의 **실제 값**은 비어 있다", emoji.hasInput && emoji.inputValue === "", JSON.stringify(emoji.inputValue));
      check("★ 예시는 placeholder 로만 보인다(예: ♡)", emoji.placeholder === "예: ♡", emoji.placeholder);

      const colors = await page.evaluate(() => {
        const card = document.querySelectorAll(".dock-panel-item")[0];
        const input = card.querySelector(".dock-panel-row input.dock-panel-input:not([placeholder^='예: 홈'])")
          || card.querySelectorAll("input.dock-panel-input")[1];
        const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        const ph = getComputedStyle(input, "::placeholder");
        const [pr, pg, pb, pa = 1] = parse(ph.color);
        const [ir, ig, ib] = parse(getComputedStyle(input).color);
        const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return {
          placeholderLum: lum(pr, pg, pb) * (Number(ph.opacity) || 1) + 255 * (1 - (Number(ph.opacity) || 1) * pa),
          inputLum: lum(ir, ig, ib),
          italic: ph.fontStyle
        };
      });

      check(
        "★ placeholder 는 실제 입력값보다 옅다",
        colors.placeholderLum > colors.inputLum + 40,
        JSON.stringify(colors)
      );

      check(
        "★ 방식을 바꾸면 그 방식에 맞는 짧은 안내가 바로 보인다",
        emoji.error === "표시할 이모지를 입력해 주세요.",
        emoji.error
      );

      /* 아무것도 치지 않은 채 적용 → 예시 문자가 저장되지 않는다 */
      await page.click(".dock-panel-button--primary");
      await sleep(300);

      check("비어 있으면 적용되지 않는다", await panelIsOpen(page));
      check(
        "★ 그때 draft 에 예시(♡)도 빈 값도 들어가지 않는다",
        (await workingPackage(page)).bottomDock === undefined
      );

      await typeInto(page, 0, "표시", "🌙");

      check("값을 치면 안내가 사라진다", (await readScope(page, 0)).error === "");

      /* 글자 · 이미지 주소 */
      await setSelect(page, 1, "표시 방식", "text");
      const text = await readScope(page, 1);
      check("글자 — 빈 값 · placeholder 예: HOME", text.inputValue === "" && text.placeholder === "예: HOME", JSON.stringify(text));
      check("글자 — 안내 문구", text.error === "표시할 글자를 입력해 주세요.", text.error);
      await typeInto(page, 1, "표시", "QUOTES");

      await setSelect(page, 2, "표시 방식", "image");
      const image = await readScope(page, 2);
      check("이미지 주소 — 빈 값 · placeholder https://...", image.inputValue === "" && image.placeholder === "https://...", JSON.stringify(image));
      check("이미지 주소 — 안내 문구", image.error === "이미지 주소를 입력해 주세요.", image.error);

      await typeInto(page, 2, "표시", "http://example.com/a.png");
      check(
        "https 가 아니면 그 이유를 짧게 말한다",
        (await readScope(page, 2)).error === "https:// 로 시작하는 이미지 주소를 입력해 주세요.",
        (await readScope(page, 2)).error
      );
      await typeInto(page, 2, "표시", "https://example.com/a.png");

      /* 열기 버튼 — 글자로 */
      await setSelect(page, "trigger", "표시 방식", "text");
      const trig = await readScope(page, "trigger");
      check("열기 버튼도 같은 규칙(빈 값 · placeholder · 안내)", trig.inputValue === "" && trig.placeholder === "예: HOME" && trig.error === "표시할 글자를 입력해 주세요.", JSON.stringify(trig));
      await typeInto(page, "trigger", "표시", "MENU");

      await applyDockPanel(page);

      check("다 채우면 적용된다", !(await panelIsOpen(page)));

      const pkg = await workingPackage(page);
      const visuals = pkg.bottomDock.items.map(i => i.visual);

      check(
        "★ 입력한 값만 그대로 저장된다",
        JSON.stringify(visuals) === JSON.stringify([
          { type: "emoji", value: "🌙" },
          { type: "text", value: "QUOTES" },
          { type: "image", value: "https://example.com/a.png" }
        ]) &&
        pkg.bottomDock.trigger.type === "text" && pkg.bottomDock.trigger.value === "MENU",
        JSON.stringify({ visuals, trigger: pkg.bottomDock.trigger })
      );

      check(
        "★ placeholder 문자열이 어디에도 저장되지 않는다",
        !/예: |https:\/\/\.\.\./.test(JSON.stringify(pkg.bottomDock)),
        JSON.stringify(pkg.bottomDock).slice(0, 200)
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("validate")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);

      /* 빈 항목 추가 — 표시가 미리 채워져 있지 않다 */
      await page.click(".dock-panel-button--add");
      await sleep(150);

      const added = await readScope(page, 3);

      check("★ 빈 항목은 아이콘이 골라져 있지 않다(예시 값 없음)", added.selectedIcon === null, added.selectedIcon);
      check("추가하자마자 빨간 글자를 띄우지는 않는다", added.error === "");

      await page.click(".dock-panel-button--primary");
      await sleep(300);

      const after = await readScope(page, 3);

      check("★ 적용을 누르면 그 항목 바로 아래에 안내가 나온다", after.error === "아이콘을 골라 주세요.", after.error);
      check("적용되지 않는다", await panelIsOpen(page));

      const msg = await panelMessage(page);

      check(
        "★ 내부 경로(bottomDock.items[0]…) 같은 개발자식 문장이 없다",
        !/bottomDock|items\[|visual|value/.test(msg.text + after.text),
        msg.text
      );

      check("다른 항목에는 안내가 붙지 않는다", (await readScope(page, 0)).error === "");

      /* 칸을 비운 채 나가면(blur) 바로 알려 준다 */
      await setSelect(page, 0, "표시 방식", "text");
      await typeInto(page, 0, "표시", "HOME");
      await typeInto(page, 0, "표시", "");
      await blurActive(page);

      check("칸을 비운 채 나가면 곧바로 안내한다", (await readScope(page, 0)).error === "표시할 글자를 입력해 주세요.");

      await typeInto(page, 0, "표시", "HOME");
      await pickIcon(page, 3, "별");

      check("채우면 안내가 사라진다", (await readScope(page, 0)).error === "" && (await readScope(page, 3)).error === "");

      /* 직접 입력 주소 */
      await setSelect(page, 3, "이동할 곳", "path:");
      await typeInto(page, 3, "이동할 곳", "about me");
      await blurActive(page);

      check(
        "블로그 안 주소가 형태에 맞지 않으면 짧게 안내한다",
        /주소/.test((await readScope(page, 3)).error) && !/path:/.test((await readScope(page, 3)).error),
        (await readScope(page, 3)).error
      );

      await typeInto(page, 3, "이동할 곳", "/about");

      await applyDockPanel(page);

      check("모두 채우면 적용된다", !(await panelIsOpen(page)));

      const pkg = await workingPackage(page);
      const last = pkg.bottomDock.items[3];

      check(
        "추가한 항목이 고른 그대로 저장된다",
        last.visual.type === "icon" && last.visual.value === "star" &&
        last.action.type === "navigate" && last.action.target === "path:/about",
        JSON.stringify(last)
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("items")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);

      const before = await itemCount(page);

      await page.click(".dock-panel-button--add");
      await sleep(150);

      check("항목을 추가할 수 있다", (await itemCount(page)) === before + 1);

      /* 마지막 항목 삭제 */
      await page.evaluate(() => {
        const cards = document.querySelectorAll(".dock-panel-item");
        cards[cards.length - 1].querySelector(".dock-panel-remove").click();
      });
      await sleep(150);

      check("항목을 삭제할 수 있다", (await itemCount(page)) === before);

      /* 두 번째 항목을 위로 */
      await page.evaluate(() => {
        document.querySelectorAll(".dock-panel-item")[1]
          .querySelector('.dock-panel-move[aria-label="위로"]').click();
      });
      await sleep(150);

      await applyDockPanel(page);

      const pkg = await workingPackage(page);

      check(
        "★ ↑ 로 바꾼 순서가 그대로 저장된다",
        pkg.bottomDock.items.map(i => i.id).join(",") === "highlights,home,top",
        pkg.bottomDock.items.map(i => i.id).join(",")
      );

      await clickPreviewTrigger(page);

      const dock = await readPreviewDock(page);

      check(
        "Preview 의 그리는 순서도 같다",
        (dock.ids || []).join(",") === "highlights,home,top",
        (dock.ids || []).join(",")
      );

      await openDockPanel(page);

      const actionOptions = await page.evaluate(() => {
        window.__r = Array.from(document.querySelectorAll(".dock-panel-item")[0].querySelectorAll(".dock-panel-row"))
          .find(r => r.querySelector(".dock-panel-label")?.textContent === "동작");
        return Array.from(window.__r.querySelectorAll("option")).map(o => o.textContent);
      });

      check(
        "★ 동작은 화면 이동 · 기능 실행(스킨 마크업이 필요한 '패널 열기'는 없다)",
        JSON.stringify(actionOptions) === JSON.stringify(["화면 이동", "기능 실행"]),
        JSON.stringify(actionOptions)
      );

      await setSelect(page, 0, "동작", "action");

      check(
        "★ '기능 실행'을 고르면 '실행할 기능' 칸이 나오고 '이동할 곳'은 사라진다",
        await (async () => {
          const s = await readScope(page, 0);
          return s.labels.includes("실행할 기능") && !s.labels.includes("이동할 곳");
        })()
      );

      check(
        "★ 카테고리를 고를 수 있다(주인장은 자기 카테고리를 안다)",
        await page.evaluate(() => {
          const card = document.querySelectorAll(".dock-panel-item")[1];
          const rows = Array.from(card.querySelectorAll(".dock-panel-row"));
          const row = rows.find(r => r.querySelector(".dock-panel-label")?.textContent === "이동할 곳");
          if (!row) return false;
          return Array.from(row.querySelectorAll("option"))
            .some(o => o.value.startsWith("category:"));
        })
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("legacy")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      /* Code · AI · 옛 패널이 만든 dock — 이 패널에 없는 값들 */
      const legacy = {
        visible: true,
        position: "static",
        collapsible: true,
        defaultState: "expanded",
        transition: { type: "scale", duration: 600, easing: "ease-in", direction: "down" },
        trigger: { type: "svg", value: "https://example.com/t.svg", label: "열기" },
        items: [
          { id: "slot", label: "logo", audience: "all", visual: { type: "asset", value: "profile" }, action: { type: "navigate", target: "home" } },
          { id: "tape", label: "tape", audience: "all", visual: { type: "icon", value: "cassette" }, action: { type: "open", target: "panel:pair" } }
        ]
      };

      const set = await page.evaluate((dock) => window.setStudioBottomDock(dock), legacy);

      check("옛 모양의 dock 이 draft 에 있다(전제)", set.ok === true, JSON.stringify(set));

      await openDockPanel(page);

      const slot = await readScope(page, 0);
      const tape = await readScope(page, 1);
      const trig = await readScope(page, "trigger");

      check(
        "★ 옛 asset/svg 표시는 '이전 설정 그대로'로 보인다(이미지 슬롯 · SVG 낱말 없음)",
        slot.typeOptions.includes("이전 설정 그대로") && slot.typeValue === "asset" &&
        trig.typeValue === "svg" && !/슬롯|SVG/.test(slot.text + trig.text),
        JSON.stringify(slot.typeOptions)
      );

      check(
        "★ 스킨 고유 아이콘(cassette)은 이름 대신 '이 스킨의 아이콘'으로 선택되어 있다",
        tape.selectedIcon === "이 스킨의 아이콘" && !/cassette/.test(tape.text),
        tape.selectedIcon
      );

      check(
        "옛 '패널 열기' 항목에서는 그 동작이 계속 보인다",
        tape.labels.includes("패널 이름")
      );

      await applyDockPanel(page);

      const pkg = await workingPackage(page);

      check(
        "★ 손대지 않은 옛 표시 값이 그대로 저장된다(asset · svg · cassette · panel)",
        pkg.bottomDock.items[0].visual.type === "asset" &&
        pkg.bottomDock.items[0].visual.value === "profile" &&
        pkg.bottomDock.items[1].visual.value === "cassette" &&
        pkg.bottomDock.items[1].action.target === "panel:pair" &&
        pkg.bottomDock.trigger.type === "svg",
        JSON.stringify(pkg.bottomDock.items)
      );

      check(
        "★ 적용하면 화면 아래 고정 · 접힌 채 시작으로 맞춰진다",
        pkg.bottomDock.position === "fixed" && pkg.bottomDock.defaultState === "collapsed",
        JSON.stringify([pkg.bottomDock.position, pkg.bottomDock.defaultState])
      );

      check(
        "Code/AI 가 정한 움직임(전환)은 지우지 않는다",
        JSON.stringify(pkg.bottomDock.transition) === JSON.stringify(legacy.transition),
        JSON.stringify(pkg.bottomDock.transition)
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("cancel")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      const applied = await workingPackage(page);

      await openDockPanel(page);

      await page.evaluate(() => {
        const cards = document.querySelectorAll(".dock-panel-item");
        cards[0].querySelector(".dock-panel-remove").click();
      });
      await sleep(150);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll(".dock-panel-button"))
          .find(b => b.textContent === "취소").click();
      });
      await sleep(300);

      check("취소하면 패널이 닫힌다", !(await panelIsOpen(page)));

      check(
        "★ 취소는 정말로 아무 일도 없다 — draft 가 그대로다",
        JSON.stringify((await workingPackage(page)).bottomDock) ===
          JSON.stringify(applied.bottomDock)
      );

      await openDockPanel(page);

      check(
        "다시 열면 저장된 상태에서 시작한다",
        (await itemCount(page)) === applied.bottomDock.items.length,
        String(await itemCount(page))
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("remove")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      check("먼저 dock 이 생겼다(전제)", !!(await workingPackage(page)).bottomDock);

      /* 끄기 — 설정은 남고 공개 화면에만 안 나온다 */
      await openDockPanel(page);
      await page.evaluate(() => {
        const row = Array.from(document.querySelectorAll(".dock-panel-settings .dock-panel-row"))
          .find(r => r.querySelector(".dock-panel-label")?.textContent === "Dock");
        const select = row.querySelector("select");
        select.value = "hide";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await sleep(120);
      await applyDockPanel(page);

      const off = await workingPackage(page);

      check(
        "★ Dock 사용 안 함 → 설정은 남고 visible 만 꺼진다",
        !!off.bottomDock && off.bottomDock.visible === false && off.bottomDock.items.length === 3
      );

      check("Preview 에서 사라진다", (await readPreviewDock(page)).count === 0);

      await openDockPanel(page);

      await page.click(".dock-panel-button--quiet");
      await sleep(500);

      const pkg = await workingPackage(page);

      check(
        "★ Dock 지우기 → 설정 키 자체가 사라진다",
        pkg.bottomDock === undefined,
        JSON.stringify(pkg.bottomDock)
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("click")) {

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await applyDockPanel(page);

      check("패널이 닫혀 있다(전제)", !(await panelIsOpen(page)));

      await clickPreviewTrigger(page);

      const frame = page.frames().find(f => f.url().includes("preview-frame.html"));

      await frame.evaluate(() => {
        document.querySelector("[data-imory-dock-item]").click();
      });

      await sleep(400);

      check(
        "★ 펼친 뒤 Preview 의 항목을 누르면 설정 패널이 열린다",
        await panelIsOpen(page)
      );

      check(
        "그 클릭이 Preview 를 다른 화면으로 옮기지 않는다",
        await frame.evaluate(() => !!document.querySelector("[data-imory-dock-position]"))
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("export")) {

      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        acceptDownloads: true
      });
      const page = await openStudio(ctx);

      await openDockPanel(page);
      await setSelect(page, 0, "표시 방식", "emoji");
      await typeInto(page, 0, "표시", "♡");
      await applyDockPanel(page);

      const applied = (await workingPackage(page)).bottomDock;

      const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
      await page.click("#studioExportButton");
      const download = await downloadPromise;
      const text = fs.readFileSync(await download.path(), "utf8");
      const exported = JSON.parse(text);

      check(
        "★ Export 파일에 bottomDock 이 그대로 실린다",
        JSON.stringify(exported.bottomDock) === JSON.stringify(applied),
        JSON.stringify(exported.bottomDock && exported.bottomDock.position)
      );

      /* 같은 파일을 붙여넣기로 다시 Import */
      await page.click("#studioImportButton");
      await page.waitForSelector(".import-editor-overlay:not([hidden])", { timeout: 5000 });

      await page.evaluate((json) => {
        const ta = document.querySelector(".import-editor-textarea");
        ta.value = json;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }, text);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll(".import-editor-button"))
          .find(b => /검증|Validate/i.test(b.textContent))?.click();
      });
      await sleep(600);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll(".import-editor-button"))
          .find(b => /Apply|적용/i.test(b.textContent))?.click();
      });
      await sleep(800);

      const after = (await workingPackage(page)).bottomDock;

      check(
        "★ 다시 Import 해도 같은 설정이다(왕복 손실 없음)",
        JSON.stringify(after) === JSON.stringify(applied),
        JSON.stringify(after)
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (section("mobile")) {

      const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
      const page = await openStudio(ctx);

      await openDockPanel(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );

      check("390px 에서 가로 넘침 없음", overflow <= 0, String(overflow));

      check(
        "패널이 화면 안에 들어온다",
        await page.evaluate(() => {
          const modal = document.querySelector(".dock-panel-modal");
          const r = modal.getBoundingClientRect();
          return r.left >= -1 && r.right <= window.innerWidth + 1;
        })
      );

      check(
        "아이콘 고르기가 줄바꿈되어 카드 안에 들어온다",
        await page.evaluate(() => {
          const card = document.querySelector(".dock-panel-item");
          const c = card.getBoundingClientRect();
          return Array.from(card.querySelectorAll(".dock-panel-icon"))
            .every(b => { const r = b.getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1; });
        })
      );

      check(
        "적용 버튼이 화면 안에 있다",
        await page.evaluate(() => {
          const btn = document.querySelector(".dock-panel-button--primary");
          const r = btn.getBoundingClientRect();
          return r.width > 0 && r.right <= window.innerWidth + 1;
        })
      );

      await ctx.close();
    }


    /* --------------------------------------------------- */

    if (shouldRun("errors") || !ONLY) {
      console.log("\n[errors]");
      check(
        "새로운 console/page 오류가 없다",
        consoleErrors.length === 0,
        consoleErrors.slice(0, 3).join(" | ")
      );
    }

  } finally {
    await browser.close();
    server.close();
  }

}

await run();

console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);

if (failures.length) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
