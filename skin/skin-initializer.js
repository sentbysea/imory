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
   supabaseClient(core/lib/supabase-client.js), generateInitialSkin
   (skin/skin-generator.js), normalizeSkinPackageForDraft
   (skin/skin-package-normalize.js — sanitize/validate 전체를 이제
   이 helper 하나가 맡는다, PHASE1C-B).
========================================================== */

/* side-effect import — window.validateAndScopeSkinCss를 등록시키는
   목적뿐이다(normalizeSkinPackageForDraft가 실제로 그 전역을
   호출한다). 이 파일이 여전히 studio/index.html에서 유일하게
   skin-css-validate.js를 정적 import하는 지점이라, 이 import를
   지우면 그 전역 자체가 생기지 않는다(code-editor.js/
   skin-package-normalize.js 주석 참고). */
import "./skin-css-validate.js";

async function createInitialSkinFromAnswers(answers) {

  const skinPackage = generateInitialSkin(answers);

  const finalPackage = await normalizeSkinPackageForDraft(skinPackage);

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
