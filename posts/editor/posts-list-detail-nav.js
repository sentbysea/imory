/* =========================================================
   POSTS - CATEGORY MENU / LIST / DETAIL NAV / SECRET GATE

   posts.js 분할본. DOM 참조/상태는 posts-refs.js에 있음
   (반드시 먼저 로드돼야 함).

   내용: 카테고리 메뉴, 글 목록, 관련글, 비밀글 비밀번호
   입력 폼 제출, 뒤로가기, 수정/삭제 버튼, 새 글 추가 버튼.
========================================================== */


/* =========================================================
   EDITOR MESSAGE / CATEGORY / RICH EDITOR SELECTION /
   RANGE HELPERS / FONT TOGGLE / HIGHLIGHT / CLEAR STYLE /
   TOOLBAR STATE / EDITOR CONTENT

   showPostEditorMessage, loadPostEditorCategories,
   nodeIsInsideEditor, saveEditorSelection, restoreEditorSelection,
   getEditorRange, selectWrappedContent, unwrapElement,
   closestRichStyle, toggleEditorFont, applyEditorHighlight,
   stripRichStylesFromFragment, clearEditorStyle,
   updateEditorToolbarState, clearRichEditor, setRichEditorContent,
   getRichEditorHTML, getRichEditorPlainText

   -> posts-editor.js 로 이동함.
========================================================== */


/* =========================================================
   EDITOR PREVIEW ~ MOBILE PREVIEW

   getPostPreviewRatio, applyPostPreviewPresetVariables,
   applyPreviewTitleStyle,
   createPreviewSource, createEditorPreviewPage,
   previewPageIsOverflowing, isEditorPageBreakNode,
   showEditorPreviewPage, renderEditorPreviewPages,
   updateEditorPreview, waitForExport, getExportBaseFileName,
   downloadDataUrl, exportEditorPreviewAsImages,
   isMobilePostEditor, openEditorPreview, closeEditorPreview,
   syncEditorPreviewMode

   -> posts-preview.js 로 이동함.
========================================================== */





/* =========================================================
   PREPARE EDITOR ~ CANCEL EDITOR

   prepareEditorUI, hidePostEditor, updatePostAddButton,
   closePostArea, openCategoryPage, openPostPage,
   updatePostOwnerActions, loadRelatedPosts,
   openNewPostEditor, openPostEditor, cancelPostEditor

   -> posts-view.js 로 이동함.
========================================================== */





/* =========================================================
   CATEGORY MENU
========================================================== */

categoryMenuLinks
  ?.addEventListener(
    "click",
    async event => {

      const link =
        event.target.closest(
          "a[data-category-id]"
        );


      if (!link) {
        return;
      }


      event.preventDefault();


      await openCategoryPage(
        link.dataset.categoryId
      );

    }
  );



/* =========================================================
   POST LIST
========================================================== */

postList
  ?.addEventListener(
    "click",
    async event => {

      const item =
        event.target.closest(
          ".post-list-item"
        );


      if (!item) {
        return;
      }


      event.preventDefault();


      await openPostPage(
        item.dataset.postId
      );

    }
  );



/* =========================================================
   RELATED
========================================================== */

postRelatedList
  ?.addEventListener(
    "click",
    async event => {

      const item =
        event.target.closest(
          "[data-post-id]"
        );


      if (!item) {
        return;
      }


      event.preventDefault();


      postArea.scrollTo({
        top: 0,
        behavior: "smooth"
      });


      await openPostPage(
        item.dataset.postId
      );

    }
  );



/* =========================================================
   SECRET GATE
========================================================== */

postSecretGate
  ?.addEventListener(
    "submit",
    handleSecretGateSubmit
  );



/* =========================================================
   FONT SCALE (독자용 글자 크기 +/-)
========================================================== */

postDetailFontScaleDown
  ?.addEventListener(
    "click",
    () => {

      setReaderFontScale(
        getReaderFontScale() -
        READER_FONT_SCALE_STEP
      );

    }
  );


postDetailFontScaleUp
  ?.addEventListener(
    "click",
    () => {

      setReaderFontScale(
        getReaderFontScale() +
        READER_FONT_SCALE_STEP
      );

    }
  );



/* =========================================================
   BACK
========================================================== */

postBackButton
  ?.addEventListener(
    "click",
    async () => {

      if (
        currentPostView ===
          "editor"
      ) {

        await cancelPostEditor();

        return;

      }


      if (
        currentPostView ===
          "post" &&
        currentPostCategoryId
      ) {

        await openCategoryPage(
          currentPostCategoryId
        );

        return;

      }


      await closePostArea();

    }
  );



/* =========================================================
   EDIT
========================================================== */

postEditButton
  ?.addEventListener(
    "click",
    async () => {

      if (!currentPostId) {
        return;
      }


      await openPostEditor(
        currentPostId
      );

    }
  );



/* =========================================================
   스킨 POST 위의 EDIT

   예전에는 이 버튼이 옛 상세 화면(legacy #postDetail +
   edit/delete/관련 글)을 열고 닫는 토글이었다 — 고치려면 그
   화면을 한 번 거쳐야 했다. 지금은 곧장 수정 폼을 연다
   (posts/view/posts-view-editor-load.js). 삭제는 그 폼 안의
   delete 버튼에 있다.
========================================================== */

postManageToggleButton
  ?.addEventListener(
    "click",
    async () => {

      if (!currentPostId) {
        return;
      }


      await openPostEditor(
        currentPostId
      );

    }
  );



/* =========================================================
   글 카테고리 없음 안내 (WRITE)

   글 카테고리가 하나도 없을 때만 뜨는 안내 패널의 cancel —
   진입 전 화면으로 돌아간다(posts/view/posts-view-compose.js).
========================================================== */

postComposeNoticeClose
  ?.addEventListener(
    "click",
    closeComposeCategoryNotice
  );



/* =========================================================
   DELETE

   상세 화면의 delete 버튼과 수정 폼의 delete 버튼이 같은 함수를
   쓴다 — 확인 창, 작성자 재검사, 캐시 무효화, 삭제 후 그 글이
   있던 카테고리 화면으로 이동까지 전부 한 벌이다. 스킨을 쓰는
   사이트에서 그 카테고리 화면은 CATEGORY 스킨이다
   (openCategoryPage가 알아서 정한다).
========================================================== */

async function deleteCurrentPost() {

  if (!currentPostId) {
    return;
  }


  if (
    !confirm(
      "이 글을 삭제할까요?"
    )
  ) {

    return;

  }


  const user =
    await getSignedInUser();


  if (
    !user ||
    user.id !==
      currentPostOwnerId
  ) {

    return;

  }


  const postId =
    currentPostId;


  const categoryId =
    currentPostCategoryId;


  const {
    error
  } =
    await supabaseClient
      .from(
        "posts"
      )
      .delete()
      .eq(
        "id",
        postId
      )
      .eq(
        "user_id",
        user.id
      );


  if (error) {

    console.error(
      error
    );


    alert(
      "삭제하지 못했습니다."
    );


    return;

  }


  invalidateCategoryPageCache(
    categoryId
  );


  /*
    지운 글의 폼/화면은 더 이상 되돌아갈 곳이 아니다 — 기억해 둔
    복귀 지점(그 글의 스킨 화면)을 버리고, 주소도 카테고리로
    맞춘 뒤 그 화면을 연다.
  */

  hidePostEditor();


  forgetPlatformScreenReturn();


  if (categoryId) {

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
      categoryId,
      {
        updateUrl:
          false
      }
    );


    return;

  }


  await closePostArea();

}


postDeleteButton
  ?.addEventListener(
    "click",
    deleteCurrentPost
  );


postEditorDeleteButton
  ?.addEventListener(
    "click",
    deleteCurrentPost
  );



/* =========================================================
   ADD
========================================================== */

postAddButton
  ?.addEventListener(
    "click",
    async () => {

      if (
        currentPostCategoryType ===
        "banner"
      ) {

        openBannerForm();

        return;

      }


      await openNewPostEditor(
        currentPostCategoryId
      );

    }
  );



/* =========================================================
   BANNER
========================================================== */

bannerEditToggleButton
  ?.addEventListener(
    "click",
    toggleBannerEditMode
  );


bannerEditor
  ?.addEventListener(
    "submit",
    event => {

      event.preventDefault();


      saveBannerForm();

    }
  );


bannerEditorCancel
  ?.addEventListener(
    "click",
    closeBannerForm
  );


bannerEditorDelete
  ?.addEventListener(
    "click",
    deleteBannerFromEditor
  );


bannerEditorFileInput
  ?.addEventListener(
    "change",
    handleBannerEditorFileChange
  );



/* =========================================================
   POST LIST 편집(선택 삭제)
========================================================== */

postListEditToggleButton
  ?.addEventListener(
    "click",
    togglePostListEditMode
  );


postListSelectDeleteButton
  ?.addEventListener(
    "click",
    deleteSelectedPosts
  );

