/* =========================================================
   POSTS - HTML 모드: 디자인을 PNG로 저장

   기준 문서: IMORY_EDITOR_DECOR_DESIGN.md §12

   ★ 무엇을 저장하는가 (요구사항 10)

     **HTML 디자인만**이다. 상단 OOC, 글 제목·날짜, 사이트 스킨,
     툴바·버튼은 들어가지 않는다 — 캡처 대상이 오직 이 파일이
     만드는 격리 상자(#postEditorHtmlPreviewStage) 하나이고, 그
     안에는 사용자 HTML 말고는 아무것도 없기 때문이다.

     HTML 디자인 **안에** 사용자가 직접 써넣은 제목·날짜는
     디자인의 일부라 그대로 남는다.

   ★ 일반 발췌와 완전히 다른 길이다

     Quote Preset(글자색·배경·문단 간격·페이지 나누기)은 이
     경로에 전혀 관여하지 않는다. 캡처 상자는 프리셋 변수를
     상속하지 않는 자리에 있고, 페이지로 나누지도 않는다 —
     디자인 전체 높이를 한 장으로 저장한다.

   ★ 스크립트를 새로 허용하지 않는다

     붙여 넣은 HTML을 넣는 방법은 공개 화면과 **같다**
     (innerHTML). innerHTML로 들어간 <script>는 실행되지 않고,
     이미지 저장을 위해 iframe·srcdoc·eval 같은 실행 경로를
     새로 열지 않는다. 즉 이 기능이 신뢰 경계를 넓히지 않는다.

   ★ 조용히 실패하지 않는다

       - 스크롤 상자에 보이는 부분만 저장하지 않는다. 상자의
         전체 레이아웃 크기(scrollWidth/scrollHeight)를 재고,
         조상의 확대축소 transform과 overflow를 캡처 동안만
         걷어낸다.
       - 모바일에서 화면에 작게 보인다고 그 크기로 저장하지
         않는다. 배율은 표시 크기가 아니라 **레이아웃 크기와
         목표 너비**에서 나온다.
       - 브라우저 캔버스 한계를 넘으면 조용히 잘라내는 대신
         배율을 낮춘다. 배율 1배에서도 한계를 넘으면 저장하지
         않고 이유를 알린다.
       - 폰트와 이미지를 기다렸다가 찍는다. 못 읽은 이미지가
         있으면 성공이라고 말하지 않고 몇 장이 빠졌는지 알린다.
       - 다 찍은 뒤 결과가 완전히 한 색이면(= 아무것도 그려지지
         않음) 성공으로 안내하지 않는다.

   classic script. posts/editor/posts-refs.js ·
   posts/posts-format.js · posts/export/posts-preview-export.js
   뒤에 로드돼야 한다.
========================================================== */


/*
  캡처 상자의 레이아웃 폭. 붙여 넣는 디자인은 대부분 자기
  max-width를 갖고 있어서, 이 폭은 "그보다 좁지 않게" 정도의
  뜻이다. 공개 화면(글 본문 칸)과 비슷한 폭으로 둔다.
*/

const POST_HTML_IMAGE_STAGE_WIDTH =
  520;


/* 저장되는 PNG의 목표 가로 픽셀 */

const POST_HTML_IMAGE_TARGET_WIDTH =
  1200;


/*
  브라우저가 만들 수 있는 캔버스의 한계. 정확한 값은 기기마다
  다르지만, 아래 값은 데스크톱·모바일 어디서나 안전한 쪽이다.
  넘으면 배율을 낮추고, 1배에서도 넘으면 저장하지 않는다.
*/

const POST_HTML_IMAGE_MAX_DIMENSION =
  16384;

const POST_HTML_IMAGE_MAX_AREA =
  16384 * 16384 / 4;


function postEditorHtmlSource() {

  return stripOuterHtmlCodeFence(
    postEditorHtmlContent?.value ||
    ""
  );

}


/*
  격리 상자를 만든다(한 번만). 미리보기와 캡처가 **같은 상자**를
  쓴다 — 화면에서 본 것과 저장되는 것이 같아야 한다.
*/

function ensureEditorHtmlPreviewStage() {

  if (!postEditorHtmlPreview) {

    return null;

  }


  let stage =
    postEditorHtmlPreview.querySelector(
      ".post-editor-html-preview-stage"
    );


  if (!stage) {

    stage =
      document.createElement(
        "div"
      );


    stage.className =
      "post-editor-html-preview-stage";


    stage.id =
      "postEditorHtmlPreviewStage";


    postEditorHtmlPreview.appendChild(
      stage
    );

  }


  return stage;

}


/*
  미리보기를 다시 그린다. HTML 모드에서 글을 고치거나 패널을
  열 때마다 불린다.
*/

function renderEditorHtmlPreview() {

  const stage =
    ensureEditorHtmlPreviewStage();


  if (!stage) {

    return;

  }


  const html =
    postEditorHtmlSource();


  /*
    공개 화면과 **같은 방법**이다(innerHTML). 여기서만 다르게
    넣으면 미리보기와 실제 글이 어긋난다.
  */

  stage.innerHTML =
    html;


  if (postEditorHtmlPreviewEmpty) {

    postEditorHtmlPreviewEmpty.hidden =
      html.trim() !== "";

  }


  syncEditorHtmlPreviewScale();

}


/*
  좁은 화면에서 상자가 가로로 넘치지 않게 **보이기만** 줄인다.

  transform이라 레이아웃 크기(scrollWidth/Height)는 그대로다 —
  저장되는 PNG는 이 축소와 무관하고, 캡처 직전에는 조상의
  transform을 걷어낸다(요구사항 10의 "모바일에서 축소된 표시
  크기를 그대로 낮은 해상도로 저장하지 않게").
*/

function syncEditorHtmlPreviewScale() {

  const stage =
    ensureEditorHtmlPreviewStage();


  if (
    !stage ||
    !postEditorHtmlPreview
  ) {

    return;

  }


  const available =
    postEditorHtmlPreview.clientWidth;


  if (!available) {

    return;

  }


  const natural =
    Math.max(
      stage.scrollWidth,
      POST_HTML_IMAGE_STAGE_WIDTH
    );


  const scale =
    Math.min(
      1,
      available / natural
    );


  stage.style.transform =
    scale < 1
      ? `scale(${scale})`
      : "";


  /*
    축소한 만큼 상자가 차지하는 높이도 줄여서, 밑에 빈 공간이
    남지 않게 한다.
  */

  postEditorHtmlPreview.style.height =
    scale < 1
      ? `${Math.ceil(stage.scrollHeight * scale)}px`
      : "";

}


/*
  상자 안의 이미지가 다 읽힐 때까지 기다린다.
  돌려주는 값은 **못 읽은 장수**다 — 0이 아니면 성공이라고
  말하지 않는다.
*/

async function waitForEditorHtmlPreviewImages(
  stage
) {

  const images =
    Array.from(
      stage.querySelectorAll(
        "img"
      )
    );


  let failed =
    0;


  await Promise.all(
    images.map(
      image =>
        new Promise(
          resolve => {

            if (
              image.complete
            ) {

              if (
                image.naturalWidth === 0
              ) {

                failed += 1;

              }


              resolve();


              return;

            }


            const done =
              ok => {

                if (!ok) {

                  failed += 1;

                }


                resolve();

              };


            image.addEventListener(
              "load",
              () => done(true),
              { once: true }
            );


            image.addEventListener(
              "error",
              () => done(false),
              { once: true }
            );


            /*
              응답이 영영 오지 않는 주소도 있다 — 무한정
              기다리지 않는다.
            */

            setTimeout(
              () => done(false),
              8000
            );

          }
        )
    )
  );


  return failed;

}


/*
  목표 너비에서 나온 배율을 캔버스 한계 안으로 접는다.

  돌려주는 값
    scale    실제로 쓸 배율
    capped   한계 때문에 목표보다 낮췄는가
    tooBig   1배에서도 한계를 넘는가(= 저장할 수 없다)
*/

function resolveHtmlImageScale(
  width,
  height
) {

  const desired =
    Math.max(
      1,
      POST_HTML_IMAGE_TARGET_WIDTH / Math.max(1, width)
    );


  const cap =
    Math.min(
      POST_HTML_IMAGE_MAX_DIMENSION / Math.max(1, width),
      POST_HTML_IMAGE_MAX_DIMENSION / Math.max(1, height),
      Math.sqrt(
        POST_HTML_IMAGE_MAX_AREA /
        Math.max(1, width * height)
      )
    );


  return {

    scale:
      Math.max(
        1,
        Math.min(
          desired,
          cap
        )
      ),

    capped:
      cap < desired - 0.001,

    tooBig:
      cap < 1

  };

}


/*
  캔버스가 통째로 한 색인가 — "아무것도 안 그려졌는데 성공"을
  막는 마지막 확인이다.

  ★ 귀퉁이 몇 점만 보면 안 된다.

    바탕색이 하나인 디자인(어두운 카드 등)은 네 귀퉁이와 가운데가
    전부 같은 색이라, 멀쩡히 그려진 이미지를 "비었다"고 잘못
    판정한다. 실제로 그 오판이 났다.

    그래서 캔버스를 작은 크기로 한 번 줄여 그린 뒤 **모든 픽셀**을
    본다. 줄여 그리면서 색이 섞이므로, 바탕 위의 글자 한 줄만
    있어도 값이 달라진다. 32×32 한 장이라 큰 이미지에서도 값싸다.
*/

const POST_HTML_IMAGE_BLANK_PROBE_SIZE =
  32;


function htmlImageCanvasLooksBlank(
  canvas
) {

  try {

    const probe =
      document.createElement(
        "canvas"
      );


    probe.width =
      POST_HTML_IMAGE_BLANK_PROBE_SIZE;

    probe.height =
      POST_HTML_IMAGE_BLANK_PROBE_SIZE;


    const context =
      probe.getContext(
        "2d"
      );


    context.drawImage(
      canvas,
      0,
      0,
      probe.width,
      probe.height
    );


    const data =
      context.getImageData(
        0,
        0,
        probe.width,
        probe.height
      ).data;


    for (
      let index = 4;
      index < data.length;
      index += 4
    ) {

      if (
        data[index] !== data[0] ||
        data[index + 1] !== data[1] ||
        data[index + 2] !== data[2] ||
        data[index + 3] !== data[3]
      ) {

        return false;

      }

    }


    return true;

  }

  catch (error) {

    /* 읽을 수 없으면 판정하지 않는다 — 거짓 실패를 만들지 않는다 */

    return false;

  }

}


/*
  HTML 디자인을 한 장의 PNG Blob으로 만든다.
  실패는 예외로 던진다(메시지가 곧 사용자에게 보이는 이유다).
*/

async function captureEditorHtmlAsBlob() {

  if (!window.html2canvas) {

    throw new Error(
      "이미지 저장 도구를 불러오지 못했습니다."
    );

  }


  const stage =
    ensureEditorHtmlPreviewStage();


  if (
    !stage ||
    !postEditorHtmlSource().trim()
  ) {

    throw new Error(
      "저장할 HTML이 없습니다."
    );

  }


  /* 폰트와 이미지를 먼저 기다린다 */

  if (
    document.fonts?.ready
  ) {

    await document.fonts.ready;

  }


  const failedImages =
    await waitForEditorHtmlPreviewImages(
      stage
    );


  /*
    ★ 표시용 축소와 조상의 overflow를 캡처 동안만 걷어낸다.

    둘을 그대로 두면 (1) 모바일에서 화면에 보이는 작은 크기로
    찍히고 (2) 스크롤 상자 밖으로 나간 부분이 잘린다.
  */

  const previousTransform =
    stage.style.transform;

  const previousHeight =
    postEditorHtmlPreview.style.height;


  stage.style.transform =
    "";


  postEditorHtmlPreview.style.height =
    "";


  const strippedTransforms =
    stripAncestorTransformsForCapture(
      stage
    );


  const strippedOverflow =
    stripAncestorOverflowForCapture(
      stage
    );


  /* 레이아웃이 새 조건으로 다시 잡히기를 기다린다 */

  await waitForExport(
    80
  );


  const width =
    Math.max(
      1,
      Math.ceil(
        Math.max(
          stage.scrollWidth,
          stage.offsetWidth
        )
      )
    );


  const height =
    Math.max(
      1,
      Math.ceil(
        Math.max(
          stage.scrollHeight,
          stage.offsetHeight
        )
      )
    );


  const sizing =
    resolveHtmlImageScale(
      width,
      height
    );


  const restore =
    () => {

      restoreAncestorOverflowAfterCapture(
        strippedOverflow
      );


      restoreAncestorTransformsAfterCapture(
        strippedTransforms
      );


      stage.style.transform =
        previousTransform;


      postEditorHtmlPreview.style.height =
        previousHeight;

    };


  if (sizing.tooBig) {

    restore();


    throw new Error(
      `디자인이 너무 커서 이미지로 만들 수 없습니다 (${width}×${height}). 길이를 줄여 주세요.`
    );

  }


  let canvas;


  try {

    canvas =
      await window.html2canvas(
        stage,
        {

          /*
            배경이 없는 디자인은 흰 바탕으로 저장한다 — 투명
            PNG는 어디에 올리느냐에 따라 글자가 안 보인다.
          */

          backgroundColor:
            "#ffffff",

          useCORS:
            true,

          /*
            외부 이미지가 CORS로 막히면 캔버스가 오염되어
            toBlob이 실패한다. 오염시키지 않고, 대신 그 이미지가
            빠졌다는 사실을 아래에서 알린다.
          */

          allowTaint:
            false,

          scale:
            sizing.scale,

          width,

          height,

          scrollX:
            0,

          scrollY:
            0,

          logging:
            false,

          onclone:
            clonedDocument =>
              waitForClonedDocumentFontsBeforeCapture(
                clonedDocument
              )

        }
      );

  }

  catch (error) {

    restore();


    throw new Error(
      "이미지를 그리지 못했습니다. " +
      (
        error?.message ||
        ""
      )
    );

  }


  restore();


  if (
    htmlImageCanvasLooksBlank(
      canvas
    )
  ) {

    throw new Error(
      "결과가 비어 있어 저장하지 않았습니다. 디자인이 화면에 보이는지 확인해 주세요."
    );

  }


  const blob =
    await new Promise(
      resolve => {

        canvas.toBlob(
          resolve,
          "image/png"
        );

      }
    );


  if (!blob) {

    throw new Error(
      "이미지 변환에 실패했습니다. 디자인이 너무 클 수 있습니다."
    );

  }


  return {

    blob,

    width:
      canvas.width,

    height:
      canvas.height,

    failedImages,

    capped:
      sizing.capped

  };

}


/*
  export 버튼이 HTML 모드에서 부르는 함수.
*/

async function exportEditorHtmlAsImage() {

  if (
    postEditorExportButton
  ) {

    postEditorExportButton.disabled =
      true;


    postEditorExportButton.textContent =
      "saving...";

  }


  try {

    const result =
      await captureEditorHtmlAsBlob();


    const file =
      new File(
        [result.blob],
        `${getExportBaseFileName()}.png`,
        {
          type: "image/png"
        }
      );


    /*
      저장 방법은 일반 발췌와 같은 것을 쓴다 — 아이폰 Safari와
      인앱 브라우저에서 <a download>가 조용히 씹히는 문제까지
      이미 다뤄진 경로다(posts/export/posts-preview-export.js).
    */

    openExportedImageOrDownload(
      file
    );


    /*
      ★ 빠진 것이 있으면 성공이라고만 말하지 않는다 (요구사항 10)
    */

    const notes =
      [];


    if (result.failedImages > 0) {

      notes.push(
        `이미지 ${result.failedImages}장이 빠졌습니다`
      );

    }


    if (result.capped) {

      notes.push(
        "크기 한계 때문에 해상도를 낮췄습니다"
      );

    }


    if (notes.length) {

      showPostEditorMessage(
        `저장했지만 ${notes.join(" · ")} (${result.width}×${result.height})`
      );

    }

  }

  catch (error) {

    showPostEditorMessage(
      error?.message ||
      "이미지를 저장하지 못했습니다."
    );

  }

  finally {

    if (
      postEditorExportButton
    ) {

      postEditorExportButton.disabled =
        false;


      postEditorExportButton.textContent =
        "export";

    }

  }

}


/*
  본문을 고치면 미리보기도 따라간다. 패널이 접혀 있으면 그릴
  이유가 없으므로 열려 있을 때만 그린다.
*/

postEditorHtmlContent
  ?.addEventListener(
    "input",
    () => {

      if (
        editorContentMode === "html" &&
        typeof editorPreviewIsOpen === "function" &&
        editorPreviewIsOpen()
      ) {

        renderEditorHtmlPreview();

      }

    }
  );


window.addEventListener(
  "resize",
  () => {

    if (
      editorContentMode === "html"
    ) {

      syncEditorHtmlPreviewScale();

    }

  }
);
