/* =========================================================
   SKIN MEMOS ENTRY (HIGHLIGHT-1 §7)

   하이라이트 화면(/:slug/highlights)의 렌더 진입점.
   posts/view/posts-view-highlights.js의 openHighlightsScreen()이 부른다.

   skin-category.js와 같은 원칙·같은 구조다. 다른 점은 **폴백**
   하나뿐이다:

     CATEGORY : templates.category가 없으면 false를 돌려주고 호출자가
                legacy 목록을 그린다.
     HIGHLIGHTS: legacy 화면이 아예 없다. 하이라이트 template이 없으면
                플랫폼이 들고 있는 기본 template
                (skin/skin-template.js의 getDefaultHighlightsTemplate)으로
                **같은 Context를 같은 renderer**로 그린다.

   즉 이 화면은 스킨이 있든 없든 항상 같은 계약(data-imory-*)으로
   그려진다 — 스킨 제작자가 나중에 templates.highlights를 넣으면 플랫폼
   코드는 한 줄도 바뀌지 않는다(요구사항 10).

   published Skin이 없거나 RPC가 실패해도 기본 template으로 그린다 —
   메모는 스킨의 장식이 아니라 사용자의 데이터라, 스킨이 없다고
   보이지 않으면 안 된다.

   책임 경계: 절대 throw하지 않는다. 어떤 단계에서 실패하든 false를
   돌려주고 호출자가 오류 화면을 그린다.

   의존(classic script, 이 모듈보다 먼저 로드되어야 함):
   supabaseClient, buildHighlightsSkinContext(skin/skin-context.js),
   extractImageSlotNames(skin/skin-image-slots.js),
   resolveSkinHighlightsTemplate / getDefaultHighlightsTemplate
   (skin/skin-template.js).
========================================================== */

import { renderSkin } from "./skin-render.js";

const SKIN_HIGHLIGHTS_SUPPORTED_SCHEMA_VERSION = 1;

/* =========================================================
   renderPublishedSkinHighlights({ ownerId, container, view, categoryId, outcome })
   -> Promise<boolean>
========================================================== */

export async function renderPublishedSkinHighlights({ ownerId, container, view, categoryId, outcome }) {

  if (!ownerId || !container) {
    return false;
  }

  let skinPackage;
  let imageSlotValues = {};

  try {

    const { data, error } =
      await supabaseClient.rpc(
        "get_published_skin",
        { p_user_id: ownerId }
      );

    if (error) {
      /* 스킨을 못 읽어도 메모는 보여야 한다 — 기본 template으로 간다. */
      console.warn("[skin-highlights] get_published_skin RPC error", error);
    } else if (data && data.skin) {

      if (data.schemaVersion === SKIN_HIGHLIGHTS_SUPPORTED_SCHEMA_VERSION) {
        skinPackage = data.skin;
        imageSlotValues = data.imageSlotValues || {};
      } else {
        console.warn(`[skin-highlights] unsupported schemaVersion ${data.schemaVersion}, using default highlights template`);
      }

    }

  } catch (err) {

    console.warn("[skin-highlights] get_published_skin RPC threw", err);

  }

  /*
    templates.highlights -> templates.memos(레거시) -> 플랫폼 기본
    (skin/skin-template.js 의 resolveSkinHighlightsTemplate).
  */
  const highlightsTemplate =
    (skinPackage && resolveSkinHighlightsTemplate(skinPackage)) ||
    getDefaultHighlightsTemplate();

  const imageSlotNames =
    skinPackage ? extractImageSlotNames(skinPackage) : [];

  let context;

  try {

    context = await buildHighlightsSkinContext(ownerId, {
      imageSlotNames,
      imageSlotValues,
      view,
      categoryId
    });

  } catch (err) {

    console.error("[skin-highlights] buildHighlightsSkinContext failed", err);
    return false;

  }

  if (!context) {
    return false;
  }

  try {

    const instance = renderSkin({
      container,
      skin: highlightsTemplate,
      context,
      mode: "view"
    });

    if (outcome && typeof outcome === "object") {
      outcome.context = context;
      outcome.instance = instance;
      outcome.usedSkinTemplate = Boolean(skinPackage && resolveSkinHighlightsTemplate(skinPackage));
    }

  } catch (err) {

    console.error("[skin-highlights] renderSkin failed", err);
    return false;

  }

  return true;

}

/* posts-view-highlights.js(classic script)가 폴링 없이 이 모듈을 넘겨받는
   핸드셰이크 — skin-category.js와 동일한 패턴. */
if (typeof window !== "undefined") {

  window.renderPublishedSkinHighlights = renderPublishedSkinHighlights;

  if (typeof window.__resolveSkinHighlightsReady === "function") {
    window.__resolveSkinHighlightsReady(renderPublishedSkinHighlights);
  }

}
