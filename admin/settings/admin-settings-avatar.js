/* =========================================================
   ADMIN - AVATAR (PROFILE PICTURE)

   admin-favicon.js와 완전히 같은 패턴: 업로드한 파일은 Supabase
   Storage의 항상 같은 경로(user-avatars/{user_id}/avatar, 확장자
   없음)에 upsert로 덮어써서 공개 URL이 절대 안 바뀌게 한다.
   업로드가 끝나면 그 고정 URL을 바로 avatarUrlInput에 채워 넣는다
   — 저장은 기존 save 버튼을 사용자가 직접 눌러야 site_settings에
   반영된다(upload 즉시 자동저장하지 않음).

   site_settings에는 key='avatar_url'로 (user_id,key) upsert 패턴을
   그대로 재사용(favicon_url/cursor_url과 동일).

   Supabase 쪽 "user-avatars" Storage 버킷 + RLS는
   [[20260906110000_create_user_avatars_bucket.sql]]에서 만든다.
========================================================== */

const AVATAR_BUCKET =
  "user-avatars";


const avatarPreview =
  document.getElementById(
    "avatarPreview"
  );

const avatarPreviewEmpty =
  document.getElementById(
    "avatarPreviewEmpty"
  );

const avatarFileInput =
  document.getElementById(
    "avatarFileInput"
  );

const avatarUploadMessage =
  document.getElementById(
    "avatarUploadMessage"
  );

const avatarUrlInput =
  document.getElementById(
    "avatarUrlInput"
  );

const avatarSaveButton =
  document.getElementById(
    "avatarSaveButton"
  );

const avatarSaveMessage =
  document.getElementById(
    "avatarSaveMessage"
  );



/* =========================================================
   경로 / URL 만들기
========================================================== */

function buildAvatarImageUrl(
  userId
) {

  return (
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${AVATAR_BUCKET}/${userId}/avatar`
  );

}



/* =========================================================
   미리보기

   favicon과 동일하게 "현재 값"을 그대로 미리보기 src로 써서
   onload/onerror로 있고 없음을 판단한다(고정 업로드 경로가
   아닌 외부 URL도 값으로 들어올 수 있음).
========================================================== */

function showAvatarPreview(
  url
) {

  if (!avatarPreview) {
    return;
  }


  if (!url) {

    avatarPreview.hidden =
      true;


    if (
      avatarPreviewEmpty
    ) {

      avatarPreviewEmpty.hidden =
        false;

    }


    return;

  }


  avatarPreview.onload =
    () => {

      avatarPreview.hidden =
        false;


      if (
        avatarPreviewEmpty
      ) {

        avatarPreviewEmpty.hidden =
          true;

      }

    };


  avatarPreview.onerror =
    () => {

      avatarPreview.hidden =
        true;


      if (
        avatarPreviewEmpty
      ) {

        avatarPreviewEmpty.hidden =
          false;

      }

    };


  avatarPreview.src =
    url;

}



/* =========================================================
   불러오기
========================================================== */

async function loadAvatar(
  user
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "site_settings"
      )
      .select(
        "value"
      )
      .eq(
        "key",
        "avatar_url"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load avatar error:",
      error
    );


    if (
      avatarSaveMessage
    ) {

      avatarSaveMessage.textContent =
        "프로필 사진 정보를 불러오지 못했습니다.";

    }

  }


  const avatarUrl =
    data?.value ||
    "";


  if (avatarUrlInput) {

    avatarUrlInput.value =
      avatarUrl;

  }


  showAvatarPreview(
    avatarUrl
  );

}



/* =========================================================
   이미지 업로드(같은 경로에 덮어쓰기 → URL칸 자동 채움)
========================================================== */

avatarFileInput
  ?.addEventListener(
    "change",
    async event => {

      const file =
        event.target.files?.[0];


      if (!file) {
        return;
      }


      const {
        data:
        userData,

        error:
        userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData.user
      ) {

        if (
          avatarUploadMessage
        ) {

          avatarUploadMessage.textContent =
            "로그인이 필요합니다.";

        }

        return;

      }


      const user =
        userData.user;


      if (
        avatarUploadMessage
      ) {

        avatarUploadMessage.textContent =
          "업로드 중...";

      }


      const path =
        `${user.id}/avatar`;


      const {
        error
      } =
        await supabaseClient
          .storage
          .from(
            AVATAR_BUCKET
          )
          .upload(
            path,
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
          avatarUploadMessage
        ) {

          avatarUploadMessage.textContent =
            "업로드하지 못했습니다.";

        }

        return;

      }


      const uploadedUrl =
        buildAvatarImageUrl(
          user.id
        );


      if (avatarUrlInput) {

        avatarUrlInput.value =
          uploadedUrl;

      }


      showAvatarPreview(
        `${uploadedUrl}?t=${Date.now()}`
      );


      if (
        avatarUploadMessage
      ) {

        avatarUploadMessage.textContent =
          "업로드 완료 — save를 눌러 저장하세요 ♡";

      }


      /*
        같은 파일을 다시 골라도 change 이벤트가 뜨게 비워둠.
      */

      event.target.value =
        "";

    }
  );



/* =========================================================
   URL 저장
========================================================== */

avatarSaveButton
  ?.addEventListener(
    "click",
    async () => {

      const {
        data:
        userData,

        error:
        userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (
        userError ||
        !userData.user
      ) {

        if (
          avatarSaveMessage
        ) {

          avatarSaveMessage.textContent =
            "로그인이 필요합니다.";

        }

        return;

      }


      const user =
        userData.user;


      const avatarUrl =
        avatarUrlInput
          ?.value
          .trim() ||
        "";


      avatarSaveButton.disabled =
        true;


      if (
        avatarSaveMessage
      ) {

        avatarSaveMessage.textContent =
          "저장 중...";

      }


      const {
        error
      } =
        await supabaseClient
          .from(
            "site_settings"
          )
          .upsert(
            {

              user_id:
                user.id,

              key:
                "avatar_url",

              value:
                avatarUrl

            },
            {

              onConflict:
                "user_id,key"

            }
          );


      avatarSaveButton.disabled =
        false;


      if (error) {

        console.error(
          error
        );


        if (
          avatarSaveMessage
        ) {

          avatarSaveMessage.textContent =
            "저장하지 못했습니다.";

        }

        return;

      }


      if (
        avatarSaveMessage
      ) {

        avatarSaveMessage.textContent =
          "saved ♡";

      }


      showAvatarPreview(
        avatarUrl
      );

    }
  );
