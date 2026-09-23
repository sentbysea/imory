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

  /*
    올리기 전에 메타데이터를 지우고 용량을 줄인다(모든 업로드 경로
    공용 — core/lib/image-upload.js). 예전에는 이 경로만 원본을
    그대로 올렸다.

    Studio는 블로그의 보호 설정을 읽지 않으므로 stripMetadata는
    끈다 — 실패해도 원본을 올린다. 성공하면 어차피 다시 인코딩된
    파일이라 메타데이터는 남지 않는다.

    저장 경로를 file.type의 확장자로 만들기 때문에(png → jpeg로
    바뀔 수 있다) **준비한 뒤에** 경로를 만들어야 한다.
  */

  const prepared =
    await prepareImoryUploadImage(
      file,
      {
        stripMetadata: false
      }
    );

  const upload = prepared.file || file;

  const storagePath =
    buildSkinImageStoragePath(userData.user.id, upload.type);

  const { error: uploadError } =
    await supabaseClient
      .storage
      .from(SKIN_IMAGE_BUCKET)
      .upload(storagePath, upload, {
        /*
          upsert:false — 경로는 매번 새로 만드므로 덮어쓸 일이
          없어야 하고, 혹시 충돌하면 조용히 덮어쓰는 대신 실패해야
          한다(이미 공개된 이미지를 바꿔치기하는 사고 방지).
        */
        upsert: false,
        contentType: upload.type,
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
        /* 원본 이름은 사용자가 고른 그 파일 이름을 남긴다 */
        p_original_name: file.name || null,
        p_mime_type: upload.type,
        p_byte_size: upload.size
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
   STUDIO-LAYERS-MEDIA-1 — 이 이미지를 **어디서** 쓰고 있나

   loadSkinImageUsage(imageId)
     -> { total, published, draft, past, versions: [...] }

   연결은 버전 단위다. 그래서 같은 이미지가 여러 버전에 동시에
   걸려 있고, 그중 하나가 지금 공개 중인 버전일 수 있다. 사용자에게
   "몇 곳에서 쓰는가"를 말하려면 그 셋을 갈라야 한다.

     published  지금 공개 중인 버전(= 지우면 공개 화면이 비워진다)
     draft      마지막으로 **저장한** 편집본
     past       그 밖의 지난 저장본

   ★ 지금 화면에서 편집 중인(아직 저장하지 않은) 연결은 여기 없다 —
     그것은 DB 가 아니라 메모리의 working draft 라
     getStudioImageSlotState() 가 안다. 세는 곳이 둘인 이유이고,
     둘을 합치는 곳은 패널이다(images-panel.js).

   ★ 읽기만 한다. 이 함수는 아무것도 지우지 않는다.

   권한: skin_version_image_slots 와 skins 는 소유자에게 select 가
   열려 있다(migration 20260907100000 · 20260904110000). 그래서 새
   RPC 없이 그대로 읽는다.
========================================================== */

async function loadSkinImageUsage(imageId) {

  const empty =
    { total: 0, published: 0, draft: 0, past: 0, versions: [] };

  if (!imageId) {
    return empty;
  }

  const { data: rows, error } =
    await supabaseClient
      .from("skin_version_image_slots")
      .select("version_id, slot_name")
      .eq("image_id", imageId);

  if (error) {
    throw error;
  }

  if (!rows || !rows.length) {
    return empty;
  }

  const versionIds =
    Array.from(new Set(rows.map((row) => row.version_id)));

  const { data: versions, error: versionError } =
    await supabaseClient
      .from("skin_versions")
      .select("id, skin_id")
      .in("id", versionIds);

  if (versionError) {
    throw versionError;
  }

  const skinIdOf = {};

  (versions || []).forEach((version) => {
    skinIdOf[version.id] = version.skin_id;
  });

  const skinIds =
    Array.from(new Set(Object.values(skinIdOf)));

  const { data: skins, error: skinError } =
    skinIds.length
      ? await supabaseClient
          .from("skins")
          .select("id, current_draft_version_id, current_published_version_id")
          .in("id", skinIds)
      : { data: [], error: null };

  if (skinError) {
    throw skinError;
  }

  const pointerOf = {};

  (skins || []).forEach((skin) => {
    pointerOf[skin.id] = skin;
  });

  const usage =
    { total: rows.length, published: 0, draft: 0, past: 0, versions: [] };

  rows.forEach((row) => {

    const skin =
      pointerOf[skinIdOf[row.version_id]] || null;

    const where =
      (skin && skin.current_published_version_id === row.version_id)
        ? "published"
        : (
            (skin && skin.current_draft_version_id === row.version_id)
              ? "draft"
              : "past"
          );

    usage[where] += 1;

    usage.versions.push({
      versionId: row.version_id,
      slotName: row.slot_name,
      where: where
    });

  });

  return usage;

}


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 사용처에서 제거하고 삭제

   deleteSkinImageEverywhere(imageId)

   위 삭제(deleteSkinImage)와 **순서가 같다**: 참조 제거 → DB row
   삭제 → Storage object 삭제. 앞 둘은 새 RPC 하나가 한 트랜잭션에서
   하고(migration 20260923100000), 파일은 그 RPC 가 돌려준 경로로
   여기서 지운다.

   ★ 참조 제거에 실패하면 파일을 지우지 않는다 — RPC 가 예외를 내면
     이 함수는 거기서 끝난다(깨진 URL 을 남기지 않는다).
   ★ 파일 삭제만 실패하면 그 사실을 **호출자에게 알린다**(여기서
     삼키지 않는다). 지금까지의 delete 와 다른 점이다 — 그쪽은
     "지워졌다"로 끝냈지만, 이 경로는 사용자가 용량을 되찾으려고
     누른 것이라 재시도할 기회를 줘야 한다.

   -> { storagePath, storageRemoved: boolean, storageError }

   ★ migration 이 아직 적용되지 않은 배포에서는 RPC 가 없어 예외가
     난다(PostgREST 404 / PGRST202). 그 경우 지금까지처럼 "사용 중이라
     지울 수 없다"로 남는 것이 옳다 — 호출자가 그 메시지를 만든다.
========================================================== */

async function deleteSkinImageEverywhere(imageId) {

  const { data: storagePath, error } =
    await supabaseClient
      .rpc("delete_skin_image_everywhere", { p_image_id: imageId });

  if (error) {
    throw error;
  }

  if (!storagePath) {
    return { storagePath: null, storageRemoved: true, storageError: null };
  }

  const { error: removeError } =
    await supabaseClient
      .storage
      .from(SKIN_IMAGE_BUCKET)
      .remove([storagePath]);

  return {
    storagePath: storagePath,
    storageRemoved: !removeError,
    storageError: removeError || null
  };

}


/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 남은 파일만 다시 지우기

   위에서 DB row 는 지워졌는데 Storage 삭제만 실패했을 때의 재시도다.
   DB 를 다시 만지지 않는다(이미 지워졌다).
========================================================== */

async function removeSkinImageObject(storagePath) {

  if (!storagePath) {
    return;
  }

  const { error } =
    await supabaseClient
      .storage
      .from(SKIN_IMAGE_BUCKET)
      .remove([storagePath]);

  if (error) {
    throw error;
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

    /* STUDIO-LAYERS-MEDIA-1 */
    usage: loadSkinImageUsage,
    removeEverywhere: deleteSkinImageEverywhere,
    removeObject: removeSkinImageObject,

    loadVersionSlots: loadVersionImageSlots,
    versionUsesLibrary: versionUsesImageLibrary
  };

}
