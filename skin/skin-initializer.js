/* =========================================================
   SKIN INITIALIZER

   AI_SKIN_PHASE1B_DESIGN.md 7-3절. "answers → 저장된 draft
   Skin" 시퀀스를 한 곳에만 둔다 — generate → sanitize → CSS
   validate → create_skin_with_initial_version() RPC. Studio
   fallback(studio/studio-state.js)만 이 함수를 호출한다(7-4절) —
   클라이언트가 skins/skin_versions를 직접 나눠 insert하는 경로는
   어디에도 만들지 않는다.

   이 파일은 ES 모듈이다(skin-css-validate.js를 정적 import하므로)
   — 반드시 `<script type="module" src=".../skin-initializer.js">`로
   로드해야 한다. 모듈은 문서 파싱이 끝난 뒤에야 실행되므로,
   classic script(studio-state.js)가 이 시점을 기다릴 수 있도록
   skin/skin-home.js와 동일한 Promise 핸드셰이크를 쓴다 —
   window.skinInitializerReady를 studio/index.html이 이 스크립트
   보다 먼저 선언해 둔다.

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), sanitizeSkinHTML
   (skin/skin-sanitize.js), generateInitialSkin(skin/skin-generator.js).
========================================================== */

import { validateAndScopeSkinCss } from "./skin-css-validate.js";

const SKIN_INITIALIZER_CSS_CHECK_NAMESPACE = "init";

async function createInitialSkinFromAnswers(answers) {

  const skinPackage = generateInitialSkin(answers);

  const sanitizedHtml = sanitizeSkinHTML(skinPackage.html);

  const cssResult = validateAndScopeSkinCss(skinPackage.css, {
    namespace: SKIN_INITIALIZER_CSS_CHECK_NAMESPACE
  });

  /*
    cssResult.css는 이 인스턴스 전용으로 스코프된 결과라 저장하지
    않는다 — skin_versions.content.css는 항상 raw(미scope) 상태로
    저장되고, 실제 scope는 매 렌더 시점에 renderSkin()이 새
    namespace로 다시 계산한다(0절). 여기서는 오직 "저장 가능한
    CSS인가"만 검증용으로 확인한다.
  */

  if (!cssResult.ok) {

    throw new Error(
      "generated skin css failed validation: " +
      cssResult.warnings.join(", ")
    );

  }

  const finalPackage = {
    ...skinPackage,
    html: sanitizedHtml
  };

  const { data, error } = await supabaseClient.rpc(
    "create_skin_with_initial_version",
    {
      p_content: finalPackage,
      p_schema_version: finalPackage.schemaVersion,
      p_title: null
    }
  );

  if (error) {
    throw error;
  }

  return { skinId: data };

}

if (typeof window !== "undefined") {

  window.createInitialSkinFromAnswers = createInitialSkinFromAnswers;

  if (typeof window.__resolveSkinInitializerReady === "function") {
    window.__resolveSkinInitializerReady(createInitialSkinFromAnswers);
  }

}
