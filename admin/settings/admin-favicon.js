/* =========================================================
   ADMIN - FAVICON

   브라우저 탭 아이콘. 동작은 CURSOR와 완전히 같아서 공용
   구현(admin/settings/admin-image-setting.js)에 맡기고, 여기서는
   key/버킷/DOM id만 넘긴다.

     site_settings.key = 'favicon_url'
     Storage 버킷      = 'user-favicons'

   ★ 2026-09-11 변경 — "바꿔도 예전 파비콘이 그대로"의 원인
     예전에는 URL 입력 칸이 있었고 업로드는 항상 같은 경로
     (`{user_id}/favicon`)에 덮어썼다. 주소가 안 바뀌니 브라우저와
     CDN이 예전 이미지를 계속 보여줬다(파비콘은 특히 오래 물고
     있는다). 이제 **업로드할 때마다 새 경로**를 쓰고 저장이 끝난 뒤
     예전 파일을 지운다 — 주소가 달라지므로 탭 아이콘도 미리보기도
     즉시 바뀐다. URL 직접 입력 칸은 없앴다.

   공개 홈페이지 반영은 home/site-meta.js의 applyFaviconSetting().

   ⚠️ Supabase 쪽 "user-favicons" Storage 버킷(및 public read RLS
   정책)은 이 저장소 코드로 만들어지지 않는다 — user-banners와
   마찬가지로 Supabase 대시보드에서 미리 만들어둬야 한다.

   classic script. admin-image-setting.js 뒤에 로드된다.
========================================================== */

const faviconSettingPanel =
  createImageSettingPanel({

    key:
      "favicon_url",

    bucket:
      "user-favicons",

    label:
      "파비콘",

    ids: {
      preview: "faviconPreview",
      previewEmpty: "faviconPreviewEmpty",
      fileInput: "faviconFileInput",
      removeButton: "faviconRemoveButton",
      saveButton: "faviconSaveButton",
      saveMessage: "faviconSaveMessage",
      uploadMessage: "faviconUploadMessage"
    }

  });


/* admin-settings-save.js의 loadAdminSettings()가 부른다 */

async function loadFavicon(
  user
) {

  await faviconSettingPanel.load(
    user
  );

}
