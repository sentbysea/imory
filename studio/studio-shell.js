/* =========================================================
   SKIN STUDIO — SHELL (STUDIO-SHELL-1)

   기준 문서: IMORY_STUDIO_SHELL_DESIGN.md

   Studio 화면의 **정보 구조**만 담당한다. 기능은 전부 원래 파일에
   있고, 이 파일은 "어느 것을 어디에 보여 줄까"를 정한다.

     1) 왼쪽 패널 — Select · Images · Dock 이 같은 자리를 나눠 쓴다.
        어느 내용을 보여 줄지 · 여닫기 · 버튼 상태.
     2) ··· 메뉴 — 좁은 화면에서 Code · Import · Export 를 담는다.
        같은 버튼을 드롭다운 모양으로 보여 줄 뿐이다(복제하지 않는다).
     3) 현재 페이지 표시 — HOME / CATEGORY / POST …

   ★ Select 는 모드이면서 패널 내용이다
     Select 를 켜면 Inspector 모드가 켜지고(studio-inspector.js
     setStudioInspectorEnabled) 패널이 Select 내용을 보여 준다.
     Images/Dock 으로 옮겨 가도 **모드는 끄지 않는다** — 끄면 고른
     요소가 지워진다(clearStudioInspectorSelection). 그래서 Images/Dock
     을 보다가 Select 를 누르면 패널만 Select 로 돌아오고 그 요소가
     그대로 남는다. 그 밖의 경우(Select 를 보여 주는 중 · 패널이 접혀
     있음)에 Select 를 누르면 예전처럼 모드를 끈다 — Select 는 여전히
     토글이다. 접어 둔 Select 내용은 Preview 에서 요소를 누르면(같은
     요소여도) 다시 열린다.

   ★ 내용마다 떠날 때 하는 일이 다르다
     images  아무 상태도 들고 있지 않으므로 닫는다(다시 오면 목록을
             새로 읽는다 — 예전 modal 을 다시 열 때와 같다).
     dock    적용하지 않은 사본을 들고 있으므로 **숨기기만** 한다.
             다시 오면 그 사본 그대로다(그 사이 working draft 가
             바뀌었으면 dock-panel.js 가 새로 만든다).
     select  아무 일도 하지 않는다.

   ★ 내용이 스스로 닫히면(Images 닫기 · Dock 적용/취소/지우기 ·
     Escape) 그쪽이 handleStudioLeftPanelContentClosed(mode) 를 부른다.
     Select 모드가 켜져 있으면 패널은 Select 로 돌아가고(Images/Dock 은
     그 위에 잠시 얹힌 내용이다 — 고른 요소가 그대로 보인다), 꺼져
     있으면 접힌다.

   ★ 좁은 화면(720px 이하)에서는 왼쪽 패널(아래 시트)과 AI 패널
     (overlay)이 서로를 가린다 — 하나를 열면 다른 하나를 접는다.
     데스크톱에서는 둘 다 열 수 있다. AI 때문에 접힌 시트는 AI 를
     닫으면 그 내용 · 그 단계로 돌아온다(MOBILE-SHEET-1).

   ★ 좁은 화면의 시트는 세 단계다(MOBILE-SHEET-1, studio/studio-sheet.js)
     — 접힘(peek) · 내용 보기(content) · 전체 화면(full). 어느 단계로
     열지는 이 파일이 정한다: Select 는 접힘, Images · Dock 은 내용
     보기. 단계는 기록(Undo)에도 저장에도 들어가지 않는다.

   의존(호출 시점): studio-inspector.js(setStudioInspectorEnabled /
   getStudioInspectorState) · images-panel.js · dock-panel.js ·
   studio-ai-panel-layout.js(isStudioAiPanelOpen / setStudioAiPanelOpen).
========================================================== */

const studioShellRoot =
  document.getElementById("studioPreviewShell");

const studioShellLeftPanel =
  document.getElementById("studioLeftPanel");

const studioShellLeftPanelTitle =
  document.getElementById("studioLeftPanelTitle");

const studioShellLeftPanelCollapse =
  document.getElementById("studioLeftPanelCollapse");

const studioShellSelectEmpty =
  document.getElementById("studioLeftPanelSelectEmpty");

const studioShellTopDock =
  document.getElementById("studioTopDock");

const studioShellMoreButton =
  document.getElementById("studioMoreButton");

const studioShellFileMenu =
  document.getElementById("studioTopDockFiles");

const studioShellPageIndicator =
  document.getElementById("studioPageIndicator");


const STUDIO_LEFT_PANEL_MODES = {
  select: {
    title: "SELECT",
    section: document.getElementById("studioLeftPanelSelect"),
    button: document.getElementById("studioInspectorButton")
  },
  images: {
    title: "IMAGES",
    section: document.getElementById("studioLeftPanelImages"),
    button: document.getElementById("studioImagesButton")
  },
  dock: {
    title: "BOTTOM DOCK",
    section: document.getElementById("studioLeftPanelDock"),
    button: document.getElementById("studioDockButton")
  },

  /* HOME 단 구성(IMORY_SIDES_DESIGN.md §6). 버튼은 Dock 옆(좁은
     화면에서는 둘째 줄)이다. 들고 있는 상태가 없다 — 고르는 순간
     적용되므로 떠날 때 할 일이 없다. */
  layout: {
    title: "HOME LAYOUT",
    section: document.getElementById("studioLeftPanelLayout"),
    button: document.getElementById("studioLayoutButton")
  }
};


/* studio-shell.css 의 좁은 화면 기준과 같은 값 */
const studioShellNarrowQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 720px)")
    : null;


let studioLeftPanelMode = "select";

let studioLeftPanelOpen = false;

/* 내용이 지금 살아 있는가(열어 둔 채 숨었을 뿐인가). AI 때문에 잠시
   접었다가 돌아올 때 Images 를 새로 읽지 않기 위해서다 — 새로 읽으면
   고른 슬롯과 목록 스크롤이 처음으로 돌아간다. */
const studioLeftPanelContentAlive = {
  select: true,
  images: false,
  dock: false,
  layout: false
};

/* 좁은 화면에서 AI 를 열며 접어 둔 시트 — AI 를 닫으면 되돌린다 */
let studioLeftPanelHiddenForAi = null;

/* Select 의 "이미지 변경"으로 Images 를 열었다 — 좁은 화면에서는 사진을
   붙이면 고른 요소로 돌아간다 */
let studioLeftPanelImagesReturnToSelect = false;


function studioShellSheetState() {

  return typeof window.getStudioSheetState === "function"
    ? window.getStudioSheetState()
    : null;

}


function setStudioShellSheetState(state, options) {

  if (typeof window.setStudioSheetState === "function") {
    window.setStudioSheetState(state, options);
  }

}


function studioShellIsNarrow() {

  return !!(studioShellNarrowQuery && studioShellNarrowQuery.matches);

}


function studioShellInspectorEnabled() {

  return typeof window.getStudioInspectorState === "function" &&
    window.getStudioInspectorState().enabled === true;

}


function isStudioLeftPanelShowing(mode) {

  return studioLeftPanelOpen && studioLeftPanelMode === mode;

}


/* =========================================================
   왼쪽 패널 — 화면에 적기
========================================================== */

function syncStudioLeftPanelSelectHint() {

  if (!studioShellSelectEmpty) {
    return;
  }

  studioShellSelectEmpty.textContent =
    studioShellInspectorEnabled()
      ? "Preview에서 고칠 요소를 누르세요."
      : "위의 Select를 켜면 Preview에서 요소를 골라 고칠 수 있어요.";

}


function syncStudioLeftPanel() {

  Object.keys(STUDIO_LEFT_PANEL_MODES).forEach((mode) => {

    const entry =
      STUDIO_LEFT_PANEL_MODES[mode];

    if (entry.section) {
      entry.section.hidden = mode !== studioLeftPanelMode;
    }

    if (entry.button) {
      entry.button.setAttribute(
        "aria-expanded",
        String(isStudioLeftPanelShowing(mode))
      );
    }

  });

  if (studioShellLeftPanel) {

    studioShellLeftPanel.classList.toggle("is-open", studioLeftPanelOpen);

    studioShellLeftPanel.dataset.mode = studioLeftPanelMode;

  }

  if (studioShellRoot) {
    studioShellRoot.classList.toggle("has-left-panel", studioLeftPanelOpen);
  }

  if (studioShellLeftPanelTitle) {
    studioShellLeftPanelTitle.textContent =
      STUDIO_LEFT_PANEL_MODES[studioLeftPanelMode].title;
  }

  if (studioShellLeftPanelCollapse) {
    studioShellLeftPanelCollapse.setAttribute(
      "aria-expanded",
      String(studioLeftPanelOpen)
    );
  }

  syncStudioLeftPanelSelectHint();

  /* 시트 머리(이름 · 단계 버튼)도 같은 순간에 맞춘다 */
  if (typeof window.syncStudioSheet === "function") {
    window.syncStudioSheet();
  }

}


/* =========================================================
   왼쪽 패널 — 여닫기와 내용 바꾸기
========================================================== */

function setStudioLeftPanelOpen(open) {

  const next =
    !!open;

  if (next === studioLeftPanelOpen) {
    syncStudioLeftPanel();
    return;
  }

  studioLeftPanelOpen =
    next;

  /* 좁은 화면에서는 AI overlay 와 번갈아 연다 */
  if (
    next &&
    studioShellIsNarrow() &&
    typeof window.isStudioAiPanelOpen === "function" &&
    window.isStudioAiPanelOpen()
  ) {
    window.setStudioAiPanelOpen(false);
  }

  syncStudioLeftPanel();

  window.dispatchEvent(
    new CustomEvent(
      "studio-left-panel-toggle",
      { detail: { open: next, mode: studioLeftPanelMode } }
    )
  );

}


function enterStudioLeftPanelContent(mode) {

  if (mode === "images" && typeof window.openSkinImagesPanel === "function") {
    window.openSkinImagesPanel();
  }

  if (mode === "dock" && typeof window.openSkinDockPanel === "function") {
    window.openSkinDockPanel();
  }

  if (mode === "layout" && typeof window.openSkinSidesPanel === "function") {
    window.openSkinSidesPanel();
  }

  studioLeftPanelContentAlive[mode] = true;

}


function leaveStudioLeftPanelContent(mode) {

  /* Dock 은 숨기기만 한다 — 적용하지 않은 사본을 지키기 위해서다
     (파일 머리말). */
  if (mode === "images") {

    studioLeftPanelContentAlive.images = false;

    studioLeftPanelImagesReturnToSelect = false;

    if (typeof window.closeSkinImagesPanel === "function") {
      window.closeSkinImagesPanel();
    }

  }

}


/* options (전부 선택)
     sheet           좁은 화면의 시트 단계 — 없으면 새로 보여 줄 때만
                     기본값(Select 는 peek, Images · Dock 은 content)
     resume          숨겨 두었던 같은 내용을 다시 보여 준다(살아 있으면
                     새로 열지 않는다 — AI 에서 돌아올 때)
     returnToSelect  Images 를 Select 의 "이미지 변경"에서 열었다 */
function showStudioLeftPanelMode(mode, options) {

  if (!STUDIO_LEFT_PANEL_MODES[mode]) {
    return;
  }

  const opts =
    options || {};

  const previous =
    studioLeftPanelMode;

  const wasShowing =
    studioLeftPanelOpen;

  studioLeftPanelMode =
    mode;

  if (previous !== mode) {
    leaveStudioLeftPanelContent(previous);
  }

  const fresh =
    previous !== mode || !wasShowing;

  /* 단계를 먼저 정하고 연다 — 여는 순간의 높이가 곧 Preview 에 알릴
     높이다(내용 보기로 그렸다가 접힘으로 줄어드는 깜박임이 없다). */
  if (opts.sheet) {
    setStudioShellSheetState(opts.sheet, { reveal: false });
  } else if (fresh) {
    setStudioShellSheetState(mode === "select" ? "peek" : "content", { reveal: false });
  }

  if (mode === "images" && fresh) {
    studioLeftPanelImagesReturnToSelect =
      opts.returnToSelect === true ||
      (opts.resume === true && studioLeftPanelImagesReturnToSelect);
  }

  setStudioLeftPanelOpen(true);

  if (fresh && !(opts.resume === true && studioLeftPanelContentAlive[mode])) {
    enterStudioLeftPanelContent(mode);
  }

}


/* 포커스가 사라지는 시트 안에 남지 않게 — 그 내용을 여는 상단 버튼으로 */
function moveStudioLeftPanelFocusOut() {

  if (
    !studioShellLeftPanel ||
    !studioShellLeftPanel.contains(document.activeElement)
  ) {
    return;
  }

  const button =
    STUDIO_LEFT_PANEL_MODES[studioLeftPanelMode].button;

  if (button && typeof button.focus === "function") {
    button.focus();
  }

}


function collapseStudioLeftPanel() {

  if (!studioLeftPanelOpen) {
    return;
  }

  moveStudioLeftPanelFocusOut();

  setStudioLeftPanelOpen(false);

  leaveStudioLeftPanelContent(studioLeftPanelMode);

}


/* 내용이 스스로 닫혔다(Images 닫기 · Dock 적용/취소/지우기 · Escape).
   지금 그 내용을 보여 주고 있을 때만 움직인다 — 이 파일이 내용을
   바꾸면서 닫은 경우에는 이미 다른 내용이다. Select 모드가 켜져
   있으면 Select 로 돌아가고, 아니면 접는다. */
function handleStudioLeftPanelContentClosed(mode) {

  if (mode !== "select") {
    studioLeftPanelContentAlive[mode] = false;
  }

  if (!isStudioLeftPanelShowing(mode)) {
    return;
  }

  if (mode !== "select" && studioShellInspectorEnabled()) {
    showStudioLeftPanelMode("select");
    return;
  }

  moveStudioLeftPanelFocusOut();

  setStudioLeftPanelOpen(false);

}


/* Preview 에서 요소를 골랐다(studio-inspector.js
   setStudioInspectorSelection — 사용자의 클릭/탭에서만 온다).
   좁은 화면에서는 새로 고른 요소가 **접힘**으로 시작한다 — 시트가
   Preview 를 가리지 않게. 같은 요소를 다시 누른 것은 지금 단계
   그대로다. */
function revealStudioLeftPanelForSelection(options) {

  const sameElement =
    !!(options && options.sameElement);

  if (!isStudioLeftPanelShowing("select")) {
    showStudioLeftPanelMode("select", { sheet: "peek" });
  } else if (!sameElement) {
    setStudioShellSheetState("peek", { reveal: false });
  }

  /* 고른 요소가 시트에 덮였으면 Preview 만 조금 올린다 */
  if (typeof window.ensureSelectedElementVisibleAboveSheet === "function") {
    window.ensureSelectedElementVisibleAboveSheet();
  }

}


/* Images 에서 사진을 슬롯에 붙였다(images-panel.js). 좁은 화면에서
   Select 의 "이미지 변경"으로 온 경우에만 고른 요소로 돌아간다 —
   넓은 화면에서는 패널이 Preview 를 가리지 않으므로 그대로 둔다. */
function handleStudioImageAttached() {

  if (
    !studioShellIsNarrow() ||
    !studioLeftPanelImagesReturnToSelect ||
    !isStudioLeftPanelShowing("images") ||
    !studioShellInspectorEnabled()
  ) {
    return;
  }

  showStudioLeftPanelMode("select", { sheet: "peek" });

}


/* =========================================================
   상단 버튼 셋
========================================================== */

function handleStudioSelectButton() {

  const enabled =
    studioShellInspectorEnabled();

  const showingOther =
    isStudioLeftPanelShowing("images") ||
    isStudioLeftPanelShowing("dock") ||
    isStudioLeftPanelShowing("layout");

  if (enabled && !showingOther) {

    if (typeof window.setStudioInspectorEnabled === "function") {
      window.setStudioInspectorEnabled(false);
    }

    collapseStudioLeftPanel();

    return;

  }

  if (!enabled && typeof window.setStudioInspectorEnabled === "function") {
    window.setStudioInspectorEnabled(true);
  }

  showStudioLeftPanelMode("select");

}


function handleStudioPanelModeButton(mode) {

  if (isStudioLeftPanelShowing(mode)) {
    collapseStudioLeftPanel();
    return;
  }

  showStudioLeftPanelMode(mode);

}


STUDIO_LEFT_PANEL_MODES.select.button?.addEventListener(
  "click",
  handleStudioSelectButton
);

STUDIO_LEFT_PANEL_MODES.images.button?.addEventListener(
  "click",
  () => handleStudioPanelModeButton("images")
);

STUDIO_LEFT_PANEL_MODES.dock.button?.addEventListener(
  "click",
  () => handleStudioPanelModeButton("dock")
);

STUDIO_LEFT_PANEL_MODES.layout.button?.addEventListener(
  "click",
  () => handleStudioPanelModeButton("layout")
);

studioShellLeftPanelCollapse?.addEventListener(
  "click",
  collapseStudioLeftPanel
);


/* Select 모드가 켜지고 꺼질 때(다른 파일이 끈 경우 포함) 안내 문구 */
window.addEventListener(
  "studio-inspector-selection",
  syncStudioLeftPanelSelectHint
);


/* 좁은 화면 — AI 패널을 열면 아래 시트는 **숨긴다**(내용은 그대로
   둔다 — 고른 요소 · Images 목록 · Dock 사본). AI 를 닫았을 때 그
   사이 다른 시트를 열지 않았으면 같은 내용 · 같은 단계로 돌아온다. */
window.addEventListener(
  "studio-ai-panel-toggle",
  (event) => {

    const open =
      !!(event.detail && event.detail.open);

    if (open) {

      if (studioShellIsNarrow() && studioLeftPanelOpen) {

        studioLeftPanelHiddenForAi = {
          mode: studioLeftPanelMode,
          sheet: studioShellSheetState()
        };

        moveStudioLeftPanelFocusOut();

        setStudioLeftPanelOpen(false);

      }

      return;

    }

    const memo =
      studioLeftPanelHiddenForAi;

    studioLeftPanelHiddenForAi =
      null;

    if (
      !memo ||
      studioLeftPanelOpen ||
      !studioShellIsNarrow() ||
      (memo.mode === "select" && !studioShellInspectorEnabled())
    ) {
      return;
    }

    showStudioLeftPanelMode(memo.mode, { sheet: memo.sheet || undefined, resume: true });

  }
);



/* =========================================================
   ··· 메뉴 (좁은 화면)

   드롭다운은 #studioTopDockFiles 그 자체다 — 데스크톱에서 줄 안에
   있던 Code · Import|Export 를 CSS 가 세로 목록으로 바꿔 띄운다
   (studio-shell.css). 자리는 ··· 버튼 바로 아래 — 바가 몇 줄이든
   버튼 사각형에서 잰다.
========================================================== */

function positionStudioMoreMenu() {

  if (!studioShellTopDock || !studioShellMoreButton || !studioShellFileMenu) {
    return;
  }

  const bar =
    studioShellTopDock.getBoundingClientRect();

  const button =
    studioShellMoreButton.getBoundingClientRect();

  studioShellFileMenu.style.top =
    `${Math.round(button.bottom - bar.top + 4)}px`;

  studioShellFileMenu.style.right =
    `${Math.max(4, Math.round(bar.right - button.right))}px`;

}


function setStudioMoreMenuOpen(open) {

  if (!studioShellTopDock || !studioShellMoreButton) {
    return;
  }

  const next =
    !!open && studioShellIsNarrow();

  studioShellTopDock.classList.toggle("is-more-open", next);

  studioShellMoreButton.setAttribute("aria-expanded", String(next));

  if (next) {

    positionStudioMoreMenu();

  } else if (studioShellFileMenu) {

    studioShellFileMenu.style.removeProperty("top");
    studioShellFileMenu.style.removeProperty("right");

  }

}


function isStudioMoreMenuOpen() {

  return !!studioShellTopDock &&
    studioShellTopDock.classList.contains("is-more-open");

}


studioShellMoreButton?.addEventListener(
  "click",
  () => setStudioMoreMenuOpen(!isStudioMoreMenuOpen())
);


/* 메뉴 안 버튼을 누르면 그 버튼의 일(target 단계)이 먼저 끝나고
   여기(bubble)서 메뉴를 닫는다. */
studioShellFileMenu?.addEventListener(
  "click",
  (event) => {

    if (isStudioMoreMenuOpen() && event.target.closest("button")) {
      setStudioMoreMenuOpen(false);
    }

  }
);


document.addEventListener(
  "pointerdown",
  (event) => {

    if (!isStudioMoreMenuOpen()) {
      return;
    }

    if (
      studioShellFileMenu?.contains(event.target) ||
      studioShellMoreButton?.contains(event.target)
    ) {
      return;
    }

    setStudioMoreMenuOpen(false);

  }
);


/* Preview(iframe) 를 누르면 그 pointerdown 은 이 문서에 오지 않는다 —
   대신 포커스가 iframe 으로 넘어가며 이 창의 blur 가 온다. */
window.addEventListener(
  "blur",
  () => {

    if (isStudioMoreMenuOpen()) {
      setStudioMoreMenuOpen(false);
    }

  }
);


document.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Escape" && isStudioMoreMenuOpen()) {

      setStudioMoreMenuOpen(false);

      studioShellMoreButton?.focus();

    }

  }
);


if (studioShellNarrowQuery) {

  const handleNarrowChange = () => {

    setStudioMoreMenuOpen(false);

    /* 넓어지면서 두 패널이 다 열려 있어도 괜찮다(데스크톱은 나란히).
       좁아지면서 둘 다 열려 있으면 시트를 접는다. */
    if (
      studioShellIsNarrow() &&
      studioLeftPanelOpen &&
      typeof window.isStudioAiPanelOpen === "function" &&
      window.isStudioAiPanelOpen()
    ) {
      collapseStudioLeftPanel();
    }

  };

  if (typeof studioShellNarrowQuery.addEventListener === "function") {
    studioShellNarrowQuery.addEventListener("change", handleNarrowChange);
  } else if (typeof studioShellNarrowQuery.addListener === "function") {
    studioShellNarrowQuery.addListener(handleNarrowChange);
  }

}



/* =========================================================
   현재 페이지 표시

   studio-preview.js updateStudioCodeButtonState() 가 부른다 —
   preview-navigation.js 가 currentPreviewPageType 을 바꾸는 모든
   자리에서 그 함수를 빠짐없이 부르기 때문이다.
========================================================== */

const STUDIO_PAGE_LABELS = {
  home: "HOME",
  category: "CATEGORY",
  post: "POST",
  banner: "BANNER",
  folder: "FOLDER",
  highlights: "HIGHLIGHTS"
};


function updateStudioPageIndicator(pageType) {

  if (!studioShellPageIndicator) {
    return;
  }

  const key =
    typeof pageType === "string" && pageType ? pageType : "home";

  studioShellPageIndicator.textContent =
    STUDIO_PAGE_LABELS[key] || key.toUpperCase();

  studioShellPageIndicator.dataset.pageType =
    key;

}



syncStudioLeftPanel();

updateStudioPageIndicator(
  typeof currentPreviewPageType === "string" ? currentPreviewPageType : "home"
);


if (typeof window !== "undefined") {

  window.showStudioLeftPanelMode = showStudioLeftPanelMode;
  window.collapseStudioLeftPanel = collapseStudioLeftPanel;
  window.isStudioLeftPanelShowing = isStudioLeftPanelShowing;
  window.handleStudioLeftPanelContentClosed = handleStudioLeftPanelContentClosed;
  window.revealStudioLeftPanelForSelection = revealStudioLeftPanelForSelection;
  window.handleStudioImageAttached = handleStudioImageAttached;
  window.updateStudioPageIndicator = updateStudioPageIndicator;
  window.setStudioMoreMenuOpen = setStudioMoreMenuOpen;
  window.isStudioMoreMenuOpen = isStudioMoreMenuOpen;

  /* 테스트용 읽기 창구 — production 코드는 읽지 않는다 */
  window.getStudioShellState =
    function () {
      return {
        leftPanelOpen: studioLeftPanelOpen,
        leftPanelMode: studioLeftPanelMode,
        moreMenuOpen: isStudioMoreMenuOpen(),
        narrow: studioShellIsNarrow(),
        sheetState: studioShellSheetState()
      };
    };

}
