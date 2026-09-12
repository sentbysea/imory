/* =========================================================
   SKIN MEMOS ENTRY (HIGHLIGHT-1 §7)

   메모 카테고리(/:slug/memos) 화면의 렌더 진입점.
   posts/view/posts-view-memos.js의 openMemoScreen()이 부른다.

   skin-category.js와 같은 원칙·같은 구조다. 다른 점은 **폴백**
   하나뿐이다:

     CATEGORY : templates.category가 없으면 false를 돌려주고 호출자가
                legacy 목록을 그린다.
     MEMOS    : legacy 화면이 아예 없다. templates.memos가 없으면
                플랫폼이 들고 있는 기본 template
                (skin/skin-template.js의 getDefaultMemosTemplate)으로
                **같은 Context를 같은 renderer**로 그린다.

   즉 이 화면은 스킨이 있든 없든 항상 같은 계약(data-imory-*)으로
   그려진다 — 스킨 제작자가 나중에 templates.memos를 넣으면 플랫폼
   코드는 한 줄도 바뀌지 않는다(요구사항 10).

   published Skin이 없거나 RPC가 실패해도 기본 template으로 그린다 —
   메모는 스킨의 장식이 아니라 사용자의 데이터라, 스킨이 없다고
   보이지 않으면 안 된다.

   책임 경계: 절대 throw하지 않는다. 어떤 단계에서 실패하든 false를
   돌려주고 호출자가 오류 화면을 그린다.

   의존(classic script, 이 모듈보다 먼저 로드되어야 함):
   supabaseClient, buildMemosSkinContext(skin/skin-context.js),
   extractImageSlotNames(skin/skin-image-slots.js),
   resolveSkinTemplate / getDefaultMemosTemplate(skin/skin-template.js).
========================================================== */

import { renderSkin } from "./skin-render.js";

const SKIN_MEMOS_SUPPORTED_SCHEMA_VERSION = 1;

/* =========================================================
   renderPublishedSkinMemos({ ownerId, container, view, categoryId, outcome })
   -> Promise<boolean>
========================================================== */

export async function renderPublishedSkinMemos({ ownerId, container, view, categoryId, outcome }) {

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
      console.warn("[skin-memos] get_published_skin RPC error", error);
    } else if (data && data.skin) {

      if (data.schemaVersion === SKIN_MEMOS_SUPPORTED_SCHEMA_VERSION) {
        skinPackage = data.skin;
        imageSlotValues = data.imageSlotValues || {};
      } else {
        console.warn(`[skin-memos] unsupported schemaVersion ${data.schemaVersion}, using default memos template`);
      }

    }

  } catch (err) {

    console.warn("[skin-memos] get_published_skin RPC threw", err);

  }

  /* templates.memos가 있으면 그것, 없으면 플랫폼 기본 template */
  const memosTemplate =
    (skinPackage && resolveSkinTemplate(skinPackage, "memos")) ||
    getDefaultMemosTemplate();

  const imageSlotNames =
    skinPackage ? extractImageSlotNames(skinPackage) : [];

  let context;

  try {

    context = await buildMemosSkinContext(ownerId, {
      imageSlotNames,
      imageSlotValues,
      view,
      categoryId
    });

  } catch (err) {

    console.error("[skin-memos] buildMemosSkinContext failed", err);
    return false;

  }

  if (!context) {
    return false;
  }

  try {

    const instance = renderSkin({
      container,
      skin: memosTemplate,
      context,
      mode: "view"
    });

    if (outcome && typeof outcome === "object") {
      outcome.context = context;
      outcome.instance = instance;
      outcome.usedSkinTemplate = Boolean(skinPackage && resolveSkinTemplate(skinPackage, "memos"));
    }

  } catch (err) {

    console.error("[skin-memos] renderSkin failed", err);
    return false;

  }

  return true;

}

/* posts-view-memos.js(classic script)가 폴링 없이 이 모듈을 넘겨받는
   핸드셰이크 — skin-category.js와 동일한 패턴. */
if (typeof window !== "undefined") {

  window.renderPublishedSkinMemos = renderPublishedSkinMemos;

  if (typeof window.__resolveSkinMemosReady === "function") {
    window.__resolveSkinMemosReady(renderPublishedSkinMemos);
  }

}
