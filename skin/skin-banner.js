/* =========================================================
   SKIN BANNER ENTRY (PHASE 1E)

   공개 BANNER(배너 목록형 카테고리) 진입점.
   posts/view/posts-view-list.js의 openCategoryPage()가 category.type
   === "banner"일 때 새 Skin 렌더 경로를 시도하면서 이 모듈의
   renderPublishedSkinBanner()를 호출한다.

   skin-category.js(Slice 1C-C)와 완전히 동일한 원칙과 구조를
   따른다 — 이 파일은 ES 모듈이다(skin-render.js를 정적
   import하므로). posts-view-list.js는 classic script라 폴링 대신
   명시적 Promise 핸드셰이크(window.skinBannerReady)로 이 모듈의
   함수를 넘겨받는다(index.html이 이 모듈보다 먼저
   window.skinBannerReady를 선언해 둔다 — skin-home.js/
   skin-category.js/skin-post.js와 동일한 패턴).

   의존(classic script, 이 모듈보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), buildBannerSkinContext
   (skin/skin-context.js), extractImageSlotNames(skin/skin-image-slots.js),
   resolveSkinTemplate(skin/skin-template.js). renderSkin은 정적
   import로 받는다.

   책임 경계: renderPublishedSkinBanner()는 절대 throw하지 않는다 —
   실패 사유가 무엇이든(RPC 에러, context 빌드 실패, 알 수 없는
   schemaVersion, banner template 미지원, banner가 아닌 카테고리
   등) 항상 false를 반환해서 호출자가 기존 legacy 배너 화면
   (posts/view/posts-view-banner.js의 renderBannerCategory)으로
   조용히 폴백할 수 있게 한다. 즉 templates.banner가 없는 기존
   스킨은 이 파일이 존재하는 것만으로는 아무 것도 달라지지
   않는다.

   이 함수는 "현재 뷰어가 site owner 본인인지" 같은 호출 맥락은
   전혀 모른다 — 그 판단은 호출자(posts-view-list.js)의 몫이다
   (skin-home.js/skin-category.js/skin-post.js와 동일한 분리).
   소유자 본인이 자기 배너 카테고리를 열 때는 호출자가 애초에 이
   함수를 부르지 않아서 기존 배너 추가/편집 UI가 그대로 남는다.

   빈 목록은 실패가 아니다 — items가 []인 정상 context를 그대로
   렌더한다(“배너가 아직 없다”는 표현은 Skin 자신의 CSS/마크업
   몫이다, CATEGORY의 빈 글 목록과 동일한 계약).
========================================================== */

import { renderSkin } from "./skin-render.js";

const SKIN_BANNER_SUPPORTED_SCHEMA_VERSION = 1;

/* =========================================================
   trySandboxSkinBanner({ template, context, container })
     -> Promise<false | { sandbox:true, mount, renderNative }>

   SANDBOX-3. renderMode:"sandbox" 인 스킨의 BANNER 를 별도 origin
   iframe 에 그릴 준비를 한다.

   skin/skin-category.js 의 trySandboxSkinCategory 와 **같은 함수**
   모양이다 — 다른 것은 pageType 문자열 하나뿐이다. iframe 을
   만드는 코드는 여전히 skin/sandbox/skin-sandbox-host.js 한 곳에만
   있다.

   ★ 왜 여기서 곧장 그리지 않는가

   호출자(posts/view/posts-view-list.js)는 **떨어진 스크래치
   엘리먼트**에 먼저 그린 뒤 요청 순번이 아직 최신일 때만 그 내용을
   화면으로 옮긴다. iframe 은 DOM 에서 옮기는 순간 문서가 다시
   로드되므로 그 방식을 쓸 수 없다 — 그래서 준비(투영·navId 표
   발급)까지만 하고, 실제 iframe 생성은 호출자가 **살아 있는
   컨테이너**에 대고 한 번 부른다.

   이 함수는 절대 throw 하지 않는다(이 파일의 계약).
========================================================== */

async function trySandboxSkinBanner({ template, context, container }) {

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
        pageType: "banner",
        template,
        context
      });

    if (!prepared || !prepared.ok) {

      console.warn(
        "[skin-banner] sandbox prepare failed, falling back to native skin render:",
        prepared ? prepared.reason : "no-result"
      );

      return false;

    }


    return {
      sandbox: true,
      mount: prepared.mount,

      /*
        ★ 프레임이 안 뜨면 **같은 스킨을 native 로** 그린다
        (HOME/CATEGORY 와 같은 규칙 — 백지로도, legacy 배너
        그리드로도 되돌리지 않는다). 조회도 Context 조립도 이미
        끝났으므로 다시 하지 않는다.
      */

      renderNative: function (target) {

        renderSkin({
          container: target,
          skin: template,
          context,
          mode: "view"
        });

      }
    };

  }

  catch (err) {

    console.error("[skin-banner] sandbox prepare threw", err);

    return false;

  }

}


/* =========================================================
   renderPublishedSkinBanner({ ownerId, categoryId, container, outcome })
   -> Promise<boolean>

   true: published Skin이 이 banner 카테고리를 실제로 렌더했다 —
   호출자는 legacy 배너 그리드를 건드리지 말고 즉시 return해야
   한다.
   false: 적용 가능한 published Skin/BANNER template이 없거나
   (정상) 어떤 단계에서든 실패했다 — 호출자는 기존 legacy 배너
   렌더를 그대로 진행해야 한다.
========================================================== */

export async function renderPublishedSkinBanner({ ownerId, categoryId, container, outcome }) {

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
      console.error("[skin-banner] get_published_skin RPC error", error);
      return false;
    }

    rpcData = data;

  } catch (err) {

    console.error("[skin-banner] get_published_skin RPC threw", err);
    return false;

  }

  /* published Skin 없음(draft만 있거나, skins row 자체가 없거나,
     is_active=false) — get_published_skin()이 null을 반환한다
     (정상 상태, 에러 아님). 조용히 legacy 배너로 폴백. */
  if (!rpcData || !rpcData.skin) {
    return false;
  }

  const skinPackage = rpcData.skin;
  const schemaVersion = rpcData.schemaVersion;
  const imageSlotValues = rpcData.imageSlotValues || {};

  /* 이 렌더러가 모르는 미래 schemaVersion — 다른 page entry와
     동일한 원칙("모르는 버전은 곧장 fallback"). */
  if (schemaVersion !== SKIN_BANNER_SUPPORTED_SCHEMA_VERSION) {
    console.warn(`[skin-banner] unsupported schemaVersion ${schemaVersion}, falling back to legacy banner`);
    return false;
  }

  /* templates.banner가 없으면 resolveSkinTemplate()이 undefined를
     돌려준다(HOME/CATEGORY html로 대체하지 않음, skin-template.js)
     — 기존 HOME/CATEGORY/POST만 가진 스킨은 전부 여기서 legacy
     배너로 폴백한다. */
  const bannerTemplate = resolveSkinTemplate(skinPackage, "banner");

  if (!bannerTemplate) {
    return false;
  }

  const imageSlotNames = extractImageSlotNames(skinPackage);

  let context;

  try {

    context = await buildBannerSkinContext(ownerId, categoryId, {
      imageSlotNames,
      imageSlotValues
    });

  } catch (err) {

    console.error("[skin-banner] buildBannerSkinContext failed", err);
    return false;

  }

  /* category가 이 ownerId 소유가 아니거나 존재하지 않음 — 정상
     "없음" 상태, legacy로 폴백(legacy 쪽이 실제 not-found 처리를
     담당). */
  if (!context) {
    return false;
  }

  /* banner형 category만 이 계약의 대상이다. 호출자가 이미
     category.type을 보고 들어오지만, Context가 실제 DB에서 다시
     읽어온 type으로 한 번 더 확인한다 — 캐시된 값과 실제 값이
     어긋난 경우에도 글 목록 카테고리가 배너 template으로 그려지는
     일이 없게 한다. */
  if (context.bannerCategory.type !== "banner") {
    return false;
  }

  /* =====================================================
     SANDBOX-3 — renderMode:"sandbox" 인 스킨만 별도 origin의
     iframe에서 그린다 (IMORY_SANDBOX_SKIN_DESIGN.md).

     ★ 분기가 여기 한 곳뿐인 이유는 skin-home.js/skin-category.js
     와 같다 — 조회·schemaVersion 검사·template 선택·Context 조립은
     위에서 이미 끝났고, sandbox 는 "그 결과를 어디에 그리는가"만
     다르다.

     ★ renderMode 가 없는(=대부분의) 스킨은 이 if 가 곧바로 거짓이고
     그 뒤 코드가 이 라운드 이전과 한 글자도 다르지 않다.

     ★ 실제 iframe 생성은 호출자가 한다(위 trySandboxSkinBanner
     주석). 여기서는 준비된 mount 함수를 outcome 에 실어 보낸다 —
     반환 타입(boolean)을 바꾸지 않기 위해서다. 그래서 outcome 을
     주지 않고 부르는 호출자에게는 sandbox 경로가 아예 열리지
     않는다(그 호출자는 mount 를 받을 방법이 없다). 공개 경로는
     언제나 outcome 을 준다(posts/view/posts-view-list.js).

     ★ 배너 추가/수정 진입점(＋ / EDIT)은 스킨 마크업 밖, #postArea
     가 소유한 플랫폼 UI 라 프레임 안쪽과 무관하게 그대로 남는다.
  ====================================================== */

  const renderMode =
    typeof resolveSkinRenderMode === "function"
      ? resolveSkinRenderMode(skinPackage)
      : "native";

  if (renderMode === "sandbox" && outcome && typeof outcome === "object") {

    const prepared =
      await trySandboxSkinBanner({
        template: bannerTemplate,
        context,
        container
      });

    if (prepared) {

      outcome.sandboxMount =
        prepared.mount;

      outcome.sandboxRenderNative =
        prepared.renderNative;

      return true;

    }

    /* 준비에 실패하면 같은 스킨을 native 로 — 다시 시도하지 않는다 */

  }

  try {

    renderSkin({
      container,
      skin: bannerTemplate,
      context,
      mode: "view"
    });

  } catch (err) {

    console.error("[skin-banner] renderSkin failed", err);
    return false;

  }

  return true;

}

/* posts-view-list.js(classic script)가 폴링 없이 이 모듈을 안전하게
   넘겨받도록 하는 핸드셰이크 — skin-home.js/skin-category.js/
   skin-post.js와 동일한 패턴. window.skinBannerReady는 index.html이
   이 모듈보다 먼저 선언해 둔다. */
if (typeof window !== "undefined") {

  window.renderPublishedSkinBanner = renderPublishedSkinBanner;

  if (typeof window.__resolveSkinBannerReady === "function") {
    window.__resolveSkinBannerReady(renderPublishedSkinBanner);
  }

}
