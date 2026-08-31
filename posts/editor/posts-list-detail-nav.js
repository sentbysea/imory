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
   DELETE
========================================================== */

postDeleteButton
  ?.addEventListener(
    "click",
    async () => {

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
            currentPostId
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


      await openCategoryPage(
        categoryId
      );

    }
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

