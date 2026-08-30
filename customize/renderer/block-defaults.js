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
========================================================== */

/**
 * @typedef {Object} CustomizeTheme
 * @property {string} background - "#rrggbb"
 * @property {string} point - "#rrggbb"
 */

/**
 * @typedef {Object} CustomizeBlock
 * @property {string} id - 전체 UUID(crypto.randomUUID() 그대로,
 *   앞 8자리 등으로 자르지 않음 — reorder/duplicate/undo·redo/
 *   migration에서 장기적으로 안정적인 id를 유지하기 위함).
 * @property {string} type - CUSTOMIZE_ALLOWED_BLOCK_TYPES 중 하나.
 * @property {Object} props - 타입별 props(CUSTOMIZE_BLOCK_DEFAULTS 참고).
 * @property {CustomizeBlock[]} [children] - container 타입만 허용.
 */

/**
 * @typedef {Object} CustomizeLayout
 * @property {number} version - CUSTOMIZE_LAYOUT_VERSION.
 * @property {CustomizeTheme} [theme]
 * @property {CustomizeBlock[]} blocks
 */


/* =========================================================
   LAYOUT VERSION
========================================================== */

const CUSTOMIZE_LAYOUT_VERSION =
  1;


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
    "divider"
  ];


/* container만 children을 가질 수 있음 */

const CUSTOMIZE_CONTAINER_BLOCK_TYPE =
  "container";


/* =========================================================
   BUTTON ACTION ALLOWLIST

   renderer는 이 이름 중 하나일 때만 actions[actionName]
   콜백을 찾아 호출한다. 1차 구현은 openProfile 하나뿐.
========================================================== */

const CUSTOMIZE_ALLOWED_ACTION_NAMES =
  [
    "openProfile"
  ];


/* =========================================================
   BLOCK DEFAULTS / ENUM

   각 타입의 props 기본값과, 값이 허용 범위를 벗어났을 때
   validate-layout.js가 대신 채워 넣을 값(defaults)을 정의한다.
   enums가 없는 필드(자유 문자열 등)는 별도 처리한다.
========================================================== */

const CUSTOMIZE_BLOCK_DEFAULTS =
  {

    text: {
      props: {
        content: "",
        size: "md",
        align: "left"
      },
      enums: {
        size: ["sm", "md", "lg"],
        align: ["left", "center", "right"]
      }
    },

    image: {
      props: {
        src: "",
        alt: "",
        ratio: "square"
      },
      enums: {
        ratio: ["square", "portrait", "landscape"]
      }
    },

    container: {
      props: {
        direction: "column",
        gap: "md"
      },
      enums: {
        direction: ["column", "row"],
        gap: ["sm", "md", "lg"]
      },
      allowsChildren: true
    },

    button: {
      props: {
        variant: "action",
        label: "",
        actionName: "openProfile",
        href: ""
      },
      enums: {
        variant: ["action", "external"]
      }
    },

    spacer: {
      props: {
        size: "md"
      },
      enums: {
        size: ["sm", "md", "lg"]
      }
    },

    divider: {
      props: {
        style: "solid"
      },
      enums: {
        style: ["solid", "dashed"]
      }
    }

  };


/* =========================================================
   기본 테마
========================================================== */

const CUSTOMIZE_DEFAULT_THEME =
  {
    background: "#ffffff",
    point: "#5c7cfa"
  };
