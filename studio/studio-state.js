/* =========================================================
   SKIN STUDIO - 진입 상태 판별 (PHASE 1B Slice 1/2/3)

   AI_SKIN_PHASE1B_DESIGN.md 5절의 표를 그대로 구현한다:

     row 없음                              -> skin 없는 사용자
       (fallback)
     row 있음, current_draft_version_id    -> 기존 draft 사용자
       not null
     row 있음, current_published_version_id
       not null도 함께                     -> 위와 동일(발행 이력
                                              있음 표시만 추가)

   "skins row가 한 번이라도 생기면 Questionnaire는 다시 뜨지
   않는다"가 유일한 판별 규칙 — is_active=true인 row 존재
   여부만 본다.

   Slice 2부터 "row 없음" 분기는 실제 skin-questionnaire/
   모듈을 마운트한다(7/5절) — Studio는 이 모듈의 유일한 소비처다.
   Questionnaire 제출 성공 시 페이지 이동 없이 이 파일의
   initStudio()를 다시 호출해 "existing" 분기로 전환한다.

   Slice 3부터 "existing" 분기는 studio-preview.js의
   mountStudioPreview()를 호출해 전체화면 Preview Shell을 띄운다
   (11절) — 이 파일은 여전히 진입 상태 판별만 책임지고, Draft 로드/
   Context 빌드/iframe 렌더는 전부 studio-preview.js 몫이다.

   의존: supabaseClient(core/lib/supabase-client.js),
   mountSkinQuestionnaire(skin-questionnaire/questionnaire.js),
   window.skinInitializerReady(skin/skin-initializer.js 핸드셰이크,
   skin/skin-home.js와 동일 패턴), mountStudioPreview/
   hideStudioPreviewShell(studio/studio-preview.js) — 전부 이
   파일보다 먼저 로드/선언되어야 함(studio/index.html 순서 참고).
========================================================== */


const studioShell =
  document.getElementById(
    "studioShell"
  );


const studioStatusText =
  document.getElementById(
    "studioStatusText"
  );


const studioStatusDetail =
  document.getElementById(
    "studioStatusDetail"
  );


const studioQuestionnaireMount =
  document.getElementById(
    "studioQuestionnaireMount"
  );



/* =========================================================
   상태 조회

   반환값:
     { status: "error", message }
     { status: "first-time" }
     { status: "existing", skin }
       skin = { id, current_draft_version_id, current_published_version_id }
========================================================== */

async function loadStudioEntryState() {

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

    return {
      status: "error",
      message: "로그인이 필요합니다."
    };

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "skins"
      )
      .select(
        "id, current_draft_version_id, current_published_version_id"
      )
      .eq(
        "user_id",
        userData.user.id
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();


  if (
    error
  ) {

    console.error(
      "load skin state error:",
      error
    );

    return {
      status: "error",
      message: "Skin 상태를 불러오지 못했습니다."
    };

  }


  if (
    !data
  ) {

    return {
      status: "first-time"
    };

  }


  return {
    status: "existing",
    skin: data
  };

}



/* =========================================================
   상태별 화면 전환

   "existing"만 studio-shell(중앙 정렬 placeholder/Questionnaire
   박스)을 숨기고 studio-preview.js의 전체화면 Preview Shell을
   띄운다(Slice 3) — error/first-time은 Slice 1/2와 동일하게
   studio-shell만 쓰고 Preview Shell은 아예 건드리지 않는다(설계
   문서 10절 "Questionnaire fallback 사용자는 Preview shell을
   억지로 띄우지 않는다").
========================================================== */

function renderStudioEntryState(
  state
) {

  /*
    상태가 바뀌어도(향후 Slice에서 이 함수를 다시 호출하는
    경우 포함) error 스타일이 남지 않도록, 매번 확정적으로
    켜고/끈다 — error 분기에서만 add하면 그 다음 정상 상태로
    다시 그릴 때 색이 그대로 남는다.
  */

  studioStatusText.classList.toggle(
    "studio-status-text--error",
    state.status === "error"
  );


  if (
    state.status === "error"
  ) {

    hideStudioPreviewShell();

    studioShell.hidden =
      false;

    studioStatusText.textContent =
      state.message;

    studioStatusDetail.hidden =
      true;

    hideStudioQuestionnaire();

    return;

  }


  if (
    state.status === "first-time"
  ) {

    hideStudioPreviewShell();

    studioShell.hidden =
      false;

    studioStatusText.textContent =
      "아직 Skin이 없어요.\n" +
      "몇 가지만 답하면 첫 Skin을 만들어 드려요.";

    studioStatusDetail.hidden =
      true;

    showStudioQuestionnaire();

    return;

  }


  /*
    state.status === "existing" — 전체화면 Preview Shell(Slice 3).
    draft 로드/context 빌드/iframe 렌더 진행 상황은 그 shell
    내부의 loading overlay가 자체적으로 표시한다(studio-preview.js).
  */

  hideStudioQuestionnaire();

  studioShell.hidden =
    true;

  mountStudioPreview(
    state.skin
  );

}



/* =========================================================
   Questionnaire (skin 없는 사용자 fallback, 5/7절)

   mountSkinQuestionnaire()의 onSubmit 계약: 실패 시 반드시
   throw해야 그 모듈의 재시도 UI가 정확히 동작한다
   (createInitialSkinFromAnswers는 실패 시 원래 에러를 그대로
   rethrow하므로 여기서 별도로 감쌀 필요가 없다). 성공 시에는
   페이지 이동 없이 initStudio()를 다시 호출해 "existing" 분기로
   전환한다 — Studio는 항상 같은 iframe 문서 안에서 상태만
   바뀐다(4절 popup과 달리 리다이렉트가 아니다).
========================================================== */

async function handleSkinQuestionnaireSubmit(
  answers
) {

  const createInitialSkinFromAnswers =
    await window.skinInitializerReady;

  await createInitialSkinFromAnswers(
    answers
  );

  await initStudio();

}


function showStudioQuestionnaire() {

  studioQuestionnaireMount.hidden =
    false;

  mountSkinQuestionnaire(
    studioQuestionnaireMount,
    {
      onSubmit:
        handleSkinQuestionnaireSubmit
    }
  );

}


function hideStudioQuestionnaire() {

  studioQuestionnaireMount.hidden =
    true;

  studioQuestionnaireMount.innerHTML =
    "";

}



/* =========================================================
   시작
========================================================== */

async function initStudio() {

  const state =
    await loadStudioEntryState();

  renderStudioEntryState(
    state
  );

}


window.addEventListener(
  "load",
  initStudio
);
