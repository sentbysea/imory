/* =========================================================
   PAGES FUNCTION — GET /api/og/post

   공개 글 하나의 **공유 카드 이미지**(1200 × 628 PNG)를 만들어
   준다. X(Twitter)·카카오톡 같은 크롤러가 og:image 로 받아가는
   주소다.

     /api/og/post?slug=<블로그>&post=<글 공개 번호>&v=<버전>

   기준 문서: IMORY_SHARE_CARD_DESIGN.md
   레이아웃:  core/lib/share-card.js (설정 화면 미리보기와 같은 파일)

   ★ 이 파일이 두 가지를 한다

     1) onRequest              — 카드 PNG 배달 (이 엔드포인트)
     2) 아래 export 들          — 공개 글 주소(/:slug/post/:id)의
                                  HTML 에 og/twitter meta 를 끼워
                                  넣는 데 필요한 조회·문자열 생성.
                                  functions/_middleware.js 가 쓴다.

   meta 주입과 이미지 생성이 **같은 조회**(loadShareCardPost)를
   쓰는 것이 중요하다. 같은 판정에서 나온 제목·배경이어야 카드와
   meta 가 어긋나지 않는다.

   ★ 권한 — Service Role 키를 쓰지 않는다

   functions/api/post-cover.js 와 같은 규칙이다. 들고 가는 것은
   공개 값인 anon 키뿐이고, 요청자의 쿠키/토큰은 **쓰지 않는다**
   (크롤러에게는 세션이 없고, 이 엔드포인트는 누구에게나 같은
   답을 줘야 한다).

   그래서 이 함수가 볼 수 있는 것은 anon 이 볼 수 있는 것뿐이다.
   그 위에 한 겹 더:

     visibility !== 'public' 이면 제목·발췌·대표 이미지를 **한
     글자도** 쓰지 않고 서비스 기본 카드를 준다.

   anon 은 비밀글(secret)의 행을 볼 수 있다(목록에 자물쇠로 뜬다).
   그 제목이 카드로 새어 나가지 않게 하는 것이 위 한 줄이다.

   ★ 왜 헤드리스 브라우저인가

   Workers 런타임에는 canvas 도 폰트 래스터라이저도 없다. 한글
   제목을 서버에서 그리려면 실제 브라우저가 필요하다. 그래서
   Cloudflare Browser Rendering REST API(같은 계정 안의 1st-party
   서비스)에 core/lib/share-card.js 가 만든 **그 HTML 문서**를
   그대로 넘겨 스크린샷을 받는다 — 설정 화면 미리보기와 같은
   마크업·CSS·웹폰트라 글자 배치가 같다.

   필요한 환경 변수(Pages > Settings > Environment variables):

     CF_ACCOUNT_ID                 Cloudflare account id
     CF_BROWSER_RENDERING_TOKEN    Browser Rendering 권한 API 토큰

   둘 중 하나라도 없거나 렌더가 실패하면 **서비스 기본 카드**
   (/images/share-card-default.png)를 돌려준다 — 카드가 깨진
   이미지로 뜨는 일은 없다. 이때 캐시는 짧게 잡아서, 설정이
   채워지면 곧 실제 카드로 바뀐다.

   ★ 캐시 — 같은 post + v 는 두 번 그리지 않는다

   주소에 ?v=<버전>이 있다(카드 설정 version + 글 updated_at +
   대표 이미지 유무로 만든 해시). 내용이 바뀌면 주소가 바뀌므로
   버전이 붙은 주소의 내용은 바뀔 수 없다:

     · 렌더 **전에** Workers Cache API 를 먼저 본다.
     · 성공한 PNG 를 그 캐시에 넣고,
       Cache-Control: public, max-age=31536000, immutable 로 준다.
     · 그래서 같은 post + v 의 반복 요청은 Browser Rendering 을
       다시 부르지 않는다.

   단, **캐시가 권한 검사를 건너뛰지 않는다.** 적중이어도 매번
   지금 이 글이 공개인지 값싼 질의 한 번으로 다시 보고(아래
   loadShareCardPostOwner), 아니면 캐시의 바이트를 내보내지 않고
   항목을 지운다 — post-cover.js 의 "권한은 매번 다시, 바이트는
   다시 보내지 않는다"와 같은 규칙이다.

   기본 카드로 내려가는 길(비공개 · 설정 없음 · 렌더 실패)과
   버전 없는 주소는 캐시에 담지 않는다 — 담으면 공개로 바꾼
   뒤에도 기본 카드가 계속 나간다.

   ★ 응답
     200  PNG
     400  잘못된 질의
     405  GET/HEAD 외
========================================================== */

import {
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
  buildShareCardHtml,
  normalizeShareCardSettings,
  serializeShareCardSettings,
  resolveShareCardLabel,
  collapseShareCardText,
  escapeShareCardHtml
} from "../../../core/lib/share-card.js";


const OG_SUPABASE_URL_FALLBACK =
  "https://vtwcuvouyipohfonfukj.supabase.co";

const OG_SUPABASE_ANON_KEY_FALLBACK =
  "sb_publishable_9KQkblZdg92IPiB-p5_g0w_tG7HsMuG";


/* 서비스 기본 카드 — 정적 자산(Pages 가 서빙한다) */

export const SHARE_CARD_DEFAULT_IMAGE_PATH =
  "/images/share-card-default.png";


/*
  공개 글 주소. slug 규칙은 profiles_slug_format/length 제약과 같다
  (소문자·숫자·하이픈, 3~30자). 이 정규식에 걸린 뒤에도 실제 slug
  주인과 글 주인이 같은지 다시 확인한다.
*/

export const SHARE_CARD_POST_ROUTE =
  /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/post\/([1-9][0-9]{0,17})\/?$/;


/* meta 조회 결과를 잠깐만 들고 있는다(같은 글의 연속 요청) */

const SHARE_CARD_META_CACHE_SECONDS =
  60;


/* =========================================================
   Supabase — anon 으로 읽기만
========================================================== */

function ogSupabaseConfig(
  env
) {

  return {

    url:
      (env && env.SUPABASE_URL) || OG_SUPABASE_URL_FALLBACK,

    anonKey:
      (env && env.SUPABASE_ANON_KEY) || OG_SUPABASE_ANON_KEY_FALLBACK

  };

}


/*
  질의가 **실패**한 것과 **결과가 없는** 것을 구분해서 돌려준다.
  실패는 null, 없음은 [] 다.

  이 구분이 필요한 곳은 하나다: posts.share_label_seq 는 나중에
  추가된 컬럼이라, migration 이 아직 적용되지 않은 배포에서는
  그 컬럼을 고른 select 가 통째로 400 이 된다. 그때 "글이 없다"로
  끝내면 카드가 기본 그라데이션이 되어 버린다 — 컬럼 없이 한 번
  더 물어보고 라벨 번호만 포기해야 한다(아래 loadShareCardPost).
*/

async function ogSupabaseSelectOrNull(
  env,
  resource
) {

  const {
    url,
    anonKey
  } =
    ogSupabaseConfig(env);


  let response;


  try {

    response =
      await fetch(
        `${url}/rest/v1/${resource}`,
        {
          method: "GET",
          headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${anonKey}`,
            "Accept": "application/json"
          }
        }
      );

  }

  catch (err) {

    return null;

  }


  if (!response.ok) {

    return null;

  }


  try {

    const payload =
      await response.json();


    return Array.isArray(payload)
      ? payload
      : [];

  }

  catch (err) {

    return null;

  }

}


async function ogSupabaseSelect(
  env,
  resource
) {

  return (
    await ogSupabaseSelectOrNull(env, resource)
  ) || [];

}


export function parseShareCardPostId(
  raw
) {

  if (typeof raw !== "string" || !/^[1-9][0-9]{0,17}$/.test(raw)) {

    return null;

  }


  return raw;

}


/*
  PUBLIC-NUMBER-1: ?slug= 는 어느 블로그의 번호인지를 정한다.
  규칙은 profiles_slug_format/length 제약과 같다(소문자·숫자·
  하이픈, 3~30자) — 위 SHARE_CARD_POST_ROUTE 와 같은 모양이다.
*/

export function parseShareCardSlug(
  raw
) {

  if (
    typeof raw !== "string" ||
    raw.length < 3 ||
    raw.length > 30 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)
  ) {

    return null;

  }


  return raw;

}


/* =========================================================
   버전 — 실제로 바뀔 때만 달라진다

   임의의 timestamp 를 매 요청마다 붙이면 SNS 가 카드를 매번 다시
   받아가고(캐시가 무의미해지고) 렌더 비용만 늘어난다. 그래서
   "바뀌면 달라지는 값들"만 섞어 짧은 해시를 만든다:

     카드 설정 version(저장할 때 갱신) · 글 updated_at ·
     대표 이미지 유무 · 기본 카드 사진 주소

   FNV-1a 32bit — functions/api/post-cover.js 의 ETag 와 같은 방식.
========================================================== */

export function shareCardVersionToken(
  parts
) {

  const source =
    parts
      .map((part) => String(part === null || part === undefined ? "" : part))
      .join("|");


  let hash =
    2166136261;


  for (let i = 0; i < source.length; i += 1) {

    hash ^= source.charCodeAt(i);

    hash = Math.imul(hash, 16777619);

  }


  return `${(hash >>> 0).toString(36)}${source.length.toString(36)}`;

}


/* =========================================================
   본문 → og:description

   저장된 본문은 HTML 이다(복사 상자·메모·구분선 같은 블록도
   들어 있다). 태그를 지우고 한 줄로 만든 뒤 앞부분만 쓴다.
   공개 글에서만 부른다.
========================================================== */

export function shareCardExcerpt(
  html,
  limit
) {

  const max =
    Number.isFinite(limit) ? limit : 110;


  const text =
    collapseShareCardText(
      String(html === null || html === undefined ? "" : html)
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
    );


  if (text.length <= max) {

    return text;

  }


  return `${text.slice(0, max).trim()}…`;

}


/* =========================================================
   조회 — 카드와 meta 가 함께 쓰는 하나의 진실

   반환(항상 객체를 준다):

     ok            공개 글을 찾았다(제목/발췌/대표 이미지를 써도 된다)
     slug          주소의 slug (주인 확인을 통과한 값)
     blogTitle     site_settings.blog_title
     card          normalizeShareCardSettings() 결과
     title         공개 글일 때만 실제 제목
     categoryName  공개 글일 때만 카테고리 이름
     containerName 글이 든 가장 안쪽 이름(폴더 > 카테고리)
     sequence      컨테이너 안의 공개 순번(posts.share_label_seq)
     label         우상단 라벨(사용자 지정 > 자동)
     excerpt       공개 글일 때만 본문 발췌
     hasCover      공개 글의 예전 COVER 업로드(post_covers) 유무
     coverImageId  공개 글의 대표 사진(본문 사진 중 한 장) id
     updatedAt     버전 계산용
     postId        주소에 쓰는 **공개 번호**(posts.public_no) 문자열
     postRowId     그 글의 내부 id 문자열 — /api/post-cover 처럼 PK 를
                   받는 곳에만 쓴다(PUBLIC-NUMBER-1)
========================================================== */

/* =========================================================
   카드 설정 한 줄 읽기

   따로 떼어 둔 이유는 아래 injectShareCardMeta 다. 글에서 온
   값(제목 · 카테고리 · 순번)은 잘 안 바뀌지만 **카드 설정은
   사용자가 방금 저장한 그 값**이어야 한다 — 저장하자마자 글
   주소의 og:image 가 새 v 를 달아야, 그 뒤에 붙여 넣은 링크가
   새 카드를 받아간다. 그래서 meta 캐시가 적중해도 이 한 줄은
   매번 다시 읽는다(질의 하나).
========================================================== */

export async function loadShareCardSettings(
  env,
  userId
) {

  const rows =
    await ogSupabaseSelect(
      env,
      `site_settings?user_id=eq.${encodeURIComponent(userId)}` +
      `&key=in.(share_card,blog_title)&select=key,value`
    );


  const settings =
    new Map(
      rows.map((row) => [row.key, row.value])
    );


  return {

    blogTitle:
      collapseShareCardText(settings.get("blog_title")),

    card:
      normalizeShareCardSettings(settings.get("share_card"))

  };

}


/* =========================================================
   본문 사진 중 대표 한 장

   순서는 갤러리 카드와 같다 — 명시 대표(is_primary) 한 장,
   없으면 본문 첫 사진(position → id). position 은 같은 값이
   겹칠 수 있으므로 id 로 한 번 더 가른다: 같은 글은 언제 물어도
   같은 사진을 골라야 카드 주소의 버전이 흔들리지 않는다.

   PostgREST 의 order 를 그대로 믿지 않고 여기서 다시 정렬한다
   (질의가 실패하면 [] 이 오고, 그때는 예전 post_covers 로 내려간다).
========================================================== */

const SHARE_CARD_IMAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export function pickShareCardCoverImageId(
  rows
) {

  const images =
    (rows || [])
      .filter(
        (row) =>
          row &&
          typeof row.id === "string" &&
          SHARE_CARD_IMAGE_ID_PATTERN.test(row.id)
      )
      .sort((a, b) => {

        const left =
          Number.isFinite(Number(a.position))
            ? Number(a.position)
            : Number.MAX_SAFE_INTEGER;

        const right =
          Number.isFinite(Number(b.position))
            ? Number(b.position)
            : Number.MAX_SAFE_INTEGER;


        if (left !== right) {

          return left - right;

        }


        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);

      });


  const chosen =
    images.find((image) => image.is_primary === true) ||
    images[0];


  return (chosen && chosen.id) || "";

}


export async function loadShareCardPost(
  env,
  slug,
  postId
) {

  const empty =
    {
      ok: false,
      slug: slug || "",
      ownerId: "",
      blogTitle: "",
      card: normalizeShareCardSettings(null),
      title: "",
      categoryName: "",
      containerName: "",
      sequence: 0,
      label: "",
      excerpt: "",
      hasCover: false,
      coverImageId: "",
      updatedAt: "",
      postId: postId || "",
      postRowId: ""
    };


  if (!slug || !postId) {

    return empty;

  }


  const profiles =
    await ogSupabaseSelect(
      env,
      `profiles?slug=eq.${encodeURIComponent(slug)}&select=user_id,nickname&limit=1`
    );


  const profile =
    profiles[0];


  if (!profile || !profile.user_id) {

    return empty;

  }


  /*
    설정은 공개 글이 아니어도 읽는다 — 기본 카드 사진과 블로그
    제목은 그 자체가 공개 값이고, 비공개 글의 meta 에도 블로그
    제목은 들어갈 수 있다.
  */

  /*
    PUBLIC-NUMBER-1: 주소의 숫자는 이 블로그 안의 공개 번호
    (posts.public_no)이고 PK 가 아니다. 그래서 주인과 **한 쌍으로만**
    조회한다 — 번호만으로는 행이 특정되지 않는다(다른 블로그에도
    같은 번호가 있다).

    이것이 "다른 사용자의 글로 fallback 하지 않는다"를 지키는
    지점이다: 이 블로그에 그 번호가 없으면 아래에서 post 가
    undefined 가 되고 기본 카드로 끝난다.
  */

  const postQuery =
    `posts?public_no=eq.${encodeURIComponent(postId)}` +
    `&user_id=eq.${encodeURIComponent(profile.user_id)}`;


  const [settings, postRowsOrNull] =
    await Promise.all([

      loadShareCardSettings(env, profile.user_id),

      ogSupabaseSelectOrNull(
        env,
        `${postQuery}&select=id,user_id,title,category_id,folder_id,visibility,` +
        `created_at,updated_at,share_label_seq&limit=1`
      )

    ]);


  /*
    share_label_seq 는 나중에 생긴 컬럼이다. 아직 migration 이
    적용되지 않은 배포에서는 위 select 가 통째로 실패한다 —
    그때는 번호만 포기하고 나머지는 그대로 그린다.
  */

  const postRows =
    postRowsOrNull ||
    await ogSupabaseSelect(
      env,
      `${postQuery}&select=id,user_id,title,category_id,folder_id,visibility,` +
      `created_at,updated_at&limit=1`
    );


  const base =
    {
      ...empty,

      ownerId:
        profile.user_id,

      blogTitle:
        settings.blogTitle,

      card:
        settings.card
    };


  const post =
    postRows[0];


  /*
    ★ 공개 글이 아니면 여기서 끝난다.

    anon 이 비밀글의 행을 볼 수 있다는 사실과 무관하게, 이 아래로는
    제목도 카테고리도 본문도 대표 이미지도 조회하지 않는다.
  */

  if (!post || post.visibility !== "public") {

    return base;

  }


  /*
    PUBLIC-NUMBER-1: 여기서부터는 **내부 id** 다. post_covers /
    post_gallery_images / post_contents 의 post_id 는 전부
    posts.id 를 가리키는 FK 이고, 공개 번호와는 다른 값이다.
    위에서 확정된 행의 id 를 쓴다(주소의 숫자가 아니다).
  */

  const postRowId =
    post.id;


  const [categoryRows, folderRows, coverRows, photoRows, contentRows] =
    await Promise.all([

      post.category_id
        ? ogSupabaseSelect(
            env,
            `categories?id=eq.${encodeURIComponent(post.category_id)}&select=name&limit=1`
          )
        : Promise.resolve([]),

      post.folder_id
        ? ogSupabaseSelect(
            env,
            `post_folders?id=eq.${encodeURIComponent(post.folder_id)}&select=name&limit=1`
          )
        : Promise.resolve([]),

      ogSupabaseSelect(
        env,
        `post_covers?post_id=eq.${encodeURIComponent(postRowId)}&select=post_id&limit=1`
      ),

      /*
        ★ 지금의 대표 사진은 여기에 있다 — 본문에 넣은 사진 중 한 장.

        COVER 업로드 칸이 없어진 뒤로 post_covers 에는 새 행이
        생기지 않는다(posts/editor/posts-cover-image.js). 갤러리
        카드가 쓰는 것과 같은 순서로 고른다:
        명시 대표(is_primary) → 본문 첫 사진 → 예전 post_covers
        (skin/skin-context.js 의 buildSkinGalleryCards).

        anon 에게 GRANT 된 컬럼만 고른다(id · post_id · position ·
        is_primary). 행 자체는 RLS 가 공개 글일 때만 준다.
      */

      ogSupabaseSelect(
        env,
        `post_gallery_images?post_id=eq.${encodeURIComponent(postRowId)}` +
        `&select=id,position,is_primary&order=position.asc&limit=200`
      ),

      ogSupabaseSelect(
        env,
        `post_contents?post_id=eq.${encodeURIComponent(postRowId)}&select=content&limit=1`
      )

    ]);


  const categoryName =
    collapseShareCardText(categoryRows[0] && categoryRows[0].name);

  const folderName =
    collapseShareCardText(folderRows[0] && folderRows[0].name);


  /* 가장 안쪽 이름 — 폴더 안의 글이면 폴더 이름이 이긴다 */

  const containerName =
    folderName || categoryName;


  const sequence =
    await loadShareCardSequence(env, post);


  return {

    ...base,

    ok:
      true,

    title:
      collapseShareCardText(post.title),

    categoryName,

    containerName,

    sequence,

    label:
      resolveShareCardLabel(
        base.card.cardLabel,
        containerName,
        sequence
      ),

    excerpt:
      shareCardExcerpt(contentRows[0] && contentRows[0].content),

    hasCover:
      Boolean(coverRows[0]),

    coverImageId:
      pickShareCardCoverImageId(photoRows),

    /*
      PUBLIC-NUMBER-1: 주소에 쓰는 번호(postId)와 별개로, 내부
      id 도 함께 들고 간다 — /api/post-cover 는 글의 **PK** 를
      받는 프록시라 공개 번호를 주면 다른 글의 사진이 나오거나
      404 가 된다(functions/api/post-cover.js).
    */

    postRowId:
      String(post.id || ""),

    updatedAt:
      String(post.updated_at || "")

  };

}


/* =========================================================
   자동 라벨의 번호

   정상 경로는 **컬럼을 읽는 것 한 번**이다 —
   posts.share_label_seq 는 글이 공개되는 순간 굳고, 그 뒤로는
   앞 글을 지워도 바뀌지 않는다
   (supabase/migrations/20260913180000_add_posts_share_label_seq.sql).

   그 컬럼이 아직 없는 배포(migration 미적용)에서만 그때그때
   센다 — "같은 컨테이너의 공개 글 중 이 글보다 먼저 쓰인 것 +
   자기 자신". 이 값은 앞 글이 지워지면 달라진다. 그래서 이것은
   컬럼이 채워질 때까지의 임시 값이고, 정상 경로가 아니다.
========================================================== */

async function loadShareCardSequence(
  env,
  post
) {

  const stored =
    Number(post.share_label_seq);


  if (Number.isFinite(stored) && stored > 0) {

    return Math.floor(stored);

  }


  if (!post.created_at) {

    return 0;

  }


  const rows =
    await ogSupabaseSelect(
      env,
      `posts?user_id=eq.${encodeURIComponent(post.user_id || "")}` +
      `&category_id=${post.category_id ? `eq.${encodeURIComponent(post.category_id)}` : "is.null"}` +
      `&folder_id=${post.folder_id ? `eq.${encodeURIComponent(post.folder_id)}` : "is.null"}` +
      `&visibility=eq.public` +
      `&created_at=lte.${encodeURIComponent(post.created_at)}` +
      `&select=id`
    );


  return rows.length;

}


/* =========================================================
   배경 사진 우선순위

     1) 글의 대표 사진 — 공개 글일 때만
        1-1) 본문 사진 중 대표(post_gallery_images) ← 지금 경로
        1-2) 예전 COVER 업로드(post_covers)
     2) 카드 설정의 기본 공유 카드 사진
     3) 없음 → share-card.js 의 서비스 기본 그라데이션

   1) 은 비공개 버킷에 있어서 공개 주소가 없다. 헤드리스 브라우저도
   다른 방문자와 똑같이 **기존 프록시**로 받는다
   (/api/post-cover?image=<사진 id> · ?post=<글 id> — 그 프록시가
   요청 시점의 공개 상태를 다시 본다). 버킷 주소나 서명 URL 을
   새로 만들지 않는다.
========================================================== */

export function shareCardBackgroundUrl(
  context,
  origin
) {

  if (context.ok && context.coverImageId) {

    return `${origin}/api/post-cover?image=${encodeURIComponent(context.coverImageId)}`;

  }


  if (context.ok && context.hasCover) {

    /* PUBLIC-NUMBER-1: 이 프록시는 글의 내부 id 를 받는다 */
    return `${origin}/api/post-cover?post=${encodeURIComponent(context.postRowId)}`;

  }


  if (context.card.imageUrl) {

    return context.card.imageUrl;

  }


  return "";

}


export function shareCardImageEndpoint(
  context,
  origin
) {

  if (!context.ok) {

    return `${origin}${SHARE_CARD_DEFAULT_IMAGE_PATH}`;

  }


  const version =
    shareCardVersionToken([
      context.card.version,
      context.card.imageUrl,
      context.updatedAt,

      /*
        대표 사진이 바뀌면 카드도 달라진다 — 어느 사진인지까지
        섞는다. 본문 글자를 건드리지 않고 대표만 바꾼 경우
        posts.updated_at 만으로는 구분되지 않는다.
      */

      context.coverImageId || (context.hasCover ? "1" : "0"),

      /*
        라벨은 글 밖에서도 바뀐다 — 카테고리/폴더 이름을 고치면
        posts.updated_at 은 그대로인데 카드 글자는 달라진다.
      */

      context.label
    ]);


  /*
    PUBLIC-NUMBER-1: ?post= 는 이제 **그 블로그 안의 공개 번호**다.
    번호만으로는 글이 특정되지 않으므로 slug 를 함께 싣는다 —
    이 주소를 받은 쪽(아래 onRequest)이 (slug 주인, 번호) 한 쌍으로
    다시 찾는다. 예전처럼 번호 하나로 주인을 거꾸로 찾을 수는 없다.
  */

  return (
    `${origin}/api/og/post` +
    `?slug=${encodeURIComponent(context.slug)}` +
    `&post=${encodeURIComponent(context.postId)}` +
    `&v=${encodeURIComponent(version)}`
  );

}


/* =========================================================
   meta 태그 문자열

   twitter:player · 영상 카드 meta 는 넣지 않는다 — 정적 large
   image 카드로만 제공해서 X 가 영상형 회색 바를 얹을 여지를
   만들지 않는다.

   ★ og:title 과 twitter:title 이 다르다

   X 앱은 카드 **아래에** 자기 검은 반투명 바를 얹고 거기에
   twitter:title 을 쓴다. 그 바의 자리와 디자인은 우리가 제어할
   수 없다. 그래서 역할을 나눈다:

     카드 이미지 안   글 제목 (좌하단)
     X 검은 링크 바   블로그 제목만
     카드 우하단      imory.me

   그러려면 twitter:title 에 글 제목 · slug · 카테고리 ·
   구분자(`|`)가 **하나도** 들어가면 안 된다 — 들어가면 카드
   안의 글 제목과 같은 말이 두 번 보인다.

   og:title 은 반대로 실제 글 제목 그대로다. 페이스북/카카오 등
   다른 크롤러와 검색엔진이 글을 식별하는 값이고, 그쪽에는 우리가
   제어하지 못하는 링크 바가 없다.
========================================================== */

export const SHARE_CARD_SITE_TITLE_FALLBACK =
  "imory.me";


export function renderShareCardMetaTags(
  context,
  origin,
  pageUrl
) {

  const siteName =
    context.blogTitle || "imory";


  /* X 검은 링크 바 — 블로그 제목만 */

  const linkBarTitle =
    context.blogTitle || SHARE_CARD_SITE_TITLE_FALLBACK;


  const title =
    context.ok
      ? (context.title || siteName)
      : siteName;


  const description =
    context.ok
      ? (
          context.excerpt ||
          [
            context.categoryName,
            context.slug ? `@${context.slug}` : ""
          ].filter(Boolean).join(" · ") ||
          siteName
        )
      : "imory에서 쓰고 모으는 기록.";


  const imageUrl =
    shareCardImageEndpoint(context, origin);


  const tags =
    [
      ["og:type", context.ok ? "article" : "website"],
      ["og:site_name", siteName],
      ["og:url", pageUrl],
      ["og:title", title],
      ["og:description", description],
      ["og:image", imageUrl],
      ["og:image:width", String(SHARE_CARD_WIDTH)],
      ["og:image:height", String(SHARE_CARD_HEIGHT)],
      ["og:image:alt", title]
    ]
      .map(
        ([property, content]) =>
          `  <meta property="${property}" content="${escapeShareCardHtml(content)}">`
      )
      .concat(
        [
          ["twitter:card", "summary_large_image"],
          ["twitter:title", linkBarTitle],
          ["twitter:description", description],
          ["twitter:image", imageUrl],
          ["twitter:image:alt", title]
        ]
          .map(
            ([name, content]) =>
              `  <meta name="${name}" content="${escapeShareCardHtml(content)}">`
          )
      );


  return tags.join("\n");

}


/* =========================================================
   index.html 의 기본 meta 자리를 바꿔치기

   진입 문서에는 아래 두 표시 사이에 사이트 기본 카드 meta 가 이미
   적혀 있다(어떤 주소로 들어와도 카드가 하나는 나오도록).

     <!-- imory:share-card-meta -->
     ...
     <!-- /imory:share-card-meta -->

   글 주소로 들어온 요청에서는 그 사이를 글 카드 meta 로 **교체**
   한다. 뒤에 덧붙이면 og:title 이 두 번 적히고, 어느 쪽을 쓰는지는
   크롤러마다 다르다.

   표시가 없으면(예상 밖) </head> 앞에 넣는다.
========================================================== */

const SHARE_CARD_META_OPEN =
  "<!-- imory:share-card-meta -->";

const SHARE_CARD_META_CLOSE =
  "<!-- /imory:share-card-meta -->";


export function replaceShareCardMeta(
  html,
  tags
) {

  const block =
    `${SHARE_CARD_META_OPEN}\n${tags}\n  ${SHARE_CARD_META_CLOSE}`;


  const start =
    html.indexOf(SHARE_CARD_META_OPEN);

  const end =
    html.indexOf(SHARE_CARD_META_CLOSE);


  if (start >= 0 && end > start) {

    return (
      html.slice(0, start) +
      block +
      html.slice(end + SHARE_CARD_META_CLOSE.length)
    );

  }


  const head =
    html.indexOf("</head>");


  if (head < 0) {

    return html;

  }


  return (
    html.slice(0, head) +
    `${block}\n` +
    html.slice(head)
  );

}


/* =========================================================
   _middleware.js 가 부르는 입구

   공개 글 주소의 HTML 에 meta 를 끼워 넣는다. 조회가 실패하면
   원본 HTML 을 그대로 돌려준다(사이트 기본 카드가 남는다).
========================================================== */

export async function injectShareCardMeta(
  html,
  env,
  url
) {

  const match =
    SHARE_CARD_POST_ROUTE.exec(url.pathname);


  if (!match) {

    return html;

  }


  const slug =
    match[1];

  const postId =
    match[2];


  const cacheKey =
    new Request(
      `${url.origin}/__share-card-meta/${slug}/${postId}`,
      { method: "GET" }
    );


  const cache =
    (typeof caches !== "undefined" && caches && caches.default)
      ? caches.default
      : null;


  let context =
    null;

  let fromCache =
    false;


  if (cache) {

    try {

      const hit =
        await cache.match(cacheKey);


      if (hit) {

        context =
          await hit.json();

        fromCache =
          true;

      }

    }

    catch (err) {

      context =
        null;

      fromCache =
        false;

    }

  }


  if (!context) {

    context =
      await loadShareCardPost(env, slug, postId);


    /*
      실패(조회 불가·없는 글)는 캐시하지 않는다 — 글을 방금 공개로
      바꾼 사람이 1분을 기다리게 되지 않도록.
    */

    if (cache && context.ok) {

      try {

        await cache.put(
          cacheKey,
          new Response(
            JSON.stringify(context),
            {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${SHARE_CARD_META_CACHE_SECONDS}`
              }
            }
          )
        );

      }

      catch (err) {

        /* 캐시에 못 넣어도 결과는 같다 */

      }

    }

  }


  /*
    ★ 카드 설정만은 캐시에서 꺼내 쓰지 않는다

    이 캐시는 글에서 온 값(제목 · 카테고리 · 순번)을 60초 아끼려고
    있다. 그런데 카드 설정까지 60초를 물고 있으면, 사용자가 기본
    사진을 저장하고 **바로** 링크를 붙여 넣었을 때 그 사이 크롤러가
    받아가는 og:image 는 아직 옛 v 다. 크롤러는 그 한 번을 자기
    쪽에 오래 담아 두므로, 그 트윗은 옛 카드로 굳는다.

    그래서 적중했으면 설정 한 줄만 다시 읽어 덮는다(질의 하나).
    라벨도 카드 설정(card_label)을 쓰므로 함께 다시 만든다.
  */

  if (fromCache && context.ownerId) {

    const fresh =
      await loadShareCardSettings(env, context.ownerId);


    context.blogTitle =
      fresh.blogTitle;

    context.card =
      fresh.card;


    if (context.ok) {

      context.label =
        resolveShareCardLabel(
          fresh.card.cardLabel,
          context.containerName,
          context.sequence
        );

    }

  }


  /*
    캐시에서 온 값도 정규화된 모양을 유지한다. JSON 을 한 번
    거치면서 모르는 값이 섞였을 수 있으므로, 저장 모양으로
    되돌렸다가(serialize) 다시 정규화한다 — 규칙이 한 쌍의
    함수에만 있다.
  */

  context.card =
    normalizeShareCardSettings(
      serializeShareCardSettings(context.card || {})
    );


  const pageUrl =
    `${url.origin}${url.pathname}`;


  return replaceShareCardMeta(
    html,
    renderShareCardMetaTags(context, url.origin, pageUrl)
  );

}


/* =========================================================
   헤드리스 렌더

   Cloudflare Browser Rendering REST API. 응답이 이미지면 그
   바이트가 카드다. 아니면(설정 없음·권한 없음·타임아웃) 이유를
   달아 실패로 돌려준다 — 호출자가 기본 카드로 내려간다.

   ★ 한 번 실패했다고 기본 카드로 내려가지 않는다 (2026-09-13)

   실측: 같은 공개 글의 같은 카드를 **연달아 새 버전으로** 부르면
   세 번에 한 번쯤 기본 그라데이션이 나왔다. 그 실패는 1초 안에
   돌아온다 — 타임아웃이 아니라 Browser Rendering 이 즉시 돌려준
   오류(한도 초과 등)다. Supabase 읽기는 같은 조건에서 25/25
   정상이었고 저장된 기본 사진 주소도 200 이었다.

   이것이 "설정 미리보기에는 사진이 보이는데 트윗 카드는 기본
   그라데이션"의 정체다. 크롤러는 글을 올린 **그 순간 한 번**
   긁어 간다. 그 한 번이 실패에 걸리면, 주소에 버전이 박혀 있어
   내용이 영영 바뀌지 않으므로(immutable) 그 트윗의 카드는 계속
   기본 그라데이션이다.

   그래서 두 가지를 바꿨다:

     · 일시적 실패(fetch 실패 · 429 · 5xx)는 **다시 시도한다.**
       설정이 없거나(not-configured) 자격 증명이 틀린 것(4xx)은
       다시 시도해도 같으므로 바로 포기한다.
     · 그래도 실패하면 그 응답은 **캐시하지 않는다**(no-store).
       아래 onRequest 참고 — 다음 요청이 다시 시도할 수 있어야
       한다.
========================================================== */

/* 다시 시도할 값어치가 있는 실패인가 */

const SHARE_CARD_RETRY_STATUS =
  new Set([408, 425, 429, 500, 502, 503, 504]);


const SHARE_CARD_RENDER_ATTEMPTS =
  3;


/* 재시도 사이 대기(ms) — 한도 초과가 가라앉을 만큼만 */

/*
  2026-09-13 배포 실측: 실패는 전부 `render-429`(한도 초과)였고, 빠르게
  이어 부르면 성공과 실패가 번갈아 났다 — 한도가 풀리는 데 1초를 훌쩍
  넘는다는 뜻이다. 처음 잡았던 250ms · 750ms 로는 세 번을 1초 안에 다
  써 버려서, 한 번의 크롤에서 건질 수 있는 것을 놓쳤다.

  응답이 Retry-After 를 주면 그 값이 이긴다(아래 shareCardRetryAfterMs).
*/

const SHARE_CARD_RENDER_BACKOFF =
  [1200, 3500];


/*
  재시도에 쓸 시간 상한(ms).

  실패가 **즉시** 돌아오는 경우(측정된 그 경우)에는 세 번이 2초도
  걸리지 않는다. 반대로 렌더가 느려서 실패하는 경우라면 다시 해도
  느릴 것이고, 그동안 크롤러를 붙잡고 있는 것이 기본 카드를 빨리
  주는 것보다 나쁘다. 그래서 이 시간을 넘겼으면 더 시도하지 않는다.
*/

const SHARE_CARD_RENDER_BUDGET =
  15000;


function shareCardRenderIsTransient(
  outcome
) {

  if (outcome.reason === "fetch-failed") {

    return true;

  }


  const status =
    /^render-([0-9]{3})$/.exec(outcome.reason || "");


  return Boolean(status) &&
    SHARE_CARD_RETRY_STATUS.has(Number(status[1]));

}


async function renderShareCardPng(
  env,
  html
) {

  let last =
    {
      ok: false,
      reason: "not-configured"
    };


  const deadline =
    Date.now() + SHARE_CARD_RENDER_BUDGET;


  for (let attempt = 0; attempt < SHARE_CARD_RENDER_ATTEMPTS; attempt += 1) {

    if (attempt > 0) {

      const wait =
        last.retryAfter ||
        SHARE_CARD_RENDER_BACKOFF[attempt - 1] ||
        3500;


      /* 기다린 끝이 예산을 넘으면 기다리지 않고 포기한다 */

      if (Date.now() + wait > deadline) {

        return last;

      }


      await new Promise(
        (resolve) => setTimeout(resolve, wait)
      );

    }


    last =
      await renderShareCardPngOnce(env, html);


    last.attempts =
      attempt + 1;


    if (last.ok || !shareCardRenderIsTransient(last)) {

      return last;

    }

  }


  return last;

}


async function renderShareCardPngOnce(
  env,
  html
) {

  const accountId =
    env && (env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID);

  const token =
    env && (env.CF_BROWSER_RENDERING_TOKEN || env.CLOUDFLARE_API_TOKEN);


  /* 테스트에서 가짜 렌더러를 끼우는 자리(배포에서는 비어 있다) */

  const endpoint =
    (env && env.CF_BROWSER_RENDERING_ENDPOINT) ||
    (
      accountId
        ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`
        : ""
    );


  if (!endpoint || !token) {

    return {
      ok: false,
      reason: "not-configured"
    };

  }


  let response;


  try {

    response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            html,

            viewport: {
              width: SHARE_CARD_WIDTH,
              height: SHARE_CARD_HEIGHT,
              deviceScaleFactor: 1
            },

            /*
              배경 사진과 웹폰트가 실제로 도착한 뒤에 찍는다 —
              networkidle0 이 그 둘을 함께 기다린다.
            */

            gotoOptions: {
              waitUntil: "networkidle0",
              timeout: 20000
            },

            screenshotOptions: {
              type: "png"
            }

          })

        }
      );

  }

  catch (err) {

    return {
      ok: false,
      reason: "fetch-failed"
    };

  }


  const contentType =
    response.headers.get("content-type") || "";


  if (response.ok && contentType.startsWith("image/")) {

    return {
      ok: true,
      bytes: await response.arrayBuffer(),
      contentType: "image/png"
    };

  }


  return {
    ok: false,
    reason: `render-${response.status}`,

    /* 한도 초과면 "언제 다시 오라"는 값이 올 수 있다 */

    retryAfter:
      shareCardRetryAfterMs(response.headers.get("retry-after"))
  };

}


/*
  Retry-After 는 초 단위 숫자이거나 HTTP 날짜다. 둘 다 받고, 우리가
  기다릴 수 있는 범위(재시도 예산)를 넘으면 0 을 준다 — 그때는
  기다리는 것보다 기본 카드를 빨리 주고 다음 요청에 맡기는 편이 낫다.
*/

export function shareCardRetryAfterMs(
  value
) {

  const raw =
    String(value === null || value === undefined ? "" : value).trim();


  if (!raw) {

    return 0;

  }


  const seconds =
    /^[0-9]+$/.test(raw)
      ? Number(raw)
      : (Date.parse(raw) - Date.now()) / 1000;


  if (!Number.isFinite(seconds) || seconds <= 0) {

    return 0;

  }


  const ms =
    Math.ceil(seconds * 1000);


  return ms <= SHARE_CARD_RENDER_BUDGET
    ? ms
    : 0;

}


/* =========================================================
   진단 — 기본 카드로 내려갔으면 **왜** 인지 말한다

   예전에는 네 갈래(비공개 · 주인 없음 · 조회 실패 · 렌더 실패)가
   전부 똑같은 PNG 를 똑같은 헤더로 돌려줬다. 바깥에서 보면
   구분할 방법이 없어서, "카드가 기본 그라데이션으로 나온다"를
   추측으로만 좁혀야 했다.

   그래서 모든 응답에 한 줄을 붙인다:

     X-Imory-Share-Card: render                (방금 그렸다)
     X-Imory-Share-Card: cache                 (캐시에서 그대로)
     X-Imory-Share-Card: fallback:not-public
     X-Imory-Share-Card: fallback:no-owner
     X-Imory-Share-Card: fallback:no-post
     X-Imory-Share-Card: fallback:not-configured
     X-Imory-Share-Card: fallback:render-429   (렌더러가 준 상태)
     X-Imory-Share-Card: fallback:fetch-failed

   그리는 데 성공했을 때는 배경 사진이 실제로 닿는 주소였는지도
   함께 말한다(아래 probeShareCardBackground):

     X-Imory-Share-Card-Background: ok | missing-404 | unreachable | none

   이미지 응답에 붙는 헤더일 뿐이라 카드 그림에는 영향이 없고,
   크롤러도 무시한다. `curl -I` 한 번으로 원인이 보인다.
========================================================== */

const SHARE_CARD_STATUS_HEADER =
  "X-Imory-Share-Card";

const SHARE_CARD_BACKGROUND_HEADER =
  "X-Imory-Share-Card-Background";

const SHARE_CARD_ATTEMPTS_HEADER =
  "X-Imory-Share-Card-Attempts";


/* =========================================================
   배경 사진이 닿는 주소인가

   렌더가 **성공해도** 배경 사진만 못 받아오면 카드는 조용히
   기본 그라데이션 + 글자가 된다(CSS background-image 에는 onerror
   가 없다). 그 경우와 "설정에 사진이 없다"를 바깥에서 구분할 수
   없으면, 지금처럼 "저장은 됐는데 카드에 안 나온다"를 또 추측으로
   좁히게 된다.

   그래서 렌더와 **동시에**(Promise.all) 한 번 찔러 본다. 결과는
   응답 헤더로만 쓰고 카드 내용은 바꾸지 않는다 — 이 확인이 실패해도
   카드는 그대로 나간다.

   닿지 않는 배경으로 그린 카드는 **캐시하지 않는다**(onRequest).
   그 카드를 1년 immutable 로 굳혀 두면, 사진이 돌아와도 그 주소는
   영영 사진 없는 카드다.
========================================================== */

async function probeShareCardBackground(
  url
) {

  if (!url) {

    return "none";

  }


  let response;


  try {

    /* 바이트 전체는 필요 없다 — 닿는지만 본다 */

    response =
      await fetch(url, { method: "HEAD" });

  }

  catch (err) {

    return "unreachable";

  }


  if (response.ok || response.status === 206) {

    return "ok";

  }


  /*
    HEAD 를 거절하는 곳은 판정하지 않는다 — 확인 방법이 없는 것을
    "사진이 없다"로 읽으면 멀쩡한 카드를 캐시하지 않게 된다.
  */

  if (response.status === 405 || response.status === 501) {

    return "ok";

  }


  return `missing-${response.status}`;

}


/* =========================================================
   기본 카드 배달

   /images/share-card-default.png 는 저장소의 정적 자산이다.
   Function 에서 파일 시스템을 읽을 수 없으므로 같은 오리진으로
   한 번 요청해서 흘려보낸다(CDN 에 이미 있는 파일이다).
========================================================== */

async function shareCardDefaultResponse(
  origin,
  cacheControl,
  method,
  reason
) {

  const headers =
    {
      "Content-Type": "image/png",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      [SHARE_CARD_STATUS_HEADER]: `fallback:${reason || "unknown"}`
    };


  try {

    const response =
      await fetch(`${origin}${SHARE_CARD_DEFAULT_IMAGE_PATH}`);


    if (response.ok) {

      const bytes =
        await response.arrayBuffer();


      return new Response(
        method === "HEAD" ? null : bytes,
        {
          status: 200,
          headers
        }
      );

    }

  }

  catch (err) {

    /* 아래 빈 응답으로 떨어진다 */

  }


  return new Response(
    "",
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        [SHARE_CARD_STATUS_HEADER]: `fallback:${reason || "unknown"}:no-default-asset`
      }
    }
  );

}


/* =========================================================
   캐시 — 같은 post + v 는 두 번 그리지 않는다

   주소에 ?v=<버전>이 있으면 그 주소의 내용은 바뀔 수 없다(버전은
   카드 설정 · posts.updated_at · 대표 이미지 유무에서 만든 해시다).
   그래서 **버전이 붙은 요청만** Workers Cache 에 담고, 다음 요청은
   헤드리스 렌더러를 부르지 않는다. 렌더 한 번이 이 엔드포인트에서
   유일하게 비싼 일이다.

   버전이 없는 요청(직접 부른 주소)은 담지 않는다 — 같은 주소의
   내용이 나중에 달라질 수 있는데 공유 캐시에 넣으면 그 주소가
   "내용이 고정된 주소"인 것처럼 굳어 버린다.

   ★ 캐시가 권한 검사를 건너뛰지 않는다

   캐시에 있어도 **매번 지금 이 글이 공개인지 다시 본다.** 값싼
   질의 한 번(posts.visibility)이고, 그 결과가 아니면 캐시에 있던
   바이트를 내보내지 않고 항목도 지운다. functions/api/post-cover.js
   가 "권한은 매번 다시, 바이트는 다시 보내지 않는다"로 잡은 것과
   같은 규칙이다 — 비공개로 바꾸는 순간 그 다음 요청부터 막힌다.

   그래서 순서는 이렇게 고정이다:

     1) 캐시 조회(렌더 전)
     2) 공개 여부 확인      ← 캐시 적중과 무관하게 항상
     3) 적중이면 그 바이트, 아니면 조회 → 렌더 → 저장

   기본 카드로 내려가는 길(비공개 · 렌더 실패 · 설정 없음)은
   **캐시에 담지 않는다.** 담으면 공개로 바꾼 뒤에도 기본 카드가
   계속 나온다.
========================================================== */

function shareCardCacheStore() {

  return (typeof caches !== "undefined" && caches && caches.default)
    ? caches.default
    : null;

}


/*
  글 하나의 "지금" 상태 — 공개인가, 주인이 누구인가.

  이 질의가 캐시 적중 경로의 권한 확인이고, 동시에 캐시 미적중
  경로의 첫 단계다(공개가 아니면 제목 · 카테고리 · 본문 · 대표
  이미지를 아예 조회하지 않는다).

  anon 은 비밀글의 행도 볼 수 있으므로 visibility 를 직접 본다.
  조회가 실패하면 [] 이 와서 isPublic 이 false 가 된다 — 막히는
  쪽으로 틀린다(공개 글이 잠깐 기본 카드로 보이는 것이, 비공개
  글의 카드가 나가는 것보다 낫다).
*/

async function loadShareCardPostOwner(
  env,
  slug,
  postId
) {

  /*
    PUBLIC-NUMBER-1: 번호만으로는 글을 찾을 수 없다 — 먼저 slug 로
    블로그 주인을 정하고, 그 주인 안에서 번호를 본다. 이 순서가
    "남의 블로그 번호로 카드를 받아 가는" 길을 막는다.
  */

  if (!slug) {

    return {
      isPublic: false,
      ownerId: ""
    };

  }


  const profiles =
    await ogSupabaseSelect(
      env,
      `profiles?slug=eq.${encodeURIComponent(slug)}&select=user_id&limit=1`
    );


  const ownerId =
    (profiles[0] && profiles[0].user_id) || "";


  if (!ownerId) {

    return {
      isPublic: false,
      ownerId: ""
    };

  }


  const rows =
    await ogSupabaseSelect(
      env,
      `posts?public_no=eq.${encodeURIComponent(postId)}` +
      `&user_id=eq.${encodeURIComponent(ownerId)}` +
      `&select=user_id,visibility&limit=1`
    );


  const row =
    rows[0];


  return {

    isPublic:
      Boolean(row) && row.visibility === "public",

    ownerId:
      (row && row.user_id) || ""

  };

}


/* =========================================================
   GET /api/og/post?slug=<블로그>&post=<공개 번호>&v=<버전>

   PUBLIC-NUMBER-1 이전에는 slug 를 받지 않고 글 id 하나로 주인을
   거꾸로 찾았다. 지금은 ?post= 가 **그 블로그 안에서만 뜻이 있는
   번호**라(블로그마다 1 부터 다시 센다) 혼자서는 글을 가리키지
   못한다 — slug 와 번호가 한 쌍이어야 한다.
========================================================== */

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
          "Cache-Control": "no-store"
        }
      }
    );

  }


  const url =
    new URL(request.url);


  const postId =
    parseShareCardPostId(url.searchParams.get("post"));


  /*
    PUBLIC-NUMBER-1: slug 가 필수가 됐다. ?post= 는 그 블로그 안의
    공개 번호라 혼자서는 글을 가리키지 못한다 — 둘이 한 쌍이다.
  */

  const slug =
    parseShareCardSlug(url.searchParams.get("slug"));


  if (!postId || !slug) {

    return new Response(
      "",
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  }


  const versioned =
    Boolean(url.searchParams.get("v"));


  /* 버전이 붙은 주소만 캐시한다(위 주석) */

  const cache =
    versioned
      ? shareCardCacheStore()
      : null;


  const cacheKey =
    new Request(url.toString(), { method: "GET" });


  /* 1) 렌더 전에 캐시를 먼저 본다 */

  let cached =
    null;


  if (cache) {

    try {

      cached =
        await cache.match(cacheKey);

    }

    catch (err) {

      /* 캐시를 못 읽어도 계속 진행한다 */

      cached =
        null;

    }

  }


  /*
    2) 캐시 적중 여부와 **무관하게** 지금 공개 상태를 확인한다.
       이 순서를 바꾸면 비공개로 바꾼 글의 카드가 캐시에서 계속
       나간다.
  */

  const owner =
    await loadShareCardPostOwner(env, slug, postId);


  if (!owner.isPublic) {

    /*
      공개였다가 비공개/비밀글이 된 경우. 남아 있던 항목을 지워서
      다시 공개로 바꿀 때 예전 카드가 부활하지 않게 한다(그때는
      버전도 달라지지만, 같은 주소로 직접 부르는 요청도 있다).
    */

    if (cache && cached) {

      try {

        await cache.delete(cacheKey);

      }

      catch (err) {

        /* 못 지워도 위 확인이 매번 막는다 */

      }

    }


    return shareCardDefaultResponse(
      url.origin,
      "public, max-age=300",
      request.method,
      "not-public"
    );

  }


  /* 3) 적중 — 렌더러를 부르지 않고 그 바이트를 그대로 준다 */

  if (cached) {

    const hit =
      new Response(
        request.method === "HEAD" ? null : cached.body,
        {
          status: 200,
          headers: cached.headers
        }
      );


    hit.headers.set(
      SHARE_CARD_STATUS_HEADER,
      "cache"
    );


    return hit;

  }


  const ownerId =
    owner.ownerId;


  if (!ownerId) {

    return shareCardDefaultResponse(
      url.origin,
      "no-store",
      request.method,
      "no-owner"
    );

  }


  /*
    PUBLIC-NUMBER-1: slug 는 이제 요청이 들고 온다 — 주인을 거꾸로
    찾아 slug 를 알아내던 왕복 하나가 없어졌다.
  */

  const cardContext =
    await loadShareCardPost(env, slug, postId);


  /* 공개 글이 아니면 제목도 사진도 쓰지 않는다 */

  if (!cardContext.ok) {

    /*
      공개 확인(loadShareCardPostOwner)은 통과했는데 여기서 못 찾았다
      — 조회가 일시적으로 실패했을 가능성이 크다. 담지 않는다.
    */

    return shareCardDefaultResponse(
      url.origin,
      "no-store",
      request.method,
      "no-post"
    );

  }


  const html =
    buildShareCardHtml({

      card:
        cardContext.card,

      backgroundUrl:
        shareCardBackgroundUrl(cardContext, url.origin),

      title:
        cardContext.title,

      label:
        cardContext.label,

      domain:
        url.hostname

    });


  const backgroundUrl =
    shareCardBackgroundUrl(cardContext, url.origin);


  /*
    렌더와 배경 확인을 함께 보낸다 — 확인 때문에 카드가 늦어지지
    않는다. 결과는 헤더와 캐시 판단에만 쓴다.
  */

  const [rendered, background] =
    await Promise.all([

      renderShareCardPng(env, html),

      probeShareCardBackground(backgroundUrl)

    ]);


  if (!rendered.ok) {

    /*
      ★ 이 응답은 캐시하지 않는다.

      예전에는 `public, max-age=300` 이었다. 그러면 크롤러가 글을
      올린 그 순간 한 번 긁어가다 일시적 실패에 걸렸을 때, 우리
      edge 까지 5분 동안 같은 기본 카드를 돌려줘서 재시도조차
      기본 카드를 받았다. 렌더 실패는 대개 일시적이므로(위
      renderShareCardPng 주석) 다음 요청이 다시 그릴 수 있어야
      한다.

      설정이 아예 없는 경우(not-configured)도 같다 — 환경 변수를
      채우자마자 다음 요청이 진짜 카드를 받는다.
    */

    return shareCardDefaultResponse(
      url.origin,
      "no-store",
      request.method,
      rendered.reason || "render-failed"
    );

  }


  /*
    배경 사진이 있다고 했는데 닿지 않았다 — 그린 카드는 사진 없는
    카드다. 내보내되 굳히지는 않는다(아래 shouldStore).
  */

  const backgroundOk =
    background === "ok" ||
    background === "none";


  const response =
    new Response(
      rendered.bytes,
      {
        status: 200,

        headers: {

          "Content-Type":
            "image/png",

          [SHARE_CARD_STATUS_HEADER]:
            "render",

          [SHARE_CARD_BACKGROUND_HEADER]:
            background,

          [SHARE_CARD_ATTEMPTS_HEADER]:
            String(rendered.attempts || 1),

          /*
            주소에 버전이 붙어 있으면 그 주소의 내용은 바뀔 수
            없다(내용이 바뀌면 버전이 바뀌고, 그러면 다른 주소다).
            그래서 edge 와 크롤러 양쪽에 immutable 로 알린다 —
            같은 카드를 두 번 그리지 않는다.

            버전 없이 직접 부른 주소는 같은 주소의 내용이 나중에
            달라질 수 있으므로 짧게 잡는다(기본 카드와 같은 300초).
          */

          "Cache-Control":
            (versioned && backgroundOk)
              ? "public, max-age=31536000, immutable"
              : "public, max-age=300",

          "X-Content-Type-Options":
            "nosniff"

        }
      }
    );


  /*
    저장 — 버전이 붙은 주소만(cache 가 null 이 아닌 경우가 그때뿐이다).
    다음 요청은 공개 확인 한 번만 하고 이 바이트를 그대로 쓴다.

    배경이 닿지 않은 카드는 담지 않는다 — 사진이 돌아오면 다음
    요청이 제대로 된 카드를 그려야 한다.
  */

  if (cache && backgroundOk) {

    try {

      await cache.put(
        cacheKey,
        response.clone()
      );

    }

    catch (err) {

      /* 캐시에 못 넣어도 이번 응답은 정상이다 */

    }

  }


  if (request.method === "HEAD") {

    return new Response(
      null,
      {
        status: 200,
        headers: response.headers
      }
    );

  }


  return response;

}
