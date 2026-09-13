/* =========================================================
   PAGES FUNCTION - pages.dev → imory.me REDIRECT
                    + 공개 글 주소의 공유 카드 meta 주입

   Production 도메인은 https://imory.me만 노출한다. Cloudflare
   Pages는 커스텀 도메인을 붙여도 기본 *.pages.dev 서브도메인이
   항상 같이 살아있고, 그 pages.dev 도메인은 우리 zone이 아니라
   Cloudflare가 소유한 공용 도메인이라 zone 단위 Redirect Rules/
   Bulk Redirects로는 가로챌 수 없다 — Pages Function만 모든
   요청(커스텀 도메인 포함)을 가로챌 수 있어서 여기서 처리한다.

   _redirects(SPA fallback)보다 먼저 실행되고, pages.dev가
   아니면 그대로 next()로 넘겨서 원래 흐름(정적 파일 서빙 →
   _redirects)을 그대로 탄다.

   ★ 공유 카드 meta (IMORY_SHARE_CARD_DESIGN.md)

   이 사이트는 `_redirects`의 `/* /index.html 200` 한 줄로 모든
   경로가 같은 index.html을 받는다. 그래서 X 크롤러가
   /:slug/post/:id 를 받아가면 **사이트 기본 meta**만 보고,
   글 제목도 대표 이미지도 알 수 없었다. 크롤러는 JS를 실행하지
   않으므로 클라이언트에서 meta를 고쳐도 소용이 없다.

   그래서 글 주소로 들어온 HTML 응답에만, 서버에서 그 글의
   og/twitter meta를 끼워 넣는다(functions/api/og/post.js의
   injectShareCardMeta). 글이 아닌 주소·HTML이 아닌 응답은
   손대지 않는다 — 정적 파일 서빙 경로에 아무 비용도 추가하지
   않는다.
========================================================== */

import {
  SHARE_CARD_POST_ROUTE,
  injectShareCardMeta
} from "./api/og/post.js";


const PRODUCTION_HOST =
  "imory.me";


export async function onRequest(
  context
) {

  const {
    request,
    env,
    next
  } =
    context;

  const url =
    new URL(
      request.url
    );


  if (
    url.hostname.endsWith(
      ".pages.dev"
    )
  ) {

    url.hostname =
      PRODUCTION_HOST;


    return Response.redirect(
      url.toString(),
      301
    );

  }


  const response =
    await next();


  /*
    글 주소의 HTML 응답만 고친다. GET 외(HEAD 포함)에는 본문이
    없거나 필요하지 않고, 200이 아닌 응답과 HTML이 아닌 응답은
    그대로 흘려보낸다.
  */

  if (
    request.method !== "GET" ||
    response.status !== 200 ||
    !SHARE_CARD_POST_ROUTE.test(url.pathname) ||
    !(response.headers.get("content-type") || "").includes("text/html")
  ) {

    return response;

  }


  const html =
    await response.text();


  let injected =
    html;


  try {

    injected =
      await injectShareCardMeta(
        html,
        env,
        url
      );

  }

  catch (err) {

    /*
      조회가 실패해도 페이지는 그대로 나가야 한다 — 사이트 기본
      카드 meta가 index.html에 이미 적혀 있다.
    */

    injected =
      html;

  }


  /*
    본문 길이가 바뀌었으므로 원래 응답의 content-length/etag는
    더 이상 맞지 않는다. 나머지 헤더(Cache-Control 등 _headers가
    붙인 값)는 그대로 유지한다.
  */

  const headers =
    new Headers(
      response.headers
    );

  headers.delete(
    "content-length"
  );

  headers.delete(
    "etag"
  );


  /*
    이 문서의 meta는 글 제목·대표 이미지·카드 설정에 따라 바뀐다.
    `_headers`의 no-cache는 `/`와 `/index.html`에만 걸리고 slug
    동적 경로(/:slug/post/:id)까지 덮지 않으므로(그 파일 상단 주석),
    여기서 직접 재검증을 요구한다 — 제목을 고쳤는데 SNS가 옛 카드를
    계속 받아가는 일을 막는다.

    이미지 자체는 반대로 아주 길게 캐시된다(주소에 버전이 있다 —
    functions/api/og/post.js).
  */

  headers.set(
    "Cache-Control",
    "no-cache"
  );


  return new Response(
    injected,
    {
      status: 200,
      statusText: response.statusText,
      headers
    }
  );

}
