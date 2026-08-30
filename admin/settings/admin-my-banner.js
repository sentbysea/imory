/* =========================================================
   ADMIN - MY BANNER

   admin-settings-load.js 분할본과 함께 로드됨(DOM 참조는
   같은 방식으로 이 파일 안에서 직접 가져옴). loadMyBanner는
   admin-settings-save.js의 loadAdminSettings가 호출한다.

   목표: 배너 이미지를 나중에 바꿔도, 다른 사람이 자기
   사이트에 심어둔 <img src="..."> 코드를 다시 고칠 필요가
   없게 — 이미지 파일을 Supabase Storage의 항상 같은 경로
   (user-banners/{user_id}/banner, 확장자 없음)에 upsert로
   덮어써서 공개 URL 자체가 절대 안 바뀌게 한다.

   배너 클릭 시 이동할 URL은 site_settings 테이블에
   key='banner_url'로 저장(bgm_url과 같은 (user_id,key)
   upsert 패턴, Phase 0-5에서 site_content로부터 이관됨 —
   .claude/plans/inherited-brewing-raccoon.md 참고).
========================================================== */

const MY_BANNER_BUCKET =
  "user-banners";


const myBannerPreview =
  document.getElementById(
    "myBannerPreview"
  );

const myBannerPreviewEmpty =
  document.getElementById(
    "myBannerPreviewEmpty"
  );

const myBannerFileInput =
  document.getElementById(
    "myBannerFileInput"
  );

const myBannerUploadMessage =
  document.getElementById(
    "myBannerUploadMessage"
  );

const myBannerUrlInput =
  document.getElementById(
    "myBannerUrlInput"
  );

const myBannerImageUrlDisplay =
  document.getElementById(
    "myBannerImageUrlDisplay"
  );

const myBannerCopyImageUrlButton =
  document.getElementById(
    "myBannerCopyImageUrlButton"
  );

const myBannerSaveButton =
  document.getElementById(
    "myBannerSaveButton"
  );

const myBannerSaveMessage =
  document.getElementById(
    "myBannerSaveMessage"
  );


let myBannerUserId =
  null;



/* =========================================================
   경로 / URL 만들기
========================================================== */

function buildMyBannerImageUrl(
  userId
) {

  return (
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${MY_BANNER_BUCKET}/${userId}/banner`
  );

}



/* =========================================================
   미리보기

   해당 경로에 실제로 이미지가 있는지 확인할 별도 API를
   부르지 않고, <img>의 onload/onerror로 있고 없음을
   판단한다(없으면 아직 한 번도 업로드 안 한 것).
========================================================== */

function showMyBannerPreview(
  userId,
  bustCache
) {

  if (!myBannerPreview) {
    return;
  }


  const baseUrl =
    buildMyBannerImageUrl(
      userId
    );


  myBannerPreview.onload =
    () => {

      myBannerPreview.hidden =
        false;


      if (
        myBannerPreviewEmpty
      ) {

        myBannerPreviewEmpty.hidden =
          true;

      }

    };


  myBannerPreview.onerror =
    () => {

      myBannerPreview.hidden =
        true;


      if (
        myBannerPreviewEmpty
      ) {

        myBannerPreviewEmpty.hidden =
          false;

      }

    };


  myBannerPreview.src =
    bustCache
      ? `${baseUrl}?t=${Date.now()}`
      : baseUrl;

}



/* =========================================================
   불러오기
========================================================== */

async function loadMyBanner(
  user
) {

  myBannerUserId =
    user.id;


  const imageUrl =
    buildMyBannerImageUrl(
      user.id
    );


  if (
    myBannerImageUrlDisplay
  ) {

    myBannerImageUrlDisplay.value =
      imageUrl;

  }


  showMyBannerPreview(
    user.id,
    false
  );


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
        "banner_url"
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      "load my banner error:",
      error
    );


    if (
      myBannerSaveMessage
    ) {

      myBannerSaveMessage.textContent =
        "배너 정보를 불러오지 못했습니다.";

    }

  }


  if (myBannerUrlInput) {

    myBannerUrlInput.value =
      data?.value ||
      "";

  }

}



/* =========================================================
   이미지 업로드(같은 경로에 덮어쓰기)
========================================================== */

myBannerFileInput
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
          myBannerUploadMessage
        ) {

          myBannerUploadMessage.textContent =
            "로그인이 필요합니다.";

        }

        return;

      }


      const user =
        userData.user;


      if (
        myBannerUploadMessage
      ) {

        myBannerUploadMessage.textContent =
          "업로드 중...";

      }


      const path =
        `${user.id}/banner`;


      const {
        error
      } =
        await supabaseClient
          .storage
          .from(
            MY_BANNER_BUCKET
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
                ★ 너무 길게 캐시되면 이미지를 바꿔도
                방문자 브라우저/CDN에 오래 안 바뀐 채로
                남아있을 수 있어서 짧게(1분) 잡음.
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
          myBannerUploadMessage
        ) {

          myBannerUploadMessage.textContent =
            "업로드하지 못했습니다.";

        }

        return;

      }


      if (
        myBannerUploadMessage
      ) {

        myBannerUploadMessage.textContent =
          "업로드 완료 ♡";

      }


      showMyBannerPreview(
        user.id,
        true
      );


      /*
        같은 파일을 다시 골라도 change 이벤트가 뜨게
        비워둠.
      */

      event.target.value =
        "";

    }
  );



/* =========================================================
   URL 저장
========================================================== */

myBannerSaveButton
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
          myBannerSaveMessage
        ) {

          myBannerSaveMessage.textContent =
            "로그인이 필요합니다.";

        }

        return;

      }


      const user =
        userData.user;


      myBannerSaveButton.disabled =
        true;


      if (
        myBannerSaveMessage
      ) {

        myBannerSaveMessage.textContent =
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
                "banner_url",

              value:
                myBannerUrlInput
                  ?.value
                  .trim() ||
                ""

            },
            {

              onConflict:
                "user_id,key"

            }
          );


      myBannerSaveButton.disabled =
        false;


      if (error) {

        console.error(
          error
        );


        if (
          myBannerSaveMessage
        ) {

          myBannerSaveMessage.textContent =
            "저장하지 못했습니다.";

        }

        return;

      }


      if (
        myBannerSaveMessage
      ) {

        myBannerSaveMessage.textContent =
          "saved ♡";

      }

    }
  );



/* =========================================================
   복사 버튼
========================================================== */

async function copyMyBannerText(
  text,
  button,
  originalLabel
) {

  try {

    await navigator.clipboard.writeText(
      text ||
      ""
    );


    if (button) {

      button.textContent =
        "copied ♡";


      setTimeout(
        () => {

          button.textContent =
            originalLabel;

        },
        1500
      );

    }

  }

  catch (error) {

    console.error(
      error
    );

  }

}


myBannerCopyImageUrlButton
  ?.addEventListener(
    "click",
    () => {

      copyMyBannerText(
        myBannerImageUrlDisplay?.value,
        myBannerCopyImageUrlButton,
        "copy image url"
      );

    }
  );
