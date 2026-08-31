/* =========================================================
   ONBOARDING

   auth/auth-callback.js가 profiles 없는 신규 계정을 여기로
   보낸다. 닉네임/slug(공개 홈 주소)/자기소개를 받아
   complete_onboarding() RPC를 호출한다 — 최종 검증(형식/
   예약어/중복/인증)은 전부 그 RPC 안에서 다시 이뤄지므로,
   여기서 하는 클라이언트 검증은 빠른 피드백용일 뿐이다.

   RESERVED_SLUGS는 core/lib/reserved-slugs.js,
   supabaseClient는 core/lib/supabase-client.js,
   authGetSession은 core/lib/auth-shared.js
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

const onboardingBioInput =
  document.getElementById(
    "onboardingBioInput"
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
        "사용할 수 없는 주소입니다."

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

      const bio =
        onboardingBioInput
          .value
          .trim();


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
                bio ||
                null

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


        onboardingSubmitButton.disabled =
          false;

        return;

      }


      onboardingSubmitMessage.textContent =
        "saved ♡";


      window.location.href =
        "../admin/";

    }
  );
