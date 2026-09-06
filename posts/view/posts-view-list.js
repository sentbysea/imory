/* =========================================================
   POSTS VIEW - CATEGORY / LIST

   posts-view.js 분할본. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).
========================================================== */


/* =========================================================
   CATEGORY PAGE - 목록/메타데이터 캐시

   같은 카테고리를 다시 열 때 매번 Supabase를 재조회하지
   않도록, 카테고리별로 (category, posts)를 메모리에 캐시해
   재사용한다. 글 저장/삭제처럼 목록 내용이 바뀌는 지점에서
   invalidateCategoryPageCache()로 해당 카테고리 캐시만
   지워서 다음 방문 때 새로 받아오게 한다.

   categoryPageInFlight는 같은 카테고리에 대한 요청이 겹칠 때
   (연타 등) 같은 Promise를 공유해서 중복 조회를 막는다.
   categoryPageRequestSeq는 응답이 늦게 와서 그 사이 다른
   카테고리로 넘어간 화면을 덮어쓰는 것을 막는 용도.
========================================================== */

const categoryPageCache =
  new Map();

const categoryPageInFlight =
  new Map();

let categoryPageRequestSeq =
  0;


function invalidateCategoryPageCache(
  categoryId
) {

  if (
    categoryId === null ||
    categoryId === undefined
  ) {

    return;

  }


  categoryPageCache.delete(
    Number(
      categoryId
    )
  );

}


function fetchCategoryPageData(
  categoryId
) {

  if (
    categoryPageInFlight.has(
      categoryId
    )
  ) {

    return categoryPageInFlight.get(
      categoryId
    );

  }


  const request =
    (async () => {

      const owner =
        await getSiteOwner();


      if (
        owner.scoped &&
        !owner.ownerId
      ) {

        return {
          category: null,
          categoryError: null,
          posts: null,
          postsError: null
        };

      }


      let categoryQuery =
        supabaseClient
          .from(
            "categories"
          )
          .select(
            "id, name, type"
          )
          .eq(
            "id",
            categoryId
          );


      if (owner.scoped) {

        categoryQuery =
          categoryQuery.eq(
            "user_id",
            owner.ownerId
          );

      }


      const {
        data: category,
        error: categoryError
      } =
        await categoryQuery.maybeSingle();


      if (
        categoryError ||
        !category
      ) {

        return {
          category: null,
          categoryError,
          posts: null,
          postsError: null
        };

      }


      /*
        배너 카테고리는 posts를 쓰지 않으므로 원래도
        조회하지 않았음 — 그대로 유지.
      */

      if (
        category.type ===
        "banner"
      ) {

        return {
          category,
          categoryError: null,
          posts: [],
          postsError: null
        };

      }


      let postsQuery =
        supabaseClient
          .from(
            "posts"
          )
          .select(
            `
            id,
            title,
            created_at,
            visibility
            `
          )
          .eq(
            "category_id",
            categoryId
          );


      if (owner.scoped) {

        postsQuery =
          postsQuery.eq(
            "user_id",
            owner.ownerId
          );

      }


      const {
        data: posts,
        error: postsError
      } =
        await postsQuery.order(
          "created_at",
          {
            ascending:
              false
          }
        );


      return {
        category,
        categoryError: null,
        posts:
          posts ||
          [],
        postsError
      };

    })();


  categoryPageInFlight.set(
    categoryId,
    request
  );


  request.finally(
    () => {

      categoryPageInFlight.delete(
        categoryId
      );

    }
  );


  return request;

}



/* =========================================================
   CATEGORY PAGE - published Skin 시도 (Slice 1C-C)

   skin/skin-category.js의 renderPublishedSkinCategory()를
   posts-view-list.js(classic script)가 폴링 없이 넘겨받도록
   index.html이 선언해 둔 window.skinCategoryReady 핸드셰이크를
   쓴다(skin-home.js/index.html의 tryRenderPublishedSkinHome와
   동일한 패턴).

   이 함수는 절대 throw하지 않는다 — 실패하면 항상 false를
   반환해서 openCategoryPage()가 기존 legacy post-list 렌더를
   그대로 진행하게 한다.

   "site owner 본인이 로그인해서 자기 사이트를 관리 중인가"는
   여기서만 판단한다(renderPublishedSkinCategory 자신은 이 맥락을
   전혀 모른다) — owner가 자기 카테고리를 열람/관리할 때(글 추가,
   편집 모드 bulk 삭제 등, updatePostAddButton()이 켜는 UI)까지
   장식용 공개 Skin으로 바뀌어버리면 관리 기능을 잃는다. 그래서
   signed-in user가 이 사이트의 실제 owner일 때는 Skin을 시도하지
   않고 legacy 관리 화면으로 둔다 — 익명 방문자나 다른 로그인
   사용자가 이 사이트를 읽을 때는 정상적으로 Skin이 적용된다.
========================================================== */

async function tryRenderPublishedSkinCategory(
  categoryId,
  container
) {

  let owner;

  try {

    owner =
      await getSiteOwner();

  } catch (err) {

    console.error(
      "[posts-view-list] getSiteOwner failed",
      err
    );

    return false;

  }


  if (
    !owner ||
    !owner.scoped ||
    !owner.ownerId
  ) {

    return false;

  }


  let signedInUser;

  try {

    signedInUser =
      await getSignedInUser();

  } catch (err) {

    console.error(
      "[posts-view-list] getSignedInUser failed",
      err
    );

    signedInUser =
      null;

  }


  const isOwnerViewingOwnSite =
    Boolean(signedInUser) &&
    signedInUser.id === owner.ownerId;

  if (isOwnerViewingOwnSite) {

    return false;

  }


  let renderPublishedSkinCategory;

  try {

    renderPublishedSkinCategory =
      await window.skinCategoryReady;

  } catch (err) {

    console.error(
      "[posts-view-list] skin-category module failed to load",
      err
    );

    return false;

  }


  try {

    return await renderPublishedSkinCategory({
      ownerId: owner.ownerId,
      categoryId,
      container
    });

  } catch (err) {

    console.error(
      "[posts-view-list] renderPublishedSkinCategory threw unexpectedly",
      err
    );

    return false;

  }

}



/* =========================================================
   CATEGORY PAGE
========================================================== */

async function openCategoryPage(
  categoryId,
  options = {}
) {

  const {
    updateUrl = true
  } = options;


  if (
    !postArea ||
    !postList ||
    !postPageTitle
  ) {

    return;

  }


  /*
    PHASE 1D: published Skin 후보(getSiteOwner()가 scoped &&
    ownerId)인지 먼저 가볍게 확인한다 — getSiteOwner()는 메모이즈돼
    있어 HOME 로드 이후엔 사실상 즉시 resolve된다. 실제로 이
    카테고리가 Skin으로 렌더될지(owner 본인 열람/banner 타입/
    미지원이면 결국 legacy로 폴백)는 아래 tryRenderPublishedSkinCategory가
    최종 판정하고, 그 결과로 아래에서 다시 정확히 바로잡는다 —
    이 값은 로딩 중에 화면에 legacy 헤더+"..."/"loading..."을
    보여줄지, 아니면 헤더를 미리 숨기고 조용히 기다릴지만 고른다.
  */

  const owner =
    await getSiteOwner();

  const maybeSkinCandidate =
    Boolean(
      owner.scoped &&
      owner.ownerId
    );


  /*
    후보가 아니면(비-scoped/legacy 배포) 기존 그대로 매 호출마다
    되돌려 둔다 — banner/에러 분기처럼 아래 renderedPublishedSkinCategory
    지점까지 가지 않고 return하는 경로에서도 legacy 헤더/폭이 정확히
    복원되게 한다.

    후보면 반대로 미리 붙여 둔다 — 이전 카테고리가 무엇이었든
    (Skin이었든 legacy였든, 혹은 HOME에서 막 넘어와 아무 상태도
    없었든) legacy 뒤로가기 헤더가 잠깐 나타났다 사라지는 깜빡임
    없이 곧장 최종 화면(Skin 성공 시 그대로, 실패 시 아래 banner/
    에러/최종 폴백 분기에서 다시 벗겨낸다)으로 이어지게 한다.
  */

  if (postContainer) {

    postContainer.classList.toggle(
      "post-container--skin-active",
      maybeSkinCandidate
    );

  }

  postArea.classList.toggle(
    "post-area--skin-active",
    maybeSkinCandidate
  );


  const numericCategoryId =
    Number(
      categoryId
    );


  /*
    이 호출 이후 다른 카테고리 클릭이 먼저 끝나버리면
    구버전(느리게 도착한) 응답으로 화면을 덮어쓰지 않도록
    순번을 찍어둔다.
  */

  const requestId =
    ++categoryPageRequestSeq;


  const comingFromHome =
    currentPostView ===
      "home";


  if (comingFromHome) {

    await showPostArea();

  }


  currentPostCategoryId =
    numericCategoryId;


  currentPostId =
    null;


  currentPostView =
    "category";


  closePostMenu();


  if (postDetail) {

    postDetail.hidden =
      true;

  }


  hidePostEditor();


  postList.hidden =
    false;


  const cached =
    categoryPageCache.get(
      numericCategoryId
    );


  /*
    Skin 후보면 legacy 캐시 적중 여부와 무관하게 아래
    tryRenderPublishedSkinCategory가 항상 새로 (RPC 등) 확인하므로,
    대기 표시 타이머도 캐시 여부와 상관없이 여기서 한 번만 건다 —
    실제로 표시되는 건 응답이 PENDING_INDICATOR_DELAY_MS보다 오래
    걸릴 때뿐이고, 그 전에 끝나면(clearPendingIndicator, 아래) 전혀
    보이지 않는다.
  */

  const pendingIndicatorTimer =
    maybeSkinCandidate
      ? schedulePendingIndicator(
          () =>
            requestId ===
            categoryPageRequestSeq
        )
      : null;


  let category;
  let posts;
  let postsError = null;


  if (cached) {

    category =
      cached.category;

    posts =
      cached.posts;

  }

  else {

    if (!maybeSkinCandidate) {

      postPageTitle.textContent =
        "...";


      postList.innerHTML =
        `
          <div class="post-empty">
            loading...
          </div>
        `;

    }


    const result =
      await fetchCategoryPageData(
        numericCategoryId
      );


    /*
      기다리는 동안 다른 카테고리로 넘어갔으면 이 결과는
      버린다(화면은 이미 그 카테고리를 보여주는 중).
    */

    if (
      requestId !==
      categoryPageRequestSeq
    ) {

      cancelPendingIndicator(
        pendingIndicatorTimer
      );


      return;

    }


    if (
      result.categoryError ||
      !result.category
    ) {

      console.error(
        result.categoryError
      );


      clearPendingIndicator(
        pendingIndicatorTimer
      );


      /*
        실패 시 오류를 보여주고 돌아갈 수 있는 경로(기존
        post-back-button)를 되살린다 — Skin 후보라 위에서
        헤더를 미리 숨겨 둔 상태(post-container--skin-active)일
        수 있으므로 벗겨내지 않으면 오류 문구조차 보이지 않는다.
      */

      if (maybeSkinCandidate) {

        if (postContainer) {

          postContainer.classList.remove(
            "post-container--skin-active"
          );

        }


        postArea.classList.remove(
          "post-area--skin-active"
        );


        postList.innerHTML =
          `
            <div class="post-empty">
              failed to load
            </div>
          `;

      }


      postPageTitle.textContent =
        "CATEGORY";


      return;

    }


    category =
      result.category;

    posts =
      result.posts;

    postsError =
      result.postsError;

  }


  postPageTitle.textContent =
    category.name;


  currentPostCategoryType =
    category.type ||
    "post";


  /*
    로그인 여부 확인(글쓰기 버튼 노출용)은 목록 표시와
    무관하므로 굳이 기다리지 않는다 — await하면 목록이
    보이기까지 네트워크 왕복이 하나 더 늘어난다.
  */

  updatePostAddButton();


  if (updateUrl) {

    history.pushState(
      {
        page:
          "category",

        categoryId:
          numericCategoryId
      },
      "",
      buildPostRoute(
        `/category/${categoryId}`
      )
    );

  }


  if (
    currentPostCategoryType ===
    "banner"
  ) {

    if (!cached) {

      categoryPageCache.set(
        numericCategoryId,
        {
          category,
          posts: []
        }
      );

    }


    /*
      banner 카테고리는 Skin 렌더 대상이 아니다(skin-category.js가
      category.type !== "post"면 항상 false를 반환) — 위에서
      Skin 후보라고 미리 헤더를 숨겨 뒀을 수 있으므로 여기서
      확실히 legacy 레이아웃으로 되돌린다.
    */

    if (postContainer) {

      postContainer.classList.remove(
        "post-container--skin-active"
      );

    }


    postArea.classList.remove(
      "post-area--skin-active"
    );


    clearPendingIndicator(
      pendingIndicatorTimer
    );


    if (postList) {

      postList.hidden =
        true;

    }


    await renderBannerCategory(
      categoryId
    );


    return;

  }


  if (bannerGrid) {

    bannerGrid.hidden =
      true;

  }


  if (bannerEditor) {

    bannerEditor.hidden =
      true;

  }


  if (
    bannerEditToggleButton
  ) {

    bannerEditToggleButton.hidden =
      true;

  }


  postListEditModeOn =
    false;


  selectedPostIdsForDelete =
    new Set();


  if (
    postListSelectBar
  ) {

    postListSelectBar.hidden =
      true;

  }


  postListEditToggleButton
    ?.setAttribute(
      "aria-pressed",
      "false"
    );


  postList.hidden =
    false;


  if (postsError) {

    console.error(
      postsError
    );


    clearPendingIndicator(
      pendingIndicatorTimer
    );


    if (postContainer) {

      postContainer.classList.remove(
        "post-container--skin-active"
      );

    }


    postArea.classList.remove(
      "post-area--skin-active"
    );


    postList.innerHTML =
      `
        <div class="post-empty">
          failed to load
        </div>
      `;


    return;

  }


  currentCategoryPosts =
    posts ||
    [];


  if (!cached) {

    categoryPageCache.set(
      numericCategoryId,
      {
        category,
        posts:
          currentCategoryPosts
      }
    );

  }


  /*
    published Skin이 이 post형 category를 지원하면 먼저 시도한다
    (Slice 1C-C) — 실패/미지원이면 항상 false가 돌아오므로 아래
    legacy renderPostListItems()로 조용히 폴백한다. 이 지점은
    이미 currentPostCategoryType === "post"로 확정된 뒤다(banner는
    위에서 이미 return했음).

    postList에 곧장 렌더하지 않고 떨어진(detached) 스크래치
    엘리먼트에 먼저 그린다 — renderSkin()은 container.innerHTML을
    통째로 다시 그리므로, 이 응답이 늦게 도착했는데 그 사이 더 빠른
    다른 카테고리 클릭이 이미 postList에 최신 화면을 그려 둔
    상태라면, 곧장 postList에 그렸을 경우 requestId 검사 이전에
    이미 최신 화면을 덮어써버린다. 아래에서 requestId가 여전히
    최신일 때만 이 스크래치 엘리먼트의 내용을 postList로 옮긴다.
  */

  const skinRenderTarget =
    document.createElement(
      "div"
    );

  const renderedPublishedSkinCategory =
    await tryRenderPublishedSkinCategory(
      numericCategoryId,
      skinRenderTarget
    );


  if (
    requestId !==
    categoryPageRequestSeq
  ) {

    cancelPendingIndicator(
      pendingIndicatorTimer
    );


    return;

  }


  clearPendingIndicator(
    pendingIndicatorTimer
  );


  if (renderedPublishedSkinCategory) {

    postList.innerHTML =
      "";


    while (
      skinRenderTarget.firstChild
    ) {

      postList.appendChild(
        skinRenderTarget.firstChild
      );

    }

  }


  if (postContainer) {

    postContainer.classList.toggle(
      "post-container--skin-active",
      renderedPublishedSkinCategory
    );

  }


  postArea.classList.toggle(
    "post-area--skin-active",
    renderedPublishedSkinCategory
  );


  if (renderedPublishedSkinCategory) {
    return;
  }


  renderPostListItems();

}



/* =========================================================
   POST LIST 렌더

   글 목록 편집(선택 삭제) 모드 여부에 따라 아이템을
   <a>(눌러서 글로 이동) 또는 <div>(눌러서 체크 토글)로
   그린다. 실제 선택/삭제 동작은 posts-view-list-select.js.
========================================================== */

function renderPostListItems() {

  if (!postList) {
    return;
  }


  postList.innerHTML =
    "";


  if (
    currentCategoryPosts.length === 0
  ) {

    postList.innerHTML =
      `
        <div class="post-empty">
          no posts yet
        </div>
      `;


    return;

  }


  currentCategoryPosts.forEach(
    post => {

      postList.appendChild(
        postListEditModeOn
          ? createSelectablePostListItem(
              post
            )
          : createPostListItem(
              post
            )
      );

    }
  );

}


function createPostListItem(
  post
) {

  const item =
    document.createElement(
      "a"
    );


  item.className =
    "post-list-item";


  item.href =
    buildPostRoute(
      `/post/${post.id}`
    );


  item.dataset.postId =
    post.id;


  const title =
    document.createElement(
      "span"
    );


  title.className =
    "post-list-title";


  applyPostVisibilityTitle(
    title,
    post.visibility,
    post.title
  );


  const date =
    document.createElement(
      "span"
    );


  date.className =
    "post-list-date";


  date.textContent =
    formatPostListDate(
      post.created_at
    );


  item.append(
    title,
    date
  );


  return item;

}



