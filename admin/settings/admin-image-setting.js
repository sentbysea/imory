/* =========================================================
   ADMIN SETTINGS — 이미지 하나짜리 설정 (FAVICON / CURSOR 공용)

   "이미지 한 장을 올려서 site_settings의 key 하나에 그 주소를
   저장한다"는 화면이 두 군데(FAVICON · CURSOR) 있어서 그 공통
   동작을 여기 한 곳에 둔다. 각 화면은 자기 DOM id와 key/버킷만
   넘긴다(admin-favicon.js · admin-cursor.js).

   ★ 왜 고쳤나 (2026-09-11)

   예전에는 두 화면 모두 (1) URL 직접 입력 칸이 있었고, (2) 업로드는
   **항상 같은 경로**(`{user_id}/favicon`)에 upsert로 덮어썼다.
   그래서 두 가지 문제가 있었다:

     - 주소가 안 바뀌니 브라우저·CDN이 **예전 이미지를 계속 보여준다.**
       파비콘을 바꿨는데 탭 아이콘도 미리보기도 그대로였던 원인이다.
     - 저장(site_settings 반영)이 실패해도 **파일은 이미 덮어써진**
       상태라 되돌릴 수 없다.

   그래서 이제:

     - URL 입력 칸을 없앴다. 이미지를 고르는 것 하나로 끝난다.
     - 업로드는 **매번 새 경로**(`{user_id}/{uuid}`)에 upsert:false로
       올린다. 주소가 달라지므로 캐시 문제가 원천적으로 사라진다.
     - 저장이 성공한 **뒤에야** 밀려난 예전 파일을 지운다.
       (posts/editor/posts-cover-image.js와 같은 순서 규칙)
     - URL 칸이 없어졌으니 "제거"도 버튼으로 만든다 — 저장을 눌러야
       실제로 반영된다.

   classic script. admin-settings-load.js보다 뒤, 각 화면 파일보다
   앞에 로드된다(admin/index.html).
========================================================== */

function buildImageSettingObjectPath(
  userId
) {

  const unique =
    (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;


  return `${userId}/${unique}`;

}


function buildImageSettingPublicUrl(
  bucket,
  path
) {

  return (
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${bucket}/${path}`
  );

}


/*
  저장된 주소가 우리 버킷의 파일이면 그 경로를, 아니면 null을
  돌려준다. 예전에 URL 칸에 직접 넣은 외부 주소는 우리가 지울
  대상이 아니다.
*/

function imageSettingObjectPathFromUrl(
  bucket,
  url
) {

  if (typeof url !== "string" || !url) {

    return null;

  }


  const prefix =
    `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;


  if (!url.startsWith(prefix)) {

    return null;

  }


  return url
    .slice(prefix.length)
    .split("?")[0];

}


/* =========================================================
   createImageSettingPanel({...}) -> { load }

   ids: preview / previewEmpty / fileInput / removeButton /
        saveButton / saveMessage / uploadMessage
========================================================== */

function createImageSettingPanel(
  config
) {

  const {
    key,
    bucket,
    label,
    ids
  } = config;


  const el =
    (id) =>
      id
        ? document.getElementById(id)
        : null;


  const preview =
    el(ids.preview);

  const previewEmpty =
    el(ids.previewEmpty);

  const fileInput =
    el(ids.fileInput);

  const removeButton =
    el(ids.removeButton);

  const saveButton =
    el(ids.saveButton);

  const saveMessage =
    el(ids.saveMessage);

  const uploadMessage =
    el(ids.uploadMessage);


  /*
    savedUrl        — site_settings에 이미 저장돼 있는 값
    pendingUrl/Path — 방금 올렸지만 아직 저장하지 않은 파일
    removeRequested — "remove"를 눌렀다(저장하면 실제로 비운다)
  */

  const state =
    {
      savedUrl: "",
      pendingUrl: "",
      pendingPath: "",
      removeRequested: false
    };


  function currentPreviewUrl() {

    if (state.pendingUrl) {

      return state.pendingUrl;

    }


    return state.removeRequested
      ? ""
      : state.savedUrl;

  }


  function setUploadMessage(
    text
  ) {

    if (uploadMessage) {

      uploadMessage.textContent =
        text || "";

    }

  }


  /*
    미리보기는 실제 로드 결과로 판단한다 — 주소가 있어도 파일이
    없으면(지워졌거나 외부 주소가 깨졌으면) 빈 자리를 보여준다.
  */

  function render() {

    const url =
      currentPreviewUrl();


    if (removeButton) {

      removeButton.hidden =
        !url;

    }


    if (!preview) {

      return;

    }


    if (!url) {

      preview.hidden =
        true;

      preview.removeAttribute(
        "src"
      );


      if (previewEmpty) {

        previewEmpty.hidden =
          false;

      }


      return;

    }


    preview.onload =
      () => {

        preview.hidden =
          false;


        if (previewEmpty) {

          previewEmpty.hidden =
            true;

        }

      };


    preview.onerror =
      () => {

        preview.hidden =
          true;


        if (previewEmpty) {

          previewEmpty.hidden =
            false;

        }

      };


    preview.src =
      url;

  }


  async function getUser() {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getUser();


    if (error || !data.user) {

      return null;

    }


    return data.user;

  }


  /* ---- 불러오기 ---- */

  async function load(
    user
  ) {

    state.savedUrl =
      "";

    state.pendingUrl =
      "";

    state.pendingPath =
      "";

    state.removeRequested =
      false;


    setUploadMessage(
      ""
    );


    if (saveMessage) {

      saveMessage.textContent =
        "";

    }


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
          key
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();


    if (error) {

      console.error(
        `load ${key} error:`,
        error
      );


      if (saveMessage) {

        saveMessage.textContent =
          `${label} 정보를 불러오지 못했습니다.`;

      }

    }


    state.savedUrl =
      data?.value || "";


    render();

  }


  /* ---- 고르기 = 새 경로에 올리기 ---- */

  fileInput
    ?.addEventListener(
      "change",
      async (event) => {

        const file =
          event.target.files?.[0];


        if (!file) {

          return;

        }


        /*
          같은 파일을 다시 골라도 change가 뜨게 즉시 비운다.
        */

        event.target.value =
          "";


        const user =
          await getUser();


        if (!user) {

          setUploadMessage(
            "로그인이 필요합니다."
          );


          return;

        }


        setUploadMessage(
          "업로드 중..."
        );


        /*
          블로그 설정이 "EXIF 제거"면 올리기 전에 다시 인코딩한다.
          실패하면 원본을 대신 올리지 않는다
          (core/lib/content-protection.js).
        */

        const stripped =
          await stripImageExifIfNeeded(
            file,
            typeof imoryEtcStripImageExifEnabled === "function" &&
              imoryEtcStripImageExifEnabled()
          );


        if (stripped.error) {

          setUploadMessage(
            "사진에서 촬영 정보(EXIF)를 지우지 못해 올리지 않았습니다."
          );


          return;

        }


        const upload =
          stripped.file;


        const path =
          buildImageSettingObjectPath(
            user.id
          );


        const {
          error
        } =
          await supabaseClient
            .storage
            .from(
              bucket
            )
            .upload(
              path,
              upload,
              {
                /*
                  경로가 매번 새로 생기므로 덮어쓸 일이 없어야 하고,
                  혹시 충돌하면 조용히 덮어쓰는 대신 실패해야 한다.
                */
                upsert:
                  false,

                contentType:
                  upload.type,

                /*
                  주소 자체가 매번 바뀌므로 오래 캐시해도 안전하다 —
                  예전 주소를 계속 보게 되는 문제가 원천적으로 없다.
                */
                cacheControl:
                  "31536000"
              }
            );


        if (error) {

          console.error(
            `${key} upload error:`,
            error
          );


          setUploadMessage(
            "업로드하지 못했습니다."
          );


          return;

        }


        /*
          방금 올린 것 말고 **이번 편집에서 올렸던** 파일이 있으면
          그건 이제 아무도 안 쓴다 — 저장 전이라 지워도 안전하다.
        */

        const discarded =
          state.pendingPath;


        state.pendingPath =
          path;

        state.pendingUrl =
          buildImageSettingPublicUrl(
            bucket,
            path
          );

        state.removeRequested =
          false;


        if (discarded) {

          await removeObject(
            discarded
          );

        }


        render();


        setUploadMessage(
          "업로드 완료 — save를 눌러 저장하세요 ♡"
        );

      }
    );


  /* ---- 제거 예약 ---- */

  removeButton
    ?.addEventListener(
      "click",
      async () => {

        if (state.pendingPath) {

          /* 방금 올린 것만 취소한다 — 저장된 값은 그대로 */

          const path =
            state.pendingPath;


          state.pendingPath =
            "";

          state.pendingUrl =
            "";


          await removeObject(
            path
          );


          setUploadMessage(
            ""
          );


          render();


          return;

        }


        state.removeRequested =
          Boolean(state.savedUrl);


        setUploadMessage(
          state.removeRequested
            ? "저장하면 제거됩니다."
            : ""
        );


        render();

      }
    );


  async function removeObject(
    path
  ) {

    if (!path) {

      return;

    }


    try {

      await supabaseClient
        .storage
        .from(
          bucket
        )
        .remove([
          path
        ]);

    }

    catch (err) {

      console.warn(
        `[${key}] 이전 파일 삭제 실패(고아 파일):`,
        err
      );

    }

  }


  /* ---- 저장 ---- */

  saveButton
    ?.addEventListener(
      "click",
      async () => {

        const user =
          await getUser();


        if (!user) {

          if (saveMessage) {

            saveMessage.textContent =
              "로그인이 필요합니다.";

          }


          return;

        }


        const nextUrl =
          state.removeRequested
            ? ""
            : (state.pendingUrl || state.savedUrl);


        saveButton.disabled =
          true;


        if (saveMessage) {

          saveMessage.textContent =
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
                  key,

                value:
                  nextUrl

              },
              {

                onConflict:
                  "user_id,key"

              }
            );


        saveButton.disabled =
          false;


        if (error) {

          console.error(
            `${key} save error:`,
            error
          );


          if (saveMessage) {

            saveMessage.textContent =
              "저장에 실패했습니다.";

          }


          /*
            방금 올린 파일은 그대로 둔다 — 다시 save를 누르면 그 파일이
            그대로 쓰인다(여기서 지우면 재시도가 불가능해진다).
          */

          return;

        }


        /*
          저장이 끝난 **뒤에야** 밀려난 예전 파일을 지운다.
          외부 URL이었다면 지울 것이 없다.
        */

        const previousPath =
          imageSettingObjectPathFromUrl(
            bucket,
            state.savedUrl
          );


        state.savedUrl =
          nextUrl;

        state.pendingUrl =
          "";

        state.pendingPath =
          "";

        state.removeRequested =
          false;


        if (
          previousPath &&
          previousPath !==
            imageSettingObjectPathFromUrl(bucket, nextUrl)
        ) {

          await removeObject(
            previousPath
          );

        }


        setUploadMessage(
          ""
        );


        if (saveMessage) {

          saveMessage.textContent =
            "saved ♡";

        }


        render();

      }
    );


  return {
    load,
    state
  };

}
