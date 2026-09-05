/* =========================================================
   INVITE — 초대 링크 전용 진입 화면

   imory-ops에서 발급하는 초대 링크는 `/invite/?invite=<token>`
   형태로 이 페이지를 가리킨다(이전에는 `/admin/?invite=`였으나,
   일반 회원용 admin 로그인 화면에 초대 안내 없이 바로 떨어지는
   문제가 있어 분리했다 — admin/index.html은 하위호환을 위해
   invite 캡처 로직을 그대로 유지한다).

   흐름: 이 화면(초대로 왔으니 가입 가능하다는 안내) → Google 로그인
   → auth/auth-callback.js(기존 회원이면 자기 홈, 신규면 온보딩으로
   분기 — 이 파일은 그 분기 로직을 건드리지 않는다) → 온보딩 완료 →
   자기 홈페이지.

   여기서 하는 일은 안내 문구 표시뿐이다 — 실제 가입 가능 여부/
   토큰 유효성 판정은 항상 서버(get_signup_availability(),
   get_invite_status())가 하고, complete_onboarding()에서 다시
   원자적으로 재검증된다(이 화면의 판정에는 서버 강제력이 없음).
   토큰 원문은 core/lib/invite-token.js가 sessionStorage로만
   옮기고 URL에서 즉시 지운다.
========================================================== */

const inviteMessage =
  document.getElementById(
    "inviteMessage"
  );

const googleLoginButton =
  document.getElementById(
    "googleLoginButton"
  );

const inviteStatusMessage =
  document.getElementById(
    "inviteStatusMessage"
  );

const inviteHomeLink =
  document.getElementById(
    "inviteHomeLink"
  );


/*
  auth/auth-callback.js의 INVITE_STATUS_MESSAGES와 같은 4개
  문구다. 별도 파일로 공유하기엔 작은 상수라 각 화면에 맞게
  그대로 둔다(auth-callback.js는 "가입 불가 확정" 후 안내,
  이 화면은 "가입 시도 전" 안내로 쓰임새가 다름).
*/

const INVITE_STATUS_MESSAGES =
  {

    expired:
      "초대 링크가 만료되었습니다.",

    exhausted:
      "초대 링크의 사용 가능 횟수를 모두 사용했습니다.",

    inactive:
      "더 이상 사용할 수 없는 초대 링크입니다.",

    invalid:
      "유효하지 않은 초대 링크입니다."

  };


async function renderInviteAvailability() {

  captureInviteTokenFromUrl();

  const token =
    getStoredInviteToken();


  if (!token) {

    inviteMessage.innerHTML =
      "유효한 초대 링크가 아닙니다.<br>기존 회원은 아래 버튼으로 로그인할 수 있어요.";

    inviteHomeLink.hidden =
      false;

    return;

  }


  const {
    data: isAvailable,
    error
  } =
    await supabaseClient
      .rpc(
        "get_signup_availability",
        {
          p_invite_token:
            token
        }
      );


  if (error) {

    console.error(
      "signup availability check error:",
      error
    );

    inviteMessage.innerHTML =
      "확인 중 오류가 발생했습니다.<br>잠시 후 다시 시도해 주세요.";

    return;

  }


  if (isAvailable) {

    inviteMessage.textContent =
      "초대 링크를 통해 오셨습니다 — 지금 가입할 수 있어요!";

    return;

  }


  /*
    isAvailable === false — signup이 닫혀 있고 이 토큰이
    invalid/expired/exhausted/inactive 중 하나라는 뜻(신규
    가입은 불가). 다만 기존 회원 로그인 자체는 이 판정과
    무관하므로 버튼은 그대로 둔다(auth-callback.js가 로그인 후
    기존 회원이면 알아서 자기 홈으로 보낸다).
  */

  let reasonMessage =
    "이 초대 링크로는 가입할 수 없습니다.";

  const {
    data: inviteStatus
  } =
    await supabaseClient
      .rpc(
        "get_invite_status",
        {
          p_token:
            token
        }
      );

  if (
    inviteStatus &&
    INVITE_STATUS_MESSAGES[
      inviteStatus
    ]
  ) {

    reasonMessage =
      INVITE_STATUS_MESSAGES[
        inviteStatus
      ];

  }

  inviteMessage.innerHTML =
    `${reasonMessage}<br>기존 회원은 아래 버튼으로 로그인할 수 있어요.`;

}


googleLoginButton.addEventListener(
  "click",
  async () => {

    googleLoginButton.disabled =
      true;

    inviteStatusMessage.textContent =
      "Google 로그인으로 이동 중...";


    const redirectUrl =
      `${window.location.origin}/auth/`;

    const { error } =
      await authSignInWithGoogle(
        redirectUrl
      );


    if (error) {

      console.error(
        "Google login error:",
        error
      );

      inviteStatusMessage.textContent =
        "로그인에 실패했습니다.";

      googleLoginButton.disabled =
        false;

    }

  }
);


renderInviteAvailability();
