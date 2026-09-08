/* =========================================================
   SKIN STUDIO — AI PANEL LAYOUT (PHASE AI-5A / AI-5A.1)

   AI 패널의 **모양**만 담당한다: 여닫기와 폭 조절. 실제 AI
   요청/응답/되돌리기/참고 이미지는 studio/ai/studio-ai-panel.js가
   그대로 담당한다 — 이 파일은 그쪽 상태를 하나도 읽지 않고,
   반대쪽도 이 파일의 변수를 읽지 않는다. 둘 사이의 연결은
   window 이벤트 하나뿐이다:

     "studio-ai-panel-toggle"  { detail: { open } }

   ★ 왜 studio-preview.js에서 옮겨 왔나
   예전에는 하단 drawer의 handle 클릭 리스너가 studio-preview.js
   맨 아래에 있었다(Top Dock handle 바로 옆). 우측 사이드바가
   되면서 여닫기 말고도 폭 드래그와 좁은 화면 판정이 함께 붙는데,
   studio-preview.js는 이미 2500줄이 넘어 더 키우지 않는 편이
   낫다고 판단했다(CLAUDE.md의 "JS 파일은 가능하면 1000줄 내외"
   지침).

   ★ 폭의 원천은 CSS 변수 하나
   --studio-ai-panel-width를 #studioPreviewShell에 인라인으로
   써 넣으면 패널의 width와 #studioPreviewStage/#studioTopDockZone의
   right가 같은 값을 읽는다(studio.css) — 둘이 어긋날 수 없다.
   iframe이 실제로 좁아지므로 스킨 CSS의 @media도 그 폭으로
   재평가되고, Mobile 모드 축소 배율은 stage에 걸린
   ResizeObserver(studio-preview.js)가 알아서 다시 계산한다.

   ★ 폭은 저장하지 않는다
   드래그한 폭은 이 파일의 studioAiPanelWidth 변수에만 남는다 —
   Studio 문서는 admin iframe 안에서 계속 살아 있으므로 이것만으로
   "세션 동안 유지"가 성립한다. localStorage/sessionStorage에는
   쓰지 않는다(새 persistent state를 만들지 않는다는 이번 Phase의
   요구사항 4절).

   ★ 여닫는 곳은 두 버튼뿐 (PHASE AI-5A.1)
   Top Dock의 "AI Assistant"(#studioAiToggleButton)와 패널 헤더의
   접기 버튼(#studioAiPanelCollapse). 둘 다 아래 toggleStudioAiPanel()
   하나를 부르고, 열림 여부는 studioAiPanelOpen **한 변수**만이
   갖는다 — 두 버튼의 aria-expanded는 setStudioAiPanelOpen()이
   같은 자리에서 함께 갱신하므로 서로 어긋날 수 없다.

   AI-5A에는 "Preview를 클릭하면 접힌다"가 있었다(iframe이
   preview:surface-pointer를 올려보내는 방식). AI-5A.1에서 제거했다 —
   결과를 눌러 확인하면서 패널을 열어 둔 채 비교하는 흐름이 더
   중요하고, 그러려면 패널이 사용자가 누르지 않았는데 닫히면 안
   된다. 그 메시지는 이 용도로만 있었으므로 preview-bridge.js /
   studio-preview.js 양쪽에서 함께 지웠다.

   오른쪽 가장자리의 세로 탭도 함께 없앴다 — Preview 위에 떠 있는
   또 하나의 진입점이 되므로.
========================================================== */


const studioAiPanelShell =
  document.getElementById("studioPreviewShell");

const studioAiPanelDock =
  document.getElementById("studioAiDock");

const studioAiPanelElement =
  document.getElementById("studioAiDrawer");

/* Top Dock 안의 "AI Assistant" — 유일한 여는 곳(PHASE AI-5A.1) */
const studioAiPanelToggleButton =
  document.getElementById("studioAiToggleButton");

const studioAiPanelCollapseButton =
  document.getElementById("studioAiPanelCollapse");

const studioAiPanelResizer =
  document.getElementById("studioAiResizer");

const studioAiPanelInputElement =
  document.getElementById("studioAiDrawerInput");


/* =========================================================
   폭

   MIN/DEFAULT는 고정값, MAX는 뷰포트에 비례한다(창이 좁아지면
   최대 폭도 같이 줄어야 Preview가 사라지지 않는다). MAX가 MIN보다
   작아질 수 있는 아주 좁은 화면에서는 MIN이 이긴다 — 그 구간은
   studio.css의 좁은 화면 fallback(@media max-width:720px)이
   패널을 overlay로 바꿔 뷰포트를 넘지 않게 처리한다.
========================================================== */

const STUDIO_AI_PANEL_MIN_WIDTH = 300;

const STUDIO_AI_PANEL_DEFAULT_WIDTH = 380;

const STUDIO_AI_PANEL_MAX_WIDTH_RATIO = 0.5;


let studioAiPanelWidth =
  STUDIO_AI_PANEL_DEFAULT_WIDTH;


function studioAiPanelMaxWidth() {

  return Math.max(
    STUDIO_AI_PANEL_MIN_WIDTH,
    Math.round(window.innerWidth * STUDIO_AI_PANEL_MAX_WIDTH_RATIO)
  );

}


function clampStudioAiPanelWidth(width) {

  if (!Number.isFinite(width)) {
    return STUDIO_AI_PANEL_DEFAULT_WIDTH;
  }

  return Math.min(
    Math.max(Math.round(width), STUDIO_AI_PANEL_MIN_WIDTH),
    studioAiPanelMaxWidth()
  );

}


function applyStudioAiPanelWidth() {

  if (!studioAiPanelShell) {
    return;
  }

  studioAiPanelShell.style.setProperty(
    "--studio-ai-panel-width",
    studioAiPanelWidth + "px"
  );

}


function setStudioAiPanelWidth(width) {

  studioAiPanelWidth =
    clampStudioAiPanelWidth(width);

  applyStudioAiPanelWidth();

}


/* =========================================================
   열기 / 닫기

   .is-open은 패널 요소에(예전 drawer 시절과 같은 표식),
   .has-ai-panel은 shell에 붙는다 — 후자가 Preview/Top Dock을
   왼쪽으로 좁히는 스위치다. 둘은 항상 함께 토글한다.
========================================================== */

let studioAiPanelOpen =
  false;


function isStudioAiPanelOpen() {

  return studioAiPanelOpen;

}


function setStudioAiPanelOpen(open) {

  const next =
    !!open;

  if (next === studioAiPanelOpen) {
    return;
  }

  studioAiPanelOpen =
    next;

  if (studioAiPanelElement) {

    studioAiPanelElement.classList.toggle(
      "is-open",
      next
    );

  }

  if (studioAiPanelShell) {

    studioAiPanelShell.classList.toggle(
      "has-ai-panel",
      next
    );

  }

  /*
    두 진입점의 aria-expanded를 같은 자리에서 함께 갱신한다 —
    패널 헤더로 닫아도 Top Dock 버튼이 즉시 false가 된다.
  */
  if (studioAiPanelToggleButton) {

    studioAiPanelToggleButton.setAttribute(
      "aria-expanded",
      String(next)
    );

  }

  if (studioAiPanelCollapseButton) {

    studioAiPanelCollapseButton.setAttribute(
      "aria-expanded",
      String(next)
    );

  }

  /*
    접혀 있을 땐 시각적으로 사라진 textarea가 Tab 순서에 끼어들지
    않게 한다 — 열렸을 때만 포커스를 받을 수 있게(예전 drawer와
    동일한 처리).
  */
  if (studioAiPanelInputElement) {

    studioAiPanelInputElement.tabIndex =
      next
        ? 0
        : -1;

  }

  /*
    여는 경로는 둘 다 사용자가 직접 누른 것이므로 항상 입력칸까지
    포커스를 옮긴다 — 버튼을 누른 뒤 바로 타이핑할 수 있게.
  */
  if (next) {

    applyStudioAiPanelWidth();

    if (studioAiPanelInputElement) {
      studioAiPanelInputElement.focus();
    }

  }

  /*
    studio-ai-panel.js가 Send 버튼 상태/textarea 높이를 다시
    계산할 수 있게 알린다 — 그쪽이 이 파일의 변수를 직접 읽지
    않도록 이벤트 하나로만 연결한다.
  */
  window.dispatchEvent(
    new CustomEvent(
      "studio-ai-panel-toggle",
      { detail: { open: next } }
    )
  );

}


function toggleStudioAiPanel() {

  setStudioAiPanelOpen(!studioAiPanelOpen);

}


if (studioAiPanelToggleButton) {

  studioAiPanelToggleButton.addEventListener(
    "click",
    toggleStudioAiPanel
  );

}


if (studioAiPanelCollapseButton) {

  studioAiPanelCollapseButton.addEventListener(
    "click",
    toggleStudioAiPanel
  );

}


/* 폭 드래그 상태 */

let studioAiPanelResizing =
  false;

let studioAiPanelResizePointerId =
  null;


/* =========================================================
   폭 드래그 (VS Code식)

   pointer events + setPointerCapture — 포인터가 iframe 위로
   들어가도 이벤트가 계속 resizer로 온다(mousemove만 쓰면 iframe
   위에서 끊긴다). 드래그 중에는 body에 클래스를 붙여 문서 전체의
   텍스트 선택을 막는다.

   좁은 화면(overlay fallback)에서는 resizer 자체가 CSS로 숨겨져
   있으므로 이 경로가 시작되지 않는다.
========================================================== */

function beginStudioAiPanelResize(event) {

  if (!studioAiPanelOpen || event.button !== 0) {
    return;
  }

  studioAiPanelResizing =
    true;

  studioAiPanelResizePointerId =
    event.pointerId;

  studioAiPanelDock?.classList.add(
    "is-resizing"
  );

  document.body.classList.add(
    "studio-ai-resizing"
  );

  try {

    studioAiPanelResizer.setPointerCapture(
      event.pointerId
    );

  } catch (err) {

    /* 캡처를 못 얻어도 드래그 자체는 아래 move 리스너로 계속된다. */

  }

  /* 드래그 시작 시 텍스트 선택이 잡히지 않도록. */
  event.preventDefault();

}


function moveStudioAiPanelResize(event) {

  if (
    !studioAiPanelResizing ||
    event.pointerId !== studioAiPanelResizePointerId
  ) {
    return;
  }

  /* 패널은 오른쪽에 붙어 있으므로 폭 = 뷰포트 오른쪽 끝까지의 거리. */
  setStudioAiPanelWidth(
    window.innerWidth - event.clientX
  );

}


function endStudioAiPanelResize(event) {

  if (
    !studioAiPanelResizing ||
    (event && event.pointerId !== studioAiPanelResizePointerId)
  ) {
    return;
  }

  studioAiPanelResizing =
    false;

  studioAiPanelResizePointerId =
    null;

  studioAiPanelDock?.classList.remove(
    "is-resizing"
  );

  document.body.classList.remove(
    "studio-ai-resizing"
  );

}


if (studioAiPanelResizer) {

  studioAiPanelResizer.addEventListener(
    "pointerdown",
    beginStudioAiPanelResize
  );

  studioAiPanelResizer.addEventListener(
    "pointermove",
    moveStudioAiPanelResize
  );

  studioAiPanelResizer.addEventListener(
    "pointerup",
    endStudioAiPanelResize
  );

  studioAiPanelResizer.addEventListener(
    "pointercancel",
    endStudioAiPanelResize
  );

  /* 캡처를 못 얻은 경우의 보완 — 창 밖에서 손을 떼도 끝난다. */
  window.addEventListener(
    "pointerup",
    endStudioAiPanelResize
  );

}


/*
  창이 좁아지면 최대 폭도 같이 줄어든다 — 지금 폭이 새 상한을
  넘으면 즉시 줄인다(패널이 Preview를 다 먹지 않게).
*/
window.addEventListener(
  "resize",
  () => {

    if (studioAiPanelWidth > studioAiPanelMaxWidth()) {
      setStudioAiPanelWidth(studioAiPanelWidth);
    }

  }
);


applyStudioAiPanelWidth();


if (typeof window !== "undefined") {

  window.setStudioAiPanelOpen =
    setStudioAiPanelOpen;

  window.isStudioAiPanelOpen =
    isStudioAiPanelOpen;

  /*
    테스트(studio/studio-ai-panel-layout-e2e-test.mjs)가 내부
    변수를 들여다보지 않고도 상태를 확인할 수 있게 하는 읽기 전용
    창구. production 코드는 이 전역을 참조하지 않는다.
  */
  window.getStudioAiPanelLayoutState =
    function () {

      return {
        open: studioAiPanelOpen,
        width: studioAiPanelWidth,
        minWidth: STUDIO_AI_PANEL_MIN_WIDTH,
        maxWidth: studioAiPanelMaxWidth(),
        resizing: studioAiPanelResizing
      };

    };

}
