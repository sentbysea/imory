/* =========================================================
   ADMIN SETTINGS — 카테고리 타입 변경 안전장치 (HIGHLIGHT-2 §10)

   기준 문서: IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md

   무엇을 막는가
   ------------
   post / gallery 카테고리를 singleton 타입(banner / highlight)으로
   바꾸면 그 카테고리에는 더 이상 글 목록 화면이 없다. 안에 글이나
   폴더가 남아 있으면 그 글들은 어느 화면에서도 닿을 수 없는 상태가
   된다 — "지웠다"고 말하지 않았는데 사라진 것처럼 보인다.

   그래서 타입을 바꾸기 **전에** 옮길 목적지를 고르게 한다. 목적지
   조건은 넷이다(요구사항 10):
     · 지금 사용자 소유
     · 원본과 다른 카테고리
     · post 또는 gallery
     · 이번 저장에서 삭제 예정이 아님

   실제 이동은 화면이 하지 않는다. 저장할 때 DB 의
   change_own_category_type RPC 한 번이 글 이동 → 폴더 이동 → 타입
   변경을 **한 트랜잭션**으로 하고, 중간에 실패하면 전부 되돌린다.

   ★ singleton 충돌은 목적지를 묻기 전에 거절한다
   이미 HIGHLIGHT 카테고리가 있으면 두 번째는 애초에 만들 수 없다.
   그 경우 목적지를 고르게 해 봐야 마지막에 거절되므로, 고르는
   단계로 들어가지 않는다.

   ★ BANNER 는 비우게 한다
   배너 항목이 남은 BANNER 카테고리의 타입 변경은 거절한다. 옮길
   다른 BANNER 는 singleton 규칙상 존재할 수 없다(§5).

   의존(classic script, 먼저 로드돼야 함):
     core/lib/supabase-client.js
     core/lib/category-types.js
     admin/settings/admin-settings-load.js (categories · deletedCategoryIds)
========================================================== */


/*
  카테고리별 "안에 든 것" 개수. 타입을 바꿀 때만 필요하므로 미리
  전부 세지 않고 그때 한 번 센다(카테고리 하나당 최대 세 번의 head
  질의). 같은 카테고리를 두 번 물으면 캐시를 쓴다.
*/

const categoryContentCountCache =
  new Map();


function resetCategoryContentCounts() {

  categoryContentCountCache.clear();

}


async function countCategoryRows(
  table,
  categoryId
) {

  const {
    count,
    error
  } =
    await supabaseClient
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);


  if (error) {

    console.error(
      `[category-type] ${table} count 실패:`,
      error
    );


    /* 셀 수 없으면 "있다"고 본다 — 모르는 채 옮기지 않게. */
    return null;

  }


  return Number(count || 0);

}


async function loadCategoryContentCounts(
  categoryId
) {

  const key =
    String(categoryId);


  if (categoryContentCountCache.has(key)) {

    return categoryContentCountCache.get(key);

  }


  const [posts, folders, banners] =
    await Promise.all([
      countCategoryRows("posts", categoryId),
      countCategoryRows("post_folders", categoryId),
      countCategoryRows("banners", categoryId)
    ]);


  const counts =
    {
      posts,
      folders,
      banners,

      unknown:
        posts === null ||
        folders === null ||
        banners === null,

      hasContent:
        posts === null ||
        folders === null ||
        posts > 0 ||
        folders > 0
    };


  categoryContentCountCache.set(key, counts);


  return counts;

}


/* =========================================================
   목적지 후보 (요구사항 10)
========================================================== */

function categoryMoveTargets(
  category
) {

  const deleted =
    typeof deletedCategoryIds !== "undefined" && Array.isArray(deletedCategoryIds)
      ? deletedCategoryIds.map(String)
      : [];


  return (
    typeof categories !== "undefined" && Array.isArray(categories)
      ? categories
      : []
  ).filter(
    (candidate) =>
      candidate !== category &&
      candidate.id &&
      !deleted.includes(String(candidate.id)) &&
      isPostBearingCategoryType(candidate.type)
  );

}


/* =========================================================
   requestCategoryTypeChange(category, nextType)
     -> Promise<{ ok, message? }>

   화면의 <select> 가 부른다. ok=false 면 호출자가 고른 값을
   되돌린다 — 타입은 한 글자도 바뀌지 않는다.
========================================================== */

async function requestCategoryTypeChange(
  category,
  nextType
) {

  const next =
    normalizeCategoryType(nextType);


  /* --- 1) singleton 충돌: 목적지를 묻기 전에 거절 --- */

  if (isSingletonCategoryType(next)) {

    const owner =
      (
        typeof categories !== "undefined" && Array.isArray(categories)
          ? categories
          : []
      ).find(
        (other) =>
          other !== category &&
          normalizeCategoryType(other.type) === next
      );


    if (owner) {

      return {
        ok: false,
        message: `이미 ${next.toUpperCase()} 카테고리가 있습니다. 블로그당 하나만 둘 수 있습니다.`
      };

    }

  }


  /* --- 2) 아직 저장되지 않은 카테고리는 비어 있다 --- */

  if (!category.id) {

    category.__moveTargetCategoryId =
      null;


    return { ok: true };

  }


  const counts =
    await loadCategoryContentCounts(category.id);


  /* --- 3) 배너 항목이 남은 BANNER 는 비우게 한다 --- */

  if (
    normalizeCategoryType(category.type) === "banner" &&
    (counts.banners === null || counts.banners > 0)
  ) {

    return {
      ok: false,
      message: "배너 항목이 남아 있습니다. 배너를 먼저 비운 뒤에 종류를 바꿀 수 있습니다."
    };

  }


  /* --- 4) singleton 이 아니면 옮길 필요가 없다 --- */

  if (!isSingletonCategoryType(next)) {

    category.__moveTargetCategoryId =
      null;


    return { ok: true };

  }


  if (!counts.hasContent) {

    category.__moveTargetCategoryId =
      null;


    return { ok: true };

  }


  /* --- 5) 목적지를 고르게 한다 --- */

  const targets =
    categoryMoveTargets(category);


  if (targets.length === 0) {

    return {
      ok: false,
      message: "이 카테고리의 글을 옮길 다른 글/갤러리 카테고리가 없습니다. 먼저 카테고리를 하나 만들어 저장한 뒤에 다시 시도하세요."
    };

  }


  const chosen =
    await pickCategoryMoveTarget(
      category,
      next,
      targets,
      counts
    );


  if (!chosen) {

    return {
      ok: false,
      message: "옮길 곳을 고르지 않아 종류를 바꾸지 않았습니다."
    };

  }


  category.__moveTargetCategoryId =
    chosen;


  return { ok: true };

}


/* =========================================================
   목적지 고르기 — 화면 안의 작은 대화 상자

   window.prompt 를 쓰지 않는다: 카테고리를 이름으로 받아 적게 하면
   오타 하나로 엉뚱한 곳에 글이 간다. 고를 수 있는 것만 목록으로
   준다.

   Escape / 취소 / 바깥 클릭은 모두 "바꾸지 않음"이다 — 되돌릴 수
   없는 이동 앞에서 기본값은 언제나 아무것도 하지 않는 쪽이다.
========================================================== */

function pickCategoryMoveTarget(
  category,
  nextType,
  targets,
  counts
) {

  return new Promise(
    (resolve) => {

      const backdrop =
        document.createElement("div");


      backdrop.className =
        "category-move-backdrop";


      const dialog =
        document.createElement("div");


      dialog.className =
        "category-move-dialog";


      dialog.setAttribute("role", "dialog");

      dialog.setAttribute("aria-modal", "true");


      const titleId =
        "categoryMoveTitle";


      dialog.setAttribute(
        "aria-labelledby",
        titleId
      );


      const title =
        document.createElement("h2");


      title.id =
        titleId;


      title.className =
        "category-move-title";


      title.textContent =
        `${(category.name || "").trim() || "이 카테고리"}의 글을 어디로 옮길까요?`;


      const body =
        document.createElement("p");


      body.className =
        "category-move-body";


      const pieces =
        [];

      if (counts.posts === null || counts.folders === null) {

        pieces.push("안에 든 글과 폴더를 세지 못했습니다");

      }

      else {

        if (counts.posts > 0) {

          pieces.push(`글 ${counts.posts}개`);

        }

        if (counts.folders > 0) {

          pieces.push(`폴더 ${counts.folders}개`);

        }

      }


      body.textContent =
        `${nextType.toUpperCase()} 카테고리에는 글 목록이 없습니다. ` +
        (pieces.length ? `${pieces.join(" · ")}를 ` : "안에 든 것을 ") +
        "고른 카테고리로 옮긴 뒤에 종류를 바꿉니다. 폴더 구조와 글이 들어 있던 폴더는 그대로 따라갑니다.";


      const label =
        document.createElement("label");


      label.className =
        "category-move-field";


      const labelText =
        document.createElement("span");


      labelText.textContent =
        "옮길 곳";


      const select =
        document.createElement("select");


      select.className =
        "imory-field imory-field--sm";


      targets.forEach(
        (target) => {

          const option =
            document.createElement("option");


          option.value =
            String(target.id);


          option.textContent =
            `${(target.name || "").trim() || "이름 없음"} · ${categoryTypeLabel(target.type)}`;


          select.appendChild(option);

        }
      );


      label.append(labelText, select);


      const actions =
        document.createElement("div");


      actions.className =
        "category-move-actions";


      const cancel =
        document.createElement("button");


      cancel.type =
        "button";


      cancel.className =
        "imory-button imory-button--ghost imory-button--sm";


      cancel.textContent =
        "취소";


      const confirm =
        document.createElement("button");


      confirm.type =
        "button";


      confirm.className =
        "imory-button imory-button--primary imory-button--sm";


      confirm.textContent =
        "옮기고 바꾸기";


      actions.append(cancel, confirm);


      dialog.append(title, body, label, actions);

      backdrop.appendChild(dialog);

      document.body.appendChild(backdrop);


      const previousFocus =
        document.activeElement;


      const close =
        (value) => {

          document.removeEventListener("keydown", onKeyDown, true);


          if (backdrop.isConnected) {

            backdrop.remove();

          }


          if (
            previousFocus &&
            typeof previousFocus.focus === "function"
          ) {

            previousFocus.focus();

          }


          resolve(value);

        };


      const onKeyDown =
        (event) => {

          if (event.key === "Escape") {

            event.preventDefault();

            close(null);

          }

        };


      document.addEventListener("keydown", onKeyDown, true);


      backdrop.addEventListener(
        "click",
        (event) => {

          if (event.target === backdrop) {

            close(null);

          }

        }
      );


      cancel.addEventListener(
        "click",
        () => {

          close(null);

        }
      );


      confirm.addEventListener(
        "click",
        () => {

          close(
            Number(select.value) || null
          );

        }
      );


      select.focus();

    }
  );

}


/* =========================================================
   저장 쪽에서 쓰는 것 — 타입이 실제로 바뀌었는가

   loadCategories() 가 읽어 온 순간의 타입을 __savedType 에 적어 둔다.
   저장할 때 그 값과 다르면 categories.update 로 type 을 바꾸지 않고
   change_own_category_type RPC 를 부른다 — 글/폴더 이동과 타입 변경이
   한 트랜잭션이어야 하기 때문이다.
========================================================== */

function markSavedCategoryTypes(
  list
) {

  (list || []).forEach(
    (category) => {

      category.__savedType =
        normalizeCategoryType(category.type);


      category.__moveTargetCategoryId =
        null;

    }
  );


  resetCategoryContentCounts();

}


function categoryTypeChanged(
  category
) {

  return (
    Boolean(category.id) &&
    typeof category.__savedType === "string" &&
    category.__savedType !== normalizeCategoryType(category.type)
  );

}


/* =========================================================
   categoryTypeChangeNeedsRpc(category) -> boolean

   **모든** 타입 변경이 RPC 를 거치지는 않는다. post <-> gallery 는
   옮길 데이터도 singleton 제약도 없다 — 지금까지처럼 평범한
   categories.update 로 충분하고, 그래야 이 migration 이 아직 적용되지
   않은 배포에서도 그 변경이 계속 동작한다.

   RPC 가 필요한 경우는 둘이다:
     · singleton 타입(banner / highlight)으로 **들어갈** 때
       - 글/폴더를 목적지로 옮겨야 하고, 중복을 DB 가 거절해야 한다
     · singleton 타입에서 **나올** 때
       - 비어 있지 않은 BANNER 를 막아야 한다
========================================================== */

function categoryTypeChangeNeedsRpc(
  category
) {

  if (!categoryTypeChanged(category)) {

    return false;

  }


  return (
    isSingletonCategoryType(category.__savedType) ||
    isSingletonCategoryType(category.type)
  );

}


/*
  타입 변경 한 건을 DB 에 반영한다. 실패하면 그대로 throw 해서
  저장 전체가 실패로 보고되게 한다 — 실패를 성공으로 표시하지 않는다.
*/

async function applyCategoryTypeChange(
  category
) {

  const {
    error
  } =
    await supabaseClient.rpc(
      "change_own_category_type",
      {
        p_category_id:
          category.id,

        p_type:
          normalizeCategoryType(category.type),

        p_destination_category_id:
          category.__moveTargetCategoryId || null
      }
    );


  if (error) {

    return {
      ok: false,

      message:
        error.code === "23505"
          ? `이미 ${normalizeCategoryType(category.type).toUpperCase()} 카테고리가 있습니다. 블로그당 하나만 둘 수 있습니다.`
          : error.code === "23503"
          ? "배너 항목이 남아 있어 종류를 바꾸지 못했습니다. 배너를 먼저 비워 주세요."
          : "카테고리 종류를 바꾸지 못했습니다."
    };

  }


  return { ok: true };

}
