/* =========================================================
   HOME - SKIN 꾸미기 유도 POPUP

   AI_SKIN_PHASE1B_DESIGN.md 4절. 본인이 로그인한 채 자기 공개
   HOME(/:slug)에 도착했는데 아직 active Skin이 없으면, Skin
   Studio로 유도하는 가벼운 popup을 띄운다. 방문자/로그아웃/다른
   사람의 HOME에서는 절대 뜨지 않는다(4-1절 두 조건 모두 필요).

   Questionnaire는 이 파일에 없다 — 여기서 하는 일은 오직
   "Skin Studio로 유도"뿐이고, 실제 Questionnaire는 Studio
   진입 후 studio/studio-state.js의 fallback 분기가 담당한다
   (7절 — 이 모듈이 skin-questionnaire/studio/skin/ 어느 것도
   import하지 않는 이유).

   노출 빈도는 세션당 1회로 sessionStorage 키 하나로만
   제어한다(4-2절) — 새 DB 컬럼을 추가하지 않는다. 이 판단
   기준은 오직 `skins.is_active` row 유무뿐이며,
   `home_customize`는 조회/참조하지 않는다(14절).

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), authGetSession
   (core/lib/auth-shared.js), SITE_BASE_PATH(core/lib/site-path.js).
   index.html의 initHomeRenderer()가 getSiteOwner() 결과를 그대로
   넘겨 initHomeSkinPrompt(ownerId)를 호출한다(HOME 렌더 분기와
   무관하게 항상, fire-and-forget).
========================================================== */

const HOME_SKIN_PROMPT_DISMISSED_KEY =
  "skinPrompt:dismissed";


function isHomeSkinPromptDismissedThisSession() {

  try {

    return Boolean(
      sessionStorage.getItem(
        HOME_SKIN_PROMPT_DISMISSED_KEY
      )
    );

  }

  catch (err) {

    /*
      사생활 모드 등으로 sessionStorage 접근 자체가 실패하면
      "닫은 적 없음"으로 취급한다 — 매번 보이는 게, 조용히
      영원히 숨는 것보다 안전한 기본값이다.
    */

    return false;

  }

}


function dismissHomeSkinPromptForSession() {

  try {

    sessionStorage.setItem(
      HOME_SKIN_PROMPT_DISMISSED_KEY,
      "1"
    );

  }

  catch (err) {

    /* 저장 실패해도 popup을 닫는 동작 자체는 계속 진행한다 */

  }

}


/* =========================================================
   노출 조건 (4-1절) — 본인 확인 + Skin 없음, 둘 다 참이어야 함.
========================================================== */

async function shouldShowHomeSkinPrompt(
  ownerId
) {

  if (!ownerId) {
    return false;
  }


  if (
    isHomeSkinPromptDismissedThisSession()
  ) {

    return false;

  }


  const {
    data: sessionData,
    error: sessionError
  } =
    await authGetSession();


  if (
    sessionError ||
    !sessionData?.session?.user
  ) {

    return false;

  }


  if (
    sessionData.session.user.id !== ownerId
  ) {

    return false;

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
        "id"
      )
      .eq(
        "user_id",
        ownerId
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();


  if (error) {

    console.error(
      "[home-skin-prompt] active skin 조회 실패:",
      error
    );

    /*
      상태를 확인 못했으면 안전하게 안 보여준다 — "Skin 없음"을
      확신할 수 없는 상태에서 유도 popup을 띄우는 것보다,
      다음 방문에서 다시 판단하는 편이 낫다.
    */

    return false;

  }


  return !data;

}



/* =========================================================
   UI
========================================================== */

function buildHomeSkinPromptEl(
  onGoToStudio,
  onDismiss
) {

  const overlay =
    document.createElement(
      "div"
    );

  overlay.className =
    "home-skin-prompt-overlay";


  const card =
    document.createElement(
      "div"
    );

  card.className =
    "home-skin-prompt-card";

  overlay.appendChild(
    card
  );


  const text =
    document.createElement(
      "p"
    );

  text.className =
    "home-skin-prompt-text";

  text.textContent =
    "아직 홈을 꾸미지 않았어요.\n" +
    "내 취향에 맞는 첫 스킨을 만들어볼까요?";

  card.appendChild(
    text
  );


  const actions =
    document.createElement(
      "div"
    );

  actions.className =
    "home-skin-prompt-actions";

  card.appendChild(
    actions
  );


  const laterButton =
    document.createElement(
      "button"
    );

  laterButton.type =
    "button";

  laterButton.className =
    "home-skin-prompt-button home-skin-prompt-button--ghost";

  laterButton.textContent =
    "나중에";

  laterButton.addEventListener(
    "click",
    onDismiss
  );

  actions.appendChild(
    laterButton
  );


  const goButton =
    document.createElement(
      "button"
    );

  goButton.type =
    "button";

  goButton.className =
    "home-skin-prompt-button home-skin-prompt-button--primary";

  goButton.textContent =
    "꾸미러 가기";

  goButton.addEventListener(
    "click",
    onGoToStudio
  );

  actions.appendChild(
    goButton
  );


  return overlay;

}


function goToSkinStudioFromHomePrompt(
  overlayEl
) {

  try {

    sessionStorage.setItem(
      "admin-current-view",
      "skin-studio"
    );

  }

  catch (err) {

    /*
      실패해도 이동 자체는 계속 진행한다 — admin.js의
      restoreAdminView()가 이 값을 못 읽으면 그냥 admin
      홈으로 열릴 뿐, 치명적이지 않다.
    */

  }


  dismissHomeSkinPromptForSession();

  overlayEl.remove();


  window.location.href =
    `${SITE_BASE_PATH}/admin/`;

}


function dismissHomeSkinPrompt(
  overlayEl
) {

  dismissHomeSkinPromptForSession();

  overlayEl.remove();

}



/* =========================================================
   시작 — index.html의 initHomeRenderer()가 호출한다.
========================================================== */

async function initHomeSkinPrompt(
  ownerId
) {

  const shouldShow =
    await shouldShowHomeSkinPrompt(
      ownerId
    );


  if (!shouldShow) {
    return;
  }


  let overlayEl;

  overlayEl =
    buildHomeSkinPromptEl(
      () =>
        goToSkinStudioFromHomePrompt(
          overlayEl
        ),
      () =>
        dismissHomeSkinPrompt(
          overlayEl
        )
    );


  document.body.appendChild(
    overlayEl
  );

}


if (typeof window !== "undefined") {

  window.initHomeSkinPrompt =
    initHomeSkinPrompt;

}
