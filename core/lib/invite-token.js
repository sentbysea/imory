/* =========================================================
   CORE - INVITE TOKEN (sessionStorage)

   초대 링크는 `/admin/?invite=<token>` 형태로 들어온다(운영자가
   imory-ops에서 발급). admin/index.html이 페이지 로드 즉시
   captureInviteTokenFromUrl()을 호출해 query string의 원문
   토큰을 sessionStorage로 옮기고 history.replaceState로 URL에서
   제거한다 — 새로고침/공유/브라우저 히스토리로 토큰이 남아있는
   화면이 재노출되지 않게 하기 위함(정책: "초대 토큰 원문을
   불필요하게 로그나 화면에 노출하지 않는다").

   admin/admin-session.js·invite/invite.js의 Google 로그인 버튼은
   sessionStorage에 저장된 토큰을 signInWithOAuth의 redirectTo
   query string(`/auth/?invite=<token>`)에도 함께 실어 보낸다 —
   Supabase Auth가 redirectTo의 query string은 그대로 두고 뒤에
   #access_token=... 해시만 붙여 돌려주므로, 인앱 브라우저(트위터/
   인스타그램 등)가 Google OAuth를 별도 브라우저 컨텍스트로 넘기며
   sessionStorage를 비우는 경우에도 토큰이 살아남는다. auth-callback.js는
   도착 즉시 captureInviteTokenFromUrl()을 한 번 더 호출해 이 값을
   sessionStorage로 회수한다(정상적으로 sessionStorage가 유지된
   경우엔 같은 값을 한 번 더 쓸 뿐 무해함).

   이후 흐름:
     - auth/auth-callback.js: getStoredInviteToken()으로 읽어
       get_signup_availability(token) 사전확인에 쓴다(소비 아님).
       판정 결과에 따라 토큰을 이렇게 처리한다:
         · profiles가 이미 있는 기존 회원 → complete_onboarding()
           자체를 호출하지 않으므로(사용 횟수 미소비)
           clearStoredInviteToken()으로 즉시 삭제하고 자기 홈으로
           이동한다.
         · 신규 사용자 + 가입 가능(true) → 토큰을 지우지 않고
           onboarding으로 이동한다(아래 onboarding 흐름에서 계속
           사용).
         · 가입 불가 확정(false — signup closed이고 그 토큰이
           invalid/expired/exhausted/inactive) →
           clearStoredInviteToken()으로 삭제한다.
         · get_signup_availability() 자체가 실패(네트워크/RPC 오류)
           → fail closed로 onboarding에 보내지 않지만, 일시적
           오류일 수 있으므로 토큰은 지우지 않는다(재시도 가능해야
           함).
     - onboarding/onboarding.js: getStoredInviteToken()을
       complete_onboarding(p_invite_token)에 그대로 전달한다.
         · RPC 성공 → clearStoredInviteToken().
         · "invalid invite"(원자적 검증 실패로 확정) →
           clearStoredInviteToken().
         · 그 외 오류(닉네임/슬러그 형식, 네트워크 등 재시도로
           해결되거나 invite 상태와 무관한 오류) → 토큰을 지우지
           않는다(재시도 가능해야 함).

   sessionStorage 자체가 이미 탭 종료 시 사라지고 다른 탭과
   공유되지 않으므로, 여기서 별도의 만료 처리를 하지 않는다 —
   실제 유효성/만료/소진 여부는 항상 서버(get_signup_availability,
   complete_onboarding)가 판정한다(이 파일은 값을 옮겨 담을 뿐,
   어떤 검증도 하지 않는다).
========================================================== */

const INVITE_TOKEN_STORAGE_KEY =
  "imory:inviteToken";


function captureInviteTokenFromUrl() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const token =
    params.get(
      "invite"
    );


  if (!token) {

    return;

  }


  try {

    sessionStorage.setItem(
      INVITE_TOKEN_STORAGE_KEY,
      token
    );

  } catch (storageError) {

    console.error(
      "invite token storage error:",
      storageError
    );

  }


  params.delete(
    "invite"
  );

  const remainingQuery =
    params.toString();

  const cleanUrl =
    window.location.pathname +
    (
      remainingQuery
        ? `?${remainingQuery}`
        : ""
    ) +
    window.location.hash;

  history.replaceState(
    null,
    "",
    cleanUrl
  );

}


function getStoredInviteToken() {

  try {

    return sessionStorage.getItem(
      INVITE_TOKEN_STORAGE_KEY
    );

  } catch (storageError) {

    console.error(
      "invite token read error:",
      storageError
    );

    return null;

  }

}


function clearStoredInviteToken() {

  try {

    sessionStorage.removeItem(
      INVITE_TOKEN_STORAGE_KEY
    );

  } catch (storageError) {

    console.error(
      "invite token clear error:",
      storageError
    );

  }

}
