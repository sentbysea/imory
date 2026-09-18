/* =========================================================
   SKIN LAYOUT PRIMITIVES — 배치 계약 (순수 함수 + 컴파일러)

   기준 문서: IMORY_LAYOUT_PRIMITIVE_DESIGN.md

   이 파일이 정하는 것은 하나다 — **무엇이 어떻게 배치되는가**.
   색·테두리·둥글기·글꼴·그림자는 여기서 다루지 않는다(그건
   스킨 CSS 와 Direct Edit 의 스타일 컨트롤 몫이다). primitive 가
   카드 디자인을 강제하지 않는 이유다.

   ── 왜 새 트리를 만들지 않았나 ─────────────────────────
   요구사항 15절은 `{type:"panel", children:[...]}` 같은 중첩 트리를
   예로 든다. 이 저장소에서 그 트리는 **이미 있다** — templates.*.html
   그 자체다. 거기에는 바인딩(data-imory-bind) · 반복
   (data-imory-repeat) · 보호 구역(data-imory-region) · Direct Edit
   식별자(data-imory-edit-id)가 전부 달려 있고, 공개 렌더러 ·
   sandbox 프레임 · Studio Preview · Inspector · AI 가 모두 그 트리
   하나를 본다. 별도의 layout 트리를 SkinPackage 에 새로 두면
   같은 구조가 두 벌이 되고, 둘이 어긋나는 순간 어느 쪽이 화면인지
   파일만 보고는 알 수 없다(그리고 기존 스킨 전부가 마이그레이션
   대상이 된다 — 요구사항 14절이 금지하는 것).

   그래서 layout primitive 는 **그 트리 위의 주석 층**이다.

     panel    = data-imory-layout="panel" 을 단 요소
     children = 그 요소의 DOM 자식
     layout   = data-imory-layout-* 속성들

   요구사항 15절의 개념 모델과 1:1 로 대응하면서(아래 예),
   기존 렌더링/데이터 바인딩을 한 글자도 깨지 않는다.

     { type:"panel", layout:{type:"stack",direction:"column",gap:16} }
       -> <div data-imory-layout="stack"
               data-imory-layout-direction="column"
               data-imory-layout-gap="16">

   ── 왜 값이 CSS 로 바로 가지 않는가 ────────────────────
   속성 값은 **절대로** CSS 문자열에 그대로 꽂히지 않는다. 이 파일이
   먼저 enum/정수/비율로 정규화하고, 그 정규화된 값으로만 CSS
   custom property 를 만든다. 스킨 HTML 은 사용자(그리고 AI)가 쓴
   데이터이므로 그 사이에 항상 이 관문이 있다.

   ── 왜 style 속성이 아니라 CSSOM 인가 ──────────────────
   `style` 속성은 sanitizer 가 전면 금지하고(skin/skin-sanitize.js),
   sandbox 프레임의 CSP 에는 style-src 'unsafe-inline' 이 없다.
   반면 element.style.setProperty() 같은 **CSSOM 쓰기는 CSP 가 막지
   않는다**(skin/skin-render.js styleNonce 주석의 2026-09-15 실측).
   그래서 컴파일러는 렌더가 끝난 DOM 위에서 custom property 만
   써 넣고, 실제 배치 규칙은 플랫폼 스타일시트 한 장
   (skin/skin-layout.css)이 그 값을 읽어 적용한다.

   저장되는 HTML 에는 언제나 속성만 남는다 — Export/Import 왕복에
   layout 이 그대로 따라가는 것도 그래서다(SkinPackage 에 새 최상위
   필드가 필요 없다).

   ── 모바일 안전(요구사항 13절) ─────────────────────────
   "런타임에 재어 보고 고친다"가 아니라 **구조적으로** 넘치지 않게
   만든다.

     grid   : 트랙이 항상 minmax(0, 1fr) 이라 항목이 트랙을 밀어내지
              못한다. 열 수는 breakpoint 마다 따로 확정한다.
     free   : 좌표가 px 가 아니라 0~1 비율이고, 배치가
              left:x*100% + translate(-x*100%) 라서 x=1 이 "오른쪽 끝에
              딱 붙음"이 된다 — 어떤 폭에서도 요소가 컨테이너를
              벗어날 수 없다(clamp 코드가 필요 없는 이유).
     sidebar: collapse 아래에서 한 줄 세로로 접힌다(main 이 위).
     stack  : 원래 넘치지 않는다(wrap 기본값).

   ── 이 파일이 하지 않는 것 ─────────────────────────────
   DOM 을 만들지 않고, 요소를 옮기지 않는다. 순서 변경(reorder)은
   템플릿 HTML 을 고치는 일이라 Studio 의 몫이다
   (studio/inspector/studio-inspector-layout.js).

   ── 의존 ───────────────────────────────────────────────
   없다(순수 함수 + 표준 DOM API). classic script 로 로드되면
   window 에, node 에서 require 되면 module.exports 에 같은 함수가
   실린다 — 브라우저 없는 단위 테스트(skin/skin-layout-test.mjs)가
   같은 판정 규칙을 본다.
========================================================== */


/* =========================================================
   1. 이름들
========================================================== */

const SKIN_LAYOUT_ATTR = "data-imory-layout";
const SKIN_LAYOUT_PARAM_PREFIX = "data-imory-layout-";
const SKIN_LAYOUT_ITEM_PREFIX = "data-imory-item-";
const SKIN_LAYOUT_SLOT_ATTR = "data-imory-slot";

const SKIN_LAYOUT_TYPES = ["panel", "stack", "grid", "free", "sidebar"];

const SKIN_LAYOUT_SLOTS = ["sidebar", "main"];

/* 화면 폭 경계. grid 는 이 둘을 쓰고, sidebar 는 자기 collapse
   값을 쓴다(아래 SKIN_LAYOUT_COLLAPSE_STEPS). 두 값은
   skin/skin-layout.css 의 @media 와 **반드시** 같아야 한다 —
   단위 테스트가 두 파일을 실제로 읽어 대조한다. */
const SKIN_LAYOUT_TABLET_MAX = 900;
const SKIN_LAYOUT_MOBILE_MAX = 600;

/* sidebar 가 접히는 폭은 **정해진 계단**에서만 고른다.

   @media 는 custom property 를 읽을 수 없다 — 그래서 요소마다 다른
   임의의 breakpoint 를 custom property 로 넘길 방법이 없다. 대신
   허용 값마다 스타일시트에 블록을 하나씩 두고 속성 선택자로 고른다
   (skin/skin-layout.css). 계단을 늘리려면 두 파일을 함께 고친다. */
const SKIN_LAYOUT_COLLAPSE_STEPS = [480, 600, 720, 900];
const SKIN_LAYOUT_COLLAPSE_DEFAULT = 720;


/* =========================================================
   2. 값 규칙

   각 파라미터가 무엇을 받아들이는가를 **한 곳에만** 적는다.
   sanitizer(저장 경계) · 컴파일러(렌더) · Studio 폼 · AI 응답
   검사가 전부 이 표 하나를 본다 — 표가 갈라지면 "저장은 되는데
   렌더는 안 되는" 값이 생긴다.

     kind:"enum"  values 안에 있어야 한다
     kind:"int"   정수, min..max
     kind:"ratio" 0..1 실수, 소수점 4자리까지
========================================================== */

const SKIN_LAYOUT_PARAM_RULES = {

  /* 공통(모든 type) — 요구사항 2절 panel 의 구조 속성 */
  "max-width": { kind: "int", min: 0, max: 2000 },
  "min-height": { kind: "int", min: 0, max: 2000 },
  "overflow": { kind: "enum", values: ["visible", "hidden", "auto"] },
  "align": { kind: "enum", values: ["start", "center", "end", "stretch", "baseline"] },

  /* stack */
  "direction": { kind: "enum", values: ["column", "row"] },
  "gap": { kind: "int", min: 0, max: 160 },
  "justify": { kind: "enum", values: ["start", "center", "end", "between", "around"] },
  "wrap": { kind: "enum", values: ["wrap", "nowrap"] },

  /* grid */
  "columns": { kind: "int", min: 1, max: 12 },
  "columns-tablet": { kind: "int", min: 1, max: 12 },
  "columns-mobile": { kind: "int", min: 1, max: 12 },
  "row-gap": { kind: "int", min: 0, max: 160 },
  "min": { kind: "int", min: 40, max: 800 },

  /* free */
  "height": { kind: "int", min: 0, max: 2000 },

  /* sidebar */
  "side": { kind: "enum", values: ["left", "right"] },
  "sidebar-width": { kind: "int", min: 60, max: 600 },
  "collapse": { kind: "enum", values: SKIN_LAYOUT_COLLAPSE_STEPS.map(String) },
  "mobile": { kind: "enum", values: ["stack", "hide"] }

};

const SKIN_LAYOUT_ITEM_RULES = {

  /* grid 자식 */
  "span": { kind: "int", min: 1, max: 12 },
  "row-span": { kind: "int", min: 1, max: 6 },

  /* free 자식 */
  "x": { kind: "ratio" },
  "y": { kind: "ratio" },
  "width": { kind: "int", min: 5, max: 100 },
  "height": { kind: "int", min: 0, max: 100 },
  "z": { kind: "int", min: 0, max: 99 }

};

/* type 별로 **의미가 있는** 파라미터. Studio 폼이 이 목록만 그리고,
   감사(audit)가 "grid 인데 direction 을 줬다" 같은 것을 짚는다.
   의미 없는 값이 남아 있어도 렌더는 깨지지 않는다 — 조용히 무시된다. */
const SKIN_LAYOUT_TYPE_PARAMS = {
  panel: ["max-width", "min-height", "overflow", "align"],
  stack: ["direction", "gap", "align", "justify", "wrap", "max-width", "min-height", "overflow"],
  grid: ["columns", "columns-tablet", "columns-mobile", "gap", "row-gap", "min", "align", "max-width", "min-height", "overflow"],
  free: ["height", "max-width", "overflow"],
  sidebar: ["side", "sidebar-width", "gap", "collapse", "mobile", "align", "max-width", "min-height", "overflow"]
};

const SKIN_LAYOUT_TYPE_ITEM_PARAMS = {
  panel: [],
  stack: [],
  grid: ["span", "row-span"],
  free: ["x", "y", "width", "height", "z"],
  sidebar: []
};


/* =========================================================
   3. 값 판정 — sanitizer 가 쓰는 관문
========================================================== */

function isSkinLayoutType(value) {
  return SKIN_LAYOUT_TYPES.indexOf(value) !== -1;
}

function skinLayoutRuleFor(attrName) {

  if (typeof attrName !== "string") {
    return null;
  }

  const name = attrName.toLowerCase();

  if (name === SKIN_LAYOUT_ATTR) {
    return { kind: "enum", values: SKIN_LAYOUT_TYPES };
  }

  if (name === SKIN_LAYOUT_SLOT_ATTR) {
    return { kind: "enum", values: SKIN_LAYOUT_SLOTS };
  }

  if (name.indexOf(SKIN_LAYOUT_PARAM_PREFIX) === 0) {
    return SKIN_LAYOUT_PARAM_RULES[name.slice(SKIN_LAYOUT_PARAM_PREFIX.length)] || null;
  }

  if (name.indexOf(SKIN_LAYOUT_ITEM_PREFIX) === 0) {
    return SKIN_LAYOUT_ITEM_RULES[name.slice(SKIN_LAYOUT_ITEM_PREFIX.length)] || null;
  }

  return null;

}

/* "이 속성 이름이 layout 계약에 속하는가" — 모르는 이름은 false 다.
   sanitizer 는 false 를 "화이트리스트에 없음"으로 읽어 조용히
   버린다(기존 data-* 기본 거부와 같은 결). */
function isSkinLayoutAttributeName(attrName) {
  return skinLayoutRuleFor(attrName) !== null;
}

/* 소수점 4자리까지의 0~1 비율. 지수 표기(1e-3)·부호·공백을 받지
   않는다 — 값이 그대로 calc() 안으로 들어가므로 형태를 좁게 막는다. */
const SKIN_LAYOUT_RATIO_PATTERN = /^(?:0|1|0?\.\d{1,4}|1\.0{1,4})$/;

const SKIN_LAYOUT_INT_PATTERN = /^\d{1,4}$/;

function isValidSkinLayoutAttributeValue(attrName, value) {

  const rule = skinLayoutRuleFor(attrName);

  if (!rule || typeof value !== "string") {
    return false;
  }

  if (rule.kind === "enum") {
    return rule.values.indexOf(value) !== -1;
  }

  if (rule.kind === "ratio") {
    return SKIN_LAYOUT_RATIO_PATTERN.test(value);
  }

  if (rule.kind === "int") {

    if (!SKIN_LAYOUT_INT_PATTERN.test(value)) {
      return false;
    }

    const parsed = Number(value);

    return parsed >= rule.min && parsed <= rule.max;

  }

  return false;

}


/* =========================================================
   4. 읽기 — DOM 요소 하나의 layout 선언

   readSkinLayoutSpec(el) -> { type, params } | null
   readSkinLayoutItemSpec(el) -> { slot, params }

   "선언"이지 "확정값"이 아니다 — 빠진 값은 여기서 채우지 않는다
   (그건 normalize 의 몫). Studio 폼이 "사용자가 실제로 정한 것"과
   "기본값이라 비어 있는 것"을 구분해야 하기 때문이다.
========================================================== */

function readSkinLayoutSpec(el) {

  if (!el || typeof el.getAttribute !== "function") {
    return null;
  }

  const type = el.getAttribute(SKIN_LAYOUT_ATTR);

  if (!isSkinLayoutType(type)) {
    return null;
  }

  const params = {};

  Object.keys(SKIN_LAYOUT_PARAM_RULES).forEach((name) => {

    const raw = el.getAttribute(SKIN_LAYOUT_PARAM_PREFIX + name);

    if (raw !== null && isValidSkinLayoutAttributeValue(SKIN_LAYOUT_PARAM_PREFIX + name, raw)) {
      params[name] = raw;
    }

  });

  return { type, params };

}

function readSkinLayoutItemSpec(el) {

  if (!el || typeof el.getAttribute !== "function") {
    return { slot: null, params: {} };
  }

  const slotRaw = el.getAttribute(SKIN_LAYOUT_SLOT_ATTR);

  const params = {};

  Object.keys(SKIN_LAYOUT_ITEM_RULES).forEach((name) => {

    const raw = el.getAttribute(SKIN_LAYOUT_ITEM_PREFIX + name);

    if (raw !== null && isValidSkinLayoutAttributeValue(SKIN_LAYOUT_ITEM_PREFIX + name, raw)) {
      params[name] = raw;
    }

  });

  return {
    slot: SKIN_LAYOUT_SLOTS.indexOf(slotRaw) !== -1 ? slotRaw : null,
    params
  };

}


/* =========================================================
   5. 정규화 — 선언 -> 확정값

   기본값이 **여기에만** 있다. 스타일시트 쪽 var() 폴백에 기본값을
   또 적으면 두 곳이 갈라진다 — 컴파일러가 언제나 전부 써 넣으므로
   스타일시트의 폴백은 "컴파일러가 아직 안 돈 찰나"용 최소값이다.
========================================================== */

function skinLayoutInt(params, name, fallback) {

  const raw = params[name];

  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : fallback;

}

function skinLayoutEnum(params, name, fallback) {
  return params[name] === undefined ? fallback : params[name];
}

/* flex/grid 의 정렬 키워드로 옮긴다. between/around 만 CSS 이름이
   다르고 나머지는 그대로 쓴다(start/center/end/stretch 는 flex 와
   grid 양쪽에서 유효하다). */
function skinLayoutJustifyValue(token) {

  if (token === "between") {
    return "space-between";
  }

  if (token === "around") {
    return "space-around";
  }

  return token;

}

function skinLayoutTracks(columns) {
  return "repeat(" + columns + ", minmax(0, 1fr))";
}

/* min 을 준 grid 는 **열 수를 폭이 정한다**(auto-fit). 그래서
   columns* 를 무시한다 — 둘 다 의미를 가지면 어느 쪽이 이기는지
   파일만 보고 알 수 없다. min(…, 100%) 이 한 열도 못 들어가는 폭
   에서 넘치는 것을 막는다. */
function skinLayoutAutoTracks(min) {
  return "repeat(auto-fit, minmax(min(" + min + "px, 100%), 1fr))";
}

function normalizeSkinLayout(spec) {

  if (!spec || !isSkinLayoutType(spec.type)) {
    return null;
  }

  const type = spec.type;
  const params = spec.params || {};

  const resolved = {
    type,
    maxWidth: skinLayoutInt(params, "max-width", 0),
    minHeight: skinLayoutInt(params, "min-height", 0),
    overflow: skinLayoutEnum(params, "overflow", "visible"),
    align: skinLayoutEnum(params, "align", "stretch")
  };

  if (type === "stack") {

    resolved.direction = skinLayoutEnum(params, "direction", "column");
    resolved.gap = skinLayoutInt(params, "gap", 16);
    resolved.justify = skinLayoutEnum(params, "justify", "start");
    resolved.wrap = skinLayoutEnum(params, "wrap", "wrap");

  }

  if (type === "grid") {

    const columns = skinLayoutInt(params, "columns", 2);

    /* tablet/mobile 기본값을 **여기서** 확정한다. 스타일시트에서
       min(var(--cols), 2) 로 줄이고 싶어도 repeat() 의 반복 횟수는
       정수여야 해서 계산식이 들어가지 않는다 — 그래서 세 breakpoint
       의 트랙 문자열을 전부 JS 가 만들어 넘긴다(그 덕에 "모바일에서
       몇 열인가"가 테스트 가능한 순수 계산이 된다). */
    resolved.columns = columns;
    resolved.columnsTablet = skinLayoutInt(params, "columns-tablet", Math.min(columns, 3));
    resolved.columnsMobile = skinLayoutInt(params, "columns-mobile", Math.min(columns, 2));

    resolved.gap = skinLayoutInt(params, "gap", 16);
    resolved.rowGap = skinLayoutInt(params, "row-gap", resolved.gap);

    resolved.min = params.min === undefined ? 0 : skinLayoutInt(params, "min", 0);

    if (resolved.min > 0) {

      const autoTracks = skinLayoutAutoTracks(resolved.min);

      resolved.tracks = autoTracks;
      resolved.tracksTablet = autoTracks;
      resolved.tracksMobile = autoTracks;

    } else {

      resolved.tracks = skinLayoutTracks(resolved.columns);
      resolved.tracksTablet = skinLayoutTracks(resolved.columnsTablet);
      resolved.tracksMobile = skinLayoutTracks(resolved.columnsMobile);

    }

  }

  if (type === "free") {

    resolved.height = skinLayoutInt(params, "height", 320);

  }

  if (type === "sidebar") {

    resolved.side = skinLayoutEnum(params, "side", "left");
    resolved.sidebarWidth = skinLayoutInt(params, "sidebar-width", 220);
    resolved.gap = skinLayoutInt(params, "gap", 24);
    resolved.collapse = skinLayoutInt(params, "collapse", SKIN_LAYOUT_COLLAPSE_DEFAULT);
    resolved.mobile = skinLayoutEnum(params, "mobile", "stack");

    /* 사이드바 폭이 통째로 한 트랙이고 본문이 minmax(0,1fr) 이라
       본문이 자기 콘텐츠 때문에 트랙을 밀어내지 못한다. */
    resolved.tracks =
      resolved.side === "right"
        ? "minmax(0, 1fr) " + resolved.sidebarWidth + "px"
        : resolved.sidebarWidth + "px minmax(0, 1fr)";

  }

  return resolved;

}

function normalizeSkinLayoutItem(itemSpec, parentType) {

  const params = (itemSpec && itemSpec.params) || {};

  const resolved = {
    slot: (itemSpec && itemSpec.slot) || null
  };

  if (parentType === "grid") {

    resolved.span = skinLayoutInt(params, "span", 1);
    resolved.rowSpan = skinLayoutInt(params, "row-span", 1);

  }

  if (parentType === "free") {

    resolved.x = params.x === undefined ? 0 : Number(params.x);
    resolved.y = params.y === undefined ? 0 : Number(params.y);
    resolved.width = skinLayoutInt(params, "width", 40);
    resolved.height = skinLayoutInt(params, "height", 0);
    resolved.z = skinLayoutInt(params, "z", 0);

  }

  return resolved;

}


/* =========================================================
   6. 컴파일 — 확정값을 CSS custom property 로

   여기서 나오는 키는 전부 skin/skin-layout.css 가 읽는다. 두
   파일의 이름이 어긋나면 배치가 조용히 기본값으로 떨어지므로,
   단위 테스트가 실제로 두 파일을 읽어 "컴파일러가 쓰는 이름"과
   "스타일시트가 읽는 이름"을 대조한다.
========================================================== */

function buildSkinLayoutProperties(resolved) {

  if (!resolved) {
    return {};
  }

  const props = {
    "--imory-lay-max-width": resolved.maxWidth > 0 ? resolved.maxWidth + "px" : "none",
    "--imory-lay-min-height": resolved.minHeight + "px",
    "--imory-lay-overflow": resolved.overflow,
    "--imory-lay-align": resolved.align
  };

  if (resolved.type === "stack") {

    props["--imory-lay-direction"] = resolved.direction;
    props["--imory-lay-gap"] = resolved.gap + "px";
    props["--imory-lay-row-gap"] = resolved.gap + "px";
    props["--imory-lay-justify"] = skinLayoutJustifyValue(resolved.justify);
    props["--imory-lay-wrap"] = resolved.wrap;

  }

  if (resolved.type === "grid") {

    props["--imory-lay-gap"] = resolved.gap + "px";
    props["--imory-lay-row-gap"] = resolved.rowGap + "px";
    props["--imory-lay-tracks"] = resolved.tracks;
    props["--imory-lay-tracks-tablet"] = resolved.tracksTablet;
    props["--imory-lay-tracks-mobile"] = resolved.tracksMobile;

  }

  if (resolved.type === "free") {

    props["--imory-lay-height"] = resolved.height + "px";

  }

  if (resolved.type === "sidebar") {

    props["--imory-lay-gap"] = resolved.gap + "px";
    props["--imory-lay-row-gap"] = resolved.gap + "px";
    props["--imory-lay-tracks"] = resolved.tracks;
    props["--imory-lay-side-column"] = resolved.side === "right" ? "2" : "1";
    props["--imory-lay-main-column"] = resolved.side === "right" ? "1" : "2";

  }

  return props;

}

function buildSkinLayoutItemProperties(resolvedItem, parentType) {

  if (!resolvedItem) {
    return {};
  }

  const props = {};

  if (parentType === "grid") {

    props["--imory-it-column"] = "span " + resolvedItem.span;
    props["--imory-it-row"] = "span " + resolvedItem.rowSpan;

  }

  if (parentType === "free") {

    /* x=0 -> 왼쪽 끝, x=1 -> 오른쪽 끝(요소가 통째로 안쪽).
       left 는 컨테이너 폭의 비율이고 translate 는 **자기 폭**의
       비율이라, 둘을 더하면 x*(컨테이너폭 - 자기폭)이 된다 —
       폭이 얼마든 요소가 컨테이너를 벗어날 수 없는 이유다. */
    props["--imory-it-x"] = String(resolvedItem.x);
    props["--imory-it-y"] = String(resolvedItem.y);
    props["--imory-it-width"] = resolvedItem.width + "%";
    props["--imory-it-height"] = resolvedItem.height > 0 ? resolvedItem.height + "%" : "auto";
    props["--imory-it-z"] = String(resolvedItem.z);

  }

  return props;

}


/* =========================================================
   7. DOM 적용 — renderSkin() 이 mount 끝에 한 번 부른다

   compileSkinLayoutTree(root)

   "layout 을 선언한 요소"와 "그 요소의 자식"만 만진다. layout
   속성이 하나도 없는 스킨에서는 이 함수가 아무 요소도 건드리지
   않는다(style 속성조차 생기지 않는다) — 기존 스킨의 렌더 결과가
   글자 단위로 같아야 하기 때문이다(skin-folder-tree e2e 의
   "폴더 유무에 innerHTML 동일" 회귀와 sandbox 의 native/frame
   outerHTML 대조가 그것을 잰다).
========================================================== */

function applySkinLayoutProperties(el, props) {

  Object.keys(props).forEach((name) => {
    el.style.setProperty(name, props[name]);
  });

}

function compileSkinLayoutElement(el) {

  const spec = readSkinLayoutSpec(el);

  const resolved = normalizeSkinLayout(spec);

  if (!resolved) {
    return;
  }

  applySkinLayoutProperties(el, buildSkinLayoutProperties(resolved));

  /* 자식 파라미터가 의미를 갖는 것은 grid/free 뿐이다. 나머지
     type 에서는 자식을 아예 건드리지 않는다. */
  if (resolved.type !== "grid" && resolved.type !== "free") {
    return;
  }

  Array.prototype.forEach.call(el.children, (child) => {

    const itemProps =
      buildSkinLayoutItemProperties(
        normalizeSkinLayoutItem(readSkinLayoutItemSpec(child), resolved.type),
        resolved.type
      );

    applySkinLayoutProperties(child, itemProps);

  });

}

function compileSkinLayoutTree(root) {

  if (!root || typeof root.querySelectorAll !== "function") {
    return 0;
  }

  let count = 0;

  if (typeof root.hasAttribute === "function" && root.hasAttribute(SKIN_LAYOUT_ATTR)) {
    compileSkinLayoutElement(root);
    count += 1;
  }

  Array.prototype.forEach.call(
    root.querySelectorAll("[" + SKIN_LAYOUT_ATTR + "]"),
    (el) => {
      compileSkinLayoutElement(el);
      count += 1;
    }
  );

  return count;

}


/* =========================================================
   8. Studio / AI 가 쓰는 보조

   describeSkinLayoutTarget(el) -> Inspector 가 "이 요소로 무엇을
   할 수 있는가"를 판단하는 재료. DOM 요소 하나만 보고 답한다
   (Studio 의 stamped 사본에서도, 렌더된 화면에서도 같은 답).
========================================================== */

function describeSkinLayoutTarget(el) {

  const spec = readSkinLayoutSpec(el);

  const parent =
    el && el.parentElement ? el.parentElement : null;

  const parentSpec =
    parent ? readSkinLayoutSpec(parent) : null;

  const parentType =
    parentSpec ? parentSpec.type : null;

  const isRepeatTemplate =
    !!(el && typeof el.hasAttribute === "function" && el.hasAttribute("data-imory-repeat"));

  const siblings =
    parent ? Array.prototype.slice.call(parent.children) : [];

  const index = siblings.indexOf(el);

  return {
    type: spec ? spec.type : null,
    params: spec ? spec.params : {},
    typeParams: spec ? (SKIN_LAYOUT_TYPE_PARAMS[spec.type] || []) : [],
    parentType,
    parentIsLayout: !!parentType,
    itemParams: parentType ? (SKIN_LAYOUT_TYPE_ITEM_PARAMS[parentType] || []) : [],
    item: readSkinLayoutItemSpec(el),
    isRepeatTemplate,
    /* 순서 변경은 형제가 둘 이상 있고 부모가 순서를 의미 있게
       읽는 배치일 때만 말이 된다. free 는 순서가 아니라 좌표가
       자리를 정한다. */
    canReorder:
      !!parentType &&
      parentType !== "free" &&
      siblings.length > 1,
    index,
    siblingCount: siblings.length
  };

}


/* =========================================================
   9. 감사(audit) — 거부가 아니라 경고

   Import/Save 가 돌려주는 경고 목록에 실린다
   (skin/skin-template.js auditSkinPackageMaterials). "저장은 되지만
   화면에서 조용히 이상해지는" 조합만 짚는다.
========================================================== */

function auditSkinLayoutDocument(doc, pageLabel) {

  const warnings = [];

  if (!doc || typeof doc.querySelectorAll !== "function") {
    return warnings;
  }

  Array.prototype.forEach.call(
    doc.querySelectorAll("[" + SKIN_LAYOUT_ATTR + "]"),
    (el) => {

      const spec = readSkinLayoutSpec(el);

      if (!spec) {
        return;
      }

      const allowed = SKIN_LAYOUT_TYPE_PARAMS[spec.type] || [];

      Object.keys(spec.params).forEach((name) => {

        if (allowed.indexOf(name) === -1) {
          warnings.push(
            pageLabel + ": " + spec.type + " 배치에는 " +
            SKIN_LAYOUT_PARAM_PREFIX + name + " 이(가) 적용되지 않습니다."
          );
        }

      });

      if (spec.type === "sidebar") {

        const slots =
          Array.prototype.map.call(
            el.children,
            (child) => child.getAttribute(SKIN_LAYOUT_SLOT_ATTR)
          );

        if (slots.indexOf("sidebar") === -1) {
          warnings.push(
            pageLabel + ": 사이드바 배치에 " + SKIN_LAYOUT_SLOT_ATTR +
            '="sidebar" 인 자식이 없어 한 덩어리로 그려집니다.'
          );
        }

        /* 본문 덩어리가 여럿이면 그것들은 본문 열에 차곡차곡 쌓이고
           사이드바는 **첫 줄에만** 놓인다(skin/skin-layout.css 의
           SIDEBAR 주석 — grid-row: 1/-1 이 명시 행 없이는 1행을
           뜻한다는 실측). 세로로 늘어난 본문 옆에서 사이드바가
           짧게 끝나는 모양이 보통 의도가 아니라서 짚어 준다. */
        const mainCount =
          slots.filter((slot) => slot !== "sidebar").length;

        if (slots.indexOf("sidebar") !== -1 && mainCount > 1) {
          warnings.push(
            pageLabel + ": 사이드바 배치의 본문 덩어리가 " + mainCount +
            "개라 사이드바가 첫 줄에만 걸립니다 — 본문을 " +
            SKIN_LAYOUT_SLOT_ATTR + '="main" 하나로 묶고 그 안에서 세로로 쌓으세요.'
          );
        }

      }

      if (spec.type === "free") {

        const hasPositioned =
          Array.prototype.some.call(
            el.children,
            (child) =>
              child.hasAttribute(SKIN_LAYOUT_ITEM_PREFIX + "x") ||
              child.hasAttribute(SKIN_LAYOUT_ITEM_PREFIX + "y")
          );

        if (el.children.length > 1 && !hasPositioned) {
          warnings.push(
            pageLabel + ": 자유 배치인데 자식에 좌표가 없어 모두 같은 자리에 겹칩니다."
          );
        }

      }

    }
  );

  return warnings;

}


/* =========================================================
   10. 노출 — classic script(window) + node(require)
========================================================== */

if (typeof window !== "undefined") {

  window.SKIN_LAYOUT_ATTR = SKIN_LAYOUT_ATTR;
  window.SKIN_LAYOUT_PARAM_PREFIX = SKIN_LAYOUT_PARAM_PREFIX;
  window.SKIN_LAYOUT_ITEM_PREFIX = SKIN_LAYOUT_ITEM_PREFIX;
  window.SKIN_LAYOUT_SLOT_ATTR = SKIN_LAYOUT_SLOT_ATTR;
  window.SKIN_LAYOUT_TYPES = SKIN_LAYOUT_TYPES;
  window.SKIN_LAYOUT_SLOTS = SKIN_LAYOUT_SLOTS;
  window.SKIN_LAYOUT_TYPE_PARAMS = SKIN_LAYOUT_TYPE_PARAMS;
  window.SKIN_LAYOUT_TYPE_ITEM_PARAMS = SKIN_LAYOUT_TYPE_ITEM_PARAMS;
  window.SKIN_LAYOUT_PARAM_RULES = SKIN_LAYOUT_PARAM_RULES;
  window.SKIN_LAYOUT_ITEM_RULES = SKIN_LAYOUT_ITEM_RULES;
  window.SKIN_LAYOUT_COLLAPSE_STEPS = SKIN_LAYOUT_COLLAPSE_STEPS;

  window.isSkinLayoutType = isSkinLayoutType;
  window.isSkinLayoutAttributeName = isSkinLayoutAttributeName;
  window.isValidSkinLayoutAttributeValue = isValidSkinLayoutAttributeValue;
  window.readSkinLayoutSpec = readSkinLayoutSpec;
  window.readSkinLayoutItemSpec = readSkinLayoutItemSpec;
  window.normalizeSkinLayout = normalizeSkinLayout;
  window.normalizeSkinLayoutItem = normalizeSkinLayoutItem;
  window.buildSkinLayoutProperties = buildSkinLayoutProperties;
  window.buildSkinLayoutItemProperties = buildSkinLayoutItemProperties;
  window.compileSkinLayoutTree = compileSkinLayoutTree;
  window.describeSkinLayoutTarget = describeSkinLayoutTarget;
  window.auditSkinLayoutDocument = auditSkinLayoutDocument;

}

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SKIN_LAYOUT_ATTR,
    SKIN_LAYOUT_PARAM_PREFIX,
    SKIN_LAYOUT_ITEM_PREFIX,
    SKIN_LAYOUT_SLOT_ATTR,
    SKIN_LAYOUT_TYPES,
    SKIN_LAYOUT_SLOTS,
    SKIN_LAYOUT_TYPE_PARAMS,
    SKIN_LAYOUT_TYPE_ITEM_PARAMS,
    SKIN_LAYOUT_PARAM_RULES,
    SKIN_LAYOUT_ITEM_RULES,
    SKIN_LAYOUT_COLLAPSE_STEPS,
    SKIN_LAYOUT_COLLAPSE_DEFAULT,
    SKIN_LAYOUT_TABLET_MAX,
    SKIN_LAYOUT_MOBILE_MAX,
    isSkinLayoutType,
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
  };

}
