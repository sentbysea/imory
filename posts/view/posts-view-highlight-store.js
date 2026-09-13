/* =========================================================
   POSTS VIEW — 하이라이트 저장소 (HIGHLIGHT-1)

   하이라이트/메모를 DB와 주고받는 **유일한** 곳. 화면(뷰어, 말풍선,
   메모 카테고리)은 전부 이 파일을 통해서만 읽고 쓴다 — 그래서 한쪽에서
   고친 내용이 다른 쪽에도 그대로 반영된다(요구사항 6 마지막 줄).

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §4
   DB:       supabase/migrations/20260913100000_post_highlights_and_memo_folders.sql


   ★ 권한은 여기서 정하지 않는다

   이 파일은 "주인장인가"를 화면 표시 용도로만 물어본다. 실제 경계는
   전부 DB에 있다 — 읽기는 post_highlights의 SELECT 정책(공개 글이거나
   내 글일 때만), 쓰기는 소유자 전용 RPC 4개다. 여기서 검사를 빼먹어도
   방문자가 남의 비밀글 발췌문을 받아가거나 남의 글에 하이라이트를
   붙일 수 없다(요구사항 10 마지막 줄, 11).

   ★ 비밀글

   방문자가 비밀번호를 맞힌 뒤에만 그 글의 하이라이트를 받을 수 있다.
   그 경로는 get_secret_post_highlights(post_id, password) RPC 하나뿐이고,
   그 함수는 비밀번호 대조를 직접 하지 않고 원문과 **같은 문**
   (get_secret_post_content)을 통과했는지만 본다.

   ★ 중복 저장 방지

   같은 범위를 두 번 저장하는 요청이 겹치지 않도록, 저장 중인 동안은
   같은 글에 대한 다음 저장 요청을 막는다(postHighlightSaveInFlight).
   그래도 두 창에서 동시에 누르면 DB의 unique index와 save RPC의 겹침
   판정이 마지막 방어선이다(요구사항 8).

   classic script. core/lib/supabase-client.js 뒤에 로드된다.
========================================================== */


/* 테이블에서 직접 읽는 컬럼(GRANT된 것만) */

const POST_HIGHLIGHT_SELECT_COLUMNS =
  "id, post_id, color, excerpt, prefix, suffix, text_start, note, created_at, updated_at";


/*
  지금 열려 있는 글의 하이라이트. 화면 여러 곳이 같은 배열을 본다.
  { postId, items, status }

  ★ status — "빈 목록"과 "못 읽었다"를 구분한다

  migration이 적용되지 않은 배포나 일시적인 조회 실패에서도 글은
  그대로 열려야 한다. 그렇다고 그 화면이 "저장된 하이라이트가 없다"가
  되면 안 된다 — 주인장이 그 위에 새 하이라이트를 그으면 실제로는
  겹치는 것을 못 보고 저장하게 되고, 메모가 사라진 것처럼 보인다.
  그래서 실패를 값으로 남긴다.

    "idle"   아직 아무 글도 읽지 않았다
    "ok"     읽었다(items가 그 글의 전부다. 빈 배열이면 정말 없다)
    "failed" 읽지 못했다(items는 빈 배열이지만 "없다"는 뜻이 아니다)

  방문자 화면은 이 값으로 아무것도 하지 않는다 — 하이라이트가 안
  보일 뿐이고, DB 오류 문구를 방문자에게 보여주지 않는다. 주인장이
  기능을 쓰려는 순간(하이라이팅 모드)에만 "지금은 쓸 수 없다 +
  다시 시도"를 알린다.
*/

let postHighlightCache =
  {
    postId: null,

    items: [],

    status:
      "idle"
  };


let postHighlightSaveInFlight =
  false;


/* 하이라이트가 바뀔 때 화면들이 다시 그리도록 알린다 */

const POST_HIGHLIGHT_CHANGE_EVENT =
  "imory:post-highlights-changed";


function emitPostHighlightChange(
  detail
) {

  try {

    window.dispatchEvent(
      new CustomEvent(
        POST_HIGHLIGHT_CHANGE_EVENT,
        {
          detail:
            detail ||
            {}
        }
      )
    );

  }

  catch (err) {

    /* 이벤트를 못 보내도 화면 하나는 이미 직접 갱신돼 있다 */

  }

}


/*
  DB 행 → 화면이 쓰는 모양. snake_case를 한 군데에서만 만난다.
*/

function normalizePostHighlightRow(
  row
) {

  if (!row) {

    return null;

  }


  return {

    id:
      String(row.id),

    postId:
      row.post_id === null || row.post_id === undefined
        ? null
        : Number(row.post_id),

    color:
      typeof row.color === "string"
        ? row.color
        : "#f6e0c8",

    excerpt:
      typeof row.excerpt === "string"
        ? row.excerpt
        : "",

    prefix:
      typeof row.prefix === "string"
        ? row.prefix
        : "",

    suffix:
      typeof row.suffix === "string"
        ? row.suffix
        : "",

    textStart:
      Number(row.text_start) || 0,

    note:
      typeof row.note === "string" && row.note
        ? row.note
        : "",

    createdAt:
      row.created_at ||
      null,

    updatedAt:
      row.updated_at ||
      null

  };

}



/* =========================================================
   읽기 — 한 글
========================================================== */

async function loadPostHighlights(
  postId,
  options = {}
) {

  const numericId =
    Number(postId);


  if (!Number.isFinite(numericId)) {

    postHighlightCache =
      {
        postId: null,

        items: [],

        status:
          "idle"
      };


    return postHighlightCache.items;

  }


  let rows =
    [];


  try {

    if (options.secretPassword) {

      /*
        비밀글을 비밀번호로 연 방문자. 테이블 직접 조회는 RLS가
        막으므로(공개 글이 아니다) 이 RPC 하나뿐이다.
      */

      const {
        data,
        error
      } =
        await supabaseClient
          .rpc(
            "get_secret_post_highlights",
            {
              p_post_id:
                numericId,

              p_password:
                options.secretPassword
            }
          );


      if (error) {

        throw error;

      }


      rows =
        Array.isArray(data)
          ? data
          : [];

    }

    else {

      /*
        posts(updated_at)을 함께 받는다 — 이번 판정 결과를 적을 때
        "어느 본문에 대한 판정인가"를 같이 적기 위해서다. 그 컬럼의
        SELECT 권한이 아직 없는 배포에서는 이 쿼리가 통째로 실패하니
        한 번 더, 그 부분만 빼고 물어본다(메모 목록과 같은 규칙).

        하이라이트가 하나도 없는 글에서는 행이 오지 않아 시각도
        알 수 없다 — 그때는 적을 판정 자체가 없으므로 상관없다.
      */

      const runQuery =
        (withPostStamp) =>
          supabaseClient
            .from(
              "post_highlights"
            )
            .select(
              withPostStamp
                ? POST_HIGHLIGHT_SELECT_COLUMNS + ", posts!inner (updated_at)"
                : POST_HIGHLIGHT_SELECT_COLUMNS
            )
            .eq(
              "post_id",
              numericId
            )
            .order(
              "text_start",
              {
                ascending: true
              }
            );


      let {
        data,
        error
      } =
        await runQuery(true);


      if (error) {

        const retry =
          await runQuery(false);


        if (!retry.error) {

          data =
            retry.data;

          error =
            null;

        }

      }


      if (error) {

        throw error;

      }


      rows =
        Array.isArray(data)
          ? data
          : [];

    }

  }

  catch (err) {

    /*
      migration이 적용되지 않은 배포(테이블/RPC 없음)에서도 글은
      그대로 열려야 한다 — 하이라이트만 없는 화면이 된다.

      다만 그것을 "저장된 항목이 없다"로 남기지는 않는다. status를
      "failed"로 적어 두면 (1) 이번 화면의 판정 결과를 기록하지 않고
      (없는 것을 "못 찾았다"로 적지 않는다), (2) 주인장이 하이라이팅
      모드를 켤 때 지금은 쓸 수 없다고 알릴 수 있다.
    */

    console.warn(
      "[post-highlights] 불러오기 실패:",
      err
    );


    postHighlightCache =
      {
        postId: numericId,

        items: [],

        status:
          "failed"
      };


    return postHighlightCache.items;

  }


  /*
    함께 실려 온 글 수정 시각(있으면). 행마다 같은 값이라 첫 행에서
    읽는다. 비밀글 RPC 경로와 하이라이트가 없는 글에서는 null이고,
    그때는 판정 기록에 시각이 비어 대조를 건너뛴다.
  */

  const postStamp =
    rows.reduce(
      (found, row) => {

        if (found) {

          return found;

        }


        const embedded =
          Array.isArray(row.posts)
            ? row.posts[0]
            : row.posts;


        return embedded?.updated_at || null;

      },
      null
    );


  postHighlightCache =
    {
      postId: numericId,

      items:
        rows
          .map(normalizePostHighlightRow)
          .filter(Boolean),

      postUpdatedAt:
        postStamp,

      status:
        "ok"
    };


  return postHighlightCache.items;

}


function getCachedPostHighlights(
  postId
) {

  if (
    postId !== undefined &&
    Number(postId) !== postHighlightCache.postId
  ) {

    return [];

  }


  return postHighlightCache.items;

}


function getCachedPostHighlightById(
  id
) {

  return (
    postHighlightCache.items.find(
      (item) =>
        item.id === String(id)
    ) ||
    null
  );

}


function clearPostHighlightCache() {

  postHighlightCache =
    {
      postId: null,

      items: [],

      status:
        "idle"
    };

}


/*
  이 글의 하이라이트를 실제로 읽어 왔는가 — "ok" | "failed" | "idle".
  화면이 "없다"와 "못 읽었다"를 구분해 말하기 위한 유일한 근거다.
*/

function getPostHighlightLoadStatus(
  postId
) {

  if (
    postId !== undefined &&
    Number(postId) !== postHighlightCache.postId
  ) {

    return "idle";

  }


  return postHighlightCache.status || "idle";

}


/*
  방금 읽은 목록과 함께 온 글 수정 시각(모르면 null).
  판정 결과를 적을 때 "어느 본문에 대한 판정인가"로 쓴다.
*/

function getCachedPostHighlightPostStamp(
  postId
) {

  if (
    postId !== undefined &&
    Number(postId) !== postHighlightCache.postId
  ) {

    return null;

  }


  return postHighlightCache.postUpdatedAt || null;

}



/* =========================================================
   쓰기 — 전부 소유자 전용 RPC

   돌려주는 모양은 항상 { ok, ... } 다. 예외를 던지지 않는 이유는
   호출하는 쪽이 "실패했는데 성공처럼 보이는" 화면을 만들지 않도록
   결과를 반드시 보게 하기 위해서다(요구사항 8 마지막 줄).
========================================================== */

/*
  savePostHighlight({ postId, color, anchor, note })
    -> { ok: true, id, status }            status: created | recolored
     | { ok: false, reason: "overlap" }    부분 겹침 — 저장하지 않았다
     | { ok: false, reason: "busy" }
     | { ok: false, reason: "error", error }
*/

async function savePostHighlight(
  input
) {

  if (postHighlightSaveInFlight) {

    return {
      ok: false,

      reason:
        "busy"
    };

  }


  postHighlightSaveInFlight =
    true;


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "save_own_post_highlight",
          {
            p_post_id:
              Number(input.postId),

            p_color:
              String(input.color || "").toLowerCase(),

            p_excerpt:
              input.anchor.excerpt,

            p_prefix:
              input.anchor.prefix || "",

            p_suffix:
              input.anchor.suffix || "",

            p_text_start:
              Number(input.anchor.textStart) || 0,

            p_note:
              input.note ||
              null
          }
        );


    if (error) {

      if (
        String(error.message || "").includes(
          "highlight_overlap"
        ) ||
        error.code === "23505"
      ) {

        return {
          ok: false,

          reason:
            "overlap"
        };

      }


      return {
        ok: false,

        reason:
          "error",

        error
      };

    }


    const row =
      Array.isArray(data)
        ? data[0]
        : data;


    const id =
      row && row.id
        ? String(row.id)
        : null;


    const status =
      row && row.status
        ? String(row.status)
        : "created";


    if (!id) {

      return {
        ok: false,

        reason:
          "error"
      };

    }


    /* 캐시를 바로 맞춘다 — 다시 조회하지 않는다 */

    const existing =
      getCachedPostHighlightById(id);


    if (existing) {

      existing.color =
        String(input.color || "").toLowerCase();

    }

    else {

      postHighlightCache.items.push({
        id,

        postId:
          Number(input.postId),

        color:
          String(input.color || "").toLowerCase(),

        excerpt:
          input.anchor.excerpt,

        prefix:
          input.anchor.prefix || "",

        suffix:
          input.anchor.suffix || "",

        textStart:
          Number(input.anchor.textStart) || 0,

        note:
          input.note || "",

        createdAt:
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString()
      });


      postHighlightCache.items.sort(
        (a, b) =>
          a.textStart - b.textStart
      );

    }


    emitPostHighlightChange({
      postId:
        Number(input.postId),

      id,

      kind:
        status
    });


    return {
      ok: true,

      id,

      status
    };

  }

  catch (err) {

    return {
      ok: false,

      reason:
        "error",

      error: err
    };

  }

  finally {

    postHighlightSaveInFlight =
      false;

  }

}


async function updatePostHighlightColor(
  id,
  color
) {

  try {

    const {
      error
    } =
      await supabaseClient
        .rpc(
          "update_own_post_highlight_color",
          {
            p_id:
              String(id),

            p_color:
              String(color || "").toLowerCase()
          }
        );


    if (error) {

      return {
        ok: false,

        error
      };

    }


    const cached =
      getCachedPostHighlightById(id);


    if (cached) {

      cached.color =
        String(color || "").toLowerCase();

    }


    emitPostHighlightChange({
      id:
        String(id),

      kind:
        "color"
    });


    return {
      ok: true
    };

  }

  catch (err) {

    return {
      ok: false,

      error: err
    };

  }

}


/*
  note에 빈 값을 주면 "메모만 지우기"다 — 하이라이트와 카드는 남는다
  (요구사항 6).
*/

async function updatePostHighlightNote(
  id,
  note
) {

  try {

    const {
      error
    } =
      await supabaseClient
        .rpc(
          "update_own_post_highlight_note",
          {
            p_id:
              String(id),

            p_note:
              note ||
              null
          }
        );


    if (error) {

      return {
        ok: false,

        error
      };

    }


    const cached =
      getCachedPostHighlightById(id);


    if (cached) {

      cached.note =
        note ||
        "";

    }


    emitPostHighlightChange({
      id:
        String(id),

      kind:
        "note"
    });


    return {
      ok: true
    };

  }

  catch (err) {

    return {
      ok: false,

      error: err
    };

  }

}


async function deletePostHighlight(
  id
) {

  try {

    const {
      error
    } =
      await supabaseClient
        .rpc(
          "delete_own_post_highlight",
          {
            p_id:
              String(id)
          }
        );


    if (error) {

      return {
        ok: false,

        error
      };

    }


    postHighlightCache.items =
      postHighlightCache.items.filter(
        (item) =>
          item.id !== String(id)
      );


    emitPostHighlightChange({
      id:
        String(id),

      kind:
        "deleted"
    });


    return {
      ok: true
    };

  }

  catch (err) {

    return {
      ok: false,

      error: err
    };

  }

}



/* =========================================================
   "원문에서 위치를 찾았는가" 기록 — 세 가지 상태

   판정 자체는 글을 열 때 정확히 이뤄진다(posts-view-highlight-anchor.js).
   메모 카테고리는 카드 수만큼의 본문을 다시 받아 판정할 수 없으므로
   (그건 카드 한 장마다 원문 한 벌을 더 받는 일이다), **마지막으로
   그 글을 열었을 때** 확인된 결과를 이 브라우저에 적어 두고 카드에
   표시한다.

   ★ "모른다"와 "찾았다"와 "못 찾았다"는 서로 다른 상태다

   예전에는 "못 찾은 id 목록" 하나만 두고 그 안에 없으면 전부
   "정상"으로 그렸다. 그러면 한 번도 열어 본 적 없는 글의 카드가
   **확인된 정상**처럼 보인다 — 다른 기기에서 만든 카드가 전부
   그렇다. 그래서 상태를 셋으로 나눈다.

     unknown  아직 확인하지 않음 (이 기기에서 그 글을 연 적이 없거나,
              연 뒤에 본문이 수정됐거나, 그 카드가 확인 뒤에 생겼다)
     found    마지막 확인에서 본문의 그 자리를 찾았다
     missing  마지막 확인에서 찾지 못했다(원문이 바뀌었을 가능성)

   어느 쪽이든 발췌문·메모·카드는 그대로 보존된다. 이 값은 표시일
   뿐이고 데이터를 지우지 않는다.

   ★ 본문이 수정되면 기록은 그 순간 무효다

   기록에는 확인 당시의 **글 수정 시각**(posts.updated_at)을 함께
   적는다. 지금 글의 수정 시각이 그때와 다르면 그 기록은 "이전
   본문에 대한 결과"이므로 그대로 쓰지 않고 unknown으로 돌린다 —
   글을 고쳤는데 예전 판정이 현재 상태인 것처럼 남는 일을 막는다.
   다시 그 글을 열면 그 자리에서 새로 판정되어 기록이 갱신된다.

   ★ 저장 형태

     imory-highlight-placement
     { "<postId>": { v: "<그때의 updated_at>", f: [...id], m: [...id] } }

   f/m 어느 쪽에도 없는 id는 unknown이다(확인 뒤에 만들어진 카드).
   글 수가 늘어도 무한정 쌓이지 않도록 최근 글 위주로 자른다.
========================================================== */

const POST_HIGHLIGHT_PLACEMENT_KEY =
  "imory-highlight-placement";


/* 기록을 유지할 글 수 상한 */

const POST_HIGHLIGHT_PLACEMENT_MAX_POSTS =
  300;


const POST_HIGHLIGHT_PLACEMENT_UNKNOWN =
  "unknown";

const POST_HIGHLIGHT_PLACEMENT_FOUND =
  "found";

const POST_HIGHLIGHT_PLACEMENT_MISSING =
  "missing";


function readPostHighlightPlacementMap() {

  try {

    const raw =
      window.localStorage.getItem(
        POST_HIGHLIGHT_PLACEMENT_KEY
      );


    const parsed =
      raw
        ? JSON.parse(raw)
        : null;


    return (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    )
      ? parsed
      : {};

  }

  catch (err) {

    return {};

  }

}


/*
  글 수정 시각을 문자열 하나로 맞춘다 — DB가 주는 값(timestamptz)의
  표기가 경로마다 조금씩 다를 수 있어서, 비교는 항상 이 함수를 통과한
  값끼리 한다. 값이 없으면 빈 문자열이고, 그때는 "판별할 수 없음"이라
  아래에서 기록을 신뢰하지 않는다.
*/

function normalizePostHighlightStamp(
  value
) {

  if (!value) {

    return "";

  }


  const time =
    Date.parse(value);


  return Number.isFinite(time)
    ? String(time)
    : String(value);

}


/* =========================================================
   getPostHighlightPlacementState(id, postId, postUpdatedAt)
     -> "unknown" | "found" | "missing"

   postUpdatedAt을 모르면(옛 배포처럼 그 컬럼을 못 읽는 경우)
   "확인 시각을 대조할 수 없다"는 뜻이므로 기록을 그대로 쓴다 —
   없는 것보다는 마지막 확인 결과가 낫고, 이 값이 데이터를 바꾸지는
   않는다. 대신 기록에 시각이 남아 있는데 지금 값과 다르면 반드시
   unknown이다.
========================================================== */

function getPostHighlightPlacementState(
  id,
  postId,
  postUpdatedAt
) {

  const key =
    String(id);


  const map =
    readPostHighlightPlacementMap();


  const entry =
    map[String(postId)];


  if (!entry) {

    return POST_HIGHLIGHT_PLACEMENT_UNKNOWN;

  }


  const now =
    normalizePostHighlightStamp(
      postUpdatedAt
    );


  if (
    now &&
    entry.v &&
    entry.v !== now
  ) {

    /* 확인한 뒤에 본문이 바뀌었다 — 그때의 결과는 지금 상태가 아니다 */

    return POST_HIGHLIGHT_PLACEMENT_UNKNOWN;

  }


  if (
    Array.isArray(entry.m) &&
    entry.m.includes(key)
  ) {

    return POST_HIGHLIGHT_PLACEMENT_MISSING;

  }


  if (
    Array.isArray(entry.f) &&
    entry.f.includes(key)
  ) {

    return POST_HIGHLIGHT_PLACEMENT_FOUND;

  }


  /* 마지막 확인 이후에 만들어진 카드 */

  return POST_HIGHLIGHT_PLACEMENT_UNKNOWN;

}


/*
  예전 이름. 남아 있는 호출자를 위해 "마지막 확인에서 못 찾았다"만
  true로 돌려준다 — unknown은 false다(모른다를 잘못됐다로 바꾸지
  않는다는 규칙 그대로).
*/

function isPostHighlightKnownMissing(
  id,
  postId,
  postUpdatedAt
) {

  return (
    getPostHighlightPlacementState(
      id,
      postId,
      postUpdatedAt
    ) === POST_HIGHLIGHT_PLACEMENT_MISSING
  );

}


/* =========================================================
   recordPostHighlightPlacement(postId, postUpdatedAt, items, placedIds)

   한 글을 열어 판정이 끝난 시점에 부른다 — 그 글의 기록만 다시
   쓰고 다른 글의 기록은 건드리지 않는다.

   판정 자체를 하지 못한 경우(하이라이트 조회 실패)에는 부르지
   않는다. 못 받은 것을 "못 찾았다"로 적으면 안 되기 때문이다
   (posts/view/posts-view-highlight-mode.js).
========================================================== */

function recordPostHighlightPlacement(
  postId,
  postUpdatedAt,
  items,
  placedIds
) {

  if (
    postId === null ||
    postId === undefined
  ) {

    return;

  }


  try {

    const map =
      readPostHighlightPlacementMap();


    const found =
      [];

    const missing =
      [];


    (items || []).forEach(
      (item) => {

        const key =
          String(item.id);


        if (placedIds && placedIds.has(key)) {

          found.push(key);

        }

        else {

          missing.push(key);

        }

      }
    );


    map[String(postId)] =
      {
        v:
          normalizePostHighlightStamp(
            postUpdatedAt
          ),

        f:
          found,

        m:
          missing,

        /* 오래된 글 기록을 먼저 버리기 위한 값 */
        t:
          Date.now()
      };


    const keys =
      Object.keys(map);


    if (keys.length > POST_HIGHLIGHT_PLACEMENT_MAX_POSTS) {

      keys
        .sort(
          (a, b) =>
            (map[a]?.t || 0) - (map[b]?.t || 0)
        )
        .slice(
          0,
          keys.length - POST_HIGHLIGHT_PLACEMENT_MAX_POSTS
        )
        .forEach(
          (key) => {

            delete map[key];

          }
        );

    }


    window.localStorage.setItem(
      POST_HIGHLIGHT_PLACEMENT_KEY,
      JSON.stringify(map)
    );

  }

  catch (err) {

    /* 저장이 막혀도 화면은 그대로 동작한다 */

  }

}


/*
  그 글의 기록을 통째로 버린다 — 본문을 저장한 직후처럼 "이전
  판정이 더는 유효하지 않다"가 확실한 순간에 부른다. 다음에 그 글을
  열면 그 자리에서 다시 판정된다.
*/

function invalidatePostHighlightPlacement(
  postId
) {

  if (
    postId === null ||
    postId === undefined
  ) {

    return;

  }


  try {

    const map =
      readPostHighlightPlacementMap();


    if (map[String(postId)]) {

      delete map[String(postId)];


      window.localStorage.setItem(
        POST_HIGHLIGHT_PLACEMENT_KEY,
        JSON.stringify(map)
      );

    }

  }

  catch (err) {

    /* 무시 — 다음 열람에서 어차피 다시 쓴다 */

  }

}



/* =========================================================
   읽기 — 메모 카테고리(여러 글에 걸친 카드 목록)

   posts를 embed해서 원본 글 제목/카테고리/공개 범위를 함께 받는다.
   !inner라 "지금 내가 볼 수 있는 글"의 카드만 온다 — 원문이 지워졌거나
   비공개로 바뀌면 그 순간부터 방문자의 목록·개수에서 함께 사라진다
   (요구사항 9 마지막, 11).

   카드의 원본 카테고리는 **지금의** posts.category_id다 — 글의
   카테고리를 옮기면 카드도 따라 옮겨간다(요구사항 7).

   ★ posts.updated_at을 함께 받는 이유

   "원문에서 위치를 찾았는가"의 마지막 확인 결과가 아직 유효한지를
   판정하려면 그 글이 그 뒤에 수정됐는지를 알아야 한다. 컬럼 하나가
   목록 쿼리에 함께 실려 오므로 추가 요청이 생기지 않는다 — 카드마다
   원문 본문을 다시 받아 판정하는 일은 여전히 하지 않는다
   (그 컬럼의 SELECT 권한은
   supabase/migrations/20260913110000_grant_posts_updated_at_select.sql).
========================================================== */

async function loadMemoHighlightCards(
  ownerId
) {

  if (!ownerId) {

    return [];

  }


  /*
    posts.updated_at은 나중에 SELECT 권한이 열린 컬럼이다
    (20260913110000). 그 migration이 아직 적용되지 않은 배포에서는
    이 컬럼 하나 때문에 목록 전체가 실패하는데, 그건 "메모를
    못 읽는다"가 되어 버린다. 그래서 한 번 더, 그 컬럼만 빼고
    물어본다 — 그때는 위치 확인 상태가 "아직 확인하지 않음"으로
    남을 뿐 카드는 전부 보인다.
  */

  const buildMemoCardSelect =
    (withPostUpdatedAt) =>
      `
      id,
      post_id,
      color,
      excerpt,
      prefix,
      suffix,
      text_start,
      note,
      created_at,
      updated_at,
      posts!inner (
        id,
        title,
        category_id,
        visibility${
          withPostUpdatedAt
            ? ",\n        updated_at"
            : ""
        }
      )
      `;


  const runMemoCardQuery =
    (withPostUpdatedAt) =>
      supabaseClient
        .from(
          "post_highlights"
        )
        .select(
          buildMemoCardSelect(
            withPostUpdatedAt
          )
        )
        .eq(
          "user_id",
          ownerId
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );


  try {

    let {
      data,
      error
    } =
      await runMemoCardQuery(true);


    if (error) {

      const retry =
        await runMemoCardQuery(false);


      if (!retry.error) {

        data =
          retry.data;

        error =
          null;

      }

    }


    if (error) {

      throw error;

    }


    return (
      Array.isArray(data)
        ? data
        : []
    )
      .map(
        (row) => {

          const base =
            normalizePostHighlightRow(row);


          if (!base) {

            return null;

          }


          const post =
            Array.isArray(row.posts)
              ? row.posts[0]
              : row.posts;


          return {
            ...base,

            postTitle:
              post && typeof post.title === "string"
                ? post.title
                : "",

            postVisibility:
              post && post.visibility
                ? String(post.visibility)
                : "public",

            categoryId:
              post && post.category_id !== null && post.category_id !== undefined
                ? Number(post.category_id)
                : null,

            /*
              그 글이 마지막으로 수정된 시각. 카드의 "위치 확인"
              기록이 아직 유효한지 판정하는 데만 쓴다. 이 컬럼을
              읽을 수 없는 배포(권한 migration 이전)에서는 null이고,
              그때는 기록을 그대로 쓴다.
            */

            postUpdatedAt:
              post && post.updated_at
                ? post.updated_at
                : null
          };

        }
      )
      .filter(Boolean);

  }

  catch (err) {

    console.warn(
      "[post-highlights] 메모 목록 불러오기 실패:",
      err
    );


    return null;

  }

}



/* =========================================================
   메모 폴더 표시 설정 (순서 / 커버 / 비율 / 구도)

   categories가 아니라 memo_folder_settings를 읽는다 — 원본 카테고리
   설정과 완전히 분리돼 있다(요구사항 7).
========================================================== */

async function loadMemoFolderSettings(
  ownerId
) {

  const map =
    new Map();


  if (!ownerId) {

    return map;

  }


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "memo_folder_settings"
        )
        .select(
          "category_id, sort_order, has_cover, cover_ratio, cover_focus_x, cover_focus_y, updated_at"
        )
        .eq(
          "user_id",
          ownerId
        );


    if (error) {

      throw error;

    }


    (
      Array.isArray(data)
        ? data
        : []
    ).forEach(
      (row) => {

        map.set(
          Number(row.category_id),
          {
            sortOrder:
              Number(row.sort_order) || 0,

            hasCover:
              row.has_cover === true,

            coverRatio:
              typeof row.cover_ratio === "string"
                ? row.cover_ratio
                : "original",

            coverFocusX:
              Number(row.cover_focus_x ?? 50),

            coverFocusY:
              Number(row.cover_focus_y ?? 50),

            updatedAt:
              row.updated_at ||
              null
          }
        );

      }
    );

  }

  catch (err) {

    /* 설정이 없어도 기본값으로 그려진다 */

    console.warn(
      "[memo-folders] 설정 불러오기 실패:",
      err
    );

  }


  return map;

}
