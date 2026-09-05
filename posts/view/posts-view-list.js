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

    postPageTitle.textContent =
      "...";


    postList.innerHTML =
      `
        <div class="post-empty">
          loading...
        </div>
      `;


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

      return;

    }


    if (
      result.categoryError ||
      !result.category
    ) {

      console.error(
        result.categoryError
      );


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
  */

  const renderedPublishedSkinCategory =
    await tryRenderPublishedSkinCategory(
      numericCategoryId,
      postList
    );


  if (
    requestId !==
    categoryPageRequestSeq
  ) {

    return;

  }


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



