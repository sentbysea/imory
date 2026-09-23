/* =========================================================
   SKIN STUDIO — MOBILE SHEET (MOBILE-SHEET-1)

   기준 문서: IMORY_STUDIO_SHELL_DESIGN.md §5-1

   좁은 화면(720px 이하)에서 왼쪽 패널(#studioLeftPanel)은 화면 아래에서
   올라오는 시트다. 예전에는 높이 55% 한 가지라 Preview 아래 절반을
   늘 가렸다. 이제 세 단계다.

     peek     접힘 — 손잡이 · 요소 이름 · 단계 버튼 · Quick Bar 한 줄.
              본문은 높이 0 · 보이지 않음 · inert(포커스도 못 들어간다).
     content  내용 보기 — 내용 높이만큼, 화면의 52% 까지. 넘치면 시트
              안쪽만 스크롤.
     full     전체 화면 — 상단 도구 모음 아래부터 화면 아래(키보드 위)까지.

   ★ 이 파일이 하는 일과 안 하는 일
     여닫기 · 어느 내용을 보여 줄지 · 어느 단계로 열지는 셸
     (studio-shell.js)이 정한다. 이 파일은 그 폭에서의 **단계** ·
     Preview 가림 방지 · 키보드 · Escape 단계 내리기를 맡는다. 손잡이
     드래그는 바로 뒤에 로드되는 studio/studio-sheet-drag.js 에 있다. 넓은 화면에서는 단계 값을 들고만 있고 아무 모양도 바꾸지
     않는다(CSS 가 좁은 화면에서만 읽는다).

   ★ 단계는 편집이 아니다
     Undo 기록 · dirty · working draft · 선택 · 입력칸 값 · Images 목록 ·
     Dock 사본 · AI 선택 · Preview 페이지에 닿지 않는다. 본문 DOM 을
     다시 만들지 않고 높이만 바꾼다 — 그래서 입력하던 값과 목록
     스크롤이 그대로 남는다(display:none 을 쓰지 않는 이유도 이것이다
     — 스크롤 위치가 사라진다).

   ★ Preview 가림 방지 — 스킨이 아니라 Preview 문서에만
     시트가 덮는 높이를 재어 두 곳에 알린다.
       1) Studio: shell 의 --studio-mobile-sheet-height
       2) Preview 문서: "preview:viewport-inset" { bottom } — 프레임 CSS
          픽셀(Mobile 축소 배율 반영). Preview 문서가 자기 스크롤 끝에
          Studio 전용 여유 공간과 scroll-padding-bottom 을 둔다
          (studio/preview/preview-sheet-inset.js). 스킨 HTML · CSS ·
          SkinPackage 에는 아무것도 붙지 않는다.
     고른 요소가 시트에 덮이면 ensureSelectedElementVisibleAboveSheet()
     가 Preview 문서만 **필요한 만큼** 스크롤한다("preview:scroll-by").
     요소 좌표 · 스킨 레이아웃은 그대로다.

   의존(호출 시점): studio-shell.js(studioShellIsNarrow ·
   isStudioLeftPanelShowing · collapseStudioLeftPanel) ·
   studio-preview.js(postToPreviewFrameIfReady · previewFrameReady) ·
   studio-inspector-state.js(studioInspectorSelection) ·
   studio-inspector-overlay.js(studioInspectorLabelTopBound) ·
   studio-inspector-quickbar.js(layoutStudioInspectorQuickBar …).
========================================================== */

const STUDIO_SHEET_STATES = ["peek", "content", "full"];

const STUDIO_SHEET_STATE_NAMES = {
  peek: "접힘",
  content: "내용 보기",
  full: "전체 화면"
};

const STUDIO_SHEET_PANEL_NAMES = {
  images: "이미지 바꾸기",
  layers: "레이어와 재료 추가",
  dock: "화면 아래 Dock",
  layout: "HOME 단 구성"
};

/* 내용 보기의 최대 높이 — 화면 높이에 대한 비율 */
const STUDIO_SHEET_CONTENT_RATIO = 0.52;

/* 선택 요소를 시트 · 상단 바에서 이만큼 떨어뜨려 보인다(프레임 px) */
const STUDIO_SHEET_REVEAL_MARGIN = 12;

const studioSheetPanel =
  document.getElementById("studioLeftPanel");

const studioSheetShell =
  document.getElementById("studioPreviewShell");

const studioSheetHeader =
  document.getElementById("studioLeftPanelHeader");

const studioSheetBody =
  document.getElementById("studioLeftPanelBody");

const studioSheetHandle =
  document.getElementById("studioLeftPanelHandle");

const studioSheetName =
  document.getElementById("studioLeftPanelName");

const studioSheetUp =
  document.getElementById("studioLeftPanelSheetUp");

const studioSheetDown =
  document.getElementById("studioLeftPanelSheetDown");

const studioSheetClose =
  document.getElementById("studioLeftPanelCollapse");

const studioSheetStatus =
  document.getElementById("studioLeftPanelStatus");

const studioSheetTitle =
  document.getElementById("studioLeftPanelTitle");

const studioSheetFrame =
  document.getElementById("studioPreviewFrame");

const studioSheetTopDock =
  document.getElementById("studioTopDock");

const studioSheetTopDockZone =
  document.getElementById("studioTopDockZone");

const studioSheetTopDockHandle =
  document.getElementById("studioTopDockHandle");


let studioSheetState = "peek";

/* 손잡이를 잡고 있는 동안의 상태(없으면 null) */
let studioSheetDrag = null;

/* 마지막으로 Preview 문서에 알린 여유 높이(프레임 px) */
let studioSheetInsetSent = 0;

/* 지금 시트가 Studio 화면에서 덮는 높이(px) */
let studioSheetCover = 0;

/* 내용 보기에서 마지막으로 잰 시트 높이 — 드래그의 정착 지점 */
let studioSheetContentHeight = 0;

/* Preview 안 글자 편집이 시트를 잠시 접었다 — 끝나면 이 단계로 */
let studioSheetInlineTextReturn = null;

/* 보낸 스크롤이 아직 좌표로 돌아오지 않았다 — 같은 사각형을 두 번
   올리지 않도록 그만큼을 빼고 계산한다(ref 가 바뀌면 = 새 좌표가
   도착하면 비운다). */
let studioSheetScrollDebt = { ref: null, dy: 0 };

let studioSheetPublishFrame = 0;


function studioSheetNarrow() {

  return typeof studioShellIsNarrow === "function" && studioShellIsNarrow();

}


function studioSheetIsActive() {

  return studioSheetNarrow() &&
    !!studioSheetPanel &&
    studioSheetPanel.classList.contains("is-open");

}


function getStudioSheetState() {

  return studioSheetState;

}



/* =========================================================
   화면에 적기 — 단계 표식 · 단계 버튼 · 이름 · 본문 inert
========================================================== */

function studioSheetNameText() {

  const mode =
    (studioSheetPanel && studioSheetPanel.dataset.mode) || "select";

  if (mode !== "select") {
    return { text: STUDIO_SHEET_PANEL_NAMES[mode] || "", hint: false };
  }

  const popover =
    document.getElementById("studioInspectorPopover");

  const title =
    document.getElementById("studioInspectorPopoverTitle");

  const name =
    title ? title.textContent.trim() : "";

  if (popover && !popover.hidden && name) {
    return { text: name, hint: false };
  }

  return { text: "Preview에서 고칠 요소를 누르세요", hint: true };

}


function setStudioSheetButton(button, glyph, label) {

  if (button.textContent !== glyph) {
    button.textContent = glyph;
  }

  button.title = label;

  button.setAttribute("aria-label", label);

}


function syncStudioSheet() {

  if (!studioSheetPanel) {
    return;
  }

  const narrow =
    studioSheetNarrow();

  const state =
    studioSheetState;

  studioSheetPanel.dataset.sheetState =
    state;

  if (studioSheetBody) {

    const closed =
      narrow && state === "peek" && !studioSheetDrag;

    studioSheetBody.inert =
      closed;

    if (closed) {
      studioSheetBody.setAttribute("aria-hidden", "true");
    } else {
      studioSheetBody.removeAttribute("aria-hidden");
    }

  }

  if (studioSheetUp) {

    studioSheetUp.hidden =
      !narrow || state === "full";

    setStudioSheetButton(
      studioSheetUp,
      state === "peek" ? "▴" : "⤒",
      state === "peek" ? "펼치기" : "전체 화면으로 펼치기"
    );

    studioSheetUp.setAttribute("aria-expanded", String(state !== "peek"));

  }

  if (studioSheetDown) {

    studioSheetDown.hidden =
      !narrow || state === "peek";

    setStudioSheetButton(
      studioSheetDown,
      "▾",
      state === "full" ? "내용 보기로 내리기" : "접기"
    );

    studioSheetDown.setAttribute("aria-expanded", String(state !== "peek"));

  }

  if (studioSheetClose) {

    const label =
      narrow ? "편집 패널 닫기" : "편집 패널 접기";

    studioSheetClose.setAttribute("aria-label", label);

    studioSheetClose.title = label;

  }

  if (studioSheetName) {

    const name =
      studioSheetNameText();

    if (studioSheetName.textContent !== name.text) {
      studioSheetName.textContent = name.text;
    }

    studioSheetName.classList.toggle("is-hint", name.hint);

  }

  /* 머리 줄의 버튼 수가 바뀌었을 수 있다 — Quick Bar 가 몇 칸을
     직접 둘지 다시 잰다 */
  if (typeof window.layoutStudioInspectorQuickBar === "function") {
    window.layoutStudioInspectorQuickBar();
  }

}


/* 스크린리더 — "SELECT · 내용 보기" */
function announceStudioSheetState() {

  if (!studioSheetStatus || !studioSheetNarrow()) {
    return;
  }

  const title =
    studioSheetTitle ? studioSheetTitle.textContent.trim() : "";

  studioSheetStatus.textContent =
    `${title} · ${STUDIO_SHEET_STATE_NAMES[studioSheetState]}`;

}


/* =========================================================
   setStudioSheetState(state, options)

   options.reveal  false 면 Preview 를 움직이지 않는다(기본은 시트가
                   커질 때 고른 요소가 덮이면 조금 올린다).
========================================================== */

function setStudioSheetState(next, options) {

  if (STUDIO_SHEET_STATES.indexOf(next) === -1) {
    return;
  }

  const opts =
    options || {};

  const previous =
    studioSheetState;

  const active =
    document.activeElement;

  const focusInBody =
    !!(studioSheetBody && active && studioSheetBody.contains(active));

  const focusOnUp =
    active === studioSheetUp;

  const focusOnDown =
    active === studioSheetDown;

  studioSheetState =
    next;

  syncStudioSheet();

  if (previous !== next) {

    /* 포커스가 사라지는 자리에 남지 않게 */
    if (next === "peek" && (focusInBody || focusOnDown) && studioSheetUp) {
      studioSheetUp.focus();
    } else if (next === "full" && focusOnUp && studioSheetDown) {
      studioSheetDown.focus();
    }

    if (typeof window.setStudioInspectorQuickMenuOpen === "function") {
      window.setStudioInspectorQuickMenuOpen(false);
    }

    announceStudioSheetState();

  }

  publishStudioSheetInset({ reveal: opts.reveal !== false });

}


function stepStudioSheet(direction) {

  const index =
    STUDIO_SHEET_STATES.indexOf(studioSheetState);

  const next =
    STUDIO_SHEET_STATES[Math.max(0, Math.min(STUDIO_SHEET_STATES.length - 1, index + direction))];

  setStudioSheetState(next, { reveal: direction > 0 });

}



/* =========================================================
   높이 — CSS 가 읽는 값(위 경계 · 키보드 · 내용 보기 최대)을 적고,
   시트가 덮는 높이를 Preview 에 알린다
========================================================== */

function studioSheetTopLimit() {

  if (!studioSheetShell) {
    return 0;
  }

  const shellTop =
    studioSheetShell.getBoundingClientRect().top;

  let top =
    0;

  /* 상단 도구 모음이 내려와 있으면 그 아래부터(접어 올리면 맨 위부터) */
  if (
    studioSheetTopDock &&
    (!studioSheetTopDockZone || studioSheetTopDockZone.classList.contains("is-open"))
  ) {
    top = Math.max(0, studioSheetTopDock.getBoundingClientRect().bottom - shellTop);
  }

  /* 바 아래에 매달린 여닫기 탭(▴)도 도구 모음이다 — 시트 손잡이가 그
     밑에 깔리면 손잡이를 잡으려던 손이 바를 접는다. 바를 접어 올린
     뒤에도 탭은 맨 위에 남는다. */
  if (studioSheetTopDockHandle && studioSheetTopDockHandle.getClientRects().length > 0) {
    top = Math.max(top, studioSheetTopDockHandle.getBoundingClientRect().bottom - shellTop);
  }

  return Math.round(Math.max(top, studioSheetVisualTop));

}


/* visualViewport — 키보드가 가린 아래 높이 · 브라우저가 화면을 밀어
   올린 위 높이(iOS). 확대(pinch) 중에는 재지 않는다. */
let studioSheetKeyboard = 0;

let studioSheetVisualTop = 0;


function syncStudioSheetViewport() {

  const vv =
    window.visualViewport;

  let keyboard =
    0;

  let top =
    0;

  if (vv && Math.abs((vv.scale || 1) - 1) < 0.01) {

    keyboard =
      Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));

    top =
      Math.max(0, Math.round(vv.offsetTop));

  }

  studioSheetKeyboard = keyboard;
  studioSheetVisualTop = top;

  if (studioSheetShell) {

    studioSheetShell.style.setProperty("--studio-sheet-keyboard", `${keyboard}px`);

    /* 키보드가 열려 있다 — 안전 영역 여백은 키보드가 대신 덮는다 */
    studioSheetShell.classList.toggle("is-keyboard-open", keyboard >= 120);

  }

  scheduleStudioSheetPublish();

}


function publishStudioSheetLimits() {

  if (!studioSheetShell) {
    return;
  }

  const height =
    studioSheetShell.clientHeight;

  const top =
    studioSheetTopLimit();

  const room =
    Math.max(0, height - top - studioSheetKeyboard);

  studioSheetShell.style.setProperty("--studio-sheet-top", `${top}px`);

  studioSheetShell.style.setProperty(
    "--studio-sheet-content-max",
    `${Math.round(Math.max(120, Math.min(height * STUDIO_SHEET_CONTENT_RATIO, room - 56)))}px`
  );

}


function measureStudioSheetCover() {

  if (!studioSheetIsActive() || !studioSheetShell) {
    return 0;
  }

  /* offsetTop 은 transform(열고 닫는 미끄럼)을 보지 않는다 — 열리는
     중에도 **자리 잡은 뒤의** 높이다. */
  return Math.max(
    0,
    Math.round(studioSheetShell.clientHeight - studioSheetPanel.offsetTop)
  );

}


function studioSheetFrameGeometry() {

  if (!studioSheetFrame) {
    return null;
  }

  const box =
    studioSheetFrame.getBoundingClientRect();

  if (box.width <= 0 || box.height <= 0) {
    return null;
  }

  const layoutWidth =
    studioSheetFrame.offsetWidth || box.width;

  const style =
    window.getComputedStyle(studioSheetFrame);

  return {
    box,
    scale: box.width / layoutWidth || 1,
    borderTop: parseFloat(style.borderTopWidth) || 0
  };

}


function studioSheetFrameReady() {

  return typeof previewFrameReady === "undefined" || previewFrameReady === true;

}


function publishStudioSheetInset(options) {

  const opts =
    options || {};

  publishStudioSheetLimits();

  const cover =
    measureStudioSheetCover();

  studioSheetCover =
    cover;

  if (studioSheetShell) {
    studioSheetShell.style.setProperty("--studio-mobile-sheet-height", `${cover}px`);
  }

  if (studioSheetState === "content" && cover > 0 && !studioSheetDrag) {
    studioSheetContentHeight = studioSheetPanel.offsetHeight;
  }

  /* 시트가 Preview 프레임의 아래를 얼마나 덮는가 — 프레임 px 로 */
  let inset =
    0;

  const geometry =
    cover > 0 ? studioSheetFrameGeometry() : null;

  if (geometry && studioSheetShell) {

    const sheetTop =
      studioSheetShell.getBoundingClientRect().bottom - cover;

    inset =
      Math.max(0, Math.ceil((geometry.box.bottom - sheetTop) / geometry.scale));

  }

  const grew =
    inset > studioSheetInsetSent + 1;

  if ((inset !== studioSheetInsetSent || opts.force) && studioSheetFrameReady()) {

    studioSheetInsetSent =
      inset;

    if (typeof postToPreviewFrameIfReady === "function") {
      postToPreviewFrameIfReady({ type: "preview:viewport-inset", bottom: inset });
    }

  }

  if (grew && opts.reveal !== false) {
    ensureSelectedElementVisibleAboveSheet();
  }

}


function scheduleStudioSheetPublish() {

  if (studioSheetPublishFrame) {
    return;
  }

  studioSheetPublishFrame =
    window.requestAnimationFrame(() => {
      studioSheetPublishFrame = 0;
      publishStudioSheetInset();
    });

}


/* Preview 문서가 (다시) 준비됐다 — 지금 값을 한 번 더 알린다 */
function republishStudioSheetInset() {

  /* 넓은 화면 · 시트가 닫힌 채면 보낼 것이 없다(새 문서는 여유 0 으로 시작) */
  publishStudioSheetInset({ force: measureStudioSheetCover() > 0, reveal: false });

}



/* =========================================================
   ensureSelectedElementVisibleAboveSheet()

   고른 요소가 시트(또는 상단 바)에 덮였으면 **Preview 문서만** 필요한
   만큼 스크롤한다. 이미 보이면 아무것도 하지 않는다 — 가운데로
   맞추지 않는다. 요소가 보이는 띠보다 크면 윗부분이 보이게 하고, 이미
   48px 이상 보이면 그대로 둔다.

   Preview 문서 밖의 것(스킨 좌표 · 저장된 값 · 공개 화면)은 바꾸지
   않는다. 요소를 **끌고 있는 중**에는 움직이지 않는다.
========================================================== */

function ensureSelectedElementVisibleAboveSheet() {

  if (!studioSheetIsActive() || studioSheetState === "full" || studioSheetDrag) {
    return false;
  }

  if (typeof studioInspectorLayoutDrag !== "undefined" && studioInspectorLayoutDrag) {
    return false;
  }

  const selection =
    typeof studioInspectorSelection !== "undefined" ? studioInspectorSelection : null;

  const rect =
    selection && (selection.visibleRect || selection.rect);

  const geometry =
    studioSheetFrameGeometry();

  if (!rect || !geometry || !studioSheetShell) {
    return false;
  }

  const debt =
    studioSheetScrollDebt.ref === selection.rect ? studioSheetScrollDebt.dy : 0;

  const top =
    rect.top - debt;

  const bottom =
    rect.top + rect.height - debt;

  const cover =
    measureStudioSheetCover();

  const sheetTop =
    studioSheetShell.getBoundingClientRect().bottom - cover;

  const topBound =
    typeof studioInspectorLabelTopBound === "function"
      ? studioInspectorLabelTopBound(geometry.box)
      : geometry.box.top;

  const toFrame = (y) =>
    (y - geometry.box.top) / geometry.scale - geometry.borderTop;

  const bandTop =
    toFrame(Math.max(topBound, geometry.box.top)) + STUDIO_SHEET_REVEAL_MARGIN;

  const bandBottom =
    toFrame(Math.min(geometry.box.bottom, sheetTop)) - STUDIO_SHEET_REVEAL_MARGIN;

  if (bandBottom - bandTop < 24) {
    return false;
  }

  let dy =
    0;

  if (bottom - top > bandBottom - bandTop) {

    const visible =
      Math.min(bottom, bandBottom) - Math.max(top, bandTop);

    if (visible >= 48) {
      return false;
    }

    dy = top - bandTop;

  } else if (bottom > bandBottom) {

    dy = bottom - bandBottom;

  } else if (top < bandTop) {

    dy = top - bandTop;

  }

  dy = Math.round(dy);

  if (Math.abs(dy) < 1 || typeof postToPreviewFrameIfReady !== "function") {
    return false;
  }

  postToPreviewFrameIfReady({ type: "preview:scroll-by", top: dy });

  studioSheetScrollDebt = { ref: selection.rect, dy: debt + dy };

  return true;

}



/* =========================================================
   버튼 — 제스처 없이 모든 단계로
========================================================== */

studioSheetUp?.addEventListener("click", () => stepStudioSheet(1));

studioSheetDown?.addEventListener("click", () => stepStudioSheet(-1));

/* 접힘에서 요소 이름을 누르면 내용 보기 */
studioSheetName?.addEventListener("click", () => {

  if (studioSheetIsActive() && studioSheetState === "peek") {
    setStudioSheetState("content");
  }

});



/* =========================================================
   Escape — 전체 → 내용 → 접힘. 접힘의 Escape 는 예전 규칙 그대로
   (Select 는 선택 해제, Images · Dock 은 그 내용 닫기).

   먼저 받는 것들이 있다 — 시트 밖 입력칸(AI · 코드 편집기) · Select 글자
   칸의 적용 전 초안(그 입력 취소) · 겹친 요소 메뉴 · 상단 ··· 메뉴 ·
   끌기/자르기 중 · dialog. 그때는 손대지 않는다.
========================================================== */

function consumeStudioSheetEscape() {

  if (!studioSheetIsActive()) {
    return false;
  }

  if (
    typeof window.isStudioInspectorQuickMenuOpen === "function" &&
    window.isStudioInspectorQuickMenuOpen()
  ) {
    window.setStudioInspectorQuickMenuOpen(false);
    return true;
  }

  if (studioSheetState === "full") {
    setStudioSheetState("content", { reveal: false });
    return true;
  }

  if (studioSheetState === "content") {
    setStudioSheetState("peek", { reveal: false });
    return true;
  }

  return false;

}


function studioSheetIsEditableTarget(target) {

  if (!target || target.nodeType !== 1) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag =
    target.tagName;

  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  if (tag === "INPUT") {
    return ["button", "checkbox", "radio", "range", "color", "file", "submit", "reset"]
      .indexOf((target.type || "").toLowerCase()) === -1;
  }

  return false;

}


window.addEventListener(
  "keydown",
  (event) => {

    if (event.key !== "Escape" || event.defaultPrevented || !studioSheetIsActive()) {
      return;
    }

    const target =
      event.target;

    if (target && target.closest && target.closest("dialog, [role='dialog']")) {
      return;
    }

    /* 입력칸 — 시트 밖(AI 입력 · 코드 편집기)은 그 자리의 몫이다. 시트
       안에서는 "고치던 글자 취소"(Select 글자 칸에 적용 전 초안이 있을
       때)가 먼저고, 그 밖에는 시트를 한 단계 내린다(값은 그대로 남는다). */
    if (studioSheetIsEditableTarget(target)) {

      if (!studioSheetPanel.contains(target)) {
        return;
      }

      if (typeof studioInspectorTextDraft !== "undefined" && studioInspectorTextDraft !== null) {
        return;
      }

    }

    if (
      (typeof isStudioInspectorPickMenuOpen === "function" && isStudioInspectorPickMenuOpen()) ||
      (typeof window.isStudioMoreMenuOpen === "function" && window.isStudioMoreMenuOpen()) ||
      (typeof studioInspectorDrag !== "undefined" && studioInspectorDrag) ||
      (typeof studioInspectorCropDraft !== "undefined" && studioInspectorCropDraft) ||
      (typeof studioInspectorLayoutDrag !== "undefined" && studioInspectorLayoutDrag)
    ) {
      return;
    }

    if (consumeStudioSheetEscape()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

  },
  true
);



/* =========================================================
   다른 곳에서 오는 알림
========================================================== */

/* Preview 안에서 글자를 고치기 시작했다 — 시트는 잠시 접힘으로.
   확정 · 취소하면 원래 단계로 돌아온다. */
function noteStudioSheetInlineText(phase) {

  if (phase === "begin") {

    if (studioSheetIsActive() && studioSheetState !== "peek") {

      studioSheetInlineTextReturn =
        studioSheetState;

      setStudioSheetState("peek", { reveal: false });

    }

    return;

  }

  if (phase !== "commit" && phase !== "cancel") {
    return;
  }

  const back =
    studioSheetInlineTextReturn;

  studioSheetInlineTextReturn =
    null;

  if (back && studioSheetIsActive() && studioSheetState === "peek") {
    setStudioSheetState(back);
  }

}


/* Preview 에서 요소를 옮기기 시작했다 — 접힘으로. 놓은 뒤 다시
   펼치지 않는다. */
function noteStudioSheetPreviewMove() {

  studioSheetInlineTextReturn =
    null;

  if (studioSheetIsActive() && studioSheetState !== "peek") {
    setStudioSheetState("peek", { reveal: false });
  }

}


/* Dock 적용 뒤에도 시트를 닫지 않는가 — 좁은 화면에서 그 내용을 보여
   주는 중일 때만(dock-panel.js handleDockPanelApply) */
function studioSheetKeepsContentAfterApply(mode) {

  return studioSheetNarrow() &&
    typeof isStudioLeftPanelShowing === "function" &&
    isStudioLeftPanelShowing(mode);

}


window.addEventListener("studio-left-panel-toggle", () => {

  syncStudioSheet();

  publishStudioSheetInset();

});


window.addEventListener("studio-inspector-selection", () => {

  syncStudioSheet();

  if (!(typeof studioInspectorSelection !== "undefined" && studioInspectorSelection)) {
    studioSheetInlineTextReturn = null;
  }

});


window.addEventListener("resize", () => {

  syncStudioSheet();

  scheduleStudioSheetPublish();

});


if (window.visualViewport) {

  window.visualViewport.addEventListener("resize", syncStudioSheetViewport);

  window.visualViewport.addEventListener("scroll", syncStudioSheetViewport);

}


if (typeof ResizeObserver === "function") {

  const observer =
    new ResizeObserver(scheduleStudioSheetPublish);

  [studioSheetPanel, studioSheetFrame, document.getElementById("studioPreviewStage"), studioSheetTopDock]
    .filter(Boolean)
    .forEach((element) => observer.observe(element));

}


/* 상단 도구 모음을 접고 펴면(transform 이라 크기 관찰로는 모른다) */
if (studioSheetTopDockZone && typeof MutationObserver === "function") {

  new MutationObserver(scheduleStudioSheetPublish).observe(
    studioSheetTopDockZone,
    { attributes: true, attributeFilter: ["class"] }
  );

  /* 미끄러지는 중간값이 아니라 다 움직인 뒤의 자리로 한 번 더 */
  studioSheetTopDockZone.addEventListener("transitionend", scheduleStudioSheetPublish);

}


if (typeof studioShellNarrowQuery !== "undefined" && studioShellNarrowQuery) {

  const handleSheetNarrowChange = () => {

    syncStudioSheet();

    publishStudioSheetInset({ reveal: false });

  };

  if (typeof studioShellNarrowQuery.addEventListener === "function") {
    studioShellNarrowQuery.addEventListener("change", handleSheetNarrowChange);
  } else if (typeof studioShellNarrowQuery.addListener === "function") {
    studioShellNarrowQuery.addListener(handleSheetNarrowChange);
  }

}


syncStudioSheetViewport();

syncStudioSheet();


if (typeof window !== "undefined") {

  window.getStudioSheetState = getStudioSheetState;
  window.setStudioSheetState = setStudioSheetState;
  window.syncStudioSheet = syncStudioSheet;
  window.ensureSelectedElementVisibleAboveSheet = ensureSelectedElementVisibleAboveSheet;
  window.republishStudioSheetInset = republishStudioSheetInset;
  window.consumeStudioSheetEscape = consumeStudioSheetEscape;
  window.noteStudioSheetInlineText = noteStudioSheetInlineText;
  window.noteStudioSheetPreviewMove = noteStudioSheetPreviewMove;
  window.studioSheetKeepsContentAfterApply = studioSheetKeepsContentAfterApply;

  /* 테스트용 읽기 창구 — production 코드는 읽지 않는다 */
  window.getStudioSheetMetrics =
    function () {
      return {
        state: studioSheetState,
        active: studioSheetIsActive(),
        cover: studioSheetCover,
        inset: studioSheetInsetSent,
        keyboard: studioSheetKeyboard,
        dragging: !!studioSheetDrag,
        height: studioSheetPanel ? studioSheetPanel.offsetHeight : 0
      };
    };

}
