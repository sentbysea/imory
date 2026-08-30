/* =========================================================
   CUSTOMIZE RENDERER - COMMON RENDERER

   contract:

     renderCustomizeLayout({ container, blocks, theme, contentArea, mode, actions })
       → { update(nextBlocks, nextTheme, nextContentArea), destroy() }

   1차 구현 범위:
   - text / image / container / button / spacer / divider
   - update()는 DOM diff 없이 mount 내부를 통째로 다시 렌더한다
     (block 수가 적은 동안은 충분 — 성능 문제가 실제로 확인된
     뒤에 최적화).
   - editor 전용 선택/드래그 UI는 없음.
   - renderer는 core/view-controller.js를 직접 호출하지 않는다.
     text/button/image의 action은 actions[targetPageId] 콜백만 호출한다.
   - document-agnostic: container.ownerDocument로 자기 문서를
     찾기 때문에, 부모 문서의 element든 iframe 안 element든 그대로
     넘겨도 동작한다(customize/editor의 device preview가 이 성질을
     그대로 활용 — 이 파일 자체는 device preview 때문에 바뀔 게
     없음).

   block-defaults.js / theme-tokens.js / validate-layout.js보다
   뒤에 로드되어야 함(전역 상수/함수 참조). 다만 이 파일 자체는
   "이미 validateCustomizeLayout을 거친 blocks"를 받는다고
   가정하면서도, 방어적으로 자체 depth/type 체크를 한 번 더
   한다 — 검증 없이 임의 데이터가 곧장 들어오는 경우(예: 이번
   단계의 테스트 harness)에도 조용히 죽거나 잘못된 DOM을 만들지
   않기 위함.

   v2: text/container/spacer/divider/image가 S/M/L enum 대신
   숫자 props를 쓰도록 바뀌었고(block-defaults.js 참고), button의
   href/actionName이 button/image가 공유하는 action 객체로
   옮겨졌다. button은 여전히 variant로 DOM 모양(<a> vs <button>)을
   결정한다 — 이번 변경은 값을 어디서 읽는지만 바꿨을 뿐 그
   분기 자체는 그대로.

   v2 후속: action.actionName → action.targetPageId로 이름을
   바꾸고(block-defaults.js 참고), text에도 image와 동일한 방식의
   action을 추가했다 — text는 action.type에 따라 자기 자신을
   <a>(link) 또는 role=button 요소(internal)로 렌더한다(별도
   wrapper 없이 태그 자체를 바꿈 — crop box가 있는 image와 달리
   text는 렌더 노드가 하나뿐이라 그게 더 단순함).

   v3: root(.customize-layout) 안에 content-area(.customize-content-area)
   노드를 새로 두고 blocks는 이제 root가 아니라 content-area
   안에 렌더한다 — root는 화면 전체 폭/배경/fitViewport 높이,
   content-area는 maxWidth/padding/좌우 정렬을 담당(책임 분리,
   block-defaults.js CUSTOMIZE_CONTENT_AREA_SCHEMA 참고). container
   block에는 borderRadius/backgroundOpacity가 추가됐다.

   v3 후속: theme.background(hex)를 root 자신의 background-color로
   직접 칠한다(이전에는 어디에도 칠해지지 않던 결함을 여기서 고침).
   theme.backgroundImage/backgroundPattern은 root 안의 독립된 두
   레이어(.customize-background-image / .customize-background-pattern,
   content-area보다 z-index가 낮음)로 그린다 — 사이트 전체 공통이며
   페이지별 override는 없다(applyCustomizeBackgroundLayers 참고).
========================================================== */

/* =========================================================
   theme.font 매핑

   block enum과 달리 이건 계속 enum이다(v2 스코프 밖) — 자유
   문자열이 아니라 허용값을 실제 CSS 값으로 매핑. root
   (.customize-layout)에만 인라인 style로 적용하고, 시스템
   전역 CSS는 건드리지 않는다.
========================================================== */

const CUSTOMIZE_RENDER_FONT_STACK =
  {
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif: "Georgia, 'Noto Serif KR', serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
  };


/* =========================================================
   contentArea.verticalAlign → justify-content 매핑(v3, root 전용)
========================================================== */

const CUSTOMIZE_RENDER_VERTICAL_ALIGN_JUSTIFY =
  {
    start: "flex-start",
    center: "center",
    end: "flex-end"
  };


/* =========================================================
   테마 적용

   container 자신에게만 CSS 커스텀 프로퍼티를 건다 — 시스템
   전역 CSS/다른 mount에는 영향 없음.
========================================================== */

function applyCustomizeThemeTokens(
  container,
  theme
) {

  const tokens =
    computeCustomizeThemeTokens(theme);

  Object.keys(tokens).forEach(
    (name) => {

      container.style.setProperty(
        name,
        tokens[name]
      );

    }
  );

}


function clearCustomizeThemeTokens(
  container
) {

  CUSTOMIZE_THEME_TOKEN_NAMES.forEach(
    (name) => {

      container.style.removeProperty(name);

    }
  );

}


/* =========================================================
   root(.customize-layout) 스타일(v3)

   root는 "PAGE/BACKGROUND" 레이어 — 화면 전체 폭과(향후) 배경
   레이어, fitViewport일 때의 페이지 전체 높이만 담당한다. 여기에
   maxWidth/margin을 절대 걸지 않는다 — 전체화면 배경 이미지/도트/
   모눈 배경이 콘텐츠 폭에 맞춰 좁아지는 걸 피하기 위함(폭/여백/
   좌우 정렬은 아래 applyCustomizeContentAreaStyle의 책임).

   fitViewport===true면 root를 flex column으로 만들어 min-height를
   실제 device viewport 높이(100dvh)로 채우고, verticalAlign을
   justify-content로 매핑해 유일한 flex child인 content-area를
   위/가운데/아래에 배치한다. 콘텐츠가 viewport보다 길면 flex
   container는 min-height를 넘어 자연스럽게 늘어나 페이지가
   길어지고 스크롤된다(브라우저 기본 동작 — 별도 처리 불필요).
========================================================== */

function applyCustomizeLayoutRootStyle(
  root,
  theme,
  contentArea
) {

  /*
    배경 레이어(.customize-background-image / -pattern)가
    position:absolute; inset:0으로 root 기준에 맞춰 깔리려면
    root 자신이 positioning context여야 한다 — 항상 고정.
  */

  root.style.position =
    "relative";

  root.style.fontFamily =
    CUSTOMIZE_RENDER_FONT_STACK[theme?.font]
      || CUSTOMIZE_RENDER_FONT_STACK.system;

  if (contentArea?.fitViewport) {

    root.style.minHeight =
      "100dvh";

    root.style.display =
      "flex";

    root.style.flexDirection =
      "column";

    root.style.justifyContent =
      CUSTOMIZE_RENDER_VERTICAL_ALIGN_JUSTIFY[contentArea.verticalAlign]
        || CUSTOMIZE_RENDER_VERTICAL_ALIGN_JUSTIFY.start;

  } else {

    root.style.minHeight =
      "";

    root.style.display =
      "";

    root.style.flexDirection =
      "";

    root.style.justifyContent =
      "";

  }

}


/* =========================================================
   content-area(.customize-content-area) 스타일(v3)

   maxWidth/padding/좌우 정렬 + blocks 배치를 담당한다. maxWidth가
   ""(allowEmpty)면 제한 없음("none") — root 폭 그대로 채운다.
   align은 image align과 동일한 margin 조합 패턴(flex column의
   cross-axis에서도 auto margin은 표준대로 그 축 정렬에 작동한다).
========================================================== */

function applyCustomizeContentAreaStyle(
  contentAreaEl,
  contentArea
) {

  /*
    배경 레이어보다 항상 위에 그려져야 한다 — position:relative +
    z-index로 stacking을 명시적으로 고정(DOM 순서에만 기대지 않음).
  */

  contentAreaEl.style.position =
    "relative";

  contentAreaEl.style.zIndex =
    "1";

  contentAreaEl.style.boxSizing =
    "border-box";

  contentAreaEl.style.maxWidth =
    isCustomizeNumberSet(contentArea?.maxWidth)
      ? `${contentArea.maxWidth}px`
      : "none";

  contentAreaEl.style.paddingTop =
    contentAreaEl.style.paddingBottom =
      `${contentArea?.paddingY ?? 0}px`;

  contentAreaEl.style.paddingLeft =
    contentAreaEl.style.paddingRight =
      `${contentArea?.paddingX ?? 0}px`;

  if (contentArea?.align === "left") {

    contentAreaEl.style.marginLeft =
      "0";

    contentAreaEl.style.marginRight =
      "auto";

  } else if (contentArea?.align === "right") {

    contentAreaEl.style.marginLeft =
      "auto";

    contentAreaEl.style.marginRight =
      "0";

  } else {

    contentAreaEl.style.marginLeft =
      "auto";

    contentAreaEl.style.marginRight =
      "auto";

  }

}


/* =========================================================
   배경 레이어 스타일(v3 후속, root 전용, 사이트 공통)

   root(.customize-layout) 자신은 theme.background(hex)를 직접
   칠한다. theme.backgroundImage/backgroundPattern은 각각 독립된
   엘리먼트(backgroundImageEl/backgroundPatternEl — renderCustomizeLayout이
   root 생성 직후 만들어 content-area보다 앞에 넣어둔 것)에 그려서
   서로 다른 opacity를 가질 수 있게 한다(CSS background-image는
   레이어별 opacity를 지원하지 않음). 두 엘리먼트 모두 "꺼짐"
   상태(src 없음 / type==="none")면 아무것도 그리지 않는다 —
   매번 전체 스타일을 새로 계산해서 대입하므로(이전 상태를 보고
   조건부로만 지우는 방식이 아님) 꺼짐→켜짐→꺼짐 전환에도 잔여
   스타일이 남지 않는다.
========================================================== */

function buildCustomizeDotPatternImage(
  color
) {

  return (
    `radial-gradient(circle, ${color} 1.5px, transparent 1.5px)`
  );

}

function buildCustomizeGridPatternImage(
  color
) {

  return (
    `linear-gradient(to right, ${color} 1px, transparent 1px), ` +
    `linear-gradient(to bottom, ${color} 1px, transparent 1px)`
  );

}

const CUSTOMIZE_BACKGROUND_PATTERN_IMAGE_BUILDERS =
  {
    dot: buildCustomizeDotPatternImage,
    grid: buildCustomizeGridPatternImage
  };


function applyCustomizeBackgroundLayers(
  root,
  backgroundImageEl,
  backgroundPatternEl,
  theme
) {

  root.style.backgroundColor =
    theme?.background
      || "";


  const image =
    theme?.backgroundImage;

  const hasImage =
    !!image &&
    isSafeCustomizeHttpsUrl(image.src);

  if (hasImage) {

    backgroundImageEl.style.backgroundImage =
      `url(${image.src})`;

    backgroundImageEl.style.backgroundRepeat =
      image.fit === "repeat"
        ? "repeat"
        : "no-repeat";

    backgroundImageEl.style.backgroundSize =
      image.fit === "repeat"
        ? "auto"
        : image.fit;

    backgroundImageEl.style.backgroundPosition =
      "center";

    backgroundImageEl.style.opacity =
      String(
        (isCustomizeNumberSet(image.opacity) ? image.opacity : 100) / 100
      );

  } else {

    backgroundImageEl.style.backgroundImage =
      "none";

    backgroundImageEl.style.opacity =
      "1";

  }


  const pattern =
    theme?.backgroundPattern;

  const patternImageBuilder =
    pattern
      ? CUSTOMIZE_BACKGROUND_PATTERN_IMAGE_BUILDERS[pattern.type]
      : null;

  if (patternImageBuilder) {

    backgroundPatternEl.style.backgroundImage =
      patternImageBuilder(
        pattern.color
          || "var(--theme-border)"
      );

    backgroundPatternEl.style.backgroundSize =
      `${pattern.size}px ${pattern.size}px`;

    backgroundPatternEl.style.opacity =
      String(
        (isCustomizeNumberSet(pattern.opacity) ? pattern.opacity : 100) / 100
      );

  } else {

    backgroundPatternEl.style.backgroundImage =
      "none";

    backgroundPatternEl.style.opacity =
      "1";

  }

}


/* =========================================================
   숫자 props 헬퍼

   "" | undefined | null을 전부 "값 없음"으로 취급 — v2 numeric
   allowEmpty 필드(예: image.width, container.maxWidth) 공통 처리.
========================================================== */

function isCustomizeNumberSet(
  value
) {

  return (
    value !== "" &&
    value !== undefined &&
    value !== null
  );

}


/* =========================================================
   action(text/button/image 공유) 실행 헬퍼

   targetPageId가 CUSTOMIZE_PAGE_IDS(실제 페이지 id 목록)에 있고
   그 id로 실제 콜백이 존재할 때만 호출 가능한 함수를 돌려준다 —
   text/button/image 어디서든 "이 페이지로 이동해도 되는가"를
   매번 따로 검사하지 않도록 공유.
========================================================== */

function getCustomizeActionCallback(
  targetPageId,
  actions
) {

  if (
    !CUSTOMIZE_PAGE_IDS.includes(targetPageId)
  ) {

    return null;

  }

  const callback =
    actions?.[targetPageId];

  return (
    typeof callback === "function"
      ? callback
      : null
  );

}


/* =========================================================
   block별 DOM 생성

   각 함수는 항상 root element에
     data-block-id / data-block-type
   을 붙인다.
========================================================== */

function createCustomizeTextBlockNode(
  doc,
  block,
  actions
) {

  /*
    클릭 동작(action) — image와 같은 판단 기준(isLinkable/callback)을
    쓰지만, text는 crop box 같은 별도 wrapper가 없는 단일 노드라서
    <p> 대신 <a>를 만들거나 <p>에 role=button을 붙이는 식으로 태그
    자체를 바꾼다. more/back/enter 같은 일반 텍스트를 그대로 버튼처럼
    쓸 수 있게 하는 게 목적이라, 링크/버튼 특유의 밑줄 등 기본 브라우저
    스타일은 주지 않고 기존 텍스트 스타일을 그대로 유지한다.
  */

  const action =
    block.props.action
      || CUSTOMIZE_DEFAULT_ACTION;

  const isLinkable =
    action.type === "link" &&
    isSafeCustomizeHttpsUrl(action.href);

  const callback =
    action.type === "internal"
      ? getCustomizeActionCallback(action.targetPageId, actions)
      : null;

  const element =
    doc.createElement(
      isLinkable ? "a" : "p"
    );

  element.style.display =
    "block";

  element.style.margin =
    "0";

  element.style.fontSize =
    `${block.props.fontSize}px`;

  element.style.fontWeight =
    String(block.props.fontWeight);

  element.style.textAlign =
    block.props.align
      || "left";

  element.style.color =
    block.props.color
      || "var(--theme-text)";

  element.style.letterSpacing =
    `${block.props.letterSpacing}px`;

  element.style.lineHeight =
    String(block.props.lineHeight);

  element.style.textDecoration =
    "none";

  /*
    plain text는 HTML로 해석하지 않음 — textContent만 사용.
  */

  element.textContent =
    block.props.content
      || "";


  if (isLinkable) {

    element.href =
      action.href;

    element.target =
      "_blank";

    element.rel =
      "noopener noreferrer";

    element.style.cursor =
      "pointer";

  } else if (callback) {

    element.setAttribute(
      "role",
      "button"
    );

    element.tabIndex =
      0;

    element.style.cursor =
      "pointer";

    element.addEventListener(
      "click",
      () => callback()
    );

    element.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key === "Enter" ||
          event.key === " "
        ) {

          event.preventDefault();

          callback();

        }

      }
    );

  }

  return element;

}


function createCustomizeImageBlockNode(
  doc,
  block,
  actions
) {

  /*
    src가 없거나(빈 값) validate-layout.js를 거치지 않은
    데이터라 https가 아니면 렌더하지 않는다(방어적 재검증).
  */

  if (
    !isSafeCustomizeHttpsUrl(block.props.src)
  ) {

    return null;

  }

  const hasFixedHeight =
    isCustomizeNumberSet(block.props.height);

  const hasFixedWidth =
    isCustomizeNumberSet(block.props.width);

  const hasMaxWidth =
    isCustomizeNumberSet(block.props.maxWidth);


  /* 자르기/배경을 담당하는 안쪽 박스 */

  const cropBox =
    doc.createElement("div");

  cropBox.style.width =
    "100%";

  cropBox.style.overflow =
    "hidden";

  cropBox.style.background =
    "var(--theme-surface)";

  if (hasFixedHeight) {

    cropBox.style.height =
      `${block.props.height}px`;

  }


  const img =
    doc.createElement("img");

  img.src =
    block.props.src;

  img.alt =
    block.props.alt
      || "";

  img.style.display =
    "block";

  img.style.width =
    "100%";

  if (hasFixedHeight) {

    img.style.height =
      "100%";

    img.style.objectFit =
      block.props.objectFit
        || "cover";

  } else {

    /*
      height가 "auto"면 object-fit은 의미가 없다(박스 자체가
      이미지의 실제 비율을 그대로 따라감) — 자연스러운 비율로
      보여준다.
    */

    img.style.height =
      "auto";

  }

  cropBox.appendChild(
    img
  );


  /* 클릭 동작 — button의 variant와 달리, image는 action.type만으로 결정 */

  const action =
    block.props.action
      || CUSTOMIZE_DEFAULT_ACTION;

  const isLinkable =
    action.type === "link" &&
    isSafeCustomizeHttpsUrl(action.href);

  const callback =
    action.type === "internal"
      ? getCustomizeActionCallback(action.targetPageId, actions)
      : null;

  const outer =
    doc.createElement(
      isLinkable ? "a" : "div"
    );

  outer.style.display =
    "block";

  if (hasFixedWidth) {

    outer.style.width =
      `${block.props.width}px`;

  }

  if (hasMaxWidth) {

    outer.style.maxWidth =
      `${block.props.maxWidth}px`;

  }

  if (block.props.align === "center") {

    outer.style.marginLeft =
      "auto";

    outer.style.marginRight =
      "auto";

  } else if (block.props.align === "right") {

    outer.style.marginLeft =
      "auto";

  }


  if (isLinkable) {

    outer.href =
      action.href;

    outer.target =
      "_blank";

    outer.rel =
      "noopener noreferrer";

    outer.style.cursor =
      "pointer";

  } else if (callback) {

    outer.setAttribute(
      "role",
      "button"
    );

    outer.tabIndex =
      0;

    outer.style.cursor =
      "pointer";

    outer.addEventListener(
      "click",
      () => callback()
    );

    outer.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key === "Enter" ||
          event.key === " "
        ) {

          event.preventDefault();

          callback();

        }

      }
    );

  }


  outer.appendChild(
    cropBox
  );

  return outer;

}


function createCustomizeButtonBlockNode(
  doc,
  block,
  actions
) {

  const label =
    block.props.label
      || "";

  const action =
    block.props.action
      || CUSTOMIZE_DEFAULT_ACTION;


  if (block.props.variant === "external") {

    if (
      !isSafeCustomizeHttpsUrl(action.href)
    ) {

      return null;

    }

    const link =
      doc.createElement("a");

    link.href =
      action.href;

    link.target =
      "_blank";

    link.rel =
      "noopener noreferrer";

    link.textContent =
      label;

    styleCustomizeButtonNode(link);

    return link;

  }


  /* variant === "action" */

  const button =
    doc.createElement("button");

  button.type =
    "button";

  button.textContent =
    label;

  styleCustomizeButtonNode(button);

  button.addEventListener(
    "click",
    () => {

      const callback =
        getCustomizeActionCallback(
          action.targetPageId,
          actions
        );

      if (callback) {

        callback();

      }

    }
  );

  return button;

}


function styleCustomizeButtonNode(
  element
) {

  element.style.display =
    "inline-block";

  element.style.padding =
    "8px 16px";

  element.style.border =
    "1px solid var(--theme-border)";

  element.style.borderRadius =
    "999px";

  element.style.background =
    "var(--theme-accent)";

  element.style.color =
    "var(--theme-bg)";

  element.style.textDecoration =
    "none";

  element.style.cursor =
    "pointer";

  element.style.font =
    "inherit";

}


function createCustomizeSpacerBlockNode(
  doc,
  block
) {

  const element =
    doc.createElement("div");

  element.style.height =
    `${block.props.height}px`;

  return element;

}


function createCustomizeDividerBlockNode(
  doc,
  block
) {

  const element =
    doc.createElement("hr");

  element.style.border =
    "none";

  element.style.width =
    `${block.props.widthPercent}%`;

  element.style.marginLeft =
    "auto";

  element.style.marginRight =
    "auto";

  element.style.borderTop =
    `${block.props.thickness}px ${block.props.style || "solid"} ${block.props.color || "var(--theme-border)"}`;

  return element;

}


function createCustomizeContainerBlockNode(
  doc,
  block,
  depth,
  mode,
  actions
) {

  const element =
    doc.createElement("div");

  element.style.display =
    "flex";

  element.style.flexDirection =
    block.props.direction === "row"
      ? "row"
      : "column";

  element.style.alignItems =
    block.props.align
      || "stretch";

  element.style.gap =
    `${block.props.gap}px`;

  element.style.padding =
    `${block.props.padding}px`;

  if (
    isCustomizeNumberSet(block.props.maxWidth)
  ) {

    element.style.maxWidth =
      `${block.props.maxWidth}px`;

    element.style.marginLeft =
      "auto";

    element.style.marginRight =
      "auto";

  }

  if (block.props.background) {

    /*
      backgroundOpacity(v3)는 background가 설정된 경우에만 의미가
      있다(테마 상속 상태에서는 적용 대상 색 자체가 없음) — hex를
      rgb로 풀어 알파를 곱한 rgba()로 렌더한다. parseCustomizeHexColor는
      theme-tokens.js(이 파일보다 먼저 로드됨)의 순수 함수를 그대로
      재사용.
    */

    const backgroundRgb =
      parseCustomizeHexColor(block.props.background);

    const backgroundAlpha =
      (
        isCustomizeNumberSet(block.props.backgroundOpacity)
          ? block.props.backgroundOpacity
          : 100
      ) / 100;

    element.style.background =
      `rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${backgroundAlpha})`;

  }

  if (block.props.borderWidth > 0) {

    element.style.border =
      `${block.props.borderWidth}px ${block.props.borderStyle || "solid"} ${block.props.borderColor || "var(--theme-border)"}`;

  }

  if (block.props.borderRadius > 0) {

    element.style.borderRadius =
      `${block.props.borderRadius}px`;

  }


  (block.children || []).forEach(
    (childBlock) => {

      const childNode =
        renderCustomizeBlockNode(
          doc,
          childBlock,
          depth + 1,
          mode,
          actions
        );

      if (childNode) {

        element.appendChild(childNode);

      }

    }
  );


  return element;

}


/* =========================================================
   block type registry

   type → create 함수 dispatch table. 새 block type을 추가할
   때는 block-defaults.js의 CUSTOMIZE_ALLOWED_BLOCK_TYPES/
   CUSTOMIZE_BLOCK_DEFAULTS에 등록하는 것과 함께, 여기에
   create 함수를 만들어 등록하기만 하면 된다(이 파일 안의
   다른 코드는 건드릴 필요 없음). container처럼 children이
   있는 타입의 create 함수는 재귀적으로 renderCustomizeBlockNode를
   그대로 호출한다(classic script라 별도 콜백 주입 불필요).
========================================================== */

const CUSTOMIZE_BLOCK_RENDERERS =
  {
    text: (doc, block, depth, mode, actions) =>
      createCustomizeTextBlockNode(doc, block, actions),
    image: (doc, block, depth, mode, actions) =>
      createCustomizeImageBlockNode(doc, block, actions),
    container: (doc, block, depth, mode, actions) =>
      createCustomizeContainerBlockNode(doc, block, depth, mode, actions),
    button: (doc, block, depth, mode, actions) =>
      createCustomizeButtonBlockNode(doc, block, actions),
    spacer: (doc, block) =>
      createCustomizeSpacerBlockNode(doc, block),
    divider: (doc, block) =>
      createCustomizeDividerBlockNode(doc, block)
  };


/* =========================================================
   renderCustomizeBlockNode

   depth/type을 다시 한 번 방어적으로 확인한 뒤 registry에서
   찾은 생성 함수로 위임한다. 알 수 없는 타입이거나 depth
   초과면 null을 반환해 skip한다(부모가 appendChild를 건너뜀).
========================================================== */

function renderCustomizeBlockNode(
  doc,
  block,
  depth,
  mode,
  actions
) {

  if (
    !block ||
    typeof block !== "object"
  ) {
    return null;
  }

  if (
    depth > CUSTOMIZE_MAX_BLOCK_DEPTH
  ) {
    return null;
  }

  const createNode =
    CUSTOMIZE_BLOCK_RENDERERS[block.type];

  if (!createNode) {
    return null;
  }


  const node =
    createNode(doc, block, depth, mode, actions);

  if (!node) {
    return null;
  }

  node.dataset.blockId =
    block.id
      || "";

  node.dataset.blockType =
    block.type;

  return node;

}


/* =========================================================
   renderCustomizeLayout
========================================================== */

function renderCustomizeLayout(
  input
) {

  const {
    container,
    mode,
    actions
  } =
    input;

  const doc =
    container.ownerDocument
      || document;

  const root =
    doc.createElement("div");

  root.className =
    "customize-layout";

  root.dataset.customizeMode =
    mode
      || "view";

  container.appendChild(root);

  /*
    배경 레이어(v3 후속) — content-area보다 먼저 만들어 root에
    붙인다(DOM 순서 + z-index 둘 다로 항상 content-area 아래에
    깔리게). 위치/치수는 고정값이라 여기서 한 번만 설정하고,
    실제로 무엇을 그릴지(backgroundImage/opacity 등)는
    applyCustomizeBackgroundLayers가 theme이 바뀔 때마다 다시
    계산한다.
  */

  const backgroundImageEl =
    doc.createElement("div");

  backgroundImageEl.className =
    "customize-background-image";

  const backgroundPatternEl =
    doc.createElement("div");

  backgroundPatternEl.className =
    "customize-background-pattern";

  [backgroundImageEl, backgroundPatternEl].forEach(
    (layerEl) => {

      layerEl.style.position =
        "absolute";

      layerEl.style.inset =
        "0";

      layerEl.style.zIndex =
        "0";

      layerEl.style.pointerEvents =
        "none";

      root.appendChild(layerEl);

    }
  );


  /*
    content-area(v3) — root와 분리된 별도 노드. root는 화면 전체
    폭/배경/fitViewport 높이만 담당하고, maxWidth/padding/좌우
    정렬/블록 배치는 이 노드가 담당한다(block-defaults.js
    CUSTOMIZE_CONTENT_AREA_SCHEMA 주석 참고).
  */

  const contentAreaEl =
    doc.createElement("div");

  contentAreaEl.className =
    "customize-content-area";

  root.appendChild(contentAreaEl);


  /*
    root 스타일은 theme.font와 contentArea.fitViewport/verticalAlign
    둘 다에 의존한다 — update()가 theme/contentArea 중 하나만 받아도
    root를 정확히 재계산할 수 있도록 최신 값을 클로저에 들고 있는다.
  */

  let currentTheme =
    input.theme;

  let currentContentArea =
    input.contentArea;


  function renderBlocks(
    blocks
  ) {

    contentAreaEl.innerHTML =
      "";

    (blocks || []).forEach(
      (block) => {

        const node =
          renderCustomizeBlockNode(
            doc,
            block,
            1,
            mode,
            actions
          );

        if (node) {

          contentAreaEl.appendChild(node);

        }

      }
    );

  }


  applyCustomizeThemeTokens(
    container,
    currentTheme
  );

  applyCustomizeLayoutRootStyle(
    root,
    currentTheme,
    currentContentArea
  );

  applyCustomizeBackgroundLayers(
    root,
    backgroundImageEl,
    backgroundPatternEl,
    currentTheme
  );

  applyCustomizeContentAreaStyle(
    contentAreaEl,
    currentContentArea
  );

  renderBlocks(
    input.blocks
  );


  return {

    update(
      nextBlocks,
      nextTheme,
      nextContentArea
    ) {

      if (nextTheme !== undefined) {

        currentTheme =
          nextTheme;

        applyCustomizeThemeTokens(
          container,
          currentTheme
        );

        applyCustomizeBackgroundLayers(
          root,
          backgroundImageEl,
          backgroundPatternEl,
          currentTheme
        );

      }

      if (nextContentArea !== undefined) {

        currentContentArea =
          nextContentArea;

        applyCustomizeContentAreaStyle(
          contentAreaEl,
          currentContentArea
        );

      }

      if (
        nextTheme !== undefined ||
        nextContentArea !== undefined
      ) {

        applyCustomizeLayoutRootStyle(
          root,
          currentTheme,
          currentContentArea
        );

      }

      renderBlocks(
        nextBlocks
      );

    },

    destroy() {

      root.remove();

      clearCustomizeThemeTokens(container);

    }

  };

}
