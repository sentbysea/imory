/* =========================================================
   SKIN TEMPLATE SELECTION

   AI_SKIN_PHASE1C_PAGE_CONTRACT.md 12-B/14-1절. SkinPackage가
   페이지별 templates.{home,category,post}를 갖는 멀티페이지
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

const SKIN_TEMPLATE_PAGE_TYPES =
  ["home", "category", "post"];


/* =========================================================
   resolveSkinTemplate(skinPackage, pageType) -> { html, css } | undefined

   우선순위(PHASE1C 14-1절):
   1. skinPackage.templates?.[pageType] — 명시적으로 저장된
      페이지별 template이 있으면 항상 그것을 쓴다.
   2. pageType이 "home"이고 templates.home이 없으면 기존
      top-level skinPackage.html/css로 폴백한다 — 기존
      published/draft HOME Skin(templates 필드 자체가 없는 Skin)은
      이 계약이 도입돼도 단 한 byte도 다시 저장할 필요가 없다.
   3. 그 외(category/post인데 templates에 해당 페이지가 없음)에는
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
