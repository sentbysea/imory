/* =========================================================
   PAGES FUNCTION — GET /api/post-cover

   글 대표 이미지(post_covers)와 카테고리 비밀글 지정 이미지의
   **유일한** 배달 경로다.

     /api/post-cover?post=<글 id>
     /api/post-cover?category=<카테고리 id>

   기준 문서: IMORY_GALLERY1_DESIGN.md §3-5
   DB: supabase/migrations/20260911100000_post_covers_private_access.sql

   ★ 왜 프록시인가

   'post-covers'는 이제 **비공개 버킷**이다. 비공개 버킷의 객체는
   /object/public/... 주소가 아예 없고, 인증 없는 <img> 요청으로는
   받을 수 없다. 그래서 브라우저 대신 이 함수가 받아 흘려준다.

   서명 URL(createSignedUrl)을 쓰지 않은 이유: 서명 URL은 만료
   전까지 **권한 확인을 우회하는 주소**다. 공개 글이던 동안 받아 둔
   서명 URL은 그 글이 비밀글로 바뀐 뒤에도 만료까지 계속 열린다 —
   이번에 없애려는 것이 정확히 그 성질이다.

   ★ 이 함수는 anon 이상의 권한을 갖지 않는다

   Service Role 키를 쓰지 않는다. 들고 가는 것은 공개 값인 anon 키와,
   요청에 쿠키로 실려 온 **요청자 본인의** access token뿐이다. 판정은
   전부 DB가 한다:

     get_post_cover_object(post_id)   — 지금 이 글이 public인가 /
                                        요청자가 그 글의 주인인가
     storage.objects SELECT 정책      — 같은 판정을 파일 단위로 한 번 더

   두 번 다 요청 시점의 posts.visibility를 본다. 그래서 공개 범위를
   바꾸는 순간, **파일을 하나도 옮기거나 지우지 않아도** 그 다음
   요청부터 막힌다. 정리(고아 파일 삭제)가 실패해도 접근 경계는
   그대로다.

   프록시에 결함이 있어도 anon이 볼 수 없는 바이트는 나갈 수 없다 —
   그것이 Service Role 키를 두지 않은 이유다.

   ★ 소유자의 <img>는 어떻게 권한을 증명하나

   <img>는 Authorization 헤더를 실을 수 없다. 그래서 플랫폼이
   로그인 상태에서 access token을 **경로가 /api/post-cover로 제한된**
   쿠키에 넣어 둔다(core/lib/post-cover-url.js). 이 함수는 그 값을
   검증하지 않고 그대로 Supabase에 넘긴다 — 서명 검증도 만료 판정도
   DB(PostgREST/Storage)가 한다. 쿠키가 없거나 낡았으면 anon으로
   한 번 더 시도한다(공개 글의 사진은 그래도 보여야 한다).

     - SameSite=Strict  : 다른 사이트에서 시작한 요청에는 실리지 않는다
     - Path=/api/post-cover : 이 엔드포인트 외에는 어디에도 가지 않는다
     - 주소가 아니라 쿠키  : 링크로 복사되거나 Referer에 남지 않는다

   ★ 캐시

     Cache-Control: private, no-cache, max-age=0, must-revalidate

   no-cache는 "저장은 하되 **쓸 때마다 서버에 물어보라**"는 뜻이다.
   그래서 브라우저에 남은 사본이 권한 확인을 건너뛰고 다시 쓰이는 일이
   없다. 대신 ETag를 붙여 재확인이 304로 끝나게 한다 — 권한은 매번
   다시 보면서 바이트는 다시 보내지 않는다. 재확인 시점에 권한이
   사라졌으면 304가 아니라 404다.

   이미 내려받아 디스크에 저장된 사본의 회수는 범위 밖이다.

   ★ 응답
     200  이미지 바이트
     304  If-None-Match 일치 + 지금도 권한이 있다
     404  없는 글/카테고리, 대표 이미지 없음, 권한 없음 — 셋을 구분해
          알려주지 않는다(비밀글의 존재 자체를 응답으로 알리지 않는다)
     400  잘못된 질의
     405  GET/HEAD 외
     502  Supabase 응답 실패
========================================================== */

const POST_COVER_SUPABASE_URL_FALLBACK =
  "https://vtwcuvouyipohfonfukj.supabase.co";

const POST_COVER_SUPABASE_ANON_KEY_FALLBACK =
  "sb_publishable_9KQkblZdg92IPiB-p5_g0w_tG7HsMuG";


const POST_COVER_BUCKET =
  "post-covers";


/* 이 쿠키에 실려 오는 것은 요청자 **본인**의 Supabase access token이다.
   이 함수는 값을 해석하지 않고 그대로 전달한다(검증은 DB의 몫). */

const POST_COVER_TOKEN_COOKIE =
  "imory_cover_at";


/* DB의 CHECK 제약과 같은 집합. 저장된 mime을 그대로 믿지 않고 이
   목록에 있을 때만 쓴다 — 응답 Content-Type은 브라우저가 그 바이트를
   무엇으로 해석할지 정하는 값이라, 허용 목록 밖이면 확장자로 다시
   정하고 그것도 아니면 image/*가 아닌 것으로 취급한다. */

const POST_COVER_ALLOWED_MIME =
  [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
  ];

const POST_COVER_MIME_BY_EXTENSION =
  {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif"
  };


/*
  JWT는 base64url 세 토막이다. 헤더에 그대로 실을 값이므로 이 모양을
  벗어나면(개행·공백·따옴표 등) 쓰지 않는다 — 헤더 주입 방지.
*/

const POST_COVER_TOKEN_PATTERN =
  /^[A-Za-z0-9._-]{20,4096}$/;


function postCoverJsonHeaders(
  anonKey,
  token
) {

  return {
    "apikey": anonKey,
    "Authorization": `Bearer ${token || anonKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

}


function readPostCoverTokenCookie(
  request
) {

  const raw =
    request.headers.get("cookie");


  if (!raw) {

    return null;

  }


  for (const part of raw.split(";")) {

    const index =
      part.indexOf("=");

    if (index < 0) {

      continue;

    }


    const name =
      part.slice(0, index).trim();

    if (name !== POST_COVER_TOKEN_COOKIE) {

      continue;

    }


    const value =
      part.slice(index + 1).trim();


    return POST_COVER_TOKEN_PATTERN.test(value)
      ? value
      : null;

  }


  return null;

}


/*
  bigint 하나. 앞의 0이나 부호, 지수 표기 같은 것을 받아주지 않는다 —
  그대로 RPC 인자로 나가는 값이다.
*/

function parsePostCoverId(
  raw
) {

  if (typeof raw !== "string" || !/^[1-9][0-9]{0,17}$/.test(raw)) {

    return null;

  }


  return Number(raw);

}


function postCoverNotFound() {

  return new Response(
    "",
    {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store"
      }
    }
  );

}


/*
  -> { storage_path, mime_type } | null

  null은 "없다 또는 권한이 없다"이다 — 호출자는 둘을 구분하지 않고
  404를 준다.
*/

async function fetchPostCoverObjectRow(
  supabaseUrl,
  anonKey,
  token,
  functionName,
  args,
  galleryTokens = ""
) {

  const call =
    (bearer) =>
      fetch(
        `${supabaseUrl}/rest/v1/rpc/${functionName}`,
        {
          method: "POST",
          headers: { ...postCoverJsonHeaders(anonKey, bearer),
            ...(galleryTokens ? { "X-Imory-Gallery-Access": galleryTokens } : {}) },
          body: JSON.stringify(args)
        }
      );


  let response =
    await call(token);


  /*
    쿠키의 토큰이 만료됐거나 다른 프로젝트의 것이면 PostgREST가 401을
    준다. 그 때문에 공개 글의 사진까지 안 보이면 안 되므로 anon으로
    한 번 더 시도한다 — 권한이 올라가는 방향이 아니다.
  */

  if (token && (response.status === 401 || response.status === 403)) {

    response =
      await call(null);

  }


  if (!response.ok) {

    return {
      failed: true,
      row: null
    };

  }


  let payload;

  try {

    payload =
      await response.json();

  }

  catch (err) {

    return {
      failed: true,
      row: null
    };

  }


  const row =
    Array.isArray(payload)
      ? payload[0]
      : payload;


  if (
    !row ||
    typeof row.storage_path !== "string" ||
    !row.storage_path
  ) {

    return {
      failed: false,
      row: null
    };

  }


  return {
    failed: false,
    row
  };

}


function resolvePostCoverContentType(
  row
) {

  if (
    typeof row.mime_type === "string" &&
    POST_COVER_ALLOWED_MIME.includes(row.mime_type)
  ) {

    return row.mime_type;

  }


  const extension =
    String(row.storage_path).split(".").pop().toLowerCase();


  return (
    POST_COVER_MIME_BY_EXTENSION[extension] ||
    "application/octet-stream"
  );

}


function encodePostCoverObjectPath(
  storagePath
) {

  return storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

}


/*
  ETag는 storage_path에서 만든다. 경로는 업로드마다 새 uuid라
  "다른 파일 = 다른 ETag"가 성립하고, 사진을 교체하면 즉시 달라진다.
  경로 자체를 노출하지 않도록 값은 그대로 쓰지 않고 잘라 섞는다.
*/

function buildPostCoverEtag(
  storagePath
) {

  let hash =
    2166136261;


  for (let i = 0; i < storagePath.length; i += 1) {

    hash ^= storagePath.charCodeAt(i);

    hash = Math.imul(hash, 16777619);

  }


  return `"c${(hash >>> 0).toString(36)}${storagePath.length.toString(36)}"`;

}


function postCoverCacheHeaders(
  etag
) {

  return {
    /*
      no-cache = 저장은 하되 쓰기 전에 반드시 재확인. private = 공유
      캐시(CDN)에는 두지 않는다. 그래서 권한 확인을 건너뛰는 사본이
      중간에 남지 않는다.
    */
    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
    "ETag": etag,
    "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };

}


export async function onRequest(
  context
) {

  const {
    request,
    env
  } =
    context;


  if (
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {

    return new Response(
      "",
      {
        status: 405,
        headers: {
          "Allow": "GET, HEAD",
          "Cache-Control": "private, no-store"
        }
      }
    );

  }


  const url =
    new URL(request.url);


  const postId =
    parsePostCoverId(url.searchParams.get("post"));

  const categoryId =
    parsePostCoverId(url.searchParams.get("category"));

  const rawImageId = url.searchParams.get("image");
  const imageId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawImageId || "")
    ? rawImageId : null;


  /* 둘 중 정확히 하나 */

  if (
    [postId, categoryId, imageId].filter(value => value !== null).length !== 1
  ) {

    return new Response(
      "",
      {
        status: 400,
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );

  }


  const supabaseUrl =
    (env && env.SUPABASE_URL) || POST_COVER_SUPABASE_URL_FALLBACK;

  const anonKey =
    (env && env.SUPABASE_ANON_KEY) || POST_COVER_SUPABASE_ANON_KEY_FALLBACK;


  const token =
    readPostCoverTokenCookie(request);

  const galleryTokens = imageId ? (request.headers.get("cookie") || "").split(";")
    .map(part => part.trim()).filter(part => /^imory_gallery_[0-9]+=/.test(part))
    .map(part => part.slice(part.indexOf("=") + 1))
    .filter(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    .slice(0, 32).join(",") : "";


  const lookup =
    imageId !== null
      ? await fetchPostCoverObjectRow(supabaseUrl, anonKey, token,
          "get_gallery_image_object", { p_image_id: imageId }, galleryTokens)
      : postId !== null
      ? await fetchPostCoverObjectRow(
          supabaseUrl,
          anonKey,
          token,
          "get_post_cover_object",
          { p_post_id: postId }
        )
      : await fetchPostCoverObjectRow(
          supabaseUrl,
          anonKey,
          token,
          "get_category_cover_object",
          { p_category_id: categoryId }
        );


  if (lookup.failed) {

    return new Response(
      "",
      {
        status: 502,
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );

  }


  if (!lookup.row) {

    /* 없는 글 / 대표 이미지 없음 / 권한 없음 — 구분하지 않는다 */

    return postCoverNotFound();

  }


  const etag =
    buildPostCoverEtag(lookup.row.storage_path);


  /*
    재확인 요청. 여기까지 왔다는 것은 **지금도** 권한이 있다는
    뜻이다(위 조회가 통과했다) — 그래서 304를 줄 수 있다. 권한이
    사라졌다면 위에서 이미 404로 끝났다.
  */

  if (request.headers.get("if-none-match") === etag) {

    return new Response(
      null,
      {
        status: 304,
        headers: postCoverCacheHeaders(etag)
      }
    );

  }


  const objectResponse =
    await fetch(
      `${supabaseUrl}/storage/v1/object/${POST_COVER_BUCKET}/` +
      encodePostCoverObjectPath(lookup.row.storage_path),
      {
        method: "GET",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${token || anonKey}`,
          ...(galleryTokens ? { "X-Imory-Gallery-Access": galleryTokens } : {})
        }
      }
    );


  if (!objectResponse.ok) {

    /*
      파일이 없거나(정리된 뒤) 정책이 거절했다. 둘 다 방문자에게는
      "없다"이다.
    */

    return postCoverNotFound();

  }


  const headers =
    postCoverCacheHeaders(etag);

  headers["Content-Type"] =
    resolvePostCoverContentType(lookup.row);


  const contentLength =
    objectResponse.headers.get("content-length");

  if (contentLength) {

    headers["Content-Length"] =
      contentLength;

  }


  if (request.method === "HEAD") {

    return new Response(
      null,
      {
        status: 200,
        headers
      }
    );

  }


  return new Response(
    objectResponse.body,
    {
      status: 200,
      headers
    }
  );

}
