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


skinStudioBackButton
  .addEventListener(
    "click",
    () => {

      showAdminHome();

    }
  );


skinStudioMobileBackButton
  .addEventListener(
    "click",
    () => {

      showAdminHome();

    }
  );


/* =========================================================
   SKIN STUDIO — 내부 Top Dock의 Back -> admin으로 복귀

   studio/studio-preview.js가 #skinStudioFrame 안에서 window.parent
   (=이 admin 문서)로 STUDIO_MSG_BACK을 보낸다(Studio UI 정리
   라운드 — 바깥쪽 skinStudioBackButton은 그대로 남겨두되 CSS로
   숨겨서 이중 chrome을 없앴다, admin-shell.css 참고). 같은 origin +
   실제로 그 iframe에서 온 메시지인지까지 확인한 뒤에만
   showAdminHome()을 호출한다 — studio-preview.js의 preview-frame
   메시지 검증과 동일한 패턴.
========================================================== */

const STUDIO_MSG_BACK =
  "studio:back";


window.addEventListener(
  "message",
  (event) => {

    if (
      event.origin !== window.location.origin
    ) {
      return;
    }

    if (
      event.source !== skinStudioFrame.contentWindow
    ) {
      return;
    }

    const data =
      event.data;

    if (
      !data ||
      typeof data !== "object" ||
      data.type !== STUDIO_MSG_BACK
    ) {
      return;
    }

    showAdminHome();

  }
);



/* =========================================================
   자기 imory 홈 링크 (logout 왼쪽 "home")

   공개 홈 주소는 /:slug 경로형이고(core/lib/site-path.js),
   slug는 사람마다 다르므로 profiles에서 지금 로그인한
   user_id의 slug를 읽어 href를 만든다 — profiles는 anon에게도
   select가 열려 있어(home/site-owner.js가 같은 테이블을 그대로
   조회한다) 별도 RPC가 필요 없다.

   admin은 site-path.js를 로드하지 않으므로 base 경로는 지금
   주소(/... /admin/)에서 admin 부분만 떼어 구한다 — 루트 배포
   (imory.me/admin/)에서는 "", github.io 같은 하위 경로 배포에서는
   그 하위 경로가 그대로 남는다.

   slug가 없으면(온보딩 미완료 등) 링크를 hidden인 채로 둔다.
   빈 href는 admin 페이지 자기 자신을 다시 여는 꼴이라 더 나쁘다.
========================================================== */

let ownerHomeLinkUserId =
  null;


function buildOwnerHomeHref(
  slug
) {

  const basePath =
    window.location.pathname
      .replace(
        /\/admin\/?$/,
        ""
      );


  return (
    basePath +
    "/" +
    encodeURIComponent(
      slug
    )
  );

}


async function applyOwnerHomeLink(
  user
) {

  if (
    !ownerHomeLink ||
    !user
  ) {

    return;

  }


  /*
    토큰 갱신/탭 복귀마다 onAuthStateChange가 다시 불리므로
    같은 사용자면 다시 조회하지 않는다.
  */

  if (
    ownerHomeLinkUserId === user.id
  ) {

    return;

  }


  const {
    data,
    error
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


  if (
    error
  ) {

    console.error(
      "load owner slug error:",
      error
    );


    return;

  }


  const slug =
    data?.slug || "";


  if (
    !slug
  ) {

    return;

  }


  ownerHomeLink.href =
    buildOwnerHomeHref(
      slug
    );


  ownerHomeLink.hidden =
    false;


  ownerHomeLinkUserId =
    user.id;

}


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


    applyOwnerHomeLink(
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


      /*
        초대 토큰이 있으면 redirectTo의 query string에 실어 보낸다.
        sessionStorage만 믿으면 인앱 브라우저(트위터/인스타그램 등)가
        Google 로그인을 외부 브라우저로 넘기면서 별도 저장소 컨텍스트를
        쓰는 경우 토큰이 유실된다 — Supabase Auth가 redirectTo의 query
        string은 그대로 보존한 채 뒤에 #access_token=... 해시만 붙여
        돌려주므로, 이 값은 어떤 브라우저 전환을 거치든 살아남는다.
        auth/auth-callback.js가 도착 즉시 captureInviteTokenFromUrl()로
        다시 회수한다(core/lib/invite-token.js).
      */

      const inviteToken =
        getStoredInviteToken();

      const redirectUrl =
        inviteToken
          ? `${window.location.origin}/auth/?invite=${encodeURIComponent(inviteToken)}`
          : `${window.location.origin}/auth/`;


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


        applyOwnerHomeLink(
          session.user
        );


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