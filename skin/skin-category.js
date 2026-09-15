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
   resolveSkinTemplate / skinTemplateUsesGallery(skin/skin-template.js).
   renderSkin은 정적 import로 받는다.

   GALLERY-1: 이 함수가 page(주소의 ?page=N)를 받아 Context에 넘기고,
   실제로 그려진 페이지를 outcome에 적어 호출자에게 돌려준다. 갤러리
   모드는 카테고리 설정과 **이 스킨이 category.gallery를 실제로 쓰는지**
   둘 다 참일 때만 켜진다(IMORY_GALLERY1_DESIGN.md §4).

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
   trySandboxSkinCategory({ template, context, container })
     -> Promise<false | { sandbox: true, mount }>

   SANDBOX-2. renderMode:"sandbox" 인 스킨의 CATEGORY 를 별도
   origin iframe 에 그릴 준비를 한다.

   ★ 왜 여기서 곧장 그리지 않는가

   호출자(posts/view/posts-view-list.js)는 **떨어진 스크래치
   엘리먼트**에 먼저 그린 뒤 요청 순번이 아직 최신일 때만 그
   내용을 화면으로 옮긴다. iframe 은 DOM 에서 옮기는 순간 문서가
   다시 로드되므로 그 방식을 쓸 수 없다 — 그래서 준비(조회·투영·
   navId 표 발급)까지만 하고, 실제 iframe 생성은 호출자가
   **살아 있는 컨테이너**에 대고 한 번 부른다
   (skin/sandbox/skin-sandbox-host.js prepareSandboxSkin 주석).

   false 를 돌려주면 이 라운드의 sandbox 경로를 쓰지 않는다는 뜻이고,
   호출자는 오늘과 똑같이 native 로 그린 결과를 옮긴다. 이 함수는
   절대 throw 하지 않는다(이 파일의 계약).
========================================================== */

async function trySandboxSkinCategory({ template, context, container }) {

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
        pageType: "category",
        template,
        context
      });

    if (!prepared || !prepared.ok) {

      console.warn(
        "[skin-category] sandbox prepare failed, falling back to native skin render:",
        prepared ? prepared.reason : "no-result"
      );

      return false;

    }


    return {
      sandbox: true,
      mount: prepared.mount,

      /*
        ★ 프레임이 안 뜨면 **같은 스킨을 native 로** 그린다
        (skin-home.js 와 같은 규칙 — 백지로 두지 않는다). 조회도
        Context 조립도 이미 끝났으므로 다시 하지 않는다.
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

    console.error("[skin-category] sandbox prepare threw", err);

    return false;

  }

}

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

export async function renderPublishedSkinCategory({ ownerId, categoryId, container, page, outcome }) {

  async function galleryFallback() {
    try {
      const context = await buildCategorySkinContext(ownerId, categoryId, {
        supportsGallery: true, supportsPagination: true, supportsFolderPage: !!resolveSkinTemplate(rpcData?.skin, "folder"), page
      });
      if (context?.category.type !== "gallery") return false;
      renderSkin({ container, skin: getDefaultGalleryTemplate(), context, mode: "view" });
      if (outcome) {
        outcome.isGallery = true;
        outcome.effectivePage = context.category.pagination?.currentPage;
      }
      return true;
    } catch (error) {
      console.warn("[skin-category] default gallery unavailable", error);
      return false;
    }
  }

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
    return galleryFallback();
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
    return galleryFallback();
  }

  const imageSlotNames = extractImageSlotNames(skinPackage);

  let context;

  try {

    /* FOLDER-2: 이 스킨이 폴더 페이지(templates.folder)를 갖고 있을
       때만 category.tree의 폴더 노드에 folderHref가 채워진다 — 없으면
       null이라 스킨이 폴더 링크를 그리지 않는다(skin/skin-context.js). */
    /* GALLERY-1: 이 스킨의 CATEGORY template이 category.gallery /
       category.pagination을 실제로 그리는 경우에만 갤러리 모드가
       켜진다(skin/skin-template.js의 skinTemplateUsesGallery 주석).
       page는 주소의 ?page=N을 그대로 전달한 값이고, 범위를 벗어난
       값은 Context가 유효 페이지로 맞춰서 돌려준다. */
    context = await buildCategorySkinContext(ownerId, categoryId, {
      imageSlotNames,
      imageSlotValues,
      supportsFolderPage: skinPackageSupportsPageType(skinPackage, "folder"),
      supportsGallery: skinTemplateUsesGallery(categoryTemplate),
      /* HIGHLIGHT-2: 글 목록 페이지네이션도 같은 방식으로 스킨이
         category.pagination 을 실제로 그릴 때만 켜진다. */
      supportsPagination: skinTemplateUsesPagination(categoryTemplate),
      /* 재료 일치 라운드: 페이지를 나누면 루트 글이 category.tree 에서
         빠지고 category.posts 로만 온다 — 그것을 그리지 않는 스킨에서는
         나누지 않는다(skin/skin-template.js skinTemplateUsesRootPostList). */
      supportsRootPostList: skinTemplateUsesRootPostList(categoryTemplate),
      page
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
  if (!["post", "gallery"].includes(context.category.type)) {
    return false;
  }

  /* =====================================================
     SANDBOX-2 — renderMode:"sandbox" 인 스킨만 별도 origin의
     iframe에서 그린다 (IMORY_SANDBOX_SKIN_DESIGN.md).

     ★ 분기가 여기 한 곳뿐인 이유는 skin-home.js와 같다 — 조회·
     schemaVersion 검사·template 선택·Context 조립은 위에서 이미
     끝났고, sandbox 는 "그 결과를 어디에 그리는가"만 다르다.

     ★ renderMode가 없는(=대부분의) 스킨은 이 if 가 곧바로 거짓이고
     그 뒤 코드가 이 라운드 이전과 한 글자도 다르지 않다.

     ★ 실제 iframe 생성은 호출자가 한다(위 trySandboxSkinCategory
     주석). 여기서는 준비된 mount 함수를 outcome 에 실어 보낸다 —
     반환 타입(boolean)을 바꾸지 않기 위해서다. 그래서 outcome 을
     주지 않고 부르는 호출자에게는 sandbox 경로가 아예 열리지
     않는다(그 호출자는 mount 를 받을 방법이 없으므로 화면이 빈
     채로 남을 것이다). 공개 경로는 언제나 outcome 을 준다
     (posts/view/posts-view-list.js).
  ====================================================== */

  const renderMode =
    typeof resolveSkinRenderMode === "function"
      ? resolveSkinRenderMode(skinPackage)
      : "native";

  if (renderMode === "sandbox" && outcome && typeof outcome === "object") {

    const prepared =
      await trySandboxSkinCategory({
        template: categoryTemplate,
        context,
        container
      });

    if (prepared) {

      outcome.sandboxMount =
        prepared.mount;

      outcome.sandboxRenderNative =
        prepared.renderNative;

      outcome.isGallery =
        context.category.isGallery === true;

      outcome.effectivePage =
        context.category.pagination
          ? context.category.pagination.currentPage
          : null;

      return true;

    }

    /* 준비에 실패하면 같은 스킨을 native 로 — 다시 시도하지 않는다 */

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

  /* GALLERY-1: 실제로 그려진 페이지 번호를 호출자에게 알려준다.
     범위를 벗어난 ?page=99로 들어왔으면 Context가 마지막 페이지로
     맞췄으므로 호출자가 주소도 그 값으로 정정한다
     (posts/view/posts-view-list.js). 갤러리가 아니면 null이다 —
     그때는 주소에 ?page=가 있을 이유가 없다. */

  if (outcome && typeof outcome === "object") {

    outcome.isGallery =
      context.category.isGallery === true;

    outcome.effectivePage =
      context.category.pagination
        ? context.category.pagination.currentPage
        : null;

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
