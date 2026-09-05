/* =========================================================
   SKIN STUDIO - PREVIEW SHELL (Slice 3)

   AI_SKIN_PHASE1B_DESIGN.md 5/10/11절. studio-state.js가 "existing"
   분기(active skin 있음)로 판별했을 때 mountStudioPreview(skin)을
   호출해 전체화면 Preview를 그린다 — "skin 없음" 사용자는 이 파일을
   전혀 거치지 않는다(10절 "Questionnaire fallback 사용자는 Preview
   shell을 억지로 띄우지 않는다").

   책임: (1) 현재 draft(skin_versions.content, 항상
   current_draft_version_id 기준 — published가 아니라 draft를
   Preview 기준으로 쓴다, 3절) 로드, (2) image slot 이름 추출
   (skin/skin-image-slots.js 공용 helper) + owner RLS로
   skin_image_slot_values 조회, (3) buildSkinContext()로 실제 Skin
   Context 생성(skin/skin-context.js, DB row를 직접 HTML로 조립하는
   새 로직 없음, 4절), (4) 단일 Preview iframe(studio/preview/
   preview-frame.html)에 postMessage로 {skin, context} 전달,
   (5) Desktop/Mobile 뷰포트 전환(iframe 재생성 없이 폭만 전환,
   11절), (6) Save/Code/Settings/AI는 이번 Slice에서 자리만 예약
   (실제 기능 없음, 15절).

   postMessage contract(12절, iframe 쪽 studio/preview/preview-bridge.js
   와 동일한 문자열을 하드코딩 — 두 문서는 서로 다른 browsing
   context라 상수를 import로 공유할 수 없다. 값을 바꿀 땐 두 파일을
   함께 고친다):
     parent -> iframe  "preview:render"   { type, skin, context }
     iframe -> parent  "preview:ready"    { type }
     iframe -> parent  "preview:rendered" { type }
     iframe -> parent  "preview:error"    { type, message }

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), buildSkinContext
   (skin/skin-context.js), extractImageSlotNames
   (skin/skin-image-slots.js). studio/index.html의 로드 순서 참고.
========================================================== */

const PREVIEW_MSG_RENDER = "preview:render";
const PREVIEW_MSG_READY = "preview:ready";
const PREVIEW_MSG_RENDERED = "preview:rendered";
const PREVIEW_MSG_ERROR = "preview:error";


const studioPreviewShell =
  document.getElementById("studioPreviewShell");

const studioPreviewFrame =
  document.getElementById("studioPreviewFrame");

const studioPreviewStage =
  document.getElementById("studioPreviewStage");

const studioPreviewOverlay =
  document.getElementById("studioPreviewOverlay");

const studioPreviewOverlayText =
  document.getElementById("studioPreviewOverlayText");

const studioViewportToggle =
  document.getElementById("studioViewportToggle");

const studioViewportToggleButton =
  document.getElementById("studioViewportToggleButton");

const studioViewportToggleMenu =
  document.getElementById("studioViewportToggleMenu");

const studioViewportToggleLabel =
  document.getElementById("studioViewportToggleLabel");


/*
  studio-state.js는 이 두 함수만 직접 호출한다 — mountStudioPreview
  ("existing" 분기)와 hideStudioPreviewShell("error"/"first-time"
  분기, 재진입 대비). 둘 다 classic script라 studio-state.js보다
  먼저 로드되기만 하면 typeof 가드 없이 바로 호출해도 된다
  (skin-questionnaire/questionnaire.js의 mountSkinQuestionnaire와
  동일한 로드 순서 관례).
*/

let previewFrameReady = false;
let pendingRenderPayload = null;
let mountToken = 0;


function hideStudioPreviewShell() {

  studioPreviewShell.hidden =
    true;

}


function postRenderToFrame(payload) {

  if (!previewFrameReady) {

    pendingRenderPayload =
      payload;

    return;

  }

  studioPreviewFrame.contentWindow.postMessage(
    {
      type: PREVIEW_MSG_RENDER,
      skin: payload.skin,
      context: payload.context
    },
    window.location.origin
  );

}


/* =========================================================
   iframe으로부터의 메시지 — 같은 origin + 이 iframe에서 온 것인지
   + shape까지 확인한다(12절, 같은 origin이라도 shape validation).
========================================================== */

window.addEventListener(
  "message",
  (event) => {

    if (event.origin !== window.location.origin) {
      return;
    }

    if (event.source !== studioPreviewFrame.contentWindow) {
      return;
    }

    const data =
      event.data;

    if (
      !data ||
      typeof data !== "object" ||
      typeof data.type !== "string"
    ) {
      return;
    }

    if (data.type === PREVIEW_MSG_READY) {

      previewFrameReady =
        true;

      if (pendingRenderPayload) {

        const payload =
          pendingRenderPayload;

        pendingRenderPayload =
          null;

        postRenderToFrame(
          payload
        );

      }

      return;

    }

    if (data.type === PREVIEW_MSG_RENDERED) {

      setStudioPreviewOverlay(
        "hidden"
      );

      return;

    }

    if (data.type === PREVIEW_MSG_ERROR) {

      console.error(
        "[studio-preview] iframe reported render error",
        data.message
      );

      setStudioPreviewOverlay(
        "error",
        "미리보기를 표시하지 못했습니다."
      );

      return;

    }

  }
);



/* =========================================================
   loading/error overlay — draft loading / context loading /
   iframe render 대기 / ready / error 다섯 상태를 최소한의 문구로만
   구분한다(10절). 실패해도 상단 viewport toggle/구석 컨트롤은
   항상 그대로 남아 있어 화면이 완전히 blank가 되지 않는다.
========================================================== */

function setStudioPreviewOverlay(
  mode,
  text
) {

  if (mode === "hidden") {

    studioPreviewOverlay.hidden =
      true;

    studioPreviewOverlay.classList.remove(
      "studio-preview-overlay--error"
    );

    return;

  }

  studioPreviewOverlay.hidden =
    false;

  studioPreviewOverlay.classList.toggle(
    "studio-preview-overlay--error",
    mode === "error"
  );

  studioPreviewOverlayText.textContent =
    text;

}



/* =========================================================
   Draft 로드 -> Context 빌드 -> iframe 전송

   published가 아니라 항상 current_draft_version_id를 Preview
   기준으로 쓴다(3절) — create_skin_with_initial_version/
   save_skin_draft_version 둘 다 draft 포인터를 항상 채우므로
   "existing" 분기에 진입한 시점엔 이 값이 null일 수 없다
   (publish_skin은 draft 포인터를 건드리지 않는다,
   20260905100000_add_skin_draft_write_rpcs.sql 참고).

   mountToken으로 stale 완료를 무시한다 — 이번 Slice엔 재호출
   경로가 없지만(한 세션에 한 번), 방어적으로 남겨 둔다.
========================================================== */

async function loadCurrentUserId() {

  const {
    data: userData,
    error: userError
  } =
    await supabaseClient
      .auth
      .getUser();

  if (
    userError ||
    !userData?.user
  ) {

    throw (
      userError ||
      new Error("no authenticated user")
    );

  }

  return userData.user.id;

}


async function loadDraftContent(
  draftVersionId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("skin_versions")
      .select("content")
      .eq("id", draftVersionId)
      .single();

  if (
    error ||
    !data
  ) {

    throw (
      error ||
      new Error("draft version not found")
    );

  }

  return data.content;

}


async function loadImageSlotValues(
  skinId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("skin_image_slot_values")
      .select("slot_name, image_url")
      .eq("skin_id", skinId);

  if (error) {
    throw error;
  }

  const values =
    {};

  (data || []).forEach(
    (row) => {

      values[row.slot_name] =
        row.image_url;

    }
  );

  return values;

}


async function mountStudioPreview(
  skin
) {

  const token =
    ++mountToken;

  previewFrameReady =
    false;

  pendingRenderPayload =
    null;

  studioPreviewShell.hidden =
    false;

  setStudioPreviewOverlay(
    "loading",
    "Draft를 불러오는 중..."
  );


  let ownerId;

  try {

    ownerId =
      await loadCurrentUserId();

  } catch (err) {

    console.error(
      "[studio-preview] failed to resolve current user",
      err
    );

    if (token === mountToken) {

      setStudioPreviewOverlay(
        "error",
        "로그인 정보를 확인하지 못했습니다."
      );

    }

    return;

  }


  let draftContent;

  try {

    draftContent =
      await loadDraftContent(
        skin.current_draft_version_id
      );

  } catch (err) {

    console.error(
      "[studio-preview] failed to load draft version",
      err
    );

    if (token === mountToken) {

      setStudioPreviewOverlay(
        "error",
        "Draft를 불러오지 못했습니다."
      );

    }

    return;

  }

  if (token !== mountToken) {
    return;
  }

  setStudioPreviewOverlay(
    "loading",
    "콘텐츠를 불러오는 중..."
  );


  const imageSlotNames =
    extractImageSlotNames(
      draftContent
    );


  let imageSlotValues =
    {};

  try {

    imageSlotValues =
      await loadImageSlotValues(
        skin.id
      );

  } catch (err) {

    /*
      이미지 슬롯 값 조회 실패는 전체 Preview를 막을 이유가 없다
      — 슬롯 없는 상태로라도 나머지 Context(site/profile/navigation/
      home/banners)는 정상 렌더한다.
    */

    console.error(
      "[studio-preview] failed to load image slot values",
      err
    );

  }


  let context;

  try {

    context =
      await buildSkinContext(
        ownerId,
        {
          imageSlotNames,
          imageSlotValues
        }
      );

  } catch (err) {

    console.error(
      "[studio-preview] buildSkinContext failed",
      err
    );

    if (token === mountToken) {

      setStudioPreviewOverlay(
        "error",
        "미리보기 데이터를 불러오지 못했습니다."
      );

    }

    return;

  }

  if (token !== mountToken) {
    return;
  }

  setStudioPreviewOverlay(
    "loading",
    "미리보기를 그리는 중..."
  );

  postRenderToFrame(
    {
      skin: draftContent,
      context
    }
  );

}



/* =========================================================
   Desktop / Mobile 뷰포트 전환 (7/8절)

   iframe은 절대 재생성/재로드하지 않는다 — #studioPreviewStage의
   클래스만 바꿔 iframe의 CSS width를 바꾼다. iframe은 자신만의
   레이아웃 뷰포트를 가지므로, 폭이 바뀌면 브라우저가 그 안의
   Skin CSS `@media` 규칙을 실제 창 크기가 바뀐 것과 동일하게
   재평가한다(11-5절 근거, studio.css의 width 규칙 참고).
========================================================== */

function setStudioViewportMode(
  mode
) {

  studioPreviewStage.classList.toggle(
    "studio-preview-stage--mobile",
    mode === "mobile"
  );

  studioViewportToggleLabel.textContent =
    mode === "mobile"
      ? "Mobile"
      : "Desktop";

  studioViewportToggleMenu.hidden =
    true;

  studioViewportToggleButton.setAttribute(
    "aria-expanded",
    "false"
  );

  Array.from(
    studioViewportToggleMenu.querySelectorAll(
      ".studio-viewport-toggle-option"
    )
  ).forEach(
    (button) => {

      button.classList.toggle(
        "studio-viewport-toggle-option--active",
        button.dataset.viewportMode === mode
      );

    }
  );

}


studioViewportToggleButton.addEventListener(
  "click",
  () => {

    const isOpen =
      !studioViewportToggleMenu.hidden;

    studioViewportToggleMenu.hidden =
      isOpen;

    studioViewportToggleButton.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

  }
);


Array.from(
  studioViewportToggleMenu.querySelectorAll(
    ".studio-viewport-toggle-option"
  )
).forEach(
  (button) => {

    button.addEventListener(
      "click",
      () => {

        setStudioViewportMode(
          button.dataset.viewportMode
        );

      }
    );

  }
);


document.addEventListener(
  "click",
  (event) => {

    if (
      !studioViewportToggle.contains(
        event.target
      )
    ) {

      studioViewportToggleMenu.hidden =
        true;

      studioViewportToggleButton.setAttribute(
        "aria-expanded",
        "false"
      );

    }

  }
);
