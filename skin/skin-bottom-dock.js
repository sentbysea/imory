/* =========================================================
   SKIN BOTTOM DOCK — 설정 정규화 · Context 조립 (순수 함수)

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md

   Bottom Dock 은 Imory 의 기본 navigation primitive 하나다 —
   화면 아래쪽에서 주요 기능에 닿는 자리. 다만 **모양을 규격화하지
   않는다**: pill 도 iOS Dock 도 강제하지 않고, 아이콘 크기도 배경도
   스킨이 정한다. 이 파일이 정하는 것은 딱 두 가지다.

     1) 저장되는 설정의 **모양**(SkinPackage.bottomDock)
     2) 템플릿이 받는 **재료**(Context 의 `dock` namespace)

   그 사이의 그림은 전부 스킨의 몫이다(templates.dock + css).

   ── 왜 설정과 템플릿을 갈랐나 ───────────────────────────
   "어떤 항목이 몇 개 있고 무엇을 하는가"는 블로그 주인의 데이터고,
   "그것을 어떻게 그리는가"는 스킨의 디자인이다. 둘을 한 덩어리
   HTML 로 두면 스킨을 바꾸는 순간 사용자가 고른 항목이 사라지고,
   항목을 하나 더하려면 HTML 을 고쳐야 한다. 그래서 항목은 설정에,
   그림은 templates.dock 에 둔다 — navigation.categories 를 스킨이
   반복해 그리는 것과 정확히 같은 결이다.

   ── 이 파일이 하지 않는 것 ──────────────────────────────
   DOM 을 만들지 않는다. 자리(fixed/sticky/static)·접기·전환·
   클릭 처리는 전부 skin/skin-bottom-dock-mount.js 의 몫이다.
   여기는 순수 함수만 있어서 브라우저 없이도 테스트된다
   (skin/skin-bottom-dock-test.mjs).

   ── 의존 ────────────────────────────────────────────────
   classic script. 순수 함수지만 두 개의 전역을 **함수 안에서만**
   읽는다: buildSitePath(core/lib/site-path.js) — `path:` 타깃의
   주소를 만들 때만. 없으면 그 항목만 조용히 빠진다.
========================================================== */


/* =========================================================
   값 목록 — Import 검증과 Studio 폼과 AI 프롬프트가 같은 목록을
   봐야 한다. 이 파일 하나가 그 출처다.
========================================================== */

/*
  position — "auto" 는 렌더 시점에 실측으로 정해진다
  (skin-bottom-dock-mount.js resolveAutoDockPosition). "static" 은
  설정 이름이 "content flow" 로 보이지만 저장값은 CSS 와 같은 낱말을
  쓴다.
*/
const SKIN_DOCK_POSITIONS =
  ["auto", "fixed", "sticky", "static"];

const SKIN_DOCK_DEFAULT_POSITION =
  "auto";


/*
  transition — 공용 interaction primitive 여섯. 스킨마다 새 JS
  애니메이션을 쓰지 않게 하려고 목록을 여기서 닫는다(요구사항 11절).
  실제 keyframe/duration 은 skin/skin-bottom-dock.css 한 곳에 있고,
  prefers-reduced-motion 도 그 파일이 존중한다.
*/
const SKIN_DOCK_TRANSITIONS =
  ["none", "fade", "slide", "scale", "fade-slide", "fade-scale"];

const SKIN_DOCK_DEFAULT_TRANSITION =
  "fade";


/*
  TRANSITION-1 — transition 은 이제 공용 전환 primitive 의 설정
  객체다(IMORY_TRANSITION_PRIMITIVE_DESIGN.md):

    { type, duration, easing, direction }

  옛 모양(문자열 "fade")도 그대로 받는다 — 그 type 에 나머지 칸을
  기본값으로 채운 객체가 된다. 정규화 결과는 **언제나 객체**다.

  값 판정은 skin/skin-transition.js 한 곳에만 있다. 그 파일이 없는
  문서(축소 구성)에서는 옛 규칙 — type 문자열만 — 으로 받는다.
*/
function normalizeSkinDockTransition(value) {

  const input =
    value === undefined || value === null
      ? SKIN_DOCK_DEFAULT_TRANSITION
      : value;

  if (typeof validateSkinTransitionInput === "function") {

    const result =
      validateSkinTransitionInput(input, "bottomDock.transition");

    return result.ok
      ? { ok: true, transition: result.transition }
      : result;

  }

  const type =
    typeof input === "string"
      ? input.trim()
      : (isSkinDockPlainObject(input) ? skinDockTrimmedString(input.type) : "");

  if (SKIN_DOCK_TRANSITIONS.indexOf(type) === -1) {
    return {
      ok: false,
      message: `bottomDock.transition은 ${SKIN_DOCK_TRANSITIONS.join(" / ")} 중 하나여야 합니다.`
    };
  }

  return {
    ok: true,
    transition: { type, duration: 200, easing: "ease", direction: "up" }
  };

}


const SKIN_DOCK_STATES =
  ["expanded", "collapsed"];

const SKIN_DOCK_DEFAULT_STATE =
  "expanded";


/*
  visual.type — 항목/트리거가 무엇으로 그려지는가.

    icon   value = 종류 토큰. data-kind 로 나가고 그림은 스킨 CSS 가
           그린다(카테고리 아이콘과 같은 방식). 토큰 목록을 닫지
           않는다 — 스킨이 자기 낱말을 쓸 수 있어야 한다.
    emoji  value = 이모지 한두 글자. 그대로 글자로 나간다.
    text   value = 짧은 글자(TEXT-only dock).
    image  value = https 이미지 주소.
    asset  value = 스킨 이미지 슬롯 이름 → context.images[<이름>].
    svg    value = https .svg 주소. **인라인 SVG 마크업은 아니다** —
           sanitizer 가 <svg> 를 통째로 지우므로(skin/skin-sanitize.js)
           이 계약에서 SVG 는 "주소로 불러오는 그림"이다.
           (남은 차이: IMORY_BOTTOM_DOCK_DESIGN.md §12)
*/
const SKIN_DOCK_VISUAL_TYPES =
  ["icon", "emoji", "text", "image", "asset", "svg"];


const SKIN_DOCK_ACTION_TYPES =
  ["navigate", "open", "action"];


/*
  audience — 방문자와 주인장의 dock 구성이 달라질 수 있어야 한다
  (요구사항 4절). 주인장 전용 항목은 방문자에게 **재료 자체가 가지
  않는다**(숨기는 게 아니라 Context 에서 빠진다).
*/
const SKIN_DOCK_AUDIENCES =
  ["all", "owner", "visitor"];


/* 상한 — 개수를 강제하지는 않지만(요구사항 14절) 무한은 아니다 */
const SKIN_DOCK_MAX_ITEMS = 12;
const SKIN_DOCK_MAX_LABEL_CHARS = 24;
const SKIN_DOCK_MAX_TEXT_CHARS = 24;
const SKIN_DOCK_MAX_EMOJI_CHARS = 8;

const SKIN_DOCK_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

/* data-kind 로 나갈 값 — skin-render.js 의 SKIN_KIND_TOKEN_PATTERN 과
   같은 형태여야 한다(그쪽이 형태가 틀린 값을 버린다). */
const SKIN_DOCK_KIND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/* open 타깃의 패널 이름 — 렌더 시점에 dock 루트의
   data-imory-dock-open 값으로 나가므로 CSS attribute selector 에
   그대로 꽂힌다. 따옴표·공백이 원천적으로 못 들어가는 형태만 받는다. */
const SKIN_DOCK_PANEL_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;


/*
  navigate 의 고정 타깃. `category:<id>` / `path:/...` 는 접두사
  형태라 이 목록에 없다.
*/
const SKIN_DOCK_NAVIGATE_TARGETS =
  ["home", "highlights", "gallery", "banner"];


/*
  action 의 타깃.

    write  주인장의 글쓰기(viewer.writeHref)
    admin  관리 화면(viewer.adminHref)
    manage 지금 화면의 관리(viewer.manageHref — 없는 화면에서는 빠진다)
    share  이 페이지 주소 공유(navigator.share → 실패 시 클립보드)
    theme  Imory 시스템 테마 토글(#startThemeToggle)
    top    표시 공간 맨 위로

  search 는 아직 제품에 없다 — 받지 않는다(§12 남은 차이).
*/
const SKIN_DOCK_ACTION_TARGETS =
  ["write", "admin", "manage", "share", "theme", "top"];


/* =========================================================
   작은 도우미
========================================================== */

function isSkinDockPlainObject(value) {

  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


function skinDockTrimmedString(value, max) {

  if (typeof value !== "string") {
    return "";
  }

  const trimmed =
    value.trim();

  return typeof max === "number"
    ? trimmed.slice(0, max)
    : trimmed;

}


/*
  https 주소만 받는다 — skin/skin-sanitize.js 의 isSafeSkinUrl 과
  같은 판정이다. 그 함수가 있으면 그걸 쓰고(단일 출처), 없는
  환경(브라우저 없는 단위 테스트)에서는 같은 규칙의 최소 판정을
  쓴다.
*/
function isSkinDockSafeImageUrl(value) {

  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  if (typeof isSafeSkinUrl === "function") {
    return isSafeSkinUrl(value);
  }

  return /^https:\/\/[^\s"'<>]+$/i.test(value.trim());

}


/* =========================================================
   normalizeSkinDockVisual(value) -> { ok, visual } | { ok:false, message }
========================================================== */

function normalizeSkinDockVisual(value, where) {

  if (!isSkinDockPlainObject(value)) {
    return { ok: false, message: `${where}.visual은 객체여야 합니다.` };
  }


  const type =
    skinDockTrimmedString(value.type);

  if (SKIN_DOCK_VISUAL_TYPES.indexOf(type) === -1) {
    return {
      ok: false,
      message:
        `${where}.visual.type은 ${SKIN_DOCK_VISUAL_TYPES.join(" / ")} 중 하나여야 합니다.`
    };
  }


  if (type === "icon") {

    const token =
      skinDockTrimmedString(value.value).toLowerCase();

    if (!SKIN_DOCK_KIND_PATTERN.test(token)) {
      return {
        ok: false,
        message: `${where}.visual.value(아이콘 종류)는 영문 소문자로 시작하는 32자 이하 토큰이어야 합니다.`
      };
    }

    return { ok: true, visual: { type, value: token } };

  }


  if (type === "emoji" || type === "text") {

    const max =
      type === "emoji"
        ? SKIN_DOCK_MAX_EMOJI_CHARS
        : SKIN_DOCK_MAX_TEXT_CHARS;

    const text =
      skinDockTrimmedString(value.value, max);

    if (!text) {
      return { ok: false, message: `${where}.visual.value에 표시할 글자가 필요합니다.` };
    }

    return { ok: true, visual: { type, value: text } };

  }


  if (type === "asset") {

    const slot =
      skinDockTrimmedString(value.value, 64);

    if (!slot) {
      return { ok: false, message: `${where}.visual.value에 이미지 슬롯 이름이 필요합니다.` };
    }

    return { ok: true, visual: { type, value: slot } };

  }


  /* image / svg — https 주소 하나 */

  const url =
    skinDockTrimmedString(value.value, 2048);

  if (!isSkinDockSafeImageUrl(url)) {
    return {
      ok: false,
      message: `${where}.visual.value는 https:// 로 시작하는 이미지 주소여야 합니다.`
    };
  }

  return { ok: true, visual: { type, value: url } };

}


/* =========================================================
   normalizeSkinDockAction(value) -> { ok, action } | { ok:false, message }
========================================================== */

function normalizeSkinDockAction(value, where) {

  if (!isSkinDockPlainObject(value)) {
    return { ok: false, message: `${where}.action은 객체여야 합니다.` };
  }


  const type =
    skinDockTrimmedString(value.type);

  if (SKIN_DOCK_ACTION_TYPES.indexOf(type) === -1) {
    return {
      ok: false,
      message: `${where}.action.type은 ${SKIN_DOCK_ACTION_TYPES.join(" / ")} 중 하나여야 합니다.`
    };
  }


  const target =
    skinDockTrimmedString(value.target, 512);

  if (!target) {
    return { ok: false, message: `${where}.action.target이 필요합니다.` };
  }


  if (type === "navigate") {

    if (SKIN_DOCK_NAVIGATE_TARGETS.indexOf(target) !== -1) {
      return { ok: true, action: { type, target } };
    }

    if (target.startsWith("category:")) {

      const id =
        target.slice("category:".length).trim();

      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        return { ok: false, message: `${where}.action.target의 카테고리 식별자 형태가 올바르지 않습니다.` };
      }

      return { ok: true, action: { type, target: `category:${id}` } };

    }

    if (target.startsWith("path:")) {

      /*
        블로그 안의 경로 하나. 앞의 "/" 를 강제하고 스킴·호스트가
        섞일 수 없게 한다 — 실제 주소는 렌더 시점에
        buildSitePath(slug, path) 로 만든다. 즉 이 값만으로는 다른
        블로그로도 다른 사이트로도 갈 수 없다.
      */

      const path =
        target.slice("path:".length).trim();

      if (!/^\/[A-Za-z0-9/_\-.?=&%]{0,255}$/.test(path) || path.indexOf("//") !== -1 || path.indexOf("..") !== -1) {
        return { ok: false, message: `${where}.action.target의 경로는 "/" 로 시작하는 이 블로그 안의 주소여야 합니다.` };
      }

      return { ok: true, action: { type, target: `path:${path}` } };

    }

    return {
      ok: false,
      message:
        `${where}.action.target은 ${SKIN_DOCK_NAVIGATE_TARGETS.join(" / ")} 또는 category:<id> / path:/<경로> 여야 합니다.`
    };

  }


  if (type === "open") {

    /*
      open 은 "이 dock 안의 패널 하나를 연다"이다. 플랫폼은 dock
      루트의 data-imory-dock-open 값만 바꾸고, 그 상태로 무엇을
      보여줄지는 스킨 CSS 가 정한다:

        [data-imory-dock-open="pair"] .my-pair-panel { display: block; }

      그래서 모달이든 떠 있는 창이든 카드든 스킨이 자유롭게 그린다 —
      플랫폼이 패널 모양을 하나로 정하지 않는다(요구사항 3절).
    */

    const panel =
      target.startsWith("panel:")
        ? target.slice("panel:".length).trim().toLowerCase()
        : target.trim().toLowerCase();

    if (!SKIN_DOCK_PANEL_PATTERN.test(panel)) {
      return { ok: false, message: `${where}.action.target은 panel:<이름> 형태여야 합니다(영문 소문자 32자 이하).` };
    }

    return { ok: true, action: { type, target: `panel:${panel}` } };

  }


  /* action */

  if (SKIN_DOCK_ACTION_TARGETS.indexOf(target) === -1) {
    return {
      ok: false,
      message: `${where}.action.target은 ${SKIN_DOCK_ACTION_TARGETS.join(" / ")} 중 하나여야 합니다.`
    };
  }

  return { ok: true, action: { type, target } };

}


/* =========================================================
   normalizeSkinBottomDock(value)
     -> { ok: true, dock }            (정규화된 새 객체)
      | { ok: true, dock: null }      (없음 — 필드 자체가 없는 경우)
      | { ok: false, message }

   **Import 가 쓰는 엄격한 문**이다. 모양이 틀리면 거부한다 —
   renderMode/js 와 같은 판단이다: "저장은 됐는데 화면에서 아무 일도
   안 일어나는" 상태를 파일만 보고 구분할 수 없게 두지 않는다.

   결과는 항상 알려진 키만 가진 **새 객체**다(원본을 스프레드하지
   않는다 — skin/skin-package-import.js 상단의 __proto__ 주석과 같은
   이유).
========================================================== */

function normalizeSkinBottomDock(value) {

  if (value === undefined || value === null) {
    return { ok: true, dock: null };
  }

  if (!isSkinDockPlainObject(value)) {
    return { ok: false, message: "bottomDock은 객체여야 합니다." };
  }


  const position =
    value.position === undefined || value.position === null
      ? SKIN_DOCK_DEFAULT_POSITION
      : skinDockTrimmedString(value.position);

  if (SKIN_DOCK_POSITIONS.indexOf(position) === -1) {
    return {
      ok: false,
      message: `bottomDock.position은 ${SKIN_DOCK_POSITIONS.join(" / ")} 중 하나여야 합니다.`
    };
  }


  const transitionResult =
    normalizeSkinDockTransition(value.transition);

  if (!transitionResult.ok) {
    return transitionResult;
  }

  const transition =
    transitionResult.transition;


  const defaultState =
    value.defaultState === undefined || value.defaultState === null
      ? SKIN_DOCK_DEFAULT_STATE
      : skinDockTrimmedString(value.defaultState);

  if (SKIN_DOCK_STATES.indexOf(defaultState) === -1) {
    return {
      ok: false,
      message: `bottomDock.defaultState는 ${SKIN_DOCK_STATES.join(" / ")} 중 하나여야 합니다.`
    };
  }


  const itemsInput =
    value.items === undefined || value.items === null
      ? []
      : value.items;

  if (!Array.isArray(itemsInput)) {
    return { ok: false, message: "bottomDock.items는 배열이어야 합니다." };
  }

  if (itemsInput.length > SKIN_DOCK_MAX_ITEMS) {
    return { ok: false, message: `bottomDock.items는 ${SKIN_DOCK_MAX_ITEMS}개를 넘을 수 없습니다.` };
  }


  const items =
    [];

  const seenIds =
    new Set();

  for (let index = 0; index < itemsInput.length; index += 1) {

    const raw =
      itemsInput[index];

    const where =
      `bottomDock.items[${index}]`;

    if (!isSkinDockPlainObject(raw)) {
      return { ok: false, message: `${where}는 객체여야 합니다.` };
    }

    const id =
      skinDockTrimmedString(raw.id, 32);

    if (!SKIN_DOCK_ID_PATTERN.test(id)) {
      return { ok: false, message: `${where}.id는 영문으로 시작하는 32자 이하 식별자여야 합니다.` };
    }

    if (seenIds.has(id)) {
      return { ok: false, message: `${where}.id "${id}"가 중복됩니다.` };
    }

    seenIds.add(id);


    const visualResult =
      normalizeSkinDockVisual(raw.visual, where);

    if (!visualResult.ok) {
      return visualResult;
    }

    const actionResult =
      normalizeSkinDockAction(raw.action, where);

    if (!actionResult.ok) {
      return actionResult;
    }


    const audience =
      raw.audience === undefined || raw.audience === null
        ? "all"
        : skinDockTrimmedString(raw.audience);

    if (SKIN_DOCK_AUDIENCES.indexOf(audience) === -1) {
      return {
        ok: false,
        message: `${where}.audience는 ${SKIN_DOCK_AUDIENCES.join(" / ")} 중 하나여야 합니다.`
      };
    }


    items.push({
      id,
      label: skinDockTrimmedString(raw.label, SKIN_DOCK_MAX_LABEL_CHARS),
      audience,
      visual: visualResult.visual,
      action: actionResult.action
    });

  }


  /* trigger — 없으면 기본 표식 하나를 쓴다(접힌 dock 을 다시 펼 수
     있는 자리는 반드시 남아야 한다, 요구사항 8/10절). */

  let trigger;

  if (value.trigger === undefined || value.trigger === null) {

    trigger = {
      type: "text",
      value: "⌄",
      label: ""
    };

  } else {

    const triggerResult =
      normalizeSkinDockVisual(value.trigger, "bottomDock.trigger");

    if (!triggerResult.ok) {
      return triggerResult;
    }

    trigger = {
      type: triggerResult.visual.type,
      value: triggerResult.visual.value,
      label: skinDockTrimmedString(value.trigger.label, SKIN_DOCK_MAX_LABEL_CHARS)
    };

  }


  return {
    ok: true,
    dock: {
      visible: value.visible !== false,
      position,
      collapsible: value.collapsible === true,
      defaultState,
      transition,
      trigger,
      items
    }
  };

}


/* =========================================================
   resolveSkinBottomDock(skinPackage) -> dock | null

   **렌더가 쓰는 관대한 문**이다. DB row 는 Studio UI 를 우회해
   들어왔을 수도 있으므로(skin/skin-render.js 상단의 신뢰 경계와
   같은 이유) 여기서 한 번 더 좁힌다 — 다만 거부가 아니라
   "이상하면 dock 없음"이다. 공개 화면이 dock 설정 하나 때문에
   깨지면 안 된다.
========================================================== */

function resolveSkinBottomDock(skinPackage) {

  if (!isSkinDockPlainObject(skinPackage)) {
    return null;
  }

  const result =
    normalizeSkinBottomDock(skinPackage.bottomDock);

  if (!result.ok || !result.dock) {
    return null;
  }

  if (!result.dock.visible) {
    return null;
  }

  return result.dock;

}


/* =========================================================
   항목 하나를 Context 재료로 — 주소 해석

   ★ 스킨은 주소를 만들지 않는다. navigation.* 과 같은 원칙이다
     (skin/skin-context.js) — 카테고리 id 도 쿼리 문법도 스킨이
     알 필요가 없다. 여기서 이미 만들어진 값만 나간다.

   ★ 주소를 만들 수 없는 항목은 **빠진다**. 예: 방문자에게
     write(작성 주소가 null), manageHref 가 없는 화면의 manage,
     갤러리 카테고리가 없는 블로그의 gallery. 빈 껍데기를 눌러도
     아무 일이 없는 자리를 남기지 않는다.
========================================================== */

function resolveSkinDockItemHref(action, context) {

  const navigation =
    (context && context.navigation) || {};

  const viewer =
    (context && context.viewer) || {};


  if (action.type === "navigate") {

    if (action.target === "home") {
      return navigation.home?.href || null;
    }

    if (action.target === "highlights") {
      return navigation.highlights?.href || null;
    }

    if (action.target === "gallery") {
      return navigation.galleryCategories?.[0]?.href || null;
    }

    if (action.target === "banner") {
      return navigation.bannerCategories?.[0]?.href || null;
    }

    if (action.target.startsWith("category:")) {

      const id =
        action.target.slice("category:".length);

      const found =
        (navigation.categories || []).find(
          (category) => String(category.id) === id
        );

      return found ? (found.href || null) : null;

    }

    if (action.target.startsWith("path:")) {

      const path =
        action.target.slice("path:".length);

      if (typeof buildSitePath !== "function") {
        return null;
      }

      const slug =
        context && context.site ? context.site.slug : "";

      return buildSitePath(slug, path);

    }

    return null;

  }


  if (action.type === "action") {

    if (action.target === "write") {
      return viewer.writeHref || null;
    }

    if (action.target === "admin") {
      return viewer.adminHref || null;
    }

    if (action.target === "manage") {
      return viewer.manageHref || null;
    }

    /* share / theme / top 은 주소가 없는 동작이다 */
    return null;

  }


  /* open — 주소 없음(패널 상태만 바꾼다) */
  return null;

}


/*
  주소가 없어도 되는 동작인가. 여기 해당하지 않으면서 주소도
  못 만든 항목은 Context 에서 빠진다.
*/
function skinDockActionNeedsNoHref(action) {

  if (action.type === "open") {
    return true;
  }

  return (
    action.type === "action" &&
    ["share", "theme", "top"].indexOf(action.target) !== -1
  );

}


function buildSkinDockVisualContext(visual, context) {

  const images =
    (context && context.images) || {};

  const isImageLike =
    visual.type === "image" ||
    visual.type === "svg" ||
    visual.type === "asset";

  const imageUrl =
    visual.type === "asset"
      ? (images[visual.value] || null)
      : (isImageLike ? visual.value : null);

  return {

    type: visual.type,

    /* data-imory-kind 로 내보낼 값 — icon 일 때만 있다 */
    iconKind:
      visual.type === "icon" ? visual.value : null,

    /* data-imory-bind 로 내보낼 글자 — emoji/text 일 때만 있다 */
    text:
      visual.type === "emoji" || visual.type === "text"
        ? visual.value
        : "",

    /* data-imory-src 로 내보낼 주소 */
    imageUrl,

    /*
      data-imory-if 는 비교를 못 한다 — 그래서 종류마다 boolean 을
      미리 발급한다(page.isHome 과 같은 판단).
    */
    isIcon: visual.type === "icon",
    isEmoji: visual.type === "emoji",
    isText: visual.type === "text",
    isImage: isImageLike && !!imageUrl,
    hasText: visual.type === "emoji" || visual.type === "text"

  };

}


/* =========================================================
   buildSkinDockContext(dock, context, options) -> dock namespace | null

   options.currentHref  지금 화면의 주소(item.isActive 판정용, 선택)

   ★ 주인장/방문자 구분은 **여기서** 끝난다. viewer.isOwner 를
     보고 audience 가 맞지 않는 항목을 아예 빼므로, 스킨이
     data-imory-if 를 빠뜨려도 방문자 화면에 주인장 항목이
     그려질 수 없다(viewer.writeHref 가 방문자에게 null 인 것과
     같은 결).
========================================================== */

function buildSkinDockContext(dock, context, options = {}) {

  if (!dock || !dock.visible) {
    return null;
  }


  const isOwner =
    !!(context && context.viewer && context.viewer.isOwner);


  const currentPath =
    typeof options.currentHref === "string"
      ? options.currentHref.split("?")[0].replace(/\/+$/, "")
      : null;


  const items =
    [];

  dock.items.forEach((item) => {

    if (item.audience === "owner" && !isOwner) {
      return;
    }

    if (item.audience === "visitor" && isOwner) {
      return;
    }


    const href =
      resolveSkinDockItemHref(item.action, context);

    if (!href && !skinDockActionNeedsNoHref(item.action)) {
      return;
    }


    const panelId =
      item.action.type === "open"
        ? item.action.target.slice("panel:".length)
        : null;


    items.push({

      id: item.id,

      label: item.label,
      hasLabel: !!item.label,

      /*
        접근성 이름 — 라벨이 없는 icon-only dock 에서도 읽히는
        이름이 있어야 한다. 라벨 > 글자 > id 순.
      */
      accessibleLabel:
        item.label ||
        (item.visual.type === "text" ? item.visual.value : "") ||
        item.id,

      visual:
        buildSkinDockVisualContext(item.visual, context),

      href:
        href || null,

      hasHref:
        !!href,

      actionType:
        item.action.type,

      actionTarget:
        item.action.target,

      isNavigate: item.action.type === "navigate",
      isOpen: item.action.type === "open",
      isAction: item.action.type === "action",

      panelId,

      isActive:
        !!(
          href &&
          currentPath !== null &&
          href.split("?")[0].replace(/\/+$/, "") === currentPath
        )

    });

  });


  return {

    hasDock:
      items.length > 0,

    visible:
      true,

    /* 저장된 값 그대로 — 실제로 적용된 자리는 mount 가 정한다 */
    position:
      dock.position,

    collapsible:
      dock.collapsible,

    defaultState:
      dock.defaultState,

    isCollapsedByDefault:
      dock.collapsible && dock.defaultState === "collapsed",

    /* 스킨이 [data-imory-if] 나 바인딩으로 읽는 것은 **종류 이름**
       이다(옛 계약 그대로). 속도·곡선·방향은 움직임의 몫이라
       플랫폼만 본다(skin-bottom-dock-mount.js). */
    transition:
      dock.transition && typeof dock.transition === "object"
        ? dock.transition.type
        : dock.transition,

    trigger: {
      ...buildSkinDockVisualContext(dock.trigger, context),
      label: dock.trigger.label,
      accessibleLabel: dock.trigger.label || "메뉴 열기"
    },

    items,

    hasItems:
      items.length > 0,

    itemCount:
      items.length

  };

}


/* =========================================================
   기본 dock template (templates.dock 이 없는 스킨용)

   갤러리/하이라이트 기본 template 과 같은 방식이다 — 완성된 그림
   하나가 아니라 **바인딩만 적힌 뼈대**다. 스킨 제작자는 이 구조를
   복사해 태그/순서/클래스를 바꾸면 되고, CSS 는 전부 자기 것을
   쓰면 된다.

   ★ 여기에는 pill 도 blur 도 고정 아이콘 크기도 없다(요구사항 1절
     금지 목록). 자리 계약(skin/skin-bottom-dock.css)만 최소로 얹고,
     생김새는 아래 css 처럼 아주 조용한 기본값 한 벌뿐이다.

   ★ <button> 이 아니라 <a>/<span role="button"> 이다 — sanitizer 가
     button/svg 를 통째로 지우기 때문이다(skin/skin-sanitize.js).
     키보드 조작(tabindex/Enter/Space)은 플랫폼이 렌더 뒤에 얹는다
     (skin-bottom-dock-mount.js).
========================================================== */

function getDefaultSkinDockTemplate() {

  return {

    html: `<div class="imory-dock">

      <span class="imory-dock-trigger" data-imory-dock="trigger"
        data-imory-if="dock.collapsible"
        data-imory-kind="dock.trigger.iconKind"
        data-imory-bind="dock.trigger.text"></span>

      <div class="imory-dock-items" data-imory-dock="items">

        <a class="imory-dock-item" data-imory-repeat="dock.items"
          data-imory-href="item.href">
          <span class="imory-dock-visual"
            data-imory-kind="item.visual.iconKind"
            data-imory-bind="item.visual.text"></span>
          <img class="imory-dock-image" data-imory-if="item.visual.isImage"
            data-imory-src="item.visual.imageUrl" alt="">
          <span class="imory-dock-label" data-imory-if="item.hasLabel"
            data-imory-bind="item.label"></span>
        </a>

      </div>

    </div>`,

    css: `.imory-dock { display: flex; align-items: center; justify-content: center; gap: 10px; }
      .imory-dock-items { display: flex; align-items: flex-end; justify-content: center; gap: 14px; flex-wrap: wrap; }
      .imory-dock-item { display: flex; flex-direction: column; align-items: center; gap: 4px;
        min-width: 44px; min-height: 44px; justify-content: center;
        text-decoration: none; color: inherit; font-size: 12px; letter-spacing: 0.04em; }
      .imory-dock-visual { font-size: 18px; line-height: 1; }
      .imory-dock-visual:empty { display: none; }
      .imory-dock-image { width: 22px; height: 22px; object-fit: contain; }
      .imory-dock-label { opacity: 0.7; }
      .imory-dock-trigger { min-width: 44px; min-height: 44px; display: flex; align-items: center;
        justify-content: center; cursor: pointer; font-size: 16px; }
      [hidden] { display: none !important; }`

  };

}


/* =========================================================
   resolveSkinDockTemplate(skinPackage) -> { html, css }

   우선순위:
     1. templates.dock        — 스킨이 그린 dock
     2. 플랫폼 기본 template  — 없으면 이것

   css 는 **스킨의 공용 css** 다(templates.dock.css 가 따로 있으면
   그것). dock 은 스킨과 같은 화면의 일부라 같은 변수·같은 글꼴을
   써야 한다 — 기본 template 을 쓸 때만 위의 조용한 기본 CSS 를
   뒤에 덧붙인다.
========================================================== */

function resolveSkinDockTemplate(skinPackage) {

  const explicit =
    isSkinDockPlainObject(skinPackage) &&
    isSkinDockPlainObject(skinPackage.templates)
      ? skinPackage.templates.dock
      : null;


  const sharedCss =
    isSkinDockPlainObject(skinPackage) && typeof skinPackage.css === "string"
      ? skinPackage.css
      : "";


  if (isSkinDockPlainObject(explicit) && typeof explicit.html === "string") {

    return {
      html: explicit.html,
      css:
        typeof explicit.css === "string"
          ? explicit.css
          : sharedCss
    };

  }


  const fallback =
    getDefaultSkinDockTemplate();

  return {
    html: fallback.html,
    css: `${sharedCss}\n${fallback.css}`
  };

}


/* =========================================================
   skinPackageHasOwnDockTemplate(skinPackage) -> boolean

   Studio 안내와 감사 경고가 "이 스킨이 dock 을 직접 그렸는가"를
   물을 때 쓴다.
========================================================== */

function skinPackageHasOwnDockTemplate(skinPackage) {

  return (
    isSkinDockPlainObject(skinPackage) &&
    isSkinDockPlainObject(skinPackage.templates) &&
    isSkinDockPlainObject(skinPackage.templates.dock) &&
    typeof skinPackage.templates.dock.html === "string"
  );

}


if (typeof window !== "undefined") {

  window.SKIN_DOCK_POSITIONS = SKIN_DOCK_POSITIONS;
  window.SKIN_DOCK_TRANSITIONS = SKIN_DOCK_TRANSITIONS;
  window.SKIN_DOCK_STATES = SKIN_DOCK_STATES;
  window.SKIN_DOCK_VISUAL_TYPES = SKIN_DOCK_VISUAL_TYPES;
  window.SKIN_DOCK_ACTION_TYPES = SKIN_DOCK_ACTION_TYPES;
  window.SKIN_DOCK_ACTION_TARGETS = SKIN_DOCK_ACTION_TARGETS;
  window.SKIN_DOCK_NAVIGATE_TARGETS = SKIN_DOCK_NAVIGATE_TARGETS;
  window.SKIN_DOCK_AUDIENCES = SKIN_DOCK_AUDIENCES;
  window.SKIN_DOCK_MAX_ITEMS = SKIN_DOCK_MAX_ITEMS;

  window.normalizeSkinBottomDock = normalizeSkinBottomDock;
  window.resolveSkinBottomDock = resolveSkinBottomDock;
  window.buildSkinDockContext = buildSkinDockContext;
  window.resolveSkinDockTemplate = resolveSkinDockTemplate;
  window.getDefaultSkinDockTemplate = getDefaultSkinDockTemplate;
  window.skinPackageHasOwnDockTemplate = skinPackageHasOwnDockTemplate;

}


/* 브라우저 없는 단위 테스트(node)에서도 같은 함수를 본다 —
   skin/skin-bottom-dock-test.mjs. classic script 로 로드될 때는
   module 이 없으므로 이 블록이 실행되지 않는다. */
if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SKIN_DOCK_POSITIONS,
    SKIN_DOCK_TRANSITIONS,
    SKIN_DOCK_STATES,
    SKIN_DOCK_VISUAL_TYPES,
    SKIN_DOCK_ACTION_TYPES,
    SKIN_DOCK_ACTION_TARGETS,
    SKIN_DOCK_NAVIGATE_TARGETS,
    SKIN_DOCK_AUDIENCES,
    SKIN_DOCK_MAX_ITEMS,
    normalizeSkinBottomDock,
    resolveSkinBottomDock,
    buildSkinDockContext,
    resolveSkinDockTemplate,
    getDefaultSkinDockTemplate,
    skinPackageHasOwnDockTemplate
  };

}
