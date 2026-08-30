/* =========================================================
   CUSTOMIZE EDITOR SHELL (1단계)

   왼쪽 editor panel state와, 오른쪽 preview(renderCustomizeLayout
   그대로 사용)를 연결하는 스크립트. drag/drop, block 추가/삭제,
   정식 property editor, Supabase 저장은 이번 단계에 포함하지
   않는다 — 골격만 잡는다.

   block-defaults.js / theme-tokens.js / validate-layout.js /
   render-layout.js / default-layout.js보다 뒤에 로드되어야 함
   (전역 상수/함수 참조).

   이 파일은 admin.js와 동일하게, 스크립트가 body 맨 아래에서
   markup 이후 로드된다고 가정하고 DOMContentLoaded 없이 바로
   실행한다.
========================================================== */


/* =========================================================
   PROFILE 자리표시자 레이아웃

   아직 실제 profile 상세 blocks 구성이 없으므로, renderer가
   이미 검증하는 최소 placeholder만 둔다(외부 URL 없음).
   customize/renderer 파일들은 건드리지 않는다.
========================================================== */

const CUSTOMIZE_PROFILE_PLACEHOLDER_RAW_LAYOUT =
  {
    version: CUSTOMIZE_LAYOUT_VERSION,
    theme: { ...CUSTOMIZE_DEFAULT_THEME },
    blocks: [
      {
        type: "text",
        props: {
          content: "PROFILE 편집 화면 (placeholder)",
          size: "md",
          align: "center"
        }
      },
      {
        type: "text",
        props: {
          content: "실제 profile 상세 block 구성은 다음 단계에서 진행합니다.",
          size: "sm",
          align: "center"
        }
      }
    ]
  };



/* =========================================================
   editor state
========================================================== */

const customizeEditorState =
  {
    currentPage: "cover",
    activeTab: "elements",
    selectedBlockId: null,
    theme: null,
    pages: {
      cover: { blocks: [] },
      profile: { blocks: [] }
    }
  };


let customizePreviewHandle =
  null;



/* =========================================================
   DOM refs
========================================================== */

const customizePreviewMount =
  document.getElementById("customizePreviewMount");

const pageTabCoverButton =
  document.getElementById("pageTabCoverButton");

const pageTabProfileButton =
  document.getElementById("pageTabProfileButton");

const panelTabElementsButton =
  document.getElementById("panelTabElementsButton");

const panelTabSettingsButton =
  document.getElementById("panelTabSettingsButton");

const elementsPanel =
  document.getElementById("elementsPanel");

const settingsPanel =
  document.getElementById("settingsPanel");

const elementsList =
  document.getElementById("elementsList");

const backgroundColorInput =
  document.getElementById("backgroundColorInput");

const backgroundColorValue =
  document.getElementById("backgroundColorValue");

const pointColorInput =
  document.getElementById("pointColorInput");

const pointColorValue =
  document.getElementById("pointColorValue");



/* =========================================================
   현재 page의 blocks
========================================================== */

function getCurrentCustomizePageBlocks() {

  return (
    customizeEditorState
      .pages[customizeEditorState.currentPage]
      .blocks
  );

}



/* =========================================================
   preview 갱신

   renderCustomizeLayout() handle.update(nextBlocks, nextTheme)
   계약상 nextBlocks를 넘기지 않으면 preview가 비게 되므로,
   theme만 바뀐 경우에도 현재 page의 blocks를 항상 같이 넘긴다.
========================================================== */

function refreshCustomizePreview() {

  customizePreviewHandle.update(
    getCurrentCustomizePageBlocks(),
    customizeEditorState.theme
  );

  applyCustomizeEditorSelectionHighlight();

}



/* =========================================================
   block 선택

   renderer 내부에는 선택 UI가 없으므로, 이미 렌더된
   [data-block-id] element에 class만 토글한다(새 DOM 삽입 없음).
========================================================== */

function selectCustomizeBlock(
  blockId
) {

  customizeEditorState.selectedBlockId =
    blockId;

  applyCustomizeEditorSelectionHighlight();

  renderCustomizeElementsList();

}


function applyCustomizeEditorSelectionHighlight() {

  customizePreviewMount
    .querySelectorAll("[data-block-id]")
    .forEach(
      (element) => {

        element.classList.toggle(
          "customize-editor-block-selected",
          element.dataset.blockId
            === customizeEditorState.selectedBlockId
        );

      }
    );

}


function handleCustomizePreviewClick(
  event
) {

  const blockElement =
    event.target.closest("[data-block-id]");

  if (!blockElement) {
    return;
  }

  selectCustomizeBlock(
    blockElement.dataset.blockId
  );

}



/* =========================================================
   COVER / PROFILE 전환
========================================================== */

function switchCustomizeEditorPage(
  page
) {

  if (
    page === customizeEditorState.currentPage
  ) {
    return;
  }

  customizeEditorState.currentPage =
    page;

  customizeEditorState.selectedBlockId =
    null;

  updateCustomizePageTabUI();

  refreshCustomizePreview();

  renderCustomizeElementsList();

}


function updateCustomizePageTabUI() {

  pageTabCoverButton.classList.toggle(
    "active",
    customizeEditorState.currentPage === "cover"
  );

  pageTabProfileButton.classList.toggle(
    "active",
    customizeEditorState.currentPage === "profile"
  );

}



/* =========================================================
   Elements / Settings 탭 전환
========================================================== */

function switchCustomizeEditorPanelTab(
  tab
) {

  customizeEditorState.activeTab =
    tab;

  updateCustomizePanelTabUI();

}


function updateCustomizePanelTabUI() {

  const isElementsTab =
    customizeEditorState.activeTab === "elements";

  panelTabElementsButton.classList.toggle(
    "active",
    isElementsTab
  );

  panelTabSettingsButton.classList.toggle(
    "active",
    !isElementsTab
  );

  elementsPanel.hidden =
    !isElementsTab;

  settingsPanel.hidden =
    isElementsTab;

}



/* =========================================================
   Elements 목록

   depth가 있는 container 자식도 최소한으로 들여쓰기해서
   보여준다(정식 tree UI는 다음 단계).
========================================================== */

function collectCustomizeBlocksFlat(
  blocks,
  depth,
  out
) {

  (blocks || []).forEach(
    (block) => {

      out.push(
        { block, depth }
      );

      if (block.children) {

        collectCustomizeBlocksFlat(
          block.children,
          depth + 1,
          out
        );

      }

    }
  );

  return out;

}


function describeCustomizeBlockLabel(
  block
) {

  if (block.type === "text") {

    return (
      block.props.content
        ? block.props.content.slice(0, 28)
        : "(빈 텍스트)"
    );

  }

  if (block.type === "image") {

    return (
      block.props.alt
        || (block.props.src ? "image" : "(이미지 없음)")
    );

  }

  if (block.type === "button") {

    return (
      block.props.label
        || "(버튼)"
    );

  }

  if (block.type === "container") {

    return `container · ${block.props.direction}`;

  }

  if (block.type === "spacer") {

    return `spacer · ${block.props.size}`;

  }

  if (block.type === "divider") {

    return `divider · ${block.props.style}`;

  }

  return block.type;

}


function renderCustomizeElementsList() {

  elementsList.innerHTML =
    "";

  const flatBlocks =
    collectCustomizeBlocksFlat(
      getCurrentCustomizePageBlocks(),
      0,
      []
    );

  if (flatBlocks.length === 0) {

    const emptyItem =
      document.createElement("li");

    emptyItem.className =
      "customize-elements-empty";

    emptyItem.textContent =
      "블록이 없습니다";

    elementsList.appendChild(
      emptyItem
    );

    return;

  }

  flatBlocks.forEach(
    ({ block, depth }) => {

      const item =
        document.createElement("li");

      item.className =
        "customize-element-item";

      item.style.paddingLeft =
        `${12 + depth * 14}px`;

      item.classList.toggle(
        "selected",
        block.id === customizeEditorState.selectedBlockId
      );

      const typeTag =
        document.createElement("span");

      typeTag.className =
        "customize-element-type";

      typeTag.textContent =
        block.type;

      const labelSpan =
        document.createElement("span");

      labelSpan.className =
        "customize-element-label";

      labelSpan.textContent =
        describeCustomizeBlockLabel(block);

      item.appendChild(typeTag);
      item.appendChild(labelSpan);

      item.addEventListener(
        "click",
        () => {
          selectCustomizeBlock(block.id);
        }
      );

      elementsList.appendChild(
        item
      );

    }
  );

}



/* =========================================================
   Settings — Background / Point Color

   CUSTOMIZE preview에만 반영. SYSTEM UI Appearance와는 무관하고
   저장도 하지 않는다(다음 단계).
========================================================== */

function handleCustomizeThemeInputChange() {

  customizeEditorState.theme =
    {
      background: backgroundColorInput.value,
      point: pointColorInput.value
    };

  updateCustomizeColorValueLabels();

  refreshCustomizePreview();

}


function updateCustomizeColorValueLabels() {

  backgroundColorValue.textContent =
    customizeEditorState.theme.background;

  pointColorValue.textContent =
    customizeEditorState.theme.point;

}



/* =========================================================
   init
========================================================== */

function initCustomizeEditor() {

  const coverValidation =
    validateCustomizeLayout(DEFAULT_LAYOUT);

  customizeEditorState.pages.cover.blocks =
    coverValidation.layout.blocks;

  customizeEditorState.theme =
    { ...coverValidation.layout.theme };


  const profileValidation =
    validateCustomizeLayout(
      CUSTOMIZE_PROFILE_PLACEHOLDER_RAW_LAYOUT
    );

  customizeEditorState.pages.profile.blocks =
    profileValidation.layout.blocks;


  backgroundColorInput.value =
    customizeEditorState.theme.background;

  pointColorInput.value =
    customizeEditorState.theme.point;

  updateCustomizeColorValueLabels();


  /*
    editor preview는 반드시 기존 renderCustomizeLayout()을
    그대로 사용한다 — preview 전용 renderer를 새로 만들지 않는다.
  */

  customizePreviewHandle =
    renderCustomizeLayout({
      container: customizePreviewMount,
      blocks: getCurrentCustomizePageBlocks(),
      theme: customizeEditorState.theme,
      mode: "edit",
      actions: {}
    });


  customizePreviewMount.addEventListener(
    "click",
    handleCustomizePreviewClick
  );

  pageTabCoverButton.addEventListener(
    "click",
    () => switchCustomizeEditorPage("cover")
  );

  pageTabProfileButton.addEventListener(
    "click",
    () => switchCustomizeEditorPage("profile")
  );

  panelTabElementsButton.addEventListener(
    "click",
    () => switchCustomizeEditorPanelTab("elements")
  );

  panelTabSettingsButton.addEventListener(
    "click",
    () => switchCustomizeEditorPanelTab("settings")
  );

  backgroundColorInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  pointColorInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );


  updateCustomizePageTabUI();
  updateCustomizePanelTabUI();
  renderCustomizeElementsList();

}


initCustomizeEditor();
