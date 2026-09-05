/* =========================================================
   ONBOARDING

   auth/auth-callback.js가 profiles 없는 신규 계정을 여기로
   보낸다. 닉네임/slug(공개 홈 주소)를 받아 complete_onboarding()
   RPC를 호출한다 — 자기소개는 온보딩 단계에서는 받지 않고
   (p_bio는 항상 null) admin 설정 화면에서 나중에 채우도록
   남겨둔다. 최종 검증(형식/예약어/중복/인증)은 전부 RPC 안에서
   다시 이뤄지므로, 여기서 하는 클라이언트 검증은 빠른
   피드백용일 뿐이다.

   getStoredInviteToken()(core/lib/invite-token.js)으로 읽은
   초대 토큰을 p_invite_token으로 그대로 전달한다 — 가입 기간이
   열려 있으면 서버가 무시하고, 닫혀 있으면 서버가 원자적으로
   검증+소비한다. clearStoredInviteToken()은 RPC 성공 시, 그리고
   "invalid invite"(그 토큰이 invalid/expired/exhausted/inactive로
   확정됐다는 뜻)로 실패한 경우에만 호출한다. 그 외 오류(닉네임/
   슬러그 검증 실패, 네트워크 등 재시도로 해결되거나 invite 상태와
   무관한 오류)는 토큰을 지우지 않는다 — 재시도할 수 있어야 한다.

   성공 후 이동 대상(AI_SKIN_PHASE1B_DESIGN.md 3절, v5): 관리자
   화면(admin/)이 아니라 방금 만든 자신의 공개 홈(/<slug>)으로
   보낸다 — auth/auth-callback.js가 기존 회원에게 이미 쓰는
   buildSitePath(slug, "/")와 동일한 목적지다. Questionnaire는
   여기 없다 — Skin이 없는 상태에서 그 홈에 도착하면
   home/home-skin-prompt.js가 뜨는 popup이 Skin Studio로
   유도한다. complete_onboarding() RPC 자체는 이 변경과 무관하게
   그대로다.

   RESERVED_SLUGS는 core/lib/reserved-slugs.js,
   supabaseClient는 core/lib/supabase-client.js,
   authGetSession은 core/lib/auth-shared.js,
   buildSitePath는 core/lib/site-path.js,
   getStoredInviteToken/clearStoredInviteToken은
   core/lib/invite-token.js
   (전부 이 파일보다 먼저 로드됨 — onboarding/index.html 참고).
========================================================== */

const onboardingNicknameInput =
  document.getElementById(
    "onboardingNicknameInput"
  );

const onboardingSlugInput =
  document.getElementById(
    "onboardingSlugInput"
  );

const onboardingSlugMessage =
  document.getElementById(
    "onboardingSlugMessage"
  );

const onboardingSlugPreview =
  document.getElementById(
    "onboardingSlugPreview"
  );

const onboardingSubmitButton =
  document.getElementById(
    "onboardingSubmitButton"
  );

const onboardingSubmitMessage =
  document.getElementById(
    "onboardingSubmitMessage"
  );


const SLUG_FORMAT =
  /^[a-z0-9]+(-[a-z0-9]+)*$/;


/* =========================================================
   세션 확인 — 여기 직접 들어온(auth 콜백을 거치지 않은)
   비로그인 방문자는 로그인 화면으로 돌려보낸다.
========================================================== */

async function guardOnboardingSession() {

  const {
    data,
    error
  } =
    await authGetSession();


  if (
    error ||
    !data.session ||
    !data.session.user
  ) {

    window.location.href =
      "../admin/";

  }

}


guardOnboardingSession();



/* =========================================================
   SLUG 형식/예약어 검증 (클라이언트 1차)
========================================================== */

function getSlugFormatError(
  slug
) {

  if (
    !slug ||
    slug.length < 3 ||
    slug.length > 30
  ) {

    return "3~30자로 입력해주세요.";

  }


  if (
    !SLUG_FORMAT.test(
      slug
    )
  ) {

    return "영문 소문자/숫자/하이픈(-)만 사용할 수 있어요.";

  }


  if (
    RESERVED_SLUGS.includes(
      slug
    )
  ) {

    return "사용할 수 없는 주소입니다.";

  }


  return null;

}



/* =========================================================
   SLUG 중복 확인 (빠른 피드백용 — 최종 판정은 RPC)
========================================================== */

let slugCheckToken =
  0;


async function checkSlugAvailability() {

  const slug =
    onboardingSlugInput
      .value
      .trim()
      .toLowerCase();


  const formatError =
    getSlugFormatError(
      slug
    );


  if (formatError) {

    onboardingSlugMessage.textContent =
      formatError;

    return;

  }


  const token =
    ++slugCheckToken;


  onboardingSlugMessage.textContent =
    "확인 중...";


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "profiles"
      )
      .select(
        "user_id"
      )
      .eq(
        "slug",
        slug
      )
      .maybeSingle();


  if (
    token !==
    slugCheckToken
  ) {

    /*
      그 사이 사용자가 또 입력을 바꿔서 더 최신 확인이
      진행 중이면, 이 낡은 응답으로 메시지를 덮어쓰지 않는다.
    */

    return;

  }


  if (error) {

    console.error(
      "slug check error:",
      error
    );


    onboardingSlugMessage.textContent =
      "";

    return;

  }


  onboardingSlugMessage.textContent =
    data
      ? "이미 사용 중인 주소입니다."
      : "사용 가능한 주소입니다.";

}


onboardingSlugInput
  ?.addEventListener(
    "blur",
    checkSlugAvailability
  );



/* =========================================================
   SLUG 실시간 미리보기 (안내용 — 저장/검증 로직과 무관)
========================================================== */

function updateSlugPreview() {

  const rawValue =
    onboardingSlugInput
      .value;


  if (!rawValue) {

    onboardingSlugPreview.textContent =
      "here♡";

    onboardingSlugPreview.classList.add(
      "onboarding-slug-preview--placeholder"
    );

    return;

  }


  onboardingSlugPreview.textContent =
    rawValue;

  onboardingSlugPreview.classList.remove(
    "onboarding-slug-preview--placeholder"
  );

}


onboardingSlugInput
  ?.addEventListener(
    "input",
    updateSlugPreview
  );



/* =========================================================
   제출
========================================================== */

function mapOnboardingError(
  error
) {

  if (
    error.code ===
    "23505"
  ) {

    return "이미 사용 중인 주소입니다.";

  }


  const knownMessages =
    {

      "not authenticated":
        "로그인이 필요합니다.",

      "profile already exists":
        "이미 등록된 계정입니다.",

      "invalid nickname":
        "닉네임을 확인해주세요.",

      "invalid slug format":
        "주소 형식을 확인해주세요(영문 소문자/숫자/하이픈, 3~30자).",

      "reserved slug":
        "사용할 수 없는 주소입니다.",

      "signup closed":
        "현재 회원가입 기간이 아닙니다.",

      "invalid invite":
        "초대 링크가 유효하지 않습니다."

    };


  return (
    knownMessages[
      error.message
    ] ||
    "저장에 실패했습니다."
  );

}


onboardingSubmitButton
  ?.addEventListener(
    "click",
    async () => {

      const nickname =
        onboardingNicknameInput
          .value
          .trim();

      const slug =
        onboardingSlugInput
          .value
          .trim()
          .toLowerCase();


      if (
        !nickname
      ) {

        onboardingSubmitMessage.textContent =
          "닉네임을 입력해주세요.";

        return;

      }


      const formatError =
        getSlugFormatError(
          slug
        );


      if (formatError) {

        onboardingSubmitMessage.textContent =
          formatError;

        return;

      }


      onboardingSubmitButton.disabled =
        true;


      onboardingSubmitMessage.textContent =
        "저장 중...";


      const {
        error
      } =
        await supabaseClient
          .rpc(
            "complete_onboarding",
            {

              p_nickname:
                nickname,

              p_slug:
                slug,

              p_bio:
                null,

              p_invite_token:
                getStoredInviteToken()

            }
          );


      if (error) {

        console.error(
          "onboarding error:",
          error
        );


        onboardingSubmitMessage.textContent =
          mapOnboardingError(
            error
          );


        /*
          invite가 invalid/expired/exhausted/inactive로 확정된
          경우에만 토큰을 지운다 — 그 외(닉네임/슬러그 검증 실패,
          네트워크 오류 등)는 재시도 가능해야 하므로 그대로 둔다.
        */

        if (
          error.message ===
          "invalid invite"
        ) {

          clearStoredInviteToken();

        }


        onboardingSubmitButton.disabled =
          false;

        return;

      }


      onboardingSubmitMessage.textContent =
        "saved ♡";


      /*
        성공했을 때만 지운다 — 실패한 시도(형식 오류, slug 중복 등)의
        토큰은 재시도할 수 있어야 하므로 그대로 남겨둔다.
      */

      clearStoredInviteToken();


      window.location.href =
        buildSitePath(
          slug,
          "/"
        );

    }
  );
