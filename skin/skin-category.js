/* =========================================================
   SKIN CATEGORY ENTRY (Slice 1C-C)

   공개 CATEGORY(post형 목록) 진입점. posts/view/posts-view-list.js의
   openCategoryPage()가 새 Skin 렌더 경로를 시도할 때 이 모듈의
   renderPublishedSkinCategory()를 호출한다.

   skin-home.js(Slice 4)와 완전히 동일한 원칙과 구조를 따른다 —
   이 파일은 ES 모듈이다(skin-render.js를 정적 import하므로).
   posts-view-list.js는 classic script라 폴링 대신 명시적 Promise
   핸드셰이크(window.skinCategoryReady)로 이 모듈의 함수를 넘겨받는다
   (index.html이 이 모듈보다 먼저 window.skinCategoryReady를
   선언해 둔다 — skin-home.js와 동일한 패턴, index.html 참고).

   의존(classic script, 이 모듈보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), buildCategorySkinContext
   (skin/skin-context.js), extractImageSlotNames(skin/skin-image-slots.js),
   resolveSkinTemplate(skin/skin-template.js). renderSkin은 정적 import로
   받는다.

   책임 경계: renderPublishedSkinCategory()는 절대 throw하지 않는다 —
   실패 사유가 무엇이든(RPC 에러, context 빌드 실패, 알 수 없는
   schemaVersion, banner 타입, template 미지원 등) 항상 false를
   반환해서 호출자가 기존 legacy post-list 렌더로 조용히 폴백할 수
   있게 한다(AI_SKIN_PHASE1C_PAGE_CONTRACT.md 20-7절). 이 함수는
   "현재 뷰어가 site owner 본인인지" 같은 호출 맥락은 전혀 모른다 —
   그 판단은 호출자(posts-view-list.js)의 몫이다(skin-home.js가
   HOME 3-way 분기의 나머지를 모르는 것과 동일한 분리).

   category.type이 "post"가 아니면(banner 등) 이 함수는 명시적으로
   false를 반환한다 — banner 카테고리는 이번 Slice의 범위 밖이고,
   호출자는 기존 renderBannerCategory() 경로로 폴백해야 한다
   (PHASE1C 5-2/13-1절).
========================================================== */

import { renderSkin } from "./skin-render.js";

const SKIN_CATEGORY_SUPPORTED_SCHEMA_VERSION = 1;

/* =========================================================
   renderPublishedSkinCategory({ ownerId, categoryId, container })
   -> Promise<boolean>

   true: published Skin이 이 category(post형)를 실제로 렌더했다 —
   호출자는 legacy post-list 렌더를 건드리지 말고 즉시 return해야
   한다.
   false: 적용 가능한 published Skin/CATEGORY template이 없거나
   (정상, banner 타입 포함) 어떤 단계에서든 실패했다 — 호출자는
   기존 legacy post-list 렌더를 그대로 진행해야 한다.
========================================================== */

export async function renderPublishedSkinCategory({ ownerId, categoryId, container }) {

  if (!ownerId || categoryId === undefined || categoryId === null || !container) {
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
      console.error("[skin-category] get_published_skin RPC error", error);
      return false;
    }

    rpcData = data;

  } catch (err) {

    console.error("[skin-category] get_published_skin RPC threw", err);
    return false;

  }

  /* published Skin 없음(draft만 있거나, skins row 자체가 없거나,
     is_active=false) — get_published_skin()이 null을 반환한다
     (정상 상태, 에러 아님). 조용히 legacy post-list로 폴백. */
  if (!rpcData || !rpcData.skin) {
    return false;
  }

  const skinPackage = rpcData.skin;
  const schemaVersion = rpcData.schemaVersion;
  const imageSlotValues = rpcData.imageSlotValues || {};

  /* 이 렌더러가 모르는 미래 schemaVersion — skin-home.js와 동일한
     원칙(설계 문서 3/10절 "모르는 버전은 곧장 fallback"). */
  if (schemaVersion !== SKIN_CATEGORY_SUPPORTED_SCHEMA_VERSION) {
    console.warn(`[skin-category] unsupported schemaVersion ${schemaVersion}, falling back to legacy category`);
    return false;
  }

  /* templates.category가 없으면 resolveSkinTemplate()이 undefined를
     돌려준다(HOME html로 대체하지 않음, PHASE1C 14-1절) — legacy
     post-list로 폴백. */
  const categoryTemplate = resolveSkinTemplate(skinPackage, "category");

  if (!categoryTemplate) {
    return false;
  }

  const imageSlotNames = extractImageSlotNames(skinPackage);

  let context;

  try {

    context = await buildCategorySkinContext(ownerId, categoryId, {
      imageSlotNames,
      imageSlotValues
    });

  } catch (err) {

    console.error("[skin-category] buildCategorySkinContext failed", err);
    return false;

  }

  /* category가 이 ownerId 소유가 아니거나 존재하지 않음 — 정상
     "없음" 상태(PHASE1C 19-1절), legacy로 폴백(legacy 쪽이 실제
     not-found 처리를 담당). */
  if (!context) {
    return false;
  }

  /* post형 category만 이번 Slice의 대상 — banner(및 미래 다른
     타입)는 이 계약을 아예 타지 않고 legacy banner 렌더로 폴백해야
     한다(PHASE1C 5-2/13-1절). */
  if (context.category.type !== "post") {
    return false;
  }

  try {

    renderSkin({
      container,
      skin: categoryTemplate,
      context,
      mode: "view"
    });

  } catch (err) {

    console.error("[skin-category] renderSkin failed", err);
    return false;

  }

  return true;

}

/* posts-view-list.js(classic script)가 폴링 없이 이 모듈을 안전하게
   넘겨받도록 하는 핸드셰이크 — skin-home.js와 동일한 패턴.
   window.skinCategoryReady는 index.html이 이 모듈보다 먼저
   선언해 둔다. */
if (typeof window !== "undefined") {

  window.renderPublishedSkinCategory = renderPublishedSkinCategory;

  if (typeof window.__resolveSkinCategoryReady === "function") {
    window.__resolveSkinCategoryReady(renderPublishedSkinCategory);
  }

}
