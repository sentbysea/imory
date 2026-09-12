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


  const search =
    window.location.search;


  const postMatch =
    pathname.match(
      /^\/post\/(\d+)\/?$/
    );


  if (postMatch) {

    const postId =
      Number(
        postMatch[1]
      );


    /*
      ?edit=1(직접 접속/새로고침/뒤로가기 포함)이면 옛 상세 화면을
      한 번 그렸다가 폼을 여는 중간 단계 없이 곧장 수정 폼을 연다.
      작성자가 아니면 openPostEditor()가 열지 않고 주소만 정리한
      뒤 평소의 읽기 화면으로 되돌린다.
    */

    if (
      isSiteEditRequested(
        search
      )
    ) {

      await openPostEditor(
        postId,
        {
          updateUrl:
            false
        }
      );


      return;

    }


    /*
      POST에는 더 이상 별도의 관리 화면이 없다(수정은 ?edit=1로 곧장
      폼을 연다) — 옛 ?manage=1 주소로 들어오면 읽기 화면을 보여주되
      주소에서 그 쿼리를 지운다. 그대로 두면 화면은 읽기인데 새로고침
      하면 다시 관리 요청이 되는 불일치가 남는다.
    */

    if (
      isSiteManageRequested(
        search
      )
    ) {

      history.replaceState(
        {
          page: "post",

          postId
        },
        "",
        buildPostRoute(
          `/post/${postId}`
        )
      );

    }


    await openPostPage(
      postId,
      {
        updateUrl:
          false
      }
    );


    return;

  }


  /*
    FOLDER-2: /category/:cid/folder/:fid — 폴더 페이지. ?series=1이면
    이어읽기(Series Viewer), 없으면 목록이다(읽기 모드 요청).
    category 패턴보다 먼저 본다(그 패턴은 끝 앵커가 있어 겹치지
    않지만 읽는 순서를 계층대로 둔다). 스킨에 templates.folder가
    없거나 폴더가 없으면 openFolderPage()가 그 카테고리로 돌려보내고
    주소도 정리한다(posts/view/posts-view-folder.js).
  */

  const folderMatch =
    pathname.match(
      /^\/category\/(\d+)\/folder\/(\d+)\/?$/
    );


  if (folderMatch) {

    /*
      FOLDER-3: ?write=1이면 이 폴더에 새 글을 쓰는 폼을 곧장 연다 —
      카테고리와 폴더가 모두 미리 골라진 채로 열린다. 소유자가
      아니면 startPostCompose()가 주소를 정리하고 평소의 폴더
      화면으로 돌려보낸다(카테고리 ?write=1과 같은 규칙).
    */

    if (
      isSiteComposeRequested(
        search
      )
    ) {

      await startPostCompose({
        categoryId:
          Number(
            folderMatch[1]
          ),

        folderId:
          Number(
            folderMatch[2]
          ),

        updateUrl:
          false
      });


      return;

    }


    await openFolderPage(
      Number(
        folderMatch[1]
      ),
      Number(
        folderMatch[2]
      ),
      {
        updateUrl:
          false,

        series:
          isSiteSeriesRequested(
            window.location.search
          )
      }
    );


    return;

  }


  const categoryMatch =
    pathname.match(
      /^\/category\/(\d+)\/?$/
    );


  if (categoryMatch) {

    const categoryId =
      Number(
        categoryMatch[1]
      );


    /*
      ?write=1이면 이 카테고리의 작성 폼을 곧장 연다 — 목록을
      먼저 그리지 않는다. 소유자가 아니면 startPostCompose()가
      주소를 정리하고 평소의 카테고리 화면으로 돌려보낸다.
    */

    if (
      isSiteComposeRequested(
        search
      )
    ) {

      await startPostCompose({
        categoryId,

        updateUrl:
          false
      });


      return;

    }


    /*
      PHASE 1E: ?manage=1로 들어온(또는 그 상태에서 새로고침/
      뒤로가기 한) 경우 목록 관리 패널을 그대로 복원한다 — 실제
      소유자 검사는 openCategoryPage()가 다시 한다.
    */

    /*
      GALLERY-1: ?page=N은 갤러리 카테고리의 읽기 위치다. 직접 접속·
      새로고침·뒤로가기 어디서 들어와도 같은 페이지가 열려야 하므로
      여기서 그대로 넘긴다 — 유효 범위 판정과 주소 정정은 받는 쪽
      (openCategoryPage)이 실제 글 수를 안 뒤에 한다.
    */

    await openCategoryPage(
      categoryId,
      {
        updateUrl:
          false,

        manage:
          isSiteManageRequested(
            search
          ),

        page:
          getSiteRequestedPage(
            search
          )
      }
    );


    return;

  }


  /*
    HOME 경로 + ?write=1 — 아직 대상 카테고리가 정해지지 않은
    작성 요청이다(WRITE 링크의 기본형). 글 카테고리가 하나라도
    있으면 첫 카테고리의 작성 폼을, 하나도 없으면 안내를 연다.
  */

  if (
    pathname === "/" &&
    isSiteComposeRequested(
      search
    )
  ) {

    await startPostCompose({
      updateUrl:
        false
    });


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

   작성/수정 화면이 자기 주소(?write=1 / ?edit=1)를 갖게 되면서
   "뒤로가기 한 번에 쓰던 글이 사라지는" 경로가 실제로 생겼다.
   popstate는 취소할 수 없으므로, 저장하지 않은 입력이 있는데
   사용자가 남겠다고 하면 방금 떠난 항목을 다시 밀어 넣어
   화면과 주소를 원래대로 되돌린다.
========================================================== */

window.addEventListener(
  "popstate",
  async () => {

    if (
      typeof postEditorHasUnsavedChanges === "function" &&
      postEditorHasUnsavedChanges() &&
      !confirm(
        "저장하지 않은 내용이 있습니다. 화면을 나갈까요?"
      )
    ) {

      history.pushState(
        {
          page:
            currentEditorMode === "edit"
              ? "edit"
              : "compose"
        },
        "",
        currentEditorMode === "edit" && editorSourcePostId
          ? buildSiteEditUrl(
              buildPostRoute(
                `/post/${editorSourcePostId}`
              )
            )
          : buildSiteComposeUrl(
              currentPostCategoryId
                ? buildPostRoute(
                    `/category/${currentPostCategoryId}`
                  )
                : buildPostRoute(
                    "/"
                  )
            )
      );


      return;

    }


    /*
      뒤로/앞으로 이동으로 에디터를 실제로 떠나는 경우, 기억해 둔
      복귀 지점은 더 이상 의미가 없다 — 주소가 곧 목적지다.
    */

    if (
      typeof forgetPlatformScreenReturn === "function"
    ) {

      forgetPlatformScreenReturn();

    }


    await handlePostRoute();

  }
);



/* =========================================================
   START
========================================================== */

syncEditorPreviewMode();

loadPostPresetOptions();

startPostRouter();
