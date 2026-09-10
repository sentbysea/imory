/* =========================================================
   POST COVER URL (GALLERY-1 후속)

   글 대표 이미지 / 카테고리 비밀글 지정 이미지의 **주소를 만드는
   유일한 곳**과, 소유자의 <img> 요청이 권한을 증명하는 방법.

   기준 문서: IMORY_GALLERY1_DESIGN.md §3-5
   서버: functions/api/post-cover.js
   DB:   supabase/migrations/20260911100000_post_covers_private_access.sql

   ★ 주소에 파일 위치가 없다

   'post-covers'는 비공개 버킷이라 공개 주소 자체가 없다. 화면이 쓰는
   주소는 **글 id를 가리키는 우리 도메인 경로** 하나다:

     /api/post-cover?post=<글 id>
     /api/post-cover?category=<카테고리 id>

   그래서 목록 응답에도 DOM에도 파일 주소가 실리지 않고, 이 주소를
   그대로 다시 요청해도 그때의 공개 상태와 권한을 서버가 다시 본다.
   "예전에 알던 주소"라는 것이 성립하지 않는다.

   ★ 왜 쿠키를 쓰는가

   <img>는 Authorization 헤더를 실을 수 없다. 소유자가 자기
   비공개 글의 사진(작성 폼 미리보기, 갤러리 카드)을 보려면 요청에
   본인임을 실을 방법이 필요하다. 그래서 로그인 상태에서 access
   token을 **경로가 /api/post-cover로 제한된** 쿠키에 넣어 둔다.

     Path=/api/post-cover  이 엔드포인트 외에는 아무 데도 가지 않는다
     SameSite=Strict       다른 사이트에서 시작한 요청에는 실리지 않는다
     Secure(https일 때)    평문으로 나가지 않는다
     Max-Age=토큰 만료까지  토큰보다 오래 남지 않는다

   주소(query string)에 토큰을 넣지 않은 이유는 분명하다 — 주소는
   복사되고, 공유되고, Referer와 로그에 남는다. 그러면 "권한 확인을
   우회하는 URL"을 다시 만드는 셈이다. 쿠키는 그 브라우저 밖으로
   나가지 않는다.

   토큰 자체는 이미 localStorage에 있는 값과 같다(supabase-js 세션).
   새로 만드는 비밀이 아니고, 서버는 이 값을 검증하지 않고 그대로
   Supabase에 넘긴다 — 서명/만료 판정은 DB가 한다.

   classic script. core/lib/supabase-client.js **뒤에** 로드된다
   (index.html / admin/index.html).
========================================================== */

const POST_COVER_ENDPOINT =
  "/api/post-cover";

const POST_COVER_TOKEN_COOKIE =
  "imory_cover_at";


/* 서버(functions/api/post-cover.js)의 검사와 같은 모양 */

const POST_COVER_TOKEN_PATTERN =
  /^[A-Za-z0-9._-]{20,4096}$/;


function writePostCoverCookie(
  value,
  maxAgeSeconds
) {

  const attributes =
    [
      `${POST_COVER_TOKEN_COOKIE}=${value}`,
      `Path=${POST_COVER_ENDPOINT}`,
      "SameSite=Strict",
      `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
    ];


  /*
    http(로컬 개발/테스트)에서는 Secure를 붙이면 쿠키가 아예 저장되지
    않는다 — 실제 배포는 항상 https라 이 분기는 개발 환경 전용이다.
  */

  if (location.protocol === "https:") {

    attributes.push("Secure");

  }


  document.cookie =
    attributes.join("; ");

}


function clearPostCoverCookie() {

  writePostCoverCookie(
    "",
    0
  );

}


/*
  세션이 있으면 쿠키를 맞추고, 없으면 지운다. 실패해도 조용히 넘어간다 —
  이 쿠키가 없으면 공개 글의 사진만 보일 뿐 화면이 깨지지는 않는다.
*/

async function syncPostCoverTokenCookie(
  session
) {

  try {

    let current =
      session;


    if (current === undefined) {

      const {
        data
      } =
        await supabaseClient
          .auth
          .getSession();


      current =
        data ? data.session : null;

    }


    const token =
      current && typeof current.access_token === "string"
        ? current.access_token
        : null;


    if (
      !token ||
      !POST_COVER_TOKEN_PATTERN.test(token)
    ) {

      clearPostCoverCookie();


      return;

    }


    /*
      토큰보다 쿠키가 오래 살 이유가 없다. expires_at을 모르면
      짧게(10분) 잡는다 — supabase-js가 갱신할 때마다
      onAuthStateChange로 다시 여기 온다.
    */

    const expiresAt =
      Number(current.expires_at);

    const remaining =
      Number.isFinite(expiresAt)
        ? expiresAt - Math.floor(Date.now() / 1000)
        : 600;


    if (remaining <= 0) {

      clearPostCoverCookie();


      return;

    }


    writePostCoverCookie(
      token,
      remaining
    );

  }

  catch (err) {

    /* 쿠키를 못 세워도 공개 사진은 그대로 보인다 */

    console.warn(
      "[post-cover-url] 쿠키 동기화 실패:",
      err
    );

  }

}


/*
  대표 이미지를 그리는 경로들은 이 promise를 기다린 뒤에 <img>를
  만든다 — 쿠키가 서기 전에 소유자의 비공개 글 사진을 요청하면
  그 한 장이 404로 끝나기 때문이다. 공개 글에는 영향이 없다.
*/

const imoryPostCoverCookieReady =
  syncPostCoverTokenCookie();


try {

  supabaseClient
    .auth
    .onAuthStateChange(
      (_event, session) => {

        /*
          session이 비어 있는 이벤트에서도 곧장 지우지 않고 다시
          읽는다 — 이벤트가 세션을 싣지 않는 경우(초기 이벤트 등)와
          실제 로그아웃을 getSession() 결과로만 구분한다.
        */

        syncPostCoverTokenCookie(
          session || undefined
        );

      }
    );

}

catch (err) {

  console.warn(
    "[post-cover-url] 인증 상태 구독 실패:",
    err
  );

}


/* =========================================================
   주소 만들기

   bust: 방금 저장한 사진을 폼에 다시 그릴 때처럼 "같은 주소인데
   내용이 바뀐" 순간에만 쓴다. 서버가 no-cache + ETag를 주므로
   평소에는 필요 없다.
========================================================== */

function buildPostCoverUrl(
  postId,
  options
) {

  if (
    postId === null ||
    postId === undefined ||
    postId === ""
  ) {

    return null;

  }


  const bust =
    options && options.bust
      ? `&v=${encodeURIComponent(String(options.bust))}`
      : "";


  return (
    `${POST_COVER_ENDPOINT}?post=${encodeURIComponent(String(postId))}${bust}`
  );

}


function buildCategoryCoverUrl(
  categoryId,
  options
) {

  if (
    categoryId === null ||
    categoryId === undefined ||
    categoryId === ""
  ) {

    return null;

  }


  const bust =
    options && options.bust
      ? `&v=${encodeURIComponent(String(options.bust))}`
      : "";


  return (
    `${POST_COVER_ENDPOINT}?category=${encodeURIComponent(String(categoryId))}${bust}`
  );

}
