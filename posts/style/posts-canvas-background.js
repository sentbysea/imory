/* =========================================================
   POSTS - STYLE: 캔버스 배경 이미지 (공용)

   기준 문서: IMORY_QUOTE_PRESET_RENDER_AUDIT.md

   posts-body-layout.js / posts-body-decor.js와 같은 성격의
   파일이다 — 전부 인자로만 동작하고 전역 상태를 읽지 않는다.
   Quote Preset 미리보기(admin) · 에디터 PREVIEW · export가
   **같은 계산**으로 같은 구도를 그린다.

   내용:
     1. 구도 계산(computePostBackgroundGeometry) — 정규화 중심
        + 배율 → 실제 픽셀 자리
     2. 배경 레이어 만들기/갱신(createPostPageBackground ·
        applyPostPageBackground)
     3. 원본 크기 읽기와 캐시(loadPostBackgroundImageSize)
     4. export 직전 흐림 굽기(bakePostBackgroundForCapture)


   ★ 왜 "픽셀 이동량"이 아니라 "정규화 중심"인가 (요구사항 7)

     프리셋의 예시 텍스트와 실제 발췌문은 길이도 캔버스 비율도
     다르다. 프리셋에서 "왼쪽으로 120px 옮김"을 저장해두면, 세로로
     긴 발췌에서는 그 120px이 전혀 다른 자리를 가리킨다.

     그래서 저장하는 것은 **원본 이미지 위의 한 점**(0~1로 정규화한
     가로/세로 비율)과 **확대 배율**뿐이다. 최종 캔버스 크기가
     정해진 뒤에, 그 점이 캔버스 한가운데로 오도록 자리를 계산한다.
     비율이 달라지면 잘려 나가는 영역까지 똑같을 수는 없지만
     (전제), 지정한 중심은 최대한 유지된다.


   ★ 빈 공간이 생기지 않는다

     1) 배율 1 = "캔버스를 빈틈없이 덮는 최소 크기"(= cover)다.
        높이에만 맞춰 양옆이 비거나 비율을 찌그러뜨리는 방식은
        쓰지 않는다.
     2) 중심을 아무리 끌어도 이미지가 캔버스 밖으로 밀려나지
        않도록 **중심 자체를 유효 범위로 자른다**
        (clampPostBackgroundFocus) — 드래그가 그 범위에서 멈춘다.


   ★ 흐림 때문에 가장자리가 비지 않는다

     filter: blur()는 요소의 가장자리에서 바깥의 "없음"과 섞여
     투명해진다. 그래서 이미지를 캔버스보다 blur의 3배만큼 크게
     덮고(overhang), 그 초과분을 감싸는 상자가 잘라낸다. 눈에
     보이는 영역에는 흐려진 테두리가 들어오지 않는다.


   classic script. posts/style/posts-body-layout.js가 먼저
   로드돼야 한다.
========================================================== */


const POST_BACKGROUND_WRAPPER_CLASS =
  "post-page-background";

const POST_BACKGROUND_IMAGE_CLASS =
  "post-page-background-image";

const POST_BACKGROUND_OVERLAY_CLASS =
  "post-page-background-overlay";


const POST_BACKGROUND_MIN_SCALE =
  1;

const POST_BACKGROUND_MAX_SCALE =
  3;

const POST_BACKGROUND_MAX_BLUR =
  40;


/* =========================================================
   출력 조건(view) — 이번 발췌만의 개별 설정

   에디터는 프리셋을 고치지 않고 이 view로만 배경을 바꾼다
   (요구사항 7). 값을 주지 않은 항목은 프리셋 값을 상속한다.
========================================================== */

function resolvePostBackgroundView(
  settings = {},
  view = {}
) {

  const resolved =
    normalizePostStyleSettings(
      settings
    );


  const background =
    view.background ||
    {};


  const url =
    typeof background.url === "string"
      ? background.url.trim()
      : resolved.backgroundImageUrl;


  return {

    url,

    scale:
      clampPostBackgroundScale(
        postStyleNumber(
          background.scale,
          resolved.backgroundImageScale
        )
      ),

    focusX:
      postStyleNumber(
        background.focusX,
        resolved.backgroundImageFocusX
      ),

    focusY:
      postStyleNumber(
        background.focusY,
        resolved.backgroundImageFocusY
      ),

    blur:
      Math.min(
        POST_BACKGROUND_MAX_BLUR,
        Math.max(
          0,
          postStyleNumber(
            background.blur,
            resolved.backgroundImageBlur
          )
        )
      ),

    overlayColor:
      typeof background.overlayColor === "string" &&
      background.overlayColor
        ? background.overlayColor
        : resolved.backgroundOverlayColor,

    overlayOpacity:
      Math.min(
        1,
        Math.max(
          0,
          postStyleNumber(
            background.overlayOpacity,
            resolved.backgroundOverlayOpacity
          )
        )
      )

  };

}


function clampPostBackgroundScale(
  value
) {

  const scale =
    postStyleNumber(
      value,
      POST_BACKGROUND_MIN_SCALE
    );


  if (
    !Number.isFinite(
      scale
    )
  ) {

    return POST_BACKGROUND_MIN_SCALE;

  }


  return Math.min(
    POST_BACKGROUND_MAX_SCALE,
    Math.max(
      POST_BACKGROUND_MIN_SCALE,
      scale
    )
  );

}



/* =========================================================
   1. 구도 계산

   boxWidth/boxHeight   덮어야 할 상자(= 캔버스 + 흐림 여유)
   naturalWidth/Height  원본 이미지 픽셀 크기
   scale                1 = cover, 그 이상은 확대
   focusX/focusY        원본 이미지 위의 정규화 좌표(0~1)

   -> { width, height, left, top, focusX, focusY }
      left/top은 상자 왼쪽 위 기준. focus는 유효 범위로 자른 값.
========================================================== */

function computePostBackgroundGeometry(
  options = {}
) {

  const boxWidth =
    Math.max(
      1,
      options.boxWidth ||
      0
    );

  const boxHeight =
    Math.max(
      1,
      options.boxHeight ||
      0
    );


  const naturalWidth =
    Math.max(
      1,
      options.naturalWidth ||
      0
    );

  const naturalHeight =
    Math.max(
      1,
      options.naturalHeight ||
      0
    );


  const scale =
    clampPostBackgroundScale(
      options.scale
    );


  /*
    cover 배율 — 가로/세로 중 더 많이 키워야 하는 쪽에 맞춘다.
    원본 비율은 그대로 유지된다(두 축에 같은 수를 곱한다).
  */

  const coverFactor =
    Math.max(
      boxWidth / naturalWidth,
      boxHeight / naturalHeight
    );


  const width =
    naturalWidth *
    coverFactor *
    scale;


  const height =
    naturalHeight *
    coverFactor *
    scale;


  const focus =
    clampPostBackgroundFocus(
      {
        focusX: options.focusX,
        focusY: options.focusY,
        boxWidth,
        boxHeight,
        width,
        height
      }
    );


  return {

    width,

    height,

    left:
      boxWidth / 2 -
      focus.focusX * width,

    top:
      boxHeight / 2 -
      focus.focusY * height,

    focusX:
      focus.focusX,

    focusY:
      focus.focusY

  };

}


/*
  중심을 유효 범위로 자른다.

  이미지가 상자를 덮으려면 왼쪽 끝이 0 이하, 오른쪽 끝이 상자
  너비 이상이어야 한다. left = boxWidth/2 - focusX*width 이므로

    boxWidth - width <= left <= 0
    →  boxWidth / (2 * width) <= focusX <= 1 - boxWidth / (2 * width)

  width >= boxWidth라서 이 구간은 항상 존재한다(최악의 경우
  가운데 한 점). 드래그는 이 범위 끝에서 자연스럽게 멈춘다.
*/

function clampPostBackgroundFocus(
  options = {}
) {

  const axis =
    (
      value,
      box,
      drawn
    ) => {

      const raw =
        postStyleNumber(
          value,
          0.5
        );


      const margin =
        drawn > 0
          ? box / (2 * drawn)
          : 0.5;


      const min =
        Math.min(
          0.5,
          margin
        );


      const max =
        Math.max(
          0.5,
          1 - margin
        );


      return Math.min(
        max,
        Math.max(
          min,
          Number.isFinite(raw)
            ? raw
            : 0.5
        )
      );

    };


  return {

    focusX:
      axis(
        options.focusX,
        options.boxWidth,
        options.width
      ),

    focusY:
      axis(
        options.focusY,
        options.boxHeight,
        options.height
      )

  };

}


/*
  흐림이 가장자리를 갉아먹지 않도록 이미지가 상자 밖으로 더
  나가야 하는 여유(px). CSS blur(r)의 r은 표준편차라 눈에 보이는
  번짐은 대략 3r까지다.
*/

function postBackgroundOverhang(
  blur
) {

  return Math.ceil(
    Math.max(
      0,
      blur ||
      0
    ) * 3
  );

}



/* =========================================================
   2. 배경 레이어

   <div class="post-page-background">        상자(넘침 잘라냄)
     <img class="post-page-background-image">  사진
     <div class="post-page-background-overlay"> 덮개 색
   </div>

   ★ 텍스트는 흐려지지 않는다 — filter는 <img> 하나에만 걸린다.
   ★ 순서가 곧 쌓임 순서다: 사진 → 덮개 → (본문은 이 상자
     바깥의 형제 요소이고 position:relative라 언제나 위에 온다).
========================================================== */

function createPostPageBackground(
  settings = {},
  view = {}
) {

  const background =
    resolvePostBackgroundView(
      settings,
      view
    );


  if (!background.url) {

    return null;

  }


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    POST_BACKGROUND_WRAPPER_CLASS;


  wrapper.setAttribute(
    "aria-hidden",
    "true"
  );


  wrapper.style.position =
    "absolute";

  wrapper.style.top =
    "0";

  wrapper.style.left =
    "0";

  wrapper.style.right =
    "0";

  wrapper.style.bottom =
    "0";

  wrapper.style.overflow =
    "hidden";

  wrapper.style.zIndex =
    "0";


  const image =
    document.createElement(
      "img"
    );


  image.className =
    POST_BACKGROUND_IMAGE_CLASS;


  image.alt =
    "";


  /*
    ★ crossOrigin이 있어야 export가 된다. 이 이미지를 그대로
    캔버스에 그려서 흐림을 굽는데(bakePostBackgroundForCapture),
    CORS 없이 그리면 캔버스가 오염되어 toDataURL이 막힌다.
    Supabase의 공개 버킷은 CORS 헤더를 준다.
  */

  image.crossOrigin =
    "anonymous";


  image.decoding =
    "async";


  image.src =
    background.url;


  image.style.position =
    "absolute";


  image.style.maxWidth =
    "none";


  image.style.pointerEvents =
    "none";


  const overlay =
    document.createElement(
      "div"
    );


  overlay.className =
    POST_BACKGROUND_OVERLAY_CLASS;


  overlay.style.position =
    "absolute";

  overlay.style.top =
    "0";

  overlay.style.left =
    "0";

  overlay.style.right =
    "0";

  overlay.style.bottom =
    "0";


  wrapper.appendChild(
    image
  );


  wrapper.appendChild(
    overlay
  );


  return wrapper;

}


/*
  이미 만들어 붙여 둔 배경 레이어에 실제 구도를 입힌다.

  ★ 왜 만들 때가 아니라 나중인가

    AUTO/uniform 비율은 페이지 높이가 **콘텐츠에 따라** 정해진다.
    페이지를 만드는 순간에는 높이를 모르므로, 다 나누고 높이가
    확정된 뒤(paginatePostPages 마지막)에 한 번 더 계산한다.

  ★ 원본 크기를 아직 모르면

    이미지 로드를 기다렸다가 다시 부른다. 화면은 그동안 덮개만
    보이고, 로드되는 즉시 제자리를 찾는다.
*/

function applyPostPageBackground(
  page,
  settings = {},
  view = {}
) {

  if (!page) {
    return;
  }


  const wrapper =
    page.querySelector(
      `.${POST_BACKGROUND_WRAPPER_CLASS}`
    );


  if (!wrapper) {
    return;
  }


  const background =
    resolvePostBackgroundView(
      settings,
      view
    );


  const image =
    wrapper.querySelector(
      `.${POST_BACKGROUND_IMAGE_CLASS}`
    );


  const overlay =
    wrapper.querySelector(
      `.${POST_BACKGROUND_OVERLAY_CLASS}`
    );


  if (overlay) {

    overlay.style.backgroundColor =
      background.overlayColor;


    overlay.style.opacity =
      String(
        background.overlayOpacity
      );

  }


  if (!image) {
    return;
  }


  if (
    image.getAttribute("src") !==
    background.url
  ) {

    image.setAttribute(
      "src",
      background.url
    );

  }


  const boxWidth =
    page.offsetWidth ||
    POST_PAGE_LAYOUT_WIDTH;


  const boxHeight =
    page.offsetHeight ||
    0;


  if (
    boxHeight <= 0
  ) {

    return;

  }


  const natural =
    postBackgroundNaturalSize(
      background.url
    );


  if (!natural) {

    loadPostBackgroundImageSize(
      background.url
    )
      .then(
        size => {

          if (!size) {
            return;
          }


          /*
            기다리는 사이에 페이지가 통째로 새로 그려졌을 수
            있다 — 아직 문서에 붙어 있을 때만 다시 칠한다.
          */

          if (
            page.isConnected
          ) {

            applyPostPageBackground(
              page,
              settings,
              view
            );

          }

        }
      );


    return;

  }


  const overhang =
    postBackgroundOverhang(
      background.blur
    );


  const geometry =
    computePostBackgroundGeometry(
      {
        boxWidth:
          boxWidth + overhang * 2,

        boxHeight:
          boxHeight + overhang * 2,

        naturalWidth:
          natural.width,

        naturalHeight:
          natural.height,

        scale:
          background.scale,

        focusX:
          background.focusX,

        focusY:
          background.focusY
      }
    );


  image.style.width =
    `${geometry.width}px`;


  image.style.height =
    `${geometry.height}px`;


  image.style.left =
    `${geometry.left - overhang}px`;


  image.style.top =
    `${geometry.top - overhang}px`;


  image.style.filter =
    background.blur > 0
      ? `blur(${background.blur}px)`
      : "";


  /*
    드래그가 이 값을 읽어 "지금 화면에서 1px은 중심 몇 만큼인가"를
    계산한다(posts/preview/posts-preview-background.js).
  */

  wrapper.dataset.drawnWidth =
    String(
      geometry.width
    );

  wrapper.dataset.drawnHeight =
    String(
      geometry.height
    );

}


function applyPostPageBackgrounds(
  pages,
  settings = {},
  view = {}
) {

  (
    pages ||
    []
  ).forEach(
    (
      page,
      index
    ) => {

      applyPostPageBackground(
        page,
        settings,
        postPageBackgroundViewForIndex(
          view,
          index
        )
      );

    }
  );

}


/*
  여러 장으로 나뉜 발췌 — 기본 구도는 모든 장에 공통으로 쓰고,
  필요한 장만 개별 보정한다(요구사항 7).

  view.background.pages = { "<장 번호>": { focusX, focusY } }
*/

function postPageBackgroundViewForIndex(
  view = {},
  index
) {

  const background =
    view.background ||
    {};


  const perPage =
    background.pages &&
    typeof background.pages === "object"
      ? background.pages[String(index)]
      : null;


  if (!perPage) {

    return view;

  }


  return {

    ...view,

    background:
      {
        ...background,
        ...perPage
      }

  };

}



/* =========================================================
   3. 원본 크기
========================================================== */

const postBackgroundSizeCache =
  new Map();


function postBackgroundNaturalSize(
  url
) {

  const cached =
    postBackgroundSizeCache.get(
      url
    );


  return cached &&
    cached.width
    ? cached
    : null;

}


function loadPostBackgroundImageSize(
  url
) {

  if (!url) {

    return Promise.resolve(
      null
    );

  }


  const cached =
    postBackgroundSizeCache.get(
      url
    );


  if (cached) {

    return cached.promise ||
      Promise.resolve(
        cached
      );

  }


  const promise =
    new Promise(
      resolve => {

        const probe =
          new Image();


        probe.crossOrigin =
          "anonymous";


        probe.onload =
          () => {

            const size =
              {
                width: probe.naturalWidth,
                height: probe.naturalHeight
              };


            postBackgroundSizeCache.set(
              url,
              size
            );


            resolve(
              size
            );

          };


        probe.onerror =
          () => {

            /*
              못 읽은 주소는 캐시에서 지운다 — 다음 렌더에서
              다시 시도할 수 있게(일시적인 네트워크 실패).
            */

            postBackgroundSizeCache.delete(
              url
            );


            resolve(
              null
            );

          };


        probe.src =
          url;

      }
    );


  postBackgroundSizeCache.set(
    url,
    {
      promise
    }
  );


  return promise;

}


/*
  export/분할 계산 전에 배경이 준비될 때까지 기다린다 —
  폰트(document.fonts.ready)·본문 사진과 같은 이유다.
*/

function whenPostBackgroundReady(
  settings = {},
  view = {}
) {

  const background =
    resolvePostBackgroundView(
      settings,
      view
    );


  if (!background.url) {

    return Promise.resolve(
      null
    );

  }


  return loadPostBackgroundImageSize(
    background.url
  );

}



/* =========================================================
   4. export 직전 — 흐림을 이미지에 굽는다

   ★ 왜 필요한가

     html2canvas는 CSS filter를 구현하지 않는다. 화면에서는
     흐린 배경이 저장된 PNG에서만 또렷하게 나온다. 그래서 캡처
     직전에 **흐림이 이미 적용된 이미지**로 바꿔 끼우고, CSS
     filter는 떼어낸다. 캡처가 끝나면 되돌린다.

     캔버스 2D의 ctx.filter를 쓴다. 지원하지 않는 환경(구형
     Safari)에서는 아무 것도 하지 않고 원래대로 둔다 — 배경이
     또렷하게 나올 뿐, export 자체가 실패하지는 않는다.

   ★ 왜 async인가 — 바꿔 끼운 그림이 실릴 때까지 기다려야 한다

     html2canvas는 <img>를 그릴 때 **img.currentSrc**를 읽는다.
     currentSrc는 그 주소를 실제로 다 읽어들인 뒤에야 새 값으로
     바뀐다. src만 갈아 끼우고 곧바로 캡처하면 currentSrc가 아직
     **예전 주소**여서, 화면에서는 흐린데 저장된 PNG만 또렷하게
     나온다(실측으로 확인 — 구운 이미지 자체에는 흐림이 들어 있었다).
     decode()로 새 그림이 준비될 때까지 기다린 뒤에 돌려준다.

   -> restore 함수 (항상 돌려준다)
========================================================== */

async function bakePostBackgroundForCapture(
  page,
  pixelScale
) {

  const noop =
    () => {};


  if (!page) {
    return noop;
  }


  const image =
    page.querySelector(
      `.${POST_BACKGROUND_IMAGE_CLASS}`
    );


  if (!image) {
    return noop;
  }


  const cssFilter =
    image.style.filter ||
    "";


  const blurMatch =
    /blur\(([0-9.]+)px\)/.exec(
      cssFilter
    );


  if (!blurMatch) {
    return noop;
  }


  const blur =
    Number(
      blurMatch[1]
    );


  const originalSrc =
    image.getAttribute(
      "src"
    );


  try {

    const scale =
      Math.min(
        2,
        Math.max(
          1,
          pixelScale ||
          1
        )
      );


    const width =
      Math.max(
        1,
        Math.round(
          image.offsetWidth *
          scale
        )
      );


    const height =
      Math.max(
        1,
        Math.round(
          image.offsetHeight *
          scale
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


    if (
      !context ||
      typeof context.filter !== "string"
    ) {

      return noop;

    }


    context.filter =
      `blur(${blur * scale}px)`;


    context.drawImage(
      image,
      0,
      0,
      width,
      height
    );


    const baked =
      canvas.toDataURL(
        "image/png"
      );


    image.style.filter =
      "";


    image.setAttribute(
      "src",
      baked
    );


    /*
      ★ 새 그림이 준비될 때까지 기다린다(위 머리말의 currentSrc).
      decode()는 지금 src를 다 읽고 디코드했을 때 resolve한다.
    */

    try {

      await image.decode();

    }

    catch (decodeError) {

      /* 못 읽었으면 그냥 진행한다 — 아래 restore가 원래대로 돌린다 */

    }


    return () => {

      image.style.filter =
        cssFilter;


      if (
        originalSrc !== null
      ) {

        image.setAttribute(
          "src",
          originalSrc
        );

      }

    };

  }

  catch (error) {

    console.warn(
      "[posts-canvas-background] 흐림 굽기 실패 — 원본 그대로 캡처합니다.",
      error
    );


    return noop;

  }

}
