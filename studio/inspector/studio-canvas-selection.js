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


const STUDIO_CANVAS_TYPE_LABELS = {
  photo: "Canvas 사진",
  logo: "Canvas 로고",
  sticker: "Canvas 스티커",
  text: "Canvas 글자",
  category_nav: "Canvas 카테고리",
  shape: "Canvas 도형"
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

  return (payload && Array.isArray(payload.elements)) ? payload : null;

}


/*
  studioCanvasDraftElement(elementId) -> element | null

  "그 id 를 가진 요소가 지금 draft 의 캔버스에 실제로 있는가."
  hidden · locked 는 보지 않는다 — 존재 여부만이다.
*/
function studioCanvasDraftElement(elementId) {

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

  const hit =
    payload.elements.find((element) => element && element.id === elementId);

  return hit || null;

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

  const item =
    studioCanvasSelection.items[0] || null;

  const rect =
    item ? (item.visibleRect || item.rect) : null;

  if (typeof paintStudioInspectorBox === "function") {
    paintStudioInspectorBox(studioCanvasSelectBox, rect);
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


function applyStudioCanvasSelection(entries, options) {

  const next =
    (Array.isArray(entries) && entries.length)
      ? {
          ids: entries.map((entry) => entry.id),
          primaryId: entries[0].id,
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
  }
  else {
    ensureStudioCanvasOverlay();
  }

  repaintStudioCanvasSelection();

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
    return;
  }

  applyStudioCanvasSelection(null, options);

}


function studioCanvasSelectionIsActive() {

  return !!studioCanvasSelection;

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

  if (!rect || selected.editId !== studioCanvasSelection.primaryId) {

    /* 프레임이 이미 그 요소를 놓았다는 소식이다 — 되받아 보내지
       않는다(같은 말을 왕복시키면 늦게 도착한 메시지가 다음 선택을
       지울 수 있다) */
    clearStudioCanvasSelection({ keepFrameSelection: true });

    return;

  }

  const item =
    studioCanvasSelection.items[0];

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
    return;
  }

  const element =
    studioCanvasSelectableElement(studioCanvasSelection.primaryId);

  if (!element) {

    console.info(
      "[studio-canvas] 캔버스 선택을 유지할 근거가 없어 해제합니다",
      { id: studioCanvasSelection.primaryId }
    );

    clearStudioCanvasSelection();

    return;

  }

  /* 종류가 바뀌었을 수 있다(Code Apply · Import) — 이름표만 따라간다 */
  studioCanvasSelection.items[0].type =
    element.type;

  repaintStudioCanvasSelection();

}


/* =========================================================
   4. 읽기 — 언제나 복사본

   상태를 밖으로 그대로 내보내면 읽은 쪽이 고칠 수 있고, 그러면
   "쓰기 경로는 하나"가 깨진다.
========================================================== */

function getStudioCanvasSelection() {

  if (!studioCanvasSelection) {
    return { ids: [], primaryId: null, items: [], generation: studioCanvasSelectionGeneration };
  }

  return {
    ids: studioCanvasSelection.ids.slice(),
    primaryId: studioCanvasSelection.primaryId,
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

  window.studioCanvasSelectionIsActive = studioCanvasSelectionIsActive;
  window.studioCanvasSelectableElement = studioCanvasSelectableElement;
  window.studioCanvasDraftElement = studioCanvasDraftElement;
  window.studioCanvasDraftPayload = studioCanvasDraftPayload;
  window.studioCanvasElementLabel = studioCanvasElementLabel;

}
