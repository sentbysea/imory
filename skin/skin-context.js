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
========================================================== */

const SKIN_CONTEXT_LANGUAGE =
  "ko";

const SKIN_HOME_RECENT_POSTS_LIMIT =
  5;

const SKIN_CONTEXT_SITE_SETTINGS_KEYS =
  ["blog_title", "favicon_url"];


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


  const banners =
    await fetchSkinBanners(
      ownerId,
      bannerCategoryIds
    );


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


  return {

    site: {
      title:
        siteSettings.blog_title?.trim() ||
        profile?.nickname ||
        "Imory",
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
      categories:
        categories.map(
          (category) => ({
            id: String(category.id),
            name: category.name,
            type: category.type,
            href: buildSitePath(slug, `/category/${category.id}`),
            itemCount: null
          })
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

    images

  };

}


/* =========================================================
   page namespace 헬퍼 — 항상 하나의 page.type만 true다
   (PHASE1C 3-2/3-3절). data-imory-if가 비교 연산을 지원하지
   않기 때문에 boolean 3종을 함께 발급해 둔다.
========================================================== */

function buildSkinPageMeta(
  type
) {

  return {
    type,
    isHome: type === "home",
    isCategory: type === "category",
    isPost: type === "post"
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
            categoryName: categoryNameById.get(post.category_id) ?? null
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
            publishedAt: post.created_at
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
      categoryName,
      categoryHref
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
