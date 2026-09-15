/* =========================================================
   CORE - PUBLIC URL NUMBER (PUBLIC-NUMBER-1)

   공개 주소에 쓰는 번호와 DB 의 PK 를 잇는 유일한 지점.

   기준 문서: IMORY_PUBLIC_NUMBER_DESIGN.md
   DB:        supabase/migrations/20260915100000_public_numbers_for_categories_and_posts.sql

   ★ 왜 두 가지 번호가 있는가

   공개 주소는 이제 PK 를 드러내지 않는다:

     /:slug/category/:public_no      categories.public_no
     /:slug/post/:public_no          posts.public_no

   public_no 는 **블로그마다 1 부터** 다시 센다. 그래서 이 번호
   하나만으로는 행을 특정할 수 없다 — 언제나 (블로그 주인 user_id,
   public_no) 두 값이 한 쌍이다. 반대로 DB 안쪽(posts.category_id,
   post_folders.category_id, post_highlights.post_id …)은 전부
   예전 그대로 id 를 쓴다. 이 파일은 그 두 세계를 오가는 환전소다.

   ★ 왕복을 줄이는 방법 — 표

   화면을 그리기 전에 우리는 거의 언제나 행을 이미 읽었다(목록·
   상세·Skin Context 가 id 와 public_no 를 같이 select 한다). 그래서
   본 행을 전부 표에 적어 두고, 주소를 만들 때는 그 표를 먼저
   본다. 표에 없을 때만 DB 에 한 번 물어본다.

   표는 페이지 로드 동안만 산다(새로고침하면 사라진다). 틀린 값이
   남을 위험이 없는 이유는 public_no 가 **불변**이기 때문이다 —
   DB 트리거가 UPDATE 를 되돌린다(위 migration 5절).

   ★ 없는 번호는 404 다

   resolve* 가 null 을 돌려주면 그 번호를 가진 행이 이 블로그에
   없다는 뜻이다. 다른 블로그의 같은 번호로 넘어가지 않는다 —
   질의에 언제나 user_id 가 함께 들어간다.

   의존: supabaseClient(core/lib/supabase-client.js),
         getSiteOwner(home/site-owner.js) — 둘 다 **함수 안에서만**
         쓰므로 로드 순서는 "이 파일을 부르는 코드보다 앞"이면
         된다(index.html 참고).
========================================================== */


const PUBLIC_NO_CATEGORY =
  "category";

const PUBLIC_NO_POST =
  "post";


/*
  없는 공개 번호를 받았을 때 화면 쪽에 그대로 넘기는 내부 id.

  identity 는 1 부터 시작하므로 id 가 0 인 행은 존재할 수 없다.
  그래서 이 값을 넘기면 기존 화면의 "없는 글/없는 카테고리" 처리
  경로(posts-view-detail.js 의 "post not found",
  posts-view-list.js 의 category === null)가 **그대로** 탄다 —
  404 전용 화면을 새로 만들지 않는다.

  다른 사용자의 같은 번호로 넘어가지 않는다는 것이 핵심이다:
  조회 자체가 (user_id, public_no) 한 쌍으로만 이뤄지므로, 이
  블로그에 그 번호가 없으면 남의 글이 아니라 이 값이 나온다.
*/

const PUBLIC_NO_MISSING_ID =
  0;


/*
  자원 이름 -> 실제 테이블. DB 트리거의 resource 값과 같은 문자열을
  쓴다(migration 1절의 check 제약).
*/

const PUBLIC_NO_TABLES = {
  category: "categories",
  post: "posts"
};


/*
  표는 두 방향이고, 두 방향의 안전 조건이 다르다.

    id -> public_no     kind -> Map(id -> no)
                        id 는 DB 전체에서 유일한 PK 라 주인을 나눌
                        필요가 없다. 어떤 id 든 짝이 되는 번호는
                        하나뿐이다.

    public_no -> id     kind -> ownerKey -> Map(no -> id)
                        번호는 블로그마다 1 부터 다시 세므로 **반드시**
                        주인별로 갈라야 한다. 이 칸을 하나로 합치면
                        다른 블로그의 1 번 글이 열린다.

  ownerKey 는 ownerId 문자열이고, unscoped 배포(주소에 slug 가 없는
  레거시)에서는 빈 문자열이다.
*/

const publicNoById =
  new Map();

const publicNoByNo =
  new Map();


function publicNoIdMap(
  kind
) {

  let map =
    publicNoById.get(kind);


  if (!map) {

    map =
      new Map();

    publicNoById.set(
      kind,
      map
    );

  }


  return map;

}


function publicNoNoMap(
  kind,
  ownerId
) {

  let byKind =
    publicNoByNo.get(kind);


  if (!byKind) {

    byKind =
      new Map();

    publicNoByNo.set(
      kind,
      byKind
    );

  }


  const ownerKey =
    ownerId || "";


  let map =
    byKind.get(ownerKey);


  if (!map) {

    map =
      new Map();

    byKind.set(
      ownerKey,
      map
    );

  }


  return map;

}


function toPublicNoInteger(
  value
) {

  const numeric =
    Number(value);


  return (
    Number.isInteger(numeric) &&
    numeric >= 1
      ? numeric
      : null
  );

}


/* =========================================================
   표에 적기

   행을 읽은 쪽이 부른다. id 와 public_no 가 둘 다 있는 행만
   의미가 있고, 나머지는 조용히 무시한다 — 호출자가 매번
   방어 코드를 쓰지 않게 한다.
========================================================== */

function rememberPublicNo(
  kind,
  ownerId,
  internalId,
  publicNo
) {

  const id =
    toPublicNoInteger(internalId);

  const no =
    toPublicNoInteger(publicNo);


  if (!id || !no) {

    return;

  }


  publicNoIdMap(
    kind
  ).set(id, no);


  publicNoNoMap(
    kind,
    ownerId
  ).set(no, id);

}


/*
  목록 한 뭉치를 한 번에. select 에 public_no 를 넣은 모든 조회가
  결과를 받자마자 이 함수를 부른다.
*/

function rememberPublicNoRows(
  kind,
  ownerId,
  rows
) {

  if (!Array.isArray(rows)) {

    return rows;

  }


  rows.forEach(
    (row) => {

      if (row) {

        rememberPublicNo(
          kind,
          ownerId,
          row.id,
          row.public_no
        );

      }

    }
  );


  return rows;

}


/* =========================================================
   표에서 읽기 (동기)

   못 찾으면 null 이다 — 호출자는 아래 async 쪽으로 넘어간다.
========================================================== */

/*
  내부 id -> 공개 번호. 주인을 받지 않는다 — id 가 이미 DB 전체에서
  유일하다(위 표 주석).
*/

function publicNoForId(
  kind,
  internalId
) {

  const id =
    toPublicNoInteger(internalId);


  if (!id) {

    return null;

  }


  return (
    publicNoIdMap(kind).get(id) ||
    null
  );

}


/*
  공개 번호 -> 내부 id. 이쪽은 주인이 반드시 필요하다.
*/

function internalIdForPublicNo(
  kind,
  ownerId,
  publicNo
) {

  const no =
    toPublicNoInteger(publicNo);


  if (!no) {

    return null;

  }


  return (
    publicNoNoMap(
      kind,
      ownerId
    ).get(no) || null
  );

}


/* =========================================================
   DB 에 물어보기

   두 방향 모두 **같은 한 쌍**(user_id, public_no)을 쓴다. scoped
   배포에서는 언제나 user_id 로 좁힌다.

   unscoped 배포(주소에 slug 가 없는 레거시 단일 사용자 배포)에는
   좁힐 주인이 없다. 그때는 좁히지 않고 읽되, 두 행 이상이 걸리면
   **찾지 못한 것으로 친다** — 아무거나 하나를 고르면 남의 글이
   열린다.
========================================================== */

async function publicNoOwnerScope() {

  try {

    const owner =
      typeof getSiteOwner === "function"
        ? await getSiteOwner()
        : null;


    if (!owner) {

      return {
        ok: true,
        scoped: false,
        ownerId: null
      };

    }


    /*
      slug 는 있는데 그 주인을 못 찾은 경우다(없는 블로그).
      아무것도 열면 안 된다.
    */

    if (owner.scoped && !owner.ownerId) {

      return {
        ok: false,
        scoped: true,
        ownerId: null
      };

    }


    return {
      ok: true,
      scoped: Boolean(owner.scoped),
      ownerId: owner.ownerId || null
    };

  }

  catch (err) {

    return {
      ok: false,
      scoped: true,
      ownerId: null
    };

  }

}


async function queryPublicNoRow(
  kind,
  scope,
  column,
  value
) {

  const table =
    PUBLIC_NO_TABLES[kind];


  if (!table) {

    return null;

  }


  let query =
    supabaseClient
      .from(table)
      .select("id, public_no")
      .eq(column, value)
      .limit(2);


  if (scope.scoped) {

    query =
      query.eq(
        "user_id",
        scope.ownerId
      );

  }


  const {
    data,
    error
  } =
    await query;


  if (error) {

    console.error(
      "[public-number] " + table + " 공개 번호 조회 실패:",
      error
    );


    return null;

  }


  /*
    scoped 배포에서는 (user_id, public_no) UNIQUE 라 두 행이
    나올 수 없다. 나왔다면 unscoped 배포이고, 그때는 고르지
    않는다(위 주석).
  */

  if (!data || data.length !== 1) {

    return null;

  }


  rememberPublicNo(
    kind,
    scope.ownerId,
    data[0].id,
    data[0].public_no
  );


  return data[0];

}


/*
  공개 번호 -> 내부 id. 없는 번호면 null(= 404).
*/

async function resolvePublicNoToId(
  kind,
  publicNo
) {

  const scope =
    await publicNoOwnerScope();


  if (!scope.ok) {

    return null;

  }


  return resolvePublicNoToIdInScope(
    kind,
    scope,
    publicNo
  );

}


/*
  주인을 **명시적으로** 받는 변형.

  Skin Studio 에는 home/site-owner.js 가 없다(주소에 slug 가 없는
  관리 화면이다). 그런데 Preview 의 가상 이동은 공개 화면과 같은
  주소 모양(/:slug/post/:public_no)을 쓰므로 같은 환전이 필요하다 —
  그때 "누구의 번호인가"를 호출자가 준다
  (studio/preview/preview-navigation.js).
*/

async function resolvePublicNoToIdForOwner(
  kind,
  ownerId,
  publicNo
) {

  if (!ownerId) {

    return null;

  }


  return resolvePublicNoToIdInScope(
    kind,
    {
      ok: true,
      scoped: true,
      ownerId
    },
    publicNo
  );

}


async function resolvePublicNoToIdInScope(
  kind,
  scope,
  publicNo
) {

  const no =
    toPublicNoInteger(publicNo);


  if (!no) {

    return null;

  }


  const cached =
    internalIdForPublicNo(
      kind,
      scope.ownerId,
      no
    );


  if (cached) {

    return cached;

  }


  const row =
    await queryPublicNoRow(
      kind,
      scope,
      "public_no",
      no
    );


  return (
    row
      ? toPublicNoInteger(row.id)
      : null
  );

}


/*
  내부 id -> 공개 번호. 표에 없으면 한 번 물어본다.
*/

async function resolveIdToPublicNo(
  kind,
  internalId
) {

  const id =
    toPublicNoInteger(internalId);


  if (!id) {

    return null;

  }


  const cached =
    publicNoForId(
      kind,
      id
    );


  if (cached) {

    return cached;

  }


  const scope =
    await publicNoOwnerScope();


  if (!scope.ok) {

    return null;

  }


  const row =
    await queryPublicNoRow(
      kind,
      scope,
      "id",
      id
    );


  return (
    row
      ? toPublicNoInteger(row.public_no)
      : null
  );

}


/* =========================================================
   주소 조각 만들기

   호출자는 이 결과를 buildSitePath()/buildPostRoute()에 그대로
   넘긴다. 예전에 문자열 템플릿으로 `/post/${post.id}` 라고 쓰던
   자리가 전부 이 함수로 바뀌었다 — 내부 id 를 주소에 적는 곳이
   저장소에 하나도 남지 않게 하기 위해서다.

   못 찾으면 null 이다. 호출자는 그 링크를 만들지 않거나(스킨의
   <a href> 는 그냥 비운다) 홈으로 보낸다.
========================================================== */

async function publicCategoryRoute(
  categoryId
) {

  const no =
    await resolveIdToPublicNo(
      PUBLIC_NO_CATEGORY,
      categoryId
    );


  return (
    no
      ? `/category/${no}`
      : null
  );

}


async function publicPostRoute(
  postId
) {

  const no =
    await resolveIdToPublicNo(
      PUBLIC_NO_POST,
      postId
    );


  return (
    no
      ? `/post/${no}`
      : null
  );

}


async function publicFolderRoute(
  categoryId,
  folderId
) {

  const categoryRoute =
    await publicCategoryRoute(
      categoryId
    );


  const folder =
    toPublicNoInteger(folderId);


  return (
    categoryRoute && folder
      ? `${categoryRoute}/folder/${folder}`
      : null
  );

}


/*
  행을 이미 손에 들고 있을 때(목록의 item, 상세의 post row) 쓰는
  동기 버전. row.public_no 가 있으면 왕복이 아예 없다.
*/

function publicRouteFromRow(
  kind,
  row
) {

  return publicRouteFromNo(
    kind,
    row
      ? row.public_no
      : null
  );

}


/*
  표에 이미 적혀 있는 것이 확실할 때 쓰는 동기 버전(이 글을 방금
  연 화면의 메뉴·공유 링크 등). 표에 없으면 null 이고, 호출자는
  그 링크를 만들지 않는다 — 여기서 몰래 DB 를 두드리지 않는다
  (동기 함수가 갑자기 네트워크를 타면 호출자가 예측할 수 없다).
*/

function publicRouteForKnownId(
  kind,
  internalId
) {

  return publicRouteFromNo(
    kind,
    publicNoForId(
      kind,
      internalId
    )
  );

}


function publicRouteFromNo(
  kind,
  publicNo
) {

  const no =
    toPublicNoInteger(publicNo);


  if (!no) {

    return null;

  }


  return (
    kind === PUBLIC_NO_POST
      ? `/post/${no}`
      : `/category/${no}`
  );

}


/*
  주소에서 읽어낸 공개 번호를 화면이 쓸 내부 id 로. 없는 번호면
  PUBLIC_NO_MISSING_ID 다 — 호출자는 분기 없이 그대로 넘기면
  기존 "없음" 경로가 탄다(위 상수 주석).
*/

async function publicNoToScreenId(
  kind,
  publicNo
) {

  const id =
    await resolvePublicNoToId(
      kind,
      publicNo
    );


  return (
    id || PUBLIC_NO_MISSING_ID
  );

}


/* 주인을 명시적으로 받는 변형(Skin Studio Preview) */

async function publicNoToScreenIdForOwner(
  kind,
  ownerId,
  publicNo
) {

  const id =
    await resolvePublicNoToIdForOwner(
      kind,
      ownerId,
      publicNo
    );


  return (
    id || PUBLIC_NO_MISSING_ID
  );

}


/* sandbox host 등 ES 모듈 쪽에서도 집어 갈 수 있게 */

if (typeof window !== "undefined") {

  window.rememberPublicNo =
    rememberPublicNo;

  window.rememberPublicNoRows =
    rememberPublicNoRows;

  window.publicCategoryRoute =
    publicCategoryRoute;

  window.publicPostRoute =
    publicPostRoute;

  window.publicFolderRoute =
    publicFolderRoute;

  window.resolvePublicNoToId =
    resolvePublicNoToId;

  window.resolveIdToPublicNo =
    resolveIdToPublicNo;

  window.publicNoToScreenId =
    publicNoToScreenId;

  window.publicNoToScreenIdForOwner =
    publicNoToScreenIdForOwner;

  window.resolvePublicNoToIdForOwner =
    resolvePublicNoToIdForOwner;

  window.publicRouteFromRow =
    publicRouteFromRow;

  window.publicRouteForKnownId =
    publicRouteForKnownId;

}
