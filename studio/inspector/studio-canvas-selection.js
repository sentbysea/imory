/* =========================================================
   STUDIO — HOME 캔버스 선택 (HOME-CANVAS-SELECT-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md (PLAN)
   조사:      HOME-CANVAS-SELECT-AUDIT-1

   ── 왜 기존 Inspector 선택을 쓰지 않는가 ────────────────
   기존 `studioInspectorSelection` 은 **template HTML 안의 요소**를
   가리킨다. 그것이 무엇인지도, 무엇을 고칠 수 있는지도 언제나
   SkinPackage 의 HTML 을 다시 파싱해서 정한다
   (describeStudioInspectorSelection → resolveInspectorSelectionTarget).

   캔버스 요소는 그 HTML 에 **없다**. 렌더러가 `regions.home_canvas`
   의 데이터로 그 자리에서 만든 DOM 이다(skin/skin-home-canvas-render.js).
   그래서 같은 상태에 담으면 고른 순간부터 "되살릴 근거가 없는 선택"이
   되고, 조사에서 실제로 그랬다 — 테두리는 그려지는데
   `getStudioInspectorSelection()` 은 null 이고 패널은 비어 있었다.

   소유자를 둘로 나누되, **동시에 둘이 켜지지 않게** 한다.

     일반 요소 선택 → 캔버스 선택 해제
     캔버스 요소 선택 → 일반 Inspector 선택 해제
     빈 곳 클릭 → 둘 다 해제

   그 판정은 studio-inspector.js 의 선택 라우터 한 곳이 한다
   (routeStudioInspectSelectMessage). 이 파일은 "캔버스 쪽 상태"만
   갖고, 프레임 메시지를 직접 듣지 않는다.

   ── 상태는 처음부터 배열이다 ───────────────────────────
   이번 단계의 UI 는 단일 선택뿐이고 `ids` 는 0개 또는 1개다. 그래도
   모양을 배열로 두는 이유는 뒤 단계(Selecto 다중 선택)에서 상태를
   통째로 바꾸면, 이 상태에 매달린 쪽이 전부 "첫 번째만 본다"로
   조용히 퇴화하기 때문이다.

   ── 쓰기 경로는 하나다 ─────────────────────────────────
   밖으로 내는 쓰기 함수는 set / clear / sync / reconcile 넷이고,
   넷 다 applyStudioCanvasSelection() 하나를 지난다. 상태를 직접
   대입하는 곳을 만들지 않는다.

   ── 이번 단계가 하지 않는 것 ───────────────────────────
   Selecto · Moveable · 다중 선택 · 회전을 따라가는 틀 · 이동 ·
   크기 · 회전 · Canvas JSON 수정 · Inspector 입력 필드 · 레이어
   목록 · hidden/locked 토글 · Undo/Redo. 이 파일은 vendor UMD 를
   부르지 않는다(ensureHomeCanvasEditorVendors 호출 0).

   classic script 다. 의존(먼저 로드되어야 함):
     skin/skin-home-canvas.js            resolveSkinHomeCanvas
     studio/studio-preview.js            currentWorkingSkin · currentPreviewPageType
     studio/inspector/studio-inspector-state.js
                                         studioInspectorLayer · studioInspectorFrame
     studio/inspector/studio-inspector-overlay.js
                                         studioInspectorMapRect · paintStudioInspectorBox
========================================================== */


/* 렌더러가 붙이는 이름과 같다(skin/skin-home-canvas-render.js).
   이 파일은 DOM 을 읽지 않고 데이터만 보지만, 프레임이 올려보낸
   식별자를 대조할 때 쓰는 규칙은 같아야 한다. */
const STUDIO_CANVAS_ELEMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* HOME-CANVAS-SELECT-1B-2 — 한 번에 고를 수 있는 상한. sandbox 봉투의
   SANDBOX_CANVAS_MAX_SELECTED 와 같은 값이어야 한다(그쪽은 메시지
   층에서, 여기는 native 경로까지 함께 막는다). */
const STUDIO_CANVAS_MAX_SELECTED = 64;


/* =========================================================
   HOME-CANVAS-INSPECTOR-1A — 어떤 입구가 어떤 `kind` 를 쓸 수 있나

   ★ 두 입구의 권한이 다르다.

   프레임(native · sandbox)이 올리는 `preview:canvas-transform` 은
   **손으로 끈 결과**다. 그 안에서는 스킨 저자의 JS 가 도므로, 그
   길로 들어올 수 있는 것은 처음부터 직접 조작이 소유한 세 kind 뿐이다.

   왼쪽 패널의 입력칸은 이 문서(부모 realm)에서만 열린다 — 프레임이
   닿을 수 없는 자리다. 그래서 글자 내용은 **그 입구에만** 있다.
   같은 관문 · 같은 불변 수정을 쓰되, 들어올 수 있는 문을 가른다.
========================================================== */

const STUDIO_CANVAS_FRAME_KINDS = ["move", "resize", "rotate"];

/* =========================================================
   HOME-CANVAS-V2-EDITOR-1A — v2 의 기본 배치 칸

   ★ v1 의 kind 이름을 재사용하지 않는다. 같은 "width" 라도 v1 은
     도화지 좌표의 자유 요소이고 v2 블록은 흐름 안의 폭이라 쓰는
     writer 도, 값 표도, 보존 범위도 다르다. 이름을 나눠 두면 한
     메시지가 엉뚱한 writer 로 새어 들어갈 길 자체가 없다.

   ★ 전부 **패널 전용**이다 — 프레임(직접 조작)이 쓸 수 있는 kind 는
     여전히 STUDIO_CANVAS_FRAME_KINDS 셋뿐이고, v2 드래그 · 리사이즈 ·
     회전은 이 라운드에 없다(계약 §25-7).
========================================================== */

const STUDIO_CANVAS_V2_PANEL_KINDS =
  ["v2-align", "v2-width", "v2-height", "v2-margin", "v2-order", "v2-text"];

/* =========================================================
   HOME-CANVAS-V2-EDITOR-1B — v2 의 자리 · 크기 · 각도

   ★ **프레임도 이 kind 를 쓴다.** 위 여섯과 다른 점이다.

   프레임(native · sandbox)은 자기가 v1 인지 v2 인지 모른다 — 알
   필요도 없다. 부모가 자와 시작값을 내려 주고, 프레임은 손으로 끈
   결과를 그 자 위의 다섯 칸으로 돌려준다. 그래서 프레임이 보내는
   kind 는 여전히 `move` · `resize` · `rotate` 셋이고, **부모가 지금
   draft 의 version 을 보고** 이 이름으로 바꿔 부른다
   (studioCanvasEffectiveKind). 새 메시지도 새 봉투 칸도 없다.

   ★ 이름을 v1 과 나누는 이유는 §25-5 그대로다 — 같은 `resize` 라도
     v1 은 `canvas.elements` 의 요소이고 v2 는 프레임 내부 요소 ·
     overlay 이며, pin 요소에서는 저장되는 칸 자체가 다르다
     (`pin.offset`). writer 를 고르는 이름이 하나면 한 메시지가
     엉뚱한 곳으로 새어 들어갈 길이 생긴다.
========================================================== */

const STUDIO_CANVAS_V2_TRANSFORM_KINDS =
  ["v2-move", "v2-resize", "v2-rotate"];

/* 프레임의 kind → v2 의 kind. 이 표 밖의 이름은 바뀌지 않는다. */
const STUDIO_CANVAS_V2_KIND_OF = {
  move: "v2-move",
  resize: "v2-resize",
  rotate: "v2-rotate"
};

const STUDIO_CANVAS_PANEL_KINDS =
  ["move", "resize", "rotate", "text"]
    .concat(STUDIO_CANVAS_V2_PANEL_KINDS)
    .concat(STUDIO_CANVAS_V2_TRANSFORM_KINDS);


const STUDIO_CANVAS_TYPE_LABELS = {
  photo: "Canvas 사진",
  logo: "Canvas 로고",
  sticker: "Canvas 스티커",
  text: "Canvas 글자",
  category_nav: "Canvas 카테고리",
  shape: "Canvas 도형",

  /* HOME-CANVAS-V2-EDITOR-1A — v2 에만 있는 두 종류 */
  divider: "Canvas 구분선",
  main_visual: "Canvas 메인 비주얼"
};


/* =========================================================
   상태

   null 이 아니라 "빈 배열을 가진 객체"로도 둘 수 있지만, 안에서는
   null 로 둔다 — "고른 것이 없다"를 `if (studioCanvasSelection)`
   한 줄로 읽는 곳이 많아진다. 밖으로 나가는 모양은 언제나 배열이다
   (getStudioCanvasSelection).
========================================================== */

let studioCanvasSelection = null;

/* 선택이 바뀔 때마다 하나씩 오른다. 늦게 도착한 좌표 메시지가
   이미 갈린 선택을 되살리지 않게 하는 데 쓴다(뒤 단계의 드래그도
   같은 값을 본다). */
let studioCanvasSelectionGeneration = 0;

/* overlay — 이 파일이 만들고 이 파일만 만진다. 기존 Inspector 의
   상자(studioInspectorSelectBox)를 함께 쓰지 않는 이유는 "지금 저
   테두리는 누구 것인가"를 코드가 아니라 눈으로 추적하게 되기
   때문이다. 둘이 동시에 보이지 않는 것은 선택 라우터가 보장한다. */
let studioCanvasSelectBox = null;

let studioCanvasSelectLabel = null;

/* =========================================================
   HOME-CANVAS-SELECT-1B-1 — 프레임이 회전 틀을 잡았는가

   Preview 문서가 Moveable 로 **회전을 따라가는 테두리**를 실제로
   붙이면 true 가 된다(studio/preview/preview-bridge.js 의
   preview:canvas-frame). 그동안 이 문서의 축 평행 상자는 내린다 —
   둘 다 그리면 회전한 요소에서 상자가 덧그려져 보인다.

   ★ 선택 상태가 아니다. 이 값이 무엇이든 캔버스 선택 자체는
     그대로다 — vendor 로드가 실패하면 false 로 돌아오고, 그때는
     아래 축 평행 테두리가 그대로 fallback 이 된다(로드맵 §7).
========================================================== */

let studioCanvasFrameActive = false;

/* =========================================================
   HOME-CANVAS-SELECT-1B-2 — 프레임에 "이것을 집어라"를 내려보낸 뒤
   아직 그 확인을 못 받은 식별자.

   lasso · Shift 클릭은 **부모가** 확정하므로, 그 직후에는 프레임 안
   Inspector 의 선택이 잠시 다른 것을 가리킨다. 그 어긋남을 "프레임이
   놓았다"로 읽지 않기 위한 기대값 하나다(syncStudioCanvasSelectionRects).
========================================================== */

let studioCanvasExpectedFrameId = null;


/* =========================================================
   1. 지금 draft 의 캔버스

   ★ 관문을 새로 만들지 않는다.

   resolveSkinHomeCanvas(skinPackage, templateHtml) 가 이미 다음을
   전부 본다(skin/skin-home-canvas.js):

     - template HTML 에 표식이 정확히 하나 있는가
     - `home_canvas` 항목이 있고 enabled !== false 인가
     - canvas.version 이 이 배포가 아는 버전인가(미래 버전 → undefined)
     - 데이터가 계약을 지키는가(좌표 · 종류 · props)
     - 요소 id 가 캔버스 안에서 유일한가(중복 → 캔버스 전체 무효)

   그래서 여기서 다시 검사할 것은 "HOME 인가" 하나뿐이다. 돌려주는
   payload 는 언제나 **새 리터럴**이라 이 함수의 호출자가 무엇을
   해도 draft 가 바뀌지 않는다.
========================================================== */

function studioCanvasDraftPayload() {

  if (currentPreviewPageType !== "home") {
    return null;
  }

  if (typeof window.resolveSkinHomeCanvas !== "function") {
    return null;
  }

  const source =
    (typeof studioInspectorTemplateSource === "function")
      ? studioInspectorTemplateSource()
      : null;

  if (!source || typeof source.html !== "string") {
    return null;
  }

  let payload;

  try {
    payload = window.resolveSkinHomeCanvas(currentWorkingSkin, source.html);
  }
  catch (err) {
    return null;
  }

  /* =====================================================
     HOME-CANVAS-V2-EDITOR-1A — v2 도 여기를 지난다.

     V2-MAIN-VISUAL-1 까지 이 줄은 `Array.isArray(payload.elements)`
     하나였다. v2 payload 에는 그 칸이 없으므로(있는 것은 `flow` 와
     `overlays` 다 — 계약 §23) **모든 v2 캔버스에서 이 함수가 null 을
     돌려주고**, 그래서 studioCanvasEditingIsOn() 도 거짓이고 선택도
     패널도 통째로 꺼져 있었다. 그리기만 되고 고를 수는 없던 자리가
     여기였다.

     ★ 판정을 새로 만들지 않는다. resolveSkinHomeCanvas() 가 이미
       version 별 계약 전체를 본 뒤에만 payload 를 준다 — 여기서는
       "아는 모양인가"만 한 번 더 확인한다(받는 쪽이 자기 리터럴로
       다시 보는 §9 의 그 규칙).
  ====================================================== */
  return studioCanvasPayloadVersion(payload) ? payload : null;

}


/*
  studioCanvasPayloadVersion(payload) -> 1 | 2 | null

  실행 payload 의 모양으로 버전을 가른다. 모르는 모양이면 null 이고,
  그때는 선택도 편집도 켜지지 않는다(그리지도 않는다 — 렌더러가 같은
  판정을 한다).
*/
function studioCanvasPayloadVersion(payload) {

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.version === 2) {

    return (
      payload.flow &&
      typeof payload.flow === "object" &&
      Array.isArray(payload.flow.blocks) &&
      Array.isArray(payload.overlays)
    ) ? 2 : null;

  }

  return Array.isArray(payload.elements) ? 1 : null;

}


/*
  studioCanvasNodeList() -> [{ id, kind, type, parentId }]

  지금 draft 에서 고를 수 있는 것 **전부를 화면 순서로**. 버전을
  가리지 않는 한 벌이라, 이 목록을 쓰는 쪽(정렬 · 진입 판정)은
  v1 · v2 를 나누어 적지 않는다.

    v1  요소 하나하나가 kind:"element"
    v2  블록 → 그 프레임의 내부 요소 → … → overlay
        (listSkinHomeCanvasV2Nodes — skin/skin-home-canvas-write-v2.js)
*/
function studioCanvasNodeList() {

  const payload =
    studioCanvasDraftPayload();

  if (!payload) {
    return [];
  }

  if (studioCanvasPayloadVersion(payload) === 2) {

    return (typeof window.listSkinHomeCanvasV2Nodes === "function")
      ? window.listSkinHomeCanvasV2Nodes(payload)
      : [];

  }

  return payload.elements.map(
    (element) => ({
      id: element.id,
      kind: "element",
      type: element.type,
      parentId: null
    })
  );

}


/*
  studioCanvasNodeInfo(id) -> { id, type, kind, parentId, node } | null

  id 하나가 지금 draft 의 **무엇인가**. v1 에서는 언제나
  kind:"element" 이고, v2 에서는 block · frame-element · overlay 셋
  중 하나다(계약 §25-2).

  ★ id 는 canvas 하나 안에서 전부 유일하므로(§14-5) 부르는 쪽이
    경로를 들고 다니지 않는다.
*/
function studioCanvasNodeInfo(elementId) {

  if (
    typeof elementId !== "string" ||
    !STUDIO_CANVAS_ELEMENT_ID_PATTERN.test(elementId)
  ) {
    return null;
  }

  const payload =
    studioCanvasDraftPayload();

  if (!payload) {
    return null;
  }

  if (studioCanvasPayloadVersion(payload) === 2) {

    const hit =
      (typeof window.findSkinHomeCanvasV2Node === "function")
        ? window.findSkinHomeCanvasV2Node(payload, elementId)
        : null;

    if (!hit) {
      return null;
    }

    return {
      id: elementId,
      type: hit.node.type,
      kind: hit.kind,
      parentId: hit.parentId,
      index: hit.index,
      node: hit.node
    };

  }

  const element =
    payload.elements.find((item) => item && item.id === elementId);

  return element
    ? {
        id: elementId,
        type: element.type,
        kind: "element",
        parentId: null,
        index: payload.elements.indexOf(element),
        node: element
      }
    : null;

}


/* =========================================================
   HOME-CANVAS-V2-EDITOR-1A — `main_visual` 에 들어가는 최소 동작

   studioCanvasSelectTargetId(hitId) -> id | null

   프레임이 "이 자리에서 이것이 잡혔다"고 올린 id 를 **무엇으로 읽을
   것인가**. 바꾸는 경우는 하나뿐이다.

     프레임 내부 요소가 잡혔는데 아직 그 프레임 **밖에** 있으면
     → 프레임 블록을 고른다

   그래서 `main_visual` 은 **한 번 클릭하면 프레임 전체**이고, 그
   상태에서 **한 번 더 누르면 그 안의 요소**가 골라진다. 사진 하나를
   누를 때마다 종이 · 테이프 · 라벨 중 무엇이 잡혔는지 주인이 모르는
   채로 안쪽이 골라지지 않게 하는 것이 목적이다.

   ★ 새 상태를 만들지 않는다. "들어와 있는가"는 **지금 선택**으로
     읽는다 — 선택이 그 프레임이거나 같은 프레임 안의 요소면 들어와
     있는 것이다. 그래서 다른 곳을 고르거나 빈 곳을 누르면 저절로
     나가지고, 되돌릴 별도의 "나가기"가 없다.

   ★ 새 메시지도 만들지 않는다. 프레임은 지금까지처럼 잡힌 id 하나만
     올리고, 무엇을 고를지는 언제나 이 문서가 정한다(§14 의 소유권).
========================================================== */

function studioCanvasSelectTargetId(hitId) {

  const info =
    studioCanvasNodeInfo(hitId);

  if (!info) {
    return hitId;
  }

  if (info.kind !== "frame-element" || !info.parentId) {
    return hitId;
  }

  const current =
    studioCanvasSelection ? studioCanvasSelection.primaryId : null;

  if (current === info.parentId) {
    /* 프레임을 고른 채로 그 안을 눌렀다 — 들어간다 */
    return hitId;
  }

  const currentInfo =
    current ? studioCanvasNodeInfo(current) : null;

  if (
    currentInfo &&
    currentInfo.kind === "frame-element" &&
    currentInfo.parentId === info.parentId
  ) {
    /* 이미 같은 프레임 안이다 — 형제끼리는 바로 옮겨 다닌다 */
    return hitId;
  }

  return info.parentId;

}


/*
  studioCanvasDraftElement(elementId) -> element | null

  "그 id 를 가진 요소가 지금 draft 의 캔버스에 실제로 있는가."
  hidden · locked 는 보지 않는다 — 존재 여부만이다.
*/
function studioCanvasDraftElement(elementId) {

  const info =
    studioCanvasNodeInfo(elementId);

  return info ? info.node : null;

}


/*
  studioCanvasSelectableElement(elementId) -> element | null

  화면 클릭으로 고를 수 있는 요소인가. 존재에 더해 두 가지를 본다.

    hidden  상자가 없어 좌표를 잴 수 없다(그리고 다시 고를 방법도
            아직 없다 — 레이어 목록은 후속 단계다)
    locked  사용자가 "건드리지 않겠다"고 표시한 것이다

  프레임이 보낸 식별자를 받아들일지 정하는 관문이 이 함수다 —
  native 와 sandbox 가 같은 함수를 지난다.
*/
function studioCanvasSelectableElement(elementId) {

  const element =
    studioCanvasDraftElement(elementId);

  if (!element) {
    return null;
  }

  if (element.hidden === true || element.locked === true) {
    return null;
  }

  return element;

}


function studioCanvasElementLabel(type) {

  return (
    Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_TYPE_LABELS, type)
      ? STUDIO_CANVAS_TYPE_LABELS[type]
      : "Canvas 요소"
  );

}


/* =========================================================
   2. overlay — 축에 평행한 사각형 하나

   ★ 회전을 따라가지 않는다.

   회전한 요소에서는 **외곽 bounding box** 를 그린다. 지금 좌표는
   프레임이 getBoundingClientRect() 로 잰 값 하나뿐이고, 그 값에는
   회전각이 들어 있지 않기 때문이다. 회전을 따라가는 선택 틀과
   핸들은 HOME-CANVAS-SELECT-1B 의 Moveable 몫이다.

   ★ sandbox 에서는 그리지 않는다.

   프레임이 자기 realm 에서 이미 테두리를 그린다
   (studioInspectorRemoteOverlay). 둘 다 그리면 겹쳐 보인다 —
   기존 Inspector 선택과 같은 규칙이다.
========================================================== */

function ensureStudioCanvasOverlay() {

  if (studioCanvasSelectBox || !studioInspectorLayer) {
    return;
  }

  studioCanvasSelectBox =
    document.createElement("div");

  /* 기존 선택 테두리와 같은 생김새를 쓰되(새 CSS 를 만들지 않는다)
     누구 것인지 읽을 수 있게 한 겹 더 붙인다 */
  studioCanvasSelectBox.className =
    "studio-inspector-outline studio-inspector-outline--selected studio-canvas-outline";

  studioCanvasSelectBox.id =
    "studioCanvasSelectBox";

  studioCanvasSelectBox.setAttribute("data-imory-select-owner", "canvas");

  studioCanvasSelectBox.hidden =
    true;

  studioCanvasSelectLabel =
    document.createElement("div");

  studioCanvasSelectLabel.className =
    "studio-inspector-select-label studio-canvas-select-label";

  studioCanvasSelectLabel.id =
    "studioCanvasSelectLabel";

  studioCanvasSelectLabel.setAttribute("data-imory-select-owner", "canvas");
  studioCanvasSelectLabel.setAttribute("aria-hidden", "true");

  studioCanvasSelectLabel.hidden =
    true;

  studioInspectorLayer.appendChild(studioCanvasSelectBox);
  studioInspectorLayer.appendChild(studioCanvasSelectLabel);

}


function hideStudioCanvasOverlay() {

  if (studioCanvasSelectBox) {
    studioCanvasSelectBox.hidden = true;
  }

  if (studioCanvasSelectLabel) {
    studioCanvasSelectLabel.hidden = true;
  }

}


function paintStudioCanvasSelectLabel(mapped, text) {

  const label =
    studioCanvasSelectLabel;

  if (!label) {
    return;
  }

  if (!mapped || !text || typeof studioInspectorFrameGeometry !== "function") {
    label.hidden = true;
    return;
  }

  label.textContent = text;
  label.hidden = false;

  const frame =
    studioInspectorFrameGeometry().box;

  const height =
    label.offsetHeight || 20;

  /* 테두리 바깥 위가 기본이고, 프레임 위로 나가면 안쪽에 붙인다 —
     기존 이름표(paintStudioInspectorSelectLabel)와 같은 규칙이다. */
  const outside =
    mapped.top - height - 6;

  const top =
    outside >= frame.top + 2 ? outside : mapped.top + 6;

  const maxWidth =
    Math.max(40, Math.min(240, Math.round(frame.width - 8)));

  label.style.maxWidth = `${maxWidth}px`;

  const width =
    Math.min(label.offsetWidth || maxWidth, maxWidth);

  const left =
    Math.max(frame.left + 2, Math.min(mapped.left, frame.right - width - 2));

  label.style.left = `${Math.round(left)}px`;
  label.style.top = `${Math.round(top)}px`;

}


/* 지금 primary 요소의 항목. 선택이 없으면 null 이다. */
function studioCanvasPrimaryItem() {

  if (!studioCanvasSelection) {
    return null;
  }

  return (
    studioCanvasSelection.items.find(
      (item) => item.id === studioCanvasSelection.primaryId
    ) || studioCanvasSelection.items[0] || null
  );

}


function repaintStudioCanvasSelection() {

  if (!studioCanvasSelection) {
    hideStudioCanvasOverlay();
    return;
  }

  ensureStudioCanvasOverlay();

  /* sandbox — 프레임이 그린다 */
  if (studioInspectorRemoteOverlay) {
    hideStudioCanvasOverlay();
    return;
  }

  /* HOME-CANVAS-SELECT-1B-2 — 여러 개를 골랐을 때의 fallback 은
     **primary 하나**다(§10). 이 테두리는 축에 평행한 사각형 하나라
     그룹을 표현할 수 없고, 그룹 틀은 Moveable 의 몫이다. */
  const item =
    studioCanvasPrimaryItem();

  const rect =
    item ? (item.visibleRect || item.rect) : null;

  /* =====================================================
     HOME-CANVAS-SELECT-1B-1 — 상자만 넘기고 이름표는 남긴다

     Moveable 이 잡고 있으면 **축에 평행한 상자**는 그리지 않는다 —
     회전한 요소에서 그것이 덧그려지면 사용자가 보는 테두리가 둘이
     된다.

     ★ 이름표는 넘기지 않는다. Moveable 에는 "무엇을 골랐는가"를
       보여 주는 것이 없고, 그 자리를 비우면 이 라운드가 **기능을
       하나 없앤 것**이 된다. 이름표는 상자가 아니므로 겹쳐 보이지도
       않는다.
  ====================================================== */

  if (typeof paintStudioInspectorBox === "function") {
    paintStudioInspectorBox(
      studioCanvasSelectBox,
      studioCanvasFrameActive ? null : rect
    );
  }

  const mapped =
    (rect && typeof studioInspectorMapRect === "function")
      ? studioInspectorMapRect(rect)
      : null;

  paintStudioCanvasSelectLabel(
    mapped,
    item ? studioCanvasElementLabel(item.type) : ""
  );

}


/* =========================================================
   3. 유일한 쓰기 경로

   items 는 언제나 이 함수가 새로 만든다 — 프레임이 보낸 rect
   객체를 그대로 들고 있지 않는다(봉투에서 온 값이 상태에 그대로
   실리지 않게 한다).
========================================================== */

function studioCanvasRectLiteral(rect) {

  if (!rect || typeof rect !== "object") {
    return null;
  }

  const numbers =
    ["left", "top", "width", "height"].map((key) => rect[key]);

  if (numbers.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return null;
  }

  return {
    left: numbers[0],
    top: numbers[1],
    width: numbers[2],
    height: numbers[3]
  };

}


/* =========================================================
   HOME-CANVAS-SELECT-1B-2 — 캔버스 편집이 켜져 있는가

   ★ 1B-1 에서는 "첫 요소를 골랐을 때"가 프레임의 편집 runtime 과
     vendor 를 켜는 관문이었다. lasso 는 **아무것도 고르지 않은
     상태에서** 시작돼야 하므로 관문이 한 칸 앞으로 온다.

   여기서 보는 것은 다섯이다.

     1. Studio 안의 Preview 다        (이 파일이 Studio 에만 있다)
     2. HOME 화면이다                 ┐
     3. 유효하고 활성화된 home_canvas ├ studioCanvasDraftPayload()
     4. 표식이 정확히 하나            ┘ (resolveSkinHomeCanvas 가 전부 본다)
     5. Select 모드가 켜져 있다       getStudioInspectorState().enabled

   `primaryId` 존재는 **관문에서 빠졌다**(그것이 이 라운드의 변경이다).

   Canvas 가 없는 스킨에서는 3 이 거짓이라 여전히 요청 0 이다.
========================================================== */

function studioCanvasEditingIsOn() {

  if (typeof studioInspectorEnabled !== "undefined" && !studioInspectorEnabled) {
    return false;
  }

  return !!studioCanvasDraftPayload();

}


/* =========================================================
   확정된 상태를 Preview 문서로 — **여기 한 곳에서만 나간다**

   set / clear / sync / reconcile / propose 와 Select 모드 토글이
   전부 이 함수를 지난다. "선택이 바뀌었는데 프레임만 모른다"도,
   "Select 를 켰는데 프레임은 아직 꺼진 줄 안다"도 생기지 않는다.

   ★ 좌표도 nonce 도 draft 도 싣지 않는다 — id 와 순번뿐이다.
     프레임은 그 id 를 자기 DOM 에서 다시 확인한 뒤에만 그린다.

   ★ 값이 같아도 보낸다. 프레임이 새로 만들어졌거나 재렌더로
     target 을 놓쳤을 때 같은 값을 한 번 더 받는 것이 정답이고,
     받는 쪽은 같은 값이면 아무 일도 하지 않는다.
========================================================== */

/* =========================================================
   HOME-CANVAS-INSPECTOR-1A — 왼쪽 패널에 "다시 그려라"

   ★ 선택이 바뀌지 않아도 패널은 낡는다. 드래그 · 리사이즈 · 회전 ·
     Undo/Redo · Import · draft 재로드는 **같은 요소의 값**을 바꾸기
     때문이다. 그래서 알림은 선택 변경이 아니라 **세 자리**에서 나간다.

     applyStudioCanvasSelection   선택이 확정될 때(해제 포함)
     syncStudioCanvasFrameMode    편집 모드 · draft 가 바뀔 때
                                  (reconcile · Select 토글 · 페이지 이동)

   ★ 세 번째 상태 저장소를 만들지 않는다. 이 이벤트는 값을 싣지 않고,
     받는 쪽이 getStudioCanvasSelection() 과 draft 를 **다시 읽는다**.
========================================================== */

function notifyStudioCanvasPanel() {

  window.dispatchEvent(new CustomEvent("studio-canvas-panel"));

}


function postStudioCanvasSelectionToFrame() {

  if (typeof window.postCanvasSelectionToFrame !== "function") {
    return;
  }

  const editing =
    studioCanvasEditingIsOn();

  window.postCanvasSelectionToFrame(
    studioCanvasSelection
      ? {
          editing: true,
          active: true,
          ids: studioCanvasSelection.ids.slice(),
          primaryId: studioCanvasSelection.primaryId,
          generation: studioCanvasSelection.generation
        }
      : {
          editing: editing,
          active: false,
          ids: [],
          primaryId: null,
          generation: studioCanvasSelectionGeneration
        }
  );

}


/*
  syncStudioCanvasFrameMode()

  선택이 바뀌지 않아도 편집 모드가 바뀔 수 있다 — Select 토글 ·
  페이지 이동 · Import · AI 적용으로 캔버스가 생기거나 사라지는 것.
  그 자리들이 이 함수를 부른다.
*/

function syncStudioCanvasFrameMode() {

  postStudioCanvasSelectionToFrame();

  postStudioCanvasGeometryToFrame();

  notifyStudioCanvasPanel();

}


/* =========================================================
   HOME-CANVAS-TRANSFORM-1A — 단독 선택의 Canvas 좌표를 프레임으로

   ★ 왜 좌표가 내려가는가

   프레임은 Canvas JSON 을 갖고 있지 않고, DOM 에서 그 값을 되찾을
   수도 없다 — 렌더러가 써 넣은 것은 여섯 자리에서 자른 백분율이라
   거꾸로 풀면 원본과 미세하게 다르다. 그 값을 시작점으로 삼으면
   끌지도 않은 요소가 저장될 때마다 조금씩 움직인다.

   ★ **단독 선택일 때만** 내려간다.

   여럿을 골랐거나 아무것도 고르지 않았으면 `active:false` 다. 그것이
   곧 "지금은 옮길 수 있는 것이 없다"이고, 프레임은 그 말을 받으면
   이동을 끈다(그룹 이동은 이번 단계에 없다).

   ★ 확정의 **답**이기도 하다.

   commitStudioCanvasElementTransform 은 승인이든 거부든 끝에서 이
   함수를 부른다. 승인이면 방금 놓은 자리가, 거부면 예전 자리가
   내려가고 프레임은 언제나 "부모가 말한 값"으로 맞춘다 — 거부를
   따로 알릴 메시지를 만들지 않는다.
========================================================== */

function studioCanvasSingleGeometry() {

  if (!studioCanvasSelection || studioCanvasSelection.ids.length !== 1) {
    return null;
  }

  const id =
    studioCanvasSelection.ids[0];

  if (studioCanvasSelection.primaryId !== id) {
    return null;
  }

  const element =
    studioCanvasSelectableElement(id);

  if (!element) {
    return null;
  }

  const payload =
    studioCanvasDraftPayload();

  /* =====================================================
     HOME-CANVAS-V2-EDITOR-1B — v2 도 좌표를 내려보낸다.

     `1A` 에서는 여기서 null 을 돌려주어 직접 조작을 애초에 주지
     않았다. 이제는 **자를 하나 정해** 그 자 위의 다섯 칸을 내려
     준다 — 어느 상자를 기준으로 재는지(`scopeId`)와 pin 의
     `origin` 몫이 함께 간다(계약 §26-2).

     ★ 자를 만드는 곳은 한 곳이다
       (studio/inspector/studio-canvas-v2-space.js). 그 함수가 null
       이면 여기서도 null 이고, 그때 프레임은 제스처를 시작하지
       않는다(dragGate → "no-geometry") — 블록 선택이 그 경우다
       (블록의 자리는 좌표가 아니다, §14-10).
  ====================================================== */
  if (studioCanvasPayloadVersion(payload) === 2) {

    const space =
      (typeof window.studioCanvasV2Space === "function")
        ? window.studioCanvasV2Space(id)
        : null;

    if (
      !space ||
      !Number.isFinite(space.x) ||
      !Number.isFinite(space.y) ||
      !Number.isFinite(space.width) || !(space.width > 0) ||
      !(space.height === "auto" ||
        (Number.isFinite(space.height) && space.height > 0)) ||
      !Number.isFinite(space.rotation) ||
      !(space.baseWidth > 0) ||
      !(space.baseHeight > 0)
    ) {
      return null;
    }

    return {
      active: true,
      id: id,
      x: space.x,
      y: space.y,
      width: space.width,
      height: space.height,
      rotation: space.rotation,
      scopeId: space.scopeId,
      originX: space.originX,
      originY: space.originY,
      baseWidth: space.baseWidth,
      baseHeight: space.baseHeight,
      generation: studioCanvasSelection.generation
    };

  }

  if (studioCanvasPayloadVersion(payload) !== 1) {
    return null;
  }

  /* HOME-CANVAS-TRANSFORM-1B — width · height 도 같이 내려간다.
     `height` 는 숫자이거나 `"auto"` 이고, 그 밖의 값이면 이 요소는
     애초에 계약을 어긴 것이므로 아무것도 내려보내지 않는다. */
  const heightOk =
    element.height === "auto" ||
    (typeof element.height === "number" &&
      Number.isFinite(element.height) &&
      element.height > 0);

  if (
    !payload ||
    !(payload.baseWidth > 0) ||
    !(payload.baseHeight > 0) ||
    typeof element.x !== "number" ||
    typeof element.y !== "number" ||
    !Number.isFinite(element.x) ||
    !Number.isFinite(element.y) ||
    typeof element.width !== "number" ||
    !Number.isFinite(element.width) ||
    !(element.width > 0) ||
    !heightOk
  ) {
    return null;
  }

  return {
    active: true,
    id: id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,

    /* =====================================================
       HOME-CANVAS-TRANSFORM-1C — 각도도 같이 내려간다.

       ★ `rotation` 은 요소에 **없을 수 있다**. 그때 화면의 각도는
         0 이므로(계약 §5 · 렌더러의 기본값) 여기서도 0 으로
         내려보낸다. 그것이 곧 프레임이 돌리기 시작할 자리이고,
         확정의 `expected` 도 그 값이다 — draft 에 `rotation:0` 을
         **써 넣지는 않는다**. 고르기만 해서 JSON 이 자라지 않게.
    ====================================================== */
    rotation:
      (typeof element.rotation === "number" && Number.isFinite(element.rotation))
        ? element.rotation
        : 0,

    baseWidth: payload.baseWidth,
    baseHeight: payload.baseHeight,
    generation: studioCanvasSelection.generation
  };

}


function postStudioCanvasGeometryToFrame(answering) {

  if (typeof window.postCanvasGeometryToFrame !== "function") {
    return;
  }

  const geometry =
    studioCanvasSingleGeometry() ||
    {
      active: false,
      id: null,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,

      /* HOME-CANVAS-V2-EDITOR-1B — 해제에도 자 칸을 빈 값으로 둔다.
         프레임은 `scopeId` 가 없으면 도화지로 읽는다(계약 §26-2). */
      scopeId: null,
      originX: 0,
      originY: 0,

      baseWidth: 0,
      baseHeight: 0,
      generation: studioCanvasSelectionGeneration
    };

  /* ★ 확정의 **답**에만 번호가 붙는다. 그 밖의 좌표 메시지는
     번호가 없고, 프레임은 그것을 답으로 읽지 않는다 — 좌표는 선택 ·
     재렌더 · draft 변경 때마다 나가므로 "확정 뒤 처음 온 것"을 답으로
     읽으면 엉뚱한 것을 답으로 읽는 날이 온다(계약 §17-8). */
  if (Number.isInteger(answering) && answering >= 1) {
    geometry.answering = answering;
  }

  window.postCanvasGeometryToFrame(geometry);

}


function applyStudioCanvasSelection(entries, options) {

  /* HOME-CANVAS-SELECT-1B-2 — primary 를 호출자가 정할 수 있다.
     주지 않으면 지금까지처럼 첫 칸이다(단일 선택 경로). */
  const wantedPrimary =
    (options && typeof options.primaryId === "string") ? options.primaryId : null;

  const next =
    (Array.isArray(entries) && entries.length)
      ? {
          ids: entries.map((entry) => entry.id),
          primaryId:
            (wantedPrimary && entries.some((entry) => entry.id === wantedPrimary))
              ? wantedPrimary
              : entries[0].id,
          items: entries.map((entry) => ({
            id: entry.id,
            type: entry.type,
            locked: entry.locked === true,
            hidden: entry.hidden === true,
            rect: entry.rect,
            visibleRect: entry.visibleRect || entry.rect
          })),
          generation: studioCanvasSelectionGeneration
        }
      : null;

  const changed =
    JSON.stringify(next && { ids: next.ids, primaryId: next.primaryId }) !==
    JSON.stringify(studioCanvasSelection && {
      ids: studioCanvasSelection.ids,
      primaryId: studioCanvasSelection.primaryId
    });

  studioCanvasSelection =
    next;

  if (!next) {

    hideStudioCanvasOverlay();

    /* 프레임의 회전 틀도 곧 내려간다(아래 메시지). 그 보고를
       기다리지 않고 여기서 먼저 false 로 돌린다 — 다음 선택까지
       이 문서의 테두리가 숨은 채로 남지 않게. */
    studioCanvasFrameActive = false;

  }
  else {
    ensureStudioCanvasOverlay();
  }

  repaintStudioCanvasSelection();


  /* =====================================================
     HOME-CANVAS-SELECT-1B-1 — 확정된 선택을 Preview 문서로

     ★ 여기 한 곳에서만 나간다. set / clear / sync / reconcile 이
       전부 이 함수를 지나므로(위 머리말) "선택이 바뀌었는데
       프레임만 모른다"가 생기지 않는다.

     ★ 좌표도 nonce 도 draft 도 싣지 않는다 — id 와 순번뿐이다.
       프레임은 그 id 를 자기 DOM 에서 다시 확인한 뒤에만 그린다.

     ★ 값이 같아도 보낸다(changed 를 보지 않는다). 프레임이 새로
       만들어졌거나 재렌더로 target 을 놓쳤을 때 같은 값을 한 번
       더 받는 것이 정답이고, 받는 쪽은 같은 값이면 아무 일도
       하지 않는다.
  ====================================================== */

  postStudioCanvasSelectionToFrame();

  /* HOME-CANVAS-TRANSFORM-1A — 좌표는 언제나 선택 **뒤에** 나간다.
     프레임은 둘이 짝을 이룰 때만 이동을 켠다(같은 generation). */
  postStudioCanvasGeometryToFrame();

  /* =====================================================
     프레임에도 해제를 알린다 — 단, 소유권이 넘어가는 경우는 뺀다

     캔버스 선택이 풀렸는데 프레임이 계속 그 요소를 고른 채로
     있으면 sandbox 에서는 프레임이 그린 테두리가 남는다. 그래서
     기본은 "프레임에도 풀어라"다.

     예외는 **일반 요소 선택으로 넘어가는 길**이다. 거기서 프레임에
     해제를 먼저 보내면 곧 돌아오는 좌표 메시지가 selected:null 이라
     방금 만든 **일반** 선택을 지운다(studio-inspector.js 의 rects
     처리). 그 길에서는 이어서 새 선택이 내려가므로 여기서 아무
     말도 하지 않는 편이 맞다.
  ====================================================== */
  if (
    !next &&
    !(options && options.keepFrameSelection) &&
    typeof window.postInspectorSelectionToFrame === "function"
  ) {
    window.postInspectorSelectionToFrame(null);
  }

  if (changed) {
    window.dispatchEvent(new CustomEvent("studio-canvas-selection"));
  }

  /* ★ changed 를 보지 않는다 — 같은 요소의 **값**이 바뀌었을 때도
     패널은 낡는다(위 notifyStudioCanvasPanel 머리말). */
  notifyStudioCanvasPanel();

  return !!next;

}


/*
  setStudioCanvasSelection(elementId, rect, visibleRect) -> boolean

  프레임이 고른 캔버스 요소 하나를 받는다. 고를 수 없는 요소(없음 ·
  hidden · locked · 깨진 캔버스)면 **아무 것도 고르지 않고** false 다 —
  다른 요소로 바꿔 주지 않는다.

  ★ 이번 단계는 `ids` 가 0개 또는 1개다. 다중 선택 UI 는 없다.
*/
function setStudioCanvasSelection(elementId, rect, visibleRect) {

  const element =
    studioCanvasSelectableElement(elementId);

  if (!element) {
    clearStudioCanvasSelection({ keepFrameSelection: true });
    return false;
  }

  const layoutRect =
    studioCanvasRectLiteral(rect);

  if (!layoutRect) {
    clearStudioCanvasSelection({ keepFrameSelection: true });
    return false;
  }

  studioCanvasSelectionGeneration += 1;

  return applyStudioCanvasSelection([
    {
      id: element.id,
      type: element.type,
      locked: element.locked,
      hidden: element.hidden,
      rect: layoutRect,
      visibleRect: studioCanvasRectLiteral(visibleRect) || layoutRect
    }
  ]);

}


function clearStudioCanvasSelection(options) {

  if (!studioCanvasSelection) {
    hideStudioCanvasOverlay();

    /* 선택은 원래 비어 있었어도 편집 모드는 바뀌었을 수 있다 */
    syncStudioCanvasFrameMode();

    return;
  }

  applyStudioCanvasSelection(null, options);

}


/* =========================================================
   HOME-CANVAS-SELECT-1B-2 — 프레임의 **제안**을 확정한다

   proposeStudioCanvasSelection({ ids, primaryId, mode, generation })

   프레임(lasso · Shift 클릭)은 "이것들이 잡혔다"까지만 올린다.
   무엇이 최종 선택인지는 **언제나 이 문서가 지금 draft 를 보고**
   정한다 — 프레임이 보낸 순서도, 개수도, 존재도 믿지 않는다.

   ★ 하나라도 어긋나면 **메시지 전체를 거부**한다.

   "절반만 반영"을 만들지 않는다. 지워진 요소의 옛 id 하나가 섞인
   lasso 결과가 나머지를 조용히 바꾸면, 사용자가 본 것과 상태가
   달라진다. 거부하면 화면은 직전 상태 그대로이고, 다음 lasso 가
   맞는 결과를 올린다.

   ★ 정렬과 primary 는 여기서 정한다(§6).

     ids      draft 의 canvas.elements[] **배열 순서**
     primary  제안된 primary 가 결과에 남아 있으면 그것,
              아니면 배열상 **마지막** id(= 가장 앞에 보이는 요소)
     비면     primaryId: null
========================================================== */

function proposeStudioCanvasSelection(proposal) {

  const value =
    (proposal && typeof proposal === "object") ? proposal : null;

  if (!value || !Array.isArray(value.ids)) {
    return false;
  }

  const mode =
    value.mode === "toggle" ? "toggle" : "replace";

  /* 편집이 꺼져 있으면 제안 자체가 성립하지 않는다 */
  if (!studioCanvasEditingIsOn()) {
    return false;
  }

  const payload =
    studioCanvasDraftPayload();

  if (!payload) {
    return false;
  }


  /* ── 1. 형태 · 중복 · 존재 · 고를 수 있는가 ── */

  const proposed =
    [];

  for (let i = 0; i < value.ids.length; i += 1) {

    const id =
      value.ids[i];

    if (typeof id !== "string" || proposed.indexOf(id) !== -1) {

      console.warn(
        "[studio-canvas] 제안에 중복되거나 잘못된 식별자가 있습니다 — 전체를 무시합니다.",
        { id }
      );

      return false;

    }

    if (!studioCanvasSelectableElement(id)) {

      console.warn(
        "[studio-canvas] 제안된 식별자를 지금 draft 에서 고를 수 없습니다 — 전체를 무시합니다.",
        { id }
      );

      return false;

    }

    proposed.push(id);

  }

  if (proposed.length > STUDIO_CANVAS_MAX_SELECTED) {
    return false;
  }

  if (!proposed.length && mode === "toggle") {
    /* 뜻이 없는 제안이다(Shift + 빈 lasso 는 프레임이 이미 걸렀다) */
    return false;
  }


  /* ── 2. 합치기 ── */

  const current =
    studioCanvasSelection ? studioCanvasSelection.ids.slice() : [];

  let wanted;

  if (mode === "replace") {
    wanted = proposed;
  }
  else {

    wanted = current.slice();

    proposed.forEach(
      (id) => {

        const at =
          wanted.indexOf(id);

        if (at === -1) {
          wanted.push(id);
        }
        else {
          wanted.splice(at, 1);
        }

      }
    );

  }


  /* ── 3. 정규화 — draft 의 배열 순서 ──

     HOME-CANVAS-V2-EDITOR-1A: 그 순서를 아는 곳이 한 곳으로 모였다
     (studioCanvasNodeList — v1 은 요소 배열, v2 는 블록 → 프레임 내부
     → overlay). 여기서 버전을 나누어 적지 않는다. */

  const order =
    studioCanvasNodeList().map((node) => node.id);

  const ids =
    order.filter((id) => wanted.indexOf(id) !== -1);


  if (!ids.length) {

    studioCanvasSelectionGeneration += 1;

    clearStudioCanvasSelection({ keepFrameSelection: true });

    return true;

  }


  /* ── 4. primary ── */

  const proposedPrimary =
    (typeof value.primaryId === "string" && ids.indexOf(value.primaryId) !== -1)
      ? value.primaryId
      : null;

  const primaryId =
    proposedPrimary || ids[ids.length - 1];


  /* ── 5. 확정 ── */

  studioCanvasSelectionGeneration += 1;

  const entries =
    ids.map(
      (id) => {

        const element =
          studioCanvasSelectableElement(id);

        const previous =
          studioCanvasSelection
            ? studioCanvasSelection.items.find((item) => item.id === id)
            : null;

        return {
          id: element.id,
          type: element.type,
          locked: element.locked,
          hidden: element.hidden,

          /* 좌표는 프레임이 곧 올려 준다(preview:inspect-rects) —
             제안 메시지에는 싣지 않는다. 이미 알고 있는 것이
             있으면 그동안 그것을 쓴다. */
          rect: previous ? previous.rect : null,
          visibleRect: previous ? previous.visibleRect : null
        };

      }
    );

  const applied =
    applyStudioCanvasSelection(entries, { primaryId: primaryId });


  /* =====================================================
     프레임 안 Inspector 도 primary 를 가리키게 한다.

     그래야 좌표 보고(preview:inspect-rects)가 primary 의 것이 되고,
     fallback 테두리와 팝오버 자리가 맞는다. 프레임 쪽 pick() 은
     조용하다(silent) — 되받아 올려보내지 않으므로 왕복이 생기지
     않는다(skin/sandbox/skin-sandbox-inspect.js · preview-bridge.js).
  ====================================================== */

  studioCanvasExpectedFrameId = primaryId;

  if (typeof window.postInspectorSelectionToFrame === "function") {
    window.postInspectorSelectionToFrame(primaryId);
  }

  return applied;

}


/* =========================================================
   HOME-CANVAS-TRANSFORM-1A · 1B · 1C + INSPECTOR-1A — 한 벌의 **확정**

   commitStudioCanvasElementChange(request, gate)

   입구가 둘이고, 뒤 본체는 하나다.

     commitStudioCanvasElementTransform  프레임의 직접 조작
                                         (move · resize · rotate)
     commitStudioCanvasInspectorEdit     왼쪽 패널의 입력칸
                                         (+ text · 세션 기록)

   request = {
     kind       : "move" | "resize" | "rotate" | "text"
     id         : element id
     expected   : 제스처를 시작할 때 · 입력을 시작할 때의 값
     next       : 손을 놓은 값 · 확정한 값
     generation : 선택 순번
     coalesce   : (패널 · text 전용) 기록은 세션이 맡는다
   }

   `kind` 가 소유하는 칸이 다르다.

     move     { x, y }
     resize   { x, y, width, height }   height 는 숫자 또는 "auto"
     rotate   { rotation }              유한한 숫자 하나
     text     { text }                  2000자 이하 문자열 (props 안)

   ★ 그 밖에는 **한 줄도 갈라지지 않는다.** 선택 · 순번 · expected ·
     허용 키 · 범위를 보는 관문이 하나이고, 불변 수정도 그 순수 함수
     한 쌍이 한다(skin/skin-home-canvas.js 의 공용
     writeSkinHomeCanvasElementFields). 리사이즈가 별도 저장 경로를
     만들지 않는다.

   → { accepted: boolean, reason }

   ★ 프레임이 보낸 값을 그대로 draft 에 쓰지 않는다.

   프레임은 자기 DOM 과 부모가 내려 준 좌표만 안다. 그 사이에
   Undo · Import · AI 적용 · 선택 변경 · 요소 삭제가 있었을 수
   있고, 위조된 메시지일 수도 있다. 그래서 여기서 **처음부터 다시**
   본다 — 프레임에서 온 값 중 살아남는 것은 숫자 넷과 id 하나뿐이다.

     1  Canvas 편집이 켜져 있다(HOME · 유효한 canvas · Select)
     2  kind 는 "move" · "resize" · "rotate" 셋 중 하나
     3  id 형태가 맞다
     4  지금 선택이 **정확히 그 하나**이고 primary 도 그것
     5  순번이 최신이다(늦게 도착한 옛 제스처를 버린다)
     6  그 요소가 지금 draft 에 있고 hidden 도 locked 도 아니다
     7  expected · next 는 그 kind 가 소유한 칸뿐이고 유한한 숫자다
        (리사이즈의 height 만 "auto" 도 된다 — 그 요소의 type 이
         허용할 때만)
     8  지금 draft 의 그 칸들이 expected 와 **정확히** 같다
     9  next 가 계약의 좌표 · 크기 · 길이 범위 안이다 (7~9 는 순수
        함수가 본다 — skin/skin-home-canvas.js
        writeSkinHomeCanvasElementPosition · …ElementBox ·
        …ElementRotation · …ElementText)

   ★ 거부해도 화면은 되돌아간다.

   끝에서 언제나 지금 좌표를 프레임에 다시 내려보낸다. 승인이면
   방금 놓은 자리가, 거부면 예전 자리가 내려가므로 프레임은 별도의
   "거부" 메시지 없이 원상 복원된다.

   ★ 한 제스처 = Undo 한 칸.

   기록은 draft 를 실제로 바꿀 때 한 번만 생긴다(아래 setStudio…
   한 줄). 끄는 동안에는 아무것도 기록되지 않고, 이동량 0 과 거부는
   그 줄에 닿지 않는다.
========================================================== */

/*
  HOME-CANVAS-V2-EDITOR-1B — 그 kind 가 실제로 고르는 writer 이름

  studioCanvasEffectiveKind("resize") -> "resize" | "v2-resize"

  ★ 지금 draft 가 v2 일 때만 바꾼다. 패널은 이미 v2 이름으로
    보내므로(그 화면은 version 을 안다) 이 함수를 두 번 지나도
    같은 값이다.
*/
function studioCanvasEffectiveKind(kind) {

  if (!Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_V2_KIND_OF, kind)) {
    return kind;
  }

  return (studioCanvasPayloadVersion(studioCanvasDraftPayload()) === 2)
    ? STUDIO_CANVAS_V2_KIND_OF[kind]
    : kind;

}


function commitStudioCanvasElementChange(request, gate) {

  const kinds =
    (gate && Array.isArray(gate.kinds)) ? gate.kinds : STUDIO_CANVAS_FRAME_KINDS;

  const value =
    (request && typeof request === "object") ? request : null;

  const requestId =
    (value && Number.isInteger(value.requestId) && value.requestId >= 1)
      ? value.requestId
      : 0;

  const answer =
    (accepted, reason) => {

      /* 승인이든 거부든 **여기 한 번**이 그 요청의 답이다. 답에만
         요청 번호를 달아 보내므로, 그 사이에 오간 다른 좌표 메시지가
         답으로 읽히지 않는다(계약 §17-8). */
      postStudioCanvasGeometryToFrame(requestId);

      if (!accepted) {

        console.info(
          "[studio-canvas] 조작 확정을 받아들이지 않았습니다",
          { kind: value && value.kind, reason: reason }
        );

      }

      return { accepted: accepted, reason: reason };

    };


  if (!value) {
    return answer(false, "shape");
  }

  if (typeof value.kind !== "string" || kinds.indexOf(value.kind) === -1) {
    return answer(false, "kind");
  }

  if (
    typeof value.id !== "string" ||
    !STUDIO_CANVAS_ELEMENT_ID_PATTERN.test(value.id)
  ) {
    return answer(false, "id");
  }

  if (!studioCanvasEditingIsOn()) {
    return answer(false, "not-editing");
  }

  if (
    !studioCanvasSelection ||
    studioCanvasSelection.ids.length !== 1 ||
    studioCanvasSelection.ids[0] !== value.id ||
    studioCanvasSelection.primaryId !== value.id
  ) {
    return answer(false, "selection");
  }

  if (
    !Number.isInteger(value.generation) ||
    value.generation !== studioCanvasSelection.generation
  ) {
    return answer(false, "generation");
  }

  if (!studioCanvasSelectableElement(value.id)) {
    return answer(false, "element");
  }

  /* =====================================================
     HOME-CANVAS-V2-EDITOR-1B — 프레임의 kind 를 v2 의 kind 로

     ★ 관문을 지난 **뒤에** 바꾼다. 무엇이 들어올 수 있는가는
       여전히 위 `kinds` 가 정하고(프레임은 셋뿐), 여기서 바뀌는
       것은 "그 이름이 어느 writer 를 고르는가"뿐이다.

     ★ 판정의 근거는 **지금 draft** 하나다. 프레임이 보낸 값에는
       version 도 자도 실려 있지 않다 — 그것을 아는 곳은 언제나
       이 문서다(§14 의 소유권).
  ====================================================== */
  const kind =
    studioCanvasEffectiveKind(value.kind);

  /* 그 kind 를 실제로 draft 에 쓸 수 있는 함수가 이 문서에 있는가 */
  const writer =
    {
      move: window.setStudioCanvasElementPosition,
      resize: window.setStudioCanvasElementBox,
      rotate: window.setStudioCanvasElementRotation,

      /* HOME-CANVAS-INSPECTOR-1A — 글자 내용 한 칸(`props.text`) */
      text: window.setStudioCanvasElementText,

      /* HOME-CANVAS-V2-EDITOR-1A — v2 의 기본 배치. 전부 v2 전용
         불변 writer 를 지난다(skin/skin-home-canvas-write-v2.js) —
         v1 writer 는 `canvas.elements` 를 찾으므로 v2 데이터에
         애초에 닿지 않는다(계약 §25-1). */
      "v2-align": window.setStudioCanvasV2BlockAlign,
      "v2-width": window.setStudioCanvasV2BlockWidth,
      "v2-height": window.setStudioCanvasV2BlockHeight,
      "v2-margin": window.setStudioCanvasV2BlockMargin,
      "v2-order": window.setStudioCanvasV2BlockOrder,
      "v2-text": window.setStudioCanvasV2NodeText,

      /* HOME-CANVAS-V2-EDITOR-1B — 프레임 내부 요소 · overlay 의
         자리. 자 위의 값을 storage 칸으로 옮기는 번역이 그 안에
         있다(studio/inspector/studio-canvas-v2-space.js). */
      "v2-move": window.setStudioCanvasV2NodeMove,
      "v2-resize": window.setStudioCanvasV2NodeResize,
      "v2-rotate": window.setStudioCanvasV2NodeRotation
    }[kind];

  if (typeof writer !== "function") {
    return answer(false, "unsupported");
  }


  /*
    ★ 모르는 키는 **버리지 않고 거부한다.**

    처음에는 x · y 만 새 리터럴로 옮겨 담았다. 그러면 `next` 에
    width 가 섞여 와도 조용히 빠지고 나머지는 저장된다 — 1A 의
    e2e 가 그것을 "받아들였다"로 잡았다. 조용히 고쳐 주면 "이
    메시지가 소유하는 것은 이 칸들"이라는 계약이 **말로만** 남는다.
    어긋난 메시지는 통째로 버리는 편이 맞다(sandbox 프로토콜도 같은
    판정을 한 번 더 한다).

    ★ 1B 에서 허용 키가 kind 마다 달라졌다. 그래도 "정확히 이 키들"
      이라는 규칙은 그대로다 — 리사이즈 요청에 좌표 둘만 오거나,
      이동 요청에 width 가 섞이면 둘 다 거부다.

    거부한 뒤에 넘기는 값은 그래도 **새 리터럴**이다 — 프레임이
    보낸 객체 자체는 이 줄 뒤로 넘어가지 않는다.
  */

  /* HOME-CANVAS-TRANSFORM-1C — 회전이 소유하는 것은 **한 칸**이다.
     좌표 둘이 실린 rotate 도, rotation 이 섞인 move 도 거부다. */
  /* HOME-CANVAS-INSPECTOR-1A — 글자는 `text` **한 칸**이다. 좌표가
     섞인 text 도, text 가 섞인 move 도 거부다(위와 같은 규칙). */
  /* HOME-CANVAS-V2-EDITOR-1A — v2 칸도 같은 규칙이다. `margin` 은
     네 칸을 **함께** 소유한다(한 칸만 새로 만들면 나머지 셋이 "없음"
     인 채로 남아 다음 입력의 expected 가 갈린다 — 계약 §25-4). */
  const wanted =
    {
      move: ["x", "y"],
      resize: ["x", "y", "width", "height"],
      rotate: ["rotation"],
      text: ["text"],

      "v2-align": ["align"],
      "v2-width": ["width"],
      "v2-height": ["height"],
      "v2-margin": ["top", "right", "bottom", "left"],
      "v2-order": ["index"],
      "v2-text": ["text"],

      /* HOME-CANVAS-V2-EDITOR-1B — v1 의 세 kind 와 **같은 칸**이다.
         프레임이 보내는 메시지의 모양이 바뀌지 않는 것이 그 뜻이고
         (§26-2), 그 값이 무슨 자인지는 부모만 안다. */
      "v2-move": ["x", "y"],
      "v2-resize": ["x", "y", "width", "height"],
      "v2-rotate": ["rotation"]
    }[kind];

  const asBox =
    (point) => {

      if (!point || typeof point !== "object" || Array.isArray(point)) {
        return null;
      }

      const keys =
        Object.keys(point);

      if (
        keys.length !== wanted.length ||
        wanted.some((key) => keys.indexOf(key) === -1)
      ) {
        return null;
      }

      const copy = {};

      wanted.forEach((key) => {
        copy[key] = point[key];
      });

      return copy;

    };

  const next =
    asBox(value.next);

  const expected =
    asBox(value.expected);

  if (!next || !expected) {
    return answer(false, "point");
  }


  /* =====================================================
     HOME-CANVAS-INSPECTOR-1A — 기록을 세션이 맡는 경우

     ★ 패널 입구에서만, 그리고 글자에서만 켜진다. 프레임이 보낸
       메시지에 이 칸이 섞여 와도 `gate.allowCoalesce` 가 없으므로
       읽지 않는다 — 한 제스처 = Undo 한 칸이라는 계약을 프레임이
       끌 수 있게 두지 않는다(§17-6).
  ====================================================== */
  const coalesce =
    !!(gate && gate.allowCoalesce) &&
    (kind === "text" || kind === "v2-text") &&
    value.coalesce === true;

  const result =
    writer(
      value.id,
      next,
      expected,
      coalesce ? { coalesceHistory: true } : undefined
    );

  if (!result || !result.ok) {
    return answer(false, (result && result.reason) || "rejected");
  }

  if (result.unchanged) {
    return answer(true, "unchanged");
  }

  return answer(true, "ok");

}


/*
  프레임(native · sandbox)의 직접 조작 확정 — 이동 · 리사이즈 · 회전.
  기존 이름과 기존 권한 그대로다.
*/
function commitStudioCanvasElementTransform(request) {

  return commitStudioCanvasElementChange(
    request,
    { kinds: STUDIO_CANVAS_FRAME_KINDS, allowCoalesce: false }
  );

}


/*
  HOME-CANVAS-INSPECTOR-1A — 왼쪽 패널의 입력칸이 쓰는 입구.

  ★ 같은 관문 한 벌을 그대로 지난다(선택 · 순번 · hidden/locked ·
    허용 키 · expected · 범위). 패널용으로 검사를 덜지 않는다.

  ★ 더 쓸 수 있는 것은 `kind:"text"` 하나와, 글자 입력 세션이
    기록을 스스로 맡는 `coalesce` 하나다.
*/
function commitStudioCanvasInspectorEdit(request) {

  return commitStudioCanvasElementChange(
    request,
    { kinds: STUDIO_CANVAS_PANEL_KINDS, allowCoalesce: true }
  );

}


/* =========================================================
   HOME-CANVAS-V2-ADD-1 — 새 재료 하나를 만드는 입구

   commitStudioCanvasAddNode({ target, type, slot })

     -> { accepted:true, id, slot, declaredSlot }
     -> { accepted:false, reason }

   ★ **고치는 관문과 같은 문이 아니다.** 위
     commitStudioCanvasElementChange() 는 "지금 고른 그 요소의 이
     칸을 이 값으로"를 확정한다 — 선택 · 순번 · expected 가 전부
     그 하나를 가리킨다. 추가에는 그 셋이 없다(없던 것을 만든다).
     그래서 문을 따로 두고, 여기서 보는 것은 셋이다.

       편집 중인가        studioCanvasEditingIsOn()
       지금 draft 가 v2 인가
       그 자리가 그 종류를 받는가(아래 두 표)

     데이터가 계약을 지키는지는 순수 함수가 **넣어 본 뒤 전체를**
     다시 검증한다(skin/skin-home-canvas-write-v2.js).

   ★ 만든 뒤 **곧바로 고른다.** 기존 제안 경로 하나를 그대로 쓰므로
     (proposeStudioCanvasSelection) 순서 · primary · 프레임 통지가
     lasso 와 같은 길을 지나고, 좌표는 프레임이 다시 그린 뒤 올려
     준다(§26-2 의 그 왕복).

   ★ 프레임은 이 문을 쓸 수 없다. 여기에 닿는 것은 부모 realm 의
     왼쪽 패널뿐이다(글자 내용과 같은 사정 — 위 두 입구의 권한 표).
========================================================== */

/*
  어느 자리가 어떤 종류를 받는가.

  ★ 값 표를 새로 적지 않는다 — 자동 배치는 계약의 블록 다섯이고
    (SKIN_HOME_CANVAS_BLOCK_TYPES), 페이지 자유 장식은 v1 요소
    여섯이다(SKIN_HOME_CANVAS_ELEMENT_TYPES). 둘 다 skin 쪽 파일이
    선언한 그 배열을 call time 에 읽는다.
*/
function studioCanvasV2AddTypes(target) {

  if (target === "flow") {

    return Array.isArray(window.SKIN_HOME_CANVAS_BLOCK_TYPES)
      ? window.SKIN_HOME_CANVAS_BLOCK_TYPES
      : null;

  }

  if (target === "overlay") {

    return Array.isArray(window.SKIN_HOME_CANVAS_ELEMENT_TYPES)
      ? window.SKIN_HOME_CANVAS_ELEMENT_TYPES
      : null;

  }

  return null;

}


function commitStudioCanvasAddNode(request) {

  const value =
    (request && typeof request === "object") ? request : null;

  if (!value) {
    return { accepted: false, reason: "shape" };
  }

  if (!studioCanvasEditingIsOn()) {
    return { accepted: false, reason: "not-editing" };
  }

  if (studioCanvasPayloadVersion(studioCanvasDraftPayload()) !== 2) {
    return { accepted: false, reason: "canvas" };
  }

  const types =
    studioCanvasV2AddTypes(value.target);

  if (!types) {
    return { accepted: false, reason: "target" };
  }

  if (types.indexOf(value.type) === -1) {
    return { accepted: false, reason: "type" };
  }

  if (typeof window.addStudioCanvasV2Node !== "function") {
    return { accepted: false, reason: "unsupported" };
  }

  const result =
    window.addStudioCanvasV2Node({
      target: value.target,
      type: value.type,
      slot: (typeof value.slot === "string") ? value.slot : ""
    });

  if (!result || !result.ok) {

    console.info(
      "[studio-canvas] 새 재료를 만들지 않았습니다",
      { target: value.target, type: value.type, reason: result && result.reason }
    );

    return { accepted: false, reason: (result && result.reason) || "rejected" };

  }

  proposeStudioCanvasSelection({
    ids: [result.id],
    primaryId: result.id,
    mode: "replace"
  });

  return {
    accepted: true,
    id: result.id,
    slot: result.slot || null,
    declaredSlot: result.declaredSlot || null
  };

}


function studioCanvasSelectionIsActive() {

  return !!studioCanvasSelection;

}


/*
  setStudioCanvasFrameActive(active, editId)

  HOME-CANVAS-SELECT-1B-1 — Preview 문서의 보고다(위
  studioCanvasFrameActive 주석). 지금 고른 요소에 대한 보고가
  아니면 받지 않는다 — 늦게 도착한 옛 요소의 "붙었다"가 새 선택의
  테두리를 지우지 않게.
*/

function setStudioCanvasFrameActive(active, editId) {

  const next =
    !!active &&
    !!studioCanvasSelection &&
    (typeof editId !== "string" || editId === studioCanvasSelection.primaryId);

  if (studioCanvasFrameActive === next) {
    return;
  }

  studioCanvasFrameActive = next;

  repaintStudioCanvasSelection();

}


/*
  syncStudioCanvasSelectionRects(selected)

  프레임이 주기적으로 올리는 좌표(preview:inspect-rects)다. 고른
  요소가 그대로면 좌표만 갱신하고, 프레임이 더 이상 그 요소를
  가리키지 않으면 선택을 **푼다**(다른 요소로 바꾸지 않는다).
*/
function syncStudioCanvasSelectionRects(selected) {

  if (!studioCanvasSelection) {
    return;
  }

  const rect =
    selected ? studioCanvasRectLiteral(selected.rect) : null;

  const matches =
    !!rect && selected.editId === studioCanvasSelection.primaryId;


  if (!matches) {

    /* =====================================================
       HOME-CANVAS-SELECT-1B-2 — **부모가 방금 바꾼 선택**이면
       프레임이 아직 따라오지 않은 것뿐이다.

       lasso 와 Shift 클릭은 부모가 확정한다. 그 직후 프레임 안
       Inspector 는 아직 **클릭으로 잡았던 옛 요소**(또는 아무것도
       아닌 것)를 가리키고 있고, 그 좌표 보고가 한 박자 먼저
       올라온다. 그것을 "프레임이 놓았다"로 읽으면 방금 만든
       다중 선택이 곧바로 지워진다.

       그래서 부모가 프레임에 "이것을 집어라"를 내려보낸 뒤로는,
       프레임이 그 id 를 실제로 집었다고 알려 줄 때까지 어긋난
       보고를 **무시**한다. 프레임이 스스로 놓은 경우(기대가 없는
       경우)는 지금까지처럼 선택을 푼다.
    ====================================================== */

    if (studioCanvasExpectedFrameId === studioCanvasSelection.primaryId) {
      return;
    }

    /* 프레임이 이미 그 요소를 놓았다는 소식이다 — 되받아 보내지
       않는다(같은 말을 왕복시키면 늦게 도착한 메시지가 다음 선택을
       지울 수 있다) */
    clearStudioCanvasSelection({ keepFrameSelection: true });

    return;

  }


  /* 프레임이 따라왔다 */
  studioCanvasExpectedFrameId = null;


  const item =
    studioCanvasPrimaryItem();

  if (!item) {
    return;
  }

  item.rect = rect;

  item.visibleRect =
    studioCanvasRectLiteral(selected.visibleRect) || rect;

  repaintStudioCanvasSelection();

}


/*
  reconcileStudioCanvasSelection()

  working draft 가 바뀔 때마다 한 번 부른다(studio/studio-preview.js
  bumpStudioWorkingRevision — Direct Edit · Code Apply · Import ·
  AI 적용 · 되돌리기 · 이미지 슬롯 · remount 가 전부 그 한 곳을
  지난다). 기존 Inspector 선택의 reconcile 과 같은 자리다.

  다음이 전부 여기서 풀린다.

    요소 삭제 · 캔버스 삭제 · enabled:false · 미래 version ·
    데이터가 깨짐 · 그 요소가 hidden/locked 로 바뀜 ·
    HOME 이 아닌 페이지로 이동 · 다른 스킨 Import · Save 후 다시 열기

  없어진 요소를 임의의 다른 요소로 바꾸지 않는다 — 조용히 푼다.
*/
function reconcileStudioCanvasSelection() {

  if (!studioCanvasSelection) {

    /* 선택은 없어도 편집 모드는 바뀌었을 수 있다 — 캔버스가
       생기거나 사라지는 것이 전부 이 관문을 지난다 */
    syncStudioCanvasFrameMode();

    return;

  }


  /* =====================================================
     HOME-CANVAS-SELECT-1B-2 — **살아남은 것만 남긴다**

     하나가 지워졌다고 나머지 선택까지 풀지 않는다(§11). 전부
     사라졌을 때만 해제한다.
  ====================================================== */

  const survivors =
    studioCanvasSelection.items
      .map((item) => ({ item, element: studioCanvasSelectableElement(item.id) }))
      .filter((entry) => !!entry.element);


  if (!survivors.length) {

    console.info(
      "[studio-canvas] 캔버스 선택을 유지할 근거가 없어 해제합니다",
      { ids: studioCanvasSelection.ids }
    );

    clearStudioCanvasSelection();

    return;

  }


  if (survivors.length === studioCanvasSelection.items.length) {

    /* 종류가 바뀌었을 수 있다(Code Apply · Import) — 이름표만 따라간다 */
    survivors.forEach((entry) => {
      entry.item.type = entry.element.type;
    });

    repaintStudioCanvasSelection();

    syncStudioCanvasFrameMode();

    return;

  }


  /* 일부가 사라졌다 — primary 가 살아 있으면 그대로 두고, 아니면
     배열상 마지막(= 가장 앞에 보이는 요소)으로 옮긴다(§6). */

  const ids =
    survivors.map((entry) => entry.item.id);

  const primaryId =
    ids.indexOf(studioCanvasSelection.primaryId) !== -1
      ? studioCanvasSelection.primaryId
      : ids[ids.length - 1];


  console.info(
    "[studio-canvas] 사라진 요소만 선택에서 뺍니다",
    { kept: ids, primaryId }
  );


  applyStudioCanvasSelection(
    survivors.map((entry) => ({
      id: entry.item.id,
      type: entry.element.type,
      locked: entry.element.locked,
      hidden: entry.element.hidden,
      rect: entry.item.rect,
      visibleRect: entry.item.visibleRect
    })),
    { primaryId: primaryId }
  );

}


/* =========================================================
   4. 읽기 — 언제나 복사본

   상태를 밖으로 그대로 내보내면 읽은 쪽이 고칠 수 있고, 그러면
   "쓰기 경로는 하나"가 깨진다.
========================================================== */

function getStudioCanvasSelection() {

  if (!studioCanvasSelection) {
    return {
      ids: [],
      primaryId: null,
      items: [],
      generation: studioCanvasSelectionGeneration,
      frameActive: false
    };
  }

  return {
    ids: studioCanvasSelection.ids.slice(),
    primaryId: studioCanvasSelection.primaryId,
    frameActive: studioCanvasFrameActive,
    items: studioCanvasSelection.items.map((item) => ({
      id: item.id,
      type: item.type,
      locked: item.locked,
      hidden: item.hidden,
      label: studioCanvasElementLabel(item.type),
      rect: item.rect ? { ...item.rect } : null,
      visibleRect: item.visibleRect ? { ...item.visibleRect } : null
    })),
    generation: studioCanvasSelection.generation
  };

}


if (typeof window !== "undefined") {

  window.getStudioCanvasSelection = getStudioCanvasSelection;
  window.setStudioCanvasSelection = setStudioCanvasSelection;
  window.clearStudioCanvasSelection = clearStudioCanvasSelection;
  window.reconcileStudioCanvasSelection = reconcileStudioCanvasSelection;
  window.repaintStudioCanvasSelection = repaintStudioCanvasSelection;
  window.syncStudioCanvasSelectionRects = syncStudioCanvasSelectionRects;

  window.setStudioCanvasFrameActive = setStudioCanvasFrameActive;

  /* HOME-CANVAS-TRANSFORM-1A */
  window.commitStudioCanvasElementTransform = commitStudioCanvasElementTransform;

  /* HOME-CANVAS-INSPECTOR-1A */
  window.commitStudioCanvasInspectorEdit = commitStudioCanvasInspectorEdit;

  /* HOME-CANVAS-V2-ADD-1 — 새 재료 하나(왼쪽 패널 전용 입구) */
  window.commitStudioCanvasAddNode = commitStudioCanvasAddNode;
  window.studioCanvasV2AddTypes = studioCanvasV2AddTypes;
  window.notifyStudioCanvasPanel = notifyStudioCanvasPanel;
  window.postStudioCanvasGeometryToFrame = postStudioCanvasGeometryToFrame;
  window.studioCanvasSingleGeometry = studioCanvasSingleGeometry;

  /* HOME-CANVAS-SELECT-1B-2 */
  window.proposeStudioCanvasSelection = proposeStudioCanvasSelection;
  window.syncStudioCanvasFrameMode = syncStudioCanvasFrameMode;
  window.studioCanvasEditingIsOn = studioCanvasEditingIsOn;

  window.studioCanvasSelectionIsActive = studioCanvasSelectionIsActive;

  window.studioCanvasFrameIsActive = () => studioCanvasFrameActive;
  window.studioCanvasSelectableElement = studioCanvasSelectableElement;
  window.studioCanvasDraftElement = studioCanvasDraftElement;
  window.studioCanvasDraftPayload = studioCanvasDraftPayload;
  window.studioCanvasElementLabel = studioCanvasElementLabel;

  /* HOME-CANVAS-V2-EDITOR-1A */
  window.studioCanvasPayloadVersion = studioCanvasPayloadVersion;
  window.studioCanvasNodeInfo = studioCanvasNodeInfo;
  window.studioCanvasNodeList = studioCanvasNodeList;
  window.studioCanvasSelectTargetId = studioCanvasSelectTargetId;

  /* HOME-CANVAS-V2-EDITOR-1B */
  window.studioCanvasEffectiveKind = studioCanvasEffectiveKind;

}
