/* =========================================================
   SKIN TEMPLATE SELECTION

   AI_SKIN_PHASE1C_PAGE_CONTRACT.md 12-B/14-1절. SkinPackage가
   페이지별 templates.{home,category,post,banner}를 갖는 멀티페이지
   shape으로 확장되는 동안, 이미 저장된 단일-html Skin(templates
   필드 없음)이 계속 HOME을 문제없이 렌더할 수 있게 하는 유일한
   선택 로직.

   이번 Slice(1C-A)는 이 함수를 어디에도 연결하지 않는다 —
   skin-render.js/skin-home.js/preview-bridge.js는 지금 이 파일을
   import/참조하지 않고, 여전히 skin.html/skin.css를 직접 읽는다
   (그 배선은 CATEGORY/POST Renderer가 실제로 생기는 1C-C/1C-D의
   몫이다). 이 파일은 그 전에 필요한 선택 규칙만 순수 함수로
   미리 확정해 둔다.

   DOM/Supabase를 전혀 건드리지 않는다. classic script —
   함수 선언 자체가 window.resolveSkinTemplate /
   window.skinPackageSupportsPageType으로 노출된다.
========================================================== */

/* PHASE 1E: "banner"가 네 번째 page type으로 추가됐다
   (AI_SKIN_PHASE1E_BANNER_AND_OWNER_LINKS.md 2절). 아래
   resolveSkinTemplate()의 규칙은 한 줄도 바뀌지 않는다 —
   templates.banner가 없는 기존 Skin은 여전히 undefined를 받아
   legacy 배너 화면으로 폴백한다(HOME html을 배너에 재사용하지
   않는다). 즉 이 배열에 이름을 하나 더하는 것만으로 "선택적
   배너 template" 계약이 성립한다.

   FOLDER-2: "folder"가 다섯 번째 page type이다(IMORY_FOLDER2_DESIGN.md).
   banner와 같은 **선택** template이다 — templates.folder가 없는 스킨은
   undefined를 받고, 그 경우 플랫폼은 폴더 링크(folderHref)를 아예
   노출하지 않으며 폴더 주소로 들어오면 그 카테고리로 돌려보낸다
   (폴더 전용 폴백 화면을 만들지 않는다). */
/* HIGHLIGHT-1: "memos"가 여섯 번째 page type이다. banner/folder와 같은
   **선택** template이지만 폴백이 다르다 — templates.memos가 없으면
   플랫폼이 아래 getDefaultMemosTemplate()을 쓴다(갤러리와 같은 방식).
   메모 화면은 legacy 화면이 아예 없어서 "지원하지 않으면 안 보여준다"가
   성립하지 않기 때문이다. */
const SKIN_TEMPLATE_PAGE_TYPES =
  ["home", "category", "post", "banner", "folder", "memos"];

/* Additive gallery fallback. Existing category templates retain full control. */
function getDefaultGalleryTemplate() {
  const tree = (path, depth) => `<ul><li data-imory-repeat="${path}">
    <span data-imory-if="item.name" data-imory-bind="item.name"></span>
    <a data-imory-if="item.href" data-imory-href="item.href" data-imory-bind="item.title"></a>
    ${depth ? tree('item.children', depth - 1) : ''}</li></ul>`;
  return {
    html: `<section class="imory-default-gallery"><h1 data-imory-bind="category.name"></h1>
      <div class="gallery-cards"><article data-imory-repeat="category.gallery.cards">
      <a data-imory-href="item.href"><img data-imory-if="item.hasThumbnail" data-imory-src="item.thumbnailUrl" alt="">
      <span data-imory-bind="item.title"></span></a>
      <div class="gallery-photos" data-imory-if="item.hasAdditionalImages"><img data-imory-repeat="item.additionalImages" data-imory-src="item.url" alt=""></div>
      <time data-imory-bind="item.publishedAtLabel"></time></article></div>
      <p data-imory-if="category.gallery.isEmpty">아직 사진이 없습니다.</p>
      <nav data-imory-if="category.pagination.hasPages"><a data-imory-repeat="category.pagination.pages" data-imory-href="item.href" data-imory-bind="item.label"></a></nav>
      ${tree('category.tree', 3)}</section>`,
    css: `.imory-default-gallery { max-width: 1000px; margin: auto; padding: 24px 16px; }
      .gallery-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 16px; }
      .gallery-cards article { min-width: 0; } .gallery-cards img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
      .gallery-cards a, .gallery-cards time { display: block; } .gallery-cards time { font-size: 12px; }
      .gallery-photos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-block: 8px; }
      nav { display: flex; gap: 12px; margin-top: 20px; }`
  };
}


/* =========================================================
   기본 메모 화면 (HIGHLIGHT-1 §7)

   templates.memos를 가지고 있지 않은 스킨(= 지금 존재하는 모든 스킨)
   에서도 메모 카테고리가 동작해야 한다. 그래서 갤러리와 같은 방식으로
   **플랫폼이 들고 있는 기본 template**을 쓴다.

   ★ 고정된 완성 HTML 하나가 아니다 (요구사항 10)

   이 기본값도 여느 스킨과 똑같이 data-imory-* 바인딩으로만 쓰여 있다.
   스킨 제작자는 이 구조를 그대로 복사해 요소의 순서·태그·클래스를
   바꾸면 되고, 필요 없는 조각은 빼면 된다. 플랫폼이 뒤에서 채우는
   자리는 카드마다 하나씩 있는 [data-imory-region="memo-tools"] 뿐이다 —
   주인장에게는 ⋮ 버튼이 들어가고 방문자에게는 빈 채로 남는다.

   CSS는 posts/posts-highlight.css의 클래스를 그대로 쓰므로 여기서는
   최소한의 배치만 준다(스킨이 자기 template을 가지면 이 CSS 자체가
   쓰이지 않는다).
========================================================== */

function getDefaultMemosTemplate() {

  return {

    html: `<section class="memo-screen">

      <nav class="memo-screen-views">
        <a class="memo-screen-view" data-imory-href="memos.allHref" data-imory-bind="memos.allLabel"></a>
        <a class="memo-screen-view" data-imory-href="memos.foldersHref" data-imory-bind="memos.foldersLabel"></a>
      </nav>

      <h1 class="memo-folder-name" data-imory-if="memos.view.isFolder" data-imory-bind="memos.folder.name"></h1>

      <p class="memo-screen-state" data-imory-if="memos.hasError">메모를 불러오지 못했습니다.</p>

      <div class="memo-folder-grid" data-imory-if="memos.view.isFolders">
        <a class="memo-folder-card" data-imory-repeat="memos.folders" data-imory-href="item.href">
          <span class="memo-folder-cover" data-imory-if="item.hasCover">
            <img data-imory-src="item.coverUrl" alt="">
          </span>
          <span class="memo-folder-name" data-imory-bind="item.name"></span>
          <span class="memo-folder-count" data-imory-bind="item.countLabel"></span>
        </a>
      </div>

      <div class="memo-card-list" data-imory-if="memos.showCards">
        <article class="memo-card" data-imory-repeat="memos.cards">
          <blockquote class="memo-card-excerpt" data-imory-bind="item.excerpt"></blockquote>
          <p class="memo-card-note" data-imory-if="item.hasNote" data-imory-bind="item.note"></p>
          <div class="memo-card-meta">
            <a data-imory-if="item.postHref" data-imory-href="item.postHref" data-imory-bind="item.postTitle"></a>
            <span data-imory-if="item.categoryName" data-imory-bind="item.categoryName"></span>
            <span data-imory-bind="item.dateLabel"></span>
            <span class="memo-card-missing" data-imory-if="item.isMissing">원문에서 위치를 찾을 수 없음</span>
          </div>
          <div class="memo-card-actions">
            <a class="memo-card-open" data-imory-if="item.postHref" data-imory-href="item.postHref">원문 보기</a>
            <span data-imory-region="memo-tools"></span>
          </div>
        </article>
      </div>

      <p class="memo-screen-state" data-imory-if="memos.isEmpty">아직 메모가 없습니다.</p>
      <p class="memo-screen-state" data-imory-if="memos.foldersEmpty">아직 메모가 없습니다.</p>

    </section>`,

    css: ``

  };

}


/* =========================================================
   resolveSkinTemplate(skinPackage, pageType) -> { html, css } | undefined

   우선순위(PHASE1C 14-1절):
   1. skinPackage.templates?.[pageType] — 명시적으로 저장된
      페이지별 template이 있으면 항상 그것을 쓴다.
   2. pageType이 "home"이고 templates.home이 없으면 기존
      top-level skinPackage.html/css로 폴백한다 — 기존
      published/draft HOME Skin(templates 필드 자체가 없는 Skin)은
      이 계약이 도입돼도 단 한 byte도 다시 저장할 필요가 없다.
   3. 그 외(category/post/banner인데 templates에 해당 페이지가 없음)에는
      undefined를 돌려준다 — "지원하지 않음"을 명시적으로 표현하는
      것이지, HOME html을 category/post에 억지로 재사용하지
      않는다. 호출자(미래의 CATEGORY/POST Skin Renderer)는
      undefined를 받으면 legacy 렌더 경로로 폴백해야 한다
      (skin-home.js가 published Skin 없을 때 legacy HOME으로
      폴백하는 것과 동일한 패턴).
========================================================== */

function resolveSkinTemplate(
  skinPackage,
  pageType
) {

  if (
    !skinPackage ||
    !SKIN_TEMPLATE_PAGE_TYPES.includes(pageType)
  ) {

    return undefined;

  }


  const explicitTemplate =
    skinPackage.templates?.[pageType];

  if (explicitTemplate && typeof explicitTemplate.html === "string") {

    return {
      html: explicitTemplate.html,
      css:
        typeof explicitTemplate.css === "string"
          ? explicitTemplate.css
          : (skinPackage.css || "")
    };

  }


  if (
    pageType === "home" &&
    typeof skinPackage.html === "string"
  ) {

    return {
      html: skinPackage.html,
      css: skinPackage.css || ""
    };

  }


  return undefined;

}


/* =========================================================
   skinPackageSupportsPageType(skinPackage, pageType) -> boolean

   실제 지원 여부는 resolveSkinTemplate()이 값을 돌려주는지로
   판단한다 — skinPackage.metadata.supports는 신뢰 경계로 쓰지
   않는다(사용자 요청 6절, PHASE1C 1-5/14-2절: metadata는 오늘
   순수 정보성 필드이고 렌더러가 이 값을 읽어서 분기하지 않는다).
========================================================== */

function skinPackageSupportsPageType(
  skinPackage,
  pageType
) {

  return (
    resolveSkinTemplate(skinPackage, pageType) !==
    undefined
  );

}


/* =========================================================
   htmlHasPostBodyRegion(html) -> boolean (PHASE 1C-J, PHASE 1
   Final Gap 공용화)

   POST 페이지 HTML에 실제 글 본문이 표시될 자리
   (data-imory-region="post-body")가 남아 있는지 검사한다. 원래
   studio/studio-preview.js 안에 Code Editor 전용으로만 있었으나,
   SkinPackage Import(skin/skin-package-import.js)도 동일한 계약을
   검증해야 하므로 이 파일로 옮겨 두 호출자가 공유한다. DOMParser로
   파싱해 판정한다(정규식으로 raw 문자열을 훑지 않음 — 속성 순서/
   따옴표 형태에 흔들리지 않기 위해).
========================================================== */

function htmlHasPostBodyRegion(html) {

  const parsed =
    new DOMParser().parseFromString(
      String(html || ""),
      "text/html"
    );

  return (
    !!parsed.querySelector('[data-imory-region="post-body"]')
  );

}


/* =========================================================
   skinTemplateUsesGallery(template) -> boolean (GALLERY-1)

   "이 CATEGORY template이 갤러리 계약을 실제로 쓰는가".

   왜 metadata 플래그가 아니라 마크업을 보는가 — 위
   skinPackageSupportsPageType()의 주석과 정확히 같은 이유다.
   metadata.supports는 신뢰 경계로 쓰지 않는다(PHASE1C 1-5/14-2절).
   지원 여부의 유일한 근거는 "그 template이 그 데이터를 실제로
   그리는가"이고, 그건 data-imory-* 바인딩 경로에 그대로 적혀 있다.

   이 판정이 필요한 이유(기준 문서 §4):
   갤러리 카테고리는 페이지를 나눠 조회하므로 category.posts가
   "그 페이지의 글"이 된다. 갤러리를 모르는 기존 스킨이 그 데이터를
   받으면 아무 조작도 하지 않았는데 목록이 12개로 잘려 보인다.
   그래서 갤러리 계약을 쓰지 않는 스킨에서는 플랫폼이 갤러리 모드
   자체를 켜지 않고 지금까지와 100% 동일한 목록 조회를 한다 —
   설정은 남아 있고, 갤러리를 아는 스킨으로 바꾸면 그때 살아난다.

   정규식으로 raw 문자열을 훑지 않고 DOMParser로 판정한다
   (htmlHasPostBodyRegion과 같은 이유 — 속성 순서/따옴표 형태에
   흔들리지 않기 위해).
========================================================== */

const SKIN_GALLERY_BINDING_ATTRS =
  [
    "data-imory-repeat",
    "data-imory-if",
    "data-imory-bind",
    "data-imory-src",
    "data-imory-href"
  ];

const SKIN_GALLERY_CONTEXT_PREFIXES =
  ["category.gallery", "category.pagination"];


function skinTemplateUsesGallery(
  template
) {

  const html =
    template && typeof template.html === "string"
      ? template.html
      : "";


  if (!html) {

    return false;

  }


  /* 빠른 사전 판정 — 문자열에 아예 없으면 파싱하지 않는다. */

  if (
    !SKIN_GALLERY_CONTEXT_PREFIXES.some(
      (prefix) => html.includes(prefix)
    )
  ) {

    return false;

  }


  let parsed;

  try {

    parsed =
      new DOMParser().parseFromString(
        html,
        "text/html"
      );

  }

  catch (err) {

    return false;

  }


  const selector =
    SKIN_GALLERY_BINDING_ATTRS
      .map((attr) => `[${attr}]`)
      .join(",");


  return Array.from(
    parsed.querySelectorAll(selector)
  ).some(
    (el) =>
      SKIN_GALLERY_BINDING_ATTRS.some((attr) => {

        const value =
          el.getAttribute(attr) || "";

        return SKIN_GALLERY_CONTEXT_PREFIXES.some(
          (prefix) =>
            value === prefix ||
            value.startsWith(`${prefix}.`)
        );

      })
  );

}


/*
  SkinPackage 단위 편의 함수 — templates.category를 뽑아 위 판정에
  넘긴다. 호출자(skin/skin-category.js, studio/preview/
  preview-navigation.js)가 매번 resolveSkinTemplate을 두 번 부르지
  않게 하기 위한 것뿐이다.
*/

function skinPackageUsesGallery(
  skinPackage
) {

  return skinTemplateUsesGallery(
    resolveSkinTemplate(skinPackage, "category")
  );

}


if (typeof window !== "undefined") {

  window.skinTemplateUsesGallery =
    skinTemplateUsesGallery;

  window.skinPackageUsesGallery =
    skinPackageUsesGallery;

}
