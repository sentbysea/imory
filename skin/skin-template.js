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
const SKIN_TEMPLATE_PAGE_TYPES =
  ["home", "category", "post", "banner", "folder"];


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
