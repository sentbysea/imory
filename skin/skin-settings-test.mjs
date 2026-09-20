/* =========================================================
   SKIN SETTINGS — 단위 테스트 (EDITORIAL-DEFAULT-SKIN-2)

   기준 문서: IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md

   브라우저 없이 판정할 수 있는 것:

     [colors]    색 네 역할 읽기/쓰기 · 정규화 · CSS 기본값 · 규칙 한 줄 ·
                 대비
     [photos]    구성 읽기/쓰기 · 자동/직접 판정 · 저장 경계 값 표 ·
                 슬롯 이름 · 사진 묶음 감지
     [dday]      날짜 검증 · 한국 시간 오늘 · 당일 1일 · D-N · 이름 자르기 ·
                 끄고 켜도 날짜가 남는다
     [mobile]    좌우 영역의 모바일 패널 칸 — 다른 칸 보존 · 봉투에는 끈
                 때만
     [preserve]  모르는 항목 · 칸 · 자리가 그대로 · 원래 배열 불변
     [template]  resolveSkinTemplate 가 settings 를 싣는가, 설정이 없는
                 스킨은 키조차 없는가(기존 스킨 회귀)
     [protocol]  sandbox 봉투의 settings · sides.mobile 모양
     [skin]      기본 스킨 — 슬롯 · regions · 문답 → 설정 · 금색 없음 ·
                 CSS 기본값 = 팔레트 · 예전 생성기 그대로
     [docs]      진입 문서 로드 순서 · sandbox allowlist · 렌더러 · AI

   실제 화면은 skin/skin-editorial-default-e2e-test.mjs.

   실행:  node skin/skin-settings-test.mjs
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const require = createRequire(import.meta.url);

const settings = require(path.join(HERE, "skin-settings.js"));
const sides = require(path.join(HERE, "skin-sides.js"));
const protocol = require(path.join(HERE, "sandbox", "skin-sandbox-protocol.js"));
const editorial = require(path.join(HERE, "skin-default-editorial.js"));

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);


/* ---------------------------------------------------------- */
console.log("\n[colors] 색 네 역할");

check("[colors] #abc · 대문자 → #aabbcc, 그 밖은 null",
  settings.normalizeSkinThemeColor("#ABC") === "#aabbcc" &&
  settings.normalizeSkinThemeColor(" #1B2340 ") === "#1b2340" &&
  settings.normalizeSkinThemeColor("red") === null &&
  settings.normalizeSkinThemeColor("#12345") === null &&
  settings.normalizeSkinThemeColor("#1b2340;}body{") === null &&
  settings.normalizeSkinThemeColor(null) === null);

check("[colors] 항목이 없으면 null",
  settings.readSkinThemeColors([]) === null && settings.readSkinThemeColors(undefined) === null);

{
  const regions = settings.writeSkinThemeColors([], { background: "#FFF", text: "#111111", accent: "bad", accent2: "#8796b0" });
  check("[colors] 쓰기 — 올바른 칸만(틀린 칸은 빠진다)",
    same(regions, [{ name: "theme_colors", colors: { background: "#ffffff", text: "#111111", accent2: "#8796b0" } }]));
  check("[colors] 읽기 = 쓴 값",
    same(settings.readSkinThemeColors(regions), { background: "#ffffff", text: "#111111", accent2: "#8796b0" }));
  check("[colors] null 을 쓰면 항목째 사라진다(스킨 기본색)",
    same(settings.writeSkinThemeColors(regions, null), []));
  const withExtra = [{ name: "theme_colors", colors: { text: "#000000" }, note: "keep" }];
  check("[colors] null 이어도 모르는 칸이 있으면 항목은 남는다",
    same(settings.writeSkinThemeColors(withExtra, null), [{ name: "theme_colors", note: "keep" }]));
}

check("[colors] CSS 의 var() 기본값 읽기",
  same(settings.readSkinThemeColorDefaults(
    ".a{color:var(--imory-color-text, #1B2340)} .b{background:var( --imory-color-background , #fff )} .c{x:var(--imory-color-accent-2,#8796b0)}"),
    { background: "#ffffff", text: "#1b2340", accent2: "#8796b0" }));

check("[colors] --imory-color-accent 와 -accent-2 를 헷갈리지 않는다",
  same(settings.readSkinThemeColorDefaults(".c{x:var(--imory-color-accent-2,#8796b0)}"), { accent2: "#8796b0" }));

check("[colors] 스킨이 색 변수를 읽는가",
  settings.skinCssUsesThemeColors("a{color:var(--imory-color-text,#000)}") &&
  !settings.skinCssUsesThemeColors("a{color:#000}"));

check("[colors] 규칙 한 줄 — 스코프 클래스 · 순서 고정 · 설정 없으면 빈 문자열",
  settings.buildSkinThemeColorsCss({ accent2: "#8796b0", background: "#ffffff" }, "imory-skin-root-i3") ===
    ".imory-skin-root-i3{--imory-color-background:#ffffff;--imory-color-accent-2:#8796b0}" &&
  settings.buildSkinThemeColorsCss(null, "imory-skin-root-i3") === "" &&
  settings.buildSkinThemeColorsCss({ text: "#000" }, "bad class}") === "");

check("[colors] 대비 — 흰/검 21:1 · 같은 색 1:1",
  Math.abs(settings.skinColorContrast("#ffffff", "#000000") - 21) < 0.01 &&
  Math.abs(settings.skinColorContrast("#8796b0", "#8796b0") - 1) < 0.001 &&
  settings.skinColorContrast("x", "#fff") === null);


/* ---------------------------------------------------------- */
console.log("\n[photos] HOME 사진 구성");

check("[photos] 항목이 없으면 null(= 자동), 틀린 값은 auto",
  settings.readSkinHomePhotosLayout([]) === null &&
  settings.readSkinHomePhotosLayout([{ name: "home_photos", layout: "grid" }]) === "auto" &&
  settings.readSkinHomePhotosLayout([{ name: "home_photos", layout: "PAIR" }]) === "pair");

check("[photos] 쓰기 — 틀린 값은 auto 로",
  same(settings.writeSkinHomePhotosLayout([], "triptych"), [{ name: "home_photos", layout: "triptych" }]) &&
  same(settings.writeSkinHomePhotosLayout([], "nope"), [{ name: "home_photos", layout: "auto" }]));

const decide = (req, n) => settings.decideSkinHomePhotosLayout(req, n);
check("[photos] 자동 — 0 empty · 1 hero · 2 pair · 3 triptych · 4 도 triptych(세 장)",
  same(decide("auto", 0), { layout: "empty", count: 0 }) &&
  same(decide("auto", 1), { layout: "hero", count: 1 }) &&
  same(decide("auto", 2), { layout: "pair", count: 2 }) &&
  same(decide("auto", 3), { layout: "triptych", count: 3 }) &&
  same(decide("auto", 4), { layout: "triptych", count: 3 }) &&
  same(decide(undefined, 2), { layout: "pair", count: 2 }));

check("[photos] 직접 — 채운 장 수까지만 · empty 는 사진이 있어도 글자 표지",
  same(decide("hero", 3), { layout: "hero", count: 1 }) &&
  same(decide("triptych", 2), { layout: "pair", count: 2 }) &&
  same(decide("pair", 0), { layout: "empty", count: 0 }) &&
  same(decide("empty", 4), { layout: "empty", count: 0 }));

check("[photos] 저장 경계 — set · 빈 item 만, 런타임은 이름부터 아니다",
  settings.sanitizeSkinPhotosAttributeValue("data-imory-photos", "SET") === "set" &&
  settings.sanitizeSkinPhotosAttributeValue("data-imory-photos", "grid") === null &&
  settings.sanitizeSkinPhotosAttributeValue("data-imory-photos-item", "") === "" &&
  settings.sanitizeSkinPhotosAttributeValue("data-imory-photos-item", "x") === null &&
  !settings.isSkinPhotosAttributeName("data-imory-photos-layout") &&
  !settings.isSkinPhotosAttributeName("data-imory-photos-state") &&
  !settings.isSkinPhotosAttributeName("data-imory-photos-position"));

{
  const html = editorial.createImoryEditorialDefaultSkin({}).templates.home.html;
  check("[photos] 기본 스킨 — 사진 묶음 감지 · 슬롯 이름 순서",
    settings.skinHtmlHasPhotoSet(html) &&
    same(settings.skinHtmlPhotoSlotNames(html), ["photo_1", "photo_2", "photo_3", "photo_4"]) &&
    !settings.skinHtmlHasPhotoSet("<div data-imory-photos-item></div>"));
}


/* ---------------------------------------------------------- */
console.log("\n[dday] D-day");

check("[dday] 날짜 검증 — 달력에 없는 날 · 모양 · 범위",
  settings.normalizeSkinDdayDate("2024-02-29") === "2024-02-29" &&
  settings.normalizeSkinDdayDate("2023-02-29") === null &&
  settings.normalizeSkinDdayDate("2024-2-1") === null &&
  settings.normalizeSkinDdayDate("1800-01-01") === null &&
  settings.normalizeSkinDdayDate(20240101) === null);

check("[dday] 이름 — 제어 문자 제거 · 공백 하나로 · 40자",
  settings.normalizeSkinDdayLabel("  since\nwe\t\tmet  ") === "since we met" &&
  settings.normalizeSkinDdayLabel("x".repeat(60)).length === 40 &&
  settings.normalizeSkinDdayLabel(5) === "");

check("[dday] 한국 시간 오늘 — UTC 15시는 다음 날",
  settings.skinDdayToday(new Date("2026-09-20T15:30:00Z")) === "2026-09-21" &&
  settings.skinDdayToday(new Date("2026-09-20T14:59:00Z")) === "2026-09-20");

{
  const at = new Date("2026-09-20T03:00:00Z");
  const past = settings.buildSkinDdayContext({ date: "2024-09-21", label: "since we met" }, at);
  const today = settings.buildSkinDdayContext({ date: "2026-09-20" }, at);
  const future = settings.buildSkinDdayContext({ date: "2026-10-02" }, at);
  const big = settings.buildSkinDdayContext({ date: "2020-01-01" }, at);
  check("[dday] 지난 날 — 당일을 1일로(2024-09-21 → 2026-09-20 = 730)", past.days === 730 && past.display === "730" && !past.isFuture && past.label === "since we met");
  check("[dday] 오늘 = 1", today.days === 1 && today.isToday && today.display === "1");
  check("[dday] 앞날 = D-12", future.isFuture && future.until === 12 && future.days === 0 && future.display === "D-12");
  check("[dday] 천 단위 쉼표", big.display === big.days.toLocaleString("en-US") && /,/.test(big.display));
  check("[dday] 날짜가 틀리면 null(가짜 값 없음)", settings.buildSkinDdayContext({ date: "nope" }, at) === null);
}

{
  let regions = settings.writeSkinDday([], { enabled: true, date: "2024-09-21", label: " since we met " });
  check("[dday] 쓰기/읽기", same(regions, [{ name: "dday", date: "2024-09-21", label: "since we met" }]) &&
    same(settings.readSkinDday(regions), { date: "2024-09-21", label: "since we met" }));
  regions = settings.writeSkinDday(regions, { enabled: false, date: "2024-09-21", label: "since we met" });
  check("[dday] 끄면 날짜 · 이름을 남기고 enabled:false",
    same(regions, [{ name: "dday", date: "2024-09-21", label: "since we met", enabled: false }]) &&
    settings.readSkinDday(regions) === null &&
    same(settings.readSkinDdayDraft(regions), { enabled: false, date: "2024-09-21", label: "since we met" }));
  regions = settings.writeSkinDday(regions, { enabled: true, date: "2024-09-21", label: "since we met" });
  check("[dday] 다시 켜면 그대로", same(settings.readSkinDday(regions), { date: "2024-09-21", label: "since we met" }));
  check("[dday] 날짜 없이 켜면 꺼진 채로 남는다",
    settings.readSkinDday(settings.writeSkinDday([], { enabled: true, date: "", label: "x" })) === null);
}


/* ---------------------------------------------------------- */
console.log("\n[mobile] 좌우 영역의 모바일 패널");

{
  const base = [{ name: "left_sidebar", enabled: true, items: ["a"] }, { name: "right_sidebar", enabled: false }];
  check("[mobile] 칸이 없으면 둘 다 연다", same(sides.readSkinSidesMobileSetting(base), { left: true, right: true }));
  const off = sides.writeSkinSidesMobileSetting(base, false);
  check("[mobile] 끄기 — 두 항목에 mobile:false · 다른 칸 · enabled 보존",
    same(off, [{ name: "left_sidebar", enabled: true, items: ["a"], mobile: false }, { name: "right_sidebar", enabled: false, mobile: false }]));
  check("[mobile] 다시 켜기 — mobile 칸이 사라진다(기본값을 적지 않는다)",
    same(sides.writeSkinSidesMobileSetting(off, true), base));
  check("[mobile] 영역 항목이 없던 스킨 — 꺼진 채로 만든다(단 구성 불변)",
    same(sides.writeSkinSidesMobileSetting([], false), [{ name: "left_sidebar", enabled: false, mobile: false }, { name: "right_sidebar", enabled: false, mobile: false }]));
  check("[mobile] 단 구성을 바꿔도 mobile 칸이 남는다",
    same(sides.writeSkinSidesSetting(off, { left: false, right: true })[0], { name: "left_sidebar", enabled: false, items: ["a"], mobile: false }));
  check("[mobile] 봉투 — 끈 쪽이 있을 때만 mobile",
    same(sides.buildSkinSidesRenderSetting({ regions: base }), { left: true, right: false }) &&
    same(sides.buildSkinSidesRenderSetting({ regions: off }), { left: true, right: false, mobile: { left: false, right: false } }));
  check("[mobile] 프레임 쪽 강제 — 틀린 mobile 은 버린다",
    same(sides.coerceSkinSidesRenderSetting({ left: true, right: true, mobile: { left: false } }), { left: true, right: true, mobile: { left: false, right: true } }) &&
    same(sides.coerceSkinSidesRenderSetting({ left: true, right: true, mobile: "no" }), { left: true, right: true }) &&
    same(sides.coerceSkinSidesRenderSetting({ left: true, right: true, mobile: { left: true, right: true } }), { left: true, right: true }));
}


/* ---------------------------------------------------------- */
console.log("\n[preserve] 모르는 것은 그대로");

{
  const original = [
    { name: "future_widget", order: ["a", "b"] },
    { name: "right_sidebar", enabled: true },
    { name: "theme_colors", colors: { text: "#000000" }, extra: 1 },
    { name: "theme_colors", colors: { text: "#ffffff" } },
    "odd",
    null
  ];
  const frozen = JSON.stringify(original);
  const next = settings.writeSkinThemeColors(original, { text: "#222222" });
  check("[preserve] 원래 배열 불변", JSON.stringify(original) === frozen);
  check("[preserve] 모르는 항목 · 모양이 이상한 항목 · 자리 그대로, 같은 이름의 뒤 항목은 버린다",
    same(next, [
      { name: "future_widget", order: ["a", "b"] },
      { name: "right_sidebar", enabled: true },
      { name: "theme_colors", colors: { text: "#222222" }, extra: 1 },
      "odd",
      null
    ]));
  check("[preserve] 같은 이름이 둘이면 읽기도 앞의 것",
    same(settings.readSkinThemeColors(original), { text: "#000000" }));
  const all = settings.writeSkinDday(settings.writeSkinHomePhotosLayout(next, "pair"), { enabled: true, date: "2025-01-01" });
  check("[preserve] 여러 설정을 차례로 써도 서로를 지우지 않는다",
    settings.readSkinHomePhotosLayout(all) === "pair" &&
    same(settings.readSkinThemeColors(all), { text: "#222222" }) &&
    same(settings.readSkinDday(all), { date: "2025-01-01", label: "" }) &&
    same(sides.readSkinSidesSetting(all), { left: false, right: true }));
}


/* ---------------------------------------------------------- */
console.log("\n[template] resolveSkinTemplate");

const templateApi = new Function(
  read("skin/skin-sides.js") + "\n" + read("skin/skin-settings.js") + "\n" + read("skin/skin-template.js") +
  "\nreturn { resolveSkinTemplate };"
)();

{
  const legacy = {
    templates: { home: { html: "<p>h</p>" }, category: { html: "<p>c</p>" } },
    css: "p{}",
    regions: [{ name: "future_widget" }]
  };

  const a = templateApi.resolveSkinTemplate(legacy, "home");

  check("[template] ★ 설정 항목이 없는 스킨은 settings 키조차 없다(봉투가 그대로)",
    !("settings" in a) && !("sides" in a) && same(Object.keys(a), ["html", "css", "js"]));

  const withSettings = {
    ...legacy,
    regions: [
      { name: "right_sidebar", enabled: true, mobile: false },
      { name: "theme_colors", colors: { accent: "#1F3A78" } },
      { name: "home_photos", layout: "hero" },
      { name: "dday", date: "2024-09-21", label: "since" }
    ]
  };

  const b = templateApi.resolveSkinTemplate(withSettings, "home");
  check("[template] regions → settings(정규화된 값)",
    same(b.settings, { colors: { accent: "#1f3a78" }, photos: "hero", dday: { date: "2024-09-21", label: "since" } }));
  check("[template] regions → sides(+ mobile)",
    same(b.sides, { left: false, right: true, mobile: { left: true, right: false } }));
  check("[template] 모든 화면에 같은 값",
    same(templateApi.resolveSkinTemplate(withSettings, "category").settings, b.settings));
  check("[template] 꺼진 D-day 는 싣지 않는다(다른 설정이 없으면 키도 없다)",
    !("settings" in templateApi.resolveSkinTemplate({ ...legacy, regions: [{ name: "dday", date: "2024-01-01", enabled: false }] }, "home")));
}


/* ---------------------------------------------------------- */
console.log("\n[protocol] sandbox 봉투");

const tpl = (extra) => ({ html: "<p>x</p>", css: "", ...extra });

check("[protocol] settings 없는 봉투 — 지금까지와 같다",
  protocol.isSandboxTemplate(tpl({})) && protocol.isSandboxTemplate(tpl({ sides: { left: true, right: false } })));

check("[protocol] settings — 알려진 모양만",
  protocol.isSandboxTemplate(tpl({ settings: { colors: { background: "#ffffff" }, photos: "pair", dday: { date: "2024-09-21", label: "since" } } })) &&
  protocol.isSandboxTemplate(tpl({ settings: { photos: "auto" } })));

check("[protocol] settings — 거부: 빈 객체 · 모르는 키 · 색 모양 · 구성 이름 · 날짜 모양 · 긴 이름",
  !protocol.isSandboxTemplate(tpl({ settings: {} })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { photos: "auto", css: "x" } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { colors: { background: "red" } } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { colors: { background: "#FFFFFF" } } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { colors: { background: "#ffffff;}x{" } } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { colors: { link: "#ffffff" } } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { photos: "grid" } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { dday: { date: "2024/09/21" } } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { dday: { date: "2024-09-21", label: "x".repeat(41) } } })) &&
  !protocol.isSandboxTemplate(tpl({ settings: { dday: { date: "2024-09-21", note: "x" } } })));

check("[protocol] sides.mobile — 두 boolean 만",
  protocol.isSandboxTemplate(tpl({ sides: { left: true, right: true, mobile: { left: false, right: true } } })) &&
  !protocol.isSandboxTemplate(tpl({ sides: { left: true, right: true, mobile: { left: false } } })) &&
  !protocol.isSandboxTemplate(tpl({ sides: { left: true, right: true, mobile: false } })) &&
  !protocol.isSandboxTemplate(tpl({ sides: { left: true, right: true, extra: 1 } })));

check("[protocol] 부모가 만드는 봉투(buildSkinSettingsRenderSetting)를 프로토콜이 받는다",
  protocol.isSandboxTemplate(tpl({
    settings: settings.buildSkinSettingsRenderSetting({ regions: [
      { name: "theme_colors", colors: editorial.IMORY_EDITORIAL_PALETTES.dark },
      { name: "home_photos", layout: "triptych" },
      { name: "dday", date: "2024-09-21", label: "since we met" }
    ] })
  })));


/* ---------------------------------------------------------- */
console.log("\n[skin] 아이모리 기본 스킨");

{
  const one = editorial.createImoryEditorialDefaultSkin({});
  const three = editorial.createImoryEditorialDefaultSkin({ columns: 3, appearance: "dark" });
  const two = editorial.createImoryEditorialDefaultSkin({ columns: 2 });

  check("[skin] 세 template · 공용 css · schemaVersion 1",
    one.schemaVersion === 1 && !!one.templates.home.html && !!one.templates.category.html && !!one.templates.post.html && typeof one.css === "string");
  check("[skin] 사진은 전부 이미지 슬롯(photo_1~4 + pair_photo + title_logo) · 이름 규칙",
    same(one.imageSlots.map((s) => s.name), ["photo_1", "photo_2", "photo_3", "photo_4", "pair_photo", "title_logo"]) &&
    one.imageSlots.every((s) => /^[a-z][a-z0-9_]{0,49}$/.test(s.name) && s.required === false));

  /* EDITORIAL-CUSTOMIZATION-1 — HOME 제목은 글자와 로고 두 벌이고,
     로고 슬롯이 비어 있으면 글자 제목이 선다(깨진 이미지가 아니라). */
  check("[skin] HOME 제목 로고 — 슬롯이 비면 글자 제목, 채우면 로고",
    /data-imory-if="images\.title_logo"/.test(one.templates.home.html) &&
    /data-imory-src="images\.title_logo"/.test(one.templates.home.html) &&
    /class="ied-title ied-title--text" data-imory-bind="site\.title"/.test(one.templates.home.html) &&
    /\.ied-title--logo:not\(\[hidden\]\) ~ \.ied-title--text \{ display: none; \}/.test(one.css) &&
    /object-fit: contain/.test(one.css));

  /* 카테고리 줄은 한 덩어리로 커지고 줄어든다 — 링크가 1em 이라
     줄(.ied-nav-list)의 글자 크기 하나가 다섯 항목을 함께 움직인다 */
  check("[skin] 카테고리 줄의 글자 크기는 줄이 갖는다(링크는 1em)",
    /\.ied-nav-list \{[^}]*font-size: 11\.5px;/.test(one.css) &&
    /\.ied-nav-link \{[^}]*font-size: 1em;/.test(one.css));
  check("[skin] 1 · 2 · 3단 → regions",
    same(sides.readSkinSidesSetting(one.regions), { left: false, right: false }) &&
    same(sides.readSkinSidesSetting(two.regions), { left: false, right: true }) &&
    same(sides.readSkinSidesSetting(three.regions), { left: true, right: true }));
  check("[skin] 밝은 분위기는 색 설정을 적지 않는다 · 어두운 분위기는 네 색",
    settings.readSkinThemeColors(one.regions) === null &&
    same(settings.readSkinThemeColors(three.regions), editorial.IMORY_EDITORIAL_PALETTES.dark));
  check("[skin] 사진 구성은 적지 않는다(자동)", settings.readSkinHomePhotosLayout(one.regions) === null);
  check("[skin] CSS 의 var() 기본값 = 밝은 팔레트",
    same(settings.readSkinThemeColorDefaults(one.css), editorial.IMORY_EDITORIAL_PALETTES.light));
  check("[skin] 포인트 2 까지 네 역할을 전부 읽는다",
    ["background", "text", "accent", "accent-2"].every((r) => one.css.includes(`var(--imory-color-${r},`)));
  check("[skin] metadata 에 문답의 답을 남기지 않는다",
    same(Object.keys(three.metadata).sort(), ["generatedBy", "supports"]) && three.metadata.generatedBy === editorial.IMORY_EDITORIAL_DEFAULT_ID);
  check("[skin] 문답 → 설정",
    same(editorial.imoryEditorialOptionsFromAnswers({ layoutPreference: "three-column", baseAppearance: "dark", homeStyle: "profile" }), { columns: 3, appearance: "dark" }) &&
    same(editorial.imoryEditorialOptionsFromAnswers({}), { columns: 1, appearance: "light" }) &&
    same(editorial.imoryEditorialOptionsFromAnswers({ layoutPreference: "two-column" }), { columns: 2, appearance: "light" }));
  check("[skin] 금색 포인트 없음 · 사진을 CSS 배경으로 숨기지 않는다",
    !/#(c9a|d4af|b8860b|daa520|ffd700)/i.test(one.css) && !/url\(/i.test(one.css));
  check("[skin] 시안의 고유 문구를 박지 않는다(FOREVER · HONG · MOON)",
    !/forever|jiwon|suyoung|old enemy/i.test(JSON.stringify(one)));
  check("[skin] WRITE · ADMIN 은 viewer 가드",
    /data-imory-if="viewer\.isOwner"/.test(one.templates.home.html) &&
    /data-imory-href="viewer\.writeHref"/.test(one.templates.home.html) &&
    /data-imory-href="viewer\.adminHref"/.test(one.templates.home.html));
  check("[skin] D-day 는 설정 바인딩 · 방문자 수 자리는 없다(데이터가 없다)",
    /data-imory-if="settings\.dday"/.test(one.templates.home.html) && !/visitor|daily_visit/i.test(one.templates.home.html));
  check("[skin] POST 에 본문 자리 · CATEGORY 에 목록/갤러리/페이지",
    /data-imory-region="post-body"/.test(one.templates.post.html) &&
    /category\.posts/.test(one.templates.category.html) &&
    /category\.gallery\.cards/.test(one.templates.category.html) &&
    /category\.pagination\.pages/.test(one.templates.category.html));
  check("[skin] 좌우 영역 틀 · 여는 버튼 · 닫기",
    sides.skinHtmlHasSidesFrame(one.templates.home.html).frame &&
    sides.skinHtmlHasSidesFrame(one.templates.home.html).left &&
    sides.skinHtmlHasSidesFrame(one.templates.home.html).right &&
    /data-imory-sides-open="left"/.test(one.templates.home.html) &&
    /data-imory-sides-close="right"/.test(one.templates.home.html));
  check("[skin] 좌우 영역 폭 변수는 틀 자신에(조상에 두면 플랫폼 기본값에 가려진다)",
    /\.ied-home \{[^}]*--imory-sides-main-min/.test(one.css) && !/\.ied \{[^}]*--imory-sides-/.test(one.css));
  check("[skin] vh 는 전부 px 상한이 있는 clamp() 안(sandbox 프레임)",
    (one.css.match(/[\d.]+vh/g) || []).length > 0 &&
    one.css.split("\n").filter((line) => /\dvh/.test(line)).every((line) => /clamp\(/.test(line)));
  check("[skin] Import 용 JSON 이 같은 함수의 결과",
    (() => {
      const json = JSON.parse(read("skin/test-skins/imory-editorial-default-v2.json"));
      const built = editorial.createImoryEditorialDefaultSkin({ columns: 3 });
      return json.css === built.css && same(json.templates, built.templates) && same(json.regions, built.regions) && same(json.imageSlots, built.imageSlots);
    })());

  const generator = new Function(read("skin/skin-generator.js") + "\nreturn generateInitialSkin;")();
  check("[skin] 예전 생성기는 그대로(대체만 됐다)",
    generator({ layoutPreference: "two-column" }).metadata.generatedBy === "deterministic-v1");
}


/* ---------------------------------------------------------- */
console.log("\n[docs] 진입 문서 · 렌더러 · AI");

const docs = [
  ["index.html", "./skin/skin-settings.js", "./skin/skin-sanitize.js"],
  ["studio/index.html", "../skin/skin-settings.js", "../skin/skin-sanitize.js"],
  ["studio/preview/preview-frame.html", "../../skin/skin-settings.js", "../../skin/skin-sanitize.js"],
  ["skin/sandbox/frame.html", "/skin/skin-settings.js", "/skin/skin-sanitize.js"],
  ["studio/studio-lifecycle-scenario.html", "../skin/skin-settings.js", "../skin/skin-sanitize.js"]
];

docs.forEach(([file, script, sanitize]) => {
  const text = read(file);
  const find = (s) => (text.indexOf(`"${s}"`) !== -1 ? text.indexOf(`"${s}"`) : text.indexOf(`src="${s}"`));
  const at = find(script);
  const sanitizeAt = find(sanitize);
  check(`[docs] ${file}: skin-settings.js 가 sanitize 보다 먼저`, at !== -1 && sanitizeAt !== -1 && at < sanitizeAt);
});

check("[docs] sandbox origin 이 skin-settings.js 를 내준다",
  read("core/lib/skin-sandbox-server.js").includes('"/skin/skin-settings.js"'));

check("[docs] Studio 가 기본 스킨 파일을 initializer 보다 먼저",
  read("studio/index.html").indexOf('"../skin/skin-default-editorial.js"') !== -1 &&
  read("studio/index.html").indexOf('"../skin/skin-default-editorial.js"') < read("studio/index.html").indexOf('"../skin/skin-initializer.js"'));

check("[docs] 첫 스킨 = 기본 스킨(예전 생성기는 폴백)",
  /createImoryEditorialDefaultSkin\(imoryEditorialOptionsFromAnswers\(answers\)\)/.test(read("skin/skin-initializer.js")) &&
  /generateInitialSkin\(answers\)/.test(read("skin/skin-initializer.js")));

check("[docs] 렌더러 — 색 규칙 · settings 바인딩 · 사진 구성(walk 뒤, 배치 앞)",
  (() => {
    const r = read("skin/skin-render.js");
    const photos = r.indexOf("compileSkinPhotos(root");
    const layout = r.indexOf("compileSkinLayoutTree(root)");
    const walk = r.indexOf("walkSkinTree(child, resolveTopLevel");
    return /buildSkinThemeColorsCss\(/.test(r) && /buildSkinSettingsContext\(/.test(r) &&
      walk !== -1 && photos > walk && layout > photos;
  })());

check("[docs] sandbox 부모 · Preview · 프레임이 settings 를 옮긴다",
  /payload\.settings\s*=/.test(read("skin/sandbox/skin-sandbox-host.js")) &&
  /template\.settings\s*=/.test(read("studio/preview/preview-sandbox.js")) &&
  /skin\.settings\s*=/.test(read("skin/sandbox/skin-sandbox-frame.js")));

check("[docs] 저장 경계가 사진 묶음 속성을 이 파일의 표에 묻는다",
  /isSkinPhotosAttributeName\(name\)/.test(read("skin/skin-sanitize.js")));

{
  const ai = read("functions/api/skin-ai.js");
  check("[ai] AI 지시문이 같은 계약을 말한다(사진 묶음 · 색 변수 · settings.dday · 설정은 주인 몫)",
    /data-imory-photos=\\?"set\\?"/.test(ai) && /data-imory-photos-item/.test(ai) &&
    /--imory-color-accent-2/.test(ai) && /settings\.dday/.test(ai) && /home_photos/.test(ai));
}


console.log(`\n${passed} passed, ${failed} failed`);

if (failed) {
  failures.forEach((name) => console.log(`  - ${name}`));
  process.exitCode = 1;
}
