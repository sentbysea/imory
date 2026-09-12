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
            /*
              FOLDER-1: folder_id/sort_order를 함께 읽는다. 읽기
              목록 자체는 지금까지처럼 created_at DESC로 그리지만
              (폴더를 모르는 화면의 순서를 바꾸지 않는다는 원칙),
              ?manage=1 관리 트리가 이 배열을 그대로 재사용해
              폴더 배치를 세우기 때문에 여기서 함께 받아 둔다.
              두 컬럼 모두 SELECT GRANT에 추가돼 있다
              (20260908110000_add_posts_folder_id_sort_order.sql).
            */
            `
            id,
            title,
            created_at,
            visibility,
            folder_id,
            sort_order
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

   PHASE 1E 후속: 소유자 본인도 여기서 Skin을 본다. 기존 관리
   화면(글 추가 / 편집 모드 bulk 삭제 / 선택 바)은 사라지지 않고,
   명시적인 관리 진입에서만 열린다 — 관리 진입 URL(?manage=1,
   core/lib/site-path.js)이나 Skin 위에 떠 있는 edit 토글
   (posts-view-list-select.js의 togglePostListEditMode). 그래서 이
   함수는 "누가 보고 있는가"를 전혀 모르고, 그 판단은 호출자인
   openCategoryPage()에 있다.
========================================================== */

/*
  두 Skin 시도 함수(post형 CATEGORY, banner)가 공유하는 사전 판정:
  "이 라우트가 published Skin 후보인가". 후보면 소유자의 user_id를,
  아니면 null을 돌려준다.

  ★ PHASE 1E 후속으로 여기서 "지금 보는 사람이 소유자인가"를 더
  이상 보지 않는다. 예전에는 소유자 본인이면 Skin을 통째로 건너뛰고
  legacy 관리 화면을 보여줬는데, 그 결과 소유자만 자기 사이트를
  방문자와 다르게 보게 됐다. 이제 두 페이지 모두 소유자에게도 Skin을
  보여주고, 기존 관리 화면은 명시적인 관리 진입(?manage=1 또는 떠
  있는 edit 토글)일 때만 연다 — 그 판단은 openCategoryPage()와
  각 edit 토글이 isSiteOwnerSignedIn()으로 직접 한다.

  -> ownerId(문자열) | null
*/

async function resolvePublishedSkinRouteOwnerId() {

  let owner;

  try {

    owner =
      await getSiteOwner();

  } catch (err) {

    console.error(
      "[posts-view-list] getSiteOwner failed",
      err
    );

    return null;

  }


  if (
    !owner ||
    !owner.scoped ||
    !owner.ownerId
  ) {

    return null;

  }


  return owner.ownerId;

}


/*
  GALLERY-1: page는 주소의 ?page=N(없으면 1), outcome은 렌더러가
  "실제로 그린 페이지"를 적어 넣는 그릇이다 — 반환값은 지금까지처럼
  boolean 하나로 두고(호출자의 모든 분기가 그 계약 위에 있다),
  추가 정보만 이 객체로 받는다.
*/

async function tryRenderPublishedSkinCategory(
  categoryId,
  container,
  page,
  outcome
) {

  const ownerId =
    await resolvePublishedSkinRouteOwnerId();

  if (!ownerId) {

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
      container,
      page,
      outcome
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

   post형 CATEGORY와 정책이 같다(PHASE 1E 후속): 소유자 본인도
   Skin을 본다. 배너 추가/수정은 목록이 아니라 플랫폼이 소유한
   진입점(+ 버튼 / EDIT 토글, openCategoryPage의 banner 분기 참고)에
   있으므로, 목록을 legacy로 되돌리지 않고도 그대로 유지된다.

   이 함수도 절대 throw하지 않는다.
========================================================== */

async function tryRenderPublishedSkinBanner(
  categoryId,
  container
) {

  const ownerId =
    await resolvePublishedSkinRouteOwnerId();

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
    글 상세를 접으면 그 화면 전용 소유자 도구(수정 진입점)도 같이
    접는다 — 목록 화면의 + / edit는 아래 updatePostAddButton()이
    따로 정한다.
  */

  if (
    postManageToggleButton
  ) {

    postManageToggleButton.hidden =
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
    updateUrl = true,
    manage = false,

    /*
      GALLERY-1: 갤러리 카테고리의 몇 번째 페이지인가(주소의 ?page=N).
      목록 표시 카테고리나 갤러리를 모르는 스킨에서는 아무 의미가
      없고, 아래에서 주소의 ?page=도 정리된다.
    */
    page = 1
  } = options;


  const requestedPage =
    Number.isFinite(Number(page)) && Number(page) >= 1
      ? Math.floor(Number(page))
      : 1;


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


  /*
    PHASE 1E 관리 진입 계약 — ?manage=1(또는 openCategoryPage의
    manage 옵션)은 "기존 관리 화면을 열어달라"는 **요청**일 뿐이다.
    실제로 열지는 여기서 소유자인지 다시 확인하고 결정한다
    (isSiteOwnerSignedIn, posts/editor/posts-state.js) — 주소를 직접
    쳐서 들어온 방문자나 다른 계정은 그냥 평소의 카테고리 화면을
    본다. manage가 false인 평소 탐색에서는 && 단락 평가 때문에 추가
    조회가 아예 일어나지 않는다.

    관리 화면을 여는 경우에만 Skin 후보에서 제외한다 — 그 외에는
    소유자도 방문자와 똑같이 CATEGORY Skin을 본다.
  */

  const wantsManageScreen =
    manage === true &&
    await isSiteOwnerSignedIn();


  /*
    FOLDER-1 후속: 관리 화면에서는 legacy 헤더의 떠 있는 edit / ＋
    를 감춘다 — 관리 action은 폴더 트리 자신의 툴바(+ folder /
    + post / − delete / done)가 전부 갖는다. 아래
    updatePostAddButton()보다 **먼저** 정해야 하므로 여기서 세운다
    (posts/view/posts-view-transition.js).
  */

  if (
    typeof setCategoryManageScreenActive ===
    "function"
  ) {

    setCategoryManageScreenActive(
      wantsManageScreen
    );

  }


  const maybeSkinCandidate =
    Boolean(
      owner.scoped &&
      owner.ownerId
    ) &&
    !wantsManageScreen;


  /*
    관리 패널(목록 관리)은 스킨 화면 위에서 명시적으로 연 것이라
    빈 화면을 채우는 연출이 필요 없다 — legacy 커튼(380ms 흰색
    페이드)도, 그 사이를 메우던 "..."/"loading..." 자리표시도
    쓰지 않는다. 실사용자가 본 "관리로 넘어갈 때 옛 로딩 화면이
    한 번 스친다"가 이 두 가지였다.

    스킨을 쓰지 않는 배포의 평소 탐색(wantsManageScreen이 false)은
    지금까지와 완전히 동일하게 커튼과 자리표시를 그대로 쓴다.
  */

  const useInstantReveal =
    maybeSkinCandidate ||
    wantsManageScreen;


  /*
    revealPostArea() 자체는 지금까지와 같은 인자를 쓴다 — 관리
    패널로 들어오는 경로는 위에서 이미 showPostAreaInstant()로
    #postArea를 열어 두었고, 그 상태에서 showPostArea()는 자체
    guard로 즉시 return하므로 커튼이 다시 뜨지 않는다. Skin 렌더가
    실패해 legacy로 폴백하는 경로의 연출은 건드리지 않는다.
  */


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

  setCategorySkinActive(false);


  /*
    PHASE 1H: 스킨이 그린 소유자 진입점 판정은 화면마다 새로 한다 —
    이전 화면의 판정이 남아 이번 화면의 플랫폼 도구를 잘못 접지
    않게 진입점에서 한 번 비운다(posts-view-transition.js).
  */

  setSkinOwnerEntriesForScreen(null);


  if (postContainer) {

    postContainer.classList.remove(
      "post-container--owner-tools"
    );

  }


  const numericCategoryId =
    Number(
      categoryId
    );


  /*
    PHASE 1H: 글을 열면서 기억해 둔 이 목록의 스크롤 위치(있다면)를
    여기서 한 번만 꺼낸다(skin/skin-post-focus.js) — 꺼내는 순간
    메모가 비므로, 아래 어느 경로로 끝나든 낡은 위치가 다음 화면까지
    따라가지 않는다. 실제로 되돌리는 건 스킨 CATEGORY 확정 지점이다.
  */

  const listScrollRestoreTop =
    takeSkinListScroll(
      `category:${numericCategoryId}`
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


  if (comingFromHome) {

    if (wantsManageScreen) {

      /*
        관리 패널은 legacy 레이아웃 안에서 열리므로 #postArea를
        지금 열어 둬야 한다 — 다만 커튼 없이 연다.
      */

      showPostAreaInstant();

    }

    else if (!maybeSkinCandidate) {

      await showPostArea();

    }

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
    useInstantReveal
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

    if (!useInstantReveal) {

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

      if (useInstantReveal) {

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
      wantsManageScreen
        ? buildSiteManageUrl(
            buildPostRoute(
              `/category/${categoryId}`
            )
          )
        : /*
            GALLERY-1: 갤러리 페이지 이동도 평범한 카테고리 이동이다 —
            주소에 ?page=N만 붙는다(1페이지는 붙지 않는다). 아래
            렌더 결과에 따라 유효 범위로 다시 정정될 수 있다.
          */
          buildSiteCategoryPageUrl(
            buildPostRoute(
              `/category/${categoryId}`
            ),
            requestedPage
          )
    );

  }


  /*
    PHASE 1H: 열어 줄 수 없는 요청 쿼리는 주소에서도 지운다(기준 문서
    §2-2 7번). updateUrl이 true인 경로는 바로 위 pushState가 이미
    쿼리 없는 주소를 쓰지만, 직접 접속/새로고침/뒤로가기(updateUrl:
    false)로 들어온 ?manage=1은 지금까지 주소에 그대로 남아 있었다 —
    화면은 평소 스킨인데 주소만 관리 요청인 불일치다. POST 쪽
    ?manage=1이 posts-router-init.js에서 이미 하는 정리와 같다.
  */

  if (
    !updateUrl &&
    manage === true &&
    !wantsManageScreen &&
    isSiteManageRequested(window.location.search)
  ) {

    history.replaceState(
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
          "post-container--owner-tools",
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
        배너 스킨도 CATEGORY/POST와 같은 규칙으로 소유자 도구를
        앉힌다(posts/view/posts-view-owner-tools.js).
      */

      if (
        typeof mountPlatformOwnerTools ===
        "function"
      ) {

        mountPlatformOwnerTools(
          postList
        );

      }


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


  /*
    FOLDER-1: ?manage=1은 "이 카테고리를 정리하겠다"는 요청이므로
    관리 화면(폴더 트리 + 체크박스 + 선택삭제 바)을 바로 연다.
    예전에는 여기서 항상 편집 모드를 끄고 평면 목록을 보여준 뒤
    사용자가 edit을 한 번 더 눌러야 했는데, PHASE 1H가 스킨의
    manageHref를 이 주소로 보내기 시작한 뒤로는 "관리하러 왔는데
    읽기 목록이 나온다"가 됐다. Skin 위의 edit 토글로 들어오는
    경로(togglePostListEditMode)는 지금까지와 동일하다.

    선택 상태는 화면을 새로 열 때마다 항상 비운다.
  */

  postListEditModeOn =
    wantsManageScreen;


  selectedPostIdsForDelete =
    new Set();


  /*
    FOLDER-1 후속: 관리 화면은 항상 "정리" 상태로 시작한다 —
    삭제 모드(체크박스 + 하단 선택삭제 바)는 상단 − delete를
    누른 뒤에만 켜진다(posts/manage/posts-folder-tree.js).
  */

  if (
    typeof resetPostFolderDeleteMode ===
    "function"
  ) {

    resetPostFolderDeleteMode();

  }


  /*
    FOLDER-1 후속: 하단 선택삭제 바는 관리 화면을 여는 것만으로는
    뜨지 않는다 — 폴더 트리에서는 − delete로 삭제 모드에 들어가
    하나 이상 골랐을 때만, 트리를 못 그린 평면 폴백에서는
    renderPostListItems()의 그 분기가 다시 편다.
  */

  if (
    postListSelectBar
  ) {

    postListSelectBar.hidden =
      true;

  }


  postListEditToggleButton
    ?.setAttribute(
      "aria-pressed",
      String(postListEditModeOn)
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

  /*
    PHASE 1E: 소유자가 관리 화면을 명시적으로 요청했을 때만 Skin을
    건너뛴다(위 wantsManageScreen). 그 외에는 소유자든 방문자든
    동일하게 Skin을 시도하고, 실패하면 지금까지처럼 legacy 목록으로
    조용히 폴백한다.
  */

  const skinCategoryOutcome =
    {
      isGallery: false,
      effectivePage: null
    };

  const renderedPublishedSkinCategory =
    wantsManageScreen
      ? false
      : await tryRenderPublishedSkinCategory(
          numericCategoryId,
          skinRenderTarget,
          requestedPage,
          skinCategoryOutcome
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


  /* =========================================================
     GALLERY-1 — 주소와 실제 화면을 일치시킨다

     세 경우에 주소를 정정한다(전부 replaceState — 사용자가 누른
     적 없는 항목을 history에 쌓지 않는다):

       1) 범위를 벗어난 ?page=99 → Context가 마지막 페이지로 맞췄다
       2) 갤러리가 아닌데 ?page=가 붙어 있다(설정을 목록으로 되돌렸거나,
          갤러리를 모르는 스킨이거나, 주소를 직접 친 경우)
       3) 갤러리인데 1페이지라 쿼리가 필요 없다

     기준 문서 §2-2 7번("열어 줄 수 없는 요청 쿼리는 주소에서도
     지운다")을 그대로 따른다 — POST의 ?manage=1 정리와 같은 결.
  ========================================================== */

  const effectivePage =
    renderedPublishedSkinCategory &&
    skinCategoryOutcome.isGallery &&
    skinCategoryOutcome.effectivePage
      ? skinCategoryOutcome.effectivePage
      : 1;


  if (
    effectivePage !== requestedPage ||
    (
      !skinCategoryOutcome.isGallery &&
      getSiteRequestedPage(window.location.search) !== 1
    )
  ) {

    history.replaceState(
      {
        page:
          "category",

        categoryId:
          numericCategoryId
      },
      "",
      buildSiteCategoryPageUrl(
        buildPostRoute(
          `/category/${categoryId}`
        ),
        effectivePage
      )
    );

  }


  /*
    Skin 후보 경로는 여기까지 이전 화면을 그대로 유지했다 — 이제서야
    글 상세를 접고 목록을 편다(switchToCategoryScreen). 그 다음
    완성된 Skin 내용을 옮기고, 마지막으로 화면을 드러낸다.
  */

  switchToCategoryScreen();


  if (renderedPublishedSkinCategory) {

    setCategorySkinActive(true);


    /*
      PHASE 1H: 이번에 그려진 스킨이 자기 레이아웃 안에 관리(EDIT)나
      작성(WRITE) 진입점을 직접 두었는지 본다 — 화면에 옮기기 전의
      스크래치 엘리먼트에서 읽으므로 이 판정은 이번 렌더 결과에만
      근거한다(skin/skin-owner-entry.js).
    */

    setSkinOwnerEntriesForScreen(
      resolveSkinOwnerEntries(
        skinRenderTarget
      )
    );


    postList.innerHTML =
      "";


    while (
      skinRenderTarget.firstChild
    ) {

      postList.appendChild(
        skinRenderTarget.firstChild
      );

    }


    /*
      소유자에게는 배너와 똑같은 방식으로 떠 있는 플랫폼 도구
      (+ / edit)를 남긴다 — legacy post-header는 Skin mount
      contract가 계속 숨기고, 그 안의 두 버튼만 되살린다
      (posts/posts-base.css).

      PHASE 1H: 단, 스킨이 이미 같은 동작을 자기 자리에 그렸다면 그
      버튼은 접는다. updatePostAddButton()도 위에서 방금 채운 같은
      값을 보므로(setSkinOwnerEntriesForScreen), 그 비동기 호출이
      이 지점보다 먼저 끝나든 나중에 끝나든 결과가 같다. 두 버튼이
      모두 접히면 떠 있는 도구 껍데기만 남으므로 클래스 자체를 켜지
      않는다 — 스킨에 진입점이 하나도 없으면 지금까지와 똑같이
      플랫폼 도구가 그대로 남는다.
    */

    const canManagePosts =
      await isSiteOwnerSignedIn();


    if (postAddButton) {

      postAddButton.hidden =
        !canManagePosts ||
        getSkinOwnerEntriesForScreen().write;

    }


    if (postListEditToggleButton) {

      postListEditToggleButton.hidden =
        !canManagePosts ||
        getSkinOwnerEntriesForScreen().manage;

    }


    const needsPlatformOwnerTools =
      canManagePosts &&
      (
        Boolean(postAddButton && !postAddButton.hidden) ||
        Boolean(postListEditToggleButton && !postListEditToggleButton.hidden)
      );


    if (postContainer) {

      postContainer.classList.toggle(
        "post-container--owner-tools",
        needsPlatformOwnerTools
      );

    }


    /*
      스킨의 줄에 앉힌다(posts/view/posts-view-owner-tools.js).
      CATEGORY 스킨은 #postList 안에 그려진다.
    */

    if (
      typeof mountPlatformOwnerTools ===
      "function"
    ) {

      mountPlatformOwnerTools(
        postList
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


    /*
      PHASE 1H: 글을 읽고 돌아온 목록이면 떠날 때의 위치로 되돌린다 —
      목록을 다시 그린 직후라 이 프레임에는 아직 새 높이가 없을 수
      있어 다음 프레임에 한 번 더 확정한다(skin/skin-post-focus.js).
    */

    if (listScrollRestoreTop !== null) {

      applySkinScrollTop(
        postArea,
        listScrollRestoreTop
      );

    }


    return;

  }


  /*
    FOLDER-1: 관리 화면으로 들어왔으면 폴더 행을 먼저 읽어 둔다 —
    renderPostListItems()는 동기 함수라 여기서 기다려야 트리가 첫
    렌더부터 폴더와 함께 그려진다. 실패하면 rows가 준비되지 않은
    채로 남고, 트리 대신 기존 평면 목록이 그려진다(관리 화면 자체는
    열린다).
  */

  if (
    postListEditModeOn &&
    typeof loadPostFolderRows === "function"
  ) {

    await loadPostFolderRows(
      numericCategoryId
    );


    if (
      requestId !==
      categoryPageRequestSeq
    ) {

      return;

    }


    updatePostListSelectBar();

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


  /*
    PHASE 1E: Skin이 목록을 그리고 있고 관리 모드도 아니면 legacy
    목록은 화면에 없다 — 저장/삭제 후 호출되는 경로가 Skin이 그린
    DOM을 덮어쓰지 않게 한다(renderBannerGrid의 같은 가드와 동일한
    이유). 관리 모드일 때는 이 목록이 곧 관리 화면이므로 정상
    렌더한다.
  */

  if (
    categorySkinActive &&
    !postListEditModeOn
  ) {

    return;

  }


  /*
    FOLDER-1: 관리 모드에서는 평면 목록 대신 폴더 트리를 그린다
    (posts/manage/posts-folder-tree.js). 트리 안에도 기존 체크박스와
    하단 선택삭제 바가 그대로 있으므로 "정리 모드"와 "삭제 모드"가
    갈라지지 않는다(사용자 결정 F-2).

    renderPostFolderTree()는 이 카테고리의 폴더 행이 아직 준비되지
    않았으면 false를 돌려준다 — 그 경우 아래 기존 평면 목록으로
    그대로 내려간다. 폴더 조회가 실패해도 관리 화면은 열린다.

    글이 하나도 없어도 폴더는 있을 수 있으므로, 아래 "no posts yet"
    보다 먼저 판단해야 한다.
  */

  if (
    postListEditModeOn &&
    typeof renderPostFolderTree === "function" &&
    renderPostFolderTree()
  ) {

    return;

  }


  /*
    FOLDER-1 후속: 여기까지 왔다는 건 폴더 트리를 그리지 못했다는
    뜻이다(폴더 조회 실패 등). 그 평면 관리 목록은 지금까지처럼
    모든 행에 체크박스를 달고 있으므로, 하단 선택삭제 바도
    지금까지처럼 관리 모드면 곧바로 편다.
  */

  if (postListSelectBar) {

    postListSelectBar.hidden =
      !postListEditModeOn;

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



