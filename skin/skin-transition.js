/* =========================================================
   SKIN TRANSITION PRIMITIVE — 전환 계약 (순수 함수 + 컴파일러 + 런타임)

   기준 문서: IMORY_TRANSITION_PRIMITIVE_DESIGN.md

   이 파일이 정하는 것은 하나다 — **나타나고 사라질 때 어떻게
   움직이는가**. 무엇이 언제 나타나는가(dock 이 접히는가, 화면이
   바뀌는가, 패널이 열리는가)는 각 기능의 몫이고, 여기는 그
   순간의 움직임만 책임진다. 그래서 수명(lifecycle)을 하나로 합치지
   않는다 — Bottom Dock 은 자기 접기 상태 기계를, 화면 전환은 기존
   라우터를 그대로 쓰고, 둘 다 "움직임"만 이 파일에 묻는다.

   ── 계약 네 칸 ─────────────────────────────────────────
     type       none | fade | slide | scale | fade-slide | fade-scale
     duration   ms, 80~1000 으로 **자른다**(거부하지 않는다)
     easing     ease | ease-in | ease-out | ease-in-out | linear | smooth
     direction  up | down | left | right   ("나타날 때 움직이는 쪽")

   같은 모양이 두 자리에 산다.

     1) templates.*.html 의 속성 — LAYOUT-1 과 같은 "주석 층"이다.
          data-imory-transition="fade-slide"
          data-imory-transition-duration="240"
          data-imory-transition-easing="ease-out"
          data-imory-transition-direction="up"
     2) 설정 객체 — bottomDock.transition 처럼 HTML 이 아닌 곳.
          { type, duration, easing, direction }

   둘 다 이 파일의 normalize 하나를 지난다. 새 DOM 트리도, 새
   SkinPackage 최상위 필드도 없다.

   ── 무엇이 움직이나 ────────────────────────────────────
     appear  속성을 단 요소가 **화면에 들어올 때** 한 번 들어온다.
             페이지 전환은 이것이다 — 템플릿 맨 바깥 요소에 달면
             HOME/CATEGORY/POST 가 바뀔 때마다 새 화면이 들어온다.
             CSS 애니메이션이라 "요소가 박스를 얻는 순간" 시작된다
             (떨어진 스크래치에 먼저 그리고 나중에 붙이는 공개 화면
              경로에서도, #postArea 가 늦게 드러나는 경로에서도 맞는
              순간에 재생된다).
     show / hide  플랫폼이 요소를 보이거나 감출 때(패널 열기/닫기,
             dock 접기/펴기). Web Animations 하나를 앞뒤로 돌린다 —
             빠르게 반복해 눌러도 지금 자리에서 방향만 바뀌고, 마지막
             요청이 언제나 최종 상태가 된다.

   ── 왜 transform 이 아니라 translate / scale 속성인가 ──────
   요구사항은 "slide 는 transform 기반"이다. 개별 변환 속성
   translate/scale 은 transform 과 **같은 합성 단계**(레이아웃을
   다시 하지 않는다)이면서 transform 을 덮어쓰지 않는다. free 배치
   (LAYOUT-1)는 자리를 transform 으로 잡고, 스킨도 hover 에
   transform 을 쓴다 — transform 으로 전환하면 그 값이 전환 동안
   통째로 사라져 요소가 튄다.

   ── 이 파일이 하지 않는 것 ─────────────────────────────
   scroll/parallax/spring/keyframe 편집/shared element/particles —
   이번 라운드 제외(기준 문서 §10). 스킨 JS 를 새로 쓰게 하지
   않는다: 스킨은 속성만 적고, 움직임은 이 파일과
   skin/skin-transition.css 두 곳에만 있다.

   ── 왜 한 파일인가 ─────────────────────────────────────
   1000줄 기준을 넘지만 계약(1~6) · 런타임(7~8) · 컴파일(9)을 가르지
   않았다. 컴파일러가 패널을 닫고 토글을 런타임에 잇는 한 덩어리이고,
   이 파일은 sandbox origin 이 내보내는 목록
   (core/lib/skin-sandbox-server.js)과 다섯 진입 문서에 한 줄로
   실린다 — 둘로 나누면 한쪽만 실린 문서에서 "패널이 열린 채로 남는"
   조용한 고장이 생긴다. 절반 가까이가 주석이다.

   ── 의존 ───────────────────────────────────────────────
   없다(순수 함수 + 표준 DOM). classic script 로 로드되면 window 에,
   node 에서 require 되면 module.exports 에 같은 함수가 실린다 —
   skin/skin-layout.js 와 같은 방식이다.
========================================================== */


/* =========================================================
   1. 이름들
========================================================== */

const SKIN_TRANSITION_ATTR = "data-imory-transition";
const SKIN_TRANSITION_PARAM_PREFIX = "data-imory-transition-";

/* 런타임 상태 — 플랫폼만 찍는다. sanitizer 규칙표에 없으므로
   저장되는 HTML 에는 들어갈 수 없다(PARAM_PREFIX 로 시작하지만
   "state" 는 파라미터 표에 없어 조용히 버려진다).

     appear  들어오는 CSS 애니메이션을 재생할 자리
     showing / shown / hiding / hidden */
const SKIN_TRANSITION_STATE_ATTR = "data-imory-transition-state";

/* 가로로 미끄러지는 전환이 있는 스킨 루트에 찍는다 — 그 동안
   화면이 옆으로 밀리지 않게(skin/skin-transition.css). */
const SKIN_TRANSITION_CLIP_ATTR = "data-imory-transition-clip";

/* 일반 UI 의 열고 닫기(패널). 이름은 dock 의 panel:<이름> 과 같은
   모양이다 — 같은 패널을 dock 항목이 열 수도, 스킨 안의 버튼이 열
   수도 있다. */
const SKIN_PANEL_ATTR = "data-imory-panel";
const SKIN_TOGGLE_ATTR = "data-imory-toggle";
const SKIN_PANEL_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

const SKIN_TRANSITION_TYPES =
  ["none", "fade", "slide", "scale", "fade-slide", "fade-scale"];

const SKIN_TRANSITION_DIRECTIONS =
  ["up", "down", "left", "right"];

/* 이름 → 실제 timing function. 값이 CSS 로 그대로 가지 않는다 —
   이 표를 지나야만 문자열이 된다. "smooth" 는 끝이 길게 풀리는
   곡선이라 "더 부드럽게" 요청의 기본 답이다. */
const SKIN_TRANSITION_EASING_VALUES = {
  "ease": "ease",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
  "linear": "linear",
  "smooth": "cubic-bezier(0.22, 1, 0.36, 1)"
};

const SKIN_TRANSITION_EASINGS =
  Object.keys(SKIN_TRANSITION_EASING_VALUES);

/* 안전한 범위. 80ms 아래는 깜빡임이고 1초 위는 기다림이다.
   범위 밖은 **자른다** — "3초로" 같은 요청이 통째로 실패하지 않게. */
const SKIN_TRANSITION_DURATION_MIN = 80;
const SKIN_TRANSITION_DURATION_MAX = 1000;

const SKIN_TRANSITION_DEFAULTS = {
  type: "fade",
  duration: 200,
  easing: "ease",
  direction: "up"
};

/* 움직이는 거리. "살짝"이 계약이다 — 크게 날아 들어오는 전환은
   좁은 화면에서 가로 넘침을 만들고, 이번 라운드 범위 밖이다. */
const SKIN_TRANSITION_DISTANCE = 12;
const SKIN_TRANSITION_SCALE_FROM = 0.92;


/* =========================================================
   2. 값 규칙 — sanitizer · 컴파일러 · Studio 폼 · AI 가 같은 표를 본다
========================================================== */

const SKIN_TRANSITION_PARAM_RULES = {
  "duration": {
    kind: "int",
    min: SKIN_TRANSITION_DURATION_MIN,
    max: SKIN_TRANSITION_DURATION_MAX
  },
  "easing": { kind: "enum", values: SKIN_TRANSITION_EASINGS },
  "direction": { kind: "enum", values: SKIN_TRANSITION_DIRECTIONS }
};

/* 방향이 뜻을 갖는 종류. fade 는 제자리라 방향이 없다. */
const SKIN_TRANSITION_DIRECTIONAL_TYPES =
  ["slide", "scale", "fade-slide", "fade-scale"];

function isSkinTransitionType(value) {
  return SKIN_TRANSITION_TYPES.indexOf(value) !== -1;
}

function isSkinPanelName(value) {
  return typeof value === "string" && SKIN_PANEL_NAME_PATTERN.test(value);
}

function skinTransitionRuleFor(attrName) {

  if (typeof attrName !== "string") {
    return null;
  }

  const name = attrName.toLowerCase();

  if (name === SKIN_TRANSITION_ATTR) {
    return { kind: "enum", values: SKIN_TRANSITION_TYPES };
  }

  if (name === SKIN_PANEL_ATTR || name === SKIN_TOGGLE_ATTR) {
    return { kind: "name" };
  }

  if (name.indexOf(SKIN_TRANSITION_PARAM_PREFIX) === 0) {
    return SKIN_TRANSITION_PARAM_RULES[name.slice(SKIN_TRANSITION_PARAM_PREFIX.length)] || null;
  }

  return null;

}

function isSkinTransitionAttributeName(attrName) {
  return skinTransitionRuleFor(attrName) !== null;
}

function clampSkinTransitionDuration(value) {

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return SKIN_TRANSITION_DEFAULTS.duration;
  }

  return Math.round(
    Math.min(SKIN_TRANSITION_DURATION_MAX, Math.max(SKIN_TRANSITION_DURATION_MIN, parsed))
  );

}

/* 저장 경계의 관문. 쓸 수 있는 값이면 **저장할 문자열**을, 아니면
   null 을 돌려준다.

   LAYOUT-1 과 한 곳이 다르다: duration 은 범위 밖이어도 버리지 않고
   자른다(요구사항 "안전한 범위로 normalize/clamp"). 숫자 모양이
   아니면(단위·부호·소수·지수) 그때는 버린다 — 값이 CSS 로 가는
   길목이라 형태를 좁게 막는다. */
function sanitizeSkinTransitionAttributeValue(attrName, value) {

  const rule = skinTransitionRuleFor(attrName);

  if (!rule || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (rule.kind === "enum") {
    return rule.values.indexOf(trimmed) !== -1 ? trimmed : null;
  }

  if (rule.kind === "name") {
    return isSkinPanelName(trimmed) ? trimmed : null;
  }

  if (rule.kind === "int") {
    return /^\d{1,6}$/.test(trimmed)
      ? String(clampSkinTransitionDuration(trimmed))
      : null;
  }

  return null;

}

function isValidSkinTransitionAttributeValue(attrName, value) {
  return sanitizeSkinTransitionAttributeValue(attrName, value) === value;
}


/* =========================================================
   3. 정규화 — 선언 → 확정값

   normalizeSkinTransition(input, fallbackType)
     관대한 문. 문자열("fade")도 객체도 받고, 모르는 칸은 기본값으로
     채운다. 렌더가 쓴다 — 공개 화면이 설정 하나 때문에 깨지면 안 된다.

   validateSkinTransitionInput(input, where)
     엄격한 문. Import 가 쓴다 — 모르는 type/easing/direction 은
     거부하고, duration 만 자른다.

   결과는 언제나 알려진 네 키만 가진 **새 객체**다.
========================================================== */

function isSkinTransitionPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSkinTransition(input, fallbackType) {

  const base =
    isSkinTransitionPlainObject(input)
      ? input
      : { type: input };

  const fallback =
    isSkinTransitionType(fallbackType) ? fallbackType : SKIN_TRANSITION_DEFAULTS.type;

  const type =
    typeof base.type === "string" && isSkinTransitionType(base.type.trim())
      ? base.type.trim()
      : fallback;

  const easing =
    typeof base.easing === "string" && SKIN_TRANSITION_EASINGS.indexOf(base.easing.trim()) !== -1
      ? base.easing.trim()
      : SKIN_TRANSITION_DEFAULTS.easing;

  const direction =
    typeof base.direction === "string" && SKIN_TRANSITION_DIRECTIONS.indexOf(base.direction.trim()) !== -1
      ? base.direction.trim()
      : SKIN_TRANSITION_DEFAULTS.direction;

  const duration =
    base.duration === undefined || base.duration === null || base.duration === ""
      ? SKIN_TRANSITION_DEFAULTS.duration
      : clampSkinTransitionDuration(base.duration);

  return { type, duration, easing, direction };

}

function validateSkinTransitionInput(input, where) {

  const label = where || "transition";

  if (input === undefined || input === null) {
    return { ok: true, transition: normalizeSkinTransition(null) };
  }

  if (typeof input === "string") {

    const type = input.trim();

    if (!isSkinTransitionType(type)) {
      return {
        ok: false,
        message: `${label}은 ${SKIN_TRANSITION_TYPES.join(" / ")} 중 하나여야 합니다.`
      };
    }

    return { ok: true, transition: normalizeSkinTransition({ type }) };

  }

  if (!isSkinTransitionPlainObject(input)) {
    return { ok: false, message: `${label}은 문자열이나 객체여야 합니다.` };
  }

  if (input.type !== undefined && !(typeof input.type === "string" && isSkinTransitionType(input.type.trim()))) {
    return {
      ok: false,
      message: `${label}.type은 ${SKIN_TRANSITION_TYPES.join(" / ")} 중 하나여야 합니다.`
    };
  }

  if (input.easing !== undefined && !(typeof input.easing === "string" && SKIN_TRANSITION_EASINGS.indexOf(input.easing.trim()) !== -1)) {
    return {
      ok: false,
      message: `${label}.easing은 ${SKIN_TRANSITION_EASINGS.join(" / ")} 중 하나여야 합니다.`
    };
  }

  if (input.direction !== undefined && !(typeof input.direction === "string" && SKIN_TRANSITION_DIRECTIONS.indexOf(input.direction.trim()) !== -1)) {
    return {
      ok: false,
      message: `${label}.direction은 ${SKIN_TRANSITION_DIRECTIONS.join(" / ")} 중 하나여야 합니다.`
    };
  }

  if (input.duration !== undefined && !(typeof input.duration === "number" && Number.isFinite(input.duration))) {
    return { ok: false, message: `${label}.duration은 밀리초 숫자여야 합니다.` };
  }

  return { ok: true, transition: normalizeSkinTransition(input) };

}


/* =========================================================
   4. 읽기 — DOM 요소 하나의 전환 선언

   readSkinTransitionSpec(el) -> spec | null
     data-imory-transition 이 없으면 null. 파라미터만 있고 type 이
     없는 요소는 선언이 없는 것이다(감사가 그 조합을 짚는다).
========================================================== */

function readSkinTransitionSpec(el) {

  if (!el || typeof el.getAttribute !== "function") {
    return null;
  }

  const type = el.getAttribute(SKIN_TRANSITION_ATTR);

  if (!isSkinTransitionType(type)) {
    return null;
  }

  const read = (name) => {
    const raw = el.getAttribute(SKIN_TRANSITION_PARAM_PREFIX + name);
    return raw === null ? undefined : raw;
  };

  return normalizeSkinTransition({
    type,
    duration: read("duration"),
    easing: read("easing"),
    direction: read("direction")
  });

}

/* Studio 폼이 "사용자가 실제로 적은 것"과 "기본값이라 빈 것"을
   구분해야 해서 선언 그대로도 돌려준다. */
function readSkinTransitionDeclared(el) {

  const declared = {};

  if (!el || typeof el.getAttribute !== "function") {
    return declared;
  }

  const type = el.getAttribute(SKIN_TRANSITION_ATTR);

  if (isSkinTransitionType(type)) {
    declared.type = type;
  }

  Object.keys(SKIN_TRANSITION_PARAM_RULES).forEach((name) => {

    const raw = el.getAttribute(SKIN_TRANSITION_PARAM_PREFIX + name);

    if (raw !== null && sanitizeSkinTransitionAttributeValue(SKIN_TRANSITION_PARAM_PREFIX + name, raw) !== null) {
      declared[name] = raw;
    }

  });

  return declared;

}


/* =========================================================
   5. 자세(pose) — "보이지 않을 때"의 모습 하나

   전환은 언제나 **이 자세 ↔ 원래 모습**이다. 들어올 때는 자세에서
   원래로, 나갈 때는 원래에서 자세로. 원래 모습은 스킨 CSS 가
   정하므로 여기서 적지 않는다(opacity 0.8 인 카드는 0.8 로 돌아온다).

   direction 은 "나타날 때 움직이는 쪽"이다 — up 이면 아래에서
   올라온다(= 자세가 아래).
========================================================== */

function skinTransitionHasFade(type) {
  return type === "fade" || type === "fade-slide" || type === "fade-scale";
}

function skinTransitionHasSlide(type) {
  return type === "slide" || type === "fade-slide";
}

function skinTransitionHasScale(type) {
  return type === "scale" || type === "fade-scale";
}

function skinTransitionTranslateFor(direction) {

  const d = SKIN_TRANSITION_DISTANCE + "px";

  if (direction === "down") {
    return "0px -" + d;
  }

  if (direction === "left") {
    return d + " 0px";
  }

  if (direction === "right") {
    return "-" + d + " 0px";
  }

  return "0px " + d;

}

/* scale 은 "나타날 때 움직이는 쪽"의 반대편 가장자리에서 자란다 —
   up 이면 바닥에 붙은 채 위로 커진다(dock 이 원래 쓰던 모양). */
function skinTransitionOriginFor(direction) {

  if (direction === "down") {
    return "50% 0%";
  }

  if (direction === "left") {
    return "100% 50%";
  }

  if (direction === "right") {
    return "0% 50%";
  }

  return "50% 100%";

}

function buildSkinTransitionPose(spec) {

  if (!spec || spec.type === "none") {
    return null;
  }

  return {
    opacity: skinTransitionHasFade(spec.type) ? 0 : 1,
    translate: skinTransitionHasSlide(spec.type) ? skinTransitionTranslateFor(spec.direction) : "0px 0px",
    scale: skinTransitionHasScale(spec.type) ? SKIN_TRANSITION_SCALE_FROM : 1,
    origin: skinTransitionOriginFor(spec.direction)
  };

}

function skinTransitionEasingValue(easing) {
  return SKIN_TRANSITION_EASING_VALUES[easing] || SKIN_TRANSITION_EASING_VALUES.ease;
}

/* 가로로 움직이는가 — 그 동안의 가로 넘침을 막을 자리가 필요하다 */
function isSkinTransitionHorizontal(spec) {
  return !!spec &&
    skinTransitionHasSlide(spec.type) &&
    (spec.direction === "left" || spec.direction === "right");
}


/* =========================================================
   6. 컴파일 — CSS custom property (appear 애니메이션이 읽는다)

   이름은 전부 skin/skin-transition.css 가 읽는다. 단위 테스트가 두
   파일을 실제로 읽어 양방향으로 대조한다(LAYOUT-1 과 같은 장치).
========================================================== */

function buildSkinTransitionProperties(spec) {

  const pose = buildSkinTransitionPose(spec);

  if (!pose) {
    return {};
  }

  return {
    "--imory-tr-duration": spec.duration + "ms",
    "--imory-tr-easing": skinTransitionEasingValue(spec.easing),
    "--imory-tr-opacity": String(pose.opacity),
    "--imory-tr-translate": pose.translate,
    "--imory-tr-scale": String(pose.scale),
    "--imory-tr-origin": pose.origin
  };

}

/* Web Animations 용 키프레임. 바뀌는 속성만 적는다 — 적지 않은
   속성은 애니메이션이 아예 건드리지 않는다. 끝 키프레임은
   "원래 모습"(implicit) 이라 transform-origin 만 적어 둔다. */
function buildSkinTransitionKeyframes(spec) {

  const pose = buildSkinTransitionPose(spec);

  if (!pose) {
    return null;
  }

  const from = {};

  if (skinTransitionHasFade(spec.type)) {
    from.opacity = pose.opacity;
  }

  if (skinTransitionHasSlide(spec.type)) {
    from.translate = pose.translate;
  }

  if (skinTransitionHasScale(spec.type)) {
    from.scale = String(pose.scale);
    from.transformOrigin = pose.origin;
    return [from, { transformOrigin: pose.origin }];
  }

  return [from, {}];

}


/* =========================================================
   7. 런타임 — show / hide 상태 기계

   setSkinTransitionVisible(el, visible, { spec, animate })

   요소마다 Web Animation **하나**를 둔다. 보일 때는 앞으로, 감출
   때는 뒤로 돈다. 반대 요청이 중간에 오면 새로 만들지 않고 **지금
   자리에서** 방향만 바꾼다 — 그래서

     - 빠르게 여러 번 눌러도 튀지 않고,
     - 끝났을 때의 상태는 언제나 **마지막 요청**이다(finish 는 지금
       방향의 끝에서만 일어나고, 그 끝이 곧 마지막 요청의 상태다).

   finish 가 오지 않는 경우(요소가 문서에서 떨어졌다든가)를 위해
   타이머 하나를 더 건다. 둘 중 먼저 온 쪽만 확정하고, 이미 다른
   애니메이션으로 바뀌었으면 아무 일도 하지 않는다.

   감추는 동안 클릭을 가로채지 않는다: 감추기가 **시작되는 순간**
   inert + pointer-events:none(상태 hiding), 끝나면 hidden +
   display:none(상태 hidden).
========================================================== */

const skinTransitionRecords =
  typeof WeakMap === "function" ? new WeakMap() : null;

function skinTransitionPrefersReducedMotion(el) {

  try {

    const view = el && el.ownerDocument && el.ownerDocument.defaultView;

    return !!(
      view &&
      typeof view.matchMedia === "function" &&
      view.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

  } catch (err) {
    return false;
  }

}

function setSkinTransitionState(el, state) {
  el.setAttribute(SKIN_TRANSITION_STATE_ATTR, state);
}

function setSkinTransitionInert(el, inert) {

  if (inert) {
    el.setAttribute("inert", "");
  } else {
    el.removeAttribute("inert");
  }

}

function isSkinTransitionVisible(el) {

  if (!el) {
    return false;
  }

  const record = skinTransitionRecords && skinTransitionRecords.get(el);

  if (record) {
    return record.target;
  }

  const state = el.getAttribute(SKIN_TRANSITION_STATE_ATTR);

  return !el.hidden && state !== "hidden" && state !== "hiding";

}

function skinTransitionRecordFor(el) {

  let record = skinTransitionRecords.get(el);

  if (!record) {
    record = { target: isSkinTransitionVisible(el), anim: null, timer: 0 };
    skinTransitionRecords.set(el, record);
  }

  return record;

}

function finishSkinTransition(el, record, anim) {

  if (record.anim !== anim) {
    return;
  }

  const view = el.ownerDocument && el.ownerDocument.defaultView;

  if (record.timer && view) {
    view.clearTimeout(record.timer);
  }

  record.timer = 0;
  record.anim = null;

  try {
    anim.cancel();
  } catch (err) {
    /* 이미 끝났다 */
  }

  if (record.target) {
    setSkinTransitionState(el, "shown");
  } else {
    setSkinTransitionState(el, "hidden");
    el.hidden = true;
  }

}

function cancelSkinTransitionAnimation(el, record) {

  const view = el.ownerDocument && el.ownerDocument.defaultView;

  if (record.timer && view) {
    view.clearTimeout(record.timer);
  }

  record.timer = 0;

  if (record.anim) {

    const anim = record.anim;

    record.anim = null;

    try {
      anim.cancel();
    } catch (err) {
      /* 무시 */
    }

  }

}

function setSkinTransitionVisible(el, visible, options) {

  if (!el || typeof el.setAttribute !== "function" || !skinTransitionRecords) {
    return;
  }

  const opts = options || {};
  const target = !!visible;

  const spec =
    opts.spec
      ? normalizeSkinTransition(opts.spec)
      : (readSkinTransitionSpec(el) || normalizeSkinTransition("none"));

  const record = skinTransitionRecordFor(el);

  const wasTarget = record.target;
  const running = !!record.anim;

  record.target = target;

  const view = el.ownerDocument && el.ownerDocument.defaultView;

  const instant =
    opts.animate === false ||
    spec.type === "none" ||
    typeof el.animate !== "function" ||
    !view ||
    skinTransitionPrefersReducedMotion(el);


  if (target) {
    el.hidden = false;
    setSkinTransitionInert(el, false);
  } else {
    setSkinTransitionInert(el, true);
  }


  if (instant) {

    cancelSkinTransitionAnimation(el, record);

    setSkinTransitionState(el, target ? "shown" : "hidden");

    if (!target) {
      el.hidden = true;
    }

    return;

  }


  /* 이미 그 상태에 가 있고 움직이는 중도 아니면 할 일이 없다 —
     보이는 요소를 "다시 보이게" 하면서 자세로 한 번 튀지 않는다. */

  if (!running && wasTarget === target) {

    const state = el.getAttribute(SKIN_TRANSITION_STATE_ATTR);

    if (!target) {
      setSkinTransitionState(el, "hidden");
      el.hidden = true;
    } else if (state === "hidden" || state === "hiding" || state === "showing") {
      setSkinTransitionState(el, "shown");
    }

    return;

  }


  let anim = record.anim;

  if (!anim) {

    const keyframes = buildSkinTransitionKeyframes(spec);

    try {

      anim = el.animate(keyframes, {
        duration: spec.duration,
        easing: skinTransitionEasingValue(spec.easing),
        fill: "both"
      });

    } catch (err) {

      /* 키프레임을 모르는 오래된 엔진 — 움직임 없이 상태만 맞춘다 */

      setSkinTransitionState(el, target ? "shown" : "hidden");

      if (!target) {
        el.hidden = true;
      }

      return;

    }

    anim.pause();

    /* 감추기는 "원래 모습"(끝)에서 출발해 거꾸로 돈다 */
    anim.currentTime = target ? 0 : spec.duration;

    record.anim = anim;

    anim.onfinish = () => finishSkinTransition(el, record, anim);

  }


  setSkinTransitionState(el, target ? "showing" : "hiding");

  anim.playbackRate = target ? 1 : -1;
  anim.play();


  if (record.timer) {
    view.clearTimeout(record.timer);
  }

  record.timer = view.setTimeout(
    () => finishSkinTransition(el, record, anim),
    spec.duration + 120
  );

}

function showSkinTransition(el, options) {
  setSkinTransitionVisible(el, true, options);
}

function hideSkinTransition(el, options) {
  setSkinTransitionVisible(el, false, options);
}

function toggleSkinTransition(el, options) {

  const next = !isSkinTransitionVisible(el);

  setSkinTransitionVisible(el, next, options);

  return next;

}

/* 이미 보이는 요소에 "들어오기"를 한 번 더 재생한다.

   - HOME 복귀: HOME 은 다시 그려지지 않으므로 CSS appear 가 다시
     돌지 않는다(posts/view/posts-view-transition.js closePostArea).
   - Studio: Direct Edit 로 전환을 바꾼 뒤 "미리 보기".

   숨겨진 요소(닫힌 패널, 접힌 dock)는 건드리지 않는다. */
function playSkinTransitionEnter(el, options) {

  if (!el || typeof el.animate !== "function") {
    return false;
  }

  if (!isSkinTransitionVisible(el)) {
    return false;
  }

  const opts = options || {};

  const spec =
    opts.spec
      ? normalizeSkinTransition(opts.spec)
      : readSkinTransitionSpec(el);

  if (!spec || spec.type === "none" || skinTransitionPrefersReducedMotion(el)) {
    return false;
  }

  const record = skinTransitionRecordFor(el);

  cancelSkinTransitionAnimation(el, record);

  record.target = true;

  el.hidden = false;
  setSkinTransitionInert(el, false);
  setSkinTransitionState(el, "shown");

  try {

    el.animate(buildSkinTransitionKeyframes(spec), {
      duration: spec.duration,
      easing: skinTransitionEasingValue(spec.easing)
    });

  } catch (err) {
    return false;
  }

  return true;

}

function replaySkinTransitionAppear(root) {

  if (!root || typeof root.querySelectorAll !== "function") {
    return 0;
  }

  let count = 0;

  const list = [];

  if (typeof root.hasAttribute === "function" && root.hasAttribute(SKIN_TRANSITION_ATTR)) {
    list.push(root);
  }

  Array.prototype.push.apply(list, root.querySelectorAll("[" + SKIN_TRANSITION_ATTR + "]"));

  list.forEach((el) => {

    /* 닫힌 패널 안쪽은 건너뛴다 — 열릴 때 자기 전환을 탄다 */
    if (typeof el.closest === "function" && el.closest("[hidden]")) {
      return;
    }

    if (playSkinTransitionEnter(el)) {
      count += 1;
    }

  });

  return count;

}


/* =========================================================
   8. 패널 열고 닫기 — data-imory-toggle / data-imory-panel

   스킨은 JS 를 쓰지 않는다. 버튼에 data-imory-toggle="menu", 열릴
   덩어리에 data-imory-panel="menu" 를 적으면 플랫폼이 그 둘을
   잇는다. 움직임은 패널 자신의 data-imory-transition-* 이다(없으면
   즉시).

   - 패널은 **닫힌 채로** 시작한다.
   - 이벤트는 스킨 루트 하나에 위임한다. 버튼이 속한 **가장 가까운
     스킨 루트** 안의 패널만 연다 — 스킨 루트 안에 dock 루트가 들어
     있는 경우(bottom-dock region) 두 루트가 같은 클릭을 두 번 처리해
     열었다 닫히는 일이 없다.
   - <a>/<button> 이 아닌 버튼에는 role/tabindex 를 얹는다(스킨 HTML
     은 tabindex 를 쓸 수 없다 — sanitizer 가 전면 금지한다).
========================================================== */

const skinTransitionWiredRoots =
  typeof WeakSet === "function" ? new WeakSet() : null;

function skinTransitionPanelsFor(root, name) {

  if (!isSkinPanelName(name)) {
    return [];
  }

  return Array.prototype.filter.call(
    root.querySelectorAll("[" + SKIN_PANEL_ATTR + '="' + name + '"]'),
    (panel) => panel.closest("[data-skin-root]") === root
  );

}

function syncSkinToggleExpanded(root, name, open) {

  Array.prototype.forEach.call(
    root.querySelectorAll("[" + SKIN_TOGGLE_ATTR + '="' + name + '"]'),
    (toggle) => {
      if (toggle.closest("[data-skin-root]") === root) {
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      }
    }
  );

}

/* 이름으로 패널을 연다/닫는다. dock 의 open 동작도 여기를 지난다
   (skin/skin-bottom-dock-actions.js runSkinDockOpenPanel). */
function setSkinPanelOpen(root, name, open, options) {

  const panels = skinTransitionPanelsFor(root, name);

  panels.forEach((panel) => setSkinTransitionVisible(panel, !!open, options));

  syncSkinToggleExpanded(root, name, !!open);

  return panels.length;

}

function toggleSkinPanel(root, name) {

  const panels = skinTransitionPanelsFor(root, name);

  if (!panels.length) {
    return null;
  }

  const open = !isSkinTransitionVisible(panels[0]);

  setSkinPanelOpen(root, name, open);

  return open;

}

function wireSkinTransitionToggles(root) {

  if (!skinTransitionWiredRoots || skinTransitionWiredRoots.has(root)) {
    return;
  }

  skinTransitionWiredRoots.add(root);

  root.addEventListener("click", (event) => {

    const target = event.target;

    if (!target || typeof target.closest !== "function") {
      return;
    }

    const toggle = target.closest("[" + SKIN_TOGGLE_ATTR + "]");

    if (!toggle || toggle.closest("[data-skin-root]") !== root) {
      return;
    }

    /* 링크에 달린 토글이 페이지를 옮기지 않게 — skin-link-nav 는
       defaultPrevented 를 존중한다. */
    event.preventDefault();

    toggleSkinPanel(root, toggle.getAttribute(SKIN_TOGGLE_ATTR));

  });

  root.addEventListener("keydown", (event) => {

    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
      return;
    }

    const target = event.target;

    if (
      !target ||
      typeof target.getAttribute !== "function" ||
      !target.hasAttribute(SKIN_TOGGLE_ATTR) ||
      target.tagName === "BUTTON" ||
      (target.tagName === "A" && target.hasAttribute("href"))
    ) {
      return;
    }

    event.preventDefault();

    target.click();

  });

}

function prepareSkinToggle(toggle) {

  const isNative =
    toggle.tagName === "BUTTON" ||
    (toggle.tagName === "A" && toggle.hasAttribute("href"));

  if (!isNative) {

    if (!toggle.hasAttribute("role")) {
      toggle.setAttribute("role", "button");
    }

    toggle.setAttribute("tabindex", "0");

  }

  toggle.setAttribute("aria-expanded", "false");

}


/* =========================================================
   9. 컴파일 — renderSkin() 이 mount 끝에 한 번 부른다

   compileSkinTransitionTree(root, { appear })

   appear:false 는 Studio Preview 용이다 — 글자 하나 고칠 때마다
   화면 전체가 다시 들어오면 편집을 할 수 없다. 그때도 custom
   property 는 똑같이 쓴다("미리 보기" 버튼이 같은 값으로 재생한다).

   전환 속성이 하나도 없는 스킨에서는 이 함수가 **아무 요소도
   건드리지 않는다** — style 속성도 상태 속성도 리스너도 생기지
   않는다. 기존 스킨의 outerHTML 이 글자 단위로 같다.
========================================================== */

function compileSkinTransitionTree(root, options) {

  if (!root || typeof root.querySelectorAll !== "function") {
    return 0;
  }

  const opts = options || {};
  const appear = opts.appear !== false;

  let count = 0;
  let horizontal = false;

  const elements = [];

  if (typeof root.hasAttribute === "function" && root.hasAttribute(SKIN_TRANSITION_ATTR)) {
    elements.push(root);
  }

  Array.prototype.push.apply(elements, root.querySelectorAll("[" + SKIN_TRANSITION_ATTR + "]"));

  elements.forEach((el) => {

    const spec = readSkinTransitionSpec(el);

    if (!spec) {
      return;
    }

    count += 1;

    const props = buildSkinTransitionProperties(spec);

    Object.keys(props).forEach((name) => el.style.setProperty(name, props[name]));

    if (isSkinTransitionHorizontal(spec)) {
      horizontal = true;
    }

    if (spec.type !== "none" && !el.hasAttribute(SKIN_TRANSITION_STATE_ATTR)) {
      setSkinTransitionState(el, appear ? "appear" : "shown");
    }

  });


  /* 패널 — 닫힌 채로 시작한다 */

  const panels = root.querySelectorAll("[" + SKIN_PANEL_ATTR + "]");

  Array.prototype.forEach.call(panels, (panel) => {

    if (!isSkinPanelName(panel.getAttribute(SKIN_PANEL_ATTR))) {
      return;
    }

    count += 1;

    setSkinTransitionState(panel, "hidden");
    setSkinTransitionInert(panel, true);
    panel.hidden = true;

  });


  const toggles = root.querySelectorAll("[" + SKIN_TOGGLE_ATTR + "]");

  Array.prototype.forEach.call(toggles, (toggle) => {

    if (!isSkinPanelName(toggle.getAttribute(SKIN_TOGGLE_ATTR))) {
      return;
    }

    count += 1;

    prepareSkinToggle(toggle);

  });

  if (toggles.length) {
    wireSkinTransitionToggles(root);
  }

  if (horizontal) {
    root.setAttribute(SKIN_TRANSITION_CLIP_ATTR, "");
  }

  return count;

}


/* =========================================================
   10. Studio / AI 가 쓰는 보조
========================================================== */

function describeSkinTransitionTarget(el) {

  const declared = readSkinTransitionDeclared(el);

  const spec = readSkinTransitionSpec(el);

  return {
    declared,
    type: spec ? spec.type : "",
    spec,
    isPanel:
      !!(el && typeof el.getAttribute === "function" && isSkinPanelName(el.getAttribute(SKIN_PANEL_ATTR))),
    isToggle:
      !!(el && typeof el.getAttribute === "function" && isSkinPanelName(el.getAttribute(SKIN_TOGGLE_ATTR))),
    directional:
      !!spec && SKIN_TRANSITION_DIRECTIONAL_TYPES.indexOf(spec.type) !== -1
  };

}


/* =========================================================
   11. 감사(audit) — 거부가 아니라 경고
========================================================== */

function auditSkinTransitionDocument(doc, pageLabel) {

  const warnings = [];

  if (!doc || typeof doc.querySelectorAll !== "function") {
    return warnings;
  }

  const paramSelector =
    Object.keys(SKIN_TRANSITION_PARAM_RULES)
      .map((name) => "[" + SKIN_TRANSITION_PARAM_PREFIX + name + "]")
      .join(",");

  Array.prototype.forEach.call(doc.querySelectorAll(paramSelector), (el) => {

    if (!el.hasAttribute(SKIN_TRANSITION_ATTR)) {
      warnings.push(
        pageLabel + ": " + SKIN_TRANSITION_ATTR + " 없이 전환 속도/방향만 적힌 요소가 있어 아무 움직임도 없습니다."
      );
    }

  });

  Array.prototype.forEach.call(doc.querySelectorAll("[" + SKIN_TRANSITION_ATTR + "]"), (el) => {

    const spec = readSkinTransitionSpec(el);

    if (
      spec &&
      el.hasAttribute(SKIN_TRANSITION_PARAM_PREFIX + "direction") &&
      SKIN_TRANSITION_DIRECTIONAL_TYPES.indexOf(spec.type) === -1
    ) {
      warnings.push(
        pageLabel + ": " + spec.type + " 전환에는 방향이 적용되지 않습니다."
      );
    }

  });

  const panelNames = new Set(
    Array.prototype.map.call(
      doc.querySelectorAll("[" + SKIN_PANEL_ATTR + "]"),
      (el) => el.getAttribute(SKIN_PANEL_ATTR)
    )
  );

  const reported = new Set();

  Array.prototype.forEach.call(doc.querySelectorAll("[" + SKIN_TOGGLE_ATTR + "]"), (el) => {

    const name = el.getAttribute(SKIN_TOGGLE_ATTR);

    if (!panelNames.has(name) && !reported.has(name)) {
      reported.add(name);
      warnings.push(
        pageLabel + ': data-imory-toggle="' + name + '" 이 여는 data-imory-panel 이 같은 템플릿에 없습니다.'
      );
    }

  });

  return warnings;

}


/* =========================================================
   12. 노출 — classic script(window) + node(require)
========================================================== */

if (typeof window !== "undefined") {

  window.SKIN_TRANSITION_ATTR = SKIN_TRANSITION_ATTR;
  window.SKIN_TRANSITION_PARAM_PREFIX = SKIN_TRANSITION_PARAM_PREFIX;
  window.SKIN_TRANSITION_STATE_ATTR = SKIN_TRANSITION_STATE_ATTR;
  window.SKIN_PANEL_ATTR = SKIN_PANEL_ATTR;
  window.SKIN_TOGGLE_ATTR = SKIN_TOGGLE_ATTR;
  window.SKIN_TRANSITION_TYPES = SKIN_TRANSITION_TYPES;
  window.SKIN_TRANSITION_DIRECTIONS = SKIN_TRANSITION_DIRECTIONS;
  window.SKIN_TRANSITION_EASINGS = SKIN_TRANSITION_EASINGS;
  window.SKIN_TRANSITION_DIRECTIONAL_TYPES = SKIN_TRANSITION_DIRECTIONAL_TYPES;
  window.SKIN_TRANSITION_DEFAULTS = SKIN_TRANSITION_DEFAULTS;
  window.SKIN_TRANSITION_DURATION_MIN = SKIN_TRANSITION_DURATION_MIN;
  window.SKIN_TRANSITION_DURATION_MAX = SKIN_TRANSITION_DURATION_MAX;

  window.isSkinTransitionType = isSkinTransitionType;
  window.isSkinTransitionAttributeName = isSkinTransitionAttributeName;
  window.isValidSkinTransitionAttributeValue = isValidSkinTransitionAttributeValue;
  window.sanitizeSkinTransitionAttributeValue = sanitizeSkinTransitionAttributeValue;
  window.normalizeSkinTransition = normalizeSkinTransition;
  window.validateSkinTransitionInput = validateSkinTransitionInput;
  window.readSkinTransitionSpec = readSkinTransitionSpec;
  window.buildSkinTransitionProperties = buildSkinTransitionProperties;
  window.isSkinTransitionHorizontal = isSkinTransitionHorizontal;
  window.compileSkinTransitionTree = compileSkinTransitionTree;
  window.setSkinTransitionVisible = setSkinTransitionVisible;
  window.showSkinTransition = showSkinTransition;
  window.hideSkinTransition = hideSkinTransition;
  window.toggleSkinTransition = toggleSkinTransition;
  window.isSkinTransitionVisible = isSkinTransitionVisible;
  window.playSkinTransitionEnter = playSkinTransitionEnter;
  window.replaySkinTransitionAppear = replaySkinTransitionAppear;
  window.setSkinPanelOpen = setSkinPanelOpen;
  window.toggleSkinPanel = toggleSkinPanel;
  window.describeSkinTransitionTarget = describeSkinTransitionTarget;
  window.auditSkinTransitionDocument = auditSkinTransitionDocument;

}

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SKIN_TRANSITION_ATTR,
    SKIN_TRANSITION_PARAM_PREFIX,
    SKIN_TRANSITION_STATE_ATTR,
    SKIN_TRANSITION_CLIP_ATTR,
    SKIN_PANEL_ATTR,
    SKIN_TOGGLE_ATTR,
    SKIN_TRANSITION_TYPES,
    SKIN_TRANSITION_DIRECTIONS,
    SKIN_TRANSITION_EASINGS,
    SKIN_TRANSITION_EASING_VALUES,
    SKIN_TRANSITION_DIRECTIONAL_TYPES,
    SKIN_TRANSITION_DEFAULTS,
    SKIN_TRANSITION_DURATION_MIN,
    SKIN_TRANSITION_DURATION_MAX,
    SKIN_TRANSITION_DISTANCE,
    SKIN_TRANSITION_PARAM_RULES,
    isSkinTransitionType,
    isSkinPanelName,
    isSkinTransitionAttributeName,
    isValidSkinTransitionAttributeValue,
    sanitizeSkinTransitionAttributeValue,
    clampSkinTransitionDuration,
    normalizeSkinTransition,
    validateSkinTransitionInput,
    readSkinTransitionSpec,
    buildSkinTransitionPose,
    buildSkinTransitionProperties,
    buildSkinTransitionKeyframes,
    skinTransitionEasingValue,
    isSkinTransitionHorizontal,
    compileSkinTransitionTree,
    describeSkinTransitionTarget,
    auditSkinTransitionDocument
  };

}
