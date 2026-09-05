/* =========================================================
   SKIN PACKAGE NORMALIZE (PHASE 1C-B)

   AI_SKIN_PHASE1C_PAGE_CONTRACT.md 12-B/19-6절 이후 실제 Slice.
   저장 시점(create_skin_with_initial_version / save_skin_draft_version
   RPC 호출 직전)에 SkinPackage 전체를 한 번에 정규화하는 유일한
   공용 helper — legacy `html` sanitize + `templates.{home,category,post}`
   각각 존재하는 것만 sanitize + 공유 `css` validate를 한 곳에만
   둔다. skin/skin-initializer.js(최초 생성)와
   studio/studio-preview.js(Save Draft)가 각자 sanitize/validate
   로직을 복붙하지 않고 이 함수 하나만 부른다 — 새 sanitizer/CSS
   parser는 만들지 않는다(skin-sanitize.js/skin-css-validate.js
   그대로 재사용).

   templates.*.css는 검증하지 않는다 — v0.1은 페이지별 css를 두지
   않기로 확정했으므로(PHASE1C 12-B절) 저장 시점 검증 대상은 공유
   `skinPackage.css` 하나뿐이다. 어쩌다 template에 css 필드가 실려
   있어도 구조만 보존한다(이 함수가 새로 만들어 넣는 필드가
   아니다). render 시점 신뢰 경계는 여전히 renderSkin()이 호출될
   때마다 다시 검증하므로(skin-render.js 파일 상단 참고), 여기서
   놓친 것이 있어도 2차 방어선이 남아 있다.

   저장할 css 자체는 항상 raw(미scope) 값을 그대로 유지한다 —
   검증에만 쓰고 scoped 결과(cssResult.css)는 버린다
   (skin-initializer.js/code-editor.js와 동일 원칙).

   ok=false(구조적으로 신뢰할 수 없는 CSS)면 이 함수는 throw한다
   — 호출자는 그 실패를 "이번 Apply/Save 후보 자체를 반영하지
   않는다"는 신호로 써야 한다(working skin/DB 무엇도 바뀌지 않음).

   classic script — window.normalizeSkinPackageForDraft로
   노출된다. 비동기 함수다: window.validateAndScopeSkinCss는
   skin-css-validate.js(ES 모듈)가 로드를 마쳐야 생기므로,
   code-editor.js와 동일하게 window.skinInitializerReady
   핸드셰이크를 내부에서 기다린다 — 호출자가 이 로드 타이밍을
   직접 신경 쓸 필요가 없다.

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   sanitizeSkinHTML(skin/skin-sanitize.js). window.validateAndScopeSkinCss/
   window.skinInitializerReady는 이 함수가 실제로 호출되는
   시점에만 준비되어 있으면 된다(studio/index.html 로드 순서 참고).
========================================================== */

const SKIN_PACKAGE_NORMALIZE_CSS_CHECK_NAMESPACE = "package-normalize-check";
const SKIN_PACKAGE_NORMALIZE_PAGE_TYPES = ["home", "category", "post"];

async function normalizeSkinPackageForDraft(skinPackage) {

  if (!skinPackage || typeof skinPackage !== "object") {
    throw new Error("normalizeSkinPackageForDraft: skinPackage is required");
  }

  await window.skinInitializerReady;

  const normalized = { ...skinPackage };

  if (typeof normalized.html === "string") {
    normalized.html = sanitizeSkinHTML(normalized.html);
  }

  if (normalized.templates && typeof normalized.templates === "object") {

    const normalizedTemplates = { ...normalized.templates };

    SKIN_PACKAGE_NORMALIZE_PAGE_TYPES.forEach((pageType) => {

      const template = normalizedTemplates[pageType];

      if (template && typeof template.html === "string") {
        normalizedTemplates[pageType] = { ...template, html: sanitizeSkinHTML(template.html) };
      }

    });

    normalized.templates = normalizedTemplates;

  }

  const cssResult = window.validateAndScopeSkinCss(String(normalized.css || ""), {
    namespace: SKIN_PACKAGE_NORMALIZE_CSS_CHECK_NAMESPACE
  });

  if (!cssResult.ok) {
    throw new Error("skin css failed validation: " + cssResult.warnings.join(", "));
  }

  return normalized;

}

if (typeof window !== "undefined") {
  window.normalizeSkinPackageForDraft = normalizeSkinPackageForDraft;
}
