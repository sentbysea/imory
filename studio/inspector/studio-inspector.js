/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR + DIRECT EDIT (PHASE AI-6A/6B)

   Preview 안의 요소를 F12 Inspector처럼 직접 고르고, 간단한 수정은
   OpenAI를 전혀 부르지 않고 여기서 끝낸다.

   ★ 이 파일이 하는 일
     - Top Dock의 "Select" 토글(#studioInspectorButton)
     - Preview **위에** 얹는 overlay(hover 테두리 / 선택 테두리 /
       팝오버) — 스킨 DOM에는 아무 것도 붙이지 않는다
     - iframe이 올려보낸 좌표를 Studio 좌표로 옮기는 변환
     - 고른 요소의 "가능한 수정"만 그리는 폼
     - 수정 결과를 SkinPackage에 반영(항상 applyStudioDirectEdit
       하나만 통과)
     - 선택 상태의 **소유** — 바뀔 때마다 window 이벤트
       "studio-inspector-selection"을 쏘고, 값은 항상
       window.getStudioInspectorSelection()으로 읽게 한다
       (PHASE AI-6B, 요구사항 10절)

   ★ 이 파일이 하지 않는 일
     - OpenAI 호출 — "✦ AI 수정" 버튼도 패널을 열 뿐이다.
       실제 호출은 사용자가 문장을 쓰고 Send를 눌렀을 때
       studio/ai/studio-ai-panel.js가 한다(PHASE AI-6B)
     - AI 패널의 선택 chip — studio/ai/studio-ai-selection.js
     - 자동 Save(사용자가 Save를 눌러야만 DB에 간다)
     - 요소 식별/capability/CSS 규칙 계산 — 전부
       studio/inspector/studio-inspector-model.js(순수 함수)
     - iframe 안의 hit-test — studio/preview/preview-bridge.js

   ★ Inspector가 꺼져 있을 때
     Preview로 나가는 skin은 지금까지와 byte 단위로 동일하고
     (stampSkinForInspector가 그대로 돌려준다), overlay는 hidden이며,
     iframe의 Inspector 리스너도 전부 첫 줄에서 빠져나간다. 즉 이번
     Phase는 "켰을 때만" 존재하는 기능이다(요구사항 1절).

   ★ 왜 Preview 안이 아니라 Studio overlay인가 (요구사항 6절)
     팝오버를 iframe 안에 그리면 (1) 스킨 CSS가 그 DOM에 영향을
     주고, (2) 스킨 HTML을 저장할 때 그 DOM이 섞여 들어갈 위험이
     생기며, (3) Preview가 Mobile 모드에서 scale()로 축소될 때
     컨트롤까지 같이 작아진다. Studio overlay는 셋 다 없다 —
     #studioPreviewBackButton이 이미 같은 이유로 stage 밖 형제로
     놓여 있다(studio/index.html 주석 참고).

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   studio/inspector/studio-inspector-model.js, studio/studio-preview.js
   (applyStudioDirectEdit / postInspectorModeToFrame /
   showStudioToast / resolveCodeEditorSource / currentWorkingSkin /
   currentPreviewPageType), skin/skin-sanitize.js(sanitizeSkinHTML /
   isSafeSkinUrl), studio/preview/preview-navigation.js
   (renderCurrentPreviewEntry). studio/index.html 로드 순서 참고.
========================================================== */


const studioInspectorToggleButton =
  document.getElementById("studioInspectorButton");

const studioInspectorShell =
  document.getElementById("studioPreviewShell");

const studioInspectorFrame =
  document.getElementById("studioPreviewFrame");

const studioInspectorStage =
  document.getElementById("studioPreviewStage");


/* =========================================================
   상태

   inspectorSelection은 "지금 고른 요소"의 **식별자와 좌표**만
   갖는다. 그 요소가 무엇인지(capability/바인딩/보호 여부)는 항상
   현재 SkinPackage에서 그때그때 다시 계산한다(describeInspectorSelection)
   — 스냅샷으로 들고 있으면 AI 적용/Code Apply/Undo로 스킨이 바뀐
   뒤에도 옛 판단이 화면에 남는다.
========================================================== */

let studioInspectorEnabled = false;

let studioInspectorSelection = null;

let studioInspectorHover = null;

let studioInspectorEditingOpen = false;

/* Direct Edit 1-step undo (요구사항 13절) — 바꾸기 **직전**의
   template html/css 한 벌. AI Undo와 통합하지 않는다(이번 Phase
   범위 밖) 대신, 두 경로 모두 applyWorkingSkinChanges() 하나만
   거치도록 해 두어 나중에 하나의 edit history로 합칠 때 막히지
   않게 한다. */
let studioInspectorUndo = null;

let studioInspectorLayer = null;

let studioInspectorHoverBox = null;

let studioInspectorSelectBox = null;

let studioInspectorPopover = null;

let studioInspectorPopoverTitle = null;

let studioInspectorFields = null;

let studioInspectorNote = null;

let studioInspectorUndoButton = null;

let studioInspectorDirectButton = null;


/* =========================================================
   Select mode 직접 편집 라운드 — 임시 상태

   여기 있는 값은 전부 "아직 확정되지 않은 것"이다. SkinPackage에도
   dirty에도 반영되지 않고, 선택이 바뀌거나 취소하면 흔적 없이
   사라진다(clearStudioInspectorTransient). 확정된 편집은 지금까지와
   똑같이 applyStudioInspectorPatch() 하나만 지난다.

     studioInspectorTextDraft   textarea에 입력 중인 문자열
     studioInspectorComposing   한글 조합 중인가(조합 중에는 미리보기
                                를 보내지 않는다 — 조합 문자열이
                                iframe 쪽 textContent와 엇갈린다)
     studioInspectorMetrics     iframe이 잰 선택 요소의 실제 크기
     studioInspectorDrag        모서리 핸들 드래그 중인 정보
     studioInspectorResizable   지금 선택이 크기 조절 가능한 이미지인가
                                (rects 메시지마다 template을 다시
                                파싱하지 않으려고 캐시한다)
========================================================== */

let studioInspectorTextDraft = null;

let studioInspectorComposing = false;

let studioInspectorMetrics = null;

let studioInspectorPreviewActive = false;

let studioInspectorDrag = null;

let studioInspectorResizable = false;

let studioInspectorSizeRange = null;

let studioInspectorSizeNumber = null;

let studioInspectorHandles = [];


/* 크기 조절 하한/상한. 상한은 항상 "부모 안쪽 폭"으로 한 번 더
   눌린다(studioInspectorSizeMax) — 모바일 가로 넘침 방지. */
const STUDIO_INSPECTOR_SIZE_MIN = 16;

const STUDIO_INSPECTOR_SIZE_MAX = 2000;

const STUDIO_INSPECTOR_HANDLE_CORNERS = ["nw", "ne", "sw", "se"];


const STUDIO_INSPECTOR_PAGE_LABELS = {
  home: "HOME",
  category: "CATEGORY",
  post: "POST",
  banner: "BANNER"
};

const STUDIO_INSPECTOR_KIND_LABELS = {
  text: "텍스트",
  image: "이미지",
  link: "링크",
  container: "영역"
};


/* =========================================================
   overlay DOM — 처음 켤 때 한 번만 만든다

   studio/index.html과 studio/studio-lifecycle-scenario.html 두
   문서에 같은 마크업을 복붙하지 않기 위해서다(AI 패널의 참고
   이미지 UI가 studio-ai-panel.js 안에서 만들어지는 것과 같은
   이유, studio/index.html 주석 참고).
========================================================== */

function buildStudioInspectorLayer() {

  if (studioInspectorLayer || !studioInspectorShell) {
    return;
  }

  studioInspectorLayer =
    document.createElement("div");

  studioInspectorLayer.className =
    "studio-inspector-layer";

  studioInspectorLayer.id =
    "studioInspectorLayer";

  studioInspectorLayer.hidden =
    true;

  studioInspectorHoverBox =
    document.createElement("div");

  studioInspectorHoverBox.className =
    "studio-inspector-outline studio-inspector-outline--hover";

  studioInspectorHoverBox.id =
    "studioInspectorHoverBox";

  studioInspectorHoverBox.hidden =
    true;

  studioInspectorSelectBox =
    document.createElement("div");

  studioInspectorSelectBox.className =
    "studio-inspector-outline studio-inspector-outline--selected";

  studioInspectorSelectBox.id =
    "studioInspectorSelectBox";

  studioInspectorSelectBox.hidden =
    true;

  studioInspectorPopover =
    document.createElement("div");

  studioInspectorPopover.className =
    "studio-inspector-popover";

  studioInspectorPopover.id =
    "studioInspectorPopover";

  studioInspectorPopover.hidden =
    true;

  studioInspectorPopoverTitle =
    document.createElement("p");

  studioInspectorPopoverTitle.className =
    "studio-inspector-popover-title";

  studioInspectorPopoverTitle.id =
    "studioInspectorPopoverTitle";

  const actions =
    document.createElement("div");

  actions.className =
    "studio-inspector-popover-actions";

  studioInspectorDirectButton =
    document.createElement("button");

  studioInspectorDirectButton.type =
    "button";

  studioInspectorDirectButton.className =
    "studio-inspector-action";

  studioInspectorDirectButton.id =
    "studioInspectorDirectButton";

  studioInspectorDirectButton.textContent =
    "직접 수정";

  const aiButton =
    document.createElement("button");

  aiButton.type =
    "button";

  aiButton.className =
    "studio-inspector-action studio-inspector-action--ai";

  aiButton.id =
    "studioInspectorAiButton";

  aiButton.textContent =
    "✦ AI 수정";

  actions.appendChild(studioInspectorDirectButton);
  actions.appendChild(aiButton);

  studioInspectorNote =
    document.createElement("p");

  studioInspectorNote.className =
    "studio-inspector-note";

  studioInspectorNote.id =
    "studioInspectorNote";

  studioInspectorNote.hidden =
    true;

  studioInspectorFields =
    document.createElement("div");

  studioInspectorFields.className =
    "studio-inspector-fields";

  studioInspectorFields.id =
    "studioInspectorFields";

  studioInspectorFields.hidden =
    true;

  studioInspectorUndoButton =
    document.createElement("button");

  studioInspectorUndoButton.type =
    "button";

  studioInspectorUndoButton.className =
    "studio-inspector-undo";

  studioInspectorUndoButton.id =
    "studioInspectorUndoButton";

  studioInspectorUndoButton.textContent =
    "되돌리기";

  studioInspectorUndoButton.hidden =
    true;

  studioInspectorPopover.appendChild(studioInspectorPopoverTitle);
  studioInspectorPopover.appendChild(actions);
  studioInspectorPopover.appendChild(studioInspectorNote);
  studioInspectorPopover.appendChild(studioInspectorFields);
  studioInspectorPopover.appendChild(studioInspectorUndoButton);

  studioInspectorLayer.appendChild(studioInspectorHoverBox);
  studioInspectorLayer.appendChild(studioInspectorSelectBox);

  /* 모서리 핸들 — 선택 테두리의 자식이 아니라 레이어의 형제로 둔다.
     테두리 박스는 Preview 영역과의 교집합으로 잘려 있어서(즉
     스크롤로 반쯤 나간 요소에서는 실제 모서리와 다른 자리다),
     핸들은 잘리지 않은 좌표로 따로 찍어야 한다. */
  studioInspectorHandles =
    STUDIO_INSPECTOR_HANDLE_CORNERS.map((corner) => {

      const handle =
        document.createElement("div");

      handle.className =
        `studio-inspector-handle studio-inspector-handle--${corner}`;

      handle.id =
        `studioInspectorHandle-${corner}`;

      handle.dataset.inspectorHandle =
        corner;

      handle.hidden =
        true;

      handle.addEventListener(
        "pointerdown",
        (event) => beginStudioInspectorHandleDrag(event, corner, handle)
      );

      /* move/up은 document에서 받는다(아래 리스너) — 포인터 캡처가
         걸리면 이벤트는 이 핸들을 거쳐 document까지 올라오고,
         캡처가 안 되는 환경에서도 document에는 도달하기 때문이다.
         한 곳에서만 받으면 두 경우를 따로 처리할 필요가 없다. */
      handle.addEventListener("lostpointercapture", cancelStudioInspectorHandleDrag);

      /* 브라우저 기본 드래그(핸들 자체를 끌고 가는 동작)를 막는다. */
      handle.addEventListener("dragstart", (event) => event.preventDefault());

      studioInspectorLayer.appendChild(handle);

      return handle;

    });

  studioInspectorLayer.appendChild(studioInspectorPopover);

  studioInspectorShell.appendChild(studioInspectorLayer);

  studioInspectorDirectButton.addEventListener(
    "click",
    () => {

      studioInspectorEditingOpen =
        !studioInspectorEditingOpen;

      renderStudioInspectorPopover();

    }
  );

  aiButton.addEventListener(
    "click",
    handleStudioInspectorAiRequest
  );

  studioInspectorUndoButton.addEventListener(
    "click",
    undoStudioInspectorEdit
  );

}


/* =========================================================
   좌표 변환 — iframe 안 좌표 -> Studio(뷰포트) 좌표

   Mobile 모드에서는 #studioPreviewFrameWrap에 CSS transform:
   scale()이 걸려 있다(studio.css). getBoundingClientRect()는 이미
   변환된 크기를 돌려주므로, 배율은 "실제로 그려진 폭 / 레이아웃
   폭"으로 구하면 정확하다 — 배율 값을 어디서도 따로 읽어올 필요가
   없고, 나중에 다른 변환이 추가돼도 이 식이 그대로 맞는다.

   테두리(모바일 프레임의 1px)는 iframe 요소의 border라 내부 문서
   좌표계의 원점이 그만큼 안쪽으로 밀린다 — offsetWidth는 border를
   포함하므로 배율 계산에는 문제가 없고, 원점만 보정하면 된다.
========================================================== */

function studioInspectorFrameGeometry() {

  const box =
    studioInspectorFrame.getBoundingClientRect();

  const layoutWidth =
    studioInspectorFrame.offsetWidth || box.width || 1;

  const scale =
    box.width / layoutWidth;

  const style =
    window.getComputedStyle(studioInspectorFrame);

  return {
    box,
    scale,
    borderLeft: parseFloat(style.borderLeftWidth) || 0,
    borderTop: parseFloat(style.borderTopWidth) || 0
  };

}


/* iframe 안에서 스크롤로 화면 밖에 나간 부분까지 테두리를 그리면
   Preview 바깥(Top Dock/AI 패널 위)에 선이 삐져나온다 — 항상
   Preview 영역과 교집합만 그린다. 교집합이 없으면 null. */
function studioInspectorMapRect(rect) {

  if (!rect || !studioInspectorFrame) {
    return null;
  }

  const geometry =
    studioInspectorFrameGeometry();

  const left =
    geometry.box.left + (geometry.borderLeft + rect.left) * geometry.scale;

  const top =
    geometry.box.top + (geometry.borderTop + rect.top) * geometry.scale;

  const right =
    left + rect.width * geometry.scale;

  const bottom =
    top + rect.height * geometry.scale;

  const clippedLeft =
    Math.max(left, geometry.box.left);

  const clippedTop =
    Math.max(top, geometry.box.top);

  const clippedRight =
    Math.min(right, geometry.box.right);

  const clippedBottom =
    Math.min(bottom, geometry.box.bottom);

  if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
    return null;
  }

  return {
    left: clippedLeft,
    top: clippedTop,
    width: clippedRight - clippedLeft,
    height: clippedBottom - clippedTop
  };

}


function paintStudioInspectorBox(element, rect) {

  if (!element) {
    return;
  }

  const mapped =
    studioInspectorMapRect(rect);

  if (!mapped) {
    element.hidden = true;
    return;
  }

  element.style.left = `${mapped.left}px`;
  element.style.top = `${mapped.top}px`;
  element.style.width = `${mapped.width}px`;
  element.style.height = `${mapped.height}px`;

  element.hidden = false;

}


/* =========================================================
   잘리지 않은 좌표 — 모서리 핸들과 드래그 기준점 계산용

   studioInspectorMapRect()는 Preview 영역과의 교집합만 돌려준다
   (테두리가 Top Dock 위로 삐져나가지 않게). 하지만 "반대쪽 모서리를
   기준으로 크기를 바꾼다"는 계산은 잘리기 전 좌표라야 맞다 —
   잘린 좌표를 쓰면 스크롤로 요소가 반쯤 나가 있을 때 기준점이
   화면 경계로 끌려와 드래그가 튄다.

   Desktop/Mobile 전환(scale)·AI 패널 여닫기·창 크기 변경은 전부
   getBoundingClientRect() 결과에 이미 반영돼 있으므로, 이 함수는
   부를 때마다 그 순간의 배율과 원점을 그대로 쓴다.
========================================================== */

function studioInspectorMapRectRaw(rect) {

  if (!rect || !studioInspectorFrame) {
    return null;
  }

  const geometry =
    studioInspectorFrameGeometry();

  const left =
    geometry.box.left + (geometry.borderLeft + rect.left) * geometry.scale;

  const top =
    geometry.box.top + (geometry.borderTop + rect.top) * geometry.scale;

  return {
    left,
    top,
    right: left + rect.width * geometry.scale,
    bottom: top + rect.height * geometry.scale,
    scale: geometry.scale,
    frame: geometry.box
  };

}


/* 핸들은 "지금 선택이 크기 조절 가능한 이미지"일 때만, 그리고 그
   모서리가 실제로 Preview 안에 보일 때만 그린다. */
function paintStudioInspectorHandles(rect) {

  if (!studioInspectorHandles.length) {
    return;
  }

  const mapped =
    studioInspectorResizable ? studioInspectorMapRectRaw(rect) : null;

  studioInspectorHandles.forEach((handle) => {

    if (!mapped) {
      handle.hidden = true;
      return;
    }

    const corner =
      handle.dataset.inspectorHandle;

    const x =
      corner.indexOf("w") === -1 ? mapped.right : mapped.left;

    const y =
      corner.indexOf("n") === -1 ? mapped.bottom : mapped.top;

    const inside =
      x >= mapped.frame.left - 1 &&
      x <= mapped.frame.right + 1 &&
      y >= mapped.frame.top - 1 &&
      y <= mapped.frame.bottom + 1;

    if (!inside) {
      handle.hidden = true;
      return;
    }

    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;

    handle.hidden = false;

  });

}


/* =========================================================
   팝오버 위치 — 선택 요소 rect 기준, 화면 밖으로 나가면 위/아래·
   좌/우 자동 보정(요구사항 6절). 기준 영역은 뷰포트가 아니라
   Preview stage다 — AI 패널이 열려 있을 때 팝오버가 그 아래로
   숨지 않게 하기 위해서다.
========================================================== */

const STUDIO_INSPECTOR_POPOVER_GAP = 8;

function placeStudioInspectorPopover(rect) {

  if (!studioInspectorPopover || studioInspectorPopover.hidden) {
    return;
  }

  const mapped =
    studioInspectorMapRect(rect);

  const bounds =
    studioInspectorStage
      ? studioInspectorStage.getBoundingClientRect()
      : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

  const size =
    studioInspectorPopover.getBoundingClientRect();

  const anchor =
    mapped || {
      left: bounds.left + 16,
      top: bounds.top + 16,
      width: 0,
      height: 0
    };

  let top =
    anchor.top + anchor.height + STUDIO_INSPECTOR_POPOVER_GAP;

  if (top + size.height > bounds.bottom - STUDIO_INSPECTOR_POPOVER_GAP) {

    const above =
      anchor.top - size.height - STUDIO_INSPECTOR_POPOVER_GAP;

    top =
      above >= bounds.top + STUDIO_INSPECTOR_POPOVER_GAP
        ? above
        : Math.max(
            bounds.top + STUDIO_INSPECTOR_POPOVER_GAP,
            bounds.bottom - size.height - STUDIO_INSPECTOR_POPOVER_GAP
          );

  }

  const left =
    Math.min(
      Math.max(anchor.left, bounds.left + STUDIO_INSPECTOR_POPOVER_GAP),
      Math.max(
        bounds.left + STUDIO_INSPECTOR_POPOVER_GAP,
        bounds.right - size.width - STUDIO_INSPECTOR_POPOVER_GAP
      )
    );

  studioInspectorPopover.style.left = `${left}px`;
  studioInspectorPopover.style.top = `${top}px`;

}


/* =========================================================
   지금 편집 대상이 되는 template

   Code Editor와 **같은 함수**로 고른다(resolveCodeEditorSource) —
   "지금 Preview가 보여주는 페이지를 그대로 편집한다"는 계약이
   두 기능에서 갈라지지 않게 하기 위해서다. banner 카테고리를
   legacy adapter로 보고 있는 중이면(스킨에 templates.banner가
   없는 경우) currentPreviewPageType이 "category"라 CATEGORY
   template이 대상이 되는데, 그 화면에는 애초에 edit id가 찍힌
   요소가 하나도 없어 선택 자체가 일어나지 않는다.
========================================================== */

function studioInspectorTemplateSource() {

  if (!currentWorkingSkin) {
    return null;
  }

  return (
    resolveCodeEditorSource(currentWorkingSkin, currentPreviewPageType) || null
  );

}


function studioInspectorSlotNames() {

  const declared =
    (currentWorkingSkin && Array.isArray(currentWorkingSkin.imageSlots))
      ? currentWorkingSkin.imageSlots
      : [];

  return {
    declaredSlotNames:
      declared
        .filter((slot) => slot && typeof slot.name === "string")
        .map((slot) => slot.name),
    requiredSlotNames:
      declared
        .filter((slot) => slot && typeof slot.name === "string" && slot.required === true)
        .map((slot) => slot.name)
  };

}


/* =========================================================
   describeStudioInspectorSelection()
     -> { info, declarations, source, stamped } | null

   선택된 id로 **지금** SkinPackage 안의 그 요소를 다시 찾아
   설명을 만든다. stamped를 함께 돌려주는 이유: 곧이어 수정할 때
   같은 doc을 그대로 쓰면 "찾기 -> 고치기"가 한 번의 파싱으로
   끝나고, 그 사이에 다른 파싱 결과와 어긋날 여지도 없다.
========================================================== */

function describeStudioInspectorSelection() {

  if (!studioInspectorSelection) {
    return null;
  }

  const source =
    studioInspectorTemplateSource();

  if (!source) {
    return null;
  }

  const stamped =
    window.stampInspectorEditIds(source.html);

  const element =
    stamped.doc.body.querySelector(
      `[data-imory-edit-id="${studioInspectorSelection.editId}"]`
    );

  if (!element) {
    return null;
  }

  return {
    stamped,
    source,
    element,
    info: window.describeInspectorElement(element, studioInspectorSlotNames()),
    declarations:
      window.readInspectorEditDeclarations(source.css, studioInspectorSelection.editId)
  };

}


function studioInspectorLabelFor(info) {

  const parts = [
    STUDIO_INSPECTOR_PAGE_LABELS[currentPreviewPageType] || "PAGE",
    `${STUDIO_INSPECTOR_KIND_LABELS[info.kind] || "요소"} <${info.tagName}>`
  ];

  const hint =
    (info.text || "").trim() ||
    info.bindPath ||
    info.srcPath ||
    info.hrefPath ||
    info.classNames[0] ||
    "";

  if (hint) {
    parts.push(hint.length > 20 ? `${hint.slice(0, 20)}…` : hint);
  }

  return parts.join(" · ");

}


/* =========================================================
   요소별 컨트롤 목록 — capabilities를 그대로 따른다

   "모든 요소에 같은 설정 목록을 보여주지 않는다"(요구사항 7절)는
   여기 한 곳에서만 결정된다. 컨트롤이 하나도 없으면 폼 자체를
   그리지 않고 이유만 보여준다.
========================================================== */

function buildStudioInspectorControls(info) {

  const can =
    info.capabilities;

  const controls = [];

  /* 텍스트 내용은 언제나 맨 위다 — 사용자가 가장 자주 하는 일이
     스타일 옵션 밑에 묻히지 않게. 고칠 수 없는 경우에도 자리는
     그대로 두고 "왜 없는지"를 그 자리에서 말해 준다(빈칸으로 두면
     고장으로 읽힌다). */
  if (can.text) {
    controls.push({ control: "text", type: "textBlock", label: "텍스트 내용" });
  } else if (
    info.bindPath &&
    (info.kind === "text" || info.kind === "link") &&
    !info.isProtectedRegion
  ) {
    controls.push({ control: "textBinding", type: "bindNote", label: "텍스트 내용" });
  }

  if (can.href) {
    controls.push({ control: "href", type: "text", label: "링크 주소" });
  }

  if (can.imageSource || can.imageClear) {
    controls.push({ control: "imageSource", type: "image", label: "이미지" });
  }

  if (can.size) {
    controls.push({ control: "size", type: "imageSize", label: "너비", unit: "px" });
  }

  if (can.shape && info.kind === "image") {
    controls.push({
      control: "shape",
      type: "choice",
      label: "모양",
      options: [["square", "사각형"], ["soft", "약간 둥글게"], ["circle", "원형"]]
    });
  }

  if (can.imageAlign) {
    controls.push({
      control: "imageAlign",
      type: "choice",
      label: "정렬",
      options: [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]]
    });
  }

  if (can.typography) {
    controls.push(
      { control: "fontSize", type: "number", label: "글자 크기", unit: "px" },
      {
        control: "fontWeight",
        type: "choice",
        label: "굵기",
        options: [["400", "보통"], ["500", "중간"], ["700", "굵게"]]
      }
    );
  }

  if (can.color) {
    controls.push({ control: "color", type: "color", label: "글자색" });
  }

  if (can.background) {
    controls.push({ control: "background", type: "color", label: "배경색" });
  }

  if (can.border) {
    controls.push({ control: "border", type: "border", label: "테두리" });
  }

  if (can.shape && info.kind !== "image") {
    controls.push({ control: "radius", type: "number", label: "모서리 둥글기", unit: "px" });
  }

  if (can.padding) {
    controls.push({ control: "padding", type: "number", label: "안쪽 여백", unit: "px" });
  }

  if (can.align) {
    controls.push({
      control: "align",
      type: "choice",
      label: "정렬",
      options: [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]]
    });
  }

  return controls;

}


/* =========================================================
   "왜 이건 못 고치나"를 말해 주는 안내문

   보호/바인딩 때문에 옵션이 빠진 자리를 빈칸으로 두지 않는다 —
   사용자는 그걸 고장으로 읽는다.
========================================================== */

/* =========================================================
   데이터 연결 텍스트 — "왜 입력칸이 없는가"를 한 줄로

   bind가 걸린 텍스트는 렌더 때마다 그 값으로 덮어써지므로 스킨
   문구로 고칠 수 없다. 그 사실만 말하면 사용자는 "고장인가?"로
   읽는다 — **어디서 고치는 값인지**까지 말한다.
========================================================== */

const STUDIO_INSPECTOR_BIND_NOTES = {
  "profile.nickname": "Settings에서 관리하는 닉네임입니다.",
  "profile.bio": "Settings에서 관리하는 소개글입니다.",
  "profile.avatarUrl": "Settings에서 관리하는 프로필 사진입니다.",
  "site.title": "Settings에서 관리하는 사이트 제목입니다.",
  "post.title": "글 제목이라 글 편집 화면에서 바뀝니다.",
  "post.createdAt": "글을 쓴 날짜라 글에서 옵니다.",
  "category.name": "카테고리 이름이라 카테고리 관리에서 바뀝니다.",
  "folder.name": "폴더 이름이라 카테고리 관리에서 바뀝니다.",
  "item.title": "목록에 들어오는 글 제목이라 글에서 옵니다.",
  "item.name": "목록 항목 이름이라 그 항목의 데이터에서 옵니다."
};


function studioInspectorBindNote(bindPath) {

  return (
    STUDIO_INSPECTOR_BIND_NOTES[bindPath] ||
    `${bindPath} 값으로 자동으로 채워지는 자리입니다.`
  );

}


function studioInspectorNoteFor(info) {

  if (info.isProtectedRegion) {
    return "이 자리는 글 본문이 표시되는 보호 영역이라 직접 수정할 수 없어요.";
  }

  const notes = [];

  if (info.bindPath) {
    notes.push(`내용은 ${info.bindPath} 값으로 자동으로 채워져요.`);
  }

  if (info.isViewerBinding) {
    notes.push("관리자용 링크라 주소는 바꿀 수 없어요.");
  } else if (info.hrefPath) {
    notes.push(`주소는 ${info.hrefPath} 값으로 자동으로 채워져요.`);
  }

  if (info.srcPath && info.kind === "image" && !info.imageSlot) {
    notes.push("글/배너 데이터에서 오는 이미지라 여기서 교체할 수 없어요.");
  }

  if (info.isInsideRepeat || info.isRepeatTemplate) {
    notes.push("반복되는 항목이라 같은 자리 전체에 함께 적용돼요.");
  }

  return notes.join(" ");

}


/* =========================================================
   폼 그리기
========================================================== */

function appendStudioInspectorRow(label, controlNode, clearHandler) {

  const row =
    document.createElement("label");

  row.className =
    "studio-inspector-row";

  const caption =
    document.createElement("span");

  caption.className =
    "studio-inspector-row-label";

  caption.textContent =
    label;

  row.appendChild(caption);
  row.appendChild(controlNode);

  if (clearHandler) {

    const clear =
      document.createElement("button");

    clear.type =
      "button";

    clear.className =
      "studio-inspector-clear";

    clear.textContent =
      "기본";

    clear.addEventListener("click", clearHandler);

    row.appendChild(clear);

  }

  studioInspectorFields.appendChild(row);

}


/* =========================================================
   텍스트 내용 블록 (Select mode 직접 편집 라운드)

   한 줄 input이 아니라 textarea다 — 스킨 문구는 두 줄짜리 인사말
   처럼 줄을 나누고 싶은 경우가 흔하다. 그리고 **입력 중에는 아무
   것도 확정하지 않는다**:

     입력 → Preview에만 임시 반영(postInspectorPreviewToFrame)
     적용 → 한 번의 편집으로 확정(= Undo 한 번으로 복원)
     취소 → 임시 반영을 걷어내고 원래 문구로 되돌린다

   이렇게 나눈 이유가 IME다. 예전처럼 글자마다 SkinPackage를 고치면
   그때마다 스킨 전체가 다시 그려지고, 그 사이에 있는 textarea는
   새로 만들어진다 — 한글 조합 중이면 조합이 끊기고 커서가 튄다.
   조합 중(compositionstart~end)에는 미리보기조차 보내지 않는다.
========================================================== */

function renderStudioInspectorTextBlock(spec, info) {

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    spec.label;

  const input =
    document.createElement("textarea");

  input.className =
    "studio-inspector-textarea";

  input.id =
    "studioInspectorTextInput";

  input.rows =
    3;

  input.dataset.inspectorControl =
    "text";

  /* 폼이 다시 그려져도(다른 컨트롤을 만졌다든가) 입력 중이던 값은
     잃지 않는다. */
  input.value =
    studioInspectorTextDraft === null
      ? (info.text || "")
      : studioInspectorTextDraft;

  input.addEventListener("compositionstart", () => {
    studioInspectorComposing = true;
  });

  input.addEventListener("compositionend", () => {
    studioInspectorComposing = false;
    studioInspectorTextDraft = input.value;
    sendStudioInspectorTextPreview();
  });

  input.addEventListener("input", () => {

    studioInspectorTextDraft =
      input.value;

    if (studioInspectorComposing) {
      return;
    }

    sendStudioInspectorTextPreview();

  });

  const actions =
    document.createElement("div");

  actions.className =
    "studio-inspector-block-actions";

  const apply =
    document.createElement("button");

  apply.type = "button";
  apply.className = "studio-inspector-block-button studio-inspector-block-button--primary";
  apply.id = "studioInspectorTextApply";
  apply.textContent = "적용";

  apply.addEventListener("click", commitStudioInspectorTextDraft);

  const cancel =
    document.createElement("button");

  cancel.type = "button";
  cancel.className = "studio-inspector-block-button";
  cancel.id = "studioInspectorTextCancel";
  cancel.textContent = "취소";

  cancel.addEventListener("click", cancelStudioInspectorTextDraft);

  actions.appendChild(apply);
  actions.appendChild(cancel);

  block.appendChild(caption);
  block.appendChild(input);
  block.appendChild(actions);

  studioInspectorFields.appendChild(block);

  /* 입력하던 중에 다른 컨트롤을 만져 폼이 다시 그려졌다면(그때
     스킨이 재렌더되면서 임시 반영이 사라진다) 미리보기를 다시
     보낸다 — 입력칸과 화면이 서로 다른 문구를 보이지 않게. */
  if (studioInspectorTextDraft !== null) {
    sendStudioInspectorTextPreview();
  }

}


function renderStudioInspectorBindNote(spec, info) {

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    spec.label;

  const note =
    document.createElement("p");

  note.className =
    "studio-inspector-block-note";

  note.id =
    "studioInspectorBindNote";

  note.dataset.inspectorControl =
    "textBinding";

  note.textContent =
    studioInspectorBindNote(info.bindPath);

  block.appendChild(caption);
  block.appendChild(note);

  studioInspectorFields.appendChild(block);

}


/* =========================================================
   이미지 너비 블록 — 슬라이더 + px 입력 + 기본으로 되돌리기

   초기값은 "지금 화면에 실제로 보이는 폭"이다(iframe이 잰 metrics).
   이미 이 요소에 크기 규칙을 써 둔 적이 있으면 그 값이 곧 보이는
   폭이므로 둘은 자연히 같다.

   상한은 부모 안쪽 폭이다 — 그보다 크게 만들 수 있게 두면 모바일
   Preview에서 곧바로 가로 넘침이 생긴다. (그래도 넘치지 않도록
   확정 규칙에는 max-width: 100%가 늘 함께 들어간다 —
   studio-inspector-model.js size 참고.)
========================================================== */

function studioInspectorSizeRatio(declarations) {

  const declared =
    Number(window.readInspectorControlValue("sizeRatio", declarations));

  if (Number.isFinite(declared) && declared > 0) {
    return declared;
  }

  const metrics =
    studioInspectorMetrics;

  if (metrics && metrics.width > 0 && metrics.height > 0) {
    return metrics.width / metrics.height;
  }

  if (metrics && metrics.naturalWidth > 0 && metrics.naturalHeight > 0) {
    return metrics.naturalWidth / metrics.naturalHeight;
  }

  return null;

}


function studioInspectorSizeBaseline(declarations) {

  const declared =
    Number(window.readInspectorControlValue("size", declarations));

  if (Number.isFinite(declared) && declared > 0) {
    return Math.round(declared);
  }

  const metrics =
    studioInspectorMetrics;

  return metrics && metrics.width > 0 ? Math.round(metrics.width) : null;

}


function studioInspectorSizeMax(currentWidth) {

  const metrics =
    studioInspectorMetrics;

  const parentWidth =
    metrics && metrics.parentWidth > 0 ? metrics.parentWidth : 0;

  const limit =
    Math.min(
      STUDIO_INSPECTOR_SIZE_MAX,
      parentWidth || STUDIO_INSPECTOR_SIZE_MAX
    );

  /* 이미 그보다 큰 값이 들어 있으면(스킨이 원래 그렇게 만들었다면)
     슬라이더가 그 값을 표현조차 못 하는 일이 없게 한다. */
  return Math.max(limit, currentWidth || 0, STUDIO_INSPECTOR_SIZE_MIN + 1);

}


function renderStudioInspectorSizeBlock(spec, info, declarations) {

  const baseline =
    studioInspectorSizeBaseline(declarations);

  const value =
    baseline || STUDIO_INSPECTOR_SIZE_MIN;

  const max =
    studioInspectorSizeMax(value);

  const block =
    document.createElement("div");

  block.className =
    "studio-inspector-block";

  const head =
    document.createElement("div");

  head.className =
    "studio-inspector-block-head";

  const caption =
    document.createElement("p");

  caption.className =
    "studio-inspector-block-label";

  caption.textContent =
    `${spec.label} (${spec.unit})`;

  const reset =
    document.createElement("button");

  reset.type = "button";
  reset.className = "studio-inspector-clear";
  reset.id = "studioInspectorSizeReset";
  reset.textContent = "기본";

  reset.addEventListener("click", () => {

    clearStudioInspectorPreview();

    commitStudioInspectorStyle("size", "");

  });

  head.appendChild(caption);
  head.appendChild(reset);

  const row =
    document.createElement("div");

  row.className =
    "studio-inspector-size-row";

  const range =
    document.createElement("input");

  range.type = "range";
  range.className = "studio-inspector-range";
  range.id = "studioInspectorSizeRange";
  range.dataset.inspectorControl = "sizeRange";
  range.min = String(STUDIO_INSPECTOR_SIZE_MIN);
  range.max = String(max);
  range.step = "1";
  range.value = String(value);

  const number =
    document.createElement("input");

  number.type = "number";
  number.className = "studio-inspector-input studio-inspector-input--number";
  number.id = "studioInspectorSizeNumber";
  number.dataset.inspectorControl = "size";
  number.min = String(STUDIO_INSPECTOR_SIZE_MIN);
  number.max = String(max);
  number.value = String(value);

  /* 슬라이더를 끄는 동안(input)은 미리보기만, 손을 뗐을 때(change)
     한 번만 확정한다 — 드래그 한 번 = Undo 한 번. */
  range.addEventListener("input", () => {
    previewStudioInspectorSize(Number(range.value), { from: "range" });
  });

  range.addEventListener("change", () => {
    commitStudioInspectorSize(Number(range.value));
  });

  number.addEventListener("input", () => {
    previewStudioInspectorSize(Number(number.value), { from: "number" });
  });

  number.addEventListener("change", () => {
    commitStudioInspectorSize(Number(number.value));
  });

  number.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
      event.preventDefault();
      commitStudioInspectorSize(Number(number.value));
    }

  });

  row.appendChild(range);
  row.appendChild(number);

  block.appendChild(head);
  block.appendChild(row);

  studioInspectorFields.appendChild(block);

  studioInspectorSizeRange = range;
  studioInspectorSizeNumber = number;

}


function renderStudioInspectorControl(spec, info, declarations) {

  const current =
    window.readInspectorControlValue(spec.control, declarations);

  if (spec.type === "textBlock") {

    renderStudioInspectorTextBlock(spec, info);

    return;

  }

  if (spec.type === "bindNote") {

    renderStudioInspectorBindNote(spec, info);

    return;

  }

  if (spec.type === "imageSize") {

    renderStudioInspectorSizeBlock(spec, info, declarations);

    return;

  }

  if (spec.type === "text") {

    const input =
      document.createElement("input");

    input.type = "text";
    input.className = "studio-inspector-input";
    input.dataset.inspectorControl = spec.control;

    input.value =
      info.staticHref || "";

    input.addEventListener("change", () => {
      commitStudioInspectorHref(input.value);
    });

    appendStudioInspectorRow(spec.label, input);

    return;

  }

  if (spec.type === "number") {

    const input =
      document.createElement("input");

    input.type = "number";
    input.min = "0";
    input.className = "studio-inspector-input studio-inspector-input--number";
    input.dataset.inspectorControl = spec.control;
    input.value = current;
    input.placeholder = "기본";

    input.addEventListener("change", () => {
      commitStudioInspectorStyle(spec.control, input.value);
    });

    appendStudioInspectorRow(
      `${spec.label}${spec.unit ? ` (${spec.unit})` : ""}`,
      input,
      () => commitStudioInspectorStyle(spec.control, "")
    );

    return;

  }

  if (spec.type === "color") {

    const input =
      document.createElement("input");

    input.type = "color";
    input.className = "studio-inspector-color";
    input.dataset.inspectorControl = spec.control;
    input.value = current || "#000000";

    input.addEventListener("change", () => {
      commitStudioInspectorStyle(spec.control, input.value);
    });

    appendStudioInspectorRow(
      spec.label,
      input,
      () => commitStudioInspectorStyle(spec.control, "")
    );

    return;

  }

  if (spec.type === "choice") {

    const group =
      document.createElement("span");

    group.className =
      "studio-inspector-choice";

    spec.options.forEach(([value, text]) => {

      const option =
        document.createElement("button");

      option.type = "button";
      option.className = "studio-inspector-choice-option";
      option.dataset.inspectorControl = spec.control;
      option.dataset.inspectorValue = value;
      option.textContent = text;

      if (current === value) {
        option.classList.add("is-active");
      }

      option.addEventListener("click", () => {
        commitStudioInspectorStyle(spec.control, current === value ? "" : value);
      });

      group.appendChild(option);

    });

    appendStudioInspectorRow(spec.label, group);

    return;

  }

  if (spec.type === "border") {

    const group =
      document.createElement("span");

    group.className =
      "studio-inspector-choice";

    const width =
      document.createElement("input");

    width.type = "number";
    width.min = "0";
    width.className = "studio-inspector-input studio-inspector-input--number";
    width.dataset.inspectorControl = "borderWidth";
    width.value = current.width;
    width.placeholder = "0";

    const color =
      document.createElement("input");

    color.type = "color";
    color.className = "studio-inspector-color";
    color.dataset.inspectorControl = "borderColor";
    color.value = current.color || "#000000";

    const apply = () =>
      commitStudioInspectorStyle("border", { width: width.value, color: color.value });

    width.addEventListener("change", apply);
    color.addEventListener("change", apply);

    group.appendChild(width);
    group.appendChild(color);

    appendStudioInspectorRow(
      spec.label,
      group,
      () => commitStudioInspectorStyle("border", { width: "", color: "" })
    );

    return;

  }

  if (spec.type === "image") {

    const group =
      document.createElement("span");

    group.className =
      "studio-inspector-choice";

    const change =
      document.createElement("button");

    change.type = "button";
    change.className = "studio-inspector-choice-option";
    change.id = "studioInspectorImageChange";
    change.textContent = "이미지 변경";
    change.disabled = !info.capabilities.imageSource;

    change.addEventListener("click", () => {

      if (typeof window.openSkinImagesPanel === "function") {
        window.openSkinImagesPanel();
      } else {
        showStudioToast("이미지 라이브러리를 열 수 없어요.", { isError: true });
      }

    });

    const clear =
      document.createElement("button");

    clear.type = "button";
    clear.className = "studio-inspector-choice-option";
    clear.id = "studioInspectorImageClear";
    clear.textContent = "이미지 제거";
    clear.disabled = !info.capabilities.imageClear;

    clear.addEventListener("click", () => {

      if (typeof window.setStudioImageSlot !== "function") {
        return;
      }

      if (window.setStudioImageSlot(info.imageSlot, null)) {
        showStudioToast("이미지를 비웠어요.");
      }

    });

    group.appendChild(change);
    group.appendChild(clear);

    appendStudioInspectorRow(
      `${spec.label} (${info.imageSlot || "슬롯 없음"})`,
      group
    );

    return;

  }

}


function renderStudioInspectorPopover() {

  if (!studioInspectorPopover) {
    return;
  }

  const resolved =
    describeStudioInspectorSelection();

  /* 폼을 다시 그리는 순간 이전 입력 요소 참조는 전부 죽는다 —
     드래그가 그 참조로 값을 쓰지 않도록 먼저 끊는다. */
  studioInspectorSizeRange = null;
  studioInspectorSizeNumber = null;

  if (!resolved) {

    studioInspectorPopover.hidden = true;
    studioInspectorSelectBox.hidden = true;

    studioInspectorResizable = false;

    paintStudioInspectorHandles(null);

    notifyStudioInspectorSelectionChanged();

    return;

  }

  studioInspectorResizable =
    resolved.info.kind === "image" &&
    resolved.info.capabilities.size === true;

  studioInspectorPopover.hidden =
    false;

  studioInspectorPopoverTitle.textContent =
    studioInspectorLabelFor(resolved.info);

  const note =
    studioInspectorNoteFor(resolved.info);

  studioInspectorNote.textContent =
    note;

  studioInspectorNote.hidden =
    !note;

  studioInspectorDirectButton.setAttribute(
    "aria-expanded",
    String(studioInspectorEditingOpen)
  );

  studioInspectorFields.innerHTML =
    "";

  studioInspectorFields.hidden =
    !studioInspectorEditingOpen;

  if (studioInspectorEditingOpen) {

    const controls =
      buildStudioInspectorControls(resolved.info);

    if (!controls.length) {

      const empty =
        document.createElement("p");

      empty.className =
        "studio-inspector-empty";

      empty.textContent =
        "이 요소에는 직접 수정할 수 있는 항목이 없어요.";

      studioInspectorFields.appendChild(empty);

    } else {

      controls.forEach((spec) => {
        renderStudioInspectorControl(spec, resolved.info, resolved.declarations);
      });

    }

  }

  studioInspectorUndoButton.hidden =
    !studioInspectorUndo;

  paintStudioInspectorHandles(
    studioInspectorSelection ? studioInspectorSelection.rect : null
  );

  placeStudioInspectorPopover(
    studioInspectorSelection ? studioInspectorSelection.rect : null
  );

  notifyStudioInspectorSelectionChanged();

}


/* =========================================================
   선택 변경 알림 (PHASE AI-6B)

   Inspector가 선택 상태의 주인이다(요구사항 10절). 다른 화면이
   그 상태를 복사해 들고 있지 않도록, 여기서는 "바뀌었다"만 알리고
   실제 값은 window.getStudioInspectorSelection()으로 다시 읽게
   한다 — AI 패널의 선택 chip(studio/ai/studio-ai-selection.js)이
   그렇게 동작한다.

   PHASE AI-6A에서는 이 파일이 AI 패널 본문에 chip 요소를 직접
   얹었다. 그 자리를 이벤트 하나로 바꿨다 — chip은 AI 패널의 UI라
   AI 쪽 파일이 갖는 편이 맞고, 그래야 chip에서 선택을 해제하는
   경로도 "AI가 Inspector에게 부탁한다" 한 방향으로 정리된다.
========================================================== */

function notifyStudioInspectorSelectionChanged() {

  window.dispatchEvent(
    new CustomEvent("studio-inspector-selection")
  );

}


/* =========================================================
   "✦ AI 수정" (PHASE AI-6B)

   ★ 이 버튼은 OpenAI를 부르지 않는다.
   하는 일은 "선택을 유지한 채 AI Assistant를 열고 입력칸에 커서를
   둔다"가 전부다. 실제 호출은 사용자가 문장을 쓰고 Send를 눌렀을
   때 studio/ai/studio-ai-panel.js가 한다(요구사항 1절).

   패널이 이미 열려 있으면 setStudioAiPanelOpen()은 아무 것도 하지
   않고 포커스도 옮기지 않는다 — 그래서 포커스는 여기서 한 번 더
   직접 준다. 두 번 눌러도 결과가 같아야 한다.
========================================================== */

function handleStudioInspectorAiRequest() {

  if (!describeStudioInspectorSelection()) {
    return;
  }

  if (typeof window.setStudioAiPanelOpen === "function") {
    window.setStudioAiPanelOpen(true);
  }

  if (typeof window.renderStudioAiSelectionChip === "function") {
    window.renderStudioAiSelectionChip();
  }

  const input =
    document.getElementById("studioAiDrawerInput");

  if (input) {
    input.focus();
  }

}


/* =========================================================
   DIRECT EDIT 적용

   모든 수정이 이 함수 하나를 지난다(요구사항 13절 "state mutation
   경로를 한 곳으로"). 하는 일 순서:

     1. 지금 template을 stamp해서 대상 요소를 찾는다
     2. patch(요소를 고치거나 css를 바꾼다)
     3. 임시 id를 전부 걷어내고 **이 요소의 id만** 남긴다
     4. sanitize -> applyStudioDirectEdit(= Code Apply와 같은 경로)

   실패하면 working draft는 한 글자도 바뀌지 않는다 — 3단계까지는
   전부 파싱된 사본 위에서만 일어나고, 실제 반영은 4단계 한 번뿐
   이기 때문이다.
========================================================== */

function applyStudioInspectorPatch(patch) {

  if (!studioInspectorSelection || !currentWorkingSkin) {
    return false;
  }

  const pageType =
    currentPreviewPageType;

  const source =
    studioInspectorTemplateSource();

  if (!source) {
    return false;
  }

  const editId =
    studioInspectorSelection.editId;

  const stamped =
    window.stampInspectorEditIds(source.html);

  const element =
    stamped.doc.body.querySelector(`[data-imory-edit-id="${editId}"]`);

  if (!element) {

    showStudioToast("선택한 요소를 더 이상 찾을 수 없어요.", { isError: true });

    clearStudioInspectorSelection();

    return false;

  }

  let nextCss =
    source.css;

  const result =
    patch(element, source.css) || {};

  if (typeof result.css === "string") {
    nextCss = result.css;
  }

  const nextHtml =
    window.commitInspectorEditId(stamped, editId);

  const snapshot = {
    pageType,
    html: source.html,
    css: source.css
  };

  try {

    window.applyStudioDirectEdit(
      pageType,
      sanitizeSkinHTML(nextHtml),
      nextCss
    );

  } catch (err) {

    console.error("[studio-inspector] direct edit failed", err);

    showStudioToast(
      err?.message || "직접 수정을 적용하지 못했어요.",
      { isError: true }
    );

    return false;

  }

  studioInspectorUndo =
    snapshot;

  renderStudioInspectorPopover();

  return true;

}


/* 지금 규칙에 이 컨트롤의 값만 덮어쓴 CSS 문자열을 만든다.
   commitStudioInspectorStyle()과 같은 계산을 두 번 쓰지 않으려고
   따로 뺐다 — 텍스트 확정은 HTML과 CSS를 **한 번에** 바꿔야 하기
   때문이다(줄바꿈 유지용 white-space). */
function mergeStudioInspectorDeclarations(css, editId, control, value) {

  const declarations =
    window.readInspectorEditDeclarations(css, editId);

  const patch =
    window.buildInspectorStylePatch(control, value);

  Object.keys(patch).forEach((property) => {

    if (patch[property] === null) {
      delete declarations[property];
    } else {
      declarations[property] = patch[property];
    }

  });

  return window.writeInspectorEditDeclarations(css, editId, declarations);

}


function commitStudioInspectorText(value) {

  const text =
    String(value);

  return applyStudioInspectorPatch((element, css) => {

    /* textContent만 쓴다 — 사용자가 무엇을 입력하든 마크업으로
       해석되지 않는다(skin-render.js의 데이터 주입 원칙과 동일). */
    element.textContent =
      text;

    /* 줄바꿈은 textContent 안에 그대로 들어가지만, HTML에서는 그냥
       공백으로 접힌다 — 저장 후 다시 불러와도 화면에 남게 하려면
       white-space를 함께 올려야 한다(= 규칙 하나가 더 붙는다).
       한 줄로 되돌리면 그 규칙도 같이 사라진다. */
    return {
      css: mergeStudioInspectorDeclarations(
        css,
        studioInspectorSelection.editId,
        "whiteSpace",
        text.indexOf("\n") === -1 ? "" : "pre-wrap"
      )
    };

  });

}


function commitStudioInspectorHref(value) {

  const trimmed =
    String(value || "").trim();

  if (trimmed && !isSafeSkinUrl(trimmed)) {

    showStudioToast(
      "https 주소 또는 사이트 내부 경로만 넣을 수 있어요.",
      { isError: true }
    );

    return;

  }

  applyStudioInspectorPatch((element) => {

    if (trimmed) {
      element.setAttribute("href", trimmed);
    } else {
      element.removeAttribute("href");
    }

    return {};

  });

}


function commitStudioInspectorStyle(control, value) {

  return applyStudioInspectorPatch((element, css) => ({
    css: mergeStudioInspectorDeclarations(
      css,
      studioInspectorSelection.editId,
      control,
      value
    )
  }));

}


/* =========================================================
   임시 미리보기 (Select mode 직접 편집 라운드)

   확정과 임시를 자로 자르듯 나눈다:

     임시  postInspectorPreviewToFrame() — iframe의 live DOM만 바뀐다.
           SkinPackage도 dirty도 Undo도 그대로다. Save/Publish가 읽는
           것은 SkinPackage뿐이므로 여기서 무엇을 하든 저장되지
           않는다.
     확정  applyStudioInspectorPatch() — 예전부터 있던 그 경로 하나.

   그래서 "취소·선택 해제·페이지 전환에서 임시 변경이 남지 않는다"는
   clearStudioInspectorPreview() 한 줄로 지켜진다.
========================================================== */

function sendStudioInspectorPreview(payload) {

  /* 임시 반영이 화면에 떠 있는 동안 iframe이 재는 크기는 "지금
     보이는 임시 크기"다 — 그 값을 확정값의 기준(baseline)으로
     삼으면 "바뀐 게 없다"고 판단해 확정이 통째로 사라진다. 그래서
     떠 있는 동안에는 실측값을 받아들이지 않는다(아래 rects 처리). */
  studioInspectorPreviewActive =
    !!payload;

  if (typeof window.postInspectorPreviewToFrame !== "function") {
    return;
  }

  window.postInspectorPreviewToFrame(payload);

}


function clearStudioInspectorPreview() {

  sendStudioInspectorPreview(null);

}


function sendStudioInspectorTextPreview() {

  if (!studioInspectorSelection || studioInspectorTextDraft === null) {
    return;
  }

  sendStudioInspectorPreview({
    editId: studioInspectorSelection.editId,
    text: studioInspectorTextDraft
  });

}


function commitStudioInspectorTextDraft() {

  if (!studioInspectorSelection || studioInspectorTextDraft === null) {
    return;
  }

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return;
  }

  const value =
    studioInspectorTextDraft;

  studioInspectorTextDraft =
    null;

  studioInspectorComposing =
    false;

  /* 내용이 그대로면 편집 이력을 만들지 않는다. */
  if (value === (resolved.info.text || "")) {

    clearStudioInspectorPreview();

    renderStudioInspectorPopover();

    return;

  }

  clearStudioInspectorPreview();

  if (commitStudioInspectorText(value)) {
    showStudioToast("문구를 바꿨어요.");
  }

}


function cancelStudioInspectorTextDraft() {

  studioInspectorTextDraft =
    null;

  studioInspectorComposing =
    false;

  clearStudioInspectorPreview();

  /* 폼을 다시 그리면 textarea가 원래 문구로 채워진다. */
  renderStudioInspectorPopover();

}


/* =========================================================
   이미지 너비 — 임시 반영 / 확정

   슬라이더·숫자칸·모서리 드래그 셋이 같은 함수 두 개를 쓴다.
   그래서 "숫자·슬라이더·드래그 결과가 서로 다르다"가 구조적으로
   생기지 않는다.
========================================================== */

function studioInspectorClampSize(width) {

  const value =
    Math.round(Number(width));

  if (!Number.isFinite(value)) {
    return null;
  }

  const max =
    studioInspectorSizeMax(
      studioInspectorSizeNumber ? Number(studioInspectorSizeNumber.max) : 0
    );

  return Math.min(Math.max(value, STUDIO_INSPECTOR_SIZE_MIN), max);

}


function syncStudioInspectorSizeInputs(width, options) {

  const from =
    (options && options.from) || "";

  if (studioInspectorSizeRange && from !== "range") {
    studioInspectorSizeRange.value = String(width);
  }

  if (studioInspectorSizeNumber && from !== "number") {
    studioInspectorSizeNumber.value = String(width);
  }

}


function previewStudioInspectorSize(width, options) {

  const value =
    studioInspectorClampSize(width);

  if (value === null || !studioInspectorSelection) {
    return;
  }

  syncStudioInspectorSizeInputs(value, options);

  /* 드래그는 시작할 때 잰 비율을 끝까지 그대로 쓴다 — 미리보기가
     매 프레임 다시 재면 반올림이 조금씩 누적된다. */
  const ratio =
    (options && Number.isFinite(options.ratio) && options.ratio > 0)
      ? options.ratio
      : (() => {

          const resolved =
            describeStudioInspectorSelection();

          return resolved ? studioInspectorSizeRatio(resolved.declarations) : null;

        })();

  sendStudioInspectorPreview({
    editId: studioInspectorSelection.editId,
    width: value,
    ratio: ratio || undefined
  });

}


function commitStudioInspectorSize(width, options) {

  const value =
    studioInspectorClampSize(width);

  if (value === null || !studioInspectorSelection) {
    return false;
  }

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return false;
  }

  /* 실제 크기가 그대로면 편집 이력을 만들지 않는다(요구사항 3절). */
  if (value === studioInspectorSizeBaseline(resolved.declarations)) {

    clearStudioInspectorPreview();

    syncStudioInspectorSizeInputs(value, {});

    return false;

  }

  const ratio =
    (options && Number.isFinite(options.ratio) && options.ratio > 0)
      ? options.ratio
      : studioInspectorSizeRatio(resolved.declarations);

  clearStudioInspectorPreview();

  return commitStudioInspectorStyle("size", { width: value, ratio });

}


/* =========================================================
   모서리 드래그

   ★ 기준점은 **반대쪽 모서리**다. 드래그를 시작한 순간의 화면
   좌표로 한 번만 잡아 두고, 그 뒤로는 포인터와 그 점 사이의 거리만
   본다 — 그래서 드래그 중 이미지가 커지면서 자기 자리가 밀려도
   (일반 흐름 배치라 그렇다) 계산이 흔들리지 않는다. 페이지를
   절대좌표 배치로 바꾸지 않는 이유이자, 바꿀 필요가 없는 이유다.

   ★ 배율/스크롤은 studioInspectorMapRectRaw()가 이미 반영한 화면
   좌표에서 시작하므로, 포인터 이동량을 iframe 안 px로 되돌릴 때
   scale로 나누기만 하면 된다(Mobile Preview의 축소, AI 패널을
   여닫아 생기는 이동, 창 크기 변경 모두 같은 식으로 처리된다).

   ★ 포인터는 핸들이 캡처한다. 그래서 포인터가 이미지 밖으로,
   iframe 밖으로, 심지어 창 밖으로 나가도 move/up이 계속 이 핸들로
   온다 — "드래그가 끊긴다"도 "계속 붙잡힌 채로 남는다"도 없다
   (lostpointercapture는 취소로 받는다).
========================================================== */

function beginStudioInspectorHandleDrag(event, corner, handle) {

  if (
    !studioInspectorEnabled ||
    !studioInspectorResizable ||
    !studioInspectorSelection ||
    studioInspectorDrag
  ) {
    return;
  }

  const mapped =
    studioInspectorMapRectRaw(studioInspectorSelection.rect);

  if (!mapped || !mapped.scale) {
    return;
  }

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const startWidth =
    studioInspectorSizeBaseline(resolved.declarations) ||
    Math.round(studioInspectorSelection.rect.width);

  studioInspectorDrag = {
    pointerId: event.pointerId,
    handle,
    corner,
    scale: mapped.scale,
    /* 반대쪽 모서리 */
    anchorX: corner.indexOf("w") === -1 ? mapped.left : mapped.right,
    anchorY: corner.indexOf("n") === -1 ? mapped.top : mapped.bottom,
    ratio: studioInspectorSizeRatio(resolved.declarations),
    startWidth,
    width: startWidth,
    frame: 0
  };

  try {
    handle.setPointerCapture(event.pointerId);
  } catch (err) {
    /* 캡처가 안 되는 환경(오래된 WebKit 등)에서도 아래 document
       리스너가 move/up을 받아 준다 — 기능이 없어지지는 않는다. */
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.add("is-dragging");
  }

}


function moveStudioInspectorHandleDrag(event) {

  const drag =
    studioInspectorDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  const dx =
    Math.abs(event.clientX - drag.anchorX) / drag.scale;

  const dy =
    (Math.abs(event.clientY - drag.anchorY) / drag.scale) * (drag.ratio || 1);

  /* 비율이 고정돼 있으므로 가로/세로 중 하나만 보면 대각선 드래그가
     한쪽 축에서만 반응하는 느낌이 된다 — 두 축이 각각 요구하는
     너비의 평균을 쓴다. */
  const next =
    studioInspectorClampSize(drag.ratio ? (dx + dy) / 2 : dx);

  if (next === null || next === drag.width) {
    return;
  }

  drag.width =
    next;

  /* pointermove마다 postMessage를 쏘지 않는다 — 한 프레임에 한 번만
     보낸다(요구사항 4절 "매 pointermove마다 재렌더/Undo 금지"). */
  if (!drag.frame) {

    drag.frame =
      window.requestAnimationFrame(() => {

        drag.frame = 0;

        if (studioInspectorDrag === drag) {
          previewStudioInspectorSize(drag.width, { ratio: drag.ratio });
        }

      });

  }

}


function finishStudioInspectorDrag(drag) {

  if (drag.frame) {
    window.cancelAnimationFrame(drag.frame);
  }

  try {

    if (drag.handle.hasPointerCapture && drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }

  } catch (err) {
    /* 이미 풀렸으면 그만이다 */
  }

  studioInspectorDrag =
    null;

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.remove("is-dragging");
  }

}


function endStudioInspectorHandleDrag(event) {

  const drag =
    studioInspectorDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  finishStudioInspectorDrag(drag);

  /* 실제로 크기가 변하지 않았으면 아무 것도 확정하지 않는다 —
     임시 반영만 걷어낸다(= 이력도 생기지 않는다). */
  if (drag.width === drag.startWidth) {

    clearStudioInspectorPreview();

    syncStudioInspectorSizeInputs(drag.startWidth, {});

    return;

  }

  commitStudioInspectorSize(drag.width, { ratio: drag.ratio });

}


function cancelStudioInspectorHandleDrag(event) {

  const drag =
    studioInspectorDrag;

  if (!drag || (event && event.pointerId !== drag.pointerId)) {
    return;
  }

  finishStudioInspectorDrag(drag);

  clearStudioInspectorPreview();

  syncStudioInspectorSizeInputs(drag.startWidth, {});

}


/* 선택이 바뀌거나 모드를 끄거나 페이지가 바뀔 때 — 확정되지 않은
   것은 전부 여기서 사라진다. */
function clearStudioInspectorTransient() {

  if (studioInspectorDrag) {
    cancelStudioInspectorHandleDrag(null);
  }

  studioInspectorTextDraft = null;
  studioInspectorComposing = false;
  studioInspectorSizeRange = null;
  studioInspectorSizeNumber = null;

  clearStudioInspectorPreview();

}


function undoStudioInspectorEdit() {

  if (!studioInspectorUndo) {
    return;
  }

  const snapshot =
    studioInspectorUndo;

  studioInspectorUndo =
    null;

  try {

    window.applyStudioDirectEdit(
      snapshot.pageType,
      snapshot.html,
      snapshot.css
    );

    showStudioToast("직접 수정을 되돌렸어요.");

  } catch (err) {

    console.error("[studio-inspector] undo failed", err);

    showStudioToast("되돌리지 못했어요.", { isError: true });

  }

  renderStudioInspectorPopover();

}


/* =========================================================
   선택 / hover 상태
========================================================== */

function clearStudioInspectorSelection() {

  /* 확정되지 않은 입력/드래그가 남아 있으면 먼저 걷어낸다 —
     선택이 사라진 뒤에 걷어내려 하면 어느 요소에 되돌릴지 알 수
     없다. */
  clearStudioInspectorTransient();

  studioInspectorSelection =
    null;

  studioInspectorEditingOpen =
    false;

  studioInspectorMetrics =
    null;

  studioInspectorResizable =
    false;

  paintStudioInspectorHandles(null);

  if (studioInspectorSelectBox) {
    studioInspectorSelectBox.hidden = true;
  }

  if (studioInspectorPopover) {
    studioInspectorPopover.hidden = true;
  }

  notifyStudioInspectorSelectionChanged();

  if (typeof window.postInspectorSelectionToFrame === "function") {
    window.postInspectorSelectionToFrame(null);
  }

}


function setStudioInspectorSelection(editId, tagName, rect, metrics) {

  if (!editId || !window.isValidInspectorEditId(editId)) {
    clearStudioInspectorSelection();
    return;
  }

  const isSameElement =
    !!studioInspectorSelection && studioInspectorSelection.editId === editId;

  /* 다른 요소로 옮겨가면 이전 요소에서 입력하던 값은 버린다 —
     "적용"을 누르지 않았으므로 확정된 적이 없다. */
  if (!isSameElement) {
    clearStudioInspectorTransient();
  }

  studioInspectorSelection = {
    editId,
    tagName: tagName || null,
    rect: rect || null
  };

  studioInspectorMetrics =
    metrics || null;

  /* 다른 요소를 새로 고르면 폼은 접힌 상태에서 시작한다 —
     팝오버가 곧바로 커다랗게 열려 Preview를 가리지 않게. */
  if (!isSameElement) {
    studioInspectorEditingOpen = false;
  }

  paintStudioInspectorBox(studioInspectorSelectBox, rect);

  renderStudioInspectorPopover();

}


/* =========================================================
   iframe -> Studio 메시지 (studio-preview.js가 그대로 넘겨준다)

   origin/source는 그쪽에서 이미 확인했다 — 여기서는 shape만 본다.
========================================================== */

function handleStudioInspectorMessage(data) {

  if (!studioInspectorEnabled) {
    return;
  }

  if (data.type === "preview:inspect-escape") {
    clearStudioInspectorSelection();
    return;
  }

  if (data.type === "preview:inspect-hover") {

    studioInspectorHover =
      data.rect || null;

    paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);

    return;

  }

  if (data.type === "preview:inspect-select") {

    setStudioInspectorSelection(
      data.editId,
      data.tagName,
      data.rect,
      data.metrics
    );

    return;

  }

  if (data.type === "preview:inspect-rects") {

    studioInspectorHover =
      (data.hover && data.hover.rect) || null;

    paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);

    if (!studioInspectorSelection) {
      return;
    }

    if (!data.selected || !data.selected.rect) {

      /* 재렌더 뒤 그 요소가 사라졌다(다른 페이지로 이동했거나
         스킨이 바뀌었다) — 선택을 유지하면 좌표 없는 팝오버만
         남으므로 정리한다. */
      clearStudioInspectorSelection();

      return;

    }

    studioInspectorSelection.rect =
      data.selected.rect;

    /* 임시 미리보기(입력 중/드래그 중)가 떠 있는 동안에는 실측값을
       받아들이지 않는다 — 지금 화면에 보이는 크기는 아직 확정된
       것이 아니라서, 그 값을 기준으로 삼으면 (1) 사용자의 손과
       숫자가 서로를 쫓아다니고 (2) "바뀐 게 없다"는 판정이 잘못
       나온다. 좌표(테두리/핸들)만 따라간다. */
    if (!studioInspectorDrag && !studioInspectorPreviewActive) {
      studioInspectorMetrics = data.selected.metrics || studioInspectorMetrics;
    }

    paintStudioInspectorBox(studioInspectorSelectBox, data.selected.rect);

    paintStudioInspectorHandles(data.selected.rect);

    placeStudioInspectorPopover(data.selected.rect);

    return;

  }

}


/* =========================================================
   Inspector 켜고 끄기

   켜고 끌 때마다 지금 화면을 다시 그린다 — Preview로 나가는
   skin에 임시 id를 넣고/빼야 하기 때문이다(postRenderToFrame의
   stampSkinForInspector). 재렌더 경로는 preview-navigation.js의
   renderCurrentPreviewEntry() 하나를 그대로 쓴다(새 렌더 분기를
   만들지 않는다).
========================================================== */

function setStudioInspectorEnabled(enabled) {

  const next =
    !!enabled && !!currentWorkingSkin;

  if (next === studioInspectorEnabled) {
    return;
  }

  studioInspectorEnabled =
    next;

  if (next) {
    buildStudioInspectorLayer();
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.hidden = !next;
  }

  if (!next) {

    clearStudioInspectorSelection();

    studioInspectorHover = null;
    studioInspectorUndo = null;

    if (studioInspectorHoverBox) {
      studioInspectorHoverBox.hidden = true;
    }

    studioInspectorHandles.forEach((handle) => {
      handle.hidden = true;
    });

  }

  if (studioInspectorToggleButton) {

    studioInspectorToggleButton.setAttribute(
      "aria-pressed",
      String(next)
    );

    studioInspectorToggleButton.classList.toggle(
      "studio-corner-button--active",
      next
    );

  }

  if (typeof window.postInspectorModeToFrame === "function") {
    window.postInspectorModeToFrame(next);
  }

  if (currentWorkingSkin && typeof renderCurrentPreviewEntry === "function") {
    renderCurrentPreviewEntry();
  }

}


function stampSkinForInspector(skin) {

  if (!studioInspectorEnabled || !skin || typeof skin.html !== "string") {
    return skin;
  }

  try {

    return {
      ...skin,
      html: window.stampInspectorEditIds(skin.html).html
    };

  } catch (err) {

    console.warn("[studio-inspector] stamp failed, rendering without edit ids", err);

    return skin;

  }

}


if (studioInspectorToggleButton) {

  studioInspectorToggleButton.addEventListener(
    "click",
    () => setStudioInspectorEnabled(!studioInspectorEnabled)
  );

}


/*
  Escape는 두 문서에서 모두 받는다 — 포커스가 Studio(팝오버 입력칸
  등)에 있을 때는 iframe의 keydown이 오지 않는다. 어느 쪽으로
  들어와도 처리는 여기 한 곳이다: 선택만 풀고 Inspector mode 자체는
  유지한다(요구사항 5절).
*/
document.addEventListener(
  "keydown",
  (event) => {

    if (!studioInspectorEnabled || event.key !== "Escape") {
      return;
    }

    /* 드래그 중 Escape는 "시작 전 크기로 되돌리기"다 —
       선택까지 풀어 버리면 사용자는 되돌아간 결과를 확인할 수
       없다(요구사항 3절). */
    if (studioInspectorDrag) {

      event.preventDefault();

      cancelStudioInspectorHandleDrag(null);

      return;

    }

    /* 텍스트를 입력하던 중이면 그 입력만 취소한다. */
    if (studioInspectorTextDraft !== null) {

      event.preventDefault();

      cancelStudioInspectorTextDraft();

      return;

    }

    if (!studioInspectorSelection) {
      return;
    }

    clearStudioInspectorSelection();

  }
);


/*
  모서리 드래그의 move/up — 핸들이 아니라 document에서 받는다.

  포인터를 캡처했으면 이벤트의 target은 계속 그 핸들이고, 캡처가
  안 되는 환경에서는 포인터 아래의 아무 요소나 target이 된다. 어느
  쪽이든 document까지는 올라오므로, 여기 한 곳만 보면 "이미지 밖으로
  나갔다 / iframe 위로 지나갔다 / 창 밖으로 나갔다"를 따로 다루지
  않아도 된다. 드래그 중이 아니면 첫 줄에서 빠져나간다.
*/
document.addEventListener("pointermove", moveStudioInspectorHandleDrag);

document.addEventListener("pointerup", endStudioInspectorHandleDrag);

document.addEventListener("pointercancel", cancelStudioInspectorHandleDrag);


/*
  Studio 쪽 레이아웃이 바뀌면(AI 패널 여닫기/폭 드래그/창 크기)
  iframe 안 좌표는 그대로여도 화면 위 위치는 달라진다 — 다시
  칠한다. 좌표 자체를 다시 물어보지는 않는다(iframe 안에서 아무
  일도 일어나지 않았으므로).
*/
function repaintStudioInspectorOverlay() {

  if (!studioInspectorEnabled) {
    return;
  }

  paintStudioInspectorBox(studioInspectorHoverBox, studioInspectorHover);

  if (studioInspectorSelection) {
    paintStudioInspectorBox(studioInspectorSelectBox, studioInspectorSelection.rect);
    paintStudioInspectorHandles(studioInspectorSelection.rect);
    placeStudioInspectorPopover(studioInspectorSelection.rect);
  }

}


window.addEventListener("resize", repaintStudioInspectorOverlay);


/*
  창 크기만으로는 부족하다 — AI 패널을 여닫거나 폭을 끌면 창은
  그대로인 채 Preview stage만 좁아진다. Mobile Preview는 그 stage
  **가운데**에 놓이므로, 그때 iframe은 크기뿐 아니라 위치까지
  옆으로 밀린다(테두리와 핸들이 원래 자리에 남아 요소에서 떨어진다).

  stage 크기 변화 하나만 보면 세 경우(여닫기·폭 드래그·창 크기)를
  모두 덮는다. studio-preview.js가 같은 요소에 이미 Mobile 축소
  배율용 ResizeObserver를 달아 두었고(먼저 등록되어 먼저 실행된다),
  여기서는 그 결과가 반영된 좌표로 다시 칠하기만 한다.
*/
if (studioInspectorStage && typeof ResizeObserver === "function") {

  new ResizeObserver(
    repaintStudioInspectorOverlay
  ).observe(
    studioInspectorStage
  );

}


if (typeof window !== "undefined") {

  window.setStudioInspectorEnabled =
    setStudioInspectorEnabled;

  window.stampSkinForInspector =
    stampSkinForInspector;

  window.handleStudioInspectorMessage =
    handleStudioInspectorMessage;

  /* AI 패널의 선택 chip(×)이 부른다 — 선택 해제의 경로를
     Inspector 한 곳으로 유지하기 위해서다(요구사항 10절). */
  window.clearStudioInspectorSelection =
    clearStudioInspectorSelection;

  /* =========================================================
     선택 요소의 지금 상태. studio/ai/studio-ai-selection.js가
     이 값 하나로 chip 문구와 서버로 보낼 selectionContext를
     만든다(PHASE AI-6B) — 선택 상태의 복사본을 그쪽에 두지
     않기 위해, 필요할 때마다 여기서 다시 계산해 간다.

     여기 담기는 것은 전부 **현재 SkinPackage에서 다시 계산한**
     값이다. 스냅샷이 아니므로 Code Apply/Import/AI 적용 뒤에도
     옛 판단이 남지 않는다(describeStudioInspectorSelection 주석).
  ========================================================== */
  window.getStudioInspectorSelection =
    function () {

      const resolved =
        describeStudioInspectorSelection();

      if (!studioInspectorEnabled || !resolved) {
        return null;
      }

      return {
        pageType: currentPreviewPageType,
        editId: studioInspectorSelection.editId,
        tagName: resolved.info.tagName,
        kind: resolved.info.kind,
        label: studioInspectorLabelFor(resolved.info),
        classNames: resolved.info.classNames,
        bindPath: resolved.info.bindPath,
        srcPath: resolved.info.srcPath,
        hrefPath: resolved.info.hrefPath,
        region: resolved.info.region,
        isProtectedRegion: resolved.info.isProtectedRegion,
        isViewerBinding: resolved.info.isViewerBinding,
        repeatPath: resolved.info.repeatPath,
        isInsideRepeat: resolved.info.isInsideRepeat,
        text: resolved.info.text,
        imageSlot: resolved.info.imageSlot,
        capabilities: resolved.info.capabilities
      };

    };

  /* 테스트(studio/studio-inspector-e2e-test.mjs)가 내부 변수를
     들여다보지 않고도 상태를 확인할 수 있게 하는 읽기 전용 창구.
     production 코드는 이 전역을 참조하지 않는다. */
  window.getStudioInspectorState =
    function () {

      return {
        enabled: studioInspectorEnabled,
        editingOpen: studioInspectorEditingOpen,
        hasUndo: !!studioInspectorUndo,
        selection:
          studioInspectorSelection
            ? { ...studioInspectorSelection }
            : null,
        hover: studioInspectorHover ? { ...studioInspectorHover } : null,

        /* Select mode 직접 편집 라운드 — 확정되지 않은 상태.
           "취소/선택 해제 뒤에 임시 변경이 남지 않는다"를 테스트가
           내부 변수를 뒤지지 않고 확인할 수 있게 한다. */
        textDraft: studioInspectorTextDraft,
        composing: studioInspectorComposing,
        resizable: studioInspectorResizable,
        dragging: !!studioInspectorDrag,
        metrics: studioInspectorMetrics ? { ...studioInspectorMetrics } : null
      };

    };

}
