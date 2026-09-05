/* =========================================================
   SKIN IMAGE SLOTS — 공용 helper

   AI_SKIN_PHASE1B_DESIGN.md Slice 3, 5절. Skin Package의
   imageSlots 정의에서 slot 이름만 뽑아내는 로직을 skin/skin-home.js
   (공개 HOME 경로)와 studio/studio-preview.js(Studio Preview 경로)
   양쪽이 공유한다 — "이 Skin이 어떤 이미지 자리를 필요로 하는지"는
   Skin Package(저장된 구조)의 책임이고, "그 자리에 실제로 어떤
   URL이 들어있는지"는 별도 조회(skin_image_slot_values 또는
   get_published_skin RPC의 imageSlotValues)의 책임이다 — 이 함수는
   그 둘을 잇는 지점.

   DOM/Supabase 접촉 없는 순수 함수. classic script —
   window.extractImageSlotNames로 노출된다. skin/skin-context.js보다
   먼저 로드될 필요는 없다(서로 독립).
========================================================== */

function extractImageSlotNames(skinPackage) {

  if (!skinPackage || !Array.isArray(skinPackage.imageSlots)) {
    return [];
  }

  return skinPackage.imageSlots
    .map((slot) => (slot && typeof slot.name === "string" ? slot.name : null))
    .filter(Boolean);

}

if (typeof window !== "undefined") {
  window.extractImageSlotNames = extractImageSlotNames;
}
