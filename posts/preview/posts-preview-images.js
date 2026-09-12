/* =========================================================
   POSTS - PREVIEW: 발췌에 들어가는 본문 사진

   기준 문서: IMORY_POST_BODY_IMAGE_DESIGN.md §7

   발췌(PREVIEW / export / copy)는 본문 사진을 **글과 같은
   순서로** 함께 그린다. 이 파일은 그 준비 과정만 담당한다 —
   페이지 나누기는 posts-preview-paginate.js, 캡처는
   posts/export/posts-preview-export-capture.js.

   ★ 왜 주소를 그대로 <img src>로 두지 않는가

     발췌의 최종 산출물은 html2canvas가 만드는 PNG다. html2canvas는
     라이브 DOM을 찍는 게 아니라 문서를 숨겨진 iframe으로 통째로
     복제한 뒤 그 안에서 이미지를 **다시 불러온다**. 주소를 그대로
     두면 이 셋이 전부 매번 다시 걸린다.

       1. 페이지마다 /api/post-cover 왕복이 다시 일어난다.
          그 경로는 요청마다 글의 공개 상태와 요청자를 확인하는
          접근 경계다(functions/api/post-cover.js) — 캡처 중에
          권한이 만료되면 캡처본에서만 사진이 조용히 빠진다.
       2. 아직 저장하지 않은 사진은 blob: 미리보기뿐이라
          복제 문서에서 어떻게 불릴지 보장이 없다. 발췌를 위해
          글을 강제로 저장할 수는 없다(요구사항 6절).
       3. GIF처럼 움직이는 이미지는 drawImage가 "그 순간의 프레임"을
          찍으므로, PREVIEW에서 본 프레임과 export/copy의 프레임이
          달라진다.

     그래서 발췌에 쓸 사진은 **먼저 한 번 읽어서 정지 raster
     하나로 굳혀** 두고(data: URL), PREVIEW와 export/copy가 그
     같은 바이트를 쓴다. data: URL은 캔버스를 오염시키지 않으므로
     export가 taint로 실패할 자리도 없다.

   ★ 움직이는 이미지(GIF 등)

     createImageBitmap(blob)은 스펙상 애니메이션 이미지의
     **default image**(= 첫 프레임)를 준다. 그 한 프레임을 canvas에
     그려 PNG로 굳히므로 PREVIEW와 export/copy가 항상 같은 프레임을
     쓴다. createImageBitmap이 없는 환경만 <img> + drawImage로
     대체하는데, 그 경로도 결과를 한 번만 굳혀서 재사용하므로
     두 화면이 어긋나지는 않는다.

   ★ 접근 권한

     사진 바이트는 지금도 /api/post-cover로만 나간다. fetch의
     기본 credentials가 same-origin이라 <img>와 똑같이 쿠키가
     실려 가고, 서버는 그대로 권한을 확인한다. 버킷을 공개하거나
     RLS를 완화하는 일은 없다.

   ★ 임시 자원

     굳힌 결과는 문자열(data: URL)이라 해제할 것이 없다.
     createImageBitmap의 bitmap과 대체 경로의 object URL만
     **다 그린 뒤에** 닫는다(쓰고 있는 자원을 먼저 해제하지 않음).
     캐시 자체는 폼을 닫을 때 resetPostBodyImages()가 비운다
     (posts/editor/posts-body-images.js).

   classic script. 최상위 선언이 다른 posts/* 파일과 같은 전역
   렉시컬 환경을 공유한다(posts/editor/posts-refs.js 주석).
========================================================== */


/* 발췌 캔버스의 레이아웃 너비. 원천은 공용
   POST_PAGE_LAYOUT_WIDTH(posts/style/posts-body-layout.js)이고
   posts/posts-page-canvas.css의 .post-editor-preview-page와 같은
   값이다 — 화면 폭과 무관하게 항상 이 값이고, 좁은 화면에서는
   통째로 축소해서 보여준다. */

const POST_PREVIEW_PAGE_WIDTH = POST_PAGE_LAYOUT_WIDTH;


/* 굳히는 raster의 최대 변. 실제로 필요한 픽셀은
   "본문 너비 × (exportWidth / 520)"인데 기본 exportWidth가
   1080이라 1080px 정도면 충분하다. 여유를 두고 2000으로 막는다 —
   사진 한 장당 5MB까지 허용되므로(POST_COVER_MAX_BYTES) 상한이
   없으면 여러 장 든 글에서 모바일 메모리가 위험하다.
   exportWidth를 2000 이상으로 올린 경우 이 상한까지만 선명하다
   (남은 제한). */

const POST_PREVIEW_IMAGE_MAX_PX = 2000;


/* 페이지에 도저히 안 들어가는 사진을 줄일 때의 하한 */

const POST_PREVIEW_IMAGE_MIN_WIDTH = 24;


/* uuid -> { dataUrl, width, height } — 굳힌 정지 raster.
   width/height는 굳힌 픽셀 크기이고, 발췌에서는 이 둘의 비율만
   쓴다(원본 비율과 같다). */

let postPreviewImageRaster =
  new Map();


/* uuid -> Promise — 같은 사진을 동시에 두 번 읽지 않게 */

let postPreviewImageLoads =
  new Map();


/* 마지막 준비에서 못 읽은 사진. 실패는 캐시하지 않으므로
   다음 준비가 곧 재시도가 된다. */

let postPreviewImageFailedIds =
  new Set();


/* 이미 사용자에게 알린 실패 조합. 같은 실패를 키 입력마다 다시
   덮어쓰지 않기 위한 것이다. */

let postPreviewImageReportedFailure =
  "";


function resetPostPreviewImages() {

  postPreviewImageRaster =
    new Map();

  postPreviewImageLoads =
    new Map();

  postPreviewImageFailedIds =
    new Set();

  postPreviewImageReportedFailure =
    "";

}


function getPostPreviewImageRaster(
  imageId
) {

  return (
    postPreviewImageRaster.get(
      imageId
    ) ||
    null
  );

}


/* =========================================================
   읽어서 굳히기
========================================================== */

/*
  아직 올리지 않은 사진은 메모리에 File이 있다
  (postBodyImagePending — posts/editor/posts-body-images.js).
  그걸 그대로 쓰므로 발췌를 위해 글을 저장하거나 공개할 필요가
  없다(요구사항 6절).
*/

async function fetchPostPreviewImageBlob(
  imageId
) {

  const pending =
    typeof postBodyImagePending !== "undefined"
      ? postBodyImagePending.get(imageId)
      : null;


  if (
    pending &&
    pending.file
  ) {

    return pending.file;

  }


  /*
    credentials는 기본값(same-origin)에 맡긴다 — <img>가 보내는
    것과 같은 쿠키가 실려야 서버가 같은 판정을 한다.
  */

  const response =
    await fetch(
      buildPostBodyImageUrl(
        imageId
      )
    );


  if (!response.ok) {

    throw new Error(
      `사진 응답 ${response.status}`
    );

  }


  return await response.blob();

}


function loadPostPreviewImageElement(
  objectUrl
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const image =
        new Image();


      image.onload =
        () => {

          resolve(
            image
          );

        };


      image.onerror =
        () => {

          reject(
            new Error(
              "사진 디코딩 실패"
            )
          );

        };


      image.src =
        objectUrl;

    }
  );

}


/*
  디코드된 이미지를 상한 안으로 줄여 canvas에 그리고 data: URL로
  굳힌다. 원본이 JPEG면 JPEG로(사진은 PNG보다 훨씬 작다), 그
  외에는 PNG로 — 투명 PNG의 투명도가 살아야 한다.
*/

function bakePostPreviewImageRaster(
  source,
  naturalWidth,
  naturalHeight,
  mimeType
) {

  const sourceWidth =
    Math.max(
      1,
      Number(
        naturalWidth
      ) || 1
    );

  const sourceHeight =
    Math.max(
      1,
      Number(
        naturalHeight
      ) || 1
    );


  const scale =
    Math.min(
      1,
      POST_PREVIEW_IMAGE_MAX_PX /
      Math.max(
        sourceWidth,
        sourceHeight
      )
    );


  const width =
    Math.max(
      1,
      Math.round(
        sourceWidth * scale
      )
    );

  const height =
    Math.max(
      1,
      Math.round(
        sourceHeight * scale
      )
    );


  const canvas =
    document.createElement(
      "canvas"
    );


  canvas.width =
    width;

  canvas.height =
    height;


  const context =
    canvas.getContext(
      "2d"
    );


  context.drawImage(
    source,
    0,
    0,
    width,
    height
  );


  const useJpeg =
    mimeType === "image/jpeg";


  return {
    dataUrl:
      useJpeg
        ? canvas.toDataURL(
            "image/jpeg",
            0.92
          )
        : canvas.toDataURL(
            "image/png"
          ),

    width,

    height
  };

}


async function rasterizePostPreviewImage(
  blob
) {

  if (
    typeof createImageBitmap === "function"
  ) {

    let bitmap =
      null;


    try {

      bitmap =
        await createImageBitmap(
          blob
        );

    } catch (error) {

      /* 이 환경이 이 형식을 못 읽는 경우 — 아래 <img>로 대체 */

      bitmap =
        null;

    }


    if (bitmap) {

      try {

        return bakePostPreviewImageRaster(
          bitmap,
          bitmap.width,
          bitmap.height,
          blob.type
        );

      } finally {

        /* 다 그린 뒤에만 닫는다 */

        bitmap.close?.();

      }

    }

  }


  const objectUrl =
    URL.createObjectURL(
      blob
    );


  try {

    const image =
      await loadPostPreviewImageElement(
        objectUrl
      );


    return bakePostPreviewImageRaster(
      image,
      image.naturalWidth,
      image.naturalHeight,
      blob.type
    );

  } finally {

    /* 그리기가 끝난 뒤에 해제 — 쓰고 있는 자원을 먼저
       놓지 않는다(요구사항 6절). */

    URL.revokeObjectURL(
      objectUrl
    );

  }

}


/* =========================================================
   준비 (PREVIEW / export / copy 공통 진입점)
========================================================== */

function listPostBodyImageIdsInHTML(
  html
) {

  const holder =
    document.createElement(
      "div"
    );


  holder.innerHTML =
    String(
      html || ""
    );


  return listPostBodyImageIds(
    holder
  );

}


/*
  -> { resolved: [uuid], failed: [uuid] }

  resolved는 **이번 호출에서 새로 굳힌** 사진이다. 이미 그려둔
  발췌 페이지가 그 사진을 아직 모른다는 뜻이므로, export/copy는
  이 값이 비어 있지 않으면 페이지를 다시 그린다.

  실패는 캐시하지 않는다 — 다시 누르는 것이 그대로 재시도가 된다
  (요구사항 5절).
*/

async function preparePostBodyImagesForPreview(
  html
) {

  const ids =
    listPostBodyImageIdsInHTML(
      html
    );


  const resolved =
    [];

  const failed =
    [];


  await Promise.all(
    ids.map(
      async imageId => {

        if (
          postPreviewImageRaster.has(
            imageId
          )
        ) {

          return;

        }


        let load =
          postPreviewImageLoads.get(
            imageId
          );


        if (!load) {

          load =
            (
              async () => {

                const blob =
                  await fetchPostPreviewImageBlob(
                    imageId
                  );


                return await rasterizePostPreviewImage(
                  blob
                );

              }
            )();


          postPreviewImageLoads.set(
            imageId,
            load
          );

        }


        try {

          const entry =
            await load;


          postPreviewImageRaster.set(
            imageId,
            entry
          );


          resolved.push(
            imageId
          );

        } catch (error) {

          console.warn(
            "[preview-images] 발췌용 사진을 준비하지 못했습니다:",
            imageId,
            error
          );


          failed.push(
            imageId
          );

        } finally {

          postPreviewImageLoads.delete(
            imageId
          );

        }

      }
    )
  );


  postPreviewImageFailedIds =
    new Set(
      failed
    );


  return {
    resolved,
    failed
  };

}


/*
  실패를 사용자에게 한 번만 알린다. 프리뷰는 글자를 칠 때마다
  다시 그려지므로 같은 실패로 메시지를 매번 덮어쓰면 다른 안내를
  가린다.
*/

function reportPostPreviewImageFailure(
  failed
) {

  const signature =
    failed
      .slice()
      .sort()
      .join(",");


  if (
    signature ===
    postPreviewImageReportedFailure
  ) {

    return;

  }


  postPreviewImageReportedFailure =
    signature;


  if (
    !failed.length
  ) {

    return;

  }


  showPostEditorMessage(
    `사진 ${failed.length}장을 불러오지 못했습니다. ` +
    "잠시 후 PREVIEW를 다시 열거나 export를 다시 눌러주세요."
  );

}


/* =========================================================
   발췌 페이지에 들어갈 모양으로 바꾸기
========================================================== */

/*
  발췌 입력(정화된 본문)의 <img>를 굳힌 raster로 바꿔 둔다.
  못 읽은 사진은 **조용히 빼지 않고** 같은 자리를 차지하는
  자리표시자로 남긴다 — 그래야 페이지 구성이 사진 있는 글과
  같고, export/copy가 "사진이 빠진 채 성공"할 수 없다.

  data-imory-preview-ratio에 높이/너비를 적어 두면, 페이지를
  나누는 쪽이 이미지 로딩을 다시 기다리지 않고 크기를 정할 수
  있다(posts-preview-paginate.js).
*/

function preparePostBodyImageNodesForPreview(
  root,
  settings = {}
) {

  if (!root) {

    return;

  }


  Array.from(
    root.querySelectorAll(
      "img"
    )
  ).forEach(
    node => {

      const imageId =
        getPostBodyImageId(
          node
        );


      const entry =
        imageId
          ? getPostPreviewImageRaster(
              imageId
            )
          : null;


      if (!entry) {

        node.replaceWith(
          createPostPreviewImagePlaceholder(
            settings
          )
        );


        return;

      }


      node.setAttribute(
        "src",
        entry.dataUrl
      );


      /* lazy는 화면 밖 이미지를 안 불러올 수 있다 — 발췌는
         숨겨진 페이지까지 전부 그려야 한다. data: URL이라
         어차피 즉시지만 의도를 남긴다. */

      node.removeAttribute(
        "loading"
      );


      node.setAttribute(
        "draggable",
        "false"
      );


      node.classList.add(
        "post-editor-preview-image"
      );


      node.dataset.imoryPreviewRatio =
        String(
          entry.height /
          entry.width
        );

    }
  );

}


function createPostPreviewImagePlaceholder(
  settings = {}
) {

  const placeholder =
    document.createElement(
      "div"
    );


  placeholder.className =
    "post-editor-preview-image-missing";


  /* 3:4 — 못 읽은 사진의 실제 비율을 알 수 없으므로 세로로
     흔한 비율 하나를 쓴다. */

  placeholder.dataset.imoryPreviewRatio =
    "0.75";


  placeholder.style.boxSizing =
    "border-box";

  placeholder.style.border =
    "1px dashed #cccccc";

  placeholder.style.display =
    "flex";

  placeholder.style.alignItems =
    "center";

  placeholder.style.justifyContent =
    "center";

  placeholder.style.textAlign =
    "center";

  placeholder.style.fontSize =
    `${
      Math.max(
        9,
        Math.round(
          (
            Number(
              settings.bodySize
            ) || 16
          ) * 0.7
        )
      )
    }px`;

  placeholder.style.color =
    "#999999";

  placeholder.style.lineHeight =
    "1.4";


  placeholder.textContent =
    "사진을 불러오지 못했습니다";


  return placeholder;

}


function isPostPreviewImageNode(
  node
) {

  return Boolean(
    node &&
    node.nodeType === Node.ELEMENT_NODE &&
    (
      node.classList?.contains(
        "post-editor-preview-image"
      ) ||
      node.classList?.contains(
        "post-editor-preview-image-missing"
      )
    )
  );

}


/*
  발췌 페이지가 그려진 뒤에도 자리표시자가 남아 있으면 "사진이
  빠진 발췌"라는 뜻이다. export/copy가 그 상태로 성공 처리하지
  않게 하는 데 쓴다.
*/

function previewPagesHaveMissingImages() {

  return Boolean(
    postEditorPreviewPages
      ?.querySelector(
        ".post-editor-preview-image-missing"
      )
  );

}


/* =========================================================
   크기와 간격
========================================================== */

/*
  사진이 들어갈 수 있는 실제 본문 너비.

  ★ clientWidth를 쓴다 — getBoundingClientRect()는 화면
  미리보기의 확대/축소 transform(applyEditorPreviewScale)이
  섞인 값이라 실제 출력 크기 계산에 쓰면 안 된다(요구사항 3절).
  clientWidth는 transform과 무관한 레이아웃 픽셀이다.

  프리뷰가 접혀 있어(display:none) 재지 못하는 경우만 프리셋의
  padding으로 되계산한다 — 그 계산은 공용 postPageBodyWidth
  (posts/preview/posts-page-layout.js)에 있다. 페이지 박스의
  장식 테두리는 outline이라 본문 폭을 깎지 않는다.
*/

function postPreviewPageBodyWidth(
  content,
  settings = {}
) {

  return postPageBodyWidth(
    content,
    settings
  );

}


/*
  글과 사진 사이 간격. 프리셋의 문단 간격을 그대로 쓰고, 문단
  간격이 0인 프리셋에서는 본문 글자 크기에 비례한 값을 쓴다 —
  사진이 글줄에 딱 붙어버리지 않게.
*/

function postPreviewImageGap(
  settings = {}
) {

  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const paragraphSpacing =
    Math.max(
      0,
      resolved.paragraphSpacing
    );


  if (
    paragraphSpacing > 0
  ) {

    return paragraphSpacing;

  }


  return Math.round(
    resolved.bodySize *
    0.75
  );

}


/*
  비율을 지킨 크기로 못박고 가운데 정렬한다. width/height를 둘 다
  픽셀로 주므로 자르거나 늘이는 일이 없고(계산 자체가 원본 비율),
  html2canvas도 var()나 object-fit 없이 그대로 읽는다.
*/

function applyPostPreviewImageSize(
  node,
  width,
  ratio
) {

  const safeWidth =
    Math.max(
      1,
      Math.round(
        width
      )
    );


  node.style.display =
    "block";

  node.style.marginLeft =
    "auto";

  node.style.marginRight =
    "auto";

  node.style.width =
    `${safeWidth}px`;

  node.style.height =
    `${
      Math.max(
        1,
        Math.round(
          safeWidth * ratio
        )
      )
    }px`;

}


function getPostPreviewImageRatio(
  node
) {

  const ratio =
    Number(
      node?.dataset?.imoryPreviewRatio
    );


  return ratio > 0
    ? ratio
    : 1;

}
