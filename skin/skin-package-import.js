/* =========================================================
   SKIN PACKAGE IMPORT (PHASE 1 Final Gap — Whole SkinPackage Import)

   PHASE 1E: templates.banner(선택 필드)도 이 함수가 함께 검증/
   sanitize한다 — 아래 requiredPageTypes 루프 바로 다음의 banner
   블록 참고. required가 아니므로 기존 3종 SkinPackage JSON은
   지금까지와 100% 동일하게 통과한다.

   기존 route-aware Code Editor(studio/editor/code-editor.js)는
   "지금 Preview가 보고 있는 페이지 하나"의 html/css만 편집한다 —
   templates.category/post가 아예 없는 HOME-only Skin에서는 그
   페이지의 CODE 버튼 자체가 비활성화되어(studio/studio-preview.js
   resolveCodeEditorSource) 페이지별로 하나씩 붙여넣는 방법이
   없다. 이 파일은 그 갭을 메우는 "SkinPackage JSON 문자열 하나
   전체"를 검증하는 유일한 지점이다.

   책임: rawJsonText(사용자가 textarea에 붙여넣은 원문) -> 구조
   검사 -> sanitize/validate -> 안전한 새 SkinPackage 객체. DOM
   교체/Preview 재렌더/Save는 전혀 하지 않는다(studio/studio-preview.js
   applyImportedSkinPackage()의 몫, 22절 파일 책임 분리 원칙과 동일한
   결) — 이 파일은 순수 검증 함수 하나만 노출한다.

   재사용(새로 만들지 않음): sanitizeSkinHTML(skin/skin-sanitize.js),
   window.validateAndScopeSkinCss(skin/skin-css-validate.js,
   window.skinInitializerReady 핸드셰이크로 로드 완료를 기다림 —
   studio/editor/code-editor.js와 동일 패턴), htmlHasPostBodyRegion
   (skin/skin-template.js — PHASE 1C-J에서 studio-preview.js 안에
   있던 것을 이번 Slice에서 공용화).

   안전 원칙: JSON.parse()로 얻은 원본 객체를 어디서도 그대로
   스프레드(`{...parsed}`)하지 않는다 — 스프레드는 [[Set]]으로
   프로퍼티를 옮기므로, parsed에 "__proto__"라는 own enumerable
   문자열 키가 있으면 새 객체의 내부 prototype이 그 값으로 바뀌는
   결과를 만들 수 있다(전역 Object.prototype 오염은 아니지만, 이
   함수가 만드는 결과 객체 하나의 동작을 예측 불가능하게 만들 수
   있다). 그래서 각 필드를 항상 `parsed.templates?.home?.html`처럼
   명시적으로 하나씩 읽어 새 리터럴에 담는다 — 알려지지 않은/
   허용되지 않은 추가 필드는 결과에 자동으로 섞여 들어올 수 없다.

   실패(ok:false)는 무엇을 검증하다 실패했든 항상 같은 모양
   { ok:false, message }만 돌려준다 — 호출자(import-editor.js)는
   이 메시지를 그대로 사용자에게 보여주기만 하면 된다. 이 함수
   자신은 어떤 전역 상태도(currentWorkingSkin 포함) 건드리지
   않으므로, 실패는 항상 "아무 일도 없었던 것"과 동일하다(요구사항
   7절 "전체 성공 또는 전체 실패의 atomic 동작").

   classic script — window.validateSkinPackageImport로 노출된다.
   의존(먼저 로드되어야 함): sanitizeSkinHTML(skin/skin-sanitize.js),
   htmlHasPostBodyRegion(skin/skin-template.js), window.skinInitializerReady
   핸드셰이크(skin/skin-initializer.js).
========================================================== */

const SKIN_PACKAGE_IMPORT_CSS_CHECK_NAMESPACE = "studio-skin-import-check";

async function validateSkinPackageImport(rawJsonText) {

  if (typeof rawJsonText !== "string" || !rawJsonText.trim()) {
    return { ok: false, message: "가져올 SkinPackage JSON을 입력해주세요." };
  }

  let parsed;

  try {
    parsed = JSON.parse(rawJsonText);
  } catch (err) {
    return { ok: false, message: "JSON 형식이 올바르지 않습니다: " + err.message };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "SkinPackage는 최상위가 객체({...})여야 합니다." };
  }

  if (parsed.schemaVersion !== 1) {
    return { ok: false, message: "schemaVersion은 1이어야 합니다." };
  }

  const templatesInput =
    parsed.templates;

  if (!templatesInput || typeof templatesInput !== "object" || Array.isArray(templatesInput)) {
    return { ok: false, message: "templates 필드가 필요합니다." };
  }

  const requiredPageTypes =
    ["home", "category", "post"];

  for (const pageType of requiredPageTypes) {

    const template =
      templatesInput[pageType];

    if (!template || typeof template !== "object" || typeof template.html !== "string") {
      return { ok: false, message: `templates.${pageType}.html이 필요합니다.` };
    }

  }

  /*
    PHASE 1E — templates.banner는 **선택**이다. 배너 화면까지 스킨을
    입히고 싶은 SkinPackage만 넣으면 되고, 없으면 그 사이트의 배너
    카테고리는 지금까지처럼 legacy 배너 화면으로 렌더된다
    (skin/skin-banner.js). 그래서 기존 HOME/CATEGORY/POST 3종만 가진
    JSON도 이 Import를 그대로 통과한다 — banner를 required에 넣으면
    이미 배포된 스킨 파일들이 전부 가져오기 불가능해진다.

    다만 "넣었는데 모양이 틀린" 경우는 조용히 무시하지 않고
    실패시킨다(오탈자를 성공으로 착각하게 두지 않는다).
  */

  const bannerTemplateInput =
    templatesInput.banner;

  const hasBannerTemplate =
    bannerTemplateInput !== undefined &&
    bannerTemplateInput !== null;

  if (
    hasBannerTemplate &&
    (
      typeof bannerTemplateInput !== "object" ||
      Array.isArray(bannerTemplateInput) ||
      typeof bannerTemplateInput.html !== "string"
    )
  ) {
    return { ok: false, message: "templates.banner를 포함하려면 templates.banner.html이 문자열이어야 합니다." };
  }

  let cssRaw;

  if (typeof parsed.css === "string") {
    cssRaw = parsed.css;
  } else if (parsed.css === undefined) {
    cssRaw = "";
  } else {
    return { ok: false, message: "css는 문자열이어야 합니다." };
  }

  /*
    sanitizeSkinHTML/window.validateAndScopeSkinCss는 이미 다른
    classic script(skin-sanitize.js)/ES 모듈(skin-css-validate.js)이
    로드를 마쳐야 쓸 수 있다 — code-editor.js와 동일하게 이
    Promise로 안전하게 대기한다.
  */
  await window.skinInitializerReady;

  const sanitizedHomeHtml =
    sanitizeSkinHTML(templatesInput.home.html);

  const sanitizedCategoryHtml =
    sanitizeSkinHTML(templatesInput.category.html);

  const sanitizedPostHtml =
    sanitizeSkinHTML(templatesInput.post.html);

  const sanitizedBannerHtml =
    hasBannerTemplate
      ? sanitizeSkinHTML(bannerTemplateInput.html)
      : null;

  if (!htmlHasPostBodyRegion(sanitizedPostHtml)) {
    return {
      ok: false,
      message: "POST 템플릿에는 글 본문이 표시되는 자리(post-body region)가 반드시 있어야 합니다."
    };
  }

  const cssResult =
    window.validateAndScopeSkinCss(
      cssRaw,
      { namespace: SKIN_PACKAGE_IMPORT_CSS_CHECK_NAMESPACE }
    );

  if (!cssResult.ok) {
    return {
      ok: false,
      message: "CSS에 문제가 있어 가져올 수 없습니다: " + cssResult.warnings.join(", ")
    };
  }

  /*
    imageSlots/regions/metadata는 이미 JSON.parse()를 거친 순수
    데이터(함수/Date 등 위험한 타입이 존재할 수 없음)라 별도
    sanitizer가 필요 없다 — 다만 shape이 기대와 다르면(배열이어야
    할 자리에 객체가 오는 등) 조용히 안전한 기본값으로 대체한다
    (요구사항 9절 "허용되지 않은 SkinPackage shape 안전 처리").
    이 값들도 원본을 스프레드하지 않고 그대로 참조만 옮긴다 —
    아래에서 만드는 새 SkinPackage 리터럴 자체는 여전히 알려진
    필드만 갖는 새 객체다.
  */

  const imageSlots =
    Array.isArray(parsed.imageSlots)
      ? parsed.imageSlots
      : [];

  const regions =
    Array.isArray(parsed.regions)
      ? parsed.regions
      : [];

  const metadata =
    (parsed.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata))
      ? parsed.metadata
      : {};

  /*
    templates는 항상 새 리터럴로 만든다(파일 상단 "원본을 스프레드
    하지 않는다" 원칙) — banner는 실제로 들어온 경우에만 키를
    추가해서, 없는 스킨의 결과에 `banner: undefined` 같은 죽은 키가
    남지 않게 한다(resolveSkinTemplate이 undefined를 그대로
    "미지원"으로 읽으므로 동작상 차이는 없지만, 저장되는 JSON이
    깨끗한 편이 낫다).
  */

  const templates =
    {
      home: { html: sanitizedHomeHtml },
      category: { html: sanitizedCategoryHtml },
      post: { html: sanitizedPostHtml }
    };

  if (hasBannerTemplate) {
    templates.banner = { html: sanitizedBannerHtml };
  }

  return {
    ok: true,
    skinPackage: {
      schemaVersion: 1,
      templates,
      css: cssRaw,
      imageSlots,
      regions,
      metadata
    }
  };

}

if (typeof window !== "undefined") {
  window.validateSkinPackageImport = validateSkinPackageImport;
}
