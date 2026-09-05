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
     iframe -> parent  "preview:rendered" { type, hasPostBodyRegion }
     iframe -> parent  "preview:error"    { type, message }
     iframe -> parent  "preview:navigate" { type, href }

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), buildSkinContext
   (skin/skin-context.js), extractImageSlotNames
   (skin/skin-image-slots.js), resolveSkinTemplate
   (skin/skin-template.js — PHASE 1C-B, HOME 편집/미리보기 대상
   선택), normalizeSkinPackageForDraft
   (skin/skin-package-normalize.js — PHASE 1C-B, Save 직전 전체
   정규화). studio/index.html의 로드 순서 참고.
========================================================== */

const PREVIEW_MSG_RENDER = "preview:render";
const PREVIEW_MSG_READY = "preview:ready";
const PREVIEW_MSG_RENDERED = "preview:rendered";
const PREVIEW_MSG_ERROR = "preview:error";
const PREVIEW_MSG_NAVIGATE = "preview:navigate";

/*
  studio(이 문서) -> admin(부모 window)로 보내는 메시지. admin은
  admin/index.html에 #skinStudioFrame으로 이 문서를 iframe embed
  하고 있고, admin/admin-session.js가 이 타입을 받아 showAdminHome()
  을 호출한다(Studio UI 정리 라운드 — admin 바깥쪽 별도 back 버튼과
  이중 chrome이 생기지 않도록, Top Dock의 back이 부모로 이 메시지를
  보내는 방식으로 대체했다). preview-frame.html 쪽 PREVIEW_MSG_*와
  마찬가지로 두 문서가 서로 다른 browsing context라 상수를 공유할
  수 없다 — 값을 바꿀 땐 admin-session.js도 함께 고친다.
*/
const STUDIO_MSG_BACK = "studio:back";


const studioPreviewShell =
  document.getElementById("studioPreviewShell");

const studioPreviewFrame =
  document.getElementById("studioPreviewFrame");

const studioPreviewFrameWrap =
  document.getElementById("studioPreviewFrameWrap");

const studioPreviewStage =
  document.getElementById("studioPreviewStage");

const studioPreviewOverlay =
  document.getElementById("studioPreviewOverlay");

const studioPreviewOverlayText =
  document.getElementById("studioPreviewOverlayText");

const studioViewportToggle =
  document.getElementById("studioViewportToggle");

const studioTopDockZone =
  document.getElementById("studioTopDockZone");

const studioTopDockHandle =
  document.getElementById("studioTopDockHandle");

const studioTopDockHandleIcon =
  document.getElementById("studioTopDockHandleIcon");

const studioBackButton =
  document.getElementById("studioBackButton");

const studioSaveButton =
  document.getElementById("studioSaveButton");

const studioCodeButton =
  document.getElementById("studioCodeButton");

const studioToast =
  document.getElementById("studioToast");

const studioAiDrawer =
  document.getElementById("studioAiDrawer");

const studioAiDrawerInput =
  document.getElementById("studioAiDrawerInput");

const studioAiHandle =
  document.getElementById("studioAiHandle");

const studioAiHandleIcon =
  document.getElementById("studioAiHandleIcon");


/*
  studio-state.js는 이 두 함수만 직접 호출한다 — mountStudioPreview
  ("existing" 분기)와 hideStudioPreviewShell("error"/"first-time"
  분기, 재진입 대비). 둘 다 classic script라 studio-state.js보다
  먼저 로드되기만 하면 typeof 가드 없이 바로 호출해도 된다
  (skin-questionnaire/questionnaire.js의 mountSkinQuestionnaire와
  동일한 로드 순서 관례).
*/

/*
  iframe(studio/preview/preview-frame.html)은 studio/index.html에
  #studioPreviewFrame으로 한 번만 생성되고 이후 재로드/재생성되지
  않는다 — preview-bridge.js의 "preview:ready"도 그 iframe 문서
  최초 로드 시 한 번만 온다. 그래서 previewFrameReady는
  mountStudioPreview() 재호출(예: Questionnaire 제출 후 재진입)
  시점에 false로 되돌리지 않는다 — 되돌리면 ready가 다시는 오지
  않으므로 이후 render가 pendingRenderPayload에 영구 대기하게 된다.
*/
let previewFrameReady = false;
let pendingRenderPayload = null;
let mountToken = 0;


/* =========================================================
   WORKING DRAFT 상태 (Slice 4)

   AI_SKIN_PHASE1B_DESIGN.md 2/9/10/12/13절. Studio가 메모리 안에
   유지하는 "현재 작업 중인 SkinPackage" — DB의 current_draft_
   version_id가 가리키는 content를 최초 진입 시 그대로 복사해
   시작하고, 이후 Code Apply만 이 값을 갱신한다(Save는 이 값을
   DB로 내보낼 뿐, 이 값 자체를 바꾸지 않는다).

   currentWorkingSkin은 항상 새 객체로 교체한다(참조를 그 자리에서
   mutate하지 않음) — handleStudioSaveClick()이 저장 시작 시점의
   객체 참조를 스냅샷으로 들고 있다가, 저장이 끝난 뒤 그 사이에
   Apply로 currentWorkingSkin이 이미 교체됐는지(참조 비교)를 확인해
   더 최신 미저장 변경을 실수로 "저장됨"으로 지우지 않기 위함이다
   (12절).
========================================================== */

let currentWorkingSkin = null;
let currentSkinContext = null;
let currentSkinId = null;
let currentDraftVersionId = null;
let isStudioDirty = false;
let isStudioSavePending = false;
let studioToastHideTimer = null;


/* =========================================================
   PAGE PREVIEW 상태

   viewport state(studioViewportMode, 이 파일 하단)와 완전히
   독립적이다 — HOME/CATEGORY/POST 이동이 Desktop/Mobile 선택에
   영향을 주지 않고, 그 반대도 마찬가지다.

   currentOwnerId/currentImageSlotNames/currentImageSlotValues는
   mountStudioPreview()가 HOME context를 만들 때 이미 조회한
   값을 그대로 재사용하기 위해 저장해 둔다 — CATEGORY/POST
   context를 만들 때도 같은 owner/이미지 슬롯 기준으로
   buildCategorySkinContext()/buildPostSkinContext()를 호출해야
   하기 때문이다("Studio가 category/post 데이터를 새로 조립하지
   않는다").

   실제 navigation(어느 카테고리/글을 보고 있는지, previewHistory
   스택, Preview Back)은 studio/preview/preview-navigation.js가
   전담한다(PHASE 1C-G) — 이 파일은 currentPreviewPageType만 읽어
   Code Editor 버튼 활성화 여부를 판단한다.
========================================================== */

let currentOwnerId = null;
let currentImageSlotNames = [];
let currentImageSlotValues = {};


function updateStudioSaveButtonState() {

  studioSaveButton.disabled =
    !isStudioDirty ||
    isStudioSavePending ||
    !currentWorkingSkin;

}


/* =========================================================
   Code Editor는 HOME만 편집한다(PHASE 1C-G 20절) — CATEGORY/POST
   Preview 중에는 "HOME html을 수정하는" 오해를 막기 위해 버튼
   자체를 비활성화한다. currentWorkingSkin이 아직 없을 때도 당연히
   비활성 상태를 유지한다. currentPreviewPageType은 studio/preview/
   preview-navigation.js가 소유/갱신한다.
========================================================== */

function updateStudioCodeButtonState() {

  studioCodeButton.disabled =
    !currentWorkingSkin ||
    currentPreviewPageType !== "home";

  studioCodeButton.title =
    currentPreviewPageType !== "home"
      ? "현재 Code Editor는 HOME만 편집합니다"
      : "";

}


function resetStudioWorkingState() {

  currentWorkingSkin =
    null;

  currentSkinContext =
    null;

  currentSkinId =
    null;

  currentDraftVersionId =
    null;

  isStudioDirty =
    false;

  isStudioSavePending =
    false;

  currentOwnerId =
    null;

  currentImageSlotNames =
    [];

  currentImageSlotValues =
    {};

  /*
    previewHistory/currentPreviewPageType(studio/preview/
    preview-navigation.js)도 함께 리셋한다 — 이 함수 자체가
    updateStudioCodeButtonState()/updatePreviewBackButtonVisibility()
    까지 호출해 주므로 여기서 따로 부를 필요가 없다.
  */
  resetPreviewNavigation();

  updateStudioSaveButtonState();

}


/* =========================================================
   TOAST (Slice 4) — Save 성공/실패, Code Apply의 sanitize 안내
   등 짧은 1회성 알림. 4초 뒤 자동으로 숨는다 — 그 전에 다시
   호출되면 기존 타이머를 취소하고 새로 4초를 센다.
========================================================== */

function showStudioToast(message, options) {

  const isError =
    !!(options && options.isError);

  if (studioToastHideTimer) {

    clearTimeout(
      studioToastHideTimer
    );

    studioToastHideTimer =
      null;

  }

  studioToast.textContent =
    message;

  studioToast.classList.toggle(
    "studio-toast--error",
    isError
  );

  studioToast.hidden =
    false;

  studioToastHideTimer =
    setTimeout(
      () => {

        studioToast.hidden =
          true;

        studioToastHideTimer =
          null;

      },
      4000
    );

}


/* =========================================================
   PHASE 1C-B: HOME 편집/미리보기 대상 선택 — resolveSkinTemplate()
   (skin/skin-template.js, classic global)의 우선순위를 그대로
   따른다: templates.home이 있으면 그것, 없으면 legacy top-level
   html/css. Studio Code Editor는 이번 Slice에서도 여전히
   HOME만 편집한다(category/post는 8절 "Code UI에서 직접 편집할
   필요 없음" — 그대로 보존만 된다, applyWorkingSkinChanges 참고).
========================================================== */

function buildStudioHomePreviewSkin(skin) {

  return (
    resolveSkinTemplate(skin, "home") ||
    { html: skin?.html || "", css: skin?.css || "" }
  );

}


/* =========================================================
   HOME/CATEGORY/POST page 전환은 studio/preview/
   preview-navigation.js가 전담한다(PHASE 1C-G) — renderHomePreview/
   renderCategoryPreviewFor/renderPostPreviewFor/
   renderCurrentPreviewEntry/pushPreviewNavigation/
   popPreviewNavigation/handlePreviewNavigateMessage가 전부 그
   파일에 있다. 이 파일은 buildStudioHomePreviewSkin()(바로 위)과
   postRenderToFrame()/setStudioPreviewOverlay()/
   updateStudioCodeButtonState()(아래)만 제공하고, 실제 페이지별
   분기/네트워크 호출/history 스택은 갖지 않는다.
========================================================== */


/* =========================================================
   Code Apply — code-editor.js가 sanitize/validate를 이미 통과한
   뒤에만 이 함수를 호출한다(studio/editor/code-editor.js 참고).
   여기서는 DB에 전혀 손대지 않는다 — currentWorkingSkin 교체 +
   Preview 즉시 반영 + dirty=true만 한다(5절 "Apply와 Save는
   반드시 분리").

   PHASE 1C-B: templates.home이 이미 있는(멀티페이지) Skin이면
   HOME 편집 결과를 templates.home.html에 써야 resolveSkinTemplate()
   우선순위와 일치한다(top-level html에만 써 봐야 아무도 안 읽는
   죽은 필드가 된다) — templates.category/post/imageSlots/regions/
   metadata는 스프레드로 그대로 보존된다. templates.home이 없는
   기존 html-only Skin은 지금까지와 동일하게 top-level html에
   쓴다. css는 templates 유무와 무관하게 항상 공유 top-level
   css 하나에만 쓴다(페이지별 css를 두지 않는다는 12-B절 결정).
========================================================== */

function applyWorkingSkinChanges(html, css, meta) {

  if (!currentWorkingSkin) {
    return;
  }

  const hasHomeTemplate =
    !!(currentWorkingSkin.templates && currentWorkingSkin.templates.home);

  currentWorkingSkin =
    hasHomeTemplate
      ? {
          ...currentWorkingSkin,
          css,
          templates: {
            ...currentWorkingSkin.templates,
            home: {
              ...currentWorkingSkin.templates.home,
              html
            }
          }
        }
      : {
          ...currentWorkingSkin,
          html,
          css
        };

  isStudioDirty =
    true;

  updateStudioSaveButtonState();

  postRenderToFrame(
    {
      skin: buildStudioHomePreviewSkin(currentWorkingSkin),
      context: currentSkinContext
    }
  );

  if (meta && meta.htmlWasModified) {

    showStudioToast(
      "일부 허용되지 않는 HTML이 제거되었습니다."
    );

  }

}


studioCodeButton.addEventListener(
  "click",
  () => {

    if (!currentWorkingSkin) {
      return;
    }

    const homeSource =
      buildStudioHomePreviewSkin(currentWorkingSkin);

    window.openSkinCodeEditor(
      {
        html: homeSource.html,
        css: homeSource.css,
        onApply: applyWorkingSkinChanges
      }
    );

  }
);


/* =========================================================
   Save — save_skin_draft_version() RPC(studio/studio-write.js
   wrapper) 1회 호출. 저장 대상은 항상 currentWorkingSkin 전체
   (schemaVersion/html/css/templates/imageSlots/regions/metadata
   전부) — Code Editor가 HOME html/css만 바꿔도 나머지 필드는 이미
   currentWorkingSkin 안에 그대로 보존되어 있다(11절).

   PHASE 1C-B: RPC 호출 직전에 normalizeSkinPackageForDraft()
   (skin/skin-package-normalize.js)로 전체 SkinPackage를 마지막으로
   한 번 더 정규화한다 — 이게 실제 "저장 시점" 신뢰 경계다(legacy
   html + templates.home/category/post 각각 존재하는 것만 sanitize,
   공유 css validate). currentWorkingSkin은 이미 Apply 단계에서
   sanitize/validate를 통과한 상태라 보통 이 호출은 아무것도 바꾸지
   않는(idempotent) no-op에 가깝지만, 이 함수 자체가 유일한 저장
   전 검증 지점이라는 계약을 지키기 위해 항상 거친다. 정규화가
   실패하면(예: css가 구조적으로 깨짐) RPC를 아예 호출하지 않고
   currentWorkingSkin/dirty 무엇도 바꾸지 않는다 — Apply/Save 둘 중
   어느 후보든 검증 실패는 항상 "working Skin 변경 없음"으로
   귀결되어야 한다는 원칙과 동일한 결.

   pending 중 중복 클릭은 무시한다(버튼도 disabled지만, 방어적으로
   함수 진입점에서도 한 번 더 막는다, 14절).
========================================================== */

async function handleStudioSaveClick() {

  if (
    isStudioSavePending ||
    !isStudioDirty ||
    !currentWorkingSkin ||
    !currentSkinId
  ) {
    return;
  }

  const snapshot =
    currentWorkingSkin;

  isStudioSavePending =
    true;

  updateStudioSaveButtonState();

  let normalizedSnapshot;

  try {

    normalizedSnapshot =
      await normalizeSkinPackageForDraft(
        snapshot
      );

  } catch (err) {

    console.error(
      "[studio-preview] normalize before save failed",
      err
    );

    showStudioToast(
      "저장하지 못했습니다. 스킨 내용을 확인해주세요.",
      { isError: true }
    );

    isStudioSavePending =
      false;

    updateStudioSaveButtonState();

    return;

  }

  try {

    const newVersionId =
      await saveSkinDraftVersion(
        currentSkinId,
        normalizedSnapshot,
        normalizedSnapshot.schemaVersion,
        null
      );

    currentDraftVersionId =
      newVersionId;

    /*
      저장이 끝나기 전에 사용자가 다시 Apply를 해서
      currentWorkingSkin이 이미 다른 객체로 교체됐다면, 방금 끝난
      저장은 그 "더 새로운" 미저장 변경사항을 알지 못한다 —
      이번에 저장한 스냅샷과 지금의 currentWorkingSkin이 여전히
      같은 객체일 때만 dirty를 내린다(13절 "이전 draft는 그대로/
      작업 상태를 버리지 않는다"와 같은 결).
    */

    if (currentWorkingSkin === snapshot) {

      isStudioDirty =
        false;

    }

    showStudioToast(
      "저장되었습니다."
    );

  } catch (err) {

    console.error(
      "[studio-preview] save draft failed",
      err
    );

    showStudioToast(
      "저장하지 못했습니다. 다시 시도해주세요.",
      { isError: true }
    );

  } finally {

    isStudioSavePending =
      false;

    updateStudioSaveButtonState();

  }

}


studioSaveButton.addEventListener(
  "click",
  handleStudioSaveClick
);


function hideStudioPreviewShell() {

  resetStudioWorkingState();

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

      /*
        post-body region 유효성(PHASE1C 7/13절, 문서 20-O)은 POST
        페이지에서만 의미가 있다 — iframe이 실제 mount한 DOM을 보고
        판정한 값을 여기서만 검사한다. 본문 자리가 없는 POST 템플릿은
        outer chrome만 보여주는 반쪽짜리 렌더로 남기지 않고 invalid
        상태로 덮는다(공개 skin-post.js와 동일한 원칙).
      */
      if (
        currentPreviewPageType === "post" &&
        !data.hasPostBodyRegion
      ) {

        setStudioPreviewOverlay(
          "unsupported",
          "이 스킨에는 글 본문을 표시할 자리가 없습니다."
        );

        return;

      }

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

    if (data.type === PREVIEW_MSG_NAVIGATE) {

      if (typeof data.href === "string") {
        handlePreviewNavigateMessage(data.href);
      }

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

  pendingRenderPayload =
    null;

  resetStudioWorkingState();

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

  /*
    이 시점부터 draftContent/context는 DB 원본 스냅샷이 아니라
    Studio가 메모리에 들고 있는 working draft가 된다(Slice 4,
    파일 상단 "WORKING DRAFT 상태" 절 참고) — 이후 Code Apply는
    이 currentWorkingSkin만 갱신하고, Save가 성공하기 전까지 DB는
    전혀 바뀌지 않는다. dirty는 항상 false로 시작한다(9절 "Studio
    최초 진입: dirty false").
  */

  currentWorkingSkin =
    draftContent;

  currentSkinContext =
    context;

  currentSkinId =
    skin.id;

  currentDraftVersionId =
    skin.current_draft_version_id;

  isStudioDirty =
    false;

  /*
    CATEGORY/POST Preview가 재사용할 owner/이미지 슬롯 기준을 여기서
    저장해 둔다 — buildCategorySkinContext()/buildPostSkinContext()도
    같은 owner/슬롯 기준으로 호출해야 하기 때문이다.
  */
  currentOwnerId =
    ownerId;

  currentImageSlotNames =
    imageSlotNames;

  currentImageSlotValues =
    imageSlotValues;

  updateStudioSaveButtonState();

  /*
    previewHistory는 이 함수 진입 시점의 resetStudioWorkingState()
    호출로 이미 [{type:"home"}]으로 초기화돼 있다(studio/preview/
    preview-navigation.js) — 여기서는 그 HOME을 실제로 렌더만 한다.
  */
  renderHomePreview();

}



/* =========================================================
   Desktop / Mobile 뷰포트 전환 (2/4절)

   iframe은 절대 재생성/재로드하지 않는다 — #studioPreviewStage의
   클래스만 바꿔 iframe의 CSS width를 바꾼다. iframe은 자신만의
   레이아웃 뷰포트를 가지므로, 폭이 바뀌면 브라우저가 그 안의
   Skin CSS `@media` 규칙을 실제 창 크기가 바뀐 것과 동일하게
   재평가한다(11-5절 근거, studio.css의 width 규칙 참고).

   dropdown 없이 두 버튼(Desktop/Mobile)을 항상 나란히 보여주고,
   클릭 한 번으로 바로 전환한다.
========================================================== */

const STUDIO_MOBILE_FRAME_WIDTH = 390;
const STUDIO_MOBILE_FRAME_HEIGHT = 844;

/*
  Studio 화면이 390x844보다 작을 때 iframe 가장자리가 stage에
  바로 붙지 않도록 두는 여백 — 이 값만큼 뺀 나머지를 기준으로
  축소 비율을 계산한다(studio.css의 .studio-preview-stage--mobile
  padding과 별개로, wrap 자체 크기 계산용).
*/
const STUDIO_MOBILE_SCALE_MARGIN = 32;

let studioViewportMode = "desktop";


function updateStudioMobileFrameScale() {

  if (
    studioViewportMode !== "mobile"
  ) {

    studioPreviewFrameWrap.style.removeProperty(
      "--studio-mobile-scale"
    );

    return;

  }

  const stageRect =
    studioPreviewStage.getBoundingClientRect();

  const availableWidth =
    stageRect.width - STUDIO_MOBILE_SCALE_MARGIN;

  const availableHeight =
    stageRect.height - STUDIO_MOBILE_SCALE_MARGIN;

  /*
    1을 넘지 않게(작은 화면에서만 축소, 큰 화면에서 확대는 하지
    않는다) — 그리고 stage가 아직 0 크기인 극단적인 경우를 대비해
    최소값도 둔다.
  */
  const scale =
    Math.min(
      1,
      availableWidth / STUDIO_MOBILE_FRAME_WIDTH,
      availableHeight / STUDIO_MOBILE_FRAME_HEIGHT
    );

  studioPreviewFrameWrap.style.setProperty(
    "--studio-mobile-scale",
    String(Math.max(scale, 0.1))
  );

}


function setStudioViewportMode(
  mode
) {

  studioViewportMode =
    mode;

  studioPreviewStage.classList.toggle(
    "studio-preview-stage--mobile",
    mode === "mobile"
  );

  Array.from(
    studioViewportToggle.querySelectorAll(
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

  updateStudioMobileFrameScale();

}


Array.from(
  studioViewportToggle.querySelectorAll(
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


/*
  Studio 화면 크기 자체가 바뀌는 경우(admin iframe 크기 변화,
  창 크기 변화 등) mobile 배율을 다시 계산한다 — mode가 desktop일
  땐 updateStudioMobileFrameScale()이 바로 return하므로 비용이
  거의 없다.
*/

new ResizeObserver(
  updateStudioMobileFrameScale
).observe(
  studioPreviewStage
);



/* =========================================================
   TOP DOCK — handle 클릭으로 수동 여닫기 + Back (Studio chrome
   재정리 라운드)

   hover/focus 기반 auto-hide는 제거했다 — Mobile Preview에서
   마우스가 상단 영역을 스쳐 지나가기만 해도 dock이 예고 없이
   내려와 그 아래 컨트롤을 가리는 문제가 있었기 때문이다.
   #studioTopDockHandle 클릭만이 #studioTopDockZone의 .is-open을
   토글한다(실제 보이기/숨기기 애니메이션은 studio.css의 transform
   transition) — AI drawer handle(이 파일 하단)과 동일한 패턴이다.
========================================================== */

studioTopDockHandle.addEventListener(
  "click",
  () => {

    const willOpen =
      !studioTopDockZone.classList.contains(
        "is-open"
      );

    studioTopDockZone.classList.toggle(
      "is-open",
      willOpen
    );

    studioTopDockHandle.setAttribute(
      "aria-expanded",
      String(willOpen)
    );

    studioTopDockHandleIcon.textContent =
      willOpen
        ? "▴"
        : "▾";

  }
);


studioBackButton.addEventListener(
  "click",
  () => {

    /*
      저장하지 않은 변경사항이 있으면 나가기 전에 한 번 확인한다
      (20절 "과도한 beforeunload 확장 없이, Studio Back 동선부터
      우선 처리"). 취소하면 Studio는 그대로 유지되고 currentWorkingSkin/
      Preview/dirty 무엇도 바뀌지 않는다.
    */

    if (
      isStudioDirty &&
      !window.confirm(
        "저장하지 않은 변경사항이 있습니다. 나갈까요?"
      )
    ) {
      return;
    }

    window.parent.postMessage(
      {
        type: STUDIO_MSG_BACK
      },
      window.location.origin
    );

  }
);



/* =========================================================
   AI drawer shell (3/7절) — 이번 라운드는 shell만, 실제 AI 연결
   없음. handle 클릭으로 열고 닫는다 — send는 항상 disabled라
   여기서 별도 no-op 핸들러를 달 필요가 없다(HTML의 disabled 속성만
   으로 충분).
========================================================== */

studioAiHandle.addEventListener(
  "click",
  () => {

    const willOpen =
      !studioAiDrawer.classList.contains(
        "is-open"
      );

    studioAiDrawer.classList.toggle(
      "is-open",
      willOpen
    );

    studioAiHandle.setAttribute(
      "aria-expanded",
      String(willOpen)
    );

    studioAiHandleIcon.textContent =
      willOpen
        ? "▽"
        : "△";

    /*
      닫혀 있을 땐 시각적으로 접힌 textarea가 Tab 순서에 끼어들지
      않도록 한다 — 열렸을 때만 포커스를 받을 수 있게.
    */
    studioAiDrawerInput.tabIndex =
      willOpen
        ? 0
        : -1;

    if (
      willOpen
    ) {

      studioAiDrawerInput.focus();

    }

  }
);
