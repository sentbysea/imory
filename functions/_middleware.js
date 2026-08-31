/* =========================================================
   PAGES FUNCTION - pages.dev → imory.me REDIRECT

   Production 도메인은 https://imory.me만 노출한다. Cloudflare
   Pages는 커스텀 도메인을 붙여도 기본 *.pages.dev 서브도메인이
   항상 같이 살아있고, 그 pages.dev 도메인은 우리 zone이 아니라
   Cloudflare가 소유한 공용 도메인이라 zone 단위 Redirect Rules/
   Bulk Redirects로는 가로챌 수 없다 — Pages Function만 모든
   요청(커스텀 도메인 포함)을 가로챌 수 있어서 여기서 처리한다.

   _redirects(SPA fallback)보다 먼저 실행되고, pages.dev가
   아니면 그대로 next()로 넘겨서 원래 흐름(정적 파일 서빙 →
   _redirects)을 그대로 탄다.
========================================================== */

const PRODUCTION_HOST =
  "imory.me";


export async function onRequest(
  context
) {

  const {
    request,
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


  return next();

}
