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

/*
  두 Skin 시도 함수(post형 CATEGORY, banner)가 공유하는 사전 판정.
  "이 사이트가 published Skin 후보인가"와 "지금 보고 있는 사람이
  소유자 본인인가"를 한 곳에서만 계산한다 — 판정 규칙이 두 벌로
  갈라지면 한쪽만 고쳐지는 사고가 난다.

  두 값을 따로 돌려주는 이유(PHASE 1E): 두 페이지의 정책이 서로
  다르기 때문이다.

  - post형 CATEGORY는 소유자 본인일 때 Skin을 시도하지 않는다.
    글 목록 화면 자체가 곧 관리 화면이라(글 추가, 편집 모드 bulk
    삭제, 선택 바) 장식용 공개 Skin으로 바꿔버리면 그 기능들이
    갈 곳이 없다.
  - banner 카테고리는 소유자 본인도 Skin으로 본다. 배너 관리는
    목록 자체가 아니라 플랫폼이 소유한 별도 진입점(+ 버튼 /
    EDIT 토글 / 배너 폼)에 있어서, 목록을 legacy로 되돌리지
    않고도 그대로 유지할 수 있다.

  -> { ownerId: string|null, isOwnerViewing: boolean }
     ownerId가 null이면 이 라우트는 published Skin 후보가 아니다.
*/

async function resolveSkinRouteViewer() {

  let owner;

  try {

    owner =
      await getSiteOwner();

  } catch (err) {

    console.error(
      "[posts-view-list] getSiteOwner failed",
      err
    );

    return { ownerId: null, isOwnerViewing: false };

  }


  if (
    !owner ||
    !owner.scoped ||
    !owner.ownerId
  ) {

    return { ownerId: null, isOwnerViewing: false };

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


  return {
    ownerId: owner.ownerId,
    isOwnerViewing: isOwnerViewingOwnSite
  };

}


async function tryRenderPublishedSkinCategory(
  categoryId,
  container
) {

  const {
    ownerId,
    isOwnerViewing
  } =
    await resolveSkinRouteViewer();

  if (!ownerId || isOwnerViewing) {

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
      ownerId,
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
   BANNER CATEGORY - published Skin 시도 (PHASE 1E)

   skin/skin-banner.js의 renderPublishedSkinBanner()를 위
   tryRenderPublishedSkinCategory와 완전히 같은 방식으로 넘겨받는다
   (window.skinBannerReady 핸드셰이크). 다른 점은 오직 어떤 모듈/
   어떤 template을 쓰느냐뿐이다 — templates.banner가 없는 기존
   스킨에서는 그 모듈이 false를 돌려주므로 기존 legacy 배너 화면이
   그대로 나온다.

   post형 CATEGORY와 딱 하나 다른 점(PHASE 1E): 소유자 본인이
   열람할 때도 Skin을 시도한다. 소유자만 방문자와 다른 화면을 보는
   상태를 없애기 위해서다 — 배너 추가/수정은 목록이 아니라 플랫폼이
   소유한 진입점(+ 버튼 / EDIT 토글, openCategoryPage의 banner
   분기 참고)에 있으므로, 목록을 legacy로 되돌리지 않고도 그대로
   유지된다.

   이 함수도 절대 throw하지 않는다.
========================================================== */

async function tryRenderPublishedSkinBanner(
  categoryId,
  container
) {

  const { ownerId } =
    await resolveSkinRouteViewer();

  if (!ownerId) {

    return false;

  }


  let renderPublishedSkinBanner;

  try {

    renderPublishedSkinBanner =
      await window.skinBannerReady;

  } catch (err) {

    console.error(
      "[posts-view-list] skin-banner module failed to load",
      err
    );

    return false;

  }


  try {

    return await renderPublishedSkinBanner({
      ownerId,
      categoryId,
      container
    });

  } catch (err) {

    console.error(
      "[posts-view-list] renderPublishedSkinBanner threw unexpectedly",
      err
    );

    return false;

  }

}



/* =========================================================
   CATEGORY PAGE
========================================================== */

/*
  CATEGORY 화면으로 실제 전환하는 DOM 조작을 한 곳에 모은다 —
  글 상세(legacy #postDetail / Skin #postSkinContainer)를 접고
  목록(#postList)을 편다. Skin 후보 경로는 화면이 준비된 뒤에
  (각 확정/폴백 지점에서) 이 함수를 부르고, 그 외 경로는 기존처럼
  진입 즉시 부른다.
*/

function switchToCategoryScreen() {

  if (postDetail) {

    postDetail.hidden =
      true;

  }


  /*
    직전 글이 Skin+비밀글이었다면 postSecretGate가 그 Skin 컨테이너
    안에 들어가 있다 — 비우기 전에 반드시 legacy #postDetail로
    되돌린다(posts-view-detail.js의 helper, 실행 시점엔 이미 로드돼
    있다).
  */

  restorePostSecretGateToLegacyDetail();


  if (postSkinContainer) {

    postSkinContainer.hidden =
      true;

    postSkinContainer.innerHTML =
      "";

  }


  if (postList) {

    postList.hidden =
      false;

  }

}


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


  /*
    이 화면 전환을 시작하는 시점에는 아직 Skin 배너 목록이 아니다 —
    아래 banner 분기에서 Skin 렌더가 실제로 성공했을 때만 다시
    켠다(PHASE 1E). 배너가 아닌 카테고리로 넘어가거나 실패로
    끝나는 경로에서도 이 상태가 남지 않게 진입점에서 한 번 끈다.
  */

  setBannerSkinActive(false);


  if (postContainer) {

    postContainer.classList.remove(
      "post-container--banner-owner-tools"
    );

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


  /*
    PHASE 1D 전환 정리: Skin 후보가 아닐 때만 기존처럼 지금 바로
    흰색 커튼을 친다. 후보면 이전 화면(HOME이거나 이전 카테고리/글)을
    그대로 둔 채 기다렸다가, 아래 각 확정 지점에서 revealPostArea()로
    한 번에 교체한다 — 다 그려진 화면 위로 흰 배경이 페이드인했다가
    걷히는 군더더기 전환(실사용자 리포트)을 없앤다. 응답이 오래
    걸릴 때만 작은 스피너(schedulePendingIndicator)가 잠깐 뜬다.

    아래의 모든 return 경로(banner / category 조회 실패 / posts 조회
    실패 / Skin 성공 / legacy 폴백)가 빠짐없이 revealPostArea()를
    거쳐야 한다 — 하나라도 빠지면 그 경로에서 화면이 열리지 않는다.
  */

  const comingFromHome =
    currentPostView ===
      "home";


  if (
    comingFromHome &&
    !maybeSkinCandidate
  ) {

    await showPostArea();

  }


  currentPostCategoryId =
    numericCategoryId;


  currentPostId =
    null;


  currentPostView =
    "category";


  closePostMenu();


  /*
    Skin 후보면 이전 화면(직전 글의 Skin이거나 legacy 상세)을
    아래 확정 지점까지 그대로 유지한다 — 여기서 postDetail을 숨기고
    빈 postList를 드러내면 응답을 기다리는 동안 화면이 비거나,
    이전 카테고리의 낡은 목록과 이번 글이 겹쳐 보인다.
    switchToCategoryScreen()이 확정 지점에서 이 셋을 한 번에 맞춘다.
  */

  if (!maybeSkinCandidate) {

    switchToCategoryScreen();

  }


  hidePostEditor();


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


        switchToCategoryScreen();


        postList.innerHTML =
          `
            <div class="post-empty">
              failed to load
            </div>
          `;


        /*
          #postArea 자체가 아직 안 열려 있을 수 있다(HOME에서 곧장
          들어온 Skin 후보 경로) — 열지 않으면 오류 문구도
          뒤로가기 버튼도 통째로 안 보인다.
        */

        await revealPostArea(
          false
        );

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
      PHASE 1E: banner 카테고리도 published Skin이 templates.banner를
      갖고 있으면 그 template으로 그린다(skin/skin-banner.js). post형
      CATEGORY와 동일하게 떨어진(detached) 스크래치 엘리먼트에 먼저
      그린 뒤, requestId가 여전히 최신일 때만 화면에 옮긴다 — 늦게
      도착한 응답이 그 사이 열린 다른 카테고리 화면을 덮어쓰지
      않게 하는 같은 이유다.

      templates.banner가 없거나(기존 HOME/CATEGORY/POST 스킨),
      소유자 본인이 열람 중이거나, 어떤 이유로든 실패하면 항상
      false가 돌아오고 아래 legacy 배너 경로가 지금까지와 100%
      동일하게 실행된다.
    */

    const bannerSkinRenderTarget =
      document.createElement(
        "div"
      );

    const renderedPublishedSkinBanner =
      await tryRenderPublishedSkinBanner(
        numericCategoryId,
        bannerSkinRenderTarget
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


    switchToCategoryScreen();


    if (renderedPublishedSkinBanner) {

      /*
        Skin이 배너 목록을 그렸으므로 legacy 그리드/폼은 접어 둔다.
        단 소유자 전용 진입점(+ 버튼, EDIT 토글)은 그대로 남긴다
        (PHASE 1E) — 배너 추가/수정은 목록을 legacy로 되돌리지 않고
        이 두 버튼에서 시작한다. 두 버튼 모두 #postArea가 소유한
        플랫폼 UI라 Skin 마크업 밖에 떠 있고, Skin은 이들의 존재를
        전혀 몰라도 된다.
      */

      setBannerSkinActive(true);


      if (bannerGrid) {

        bannerGrid.hidden =
          true;

      }


      if (bannerEditor) {

        bannerEditor.hidden =
          true;

      }


      /*
        "로그인했으면 주인"이 아니라 실제 이 사이트의 소유자인지로
        판단한다(isSiteOwnerSignedIn, posts/editor/posts-state.js) —
        다른 계정으로 로그인한 방문자에게 관리 진입점이 보이면 안
        된다. 실제 쓰기 권한은 별개로 RLS가 계속 강제한다.
      */

      const canManageBanners =
        await isSiteOwnerSignedIn();


      if (
        bannerEditToggleButton
      ) {

        bannerEditToggleButton.hidden =
          !canManageBanners;

        bannerEditToggleButton.setAttribute(
          "aria-pressed",
          "false"
        );

      }


      if (postAddButton) {

        postAddButton.hidden =
          !canManageBanners;

      }


      /*
        legacy post-header는 Skin mount contract가 통째로 숨긴다
        (posts/posts-base.css) — 소유자일 때만 그 안의 + / edit 두
        버튼을 화면 오른쪽 아래 떠 있는 도구로 되살리는 클래스를
        붙인다. 제목/뒤로가기는 계속 숨겨진 채다.
      */

      if (postContainer) {

        postContainer.classList.toggle(
          "post-container--banner-owner-tools",
          canManageBanners
        );

      }


      postList.innerHTML =
        "";


      while (
        bannerSkinRenderTarget.firstChild
      ) {

        postList.appendChild(
          bannerSkinRenderTarget.firstChild
        );

      }


      postList.hidden =
        false;


      /*
        post형 CATEGORY/POST와 동일한 mount contract — legacy
        헤더(제목+뒤로가기)를 숨기고 .post-area의 legacy padding을
        0으로 만들어, Skin이 자기 CSS로 정한 프레임 폭/여백이
        HOME과 정확히 같은 자리에 오게 한다(posts/posts-base.css).
      */

      if (postContainer) {

        postContainer.classList.add(
          "post-container--skin-active"
        );

      }


      postArea.classList.add(
        "post-area--skin-active"
      );


      await revealPostArea(
        true
      );


      return;

    }


    /*
      legacy 배너 화면 — 위에서 Skin 후보라고 미리 헤더를 숨겨
      뒀을 수 있으므로 여기서 확실히 legacy 레이아웃으로 되돌린다.
    */

    setBannerSkinActive(false);


    if (postContainer) {

      postContainer.classList.remove(
        "post-container--skin-active"
      );

    }


    postArea.classList.remove(
      "post-area--skin-active"
    );


    if (postList) {

      postList.hidden =
        true;

    }


    /*
      Skin이 없는 배너는 기존 legacy 연출(흰색 커튼)을 그대로 쓴다
      — 이미 열려 있으면 showPostArea()가 자체 guard로 즉시
      return한다.
    */

    await revealPostArea(
      false
    );


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


  if (!maybeSkinCandidate) {

    postList.hidden =
      false;

  }


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


    switchToCategoryScreen();


    postList.innerHTML =
      `
        <div class="post-empty">
          failed to load
        </div>
      `;


    await revealPostArea(
      false
    );


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


  /*
    Skin 후보 경로는 여기까지 이전 화면을 그대로 유지했다 — 이제서야
    글 상세를 접고 목록을 편다(switchToCategoryScreen). 그 다음
    완성된 Skin 내용을 옮기고, 마지막으로 화면을 드러낸다.
  */

  switchToCategoryScreen();


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

    await revealPostArea(
      true
    );


    return;

  }


  renderPostListItems();


  await revealPostArea(
    false
  );

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



