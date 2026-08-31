/* =========================================================
   CORE - SITE PATH HELPERS

   공개 홈 주소가 /:slug, /:slug/post/:id, /:slug/category/:id
   경로형으로 바뀌면서, slug와 그 뒤의 나머지 경로를 다루는
   규칙이 home/site-owner.js(맨 먼저 slug를 읽어야 함)와
   posts/editor/posts-refs.js(글 라우터 — 링크 생성/파싱)
   양쪽에서 똑같이 필요해서 여기 하나로 모음.

   RESERVED_SLUGS(core/lib/reserved-slugs.js)보다 나중에,
   그리고 이 두 파일보다 먼저 로드되어야 함(index.html 순서
   참고) — /admin, /auth, /onboarding 등 실제 정적 디렉터리
   경로를 slug로 오인하지 않기 위해 RESERVED_SLUGS를 그대로
   재사용한다.
========================================================== */

const SITE_BASE_PATH =
  window.location.hostname.endsWith(".github.io")
    ? (
        "/" +
        (
          window.location.pathname
            .split("/")
            .filter(Boolean)[0] || ""
        )
      ).replace(/\/$/, "")
    : "";


function getSitePath() {

  let pathname =
    window.location.pathname;


  if (
    SITE_BASE_PATH &&
    pathname.startsWith(
      SITE_BASE_PATH
    )
  ) {

    pathname =
      pathname.slice(
        SITE_BASE_PATH.length
      ) || "/";

  }


  return pathname;

}


function getSitePathSegments() {

  return getSitePath()
    .split("/")
    .filter(Boolean);

}


/*
  경로 첫 segment를 owner slug로 해석한다. 예약어(admin 등)나
  segment 자체가 없으면(루트 "/") null — home/site-owner.js가
  이 null을 "?u= 없음"이었던 예전의 무필터 상태와 동일하게
  취급한다.
*/

function getSiteOwnerSlugFromPath() {

  const first =
    getSitePathSegments()[0] ||
    null;


  if (
    !first ||
    RESERVED_SLUGS.includes(
      first
    )
  ) {

    return null;

  }


  return first;

}


/*
  slug 다음에 이어지는 나머지 경로("/post/5", "/category/3",
  slug만 있으면 "/")를 돌려준다. posts-router-init.js의
  handlePostRoute가 이 값을 /post/:id, /category/:id 패턴과
  매칭하므로, slug 유무와 무관하게 항상 slug를 뗀 경로를 줘야
  한다.
*/

function getSitePathAfterSlug() {

  const segments =
    getSitePathSegments();


  if (
    segments.length &&
    !RESERVED_SLUGS.includes(
      segments[0]
    )
  ) {

    segments.shift();

  }


  return (
    "/" +
    segments.join(
      "/"
    )
  );

}


/*
  slug + 그 뒤에 이어붙일 경로를 최종 pathname으로 합친다.
  slug가 없으면(무필터 배포) subPath만 그대로 쓴다.
*/

function buildSitePath(
  slug,
  subPath = "/"
) {

  const normalizedSubPath =
    subPath.startsWith("/")
      ? subPath
      : `/${subPath}`;


  if (!slug) {

    return (
      `${SITE_BASE_PATH}${normalizedSubPath}` ||
      "/"
    );

  }


  const suffix =
    normalizedSubPath === "/"
      ? ""
      : normalizedSubPath;


  return (
    `${SITE_BASE_PATH}/${slug}${suffix}` ||
    "/"
  );

}
