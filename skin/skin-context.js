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

   의존이 하나 늘었다: isSafeSkinUrl(skin/skin-sanitize.js) —
   banner의 외부 URL/이미지 URL을 Context 단계에서 1차로 거르는 데
   쓴다(렌더 시점 재검증은 skin-render.js가 그대로 담당).
========================================================== */

const SKIN_CONTEXT_LANGUAGE =
  "ko";

const SKIN_HOME_RECENT_POSTS_LIMIT =
  5;

const SKIN_CONTEXT_SITE_SETTINGS_KEYS =
  ["blog_title", "favicon_url"];

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

  const {
    data,
    error
  } =
    await supabaseClient
      .from("categories")
      .select("id, name, type")
      .eq("user_id", ownerId)
      .eq("id", categoryId)
      .maybeSingle();


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
      .select("id, title, created_at, visibility")
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
========================================================== */

function buildSkinImages(
  imageSlotNames,
  imageSlotValues
) {

  const images =
    {};


  (imageSlotNames || []).forEach(
    (slotName) => {

      images[slotName] =
        imageSlotValues?.[slotName] ??
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


  const images =
    buildSkinImages(
      imageSlotNames,
      imageSlotValues
    );


  /*
    profile.avatarUrl은 images.profile과 항상 같은 값이어야
    한다(PHASE1A_DESIGN.md 1-2절 — 별도 프로필 이미지 업로드
    기능이 없어 이미지 슬롯 해석값을 그대로 재노출). 같은
    images 맵에서 읽어야 "profile" 슬롯이 imageSlotNames에
    없을 때 둘 다 동일하게 null이 된다.
  */

  const avatarUrl =
    Object.prototype.hasOwnProperty.call(images, "profile")
      ? images.profile
      : null;


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
    viewer(PHASE 1E 3절) — 소유자일 때만 글쓰기/관리 href를 채운다.
    비소유자에게는 isOwner=false와 함께 두 href 모두 null이라,
    Skin이 실수로 data-imory-if를 빠뜨려도 링크가 만들어지지
    않는다(data-imory-href는 값이 문자열이 아니면 href 속성 자체를
    지운다, skin-render.js).

    writeHref: Imory에는 독립된 "글쓰기 URL"이 없다 — 글은 항상
    카테고리 목록 화면의 + 버튼(posts/editor/posts-list-detail-nav.js)
    에서 시작한다. 그래서 HOME처럼 카테고리가 정해지지 않은
    화면에서는 첫 번째 POST 카테고리 목록으로 보낸다: 그 화면이
    바로 기존 글쓰기 진입점이고, 동시에 다른 카테고리를 고를 수
    있는 기존 카테고리 선택 흐름이기도 하다. POST 카테고리가 하나도
    없으면 null(링크 자체가 사라진다). 이 판단은 항상 이 파일이
    하고, Skin은 category id를 전혀 모른다.
  */

  const isOwner =
    !!viewerId &&
    viewerId === ownerId;


  const firstPostCategory =
    categoryItems.find(
      (category) =>
        category.type === "post"
    ) ||
    null;


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
        categoryItems.filter(
          (category) =>
            category.type === "post"
        ),

      bannerCategories:
        categoryItems.filter(
          (category) =>
            category.type === "banner"
        )

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
        isOwner && firstPostCategory
          ? firstPostCategory.href
          : null,

      adminHref:
        isOwner
          ? `${SITE_BASE_PATH}${SKIN_CONTEXT_ADMIN_SUBPATH}`
          : null

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
    isBanner: type === "banner"
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
    postsRaw
  ] =
    await Promise.all([
      buildBaseSkinContext(ownerId, options, commonData),
      fetchSkinCategoryById(ownerId, categoryId),
      fetchSkinCategoryPosts(ownerId, categoryId)
    ]);


  if (!category) {
    return null;
  }


  return {

    ...base,

    page:
      buildSkinPageMeta("category"),

    category: {
      id: String(category.id),
      name: category.name,
      type: category.type,
      href: buildSitePath(commonData.slug, `/category/${category.id}`),

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
        )
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


  return {

    ...base,

    page:
      buildSkinPageMeta("post"),

    post: {
      id: String(post.id),
      title: maskSkinPostTitle(post.visibility, post.title),
      publishedAt: post.created_at,
      publishedAtLabel: formatSkinPublishedAtLabel(post.created_at),
      categoryName,
      categoryHref
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
