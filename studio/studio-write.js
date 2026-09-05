/* =========================================================
   SKIN STUDIO - DRAFT WRITE RPC WRAPPER (PHASE 1B Slice 4)

   AI_SKIN_PHASE1B_DESIGN.md 10/22절. save_skin_draft_version()
   RPC 호출 하나만 감싼다 — skin_versions/skins를 클라이언트가
   직접 나눠 INSERT/UPDATE하는 경로는 만들지 않는다(9절, Slice 0
   설계 원칙 그대로).

   호출자(studio/studio-preview.js)는 이 함수가 반환하는 새
   skin_versions.id로 자신의 current_draft_version_id 상태를
   갱신한다 — 이 파일은 그 상태를 전혀 들고 있지 않는다(순수
   RPC wrapper, 22절 파일 책임 분리).

   classic script — window.saveSkinDraftVersion으로 노출된다.
   의존: supabaseClient(core/lib/supabase-client.js), 이 파일보다
   먼저 로드되어야 함(studio/index.html 로드 순서 참고).
========================================================== */

async function saveSkinDraftVersion(
  skinId,
  content,
  schemaVersion,
  label
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .rpc(
        "save_skin_draft_version",
        {
          p_skin_id: skinId,
          p_content: content,
          p_schema_version: schemaVersion,
          p_label: label || null
        }
      );

  if (error) {
    throw error;
  }

  return data;

}


if (typeof window !== "undefined") {

  window.saveSkinDraftVersion =
    saveSkinDraftVersion;

}
