/* =========================================================
   POSTS - PREVIEW EXPORT

   posts-preview.js에서 분리됨(파일이 너무 커져서 나눔).
   프리뷰 페이지를 PNG로 저장/공유/클립보드 복사하는 부분만
   여기 있음. 페이지 나누기 자체는 posts-preview.js 참고.

   이 파일도 다시 너무 커져서(1400줄) 순수 헬퍼 함수들을
   더 쪼갰음:
   - posts-preview-export-capture.js: html2canvas 캡처
     전/후 임시 스타일 보정, 실제 캡처(captureVisiblePageAsBlob)
   - posts-preview-export-section.js: 모바일에서 프리뷰
     섹션을 강제로 열어야 할 때 쓰는 상태/함수, 프리뷰 페이지
     준비 확인(ensurePreviewPagesRendered)
   두 파일 다 이 파일보다 먼저 로드되어야 함
   (index.html 순서 참고).

   ★ export/copy 버튼 분리:
   예전에는 모바일에서 export를 누르면(데스크톱과 다르게)
   현재 보이는 페이지 한 장만 클립보드에 복사했다 — export가
   플랫폼마다 다르게 동작하는 게 혼란스럽다는 피드백에 따라,
   이제 export는 데스크톱/모바일 모두 "전체 페이지를 PNG로
   저장"으로 동작을 통일한다(모바일은 다운로드 대신 OS
   공유 시트를 열어 "이미지 저장"으로 카메라롤에 한 번에
   저장되게 함 — <a download>는 iOS Safari에서 Files 앱으로
   가서 요청과 다름). 기존의 "현재 페이지만 클립보드 복사"
   동작은 그대로 남겨서 별도 copy 버튼에 붙인다
   (copyCurrentEditorPreviewPageToClipboard).
========================================================== */

/* =========================================================
   EXPORT PREVIEW AS IMAGE
========================================================== */

function waitForExport(ms) {

  return new Promise(
    resolve => {

      setTimeout(
        resolve,
        ms
      );

    }
  );

}


function getExportBaseFileName() {

  const rawTitle =
    (
      postEditorTitle?.value ||
      "excerpt"
    ).trim();


  const safeTitle =
    rawTitle
      .replace(
        /[\\/:*?"<>|]/g,
        ""
      )
      .replace(
        /\s+/g,
        "-"
      );


  return safeTitle || "excerpt";

}


function downloadDataUrl(
  dataUrl,
  fileName
) {

  const link =
    document.createElement(
      "a"
    );


  link.href =
    dataUrl;


  link.download =
    fileName;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();

}


/*
  클립보드 복사도 공유도 안 되는 환경(카카오톡/인스타그램 인앱
  브라우저 등)의 마지막 수단: 새 탭에 이미지를 직접 열어서
  길게 눌러 저장하게 한다. <a download>는 이런 인앱 웹뷰에서
  조용히 씹히는 경우가 많아서, 최소한 "화면에 보이기라도" 하는
  이 방법이 훨씬 안정적이다. 새 탭이 막히면(팝업 차단 등)
  마지막으로 다운로드 링크를 시도한다.
*/

function openExportedImageOrDownload(
  file
) {

  const url =
    URL.createObjectURL(
      file
    );

  const opened =
    window.open(
      url,
      "_blank"
    );


  if (opened) {

    showPostEditorMessage(
      "이미지를 길게 눌러 저장하세요 ♡"
    );

  }

  else {

    const link =
      document.createElement(
        "a"
      );

    link.href =
      url;

    link.download =
      file.name;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();


    showPostEditorMessage(
      "saved ♡"
    );

  }


  setTimeout(
    () => {

      URL.revokeObjectURL(
        url
      );

    },
    60000
  );

}


/*
  현재 보이는 페이지 한 장을 캡처해서 File로 돌려준다.
  copy 버튼과 export의 공유/다운로드 폴백 양쪽에서 재사용.
*/

async function captureCurrentEditorPreviewPageAsFile(
  pageIndexForName
) {

  forceOpenSectionIfNeeded();


  const previewPages =
    await ensurePreviewPagesRendered();


  if (
    previewPages.length === 0
  ) {

    throw new Error(
      "내보낼 미리보기가 없습니다."
    );

  }


  const page =
    previewPages[
      editorPreviewPageIndex
    ] ||
    previewPages[
      previewPages.length - 1
    ];


  const wasHidden =
    page.hidden;


  page.hidden =
    false;


  /*
    hidden 해제 직후 바로 캡처하면 레이아웃/폰트가
    아직 안정되기 전이라 텍스트가 겹쳐 보이는 등
    깨진 이미지가 나올 수 있다.
  */

  await waitForExport(
    30
  );


  try {

    const ratio =
      getPostPreviewRatio(
        postStyleSettings ||
        {}
      );


    const pageWidth =
      520;


    const blob =
      await captureVisiblePageAsBlob(
        page,
        pageWidth,
        ratio
      );


    const fileName =
      `${
        getExportBaseFileName()
      }-${
        pageIndexForName + 1
      }.png`;


    return new File(
      [blob],
      fileName,
      {
        type:
          "image/png"
      }
    );

  } finally {

    page.hidden =
      wasHidden;

  }

}



/* =========================================================
   COPY (현재 페이지 한 장 → 클립보드)

   예전 모바일 export의 동작을 그대로 옮김. 캡처가 끝나기
   전에 clipboard.write를 먼저 호출해야(Promise를 값으로
   넘겨도 됨) 모바일 브라우저의 "사용자 제스처 유효 시간"
   안에 들어가서 클립보드 쓰기가 거부되지 않는다 — 자세한
   이유는 아래 주석 참고.
========================================================== */

async function copyCurrentEditorPreviewPageToClipboard() {

  if (
    !window.html2canvas
  ) {

    showPostEditorMessage(
      "이미지 변환 기능을 불러오지 못했습니다."
    );

    return;

  }


  if (
    document.fonts?.ready
  ) {

    await document.fonts.ready;

  }


  beginExportSectionState();


  const canWriteClipboard =
    navigator.clipboard?.write &&
    window.ClipboardItem;


  if (!canWriteClipboard) {

    /*
      클립보드 이미지 쓰기 자체를 지원하지 않는 환경
      (구형 브라우저 등) — 캡처 후 공유/다운로드로 대체.
    */

    try {

      const file =
        await captureCurrentEditorPreviewPageAsFile(
          editorPreviewPageIndex
        );


      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare(
          {
            files: [file]
          }
        )
      ) {

        await navigator.share(
          {
            files: [file],
            title:
              getExportBaseFileName()
          }
        );

        showPostEditorMessage(
          "ready 1 page ♡"
        );

      }

      else {

        openExportedImageOrDownload(
          file
        );

      }

    } catch (error) {

      if (
        error?.name !==
        "AbortError"
      ) {

        console.error(
          "preview copy error:",
          error
        );

        showPostEditorMessage(
          "이미지 저장 실패: " +
          (
            error?.message ||
            "알 수 없는 오류"
          )
        );

      }

    } finally {

      showEditorPreviewPage(
        editorPreviewPageIndex,
        {
          resetZoom: false
        }
      );

      restoreForcedExportSection();

    }

    return;

  }


  if (
    postEditorCopyButton
  ) {

    postEditorCopyButton.disabled =
      true;

    postEditorCopyButton.textContent =
      "...";

  }


  showPostEditorMessage(
    "이미지 만드는 중..."
  );


  const capturePromise =
    (
      async () => {

        forceOpenSectionIfNeeded();


        const previewPages =
          await ensurePreviewPagesRendered();


        if (
          previewPages.length === 0
        ) {

          throw new Error(
            "내보낼 미리보기가 없습니다."
          );

        }


        const page =
          previewPages[
            editorPreviewPageIndex
          ] ||
          previewPages[
            previewPages.length - 1
          ];


        const wasHidden =
          page.hidden;


        page.hidden =
          false;


        await waitForExport(
          30
        );


        try {

          const ratio =
            getPostPreviewRatio(
              postStyleSettings ||
              {}
            );


          const pageWidth =
            520;


          return await captureVisiblePageAsBlob(
            page,
            pageWidth,
            ratio
          );

        } finally {

          page.hidden =
            wasHidden;

        }

      }
    )();


  try {

    await navigator.clipboard.write(
      [
        new ClipboardItem(
          {
            "image/png":
              capturePromise
          }
        )
      ]
    );


    showPostEditorMessage(
      "copied ♡"
    );

  } catch (clipboardError) {

    console.warn(
      "clipboard copy failed:",
      clipboardError
    );


    try {

      const blob =
        await capturePromise;

      const fileName =
        `${
          getExportBaseFileName()
        }-${
          editorPreviewPageIndex + 1
        }.png`;

      const file =
        new File(
          [blob],
          fileName,
          {
            type:
              "image/png"
          }
        );


      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare(
          {
            files:
              [file]
          }
        )
      ) {

        try {

          await navigator.share(
            {
              files:
                [file],

              title:
                getExportBaseFileName()
            }
          );


          showPostEditorMessage(
            "ready 1 page ♡"
          );

        } catch (shareError) {

          if (
            shareError?.name ===
            "AbortError"
          ) {

            showPostEditorMessage(
              ""
            );

          }

          else {

            console.warn(
              "share failed:",
              shareError
            );


            openExportedImageOrDownload(
              file
            );

          }

        }

      }

      else {

        openExportedImageOrDownload(
          file
        );

      }

    } catch (captureError) {

      console.error(
        "preview export error:",
        captureError
      );


      showPostEditorMessage(
        "이미지 저장 실패: " +
        (
          captureError?.message ||
          "알 수 없는 오류"
        )
      );

    }

  } finally {

    if (
      postEditorCopyButton
    ) {

      postEditorCopyButton.disabled =
        false;

      postEditorCopyButton.textContent =
        "copy";

    }


    showEditorPreviewPage(
      editorPreviewPageIndex,
      {
        resetZoom: false
      }
    );


    restoreForcedExportSection();

  }

}



/* =========================================================
   EXPORT (전체 페이지 → 저장)

   데스크톱: 전체 페이지를 PNG 파일로 순서대로 다운로드.
   모바일: 같은 전체 페이지 PNG들을 만들어서, <a download>
   대신 OS 공유 시트(navigator.share)를 열어 "이미지 저장"으로
   카메라롤에 한 번에 저장되게 한다 — Safari의 <a download>는
   Files 앱으로 가서 "갤러리에 전부 저장"이라는 요청과 다르고,
   공유 시트의 "이미지 저장"만 사진 앱(카메라롤)에 직접 저장된다.
   공유가 안 되는 환경(구형 브라우저 등)만 다운로드로 대체한다.
========================================================== */

async function exportEditorPreviewAsImages() {

  if (
    !window.html2canvas
  ) {

    /*
      alert()는 카카오톡/인스타그램 인앱 브라우저 같은 웹뷰에서
      무시되거나 막히는 경우가 있어서, 화면 안 메시지로 대신 표시.
    */

    showPostEditorMessage(
      "이미지 변환 기능을 불러오지 못했습니다."
    );

    return;

  }


  /*
    폰트가 아직 로드 중일 때 캡처하면 대체(fallback) 폰트로
    측정된 줄바꿈/자간이 실제 폰트 적용 후와 달라져서 텍스트가
    겹치는 등 깨진 이미지가 나올 수 있다. 이미 로드됐으면
    즉시 resolve되니 비용은 거의 없다.
  */

  if (
    document.fonts?.ready
  ) {

    await document.fonts.ready;

  }


  beginExportSectionState();


  forceOpenSectionIfNeeded();


  const previewPages =
    await ensurePreviewPagesRendered();


  if (
    previewPages.length === 0
  ) {

    showPostEditorMessage(
      "내보낼 미리보기가 없습니다."
    );

    restoreForcedExportSection();

    return;

  }


  if (
    postEditorExportButton
  ) {

    postEditorExportButton.disabled =
      true;

    postEditorExportButton.textContent =
      "...";

  }


  showPostEditorMessage(
    "이미지 만드는 중..."
  );


  const exportFiles =
    [];


  try {

    const baseFileName =
      getExportBaseFileName();


    for (
      let index = 0;
      index < previewPages.length;
      index += 1
    ) {

      const page =
        previewPages[index];


      /*
        hidden 상태를 잠깐 해제해서
        실제 프리뷰 크기를 측정.
      */

      const wasHidden =
        page.hidden;


      page.hidden =
        false;


      await waitForExport(
        30
      );


      const ratio =
        getPostPreviewRatio(
          postStyleSettings ||
          {}
        );


      const pageWidth =
        520;


      let blob;

      try {

        blob =
          await captureVisiblePageAsBlob(
            page,
            pageWidth,
            ratio
          );

      } finally {

        page.hidden =
          wasHidden;

      }


      const fileName =
        `${
          baseFileName
        }-${
          index + 1
        }.png`;


      const file =
        new File(
          [blob],
          fileName,
          {
            type:
              "image/png"
          }
        );


      exportFiles.push(
        file
      );

    }


    /*
      모든 페이지 다시 원래 표시 상태로.
      (export는 사용자 네비게이션이 아니므로
      확대/이동 상태는 건드리지 않는다.)
    */

    showEditorPreviewPage(
      editorPreviewPageIndex,
      {
        resetZoom: false
      }
    );


    /*
      isMobilePostEditor()는 뷰포트 너비만 본다 — 데스크톱
      브라우저 창을 좁게 줄이거나(devtools 등) 데스크톱
      Chrome/Edge가 Web Share API를 지원하는 경우에도 true가
      나올 수 있어서, 실제 터치 기기인지(navigator.maxTouchPoints)
      까지 같이 확인해야 데스크톱에서 공유 시트 대신 항상
      다운로드가 되도록 보장된다.
    */

    const isTouchDevice =
      (
        navigator.maxTouchPoints ||
        0
      ) > 0 ||
      "ontouchstart" in
        window;


    const canShareFiles =
      isMobilePostEditor() &&
      isTouchDevice &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare(
        {
          files:
            exportFiles
        }
      );


    if (canShareFiles) {

      try {

        await navigator.share(
          {
            files:
              exportFiles,

            title:
              baseFileName
          }
        );


        showPostEditorMessage(
          `saved ${exportFiles.length} page`
          +
          `${
            exportFiles.length > 1
              ? "s"
              : ""
          } ♡`
        );

      } catch (shareError) {

        if (
          shareError?.name ===
          "AbortError"
        ) {

          showPostEditorMessage(
            ""
          );

        }

        else {

          console.warn(
            "share failed:",
            shareError
          );


          /*
            공유가 실패하면(팝업 차단 등) 페이지별로
            새 탭에 열어서 길게 눌러 저장하게 하는
            최후의 수단으로 대체.
          */

          exportFiles.forEach(
            file => {

              openExportedImageOrDownload(
                file
              );

            }
          );

        }

      }

    }

    else {

      exportFiles.forEach(
        file => {

          const url =
            URL.createObjectURL(
              file
            );


          const link =
            document.createElement(
              "a"
            );


          link.href =
            url;


          link.download =
            file.name;


          document.body.appendChild(
            link
          );


          link.click();


          link.remove();


          setTimeout(
            () => {

              URL.revokeObjectURL(
                url
              );

            },
            1000
          );

        }
      );


      showPostEditorMessage(
        `saved ${exportFiles.length} page`
        +
        `${
          exportFiles.length > 1
            ? "s"
            : ""
        } ♡`
      );

    }


  } catch (error) {

    console.error(
      "preview export error:",
      error
    );


    showPostEditorMessage(
      "이미지 저장 실패: " +
      (
        error?.message ||
        "알 수 없는 오류"
      )
    );


    showEditorPreviewPage(
      editorPreviewPageIndex,
      {
        resetZoom: false
      }
    );


  } finally {

    if (
      postEditorExportButton
    ) {

      postEditorExportButton.disabled =
        false;


      postEditorExportButton.textContent =
        "export";

    }


    restoreForcedExportSection();

  }

}
