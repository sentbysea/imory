/* =========================================================
   SKIN CONTEXT BUILDER

   AI_SKIN_PHASE1A_DESIGN.md 1절(Skin Context v0.1)의 6개
   namespace(site/profile/navigation/home/banners/images)를
   실제 Supabase 조회 결과로 채워서 돌려주는 유일한 진입점.

   Skin(html/css)은 이 파일이 만든 shape에만 의존하고, DB
   컬럼명에는 절대 의존하지 않는다 — DB 스키마가 바뀌어도
   이 파일만 고치면 기존에 저장된 Skin은 영향받지 않는다
   (PHASE1A_DESIGN.md 1절 전문).

   AI_SKIN_PHASE1C_PAGE_CONTRACT.md(Multi-page Skin Contract v0.1)
   Slice 1C-A로 HOME 전용 v0.1에서 HOME/CATEGORY/POST 세
   page.type을 모두 빌드할 수 있게 확장됐다 — 단 이 파일은 여전히
   "함수 단위" 확장일 뿐, 실제 라우트(posts/view/*)는 아직 이
   함수들을 호출하지 않는다(1C-C/1C-D에서 연결 예정).

   공통 namespace(site/profile/navigation/banners/images)는
   buildBaseSkinContext()가 만들고, page별 namespace(home/
   category/post)는 각각 buildHomeSkinContext()/
   buildCategorySkinContext()/buildPostSkinContext()가 그 위에
   얹는다. 기존 buildSkinContext()는 buildHomeSkinContext()의
   별칭으로 남아 하위 호환을 그대로 유지한다(PHASE1C 4-3절).

   의존: supabaseClient(core/lib/supabase-client.js),
   buildSitePath(core/lib/site-path.js) — 이 파일보다 먼저
   로드되어야 함. DOM에 접촉하지 않는 순수 데이터 빌더라
   index.html에서든 테스트 페이지에서든 동일하게 동작한다.

   AI_SKIN_PHASE1D_A_LIST_DATA_AUDIT.md(Slice 1D-A)로
   home.recentPosts[]/category.posts[] item에 categoryId(home만)/
   isSecret이 추가됐다 — 둘 다 이미 select하던 category_id/
   visibility에서 파생된 값이라 새 컬럼/RPC/RLS 변경이 없다.
   excerpt/thumbnail/isNotice는 안전하게 채울 source가 DB에
   아직 없어 이번 Slice에서 보류됐다(감사 문서 참고).

   AI_SKIN_PHASE1D_B_NAVIGATION_CONTRACT.md(Slice 1D-B)로
   navigation에 home{name,href,enabled}/postCategories[]/
   bannerCategories[]가 추가됐다 — home은 buildSitePath(slug, "/")
   로 조립한 기존 HOME 경로 재노출(새 source 없음), post/banner
   Categories는 기존 navigation.categories[]를 category.type으로
   필터링한 부분집합(item shape 동일)이다. categories.type이
   DB에 새로 생겨도(gallery 등) 이 필터는 자동으로 안전하게
   무시한다. 기존 navigation.categories[]는 값/순서/shape 전부
   그대로다.

   AI_SKIN_PHASE1E_BANNER_AND_OWNER_LINKS.md(PHASE 1E)로 두 가지가
   추가됐다 — 둘 다 새 DB 컬럼/RPC/RLS 없이 이미 조회하던 값에서
   파생된다:
   1. buildBannerSkinContext() + page.isBanner — banner 타입
      카테고리를 Skin template으로 그리기 위한 page context.
      데이터는 기존 fetchSkinCategoryById()/fetchSkinBanners()를
      그대로 재사용한다(새 조회 없음).
   2. viewer namespace — "지금 이 화면을 보고 있는 사람이 이
      블로그의 소유자인가"와, 소유자일 때만 채워지는 글쓰기/관리
      진입 경로. 판정은 home/home-skin-prompt.js가 이미 쓰는 것과
      동일한 기준(Supabase 세션 user.id === ownerId)이고, 실제
      작성/관리 권한 검사는 여전히 각 화면과 RLS가 한다 — 이
      필드는 "링크를 보여줄지"만 정한다.

   IMORY_GALLERY1_DESIGN.md(GALLERY-1)로 category namespace에
   listStyle/pageSize/isGallery/isList/gallery/pagination이 추가됐다.
   기존 category.posts / category.tree / hasFolders의 의미는 **갤러리를
   쓰지 않는 모든 렌더에서** 한 글자도 바뀌지 않는다 — 갤러리 모드는
   (1) 카테고리 설정이 gallery이고 (2) 렌더 중인 스킨이 category.gallery를
   실제로 그릴 때만 켜지기 때문이다(options.supportsGallery). 갤러리
   모드에서만 조회가 페이지 단위가 되고, category.tree는 폴더 노드만
   담는다(root 글은 카드 영역의 몫 — 중복 표시 방지).

   의존이 하나 늘었다: isSafeSkinUrl(skin/skin-sanitize.js) —
   banner의 외부 URL/이미지 URL을 Context 단계에서 1차로 거르는 데
   쓴다(렌더 시점 재검증은 skin-render.js가 그대로 담당).
========================================================== */

const SKIN_CONTEXT_LANGUAGE =
  "ko";

const SKIN_HOME_RECENT_POSTS_LIMIT =
  5;

/*
  avatar_url은 Settings > PROFILE PICTURE가 저장하는 값이다
  (admin/settings/admin-settings-avatar.js). Skin은 이 키를
  직접 알지 못하고 profile.avatarUrl / images.profile로만 본다
  — 아래 buildBaseSkinContext() 참고.
*/
/*
  hide_memo_entry — Settings > HOME > ETC의 "메모 진입점 숨기기".
  값은 "on"/"off" 문자열이고(다른 ETC 설정과 같은 자리), Context에는
  navigation.memos.enabled의 반대로 실린다. 스킨이 그 값을 보고 자기
  링크를 감출 수 있고, 플랫폼의 기본 진입점도 같은 값을 따른다
  (skin/skin-memo-entry.js).
*/
const SKIN_CONTEXT_SITE_SETTINGS_KEYS =
  ["blog_title", "favicon_url", "avatar_url", "hide_memo_entry"];

/*
  관리 화면 경로 — home/home-skin-prompt.js가 Skin Studio로 보낼 때
  쓰는 것과 정확히 같은 조립 방식(SITE_BASE_PATH + "/admin/")이다.
  Skin이 이 문자열을 직접 알 필요가 없도록 Context가 완성된 href만
  노출한다(요구사항 "링크 주소를 하드코딩하지 않는다").
*/
const SKIN_CONTEXT_ADMIN_SUBPATH =
  "/admin/";


/* =========================================================
   POST TITLE MASKING

   posts/posts-format.js의 applyPostVisibilityTitle과 동일한
   원칙(secret/private 앞에 아이콘)을 재사용하되, 이 파일은
   DOM을 다루지 않으므로(스킨 바인딩은 data-imory-bind →
   textContent 대입만 지원, PHASE1A_DESIGN.md 4-2절) 별도 span이
   아니라 하나의 문자열로 합쳐서 돌려준다. Skin은 visibility
   개념을 전혀 몰라도 된다 — 이미 아이콘이 섞인 최종 표시
   텍스트만 받는다.
========================================================== */

function maskSkinPostTitle(
  visibility,
  title
) {

  const icon =
    visibility === "secret"
      ? "🔒 "
      : visibility === "private"
        ? "🙈 "
        : "";


  return (
    icon +
    (title || "untitled")
  );

}


/* =========================================================
   PUBLISHED DATE LABEL

   posts/posts-format.js의 formatPostDetailDate()와 동일한 원칙
   (Intl.DateTimeFormat + timeZone: "Asia/Seoul")으로 UTC created_at을
   방문자가 실제로 보는 한국 날짜로 변환한다 — 단순 문자열 슬라이싱은
   자정 근처 UTC 시각에서 하루가 밀리는 문제가 있어 쓰지 않는다.

   publishedAt(raw ISO)은 그대로 두고 이 함수가 만든 값만
   publishedAtLabel로 별도 노출한다 — 기존 계약을 바꾸지 않기 위함
   (SKIN_DESIGNER_CONTRACT.md 2절).
========================================================== */

function formatSkinPublishedAtLabel(
  rawDate
) {

  if (!rawDate) {

    return "";

  }


  const date =
    new Date(rawDate);


  if (isNaN(date.getTime())) {

    return "";

  }


  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Seoul",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    )
      .formatToParts(date);


  const getPart =
    type =>
      parts.find(
        part =>
          part.type === type
      )?.value || "";


  const year =
    getPart("year");

  const month =
    getPart("month");

  const day =
    getPart("day");


  if (!year || !month || !day) {

    return "";

  }


  return `${year}. ${month}. ${day}`;

}


/* =========================================================
   개별 조회 헬퍼

   전부 owner의 user_id로 scope된다 — 익명 방문자가 보는
   published skin이든 소유자 본인이 보는 draft 프리뷰든
   같은 조회 로직을 쓴다(둘 다 "이 사용자의 공개 가능 데이터"만
   다루므로). RLS가 실제 접근 경계를 강제한다.
========================================================== */

async function fetchSkinProfile(
  ownerId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("profiles")
      .select("nickname, bio, slug")
      .eq("user_id", ownerId)
      .maybeSingle();


  if (error) {

    console.error(
      "[skin-context] profile 조회 실패:",
      error
    );


    return null;

  }


  return data;

}


async function fetchSkinSiteSettings(
  ownerId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("site_settings")
      .select("key, value")
      .eq("user_id", ownerId)
      .in("key", SKIN_CONTEXT_SITE_SETTINGS_KEYS);


  if (error) {

    console.error(
      "[skin-context] site_settings 조회 실패:",
      error
    );


    return {};

  }


  const settingsByKey =
    {};


  (data || []).forEach(
    (row) => {

      settingsByKey[row.key] =
        row.value;

    }
  );


  return settingsByKey;

}


async function fetchSkinCategories(
  ownerId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("categories")
      .select("id, name, type, sort_order")
      .eq("user_id", ownerId)
      .order("sort_order", { ascending: true });


  if (error) {

    console.error(
      "[skin-context] categories 조회 실패:",
      error
    );


    return [];

  }


  return data || [];

}


async function fetchSkinRecentPosts(
  ownerId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("posts")
      .select("id, title, created_at, visibility, category_id")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(SKIN_HOME_RECENT_POSTS_LIMIT);


  if (error) {

    console.error(
      "[skin-context] posts 조회 실패:",
      error
    );


    return [];

  }


  return data || [];

}


/*
  CATEGORY/POST 전용 조회 헬퍼 — posts/view/posts-view-list.js,
  posts/view/posts-view-detail.js가 실제로 select하는 컬럼과
  동일하게(id/title/created_at/visibility[/category_id]) 최소
  컬럼만 select한다. content/ooc_content/secret_password_hash는
  이 파일 어디에서도 select하지 않는다 — 본문/비밀번호는 Skin
  Context의 범위 밖이다(PHASE1C 6-1/7절).
*/

async function fetchSkinCategoryById(
  ownerId,
  categoryId
) {

  /*
    GALLERY-1: 표시 설정 컬럼은 migration이 적용된 배포에서만 존재한다.
    낙관적으로 함께 읽고, 없는 배포에서만(42703) 기본 컬럼으로 한 번
    더 읽는다 — 적용된 배포에는 추가 왕복이 전혀 없고, 적용 전 배포도
    화면이 죽지 않는다. 판정은 세션당 한 번만 하고 재사용한다.
  */

  const {
    data,
    error
  } =
    await selectSkinCategoryRow(
      ownerId,
      categoryId
    );


  if (error) {

    console.error(
      "[skin-context] category(단건) 조회 실패:",
      error
    );


    return null;

  }


  return data;

}


async function fetchSkinCategoryPosts(
  ownerId,
  categoryId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("posts")
      /*
        FOLDER-1: folder_id/sort_order를 함께 읽는다 — category.tree를
        세우는 데 필요하다. 두 컬럼 모두 SELECT GRANT에 있고
        (20260908110000_*.sql), 매핑 단계에서 category.posts item에는
        옮기지 않는다(기존 6개 키 유지).
        정렬은 지금까지와 같은 created_at DESC 그대로다 —
        category.posts의 의미가 바뀌면 폴더를 모르는 기존 스킨의
        목록 순서가 폴더 생성만으로 달라진다(사용자 결정, 설계 수정 2).
      */
      .select("id, title, created_at, visibility, folder_id, sort_order")
      .eq("user_id", ownerId)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: false });


  if (error) {

    console.error(
      "[skin-context] category posts 조회 실패:",
      error
    );


    return [];

  }


  return data || [];

}


/*
  FOLDER-1: 이 카테고리의 폴더 행. 실패하면 빈 배열을 돌려준다 —
  폴더 조회가 안 되더라도 category.posts는 그대로 나가야 하고,
  폴더를 모르는 기존 스킨은 아무 영향도 받지 않아야 한다.
*/

async function fetchSkinCategoryFolders(
  ownerId,
  categoryId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("post_folders")
      .select("id, parent_id, name, depth, sort_order")
      .eq("user_id", ownerId)
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: true });


  if (error) {

    console.error(
      "[skin-context] post_folders 조회 실패:",
      error
    );


    return [];

  }


  return data || [];

}


/* =========================================================
   GALLERY-1 — 카테고리 표시 설정 컬럼

   categories에 GALLERY-1이 더한 컬럼 4개(list_style / page_size /
   secret_cover_mode / secret_cover_path)는 migration이 아직 적용되지
   않은 배포에서는 존재하지 않는다. 그 상태에서 select에 이름을 넣으면
   42703으로 **카테고리 조회 자체가 통째로 실패**하므로, 한 번만
   probe해서 있으면 넣고 없으면 빼는 방식으로 읽는다
   (studio/images/skin-image-library.js의 isSkinImageLibraryReady()와
   같은 패턴 — Studio가 아니라 공개 화면이라 더더욱 죽으면 안 된다).

   판정은 세션당 한 번이고 결과는 Promise로 캐시한다.
========================================================== */

const SKIN_CATEGORY_BASE_COLUMNS =
  "id, name, type";

/*
  GALLERY-1 후속: secret_cover_url(공개 https 주소)은 사라졌다.
  파일은 비공개 버킷에 있고 바이트는 /api/post-cover?category=<id>로만
  나간다 — 화면이 알아야 하는 것은 "지정 이미지가 있는가"뿐이라
  경로의 유무만 읽는다(IMORY_GALLERY1_DESIGN.md §3-5).
*/

const SKIN_CATEGORY_GALLERY_COLUMNS =
  "list_style, page_size, secret_cover_mode, secret_cover_path";


/*
  null = 아직 모름, true/false = 이 배포에 컬럼이 있는가. 첫 조회
  결과로 한 번만 정해지고 그 뒤로는 그 값을 그대로 쓴다.
*/

let skinGalleryColumnsPresent =
  null;


function selectSkinCategoryRow(
  ownerId,
  categoryId
) {

  const run =
    (columns) =>
      supabaseClient
        .from("categories")
        .select(columns)
        .eq("user_id", ownerId)
        .eq("id", categoryId)
        .maybeSingle();


  if (skinGalleryColumnsPresent === false) {

    return run(SKIN_CATEGORY_BASE_COLUMNS);

  }


  return run(
    `${SKIN_CATEGORY_BASE_COLUMNS}, ${SKIN_CATEGORY_GALLERY_COLUMNS}`
  ).then((result) => {

    if (
      result.error &&
      result.error.code === "42703"
    ) {

      skinGalleryColumnsPresent =
        false;

      return run(SKIN_CATEGORY_BASE_COLUMNS);

    }


    if (!result.error) {

      skinGalleryColumnsPresent =
        true;

    }


    return result;

  });

}


/*
  기본값 정규화 — 컬럼이 없거나(migration 이전) 값이 이상하면
  "지금까지의 화면"으로 떨어진다. DB의 CHECK 제약과 같은 값 집합을
  쓰지만, 신뢰 경계는 DB이고 여기는 화면이 깨지지 않게 하는 방어다.
*/

const SKIN_GALLERY_PAGE_SIZES =
  [6, 12, 18, 24];

const SKIN_GALLERY_DEFAULT_PAGE_SIZE =
  12;


function normalizeSkinCategoryDisplay(
  category
) {

  const listStyle =
    category && (category.type === "gallery" ||
      (category.type === "post" && category.list_style === "gallery"))
      ? "gallery"
      : "list";


  const rawPageSize =
    Number(category && category.page_size);

  const pageSize =
    SKIN_GALLERY_PAGE_SIZES.includes(rawPageSize)
      ? rawPageSize
      : SKIN_GALLERY_DEFAULT_PAGE_SIZE;


  /*
    "지정 이미지"인데 이미지가 비어 있으면 기본 잠금 카드로 되돌아간다
    (요구사항 3절) — 화면에 빈 <img>가 남지 않게 여기서 정리한다.
  */

  const secretCoverUrl =
    category &&
    typeof category.secret_cover_path === "string" &&
    category.secret_cover_path
      ? buildCategoryCoverUrl(category.id)
      : null;


  const secretCoverMode =
    category &&
    category.secret_cover_mode === "image" &&
    secretCoverUrl
      ? "image"
      : "lock";


  return {
    listStyle,
    pageSize,
    secretCoverMode,
    secretCoverUrl:
      secretCoverMode === "image"
        ? secretCoverUrl
        : null
  };

}


/* =========================================================
   GALLERY-1 — 페이지 단위 글 조회

   "전체 글을 받아 CSS로 숨기는 방식이 아닌, 해당 페이지의 글을
   조회하는 방식"(요구사항 6절)의 실제 구현. PostgREST의 Range
   헤더(supabase-js .range())와 count=exact를 같이 쓴다 — 한 번의
   왕복으로 그 페이지의 행과 전체 개수를 함께 받는다.

   ★ 조회 범위는 **카테고리 root의 direct 글**(folder_id is null)이다.
     폴더 안의 글은 폴더 영역이 그리고 갤러리 카드 영역은 root 글만
     그린다 — 같은 글이 두 군데 나오지 않게 하는 경계를 스킨의 관례가
     아니라 데이터에서 정한다(요구사항 5절 마지막 항목, 기준 문서 §5-3).

   ★ 정렬은 created_at DESC, **id DESC**다. 같은 시각에 저장된 글이
     있어도 페이지마다 순서가 흔들리지 않아야 한다(요구사항 6절) —
     id는 유일하므로 이 두 키로 전순서가 확정된다. FOLDER-1의
     backfill이 쓴 tie-break와 같은 규칙이다.

   ★ private 글은 방문자에게 행 자체가 오지 않으므로(RLS) 목록에도
     count에도 들어가지 않는다. 소유자에게는 지금까지의 목록과
     동일하게 자기 글이 전부 보인다.

   범위를 벗어난 페이지 요청은 PostgREST가 416/PGRST103으로 거절한다.
   그 경우에만 개수만 세는 가벼운 질의를 한 번 더 하고 마지막 페이지로
   맞춰 다시 조회한다 — 정상 경로에는 추가 왕복이 없다.
========================================================== */

const SKIN_CATEGORY_POST_COLUMNS =
  "id, title, created_at, visibility, folder_id, sort_order";


function skinCategoryPostsPageQuery(
  ownerId,
  categoryId
) {

  return supabaseClient
    .from("posts")
    .select(SKIN_CATEGORY_POST_COLUMNS, { count: "exact" })
    .eq("user_id", ownerId)
    .eq("category_id", categoryId)
    .is("folder_id", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

}


async function fetchSkinCategoryRootPostsPage(
  ownerId,
  categoryId,
  requestedPage,
  pageSize
) {

  const page =
    Number.isFinite(Number(requestedPage)) && Number(requestedPage) >= 1
      ? Math.floor(Number(requestedPage))
      : 1;


  const from =
    (page - 1) * pageSize;


  const {
    data,
    error,
    count
  } =
    await skinCategoryPostsPageQuery(ownerId, categoryId)
      .range(from, from + pageSize - 1);


  if (!error) {

    return {
      rows: data || [],
      totalCount: Number(count || 0),
      page
    };

  }


  /*
    범위를 벗어난 페이지 — 개수를 확인해 마지막 페이지로 맞춘다.
    첫 페이지에서 이 오류가 났다면 범위 문제가 아니라 진짜 조회
    실패이므로 그대로 빈 결과를 돌려준다.
  */

  if (error.code !== "PGRST103" || page === 1) {

    console.error(
      "[skin-context] gallery page 조회 실패:",
      error
    );


    return {
      rows: [],
      totalCount: 0,
      page: 1
    };

  }


  const {
    error: countError,
    count: totalCount
  } =
    await skinCategoryPostsPageQuery(ownerId, categoryId)
      .range(0, 0);


  if (countError) {

    console.error(
      "[skin-context] gallery count 조회 실패:",
      countError
    );


    return {
      rows: [],
      totalCount: 0,
      page: 1
    };

  }


  const total =
    Number(totalCount || 0);

  const lastPage =
    Math.max(1, Math.ceil(total / pageSize));


  if (total === 0) {

    return {
      rows: [],
      totalCount: 0,
      page: 1
    };

  }


  const {
    data: lastData,
    error: lastError
  } =
    await skinCategoryPostsPageQuery(ownerId, categoryId)
      .range((lastPage - 1) * pageSize, lastPage * pageSize - 1);


  if (lastError) {

    console.error(
      "[skin-context] gallery 마지막 페이지 조회 실패:",
      lastError
    );


    return {
      rows: [],
      totalCount: total,
      page: lastPage
    };

  }


  return {
    rows: lastData || [],
    totalCount: total,
    page: lastPage
  };

}


/*
  갤러리 모드에서 category.tree를 세우는 데 필요한 "폴더 안의 글"만
  읽는다. root 글은 갤러리 카드가 담당하므로 트리에서 제외되고,
  그 결과 폴더 영역과 카드 영역이 구조적으로 겹치지 않는다.

  폴더가 하나도 없으면 아예 호출하지 않는다(호출자 참고) — 폴더를
  쓰지 않는 대부분의 갤러리 카테고리에는 이 왕복이 없다.
*/

async function fetchSkinCategoryFolderPosts(
  ownerId,
  categoryId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("posts")
      .select(SKIN_CATEGORY_POST_COLUMNS)
      .eq("user_id", ownerId)
      .eq("category_id", categoryId)
      .not("folder_id", "is", null)
      .order("created_at", { ascending: false });


  if (error) {

    console.error(
      "[skin-context] 폴더 안 글 조회 실패:",
      error
    );


    return [];

  }


  return data || [];

}


/* =========================================================
   GALLERY-1 — 대표 이미지 조회

   post_covers는 posts와 분리된 테이블이고, 그 SELECT 정책이
   "public 글이거나 내 글일 때만"을 행 단위로 강제한다
   (supabase/migrations/20260910100000_*.sql).

   ★ 이 조회는 **파일 주소를 받지 않는다**(GALLERY-1 후속)
   대표 이미지 파일은 비공개 버킷에 있고 공개 주소가 없다. 여기서
   받는 것은 "이 글에 대표 이미지가 있다"는 사실(post_id)뿐이고,
   화면에 들어가는 주소는 글 id를 가리키는 우리 도메인 경로다
   (/api/post-cover?post=<id>, core/lib/post-cover-url.js).
   그 요청을 받을 때마다 서버가 그 시점의 공개 상태와 요청자를
   다시 확인한다 — 목록 응답에 주소가 없을 뿐 아니라, 주소를
   안다는 것 자체가 아무 권한도 주지 않는다.

   그럼에도 이 함수는 **비밀글의 id를 아예 보내지 않는다**. 이유:
   소유자 화면과 방문자 화면이 같은 카드(카테고리 공통 대체 이미지
   또는 잠금 카드)를 보여주도록 정했기 때문에(기준 문서 §3-3),
   비밀글의 실제 URL은 소유자에게도 이 화면에서는 필요가 없다.
   덕분에 "비밀글 원본 이미지 주소가 목록 응답에 없다"가 RLS와
   클라이언트 양쪽에서 동시에 참이 된다.

   테이블이 아직 없는 배포(migration 이전)에서는 조용히 빈 Map을
   돌려준다 — 썸네일 없는 대체 카드로 그려질 뿐 화면은 멀쩡하다.
========================================================== */

async function fetchSkinPostCoverMap(
  postIds
) {

  if (!postIds.length) {

    return new Map();

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from("post_covers")
      .select("post_id")
      .in("post_id", postIds);


  if (error) {

    console.warn(
      "[skin-context] post_covers 조회 실패(대체 카드로 진행):",
      error
    );


    return new Map();

  }


  const map =
    new Map();


  (data || []).forEach((row) => {

    if (
      row &&
      row.post_id !== null &&
      row.post_id !== undefined
    ) {

      map.set(
        String(row.post_id),
        buildPostCoverUrl(row.post_id)
      );

    }

  });


  /*
    소유자가 자기 비공개 글의 사진을 보려면 <img> 요청에 본인
    토큰이 실려 있어야 한다 — 그 쿠키가 서기 전에 카드를 그리면
    그 한 장이 404로 끝난다(core/lib/post-cover-url.js).
    공개 글에는 영향이 없고, 이미 서 있으면 즉시 resolve된다.
  */

  try {

    await imoryPostCoverCookieReady;

  }

  catch (err) {

    /* 쿠키를 못 세워도 공개 글 사진은 그대로 보인다 */

  }


  return map;

}


async function fetchSkinPostById(
  ownerId,
  postId
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("posts")
      .select("id, title, created_at, visibility, category_id")
      .eq("user_id", ownerId)
      .eq("id", postId)
      .maybeSingle();


  if (error) {

    console.error(
      "[skin-context] post(단건) 조회 실패:",
      error
    );


    return null;

  }


  return data;

}


async function fetchSkinBanners(
  ownerId,
  bannerCategoryIds
) {

  if (!bannerCategoryIds.length) {

    return [];

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from("banners")
      .select("id, name, url, image_url, category_id, sort_order")
      .eq("user_id", ownerId)
      .in("category_id", bannerCategoryIds)
      .order("sort_order", { ascending: true });


  if (error) {

    console.error(
      "[skin-context] banners 조회 실패:",
      error
    );


    return [];

  }


  return data || [];

}


/* =========================================================
   viewer namespace — 현재 로그인 사용자가 이 블로그의 소유자인지
   (PHASE 1E 3절)

   home/home-skin-prompt.js의 shouldShowHomeSkinPrompt()가 쓰는 것과
   같은 기준이다: Supabase 세션의 user.id가 ownerId와 같으면 소유자.
   그 파일은 core/lib/auth-shared.js의 authGetSession()을 쓰지만,
   이 파일은 Studio(studio/index.html)에서도 로드되고 그쪽은
   auth-shared.js를 로드하지 않으므로 supabaseClient.auth를 직접
   쓴다(studio/images/skin-image-library.js도 같은 방식).

   getSession()은 네트워크가 아니라 로컬 저장소의 세션을 읽는다 —
   로그아웃 방문자에게 추가 왕복이 생기지 않는다. 어떤 이유로든
   실패하면(모의 클라이언트에 auth가 없는 테스트 하네스, 저장소
   접근 불가 등) 항상 null = "소유자 아님"으로 떨어진다. 링크를
   못 보여주는 것은 불편일 뿐이지만, 반대로 잘못 보여주는 것은
   방문자에게 의미 없는(그리고 어차피 권한 검사에 막히는) 관리
   링크를 노출하는 일이라 안전한 기본값이 명확하다.
========================================================== */

async function resolveSkinViewerId() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (error) {

      return null;

    }


    return data?.session?.user?.id ?? null;

  } catch (err) {

    return null;

  }

}


/* =========================================================
   images namespace

   고정 키 맵이 아니라, 렌더링하려는 Skin Version의 imageSlots
   정의(imageSlotNames)가 어떤 슬롯이 존재하는지를 결정한다
   (PHASE1A_DESIGN.md 1-6절) — imageSlotValues에 값이 있어도
   imageSlotNames에 없는 슬롯은 노출하지 않는다.

   slotDefaults는 "사용자가 이 슬롯에 이미지를 따로 지정하지
   않았을 때 대신 쓸 값"이다. 지금은 profile 슬롯 하나가 쓴다
   — Settings의 프로필 사진(site_settings.avatar_url). 슬롯에
   실제 값이 있으면 언제나 그쪽이 이긴다(스킨에서 고른 이미지가
   Settings 값에 덮이면 안 된다).
========================================================== */

/*
  슬롯 기본값 — 지금은 profile 하나뿐이다.

  Settings > PROFILE PICTURE가 저장하는 site_settings.avatar_url을
  "스킨이 profile 이미지를 따로 고르지 않았을 때의 값"으로 쓴다.
  값은 업로드가 만든 URL이지만(admin/settings/admin-settings-avatar.js
  에는 URL 입력칸이 없다), 예전 버전에서 직접 입력해 둔 외부 URL이
  남아 있을 수 있어 banner와 같은 기준(isSafeSkinUrl)으로 한 번
  거른다.
*/

function buildSkinImageSlotDefaults(
  siteSettings
) {

  const rawAvatarUrl =
    siteSettings?.avatar_url?.trim() ||
    "";

  return {

    profile:
      rawAvatarUrl && isSafeSkinUrl(rawAvatarUrl)
        ? rawAvatarUrl
        : null

  };

}


function buildSkinImages(
  imageSlotNames,
  imageSlotValues,
  slotDefaults
) {

  const images =
    {};


  (imageSlotNames || []).forEach(
    (slotName) => {

      images[slotName] =
        imageSlotValues?.[slotName] ??
        slotDefaults?.[slotName] ??
        null;

    }
  );


  return images;

}


/* =========================================================
   공통 데이터 조회 — page.type과 무관하게 세 builder(home/
   category/post) 모두가 필요로 하는 profile/siteSettings/
   categories/slug을 한 번만 조회해서 공유한다. buildXxxSkinContext
   가 각자 다시 조회하지 않도록 내부적으로만 쓰인다(export 안 함).
========================================================== */

async function fetchSkinCommonData(
  ownerId
) {

  const [
    profile,
    siteSettings,
    categories
  ] =
    await Promise.all([
      fetchSkinProfile(ownerId),
      fetchSkinSiteSettings(ownerId),
      fetchSkinCategories(ownerId)
    ]);


  const slug =
    profile?.slug ??
    "";


  return {
    profile,
    siteSettings,
    categories,
    slug
  };

}


/* =========================================================
   buildBaseSkinContext(ownerId, options, commonData?)

   site/profile/navigation/banners/images — 세 page.type 모두
   top-level에 그대로 두는 공통 namespace(PHASE1C 3-1/4-1절).
   commonData를 미리 갖고 있으면(같은 요청 안에서 fetchSkinCommonData를
   두 번 부르지 않기 위해) 그대로 재사용하고, 없으면 직접 조회한다.
========================================================== */

async function buildBaseSkinContext(
  ownerId,
  options = {},
  commonData = null
) {

  if (!ownerId) {

    throw new Error(
      "buildBaseSkinContext: ownerId is required"
    );

  }


  const {
    imageSlotNames = [],
    imageSlotValues = {}
  } =
    options;


  const {
    profile,
    siteSettings,
    categories,
    slug
  } =
    commonData ||
    await fetchSkinCommonData(ownerId);


  const bannerCategoryIds =
    categories
      .filter(
        (category) =>
          category.type === "banner"
      )
      .map(
        (category) =>
          category.id
      );


  const [
    banners,
    viewerId
  ] =
    await Promise.all([
      fetchSkinBanners(
        ownerId,
        bannerCategoryIds
      ),
      resolveSkinViewerId()
    ]);


  /*
    프로필 사진의 원천은 이제 Settings > PROFILE PICTURE다
    (site_settings.avatar_url, admin/settings/admin-settings-avatar.js).
    예전에는 그런 기능이 아예 없어서 이미지 슬롯 값만 재노출했다
    (PHASE1A_DESIGN.md 1-2절) — 그래서 Settings에서 사진을 바꿔도
    스킨에는 아무 일도 일어나지 않았다.

    우선순위(요구사항):
      1. 스킨에서 profile 이미지 슬롯을 따로 지정했으면 그 이미지
      2. 지정이 없으면 Settings의 avatar_url
      3. 둘 다 없으면 null

    1이 2를 이기는 것은 buildSkinImages()가 슬롯 값 → 기본값
    순으로 읽기 때문이다.
  */

  const imageSlotDefaults =
    buildSkinImageSlotDefaults(
      siteSettings
    );

  const settingsAvatarUrl =
    imageSlotDefaults.profile;


  /*
    Studio는 Images 패널에서 슬롯을 바꿀 때마다 이 맵을 다시
    계산해야 하는데(studio-preview.js syncImageSlotsIntoCurrentContext),
    site_settings를 한 번 더 조회하지 않도록 여기서 만든 기본값을
    그대로 돌려준다. 공개 페이지는 이 콜백을 쓰지 않는다.
  */

  if (typeof options.onImageSlotDefaults === "function") {

    options.onImageSlotDefaults(
      imageSlotDefaults
    );

  }


  const images =
    buildSkinImages(
      imageSlotNames,
      imageSlotValues,
      imageSlotDefaults
    );


  /*
    profile.avatarUrl은 images.profile을 그대로 비추되, 스킨이
    "profile" 슬롯을 아예 선언하지 않은 경우에도 Settings 값을
    보여준다 — 그런 스킨에서도 프로필 사진을 쓸 수 있어야 한다.
    슬롯을 선언한 스킨에서는 여전히 두 값이 항상 같다.
  */

  const avatarUrl =
    Object.prototype.hasOwnProperty.call(images, "profile")
      ? images.profile
      : settingsAvatarUrl;


  const siteTitle =
    siteSettings.blog_title?.trim() ||
    profile?.nickname ||
    "Imory";


  /*
    navigation.categories[]는 v1D-A까지의 계약(id/name/type/href/
    itemCount)을 그대로 유지한다 — postCategories/bannerCategories는
    이 배열을 category.type으로 필터링만 한 부분집합이라 item shape이
    완전히 동일하고(6절), 순서도 원본 sort_order 순서를 그대로
    보존한다. renderer(data-imory-if/repeat)가 비교식을 지원하지
    않아(PHASE1D-B 2절) type별 배치가 필요한 Skin은 이 필터링된
    배열을 직접 반복해야 한다 — categories.type이 "post"/"banner"가
    아닌 값(미래 확장 타입)은 두 필터 배열 어디에도 들어가지
    않고 categories[]에만 남는다(안전한 기본 처리).
  */

  const categoryItems =
    categories.map(
      (category) => ({
        id: String(category.id),
        name: category.name,
        type: category.type,
        href: buildSitePath(slug, `/category/${category.id}`),
        itemCount: null
      })
    );


  /*
    viewer(PHASE 1E 4절) — 소유자일 때만 글쓰기/관리 href를 채운다.
    비소유자에게는 isOwner=false와 함께 두 href 모두 null이라,
    Skin이 실수로 data-imory-if를 빠뜨려도 링크가 만들어지지
    않는다(data-imory-href는 값이 문자열이 아니면 href 속성 자체를
    지운다, skin-render.js).

    writeHref: "지금 바로 글을 쓰겠다"는 요청 주소다(buildSiteComposeUrl,
    core/lib/site-path.js — 같은 경로에 ?write=1만 붙인다). 예전에는
    카테고리 관리 목록(?manage=1)으로 보내고 거기서 + 를 한 번 더
    누르게 했지만, WRITE를 누르는 이유는 바로 쓰기 위해서다 — 이제
    이 주소로 들어가면 옛 목록을 거치지 않고 작성 폼이 곧장 열린다
    (posts/view/posts-view-compose.js).

    대상 카테고리를 여기서 정할 수 있으면 정해 준다:
    - POST 카테고리가 정확히 하나면 그 카테고리 경로에 ?write=1.
    - 0개거나 여러 개면 HOME 경로에 ?write=1 — 받는 쪽이 여러 개면
      고르게 하고, 없으면 카테고리부터 만들라고 안내한다.

    같은 카테고리를 그냥 구경하는 링크(navigation.postCategories의
    href)와 주소가 달라야 한다 — 소유자가 메뉴에서 카테고리를 누르면
    방문자와 똑같은 CATEGORY 스킨을 보고, WRITE를 눌렀을 때만 작성
    폼이 열린다. 쿼리는 요청일 뿐이고 실제 소유자 검사는 받는 쪽이
    다시 한다.

    이 판단은 항상 이 파일이 하고, Skin은 category id도 작성 폼
    주소도 전혀 모른다.
  */

  const isOwner =
    !!viewerId &&
    viewerId === ownerId;


  const postCategoryItems =
    categoryItems.filter(
      (category) =>
        ["post", "gallery"].includes(category.type)
    );


  /*
    딱 하나뿐일 때만 "이 카테고리에 쓴다"고 단정한다 — 여러 개면
    고르는 건 받는 쪽 몫이고, 0개면 애초에 보낼 카테고리가 없다.
  */

  const onlyPostCategory =
    postCategoryItems.length === 1
      ? postCategoryItems[0]
      : null;


  const adminHref =
    `${SITE_BASE_PATH}${SKIN_CONTEXT_ADMIN_SUBPATH}`;


  return {

    site: {
      title:
        siteTitle,
      slug,
      faviconUrl:
        siteSettings.favicon_url?.trim() ||
        null,
      description:
        null,
      language:
        SKIN_CONTEXT_LANGUAGE
    },

    profile: {
      nickname:
        profile?.nickname ??
        "",
      bio:
        profile?.bio ??
        null,
      avatarUrl
    },

    navigation: {

      home: {
        name:
          siteTitle,
        href:
          buildSitePath(slug, "/"),
        enabled:
          true
      },

      categories:
        categoryItems,

      postCategories:
        postCategoryItems,

      galleryCategories:
        categoryItems.filter(category => category.type === "gallery"),

      textPostCategories:
        categoryItems.filter(category => category.type === "post"),

      bannerCategories:
        categoryItems.filter(
          (category) =>
            category.type === "banner"
        ),

      /*
        HIGHLIGHT-1: 메모 카테고리로 가는 링크. 어느 화면에서든
        같은 값이라 base에 둔다 — 스킨이 nav 어디에 놓든 상관없다.
        하이라이트가 하나도 없어도 주소는 유효하다(빈 상태 화면이
        나온다, 요구사항 7).
      */

      memos: {
        name:
          "MEMO",

        href:
          buildSiteMemosPath(slug),

        /*
          사용자가 Settings > HOME > ETC에서 껐으면 false다. 스킨은
          이 값으로 자기 링크를 감출 수 있고(data-imory-if), 스킨이
          링크를 그리지 않은 경우 플랫폼이 얹는 기본 진입점도 같은
          값을 따른다(skin/skin-memo-entry.js). "숨김"은 표시
          설정일 뿐이라 주소 자체는 그대로 유효하다 — 주인장이
          주소를 알고 있으면 계속 쓸 수 있어야 한다.
        */

        enabled:
          String(
            siteSettings?.hide_memo_entry ??
            ""
          ).trim() !== "on"
      }

    },

    banners: {
      items:
        banners.map(
          (banner) => ({
            id: String(banner.id),
            imageUrl: banner.image_url,
            href: banner.url || null,
            alt: banner.name || null
          })
        )
    },

    viewer: {

      isOwner,

      writeHref:
        isOwner
          ? buildSiteComposeUrl(
              onlyPostCategory
                ? onlyPostCategory.href
                : buildSitePath(slug, "/")
            )
          : null,

      adminHref:
        isOwner
          ? adminHref
          : null,

      /*
        manageHref(PHASE 1H) — "지금 보고 있는 이 화면의 관리 화면을
        열어달라"는 요청 주소다. 여기(공통 base)에서는 항상 null이고,
        그 화면에 실제로 관리 화면이 있는 page builder만 자기 주소로
        덮어쓴다 — 지금은 post형 CATEGORY 하나뿐이다
        (buildCategorySkinContext). HOME/POST/BANNER에는 대응하는
        목록 관리 화면이 없으므로 null 그대로다.

        null로 두는 것 자체가 계약의 일부다: 스킨이 EDIT 링크를
        data-imory-if="viewer.manageHref"로 감싸 두면, 관리 진입점이
        없는 화면에서는 링크가 아예 그려지지 않고 플랫폼의 기본
        소유자 도구가 그대로 남는다(posts/view/posts-view-list.js).
        비소유자에게는 writeHref/adminHref와 같은 이유로 항상 null이다.
      */

      manageHref:
        null,

      /*
        HIGHLIGHT-1 — 글 뷰어 도구 메뉴(⋮)를 여는 주소.

        base에서는 항상 null이고 POST context만 자기 주소로 덮는다
        (manageHref와 같은 규칙). 스킨이
        data-imory-if="viewer.toolsHref"로 감싸 두면 도구가 없는
        화면에는 링크가 아예 그려지지 않는다.

        ★ 주인장/방문자 모두 값이 있다 — 이 메뉴는 권한 도구가
        아니라 읽기 도구이기 때문이다(글자 크기·링크 복사). 메뉴
        **안**의 항목만 권한에 따라 달라진다
        (posts/view/posts-view-tools-menu.js).
      */

      toolsHref:
        null,

      /*
        하이라이팅 모드로 곧장 들어가는 주소 — 주인장에게만 값이
        있다. 스킨이 도구 메뉴를 거치지 않는 지름길을 그리고 싶을
        때 쓴다.
      */

      highlightHref:
        null,

      /*
        메모 카드를 만들고 고칠 수 있는가(표시용). 실제 권한은
        post_highlights의 RLS와 소유자 전용 RPC가 강제한다 —
        스킨이 이 값을 무시하고 도구를 그려도 아무것도 저장되지
        않는다(요구사항 10 마지막 줄).
      */

      canManageMemos:
        isOwner

    },

    images

  };

}


/* =========================================================
   page namespace 헬퍼 — 항상 하나의 page.type만 true다
   (PHASE1C 3-2/3-3절). data-imory-if가 비교 연산을 지원하지
   않기 때문에 boolean 4종을 함께 발급해 둔다. PHASE 1E에서
   isBanner가 네 번째로 추가됐다 — banner 페이지는 category
   라우트(/:slug/category/:id) 위에 있지만 page.type은 "banner"
   하나뿐이라 isCategory는 false다("항상 정확히 하나만 true"
   불변식 유지). 기존 CATEGORY template은 여전히 post형
   카테고리에서만 렌더되므로 이 구분으로 깨지는 Skin은 없다.
========================================================== */

function buildSkinPageMeta(
  type
) {

  return {
    type,
    isHome: type === "home",
    isCategory: type === "category",
    isPost: type === "post",
    isBanner: type === "banner",
    /* FOLDER-2: 폴더 페이지(Series Viewer). 라우트는
       /:slug/category/:cid/folder/:fid 지만 page.type은 "folder"
       하나뿐이라 isCategory는 false다(banner와 같은 불변식). */
    isFolder: type === "folder",
    /* HIGHLIGHT-1: 메모 카테고리(/:slug/memos). 라우트도 page.type도
       독립이라 isCategory는 false다(banner/folder와 같은 불변식). */
    isMemos: type === "memos"
  };

}


/* =========================================================
   buildHomeSkinContext(ownerId, options) -> HOME context

   기존 buildSkinContext()가 반환하던 shape과 100% 동일하고,
   page namespace 하나만 추가된다(PHASE1C 4절 — 파괴적 변경 없음).
========================================================== */

async function buildHomeSkinContext(
  ownerId,
  options = {}
) {

  if (!ownerId) {

    throw new Error(
      "buildHomeSkinContext: ownerId is required"
    );

  }


  const commonData =
    await fetchSkinCommonData(ownerId);


  const [
    base,
    recentPostsRaw
  ] =
    await Promise.all([
      buildBaseSkinContext(ownerId, options, commonData),
      fetchSkinRecentPosts(ownerId)
    ]);


  const categoryNameById =
    new Map(
      commonData.categories.map(
        (category) =>
          [category.id, category.name]
      )
    );


  return {

    ...base,

    page:
      buildSkinPageMeta("home"),

    home: {
      recentPosts:
        recentPostsRaw.map(
          (post) => ({
            id: String(post.id),
            title: maskSkinPostTitle(post.visibility, post.title),
            href: buildSitePath(commonData.slug, `/post/${post.id}`),
            publishedAt: post.created_at,
            publishedAtLabel: formatSkinPublishedAtLabel(post.created_at),
            categoryId:
              post.category_id != null
                ? String(post.category_id)
                : null,
            categoryName: categoryNameById.get(post.category_id) ?? null,
            isSecret: post.visibility === "secret"
          })
        )
    }

  };

}


/* =========================================================
   buildCategorySkinContext(ownerId, categoryId, options)
   -> CATEGORY context | null

   v0.1은 category.type과 무관하게 posts를 그대로 채운다 —
   "banner 타입일 때 이 계약을 아예 타지 않는다"는 판단(PHASE1C
   5-2절)은 실제 CATEGORY Skin Renderer(1C-C)가 category.type을
   먼저 확인하고 이 함수를 호출할지 말지 결정할 몫이지, 이
   함수(순수 데이터 빌더) 자신의 책임이 아니다.

   categoryId가 이 ownerId 소유가 아니거나 존재하지 않으면
   null을 반환한다(프로그래머 실수가 아니라 정상적인 "없음"
   상태 — fetchSkinProfile 등 기존 조회 헬퍼와 동일한 원칙).
========================================================== */

/* =========================================================
   FOLDER-1 — category.tree

   폴더를 아는 스킨 전용의 계층 데이터. 기존 category.posts와
   나란히 존재하고 서로 영향을 주지 않는다:

     category.posts — 폴더를 모르는 기존 스킨용. 의미도 필드도
       그대로이고(6개 키), 정렬도 지금까지의 created_at DESC다.
       폴더에 들어간 글도 빠짐없이 들어 있다.

     category.tree  — 폴더를 아는 스킨용. 사용자가 관리 화면에서
       drag로 정한 순서(sort_order)를 그대로 반영한 계층이다.

   node shape:
     폴더 { kind: "folder", id, name, depth, children: [...] }
     글   { kind: "post", id, title, href, publishedAt,
            publishedAtLabel, isSecret, depth }

   ★ 폴더 노드에는 `href`가 없다. 폴더를 여는 링크는 FOLDER-2부터
     **`folderHref`** 라는 별도 키로 준다(IMORY_FOLDER2_DESIGN.md).
     `href`를 쓰지 않는 이유: 스킨과 AI 프롬프트가 "글 가지 = item.href
     가 있는 노드"로 분기하고 있어서, 폴더에 href를 넣으면 폴더에서
     글 가지까지 함께 그려진다(item.href = 글 판정 계약 유지).

     folderHref는 다음 두 조건을 모두 만족할 때만 문자열이고 그 외에는
     null이다 — 눌러도 아무 일이 없는 링크를 노출하지 않기 위해서다
     (PHASE 1H가 banner의 manageHref를 null로 둔 것과 같은 판단):
       1) 렌더 중인 스킨에 templates.folder가 있다
          (options.supportsFolderPage — 호출자가 스킨을 보고 넘긴다)
       2) 그 폴더에 **보이는 direct 글**이 하나 이상 있다
          (폴더 페이지는 direct 글만 보여주므로, 하위 폴더에만 글이
           있는 폴더는 열어도 빈 화면이 된다 → 링크를 주지 않는다)

   ★ 스킨은 kind 값을 비교할 수 없다(data-imory-if는 truthy 판정만
     한다). 그래서 폴더에만 있는 필드(name/children)와 글에만 있는
     필드(title/href)로도 분기할 수 있게 두 shape의 필드를 겹치지
     않게 뒀다.

   ── 방문자에게 아무것도 보이지 않는 폴더 ──────────────────
   posts는 RLS가 이미 걸러서 온다(private 글은 비소유자에게 아예
   행이 오지 않는다). 그래서 "보이는 글이 하나도 없는 폴더 서브
   트리"를 여기서 잘라내면, 방문자는 빈 폴더 이름을 보지 않고
   소유자는 자기 글이 있으니 그대로 다 본다 — 뷰어별 분기를 따로
   쓰지 않아도 저절로 맞는다.

   ★ 이것은 표현 계층의 정리이지 보안 경계가 아니다. post_folders는
     anon SELECT가 가능하므로 폴더 **이름 자체**는 REST로 직접
     읽을 수 있다(migration 1의 주석에 명시). 글의 제목/본문/공개
     범위는 기존 RLS가 그대로 가린다.
========================================================== */

function buildSkinFolderHref(
  slug,
  categoryId,
  folderId
) {

  return buildSitePath(
    slug,
    `/category/${categoryId}/folder/${folderId}`
  );

}


function buildSkinCategoryTree(
  folders,
  posts,
  slug,
  treeOptions = {}
) {

  const {
    categoryId = null,
    folderHrefEnabled = false
  } =
    treeOptions;

  const nodesById = new Map();

  (folders || []).forEach((row) => {

    nodesById.set(String(row.id), {
      kind: "folder",
      id: String(row.id),
      name: row.name,
      sortOrder: Number(row.sort_order ?? 0),
      children: []
    });

  });

  const rootChildren = [];

  /* 폴더를 부모에 붙인다(부모가 없으면 root로 끌어올린다) */

  (folders || []).forEach((row) => {

    const node = nodesById.get(String(row.id));

    const parent =
      row.parent_id === null || row.parent_id === undefined
        ? null
        : nodesById.get(String(row.parent_id));

    if (parent) {
      parent.children.push(node);
    } else {
      rootChildren.push(node);
    }

  });

  /* 글을 컨테이너에 붙인다 */

  (posts || []).forEach((post) => {

    const node = {
      kind: "post",
      id: String(post.id),
      title: maskSkinPostTitle(post.visibility, post.title),
      href: buildSitePath(slug, `/post/${post.id}`),
      publishedAt: post.created_at,
      publishedAtLabel: formatSkinPublishedAtLabel(post.created_at),
      isSecret: post.visibility === "secret",
      sortOrder: Number(post.sort_order ?? 0)
    };

    const parent =
      post.folder_id === null || post.folder_id === undefined
        ? null
        : nodesById.get(String(post.folder_id));

    if (parent) {
      parent.children.push(node);
    } else {
      rootChildren.push(node);
    }

  });

  /*
    DB(post_container_rebalance / move_tree_node)와 관리 화면이 쓰는
    비교와 정확히 같아야 한다: sort_order → kind → id.
  */

  function sortContainer(children) {

    children.sort((a, b) => {

      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      if (a.kind !== b.kind) {
        return a.kind < b.kind ? -1 : 1;
      }

      return Number(a.id) - Number(b.id);

    });

    children.forEach((child) => {

      if (child.kind === "folder") {
        sortContainer(child.children);
      }

    });

  }

  sortContainer(rootChildren);

  /*
    보이는 글이 하나도 없는 폴더 서브트리를 잘라내고, 동시에
    내부 정렬 키(sortOrder)를 떼어낸 공개 shape로 옮긴다.
    -> { nodes, hasFolder }
  */

  function toPublicNodes(children, depth) {

    const result = [];

    let hasFolder = false;

    children.forEach((child) => {

      if (child.kind === "post") {

        result.push({
          kind: "post",
          id: child.id,
          title: child.title,
          href: child.href,
          publishedAt: child.publishedAt,
          publishedAtLabel: child.publishedAtLabel,
          isSecret: child.isSecret,
          depth
        });

        return;

      }

      const inner = toPublicNodes(child.children, depth + 1);

      if (inner.nodes.length === 0) {
        return;
      }

      hasFolder = true;

      /*
        FOLDER-2: direct 글 수와 폴더 링크. postCount는 이 폴더에 직접
        든(하위 폴더 제외) 보이는 글의 수 — folderHref 조건 2)의 근거
        이고, 스킨이 "글 n개" 같은 표시에 써도 된다.
      */

      const directPostCount =
        inner.nodes.filter((node) => node.kind === "post").length;

      result.push({
        kind: "folder",
        id: child.id,
        name: child.name,
        depth,
        folderHref:
          folderHrefEnabled &&
          categoryId !== null &&
          directPostCount > 0
            ? buildSkinFolderHref(slug, categoryId, child.id)
            : null,
        postCount: directPostCount,
        children: inner.nodes
      });

    });

    return {
      nodes: result,
      hasFolder: hasFolder
    };

  }

  const built = toPublicNodes(rootChildren, 1);

  return {
    tree: built.nodes,
    hasFolders: built.hasFolder
  };

}


/* =========================================================
   GALLERY-1 — category.gallery.cards / category.pagination

   두 namespace의 이름과 필드는 기존 규칙을 그대로 따른다:
   href로 끝나는 링크, ...Label로 끝나는 표시용 문자열, is...로
   시작하는 boolean. 스킨은 비교 연산을 쓸 수 없으므로
   (data-imory-if는 truthy 판정만) 필요한 분기는 전부 boolean
   필드로 미리 계산해 준다.

   카드 shape:
     { id, title, href, publishedAt, publishedAtLabel,
       isSecret, isPrivate,
       thumbnailUrl,      — 그릴 이미지가 없으면 null
       thumbnailAlt,
       hasThumbnail,      — 사진 카드인가
       isPlaceholder,     — 대체(사진 없음) 카드인가  = !hasThumbnail
       isLocked }         — 잠금 표시를 유지할 카드인가 = isSecret

   ★ 비밀글 규칙(요구사항 3절)
     비밀글 카드의 thumbnailUrl은 **절대** 그 글의 실제 대표
     이미지가 아니다. 카테고리 설정이 "지정 이미지"면 그 공통
     이미지, 아니면 null(잠금 카드)이다. 소유자에게도 같은 카드를
     준다 — 그래야 "내 갤러리가 방문자에게 어떻게 보이는가"가
     그대로 보이고, 소유자/방문자 화면이 갈라지는 경로 자체가
     생기지 않는다(기준 문서 §3-3).
     isLocked는 지정 이미지를 쓸 때도 true다 — 잠금 표시는 유지한다.
========================================================== */

function buildSkinGalleryCards(
  posts,
  slug,
  coverMap,
  display,
  photoMap = new Map()
) {

  return (posts || []).map((post) => {

    const isSecret =
      post.visibility === "secret";

    const isPrivate =
      post.visibility === "private";


    const thumbnailUrl =
      isSecret
        ? display.secretCoverUrl
        : ((photoMap.get(String(post.id)) || []).find(image => image.isPrimary)?.url ||
          photoMap.get(String(post.id))?.[0]?.url || coverMap.get(String(post.id)) || null);


    return {

      id:
        String(post.id),

      title:
        maskSkinPostTitle(post.visibility, post.title),

      href:
        buildSitePath(slug, `/post/${post.id}`),

      publishedAt:
        post.created_at,

      publishedAtLabel:
        formatSkinPublishedAtLabel(post.created_at),

      isSecret,

      isPrivate,

      thumbnailUrl:
        thumbnailUrl || null,

      images: isSecret ? [] : (photoMap.get(String(post.id)) || []),
      additionalImages: isSecret ? [] : (photoMap.get(String(post.id)) || []).filter(image => image.url !== thumbnailUrl),
      hasAdditionalImages: !isSecret && (photoMap.get(String(post.id)) || []).length > 1,
      imageCount: isSecret ? 0 : (photoMap.get(String(post.id)) || []).length,
      hasImages: !isSecret && (photoMap.get(String(post.id)) || []).length > 0,

      /*
        alt는 마스킹 아이콘 없는 원래 제목이다 — 아이콘은 화면에
        이미 잠금 배지로 나타나므로 보조기술에 두 번 읽히지 않게 한다.
      */
      thumbnailAlt:
        post.title || "",

      hasThumbnail:
        Boolean(thumbnailUrl),

      isPlaceholder:
        !thumbnailUrl,

      isLocked:
        isSecret

    };

  });

}


/*
  페이지 번호 목록은 플랫폼이 계산해서 완성된 링크와 함께 준다
  (요구사항 5절 "페이지 계산·데이터 조회·권한 처리는 플랫폼").
  스킨은 pages[]를 repeat으로 그리기만 하면 된다.

  1페이지 링크에는 ?page=가 붙지 않는다(정규 주소,
  core/lib/site-path.js의 buildSiteCategoryPageUrl 주석).
*/

function buildSkinCategoryPagination(
  slug,
  categoryId,
  currentPage,
  pageSize,
  totalCount
) {

  const basePath =
    buildSitePath(slug, `/category/${categoryId}`);


  const totalPages =
    Math.max(
      1,
      Math.ceil(totalCount / pageSize)
    );


  const page =
    Math.min(
      Math.max(1, currentPage),
      totalPages
    );


  const hrefFor =
    (n) =>
      buildSiteCategoryPageUrl(basePath, n);


  const pages =
    [];

  for (let n = 1; n <= totalPages; n += 1) {

    pages.push({
      number: n,
      label: String(n),
      href: hrefFor(n),
      isCurrent: n === page
    });

  }


  return {

    currentPage: page,

    currentPageLabel:
      String(page),

    pageSize,

    totalCount,

    totalPages,

    totalPagesLabel:
      String(totalPages),

    /* 페이지가 하나뿐이면 스킨이 이동 영역 자체를 접을 수 있다 */
    hasPages:
      totalPages > 1,

    hasPrev:
      page > 1,

    hasNext:
      page < totalPages,

    prevHref:
      page > 1
        ? hrefFor(page - 1)
        : null,

    nextHref:
      page < totalPages
        ? hrefFor(page + 1)
        : null,

    firstHref:
      hrefFor(1),

    lastHref:
      hrefFor(totalPages),

    pages

  };

}


async function buildCategorySkinContext(
  ownerId,
  categoryId,
  options = {}
) {

  if (!ownerId) {

    throw new Error(
      "buildCategorySkinContext: ownerId is required"
    );

  }

  if (categoryId === undefined || categoryId === null) {

    throw new Error(
      "buildCategorySkinContext: categoryId is required"
    );

  }


  const commonData =
    await fetchSkinCommonData(ownerId);


  const [
    base,
    category,
    foldersRaw
  ] =
    await Promise.all([
      buildBaseSkinContext(ownerId, options, commonData),
      fetchSkinCategoryById(ownerId, categoryId),
      fetchSkinCategoryFolders(ownerId, categoryId)
    ]);


  if (!category) {
    return null;
  }


  /* =========================================================
     GALLERY-1 — 이 렌더가 갤러리인가

     두 조건이 모두 참일 때만 갤러리 모드로 조회한다:

       1) 카테고리 설정이 gallery다(categories.list_style)
       2) 렌더 중인 스킨이 category.gallery 계약을 실제로 쓴다
          (options.supportsGallery — 호출자가 skinTemplateUsesGallery()로
           판정해 넘긴다, skin/skin-template.js)

     2)가 없으면 갤러리를 모르는 기존 스킨이 아무것도 바꾸지 않았는데
     목록이 12개로 잘려 보인다(요구사항 5절 "기존 스킨이 갑자기 일부
     글만 받지 않게"). 그 경우 이 함수는 GALLERY-1 이전과 **완전히
     동일한** 조회·정렬·shape을 쓴다 — 아래 galleryActive가 false인
     가지가 그것이다.
  ========================================================== */

  const display =
    normalizeSkinCategoryDisplay(category);


  const galleryActive =
    display.listStyle === "gallery" &&
    options.supportsGallery === true;


  let postsRaw;
  let treePosts;
  let galleryPage = null;

  if (galleryActive) {

    galleryPage =
      await fetchSkinCategoryRootPostsPage(
        ownerId,
        categoryId,
        options.page,
        display.pageSize
      );

    postsRaw =
      galleryPage.rows;

    /*
      트리는 "폴더 안의 글"만으로 세운다 — root 글은 갤러리 카드가
      담당하므로 트리에는 폴더 노드만 남고, 같은 글이 두 영역에
      동시에 나올 수 없다. 폴더가 없으면 조회 자체를 생략한다.
    */

    treePosts =
      foldersRaw.length
        ? await fetchSkinCategoryFolderPosts(ownerId, categoryId)
        : [];

  }

  else {

    postsRaw =
      await fetchSkinCategoryPosts(ownerId, categoryId);

    treePosts =
      postsRaw;

  }


  /*
    FOLDER-2: options.supportsFolderPage — 호출자(skin/skin-category.js,
    studio/preview/preview-navigation.js)가 "이 스킨에 templates.folder가
    있는가"를 resolveSkinTemplate()으로 판정해 넘긴다. 없으면 폴더
    노드의 folderHref는 전부 null이다(위 buildSkinCategoryTree 주석).
  */

  const folderTree =
    buildSkinCategoryTree(
      foldersRaw,
      treePosts,
      commonData.slug,
      {
        categoryId: category.id,
        folderHrefEnabled: options.supportsFolderPage === true
      }
    );


  /*
    대표 이미지는 갤러리 모드에서만, 그리고 **비밀글이 아닌 글의
    id로만** 조회한다(위 fetchSkinPostCoverMap 주석).
  */

  const coverMap =
    galleryActive
      ? await fetchSkinPostCoverMap(
          postsRaw
            .filter((post) => post.visibility !== "secret")
            .map((post) => post.id)
        )
      : new Map();


  /*
    본문에 넣은 사진. 예전에는 gallery 카테고리에서만 읽었는데,
    이제 post 카테고리도 같은 본문 에디터로 사진을 넣고 COVER
    업로드 칸은 사라졌다 — 갤러리로 표시되는 post 카테고리의
    썸네일이 여기서 나온다(기준 문서 IMORY_POST_BODY_IMAGE_DESIGN.md).

    thumbnailUrl 우선순위는 buildSkinGalleryCards에 있다:
      명시 대표(is_primary) → 본문 첫 사진 → 예전 post_covers.
  */

  const photoMap = new Map();
  if (galleryActive) {
    const ids = postsRaw.filter(post => post.visibility !== "secret").map(post => post.id);
    if (ids.length) {
      const { data, error } = await supabaseClient.from("post_gallery_images")
        .select("id, post_id, position, is_primary").in("post_id", ids).order("position").order("id");
      if (error) console.warn("[skin-context] gallery photos unavailable", error);
      for (const photo of data || []) {
        const key = String(photo.post_id);
        if (!photoMap.has(key)) photoMap.set(key, []);
        photoMap.get(key).push({ id: photo.id, url: `/api/post-cover?image=${photo.id}`,
          alt: "", isPrimary: photo.is_primary === true });
      }
    }
  }

  const galleryCards =
    galleryActive
      ? buildSkinGalleryCards(
          postsRaw,
          commonData.slug,
          coverMap,
          display,
          photoMap
        )
      : null;


  const pagination =
    galleryActive
      ? buildSkinCategoryPagination(
          commonData.slug,
          category.id,
          galleryPage.page,
          display.pageSize,
          galleryPage.totalCount
        )
      : null;


  return {

    ...base,

    page:
      buildSkinPageMeta("category"),

    /*
      PHASE 1H — 이 카테고리의 목록 관리 화면 주소. buildSiteManageUrl()이
      만드는 기존 ?manage=1 주소 그대로이고(core/lib/site-path.js), 실제로
      열지는 openCategoryPage()가 isSiteOwnerSignedIn()으로 다시 판단한다 —
      쿼리는 권한이 아니라 요청이다.

      banner형 카테고리는 제외한다: 배너 관리는 URL 요청이 아니라 화면 안의
      토글(bannerEditToggleButton)이라 ?manage=1로 열리는 화면이 애초에 없다.
      없는 진입점을 스킨에 노출하면 눌러도 아무 일이 일어나지 않는 링크가
      되므로, 그 경우는 null로 두어 플랫폼의 기본 소유자 도구가 그대로
      남게 한다.
    */

    viewer: {
      ...base.viewer,

      /*
        PHASE 1H — CATEGORY 화면에서는 "이 카테고리에 쓴다"가 명확하다.
        base의 writeHref는 화면 맥락이 없어서 POST 카테고리가 여럿이면
        HOME 작성 주소로 떨어지는데(받는 쪽이 첫 카테고리를 고른다),
        지금 그 카테고리를 보고 있는 화면에서는 그럴 이유가 없다.
        플랫폼의 + 버튼이 늘 하던 일(currentPostCategoryId로 작성)과
        같은 대상을 스킨의 WRITE도 가리키게 맞춘다 — 그래야 플랫폼이
        중복 + 를 접어도 "보고 있는 카테고리에 쓴다"가 사라지지 않는다.
        banner 카테고리에서는 base 값을 그대로 둔다(그 카테고리에
        글을 쓸 수는 없다).
      */

      writeHref:
        base.viewer.isOwner &&
        ["post", "gallery"].includes(category.type || "post")
          ? buildSiteComposeUrl(
              buildSitePath(commonData.slug, `/category/${category.id}`)
            )
          : base.viewer.writeHref,

      manageHref:
        base.viewer.isOwner &&
        ["post", "gallery"].includes(category.type || "post")
          ? buildSiteManageUrl(
              buildSitePath(commonData.slug, `/category/${category.id}`)
            )
          : null
    },

    category: {
      id: String(category.id),
      name: category.name,
      type: category.type,
      href: buildSitePath(commonData.slug, `/category/${category.id}`),

      /*
        폴더를 모르는 기존 스킨용. FOLDER-1 이전과 완전히 같다 —
        같은 6개 키, 같은 created_at DESC 순서, 폴더에 들어간 글도
        전부 포함. 폴더를 만들었다는 이유만으로 이 목록이 달라지면
        하위 호환이 깨진다.

        GALLERY-1: 갤러리 모드에서는(= 이 스킨이 category.gallery를
        쓰기로 선언한 경우에만 켜진다) 이 배열이 "지금 페이지의 root
        글"이 된다 — 갤러리를 아는 스킨은 카드를 그리려고 이미 그
        데이터를 보고 있으므로 같은 값을 두 벌 내려보내지 않는다.
        갤러리를 모르는 스킨에는 갤러리 모드가 애초에 켜지지 않으므로
        이 배열은 언제나 지금까지와 같은 전체 목록이다
        (기준 문서 §4 하위 호환 규칙).
      */

      posts:
        postsRaw.map(
          (post) => ({
            id: String(post.id),
            title: maskSkinPostTitle(post.visibility, post.title),
            href: buildSitePath(commonData.slug, `/post/${post.id}`),
            publishedAt: post.created_at,
            publishedAtLabel: formatSkinPublishedAtLabel(post.created_at),
            isSecret: post.visibility === "secret"
          })
        ),

      /* 폴더를 아는 스킨용(FOLDER-1). 위 buildSkinCategoryTree() 주석 참고. */

      hasFolders:
        folderTree.hasFolders,

      tree:
        folderTree.tree,

      /* =====================================================
         GALLERY-1 — 표시 방식

         listStyle/pageSize는 갤러리가 실제로 켜졌는지와 무관하게
         "설정값"을 그대로 알려준다. isGallery는 반대로 **이번
         렌더가 실제로 갤러리인가**다 — 스킨은 이 값 하나로 레이아웃을
         가르면 되고, 설정만 gallery이고 스킨이 지원하지 않는 상태에
         빠지지 않는다.
      ====================================================== */

      listStyle:
        display.listStyle,

      pageSize:
        display.pageSize,

      isGallery:
        galleryActive,

      /*
        isGallery의 반대. data-imory-if는 부정(!)을 표현할 수 없으므로
        두 상태를 각각 boolean으로 준다 — 한 스킨이 목록/갤러리 두
        레이아웃을 함께 갖고 카테고리 설정에 따라 하나만 그릴 수
        있게 하는 최소 장치다(FOLDER-2가 folder.isList/isSeries를
        나란히 준 것과 같은 이유).
      */

      isList:
        !galleryActive,

      /*
        갤러리가 아닐 때 두 namespace는 null이다 — data-imory-if는
        falsy를 그대로 접으므로 스킨이 "갤러리 영역"을 통째로
        감출 수 있다.
      */

      gallery:
        galleryActive
          ? {
              cards: galleryCards,
              count: galleryCards.length,
              isEmpty: galleryCards.length === 0,
              hasCards: galleryCards.length > 0,
              /*
                "이 카테고리에 (이 페이지가 아니라) 글이 하나도
                없다" — 빈 카테고리 안내와 "마지막 페이지 너머"를
                구분하려면 두 값이 모두 필요하다.
              */
              isEmptyCategory: pagination.totalCount === 0
            }
          : null,

      pagination:
        pagination

    }

  };

}


/* =========================================================
   FOLDER-2 — buildFolderSkinContext(ownerId, categoryId, folderId, options)
   -> FOLDER context | null

   폴더 페이지(Series Viewer)의 page context. 같은 카테고리의
   category.tree를 만드는 것과 **정확히 같은 조회·정렬·마스킹·
   잘라내기**(buildSkinCategoryTree)를 거친 뒤 그 트리에서 폴더
   노드 하나를 꺼내 shape만 바꾼다 — 그래서 CATEGORY 화면의 폴더
   카드 안 글 순서와 폴더 페이지의 글 순서가 어긋날 수 없다
   (IMORY_FOLDER1_DESIGN.md §1-2 "정렬 비교는 세 군데가 같아야 한다").

   null을 돌려주는 경우(호출자는 전부 "그 카테고리로 복귀"로 처리한다):
   - 카테고리가 없거나 이 ownerId 소유가 아니다 / post형이 아니다
   - 폴더가 없다(삭제됨), 이 카테고리의 폴더가 아니다
   - 이 뷰어에게 보이는 direct 글이 하나도 없다(방문자에게 private
     글뿐인 폴더, 하위 폴더에만 글이 있는 폴더, 빈 폴더)

   shape:
     page:     { type: "folder", isFolder: true, ... }
     category: { id, name, type, href }            — 상위 카테고리
     folder: {
       id, name, depth,
       href,                                        — 이 폴더 페이지 자신(목록)
       isSeries, isList,                            — 읽기 모드(?series=1 여부)
       listHref, seriesHref,                        — 목록 ↔ 이어읽기 전환 링크
       parentHref,                                    — 가장 가까운 열 수 있는 상위(부모 폴더 페이지 또는 카테고리)
       ancestors: [ { kind:"folder", id, name, depth, folderHref, postCount } ],  — 카테고리 바로 아래부터 부모까지
       children:  [ { kind:"folder", id, name, depth, folderHref, postCount } ],  — 직속 하위 폴더(보이는 글이 있는 것만)
       posts:     [ { id, title, href, publishedAt, publishedAtLabel, isSecret, editHref } ],  — direct 글만, sort_order 순
       postCount
     }

   ★ 본문은 여기 없다. category.posts/post와 같은 원칙(PHASE1C 7-2절)
     — 본문은 렌더 뒤 플랫폼이 각 글의 post-body region에만 채운다.
   ★ editHref는 소유자에게만 문자열(?edit=1 수정 폼 주소), 방문자에게는
     null이다. 쿼리는 요청일 뿐이고 실제 작성자 검사는 받는 쪽
     (openPostEditor)이 다시 한다.
========================================================== */

async function buildFolderSkinContext(
  ownerId,
  categoryId,
  folderId,
  options = {}
) {

  if (!ownerId) {

    throw new Error(
      "buildFolderSkinContext: ownerId is required"
    );

  }

  if (categoryId === undefined || categoryId === null) {

    throw new Error(
      "buildFolderSkinContext: categoryId is required"
    );

  }

  if (folderId === undefined || folderId === null) {

    throw new Error(
      "buildFolderSkinContext: folderId is required"
    );

  }


  const commonData =
    await fetchSkinCommonData(ownerId);


  const [
    base,
    category,
    postsRaw,
    foldersRaw
  ] =
    await Promise.all([
      buildBaseSkinContext(ownerId, options, commonData),
      fetchSkinCategoryById(ownerId, categoryId),
      fetchSkinCategoryPosts(ownerId, categoryId),
      fetchSkinCategoryFolders(ownerId, categoryId)
    ]);


  if (
    !category ||
    !["post", "gallery"].includes(category.type || "post")
  ) {
    return null;
  }


  const tree =
    buildSkinCategoryTree(
      foldersRaw,
      postsRaw,
      commonData.slug,
      {
        categoryId: category.id,
        folderHrefEnabled: true
      }
    ).tree;


  /* 트리에서 폴더 노드와 그 조상 경로를 찾는다(DFS) */

  const targetId =
    String(folderId);

  function findFolderNode(nodes, path) {

    for (const node of nodes) {

      if (node.kind !== "folder") {
        continue;
      }

      if (node.id === targetId) {
        return { node, path };
      }

      const found =
        findFolderNode(node.children, [...path, node]);

      if (found) {
        return found;
      }

    }

    return null;

  }

  const found =
    findFolderNode(tree, []);

  if (!found) {
    return null;
  }

  const folderNode =
    found.node;

  const directPosts =
    folderNode.children.filter((node) => node.kind === "post");

  if (directPosts.length === 0) {
    return null;
  }


  const toFolderSummary =
    (node) => ({
      kind: "folder",
      id: node.id,
      name: node.name,
      depth: node.depth,
      folderHref: node.folderHref,
      postCount: node.postCount
    });

  const ancestors =
    found.path.map(toFolderSummary);

  const categoryHref =
    buildSitePath(commonData.slug, `/category/${category.id}`);

  const openableAncestor =
    [...ancestors].reverse().find((node) => node.folderHref);

  const isOwner =
    base.viewer.isOwner;


  /*
    읽기 모드(FOLDER-2 UX 개정). 기본은 목록이고, Series Viewer는
    ?series=1로 들어왔을 때만이다 — 스킨은 folder.isSeries / folder.isList
    로 두 화면을 나누고(data-imory-if), 두 링크로 서로를 오간다.
    권한이 아니라 읽기 모드라 소유자/방문자 모두 같다.
  */

  const folderHref =
    buildSkinFolderHref(commonData.slug, category.id, folderNode.id);

  const isSeries =
    Boolean(options.series);


  return {

    ...base,

    page:
      buildSkinPageMeta("folder"),

    viewer: {
      ...base.viewer,

      /*
        FOLDER-3: WRITE는 **이 폴더**에 쓰는 진입점이다. 폴더 페이지
        안에서 WRITE를 눌렀는데 글이 카테고리 root에 생기면, 쓰고 나서
        관리 화면에 다시 들어가 끌어다 놓아야 했다 — 그 두 번째 단계를
        없앤다. 주소는 폴더 경로 그대로에 쿼리 하나만 붙는다
        (/category/:cid/folder/:fid?write=1) — 새 경로를 만들지 않는다.

        받는 쪽에서 실제로 여는 것은 지금까지와 같은 작성 폼이고
        (posts/view/posts-view-compose.js) 폼 안의 FOLDER 드롭다운이
        이 폴더로 미리 맞춰져 있다. 소유자 검사도 그대로다 —
        이 주소는 권한이 아니라 요청이다.

        관리(EDIT)는 여전히 카테고리의 관리 화면이다 — 폴더 전용
        관리 화면은 없다.
      */

      writeHref:
        isOwner
          ? buildSiteComposeUrl(folderHref)
          : base.viewer.writeHref,

      manageHref:
        isOwner
          ? buildSiteManageUrl(categoryHref)
          : null
    },

    category: {
      id: String(category.id),
      name: category.name,
      type: category.type,
      href: categoryHref
    },

    folder: {
      id: folderNode.id,
      name: folderNode.name,
      depth: folderNode.depth,
      href: folderHref,
      isSeries,
      isList: !isSeries,
      listHref: folderHref,
      seriesHref: buildSiteSeriesUrl(folderHref),
      parentHref:
        openableAncestor
          ? openableAncestor.folderHref
          : categoryHref,
      ancestors,
      children:
        folderNode.children
          .filter((node) => node.kind === "folder")
          .map(toFolderSummary),
      posts:
        directPosts.map(
          (post) => ({
            id: post.id,
            title: post.title,
            href: post.href,
            publishedAt: post.publishedAt,
            publishedAtLabel: post.publishedAtLabel,
            isSecret: post.isSecret,
            editHref:
              isOwner
                ? buildSiteEditUrl(post.href)
                : null
          })
        ),
      postCount: directPosts.length
    }

  };

}


/* =========================================================
   buildPostSkinContext(ownerId, postId, options) -> POST context | null

   본문(content/ooc_content)과 secret_password_hash는 이 함수가
   호출하는 fetchSkinPostById()가 애초에 select하지 않으므로
   Context에 노출될 수 있는 경로 자체가 없다(PHASE1C 6-1/7-2절).
   visibility 원본 값도 노출하지 않고 maskSkinPostTitle()이 만든
   최종 텍스트만 돌려준다(5-3절과 동일 원칙).
========================================================== */

async function buildPostSkinContext(
  ownerId,
  postId,
  options = {}
) {

  if (!ownerId) {

    throw new Error(
      "buildPostSkinContext: ownerId is required"
    );

  }

  if (postId === undefined || postId === null) {

    throw new Error(
      "buildPostSkinContext: postId is required"
    );

  }


  const commonData =
    await fetchSkinCommonData(ownerId);


  const [
    base,
    post
  ] =
    await Promise.all([
      buildBaseSkinContext(ownerId, options, commonData),
      fetchSkinPostById(ownerId, postId)
    ]);


  if (!post) {
    return null;
  }


  const categoryNameById =
    new Map(
      commonData.categories.map(
        (category) =>
          [category.id, category.name]
      )
    );


  const categoryName =
    post.category_id != null
      ? (categoryNameById.get(post.category_id) ?? null)
      : null;

  const categoryHref =
    post.category_id != null
      ? buildSitePath(commonData.slug, `/category/${post.category_id}`)
      : null;


  const postPath =
    buildSitePath(commonData.slug, `/post/${post.id}`);


  return {

    ...base,

    page:
      buildSkinPageMeta("post"),

    viewer: {
      ...base.viewer,

      /*
        HIGHLIGHT-1: 이 글의 도구 메뉴를 여는 주소. 스킨이 이
        링크를 그리면 플랫폼의 기본 ⋮ 버튼은 접힌다 — 같은 동작을
        두 번 보여주지 않는다(posts/view/posts-view-tools-menu.js).
      */

      toolsHref:
        buildSiteToolsUrl(postPath),

      highlightHref:
        base.viewer.isOwner
          ? buildSiteHighlightUrl(postPath)
          : null
    },

    post: {
      id: String(post.id),
      title: maskSkinPostTitle(post.visibility, post.title),
      publishedAt: post.created_at,
      publishedAtLabel: formatSkinPublishedAtLabel(post.created_at),
      categoryName,
      categoryHref,

      /* 정식 공개 주소 — 스킨이 "이 글 링크" 같은 것을 그릴 때 쓴다 */
      href:
        postPath
    }

  };

}


/* =========================================================
   buildBannerSkinContext(ownerId, categoryId, options)
   -> BANNER context | null   (PHASE 1E 2절)

   banner 타입 카테고리(지인/사이트 배너 모음) 화면의 page context.
   buildCategorySkinContext()와 완전히 같은 뼈대를 쓰되, posts 대신
   그 카테고리의 배너 목록을 채운다 — 글 목록 계약(category.posts)을
   배너에 재사용하지 않는다(항목의 의미가 완전히 다르다: 제목/날짜/
   내부 링크가 아니라 이미지/외부 링크).

   조회는 새로 만들지 않는다 — 이미 있는 fetchSkinCategoryById()와
   fetchSkinBanners()를 그대로 쓴다. 둘 다 ownerId로 scope되어 있어
   (fetchSkinBanners는 .eq("user_id").in("category_id")) 다른
   사용자의 배너나 다른 카테고리의 배너가 섞일 수 없다. 정렬도
   기존 sort_order 그대로다.

   category.type 검사는 여기서 하지 않는다 —
   buildCategorySkinContext()가 type과 무관하게 posts를 채우고
   호출자(skin-category.js)가 type을 판정하는 것과 동일한 분리다.
   이 함수의 호출자(skin/skin-banner.js, studio/preview/
   preview-navigation.js)가 bannerCategory.type으로 판정한다.

   href/imageUrl은 isSafeSkinUrl()(skin/skin-sanitize.js)로 여기서
   한 번 거른다 — 안전하지 않으면 항목을 숨기지 않고 그 필드만
   null로 만든다(이름은 계속 보인다, studio/preview/
   preview-navigation.js의 banner adapter와 동일한 정책). 렌더
   시점에 skin-render.js가 data-imory-href/src를 다시 검증하므로
   이건 이중 방어의 첫 겹이다.

   categoryId가 이 ownerId 소유가 아니거나 존재하지 않으면 null —
   buildCategorySkinContext()와 동일하다.
========================================================== */

/* =========================================================
   buildMemosSkinContext(ownerId, options) -> MEMOS context | null
   (HIGHLIGHT-1 §7)

   여러 원본 글 카테고리에서 만들어진 하이라이트 카드를 한 화면에
   모은다. 여기서 말하는 "폴더"는 **원본 글의 카테고리**다 — 별도의
   중첩 폴더 시스템(post_folders)을 만들지 않는다(요구사항 7).

   ★ 카드를 손으로 옮기지 않아도 된다

   카드가 어느 폴더에 속하는지는 저장된 값이 아니라 **지금의**
   posts.category_id다(posts-view-highlight-store.js가 posts를 embed해
   함께 받는다). 그래서 글의 카테고리를 옮기면 카드도 따라 옮겨가고,
   카테고리가 없는 글의 카드도 "카테고리 없음" 폴더에 모여 누락되지
   않는다.

   ★ 보이는 것만 온다

   목록도 개수도 전부 post_highlights의 SELECT 정책을 통과한 행으로만
   만든다 — 비밀글/비공개 글/삭제된 글의 발췌문은 방문자의 목록에도
   개수에도 나타나지 않는다(요구사항 11).

   options
     view        "all" | "folders"   (기본 "all")
     categoryId  폴더 하나를 연 경우 그 카테고리 id("none"이면 무분류)
========================================================== */

async function buildMemosSkinContext(
  ownerId,
  options = {}
) {

  if (!ownerId) {

    throw new Error(
      "buildMemosSkinContext: ownerId is required"
    );

  }


  const commonData =
    await fetchSkinCommonData(ownerId);


  const [
    base,
    cards,
    folderSettings
  ] =
    await Promise.all([
      buildBaseSkinContext(ownerId, options, commonData),
      loadMemoHighlightCards(ownerId),
      loadMemoFolderSettings(ownerId)
    ]);


  const slug =
    commonData.slug;


  /* 조회 자체가 실패한 경우 — 빈 목록과 구분해서 알린다 */

  const hasError =
    cards === null;


  const list =
    Array.isArray(cards)
      ? cards
      : [];


  const categoryById =
    new Map(
      commonData.categories.map(
        (category) =>
          [category.id, category]
      )
    );


  const MEMO_UNFILED_ID =
    "none";


  const folderKeyOf =
    (card) =>
      card.categoryId === null ||
      !categoryById.has(card.categoryId)
        ? MEMO_UNFILED_ID
        : String(card.categoryId);


  const requestedKey =
    options.categoryId === undefined ||
    options.categoryId === null ||
    options.categoryId === ""
      ? null
      : String(options.categoryId);


  const buildCard =
    (card) => {

  /*
    이 카드의 위치 확인 상태. 기록에 남은 확인 시각과 지금 글의
    수정 시각(card.postUpdatedAt)을 대조하므로, 원문을 고치면 그
    기록은 자동으로 "아직 확인하지 않음"이 된다.
  */

  const cardPlacement =
    typeof getPostHighlightPlacementState === "function"
      ? getPostHighlightPlacementState(
          card.id,
          card.postId,
          card.postUpdatedAt
        )
      : "unknown";


  return ({

      id:
        card.id,

      excerpt:
        card.excerpt,

      note:
        card.note ||
        "",

      hasNote:
        Boolean(card.note),

      color:
        card.color,

      date:
        card.createdAt,

      dateLabel:
        formatSkinPublishedAtLabel(card.createdAt),

      postId:
        card.postId === null
          ? null
          : String(card.postId),

      postTitle:
        maskSkinPostTitle(
          card.postVisibility,
          card.postTitle
        ),

      /*
        원문 이동 — 정식 글 주소만 넣는다. 발췌문도 메모도 주소에
        싣지 않는다(요구사항 6). 발췌한 자리까지 스크롤하는 것은
        도착한 화면이 저장된 하이라이트로 찾는다.
      */

      postHref:
        card.postId === null
          ? null
          : buildSitePath(slug, `/post/${card.postId}`),

      categoryName:
        categoryById.get(card.categoryId)?.name ||
        "",

      categoryHref:
        categoryById.has(card.categoryId)
          ? buildSitePath(slug, `/category/${card.categoryId}`)
          : null,

      folderId:
        folderKeyOf(card),

      folderHref:
        buildSiteMemosPath(
          slug,
          folderKeyOf(card)
        ),

      /*
        원문에서 그 자리를 찾았는가 — **세 가지 상태**다(요구사항 9).

          "unknown"  아직 확인하지 않음(이 기기에서 그 글을 연 적이
                     없거나, 연 뒤에 본문이 수정됐거나, 그 카드가
                     확인 뒤에 생겼다)
          "found"    마지막 확인에서 찾았다
          "missing"  마지막 확인에서 찾지 못했다

        판정은 그 글을 열 때 본문 위에서 정확히 이뤄지고, 그 결과만
        이 브라우저에 남는다(posts-view-highlight-store.js). 목록을
        그리려고 카드마다 원문을 다시 받지 않는다 — 그건 카드 수만큼의
        조회다. 대신 기록에 **그때의 글 수정 시각**이 함께 있어, 그
        뒤에 원문이 바뀌었으면 자동으로 unknown으로 돌아간다(아래
        postUpdatedAt).

        "확인한 적 없음"을 "정상"으로 단정하지 않는다 — 그래서 상태가
        둘이 아니라 셋이다. 어느 쪽이든 발췌문·메모·카드는 그대로
        보존된다.

        isMissing은 이전 계약 그대로 남긴다(기존 스킨이 쓰고 있다) —
        missing일 때만 true이고 unknown은 false다.
      */

      placement:
        cardPlacement,

      isMissing:
        cardPlacement === "missing",

      isPlacementUnknown:
        cardPlacement === "unknown",

      isPlaced:
        cardPlacement === "found",

      placementLabel:
        cardPlacement === "missing"
          ? "원문에서 위치를 찾을 수 없음"
          : cardPlacement === "unknown"
            ? "원문 위치 확인 전"
            : ""

    });

    };


  const allCards =
    list.map(buildCard);


  /*
    폴더 목록. 카드가 하나라도 있는 카테고리만 낸다 — 빈 폴더를
    나열할 이유가 없다. 순서는 메모 전용 설정(memo_folder_settings)이
    있으면 그것, 없으면 원본 카테고리 순서다.
  */

  const countByKey =
    new Map();


  allCards.forEach(
    (card) => {

      countByKey.set(
        card.folderId,
        (countByKey.get(card.folderId) || 0) + 1
      );

    }
  );


  const folders =
    Array.from(countByKey.keys())
      .map(
        (key) => {

          const numericId =
            key === MEMO_UNFILED_ID
              ? null
              : Number(key);

          const settings =
            numericId === null
              ? null
              : folderSettings.get(numericId);

          const category =
            numericId === null
              ? null
              : categoryById.get(numericId);


          return {

            id:
              key,

            name:
              category
                ? category.name
                : "카테고리 없음",

            href:
              buildSiteMemosPath(slug, key),

            count:
              countByKey.get(key) || 0,

            countLabel:
              `${countByKey.get(key) || 0}개`,

            /*
              커버는 메모 화면 전용 설정이다 — 원본 카테고리의
              갤러리 설정과 완전히 별개다(요구사항 7).
            */

            coverUrl:
              settings && numericId !== null
                ? buildMemoFolderCoverUrl(numericId)
                : null,

            hasCover:
              Boolean(settings && settings.hasCover),

            coverRatio:
              settings
                ? settings.coverRatio
                : "original",

            coverFocusX:
              settings
                ? settings.coverFocusX
                : 50,

            coverFocusY:
              settings
                ? settings.coverFocusY
                : 50,

            sortOrder:
              settings
                ? settings.sortOrder
                : null,

            categoryOrder:
              category
                ? commonData.categories.indexOf(category)
                : 9999

          };

        }
      )
      .sort(
        (a, b) => {

          const aOrder =
            a.sortOrder === null
              ? a.categoryOrder
              : a.sortOrder;

          const bOrder =
            b.sortOrder === null
              ? b.categoryOrder
              : b.sortOrder;


          if (aOrder !== bOrder) {

            return aOrder - bOrder;

          }


          return a.categoryOrder - b.categoryOrder;

        }
      );


  const openFolder =
    requestedKey === null
      ? null
      : (
          folders.find(
            (folder) =>
              folder.id === requestedKey
          ) ||
          {
            id: requestedKey,

            name:
              categoryById.get(Number(requestedKey))?.name ||
              (
                requestedKey === MEMO_UNFILED_ID
                  ? "카테고리 없음"
                  : ""
              ),

            href:
              buildSiteMemosPath(slug, requestedKey),

            count: 0,

            coverUrl: null,
            hasCover: false,
            coverRatio: "original",
            coverFocusX: 50,
            coverFocusY: 50
          }
        );


  const visibleCards =
    requestedKey === null
      ? allCards
      : allCards.filter(
          (card) =>
            card.folderId === requestedKey
        );


  return {

    ...base,

    page:
      buildSkinPageMeta("memos"),

    memos: {

      view: {

        isAll:
          requestedKey === null &&
          options.view !== "folders",

        isFolders:
          requestedKey === null &&
          options.view === "folders",

        isFolder:
          requestedKey !== null

      },

      allHref:
        buildSiteMemosPath(slug),

      foldersHref:
        buildSiteMemosPath(slug) + "?view=folders",

      /* 보기 전환 버튼의 글자 — 스킨이 자기 문구를 쓰고 싶으면 무시하면 된다 */

      allLabel:
        "전체",

      foldersLabel:
        "폴더별",

      cards:
        visibleCards,

      count:
        visibleCards.length,

      isEmpty:
        visibleCards.length === 0 &&
        !(
          requestedKey === null &&
          options.view === "folders"
        ),

      /*
        카드 목록을 그릴 차례인가 — 폴더 격자를 보는 중에는 아니다.
        data-imory-if가 비교 연산을 지원하지 않아 미리 계산해 둔다
        (page.isHome 등과 같은 이유).
      */

      showCards:
        options.view !== "folders" ||
        requestedKey !== null,

      folders,

      folderCount:
        folders.length,

      hasFolders:
        folders.length > 0,

      foldersEmpty:
        options.view === "folders" &&
        requestedKey === null &&
        folders.length === 0,

      folder:
        openFolder,

      hasError,

      canManage:
        base.viewer.isOwner

    }

  };

}


async function buildBannerSkinContext(
  ownerId,
  categoryId,
  options = {}
) {

  if (!ownerId) {

    throw new Error(
      "buildBannerSkinContext: ownerId is required"
    );

  }

  if (categoryId === undefined || categoryId === null) {

    throw new Error(
      "buildBannerSkinContext: categoryId is required"
    );

  }


  const commonData =
    await fetchSkinCommonData(ownerId);


  const [
    base,
    category,
    bannersRaw
  ] =
    await Promise.all([
      buildBaseSkinContext(ownerId, options, commonData),
      fetchSkinCategoryById(ownerId, categoryId),
      fetchSkinBanners(ownerId, [categoryId])
    ]);


  if (!category) {
    return null;
  }


  return {

    ...base,

    page:
      buildSkinPageMeta("banner"),

    bannerCategory: {
      id: String(category.id),
      name: category.name,
      type: category.type,
      href: buildSitePath(commonData.slug, `/category/${category.id}`),

      items:
        bannersRaw.map(
          (banner) => ({
            id: String(banner.id),
            name: banner.name || "",
            alt: banner.name || null,
            href:
              typeof banner.url === "string" && isSafeSkinUrl(banner.url)
                ? banner.url
                : null,
            imageUrl:
              typeof banner.image_url === "string" && isSafeSkinUrl(banner.image_url)
                ? banner.image_url
                : null
          })
        )
    }

  };

}


/* =========================================================
   buildSkinContext(ownerId, options) — 기존 호출부 하위 호환용
   별칭(skin/skin-home.js, studio/studio-preview.js가 계속
   이 이름으로 부른다). buildHomeSkinContext()와 완전히 동일하다.

   ownerId: 대상 사용자의 profiles.user_id(필수) — slug→user_id
   변환은 호출자(home/site-owner.js의 getSiteOwner() 등)의
   책임이고, 이 함수는 이미 해석된 ownerId만 받는다.

   options.imageSlotNames: 렌더링할 Skin Version의
   imageSlots[].name 목록(기본 빈 배열).
   options.imageSlotValues: { slotName: url } 맵 — 공개 HOME
   경로에서는 get_published_skin RPC의 imageSlotValues를 그대로
   전달한다(기본 빈 객체).
========================================================== */

async function buildSkinContext(
  ownerId,
  options = {}
) {

  return buildHomeSkinContext(
    ownerId,
    options
  );

}
