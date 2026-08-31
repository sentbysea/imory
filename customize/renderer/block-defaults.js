/* =========================================================
   CUSTOMIZE RENDERER - BLOCK SCHEMA / DEFAULTS

   layout_json(향후 DB 저장 예정) 스키마를 JS 상수/JSDoc으로만
   정의. TypeScript/ES module 아님 — 이 프로젝트의 다른 스크립트와
   동일하게 classic script로 로드되어 전역에 상수/함수를 만든다.

   이 파일은 validate-layout.js / render-layout.js /
   default-layout.js보다 먼저 로드되어야 함
   (아래 세 파일 모두 여기 상수를 전역으로 참조함).

   실제 DB 테이블/컬럼, editor UI, drag/drop은 이번 단계에
   포함하지 않는다 — 여기 있는 건 순수 데이터 모양 정의뿐.

   v2 (CUSTOMIZE_LAYOUT_VERSION 1 → 2): S/M/L enum 위주였던 block
   props를 숫자 기반으로 재정의(fontSize/gap/padding 등)하고,
   button 전용이던 href/actionName을 button/image가 함께 쓰는
   action 객체로 통합했다. 실사용 저장 row가 아직 없어서(관리자
   editor만 존재) breaking change를 버전 bump로만 표시하고 별도
   migration은 만들지 않는다 — "필드 추가는 버전을 안 올린다"는
   기존 정책(테마 textColor/font/contentWidth 추가 때 세움)과
   반대로, 이번은 필드 *구조 변경*이라 버전을 올리는 게 그 정책과
   일치한다.

   v2 후속: action.actionName("openProfile" 같은 고정 동작 이름)을
   action.targetPageId(실제 페이지 id)로 이름을 바꿨다. 여전히
   실사용 저장 row가 없어서 v1→v2 때와 같은 이유로 버전은 그대로
   둔다 — text에도 동일한 action을 추가했다(button/image와 동일
   shape, 필드 추가라 버전 정책과도 무관).

   v3 (CUSTOMIZE_LAYOUT_VERSION 2 → 3): theme.contentWidth(enum:
   narrow/medium/wide)를 제거하고 페이지별 contentArea.maxWidth
   (숫자 px, "" = 제한 없음)로 옮겼다 — theme은 색상/폰트 같은
   전역 디자인 토큰, contentArea는 페이지별 폭/여백/배치라는
   책임으로 분리하기 위함. contentArea에는 paddingY/paddingX/
   align/fitViewport/verticalAlign도 함께 추가됐다(화면 맞춤 —
   fitViewport===true일 때 renderer가 min-height:100dvh를 적용).
   필드 구조 변경(theme.contentWidth 제거)이라 v1→v2 때와 같은
   이유로 버전을 올린다. container에 추가된 borderRadius/
   backgroundOpacity는 순수 필드 추가라 버전 정책상 그 자체로는
   bump가 필요 없지만, 같은 작업에서 함께 반영됐다.

   v3 후속: columns block 추가. 각 슬롯이 독립된 drop zone/children을
   가져야 해서(왼쪽↔오른쪽 이동, container↔슬롯 이동을 서로 다른
   배열 참조 간 splice로 다루기 위함) container처럼 children:[]
   하나만 갖는 모양이 아니라, props와 별개로 최상위 columns:[]
   (슬롯마다 독립된 {id, children}) 필드를 갖는 구조로 만들었다 —
   자세한 모양은 CustomizeBlock JSDoc과 CUSTOMIZE_BLOCK_DEFAULTS.columns
   참고. 새 block 타입 추가 + 새 필드 추가라 버전 정책상 bump 불필요.
   모바일 stacking은 이전에 결정한 대로 stackOnMobile:boolean이 아니라
   mobileLayout:"stack"|"columns"로 표현한다(모바일에서도 2-column을
   유지하고 싶은 디자인을 막지 않기 위함).

   v3 후속: theme에 backgroundImage/backgroundPattern을 추가했다 —
   페이지별 override는 만들지 않고 사이트 전체가 항상 같은 배경을
   공유한다(theme.background 색상과 동일한 스코프). 순수 필드
   추가라 버전은 그대로 3. 이 작업으로 theme.background(hex)가
   실제로는 어디에도 칠해지지 않던 기존 결함도 함께 고쳤다 —
   render-layout.js가 이제 root(.customize-layout) 자신에게
   background-color를 직접 건다(render-layout.js 주석 참고).
========================================================== */

/**
 * @typedef {Object} CustomizeTheme
 * @property {string} background - "#rrggbb"(root의 background-color로 직접 칠해짐, v3 후속)
 * @property {string} textColor - "#rrggbb"(자동판별 아님 — 사용자가 직접 지정)
 * @property {string} point - "#rrggbb"(accent — 버튼/구분선 등에 사용)
 * @property {string} font - CUSTOMIZE_THEME_FONT_VALUES 중 하나
 * @property {Object} backgroundImage - CUSTOMIZE_DEFAULT_BACKGROUND_IMAGE 참고(v3 후속, 사이트 공통)
 * @property {Object} backgroundPattern - CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN 참고(v3 후속, 사이트 공통)
 */

/**
 * @typedef {Object} CustomizeAction - text/button/image가 공유하는 클릭 동작.
 * @property {string} type - CUSTOMIZE_ACTION_TYPE_VALUES 중 하나("none"/"link"/"internal").
 * @property {string} href - type이 "link"일 때만 의미 있음. https URL만 허용(빈 문자열 = 미설정).
 * @property {string} targetPageId - type이 "internal"일 때만 의미 있음. CUSTOMIZE_PAGE_IDS 중 하나
 *   (이동할 페이지의 id — "openProfile" 같은 고정 동작 이름이 아니라 실제 페이지를 가리킨다).
 */

/**
 * @typedef {Object} CustomizeBlock
 * @property {string} id - 전체 UUID(crypto.randomUUID() 그대로,
 *   앞 8자리 등으로 자르지 않음 — reorder/duplicate/undo·redo/
 *   migration에서 장기적으로 안정적인 id를 유지하기 위함).
 * @property {string} type - CUSTOMIZE_ALLOWED_BLOCK_TYPES 중 하나.
 * @property {Object} props - 타입별 props(CUSTOMIZE_BLOCK_DEFAULTS 참고).
 * @property {CustomizeBlock[]} [children] - container 타입만 허용.
 * @property {CustomizeColumnSlot[]} [columns] - columns 타입만 허용
 *   (children 대신 이 필드를 씀 — 정확히 CUSTOMIZE_COLUMN_COUNT개).
 */

/**
 * @typedef {Object} CustomizeColumnSlot - columns block의 슬롯 하나.
 *   block이 아니다(type/props 없음) — 왼쪽/오른쪽을 서로 다른
 *   drop target/children 배열로 다루기 위한 순수 컨테이너.
 * @property {string} id - 슬롯 자체의 id(block id와 별개 UUID 공간).
 * @property {CustomizeBlock[]} children
 */

/**
 * CUSTOMIZE_BLOCK_DEFAULTS[type].contentFields — 향후 skin export/import를
 * 위한 메타데이터. 해당 타입의 props 중 "레이아웃 구조/스타일"이 아니라
 * "사용자가 직접 채운 콘텐츠"인 필드 이름만 나열한다(예: text.content,
 * image.src). skin export는 이 목록에 있는 필드만 타입 기본값으로 비우고
 * 나머지 props/children/theme는 그대로 복사하면 된다 — 아직 export 함수
 * 자체는 구현하지 않음, 여기서는 목록만 정의.
 *
 * CUSTOMIZE_BLOCK_DEFAULTS[type].numeric — 숫자 기반 필드의 검증 메타데이터.
 * { min, max, default, decimals, allowEmpty } 형태 — validate-layout.js가
 * 이 스펙으로 clamp/반올림한다. allowEmpty:true인 필드는 빈 문자열("")이
 * "값 없음/auto"를 의미하는 걸 그대로 허용(예: image.width).
 *
 * CUSTOMIZE_BLOCK_DEFAULTS[type].optionalColorFields — 빈 문자열이면
 * "테마 CSS 변수 상속"(예: var(--theme-text)), 값이 있으면 그 블록만
 * override하는 hex 색상 필드 이름 목록.
 */

/**
 * @typedef {Object} CustomizeLayout
 * @property {number} version - CUSTOMIZE_LAYOUT_VERSION.
 * @property {CustomizeTheme} [theme] - 사이트 공통(페이지 무관).
 * @property {Object} [contentArea] - 페이지별(v3, CUSTOMIZE_DEFAULT_CONTENT_AREA 참고).
 * @property {CustomizeBlock[]} blocks
 */


/* =========================================================
   LAYOUT VERSION
========================================================== */

const CUSTOMIZE_LAYOUT_VERSION =
  3;


/* =========================================================
   NESTING DEPTH

   허용 depth: root(blocks 배열, depth 1) → container(depth 2)
   → container(depth 3)까지만. depth 4 이상은 validation에서
   명시적으로 invalid 처리하고(자동 flatten 금지), renderer도
   방어적으로 depth 초과 branch를 skip한다.
========================================================== */

const CUSTOMIZE_MAX_BLOCK_DEPTH =
  3;


/* =========================================================
   BLOCK TYPE ALLOWLIST
========================================================== */

const CUSTOMIZE_ALLOWED_BLOCK_TYPES =
  [
    "text",
    "image",
    "container",
    "button",
    "spacer",
    "divider",
    "columns"
  ];


/* container만 children을 가질 수 있음 */

const CUSTOMIZE_CONTAINER_BLOCK_TYPE =
  "container";


/* =========================================================
   COLUMNS BLOCK — 슬롯 개수/비율

   지금 단계는 슬롯 추가/삭제(2단→3단 등)를 지원하지 않고 항상
   정확히 2개로 고정한다 — validate-layout.js가 이 개수에 맞춰
   부족/초과를 보정한다. ratio는 [슬롯0 비율, 슬롯1 비율](합 100,
   각각 최소 CUSTOMIZE_COLUMN_MIN_RATIO_PERCENT% 이상) — divider
   드래그가 이 배열 두 값만 갱신한다.
========================================================== */

const CUSTOMIZE_COLUMN_COUNT =
  2;

const CUSTOMIZE_COLUMN_DEFAULT_RATIO =
  [50, 50];

const CUSTOMIZE_COLUMN_MIN_RATIO_PERCENT =
  20;


/*
  block(자신 포함) 바로 아래에서 실제로 순회해야 할 children
  배열들을 반환한다 — 대부분의 타입은 배열 0개 또는 1개
  (`.children`)뿐이지만, columns는 슬롯마다 독립된 배열을 가지므로
  2개(왼쪽/오른쪽)를 반환한다. tree 탐색(find/자손 판정/subtree
  height)이 타입을 몰라도 되게 하기 위한 공용 함수 — validate-layout.js/
  editor.js가 함께 쓴다(이 파일이 그 두 파일보다 먼저 로드됨).
*/

function getCustomizeBlockChildLists(
  block
) {

  if (block.type === "columns") {

    return (
      (block.columns || [])
        .map((slot) => slot.children || [])
    );

  }

  return (
    block.children
      ? [block.children]
      : []
  );

}


/* =========================================================
   PAGE ID 등록부

   다중 페이지(pages[]) 구조로 확장하기 전 단계 — 지금은
   cover/profile 2개뿐이지만, action의 내부 이동 대상을 "openProfile"
   같은 고정 동작 이름이 아니라 실제 페이지 id로 정의해둔다.
   페이지가 늘어나면 이 배열에 id만 추가하면 됨. customize/editor의
   페이지 탭 정의(kind/표시 라벨 등)도 이 배열의 id를 그대로 쓴다
   (editor.js CUSTOMIZE_PAGE_DEFS 참고 — renderer는 kind/라벨 같은
   UI 개념을 모르므로 여기서는 id 목록만 갖는다).
========================================================== */

const CUSTOMIZE_PAGE_IDS =
  [
    "cover",
    "profile"
  ];


/* =========================================================
   ACTION(text/button/image 공유)

   text.props.action / button.props.action / image.props.action이
   공통으로 쓰는 모양. renderer는 type이 "internal"이고 targetPageId가
   CUSTOMIZE_PAGE_IDS 중 하나일 때만 actions[targetPageId] 콜백을
   찾아 호출한다(호출 대상 자체를 지정하는 게 아니라 "어느 페이지로
   이동하는가"를 표현 — action 이름을 늘리는 대신 page id 목록만
   늘리면 되게 하기 위함).
========================================================== */

const CUSTOMIZE_ACTION_TYPE_VALUES =
  [
    "none",
    "link",
    "internal"
  ];

const CUSTOMIZE_DEFAULT_ACTION =
  {
    type: "none",
    href: "",
    targetPageId: "profile"
  };


/* =========================================================
   BLOCK DEFAULTS / ENUM / NUMERIC

   각 타입의 props 기본값과, 값이 허용 범위를 벗어났을 때
   validate-layout.js가 대신 채워 넣거나 clamp할 값을 정의한다.
========================================================== */

const CUSTOMIZE_BLOCK_DEFAULTS =
  {

    text: {
      props: {
        content: "",
        fontSize: 16,
        color: "",
        fontWeight: 400,
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.5,
        action: { ...CUSTOMIZE_DEFAULT_ACTION }
      },
      enums: {
        align: ["left", "center", "right"]
      },
      numeric: {
        fontSize: { min: 10, max: 96, default: 16, decimals: 0 },
        fontWeight: { min: 100, max: 900, default: 400, decimals: 0 },
        letterSpacing: { min: -2, max: 10, default: 0, decimals: 1 },
        lineHeight: { min: 1, max: 3, default: 1.5, decimals: 1 }
      },
      optionalColorFields: ["color"],
      contentFields: ["content"]
    },

    image: {
      props: {
        src: "",
        alt: "",
        width: "",
        height: "",
        maxWidth: "",
        align: "center",
        objectFit: "cover",
        action: { ...CUSTOMIZE_DEFAULT_ACTION }
      },
      enums: {
        align: ["left", "center", "right"],
        objectFit: ["cover", "contain", "fill"]
      },
      numeric: {
        width: { min: 40, max: 1200, default: "", decimals: 0, allowEmpty: true },
        height: { min: 40, max: 1200, default: "", decimals: 0, allowEmpty: true },
        maxWidth: { min: 40, max: 1200, default: "", decimals: 0, allowEmpty: true }
      },
      contentFields: ["src", "alt"]
    },

    /*
      width(가변 폭: number(px) | percent | "auto")는 아직 없음 —
      Carrd류 stack 레이아웃에서 container를 핵심 배치 단위로 쓰게
      되면 추가할 예정. maxWidth와는 독립된 필드로 나중에 추가
      가능하고(새 필드 추가는 버전을 안 올리는 기존 정책 그대로),
      지금 구조가 이를 막지 않는다 — 이번 범위에서는 만들지 않음.
    */

    container: {
      props: {
        direction: "column",
        align: "stretch",
        gap: 16,
        padding: 0,
        maxWidth: "",
        background: "",
        borderWidth: 0,
        borderColor: "",
        borderStyle: "solid",
        borderRadius: 0,
        backgroundOpacity: 100
      },
      enums: {
        direction: ["column", "row"],
        align: ["stretch", "start", "center", "end"],
        borderStyle: ["solid", "dashed", "dotted"]
      },
      numeric: {
        gap: { min: 0, max: 120, default: 16, decimals: 0 },
        padding: { min: 0, max: 120, default: 0, decimals: 0 },
        maxWidth: { min: 100, max: 1200, default: "", decimals: 0, allowEmpty: true },
        borderWidth: { min: 0, max: 20, default: 0, decimals: 0 },
        borderRadius: { min: 0, max: 200, default: 0, decimals: 0 },
        backgroundOpacity: { min: 0, max: 100, default: 100, decimals: 0 }
      },
      optionalColorFields: ["background", "borderColor"],
      allowsChildren: true,
      contentFields: []
    },

    /*
      variant는 그대로 유지한다 — button의 DOM 모양(<a> vs <button>)을
      결정하는 기존 필드이고, 이번 v2가 통합하는 건 href/targetPageId뿐
      이다(공유 action 객체로 이동). action.type은 image와 동일한
      shape를 쓰기 위해 존재하지만, button 렌더링은 계속 variant로
      분기한다 — editor가 variant를 바꿀 때 action.type도 같이
      맞춰써서(action↔internal, external↔link) 저장된 값끼리
      모순되지 않게 한다.
    */

    button: {
      props: {
        variant: "action",
        label: "",
        action: { type: "internal", href: "", targetPageId: "profile" },
        fontSize: 16,
        fontWeight: 600,
        color: "",
        align: "center"
      },
      enums: {
        variant: ["action", "external"],
        align: ["left", "center", "right"]
      },
      numeric: {
        fontSize: { min: 10, max: 96, default: 16, decimals: 0 },
        fontWeight: { min: 100, max: 900, default: 600, decimals: 0 }
      },
      optionalColorFields: ["color"],
      contentFields: ["label"]
    },

    spacer: {
      props: {
        height: 24
      },
      numeric: {
        height: { min: 0, max: 400, default: 24, decimals: 0 }
      },
      contentFields: []
    },

    divider: {
      props: {
        style: "solid",
        thickness: 1,
        color: "",
        widthPercent: 100
      },
      enums: {
        style: ["solid", "dashed", "dotted"]
      },
      numeric: {
        thickness: { min: 1, max: 20, default: 1, decimals: 0 },
        widthPercent: { min: 10, max: 100, default: 100, decimals: 0 }
      },
      optionalColorFields: ["color"],
      contentFields: []
    },

    /*
      allowsChildren을 일부러 안 씀 — columns는 children:[] 하나가
      아니라 최상위 columns:[](슬롯별 독립 children)를 쓰기 때문에
      container와 같은 취급을 받으면 안 된다(예: drag & drop의
      "container 내부로 inside drop" 판정이 그대로 columns에 적용되면
      안 되고, 반드시 슬롯 단위로만 drop 가능해야 함 — editor.js
      computeCustomizeDropTarget 참고). ratio는 슬롯 개수와 결합된
      값이라 numeric 스펙 대신 validate-layout.js의 전용 로직
      (normalizeCustomizeColumnsRatio)이 배열 통째로 검증한다.
    */

    columns: {
      props: {
        ratio: [...CUSTOMIZE_COLUMN_DEFAULT_RATIO],
        gap: 16,
        mobileLayout: "stack",
        verticalAlign: "start"
      },
      enums: {
        mobileLayout: ["stack", "columns"],
        verticalAlign: ["start", "center", "end"]
      },
      numeric: {
        gap: { min: 0, max: 120, default: 16, decimals: 0 }
      },
      contentFields: []
    }

  };


/* =========================================================
   테마 — enum 필드 허용값

   font는 block props와 동일한 enum 패턴(자유 문자열 금지,
   매핑 테이블은 render-layout.js가 보유). contentWidth는 v3에서
   theme을 떠나 contentArea.maxWidth(숫자 px)로 옮겨졌다 — 아래
   CUSTOMIZE_CONTENT_AREA_SCHEMA 참고.
========================================================== */

const CUSTOMIZE_THEME_FONT_VALUES =
  ["system", "serif", "mono"];


/* =========================================================
   배경 이미지 / 패턴(v3 후속, 사이트 공통 — theme.background와
   같은 스코프. 페이지별 override는 만들지 않는다)

   render-layout.js가 root(.customize-layout) 안에 독립된 두
   레이어(.customize-background-image / .customize-background-pattern)로
   그린다 — 이미지와 패턴이 서로 다른 opacity를 가져야 하는데
   CSS background-image는 레이어별 opacity를 지원하지 않기
   때문(각 레이어를 별도 엘리먼트로 두고 그 엘리먼트의 opacity를
   씀). 둘 다 "꺼짐" 상태(image.src 없음 / pattern.type==="none")를
   가질 수 있고, 그 경우 해당 레이어는 아무것도 그리지 않는다.
========================================================== */

const CUSTOMIZE_BACKGROUND_IMAGE_FIT_VALUES =
  ["cover", "contain", "repeat"];

const CUSTOMIZE_BACKGROUND_PATTERN_TYPE_VALUES =
  ["none", "dot", "grid"];

const CUSTOMIZE_DEFAULT_BACKGROUND_IMAGE =
  {
    src: "",
    opacity: 100,
    fit: "cover"
  };

const CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN =
  {
    type: "none",
    color: "",
    opacity: 100,
    size: 24
  };


/* =========================================================
   기본 테마

   background/textColor/point는 "#rrggbb" hex 값. textColor는
   luminance로 자동판별하지 않고 사용자가 직접 저장하는 명시값
   이다(theme-tokens.js 참고).
========================================================== */

const CUSTOMIZE_DEFAULT_THEME =
  {
    background: "#ffffff",
    textColor: "#1a1a1a",
    point: "#5c7cfa",
    font: "system",
    backgroundImage: { ...CUSTOMIZE_DEFAULT_BACKGROUND_IMAGE },
    backgroundPattern: { ...CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN }
  };


/* =========================================================
   CONTENT AREA(v3, 페이지별)

   theme과 달리 페이지마다 따로 저장/정규화된다(validate-layout.js
   validateCustomizeLayout이 페이지별 rawLayout.contentArea를
   정규화). renderer는 이 값을 .customize-layout(root)이 아니라
   그 안의 .customize-content-area에 적용한다 — root는 화면
   전체 폭/향후 배경 레이어를 담당하고, maxWidth/padding/좌우
   정렬은 content-area만의 책임이다(render-layout.js
   applyCustomizeContentAreaStyle 참고).

   fitViewport/verticalAlign만 예외적으로 root가 담당한다 —
   "화면 한 페이지를 다 채우는가"는 content-area가 아니라 root
   (페이지 전체 높이)의 문제이고, verticalAlign은 그 안에서
   content-area를 위/가운데/아래 중 어디에 둘지를 결정하기
   때문이다(render-layout.js applyCustomizeLayoutRootStyle 참고).
========================================================== */

const CUSTOMIZE_CONTENT_AREA_ALIGN_VALUES =
  ["left", "center", "right"];

const CUSTOMIZE_CONTENT_AREA_VERTICAL_ALIGN_VALUES =
  ["start", "center", "end"];

const CUSTOMIZE_CONTENT_AREA_SCHEMA =
  {
    props: {
      paddingY: 24,
      paddingX: 16,
      maxWidth: 600,
      align: "center",
      fitViewport: false,
      verticalAlign: "start"
    },
    numeric: {
      paddingY: { min: 0, max: 120, default: 24, decimals: 0 },
      paddingX: { min: 0, max: 120, default: 16, decimals: 0 },
      maxWidth: { min: 280, max: 1200, default: 600, decimals: 0, allowEmpty: true }
    },
    enums: {
      align: CUSTOMIZE_CONTENT_AREA_ALIGN_VALUES,
      verticalAlign: CUSTOMIZE_CONTENT_AREA_VERTICAL_ALIGN_VALUES
    },
    boolean: ["fitViewport"]
  };

const CUSTOMIZE_DEFAULT_CONTENT_AREA =
  { ...CUSTOMIZE_CONTENT_AREA_SCHEMA.props };
