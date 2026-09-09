/* =========================================================
   SKIN FOLDER ENTRY (FOLDER-2 — Folder Route + Series Viewer)

   공개 FOLDER 페이지(/:slug/category/:cid/folder/:fid) 진입점.
   posts/view/posts-view-folder.js의 openFolderPage()가 이 모듈의
   renderPublishedSkinFolder()를 호출한다.

   skin-category.js / skin-post.js와 완전히 같은 원칙과 구조다 —
   ES 모듈이고(skin-render.js를 정적 import), classic script 쪽은
   index.html이 미리 선언한 window.skinFolderReady 핸드셰이크로 이
   함수를 넘겨받는다.

   책임 경계: 절대 throw하지 않는다. 실패 사유가 무엇이든(RPC 에러,
   templates.folder 없음, 폴더 없음, 보이는 direct 글 없음, region
   없음 등) false를 돌려주고, 호출자는 **그 카테고리 화면으로 복귀**
   한다(IMORY_FOLDER2_DESIGN.md). 폴더 전용 폴백 화면은 없다.

   본문은 여기서 다루지 않는다 — Context에는 글의 제목/링크만 있고
   (buildFolderSkinContext, skin/skin-context.js), 실제 본문은 호출자가
   렌더 뒤 instance.getRegions("post-body")로 글별 region을 받아
   직접 채운다(POST의 protected post-body contract와 같은 분리).

   의존(classic script, 먼저 로드): supabaseClient, buildFolderSkinContext,
   extractImageSlotNames, resolveSkinTemplate.
========================================================== */

import { renderSkin } from "./skin-render.js";

const SKIN_FOLDER_SUPPORTED_SCHEMA_VERSION = 1;

const SKIN_FOLDER_BODY_REGION_NAME = "post-body";

/* =========================================================
   renderPublishedSkinFolder({ ownerId, categoryId, folderId, container })
   -> Promise<false | { rendered: true, instance, context }>

   { rendered: true, instance, context }: published Skin이 이 폴더
   페이지의 outer chrome을 렌더했다. instance.getRegions("post-body")로
   글별 본문 자리를, context.folder.posts로 글 목록(id/isSecret)을
   받아 호출자가 본문을 채운다.
   false: 그릴 수 없다(정상 "없음" 포함) — 호출자는 카테고리로 복귀.
========================================================== */

export async function renderPublishedSkinFolder({ ownerId, categoryId, folderId, container }) {

  if (
    !ownerId ||
    categoryId === undefined || categoryId === null ||
    folderId === undefined || folderId === null ||
    !container
  ) {
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
      console.error("[skin-folder] get_published_skin RPC error", error);
      return false;
    }

    rpcData = data;

  } catch (err) {

    console.error("[skin-folder] get_published_skin RPC threw", err);
    return false;

  }

  if (!rpcData || !rpcData.skin) {
    return false;
  }

  const skinPackage = rpcData.skin;
  const schemaVersion = rpcData.schemaVersion;
  const imageSlotValues = rpcData.imageSlotValues || {};

  if (schemaVersion !== SKIN_FOLDER_SUPPORTED_SCHEMA_VERSION) {
    console.warn(`[skin-folder] unsupported schemaVersion ${schemaVersion}, falling back to category`);
    return false;
  }

  /* templates.folder는 선택이다 — 없으면 이 스킨에는 폴더 페이지가
     없다(그 경우 category.tree의 folderHref도 null이라 링크 자체가
     그려지지 않는다). 주소를 직접 친 경우가 여기로 온다. */
  const folderTemplate = resolveSkinTemplate(skinPackage, "folder");

  if (!folderTemplate) {
    return false;
  }

  const imageSlotNames = extractImageSlotNames(skinPackage);

  let context;

  try {

    context = await buildFolderSkinContext(ownerId, categoryId, folderId, {
      imageSlotNames,
      imageSlotValues
    });

  } catch (err) {

    console.error("[skin-folder] buildFolderSkinContext failed", err);
    return false;

  }

  /* 폴더 없음 / 다른 카테고리의 폴더 / 보이는 direct 글 없음 — 전부
     정상 "없음"이고 호출자가 카테고리로 돌려보낸다. */
  if (!context) {
    return false;
  }

  let skinInstance;

  try {

    skinInstance = renderSkin({
      container,
      skin: folderTemplate,
      context,
      mode: "view"
    });

  } catch (err) {

    console.error("[skin-folder] renderSkin failed", err);
    container.innerHTML = "";
    return false;

  }

  /* 본문 자리가 하나도 없는 FOLDER 템플릿은 무효다 — 제목만 나열되는
     반쪽짜리 화면을 공개하지 않는다(POST의 20-3절과 같은 원칙).
     repeat 안의 region만 센다(key가 있는 것) — repeat 밖의 단일
     region은 어느 글의 자리인지 알 수 없어 채울 수 없다. */
  const keyedRegions =
    skinInstance.getRegions(SKIN_FOLDER_BODY_REGION_NAME)
      .filter((region) => region.key !== null);

  if (keyedRegions.length === 0) {
    console.warn("[skin-folder] folder template has no post-body region inside the folder.posts repeat, falling back to category");
    container.innerHTML = "";
    return false;
  }

  return {
    rendered: true,
    instance: skinInstance,
    context
  };

}

if (typeof window !== "undefined") {

  window.renderPublishedSkinFolder = renderPublishedSkinFolder;

  if (typeof window.__resolveSkinFolderReady === "function") {
    window.__resolveSkinFolderReady(renderPublishedSkinFolder);
  }

}
