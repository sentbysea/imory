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

var SANDBOX_CONTEXT_PAGE_TYPES = ["home", "category", "post"];


/*
  ★ SANDBOX-2 — href 와 이미지 주소를 옮기는 규칙

  href: 값 자체는 **바꾸지 않는다**(native 렌더와 글자 단위로 같은
  DOM 이 나와야 한다). 대신 부모 쪽에서 옮길 때마다
  options.nav.mint(href) 를 불러 "이 주소는 눌러도 되는가"를 그
  자리에서 판정하고 표에 등록한다(skin/sandbox/skin-sandbox-nav.js).
  프레임 쪽 재투영에는 options 가 없으므로 문자열만 옮긴다.

  이미지 주소: 프레임 문서의 origin 은 부모와 다르다. `/api/post-cover
  ?image=7` 같은 **상대 주소**를 그대로 보내면 프레임 origin 에서
  404 가 난다. 그래서 부모가 옮길 때 자기 origin 기준 절대 주소로
  바꾼다(options.origin). CSP img-src 에 부모 origin 이 들어 있다
  (core/lib/skin-sandbox-server.js resolveSandboxMediaOrigins).

  ★ 폴더 트리 깊이 상한. 제품 규칙은 3단계지만(IMORY_FOLDER1_DESIGN.md),
  위조 메시지가 깊은 구조를 보내 재귀를 폭주시키지 못하게 여기서
  한 번 더 막는다.
*/

var SANDBOX_MAX_TREE_DEPTH = 8;


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


/* =========================================================
   ★ 투영 중에만 살아 있는 옵션 (부모에서만 채워진다)

   projectSkinContextForSandbox() 가 시작할 때 세우고 끝날 때
   비운다. 투영은 동기 함수 하나의 호출 트리 안에서만 돌고 재진입이
   없으므로(비동기 경계가 없다) 이 한 칸으로 충분하다 — 항목
   투영기 20여 개에 인자를 하나씩 더 달아 다니는 것보다 읽기 쉽다.

   프레임 쪽 재투영에서는 언제나 비어 있다. 그래서 프레임은
   주소를 등록하지도, 절대 주소로 바꾸지도 않는다 — 부모가 보낸
   문자열을 그대로 옮기기만 한다.
========================================================== */

var SANDBOX_PROJECT_OPTS = null;


/*
  href 하나. 값은 바꾸지 않고 **표에만 등록**한다(위 주석).
*/

function sandboxHref(value) {

  const href =
    sandboxStr(value);

  if (
    href &&
    SANDBOX_PROJECT_OPTS &&
    SANDBOX_PROJECT_OPTS.nav &&
    typeof SANDBOX_PROJECT_OPTS.nav.mint === "function"
  ) {

    SANDBOX_PROJECT_OPTS.nav.mint(href);

  }


  return href;

}


/*
  이미지/미디어 주소. 부모가 옮길 때만 자기 origin 기준 절대 주소로
  바꾼다. 이미 절대 주소(https://…)면 그대로 둔다.
*/

function sandboxImageUrl(value) {

  const url =
    sandboxStr(value);

  if (!url) {
    return url;
  }


  const origin =
    SANDBOX_PROJECT_OPTS && typeof SANDBOX_PROJECT_OPTS.origin === "string"
      ? SANDBOX_PROJECT_OPTS.origin
      : "";

  if (!origin) {
    return url;
  }


  /* protocol-relative(//host/…) 는 건드리지 않는다 — 그대로 유효하다 */

  if (url.charAt(0) === "/" && url.charAt(1) !== "/") {
    return origin + url;
  }


  return url;

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
    href: sandboxHref(item.href),
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
    href: sandboxHref(nav.href),
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
    imageUrl: sandboxImageUrl(banner.imageUrl),
    href: sandboxHref(banner.href),
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
    href: sandboxHref(post.href),
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
    postHref: sandboxHref(card.postHref),
    hasNoPostLink: sandboxBool(card.hasNoPostLink),
    categoryName: sandboxStr(card.categoryName),
    folderName: sandboxStr(card.folderName),
    folderNamePath: sandboxStrArray(card.folderNamePath),
    sourcePathLabel: sandboxStr(card.sourcePathLabel),
    sourcePathSegments: sandboxStrArray(card.sourcePathSegments),
    categoryHref: sandboxHref(card.categoryHref),
    folderId: sandboxStr(card.folderId),
    folderHref: sandboxHref(card.folderHref),
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
    faviconUrl: sandboxImageUrl(value.faviconUrl),
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
    avatarUrl: sandboxImageUrl(value.avatarUrl)
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

    out[name] = sandboxImageUrl(images[name]);

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
    isCategory: pageType === "category",
    isPost: pageType === "post",
    isBanner: false,
    isFolder: false,
    isHighlights: false,
    isMemos: false
  };

}


/* =========================================================
   SANDBOX-2 — CATEGORY

   원본 shape: skin/skin-context.js buildCategorySkinContext()의
   context.category. 여기 없는 키는 프레임에 가지 않는다.

   ★ 본문은 여기에도 없다. category.posts/gallery.cards 는 제목·
     날짜·주소·썸네일뿐이고, 비밀글 제목은 이미 마스킹된 값이며
     비밀글의 대표 이미지 주소는 Context 단계에서 이미 잠금
     이미지로 바뀌어 있다(IMORY_GALLERY1_DESIGN.md).
========================================================== */

function projectSandboxCategoryPost(post) {

  if (!sandboxPlainObject(post)) {
    return null;
  }


  return {
    id: sandboxStr(post.id),
    title: sandboxStr(post.title),
    href: sandboxHref(post.href),
    publishedAt: sandboxStr(post.publishedAt),
    publishedAtLabel: sandboxStr(post.publishedAtLabel),
    isSecret: sandboxBool(post.isSecret)
  };

}


/*
  폴더 트리 노드. kind 로 갈리는 두 모양이고, 폴더 노드만 children
  을 갖는다(재귀). depth 는 Context 가 넣어 준 값을 그대로 옮기되,
  재귀 자체는 SANDBOX_MAX_TREE_DEPTH 에서 끊는다.
*/

function projectSandboxTreeNode(node, depth) {

  if (!sandboxPlainObject(node)) {
    return null;
  }


  if (node.kind === "post") {

    return {
      kind: "post",
      id: sandboxStr(node.id),
      title: sandboxStr(node.title),
      href: sandboxHref(node.href),
      publishedAt: sandboxStr(node.publishedAt),
      publishedAtLabel: sandboxStr(node.publishedAtLabel),
      isSecret: sandboxBool(node.isSecret),
      depth: sandboxInt(node.depth)
    };

  }


  if (node.kind !== "folder") {
    return null;
  }


  return {
    kind: "folder",
    id: sandboxStr(node.id),
    name: sandboxStr(node.name),
    depth: sandboxInt(node.depth),
    folderHref: sandboxHref(node.folderHref),
    postCount: sandboxInt(node.postCount),

    children:
      depth >= SANDBOX_MAX_TREE_DEPTH
        ? []
        : projectSandboxTree(node.children, depth + 1)
  };

}


function projectSandboxTree(nodes, depth) {

  if (!Array.isArray(nodes)) {
    return [];
  }


  const out =
    [];

  for (let i = 0; i < nodes.length; i += 1) {

    const item =
      projectSandboxTreeNode(nodes[i], depth);

    if (item) {
      out.push(item);
    }

  }


  return out;

}


/* 갤러리 카드의 사진 한 장 */

function projectSandboxGalleryImage(image) {

  if (!sandboxPlainObject(image)) {
    return null;
  }


  return {
    id: sandboxStr(image.id) || sandboxInt(image.id),
    url: sandboxImageUrl(image.url),
    alt: sandboxStr(image.alt),
    isPrimary: sandboxBool(image.isPrimary)
  };

}


function projectSandboxGalleryCard(card) {

  if (!sandboxPlainObject(card)) {
    return null;
  }


  return {
    id: sandboxStr(card.id),
    title: sandboxStr(card.title),
    href: sandboxHref(card.href),
    publishedAt: sandboxStr(card.publishedAt),
    publishedAtLabel: sandboxStr(card.publishedAtLabel),
    isSecret: sandboxBool(card.isSecret),
    isPrivate: sandboxBool(card.isPrivate),
    thumbnailUrl: sandboxImageUrl(card.thumbnailUrl),
    thumbnailAlt: sandboxStr(card.thumbnailAlt),
    hasThumbnail: sandboxBool(card.hasThumbnail),
    isPlaceholder: sandboxBool(card.isPlaceholder),
    isLocked: sandboxBool(card.isLocked),
    images: sandboxMap(card.images, projectSandboxGalleryImage),
    additionalImages: sandboxMap(card.additionalImages, projectSandboxGalleryImage),
    hasAdditionalImages: sandboxBool(card.hasAdditionalImages),
    imageCount: sandboxInt(card.imageCount),
    hasImages: sandboxBool(card.hasImages)
  };

}


function projectSandboxGallery(gallery) {

  if (!sandboxPlainObject(gallery)) {
    return null;
  }


  const cards =
    sandboxMap(gallery.cards, projectSandboxGalleryCard);


  return {
    cards: cards,
    count: cards.length,
    isEmpty: cards.length === 0,
    hasCards: cards.length > 0,
    isEmptyCategory: sandboxBool(gallery.isEmptyCategory)
  };

}


function projectSandboxPageLink(item) {

  if (!sandboxPlainObject(item)) {
    return null;
  }


  return {
    number: sandboxInt(item.number),
    label: sandboxStr(item.label),
    href: sandboxHref(item.href),
    isCurrent: sandboxBool(item.isCurrent)
  };

}


function projectSandboxPagination(pagination) {

  if (!sandboxPlainObject(pagination)) {
    return null;
  }


  return {
    currentPage: sandboxInt(pagination.currentPage),
    currentPageLabel: sandboxStr(pagination.currentPageLabel),
    pageSize: sandboxInt(pagination.pageSize),
    totalCount: sandboxInt(pagination.totalCount),
    totalPages: sandboxInt(pagination.totalPages),
    totalPagesLabel: sandboxStr(pagination.totalPagesLabel),
    style: sandboxStr(pagination.style),
    isDecimal: sandboxBool(pagination.isDecimal),
    isRomanLower: sandboxBool(pagination.isRomanLower),
    windowSize: sandboxInt(pagination.windowSize),
    hasLeadingEllipsis: sandboxBool(pagination.hasLeadingEllipsis),
    hasTrailingEllipsis: sandboxBool(pagination.hasTrailingEllipsis),
    hasPages: sandboxBool(pagination.hasPages),
    hasPrev: sandboxBool(pagination.hasPrev),
    hasNext: sandboxBool(pagination.hasNext),
    prevHref: sandboxHref(pagination.prevHref),
    nextHref: sandboxHref(pagination.nextHref),
    firstHref: sandboxHref(pagination.firstHref),
    lastHref: sandboxHref(pagination.lastHref),
    pages: sandboxMap(pagination.pages, projectSandboxPageLink),
    allPages: sandboxMap(pagination.allPages, projectSandboxPageLink)
  };

}


function projectSandboxCategory(category) {

  const value =
    sandboxPlainObject(category) ? category : {};


  return {
    id: sandboxStr(value.id),
    name: sandboxStr(value.name),
    type: sandboxStr(value.type),
    href: sandboxHref(value.href),

    posts: sandboxMap(value.posts, projectSandboxCategoryPost),

    hasFolders: sandboxBool(value.hasFolders),
    tree: projectSandboxTree(value.tree, 1),
    showPostsList: sandboxBool(value.showPostsList),

    listStyle: sandboxStr(value.listStyle),
    pageSize: sandboxInt(value.pageSize),
    paginationStyle: sandboxStr(value.paginationStyle),
    paginationWindowSize: sandboxInt(value.paginationWindowSize),
    paginatePosts: sandboxBool(value.paginatePosts),
    hasPagination: sandboxBool(value.hasPagination),

    isGallery: sandboxBool(value.isGallery),
    isList: sandboxBool(value.isList),

    gallery: projectSandboxGallery(value.gallery),
    pagination: projectSandboxPagination(value.pagination)
  };

}


/* =========================================================
   SANDBOX-2 — POST

   원본 shape: buildPostSkinContext()의 context.post. 그 함수가
   본문(content/ooc_content)과 secret_password_hash 를 애초에
   select 하지 않으므로 여기에 들어올 경로 자체가 없다
   (AI_SKIN_PHASE1C_PAGE_CONTRACT.md 6-1/7-2절).

   본문은 **다른 메시지**로 간다(IMORY_POST_BODY) — 그래야
   "Context 로는 본문에 닿을 수 없다"는 계약이 프레임 경계에서도
   같은 모양으로 선다.
========================================================== */

function projectSandboxPost(post) {

  const value =
    sandboxPlainObject(post) ? post : {};


  return {
    id: sandboxStr(value.id),
    title: sandboxStr(value.title),
    publishedAt: sandboxStr(value.publishedAt),
    publishedAtLabel: sandboxStr(value.publishedAtLabel),
    categoryName: sandboxStr(value.categoryName),
    categoryHref: sandboxHref(value.categoryHref),
    href: sandboxHref(value.href)
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

function projectSkinContextForSandbox(context, pageType, options) {

  if (SANDBOX_CONTEXT_PAGE_TYPES.indexOf(pageType) === -1) {
    return null;
  }


  if (!sandboxPlainObject(context)) {
    return null;
  }


  /*
    ★ 부모에서만 채워지는 옵션(nav 표 · origin). 프레임 재투영은
    options 없이 부르므로 이 칸이 비어 있고, 그래서 프레임은 주소를
    등록하지도 절대 주소로 바꾸지도 않는다.
  */

  SANDBOX_PROJECT_OPTS =
    sandboxPlainObject(options) ? options : null;


  try {

    const projected = {

      contract: SANDBOX_CONTEXT_CONTRACT,
      pageType: pageType,

      page: projectSandboxPageMeta(pageType),

      site: projectSandboxSite(context.site),
      profile: projectSandboxProfile(context.profile),
      navigation: projectSandboxNavigation(context.navigation),
      banners: projectSandboxBanners(context.banners),

      viewer: projectSandboxViewer(context.viewer),

      images: projectSandboxImages(context.images),

      /*
        ★ 페이지별 namespace 는 **그 페이지의 것만** 넣는다.
        CATEGORY 화면에 home.recentPosts 를, POST 화면에
        category.posts 를 보내지 않는다 — 스킨이 그 자리를
        그리지도 않을뿐더러, 안 보내도 되는 것을 보내지 않는 것이
        이 파일의 일이다.
      */

      home:
        pageType === "home"
          ? projectSandboxHome(context.home)
          : null,

      category:
        pageType === "category"
          ? projectSandboxCategory(context.category)
          : null,

      post:
        pageType === "post"
          ? projectSandboxPost(context.post)
          : null,

      /*
        nav 표. 위 투영이 도는 동안 mint() 가 채운 것을 마지막에
        꺼낸다 — 부모에서만 채워지고, 프레임 재투영에서는 도착한
        표를 **검사해서** 옮긴다(부모를 믿지 않는다).
      */

      nav:
        SANDBOX_PROJECT_OPTS &&
        SANDBOX_PROJECT_OPTS.nav &&
        typeof SANDBOX_PROJECT_OPTS.nav.entries === "function"
          ? { entries: SANDBOX_PROJECT_OPTS.nav.entries() }
          : projectSandboxNavTable(context.nav)

    };


    return projected;

  }

  finally {

    SANDBOX_PROJECT_OPTS = null;

  }

}


/* =========================================================
   projectSandboxNavTable(value)

   프레임 쪽. 도착한 nav 표를 알려진 모양으로만 옮긴다. 검사
   함수 자체는 skin/sandbox/skin-sandbox-nav.js 에 있지만, 그
   파일은 부모 전용이라 프레임에 로드되지 않을 수도 있다 —
   없으면 여기서 같은 규칙으로 직접 본다.
========================================================== */

function projectSandboxNavTable(value) {

  if (!sandboxPlainObject(value) || !Array.isArray(value.entries)) {
    return { entries: [] };
  }


  const out =
    [];

  for (let i = 0; i < value.entries.length; i += 1) {

    const entry =
      value.entries[i];

    if (
      !sandboxPlainObject(entry) ||
      !Number.isInteger(entry.id) ||
      entry.id < 1 ||
      typeof entry.href !== "string" ||
      !entry.href
    ) {
      continue;
    }

    out.push({ id: entry.id, href: entry.href });

  }


  return { entries: out };

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

  /*
    ★ 셋 다 **언제나 있다**(그 페이지가 아니면 null). 키의 유무로
    페이지를 가르지 않는 이유: 렌더러는 없는 값과 null 을 같게
    다루고, 최상위 키 집합이 고정이어야 아래 검사가 "정확히 이
    집합인가"를 물을 수 있다.
  */
  "home",
  "category",
  "post",

  /* SANDBOX-2 — 부모가 발급한 navId 표 */
  "nav"
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


  /*
    ★ 최상위 pageType 과 page.type 이 같아야 한다.

    page type 이 셋으로 늘어난 SANDBOX-2에서 새로 필요해진 검사다.
    이것이 없으면 "HOME 으로 만든 payload 의 pageType 만 post 로
    바꿔치기한" 메시지가 shape 검사를 통과한다 — 그 뒤 재투영이
    post 로 돌면서 home 데이터가 통째로 사라진 화면이 그려진다.
    두 값이 어긋난 payload 는 계약 위반이므로 아예 거부한다.
  */

  if (
    !sandboxPlainObject(data.page) ||
    data.page.type !== data.pageType
  ) {
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
    SANDBOX_MAX_TREE_DEPTH,
    projectSkinContextForSandbox,
    projectSandboxNavTable,
    isSandboxContextShape
  };

}
