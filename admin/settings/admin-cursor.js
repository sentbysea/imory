/* =========================================================
   ADMIN - CURSOR

   마우스 포인터 이미지. FAVICON과 동작이 완전히 같아서 공용
   구현(admin/settings/admin-image-setting.js)에 맡긴다.

     site_settings.key = 'cursor_url'
     Storage 버킷      = 'user-cursors'

   ★ 2026-09-11 변경
     - URL 직접 입력 칸을 없앴다. 파비콘과 똑같이 **이미지를 바로
       고르면** 되고, 미리보기도 같은 자리에 뜬다.
     - 업로드는 매번 새 경로에 한다(예전에는 고정 경로 upsert라
       바꿔도 예전 커서가 남았다).
     - URL 칸이 없어졌으니 "remove" 버튼으로 비운다.

   공개 화면 반영은 home/site-meta.js의 applyCursorSetting() —
   `body { cursor: url("...") , auto; }` 한 줄을 넣는다. 그래서
   너무 큰 이미지는 브라우저가 커서로 받아주지 않는다(대략 128px
   이하를 권한다).

   ⚠️ "user-cursors" 버킷도 이 저장소 코드로 만들어지지 않는다 —
   Supabase 대시보드에서 미리 만들어둬야 한다.

   classic script. admin-image-setting.js 뒤에 로드된다. 예전에는
   이 동작이 admin-settings-load.js/admin-settings-save.js에
   흩어져 있었다(두 파일이 이미 1,000줄을 넘겨 함께 정리했다).
========================================================== */

const cursorSettingPanel =
  createImageSettingPanel({

    key:
      "cursor_url",

    bucket:
      "user-cursors",

    label:
      "마우스 포인터",

    ids: {
      preview: "cursorPreview",
      previewEmpty: "cursorPreviewEmpty",
      fileInput: "cursorFileInput",
      removeButton: "cursorRemoveButton",
      saveButton: "cursorSaveButton",
      saveMessage: "cursorSaveMessage",
      uploadMessage: "cursorUploadMessage"
    }

  });


/* admin-settings-save.js의 loadAdminSettings()가 부른다 */

async function loadCursorSetting(
  user
) {

  await cursorSettingPanel.load(
    user
  );

}
