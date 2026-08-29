/* =========================================================
   POSTS VIEW - BANNER ADD/EDIT FORM

   posts-view-banner.js 분할본. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음, renderBannerGrid 등은
   posts-view-banner.js에 있음(둘 다 이 파일보다 먼저
   로드돼야 함).

   배너 이미지는 URL을 직접 입력받지 않고 MY BANNER
   (admin/settings/admin-my-banner.js)와 같은 방식으로
   Supabase Storage에 업로드한다 — 친구가 이미지를 지우거나
   옮기면 우리 목록도 같이 깨지던 문제를 없애려는 것.
   같은 user-banners 버킷/RLS 정책을 재사용하되, 경로만
   {user_id}/category-banners/{uuid}/image 로 나눠서 씀
   (MY BANNER는 {user_id}/banner 하나뿐이라 안 겹침).

   내용: 배너 추가/수정 폼 열기/닫기, 이미지 업로드/미리보기,
   저장(insert/update), 삭제(Storage 파일도 같이 정리).
========================================================== */

const BANNER_CATEGORY_IMAGE_BUCKET =
  "user-banners";


/*
  지금 폼에 올라가 있는 이미지의 Storage 경로/공개 URL.
  openBannerForm에서 기존 배너 값으로 채워지거나,
  업로드 성공 시 새 값으로 바뀐다. save할 때 이 값을 그대로
  banners.image_path / image_url에 쓴다.
*/

let editingBannerImagePath =
  null;

let editingBannerImageUrl =
  null;



/* =========================================================
   폼 열기/닫기
========================================================== */

function openBannerForm(
  banner =
    null
) {

  editingBannerId =
    banner
      ? banner.id
      : null;


  editingBannerImagePath =
    banner?.image_path ||
    null;


  editingBannerImageUrl =
    banner?.image_url ||
    null;


  if (
    bannerEditorHeading
  ) {

    bannerEditorHeading.textContent =
      banner
        ? "EDIT BANNER"
        : "ADD BANNER";

  }


  if (bannerEditorName) {

    bannerEditorName.value =
      banner?.name ||
      "";

  }


  if (bannerEditorUrl) {

    bannerEditorUrl.value =
      banner?.url ||
      "";

  }


  if (
    bannerEditorFileInput
  ) {

    bannerEditorFileInput.value =
      "";

  }


  if (
    bannerEditorUploadMessage
  ) {

    bannerEditorUploadMessage.textContent =
      "";

  }


  updateBannerEditorPreview(
    editingBannerImageUrl
  );


  if (
    bannerEditorDelete
  ) {

    bannerEditorDelete.hidden =
      !banner;

  }


  if (
    bannerEditorMessage
  ) {

    bannerEditorMessage.textContent =
      "";

  }


  if (bannerGrid) {

    bannerGrid.hidden =
      true;

  }


  if (bannerEditor) {

    bannerEditor.hidden =
      false;

  }


  bannerEditorName
    ?.focus();

}


function closeBannerForm() {

  editingBannerId =
    null;


  editingBannerImagePath =
    null;


  editingBannerImageUrl =
    null;


  if (bannerEditor) {

    bannerEditor.hidden =
      true;

  }


  if (bannerGrid) {

    bannerGrid.hidden =
      false;

  }

}


function updateBannerEditorPreview(
  url
) {

  if (
    !bannerEditorPreview
  ) {
    return;
  }


  if (!url) {

    bannerEditorPreview.hidden =
      true;


    bannerEditorPreview.removeAttribute(
      "src"
    );


    if (
      bannerEditorPreviewEmpty
    ) {

      bannerEditorPreviewEmpty.hidden =
        false;

    }


    return;

  }


  bannerEditorPreview.src =
    url;


  bannerEditorPreview.hidden =
    false;


  if (
    bannerEditorPreviewEmpty
  ) {

    bannerEditorPreviewEmpty.hidden =
      true;

  }

}



/* =========================================================
   이미지 업로드(같은 배너면 같은 경로에 덮어쓰기)
========================================================== */

async function handleBannerEditorFileChange(
  event
) {

  const file =
    event.target.files?.[0];


  if (!file) {
    return;
  }


  const user =
    await getSignedInUser();


  if (!user) {

    if (
      bannerEditorUploadMessage
    ) {

      bannerEditorUploadMessage.textContent =
        "로그인이 필요합니다.";

    }

    return;

  }


  if (
    bannerEditorUploadMessage
  ) {

    bannerEditorUploadMessage.textContent =
      "업로드 중...";

  }


  /*
    이미 이 배너에 올려둔 이미지가 있으면 같은 경로에
    덮어쓰고, 처음 올리는 거면 새 uuid로 경로를 만든다.
  */

  const path =
    editingBannerImagePath ||
    crypto.randomUUID();


  const storagePath =
    `${user.id}/category-banners/${path}/image`;


  const {
    error
  } =
    await supabaseClient
      .storage
      .from(
        BANNER_CATEGORY_IMAGE_BUCKET
      )
      .upload(
        storagePath,
        file,
        {
          upsert:
            true,

          contentType:
            file.type,

          cacheControl:
            "60"
        }
      );


  if (error) {

    console.error(
      error
    );


    if (
      bannerEditorUploadMessage
    ) {

      bannerEditorUploadMessage.textContent =
        "업로드하지 못했습니다.";

    }

    return;

  }


  editingBannerImagePath =
    path;


  editingBannerImageUrl =
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${BANNER_CATEGORY_IMAGE_BUCKET}/${storagePath}`;


  if (
    bannerEditorUploadMessage
  ) {

    bannerEditorUploadMessage.textContent =
      "업로드 완료 ♡";

  }


  /*
    미리보기는 방금 올린 걸 바로 보여줘야 하니 캐시를
    피해서(?t=) 로드 — 실제로 저장되는 image_url에는
    이 쿼리를 안 붙인다(고정 URL이어야 하므로).
  */

  updateBannerEditorPreview(
    `${editingBannerImageUrl}?t=${Date.now()}`
  );


  event.target.value =
    "";

}



/* =========================================================
   저장 / 삭제
========================================================== */

async function saveBannerForm() {

  const name =
    bannerEditorName
      ?.value
      .trim() ||
    "";


  const url =
    bannerEditorUrl
      ?.value
      .trim() ||
    "";


  if (
    !url ||
    !editingBannerImageUrl
  ) {

    if (
      bannerEditorMessage
    ) {

      bannerEditorMessage.textContent =
        "url을 입력하고 배너 이미지를 올려주세요.";

    }

    return;

  }


  const user =
    await getSignedInUser();


  if (!user) {

    if (
      bannerEditorMessage
    ) {

      bannerEditorMessage.textContent =
        "로그인이 필요합니다.";

    }

    return;

  }


  if (
    bannerEditorSave
  ) {

    bannerEditorSave.disabled =
      true;

  }


  const error =
    editingBannerId
      ? (
          await supabaseClient
            .from(
              "banners"
            )
            .update({
              name,
              url,

              image_url:
                editingBannerImageUrl,

              image_path:
                editingBannerImagePath
            })
            .eq(
              "id",
              editingBannerId
            )
            .eq(
              "user_id",
              user.id
            )
        ).error
      : (
          await supabaseClient
            .from(
              "banners"
            )
            .insert({
              category_id:
                currentPostCategoryId,

              user_id:
                user.id,

              name,
              url,

              image_url:
                editingBannerImageUrl,

              image_path:
                editingBannerImagePath,

              sort_order:
                currentBanners.length
            })
        ).error;


  if (
    bannerEditorSave
  ) {

    bannerEditorSave.disabled =
      false;

  }


  if (error) {

    console.error(
      error
    );


    if (
      bannerEditorMessage
    ) {

      bannerEditorMessage.textContent =
        "저장하지 못했습니다.";

    }

    return;

  }


  closeBannerForm();


  await refreshBannerList();

}


/*
  저장/삭제 뒤 그리드만 다시 불러온다. renderBannerCategory와
  달리 edit 모드/소유자 여부는 건드리지 않는다(방금 그 모드로
  폼을 열었던 것이므로 그대로 유지되어야 자연스러움).
*/

async function refreshBannerList() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "banners"
      )
      .select(
        "id, name, url, image_url, image_path, sort_order"
      )
      .eq(
        "category_id",
        currentPostCategoryId
      )
      .order(
        "sort_order",
        {
          ascending:
            true
        }
      );


  if (error) {

    console.error(
      error
    );

    return;

  }


  currentBanners =
    data ||
    [];


  renderBannerGrid();

}


async function deleteBannerFromEditor() {

  if (
    !editingBannerId
  ) {
    return;
  }


  await deleteBanner(
    editingBannerId
  );


  closeBannerForm();

}


async function deleteBanner(
  id
) {

  if (
    !confirm(
      "이 배너를 삭제할까요?"
    )
  ) {
    return;
  }


  const user =
    await getSignedInUser();


  if (!user) {
    return;
  }


  const {
    error
  } =
    await supabaseClient
      .from(
        "banners"
      )
      .delete()
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        user.id
      );


  if (error) {

    console.error(
      error
    );

    return;

  }


  /*
    ★ Storage에 올려둔 파일도 같이 정리 — 안 지우면
    다시는 안 쓰는 이미지가 계속 쌓인다.
  */

  const deletedBanner =
    currentBanners.find(
      banner =>
        banner.id ===
        id
    );


  if (
    deletedBanner?.image_path
  ) {

    await supabaseClient
      .storage
      .from(
        BANNER_CATEGORY_IMAGE_BUCKET
      )
      .remove(
        [
          `${user.id}/category-banners/` +
          `${deletedBanner.image_path}/image`
        ]
      );

  }


  currentBanners =
    currentBanners.filter(
      banner =>
        banner.id !==
        id
    );


  renderBannerGrid();

}
