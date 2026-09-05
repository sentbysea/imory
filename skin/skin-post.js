/* =========================================================
   SKIN POST ENTRY (Slice 1C-F)

   공개 POST 진입점. posts/view/posts-view-detail.js의
   openPostPage()가 새 Skin 렌더 경로를 시도할 때 이 모듈의
   renderPublishedSkinPost()를 호출한다.

   skin-home.js(Slice 4)/skin-category.js(Slice 1C-C)와 완전히
   동일한 원칙과 구조를 따른다 — 이 파일은 ES 모듈이다
   (skin-render.js를 정적 import하므로). posts-view-detail.js는
   classic script라 폴링 대신 명시적 Promise 핸드셰이크
   (window.skinPostReady)로 이 모듈의 함수를 넘겨받는다
   (index.html이 이 모듈보다 먼저 window.skinPostReady를
   선언해 둔다 — skin-home.js/skin-category.js와 동일한 패턴,
   index.html 참고).

   의존(classic script, 이 모듈보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), buildPostSkinContext
   (skin/skin-context.js), extractImageSlotNames(skin/skin-image-slots.js),
   resolveSkinTemplate(skin/skin-template.js). renderSkin은 정적 import로
   받는다.

   책임 경계: renderPublishedSkinPost()는 절대 throw하지 않는다 —
   실패 사유가 무엇이든(RPC 에러, context 빌드 실패, 알 수 없는
   schemaVersion, post-body region 없음, template 미지원 등) 항상
   false를 반환해서 호출자가 기존 legacy POST 렌더로 조용히
   폴백할 수 있게 한다(AI_SKIN_PHASE1C_PAGE_CONTRACT.md 20-13절).
   이 함수는 "현재 뷰어가 site owner 본인인지" 같은 호출 맥락은
   전혀 모른다 — 그 판단은 호출자(posts-view-detail.js)의 몫이다
   (skin-home.js/skin-category.js가 각자의 호출 맥락을 모르는 것과
   동일한 분리).

   templates.post가 존재하더라도 렌더된 DOM에 유효한
   [data-imory-region="post-body"]가 없으면 이 Skin은 POST용으로
   무효로 보고 false를 반환한다(20-3절 "본문 없는 POST 화면을
   공개하면 안 됩니다") — 본문을 넣을 자리가 없는 Skin으로
   outer chrome만 보여주는 반쪽짜리 렌더를 만들지 않는다.
========================================================== */

import { renderSkin } from "./skin-render.js";

const SKIN_POST_SUPPORTED_SCHEMA_VERSION = 1;

const SKIN_POST_BODY_REGION_NAME = "post-body";

/* =========================================================
   renderPublishedSkinPost({ ownerId, postId, container })
   -> Promise<false | { rendered: true, bodyRegion: Element }>

   { rendered: true, bodyRegion }: published Skin이 이 POST의
   outer chrome을 실제로 렌더했다 — 호출자는 legacy #postDetail
   렌더를 건드리지 말고, 실제 본문(Quote Preset/raw HTML/secret
   gate)을 bodyRegion 안에 mount해야 한다.
   false: 적용 가능한 published Skin/POST template/post-body
   region이 없거나(정상) 어떤 단계에서든 실패했다 — 호출자는
   기존 legacy #postDetail 렌더를 그대로 진행해야 한다.
========================================================== */

export async function renderPublishedSkinPost({ ownerId, postId, container }) {

  if (!ownerId || postId === undefined || postId === null || !container) {
    return false;
  }

  let rpcData;

  try {

    const { data, error } =
      await supabaseClient.rpc(
        "get_published_skin",
        { p_user_id: ownerId }
      );

    if (error) {
      console.error("[skin-post] get_published_skin RPC error", error);
      return false;
    }

    rpcData = data;

  } catch (err) {

    console.error("[skin-post] get_published_skin RPC threw", err);
    return false;

  }

  /* published Skin 없음(draft만 있거나, skins row 자체가 없거나,
     is_active=false) — get_published_skin()이 null을 반환한다
     (정상 상태, 에러 아님). 조용히 legacy POST로 폴백. */
  if (!rpcData || !rpcData.skin) {
    return false;
  }

  const skinPackage = rpcData.skin;
  const schemaVersion = rpcData.schemaVersion;
  const imageSlotValues = rpcData.imageSlotValues || {};

  /* 이 렌더러가 모르는 미래 schemaVersion — skin-home.js/
     skin-category.js와 동일한 원칙("모르는 버전은 곧장 fallback"). */
  if (schemaVersion !== SKIN_POST_SUPPORTED_SCHEMA_VERSION) {
    console.warn(`[skin-post] unsupported schemaVersion ${schemaVersion}, falling back to legacy post`);
    return false;
  }

  /* templates.post가 없으면 resolveSkinTemplate()이 undefined를
     돌려준다(HOME html로 대체하지 않음, PHASE1C 14-1절) — legacy
     POST로 폴백. */
  const postTemplate = resolveSkinTemplate(skinPackage, "post");

  if (!postTemplate) {
    return false;
  }

  const imageSlotNames = extractImageSlotNames(skinPackage);

  let context;

  try {

    context = await buildPostSkinContext(ownerId, postId, {
      imageSlotNames,
      imageSlotValues
    });

  } catch (err) {

    console.error("[skin-post] buildPostSkinContext failed", err);
    return false;

  }

  /* post가 이 ownerId 소유가 아니거나 존재하지 않음 — 정상
     "없음" 상태, legacy로 폴백(legacy 쪽이 실제 not-found 처리를
     담당). */
  if (!context) {
    return false;
  }

  let skinInstance;

  try {

    skinInstance = renderSkin({
      container,
      skin: postTemplate,
      context,
      mode: "view"
    });

  } catch (err) {

    console.error("[skin-post] renderSkin failed", err);
    container.innerHTML = "";
    return false;

  }

  /* 20-3/20-8절: post-body region이 없는(또는 sanitize 과정에서
     사라진) Skin은 POST용으로 무효 — outer chrome만 남은 반쪽짜리
     렌더를 화면에 남기지 않고 컨테이너를 비운 뒤 legacy로 폴백한다.
     항상 mount 직후의 live region을 써야 한다(캐싱 금지, 문서
     16절) — 여기서 바로 얻어서 그대로 caller에게 넘긴다. */
  const bodyRegion = skinInstance.getRegion(SKIN_POST_BODY_REGION_NAME);

  if (!bodyRegion) {
    console.warn("[skin-post] published skin has no post-body region, falling back to legacy post");
    container.innerHTML = "";
    return false;
  }

  return {
    rendered: true,
    bodyRegion
  };

}

/* posts-view-detail.js(classic script)가 폴링 없이 이 모듈을
   안전하게 넘겨받도록 하는 핸드셰이크 — skin-home.js/
   skin-category.js와 동일한 패턴. window.skinPostReady는
   index.html이 이 모듈보다 먼저 선언해 둔다. */
if (typeof window !== "undefined") {

  window.renderPublishedSkinPost = renderPublishedSkinPost;

  if (typeof window.__resolveSkinPostReady === "function") {
    window.__resolveSkinPostReady(renderPublishedSkinPost);
  }

}
