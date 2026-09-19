/* =========================================================
   SKIN SIDES — HOME 좌우 영역 (EDITORIAL-RESPONSIVE-HOME-1)

   기준 문서: IMORY_SIDES_DESIGN.md

   웹사이트에서 흔히 쓰는 **사이드 영역**이다. 편집면도 별도
   페이지도 아니다.

     데스크톱  본문 옆에 처음부터 보이는 칼럼
     모바일    평소에는 숨었다가 버튼을 누르면 좌/우에서 나오는
               오프캔버스 패널

   ── 둘로 나뉜다 — 설정과 디자인 ─────────────────────────
   Bottom Dock 과 같은 결이다(IMORY_BOTTOM_DOCK_DESIGN.md §2).

     설정  어느 쪽 영역을 켜는가(1단 · 2단 · 3단)
           → SkinPackage.regions (지금까지 비어 있던 그 배열)
     디자인 영역이 어디 있고 무엇을 어떻게 그리는가
           → templates.*.html 의 data-imory-sides* 속성 + 스킨 CSS

   regions 는 원래부터 모든 경로(Import · Export · Save · Publish ·
   AI)를 그대로 지나가던 최상위 배열이다. 새 최상위 필드를 만들지
   않고 그 자리를 쓴다.

     "regions": [
       { "name": "left_sidebar",  "enabled": true },
       { "name": "right_sidebar", "enabled": true }
     ]

   - 이름이 이 둘이 아닌 항목은 읽지 않고 **그대로 보존**한다.
   - 항목을 지우지 않고 enabled 만 바꾼다 — 영역을 숨겼다가 다시
     켜도 그 항목에 나중에 붙을 설정(내용 순서 등)이 남는다.
   - 기존 스킨의 `regions: []` 는 두 영역이 모두 꺼진 것이다. 그리고
     기존 스킨에는 영역 마크업 자체가 없으므로 이 파일은 그 화면의
     어떤 요소도 건드리지 않는다.

   ── 마크업 계약 ─────────────────────────────────────────
     data-imory-sides="frame"              세 칸을 담는 틀
     data-imory-sides-area="left|main|right"  각 칸
     data-imory-sides-open="left|right"    모바일에서 그쪽 패널을 여는 것
     data-imory-sides-close[="left|right"] 패널 안의 닫기

   값은 이 표가 전부다. 저장 경계(skin/skin-sanitize.js)가 여기에
   묻는다. 플랫폼이 렌더 뒤에 얹는 상태(아래 SKIN_SIDES_RUNTIME_*)는
   표에 없으므로 저장되는 HTML 에 들어갈 수 없다.

   ── 시스템과 스킨의 몫 ─────────────────────────────────
   시스템: 좌/우 식별 · 칼럼 ↔ 패널 전환 · 열림 상태 · 키보드 ·
           포커스 · 스크롤 잠금 · 데이터(기존 Context 바인딩).
   스킨:   폭 · 배경 · 선 · 등장 모션 · 안쪽 조판 · 순서.

   skin/skin-sides.css 에 색·그림자·글꼴이 없다. 모션은 기본값만
   있고 스킨이 custom property 나 자기 선언으로 바꾼다.

   ── 칼럼인가 패널인가 ──────────────────────────────────
   기기 이름이 아니라 **폭**으로 정한다.

     필요한 폭 = 본문 최소 가독 폭 + 켜진 영역들의 폭
     틀의 안쪽 폭 >= 필요한 폭  → 칼럼
     아니면                     → 패널

   세 값 모두 스킨이 custom property 로 바꿀 수 있고(어떤 CSS 길이든
   — 탐침 요소에 실제로 그려서 잰다), 기본값에서의 경계는
   2단 ≥ 824px · 3단 ≥ 1088px 이다(기준 문서 §4).

   ES 모듈이 아니다 — skin-layout.js 처럼 classic script 이고,
   노드 단위 테스트를 위해 module.exports 로도 낸다.
========================================================== */

const SKIN_SIDES_ATTR = "data-imory-sides";

const SKIN_SIDES_AREA_ATTR = "data-imory-sides-area";

const SKIN_SIDES_OPEN_ATTR = "data-imory-sides-open";

const SKIN_SIDES_CLOSE_ATTR = "data-imory-sides-close";


/* 저장 경계가 받는 값 — 이것이 계약의 전부다 */
const SKIN_SIDES_ATTRIBUTE_RULES = {
  [SKIN_SIDES_ATTR]: ["frame"],
  [SKIN_SIDES_AREA_ATTR]: ["left", "main", "right"],
  [SKIN_SIDES_OPEN_ATTR]: ["left", "right"],
  [SKIN_SIDES_CLOSE_ATTR]: ["", "left", "right"]
};


/* SkinPackage.regions 의 이름 ↔ 쪽 */
const SKIN_SIDES_REGION_NAMES = {
  left: "left_sidebar",
  right: "right_sidebar"
};

const SKIN_SIDES = ["left", "right"];


/* 렌더 뒤에 플랫폼이 얹는 상태(저장되지 않는다) */
const SKIN_SIDES_RUNTIME_LAYOUT = "data-imory-sides-layout";   /* columns | drawer */
const SKIN_SIDES_RUNTIME_ON = "data-imory-sides-on";           /* "left right" | "right" | "" */
const SKIN_SIDES_RUNTIME_COUNT = "data-imory-sides-count";     /* 1 | 2 | 3 */
const SKIN_SIDES_RUNTIME_ACTIVE = "data-imory-sides-active";   /* left | right (패널이 보이는 동안) */
const SKIN_SIDES_RUNTIME_PHASE = "data-imory-sides-phase";     /* open | closing */
const SKIN_SIDES_RUNTIME_STATE = "data-imory-sides-state";     /* off | column | closed | open | closing */
const SKIN_SIDES_RUNTIME_INSTANT = "data-imory-sides-instant"; /* 움직임 없이 한 번 */
const SKIN_SIDES_BACKDROP_ATTR = "data-imory-sides-backdrop";
const SKIN_SIDES_PROBE_ATTR = "data-imory-sides-probe";
const SKIN_SIDES_FALLBACK_ATTR = "data-imory-sides-fallback";

/* 닫히는 움직임을 기다리는 상한 — 스킨이 아주 긴 전환을 써도 잠금이
   그 이상 남지 않는다 */
const SKIN_SIDES_CLOSE_WAIT_MAX_MS = 1200;

const SKIN_SIDES_LABELS = {
  left: { area: "왼쪽 영역", open: "왼쪽 영역 열기", close: "왼쪽 영역 닫기" },
  right: { area: "오른쪽 영역", open: "오른쪽 영역 열기", close: "오른쪽 영역 닫기" }
};


/* =========================================================
   1. 설정 — SkinPackage.regions
========================================================== */

function isSkinSidesRegionEntry(entry) {

  return (
    !!entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    (entry.name === SKIN_SIDES_REGION_NAMES.left ||
      entry.name === SKIN_SIDES_REGION_NAMES.right)
  );

}


/*
  readSkinSidesSetting(regions) -> { left, right } | null

  영역 항목이 하나도 없으면 null("이 스킨은 영역 설정을 쓰지 않는다").
  항목이 있으면 enabled 가 정확히 false 가 아닌 한 켜진 것이다 —
  { "name": "right_sidebar" } 한 줄만 적어도 켜진다. 같은 이름이
  둘이면 앞의 것이 이긴다.
*/
function readSkinSidesSetting(regions) {

  if (!Array.isArray(regions)) {
    return null;
  }

  const seen = {};

  regions.forEach((entry) => {

    if (!isSkinSidesRegionEntry(entry)) {
      return;
    }

    const side =
      entry.name === SKIN_SIDES_REGION_NAMES.left ? "left" : "right";

    if (side in seen) {
      return;
    }

    seen[side] = entry.enabled !== false;

  });

  if (!("left" in seen) && !("right" in seen)) {
    return null;
  }

  return { left: seen.left === true, right: seen.right === true };

}


function resolveSkinSidesSetting(skinPackage) {

  return readSkinSidesSetting(skinPackage && skinPackage.regions);

}


/* { left, right } -> 1 | 2 | 3 */
function skinSidesCount(setting) {

  return 1 + (setting && setting.left ? 1 : 0) + (setting && setting.right ? 1 : 0);

}


/* 1 | 2 | 3 -> { left, right } — 2단은 오른쪽이다(요구사항 2절) */
function skinSidesSettingForCount(count) {

  if (count === 3) {
    return { left: true, right: true };
  }

  if (count === 2) {
    return { left: false, right: true };
  }

  return { left: false, right: false };

}


/*
  writeSkinSidesSetting(regions, { left, right }) -> 새 regions 배열

  - 원래 배열을 바꾸지 않는다.
  - 영역이 아닌 항목은 자리 그대로 둔다.
  - 영역 항목은 지우지 않고 enabled 만 바꾼다(항목의 다른 칸도 보존).
  - 없던 쪽은 끝에 더한다(꺼짐이어도 — "이 스킨은 이 쪽을 안다"는
    기록이 남아 다음에 켤 때 같은 자리다).
*/
function writeSkinSidesSetting(regions, setting) {

  const next = [];

  const written = {};

  (Array.isArray(regions) ? regions : []).forEach((entry) => {

    if (!isSkinSidesRegionEntry(entry)) {
      next.push(entry);
      return;
    }

    const side =
      entry.name === SKIN_SIDES_REGION_NAMES.left ? "left" : "right";

    if (written[side]) {
      /* 같은 이름이 둘이면 뒤의 것은 버린다 — 읽을 때도 앞의 것만 본다 */
      return;
    }

    written[side] = true;

    next.push({ ...entry, enabled: !!(setting && setting[side]) });

  });

  SKIN_SIDES.forEach((side) => {

    if (!written[side]) {
      next.push({ name: SKIN_SIDES_REGION_NAMES[side], enabled: !!(setting && setting[side]) });
    }

  });

  return next;

}


/*
  EDITORIAL-DEFAULT-SKIN-2 — 모바일에서 좌우 영역을 패널로 열 수 있는가.

  같은 영역 항목의 `mobile` 칸이다. 정확히 false 일 때만 "모바일에서는
  이 영역을 두지 않는다"이고, 없으면 지금까지처럼 패널로 연다. 칼럼
  (넓은 화면)에는 영향이 없다.

    { "name": "right_sidebar", "enabled": true, "mobile": false }

  readSkinSidesMobileSetting(regions) -> { left, right }  (true = 패널로 연다)
*/
function readSkinSidesMobileSetting(regions) {

  const allowed = { left: true, right: true };

  const seen = {};

  (Array.isArray(regions) ? regions : []).forEach((entry) => {

    if (!isSkinSidesRegionEntry(entry)) {
      return;
    }

    const side =
      entry.name === SKIN_SIDES_REGION_NAMES.left ? "left" : "right";

    if (seen[side]) {
      return;
    }

    seen[side] = true;

    allowed[side] = entry.mobile !== false;

  });

  return allowed;

}


/*
  writeSkinSidesMobileSetting(regions, allow) -> 새 regions 배열

  두 영역에 같은 값을 쓴다(Studio 에는 "모바일에서 좌우 영역" 하나다).
  허용이면 `mobile` 칸을 지운다 — 기본값을 적어 두지 않는다. 영역 항목이
  없으면 꺼진 채로 만든다(단 구성은 바꾸지 않는다).
*/
function writeSkinSidesMobileSetting(regions, allow) {

  const current = readSkinSidesSetting(regions) || { left: false, right: false };

  const withEntries = writeSkinSidesSetting(regions, current);

  return withEntries.map((entry) => {

    if (!isSkinSidesRegionEntry(entry)) {
      return entry;
    }

    const copy = { ...entry };

    if (allow) {
      delete copy.mobile;
    } else {
      copy.mobile = false;
    }

    return copy;

  });

}


/* 렌더 재료에 싣는 모양 — 영역 설정이 없으면 undefined(키를 만들지 않는다).
   모바일에서 끈 쪽이 있을 때만 `mobile` 을 싣는다(지금까지의 봉투 그대로). */
function buildSkinSidesRenderSetting(skinPackage) {

  const setting = resolveSkinSidesSetting(skinPackage);

  if (!setting) {
    return undefined;
  }

  const result = { left: setting.left, right: setting.right };

  const mobile = readSkinSidesMobileSetting(skinPackage && skinPackage.regions);

  if (!mobile.left || !mobile.right) {
    result.mobile = { left: mobile.left, right: mobile.right };
  }

  return result;

}


/* 프레임/Preview 봉투에서 온 값 — 모양이 틀리면 둘 다 꺼짐 */
function coerceSkinSidesRenderSetting(value) {

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { left: false, right: false };
  }

  const result = { left: value.left === true, right: value.right === true };

  const mobile = value.mobile;

  if (
    mobile && typeof mobile === "object" && !Array.isArray(mobile) &&
    (mobile.left === false || mobile.right === false)
  ) {
    result.mobile = { left: mobile.left !== false, right: mobile.right !== false };
  }

  return result;

}


/* =========================================================
   2. 마크업 — 저장 경계 · 감지
========================================================== */

function isSkinSidesAttributeName(name) {

  return Object.prototype.hasOwnProperty.call(SKIN_SIDES_ATTRIBUTE_RULES, name);

}


/* 저장할 값 | null(버린다) */
function sanitizeSkinSidesAttributeValue(name, value) {

  if (!isSkinSidesAttributeName(name)) {
    return null;
  }

  const normalized = String(value == null ? "" : value).trim().toLowerCase();

  return SKIN_SIDES_ATTRIBUTE_RULES[name].indexOf(normalized) !== -1
    ? normalized
    : null;

}


/*
  skinHtmlHasSidesFrame(html) -> { frame, left, right }

  Studio 패널이 "이 스킨의 HOME 에 좌우 자리가 있는가"를 알려 준다.
  DOM 을 만들지 않고 속성 글자만 본다(Studio 문서에서 매 렌더마다
  부르므로). 저장 경계를 지난 HTML 이면 따옴표 모양이 일정하다.
*/
function skinHtmlHasSidesFrame(html) {

  const text = String(html || "");

  return {
    frame: /data-imory-sides\s*=\s*["']?frame\b/i.test(text),
    left: /data-imory-sides-area\s*=\s*["']?left\b/i.test(text),
    right: /data-imory-sides-area\s*=\s*["']?right\b/i.test(text)
  };

}


/* =========================================================
   3. 스크롤 잠금 (공용 — sandbox 부모도 같은 함수를 쓴다)

   패널이 열린 동안 **뒤 문서가 스크롤되지 않게** 한다. 공개 HOME
   은 문서가 아니라 #themeMount 가 스크롤하므로(home-base.css) 문서
   하나만 잠그면 안 된다 — 틀에서 위로 올라가며 실제로 스크롤 중인
   조상을 전부 잠그고, 문서도 잠근다.

   overflow:hidden 은 scrollTop 을 바꾸지 않는다. 그래도 닫을 때
   원래 값을 다시 적는다(어떤 엔진은 잠그는 순간 0 으로 돌린다).
   스크롤바가 사라지며 폭이 넓어지는 것은 padding 으로 메운다 —
   메우지 않으면 넓어진 폭이 칼럼 판정을 뒤집어 패널이 스스로
   닫힐 수 있다.
========================================================== */

function readSkinSidesScrollbarGap(el, win, isRoot) {

  if (isRoot) {
    return Math.max(0, win.innerWidth - el.ownerDocument.documentElement.clientWidth);
  }

  const cs = win.getComputedStyle(el);

  const borders =
    (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);

  return Math.max(0, el.offsetWidth - el.clientWidth - borders);

}


function lockSkinSidesScroll(anchor) {

  const doc = anchor && anchor.ownerDocument;

  const win = doc && doc.defaultView;

  if (!doc || !win) {
    return () => {};
  }

  const targets = [];

  let el = anchor.parentElement;

  while (el && el !== doc.body && el !== doc.documentElement) {

    const cs = win.getComputedStyle(el);

    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) {
      targets.push({ el, isRoot: false });
    }

    el = el.parentElement;

  }

  targets.push({ el: doc.documentElement, isRoot: true });

  const records = targets.map(({ el: target, isRoot }) => {

    const gap = readSkinSidesScrollbarGap(target, win, isRoot);

    const padTarget = isRoot ? doc.body : target;

    const record = {
      el: target,
      padTarget,
      overflow: target.style.overflow,
      paddingRight: padTarget ? padTarget.style.paddingRight : "",
      scrollTop: isRoot ? (doc.scrollingElement || target).scrollTop : target.scrollTop,
      scrollLeft: isRoot ? (doc.scrollingElement || target).scrollLeft : target.scrollLeft
    };

    if (gap > 0 && padTarget) {
      const current = parseFloat(win.getComputedStyle(padTarget).paddingRight) || 0;
      padTarget.style.paddingRight = `${current + gap}px`;
    }

    /* 문서는 html 하나만 잠근다. body 까지 잠그면 높이가 정해진 body
       (Studio Preview 문서가 그렇다)가 내용을 잘라 문서 높이가 화면
       높이로 줄고, 그 순간 스크롤 위치가 0 으로 밀린다(2026-09-19 실측). */
    target.style.overflow = "hidden";

    return record;

  });

  let released = false;

  return function releaseSkinSidesScroll() {

    if (released) {
      return;
    }

    released = true;

    records.slice().reverse().forEach((record) => {

      record.el.style.overflow = record.overflow;

      if (record.padTarget) {
        record.padTarget.style.paddingRight = record.paddingRight;
      }

      const scroller =
        record.el === doc.documentElement
          ? (doc.scrollingElement || record.el)
          : record.el;

      if (scroller.scrollTop !== record.scrollTop) {
        scroller.scrollTop = record.scrollTop;
      }

      if (scroller.scrollLeft !== record.scrollLeft) {
        scroller.scrollLeft = record.scrollLeft;
      }

    });

  };

}


/* =========================================================
   4. 포커스
========================================================== */

const SKIN_SIDES_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function listSkinSidesFocusable(container) {

  return Array.from(container.querySelectorAll(SKIN_SIDES_FOCUSABLE)).filter((el) => {

    if (el.closest("[inert]") || el.hidden) {
      return false;
    }

    const rects = el.getClientRects();

    return rects.length > 0;

  });

}


function hasSkinSidesAccessibleName(el) {

  if ((el.getAttribute("aria-label") || "").trim()) {
    return true;
  }

  if ((el.getAttribute("aria-labelledby") || "").trim()) {
    return true;
  }

  if (/[\p{L}\p{N}]/u.test(el.textContent || "")) {
    return true;
  }

  return Array.from(el.querySelectorAll("img[alt]")).some(
    (img) => (img.getAttribute("alt") || "").trim()
  );

}


/* =========================================================
   5. 런타임 — 틀 하나의 컨트롤러
========================================================== */

let skinSidesInstanceCounter = 0;

const SKIN_SIDES_CONTROLLERS_KEY = "__imorySidesControllers";


function belongsToSkinSidesFrame(el, frame) {

  return el.closest(`[${SKIN_SIDES_ATTR}="frame"]`) === frame;

}


function queryOwnSkinSides(frame, selector) {

  return Array.from(frame.querySelectorAll(selector)).filter(
    (el) => belongsToSkinSidesFrame(el, frame)
  );

}


function createSkinSidesController(frame, setting, options) {

  const doc = frame.ownerDocument;

  const win = doc.defaultView;

  const instance = ++skinSidesInstanceCounter;

  const opts = options || {};

  const state = {
    layout: null,
    active: null,     /* 지금 보이는 패널 쪽(열림 · 닫히는 중) */
    phase: null,      /* open | closing */
    opener: null,
    release: null,
    closeTimer: 0,
    closeDone: null,
    observer: null,
    probes: null,
    destroyed: false
  };

  const areas = {
    main: queryOwnSkinSides(frame, `[${SKIN_SIDES_AREA_ATTR}="main"]`)[0] || null,
    left: queryOwnSkinSides(frame, `[${SKIN_SIDES_AREA_ATTR}="left"]`)[0] || null,
    right: queryOwnSkinSides(frame, `[${SKIN_SIDES_AREA_ATTR}="right"]`)[0] || null
  };

  /* 켜져 있어도 자리를 안 그렸으면 그 쪽은 없는 것이다 */
  const enabled = {
    left: !!(setting.left && areas.left),
    right: !!(setting.right && areas.right)
  };

  const count = 1 + (enabled.left ? 1 : 0) + (enabled.right ? 1 : 0);

  /* EDITORIAL-DEFAULT-SKIN-2 — 모바일(패널)에서는 두지 않는 쪽. 칼럼일
     때는 켜진 그대로이고, 패널일 때만 꺼진 쪽처럼 보인다(여는 버튼도
     없다). 칼럼/패널 판정의 폭 계산은 바꾸지 않는다. */
  const noDrawer = {
    left: !!(setting.mobile && setting.mobile.left === false),
    right: !!(setting.mobile && setting.mobile.right === false)
  };

  const usable = (side) =>
    enabled[side] && !(state.layout === "drawer" && noDrawer[side]);

  const onListNow = () => SKIN_SIDES.filter(usable).join(" ");

  frame.setAttribute(SKIN_SIDES_RUNTIME_ON, SKIN_SIDES.filter((side) => enabled[side]).join(" "));
  frame.setAttribute(SKIN_SIDES_RUNTIME_COUNT, String(count));


  /* --- 영역 ------------------------------------------------ */

  SKIN_SIDES.forEach((side) => {

    const area = areas[side];

    if (!area) {
      return;
    }

    if (!area.id) {
      area.id = `imory-sides-${instance}-${side}`;
    }

    /* 영역 이름은 안의 글자가 아니라 자리의 이름이어야 한다(패널로
       열릴 때 대화상자의 이름이 된다) — 스킨이 안 적었으면 둔다 */
    if (!(area.getAttribute("aria-label") || "").trim() &&
        !(area.getAttribute("aria-labelledby") || "").trim()) {
      area.setAttribute("aria-label", SKIN_SIDES_LABELS[side].area);
    }

    if (!enabled[side]) {
      area.setAttribute(SKIN_SIDES_RUNTIME_STATE, "off");
      area.setAttribute("inert", "");
      return;
    }

    /* 스킨이 닫기를 안 그렸으면 하나 둔다 — 없으면 키보드 없는 손가락
       사용자가 바깥을 누르는 것 말고는 닫을 방법이 없다 */
    if (!area.querySelector(`[${SKIN_SIDES_CLOSE_ATTR}]`)) {

      const close = doc.createElement("button");
      close.type = "button";
      close.setAttribute(SKIN_SIDES_CLOSE_ATTR, side);
      close.setAttribute(SKIN_SIDES_FALLBACK_ATTR, "");
      close.setAttribute("aria-label", SKIN_SIDES_LABELS[side].close);
      close.textContent = "×";
      area.insertBefore(close, area.firstChild);

    }

    area.querySelectorAll(`[${SKIN_SIDES_CLOSE_ATTR}]`).forEach((closer) => {

      const tag = closer.tagName.toLowerCase();

      if (tag !== "button" && !(tag === "a" && closer.hasAttribute("href"))) {
        closer.setAttribute("role", "button");
        closer.setAttribute("tabindex", "0");
      }

      if (!hasSkinSidesAccessibleName(closer)) {
        closer.setAttribute("aria-label", SKIN_SIDES_LABELS[side].close);
      }

    });

  });


  /* --- 여는 것 ---------------------------------------------- */

  SKIN_SIDES.forEach((side) => {

    if (!enabled[side]) {
      return;
    }

    const own = queryOwnSkinSides(frame, `[${SKIN_SIDES_OPEN_ATTR}="${side}"]`);

    if (own.length) {
      return;
    }

    const trigger = doc.createElement("button");
    trigger.type = "button";
    trigger.setAttribute(SKIN_SIDES_OPEN_ATTR, side);
    trigger.setAttribute(SKIN_SIDES_FALLBACK_ATTR, "");
    trigger.textContent = side === "left" ? "☰" : "⋯";
    frame.insertBefore(trigger, frame.firstChild);

  });

  const triggers = queryOwnSkinSides(frame, `[${SKIN_SIDES_OPEN_ATTR}]`);

  triggers.forEach((trigger) => {

    const side = trigger.getAttribute(SKIN_SIDES_OPEN_ATTR);

    const tag = trigger.tagName.toLowerCase();

    if (tag !== "button" && !(tag === "a" && trigger.hasAttribute("href"))) {
      trigger.setAttribute("role", "button");
      trigger.setAttribute("tabindex", "0");
    }

    /* 기호(☰ · ⋯ · ✕)만 있는 버튼은 이름이 없는 것과 같다 */
    if (trigger.hasAttribute(SKIN_SIDES_FALLBACK_ATTR) || !hasSkinSidesAccessibleName(trigger)) {
      trigger.setAttribute("aria-label", SKIN_SIDES_LABELS[side].open);
    }

    if (areas[side]) {
      trigger.setAttribute("aria-controls", areas[side].id);
    }

    trigger.setAttribute("aria-expanded", "false");

  });


  /* --- 바깥(덮개) -------------------------------------------- */

  let backdrop = null;

  if (enabled.left || enabled.right) {
    backdrop = doc.createElement("div");
    backdrop.setAttribute(SKIN_SIDES_BACKDROP_ATTR, "");
    backdrop.setAttribute("aria-hidden", "true");
    frame.appendChild(backdrop);
  }


  /* --- 폭 재기 ---------------------------------------------- */

  function ensureProbes() {

    if (state.probes) {
      return state.probes;
    }

    const make = (name) => {
      const probe = doc.createElement("div");
      probe.setAttribute(SKIN_SIDES_PROBE_ATTR, name);
      probe.setAttribute("aria-hidden", "true");
      frame.appendChild(probe);
      return probe;
    };

    state.probes = { left: make("left"), right: make("right"), main: make("main"), width: make("width") };

    return state.probes;

  }


  function measureNeed() {

    const probes = ensureProbes();

    return (
      probes.main.getBoundingClientRect().width +
      (enabled.left ? probes.left.getBoundingClientRect().width : 0) +
      (enabled.right ? probes.right.getBoundingClientRect().width : 0)
    );

  }


  function frameInnerWidth() {

    const cs = win.getComputedStyle(frame);

    return (
      frame.clientWidth -
      (parseFloat(cs.paddingLeft) || 0) -
      (parseFloat(cs.paddingRight) || 0)
    );

  }


  function decideLayout() {

    if (count === 1) {
      return "columns";
    }

    const width = frameInnerWidth();

    if (!(width > 0)) {
      return null;
    }

    return width + 0.5 >= measureNeed() ? "columns" : "drawer";

  }


  /* --- 상태 쓰기 --------------------------------------------- */

  function paintArea(side) {

    const area = areas[side];

    if (!area || !enabled[side]) {
      return;
    }

    /* 모바일에서 두지 않는 쪽 — 패널일 때는 꺼진 영역과 같다 */
    if (!usable(side)) {
      area.setAttribute(SKIN_SIDES_RUNTIME_STATE, "off");
      area.setAttribute("inert", "");
      if (area.getAttribute("aria-modal") === "true") {
        area.removeAttribute("role");
        area.removeAttribute("aria-modal");
      }
      return;
    }

    let next;

    if (state.layout !== "drawer") {
      next = "column";
    } else if (state.active === side) {
      next = state.phase === "closing" ? "closing" : "open";
    } else {
      next = "closed";
    }

    area.setAttribute(SKIN_SIDES_RUNTIME_STATE, next);

    const modal = next === "open";

    if (next === "closed") {
      area.setAttribute("inert", "");
    } else {
      area.removeAttribute("inert");
    }

    if (modal) {
      area.setAttribute("role", "dialog");
      area.setAttribute("aria-modal", "true");
    } else if (area.getAttribute("aria-modal") === "true") {
      area.removeAttribute("role");
      area.removeAttribute("aria-modal");
    }

  }


  function paint() {

    if (state.layout) {
      frame.setAttribute(SKIN_SIDES_RUNTIME_LAYOUT, state.layout);
    }

    /* 보이는 쪽 목록 — 모바일에서 두지 않는 쪽은 패널일 때 빠진다
       (스킨 CSS 가 "오른쪽이 없으면 본문에 최근 글" 같은 규칙을 이
       값으로 쓴다) */
    frame.setAttribute(SKIN_SIDES_RUNTIME_ON, onListNow());

    if (state.active) {
      frame.setAttribute(SKIN_SIDES_RUNTIME_ACTIVE, state.active);
      frame.setAttribute(SKIN_SIDES_RUNTIME_PHASE, state.phase || "open");
    } else {
      frame.removeAttribute(SKIN_SIDES_RUNTIME_ACTIVE);
      frame.removeAttribute(SKIN_SIDES_RUNTIME_PHASE);
    }

    SKIN_SIDES.forEach(paintArea);

    triggers.forEach((trigger) => {
      const side = trigger.getAttribute(SKIN_SIDES_OPEN_ATTR);
      trigger.setAttribute(
        "aria-expanded",
        state.active === side && state.phase === "open" ? "true" : "false"
      );
    });

    /* 패널이 열린 동안 나머지는 손이 닿지 않는다 */
    const modalOpen = state.active && state.phase === "open";

    if (areas.main) {
      if (modalOpen) {
        areas.main.setAttribute("inert", "");
      } else {
        areas.main.removeAttribute("inert");
      }
    }

  }


  function applyLayout(next) {

    if (!next || next === state.layout) {
      return;
    }

    const wasDrawer = state.layout === "drawer";

    state.layout = next;

    if (wasDrawer && next !== "drawer" && state.active) {
      finishClose({ restoreFocus: false, silent: false });
    }

    paint();

  }


  function measure() {

    if (state.destroyed) {
      return;
    }

    applyLayout(decideLayout());

  }


  /* ResizeObserver 에서 부를 때 — 판정이 이미 있으면 다음 프레임에
     바꾼다. 콜백 안에서 곧바로 칼럼 ↔ 패널을 바꾸면 틀 높이가 바뀌고,
     그 높이를 보는 다른 관찰자(sandbox 프레임의 높이 보고 · 더 얕은
     요소)의 알림이 같은 바퀴에 전달되지 못해 "ResizeObserver loop"
     경고가 난다(2026-09-19 WebKit 실측). 아직 판정이 없으면(처음 붙는
     순간) 곧바로 — 한 프레임이라도 틀린 배치를 보이지 않게. */
  let measureFrame = 0;

  /* 처음 자리 잡는 동안은 곧바로 — 공개 HOME 의 #themeMount 는 렌더
     직후 한 순간 콘텐츠 폭으로 줄어 있다가(theme-mount--skin 이 붙기
     전) 넓어진다. 그 변화를 다음 프레임으로 미루면 데스크톱 첫 화면에
     패널 배치가 한 프레임 보인다(2026-09-20 WebKit 실측). 그 클래스는
     렌더와 같은 task 안에서 붙으므로 **첫 두 프레임**만 곧바로 적용하고,
     그 뒤의 폭 변화(창 크기 · Studio Desktop/Mobile)는 다음 프레임으로
     넘긴다. */
  let settleOpen = true;

  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(() => { settleOpen = false; });
  });

  const settling = () => settleOpen;

  function onResize() {

    if (state.destroyed) {
      return;
    }

    if (!state.layout || settling()) {
      measure();
      return;
    }

    if (measureFrame) {
      return;
    }

    measureFrame = win.requestAnimationFrame(() => {
      measureFrame = 0;
      measure();
    });

  }


  /* --- 열고 닫기 --------------------------------------------- */

  function emit(open) {

    try {
      doc.dispatchEvent(
        new win.CustomEvent("imory-sides-change", {
          detail: { open: !!open, side: open ? state.active : null }
        })
      );
    } catch (err) {
      /* 이벤트를 못 만드는 환경 — 알림만 빠진다 */
    }

  }


  function clearCloseWait() {

    if (state.closeTimer) {
      win.clearTimeout(state.closeTimer);
      state.closeTimer = 0;
    }

    if (state.closeDone && state.active && areas[state.active]) {
      areas[state.active].removeEventListener("transitionend", state.closeDone);
      areas[state.active].removeEventListener("animationend", state.closeDone);
    }

    state.closeDone = null;

  }


  function onDocumentKeydown(event) {

    if (!state.active || state.phase !== "open") {
      return;
    }

    if (event.key === "Escape" || event.key === "Esc") {
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const area = areas[state.active];

    const focusable = listSkinSidesFocusable(area);

    if (!focusable.length) {
      event.preventDefault();
      area.focus({ preventScroll: true });
      return;
    }

    /* 브라우저에 맡기지 않고 매번 직접 옮긴다 — WebKit 은 기본 설정에서
       링크를 Tab 순서에 넣지 않아, "끝에서만 감싸기"로는 포커스가 패널
       밖(문서)으로 샜다(2026-09-19 실측). */
    event.preventDefault();

    const at = focusable.indexOf(doc.activeElement);

    let next;

    if (at === -1) {
      next = event.shiftKey ? focusable[focusable.length - 1] : focusable[0];
    } else {
      next = focusable[(at + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
    }

    next.focus({ preventScroll: true });

  }


  /* 뒤로가기는 가로채지 않는다 — 다른 화면으로 가면 조용히 닫힐 뿐이다 */
  function onPopState() {

    if (state.active) {
      close({ restoreFocus: false });
    }

  }


  function focusInto(area) {

    const focusable = listSkinSidesFocusable(area);

    const target = focusable[0] || area;

    if (target === area && !area.hasAttribute("tabindex")) {
      area.setAttribute("tabindex", "-1");
    }

    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      target.focus();
    }

  }


  function open(side, openOptions) {

    const o = openOptions || {};

    if (state.destroyed || state.layout !== "drawer" || !usable(side)) {
      return false;
    }

    if (state.active === side && state.phase === "open") {
      return true;
    }

    if (state.active) {
      finishClose({ restoreFocus: false, silent: true });
    }

    clearCloseWait();

    state.active = side;
    state.phase = "open";
    state.opener = o.opener || null;

    if (!state.release) {
      state.release = lockSkinSidesScroll(frame);
    }

    if (o.instant) {
      frame.setAttribute(SKIN_SIDES_RUNTIME_INSTANT, "");
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => frame.removeAttribute(SKIN_SIDES_RUNTIME_INSTANT));
      });
    }

    paint();

    doc.addEventListener("keydown", onDocumentKeydown, true);
    win.addEventListener("popstate", onPopState);

    if (o.focus !== false) {
      focusInto(areas[side]);
    }

    emit(true);

    return true;

  }


  /* 닫힘을 확정한다(움직임이 끝났거나 기다리지 않는다) */
  function finishClose(finishOptions) {

    const o = finishOptions || {};

    clearCloseWait();

    const side = state.active;

    if (!side) {
      return;
    }

    const opener = state.opener;

    state.active = null;
    state.phase = null;
    state.opener = null;

    doc.removeEventListener("keydown", onDocumentKeydown, true);
    win.removeEventListener("popstate", onPopState);

    if (state.release) {
      state.release();
      state.release = null;
    }

    paint();

    if (o.restoreFocus && opener && opener.isConnected && !opener.closest("[inert]")) {
      try {
        opener.focus({ preventScroll: true });
      } catch (err) {
        opener.focus();
      }
    }

    if (!o.silent) {
      emit(false);
    }

  }


  function close(closeOptions) {

    const o = closeOptions || {};

    if (!state.active || state.phase === "closing") {
      if (state.active && o.instant) {
        finishClose({ restoreFocus: o.restoreFocus, silent: false });
      }
      return;
    }

    const side = state.active;

    const area = areas[side];

    const reduced =
      typeof win.matchMedia === "function" &&
      win.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (o.instant || reduced || state.layout !== "drawer") {
      finishClose({ restoreFocus: o.restoreFocus, silent: false });
      return;
    }

    /* 포커스는 지금 돌려준다 — 닫히는 패널 안에 남아 있으면 안 된다.
       잠금은 움직임이 끝난 뒤 푼다(닫히는 동안 뒤가 튀지 않게). */
    const opener = state.opener;

    state.phase = "closing";

    paint();

    if (o.restoreFocus && opener && opener.isConnected) {
      try {
        opener.focus({ preventScroll: true });
      } catch (err) {
        opener.focus();
      }
    } else if (area.contains(doc.activeElement)) {
      doc.activeElement.blur();
    }

    state.opener = null;

    const wait = readSkinSidesMotionMs(area, win);

    const done = (event) => {
      if (event && event.target !== area) {
        return;
      }
      if (state.active === side && state.phase === "closing") {
        finishClose({ restoreFocus: false, silent: false });
      }
    };

    state.closeDone = done;

    if (wait > 0) {
      area.addEventListener("transitionend", done);
      area.addEventListener("animationend", done);
      state.closeTimer = win.setTimeout(done, Math.min(wait + 80, SKIN_SIDES_CLOSE_WAIT_MAX_MS));
    } else {
      done();
    }

  }


  /* --- 입력 -------------------------------------------------- */

  function onFrameClick(event) {

    const target = event.target;

    if (!target || typeof target.closest !== "function") {
      return;
    }

    const trigger = target.closest(`[${SKIN_SIDES_OPEN_ATTR}]`);

    if (trigger && belongsToSkinSidesFrame(trigger, frame)) {

      const side = trigger.getAttribute(SKIN_SIDES_OPEN_ATTR);

      if (trigger.tagName.toLowerCase() === "a") {
        event.preventDefault();
      }

      if (state.active === side && state.phase === "open") {
        close({ restoreFocus: true });
      } else {
        open(side, { opener: trigger });
      }

      return;

    }

    const closer = target.closest(`[${SKIN_SIDES_CLOSE_ATTR}]`);

    if (closer && belongsToSkinSidesFrame(closer, frame)) {

      if (closer.tagName.toLowerCase() === "a") {
        event.preventDefault();
      }

      close({ restoreFocus: true });

      return;

    }

    if (target === backdrop) {
      close({ restoreFocus: true });
      return;
    }

    /* 패널 안의 링크 — 이동은 그대로 두고 패널만 닫는다 */
    if (state.active && state.phase === "open") {

      const link = target.closest("a[href]");

      if (link && areas[state.active].contains(link)) {
        close({ restoreFocus: false, instant: true });
      }

    }

  }


  function onTriggerKeydown(event) {

    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
      return;
    }

    const trigger =
      event.target.closest &&
      event.target.closest(`[${SKIN_SIDES_OPEN_ATTR}][role="button"], [${SKIN_SIDES_CLOSE_ATTR}][role="button"]`);

    if (!trigger || !belongsToSkinSidesFrame(trigger, frame)) {
      return;
    }

    event.preventDefault();

    trigger.click();

  }


  frame.addEventListener("click", onFrameClick);
  frame.addEventListener("keydown", onTriggerKeydown);


  /* --- 시작 -------------------------------------------------- */

  applyLayout(decideLayout());

  /* 틀이 아니라 **높이 0 인 폭 감지 요소**를 본다. 칼럼 ↔ 패널을
     바꾸면 틀의 높이가 같은 순간 바뀌는데, 틀을 보고 있으면 그 변화가
     같은 바퀴의 새 알림이 되어 "ResizeObserver loop" 경고가 난다
     (2026-09-19 WebKit 실측). 판정에 필요한 것은 폭뿐이다. */
  if (typeof win.ResizeObserver === "function") {
    state.observer = new win.ResizeObserver(onResize);
    state.observer.observe(ensureProbes().width);
  } else {
    win.addEventListener("resize", onResize);
  }

  if (opts.restoreOpen && enabled[opts.restoreOpen] && state.layout === "drawer") {
    open(opts.restoreOpen, { instant: true, focus: false });
  }


  return {

    frame,

    get layout() { return state.layout; },

    get openSide() { return state.active && state.phase === "open" ? state.active : null; },

    enabled: { ...enabled },

    count,

    open(side) {
      return open(side, { opener: triggers.find((t) => t.getAttribute(SKIN_SIDES_OPEN_ATTR) === side) || null });
    },

    close(closeOptions) {
      close({ restoreFocus: true, ...(closeOptions || {}) });
    },

    remeasure: measure,

    destroy() {

      if (state.destroyed) {
        return;
      }

      finishClose({ restoreFocus: false, silent: false });

      state.destroyed = true;

      if (state.observer) {
        state.observer.disconnect();
      } else {
        win.removeEventListener("resize", onResize);
      }

      if (measureFrame) {
        win.cancelAnimationFrame(measureFrame);
        measureFrame = 0;
      }

      frame.removeEventListener("click", onFrameClick);
      frame.removeEventListener("keydown", onTriggerKeydown);

    }

  };

}


/* 요소의 전환/애니메이션 중 가장 긴 것(ms) */
function readSkinSidesMotionMs(el, win) {

  const cs = win.getComputedStyle(el);

  const toMs = (text) =>
    String(text || "0s").split(",").map((part) => {
      const value = parseFloat(part);
      if (!Number.isFinite(value)) {
        return 0;
      }
      return /ms\s*$/.test(part) ? value : value * 1000;
    });

  const longest = (durations, delays) => {
    let best = 0;
    durations.forEach((duration, index) => {
      const delay = delays[index % delays.length] || 0;
      best = Math.max(best, duration + delay);
    });
    return best;
  };

  return Math.max(
    longest(toMs(cs.transitionDuration), toMs(cs.transitionDelay)),
    cs.animationName && cs.animationName !== "none"
      ? longest(toMs(cs.animationDuration), toMs(cs.animationDelay))
      : 0
  );

}


/* =========================================================
   6. 렌더러가 부르는 두 함수

   renderSkin() 은 다시 그릴 때마다 container 를 비우고 새로 채운다
   (Studio Preview 는 글자 하나마다). 그때 옛 틀의 잠금을 반드시
   풀어야 한다 — 안 풀면 새 화면이 스크롤되지 않는다. 그래서 그리기
   **전에** disposeSkinSides(container) 가 옛 컨트롤러를 내리고,
   열려 있던 쪽을 돌려준다. 그리기 **뒤에** compileSkinSides 가
   그 쪽을 움직임 없이 · 포커스를 옮기지 않고 다시 연다 — Studio
   에서 패널 안을 고치는 동안 패널이 계속 닫히지 않게.
========================================================== */

function disposeSkinSides(container) {

  const list = container && container[SKIN_SIDES_CONTROLLERS_KEY];

  if (!Array.isArray(list) || !list.length) {
    return null;
  }

  let openSide = null;

  list.forEach((controller) => {
    if (!openSide && controller.openSide) {
      openSide = controller.openSide;
    }
    controller.destroy();
  });

  container[SKIN_SIDES_CONTROLLERS_KEY] = [];

  return openSide;

}


/*
  compileSkinSides(root, setting, { container, restoreOpen })

  틀이 없는 스킨에서는 아무것도 하지 않는다 — 속성도 요소도 리스너도
  생기지 않는다(기존 스킨 회귀 0).
*/
function compileSkinSides(root, setting, options) {

  if (!root || typeof root.querySelectorAll !== "function") {
    return [];
  }

  const frames = Array.from(root.querySelectorAll(`[${SKIN_SIDES_ATTR}="frame"]`));

  if (!frames.length) {
    return [];
  }

  const opts = options || {};

  const normalized = coerceSkinSidesRenderSetting(setting);

  const controllers = frames.map((frame, index) =>
    createSkinSidesController(frame, normalized, {
      restoreOpen: index === 0 ? opts.restoreOpen : null
    })
  );

  const container = opts.container;

  if (container) {
    container[SKIN_SIDES_CONTROLLERS_KEY] =
      (container[SKIN_SIDES_CONTROLLERS_KEY] || []).concat(controllers);
  }

  return controllers;

}


/* sandbox 프레임 — 부모가 알려 준 "지금 보이는 부분"(프레임 좌표) */
function setSkinSidesViewport(doc, viewport) {

  const el = doc && doc.documentElement;

  if (!el) {
    return;
  }

  if (!viewport) {
    el.style.removeProperty("--imory-sides-viewport-top");
    el.style.removeProperty("--imory-sides-viewport-height");
    return;
  }

  el.style.setProperty("--imory-sides-viewport-top", `${Math.max(0, Math.round(viewport.top))}px`);
  el.style.setProperty("--imory-sides-viewport-height", `${Math.max(0, Math.round(viewport.height))}px`);

}


/* 문서 안의 열린 패널을 전부 닫는다(sandbox 부모의 바깥 클릭) */
function closeAllSkinSides(doc) {

  const target = doc || (typeof document !== "undefined" ? document : null);

  if (!target) {
    return;
  }

  Array.from(target.querySelectorAll(`[${SKIN_SIDES_ATTR}="frame"][${SKIN_SIDES_RUNTIME_ACTIVE}]`)).forEach((frame) => {
    const host = frame.closest(".imory-skin-root");
    const container = host && host.parentNode;
    const list = container && container[SKIN_SIDES_CONTROLLERS_KEY];
    (Array.isArray(list) ? list : []).forEach((controller) => {
      if (controller.frame === frame) {
        controller.close({ restoreFocus: false });
      }
    });
  });

}


if (typeof window !== "undefined") {

  window.SKIN_SIDES_REGION_NAMES = SKIN_SIDES_REGION_NAMES;
  window.readSkinSidesSetting = readSkinSidesSetting;
  window.resolveSkinSidesSetting = resolveSkinSidesSetting;
  window.writeSkinSidesSetting = writeSkinSidesSetting;
  window.readSkinSidesMobileSetting = readSkinSidesMobileSetting;
  window.writeSkinSidesMobileSetting = writeSkinSidesMobileSetting;
  window.skinSidesCount = skinSidesCount;
  window.skinSidesSettingForCount = skinSidesSettingForCount;
  window.buildSkinSidesRenderSetting = buildSkinSidesRenderSetting;
  window.coerceSkinSidesRenderSetting = coerceSkinSidesRenderSetting;
  window.isSkinSidesAttributeName = isSkinSidesAttributeName;
  window.sanitizeSkinSidesAttributeValue = sanitizeSkinSidesAttributeValue;
  window.skinHtmlHasSidesFrame = skinHtmlHasSidesFrame;
  window.lockSkinSidesScroll = lockSkinSidesScroll;
  window.compileSkinSides = compileSkinSides;
  window.disposeSkinSides = disposeSkinSides;
  window.setSkinSidesViewport = setSkinSidesViewport;
  window.closeAllSkinSides = closeAllSkinSides;

}

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SKIN_SIDES_ATTR,
    SKIN_SIDES_AREA_ATTR,
    SKIN_SIDES_OPEN_ATTR,
    SKIN_SIDES_CLOSE_ATTR,
    SKIN_SIDES_ATTRIBUTE_RULES,
    SKIN_SIDES_REGION_NAMES,
    SKIN_SIDES_RUNTIME_LAYOUT,
    SKIN_SIDES_RUNTIME_ON,
    SKIN_SIDES_RUNTIME_COUNT,
    SKIN_SIDES_RUNTIME_ACTIVE,
    SKIN_SIDES_RUNTIME_PHASE,
    SKIN_SIDES_RUNTIME_STATE,
    SKIN_SIDES_RUNTIME_INSTANT,
    SKIN_SIDES_BACKDROP_ATTR,
    SKIN_SIDES_PROBE_ATTR,
    SKIN_SIDES_FALLBACK_ATTR,
    readSkinSidesSetting,
    resolveSkinSidesSetting,
    writeSkinSidesSetting,
    readSkinSidesMobileSetting,
    writeSkinSidesMobileSetting,
    skinSidesCount,
    skinSidesSettingForCount,
    buildSkinSidesRenderSetting,
    coerceSkinSidesRenderSetting,
    isSkinSidesAttributeName,
    sanitizeSkinSidesAttributeValue,
    skinHtmlHasSidesFrame,
    readSkinSidesMotionMs
  };

}
