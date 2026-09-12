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
   글 뷰어 도구 / 하이라이팅 진입 계약 (HIGHLIGHT-1)

   글 읽기 화면 오른쪽 위의 점 세 개(⋮)가 여는 도구 메뉴와, 그 안의
   "하이라이팅 모드"다. ?manage=1 / ?write=1 / ?edit=1과 같은 결의
   **요청 쿼리**이고 권한이 아니다 — 받는 쪽(posts/view/
   posts-view-tools-menu.js)이 주인장인지 다시 확인해서 정한다.

   - /:slug/post/:id?tools=1     : 도구 메뉴를 연 채로 글을 연다
   - /:slug/post/:id?highlight=1 : 하이라이팅 모드로 글을 연다(주인장만)

   ★ 왜 주소에 남기는가

   스킨이 자기 자리에 도구 버튼을 그릴 수 있어야 하기 때문이다
   (요구사항 10). 스킨이 그릴 수 있는 것은 <a href>뿐이고(새니타이저가
   button/onclick을 지운다, skin/skin-sanitize.js), 그 링크가 무엇을
   뜻하는지 플랫폼이 알아보는 방법이 이 쿼리다 — EDIT/WRITE를 알아보는
   방법(skin/skin-owner-entry.js)과 정확히 같다.

   ?highlight=1은 주인장 전용 요청이라 방문자가 주소를 직접 쳐도 그냥
   평소의 읽기 화면이 나오고 주소가 정리된다.
========================================================== */

const SITE_TOOLS_QUERY_PARAM =
  "tools";


const SITE_HIGHLIGHT_QUERY_PARAM =
  "highlight";


function buildSiteToolsUrl(
  path
) {

  return (
    path + "?" + SITE_TOOLS_QUERY_PARAM + "=1"
  );

}


function isSiteToolsRequested(
  search
) {

  return siteQueryFlagIsSet(
    search,
    SITE_TOOLS_QUERY_PARAM
  );

}


function buildSiteHighlightUrl(
  path
) {

  return (
    path + "?" + SITE_HIGHLIGHT_QUERY_PARAM + "=1"
  );

}


function isSiteHighlightRequested(
  search
) {

  return siteQueryFlagIsSet(
    search,
    SITE_HIGHLIGHT_QUERY_PARAM
  );

}


/* =========================================================
   메모 카테고리 경로 (HIGHLIGHT-1 §7)

   여러 원본 글 카테고리에서 만들어진 하이라이트 카드를 한 화면에
   모아 보는 곳. 새 쿼리가 아니라 새 경로다 — 카테고리/글과 나란한
   독립 화면이고, 주소를 공유하거나 새로고침해도 같은 화면이 나와야
   하기 때문이다.

     /:slug/memos                  전체 보기
     /:slug/memos/category/:id     그 원본 카테고리의 카드 목록
                                   (여기서 "폴더" = 원본 글의 카테고리)

   보기 방식(전체/폴더별)은 경로가 가르고, 별도의 중첩 폴더 시스템은
   만들지 않는다(요구사항 7).
========================================================== */

const SITE_MEMOS_SUBPATH =
  "/memos";


function buildSiteMemosPath(
  slug,
  categoryId
) {

  const suffix =
    categoryId === undefined ||
    categoryId === null ||
    categoryId === ""
      ? SITE_MEMOS_SUBPATH
      : `${SITE_MEMOS_SUBPATH}/category/${categoryId}`;


  return buildSitePath(
    slug,
    suffix
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


/* =========================================================
   갤러리 페이지 이동 계약 (GALLERY-1)

   갤러리 카테고리의 몇 번째 페이지를 보고 있는지를 나르는 쿼리
   하나(?page=N). 경로는 /:slug/category/:id 그대로다 — 새 경로를
   만들지 않는 것은 ?manage=1 / ?series=1과 같은 이유다.

   1페이지는 쿼리를 붙이지 않는다(정규 주소). 그래야 같은 화면에
   주소가 두 가지 생기지 않고, 기존 카테고리 링크(스킨/메뉴/
   navigation.categories)가 그대로 1페이지를 가리킨다.

   ?series=1과 마찬가지로 권한 요청이 아니라 **읽기 위치**라
   소유자/방문자 모두에게 같이 동작한다. 주소에 남으므로 새로고침·
   공유·뒤로가기가 페이지까지 일치한다.

   범위를 벗어난 값(0, 음수, 숫자 아님, 마지막 페이지 초과)은 여기서
   막지 않는다 — 실제 글 수를 아는 쪽(skin/skin-context.js의
   페이지 계산)이 유효 범위로 맞추고, 화면을 그린 쪽이 주소를
   정정한다(posts/view/posts-view-list.js).
========================================================== */

const SITE_PAGE_QUERY_PARAM =
  "page";


function buildSiteCategoryPageUrl(
  path,
  page
) {

  const numeric =
    Number(page);


  if (
    !Number.isFinite(numeric) ||
    numeric <= 1
  ) {

    return path;

  }


  return (
    path + "?" + SITE_PAGE_QUERY_PARAM + "=" + Math.floor(numeric)
  );

}


/*
  주소에서 읽어낸 "요청된 페이지 번호". 없거나 해석할 수 없으면
  1이다 — 호출자가 매번 방어 코드를 쓰지 않게 여기서 정규화한다.
*/

function getSiteRequestedPage(
  search
) {

  try {

    const raw =
      new URLSearchParams(
        search || ""
      ).get(
        SITE_PAGE_QUERY_PARAM
      );


    if (!raw || !/^\d+$/.test(raw)) {

      return 1;

    }


    const numeric =
      Number(raw);


    return (
      numeric >= 1
        ? numeric
        : 1
    );

  }

  catch (err) {

    return 1;

  }

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
