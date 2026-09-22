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
     [v2-payload] v2 실행용 payload(V2-FLOW-RENDER-1) — flow · overlays ·
                 기본값 채우기 · maxWidth 는 채우지 않음 · follow 가
                 쓰는 칸만 · 왕복 고정점
     [template]  resolveSkinTemplate — 캔버스 없는 기존 스킨은 키조차
                 없고(회귀), 표식 없는 스킨도 없고, 깨진 저장 데이터는
                 fallback 이다
     [protocol]  sandbox 봉투의 canvas 칸 · strict allowlist ·
                 **프로토콜과 계약 파일의 값 목록 양방향 대조**
     [patterns]  id ↔ SKIN_SANITIZE_EDIT_ID_PATTERN ·
                 slot ↔ SKIN_IMAGE_SLOT_NAME_PATTERN · 새 id 가 둘 다 통과
     [docs]      진입 문서 로드 순서(sanitize 보다 먼저) · sandbox allowlist
     [manual]    수동 테스트 스킨(MILESTONE-1) — 계약 통과 · 표식 1개 ·
                 resolve · id 유일 · 순서 보존 · 확인할 구조가 다 있는가 ·
                 **제품 기본 스킨 불변**
     [v2-add]    새 재료 하나(V2-ADD-1) — 자리마다 받는 종류 · 기본값 ·
                 슬롯 · 보존 · 새 id · 추가 패널 파일의 로드 자리
     [v2-elements] 소속과 따라가기(V2-ELEMENTS-1) — 묶기 · 빼기 ·
                 삭제(primary 거부) · follow 전환 · pin 의 기준 셋 ·
                 프레임 안에 새 장식 · 보존과 불변
     [ux-fix]    직접 조작 사용성(MANUAL-UX-FIX-1)의 **순수 helper 둘** —
                 30° 자석의 경계값(±4° 안에서만 붙는다 · 음수 · 한 바퀴
                 너머)과 모서리 비율 유지의 정사영. 편집기 runtime 이
                 export 한 그 함수를 그대로 부른다

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
  okOf([{ name: "home_canvas", canvas: { version: 3, baseWidth: 999, elements: [] } }]).ok === true);

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

/*
  ★ 여기서 쓰는 "미래 version" 은 **3** 이다.

  V2-DATA-1 이전에는 이 자리가 `version: 2` 였다. v2 가 실제로
  검증되는 지금 그 숫자를 그대로 두면 이 절이 **틀린 것을 단언하게
  된다** — 2 는 더 이상 "내용을 보지 않고 통과시키는 version" 이
  아니다. 단언의 뜻(모르는 version 은 거부가 아니고, 그 내용을 v1
  규칙으로 검사하지 않으며, 그래도 실행하지 않는다)은 그대로 두고
  숫자만 아직 아무도 쓰지 않는 값으로 옮긴다.
*/
{
  const future = { version: 3, baseWidth: 999, elements: [{ nonsense: true }] };

  check("★ [version] 모르는 version 은 거부가 아니다(파일이 통과한다 = 보존)",
    okOf([{ name: "home_canvas", canvas: future }]).ok === true);

  check("[version] 모르는 version 의 elements 를 v1 규칙으로 검사하지 않는다",
    canvas.validateSkinCanvasData(future, "canvas").future === true);

  check("★ [version] 그래도 실행하지 않는다(기존 HOME fallback)",
    canvas.buildSkinCanvasRenderPayload(future) === undefined &&
    canvas.resolveSkinHomeCanvas(skinWith([{ name: "home_canvas", canvas: future }]), CANVAS_HTML) === undefined);

  check("[version] version 2 는 더 이상 이 자리에 있지 않다(내용을 검사한다)",
    canvas.validateSkinCanvasData({ version: 2, baseWidth: 999, elements: [] }, "canvas").future === undefined);
}


/* ---------------------------------------------------------- */
console.log("\n[v2] 조합형 Canvas 데이터 (V2-DATA-1)");

/*
  로드맵 §14-3 의 예시 그대로다 — 문서가 "이 모양이어야 한다"고 적은
  파일이 실제로 통과하는지를 먼저 본다. 아래 거부 사례는 전부 이
  fixture 한 칸만 고쳐서 만든다.
*/
const v2Full = () => ({
  version: 2,
  baseWidth: 390,
  baseHeight: 1240,
  flow: {
    direction: "column",
    padding: { top: 48, right: 24, bottom: 64, left: 24 },
    gap: 20,
    blocks: [
      {
        id: "canvas_b1logo",
        type: "logo",
        width: 120,
        height: 40,
        align: "center",
        props: { slot: "title_logo", fallback: "site_title" }
      },
      {
        id: "canvas_b2nav",
        type: "category_nav",
        width: 342,
        height: "auto",
        align: "stretch",
        margin: { top: 8 },
        props: { mode: "all", categoryIds: [] }
      },
      {
        id: "canvas_b3title",
        type: "text",
        width: 300,
        height: "auto",
        align: "center",
        props: { text: "FOREVER YOUNG", role: "title" }
      },
      {
        id: "canvas_b4rule",
        type: "divider",
        width: 120,
        height: 1,
        align: "center",
        margin: { top: 12, bottom: 12 }
      },
      {
        id: "canvas_b5main",
        type: "main_visual",
        width: 300,
        height: "auto",
        align: "center",
        margin: { top: 24, bottom: 24 },
        props: {
          baseWidth: 300,
          baseHeight: 380,
          primaryId: "canvas_m1photo",
          elements: [
            {
              id: "canvas_m0paper",
              type: "shape",
              follow: "transform",
              x: -18, y: 26, width: 300, height: 360, rotation: -6,
              props: { kind: "rect" }
            },
            {
              id: "canvas_m1photo",
              type: "photo",
              follow: "transform",
              x: 0, y: 0, width: 300, height: 380,
              props: { slot: "photo_main" }
            },
            {
              id: "canvas_m2left",
              type: "text",
              follow: "pin",
              width: 92, height: 22,
              pin: {
                target: "photo", anchor: "left", origin: "right",
                offset: { x: 8, y: -40 }
              },
              props: { text: "puppy !", role: "label" }
            },
            {
              id: "canvas_m4cap",
              type: "text",
              follow: "pin",
              width: 240, height: "auto",
              pin: {
                target: "frame", anchor: "bottom", origin: "top",
                offset: { x: 0, y: 10 }
              },
              props: { text: "2025 / 05 / 12", role: "caption" }
            }
          ]
        }
      }
    ]
  },
  overlays: [
    {
      id: "canvas_o1number",
      type: "text",
      x: -46, y: 980, width: 260, height: 200, rotation: 0,
      props: { text: "01", role: "label" }
    }
  ]
});

/* 최소 유효 v2 — 필수 칸만 */
const v2Min = () => ({
  version: 2,
  baseWidth: 390,
  baseHeight: 844,
  flow: { blocks: [] }
});

const v2Of = (data) => okOf([{ name: "home_canvas", canvas: data }]);

/* 한 칸만 고친 v2 의 오류 경로("(통과)" 면 거부되지 않았다는 뜻) */
const v2FailPath = (mutate) => {
  const data = v2Full();
  mutate(data);
  const r = v2Of(data);
  return r.ok ? "(통과)" : r.path;
};

const v2Block = (data, index) => data.flow.blocks[index];
const v2Frame = (data) => data.flow.blocks[4].props;

check("★ [v2] 로드맵 §14-3 의 예시가 그대로 통과한다", v2Of(v2Full()).ok === true,
  JSON.stringify(v2Of(v2Full())));

check("★ [v2] 최소 유효 v2 — flow.blocks 만 있으면 된다(overlays 는 선택)",
  v2Of(v2Min()).ok === true && v2Of(Object.assign(v2Min(), { overlays: [] })).ok === true);

check("[v2] version 2 는 내용을 검사한 뒤 version 2 로 답한다(미래 version 이 아니다)",
  (() => {
    const r = canvas.validateSkinCanvasData(v2Full(), "canvas");
    /* V2-FLOW-RENDER-1 에서 renderable 이 true 가 됐다 — 그 전까지는
       "검증하지만 그리지 않는다" 였다. `version` 칸은 그대로다:
       부르는 쪽이 어느 payload 빌더를 쓸지 이 숫자로 고른다. */
    return r.ok === true && r.version === 2 && r.renderable === true && r.future === undefined;
  })());

/* ---- 1) flow 블록 각 타입 ---- */
{
  const one = (block) => {
    const data = v2Min();
    data.flow.blocks = [block];
    return v2Of(data);
  };

  const types = [
    ["logo", { id: "canvas_t1", type: "logo", width: 120, height: 40, props: { slot: "title_logo" } }],
    ["category_nav", { id: "canvas_t2", type: "category_nav", width: 342, height: "auto", props: { mode: "selected", categoryIds: ["c1"] } }],
    ["text", { id: "canvas_t3", type: "text", width: 300, height: "auto", props: { text: "hi", role: "body" } }],
    ["divider", { id: "canvas_t4", type: "divider", width: 120, height: 1 }],
    ["main_visual", { id: "canvas_t5", type: "main_visual", width: 300, height: "auto", props: v2Frame(v2Full()) }]
  ].filter(([, block]) => one(block).ok !== true);

  check("★ [v2] 블록 다섯 종류가 각각 통과한다", types.length === 0,
    types.map(([name]) => name).join(", "));

  check("★ [v2] 블록 width 에 \"auto\" 는 없다(가용 폭 전부는 align:\"stretch\")",
    one({ id: "canvas_t6", type: "text", width: "auto", height: "auto", props: { text: "x" } }).path ===
      "regions[0].canvas.flow.blocks[0].width");

  check("★ [v2] logo 블록만 height \"auto\" 를 못 쓴다(나머지 넷은 쓴다)",
    one({ id: "canvas_t7", type: "logo", width: 120, height: "auto", props: { slot: "title_logo" } }).path ===
      "regions[0].canvas.flow.blocks[0].height" &&
    one({ id: "canvas_t8", type: "divider", width: 120, height: "auto" }).ok === true);

  check("[v2] 모르는 블록 종류는 거부(v1 의 photo · sticker · shape 도 블록이 아니다)",
    ["photo", "sticker", "shape", "widget", "photo_grid"].every((type) =>
      one({ id: "canvas_t9", type: type, width: 100, height: 100, props: { slot: "photo_1", kind: "rect" } }).path ===
        "regions[0].canvas.flow.blocks[0].type"));

  check("[v2] 블록 props 는 v1 과 같은 표를 쓴다(text 는 문자열 · role 목록 · nav mode)",
    one({ id: "canvas_ta", type: "text", width: 100, height: "auto", props: { text: 7 } }).path ===
      "regions[0].canvas.flow.blocks[0].props.text" &&
    one({ id: "canvas_tb", type: "text", width: 100, height: "auto", props: { text: "x", role: "huge" } }).path ===
      "regions[0].canvas.flow.blocks[0].props.role" &&
    one({ id: "canvas_tc", type: "category_nav", width: 100, height: "auto", props: { mode: "some" } }).path ===
      "regions[0].canvas.flow.blocks[0].props.mode" &&
    one({ id: "canvas_td", type: "logo", width: 100, height: 40, props: {} }).path ===
      "regions[0].canvas.flow.blocks[0].props.slot");

  check("[v2] divider 는 props 가 없어도 되고, 있어도 내용을 보지 않는다",
    one({ id: "canvas_te", type: "divider", width: 120, height: 1 }).ok === true &&
    one({ id: "canvas_tf", type: "divider", width: 120, height: 1, props: { whatever: 1 } }).ok === true);
}

/* ---- 2) main_visual · primary · pin/transform ---- */
{
  check("★ [v2] main_visual 의 baseWidth · baseHeight 는 양수 필수(프레임 내부 좌표의 자)",
    v2FailPath((d) => { v2Frame(d).baseWidth = 0; }) ===
      "regions[0].canvas.flow.blocks[4].props.baseWidth" &&
    v2FailPath((d) => { delete v2Frame(d).baseHeight; }) ===
      "regions[0].canvas.flow.blocks[4].props.baseHeight");

  check("★ [v2] elements 는 비어 있을 수 없다(최소한 primary 하나)",
    v2FailPath((d) => { v2Frame(d).elements = []; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements");

  check("★ [v2] transform 요소는 x · y 가 필요하고, pin 요소는 없어도 된다",
    v2FailPath((d) => { delete v2Frame(d).elements[1].x; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[1].x" &&
    v2Of(v2Full()).ok === true);

  check("★ [v2] follow 가 빠지면 transform 이다(그래서 x · y 를 요구한다)",
    v2FailPath((d) => {
      const el = v2Frame(d).elements[2];
      delete el.follow;
    }) === "regions[0].canvas.flow.blocks[4].props.elements[2].x");

  check("[v2] 안 쓰는 칸을 지우지 않는다 — pin 요소의 x·y 도, transform 요소의 pin 도 보존되고 모양만 본다",
    v2Of((() => { const d = v2Full(); v2Frame(d).elements[2].x = 12; v2Frame(d).elements[2].y = 4; return d; })()).ok === true &&
    v2Of((() => { const d = v2Full(); v2Frame(d).elements[0].pin = { anchor: "top" }; return d; })()).ok === true &&
    v2FailPath((d) => { v2Frame(d).elements[0].pin = { anchor: "north" }; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[0].pin.anchor");

  check("[v2] 모르는 follow 값은 거부",
    v2FailPath((d) => { v2Frame(d).elements[0].follow = "stick"; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[0].follow");

  check("★ [v2] primaryId 는 같은 프레임의 실제 요소를 가리켜야 한다",
    v2FailPath((d) => { v2Frame(d).primaryId = "canvas_o1number"; }) ===
      "regions[0].canvas.flow.blocks[4].props.primaryId" &&
    v2FailPath((d) => { delete v2Frame(d).primaryId; }) ===
      "regions[0].canvas.flow.blocks[4].props.primaryId");

  check("★ [v2] primaryId 가 가리키는 요소는 photo 여야 하고 hidden 일 수 없다",
    v2FailPath((d) => { v2Frame(d).primaryId = "canvas_m0paper"; }) ===
      "regions[0].canvas.flow.blocks[4].props.primaryId" &&
    v2FailPath((d) => { v2Frame(d).elements[1].hidden = true; }) ===
      "regions[0].canvas.flow.blocks[4].props.primaryId");

  check("[v2] 프레임 내부 요소는 프레임 밖 좌표도 쓸 수 있다(삐져나오는 것이 목적)",
    v2Of((() => { const d = v2Full(); v2Frame(d).elements[0].x = -400; v2Frame(d).elements[0].y = 900; return d; })()).ok === true);

  check("[v2] 그래도 v1 과 같은 자를 넘으면 거부(좌표 ±100000)",
    v2FailPath((d) => { v2Frame(d).elements[0].x = canvas.SKIN_HOME_CANVAS_MAX_COORD + 1; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[0].x");
}

/* ---- 3) overlay ---- */
{
  check("★ [v2] overlays 항목은 v1 요소 하나와 정확히 같은 모양이다",
    v2Of(v2Full()).ok === true &&
    v2FailPath((d) => { d.overlays[0].width = -1; }) === "regions[0].canvas.overlays[0].width" &&
    v2FailPath((d) => { d.overlays[0].type = "divider"; }) === "regions[0].canvas.overlays[0].type" &&
    v2FailPath((d) => { delete d.overlays[0].x; }) === "regions[0].canvas.overlays[0].x");

  check("[v2] overlays 는 배열이어야 한다",
    v2FailPath((d) => { d.overlays = { }; }) === "regions[0].canvas.overlays");
}

/* ---- 4) 전역 id 이름 공간 ---- */
{
  /*
    ★ 걸리는 자리는 **나중에 나온 쪽**이다 — 블록 → 프레임 내부 요소
      → overlay 순으로 걸으며 이름을 등록하므로, 같은 이름이 둘이면
      뒤에서 만난 자리가 오류 경로가 된다. 아래 셋은 그 셋을 각각
      뒤에 두어 확인한다.
  */
  check("★ [v2] 블록 · 프레임 내부 요소 · overlay 가 한 이름 공간이다",
    v2FailPath((d) => { v2Block(d, 1).id = "canvas_b1logo"; }) ===
      "regions[0].canvas.flow.blocks[1].id" &&
    v2FailPath((d) => { v2Frame(d).elements[0].id = "canvas_b1logo"; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[0].id" &&
    v2FailPath((d) => { d.overlays[0].id = "canvas_m1photo"; }) ===
      "regions[0].canvas.overlays[0].id" &&
    v2FailPath((d) => { d.overlays[0].id = "canvas_b3title"; }) ===
      "regions[0].canvas.overlays[0].id" &&
    v2FailPath((d) => { v2Frame(d).elements[2].id = "canvas_m0paper"; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[2].id");

  check("[v2] 블록 id 도 v1 의 edit-id 규칙을 쓴다",
    v2FailPath((d) => { v2Block(d, 0).id = "1logo"; }) ===
      "regions[0].canvas.flow.blocks[0].id" &&
    v2FailPath((d) => { v2Block(d, 0).id = "a.b"; }) ===
      "regions[0].canvas.flow.blocks[0].id" &&
    v2FailPath((d) => { delete v2Block(d, 0).id; }) ===
      "regions[0].canvas.flow.blocks[0].id");
}

/* ---- 5) 재귀 · 중첩 거부 ---- */
{
  check("★ [v2] main_visual 안에 main_visual 을 다시 넣을 수 없다",
    v2FailPath((d) => { v2Frame(d).elements[0].type = "main_visual"; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[0].type");

  check("★ [v2] container 도 없다(재귀 container 는 v2 첫 범위가 아니다)",
    v2FailPath((d) => { v2Frame(d).elements[0].type = "container"; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[0].type" &&
    v2FailPath((d) => { v2Block(d, 0).type = "container"; }) ===
      "regions[0].canvas.flow.blocks[0].type");

  check("[v2] overlay 도 main_visual 이 될 수 없다(자유 층은 v1 여섯 종류다)",
    v2FailPath((d) => { d.overlays[0].type = "main_visual"; }) ===
      "regions[0].canvas.overlays[0].type");
}

/* ---- 6) align · margin · gap · padding · anchor · origin ---- */
{
  check("★ [v2] align 은 네 값뿐이다(skin-layout.js 의 start/end 가 아니다)",
    canvas.SKIN_HOME_CANVAS_BLOCK_ALIGNS.join() === "left,center,right,stretch" &&
    v2FailPath((d) => { v2Block(d, 0).align = "start"; }) ===
      "regions[0].canvas.flow.blocks[0].align" &&
    v2FailPath((d) => { v2Block(d, 0).align = "baseline"; }) ===
      "regions[0].canvas.flow.blocks[0].align");

  check("★ [v2] margin 은 음수를 허용한다(일부러 겹치기 위해)",
    v2Of((() => { const d = v2Full(); v2Block(d, 1).margin = { top: -24, left: -8 }; return d; })()).ok === true &&
    v2FailPath((d) => { v2Block(d, 1).margin = { top: "8px" }; }) ===
      "regions[0].canvas.flow.blocks[1].margin.top" &&
    v2FailPath((d) => { v2Block(d, 1).margin = 8; }) ===
      "regions[0].canvas.flow.blocks[1].margin");

  check("[v2] flow.padding 도 같은 자를 쓴다",
    v2FailPath((d) => { d.flow.padding.left = NaN; }) === "regions[0].canvas.flow.padding.left" &&
    v2FailPath((d) => { d.flow.padding = [1, 2]; }) === "regions[0].canvas.flow.padding");

  check("[v2] flow.gap 은 유한한 숫자 · direction 은 column 하나",
    v2FailPath((d) => { d.flow.gap = "20px"; }) === "regions[0].canvas.flow.gap" &&
    v2FailPath((d) => { d.flow.direction = "row"; }) === "regions[0].canvas.flow.direction" &&
    v2Of((() => { const d = v2Full(); delete d.flow.direction; return d; })()).ok === true);

  check("★ [v2] pin 의 anchor · origin 은 아홉 점, target 은 둘, offset 은 숫자 둘",
    canvas.SKIN_HOME_CANVAS_PIN_POINTS.length === 9 &&
    v2FailPath((d) => { v2Frame(d).elements[2].pin.origin = "middle"; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[2].pin.origin" &&
    v2FailPath((d) => { v2Frame(d).elements[2].pin.target = "block"; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[2].pin.target" &&
    v2FailPath((d) => { v2Frame(d).elements[2].pin.offset = { x: "8" }; }) ===
      "regions[0].canvas.flow.blocks[4].props.elements[2].pin.offset.x");

  check("[v2] pin 의 네 칸은 전부 선택이다(빈 pin · pin 없는 pin 요소도 유효)",
    v2Of((() => { const d = v2Full(); v2Frame(d).elements[2].pin = {}; return d; })()).ok === true &&
    v2Of((() => { const d = v2Full(); delete v2Frame(d).elements[2].pin; return d; })()).ok === true);

  check("[v2] maxWidth · hidden · locked 도 모양은 본다",
    v2FailPath((d) => { v2Block(d, 1).maxWidth = 0; }) === "regions[0].canvas.flow.blocks[1].maxWidth" &&
    v2FailPath((d) => { v2Block(d, 1).hidden = "yes"; }) === "regions[0].canvas.flow.blocks[1].hidden" &&
    v2FailPath((d) => { v2Block(d, 1).locked = 1; }) === "regions[0].canvas.flow.blocks[1].locked");
}

/* ---- 7) 최상위 모양 · elements 금지 ---- */
{
  check("★ [v2] 최상위 elements 를 거부한다(v1 writer 가 v2 에 닿을 길을 막는다)",
    v2FailPath((d) => { d.elements = []; }) === "regions[0].canvas.elements" &&
    v2FailPath((d) => { d.elements = [element()]; }) === "regions[0].canvas.elements");

  check("★ [v2] baseWidth 는 390 · baseHeight 는 양수 필수(블록 합으로 계산하지 않는다)",
    v2FailPath((d) => { d.baseWidth = 375; }) === "regions[0].canvas.baseWidth" &&
    v2FailPath((d) => { delete d.baseHeight; }) === "regions[0].canvas.baseHeight" &&
    v2FailPath((d) => { d.baseHeight = 0; }) === "regions[0].canvas.baseHeight");

  check("★ [v2] flow 는 필수다(빠진 것을 빈 흐름으로 읽지 않는다)",
    v2FailPath((d) => { delete d.flow; }) === "regions[0].canvas.flow" &&
    v2FailPath((d) => { d.flow = { }; }) === "regions[0].canvas.flow.blocks");

  check("[v2] 오류 경로가 regions[n] 의 n 을 따라간다",
    (() => {
      const d = v2Full();
      v2Block(d, 2).width = -1;
      return okOf([{ name: "x" }, { name: "y" }, { name: "home_canvas", canvas: d }]).path ===
        "regions[2].canvas.flow.blocks[2].width";
    })());

  check("[v2] 블록 수 · 프레임 요소 수 · overlay 수 상한은 v1 의 그 자다",
    (() => {
      const over = canvas.SKIN_HOME_CANVAS_MAX_ELEMENTS + 1;
      const blocks = [];
      for (let i = 0; i < over; i++) {
        blocks.push({ id: `canvas_x${i}`, type: "divider", width: 10, height: 1 });
      }
      const d = v2Min();
      d.flow.blocks = blocks;
      return v2Of(d).path === "regions[0].canvas.flow.blocks";
    })());
}

/* ---- 8) 보존 · 불변 · 실행 안 함 ---- */
{
  const data = v2Full();
  data.futureCanvasField = { keep: true };
  data.flow.futureFlowField = "keep";
  data.flow.blocks[0].futureBlockField = 7;
  v2Frame(data).elements[0].futureElementField = "keep";
  data.overlays[0].futureOverlayField = [1, 2];

  check("★ [v2] 모르는 칸이 섞여 있어도 통과한다(보존 대상이다)",
    v2Of(data).ok === true, JSON.stringify(v2Of(data)));

  const regions = [{ name: "other", deep: { a: 1 } }, { name: "home_canvas", enabled: true, canvas: data }];
  const before = JSON.stringify(regions);

  canvas.validateSkinHomeCanvasRegions(regions);
  canvas.buildSkinCanvasRenderPayload(data);
  canvas.resolveSkinHomeCanvas(skinWith(regions), CANVAS_HTML);

  check("★ [v2] 어떤 판정 함수도 입력을 mutate 하지 않는다",
    JSON.stringify(regions) === before);

  const off = canvas.writeSkinHomeCanvasRegion(regions, { enabled: false });

  check("★ [v2] enabled:false 는 v2 데이터를 지우지 않고 모르는 칸도 남는다",
    off[1].enabled === false &&
    same(off[1].canvas, data) &&
    JSON.stringify(regions) === before);

  check("★ [v2] 유효한 v2 는 실행된다(V2-FLOW-RENDER-1 — 그 전까지는 payload 가 없었다)",
    (() => {
      const made = canvas.buildSkinCanvasRenderPayload(data);
      return (
        !!made && made.version === 2 &&
        !!canvas.buildSkinCanvasRenderPayload(v2Full()) &&
        !!canvas.buildSkinCanvasRenderPayload(v2Min()) &&
        !!canvas.resolveSkinHomeCanvas(skinWith(regions), CANVAS_HTML)
      );
    })());

  check("★ [v2] 실행 payload 에는 **모르는 칸이 하나도** 실리지 않는다(보존은 regions 의 몫)",
    (() => {
      const made = canvas.buildSkinCanvasRenderPayload(data);
      const text = JSON.stringify(made);
      return (
        text.indexOf("future") === -1 &&
        same(Object.keys(made).sort(), ["baseHeight", "baseWidth", "flow", "overlays", "version"])
      );
    })());

  check("★ [v2] 이미 저장된 **잘못된** v2 도 지우거나 고치지 않는다 — 실행만 안 한다",
    (() => {
      const bad = v2Full();
      v2Block(bad, 0).width = -5;
      const badRegions = [{ name: "home_canvas", canvas: bad }];
      const snapshot = JSON.stringify(badRegions);
      const payload = canvas.resolveSkinHomeCanvas(skinWith(badRegions), CANVAS_HTML);
      return payload === undefined && JSON.stringify(badRegions) === snapshot;
    })());

  check("★ [v2] v1 writer 가 v2 에 닿지 않는다(canvas.elements 가 없다)",
    (() => {
      const targets = ["canvas_b1logo", "canvas_m1photo", "canvas_o1number"];
      return targets.every((id) => {
        const moved = canvas.writeSkinHomeCanvasElementPosition(regions, id, { x: 1, y: 1 });
        const boxed = canvas.writeSkinHomeCanvasElementBox(regions, id, { x: 1, y: 1, width: 10, height: 10 });
        const turned = canvas.writeSkinHomeCanvasElementRotation(regions, id, { rotation: 10 });
        const typed = canvas.writeSkinHomeCanvasElementText(regions, id, { text: "x" });
        return [moved, boxed, turned, typed].every((r) => r.ok === false && r.reason === "canvas");
      }) && JSON.stringify(regions) === before;
    })());
}


/* ---------------------------------------------------------- */
console.log("\n[v2-payload] v2 실행용 payload (V2-FLOW-RENDER-1)");

/*
  ★ 여기서 재는 것은 **모양**이다 — 화면은 브라우저가 필요하고
    (skin/skin-home-canvas-render-e2e-test.mjs 의 [v2-flow] 절),
    봉투 통과는 아래 [protocol] 절이 잰다.

  ★ 기본값을 payload 가 채운다는 것이 이 절의 핵심이다. 검증기는
    "빠진 것과 기본값을 적은 것이 같은 뜻"이라고 말했으므로(§14-4)
    렌더러가 두 경우를 갈라 볼 이유가 없다 — 대신 `maxWidth` 처럼
    기본값이 **부재**인 칸은 채우지 않는다.
*/
{
  const payload = canvas.buildSkinCanvasRenderPayload(v2Full());

  const block = (i) => payload.flow.blocks[i];
  const frame = () => payload.flow.blocks[4].props;

  check("★ [v2-payload] 최상위는 다섯 칸 — elements 가 아니라 flow · overlays 다",
    same(Object.keys(payload).sort(), ["baseHeight", "baseWidth", "flow", "overlays", "version"]) &&
    payload.version === 2 && payload.baseWidth === 390 && payload.baseHeight === 1240,
    JSON.stringify(Object.keys(payload)));

  check("★ [v2-payload] 빠진 선택 칸을 채운다 — direction · padding 네 칸 · gap · align · margin 네 칸",
    same(Object.keys(payload.flow).sort(), ["blocks", "direction", "gap", "padding"]) &&
    payload.flow.direction === "column" &&
    same(payload.flow.padding, { top: 48, right: 24, bottom: 64, left: 24 }) &&
    payload.flow.gap === 20 &&
    /* 원본에 align 도 margin 도 없던 블록 */
    block(2).align === "center" &&
    same(block(0).margin, { top: 0, right: 0, bottom: 0, left: 0 }) &&
    same(block(1).margin, { top: 8, right: 0, bottom: 0, left: 0 }),
    JSON.stringify(block(0)));

  check("★ [v2-payload] maxWidth 는 **채우지 않는다**(기본값이 숫자가 아니라 부재다)",
    block(1).maxWidth === undefined &&
    (() => {
      const d = v2Full();
      d.flow.blocks[1].maxWidth = 320;
      return canvas.buildSkinCanvasRenderPayload(d).flow.blocks[1].maxWidth === 320;
    })());

  check("[v2-payload] 블록 칸 목록이 고정이다(maxWidth 만 조건부)",
    same(Object.keys(block(0)).sort(),
      ["align", "height", "hidden", "id", "locked", "margin", "props", "type", "width"]),
    JSON.stringify(Object.keys(block(0))));

  check("[v2-payload] 블록 순서 · height 의 숫자와 \"auto\" 가 그대로다",
    same(payload.flow.blocks.map((b) => b.id),
      ["canvas_b1logo", "canvas_b2nav", "canvas_b3title", "canvas_b4rule", "canvas_b5main"]) &&
    block(0).height === 40 && block(1).height === "auto" && block(3).height === 1);

  check("[v2-payload] 블록 props 는 v1 의 그 빌더가 만든다(기본값도 같다)",
    same(block(0).props, { slot: "title_logo", fallback: "site_title" }) &&
    same(block(1).props, { mode: "all", categoryIds: [] }) &&
    same(block(2).props, { text: "FOREVER YOUNG", role: "title" }) &&
    same(block(3).props, {}),
    JSON.stringify(block(3).props));

  check("★ [v2-payload] main_visual 의 내부 요소는 payload 에 실린다(렌더만 아직 외곽까지다)",
    same(Object.keys(frame()).sort(), ["baseHeight", "baseWidth", "elements", "primaryId"]) &&
    frame().baseWidth === 300 && frame().baseHeight === 380 &&
    frame().primaryId === "canvas_m1photo" &&
    frame().elements.length === 4);

  check("★ [v2-payload] follow 가 쓰는 칸만 실린다 — transform 은 x·y, pin 은 pin",
    (() => {
      const paper = frame().elements[0];
      const label = frame().elements[2];
      return (
        paper.follow === "transform" && paper.x === -18 && paper.y === 26 &&
        paper.pin === undefined &&
        label.follow === "pin" && label.x === undefined && label.y === undefined &&
        same(label.pin, { target: "photo", anchor: "left", origin: "right", offset: { x: 8, y: -40 } })
      );
    })(), JSON.stringify(frame().elements[2]));

  check("[v2-payload] pin 의 빠진 칸은 frame · center · center · {0,0} 이다",
    (() => {
      const d = v2Full();
      d.flow.blocks[4].props.elements[2].pin = {};
      const made = canvas.buildSkinCanvasRenderPayload(d);
      return same(made.flow.blocks[4].props.elements[2].pin,
        { target: "frame", anchor: "center", origin: "center", offset: { x: 0, y: 0 } });
    })());

  check("[v2-payload] follow 가 빠지면 transform 이고 x·y 가 실린다",
    (() => {
      const d = v2Full();
      delete d.flow.blocks[4].props.elements[1].follow;
      const made = canvas.buildSkinCanvasRenderPayload(d).flow.blocks[4].props.elements[1];
      return made.follow === "transform" && made.x === 0 && made.y === 0;
    })());

  check("★ [v2-payload] overlays 는 v1 요소 payload 와 **글자 단위로 같은 모양**이다",
    same(Object.keys(payload.overlays[0]).sort(),
      ["height", "hidden", "id", "locked", "props", "rotation", "type", "width", "x", "y"]) &&
    payload.overlays[0].rotation === 0 &&
    payload.overlays[0].hidden === false &&
    same(payload.overlays[0].props, { text: "01", role: "label" }));

  check("[v2-payload] overlays 가 없으면 빈 배열이다(칸 없음과 장식 없음을 가르지 않는다)",
    same(canvas.buildSkinCanvasRenderPayload(v2Min()).overlays, []) &&
    same(canvas.buildSkinCanvasRenderPayload(v2Min()).flow.blocks, []));

  check("★ [v2-payload] 결과는 새 리터럴 — 입력의 어떤 객체도 그대로 실리지 않는다",
    (() => {
      const source = v2Full();
      const made = canvas.buildSkinCanvasRenderPayload(source);
      return (
        made.flow !== source.flow &&
        made.flow.blocks[0] !== source.flow.blocks[0] &&
        made.flow.blocks[0].props !== source.flow.blocks[0].props &&
        made.flow.padding !== source.flow.padding &&
        made.overlays[0] !== source.overlays[0]
      );
    })());

  check("★ [v2-payload] 봉투에서 돌아온 값이 같은 규칙으로 다시 옮겨진다(왕복 고정점)",
    same(canvas.coerceSkinHomeCanvasRenderPayload(payload), payload));

  check("[v2-payload] 깨진 v2 는 payload 를 만들지 않는다(조용히 그 블록만 빼지 않는다)",
    (() => {
      const d = v2Full();
      d.flow.blocks[2].width = -1;
      return canvas.buildSkinCanvasRenderPayload(d) === undefined;
    })());

  check("★ [v2-payload] version 3 은 여전히 실행되지 않는다(모르는 version 은 보존만)",
    canvas.buildSkinCanvasRenderPayload({ version: 3, flow: { blocks: [] } }) === undefined);
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
  /* 계약은 세 파일이다(HOME-CANVAS-CODE-SPLIT-1). 진입 문서와 같은
     순서로, 공통 파일 다음에 싣는다 — version 분기가 v2 파일의
     이름을 call time 에 찾는다. */
  read("skin/skin-home-canvas-v2.js") + "\n" +
  read("skin/skin-home-canvas-write.js") + "\n" +
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

  const withV2 =
    templateApi.resolveSkinTemplate(skinWith([{ name: "home_canvas", enabled: true, canvas: v2Full() }]), "home");

  check("★ [template] v2 도 같은 자리에 실린다(V2-FLOW-RENDER-1)",
    !!withV2.canvas && withV2.canvas.version === 2 &&
    withV2.canvas.flow.blocks.length === 5 && withV2.canvas.overlays.length === 1,
    JSON.stringify(withV2.canvas && Object.keys(withV2.canvas)));

  check("★ [template] v2 도 CATEGORY · POST 에는 싣지 않는다",
    templateApi.resolveSkinTemplate(skinWith([{ name: "home_canvas", canvas: v2Full() }]), "category").canvas === undefined &&
    templateApi.resolveSkinTemplate(skinWith([{ name: "home_canvas", canvas: v2Full() }]), "post").canvas === undefined);

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
    ["모르는 version", { version: 3, baseWidth: 390, elements: [] }],
    /* ★ V2-FLOW-RENDER-1 전에는 "v2 라서" 거부였다. 지금 거부되는
       이유는 다르다 — **payload 가 아닌** 생 v2 이기 때문이다(선택
       칸이 채워져 있지 않다). 봉투는 언제나 실행용 payload 만 받는다. */
    ["채워지지 않은 생 v2", { version: 2, baseWidth: 390, baseHeight: 844, flow: { blocks: [] }, overlays: [] }],
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

  check("★ [protocol] strict allowlist — 열세 가지를 전부 거부",
    rejects.length === 0, rejects.map((r) => r[0]).join(", "));
}

/* ---- v2 봉투 (HOME-CANVAS-V2-FLOW-RENDER-1) ---- */
{
  const v2Payload = canvas.buildSkinCanvasRenderPayload(v2Full());

  check("★ [protocol] 계약 파일이 만든 **v2** payload 를 프로토콜이 받는다",
    protocol.isSandboxTemplate(envelope({ canvas: v2Payload })) === true);

  /* 한 칸만 망가뜨린다 — 전부 payload 에서 출발한다 */
  const broken = (mutate) => {
    const value = clone(v2Payload);
    mutate(value);
    return protocol.isSandboxTemplate(envelope({ canvas: value }));
  };

  const v2Rejects = [
    ["모르는 최상위 칸", (v) => { v.background = "#fff"; }],
    ["v1 의 elements 가 섞임", (v) => { v.elements = []; }],
    ["flow 없음", (v) => { delete v.flow; }],
    ["overlays 없음", (v) => { delete v.overlays; }],
    ["모르는 flow 칸", (v) => { v.flow.wrap = true; }],
    ["direction 이 row", (v) => { v.flow.direction = "row"; }],
    ["padding 이 네 칸이 아님", (v) => { delete v.flow.padding.left; }],
    ["모르는 블록 칸", (v) => { v.flow.blocks[0].z = 3; }],
    ["블록이 아닌 종류(v1 의 photo)", (v) => { v.flow.blocks[0].type = "photo"; }],
    ["logo 의 auto 높이", (v) => { v.flow.blocks[0].height = "auto"; }],
    ["블록 width 가 auto", (v) => { v.flow.blocks[0].width = "auto"; }],
    ["모르는 align", (v) => { v.flow.blocks[0].align = "start"; }],
    ["margin 이 채워지지 않음", (v) => { delete v.flow.blocks[0].margin; }],
    ["maxWidth 가 0", (v) => { v.flow.blocks[1].maxWidth = 0; }],
    ["divider 에 props 가 생김", (v) => { v.flow.blocks[3].props = { kind: "line" }; }],
    ["프레임 요소가 비어 있음", (v) => { v.flow.blocks[4].props.elements = []; }],
    ["primaryId 가 없는 id", (v) => { v.flow.blocks[4].props.primaryId = "canvas_nope"; }],
    ["primary 가 photo 가 아님", (v) => { v.flow.blocks[4].props.primaryId = "canvas_m0paper"; }],
    ["프레임 안에 프레임", (v) => { v.flow.blocks[4].props.elements[0].type = "main_visual"; }],
    ["transform 인데 좌표 없음", (v) => { delete v.flow.blocks[4].props.elements[0].x; }],
    ["pin 인데 좌표가 함께 옴", (v) => { v.flow.blocks[4].props.elements[2].x = 0; }],
    ["pin 인데 pin 이 없음", (v) => { delete v.flow.blocks[4].props.elements[2].pin; }],
    ["모르는 anchor", (v) => { v.flow.blocks[4].props.elements[2].pin.anchor = "middle"; }],
    ["모르는 follow", (v) => { v.flow.blocks[4].props.elements[0].follow = "none"; }],
    ["overlay 가 블록 종류", (v) => { v.overlays[0].type = "divider"; }],
    ["id 가 두 층에서 겹침", (v) => { v.overlays[0].id = "canvas_b1logo"; }],
    ["id 가 블록과 프레임에서 겹침", (v) => { v.flow.blocks[0].id = "canvas_m1photo"; }]
  ].filter(([, mutate]) => broken(mutate) !== false);

  check("★ [protocol] v2 strict allowlist — 스물일곱 가지를 전부 거부",
    v2Rejects.length === 0, v2Rejects.map((r) => r[0]).join(", "));

  check("[protocol] v2 값 목록도 계약 파일과 글자 단위로 같다",
    protocol.SANDBOX_CANVAS_V2_VERSION === canvas.SKIN_HOME_CANVAS_V2_VERSION &&
    same(protocol.SANDBOX_CANVAS_BLOCK_TYPES, canvas.SKIN_HOME_CANVAS_BLOCK_TYPES) &&
    same(protocol.SANDBOX_CANVAS_BLOCK_AUTO_HEIGHT_TYPES, canvas.SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES) &&
    same(protocol.SANDBOX_CANVAS_BLOCK_ALIGNS, canvas.SKIN_HOME_CANVAS_BLOCK_ALIGNS) &&
    same(protocol.SANDBOX_CANVAS_FLOW_DIRECTIONS, canvas.SKIN_HOME_CANVAS_FLOW_DIRECTIONS) &&
    same(protocol.SANDBOX_CANVAS_EDGES, canvas.SKIN_HOME_CANVAS_EDGES) &&
    same(protocol.SANDBOX_CANVAS_FOLLOW_MODES, canvas.SKIN_HOME_CANVAS_FOLLOW_MODES) &&
    same(protocol.SANDBOX_CANVAS_PIN_TARGETS, canvas.SKIN_HOME_CANVAS_PIN_TARGETS) &&
    same(protocol.SANDBOX_CANVAS_PIN_POINTS, canvas.SKIN_HOME_CANVAS_PIN_POINTS));
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

{
  /* HOME-CANVAS-RENDER-1A · 1B — 정적 렌더러는 renderSkin() 을 실제로
     부르는 **세** 문서에 있다. 파일은 한 벌뿐이고 sandbox 전용 렌더러는
     없다(계약 문서 §12). */

  const renderPaths = [
    ["index.html", "./skin/skin-home-canvas-render.js"],
    ["studio/preview/preview-frame.html", "../../skin/skin-home-canvas-render.js"],
    ["skin/sandbox/frame.html", "/skin/skin-home-canvas-render.js"]
  ];

  const missing =
    renderPaths.filter(([file, p]) => read(file).indexOf(p) === -1);

  check("★ [docs] 세 진입 문서(공개 · Studio Preview · sandbox 프레임)가 렌더러를 로드한다",
    missing.length === 0, missing.map((m) => m[0]).join(", "));

  {
    /* RENDER-1B — 프레임이 실제로 받으려면 JS 와 CSS 가 **둘 다**
       sandbox origin allowlist 에 있어야 한다. 하나만 있으면 같은
       스킨이 프레임에서만 좌표 없이 그려진다. */
    const allow = read("core/lib/skin-sandbox-server.js");

    check("★ [docs] sandbox allowlist 에 렌더러 JS 와 좌표 CSS 가 둘 다 있다",
      /"\/skin\/skin-home-canvas-render\.js"/.test(allow) &&
      /"\/skin\/skin-home-canvas-render\.css"/.test(allow));
  }

  {
    /* ★ 함정. Studio sandbox Preview 는 template 을 **알려진 키만**
       새 리터럴로 옮겨 프레임에 보낸다(studio/preview/preview-sandbox.js).
       거기에 canvas 줄이 없으면 그 한 화면에서만 캔버스가 조용히
       빠진다 — js · sides · settings 가 같은 이유로 그 파일에 적혀 있다. */
    const previewSandbox = read("studio/preview/preview-sandbox.js");

    check("★ [docs] Studio sandbox Preview 가 template.canvas 를 계약 파일로 옮긴다",
      previewSandbox.indexOf("coerceSkinHomeCanvasRenderPayload") !== -1 &&
      previewSandbox.indexOf("template.canvas") !== -1);
  }

  check("[docs] 렌더러와 좌표 CSS 가 실제로 있다",
    fs.existsSync(path.join(ROOT, "skin/skin-home-canvas-render.js")) &&
    fs.existsSync(path.join(ROOT, "skin/skin-home-canvas-render.css")));

  check("★ [docs] 좌표 CSS 에 색 · 글꼴이 없다(캔버스가 디자인을 강제하지 않는다)",
    !/(^|[\s;{])(color|background|background-color|font-family|font-size|box-shadow)\s*:/m
      .test(read("skin/skin-home-canvas-render.css").replace(/\/\*[\s\S]*?\*\//g, "")));

  check("[docs] 표시 위치 속성 이름이 계약 파일과 같다",
    require(path.join(HERE, "skin-home-canvas-render.js")).SKIN_CANVAS_RENDER_ROOT_ATTR ===
    canvas.SKIN_HOME_CANVAS_ROOT_ATTR);

  check("★ [docs] 렌더러의 요소 id · 슬롯 이름 규칙이 계약 파일과 같다",
    require(path.join(HERE, "skin-home-canvas-render.js"))
      .SKIN_CANVAS_RENDER_ELEMENT_ID_PATTERN.source ===
      canvas.SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.source &&
    require(path.join(HERE, "skin-home-canvas-render.js"))
      .SKIN_CANVAS_RENDER_SLOT_NAME_PATTERN.source ===
      canvas.SKIN_HOME_CANVAS_SLOT_NAME_PATTERN.source);

  {
    /* =====================================================
       HOME-CANVAS-V2-MAIN-VISUAL-1 — 프레임 내부의 자

       렌더러는 pin 의 아홉 점을 **자기 표**로 갖는다(의존 없이 그릴 수
       있어야 한다 — 요소 id 규칙과 같은 사정). 두 벌이 갈라지면 어떤
       anchor 가 조용히 center 로 떨어진다.
    ===================================================== */

    const render = require(path.join(HERE, "skin-home-canvas-render.js"));

    check("★ [docs] 렌더러의 pin 아홉 점이 계약 파일의 목록과 글자 단위로 같다",
      JSON.stringify(Object.keys(render.SKIN_CANVAS_RENDER_PIN_FRACTIONS).sort()) ===
      JSON.stringify(canvas.SKIN_HOME_CANVAS_PIN_POINTS.slice().sort()),
      Object.keys(render.SKIN_CANVAS_RENDER_PIN_FRACTIONS).join(" "));

    check("[docs] 빠진 anchor · origin 의 기본값이 계약과 같다(center)",
      render.SKIN_CANVAS_RENDER_PIN_DEFAULT_POINT === "center" &&
      canvas.SKIN_HOME_CANVAS_PIN_POINTS.indexOf("center") !== -1);

    /* ---- 프레임 폭을 푸는 식이 CSS 와 같은가 (§23-6 의 그 calc) ---- */

    const metrics = { width: 350, height: 930 };

    const widthOf = (block) => render.resolveSkinCanvasBlockWidth(block, metrics);

    check("★ [frame] align 이 stretch 가 아니면 프레임 폭은 저장된 width 다",
      widthOf({ align: "center", width: 300 }) === 300 &&
      widthOf({ width: 120 }) === 120);

    check("★ [frame] stretch 는 가용 폭에서 좌우 margin 을 뺀 만큼이다(350−8−12)",
      widthOf({ align: "stretch", width: 340, margin: { left: 8, right: 12 } }) === 330);

    check("★ [frame] stretch + maxWidth 는 거기서 멈춘다(더 크면 무시한다)",
      widthOf({ align: "stretch", width: 340, maxWidth: 120 }) === 120 &&
      widthOf({ align: "stretch", width: 340, maxWidth: 999 }) === 350);

    check("[frame] 자가 0 이하면 폭을 지어내지 않는다(null)",
      render.resolveSkinCanvasBlockWidth({ align: "center", width: 300 }, { width: 0, height: 930 }) === null &&
      widthOf({ align: "stretch", width: 340, margin: { left: 400 } }) === null);

    /* ---- height:"auto" 는 primary 사진 상자의 비율이다 (§14-5) ---- */

    const frameBlock = (over) => Object.assign({
      id: "canvas_m", type: "main_visual", width: 300, height: 200, align: "center",
      props: {
        baseWidth: 150, baseHeight: 80, primaryId: "canvas_mphoto",
        elements: [
          { id: "canvas_mphoto", type: "photo", follow: "transform",
            x: 10, y: 5, width: 100, height: 50, props: { slot: "photo_1" } }
        ]
      }
    }, over || {});

    const fixed = render.resolveSkinCanvasFrameGeometry(frameBlock(), metrics);

    check("★ [frame] S_frame 은 **가로 배율 하나**다(300 / 150 = 2)",
      fixed.scale === 2 && fixed.width === 300 && fixed.height === 200,
      JSON.stringify(fixed));

    check("★ [frame] pin.target:\"photo\" 의 상자는 S_frame 을 받은 사진 상자다",
      JSON.stringify(fixed.photo) === JSON.stringify({ x: 20, y: 10, width: 200, height: 100 }),
      JSON.stringify(fixed.photo));

    const auto = render.resolveSkinCanvasFrameGeometry(frameBlock({ height: "auto" }), metrics);

    check("★ [frame] height \"auto\" 의 높이는 사진 비율이다(300 × 50/100 = 150)",
      auto.height === 150 && auto.ratioWidth === 100 && auto.ratioHeight === 50,
      JSON.stringify({ h: auto.height, r: [auto.ratioWidth, auto.ratioHeight] }));

    check("★ [frame] 그 비율은 props.baseWidth/baseHeight(150:80 → 160)가 아니다",
      auto.height !== 160);

    check("[frame] 내부 요소가 비면 프레임의 자를 만들지 않는다(빈 상자로 남는다)",
      render.resolveSkinCanvasFrameGeometry(
        frameBlock({ props: { baseWidth: 150, baseHeight: 80, primaryId: "x", elements: [] } }),
        metrics
      ) === null);
  }

  {
    /* =====================================================
       HOME-CANVAS-V2-EDITOR-1A — v2 불변 writer 가 실려 있는가

       v1 writer 와 **같은 자리**에 있어야 한다. 한 문서에서만 빠지면
       그 화면에서만 v2 편집이 조용히 죽는다 — v1 writer 는 v2 데이터에
       닿을 수 없으므로 대신 받아 주지도 않는다.
    ===================================================== */

    const docs = [
      "index.html",
      "studio/index.html",
      "skin/sandbox/frame.html",
      "studio/preview/preview-frame.html",
      "studio/studio-lifecycle-scenario.html"
    ];

    const missing =
      docs.filter((file) => read(file).indexOf("skin-home-canvas-write-v2.js") === -1);

    check("★ [docs] v1 writer 를 싣는 문서가 v2 writer 도 싣는다",
      missing.length === 0, missing.join(", "));

    const orderBroken =
      docs.filter((file) => {
        const text = read(file);
        return text.indexOf("skin-home-canvas-write-v2.js") <
          text.indexOf("skin-home-canvas-v2.js");
      });

    check("★ [docs] v2 writer 는 v2 값 표(skin-home-canvas-v2.js) **다음**이다",
      orderBroken.length === 0, orderBroken.join(", "));

    check("[docs] sandbox allowlist 에도 있다",
      /"\/skin\/skin-home-canvas-write-v2\.js"/.test(read("core/lib/skin-sandbox-server.js")));

    /* ★ v1 writer 는 여전히 v2 에 닿지 않는다 — 그 한 줄이 두 파일을
       가르는 근거다(§14-9 함정 2 · 계약 §25-1) */
    const v2Regions = [{
      name: "home_canvas",
      enabled: true,
      canvas: {
        version: 2, baseWidth: 390, baseHeight: 900,
        flow: { direction: "column", padding: {}, gap: 0, blocks: [
          { id: "canvas_b1", type: "text", width: 100, height: "auto", props: { text: "a" } }
        ] },
        overlays: []
      }
    }];

    check("★ [docs] v1 writer 는 v2 데이터를 고치지 못한다(reason: canvas)",
      canvas.writeSkinHomeCanvasElementText(v2Regions, "canvas_b1", { text: "b" }).reason === "canvas");

    const written =
      canvas.writeSkinHomeCanvasV2NodeText(v2Regions, "canvas_b1", { text: "b" }, { text: "a" });

    check("★ [docs] v2 writer 는 같은 데이터를 고치고 입력을 mutate 하지 않는다",
      written.ok === true &&
      written.regions[0].canvas.flow.blocks[0].props.text === "b" &&
      v2Regions[0].canvas.flow.blocks[0].props.text === "a");
  }
}

check("[docs] 계약 문서가 있고 색인에 적혀 있다",
  fs.existsSync(path.join(ROOT, "docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md")) &&
  /IMORY_HOME_CANVAS_CONTRACT\.md/.test(read("docs/INDEX.md")) &&
  /skin-home-canvas-test\.mjs/.test(read("docs/TESTS.md")));


/* ---------------------------------------------------------- */
/*
  [manual] 수동 테스트 스킨 (HOME-CANVAS-MILESTONE-1)

  skin/test-skins/imory-home-canvas-manual-v1.json 은 주인이 Studio
  에서 직접 Import 해서 이동 · 리사이즈 · 회전을 **손으로** 확인하는
  파일이다. Studio 에 Canvas 생성 UI 가 아직 없어서(로드맵
  ELEMENTS-1) 그 파일이 없으면 배포된 화면에서 시험할 방법이 없다.

  여기서 보는 것은 브라우저가 필요 없는 것들이다 — 계약 통과 ·
  표식 1개 · resolve · id 유일 · 순서 보존 · 빌더 재현성. Import
  검증 · 실제 렌더 · Export→Import 왕복 · sandbox parity 는 브라우저
  가 필요하다(studio/studio-home-canvas-manual-skin-e2e-test.mjs).

  ★ 이 파일이 제품 기본 스킨을 건드리지 않는다는 것도 여기서 본다 —
    기본 스킨(imory-editorial-default-v2.json)에 home_canvas 나 표식이
    생기면 "가입할 때 자동으로 캔버스가 붙는" 변경이므로 즉시 실패해야
    한다.
*/
console.log("\n[manual] 수동 테스트 스킨");

const MANUAL_REL = "skin/test-skins/imory-home-canvas-manual-v1.json";

check("[manual] JSON 과 builder 가 둘 다 있다",
  fs.existsSync(path.join(ROOT, MANUAL_REL)) &&
  fs.existsSync(path.join(ROOT, "skin/test-skins/build-home-canvas-manual-v1.mjs")));

{
  const manual = JSON.parse(read(MANUAL_REL));

  const region =
    canvas.readSkinHomeCanvasRegion(manual);

  check("[manual] home_canvas region 이 하나 있고 켜져 있다",
    !!region && region.enabled === true);

  const verdict =
    canvas.validateSkinHomeCanvasRegions(manual.regions);

  check("★ [manual] 새 Import 의 계약 검증을 통과한다",
    verdict.ok === true,
    verdict.ok ? "" : `${verdict.path || ""} ${verdict.message || ""}`);

  check("★ [manual] HOME 에 표시 위치가 **정확히 하나**다",
    canvas.countSkinHomeCanvasRoots(manual.templates.home.html) === 1,
    String(canvas.countSkinHomeCanvasRoots(manual.templates.home.html)));

  /* 다른 화면에는 표식을 두지 않았다 — 이번 마일스톤은 HOME 이다 */
  check("[manual] CATEGORY · POST · BANNER · FOLDER 에는 표식이 없다",
    ["category", "post", "banner", "folder"].every((key) =>
      canvas.countSkinHomeCanvasRoots(manual.templates[key].html) === 0));

  /* POST · FOLDER 의 본문 자리 — 기존 Import 계약 */
  check("[manual] POST · FOLDER 에 본문 자리(post-body region)가 있다",
    ['post', 'folder'].every((key) =>
      manual.templates[key].html.indexOf('data-imory-region="post-body"') !== -1));

  const els = region.canvas.elements;

  check("★ [manual] element id 가 전부 유일하다",
    new Set(els.map((el) => el.id)).size === els.length,
    `${els.length}개`);

  /* resolve — 실행용 payload 가 만들어지는가(표식 · 데이터 둘 다 필요) */
  const payload =
    canvas.resolveSkinHomeCanvas(manual, manual.templates.home.html);

  check("★ [manual] resolveSkinHomeCanvas 가 실행용 payload 를 만든다",
    !!payload && payload.elements.length === els.length &&
    payload.baseWidth === 390 && payload.baseHeight === 844,
    payload ? `${payload.elements.length}개` : "payload 없음");

  check("★ [manual] 요소 순서가 payload 에서도 배열 그대로다(= 앞뒤 순서)",
    !!payload &&
    payload.elements.map((el) => el.id).join() === els.map((el) => el.id).join());

  /* 이번 마일스톤이 손으로 확인하려는 구조가 실제로 들어 있는가.
     하나라도 빠지면 안내문의 그 단계를 시험할 수 없다. */
  const kinds = els.map((el) => el.type);

  check("[manual] 잠긴 배경이 도화지 전체를 덮는다",
    els.some((el) =>
      el.locked === true && el.type === "shape" &&
      el.x <= 0 && el.y <= 0 &&
      el.width >= region.canvas.baseWidth &&
      el.height >= region.canvas.baseHeight));

  check("[manual] photo · sticker · logo · category_nav 가 있다",
    ["photo", "sticker", "logo", "category_nav"].every((t) => kinds.includes(t)),
    kinds.join(" "));

  check('[manual] height:"auto" 글자와 숫자 height 요소가 둘 다 있다',
    els.some((el) => el.height === "auto" && el.type === "text") &&
    els.some((el) => typeof el.height === "number"));

  check("[manual] 초기 rotation 이 있는 요소가 둘 이상이다",
    els.filter((el) => typeof el.rotation === "number" && el.rotation !== 0).length >= 2,
    String(els.filter((el) => el.rotation).length));

  check("[manual] 도화지 밖으로 일부 나간 장식이 있다(음수 x)",
    els.some((el) => el.x < 0));

  /* 겹침 — 회전을 뺀 축 정렬 상자로 본다(겹쳤다는 사실만 보면 된다) */
  const overlaps = (a, b) => {
    const ah = typeof a.height === "number" ? a.height : 40;
    const bh = typeof b.height === "number" ? b.height : 40;
    return a.x < b.x + b.width && b.x < a.x + a.width &&
      a.y < b.y + bh && b.y < a.y + ah;
  };

  const movable = els.filter((el) => !el.locked);

  check("[manual] 서로 일부 겹친 요소가 있다",
    movable.some((a, i) =>
      movable.slice(i + 1).some((b) => overlaps(a, b))));

  /* 이미지 슬롯 — 세 종류가 선언돼 있고 저장소에 그림이 없다 */
  const slots = (manual.imageSlots || []).map((s) => s.name);

  check("★ [manual] photo · sticker · logo 의 슬롯이 imageSlots 에 나온다",
    els
      .filter((el) => ["photo", "sticker", "logo"].includes(el.type))
      .every((el) => slots.includes(el.props.slot)),
    slots.join(" "));

  check("[manual] 슬롯 이름이 snake_case 규칙을 지킨다",
    slots.every((name) => canvas.SKIN_HOME_CANVAS_SLOT_NAME_PATTERN.test(name)));

  check("[manual] 필수 이미지가 없다(그림 없이도 시험할 수 있다)",
    (manual.imageSlots || []).every((s) => s.required !== true));

  check("[manual] metadata 제목에 수동 테스트용임이 적혀 있다",
    /manual test/i.test(String(manual.metadata.title)),
    String(manual.metadata.title));

  /* 빌더 재현성 — JSON 을 손으로만 관리하지 않는다 */
  const builder =
    read("skin/test-skins/build-home-canvas-manual-v1.mjs");

  check("[manual] builder 가 그 JSON 파일을 쓴다",
    builder.indexOf("imory-home-canvas-manual-v1.json") !== -1);
}

/*
  ★ 기본 스킨 불변 — 이번 라운드가 건드리지 않았다는 것을 파일로
    확인한다. 여기가 깨지면 "가입하면 캔버스가 자동으로 붙는다"는
    뜻이므로 계약 §3 위반이다.
*/
check("★ [manual] 제품 기본 스킨에는 캔버스가 없다(자동 삽입 0)",
  (() => {
    const base = read("skin/test-skins/imory-editorial-default-v2.json");
    return base.indexOf("home_canvas") === -1 &&
      base.indexOf("data-imory-canvas-root") === -1;
  })());


/* =========================================================
   [ux-fix] — 직접 조작 사용성의 순수 helper 둘
   (HOME-CANVAS-MANUAL-UX-FIX-1 — 계약 §21-1 · §21-2)

   ★ 편집기 runtime 이 **export 한 그 함수**를 부른다. 여기에 식을
     다시 적으면 두 벌이 되고, 나중에 한쪽만 바뀐다.

   회전 자석은 각도 하나를 받아 각도 하나를 돌려주고, 비율 유지는
   px 넷과 Canvas 좌표 둘을 받아 px 짝을 돌려준다 — 둘 다 DOM 도
   Moveable 도 보지 않으므로 여기서 경계를 직접 찍을 수 있다.
========================================================== */

console.log(`\n[ux-fix]`);

{
  const runtime =
    await import(
      "file://" +
      path.join(HERE, "skin-home-canvas-editor-runtime.js").replace(/\\\\/g, "/")
    );

  const snap = runtime.snapCanvasRotation;
  const keep = runtime.canvasResizeKeepRatioBox;

  check("[ux-fix] runtime 이 두 helper 를 내보낸다",
    typeof snap === "function" && typeof keep === "function");

  /* ── 30° 자석 — 붙는 경계는 ±4° 다(계약 §21-1) ── */

  const cases = [
    [0, 0], [25, 25], [26, 30], [30, 30], [34, 30], [35, 35],
    [56, 60], [86, 90], [90, 90], [356, 360], [360, 360],
    [15, 15], [45, 45], [44, 44], [46, 46],
    [-26, -30], [-34, -30], [-35, -35], [-25, -25], [-4, 0], [-5, -5],
    [380, 380], [386, 390], [385, 385], [720, 720], [716, 720]
  ];

  const wrong =
    cases.filter(([input, want]) => snap(input) !== want)
      .map(([input, want]) => `${input}->${snap(input)}(기대 ${want})`);

  check("★ [ux-fix] 30° 자석은 ±4° 안에서만 붙는다 — 26 개 경계",
    wrong.length === 0, wrong.join(" · ") || `${cases.length} 개 전부 일치`);

  check("★ [ux-fix] 양자화가 아니다 — 흡착 범위 밖은 받은 각도 그대로",
    snap(25) === 25 && snap(35) === 35 && snap(47) === 47 && snap(100) === 100,
    `25/35/47/100 -> ${[25, 35, 47, 100].map(snap).join("/")}`);

  check("[ux-fix] 붙는 양은 최대 4° 다(어느 입력에서도 크게 튀지 않는다)",
    (() => {
      for (let deg = -400; deg <= 400; deg += 0.25) {
        if (Math.abs(snap(deg) - deg) > 4 + 1e-9) return false;
      }
      return true;
    })());

  check("[ux-fix] 자석은 단조 비감소다(제스처 중 화면이 거꾸로 돌지 않는다)",
    (() => {
      let last = -Infinity;
      for (let deg = -400; deg <= 400; deg += 0.25) {
        const value = snap(deg);
        if (value < last - 1e-9) return false;
        last = value;
      }
      return true;
    })());

  check("[ux-fix] 유한하지 않은 값은 그대로 돌려준다(판정만 한다)",
    Number.isNaN(snap(NaN)) && snap(Infinity) === Infinity);

  /* ── 모서리 비율 유지 — 정사영(계약 §21-2) ── */

  /* 90×60 상자를 대각선으로 (25, 25) 끌었다 */
  const box = keep(90, 60, 115, 85, 90, 60);

  check("★ [ux-fix] 모서리는 시작 비율을 지킨다 — 90:60",
    box && Math.abs(box[0] / box[1] - 90 / 60) < 1e-9,
    JSON.stringify(box));

  check("[ux-fix] 정사영이라 손이 간 방향을 따라간다(두 축 모두 늘었다)",
    box && box[0] > 90 && box[1] > 60, JSON.stringify(box));

  /* 납작한 글자 상자 — 축 하나를 고르는 방식이 튀던 자리 */
  const flat = keep(120, 21, 150, 51, 120, 21);

  check("★ [ux-fix] 납작한 상자에서도 비율이 그대로다 — 120:21",
    flat && Math.abs(flat[0] / flat[1] - 120 / 21) < 1e-9,
    JSON.stringify(flat));

  check("★ [ux-fix] 납작한 상자의 가로가 튀지 않는다(정사영 34.2 · 축 선택이면 171)",
    flat && Math.abs(flat[0] - 154.2) < 0.5, JSON.stringify(flat));

  /* 가로로만 끈 모서리 · 세로로만 끈 모서리 */
  const onlyX = keep(90, 60, 130, 60, 90, 60);
  const onlyY = keep(90, 60, 90, 100, 90, 60);

  check("[ux-fix] 가로로만 끌어도 세로가 비율만큼 따라온다",
    onlyX && onlyX[1] > 60 && Math.abs(onlyX[0] / onlyX[1] - 1.5) < 1e-9,
    JSON.stringify(onlyX));

  check("★ [ux-fix] 세로로만 끌어도 움직인다(가로만 보는 방식은 여기서 멈춘다)",
    onlyY && onlyY[0] > 90 && Math.abs(onlyY[0] / onlyY[1] - 1.5) < 1e-9,
    JSON.stringify(onlyY));

  /* height:"auto" — 기준 세로가 렌더된 값이다 */
  const auto = keep(120, 22.75, 160, 22.75, 120, 22.75);

  check('[ux-fix] "auto" 의 렌더된 세로를 기준으로도 비율이 성립한다',
    auto && Math.abs(auto[0] / auto[1] - 120 / 22.75) < 1e-9,
    JSON.stringify(auto));

  /* 변화 0 */
  const zero = keep(90, 60, 90, 60, 90, 60);

  check("★ [ux-fix] 변화량 0 이면 시작 크기 그대로다(클릭이 크기를 바꾸지 않는다)",
    zero && zero[0] === 90 && zero[1] === 60, JSON.stringify(zero));

  /* 축소 · 한계 */
  const shrunk = keep(90, 60, 50, 30, 90, 60);

  check("[ux-fix] 줄일 때도 비율이 같다",
    shrunk && Math.abs(shrunk[0] / shrunk[1] - 1.5) < 1e-9 && shrunk[0] < 90,
    JSON.stringify(shrunk));

  check("[ux-fix] 한계까지 줄여도 px 1 아래로 내려가지 않는다",
    (() => {
      const tiny = keep(90, 60, -500, -500, 90, 60);
      return tiny && tiny[0] >= 1 && tiny[1] >= 1;
    })());

  check("[ux-fix] 못 쓸 입력에서는 null 이다(그 판에서는 자유 비율로 돈다)",
    keep(0, 60, 10, 10, 90, 60) === null &&
    keep(90, 60, NaN, 10, 90, 60) === null &&
    keep(90, 60, 10, 10, 90, 0) === null);

  /* px 시작값은 dist 에만 들어간다 — 저장 비율은 Canvas 좌표가 정한다 */
  const skewed = keep(200, 40, 240, 40, 90, 60);

  check("★ [ux-fix] 비율의 기준은 px 상자가 아니라 Canvas 좌표 둘이다",
    skewed &&
    Math.abs((skewed[0] - 200) / (skewed[1] - 40) - 90 / 60) < 1e-9,
    JSON.stringify(skewed));
}


/* ---------------------------------------------------------- */
/*
  [v2-free] 프레임 내부 요소 · overlay 의 자리 writer
            (HOME-CANVAS-V2-EDITOR-1B)

  브라우저가 필요 없는 것만 본다 — **어떤 칸이 저장되고 무엇이
  보존되는가**. 자를 만드는 계산(프레임 폭 · pin 기준점)과 화면
  좌표는 브라우저가 필요하다
  (studio/studio-home-canvas-inspector-e2e-test.mjs --only=v2free).
*/
console.log("\n[v2-free] 프레임 내부 · overlay 의 자리 writer (V2-EDITOR-1B)");

{
  const freeRegions = () => [
    { name: "some_other", enabled: true, payload: { keep: true } },
    {
      name: "home_canvas",
      enabled: true,
      note: "unknown-entry",
      canvas: {
        version: 2,
        baseWidth: 390,
        baseHeight: 900,
        extra: "unknown-canvas",
        flow: {
          direction: "column",
          padding: { top: 10 },
          gap: 8,
          blocks: [
            { id: "canvas_b0", type: "text", width: 200, height: "auto",
              props: { text: "a" } },
            {
              id: "canvas_main", type: "main_visual", width: 300, height: 200,
              align: "center",
              props: {
                baseWidth: 150, baseHeight: 100, primaryId: "canvas_photo",
                elements: [
                  { id: "canvas_photo", type: "photo", follow: "transform",
                    x: 10, y: 5, width: 120, height: 80, zzz: "keep-el",
                    props: { slot: "photo_1" } },
                  { id: "canvas_tag", type: "text", follow: "pin",
                    width: 60, height: 20, rotation: 8,
                    x: 999, y: 999,
                    pin: {
                      target: "photo", anchor: "right", origin: "left",
                      offset: { x: 6, y: 0 }, mystery: "keep-pin"
                    },
                    props: { text: "tag" } }
                ]
              }
            }
          ]
        },
        overlays: [
          { id: "canvas_over", type: "text", x: 20, y: 700,
            width: 120, height: 40, props: { text: "o" } }
        ]
      }
    }
  ];

  const nodeOf = (regions, id) => {
    const c = regions[1].canvas;
    const block = c.flow.blocks.find((b) => b.id === id);
    if (block) return block;
    for (const b of c.flow.blocks) {
      const hit = ((b.props && b.props.elements) || []).find((e) => e.id === id);
      if (hit) return hit;
    }
    return c.overlays.find((e) => e.id === id) || null;
  };

  /* ---- overlay — v1 요소와 같은 칸 ---- */

  const movedOverlay =
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_over", { x: 44, y: 701 }, { x: 20, y: 700 });

  check("★ [v2-free] overlay 의 x · y 를 쓴다",
    movedOverlay.ok === true &&
    nodeOf(movedOverlay.regions, "canvas_over").x === 44 &&
    nodeOf(movedOverlay.regions, "canvas_over").y === 701 &&
    nodeOf(movedOverlay.regions, "canvas_over").width === 120,
    JSON.stringify(nodeOf(movedOverlay.regions, "canvas_over")));

  check("[v2-free] expected 가 다르면 거부다",
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_over", { x: 44, y: 1 }, { x: 21, y: 700 }
    ).reason === "expected");

  check("[v2-free] 같은 값이면 unchanged(기록도 dirty 도 없다)",
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_over", { x: 20, y: 700 }, { x: 20, y: 700 }
    ).unchanged === true);

  /* ---- 내부 transform ---- */

  const movedInner =
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_photo", { x: 12.5, y: 5 }, { x: 10, y: 5 });

  check("★ [v2-free] 프레임 내부 transform 요소도 x · y 를 쓴다 · 모르는 칸 보존",
    movedInner.ok === true &&
    nodeOf(movedInner.regions, "canvas_photo").x === 12.5 &&
    nodeOf(movedInner.regions, "canvas_photo").zzz === "keep-el" &&
    nodeOf(movedInner.regions, "canvas_photo").props.slot === "photo_1",
    JSON.stringify(nodeOf(movedInner.regions, "canvas_photo")));

  check("★ [v2-free] 다른 요소 · 다른 블록 · overlay · 모르는 항목이 그대로다",
    nodeOf(movedInner.regions, "canvas_tag").pin.offset.x === 6 &&
    nodeOf(movedInner.regions, "canvas_b0").props.text === "a" &&
    nodeOf(movedInner.regions, "canvas_over").x === 20 &&
    movedInner.regions[0].payload.keep === true &&
    movedInner.regions[1].note === "unknown-entry" &&
    movedInner.regions[1].canvas.extra === "unknown-canvas");

  const resizedInner =
    canvas.writeSkinHomeCanvasV2NodeBox(
      freeRegions(), "canvas_photo",
      { x: 10, y: 5, width: 130, height: 90 },
      { x: 10, y: 5, width: 120, height: 80 });

  check("★ [v2-free] 리사이즈는 네 칸을 함께 쓴다",
    resizedInner.ok === true &&
    same(
      (({ x, y, width, height }) => ({ x, y, width, height }))(
        nodeOf(resizedInner.regions, "canvas_photo")),
      { x: 10, y: 5, width: 130, height: 90 }));

  check("★ [v2-free] photo 에는 height \"auto\" 를 쓸 수 없다(v1 §6 의 표)",
    canvas.writeSkinHomeCanvasV2NodeBox(
      freeRegions(), "canvas_photo",
      { x: 10, y: 5, width: 130, height: "auto" },
      { x: 10, y: 5, width: 120, height: 80 }
    ).reason === "auto");

  check("★ [v2-free] 블록 id 로는 좌표를 쓸 수 없다(블록의 자리는 좌표가 아니다)",
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_main", { x: 1, y: 1 }, { x: 0, y: 0 }
    ).reason === "kind" &&
    canvas.writeSkinHomeCanvasV2NodeRotation(
      freeRegions(), "canvas_b0", { rotation: 5 }, { rotation: 0 }
    ).reason === "kind");

  /* ---- 내부 pin ---- */

  check("★ [v2-free] pin 요소에는 좌표 writer 가 닿지 않는다(reason: pin)",
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_tag", { x: 1, y: 1 }, { x: 0, y: 0 }
    ).reason === "pin" &&
    canvas.writeSkinHomeCanvasV2NodeBox(
      freeRegions(), "canvas_tag",
      { x: 1, y: 1, width: 60, height: 20 },
      { x: 0, y: 0, width: 60, height: 20 }
    ).reason === "pin");

  check("★ [v2-free] transform 요소 · overlay 에는 pin writer 가 닿지 않는다",
    canvas.writeSkinHomeCanvasV2NodePinOffset(
      freeRegions(), "canvas_photo", { offsetX: 1, offsetY: 1 },
      { offsetX: 0, offsetY: 0 }
    ).reason === "pin" &&
    canvas.writeSkinHomeCanvasV2NodePinOffset(
      freeRegions(), "canvas_over", { offsetX: 1, offsetY: 1 },
      { offsetX: 0, offsetY: 0 }
    ).reason === "kind");

  const movedPin =
    canvas.writeSkinHomeCanvasV2NodePinOffset(
      freeRegions(), "canvas_tag",
      { offsetX: -4.25, offsetY: 12 }, { offsetX: 6, offsetY: 0 });

  check("★ [v2-free] pin 은 offset 두 칸만 쓴다 — target · anchor · origin 은 그대로",
    movedPin.ok === true &&
    same(nodeOf(movedPin.regions, "canvas_tag").pin, {
      target: "photo", anchor: "right", origin: "left",
      offset: { x: -4.25, y: 12 }, mystery: "keep-pin"
    }),
    JSON.stringify(nodeOf(movedPin.regions, "canvas_tag").pin));

  check("★ [v2-free] pin 을 옮겨도 안 쓰는 x · y 와 크기 · 각도는 손대지 않는다",
    nodeOf(movedPin.regions, "canvas_tag").x === 999 &&
    nodeOf(movedPin.regions, "canvas_tag").width === 60 &&
    nodeOf(movedPin.regions, "canvas_tag").rotation === 8);

  const resizedPin =
    canvas.writeSkinHomeCanvasV2NodePinBox(
      freeRegions(), "canvas_tag",
      { offsetX: 6, offsetY: 0, width: 72, height: "auto" },
      { offsetX: 6, offsetY: 0, width: 60, height: 20 });

  check("★ [v2-free] pin 리사이즈는 offset 둘 + 크기 둘이다(text 는 auto 를 쓴다)",
    resizedPin.ok === true &&
    nodeOf(resizedPin.regions, "canvas_tag").width === 72 &&
    nodeOf(resizedPin.regions, "canvas_tag").height === "auto" &&
    nodeOf(resizedPin.regions, "canvas_tag").pin.offset.x === 6,
    JSON.stringify(nodeOf(resizedPin.regions, "canvas_tag")));

  check("[v2-free] pin 의 expected 는 저장된 offset 이다(빠진 pin 은 0 으로 읽는다)",
    canvas.writeSkinHomeCanvasV2NodePinOffset(
      freeRegions(), "canvas_tag", { offsetX: 1, offsetY: 1 },
      { offsetX: 0, offsetY: 0 }
    ).reason === "expected");

  /* ---- rotation — 두 규칙이 같은 칸 ---- */

  const turnedInner =
    canvas.writeSkinHomeCanvasV2NodeRotation(
      freeRegions(), "canvas_photo", { rotation: -12.5 }, { rotation: 0 });

  check("★ [v2-free] rotation 이 없는 요소의 지금 값은 0 이다(그 칸이 생긴다)",
    turnedInner.ok === true &&
    nodeOf(turnedInner.regions, "canvas_photo").rotation === -12.5 &&
    nodeOf(turnedInner.regions, "canvas_photo").x === 10);

  const turnedPin =
    canvas.writeSkinHomeCanvasV2NodeRotation(
      freeRegions(), "canvas_tag", { rotation: 20 }, { rotation: 8 });

  check("★ [v2-free] pin 장식도 같은 칸을 돈다 — pin 은 한 글자도 안 바뀐다",
    turnedPin.ok === true &&
    nodeOf(turnedPin.regions, "canvas_tag").rotation === 20 &&
    nodeOf(turnedPin.regions, "canvas_tag").pin.offset.x === 6);

  /* ---- 허용 키 · 모르는 키 · v1 데이터 ---- */

  check("★ [v2-free] 모르는 키가 섞이면 메시지 전체를 거부한다",
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_over", { x: 1, y: 2, width: 3 }, { x: 20, y: 700 }
    ).reason === "keys" &&
    canvas.writeSkinHomeCanvasV2NodeRotation(
      freeRegions(), "canvas_over", { rotation: 1, x: 2 }, { rotation: 0 }
    ).reason === "keys" &&
    canvas.writeSkinHomeCanvasV2NodeBox(
      freeRegions(), "canvas_over", { x: 1, y: 2 },
      { x: 20, y: 700, width: 120, height: 40 }
    ).reason === "keys");

  check("★ [v2-free] v1 canvas 에는 닿지 않는다(reason: canvas)",
    canvas.writeSkinHomeCanvasV2NodePosition(
      [canvasRegion()], "canvas_photo1", { x: 1, y: 2 }, { x: 20, y: 120 }
    ).reason === "canvas");

  check("[v2-free] 없는 id · 범위 밖 값은 거부",
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_nope", { x: 1, y: 2 }, { x: 0, y: 0 }
    ).reason === "missing" &&
    canvas.writeSkinHomeCanvasV2NodePosition(
      freeRegions(), "canvas_over", { x: 1e9, y: 2 }, { x: 20, y: 700 }
    ).reason === "coord" &&
    canvas.writeSkinHomeCanvasV2NodeBox(
      freeRegions(), "canvas_over",
      { x: 1, y: 2, width: 0, height: 40 },
      { x: 20, y: 700, width: 120, height: 40 }
    ).reason === "size");

  check("★ [v2-free] 입력을 한 칸도 mutate 하지 않는다",
    (() => {
      const input = freeRegions();
      const before = JSON.stringify(input);
      canvas.writeSkinHomeCanvasV2NodePinBox(
        input, "canvas_tag",
        { offsetX: 1, offsetY: 2, width: 70, height: 30 },
        { offsetX: 6, offsetY: 0, width: 60, height: 20 });
      canvas.writeSkinHomeCanvasV2NodeBox(
        input, "canvas_photo",
        { x: 1, y: 2, width: 70, height: 30 },
        { x: 10, y: 5, width: 120, height: 80 });
      return JSON.stringify(input) === before;
    })());

  /* ---- 고친 결과가 계약을 그대로 통과한다 ---- */

  check("★ [v2-free] 고친 canvas 가 검증을 그대로 통과한다(Save → 다시 열기)",
    canvas.validateSkinCanvasData(
      resizedPin.regions[1].canvas, "regions[1].canvas").ok === true &&
    canvas.validateSkinCanvasData(
      movedPin.regions[1].canvas, "regions[1].canvas").ok === true);

  /* ---- Studio 문서가 자를 재는 파일을 싣는가 ---- */

  {
    const docs = ["studio/index.html", "studio/studio-lifecycle-scenario.html"];

    const missingRender =
      docs.filter((file) => read(file).indexOf("skin-home-canvas-render.js") === -1);

    check("★ [v2-free] Studio 문서가 자를 재는 렌더러 파일을 싣는다(계약 §26-3)",
      missingRender.length === 0, missingRender.join(", "));

    const missingSpace =
      docs.filter((file) => read(file).indexOf("studio-canvas-v2-space.js") === -1);

    check("★ [v2-free] Studio 문서가 자 파일을 싣는다",
      missingSpace.length === 0, missingSpace.join(", "));

    /* ★ 로드 줄만 센다 — 주석에 파일 이름이 먼저 나올 수 있다.
       두 문서가 쓰는 표기는 다르지만(loadVersionedScripts 의 배열
       ↔ script src) 둘 다 닫는 따옴표로 끝난다. */
    const orderBroken =
      docs.filter((file) => {
        const text = read(file);
        return text.indexOf('studio-canvas-v2-space.js"') <
          text.indexOf('skin-home-canvas-render.js"');
      });

    check("[v2-free] 자 파일은 렌더러 **다음**이다",
      orderBroken.length === 0, orderBroken.join(", "));
  }
}



/* ---------------------------------------------------------- */
/*
  [v2-add] 새 재료 하나 (HOME-CANVAS-V2-ADD-1)

  브라우저가 필요 없는 것만 본다 — **무엇이 만들어지고 무엇이
  거부되며 무엇이 그대로 남는가**. 패널 · 선택 · Undo · Preview 는
  브라우저가 필요하다
  (studio/studio-home-canvas-inspector-e2e-test.mjs --only=v2add).
*/
console.log("\n[v2-add] 새 재료 하나 (V2-ADD-1)");

{
  const addRegions = () => [
    { name: "some_other", enabled: true, payload: { keep: true } },
    {
      name: "home_canvas",
      enabled: true,
      note: "unknown-entry",
      canvas: {
        version: 2,
        baseWidth: 390,
        baseHeight: 900,
        extra: "unknown-canvas",
        flow: {
          direction: "column",
          padding: { top: 40, right: 24, bottom: 40, left: 24 },
          gap: 10,
          zzz: "unknown-flow",
          blocks: [
            { id: "canvas_b0", type: "text", width: 200, height: "auto",
              mystery: "keep-block", props: { text: "a" } }
          ]
        },
        overlays: [
          { id: "canvas_over", type: "text", x: 20, y: 700,
            width: 120, height: 40, props: { text: "o" } }
        ]
      }
    }
  ];

  const add = (target, type, slot) =>
    canvas.writeSkinHomeCanvasV2AddNode(
      addRegions(),
      slot === undefined ? { target, type } : { target, type, slot });

  const blocksOf = (r) => r.regions[1].canvas.flow.blocks;
  const overlaysOf = (r) => r.regions[1].canvas.overlays;
  const lastBlock = (r) => blocksOf(r)[blocksOf(r).length - 1];
  const lastOverlay = (r) => overlaysOf(r)[overlaysOf(r).length - 1];

  /* ---- 흐름의 다섯 ---- */

  {
    const made =
      canvas.SKIN_HOME_CANVAS_BLOCK_TYPES.map((type) => add("flow", type, "photo_1"));

    check("★ [v2-add] 자동 배치 블록 다섯 종류가 다 만들어진다",
      made.every((r) => r.ok === true),
      made.map((r, i) =>
        `${canvas.SKIN_HOME_CANVAS_BLOCK_TYPES[i]}:${r.ok ? "ok" : r.reason}`).join(" "));

    check("★ [v2-add] 만든 뒤의 canvas 가 계약을 그대로 통과한다",
      made.every((r) =>
        canvas.validateSkinCanvasData(
          r.regions[1].canvas, "regions[1].canvas").ok === true));

    check("★ [v2-add] 폭은 흐름의 가용 폭이 정한다(390 − 좌우 padding = 342)",
      lastBlock(add("flow", "text", "photo_1")).width === 342 &&
      lastBlock(add("flow", "divider")).width === 342 &&
      lastBlock(add("flow", "logo", "photo_1")).width === 160,
      JSON.stringify([
        lastBlock(add("flow", "text")).width,
        lastBlock(add("flow", "logo", "photo_1")).width
      ]));

    check("★ [v2-add] 글자만 \"auto\" 높이다(카테고리는 숫자 — 빈 목록에서 0 이 되지 않게)",
      lastBlock(add("flow", "text")).height === "auto" &&
      typeof lastBlock(add("flow", "category_nav")).height === "number" &&
      typeof lastBlock(add("flow", "logo", "photo_1")).height === "number",
      JSON.stringify([
        lastBlock(add("flow", "text")).height,
        lastBlock(add("flow", "category_nav")).height
      ]));

    check("[v2-add] 새 글자에는 읽을 내용이 있다(빈 문자열이면 잡을 것이 없다)",
      lastBlock(add("flow", "text")).props.text.length > 0);

    check("★ [v2-add] 맨 뒤에 붙고 기존 블록은 그대로다",
      blocksOf(add("flow", "divider")).length === 2 &&
      blocksOf(add("flow", "divider"))[0].id === "canvas_b0" &&
      blocksOf(add("flow", "divider"))[0].mystery === "keep-block");
  }

  /* ---- main_visual — primary 사진을 함께 만든다 ---- */

  {
    const made =
      add("flow", "main_visual", "photo_1");

    const frame =
      lastBlock(made);

    const primary =
      frame.props.elements.find((el) => el.id === frame.props.primaryId);

    check("★ [v2-add] main_visual 은 primary 사진을 함께 만든다",
      made.ok === true &&
      frame.props.elements.length === 1 &&
      !!primary && primary.type === "photo" &&
      primary.props.slot === "photo_1",
      JSON.stringify(frame.props));

    check("★ [v2-add] primary 사진이 프레임 내부 자를 꽉 채운다(auto 높이의 비율)",
      primary.width === frame.props.baseWidth &&
      primary.height === frame.props.baseHeight &&
      primary.x === 0 && primary.y === 0 &&
      frame.height === "auto");

    check("★ [v2-add] 프레임 id 와 사진 id 가 서로 다르고 둘 다 규칙을 지킨다",
      frame.id !== primary.id &&
      canvas.SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(frame.id) &&
      canvas.SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(primary.id),
      `${frame.id} / ${primary.id}`);
  }

  /* ---- 페이지 자유 장식 ---- */

  {
    const made =
      canvas.SKIN_HOME_CANVAS_ELEMENT_TYPES.map((type) => add("overlay", type, "photo_1"));

    check("★ [v2-add] 페이지 자유 장식은 v1 여섯 종류가 다 만들어진다",
      made.every((r) => r.ok === true),
      made.map((r, i) =>
        `${canvas.SKIN_HOME_CANVAS_ELEMENT_TYPES[i]}:${r.ok ? "ok" : r.reason}`).join(" "));

    const shape =
      lastOverlay(add("overlay", "shape"));

    check("★ [v2-add] 자유 장식은 도화지 좌표와 크기를 갖는다",
      typeof shape.x === "number" && typeof shape.y === "number" &&
      shape.width > 0 && shape.height > 0 && shape.props.kind === "rect",
      JSON.stringify(shape));

    /* 두 번째는 조금 밀려 있다 — 같은 자리에 겹쳐 쌓이면 뒤엣것을
       잡을 수 없다 */
    const twice =
      canvas.writeSkinHomeCanvasV2AddNode(
        add("overlay", "shape").regions, { target: "overlay", type: "shape" });

    const stacked =
      twice.regions[1].canvas.overlays.slice(-2);

    check("★ [v2-add] 새 장식이 같은 자리에 겹쳐 쌓이지 않는다",
      twice.ok === true && stacked[0].x !== stacked[1].x,
      JSON.stringify(stacked.map((el) => [el.x, el.y])));
  }

  /* ---- 자리마다 받는 종류가 다르다 ---- */

  check("★ [v2-add] 흐름은 블록 다섯만 받는다(photo · sticker · shape 는 블록이 아니다)",
    add("flow", "photo", "photo_1").reason === "type" &&
    add("flow", "sticker", "photo_1").reason === "type" &&
    add("flow", "shape").reason === "type");

  check("★ [v2-add] 자유 층은 main_visual 을 받지 않는다(프레임은 흐름의 것이다)",
    add("overlay", "main_visual", "photo_1").reason === "type" &&
    add("overlay", "divider").reason === "type");

  /* ★ `"frame"` 은 HOME-CANVAS-V2-ELEMENTS-1 에서 **실제 자리**가
     됐다(계약 §28-2). 그래서 모르는 자리의 예를 바꾸고, 프레임 자리는
     [v2-elements] 절이 따로 본다. */
  check("[v2-add] 모르는 자리 · 모양이 아닌 요청은 거부",
    add("nowhere", "text").reason === "target" &&
    canvas.writeSkinHomeCanvasV2AddNode(addRegions(), null).reason === "shape");

  /* ---- 슬롯 ---- */

  check("★ [v2-add] 사진이 들어가는 종류는 슬롯 이름이 필요하다",
    add("flow", "logo").reason === "slot" &&
    add("flow", "main_visual").reason === "slot" &&
    add("overlay", "photo").reason === "slot" &&
    add("overlay", "sticker").reason === "slot");

  check("[v2-add] 슬롯 이름 규칙은 이미지 슬롯의 그것이다",
    add("overlay", "photo", "Photo 1").reason === "slot" &&
    add("overlay", "photo", "").reason === "slot");

  check("★ [v2-add] 슬롯은 이름만 본다 — 그림이 없어도 만들어진다",
    add("overlay", "photo", "not_bound_yet").ok === true);

  check("[v2-add] 슬롯이 필요 없는 종류에는 슬롯을 적지 않는다",
    lastBlock(add("flow", "divider", "photo_1")).props === undefined &&
    lastOverlay(add("overlay", "shape", "photo_1")).props.slot === undefined);

  /* ---- 보존 · 불변 ---- */

  check("★ [v2-add] 모르는 항목 · 모르는 칸 · 다른 층이 그대로다",
    (() => {
      const r = add("overlay", "text");
      return (
        r.regions[0].payload.keep === true &&
        r.regions[1].note === "unknown-entry" &&
        r.regions[1].canvas.extra === "unknown-canvas" &&
        r.regions[1].canvas.flow.zzz === "unknown-flow" &&
        r.regions[1].canvas.flow.blocks.length === 1 &&
        r.regions[1].canvas.overlays[0].id === "canvas_over"
      );
    })());

  check("★ [v2-add] 입력을 한 칸도 mutate 하지 않는다",
    (() => {
      const input = addRegions();
      const before = JSON.stringify(input);
      canvas.writeSkinHomeCanvasV2AddNode(input, { target: "flow", type: "text" });
      canvas.writeSkinHomeCanvasV2AddNode(
        input, { target: "overlay", type: "photo", slot: "photo_1" });
      return JSON.stringify(input) === before;
    })());

  check("★ [v2-add] 새 id 는 이 캔버스 안에서 유일하다",
    (() => {
      const r = add("flow", "main_visual", "photo_1");
      const ids = canvas.listSkinHomeCanvasV2Nodes(r.regions[1].canvas).map((n) => n.id);
      return ids.length === new Set(ids).size && ids.length === 4;
    })());

  /* ---- v1 에는 닿지 않는다 ---- */

  check("★ [v2-add] v1 canvas 에는 닿지 않는다(reason: canvas)",
    canvas.writeSkinHomeCanvasV2AddNode(
      [{ name: "home_canvas", enabled: true,
         canvas: { version: 1, baseWidth: 390, baseHeight: 844, elements: [] } }],
      { target: "flow", type: "text" }
    ).reason === "canvas");

  /* ---- Studio 문서가 그 파일을 싣는가 ---- */

  {
    const docs = ["studio/index.html", "studio/studio-lifecycle-scenario.html"];

    const missing =
      docs.filter((file) => read(file).indexOf("studio-canvas-add-v2.js") === -1);

    check("★ [v2-add] Studio 문서가 추가 패널 파일을 싣는다",
      missing.length === 0, missing.join(", "));

    /* 앞 파일의 최상위 함수를 호출 시점에 쓴다 — 그 **뒤**여야 한다 */
    const orderBroken =
      docs.filter((file) => {
        const text = read(file);
        return text.indexOf('studio-canvas-add-v2.js"') <
          text.indexOf('studio-canvas-inspector-v2.js"');
      });

    check("[v2-add] 추가 패널 파일은 v2 Inspector **다음**이다",
      orderBroken.length === 0, orderBroken.join(", "));
  }
}


/* =========================================================
  [v2-elements] 소속과 따라가기 (HOME-CANVAS-V2-ELEMENTS-1)

  브라우저가 필요 없는 것만 본다 — **무엇이 옮겨지고 무엇이
  거부되며 무엇이 그대로 남는가**. 좌표를 계산하는 자(프레임의
  페이지 자리)와 패널 · Undo · Preview 는 브라우저가 필요하다
  (studio/studio-home-canvas-inspector-e2e-test.mjs --only=v2elements).
========================================================== */
console.log("\n[v2-elements] 소속과 따라가기 (V2-ELEMENTS-1)");

{
  const elRegions = () => [
    { name: "some_other", enabled: true, payload: { keep: true } },
    {
      name: "home_canvas",
      enabled: true,
      note: "unknown-entry",
      canvas: {
        version: 2,
        baseWidth: 390,
        baseHeight: 900,
        extra: "unknown-canvas",
        flow: {
          direction: "column",
          padding: { top: 40, right: 24, bottom: 40, left: 24 },
          gap: 10,
          zzz: "unknown-flow",
          blocks: [
            { id: "canvas_b0", type: "text", width: 200, height: "auto",
              mystery: "keep-block", props: { text: "a" } },
            { id: "canvas_main", type: "main_visual", width: 300, height: 200,
              align: "center", odd: "keep-block",
              props: {
                baseWidth: 150, baseHeight: 100, primaryId: "canvas_photo",
                strange: "keep-props",
                elements: [
                  { id: "canvas_photo", type: "photo", follow: "transform",
                    x: 10, y: 5, width: 120, height: 80,
                    props: { slot: "photo_1" } },
                  { id: "canvas_tag", type: "text", follow: "pin",
                    width: 60, height: 20, weird: "keep-element",
                    pin: { target: "photo", anchor: "right", origin: "left",
                           offset: { x: 6, y: 0 }, extra: "keep-pin" },
                    props: { text: "tag" } }
                ]
              } }
          ]
        },
        overlays: [
          { id: "canvas_over", type: "text", x: 20, y: 700, width: 120,
            height: 40, rotation: 12, hidden: false, locked: false,
            odd: "keep-overlay", props: { text: "o" } }
        ]
      }
    }
  ];

  const canvasOf = (result) => result.regions[1].canvas;
  const framesOf = (result) => canvasOf(result).flow.blocks;
  const innerOf = (result) => framesOf(result)[1].props.elements;
  const overlaysOf = (result) => canvasOf(result).overlays;

  const nodeIn = (list, id) => list.find((item) => item.id === id) || null;


  /* ---- 묶기 ---- */

  const attached =
    canvas.writeSkinHomeCanvasV2AttachNode(elRegions(), {
      id: "canvas_over", frameId: "canvas_main",
      next: { x: 4, y: 8, width: 40, height: 20 }
    });

  check("★ [v2-elements] 묶기는 overlay 를 프레임 내부 **맨 뒤**로 옮긴다",
    attached.ok === true &&
    overlaysOf(attached).length === 0 &&
    innerOf(attached).length === 3 &&
    innerOf(attached)[2].id === "canvas_over",
    JSON.stringify(innerOf(attached).map((node) => node.id)));

  check("★ [v2-elements] 묶인 장식은 transform 과 프레임 내부 좌표를 받는다",
    (() => {
      const node = nodeIn(innerOf(attached), "canvas_over");
      return node.follow === "transform" &&
        node.x === 4 && node.y === 8 && node.width === 40 && node.height === 20;
    })(),
    JSON.stringify(nodeIn(innerOf(attached), "canvas_over")));

  check("★ [v2-elements] id · 각도 · props · 모르는 칸은 그대로다",
    (() => {
      const node = nodeIn(innerOf(attached), "canvas_over");
      return node.id === "canvas_over" && node.rotation === 12 &&
        node.props.text === "o" && node.odd === "keep-overlay";
    })(),
    "묶기는 소속과 좌표계만 옮긴다(§14-7)");

  check("[v2-elements] 프레임이 아닌 id 로는 묶을 수 없다",
    canvas.writeSkinHomeCanvasV2AttachNode(elRegions(), {
      id: "canvas_over", frameId: "canvas_b0",
      next: { x: 1, y: 1, width: 10, height: 10 }
    }).reason === "frame");

  check("[v2-elements] 프레임 내부 요소를 다시 묶을 수는 없다",
    canvas.writeSkinHomeCanvasV2AttachNode(elRegions(), {
      id: "canvas_tag", frameId: "canvas_main",
      next: { x: 1, y: 1, width: 10, height: 10 }
    }).reason === "kind");

  check("[v2-elements] 좌표 · 크기는 v1 과 같은 자로 검사한다",
    canvas.writeSkinHomeCanvasV2AttachNode(elRegions(), {
      id: "canvas_over", frameId: "canvas_main",
      next: { x: 1, y: 1, width: 0, height: 10 }
    }).reason === "size" &&
    canvas.writeSkinHomeCanvasV2AttachNode(elRegions(), {
      id: "canvas_over", frameId: "canvas_main",
      next: { x: "1", y: 1, width: 10, height: 10 }
    }).reason === "coord" &&
    canvas.writeSkinHomeCanvasV2AttachNode(elRegions(), {
      id: "canvas_over", frameId: "canvas_main",
      next: { x: 1, y: 1, width: 10 }
    }).reason === "keys");


  /* ---- 빼기 ---- */

  const detached =
    canvas.writeSkinHomeCanvasV2DetachNode(elRegions(), {
      id: "canvas_tag", next: { x: 100, y: 200, width: 60, height: 20 }
    });

  check("★ [v2-elements] 빼기는 프레임 내부 요소를 overlays **맨 뒤**로 옮긴다",
    detached.ok === true &&
    innerOf(detached).length === 1 &&
    overlaysOf(detached).length === 2 &&
    overlaysOf(detached)[1].id === "canvas_tag",
    JSON.stringify(overlaysOf(detached).map((node) => node.id)));

  check("★ [v2-elements] 뺀 장식은 도화지 좌표를 받고 follow · pin 은 보존된다",
    (() => {
      const node = nodeIn(overlaysOf(detached), "canvas_tag");
      return node.x === 100 && node.y === 200 &&
        node.follow === "pin" && node.pin.anchor === "right" &&
        node.pin.extra === "keep-pin" && node.weird === "keep-element";
    })(),
    "overlay 에서는 읽지 않는 칸이고(§14-8), 다시 묶으면 살아난다");

  check("★ [v2-elements] primary 사진은 뺄 수 없다",
    canvas.writeSkinHomeCanvasV2DetachNode(elRegions(), {
      id: "canvas_photo", next: { x: 1, y: 1, width: 10, height: 10 }
    }).reason === "primary");


  /* ---- 삭제 ---- */

  const removedTag =
    canvas.writeSkinHomeCanvasV2RemoveNode(elRegions(), { id: "canvas_tag" });

  check("★ [v2-elements] 프레임 내부 장식을 지운다",
    removedTag.ok === true &&
    innerOf(removedTag).length === 1 &&
    overlaysOf(removedTag).length === 1,
    JSON.stringify(innerOf(removedTag).map((node) => node.id)));

  check("★ [v2-elements] primary 사진은 지울 수 없다",
    canvas.writeSkinHomeCanvasV2RemoveNode(elRegions(), { id: "canvas_photo" })
      .reason === "primary",
    "프레임 계약을 깨는 동작은 이름 있는 이유로 먼저 막는다");

  const removedBlock =
    canvas.writeSkinHomeCanvasV2RemoveNode(elRegions(), { id: "canvas_main" });

  check("★ [v2-elements] 블록을 지우면 그 안의 장식도 함께 없어진다",
    removedBlock.ok === true &&
    framesOf(removedBlock).length === 1 &&
    canvas.findSkinHomeCanvasV2Node(canvasOf(removedBlock), "canvas_tag") === null,
    "프레임이 곧 그 요소들의 자리다");

  check("[v2-elements] overlay 도 지운다 · 없는 id 는 거부",
    canvas.writeSkinHomeCanvasV2RemoveNode(elRegions(), { id: "canvas_over" })
      .ok === true &&
    canvas.writeSkinHomeCanvasV2RemoveNode(elRegions(), { id: "canvas_none" })
      .reason === "missing");


  /* ---- 따라가기 ---- */

  const toPin =
    canvas.writeSkinHomeCanvasV2NodeFollow(elRegions(), "canvas_photo",
      { follow: "pin", offsetX: 20, offsetY: 10, width: 240, height: 160,
        target: "frame", anchor: "top-left", origin: "top-left" },
      { follow: "transform" });

  check("★ [v2-elements] transform → pin 은 방식 · 크기 · offset 을 함께 쓴다",
    (() => {
      const node = nodeIn(innerOf(toPin), "canvas_photo");
      return toPin.ok === true && node.follow === "pin" &&
        node.width === 240 && node.height === 160 &&
        node.pin.offset.x === 20 && node.pin.offset.y === 10 &&
        node.pin.anchor === "top-left" && node.pin.origin === "top-left";
    })(),
    JSON.stringify(nodeIn(innerOf(toPin), "canvas_photo")));

  check("★ [v2-elements] 안 쓰는 칸은 지우지 않는다",
    (() => {
      const node = nodeIn(innerOf(toPin), "canvas_photo");
      return node.x === 10 && node.y === 5;
    })(),
    "pin 이 되어도 옛 좌표가 남는다(§14-6)");

  const toTransform =
    canvas.writeSkinHomeCanvasV2NodeFollow(elRegions(), "canvas_tag",
      { follow: "transform", x: 50, y: 20, width: 30, height: 10 },
      { follow: "pin" });

  check("★ [v2-elements] pin → transform 은 좌표를 쓰고 pin 설정을 남긴다",
    (() => {
      const node = nodeIn(innerOf(toTransform), "canvas_tag");
      return toTransform.ok === true && node.follow === "transform" &&
        node.x === 50 && node.y === 20 &&
        node.pin.anchor === "right" && node.pin.offset.x === 6;
    })(),
    JSON.stringify(nodeIn(innerOf(toTransform), "canvas_tag")));

  check("[v2-elements] 지금 방식이 expected 와 다르면 쓰지 않는다",
    canvas.writeSkinHomeCanvasV2NodeFollow(elRegions(), "canvas_photo",
      { follow: "pin", offsetX: 0, offsetY: 0, width: 10, height: 10,
        target: "frame", anchor: "top-left", origin: "top-left" },
      { follow: "pin" }).reason === "expected");

  check("[v2-elements] overlay · 블록에는 따라가기가 없다",
    canvas.writeSkinHomeCanvasV2NodeFollow(elRegions(), "canvas_over",
      { follow: "transform", x: 1, y: 1, width: 10, height: 10 },
      { follow: "transform" }).reason === "kind" &&
    canvas.writeSkinHomeCanvasV2NodeFollow(elRegions(), "canvas_main",
      { follow: "transform", x: 1, y: 1, width: 10, height: 10 },
      { follow: "transform" }).reason === "kind");


  /* ---- pin 의 기준 셋 ---- */

  const pinned =
    canvas.writeSkinHomeCanvasV2NodePin(elRegions(), "canvas_tag",
      { target: "frame", anchor: "bottom", origin: "center",
        offsetX: -3, offsetY: 7 },
      { target: "photo", anchor: "right", origin: "left",
        offsetX: 6, offsetY: 0 });

  check("★ [v2-elements] 기준 셋과 offset 이 한 요청이다",
    (() => {
      const node = nodeIn(innerOf(pinned), "canvas_tag");
      return pinned.ok === true &&
        node.pin.target === "frame" && node.pin.anchor === "bottom" &&
        node.pin.origin === "center" &&
        node.pin.offset.x === -3 && node.pin.offset.y === 7 &&
        node.pin.extra === "keep-pin";
    })(),
    JSON.stringify(nodeIn(innerOf(pinned), "canvas_tag").pin));

  check("[v2-elements] 값 표 밖의 기준은 거부된다",
    canvas.writeSkinHomeCanvasV2NodePin(elRegions(), "canvas_tag",
      { target: "somewhere", anchor: "bottom", origin: "center",
        offsetX: 0, offsetY: 0 },
      { target: "photo", anchor: "right", origin: "left",
        offsetX: 6, offsetY: 0 }).reason === "target" &&
    canvas.writeSkinHomeCanvasV2NodePin(elRegions(), "canvas_tag",
      { target: "frame", anchor: "middle", origin: "center",
        offsetX: 0, offsetY: 0 },
      { target: "photo", anchor: "right", origin: "left",
        offsetX: 6, offsetY: 0 }).reason === "anchor");

  check("★ [v2-elements] transform 요소의 pin 은 지금 쓰는 칸이 아니다",
    canvas.writeSkinHomeCanvasV2NodePin(elRegions(), "canvas_photo",
      { target: "frame", anchor: "top", origin: "top",
        offsetX: 0, offsetY: 0 },
      { target: "frame", anchor: "center", origin: "center",
        offsetX: 0, offsetY: 0 }).reason === "pin",
    "먼저 따라가기 방식을 바꾼다");


  /* ---- 프레임 안에 새 장식 ---- */

  const addedIn =
    canvas.writeSkinHomeCanvasV2AddNode(elRegions(), {
      target: "frame", frameId: "canvas_main", type: "shape"
    });

  check("★ [v2-elements] 프레임 안에 새 장식을 만든다",
    addedIn.ok === true && innerOf(addedIn).length === 3 &&
    innerOf(addedIn)[2].type === "shape" &&
    innerOf(addedIn)[2].follow === "transform",
    JSON.stringify(innerOf(addedIn)[2]));

  check("★ [v2-elements] 기본 크기 · 자리는 **프레임 자에 맞춰** 줄어든다",
    (() => {
      const node = innerOf(addedIn)[2];
      /* 자유 장식의 shape 는 120×120 이고 프레임 자는 150 이다 */
      return node.width < 120 && node.width > 0 &&
        node.x > 0 && node.x < 150;
    })(),
    JSON.stringify({ w: innerOf(addedIn)[2].width, x: innerOf(addedIn)[2].x }));

  check("[v2-elements] 프레임 안에는 main_visual · divider 를 넣을 수 없다",
    canvas.writeSkinHomeCanvasV2AddNode(elRegions(), {
      target: "frame", frameId: "canvas_main", type: "main_visual",
      slot: "photo_1"
    }).reason === "type" &&
    canvas.writeSkinHomeCanvasV2AddNode(elRegions(), {
      target: "frame", frameId: "canvas_main", type: "divider"
    }).reason === "type");

  check("[v2-elements] 프레임 id 가 없거나 프레임이 아니면 거부된다",
    canvas.writeSkinHomeCanvasV2AddNode(elRegions(), {
      target: "frame", type: "shape"
    }).reason === "frame" &&
    canvas.writeSkinHomeCanvasV2AddNode(elRegions(), {
      target: "frame", frameId: "canvas_b0", type: "shape"
    }).reason === "frame");


  /* ---- 보존과 불변 ---- */

  check("★ [v2-elements] 모르는 항목 · 모르는 칸 · 다른 층이 그대로다",
    (() => {
      const next = canvasOf(attached);
      return next.extra === "unknown-canvas" &&
        next.flow.zzz === "unknown-flow" &&
        next.flow.blocks[0].mystery === "keep-block" &&
        next.flow.blocks[1].odd === "keep-block" &&
        next.flow.blocks[1].props.strange === "keep-props" &&
        attached.regions[0].payload.keep === true &&
        attached.regions[1].note === "unknown-entry";
    })());

  check("★ [v2-elements] 입력을 한 칸도 mutate 하지 않는다",
    (() => {

      const source = elRegions();
      const before = JSON.stringify(source);

      canvas.writeSkinHomeCanvasV2AttachNode(source, {
        id: "canvas_over", frameId: "canvas_main",
        next: { x: 1, y: 1, width: 5, height: 5 } });

      canvas.writeSkinHomeCanvasV2DetachNode(source, {
        id: "canvas_tag", next: { x: 1, y: 1, width: 5, height: 5 } });

      canvas.writeSkinHomeCanvasV2RemoveNode(source, { id: "canvas_tag" });

      return JSON.stringify(source) === before;

    })(),
    "Undo 가 들고 있는 직전 스냅샷이 이 호출로 바뀌면 안 된다");

  check("★ [v2-elements] 옮긴 결과가 계약을 그대로 지난다",
    canvas.validateSkinCanvasV2Data(canvasOf(attached), "canvas").ok === true &&
    canvas.validateSkinCanvasV2Data(canvasOf(detached), "canvas").ok === true &&
    canvas.validateSkinCanvasV2Data(canvasOf(removedBlock), "canvas").ok === true);

  check("★ [v2-elements] v1 canvas 에는 닿지 않는다",
    canvas.writeSkinHomeCanvasV2RemoveNode(
      [{ name: "home_canvas", enabled: true,
         canvas: { version: 1, baseWidth: 390, baseHeight: 844,
                   elements: [{ id: "e1", type: "shape", x: 0, y: 0,
                                width: 10, height: 10, props: { kind: "rect" } }] } }],
      { id: "e1" }
    ).reason === "canvas");


  /* ---- Studio 가 자 파일을 싣는가 ---- */

  {
    const docs = ["studio/index.html", "studio/studio-lifecycle-scenario.html"];

    const missing =
      docs.filter((file) => read(file).indexOf("studio-canvas-v2-space.js") === -1);

    check("[v2-elements] Studio 문서가 자 파일을 싣는다(묶기 · 빼기가 그 자를 쓴다)",
      missing.length === 0, missing.join(", "));
  }
}


console.log(`\n${passed} passed, ${failed} failed`);

if (failed) {
  console.log("실패:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
