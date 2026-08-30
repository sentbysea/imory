/* =========================================================
   CUSTOMIZE RENDERER - LAYOUT VALIDATION

   저장/로드되는 layout_json(아직 DB에는 없음 — 이번 단계는
   순수 함수만)을 검증/정규화한다.

   원칙:
   - 입력 객체를 절대 mutation하지 않는다(항상 새 객체/배열을
     만들어 반환).
   - depth 초과 구조를 자동으로 얕게 펴서(flatten) 우겨넣지
     않는다 — 초과 branch는 명시적으로 invalid 처리하고
     제거하며, errors에 기록한다.
   - 알 수 없는 block type은 조용히 통과시키지 않고 제거 +
     errors 기록(renderer 쪽에서도 별도로 방어함, render-layout.js
     참고).
   - props의 개별 값이 enum/형식을 벗어나면 해당 필드만 기본값으로
     대체한다(블록 전체를 버리지 않음) — 단, 이 경우도 errors에
     남겨서 "조용한 변형"이 되지 않게 한다.
   - plain text(props.content 등)는 항상 문자열로만 취급하고
     HTML로 해석하지 않는다(실제 HTML 이스케이프는 render-layout.js가
     textContent로 대입하는 시점에 보장됨 — 여기서는 문자열화만).
   - image/button의 외부 URL은 https만 허용, 그 외(http, data:,
     javascript: 등)는 제거한다.

   block-defaults.js가 먼저 로드되어 있어야 함(전역 상수 참조).
========================================================== */

/* =========================================================
   URL
========================================================== */

function isSafeCustomizeHttpsUrl(
  value
) {

  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    return false;
  }

  try {

    const parsed =
      new URL(value);

    return (
      parsed.protocol === "https:"
    );

  } catch (error) {

    return false;

  }

}


/* =========================================================
   id

   전체 UUID를 그대로 사용(앞 8자리 등으로 자르지 않음) —
   reorder/duplicate/undo·redo/migration에서 id가 장기적으로
   안정적으로 유지되어야 하기 때문.
========================================================== */

function generateCustomizeBlockId() {

  return crypto.randomUUID();

}


function isValidCustomizeBlockId(
  value
) {

  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value)
  );

}


/* =========================================================
   errors 헬퍼
========================================================== */

function pushCustomizeLayoutError(
  errors,
  path,
  code,
  message
) {

  errors.push(
    {
      path,
      code,
      message
    }
  );

}


/* =========================================================
   props 정규화

   defaults.props를 기준으로 필드별 값을 검사하고, enum을
   벗어나거나 타입이 다르면 기본값으로 대체한다.
========================================================== */

function normalizeCustomizeBlockProps(
  type,
  rawProps,
  path,
  errors
) {

  const schema =
    CUSTOMIZE_BLOCK_DEFAULTS[type];

  const source =
    (
      rawProps &&
      typeof rawProps === "object" &&
      !Array.isArray(rawProps)
    )
      ? rawProps
      : {};

  const normalized =
    {};


  Object.keys(schema.props).forEach(
    (field) => {

      const defaultValue =
        schema.props[field];

      const enumValues =
        schema.enums?.[field];

      const rawValue =
        source[field];


      /* --------------------------------------------------
         enum 필드
      -------------------------------------------------- */

      if (enumValues) {

        if (
          enumValues.includes(rawValue)
        ) {

          normalized[field] =
            rawValue;

        } else {

          normalized[field] =
            defaultValue;

          pushCustomizeLayoutError(
            errors,
            `${path}.props.${field}`,
            "invalid-prop",
            `"${field}" 값이 허용된 범위를 벗어나 기본값으로 대체됨`
          );

        }

        return;

      }


      /* --------------------------------------------------
         URL 필드(image.src, button.href)

         비어 있는 값("")은 "아직 설정 안 함"으로 보고 그대로
         허용 — https가 아닌 값만 제거 대상.
      -------------------------------------------------- */

      if (
        (type === "image" && field === "src") ||
        (type === "button" && field === "href")
      ) {

        if (
          rawValue === undefined ||
          rawValue === null ||
          rawValue === ""
        ) {

          normalized[field] =
            "";

          return;

        }

        if (
          isSafeCustomizeHttpsUrl(rawValue)
        ) {

          normalized[field] =
            rawValue;

        } else {

          normalized[field] =
            "";

          pushCustomizeLayoutError(
            errors,
            `${path}.props.${field}`,
            "unsafe-url",
            `"${field}"는 https URL만 허용되어 제거됨`
          );

        }

        return;

      }


      /* --------------------------------------------------
         button.actionName

         허용된 action 이름이 아니면 기본값(openProfile)으로
         대체 — 실제 콜백 존재 여부는 render-layout.js가
         actions 객체를 보고 판단.
      -------------------------------------------------- */

      if (
        type === "button" &&
        field === "actionName"
      ) {

        if (
          CUSTOMIZE_ALLOWED_ACTION_NAMES.includes(rawValue)
        ) {

          normalized[field] =
            rawValue;

        } else {

          normalized[field] =
            defaultValue;

          pushCustomizeLayoutError(
            errors,
            `${path}.props.${field}`,
            "invalid-prop",
            `"${field}" 값이 허용된 action 목록에 없어 기본값으로 대체됨`
          );

        }

        return;

      }


      /* --------------------------------------------------
         자유 문자열 필드(text.content, image.alt, button.label)

         HTML로 해석하지 않고 항상 문자열로만 취급.
      -------------------------------------------------- */

      normalized[field] =
        typeof rawValue === "string"
          ? rawValue
          : defaultValue;

    }
  );


  return normalized;

}


/* =========================================================
   block 정규화(재귀)
========================================================== */

function normalizeCustomizeBlock(
  rawBlock,
  depth,
  path,
  errors
) {

  if (
    !rawBlock ||
    typeof rawBlock !== "object" ||
    Array.isArray(rawBlock)
  ) {

    pushCustomizeLayoutError(
      errors,
      path,
      "invalid-block",
      "block이 객체가 아니어서 제거됨"
    );

    return null;

  }


  if (
    !CUSTOMIZE_ALLOWED_BLOCK_TYPES.includes(rawBlock.type)
  ) {

    pushCustomizeLayoutError(
      errors,
      path,
      "unknown-block-type",
      `알 수 없는 block type("${rawBlock.type}")이라 제거됨`
    );

    return null;

  }


  if (
    depth > CUSTOMIZE_MAX_BLOCK_DEPTH
  ) {

    pushCustomizeLayoutError(
      errors,
      path,
      "depth-exceeded",
      `허용된 nesting depth(${CUSTOMIZE_MAX_BLOCK_DEPTH})를 초과해 branch가 제거됨`
    );

    return null;

  }


  const id =
    isValidCustomizeBlockId(rawBlock.id)
      ? rawBlock.id
      : generateCustomizeBlockId();

  if (
    !isValidCustomizeBlockId(rawBlock.id)
  ) {

    pushCustomizeLayoutError(
      errors,
      `${path}.id`,
      "invalid-id",
      "id가 없거나 유효한 UUID가 아니어서 새로 생성됨"
    );

  }


  const schema =
    CUSTOMIZE_BLOCK_DEFAULTS[rawBlock.type];

  const props =
    normalizeCustomizeBlockProps(
      rawBlock.type,
      rawBlock.props,
      path,
      errors
    );


  const normalizedBlock =
    {
      id,
      type: rawBlock.type,
      props
    };


  /* --------------------------------------------------
     children — container만 허용
  -------------------------------------------------- */

  if (
    rawBlock.children !== undefined
  ) {

    if (!schema.allowsChildren) {

      pushCustomizeLayoutError(
        errors,
        `${path}.children`,
        "children-not-allowed",
        `"${rawBlock.type}" 타입은 children을 가질 수 없어 제거됨`
      );

    } else if (
      !Array.isArray(rawBlock.children)
    ) {

      pushCustomizeLayoutError(
        errors,
        `${path}.children`,
        "invalid-children",
        "children이 배열이 아니어서 제거됨"
      );

    } else {

      const children =
        rawBlock.children
          .map(
            (childBlock, index) =>
              normalizeCustomizeBlock(
                childBlock,
                depth + 1,
                `${path}.children[${index}]`,
                errors
              )
          )
          .filter(
            (childBlock) => childBlock !== null
          );

      normalizedBlock.children =
        children;

    }

  } else if (schema.allowsChildren) {

    normalizedBlock.children =
      [];

  }


  return normalizedBlock;

}


/* =========================================================
   theme 정규화
========================================================== */

function normalizeCustomizeTheme(
  rawTheme,
  errors
) {

  const source =
    (
      rawTheme &&
      typeof rawTheme === "object"
    )
      ? rawTheme
      : {};

  const normalized =
    {};


  ["background", "point"].forEach(
    (field) => {

      if (
        isValidCustomizeHexColor(source[field])
      ) {

        normalized[field] =
          source[field];

      } else {

        normalized[field] =
          CUSTOMIZE_DEFAULT_THEME[field];

        if (
          source[field] !== undefined
        ) {

          pushCustomizeLayoutError(
            errors,
            `theme.${field}`,
            "invalid-prop",
            `theme.${field}가 "#rrggbb" 형식이 아니어서 기본값으로 대체됨`
          );

        }

      }

    }
  );


  return normalized;

}


/* =========================================================
   validateCustomizeLayout

   입력: 임의의 값(신뢰할 수 없는 raw layout_json).
   출력: {
     layout: CustomizeLayout(항상 사용 가능한 정규화된 결과),
     valid: boolean(errors가 하나도 없었는지),
     errors: { path, code, message }[]
   }

   입력 객체는 어떤 경우에도 mutation하지 않는다.
========================================================== */

function validateCustomizeLayout(
  rawLayout
) {

  const errors =
    [];


  if (
    !rawLayout ||
    typeof rawLayout !== "object" ||
    Array.isArray(rawLayout)
  ) {

    pushCustomizeLayoutError(
      errors,
      "$",
      "invalid-root",
      "layout이 객체가 아니어서 빈 레이아웃으로 대체됨"
    );

    return {
      layout: {
        version: CUSTOMIZE_LAYOUT_VERSION,
        theme: { ...CUSTOMIZE_DEFAULT_THEME },
        blocks: []
      },
      valid: false,
      errors
    };

  }


  if (
    rawLayout.version !== CUSTOMIZE_LAYOUT_VERSION
  ) {

    /*
      아직 migration 로직이 없으므로, 지원 버전이 아니면
      추측해서 마이그레이션하지 않고 빈 레이아웃으로 대체한다.
    */

    pushCustomizeLayoutError(
      errors,
      "version",
      "unsupported-version",
      `지원하지 않는 layout version("${rawLayout.version}")이라 빈 레이아웃으로 대체됨`
    );

    return {
      layout: {
        version: CUSTOMIZE_LAYOUT_VERSION,
        theme: { ...CUSTOMIZE_DEFAULT_THEME },
        blocks: []
      },
      valid: false,
      errors
    };

  }


  const theme =
    normalizeCustomizeTheme(
      rawLayout.theme,
      errors
    );


  const rawBlocks =
    Array.isArray(rawLayout.blocks)
      ? rawLayout.blocks
      : null;

  if (!rawBlocks) {

    pushCustomizeLayoutError(
      errors,
      "blocks",
      "invalid-blocks",
      "blocks가 배열이 아니어서 빈 배열로 대체됨"
    );

  }


  const blocks =
    (rawBlocks || [])
      .map(
        (rawBlock, index) =>
          normalizeCustomizeBlock(
            rawBlock,
            1,
            `blocks[${index}]`,
            errors
          )
      )
      .filter(
        (block) => block !== null
      );


  return {
    layout: {
      version: CUSTOMIZE_LAYOUT_VERSION,
      theme,
      blocks
    },
    valid: errors.length === 0,
    errors
  };

}
