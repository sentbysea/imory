/* =========================================================
   PAGES FUNCTION — GET /api/og/post

   공개 글 하나의 **공유 카드 이미지**(1200 × 628 PNG)를 만들어
   준다. X(Twitter)·카카오톡 같은 크롤러가 og:image 로 받아가는
   주소다.

     /api/og/post?post=<글 id>&v=<버전>

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
     hasCover      공개 글의 대표 이미지(post_covers) 유무
     updatedAt     버전 계산용
     postId        문자열 id
========================================================== */

export async function loadShareCardPost(
  env,
  slug,
  postId
) {

  const empty =
    {
      ok: false,
      slug: slug || "",
      blogTitle: "",
      card: normalizeShareCardSettings(null),
      title: "",
      categoryName: "",
      containerName: "",
      sequence: 0,
      label: "",
      excerpt: "",
      hasCover: false,
      updatedAt: "",
      postId: postId || ""
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
    글 주인까지 조건에 넣는다 — 주소의 slug 와 다른 사람의 글
    id 를 붙여 놓은 요청은 "없는 글"로 끝난다.
  */

  const postQuery =
    `posts?id=eq.${encodeURIComponent(postId)}` +
    `&user_id=eq.${encodeURIComponent(profile.user_id)}`;


  const [settingsRows, postRowsOrNull] =
    await Promise.all([

      ogSupabaseSelect(
        env,
        `site_settings?user_id=eq.${encodeURIComponent(profile.user_id)}` +
        `&key=in.(share_card,blog_title)&select=key,value`
      ),

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


  const settings =
    new Map(
      settingsRows.map((row) => [row.key, row.value])
    );


  const base =
    {
      ...empty,

      blogTitle:
        collapseShareCardText(settings.get("blog_title")),

      card:
        normalizeShareCardSettings(settings.get("share_card"))
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


  const [categoryRows, folderRows, coverRows, contentRows] =
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
        `post_covers?post_id=eq.${encodeURIComponent(postId)}&select=post_id&limit=1`
      ),

      ogSupabaseSelect(
        env,
        `post_contents?post_id=eq.${encodeURIComponent(postId)}&select=content&limit=1`
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

     1) 글 대표 이미지(post_covers) — 공개 글일 때만
     2) 카드 설정의 기본 공유 카드 사진
     3) 없음 → share-card.js 의 서비스 기본 그라데이션

   1) 은 비공개 버킷에 있어서 공개 주소가 없다. 헤드리스 브라우저도
   다른 방문자와 똑같이 **기존 프록시**로 받는다
   (/api/post-cover?post=<id> — 그 프록시가 요청 시점의 공개 상태를
   다시 본다). 버킷 주소나 서명 URL 을 새로 만들지 않는다.
========================================================== */

export function shareCardBackgroundUrl(
  context,
  origin
) {

  if (context.ok && context.hasCover) {

    return `${origin}/api/post-cover?post=${encodeURIComponent(context.postId)}`;

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
      context.hasCover ? "1" : "0",

      /*
        라벨은 글 밖에서도 바뀐다 — 카테고리/폴더 이름을 고치면
        posts.updated_at 은 그대로인데 카드 글자는 달라진다.
      */

      context.label
    ]);


  return (
    `${origin}/api/og/post` +
    `?post=${encodeURIComponent(context.postId)}` +
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


  if (cache) {

    try {

      const hit =
        await cache.match(cacheKey);


      if (hit) {

        context =
          await hit.json();

      }

    }

    catch (err) {

      context =
        null;

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
========================================================== */

async function renderShareCardPng(
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
    reason: `render-${response.status}`
  };

}


/* =========================================================
   기본 카드 배달

   /images/share-card-default.png 는 저장소의 정적 자산이다.
   Function 에서 파일 시스템을 읽을 수 없으므로 같은 오리진으로
   한 번 요청해서 흘려보낸다(CDN 에 이미 있는 파일이다).
========================================================== */

async function shareCardDefaultResponse(
  origin,
  maxAge,
  method
) {

  const headers =
    {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Content-Type-Options": "nosniff"
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
        "Cache-Control": "public, max-age=60"
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
  postId
) {

  const rows =
    await ogSupabaseSelect(
      env,
      `posts?id=eq.${encodeURIComponent(postId)}&select=user_id,visibility&limit=1`
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
   GET /api/og/post?post=<id>&v=<버전>

   slug 를 받지 않는다 — 크롤러가 받아가는 주소를 짧게 유지하고,
   글 id 하나로 주인을 거꾸로 찾는다.
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


  if (!postId) {

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
    await loadShareCardPostOwner(env, postId);


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


    return shareCardDefaultResponse(url.origin, 300, request.method);

  }


  /* 3) 적중 — 렌더러를 부르지 않고 그 바이트를 그대로 준다 */

  if (cached) {

    return request.method === "HEAD"
      ? new Response(null, { status: 200, headers: cached.headers })
      : cached;

  }


  const ownerId =
    owner.ownerId;


  if (!ownerId) {

    return shareCardDefaultResponse(url.origin, 300, request.method);

  }


  const profiles =
    await ogSupabaseSelect(
      env,
      `profiles?user_id=eq.${encodeURIComponent(ownerId)}&select=slug&limit=1`
    );


  const slug =
    profiles[0] && profiles[0].slug;


  const cardContext =
    await loadShareCardPost(env, slug, postId);


  /* 공개 글이 아니면 제목도 사진도 쓰지 않는다 */

  if (!cardContext.ok) {

    return shareCardDefaultResponse(url.origin, 300, request.method);

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


  const rendered =
    await renderShareCardPng(env, html);


  if (!rendered.ok) {

    /*
      설정이 아직 없거나 렌더가 실패했다. 기본 카드를 짧게 캐시해서
      설정이 채워지면 곧 실제 카드로 바뀌게 한다.
    */

    return shareCardDefaultResponse(url.origin, 300, request.method);

  }


  const response =
    new Response(
      rendered.bytes,
      {
        status: 200,

        headers: {

          "Content-Type":
            "image/png",

          /*
            주소에 버전이 붙어 있으면 그 주소의 내용은 바뀔 수
            없다(내용이 바뀌면 버전이 바뀌고, 그러면 다른 주소다).
            그래서 edge 와 크롤러 양쪽에 immutable 로 알린다 —
            같은 카드를 두 번 그리지 않는다.

            버전 없이 직접 부른 주소는 같은 주소의 내용이 나중에
            달라질 수 있으므로 짧게 잡는다(기본 카드와 같은 300초).
          */

          "Cache-Control":
            versioned
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
  */

  if (cache) {

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
