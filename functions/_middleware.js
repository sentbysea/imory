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

/* =========================================================
   ★ SANDBOX 스킨 — 호스트 분기 (IMORY_SANDBOX_SKIN_DESIGN.md §D-4)

   Cloudflare Pages는 한 프로젝트에 커스텀 도메인을 더 붙이면
   **같은 파일 트리를 두 호스트에서 전부** 서빙한다. 그대로 두면
     - sandbox origin에서 앱 전체가 뜨고(그 origin에 별개 세션이
       생길 수 있다),
     - 메인 origin에서 frame 문서가 열려(같은 origin이 되어)
       iframe의 `allow-scripts allow-same-origin`이 위험한 조합이
       된다.
   그 둘을 여기서 잘라 낸다. 규칙은 core/lib/skin-sandbox-server.js
   한 곳에 있다(그 파일 상단 주석에 근거와 실측이 있다).

   헬퍼를 functions/ 아래 두지 않은 이유: 그 디렉터리의 .js는
   그 자체로 공개 라우트가 된다.
========================================================== */

import {
  resolveSandboxServerConfig,
  classifyImoryHost,
  isSandboxFramePath,
  isSandboxAllowedPath,
  createSandboxNonce,
  injectSandboxNonce,
  sandboxNotFoundResponse,
  sandboxFrameHeaders
} from "../core/lib/skin-sandbox-server.js";


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


  /* =========================================================
     호스트 분기 — 어떤 origin으로 들어온 요청인가

     "unknown"은 404다(예상하지 않은 Host 헤더 거부). Pages
     프로젝트에 커스텀 도메인을 더 붙였다면 환경변수
     IMORY_EXTRA_HOSTS에 적어야 한다 — 배포 전 사람 확인 항목.
  ========================================================== */

  const sandboxConfig =
    resolveSandboxServerConfig(env);

  const hostKind =
    classifyImoryHost(url, sandboxConfig);


  if (hostKind === "unknown") {

    return sandboxNotFoundResponse();

  }


  if (hostKind === "sandbox") {

    return handleSandboxHost(
      request,
      url,
      sandboxConfig,
      next
    );

  }


  if (hostKind === "pages-dev") {

    url.hostname =
      PRODUCTION_HOST;


    return Response.redirect(
      url.toString(),
      301
    );

  }


  /*
    메인 origin에서는 frame 문서가 열리면 안 된다. `_redirects`의
    SPA fallback 때문에 이 경로도 지금은 200(index.html)으로 나간다
    — 2026-09-15 실측. 여기서 404로 막는 것이 정리정돈이 아니라
    보안 장치다(위 import 블록 주석 참고).

    같은 디렉터리의 다른 파일(skin-sandbox-config.js 등)은 막지
    않는다 — 부모(메인 origin)가 그 스크립트들을 실제로 쓴다.
  */

  if (isSandboxFramePath(url.pathname)) {

    return sandboxNotFoundResponse();

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


/* =========================================================
   handleSandboxHost(request, url, config, next)

   sandbox origin(별도 frame origin)으로 들어온 요청.

   ★ 여기서는 **앱이 뜨지 않는다.** allowlist에 없는 경로는
     전부 404다 — `/`도, `/index.html`도, 다른 스킨 파일도.
     next()를 부르면 `_redirects`의 SPA fallback이 index.html을
     200으로 돌려주므로, 판정을 next() **앞에서** 끝낸다.

   ★ frame 문서에만 CSP를 붙인다. nonce는 요청마다 새로 만들고
     같은 값을 인라인 블록과 헤더에 넣는다(core/lib/skin-sandbox-server.js).
========================================================== */

async function handleSandboxHost(
  request,
  url,
  config,
  next
) {

  if (
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {

    return sandboxNotFoundResponse();

  }


  if (!isSandboxAllowedPath(url.pathname)) {

    return sandboxNotFoundResponse();

  }


  const response =
    await next();


  if (response.status !== 200) {

    return sandboxNotFoundResponse();

  }


  /*
    허용된 스크립트 파일들. 문서가 아니므로 CSP는 붙이지 않고,
    sniffing만 막는다.
  */

  if (!isSandboxFramePath(url.pathname)) {

    const assetHeaders =
      new Headers(response.headers);

    assetHeaders.set(
      "X-Content-Type-Options",
      "nosniff"
    );

    return new Response(
      response.body,
      {
        status: 200,
        statusText: response.statusText,
        headers: assetHeaders
      }
    );

  }


  const nonce =
    createSandboxNonce();

  const html =
    injectSandboxNonce(
      await response.text(),
      nonce
    );


  return new Response(
    html,
    {
      status: 200,
      statusText: response.statusText,
      headers: sandboxFrameHeaders(
        response.headers,
        nonce,
        config.parentOrigins
      )
    }
  );

}
