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
   - 숫자 필드는 파싱 자체가 안 되면 기본값으로 폴백하고, 범위를
     벗어나면(파싱은 됨) 기본값이 아니라 min/max로 clamp한다 —
     "9999를 입력하면 최대 허용값이 된다"가 "16으로 리셋된다"보다
     사용자에게 자연스럽기 때문(v2, CUSTOMIZE_BLOCK_DEFAULTS[type].numeric
     참고).
   - 색상류 optionalColorFields는 빈 문자열이면 "테마 상속"으로
     그대로 두고, 값이 있는데 hex가 아니면 빈 문자열로 되돌린다.
   - plain text(props.content 등)는 항상 문자열로만 취급하고
     HTML로 해석하지 않는다(실제 HTML 이스케이프는 render-layout.js가
     textContent로 대입하는 시점에 보장됨 — 여기서는 문자열화만).
   - image/button의 외부 URL은 https만 허용, 그 외(http, data:,
     javascript: 등)는 제거한다.

   block-defaults.js가 먼저 로드되어 있어야 함(전역 상수 참조).
   theme-tokens.js가 먼저 로드되어 있어야 함(isValidCustomizeHexColor 참조).
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
   숫자 필드 정규화(v2)

   spec: { min, max, default, decimals, allowEmpty }.
   allowEmpty인 필드는 ""(또는 undefined/null)를 "값 없음/auto"로
   그대로 허용한다. 파싱 자체가 안 되면 default로 폴백(invalid-number),
   범위를 벗어나면 default가 아니라 min/max로 clamp한다(number-clamped).
========================================================== */

function normalizeCustomizeNumericField(
  rawValue,
  spec,
  path,
  errors
) {

  /*
    ""(명시적으로 저장된 빈 값)와 undefined/null(필드 자체가
    없음)을 구분한다 — 대부분의 allowEmpty 필드는 default가 이미
    ""라 둘을 구분하지 않아도 결과가 같았지만(image.width 등),
    default가 실제 값(예: contentArea.maxWidth=600)인 필드는 이
    구분이 필요하다: "명시적으로 제한 없음"은 그대로 ""를 유지하고,
    필드가 아예 없을 때만(신규/legacy 데이터) spec.default로
    채운다.
  */

  if (
    spec.allowEmpty &&
    rawValue === ""
  ) {

    return "";

  }

  if (
    spec.allowEmpty &&
    (
      rawValue === undefined ||
      rawValue === null
    )
  ) {

    return spec.default;

  }

  const parsed =
    typeof rawValue === "number"
      ? rawValue
      : (
          typeof rawValue === "string" &&
          rawValue.trim() !== ""
        )
        ? Number(rawValue)
        : NaN;

  if (
    !Number.isFinite(parsed)
  ) {

    pushCustomizeLayoutError(
      errors,
      path,
      "invalid-number",
      "숫자가 아니어서 기본값으로 대체됨"
    );

    return spec.default;

  }

  const clamped =
    Math.min(
      spec.max,
      Math.max(spec.min, parsed)
    );

  const roundingFactor =
    Math.pow(10, spec.decimals || 0);

  const rounded =
    Math.round(clamped * roundingFactor) / roundingFactor;

  if (
    parsed < spec.min ||
    parsed > spec.max
  ) {

    pushCustomizeLayoutError(
      errors,
      path,
      "number-clamped",
      `허용 범위(${spec.min}~${spec.max})를 벗어나 ${rounded}(으)로 조정됨`
    );

  }

  return rounded;

}


/* =========================================================
   optional color 필드 정규화(v2)

   빈 문자열 = "테마 CSS 변수 상속"(render-layout.js가 처리),
   유효한 hex면 그 값 그대로, 그 외(빈 문자열도 undefined도 아닌데
   hex가 아님)는 빈 문자열로 되돌리고 에러를 남긴다.
========================================================== */

function normalizeCustomizeOptionalColorField(
  rawValue,
  path,
  errors
) {

  if (
    rawValue === undefined ||
    rawValue === null ||
    rawValue === ""
  ) {

    return "";

  }

  if (
    isValidCustomizeHexColor(rawValue)
  ) {

    return rawValue;

  }

  pushCustomizeLayoutError(
    errors,
    path,
    "invalid-prop",
    "\"#rrggbb\" 형식이 아니어서 빈 값(테마 상속)으로 대체됨"
  );

  return "";

}


/* =========================================================
   action 정규화(v2, text/button/image 공유)

   text.props.action / button.props.action / image.props.action이
   공통으로 쓰는 { type, href, targetPageId } 모양. type이 "link"일
   때만 href를 https로 검증하고, "internal"일 때만 targetPageId를
   CUSTOMIZE_PAGE_IDS(실제 페이지 id 목록) allowlist로 검증한다 —
   나머지 조합의 값은 굳이 검사하지 않고 기본값으로 둔다(어차피
   렌더러가 type을 보고 무시함).
========================================================== */

function normalizeCustomizeAction(
  rawAction,
  path,
  errors
) {

  const source =
    (
      rawAction &&
      typeof rawAction === "object" &&
      !Array.isArray(rawAction)
    )
      ? rawAction
      : {};

  const type =
    CUSTOMIZE_ACTION_TYPE_VALUES.includes(source.type)
      ? source.type
      : CUSTOMIZE_DEFAULT_ACTION.type;

  if (
    !CUSTOMIZE_ACTION_TYPE_VALUES.includes(source.type)
  ) {

    pushCustomizeLayoutError(
      errors,
      `${path}.type`,
      "invalid-prop",
      "\"type\" 값이 허용된 범위를 벗어나 기본값으로 대체됨"
    );

  }


  let href =
    "";

  if (type === "link") {

    if (
      source.href === undefined ||
      source.href === null ||
      source.href === ""
    ) {

      href =
        "";

    } else if (
      isSafeCustomizeHttpsUrl(source.href)
    ) {

      href =
        source.href;

    } else {

      href =
        "";

      pushCustomizeLayoutError(
        errors,
        `${path}.href`,
        "unsafe-url",
        "\"href\"는 https URL만 허용되어 제거됨"
      );

    }

  }


  let targetPageId =
    CUSTOMIZE_DEFAULT_ACTION.targetPageId;

  if (type === "internal") {

    if (
      CUSTOMIZE_PAGE_IDS.includes(source.targetPageId)
    ) {

      targetPageId =
        source.targetPageId;

    } else {

      targetPageId =
        CUSTOMIZE_DEFAULT_ACTION.targetPageId;

      pushCustomizeLayoutError(
        errors,
        `${path}.targetPageId`,
        "invalid-prop",
        "\"targetPageId\" 값이 허용된 페이지 id 목록에 없어 기본값으로 대체됨"
      );

    }

  }


  return { type, href, targetPageId };

}


/* =========================================================
   props 정규화

   defaults.props를 기준으로 필드별 값을 검사하고, 필드 종류에
   따라(action/enum/URL/숫자/optional color/자유 문자열) 적절한
   방식으로 정규화한다.
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

      const numericSpec =
        schema.numeric?.[field];

      const rawValue =
        source[field];


      /* --------------------------------------------------
         action(text/button/image 공유) — { type, href, targetPageId }
      -------------------------------------------------- */

      if (field === "action") {

        normalized[field] =
          normalizeCustomizeAction(
            rawValue,
            `${path}.props.action`,
            errors
          );

        return;

      }


      /* --------------------------------------------------
         ratio(columns 전용) — 숫자 배열이라 numeric 스펙(스칼라
         전용)으로 다룰 수 없어 action처럼 별도 분기로 뺀다.
      -------------------------------------------------- */

      if (field === "ratio") {

        normalized[field] =
          normalizeCustomizeColumnsRatio(
            rawValue,
            `${path}.props.ratio`,
            errors
          );

        return;

      }


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
         URL 필드(image.src)

         비어 있는 값("")은 "아직 설정 안 함"으로 보고 그대로
         허용 — https가 아닌 값만 제거 대상. button의 href는
         v2부터 action.href로 이동해서 여기서 다루지 않는다.
      -------------------------------------------------- */

      if (
        type === "image" &&
        field === "src"
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
         숫자 필드(v2)
      -------------------------------------------------- */

      if (numericSpec) {

        normalized[field] =
          normalizeCustomizeNumericField(
            rawValue,
            numericSpec,
            `${path}.props.${field}`,
            errors
          );

        return;

      }


      /* --------------------------------------------------
         optional color 필드(v2) — 빈 문자열 = 테마 상속
      -------------------------------------------------- */

      if (
        schema.optionalColorFields?.includes(field)
      ) {

        normalized[field] =
          normalizeCustomizeOptionalColorField(
            rawValue,
            `${path}.props.${field}`,
            errors
          );

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
   columns 전용 정규화 — ratio 배열 / 슬롯 배열

   둘 다 CUSTOMIZE_COLUMN_COUNT(현재 2)에 결합돼 있어서 일반
   numeric/children 경로로 처리하지 않고 여기서 전용으로 다룬다.
========================================================== */

function normalizeCustomizeColumnsRatio(
  rawRatio,
  path,
  errors
) {

  const isValidShape =
    Array.isArray(rawRatio) &&
    rawRatio.length === CUSTOMIZE_COLUMN_COUNT &&
    rawRatio.every(
      (value) => typeof value === "number" && Number.isFinite(value)
    );

  if (!isValidShape) {

    if (rawRatio !== undefined) {

      pushCustomizeLayoutError(
        errors,
        path,
        "invalid-prop",
        `"ratio" 값이 올바르지 않아 기본값으로 대체됨`
      );

    }

    return [...CUSTOMIZE_COLUMN_DEFAULT_RATIO];

  }

  const minPercent =
    CUSTOMIZE_COLUMN_MIN_RATIO_PERCENT;

  const clamped =
    rawRatio.map(
      (value) =>
        Math.min(100 - minPercent, Math.max(minPercent, value))
    );

  const sum =
    clamped.reduce((total, value) => total + value, 0);

  if (sum <= 0) {
    return [...CUSTOMIZE_COLUMN_DEFAULT_RATIO];
  }

  const rescaled =
    clamped.map(
      (value) => Math.round((value / sum) * 100)
    );

  /* 반올림 오차 보정 — 마지막 값에 몰아서 합이 정확히 100이 되게 함 */

  const drift =
    100 - rescaled.reduce((total, value) => total + value, 0);

  rescaled[rescaled.length - 1] += drift;

  return rescaled;

}


function normalizeCustomizeColumnsSlots(
  rawColumns,
  depth,
  path,
  errors
) {

  const rawArray =
    Array.isArray(rawColumns)
      ? rawColumns
      : [];

  if (
    !Array.isArray(rawColumns) ||
    rawColumns.length !== CUSTOMIZE_COLUMN_COUNT
  ) {

    pushCustomizeLayoutError(
      errors,
      path,
      "invalid-columns",
      `columns는 정확히 ${CUSTOMIZE_COLUMN_COUNT}개의 슬롯이어야 하므로 보정됨`
    );

  }

  const slots =
    [];

  for (let index = 0; index < CUSTOMIZE_COLUMN_COUNT; index += 1) {

    const rawSlot =
      rawArray[index];

    const slotPath =
      `${path}[${index}]`;

    const id =
      isValidCustomizeBlockId(rawSlot?.id)
        ? rawSlot.id
        : generateCustomizeBlockId();

    if (
      rawSlot &&
      rawSlot.children !== undefined &&
      !Array.isArray(rawSlot.children)
    ) {

      pushCustomizeLayoutError(
        errors,
        `${slotPath}.children`,
        "invalid-children",
        "children이 배열이 아니어서 제거됨"
      );

    }

    const rawChildren =
      Array.isArray(rawSlot?.children)
        ? rawSlot.children
        : [];

    const children =
      rawChildren
        .map(
          (childBlock, childIndex) =>
            normalizeCustomizeBlock(
              childBlock,
              depth + 1,
              `${slotPath}.children[${childIndex}]`,
              errors
            )
        )
        .filter(
          (childBlock) => childBlock !== null
        );

    slots.push({ id, children });

  }

  return slots;

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
     columns — children이 아니라 최상위 columns:[](슬롯별
     독립 children)를 씀. block-defaults.js
     getCustomizeBlockChildLists 주석 참고.
  -------------------------------------------------- */

  if (rawBlock.type === "columns") {

    normalizedBlock.columns =
      normalizeCustomizeColumnsSlots(
        rawBlock.columns,
        depth,
        `${path}.columns`,
        errors
      );

    return normalizedBlock;

  }


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

   hex 필드(background/textColor/point)와 enum 필드(font)를
   각각 검증하고, 벗어난 값은 해당 필드만 CUSTOMIZE_DEFAULT_THEME
   기본값으로 대체한다(다른 필드는 그대로 유지) — block props와
   동일한 원칙. contentWidth는 v3부터 theme이 아니라 contentArea
   소관(아래 normalizeCustomizeContentArea 참고).
========================================================== */

const CUSTOMIZE_THEME_HEX_FIELDS =
  ["background", "textColor", "point"];

const CUSTOMIZE_THEME_ENUM_FIELDS =
  {
    font: CUSTOMIZE_THEME_FONT_VALUES
  };


/* =========================================================
   theme.backgroundImage / theme.backgroundPattern 정규화(v3 후속)

   contentArea 숫자 필드와 같은 원칙: 필드 자체가(또는 하위
   필드가) 아예 없으면 "아직 설정 안 함"으로 보고 조용히 기본값을
   채우고(errors 기록 안 함), 필드가 있는데 값이 잘못된 경우에만
   errors를 남긴다. src는 image.src와 동일하게 https만 허용.
========================================================== */

function normalizeCustomizeBackgroundImage(
  rawImage,
  errors
) {

  const source =
    (
      rawImage &&
      typeof rawImage === "object"
    )
      ? rawImage
      : {};


  let src =
    CUSTOMIZE_DEFAULT_BACKGROUND_IMAGE.src;

  if (
    source.src === undefined ||
    source.src === null ||
    source.src === ""
  ) {

    src =
      "";

  } else if (
    isSafeCustomizeHttpsUrl(source.src)
  ) {

    src =
      source.src;

  } else {

    src =
      "";

    pushCustomizeLayoutError(
      errors,
      "theme.backgroundImage.src",
      "unsafe-url",
      "\"src\"는 https URL만 허용되어 제거됨"
    );

  }


  const opacity =
    source.opacity === undefined
      ? CUSTOMIZE_DEFAULT_BACKGROUND_IMAGE.opacity
      : normalizeCustomizeNumericField(
          source.opacity,
          { min: 0, max: 100, default: CUSTOMIZE_DEFAULT_BACKGROUND_IMAGE.opacity, decimals: 0 },
          "theme.backgroundImage.opacity",
          errors
        );


  let fit =
    CUSTOMIZE_DEFAULT_BACKGROUND_IMAGE.fit;

  if (
    source.fit !== undefined
  ) {

    if (
      CUSTOMIZE_BACKGROUND_IMAGE_FIT_VALUES.includes(source.fit)
    ) {

      fit =
        source.fit;

    } else {

      pushCustomizeLayoutError(
        errors,
        "theme.backgroundImage.fit",
        "invalid-prop",
        "\"fit\" 값이 허용된 범위를 벗어나 기본값으로 대체됨"
      );

    }

  }


  return { src, opacity, fit };

}


function normalizeCustomizeBackgroundPattern(
  rawPattern,
  errors
) {

  const source =
    (
      rawPattern &&
      typeof rawPattern === "object"
    )
      ? rawPattern
      : {};


  let type =
    CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN.type;

  if (
    source.type !== undefined
  ) {

    if (
      CUSTOMIZE_BACKGROUND_PATTERN_TYPE_VALUES.includes(source.type)
    ) {

      type =
        source.type;

    } else {

      pushCustomizeLayoutError(
        errors,
        "theme.backgroundPattern.type",
        "invalid-prop",
        "\"type\" 값이 허용된 범위를 벗어나 기본값으로 대체됨"
      );

    }

  }


  const color =
    normalizeCustomizeOptionalColorField(
      source.color,
      "theme.backgroundPattern.color",
      errors
    );


  const opacity =
    source.opacity === undefined
      ? CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN.opacity
      : normalizeCustomizeNumericField(
          source.opacity,
          { min: 0, max: 100, default: CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN.opacity, decimals: 0 },
          "theme.backgroundPattern.opacity",
          errors
        );


  const size =
    source.size === undefined
      ? CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN.size
      : normalizeCustomizeNumericField(
          source.size,
          { min: 4, max: 120, default: CUSTOMIZE_DEFAULT_BACKGROUND_PATTERN.size, decimals: 0 },
          "theme.backgroundPattern.size",
          errors
        );


  return { type, color, opacity, size };

}


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


  CUSTOMIZE_THEME_HEX_FIELDS.forEach(
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


  Object.keys(CUSTOMIZE_THEME_ENUM_FIELDS).forEach(
    (field) => {

      const allowedValues =
        CUSTOMIZE_THEME_ENUM_FIELDS[field];

      if (
        allowedValues.includes(source[field])
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
            `theme.${field} 값이 허용된 범위를 벗어나 기본값으로 대체됨`
          );

        }

      }

    }
  );


  normalized.backgroundImage =
    normalizeCustomizeBackgroundImage(
      source.backgroundImage,
      errors
    );

  normalized.backgroundPattern =
    normalizeCustomizeBackgroundPattern(
      source.backgroundPattern,
      errors
    );


  return normalized;

}


/* =========================================================
   contentArea 정규화(v3, 페이지별)

   theme과 같은 구조(hex 대신 numeric/enum/boolean 필드)로,
   normalizeCustomizeTheme과 동일한 원칙을 따른다 — 벗어난
   값은 해당 필드만 CUSTOMIZE_DEFAULT_CONTENT_AREA로 대체하고
   errors에 기록한다. numeric 필드는 기존
   normalizeCustomizeNumericField를 그대로 재사용한다(maxWidth는
   allowEmpty:true라 ""를 "제한 없음"으로 그대로 허용).
========================================================== */

function normalizeCustomizeBooleanField(
  rawValue,
  defaultValue,
  path,
  errors
) {

  if (
    typeof rawValue === "boolean"
  ) {

    return rawValue;

  }

  if (
    rawValue !== undefined
  ) {

    pushCustomizeLayoutError(
      errors,
      path,
      "invalid-prop",
      "true/false가 아니어서 기본값으로 대체됨"
    );

  }

  return defaultValue;

}


function normalizeCustomizeContentArea(
  rawContentArea,
  errors
) {

  const source =
    (
      rawContentArea &&
      typeof rawContentArea === "object"
    )
      ? rawContentArea
      : {};

  const normalized =
    {};

  const schema =
    CUSTOMIZE_CONTENT_AREA_SCHEMA;


  Object.keys(schema.numeric).forEach(
    (field) => {

      /*
        theme과 마찬가지로 contentArea 자체(또는 개별 필드)가
        아예 없는 경우는 "아직 커스터마이즈 안 한 페이지"로 보고
        조용히 기본값을 채운다(errors 기록 안 함) — 필드가
        존재하는데 값이 잘못된 경우에만 normalizeCustomizeNumericField가
        errors를 기록한다. block props(항상 전체 필드가 채워져
        저장된다고 가정)와 달리 contentArea는 부분/누락이 정상
        상태이기 때문.
      */

      if (
        source[field] === undefined
      ) {

        normalized[field] =
          CUSTOMIZE_DEFAULT_CONTENT_AREA[field];

        return;

      }

      normalized[field] =
        normalizeCustomizeNumericField(
          source[field],
          schema.numeric[field],
          `contentArea.${field}`,
          errors
        );

    }
  );


  Object.keys(schema.enums).forEach(
    (field) => {

      const allowedValues =
        schema.enums[field];

      if (
        allowedValues.includes(source[field])
      ) {

        normalized[field] =
          source[field];

      } else {

        normalized[field] =
          CUSTOMIZE_DEFAULT_CONTENT_AREA[field];

        if (
          source[field] !== undefined
        ) {

          pushCustomizeLayoutError(
            errors,
            `contentArea.${field}`,
            "invalid-prop",
            `contentArea.${field} 값이 허용된 범위를 벗어나 기본값으로 대체됨`
          );

        }

      }

    }
  );


  schema.boolean.forEach(
    (field) => {

      normalized[field] =
        normalizeCustomizeBooleanField(
          source[field],
          CUSTOMIZE_DEFAULT_CONTENT_AREA[field],
          `contentArea.${field}`,
          errors
        );

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
        contentArea: { ...CUSTOMIZE_DEFAULT_CONTENT_AREA },
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
        contentArea: { ...CUSTOMIZE_DEFAULT_CONTENT_AREA },
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

  const contentArea =
    normalizeCustomizeContentArea(
      rawLayout.contentArea,
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
      contentArea,
      blocks
    },
    valid: errors.length === 0,
    errors
  };

}
