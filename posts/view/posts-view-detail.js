/* =========================================================
   POSTS VIEW - POST PAGE (상세) / 본문 렌더

   posts-view.js 분할본. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 글 상세 화면 열기(openPostPage), HTML 모드/리치텍스트
   본문 렌더링(renderPostDetailBody).
========================================================== */


/* =========================================================
   POST PAGE - published Skin 시도 (Slice 1C-F)

   skin/skin-post.js의 renderPublishedSkinPost()를
   posts-view-detail.js(classic script)가 폴링 없이 넘겨받도록
   index.html이 선언해 둔 window.skinPostReady 핸드셰이크를 쓴다
   (posts-view-list.js의 tryRenderPublishedSkinCategory와 동일한
   패턴).

   이 함수는 절대 throw하지 않는다 — 실패하면 항상 false를
   반환해서 openPostPage()가 기존 legacy #postDetail 렌더를
   그대로 진행하게 한다.

   "site owner 본인이 로그인해서 자기 글을 보는가"는 여기서만
   판단한다(renderPublishedSkinPost 자신은 이 맥락을 전혀 모른다)
   — owner가 자기 글을 열람할 때는 edit/delete 버튼
   (updatePostOwnerActions, posts-view-secret-gate.js)이 있는
   legacy #postDetail이 계속 필요하다. tryRenderPublishedSkinCategory
   와 완전히 동일한 판단 기준(site owner 여부만, 이 글 하나에
   국한된 판단이 아님).
========================================================== */

async function tryRenderPublishedSkinPost(
  postId,
  container
) {

  let owner;

  try {

    owner =
      await getSiteOwner();

  } catch (err) {

    console.error(
      "[posts-view-detail] getSiteOwner failed",
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
      "[posts-view-detail] getSignedInUser failed",
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


  let renderPublishedSkinPost;

  try {

    renderPublishedSkinPost =
      await window.skinPostReady;

  } catch (err) {

    console.error(
      "[posts-view-detail] skin-post module failed to load",
      err
    );

    return false;

  }


  try {

    return await renderPublishedSkinPost({
      ownerId: owner.ownerId,
      postId,
      container
    });

  } catch (err) {

    console.error(
      "[posts-view-detail] renderPublishedSkinPost threw unexpectedly",
      err
    );

    return false;

  }

}



/* =========================================================
   POST PAGE
========================================================== */

async function openPostPage(
  postId,
  options = {}
) {

  const {
    updateUrl = true
  } = options;


  if (
    currentPostView ===
      "home"
  ) {

    await showPostArea();

  }


  currentPostView =
    "post";


  currentPostId =
    Number(
      postId
    );


  closePostMenu();


  if (postList) {

    postList.hidden =
      true;

  }


  hidePostEditor();


  if (postDetail) {

    postDetail.hidden =
      false;

  }


  if (postAddButton) {

    postAddButton.hidden =
      true;

  }


  if (
    bannerEditToggleButton
  ) {

    bannerEditToggleButton.hidden =
      true;

  }


  /*
    글 목록 편집(선택 삭제) 버튼은 카테고리 목록에서만
    보여야 하는데, updatePostAddButton은 openCategoryPage에서만
    불려서 여기(글 뷰어)로 넘어와도 이전 상태(visible)가
    그대로 남아있었다.
  */

  if (
    postListEditToggleButton
  ) {

    postListEditToggleButton.hidden =
      true;

  }


  postListEditModeOn =
    false;


  if (
    postListSelectBar
  ) {

    postListSelectBar.hidden =
      true;

  }


  if (postPageTitle) {

    postPageTitle.textContent =
      "";

  }


  if (postDetailTitle) {

    postDetailTitle.textContent =
      "loading...";

  }


  if (postDetailDate) {

    postDetailDate.textContent =
      "";

  }


  if (postDetailContent) {

    postDetailContent.textContent =
      "";

  }


  hideReaderFontScaleControl();


  if (postDetailActions) {

    postDetailActions.hidden =
      true;

  }


  if (postRelated) {

    postRelated.hidden =
      true;

  }


  if (
    postSecretGate
  ) {

    postSecretGate.hidden =
      true;

  }


  if (
    postDetailContentWrap
  ) {

    postDetailContentWrap.hidden =
      false;

  }


  /*
    PHASE 1C-F: 매 진입마다 이전 글이 Skin 경로로 그려졌을 수
    있으므로 postSecretGate를 항상 legacy #postDetail 소속으로
    되돌려 둔다 — 아래에서 이번 글이 실제로 Skin 경로를 타면
    다시 bodyRegion 안으로 옮긴다(showPostSecretGate). 이 리셋이
    없으면 이전 글이 Skin+secret 조합이었을 때 postSecretGate
    DOM 노드가 이미 사라진 이전 Skin 컨테이너 안에 남아 미아가
    될 수 있다.
  */

  if (
    postDetail &&
    postSecretGate &&
    postSecretGate.parentNode !==
      postDetail
  ) {

    postDetail.appendChild(
      postSecretGate
    );

  }


  currentPostBodyMountTarget =
    null;


  if (
    postSkinContainer
  ) {

    postSkinContainer.hidden =
      true;

    postSkinContainer.innerHTML =
      "";

  }


  const owner =
    await getSiteOwner();


  let post =
    null;

  let error =
    null;


  if (
    owner.scoped &&
    !owner.ownerId
  ) {

    error = null;

  }

  else {

    let postQuery =
      supabaseClient
        .from(
          "posts"
        )
        .select(
          `
          id,
          category_id,
          user_id,
          title,
          content_type,
          visibility,
          created_at,
          quote_preset_id
          `
        )
        .eq(
          "id",
          postId
        );


    if (owner.scoped) {

      postQuery =
        postQuery.eq(
          "user_id",
          owner.ownerId
        );

    }


    const result =
      await postQuery.maybeSingle();


    post =
      result.data;

    error =
      result.error;

  }


  if (
    error ||
    !post
  ) {

    console.error(
      error
    );


    postDetailTitle.textContent =
      "post not found";


    return;

  }


  currentPostId =
    Number(
      post.id
    );


  currentPostCategoryId =
    post.category_id
      ? Number(
          post.category_id
        )
      : null;


  currentPostOwnerId =
    post.user_id ||
    null;


  /*
    PHASE 1C-F: published Skin이 이 POST를 지원하면 outer chrome
    (title/category/footer)을 먼저 시도한다 — 실패/미지원/owner
    본인 열람이면 항상 false가 돌아오므로 legacy #postDetail로
    폴백한다(위 tryRenderPublishedSkinPost 참고). 이 지점은 이미
    post row가 확정된 뒤이므로 secret/raw HTML 분기는 전혀
    건드리지 않는다 — 아래에서 본문을 "어디에" mount할지만
    결정한다.
  */

  const skinPostResult =
    await tryRenderPublishedSkinPost(
      post.id,
      postSkinContainer
    );


  const usingSkinPost =
    Boolean(
      skinPostResult &&
      skinPostResult.rendered
    );


  if (postDetail) {

    postDetail.hidden =
      usingSkinPost;

  }


  if (postSkinContainer) {

    postSkinContainer.hidden =
      !usingSkinPost;

  }


  currentPostBodyMountTarget =
    usingSkinPost
      ? skinPostResult.bodyRegion
      : null;


  if (usingSkinPost) {

    /*
      Skin의 outer chrome(article)이 post.title/post.categoryName
      등을 이미 data-imory-bind로 그려 뒀다(skin/skin-context.js
      buildPostSkinContext) — legacy #postDetailTitle/
      #postDetailDate는 지금 hidden이므로 건드리지 않는다.
    */

    if (
      postSecretGate &&
      postSecretGate.parentNode !==
        skinPostResult.bodyRegion
    ) {

      skinPostResult.bodyRegion.appendChild(
        postSecretGate
      );

    }

  }

  else {

    applyPostVisibilityTitle(
      postDetailTitle,
      post.visibility,
      post.title
    );


    postDetailDate.textContent =
      formatPostDetailDate(
        post.created_at
      );

  }


  const viewer =
    await getSignedInUser();


  const isOwnerViewing =
    Boolean(
      viewer &&
      viewer.id ===
        post.user_id
    );


  if (
    post.visibility ===
      "secret" &&
    !isOwnerViewing
  ) {

    /*
      비밀번호를 맞히기 전엔 본문을 아예 서버에 요청하지도
      않는다(post_contents는 RLS로 어차피 막혀있지만,
      요청 자체를 안 보내는 게 더 깔끔함).
    */

    showPostSecretGate(
      post.id,
      post.content_type,
      post.quote_preset_id
    );

  }

  else {

    const {
      data: postContent,
      error: postContentError
    } =
      await supabaseClient
        .from(
          "post_contents"
        )
        .select(
          "content"
        )
        .eq(
          "post_id",
          post.id
        )
        .maybeSingle();


    if (postContentError) {

      console.error(
        postContentError
      );

    }


    await renderPostDetailBody(
      post.content_type,
      postContent?.content ||
        "",
      post.quote_preset_id
    );

  }


  let categoryName =
    "";


  if (
    post.category_id
  ) {

    const {
      data: category
    } =
      await supabaseClient
        .from(
          "categories"
        )
        .select(
          "name"
        )
        .eq(
          "id",
          post.category_id
        )
        .maybeSingle();


    categoryName =
      category?.name ||
      "";


    postPageTitle.textContent =
      categoryName;

  }


  await updatePostOwnerActions();


  /*
    PHASE 1C-F: "관련 글" 목록은 POST Skin Contract v0.1에
    없는 개념이다(AI_SKIN_PHASE1C_PAGE_CONTRACT.md 6-2절) — Skin이
    outer chrome을 그리는 경로에서는 이 목록이 어차피 화면에
    나오지 않는 legacy #postRelated(hidden) 안에만 채워지므로
    불필요한 조회를 생략한다.
  */

  if (!usingSkinPost) {

    await loadRelatedPosts(
      post.category_id,
      post.id,
      categoryName
    );

  }


  if (updateUrl) {

    history.pushState(
      {
        page:
          "post",

        postId:
          Number(
            post.id
          )
      },
      "",
      buildPostRoute(
        `/post/${post.id}`
      )
    );

  }

}



/* =========================================================
   POST BODY RENDER

   openPostPage(공개/주인이 보는 secret,private)와
   handleSecretGateSubmit(비밀번호 맞힌 뒤)에서 공통으로 씀.
========================================================== */

async function renderPostDetailBody(
  contentType,
  contentText,
  quotePresetId
) {

  /*
    PHASE 1C-F: published Skin의 protected post-body region이
    mount 대상이면(openPostPage/handleSecretGateSubmit이 매번
    currentPostBodyMountTarget을 설정) legacy #postDetailContent
    대신 그 region에 직접 렌더한다. 글자 크기 +/- 컨트롤
    (posts-reader-scale.js)과 HTML 폭 자동 축소
    (posts-view-html-fit.js)는 legacy #postDetail 전용 고정 DOM
    (#postDetailContent/#postDetailContentWrap/#postDetailFontScale)
    만 다루는 chrome 기능이라 Skin 쪽엔 대응하는 자리가 없다 —
    POST Skin Contract v0.1도 이 두 기능을 계약하지 않는다(본문
    표현 자체는 legacy와 동일하게 renderStyledPostContentInto()/
    innerHTML을 그대로 재사용한다).
  */

  if (currentPostBodyMountTarget) {

    const skinBodyTarget =
      currentPostBodyMountTarget;


    if (
      contentType ===
      "html"
    ) {

      skinBodyTarget.classList.add(
        "is-html-content"
      );


      skinBodyTarget.innerHTML =
        contentText ||
        "";

    }

    else {

      skinBodyTarget.classList.remove(
        "is-html-content"
      );


      if (quotePresetId) {

        await loadPostStylePresetById(
          quotePresetId
        );

      } else {

        await loadPostStylePreset();

      }


      renderStyledPostContentInto(
        skinBodyTarget,
        contentText ||
          "",
        postStyleSettings ||
          {}
      );

    }


    return;

  }


  if (
    contentType ===
    "html"
  ) {

    /*
      HTML 모드 글: sanitize/스타일 프리셋 없이
      저장된 HTML을 그대로 출력(HTML 뷰어처럼 보여주는 용도).
    */

    if (
      postDetailContent
    ) {

      postDetailContent.classList.add(
        "is-html-content"
      );


      postDetailContent.innerHTML =
        contentText ||
        "";


      /*
        붙여넣은 HTML이 화면 폭이 고정된 마크업(카톡 대화창
        재현 등)이면 화면보다 넓어져서 잘리거나 깨져 보인다.
        실제 크기를 측정해서 화면에 맞게 축소한다.
      */

      requestAnimationFrame(
        fitHtmlPostContentToViewport
      );

    }


    /*
      HTML 모드는 프리셋 기준 크기라는 게 없어서(원본
      마크업을 그대로 출력) 글자 크기 +/- 대상에서 제외.
    */

    hideReaderFontScaleControl();

  }

  else {

    if (
      postDetailContent
    ) {

      postDetailContent.classList.remove(
        "is-html-content"
      );

    }


    resetHtmlPostContentFit();


    /*
      이 글에 프리셋이 지정돼 있으면(quote_preset_id) 사이트
      전역 "사용 중" 프리셋과 무관하게 그걸 최우선으로 쓴다
      (posts-style-preset.js 참고).
    */

    if (quotePresetId) {

      await loadPostStylePresetById(
        quotePresetId
      );

    } else {

      await loadPostStylePreset();

    }


    renderStyledPostContent(
      contentText ||
        "",
      postStyleSettings ||
        {}
    );


    initReaderFontScaleForCurrentPost();

  }

}



