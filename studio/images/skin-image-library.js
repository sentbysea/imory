/* =========================================================
   SKIN IMAGE LIBRARY — 데이터 계층 (v0.1)

   SKIN_IMAGE_LIBRARY_PLAN.md 5절. Supabase Storage + skin_images /
   skin_version_image_slots에 대한 접근을 전부 이 파일 하나에
   모은다 — DOM에는 절대 접촉하지 않는다(UI는 studio/images/
   images-panel.js 몫, studio-preview.js와 동일한 파일 책임 분리).

   ★ 이 파일이 지키는 불변식

   1) 업로드 경로는 매번 새로 만든다: {user_id}/{uuid}.{ext},
      upsert:false. 기존 admin/settings/admin-settings-avatar.js는
      {user_id}/avatar 고정 경로에 upsert:true로 덮어쓰는데, 그건
      "같은 URL의 내용이 바뀐다"는 뜻이라 이미 발행된 공개 스킨이
      그 URL을 참조하고 있으면 Publish 없이도 공개 화면이 바뀐다.
      Image Library는 그 방식을 쓰지 않는다.

   2) 슬롯 연결은 이 파일이 직접 쓰지 않는다. 연결 기록은 오직
      save_skin_draft_version_with_image_slots() RPC(= Save)만
      만든다 — 그래야 published 버전의 연결이 사후에 바뀔 방법이
      아예 없다. 이 파일은 "읽기"와 "이미지 자체의 CRUD"만 한다.

   3) migration이 아직 적용되지 않은 배포에서도 Studio 전체가
      멀쩡해야 한다. isSkinImageLibraryReady()가 가벼운 probe로
      그걸 판정하고, UI는 그 결과에 따라 안내만 띄운다.

   classic script — window.skinImageLibrary 하나로 노출된다.
   의존(먼저 로드되어야 함): supabaseClient, SUPABASE_URL
   (core/lib/supabase-client.js).
========================================================== */

const SKIN_IMAGE_BUCKET = "skin-images";

/* DB(create_skin_image)와 반드시 같은 값이어야 한다 — 여기 값은
   사용자에게 빨리 알려주기 위한 것일 뿐, 신뢰 경계는 DB다. */
const SKIN_IMAGE_ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
];

const SKIN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const SKIN_IMAGE_MAX_COUNT = 100;

const SKIN_IMAGE_EXTENSION_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};


/* =========================================================
   준비 상태 probe

   migration 적용 전에는 skin_images 테이블 자체가 없어 이 쿼리가
   에러를 낸다 — 그 에러를 "아직 준비 안 됨"으로만 해석하고 절대
   throw하지 않는다(Studio 다른 기능이 이 때문에 죽으면 안 된다).
   결과는 한 번만 판정해서 캐시한다.
========================================================== */

let skinImageLibraryReadyPromise = null;

function isSkinImageLibraryReady() {

  if (skinImageLibraryReadyPromise) {
    return skinImageLibraryReadyPromise;
  }

  skinImageLibraryReadyPromise = (async () => {

    try {

      const { error } =
        await supabaseClient
          .from("skin_images")
          .select("id")
          .limit(1);

      if (error) {
        console.warn("[skin-image-library] not available yet:", error.message);
        return false;
      }

      return true;

    } catch (err) {

      console.warn("[skin-image-library] probe threw", err);
      return false;

    }

  })();

  return skinImageLibraryReadyPromise;

}


/* =========================================================
   내 이미지 목록
========================================================== */

async function listSkinImages() {

  const { data, error } =
    await supabaseClient
      .from("skin_images")
      .select("id, storage_path, public_url, original_name, mime_type, byte_size, created_at")
      .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];

}


/* =========================================================
   업로드 전 검증

   { ok:true } 또는 { ok:false, message } — 호출자가 그대로 사용자에게
   보여줄 수 있는 한국어 메시지를 돌려준다.
========================================================== */

function validateSkinImageFile(file) {

  if (!file) {
    return { ok: false, message: "파일을 선택해주세요." };
  }

  if (!SKIN_IMAGE_ALLOWED_MIME.includes(file.type)) {
    return {
      ok: false,
      message: "PNG · JPG · WEBP · GIF 이미지만 올릴 수 있어요."
    };
  }

  if (file.size <= 0) {
    return { ok: false, message: "빈 파일은 올릴 수 없어요." };
  }

  if (file.size > SKIN_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: `파일이 너무 커요 (최대 ${Math.floor(SKIN_IMAGE_MAX_BYTES / 1024 / 1024)}MB).`
    };
  }

  return { ok: true };

}


/* =========================================================
   업로드

   Storage 업로드 -> create_skin_image() 등록 순서로 진행한다.
   등록이 실패하면 방금 올린 object를 되돌리려 시도하고(실패해도
   그냥 넘어간다 — 고아 파일 정리 정책은 SKIN_IMAGE_LIBRARY_PLAN.md
   7절, 자동 정리 작업은 만들지 않는다), 사용자에겐 실패로 알린다.

   반환: 등록된 skin_images row
========================================================== */

function buildSkinImageStoragePath(userId, mimeType) {

  const extension =
    SKIN_IMAGE_EXTENSION_BY_MIME[mimeType] || "bin";

  /*
    crypto.randomUUID()는 secure context(https/localhost)에서만
    보장된다 — Studio는 항상 그 조건이지만, 없을 때를 대비한
    폴백도 둔다(경로 충돌만 피하면 되므로 암호학적 강도가
    요구되지 않는다).
  */
  const unique =
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${userId}/${unique}.${extension}`;

}


function buildSkinImagePublicUrl(storagePath) {

  return (
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${SKIN_IMAGE_BUCKET}/${storagePath}`
  );

}


async function uploadSkinImage(file) {

  const validation = validateSkinImageFile(file);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (userError || !userData?.user) {
    throw new Error("로그인이 필요합니다.");
  }

  const storagePath =
    buildSkinImageStoragePath(userData.user.id, file.type);

  const { error: uploadError } =
    await supabaseClient
      .storage
      .from(SKIN_IMAGE_BUCKET)
      .upload(storagePath, file, {
        /*
          upsert:false — 경로는 매번 새로 만드므로 덮어쓸 일이
          없어야 하고, 혹시 충돌하면 조용히 덮어쓰는 대신 실패해야
          한다(이미 공개된 이미지를 바꿔치기하는 사고 방지).
        */
        upsert: false,
        contentType: file.type,
        cacheControl: "31536000"
      });

  if (uploadError) {
    throw uploadError;
  }

  const publicUrl =
    buildSkinImagePublicUrl(storagePath);

  const { data, error } =
    await supabaseClient
      .rpc("create_skin_image", {
        p_storage_path: storagePath,
        p_public_url: publicUrl,
        p_original_name: file.name || null,
        p_mime_type: file.type,
        p_byte_size: file.size
      });

  if (error) {

    /*
      등록에 실패했으니 방금 올린 object는 아무도 참조하지 않는다 —
      되돌릴 수 있으면 되돌린다. 이 삭제까지 실패하면 고아 파일이
      남지만, 어떤 화면에도 나타나지 않고 자동 정리도 하지 않는다
      (수동 조회 쿼리는 계획 문서 7절).
    */

    try {
      await supabaseClient
        .storage
        .from(SKIN_IMAGE_BUCKET)
        .remove([storagePath]);
    } catch (removeErr) {
      console.warn("[skin-image-library] orphan cleanup failed", removeErr);
    }

    throw error;

  }

  return data;

}


/* =========================================================
   삭제

   delete_skin_image()가 참조 여부를 확인하고 storage_path를
   돌려준다 — 그 다음에야 Storage object를 지운다. 순서를 반대로
   하면 "참조 중이라 DB는 못 지웠는데 파일만 사라진" 상태가 될 수
   있다.
========================================================== */

async function deleteSkinImage(imageId) {

  const { data: storagePath, error } =
    await supabaseClient
      .rpc("delete_skin_image", { p_image_id: imageId });

  if (error) {
    throw error;
  }

  if (storagePath) {

    const { error: removeError } =
      await supabaseClient
        .storage
        .from(SKIN_IMAGE_BUCKET)
        .remove([storagePath]);

    if (removeError) {
      /* DB row는 이미 지워졌다 — 사용자에겐 성공이고, 남은 파일은
         고아 정리 정책의 대상이다(계획 문서 7절). */
      console.warn("[skin-image-library] storage object not removed", removeError);
    }

  }

}


/* =========================================================
   버전별 슬롯 연결 읽기

   { slotName: { imageId, imageUrl } } 형태로 돌려준다 — Preview는
   URL만 필요하고(buildSkinContext의 imageSlotValues), Save는 id가
   필요하기 때문에 둘 다 들고 있는다.

   versionId가 없으면(아직 draft가 없는 이례적 상태) 빈 객체.
========================================================== */

async function loadVersionImageSlots(versionId) {

  if (!versionId) {
    return {};
  }

  const { data, error } =
    await supabaseClient
      .from("skin_version_image_slots")
      .select("slot_name, image_id, skin_images(public_url)")
      .eq("version_id", versionId);

  if (error) {
    throw error;
  }

  const bindings = {};

  (data || []).forEach((row) => {

    const url = row.skin_images?.public_url;

    if (!url) {
      return;
    }

    bindings[row.slot_name] = {
      imageId: row.image_id,
      imageUrl: url
    };

  });

  return bindings;

}


/* =========================================================
   versionUsesImageLibrary(versionId)

   "이 버전이 Image Library 모델로 저장된 버전인가"
   (skin_versions.uses_image_library).

   왜 버전 단위인가: 연결 0건이라는 사실만으로는 "도입 이전 버전"과
   "새 모델에서 의도적으로 전부 비운 버전"을 구분할 수 없다. 그렇다고
   skin 단위로("이 skin이 한 번이라도 썼는가") 판정하면, legacy 이미지를
   가진 공개 버전이 그대로인데 새 draft를 Save하는 순간 그 판정이
   뒤집혀 공개 화면이 Publish 없이 바뀐다. get_published_skin()이
   published 버전 하나로 판정하는 것과 대칭으로, Studio는 draft 버전
   하나로 판정한다.

   migration 적용 전에는 이 컬럼 자체가 없다 — 호출자가
   isSkinImageLibraryAvailable일 때만 부른다.
========================================================== */

async function versionUsesImageLibrary(versionId) {

  if (!versionId) {
    return false;
  }

  const { data, error } =
    await supabaseClient
      .from("skin_versions")
      .select("uses_image_library")
      .eq("id", versionId)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data && data.uses_image_library);

}


if (typeof window !== "undefined") {

  window.skinImageLibrary = {
    BUCKET: SKIN_IMAGE_BUCKET,
    ALLOWED_MIME: SKIN_IMAGE_ALLOWED_MIME,
    MAX_BYTES: SKIN_IMAGE_MAX_BYTES,
    MAX_COUNT: SKIN_IMAGE_MAX_COUNT,

    isReady: isSkinImageLibraryReady,
    list: listSkinImages,
    validateFile: validateSkinImageFile,
    upload: uploadSkinImage,
    remove: deleteSkinImage,
    loadVersionSlots: loadVersionImageSlots,
    versionUsesLibrary: versionUsesImageLibrary
  };

}
