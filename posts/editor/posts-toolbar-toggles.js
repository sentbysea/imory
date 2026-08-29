/* =========================================================
   POSTS - TOOLBAR TOGGLES / PREVIEW PANEL CONTROLS

   posts.js 분할본. DOM 참조/상태는 posts-refs.js에 있음
   (반드시 먼저 로드돼야 함).

   내용: 서식 지우기, 프리셋 선택, OOC/HTML 모드 토글,
   프리뷰 열기/닫기, 제목/출처 표시 토글, 비율 버튼,
   모바일 핀치줌/팬, 프리뷰 시트 리사이즈, ESC 닫기,
   반응형 프리뷰, 편집 취소, 발췌 이미지 내보내기.
========================================================== */


/* =========================================================
   CLEAR
========================================================== */


postEditorClearStyle
  ?.addEventListener(
    "click",
    clearEditorStyle
  );



/* =========================================================
   PRESET SELECT
========================================================== */

postEditorPresetSelect
  ?.addEventListener(
    "change",
    () => {

      applyPostPresetById(
        postEditorPresetSelect.value
      );

    }
  );



/* =========================================================
   OOC
========================================================== */

postEditorOOCToggle
  ?.addEventListener(
    "click",
    toggleEditorOOC
  );



/* =========================================================
   HTML MODE
========================================================== */

postEditorHtmlModeToggle
  ?.addEventListener(
    "click",
    toggleEditorContentMode
  );



/* =========================================================
   VISIBILITY (비밀글 / 비공개)
========================================================== */

postEditorSecretToggle
  ?.addEventListener(
    "click",
    toggleEditorSecret
  );


postEditorPrivateToggle
  ?.addEventListener(
    "click",
    toggleEditorPrivate
  );



/* =========================================================
   PREVIEW OPEN / CLOSE
========================================================== */

postEditorPreviewToggle
  ?.addEventListener(
    "click",
    () => {

      const isOpen =
        postEditorPreviewSection
          ?.classList
          .contains(
            "is-open"
          );


      if (isOpen) {

        closeEditorPreview();

      }


      else {

        openEditorPreview();

      }

    }
  );


postEditorPreviewClose
  ?.addEventListener(
    "click",
    closeEditorPreview
  );


postEditorPreviewBackdrop
  ?.addEventListener(
    "click",
    closeEditorPreview
  );


postEditorPreviewZoomOut
  ?.addEventListener(
    "click",
    zoomEditorPreviewOut
  );


postEditorPreviewZoomIn
  ?.addEventListener(
    "click",
    zoomEditorPreviewIn
  );



/* =========================================================
   PREVIEW TITLE / SOURCE VISIBILITY TOGGLE
========================================================== */

postEditorPreviewTitleToggle
  ?.addEventListener(
    "click",
    () => {

      previewTitleVisible =
        !previewTitleVisible;


      syncPreviewVisibilityToggleButtons();


      updateEditorPreview(
        {
          preserveView: true
        }
      );

    }
  );


postEditorPreviewSourceToggle
  ?.addEventListener(
    "click",
    () => {

      previewSourceVisible =
        !previewSourceVisible;


      syncPreviewVisibilityToggleButtons();


      updateEditorPreview(
        {
          preserveView: true
        }
      );

    }
  );


postEditorPreviewAlignSelect
  ?.addEventListener(
    "change",
    () => {

      previewVerticalAlign =
        postEditorPreviewAlignSelect.value ||
        null;


      updateEditorPreview(
        {
          preserveView: true
        }
      );

    }
  );


postEditorPreviewBodyAlignSelect
  ?.addEventListener(
    "change",
    () => {

      previewBodyAlign =
        postEditorPreviewBodyAlignSelect.value ||
        null;


      updateEditorPreview(
        {
          preserveView: true
        }
      );

    }
  );


postEditorPreviewRatioTrigger
  ?.addEventListener(
    "click",
    () => {

      previewRatioRowExpanded =
        !previewRatioRowExpanded;


      syncPreviewRatioControls();

    }
  );



/* =========================================================
   PREVIEW RATIO CONTROLS
========================================================== */

postEditorPreviewRatioButtons
  ?.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          previewRatioMode =
            button.dataset.ratio;


          syncPreviewRatioControls();


          syncPreviewSourceOffsetControls();


          updateEditorPreview(
            {
              preserveView: true
            }
          );

        }
      );

    }
  );



/* =========================================================
   PREVIEW SOURCE POSITION (BOTTOM MARGIN / GAP)
========================================================== */

postEditorPreviewSourceBottomOffset
  ?.addEventListener(
    "input",
    () => {

      previewSourceBottomOffset =
        Math.max(
          0,
          Number(
            postEditorPreviewSourceBottomOffset.value
          ) ||
          0
        );


      updateEditorPreview(
        {
          preserveView: true
        }
      );

    }
  );


postEditorPreviewSourceSpacing
  ?.addEventListener(
    "input",
    () => {

      previewSourceSpacing =
        Number(
          postEditorPreviewSourceSpacing.value
        ) ||
        0;


      updateEditorPreview(
        {
          preserveView: true
        }
      );

    }
  );


postEditorPreviewRatioCustomWidth
  ?.addEventListener(
    "input",
    () => {

      previewCustomRatioWidth =
        Number(
          postEditorPreviewRatioCustomWidth.value
        ) ||
        1;


      if (
        previewRatioMode ===
        "custom"
      ) {

        updateEditorPreview(
          {
            preserveView: true
          }
        );

      }

    }
  );


postEditorPreviewRatioCustomHeight
  ?.addEventListener(
    "input",
    () => {

      previewCustomRatioHeight =
        Number(
          postEditorPreviewRatioCustomHeight.value
        ) ||
        1;


      if (
        previewRatioMode ===
        "custom"
      ) {

        updateEditorPreview(
          {
            preserveView: true
          }
        );

      }

    }
  );



/* =========================================================
   MOBILE PREVIEW PINCH ZOOM / PAN
========================================================== */

postEditorPreviewStage
  ?.addEventListener(
    "pointerdown",
    handlePreviewStagePointerDown
  );


postEditorPreviewStage
  ?.addEventListener(
    "pointermove",
    handlePreviewStagePointerMove
  );


postEditorPreviewStage
  ?.addEventListener(
    "pointerup",
    handlePreviewStagePointerUp
  );


postEditorPreviewStage
  ?.addEventListener(
    "pointercancel",
    handlePreviewStagePointerUp
  );



/* =========================================================
   MOBILE PREVIEW SHEET RESIZE
========================================================== */

postEditorPreviewDragHandle
  ?.addEventListener(
    "pointerdown",
    handlePreviewDragPointerDown
  );


postEditorPreviewDragHandle
  ?.addEventListener(
    "pointermove",
    handlePreviewDragPointerMove
  );


postEditorPreviewDragHandle
  ?.addEventListener(
    "pointerup",
    handlePreviewDragPointerUp
  );


postEditorPreviewDragHandle
  ?.addEventListener(
    "pointercancel",
    handlePreviewDragPointerUp
  );



/* =========================================================
   ESC
========================================================== */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
        "Escape" &&
      postEditorPreviewSection
        ?.classList
        .contains(
          "is-open"
        )
    ) {

      closeEditorPreview();

    }

  }
);



/* =========================================================
   RESPONSIVE PREVIEW
========================================================== */

window.addEventListener(
  "resize",
  () => {

    syncEditorPreviewMode();


    if (
      currentPostView ===
      "editor"
    ) {

      updateEditorPreview();

    }

  }
);


/* =========================================================
   CANCEL
========================================================== */

postEditorCancelButton
  ?.addEventListener(
    "click",
    async () => {

      await cancelPostEditor();

    }
  );

/* =========================================================
   EXPORT
========================================================== */

postEditorCopyButton
  ?.addEventListener(
    "click",
    async () => {

      await copyCurrentEditorPreviewPageToClipboard();

    }
  );


postEditorExportButton
  ?.addEventListener(
    "click",
    async () => {

      await exportEditorPreviewAsImages();

    }
  );

