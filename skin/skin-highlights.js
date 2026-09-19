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
   trySandboxSkinHighlights({ template, context, container })
     -> Promise<false | { sandbox:true, mount, renderNative }>

   SANDBOX-3. renderMode:"sandbox" 인 스킨의 하이라이트 화면을 별도
   origin iframe 에 그릴 준비를 한다. skin/skin-category.js /
   skin-banner.js 와 **같은 함수** 모양이고 pageType 문자열만 다르다.

   ★ 이 경로는 스킨이 자기 templates.highlights 를 가진 경우에만
   열린다(아래 호출부). 플랫폼 기본 template 은 highlight-* CSS
   클래스로 그려지고 그 CSS 는 부모 문서에만 있다 — 프레임에는
   스킨 CSS 만 들어가므로, 기본 template 을 프레임에 넣으면 글자만
   남은 화면이 된다.

   이 함수는 절대 throw 하지 않는다(이 파일의 계약).
========================================================== */

async function trySandboxSkinHighlights({ template, context, container }) {

  try {

    if (
      typeof resolveSkinRenderMode !== "function" ||
      typeof isSandboxSkinEnabled !== "function" ||
      isSandboxSkinEnabled(window) !== true ||
      !window.skinSandboxHostReady
    ) {
      return false;
    }


    const host =
      await window.skinSandboxHostReady;

    if (!host || typeof host.prepareSandboxSkin !== "function") {
      return false;
    }


    const prepared =
      host.prepareSandboxSkin({
        container,
        pageType: "highlights",
        template,
        context
      });

    if (!prepared || !prepared.ok) {

      console.warn(
        "[skin-highlights] sandbox prepare failed, falling back to native skin render:",
        prepared ? prepared.reason : "no-result"
      );

      return false;

    }


    return {
      sandbox: true,
      mount: prepared.mount,

      renderNative: function (target) {

        return renderSkin({
          container: target,
          skin: template,
          context,
          mode: "view"
        });

      }
    };

  }

  catch (err) {

    console.error("[skin-highlights] sandbox prepare threw", err);

    return false;

  }

}


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
  const skinHighlightsTemplate =
    skinPackage ? resolveSkinHighlightsTemplate(skinPackage) : undefined;

  const highlightsTemplate =
    skinHighlightsTemplate ||
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

  /* =====================================================
     SANDBOX-3 — renderMode:"sandbox" 인 스킨만 별도 origin의
     iframe에서 그린다 (IMORY_SANDBOX_SKIN_DESIGN.md).

     ★ 두 조건이 함께 참일 때만 열린다:
       · 스킨이 자기 templates.highlights 를 갖고 있다
         (플랫폼 기본 template 은 부모 CSS 에 의존한다 —
          위 trySandboxSkinHighlights 주석)
       · 호출자가 outcome 을 줬다 (mount 를 받을 방법)

     ★ 알려진 차이: 프레임 안에서는 카드 ⋮ 도구(메모 편집)와
     "원문 위치로 스크롤" 요청이 동작하지 않는다. 둘 다 부모가
     렌더된 DOM 에 심어 넣는 장치이고(posts/view/
     posts-view-highlights.js attachHighlightsScreenTools),
     cross-origin 프레임에서 그 자리를 채우는 방법은 아직 정하지
     않았다(설계 문서 "남은 차이"의 highlight-tools 항목).
     그래서 프레임 안 하이라이트 화면은 주인장에게도 읽기
     전용이고, 투영 단계에서 canManage 를 false 로 고정한다
     (skin/sandbox/skin-sandbox-context.js).
  ====================================================== */

  const renderMode =
    typeof resolveSkinRenderMode === "function" && skinPackage
      ? resolveSkinRenderMode(skinPackage)
      : "native";

  if (
    renderMode === "sandbox" &&
    skinHighlightsTemplate &&
    outcome &&
    typeof outcome === "object"
  ) {

    const prepared =
      await trySandboxSkinHighlights({
        template: highlightsTemplate,
        context,
        container
      });

    if (prepared) {

      outcome.context = context;

      /*
        ★ instance 는 없다 — 그려지는 DOM 이 이 realm 에 없다.
        호출자는 이 값이 없으면 카드 도구를 앉히지 않는다(빈 자리
        목록으로 no-op 이 되는 것과 같은 결과지만, 의도를 분명히
        하려고 명시한다).
      */

      outcome.instance = null;

      outcome.usedSkinTemplate = true;

      outcome.sandboxMount =
        prepared.mount;

      outcome.sandboxRenderNative =
        prepared.renderNative;

      window.syncSkinBottomDockForScreen?.({
        skinPackage,
        context,
        container
      });

      return true;

    }

    /* 준비에 실패하면 같은 스킨을 native 로 — 다시 시도하지 않는다 */

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
      outcome.usedSkinTemplate = Boolean(skinHighlightsTemplate);
    }

  } catch (err) {

    console.error("[skin-highlights] renderSkin failed", err);
    return false;

  }

  /* BOTTOM-DOCK-1 — 이 화면의 dock 하나 */

  window.syncSkinBottomDockForScreen?.({
    skinPackage,
    context,
    container
  });

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
