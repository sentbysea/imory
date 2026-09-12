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
   PREVIEW 여닫기

   데스크톱·모바일 같은 버튼 하나. 패널 안의 닫기 ×와 모바일
   배경은 없앴다 — 접는 길이 둘로 갈리지 않게 한다
   (posts/preview/posts-preview-mobile.js의 toggleEditorPreview).
========================================================== */

postEditorPreviewToggle
  ?.addEventListener(
    "click",
    toggleEditorPreview
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


/* =========================================================
   PREVIEW 출력 조건 — uniform / auto / custom + 출력 너비

   세 옵션은 항상 보인다(펼치는 단계 없음). custom을 고르면
   그때만 상세 비율 입력이 나온다.

   ★ custom을 고르는 순간, 그때까지 쓰이던 값(= 프리셋에서 온
   비율)을 세션 값으로 확정해 둔다. 그래야 이어서 프리셋을
   바꿔도 사용자가 보고 고른 비율이 그대로 남는다.
========================================================== */

postEditorPreviewRatioButtons
  ?.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const mode =
            button.dataset.ratio;


          if (
            mode === "custom"
          ) {

            const parts =
              getEffectivePreviewRatioParts(
                postStyleSettings ||
                {}
              );


            previewCustomRatioWidth =
              parts.width;


            previewCustomRatioHeight =
              parts.height;

          }


          previewRatioMode =
            mode;


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


/*
  ★ 출력 너비(캔버스 가로 픽셀) 입력칸은 이 화면에 없다.

  고쳐서 저장하는 자리는 Quote Preset의 CANVAS 하나뿐이고,
  여기에는 결과 크기를 보여주는 읽기 전용 표시만 남는다
  (syncPreviewExportSizeLabel). previewExportWidth는 그래서
  항상 null이다 — posts/preview/posts-preview-settings.js 참고.
*/


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


/*
  상세 비율 입력은 custom일 때만 보이므로, 값이 바뀌면 곧바로
  다시 그린다. (프리셋 값을 따르던 중이라도 여기를 건드리면
  그 순간부터 사용자가 고른 값이다.)
*/

postEditorPreviewRatioCustomWidth
  ?.addEventListener(
    "input",
    () => {

      previewCustomRatioWidth =
        Number(
          postEditorPreviewRatioCustomWidth.value
        ) ||
        1;


      previewRatioMode =
        "custom";


      updateEditorPreview(
        {
          preserveView: true
        }
      );

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


      previewRatioMode =
        "custom";


      updateEditorPreview(
        {
          preserveView: true
        }
      );

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

    /*
      ★ 모바일에서만. 데스크톱은 프리뷰가 기본으로 펼쳐져 있고
      글을 쓰는 도중 Escape를 누르는 일이 흔하다 — 예전에는
      데스크톱 섹션에 is-open이 붙지 않아 이 핸들러가 아예 돌지
      않았으므로, 그 감각을 그대로 유지한다.
    */

    if (
      event.key ===
        "Escape" &&
      isMobilePostEditor() &&
      postEditorPreviewSection
        ?.classList
        .contains(
          "is-open"
        )
    ) {

      closeEditorPreview(
        {
          byUser: true
        }
      );

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

