/* =========================================================
   ADMIN - BACK BUTTONS / SESSION CHECK

   admin.js 분할본 중 마지막. DOM 참조와 화면 전환 함수
   (showAdminHome 등)는 admin.js에 있음(반드시 먼저
   로드돼야 함).

   내용: 각 패널의 뒤로가기 버튼, 로그인 세션 확인
   (checkSession — Google 로그인 처리 포함), 관리자 메시지
   표시.
========================================================== */


/* =========================================================
   BACK
========================================================== */

quoteBackButton
  .addEventListener(
    "click",
    () => {

      showAdminHome();

    }
  );


settingsBackButton
  .addEventListener(
    "click",
    () => {

      showAdminHome();

    }
  );


customizeBackButton
  .addEventListener(
    "click",
    () => {

      showAdminHome();

    }
  );


inquiryBackButton
  .addEventListener(
    "click",
    () => {

      showAdminHome();

    }
  );



/* =========================================================
   현재 로그인 상태 확인
========================================================== */

async function checkSession() {

  const {
    data,
    error
  } =
    await authGetSession();


  if (
    error
  ) {

    console.error(
      "session error:",
      error
    );


    showLogin();

    return;

  }


  const session =
    data.session;


  if (
    session &&
    session.user
  ) {

    showDashboard(
      session.user
    );


    /*
      SETTINGS 데이터
    */

    if (
      typeof loadAdminSettings ===
        "function"
    ) {

      await loadAdminSettings(
        session.user
      );

    }


    /*
      PRESET 데이터
    */

    if (
      typeof loadQuotePresets ===
        "function"
    ) {

      await loadQuotePresets();

    }

  }


  else {

    showLogin();

  }

}



/* =========================================================
   Google 로그인
========================================================== */

googleLoginButton
  .addEventListener(
    "click",
    async () => {

      googleLoginButton.disabled =
        true;


      loginMessage.textContent =
        "Google 로그인으로 이동 중...";


      const redirectUrl =
        `${window.location.origin}/auth/`;


      const {
        error
      } =
        await authSignInWithGoogle(
          redirectUrl
        );


      if (
        error
      ) {

        console.error(
          "Google login error:",
          error
        );


        loginMessage.textContent =
          "로그인에 실패했습니다.";


        googleLoginButton.disabled =
          false;

      }

    }
  );



/* =========================================================
   로그아웃
========================================================== */

logoutButton
  .addEventListener(
    "click",
    async () => {

      /*
        다음 로그인 때는
        HOME부터 시작.
      */

      saveCurrentAdminView(
        "home"
      );


      const {
        error
      } =
        await authSignOut();


      if (
        error
      ) {

        console.error(
          "logout error:",
          error
        );


        return;

      }


      showLogin();

    }
  );



/* =========================================================
   로그인 상태 변화 감지
========================================================== */

supabaseClient
  .auth
  .onAuthStateChange(
    (
      event,
      session
    ) => {

      if (
        session &&
        session.user
      ) {

        /*
          여기서 showAdminHome()을 하지 않는다.

          토큰 갱신이나
          브라우저 탭 복귀가 발생해도
          현재 보고 있는 화면 유지.
        */

        loginBox.hidden =
          true;


        adminDashboard.hidden =
          false;


        userEmail.textContent =
          session.user.email ||
          "";


        restoreAdminView();

      }


      else {

        showLogin();

      }

    }
  );

/* =========================================================
   시작
========================================================== */

window.addEventListener(
  "load",
  checkSession
);