/* =========================================================
   TRANSITION-1 E2E — 전환 primitive 가 실제로 어떻게 움직이는가

   기준 문서: IMORY_TRANSITION_PRIMITIVE_DESIGN.md

   두 무대에서 잰다.

   A. 렌더 하네스(skin/skin-transition-render-harness.html) — 실제
      renderSkin() 이 그린 요소를 애니메이션 **시작 시점(t=0)** 에
      멈춰 세우고 getBoundingClientRect() / 계산된 opacity 로 잰다.
      "속성이 붙었다"가 아니라 "어디에 어떤 모습으로 있었는가"를 본다.

        [types]    여섯 종류 × 네 방향의 나타날 때 자세 · 끝나면 제자리
                   · free 배치(transform)와 공존
        [showhide] 패널 열기/닫기 · 닫힌 패널/닫히는 중인 패널이 클릭을
                   가로채지 않는다 · 키보드 · 링크 토글이 페이지를 옮기지
                   않는다
        [rapid]    빠른 반복 클릭 — 마지막 요청이 최종 상태 · 방향이
                   바뀔 때 튀지 않는다 · 남는 애니메이션 없음
        [reduced]  prefers-reduced-motion — 재생도 대기도 없다
        [mobile]   390/320px 에서 좌우로 미끄러지는 동안 가로 넘침 0
                   (대조군: clip 을 떼면 실제로 넘친다)
        [sanitize] 저장 경계 — 속도는 자르고, 모양이 틀린 값은 버린다
        [legacy]   전환 속성이 없는 스킨은 한 글자도 바뀌지 않는다

   B. 진짜 index.html(supabase 만 mock) — 예시 스킨
      skin/test-skins/imory-transitions-v1.json

        [routes]   HOME → CATEGORY → POST → 뒤로 → HOME 에서 각 화면의
                   appear 가 실제로 재생되고, HOME 복귀는 다시 재생된다 ·
                   직접 접속
        [dock]     Bottom Dock 접기/펴기가 같은 primitive 를 쓴다 ·
                   빠른 반복 · 사라지는 중인 항목이 클릭을 받지 않는다 ·
                   dock 안 패널(data-imory-panel)
        [routes-reduced] 움직임 줄이기에서 화면·dock 모두 즉시
        [routes-mobile]  390/320px 화면 전환 중 가로 넘침 0

   실행:
     node skin/skin-transition-e2e-test.mjs
     node skin/skin-transition-e2e-test.mjs --browser=webkit
     node skin/skin-transition-e2e-test.mjs --only=rapid
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8966;
const SUPABASE_HOST = "vtwcuvouyipohfonfukj.supabase.co";

const SLUG = "trblog";
const OWNER_ID = "11111111-2222-3333-4444-555555555555";

const HARNESS = `http://localhost:${PORT}/skin/skin-transition-render-harness.html`;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/* =========================================================
   playwright 찾기 (다른 e2e 와 같은 loader)
========================================================== */

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
    } catch { /* 가장 낮게 */ }
    found.push({ entry, version });
  }

  const toParts = v => v.split(".").map(Number);
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
    `시도한 설치:\n  - ${tried.join("\n  - ") || "없음"}`
  );
}


/* =========================================================
   실제 저장소 서빙 (_redirects 의 SPA fallback 포함)
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

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(path.join(ROOT, "index.html")));
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   검사 도구
========================================================== */

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

const section = (name) => {
  if (ONLY && ONLY !== name) return false;
  console.log(`\n[${name}]`);
  return true;
};

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;


/*
  애니메이션 기록기 — 모든 문서에 먼저 심는다.

  CSS appear 는 animationstart 로, 플랫폼의 show/hide/replay 는
  Element.prototype.animate 호출로 남긴다. 240ms 짜리 전환을
  "지금 돌고 있나"로 잡으려 하면 타이밍 경주가 되므로, **시작됐다는
  사실**을 기록해 두고 나중에 읽는다.

  __trFreeze 가 켜져 있으면 시작하는 순간 t=0 에 멈춰 세운다 — 전환
  중의 가로 넘침을 가장 넓게 벌어진 순간에 잰다.
*/
function animationRecorder() {
  /* 두 번 심겨도 한 겹만(WebKit iframe 의 init script 중복) */
  if (window.__animLog) return;
  window.__animLog = [];
  window.__trFreeze = false;

  document.addEventListener("animationstart", (event) => {
    const el = event.target;
    window.__animLog.push({
      kind: "css",
      name: event.animationName,
      cls: typeof el.className === "string" ? el.className : "",
      t: performance.now()
    });
    if (window.__trFreeze) {
      el.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; });
    }
  }, true);

  const original = Element.prototype.animate;
  Element.prototype.animate = function (...a) {
    const anim = original.apply(this, a);
    window.__animLog.push({
      kind: "waapi",
      cls: typeof this.className === "string" ? this.className : "",
      dock: this.getAttribute && this.getAttribute("data-imory-dock"),
      duration: a[1] && a[1].duration,
      t: performance.now()
    });
    return anim;
  };
}


/* =========================================================
   B 무대 — 예시 스킨 + 데이터 + supabase mock
========================================================== */

const EXAMPLE_SKIN =
  JSON.parse(fs.readFileSync(path.join(HERE, "test-skins", "imory-transitions-v1.json"), "utf8"));

const DB = {
  profiles: [
    { user_id: OWNER_ID, slug: SLUG, home_mode: "customize", nickname: "전환", bio: "" }
  ],
  site_settings: [
    { user_id: OWNER_ID, key: "blog_title", value: "TRANSITION BLOG" }
  ],
  categories: [
    { id: 7, public_no: 1, user_id: OWNER_ID, name: "일기", type: "post", sort_order: 1 }
  ],
  post_folders: [],
  posts: Array.from({ length: 12 }, (_, i) => ({
    id: 100 + i,
    public_no: i + 1,
    user_id: OWNER_ID,
    category_id: 7,
    folder_id: null,
    title: `글 ${i + 1}`,
    content_type: "text",
    visibility: "public",
    created_at: `2026-09-${String(i + 1).padStart(2, "0")}T02:00:00Z`,
    updated_at: `2026-09-${String(i + 1).padStart(2, "0")}T02:00:00Z`,
    quote_preset_id: null,
    sort_order: (i + 1) * 100
  })),
  post_contents: Array.from({ length: 12 }, (_, i) => ({
    post_id: 100 + i,
    content: `본문 ${i + 1}`,
    ooc_content: null
  })),
  banners: [],
  post_highlights: [],
  post_gallery_images: [],
  quote_presets: []
};

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function queryTable(table, params) {
  let rows = (DB[table] || []).map(r => ({ ...r }));

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    const m = /^(eq|neq|in|is|not|gt|gte|lt|lte)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(v => v.replace(/^"|"$/g, ""));
      rows = rows.filter(r => list.includes(String(r[key])));
      continue;
    }
    if (op === "is") {
      rows = rows.filter(r => (val === "null" ? r[key] === null || r[key] === undefined : true));
      continue;
    }
    if (op === "not") {
      rows = rows.filter(r => r[key] !== null && r[key] !== undefined);
      continue;
    }
    rows = rows.filter(r => {
      const cur = r[key];
      if (op === "eq") return String(cur) === val;
      if (op === "neq") return String(cur) !== val;
      if (op === "gt") return Number(cur) > Number(val);
      if (op === "gte") return Number(cur) >= Number(val);
      if (op === "lt") return Number(cur) < Number(val);
      return Number(cur) <= Number(val);
    });
  }

  const order = params.get("order");
  if (order) {
    for (const clause of order.split(",").reverse()) {
      const [col, ...rest] = clause.split(".");
      const desc = rest.includes("desc");
      rows.sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (desc ? -1 : 1)));
    }
  }

  const limit = params.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));
  return rows;
}

async function installSupabaseMock(page, skin) {
  await page.route(`https://${SUPABASE_HOST}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "*"
    };

    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (url.pathname.startsWith("/auth/v1")) {
      return route.fulfill({ status: 401, headers, contentType: "application/json", body: JSON.stringify({ message: "no session" }) });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      if (fn === "get_published_skin") {
        const body = JSON.parse(req.postData() || "{}");
        const found = body.p_user_id === OWNER_ID
          ? { skin, schemaVersion: skin.schemaVersion, imageSlotValues: {} }
          : null;
        return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(found) });
      }
      return route.fulfill({ status: 200, headers, contentType: "application/json", body: "null" });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const rows = queryTable(url.pathname.slice("/rest/v1/".length), url.searchParams);
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (single && rows.length === 0) {
        return route.fulfill({ status: 406, headers, contentType: "application/json", body: JSON.stringify({ code: "PGRST116", message: "0 rows" }) });
      }
      return route.fulfill({
        status: 200, headers,
        contentType: single ? "application/vnd.pgrst.object+json" : "application/json",
        body: JSON.stringify(single ? rows[0] : rows)
      });
    }

    return route.fulfill({ status: 404, headers, body: "{}" });
  });

  for (const pattern of ["https://fonts.googleapis.com/**", "https://fonts.gstatic.com/**", "https://cdn.jsdelivr.net/gh/**", "https://unpkg.com/**"]) {
    await page.route(pattern, r => r.abort());
  }
}


/* =========================================================
   A 무대 — 하네스
========================================================== */

async function openHarness(browser, contextOptions = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, ...contextOptions });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => failures.push(`pageerror: ${err.message}`));
  await page.addInitScript(animationRecorder);
  await page.goto(HARNESS, { waitUntil: "load" });
  await page.waitForFunction(() => window.__tr && window.__tr.ready === true, null, { timeout: 15000 });
  return { ctx, page };
}

const TYPES = ["fade", "slide", "scale", "fade-slide", "fade-scale"];
const DIRS = ["up", "down", "left", "right"];

const PANEL_HTML =
  '<div class="wrap">' +
  '<span class="tg" data-imory-toggle="menu">MENU</span>' +
  '<a class="tg-link" href="/elsewhere" data-imory-toggle="menu">LINK</a>' +
  '<div class="stage">' +
  '<div class="under">UNDER</div>' +
  '<div class="pn" data-imory-panel="menu" data-imory-transition="fade-slide" data-imory-transition-duration="300" data-imory-transition-easing="linear">PANEL</div>' +
  '</div></div>';

const PANEL_CSS =
  ".wrap{padding:20px;}" +
  ".tg,.tg-link{display:inline-block;padding:8px;margin-right:8px;}" +
  ".stage{position:relative;width:240px;height:120px;margin-top:12px;}" +
  ".under,.pn{position:absolute;inset:0;}" +
  ".under{background:#eee;}" +
  ".pn{background:#cde;display:flex;align-items:center;justify-content:center;}";

async function panelState(page) {
  return page.evaluate(() => {
    const pn = document.querySelector(".pn");
    const stage = document.querySelector(".stage").getBoundingClientRect();
    const hit = document.elementFromPoint(stage.left + stage.width / 2, stage.top + stage.height / 2);
    const tg = document.querySelector(".tg");
    return {
      state: pn.getAttribute("data-imory-transition-state"),
      hidden: pn.hidden,
      inert: pn.hasAttribute("inert"),
      display: getComputedStyle(pn).display,
      opacity: Number(getComputedStyle(pn).opacity),
      anims: pn.getAnimations().length,
      hit: hit ? hit.className : null,
      expanded: tg.getAttribute("aria-expanded"),
      role: tg.getAttribute("role"),
      tabindex: tg.getAttribute("tabindex")
    };
  });
}


async function runHarness(browser) {

  /* ---------------------------------------------------- */

  if (section("types")) {

    const { ctx, page } = await openHarness(browser);

    const result = await page.evaluate(({ types, dirs }) => {

      let html = '<div class="grid">';

      types.concat(["none"]).forEach((t) => dirs.forEach((d) => {
        html +=
          `<div class="bx k-${t}__${d}" data-imory-transition="${t}" ` +
          `data-imory-transition-direction="${d}" data-imory-transition-duration="1000" ` +
          `data-imory-transition-easing="linear">${t}</div>`;
      }));

      html += '</div>' +
        '<div class="fr" data-imory-layout="free" data-imory-layout-height="200">' +
        '<div class="fi" data-imory-item-x="1" data-imory-item-y="0" data-imory-item-width="30" ' +
        'data-imory-transition="slide" data-imory-transition-direction="up" data-imory-transition-duration="1000">F</div>' +
        '</div>';

      window.__tr.render(
        html,
        ".grid{display:flex;flex-wrap:wrap;gap:24px;padding:24px;}" +
        ".bx{width:100px;height:50px;background:#ddd;box-sizing:border-box;}" +
        ".fr{margin:24px;}.fi{height:40px;background:#cce;}"
      );

      const els = Array.from(document.querySelectorAll(".bx, .fi"));

      /* 스킨 HTML 에는 임의 data-* 를 쓸 수 없다(sanitizer) — 열쇠는 class 로 */
      const skinKey = (el) => {
        const m = /\bk-(\S+)__(\S+)/.exec(el.className);
        return m ? m[1] + "/" + m[2] : "free";
      };

      /* t=0 에 멈춘다 */
      document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; });

      const start = {};

      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        const anims = el.getAnimations();
        start[skinKey(el)] = {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
          opacity: Number(getComputedStyle(el).opacity),
          names: anims.map((a) => a.animationName),
          duration: anims[0] ? anims[0].effect.getTiming().duration : null,
          state: el.getAttribute("data-imory-transition-state")
        };
      });

      document.getAnimations().forEach((a) => a.finish());

      const end = {};

      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        end[skinKey(el)] = {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
          opacity: Number(getComputedStyle(el).opacity),
          anims: el.getAnimations().length
        };
      });

      const freeBox = document.querySelector(".fr").getBoundingClientRect();

      return { start, end, freeRight: freeBox.right };

    }, { types: TYPES, dirs: DIRS });

    const { start, end } = result;
    if (args.includes("--debug")) console.log(JSON.stringify(Object.keys(start)), JSON.stringify(start).slice(0, 600));

    for (const t of TYPES) {
      for (const d of DIRS) {
        const k = `${t}/${d}`;
        const s = start[k];
        const e = end[k];
        const fades = t.startsWith("fade");
        const slides = t === "slide" || t === "fade-slide";
        const scales = t === "scale" || t === "fade-scale";

        const expectDx = slides ? ({ left: 12, right: -12 }[d] || 0) : 0;
        const expectDy = slides ? ({ up: 12, down: -12 }[d] || 0) : 0;

        let ok = s.names.length === 1 && s.names[0] === "imory-transition-in" && s.duration === 1000;
        ok = ok && near(s.opacity, fades ? 0 : 1, 0.01);

        if (scales) {
          ok = ok && near(s.width, e.width * 0.92, 1);
          const edge = { up: "bottom", down: "top", left: "right", right: "left" }[d];
          ok = ok && near(s[edge], e[edge], 1);
        } else {
          ok = ok && near(s.left - e.left, expectDx, 1) && near(s.top - e.top, expectDy, 1) && near(s.width, e.width, 0.5);
        }

        check(
          `${k} — 나타날 때의 자세`,
          ok,
          `op=${s.opacity.toFixed(2)} dx=${(s.left - e.left).toFixed(1)} dy=${(s.top - e.top).toFixed(1)} w=${s.width.toFixed(1)}/${e.width} names=${s.names}`
        );

        check(
          `${k} — 끝나면 제자리 · 원래 모습 · 남은 애니메이션 없음`,
          near(e.opacity, 1, 0.01) && e.anims === 0,
          `op=${e.opacity} anims=${e.anims}`
        );
      }
    }

    const noneOk = DIRS.every((d) => start[`none/${d}`].names.length === 0 && start[`none/${d}`].state === null);
    check("none — 애니메이션도 상태 속성도 없다", noneOk);

    check(
      "★ free 배치(transform)와 공존 — 전환 동안 위로 12px 아래에 있고, 가로 자리는 배치 그대로",
      near(start.free.top - end.free.top, 12, 1) && near(start.free.left, end.free.left, 1),
      `dy=${(start.free.top - end.free.top).toFixed(1)} dx=${(start.free.left - end.free.left).toFixed(1)}`
    );

    check(
      "free 자식은 끝난 뒤 오른쪽 끝에 딱 붙는다(x=1 — 배치 transform 이 사라지지 않았다)",
      near(end.free.right, result.freeRight, 1.5),
      `${end.free.right} vs ${result.freeRight}`
    );

    await ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("showhide")) {

    const { ctx, page } = await openHarness(browser);

    await page.evaluate(({ html, css }) => window.__tr.render(html, css), { html: PANEL_HTML, css: PANEL_CSS });

    let s = await panelState(page);

    check("패널은 닫힌 채로 시작한다", s.state === "hidden" && s.hidden === true && s.display === "none" && s.inert === true, JSON.stringify(s));
    check("★ 닫힌 패널은 클릭을 가로채지 않는다(아래 요소가 맞는다)", s.hit === "under", s.hit);
    check("토글이 버튼으로 읽힌다(role · tabindex · aria-expanded)", s.role === "button" && s.tabindex === "0" && s.expanded === "false");

    await page.click(".tg");
    s = await panelState(page);
    check("열기 — 누르는 즉시 레이아웃에 돌아오고 움직이기 시작한다", s.state === "showing" && s.hidden === false && s.anims === 1, JSON.stringify(s));

    await sleep(450);
    s = await panelState(page);
    check("열림 — 원래 모습 · 남은 애니메이션 없음 · aria-expanded=true", s.state === "shown" && s.opacity === 1 && s.anims === 0 && s.expanded === "true", JSON.stringify(s));
    check("열린 패널이 클릭을 받는다", s.hit === "pn", s.hit);

    await page.click(".tg");
    s = await panelState(page);
    check("★ 닫히는 **중에도** 클릭을 가로채지 않는다(hiding + inert)", s.state === "hiding" && s.inert === true && s.hit === "under", JSON.stringify(s));

    await sleep(450);
    s = await panelState(page);
    check("닫힘 — hidden · display:none · aria-expanded=false", s.state === "hidden" && s.hidden === true && s.display === "none" && s.expanded === "false", JSON.stringify(s));

    await page.focus(".tg");
    await page.keyboard.press("Enter");
    await sleep(450);
    s = await panelState(page);
    check("키보드(Enter)로도 열린다", s.state === "shown", s.state);

    await page.keyboard.press(" ");
    await sleep(450);
    s = await panelState(page);
    check("키보드(Space)로 닫힌다", s.state === "hidden", s.state);

    const before = page.url();
    await page.click(".tg-link");
    await sleep(450);
    s = await panelState(page);
    check("★ 링크에 단 토글은 페이지를 옮기지 않고 패널만 연다", page.url() === before && s.state === "shown", `${page.url()} ${s.state}`);

    /* 일반 show/hide — 패널이 아닌 요소도 같은 API 로 */
    const api = await page.evaluate(async () => {
      window.__tr.render(
        '<p class="note" data-imory-transition="fade-scale" data-imory-transition-duration="200">NOTE</p>',
        ""
      );
      const el = document.querySelector(".note");
      await new Promise((r) => setTimeout(r, 300));
      window.hideSkinTransition(el);
      const mid = el.getAttribute("data-imory-transition-state");
      await new Promise((r) => setTimeout(r, 350));
      const hidden = { state: el.getAttribute("data-imory-transition-state"), hidden: el.hidden };
      window.showSkinTransition(el);
      await new Promise((r) => setTimeout(r, 350));
      return { mid, hidden, shown: el.getAttribute("data-imory-transition-state"), visible: el.getBoundingClientRect().height > 0 };
    });

    check(
      "일반 요소 show/hide — hiding → hidden → shown",
      api.mid === "hiding" && api.hidden.state === "hidden" && api.hidden.hidden === true && api.shown === "shown" && api.visible,
      JSON.stringify(api)
    );

    await ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("rapid")) {

    const { ctx, page } = await openHarness(browser);

    await page.evaluate(({ html, css }) => window.__tr.render(html, css), { html: PANEL_HTML, css: PANEL_CSS });

    for (const [count, gap] of [[7, 0], [8, 0], [9, 25], [10, 25], [11, 70]]) {

      await page.evaluate(() => {
        window.setSkinPanelOpen(document.querySelector("[data-skin-root]"), "menu", false, { animate: false });
      });

      await page.evaluate(async ({ count, gap }) => {
        const tg = document.querySelector(".tg");
        for (let i = 0; i < count; i += 1) {
          tg.click();
          if (gap) await new Promise((r) => setTimeout(r, gap));
        }
      }, { count, gap });

      await sleep(500);

      const s = await panelState(page);
      const shouldOpen = count % 2 === 1;

      check(
        `${count}번 연속(${gap}ms 간격) — 마지막 요청(${shouldOpen ? "열림" : "닫힘"})이 최종 상태`,
        shouldOpen
          ? (s.state === "shown" && !s.hidden && !s.inert && s.expanded === "true" && s.opacity === 1)
          : (s.state === "hidden" && s.hidden && s.inert && s.expanded === "false" && s.display === "none"),
        JSON.stringify(s)
      );

      check(`${count}번 연속 — 남은 애니메이션이 없다`, s.anims === 0, String(s.anims));
    }

    /* 방향이 바뀌는 순간 튀지 않는다 — 1초짜리 선형 페이드 한가운데서 */
    const flip = await page.evaluate(async () => {
      window.__tr.render(
        '<div class="slow" data-imory-panel="slow" data-imory-transition="fade" data-imory-transition-duration="1000" data-imory-transition-easing="linear">SLOW</div>',
        ".slow{height:40px;background:#cde;}"
      );
      const root = document.querySelector("[data-skin-root]");
      const el = document.querySelector(".slow");
      window.setSkinPanelOpen(root, "slow", true);
      await new Promise((r) => setTimeout(r, 400));
      const beforeHide = Number(getComputedStyle(el).opacity);
      window.setSkinPanelOpen(root, "slow", false);
      const afterHide = Number(getComputedStyle(el).opacity);
      await new Promise((r) => setTimeout(r, 200));
      const midHide = Number(getComputedStyle(el).opacity);
      window.setSkinPanelOpen(root, "slow", true);
      const afterShow = Number(getComputedStyle(el).opacity);
      const animCount = el.getAnimations().length;
      await new Promise((r) => setTimeout(r, 1200));
      return {
        beforeHide, afterHide, midHide, afterShow, animCount,
        final: el.getAttribute("data-imory-transition-state"),
        finalOpacity: Number(getComputedStyle(el).opacity),
        left: el.getAnimations().length
      };
    });

    check(
      "★ 여는 중에 닫으면 지금 자리에서 되돌아간다(튀지 않는다)",
      near(flip.beforeHide, flip.afterHide, 0.08) && flip.beforeHide > 0.2 && flip.beforeHide < 0.7,
      `before=${flip.beforeHide.toFixed(2)} after=${flip.afterHide.toFixed(2)}`
    );

    check(
      "되돌아가는 동안 실제로 옅어진다",
      flip.midHide < flip.afterHide - 0.08,
      `after=${flip.afterHide.toFixed(2)} mid=${flip.midHide.toFixed(2)}`
    );

    check(
      "★ 닫는 중에 다시 열어도 그 자리에서 이어진다 · 애니메이션은 여전히 하나",
      near(flip.midHide, flip.afterShow, 0.08) && flip.animCount === 1,
      `mid=${flip.midHide.toFixed(2)} show=${flip.afterShow.toFixed(2)} anims=${flip.animCount}`
    );

    check("끝나면 열린 상태 · 원래 모습 · 남은 애니메이션 없음", flip.final === "shown" && flip.finalOpacity === 1 && flip.left === 0, JSON.stringify(flip));

    await ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("reduced")) {

    const { ctx, page } = await openHarness(browser, { reducedMotion: "reduce" });

    const r = await page.evaluate(({ html, css }) => {
      window.__animLog.length = 0;
      window.__tr.render(
        '<div class="appear" data-imory-transition="fade-slide" data-imory-transition-duration="600">APPEAR</div>' + html,
        css
      );
      const appear = document.querySelector(".appear");
      const appearAnims = appear.getAnimations().length;
      const tg = document.querySelector(".tg");
      const pn = document.querySelector(".pn");
      tg.click();
      const afterOpen = { state: pn.getAttribute("data-imory-transition-state"), hidden: pn.hidden, anims: pn.getAnimations().length };
      tg.click();
      const afterClose = { state: pn.getAttribute("data-imory-transition-state"), hidden: pn.hidden, anims: pn.getAnimations().length };
      return { appearAnims, afterOpen, afterClose, waapi: window.__animLog.filter((l) => l.kind === "waapi").length };
    }, { html: PANEL_HTML, css: PANEL_CSS });

    check("prefers-reduced-motion — 들어오기가 재생되지 않는다", r.appearAnims === 0, String(r.appearAnims));
    check("prefers-reduced-motion — 열기는 기다리지 않는다(같은 순간 shown)", r.afterOpen.state === "shown" && !r.afterOpen.hidden && r.afterOpen.anims === 0, JSON.stringify(r.afterOpen));
    check("prefers-reduced-motion — 닫기도 같은 순간 hidden", r.afterClose.state === "hidden" && r.afterClose.hidden, JSON.stringify(r.afterClose));
    check("prefers-reduced-motion — Web Animation 이 하나도 만들어지지 않았다", r.waapi === 0, String(r.waapi));

    await ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("mobile")) {

    for (const width of [390, 320]) {

      const { ctx, page } = await openHarness(browser, { viewport: { width, height: 800 }, isMobile: true, hasTouch: true });

      const m = await page.evaluate(() => {

        const html =
          '<div class="page">' +
          '<div class="full" data-imory-transition="fade-slide" data-imory-transition-direction="left" data-imory-transition-duration="1000">LEFT</div>' +
          '<div class="full" data-imory-transition="slide" data-imory-transition-direction="right" data-imory-transition-duration="1000">RIGHT</div>' +
          '<div class="full" data-imory-transition="fade-scale" data-imory-transition-direction="left" data-imory-transition-duration="1000">SCALE</div>' +
          '</div>';

        const root = window.__tr.render(html, ".full{width:100%;height:60px;background:#dde;box-sizing:border-box;}");

        document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; });

        const doc = document.documentElement;

        /* clip 은 스크롤 컨테이너를 만들지 않으므로 루트의 scrollWidth 는
           넘친 폭을 그대로 보고한다 — 재야 하는 것은 "화면이 옆으로
           밀릴 수 있는가"다: 문서의 가로 스크롤 폭, 그리고 실제로
           옆으로 밀어 봤을 때 밀리는가. */
        document.scrollingElement.scrollLeft = 200;

        const measured = {
          clip: root.hasAttribute("data-imory-transition-clip"),
          docOverflow: doc.scrollWidth - doc.clientWidth,
          scrolled: document.scrollingElement.scrollLeft
        };

        /* 대조군: 가로 자르기를 떼면 실제로 넘치는가(이 측정이 뭔가를 잰다는 증거) */
        root.removeAttribute("data-imory-transition-clip");

        measured.withoutClip = doc.scrollWidth - doc.clientWidth;

        root.setAttribute("data-imory-transition-clip", "");

        document.getAnimations().forEach((a) => a.finish());

        measured.afterDoc = doc.scrollWidth - doc.clientWidth;

        return measured;

      });

      check(`${width}px — 좌우 슬라이드가 있는 루트에 가로 자르기가 걸린다`, m.clip);
      check(`★ ${width}px — 전환 한가운데(t=0)에도 가로 넘침 0 · 옆으로 밀리지 않는다`, m.docOverflow <= 0 && m.scrolled === 0, JSON.stringify(m));
      check(`${width}px — 대조군: 자르기를 떼면 실제로 넘친다(측정이 유효하다)`, m.withoutClip > 0, String(m.withoutClip));
      check(`${width}px — 끝난 뒤에도 넘침 0`, m.afterDoc <= 0, String(m.afterDoc));

      await ctx.close();
    }
  }


  /* ---------------------------------------------------- */

  if (section("sanitize")) {

    const { ctx, page } = await openHarness(browser);

    const s = await page.evaluate(() => window.__tr.sanitize(
      '<div class="a" data-imory-transition="fade" data-imory-transition-duration="5000"></div>' +
      '<div class="b" data-imory-transition="slide" data-imory-transition-duration="10" data-imory-transition-direction="left"></div>' +
      '<div class="c" data-imory-transition="bounce" data-imory-transition-duration="200ms" data-imory-transition-easing="cubic-bezier(0,0,1,1)"></div>' +
      '<div class="d" data-imory-transition-state="shown" data-imory-transition-clip="" inert hidden></div>' +
      '<div class="e" data-imory-panel="Bad Name" data-imory-toggle="ok-name"></div>'
    ));

    check("속도 5000 은 1000 으로 잘려 저장된다", s.indexOf('class="a" data-imory-transition="fade" data-imory-transition-duration="1000"') !== -1, s);
    check("속도 10 은 80 으로 잘려 저장된다", s.indexOf('data-imory-transition-duration="80"') !== -1);
    check("방향은 그대로 저장된다", s.indexOf('data-imory-transition-direction="left"') !== -1);
    check("모르는 종류 · 단위 붙은 속도 · 임의 곡선은 버린다(요소는 남는다)", s.indexOf('class="c"') !== -1 && !/class="c"[^>]*data-imory-transition/.test(s), s);
    check("★ 런타임 상태 속성은 저장되지 않는다", s.indexOf("data-imory-transition-state") === -1 && s.indexOf("data-imory-transition-clip") === -1);
    check("패널 이름이 틀리면 그 속성만 버리고, 맞는 토글은 남긴다", s.indexOf("data-imory-panel") === -1 && s.indexOf('data-imory-toggle="ok-name"') !== -1, s);

    await ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("legacy")) {

    const { ctx, page } = await openHarness(browser);

    const l = await page.evaluate(() => {
      const root = window.__tr.render(
        '<div class="leg"><p class="p">A</p><ul><li data-imory-repeat="home.recentPosts"><span data-imory-bind="item.title"></span></li></ul></div>',
        ".leg{color:#333;}"
      );
      const html = root.outerHTML;
      return {
        html,
        anims: document.getAnimations().length,
        style: root.querySelectorAll("[style]").length,
        rootAttrs: Array.from(root.attributes).map((a) => a.name).sort().join(",")
      };
    });

    check(
      "★ 전환 속성이 없는 스킨 — 상태 속성·inert·style 이 하나도 생기지 않는다",
      l.html.indexOf("data-imory-transition") === -1 && l.html.indexOf("inert") === -1 && l.style === 0,
      l.html.slice(0, 200)
    );
    check("전환 속성이 없는 스킨 — 애니메이션 0", l.anims === 0, String(l.anims));
    check("루트 속성도 그대로(class · data-skin-root 뿐)", l.rootAttrs === "class,data-skin-root", l.rootAttrs);

    await ctx.close();
  }

}


/* =========================================================
   B 무대 — 실제 index.html
========================================================== */

async function openApp(browser, { width = 1100, height = 900, reducedMotion, skin = EXAMPLE_SKIN, url } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(width < 600 ? { isMobile: true, hasTouch: true } : {}),
    ...(reducedMotion ? { reducedMotion } : {})
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => failures.push(`pageerror: ${err.message}`));
  await page.addInitScript(animationRecorder);
  await installSupabaseMock(page, skin);
  await page.goto(url || `http://localhost:${PORT}/${SLUG}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".imory-skin-root") !== null, null, { timeout: 10000 }).catch(() => {});
  await sleep(500);
  return { ctx, page };
}

const animLog = (page) => page.evaluate(() => window.__animLog.slice());
const clearLog = (page) => page.evaluate(() => { window.__animLog.length = 0; });

function started(log, kind, cls) {
  return log.filter((l) => l.kind === kind && l.cls.split(/\s+/).indexOf(cls) !== -1);
}

async function readDockItems(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-imory-dock-position]");
    const items = root && root.querySelector('[data-imory-dock="items"]');
    const trigger = root && root.querySelector('[data-imory-dock="trigger"]');
    if (!items) return null;
    return {
      count: document.querySelectorAll("[data-imory-dock-position]").length,
      dockState: root.getAttribute("data-imory-dock-state"),
      transitionAttr: root.getAttribute("data-imory-dock-transition"),
      state: items.getAttribute("data-imory-transition-state"),
      hidden: items.hidden,
      inert: items.hasAttribute("inert"),
      anims: items.getAnimations().length,
      opacity: Number(getComputedStyle(items).opacity),
      expanded: trigger ? trigger.getAttribute("aria-expanded") : null
    };
  });
}


async function runApp(browser) {

  /* ---------------------------------------------------- */

  if (section("routes")) {

    const { ctx, page } = await openApp(browser);

    let log = await animLog(page);

    check("HOME — 템플릿 맨 바깥 요소의 appear 가 재생됐다(페이지 전환)", started(log, "css", "tr-home").some((l) => l.name === "imory-transition-in"), JSON.stringify(log.slice(0, 4)));
    check("HOME — 반복 카드도 각자 들어온다", started(log, "css", "tr-card").length >= 1);
    check("HOME — 닫힌 메뉴 패널은 재생되지 않는다(열릴 때 탄다)", started(log, "css", "tr-menu").length === 0);

    /* 메뉴 패널 — 스킨 안의 일반 UI */
    const menu = await page.evaluate(async () => {
      const panel = document.querySelector(".tr-menu");
      const before = { hidden: panel.hidden, display: getComputedStyle(panel).display };
      document.querySelector(".tr-menu-button").click();
      await new Promise((r) => setTimeout(r, 400));
      return { before, after: panel.getAttribute("data-imory-transition-state"), visible: panel.getBoundingClientRect().height > 0 };
    });

    check("HOME 메뉴 — 닫힌 채로 시작해 토글로 열린다", menu.before.hidden && menu.before.display === "none" && menu.after === "shown" && menu.visible, JSON.stringify(menu));

    await page.evaluate(() => document.querySelector(".tr-menu-button").click());
    await sleep(350);

    /* HOME -> CATEGORY */
    await clearLog(page);
    await page.evaluate(() => document.querySelector(".tr-cat").click());
    await page.waitForFunction(() => !!document.querySelector(".tr-category"), null, { timeout: 8000 });
    await sleep(500);

    log = await animLog(page);
    check("★ HOME → CATEGORY — 새 화면이 들어온다", started(log, "css", "tr-category").some((l) => l.name === "imory-transition-in"), JSON.stringify(log));
    check("주소가 CATEGORY 로 바뀐다(전환이 라우팅을 건드리지 않는다)", /\/category\/1$/.test(new URL(page.url()).pathname), page.url());

    const catClip = await page.evaluate(() => {
      const el = document.querySelector(".tr-category");
      return el.closest("[data-skin-root]").hasAttribute("data-imory-transition-clip");
    });
    check("CATEGORY 는 왼쪽으로 들어오므로 그 스킨 루트에 가로 자르기", catClip);

    /* CATEGORY -> POST */
    await clearLog(page);
    await page.evaluate(() => document.querySelector(".tr-post").click());
    await page.waitForFunction(() => !!document.querySelector(".tr-page.tr-post"), null, { timeout: 8000 });
    await sleep(500);

    log = await animLog(page);
    check("★ CATEGORY → POST — 새 화면이 들어온다", started(log, "css", "tr-post").some((l) => l.name === "imory-transition-in"), JSON.stringify(log));

    const settled = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".tr-page")).filter((el) => el.getBoundingClientRect().height > 0).map((el) => ({
        cls: el.className,
        opacity: Number(getComputedStyle(el).opacity),
        anims: el.getAnimations().length
      }))
    );
    check("전환이 끝나면 보이는 화면은 원래 모습이다", settled.length >= 1 && settled.every((s) => s.opacity === 1 && s.anims === 0), JSON.stringify(settled));

    /* 뒤로 -> CATEGORY -> HOME */
    await clearLog(page);
    await page.goBack();
    await page.waitForFunction(() => !!document.querySelector(".tr-category"), null, { timeout: 8000 });
    await sleep(500);
    log = await animLog(page);
    check("뒤로가기 — CATEGORY 가 다시 들어온다", started(log, "css", "tr-category").length >= 1, JSON.stringify(log));

    await clearLog(page);
    await page.goBack();
    await page.waitForFunction(() => /^\/trblog\/?$/.test(location.pathname), null, { timeout: 8000 });
    await sleep(600);
    log = await animLog(page);
    check(
      "★ HOME 복귀 — HOME 은 다시 그려지지 않지만 같은 들어오기가 재생된다",
      started(log, "waapi", "tr-home").length === 1,
      JSON.stringify(log)
    );
    check("HOME 복귀 — 닫힌 메뉴 패널은 재생 대상이 아니다", started(log, "waapi", "tr-menu").length === 0);

    const dockCount = await page.evaluate(() => document.querySelectorAll("[data-imory-dock-position]").length);
    check("화면을 오가도 dock 은 하나", dockCount === 1, String(dockCount));

    await ctx.close();

    /* 직접 접속 */
    const direct = await openApp(browser, { url: `http://localhost:${PORT}/${SLUG}/category/1` });
    await direct.page.waitForFunction(() => !!document.querySelector(".tr-category"), null, { timeout: 8000 }).catch(() => {});
    await sleep(400);
    log = await animLog(direct.page);
    check("직접 접속한 CATEGORY 도 들어온다", started(log, "css", "tr-category").length >= 1, JSON.stringify(log));
    await direct.ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("dock")) {

    const { ctx, page } = await openApp(browser);

    let d = await readDockItems(page);
    check("dock 이 그려지고 펼친 채로 시작한다(움직임 없이 — 첫 상태는 즉시)", d && d.count === 1 && d.dockState === "expanded" && d.state === "shown" && !d.hidden && d.anims === 0, JSON.stringify(d));
    check("dock 루트에는 종류 이름만 나간다(옛 CSS 계약)", d.transitionAttr === "fade-slide", d.transitionAttr);

    await clearLog(page);
    await page.evaluate(() => document.querySelector('[data-imory-dock="trigger"]').click());

    const mid = await page.evaluate(() => {
      const items = document.querySelector('[data-imory-dock="items"]');
      const link = items.querySelector("a, [data-imory-dock-item]");
      const r = link.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { state: items.getAttribute("data-imory-transition-state"), hidden: items.hidden, hitInside: !!(hit && items.contains(hit)) };
    });

    check("접기 — 누르는 즉시 hiding(아직 레이아웃에 있다)", mid.state === "hiding" && mid.hidden === false, JSON.stringify(mid));
    check("★ 사라지는 중인 항목은 클릭을 받지 않는다", mid.hitInside === false);

    const log = await animLog(page);
    const dockAnim = log.filter((l) => l.kind === "waapi" && l.dock === "items");
    check("★ dock 접기가 공용 primitive 로 움직인다 — bottomDock.transition 의 속도(240ms)", dockAnim.length === 1 && dockAnim[0].duration === 240, JSON.stringify(dockAnim));

    await sleep(450);
    d = await readDockItems(page);
    check("접힘 — hidden · inert · aria-expanded=false · 남은 애니메이션 없음", d.dockState === "collapsed" && d.state === "hidden" && d.hidden && d.inert && d.expanded === "false" && d.anims === 0, JSON.stringify(d));

    await page.evaluate(() => document.querySelector('[data-imory-dock="trigger"]').click());
    await sleep(450);
    d = await readDockItems(page);
    check("펼침 — shown · 원래 모습", d.dockState === "expanded" && d.state === "shown" && !d.hidden && !d.inert && d.opacity === 1 && d.anims === 0, JSON.stringify(d));

    for (const [count, gap] of [[9, 20], [10, 20], [13, 0], [6, 60]]) {
      await page.evaluate(async ({ count, gap }) => {
        const trigger = document.querySelector('[data-imory-dock="trigger"]');
        for (let i = 0; i < count; i += 1) {
          trigger.click();
          if (gap) await new Promise((r) => setTimeout(r, gap));
        }
      }, { count, gap });
      await sleep(500);
      d = await readDockItems(page);
      const before = d;
      /* 시작 상태는 매번 펼침이다(짝수면 되돌려 놓는다) */
      const collapsed = count % 2 === 1;
      check(
        `★ dock ${count}번 연속(${gap}ms) — ${collapsed ? "접힘" : "펼침"}으로 끝난다 · 상태 속성과 hidden 이 어긋나지 않는다`,
        collapsed
          ? (before.dockState === "collapsed" && before.state === "hidden" && before.hidden && before.expanded === "false" && before.anims === 0)
          : (before.dockState === "expanded" && !before.hidden && before.expanded === "true" && before.anims === 0 && before.opacity === 1),
        JSON.stringify(before)
      );
      if (collapsed) {
        await page.evaluate(() => document.querySelector('[data-imory-dock="trigger"]').click());
        await sleep(450);
      }
    }

    /* dock 안 패널 — open 동작이 같은 패널 함수를 지난다 */
    const pair = await page.evaluate(async () => {
      const root = document.querySelector("[data-imory-dock-position]");
      const panel = root.querySelector('[data-imory-panel="pair"]');
      const item = root.querySelector('[data-imory-dock-item="pair"]');
      const start = { hidden: panel.hidden, state: panel.getAttribute("data-imory-transition-state") };
      item.click();
      const opening = panel.getAttribute("data-imory-transition-state");
      await new Promise((r) => setTimeout(r, 400));
      const opened = { state: panel.getAttribute("data-imory-transition-state"), open: root.getAttribute("data-imory-dock-open"), visible: panel.getBoundingClientRect().height > 0 };
      item.click();
      await new Promise((r) => setTimeout(r, 400));
      const closed = { state: panel.getAttribute("data-imory-transition-state"), hidden: panel.hidden, open: root.getAttribute("data-imory-dock-open") };
      return { start, opening, opened, closed };
    });

    check("dock 패널 — 닫힌 채로 시작", pair.start.hidden && pair.start.state === "hidden", JSON.stringify(pair.start));
    check("★ dock 의 open 항목이 패널을 전환과 함께 연다", pair.opening === "showing" && pair.opened.state === "shown" && pair.opened.visible && pair.opened.open === "pair", JSON.stringify(pair));
    check("같은 항목을 다시 누르면 닫힌다(옛 data-imory-dock-open 도 함께 지워진다)", pair.closed.state === "hidden" && pair.closed.hidden && pair.closed.open === null, JSON.stringify(pair.closed));

    await ctx.close();

    /* transition none — 기다리지 않는다 */
    const noneSkin = JSON.parse(JSON.stringify(EXAMPLE_SKIN));
    noneSkin.bottomDock.transition = { type: "none", duration: 600, easing: "ease", direction: "up" };
    const n = await openApp(browser, { skin: noneSkin });
    await n.page.evaluate(() => document.querySelector('[data-imory-dock="trigger"]').click());
    const nd = await readDockItems(n.page);
    check("dock transition none — 같은 순간 접힌다", nd.state === "hidden" && nd.hidden, JSON.stringify(nd));
    await n.ctx.close();

    /* 옛 문자열 모양의 설정도 그대로 동작한다 */
    const legacySkin = JSON.parse(JSON.stringify(EXAMPLE_SKIN));
    legacySkin.bottomDock.transition = "slide";
    const lg = await openApp(browser, { skin: legacySkin });
    await clearLog(lg.page);
    await lg.page.evaluate(() => document.querySelector('[data-imory-dock="trigger"]').click());
    const lgLog = (await animLog(lg.page)).filter((l) => l.kind === "waapi" && l.dock === "items");
    await sleep(400);
    const lgd = await readDockItems(lg.page);
    check("옛 문자열 transition(\"slide\") — 기본 속도 200ms 로 같은 primitive 를 탄다", lgLog.length === 1 && lgLog[0].duration === 200 && lgd.hidden, JSON.stringify({ lgLog, lgd }));
    await lg.ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("routes-reduced")) {

    const { ctx, page } = await openApp(browser, { reducedMotion: "reduce" });

    const r = await page.evaluate(() => {
      const home = document.querySelector(".tr-home");
      const homeAnims = home.getAnimations().length;
      document.querySelector('[data-imory-dock="trigger"]').click();
      const items = document.querySelector('[data-imory-dock="items"]');
      return { homeAnims, state: items.getAttribute("data-imory-transition-state"), hidden: items.hidden, waapi: window.__animLog.filter((l) => l.kind === "waapi").length };
    });

    check("움직임 줄이기 — HOME 이 들어오지 않고 그대로 있다", r.homeAnims === 0, String(r.homeAnims));
    check("움직임 줄이기 — dock 도 같은 순간 접힌다(기다리지 않는다)", r.state === "hidden" && r.hidden, JSON.stringify(r));
    check("움직임 줄이기 — Web Animation 0", r.waapi === 0, String(r.waapi));

    await clearLog(page);
    await page.evaluate(() => document.querySelector(".tr-cat").click());
    await page.waitForFunction(() => !!document.querySelector(".tr-category"), null, { timeout: 8000 });
    await sleep(300);
    const cat = await page.evaluate(() => document.querySelector(".tr-category").getAnimations().length);
    check("움직임 줄이기 — CATEGORY 로 옮겨도 전환 없이 바로", cat === 0, String(cat));

    await ctx.close();
  }


  /* ---------------------------------------------------- */

  if (section("routes-mobile")) {

    for (const width of [390, 320]) {

      const { ctx, page } = await openApp(browser, { width, height: 780 });

      const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${width}px HOME — 가로 넘침 0`, homeOverflow <= 0, String(homeOverflow));

      /* 다음 화면이 들어오는 순간(t=0)에 멈춰 세우고 잰다 */
      await page.evaluate(() => document.querySelector(".tr-cat").click());
      await page.waitForFunction(() => !!document.querySelector(".tr-category") && document.querySelector(".tr-category").getAnimations().length > 0, null, { timeout: 8000 }).catch(() => {});

      const frozen = await page.evaluate(() => {
        const el = document.querySelector(".tr-category");
        const area = el.closest(".post-area") || document.scrollingElement;
        el.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; });
        const anim = el.getAnimations()[0];
        return {
          paused: !!anim && anim.playState === "paused" && anim.animationName === "imory-transition-in",
          doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          area: area.scrollWidth - area.clientWidth,
          offset: el.getBoundingClientRect().left
        };
      });

      check(`${width}px CATEGORY — 왼쪽으로 들어오는 한가운데 멈춰 섰다`, frozen.paused, JSON.stringify(frozen));
      check(`★ ${width}px — 화면 전환 중 가로 넘침 0(문서 · 스크롤 영역)`, frozen.doc <= 0 && frozen.area <= 0, JSON.stringify(frozen));

      await page.evaluate(() => { document.getAnimations().forEach((a) => a.finish()); });
      await sleep(200);

      const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${width}px — 전환이 끝난 뒤에도 넘침 0`, after <= 0, String(after));

      const dock = await page.evaluate(() => {
        const t = document.querySelector('[data-imory-dock="trigger"]').getBoundingClientRect();
        return { w: t.width, h: t.height, right: t.right, vw: document.documentElement.clientWidth };
      });
      check(`${width}px — dock 트리거가 화면 안이고 손가락 영역 44px`, dock.right <= dock.vw && dock.w >= 44 && dock.h >= 44, JSON.stringify(dock));

      await ctx.close();
    }
  }
}


/* =========================================================
   실행
========================================================== */

async function run() {
  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();

  try {
    await runHarness(browser);
    await runApp(browser);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);
  if (failures.length) {
    console.log(failures.map((f) => "  - " + f).join("\n"));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
