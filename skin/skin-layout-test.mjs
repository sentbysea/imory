/* =========================================================
   LAYOUT-1 단위 테스트 — 브라우저 없이

     node skin/skin-layout-test.mjs

   보는 것은 skin/skin-layout.js 의 **판정과 계산**이다.

     1) 저장 경계가 무엇을 받아들이고 무엇을 거부하는가
     2) 선언이 확정값으로 어떻게 펴지는가(기본값 · 반응형 열 수)
     3) 확정값이 어떤 custom property 로 나가는가
     4) 그 이름들이 skin/skin-layout.css 와 **실제로** 맞는가

   4번이 이 파일에 있는 이유: 두 파일이 어긋나면 배치가 조용히
   기본값으로 떨어진다(오류도 경고도 없다). 그래서 두 파일을 진짜로
   읽어 대조한다 — 이름 하나를 고치고 다른 쪽을 잊으면 여기서 깨진다.

   DOM 이 필요한 것(렌더 · 드래그 · 모바일 넘침)은 여기 없다 —
   그건 skin/skin-layout-e2e-test.mjs 의 몫이다.
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here =
  path.dirname(fileURLToPath(import.meta.url));

const require =
  createRequire(import.meta.url);

const layout =
  require(path.join(here, "skin-layout.js"));

const {
  SKIN_LAYOUT_ATTR,
  SKIN_LAYOUT_PARAM_PREFIX,
  SKIN_LAYOUT_ITEM_PREFIX,
  SKIN_LAYOUT_SLOT_ATTR,
  SKIN_LAYOUT_TYPES,
  SKIN_LAYOUT_TYPE_PARAMS,
  SKIN_LAYOUT_TYPE_ITEM_PARAMS,
  SKIN_LAYOUT_COLLAPSE_STEPS,
  SKIN_LAYOUT_TABLET_MAX,
  SKIN_LAYOUT_MOBILE_MAX,
  isSkinLayoutAttributeName,
  isValidSkinLayoutAttributeValue,
  readSkinLayoutSpec,
  readSkinLayoutItemSpec,
  normalizeSkinLayout,
  normalizeSkinLayoutItem,
  buildSkinLayoutProperties,
  buildSkinLayoutItemProperties,
  compileSkinLayoutTree,
  describeSkinLayoutTarget,
  auditSkinLayoutDocument
} = layout;


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


/* =========================================================
   최소 DOM 흉내

   compileSkinLayoutTree / describeSkinLayoutTarget / audit 이
   실제로 쓰는 것은 getAttribute · hasAttribute · removeAttribute ·
   children · parentElement · querySelectorAll · style.setProperty
   뿐이다. jsdom 을 끌어오는 대신 그만큼만 만든다 — 이 테스트가
   보는 것은 DOM 구현이 아니라 우리 계산이다.
========================================================== */

function el(attrs, children) {

  const node = {
    attrs: Object.assign({}, attrs),
    children: children || [],
    parentElement: null,
    props: {},
    style: {
      setProperty(name, value) {
        node.props[name] = value;
      }
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(node.attrs, name)
        ? node.attrs[name]
        : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(node.attrs, name);
    },
    setAttribute(name, value) {
      node.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete node.attrs[name];
    },
    querySelectorAll(selector) {

      const wanted =
        selector.replace(/^\[|\]$/g, "");

      const found = [];

      const walk = (current) => {

        current.children.forEach((child) => {

          if (child.hasAttribute(wanted)) {
            found.push(child);
          }

          walk(child);

        });

      };

      walk(node);

      return found;

    }
  };

  node.children.forEach((child) => {
    child.parentElement = node;
  });

  return node;

}


/* =========================================================
   1. 저장 경계 — 무엇이 통과하는가
========================================================== */

section("values");

check(
  "layout 속성 이름을 알아본다",
  isSkinLayoutAttributeName(SKIN_LAYOUT_ATTR) &&
  isSkinLayoutAttributeName(SKIN_LAYOUT_PARAM_PREFIX + "gap") &&
  isSkinLayoutAttributeName(SKIN_LAYOUT_ITEM_PREFIX + "x") &&
  isSkinLayoutAttributeName(SKIN_LAYOUT_SLOT_ATTR)
);

check(
  "모르는 이름은 계약 밖이다(= sanitizer 가 버린다)",
  !isSkinLayoutAttributeName(SKIN_LAYOUT_PARAM_PREFIX + "hint") &&
  !isSkinLayoutAttributeName(SKIN_LAYOUT_ITEM_PREFIX + "rotate") &&
  !isSkinLayoutAttributeName("data-imory-bind")
);

check(
  "type 은 다섯 가지뿐",
  SKIN_LAYOUT_TYPES.every((type) => isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ATTR, type)) &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ATTR, "flex") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ATTR, "")
);

check(
  "정수는 범위 안에서만",
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "gap", "0") &&
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "gap", "160") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "gap", "161") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "gap", "-4") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "gap", "8px") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "columns", "0")
);

check(
  "자유 좌표는 0~1 비율만(소수점 4자리)",
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", "0") &&
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", "1") &&
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", "0.2537") &&
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", ".5") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", "1.5") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", "-0.2") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", "0.25381") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", "1e-3")
);

/* CSS 로 나가는 값이므로 구문을 깨는 글자가 아예 못 들어가야 한다 */
check(
  "calc()/선택자를 깨는 글자는 통과하지 못한다",
  [
    "0;}",
    "0)+1",
    "var(--x)",
    "expression(1)",
    "0 !important",
    'left"]',
    "1fr"
  ].every(
    (value) =>
      !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + "x", value) &&
      !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "columns", value) &&
      !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "side", value)
  )
);

check(
  "collapse 는 정해진 계단에서만",
  SKIN_LAYOUT_COLLAPSE_STEPS.every(
    (step) => isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "collapse", String(step))
  ) &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + "collapse", "640")
);

check(
  "slot 은 sidebar/main 둘뿐",
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_SLOT_ATTR, "sidebar") &&
  isValidSkinLayoutAttributeValue(SKIN_LAYOUT_SLOT_ATTR, "main") &&
  !isValidSkinLayoutAttributeValue(SKIN_LAYOUT_SLOT_ATTR, "aside")
);

check(
  "잘못된 값은 읽을 때 조용히 빠진다(선언에 남지 않는다)",
  (() => {

    const spec =
      readSkinLayoutSpec(
        el({
          [SKIN_LAYOUT_ATTR]: "stack",
          [SKIN_LAYOUT_PARAM_PREFIX + "gap"]: "999",
          [SKIN_LAYOUT_PARAM_PREFIX + "direction"]: "row"
        })
      );

    return spec.params.gap === undefined && spec.params.direction === "row";

  })()
);


/* =========================================================
   2. 정규화 — 선언에서 확정값으로
========================================================== */

section("normalize");

check(
  "stack 기본값",
  (() => {
    const r = normalizeSkinLayout({ type: "stack", params: {} });
    return r.direction === "column" && r.gap === 16 && r.wrap === "wrap" &&
      r.justify === "start" && r.align === "stretch";
  })()
);

check(
  "grid 의 태블릿/모바일 열 수는 열 수에서 **확정**된다",
  (() => {
    const four = normalizeSkinLayout({ type: "grid", params: { columns: "4" } });
    const two = normalizeSkinLayout({ type: "grid", params: { columns: "2" } });
    const one = normalizeSkinLayout({ type: "grid", params: { columns: "1" } });
    return four.columnsTablet === 3 && four.columnsMobile === 2 &&
      two.columnsTablet === 2 && two.columnsMobile === 2 &&
      one.columnsTablet === 1 && one.columnsMobile === 1;
  })()
);

check(
  "명시한 모바일 열 수가 기본값을 이긴다",
  normalizeSkinLayout({ type: "grid", params: { columns: "4", "columns-mobile": "1" } })
    .columnsMobile === 1
);

check(
  "grid 트랙은 언제나 minmax(0, 1fr) 이다(항목이 트랙을 못 밀어낸다)",
  (() => {
    const r = normalizeSkinLayout({ type: "grid", params: { columns: "3" } });
    return r.tracks === "repeat(3, minmax(0, 1fr))" &&
      r.tracksMobile === "repeat(2, minmax(0, 1fr))";
  })()
);

check(
  "min 을 주면 열 수를 폭이 정한다(세 breakpoint 가 같은 auto-fit)",
  (() => {
    const r = normalizeSkinLayout({ type: "grid", params: { columns: "4", min: "180" } });
    return r.tracks === "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" &&
      r.tracks === r.tracksTablet && r.tracks === r.tracksMobile;
  })()
);

check(
  "row-gap 을 안 주면 gap 을 따른다",
  (() => {
    const r = normalizeSkinLayout({ type: "grid", params: { gap: "24" } });
    return r.rowGap === 24;
  })()
);

check(
  "sidebar 트랙이 side 에 따라 뒤집힌다(본문은 언제나 minmax(0,1fr))",
  (() => {
    const left = normalizeSkinLayout({ type: "sidebar", params: { "sidebar-width": "200" } });
    const right = normalizeSkinLayout({ type: "sidebar", params: { side: "right", "sidebar-width": "200" } });
    return left.tracks === "200px minmax(0, 1fr)" &&
      right.tracks === "minmax(0, 1fr) 200px";
  })()
);

check(
  "sidebar 기본 접힘 폭은 720",
  normalizeSkinLayout({ type: "sidebar", params: {} }).collapse === 720
);

check(
  "free 자식 기본 좌표는 0,0 / 너비 40%",
  (() => {
    const r = normalizeSkinLayoutItem({ params: {} }, "free");
    return r.x === 0 && r.y === 0 && r.width === 40 && r.height === 0 && r.z === 0;
  })()
);

check(
  "모르는 type 은 null",
  normalizeSkinLayout({ type: "masonry", params: {} }) === null &&
  normalizeSkinLayout(null) === null
);


/* =========================================================
   3. 컴파일 — 확정값 -> custom property
========================================================== */

section("compile");

const gridProps =
  buildSkinLayoutProperties(normalizeSkinLayout({ type: "grid", params: { columns: "3", gap: "12" } }));

check(
  "grid 는 세 breakpoint 의 트랙을 전부 넘긴다",
  gridProps["--imory-lay-tracks"] === "repeat(3, minmax(0, 1fr))" &&
  gridProps["--imory-lay-tracks-tablet"] === "repeat(3, minmax(0, 1fr))" &&
  gridProps["--imory-lay-tracks-mobile"] === "repeat(2, minmax(0, 1fr))" &&
  gridProps["--imory-lay-gap"] === "12px"
);

check(
  "between/around 만 CSS 이름으로 옮겨진다",
  buildSkinLayoutProperties(normalizeSkinLayout({ type: "stack", params: { justify: "between" } }))["--imory-lay-justify"] === "space-between" &&
  buildSkinLayoutProperties(normalizeSkinLayout({ type: "stack", params: { justify: "center" } }))["--imory-lay-justify"] === "center"
);

check(
  "max-width 를 안 주면 none",
  buildSkinLayoutProperties(normalizeSkinLayout({ type: "panel", params: {} }))["--imory-lay-max-width"] === "none" &&
  buildSkinLayoutProperties(normalizeSkinLayout({ type: "panel", params: { "max-width": "640" } }))["--imory-lay-max-width"] === "640px"
);

check(
  "free 자식의 좌표는 비율 그대로, 높이 0 은 auto",
  (() => {
    const p = buildSkinLayoutItemProperties(
      normalizeSkinLayoutItem({ params: { x: "1", y: "0.5", width: "30" } }, "free"),
      "free"
    );
    return p["--imory-it-x"] === "1" && p["--imory-it-y"] === "0.5" &&
      p["--imory-it-width"] === "30%" && p["--imory-it-height"] === "auto";
  })()
);

check(
  "grid 자식의 span 은 span 키워드까지 붙여서 넘긴다",
  (() => {
    const p = buildSkinLayoutItemProperties(
      normalizeSkinLayoutItem({ params: { span: "2", "row-span": "3" } }, "grid"),
      "grid"
    );
    return p["--imory-it-column"] === "span 2" && p["--imory-it-row"] === "span 3";
  })()
);

check(
  "배치가 아닌 부모의 자식에는 아무 것도 쓰지 않는다",
  Object.keys(
    buildSkinLayoutItemProperties(normalizeSkinLayoutItem({ params: { x: "1" } }, "stack"), "stack")
  ).length === 0
);

check(
  "layout 이 없는 트리는 **한 요소도** 건드리지 않는다",
  (() => {

    const child = el({ class: "card" });
    const root = el({}, [child]);

    const count = compileSkinLayoutTree(root);

    return count === 0 &&
      Object.keys(child.props).length === 0 &&
      Object.keys(root.props).length === 0;

  })()
);

check(
  "컴파일이 컨테이너와 자식 모두에 쓴다(반복 clone 포함 경로)",
  (() => {

    const a = el({ [SKIN_LAYOUT_ITEM_PREFIX + "span"]: "2" });
    const b = el({});

    const grid =
      el({ [SKIN_LAYOUT_ATTR]: "grid", [SKIN_LAYOUT_PARAM_PREFIX + "columns"]: "2" }, [a, b]);

    const root = el({}, [grid]);

    compileSkinLayoutTree(root);

    return grid.props["--imory-lay-tracks"] === "repeat(2, minmax(0, 1fr))" &&
      a.props["--imory-it-column"] === "span 2" &&
      b.props["--imory-it-column"] === "span 1";

  })()
);

check(
  "stack/panel/sidebar 의 자식에는 item 속성을 쓰지 않는다",
  (() => {

    const child = el({});
    const stack = el({ [SKIN_LAYOUT_ATTR]: "stack" }, [child]);

    compileSkinLayoutTree(el({}, [stack]));

    return Object.keys(child.props).length === 0;

  })()
);


/* =========================================================
   4. Studio 가 묻는 것
========================================================== */

section("describe");

check(
  "부모가 배치면 자식 파라미터 목록이 부모 종류를 따른다",
  (() => {

    const child = el({});
    const parent = el({ [SKIN_LAYOUT_ATTR]: "grid" }, [child, el({})]);

    const info = describeSkinLayoutTarget(child);

    return info.parentType === "grid" &&
      info.itemParams.join(",") === SKIN_LAYOUT_TYPE_ITEM_PARAMS.grid.join(",") &&
      info.canReorder === true &&
      info.index === 0 &&
      info.siblingCount === 2;

  })()
);

check(
  "자유 배치 안에서는 '순서'가 뜻이 없다(좌표가 자리를 정한다)",
  (() => {

    const child = el({});
    const parent = el({ [SKIN_LAYOUT_ATTR]: "free" }, [child, el({})]);

    return describeSkinLayoutTarget(child).canReorder === false;

  })()
);

check(
  "형제가 혼자면 순서 변경이 없다",
  (() => {
    const child = el({});
    el({ [SKIN_LAYOUT_ATTR]: "stack" }, [child]);
    return describeSkinLayoutTarget(child).canReorder === false;
  })()
);

check(
  "배치를 선언하지 않은 요소는 type 이 null",
  describeSkinLayoutTarget(el({})).type === null
);


/* =========================================================
   5. 감사 — 거부가 아니라 경고
========================================================== */

section("audit");

check(
  "격자에 방향을 주면 '적용되지 않는다'고 말해 준다",
  (() => {

    const doc =
      el({}, [el({ [SKIN_LAYOUT_ATTR]: "grid", [SKIN_LAYOUT_PARAM_PREFIX + "direction"]: "row" })]);

    const warnings = auditSkinLayoutDocument(doc, "HOME");

    return warnings.length === 1 && warnings[0].indexOf("direction") !== -1;

  })()
);

check(
  "사이드바에 sidebar 슬롯 자식이 없으면 경고",
  (() => {

    const doc =
      el({}, [el({ [SKIN_LAYOUT_ATTR]: "sidebar" }, [el({}), el({})])]);

    return auditSkinLayoutDocument(doc, "HOME")
      .some((warning) => warning.indexOf("sidebar") !== -1);

  })()
);

check(
  "자유 배치인데 좌표가 하나도 없으면 경고",
  (() => {

    const doc =
      el({}, [el({ [SKIN_LAYOUT_ATTR]: "free" }, [el({}), el({})])]);

    return auditSkinLayoutDocument(doc, "HOME")
      .some((warning) => warning.indexOf("겹칩니다") !== -1);

  })()
);

check(
  "제대로 쓴 배치에는 경고가 없다",
  (() => {

    const doc =
      el({}, [
        el({ [SKIN_LAYOUT_ATTR]: "grid", [SKIN_LAYOUT_PARAM_PREFIX + "columns"]: "2" }),
        el({ [SKIN_LAYOUT_ATTR]: "sidebar" }, [
          el({ [SKIN_LAYOUT_SLOT_ATTR]: "sidebar" }),
          el({ [SKIN_LAYOUT_SLOT_ATTR]: "main" })
        ]),
        el({ [SKIN_LAYOUT_ATTR]: "free" }, [
          el({ [SKIN_LAYOUT_ITEM_PREFIX + "x"]: "1" })
        ])
      ]);

    return auditSkinLayoutDocument(doc, "HOME").length === 0;

  })()
);


/* =========================================================
   6. ★ 두 파일이 같은 이름을 쓰는가

   컴파일러가 쓰는 custom property 와 스타일시트가 읽는 var() 가
   어긋나면 배치가 조용히 기본값으로 떨어진다. 그래서 진짜로 읽어
   대조한다.
========================================================== */

section("stylesheet");

const css =
  fs.readFileSync(path.join(here, "skin-layout.css"), "utf8");

/* 컴파일러가 만들 수 있는 이름 전부 — 다섯 type × (컨테이너 + 자식) */
const emitted =
  new Set();

SKIN_LAYOUT_TYPES.forEach((type) => {

  const params = {};

  (SKIN_LAYOUT_TYPE_PARAMS[type] || []).forEach((name) => {

    /* 어떤 값이든 하나 넣어 "그 파라미터가 있을 때"의 출력까지 본다 */
    params[name] =
      name === "max-width" ? "640" : undefined;

  });

  Object.keys(
    buildSkinLayoutProperties(normalizeSkinLayout({ type, params }))
  ).forEach((name) => emitted.add(name));

  Object.keys(
    buildSkinLayoutItemProperties(normalizeSkinLayoutItem({ params: {} }, type), type)
  ).forEach((name) => emitted.add(name));

});

const missingInCss =
  Array.from(emitted).filter((name) => css.indexOf(`var(${name}`) === -1);

check(
  "컴파일러가 쓰는 property 를 스타일시트가 전부 읽는다",
  missingInCss.length === 0,
  missingInCss.join(", ")
);

const readInCss =
  Array.from(new Set(
    (css.match(/var\(--imory-(?:lay|it)-[a-z-]+/g) || [])
      .map((match) => match.slice("var(".length))
  ));

const missingInJs =
  readInCss.filter((name) => !emitted.has(name));

check(
  "스타일시트가 읽는 property 를 컴파일러가 전부 쓴다",
  missingInJs.length === 0,
  missingInJs.join(", ")
);

check(
  "grid breakpoint 가 두 파일에서 같다",
  css.indexOf(`@media (max-width: ${SKIN_LAYOUT_TABLET_MAX}px)`) !== -1 &&
  css.indexOf(`@media (max-width: ${SKIN_LAYOUT_MOBILE_MAX}px)`) !== -1
);

check(
  "sidebar 의 접힘 계단마다 스타일시트 블록이 있다",
  SKIN_LAYOUT_COLLAPSE_STEPS.every(
    (step) =>
      css.indexOf(`@media (max-width: ${step}px)`) !== -1 &&
      css.indexOf(`[${SKIN_LAYOUT_PARAM_PREFIX}collapse="${step}"]`) !== -1
  )
);

check(
  "스타일시트는 배치만 한다(색/그림자/글꼴을 정하지 않는다)",
  !/(^|\s)(color|background(-color)?|box-shadow|font-family|font-size)\s*:/m.test(
    css.replace(/\/\*[\s\S]*?\*\//g, "")
  )
);

check(
  "모든 배치 type 에 규칙이 있다",
  SKIN_LAYOUT_TYPES.every(
    (type) => css.indexOf(`[${SKIN_LAYOUT_ATTR}="${type}"]`) !== -1
  )
);


/* =========================================================
   7. AI 프롬프트가 같은 계약을 말하는가

   프롬프트가 옛 이름을 말하면 AI 는 저장 경계가 버리는 속성을
   만들어 내고, 화면에서는 아무 일도 일어나지 않는다.
========================================================== */

section("ai-prompt");

const promptSource =
  fs.readFileSync(path.join(here, "..", "functions", "api", "skin-ai.js"), "utf8");

check(
  "프롬프트가 다섯 primitive 를 전부 말한다",
  SKIN_LAYOUT_TYPES.every(
    (type) => promptSource.indexOf(`${SKIN_LAYOUT_ATTR}=\\"${type}\\"`) !== -1
  )
);

check(
  "프롬프트가 자유 좌표를 비율이라고 말한다(px 가 아니라)",
  /RATIOS from 0 to 1/.test(promptSource)
);

check(
  "selectionContext capability 목록에 배치 셋이 있다",
  /"layout", "layoutItem", "reorder"/.test(promptSource)
);


/* =========================================================
   8. sandbox 프레임도 같은 두 파일을 받는가

   프레임은 **별도 origin** 이고, 거기서 나갈 수 있는 파일은
   core/lib/skin-sandbox-server.js 의 allowlist 에 적힌 것이 전부다.
   두 파일 중 하나라도 빠지면 같은 스킨이 프레임에서만 배치 없이
   그려진다 — posts-body-shared.css 가 빠졌을 때와 정확히 같은
   증상이고, 오류도 경고도 나지 않아 눈으로만 알 수 있다.

   그래서 "프레임 문서가 읽는다"와 "서버가 내보낸다" 양쪽을 본다.
========================================================== */

section("sandbox");

const sandboxServerSource =
  fs.readFileSync(path.join(here, "..", "core", "lib", "skin-sandbox-server.js"), "utf8");

const frameSource =
  fs.readFileSync(path.join(here, "sandbox", "frame.html"), "utf8");

["/skin/skin-layout.js", "/skin/skin-layout.css"].forEach((assetPath) => {

  check(
    `sandbox origin 이 ${assetPath} 를 내보낸다`,
    sandboxServerSource.indexOf(`"${assetPath}"`) !== -1
  );

  check(
    `프레임 문서가 ${assetPath} 를 읽는다`,
    frameSource.indexOf(assetPath) !== -1
  );

});

check(
  "프레임에서도 sanitize 보다 배치 계약이 먼저 로드된다",
  frameSource.indexOf("/skin/skin-layout.js") < frameSource.indexOf("/skin/skin-sanitize.js")
);


/* =========================================================
   9. 배포되는 예시 스킨이 계약을 지키는가

   skin/test-skins/imory-layout-primitives-v1.json 은 "이 다섯으로
   레이아웃을 짜면 이렇게 된다"를 보여주는 예시다. 거기에 오탈자가
   있으면 저장 경계가 그 속성만 조용히 지우고, 예시를 그대로 따라
   한 사람은 왜 안 되는지 알 수 없다. 그래서 파일을 실제로 읽어
   **모든 배치 속성의 값**을 규칙표에 대 본다.
========================================================== */

section("example-skin");

const examplePath =
  path.join(here, "test-skins", "imory-layout-primitives-v1.json");

const examplePackage =
  JSON.parse(fs.readFileSync(examplePath, "utf8"));

const exampleHtml =
  Object.keys(examplePackage.templates)
    .map((pageType) => examplePackage.templates[pageType].html)
    .join("\n");

const exampleAttrs =
  exampleHtml.match(/data-imory-(?:layout|item|slot)[a-z-]*="[^"]*"/g) || [];

const badAttrs =
  exampleAttrs.filter((pair) => {

    const [, name, value] =
      pair.match(/^([a-z-]+)="([^"]*)"$/);

    return !isValidSkinLayoutAttributeValue(name, value);

  });

check(
  "예시 스킨이 배치 속성을 실제로 쓴다",
  exampleAttrs.length > 20,
  String(exampleAttrs.length)
);

check(
  "예시 스킨의 배치 속성 값이 전부 규칙을 통과한다",
  badAttrs.length === 0,
  badAttrs.join(", ")
);

check(
  "예시 스킨이 다섯 primitive 를 전부 보여준다",
  SKIN_LAYOUT_TYPES.every(
    (type) => exampleHtml.indexOf(`data-imory-layout="${type}"`) !== -1
  ),
  SKIN_LAYOUT_TYPES.filter(
    (type) => exampleHtml.indexOf(`data-imory-layout="${type}"`) === -1
  ).join(", ")
);

/* 요점은 "이 다섯을 CSS 로 다시 만들지 않는다"이므로, 예시 CSS 가
   같은 배치를 직접 짜면 그 요점이 무너진다.

   금지는 **primitive 와 겹치는 것**만이다 — display:block 이나
   [hidden]{display:none} 같은 평범한 선언까지 막으면 스킨을 쓸 수
   없다(그건 배치가 아니라 그리기다). */
const forbiddenCss =
  /(^|[;{])\s*(?:display\s*:\s*(?:inline-)?(?:flex|grid)|grid-template[a-z-]*\s*:|position\s*:\s*(?:absolute|fixed)|float\s*:)/
    .exec(examplePackage.css);

check(
  "예시 스킨 CSS 가 배치를 다시 만들지 않는다(flex/grid/absolute/float 없음)",
  forbiddenCss === null,
  forbiddenCss ? forbiddenCss[0] : ""
);

check(
  "예시 스킨에 POST 본문 자리가 있다(저장 경계의 필수 조건)",
  examplePackage.templates.post.html.indexOf('data-imory-region="post-body"') !== -1
);


console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`
);

process.exit(failed === 0 ? 0 : 1);
