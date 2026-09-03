/* =========================================================
   AUTH - OAUTH CALLBACK

   admin/admin-session.js와 index.html의 SIGN IN이 signInWithOAuth의
   redirectTo를 이 페이지로 지정한다(auth/index.html). 여기서:

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
