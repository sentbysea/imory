/* =========================================================
   ADMIN - AVATAR (PROFILE PICTURE) — 업로드 전용

   이 화면에는 "지금 사진 / 바꾸기 / 지우기"만 있다. 예전에는
   AVATAR URL 입력칸과 별도 save 버튼이 있어서 업로드 → save를
   두 번 눌러야 실제로 저장됐고(중간에 나가면 사진이 사라진
   것처럼 보였다), 사용자가 URL 문자열을 직접 다뤄야 했다.
   지금은 업로드가 성공한 그 자리에서 site_settings까지 저장한다.

   저장 위치:
     Storage  user-avatars/{user_id}/avatars/{uuid}   (업로드마다 새 경로)
     설정값   site_settings (user_id, key='avatar_url')

   ── 왜 업로드마다 새 경로인가 ────────────────────────────
   처음에는 favicon/cursor와 같이 고정 경로(user-avatars/{user_id}/
   avatar)에 upsert로 덮어썼다. 그러면 "업로드는 됐는데 설정 저장이
   실패"한 순간 **되돌릴 수 없다** — 기존 파일은 이미 새 이미지로
   덮여 있고, site_settings에 남아 있는 예전 URL이 가리키는 것도
   바로 그 경로라, 캐시가 한 번 갱신되면 저장에 실패한 사진이
   공개 화면에 뜬다. 고정 경로 + 덮어쓰기로는 원자성을 만들 수
   없다.

   그래서 업로드는 항상 **아무도 안 쓰는 새 경로**에 하고, 순서를
   이렇게 잡는다:

     1. 새 경로에 업로드            (실패 → DB 손 안 댐, 끝)
     2. site_settings를 새 URL로 갱신
        - 실패 → 방금 올린 새 객체를 지우고 예전 값/사진 그대로 둔다
     3. 저장 성공 후에만 이전 객체를 정리한다

   즉 어느 단계에서 끊겨도 "site_settings가 가리키는 파일"은 항상
   존재한다. 경로가 매번 달라지므로 URL도 매번 달라져서 캐시
   무효화를 위한 ?v= 같은 장치도 필요 없다(고정 경로 시절의 문제).

   ── 이전 객체를 지워도 되는가 (경로 해석) ────────────────
   parseOwnAvatarStoragePath()가 저장된 URL이 **이 버킷의 내 폴더
   안**을 가리킬 때만 경로를 돌려준다. 외부 URL·해석 불가·남의
   폴더면 null이고, 그때는 아무것도 지우지 않는다. 고정 경로
   시절의 {user_id}/avatar도 그대로 해석되므로, 기존 사용자는
   다음 업로드/삭제 때 옛 파일이 자연히 정리된다.

   ── 빠른 연속 선택 ───────────────────────────────────────
   요청을 avatarOperationChain(Promise 체인)에 이어 붙여 한 번에
   하나씩만 돌리고, 각 요청은 자기 순번(avatarRequestSeq)이 아직
   최신인지 확인한다. 늦게 끝난 예전 요청은 site_settings를 건드리지
   않고 자기가 올린 객체만 지우고 물러난다 — 마지막으로 고른
   사진만 남는다.

   ── 지우기 ───────────────────────────────────────────────
   저장값(사용자가 보는 것)을 먼저 비우고 Storage 파일을 정리한다
   — 반대로 하면 파일만 사라진 URL이 남아 깨진 이미지가 된다.

   Supabase 쪽 "user-avatars" Storage 버킷 + RLS는
   [[20260906110000_create_user_avatars_bucket.sql]]에서 만든다.
   own-folder 정책((storage.foldername(name))[1] = auth.uid())은
   한 단계 더 깊은 {user_id}/avatars/{uuid}에도 그대로 적용된다.
========================================================== */

const AVATAR_BUCKET =
  "user-avatars";

/* 업로드마다 새로 만드는 경로의 가운데 마디 — 고정 경로 시절의
   파일({user_id}/avatar)과 섞이지 않게 한 칸 아래에 둔다. */
const AVATAR_UPLOAD_FOLDER =
  "avatars";

const AVATAR_PUBLIC_URL_PREFIX =
  `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/`;


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

const avatarRemoveButton =
  document.getElementById(
    "avatarRemoveButton"
  );

const avatarUploadMessage =
  document.getElementById(
    "avatarUploadMessage"
  );


/*
  지금 site_settings에 저장되어 있는 값. remove가 "지울 것이
  있는가"를 판단하고, 저장 실패 시 화면을 되돌리는 기준이다.
*/
let currentAvatarUrl =
  "";


/*
  요청 순번 / 직렬화. 자세한 이유는 파일 상단 "빠른 연속 선택".
*/
let avatarRequestSeq =
  0;

let avatarOperationChain =
  Promise.resolve();



/* =========================================================
   경로 / URL 만들기
========================================================== */

function createAvatarObjectName() {

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {

    return crypto.randomUUID();

  }


  /* 아주 오래된 브라우저용 폴백 — 경로가 겹치지만 않으면 된다. */

  return (
    `${Date.now().toString(36)}-` +
    `${Math.random().toString(36).slice(2, 10)}`
  );

}


function buildAvatarStoragePath(
  userId
) {

  return (
    `${userId}/${AVATAR_UPLOAD_FOLDER}/` +
    createAvatarObjectName()
  );

}


function buildAvatarPublicUrl(
  storagePath
) {

  return `${AVATAR_PUBLIC_URL_PREFIX}${storagePath}`;

}


/*
  저장된 URL → 이 버킷 안 내 객체 경로. 지워도 되는 대상인지를
  여기 한 곳에서만 판단한다(파일 상단 "이전 객체를 지워도 되는가").

  돌려주는 경우:
    {user_id}/avatars/{uuid}   지금 방식
    {user_id}/avatar           고정 경로 시절 값

  null인 경우:
    외부 URL, 다른 버킷, 남의 폴더, 빈 값, 파싱 실패
*/

function parseOwnAvatarStoragePath(
  rawUrl,
  userId
) {

  if (
    typeof rawUrl !== "string" ||
    !rawUrl.trim() ||
    !userId
  ) {

    return null;

  }


  let withoutQuery;

  try {

    const parsed =
      new URL(rawUrl.trim());

    withoutQuery =
      `${parsed.origin}${parsed.pathname}`;

  } catch (err) {

    return null;

  }


  if (
    !withoutQuery.startsWith(
      AVATAR_PUBLIC_URL_PREFIX
    )
  ) {

    return null;

  }


  const storagePath =
    decodeURIComponent(
      withoutQuery.slice(
        AVATAR_PUBLIC_URL_PREFIX.length
      )
    );


  /*
    내 폴더 안인지 확인한다 — RLS가 어차피 막지만, "지우기"는
    되돌릴 수 없으므로 요청을 보내기 전에 여기서 먼저 막는다.
    ".."나 빈 마디가 섞인 경로도 여기서 걸러진다.
  */

  const segments =
    storagePath.split("/");

  if (
    segments.length < 2 ||
    segments[0] !== String(userId) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {

    return null;

  }


  return storagePath;

}


function setAvatarMessage(
  text
) {

  if (avatarUploadMessage) {

    avatarUploadMessage.textContent =
      text || "";

  }

}


/*
  정리용 삭제 — 실패해도 사용자 흐름을 막지 않는다(고아 객체 하나가
  남을 뿐이고, site_settings가 가리키는 파일은 항상 멀쩡하다).
*/

async function removeAvatarObject(
  storagePath
) {

  if (!storagePath) {
    return null;
  }


  const {
    error
  } =
    await supabaseClient
      .storage
      .from(
        AVATAR_BUCKET
      )
      .remove([
        storagePath
      ]);


  if (error) {

    console.error(
      "avatar cleanup failed:",
      storagePath,
      error
    );

  }


  return error || null;

}



/* =========================================================
   미리보기

   "현재 값"을 그대로 미리보기 src로 써서 onload/onerror로 있고
   없음을 판단한다 — 예전에 URL 입력칸으로 저장된 외부 URL이
   남아 있는 사용자도 그대로 보여야 한다(이 화면에서 새로 만들
   수는 없지만, 기존 값은 계속 읽는다).
========================================================== */

function showAvatarPreview(
  url
) {

  if (!avatarPreview) {
    return;
  }


  if (avatarRemoveButton) {

    avatarRemoveButton.hidden =
      !url;

  }


  if (!url) {

    avatarPreview.hidden =
      true;

    avatarPreview.removeAttribute(
      "src"
    );


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


    setAvatarMessage(
      "프로필 사진 정보를 불러오지 못했습니다."
    );

  }


  currentAvatarUrl =
    data?.value ||
    "";


  showAvatarPreview(
    currentAvatarUrl
  );

}



/* =========================================================
   site_settings 저장 (upsert)

   지우기도 같은 경로로 빈 문자열을 쓴다 — row를 삭제하지 않으므로
   DELETE 정책에 기대지 않고, 읽는 쪽은 이미 전부 "빈 값 = 없음"
   으로 다룬다(skin-context.js의 ?.trim() || null 포함).
========================================================== */

async function saveAvatarUrlSetting(
  userId,
  value
) {

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
            userId,

          key:
            "avatar_url",

          value

        },
        {

          onConflict:
            "user_id,key"

        }
      );


  return error || null;

}


async function getAvatarUser() {

  const {
    data,
    error
  } =
    await supabaseClient
      .auth
      .getUser();


  if (
    error ||
    !data.user
  ) {

    setAvatarMessage(
      "로그인이 필요합니다."
    );

    return null;

  }


  return data.user;

}


/*
  요청 하나를 체인 끝에 붙인다. 앞의 요청이 끝난 뒤에야 시작하므로
  두 요청의 업로드/DB 쓰기가 서로 끼어들지 않는다.
*/

function queueAvatarOperation(
  run
) {

  const seq =
    ++avatarRequestSeq;

  avatarOperationChain =
    avatarOperationChain
      .then(
        () => run(seq)
      )
      .catch(
        (err) => {

          console.error(
            "avatar operation failed:",
            err
          );

        }
      );

  return avatarOperationChain;

}


function isAvatarRequestStale(
  seq
) {

  return seq !== avatarRequestSeq;

}



/* =========================================================
   업로드 — 새 경로 → 저장 → 이전 객체 정리
========================================================== */

async function runAvatarUpload(
  file,
  seq
) {

  /*
    내 차례가 오기 전에 사용자가 다른 사진을 골랐다면 업로드
    자체를 하지 않는다 — 네트워크도 아끼고, 지울 객체도 안 생긴다.
  */

  if (isAvatarRequestStale(seq)) {
    return;
  }


  const user =
    await getAvatarUser();


  if (!user) {
    return;
  }


  const previousUrl =
    currentAvatarUrl;

  const storagePath =
    buildAvatarStoragePath(
      user.id
    );


  setAvatarMessage(
    "업로드 중..."
  );


  const {
    error:
    uploadError
  } =
    await supabaseClient
      .storage
      .from(
        AVATAR_BUCKET
      )
      .upload(
        storagePath,
        file,
        {
          /*
            경로가 매번 새로 만들어지므로 덮어쓸 것이 없다 —
            혹시라도 겹치면 조용히 덮지 말고 실패하게 둔다.
          */
          upsert:
            false,

          contentType:
            file.type,

          cacheControl:
            "3600"
        }
      );


  /*
    여기서 멈추면 site_settings도 기존 Storage 객체도 그대로다.
  */

  if (uploadError) {

    console.error(
      uploadError
    );


    setAvatarMessage(
      "업로드하지 못했습니다. 기존 사진은 그대로 있습니다."
    );

    return;

  }


  /*
    업로드하는 사이에 사용자가 다른 사진을 골랐다 — 이 요청은
    최신이 아니므로 site_settings를 건드리지 않고, 방금 올린
    객체만 지우고 물러난다.
  */

  if (isAvatarRequestStale(seq)) {

    await removeAvatarObject(
      storagePath
    );

    return;

  }


  const uploadedUrl =
    buildAvatarPublicUrl(
      storagePath
    );


  const saveError =
    await saveAvatarUrlSetting(
      user.id,
      uploadedUrl
    );


  /*
    저장 실패 — 방금 올린 객체를 지우면 저장소와 설정이 다시
    업로드 이전 상태로 정확히 돌아간다. 기존 사진은 자기 경로에
    그대로 있으므로 손대지 않는다.
  */

  if (saveError) {

    console.error(
      saveError
    );


    await removeAvatarObject(
      storagePath
    );


    showAvatarPreview(
      currentAvatarUrl
    );


    setAvatarMessage(
      "저장하지 못했습니다. 기존 사진이 그대로 있습니다."
    );

    return;

  }


  currentAvatarUrl =
    uploadedUrl;


  showAvatarPreview(
    uploadedUrl
  );


  setAvatarMessage(
    "저장했어요 ♡"
  );


  /*
    여기서부터는 site_settings가 이미 새 사진을 가리킨다 —
    이전 객체 정리는 실패해도 화면에 영향이 없다(고아 파일 하나).
  */

  const previousPath =
    parseOwnAvatarStoragePath(
      previousUrl,
      user.id
    );


  if (
    previousPath &&
    previousPath !== storagePath
  ) {

    await removeAvatarObject(
      previousPath
    );

  }

}


avatarFileInput
  ?.addEventListener(
    "change",
    (event) => {

      const file =
        event.target.files?.[0];


      /*
        같은 파일을 다시 고를 수 있도록 곧바로 비운다(업로드
        성공/실패와 무관하게 항상).
      */

      event.target.value =
        "";


      if (!file) {
        return;
      }


      queueAvatarOperation(
        (seq) => runAvatarUpload(file, seq)
      );

    }
  );



/* =========================================================
   지우기 (저장값 → Storage 파일 순서)
========================================================== */

async function runAvatarRemove() {

  if (!currentAvatarUrl) {
    return;
  }


  const user =
    await getAvatarUser();


  if (!user) {
    return;
  }


  const previousUrl =
    currentAvatarUrl;


  if (avatarRemoveButton) {

    avatarRemoveButton.disabled =
      true;

  }


  setAvatarMessage(
    "지우는 중..."
  );


  const saveError =
    await saveAvatarUrlSetting(
      user.id,
      ""
    );


  if (avatarRemoveButton) {

    avatarRemoveButton.disabled =
      false;

  }


  if (saveError) {

    console.error(
      saveError
    );


    setAvatarMessage(
      "지우지 못했습니다."
    );

    return;

  }


  currentAvatarUrl =
    "";


  showAvatarPreview(
    ""
  );


  /*
    저장값을 비운 뒤 Storage 파일도 정리한다. 여기서 실패해도
    화면/공개 페이지에는 이미 사진이 없고 남는 건 아무도 가리키지
    않는 파일 하나뿐이라, 되돌리지 않고 알리기만 한다.

    저장된 값이 외부 URL이거나 경로를 해석할 수 없으면 지울 대상이
    없다 — 남의 파일을 건드리지 않기 위해 아무것도 하지 않는다.
  */

  const previousPath =
    parseOwnAvatarStoragePath(
      previousUrl,
      user.id
    );


  if (!previousPath) {

    setAvatarMessage(
      "사진을 지웠습니다."
    );

    return;

  }


  const removeError =
    await removeAvatarObject(
      previousPath
    );


  setAvatarMessage(
    removeError
      ? "사진을 지웠습니다(저장소 파일 정리는 실패)."
      : "사진을 지웠습니다."
  );

}


avatarRemoveButton
  ?.addEventListener(
    "click",
    () => {

      queueAvatarOperation(
        () => runAvatarRemove()
      );

    }
  );
