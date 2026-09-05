/* =========================================================
   STUDIO PREVIEW ROUTE PARSER (PHASE 1C-G)

   Preview iframe 안의 내부 Imory 링크 클릭이 postMessage로
   parent(studio/preview/preview-navigation.js)에 전달하는 href
   문자열을, 실제 Studio Preview 이동 대상(HOME/CATEGORY/POST)으로
   해석하는 유일한 지점. 새 router framework가 아니라, 이미 존재
   하는 공개 라우트 3종(core/lib/site-path.js의 buildSitePath()가
   만드는 정확히 그 shape — /:slug, /:slug/category/:id,
   /:slug/post/:id)만 인식하는 순수 함수다.

   신뢰 경계(문서 7/24절): href는 Skin(HTML) 안의 링크에서 온
   값이라 신뢰하지 않는다 — 정확히 이 세 패턴 중 하나와 owner
   slug가 일치할 때만 값을 돌려주고, 그 외(다른 slug, 알 수 없는
   경로, 다른 origin, 숫자가 아닌 id 등)는 전부 null(무시)이다.
   DOM/Supabase에 접촉하지 않는다.

   의존: SITE_BASE_PATH(core/lib/site-path.js, github pages 배포
   시 저장소 이름 prefix) — 이 파일보다 먼저 로드되어야 함.
========================================================== */

/* =========================================================
   resolveStudioPreviewTarget(href, currentSlug)
     -> { type: "home" }
      | { type: "category", categoryId: string }
      | { type: "post", postId: string }
      | null

   href는 preview-bridge.js가 이미 same-origin으로 판단한 값이지만,
   여기서도 origin을 다시 확인한다(방어의 이중화, 문서 24절 —
   "기존 sanitizer가 막더라도 navigation layer도 별도 방어").
   categoryId/postId는 실제 라우트 제약(posts-router-init.js의
   `\d+` 매칭)과 동일하게 숫자 문자열만 허용한다.
========================================================== */

function resolveStudioPreviewTarget(href, currentSlug) {

  if (
    typeof href !== "string" ||
    !href ||
    typeof currentSlug !== "string" ||
    !currentSlug
  ) {
    return null;
  }

  let parsed;

  try {

    parsed =
      new URL(href, window.location.origin);

  } catch (err) {

    return null;

  }

  if (parsed.origin !== window.location.origin) {
    return null;
  }

  let pathname =
    parsed.pathname;

  if (
    SITE_BASE_PATH &&
    pathname.startsWith(SITE_BASE_PATH)
  ) {

    pathname =
      pathname.slice(SITE_BASE_PATH.length) || "/";

  }

  const segments =
    pathname.split("/").filter(Boolean);

  if (
    !segments.length ||
    segments[0] !== currentSlug
  ) {
    return null;
  }

  const rest =
    segments.slice(1);

  if (rest.length === 0) {
    return { type: "home" };
  }

  if (
    rest.length === 2 &&
    rest[0] === "category" &&
    /^\d+$/.test(rest[1])
  ) {
    return { type: "category", categoryId: rest[1] };
  }

  if (
    rest.length === 2 &&
    rest[0] === "post" &&
    /^\d+$/.test(rest[1])
  ) {
    return { type: "post", postId: rest[1] };
  }

  return null;

}
