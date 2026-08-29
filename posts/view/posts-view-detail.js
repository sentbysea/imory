/* =========================================================
   POSTS VIEW - POST PAGE (상세) / 본문 렌더

   posts-view.js 분할본. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 글 상세 화면 열기(openPostPage), HTML 모드/리치텍스트
   본문 렌더링(renderPostDetailBody).
========================================================== */


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


  const {
    data: post,
    error
  } =
    await supabaseClient
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
      )
      .maybeSingle();


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


  applyPostVisibilityTitle(
    postDetailTitle,
    post.visibility,
    post.title
  );


  postDetailDate.textContent =
    formatPostDetailDate(
      post.created_at
    );


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


  await loadRelatedPosts(
    post.category_id,
    post.id,
    categoryName
  );


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



