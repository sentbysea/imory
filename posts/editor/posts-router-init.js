/* =========================================================
   POSTS - ROUTER / INIT

   posts.js 분할본 중 마지막. DOM 참조/상태는
   posts-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: URL 라우팅(/post/:id, /category/:id 등) 처리,
   브라우저 뒤로/앞으로가기, 페이지 로드 시 초기 실행부
   (여기서 startPostRouter() 등을 실제로 호출함 — 이
   파일이 posts/editor/ 안에서 제일 마지막에 로드돼야 함).
========================================================== */


/* =========================================================
   ROUTER
========================================================== */

async function handlePostRoute() {

  const pathname =
    getPostRoutePath();


  const postMatch =
    pathname.match(
      /^\/post\/(\d+)\/?$/
    );


  if (postMatch) {

    await openPostPage(
      Number(
        postMatch[1]
      ),
      {
        updateUrl:
          false
      }
    );


    return;

  }


  const categoryMatch =
    pathname.match(
      /^\/category\/(\d+)\/?$/
    );


  if (categoryMatch) {

    /*
      PHASE 1E: ?manage=1로 들어온(또는 그 상태에서 새로고침/
      뒤로가기 한) 경우 관리 화면을 그대로 복원한다 — 실제 소유자
      검사는 openCategoryPage()가 다시 한다.
    */

    await openCategoryPage(
      Number(
        categoryMatch[1]
      ),
      {
        updateUrl:
          false,

        manage:
          isSiteManageRequested(
            window.location.search
          )
      }
    );


    return;

  }


  await closePostArea({
    updateUrl:
      false,

    animate:
      false
  });

}



/* =========================================================
   404 REDIRECT RESTORE
========================================================== */

async function startPostRouter() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const route =
    params.get(
      "route"
    );


  if (route) {

    const restored =
      route.startsWith("/")
        ? route
        : `/${route}`;


    history.replaceState(
      {},
      "",
      buildPostRoute(
        restored
      )
    );

  }


  await handlePostRoute();

}



/* =========================================================
   BROWSER BACK / FORWARD
========================================================== */

window.addEventListener(
  "popstate",
  async () => {

    await handlePostRoute();

  }
);



/* =========================================================
   START
========================================================== */

syncEditorPreviewMode();

loadPostPresetOptions();

startPostRouter();
