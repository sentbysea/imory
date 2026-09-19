/* =========================================================
   SKIN HOME ENTRY (Slice 4)

   공개 HOME 진입점. index.html의 initHomeRenderer()가 새 Skin
   렌더 경로를 시도할 때 이 모듈의 renderPublishedSkinHome()을
   호출한다.

   이 파일은 ES 모듈이다(skin-render.js를 정적 import하므로) —
   index.html은 `<script type="module" src="skin/skin-home.js">`로
   로드해야 한다. classic script인 initHomeRenderer()가 이 모듈의
   함수를 "전역이 생기길 기다리며 폴링"하는 대신, 명시적 Promise
   핸드셰이크(window.skinHomeReady)로 안전하게 넘겨받는다 —
   index.html이 먼저 `window.skinHomeReady = new Promise(...)`를
   선언해 두고, 이 모듈은 로드를 마치는 순간 그 Promise를
   resolve한다. 모듈 코드는 항상 자신의 정적 import가 전부 끝난
   뒤에만 실행되므로, resolve되는 시점엔 renderSkin() 내부가
   의존하는 validateAndScopeSkinCss/css-tree까지 전부 준비되어
   있음이 보장된다 — "언젠가 전역이 생기겠지" 하고 기다리는
   race condition이 아니다.

   의존(classic script, 이 모듈보다 먼저 로드되어야 함):
   supabaseClient(core/lib/supabase-client.js), buildSkinContext
   (skin/skin-context.js), extractImageSlotNames
   (skin/skin-image-slots.js — Studio Preview 경로와 공유하는 공용
   helper, Slice 3), resolveSkinTemplate(skin/skin-template.js —
   PHASE 1C-B부터 HOME 렌더 대상 선택에 실제로 쓰인다). renderSkin은
   정적 import로 받는다.

   책임 경계: renderPublishedSkinHome()은 절대 throw하지 않는다
   — 실패 사유가 무엇이든(RPC 에러, context 빌드 실패, 알 수
   없는 schemaVersion 등) 항상 false를 반환해서 호출자가 기존
   legacy HOME(legacy_sua/customize/notice)으로 조용히 폴백할 수
   있게 한다(AI_SKIN_PHASE1A_DESIGN.md 10절 fallback 표). 새 Skin
   시스템의 장애가 기존 사용자의 HOME을 절대 깨뜨리지 않는다는
   원칙이 이 함수 하나에 집중되어 있다.

   RPC에서 받은 published Skin은 DB 저장값이라도 신뢰하지 않는다
   — 이 파일 어디에도 raw innerHTML/<style> 삽입이 없고, 실제
   DOM 반영은 전부 renderSkin()을 거친다(그 함수 내부가 매번
   sanitize/validate/namespace를 강제하는 유일한 신뢰 경계,
   Slice 3.5).
========================================================== */

import { renderSkin } from "./skin-render.js";

const SKIN_HOME_SUPPORTED_SCHEMA_VERSION = 1;

/* =========================================================
   tryMountSandboxSkinHome({ container, template, context })
     -> Promise<boolean>

   SANDBOX-1. true면 별도 origin의 iframe에 HOME이 실제로 그려졌다
   — 호출자는 native 렌더를 하지 않는다. false면 아무것도 남기지
   않았다(iframe도 치웠다) — 호출자는 오늘과 같은 native 경로로
   간다.

   ★ 절대 throw하지 않는다. 이 파일의 계약(상단 "책임 경계")이
     renderPublishedSkinHome() 전체에 걸리므로, 새로 들어온 이
     경로도 같은 규칙을 지킨다.

   ★ 기능 플래그가 꺼져 있으면 아무 일도 하지 않는다.
     판정은 skin/sandbox/skin-sandbox-config.js의
     isSandboxSkinEnabled() 하나뿐이고, production에서는 그 함수가
     hostname과 **블로그 slug** allowlist만 본다 — 공개 방문자가
     주소에 쿼리를 붙이는 것으로는 켜지지 않는다(그 opt-in 경로는
     로컬 개발 호스트에만 있다). 여기서 먼저 보는 이유는 플래그가 꺼진 배포에서
     window.skinSandboxHostReady를 기다리지 않게 하기 위해서다
     (index.html이 그 Promise를 선언만 하고 모듈 로드에 실패하면
      영원히 pending일 수 있다).
========================================================== */

async function tryMountSandboxSkinHome({ container, template, context }) {

  try {

    if (
      typeof isSandboxSkinEnabled !== "function" ||
      isSandboxSkinEnabled(window) !== true
    ) {
      return false;
    }


    if (!window.skinSandboxHostReady) {
      return false;
    }


    const host =
      await window.skinSandboxHostReady;

    if (!host || typeof host.mountSandboxSkin !== "function") {
      return false;
    }


    const result =
      await host.mountSandboxSkin({
        container,
        pageType: "home",
        template,
        context,

        /*
          SANDBOX-5B — HOME 프레임은 다른 화면으로 옮겨 갈 때
          **내려간다**(그 자리에 남아 타이머·저자 JS 가 계속 도는
          것을 막는다). HOME 으로 돌아오면 host 가 같은 재료로
          다시 띄우는데, 그 복귀가 실패하면 백지가 된다. 그때
          쓰라고 같은 스킨의 native 렌더를 함께 넘긴다 — 조회도
          Context 조립도 다시 하지 않는다.
        */

        renderNative: function (target) {

          renderSkin({
            container: target,
            skin: template,
            context,
            mode: "view"
          });

        }
      });

    if (!result || !result.ok) {

      console.warn(
        "[skin-home] sandbox mount failed, falling back to native skin render:",
        result ? result.reason : "no-result"
      );

      return false;

    }


    return true;

  }

  catch (err) {

    /* 어떤 이유로 실패하든 native로 간다. 원인만 남긴다. */
    console.error("[skin-home] sandbox mount threw", err);

    return false;

  }

}

/* =========================================================
   renderPublishedSkinHome({ ownerId, container }) -> Promise<boolean>

   true: published Skin을 실제로 렌더했다 — 호출자는 legacy HOME
   분기를 건드리지 말고 즉시 return해야 한다.
   false: 이 사용자에게 적용 가능한 published Skin이 없거나(정상
   상태, Case A) 어떤 단계에서든 실패했다(Case B/C/D) — 호출자는
   기존 legacy 3-way 분기를 그대로 진행해야 한다.
========================================================== */

export async function renderPublishedSkinHome({ ownerId, container }) {

  if (!ownerId || !container) {
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
      console.error("[skin-home] get_published_skin RPC error", error);
      return false;
    }

    rpcData = data;

  } catch (err) {

    /* Case B: RPC 자체가 실패(네트워크 등) — legacy HOME으로 폴백,
       공개 홈페이지 전체가 죽지 않는다. */
    console.error("[skin-home] get_published_skin RPC threw", err);
    return false;

  }

  /* Case A: published Skin 없음(draft만 있거나, skins row 자체가
     없거나, is_active=false) — get_published_skin()이 null을
     반환한다(정상 상태, 에러 아님). 조용히 legacy HOME으로 폴백. */
  if (!rpcData || !rpcData.skin) {
    return false;
  }

  const skinPackage = rpcData.skin;
  const schemaVersion = rpcData.schemaVersion;
  const imageSlotValues = rpcData.imageSlotValues || {};

  /* Case D: 이 렌더러가 모르는 미래 schemaVersion — best-effort
     부분 렌더를 시도하지 않고 즉시 폴백한다(설계 문서 3/10절
     "모르는 버전은 곧장 fallback"). 10절이 말하는 "Imory 기본
     fallback skin"은 Slice 5(skin-fallback.js)의 산출물로, 이번
     Slice엔 아직 없다 — 그때까지는 임시로 legacy HOME을 그
     fallback으로 쓴다(v0.1 유일하게 존재하는 스키마가 1이라
     실질적으로 도달할 일이 없는 분기이며, Slice 5에서 이 지점만
     교체하면 된다). */
  if (schemaVersion !== SKIN_HOME_SUPPORTED_SCHEMA_VERSION) {
    console.warn(`[skin-home] unsupported schemaVersion ${schemaVersion}, falling back to legacy HOME`);
    return false;
  }

  /* PHASE 1C-B: HOME 렌더 대상을 resolveSkinTemplate()으로 고른다
     (skin/skin-template.js, classic global). templates.home이 있는
     새 멀티페이지 Skin은 그것을 쓰고, 없는 기존 html-only Skin은
     그대로 top-level html/css로 폴백한다 — 반환 shape은 항상
     {html, css}라 아래 renderSkin() 호출은 바뀌지 않는다. 이
     함수가 undefined를 돌려주는 경우(스키마상 있을 수 없지만
     방어적으로)도 legacy HOME으로 조용히 폴백한다(Case C와
     동일한 결). */
  const homeTemplate = resolveSkinTemplate(skinPackage, "home");

  if (!homeTemplate) {
    console.warn("[skin-home] published skin has no resolvable HOME template, falling back to legacy HOME");
    return false;
  }

  const imageSlotNames = extractImageSlotNames(skinPackage);

  let context;

  try {

    context = await buildSkinContext(ownerId, {
      imageSlotNames,
      imageSlotValues,

      /*
        재료 일치 라운드 — HOME 의 발췌 카드 자리(home.highlights)는
        조회를 두 번 더 부른다. 그 자리를 그리지 않는 스킨에서는
        켜지 않는다(skin/skin-template.js skinTemplateUsesHomeHighlights,
        skin/skin-context.js buildHomeSkinContext). Studio Preview 는
        이 값을 넘기지 않으므로 항상 조회한다 — 편집 중에 막 붙인
        마크업이 곧바로 살아나야 하기 때문이다.
      */
      supportsHomeHighlights:
        skinTemplateUsesHomeHighlights(homeTemplate)
    });

  } catch (err) {

    console.error("[skin-home] buildSkinContext failed", err);
    return false;

  }

  /* =====================================================
     SANDBOX-1 — renderMode: "sandbox" 인 스킨만 별도 origin의
     iframe에서 그린다 (IMORY_SANDBOX_SKIN_DESIGN.md).

     ★ 분기가 여기 한 곳뿐인 이유

     공개 HOME의 조회·schemaVersion 검사·template 선택·Context
     조립은 **위에서 이미 끝났다**. sandbox는 "그 결과를 어디에
     그리는가"만 다르다 — 그래서 조건문이 renderSkin() 호출 바로
     앞 한 줄에 모인다. skin-category.js / skin-post.js 등 다른
     다섯 진입 모듈은 이 라운드에서 한 줄도 고치지 않았다.

     ★ renderMode가 없는(=대부분의) 스킨은 오늘과 같은 경로다

     resolveSkinRenderMode()가 "native"를 돌려주면 아래 if는
     곧바로 거짓이고, 그 뒤 코드는 이 라운드 이전과 같다.

     ★ HOME이 아닌 화면에서는 sandbox 스킨도 native로 그린다

     이번 라운드의 범위가 HOME 한 장이다. CATEGORY/POST/FOLDER/
     HIGHLIGHTS/BANNER는 renderMode를 **보지 않는다** — sandbox
     패키지도 지금까지의 마크업 계약을 그대로 지키므로 native
     렌더 결과가 정상 화면이다(설계 문서 §C). "미지원"이라며
     화면을 비우지 않는다.

     ★ 실패는 한 번만, 그리고 조용히

     플래그가 꺼져 있거나 frame origin이 없거나 READY/RENDERED가
     오지 않으면 iframe을 치우고 **같은 스킨을 native로** 그린다.
     다시 시도하지 않는다(무한 재시도 금지). 이 함수의 계약대로
     여기서도 throw하지 않는다.
  ====================================================== */

  const renderMode =
    typeof resolveSkinRenderMode === "function"
      ? resolveSkinRenderMode(skinPackage)
      : "native";

  if (renderMode === "sandbox") {

    const mounted =
      await tryMountSandboxSkinHome({
        container,
        template: homeTemplate,
        context
      });

    if (mounted) {

      window.syncSkinBottomDockForScreen?.({
        skinPackage,
        context,
        container,
        pageType: "home"
      });

      return true;

    }

  }

  /* Case C: Skin package가 malformed여도 renderSkin() 내부의
     sanitize/validate가 방어한다 — 여기서 재검증하지 않는다
     (Slice 3.5 신뢰 경계 그대로 유지). renderSkin이 실제로
     throw하는 경우는 container 누락 등 극히 예외적인 상황뿐이지만
     방어적으로 감싼다. */
  try {

    renderSkin({
      container,
      skin: homeTemplate,
      context,
      mode: "view"
    });

  } catch (err) {

    console.error("[skin-home] renderSkin failed", err);
    return false;

  }

  window.syncSkinBottomDockForScreen?.({
    skinPackage,
    context,
    container,
    pageType: "home"
  });

  return true;

}

/* index.html의 classic script(initHomeRenderer)가 폴링 없이
   이 모듈을 안전하게 넘겨받도록 하는 핸드셰이크 — 상단 주석
   참고. window.skinHomeReady는 index.html이 이 모듈보다 먼저
   선언해 둔다. */
if (typeof window !== "undefined") {

  window.renderPublishedSkinHome = renderPublishedSkinHome;

  if (typeof window.__resolveSkinHomeReady === "function") {
    window.__resolveSkinHomeReady(renderPublishedSkinHome);
  }

}
