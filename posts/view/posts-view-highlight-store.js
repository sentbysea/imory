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
  { postId, items }
*/

let postHighlightCache =
  {
    postId: null,

    items: []
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

        items: []
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

      const {
        data,
        error
      } =
        await supabaseClient
          .from(
            "post_highlights"
          )
          .select(
            POST_HIGHLIGHT_SELECT_COLUMNS
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
    */

    console.warn(
      "[post-highlights] 불러오기 실패:",
      err
    );


    postHighlightCache =
      {
        postId: numericId,

        items: []
      };


    return postHighlightCache.items;

  }


  postHighlightCache =
    {
      postId: numericId,

      items:
        rows
          .map(normalizePostHighlightRow)
          .filter(Boolean)
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

      items: []
    };

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
   "원문에서 위치를 찾을 수 없음" 기록 (요구사항 9)

   판정 자체는 글을 열 때 정확히 이뤄진다(posts-view-highlight-anchor.js).
   메모 카테고리는 카드 수만큼의 본문을 다시 받아 판정할 수 없으므로,
   **마지막으로 그 글을 열었을 때** 확인된 결과만 이 브라우저에 적어
   두고 카드에 표시한다.

   이 값은 화면 표시일 뿐이고 발췌문·메모·카드는 어느 쪽이든 그대로
   보존된다. 다른 기기에서는 그 글을 한 번 열기 전까지 표시가 없다 —
   "모른다"를 "잘못됐다"로 바꾸지 않기 위해 기본값은 항상 false다.
========================================================== */

const POST_HIGHLIGHT_MISSING_KEY =
  "imory-highlight-missing";


function readPostHighlightMissingSet() {

  try {

    const raw =
      window.localStorage.getItem(
        POST_HIGHLIGHT_MISSING_KEY
      );


    const parsed =
      raw
        ? JSON.parse(raw)
        : [];


    return new Set(
      Array.isArray(parsed)
        ? parsed.map(String)
        : []
    );

  }

  catch (err) {

    return new Set();

  }

}


function isPostHighlightKnownMissing(
  id
) {

  return readPostHighlightMissingSet().has(
    String(id)
  );

}


/*
  한 글을 열어 판정이 끝난 시점에 부른다 — 그 글에 속한 id만 다시 쓴다.
  다른 글의 기록은 건드리지 않는다.
*/

function recordPostHighlightPlacement(
  items,
  placedIds
) {

  try {

    const set =
      readPostHighlightMissingSet();


    (items || []).forEach(
      (item) => {

        const key =
          String(item.id);


        if (placedIds && placedIds.has(key)) {

          set.delete(key);

        }

        else {

          set.add(key);

        }

      }
    );


    window.localStorage.setItem(
      POST_HIGHLIGHT_MISSING_KEY,
      JSON.stringify(
        Array.from(set).slice(-2000)
      )
    );

  }

  catch (err) {

    /* 저장이 막혀도 화면은 그대로 동작한다 */

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
========================================================== */

async function loadMemoHighlightCards(
  ownerId
) {

  if (!ownerId) {

    return [];

  }


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "post_highlights"
        )
        .select(
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
            visibility
          )
          `
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
