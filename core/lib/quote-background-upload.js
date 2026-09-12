/* =========================================================
   IMORY - Quote 배경 이미지 업로드 (공용)

   Quote Preset의 CANVAS 배경 이미지와, 글쓰기 화면에서 이번
   발췌만 바꿔 끼우는 배경 이미지가 **같은 경로**를 쓴다.
   admin/index.html과 index.html 양쪽이 이 파일을 로드한다.

   의존(먼저 로드돼야 함): core/lib/supabase-client.js
   (supabaseClient · SUPABASE_URL), core/lib/image-upload.js
   (prepareImoryUploadImage).


   ★ 왜 새 버킷을 만들지 않는가

     기존 user-banners 버킷의 정책이 이미 정확히 필요한 모양이다
     (supabase/migrations/20260902100000_… 주석에 실측값이 있다).

       user_banners_owner_write | ALL    | authenticated       | own-folder
       user_banners_public_read | SELECT | anon, authenticated | bucket 전체

     own-folder 규칙은 (storage.foldername(name))[1] = auth.uid()
     이므로 **한 단계 더 깊은 경로에도 그대로 적용된다**
     (20260906110000_create_user_avatars_bucket.sql 주석에 같은
     근거가 적혀 있다). 그래서

       user-banners/{user_id}/quote-backgrounds/{uuid}.{ext}

     는 주인장만 쓰고 누구나 읽는다 — 발췌 이미지는 어차피
     공개물이고, 다른 세션/다른 기기에서 열어도 같은 주소가
     그대로 뜬다. **DB migration이 필요 없다.**


   ★ 왜 고정 경로에 덮어쓰지 않는가

     경로를 매번 새로 만든다(skin-images와 같은 규칙). 고정 경로에
     upsert하면 "업로드는 됐는데 프리셋 저장이 실패한" 순간을
     되돌릴 수 없고, 이미 저장된 다른 프리셋이 같은 주소를 보고
     있으면 그 그림까지 같이 바뀐다.


   ★ 프리셋에 저장되는 것은 이 공개 URL이다

     blob:/data: 같은 임시 주소는 저장하지 않는다 — 새로고침하면
     사라지고 다른 세션에서는 열 수도 없다.
========================================================== */

const IMORY_QUOTE_BACKGROUND_BUCKET =
  "user-banners";


const IMORY_QUOTE_BACKGROUND_PREFIX =
  "quote-backgrounds";


const IMORY_QUOTE_BACKGROUND_MAX_BYTES =
  8 * 1024 * 1024;


const IMORY_QUOTE_BACKGROUND_EXTENSION =
  {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp"
  };


function buildImoryQuoteBackgroundUrl(
  storagePath
) {

  return (
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${IMORY_QUOTE_BACKGROUND_BUCKET}/${storagePath}`
  );

}


/*
  -> { ok, url, message }

  던지지 않는다 — 호출부(관리 패널/글쓰기 화면)가 메시지를 그대로
  보여줄 수 있게 결과 객체로 돌려준다.
*/

async function uploadImoryQuoteBackground(
  file
) {

  if (!file) {

    return {
      ok: false,
      message: "이미지를 고르지 않았습니다."
    };

  }


  if (
    file.size >
    IMORY_QUOTE_BACKGROUND_MAX_BYTES
  ) {

    return {
      ok: false,
      message: "8MB 이하 이미지만 올릴 수 있습니다."
    };

  }


  const {
    data: userData,
    error: userError
  } =
    await supabaseClient
      .auth
      .getUser();


  if (
    userError ||
    !userData?.user
  ) {

    return {
      ok: false,
      message: "로그인이 필요합니다."
    };

  }


  /*
    올리기 전에 메타데이터를 지우고 용량을 줄인다(모든 업로드
    경로 공용 — core/lib/image-upload.js). 형식이 바뀔 수 있으므로
    (투명하지 않은 png → jpeg) **준비한 뒤에** 경로를 만든다.
  */

  const prepared =
    await prepareImoryUploadImage(
      file,
      {
        stripMetadata:
          typeof imoryEtcStripImageExifEnabled === "function"
            ? imoryEtcStripImageExifEnabled()
            : false
      }
    );


  if (prepared.error) {

    return {
      ok: false,
      message: "사진에서 촬영 정보(EXIF)를 지우지 못해 올리지 않았습니다."
    };

  }


  const upload =
    prepared.file ||
    file;


  const extension =
    IMORY_QUOTE_BACKGROUND_EXTENSION[upload.type];


  if (!extension) {

    return {
      ok: false,
      message: "png · jpg · webp만 올릴 수 있습니다."
    };

  }


  const unique =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;


  const storagePath =
    `${userData.user.id}/${IMORY_QUOTE_BACKGROUND_PREFIX}/${unique}.${extension}`;


  const {
    error: uploadError
  } =
    await supabaseClient
      .storage
      .from(
        IMORY_QUOTE_BACKGROUND_BUCKET
      )
      .upload(
        storagePath,
        upload,
        {
          /*
            경로를 매번 새로 만드므로 덮어쓸 일이 없어야 한다 —
            혹시 충돌하면 조용히 덮어쓰는 대신 실패해야 한다.
          */
          upsert: false,

          contentType:
            upload.type,

          cacheControl:
            "31536000"
        }
      );


  if (uploadError) {

    console.error(
      "[quote-background-upload] upload error:",
      uploadError
    );


    return {
      ok: false,
      message: "이미지를 올리지 못했습니다."
    };

  }


  return {
    ok: true,
    url:
      buildImoryQuoteBackgroundUrl(
        storagePath
      )
  };

}
