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
   (skin/skin-context.js). renderSkin은 정적 import로 받는다.

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
   Skin Package의 imageSlots 정의에서 slot 이름만 뽑아
   buildSkinContext()에 넘긴다 — "이 Skin이 어떤 이미지 자리를
   필요로 하는지"는 Skin Package(저장된 구조)의 책임이고,
   "그 자리에 실제로 어떤 URL이 들어있는지"는 RPC의
   imageSlotValues(개인 데이터, skin_image_slot_values 테이블)의
   책임이다 — 이 함수는 그 둘을 잇는 지점.
========================================================== */

function extractImageSlotNames(skinPackage) {

  if (!skinPackage || !Array.isArray(skinPackage.imageSlots)) {
    return [];
  }

  return skinPackage.imageSlots
    .map((slot) => (slot && typeof slot.name === "string" ? slot.name : null))
    .filter(Boolean);

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

  const imageSlotNames = extractImageSlotNames(skinPackage);

  let context;

  try {

    context = await buildSkinContext(ownerId, {
      imageSlotNames,
      imageSlotValues
    });

  } catch (err) {

    console.error("[skin-home] buildSkinContext failed", err);
    return false;

  }

  /* Case C: Skin package가 malformed여도 renderSkin() 내부의
     sanitize/validate가 방어한다 — 여기서 재검증하지 않는다
     (Slice 3.5 신뢰 경계 그대로 유지). renderSkin이 실제로
     throw하는 경우는 container 누락 등 극히 예외적인 상황뿐이지만
     방어적으로 감싼다. */
  try {

    renderSkin({
      container,
      skin: skinPackage,
      context,
      mode: "view"
    });

  } catch (err) {

    console.error("[skin-home] renderSkin failed", err);
    return false;

  }

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
