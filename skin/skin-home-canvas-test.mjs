/* =========================================================
   HOME CANVAS — 데이터 계약 단위 테스트 (HOME-CANVAS-CONTRACT-1B · 1C)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md

   브라우저 없이 판정할 수 있는 것:

     [marker]    표시 위치 — 저장 경계의 값 표 · 0개/1개/2개 세기
     [contract]  요소 계약 — 종류 · 좌표 · 폭 · 높이("auto" 는 둘만) ·
                 id 규칙 · 중복 id · 타입별 props · **오류 경로**
     [baseheight] 도화지 전체의 세로 길이(1C) — 필수 · 양수 · 기본 844 ·
                 요소의 height 와 별개 · 자동 계산 안 함 · 오류 경로
     [version]   미래 canvas.version 은 통과(보존)하고 실행만 안 한다
     [preserve]  모르는 region · 모르는 canvas 칸 보존 · 원본 불변 ·
                 enabled:false 가 데이터를 지우지 않는다
     [payload]   실행용 payload 는 알려진 칸만 · 기본값 · 입력 mutate 0
     [template]  resolveSkinTemplate — 캔버스 없는 기존 스킨은 키조차
                 없고(회귀), 표식 없는 스킨도 없고, 깨진 저장 데이터는
                 fallback 이다
     [protocol]  sandbox 봉투의 canvas 칸 · strict allowlist ·
                 **프로토콜과 계약 파일의 값 목록 양방향 대조**
     [patterns]  id ↔ SKIN_SANITIZE_EDIT_ID_PATTERN ·
                 slot ↔ SKIN_IMAGE_SLOT_NAME_PATTERN · 새 id 가 둘 다 통과
     [docs]      진입 문서 로드 순서(sanitize 보다 먼저) · sandbox allowlist

   Import → Export → Save → 다시 열기 → Publish 왕복과 AI 경로는
   브라우저가 필요하다 — studio/studio-home-canvas-e2e-test.mjs.

   실행:  node skin/skin-home-canvas-test.mjs
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const require = createRequire(import.meta.url);

const canvas = require(path.join(HERE, "skin-home-canvas.js"));
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

const clone = (v) => JSON.parse(JSON.stringify(v));


/* ---------------------------------------------------------- 픽스처 */

const CANVAS_HTML =
  '<div class="hc-home">' +
  '<h1 data-imory-bind="site.title"></h1>' +
  '<div data-imory-canvas-root></div>' +
  "</div>";

const PLAIN_HTML =
  '<div class="hc-home"><h1 data-imory-bind="site.title"></h1></div>';

const element = (over) =>
  Object.assign(
    {
      id: "canvas_photo1",
      type: "photo",
      x: 20,
      y: 120,
      width: 260,
      height: 320,
      rotation: 0,
      hidden: false,
      locked: false,
      props: { slot: "photo_1" }
    },
    over || {}
  );

const canvasData = (elements) => ({
  version: 1,
  baseWidth: 390,
  baseHeight: 844,
  elements: elements || [
    element(),
    element({
      id: "canvas_text1",
      type: "text",
      y: 470,
      height: "auto",
      rotation: -2,
      props: { text: "A quiet archive.", role: "body" }
    })
  ]
});

const skinWith = (regions, html) => ({
  schemaVersion: 1,
  templates: {
    home: { html: html === undefined ? CANVAS_HTML : html },
    category: { html: "<div></div>" },
    post: { html: '<div data-imory-region="post-body"></div>' }
  },
  css: "",
  imageSlots: [],
  regions: regions || [],
  metadata: {}
});

const canvasRegion = (over) =>
  Object.assign({ name: "home_canvas", enabled: true, canvas: canvasData() }, over || {});


/* ---------------------------------------------------------- */
console.log("\n[marker] 표시 위치 data-imory-canvas-root");

check("[marker] 저장 경계의 값 표는 빈 값 하나뿐",
  canvas.isSkinHomeCanvasAttributeName("data-imory-canvas-root") &&
  !canvas.isSkinHomeCanvasAttributeName("data-imory-canvas") &&
  !canvas.isSkinHomeCanvasAttributeName("data-imory-canvas-root-x") &&
  canvas.sanitizeSkinHomeCanvasAttributeValue("data-imory-canvas-root", "") === "" &&
  canvas.sanitizeSkinHomeCanvasAttributeValue("data-imory-canvas-root", "  ") === "" &&
  canvas.sanitizeSkinHomeCanvasAttributeValue("data-imory-canvas-root", "home") === null &&
  canvas.sanitizeSkinHomeCanvasAttributeValue("data-imory-canvas-x", "") === null);

check("[marker] 0개 · 1개 · 2개를 센다(정확히 하나여야 표시 위치다)",
  canvas.countSkinHomeCanvasRoots(PLAIN_HTML) === 0 &&
  canvas.countSkinHomeCanvasRoots(CANVAS_HTML) === 1 &&
  canvas.countSkinHomeCanvasRoots(CANVAS_HTML + CANVAS_HTML) === 2 &&
  canvas.skinHtmlHasCanvasRoot(CANVAS_HTML) === true &&
  canvas.skinHtmlHasCanvasRoot(PLAIN_HTML) === false &&
  canvas.skinHtmlHasCanvasRoot(CANVAS_HTML + CANVAS_HTML) === false);

check("[marker] 비슷한 이름에 걸리지 않는다",
  canvas.countSkinHomeCanvasRoots('<div data-imory-canvas-rooted></div>') === 0 &&
  canvas.countSkinHomeCanvasRoots('<div data-imory-canvas-root=""></div>') === 1 &&
  canvas.countSkinHomeCanvasRoots('<div data-imory-canvas-root/>') === 1);

check("[marker] 저장 경계가 이 파일의 표에 묻는다(복붙한 값 목록이 없다)",
  /isSkinHomeCanvasAttributeName/.test(read("skin/skin-sanitize.js")) &&
  /sanitizeSkinHomeCanvasAttributeValue/.test(read("skin/skin-sanitize.js")) &&
  !/data-imory-canvas-root/.test(
    read("skin/skin-sanitize.js").replace(/\/\*[\s\S]*?\*\//g, "")
  ));


/* ---------------------------------------------------------- */
console.log("\n[contract] 요소 계약과 오류 경로");

const okOf = (regions) => canvas.validateSkinHomeCanvasRegions(regions);

check("[contract] 정상 canvas 통과", okOf([canvasRegion()]).ok === true);

check("[contract] home_canvas 항목이 없거나 regions 가 없으면 통과",
  okOf([]).ok && okOf(undefined).ok && okOf([{ name: "left_sidebar" }, null, 3]).ok);

check("[contract] canvas 칸이 없는 `{name:home_canvas}` 도 통과(아직 아무것도 안 놓은 상태)",
  okOf([{ name: "home_canvas" }]).ok);

{
  const bad = okOf([{ name: "home_canvas", enabled: "yes", canvas: canvasData() }]);
  check("[contract] enabled 가 boolean 이 아니면 거부",
    !bad.ok && bad.path === "regions[0].enabled", JSON.stringify(bad));
}

{
  const r = [{ name: "left_sidebar" }, { name: "other" }, canvasRegion()];
  const data = clone(canvasData());
  data.elements[1].width = -3;
  r[2] = { name: "home_canvas", enabled: true, canvas: data };
  const bad = okOf(r);
  check("★ [contract] 오류 경로가 정확한 자리를 가리킨다",
    !bad.ok && bad.path === "regions[2].canvas.elements[1].width", JSON.stringify(bad));
}

{
  const data = canvasData([element(), element({ id: "canvas_photo1", y: 500 })]);
  const bad = okOf([{ name: "home_canvas", canvas: data }]);
  check("★ [contract] 중복 id 는 새 Import 에서 차단(조용히 새 id 로 고치지 않는다)",
    !bad.ok && bad.path === "regions[0].canvas.elements[1].id" && /두 번/.test(bad.message),
    JSON.stringify(bad));
}

{
  const cases = [
    ["type", element({ type: "widget" }), "regions[0].canvas.elements[0].type"],
    ["id 점 금지", element({ id: "photo.1" }), "regions[0].canvas.elements[0].id"],
    ["id 숫자 시작 금지", element({ id: "1photo" }), "regions[0].canvas.elements[0].id"],
    ["x 문자열", element({ x: "20" }), "regions[0].canvas.elements[0].x"],
    ["y NaN", element({ y: NaN }), "regions[0].canvas.elements[0].y"],
    ["width 0", element({ width: 0 }), "regions[0].canvas.elements[0].width"],
    ["rotation 문자열", element({ rotation: "0deg" }), "regions[0].canvas.elements[0].rotation"],
    ["hidden 숫자", element({ hidden: 1 }), "regions[0].canvas.elements[0].hidden"],
    ["props 배열", element({ props: [] }), "regions[0].canvas.elements[0].props"]
  ];
  const wrong = cases.filter(([, el, path]) => {
    const bad = okOf([{ name: "home_canvas", canvas: canvasData([el]) }]);
    return bad.ok || bad.path !== path;
  });
  check("[contract] 공통 필드 — 아홉 가지 잘못을 각자의 경로로 거부",
    wrong.length === 0, wrong.map((c) => c[0]).join(", "));
}

{
  /* ★ 높이 계약 — 모든 요소는 숫자 높이, text · category_nav 만 "auto" */
  const numberOk = canvas.SKIN_HOME_CANVAS_ELEMENT_TYPES.every((type) => {
    const el = element({ id: `canvas_${type}`, type, height: 321, props: propsFor(type) });
    return okOf([{ name: "home_canvas", canvas: canvasData([el]) }]).ok;
  });
  const autoResults = canvas.SKIN_HOME_CANVAS_ELEMENT_TYPES.map((type) => {
    const el = element({ id: `canvas_${type}`, type, height: "auto", props: propsFor(type) });
    return [type, okOf([{ name: "home_canvas", canvas: canvasData([el]) }]).ok];
  });
  const autoAllowed = autoResults.filter(([, ok]) => ok).map(([t]) => t);
  check("★ [contract] height — 여섯 종류 모두 숫자 가능, \"auto\" 는 text · category_nav 만",
    numberOk && same(autoAllowed.slice().sort(), ["category_nav", "text"]),
    autoAllowed.join(","));

  const bad = okOf([{ name: "home_canvas", canvas: canvasData([element({ height: "auto" })]) }]);
  check("[contract] photo 의 \"auto\" 는 거부되고 경로가 height",
    !bad.ok && bad.path === "regions[0].canvas.elements[0].height", JSON.stringify(bad));
}

function propsFor(type) {
  if (type === "photo" || type === "sticker") return { slot: "photo_1" };
  if (type === "logo") return { slot: "title_logo", fallback: "site_title" };
  if (type === "text") return { text: "hi", role: "title" };
  if (type === "category_nav") return { mode: "all", categoryIds: [] };
  return { kind: "rect" };
}

{
  const cases = [
    ["photo slot 없음", element({ props: {} }), "regions[0].canvas.elements[0].props.slot"],
    ["photo slot 대문자", element({ props: { slot: "Photo1" } }), "regions[0].canvas.elements[0].props.slot"],
    ["text text 없음", element({ type: "text", props: { role: "body" } }), "regions[0].canvas.elements[0].props.text"],
    ["text role 모름", element({ type: "text", props: { text: "x", role: "hero" } }), "regions[0].canvas.elements[0].props.role"],
    ["logo fallback 모름", element({ type: "logo", props: { slot: "title_logo", fallback: "blank" } }), "regions[0].canvas.elements[0].props.fallback"],
    ["nav mode 모름", element({ type: "category_nav", props: { mode: "some" } }), "regions[0].canvas.elements[0].props.mode"],
    ["nav categoryIds 객체", element({ type: "category_nav", props: { categoryIds: {} } }), "regions[0].canvas.elements[0].props.categoryIds"],
    ["nav categoryIds 안의 숫자", element({ type: "category_nav", props: { categoryIds: ["a", 2] } }), "regions[0].canvas.elements[0].props.categoryIds[1]"],
    ["shape kind 없음", element({ type: "shape", props: {} }), "regions[0].canvas.elements[0].props.kind"],
    ["sticker slot 없음", element({ type: "sticker", props: {} }), "regions[0].canvas.elements[0].props.slot"]
  ];
  const wrong = cases.filter(([, el, path]) => {
    const bad = okOf([{ name: "home_canvas", canvas: canvasData([el]) }]);
    return bad.ok || bad.path !== path;
  });
  check("[contract] 타입별 props — 열 가지 잘못을 각자의 경로로 거부",
    wrong.length === 0, wrong.map((c) => c[0]).join(", "));
}

{
  const shapes = canvas.SKIN_HOME_CANVAS_SHAPE_KINDS.every((kind) =>
    okOf([{ name: "home_canvas", canvas: canvasData([element({ type: "shape", props: { kind } })]) }]).ok);
  const roles = canvas.SKIN_HOME_CANVAS_TEXT_ROLES.every((role) =>
    okOf([{ name: "home_canvas", canvas: canvasData([element({ type: "text", height: "auto", props: { text: "x", role } })]) }]).ok);
  const modes = canvas.SKIN_HOME_CANVAS_NAV_MODES.every((mode) =>
    okOf([{ name: "home_canvas", canvas: canvasData([element({ type: "category_nav", height: 40, props: { mode } })]) }]).ok);
  check("[contract] 계약이 약속한 값들이 전부 통과(role 5 · mode 2 · kind 3)",
    shapes && roles && modes);
}

{
  const cases = [
    ["canvas 배열", { name: "home_canvas", canvas: [] }, "regions[0].canvas"],
    ["version 0", { name: "home_canvas", canvas: { version: 0, baseWidth: 390, elements: [] } }, "regions[0].canvas.version"],
    ["version 문자열", { name: "home_canvas", canvas: { version: "1", baseWidth: 390, elements: [] } }, "regions[0].canvas.version"],
    ["baseWidth 375", { name: "home_canvas", canvas: { version: 1, baseWidth: 375, elements: [] } }, "regions[0].canvas.baseWidth"],
    ["elements 객체", { name: "home_canvas", canvas: { version: 1, baseWidth: 390, baseHeight: 844, elements: {} } }, "regions[0].canvas.elements"]
  ];
  const wrong = cases.filter(([, entry, path]) => {
    const bad = okOf([entry]);
    return bad.ok || bad.path !== path;
  });
  check("[contract] canvas 자체의 다섯 가지 잘못", wrong.length === 0, wrong.map((c) => c[0]).join(", "));
}


/* ---------------------------------------------------------- */
console.log("\n[baseheight] 도화지 전체의 세로 길이 (CONTRACT-1C)");

const canvasWithHeight = (baseHeight) => {
  const data = canvasData();
  if (baseHeight === undefined) {
    delete data.baseHeight;
  } else {
    data.baseHeight = baseHeight;
  }
  return { name: "home_canvas", canvas: data };
};

check("[baseheight] 기본값은 844(새 캔버스 = 한 화면형 390×844)",
  canvas.SKIN_HOME_CANVAS_BASE_HEIGHT === 844 &&
  canvas.createEmptySkinHomeCanvas().baseHeight === 844);

check("★ [baseheight] 844 가 통과한다", okOf([canvasWithHeight(844)]).ok === true);

check("★ [baseheight] 다른 양수도 통과한다(긴 스크롤형 캔버스)",
  [1, 200, 844, 1600, 4000, 99999.5, canvas.SKIN_HOME_CANVAS_MAX_COORD]
    .every((h) => okOf([canvasWithHeight(h)]).ok === true));

{
  const rejects = [
    ["0", 0],
    ["음수", -844],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["문자열 \"844\"", "844"],
    ["\"auto\"", "auto"],
    ["null", null],
    ["상한 초과", canvas.SKIN_HOME_CANVAS_MAX_COORD + 1],
    ["누락", undefined]
  ].filter(([, value]) => {
    const bad = okOf([canvasWithHeight(value)]);
    return bad.ok || bad.path !== "regions[0].canvas.baseHeight";
  });

  check("★ [baseheight] 0 · 음수 · NaN · 문자열 · 누락 등 아홉 가지를 모두 거부하고 경로가 baseHeight",
    rejects.length === 0, rejects.map((r) => r[0]).join(", "));
}

check("★ [baseheight] 오류 경로가 regions[n] 의 n 을 따라간다",
  okOf([{ name: "other" }, { name: "x" }, canvasWithHeight(0)]).path ===
    "regions[2].canvas.baseHeight");

check("★ [baseheight] 요소가 없어도 도화지는 높이를 갖는다(elements:[] 보존)",
  (() => {
    const payload = canvas.buildSkinCanvasRenderPayload(
      { version: 1, baseWidth: 390, baseHeight: 1200, elements: [] });
    return payload.baseHeight === 1200 && payload.elements.length === 0;
  })());

check("★ [baseheight] 요소의 height 와 별개다 — 요소가 도화지를 넘어도 막지 않는다",
  okOf([{
    name: "home_canvas",
    canvas: Object.assign(canvasData([element({ y: 800, height: 900 })]), { baseHeight: 844 })
  }]).ok === true);

check("★ [baseheight] 요소를 옮겨도 baseHeight 를 자동으로 바꾸지 않는다",
  (() => {
    const low = canvas.buildSkinCanvasRenderPayload(
      Object.assign(canvasData([element({ y: 10 })]), { baseHeight: 844 }));
    const high = canvas.buildSkinCanvasRenderPayload(
      Object.assign(canvasData([element({ y: 5000 })]), { baseHeight: 844 }));
    return low.baseHeight === 844 && high.baseHeight === 844;
  })());

check("[baseheight] 미래 version 은 baseHeight 없이도 통과한다(v1 규칙을 적용하지 않는다)",
  okOf([{ name: "home_canvas", canvas: { version: 2, baseWidth: 999, elements: [] } }]).ok === true);

check("★ [baseheight] 실행용 payload 는 상수가 아니라 저장된 그 값을 싣는다",
  canvas.buildSkinCanvasRenderPayload(
    Object.assign(canvasData(), { baseHeight: 2400 })).baseHeight === 2400);

{
  const data = Object.assign(canvasData(), { baseHeight: 1600 });
  const before = JSON.stringify(data);
  canvas.buildSkinCanvasRenderPayload(data);
  canvas.validateSkinCanvasData(data, "canvas");
  check("[baseheight] 입력을 mutate 하지 않는다", JSON.stringify(data) === before);
}

check("★ [baseheight] sandbox 봉투가 baseHeight 를 요구하고 값을 통과시킨다",
  protocol.isSandboxHomeCanvas(
    canvas.buildSkinCanvasRenderPayload(Object.assign(canvasData(), { baseHeight: 1600 }))) === true &&
  protocol.isSandboxHomeCanvas({ version: 1, baseWidth: 390, elements: [] }) === false &&
  protocol.isSandboxHomeCanvas({ version: 1, baseWidth: 390, baseHeight: 0, elements: [] }) === false &&
  protocol.isSandboxHomeCanvas({ version: 1, baseWidth: 390, baseHeight: "844", elements: [] }) === false);

check("[baseheight] 프로토콜의 기본값 상수도 계약 파일과 같다",
  protocol.SANDBOX_CANVAS_BASE_HEIGHT === canvas.SKIN_HOME_CANVAS_BASE_HEIGHT);

{
  const many = [];
  for (let i = 0; i <= canvas.SKIN_HOME_CANVAS_MAX_ELEMENTS; i++) {
    many.push(element({ id: `canvas_e${i}` }));
  }
  const bad = okOf([{ name: "home_canvas", canvas: canvasData(many) }]);
  check("[contract] 요소 수 상한", !bad.ok && bad.path === "regions[0].canvas.elements");
}

check("[contract] 같은 이름이 둘이면 **둘 다** 검사한다",
  !okOf([canvasRegion(), { name: "home_canvas", canvas: { version: 1, baseWidth: 1, elements: [] } }]).ok);


/* ---------------------------------------------------------- */
console.log("\n[version] 미래 canvas.version");

{
  const future = { version: 2, baseWidth: 999, elements: [{ nonsense: true }] };

  check("★ [version] 모르는 version 은 거부가 아니다(파일이 통과한다 = 보존)",
    okOf([{ name: "home_canvas", canvas: future }]).ok === true);

  check("[version] 모르는 version 의 elements 를 v1 규칙으로 검사하지 않는다",
    canvas.validateSkinCanvasData(future, "canvas").future === true);

  check("★ [version] 그래도 실행하지 않는다(기존 HOME fallback)",
    canvas.buildSkinCanvasRenderPayload(future) === undefined &&
    canvas.resolveSkinHomeCanvas(skinWith([{ name: "home_canvas", canvas: future }]), CANVAS_HTML) === undefined);
}


/* ---------------------------------------------------------- */
console.log("\n[preserve] 보존과 불변");

{
  const regions = [
    { name: "left_sidebar", enabled: true },
    { name: "someone_elses_thing", payload: { deep: [1, 2] } },
    { name: "home_canvas", enabled: true, canvas: canvasData(), futureField: "keep me" }
  ];
  regions[2].canvas.futureCanvasField = { a: 1 };
  regions[2].canvas.elements[0].futureElementField = "keep";

  const before = JSON.stringify(regions);

  check("★ [preserve] 모르는 region · 모르는 canvas 칸 · 모르는 요소 칸이 있어도 통과",
    okOf(regions).ok === true);

  canvas.resolveSkinHomeCanvas(skinWith(regions), CANVAS_HTML);
  canvas.buildSkinCanvasRenderPayload(regions[2].canvas);
  canvas.writeSkinHomeCanvasRegion(regions, { enabled: false });

  check("★ [preserve] 어떤 함수도 입력 객체 · 배열을 mutate 하지 않는다",
    JSON.stringify(regions) === before);
}

{
  const regions = [{ name: "other" }, canvasRegion({ futureField: 7 })];

  const off = canvas.writeSkinHomeCanvasRegion(regions, { enabled: false });

  check("★ [preserve] enabled:false 는 canvas 데이터를 지우지 않는다",
    off[1].enabled === false &&
    off[1].canvas.elements.length === 2 &&
    off[1].futureField === 7 &&
    off[0].name === "other",
    JSON.stringify(off));

  const on = canvas.writeSkinHomeCanvasRegion(off, { enabled: true });

  check("[preserve] 다시 켜면 같은 요소가 그대로",
    same(on[1].canvas, canvasData()) && on[1].enabled === true);

  check("[preserve] 원래 배열은 그대로", regions[1].enabled === true && regions !== off);
}

{
  const made = canvas.writeSkinHomeCanvasRegion([{ name: "dday", date: "2024-01-01" }], {
    enabled: true,
    canvas: canvas.createEmptySkinHomeCanvas()
  });
  check("[preserve] 항목이 없으면 끝에 더하고 다른 설정은 자리 그대로",
    made.length === 2 && made[0].name === "dday" && made[1].name === "home_canvas" &&
    same(made[1].canvas, { version: 1, baseWidth: 390, baseHeight: 844, elements: [] }));

  const twice = canvas.writeSkinHomeCanvasRegion(
    [canvasRegion(), canvasRegion({ canvas: canvas.createEmptySkinHomeCanvas() })],
    { enabled: false }
  );
  check("[preserve] 같은 이름이 둘이면 앞의 것만 남는다(읽기와 같은 규칙)",
    twice.filter((e) => e.name === "home_canvas").length === 1 &&
    twice[0].canvas.elements.length === 2);
}

check("[preserve] 읽기는 앞의 것이 이긴다",
  canvas.findSkinHomeCanvasRegion([{ name: "x" }, canvasRegion({ tag: "first" }), canvasRegion({ tag: "second" })]).index === 1);


/* ---------------------------------------------------------- */
console.log("\n[payload] 실행용 payload");

{
  const data = canvasData([
    element({ props: { slot: "photo_1", futureProp: "drop me" }, futureField: 1 }),
    element({
      id: "canvas_t",
      type: "text",
      height: "auto",
      props: { text: "hi" }
    }),
    element({ id: "canvas_n", type: "category_nav", height: 40, props: {} }),
    element({ id: "canvas_l", type: "logo", props: { slot: "title_logo" } })
  ]);
  delete data.elements[1].rotation;
  delete data.elements[1].hidden;
  delete data.elements[1].locked;

  const payload = canvas.buildSkinCanvasRenderPayload(data);

  check("★ [payload] 알려진 칸만 — 모르는 요소 칸도 모르는 props 칸도 실리지 않는다",
    same(Object.keys(payload).sort(), ["baseHeight", "baseWidth", "elements", "version"]) &&
    same(Object.keys(payload.elements[0]).sort(),
      ["height", "hidden", "id", "locked", "props", "rotation", "type", "width", "x", "y"]) &&
    same(Object.keys(payload.elements[0].props), ["slot"]),
    JSON.stringify(payload.elements[0]));

  check("[payload] 빠진 rotation · hidden · locked 는 0 · false · false",
    payload.elements[1].rotation === 0 &&
    payload.elements[1].hidden === false &&
    payload.elements[1].locked === false);

  check("[payload] 타입별 기본값 — text.role=body · nav.mode=all/[] · logo.fallback=site_title",
    payload.elements[1].props.role === "body" &&
    same(payload.elements[2].props, { mode: "all", categoryIds: [] }) &&
    payload.elements[3].props.fallback === "site_title");

  check("[payload] 배열 순서가 곧 앞뒤 순서다(z 필드가 없다)",
    same(payload.elements.map((e) => e.id), ["canvas_photo1", "canvas_t", "canvas_n", "canvas_l"]) &&
    payload.elements.every((e) => e.z === undefined));

  check("[payload] 결과는 새 리터럴 — 입력의 어떤 객체도 그대로 실리지 않는다",
    payload.elements[0] !== data.elements[0] && payload.elements[0].props !== data.elements[0].props);

  check("[payload] 깨진 데이터는 payload 를 만들지 않는다(조용히 그 요소만 빼지 않는다)",
    canvas.buildSkinCanvasRenderPayload(canvasData([element({ width: -1 }), element({ id: "canvas_b" })])) === undefined);

  check("[payload] 봉투에서 돌아온 값도 같은 규칙으로 다시 옮긴다",
    same(canvas.coerceSkinHomeCanvasRenderPayload(payload), payload) &&
    canvas.coerceSkinHomeCanvasRenderPayload(null) === undefined &&
    canvas.coerceSkinHomeCanvasRenderPayload({ version: 1 }) === undefined);
}

check("★ [payload] canvas 없음 ≠ elements:[] — 빈 캔버스 면은 실행된다",
  canvas.resolveSkinHomeCanvas(skinWith([{ name: "home_canvas" }]), CANVAS_HTML) === undefined &&
  same(
    canvas.resolveSkinHomeCanvas(
      skinWith([{ name: "home_canvas", canvas: canvas.createEmptySkinHomeCanvas() }]), CANVAS_HTML),
    { version: 1, baseWidth: 390, baseHeight: 844, elements: [] }
  ));


/* ---------------------------------------------------------- */
console.log("\n[template] resolveSkinTemplate");

const templateApi = new Function(
  read("skin/skin-sides.js") + "\n" +
  read("skin/skin-settings.js") + "\n" +
  read("skin/skin-home-canvas.js") + "\n" +
  read("skin/skin-template.js") +
  "\nreturn { resolveSkinTemplate };"
)();

{
  const plain = skinWith([], PLAIN_HTML);

  const home = templateApi.resolveSkinTemplate(plain, "home");

  check("★ [template] 캔버스가 없는 기존 스킨은 canvas 키조차 없다(봉투 불변)",
    same(Object.keys(home).sort(), ["css", "html", "js"]), JSON.stringify(Object.keys(home)));

  check("[template] regions 에 항목이 있어도 표시 위치가 없으면 키가 없다",
    templateApi.resolveSkinTemplate(skinWith([canvasRegion()], PLAIN_HTML), "home").canvas === undefined);

  check("[template] 표시 위치가 둘이면 키가 없다(정확히 하나 계약)",
    templateApi.resolveSkinTemplate(skinWith([canvasRegion()], CANVAS_HTML + CANVAS_HTML), "home").canvas === undefined);

  const withCanvas = templateApi.resolveSkinTemplate(skinWith([canvasRegion()]), "home");

  check("★ [template] 표시 위치 + regions 가 둘 다 있으면 실행 데이터가 실린다",
    withCanvas.canvas && withCanvas.canvas.version === 1 && withCanvas.canvas.elements.length === 2,
    JSON.stringify(Object.keys(withCanvas)));

  check("[template] HOME 에만 싣는다(v1 의 캔버스는 HOME 한 장)",
    templateApi.resolveSkinTemplate(skinWith([canvasRegion()]), "category").canvas === undefined &&
    templateApi.resolveSkinTemplate(skinWith([canvasRegion()]), "post").canvas === undefined);

  check("[template] enabled:false 면 싣지 않는다",
    templateApi.resolveSkinTemplate(skinWith([canvasRegion({ enabled: false })]), "home").canvas === undefined);
}

{
  /* ★ 이미 저장된 데이터가 잘못된 경우 — 삭제하지 않고 fallback */
  const broken = canvasData([element({ width: 0 })]);
  const pkg = skinWith([canvasRegion({ canvas: broken })]);
  const before = JSON.stringify(pkg);

  const home = templateApi.resolveSkinTemplate(pkg, "home");

  check("★ [template] 깨진 저장 데이터 — 실행하지 않고(키 없음) 원본은 그대로 남는다",
    home.canvas === undefined &&
    home.html === CANVAS_HTML &&
    JSON.stringify(pkg) === before &&
    pkg.regions[0].canvas.elements[0].width === 0);
}


/* ---------------------------------------------------------- */
console.log("\n[protocol] sandbox 봉투");

const envelope = (over) =>
  Object.assign({ html: "<div></div>", css: "" }, over || {});

{
  const payload = canvas.buildSkinCanvasRenderPayload(canvasData());

  check("★ [protocol] canvas 없는 봉투가 지금까지와 같다(키 자체가 없다)",
    protocol.isSandboxTemplate(envelope()) === true);

  check("★ [protocol] 계약 파일이 만든 payload 를 프로토콜이 받는다",
    protocol.isSandboxTemplate(envelope({ canvas: payload })) === true);

  const rejects = [
    ["모르는 최상위 칸", { version: 1, baseWidth: 390, baseHeight: 844, elements: [], background: "#fff" }],
    ["모르는 version", { version: 2, baseWidth: 390, elements: [] }],
    ["다른 baseWidth", { version: 1, baseWidth: 375, elements: [] }],
    ["모르는 요소 칸", { version: 1, baseWidth: 390, baseHeight: 844, elements: [Object.assign(element(), { z: 3 })] }],
    ["모르는 props 칸", { version: 1, baseWidth: 390, baseHeight: 844, elements: [element({ props: { slot: "photo_1", style: "x" } })] }],
    ["요소별 style", { version: 1, baseWidth: 390, baseHeight: 844, elements: [Object.assign(element(), { style: {} })] }],
    ["rotation 없음", { version: 1, baseWidth: 390, baseHeight: 844, elements: [(() => { const e = element(); delete e.rotation; return e; })()] }],
    ["photo 의 auto 높이", { version: 1, baseWidth: 390, baseHeight: 844, elements: [element({ height: "auto" })] }],
    ["중복 id", { version: 1, baseWidth: 390, baseHeight: 844, elements: [element(), element()] }],
    ["모르는 종류", { version: 1, baseWidth: 390, baseHeight: 844, elements: [element({ type: "widget" })] }],
    ["점이 든 id", { version: 1, baseWidth: 390, baseHeight: 844, elements: [element({ id: "a.b" })] }],
    ["너무 긴 글자", { version: 1, baseWidth: 390, baseHeight: 844, elements: [element({ type: "text", props: { text: "x".repeat(2001), role: "body" } })] }]
  ].filter(([, value]) => protocol.isSandboxTemplate(envelope({ canvas: value })) !== false);

  check("★ [protocol] strict allowlist — 열두 가지를 전부 거부",
    rejects.length === 0, rejects.map((r) => r[0]).join(", "));
}

check("★ [protocol] 값 목록이 계약 파일과 글자 단위로 같다(둘이 갈라지지 않는다)",
  same(protocol.SANDBOX_CANVAS_ELEMENT_TYPES, canvas.SKIN_HOME_CANVAS_ELEMENT_TYPES) &&
  same(protocol.SANDBOX_CANVAS_AUTO_HEIGHT_TYPES, canvas.SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES) &&
  same(protocol.SANDBOX_CANVAS_TEXT_ROLES, canvas.SKIN_HOME_CANVAS_TEXT_ROLES) &&
  same(protocol.SANDBOX_CANVAS_NAV_MODES, canvas.SKIN_HOME_CANVAS_NAV_MODES) &&
  same(protocol.SANDBOX_CANVAS_SHAPE_KINDS, canvas.SKIN_HOME_CANVAS_SHAPE_KINDS) &&
  same(protocol.SANDBOX_CANVAS_LOGO_FALLBACKS, canvas.SKIN_HOME_CANVAS_LOGO_FALLBACKS) &&
  protocol.SANDBOX_CANVAS_VERSION === canvas.SKIN_HOME_CANVAS_VERSION &&
  protocol.SANDBOX_CANVAS_BASE_WIDTH === canvas.SKIN_HOME_CANVAS_BASE_WIDTH &&
  protocol.SANDBOX_CANVAS_MAX_ELEMENTS === canvas.SKIN_HOME_CANVAS_MAX_ELEMENTS &&
  protocol.SANDBOX_CANVAS_MAX_TEXT_CHARS === canvas.SKIN_HOME_CANVAS_MAX_TEXT_CHARS &&
  protocol.SANDBOX_CANVAS_MAX_CATEGORY_IDS === canvas.SKIN_HOME_CANVAS_MAX_CATEGORY_IDS &&
  protocol.SANDBOX_CANVAS_MAX_CATEGORY_ID_CHARS === canvas.SKIN_HOME_CANVAS_MAX_CATEGORY_ID_CHARS &&
  protocol.SANDBOX_CANVAS_MAX_COORD === canvas.SKIN_HOME_CANVAS_MAX_COORD &&
  protocol.SANDBOX_CANVAS_ELEMENT_ID_PATTERN.source === canvas.SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.source &&
  protocol.SANDBOX_CANVAS_SLOT_NAME_PATTERN.source === canvas.SKIN_HOME_CANVAS_SLOT_NAME_PATTERN.source);

check("[protocol] 부모가 봉투에 canvas 를 싣는 유일한 자리가 계약 파일에 묻는다",
  /coerceSkinHomeCanvasRenderPayload/.test(read("skin/sandbox/skin-sandbox-host.js")) &&
  /coerceSkinHomeCanvasRenderPayload/.test(read("skin/sandbox/skin-sandbox-frame.js")));


/* ---------------------------------------------------------- */
console.log("\n[patterns] 세 파일의 정규식이 같은가");

{
  const sanitizeSrc = read("skin/skin-sanitize.js");
  const imagesSrc = read("skin/skin-package-images.js");

  const editIdPattern =
    /SKIN_SANITIZE_EDIT_ID_PATTERN\s*=\s*(\/[^\n]+?\/);/.exec(sanitizeSrc);
  const slotPattern =
    /SKIN_IMAGE_SLOT_NAME_PATTERN\s*=\s*(\/[^\n]+?\/);/.exec(imagesSrc);

  check("★ [patterns] 요소 id 규칙 = 저장 경계의 data-imory-edit-id 규칙",
    !!editIdPattern &&
    editIdPattern[1] === `/${canvas.SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.source}/`,
    editIdPattern && editIdPattern[1]);

  check("★ [patterns] props.slot 규칙 = 이미지 슬롯 이름 규칙",
    !!slotPattern &&
    slotPattern[1] === `/${canvas.SKIN_HOME_CANVAS_SLOT_NAME_PATTERN.source}/`,
    slotPattern && slotPattern[1]);
}

{
  const ids = [];
  for (let i = 0; i < 50; i++) {
    ids.push(canvas.createSkinHomeCanvasElementId());
  }
  check("★ [patterns] 새로 만든 id 는 edit-id 규칙을 통과한다(UUID 는 숫자로 시작할 수 있다)",
    ids.every((id) => canvas.SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id)) &&
    new Set(ids).size === 50,
    ids[0]);
}


/* ---------------------------------------------------------- */
console.log("\n[docs] 진입 문서와 allowlist");

{
  const entries = [
    ["index.html", "./skin/skin-home-canvas.js", "./skin/skin-sanitize.js"],
    ["studio/index.html", "../skin/skin-home-canvas.js", "../skin/skin-sanitize.js"],
    ["studio/preview/preview-frame.html", "../../skin/skin-home-canvas.js", "../../skin/skin-sanitize.js"],
    ["skin/sandbox/frame.html", "/skin/skin-home-canvas.js", "/skin/skin-sanitize.js"],
    ["studio/studio-lifecycle-scenario.html", "../skin/skin-home-canvas.js", "../skin/skin-sanitize.js"]
  ];

  const wrong = entries.filter(([file, canvasPath, sanitizePath]) => {
    const src = read(file);
    const a = src.indexOf(canvasPath);
    const b = src.indexOf(sanitizePath);
    return a === -1 || b === -1 || a > b;
  });

  check("★ [docs] 다섯 진입 문서가 sanitize 보다 **먼저** 로드한다",
    wrong.length === 0, wrong.map((w) => w[0]).join(", "));
}

check("[docs] sandbox origin 에서 이 파일이 나온다(allowlist)",
  /"\/skin\/skin-home-canvas\.js"/.test(read("core/lib/skin-sandbox-server.js")));

check("[docs] 계약 문서가 있고 색인에 적혀 있다",
  fs.existsSync(path.join(ROOT, "docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md")) &&
  /IMORY_HOME_CANVAS_CONTRACT\.md/.test(read("docs/INDEX.md")) &&
  /skin-home-canvas-test\.mjs/.test(read("docs/TESTS.md")));


console.log(`\n${passed} passed, ${failed} failed`);

if (failed) {
  console.log("실패:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
