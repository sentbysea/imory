/* =========================================================
   AUTH - OAUTH CALLBACK

   admin/admin-session.js가 signInWithOAuth의 redirectTo를
   이 페이지로 지정한다(auth/index.html). 여기서:

   1. 세션 없음 → /admin/으로 보냄(다시 로그인하도록)
   2. 세션 있음, profiles 있음 → /admin/으로 이동
   3. 세션 있음, profiles 없음:
      - app_config.signup_open === true → /onboarding/으로 이동
      - false → signOut() 후 이 페이지에 안내만 표시(리다이렉트 없음)

   authGetSession/authSignOut은 core/lib/auth-shared.js,
   supabaseClient는 core/lib/supabase-client.js(둘 다 이 파일보다
   먼저 로드됨 — auth/index.html 순서 참고).
========================================================== */

const authStatusMessage =
  document.getElementById(
    "authStatusMessage"
  );


async function runAuthCallback() {

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
        "user_id"
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

    window.location.href =
      "../admin/";

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
