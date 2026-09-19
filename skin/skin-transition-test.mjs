/* =========================================================
   TRANSITION-1 단위 테스트 — 브라우저 없이

     node skin/skin-transition-test.mjs

   보는 것은 skin/skin-transition.js 의 **판정과 계산**이다.

     1) 저장 경계가 무엇을 받아들이고, 무엇을 자르고, 무엇을 버리는가
     2) 문자열/객체 선언이 네 칸짜리 확정값으로 어떻게 펴지는가
     3) 여섯 종류 × 네 방향이 어떤 "나타날 때의 자세"가 되는가
     4) 컴파일러가 쓰는 custom property 와 skin-transition.css 가
        읽는 이름이 **실제로** 맞는가(두 파일을 읽어 대조)
     5) 같은 값 목록이 Pages Function(skin-ai.js)에도 그대로 있는가
     6) Bottom Dock 의 transition 이 같은 정규화를 지나는가
     7) 모든 진입 문서와 sandbox origin 이 두 파일을 싣는가

   DOM 이 필요한 것(재생 · 빠른 반복 · 클릭 차단 · 모바일 넘침)은
   skin/skin-transition-e2e-test.mjs 의 몫이다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here =
  path.dirname(fileURLToPath(import.meta.url));

const root =
  path.resolve(here, "..");

const require =
  createRequire(import.meta.url);

const tr =
  require(path.join(here, "skin-transition.js"));

const {
  SKIN_TRANSITION_TYPES,
  SKIN_TRANSITION_DIRECTIONS,
  SKIN_TRANSITION_EASINGS,
  SKIN_TRANSITION_DURATION_MIN,
  SKIN_TRANSITION_DURATION_MAX,
  SKIN_TRANSITION_DEFAULTS,
  isSkinTransitionAttributeName,
  sanitizeSkinTransitionAttributeValue,
  isValidSkinTransitionAttributeValue,
  normalizeSkinTransition,
  validateSkinTransitionInput,
  buildSkinTransitionPose,
  buildSkinTransitionProperties,
  buildSkinTransitionKeyframes,
  isSkinTransitionHorizontal,
  readSkinTransitionSpec
} = tr;


let passed = 0;
let failed = 0;

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

const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");


/* =========================================================
   1. 값 목록
========================================================== */

section("contract");

check(
  "종류 여섯",
  JSON.stringify(SKIN_TRANSITION_TYPES) ===
    JSON.stringify(["none", "fade", "slide", "scale", "fade-slide", "fade-scale"]),
  JSON.stringify(SKIN_TRANSITION_TYPES)
);

check(
  "방향 넷",
  JSON.stringify(SKIN_TRANSITION_DIRECTIONS) === JSON.stringify(["up", "down", "left", "right"])
);

check(
  "기본값 — fade · 200ms · ease · up",
  JSON.stringify(SKIN_TRANSITION_DEFAULTS) ===
    JSON.stringify({ type: "fade", duration: 200, easing: "ease", direction: "up" })
);


/* =========================================================
   2. 저장 경계 — 받는 것 · 자르는 것 · 버리는 것
========================================================== */

section("sanitize");

const A = "data-imory-transition";

SKIN_TRANSITION_TYPES.forEach((type) => {
  check(`type ${type} 통과`, sanitizeSkinTransitionAttributeValue(A, type) === type);
});

[["bounce", null], ["FADE", null], ["fade;", null], ["", null]].forEach(([value]) => {
  check(`모르는 type "${value}" 는 버린다`, sanitizeSkinTransitionAttributeValue(A, value) === null);
});

[
  ["200", "200"],
  ["80", "80"],
  ["1000", "1000"],
  ["5000", "1000"],
  ["10", "80"],
  ["0", "80"],
  ["999999", "1000"]
].forEach(([input, stored]) => {
  check(
    `duration "${input}" -> "${stored}" (범위 밖은 자른다)`,
    sanitizeSkinTransitionAttributeValue(A + "-duration", input) === stored,
    String(sanitizeSkinTransitionAttributeValue(A + "-duration", input))
  );
});

["200ms", "-5", "1e3", "2.5", "calc(1s)", "0x10", " "].forEach((input) => {
  check(
    `duration "${input}" 는 숫자 모양이 아니라 버린다`,
    sanitizeSkinTransitionAttributeValue(A + "-duration", input) === null
  );
});

SKIN_TRANSITION_EASINGS.forEach((easing) => {
  check(`easing ${easing} 통과`, sanitizeSkinTransitionAttributeValue(A + "-easing", easing) === easing);
});

check(
  "easing 에 임의 cubic-bezier 는 들어갈 수 없다(값이 CSS 로 곧장 가지 않는다)",
  sanitizeSkinTransitionAttributeValue(A + "-easing", "cubic-bezier(0,0,1,1)") === null
);

SKIN_TRANSITION_DIRECTIONS.forEach((direction) => {
  check(`direction ${direction} 통과`, sanitizeSkinTransitionAttributeValue(A + "-direction", direction) === direction);
});

check("direction diagonal 은 버린다", sanitizeSkinTransitionAttributeValue(A + "-direction", "up-left") === null);

check(
  "★ 런타임 상태 속성은 계약에 없다(저장되는 HTML 에 들어갈 수 없다)",
  !isSkinTransitionAttributeName("data-imory-transition-state") &&
  !isSkinTransitionAttributeName("data-imory-transition-clip")
);

check(
  "패널/토글 이름 — 소문자로 시작하는 32자 이하",
  sanitizeSkinTransitionAttributeValue("data-imory-panel", "menu") === "menu" &&
  sanitizeSkinTransitionAttributeValue("data-imory-toggle", "pair-2") === "pair-2" &&
  sanitizeSkinTransitionAttributeValue("data-imory-panel", "Menu") === null &&
  sanitizeSkinTransitionAttributeValue("data-imory-panel", 'a"]') === null &&
  sanitizeSkinTransitionAttributeValue("data-imory-panel", "a".repeat(33)) === null
);

check(
  "isValid 는 '저장 값이 입력과 같은가'다 — 잘리는 값은 false",
  isValidSkinTransitionAttributeValue(A + "-duration", "300") &&
  !isValidSkinTransitionAttributeValue(A + "-duration", "3000")
);


/* =========================================================
   3. 정규화
========================================================== */

section("normalize");

check(
  "문자열 한 개는 그 type + 기본값",
  JSON.stringify(normalizeSkinTransition("slide")) ===
    JSON.stringify({ type: "slide", duration: 200, easing: "ease", direction: "up" })
);

check(
  "객체의 모르는 칸은 기본값으로(관대한 문)",
  JSON.stringify(normalizeSkinTransition({ type: "wobble", duration: "x", easing: "springy", direction: "sideways" })) ===
    JSON.stringify({ type: "fade", duration: 200, easing: "ease", direction: "up" })
);

check(
  "관대한 문도 duration 은 자른다",
  normalizeSkinTransition({ type: "fade", duration: 5000 }).duration === SKIN_TRANSITION_DURATION_MAX &&
  normalizeSkinTransition({ type: "fade", duration: 1 }).duration === SKIN_TRANSITION_DURATION_MIN
);

check(
  "결과는 알려진 네 키만 가진다",
  Object.keys(normalizeSkinTransition({ type: "fade", __proto__x: 1, extra: 2 })).join(",") === "type,duration,easing,direction"
);

const strictBad = [
  ["bounce", "모르는 type 문자열"],
  [{ type: "bounce" }, "모르는 type"],
  [{ type: "fade", easing: "springy" }, "모르는 easing"],
  [{ type: "fade", direction: "diagonal" }, "모르는 direction"],
  [{ type: "fade", duration: "200" }, "숫자가 아닌 duration"],
  [42, "숫자"],
  [["fade"], "배열"]
];

strictBad.forEach(([value, label]) => {
  const r = validateSkinTransitionInput(value, "t");
  check(`엄격한 문은 ${label} 을 거부하고 이유를 준다`, r.ok === false && typeof r.message === "string");
});

const strictClamp = validateSkinTransitionInput({ type: "fade-slide", duration: 9000, easing: "smooth", direction: "left" });

check(
  "엄격한 문도 duration 은 거부하지 않고 자른다",
  strictClamp.ok && strictClamp.transition.duration === 1000 && strictClamp.transition.direction === "left",
  JSON.stringify(strictClamp)
);

check(
  "엄격한 문 — 없음(null)은 기본값",
  validateSkinTransitionInput(null).ok && validateSkinTransitionInput(null).transition.type === "fade"
);


/* =========================================================
   4. 여섯 종류 × 네 방향 — 나타날 때의 자세
========================================================== */

section("pose");

check("none 은 자세가 없다(움직이지 않는다)", buildSkinTransitionPose(normalizeSkinTransition("none")) === null);
check("none 은 custom property 도 없다", Object.keys(buildSkinTransitionProperties(normalizeSkinTransition("none"))).length === 0);
check("none 은 키프레임도 없다", buildSkinTransitionKeyframes(normalizeSkinTransition("none")) === null);

const expectTranslate = {
  up: "0px 12px",
  down: "0px -12px",
  left: "12px 0px",
  right: "-12px 0px"
};

const expectOrigin = {
  up: "50% 100%",
  down: "50% 0%",
  left: "100% 50%",
  right: "0% 50%"
};

["fade", "slide", "scale", "fade-slide", "fade-scale"].forEach((type) => {

  SKIN_TRANSITION_DIRECTIONS.forEach((direction) => {

    const spec = normalizeSkinTransition({ type, direction });
    const pose = buildSkinTransitionPose(spec);

    const fades = type.startsWith("fade");
    const slides = type === "slide" || type === "fade-slide";
    const scales = type === "scale" || type === "fade-scale";

    check(
      `${type}/${direction} — opacity ${fades ? 0 : 1}`,
      pose.opacity === (fades ? 0 : 1)
    );

    check(
      `${type}/${direction} — translate ${slides ? expectTranslate[direction] : "없음"}`,
      pose.translate === (slides ? expectTranslate[direction] : "0px 0px"),
      pose.translate
    );

    check(
      `${type}/${direction} — scale ${scales ? 0.92 : 1}`,
      pose.scale === (scales ? 0.92 : 1)
    );

    const frames = buildSkinTransitionKeyframes(spec);

    check(
      `${type}/${direction} — 키프레임은 바뀌는 속성만 적는다`,
      ("opacity" in frames[0]) === fades &&
      ("translate" in frames[0]) === slides &&
      ("scale" in frames[0]) === scales &&
      !("transform" in frames[0]),
      JSON.stringify(frames)
    );

    if (scales) {
      check(
        `${type}/${direction} — 반대편 가장자리에서 자란다(${expectOrigin[direction]})`,
        frames[0].transformOrigin === expectOrigin[direction] &&
        frames[1].transformOrigin === expectOrigin[direction]
      );
    }

    check(
      `${type}/${direction} — 가로 넘침 방지가 필요한가`,
      isSkinTransitionHorizontal(spec) === (slides && (direction === "left" || direction === "right"))
    );

  });

});

check(
  "★ slide 는 transform 이 아니라 translate 속성으로 움직인다(free 배치의 transform 과 공존)",
  JSON.stringify(buildSkinTransitionKeyframes(normalizeSkinTransition("slide"))).indexOf("transform\"") === -1
);

const props = buildSkinTransitionProperties(
  normalizeSkinTransition({ type: "fade-slide", duration: 320, easing: "smooth", direction: "left" })
);

check(
  "custom property — 속도는 ms, 곡선은 이름이 아니라 실제 timing function",
  props["--imory-tr-duration"] === "320ms" &&
  props["--imory-tr-easing"] === "cubic-bezier(0.22, 1, 0.36, 1)" &&
  props["--imory-tr-opacity"] === "0" &&
  props["--imory-tr-translate"] === "12px 0px",
  JSON.stringify(props)
);


/* =========================================================
   5. DOM 흉내로 읽기 — 속성 → 확정값
========================================================== */

section("read");

function fakeEl(attrs) {
  return {
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs
  };
}

check(
  "속성 넷이 한 벌로 읽힌다",
  JSON.stringify(readSkinTransitionSpec(fakeEl({
    "data-imory-transition": "fade-scale",
    "data-imory-transition-duration": "400",
    "data-imory-transition-easing": "ease-out",
    "data-imory-transition-direction": "down"
  }))) === JSON.stringify({ type: "fade-scale", duration: 400, easing: "ease-out", direction: "down" })
);

check(
  "type 이 없으면 선언이 없다(속도만 적힌 요소)",
  readSkinTransitionSpec(fakeEl({ "data-imory-transition-duration": "400" })) === null
);


/* =========================================================
   6. 두 파일 대조 — 컴파일러가 쓰는 이름 ↔ 스타일시트가 읽는 이름
========================================================== */

section("stylesheet");

const css = read("skin/skin-transition.css");
const js = read("skin/skin-transition.js");

const written =
  new Set(Object.keys(buildSkinTransitionProperties(normalizeSkinTransition({ type: "fade-scale" }))));

const readByCss =
  new Set((css.match(/var\((--imory-tr-[a-z-]+)/g) || []).map((m) => m.slice(4)));

written.forEach((name) => {
  check(`컴파일러가 쓰는 ${name} 를 스타일시트가 읽는다`, readByCss.has(name));
});

readByCss.forEach((name) => {
  check(`스타일시트가 읽는 ${name} 를 컴파일러가 쓴다`, written.has(name));
});

check("appear 키프레임이 있다", /@keyframes\s+imory-transition-in\b/.test(css));

["appear", "hiding", "hidden"].forEach((state) => {
  check(
    `상태 ${state} 규칙이 있다`,
    css.indexOf(`[data-imory-transition-state="${state}"]`) !== -1
  );
  check(
    `JS 가 상태 ${state} 를 실제로 찍는다`,
    js.indexOf(`"${state}"`) !== -1
  );
});

check(
  "★ hidden 은 !important 로 레이아웃에서 빠진다(스킨의 display 규칙이 이기지 못한다)",
  /\[data-imory-transition-state="hidden"\]\s*\{\s*display:\s*none\s*!important/.test(css)
);

check(
  "★ hiding 동안 클릭을 가로채지 않는다",
  /\[data-imory-transition-state="hiding"\]\s*\{\s*pointer-events:\s*none\s*!important/.test(css)
);

check(
  "prefers-reduced-motion 에서 appear 를 끈다",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*appear[\s\S]*animation:\s*none/.test(css)
);

check(
  "가로 넘침 방지는 clip 이다(스크롤 컨테이너를 만들지 않는다 — sticky 유지)",
  /\[data-imory-transition-clip\]\s*\{\s*overflow-x:\s*clip/.test(css)
);

check(
  "★ 스타일시트에 transform 선언이 없다(스킨/배치의 transform 을 덮지 않는다)",
  !/(^|[;{\s])transform\s*:/.test(css)
);

check(
  "스타일시트에 색·그림자·글꼴이 없다(움직임만)",
  !/(^|[;{\s])(color|background|box-shadow|font|border)\s*:/.test(css)
);


/* =========================================================
   7. Pages Function 이 같은 값 목록을 쓰는가
========================================================== */

section("server");

const ai = read("functions/api/skin-ai.js");

function arrayConst(source, name) {
  const m = new RegExp(`const ${name} =\\s*\\[([^\\]]*)\\]`).exec(source);
  return m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : null;
}

function numberConst(source, name) {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(source);
  return m ? Number(m[1]) : null;
}

check(
  "종류 목록이 같다",
  JSON.stringify(arrayConst(ai, "SKIN_AI_DOCK_TRANSITIONS")) === JSON.stringify(SKIN_TRANSITION_TYPES)
);

check(
  "방향 목록이 같다",
  JSON.stringify(arrayConst(ai, "SKIN_AI_TRANSITION_DIRECTIONS")) === JSON.stringify(SKIN_TRANSITION_DIRECTIONS)
);

check(
  "곡선 목록이 같다",
  JSON.stringify(arrayConst(ai, "SKIN_AI_TRANSITION_EASINGS")) === JSON.stringify(SKIN_TRANSITION_EASINGS)
);

check(
  "속도 범위가 같다",
  numberConst(ai, "SKIN_AI_TRANSITION_DURATION_MIN") === SKIN_TRANSITION_DURATION_MIN &&
  numberConst(ai, "SKIN_AI_TRANSITION_DURATION_MAX") === SKIN_TRANSITION_DURATION_MAX &&
  numberConst(ai, "SKIN_AI_TRANSITION_DURATION_DEFAULT") === SKIN_TRANSITION_DEFAULTS.duration
);

check(
  "선택 요소 capability 허용 목록에 transition 이 있다(없으면 선택 요청이 통째로 거부된다)",
  /SKIN_AI_SELECTION_CAPABILITY_NAMES = \[[\s\S]*?"transition"[\s\S]*?\];/.test(ai)
);

[
  "## Transition primitives",
  "data-imory-transition=\\\"none|fade|slide|scale|fade-slide|fade-scale\\\"",
  "data-imory-panel",
  "data-imory-toggle",
  "페이드되게",
  "아래에서 살짝 올라오게",
  "더 부드럽게",
  "애니메이션 없애줘",
  "독 펼칠 때 더 부드럽게",
  "Do NOT write `@keyframes`"
].forEach((phrase) => {
  check(`프롬프트에 "${phrase}"`, ai.indexOf(phrase) !== -1);
});

check(
  "dock 스키마의 transition 이 네 칸짜리 객체다",
  /transition: buildSkinAiTransitionSchema\(/.test(ai) &&
  /required: \["type", "duration", "easing", "direction"\]/.test(ai)
);


/* =========================================================
   8. Bottom Dock 이 같은 정규화를 지나는가
========================================================== */

section("dock");

/* classic script 의 전역 함수를 node 에서 흉내낸다 — 브라우저에서
   두 파일이 같은 realm 을 공유하는 것과 같은 조건 */
globalThis.validateSkinTransitionInput = validateSkinTransitionInput;

const dockModule =
  require(path.join(here, "skin-bottom-dock.js"));

const legacyDock =
  dockModule.normalizeSkinBottomDock({ transition: "fade-slide", items: [] });

check(
  "옛 모양(문자열)은 같은 type 의 객체가 된다",
  legacyDock.ok &&
  JSON.stringify(legacyDock.dock.transition) ===
    JSON.stringify({ type: "fade-slide", duration: 200, easing: "ease", direction: "up" }),
  JSON.stringify(legacyDock)
);

const richDock =
  dockModule.normalizeSkinBottomDock({
    transition: { type: "fade-scale", duration: 4000, easing: "smooth", direction: "down" },
    items: []
  });

check(
  "객체 모양 — 속도는 잘리고 나머지는 그대로",
  richDock.ok &&
  JSON.stringify(richDock.dock.transition) ===
    JSON.stringify({ type: "fade-scale", duration: 1000, easing: "smooth", direction: "down" }),
  JSON.stringify(richDock)
);

check(
  "모르는 곡선이면 Import 가 이유와 함께 거부한다",
  dockModule.normalizeSkinBottomDock({ transition: { type: "fade", easing: "springy" }, items: [] }).ok === false
);

check(
  "기본값 — 설정이 없으면 fade 200ms",
  dockModule.normalizeSkinBottomDock({ items: [] }).dock.transition.type === "fade" &&
  dockModule.normalizeSkinBottomDock({ items: [] }).dock.transition.duration === 200
);

delete globalThis.validateSkinTransitionInput;


/* =========================================================
   9. 진입 문서 · sandbox origin
========================================================== */

section("load");

[
  ["index.html", "./skin/skin-transition.js", "./skin/skin-sanitize.js", "./skin/skin-transition.css"],
  ["studio/index.html", "../skin/skin-transition.js", "../skin/skin-sanitize.js", null],
  ["studio/preview/preview-frame.html", "../../skin/skin-transition.js", "../../skin/skin-sanitize.js", "../../skin/skin-transition.css"],
  ["skin/sandbox/frame.html", "/skin/skin-transition.js", "/skin/skin-sanitize.js", "/skin/skin-transition.css"],
  ["studio/studio-lifecycle-scenario.html", "../skin/skin-transition.js", "../skin/skin-sanitize.js", null]
].forEach(([file, jsPath, sanitizePath, cssPath]) => {

  const source = read(file);

  check(
    `${file} 가 전환 계약을 sanitize 보다 먼저 싣는다`,
    source.indexOf(jsPath) !== -1 && source.indexOf(jsPath) < source.indexOf(sanitizePath)
  );

  if (cssPath) {
    check(`${file} 가 전환 스타일시트를 미리 건다`, source.indexOf(cssPath) !== -1);
  }

});

const sandboxServer = read("core/lib/skin-sandbox-server.js");

["/skin/skin-transition.js", "/skin/skin-transition.css"].forEach((asset) => {
  check(`sandbox origin 이 ${asset} 를 내보낸다`, sandboxServer.indexOf(`"${asset}"`) !== -1);
});

check(
  "renderSkin 이 배치 뒤에 전환을 컴파일하고 스타일시트를 건다",
  (() => {
    const render = read("skin/skin-render.js");
    return render.indexOf("compileSkinTransitionTree(root") > render.indexOf("compileSkinLayoutTree(root)") &&
      render.indexOf("ensureSkinTransitionStylesheet(doc)") !== -1;
  })()
);

check(
  "sanitizer 가 전환 판정을 skin-transition.js 에 묻는다(표를 복사하지 않는다)",
  read("skin/skin-sanitize.js").indexOf("sanitizeSkinTransitionAttributeValue(name, value)") !== -1
);


/* =========================================================
   10. 예시 스킨
========================================================== */

section("example-skin");

const example =
  JSON.parse(read("skin/test-skins/imory-transitions-v1.json"));

const exampleHtml =
  Object.keys(example.templates).map((k) => example.templates[k].html).join("\n");

const exampleAttrs =
  exampleHtml.match(/data-imory-(?:transition[a-z-]*|panel|toggle)="[^"]*"/g) || [];

check("예시 스킨이 전환 속성을 실제로 쓴다", exampleAttrs.length >= 10, String(exampleAttrs.length));

check(
  "예시 스킨의 전환 속성 값이 전부 저장 경계를 그대로 통과한다",
  exampleAttrs.every((pair) => {
    const [, name, value] = pair.match(/^([a-z-]+)="([^"]*)"$/);
    return isValidSkinTransitionAttributeValue(name, value);
  }),
  exampleAttrs.filter((pair) => {
    const [, name, value] = pair.match(/^([a-z-]+)="([^"]*)"$/);
    return !isValidSkinTransitionAttributeValue(name, value);
  }).join(", ")
);

check(
  "★ 예시 스킨 CSS 에 @keyframes / animation / opacity·transform transition 이 없다(움직임은 primitive 몫)",
  !/@keyframes|animation\s*:|transition\s*:/.test(example.css),
  (/@keyframes|animation\s*:|transition\s*:/.exec(example.css) || [""])[0]
);

check(
  "예시 스킨의 dock transition 이 객체 모양이다",
  example.bottomDock && typeof example.bottomDock.transition === "object" &&
  validateSkinTransitionInput(example.bottomDock.transition).ok
);


console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`
);

process.exit(failed === 0 ? 0 : 1);
