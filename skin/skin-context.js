/* =========================================================
   SKIN CONTEXT BUILDER

   AI_SKIN_PHASE1A_DESIGN.md 1절(Skin Context v0.1)의 6개
   namespace(site/profile/navigation/home/banners/images)를
   실제 Supabase 조회 결과로 채워서 돌려주는 유일한 진입점.

   Skin(html/css)은 이 파일이 만든 shape에만 의존하고, DB
   컬럼명에는 절대 의존하지 않는다 — DB 스키마가 바뀌어도
   이 파일만 고치면 기존에 저장된 Skin은 영향받지 않는다
   (PHASE1A_DESIGN.md 1절 전문).

   v0.1은 HOME 전용이다. LIST/POST 계약(list.* / post.*)은 이
   파일의 범위가 아니다(PHASE1A_DESIGN.md 9절).

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
   buildSkinContext(ownerId, options)

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

  if (!ownerId) {

    throw new Error(
      "buildSkinContext: ownerId is required"
    );

  }


  const {
    imageSlotNames = [],
    imageSlotValues = {}
  } =
    options;


  const [
    profile,
    siteSettings,
    categories,
    recentPostsRaw
  ] =
    await Promise.all([
      fetchSkinProfile(ownerId),
      fetchSkinSiteSettings(ownerId),
      fetchSkinCategories(ownerId),
      fetchSkinRecentPosts(ownerId)
    ]);


  const slug =
    profile?.slug ??
    "";


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


  const categoryNameById =
    new Map(
      categories.map(
        (category) =>
          [category.id, category.name]
      )
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

    home: {
      recentPosts:
        recentPostsRaw.map(
          (post) => ({
            id: String(post.id),
            title: maskSkinPostTitle(post.visibility, post.title),
            href: buildSitePath(slug, `/post/${post.id}`),
            publishedAt: post.created_at,
            categoryName: categoryNameById.get(post.category_id) ?? null
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
