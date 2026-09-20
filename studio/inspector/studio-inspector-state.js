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
   Top Dock — 선택 요소 이름표가 그 밑에 깔리지 않게 하려고 읽는다

   바는 stage 위에 absolute 로 얹히고(z-index 8), 좁은 폭에서는
   두 줄 이상으로 자란다. 이름표를 테두리 바깥 위에 붙이려다 그
   밴드 아래로 들어가면 보이지 않으므로 그때는 테두리 안쪽에 붙인다
   (studio-inspector-overlay.js paintStudioInspectorSelectLabel).

   (STUDIO-SHELL-1 이전에는 떠 있는 팝오버의 자리를 이 값으로 잡았다
   — 390px 에서 "✦ AI 수정"이 바 밑에 깔렸던 2026-09-17 의 이유.
   팝오버는 이제 왼쪽 패널 안에 있다.)

   바가 접혀 올라가 있으면(translateY(-100%)) 사각형이 뷰포트 위로
   나가므로 아래 계산이 저절로 아무 일도 하지 않는다.
========================================================== */

const studioInspectorTopDock =
  document.getElementById("studioTopDock");


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

/* 지금 선택한 프레임을 조상 overflow가 잘라내고 있는가.
   rect(레이아웃)와 visibleRect(실제로 보이는 자리)의 차이 하나로
   정한다 — 자르기 중에도 좌표는 계속 갱신되므로 metrics와 달리
   한 박자 늦지 않는다(studio-inspector.js rects 처리 주석 참고). */
let studioInspectorClipped = false;


/* =========================================================
   SANDBOX-6A — 테두리를 누가 그리는가

   sandbox 스킨에서는 hover/선택 테두리를 **프레임 안에서** 그린다
   (skin/sandbox/skin-sandbox-inspect.js). 저자 JS 의 애니메이션이나
   늦게 오는 이미지로 사각형이 움직일 때 같은 realm 의 같은 rAF 로
   따라가야 하기 때문이다.

   그래서 그 경우 이 문서의 hover/선택 상자는 그리지 않는다 — 둘 다
   그리면 겹쳐 보인다. **팝오버는 계속 이쪽 몫이다**(프레임 안에
   그리면 스킨 CSS 가 영향을 주고, Mobile 축소에 같이 작아진다 —
   studio-inspector.js 머리말의 "왜 Preview 안이 아니라 Studio
   overlay 인가").

   값은 프레임에서 온 메시지의 remote 표식 하나로 정한다. native
   Preview 의 메시지에는 그 칸이 없으므로 언제나 false 다 — 지금까지의
   동작은 한 줄도 달라지지 않는다.
========================================================== */

let studioInspectorRemoteOverlay = false;


/* =========================================================
   마지막으로 선택을 되살리지 못한 이유 (진단·테스트용)

   "gone" / "ambiguous" / "no-evidence" / "mismatch"
   (studio-inspector-model.js resolveInspectorSelectionTarget)

   선택이 풀린 **뒤에도** 남는다 — studioInspectorSelection 은
   그때 null 이 되므로, 이유를 거기 담아 두면 읽을 수가 없다.
   새로 고르면 빈 문자열로 되돌아간다.
========================================================== */

let studioInspectorLastLostReason = "";


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

/* STUDIO-SHELL-1 — Preview 위 선택 테두리에 붙는 요소 이름표 */
let studioInspectorSelectLabel = null;

let studioInspectorPopoverTitle = null;

let studioInspectorFields = null;

let studioInspectorNote = null;

let studioInspectorUndoButton = null;

/* DIRECT-UX-1 — "직접 수정" 탭 버튼은 없어졌다. 참조는 null 로 남아
   예전 자리(있으면 만지는 코드)가 전부 건너뛴다. */
let studioInspectorDirectButton = null;

/* DIRECT-UX-1 — 패널 머리의 "종류 · 페이지" 줄 · 바깥 영역 버튼 ·
   움직임 효과 상태 줄(studio-inspector-overlay.js 가 만든다) */
let studioInspectorPopoverMeta = null;

let studioInspectorOuterButton = null;

let studioInspectorMotion = null;

/* hover 중인 요소의 식별자 — hover 이름표가 이름을 찾는 데 쓴다 */
let studioInspectorHoverEditId = null;


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
     studioInspectorCropDraft   자르기 편집 중인 값(비율/확대/구도)
     studioInspectorCropDrag    사진을 끌어 옮기는 중인 정보
========================================================== */

let studioInspectorTextDraft = null;

let studioInspectorComposing = false;

let studioInspectorMetrics = null;

let studioInspectorPreviewActive = false;

let studioInspectorDrag = null;

let studioInspectorResizable = false;

/* COMMON-SELECT-BOX-1 — 지금 선택이 **이미지가 아닌 상자**이고
   가로·세로를 손잡이로 끌 수 있는가. studioInspectorResizable 과
   같은 이유로 폼을 다시 그릴 때 한 번만 정한다. */
let studioInspectorBoxResizable = false;

/* 그 상자를 끌고 있는 중인 정보(studio-inspector-box.js) */
let studioInspectorBoxDrag = null;

/* 지금 행을 붙일 자리. 보통은 studioInspectorFields 자신이고,
   "색상 · 꾸미기" 접힘 절이 열리면 그 안쪽 상자가 된다. */
let studioInspectorFieldTarget = null;

let studioInspectorSizeRange = null;

let studioInspectorSizeNumber = null;

let studioInspectorHandles = [];

/* LAYOUT-1 — 자유 배치 요소의 이동 손잡이(DOM 은 overlay 가 만들고,
   끄는 계산은 studio-inspector-layout.js 가 한다). 크기 핸들과 달리
   하나뿐이다 — 옮기는 것은 한 가지 동작이고 방향이 따로 없다. */
let studioInspectorMoveHandle = null;

/* "지금 선택이 자유 배치 안에 있는가" — studioInspectorResizable 과
   **같은 이유로** 미리 계산해 둔 값이다.

   좌표 칠하기(paintStudioInspectorHandles)는 스크롤·리사이즈·프레임
   메시지마다 돈다. 그 자리에서 매번 다시 판단하면 template 을 통째로
   파싱하게 되고(describeStudioInspectorSelection), 실제로 Studio 가
   눈에 띄게 느려져 다른 e2e 가 선택을 기다리다 시간 초과로 깨졌다
   (2026-09-18). 판단은 폼을 다시 그릴 때 한 번만 한다. */
let studioInspectorMovable = false;


/* 이미지 자르기 라운드 — 여기도 전부 "아직 확정되지 않은 것"이다.
   studio/inspector/studio-inspector-crop.js가 읽고 쓴다.

     studioInspectorCropDraft      { ratio, zoom, x, y, frameWidth, fixedWidth, fill }
                                   (fill — 프레임이 스킨의 자리를 채우는 방식,
                                    IMAGE-CROP-PRIORITY-1)
     studioInspectorCropDrag       드래그 중인 정보(시작 좌표 · 프레임 크기)
     studioInspectorCropSurface    Preview 위에 얹는 투명한 드래그 판
                                   (DOM은 overlay가 만든다)
     studioInspectorCropZoomRange  확대 슬라이더 참조 — 폼을 다시 그리면
                                   죽는 참조라 그때 끊는다

   자유 비율 라운드가 더한 것 — 프레임의 네 변과 모서리를 직접 끄는
   길이다. 사진을 옮기는 드래그(studioInspectorCropDrag)와 완전히
   다른 조작이라 상태도 따로 둔다: 하나는 "보이는 범위를 옮긴다",
   다른 하나는 "보이는 범위의 크기를 바꾼다".

     studioInspectorCropSideDrag   변/모서리 드래그 중인 정보
     studioInspectorCropHandles    변·모서리 핸들 8개(DOM은 overlay가 만든다)
     studioInspectorCropLimited    확대 상한 때문에 프레임을 더 줄일 수
                                   없어 핸들이 멈춰 있는가
     studioInspectorCropLimitNote  그 안내 문단 — 끄는 동안 폼을 통째로
                                   다시 그리지 않고 이 노드만 바꾼다 */
let studioInspectorCropDraft = null;

let studioInspectorCropDrag = null;

let studioInspectorCropSurface = null;

let studioInspectorCropZoomRange = null;

let studioInspectorCropSideDrag = null;

let studioInspectorCropHandles = [];

let studioInspectorCropLimited = false;

let studioInspectorCropLimitNote = null;


/* 크기 조절 하한/상한 — studioInspectorSizeMax()가 이 값들과 부모
   폭으로 실제 상한을 정한다.

   ★ 예전에는 상한이 **부모 안쪽 폭 그 자체**였다. 그런데 Preview는
   실제 사이트보다 좁다(Studio 사이드바·창 폭·Mobile 축소) — 같은
   이미지를 공개 화면에서는 755px까지 늘릴 수 있는데 Studio 슬라이더는
   613px에서 멈춰, "꽉 찬 너비"를 만들 방법이 아예 없었다.

   가로 넘침을 실제로 막는 것은 이 상한이 아니라 확정 규칙에 늘 함께
   들어가는 max-width:100%다(studio-inspector-model.js의 size) — 부모보다
   큰 값을 넣어도 자리에 맞춰 꽉 찰 뿐 넘치지 않는다.

   그래서 상한은 "부모 폭"이 아니라 "부모 폭 × HEADROOM(최소
   MIN_RANGE)"이고, 절대 상한 MAX로 한 번 더 눌린다. 슬라이더 한 칸이
   쓸 수 없을 만큼 커지지 않으면서도 꽉 찬 너비를 훌쩍 넘겨 고를 수
   있는 폭이다. */
const STUDIO_INSPECTOR_SIZE_MIN = 16;

const STUDIO_INSPECTOR_SIZE_MAX = 2000;

const STUDIO_INSPECTOR_SIZE_HEADROOM = 2;

const STUDIO_INSPECTOR_SIZE_MIN_RANGE = 1200;

const STUDIO_INSPECTOR_HANDLE_CORNERS = ["nw", "ne", "sw", "se"];

/* EDITORIAL-CUSTOMIZATION-1 — "사진 영역 너비"에만 나오는 좌우 손잡이.
   모서리와 달리 가로 한 축만 바꾼다(높이는 스킨이 정한 비율이 따라
   온다). 사진 영역이 아닌 선택에서는 늘 숨어 있다. */
const STUDIO_INSPECTOR_HANDLE_SIDES = ["w", "e"];

/* COMMON-SELECT-BOX-1 — 이미지가 아닌 상자의 위·아래 손잡이.
   세로 한 축만 바꾼다. 상자 크기를 끌 수 없는 선택에서는 숨는다. */
const STUDIO_INSPECTOR_HANDLE_VSIDES = ["n", "s"];

/* 자유 비율 자르기의 핸들 — 네 변 가운데와 네 모서리.

   변 핸들은 한 축만 바꾸고(좌우=너비, 상하=높이) 반대쪽 변이
   기준점으로 남는다. 모서리는 두 축을 **각각** 바꾼다(비율 유지가
   아니다) — 비율 유지는 자르지 않은 이미지의 크기 조절 쪽 몫이고,
   여기는 "보이는 창의 모양을 자유롭게 정한다"가 일이다. */
const STUDIO_INSPECTOR_CROP_HANDLE_EDGES =
  ["n", "s", "w", "e", "nw", "ne", "sw", "se"];


const STUDIO_INSPECTOR_PAGE_LABELS = {
  home: "HOME",
  category: "CATEGORY",
  post: "POST",
  banner: "BANNER",
  folder: "FOLDER",
  /* HIGHLIGHT-2 (구 memos) */
  highlights: "HIGHLIGHTS"
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

  /* =====================================================
     ★ id 가 같다는 것만으로 되살리지 않는다 (2026-09-17)

     임시 id 는 구조 경로라, 고른 요소를 지우면 뒤 형제가 그 자리로
     밀려와 같은 id 를 물려받는다. 그래서 "유일한 승격된 id 인가 /
     아니면 고를 때의 근거(자리·속까지)가 그대로인가"를 함께 본다 —
     완전히 같은 형제 사이에서도 갈려야 하기 때문이다. 판정은
     studio/inspector/studio-inspector-model.js
     resolveInspectorSelectionTarget() 한 곳이고, native 와 sandbox
     가 같은 함수를 지난다(선택의 주인이 언제나 이 문서이기 때문).

     근거가 모자라면 여기서 null 이고, 그러면 팝오버도 AI chip 도
     selectionContext 도 생기지 않는다. 실제로 선택을 걷어내는 것은
     reconcileStudioInspectorSelection()(studio-inspector.js)이다.
  ====================================================== */

  const resolvedTarget =
    window.resolveInspectorSelectionTarget(
      stamped,
      studioInspectorSelection.editId,
      studioInspectorSelection.fingerprint
    );

  const element =
    resolvedTarget.element;

  if (!element) {

    studioInspectorSelection.lostReason =
      resolvedTarget.reason;

    return null;

  }

  studioInspectorSelection.lostReason =
    "";

  return {
    stamped,
    source,
    element,
    info: window.describeInspectorElement(element, studioInspectorSlotNames()),
    declarations:
      window.readInspectorEditDeclarations(source.css, studioInspectorSelection.editId)
  };

}


/* =========================================================
   고른 요소의 이름 (DIRECT-UX-1)

   패널 머리 · Preview 이름표 · AI chip 이 같은 문자열을 쓴다.
   예전에는 "HOME · 텍스트 <h1> · profile.bio" 처럼 태그와 바인딩
   경로가 보였다 — 이름은 이제 studio-inspector-names.js 가 스킨
   계약(바인딩 · 반복 · region)에서 만든다. 태그 · 클래스 · 경로는
   근거로만 쓰고 화면에 내지 않는다.
========================================================== */

function studioInspectorLabelFor(info, element) {

  if (typeof studioInspectorElementName === "function" && element) {
    return studioInspectorElementName(element, info);
  }

  return STUDIO_INSPECTOR_KIND_LABELS[info.kind] || "영역";

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
