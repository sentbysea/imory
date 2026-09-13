/* =========================================================
   POSTS VIEW — 메모 카테고리 (HIGHLIGHT-1 §7)

   /:slug/memos            전체 보기 (기본, 최신순)
   /:slug/memos?view=folders   폴더별 보기
   /:slug/memos/category/:id   그 폴더(=원본 글 카테고리)의 카드 목록

   기준 문서: IMORY_HIGHLIGHT1_DESIGN.md §7


   ★ 화면을 그리는 것은 스킨 렌더러다

   이 파일은 카테고리/폴더 화면과 같은 뼈대(진입 정리 → 렌더 →
   확정)만 맡고, 실제 HTML은 skin/skin-memos.js가 그린다 —
   templates.memos가 있으면 스킨이, 없으면 플랫폼 기본 template이
   같은 Context를 같은 renderer로 그린다. 그래서 "고정된 완성 HTML
   하나"가 아니다(요구사항 10).

   ★ 조작 도구는 렌더 뒤에 붙인다

   스킨 HTML에는 <button>이 들어갈 수 없다(새니타이저가 지운다).
   그래서 주인장용 ⋮ 는 카드마다 하나씩 있는
   [data-imory-region="memo-tools"] 자리에 플랫폼이 넣는다. 그 자리는
   repeat 안에 있어 렌더러가 카드 id를 키로 찍어 두므로
   (data-imory-region-key, skin/skin-render.js) DOM 순서가 아니라
   **키로** 카드와 짝지어진다. 방문자에게는 그 자리가 빈 채로 남는다.

   ★ 같은 데이터를 본다

   카드의 메모를 고치면 posts-view-highlight-store.js의 RPC를 그대로
   쓰고, 글 뷰어와 같은 변경 이벤트를 받는다 — 한쪽에서 고친 내용이
   다른 쪽에 반영된다(요구사항 6).

   의존(classic script, 먼저 로드돼야 함):
   posts/editor/posts-refs.js · posts/view/posts-view-transition.js ·
   posts/view/posts-view-list.js(switchToCategoryScreen) ·
   posts/view/posts-view-popover.js ·
   posts/view/posts-view-highlight-store.js ·
   posts/view/posts-view-highlight-mode.js(openPostMemoPopup).
========================================================== */


let memoScreenRequestSeq =
  0;


let memoScreenState =
  {
    view: "all",

    categoryId: null
  };


/* 이번 렌더의 renderSkin 인스턴스(메모 도구를 붙일 때 쓴다) */

let memoScreenInstance =
  null;



/* =========================================================
   openMemoScreen(options)

     view        "all" | "folders"
     categoryId  폴더 하나를 열었으면 그 카테고리 id("none" 포함)
     updateUrl   주소를 새로 밀어 넣을지
========================================================== */

async function openMemoScreen(
  options = {}
) {

  const {
    view = "all",
    categoryId = null,
    updateUrl = true
  } = options;


  if (
    !postArea ||
    !postList
  ) {

    return;

  }


  const owner =
    await getSiteOwner();


  if (
    !owner ||
    !owner.ownerId
  ) {

    /*
      소유자를 알 수 없는 배포에는 메모 화면이 없다 — HOME으로
      돌려보낸다(폴더 페이지가 카테고리로 돌아가는 것과 같은 결).
    */

    await closePostArea({
      updateUrl: true
    });


    return;

  }


  const comingFromHome =
    currentPostView === "home";


  currentPostView =
    "memos";

  if (typeof resetPostViewerTools === "function") {
    resetPostViewerTools();
  }



  currentPostId =
    null;


  memoScreenState =
    {
      view,

      categoryId:
        categoryId === null ||
        categoryId === undefined ||
        categoryId === ""
          ? null
          : String(categoryId)
    };


  const requestId =
    ++memoScreenRequestSeq;


  const isStale =
    () =>
      requestId !== memoScreenRequestSeq ||
      currentPostView !== "memos";


  closePostMenu();

  hidePostEditor();


  if (comingFromHome) {

    await showPostArea();

  }


  /*
    진입 정리 — 카테고리/폴더 화면과 같다. 메모 화면은 자기 프레임을
    직접 그리므로 스킨 mount 계약을 그대로 켠다.
  */

  if (postContainer) {

    postContainer.classList.add(
      "post-container--skin-active"
    );

    postContainer.classList.remove(
      "post-container--owner-tools"
    );

    postContainer.classList.remove(
      "post-container--viewer-tools"
    );

  }

  postArea.classList.add(
    "post-area--skin-active"
  );


  setBannerSkinActive(false);

  setCategorySkinActive(false);

  setSkinOwnerEntriesForScreen(null);


  if (
    typeof setCategoryManageScreenActive === "function"
  ) {

    setCategoryManageScreenActive(false);

  }


  const pendingIndicatorTimer =
    schedulePendingIndicator(
      () =>
        !isStale()
    );


  let renderMemos;


  try {

    renderMemos =
      window.renderPublishedSkinMemos ||
      await window.skinMemosReady;

  }

  catch (err) {

    renderMemos =
      null;

  }


  const target =
    document.createElement("div");


  const outcome =
    {};


  const rendered =
    typeof renderMemos === "function"
      ? await renderMemos({
          ownerId:
            owner.ownerId,

          container:
            target,

          view:
            memoScreenState.view,

          categoryId:
            memoScreenState.categoryId,

          outcome
        })
      : false;


  if (isStale()) {

    cancelPendingIndicator(
      pendingIndicatorTimer
    );


    return;

  }


  clearPendingIndicator(
    pendingIndicatorTimer
  );


  switchToCategoryScreen();


  postList.innerHTML =
    "";


  if (!rendered) {

    const failure =
      document.createElement("p");


    failure.className =
      "memo-screen-state";


    failure.textContent =
      "메모를 불러오지 못했습니다.";


    postList.appendChild(failure);


    memoScreenInstance =
      null;

  }

  else {

    while (target.firstChild) {

      postList.appendChild(
        target.firstChild
      );

    }


    memoScreenInstance =
      outcome.instance ||
      null;


    attachMemoScreenTools(
      outcome.context
    );

  }


  if (postPageTitle) {

    postPageTitle.textContent =
      outcome.context?.memos?.folder?.name ||
      "MEMO";

  }


  /* 메모 화면에는 플랫폼 소유자 도구(＋/edit)가 없다 */

  [
    postAddButton,
    postListEditToggleButton,
    bannerEditToggleButton,
    postManageToggleButton,
    postToolsButton
  ].forEach(
    (button) => {

      if (button) {

        button.hidden =
          true;

      }

    }
  );


  if (typeof mountPlatformOwnerTools === "function") {

    mountPlatformOwnerTools(null);

  }


  await revealPostArea(true);


  const routePath =
    buildPostRoute(
      memoScreenState.categoryId
        ? `/memos/category/${memoScreenState.categoryId}`
        : "/memos"
    );


  const routeUrl =
    !memoScreenState.categoryId && memoScreenState.view === "folders"
      ? `${routePath}?view=folders`
      : routePath;


  const historyState =
    {
      page:
        "memos",

      view:
        memoScreenState.view,

      categoryId:
        memoScreenState.categoryId
    };


  if (updateUrl) {

    history.pushState(
      historyState,
      "",
      routeUrl
    );

  }

  else {

    history.replaceState(
      historyState,
      "",
      routeUrl
    );

  }

}



/* =========================================================
   렌더 뒤에 붙이는 것들
========================================================== */

function attachMemoScreenTools(
  context
) {

  if (!postList) {

    return;

  }


  const cards =
    new Map(
      (context?.memos?.cards || []).map(
        (card) =>
          [String(card.id), card]
      )
    );


  /*
    원문 이동 — 주소에는 발췌문도 메모도 싣지 않는다(요구사항 6).
    "이 카드로 간다"만 이 세션에 적어 두고 도착한 글이 그 카드를
    실제로 찾았을 때만 그 자리로 스크롤한다
    (posts/view/posts-view-highlight-mode.js).
  */

  postList
    .querySelectorAll("a[href]")
    .forEach(
      (anchor) => {

        const card =
          findMemoCardForElement(
            anchor,
            cards
          );


        if (
          !card ||
          !card.postHref ||
          !anchor.getAttribute("href")?.includes("/post/")
        ) {

          return;

        }


        anchor.addEventListener(
          "click",
          () => {

            requestPostHighlightFocus(
              card.id
            );

          }
        );

      }
    );


  if (!context?.memos?.canManage) {

    return;

  }


  const regions =
    typeof memoScreenInstance?.getRegions === "function"
      ? memoScreenInstance.getRegions("memo-tools")
      : [];


  regions.forEach(
    (region) => {

      const card =
        cards.get(
          String(region.key)
        );


      if (
        !card ||
        !region.element
      ) {

        return;

      }


      const button =
        document.createElement("button");


      button.type =
        "button";


      button.className =
        "memo-card-menu";


      button.textContent =
        "⋮";


      button.setAttribute(
        "aria-label",
        "메모 카드 도구"
      );


      button.setAttribute(
        "aria-haspopup",
        "menu"
      );


      button.addEventListener(
        "click",
        () => {

          openMemoCardMenu(
            button,
            card
          );

        }
      );


      region.element.replaceChildren(button);

    }
  );

}


/*
  이 요소가 어느 카드 안에 있는가 — region 키가 찍힌 가장 가까운
  조상으로 찾는다. 스킨이 어떤 배치를 쓰든 통한다.
*/

function findMemoCardForElement(
  element,
  cards
) {

  const holder =
    element.closest?.(
      "[data-imory-region-key]"
    ) ||
    element.parentElement?.querySelector?.(
      "[data-imory-region-key]"
    );


  if (holder) {

    const found =
      cards.get(
        String(
          holder.getAttribute("data-imory-region-key")
        )
      );


    if (found) {

      return found;

    }

  }


  /*
    카드 안에 region이 없는 스킨(도구 자리를 그리지 않은 경우)에서는
    같은 카드 안의 다른 region 키를 찾을 수 없다 — 그때는 주소로
    맞춘다. 같은 글의 카드가 여럿이면 첫 번째가 아니라 아무것도
    고르지 않는다(엉뚱한 카드로 데려가지 않는다).
  */

  const href =
    element.getAttribute?.("href") ||
    "";


  const matches =
    Array.from(cards.values()).filter(
      (card) =>
        card.postHref &&
        href.endsWith(card.postHref)
    );


  return matches.length === 1
    ? matches[0]
    : null;

}


/* =========================================================
   카드의 ⋮ 메뉴 (요구사항 6)

     메모 없음 → 메모 추가
     메모 있음 → 메모 수정 · 메모 삭제
     항상        하이라이트 삭제

   "메모 삭제"는 메모 글자만 지우고 하이라이트와 카드는 남긴다.
   "하이라이트 삭제"는 하이라이트와 카드를 함께 지운다.
========================================================== */

function openMemoCardMenu(
  button,
  card
) {

  if (isImoryPopoverOpen("memo-card")) {

    closeImoryPopover();


    return;

  }


  openImoryPopover({
    name:
      "memo-card",

    className:
      "imory-popover--menu",

    anchorRect:
      imoryPopoverRectOf(button),

    returnFocus:
      button,

    render:
      (body) => {

        const items =
          [];


        items.push({
          label:
            card.hasNote
              ? "메모 수정"
              : "메모 추가",

          onSelect:
            () => {

              openPostMemoPopup(
                {
                  id:
                    card.id,

                  excerpt:
                    card.excerpt,

                  note:
                    card.note,

                  color:
                    card.color
                },
                {
                  /* 저장 성공은 store가 변경 이벤트로 알린다 — 이 화면은
                     그 이벤트 하나로만 다시 그린다(두 번 그리지 않는다). */
                }
              );

            }
        });


        if (card.hasNote) {

          items.push({
            label:
              "메모 삭제",

            hint:
              "카드는 남습니다",

            onSelect:
              async () => {

                const result =
                  await updatePostHighlightNote(
                    card.id,
                    ""
                  );


                if (!result.ok) {

                  showPostViewerToast(
                    "메모를 지우지 못했습니다",
                    "error"
                  );


                  return;

                }


                showPostViewerToast(
                  "메모를 지웠습니다",
                  "ok"
                );

              }
          });

        }


        items.push(null);


        items.push({
          label:
            "하이라이트 삭제",

          danger:
            true,

          hint:
            card.hasNote
              ? "메모도 함께"
              : "",

          onSelect:
            async () => {

              const message =
                card.hasNote
                  ? "이 하이라이트와 메모 카드를 함께 지웁니다. 계속할까요?"
                  : "이 하이라이트를 지웁니다. 계속할까요?";


              if (!window.confirm(message)) {

                return;

              }


              const result =
                await deletePostHighlight(
                  card.id
                );


              if (!result.ok) {

                showPostViewerToast(
                  "삭제하지 못했습니다",
                  "error"
                );


                return;

              }


              showPostViewerToast(
                "지웠습니다",
                "ok"
              );

            }
        });


        renderImoryPopoverMenu(
          body,
          items
        );

      }
  });

}


/*
  목록을 다시 그린다. 주소는 그대로다(같은 화면이다).
*/

async function refreshMemoScreen() {

  if (currentPostView !== "memos") {

    return;

  }


  await openMemoScreen({
    view:
      memoScreenState.view,

    categoryId:
      memoScreenState.categoryId,

    updateUrl:
      false
  });

}


/*
  글 뷰어에서 고친 내용이 메모 화면에도 반영돼야 한다 — 반대 방향은
  뷰어가 다시 열릴 때 어차피 새로 읽는다.
*/

window.addEventListener(
  "imory:post-highlights-changed",
  () => {

    if (currentPostView === "memos") {

      refreshMemoScreen();

    }

  }
);

