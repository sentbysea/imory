/* =========================================================
   POSTS VIEW - FOLDER PAGE (FOLDER-2 — Folder Route + Series Viewer)

   /:slug/category/:cid/folder/:fid 를 여는 유일한 지점. 기준 문서:
   IMORY_FOLDER2_DESIGN.md.

   화면은 두 모드다 — 주소의 ?series=1 하나로 갈린다.
   - 목록(기본): 하위 폴더와 direct 글의 제목/날짜만. **본문은 조회도
     렌더도 하지 않는다.** 글을 누르면 평소의 개별 POST 페이지로 간다.
   - 이어읽기(?series=1, Series Viewer): 폴더 하나의 direct 글(하위 폴더
     제외)을 관리 화면에서 정한 순서(sort_order) 그대로, 각 글의 본문이
     위에서 아래로 이어지는 읽기 흐름. 글마다의 제목/헤더는 스킨이
     반복하지 않는다.
   두 모드 모두 같은 templates.folder / 같은 Context로 그려지고, 서로를
   오가는 링크는 Context의 folder.seriesHref / folder.listHref다.

   openCategoryPage()(posts-view-list.js)와 같은 뼈대를 쓴다:
   요청 순번으로 늦은 응답을 버리고, 이전 화면을 유지한 채 detached
   스크래치 엘리먼트에 먼저 그린 뒤 확정 지점에서 #postList로 옮기고,
   revealPostArea()로 한 번에 드러낸다. 소유자 도구/mount 클래스도
   CATEGORY와 같은 계약이다.

   이 화면은 published Skin의 templates.folder로만 그려진다. 스킨이
   그 템플릿을 갖고 있지 않거나, 폴더가 없거나(삭제됨), 이 뷰어에게
   보이는 direct 글이 하나도 없으면 **그 카테고리 화면으로 복귀**한다
   — 폴더 전용 legacy/폴백 화면은 만들지 않는다(사용자 결정 3·4·5).

   본문 채우기(Series Viewer — series 모드에서만):
   - Skin Context에는 본문이 없다(buildFolderSkinContext). 렌더가 끝난
     뒤 instance.getRegions("post-body")로 글별 region을 받아 여기서
     채운다 — POST의 protected post-body contract와 같은 분리다.
   - 읽을 수 있는 본문은 post_contents를 `.in()` 한 번으로 받는다.
     **비소유자 뷰어에게 secret 글의 id는 그 배치에 넣지 않는다**
     (RLS가 막더라도 요청 자체를 보내지 않는다 — 2026-09-09 프로덕션
     실측으로 anon에게 secret/private post_contents 행이 0건임을
     확인했지만, 그와 무관하게 유지하는 규칙이다).
   - secret 글은 글마다 비밀번호 폼을 그 글의 region 안에 둔다
     (mountPostSecretGate, posts-view-secret-gate.js). 해제는 지금까지와
     같은 get_secret_post_content RPC 하나뿐이다.
   - private 글은 방문자에게 RLS가 행 자체를 주지 않으므로 목록에도
     본문에도 없다. 소유자에게는 🙈 제목으로 포함된다.
   - 본문 렌더는 renderPostBodyInto()(posts-view-detail.js)를 글마다
     **순차로** 기다린다 — Quote Preset 로더가 전역 postStyleSettings를
     덮어쓰므로 동시에 그리면 다른 글의 프리셋이 섞인다.

   의존(전부 다른 posts/view·skin 파일의 전역): getSiteOwner,
   getSignedInUser, isSiteOwnerSignedIn, switchToCategoryScreen,
   setCategorySkinActive, setBannerSkinActive, setSkinOwnerEntriesForScreen,
   resolveSkinOwnerEntries, schedulePendingIndicator/clear/cancel,
   revealPostArea, hidePostEditor, closePostMenu, buildPostRoute,
   rememberSkinListScroll/takeSkinListScroll/applySkinScrollTop,
   renderPostBodyInto, mountPostSecretGate, openCategoryPage.
========================================================== */


let folderPageRequestSeq =
  0;


/*
  지금 열려 있는 폴더 페이지의 폴더 id. currentPostView === "folder"일
  때만 의미가 있다. posts-state.js의 current* 변수들과 같은 역할이지만
  이 화면 전용이라 여기서 선언한다(classic script의 최상위 let은 다른
  스크립트에서도 보인다 — 다만 로드 순서상 먼저 읽힐 수 있는 곳은
  typeof로 확인한다).
*/

let currentPostFolderId =
  null;


/* =========================================================
   published Skin FOLDER 시도 — skin/skin-folder.js
   (window.skinFolderReady 핸드셰이크, tryRenderPublishedSkinCategory와
   같은 패턴). 절대 throw하지 않는다.
========================================================== */

async function tryRenderPublishedSkinFolder(
  ownerId,
  categoryId,
  folderId,
  container,
  series
) {

  let renderPublishedSkinFolder;

  try {

    renderPublishedSkinFolder =
      await window.skinFolderReady;

  } catch (err) {

    console.error(
      "[posts-view-folder] skin-folder module failed to load",
      err
    );

    return false;

  }


  try {

    return await renderPublishedSkinFolder({
      ownerId,
      categoryId,
      folderId,
      container,
      series
    });

  } catch (err) {

    console.error(
      "[posts-view-folder] renderPublishedSkinFolder threw unexpectedly",
      err
    );

    return false;

  }

}



/* =========================================================
   카테고리로 복귀

   폴더 페이지를 그릴 수 없을 때의 단 하나의 출구. 링크로 들어온
   경우(updateUrl)는 openCategoryPage가 카테고리 주소를 push하고,
   직접 접속/새로고침/뒤로가기(updateUrl:false)로 들어온 경우는
   현재 history 항목을 카테고리 주소로 바꿔 둔다 — 그대로 두면
   화면은 카테고리인데 새로고침하면 다시 없는 폴더를 요청한다.
========================================================== */

async function fallbackFolderPageToCategory(
  categoryId,
  updateUrl
) {

  if (!updateUrl) {

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

  }


  await openCategoryPage(
    categoryId,
    {
      updateUrl
    }
  );

}



/* =========================================================
   FOLDER PAGE
========================================================== */

async function openFolderPage(
  categoryId,
  folderId,
  options = {}
) {

  const {
    updateUrl = true,
    series = false
  } = options;


  /*
    읽기 모드. 목록이 기본이고 이어읽기는 명시적 선택일 때만이다 —
    폴더에 들어서자마자 모든 글의 본문을 받아 그리지 않는다.
  */

  const seriesMode =
    Boolean(series);


  if (
    !postArea ||
    !postList
  ) {

    return;

  }


  const numericCategoryId =
    Number(
      categoryId
    );

  const numericFolderId =
    Number(
      folderId
    );


  const owner =
    await getSiteOwner();


  /*
    스킨 후보가 아닌 배포(비-scoped)에는 폴더 페이지가 없다 — 폴더는
    published Skin의 templates.folder로만 그려지므로 카테고리로 간다.
  */

  if (
    !owner ||
    !owner.scoped ||
    !owner.ownerId
  ) {

    await fallbackFolderPageToCategory(
      numericCategoryId,
      updateUrl
    );

    return;

  }


  /*
    PHASE 1H 목록 스크롤 기억(skin/skin-post-focus.js) — 한 칸짜리
    메모라 순서가 중요하다: 먼저 "이 폴더로 돌아온 것인가"를 꺼내고
    (꺼내면 메모가 빈다), 그 다음 떠나는 화면의 위치를 기억한다.
    반대로 하면 방금 기억한 값을 곧바로 지운다.
  */

  const listScrollRestoreTop =
    takeSkinListScroll(
      `folder:${numericFolderId}`
    );


  if (
    currentPostView === "category" &&
    currentPostCategoryId !== null &&
    currentPostCategoryId !== undefined
  ) {

    rememberSkinListScroll(
      `category:${currentPostCategoryId}`,
      postArea.scrollTop
    );

  }

  else if (
    currentPostView === "folder" &&
    currentPostFolderId !== null &&
    currentPostFolderId !== numericFolderId
  ) {

    rememberSkinListScroll(
      `folder:${currentPostFolderId}`,
      postArea.scrollTop
    );

  }


  const comingFromHome =
    currentPostView ===
      "home";


  currentPostView =
    "folder";

  currentPostCategoryId =
    numericCategoryId;

  currentPostId =
    null;

  currentPostFolderId =
    numericFolderId;



  const requestId =
    ++folderPageRequestSeq;


  /*
    이 요청이 아직 최신인가 — 순번뿐 아니라 화면 종류까지 본다.
    폴더 → 카테고리/글로 이동한 뒤 늦게 도착한 폴더 응답이 그 화면을
    덮어쓰지 않게 한다(각 화면의 순번은 서로 독립이라 순번만으로는
    다른 화면으로의 이동을 알 수 없다).
  */

  const isStale =
    () =>
      requestId !== folderPageRequestSeq ||
      currentPostView !== "folder" ||
      currentPostFolderId !== numericFolderId;


  closePostMenu();

  hidePostEditor();


  /*
    CATEGORY 스킨 후보와 같은 진입 정리 — 이전 화면은 확정 지점까지
    그대로 두고, mount 클래스만 미리 붙여 legacy 헤더가 스치지 않게
    한다(posts-view-list.js openCategoryPage 주석).
  */

  if (postContainer) {

    postContainer.classList.add(
      "post-container--skin-active"
    );

    postContainer.classList.remove(
      "post-container--owner-tools"
    );

  }

  postArea.classList.add(
    "post-area--skin-active"
  );


  setBannerSkinActive(false);

  setCategorySkinActive(false);

  setSkinOwnerEntriesForScreen(null);


  if (
    typeof setCategoryManageScreenActive ===
    "function"
  ) {

    setCategoryManageScreenActive(false);

  }


  const pendingIndicatorTimer =
    schedulePendingIndicator(
      () =>
        !isStale()
    );


  const skinRenderTarget =
    document.createElement(
      "div"
    );


  const skinFolderResult =
    await tryRenderPublishedSkinFolder(
      owner.ownerId,
      numericCategoryId,
      numericFolderId,
      skinRenderTarget,
      seriesMode
    );


  if (isStale()) {

    cancelPendingIndicator(
      pendingIndicatorTimer
    );

    return;

  }


  clearPendingIndicator(
    pendingIndicatorTimer
  );


  if (
    !skinFolderResult ||
    !skinFolderResult.rendered
  ) {

    /*
      templates.folder 없음 / 폴더 없음(삭제됨) / 보이는 direct 글 없음
      / 렌더 실패 — 전부 카테고리로 복귀. HOME에서 곧장 들어온 경우
      #postArea는 아직 닫혀 있고, openCategoryPage가 자기 경로에서
      연다.
    */

    await fallbackFolderPageToCategory(
      numericCategoryId,
      updateUrl
    );

    return;

  }


  const context =
    skinFolderResult.context;


  /*
    확정 — 글 상세를 접고 목록 자리를 편 뒤(switchToCategoryScreen이
    postSecretGate 복귀와 #postSkinContainer 비우기까지 한다) 완성된
    스킨을 옮긴다.
  */

  switchToCategoryScreen();


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


  if (postPageTitle) {

    postPageTitle.textContent =
      context.folder.name ||
      "";

  }


  /*
    소유자 도구. 작성(+)은 CATEGORY와 같은 대상(이 카테고리 root)이라
    스킨이 WRITE를 직접 그리지 않았을 때만 되살린다. 목록 편집 토글은
    폴더 페이지에서는 켜지 않는다 — 그 토글은 "지금 화면의 스킨 목록을
    접고 그 자리에 관리 목록을 편다"는 CATEGORY 전용 동작이라
    (posts-view-list-select.js) 폴더 페이지의 상태와 맞지 않는다. 관리는
    스킨의 EDIT(viewer.manageHref = 카테고리 ?manage=1)로 간다.
  */

  const canManagePosts =
    await isSiteOwnerSignedIn();


  if (isStale()) {

    return;

  }


  if (postAddButton) {

    postAddButton.hidden =
      !canManagePosts ||
      getSkinOwnerEntriesForScreen().write;

  }

  if (postListEditToggleButton) {

    postListEditToggleButton.hidden =
      true;

  }

  if (bannerEditToggleButton) {

    bannerEditToggleButton.hidden =
      true;

  }

  if (postManageToggleButton) {

    postManageToggleButton.hidden =
      true;

  }


  const needsPlatformOwnerTools =
    canManagePosts &&
    Boolean(postAddButton && !postAddButton.hidden);


  if (postContainer) {

    postContainer.classList.toggle(
      "post-container--owner-tools",
      needsPlatformOwnerTools
    );

    postContainer.classList.add(
      "post-container--skin-active"
    );

  }


  /*
    폴더 페이지도 CATEGORY와 같은 규칙으로 ＋ 를 스킨의 줄에 앉힌다
    (posts/view/posts-view-owner-tools.js). 폴더 스킨도 #postList 안에
    그려진다.
  */

  if (
    typeof mountPlatformOwnerTools ===
    "function"
  ) {

    mountPlatformOwnerTools(
      postList
    );

  }

  postArea.classList.add(
    "post-area--skin-active"
  );


  /*
    이 화면(폴더 읽기)이 인정하는 쿼리는 ?series=1 하나뿐이다.
    ?write=1도 이 경로에 정의돼 있지만(FOLDER-3, 이 폴더에 새 글)
    그건 작성 폼으로 가는 요청이라 여기까지 오지 않는다 — 라우터와
    skin-link-nav가 먼저 startPostCompose()로 보낸다. 그래도 여기
    도달했다면(소유자가 아니어서 되돌려보내진 경우 등) 읽기 화면이
    맞으므로 주소에서 지운다. ?manage=1 / ?edit=1은 이 경로에 정의된
    적이 없어 마찬가지로 지운다 — 화면과 주소의 불일치를 남기지
    않는다(PHASE 1H).
  */

  const folderRoutePath =
    buildPostRoute(
      `/category/${numericCategoryId}/folder/${numericFolderId}`
    );

  const folderRouteUrl =
    seriesMode
      ? buildSiteSeriesUrl(folderRoutePath)
      : folderRoutePath;

  const folderHistoryState = {
    page:
      "folder",

    categoryId:
      numericCategoryId,

    folderId:
      numericFolderId,

    series:
      seriesMode
  };


  if (updateUrl) {

    history.pushState(
      folderHistoryState,
      "",
      folderRouteUrl
    );

  }

  else if (
    window.location.search !==
      (seriesMode ? `?${SITE_SERIES_QUERY_PARAM}=1` : "")
  ) {

    history.replaceState(
      folderHistoryState,
      "",
      folderRouteUrl
    );

  }


  await revealPostArea(
    true
  );


  /*
    글을 읽고 돌아온 폴더면 떠날 때의 위치로, 아니면 처음부터.
    (comingFromHome이면 #postArea가 방금 열려 scrollTop은 이미 0이다.)
  */

  if (listScrollRestoreTop !== null) {

    applySkinScrollTop(
      postArea,
      listScrollRestoreTop
    );

  }

  else if (!comingFromHome) {

    postArea.scrollTop =
      0;

  }


  /*
    ★ 목록 모드에서는 여기서 끝이다 — post_contents도 posts 메타도
    조회하지 않는다. 스킨이 본문 region을 갖고 있어도(hidden) 비운
    채로 둔다.
  */

  if (!seriesMode) {

    return;

  }


  await fillFolderSeriesBodies(
    skinFolderResult,
    owner.ownerId,
    isStale
  );

}



/* =========================================================
   Series Viewer — 글별 post-body region 채우기

   region은 렌더러가 repeat 항목의 id로 키를 찍어 둔 것만 쓴다
   (skin/skin-render.js getRegions). DOM 순서가 아니라 키로 짝짓는다.
========================================================== */

async function fillFolderSeriesBodies(
  skinFolderResult,
  ownerId,
  isStale
) {

  const regions =
    skinFolderResult.instance
      .getRegions("post-body")
      .filter(
        (region) =>
          region.key !== null
      );


  if (!regions.length) {

    return;

  }


  /*
    id는 문자열 그대로 보낸다(Context의 folder.posts[].id와 region 키가
    모두 문자열이고 PostgREST는 bigint 비교에 문제가 없다).
  */

  const postIds =
    skinFolderResult.context.folder.posts
      .map(
        (post) =>
          String(
            post.id
          )
      )
      .filter(
        (id) =>
          /^\d+$/.test(id)
      );


  if (!postIds.length) {

    return;

  }


  /*
    본문 렌더에 필요한 메타(content_type / visibility / quote_preset_id)는
    Context에 없다(Context는 스킨에 노출되는 값만 갖는다) — 같은 RLS를
    거치는 posts 행을 한 번 더 읽는다. user_id로도 묶어 다른 사용자의
    글 id가 섞일 여지를 없앤다.
  */

  const {
    data: postRows,
    error: postRowsError
  } =
    await supabaseClient
      .from(
        "posts"
      )
      .select(
        "id, user_id, content_type, visibility, quote_preset_id"
      )
      .eq(
        "user_id",
        ownerId
      )
      .in(
        "id",
        postIds
      );


  if (isStale()) {

    return;

  }


  if (postRowsError) {

    console.error(
      "[posts-view-folder] posts meta 조회 실패:",
      postRowsError
    );

    return;

  }


  const viewer =
    await getSignedInUser();


  if (isStale()) {

    return;

  }


  const isOwnerViewing =
    Boolean(
      viewer &&
      viewer.id === ownerId
    );


  const postById =
    new Map(
      (postRows || []).map(
        (row) =>
          [String(row.id), row]
      )
    );


  /*
    ★ 비소유자에게는 secret 글을 배치 조회에서 뺀다 — 비밀번호를
    맞히기 전엔 본문을 서버에 요청하지도 않는다(POST 화면과 같은 규칙).
  */

  const readableIds =
    (postRows || [])
      .filter(
        (row) =>
          isOwnerViewing ||
          row.visibility !== "secret"
      )
      .map(
        (row) =>
          row.id
      );


  const contentById =
    new Map();


  if (readableIds.length) {

    const {
      data: contentRows,
      error: contentError
    } =
      await supabaseClient
        .from(
          "post_contents"
        )
        .select(
          "post_id, content"
        )
        .in(
          "post_id",
          readableIds
        );


    if (isStale()) {

      return;

    }


    if (contentError) {

      console.error(
        "[posts-view-folder] post_contents 조회 실패:",
        contentError
      );

    }


    (contentRows || []).forEach(
      (row) => {

        contentById.set(
          String(row.post_id),
          row.content || ""
        );

      }
    );

  }


  for (const { key, element } of regions) {

    if (isStale()) {

      return;

    }


    const post =
      postById.get(
        key
      );


    if (!post) {

      continue;

    }


    if (
      post.visibility === "secret" &&
      !isOwnerViewing
    ) {

      mountPostSecretGate(
        element,
        {
          postId:
            post.id,

          contentType:
            post.content_type,

          quotePresetId:
            post.quote_preset_id
        }
      );

      continue;

    }


    await renderPostBodyInto(
      element,
      post.content_type,
      contentById.get(key) || "",
      post.quote_preset_id
    );

  }

}
