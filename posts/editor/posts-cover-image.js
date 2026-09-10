/* =========================================================
   POSTS — COVER IMAGE (GALLERY-1)

   글의 대표 이미지(post_covers) 하나를 다루는 전부. 작성/수정
   폼의 COVER 칸에서 선택·교체·제거하고, 실제 업로드/등록/정리는
   저장 버튼이 부른다(posts/editor/posts-save.js).

   기준 문서: IMORY_GALLERY1_DESIGN.md §3
   DB: supabase/migrations/20260910100000_gallery_category_and_post_covers.sql
       supabase/migrations/20260911100000_post_covers_private_access.sql

   ★ 파일에는 공개 주소가 없다 (GALLERY-1 후속)
     'post-covers'는 비공개 버킷이라 /object/public/... 주소 자체가
     존재하지 않는다. 이 폼의 미리보기도, 갤러리 카드도 전부 글 id를
     가리키는 우리 도메인 경로(/api/post-cover?post=<id>)를 쓰고,
     그 요청마다 서버가 글의 현재 공개 상태와 요청자를 확인한다
     (core/lib/post-cover-url.js · functions/api/post-cover.js).
     그래서 "공개일 때 본 주소로 나중에 다시 받는" 경로가 없다.

   ★ 이 파일이 지키는 순서(요구사항 2절)

     1) 파일을 고르는 순간에는 **아무것도 올리지 않는다.** 화면의
        미리보기는 objectURL이고, 파일은 메모리에만 있다.
        → 새 글 작성을 취소하면 Storage에 임시 파일이 남지 않는다.
          교체하다 그만둬도 예전 사진은 손대지 않은 채다.

     2) 저장을 누르면 **새 경로에 먼저 올린다**
        ({user_id}/{uuid}.{ext}, upsert:false — 기존 파일을 덮어쓰는
        경로가 아예 없다).

     3) 글이 저장된 **뒤에야** post_covers를 갱신하고, 그 RPC가
        돌려준 이전 storage_path를 그때 지운다.

     4) 어느 단계든 실패하면 되돌린다 — 글 저장이 실패하면 방금 올린
        파일을 지우고(rollback), 기존 대표 이미지는 건드리지 않는다.

   ★ 스킨 장식용 Images(skin-images 버킷)와의 구분
     소유·수명이 다르다. Images 슬롯은 **스킨 버전**에 매달려 있고
     Publish 시점의 연결이 그대로 굳는다(skin_version_image_slots).
     대표 이미지는 **글**에 매달려 있고 글이 지워지면 함께 지워진다.
     그래서 버킷도 테이블도 분리한다 — 같은 라이브러리에 섞으면
     "글을 지웠는데 스킨이 참조하던 이미지가 사라졌다"가 생긴다.

   classic script. 최상위 선언이 다른 posts/* 파일과 같은 전역
   렉시컬 환경을 공유하므로 posts-save.js/posts-view-editor-load.js가
   그대로 호출한다. DOM 참조도 이 파일이 직접 잡는다 — COVER 칸은
   이 기능 밖에서 쓰이지 않으므로 posts-refs.js를 키우지 않는다.
   posts.html이 DOM에 들어간 뒤에 로드된다(index.html의 로드 순서).
========================================================== */

const POST_COVER_BUCKET =
  "post-covers";


/* DB의 CHECK 제약과 같은 값이어야 한다 — 여기 검사는 사용자에게
   빨리 알려주기 위한 것이고, 신뢰 경계는 DB다. */

const POST_COVER_ALLOWED_MIME =
  [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
  ];

const POST_COVER_MAX_BYTES =
  5 * 1024 * 1024;

const POST_COVER_EXTENSION_BY_MIME =
  {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };


const postEditorCoverPreviewImage =
  document.getElementById(
    "postEditorCoverPreviewImage"
  );

const postEditorCoverEmpty =
  document.getElementById(
    "postEditorCoverEmpty"
  );

const postEditorCoverFile =
  document.getElementById(
    "postEditorCoverFile"
  );

const postEditorCoverSelect =
  document.getElementById(
    "postEditorCoverSelect"
  );

const postEditorCoverRemove =
  document.getElementById(
    "postEditorCoverRemove"
  );

const postEditorCoverMessage =
  document.getElementById(
    "postEditorCoverMessage"
  );


/* =========================================================
   상태

   savedUrl        — DB에 이미 저장돼 있는 대표 이미지(수정 폼 진입 시)
   pendingFile     — 저장 때 올릴 파일(아직 올리지 않았다)
   pendingObjectUrl— 그 파일의 미리보기 URL(반드시 revoke한다)
   removeRequested — "제거"를 눌렀다(저장하면 실제로 지운다)
========================================================== */

let postCoverState =
  {
    savedUrl: null,
    pendingFile: null,
    pendingObjectUrl: null,
    removeRequested: false
  };


function releasePostCoverObjectUrl() {

  if (postCoverState.pendingObjectUrl) {

    try {

      URL.revokeObjectURL(
        postCoverState.pendingObjectUrl
      );

    }

    catch (err) {

      /* 이미 해제됐거나 지원하지 않는 환경 — 무시해도 안전하다 */

    }


    postCoverState.pendingObjectUrl =
      null;

  }

}


function showPostCoverMessage(
  text
) {

  if (postEditorCoverMessage) {

    postEditorCoverMessage.textContent =
      text || "";

  }

}


/*
  화면을 상태에 맞춘다. "지금 보여줄 이미지"는 세 가지 중 하나다:
  방금 고른 파일(미리보기) > 제거 요청이면 없음 > 저장돼 있던 이미지.
*/

function renderPostCoverField() {

  const previewUrl =
    postCoverState.pendingObjectUrl
      ? postCoverState.pendingObjectUrl
      : (
          postCoverState.removeRequested
            ? null
            : postCoverState.savedUrl
        );


  if (postEditorCoverPreviewImage) {

    if (previewUrl) {

      postEditorCoverPreviewImage.src =
        previewUrl;

      postEditorCoverPreviewImage.hidden =
        false;

    }

    else {

      postEditorCoverPreviewImage.removeAttribute(
        "src"
      );

      postEditorCoverPreviewImage.hidden =
        true;

    }

  }


  if (postEditorCoverEmpty) {

    postEditorCoverEmpty.hidden =
      Boolean(previewUrl);

  }


  if (postEditorCoverSelect) {

    postEditorCoverSelect.textContent =
      previewUrl
        ? "사진 교체"
        : "사진 선택";

  }


  if (postEditorCoverRemove) {

    postEditorCoverRemove.hidden =
      !previewUrl;

  }

}


/* =========================================================
   폼 진입 — 새 글 / 수정
========================================================== */

function resetPostCoverImage() {

  releasePostCoverObjectUrl();


  postCoverState =
    {
      savedUrl: null,
      pendingFile: null,
      pendingObjectUrl: null,
      removeRequested: false
    };


  if (postEditorCoverFile) {

    postEditorCoverFile.value =
      "";

  }


  showPostCoverMessage(
    ""
  );


  renderPostCoverField();

}


/*
  수정 폼: 이 글에 이미 저장된 대표 이미지를 읽는다. 실패해도
  폼은 그대로 열린다 — 대표 이미지는 글 저장의 전제 조건이 아니다.
  (migration 적용 전 배포에서는 테이블이 없어 항상 여기로 온다.)
*/

async function loadPostCoverImage(
  postId
) {

  resetPostCoverImage();


  if (
    postId === null ||
    postId === undefined
  ) {

    return;

  }


  /*
    받는 것은 "이 글에 대표 이미지가 있다"는 사실뿐이다 — 파일
    주소는 어디에도 오지 않는다(위 상단 주석).
  */

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "post_covers"
      )
      .select(
        "post_id"
      )
      .eq(
        "post_id",
        postId
      )
      .maybeSingle();


  if (error) {

    console.warn(
      "[posts-cover-image] 대표 이미지 조회 실패:",
      error
    );


    return;

  }


  /*
    비공개/비밀 글의 사진은 소유자 본인임이 요청에 실려야 보인다 —
    쿠키가 서기 전에 <img>를 만들면 그 한 장이 404가 된다.
  */

  try {

    await imoryPostCoverCookieReady;

  }

  catch (err) {

    /* 못 세워도 공개 글의 사진은 그대로 보인다 */

  }


  postCoverState.savedUrl =
    data
      ? buildPostCoverUrl(postId)
      : null;


  renderPostCoverField();

}


/* =========================================================
   선택 / 제거
========================================================== */

function validatePostCoverFile(
  file
) {

  if (!file) {

    return {
      ok: false,
      message: "파일을 선택해주세요."
    };

  }


  if (
    !POST_COVER_ALLOWED_MIME.includes(
      file.type
    )
  ) {

    return {
      ok: false,
      message: "PNG · JPG · WEBP · GIF만 올릴 수 있습니다."
    };

  }


  if (
    file.size > POST_COVER_MAX_BYTES
  ) {

    return {
      ok: false,
      message: "5MB 이하 파일만 올릴 수 있습니다."
    };

  }


  return {
    ok: true
  };

}


postEditorCoverSelect
  ?.addEventListener(
    "click",
    () => {

      postEditorCoverFile?.click();

    }
  );


postEditorCoverFile
  ?.addEventListener(
    "change",
    () => {

      const file =
        postEditorCoverFile.files &&
        postEditorCoverFile.files[0];


      if (!file) {

        return;

      }


      const validation =
        validatePostCoverFile(
          file
        );


      if (!validation.ok) {

        showPostCoverMessage(
          validation.message
        );


        postEditorCoverFile.value =
          "";


        return;

      }


      releasePostCoverObjectUrl();


      postCoverState.pendingFile =
        file;

      postCoverState.pendingObjectUrl =
        URL.createObjectURL(
          file
        );

      /*
        새 사진을 골랐으면 "제거" 요청은 취소된다 — 마지막에 고른
        것이 곧 저장될 값이다.
      */

      postCoverState.removeRequested =
        false;


      showPostCoverMessage(
        "저장하면 반영됩니다."
      );


      renderPostCoverField();

    }
  );


postEditorCoverRemove
  ?.addEventListener(
    "click",
    () => {

      releasePostCoverObjectUrl();


      postCoverState.pendingFile =
        null;


      if (postEditorCoverFile) {

        postEditorCoverFile.value =
          "";

      }


      /*
        저장돼 있던 이미지가 있을 때만 "제거 예약"이 의미가 있다.
        방금 고른 파일만 취소한 경우엔 아무 일도 일어나지 않는다.
      */

      postCoverState.removeRequested =
        Boolean(postCoverState.savedUrl);


      showPostCoverMessage(
        postCoverState.removeRequested
          ? "저장하면 제거됩니다."
          : ""
      );


      renderPostCoverField();

    }
  );


/* =========================================================
   저장 경로 — 3단계

   posts-save.js가 이 순서로 부른다:

     const prepared = await preparePostCoverUpload();     // 새 경로 업로드
     ... 글 저장 ...
     실패하면  await rollbackPostCoverUpload(prepared);
     성공하면  await finishPostCoverSave(postId, prepared); // 등록 + 옛 파일 정리
========================================================== */

function buildPostCoverStoragePath(
  userId,
  mimeType
) {

  const extension =
    POST_COVER_EXTENSION_BY_MIME[mimeType] ||
    "bin";


  const unique =
    (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;


  return `${userId}/${unique}.${extension}`;

}


/*
  -> { uploaded: {...} | null, error: Error | null }

  uploaded가 null이고 error도 null이면 "이번 저장에 올릴 파일이
  없다"는 정상 상태다(사진을 안 골랐거나 제거만 요청했거나).
*/

async function preparePostCoverUpload() {

  if (!postCoverState.pendingFile) {

    return {
      uploaded: null,
      error: null
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
      uploaded: null,
      error: new Error("로그인이 필요합니다.")
    };

  }


  /*
    블로그 설정(Settings > HOME > ETC)이 "EXIF 제거"면 **올리기
    전에** 다시 인코딩한다 — 좌표·기기·촬영 시각이 서버로 아예 가지
    않게 하는 것이 이 설정의 목적이라, 실패하면 원본을 대신 올리지
    않고 저장을 멈춘다(core/lib/content-protection.js).
  */

  const siteOptions =
    await loadImorySiteContentOptions();


  const stripped =
    await stripImageExifIfNeeded(
      postCoverState.pendingFile,
      siteOptions.stripImageExif
    );


  if (stripped.error) {

    return {
      uploaded: null,
      error: new Error(
        "사진에서 촬영 정보(EXIF)를 지우지 못해 올리지 않았습니다."
      )
    };

  }


  const file =
    stripped.file;


  const storagePath =
    buildPostCoverStoragePath(
      userData.user.id,
      file.type
    );


  const {
    error: uploadError
  } =
    await supabaseClient
      .storage
      .from(
        POST_COVER_BUCKET
      )
      .upload(
        storagePath,
        file,
        {
          /*
            upsert:false — 경로는 매번 새로 만드니 덮어쓸 일이 없어야
            하고, 혹시 충돌하면 조용히 덮어쓰는 대신 실패해야 한다.
          */
          upsert: false,
          contentType: file.type,
          cacheControl: "31536000"
        }
      );


  if (uploadError) {

    return {
      uploaded: null,
      error: uploadError
    };

  }


  return {

    uploaded: {
      storagePath,
      mimeType:
        file.type,
      byteSize:
        file.size
    },

    error: null

  };

}


/*
  글 저장이 실패했다 — 방금 올린 파일은 아무도 참조하지 않으므로
  지운다. 이 삭제까지 실패하면 고아 파일이 남지만 어떤 화면에도
  나타나지 않는다(skin_images와 같은 정책, 자동 정리 작업 없음).
  기존 대표 이미지는 이 경로에서 절대 건드리지 않는다.
*/

async function rollbackPostCoverUpload(
  prepared
) {

  if (!prepared || !prepared.uploaded) {

    return;

  }


  try {

    await supabaseClient
      .storage
      .from(
        POST_COVER_BUCKET
      )
      .remove([
        prepared.uploaded.storagePath
      ]);

  }

  catch (err) {

    console.warn(
      "[posts-cover-image] 롤백 삭제 실패(고아 파일):",
      err
    );

  }

}


/*
  글이 저장된 뒤에만 부른다. post_covers를 갱신하고, RPC가 돌려준
  이전 storage_path를 그때 지운다 — 이 순서 덕분에 "등록은 실패했는데
  예전 사진은 이미 사라진" 상태가 생기지 않는다.

  -> error | null (글 자체는 이미 저장됐으므로 호출자는 경고만 한다)
*/

async function finishPostCoverSave(
  postId,
  prepared
) {

  const uploaded =
    prepared && prepared.uploaded
      ? prepared.uploaded
      : null;


  if (
    !uploaded &&
    !postCoverState.removeRequested
  ) {

    return null;

  }


  let previousPath =
    null;


  if (uploaded) {

    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "upsert_own_post_cover",
          {
            p_post_id:
              postId,

            p_storage_path:
              uploaded.storagePath,

            p_mime_type:
              uploaded.mimeType,

            p_byte_size:
              uploaded.byteSize
          }
        );


    if (error) {

      /* 등록에 실패했으니 방금 올린 파일은 고아다 — 되돌린다.
         기존 대표 이미지는 그대로 남는다. */

      await rollbackPostCoverUpload(
        prepared
      );


      return error;

    }


    previousPath =
      data || null;

  }

  else {

    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "delete_own_post_cover",
          {
            p_post_id:
              postId
          }
        );


    if (error) {

      return error;

    }


    previousPath =
      data || null;

  }


  if (previousPath) {

    try {

      await supabaseClient
        .storage
        .from(
          POST_COVER_BUCKET
        )
        .remove([
          previousPath
        ]);

    }

    catch (err) {

      console.warn(
        "[posts-cover-image] 이전 대표 이미지 삭제 실패(고아 파일):",
        err
      );

    }

  }


  /*
    화면 상태를 방금 저장된 값으로 맞춘다 — 저장 후 폼이 그대로
    남아 있는 경로(수정 폼에서 저장 실패 후 재시도 등)에서 옛
    미리보기가 남지 않게 한다.
  */

  releasePostCoverObjectUrl();


  /*
    주소는 글 id로만 만들어진다 — 방금 바꾼 사진이 같은 주소를
    쓰므로, 이 폼이 그대로 남아 있는 경로에서 옛 그림이 보이지
    않도록 이때만 cache bust를 붙인다(평소에는 서버의 no-cache +
    ETag로 충분하다).
  */

  postCoverState.savedUrl =
    uploaded
      ? buildPostCoverUrl(
          postId,
          {
            bust: Date.now()
          }
        )
      : null;

  postCoverState.pendingFile =
    null;

  postCoverState.removeRequested =
    false;


  if (postEditorCoverFile) {

    postEditorCoverFile.value =
      "";

  }


  renderPostCoverField();


  return null;

}

/* =========================================================
   Storage 정리용 경로 조회 (GALLERY-1 후속)

   ★ 접근 차단과 파일 정리는 이제 별개다

   예전에는 "글이 public을 벗어나면 파일을 새 경로로 옮긴다"(경로
   회전)로 옛 주소를 죽였다. 그 방식은 정리의 마지막 단계가 실패하면
   옛 주소가 그대로 살아 있는, 즉 **정리 실패 = 접근 허용**인 구조라
   철회했다(supabase/migrations/20260911100000_post_covers_private_access.sql).

   지금은 버킷이 비공개고 바이트가 /api/post-cover로만 나가며, 그
   요청마다 DB가 글의 현재 공개 상태와 요청자를 확인한다. 그래서
   공개 범위가 바뀌면 파일을 하나도 건드리지 않아도 그 순간 접근이
   끊긴다 — 아래 정리는 **용량** 문제일 뿐이다.

   남은 정리는 하나: 글을 지우면 post_covers 행은 cascade로 사라지고
   접근도 그 즉시 끊기지만(참조하는 행이 없으니 판정에 걸리지 않는다)
   Storage 객체는 남는다. 삭제 화면들이 아래 두 함수를 순서대로 쓴다:

     const paths = await takePostCoverStoragePaths(ids);  // 지우기 전에
     ... posts 삭제 ...
     await removePostCoverStorageObjects(paths);          // 성공한 뒤에
========================================================== */

async function fetchOwnPostCoverPaths(
  postIds
) {

  const ids =
    Array.from(postIds || []).map(Number).filter(Number.isFinite);


  if (!ids.length) {

    return [];

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .rpc(
        "get_own_post_cover_paths",
        {
          p_post_ids:
            ids
        }
      );


  if (error) {

    /* migration 이전 배포에는 이 함수가 없다 — 정리를 건너뛸 뿐
       나머지 동작은 그대로다. */

    console.warn(
      "[posts-cover-image] 대표 이미지 경로 조회 실패:",
      error
    );


    return [];

  }


  /* setof text는 문자열 배열로 오지만, PostgREST 설정에 따라
     [{ get_own_post_cover_paths: "..." }] 형태일 수도 있다. */

  return (data || [])
    .map(
      (row) =>
        typeof row === "string"
          ? row
          : (row && row.get_own_post_cover_paths) || null
    )
    .filter(Boolean);

}


async function removePostCoverStorageObjects(
  paths
) {

  const targets =
    (paths || []).filter(Boolean);


  if (!targets.length) {

    return;

  }


  try {

    await supabaseClient
      .storage
      .from(
        POST_COVER_BUCKET
      )
      .remove(
        targets
      );

  }

  catch (err) {

    console.warn(
      "[posts-cover-image] 대표 이미지 파일 삭제 실패(고아 파일):",
      err
    );

  }

}




/*
  조회를 먼저 하는 이유: 글이 지워지고 나면 cascade로 행이 사라져
  경로를 알 방법이 없어진다. 삭제가 실패하면 아무것도 지우지 않는다.
*/

async function takePostCoverStoragePaths(
  postIds
) {

  return fetchOwnPostCoverPaths(postIds);

}


/*
  작성/수정을 취소하고 폼을 떠난다 — 올린 것이 없으므로 Storage에서
  지울 것도 없다(이 파일 상단의 1번 규칙). 미리보기 URL만 해제한다.
*/

function discardPostCoverImage() {

  resetPostCoverImage();

}


/*
  "저장하지 않은 입력"에 대표 이미지 변경도 포함시킨다 — 사진만
  바꾸고 나가려 할 때도 확인 창이 뜨게 한다
  (posts/view/posts-view-editor-load.js의 postEditorHasUnsavedChanges).
*/

function postCoverHasPendingChange() {

  return (
    Boolean(postCoverState.pendingFile) ||
    postCoverState.removeRequested === true
  );

}
