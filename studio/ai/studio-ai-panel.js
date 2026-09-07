/* =========================================================
   SKIN STUDIO — AI PANEL (PHASE AI-1 / AI-2)

   studio/index.html에 이미 있던 AI drawer shell(#studioAiDock /
   #studioAiDrawer / #studioAiDrawerInput / #studioAiDrawerSend)에
   실제 동작을 붙인다. 새 패널/새 UI를 따로 만들지 않는다 —
   drawer 안에 상태 한 줄(#studioAiDrawerStatus)과 되돌리기 버튼
   (#studioAiDrawerUndo)만 더한다.

   ★ 데이터 흐름 (이번 Phase의 전부)

     drawer 입력
       -> POST /api/skin-ai            (functions/api/skin-ai.js
                                        -> OpenAI Responses API)
       -> validateSkinPackageImport()  (skin/skin-package-import.js)
       -> applyAiSkinPackage()         (studio/studio-preview.js bridge)
            -> applyImportedSkinPackage()
       -> Preview 재렌더 / dirty=true / Save 활성
       -> 되돌리기(1단계)

   AI 전용 sanitize/CSS validator/protected-region 검사를 새로
   만들지 않는다. 서버가 돌려준 SkinPackage는 **반드시** 기존
   Import 검증 경로를 그대로 통과한 뒤에만 draft에 들어간다 —
   실패하면 draft/Preview/dirty 어느 것도 바뀌지 않는다.

   ★ Studio 내부 상태를 직접 만지지 않는다
   currentWorkingSkin/isStudioDirty 같은 변수를 이 파일에서 직접
   읽거나 쓰지 않는다. studio-preview.js가 노출한 두 함수만 쓴다:
     window.getStudioAiWorkingState({ includePackage })
     window.applyAiSkinPackage(skinPackage, options)
   읽기는 항상 깊은 복사본으로 나오고, 쓰기는 저 한 함수로만
   들어간다.

   ★ 늦은 응답 방어
   요청을 보내기 직전의 revision + mountToken을 캡처해 응답 적용
   시 함께 넘긴다. 그 사이 Code Apply / Import / Images 변경 /
   다른 skin load / remount가 있었다면 applyAiSkinPackage()가
   reason:"stale"로 거절하고, 이 파일은 toast만 띄운 채 아무 상태도
   건드리지 않는다. 판정 자체는 상태를 소유한 studio-preview.js가
   한다(그쪽 주석 참고).

   ★ 이번 Phase에서 하지 않는 것
   - 이미지 첨부(붙여넣기/파일 선택/thumbnail) — 다음 Phase
   - 여러 단계 undo — 1단계만
   - 자동 Save — 절대 없음(Save는 지금까지처럼 사용자가 누른다)

   classic script. studio-preview.js(showStudioToast /
   getStudioAiWorkingState / applyAiSkinPackage), skin-package-import.js
   (window.validateSkinPackageImport), core/lib/supabase-client.js
   (supabaseClient — access token 조회)보다 뒤에 로드되어야 한다.
   studio/index.html의 로드 순서 참고.
========================================================== */

const STUDIO_AI_ENDPOINT = "/api/skin-ai";

const STUDIO_AI_MAX_INSTRUCTION_LENGTH = 2000;

/* =========================================================
   요청 상한 시간 (PHASE AI-2)

   서버(functions/api/skin-ai.js)가 OpenAI 호출을 90초에서 끊는다.
   여기는 그보다 조금 길게 잡는다 — 먼저 끊기는 쪽이 서버여야
   "AI 응답이 너무 오래 걸려…"처럼 구체적인 문장이 사용자에게 가고,
   이 타이머는 서버 자체가 응답하지 못한 경우(Function이 죽거나
   네트워크가 끊긴 경우)의 마지막 방어선이 된다.

   이 타이머가 건 abort는 사용자가 누른 "중단"과 구분해야 한다 —
   중단은 조용히 상태를 지우지만 timeout은 오류로 보여야 하기
   때문이다. pending 객체의 timedOut 플래그로 구분한다.
========================================================== */
const STUDIO_AI_REQUEST_TIMEOUT_MS = 100 * 1000;


const studioAiPanelDrawer =
  document.getElementById("studioAiDrawer");

const studioAiPanelInput =
  document.getElementById("studioAiDrawerInput");

const studioAiPanelSendButton =
  document.getElementById("studioAiDrawerSend");

const studioAiPanelStatus =
  document.getElementById("studioAiDrawerStatus");

const studioAiPanelStatusText =
  document.getElementById("studioAiDrawerStatusText");

const studioAiPanelUndoButton =
  document.getElementById("studioAiDrawerUndo");

const studioAiPanelHandle =
  document.getElementById("studioAiHandle");


/* =========================================================
   상태

   single-flight — 진행 중인 요청은 항상 최대 하나다.
   studioAiPendingRequest가 null이 아니면 Send 버튼은 "중단"
   버튼으로 바뀐다(별도 Cancel UI를 만들지 않는다).

   studioAiUndoSnapshot은 "AI를 적용한 직후"에만 존재한다 —
   요청을 새로 보내거나, 되돌리기를 눌렀거나, 그 사이 다른
   변경이 있었으면 버린다(1단계 undo).
========================================================== */

let studioAiRequestSeq = 0;

let studioAiPendingRequest = null;

let studioAiUndoSnapshot = null;


/* =========================================================
   로딩 표시 (PHASE AI-2.1)

   실제 호출이 1분 가까이 걸릴 수 있어서 "고치는 중…" 한 줄로는
   멈춘 것과 구분되지 않는다. Preview를 덮는 overlay는 만들지 않고
   (요구사항 그대로) drawer 상태 줄 안에서만 강화한다:

     스킨을 수정하고 있어요…  ● ● ●  37초

   - 진행률(%)은 만들지 않는다 — 서버가 진행 정보를 주지 않으므로
     어떤 숫자를 그려도 가짜다. 경과시간은 실제로 측정된 값이라
     괜찮다.
   - textarea는 그대로 둔다(내용/포커스 유지). 로딩 화면으로
     바꾸지 않는다.
   - 중단은 기존 Send 버튼(■)이 그대로 담당한다.

   dots/경과시간 요소는 여기서 만들어 붙인다 — studio/index.html과
   studio/studio-lifecycle-scenario.html 두 문서에 같은 마크업을
   중복해 두지 않기 위해서다(둘 다 이 파일을 로드하므로 어느
   쪽에서도 동일하게 동작한다).

   접근성: 상태 줄은 aria-live="polite"다. 초 단위로 바뀌는
   텍스트를 그 안에 그냥 넣으면 스크린리더가 1초마다 다시 읽는다.
   그래서 낭독 대상인 #studioAiDrawerStatusText에는 고정 문장만
   두고, 점과 경과시간은 aria-hidden으로 감춘다.
========================================================== */

const STUDIO_AI_LOADING_TEXT = "스킨을 수정하고 있어요…";

let studioAiLoadingTimerId = null;

let studioAiLoadingStartedAt = 0;

let studioAiDotsElement = null;

let studioAiElapsedElement = null;


function ensureStudioAiLoadingElements() {

  if (studioAiDotsElement || !studioAiPanelStatus) {
    return;
  }

  const dots =
    document.createElement("span");

  dots.className =
    "studio-ai-drawer-dots";

  dots.setAttribute("aria-hidden", "true");

  dots.hidden =
    true;

  [0, 1, 2].forEach(() => {
    dots.appendChild(document.createElement("i"));
  });

  const elapsed =
    document.createElement("span");

  elapsed.className =
    "studio-ai-drawer-elapsed";

  elapsed.setAttribute("aria-hidden", "true");

  elapsed.hidden =
    true;

  /* 되돌리기 버튼보다 앞(=문장 바로 뒤)에 둔다. */
  studioAiPanelStatus.insertBefore(dots, studioAiPanelUndoButton);
  studioAiPanelStatus.insertBefore(elapsed, studioAiPanelUndoButton);

  studioAiDotsElement = dots;
  studioAiElapsedElement = elapsed;

}


function renderStudioAiElapsed() {

  if (!studioAiElapsedElement) {
    return;
  }

  const seconds =
    Math.floor((Date.now() - studioAiLoadingStartedAt) / 1000);

  /* 0초는 표시하지 않는다 — 눌리자마자 "0초"가 뜨는 게 더 어색하다. */
  if (seconds < 1) {

    studioAiElapsedElement.hidden = true;
    studioAiElapsedElement.textContent = "";

    return;

  }

  studioAiElapsedElement.hidden = false;
  studioAiElapsedElement.textContent = seconds + "초";

}


function startStudioAiLoading() {

  ensureStudioAiLoadingElements();

  stopStudioAiLoadingTimer();

  studioAiLoadingStartedAt =
    Date.now();

  if (studioAiDotsElement) {
    studioAiDotsElement.hidden = false;
  }

  renderStudioAiElapsed();

  studioAiLoadingTimerId =
    setInterval(renderStudioAiElapsed, 1000);

}


function stopStudioAiLoadingTimer() {

  if (studioAiLoadingTimerId !== null) {

    clearInterval(studioAiLoadingTimerId);

    studioAiLoadingTimerId = null;

  }

}


/* 성공/실패/중단/타임아웃 어느 경로로 끝나든 여기 한 곳으로 모인다
   (setStudioAiStatus가 로딩이 아닌 모든 호출에서 부른다). */
function stopStudioAiLoading() {

  stopStudioAiLoadingTimer();

  if (studioAiDotsElement) {
    studioAiDotsElement.hidden = true;
  }

  if (studioAiElapsedElement) {
    studioAiElapsedElement.hidden = true;
    studioAiElapsedElement.textContent = "";
  }

}


function isStudioAiRequestCurrent(seq) {

  return (
    !!studioAiPendingRequest &&
    studioAiPendingRequest.seq === seq
  );

}


function clearStudioAiPendingRequest() {

  studioAiPendingRequest =
    null;

  updateStudioAiSendButtonState();

}


/* =========================================================
   Send 버튼 상태

   활성 조건(요청 중이 아닐 때): working skin이 있고 + instruction이
   공백이 아님. 요청 중에는 항상 활성이되 역할이 "중단"으로 바뀐다.
========================================================== */

function updateStudioAiSendButtonState() {

  if (!studioAiPanelSendButton) {
    return;
  }

  if (studioAiPendingRequest) {

    studioAiPanelSendButton.disabled =
      false;

    studioAiPanelSendButton.textContent =
      "■";

    studioAiPanelSendButton.setAttribute(
      "aria-label",
      "중단"
    );

    studioAiPanelSendButton.classList.add(
      "studio-ai-drawer-send--stop"
    );

    return;

  }

  const working =
    (typeof window.getStudioAiWorkingState === "function")
      ? window.getStudioAiWorkingState()
      : { hasWorkingSkin: false };

  studioAiPanelSendButton.disabled =
    !working.hasWorkingSkin ||
    !studioAiPanelInput.value.trim();

  studioAiPanelSendButton.textContent =
    "↑";

  studioAiPanelSendButton.setAttribute(
    "aria-label",
    "전송"
  );

  studioAiPanelSendButton.classList.remove(
    "studio-ai-drawer-send--stop"
  );

}


/* =========================================================
   drawer 안 상태 한 줄

   Preview 전체를 덮는 loading overlay는 쓰지 않는다(요구사항 8절)
   — 이 한 줄이 로딩(문장 + 점 + 경과시간) / 결과 요약 / 실패를
   전부 담는다.
   오류 toast는 기존 showStudioToast()를 그대로 재사용한다.
========================================================== */

function setStudioAiStatus(text, options) {

  if (!studioAiPanelStatus || !studioAiPanelStatusText) {
    return;
  }

  const isError =
    !!(options && options.isError);

  const showUndo =
    !!(options && options.showUndo);

  const isLoading =
    !!(options && options.loading);

  /*
     로딩이 아닌 모든 호출은 곧 "요청이 끝났다"는 뜻이다 — 여기 한
     곳에서 타이머/애니메이션을 정리하므로 성공/실패/중단/타임아웃
     경로마다 따로 정리 코드를 두지 않는다.
  */
  if (!isLoading) {
    stopStudioAiLoading();
  }

  if (!text) {

    studioAiPanelStatus.hidden =
      true;

    studioAiPanelStatusText.textContent =
      "";

    studioAiPanelUndoButton.hidden =
      true;

    return;

  }

  studioAiPanelStatusText.textContent =
    text;

  studioAiPanelStatus.classList.toggle(
    "studio-ai-drawer-status--error",
    isError
  );

  studioAiPanelStatus.hidden =
    false;

  studioAiPanelUndoButton.hidden =
    !showUndo;

  if (isLoading) {
    startStudioAiLoading();
  }

}


/* =========================================================
   Supabase access token

   서버(functions/api/skin-ai.js)가 Authorization: Bearer 로 로그인
   여부를 확인한다. 여기서 별도 auth helper를 새로 만들지 않고
   이미 전역에 있는 supabaseClient를 그대로 쓴다. 세션을 읽지
   못하면 헤더 없이 보내고, 그 경우 서버가 401을 돌려주며 그
   메시지가 그대로 사용자에게 보인다.
========================================================== */

async function readStudioAiAccessToken() {

  try {

    if (
      typeof supabaseClient === "undefined" ||
      !supabaseClient ||
      !supabaseClient.auth ||
      typeof supabaseClient.auth.getSession !== "function"
    ) {
      return null;
    }

    const { data } =
      await supabaseClient.auth.getSession();

    return (
      (data && data.session && data.session.access_token) ||
      null
    );

  } catch (err) {

    return null;

  }

}


/* =========================================================
   전송

   1. 전송 직전의 working state(SkinPackage 깊은 복사본 + 슬롯
      연결 + dirty + revision + mountToken)를 스냅샷으로 잡는다.
      이 스냅샷 하나가 "요청 body"이자 "되돌리기 대상"이다.
   2. POST /api/skin-ai
   3. 응답의 skinPackage를 JSON 문자열로 만들어 기존 Import
      validator에 그대로 통과시킨다.
   4. 통과한 것만 applyAiSkinPackage()로 한 번에 반영한다.
========================================================== */

async function handleStudioAiSend() {

  /*
    요청 중에 다시 누르면 전송이 아니라 중단이다 — 중복 전송은
    이 분기에서 원천적으로 막힌다(single-flight).
  */
  if (studioAiPendingRequest) {

    studioAiPendingRequest.controller.abort();

    return;

  }

  const instruction =
    studioAiPanelInput.value.trim();

  if (!instruction) {
    return;
  }

  if (instruction.length > STUDIO_AI_MAX_INSTRUCTION_LENGTH) {

    showStudioToast(
      "요청은 " + STUDIO_AI_MAX_INSTRUCTION_LENGTH + "자까지 입력할 수 있습니다.",
      { isError: true }
    );

    return;

  }

  const working =
    window.getStudioAiWorkingState({ includePackage: true });

  if (!working.hasWorkingSkin) {

    showStudioToast(
      "아직 편집할 스킨이 없습니다.",
      { isError: true }
    );

    return;

  }

  const snapshot = {
    skinPackage: working.skinPackage,
    imageSlotBindings: working.imageSlotBindings,
    isDirty: working.isDirty,
    revision: working.revision,
    mountToken: working.mountToken,
    /* 되돌리기 시점에 "그 사이 Save가 있었는가"를 판정하기 위한 값 */
    draftVersionId: working.draftVersionId
  };

  studioAiRequestSeq += 1;

  const seq =
    studioAiRequestSeq;

  const controller =
    new AbortController();

  studioAiPendingRequest =
    { seq, controller, timedOut: false };

  const timeoutId =
    setTimeout(
      () => {

        if (!isStudioAiRequestCurrent(seq)) {
          return;
        }

        studioAiPendingRequest.timedOut =
          true;

        controller.abort();

      },
      STUDIO_AI_REQUEST_TIMEOUT_MS
    );

  /*
    새 요청을 보내는 순간 이전 AI 결과의 되돌리기는 사라진다
    (1단계 undo) — 되돌릴 수 없는 버튼을 남겨두지 않는다.
  */
  studioAiUndoSnapshot =
    null;

  setStudioAiStatus(STUDIO_AI_LOADING_TEXT, { loading: true });

  updateStudioAiSendButtonState();

  let payload;

  try {

    const accessToken =
      await readStudioAiAccessToken();

    const headers = {
      "content-type": "application/json"
    };

    if (accessToken) {
      headers.authorization = "Bearer " + accessToken;
    }

    const response =
      await fetch(
        STUDIO_AI_ENDPOINT,
        {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            instruction,
            skinPackage: snapshot.skinPackage
          })
        }
      );

    clearTimeout(timeoutId);

    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }

    if (!response.ok || !payload || payload.ok !== true) {

      throw new Error(
        (payload && payload.message) ||
        "AI 요청을 처리하지 못했습니다."
      );

    }

  } catch (err) {

    clearTimeout(timeoutId);

    if (!isStudioAiRequestCurrent(seq)) {
      return;
    }

    const timedOut =
      !!studioAiPendingRequest.timedOut;

    clearStudioAiPendingRequest();

    if (err && err.name === "AbortError" && !timedOut) {

      setStudioAiStatus("");

      return;

    }

    setStudioAiStatus(
      "고치지 못했습니다.",
      { isError: true }
    );

    showStudioToast(
      timedOut
        ? "AI 응답이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해주세요."
        : ((err && err.message) || "AI 요청을 처리하지 못했습니다."),
      { isError: true }
    );

    return;

  }

  if (!isStudioAiRequestCurrent(seq)) {
    return;
  }

  /*
    ★ 반드시 기존 Import 경로를 탄다 — 서버가 준 skinPackage를
    곧바로 draft에 넣지 않는다. 여기서 실패하면 draft/Preview/
    dirty 어느 것도 바뀌지 않는다.
  */
  const validated =
    await window.validateSkinPackageImport(
      JSON.stringify(payload.skinPackage)
    );

  if (!isStudioAiRequestCurrent(seq)) {
    return;
  }

  clearStudioAiPendingRequest();

  if (!validated.ok) {

    setStudioAiStatus(
      "고치지 못했습니다.",
      { isError: true }
    );

    showStudioToast(
      validated.message,
      { isError: true }
    );

    return;

  }

  const applied =
    window.applyAiSkinPackage(
      validated.skinPackage,
      {
        expectedRevision: snapshot.revision,
        expectedMountToken: snapshot.mountToken,
        dirty: true
      }
    );

  if (!applied.ok) {

    setStudioAiStatus("");

    showStudioToast(
      applied.reason === "stale"
        ? "그 사이 다른 변경이 있어 AI 결과를 적용하지 않았습니다."
        : "AI 결과를 적용하지 못했습니다.",
      { isError: true }
    );

    return;

  }

  studioAiUndoSnapshot = {
    skinPackage: snapshot.skinPackage,
    imageSlotBindings: snapshot.imageSlotBindings,
    isDirty: snapshot.isDirty,
    mountToken: snapshot.mountToken,
    draftVersionId: snapshot.draftVersionId,
    revisionAfterApply: applied.revision
  };

  studioAiPanelInput.value =
    "";

  setStudioAiStatus(
    payload.summary || "적용했습니다.",
    { showUndo: true }
  );

  updateStudioAiSendButtonState();

}


/* =========================================================
   되돌리기 (1단계)

   AI 적용 직전 스냅샷을 그대로 다시 적용한다 — SkinPackage,
   이미지 슬롯 연결, 그리고 **그때의 dirty 값**까지 복원한다
   (AI 전 dirty=false -> 적용 dirty=true -> Undo -> dirty=false).

   AI 적용 이후 사용자가 또 무언가 바꿨다면(revision 불일치)
   되돌리지 않는다 — 그 변경을 조용히 지우게 되기 때문이다.

   그 사이 Save가 있었다면 되돌리기 자체는 정상으로 진행하되 dirty는
   복원하지 않고 true로 둔다 — 저장된 draft가 이미 AI 결과로 옮겨져
   있어서, 되돌린 화면과 저장된 내용이 서로 다르기 때문이다. 판정은
   상태를 소유한 studio-preview.js의 applyAiSkinPackage()가 한다
   (expectedDraftVersionId, 그쪽 주석 참고).
========================================================== */

function handleStudioAiUndo() {

  const snapshot =
    studioAiUndoSnapshot;

  if (!snapshot) {
    return;
  }

  const applied =
    window.applyAiSkinPackage(
      snapshot.skinPackage,
      {
        expectedRevision: snapshot.revisionAfterApply,
        expectedMountToken: snapshot.mountToken,
        dirty: snapshot.isDirty,
        expectedDraftVersionId: snapshot.draftVersionId,
        imageSlotBindings: snapshot.imageSlotBindings
      }
    );

  studioAiUndoSnapshot =
    null;

  if (!applied.ok) {

    setStudioAiStatus("");

    showStudioToast(
      "그 사이 다른 변경이 있어 되돌리지 못했습니다.",
      { isError: true }
    );

    return;

  }

  setStudioAiStatus("AI 변경을 되돌렸습니다.");

}


/* =========================================================
   입력 / 키보드

   Enter 전송, Shift+Enter 줄바꿈. 한글(IME) 조합 중의 Enter는
   조합 확정용이므로 전송하지 않는다 — event.isComposing과
   keyCode 229(일부 브라우저가 isComposing을 채우지 않는 경우의
   보완)를 함께 본다.
========================================================== */

if (studioAiPanelInput) {

  studioAiPanelInput.addEventListener(
    "input",
    updateStudioAiSendButtonState
  );

  studioAiPanelInput.addEventListener(
    "focus",
    updateStudioAiSendButtonState
  );

  studioAiPanelInput.addEventListener(
    "keydown",
    (event) => {

      if (event.key !== "Enter") {
        return;
      }

      if (event.shiftKey) {
        return;
      }

      if (event.isComposing || event.keyCode === 229) {
        return;
      }

      event.preventDefault();

      handleStudioAiSend();

    }
  );

}


if (studioAiPanelSendButton) {

  studioAiPanelSendButton.addEventListener(
    "click",
    () => {

      handleStudioAiSend();

    }
  );

}


if (studioAiPanelUndoButton) {

  studioAiPanelUndoButton.addEventListener(
    "click",
    handleStudioAiUndo
  );

}


/*
  drawer를 여닫는 핸들 자체는 studio-preview.js가 소유한다(그쪽
  리스너가 .is-open 토글/포커스를 담당) — 여기서는 열릴 때
  Send 버튼 상태만 한 번 다시 계산한다. 같은 요소에 리스너를
  하나 더 붙이는 것뿐이라 기존 동작에는 영향이 없다.
*/
if (studioAiPanelHandle) {

  studioAiPanelHandle.addEventListener(
    "click",
    () => {

      updateStudioAiSendButtonState();

    }
  );

}


updateStudioAiSendButtonState();


/*
  테스트(studio/studio-ai-panel-e2e-test.mjs)가 내부 상태를 직접
  들여다보지 않고도 "지금 되돌릴 수 있는가 / 요청 중인가"를
  확인할 수 있게 하는 읽기 전용 창구. production 코드는 이 전역을
  참조하지 않는다.
*/
if (typeof window !== "undefined") {

  window.getStudioAiPanelDebugState =
    function () {

      return {
        pending: !!studioAiPendingRequest,
        hasUndo: !!studioAiUndoSnapshot,
        statusText:
          (studioAiPanelStatusText && !studioAiPanelStatus.hidden)
            ? studioAiPanelStatusText.textContent
            : "",
        undoVisible:
          !!(studioAiPanelUndoButton && !studioAiPanelUndoButton.hidden)
      };

    };

}
