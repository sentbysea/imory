/* =========================================================
   ADMIN - FAVICON

   MY BANNER와 같은 패턴(admin-my-banner.js 참고): 업로드한 파일은
   Supabase Storage의 항상 같은 경로(user-favicons/{user_id}/favicon,
   확장자 없음)에 upsert로 덮어써서 공개 URL이 절대 안 바뀌게 한다.
   다만 배너와 달리 favicon은 "이미지 URL" 하나만 의미를 가지므로
   (배너의 banner_url처럼 별도의 클릭 이동 URL 개념이 없음), 업로드가
   끝나면 그 고정 URL을 바로 faviconUrlInput에 채워 넣는다 — 저장은
   기존 save 버튼을 사용자가 직접 눌러야 site_settings에 반영된다
   (upload 즉시 자동저장하지 않음).

   site_settings에는 key='favicon_url'로 (user_id,key) upsert 패턴을
   그대로 재사용(bgm_url/cursor_url과 동일). 공개 홈페이지 반영은
   home/site-meta.js의 applyFaviconSetting() 참고.

   ⚠️ Supabase 쪽 "user-favicons" Storage 버킷(및 user-banners와
   동일한 public read RLS 정책)은 이 저장소 코드로 만들어지지
   않는다 — user-banners와 마찬가지로 Supabase 대시보드에서
   미리 만들어둬야 업로드가 실제로 동작한다.
========================================================== */

const FAVICON_BUCKET =
  "user-favicons";


const faviconPreview =
  document.getElementById(
    "faviconPreview"
  );

const faviconPreviewEmpty =
  document.getElementById(
    "faviconPreviewEmpty"
  );

const faviconFileInput =
  document.getElementById(
    "faviconFileInput"
  );

const faviconUploadMessage =
  document.getElementById(
    "faviconUploadMessage"
  );

const faviconUrlInput =
  document.getElementById(
    "faviconUrlInput"
  );

const faviconSaveButton =
  document.getElementById(
    "faviconSaveButton"
  );

const faviconSaveMessage =
  document.getElementById(
    "faviconSaveMessage"
  );



/* =========================================================
   경로 / URL 만들기
========================================================== */

function buildFaviconImageUrl(
  userId
) {

  return (
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${FAVICON_BUCKET}/${userId}/favicon`
  );

}



/* =========================================================
   미리보기

   my-banner와 달리 favicon_url은 항상 고정 업로드 경로를 가리키는
   게 아니라 외부 URL일 수도 있다(이 필드 하나가 곧 실제 이미지
   URL이므로) — 그래서 고정 경로 존재 여부가 아니라 "현재 값"을
   그대로 미리보기 src로 써서 onload/onerror로 있고 없음을 판단한다.
========================================================== */

function showFaviconPreview(
  url
) {

  if (!faviconPreview) {
    return;
  }


  if (!url) {

    faviconPreview.hidden =
      true;


    if (
      faviconPreviewEmpty
    ) {

      faviconPreviewEmpty.hidden =
        false;

    }


    return;

  }


  faviconPreview.onload =
    () => {

      faviconPreview.hidden =
        false;


      if (
        faviconPreviewEmpty
      ) {

        faviconPreviewEmpty.hidden =
          true;

      }

    };


  faviconPreview.onerror =
    () => {

      faviconPreview.hidden =
        true;


      if (
        faviconPreviewEmpty
      ) {

        faviconPreviewEmpty.hidden =
          false;

      }

    };


  faviconPreview.src =
    url;

}



/* =========================================================
   불러오기
========================================================== */

async function loadFavicon(
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
        "favicon_url"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load favicon error:",
      error
    );


    if (
      faviconSaveMessage
    ) {

      faviconSaveMessage.textContent =
        "파비콘 정보를 불러오지 못했습니다.";

    }

  }


  const faviconUrl =
    data?.value ||
    "";


  if (faviconUrlInput) {

    faviconUrlInput.value =
      faviconUrl;

  }


  showFaviconPreview(
    faviconUrl
  );

}



/* =========================================================
   이미지 업로드(같은 경로에 덮어쓰기 → URL칸 자동 채움)
========================================================== */

faviconFileInput
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
          faviconUploadMessage
        ) {

          faviconUploadMessage.textContent =
            "로그인이 필요합니다.";

        }

        return;

      }


      const user =
        userData.user;


      if (
        faviconUploadMessage
      ) {

        faviconUploadMessage.textContent =
          "업로드 중...";

      }


      const path =
        `${user.id}/favicon`;


      const {
        error
      } =
        await supabaseClient
          .storage
          .from(
            FAVICON_BUCKET
          )
          .upload(
            path,
            file,
            {
              upsert:
                true,

              contentType:
                file.type,

              /*
                my-banner와 동일하게 짧게(1분) 잡아, 파비콘을
                바꿔도 방문자 브라우저/CDN에 오래 안 바뀐 채로
                남아있지 않게 한다.
              */

              cacheControl:
                "60"
            }
          );


      if (error) {

        console.error(
          error
        );


        if (
          faviconUploadMessage
        ) {

          faviconUploadMessage.textContent =
            "업로드하지 못했습니다.";

        }

        return;

      }


      const uploadedUrl =
        buildFaviconImageUrl(
          user.id
        );


      if (faviconUrlInput) {

        faviconUrlInput.value =
          uploadedUrl;

      }


      showFaviconPreview(
        `${uploadedUrl}?t=${Date.now()}`
      );


      if (
        faviconUploadMessage
      ) {

        faviconUploadMessage.textContent =
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

faviconSaveButton
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
          faviconSaveMessage
        ) {

          faviconSaveMessage.textContent =
            "로그인이 필요합니다.";

        }

        return;

      }


      const user =
        userData.user;


      const faviconUrl =
        faviconUrlInput
          ?.value
          .trim() ||
        "";


      faviconSaveButton.disabled =
        true;


      if (
        faviconSaveMessage
      ) {

        faviconSaveMessage.textContent =
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
                "favicon_url",

              value:
                faviconUrl

            },
            {

              onConflict:
                "user_id,key"

            }
          );


      faviconSaveButton.disabled =
        false;


      if (error) {

        console.error(
          error
        );


        if (
          faviconSaveMessage
        ) {

          faviconSaveMessage.textContent =
            "저장하지 못했습니다.";

        }

        return;

      }


      if (
        faviconSaveMessage
      ) {

        faviconSaveMessage.textContent =
          "saved ♡";

      }


      showFaviconPreview(
        faviconUrl
      );

    }
  );
