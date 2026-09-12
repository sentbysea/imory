/* =========================================================
   POSTS — 대표 이미지 파일 (post-covers 버킷)

   COVER 칸은 없어졌다. 글의 대표 사진은 이제 **본문에 넣은
   사진**에서 정한다(posts/editor/posts-body-images.js,
   기준 문서 IMORY_POST_BODY_IMAGE_DESIGN.md §2).

   이 파일에 남은 것은 그 변경과 무관하게 계속 필요한 두 가지다.

     1) 업로드 경로 규칙 / 허용 형식 / 크기 상한
        본문 사진도 같은 버킷·같은 경로 규칙을 쓴다 —
        {user_id}/{uuid}.{ext}, upsert:false. 기존 파일을 덮어쓰는
        경로가 아예 없다.

     2) 글을 지울 때의 Storage 정리
        post_covers 행은 cascade로 사라지지만 파일은 남는다.
        삭제 화면들이 takePostCoverStoragePaths() →
        (글 삭제) → removePostCoverStorageObjects() 순으로 쓴다
        (posts/editor/posts-list-detail-nav.js,
         posts/view/posts-view-list-select.js).

   ★ 기존 COVER 데이터는 그대로 둔다 (요구사항 2절)

     UI를 없앴다고 post_covers 행이나 파일을 지우지 않는다. 저장
     경로에서 대표 이미지를 건드리는 단계 자체를 뺐을 뿐이라,
     예전에 올려 둔 대표 이미지는 DB에 그대로 있고 갤러리 카드도
     지금까지처럼 그 사진을 쓴다 — 본문에 사진이 하나도 없는 글의
     썸네일 fallback이 그것이다(skin/skin-context.js의
     buildSkinGalleryCards: 명시 대표 → 본문 첫 사진 → post_covers).

     get_own_post_cover_paths도 post_covers와 post_gallery_images를
     함께 본다 — 글을 지우면 둘 다 정리된다.

   기준 문서: IMORY_GALLERY1_DESIGN.md §3
   DB: supabase/migrations/20260910100000_gallery_category_and_post_covers.sql
       supabase/migrations/20260911100000_post_covers_private_access.sql
       supabase/migrations/20260912100000_post_body_images.sql

   ★ 파일에는 공개 주소가 없다
     'post-covers'는 비공개 버킷이라 /object/public/... 주소 자체가
     존재하지 않는다. 바이트는 전부 우리 도메인 경로로만 나가고
     (/api/post-cover?post=<id> · ?image=<uuid>), 그 요청마다 서버가
     글의 현재 공개 상태와 요청자를 확인한다
     (core/lib/post-cover-url.js · functions/api/post-cover.js).

   ★ 스킨 장식용 Images(skin-images 버킷)와의 구분
     소유·수명이 다르다. Images 슬롯은 **스킨 버전**에 매달려 있고
     Publish 시점의 연결이 그대로 굳는다(skin_version_image_slots).
     글 사진은 **글**에 매달려 있고 글이 지워지면 함께 지워진다.

   classic script. 최상위 선언이 다른 posts/* 파일과 같은 전역
   렉시컬 환경을 공유한다(posts/editor/posts-refs.js 주석).
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


/* =========================================================
   업로드 경로

   업로드마다 새 uuid라 "다른 파일 = 다른 경로"가 성립한다.
   그래서 사진을 바꿔도 예전 파일을 덮어쓰지 않고, 저장이
   실패하면 방금 올린 것만 지우면 된다.
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

