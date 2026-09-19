/* =========================================================
   SKIN STUDIO — 처음 쓰는 사람을 위한 세 걸음 안내 (DIRECT-UX-1 §15)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §15

     1. 화면에서 바꾸고 싶은 것을 눌러 보세요.            (Preview)
     2. 끌어서 옮기고 모서리를 잡아 크기를 바꿀 수 있어요.  (Preview)
     3. 큰 변화는 AI Assistant에게 말해 주세요.            (AI 버튼)

   ★ 막지 않는다
     말풍선 하나만 뜬다 — 화면을 덮는 판도, 강제 진행도 없다. 말풍선
     밖의 Preview · Save · 패널은 그대로 눌린다. "건너뛰기"로 언제든
     끝낸다.

   ★ 한 번만
     끝내거나 건너뛰면 이 기기에 기록한다(localStorage — 설정 저장
     방식이 따로 없는 개인 편의라서다). 다시 보려면 좁은 화면은 상단 ···
     메뉴의 "사용법 다시 보기", 넓은 화면은 왼쪽 그룹(Select · Images ·
     Dock 옆)의 ?.

   ★ 자동 시작은 스킨을 처음 띄운 순간 한 번 — Select 버튼이 켜지는
     때(working draft 가 생긴 때)를 본다. 시험 문서
     (studio/studio-lifecycle-scenario.html)는 window.
     IMORY_STUDIO_COACH_AUTOSTART = false 로 자동 시작을 끈다 — 수십
     개의 e2e 가 말풍선을 피해 다니지 않게. "사용법 다시 보기"는 거기서도
     그대로 동작한다.
========================================================== */


const STUDIO_COACH_STORAGE_KEY = "imory.studio.coach.v1";

const STUDIO_COACH_STEPS = [
  {
    target: "studioPreviewStage",
    placement: "inside",
    text: "화면에서 바꾸고 싶은 것을 눌러 보세요."
  },
  {
    target: "studioPreviewStage",
    placement: "inside",
    text: "끌어서 옮기고 모서리를 잡아 크기를 바꿀 수 있어요."
  },
  {
    target: "studioAiToggleButton",
    placement: "below",
    text: "큰 변화는 AI Assistant에게 말해 주세요."
  }
];


let studioCoachBubble = null;

let studioCoachStep = -1;

let studioCoachAutoStarted = false;


function studioCoachDone() {

  try {
    return window.localStorage.getItem(STUDIO_COACH_STORAGE_KEY) === "done";
  } catch (err) {
    return false;
  }

}


function markStudioCoachDone() {

  try {
    window.localStorage.setItem(STUDIO_COACH_STORAGE_KEY, "done");
  } catch (err) {
    /* 저장이 막힌 브라우저 — 이번 세션만 닫힌다 */
  }

}


function ensureStudioCoachBubble() {

  if (studioCoachBubble) {
    return studioCoachBubble;
  }

  studioCoachBubble =
    document.createElement("div");

  studioCoachBubble.className =
    "studio-coach";

  studioCoachBubble.id =
    "studioCoach";

  studioCoachBubble.setAttribute("role", "dialog");

  studioCoachBubble.setAttribute("aria-modal", "false");

  studioCoachBubble.setAttribute("aria-labelledby", "studioCoachText");

  studioCoachBubble.hidden =
    true;

  studioCoachBubble.innerHTML =
    '<p class="studio-coach-step" id="studioCoachStep"></p>' +
    '<p class="studio-coach-text" id="studioCoachText"></p>' +
    '<div class="studio-coach-actions">' +
    '<button type="button" class="studio-coach-skip" id="studioCoachSkip">건너뛰기</button>' +
    '<button type="button" class="studio-coach-next" id="studioCoachNext">다음</button>' +
    "</div>";

  studioCoachBubble
    .querySelector("#studioCoachSkip")
    .addEventListener("click", () => finishStudioCoach());

  studioCoachBubble
    .querySelector("#studioCoachNext")
    .addEventListener("click", () => {

      if (studioCoachStep >= STUDIO_COACH_STEPS.length - 1) {
        finishStudioCoach();
      } else {
        showStudioCoachStep(studioCoachStep + 1);
      }

    });

  document.body.appendChild(studioCoachBubble);

  return studioCoachBubble;

}


function positionStudioCoach() {

  if (!studioCoachBubble || studioCoachBubble.hidden || studioCoachStep < 0) {
    return;
  }

  const step =
    STUDIO_COACH_STEPS[studioCoachStep];

  const target =
    document.getElementById(step.target);

  const bubble =
    studioCoachBubble;

  const width =
    bubble.offsetWidth || 260;

  const height =
    bubble.offsetHeight || 110;

  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;

  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight;

  let left = (viewportWidth - width) / 2;
  let top = 80;

  /* 말풍선 꼬리가 가리킬 x(뷰포트 좌표). 안쪽 배치면 꼬리가 없다. */
  let arrowX = null;

  bubble.dataset.placement = step.placement;

  if (target) {

    const rect =
      target.getBoundingClientRect();

    if (step.placement === "below") {

      arrowX = rect.left + rect.width / 2;

      left = arrowX - width / 2;
      top = rect.bottom + 10;

    } else {

      /* Preview 안쪽 위 가운데 — Top Dock 밑으로 내려 둔다 */
      const dock =
        document.getElementById("studioTopDock");

      const dockBottom =
        dock ? Math.max(0, dock.getBoundingClientRect().bottom) : 0;

      left = rect.left + rect.width / 2 - width / 2;
      top = Math.max(rect.top, dockBottom) + 16;

    }

  }

  left = Math.max(8, Math.min(left, viewportWidth - width - 8));
  top = Math.max(8, Math.min(top, viewportHeight - height - 8));

  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(top)}px`;

  if (arrowX === null) {
    bubble.style.removeProperty("--studio-coach-arrow-x");
  } else {
    bubble.style.setProperty(
      "--studio-coach-arrow-x",
      `${Math.round(Math.max(16, Math.min(width - 16, arrowX - left)))}px`
    );
  }

}


function showStudioCoachStep(index) {

  const bubble =
    ensureStudioCoachBubble();

  studioCoachStep =
    Math.max(0, Math.min(index, STUDIO_COACH_STEPS.length - 1));

  bubble.querySelector("#studioCoachStep").textContent =
    `${studioCoachStep + 1} / ${STUDIO_COACH_STEPS.length}`;

  bubble.querySelector("#studioCoachText").textContent =
    STUDIO_COACH_STEPS[studioCoachStep].text;

  bubble.querySelector("#studioCoachNext").textContent =
    studioCoachStep >= STUDIO_COACH_STEPS.length - 1 ? "시작하기" : "다음";

  bubble.hidden = false;

  positionStudioCoach();

  bubble.querySelector("#studioCoachNext").focus({ preventScroll: true });

}


function startStudioCoach() {
  showStudioCoachStep(0);
}


function finishStudioCoach() {

  markStudioCoachDone();

  studioCoachStep = -1;

  if (studioCoachBubble) {
    studioCoachBubble.hidden = true;
  }

}


function isStudioCoachOpen() {
  return !!studioCoachBubble && !studioCoachBubble.hidden;
}


/* =========================================================
   "사용법 다시 보기"
========================================================== */

/* 두 자리 — 좁은 화면의 ··· 메뉴(파일 버튼 줄이 그대로 드롭다운이
   된다)와 넓은 화면의 왼쪽 그룹. 오른쪽 그룹에는 자리가 없다(1280px
   에서 이미 거의 꽉 차 있고, 넘치면 가운데 그룹이 바 정중앙을 잃는다).
   보이는 것은 늘 하나다(studio-shell.css). */
function ensureStudioHelpButton() {

  const files =
    document.getElementById("studioTopDockFiles");

  if (files && !document.getElementById("studioHelpButton")) {

    const item =
      document.createElement("button");

    item.type = "button";
    item.className = "studio-corner-button studio-help-button studio-help-button--menu";
    item.id = "studioHelpButton";
    item.textContent = "사용법 다시 보기";

    item.addEventListener("click", startStudioCoach);

    files.appendChild(item);

  }

  const modes =
    document.querySelector(".studio-top-dock-modes");

  if (modes && modes.parentElement && !document.getElementById("studioHelpButtonWide")) {

    const wide =
      document.createElement("button");

    wide.type = "button";
    wide.className = "studio-corner-button studio-help-button studio-help-button--wide";
    wide.id = "studioHelpButtonWide";
    wide.title = "사용법 다시 보기";
    wide.setAttribute("aria-label", "사용법 다시 보기");
    wide.textContent = "?";

    wide.addEventListener("click", startStudioCoach);

    modes.parentElement.insertBefore(wide, modes.nextSibling);

  }

}


function maybeAutoStartStudioCoach() {

  if (
    studioCoachAutoStarted ||
    window.IMORY_STUDIO_COACH_AUTOSTART === false ||
    studioCoachDone()
  ) {
    return;
  }

  studioCoachAutoStarted = true;

  startStudioCoach();

}


ensureStudioHelpButton();


/* 스킨이 올라오면(Select 가 켜질 수 있게 되면) 한 번 */
(function watchStudioCoachReady() {

  const selectButton =
    document.getElementById("studioInspectorButton");

  if (!selectButton) {
    return;
  }

  if (!selectButton.disabled) {
    maybeAutoStartStudioCoach();
    return;
  }

  if (typeof MutationObserver !== "function") {
    return;
  }

  const observer =
    new MutationObserver(() => {

      if (!selectButton.disabled) {
        observer.disconnect();
        maybeAutoStartStudioCoach();
      }

    });

  observer.observe(selectButton, { attributes: true, attributeFilter: ["disabled"] });

}());


window.addEventListener("resize", positionStudioCoach);


document.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Escape" && isStudioCoachOpen()) {
      finishStudioCoach();
    }

  }
);


if (typeof window !== "undefined") {

  window.startStudioCoach = startStudioCoach;
  window.finishStudioCoach = finishStudioCoach;

  /* 테스트용 읽기 창구 */
  window.getStudioCoachState = function () {
    return {
      open: isStudioCoachOpen(),
      step: studioCoachStep,
      done: studioCoachDone()
    };
  };

}
