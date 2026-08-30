/* =========================================================
   CUSTOMIZE EDITOR SHELL

   왼쪽 editor panel state와, 오른쪽 preview(renderCustomizeLayout
   그대로 사용)를 연결하는 스크립트. drag/drop, Supabase 저장,
   custom HTML/CSS 고급모드는 아직 포함하지 않는다.

   block-defaults.js / theme-tokens.js / validate-layout.js /
   render-layout.js / default-layout.js보다 뒤에 로드되어야 함
   (전역 상수/함수 참조).

   이 파일은 admin.js와 동일하게, 스크립트가 body 맨 아래에서
   markup 이후 로드된다고 가정하고 DOMContentLoaded 없이 바로
   실행한다.

   v2: block props가 S/M/L enum 대신 숫자 기반으로 바뀌면서
   props 폼이 slider+number/색상-상속-토글/공유 action 서브폼을
   다루도록 재작성됐고, 화면에 노출되는 문구를 전부 한국어로
   옮겼다(내부 변수명/코드/데이터 값은 영어 그대로 — 표시
   레이어에서만 매핑).
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
          content: "프로필 편집 화면 (placeholder)",
          fontSize: 16,
          align: "center"
        }
      },
      {
        type: "text",
        props: {
          content: "실제 프로필 상세 구성은 다음 단계에서 진행합니다.",
          fontSize: 14,
          align: "center"
        }
      }
    ]
  };



/* =========================================================
   페이지 정의(다중 페이지 구조로 가기 전 내부 일반화)

   지금은 cover/profile 2개뿐이지만, 탭 렌더링/초기화/검증을
   전부 이 배열 순회로 처리해서 페이지가 늘어나도 로직 자체는
   바뀌지 않게 한다(추가 UI는 이번 범위 밖 — 이 배열에 항목을
   더하고 아래 placeholder map에 raw layout을 등록하는 것만으로
   에디터가 그 페이지를 인식함).

   id는 renderer(block-defaults.js CUSTOMIZE_PAGE_IDS)가 아는 값과
   반드시 일치해야 한다 — action.targetPageId의 allowlist가 그
   배열이기 때문. kind는 "역할"만 나타낸다("intro" = 시작 페이지,
   나중에 켜고 끌 수 있게 될 예정 / "main" = 항상 노출되는 메인
   페이지) — 표시 라벨(labelKo)이 바뀌어도 kind로 로직을 판단하는
   코드는 영향받지 않는다. theme(배경/글자색 등)는 페이지별이
   아니라 사이트 공통이라, 아래 initCustomizeEditor는 이 배열의
   첫 항목(index 0) 검증 결과에서만 theme를 가져온다.
========================================================== */

const CUSTOMIZE_PAGE_DEFS =
  [
    { id: "cover", kind: "intro", labelKo: "커버" },
    { id: "profile", kind: "main", labelKo: "프로필" }
  ];

const CUSTOMIZE_PAGE_PLACEHOLDER_RAW_LAYOUTS =
  {
    cover: DEFAULT_LAYOUT,
    profile: CUSTOMIZE_PROFILE_PLACEHOLDER_RAW_LAYOUT
  };



/* =========================================================
   한국어 표시 라벨(표시 전용 — 저장 값/enum 자체는 영어 그대로)
========================================================== */

const CUSTOMIZE_BLOCK_TYPE_LABELS_KO =
  {
    text: "텍스트",
    image: "이미지",
    container: "컨테이너",
    button: "버튼",
    spacer: "여백",
    divider: "구분선"
  };

const CUSTOMIZE_ALIGN_LR_LABELS_KO =
  {
    left: "왼쪽",
    center: "가운데",
    right: "오른쪽"
  };

const CUSTOMIZE_ALIGN_CROSS_LABELS_KO =
  {
    stretch: "꽉 채움",
    start: "시작",
    center: "가운데",
    end: "끝"
  };

const CUSTOMIZE_DIRECTION_LABELS_KO =
  {
    column: "세로",
    row: "가로"
  };

const CUSTOMIZE_BORDER_STYLE_LABELS_KO =
  {
    solid: "실선",
    dashed: "파선",
    dotted: "점선"
  };

const CUSTOMIZE_OBJECT_FIT_LABELS_KO =
  {
    cover: "채우기",
    contain: "맞추기",
    fill: "늘리기"
  };

const CUSTOMIZE_BUTTON_VARIANT_LABELS_KO =
  {
    action: "내부 동작 버튼",
    external: "외부 링크 버튼"
  };

const CUSTOMIZE_ACTION_TYPE_LABELS_KO =
  {
    none: "없음",
    link: "링크",
    internal: "내부 이동"
  };



/* =========================================================
   editor state
========================================================== */

const customizeEditorState =
  {
    currentPage: CUSTOMIZE_PAGE_DEFS[0].id,
    activeTab: "page",
    selectedBlockId: null,
    theme: null,
    pages: Object.fromEntries(
      CUSTOMIZE_PAGE_DEFS.map(
        (pageDef) => [pageDef.id, { blocks: [], contentArea: null }]
      )
    )
  };


let customizePreviewHandle =
  null;



/* =========================================================
   DOM refs
========================================================== */

const deviceToolbar =
  document.getElementById("deviceToolbar");

const deviceStage =
  document.getElementById("deviceStage");

const deviceScaleBox =
  document.getElementById("deviceScaleBox");

const deviceFrameWrapper =
  document.getElementById("deviceFrameWrapper");

const customizePreviewFrame =
  document.getElementById("customizePreviewFrame");

const customizePageTabs =
  document.getElementById("customizePageTabs");

const panelTabPageButton =
  document.getElementById("panelTabPageButton");

const panelTabAddButton =
  document.getElementById("panelTabAddButton");

const panelTabElementButton =
  document.getElementById("panelTabElementButton");

const pageSettingsPanel =
  document.getElementById("pageSettingsPanel");

const addElementPanel =
  document.getElementById("addElementPanel");

const elementSettingsPanel =
  document.getElementById("elementSettingsPanel");

const elementsList =
  document.getElementById("elementsList");

const elementSettingsEmptyHint =
  document.getElementById("elementSettingsEmptyHint");

const addElementRow =
  document.getElementById("addElementRow");

const blockSettingsSection =
  document.getElementById("blockSettingsSection");

const blockSettingsTypeLabel =
  document.getElementById("blockSettingsTypeLabel");

const duplicateBlockButton =
  document.getElementById("duplicateBlockButton");

const deleteBlockButton =
  document.getElementById("deleteBlockButton");

const blockPropsFields =
  document.getElementById("blockPropsFields");

const backgroundColorInput =
  document.getElementById("backgroundColorInput");

const backgroundColorValue =
  document.getElementById("backgroundColorValue");

const textColorInput =
  document.getElementById("textColorInput");

const textColorValue =
  document.getElementById("textColorValue");

const pointColorInput =
  document.getElementById("pointColorInput");

const pointColorValue =
  document.getElementById("pointColorValue");

const fontSelect =
  document.getElementById("fontSelect");

const contentAreaPaddingYInput =
  document.getElementById("contentAreaPaddingYInput");

const contentAreaPaddingXInput =
  document.getElementById("contentAreaPaddingXInput");

const contentAreaMaxWidthInput =
  document.getElementById("contentAreaMaxWidthInput");

const contentAreaMaxWidthUnlimitedCheckbox =
  document.getElementById("contentAreaMaxWidthUnlimitedCheckbox");

const contentAreaAlignSelect =
  document.getElementById("contentAreaAlignSelect");

const contentAreaVerticalAlignSelect =
  document.getElementById("contentAreaVerticalAlignSelect");

const backgroundTypeSolidButton =
  document.getElementById("backgroundTypeSolidButton");

const backgroundTypeImageButton =
  document.getElementById("backgroundTypeImageButton");

const backgroundSolidFields =
  document.getElementById("backgroundSolidFields");

const backgroundImageFields =
  document.getElementById("backgroundImageFields");

const backgroundImageSrcInput =
  document.getElementById("backgroundImageSrcInput");

const backgroundImageOpacityInput =
  document.getElementById("backgroundImageOpacityInput");

const backgroundImageFitSelect =
  document.getElementById("backgroundImageFitSelect");

const backgroundPatternTypeSelect =
  document.getElementById("backgroundPatternTypeSelect");

const backgroundPatternDetailRow =
  document.getElementById("backgroundPatternDetailRow");

const backgroundPatternColorInput =
  document.getElementById("backgroundPatternColorInput");

const backgroundPatternColorInheritCheckbox =
  document.getElementById("backgroundPatternColorInheritCheckbox");

const backgroundPatternOpacityRow =
  document.getElementById("backgroundPatternOpacityRow");

const backgroundPatternOpacityInput =
  document.getElementById("backgroundPatternOpacityInput");

const backgroundPatternSizeRow =
  document.getElementById("backgroundPatternSizeRow");

const backgroundPatternSizeInput =
  document.getElementById("backgroundPatternSizeInput");



/* =========================================================
   Device preview

   customizePreviewFrame(iframe)은 자기 자신의 독립된 browsing
   context다 — iframe.style.width/height를 실제 device 폭×높이로
   지정하면 내부 문서가 "진짜 그 크기의 화면"으로 렌더된다. 부모
   문서(이 editor.js가 도는 문서)의 크기를 CSS로 줄이는 것과는
   근본적으로 다르다(media query/dvh 등이 실제로 그 크기를
   기준으로 평가됨) — fitViewport(contentArea)가 실제 device
   viewport 높이 기준으로 동작하려면 이 전제가 반드시 필요하다.

   태블릿 등 추가 device는 이 배열에 항목만 늘리면 된다 — 툴바
   버튼/전환 로직 모두 이 목록을 그대로 따라간다. 값은 실제
   기기 대표값(데스크톱 1440×900 / 모바일 390×844, iPhone 12/13
   계열 CSS 크기)을 그대로 쓴다.

   편집 패널보다 device가 큰 경우, iframe 자체의 width/height는
   절대 줄이지 않고(그래야 실제 px 기준 렌더와 contentWindow.
   innerWidth/innerHeight가 device 값과 정확히 일치함), iframe을
   감싸는 wrapper에만 transform:scale을 걸어 시각적으로만 축소한다.
   가로/세로 중 더 많이 남는 쪽이 아니라 더 좁게 잡히는 쪽 기준으로
   scale해서 전체 화면이 항상 다 보이게 한다(admin-quote의
   scale-to-fit과 동일 원칙, 다만 이전 버전과 달리 세로도 함께
   본다 — height가 이제 콘텐츠 길이가 아니라 고정된 device
   viewport 높이이기 때문). scale 대상 wrapper 바깥에 실제 크기
   (deviceWidth*scale, deviceHeight*scale)의 placeholder box를
   하나 더 둬서, 축소된 만큼 레이아웃 공간도 줄어들게 한다(안
   그러면 transform이 박스 크기 자체는 안 바꿔서 빈 여백이 남는다).

   콘텐츠가 device 높이보다 길어지는 경우는 iframe 자체 크기를
   늘리는 대신(예전 방식) iframe 엘리먼트 크기를 고정한 채 내부
   문서가 자체적으로 스크롤되게 둔다(브라우저 기본 동작 — iframe에
   별도 overflow 처리 불필요, preview-frame.html도 html/body에
   overflow:hidden을 걸지 않는다).
========================================================== */

const CUSTOMIZE_DEVICE_PRESETS =
  [
    { id: "desktop", label: "데스크톱", width: 1440, height: 900 },
    { id: "mobile", label: "모바일", width: 390, height: 844 }
  ];


const customizeDeviceState =
  {
    activeId: "desktop"
  };


let customizePreviewFrameDocument =
  null;


function getActiveCustomizeDevicePreset() {

  return (
    CUSTOMIZE_DEVICE_PRESETS.find(
      (preset) => preset.id === customizeDeviceState.activeId
    )
      || CUSTOMIZE_DEVICE_PRESETS[0]
  );

}


function renderCustomizeDeviceToolbar() {

  deviceToolbar.innerHTML =
    "";

  CUSTOMIZE_DEVICE_PRESETS.forEach(
    (preset) => {

      const button =
        document.createElement("button");

      button.type =
        "button";

      button.className =
        "customize-device-button";

      button.classList.toggle(
        "active",
        preset.id === customizeDeviceState.activeId
      );

      button.textContent =
        preset.label;

      button.addEventListener(
        "click",
        () => switchCustomizeDevice(preset.id)
      );

      deviceToolbar.appendChild(
        button
      );

    }
  );

}


function switchCustomizeDevice(
  deviceId
) {

  if (
    deviceId === customizeDeviceState.activeId
  ) {
    return;
  }

  customizeDeviceState.activeId =
    deviceId;

  renderCustomizeDeviceToolbar();

  applyCustomizeDeviceSize();

}


/*
  실제 device 폭×높이(iframe 진짜 렌더 크기)는 여기서 절대 안
  줄인다 — stage보다 클 때는 wrapper에만 시각적 scale을 건다(위
  설명 참고). 콘텐츠 길이는 더 이상 이 계산에 영향을 주지 않는다
  (device 높이가 고정값이고, 콘텐츠가 그보다 길면 iframe 내부가
  스스로 스크롤됨).
*/

function recalculateCustomizeDeviceScale() {

  const preset =
    getActiveCustomizeDevicePreset();

  deviceFrameWrapper.style.width =
    `${preset.width}px`;

  deviceFrameWrapper.style.height =
    `${preset.height}px`;

  const stageStyle =
    getComputedStyle(deviceStage);

  const stagePaddingX =
    parseFloat(stageStyle.paddingLeft || "0")
      + parseFloat(stageStyle.paddingRight || "0");

  const stagePaddingY =
    parseFloat(stageStyle.paddingTop || "0")
      + parseFloat(stageStyle.paddingBottom || "0");

  const availableWidth =
    Math.max(
      0,
      deviceStage.clientWidth - stagePaddingX
    );

  const availableHeight =
    Math.max(
      0,
      deviceStage.clientHeight - stagePaddingY
    );

  const fitScale =
    Math.min(
      1,
      availableWidth > 0
        ? availableWidth / preset.width
        : 1,
      availableHeight > 0
        ? availableHeight / preset.height
        : 1
    );

  deviceFrameWrapper.style.transform =
    `scale(${fitScale})`;

  deviceScaleBox.style.width =
    `${preset.width * fitScale}px`;

  deviceScaleBox.style.height =
    `${preset.height * fitScale}px`;

}


function applyCustomizeDeviceSize() {

  recalculateCustomizeDeviceScale();

}


/*
  iframe의 실제 rendered 폭(부모 문서 크기와 무관한 값)을 그대로
  드러내서, "시각적으로만 축소됐을 뿐 내부 렌더 폭은 실제
  device 값 그대로"라는 전제를 코드로도 확인할 수 있게 한다
  (검증/디버깅용 — editor 동작 자체에는 쓰이지 않음).
*/

function getCustomizePreviewFrameInnerWidth() {

  return (
    customizePreviewFrame.contentWindow?.innerWidth
      ?? null
  );

}


function getCustomizePreviewFrameInnerHeight() {

  return (
    customizePreviewFrame.contentWindow?.innerHeight
      ?? null
  );

}



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
   block tree helpers

   addCustomizeBlock/duplicateCustomizeBlock/deleteCustomizeBlock
   모두 blocks 트리를 직접 순회해서 찾아야 하므로 공통 탐색
   로직을 여기 모아둔다. 항상 "현재 page의 blocks 배열"을
   기준으로 탐색한다.
========================================================== */

function findCustomizeBlockById(
  blocks,
  blockId
) {

  for (const block of (blocks || [])) {

    if (block.id === blockId) {
      return block;
    }

    if (block.children) {

      const found =
        findCustomizeBlockById(
          block.children,
          blockId
        );

      if (found) {
        return found;
      }

    }

  }

  return null;

}


/*
  선택된 block이 들어있는 배열(list)과 그 안에서의 index,
  depth(root=1)까지 함께 반환한다 — duplicate/delete는 list에서
  splice해야 하고, add는 depth를 알아야 CUSTOMIZE_MAX_BLOCK_DEPTH를
  넘기지 않는지 판단할 수 있다.
*/

function findCustomizeBlockContext(
  blocks,
  blockId,
  depth
) {

  for (let index = 0; index < (blocks || []).length; index += 1) {

    const block =
      blocks[index];

    if (block.id === blockId) {

      return { block, list: blocks, index, depth };

    }

    if (block.children) {

      const found =
        findCustomizeBlockContext(
          block.children,
          blockId,
          depth + 1
        );

      if (found) {
        return found;
      }

    }

  }

  return null;

}


/*
  props에 nested object(action)가 있어서, {...block.props} 같은
  얕은 복사로 새 block/복제본을 만들면 action 객체 참조가
  공유돼 한쪽을 고치면 다른 쪽도 같이 바뀌는 버그가 생긴다 —
  반드시 깊은 복사로 만든다.
*/

function deepCloneCustomizeBlockWithNewIds(
  block
) {

  const cloned =
    {
      id: crypto.randomUUID(),
      type: block.type,
      props: structuredClone(block.props)
    };

  if (block.children) {

    cloned.children =
      block.children.map(
        (childBlock) =>
          deepCloneCustomizeBlockWithNewIds(childBlock)
      );

  }

  return cloned;

}


function createNewCustomizeBlock(
  type
) {

  const schema =
    CUSTOMIZE_BLOCK_DEFAULTS[type];

  const newBlock =
    {
      id: crypto.randomUUID(),
      type,
      props: structuredClone(schema.props)
    };

  if (schema.allowsChildren) {

    newBlock.children =
      [];

  }

  return newBlock;

}



/* =========================================================
   preview 갱신

   renderCustomizeLayout() handle.update(nextBlocks, nextTheme,
   nextContentArea) 계약상 nextBlocks를 넘기지 않으면 preview가
   비게 되므로, theme/contentArea만 바뀐 경우에도 현재 page의
   blocks를 항상 같이 넘긴다. contentArea는 theme과 달리 페이지별
   이라 항상 "현재 page"의 값을 넘긴다(페이지 전환 시에도 이 함수가
   호출되므로 자연히 갱신됨).
========================================================== */

function refreshCustomizePreview() {

  if (!customizePreviewHandle) {
    return;
  }

  customizePreviewHandle.update(
    getCurrentCustomizePageBlocks(),
    customizeEditorState.theme,
    customizeEditorState.pages[customizeEditorState.currentPage].contentArea
  );

  applyCustomizeEditorSelectionHighlight();

  recalculateCustomizeDeviceScale();

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

  renderCustomizeSettingsPanel();

  switchCustomizeEditorPanelTab("element");

}


/*
  preview에서 block이 아닌 빈 배경/페이지 영역을 클릭했을 때 —
  현재 선택을 해제하고 "페이지 설정" 탭으로 돌아간다(handleCustomize
  PreviewClick의 else 분기에서 호출됨).
*/

function deselectCustomizeBlockToPageSettings() {

  if (!customizeEditorState.selectedBlockId) {

    switchCustomizeEditorPanelTab("page");

    return;

  }

  customizeEditorState.selectedBlockId =
    null;

  applyCustomizeEditorSelectionHighlight();

  renderCustomizeElementsList();

  renderCustomizeSettingsPanel();

  switchCustomizeEditorPanelTab("page");

}


function applyCustomizeEditorSelectionHighlight() {

  if (!customizePreviewFrameDocument) {
    return;
  }

  customizePreviewFrameDocument
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

  /*
    드래그가 실제로 일어난 뒤에 자연스럽게 뒤따라오는 click은
    선택을 건드리지 않는다("현재 선택 상태 유지") — 아래
    handleCustomizeDragPointerMove가 이동 임계값을 넘는 순간
    이 플래그를 세워둔다.
  */

  if (customizeDragJustHappened) {

    customizeDragJustHappened =
      false;

    return;

  }


  const blockElement =
    event.target.closest("[data-block-id]");

  if (!blockElement) {

    deselectCustomizeBlockToPageSettings();

    return;

  }

  selectCustomizeBlock(
    blockElement.dataset.blockId
  );

}



/* =========================================================
   DRAG & DROP - 같은 레벨 순서 변경 / root↔container 이동 /
   container 내부 재배치

   preview iframe(customizePreviewFrameDocument) 안에서 pointer
   이벤트를 직접 처리한다 — 이유는 두 가지: (1) 이미 클릭 선택이
   그 문서에서 처리되고 있어 패턴이 일관되고, (2) 그 문서 자신의
   뷰포트 좌표를 쓰므로 부모 쪽 device-scale transform(데스크톱
   미리보기 배율)과 무관하게 좌표가 항상 정확하다 — 부모 문서에서
   처리했다면 매 프레임 스케일 보정 계산이 필요했을 것.

   Pointer Events를 쓰는 이유(HTML5 draggable 대신): HTML5 D&D는
   터치를 지원하지 않아 방금 만든 모바일 전체화면 CUSTOMIZE
   에디터에서 아예 동작하지 않는다. Pointer Events는 마우스/터치/
   펜을 하나의 이벤트로 통합해서 다룬다.

   상태 변경은 항상 findCustomizeBlockContext로 찾은 실제 배열
   참조(list)에 splice로만 반영하고, 그 다음 반드시
   refreshCustomizePreview()(기존 renderer 재호출)로 다시 그린다 —
   DOM만 옮기고 state를 안 건드리는 지름길은 쓰지 않는다.
========================================================== */

const CUSTOMIZE_DRAG_MOVE_THRESHOLD_PX =
  5;

let customizeDragSession =
  null;

let customizeDragJustHappened =
  false;


/*
  block(자기 자신 포함 subtree) 중에 targetId가 있는지 —
  자기 자신/자기 자손 container 안으로 drop하는 걸 막기 위함.
*/

function isCustomizeBlockOrDescendant(
  block,
  targetId
) {

  if (block.id === targetId) {
    return true;
  }

  return (
    (block.children || []).some(
      (child) =>
        isCustomizeBlockOrDescendant(child, targetId)
    )
  );

}


/*
  block 자신을 포함해 가장 깊은 자손까지의 depth 칸 수(leaf=1).
  이동 후 depth 초과 여부를 미리 계산하는 데 쓴다 — container를
  옮기면 그 밑에 매달린 자손들도 같이 내려가므로, 옮기는 대상이
  container 자신인지 leaf인지와 무관하게 이 높이만큼을 항상
  더해서 검사해야 한다.
*/

function computeCustomizeBlockSubtreeHeight(
  block
) {

  if (
    !block.children ||
    block.children.length === 0
  ) {
    return 1;
  }

  return (
    1 +
    Math.max(
      ...block.children.map(
        computeCustomizeBlockSubtreeHeight
      )
    )
  );

}


function handleCustomizeDragPointerDown(
  event
) {

  if (
    customizeDragSession ||
    (event.button !== undefined && event.button !== 0)
  ) {
    return;
  }

  const blockElement =
    event.target.closest("[data-block-id]");

  if (!blockElement) {
    return;
  }

  customizeDragSession =
    {
      pointerId: event.pointerId,
      draggedBlockId: blockElement.dataset.blockId,
      sourceElement: blockElement,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
      indicatorEl: null,
      hoveredInsideEl: null,
      lastDropTarget: null
    };

  customizePreviewFrameDocument.addEventListener(
    "pointermove",
    handleCustomizeDragPointerMove
  );

  customizePreviewFrameDocument.addEventListener(
    "pointerup",
    handleCustomizeDragPointerUp
  );

  customizePreviewFrameDocument.addEventListener(
    "pointercancel",
    handleCustomizeDragPointerCancel
  );

}


function beginCustomizeDragVisuals() {

  customizeDragJustHappened =
    true;

  customizeDragSession.isDragging =
    true;

  customizeDragSession.sourceElement.classList.add(
    "customize-editor-drag-source"
  );

  customizeDragSession.sourceElement.style.touchAction =
    "none";

  customizePreviewFrameDocument.body.classList.add(
    "customize-editor-dragging-active"
  );

  const indicator =
    customizePreviewFrameDocument.createElement("div");

  indicator.className =
    "customize-editor-drop-indicator";

  indicator.hidden =
    true;

  customizePreviewFrameDocument.body.appendChild(
    indicator
  );

  customizeDragSession.indicatorEl =
    indicator;

}


/*
  hover 중인 block element를 기준으로 어디에 놓일지 판정한다.
  container의 위/아래 25%는 형제로 끼워넣기(before/after),
  가운데 50%는 그 container의 children 끝에 추가(inside) —
  container 안의 실제 자식 위에 커서가 있으면 elementFromPoint가
  그 자식을 먼저 찾아내므로 자연히 그 자식 기준 before/after로
  처리된다(재귀적으로 다시 이 함수가 그 자식에 대해 호출됨).
*/

function computeCustomizeDropTarget(
  hoveredBlockElement,
  pointerClientY
) {

  if (!hoveredBlockElement) {
    return null;
  }

  const hoveredBlockId =
    hoveredBlockElement.dataset.blockId;

  if (
    hoveredBlockId === customizeDragSession.draggedBlockId
  ) {
    return null;
  }

  const rootBlocks =
    getCurrentCustomizePageBlocks();

  const draggedContext =
    findCustomizeBlockContext(
      rootBlocks,
      customizeDragSession.draggedBlockId,
      1
    );

  if (!draggedContext) {
    return null;
  }

  if (
    isCustomizeBlockOrDescendant(
      draggedContext.block,
      hoveredBlockId
    )
  ) {
    return null;
  }

  const hoveredContext =
    findCustomizeBlockContext(
      rootBlocks,
      hoveredBlockId,
      1
    );

  if (!hoveredContext) {
    return null;
  }

  const rect =
    hoveredBlockElement.getBoundingClientRect();

  const relativeY =
    pointerClientY - rect.top;

  const isContainer =
    hoveredContext.block.type === CUSTOMIZE_CONTAINER_BLOCK_TYPE;

  const isMiddleZone =
    relativeY > rect.height * 0.25 &&
    relativeY < rect.height * 0.75;

  let mode, parentList, insertIndex, baseDepth;

  if (isContainer && isMiddleZone) {

    mode = "inside";

    parentList =
      hoveredContext.block.children;

    insertIndex =
      parentList.length;

    baseDepth =
      hoveredContext.depth + 1;

  } else {

    mode =
      relativeY < rect.height / 2
        ? "before"
        : "after";

    parentList =
      hoveredContext.list;

    insertIndex =
      mode === "before"
        ? hoveredContext.index
        : hoveredContext.index + 1;

    baseDepth =
      hoveredContext.depth;

  }

  const subtreeHeight =
    computeCustomizeBlockSubtreeHeight(
      draggedContext.block
    );

  if (
    (baseDepth + subtreeHeight - 1) > CUSTOMIZE_MAX_BLOCK_DEPTH
  ) {
    return null;
  }

  return {
    mode,
    parentList,
    insertIndex,
    hoveredBlockElement,
    hoveredContainerElement:
      mode === "inside"
        ? hoveredBlockElement
        : null,
    rect
  };

}


function updateCustomizeDropIndicatorVisual(
  dropTarget
) {

  if (
    customizeDragSession.hoveredInsideEl &&
    customizeDragSession.hoveredInsideEl !== dropTarget?.hoveredContainerElement
  ) {

    customizeDragSession.hoveredInsideEl.classList.remove(
      "customize-editor-drop-inside"
    );

    customizeDragSession.hoveredInsideEl =
      null;

  }

  if (!dropTarget) {

    customizeDragSession.indicatorEl.hidden =
      true;

    return;

  }

  if (dropTarget.mode === "inside") {

    customizeDragSession.indicatorEl.hidden =
      true;

    dropTarget.hoveredContainerElement.classList.add(
      "customize-editor-drop-inside"
    );

    customizeDragSession.hoveredInsideEl =
      dropTarget.hoveredContainerElement;

    return;

  }

  const rect =
    dropTarget.rect;

  const lineY =
    dropTarget.mode === "before"
      ? rect.top
      : rect.bottom;

  customizeDragSession.indicatorEl.hidden =
    false;

  customizeDragSession.indicatorEl.style.left =
    `${rect.left}px`;

  customizeDragSession.indicatorEl.style.width =
    `${rect.width}px`;

  customizeDragSession.indicatorEl.style.top =
    `${lineY - 1.5}px`;

}


function handleCustomizeDragPointerMove(
  event
) {

  if (
    !customizeDragSession ||
    event.pointerId !== customizeDragSession.pointerId
  ) {
    return;
  }

  if (!customizeDragSession.isDragging) {

    const movedDistance =
      Math.hypot(
        event.clientX - customizeDragSession.startX,
        event.clientY - customizeDragSession.startY
      );

    if (movedDistance < CUSTOMIZE_DRAG_MOVE_THRESHOLD_PX) {
      return;
    }

    beginCustomizeDragVisuals();

  }

  event.preventDefault();

  const hoveredElement =
    customizePreviewFrameDocument
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-block-id]");

  const dropTarget =
    computeCustomizeDropTarget(
      hoveredElement,
      event.clientY
    );

  customizeDragSession.lastDropTarget =
    dropTarget;

  updateCustomizeDropIndicatorVisual(
    dropTarget
  );

}


function performCustomizeBlockMove(
  draggedBlockId,
  dropTarget
) {

  const rootBlocks =
    getCurrentCustomizePageBlocks();

  const draggedContext =
    findCustomizeBlockContext(
      rootBlocks,
      draggedBlockId,
      1
    );

  if (!draggedContext) {
    return;
  }

  const [movedBlock] =
    draggedContext.list.splice(
      draggedContext.index,
      1
    );

  let insertIndex =
    dropTarget.insertIndex;

  /*
    같은 배열 안에서 앞쪽을 제거했으면, 그 뒤 인덱스는 전부 하나씩
    당겨졌으므로 삽입 위치도 그만큼 보정해야 한다.
  */

  if (
    dropTarget.parentList === draggedContext.list &&
    insertIndex > draggedContext.index
  ) {

    insertIndex -= 1;

  }

  dropTarget.parentList.splice(
    insertIndex,
    0,
    movedBlock
  );

}


function cleanupCustomizeDragSession() {

  if (!customizeDragSession) {
    return;
  }

  customizeDragSession.sourceElement.classList.remove(
    "customize-editor-drag-source"
  );

  customizeDragSession.sourceElement.style.touchAction =
    "";

  if (customizeDragSession.hoveredInsideEl) {

    customizeDragSession.hoveredInsideEl.classList.remove(
      "customize-editor-drop-inside"
    );

  }

  customizeDragSession.indicatorEl?.remove();

  customizePreviewFrameDocument.body.classList.remove(
    "customize-editor-dragging-active"
  );

  customizePreviewFrameDocument.removeEventListener(
    "pointermove",
    handleCustomizeDragPointerMove
  );

  customizePreviewFrameDocument.removeEventListener(
    "pointerup",
    handleCustomizeDragPointerUp
  );

  customizePreviewFrameDocument.removeEventListener(
    "pointercancel",
    handleCustomizeDragPointerCancel
  );

  customizeDragSession =
    null;

}


function handleCustomizeDragPointerUp(
  event
) {

  if (
    !customizeDragSession ||
    event.pointerId !== customizeDragSession.pointerId
  ) {
    return;
  }

  const wasDragging =
    customizeDragSession.isDragging;

  const dropTarget =
    customizeDragSession.lastDropTarget;

  const draggedBlockId =
    customizeDragSession.draggedBlockId;

  cleanupCustomizeDragSession();

  if (!wasDragging || !dropTarget) {
    return;
  }

  performCustomizeBlockMove(
    draggedBlockId,
    dropTarget
  );

  refreshCustomizePreview();

  renderCustomizeElementsList();

  /*
    selectedBlockId는 건드리지 않는다 — 옮긴 block이 선택돼
    있었다면 그 id는 그대로 유지되므로("현재 선택 상태 유지")
    재렌더 후에도 applyCustomizeEditorSelectionHighlight가 같은
    id를 기준으로 하이라이트를 다시 건다.
  */

}


function handleCustomizeDragPointerCancel(
  event
) {

  if (
    !customizeDragSession ||
    event.pointerId !== customizeDragSession.pointerId
  ) {
    return;
  }

  cleanupCustomizeDragSession();

}


/*
  안전망: 드래그 중 포인터가 iframe 경계 밖(부모 문서 쪽)으로
  나가버리면 그 문서의 pointerup은 iframe 문서로 전달되지 않는다
  (서로 다른 document라 이벤트가 안 넘어옴) — 그대로 두면 드래그
  상태가 영원히 안 풀려서 대상 block이 반투명인 채로 남는다.
  부모 문서에서 pointerup을 잡아 열려 있는 드래그 세션이 있으면
  이동 없이(어차피 유효한 drop 위치를 모름) 정리만 해준다.
*/

document.addEventListener(
  "pointerup",
  () => {

    if (customizeDragSession) {

      cleanupCustomizeDragSession();

    }

  }
);



/* =========================================================
   요소 추가

   선택된 block이 container면 그 children 끝에 추가하고,
   아니면(또는 선택이 없으면) 현재 page의 root blocks 끝에
   추가한다. container에 추가했을 때 depth가
   CUSTOMIZE_MAX_BLOCK_DEPTH를 넘게 되면 대신 root에 추가한다
   (조용히 depth 초과 branch를 만들지 않기 위함 — renderer가
   그런 branch를 그냥 숨겨버리면 "요소가 사라진 것처럼" 보여
   혼란스럽다).
========================================================== */

function renderCustomizeAddElementRow() {

  addElementRow.innerHTML =
    "";

  CUSTOMIZE_ALLOWED_BLOCK_TYPES.forEach(
    (type) => {

      const button =
        document.createElement("button");

      button.type =
        "button";

      button.className =
        "customize-add-element-button";

      button.textContent =
        `+ ${CUSTOMIZE_BLOCK_TYPE_LABELS_KO[type] || type}`;

      button.addEventListener(
        "click",
        () => addCustomizeBlock(type)
      );

      addElementRow.appendChild(
        button
      );

    }
  );

}


function addCustomizeBlock(
  type
) {

  const rootBlocks =
    getCurrentCustomizePageBlocks();

  const newBlock =
    createNewCustomizeBlock(type);

  const selectedContext =
    customizeEditorState.selectedBlockId
      ? findCustomizeBlockContext(
          rootBlocks,
          customizeEditorState.selectedBlockId,
          1
        )
      : null;

  const canNestInsideSelected =
    selectedContext &&
    selectedContext.block.type === CUSTOMIZE_CONTAINER_BLOCK_TYPE &&
    (selectedContext.depth + 1) <= CUSTOMIZE_MAX_BLOCK_DEPTH;

  if (canNestInsideSelected) {

    selectedContext.block.children.push(
      newBlock
    );

  } else {

    rootBlocks.push(
      newBlock
    );

  }

  refreshCustomizePreview();

  selectCustomizeBlock(
    newBlock.id
  );

}



/* =========================================================
   복제 / 삭제

   둘 다 selectedBlockId가 가리키는 block을 부모 배열(list)
   기준으로 찾아 다룬다 — root blocks든 어떤 container의
   children이든 동일하게 동작.
========================================================== */

function duplicateCustomizeBlock() {

  if (!customizeEditorState.selectedBlockId) {
    return;
  }

  const context =
    findCustomizeBlockContext(
      getCurrentCustomizePageBlocks(),
      customizeEditorState.selectedBlockId,
      1
    );

  if (!context) {
    return;
  }

  const cloned =
    deepCloneCustomizeBlockWithNewIds(
      context.block
    );

  context.list.splice(
    context.index + 1,
    0,
    cloned
  );

  refreshCustomizePreview();

  selectCustomizeBlock(
    cloned.id
  );

}


function deleteCustomizeBlock() {

  if (!customizeEditorState.selectedBlockId) {
    return;
  }

  const context =
    findCustomizeBlockContext(
      getCurrentCustomizePageBlocks(),
      customizeEditorState.selectedBlockId,
      1
    );

  if (!context) {
    return;
  }

  context.list.splice(
    context.index,
    1
  );

  customizeEditorState.selectedBlockId =
    null;

  refreshCustomizePreview();

  renderCustomizeElementsList();

  renderCustomizeSettingsPanel();

}



/* =========================================================
   페이지 전환

   버튼 자체는 renderCustomizePageTabs()가 CUSTOMIZE_PAGE_DEFS를
   순회해서 그리므로, 여기는 상태 전환/미리보기 갱신만 담당한다.
========================================================== */

function switchCustomizeEditorPage(
  pageId
) {

  if (
    pageId === customizeEditorState.currentPage
  ) {
    return;
  }

  customizeEditorState.currentPage =
    pageId;

  customizeEditorState.selectedBlockId =
    null;

  updateCustomizePageTabUI();

  refreshCustomizePreview();

  renderCustomizeElementsList();

  renderCustomizeSettingsPanel();

}


function renderCustomizePageTabs() {

  customizePageTabs.innerHTML =
    "";

  CUSTOMIZE_PAGE_DEFS.forEach(
    (pageDef) => {

      const button =
        document.createElement("button");

      button.type =
        "button";

      button.className =
        "customize-page-tab";

      button.dataset.pageId =
        pageDef.id;

      button.textContent =
        pageDef.labelKo;

      button.classList.toggle(
        "active",
        pageDef.id === customizeEditorState.currentPage
      );

      button.addEventListener(
        "click",
        () => switchCustomizeEditorPage(pageDef.id)
      );

      customizePageTabs.appendChild(
        button
      );

    }
  );

}


function updateCustomizePageTabUI() {

  Array.from(
    customizePageTabs.children
  ).forEach(
    (button) => {

      button.classList.toggle(
        "active",
        button.dataset.pageId === customizeEditorState.currentPage
      );

    }
  );

}



/* =========================================================
   페이지 설정 / 요소 추가 / 요소 설정 탭 전환

   3-way 탭 — "page"(기본 진입 탭) / "add" / "element". block을
   선택하면 selectCustomizeBlock()이 "element"로, preview의 빈
   배경을 클릭하면 handleCustomizePreviewClick()이 "page"로
   자동 전환한다.
========================================================== */

function switchCustomizeEditorPanelTab(
  tab
) {

  customizeEditorState.activeTab =
    tab;

  updateCustomizePanelTabUI();

}


function updateCustomizePanelTabUI() {

  const activeTab =
    customizeEditorState.activeTab;

  panelTabPageButton.classList.toggle(
    "active",
    activeTab === "page"
  );

  panelTabAddButton.classList.toggle(
    "active",
    activeTab === "add"
  );

  panelTabElementButton.classList.toggle(
    "active",
    activeTab === "element"
  );

  pageSettingsPanel.hidden =
    activeTab !== "page";

  addElementPanel.hidden =
    activeTab !== "add";

  elementSettingsPanel.hidden =
    activeTab !== "element";

}



/* =========================================================
   요소 목록

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
        || (block.props.src ? "이미지" : "(이미지 없음)")
    );

  }

  if (block.type === "button") {

    return (
      block.props.label
        || "(버튼)"
    );

  }

  if (block.type === "container") {

    return `컨테이너 · ${CUSTOMIZE_DIRECTION_LABELS_KO[block.props.direction] || block.props.direction}`;

  }

  if (block.type === "spacer") {

    return `여백 · ${block.props.height}px`;

  }

  if (block.type === "divider") {

    return `구분선 · ${block.props.thickness}px`;

  }

  return CUSTOMIZE_BLOCK_TYPE_LABELS_KO[block.type] || block.type;

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
      "요소가 없습니다";

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
        CUSTOMIZE_BLOCK_TYPE_LABELS_KO[block.type] || block.type;

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
   선택된 block의 props 편집 폼(v2)

   CUSTOMIZE_BLOCK_DEFAULTS(block-defaults.js)의 enums/numeric
   메타데이터를 그대로 참조해서, 여기 정의는 "어떤 필드를 어떤
   control로 보여줄지 + 한국어 라벨"만 담당한다 — 허용 범위 자체는
   여전히 block-defaults.js가 단일 소스.

   control 종류:
   - "textarea" / "text" / "url": 문자열
   - "select": enum(성글 select, option label은 optionLabels로 한글화)
   - "number": 항상 값이 있는 숫자(slider + number input)
   - "number-optional": 값이 없을 수도 있는 숫자("자동" 체크박스로 토글)
   - "color-optional": 값이 없으면 테마 상속인 색상(color input + "테마 상속" 체크박스)
   - "action": button/image가 공유하는 클릭 동작 서브폼(라디오 3개 + 조건부 href)

   field는 "a.b" 같은 점 표기로 중첩 경로를 가리킬 수 있다
   (button.action.href처럼 action 객체 안쪽 값을 직접 노출할 때 씀 —
   button은 기존 variant 기반 UI를 그대로 유지하고 href만 공유
   action 객체 쪽으로 옮겼기 때문).

   reRenderOnChange: true인 필드(button.variant, image.action.type)는
   값이 바뀌면 다른 필드의 표시 여부가 달라지므로 폼 전체를 다시
   그린다. 나머지 필드는 타이핑 중 포커스가 끊기지 않도록 상태만
   갱신하고 폼은 다시 그리지 않는다.
========================================================== */

function getNestedBlockPropValue(
  props,
  fieldPath
) {

  return fieldPath
    .split(".")
    .reduce(
      (value, key) => value?.[key],
      props
    );

}


function setNestedBlockPropValue(
  props,
  fieldPath,
  value
) {

  const parts =
    fieldPath.split(".");

  let target =
    props;

  for (let i = 0; i < parts.length - 1; i += 1) {

    target =
      target[parts[i]];

  }

  target[parts[parts.length - 1]] =
    value;

}


const CUSTOMIZE_BLOCK_PROPS_FIELDS =
  {

    text: [
      { field: "content", label: "내용", control: "textarea" },
      {
        field: "fontSize", label: "글자 크기", control: "number",
        min: 10, max: 96, step: 1, unit: "px",
        presets: [{ label: "작게", value: 14 }, { label: "보통", value: 16 }, { label: "크게", value: 22 }]
      },
      { field: "color", label: "글자색", control: "color-optional" },
      { field: "fontWeight", label: "굵기", control: "number", min: 100, max: 900, step: 100 },
      { field: "align", label: "정렬", control: "select", options: ["left", "center", "right"], optionLabels: CUSTOMIZE_ALIGN_LR_LABELS_KO },
      { field: "letterSpacing", label: "자간", control: "number", min: -2, max: 10, step: 0.5, decimals: 1, unit: "px" },
      { field: "lineHeight", label: "줄간격", control: "number", min: 1, max: 3, step: 0.1, decimals: 1 },
      { field: "action", label: "클릭 동작", control: "action" }
    ],

    image: [
      { field: "src", label: "이미지 URL (https만 허용)", control: "url" },
      { field: "alt", label: "대체 텍스트", control: "text" },
      { field: "width", label: "너비", control: "number-optional", min: 40, max: 1200, step: 10, unit: "px" },
      { field: "height", label: "높이", control: "number-optional", min: 40, max: 1200, step: 10, unit: "px" },
      { field: "maxWidth", label: "최대 너비", control: "number-optional", min: 40, max: 1200, step: 10, unit: "px" },
      { field: "align", label: "정렬", control: "select", options: ["left", "center", "right"], optionLabels: CUSTOMIZE_ALIGN_LR_LABELS_KO },
      { field: "objectFit", label: "채우기 방식", control: "select", options: ["cover", "contain", "fill"], optionLabels: CUSTOMIZE_OBJECT_FIT_LABELS_KO },
      { field: "action", label: "클릭 동작", control: "action" }
    ],

    container: [
      { field: "direction", label: "방향", control: "select", options: ["column", "row"], optionLabels: CUSTOMIZE_DIRECTION_LABELS_KO, reRenderOnChange: true },
      { field: "align", label: "정렬", control: "select", options: ["stretch", "start", "center", "end"], optionLabels: CUSTOMIZE_ALIGN_CROSS_LABELS_KO },
      {
        field: "gap", label: "간격", control: "number",
        min: 0, max: 120, step: 1, unit: "px",
        presets: [{ label: "작게", value: 8 }, { label: "보통", value: 16 }, { label: "크게", value: 24 }]
      },
      {
        field: "padding", label: "안쪽 여백", control: "number",
        min: 0, max: 120, step: 1, unit: "px",
        presets: [{ label: "없음", value: 0 }, { label: "보통", value: 16 }, { label: "넓게", value: 32 }]
      },
      { field: "maxWidth", label: "최대 너비", control: "number-optional", min: 100, max: 1200, step: 10, unit: "px" },
      { field: "background", label: "배경색", control: "color-optional", reRenderOnChange: true },
      { field: "borderWidth", label: "테두리 두께", control: "number", min: 0, max: 20, step: 1, unit: "px" },
      { field: "borderColor", label: "테두리 색", control: "color-optional" },
      { field: "borderStyle", label: "테두리 스타일", control: "select", options: ["solid", "dashed", "dotted"], optionLabels: CUSTOMIZE_BORDER_STYLE_LABELS_KO },
      { field: "borderRadius", label: "모서리 둥글기", control: "number", min: 0, max: 200, step: 1, unit: "px" },
      {
        field: "backgroundOpacity", label: "배경 투명도", control: "number",
        min: 0, max: 100, step: 1, unit: "%",
        showIf: (props) => !!props.background
      }
    ],

    button: [
      { field: "variant", label: "모양", control: "select", options: ["action", "external"], optionLabels: CUSTOMIZE_BUTTON_VARIANT_LABELS_KO, reRenderOnChange: true },
      { field: "label", label: "라벨", control: "text" },
      {
        field: "action.href", label: "링크 주소 (https만 허용)", control: "url",
        showIf: (props) => props.variant === "external"
      }
    ],

    spacer: [
      {
        field: "height", label: "높이", control: "number",
        min: 0, max: 400, step: 1, unit: "px",
        presets: [{ label: "작게", value: 12 }, { label: "보통", value: 24 }, { label: "크게", value: 48 }]
      }
    ],

    divider: [
      { field: "style", label: "스타일", control: "select", options: ["solid", "dashed", "dotted"], optionLabels: CUSTOMIZE_BORDER_STYLE_LABELS_KO },
      { field: "thickness", label: "두께", control: "number", min: 1, max: 20, step: 1, unit: "px" },
      { field: "color", label: "색", control: "color-optional" },
      { field: "widthPercent", label: "너비", control: "number", min: 10, max: 100, step: 5, unit: "%" }
    ]

  };


function handleCustomizeBlockPropFieldChange(
  block,
  fieldDef,
  value
) {

  setNestedBlockPropValue(
    block.props,
    fieldDef.field,
    value
  );

  refreshCustomizePreview();

  renderCustomizeElementsList();

  if (fieldDef.reRenderOnChange) {

    renderCustomizeBlockPropsFields(
      block
    );

  }

}


function appendCustomizeUrlFieldHint(
  row,
  input
) {

  const hint =
    document.createElement("p");

  hint.className =
    "customize-field-hint";

  const updateHint =
    () => {

      const value =
        input.value.trim();

      const isInvalid =
        value !== "" &&
        !isSafeCustomizeHttpsUrl(value);

      hint.textContent =
        isInvalid
          ? "https URL만 허용됩니다. 저장/미리보기에는 반영되지 않습니다."
          : "";

      hint.classList.toggle(
        "customize-field-invalid",
        isInvalid
      );

      input.classList.toggle(
        "customize-field-invalid",
        isInvalid
      );

    };

  input.addEventListener(
    "input",
    updateHint
  );

  updateHint();

  row.appendChild(
    hint
  );

}


/*
  숫자 field(slider + number input, 선택적으로 preset 칩) —
  number/number-optional 둘 다 이 함수로 만들고, optional인
  경우에만 바깥에서 "자동" 체크박스를 덧붙인다.
*/

function buildCustomizeNumberControl(
  block,
  fieldDef,
  currentValue,
  onCommit
) {

  const wrap =
    document.createElement("div");

  wrap.className =
    "customize-number-control";

  const decimals =
    fieldDef.decimals
      || 0;


  const slider =
    document.createElement("input");

  slider.type =
    "range";

  slider.className =
    "customize-field-slider";

  slider.min =
    fieldDef.min;

  slider.max =
    fieldDef.max;

  slider.step =
    fieldDef.step
      || 1;

  slider.value =
    currentValue;


  const number =
    document.createElement("input");

  number.type =
    "number";

  number.className =
    "customize-field-input customize-field-number";

  number.min =
    fieldDef.min;

  number.max =
    fieldDef.max;

  number.step =
    fieldDef.step
      || 1;

  number.value =
    currentValue;


  const commit =
    (rawValue) => {

      const parsed =
        Number(rawValue);

      if (!Number.isFinite(parsed)) {
        return;
      }

      const clamped =
        Math.min(
          fieldDef.max,
          Math.max(fieldDef.min, parsed)
        );

      slider.value =
        clamped;

      number.value =
        clamped;

      onCommit(clamped);

    };

  slider.addEventListener(
    "input",
    () => commit(slider.value)
  );

  number.addEventListener(
    "input",
    () => commit(number.value)
  );


  wrap.appendChild(slider);
  wrap.appendChild(number);

  if (fieldDef.unit) {

    const unitLabel =
      document.createElement("span");

    unitLabel.className =
      "customize-field-unit";

    unitLabel.textContent =
      fieldDef.unit;

    wrap.appendChild(unitLabel);

  }


  if (fieldDef.presets?.length) {

    const presetRow =
      document.createElement("div");

    presetRow.className =
      "customize-preset-chip-row";

    fieldDef.presets.forEach(
      (preset) => {

        const chip =
          document.createElement("button");

        chip.type =
          "button";

        chip.className =
          "customize-preset-chip";

        chip.textContent =
          preset.label;

        chip.addEventListener(
          "click",
          () => commit(preset.value)
        );

        presetRow.appendChild(
          chip
        );

      }
    );

    wrap.appendChild(
      presetRow
    );

  }


  return wrap;

}


function buildCustomizeFieldRow(
  block,
  fieldDef
) {

  const row =
    document.createElement("div");

  row.className =
    "customize-field-row";

  const label =
    document.createElement("label");

  label.textContent =
    fieldDef.label;

  row.appendChild(
    label
  );

  const currentValue =
    getNestedBlockPropValue(block.props, fieldDef.field)
      ?? "";


  if (fieldDef.control === "textarea") {

    const textarea =
      document.createElement("textarea");

    textarea.className =
      "customize-field-textarea";

    textarea.value =
      currentValue;

    textarea.addEventListener(
      "input",
      () =>
        handleCustomizeBlockPropFieldChange(
          block,
          fieldDef,
          textarea.value
        )
    );

    row.appendChild(
      textarea
    );

  } else if (fieldDef.control === "select") {

    const select =
      document.createElement("select");

    select.className =
      "customize-field-select";

    fieldDef.options.forEach(
      (optionValue) => {

        const option =
          document.createElement("option");

        option.value =
          optionValue;

        option.textContent =
          fieldDef.optionLabels?.[optionValue]
            || optionValue;

        select.appendChild(
          option
        );

      }
    );

    select.value =
      currentValue;

    select.addEventListener(
      "change",
      () =>
        handleCustomizeBlockPropFieldChange(
          block,
          fieldDef,
          select.value
        )
    );

    row.appendChild(
      select
    );

  } else if (
    fieldDef.control === "number" ||
    fieldDef.control === "number-optional"
  ) {

    const isOptional =
      fieldDef.control === "number-optional";

    const isAuto =
      isOptional &&
      (currentValue === "" || currentValue === undefined);

    const numberValue =
      isAuto
        ? fieldDef.min
        : currentValue;

    const numberControl =
      buildCustomizeNumberControl(
        block,
        fieldDef,
        numberValue,
        (nextValue) =>
          handleCustomizeBlockPropFieldChange(
            block,
            fieldDef,
            nextValue
          )
      );

    if (isOptional) {

      const autoRow =
        document.createElement("label");

      autoRow.className =
        "customize-auto-toggle-row";

      const autoCheckbox =
        document.createElement("input");

      autoCheckbox.type =
        "checkbox";

      autoCheckbox.checked =
        isAuto;

      numberControl.hidden =
        isAuto;

      autoCheckbox.addEventListener(
        "change",
        () => {

          if (autoCheckbox.checked) {

            numberControl.hidden =
              true;

            handleCustomizeBlockPropFieldChange(
              block,
              fieldDef,
              ""
            );

          } else {

            numberControl.hidden =
              false;

            handleCustomizeBlockPropFieldChange(
              block,
              fieldDef,
              fieldDef.min
            );

          }

        }
      );

      autoRow.appendChild(
        autoCheckbox
      );

      autoRow.appendChild(
        document.createTextNode("자동")
      );

      row.appendChild(
        autoRow
      );

    }

    row.appendChild(
      numberControl
    );

  } else if (fieldDef.control === "color-optional") {

    const isInherited =
      currentValue === "" ||
      currentValue === undefined;

    const colorRow =
      document.createElement("div");

    colorRow.className =
      "customize-color-input-row";

    const colorInput =
      document.createElement("input");

    colorInput.type =
      "color";

    colorInput.value =
      isInherited
        ? "#000000"
        : currentValue;

    colorInput.disabled =
      isInherited;

    colorInput.addEventListener(
      "input",
      () =>
        handleCustomizeBlockPropFieldChange(
          block,
          fieldDef,
          colorInput.value
        )
    );

    const inheritLabel =
      document.createElement("label");

    inheritLabel.className =
      "customize-auto-toggle-row";

    const inheritCheckbox =
      document.createElement("input");

    inheritCheckbox.type =
      "checkbox";

    inheritCheckbox.checked =
      isInherited;

    inheritCheckbox.addEventListener(
      "change",
      () => {

        if (inheritCheckbox.checked) {

          colorInput.disabled =
            true;

          handleCustomizeBlockPropFieldChange(
            block,
            fieldDef,
            ""
          );

        } else {

          colorInput.disabled =
            false;

          handleCustomizeBlockPropFieldChange(
            block,
            fieldDef,
            colorInput.value
          );

        }

      }
    );

    inheritLabel.appendChild(
      inheritCheckbox
    );

    inheritLabel.appendChild(
      document.createTextNode("테마 색상 사용")
    );

    colorRow.appendChild(
      colorInput
    );

    row.appendChild(
      colorRow
    );

    row.appendChild(
      inheritLabel
    );

  } else if (fieldDef.control === "action") {

    row.appendChild(
      buildCustomizeActionSubform(block)
    );

  } else {

    /* control === "text" | "url" */

    const input =
      document.createElement("input");

    input.type =
      "text";

    input.className =
      "customize-field-input";

    input.value =
      currentValue;

    input.addEventListener(
      "input",
      () =>
        handleCustomizeBlockPropFieldChange(
          block,
          fieldDef,
          input.value
        )
    );

    row.appendChild(
      input
    );

    if (fieldDef.control === "url") {

      appendCustomizeUrlFieldHint(
        row,
        input
      );

    }

  }

  return row;

}


/*
  text/image가 공유하는 action 서브폼(field: "action" control로
  쓰는 쪽 — button은 별도로 variant 기반 UI를 그대로 씀) — 라디오
  3개(없음/링크/내부 이동) + type에 따라 href 입력 또는 "이동할
  페이지" select를 보여준다. select의 옵션은 CUSTOMIZE_PAGE_DEFS를
  그대로 순회해서 만들기 때문에, 페이지가 늘어나면 이 함수는
  손댈 필요 없이 자동으로 선택지가 늘어난다.
*/

function buildCustomizeActionSubform(
  block
) {

  const wrap =
    document.createElement("div");

  wrap.className =
    "customize-action-subform";

  const action =
    block.props.action;

  const radioGroup =
    document.createElement("div");

  radioGroup.className =
    "customize-action-radio-group";

  CUSTOMIZE_ACTION_TYPE_VALUES.forEach(
    (typeValue) => {

      const optionLabel =
        document.createElement("label");

      optionLabel.className =
        "customize-action-radio-option";

      const radio =
        document.createElement("input");

      radio.type =
        "radio";

      radio.name =
        `customize-action-type-${block.id}`;

      radio.value =
        typeValue;

      radio.checked =
        action.type === typeValue;

      radio.addEventListener(
        "change",
        () => {

          if (!radio.checked) {
            return;
          }

          block.props.action.type =
            typeValue;

          refreshCustomizePreview();

          renderCustomizeElementsList();

          renderCustomizeBlockPropsFields(
            block
          );

        }
      );

      optionLabel.appendChild(
        radio
      );

      optionLabel.appendChild(
        document.createTextNode(
          CUSTOMIZE_ACTION_TYPE_LABELS_KO[typeValue]
            || typeValue
        )
      );

      radioGroup.appendChild(
        optionLabel
      );

    }
  );

  wrap.appendChild(
    radioGroup
  );


  if (action.type === "link") {

    wrap.appendChild(
      buildCustomizeFieldRow(
        block,
        {
          field: "action.href",
          label: "링크 주소 (https만 허용)",
          control: "url"
        }
      )
    );

  }


  if (action.type === "internal") {

    wrap.appendChild(
      buildCustomizeActionTargetPageRow(
        block
      )
    );

  }


  return wrap;

}


/*
  action.type === "internal"일 때만 보이는 "이동할 페이지" select.
  CUSTOMIZE_PAGE_DEFS를 그대로 옵션으로 쓴다 — renderer 쪽
  allowlist(CUSTOMIZE_PAGE_IDS)와 값이 어긋나지 않도록, 여기서
  새로 값을 지어내지 않고 그 배열의 id/labelKo만 그대로 옮긴다.
*/

function buildCustomizeActionTargetPageRow(
  block
) {

  const row =
    document.createElement("div");

  row.className =
    "customize-field-row";

  const label =
    document.createElement("label");

  label.textContent =
    "이동할 페이지";

  const select =
    document.createElement("select");

  select.className =
    "customize-field-select";

  CUSTOMIZE_PAGE_DEFS.forEach(
    (pageDef) => {

      const option =
        document.createElement("option");

      option.value =
        pageDef.id;

      option.textContent =
        pageDef.labelKo;

      select.appendChild(
        option
      );

    }
  );

  select.value =
    block.props.action.targetPageId;

  select.addEventListener(
    "change",
    () => {

      block.props.action.targetPageId =
        select.value;

      refreshCustomizePreview();

    }
  );

  row.appendChild(
    label
  );

  row.appendChild(
    select
  );

  return row;

}


function renderCustomizeBlockPropsFields(
  block
) {

  blockPropsFields.innerHTML =
    "";

  const fieldDefs =
    CUSTOMIZE_BLOCK_PROPS_FIELDS[block.type]
      || [];

  fieldDefs.forEach(
    (fieldDef) => {

      if (
        fieldDef.showIf &&
        !fieldDef.showIf(block.props)
      ) {
        return;
      }

      blockPropsFields.appendChild(
        buildCustomizeFieldRow(block, fieldDef)
      );

    }
  );

}


/* =========================================================
   "요소 설정" 탭 내부 갱신 + 페이지 설정(Content Area) 필드 갱신

   blockSettingsSection(선택된 요소의 props + 복제/삭제)/
   elementSettingsEmptyHint는 selectedBlockId 유무로 서로 반대로
   토글된다. "페이지 설정" 탭(배경/Content Area)은 블록 선택
   여부와 무관하게 그 탭 자체가 항상 그대로 보이므로 여기서
   따로 숨기지 않고, Content Area 필드만 최신값으로 갱신한다
   (페이지 전환 시에도 이 함수가 호출되므로 자연히 갱신됨).
========================================================== */

function renderCustomizeSettingsPanel() {

  const selectedBlock =
    customizeEditorState.selectedBlockId
      ? findCustomizeBlockById(
          getCurrentCustomizePageBlocks(),
          customizeEditorState.selectedBlockId
        )
      : null;

  blockSettingsSection.hidden =
    !selectedBlock;

  elementSettingsEmptyHint.hidden =
    !!selectedBlock;

  if (selectedBlock) {

    blockSettingsTypeLabel.textContent =
      CUSTOMIZE_BLOCK_TYPE_LABELS_KO[selectedBlock.type]
        || selectedBlock.type;

    renderCustomizeBlockPropsFields(
      selectedBlock
    );

  }

  populateCustomizeContentAreaFields();

}



/* =========================================================
   Settings — 배경색 / 글자색 / 포인트 색상 / 글꼴

   CUSTOMIZE preview에만 반영. SYSTEM UI Appearance와는 무관하고
   저장도 하지 않는다(다음 단계).
========================================================== */

const CUSTOMIZE_THEME_FONT_LABELS_KO =
  {
    system: "기본",
    serif: "명조체",
    mono: "고정폭"
  };

const CUSTOMIZE_BACKGROUND_IMAGE_FIT_LABELS_KO =
  {
    cover: "채우기",
    contain: "맞추기",
    repeat: "반복(타일)"
  };

const CUSTOMIZE_BACKGROUND_PATTERN_TYPE_LABELS_KO =
  {
    none: "없음",
    dot: "점",
    grid: "격자"
  };


function populateCustomizeThemeEnumSelect(
  selectElement,
  values,
  labels
) {

  selectElement.innerHTML =
    "";

  values.forEach(
    (value) => {

      const option =
        document.createElement("option");

      option.value =
        value;

      option.textContent =
        labels?.[value]
          || value;

      selectElement.appendChild(
        option
      );

    }
  );

}


/*
  배경 패턴(dot/grid)이 꺼져 있으면("없음") 색상/불투명도/간격
  행 자체를 숨긴다 — fitViewport 껐을 때 verticalAlign 행을
  숨기는 것과 같은 패턴. 색상은 "테마 상속" 체크박스가 켜져
  있으면 입력을 비활성화하고 값은 빈 문자열(상속)로 커밋한다
  (block props의 color-optional 필드와 동일한 상호작용).
*/

function updateCustomizeBackgroundPatternRowVisibility() {

  const isPatternOff =
    backgroundPatternTypeSelect.value === "none";

  backgroundPatternDetailRow.hidden =
    isPatternOff;

  backgroundPatternOpacityRow.hidden =
    isPatternOff;

  backgroundPatternSizeRow.hidden =
    isPatternOff;

  backgroundPatternColorInput.disabled =
    backgroundPatternColorInheritCheckbox.checked;

}


function handleCustomizeThemeInputChange() {

  updateCustomizeBackgroundPatternRowVisibility();

  customizeEditorState.theme =
    {
      background: backgroundColorInput.value,
      textColor: textColorInput.value,
      point: pointColorInput.value,
      font: fontSelect.value,
      backgroundImage: {
        src: backgroundImageSrcInput.value.trim(),
        opacity: Number(backgroundImageOpacityInput.value),
        fit: backgroundImageFitSelect.value
      },
      backgroundPattern: {
        type: backgroundPatternTypeSelect.value,
        color:
          backgroundPatternColorInheritCheckbox.checked
            ? ""
            : backgroundPatternColorInput.value,
        opacity: Number(backgroundPatternOpacityInput.value),
        size: Number(backgroundPatternSizeInput.value)
      }
    };

  updateCustomizeColorValueLabels();

  refreshCustomizePreview();

}


/*
  "배경 유형"(단색/이미지) 토글은 순수 편집 UI 상태다 — theme
  스키마에 새 필드를 추가하지 않고, 어느 필드 묶음을 보여줄지만
  결정한다. 초기값은 backgroundImage.src 유무로 추정하고(populate
  Customize BackgroundFields에서 한 번만), 이후로는 오직 버튼
  클릭으로만 바뀐다 — 데이터는 건드리지 않으므로 이미지→단색으로
  돌아가도 입력해둔 이미지 URL은 지워지지 않는다.
*/

function setCustomizeBackgroundTypeUI(
  type
) {

  const isImage =
    type === "image";

  backgroundTypeSolidButton.classList.toggle(
    "active",
    !isImage
  );

  backgroundTypeImageButton.classList.toggle(
    "active",
    isImage
  );

  backgroundSolidFields.hidden =
    isImage;

  backgroundImageFields.hidden =
    !isImage;

}


function populateCustomizeBackgroundFields() {

  const theme =
    customizeEditorState.theme;

  setCustomizeBackgroundTypeUI(
    theme.backgroundImage.src.trim() !== ""
      ? "image"
      : "solid"
  );

  backgroundImageSrcInput.value =
    theme.backgroundImage.src;

  backgroundImageOpacityInput.value =
    theme.backgroundImage.opacity;

  backgroundImageFitSelect.value =
    theme.backgroundImage.fit;

  backgroundPatternTypeSelect.value =
    theme.backgroundPattern.type;

  const isColorInherited =
    theme.backgroundPattern.color === "";

  backgroundPatternColorInheritCheckbox.checked =
    isColorInherited;

  backgroundPatternColorInput.value =
    isColorInherited
      ? "#000000"
      : theme.backgroundPattern.color;

  backgroundPatternOpacityInput.value =
    theme.backgroundPattern.opacity;

  backgroundPatternSizeInput.value =
    theme.backgroundPattern.size;

  updateCustomizeBackgroundPatternRowVisibility();

}


function updateCustomizeColorValueLabels() {

  backgroundColorValue.textContent =
    customizeEditorState.theme.background;

  textColorValue.textContent =
    customizeEditorState.theme.textColor;

  pointColorValue.textContent =
    customizeEditorState.theme.point;

}


/* =========================================================
   Settings — Content Area(v3, 페이지별)

   theme과 달리 페이지를 바꿀 때마다 이 값들도 다시 그려야
   하므로, renderCustomizeSettingsPanel()이 매번 이 populate
   함수도 함께 호출한다(위 renderCustomizeSettingsPanel 참고).
========================================================== */

function populateCustomizeContentAreaFields() {

  const contentArea =
    customizeEditorState.pages[customizeEditorState.currentPage].contentArea;

  contentAreaPaddingYInput.value =
    contentArea.paddingY;

  contentAreaPaddingXInput.value =
    contentArea.paddingX;

  const isMaxWidthUnlimited =
    contentArea.maxWidth === "";

  contentAreaMaxWidthUnlimitedCheckbox.checked =
    isMaxWidthUnlimited;

  contentAreaMaxWidthInput.disabled =
    isMaxWidthUnlimited;

  contentAreaMaxWidthInput.value =
    isMaxWidthUnlimited
      ? ""
      : contentArea.maxWidth;

  contentAreaAlignSelect.value =
    contentArea.align;

  contentAreaVerticalAlignSelect.value =
    contentArea.verticalAlign;

}


/*
  fitViewport는 이제 항상 true로 저장한다(UI에서 끌 수 있는
  체크박스 자체를 없앴다 — 짧은 페이지는 화면 높이를 채우고,
  긴 페이지는 renderer의 min-height:100dvh + 자연스러운 스크롤로
  그대로 길어진다).
*/

function handleCustomizeContentAreaInputChange() {

  const isMaxWidthUnlimited =
    contentAreaMaxWidthUnlimitedCheckbox.checked;

  contentAreaMaxWidthInput.disabled =
    isMaxWidthUnlimited;

  customizeEditorState.pages[customizeEditorState.currentPage].contentArea =
    {
      paddingY: Number(contentAreaPaddingYInput.value),
      paddingX: Number(contentAreaPaddingXInput.value),
      maxWidth:
        isMaxWidthUnlimited
          ? ""
          : Number(contentAreaMaxWidthInput.value),
      align: contentAreaAlignSelect.value,
      fitViewport: true,
      verticalAlign: contentAreaVerticalAlignSelect.value
    };

  refreshCustomizePreview();

}



/* =========================================================
   페이지 설정 — 아코디언 접기/펼치기(QUOTE PRESET과 동일한
   상호작용, 다만 이 문서는 admin-quote.css를 공유하지 않으므로
   여기서 직접 구현한다). 셋 다 기본으로 펼쳐진 채 시작한다.
========================================================== */

function initCustomizeAccordions() {

  document
    .querySelectorAll(".customize-accordion-toggle")
    .forEach(
      (toggle) => {

        toggle.addEventListener(
          "click",
          () => {

            const content =
              toggle.nextElementSibling;

            const isExpanded =
              toggle.getAttribute("aria-expanded") === "true";

            toggle.setAttribute(
              "aria-expanded",
              String(!isExpanded)
            );

            content.hidden =
              isExpanded;

            toggle.querySelector(".customize-accordion-icon").textContent =
              isExpanded
                ? "+"
                : "−";

          }
        );

      }
    );

}



/* =========================================================
   init
========================================================== */

function initCustomizeEditor() {

  /*
    theme(배경/글자색 등)는 페이지별이 아니라 사이트 공통이라,
    CUSTOMIZE_PAGE_DEFS의 첫 항목(index 0 — 지금은 "cover") 검증
    결과에서만 가져온다. 나머지 페이지는 blocks만 반영.
  */

  CUSTOMIZE_PAGE_DEFS.forEach(
    (pageDef, index) => {

      const rawLayout =
        CUSTOMIZE_PAGE_PLACEHOLDER_RAW_LAYOUTS[pageDef.id]
          || { version: CUSTOMIZE_LAYOUT_VERSION, blocks: [] };

      const validation =
        validateCustomizeLayout(rawLayout);

      customizeEditorState.pages[pageDef.id].blocks =
        validation.layout.blocks;

      /*
        contentArea(v3)는 theme과 달리 페이지마다 따로 유지한다 —
        모든 페이지에서 각자 저장. fitViewport는 에디터 UI에서
        더 이상 끌 수 없으므로(항상 true), 저장된/기본 레이아웃이
        false를 갖고 있더라도 불러오는 시점에 true로 맞춘다 —
        renderer 기본값(block-defaults.js)은 건드리지 않는다.
      */

      customizeEditorState.pages[pageDef.id].contentArea =
        {
          ...validation.layout.contentArea,
          fitViewport: true
        };

      if (index === 0) {

        customizeEditorState.theme =
          { ...validation.layout.theme };

      }

    }
  );


  renderCustomizePageTabs();


  populateCustomizeThemeEnumSelect(
    fontSelect,
    CUSTOMIZE_THEME_FONT_VALUES,
    CUSTOMIZE_THEME_FONT_LABELS_KO
  );

  populateCustomizeThemeEnumSelect(
    contentAreaAlignSelect,
    CUSTOMIZE_CONTENT_AREA_ALIGN_VALUES,
    CUSTOMIZE_ALIGN_LR_LABELS_KO
  );

  populateCustomizeThemeEnumSelect(
    contentAreaVerticalAlignSelect,
    CUSTOMIZE_CONTENT_AREA_VERTICAL_ALIGN_VALUES,
    CUSTOMIZE_ALIGN_CROSS_LABELS_KO
  );

  populateCustomizeThemeEnumSelect(
    backgroundImageFitSelect,
    CUSTOMIZE_BACKGROUND_IMAGE_FIT_VALUES,
    CUSTOMIZE_BACKGROUND_IMAGE_FIT_LABELS_KO
  );

  populateCustomizeThemeEnumSelect(
    backgroundPatternTypeSelect,
    CUSTOMIZE_BACKGROUND_PATTERN_TYPE_VALUES,
    CUSTOMIZE_BACKGROUND_PATTERN_TYPE_LABELS_KO
  );

  backgroundColorInput.value =
    customizeEditorState.theme.background;

  textColorInput.value =
    customizeEditorState.theme.textColor;

  pointColorInput.value =
    customizeEditorState.theme.point;

  fontSelect.value =
    customizeEditorState.theme.font;

  populateCustomizeBackgroundFields();

  updateCustomizeColorValueLabels();

  renderCustomizeDeviceToolbar();


  /*
    editor preview는 반드시 기존 renderCustomizeLayout()을
    그대로 사용한다 — preview 전용 renderer를 새로 만들지 않는다.
    다만 이제 그 호출 대상이 부모 문서의 div가 아니라
    preview-frame.html(iframe)의 문서다 — iframe이 load된 뒤에만
    가능하므로 load 리스너 안에서 한 번만 초기화한다(device
    전환은 이 iframe을 다시 로드하지 않고 폭/scale만 바꾼다).

    ★ addEventListener("load", ...)만 걸어두면 놓칠 수 있는
    race가 있다 — 이 <script>는 body 맨 아래에서 실행되는데,
    그 사이 iframe은 이미 파싱되어 자기 문서(및 그 안의 renderer
    스크립트 4개)를 다 로드하고 load 이벤트를 먼저 쏴버릴 수
    있다(특히 파일들이 캐시돼 있을 때). 그러면 이 시점 이후에
    거는 리스너는 이미 지나간 이벤트를 영원히 못 받아 preview가
    완전히 빈 채로 남는다 — 그래서 등록 전에 이미 로드가 끝나
    있는지 먼저 확인하고, 끝나 있으면 바로 초기화한다.
  */

  function initializeCustomizePreviewFrame() {

    const frameWindow =
      customizePreviewFrame.contentWindow;

    customizePreviewFrameDocument =
      frameWindow.document;

    customizePreviewHandle =
      frameWindow.renderCustomizeLayout({
        container: customizePreviewFrameDocument.getElementById("previewMount"),
        blocks: getCurrentCustomizePageBlocks(),
        theme: customizeEditorState.theme,
        contentArea: customizeEditorState.pages[customizeEditorState.currentPage].contentArea,
        mode: "edit",
        actions: {}
      });

    customizePreviewFrameDocument.addEventListener(
      "click",
      handleCustomizePreviewClick
    );

    customizePreviewFrameDocument.addEventListener(
      "pointerdown",
      handleCustomizeDragPointerDown
    );

    applyCustomizeDeviceSize();

  }

  const isPreviewFrameAlreadyLoaded =
    customizePreviewFrame.contentDocument?.readyState === "complete"
      && typeof customizePreviewFrame.contentWindow.renderCustomizeLayout === "function";

  if (isPreviewFrameAlreadyLoaded) {

    initializeCustomizePreviewFrame();

  } else {

    customizePreviewFrame.addEventListener(
      "load",
      initializeCustomizePreviewFrame
    );

  }

  window.addEventListener(
    "resize",
    () => recalculateCustomizeDeviceScale()
  );

  /*
    페이지 탭 클릭 바인딩은 renderCustomizePageTabs()가 버튼을
    직접 만들 때 이미 붙인다(위에서 호출됨) — 여기서 따로 안 함.
  */

  panelTabPageButton.addEventListener(
    "click",
    () => switchCustomizeEditorPanelTab("page")
  );

  panelTabAddButton.addEventListener(
    "click",
    () => switchCustomizeEditorPanelTab("add")
  );

  panelTabElementButton.addEventListener(
    "click",
    () => switchCustomizeEditorPanelTab("element")
  );

  backgroundTypeSolidButton.addEventListener(
    "click",
    () => setCustomizeBackgroundTypeUI("solid")
  );

  backgroundTypeImageButton.addEventListener(
    "click",
    () => setCustomizeBackgroundTypeUI("image")
  );

  backgroundColorInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  textColorInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  pointColorInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  fontSelect.addEventListener(
    "change",
    handleCustomizeThemeInputChange
  );

  backgroundImageSrcInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  backgroundImageOpacityInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  backgroundImageFitSelect.addEventListener(
    "change",
    handleCustomizeThemeInputChange
  );

  backgroundPatternTypeSelect.addEventListener(
    "change",
    handleCustomizeThemeInputChange
  );

  backgroundPatternColorInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  backgroundPatternColorInheritCheckbox.addEventListener(
    "change",
    handleCustomizeThemeInputChange
  );

  backgroundPatternOpacityInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  backgroundPatternSizeInput.addEventListener(
    "input",
    handleCustomizeThemeInputChange
  );

  contentAreaPaddingYInput.addEventListener(
    "input",
    handleCustomizeContentAreaInputChange
  );

  contentAreaPaddingXInput.addEventListener(
    "input",
    handleCustomizeContentAreaInputChange
  );

  contentAreaMaxWidthInput.addEventListener(
    "input",
    handleCustomizeContentAreaInputChange
  );

  contentAreaMaxWidthUnlimitedCheckbox.addEventListener(
    "change",
    handleCustomizeContentAreaInputChange
  );

  contentAreaAlignSelect.addEventListener(
    "change",
    handleCustomizeContentAreaInputChange
  );

  contentAreaVerticalAlignSelect.addEventListener(
    "change",
    handleCustomizeContentAreaInputChange
  );

  duplicateBlockButton.addEventListener(
    "click",
    duplicateCustomizeBlock
  );

  deleteBlockButton.addEventListener(
    "click",
    deleteCustomizeBlock
  );


  updateCustomizePageTabUI();
  updateCustomizePanelTabUI();
  renderCustomizeAddElementRow();
  renderCustomizeElementsList();
  renderCustomizeSettingsPanel();
  initCustomizeAccordions();

}


initCustomizeEditor();
