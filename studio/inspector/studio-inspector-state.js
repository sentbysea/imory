/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 공유 상태

   Inspector 파일들이 함께 쓰는 것만 모았다.

     - Preview 관련 DOM 참조(토글 버튼 / shell / iframe / stage)
     - 확정 상태(켜짐, 선택, hover, Undo 스냅샷)와 overlay DOM 참조
     - 확정되지 않은 임시 상태(입력 중인 문구, 드래그, 실측 metrics)
     - 지금 선택이 무엇인지 다시 계산하는 함수
       (studioInspectorTemplateSource / describeStudioInspectorSelection)
     - 선택이 바뀌었다는 알림(notifyStudioInspectorSelectionChanged)
     - 임시 미리보기 채널(sendStudioInspectorPreview)

   ★ 여기 있는 값은 **읽기 전용이 아니다** — 다른 Inspector 파일이
     직접 대입한다. classic script의 top-level let은 전역 lexical
     환경 하나를 공유하므로 그게 가능하고, window에 상태를 얹지
     않아도 된다. 대신 이 파일이 **가장 먼저** 로드되어야 한다
     (const/let은 TDZ가 있다).

   ★ 상태 전이 자체(선택하기/해제하기/모드 켜고 끄기)는 여기 없다 —
     studio-inspector.js가 갖는다. 이 파일은 "무엇을 들고 있는가"와
     "그것이 지금 무엇을 가리키는가"까지다.

   ★ 파일 나누기 (Inspector 파일 분리 라운드)
     Element Inspector는 한 파일(studio-inspector.js)에 다 있었다.
     동작은 그대로 두고 책임만 나눴다 — 전부 classic script이고,
     top-level let은 여러 script가 공유하는 **하나의** 전역 lexical
     환경에 들어가므로(studio-preview.js의 currentWorkingSkin을
     이 파일들이 그대로 읽는 것과 같은 방식) window에 상태를 따로
     노출하지 않는다.

       studio-inspector-state.js       공유 상태 · 선택 해석 · 임시 채널
       studio-inspector-overlay.js     overlay DOM · 좌표 변환 · 테두리/핸들/팝오버 위치
       studio-inspector-edit.js        확정 경로(patch/스타일/링크/Undo)
       studio-inspector-text.js        텍스트 임시 편집 · 적용 · 취소
       studio-inspector-image-size.js  이미지 너비 컨트롤 · 모서리 드래그
       studio-inspector-controls.js    직접 수정 폼 UI · 팝오버 그리기
       studio-inspector.js             진입 · lifecycle · 선택 상태 전이 · 전역 창구

     로드 순서는 위 순서 그대로다(studio/index.html ·
     studio/studio-lifecycle-scenario.html). state가 맨 앞인 이유는
     const/let이 TDZ를 갖기 때문이다 — 뒤 파일들이 **로드 시점에**
     그 값을 읽는다(overlay의 ResizeObserver, 이 파일의 토글 버튼
     리스너). 함수 선언은 전역 객체 속성이라 호출 시점에만 있으면
     되므로 순서에 걸리지 않는다.

   의존(이 파일보다 먼저 로드되어야 함): studio/studio-preview.js
   (resolveCodeEditorSource / currentWorkingSkin / currentPreviewPageType),
   studio/inspector/studio-inspector-model.js(stampInspectorEditIds /
   describeInspectorElement / readInspectorEditDeclarations).
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
