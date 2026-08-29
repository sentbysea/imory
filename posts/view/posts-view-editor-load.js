/* =========================================================
   POSTS VIEW - NEW / EDIT / CANCEL EDITOR

   posts-view.js 분할본 중 마지막. DOM 참조/상태는
   posts/editor/posts-refs.js에 있음(반드시 먼저 로드돼야 함).

   내용: 새 글 에디터 열기, 기존 글 수정용 에디터 열기
   (본문은 post_contents에서 따로 불러옴), 편집 취소.
========================================================== */


/* =========================================================
   NEW EDITOR
========================================================== */

async function openNewPostEditor(
  categoryId
) {

  const user =
    await getSignedInUser();


  if (!user) {

    alert(
      "로그인이 필요합니다."
    );

    return;

  }


  currentPostView =
    "editor";


  currentEditorMode =
    "create";


  editorSourcePostId =
    null;


  if (postList) {

    postList.hidden =
      true;

  }


  if (postDetail) {

    postDetail.hidden =
      true;

  }


  if (postEditor) {

    postEditor.hidden =
      false;

  }


  document.body.classList.add(
    "post-editor-mode"
  );


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


  postPageTitle.textContent =
    "NEW POST";


  postEditorTitle.value =
    "";


  clearRichEditor();


  resetEditorOOC();


  resetEditorVisibility();


  if (
    postEditorHtmlContent
  ) {

    postEditorHtmlContent.value =
      "";

  }


  setEditorContentMode(
    "richtext"
  );


  await loadPostEditorCategories(
    categoryId
  );


  await prepareEditorUI();


  /*
    새 글은 프리셋 오버라이드 없이 시작(사이트 전역 "사용 중"
    프리셋을 그대로 따라감) — prepareEditorUI의 loadPostStylePreset()이
    이미 그 값을 postStyleSettings에 채워뒀으므로 드롭다운만
    "없음"으로 맞춘다.
  */

  if (
    postEditorPresetSelect
  ) {

    postEditorPresetSelect.value =
      "";

  }


  postEditorTitle.focus();

}



/* =========================================================
   EDIT EDITOR
========================================================== */

async function openPostEditor(
  postId
) {

  const user =
    await getSignedInUser();


  if (!user) {

    alert(
      "로그인이 필요합니다."
    );

    return;

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
        user_id,
        category_id,
        title,
        content_type,
        visibility,
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

    return;

  }


  if (
    post.user_id !==
      user.id
  ) {

    alert(
      "수정 권한이 없습니다."
    );

    return;

  }


  /*
    본문(content/ooc_content)은 posts가 아니라
    post_contents에 따로 있음(비밀글의 "제목은 보이되
    본문만 숨기기"를 DB RLS로 구현하려고 분리함).
    글 주인이라 위 소유권 검사를 이미 통과했으므로
    바로 읽어올 수 있다.
  */

  const {
    data: postContent,
    error: postContentError
  } =
    await supabaseClient
      .from(
        "post_contents"
      )
      .select(
        `
        content,
        ooc_content
        `
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


  post.content =
    postContent?.content ||
    "";


  post.ooc_content =
    postContent?.ooc_content ||
    "";


  currentPostView =
    "editor";


  currentEditorMode =
    "edit";


  editorSourcePostId =
    Number(
      post.id
    );


  currentPostCategoryId =
    post.category_id
      ? Number(
          post.category_id
        )
      : null;


  if (postList) {

    postList.hidden =
      true;

  }


  if (postDetail) {

    postDetail.hidden =
      true;

  }


  if (postEditor) {

    postEditor.hidden =
      false;

  }


  document.body.classList.add(
    "post-editor-mode"
  );


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


  postPageTitle.textContent =
    "EDIT POST";


  await loadPostEditorCategories(
    post.category_id
  );


  postEditorTitle.value =
    post.title ||
    "";


  setEditorVisibility(
    post.visibility ||
    "public"
  );


  editorPostHadSecretPassword =
    post.visibility ===
    "secret";


  /*
    비밀번호는 절대 다시 불러와서 보여주지 않음(애초에
    해시라서 원문을 알 방법도 없음). 비워두면 "기존
    비밀번호 유지"로 저장 시 처리된다.
  */

  if (
    postEditorSecretPassword
  ) {

    postEditorSecretPassword.value =
      "";

  }


  if (
    postEditorOOC
  ) {

    postEditorOOC.value =
      post.ooc_content ||
      "";


    postEditorOOC.hidden =
      !post.ooc_content;


    postEditorOOCToggle
      ?.setAttribute(
        "aria-expanded",
        String(
          Boolean(
            post.ooc_content
          )
        )
      );

  }


  const isHtmlPost =
    post.content_type ===
    "html";


  setEditorContentMode(
    isHtmlPost
      ? "html"
      : "richtext"
  );


  if (isHtmlPost) {

    if (
      postEditorHtmlContent
    ) {

      postEditorHtmlContent.value =
        post.content ||
        "";

    }

  }

  else {

    /*
      ★ 다른 글(특히 HTML 모드 글)을 편집하다가 넘어오면
      이 textarea에 그 글의 내용이 그대로 남아있을 수
      있어서, 리치텍스트 글을 열 때는 명시적으로 비운다.
      (setEditorContentMode가 hidden 처리는 해도 값 자체를
      지우진 않기 때문에 방어적으로 필요.)
    */

    if (
      postEditorHtmlContent
    ) {

      postEditorHtmlContent.value =
        "";

    }


    /*
      저장된 rich HTML 또는
      예전 legacy 문법을
      에디터에 실제 스타일로 복원.
    */

    setRichEditorContent(
      post.content || ""
    );

  }


  await prepareEditorUI();


  /*
    이 글에 프리셋이 지정돼 있으면(quote_preset_id) 그걸
    최우선으로 불러온다 — prepareEditorUI가 방금 채워둔
    "사이트 전역 활성 프리셋" 기준값 위에 덮어쓰는 것.
    없으면 드롭다운을 "없음"으로 맞춰서 전역 프리셋을
    그대로 따르고 있음을 보여준다.
  */

  if (
    post.quote_preset_id
  ) {

    if (
      postEditorPresetSelect
    ) {

      postEditorPresetSelect.value =
        String(
          post.quote_preset_id
        );

    }


    await applyPostPresetById(
      post.quote_preset_id
    );

  } else if (
    postEditorPresetSelect
  ) {

    postEditorPresetSelect.value =
      "";

  }


  postEditorTitle.focus();

}



/* =========================================================
   CANCEL EDITOR
========================================================== */

async function cancelPostEditor() {

  const mode =
    currentEditorMode;


  const postId =
    editorSourcePostId;


  const categoryId =
    currentPostCategoryId;


  hidePostEditor();


  if (
    mode === "edit" &&
    postId
  ) {

    await openPostPage(
      postId,
      {
        updateUrl:
          false
      }
    );

    return;

  }


  if (categoryId) {

    currentPostView =
      "category";


    await openCategoryPage(
      categoryId,
      {
        updateUrl:
          false
      }
    );

  }

}
