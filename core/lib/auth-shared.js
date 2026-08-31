/* =========================================================
   CORE - AUTH SHARED

   admin/admin-session.js와 auth/auth-callback.js가 함께 쓰는
   얇은 Supabase Auth 래퍼. supabaseClient는
   core/lib/supabase-client.js에서 전역으로 만들어짐(이 파일보다
   먼저 로드되어야 함 — 각 페이지의 로드 순서 참고).

   UI 상태(버튼 disabled, 메시지 텍스트 등)는 여기서 다루지
   않는다 — 그건 호출하는 쪽(admin-session.js, auth-callback.js)
   책임.
========================================================== */

async function authGetSession() {

  return supabaseClient
    .auth
    .getSession();

}


async function authSignInWithGoogle(
  redirectTo
) {

  return supabaseClient
    .auth
    .signInWithOAuth(
      {

        provider:
          "google",

        options: {

          redirectTo:
            redirectTo

        }

      }
    );

}


async function authSignOut() {

  return supabaseClient
    .auth
    .signOut();

}
