/* =========================================================
   SKIN SIDES — 단위 테스트 (EDITORIAL-RESPONSIVE-HOME-1)

   기준 문서: IMORY_SIDES_DESIGN.md

   브라우저 없이 판정할 수 있는 것:

     [regions]   SkinPackage.regions 읽기/쓰기 — 보존 · 중복 · 1/2/3
     [template]  resolveSkinTemplate 가 regions 를 sides 로 싣는가,
                 영역 설정이 없는 스킨은 키조차 없는가(기존 스킨 회귀)
     [sanitize]  저장 경계의 값 표 — 런타임 상태는 저장되지 않는다
     [markup]    skinHtmlHasSidesFrame
     [protocol]  sandbox 봉투의 sides 칸과 SIDES_* 세 메시지
     [css]       skin-sides.css ↔ skin-sides.js 의 속성 이름 양방향 대조
     [docs]      진입 문서 로드 순서(sanitize 보다 먼저) · sandbox allowlist
     [ai]        AI 지시문이 같은 계약을 말하는가
     [skin]      예시 스킨: 미디어 쿼리 없음 · :has() 없음 · 세 칸 · regions

   실제 칼럼/패널 · 포커스 · 스크롤 잠금은 skin/skin-sides-e2e-test.mjs.

   실행:  node skin/skin-sides-test.mjs
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const require = createRequire(import.meta.url);

const sides = require(path.join(HERE, "skin-sides.js"));
const protocol = require(path.join(HERE, "sandbox", "skin-sandbox-protocol.js"));

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
console.log("\n[regions] SkinPackage.regions");

check("[regions] 기존 스킨 regions:[] 는 설정 없음(null)",
  sides.readSkinSidesSetting([]) === null &&
  sides.readSkinSidesSetting(undefined) === null &&
  sides.readSkinSidesSetting("x") === null &&
  sides.readSkinSidesSetting([{ name: "other" }, null, 3]) === null);

check("[regions] 항목이 있으면 enabled:false 가 아닌 한 켜짐",
  same(sides.readSkinSidesSetting([{ name: "right_sidebar" }]), { left: false, right: true }) &&
  same(sides.readSkinSidesSetting([{ name: "left_sidebar", enabled: true }, { name: "right_sidebar", enabled: false }]), { left: true, right: false }));

check("[regions] 같은 이름이 둘이면 앞의 것",
  same(sides.readSkinSidesSetting([{ name: "left_sidebar", enabled: false }, { name: "left_sidebar", enabled: true }]), { left: false, right: false }));

check("[regions] 1 · 2 · 3 ↔ 설정",
  same(sides.skinSidesSettingForCount(1), { left: false, right: false }) &&
  same(sides.skinSidesSettingForCount(2), { left: false, right: true }) &&
  same(sides.skinSidesSettingForCount(3), { left: true, right: true }) &&
  sides.skinSidesCount({ left: true, right: true }) === 3 &&
  sides.skinSidesCount({ left: false, right: true }) === 2 &&
  sides.skinSidesCount(null) === 1);

{
  const original = [
    { name: "future_region", config: { a: 1 } },
    { name: "right_sidebar", enabled: false, items: ["recent", "about"] }
  ];
  const frozen = JSON.stringify(original);
  const next = sides.writeSkinSidesSetting(original, { left: true, right: true });

  check("[regions] 쓰기는 원본을 바꾸지 않는다", JSON.stringify(original) === frozen);
  check("[regions] 모르는 항목은 자리 그대로 보존", same(next[0], original[0]));
  check("[regions] 영역 항목은 지우지 않고 enabled 만 — 다른 칸도 보존",
    same(next[1], { name: "right_sidebar", enabled: true, items: ["recent", "about"] }));
  check("[regions] 없던 쪽은 끝에 더한다", same(next[2], { name: "left_sidebar", enabled: true }));

  const off = sides.writeSkinSidesSetting(next, { left: false, right: false });
  check("[regions] 끄면 항목은 남고 enabled:false(다시 켤 때 같은 자리)",
    off.length === 3 && off[1].enabled === false && off[2].enabled === false && same(off[1].items, ["recent", "about"]));
  check("[regions] 왕복 — 쓴 것을 다시 읽으면 같은 설정",
    same(sides.readSkinSidesSetting(sides.writeSkinSidesSetting([], { left: false, right: true })), { left: false, right: true }));

  const dup = sides.writeSkinSidesSetting([{ name: "left_sidebar" }, { name: "left_sidebar" }], { left: true, right: false });
  check("[regions] 중복 이름은 쓰면서 하나로", dup.filter((e) => e.name === "left_sidebar").length === 1);
}

check("[regions] 봉투 값 강제 — 모양이 틀리면 둘 다 꺼짐",
  same(sides.coerceSkinSidesRenderSetting({ left: "yes", right: 1 }), { left: false, right: false }) &&
  same(sides.coerceSkinSidesRenderSetting(null), { left: false, right: false }) &&
  same(sides.coerceSkinSidesRenderSetting({ left: true, right: true }), { left: true, right: true }));


/* ---------------------------------------------------------- */
console.log("\n[template] resolveSkinTemplate");

const templateApi = new Function(
  read("skin/skin-sides.js") + "\n" + read("skin/skin-template.js") +
  "\nreturn { resolveSkinTemplate };"
)();

{
  const legacy = { html: "<p>x</p>", css: "", regions: [] };
  const legacyTemplates = {
    templates: { home: { html: "<p>h</p>" }, category: { html: "<p>c</p>" } },
    css: "p{}",
    regions: []
  };

  const a = templateApi.resolveSkinTemplate(legacy, "home");
  const b = templateApi.resolveSkinTemplate(legacyTemplates, "category");

  check("[template] ★ 영역 설정이 없는 스킨은 sides 키조차 없다(봉투가 그대로)",
    !("sides" in a) && !("sides" in b));

  const withSides = { ...legacyTemplates, regions: [{ name: "right_sidebar", enabled: true }] };

  check("[template] regions → sides",
    same(templateApi.resolveSkinTemplate(withSides, "home").sides, { left: false, right: true }));

  check("[template] 모든 화면에 같은 값(스킨 한 벌에 하나)",
    same(templateApi.resolveSkinTemplate(withSides, "category").sides, { left: false, right: true }));

  check("[template] html/css/js 는 그대로",
    templateApi.resolveSkinTemplate(withSides, "home").html === "<p>h</p>" &&
    templateApi.resolveSkinTemplate(withSides, "home").css === "p{}");
}


/* ---------------------------------------------------------- */
console.log("\n[sanitize] 저장 경계");

check("[sanitize] 계약 네 속성만 이름으로 인정",
  ["data-imory-sides", "data-imory-sides-area", "data-imory-sides-open", "data-imory-sides-close"]
    .every(sides.isSkinSidesAttributeName) &&
  ["data-imory-sides-layout", "data-imory-sides-on", "data-imory-sides-state", "data-imory-sides-active",
   "data-imory-sides-phase", "data-imory-sides-count", "data-imory-sides-backdrop", "data-imory-sides-probe",
   "data-imory-sides-fallback", "data-imory-sides-instant"]
    .every((name) => !sides.isSkinSidesAttributeName(name)));

check("[sanitize] 값 표",
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides", "frame") === "frame" &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides", " FRAME ") === "frame" &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides", "grid") === null &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides-area", "main") === "main" &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides-area", "top") === null &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides-open", "right") === "right" &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides-open", "main") === null &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides-close", "") === "" &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides-close", "left") === "left" &&
  sides.sanitizeSkinSidesAttributeValue("data-imory-sides-close", "javascript:x") === null);

check("[sanitize] skin-sanitize.js 가 이 표에 묻는다(표를 복사하지 않는다)",
  /isSkinSidesAttributeName\(name\)/.test(read("skin/skin-sanitize.js")) &&
  /sanitizeSkinSidesAttributeValue\(name, value\)/.test(read("skin/skin-sanitize.js")));


/* ---------------------------------------------------------- */
console.log("\n[markup] 틀 감지");

check("[markup] 세 칸 모두",
  same(sides.skinHtmlHasSidesFrame('<div data-imory-sides="frame"><aside data-imory-sides-area="left"></aside><main data-imory-sides-area="main"></main><aside data-imory-sides-area="right"></aside></div>'),
    { frame: true, left: true, right: true }));

check("[markup] 틀 없음 · 오른쪽만",
  same(sides.skinHtmlHasSidesFrame("<div></div>"), { frame: false, left: false, right: false }) &&
  same(sides.skinHtmlHasSidesFrame('<div data-imory-sides="frame"><main data-imory-sides-area="main"></main><aside data-imory-sides-area="right"></aside></div>'),
    { frame: true, left: false, right: true }));


/* ---------------------------------------------------------- */
console.log("\n[protocol] sandbox 봉투");

const baseTemplate = { html: "<p>x</p>", css: "" };

check("[protocol] sides 없는 봉투(기존) 통과", protocol.isSandboxTemplate(baseTemplate) === true);
check("[protocol] sides {left,right} 참/거짓 통과",
  protocol.isSandboxTemplate({ ...baseTemplate, sides: { left: true, right: false } }) === true);
check("[protocol] sides 모양이 틀리면 봉투 전체 거부",
  [
    { left: 1, right: true },
    { left: true },
    { left: true, right: true, extra: true },
    [true, true],
    "both",
    null
  ].every((value) => protocol.isSandboxTemplate({ ...baseTemplate, sides: value }) === false));

const T = protocol.SANDBOX_MESSAGE_TYPES;
const SPEC = protocol.SANDBOX_MESSAGE_SPEC;

check("[protocol] 세 메시지와 방향",
  T.SIDES_STATE === "IMORY_SIDES_STATE" && SPEC[T.SIDES_STATE].direction === "to-parent" &&
  T.SIDES_VIEWPORT === "IMORY_SIDES_VIEWPORT" && SPEC[T.SIDES_VIEWPORT].direction === "to-frame" &&
  T.SIDES_CLOSE === "IMORY_SIDES_CLOSE" && SPEC[T.SIDES_CLOSE].direction === "to-frame");

check("[protocol] SIDES_STATE 는 참/거짓 하나",
  SPEC[T.SIDES_STATE].check({ renderSeq: 1, open: true }) === true &&
  SPEC[T.SIDES_STATE].check({ renderSeq: 1, open: "yes" }) === false);

check("[protocol] SIDES_VIEWPORT 는 범위 안 정수 둘",
  SPEC[T.SIDES_VIEWPORT].check({ renderSeq: 2, top: 0, height: 844 }) === true &&
  SPEC[T.SIDES_VIEWPORT].check({ renderSeq: 2, top: -1, height: 844 }) === false &&
  SPEC[T.SIDES_VIEWPORT].check({ renderSeq: 2, top: 1.5, height: 844 }) === false &&
  SPEC[T.SIDES_VIEWPORT].check({ renderSeq: 2, top: 0, height: 1e9 }) === false);

{
  const msg = protocol.buildSandboxMessage(T.SIDES_VIEWPORT, { renderSeq: 3, top: 10, height: 700, css: "x" }, 1);
  check("[protocol] 봉투는 알려진 키만 싣는다", same(Object.keys(msg.payload).sort(), ["contract", "height", "renderSeq", "top"]));
}


/* ---------------------------------------------------------- */
console.log("\n[css] skin-sides.css ↔ skin-sides.js");

const css = read("skin/skin-sides.css");
const js = read("skin/skin-sides.js");

const cssAttrs = new Set(css.match(/data-imory-sides(?:-[a-z]+)?/g));
const runtimeAttrs = [
  sides.SKIN_SIDES_RUNTIME_LAYOUT, sides.SKIN_SIDES_RUNTIME_ON,
  sides.SKIN_SIDES_RUNTIME_PHASE, sides.SKIN_SIDES_RUNTIME_STATE, sides.SKIN_SIDES_RUNTIME_INSTANT,
  sides.SKIN_SIDES_BACKDROP_ATTR, sides.SKIN_SIDES_PROBE_ATTR, sides.SKIN_SIDES_FALLBACK_ATTR
];
/* count · active 는 스킨 CSS 가 읽으라고 내는 값이다(플랫폼 CSS 는 안 읽는다) */
const knownAttrs = new Set([
  ...Object.keys(sides.SKIN_SIDES_ATTRIBUTE_RULES),
  ...runtimeAttrs,
  sides.SKIN_SIDES_RUNTIME_COUNT,
  sides.SKIN_SIDES_RUNTIME_ACTIVE
]);

check("[css] CSS 가 읽는 속성은 전부 JS 가 쓰는 이름",
  [...cssAttrs].every((name) => knownAttrs.has(name)),
  [...cssAttrs].filter((name) => !knownAttrs.has(name)).join(", "));

check("[css] JS 가 쓰는 런타임 속성은 전부 CSS 가 읽는다(count · active 는 스킨용)",
  runtimeAttrs.every((name) => cssAttrs.has(name)),
  runtimeAttrs.filter((name) => !cssAttrs.has(name)).join(", "));

const cssVars = new Set(css.match(/--imory-sides-[a-z-]+/g));
check("[css] 프레임/부모가 쓰는 보이는 부분 변수를 CSS 가 읽는다",
  cssVars.has("--imory-sides-viewport-top") && cssVars.has("--imory-sides-viewport-height") &&
  /--imory-sides-viewport-top/.test(js) && /--imory-sides-viewport-height/.test(js));

check("[css] 색·그림자·글꼴 선언이 없다(덮개 기본색 하나만)",
  !/(^|[;{\s])(color|box-shadow|font-family|border-color|border-radius)\s*:/m.test(
    css.replace(/color: inherit;/g, "")
  ));

check("[css] 칸 판정 기본값: 2단 824px · 3단 1088px",
  /--imory-sides-width: 264px/.test(css) && /--imory-sides-main-min: 560px/.test(css));


/* ---------------------------------------------------------- */
console.log("\n[docs] 진입 문서 · sandbox allowlist");

const docs = [
  ["index.html", "./skin/skin-sides.js", "./skin/skin-sanitize.js", "./skin/skin-sides.css"],
  ["studio/index.html", "../skin/skin-sides.js", "../skin/skin-sanitize.js", null],
  ["studio/preview/preview-frame.html", "../../skin/skin-sides.js", "../../skin/skin-sanitize.js", "../../skin/skin-sides.css"],
  ["skin/sandbox/frame.html", "/skin/skin-sides.js", "/skin/skin-sanitize.js", "/skin/skin-sides.css"],
  ["studio/studio-lifecycle-scenario.html", "../skin/skin-sides.js", "../skin/skin-sanitize.js", null]
];

docs.forEach(([file, script, sanitize, stylesheet]) => {
  const text = read(file);
  const at = text.indexOf(`"${script}"`) !== -1 ? text.indexOf(`"${script}"`) : text.indexOf(`src="${script}"`);
  const sanitizeAt = text.indexOf(`"${sanitize}"`) !== -1 ? text.indexOf(`"${sanitize}"`) : text.indexOf(`src="${sanitize}"`);
  check(`[docs] ${file}: skin-sides.js 가 sanitize 보다 먼저`, at !== -1 && sanitizeAt !== -1 && at < sanitizeAt);
  if (stylesheet) {
    check(`[docs] ${file}: skin-sides.css 를 미리 건다`, text.includes(`"${stylesheet}"`));
  }
});

const server = read("core/lib/skin-sandbox-server.js");
check("[docs] sandbox origin 이 두 파일을 내준다",
  server.includes('"/skin/skin-sides.js"') && server.includes('"/skin/skin-sides.css"'));

check("[docs] 렌더러가 스스로도 건다(진입 문서가 없는 하네스)",
  /skin-sides\.css/.test(read("skin/skin-render.js")) &&
  /disposeSkinSides\(container\)/.test(read("skin/skin-render.js")) &&
  /compileSkinSides\(root/.test(read("skin/skin-render.js")));

check("[docs] sandbox Preview 가 sides 를 옮긴다(js 와 같은 자리)",
  /template\.sides\s*=/.test(read("studio/preview/preview-sandbox.js")) &&
  /payload\.sides\s*=/.test(read("skin/sandbox/skin-sandbox-host.js")) &&
  /skin\.sides\s*=/.test(read("skin/sandbox/skin-sandbox-frame.js")));


/* ---------------------------------------------------------- */
console.log("\n[ai] AI 지시문");

const ai = read("functions/api/skin-ai.js");
check("[ai] 틀 · 세 칸 · 여는 것 · 닫기 이름",
  ["data-imory-sides=\\\"frame\\\"", "data-imory-sides-area", "data-imory-sides-open", "data-imory-sides-close"]
    .every((token) => ai.includes(token)));
check("[ai] 설정(regions)은 AI 가 바꾸지 않는다고 말한다", /SkinPackage\.regions — you never change it/.test(ai));
check("[ai] 스킨이 바꾸는 변수 이름이 CSS 와 같다",
  ["--imory-sides-left-width", "--imory-sides-right-width", "--imory-sides-main-min", "--imory-sides-main-max",
   "--imory-sides-drawer-width", "--imory-sides-distance", "--imory-sides-duration", "--imory-sides-easing",
   "--imory-sides-backdrop"].every((name) => ai.includes(name) && css.includes(name)));


/* ---------------------------------------------------------- */
console.log("\n[skin] 예시 스킨");

const skin = JSON.parse(read("skin/test-skins/imory-editorial-home-v1.json"));
const home = skin.templates.home.html;

check("[skin] 틀 하나 · 세 칸 · 여는 것 둘 · 닫기 둘",
  (home.match(/data-imory-sides="frame"/g) || []).length === 1 &&
  ["left", "main", "right"].every((area) => home.includes(`data-imory-sides-area="${area}"`)) &&
  home.includes('data-imory-sides-open="left"') && home.includes('data-imory-sides-open="right"') &&
  (home.match(/data-imory-sides-close=/g) || []).length === 2);

check("[skin] 여는 것에 이름이 있다(기호만 두지 않는다)",
  /data-imory-sides-open="left" aria-label="[^"]+"/.test(home) && /data-imory-sides-open="right" aria-label="[^"]+"/.test(home));

check("[skin] ★ 미디어 쿼리 없음(칼럼/패널 전환은 플랫폼이 한다)", !/@media/.test(skin.css));
check("[skin] ★ :has() 없음(스코프가 깨뜨린다 — 기준 문서 남은 차이)", !/:has\(/.test(skin.css));
check("[skin] 의미 색 변수 여섯", ["--skin-background", "--skin-surface", "--skin-text", "--skin-muted", "--skin-accent", "--skin-line"]
  .every((name) => skin.css.includes(`${name}:`)));
check("[skin] vh 는 전부 px 상한이 있는 clamp 안(프레임 높이 되먹임 방지) 또는 min-height",
  (skin.css.match(/[^;{]*\d+vh[^;]*/g) || []).every((decl) => /clamp\([^)]*px\)|min-height:\s*100vh/.test(decl)));
check("[skin] regions = 3단", same(sides.readSkinSidesSetting(skin.regions), { left: true, right: true }));
check("[skin] 대표 사진 슬롯 cover", skin.imageSlots.some((slot) => slot.name === "cover") && home.includes('data-imory-src="images.cover"'));


console.log(`\n${passed} passed, ${failed} failed`);

if (failed) {
  console.log("실패:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
