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
   2. 세션 있음, profiles 있음 → profiles.slug가 있으면 자신의
      공개 홈(/<slug>)으로, slug가 비어있는 비정상 상태라면
      /admin/으로 안전하게 이동(아래 예외 처리 참고)
   3. 세션 있음, profiles 없음:
      - app_config.signup_open === true → /onboarding/으로 이동
      - false → signOut() 후 이 페이지에 안내만 표시(리다이렉트 없음)

   authGetSession/authSignOut은 core/lib/auth-shared.js,
   supabaseClient는 core/lib/supabase-client.js, buildSitePath는
   core/lib/site-path.js(모두 이 파일보다 먼저 로드됨 —
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


  const {
    data: appConfig,
    error: appConfigError
  } =
    await supabaseClient
      .from(
        "app_config"
      )
      .select(
        "signup_open"
      )
      .eq(
        "id",
        1
      )
      .maybeSingle();


  if (
    appConfigError ||
    !appConfig?.signup_open
  ) {

    await authSignOut();


    authStatusMessage.textContent =
      "현재 가입을 받지 않습니다.";


    return;

  }


  window.location.href =
    "../onboarding/";

}


runAuthCallback();
