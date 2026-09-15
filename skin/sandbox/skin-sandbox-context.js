/* =========================================================
   SKIN SANDBOX - CONTEXT PROJECTION (classic script, 의존 없음)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §D-1
   단계: SANDBOX-1 — HOME 한 장

   projectSkinContextForSandbox(context, pageType)
     -> { ...공개 렌더에 필요한 필드만 }  |  null

   ---------------------------------------------------------
   ★ 이 파일이 데이터 신뢰 경계다

   부모는 오늘과 똑같이 buildSkinContext()로 HOME Context를 만든다.
   그 객체를 **그대로 postMessage하지 않는다.** 여기서 알려진 키만
   새 리터럴로 하나씩 옮긴 결과만 프레임으로 간다.

   원본을 스프레드(`{...context}`)하지 않는 이유는
   skin/skin-package-import.js와 같다 — 나중에 Context에 필드가
   늘어도 자동으로 새어 나가는 경로가 생기지 않는다. 필드를
   추가하려면 이 파일을 고쳐야 하고, 고치는 사람은 그때 "이것을
   다른 origin에 보내도 되는가"를 한 번 묻게 된다.

   ★ 양쪽에서 각각 돈다

   보내기 전에 부모가 한 번(무엇을 보낼지 고른다), 받은 뒤에
   프레임이 한 번(무엇을 그릴지 고른다). 같은 함수다 — 프레임이
   부모를 믿지 않아도 되고, 위조 메시지가 프로토콜 검사를
   통과하더라도 renderSkin()에는 알려진 키만 닿는다.

   ---------------------------------------------------------
   ★ 절대 넣지 않는 것 (구조적으로 — 여기에 키 자체가 없다)

     - 글 본문 / OOC            오늘도 Context에 없다
     - 비밀글 원문 / 비밀번호   RLS가 막고, 제목은 이미 마스킹된다
     - 사용자 UUID(ownerId)     오늘 Context에 없다(실측)
     - access/refresh token     조회 자체를 하지 않는다
     - Supabase client / 함수 / DOM node   구조화 복사도 안 된다
     - skin_id / version_id 등 DB row 키
     - imageSlot **id**         부모가 URL로 해석해서 넣는다

   ★ 관리자 여부와 관리자 전용 링크도 넣지 않는다 (SANDBOX-1 결정)

   설계 문서 §D-1은 viewer.isOwner / adminHref / writeHref /
   manageHref 를 계약에 넣어 두었지만, 이 라운드의 지시문은
   "관리자 여부 및 관리자 전용 링크"를 전달 금지 목록에 명시한다.
   그래서 viewer 는 **언제나 방문자 값**으로 고정해서 보낸다
   (isOwner:false · 모든 href null).

   그 결과와 남은 차이:
     - sandbox HOME 은 주인장에게도 방문자 화면으로 보인다.
       스킨이 그린 WRITE/ADMIN/EDIT 링크는 나오지 않는다.
     - 어차피 이 라운드는 프레임 안 링크가 전부 비활성이고
       (네비게이션은 SANDBOX-2), 소유자 도구 자리(owner-tools)를
       cross-origin에서 채우는 방법도 아직 정해지지 않았다
       (SANDBOX-3의 미해결 항목 — 설계 문서 §F#12).
     - 켤 때가 되면 아래 SANDBOX_VIEWER_VISITOR_ONLY 한 곳만
       고치면 된다.
========================================================== */


var SANDBOX_CONTEXT_CONTRACT = 1;


/*
  true 인 동안 viewer 는 방문자 값으로 고정된다. 위 주석 참고 —
  이것을 false 로 바꾸는 것은 SANDBOX-2/3 의 결정이지 이 라운드의
  것이 아니다.
*/

var SANDBOX_VIEWER_VISITOR_ONLY = true;


/* 이번 라운드가 투영할 수 있는 page type */

var SANDBOX_CONTEXT_PAGE_TYPES = ["home"];


/*
  이미지 슬롯 이름. Context 의 images 는 키 자체가 스킨 저자가 정한
  이름이라 형태를 제한한다 — 그대로 옮기면 "__proto__" 같은 키가
  결과 객체에 들어갈 수 있다.
*/

var SANDBOX_SLOT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;


/* =========================================================
   작은 변환기들 — 타입이 아니면 안전한 기본값

   "없으면 null" 이 기본이다. 스킨 렌더러는 undefined 와 null 을
   같게 다루므로(바인딩이 비면 그 자리를 비운다) 값이 사라지는
   것이 값이 뒤바뀌는 것보다 낫다.
========================================================== */

function sandboxPlainObject(value) {

  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


function sandboxStr(value) {

  return typeof value === "string" ? value : null;

}


function sandboxBool(value) {

  return value === true;

}


function sandboxInt(value) {

  return Number.isFinite(value) ? Math.trunc(value) : null;

}


function sandboxStrArray(value) {

  if (!Array.isArray(value)) {
    return [];
  }


  const out =
    [];

  for (let i = 0; i < value.length; i += 1) {

    if (typeof value[i] === "string") {
      out.push(value[i]);
    }

  }


  return out;

}


function sandboxMap(value, projector) {

  if (!Array.isArray(value)) {
    return [];
  }


  const out =
    [];

  for (let i = 0; i < value.length; i += 1) {

    const item =
      projector(value[i]);

    if (item) {
      out.push(item);
    }

  }


  return out;

}


/* =========================================================
   항목 투영기
========================================================== */

/*
  navigation 의 메뉴 항목 하나 — navigation.categories 와
  postCategories/galleryCategories/textPostCategories/
  bannerCategories 가 **같은 shape** 이다(skin/skin-context.js
  categoryItems). navigation.home 도 같은 재료를 갖는다.
*/

function projectSandboxNavItem(item) {

  if (!sandboxPlainObject(item)) {
    return null;
  }


  return {
    id: sandboxStr(item.id),
    name: sandboxStr(item.name),
    type: sandboxStr(item.type),
    href: sandboxStr(item.href),
    iconKind: sandboxStr(item.iconKind),
    itemCount: sandboxInt(item.itemCount),
    enabled: item.enabled === undefined ? true : sandboxBool(item.enabled)
  };

}


/* navigation.highlights (= 레거시 navigation.memos, 같은 객체) */

function projectSandboxHighlightsNav(nav) {

  if (!sandboxPlainObject(nav)) {
    return null;
  }


  return {
    name: sandboxStr(nav.name),
    href: sandboxStr(nav.href),
    type: sandboxStr(nav.type),
    iconKind: sandboxStr(nav.iconKind),
    hasCategory: sandboxBool(nav.hasCategory),
    showStandaloneLink: sandboxBool(nav.showStandaloneLink),
    categoryId: sandboxStr(nav.categoryId),
    enabled: sandboxBool(nav.enabled)
  };

}


function projectSandboxBanner(banner) {

  if (!sandboxPlainObject(banner)) {
    return null;
  }


  return {
    id: sandboxStr(banner.id),
    imageUrl: sandboxStr(banner.imageUrl),
    href: sandboxStr(banner.href),
    alt: sandboxStr(banner.alt)
  };

}


/*
  home.recentPosts 항목. 제목은 **이미 마스킹된 값**이다
  (skin/skin-context.js maskSkinPostTitle) — 여기서 다시 가리지
  않는다. 가리는 일을 두 곳에서 하면 한쪽이 빠졌을 때 알기 어렵다.
*/

function projectSandboxRecentPost(post) {

  if (!sandboxPlainObject(post)) {
    return null;
  }


  return {
    id: sandboxStr(post.id),
    title: sandboxStr(post.title),
    href: sandboxStr(post.href),
    publishedAt: sandboxStr(post.publishedAt),
    publishedAtLabel: sandboxStr(post.publishedAtLabel),
    categoryId: sandboxStr(post.categoryId),
    categoryName: sandboxStr(post.categoryName),
    isSecret: sandboxBool(post.isSecret)
  };

}


/*
  home.highlights 의 카드 한 장 — 하이라이트 화면의 카드와 같은
  재료다(skin/skin-context.js createSkinHighlightCardBuilder).
  목록에 오는 행 자체가 이미 RLS 를 통과한 "보이는 것"뿐이다.
*/

function projectSandboxHighlightCard(card) {

  if (!sandboxPlainObject(card)) {
    return null;
  }


  return {
    id: sandboxStr(card.id),
    excerpt: sandboxStr(card.excerpt),
    note: sandboxStr(card.note),
    hasNote: sandboxBool(card.hasNote),
    color: sandboxStr(card.color),
    date: sandboxStr(card.date),
    dateLabel: sandboxStr(card.dateLabel),
    postId: sandboxStr(card.postId),
    postTitle: sandboxStr(card.postTitle),
    postHref: sandboxStr(card.postHref),
    hasNoPostLink: sandboxBool(card.hasNoPostLink),
    categoryName: sandboxStr(card.categoryName),
    folderName: sandboxStr(card.folderName),
    folderNamePath: sandboxStrArray(card.folderNamePath),
    sourcePathLabel: sandboxStr(card.sourcePathLabel),
    sourcePathSegments: sandboxStrArray(card.sourcePathSegments),
    categoryHref: sandboxStr(card.categoryHref),
    folderId: sandboxStr(card.folderId),
    folderHref: sandboxStr(card.folderHref),
    placement: sandboxStr(card.placement),
    isMissing: sandboxBool(card.isMissing),
    isPlacementUnknown: sandboxBool(card.isPlacementUnknown),
    isPlaced: sandboxBool(card.isPlaced),
    placementLabel: sandboxStr(card.placementLabel)
  };

}


/* =========================================================
   namespace 투영기
========================================================== */

function projectSandboxSite(site) {

  const value =
    sandboxPlainObject(site) ? site : {};


  return {
    title: sandboxStr(value.title),
    slug: sandboxStr(value.slug),
    faviconUrl: sandboxStr(value.faviconUrl),
    description: sandboxStr(value.description),
    language: sandboxStr(value.language)
  };

}


function projectSandboxProfile(profile) {

  const value =
    sandboxPlainObject(profile) ? profile : {};


  return {
    nickname: sandboxStr(value.nickname),
    bio: sandboxStr(value.bio),
    avatarUrl: sandboxStr(value.avatarUrl)
  };

}


function projectSandboxNavigation(navigation) {

  const value =
    sandboxPlainObject(navigation) ? navigation : {};


  /*
    highlights 와 memos 는 공개 Context 에서 **같은 객체**다.
    투영 결과에서도 같은 객체를 가리키게 해서 값이 갈라질 수
    없게 한다(skin/skin-context.js 의 highlightsNavigation 주석).
  */

  const highlights =
    projectSandboxHighlightsNav(value.highlights || value.memos);


  return {
    home: projectSandboxNavItem(value.home),
    categories: sandboxMap(value.categories, projectSandboxNavItem),
    postCategories: sandboxMap(value.postCategories, projectSandboxNavItem),
    galleryCategories: sandboxMap(value.galleryCategories, projectSandboxNavItem),
    textPostCategories: sandboxMap(value.textPostCategories, projectSandboxNavItem),
    bannerCategories: sandboxMap(value.bannerCategories, projectSandboxNavItem),
    highlights: highlights,
    memos: highlights
  };

}


function projectSandboxBanners(banners) {

  const value =
    sandboxPlainObject(banners) ? banners : {};


  return {
    items: sandboxMap(value.items, projectSandboxBanner)
  };

}


/*
  ★ viewer — 이 라운드에서는 입력을 **읽지 않는다**.
  상단 주석 "관리자 여부와 관리자 전용 링크도 넣지 않는다" 참고.
  키를 아예 빼지 않고 방문자 값으로 채우는 이유: 스킨이
  data-imory-if="viewer.isOwner" 로 감싼 블록이 "없는 값"이 아니라
  "false" 를 보게 해서, 없는 필드 때문에 렌더러가 다르게 도는 일이
  없게 한다.
*/

function projectSandboxViewer(viewer) {

  if (SANDBOX_VIEWER_VISITOR_ONLY) {

    return {
      isOwner: false,
      writeHref: null,
      adminHref: null,
      manageHref: null,
      toolsHref: null,
      highlightHref: null,
      canManageHighlights: false,
      canManageMemos: false
    };

  }


  const value =
    sandboxPlainObject(viewer) ? viewer : {};


  return {
    isOwner: sandboxBool(value.isOwner),
    writeHref: sandboxStr(value.writeHref),
    adminHref: sandboxStr(value.adminHref),
    manageHref: sandboxStr(value.manageHref),
    toolsHref: sandboxStr(value.toolsHref),
    highlightHref: sandboxStr(value.highlightHref),
    canManageHighlights: sandboxBool(value.canManageHighlights),
    canManageMemos: sandboxBool(value.canManageMemos)
  };

}


/*
  images — 키는 스킨이 선언한 슬롯 이름, 값은 부모가 이미 해석한
  URL 문자열이거나 null 이다. 프레임은 "슬롯"이라는 개념 자체를
  모른다(설계 문서 §C).
*/

function projectSandboxImages(images) {

  const out =
    {};


  if (!sandboxPlainObject(images)) {
    return out;
  }


  const names =
    Object.keys(images);

  for (let i = 0; i < names.length; i += 1) {

    const name =
      names[i];

    if (!SANDBOX_SLOT_NAME_PATTERN.test(name)) {
      continue;
    }

    out[name] = sandboxStr(images[name]);

  }


  return out;

}


/*
  page — 항상 정확히 하나만 true 라는 불변식을 여기서 **다시
  세운다**. 입력을 그대로 옮기지 않고 pageType 하나로부터 만든다.
*/

function projectSandboxPageMeta(pageType) {

  return {
    type: pageType,
    isHome: pageType === "home",
    isCategory: false,
    isPost: false,
    isBanner: false,
    isFolder: false,
    isHighlights: false,
    isMemos: false
  };

}


function projectSandboxHome(home) {

  const value =
    sandboxPlainObject(home) ? home : {};

  const highlights =
    sandboxPlainObject(value.highlights) ? value.highlights : {};

  const cards =
    sandboxMap(highlights.cards, projectSandboxHighlightCard);


  /*
    featured/card 는 cards 에서 **다시 만든다** — 입력의 세 값이
    서로 어긋나 있어도(위조 메시지) 프레임에서는 언제나 같은
    카드를 가리킨다.
  */

  return {

    highlights: {
      cards: cards,
      featured: cards.slice(0, 1),
      card: cards.length ? cards[0] : null,
      hasCard: cards.length > 0,
      count: cards.length,
      isEmpty: cards.length === 0,
      hasError: sandboxBool(highlights.hasError)
    },

    recentPosts:
      sandboxMap(value.recentPosts, projectSandboxRecentPost)

  };

}


/* =========================================================
   projectSkinContextForSandbox(context, pageType)

   pageType 이 이번 라운드가 아는 값이 아니거나 context 가 객체가
   아니면 null 이다 — 호출자는 그 경우 sandbox 경로를 쓰지 않는다
   (조용한 native 폴백).
========================================================== */

function projectSkinContextForSandbox(context, pageType) {

  if (SANDBOX_CONTEXT_PAGE_TYPES.indexOf(pageType) === -1) {
    return null;
  }


  if (!sandboxPlainObject(context)) {
    return null;
  }


  return {

    contract: SANDBOX_CONTEXT_CONTRACT,
    pageType: pageType,

    page: projectSandboxPageMeta(pageType),

    site: projectSandboxSite(context.site),
    profile: projectSandboxProfile(context.profile),
    navigation: projectSandboxNavigation(context.navigation),
    banners: projectSandboxBanners(context.banners),

    viewer: projectSandboxViewer(context.viewer),

    images: projectSandboxImages(context.images),

    home: projectSandboxHome(context.home)

  };

}


/* =========================================================
   isSandboxContextShape(data)

   프로토콜 층이 "plain object 인가"까지만 보고 넘긴 data 를
   프레임이 한 번 더 본다. 최상위 키가 계약 그대로인지만 본다 —
   내부는 위 투영 함수가 다시 돌면서 정리한다.
========================================================== */

var SANDBOX_CONTEXT_TOP_LEVEL_KEYS = [
  "contract",
  "pageType",
  "page",
  "site",
  "profile",
  "navigation",
  "banners",
  "viewer",
  "images",
  "home"
];


function isSandboxContextShape(data) {

  if (!sandboxPlainObject(data)) {
    return false;
  }


  if (data.contract !== SANDBOX_CONTEXT_CONTRACT) {
    return false;
  }


  if (SANDBOX_CONTEXT_PAGE_TYPES.indexOf(data.pageType) === -1) {
    return false;
  }


  const keys =
    Object.keys(data);

  for (let i = 0; i < keys.length; i += 1) {

    if (SANDBOX_CONTEXT_TOP_LEVEL_KEYS.indexOf(keys[i]) === -1) {
      return false;
    }

  }


  return true;

}


/* =========================================================
   node(단위 테스트)에서도 같은 파일을 읽을 수 있게
========================================================== */

if (typeof module !== "undefined" && module.exports) {

  module.exports = {
    SANDBOX_CONTEXT_CONTRACT,
    SANDBOX_CONTEXT_PAGE_TYPES,
    SANDBOX_CONTEXT_TOP_LEVEL_KEYS,
    SANDBOX_VIEWER_VISITOR_ONLY,
    projectSkinContextForSandbox,
    isSandboxContextShape
  };

}
