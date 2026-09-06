/* =========================================================
   SKIN STUDIO - DRAFT WRITE RPC WRAPPER (PHASE 1B Slice 4 /
   Skin Draft Publish)

   AI_SKIN_PHASE1B_DESIGN.md 10/22절. save_skin_draft_version()/
   publish_skin() RPC 호출만 감싼다 — skin_versions/skins를
   클라이언트가 직접 나눠 INSERT/UPDATE하는 경로는 만들지 않는다
   (9절, Slice 0 설계 원칙 그대로). publish_skin(p_skin_id)은 이미
   supabase/migrations/20260905100000_add_skin_draft_write_rpcs.sql
   에서 준비된 RPC다(current_published_version_id를
   current_draft_version_id로 이동, 새 row 생성 없음, 소유자 재확인은
   SECURITY DEFINER 함수 본문 안에서 이미 강제됨) — 이 파일은 그
   RPC를 호출하는 wrapper만 새로 추가한다.

   호출자(studio/studio-preview.js)는 이 함수들이 반환/변경하는
   값으로 자신의 currentDraftVersionId/currentPublishedVersionId
   상태를 갱신한다 — 이 파일은 그 상태를 전혀 들고 있지 않는다
   (순수 RPC wrapper, 22절 파일 책임 분리).

   classic script — window.saveSkinDraftVersion/window.publishSkin
   으로 노출된다. 의존: supabaseClient(core/lib/supabase-client.js),
   이 파일보다 먼저 로드되어야 함(studio/index.html 로드 순서 참고).
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


/* =========================================================
   publishSkin(skinId) — current_published_version_id를 현재
   current_draft_version_id로 이동한다(RPC 반환값 없음, void).
   실패(소유자 아님/draft 없음/네트워크 오류 등)는 항상 throw로만
   알린다 — 호출자(studio-preview.js)가 currentPublishedVersionId를
   실제로 갱신하는 시점은 이 호출이 성공한 뒤뿐이다.
========================================================== */

async function publishSkin(
  skinId
) {

  const {
    error
  } =
    await supabaseClient
      .rpc(
        "publish_skin",
        {
          p_skin_id: skinId
        }
      );

  if (error) {
    throw error;
  }

}


if (typeof window !== "undefined") {

  window.saveSkinDraftVersion =
    saveSkinDraftVersion;

  window.publishSkin =
    publishSkin;

}
