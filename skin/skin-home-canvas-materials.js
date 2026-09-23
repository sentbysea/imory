/* =========================================================
   SKIN — HOME 캔버스 **재료 카탈로그** (STUDIO-LAYERS-MATERIALS-1B)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §36
   앞 라운드: §27(재료 추가) · §35(재료 탐색 화면)

   ── 이 파일이 있는 이유 ────────────────────────────────

   MATERIALS-1A 까지 카드 하나는 재료 **하나**였다. 카드마다
   `items:[{…}]` 가 하나씩 들어 있었고, 누르면 그 하나를 만들었다.
   1B 에서 카드는 **분류**가 되고 그 아래에 재료가 여럿 선다.

   그 목록을 패널 DOM 에 두면 카드가 "무엇을 만들지"를 스스로 들고
   있게 된다 — 화면에서 고친 JSON 이 그대로 저장 경로로 들어가는
   모양이다. 그래서 목록을 **이 파일 하나**에 두고, 패널이 쓰기
   경로에 보내는 것은 **id 한 줄**이다. 그 id 로 무엇을 만들지는
   여기 적힌 표와 writer 의 순수 함수가 정한다(§27-3 의 그 원칙 —
   "기본값은 순수 함수가 정한다"가 여기서도 그대로다).

   ── 프리셋이 바꿀 수 있는 것은 넷이다 ──────────────────

     size    새 노드의 width · height (계약의 그 두 칸)
     props   그 종류가 **실제로 받는** props (아래 표)
     style   그 요소 하나의 **스킨 CSS 선언**
     targets 어느 자리에 넣을 수 있는가(우선순위)

   ★ **새 저장 칸을 만들지 않는다.** 위 넷 중 앞 둘은 계약 §5 · §8 의
     기존 칸이고, `style` 은 `addStudioCanvasV2Node()` 가 이미
     shape · divider 에 쓰고 있는 **요소별 스킨 CSS 규칙 한 줄**이다
     (계약 §29 의 "빈 상자 재료의 시작 규칙" · §31 의 타이포그래피가
     값을 넣는 그 규칙과 같은 자리). Inspector 가 그대로 읽고 고치고
     지울 수 있고, 새 재료와 **같은 Undo 한 칸**에 들어간다.

   ── 무엇을 넣지 않았나 (조사 결과) ─────────────────────

   계약이 지금 받는 props 는 이것이 전부다.

     photo · sticker   slot
     logo              slot · fallback("site_title" 하나)
     text              text · role(title·subtitle·body·caption·label)
     category_nav      mode(all·selected) · categoryIds[]
     shape             kind(rect·ellipse·line)
     divider           없음

   그래서 프리셋이 **props 로** 만들 수 있는 차이는 글자의 역할과
   도형의 종류 둘뿐이다. 모서리 · 두께 · 점선 · 투명도는 props 에
   칸이 없고, 렌더러도 모양을 바꿔 그리지 않는다(`shape:"ellipse"`
   하나만 예외로 `border-radius:50%` 를 갖는다 —
   skin/skin-home-canvas-render.css). 플랫폼이 칠하지 않는 것이
   계약 §8 이기 때문이다.

   그 차이는 전부 위 `style` 이 만든다. **새 필드를 만들지 않았고**,
   렌더러도 한 줄 바뀌지 않았다.

   ── 사진이 들어가는 재료에는 배경을 깔지 않는다 ─────────

   `photo` · `sticker` 프리셋의 `style` 에는 `background` 도
   `opacity` 도 없다. 그 자리는 곧 그림이 들어오는 곳이고, 반투명
   배경을 깔아 두면 사진을 넣은 뒤에도 사진이 흐려 보인다. 빈
   사진 자리에 플랫폼이 placeholder 를 넣지 않는 것도 같은 계약이다
   (§6). 그래서 그 둘이 받는 것은 모서리(`border-radius` ·
   `overflow`)뿐이고, 프리셋의 차이는 **모양과 크기**다.

   반대로 `shape` · `divider` 는 그림이 들어올 자리가 아니라
   **빈 상자**다. 아무 선언이 없으면 화면에 아무것도 없으므로
   지금까지처럼 색을 깐다(§29).

   ── classic script · 의존 없음 ─────────────────────────

   skin/skin-inspect-target.js 와 같은 모양이다. 이 파일은 아무것도
   부르지 않고 표와 순수 함수만 준다. 읽는 쪽은 둘이다.

     skin/skin-home-canvas-write-v2.js   id → 기본값(순수 함수)
     studio/inspector/studio-canvas-add-v2.js
                                         id → 화면(카드 · 썸네일)

   ★ **sandbox 프레임에는 싣지 않는다.** 프레임은 추가 관문을 쓸 수
     없고(§27-5 — 닿는 것은 부모 realm 의 왼쪽 패널뿐이다), 그래서
     core/lib/skin-sandbox-server.js 의 allowlist 에도 넣지 않았다.
     프레임 쪽 write-v2.js 에서는 아래 resolve 가 없으므로
     `materialId` 요청이 **fail closed** 로 거절된다.
========================================================== */


/* id — 사람이 읽고 테스트가 고르는 이름이다(요소 id 와 달리 뜻이
   있어야 한다). 소문자 · 숫자 · `_` 만. */
const SKIN_HOME_CANVAS_MATERIAL_ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;


/* 스킨 CSS 로 들어가는 값 — 규칙 하나를 탈출해 다른 선택자를 쓰는
   길을 여기서 막는다. `;` `{` `}` `<` `>` `@` `\` `"` 는 하나도
   없다(sandbox 프로토콜의 look 값 검사와 같은 생각이다). */
const SKIN_HOME_CANVAS_MATERIAL_STYLE_VALUE =
  /^[-A-Za-z0-9 ,.%#()'\/]{1,80}$/;


/* 그 선언에 쓸 수 있는 속성 — 표에 적힌 것만. 새 재료를 더하다가
   `position` 이나 `content` 같은 칸이 슬며시 들어오지 않게 한다. */
const SKIN_HOME_CANVAS_MATERIAL_STYLE_PROPERTIES = [
  "background",
  "border",
  "border-top",
  "border-radius",
  "overflow",
  "opacity",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align"
];


/* =========================================================
   1. 분류 — 카드 여덟

   MATERIALS-1A 의 그 카드 표가 여기로 왔다. 카드가 아는 것은
   지금까지와 같다(어느 묶음 · 어느 종류 · 어느 자리를 먼저 보는가 ·
   하나뿐인가). 달라진 것은 **items 를 들고 있지 않다**는 것뿐이다 —
   그 목록은 아래 `SKIN_HOME_CANVAS_MATERIALS` 에서 `category` 로
   이어진다.
========================================================== */
const SKIN_HOME_CANVAS_MATERIAL_CATEGORIES = [

  {
    key: "logo",
    group: "home",
    type: "logo",
    targets: ["flow"],
    unique: true,
    label: "로고",
    desc: "사이트 이름이나 로고 이미지",
    icon: "logo"
  },

  {
    key: "category_nav",
    group: "home",
    type: "category_nav",
    targets: ["flow"],
    unique: true,
    label: "카테고리 메뉴",
    desc: "글 목록으로 이동하는 메뉴",
    icon: "nav"
  },

  {
    key: "main_visual",
    group: "home",
    type: "main_visual",
    targets: ["flow"],
    unique: true,
    label: "메인 비주얼",
    desc: "홈의 중심이 되는 사진 영역",
    icon: "main"
  },

  {
    key: "photo",
    group: "decor",
    type: "photo",
    targets: ["frame", "overlay"],
    unique: false,
    label: "사진",
    desc: "원하는 이미지를 배치",
    icon: "photo"
  },

  {
    key: "text",
    group: "decor",
    type: "text",
    targets: ["frame", "overlay"],
    unique: false,
    label: "글자",
    desc: "제목이나 설명 추가",
    icon: "text"
  },

  {
    key: "divider",
    group: "decor",
    type: "divider",

    /* 흐름만 받는다(§27-2) — 자유 층에는 `divider` 가 없다 */
    targets: ["flow"],
    unique: false,
    label: "구분선",
    desc: "영역 사이를 구분",
    icon: "divider"
  },

  {
    key: "shape",
    group: "decor",
    type: "shape",
    targets: ["frame", "overlay"],
    unique: false,
    label: "도형",
    desc: "사각형·원 등 기본 도형",
    icon: "shape"
  },

  {
    key: "sticker",
    group: "decor",
    type: "sticker",
    targets: ["frame", "overlay"],
    unique: false,
    label: "디자인 요소",
    desc: "테이프·스티커 같은 장식",
    icon: "sticker"
  }

];


/* =========================================================
   2. 재료 — 분류 아래의 프리셋

   각 항목이 갖는 칸(§36-2):

     id        쓰기 경로에 보내는 **그 한 줄**
     category  위 분류의 key
     label     사람이 읽는 이름
     desc      한 줄 설명(카드 아래)
     preview   썸네일을 그리는 **데이터**(DOM 도 HTML 도 아니다)
     type      계약의 재료 종류
     props     그 종류가 실제로 받는 props 덮어쓰기(없으면 기본값)
     size      width · height 덮어쓰기(없으면 기본값)
     style     그 요소 하나의 스킨 CSS 선언(없으면 종류 기본값)
     targets   넣을 자리의 우선순위(없으면 분류의 것)

   ★ `props` · `size` 를 적지 않으면 writer 의 기본값 표가 그대로
     쓰인다(§27-3). 같은 값을 다시 적어 두 벌로 만들지 않는다.
========================================================== */
const SKIN_HOME_CANVAS_MATERIALS = [

  /* ── 홈 구성 — 분류마다 하나다(§36-3) ───────────────── */

  {
    id: "logo_basic",
    category: "logo",
    label: "로고",
    desc: "사이트 이름이나 로고 이미지",
    preview: { kind: "logo" },
    type: "logo"
  },

  {
    id: "nav_all",
    category: "category_nav",
    label: "카테고리 메뉴",
    desc: "모든 카테고리를 한 줄로",
    preview: { kind: "nav" },
    type: "category_nav"
  },

  {
    id: "main_visual_basic",
    category: "main_visual",
    label: "메인 비주얼",
    desc: "홈의 중심이 되는 사진 영역",
    preview: { kind: "main" },
    type: "main_visual"
  },


  /* ── 사진 — 모양만 다르다. 배경을 깔지 않는다(머리말) ── */

  {
    id: "photo_basic",
    category: "photo",
    label: "기본 사진",
    desc: "네모난 세로 사진",
    preview: { kind: "photo", ratio: 0.8, radius: "0" },
    type: "photo"
  },

  {
    id: "photo_rounded",
    category: "photo",
    label: "둥근 사진",
    desc: "모서리를 둥글린 사진",
    preview: { kind: "photo", ratio: 0.8, radius: "8px" },
    type: "photo",

    /* `overflow` 가 없으면 안쪽 `img` 가 모서리를 넘어 네모로 남는다
       (렌더러가 wrapper + img 로 그린다 — 계약 §12) */
    style: { "border-radius": "16px", "overflow": "hidden" }
  },

  {
    id: "photo_circle",
    category: "photo",
    label: "원형 사진",
    desc: "동그랗게 자른 사진",
    preview: { kind: "photo", ratio: 1, radius: "50%" },
    type: "photo",
    size: { width: 160, height: 160 },
    style: { "border-radius": "50%", "overflow": "hidden" }
  },


  /* ── 글자 — 역할(props)과 조판(style) ────────────────── */

  {
    id: "text_title",
    category: "text",
    label: "제목",
    desc: "가장 큰 글자",
    preview: { kind: "text", size: 15, weight: "700" },
    type: "text",
    props: { text: "제목", role: "title" },
    size: { width: 240, height: "auto" },
    style: { "font-size": "28px", "font-weight": "700", "line-height": "1.25" }
  },

  {
    id: "text_body",
    category: "text",
    label: "본문",
    desc: "설명이나 소개 글",
    preview: { kind: "text", size: 10, weight: "400" },
    type: "text",

    /* 기본값 그대로다(§27-3 의 `text:"새 텍스트"` · `role:"body"` ·
       200 × auto). `style` 도 없다 — 스킨의 조판을 그대로 쓴다. */
    props: { text: "본문 텍스트", role: "body" }
  },

  {
    id: "text_caption",
    category: "text",
    label: "작은 캡션",
    desc: "사진 아래 붙이는 작은 글자",
    preview: { kind: "text", size: 7, weight: "400" },
    type: "text",
    props: { text: "캡션", role: "caption" },
    size: { width: 160, height: "auto" },
    style: { "font-size": "12px", "line-height": "1.5", "opacity": "0.7" }
  },


  /* ── 구분선 — 흐름만 받는다. 높이와 선 모양 ──────────── */

  {
    id: "divider_thin",
    category: "divider",
    label: "얇은 선",
    desc: "가늘고 옅은 선",
    preview: { kind: "divider", thickness: 1 },
    type: "divider",

    /* 폭은 적지 않는다 — 흐름의 가용 폭이 기본값이고(§27-3) 그것이
       구분선이 원하는 값이다. 적지 않은 칸은 기본값 그대로다. */
    size: { height: 1 },
    style: { "background": "currentColor", "opacity": "0.25" }
  },

  {
    id: "divider_thick",
    category: "divider",
    label: "굵은 선",
    desc: "두껍고 또렷한 선",
    preview: { kind: "divider", thickness: 4 },
    type: "divider",
    size: { height: 6 },
    style: { "background": "currentColor", "opacity": "0.45" }
  },

  {
    id: "divider_dashed",
    category: "divider",
    label: "점선",
    desc: "끊어진 선",
    preview: { kind: "divider", thickness: 2, dash: true },
    type: "divider",
    size: { height: 2 },

    /* 상자를 칠하지 않고 **위 테두리**만 그린다 — 그래야 점선이
       된다. `background:none` 이 있어야 종류 기본값이 섞이지 않는다. */
    style: {
      "background": "none",
      "border-top": "2px dashed currentColor",
      "opacity": "0.5"
    }
  },


  /* ── 도형 — kind 셋과 모서리 ─────────────────────────── */

  {
    id: "shape_rect",
    category: "shape",
    label: "사각형",
    desc: "네모난 색 상자",
    preview: { kind: "shape", radius: "0" },
    type: "shape",
    props: { kind: "rect" }
  },

  {
    id: "shape_round_rect",
    category: "shape",
    label: "둥근 사각형",
    desc: "모서리가 둥근 색 상자",
    preview: { kind: "shape", radius: "6px" },
    type: "shape",
    props: { kind: "rect" },
    style: {
      "background": "currentColor",
      "opacity": "0.18",
      "border-radius": "20px"
    }
  },

  {
    id: "shape_ellipse",
    category: "shape",
    label: "원",
    desc: "동그란 색 상자",

    /* 렌더러가 `border-radius:50%` 를 준다(§8 의 유일한 예외) —
       그래서 `style` 에 모서리를 적지 않는다. */
    preview: { kind: "shape", radius: "50%" },
    type: "shape",
    props: { kind: "ellipse" }
  },

  {
    id: "shape_line",
    category: "shape",
    label: "선",
    desc: "자유롭게 놓는 가는 선",
    preview: { kind: "shape", radius: "0", thickness: 2 },
    type: "shape",
    props: { kind: "line" },
    size: { width: 140, height: 2 },
    style: { "background": "currentColor", "opacity": "0.5" }
  },


  /* ── 디자인 요소 — 사진처럼 그림이 들어온다(머리말) ──── */

  {
    id: "sticker_tape",
    category: "sticker",
    label: "테이프",
    desc: "가로로 긴 장식",
    preview: { kind: "sticker", ratio: 3.4, radius: "0" },
    type: "sticker",
    size: { width: 120, height: 34 }
  },

  {
    id: "sticker_label",
    category: "sticker",
    label: "라벨",
    desc: "모서리가 둥근 띠",
    preview: { kind: "sticker", ratio: 2.8, radius: "6px" },
    type: "sticker",
    size: { width: 140, height: 48 },
    style: { "border-radius": "10px", "overflow": "hidden" }
  },

  {
    id: "sticker_badge",
    category: "sticker",
    label: "스티커",
    desc: "동그란 장식",
    preview: { kind: "sticker", ratio: 1, radius: "50%" },
    type: "sticker",
    size: { width: 96, height: 96 },
    style: { "border-radius": "50%", "overflow": "hidden" }
  }

];


/* =========================================================
   3. 읽는 길

   ★ 표를 **그대로 내주지 않는다.** 부르는 쪽이 한 칸을 고치면
     다음 사람이 다른 재료를 만든다. 언제나 새 리터럴을 만든다.
========================================================== */

function skinHomeCanvasMaterialCategory(key) {

  const hit =
    SKIN_HOME_CANVAS_MATERIAL_CATEGORIES.find(
      (item) => item && item.key === key
    );

  return hit || null;

}


/* 그 분류의 재료들 — 표에 적힌 순서 그대로 */
function skinHomeCanvasMaterialsOf(categoryKey) {

  return SKIN_HOME_CANVAS_MATERIALS.filter(
    (item) => item && item.category === categoryKey
  );

}


function findSkinHomeCanvasMaterial(id) {

  if (typeof id !== "string" || !SKIN_HOME_CANVAS_MATERIAL_ID_PATTERN.test(id)) {
    return null;
  }

  const hit =
    SKIN_HOME_CANVAS_MATERIALS.find((item) => item && item.id === id);

  return hit || null;

}


/*
  한 칸이 "쓸 수 있는 크기"인가 — 계약의 그 두 칸과 같은 자다.

    undefined  적지 않았다 → 기본값 그대로(§27-3 의 표)
    "auto"     그 종류가 받으면 writer 가 받는다
    양수        그대로

  ★ 0 을 받지 않는다. 폭 0 인 요소는 화면에 없고 고를 수도 없다 —
    "기본값 그대로"를 뜻하고 싶으면 그 칸을 **적지 않는다**.
*/
function skinHomeCanvasMaterialSizeValue(value) {

  if (value === undefined) {
    return undefined;
  }

  if (value === "auto") {
    return "auto";
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  return null;

}


/* 선언 한 벌이 표의 규칙을 지키는가 — 하나라도 어긋나면 **통째로**
   버린다(반쯤 적힌 규칙을 스킨 CSS 에 남기지 않는다) */
function skinHomeCanvasMaterialStyle(style) {

  if (!style || typeof style !== "object") {
    return null;
  }

  const names =
    Object.keys(style);

  if (!names.length) {
    return null;
  }

  const out = {};

  for (let i = 0; i < names.length; i += 1) {

    const name =
      names[i];

    const value =
      style[name];

    if (
      SKIN_HOME_CANVAS_MATERIAL_STYLE_PROPERTIES.indexOf(name) === -1 ||
      typeof value !== "string" ||
      !SKIN_HOME_CANVAS_MATERIAL_STYLE_VALUE.test(value)
    ) {
      return null;
    }

    out[name] = value;

  }

  return out;

}


/* =========================================================
   resolveSkinHomeCanvasMaterialPreset(id)

     -> { id, type, targets[], size|null, props|null, style|null }
     -> null   모르는 id · 표가 어긋난 항목

   writer 와 패널이 **같은 이 함수**를 지난다. 그래야 화면에 보이는
   카드와 실제로 만들어지는 것이 갈라지지 않는다.

   ★ 여기서 계약을 다시 검증하지 않는다. `props` 가 그 종류에 맞는지
     · 새 노드가 계약을 지키는지는 넣어 본 뒤 전체를 다시 보는
     writer 의 일이다(§27-5). 여기서 보는 것은 **이 표 자신이
     성한가**뿐이다.
========================================================== */
function resolveSkinHomeCanvasMaterialPreset(id) {

  const item =
    findSkinHomeCanvasMaterial(id);

  if (!item) {
    return null;
  }

  const category =
    skinHomeCanvasMaterialCategory(item.category);

  if (!category || typeof item.type !== "string" || !item.type) {
    return null;
  }

  const targets =
    Array.isArray(item.targets) ? item.targets : category.targets;

  if (!Array.isArray(targets) || !targets.length) {
    return null;
  }

  const preset = {
    id: item.id,
    type: item.type,
    targets: targets.slice(),
    size: null,
    props: null,
    style: skinHomeCanvasMaterialStyle(item.style)
  };

  if (item.size && typeof item.size === "object") {

    const width =
      skinHomeCanvasMaterialSizeValue(item.size.width);

    const height =
      skinHomeCanvasMaterialSizeValue(item.size.height);

    /* 크기를 적었는데 읽을 수 없다 — 표가 어긋난 것이므로 재료
       자체를 내주지 않는다(조용히 기본값으로 떨어지면 화면의
       "원형 사진"이 세로 사진으로 태어난다) */
    if (width === null || height === null) {
      return null;
    }

    const size = {};

    if (width !== undefined) {
      size.width = width;
    }

    if (height !== undefined) {
      size.height = height;
    }

    if (Object.keys(size).length) {
      preset.size = size;
    }

  }

  if (item.props && typeof item.props === "object") {
    preset.props = { ...item.props };
  }

  return preset;

}


/* =========================================================
   창구
========================================================== */

if (typeof window !== "undefined") {

  window.SKIN_HOME_CANVAS_MATERIAL_CATEGORIES =
    SKIN_HOME_CANVAS_MATERIAL_CATEGORIES;

  window.SKIN_HOME_CANVAS_MATERIALS =
    SKIN_HOME_CANVAS_MATERIALS;

  window.skinHomeCanvasMaterialCategory = skinHomeCanvasMaterialCategory;
  window.skinHomeCanvasMaterialsOf = skinHomeCanvasMaterialsOf;
  window.findSkinHomeCanvasMaterial = findSkinHomeCanvasMaterial;
  window.resolveSkinHomeCanvasMaterialPreset = resolveSkinHomeCanvasMaterialPreset;

}


if (typeof module !== "undefined" && module.exports) {

  const api = {
    SKIN_HOME_CANVAS_MATERIAL_ID_PATTERN,
    SKIN_HOME_CANVAS_MATERIAL_STYLE_PROPERTIES,
    SKIN_HOME_CANVAS_MATERIAL_CATEGORIES,
    SKIN_HOME_CANVAS_MATERIALS,
    skinHomeCanvasMaterialCategory,
    skinHomeCanvasMaterialsOf,
    findSkinHomeCanvasMaterial,
    skinHomeCanvasMaterialStyle,
    resolveSkinHomeCanvasMaterialPreset
  };

  module.exports = api;

  Object.assign(globalThis, api);

}
