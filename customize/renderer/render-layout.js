/* =========================================================
   CUSTOMIZE RENDERER - COMMON RENDERER

   contract:

     renderCustomizeLayout({ container, blocks, theme, mode, actions })
       → { update(nextBlocks, nextTheme), destroy() }

   1차 구현 범위:
   - text / image / container / button / spacer / divider
   - update()는 DOM diff 없이 mount 내부를 통째로 다시 렌더한다
     (block 수가 적은 동안은 충분 — 성능 문제가 실제로 확인된
     뒤에 최적화).
   - editor 전용 선택/드래그 UI는 없음.
   - renderer는 core/view-controller.js를 직접 호출하지 않는다.
     button의 action 타입은 actions[actionName] 콜백만 호출한다.

   block-defaults.js / theme-tokens.js / validate-layout.js보다
   뒤에 로드되어야 함(전역 상수/함수 참조). 다만 이 파일 자체는
   "이미 validateCustomizeLayout을 거친 blocks"를 받는다고
   가정하면서도, 방어적으로 자체 depth/type 체크를 한 번 더
   한다 — 검증 없이 임의 데이터가 곧장 들어오는 경우(예: 이번
   단계의 테스트 harness)에도 조용히 죽거나 잘못된 DOM을 만들지
   않기 위함.
========================================================== */

/* =========================================================
   크기 토큰(px/rem)

   size 계열 enum(sm/md/lg)을 실제 치수로 매핑. 아직 시스템
   전역 CSS를 건드리지 않기로 했으므로 renderer가 인라인
   style로 직접 적용한다.
========================================================== */

const CUSTOMIZE_RENDER_TEXT_SIZE_PX =
  {
    sm: "14px",
    md: "16px",
    lg: "22px"
  };

const CUSTOMIZE_RENDER_GAP_PX =
  {
    sm: "8px",
    md: "16px",
    lg: "24px"
  };

const CUSTOMIZE_RENDER_SPACER_HEIGHT_PX =
  {
    sm: "12px",
    md: "24px",
    lg: "48px"
  };

const CUSTOMIZE_RENDER_IMAGE_ASPECT_RATIO =
  {
    square: "1 / 1",
    portrait: "3 / 4",
    landscape: "16 / 9"
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
   block별 DOM 생성

   각 함수는 항상 root element에
     data-block-id / data-block-type
   을 붙인다.
========================================================== */

function createCustomizeTextBlockNode(
  doc,
  block
) {

  const element =
    doc.createElement("p");

  element.style.margin =
    "0";

  element.style.fontSize =
    CUSTOMIZE_RENDER_TEXT_SIZE_PX[block.props.size]
      || CUSTOMIZE_RENDER_TEXT_SIZE_PX.md;

  element.style.textAlign =
    block.props.align
      || "left";

  element.style.color =
    "var(--theme-text)";

  /*
    plain text는 HTML로 해석하지 않음 — textContent만 사용.
  */

  element.textContent =
    block.props.content
      || "";

  return element;

}


function createCustomizeImageBlockNode(
  doc,
  block
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

  const figure =
    doc.createElement("div");

  figure.style.aspectRatio =
    CUSTOMIZE_RENDER_IMAGE_ASPECT_RATIO[block.props.ratio]
      || CUSTOMIZE_RENDER_IMAGE_ASPECT_RATIO.square;

  figure.style.overflow =
    "hidden";

  figure.style.background =
    "var(--theme-surface)";


  const img =
    doc.createElement("img");

  img.src =
    block.props.src;

  img.alt =
    block.props.alt
      || "";

  img.style.width =
    "100%";

  img.style.height =
    "100%";

  img.style.objectFit =
    "cover";

  img.style.display =
    "block";


  figure.appendChild(img);

  return figure;

}


function createCustomizeButtonBlockNode(
  doc,
  block,
  actions
) {

  const label =
    block.props.label
      || "";


  if (block.props.variant === "external") {

    if (
      !isSafeCustomizeHttpsUrl(block.props.href)
    ) {

      return null;

    }

    const link =
      doc.createElement("a");

    link.href =
      block.props.href;

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

      const actionName =
        block.props.actionName;

      const callback =
        actions?.[actionName];

      if (typeof callback === "function") {

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
    CUSTOMIZE_RENDER_SPACER_HEIGHT_PX[block.props.size]
      || CUSTOMIZE_RENDER_SPACER_HEIGHT_PX.md;

  return element;

}


function createCustomizeDividerBlockNode(
  doc,
  block
) {

  const element =
    doc.createElement("hr");

  element.style.width =
    "100%";

  element.style.border =
    "none";

  element.style.borderTop =
    `1px ${block.props.style || "solid"} var(--theme-border)`;

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

  element.style.gap =
    CUSTOMIZE_RENDER_GAP_PX[block.props.gap]
      || CUSTOMIZE_RENDER_GAP_PX.md;


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
   renderCustomizeBlockNode

   depth/type을 다시 한 번 방어적으로 확인한 뒤 타입별 생성
   함수로 위임한다. 알 수 없는 타입이거나 depth 초과면 null을
   반환해 skip한다(부모가 appendChild를 건너뜀).
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

  if (
    !CUSTOMIZE_ALLOWED_BLOCK_TYPES.includes(block.type)
  ) {
    return null;
  }


  let node =
    null;

  if (block.type === "text") {

    node = createCustomizeTextBlockNode(doc, block);

  } else if (block.type === "image") {

    node = createCustomizeImageBlockNode(doc, block);

  } else if (block.type === "container") {

    node = createCustomizeContainerBlockNode(doc, block, depth, mode, actions);

  } else if (block.type === "button") {

    node = createCustomizeButtonBlockNode(doc, block, actions);

  } else if (block.type === "spacer") {

    node = createCustomizeSpacerBlockNode(doc, block);

  } else if (block.type === "divider") {

    node = createCustomizeDividerBlockNode(doc, block);

  }


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


  function renderBlocks(
    blocks
  ) {

    root.innerHTML =
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

          root.appendChild(node);

        }

      }
    );

  }


  applyCustomizeThemeTokens(
    container,
    input.theme
  );

  renderBlocks(
    input.blocks
  );


  return {

    update(
      nextBlocks,
      nextTheme
    ) {

      if (nextTheme !== undefined) {

        applyCustomizeThemeTokens(
          container,
          nextTheme
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
