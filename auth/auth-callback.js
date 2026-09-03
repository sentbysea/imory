/* =========================================================
   AUTH - OAUTH CALLBACK

   admin/admin-session.js와 index.html의 SIGN IN이 signInWithOAuth의
   redirectTo를 이 페이지로 지정한다(auth/index.html). 여기서:

   0. callback URL(query 또는 hash)에 Supabase Auth error가 있으면
      세션 조회보다 먼저 처리한다 — Before User Created Hook이
      가입을 거절한 경우 auth.users/session이 아예 생성되지 않으므로
      authGetSession()만으로는 "세션 없음"과 구분할 수 없다.
      (아래 getAuthErrorFromUrl 참고)
   1. 세션 없음 → /admin/으로 보냄(다시 로그인하도록)
   2. 세션 있음, profiles 있음(기존 회원) → complete_onboarding()이
      호출되지 않으므로 invite 사용 횟수는 소비되지 않는다.
      clearStoredInviteToken()으로 토큰을 즉시 삭제한 뒤,
      profiles.slug가 있으면 자신의 공개 홈(/<slug>)으로, slug가
      비어있는 비정상 상태라면 /admin/으로 안전하게 이동(아래
      예외 처리 참고)
   3. 세션 있음, profiles 없음:
      - admin/index.html이 `?invite=` 진입 시 sessionStorage에 저장해둔
        토큰(core/lib/invite-token.js, getStoredInviteToken())이 있으면
        함께 실어 public.get_signup_availability(p_invite_token) RPC를
        호출한다(서버가 signup_open + signup_opens_at/signup_closes_at
        기간, 그리고 닫혀 있을 때는 그 토큰의 활성/미소진/미만료까지
        함께 판정한 boolean만 반환 — is_signup_open()과 동일 기준,
        클라이언트는 날짜를 직접 비교하지 않음). 여기서는 읽기만
        할 뿐 소비하지 않는다(실제 소비는 onboarding의
        complete_onboarding()).
        === true → 토큰은 지우지 않고 /onboarding/으로 이동(거기서
        계속 쓰임)
      - false(가입 불가 확정 — signup이 닫혀 있고 그 토큰이
        invalid/expired/exhausted/inactive 중 하나라는 뜻) →
        clearStoredInviteToken()으로 토큰을 삭제하고 signOut() 후
        이 페이지에 안내만 표시(리다이렉트 없음). 삭제 전에
        get_invite_status(token)으로 더 구체적인 사유를 조회해
        보여준다(순수 안내용).
      - RPC 자체 오류(네트워크 등 일시적 오류일 수 있음) → fail
        closed로 onboarding에 보내지 않지만, 토큰도 지우지 않는다
        (재시도 가능해야 함). 일반 오류 안내만 표시(세션/가입 상태는
        건드리지 않음)

   authGetSession/authSignOut은 core/lib/auth-shared.js,
   supabaseClient는 core/lib/supabase-client.js, buildSitePath는
   core/lib/site-path.js, getStoredInviteToken은
   core/lib/invite-token.js(모두 이 파일보다 먼저 로드됨 —
   auth/index.html 순서 참고).
========================================================== */

const authStatusMessage =
  document.getElementById(
    "authStatusMessage"
  );

const authHomeLink =
  document.getElementById(
    "authHomeLink"
  );


const SIGNUP_CLOSED_MESSAGE =
  "현재 회원가입 기간이 아닙니다.<br>기존 회원은 계속 로그인할 수 있습니다.";

const GENERIC_AUTH_ERROR_MESSAGE =
  "로그인 중 문제가 발생했습니다.<br>잠시 후 다시 시도해 주세요.";


/*
  초대 토큰을 들고 왔는데 가입이 불가능한 경우, get_invite_status(token)로
  더 구체적인 사유를 보여준다(둘 다 fail-closed, 서버 측 강제력은
  없는 순수 안내용 — 실제 판정은 get_signup_availability()/
  complete_onboarding()이 각자 다시 함). 여기 없는 상태("valid")는
  get_signup_availability()가 이미 true를 반환했어야 하므로 이 분기에
  들어오지 않는다 — 혹시 그 사이 상태가 바뀌었다면 기본 문구로
  fallback한다.
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


/*
  Supabase Auth(gotrue)는 외부 provider 콜백 처리 중 에러가 나면
  redirect_to URL에 error/error_code/error_description을 query
  string과 hash fragment 양쪽 모두에 실어 보낸다(버전에 따라 둘 중
  하나만 채워질 수 있어 양쪽 다 확인). Before User Created Hook의
  거절도 이 동일한 에러 리다이렉트 경로를 탄다 — hook이 반환한
  message("signup closed")는 정확히 어떤 필드에 어떤 형태로
  실리는지 문서화되어 있지 않으므로, error_description 안에 그
  식별 문자열이 포함돼 있는지로 판정한다(gotrue가 앞에 다른 문구를
  덧붙여도 매칭되도록).
*/

function getAuthErrorFromUrl() {

  const queryParams =
    new URLSearchParams(
      window.location.search
    );

  const hashParams =
    new URLSearchParams(
      window.location.hash.replace(
        /^#/,
        ""
      )
    );

  const error =
    queryParams.get("error") ||
    hashParams.get("error");

  if (!error) {

    return null;

  }

  const errorDescription =
    queryParams.get(
      "error_description"
    ) ||
    hashParams.get(
      "error_description"
    ) ||
    "";

  return {
    error,
    errorDescription
  };

}


function showAuthFailureMessage(
  message
) {

  authStatusMessage.innerHTML =
    message;

  authHomeLink.hidden =
    false;

}


async function runAuthCallback() {

  const authError =
    getAuthErrorFromUrl();


  if (authError) {

    /*
      raw error_description(내부 Supabase 오류 detail)을 그대로
      노출하지 않도록 화면에는 절대 쓰지 않는다 — 아래 whitelist
      매핑된 고정 문구만 표시.
    */

    history.replaceState(
      null,
      "",
      window.location.pathname
    );


    const isSignupClosed =
      authError.errorDescription
        .toLowerCase()
        .includes(
          "signup closed"
        );


    showAuthFailureMessage(
      isSignupClosed
        ? SIGNUP_CLOSED_MESSAGE
        : GENERIC_AUTH_ERROR_MESSAGE
    );


    return;

  }


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

    return;

  }


  const user =
    data.session.user;


  const {
    data: profile,
    error: profileError
  } =
    await supabaseClient
      .from(
        "profiles"
      )
      .select(
        "slug"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (profileError) {

    console.error(
      "profile lookup error:",
      profileError
    );


    authStatusMessage.textContent =
      "로그인 확인 중 오류가 발생했습니다.";


    return;

  }


  if (profile) {

    /*
      기존 회원 — complete_onboarding()이 호출되지 않으므로 invite
      사용 횟수는 소비되지 않는다. 토큰이 남아있으면 다음 로그인 때도
      계속 실려다니게 되므로 여기서 즉시 지운다.
    */

    clearStoredInviteToken();


    /*
      정상 흐름에서는 slug가 항상 있어야 하지만(complete_onboarding()
      RPC가 필수로 채움), 비정상적으로 비어있는 경우 타인의 홈이나
      /undefined로 보내지 않도록 /admin/으로 안전하게 fallback한다.
    */

    window.location.href =
      profile.slug
        ? buildSitePath(
            profile.slug,
            "/"
          )
        : "../admin/";

    return;

  }


  /*
    가입 가능 여부는 항상 서버 판정(public.is_signup_open())을
    그대로 재사용하는 이 RPC 하나로만 확인한다 — signup_opens_at/
    signup_closes_at을 클라이언트가 직접 받아서 비교하지 않는다
    (브라우저 시각 미사용, Hook/complete_onboarding()과 동일 기준).

    admin/index.html이 `?invite=` 진입 시 sessionStorage에 저장해둔
    토큰(core/lib/invite-token.js)이 있으면 함께 넘긴다 — 가입
    기간이 열려 있으면 서버가 어차피 무시하고, 닫혀 있으면 그
    토큰이 활성/미소진/미만료 상태일 때만 true를 반환한다. 여기서는
    아직 읽기만 할 뿐 소비하지 않는다(실제 소비는
    complete_onboarding()).
  */

  const inviteToken =
    getStoredInviteToken();

  const {
    data: isAvailable,
    error: availabilityError
  } =
    await supabaseClient
      .rpc(
        "get_signup_availability",
        {
          p_invite_token:
            inviteToken
        }
      );


  if (availabilityError) {

    console.error(
      "signup availability check error:",
      availabilityError
    );


    /*
      fail closed: RPC 자체가 실패한 경우 신규 사용자를 onboarding으로
      보내지 않는다. 다만 이게 "가입 기간이 아님"을 의미하는 건 아니므로
      signOut()도 하지 않고(profile lookup 오류 처리와 동일하게) 일반
      오류 안내만 표시한다.
    */

    authStatusMessage.textContent =
      "로그인 확인 중 오류가 발생했습니다.";


    return;

  }


  if (!isAvailable) {

    await authSignOut();


    /*
      가입 불가 확정 — signup이 닫혀 있고(열려 있었다면 토큰 유무와
      무관하게 isAvailable이 true였을 것) 이 토큰이
      invalid/expired/exhausted/inactive 중 하나라는 뜻이다. 더 이상
      쓸 수 없는 게 확정됐으므로 여기서 삭제한다(아래 get_invite_status
      조회는 위에서 이미 읽어둔 inviteToken 변수를 쓰므로 영향 없음).
    */

    clearStoredInviteToken();


    /*
      초대 토큰을 들고 왔었다면 get_invite_status(token)으로 더
      구체적인 사유를 보여준다. 이 조회 자체가 실패하거나(네트워크
      오류 등) 알 수 없는 상태를 반환하면 기본 문구로 fallback한다
      (fail closed — 어느 쪽이든 가입은 이미 막힌 상태).
    */

    let unavailableMessage =
      "현재 가입을 받지 않습니다.";


    if (inviteToken) {

      const {
        data: inviteStatus
      } =
        await supabaseClient
          .rpc(
            "get_invite_status",
            {
              p_token:
                inviteToken
            }
          );


      if (
        inviteStatus &&
        INVITE_STATUS_MESSAGES[
          inviteStatus
        ]
      ) {

        unavailableMessage =
          INVITE_STATUS_MESSAGES[
            inviteStatus
          ];

      }

    }


    authStatusMessage.textContent =
      unavailableMessage;


    return;

  }


  window.location.href =
    "../onboarding/";

}


runAuthCallback();
