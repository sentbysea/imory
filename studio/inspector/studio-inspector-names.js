/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 사람이 읽는 요소 이름 (DIRECT-UX-1)

   기준 문서: IMORY_DIRECT_UX_DESIGN.md §2

   "고른 것이 무엇인가"를 부르는 이름은 **이 파일 한 곳**에서 만든다.
   쓰는 자리는 넷이다:

     - Select 패널 머리(이름 · 종류)       studio-inspector-controls.js
     - Preview 위 선택 이름표 · hover 이름표 studio-inspector-overlay.js
     - 겹친 요소 메뉴                       studio-inspector-quickbar.js
     - AI 선택 chip / selectionContext.label studio/ai/studio-ai-selection.js

   ★ 사용자 화면에 코드 이름을 내지 않는다
     태그(<div>) · 클래스(.bd-page) · 바인딩 경로(profile.bio) ·
     편집 식별자(e0-2-1) · selector 는 여기서 나오는 문자열에 절대
     들어가지 않는다. 그 값들은 **이름을 고르는 근거**로만 쓴다.

   ★ 근거의 순서 — 스킨 계약(Skin Data Contract)이 준 뜻이 먼저다
     1. region(post-body · owner-tools · bottom-dock …)
     2. dock 자리(data-imory-dock)
     3. 바인딩 — 무엇이 채워지는가(data-imory-bind / -src / -href)
     4. 반복 — 무엇의 목록인가(data-imory-repeat) · 그 목록을 담은 상자
     5. 템플릿 맨 바깥 = 배경
     6. 태그의 일반 이름(제목 · 메뉴 · 목록)
     7. 종류 이름(텍스트 · 이미지 · 버튼 · 링크 · 영역 · 장식 요소)

   ★ 요소는 **draft 의 stamped 사본**에서 읽는다(DOMParser). 계산
     스타일은 없다 — 이름은 스킨이 선언한 뜻에서만 나온다.

   의존(호출 시점): studio-inspector-state.js
   (studioInspectorTemplateSource / studioInspectorSlotNames /
   STUDIO_INSPECTOR_PAGE_LABELS), studio-inspector-model.js
   (stampInspectorEditIds / describeInspectorElement), studio-preview.js
   (currentWorkingSkin).
========================================================== */


const STUDIO_NAME_BY_BIND = {
  "site.title": "홈 이름",
  "site.slug": "블로그 주소",
  "profile.nickname": "닉네임",
  "profile.bio": "소개 문구",
  "post.title": "글 제목",
  "post.createdAt": "작성 날짜",
  "post.publishedAt": "작성 날짜",
  "post.publishedAtLabel": "작성 날짜",
  "post.categoryName": "카테고리 이름",
  "category.name": "카테고리 이름",
  "folder.name": "폴더 이름",
  "bannerCategory.name": "Banner 이름",
  "navigation.home.name": "홈 메뉴",
  "navigation.highlights.name": "Highlight 메뉴",
  "navigation.memos.name": "Highlight 메뉴",
  "highlights.folder.name": "Highlight 폴더 이름",
  "highlights.allLabel": "Highlight 보기 전환",
  "highlights.foldersLabel": "Highlight 보기 전환",
  "dock.trigger.text": "Bottom Dock 열기 버튼"
};

/* 반복 항목 안의 item.* — 무엇의 목록이냐에 따라 뜻이 다른 것만
   family 로 한 번 더 가른다(item.name 이 메뉴에서는 카테고리 이름,
   폴더 트리에서는 폴더 이름이다). */
const STUDIO_NAME_BY_ITEM_BIND = {
  "item.title": "글 제목",
  "item.excerpt": "글 요약",
  "item.publishedAt": "작성 날짜",
  "item.publishedAtLabel": "작성 날짜",
  "item.dateLabel": "날짜",
  "item.categoryName": "카테고리 이름",
  "item.note": "메모",
  "item.sourcePathLabel": "원문 위치",
  "item.postCount": "글 수",
  "item.countLabel": "글 수",
  "item.label": "이름"
};

const STUDIO_NAME_ITEM_NAME_BY_FAMILY = {
  menu: "메뉴 이름",
  folders: "폴더 이름",
  highlightFolders: "폴더 이름",
  banner: "Banner 이름",
  dock: "Bottom Dock 항목 이름"
};

const STUDIO_NAME_BY_REGION = {
  "post-body": "글 본문",
  "owner-tools": "관리 도구",
  "highlight-tools": "Highlight 도구",
  "memo-tools": "Highlight 도구",
  "bottom-dock": "Bottom Dock"
};

const STUDIO_NAME_BY_HREF = {
  "navigation.home.href": "홈 링크",
  "navigation.highlights.href": "Highlight 메뉴",
  "navigation.memos.href": "Highlight 메뉴",
  "viewer.writeHref": "글쓰기 버튼",
  "viewer.adminHref": "관리 버튼",
  "viewer.manageHref": "편집 버튼",
  "item.editHref": "편집 버튼",
  "item.folderHref": "폴더 열기",
  "post.categoryHref": "카테고리로 가기",
  "folder.parentHref": "뒤로 가기",
  "folder.listHref": "목록으로 보기",
  "folder.seriesHref": "이어 읽기",
  "highlights.allHref": "Highlight 보기 전환",
  "highlights.foldersHref": "Highlight 보기 전환"
};

const STUDIO_NAME_ITEM_BY_FAMILY = {
  menu: "카테고리 메뉴 항목",
  posts: "글 카드",
  gallery: "Gallery 카드",
  highlight: "Highlight 카드",
  highlightFolders: "Highlight 폴더",
  banner: "Banner 항목",
  dock: "Bottom Dock 항목",
  folders: "폴더 항목",
  pages: "페이지 번호",
  list: "목록 항목"
};

const STUDIO_NAME_LIST_BY_FAMILY = {
  menu: "카테고리 메뉴",
  posts: "글 목록",
  gallery: "Gallery",
  highlight: "Highlight",
  highlightFolders: "Highlight 폴더 목록",
  banner: "Banner",
  dock: "Bottom Dock",
  folders: "폴더 목록",
  pages: "페이지 번호",
  list: "목록"
};

const STUDIO_NAME_ITEM_IMAGE_BY_FAMILY = {
  posts: "글 대표 이미지",
  gallery: "Gallery 사진",
  highlight: "Highlight 이미지",
  banner: "Banner 이미지",
  dock: "Bottom Dock 아이콘"
};

const STUDIO_NAME_BY_TAG = {
  h1: "제목",
  h2: "제목",
  h3: "제목",
  h4: "제목",
  h5: "제목",
  h6: "제목",
  nav: "메뉴",
  header: "상단 영역",
  footer: "하단 영역",
  ul: "목록",
  ol: "목록",
  li: "목록 항목",
  figure: "그림 영역",
  blockquote: "인용"
};

/* 이 이름은 "근거가 없어서 붙인 일반 이름"이다. AI chip 이 뒤에
   글자 힌트를 붙일지 정할 때 쓴다. */
const STUDIO_NAME_GENERIC = new Set([
  "텍스트", "제목", "이미지", "버튼", "링크", "영역", "장식 요소", "목록 항목"
]);


function studioNameRepeatFamily(path) {

  if (typeof path !== "string" || !path) {
    return null;
  }

  if (/^navigation\.(postCategories|categories|bannerCategories)$/.test(path)) return "menu";
  if (/^(home\.recentPosts|category\.posts|folder\.posts)$/.test(path)) return "posts";
  if (/^category\.gallery\./.test(path)) return "gallery";
  if (/^(highlights\.cards|home\.highlights\.featured|memos\.cards)$/.test(path)) return "highlight";
  if (path === "highlights.folders") return "highlightFolders";
  if (/^(banners\.items|bannerCategory\.items)$/.test(path)) return "banner";
  if (path === "dock.items") return "dock";
  if (/^(category\.tree|item\.children|folder\.children|folder\.ancestors)$/.test(path)) return "folders";
  if (path === "category.pagination.pages") return "pages";

  return "list";

}


/* 가장 가까운 반복(자기 자신 포함)의 family */
function studioNameEnclosingFamily(el) {

  const repeat =
    el && typeof el.closest === "function" ? el.closest("[data-imory-repeat]") : null;

  return repeat ? studioNameRepeatFamily(repeat.getAttribute("data-imory-repeat")) : null;

}


/* 이 요소가 담고 있는 목록 — 자식이나 손자가 반복이면 그 목록이다 */
function studioNameContainedFamily(el) {

  const children = Array.prototype.slice.call(el.children || []);

  for (const child of children) {

    if (child.hasAttribute("data-imory-repeat")) {
      return { family: studioNameRepeatFamily(child.getAttribute("data-imory-repeat")), path: child.getAttribute("data-imory-repeat") };
    }

  }

  if (children.length === 1) {

    for (const grandchild of Array.prototype.slice.call(children[0].children || [])) {

      if (grandchild.hasAttribute("data-imory-repeat")) {
        return { family: studioNameRepeatFamily(grandchild.getAttribute("data-imory-repeat")), path: grandchild.getAttribute("data-imory-repeat") };
      }

    }

  }

  return null;

}


function studioNameSlotLabel(slotName) {

  const slots =
    (typeof currentWorkingSkin !== "undefined" && currentWorkingSkin && Array.isArray(currentWorkingSkin.imageSlots))
      ? currentWorkingSkin.imageSlots
      : [];

  const slot =
    slots.find((entry) => entry && entry.name === slotName);

  const label =
    slot && typeof slot.label === "string" ? slot.label.trim() : "";

  /* 저자가 적은 슬롯 이름표(예: "커버 이미지")를 쓴다. 슬롯 식별자
     자체(cover)는 코드 이름이라 보여 주지 않는다. */
  return label && label.length <= 24 ? label : "";

}


function studioNameIsButtonLike(el, info) {

  if (!el || info.kind !== "link") {
    return false;
  }

  if (info.isViewerBinding || el.hasAttribute("data-imory-toggle") || el.hasAttribute("data-imory-dock")) {
    return true;
  }

  return /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i.test(el.getAttribute("class") || "");

}


/* =========================================================
   studioInspectorKindName(el, info) -> 요소 종류(사람 말)
========================================================== */

function studioInspectorKindName(el, info) {

  if (!info) {
    return "영역";
  }

  if (info.kind === "image") {
    return "이미지";
  }

  if (info.kind === "link") {
    return studioNameIsButtonLike(el, info) ? "버튼" : "링크";
  }

  if (info.kind === "text") {
    return "텍스트";
  }

  if (el && !el.children.length && !(el.textContent || "").trim()) {
    return "장식 요소";
  }

  return "영역";

}


/* =========================================================
   studioInspectorElementName(el, info) -> 사람이 읽는 이름
========================================================== */

function studioInspectorElementName(el, info) {

  if (!el || !info) {
    return "영역";
  }

  const regionName =
    el.getAttribute("data-imory-region");

  if (regionName && STUDIO_NAME_BY_REGION[regionName]) {
    return STUDIO_NAME_BY_REGION[regionName];
  }

  const dockPart =
    el.getAttribute("data-imory-dock");

  if (dockPart === "trigger") {
    return "Bottom Dock 열기 버튼";
  }

  if (dockPart === "items") {
    return "Bottom Dock 항목";
  }

  const family =
    studioNameEnclosingFamily(el);

  if (info.bindPath) {

    if (STUDIO_NAME_BY_BIND[info.bindPath]) {
      return STUDIO_NAME_BY_BIND[info.bindPath];
    }

    if (info.bindPath === "item.name") {
      return STUDIO_NAME_ITEM_NAME_BY_FAMILY[family] || "이름";
    }

    if (STUDIO_NAME_BY_ITEM_BIND[info.bindPath]) {
      return STUDIO_NAME_BY_ITEM_BIND[info.bindPath];
    }

  }

  if (info.kind === "image") {

    if (info.srcPath === "profile.avatarUrl" || info.srcPath === "images.profile") {
      return "프로필 이미지";
    }

    if (info.srcPath && info.srcPath.indexOf("images.") === 0) {
      return studioNameSlotLabel(info.srcPath.slice("images.".length)) || "이미지";
    }

    if (info.srcPath && info.srcPath.indexOf("item.") === 0) {
      return STUDIO_NAME_ITEM_IMAGE_BY_FAMILY[family] || "이미지";
    }

    return "이미지";

  }

  if (info.hrefPath && STUDIO_NAME_BY_HREF[info.hrefPath]) {
    return STUDIO_NAME_BY_HREF[info.hrefPath];
  }

  if (info.repeatPath) {
    return STUDIO_NAME_ITEM_BY_FAMILY[studioNameRepeatFamily(info.repeatPath)] || "목록 항목";
  }

  if (info.kind === "link" && info.hrefPath && family) {
    return STUDIO_NAME_ITEM_BY_FAMILY[family] || "링크";
  }

  if (info.kind === "container") {

    const contained =
      studioNameContainedFamily(el);

    if (contained) {

      if (contained.path === "home.recentPosts") {
        return "최근 글 목록";
      }

      return STUDIO_NAME_LIST_BY_FAMILY[contained.family] || "목록";

    }

    if (el.parentElement && el.parentElement === el.ownerDocument.body) {
      return "배경";
    }

  }

  const tag =
    el.tagName.toLowerCase();

  if (STUDIO_NAME_BY_TAG[tag]) {
    return STUDIO_NAME_BY_TAG[tag];
  }

  return studioInspectorKindName(el, info);

}


function studioInspectorNameIsGeneric(name) {
  return STUDIO_NAME_GENERIC.has(name);
}


function studioInspectorPageName(pageType) {
  return STUDIO_INSPECTOR_PAGE_LABELS[pageType] || "PAGE";
}


/* =========================================================
   식별자 -> 이름 (hover · 겹친 요소 메뉴)

   hover 는 포인터가 움직일 때마다 온다. 매번 템플릿 전체를 다시
   파싱하지 않도록 **지금 템플릿 문자열** 하나에 대한 사본을 캐시한다.
   이 사본은 이름을 읽기만 한다 — 고치는 쪽(applyStudioInspectorPatch)은
   자기 사본을 따로 만든다(DOM 을 고치기 때문이다).
========================================================== */

let studioInspectorNameCache = null;


function studioInspectorDescribeEditId(editId) {

  if (!window.isValidInspectorEditId(editId)) {
    return null;
  }

  const source =
    studioInspectorTemplateSource();

  if (!source || typeof source.html !== "string") {
    return null;
  }

  const slotKey =
    (currentWorkingSkin && Array.isArray(currentWorkingSkin.imageSlots))
      ? JSON.stringify(currentWorkingSkin.imageSlots)
      : "";

  if (
    !studioInspectorNameCache ||
    studioInspectorNameCache.html !== source.html ||
    studioInspectorNameCache.slotKey !== slotKey
  ) {

    let stamped;

    try {
      stamped = window.stampInspectorEditIds(source.html);
    } catch (err) {
      return null;
    }

    studioInspectorNameCache = {
      html: source.html,
      slotKey,
      stamped,
      entries: new Map()
    };

  }

  const cache = studioInspectorNameCache;

  if (cache.entries.has(editId)) {
    return cache.entries.get(editId);
  }

  const element =
    cache.stamped.doc.body.querySelector(`[data-imory-edit-id="${editId}"]`);

  let entry = null;

  if (element) {

    const info =
      window.describeInspectorElement(element, studioInspectorSlotNames());

    entry = {
      name: studioInspectorElementName(element, info),
      kindName: studioInspectorKindName(element, info),
      text: (info.text || "").trim().replace(/\s+/g, " ").slice(0, 24)
    };

  }

  cache.entries.set(editId, entry);

  return entry;

}


function studioInspectorNameForEditId(editId) {

  const entry =
    studioInspectorDescribeEditId(editId);

  return entry ? entry.name : "";

}


if (typeof window !== "undefined") {

  window.studioInspectorElementName = studioInspectorElementName;
  window.studioInspectorKindName = studioInspectorKindName;
  window.studioInspectorNameForEditId = studioInspectorNameForEditId;
  window.studioInspectorNameIsGeneric = studioInspectorNameIsGeneric;

}
