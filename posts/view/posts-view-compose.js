/* =========================================================
   POSTS VIEW - 작성 진입 (WRITE)

   스킨의 WRITE 링크(skin/skin-context.js의 viewer.writeHref)와
   ?write=1 주소(core/lib/site-path.js)가 도착하는 곳.

   예전에는 WRITE가 카테고리 관리 목록(?manage=1)으로 보내고
   거기서 + 를 한 번 더 누르게 했다 — 실사용자에게는 "글을 쓰려고
   눌렀는데 옛 LOG 목록이 먼저 나온다"로 보였다. 이 파일은 그
   중간 화면을 없애고 곧장 작성 폼을 연다.

   대상 카테고리를 정하는 규칙(요청서 1절):
   - categoryId가 이미 정해져 있으면(카테고리의 + 버튼, 또는
     /:slug/category/:id?write=1) 그대로 쓴다.
   - 정해지지 않았고(HOME의 WRITE) POST 카테고리가 하나뿐이면
     그 카테고리로 바로 연다.
   - 여러 개면 고르게 한다(아래 선택 패널).
   - 하나도 없으면 "카테고리부터 만들어야 한다"고 안내하고 기존
     관리 진입점(/admin/)을 준다.

   권한: ?write=1은 요청일 뿐이라 여기서 실제 소유자인지 다시
   확인한다(isSiteOwnerSignedIn, posts/editor/posts-state.js).
   소유자가 아니면 작성 화면을 열지 않고 주소에서 ?write=1을
   지운 뒤 평소의 스킨 화면으로 돌려보낸다 — 주소를 직접 쳐도
   같은 검사를 거친다. 실제 쓰기 권한은 여전히 저장 시점의
   user_id 필터와 RLS가 강제한다.

   선택 패널은 스킨 HTML 밖의 플랫폼 UI다(#postComposePicker,
   posts/posts.html) — 스킨은 자기 안에 카테고리 선택 화면이
   있다는 사실을 전혀 몰라도 된다.

   의존(먼저 로드돼야 함): posts/editor/posts-refs.js(DOM 참조),
   posts/editor/posts-state.js(isSiteOwnerSignedIn),
   posts/view/posts-view-transition.js(enterPlatformScreen),
   posts/view/posts-view-editor-load.js(openNewPostEditor).
   실제 호출은 전부 posts-router-init.js가 실행된 뒤에 일어난다.
========================================================== */


/* =========================================================
   START COMPOSE
========================================================== */

async function startPostCompose(
  options = {}
) {

  const {
    categoryId = null,
    updateUrl = true
  } = options;


  /*
    소유자가 아니면(로그아웃/다른 계정) 작성 화면을 아예 열지
    않는다. 주소에 남은 ?write=1도 지워서 새로고침하면 다시
    작성 화면으로 튀는 불일치를 만들지 않는다.
  */

  if (
    !await isSiteOwnerSignedIn()
  ) {

    await leaveComposeRequest(
      categoryId
    );


    return false;

  }


  if (
    categoryId !== null &&
    categoryId !== undefined
  ) {

    await openNewPostEditor(
      Number(
        categoryId
      ),
      {
        updateUrl
      }
    );


    return true;

  }


  const categories =
    await fetchOwnerPostCategories();


  if (categories.length === 1) {

    await openNewPostEditor(
      Number(
        categories[0].id
      ),
      {
        updateUrl
      }
    );


    return true;

  }


  openComposeCategoryPicker(
    categories,
    {
      updateUrl
    }
  );


  return true;

}


/*
  ?write=1을 처리할 수 없는(소유자가 아닌) 요청을 평소 화면으로
  돌려보낸다 — 주소에서 쿼리만 떼고, 그 경로가 원래 보여주는
  화면을 그대로 연다.
*/

async function leaveComposeRequest(
  categoryId
) {

  if (
    categoryId !== null &&
    categoryId !== undefined
  ) {

    history.replaceState(
      {
        page: "category",

        categoryId:
          Number(
            categoryId
          )
      },
      "",
      buildPostRoute(
        `/category/${categoryId}`
      )
    );


    await openCategoryPage(
      Number(
        categoryId
      ),
      {
        updateUrl:
          false
      }
    );


    return;

  }


  history.replaceState(
    {
      page: "home"
    },
    "",
    buildPostRoute(
      "/"
    )
  );


  await closePostArea({
    updateUrl:
      false,

    animate:
      false
  });

}


/* =========================================================
   OWNER POST CATEGORIES

   home/categories.js가 메뉴를 그릴 때 쓰는 것과 같은 조회
   규칙(owner.scoped면 user_id로 좁힌다) — 새 조회 경로를
   만들지 않는다. 여기서만 type === "post"로 거른다(배너
   카테고리에는 글을 쓸 수 없다).
========================================================== */

async function fetchOwnerPostCategories() {

  const owner =
    await getSiteOwner();


  let query =
    supabaseClient
      .from(
        "categories"
      )
      .select(
        "id, name, type, sort_order"
      );


  if (owner.scoped) {

    query =
      query.eq(
        "user_id",
        owner.ownerId
      );

  }


  const {
    data,
    error
  } =
    await query.order(
      "sort_order",
      {
        ascending: true
      }
    );


  if (error) {

    console.error(
      "[compose] categories 조회 실패:",
      error
    );


    return [];

  }


  return (
    data ||
    []
  ).filter(
    (category) =>
      (
        category.type ||
        "post"
      ) === "post"
  );

}


/* =========================================================
   CATEGORY PICKER

   카테고리가 여러 개일 때만 잠깐 거치는 화면. 고르면 곧바로
   그 카테고리의 작성 폼이 열린다(옛 목록은 거치지 않는다).
   하나도 없으면 같은 자리에서 안내만 보여준다.
========================================================== */

function openComposeCategoryPicker(
  categories,
  options = {}
) {

  const {
    updateUrl = true
  } = options;


  if (!postComposePicker) {

    return;

  }


  /*
    ?write=1 주소로 곧장 들어온 경우(updateUrl:false)에는 돌아갈
    진입 전 화면이 없다 — 그 주소를 복귀 지점으로 기억하면 닫아도
    ?write=1이 남는다(posts/view/posts-view-editor-load.js의 같은
    guard 참고).
  */

  if (updateUrl) {

    rememberPlatformScreenReturn();

  }


  enterPlatformScreen();

  hideOtherPostScreens();

  hidePostEditor();


  currentPostView =
    "compose";


  closePostMenu();


  if (postPageTitle) {

    postPageTitle.textContent =
      "NEW POST";

  }


  if (postComposePickerList) {

    postComposePickerList.innerHTML =
      "";

  }


  const hasCategories =
    categories.length > 0;


  if (postComposePickerHint) {

    postComposePickerHint.textContent =
      hasCategories
        ? "어느 카테고리에 쓸까요?"
        : "글을 쓰려면 글 카테고리가 먼저 필요합니다. 설정에서 카테고리를 만든 뒤 다시 시도해 주세요.";

  }


  if (postComposePickerAdmin) {

    /*
      github.io처럼 sub-path에 배포된 경우까지 맞추려면 관리자
      경로도 SITE_BASE_PATH를 앞에 붙여야 한다(skin-context.js의
      adminHref와 같은 규칙) — HTML에 박아 둔 "/admin/"을 여기서
      한 번 정확한 값으로 덮어쓴다.
    */

    postComposePickerAdmin.href =
      SITE_BASE_PATH + "/admin/";


    postComposePickerAdmin.hidden =
      hasCategories;

  }


  if (
    hasCategories &&
    postComposePickerList
  ) {

    categories.forEach(
      (category) => {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "post-compose-picker-item";


        button.textContent =
          category.name ||
          "이름 없는 카테고리";


        button.dataset.categoryId =
          String(
            category.id
          );


        postComposePickerList.appendChild(
          button
        );

      }
    );

  }


  postComposePicker.hidden =
    false;


  if (updateUrl) {

    history.pushState(
      {
        page: "compose"
      },
      "",
      buildSiteComposeUrl(
        buildPostRoute(
          "/"
        )
      )
    );

  }

}


/*
  선택 패널을 닫는다 — 진입 전 화면으로 돌아간다(에디터의
  취소와 같은 복귀 규칙을 그대로 쓴다).
*/

async function closeComposeCategoryPicker() {

  if (postComposePicker) {

    postComposePicker.hidden =
      true;

  }


  await returnToPlatformScreenOrigin();

}
