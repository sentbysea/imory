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


/* =========================================================
   관리 진입 계약 (PHASE 1E)

   소유자가 "이 카테고리를 관리하겠다"고 명시적으로 고른 진입과,
   그냥 카테고리를 구경하는 진입을 구분하는 최소 계약. 새 경로를
   만들지 않고 기존 카테고리 경로에 쿼리 하나(?manage=1)만 붙인다 —
   /:slug/category/:id 는 그대로 두고 라우터/링크 파싱도 기존 패턴을
   재사용한다.

   이 쿼리는 "관리 화면을 열어달라"는 요청일 뿐 권한이 아니다.
   실제로 열지 말지는 요청을 받은 쪽(posts/view/posts-view-list.js의
   openCategoryPage)이 isSiteOwnerSignedIn()으로 다시 판단한다 —
   주소를 직접 쳐서 들어온 방문자는 그냥 평소의 카테고리 화면을
   본다.
========================================================== */

const SITE_MANAGE_QUERY_PARAM =
  "manage";


function buildSiteManageUrl(
  path
) {

  return (
    path + "?" + SITE_MANAGE_QUERY_PARAM + "=1"
  );

}


function isSiteManageRequested(
  search
) {

  return siteQueryFlagIsSet(
    search,
    SITE_MANAGE_QUERY_PARAM
  );

}


/* =========================================================
   작성/수정 진입 계약

   "글을 쓰겠다"/"이 글을 고치겠다"는 관리 목록을 구경하는 것과
   다른 요청이다. 예전에는 WRITE도 ?manage=1(카테고리 관리 목록)로
   보내고 거기서 + 를 한 번 더 누르게 했는데, 실사용자가 WRITE를
   누르는 이유는 바로 쓰기 위해서지 옛 목록 화면을 보기 위해서가
   아니다. 그래서 관리와 구분되는 쿼리 두 개를 더 둔다 — 경로는
   여전히 기존 세 패턴 그대로다.

   - /:slug/?write=1            : 대상 카테고리가 아직 없는 작성 요청
                                  (여러 개면 고르게, 하나면 바로,
                                   없으면 안내)
   - /:slug/category/:id?write=1: 그 카테고리에 새 글 작성
   - /:slug/post/:id?edit=1     : 그 글의 수정 폼

   ?manage=1과 마찬가지로 이 쿼리들도 권한이 아니라 **요청**이다 —
   실제로 열지는 받는 쪽(posts/view/posts-view-compose.js의
   startPostCompose, posts/view/posts-view-editor-load.js의
   openPostEditor)이 소유자/작성자인지 다시 확인해서 정한다. 주소를
   직접 친 방문자는 그냥 평소의 스킨 화면을 본다.
========================================================== */

const SITE_COMPOSE_QUERY_PARAM =
  "write";


const SITE_EDIT_QUERY_PARAM =
  "edit";


function buildSiteComposeUrl(
  path
) {

  return (
    path + "?" + SITE_COMPOSE_QUERY_PARAM + "=1"
  );

}


function isSiteComposeRequested(
  search
) {

  return siteQueryFlagIsSet(
    search,
    SITE_COMPOSE_QUERY_PARAM
  );

}


function buildSiteEditUrl(
  path
) {

  return (
    path + "?" + SITE_EDIT_QUERY_PARAM + "=1"
  );

}


function isSiteEditRequested(
  search
) {

  return siteQueryFlagIsSet(
    search,
    SITE_EDIT_QUERY_PARAM
  );

}


/* =========================================================
   이어읽기 진입 계약 (FOLDER-2 Series Viewer)

   폴더 페이지의 기본 화면은 **목록**이다 — 하위 폴더와 direct 글의
   제목/날짜만 보여주고 본문은 불러오지도 않는다. 글 본문을 위에서
   아래로 이어 붙인 Series Viewer는 독자가 명시적으로 고를 때만
   열린다. 그 요청을 나르는 쿼리 하나(?series=1)를 둔다 — 경로는
   /:slug/category/:cid/folder/:fid 그대로다.

   ?manage=1 / ?write=1 / ?edit=1과 달리 이건 권한 요청이 아니라
   **읽기 모드 선택**이라 소유자/방문자 모두에게 같이 동작한다.
   주소에 남으므로 새로고침·공유·뒤로가기가 모드까지 일치한다.
========================================================== */

const SITE_SERIES_QUERY_PARAM =
  "series";


function buildSiteSeriesUrl(
  path
) {

  return (
    path + "?" + SITE_SERIES_QUERY_PARAM + "=1"
  );

}


function isSiteSeriesRequested(
  search
) {

  return siteQueryFlagIsSet(
    search,
    SITE_SERIES_QUERY_PARAM
  );

}


/*
  위 세 계약이 공유하는 파싱 — 잘못된 search 문자열이 와도
  예외 대신 false로 떨어뜨린다(기존 isSiteManageRequested의
  try/catch를 그대로 옮긴 것).
*/

function siteQueryFlagIsSet(
  search,
  param
) {

  try {

    return (
      new URLSearchParams(
        search || ""
      ).get(
        param
      ) === "1"
    );

  }

  catch (err) {

    return false;

  }

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
